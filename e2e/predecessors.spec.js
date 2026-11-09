import { test, expect } from '@playwright/test';
test('PF-03 / FR-008: name-only edit retains all predecessor IDs', async ({ page, request }) => {
  const create = async (collection, data) => {
    const response = await request.post('/api/entities', { data: { collection, action: 'create', data } });
    expect(response.ok()).toBeTruthy(); return response.json();
  };
  let s = await create('fields', { name: '回帰試験の模擬圃場' });
  const fieldId = s.fields.at(-1).id;
  const base = { fieldId, duration: 1, earliest: '2026-11-02T00:00:00Z', deadline: '2026-11-02T03:00:00Z', machineType: null, predecessors: [] };
  s = await create('operations', { ...base, name: '先行A' }); const a = s.operations.at(-1).id;
  s = await create('operations', { ...base, name: '先行B' }); const b = s.operations.at(-1).id;
  s = await create('operations', { ...base, name: '後続C', predecessors: [a,b] }); const c = s.operations.at(-1).id;
  await page.goto('/'); await page.getByRole('button', { name: '2 · 作業と条件' }).click();
  await page.locator('#operations-list .record').filter({ hasText: '後続C' }).getByRole('button', { name: '編集', exact: true }).click();
  const form = page.locator('form[data-collection="operations"]');
  await expect(form.locator('[name="predecessor"] option:checked')).toHaveCount(2);
  await form.locator('[name="name"]').fill('後続C（名称のみ変更）');
  await form.getByRole('button', { name: '変更を保存' }).click();
  await expect(page.locator('#operations-list')).toContainText('後続C（名称のみ変更）');
  s = await (await request.get('/api/state')).json();
  expect(s.operations.find(x => x.id === c).predecessors).toEqual([a,b]);
});
