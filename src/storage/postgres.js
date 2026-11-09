import pg from 'pg';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import { AppError } from '../errors.js';
const iso = value => new Date(value).toISOString().replace('.000Z','Z');
export class PostgresRepository {
  constructor(connectionString) { this.pool=new pg.Pool({connectionString,max:5,connectionTimeoutMillis:5000}); this.pool.on('error',()=>console.error(JSON.stringify({event:'database_connection_error'}))); }
  async migrate() {
    const c=await this.pool.connect();
    try {
      await c.query('BEGIN'); await c.query('SELECT pg_advisory_xact_lock(739021)');
      const exists=await c.query("SELECT to_regclass('public.schema_migrations') AS name");
      if (!exists.rows[0].name) await c.query(await fs.readFile(new URL('../../migrations/001-initial.sql',import.meta.url),'utf8'));
      const versions=await c.query('SELECT version FROM schema_migrations ORDER BY version');
      if (versions.rows.length!==1 || versions.rows[0].version!==1) throw new Error('Unsupported schema version');
      await c.query('COMMIT');
    } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  async load(c) {
    const {rows:[farm]}=await c.query('SELECT * FROM farm_state WHERE singleton=1');
    const result={revision:farm.revision,farm:{name:farm.name}};
    result.fields=(await c.query('SELECT id,name FROM fields ORDER BY ordinal')).rows;
    result.workers=(await c.query('SELECT id,name,availability FROM workers ORDER BY ordinal')).rows;
    result.machines=(await c.query('SELECT id,name,type,availability FROM machines ORDER BY ordinal')).rows;
    const predecessors=(await c.query('SELECT * FROM predecessors ORDER BY ordinal')).rows;
    result.operations=(await c.query('SELECT * FROM operations ORDER BY ordinal')).rows.map(x=>({id:x.id,name:x.name,fieldId:x.field_id,duration:x.duration,earliest:iso(x.earliest),deadline:iso(x.deadline),machineType:x.machine_type,predecessors:predecessors.filter(p=>p.operation_id===x.id).map(p=>p.predecessor_id)}));
    result.blocked=(await c.query('SELECT * FROM blocked ORDER BY ordinal')).rows.map(x=>({id:x.id,fieldId:x.field_id,start:iso(x.start_time),end:iso(x.end_time)}));
    result.proposals=(await c.query('SELECT document FROM proposals ORDER BY ordinal')).rows.map(x=>x.document);
    result.committed=(await c.query('SELECT document FROM committed ORDER BY version')).rows.map(x=>x.document);
    return result;
  }
  async read() {
    const c=await this.pool.connect();
    try { await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); const s=await this.load(c); await c.query('COMMIT'); return s; }
    catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  async persist(c,next) {
    // Current entities are small (<=100 per resource). History is append-only.
    await c.query('DELETE FROM predecessors'); await c.query('DELETE FROM blocked'); await c.query('DELETE FROM operations');
    await c.query('DELETE FROM fields'); await c.query('DELETE FROM workers'); await c.query('DELETE FROM machines');
    await c.query('UPDATE farm_state SET revision=$1,name=$2 WHERE singleton=1',[next.revision,next.farm.name]);
    for (const [i,x] of next.fields.entries()) await c.query('INSERT INTO fields VALUES($1,$2,$3)',[x.id,i,x.name]);
    for (const [i,x] of next.workers.entries()) await c.query('INSERT INTO workers VALUES($1,$2,$3,$4)',[x.id,i,x.name,JSON.stringify(x.availability)]);
    for (const [i,x] of next.machines.entries()) await c.query('INSERT INTO machines VALUES($1,$2,$3,$4,$5)',[x.id,i,x.name,x.type,JSON.stringify(x.availability)]);
    for (const [i,x] of next.operations.entries()) await c.query('INSERT INTO operations VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[x.id,i,x.fieldId,x.name,x.duration,x.earliest,x.deadline,x.machineType]);
    for (const x of next.operations) for (const [i,p] of x.predecessors.entries()) await c.query('INSERT INTO predecessors VALUES($1,$2,$3)',[x.id,p,i]);
    for (const [i,x] of next.blocked.entries()) await c.query('INSERT INTO blocked VALUES($1,$2,$3,$4,$5)',[x.id,i,x.fieldId,x.start,x.end]);
    for (const [i,x] of next.proposals.entries()) await c.query('INSERT INTO proposals VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING',[x.id,i,x.baseRevision,x.baseVersion,x.status,x.createdAt,JSON.stringify(x)]);
    for (const x of next.committed) await c.query('INSERT INTO committed VALUES($1,$2,$3,$4) ON CONFLICT(version) DO NOTHING',[x.version,x.id,x.committedAt,JSON.stringify(x)]);
  }
  async transaction(fn) {
    const c=await this.pool.connect();
    try {
      await c.query('BEGIN'); await c.query('SELECT singleton FROM farm_state WHERE singleton=1 FOR UPDATE');
      const current=await this.load(c); const {state,result}=await fn(structuredClone(current));
      for(const key of ['proposals','committed']) {
        if(state[key].length<current[key].length || current[key].some((entry,i)=>!isDeepStrictEqual(entry,state[key][i]))) throw new Error('History must be append-only');
      }
      await this.persist(c,state); await c.query('COMMIT'); return result;
    } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  async importState(state) {
    return this.transaction(current=>{
      if(current.revision || current.fields.length || current.proposals.length || current.committed.length || current.workers.length || current.operations.length || current.machines.length || current.blocked.length) throw new AppError(409,'NOT_EMPTY','移行先DBが空ではありません');
      return {state,result:state};
    });
  }
  async close() { await this.pool.end(); }
}
