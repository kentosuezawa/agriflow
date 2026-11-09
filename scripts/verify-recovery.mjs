import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const origin=process.env.PUBLIC_ORIGIN||'http://127.0.0.1:3000';
const compose=(args,options={})=>execFileSync('docker',['compose',...args],{...options});
const read=async()=>{let last;for(let i=0;i<10;i++){try{const r=await fetch(`${origin}/api/state`,{headers:{connection:'close'},signal:AbortSignal.timeout(3000)});if(!r.ok)throw new Error('App must be healthy before recovery verification');return await r.json();}catch(e){last=e;await new Promise(resolve=>setTimeout(resolve,200));}}throw last;};
const before=await read();
const backup=compose(['exec','-T','db','pg_dump','-U','agriflow','-d','agriflow','-Fc']);
await fs.mkdir('data',{recursive:true});const backupFile=`data/recovery-${Date.now()}.dump`;await fs.writeFile(backupFile,backup,{flag:'wx',mode:0o600});
compose(['up','-d','--force-recreate','--wait'],{stdio:'inherit'});assert.deepEqual(await read(),before);
const name=`agriflow_recovery_${randomBytes(6).toString('hex')}`;
compose(['exec','-T','db','createdb','-U','agriflow',name]);
try {
  compose(['exec','-T','db','pg_restore','-U','agriflow','--no-owner','-d',name],{input:backup});
  const code=`import {PostgresRepository} from './src/storage/postgres.js';const u=new URL(process.env.DATABASE_URL);u.pathname='/${name}';const r=new PostgresRepository(u.href);try{await r.migrate();console.log(JSON.stringify(await r.read()));}finally{await r.close();}`;
  const after=JSON.parse(compose(['exec','-T','app','node','--input-type=module','-e',code]).toString());assert.deepEqual(after,before);
}finally{compose(['exec','-T','db','dropdb','-U','agriflow',name]);}
const report={containerRecreation:'pass (app and db recreated with named volume retained)',backupRestore:'pass (pg_dump custom -> fresh DB -> full state equality)',counts:{operations:before.operations.length,proposals:before.proposals.length,committed:before.committed.length},backupBytes:backup.length,backupSha256:createHash('sha256').update(backup).digest('hex'),sourcePreserved:true};
await fs.mkdir('docs/testing',{recursive:true});await fs.writeFile('docs/testing/recovery.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
