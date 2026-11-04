const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { run } = require('./casrep-workflow.cjs');

const context = vm.createContext({ TextEncoder });
const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
vm.runInContext(html.match(/<script id="casrep-document-model">([\s\S]*?)<\/script>/)[1], context);
const D = context.CasrepDocument;
const now = '2026-11-04T12:00:00.000Z';
function draft() {
  return run({ action: 'save', cases: [], now, payload: {
    title: 'EXERCISE PUMP', equipment: 'DEMO PUMP', category: 'C3',
    stage: 'Release authorized', revision: 99, submittedAt: '2000-01-01T00:00:00Z'
  } }).record;
}

test('server clock and draft defaults cannot be replaced by client metadata', () => {
  const record = draft();
  assert.equal(record.createdAt, now);
  assert.equal(record.updatedAt, now);
  assert.equal(record.stage, 'Draft');
  assert.equal(record.revision, 1);
  assert.equal(record.submittedAt, undefined);
  assert.throws(() => run({ action: 'save', cases: [], now: 'invalid', payload: {} }), /server clock/);
});

test('legacy CRUD records with omitted or null optional arrays do not block other drafts', () => {
  const legacy = { id: 'legacy', title: 'Legacy record', events: null, reviews: null };
  const before = JSON.stringify(legacy);
  const record = run({ action: 'save', cases: [legacy], now,
    payload: { title: 'New draft', equipment: 'DEMO PUMP' } }).record;
  assert.equal(record.title, 'New draft');
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(record.events.length, 1);
});

test('calculated deadlines use submission evidence and leave legacy reminder fields intact', () => {
  const record = { ...draft(), nextUpdateAt: '2099-01-01T00:00:00Z',
    submittedAt: '2026-11-03T12:00:00Z', category: 'C4', stage: 'In review',
    materialChanges: [{ source: 'requisition', at: now, kind: 'parts', detail: 'Parts received.' }] };
  const before = JSON.stringify(record);
  const result = run({ action: 'reporting', cases: [record, draft()], now }).records;
  assert.equal(result[0].nextUpdateAt, '2026-11-06T12:00:00.000Z');
  assert.equal(result[0].reportingSchedule.status, 'required');
  assert.equal(result[0].reportingSchedule.changes.length, 1);
  assert.equal(result[1].nextUpdateAt, '');
  assert.equal(result[1].reportingSchedule.status, 'unsubmitted');
  assert.equal(JSON.stringify(record), before);
});

test('server rules reject classified or incomplete traffic before review', () => {
  const traffic = D.create({ title: 'EXERCISE PUMP', equipment: 'DEMO PUMP', category: 'C3' });
  traffic.text = traffic.text.replace('UNCLAS', 'SECRET');
  const record = run({ action: 'save', cases: [], now, payload: { traffic } }).record;
  assert.throws(() => run({ action: 'submit', id: record.id, cases: [record], now, payload: {} }), /field checks|Complete/);
  assert.equal(record.stage, 'Draft');
  assert.equal(record.reporting, undefined);
});

test('parts changes before the initial submission are not outstanding reporting notices', () => {
  const record = { ...draft(), submittedAt: now, stage: 'In review',
    materialChanges: [{ source: 'requisition', at: '2026-11-03T12:00:00Z', kind: 'parts', detail: 'Old change.' }] };
  const schedule = run({ action: 'reporting', cases: [record], now }).records[0].reportingSchedule;
  assert.equal(schedule.required, false);
  assert.equal(schedule.changes.length, 0);
});

test('structured legacy CRUD records need a canonical message before workflow submission', () => {
  const record = draft();
  assert.throws(() => run({ action: 'submit', id: record.id, cases: [record], now, payload: {} }), /canonical CASREP message/);
  assert.equal(record.stage, 'Draft');
});
