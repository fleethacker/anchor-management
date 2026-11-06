#!/usr/bin/env node
'use strict';

// Read-only acceptance check: GETs and non-persistent Assistant responses only.
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { parseArgs } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');

async function verifyInference({ baseURL = 'http://127.0.0.1:4180', caseID = 'demo-rich-1008', expectText = '', origin = '', waitMs = 0, timeoutMs = 35000 } = {}) {
  const url = new URL(baseURL);
  assert(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash, 'Use an HTTP(S) API URL without credentials, query, or fragment');
  const base = url.href.replace(/\/$/, '').replace(/\/api\/v1$/, '') + '/api/v1';
  const headers = origin ? { Origin: origin } : {};
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  async function request(path, body, expected = 200) {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const result = await response.json();
    assert.equal(response.status, expected, `${path}: HTTP ${response.status}: ${result.error?.message || 'unexpected response'}`);
    if (origin) {
      assert.equal(response.headers.get('access-control-allow-origin'), origin, `${path}: frontend origin is not allowed`);
      assert.equal(response.headers.get('access-control-allow-credentials'), 'true', `${path}: credentialed browser access is not allowed`);
    }
    return result;
  }
  const deadline = Date.now() + waitMs;
  let capabilities;
  for (;;) {
    try {
      capabilities = (await request('/assistant/capabilities')).data;
      assert.equal(capabilities?.provider, 'local-model', 'Expected local-model provider');
      assert.equal(capabilities.modelAvailable, true, 'Model is unavailable; inspect Fly startup logs');
      assert.equal(capabilities.authenticationRequired, false, 'Expected supervised local model without shared login');
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await delay(Math.min(2000, deadline - Date.now()));
    }
  }
  if (origin) {
    const preflight = await fetch(base + '/assistant/responses', {
      method: 'OPTIONS', headers: { ...headers, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    assert(preflight.ok, 'Assistant browser preflight failed');
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin, 'Preflight origin mismatch');
    assert.match(preflight.headers.get('access-control-allow-methods') || '', /POST/i, 'Preflight must allow POST');
    assert.match(preflight.headers.get('access-control-allow-headers') || '', /content-type/i, 'Preflight must allow JSON');
  }
  const before = (await request('/cases/' + encodeURIComponent(caseID))).data;
  assert.equal(before?.id, caseID, 'Selected fictional case is unavailable');
  const payload = { mode: 'chat', task: 'history', question: 'Summarize this fictional case in one sentence and cite its case ID.', caseIds: [caseID] };
  const responses = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const start = performance.now();
    const { data } = await request('/assistant/responses', payload);
    assert.equal(data?.provider, 'local-model', 'Response did not come from the local model');
    assert.equal(data.mode, 'chat');
    assert.equal(data.skill, 'casrep-assistant-page-v1');
    assert(typeof data.answer === 'string' && data.answer.trim(), 'Model returned an empty answer');
    assert(![caseID, before.number].includes(data.answer.trim()), 'Model returned only an identifier instead of an answer');
    if (expectText) assert(data.answer.toLowerCase().includes(expectText.toLowerCase()), `Answer did not contain expected condition: ${expectText}`);
    assert(typeof data.requestId === 'string' && data.requestId.trim(), 'Missing inference request ID');
    assert(!responses.some(r => r.requestId === data.requestId), 'Inference request ID was reused');
    assert.match(data.coverage || '', /Resolved 1 case\(s\)/, 'Response scope must contain exactly the selected case');
    assert(Array.isArray(data.claims) && data.claims.length > 0, 'Smoke question requires a source-cited claim');
    for (const claim of data.claims) {
      assert(typeof claim.text === 'string' && claim.text.trim(), 'Empty claim');
      assert(Array.isArray(claim.sourceIds) && claim.sourceIds.length > 0 && claim.sourceIds.every(id => id === caseID), 'Claim cites outside the selected case');
    }
    responses.push({ attempt, elapsedMs: Math.round(performance.now() - start), requestId: data.requestId, answer: data.answer, claims: data.claims });
    if (attempt === 1) {
      const unknown = await request('/assistant/responses', { ...payload, caseIds: ['inference-missing-' + randomUUID()] }, 422);
      assert.match(unknown.error?.message || '', /unavailable/i, 'Missing case must be rejected');
      const broad = await request('/assistant/responses', { ...payload, notes: 'x'.repeat(12000) }, 422);
      assert.match(broad.error?.message || '', /scope is too large/i, 'Oversized scope must be rejected before inference');
    }
  }
  const after = (await request('/cases/' + encodeURIComponent(caseID))).data;
  assert.equal(hash(after), hash(before), 'Selected case changed during verification; investigate concurrent edits before claiming persistence unchanged');
  return {
    status: 'PASS', checkedAt: new Date().toISOString(), baseURL: base, caseID, origin: origin || 'same-origin',
    provider: capabilities.provider, responses, blockedChecks: ['unknown case', 'oversized scope'], selectedCaseUnchanged: true,
    limitation: 'Proves inference transport, structured output and source membership. Does not certify answer accuracy or full-history analysis.'
  };
}

if (require.main === module) {
  const { values } = parseArgs({ options: {
    'base-url': { type: 'string' }, 'case-id': { type: 'string' }, 'expect-text': { type: 'string' }, origin: { type: 'string' }, 'wait-ms': { type: 'string', default: '0' }, help: { type: 'boolean' }
  } });
  if (values.help) {
    console.log('node backend/scripts/verify-inference.cjs [--base-url http://127.0.0.1:4180] [--case-id demo-rich-1008] [--expect-text "controller reset"] [--origin https://fleethacker.github.io] [--wait-ms 90000]\nRuns two real model responses and blocked requests; never writes CASREP records.');
  } else {
    const waitMs = Number(values['wait-ms']);
    assert(Number.isFinite(waitMs) && waitMs >= 0 && waitMs <= 120000, '--wait-ms must be between 0 and 120000');
    verifyInference({ baseURL: values['base-url'], caseID: values['case-id'], expectText: values['expect-text'], origin: values.origin, waitMs })
      .then(report => console.log(JSON.stringify(report, null, 2)))
      .catch(error => { console.error(`Inference verification FAILED: ${error.message}`); process.exitCode = 1; });
  }
}

module.exports = { verifyInference };
