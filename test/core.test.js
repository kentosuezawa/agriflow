import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, mutate, solve, validatePlan, makeProposal, commitProposal } from '../src/core.js';

const t = (hour,minute=0) => `2026-11-02T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`;
const period = {start:t(0),end:t(3)};
function fixture(duration=2) {
  let s=initialState();
  s=mutate(s,'fields','create',{name:'F1'}); s=mutate(s,'fields','create',{name:'F2'});
  s=mutate(s,'workers','create',{name:'W1',availability:[{start:t(0),end:t(3)}]});
  for (const [i,field] of s.fields.entries()) s=mutate(s,'operations','create',{name:`作業${i+1}`,fieldId:field.id,duration,earliest:t(0),deadline:t(3),machineType:null,predecessors:[]});
  return s;
}
test('SC-001: 2件の1時間作業は11時に相当する時刻で完了',()=>{
  const s=fixture(); const result=solve(s,period,2000);
  assert.equal(result.status,'OPTIMAL'); assert.equal(result.makespan,t(2));
  assert.equal(validatePlan(s,result.assignments,period),true);
});
test('SC-002: 4時間の作業に対して3時間の稼働なら解なし',()=>{
  const result=solve(fixture(4),period,2000);
  assert.equal(result.status,'INFEASIBLE'); assert.deepEqual(result.assignments,[]);
});
test('作業員・農機・圃場の二重割当を防ぎ、境界の隣接を許す',()=>{
  let s=fixture();
  const result=solve(s,period,2000);
  assert.equal(result.assignments[0].end,result.assignments[1].start);
  const invalid=structuredClone(result.assignments); invalid[1].start=invalid[0].start; invalid[1].end=invalid[0].end;
  assert.equal(validatePlan(s,invalid,period),false);
});
test('候補生成だけでは確定版を変更せず、入力変更後の承認を拒否',()=>{
  let s=fixture(); const {state,proposal}=makeProposal(s,period,2000);
  assert.equal(state.committed.length,0);
  const changed=mutate(state,'farm','update',{name:'変更'});
  assert.throws(()=>commitProposal(changed,proposal.id),/変更されています/);
  const committed=commitProposal(state,proposal.id).state;
  assert.equal(committed.committed.length,1);
  assert.equal(committed.committed[0].version,1);
  assert.equal(state.committed.length,0);
});
test('先行関係の循環・不正参照を拒否',()=>{
  let s=fixture(); const [a,b]=s.operations;
  s=mutate(s,'operations','update',{...b,predecessors:[a.id]},b.id);
  assert.throws(()=>mutate(s,'operations','update',{...a,predecessors:[b.id]},a.id),/循環/);
  assert.throws(()=>mutate(s,'fields','delete',{},s.fields[0].id),/参照中/);
});

