const $ = selector => document.querySelector(selector);
const sections = ['plan', 'tasks', 'setup', 'history'];
const timeFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit'
});
const clockFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const tickFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
});
const local = value => value ? timeFormat.format(new Date(value)) : '—';
const inputTime = value => value ? new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16) : '';
const resourceName = (collection, id, snapshot) => snapshot[collection].find(item => item.id === id)?.name ?? '不明';
let state;
let busy = false;
let selectedTab;

function node(tag, text = '', className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function action(text, handler, className = 'secondary') {
  const button = node('button', text, className);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}

async function api(path, body) {
  let response;
  try {
    response = await fetch(path, body === undefined ? undefined : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
  } catch {
    throw new Error('サーバーに接続できません。接続を確認して再試行してください。');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    const error = new Error(result?.message ?? '処理に失敗しました。時間をおいて再試行してください。');
    error.code = result?.code;
    throw error;
  }
  return result;
}

function show(message, kind = '') {
  $('#message').textContent = message;
  $('#message').dataset.kind = kind;
}

function showError(form, error) {
  const errorBox = form?.querySelector('.form-error');
  if (errorBox) {
    errorBox.hidden = false;
    errorBox.textContent = error.message;
  } else {
    show(error.message, 'error');
  }
  // Keep the correction close to the input that triggered it.
  const target = error.field ?? errorBox ?? $('#message');
  target.focus();
}

async function run(task, { form, pending } = {}) {
  if (busy) return;
  busy = true;
  show(pending ?? '');
  const errorBox = form?.querySelector('.form-error');
  if (errorBox) errorBox.hidden = true;
  const submit = form?.querySelector('button.primary');
  const wasDisabled = submit?.disabled;
  if (submit) submit.disabled = true;
  form?.setAttribute('aria-busy', 'true');
  let error;
  try {
    await task();
    if ($('#message').textContent === pending) show('');
  } catch (failure) {
    error = failure;
    show('');
  } finally {
    busy = false;
    if (submit) submit.disabled = wasDisabled;
    form?.removeAttribute('aria-busy');
  }
  if (error) showError(form, error);
}

function selectTab(tab, { updateUrl = true } = {}) {
  if (!sections.includes(tab)) tab = 'plan';
  selectedTab = tab;
  for (const button of document.querySelectorAll('.tabs button')) {
    const active = button.dataset.tab === tab;
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    $('#' + button.dataset.tab).hidden = !active;
  }
  if (updateUrl && location.hash !== '#' + tab) history.pushState(null, '', '#' + tab);
}

for (const button of document.querySelectorAll('.tabs button')) {
  button.addEventListener('click', () => selectTab(button.dataset.tab));
}
window.addEventListener('popstate', () => selectTab(location.hash.slice(1), { updateUrl: false }));
window.addEventListener('hashchange', () => {
  const tab = location.hash.slice(1);
  if (sections.includes(tab)) selectTab(tab, { updateUrl: false });
});

function inputError(input, message) {
  const error = new Error(message);
  error.field = input;
  return error;
}

function readTime(input) {
  if (!input.value) throw inputError(input, '日時を入力してください。');
  const date = new Date(input.value + ':00+09:00');
  if (!Number.isFinite(date.getTime()) || date.getTime() % 1800000 !== 0) {
    throw inputError(input, '日時は30分単位（00分または30分）で指定してください。');
  }
  return date.toISOString().replace('.000Z', 'Z');
}

function readPeriod(startInput, endInput) {
  const start = readTime(startInput);
  const end = readTime(endInput);
  if (Date.parse(end) <= Date.parse(start)) {
    throw inputError(endInput, '終了は開始より後の日時を指定してください。');
  }
  return { start, end };
}

function periodInput(text, value, name) {
  const label = node('label', text);
  const input = node('input');
  input.type = 'datetime-local';
  input.name = name;
  input.step = 1800;
  input.required = true;
  input.value = inputTime(value);
  label.append(input);
  return label;
}

function renderAvailability(editor, periods) {
  const legend = editor.querySelector('legend');
  const empty = node('p', '稼働なし', 'empty');
  const rows = node('div');
  const buttons = node('div', '', 'availability-actions');
  const add = action('区間を追加', () => appendPeriod({}, true));
  const clear = action('稼働なしにする', () => {
    rows.replaceChildren();
    synchronize();
    add.focus();
  });
  buttons.append(add, clear);
  function synchronize() {
    empty.hidden = rows.childElementCount > 0;
    clear.hidden = !empty.hidden;
  }
  function appendPeriod(period, focus) {
    const row = node('div', '', 'period-row');
    const start = periodInput('開始（JST）', period.start, 'availability-start');
    const end = periodInput('終了（JST）', period.end, 'availability-end');
    const remove = action('削除', () => {
      const next = row.nextElementSibling ?? row.previousElementSibling;
      row.remove();
      synchronize();
      (next?.querySelector('input') ?? add).focus();
    });
    remove.setAttribute('aria-label', 'この稼働区間を削除');
    row.append(start, end, remove);
    rows.append(row);
    synchronize();
    if (focus) start.querySelector('input').focus();
  }
  editor.replaceChildren(legend, empty, rows, buttons);
  periods.forEach(period => appendPeriod(period, false));
  synchronize();
}

function readAvailability(form) {
  return [...form.querySelectorAll('.period-row')].map(row =>
    readPeriod(row.querySelector('[name="availability-start"]'), row.querySelector('[name="availability-end"]'))
  );
}

function populateSelect(select, items, placeholder) {
  const current = select.value;
  select.replaceChildren(new Option(placeholder, ''));
  for (const item of items) select.add(new Option(item.name, item.id));
  if (items.some(item => item.id === current)) select.value = current;
}

function populatePredecessors(ids, excludedId) {
  const container = $('#predecessor-options');
  container.replaceChildren();
  for (const operation of state.operations) {
    if (operation.id === excludedId) continue;
    const label = node('label', '', 'check-option');
    const input = node('input');
    input.type = 'checkbox';
    input.name = 'predecessor';
    input.value = operation.id;
    input.checked = ids.includes(operation.id);
    label.append(input, node('span', operation.name));
    container.append(label);
  }
  if (!container.childElementCount) container.append(node('small', '登録済みの作業がありません。'));
}

function renderOptions() {
  for (const select of document.querySelectorAll('select[name="fieldId"]')) {
    populateSelect(select, state.fields, '圃場を選択');
  }
  const operations = $('form[data-collection="operations"]');
  const machine = operations.elements.machineType;
  const types = new Set(state.machines.map(item => item.type));
  if (machine.value) types.add(machine.value);
  populateSelect(machine, [...types].map(type => ({ id: type, name: type })), '農機なし');
  const predecessors = new FormData(operations).getAll('predecessor');
  populatePredecessors(predecessors, operations.dataset.editId);
}

function resetForm(form) {
  form.reset();
  delete form.dataset.editId;
  form.querySelector('button.primary').textContent = '追加';
  form.querySelector('[data-cancel]').hidden = true;
  form.querySelector('.form-error').hidden = true;
  const availability = form.querySelector('.availability');
  if (availability) renderAvailability(availability, []);
  if (form.dataset.collection === 'operations') {
    populatePredecessors([], null);
  }
}

function editRecord(collection, item, duplicate = false) {
  const form = $(`form[data-collection="${collection}"]`);
  resetForm(form);
  if (!duplicate) form.dataset.editId = item.id;
  for (const name of ['name', 'type', 'fieldId', 'duration', 'machineType']) {
    const input = form.elements.namedItem(name);
    if (!input) continue;
    if (name === 'machineType' && item[name] && ![...input.options].some(option => option.value === item[name])) {
      input.add(new Option(item[name], item[name]));
    }
    input.value = item[name] ?? '';
  }
  for (const name of ['earliest', 'deadline', 'start', 'end']) {
    const input = form.elements.namedItem(name);
    if (input) input.value = inputTime(item[name]);
  }
  if (duplicate) form.elements.name.value = item.name.slice(0, 95) + '（複製）';
  if (collection === 'operations') populatePredecessors(item.predecessors, duplicate ? null : item.id);
  const editor = form.querySelector('.availability');
  if (editor) renderAvailability(editor, item.availability);
  form.querySelector('button.primary').textContent = duplicate ? '複製を登録' : '変更を保存';
  form.querySelector('[data-cancel]').hidden = false;
  form.querySelector('input, select').focus();
}

function renderRecords() {
  for (const collection of ['fields', 'workers', 'machines', 'operations', 'blocked']) {
    const container = $('#' + collection + '-list');
    container.replaceChildren();
    for (const item of state[collection]) {
      const title = item.name ?? resourceName('fields', item.fieldId, state);
      let detail = '';
      if (collection === 'workers' || collection === 'machines') {
        const hours = item.availability.map(period => `${local(period.start)}〜${local(period.end)}`).join(' / ');
        detail = (item.type ? item.type + ' · ' : '') + (hours || '稼働なし');
      }
      if (collection === 'operations') {
        detail = `${resourceName('fields', item.fieldId, state)} · ${item.duration * 30}分 · ${local(item.earliest)}〜${local(item.deadline)}`;
        if (item.machineType) detail += ' · ' + item.machineType;
        if (item.predecessors.length) detail += ' · 先行: ' + item.predecessors.map(id => resourceName('operations', id, state)).join('、');
      }
      if (collection === 'blocked') detail = `${local(item.start)}〜${local(item.end)}`;
      const row = node('div', '', 'record');
      const info = node('div');
      info.append(node('strong', title), node('small', detail));
      const actions = node('div', '', 'record-actions');
      actions.append(action('編集', () => editRecord(collection, item)));
      if (collection === 'operations') actions.append(action('複製', () => editRecord(collection, item, true)));
      actions.append(action('削除', () => {
        if (busy || !confirm(`「${title}」を削除しますか？`)) return;
        run(async () => {
          state = await api('/api/entities', { collection, action: 'delete', id: item.id });
          const form = $(`form[data-collection="${collection}"]`);
          if (form.dataset.editId === item.id) resetForm(form);
          render();
          show('削除しました。', 'success');
        });
      }, 'danger'));
      row.append(info, actions);
      container.append(row);
    }
    if (!container.childElementCount) container.append(node('small', '登録はありません。'));
  }
}

function sortedAssignments(assignments) {
  return [...assignments].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

function assignmentList(assignments, snapshot) {
  const list = node('ul', '', 'assignments');
  list.setAttribute('aria-label', '割当一覧（日本時間）');
  for (const assignment of sortedAssignments(assignments)) {
    const operation = snapshot.operations.find(item => item.id === assignment.operationId);
    const row = node('li');
    const task = node('div');
    task.append(node('strong', operation?.name ?? '不明'), node('small', resourceName('fields', operation?.fieldId, snapshot)));
    const schedule = node('div', `${local(assignment.start)} → ${local(assignment.end)}`);
    const resources = node('div', resourceName('workers', assignment.workerId, snapshot));
    resources.append(node('small', assignment.machineId ? resourceName('machines', assignment.machineId, snapshot) : '農機なし'));
    row.append(task, schedule, resources);
    list.append(row);
  }
  return list;
}

function timeline(proposal) {
  const wrapper = node('div', '', 'timeline');
  wrapper.tabIndex = 0;
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', '作業タイムライン（横スクロール可）');
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  function draw(tag, attributes, text) {
    const element = document.createElementNS(namespace, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (text) element.textContent = text;
    svg.append(element);
    return element;
  }
  const height = 54 + proposal.assignments.length * 33;
  svg.setAttribute('viewBox', `0 0 1000 ${height}`);
  svg.setAttribute('aria-hidden', 'true');
  const start = Date.parse(proposal.period.start);
  const span = Date.parse(proposal.period.end) - start;
  const sameDate = inputTime(proposal.period.start).slice(0, 10) === inputTime(proposal.period.end).slice(0, 10);
  const format = sameDate ? clockFormat : tickFormat;
  for (let index = 0; index <= 4; index++) {
    const x = 210 + index * 190;
    draw('line', { x1: x, y1: 30, x2: x, y2: height - 8, class: 'time-grid' });
    draw('text', { x, y: 20, 'text-anchor': index === 4 ? 'end' : 'middle', class: 'time-label' },
      format.format(new Date(start + span * index / 4)));
  }
  sortedAssignments(proposal.assignments).forEach((assignment, index) => {
    const y = 38 + index * 33;
    const operation = proposal.snapshot.operations.find(item => item.id === assignment.operationId);
    draw('text', { x: 8, y: y + 16, class: 'time-operation' }, operation.name.slice(0, 12));
    draw('rect', {
      x: 210 + 760 * (Date.parse(assignment.start) - start) / span, y,
      width: Math.max(2, 760 * (Date.parse(assignment.end) - Date.parse(assignment.start)) / span),
      height: 23, rx: 4, class: 'time-bar'
    });
  });
  wrapper.append(svg);
  return wrapper;
}

function comparison(proposal, previous) {
  const section = node('section');
  const diffs = [];
  const old = new Map(previous.assignments.map(item => [item.operationId, item]));
  const labels = { start: '開始', end: '終了', workerId: '担当者', machineId: '農機', fieldId: '圃場' };
  function attributes(assignment, snapshot) {
    const op = snapshot.operations.find(item => item.id === assignment.operationId);
    return {
      start: local(assignment.start), end: local(assignment.end),
      workerId: resourceName('workers', assignment.workerId, snapshot),
      machineId: assignment.machineId ? resourceName('machines', assignment.machineId, snapshot) : 'なし',
      fieldId: resourceName('fields', op?.fieldId, snapshot)
    };
  }
  for (const assignment of proposal.assignments) {
    const before = old.get(assignment.operationId);
    const name = resourceName('operations', assignment.operationId, proposal.snapshot);
    if (!before) diffs.push(node('div', name + ' · 追加', 'diff'));
    else {
      const original = attributes(before, previous.snapshot);
      const changed = attributes(assignment, proposal.snapshot);
      const fields = Object.keys(labels).filter(key =>
        original[key] !== changed[key] || (key.endsWith('Id') && before[key] !== assignment[key])
      );
      if (fields.length) {
        const card = node('div', '', 'diff');
        const list = node('ul');
        for (const key of fields) {
          const entry = node('li', labels[key] + ' ');
          entry.append(node('span', original[key], 'empty'), ' → ', node('strong', changed[key]));
          list.append(entry);
        }
        card.append(node('strong', name), list);
        diffs.push(card);
      }
    }
    old.delete(assignment.operationId);
  }
  for (const id of old.keys()) diffs.push(node('div', resourceName('operations', id, previous.snapshot) + ' · 計画対象から削除', 'diff'));
  section.append(node('h3', `確定版 v${previous.version} との差分${diffs.length ? ' · ' + diffs.length + '件' : ''}`));
  section.append(...(diffs.length ? diffs : [node('p', '割当の変更はありません。', 'empty')]));
  return section;
}

function details(label, ...contents) {
  const disclosure = node('details');
  disclosure.append(node('summary', label), ...contents);
  return disclosure;
}

function renderProposal() {
  const container = $('#proposal');
  container.replaceChildren();
  const proposal = state.proposals.at(-1);
  if (!proposal) {
    container.append(node('div', '生成した計画候補はここに表示されます。', 'panel empty'));
    return;
  }
  const labels = { OPTIMAL: '最適解', FEASIBLE: '実行可能', INFEASIBLE: '割当不可', UNKNOWN: '未判定' };
  const panel = node('article', '', 'panel');
  const heading = node('div', '', 'proposal-heading');
  const badge = node('span', labels[proposal.status] ?? proposal.status, 'status ' + proposal.status);
  heading.append(node('h3', '計画候補'), badge);
  panel.append(heading, node('p',
    `${proposal.assignments.length}件の割当${proposal.makespan ? ' · 最終完了 ' + local(proposal.makespan) : ''}`, 'proposal-meta'));
  const hints = {
    UNKNOWN: '計算上限までに解が見つかりませんでした。解なしの証明ではありません。対象期間や作業条件を見直して再試行してください。',
    INFEASIBLE: '現在の条件では必須作業をすべて割り当てられません。担当者・農機の稼働時間、圃場の不可時間、作業の期限を確認してください。',
    FEASIBLE: '必須条件を満たす候補です。最適性は証明されていません。'
  };
  if (hints[proposal.status]) panel.append(node('p', hints[proposal.status], 'notice'));
  if (proposal.status === 'INFEASIBLE' && proposal.snapshot.workers.every(worker => !worker.availability.length)) {
    panel.append(node('p', '稼働できる作業員がいません。基礎データで稼働時間を登録してください。', 'notice'));
  }

  const previous = state.committed.at(-1);
  const confirmed = state.committed.find(entry => entry.id === proposal.id);
  if (proposal.assignments.length) {
    if (!confirmed && previous) panel.append(comparison(proposal, previous));
    if (confirmed) panel.append(node('p', `確定版 v${confirmed.version} として保存済みです。`, 'notice'));
    const graphic = details('タイムライン（日本時間）', timeline(proposal));
    graphic.open = matchMedia('(min-width: 761px)').matches;
    panel.append(graphic, details('割当一覧（日本時間）', assignmentList(proposal.assignments, proposal.snapshot)));
    const controls = node('div', '', 'approval');
    const approve = action('この候補を承認して確定', () => run(async () => {
      approve.disabled = true;
      try {
        const entry = await api('/api/commit', { proposalId: proposal.id });
        state.committed.push(entry);
        render();
        show(`確定版 v${entry.version} を保存しました。`, 'success');
        $('#message').focus();
      } catch (error) {
        if (error.code === 'STALE_PROPOSAL') {
          state = await api('/api/state');
          render();
        }
        throw error;
      } finally {
        if (approve.isConnected) approve.disabled = false;
      }
    }), 'primary');
    approve.disabled = Boolean(confirmed) || proposal.baseRevision !== state.revision || proposal.baseVersion !== state.committed.length;
    if (!confirmed && approve.disabled) controls.append(node('small', '入力または確定版が変わりました。新しい候補を生成してください。'));
    if (!confirmed) {
      controls.append(approve);
      panel.append(controls);
    }
  }
  panel.append(details('計算の詳細', node('p', `${proposal.status} · ${Number(proposal.elapsedMs).toFixed(1)}ms · 探索 ${proposal.nodes}ノード`, 'proposal-meta')));
  container.append(panel);
}

function renderHistory() {
  const container = $('#history-list');
  container.replaceChildren();
  for (const entry of [...state.committed].reverse()) {
    const article = node('article', '', 'panel');
    article.append(node('h3', `確定版 v${entry.version}`),
      node('p', `${local(entry.committedAt)} に確定 · 最終完了 ${local(entry.makespan)}`, 'proposal-meta'),
      details(`割当一覧（${entry.assignments.length}件）`, assignmentList(entry.assignments, entry.snapshot)));
    const conditions = entry.snapshot.workers.map(worker => node('p',
      `${worker.name}: ${worker.availability.map(period => `${local(period.start)}〜${local(period.end)}`).join(' / ') || '稼働なし'}`
    ));
    article.append(details('作成時の稼働条件',
      node('p', `計画期間 ${local(entry.period.start)}〜${local(entry.period.end)}`), ...conditions));
    container.append(article);
  }
  if (!container.childElementCount) container.append(node('p', '確定版はまだありません。', 'panel empty'));
}

function render() {
  const version = state.committed.at(-1);
  $('#current-version').textContent = version ? `v${version.version}` : '未確定';
  $('#current-date').textContent = version ? local(version.committedAt) : '';
  $('#resource-summary').textContent = `${state.farm.name} · 圃場 ${state.fields.length} · 作業員 ${state.workers.length} · 農機 ${state.machines.length} · 作業 ${state.operations.length}`;
  const missing = [
    [!state.fields.length, '圃場を登録する', 'setup', 'fields'],
    [!state.workers.length, '作業員と稼働時間を登録する', 'setup', 'workers'],
    [!state.operations.length, '作業を追加する', 'tasks', 'operations']
  ].filter(([needed]) => needed);
  $('#onboarding').hidden = missing.length === 0;
  $('#readiness').replaceChildren();
  for (const [, label, tab, collection] of missing) {
    const item = node('li');
    const link = node('a', label);
    link.href = '#' + tab;
    link.addEventListener('click', event => {
      event.preventDefault();
      selectTab(tab);
      document.querySelector('form[data-collection="' + collection + '"] input').focus();
    });
    item.append(link);
    $('#readiness').append(item);
  }
  const form = $('#plan-form');
  form.querySelector('button.primary').disabled = missing.length > 0;
  if (state.operations.length && !form.elements.start.value && !form.elements.end.value) {
    const start = Math.min(...state.operations.map(op => Date.parse(op.earliest)));
    const end = Math.max(...state.operations.map(op => Date.parse(op.deadline)));
    form.elements.start.value = inputTime(new Date(start));
    form.elements.end.value = inputTime(new Date(Math.min(end, start + 7 * 86400000)));
  }
  renderOptions();
  renderRecords();
  renderProposal();
  renderHistory();
}

for (const form of document.querySelectorAll('form')) {
  const errorBox = node('p', '', 'form-error');
  errorBox.hidden = true;
  errorBox.tabIndex = -1;
  errorBox.setAttribute('role', 'alert');
  form.querySelector('button.primary').before(errorBox);
}

for (const form of document.querySelectorAll('form[data-collection]')) {
  const buttons = node('div', '', 'form-actions');
  const cancel = action('キャンセル', () => {
    resetForm(form);
    form.querySelector('input, select').focus();
  });
  cancel.dataset.cancel = '';
  cancel.hidden = true;
  form.append(buttons);
  buttons.append(form.querySelector('button.primary'), cancel);
  const editor = form.querySelector('.availability');
  if (editor) renderAvailability(editor, []);
  form.addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      const collection = form.dataset.collection;
      const data = Object.fromEntries(new FormData(form));
      if (editor) {
        data.availability = readAvailability(form);
        delete data['availability-start'];
        delete data['availability-end'];
      }
      if (collection === 'operations') {
        const period = readPeriod(form.elements.earliest, form.elements.deadline);
        data.earliest = period.start;
        data.deadline = period.end;
        data.duration = Number(data.duration);
        data.machineType ||= null;
        data.predecessors = new FormData(form).getAll('predecessor');
        delete data.predecessor;
      }
      if (collection === 'blocked') Object.assign(data, readPeriod(form.elements.start, form.elements.end));
      const id = form.dataset.editId;
      state = await api('/api/entities', { collection, action: id ? 'update' : 'create', id, data });
      resetForm(form);
      render();
      show(id ? '変更を保存しました。' : '登録しました。', 'success');
    }, { form });
  });
}

