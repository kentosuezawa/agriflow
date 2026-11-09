import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { demoState, demoPeriod } from '../scripts/seed.mjs';
import { makeProposal, commitProposal } from '../src/core.js';
import { validateImport } from '../src/storage/import-validation.js';
test('PF-02/08: seed JSON is explicit and refuses overwrite of original data',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agriflow-seed-')),file=path.join(dir,'state.json');
  try {
    const run=()=>spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/seed.mjs',import.meta.url)),'--json'],{env:{...process.env,AGRIFLOW_DATA_FILE:file},encoding:'utf8'});
    assert.equal(run().status,0);const original=await fs.readFile(file,'utf8');assert.equal(JSON.parse(original).operations.length,4);
    assert.notEqual(run().status,0);assert.equal(await fs.readFile(file,'utf8'),original);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('PF-08: import rejects forged history rather than silently accepting a changed snapshot',()=>{
  const p=makeProposal(demoState(),demoPeriod,2000),s=commitProposal(p.state,p.proposal.id).state;
  assert.equal(validateImport(s),s);
  const forged=structuredClone(s);forged.committed[0].snapshot.farm.name='改変';
  assert.throws(()=>validateImport(forged));
});
