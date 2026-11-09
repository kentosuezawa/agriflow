import { Worker } from 'node:worker_threads';
import { AppError } from './errors.js';
export function compute(snapshot,period,limitMs=2000) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./solver-worker.js',import.meta.url),{workerData:{snapshot,period,options:{limitMs}}});
    const timer=setTimeout(()=>{worker.terminate();reject(new AppError(503,'COMPUTE_TIMEOUT','計算処理を終了しました。条件を減らして再試行してください'));},15000);
    worker.once('message',message=>{
      clearTimeout(timer); worker.terminate();
      if('result' in message) resolve(message.result);
      else reject(message.error ? new AppError(400,'INVALID_INPUT',message.error):new AppError(500,'INTERNAL_ERROR','計算に失敗しました'));
    });
    worker.once('error',()=>{clearTimeout(timer);reject(new AppError(500,'INTERNAL_ERROR','計算に失敗しました'));});
    worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(new AppError(500,'INTERNAL_ERROR','計算が中断されました'));});
  });
}
