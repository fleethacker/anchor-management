#!/usr/bin/env node
'use strict';

// Extract the prototype's seeded records without duplicating the data in Go.
// The HTML model scripts are deliberately CommonJS/browser compatible.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');
const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const reference = process.env.SEED_REFERENCE || new Date().toISOString();
const instant = Date.parse(reference);
if (!Number.isFinite(instant)) throw new Error('SEED_REFERENCE must be a valid timestamp.');
class SeedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [instant])); }
  static now() { return instant; }
}
const context = vm.createContext({
  console,
  TextEncoder,
  Date: SeedDate,
  Math,
  JSON,
  Number,
  String,
  Array,
  Object,
  Map,
  Set,
  RegExp,
  Error,
  TypeError,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
});
context.globalThis = context;

function load(id) {
  const match = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
  if (!match) throw new Error(`script ${id} not found`);
  vm.runInContext(match[1], context, { filename: `${id}.js` });
}

[
  'casrep-demo-catalog',
  'casrep-aegis-model',
  'casrep-aegis-demo',
  'casrep-document-model',
  'casrep-reporting-model',
  'casrep-data-model',
  'casrep-plad-model',
  'casrep-material-model',
].forEach(load);

const cases = context.CasrepCore.seedCases(reference);
const material = context.MaterialCore.createStore();
const output = {
  schemaVersion: 1,
  source: 'index.html prototype models',
  extractedAt: new Date().toISOString(),
  referenceTime: reference,
  cases,
  assets: material.assets(),
  workOrders: material.workOrders(),
  requisitions: material.requisitions(),
  pladTemplates: context.PladCore.seedTemplates(reference),
};

const destination = process.argv[2] || path.join(backendRoot, 'data', 'seed.json');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(output, null, 2)}\n`);
console.log(`extracted ${cases.length} cases, ${output.assets.length} assets, ${output.workOrders.length} work orders, ${output.requisitions.length} requisitions`);
console.log(destination);
