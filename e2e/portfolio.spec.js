import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
async function reset(request) {
  if(process.env.E2E_URL && process.env.E2E_ALLOW_RESET!=='1')throw new Error('External E2E target must be disposable; explicitly set E2E_ALLOW_RESET=1');
  const get=async()=> (await request.get('/api/state')).json();
  let s=await get();
  const remove=async(collection,id)=>{const r=await request.post('/api/entities',{data:{collection,action:'delete',id}});expect(r.ok()).toBeTruthy();};
  while(s.operations.length){const x=s.operations.find(x=>!s.operations.some(y=>y.predecessors.includes(x.id)));expect(x).toBeTruthy();await remove('operations',x.id);s=await get();}
  for(const collection of ['blocked','machines','workers','fields'])for(const x of s[collection])await remove(collection,x.id);
  // Existing history is immutable. It may remain, but test compares its exact prefix.
}
for(const width of [390,1440])test(`PF-04/05/09: ${width}px absence -> diff -> approval -> history`,async({page,request})=>{
  await reset(request);
  const create=async(collection,data)=>{const r=await request.post('/api/entities',{data:{collection,action:'create',data}});expect(r.ok()).toBeTruthy();return r.json();};
  const period={start:'2026-11-02T00:00:00Z',end:'2026-11-02T08:00:00Z'};
  let s=await create('fields',{name:'東の圃場（模擬）'});const f1=s.fields.at(-1).id;
  s=await create('fields',{name:'西の圃場（模擬）'});const f2=s.fields.at(-1).id;
  s=await create('workers',{name:'担当A（模擬）',availability:[period]});const worker=s.workers.at(-1);
  s=await create('workers',{name:'担当B（模擬）',availability:[period]});
  s=await create('machines',{name:'トラクター1（模擬）',type:'tractor',availability:[period]});
  const ops=[];
  for(const [name,fieldId,machineType]of [['東の整地',f1,'tractor'],['西の整地',f2,'tractor'],['東の播種',f1,null],['西の播種',f2,null]]){
    s=await create('operations',{name,fieldId,machineType,duration:2,earliest:period.start,deadline:period.end,predecessors:ops.length>=2?ops.slice(0,2):[]});ops.push(s.operations.at(-1).id);
  }
  const old=structuredClone(s.committed), oldCount=old.length;
  await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#resource-summary')).toContainText('作業 4');
  await page.getByRole('button',{name:'3 · 計画と比較'}).click();
  await expect(page.locator('#plan-form [name="start"]')).toHaveValue('2026-11-02T09:00');
  await page.locator('#plan-form [name="start"]').focus();
  let reachedEnd=false;const generate=page.getByRole('button',{name:'候補を生成',exact:true});
  for(let i=0;i<30;i++){
    if(await page.locator('#plan-form [name="end"]').evaluate(el=>el===document.activeElement))reachedEnd=true;
    if(await generate.evaluate(el=>el===document.activeElement))break;
    await page.keyboard.press('Tab');
  }
  expect(reachedEnd).toBeTruthy();await expect(generate).toBeFocused();await page.keyboard.press('Enter');
  await expect(page.locator('#proposal .status')).toHaveText('OPTIMAL');
  await expect(page.locator('.timeline svg')).toBeVisible();
  await page.getByRole('button',{name:'この候補を承認して確定'}).click();
  await expect(page.locator('#current-version')).toHaveText(`v${oldCount+1}`);
  const v1=structuredClone((await (await request.get('/api/state')).json()).committed);
  await page.getByRole('button',{name:'1 · 基礎データ'}).click();
  await page.locator('#workers-list .record').filter({hasText:'担当A（模擬）'}).getByRole('button',{name:'編集',exact:true}).click();
  const form=page.locator('form[data-collection="workers"]');await form.locator('[name="availability"]').fill('');await form.getByRole('button',{name:'変更を保存'}).click();
  await expect(page.locator('#workers-list')).toContainText('担当A（模擬）');
  await page.getByRole('button',{name:'3 · 計画と比較'}).click();
  await expect(page.getByRole('button',{name:'この候補を承認して確定'})).toBeDisabled();
  await page.getByRole('button',{name:'候補を生成',exact:true}).click();
  await expect(page.locator('#proposal .status')).toHaveText('OPTIMAL');
  await expect(page.locator('#proposal .diff').first()).toBeVisible();
  expect((await (await request.get('/api/state')).json()).committed).toEqual(v1);
  if(process.env.E2E_SCREENSHOTS==='1') {await fs.mkdir('docs/screenshots',{recursive:true});await page.screenshot({path:`docs/screenshots/replan-${width}.png`,fullPage:true});}
  await page.getByRole('button',{name:'この候補を承認して確定'}).click();
  await expect(page.locator('#current-version')).toHaveText(`v${oldCount+2}`);
  const after=await (await request.get('/api/state')).json();expect(after.committed.slice(0,-1)).toEqual(v1);expect(after.committed.slice(0,oldCount)).toEqual(old);
  expect(after.committed.at(-1).assignments.every(x=>x.workerId!==worker.id)).toBeTruthy();
  await page.getByRole('button',{name:'履歴',exact:true}).click();await expect(page.locator('#history-list')).toContainText(`確定版 v${oldCount+1}`);
  await page.reload();await expect(page.locator('#current-version')).toHaveText(`v${oldCount+2}`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});
