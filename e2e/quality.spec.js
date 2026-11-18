import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { resetCurrentEntities } from './fixtures.js';

test('PF-02: failed initial read has a working retry and preserves the selected view', async ({ page }) => {
  await page.route('**/api/state', route => route.abort(), { times: 1 });
  await page.goto('/#setup');
  await expect(page.locator('#application')).toBeHidden();
  await expect(page.getByRole('button', { name: '再読み込み' })).toBeFocused();
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.getByRole('button', { name: '基礎データ' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: '作業と条件' }).click();
  await page.goBack();
  await expect(page.getByRole('button', { name: '基礎データ' })).toHaveAttribute('aria-current', 'page');
});

test('PF-03: date controls save two periods, retain a failed draft, and support cancel', async ({ page, request }) => {
  await page.goto('/#setup');
  const form = page.locator('form[data-collection="workers"]');
  await form.getByRole('textbox', { name: '名前' }).fill('品質確認用の担当者');
  await form.getByRole('button', { name: '区間を追加' }).click();
  const starts = form.getByLabel('開始（JST）');
  const ends = form.getByLabel('終了（JST）');
  await starts.nth(0).fill('2026-11-02T09:00');
  await ends.nth(0).fill('2026-11-02T08:30');
  await form.getByRole('button', { name: '追加', exact: true }).click();
  await expect(form.getByRole('alert')).toHaveText('終了は開始より後の日時を指定してください。');
  await expect(ends.nth(0)).toBeFocused();
  await expect(starts.nth(0)).toHaveValue('2026-11-02T09:00');
  await ends.nth(0).fill('2026-11-02T12:00');
  await form.getByRole('button', { name: '区間を追加' }).click();
  await starts.nth(1).fill('2026-11-02T13:30');
  await ends.nth(1).fill('2026-11-02T16:00');
  await form.getByRole('button', { name: '追加', exact: true }).click();
  const record = page.locator('#workers-list .record').filter({ hasText: '品質確認用の担当者' });
  await expect(record).toBeVisible();
  await record.getByRole('button', { name: '編集' }).click();
  await expect(starts.nth(1)).toHaveValue('2026-11-02T13:30');
  await form.getByRole('button', { name: '稼働なしにする' }).click();
  await expect(starts).toHaveCount(0);
  await form.getByRole('button', { name: 'キャンセル' }).click();
  const data = await (await request.get('/api/state')).json();
  expect(data.workers.find(worker => worker.name === '品質確認用の担当者').availability).toEqual([
    { start: '2026-11-02T00:00:00Z', end: '2026-11-02T03:00:00Z' },
    { start: '2026-11-02T04:30:00Z', end: '2026-11-02T07:00:00Z' }
  ]);
});

