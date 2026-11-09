const $ = selector => document.querySelector(selector);
const api = async (path, body) => {
  const response = await fetch(path,{ method: body ? 'POST' : 'GET', headers:{ 'content-type':'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '通信に失敗しました');
  return result;
};
let state, selectedProposal = null;
const node = (tag, content = '', className = '') => { const el = document.createElement(tag); el.textContent = content; if (className) el.className = className; return el; };
const local = iso => iso ? new Date(iso).toLocaleString('ja-JP',{ timeZone:'Asia/Tokyo', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit' }) : '—';
const toUtc = value => { if (!value) throw new Error('日時を入力してください'); const d = new Date(`${value}:00+09:00`); if (!Number.isFinite(d.valueOf())) throw new Error('日時が不正です'); return d.toISOString().replace('.000Z','Z'); };
const show = message => { $('#message').textContent = message; if (message) window.scrollTo({top:0,behavior:'smooth'}); };
let busy=false;
const run = async action => {
  if(busy)return; busy=true; const buttons=[...document.querySelectorAll('button')].map(el=>[el,el.disabled]);
  buttons.forEach(([el])=>el.disabled=true); document.body.setAttribute('aria-busy','true');
  try { show('処理中です…'); await action(); if($('#message').textContent==='処理中です…')show(''); }
  catch(error) { show(error.message); $('#message').focus(); }
  finally { busy=false; buttons.forEach(([el,disabled])=>el.disabled=disabled); document.body.setAttribute('aria-busy','false'); }
};
const nameOf = (collection,id,snapshot=state) => snapshot[collection].find(x => x.id === id)?.name || '不明';
const availability = value => !value.trim()?[]:value.trim().split(/\n+/).map(line => {
  const [start,end,...extra] = line.split(',').map(x => x.trim());
  if (!start || !end || extra.length) throw new Error('稼働時間は1行に開始,終了を入力してください');
  return { start:toUtc(start),end:toUtc(end) };
});
function option(select,value,label) { const el=node('option',label); el.value=value; select.append(el); }
const inputTime = iso => iso ? new Date(Date.parse(iso)+9*60*60*1000).toISOString().slice(0,16) : '';
function renderOptions() {
  document.querySelectorAll('select[name="fieldId"]').forEach(select => { select.replaceChildren(); option(select,'','選択してください'); state.fields.forEach(x=>option(select,x.id,x.name)); });
  const machine=$('select[name="machineType"]'); machine.replaceChildren(); option(machine,'','不要');
  [...new Set(state.machines.map(x=>x.type))].forEach(x=>option(machine,x,x));
  const predecessor=$('select[name="predecessor"]'); const chosen=[...predecessor.selectedOptions].map(x=>x.value); predecessor.replaceChildren(); state.operations.forEach(x=>option(predecessor,x.id,x.name)); for(const x of predecessor.options)x.selected=chosen.includes(x.value);
}
function record(container,title,detail,onEdit,onDelete) {
  const row=node('div','','record'), left=node('div'); left.append(node('strong',title),node('small',detail));
  const actions=node('div');
  const edit=node('button','編集','secondary'); edit.type='button'; edit.addEventListener('click',onEdit);
  const button=node('button','削除','danger'); button.type='button'; button.addEventListener('click',onDelete);
  actions.append(edit,button); row.append(left,actions); container.append(row);
}
function editRecord(collection,item) {
  const form=document.querySelector(`form[data-collection="${collection}"]`);
  form.dataset.editId=item.id;
  for (const input of form.elements) {
    if (!input.name) continue;
    if (input.name==='availability') input.value=item.availability.map(x=>`${inputTime(x.start)},${inputTime(x.end)}`).join('\n');
    else if (['earliest','deadline','start','end'].includes(input.name)) input.value=inputTime(item[input.name]);
    else if (input.name==='predecessor') { for (const choice of input.options) choice.selected=item.predecessors.includes(choice.value); }
    else input.value=item[input.name] ?? '';
  }
  form.querySelector('button.primary').textContent='変更を保存';
  document.querySelector(`.tabs button[data-tab="${collection==='fields'||collection==='workers'||collection==='machines'?'setup':'tasks'}"]`).click();
  form.scrollIntoView({behavior:'smooth',block:'center'});
}
function renderRecords() {
  for (const collection of ['fields','workers','machines','operations','blocked']) {
    const container=$(`#${collection}-list`); container.replaceChildren();
    for (const x of state[collection]) {
      let title=x.name || nameOf('fields',x.fieldId);
      let detail='';
      if (collection==='workers'||collection==='machines') detail=`${x.type ? `${x.type} · ` : ''}${x.availability.map(a=>`${local(a.start)}〜${local(a.end)}`).join(' / ')}`;
      if (collection==='operations') detail=`${nameOf('fields',x.fieldId)} · ${x.duration*30}分 · ${local(x.earliest)}〜${local(x.deadline)}${x.machineType ? ` · ${x.machineType}` : ''}${x.predecessors.length ? ` · 先行: ${x.predecessors.map(p=>nameOf('operations',p)).join(', ')}` : ''}`;
      if (collection==='blocked') detail=`${local(x.start)}〜${local(x.end)}`;
      record(container,title,detail,()=>editRecord(collection,x),()=>run(async()=>{
        if (!confirm(`${title}を削除しますか？`)) return;
        state=await api('/api/entities',{collection,action:'delete',id:x.id}); render();
      }));
    }
    if (!state[collection].length) container.append(node('small','登録はありません'));
  }
}
function assignmentTable(assignments,snapshot) {
  const scroll=node('div','','table-scroll'); scroll.tabIndex=0; scroll.setAttribute('role','region'); scroll.setAttribute('aria-label','割当一覧（横スクロール可）');
  const table=node('table','','assignments'); const caption=node('caption','作業ごとの割当 · 日本時間');table.append(caption);
  const head=node('thead'), header=node('tr');for(const label of ['作業 / 圃場','開始 → 終了（JST）','担当者 / 農機']){const th=node('th',label);th.scope='col';header.append(th);}head.append(header);table.append(head);
  const body=node('tbody');
  for(const a of [...assignments].sort((a,b)=>a.start.localeCompare(b.start))) {
    const op=snapshot.operations.find(x=>x.id===a.operationId), row=node('tr');
    const first=node('td');first.append(node('strong',op?.name||'不明'),node('small',nameOf('fields',op?.fieldId,snapshot)));
    const second=node('td',`${local(a.start)} → ${local(a.end)}`);
    const third=node('td',`${nameOf('workers',a.workerId,snapshot)}${a.machineId?` / ${nameOf('machines',a.machineId,snapshot)}`:' / 農機なし'}`);
    row.append(first,second,third);body.append(row);
  }
  table.append(body);scroll.append(table);return scroll;
}
function timeline(proposal) {
  const wrapper=node('div','','timeline');wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label','作業タイムライン（横スクロール可）');
  const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');
  const svgNode=(tag,attrs,text)=>{const el=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(text)el.textContent=text;svg.append(el);return el;};
  svg.setAttribute('viewBox',`0 0 1040 ${70+proposal.assignments.length*48}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','作業別の開始・終了タイムライン。詳細は下の一覧に表示。');
  const start=Date.parse(proposal.period.start), span=Date.parse(proposal.period.end)-start;
  for(let i=0;i<=4;i++){const x=200+i*200;svgNode('line',{x1:x,y1:40,x2:x,y2:65+proposal.assignments.length*48,class:'time-grid'});svgNode('text',{x,y:24,'text-anchor':i===4?'end':'start',class:'time-label'},local(new Date(start+span*i/4).toISOString()));}
  [...proposal.assignments].sort((a,b)=>a.start.localeCompare(b.start)).forEach((a,i)=>{
    const y=58+i*48,op=proposal.snapshot.operations.find(x=>x.id===a.operationId);
    svgNode('text',{x:8,y:y+18,class:'time-operation'},op.name.slice(0,13));
    const rect=svgNode('rect',{x:200+800*(Date.parse(a.start)-start)/span,y,width:Math.max(2,800*(Date.parse(a.end)-Date.parse(a.start))/span),height:28,rx:5,class:'time-bar'});
    const title=document.createElementNS(ns,'title');title.textContent=`${op.name}: ${local(a.start)}〜${local(a.end)} / ${nameOf('workers',a.workerId,proposal.snapshot)}`;rect.append(title);
  });wrapper.append(svg);return wrapper;
}
function renderProposal() {
  const container=$('#proposal'); container.replaceChildren();
  const proposal=selectedProposal || state.proposals.at(-1);
  if (!proposal) { container.append(node('p','候補はまだありません。')); return; }
  const panel=node('article','','panel');
  panel.append(node('h3','計画候補')); if(state.committed.some(x=>x.id===proposal.id))panel.append(node('p','この候補は確定済みです。条件を変更したら新しく候補を生成してください。','notice'));
  panel.append(node('span',proposal.status,`status ${proposal.status}`));
  panel.append(node('p',`計算: ${Number(proposal.elapsedMs).toFixed(1)}ms · 探索: ${proposal.nodes}ノード${proposal.makespan ? ` · 最終完了 ${local(proposal.makespan)}` : ''}`));
  if (proposal.status==='UNKNOWN') panel.append(node('p','計算上限までに解が見つかりませんでした。解なしの証明ではありません。'));
  if (proposal.status==='INFEASIBLE') panel.append(node('p','登録された必須作業をすべて割り当てる計画はありません。'));
  if (proposal.status==='FEASIBLE') panel.append(node('p','実行可能な候補です。最適性は証明されていません。'));
  if (proposal.assignments.length) {
    panel.append(node('h3','作業タイムライン'),node('small','横にスクロールすると計画期間全体を確認できます。'),timeline(proposal),assignmentTable(proposal.assignments,proposal.snapshot));
    const previous=state.committed.at(-1);
    if (previous) {
      panel.append(node('h3',`確定版 v${previous.version} との差分`));
      const old=new Map(previous.assignments.map(x=>[x.operationId,x]));
      for (const a of proposal.assignments) {
        const before=old.get(a.operationId), op=proposal.snapshot.operations.find(x=>x.id===a.operationId);
        if (!before) panel.append(node('div',`${op.name}: 新規割当`,'diff'));
        else if (before.start!==a.start || before.end!==a.end || before.workerId!==a.workerId || before.machineId!==a.machineId) panel.append(node('div',`${op.name}: ${local(before.start)}〜${local(before.end)} / ${nameOf('workers',before.workerId,previous.snapshot)} / ${before.machineId?nameOf('machines',before.machineId,previous.snapshot):'農機なし'} → ${local(a.start)}〜${local(a.end)} / ${nameOf('workers',a.workerId,proposal.snapshot)} / ${a.machineId?nameOf('machines',a.machineId,proposal.snapshot):'農機なし'}`,'diff'));
        old.delete(a.operationId);
      }
      for (const [operationId] of old) panel.append(node('div',`${nameOf('operations',operationId,previous.snapshot)}: 計画対象から削除`,'diff'));
      if (!panel.querySelector('.diff')) panel.append(node('p','変更はありません。'));
    }
    const button=node('button','この候補を承認して確定','primary');
    button.disabled=proposal.baseRevision!==state.revision || proposal.baseVersion!==state.committed.length;
    if(button.disabled)panel.append(node('p','入力または確定版が変わっています。新しい候補を生成してください。','notice'));
    button.addEventListener('click',()=>run(async()=>{ await api('/api/commit',{proposalId:proposal.id}); state=await api('/api/state'); render(); show('計画を確定しました。'); }));
    panel.append(button);
  }
  container.append(panel);
}
function renderHistory() {
  const container=$('#history-list'); container.replaceChildren();
  for (const entry of [...state.committed].reverse()) {
    const panel=node('article','','panel'); panel.append(node('h3',`確定版 v${entry.version}`),node('p',`確定: ${local(entry.committedAt)} · ${entry.status} · 最終完了: ${local(entry.makespan)}`));
    panel.append(assignmentTable(entry.assignments,entry.snapshot)); const details=node('details');details.append(node('summary','この版を作成した条件'));details.append(node('p',`計画期間: ${local(entry.period.start)}〜${local(entry.period.end)} · 作業 ${entry.snapshot.operations.length}件`));for(const w of entry.snapshot.workers)details.append(node('p',`${w.name}: ${w.availability.length?w.availability.map(x=>`${local(x.start)}〜${local(x.end)}`).join(' / '):'稼働なし'}`));panel.append(details); container.append(panel);
  }
  if (!state.committed.length) container.append(node('p','確定版はまだありません。'));
}
function render() {
  $('#farm-form [name="name"]').value=state.farm.name;
  const latest=state.committed.at(-1);
  $('#current-version').textContent=latest ? `v${latest.version}` : 'なし';
  $('#current-date').textContent=latest ? `確定: ${local(latest.committedAt)}` : '候補を生成して承認してください';
  $('#resource-summary').textContent=`圃場 ${state.fields.length} · 作業員 ${state.workers.length} · 農機 ${state.machines.length} · 作業 ${state.operations.length}`;
  $('#onboarding').hidden=state.operations.length>0;
  const form=$('#plan-form');if(state.operations.length && !form.elements.start.value){form.elements.start.value=inputTime(state.operations.reduce((a,b)=>a.earliest<b.earliest?a:b).earliest);form.elements.end.value=inputTime(state.operations.reduce((a,b)=>a.deadline>b.deadline?a:b).deadline);}
  renderOptions(); renderRecords(); renderProposal(); renderHistory();
}
document.querySelectorAll('.tabs button').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('.tabs button,.tab').forEach(x=>x.classList.remove('active'));
  button.classList.add('active'); $(`#${button.dataset.tab}`).classList.add('active');
}));
$('#farm-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{state=await api('/api/entities',{collection:'farm',action:'update',data:{name:new FormData(event.target).get('name')}});render();});});
document.querySelectorAll('form[data-collection]').forEach(form=>form.addEventListener('submit',event=>{ event.preventDefault();run(async()=>{
  const collection=form.dataset.collection, formData=new FormData(form), data=Object.fromEntries(formData);
  if (collection==='workers'||collection==='machines') data.availability=availability(data.availability);
  if (collection==='operations') { data.duration=Number(data.duration); data.earliest=toUtc(data.earliest); data.deadline=toUtc(data.deadline); data.machineType ||= null; data.predecessors=formData.getAll('predecessor'); delete data.predecessor; }
  if (collection==='blocked') { data.start=toUtc(data.start); data.end=toUtc(data.end); }
  const editing=Boolean(form.dataset.editId);
  state=await api('/api/entities',{collection,action:editing?'update':'create',id:editing?form.dataset.editId:undefined,data});
  form.reset(); delete form.dataset.editId; form.querySelector('button.primary').textContent='追加'; render();
});}));
$('#plan-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  const data=Object.fromEntries(new FormData(event.target));
  show('候補を計算しています…ほかの確定版は変更されません。');
  selectedProposal=await api('/api/proposals',{period:{start:toUtc(data.start),end:toUtc(data.end)}});
  state=await api('/api/state'); render(); show('候補を生成しました。状態と差分を確認してください。');
});});
run(async()=>{state=await api('/api/state');render();});

