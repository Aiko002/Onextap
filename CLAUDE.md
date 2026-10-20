# Hot Memory — Onextap

Tier 1. Always loaded, so keep it under 2,000 tokens. Everything else lives
in `memory/` and `docs/` and is read on demand.

## Project

Onextap: a Chrome MV3 extension that autofills job applications, plus a
website and an Express backend on one origin (landing `/`, dashboard
`/dashboard/`, API `/api/`). The popup is React (`src/`); the website is plain
JS (`web/`) importing `src/` modules via `@app`. Supabase holds accounts and
billing only. Layout and import rules: `docs/repo-structure.md`; user paths:
`docs/app-flow.md`; merge status: `HANDOVER.md`.

## Always

1. Always rebuild and reload after touching `src/`, `extension/`, or
   `public/`: `npm run build`, then reload at `chrome://extensions/`. A
   loaded extension does not pick up dev-server changes.
2. Always verify a change to a `src/` module the website imports on both
   front ends: `chrome.*` present (popup) and absent (website). Guards look
   like `typeof chrome !== 'undefined' && chrome?.runtime`.
3. Always guard credit values with `Number.isFinite()` before comparing or
   rendering. Premium accounts report `Infinity`, not a number.
4. Always keep the Dodo webhook (`server/routes/webhook.js`) registered on
   the app in `server/app.js`, *before* `express.json()`. It needs the raw
   body for signature verification; moving it silently breaks payment
   webhooks in production only.
5. Always mirror scraper selector fixes across both copies:
   `scrapeJobPage()` in `extension/background.js` and `scrapePageContext()`
   in `public/content.js`. They cannot call each other, so each starts with
   the same `SELECTORS` literal (its `*Academic` keys are `content.js`'s
   only); `test/rules/` fails when the two drift.

## Never

6. Never adjust credits or premium status client-side. Every change goes
   through the authenticated server routes; RLS makes `credit_transactions`
   writable only by the service role. That is the anti-tamper design.
7. Never put a server secret behind a `VITE_*` name. Everything `VITE_*` is
   inlined into the shipped bundle. `SUPABASE_SERVICE_ROLE_KEY`,
   `GROQ_API_KEY`, `GEMINI_API_KEY` and the Dodo keys are `server/.env` only.
8. Never *persist* profile data (personal details, saved answers, cover
   letters) anywhere but the device: `chrome.storage.local` in the extension,
   `localStorage` on the web, synced over `ONEXTAP_SYNC_DATA`. Never to
   Supabase. Local storage is not non-disclosure, and do not write comments
   claiming it is: resume text goes to Gemini and Groq transiently per
   request, and Opik **retains** the traces it records. A new destination for
   profile data is an escalation, and the privacy page
   (`web/src/pages/privacy/privacy.html`, served at `/privacy/`) has to say so
   before it ships.
9. Never reference anything outside its own body inside `scrapeJobPage()`
   (`extension/background.js`). It is serialized into the target page by
   `chrome.scripting.executeScript({ func })`; a closure variable or import
   throws in the page, not at build time.
10. Never commit `.env` or `server/.env`, and never echo their contents into
    output. Both are gitignored and hold live keys.
11. Never call `console.*` directly. Use the logger for the surface you are in
    (see Key facts). They redact secrets and profile data before printing;
    a raw `console.log` of a profile or a token defeats rules 7 and 8.

## Commands

- Install: `npm install && npm run server:install`
- Build: extension → `dist/`, `npm run build` (needs `.env`); website →
  `dist-dashboard/`, `npm run build:dashboard`.
- Store zip → `release/onextap-<version>.zip`: `npm run build:release`.
  Refuses unless `.env` holds production's addresses; drops localhost from
  the manifest, scans for secrets, checks permissions against 1.0.2's.
- Dev: `npm run dev` (website; keep :5173, the only local origin
  `externally_connectable` allows), `npm run dev:extension`,
  `npm run server:dev` (`LOG_LEVEL=debug` for more; client side
  `VITE_LOG_LEVEL`).
- **Test: `npm test`** (Node 21+; 22.15+ for the tests that load `src/`
  through `test/extension/viteModules.js`, which older Node skips): unit
  tests, every route through `test/server/harness.js` (the real app, dummy
  env, no network), and rules 4, 5, 7, 9 and 10 in `test/rules/`. A new route means
  updating `test/rules/routes.snapshot.json`.
- **Lint: `npm run lint`** (ESLint 9, correctness only). `no-console` is an
  error outside the loggers, `scripts/` and the e2e probes (rule 11).
- **E2E** against stubs: `npm run test:e2e` (the website);
  `npm run test:e2e:extension` (the extension loaded: sync, autofill, Cover
  tab, handoff, wipe; a `legacy` project runs store 1.0.2 if
  `E2E_LEGACY_EXTENSION_PATH` is set). `E2E_CHROMIUM_PATH` picks the
  Chromium. Needs port 5173 free.

Nothing else automated drives the dashboard or the popup, nor real
services. There, "verified" means you built it and exercised the path in the
browser. Say so plainly when you have not.

## Key facts

- Two builds: `vite.config.js` → extension; `vite.dashboard.config.js` → the
  website from `web/`, which `vercel.json` runs (`build:dashboard`).
- `api/index.js` re-exports the Express app for Vercel. Keep it bare.
- Server: `server/index.js`, whose first import must stay `server/load-env.js`
  (`server/supabase.js` reads `process.env` at load), → `server/app.js`
  (middleware order) → `server/routes/`; helpers in `server/lib/`, prompts in
  `server/prompts/`. `server/` has its own `package.json` and `node_modules`.
- Charging is the server's, inside the request: `spend_generation()`
  (migration 007) via `server/lib/generationSpend.js`. Without 007 it fails
  closed (503).
- Extension messages: `docs/extension-protocol.md`, one module each in
  `extension/messages/`. Every key written to `chrome.storage.local` is in
  `src/localKeys.js`. An unpacked build is reached only through
  `?extensionId=`: open the dashboard from its popup.
- In Supabase only `job_listings` (and its cursor, `job_ingest_state`) is
  not keyed to a user; no table holds profile data (rule 8).
- `supabase/schema.sql` is for bootstrapping a fresh project only (it drops
  and recreates `on_auth_user_created`); an existing one gets the numbered
  files in `supabase/migrations/`, by hand in the SQL Editor. That folder's
  `README.md` is the only record of what is applied where: read it before
  assuming a table exists, and update it in the same commit as the apply.
- Four loggers, one per runtime: `server/logger.js` (adds request ids),
  `src/logger.js` (popup and website), `extension/logger.js` (service
  worker), and an inline one at the top of `public/content.js`. Their
  redaction key lists mirror each other.
- Every server response carries `X-Request-Id`: quote it to find the log line.
- Git: the work is on `merge/web-dashboard`, pushed to remote `latest`;
  `origin` is the backend's repo. Nothing is merged into `main`.

## Escalate

Stop and ask before:

- Running anything against the production Supabase project, including
  re-running `supabase/schema.sql`.
- Changing credit amounts, pricing, webhook handling, or premium gating.
- Adding or widening `permissions` / `host_permissions` /
  `externally_connectable` in `extension/manifest.json`.
- Deleting user profile data or changing the `user_profile` ⟷
  `onextap_profiles` handling: the migration in `src/profileStore.js`, or the
  worker's sync in `extension/profileSync.js`.
- Publishing to the Chrome Web Store, deploying to Vercel, merging into
  `main` or pushing to `origin` (`main` may auto-deploy).

---

Review monthly. Rules that never prevent a mistake should be cut.
