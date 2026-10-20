/**
 * scripts/smoke-prod.mjs, the post-deploy smoke run (completion plan B5-B;
 * docs/deploy-checklist.md).
 *
 * The script is pointed at a real origin only by the owner, after a deploy.
 * Here it runs against the real Express app served by test/server/harness.js
 * (dummy env, no server/.env, no network), in this process and as a child
 * process, plus unit tests for its pure parts. The Express app serves /api/
 * only (the website is Vercel's static build), so against the harness the
 * API checks pass and the site checks fail; `--api-only` runs the API checks
 * alone.
 *
 * GET only is the point: request() refuses every other method before
 * anything reaches the network, and that is proven with a fetch spy.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startHarness } from '../server/harness.js';
import { CHECKS, judge, main, parseOrigin, request, runSmoke } from '../../scripts/smoke-prod.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = path.join(repoRoot, 'scripts', 'smoke-prod.mjs');

const harness = await startHarness();
after(() => harness.close());

const API_CHECKS = CHECKS.filter((c) => c.area === 'api');
const SITE_CHECKS = CHECKS.filter((c) => c.area === 'site');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Run `fn` with globalThis.fetch replaced by a spy; returns the spy's calls. */
async function withFetchSpy(fn, answer = () => new Response('', { status: 200 })) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return answer(input, init);
  };
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
  }
  return calls;
}

/** The CLI as a child process. Async, so this process keeps serving the harness. */
function runCli(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, ...args], { timeout: 60_000, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, stdout, stderr });
    });
  });
}

const lines = (text) => text.split(/\r?\n/).filter(Boolean);

// ---------- the origin ----------

test('parseOrigin takes an https origin, or http on this machine, and returns the bare origin', () => {
  assert.equal(parseOrigin('https://www.onextap.com'), 'https://www.onextap.com');
  assert.equal(parseOrigin('https://www.onextap.com/'), 'https://www.onextap.com');
  assert.equal(parseOrigin('https://onextap-git-branch.vercel.app'), 'https://onextap-git-branch.vercel.app');
  assert.equal(parseOrigin('http://localhost:3001'), 'http://localhost:3001');
  assert.equal(parseOrigin('http://127.0.0.1:4321/'), 'http://127.0.0.1:4321');
  assert.equal(parseOrigin('http://[::1]:3001'), 'http://[::1]:3001');
});

test('parseOrigin refuses plain http elsewhere, credentials, paths, queries and non-URLs, without echoing the input', () => {
  const refused = [
    'http://www.onextap.com',
    'https://user:secret-password@www.onextap.com',
    'https://:secret-password@www.onextap.com',
    'https://www.onextap.com/dashboard/',
    'https://www.onextap.com/?token=secret-password',
    'https://www.onextap.com/#secret-password',
    'ftp://www.onextap.com',
    'www.onextap.com',
    '',
    undefined,
  ];
  for (const input of refused) {
    assert.throws(() => parseOrigin(input), (err) => {
      assert.ok(!String(err.message).includes('secret-password'), 'the refusal echoed the input');
      return true;
    }, `accepted ${input}`);
  }
});

// ---------- GET only ----------

test('request() refuses every method but GET, before anything reaches the network', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'post', 'get', '', undefined]) {
    const calls = await withFetchSpy(async () => {
      await assert.rejects(() => request(method, `${harness.baseUrl}/api/credits/refund`), /GET requests only/);
    });
    assert.deepEqual(calls, [], `${String(method)} reached fetch`);
  }
});

test('request() refuses an address carrying credentials, before the network', async () => {
  const calls = await withFetchSpy(async () => {
    await assert.rejects(() => request('GET', 'https://user:pw@www.onextap.com/api/health'), /no credentials/);
  });
  assert.deepEqual(calls, []);
});

test('a GET goes out bare: no body, no Authorization or cookie, redirects not followed', async () => {
  const calls = await withFetchSpy(async () => {
    const res = await request('GET', `${harness.baseUrl}/api/health`);
    assert.equal(res.status, 200);
  });
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, `${harness.baseUrl}/api/health`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'manual');
  assert.equal(init.body, undefined);
  assert.equal(init.credentials, undefined);
  const headerNames = Object.keys(init.headers || {}).map((h) => h.toLowerCase());
  for (const forbidden of ['authorization', 'cookie', 'x-cron-secret', 'apikey']) {
    assert.ok(!headerNames.includes(forbidden), `sent ${forbidden}`);
  }
});

// ---------- judging a response (pure) ----------

const ORIGIN = 'https://www.onextap.com';
const health = CHECKS.find((c) => c.path === '/api/health');
const ingest = CHECKS.find((c) => c.path === '/api/jobs/ingest');
const privacyRedirect = CHECKS.find((c) => c.expect.redirectTo);
const notFound = CHECKS.find((c) => c.expect.status === 404);
const dashboard = CHECKS.find((c) => c.path === '/dashboard/');
const seen = (over = {}) => ({ status: 200, requestId: false, contentType: '', location: null, json: undefined, ...over });

