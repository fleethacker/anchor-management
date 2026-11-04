const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-management-seed-'));
const output = path.join(tempDir, 'seed.json');

try {
  execFileSync(process.execPath, ['backend/scripts/extract-demo-data.cjs', output], {
    cwd: repo,
    stdio: 'pipe',
    env: { ...process.env, SEED_REFERENCE: '2026-11-04T00:00:00.000Z' },
  });
  const seed = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.deepEqual(seed.pladTemplates.map((template) => template.id), [
    'plad-casrep-command',
    'plad-casrep-technical',
    'plad-casrep-training',
  ]);
  assert.deepEqual(seed.pladTemplates.map((template) => template.recipients.split('\n').length), [7, 11, 5]);
  console.log('PLAD seed extraction test passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
