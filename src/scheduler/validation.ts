import type { Snapshot, Interval } from './model.js';
export const SLOT_MS = 1_800_000;
export const MAX_SLOTS = 336;
export class InputError extends Error {
  constructor(message: string) { super(message); this.name = 'InputError'; }
}
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InputError(message);
}
export function parseTime(value: unknown, name: string): number {
  requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value), `${name}: UTCのISO日時を指定してください`);
  const ms = Date.parse(value);
  requireValue(Number.isFinite(ms) && new Date(ms).toISOString().replace(/\.000Z$/, 'Z') === value.replace(/\.000Z$/, 'Z'), `${name}: 日時が不正です`);
  requireValue(ms % SLOT_MS === 0, `${name}: 30分境界を指定してください`);
  return ms;
}
function record(value: unknown, path: string): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), `${path}: オブジェクトが必要です`);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string): asserts value is string {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= 100, `${path}: 1〜100文字が必要です`);
}
function list(value: unknown, path: string, max = 1000): unknown[] {
  requireValue(Array.isArray(value) && value.length <= max, `${path}: 最大${max}件の配列が必要です`);
  return value;
}
export function validateInterval(value: unknown, path: string): asserts value is Interval {
  const x = record(value, path);
  requireValue(parseTime(x.start, `${path}.start`) < parseTime(x.end, `${path}.end`), `${path}: 開始より後に終了してください`);
}
export function validateInput(raw: unknown, period: unknown): asserts raw is Snapshot {
  validateInterval(period, 'period');
  requireValue(Date.parse(period.end) - Date.parse(period.start) <= MAX_SLOTS * SLOT_MS, '計画期間は7日以内にしてください');
  const s = record(raw, 'snapshot');
  text(record(s.farm, 'farm').name, 'farm.name');
  const ids = new Map<string, Set<string>>();
  for (const kind of ['fields', 'workers', 'machines', 'operations'] as const) {
    const seen = new Set<string>(); ids.set(kind, seen);
    const entities = list(s[kind], kind, kind === 'operations' ? 20 : 100);
    if (kind === 'operations') requireValue(entities.length > 0, '作業を1件以上登録してください');
    for (const rawEntity of entities) {
      const x = record(rawEntity, kind);
      text(x.id, `${kind}.id`); text(x.name, `${kind}.name`);
      requireValue(!seen.has(x.id), `${kind}: IDが重複しています`); seen.add(x.id);
      if (kind === 'workers' || kind === 'machines') {
        for (const interval of list(x.availability, `${kind}.availability`)) validateInterval(interval, 'availability');
      }
      if (kind === 'machines') text(x.type, 'machine.type');
    }
  }
  const operations = s.operations as unknown[];
  const graph = new Map<string, string[]>();
  for (const rawOp of operations) {
    const x = record(rawOp, 'operation');
    text(x.fieldId, 'operation.fieldId');
    requireValue(ids.get('fields')!.has(x.fieldId), '圃場が存在しません');
    requireValue(Number.isInteger(x.duration) && Number(x.duration) >= 1 && Number(x.duration) <= MAX_SLOTS, '所要スロットは1〜336の整数です');
    const start = parseTime(x.earliest, 'earliest'), end = parseTime(x.deadline, 'deadline');
    requireValue(end > start && end - start >= Number(x.duration) * SLOT_MS, '作業可能期間が不正、または所要時間より短いです');
    if (x.machineType !== null) text(x.machineType, 'machineType');
    const predecessors = list(x.predecessors, 'predecessors', 20);
    requireValue(new Set(predecessors).size === predecessors.length, '先行作業IDが重複しています');
    for (const p of predecessors) requireValue(typeof p === 'string' && ids.get('operations')!.has(p), '先行作業が存在しません');
    graph.set(x.id as string, predecessors as string[]);
  }
  const seen = new Set<string>(), visiting = new Set<string>();
  function visit(id: string): void {
    requireValue(!visiting.has(id), '先行関係が循環しています');
    if (seen.has(id)) return;
    visiting.add(id);
    for (const p of graph.get(id)!) visit(p);
    visiting.delete(id); seen.add(id);
  }
  for (const id of graph.keys()) visit(id);
  for (const rawBlock of list(s.blocked, 'blocked')) {
    validateInterval(rawBlock, 'blocked');
    const b = record(rawBlock, 'blocked');
    requireValue(typeof b.fieldId === 'string' && ids.get('fields')!.has(b.fieldId), '作業不可時間の圃場が存在しません');
  }
}
