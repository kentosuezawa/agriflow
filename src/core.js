import { randomUUID } from 'node:crypto';

export const SLOT_MS = 30 * 60 * 1000;
export const MAX_SLOTS = 7 * 48;
const clone = value => structuredClone(value);
const fail = message => { throw new Error(message); };
const integer = (value, name, min = 0) => {
  if (!Number.isInteger(value) || value < min) fail(`${name}は${min}以上の整数で指定してください`);
  return value;
};
const text = (value, name) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) fail(`${name}は1〜100文字で指定してください`);
  return value.trim();
};
const id = () => randomUUID();
const stamp = () => new Date().toISOString();

export function initialState() {
  return { revision: 0, farm: { name: '模擬農場' }, fields: [], workers: [], machines: [], operations: [], blocked: [], proposals: [], committed: [] };
}

export function parseTime(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) fail(`${name}はUTCのISO日時で指定してください`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().replace(/\.000Z$/, 'Z') !== value.replace(/\.000Z$/, 'Z')) fail(`${name}が不正です`);
  return ms;
}
function interval(start, end, name) {
  const a = parseTime(start, `${name}開始`), b = parseTime(end, `${name}終了`);
  if (a >= b || a % SLOT_MS || b % SLOT_MS) fail(`${name}は30分境界で開始より後に終了してください`);
  return [a, b];
}
function refs(state, operation) {
  if (!state.fields.some(x => x.id === operation.fieldId)) fail('圃場が存在しません');
  if (operation.machineType && !state.machines.some(x => x.type === operation.machineType)) fail('指定された種類の農機が存在しません');
  for (const p of operation.predecessors) if (!state.operations.some(x => x.id === p)) fail('先行作業が存在しません');
  if (operation.predecessors.includes(operation.id)) fail('自分自身を先行作業にはできません');
}
function validateGraph(operations) {
  const map = new Map(operations.map(x => [x.id, x]));
  const seen = new Set(), visiting = new Set();
  function visit(key) {
    if (visiting.has(key)) fail('先行関係が循環しています');
    if (seen.has(key)) return;
    visiting.add(key);
    for (const p of map.get(key)?.predecessors ?? []) visit(p);
    visiting.delete(key); seen.add(key);
  }
  for (const x of operations) visit(x.id);
}
export function validateEntity(state, collection, raw, existingId = null) {
  const item = { id: existingId || id() };
  if (collection === 'fields' || collection === 'workers') item.name = text(raw.name, '名前');
  else if (collection === 'machines') { item.name = text(raw.name, '農機名'); item.type = text(raw.type, '農機種類'); }
  else if (collection === 'operations') {
    item.name = text(raw.name, '作業名'); item.fieldId = text(raw.fieldId, '圃場ID');
    item.duration = integer(raw.duration, '所要スロット', 1);
    if (item.duration > MAX_SLOTS) fail('所要時間が7日を超えています');
    item.earliest = raw.earliest; item.deadline = raw.deadline;
    const [a,b] = interval(item.earliest, item.deadline, '作業可能期間');
    if (b - a < item.duration * SLOT_MS) fail('作業可能期間が所要時間より短いです');
    item.machineType = raw.machineType ? text(raw.machineType, '農機種類') : null;
    item.predecessors = Array.isArray(raw.predecessors) ? raw.predecessors : [];
    if (new Set(item.predecessors).size !== item.predecessors.length || item.predecessors.some(x => typeof x !== 'string')) fail('先行作業IDが不正です');
    refs(state, item);
    validateGraph([...state.operations.filter(x => x.id !== existingId), item]);
  } else if (collection === 'blocked') {
    item.fieldId = text(raw.fieldId, '圃場ID');
    if (!state.fields.some(x => x.id === item.fieldId)) fail('圃場が存在しません');
    item.start = raw.start; item.end = raw.end; interval(item.start, item.end, '作業不可期間');
  } else fail('対象が不正です');
  if (collection === 'workers' || collection === 'machines') {
    if (!Array.isArray(raw.availability)) fail('利用可能時間を配列で指定してください');
    item.availability = raw.availability.map((x, i) => {
      interval(x.start, x.end, `利用可能時間${i + 1}`);
      return { start: x.start, end: x.end };
    });
  }
  return item;
}

