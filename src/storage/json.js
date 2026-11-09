import fs from 'node:fs/promises';
import path from 'node:path';
import { initialState } from '../core.js';
export class JsonRepository {
  constructor(file) { this.file=file; this.queue=Promise.resolve(); }
  async migrate() { await fs.mkdir(path.dirname(this.file),{recursive:true}); }
  async read() { try { return JSON.parse(await fs.readFile(this.file,'utf8')); } catch(e) { if(e.code==='ENOENT')return initialState();throw e; } }
  transaction(fn) {
    const work=this.queue.then(async()=>{
      const {state,result}=await fn(await this.read());
      const temp=`${this.file}.${process.pid}.tmp`;
      await fs.writeFile(temp,JSON.stringify(state,null,2),{flag:'w',mode:0o600});
      await fs.rename(temp,this.file); return result;
    }); this.queue=work.catch(()=>{}); return work;
  }
  async close() { await this.queue; }
}
