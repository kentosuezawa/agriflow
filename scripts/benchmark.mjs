import os from 'node:os';
import { solve } from '../dist/solve.js';
import { validatePlan } from '../dist/verify.js';
import { t } from '../test/fixtures.js';

const period = {start:t(0),end:t(336)};
const snapshot = {
  farm: {name:'負荷測定用模擬農場'},
  fields: Array.from({length:5},(_,i)=>({id:`F${i}`,name:`模擬圃場${i}`})),
  workers: Array.from({length:3},(_,i)=>({id:`W${i}`,name:`模擬作業員${i}`,availability:[period]})),
  machines: Array.from({length:2},(_,i)=>({id:`M${i}`,name:`模擬農機${i}`,type:'tractor',availability:[period]})),
  blocked: [],
  operations: Array.from({length:20},(_,i)=>({id:`O${i}`,name:`模擬作業${i}`,fieldId:`F${i%5}`,duration:2,earliest:t(0),deadline:t(336),machineType:'tractor',predecessors:[]})),
};
const before=process.memoryUsage().rss, start=performance.now();
const result=solve(snapshot,period);
console.log(JSON.stringify({
  environment:{node:process.version,os:`${os.platform()} ${os.release()}`,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem()},
  workload:{operations:20,fields:5,workers:3,machines:2,days:7,slotMinutes:30,limitMs:2000,maxNodes:300000},
  result:{...result,assignments:undefined},wallMs:performance.now()-start,
  rssBeforeBytes:before,rssAfterBytes:process.memoryUsage().rss,
  independentlyValid:result.assignments.length>0?validatePlan(snapshot,result.assignments,period):null,
  note:'Single synthetic run; RSS is not peak memory; HTTP/API latency is not measured.'
},null,2));