$('#farm-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  run(async () => {
    state = await api('/api/entities', { collection: 'farm', action: 'update', data: { name: form.elements.name.value } });
    form.elements.name.value = state.farm.name;
    render();
    show('農場名を保存しました。', 'success');
  }, { form });
});

$('#plan-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  run(async () => {
    const period = readPeriod(form.elements.start, form.elements.end);
    if (Date.parse(period.end) - Date.parse(period.start) > 7 * 86400000) {
      throw inputError(form.elements.end, '計画期間は7日以内にしてください。');
    }
    const proposal = await api('/api/proposals', { period });
    state.proposals.push(proposal);
    renderProposal();
    show(proposal.assignments.length ? '候補を生成しました。割当と差分を確認できます。' : '計算が完了しました。結果の詳細を確認してください。', 'success');
    $('#message').focus();
  }, { form, pending: '候補を計算しています…' });
});

async function load() {
  const retry = $('#retry');
  retry.disabled = true;
  retry.hidden = true;
  $('#startup-message').textContent = '農場データを読み込んでいます…';
  try {
    state = await api('/api/state');
    $('#farm-form').elements.name.value = state.farm.name;
    const period = state.proposals.at(-1)?.period;
    if (period) {
      $('#plan-form').elements.start.value = inputTime(period.start);
      $('#plan-form').elements.end.value = inputTime(period.end);
    }
    render();
    selectTab(selectedTab ?? location.hash.slice(1), { updateUrl: false });
    $('#startup').hidden = true;
    $('#application').hidden = false;
  } catch (error) {
    $('#startup-message').textContent = error.message;
    retry.hidden = false;
    retry.disabled = false;
    retry.focus();
  }
}
$('#retry').addEventListener('click', load);
load();
