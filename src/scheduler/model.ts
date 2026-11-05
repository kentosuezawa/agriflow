/** UTC ISO times at 30-minute boundaries; all intervals are half-open. */
export interface Interval { start: string; end: string }
export interface Field { id: string; name: string }
export interface Worker extends Field { availability: Interval[] }
export interface Machine extends Worker { type: string }
export interface Operation extends Field {
  fieldId: string;
  duration: number;
  earliest: string;
  deadline: string;
  machineType: string | null;
  predecessors: string[];
}
export interface Snapshot {
  farm: { name: string };
  fields: Field[];
  workers: Worker[];
  machines: Machine[];
  operations: Operation[];
  blocked: (Interval & { fieldId: string })[];
}
export interface Assignment extends Interval {
  operationId: string;
  workerId: string;
  machineId: string | null;
}
export interface SearchOptions { limitMs?: number; maxNodes?: number }
export interface SearchMetrics { nodes: number; elapsedMs: number; termination: 'exhausted' | 'time-limit' | 'node-limit' }
export type SolveResult = SearchMetrics & (
  | { status: 'OPTIMAL' | 'FEASIBLE'; assignments: Assignment[]; makespan: string }
  | { status: 'INFEASIBLE' | 'UNKNOWN'; assignments: []; makespan: null }
);
