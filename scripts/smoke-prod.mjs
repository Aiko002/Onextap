/**
 * The post-deploy smoke run (completion plan B5-B; docs/deploy-checklist.md,
 * "After the deploy"): a handful of unauthenticated GET requests against a
 * deployed origin, one PASS or FAIL line each, and exit code 1 if any fails.
 *
 *   node scripts/smoke-prod.mjs https://www.onextap.com
 *   node scripts/smoke-prod.mjs http://localhost:3001 --api-only
 *
 * GET only, by construction: every request goes through request(), which
 * refuses any other method before anything reaches the network. No
 * credentials, no Authorization or cookie header, no request body, redirects
 * not followed; the script reads no environment variable and no .env file.
 * It prints status codes and what was checked: never a header's value (only
 * whether X-Request-Id is there), never a response body beyond the health
 * check's "status ok". Refusals do not echo the arguments, in case one holds
 * something it shouldn't.
 *
 * The checks (CHECKS):
 *   API, the Express app (server/app.js)
 *     /api/health          200, an X-Request-Id, {"status":"ok"}
 *     /api/credits         401 with no token: the signed-in routes refuse
 *     /api/jobs/ingest     401 with no secret; 503 means CRON_SECRET is unset
 *                          on the server (server/cronAuth.js)
 *   Site, the static build Vercel serves from dist-dashboard/
 *     /  /dashboard/  /privacy/  /reset-password/    200, HTML
 *     /privacy-policy      a permanent redirect to /privacy/ (vercel.json)
 *     an unknown address   404, HTML (web/404.html)
 *
 * The site checks need Vercel. The Express app alone (`npm run server:dev`,
 * or the harness test/release/smoke.test.js serves) answers /api/ only, so
 * `--api-only` runs the API checks alone. Against today's production (main's
 * build rewrites every path to one page) the redirect and not-found checks
 * fail; after the deploy they pass, which tells which build is answering.
 *
 * Exit codes: 0 every check passed, 1 one or more failed, 2 bad arguments.
 * The exports are for test/release/smoke.test.js.
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Per request. Generous: a cold Vercel function can take a few seconds. */
export const TIMEOUT_MS = 20_000;

const USAGE = 'usage: node scripts/smoke-prod.mjs <origin> [--api-only]\n'
  + '  <origin>    https://... , or http://localhost:<port> (also 127.0.0.1, [::1])\n'
  + '  --api-only  the /api/ checks only (the Express app without the website)';

/** Hosts plain http:// is allowed for: this machine. URL keeps [::1]'s brackets. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** No page answers here; the new site's 404 page should. */
const NOT_A_PAGE = '/smoke-check-no-such-page';

const OLD_SITE_HINT = 'a page answered: is this still the old build, which rewrites every path to one page?';

const freeze = (check) => Object.freeze({ ...check, expect: Object.freeze(check.expect) });

/**
 * What is asked, and what must come back. `expect`:
 *   status      a code, or a list of acceptable ones
 *   requestId   the X-Request-Id header is there (server/logger.js sets it)
 *   html        Content-Type text/html
 *   json        the body is JSON with these exact top-level values
 *   redirectTo  Location is this path on the same origin
 * `hints` explains a wrong status, by code.
 */
export const CHECKS = Object.freeze([
  {
    area: 'api',
    path: '/api/health',
    expect: { status: 200, requestId: true, json: { status: 'ok' } },
  },
  {
    area: 'api',
    path: '/api/credits',
    expect: { status: 401, requestId: true },
  },
  {
    area: 'api',
    path: '/api/jobs/ingest',
    expect: { status: 401, requestId: true },
    hints: { 503: 'CRON_SECRET is not set on the server' },
  },
  { area: 'site', path: '/', expect: { status: 200, html: true } },
  { area: 'site', path: '/dashboard/', expect: { status: 200, html: true } },
  { area: 'site', path: '/privacy/', expect: { status: 200, html: true } },
  { area: 'site', path: '/reset-password/', expect: { status: 200, html: true } },
  {
    area: 'site',
    path: '/privacy-policy',
    expect: { status: [301, 308], redirectTo: '/privacy/' },
    hints: { 200: OLD_SITE_HINT },
  },
  {
    area: 'site',
    path: NOT_A_PAGE,
    expect: { status: 404, html: true },
    hints: { 200: OLD_SITE_HINT },
  },
].map(freeze));

class UsageError extends Error {}

/**
 * The origin to check, from the command line: https, or plain http on this
 * machine only; no credentials, path, query or fragment.
 * @param {unknown} input
 * @returns {string} The bare origin, e.g. 'https://www.onextap.com'.
 * @throws {UsageError} Never quoting the input.
 */
export function parseOrigin(input) {
  let url;
  try {
    url = new URL(String(input ?? ''));
  } catch {
    throw new UsageError('the origin is not a URL');
  }
  if (url.username || url.password) throw new UsageError('the origin must not carry credentials');
  if (url.protocol === 'http:') {
    if (!LOOPBACK_HOSTS.has(url.hostname)) throw new UsageError('plain http:// is for localhost only; use https://');
  } else if (url.protocol !== 'https:') {
    throw new UsageError('the origin must be https:// (or http://localhost:<port>)');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new UsageError('give the origin only, with no path, query or fragment');
  }
  return url.origin;
}

/**
 * The one way this script reaches the network. GET only: any other method is
 * refused here, before fetch is called. It adds no credentials and sends no
 * body, and a redirect comes back as it is rather than being followed.
 * @param {string} method Must be exactly 'GET'.
 * @param {string|URL} url
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<Response>}
 */
