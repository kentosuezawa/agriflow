import test from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../dist/solve.js';
import { validatePlan } from '../dist/verify.js';
import { InputError } from '../dist/validation.js';
import { fixture, period, t } from './fixtures.js';

test('SC-003 / FR-010: adjacent half-open intervals; reject forged overlap', () => {
  const s = fixture(), r = solve(s, period);
  assert.equal(r.status, 'OPTIMAL'); assert.equal(r.makespan, t(4));
  assert.equal(validatePlan(s, r.assignments, period), true);
  r.assignments[1].start = t(1); r.assignments[1].end = t(3);
  assert.equal(validatePlan(s, r.assignments, period), false);
});

test('SC-006 / FR-010/011: one tractor serializes, two allow concurrency', () => {
  const s = fixture(); s.workers.push({ ...s.workers[0], id: 'W2' });
  s.operations.forEach(op => op.machineType = 'tractor');
  s.machines.push({ id: 'M1', name: '模擬農機1', type: 'tractor', availability: [period] });
  const one = solve(s, period);
  assert.equal(one.makespan, t(4)); assert.ok(validatePlan(s, one.assignments, period));
  const forged = structuredClone(one.assignments);
  forged[1] = { ...forged[1], workerId: 'W2', start: t(0), end: t(2) };
  assert.equal(validatePlan(s, forged, period), false);
  s.machines.push({ ...s.machines[0], id: 'M2' });
  const two = solve(s, period);
  assert.equal(two.makespan, t(2)); assert.equal(new Set(two.assignments.map(a => a.machineId)).size, 2);
  assert.ok(validatePlan(s, two.assignments, period));
});

const invalidCases = [
  ['negative duration', s => s.operations[0].duration = -1],
  ['fractional duration', s => s.operations[0].duration = 1.5],
  ['zero duration', s => s.operations[0].duration = 0],
  ['reversed window', s => s.operations[0].earliest = t(7)],
  ['missing field', s => s.operations[0].fieldId = 'missing'],
  ['duplicate ID', s => s.operations[1].id = 'O0'],
  ['missing predecessor', s => s.operations[0].predecessors = ['missing']],
  ['cycle', s => { s.operations[0].predecessors = ['O1']; s.operations[1].predecessors = ['O0']; }],
  ['non-array', s => s.workers = null],
  ['missing availability', s => delete s.workers[0].availability],
  ['invalid date', s => s.operations[0].earliest = '2026-02-30T00:00:00Z'],
  ['non-aligned date', s => s.operations[0].earliest = '2026-11-02T00:01:00Z'],
  ['invalid machine type', s => s.operations[0].machineType = 42],
  ['block reference', s => s.blocked.push({ ...period, fieldId: 'missing' })],
];
for (const [name, change] of invalidCases) test(`SC-005 / FR-005/008/018: ${name}`, () => {
  const s = fixture(); change(s);
  assert.throws(() => solve(s, period), InputError);
});

test('FR-018: reject malformed roots, budgets and periods', () => {
  for (const raw of [null, [], {}, 'x']) assert.throws(() => solve(raw, period), InputError);
  for (const options of [{limitMs: NaN}, {limitMs: 0}, {maxNodes: -1}, {maxNodes: 1.2}]) assert.throws(() => solve(fixture(), period, options), InputError);
  assert.throws(() => solve(fixture(), {start:t(0),end:t(337)}), InputError);
  assert.equal(solve(fixture(), {start:t(0),end:t(336)}).status, 'OPTIMAL');
});

test('FR-006/007/008/010: resource gaps, blocked fields, precedence and field exclusion', () => {
  const s = fixture();
  s.workers.push({ ...s.workers[0], id:'W2' });
  s.operations[1].fieldId = 'F1';
  assert.equal(solve(s, period).makespan, t(4));
  s.operations[1].fieldId = 'F2'; s.operations[1].predecessors = ['O0'];
  s.blocked = [{fieldId:'F1',start:t(0),end:t(1)}];
  const result = solve(s, period);
  assert.equal(result.makespan,t(5)); assert.ok(validatePlan(s,result.assignments,period));
  s.workers.forEach(w => w.availability = [{start:t(0),end:t(1)},{start:t(2),end:t(3)}]);
  assert.equal(solve(s,period).status,'INFEASIBLE');
});

