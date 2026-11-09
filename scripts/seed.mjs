import { initialState, mutate } from '../src/core.js';
import { PostgresRepository } from '../src/storage/postgres.js';
import fs from 'node:fs/promises';
export const demoPeriod={start:'2026-11-02T00:00:00Z',end:'2026-11-02T08:00:00Z'};
export function demoState() {
  let s=initialState(); s=mutate(s,'farm','update',{name:'デモ農場（すべて模擬データ）'});
  for(const name of ['東の圃場（模擬）','西の圃場（模擬）'])s=mutate(s,'fields','create',{name});
  for(const name of ['担当A（模擬）','担当B（模擬）'])s=mutate(s,'workers','create',{name,availability:[demoPeriod]});
  s=mutate(s,'machines','create',{name:'トラクター1（模擬）',type:'tractor',availability:[demoPeriod]});
  const names=['東の整地','西の整地','東の播種','西の播種'];
  for(let i=0;i<4;i++)s=mutate(s,'operations','create',{name:names[i],fieldId:s.fields[i%2].id,duration:2,earliest:demoPeriod.start,deadline:demoPeriod.end,machineType:i<2?'tractor':null,predecessors:i>=2?[s.operations[0].id,s.operations[1].id]:[]});
  return s;
}
if(process.argv[1] && new URL(import.meta.url).pathname===process.argv[1]) {
  const state=demoState();
  if(process.argv.includes('--json')) {
    const file=process.env.AGRIFLOW_DATA_FILE;
    if(!file)throw new Error('AGRIFLOW_DATA_FILE must point to a new demo file');
    await fs.writeFile(file,JSON.stringify(state,null,2),{flag:'wx',mode:0o600});
  }else {
    if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
    const repository=new PostgresRepository(process.env.DATABASE_URL);
    try {await repository.migrate();await repository.importState(state);} finally{await repository.close();}
  }
  console.log('模擬データを空の保存先へ投入しました。期間は2026-11-02 09:00〜17:00 JSTです。');
}
