import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState, mutate, makeProposal, commitProposal } from './core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.AGRIFLOW_DATA_FILE || path.join(root, 'data', 'state.json');
const host = process.env.AGRIFLOW_HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORTが不正です');
if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('ローカル専用です。AGRIFLOW_HOSTは127.0.0.1を指定してください');
fs.mkdirSync(path.dirname(file), { recursive: true });
let state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : initialState();
const save = next => {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(next, null, 2), { encoding: 'utf8', flag: 'w' });
  fs.renameSync(temp, file);
  state = next;
};
const respond = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
};
const readBody = async req => {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 100000) throw new Error('入力が大きすぎます');
  }
  try { return JSON.parse(data || '{}'); } catch { throw new Error('JSONが不正です'); }
};

const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    const allowedOrigin = `http://${host}:${port}`;
    if (req.headers.host !== `${host}:${port}` && req.headers.host !== `localhost:${port}`) return respond(res,403,{ error:'接続先が許可されていません' });
    if (req.method !== 'GET' && (req.headers.origin && req.headers.origin !== allowedOrigin && req.headers.origin !== `http://localhost:${port}`)) return respond(res,403,{ error:'接続元が許可されていません' });
    if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) return respond(res,415,{ error:'JSON形式のみ受け付けます' });
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'GET' && url.pathname === '/api/state') return respond(res,200,state);
      if (req.method === 'POST' && url.pathname === '/api/entities') {
        const body = await readBody(req);
        const next = mutate(state,body.collection,body.action,body.data ?? {},body.id ?? null);
        save(next); return respond(res,200,next);
      }
      if (req.method === 'POST' && url.pathname === '/api/proposals') {
        const body = await readBody(req);
        const result = makeProposal(state,body.period,body.limitMs ?? 2000);
        save(result.state); return respond(res,200,result.proposal);
      }
      if (req.method === 'POST' && url.pathname === '/api/commit') {
        const body = await readBody(req);
        const result = commitProposal(state,body.proposalId);
        save(result.state); return respond(res,200,result.entry);
      }
      return respond(res,404,{ error:'APIが見つかりません' });
    }
    if (req.method !== 'GET') return respond(res,405,{ error:'操作が許可されていません' });
    const staticFiles = { '/':'index.html', '/app.js':'app.js', '/styles.css':'styles.css' };
    const name = staticFiles[url.pathname];
    if (!name) return respond(res,404,{ error:'ページが見つかりません' });
    const mime = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html';
    res.writeHead(200,{ 'content-type':`${mime}; charset=utf-8`, 'x-content-type-options':'nosniff', 'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'" });
    fs.createReadStream(path.join(root,'public',name)).pipe(res);
  } catch (error) {
    respond(res,400,{ error: error instanceof Error ? error.message : '処理に失敗しました' });
  }
});
server.listen(port,host,()=>console.log(`AgriFlow: http://${host}:${port}`));

