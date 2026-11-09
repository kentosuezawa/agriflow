import { parentPort, workerData } from 'node:worker_threads';
import { solve } from '../dist/solve.js';
try { parentPort.postMessage({result:solve(workerData.snapshot,workerData.period,workerData.options)}); }
catch(e) { parentPort.postMessage({error:e.name==='InputError'?e.message:null}); }
