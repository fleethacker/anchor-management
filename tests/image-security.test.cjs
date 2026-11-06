'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkReports } = require('../scripts/check-image-scans.cjs');
const imageID = 'sha256:' + 'a'.repeat(64);
function reports() {
  return [
    { SchemaVersion: 2, Metadata: { ImageID: imageID }, Results: [{ Target: 'alpine' }] },
    { matches: [], ignoredMatches: [], source: { target: { imageID } }, descriptor: { db: { status: { valid: true } } } }
  ];
}
test('clean reports for the same image pass', () => assert.equal(checkReports(...reports()), imageID));
test('Grype may omit its empty ignoredMatches field', () => {
  const [trivy, grype] = reports();
  delete grype.ignoredMatches;
  assert.equal(checkReports(trivy, grype), imageID);
  grype.ignoredMatches = {};
  assert.throws(() => checkReports(trivy, grype), /Missing or unsupported/);
});
for (const severity of ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) {
  test(`Trivy ${severity} finding without a fix blocks release`, () => {
    const [trivy, grype] = reports();
    trivy.Results[0].Vulnerabilities = [{ VulnerabilityID: 'CVE-EXAMPLE', Severity: severity }];
    assert.throws(() => checkReports(trivy, grype), /Image rejected/);
  });
}
for (const field of ['matches', 'ignoredMatches']) {
  test(`Grype ${field} with unknown severity blocks release`, () => {
    const [trivy, grype] = reports();
    grype[field] = [{ vulnerability: { id: 'CVE-EXAMPLE', severity: 'Unknown' } }];
    assert.throws(() => checkReports(trivy, grype), /Image rejected/);
  });
}
test('scanner errors, invalid databases and mismatched image identities fail closed', () => {
  const [trivy, grype] = reports();
  assert.throws(() => checkReports({}, grype), /Missing or unsupported/);
  assert.throws(() => checkReports(trivy, {}), /Missing or unsupported/);
  grype.descriptor.db.status.valid = false;
  assert.throws(() => checkReports(trivy, grype), /valid Grype database/);
  grype.descriptor.db.status.valid = true;
  grype.source.target.imageID = 'sha256:' + 'b'.repeat(64);
  assert.throws(() => checkReports(trivy, grype), /different image IDs/);
});
