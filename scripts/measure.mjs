import os from 'node:os';
import pg from 'pg';
import { PostgresRepository } from '../src/storage/postgres.js';
import { solve } from '../dist/solve.js';
import { validatePlan } from '../dist/verify.js';
import { t } from '../test/fixtures.js';
import { createApp } from '../src/server.js';
import { demoState } from './seed.mjs';
const period={start:t(0),end:t(336)};
const snapshot={farm:{name:'負荷測定用模擬農場'},fields:Array.from({length:5},(_,i)=>({id:`F${i}`,name:`模擬圃場${i}`})),workers:Array.from({length:3},(_,i)=>({id:`W${i}`,name:`模擬作業員${i}`,availability:[period]})),machines:Array.from({length:2},(_,i)=>({id:`M${i}`,name:`模擬農機${i}`,type:'tractor',availability:[period]})),blocked:[],operations:Array.from({length:20},(_,i)=>({id:`O${i}`,name:`模擬作業${i}`,fieldId:`F${i%5}`,duration:2,earliest:t(0),deadline:t(336),machineType:'tractor',predecessors:[]}))};
const env={node:process.version,os:`${os.platform()} ${os.release()}`,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem()};
const samples=[];
for(let i=0;i<5;i++){
  const before=process.memoryUsage().rss,start=performance.now();const result=solve(snapshot,period);
  samples.push({wallMs:performance.now()-start,rssBefore:before,rssAfter:process.memoryUsage().rss,nodes:result.nodes,status:result.status,termination:result.termination,valid:validatePlan(snapshot,result.assignments,period)});
}
// Probe actual HTTP scheduling responsiveness; use a temporary PostgreSQL database when configured.
const state={...demoState(),...snapshot,revision:1,proposals:[],committed:[]};let current=state;
let repository={read:async()=>structuredClone(current),transaction:async fn=>{const x=await fn(structuredClone(current));current=x.state;return x.result;}};
let admin,dbName;
if(process.env.DATABASE_URL){admin=new pg.Pool({connectionString:process.env.DATABASE_URL});dbName=`agriflow_measure_${process.pid}`;await admin.query(`CREATE DATABASE ${dbName}`);const url=new URL(process.env.DATABASE_URL);url.pathname=`/${dbName}`;repository=new PostgresRepository(url.href);await repository.migrate();await repository.importState(state);}
const app=await createApp({repository,publicOrigin:'http://127.0.0.1:3142'});await new Promise(resolve=>app.listen(3142,'127.0.0.1',resolve));
const probes=[];
try {
  for(let i=0;i<5;i++){
    const start=performance.now();const request=fetch('http://127.0.0.1:3142/api/proposals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({period})});
    await new Promise(resolve=>setTimeout(resolve,100));
    const apiStart=performance.now();const response=await fetch('http://127.0.0.1:3142/api/state');await response.json();const stateMs=performance.now()-apiStart;
    const result=await (await request).json();probes.push({proposalWallMs:performance.now()-start,stateDuringComputeMs:stateMs,stateStatus:response.status,resultStatus:result.status});
  }
}finally{await new Promise(resolve=>app.close(resolve));if(admin){await repository.close();await admin.query(`DROP DATABASE ${dbName} WITH (FORCE)`);await admin.end();}}
console.log(JSON.stringify({environment:env,workload:{operations:20,fields:5,workers:3,machines:2,days:7,slotMinutes:30,limitMs:2000,maxNodes:300000},conditions:'Five sequential runs, no explicit warmup; RSS before/after is not peak; HTTP probes use actual app+worker; database mode is recorded separately.',storage:process.env.DATABASE_URL?'postgres':'memory',solver:samples,http:probes},null,2));
