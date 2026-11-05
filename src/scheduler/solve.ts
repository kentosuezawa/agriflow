import type { Assignment, Interval, Worker, Operation, SearchOptions, SearchMetrics, SolveResult } from './model.js';
import { SLOT_MS, InputError, validateInput } from './validation.js';
import { validatePlan } from './verify.js';

const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;
const available = (entity: Worker, start: number, end: number) => entity.availability.some(x => Date.parse(x.start) <= start && end <= Date.parse(x.end));
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

/** Exhaustive discrete branch-and-bound, adapted from the original MVP solver. */
export function solve(raw: unknown, rawPeriod: unknown, options: SearchOptions = {}): SolveResult {
  validateInput(raw, rawPeriod);
  const snapshot = raw, period = rawPeriod as Interval;
  const { limitMs = 2000, maxNodes = 300000 } = options;
  if (!Number.isInteger(limitMs) || limitMs < 1 || limitMs > 10000 || !Number.isInteger(maxNodes) || maxNodes < 0 || maxNodes > 10_000_000) throw new InputError('計算上限が不正です');
  const periodStart = Date.parse(period.start), periodEnd = Date.parse(period.end);
  const started = performance.now();
  const assigned: Assignment[] = [];
  const used = new Map<string, number>();
  let best: Assignment[] | null = null, bestEnd = Infinity, nodes = 0;
  let termination: SearchMetrics['termination'] = 'exhausted';
  const stop = (): boolean => {
    if (performance.now() - started >= limitMs) termination = 'time-limit';
    return termination !== 'exhausted';
  };
  const byId = new Map(snapshot.operations.map(x => [x.id, x]));
  const pending = new Set(byId.keys()), order: Operation[] = [];
  while (pending.size) {
    const ready = [...pending].map(id => byId.get(id)!).filter(op => op.predecessors.every(p => !pending.has(p)));
    ready.sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
    const op = ready[0]!; // Input validation proved an acyclic graph with valid references.
    order.push(op); pending.delete(op.id);
  }
  function walk(index: number, maxEnd: number): void {
    if (stop()) return;
    if (nodes >= maxNodes) { termination = 'node-limit'; return; }
    nodes++;
    // All durations are positive: a partial makespan cannot decrease.
    if (maxEnd >= bestEnd) return;
    if (index === order.length) { best = structuredClone(assigned); bestEnd = maxEnd; return; }
    const op = order[index]!, duration = op.duration * SLOT_MS;
    const earliest = Math.max(periodStart, Date.parse(op.earliest), ...op.predecessors.map(p => used.get(p)!));
    const latest = Math.min(periodEnd, Date.parse(op.deadline)) - duration;
    const machines = op.machineType ? snapshot.machines.filter(x => x.type === op.machineType) : [null];
    for (let start = earliest; start <= latest && !stop(); start += SLOT_MS) {
      const end = start + duration;
      if (end >= bestEnd) break;
      if (snapshot.blocked.some(x => x.fieldId === op.fieldId && overlaps(start, end, Date.parse(x.start), Date.parse(x.end)))) continue;
      if (assigned.some(x => byId.get(x.operationId)!.fieldId === op.fieldId && overlaps(start, end, Date.parse(x.start), Date.parse(x.end)))) continue;
      for (const worker of snapshot.workers) {
        if (stop()) break;
        if (!available(worker, start, end) || assigned.some(x => x.workerId === worker.id && overlaps(start, end, Date.parse(x.start), Date.parse(x.end)))) continue;
        for (const machine of machines) {
          if (stop()) break;
          if (machine && (!available(machine, start, end) || assigned.some(x => x.machineId === machine.id && overlaps(start, end, Date.parse(x.start), Date.parse(x.end))))) continue;
          assigned.push({ operationId: op.id, workerId: worker.id, machineId: machine?.id ?? null, start: iso(start), end: iso(end) });
          used.set(op.id, end); walk(index + 1, Math.max(maxEnd, end));
          assigned.pop(); used.delete(op.id);
        }
      }
    }
  }
  walk(0, periodStart);
  if (best && !validatePlan(snapshot, best, period)) throw new Error('計算結果の制約検証に失敗しました');
  const metrics = { nodes, elapsedMs: performance.now() - started, termination };
  if (best !== null) return { ...metrics, status: termination === 'exhausted' ? 'OPTIMAL' : 'FEASIBLE', assignments: best, makespan: iso(bestEnd) };
  return { ...metrics, status: termination === 'exhausted' ? 'INFEASIBLE' : 'UNKNOWN', assignments: [], makespan: null };
}