test('FR-011/013: missing or unavailable required machine is infeasible', () => {
  const s=fixture(); s.operations[0].machineType='tractor';
  assert.equal(solve(s,period).status,'INFEASIBLE');
  s.machines=[{id:'M1',name:'模擬農機',type:'tractor',availability:[]}];
  assert.equal(solve(s,period).status,'INFEASIBLE');
});

test('FR-013 / NFR-008: deterministic cutoff with and without incumbent', () => {
  const s=fixture(), before=structuredClone(s);
  const unknown=solve(s,period,{maxNodes:0});
  assert.equal(unknown.status,'UNKNOWN'); assert.equal(unknown.makespan,null);
  assert.equal(unknown.termination,'node-limit'); assert.equal(unknown.nodes,0);
  // Three nodes find the first solution; a later branch remains unexplored.
  const feasible=solve(s,period,{maxNodes:3});
  assert.equal(feasible.status,'FEASIBLE'); assert.equal(feasible.termination,'node-limit');
  assert.ok(validatePlan(s,feasible.assignments,period));
  assert.deepEqual(s,before);
});

test('NFR-008: time cutoff is UNKNOWN, not INFEASIBLE', context => {
  let tick=0;
  context.mock.method(performance,'now',()=>tick++ * 10);
  const r=solve(fixture(),period,{limitMs:1});
  assert.equal(r.status,'UNKNOWN'); assert.equal(r.termination,'time-limit');
});

test('independent verifier rejects missing, duplicated, wrong-resource and malformed assignments', () => {
  const s=fixture(), r=solve(s,period);
  for(const change of [a=>a.pop(),a=>a[1]=a[0],a=>a[0].workerId='missing',a=>a[0].machineId='missing',a=>a[0].end=t(1),a=>a[0].start='bad']) {
    const a=structuredClone(r.assignments); change(a); assert.equal(validatePlan(s,a,period),false);
  }
  assert.equal(validatePlan(s,null,period),false);
});

// Independent slot-occupancy enumeration: no solver pruning or validator reuse.
function oracle(s, horizon) {
  let best=Infinity;
  function search(i, occupied, ends) {
    if(i===s.operations.length) { best=Math.min(best,Math.max(...ends)); return; }
    const op=s.operations[i];
    for(let start=0;start+op.duration<=horizon;start++) {
      const slots=Array.from({length:op.duration},(_,k)=>start+k);
      if(start*1800000+Date.parse(t(0))<Date.parse(op.earliest) || Date.parse(t(start+op.duration))>Date.parse(op.deadline)) continue;
      if(slots.some(slot=>occupied.has(slot))) continue;
      search(i+1,new Set([...occupied,...slots]),[...ends,start+op.duration]);
    }
  }
  search(0,new Set(),[]); return best;
}
test('FR-012: compare optimum against independent enumeration for 81 small instances', () => {
  for(let a=1;a<=3;a++) for(let b=1;b<=3;b++) for(let release=0;release<3;release++) for(let horizon=4;horizon<=6;horizon++) {
    const s=fixture(); s.operations[0].duration=a; s.operations[1].duration=b;
    s.operations[0].earliest=t(release);
    // Keep input windows valid, while the planning period may still make them infeasible.
    const expected=oracle(s,horizon), r=solve(s,{start:t(0),end:t(horizon)});
    assert.equal(r.status,Number.isFinite(expected)?'OPTIMAL':'INFEASIBLE');
    assert.equal(r.makespan,Number.isFinite(expected)?t(expected):null);
  }
});
