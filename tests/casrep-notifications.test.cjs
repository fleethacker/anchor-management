const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-11-05T12:00:00Z');
let clock = now;
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
const context = vm.createContext({ TextEncoder, crypto, URL, Date: ClockDate });
for (const id of ['casrep-document-model', 'casrep-reporting-model', 'casrep-notifications']) {
  const script = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'));
  assert.ok(script, 'Missing embedded model: ' + id);
  vm.runInContext(script[1], context, { filename: id });
}
const N = context.CasrepNotifications;
const R = context.CasrepReporting;
const iso = at => new Date(at).toISOString();
const ids = items => Array.from(items, item => item.id);
const clone = value => JSON.parse(JSON.stringify(value));
const source = { origin: 'http://127.0.0.1:4173', baseURI: 'http://127.0.0.1:4173/index.html', apiBase: '/api/v1', connected: false };
const key = N.storageKey(source);

function storage() {
  const data = new Map();
  return { getItem: name => data.get(name) ?? null, setItem: (name, value) => data.set(name, String(value)) };
}
function report(id = 'fictional-case', extras = {}) {
  const submittedAt = iso(now - 4 * DAY);
  return {
    id, profile: 'FLEET', number: '26001', title: 'FICTIONAL TEST EQUIPMENT',
    caseStatus: 'Active', stage: 'In review', revision: 1, messageType: 'INITIAL', category: 'C4',
    submittedAt, traffic: { text: '' }, events: [],
    reporting: {
      schemaVersion: 1, cycle: 0, pendingChanges: [],
      submissions: [{ id: 'submission-0', submittedAt, messageType: 'INITIAL', category: 'C4', etr: '' }]
    },
    ...extras
  };
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
let passed = 0;
function test(name, run) {
  clock = now;
  run();
  passed++;
  console.log('✓ ' + name);
}

test('notifications include ordered reminders and missing submission dates, excluding unsent and closed cases', () => {
  const soon = report('soon');
  soon.reporting.submissions[0].submittedAt = iso(now - 2 * DAY);
  const missing = report('missing', { submittedAt: '', reporting: { submissions: [], pendingChanges: [] } });
  const records = [soon, missing, report('overdue'), report('draft', { stage: 'Draft', submittedAt: '', reporting: { submissions: [] } }), report('closed', { caseStatus: 'Corrected' })];
  const items = N.items(records);
  assert.deepEqual(ids(items), ['overdue', 'soon', 'missing']);
  assert.deepEqual(Array.from(items, item => item.schedule.status), ['overdue', 'soon', 'missing']);
  for (const item of items) {
    assert.equal(item.id, item.record.id);
    assert.match(item.fingerprint, /^[a-f0-9]{64}$/);
  }
});

test('one reminder can be cleared, persists after reopening, and can be restored', () => {
  const adapter = storage(), store = N.createStore(adapter, key);
  const items = N.items([report('first'), report('second')]);
  assert.equal(store.dismiss([items[0]]), true);
  assert.deepEqual(ids(store.partition(items).visible), ['second']);
  assert.deepEqual(ids(store.partition(items).dismissed), ['first']);
  const reopened = N.createStore(adapter, key);
  assert.deepEqual(ids(reopened.partition(items).dismissed), ['first']);
  assert.equal(reopened.restore([items[0]]), true);
  assert.deepEqual(ids(N.createStore(adapter, key).partition(items).visible), ['first', 'second']);
});

test('clear all includes missing-date reminders and restoring all is persistent', () => {
  const adapter = storage(), store = N.createStore(adapter, key);
  const items = N.items([report('overdue'), report('missing', { submittedAt: '', reporting: { submissions: [] } })]);
  assert.equal(store.dismiss(items), true);
  assert.deepEqual(ids(store.partition(items).visible), []);
  assert.deepEqual(ids(N.createStore(adapter, key).partition(items).dismissed), ['overdue', 'missing']);
  assert.equal(store.restore(items), true);
  assert.deepEqual(ids(N.createStore(adapter, key).partition(items).visible), ['overdue', 'missing']);
});

test('due-soon, due-today, and overdue escalation each surface a fresh reminder', () => {
  const record = report(), store = N.createStore(storage(), key);
  record.reporting.submissions[0].submittedAt = iso(now - 2 * DAY);
  const soon = N.items([record], now);
  assert.equal(soon[0].schedule.status, 'soon');
  store.dismiss(soon);
  const due = N.items([record], now + DAY);
  assert.equal(due[0].schedule.status, 'due');
  assert.deepEqual(ids(store.partition(due).visible), [record.id]);
  store.dismiss(due);
  const overdue = N.items([record], now + 2 * DAY);
  assert.equal(overdue[0].schedule.status, 'overdue');
  assert.deepEqual(ids(store.partition(overdue).visible), [record.id]);
});

test('an unchanged required update resurfaces as its deadline approaches and passes', () => {
  const record = report(), store = N.createStore(storage(), key);
  record.reporting.submissions[0].submittedAt = iso(now);
  record.reporting.pendingChanges = [{ kind: 'parts', detail: 'FICTIONAL PART STATUS CHANGED', at: iso(now) }];
  const changes = JSON.stringify(record.reporting.pendingChanges);
  let previous;
  for (const [offset, dayDelta, status] of [[0, 3, 'required'], [2, 1, 'required'], [3, 0, 'required'], [4, -1, 'overdue']]) {
    const items = N.items([record], now + offset * DAY);
    assert.equal(items[0].schedule.dayDelta, dayDelta);
    assert.equal(items[0].schedule.status, status);
    assert.deepEqual(ids(store.partition(items).visible), [record.id]);
    if (previous) assert.notEqual(items[0].fingerprint, previous);
    store.dismiss(items);
    assert.deepEqual(ids(store.partition(items).visible), []);
    previous = items[0].fingerprint;
  }
  assert.equal(JSON.stringify(record.reporting.pendingChanges), changes);
});

test('daily overdue labels and unrelated report revisions do not revive cleared reminders', () => {
  const record = report(), store = N.createStore(storage(), key);
  const first = N.items([record], now);
  store.dismiss(first);
  const edited = clone(record);
  edited.revision++;
  edited.updatedAt = iso(now + DAY);
  edited.title = 'FICTIONAL TITLE CORRECTION';
  edited.reporting.submissions[0].revision = 2;
  const later = N.items([edited], now + 2 * DAY);
  assert.notEqual(R.label(first[0].schedule), R.label(later[0].schedule));
  assert.equal(first[0].fingerprint, later[0].fingerprint);
  assert.deepEqual(ids(store.partition(later).visible), []);
});

test('a new submitted reporting cycle resurfaces even when urgency and due time match', () => {
  const record = report(), store = N.createStore(storage(), key);
  const before = N.items([record]);
  store.dismiss(before);
  record.reporting.cycle = 1;
  record.reporting.submissions[0].id = 'submission-1';
  record.reporting.submissions[0].messageType = 'UPDATE';
  const after = N.items([record]);
  assert.equal(before[0].schedule.dueAt, after[0].schedule.dueAt);
  assert.notEqual(before[0].fingerprint, after[0].fingerprint);
  assert.deepEqual(ids(store.partition(after).visible), [record.id]);
});

test('new material changes revive already-overdue reminders and change order does not', () => {
  const record = report(), store = N.createStore(storage(), key);
  record.reporting.pendingChanges = [{ kind: 'condition', detail: 'FICTIONAL CONDITION CHANGED', at: iso(now - DAY) }];
  const first = N.items([record]);
  store.dismiss(first);
  record.materialChanges = [{ kind: 'parts', source: 'requisition', requisitionId: 'fictional-req', detail: 'FICTIONAL PART RECEIVED', at: iso(now) }];
  const changed = N.items([record]);
  assert.equal(changed[0].schedule.status, 'overdue');
  assert.notEqual(first[0].fingerprint, changed[0].fingerprint);
  assert.deepEqual(ids(store.partition(changed).visible), [record.id]);
  store.dismiss(changed);
  const reordered = clone(record);
  reordered.reporting.pendingChanges = [{ ...record.materialChanges[0] }];
  reordered.materialChanges = [{ at: record.reporting.pendingChanges[0].at, detail: 'FICTIONAL CONDITION CHANGED', kind: 'condition' }];
  assert.equal(N.items([reordered])[0].fingerprint, changed[0].fingerprint);
  assert.deepEqual(ids(store.partition(N.items([reordered])).visible), []);
});

test('changed submitted ETRs and categories resurface reminders, including unchanged limiting deadlines', () => {
  const record = report(), store = N.createStore(storage(), key);
  const first = N.items([record]);
  store.dismiss(first);
  record.reporting.submissions[0].etr = iso(now + 10 * DAY);
  const laterETR = N.items([record]);
  assert.equal(laterETR[0].schedule.dueAt, first[0].schedule.dueAt);
  assert.deepEqual(ids(store.partition(laterETR).visible), [record.id]);
  record.reporting.submissions[0].etr = iso(now - 2 * DAY);
  const earlierETR = N.items([record]);
  assert.notEqual(earlierETR[0].schedule.dueAt, first[0].schedule.dueAt);
  store.dismiss(earlierETR);
  record.reporting.submissions[0].category = 'C3';
  const changedCategory = N.items([record]);
  assert.equal(changedCategory[0].schedule.dueAt, earlierETR[0].schedule.dueAt);
  assert.deepEqual(ids(store.partition(changedCategory).visible), [record.id]);
});

test('acknowledging reminders leaves canonical traffic, workflow, history, and deadlines unchanged', () => {
  const record = freeze(report('immutable', { events: [{ at: iso(now), action: 'fictional history' }] }));
  const before = JSON.stringify(record), due = R.resolve(record, now).dueAt;
  const items = N.items([record]), store = N.createStore(storage(), key);
  store.dismiss(items);
  store.partition(items);
  store.restore(items);
  store.reload();
  assert.equal(JSON.stringify(record), before);
  assert.equal(R.resolve(record, now).dueAt, due);
});

test('dismissals are isolated by API endpoint, frontend origin, and static or connected mode', () => {
  const adapter = storage(), items = N.items([report()]), connectedSource = { ...source, connected: true };
  const connectedKey = N.storageKey(connectedSource);
  N.createStore(adapter, connectedKey).dismiss(items);
  for (const other of [
    source,
    { ...connectedSource, apiBase: '/other-api/v1' },
    { ...connectedSource, apiBase: 'https://example.invalid/api/v1' },
    { ...connectedSource, origin: 'http://127.0.0.1:4182', baseURI: 'http://127.0.0.1:4182/index.html' }
  ]) {
    const otherKey = N.storageKey(other);
    assert.notEqual(otherKey, connectedKey);
    assert.deepEqual(ids(N.createStore(adapter, otherKey).partition(items).visible), ['fictional-case']);
  }
  assert.equal(N.storageKey({ ...connectedSource, apiBase: source.origin + '/api/v1/' }), connectedKey);
});

test('clearing and restoring a profile subset preserves dismissals in other profiles', () => {
  const adapter = storage(), store = N.createStore(adapter, key);
  const fleet = N.items([report('fleet')]);
  const training = N.items([report('training', { profile: 'TRAINING' })]);
  store.dismiss(training);
  store.partition(fleet);
  store.dismiss(fleet);
  assert.deepEqual(ids(store.partition(training).dismissed), ['training']);
  store.restore(fleet);
  const reopened = N.createStore(adapter, key);
  assert.deepEqual(ids(reopened.partition(fleet).visible), ['fleet']);
  assert.deepEqual(ids(reopened.partition(training).dismissed), ['training']);
});

test('another tab observes persisted dismissals and restores after reload', () => {
  const adapter = storage(), first = N.createStore(adapter, key), second = N.createStore(adapter, key);
  const items = N.items([report()]);
  first.dismiss(items);
  second.reload();
  assert.deepEqual(ids(second.partition(items).dismissed), ['fictional-case']);
  second.restore(items);
  first.reload();
  assert.deepEqual(ids(first.partition(items).visible), ['fictional-case']);
});

test('clearing separate reminders from two tabs does not overwrite either dismissal', () => {
  const adapter = storage(), first = N.createStore(adapter, key), second = N.createStore(adapter, key);
  const items = N.items([report('first'), report('second')]);
  first.dismiss([items[0]]);
  second.dismiss([items[1]]);
  first.reload();
  assert.deepEqual(ids(first.partition(items).dismissed), ['first', 'second']);
  first.restore([items[0]]);
  second.reload();
  assert.deepEqual(ids(second.partition(items).visible), ['first']);
  assert.deepEqual(ids(second.partition(items).dismissed), ['second']);
});

test('corrupt or unsupported stored state cannot hide current reminders', () => {
  const items = N.items([report()]);
  for (const invalid of ['not json', 'null', '[]', '42', '{"version":999,"entries":[]}', '{"entries":[{"id":"fictional-case","fingerprint":123}]}']) {
    const adapter = storage();
    adapter.setItem(key, invalid);
    const store = N.createStore(adapter, key);
    assert.deepEqual(ids(store.partition(items).visible), ['fictional-case']);
    assert.equal(store.dismiss(items), true);
    assert.deepEqual(ids(N.createStore(adapter, key).partition(items).dismissed), ['fictional-case']);
  }
});

test('blocked persistence reports failure while clearing and restoring still work in memory', () => {
  const unavailable = {
    getItem() { throw new Error('Storage unavailable'); },
    setItem() { throw new Error('Storage unavailable'); }
  };
  const store = N.createStore(unavailable, key), items = N.items([report()]);
  assert.deepEqual(ids(store.partition(items).visible), ['fictional-case']);
  assert.equal(store.dismiss(items), false);
  assert.deepEqual(ids(store.partition(items).dismissed), ['fictional-case']);
  store.reload();
  assert.deepEqual(ids(store.partition(items).dismissed), ['fictional-case']);
  assert.equal(store.restore(items), false);
  assert.deepEqual(ids(store.partition(items).visible), ['fictional-case']);
});

test('quota failures keep in-memory clear state when reads remain available', () => {
  const store = N.createStore({ getItem: () => null, setItem() { throw new Error('Quota exceeded'); } }, key);
  const items = N.items([report()]);
  assert.equal(store.dismiss(items), false);
  assert.deepEqual(ids(store.partition(items).dismissed), ['fictional-case']);
  assert.equal(store.restore(items), false);
  assert.deepEqual(ids(store.partition(items).visible), ['fictional-case']);
});

console.log(passed + ' notification tests passed.');