test('judge: the health check needs 200, an X-Request-Id and status ok', () => {
  const good = judge(health, seen({ requestId: true, contentType: 'application/json', json: { status: 'ok', timestamp: 'x' } }), ORIGIN);
  assert.deepEqual(good, { ok: true, detail: '200, X-Request-Id present, status ok' });

  assert.equal(judge(health, seen({ requestId: false, json: { status: 'ok' } }), ORIGIN).ok, false);
  assert.match(judge(health, seen({ requestId: true, json: { status: 'down' } }), ORIGIN).detail, /status is not ok/);
  assert.match(judge(health, seen({ requestId: true, json: null }), ORIGIN).detail, /status is not ok/);
  assert.match(judge(health, seen({ status: 500, requestId: true, json: { status: 'ok' } }), ORIGIN).detail, /expected 200, got 500/);
});

test('judge: a failure never quotes the body or a header value', () => {
  const verdict = judge(
    health,
    seen({ status: 502, json: { status: 'secret-body-value' }, location: 'https://secret-header.example/' }),
    ORIGIN,
  );
  assert.equal(verdict.ok, false);
  assert.ok(!verdict.detail.includes('secret-body-value'));
  assert.ok(!verdict.detail.includes('secret-header'));
});

test('judge: the cron route answering 503 says CRON_SECRET is unset', () => {
  assert.equal(judge(ingest, seen({ status: 401, requestId: true }), ORIGIN).ok, true);
  const unset = judge(ingest, seen({ status: 503, requestId: true }), ORIGIN);
  assert.equal(unset.ok, false);
  assert.match(unset.detail, /expected 401, got 503 \(CRON_SECRET is not set/);
});

test('judge: site pages need 200 and HTML', () => {
  assert.deepEqual(judge(dashboard, seen({ contentType: 'text/html; charset=utf-8' }), ORIGIN), { ok: true, detail: '200, HTML' });
  assert.match(judge(dashboard, seen({ contentType: 'application/json' }), ORIGIN).detail, /not HTML/);
  assert.match(judge(dashboard, seen({ status: 404, contentType: 'text/html' }), ORIGIN).detail, /expected 200, got 404/);
});

test('judge: the old privacy URL must redirect to /privacy/ on the same origin', () => {
  assert.equal(judge(privacyRedirect, seen({ status: 308, location: '/privacy/' }), ORIGIN).ok, true);
  assert.equal(judge(privacyRedirect, seen({ status: 301, location: 'https://www.onextap.com/privacy/' }), ORIGIN).ok, true);
  assert.equal(judge(privacyRedirect, seen({ status: 308, location: '/somewhere-else/' }), ORIGIN).ok, false);
  assert.equal(judge(privacyRedirect, seen({ status: 308, location: 'https://elsewhere.example/privacy/' }), ORIGIN).ok, false);
  assert.equal(judge(privacyRedirect, seen({ status: 308, location: null }), ORIGIN).ok, false);
  // Today's production rewrites the old URL to a page instead.
  const old = judge(privacyRedirect, seen({ status: 200, contentType: 'text/html' }), ORIGIN);
  assert.equal(old.ok, false);
  assert.match(old.detail, /expected 301 or 308, got 200 \(/);
});

test('judge: an unknown address must be a 404 page, not the old catch-all', () => {
  assert.equal(judge(notFound, seen({ status: 404, contentType: 'text/html' }), ORIGIN).ok, true);
  assert.match(judge(notFound, seen({ status: 200, contentType: 'text/html' }), ORIGIN).detail, /expected 404, got 200 \(/);
});

// ---------- the check list stays true to the app and the site ----------

test('every API check is a GET route the server has', () => {
  const snapshot = JSON.parse(readFileSync(path.join(repoRoot, 'test', 'rules', 'routes.snapshot.json'), 'utf8'));
  const getRoutes = new Set(snapshot.routes.filter(([method]) => method === 'GET').map(([, p]) => p));
  assert.ok(API_CHECKS.length >= 3);
  for (const check of API_CHECKS) assert.ok(getRoutes.has(check.path), `${check.path} is not a GET route`);
});

test('every site page check is a page the website build has, and the redirect is vercel.json\'s', () => {
  const viteConfig = readFileSync(path.join(repoRoot, 'vite.dashboard.config.js'), 'utf8');
  const vercel = JSON.parse(readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
  const pages = SITE_CHECKS.filter((c) => c.expect.status === 200);
  assert.deepEqual(pages.map((c) => c.path).sort(), ['/', '/dashboard/', '/privacy/', '/reset-password/']);
  for (const check of pages) {
    assert.ok(viteConfig.includes(`'./web${check.path}index.html'`), `${check.path} is not a build input`);
  }
  assert.ok(viteConfig.includes("'./web/404.html'"), 'the 404 page is not a build input');

  const redirect = vercel.redirects.find((r) => r.source === privacyRedirect.path);
  assert.ok(redirect, `${privacyRedirect.path} is not redirected in vercel.json`);
  assert.equal(redirect.destination, privacyRedirect.expect.redirectTo);
  assert.equal(redirect.permanent, true);
  assert.ok([].concat(privacyRedirect.expect.status).includes(308), 'Vercel answers a permanent redirect with 308');
});

test('the checklist\'s manual POST step expects what the app answers: /api/credits/refund is gone', async () => {
  const res = await harness.request('POST', '/api/credits/refund');
  assert.equal(res.status, 404);
});

// ---------- against the harness-served app ----------

test('in process: the API checks pass against the real app', async () => {
  const printed = [];
  const { ok, results } = await runSmoke(harness.baseUrl, { checks: API_CHECKS, print: (l) => printed.push(l) });
  assert.equal(ok, true, printed.join('\n'));
  assert.deepEqual(results.map((r) => r.ok), API_CHECKS.map(() => true));
  assert.equal(printed.length, API_CHECKS.length + 1);
  for (const [i, check] of API_CHECKS.entries()) assert.match(printed[i], new RegExp(`^PASS  GET ${check.path}  `));
  assert.equal(printed.at(-1), `${API_CHECKS.length} checks: ${API_CHECKS.length} passed, 0 failed`);
});

test('in process: no response is a FAIL line, not a crash', async () => {
  const printed = [];
  harness.resetBlocked();
  const { ok, results } = await runSmoke('http://127.0.0.1:9', { checks: API_CHECKS, print: (l) => printed.push(l), timeoutMs: 2000 });
  assert.equal(ok, false);
  assert.ok(results.every((r) => !r.ok));
  for (const line of printed.slice(0, -1)) assert.match(line, /^FAIL {2}GET \S+ {2}no response \(/);
  assert.ok(harness.blocked.length >= API_CHECKS.length, 'the harness guard did not see the attempts');
});

test('main() refuses bad arguments with exit code 2 and sends nothing', async () => {
  const out = [];
  const calls = await withFetchSpy(async () => {
    assert.equal(await main([], (l) => out.push(l), (l) => out.push(l)), 2);
    assert.equal(await main(['http://www.onextap.com'], (l) => out.push(l), (l) => out.push(l)), 2);
    assert.equal(await main([harness.baseUrl, '--token=secret-password'], (l) => out.push(l), (l) => out.push(l)), 2);
    assert.equal(await main([harness.baseUrl, harness.baseUrl], (l) => out.push(l), (l) => out.push(l)), 2);
  });
  assert.deepEqual(calls, []);
  assert.ok(!out.join('\n').includes('secret-password'));
});

test('CLI, --api-only: every line PASS, exit 0, nothing printed but statuses', async () => {
  const { code, stdout, stderr } = await runCli([harness.baseUrl, '--api-only']);
  assert.equal(code, 0, stdout + stderr);
  const out = lines(stdout);
  assert.match(out[0], /GET only, no credentials, API checks only/);
  const checks = out.filter((l) => /^(PASS|FAIL) {2}/.test(l));
  assert.equal(checks.length, API_CHECKS.length);
  assert.ok(checks.every((l) => l.startsWith('PASS  GET /api/')));
  assert.equal(out.at(-1), `${API_CHECKS.length} checks: ${API_CHECKS.length} passed, 0 failed`);
  // No header value (the request id is a UUID) and no body text.
  assert.doesNotMatch(stdout, UUID);
  assert.doesNotMatch(stdout, /timestamp|Missing or invalid|Unauthorized|Cannot GET/);
});

test('CLI, every check: the site checks fail on the Express app alone, so the exit code is 1', async () => {
  const { code, stdout } = await runCli([harness.baseUrl]);
  assert.equal(code, 1, stdout);
  const out = lines(stdout);
  for (const check of API_CHECKS) assert.ok(out.some((l) => l.startsWith(`PASS  GET ${check.path}  `)), `${check.path} did not pass`);
  // Express serves no page: each one is a 404. Its own 404 is HTML, so the
  // not-found check passes even here.
  for (const check of SITE_CHECKS.filter((c) => c !== notFound)) {
    assert.ok(out.some((l) => l.startsWith(`FAIL  GET ${check.path}  `)), `${check.path} did not fail`);
  }
  assert.match(out.at(-1), new RegExp(`^${CHECKS.length} checks: \\d+ passed, ${SITE_CHECKS.length - 1} failed$`));
  assert.doesNotMatch(stdout, UUID);
});

test('CLI: a bad origin is exit code 2, with the usage', async () => {
  const { code, stdout, stderr } = await runCli(['http://www.onextap.com']);
  assert.equal(code, 2);
  assert.equal(stdout, '');
  assert.match(stderr, /usage: node scripts\/smoke-prod\.mjs <origin> \[--api-only\]/);
});
