const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrate } = require('./migrate-demo-traffic.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casrep-demo-migration-'));
const databasePath = path.join(dir, 'database.json');
const modelPath = path.resolve(__dirname, '../../index.html');
const existingTraffic = { schemaVersion: 1, text: 'EXISTING CANONICAL TRAFFIC', recipientSnapshots: [] };
fs.writeFileSync(databasePath, JSON.stringify({
  schemaVersion: 1,
  referenceTime: '2026-11-04T12:00:00Z',
  cases: [
    { id: 'demo-rich-1008', demonstration: true, messageType: 'UPDATE', category: 'C3', equipment: 'DEMO GENERATOR', location: 'DEMO PORT', discoveredAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-04T11:00:00Z', etr: '2026-11-06T18:00:00Z', traffic: null },
    { id: 'demo-existing', demonstration: true, messageType: 'INITIAL', traffic: existingTraffic },
    { id: 'operator-case', demonstration: false, messageType: 'INITIAL', traffic: null }
  ], assets: [], workOrders: [], requisitions: [], pladTemplates: []
}, null, 2));
fs.chmodSync(databasePath, 0o640);
const originalMode = fs.statSync(databasePath).mode & 0o777;

const first = migrate(databasePath, modelPath);
assert.equal(first.changed, 1);
const migrated = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
assert.equal(migrated.cases[0].traffic.schemaVersion, 1);
assert.match(migrated.cases[0].traffic.text, /CASUALTY\/UPDATE-01-/);
assert.equal(migrated.cases[1].traffic.text, existingTraffic.text);
assert.equal(migrated.cases[2].traffic, null);
assert.equal(fs.statSync(databasePath).mode & 0o777, originalMode);

const second = migrate(databasePath, modelPath);
assert.equal(second.changed, 0);
assert.deepEqual(JSON.parse(fs.readFileSync(databasePath, 'utf8')), migrated);
console.log('✓ demo traffic migration is selective and idempotent');
