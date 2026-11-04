#!/usr/bin/env node
'use strict';

// One-shot repair for legacy fictional records in an existing JSON database.
// The public server never exposes this as an HTTP action.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function documentModel(modelPath) {
  const html = fs.readFileSync(modelPath, 'utf8');
  const match = html.match(/<script id="casrep-document-model">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Missing casrep-document-model in ' + modelPath);
  const context = vm.createContext({ TextEncoder, Date, Math, JSON, Number, String, Array, Object, RegExp, Error, TypeError, parseInt, parseFloat, isNaN, isFinite });
  vm.runInContext(match[1], context, { filename: modelPath });
  return context.CasrepDocument;
}

function migrate(databasePath, modelPath = path.resolve(__dirname, '../../index.html')) {
  const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
  if (!Array.isArray(database.cases)) throw new Error('Database is missing its cases collection.');
  const document = documentModel(modelPath);
  const reference = database.referenceTime || '2026-11-04T12:00:00Z';
  let changed = 0;
  database.cases.forEach((record, index) => {
    const demo = record && (record.demonstration === true || /^(?:demo|aegis-case)-/.test(String(record.id || '')));
    if (!demo || record.traffic) return;
    record.traffic = document.materializeDemoTraffic(record, index, reference);
    changed++;
  });
  if (changed) {
    const temporary = databasePath + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(database, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, databasePath);
  }
  return { changed, total: database.cases.length };
}

if (require.main === module) {
  const databasePath = process.argv[2];
  const modelPath = process.argv[3] || path.resolve(__dirname, '../../index.html');
  if (!databasePath) {
    console.error('Usage: migrate-demo-traffic.cjs DATABASE_PATH [INDEX_HTML_PATH]');
    process.exitCode = 2;
  } else {
    try {
      const result = migrate(databasePath, modelPath);
      console.log(`demo traffic migration: changed ${result.changed} of ${result.total} cases`);
    } catch (error) {
      console.error('demo traffic migration failed:', error.message);
      process.exitCode = 1;
    }
  }
}

module.exports = { migrate };