test('PF-05/06: stale approval preserves history and real infeasibility gives a recovery path', async ({ page, request }) => {
  await resetCurrentEntities(request);
  const readState = async () => (await request.get('/api/state')).json();
  const update = async data => {
    const response = await request.post('/api/entities', { data });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  let state;
  const period = { start: '2026-11-02T00:00:00Z', end: '2026-11-02T08:00:00Z' };
  state = await update({ collection: 'fields', action: 'create', data: { name: '確認用の圃場' } });
  const fieldId = state.fields[0].id;
  state = await update({ collection: 'workers', action: 'create', data: { name: '確認用の担当者', availability: [period] } });
  const worker = state.workers[0];
  state = await update({
    collection: 'operations', action: 'create',
    data: { name: '確認作業', fieldId, duration: 2, earliest: period.start, deadline: period.end, machineType: null, predecessors: [] }
  });
  const committed = state.committed;
  await page.goto('/#plan');
  const generate = page.getByRole('button', { name: '候補を生成', exact: true });
  await generate.click();
  const approve = page.getByRole('button', { name: 'この候補を承認して確定' });
  await expect(approve).toBeEnabled();
  await update({ collection: 'workers', action: 'update', id: worker.id, data: { ...worker, availability: [] } });
  await approve.click();
  await expect(page.locator('#message')).toContainText('再計画してください');
  await expect(approve).toBeDisabled();
  await generate.click();
  await expect(page.locator('.status')).toHaveText('割当不可');
  await expect(page.locator('#proposal')).toContainText('稼働できる作業員がいません');
  await expect(approve).toHaveCount(0);
  expect((await readState()).committed).toEqual(committed);
});

test('PF-02/03/05: first-run checklist leads from empty workspace to plan entirely through the UI', async ({ page, request }) => {
  await resetCurrentEntities(request);
  const previous = (await (await request.get('/api/state')).json()).committed;
  await page.goto('/#plan');
  await expect(page.getByRole('button', { name: '候補を生成', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: '圃場を登録する' }).click();
  const field = page.locator('form[data-collection="fields"]');
  await expect(field.getByLabel('圃場名')).toBeFocused();
  await field.getByLabel('圃場名').fill('はじめての圃場（模擬）');
  await field.getByRole('button', { name: '追加', exact: true }).click();
  await expect(page.locator('#fields-list')).toContainText('はじめての圃場');
  await page.getByRole('button', { name: '計画と比較', exact: true }).click();
  await page.getByRole('link', { name: '作業員と稼働時間を登録する' }).click();
  const worker = page.locator('form[data-collection="workers"]');
  await expect(worker.getByLabel('名前')).toBeFocused();
  await worker.getByLabel('名前').fill('はじめての担当者（模擬）');
  await worker.getByRole('button', { name: '区間を追加' }).click();
  await worker.getByLabel('開始（JST）').fill('2026-11-02T09:00');
  await worker.getByLabel('終了（JST）').fill('2026-11-02T17:00');
  if (process.env.E2E_CAPTURE_DIR) {
    await fs.mkdir(process.env.E2E_CAPTURE_DIR, { recursive: true });
    await worker.locator('.availability').screenshot({
      path: process.env.E2E_CAPTURE_DIR + '/availability-390.jpg', quality: 86
    });
  }
  await worker.getByRole('button', { name: '追加', exact: true }).click();
  await expect(page.locator('#workers-list')).toContainText('はじめての担当者');
  await page.getByRole('button', { name: '計画と比較', exact: true }).click();
  await page.getByRole('link', { name: '作業を追加する' }).click();
  const operation = page.locator('form[data-collection="operations"]');
  await operation.getByLabel('作業名').fill('はじめての作業');
  await operation.getByRole('combobox', { name: '圃場', exact: true }).selectOption({ label: 'はじめての圃場（模擬）' });
  await operation.getByLabel('最早開始').fill('2026-11-02T09:00');
  await operation.getByLabel('最遅終了').fill('2026-11-02T17:00');
  await operation.getByRole('button', { name: '追加', exact: true }).click();
  const record = page.locator('#operations-list .record').filter({ hasText: 'はじめての作業' });
  await record.getByRole('button', { name: '複製', exact: true }).click();
  await expect(operation.getByLabel('作業名')).toHaveValue('はじめての作業（複製）');
  await operation.getByRole('button', { name: '複製を登録' }).click();
  await expect(record).toHaveCount(2);
  await page.getByRole('button', { name: '計画と比較', exact: true }).click();
  await expect(page.locator('#onboarding')).toBeHidden();
  await page.getByRole('button', { name: '候補を生成', exact: true }).click();
  await expect(page.locator('.status')).toHaveText('最適解');
  await expect(page.locator('#proposal')).toContainText('2件の割当');
  await page.getByRole('button', { name: 'この候補を承認して確定' }).click();
  await expect(page.locator('#message')).toContainText('を保存しました');
  const after = (await (await request.get('/api/state')).json()).committed;
  expect(after.slice(0, -1)).toEqual(previous);
  expect(after.at(-1).assignments).toHaveLength(2);
});