export async function request(method, url, { timeoutMs = TIMEOUT_MS } = {}) {
  if (method !== 'GET') {
    throw new Error(`smoke-prod sends GET requests only; refused ${typeof method === 'string' && method ? method : 'a request without a method'}`);
  }
  const target = new URL(url);
  if (target.username || target.password) {
    throw new Error('smoke-prod sends no credentials; refused an address carrying some');
  }
  return fetch(target.href, {
    method: 'GET',
    redirect: 'manual',
    headers: { accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Ask for one check's path and keep only what judge() needs. The body is read
 * only when the check looks inside it (the health check's JSON).
 * @returns {Promise<{status: number, requestId: boolean, contentType: string,
 *   location: string|null, json: object|null|undefined}>}
 */
async function observe(origin, check, { timeoutMs } = {}) {
  const res = await request('GET', new URL(check.path, origin), { timeoutMs });
  const seen = {
    status: res.status,
    requestId: res.headers.has('x-request-id'),
    contentType: (res.headers.get('content-type') || '').toLowerCase(),
    location: res.headers.get('location'),
    json: undefined,
  };
  if (check.expect.json) {
    const text = await res.text();
    try {
      seen.json = JSON.parse(text);
    } catch {
      seen.json = null;
    }
  } else {
    await res.body?.cancel().catch(() => {});
  }
  return seen;
}

/**
 * Pure: did the response meet the check? The detail names what was checked,
 * never a header's value or the body's text.
 * @param {typeof CHECKS[number]} check
 * @param {{status: number, requestId: boolean, contentType: string,
 *   location: string|null, json?: object|null}} seen
 * @param {string} origin The origin asked, for the redirect check.
 * @returns {{ok: boolean, detail: string}}
 */
export function judge(check, seen, origin) {
  const { expect, hints = {} } = check;
  const facts = [String(seen.status)];
  const problems = [];

  const wanted = [].concat(expect.status);
  if (!wanted.includes(seen.status)) {
    const hint = hints[seen.status];
    problems.push(`expected ${wanted.join(' or ')}, got ${seen.status}${hint ? ` (${hint})` : ''}`);
  }
  if (expect.requestId) {
    if (seen.requestId) facts.push('X-Request-Id present');
    else problems.push('no X-Request-Id header');
  }
  if (expect.html) {
    if (/\btext\/html\b/.test(seen.contentType || '')) facts.push('HTML');
    else problems.push('not HTML');
  }
  if (expect.json) {
    for (const [key, value] of Object.entries(expect.json)) {
      if (seen.json && typeof seen.json === 'object' && seen.json[key] === value) facts.push(`${key} ${value}`);
      else problems.push(`${key} is not ${value}`);
    }
  }
  if (expect.redirectTo) {
    let to = null;
    try {
      to = seen.location ? new URL(seen.location, origin) : null;
    } catch {
      to = null;
    }
    if (to && to.origin === new URL(origin).origin && to.pathname === expect.redirectTo) {
      facts.push(`redirects to ${expect.redirectTo}`);
    } else {
      problems.push(`does not redirect to ${expect.redirectTo} on this origin`);
    }
  }
  return problems.length ? { ok: false, detail: problems.join('; ') } : { ok: true, detail: facts.join(', ') };
}

/** Why a request got no response, as a code or a word: never the message. */
function noResponseReason(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'timed out';
  const code = err?.cause?.code || err?.code;
  if (typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code)) return code;
  return typeof err?.name === 'string' ? err.name : 'error';
}

/**
 * Run the checks in order, printing one line each and a summary.
 * @param {string} origin A bare origin (parseOrigin()'s answer).
 * @param {{checks?: typeof CHECKS, print?: (line: string) => void, timeoutMs?: number}} [options]
 * @returns {Promise<{ok: boolean, results: Array<{path: string, ok: boolean, detail: string}>}>}
 */
export async function runSmoke(origin, { checks = CHECKS, print = console.log, timeoutMs = TIMEOUT_MS } = {}) {
  const results = [];
  for (const check of checks) {
    let verdict;
    try {
      verdict = judge(check, await observe(origin, check, { timeoutMs }), origin);
    } catch (err) {
      verdict = { ok: false, detail: `no response (${noResponseReason(err)})` };
    }
    results.push({ path: check.path, ...verdict });
    print(`${verdict.ok ? 'PASS' : 'FAIL'}  GET ${check.path}  ${verdict.detail}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  print(`${results.length} checks: ${results.length - failed} passed, ${failed} failed`);
  return { ok: failed === 0, results };
}

/**
 * The command line. Returns the exit code.
 * @param {string[]} args
 */
export async function main(args, print = console.log, printError = console.error) {
  const options = args.filter((a) => a.startsWith('--'));
  const positional = args.filter((a) => !a.startsWith('--'));
  if (positional.length !== 1 || options.some((o) => o !== '--api-only')) {
    printError('smoke-prod: expected one origin and, optionally, --api-only');
    printError(USAGE);
    return 2;
  }
  let origin;
  try {
    origin = parseOrigin(positional[0]);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    printError(`smoke-prod: ${err.message}`);
    printError(USAGE);
    return 2;
  }
  const apiOnly = options.includes('--api-only');
  const checks = apiOnly ? CHECKS.filter((c) => c.area === 'api') : CHECKS;
  print(`Smoke checks against ${origin}: GET only, no credentials${apiOnly ? ', API checks only' : ''}`);
  const { ok } = await runSmoke(origin, { checks, print });
  return ok ? 0 : 1;
}

/** Run as a script, not imported by a test. Compared by real path (Windows casing). */
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) process.exitCode = await main(process.argv.slice(2));