export function mutate(state, collection, action, raw, entityId = null) {
  const next = clone(state);
  if (collection === 'farm') {
    if (action !== 'update') fail('操作が不正です');
    next.farm.name = text(raw.name, '農場名');
  } else {
    const allowed = ['fields', 'workers', 'machines', 'operations', 'blocked'];
    if (!allowed.includes(collection)) fail('対象が不正です');
    const index = next[collection].findIndex(x => x.id === entityId);
    if (action === 'delete') {
      if (index < 0) fail('対象が見つかりません');
      if (collection === 'fields' && (next.operations.some(x => x.fieldId === entityId) || next.blocked.some(x => x.fieldId === entityId))) fail('参照中の圃場は削除できません');
      if (collection === 'machines' && next.operations.some(x => x.machineType === next.machines[index].type && next.machines.filter(m => m.type === x.machineType).length === 1)) fail('作業で使う唯一の農機種類は削除できません');
      if (collection === 'operations' && next.operations.some(x => x.predecessors.includes(entityId))) fail('先行関係で参照中の作業は削除できません');
      next[collection].splice(index, 1);
    } else {
      if (action === 'update' && index < 0) fail('対象が見つかりません');
      if (action !== 'update' && action !== 'create') fail('操作が不正です');
      const item = validateEntity(next, collection, raw, action === 'update' ? entityId : null);
      if (action === 'update') next[collection][index] = item;
      else next[collection].push(item);
      if (collection === 'machines' && action === 'update' && state.machines[index].type !== item.type && next.operations.some(x => x.machineType === state.machines[index].type) && !next.machines.some(x => x.type === state.machines[index].type)) fail('作業で使う唯一の農機種類は変更できません');
    }
  }
  next.revision++;
  return next;
}

const overlaps = (a, b, c, d) => a < d && c < b;
const available = (entity, start, end) => entity.availability.some(x => Date.parse(x.start) <= start && end <= Date.parse(x.end));
export function validatePlan(snapshot, assignments, period) {
  const operations = snapshot.operations;
  if (assignments.length !== operations.length) return false;
  const assigned = new Map(assignments.map(x => [x.operationId, x]));
  if (assigned.size !== operations.length) return false;
  for (const op of operations) {
    const a = assigned.get(op.id); if (!a) return false;
    const start = Date.parse(a.start), end = Date.parse(a.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start % SLOT_MS || end - start !== op.duration * SLOT_MS) return false;
    if (start < Date.parse(period.start) || end > Date.parse(period.end) || start < Date.parse(op.earliest) || end > Date.parse(op.deadline)) return false;
    const worker = snapshot.workers.find(x => x.id === a.workerId);
    if (!worker || !available(worker, start, end)) return false;
    if (op.machineType) {
      const machine = snapshot.machines.find(x => x.id === a.machineId);
      if (!machine || machine.type !== op.machineType || !available(machine, start, end)) return false;
    } else if (a.machineId !== null) return false;
    if (snapshot.blocked.some(x => x.fieldId === op.fieldId && overlaps(start, end, Date.parse(x.start), Date.parse(x.end)))) return false;
    for (const p of op.predecessors) if (!assigned.has(p) || Date.parse(assigned.get(p).end) > start) return false;
  }
  for (let i = 0; i < assignments.length; i++) for (let j = i + 1; j < assignments.length; j++) {
    const a = assignments[i], b = assignments[j];
    const opA = operations.find(x => x.id === a.operationId), opB = operations.find(x => x.id === b.operationId);
    if (overlaps(Date.parse(a.start), Date.parse(a.end), Date.parse(b.start), Date.parse(b.end)) && (a.workerId === b.workerId || (a.machineId && a.machineId === b.machineId) || opA.fieldId === opB.fieldId)) return false;
  }
  return true;
}

