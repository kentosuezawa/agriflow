import { isDeepStrictEqual } from 'node:util';
import { validateEntity, mutate, parseTime, validatePlan } from '../core.js';
import { validateInput } from '../../dist/validation.js';
export function validateImport(s) {
  const fail=()=>{throw new Error('移行データが不正です。原本を保持して形式と整合性を確認してください');};
  if(!s || !Number.isInteger(s.revision) || s.revision<0)fail();
  mutate(s,'farm','update',s.farm);
  for(const collection of ['fields','workers','machines','operations','blocked']) {
    if(!Array.isArray(s[collection]) || s[collection].length>(collection==='operations'?20:collection==='blocked'?1000:100))fail();
    const ids=new Set();
    for(const x of s[collection]) {
      if(typeof x.id!=='string'||!x.id.trim()||x.id.length>100||ids.has(x.id))fail();ids.add(x.id);
      validateEntity(s,collection,x,x.id);
    }
  }
  if(!Array.isArray(s.proposals)||!Array.isArray(s.committed))fail();
  const proposals=new Map();
  for(const p of s.proposals) {
    if(typeof p.id!=='string'||proposals.has(p.id)||!['OPTIMAL','FEASIBLE','INFEASIBLE','UNKNOWN'].includes(p.status))fail();
    if(!Number.isInteger(p.baseRevision)||p.baseRevision<0||p.baseRevision>s.revision||!Number.isInteger(p.baseVersion)||p.baseVersion<0||p.baseVersion>s.committed.length)fail();
    parseTime(p.createdAt,'候補作成日時'); validateInput(p.snapshot,p.period);
    if(['OPTIMAL','FEASIBLE'].includes(p.status) ? !validatePlan(p.snapshot,p.assignments,p.period) : !Array.isArray(p.assignments)||p.assignments.length!==0)fail();
    proposals.set(p.id,p);
  }
  const approved=new Set();
  for(const [i,c] of s.committed.entries()) {
    const p=proposals.get(c.id);
    if(c.version!==i+1||!p||approved.has(c.id)||!['OPTIMAL','FEASIBLE'].includes(c.status)||!validatePlan(c.snapshot,c.assignments,c.period))fail();
    parseTime(c.committedAt,'確定日時');
    const {version,committedAt,...copy}=c;
    if(!isDeepStrictEqual(copy,p))fail(); approved.add(c.id);
  }
  return s;
}
