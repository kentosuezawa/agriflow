import type { Snapshot, Assignment, Interval, Worker } from './model.js';
import { SLOT_MS, parseTime, validateInput } from './validation.js';
const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;
const available = (entity: Worker, start: number, end: number) => entity.availability.some(x => Date.parse(x.start) <= start && end <= Date.parse(x.end));
function checkPlan(snapshot: Snapshot, assignments: Assignment[], period: Interval) {
  const operations = snapshot.operations;
  if (assignments.length !== operations.length) return false;
  const assigned = new Map(assignments.map(x => [x.operationId, x]));
  if (assigned.size !== operations.length) return false;
  for (const op of operations) {
    const a = assigned.get(op.id); if (!a) return false;
    const start = parseTime(a.start, 'assignment.start'), end = parseTime(a.end, 'assignment.end');
    if (!Number.isFinite(start) || !Number.isFinite(end) || start % SLOT_MS || end - start !== op.duration * SLOT_MS) return false;
    if (start < Date.parse(period.start) || end > Date.parse(period.end) || start < Date.parse(op.earliest) || end > Date.parse(op.deadline)) return false;
    const worker = snapshot.workers.find(x => x.id === a.workerId);
    if (!worker || !available(worker, start, end)) return false;
    if (op.machineType) {
      const machine = snapshot.machines.find(x => x.id === a.machineId);
      if (!machine || machine.type !== op.machineType || !available(machine, start, end)) return false;
    } else if (a.machineId !== null) return false;
    if (snapshot.blocked.some(x => x.fieldId === op.fieldId && overlaps(start, end, Date.parse(x.start), Date.parse(x.end)))) return false;
    for (const p of op.predecessors) if (!assigned.has(p) || Date.parse(assigned.get(p)!.end) > start) return false;
  }
  for (let i = 0; i < assignments.length; i++) for (let j = i + 1; j < assignments.length; j++) {
    const a = assignments[i]!, b = assignments[j]!;
    const opA = operations.find(x => x.id === a.operationId), opB = operations.find(x => x.id === b.operationId);
    if (overlaps(Date.parse(a.start), Date.parse(a.end), Date.parse(b.start), Date.parse(b.end)) && (a.workerId === b.workerId || (a.machineId && a.machineId === b.machineId) || opA!.fieldId === opB!.fieldId)) return false;
  }
  return true;
}


/** Independent postcondition check for computed or persisted proposals. */
export function validatePlan(snapshot: unknown, assignments: unknown, period: unknown): boolean {
  try {
    validateInput(snapshot, period);
    if (!Array.isArray(assignments) || assignments.some(a => !a || typeof a !== 'object')) return false;
    return checkPlan(snapshot, assignments as Assignment[], period as Interval);
  } catch { return false; }
}
