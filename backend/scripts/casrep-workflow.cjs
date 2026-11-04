#!/usr/bin/env node
'use strict';

// The Go process owns persistence and supplies the clock and current records.
// Execute the same pure document/workflow rules used by the static prototype;
// request data is JSON, never executable code. No browser storage is involved.
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');

function run(input, modelPath = path.resolve(__dirname, '../../index.html')) {
  const instant = Date.parse(input.now);
  if (!Number.isFinite(instant)) throw new Error('A valid server clock is required.');
  class ServerDate extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  }
  const context = vm.createContext({ TextEncoder, crypto, Date: ServerDate });
  const html = fs.readFileSync(modelPath, 'utf8');
  for (const id of ['casrep-document-model', 'casrep-reporting-model', 'casrep-data-model']) {
    const script = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'));
    if (!script) throw new Error('Missing server model: ' + id);
    vm.runInContext(script[1], context, { filename: id, timeout: 3000 });
  }
  const cases = input.cases || [];
  if (input.action === 'reporting') {
    return { records: cases.map(record => {
      const schedule = context.CasrepReporting.resolve(record, instant);
      return { ...record, nextUpdateAt: schedule.dueAt || '', reportingSchedule: schedule };
    }) };
  }
  const normalized = cases.map(record => ({
    profile: 'FLEET', category: 'C3', stage: 'Draft', caseStatus: 'Active',
    messageType: 'INITIAL', revision: 1, ...record,
    ...Object.fromEntries(['events', 'reviews', 'versions', 'transmissions'].map(key =>
      [key, Array.isArray(record[key]) ? record[key] : []]))
  }));
  let saved = JSON.stringify({ schemaVersion: 1, cases: normalized });
  const adapter = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  const store = context.CasrepCore.createStore(adapter);
  const payload = input.payload || {};
  if (['submit', 'authorize'].includes(input.action) && !store.get(input.id).traffic) {
    throw new Error('Save the canonical CASREP message before submitting it for review.');
  }
  let record;
  if (input.action === 'save') record = store.upsert(payload, input.id || undefined);
  else if (input.action.startsWith('comment-')) record = store.reviewComment(input.id, input.action.slice(8), payload);
  else if (input.action === 'record-submission') record = store.recordSubmissionDate(input.id, payload);
  else if (input.action === 'require-update') record = store.requireUpdate(input.id, payload);
  else if (input.action === 'observation') record = store.addEquipmentObservation(input.id, payload);
  else record = store.transition(input.id, input.action, payload);
  return { record };
}

if (require.main === module) {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    process.stdout.write(JSON.stringify(run(input, process.argv[2])));
  } catch (error) {
    const conflict = /report changed|review round has changed|changed in another editor/i.test(error.message);
    process.stdout.write(JSON.stringify({ error: error.message, code: conflict ? 'conflict' : 'invalid' }));
    process.exitCode = 1;
  }
}
module.exports = { run };
