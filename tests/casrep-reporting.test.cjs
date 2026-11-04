const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const HOUR = 3600000, DAY = HOUR * 24;
const origin = Date.parse('2026-10-30T17:45:00Z');
let clock = origin;
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
const context = vm.createContext({ TextEncoder, crypto, Date: ClockDate });
for (const id of ['casrep-demo-catalog', 'casrep-aegis-model', 'casrep-aegis-demo', 'casrep-document-model', 'casrep-reporting-model', 'casrep-data-model']) {
  vm.runInContext(html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'))[1], context, { filename: id });
}
const D = context.CasrepDocument, R = context.CasrepReporting, C = context.CasrepCore;
const iso = at => new Date(at).toISOString();
const base = (category = 'C3', extras = {}) => ({ id: 'test', caseStatus: 'Active', stage: 'In review', category, messageType: 'INITIAL', submittedAt: iso(origin), ...extras });
let passed = 0;
function test(name, fn) { clock = origin; fn(); passed++; console.log('✓ ' + name); }
function storage() { const data = {}; return { getItem: key => data[key] || null, setItem: (key, value) => { data[key] = value; } }; }
function traffic() {
  const t = D.create({});
  t.text = fs.readFileSync(path.join(__dirname, '../sample-casreps/01_CASREP_26001_chilled-water.txt'), 'utf8');
  t.text = D.update(t.text, 'estimate', D.formatDtg(iso(origin + 60 * DAY)));
  return t;
}
function newReport(adapter = storage()) { const store = C.createStore(adapter), record = store.upsert({ traffic: traffic() }); return { store, record }; }
function approveAll(store, record) {
  for (const role of C.roles) record = store.transition(record.id, 'concur', { reviewId: role.id, reviewerId: 'demo-' + role.id });
  return store.transition(record.id, 'authorize', { reviewerId: 'demo-co' });
}

test('UTC intervals use the submission instant across month and daylight-saving boundaries', () => {
  for (const [category, hours] of [['C2', 720], ['C3', 240], ['C4', 72]]) {
    const d = R.resolve(base(category), origin);
    assert.equal(d.periodicAt, iso(origin + hours * HOUR));
    assert.equal(d.dueAt, d.periodicAt);
    assert.equal(d.status, 'scheduled');
  }
});
test('unsubmitted drafts do not inherit creation, discovery, edited dates, or old manual reminders', () => {
  const draft = base('C4', { stage: 'Draft', submittedAt: '', createdAt: iso(origin - 90 * DAY), discoveredAt: iso(origin - 80 * DAY), updatedAt: iso(origin), nextUpdateAt: iso(origin - DAY) });
  assert.equal(R.resolve(draft, origin).status, 'unsubmitted');
  assert.equal(R.resolve(draft, origin).dueAt, null);
});
test('missing, invalid, future and unsupported submission evidence never produces a false deadline', () => {
  for (const submittedAt of ['', 'not a date', iso(origin + HOUR)]) assert.equal(R.resolve(base('C3', { submittedAt }), origin).status, 'missing');
  assert.equal(R.resolve(base('C1'), origin).status, 'unsupported');
  assert.equal(R.resolve(base('C3', { stage: 'Release authorized', submittedAt: '', versions: [{ authorizedAt: iso(origin) }] }), origin).dueAt, null);
});
test('deadlines use UTC calendar days and stay due today until midnight', () => {
  const r = base('C4'), due = origin + 72 * HOUR;
  const midnight = Math.floor(due / DAY) * DAY;
  assert.equal(R.resolve(r, midnight - DAY - 1).status, 'scheduled');
  assert.equal(R.resolve(r, midnight - DAY).status, 'soon');
  for (const at of [midnight, due, due + HOUR, midnight + DAY - 1]) {
    assert.equal(R.resolve(r, at).status, 'due');
    assert.equal(R.label(R.resolve(r, at)), 'Due today');
  }
  assert.equal(R.resolve(r, midnight + DAY).status, 'overdue');
  assert.equal(R.label(R.resolve(r, midnight + DAY)), 'Overdue by 1 day');
  assert.equal(R.label(R.resolve(r, midnight + 2 * DAY)), 'Overdue by 2 days');
});
test('ETR requires the earlier 24-hour checkpoint and an expired ETR stays overdue', () => {
  const r = base('C2', { etr: iso(origin + 4 * DAY) });
  assert.equal(R.resolve(r, origin).dueAt, iso(origin + 3 * DAY));
  assert.equal(R.resolve(r, origin).reason, '24 hours before estimated repair');
  r.etr = iso(origin - DAY);
  assert.equal(R.resolve(r, origin).status, 'overdue');
});
test('DTGs round-trip in UTC and reject invalid dates, hours, minutes and months', () => {
  for (const input of ['290830ZFEB28', '29 0830Z FEB 28']) assert.equal(D.parseDtg(input), '2028-02-29T08:30:00.000Z');
  for (const input of ['290830ZFEB26', '002300ZNOV26', '312300ZAPR26', '012400ZNOV26', '010060ZNOV26', '010000ZBAD26']) assert.equal(D.parseDtg(input), null);
  assert.equal(D.formatDtg(iso(origin)), '301745ZOCT26');
  assert.equal(D.parseDtg(D.formatDtg(iso(origin), true)), iso(origin));
});
test('all ten sponsor-style fixtures remain editable and use their reported repair estimates', () => {
  const names = fs.readdirSync(path.join(__dirname, '../sample-casreps')).filter(name => name.endsWith('.txt'));
  assert.equal(names.length, 10);
  for (const name of names) {
    const text = fs.readFileSync(path.join(__dirname, '../sample-casreps', name), 'utf8'), f = D.fields(text);
    const type = f.identifier.split('-')[0];
    assert.deepEqual(Array.from(D.validate(text, type).filter(i => i.severity === 'error')), []);
    const changed = D.update(text, 'description', 'UPDATED EXERCISE DESCRIPTION.');
    assert.equal(D.fields(changed).remarks, f.remarks);
    assert.equal(R.reportFields({ traffic: { text }, etr: '2099-01-01T00:00:00Z' }).etr, D.parseDtg(f.estimate) || '');
  }
});
test('multiline field editing keeps the entire narrative in sync without duplicate trailing lines', () => {
  let t = D.create({ impact: 'FIRST LINE.\nSECOND LINE.', actions: 'REPAIR.' }).text;
  assert.equal(D.fields(t).impact, 'FIRST LINE.\nSECOND LINE.');
  t = D.update(t, 'impact', 'REPLACEMENT.\nNEXT LINE.');
  assert.ok(!t.includes('SECOND LINE.'));
  assert.equal(D.fields(t).actions, 'REPAIR.');
});
test('a legacy transmitted revision anchors its follow-on and retransmission does not postpone it', () => {
  const r = base('C4', { stage: 'Draft', messageType: 'UPDATE', submittedAt: '', transmissions: [{ revision: 1, at: iso(origin) }, { revision: 1, at: iso(origin + DAY) }], versions: [{ revision: 1, type: 'INITIAL', record: { category: 'C2', messageType: 'INITIAL', etr: '' } }] });
  assert.equal(R.resolve(r, origin + 2 * DAY).dueAt, iso(origin + 30 * DAY));
  assert.equal(R.resolve(r, origin + 2 * DAY).last.messageType, 'INITIAL');
});
test('legacy review rounds retain their first submission even when snapshots arrive out of order', () => {
  const original = traffic().text, revised = D.update(original, 'category', '4');
  const r = base('C4', { submittedAt: '', documentReview: { snapshots: [
    { id: 'round-2', revision: 2, text: revised, submittedAt: iso(origin + DAY) },
    { id: 'round-1', revision: 1, text: original, submittedAt: iso(origin) }
  ] } });
  assert.equal(R.submissions(r).length, 1);
  assert.equal(R.resolve(r, origin + 2 * DAY).last.submittedAt, iso(origin));
  assert.equal(R.resolve(r, origin + 2 * DAY).last.category, 'C4');
  assert.equal(R.resolve(r, origin + 2 * DAY).dueAt, iso(origin + 72 * HOUR));
  r.documentReview.snapshots.push({ id: 'update', revision: 3, text: D.update(revised, 'identifier', 'UPDATE-01-26001'), submittedAt: iso(origin + 2 * DAY) });
  assert.equal(R.resolve(r, origin + 2 * DAY).dueAt, iso(origin + 5 * DAY));
});
test('configured named reviewers persist, enforce order, and retain historical assignments', () => {
  const adapter=storage();let {store,record}=newReport(adapter);
  const chain=[{id:'operations',label:'Operations Officer / OPS',name:'Smith'},{id:'cheng',label:'Engineer Officer / CHENG',name:'Jones'},{id:'co',label:'Commanding Officer'}];
  assert.throws(()=>store.transition(record.id,'set-route',{chain:chain.slice(0,2)}),/final reviewer/);
  assert.throws(()=>store.transition(record.id,'set-route',{chain:[chain[2],chain[2]]}),/distinct/);
  record=store.transition(record.id,'set-route',{chain,expectedRevision:record.revision});
  const revised=structuredClone(record.traffic);revised.text=D.update(revised.text,'description','Updated description');record=store.upsert({traffic:revised},record.id);
  store=C.createStore(adapter);record=store.get(record.id);
  assert.deepEqual(Array.from(record.reviews,r=>r.id),['operations','cheng','co']);
  record=store.transition(record.id,'submit');
  assert.equal(record.documentReview.snapshots[0].assignments[0].label,'Operations Officer / OPS · Smith');
  assert.throws(()=>store.transition(record.id,'set-route',{chain}),/unavailable/);
  assert.throws(()=>store.transition(record.id,'concur',{reviewId:'cheng',reviewerId:'demo-cheng'}),/current approval/);
  record=store.transition(record.id,'concur',{reviewId:'operations',reviewerId:'demo-operations'});
  record=store.transition(record.id,'return',{note:'Revise routing'});
  record=store.transition(record.id,'set-route',{chain:[chain[2]]});
  assert.equal(record.documentReview.snapshots[0].assignments.length,3);
  record=store.transition(record.id,'submit');
  assert.equal(record.reviews.length,1);
  record=store.transition(record.id,'concur',{reviewId:'co',reviewerId:'demo-co'});
  assert.equal(store.transition(record.id,'authorize',{reviewerId:'demo-co'}).stage,'Release authorized');
});
test('submission starts the clock, persists through reload and resubmission of the same report', () => {
  const adapter = storage(); let { store, record } = newReport(adapter);
  assert.equal(R.resolve(record, clock).dueAt, null);
  record = store.transition(record.id, 'submit'); const due = R.resolve(record, clock).dueAt;
  assert.equal(record.reporting.submissions.length, 1);
  assert.equal(due, iso(origin + 30 * DAY));
  clock += DAY; record = store.transition(record.id, 'return', { reviewerId: 'demo-divo', note: 'Clarify the test plan.' });
  const t = structuredClone(record.traffic); t.text = D.update(t.text, 'description', 'EXERCISE: CLARIFIED TEST PLAN.');
  record = store.upsert({ traffic: t }, record.id);
  assert.equal(R.resolve(record, clock).dueAt, due);
  record = store.transition(record.id, 'submit');
  assert.equal(record.reporting.submissions.length, 1);
  assert.equal(record.documentReview.snapshots.length, 2);
  assert.equal(R.resolve(C.createStore(adapter).get(record.id), clock).dueAt, due);
  assert.equal(record.documentHistory.length, 2);
});
test('submitted UPDATE uses the new time, category and ETR; a draft cannot move the active deadline', () => {
  let { store, record } = newReport(); record = store.transition(record.id, 'submit');
  const firstDue = R.resolve(record, clock).dueAt;
  record = approveAll(store, record);
  record = store.transition(record.id, 'transmit', { dtg: '301745Z OCT 26', recipients: record.recipients });
  record = store.transition(record.id, 'followup', { type: 'UPDATE' });
  clock += 2 * DAY;
  let t = structuredClone(record.traffic);
  t.text = D.update(t.text, 'category', '4');
  t.text = D.update(t.text, 'dtg', D.formatDtg(iso(clock), true));
  t.text = D.update(t.text, 'msgid', 'CASREP/DDG 999 RESOLUTE/002');
  t.text = D.update(t.text, 'estimate', D.formatDtg(iso(clock + 20 * DAY)));
  record = store.upsert({ traffic: t }, record.id);
  assert.equal(R.resolve(record, clock).dueAt, firstDue);
  assert.equal(R.resolve(record, clock).last.category, 'C2');
  assert.equal(R.resolve(record, clock).status, 'required');
  record = store.transition(record.id, 'submit');
  assert.equal(R.resolve(record, clock).dueAt, iso(clock + 72 * HOUR));
  assert.equal(R.resolve(record, clock).last.category, 'C4');
  assert.equal(record.reporting.pendingChanges.length, 0);
});
test('restored or cancelled drafts do not prematurely stop reminders; reporting closure does', () => {
  for (const messageType of ['CORRECT', 'CANCEL']) {
    const r = base('C3', { messageType, reporting: { submissions: [{ messageType: 'INITIAL', category: 'C3', submittedAt: iso(origin), etr: '' }] } });
    assert.equal(R.resolve(r, origin + 11 * DAY).status, 'overdue');
    for (const caseStatus of ['Corrected', 'Cancelled']) assert.equal(R.resolve({ ...r, caseStatus }, origin + 11 * DAY).status, 'closed');
  }
});
test('changes require prompt updates, are deduplicated, and do not hide a missed periodic deadline', () => {
  let { store, record } = newReport(); record = store.transition(record.id, 'submit');
  clock += HOUR;
  for (let i = 0; i < 2; i++) record = store.requireUpdate(record.id, { kind: 'parts', detail: 'Required material received.' });
  assert.equal(record.reporting.pendingChanges.length, 1);
  assert.equal(R.resolve(record, clock).status, 'required');
  assert.equal(R.resolve(record, origin + 31 * DAY).status, 'overdue');
  assert.equal(R.resolve(record, origin + 31 * DAY).required, true);
});
test('a labeled parts edit produces one useful notice instead of repeating the entire remarks change', () => {
  let { store, record } = newReport();
  let t = structuredClone(record.traffic);
  t.text = D.update(t.text, 'remarks', 'EXERCISE EXERCISE EXERCISE.\nPARTS: SEAL ORDERED.');
  record = store.upsert({ traffic: t }, record.id);
  record = store.transition(record.id, 'submit');
  record = store.transition(record.id, 'return', { reviewerId: 'demo-divo', note: 'Record material receipt.' });
  t = structuredClone(record.traffic);
  t.text = D.update(t.text, 'parts', 'SEAL RECEIVED.');
  record = store.upsert({ traffic: t }, record.id);
  assert.deepEqual(Array.from(record.reporting.pendingChanges, c => c.kind), ['parts']);
});
test('missing submission dates need explicit past evidence; new initial drafts cannot backdate themselves', () => {
  const { store, record } = newReport();
  assert.throws(() => store.recordSubmissionDate(record.id, { submittedAt: iso(origin), messageType: 'INITIAL' }), /Submit this initial draft/);
  const legacy = store.all().find(r => r.caseStatus === 'Active' && r.stage === 'In review');
  const adapter = storage(), state = store.exportData();
  const original = state.cases.find(r => r.id === legacy.id); delete original.reporting; delete original.submittedAt; delete original.documentReview; original.transmissions = [];
  adapter.setItem(C.storageKey, JSON.stringify(state)); const imported = C.createStore(adapter);
  assert.throws(() => imported.recordSubmissionDate(legacy.id, { submittedAt: iso(origin + HOUR), messageType: 'INITIAL' }), /no later than now/);
  const updated = imported.recordSubmissionDate(legacy.id, { submittedAt: iso(origin - DAY), messageType: 'INITIAL', note: 'Mock message log.' });
  assert.equal(R.resolve(updated, clock).last.submittedAt, iso(origin - DAY));
});
test('approval roles are ordered, originators can comment, and only the CO can release', () => {
  let { store, record } = newReport(); record = store.transition(record.id, 'submit');
  assert.deepEqual(Array.from(record.reviews, r => r.id), ['divo', 'department', 'cheng', 'xo', 'co']);
  assert.throws(() => store.transition(record.id, 'concur', { reviewId: 'department', reviewerId: 'demo-department' }), /current approval/);
  assert.throws(() => store.transition(record.id, 'concur', { reviewId: 'divo', reviewerId: 'demo-xo' }), /assigned reviewer/);
  record = store.reviewComment(record.id, 'add', { reviewerId: 'originator', start: 0, end: 1, text: 'Review the updated test plan.' });
  assert.equal(record.documentReview.comments[0].author, 'originator');
  for (const role of C.roles) record = store.transition(record.id, 'concur', { reviewId: role.id, reviewerId: 'demo-' + role.id });
  assert.throws(() => store.transition(record.id, 'authorize', { reviewerId: 'demo-xo' }), /Commanding Officer/);
  record = store.transition(record.id, 'authorize', { reviewerId: 'demo-co' });
  assert.equal(record.stage, 'Release authorized');
  assert.equal(record.documentReview.acknowledgements.length, 5);
  assert.equal(record.events.at(-1).actor, 'demo-co');
});
test('notifications are ordered by urgency and exclude unsent and closed reports', () => {
  const rows = [base('C4', { id: 'overdue', submittedAt: iso(origin - 4 * DAY) }), base('C4', { id: 'soon', submittedAt: iso(origin - 2 * DAY) }), base('C4', { id: 'draft', stage: 'Draft', submittedAt: '' }), base('C4', { id: 'closed', caseStatus: 'Corrected', submittedAt: iso(origin - 8 * DAY) })];
  assert.deepEqual(Array.from(R.attention(rows, origin), item => item.record.id), ['overdue', 'soon']);
});
console.log(passed + ' reporting / role / fixture tests passed.');
