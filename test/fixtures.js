export const t = slot => new Date(Date.UTC(2026, 10, 2) + slot * 1800000).toISOString().replace('.000Z', 'Z');
export const period = { start: t(0), end: t(6) };
export function fixture(duration = 2) {
  return {
    farm: { name: '模擬農場' },
    fields: [{ id: 'F1', name: '模擬圃場1' }, { id: 'F2', name: '模擬圃場2' }],
    workers: [{ id: 'W1', name: '模擬作業員1', availability: [period] }],
    machines: [], blocked: [],
    operations: ['F1', 'F2'].map((fieldId, i) => ({ id: `O${i}`, name: `模擬作業${i}`, fieldId, duration, earliest: t(0), deadline: t(6), machineType: null, predecessors: [] })),
  };
}
