import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mutate, commitProposal } from './core.js';
import { AppError, inputFailure } from './errors.js';
import { compute } from './compute.js';
import { JsonRepository } from './storage/json.js';
import { PostgresRepository } from './storage/postgres.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function createApp({repository,publicOrigin='http://127.0.0.1:3000',logger=console.error}={}) {
  let computing=false;
  const origin=new URL(publicOrigin);
  if(origin.protocol!=='http:' || !['127.0.0.1','localhost'].includes(origin.hostname))throw new Error('Local origin required');
  const origins=new Set([origin.origin,`http://localhost:${origin.port||80}`,`http://127.0.0.1:${origin.port||80}`]);
  const hosts=new Set([...origins].map(x=>new URL(x).host));
  const respond=(res,status,payload)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(payload));};
  async function readBody(req) {
    let size=0; const chunks=[];
    for await(const chunk of req) {size+=chunk.length;if(size>100000)throw new AppError(413,'BODY_TOO_LARGE','入力が大きすぎます');chunks.push(chunk);}
    let body;try {body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch {throw new AppError(400,'INVALID_JSON','JSONが不正です');}
    if(!body || typeof body!=='object' || Array.isArray(body))throw new AppError(400,'INVALID_INPUT','入力はオブジェクトで指定してください');
    return body;
  }
  return http.createServer(async(req,res)=>{
    try {
      if(!hosts.has(req.headers.host))throw new AppError(403,'FORBIDDEN_HOST','接続先が許可されていません');
      if(req.method!=='GET' && req.headers.origin && !origins.has(req.headers.origin))throw new AppError(403,'FORBIDDEN_ORIGIN','接続元が許可されていません');
      if(req.method==='POST' && req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new AppError(415,'JSON_REQUIRED','JSON形式のみ受け付けます');
      const url=new URL(req.url,origin);
      if(req.method==='GET' && url.pathname==='/api/health') {await repository.read();return respond(res,200,{status:'ok',storage:repository instanceof PostgresRepository?'postgres':'json'});}
      if(req.method==='GET' && url.pathname==='/api/state')return respond(res,200,await repository.read());
      if(req.method==='POST' && url.pathname==='/api/entities') {
        const body=await readBody(req);
        const next=await repository.transaction(current=>{
          let state;try{state=mutate(current,body.collection,body.action,body.data,body.id??null);}catch(e){throw inputFailure(e);}
          return {state,result:state};
        });return respond(res,200,next);
      }
      if(req.method==='POST' && url.pathname==='/api/proposals') {
        const body=await readBody(req);
        if(computing)throw new AppError(409,'COMPUTE_BUSY','計算中です。完了を待ってください');
        computing=true;
        try {
          const current=await repository.read();
          const snapshot=structuredClone(Object.fromEntries(['farm','fields','workers','machines','operations','blocked'].map(k=>[k,current[k]])));
          const result=await compute(snapshot,body.period,body.limitMs??2000);
          const proposal={id:randomUUID(),createdAt:new Date().toISOString(),baseRevision:current.revision,baseVersion:current.committed.length,period:body.period,snapshot,...result};
          await repository.transaction(state=>{
            if(state.revision!==current.revision || state.committed.length!==current.committed.length)throw new AppError(409,'STALE_PROPOSAL','入力または確定版が変更されました。再計画してください');
            state.proposals.push(proposal);return {state,result:proposal};
          });return respond(res,200,proposal);
        }finally{computing=false;}
      }
      if(req.method==='POST' && url.pathname==='/api/commit') {
        const body=await readBody(req);
        const entry=await repository.transaction(current=>{
          let result;try{result=commitProposal(current,body.proposalId);}catch(e){if(e.message.includes('変更されています'))throw new AppError(409,'STALE_PROPOSAL',e.message);throw inputFailure(e);}
          return {state:result.state,result:result.entry};
        });return respond(res,200,entry);
      }
      if(url.pathname.startsWith('/api/'))throw new AppError(404,'NOT_FOUND','APIが見つかりません');
      if(req.method!=='GET')throw new AppError(405,'METHOD_NOT_ALLOWED','操作が許可されていません');
      const name=({'/':'index.html','/app.js':'app.js','/styles.css':'styles.css'})[url.pathname];
      if(!name)throw new AppError(404,'NOT_FOUND','ページが見つかりません');
      const content=await fs.promises.readFile(path.join(root,'public',name));
      res.writeHead(200,{'content-type':`${name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'}; charset=utf-8`,'x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"});res.end(content);
    }catch(e){
      const error=e instanceof AppError ? e : new AppError(500,'INTERNAL_ERROR','処理に失敗しました。データを確認して再試行してください');
      if(!(e instanceof AppError))logger(JSON.stringify({event:'request_failed',code:'INTERNAL_ERROR'}));
      respond(res,error.status,{code:error.code,error:error.message,message:error.message});
    }
  });
}
async function main() {
  const port=Number(process.env.PORT||3000),host=process.env.AGRIFLOW_HOST||'127.0.0.1';
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
  if(!['127.0.0.1','localhost'].includes(host) && !(host==='0.0.0.0' && process.env.AGRIFLOW_CONTAINER==='1'))throw new Error('Local host required');
  const repository=process.env.DATABASE_URL ? new PostgresRepository(process.env.DATABASE_URL):new JsonRepository(process.env.AGRIFLOW_DATA_FILE||path.join(root,'data','state.json'));
  await repository.migrate();
  const server=await createApp({repository,publicOrigin:process.env.PUBLIC_ORIGIN||`http://127.0.0.1:${port}`});
  server.listen(port,host,()=>console.log(`AgriFlow: ${process.env.PUBLIC_ORIGIN||`http://127.0.0.1:${port}`}`));
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(async()=>{await repository.close();process.exit(0);}));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('AgriFlow startup failed. Check local database and configuration.');process.exitCode=1;});
