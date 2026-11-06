#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Check complete reports rather than severity cutoffs: Unknown, ignored and
// unfixed findings must not turn a zero-known-vulnerability gate green.
function checkReports(trivy, grype) {
  if (trivy.SchemaVersion !== 2 || !Array.isArray(trivy.Results) || !trivy.Results.length ||
      !trivy.Metadata?.ImageID || !Array.isArray(grype.matches) ||
      (grype.ignoredMatches !== undefined && !Array.isArray(grype.ignoredMatches)) || !grype.source?.target?.imageID ||
      grype.descriptor?.db?.status?.valid !== true) {
    throw new Error('Missing or unsupported image scan report, image identity, or valid Grype database');
  }
  if (trivy.Metadata.ImageID !== grype.source.target.imageID) {
    throw new Error('Scanners examined different image IDs');
  }
  let findings = grype.matches.length + (grype.ignoredMatches || []).length;
  for (const result of trivy.Results) {
    for (const key of ['Vulnerabilities', 'Secrets', 'Misconfigurations']) {
      if (result[key] !== undefined && !Array.isArray(result[key])) throw new Error(`Invalid Trivy ${key}`);
      findings += (result[key] || []).length;
    }
  }
  if (findings) throw new Error(`Image rejected: ${findings} scanner findings; inspect retained JSON reports`);
  return trivy.Metadata.ImageID;
}

module.exports = { checkReports };
if (require.main === module) {
  try {
    const directory = process.argv[2];
    if (!directory) throw new Error('Usage: check-image-scans.cjs REPORT_DIRECTORY');
    const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    const imageId = checkReports(read('trivy.json'), read('grype.json'));
    console.log(`Image scans passed: zero reported findings for ${imageId}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
