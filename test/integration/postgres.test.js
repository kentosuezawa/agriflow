import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { PostgresRepository } from '../../src/storage/postgres.js';
import { createApp } from '../../src/server.js';
import { makeProposal, commitProposal, mutate } from '../../src/core.js';
import { demoState, demoPeriod } from '../../scripts/seed.mjs';
import { validateImport } from '../../src/storage/import-validation.js';

if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required: integration tests never silently skip');
const admin=new pg.Pool({connectionString:process.env.DATABASE_URL});
const name=`agriflow_test_${process.pid}`;
const connection=new URL(process.env.DATABASE_URL); connection.pathname=`/${name}`;
let repo;
test.before(async()=>{await admin.query(`CREATE DATABASE ${name}`);repo=new PostgresRepository(connection.href);await repo.migrate();});
test.after(async()=>{if(repo)await repo.close();await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);await admin.end();});
async function reset() {
  await repo.pool.query('TRUNCATE committed,proposals,predecessors,blocked,operations,fields,workers,machines');
  await repo.pool.query("UPDATE farm_state SET revision=0,name='模擬農場'");
}
test('PF-07/08: import preserves full JSON including snapshots and history; refuses nonempty target',async()=>{
  await reset();let state=demoState();
  const p=makeProposal(state,demoPeriod,2000); state=commitProposal(p.state,p.proposal.id).state;
  validateImport(state); await repo.importState(state);
  assert.deepEqual(await repo.read(),state);
  await assert.rejects(repo.importState(state),/空ではありません/);
  const reopened=new PostgresRepository(connection.href);
  try {await reopened.migrate();assert.deepEqual(await reopened.read(),state);}finally{await reopened.close();}
});
test('PF-07: foreign-key violation rolls back all current entities and revision',async()=>{
  const before=await repo.read();
  await assert.rejects(repo.transaction(current=>{current.revision++;current.operations[0].fieldId='missing';return {state:current,result:null};}),e=>e.code==='23503');
  assert.deepEqual(await repo.read(),before);
});
test('PF-07: concurrent approval produces one immutable committed version',async()=>{
  await reset();await repo.importState(demoState());
  const current=await repo.read(),p=makeProposal(current,demoPeriod,2000);
  await repo.transaction(()=>({state:p.state,result:p.proposal}));
  const approve=()=>repo.transaction(s=>{const c=commitProposal(s,p.proposal.id);return {state:c.state,result:c.entry};});
  const results=await Promise.allSettled([approve(),approve()]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  const after=await repo.read();assert.equal(after.committed.length,1);assert.deepEqual(after.committed[0].snapshot,p.proposal.snapshot);
});
test('PF-05: SC-004 absence/replan retains v1 until approval and after v2',async()=>{
  let before=await repo.read(); const v1=structuredClone(before.committed[0]);
  await repo.transaction(s=>({state:mutate(s,'workers','update',{...s.workers[0],availability:[]},s.workers[0].id),result:null}));
  const s=await repo.read(),p=makeProposal(s,demoPeriod,2000);
  await repo.transaction(()=>({state:p.state,result:p.proposal}));
  assert.deepEqual((await repo.read()).committed,[v1]);
  await repo.transaction(current=>{const c=commitProposal(current,p.proposal.id);return {state:c.state,result:c.entry};});
  const after=await repo.read();assert.equal(after.committed.length,2);assert.deepEqual(after.committed[0],v1);
});
test('PF-07: failed approval write rolls back and leaves previous committed history unchanged',async()=>{
  const state=await repo.read(),p=makeProposal(state,demoPeriod,2000);
  await repo.transaction(()=>({state:p.state,result:null}));const before=await repo.read();
  await repo.pool.query('ALTER TABLE committed ADD CONSTRAINT injected_failure CHECK(version < 3) NOT VALID');
  try {
    await assert.rejects(repo.transaction(s=>{const c=commitProposal(s,p.proposal.id);return {state:c.state,result:c.entry};}),e=>e.code==='23514');
    assert.deepEqual(await repo.read(),before);
  }finally{await repo.pool.query('ALTER TABLE committed DROP CONSTRAINT injected_failure');}
});
test('PF-06: HTTP validates input/origin; stale commit is 409 and storage failure is safe 500',async()=>{
  const server=await createApp({repository:repo,publicOrigin:'http://127.0.0.1:3141',logger:()=>{}});
  await new Promise(resolve=>server.listen(3141,'127.0.0.1',resolve));
  const base='http://127.0.0.1:3141';
  const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  try {
    assert.equal((await post('/api/entities',null)).status,400);
    assert.equal((await post('/api/entities',{}, {origin:'https://example.com'})).status,403);
    assert.equal((await post('/api/entities',{collection:'operations',action:'create',data:{predecessors:'bad'}})).status,400);
    const state=await repo.read();
    assert.equal((await post('/api/commit',{proposalId:state.committed[0].id})).status,409);
    const original=repo.transaction.bind(repo);repo.transaction=async()=>{throw new Error('/private/path/password');};
    const response=await post('/api/entities',{collection:'farm',action:'update',data:{name:'x'}});
    repo.transaction=original;
    assert.equal(response.status,500);const text=await response.text();assert.ok(!text.includes('private'));assert.ok(text.includes('INTERNAL_ERROR'));
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test('PF-06/07: API collection limits reject excess without revision change',async()=>{
  await reset();const state=demoState();
  state.operations=Array.from({length:20},(_,i)=>({...state.operations[0],id:`operation-${i}`,predecessors:[]}));
  await repo.importState(state);
  assert.throws(()=>mutate(state,'operations','create',{...state.operations[0],name:'21st'}),/上限/);
  assert.throws(()=>validateImport({...state,revision:-1}));
  const forged=structuredClone(state);forged.operations[0].fieldId='absent';assert.throws(()=>validateImport(forged));
});