export function solve(snapshot, period, limitMs = 2000) {
  const [periodStart, periodEnd] = interval(period.start, period.end, '計画期間');
  if (periodEnd - periodStart > MAX_SLOTS * SLOT_MS) fail('計画期間は7日以内にしてください');
  if (snapshot.operations.length === 0) fail('作業を1件以上登録してください');
  if (snapshot.operations.length > 20) fail('作業は20件以内にしてください');
  integer(limitMs, '計算上限ミリ秒', 1);
  if (limitMs > 10000) fail('計算上限は10000ミリ秒以内にしてください');
  validateGraph(snapshot.operations);
  const started = Date.now(), assigned = [], used = new Map();
  let best = null, bestEnd = Infinity, timedOut = false, nodes = 0;
  const order = [];
  const byId = new Map(snapshot.operations.map(x => [x.id, x]));
  const pending = new Set(byId.keys());
  while (pending.size) {
    const ready = [...pending].map(x => byId.get(x)).filter(x => x.predecessors.every(p => !pending.has(p)));
    if (!ready.length) fail('先行関係が循環しています');
    ready.sort((a,b) => Date.parse(a.deadline) - Date.parse(b.deadline));
    order.push(ready[0]); pending.delete(ready[0].id);
  }
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  function walk(index, maxEnd) {
    if (Date.now() - started >= limitMs || nodes++ > 300000) { timedOut = true; return; }
    if (maxEnd >= bestEnd) return;
    if (index === order.length) { best = clone(assigned); bestEnd = maxEnd; return; }
    const op = order[index], duration = op.duration * SLOT_MS;
    const earliest = Math.max(periodStart, Date.parse(op.earliest), ...op.predecessors.map(p => used.get(p)?.end ?? periodStart));
    const latest = Math.min(periodEnd, Date.parse(op.deadline)) - duration;
    const machines = op.machineType ? snapshot.machines.filter(x => x.type === op.machineType) : [null];
    for (let start = earliest; start <= latest && !timedOut; start += SLOT_MS) {
      const end = start + duration;
      if (snapshot.blocked.some(x => x.fieldId === op.fieldId && overlaps(start,end,Date.parse(x.start),Date.parse(x.end)))) continue;
      if (assigned.some(x => byId.get(x.operationId).fieldId === op.fieldId && overlaps(start,end,Date.parse(x.start),Date.parse(x.end)))) continue;
      for (const worker of snapshot.workers) {
        if (!available(worker,start,end) || assigned.some(x => x.workerId === worker.id && overlaps(start,end,Date.parse(x.start),Date.parse(x.end)))) continue;
        for (const machine of machines) {
          if (machine && (!available(machine,start,end) || assigned.some(x => x.machineId === machine.id && overlaps(start,end,Date.parse(x.start),Date.parse(x.end))))) continue;
          assigned.push({ operationId: op.id, workerId: worker.id, machineId: machine?.id ?? null, start: iso(start), end: iso(end) });
          used.set(op.id,{start,end}); walk(index + 1, Math.max(maxEnd,end));
          assigned.pop(); used.delete(op.id);
          if (timedOut) break;
        }
        if (timedOut) break;
      }
    }
  }
  walk(0, periodStart);
  if (best && !validatePlan(snapshot,best,period)) fail('計算結果の制約検証に失敗しました');
  return { status: timedOut ? best ? 'FEASIBLE' : 'UNKNOWN' : best ? 'OPTIMAL' : 'INFEASIBLE', assignments: best ?? [], makespan: best ? iso(bestEnd) : null, nodes, elapsedMs: Date.now() - started };
}

export function makeProposal(state, period, limitMs) {
  const snapshot = { farm: clone(state.farm), fields: clone(state.fields), workers: clone(state.workers), machines: clone(state.machines), operations: clone(state.operations), blocked: clone(state.blocked) };
  const result = solve(snapshot,period,limitMs);
  const proposal = { id: id(), createdAt: stamp(), baseRevision: state.revision, baseVersion: state.committed.length, period: clone(period), snapshot, ...result };
  const next = clone(state); next.proposals.push(proposal);
  return { state: next, proposal };
}
export function commitProposal(state, proposalId) {
  const proposal = state.proposals.find(x => x.id === proposalId);
  if (!proposal) fail('候補が見つかりません');
  if (!['OPTIMAL','FEASIBLE'].includes(proposal.status)) fail('実行可能な候補だけ承認できます');
  if (proposal.baseRevision !== state.revision || proposal.baseVersion !== state.committed.length) fail('入力または確定版が変更されています。再計画してください');
  if (!validatePlan(proposal.snapshot,proposal.assignments,proposal.period)) fail('候補の制約検証に失敗しました');
  const next = clone(state), version = next.committed.length + 1;
  const entry = { ...clone(proposal), version, committedAt: stamp() };
  next.committed.push(entry);
  return { state: next, entry };
}

