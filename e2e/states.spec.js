import { test, expect } from '@playwright/test';
import { demoState, demoPeriod } from '../scripts/seed.mjs';
import { makeProposal } from '../src/core.js';
for(const status of ['OPTIMAL','FEASIBLE','INFEASIBLE','UNKNOWN'])test(`PF-06: ${status} browser explanation (mocked API state)`,async({page})=>{
  const sample=makeProposal(demoState(),demoPeriod,2000);sample.proposal.status=status;
  if(['INFEASIBLE','UNKNOWN'].includes(status)){sample.proposal.assignments=[];sample.proposal.makespan=null;}
  sample.state.proposals=[sample.proposal];
  await page.route('**/api/state',route=>route.fulfill({json:sample.state}));
  await page.goto('/');await page.getByRole('button',{name:'3 · 計画と比較'}).click();
  await expect(page.locator('#proposal .status')).toHaveText(status);
  if(status==='UNKNOWN')await expect(page.locator('#proposal')).toContainText('解なしの証明ではありません');
  if(status==='FEASIBLE')await expect(page.locator('#proposal')).toContainText('最適性は証明されていません');
  if(['INFEASIBLE','UNKNOWN'].includes(status))await expect(page.getByRole('button',{name:'この候補を承認して確定'})).toHaveCount(0);
});
