import { expect } from '@playwright/test';

export async function resetCurrentEntities(request) {
  if (process.env.E2E_URL && process.env.E2E_ALLOW_RESET !== '1') {
    throw new Error('External E2E target must be disposable; set E2E_ALLOW_RESET=1');
  }
  const readState = async () => (await request.get('/api/state')).json();
  const remove = async (collection, id) => {
    const response = await request.post('/api/entities', { data: { collection, action: 'delete', id } });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  let state = await readState();
  while (state.operations.length) {
    const leaf = state.operations.find(item => !state.operations.some(op => op.predecessors.includes(item.id)));
    expect(leaf).toBeTruthy();
    state = await remove('operations', leaf.id);
  }
  for (const collection of ['blocked', 'machines', 'workers', 'fields']) {
    for (const item of state[collection]) await remove(collection, item.id);
  }
}
