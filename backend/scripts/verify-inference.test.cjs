'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { verifyInference } = require('./verify-inference.cjs');

async function fixture(t, failure = '') {
  const calls = [];
  let sequence = 0, reads = 0;
  const server = http.createServer(async (req, res) => {
    let input = '';
    for await (const chunk of req) input += chunk;
    const body = input ? JSON.parse(input) : null;
    calls.push({ method: req.method, url: req.url, body });
    res.setHeader('Content-Type', 'application/json');
    if (failure !== 'cors' && req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    const send = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    if (req.method === 'OPTIONS') return send(200, {});
    if (req.url.endsWith('/capabilities')) return send(200, { data: { provider: 'local-model', modelAvailable: failure !== 'unavailable', authenticationRequired: false } });
    if (req.url.includes('/cases/')) return send(200, { data: { id: 'case-1', number: 'EXERCISE-1', description: 'Controller reset.', revision: failure === 'mutation' ? ++reads : 1 } });
    if (body.caseIds[0] !== 'case-1') return send(422, { error: { message: 'Requested case unavailable' } });
    if (body.notes) return send(422, { error: { message: 'local Assistant scope is too large; narrow the selection' } });
    if (failure === 'provider') return send(503, { error: { message: 'Assistant model did not return a usable response' } });
    return send(200, { data: {
      mode: 'chat', provider: failure === 'fallback' ? 'none' : 'local-model', skill: 'casrep-assistant-page-v1',
      answer: failure === 'empty' ? '' : failure === 'identifier' ? 'EXERCISE-1' : failure === 'wrong-answer' ? 'Support requested.' : 'Controller reset reported.',
      claims: [{ text: 'Controller reset reported.', sourceIds: [failure === 'source' ? 'outside' : 'case-1'] }],
      requestId: `request-${++sequence}`, coverage: 'Resolved 1 case(s)'
    } });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { baseURL: `http://127.0.0.1:${server.address().port}`, calls };
}

test('verifier requires real response metadata, known condition, bounded citations and no record writes', async t => {
  const { baseURL, calls } = await fixture(t);
  const report = await verifyInference({ baseURL, caseID: 'case-1', expectText: 'controller reset', origin: 'https://example.test' });
  assert.equal(report.status, 'PASS');
  assert.equal(report.responses.length, 2);
  assert.equal(report.selectedCaseUnchanged, true);
  assert.deepEqual(report.blockedChecks, ['unknown case', 'oversized scope']);
  assert(calls.filter(c => c.method === 'POST').every(c => c.url === '/api/v1/assistant/responses'));
});

for (const failure of ['unavailable', 'provider', 'fallback', 'empty', 'identifier', 'wrong-answer', 'source', 'mutation', 'cors']) {
  test(`verifier fails closed for ${failure}`, async t => {
    const { baseURL } = await fixture(t, failure);
    await assert.rejects(verifyInference({ baseURL, caseID: 'case-1', expectText: 'controller reset', origin: 'https://example.test' }));
  });
}
