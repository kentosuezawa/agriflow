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
const run = async action => { try { show(''); await action(); } catch (error) { show(error.message); } };
const nameOf = (collection,id,snapshot=state) => snapshot[collection].find(x => x.id === id)?.name || '不明';
const availability = value => value.trim().split(/\n+/).map(line => {
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
  const predecessor=$('select[name="predecessor"]'); predecessor.replaceChildren(); option(predecessor,'','なし'); state.operations.forEach(x=>option(predecessor,x.id,x.name));
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
    else if (input.name==='predecessor') input.value=item.predecessors?.[0] || '';
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
function assignmentRow(assignment,snapshot) {
  const op=snapshot.operations.find(x=>x.id===assignment.operationId);
  const row=node('div','','assignment');
  const first=node('div'); first.append(node('strong',op?.name||'不明'),node('small',nameOf('fields',op?.fieldId,snapshot)));
  const second=node('div',`${local(assignment.start)} 〜 ${local(assignment.end)}`);
  const third=node('div',`${nameOf('workers',assignment.workerId,snapshot)}${assignment.machineId ? ` / ${nameOf('machines',assignment.machineId,snapshot)}` : ''}`);
  row.append(first,second,third); return row;
}
function renderProposal() {
  const container=$('#proposal'); container.replaceChildren();
  const proposal=selectedProposal || state.proposals.at(-1);
  if (!proposal) { container.append(node('p','候補はまだありません。')); return; }
  const panel=node('article','','panel');
  panel.append(node('h3','最新の候補'));
  panel.append(node('span',proposal.status,`status ${proposal.status}`));
  panel.append(node('p',`計算: ${proposal.elapsedMs}ms · 探索: ${proposal.nodes}ノード${proposal.makespan ? ` · 最終完了 ${local(proposal.makespan)}` : ''}`));
  if (proposal.status==='UNKNOWN') panel.append(node('p','計算上限までに解が見つかりませんでした。解なしの証明ではありません。'));
  if (proposal.status==='INFEASIBLE') panel.append(node('p','登録された必須作業をすべて割り当てる計画はありません。'));
  if (proposal.status==='FEASIBLE') panel.append(node('p','実行可能な候補です。最適性は証明されていません。'));
  if (proposal.assignments.length) {
    proposal.assignments.sort((a,b)=>a.start.localeCompare(b.start)).forEach(a=>panel.append(assignmentRow(a,proposal.snapshot)));
    const previous=state.committed.at(-1);
    if (previous) {
      panel.append(node('h3',`確定版 v${previous.version} との差分`));
      const old=new Map(previous.assignments.map(x=>[x.operationId,x]));
      for (const a of proposal.assignments) {
        const before=old.get(a.operationId), op=proposal.snapshot.operations.find(x=>x.id===a.operationId);
        if (!before) panel.append(node('div',`${op.name}: 新規割当`,'diff'));
        else if (before.start!==a.start || before.end!==a.end || before.workerId!==a.workerId || before.machineId!==a.machineId) panel.append(node('div',`${op.name}: ${local(before.start)} → ${local(a.start)}${before.workerId!==a.workerId ? ' · 担当変更' : ''}${before.machineId!==a.machineId ? ' · 農機変更' : ''}`,'diff'));
        old.delete(a.operationId);
      }
      for (const [operationId] of old) panel.append(node('div',`${nameOf('operations',operationId,previous.snapshot)}: 計画対象から削除`,'diff'));
      if (!panel.querySelector('.diff')) panel.append(node('p','変更はありません。'));
    }
    const button=node('button','この候補を承認して確定','primary');
    button.addEventListener('click',()=>run(async()=>{ await api('/api/commit',{proposalId:proposal.id}); state=await api('/api/state'); render(); show('計画を確定しました。'); }));
    panel.append(button);
  }
  container.append(panel);
}
function renderHistory() {
  const container=$('#history-list'); container.replaceChildren();
  for (const entry of [...state.committed].reverse()) {
    const panel=node('article','','panel'); panel.append(node('h3',`確定版 v${entry.version}`),node('p',`確定: ${local(entry.committedAt)} · ${entry.status} · 最終完了: ${local(entry.makespan)}`));
    entry.assignments.forEach(a=>panel.append(assignmentRow(a,entry.snapshot))); container.append(panel);
  }
  if (!state.committed.length) container.append(node('p','確定版はまだありません。'));
}
function render() {
  $('#farm-form [name="name"]').value=state.farm.name;
  const latest=state.committed.at(-1);
  $('#current-version').textContent=latest ? `v${latest.version}` : 'なし';
  $('#current-date').textContent=latest ? `確定: ${local(latest.committedAt)}` : '候補を生成して承認してください';
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
  if (collection==='operations') { data.duration=Number(data.duration); data.earliest=toUtc(data.earliest); data.deadline=toUtc(data.deadline); data.machineType ||= null; data.predecessors=data.predecessor?[data.predecessor]:[]; delete data.predecessor; }
  if (collection==='blocked') { data.start=toUtc(data.start); data.end=toUtc(data.end); }
  const editing=Boolean(form.dataset.editId);
  state=await api('/api/entities',{collection,action:editing?'update':'create',id:editing?form.dataset.editId:undefined,data});
  form.reset(); delete form.dataset.editId; form.querySelector('button.primary').textContent='追加'; render();
});}));
$('#plan-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  const data=Object.fromEntries(new FormData(event.target));
  selectedProposal=await api('/api/proposals',{period:{start:toUtc(data.start),end:toUtc(data.end)}});
  state=await api('/api/state'); render();
});});
run(async()=>{state=await api('/api/state');render();});

