# Deploy checklist: the website, the API and extension 1.0.4

Written in B5 of `docs/plans/active/completion-plan.md`, for the owner to run
after B6. The plan stops at deploy-ready, so this file changes nothing by
itself. Every step that touches production (Supabase, Vercel, Dodo, the
Chrome Web Store, a push to the branch Vercel deploys) is the owner's, or
Claude's only after the owner says yes to that step (CLAUDE.md, Escalate).

Where a value is a secret, this file names the variable and nothing else.
Never paste a key into this file, a commit or a chat with Claude.

"Today's production" is `main`'s build: the live API runs `main`'s code
(HANDOVER §0, checkpoint 6). "The new build" is `merge/web-dashboard` at the
commit B6 closed.

---

## Order of operations

1. Before you start (§1).
2. Find out how a deploy happens: a merge may deploy at once (§2).
3. Production Supabase: migrations 006, then 007; the ledger; Redirect URLs
   (§3).
4. Vercel's environment variables (§4).
5. Dodo, live (§5).
6. Deploy (§6).
7. After the deploy: the smoke run, and the checks by hand (§7).
8. Rollback, if needed (§8).
9. Chrome Web Store: submit 1.0.4 (§9).
10. Close out (§10).

The compatibility matrix (§11) is for reference: every pairing of old or new
website with extension 1.0.2 or 1.0.4.

Why this order:

- **Migration 007 goes on before the server that needs it.** Until it is
  applied, every generation and "Explain my fit" answers 503 (they fail
  closed: nothing generated, nothing charged). 006 fails open (no hourly
  ceiling, one warning per instance) and goes on with it. Both are additive,
  and today's server never reads them, so applying them early is safe.
- **The variables before the deploy.** Vercel inlines `VITE_*` values when it
  builds, and a variable changed after a deployment reaches only the next
  one.
- **The store submission after the site is live.** The listing's new privacy
  URL, `/privacy/`, exists only on the new site, and 1.0.4 was built for it.
  Either order works (§11), so a delay on one side blocks nothing.

---

## 1. Before you start

1. B6 is done: `release/onextap-1.0.4.zip` was built by
   `npm run build:release` from production's `.env`, every check passed, and
   its SHA-256 is recorded in §9.
2. The commit to deploy is `merge/web-dashboard` at checkpoint 16, pushed to
   `latest`, with the full gate green there (plan §0.5), plus the ledger
   commit §3 adds on top. Checkpoint 16's SHA: `________` (fill in).
3. You can sign in to the production Supabase project, the Vercel project,
   Dodo's live dashboard, the Chrome Web Store developer dashboard, and
   GitHub with push rights to the repository Vercel watches (§2).
4. Production's keys are at hand, from their backup outside the repo.
5. You have read HANDOVER §7 once: it lists what stays open after the
   deploy.

---

## 2. How the deploy happens

Merging into `main` may deploy production at once. Find out before changing
anything.

1. Vercel → the project → Settings → Git: note the connected repository and
   the Production Branch. Settings → Domains: `www.onextap.com` (and
   `onextap.com`) belong to this project.
2. Vercel → Deployments: note the current Production deployment's source
   (repository, branch, commit). Expect `main` at `bae4abc` or later.
3. Match it to this checkout's remotes:
   - `origin` is `github.com/Aiko002/Onextap`, the backend's repo.
     `merge/web-dashboard` was cut from its `main` at `bae4abc`.
   - `latest` is `github.com/UncannySteel/OneXtap-latest`, where
     `merge/web-dashboard` lives (its default branch).
4. Then, by what step 1 showed:
   - **`Aiko002/Onextap`, branch `main`:** a push to `origin`'s `main`
     deploys production. Nothing goes there before §6.
   - **`UncannySteel/OneXtap-latest`, branch `merge/web-dashboard`:** every
     checkpoint push would already have deployed, yet HANDOVER says nothing
     is deployed. Stop and find out what is live before going on.
   - **Anything else** (another repo or branch, or deploys from the Vercel
     CLI): find out how the live deployment was made, and do §6 the same
     way.
5. Check that `main` has not moved since the branch was cut:

   ```
   git fetch origin
   git log --oneline bae4abc..origin/main
   ```

   It must print nothing. If it prints commits, production's code changed
   after `merge/web-dashboard` left it: stop, merge them into
   `merge/web-dashboard`, and re-run the full gate (plan §0.5) first.
6. If Vercel builds previews of other branches, note which variables its
   Preview environment holds (§4, step 4).

---

## 3. Production Supabase

1. Run the owner's private Supabase runbook (kept outside the repo) and finish it before going on.
2. **Ask first.** Everything below runs against production. Claude runs
   nothing here without the owner's yes for that step (CLAUDE.md, Escalate);
   the owner pastes the SQL into production's SQL Editor. Never run
   `supabase/schema.sql` on production (the ledger, "Never re-run
   schema.sql").
3. Read `supabase/migrations/README.md`. Production should show `001` to
   `005` applied, `006` and `007` not. There is no `008`.
4. **Probe before applying** (read-only):

   ```sql
   select
     to_regclass('public.profiles')                as profiles,
     to_regclass('public.credit_transactions')     as credit_transactions,
     to_regprocedure('public.handle_updated_at()') as handle_updated_at,
     to_regclass('public.generation_rate_limit')   as m006_table,
     to_regclass('public.generation_allowances')   as m007_table,
     to_regprocedure(
       'public.spend_generation(uuid,text,uuid,text,integer,text)'
     ) as m007_spend,
     to_regprocedure('public.undo_generation(uuid,jsonb,text)') as m007_undo;
   ```

   Expected: the first three not null (006 and 007 need them), the last four
   null. If any of the last four is not null, the ledger is wrong (its
   "Ledger drift" section): write down what you found before going on. Both
   files are re-runnable, so applying them still works.
5. **Apply 006:** paste all of
   `supabase/migrations/006_generation_rate_limit.sql` and run it once. The
   editor may warn about destructive operations: `drop trigger if exists`
   and `alter table` here touch only the table the file itself creates (the
   ledger explains the same false positive for `001` and `002`).
6. **Verify 006** (read-only):

   ```sql
   select
     (select relrowsecurity from pg_class
       where oid = 'public.generation_rate_limit'::regclass) as rls_on,
     (select count(*) from pg_policies
       where schemaname = 'public'
         and tablename = 'generation_rate_limit') as policies,
     (select count(*) from pg_trigger
       where tgrelid = 'public.generation_rate_limit'::regclass
         and tgname = 'generation_rate_limit_updated_at') as triggers;
   ```

   Expected: `true`, `0`, `1`. An error saying the relation does not exist
   means 006 did not apply.
7. **Apply 007:** paste all of
   `supabase/migrations/007_generation_charges.sql` and run it once. It ends
   with `notify pgrst, 'reload schema'`, which lets the API see the two new
   functions.
8. **Verify 007** (read-only), two queries:

   ```sql
   select
     (select relrowsecurity from pg_class
       where oid = 'public.generation_allowances'::regclass) as rls_on,
     (select count(*) from pg_policies
       where schemaname = 'public'
         and tablename = 'generation_allowances') as policies,
     (select count(*) from public.generation_allowances) as row_count;
   ```

   Expected: `true`, `0`, `0`.

   ```sql
   select f as fn,
     has_function_privilege('anon', f, 'execute')          as anon,
     has_function_privilege('authenticated', f, 'execute') as authed,
     has_function_privilege('service_role', f, 'execute')  as service_role
   from unnest(array[
     'public.spend_generation(uuid,text,uuid,text,integer,text)',
     'public.undo_generation(uuid,jsonb,text)'
   ]) as f;
   ```

   Expected: two rows, each `false`, `false`, `true`. A signed-in browser
   must not be able to call either function.
9. **The ledger, in the same commit as the apply.** In
   `supabase/migrations/README.md`'s Status table, set the Production column
   of the `006_generation_rate_limit.sql` and `007_generation_charges.sql`
   rows to **applied <date>**, and add a sentence under the table that both
   were verified that day by the read-only queries in this checklist. Commit
   it on `merge/web-dashboard` before §6, so the deploy carries it:

   ```
   git add supabase/migrations/README.md
   git commit -m "Ledger: 006 and 007 applied to production"
   git push latest merge/web-dashboard
   ```

10. **Redirect URLs.** Authentication → URL Configuration:
    - Add `https://www.onextap.com/dashboard/**` (sign-in, Google included,
      lands there; the wildcard because the job-page handoff comes back
      with a query string, as on dev at checkpoint 15) and
      `https://www.onextap.com/reset-password/` (the password-reset email's
      link).
    - Keep the `https://<extension-id>.chromiumapp.org/` entry that is there
      (for the store build, `fpleipjggoiolomkcnchnlelbjcnoklj`).
    - The Site URL stays the root, `https://www.onextap.com`: the landing
      forwards a session that lands there, which is also the fallback for
      any address not on the list (HANDOVER §7 item 7).
    - The `http://localhost:5173/...` entries belong to the dev project
      (HANDOVER §9), not here.
    - If `https://onextap.com/` serves the site itself rather than
      redirecting to `www`, add the same two paths for it.

---

## 4. Vercel's environment variables

Names only. Values come from production's backup; secrets go only into
Vercel. Set them for the **Production** environment, before §6.

1. **Server variables** (read by the API function at run time). Every one is
   server-only: none may be renamed with a `VITE_` prefix, which would put it
   into the public bundle (CLAUDE.md rule 7). The list comes from
   `test/server/harness.js`'s `HARNESS_ENV`, which `test/rules/harness.test.js`
   keeps complete.

   Required:

   | Name | Note |
   | --- | --- |
   | `SUPABASE_URL` | the production project (the one 1.0.4 and the website use) |
   | `SUPABASE_SERVICE_ROLE_KEY` | secret |
   | `GROQ_API_KEY` | secret |
   | `GEMINI_API_KEY` | secret |
   | `DODO_PAYMENTS_API_KEY` | secret: the live key (§5) |
   | `DODO_PAYMENTS_WEBHOOK_KEY` | secret: the live endpoint's signing secret (§5) |
   | `DODO_PAYMENTS_ENVIRONMENT` | `live_mode` |
   | `DODO_PRODUCT_ID` | the live subscription product |
   | `CRON_SECRET` | secret. Unset, the daily ingest answers 503 (the smoke run checks) |
   | `RESEND_API_KEY` | secret. Unset, the feedback form answers 500 |
   | `CLIENT_URL` | `https://www.onextap.com`: checkout returns to its `/dashboard/`, and it is the first CORS origin. Production's backup has none, and the default is the same value |
   | `ALLOW_CACHE_SOURCE` | `false`, or unset (the synthetic listings stay out of production) |

   Optional (unset, the code's default applies):
   - Job ingest: `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` (both, or the Adzuna
     source is off; secret), `ADZUNA_COUNTRIES`, `ATS_BOARDS`,
     `INGEST_SWEEP_PAGES`.
   - Models: `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_PARSE_MODELS`,
     `GEMINI_RANK_MODELS`; `GROQ_MODEL`, `GROQ_FALLBACK_MODEL` (set these two
     to ids the Groq key can reach: `server/.env.example` says how),
     `GROQ_MAX_TOKENS`, `GROQ_TIMEOUT_MS`, `GROQ_MAX_RETRIES`.
   - The hourly draft ceiling: `GENERATE_LIMIT_PER_HOUR` (default 30).
   - Ranking: `RANK_PROVIDER`, `RANK_BROADEN`, `RANK_BUDGET_MS`,
     `RANK_MAX_LOOPS`, `RANK_MIN_SCORE`, `RANK_BATCH_SIZE`,
     `RANK_CONCURRENCY`, `RANK_MAX_TOKENS`.
   - Feedback mail: `RESEND_FROM_EMAIL`, `FEEDBACK_TO_EMAIL`.
   - Tracing: `OPIK_API_KEY` (secret; unset, tracing is off and the SDK never
     loads), `OPIK_WORKSPACE`, `OPIK_PROJECT_NAME`, `OPIK_URL_OVERRIDE`. What
     Opik keeps is on the privacy page; keep it that way (CLAUDE.md rule 8).
   - Logs: `LOG_LEVEL` (default `info` in production), `LOG_FORMAT` (on
     Vercel the logs are JSON either way).

   Leave unset on Vercel:
   - `VERCEL`, `NODE_ENV`: Vercel sets them itself.
   - `PORT`: the function does not listen.
   - `ONEXTAP_SKIP_DOTENV`: the test harness's switch.
   - `GROQ_BASE_URL`, `RESEND_BASE_URL`, `DODO_PAYMENTS_BASE_URL`: SDK
     overrides the harness uses to point at dummies. Set together with
     `DODO_PAYMENTS_ENVIRONMENT`, the last makes the Dodo SDK throw.

2. **Website build variables** (`VITE_*`, inlined into the public bundle when
   Vercel builds; public by design):

   | Name | Note |
   | --- | --- |
   | `VITE_SUPABASE_URL` | the production project, the same as `SUPABASE_URL` |
   | `VITE_SUPABASE_ANON_KEY` | the anon (publishable) key. Never the service-role key |
   | `VITE_DASHBOARD_URL` | `https://www.onextap.com`, the site's origin (the code appends `/dashboard/`) |
   | `VITE_API_URL` | leave unset or empty: the site then calls its own `/api/` |
   | `VITE_ANSWER_STUDIO_MODEL` | optional (default `llama-3.3-70b-versatile`) |
   | `VITE_LOG_LEVEL` | optional |

3. The website's `VITE_SUPABASE_URL`, the server's `SUPABASE_URL` and the
   1.0.4 zip's Supabase host must name one project
   (`itqaozltgsyvjhlcllic`, which B6 confirmed for the zip). Compare hosts,
   never keys.
4. **Preview:** decide what the Preview environment gets. Previews of other
   branches run the server with whatever is set there, so production's
   secrets in Preview mean previews act on production's data and payments.
5. Mark the secrets as sensitive if Vercel offers it for this project.
6. A variable changed after a deployment reaches only the next one: change
   variables before §6, or redeploy after.

---

## 5. Dodo, live

Production already takes live payments (`DODO_PAYMENTS_ENVIRONMENT` is
`live_mode` in the backed-up keys, HANDOVER checkpoint 6), so most of this
should exist. Confirm each item, and change only what is missing. All of it
is in Dodo's **live** dashboard, not test mode.

1. **The webhook endpoint** is `https://www.onextap.com/api/webhook`,
   subscribed to at least `subscription.active`, `subscription.renewed`,
   `subscription.on_hold`, `subscription.cancelled`, `subscription.failed`
   and `payment.failed` (the events `server/routes/webhook.js` handles; it
   ignores the rest).
2. **Its signing secret** is `DODO_PAYMENTS_WEBHOOK_KEY` in Vercel: copied
   with Dodo's copy button, `whsec_` and then base64. A new endpoint has a new
   secret. HANDOVER §9 lists the two ways this broke on dev.
3. **The live API key** is `DODO_PAYMENTS_API_KEY` in Vercel, and
   `DODO_PRODUCT_ID` names the live subscription product.
4. **The customer portal** is enabled for the live account (it was checked in
   test mode only). "Manage subscription" opens it for a paying account.
5. **Don't touch:** the webhook stays registered before `express.json()` in
   `server/app.js`. It needs the raw body for the signature (CLAUDE.md rule
   4; `test/rules/` checks it). Nothing in this checklist changes code; if
   something seems to need a change there, stop.
6. **After the deploy, from time to time:** a duplicate subscription is
   cancelled automatically, but its payment is refunded by hand. The API log
   names both subscriptions (HANDOVER §7 item 30).

---

## 6. Deploy

1. Last look: §3 done (006 and 007 verified, the ledger committed), §4 set,
   §5 confirmed.
2. Optional, for a baseline, the smoke run (§7, step 1) against today's
   production. The redirect and not-found checks fail there (the old build
   rewrites every path to one page); the rest should pass. After the deploy
   all nine pass, which is how you tell the new build is the one answering.
3. Optional, if §2 found Vercel building previews and §4 gave Preview values
   you are happy for it to use: push `merge/web-dashboard` to the watched
   repository as a branch (never `main`) and run the smoke script against the
   preview's `https://` address. If Vercel protects previews, every check
   answers 401: skip this step.
4. Deploy, by §2's case. For `Aiko002/Onextap` and `main`:

   ```
   git fetch origin
   git checkout main
   git merge --ff-only origin/main
   git merge --ff-only merge/web-dashboard
   git push origin main
   ```

   If a `--ff-only` refuses, `main` moved: back to §2, step 5.
5. Watch the build in Vercel → Deployments (`vite build --config
   vite.dashboard.config.js`, and the `api/index.js` function). A failed
   build leaves the old deployment live.
6. The deploy closes HANDOVER §7 item 26 (the credit-minting route) at once.

---

## 7. After the deploy

1. **The smoke run:**

   ```
   node scripts/smoke-prod.mjs https://www.onextap.com
   ```

   Expected: nine `PASS` lines, then `9 checks: 9 passed, 0 failed`, and
   exit code 0. It sends GET requests only, with no credentials, and prints
   status codes, never a header's value or a body (`--api-only` runs the
   three API checks alone). When a line fails:
   - `/api/health`: the API is not up. Read the function's logs in Vercel.
   - `/api/jobs/ingest` with 503: `CRON_SECRET` is not set (§4).
   - `/privacy-policy` or the not-found check with 200: the old build still
     answers. Check Domains, and that the deployment was promoted.
2. **Item 26, by hand** (the script refuses anything but GET):

   ```
   curl -i -X POST https://www.onextap.com/api/credits/refund
   ```

   In Windows PowerShell 5.1 type `curl.exe`: plain `curl` there is
   `Invoke-WebRequest`. Expected: `404`. A `401` means the old server is
   still answering, credit-minting route and all. The request carries no
   token and no body, so it cannot mint a credit either way.
3. **By hand in a browser**, with your own account:
   1. Sign in on `https://www.onextap.com`: the dashboard at `/dashboard/`
      greets you and shows the credit balance.
   2. Generate one answer in Answer Studio (one credit unless Premium): an
      answer comes back and the balance drops by one. "AI writing is
      unavailable right now" means the spend failed: search the function's
      logs for `generation charging is not set up` (007 is missing: §3). If
      007 verified fine, PostgREST has not reloaded its schema: run
      `notify pgrst, 'reload schema';` in the SQL Editor and try again.
   3. The logs hold no `generation limit unavailable` warning (006 is
      missing if they do).
   4. Sign out, then sign in with Google: you land on `/dashboard/` signed
      in. Landing on the home page first and then the dashboard is the
      fallback for a missing Redirect URL (§3, step 10), not a failure. An
      error from Supabase about the provider means Google is not enabled on
      the production project (Authentication → Providers).
   5. Manage subscription opens; for a paying account, Dodo's portal opens.
   6. With the store extension (1.0.2) in your browser, save a profile: the
      status says the extension is out of date, with a link to the store
      (expected until 1.0.4 is out; §11).
4. **The first live webhook:** the next subscription event shows a 2xx for
   `https://www.onextap.com/api/webhook` in Dodo's live delivery log. A 400
   is the signing secret (§5, step 2); a 404 is the endpoint's address; a 500
   makes Dodo deliver again, and the function's log says why (every response
   carries an `X-Request-Id` to search by).
5. **The next morning**, after 06:00 UTC: Vercel's cron log shows
   `/api/jobs/ingest` ran and answered 200.

---

## 8. Rollback

1. **Vercel's instant rollback:** Deployments → the deployment that was live
   before → Instant Rollback. It takes seconds and builds nothing. Vercel
   may then hold back automatic promotion of new pushes until a deployment
   is promoted again: read the project's banner.
2. **Leave the migrations.** 006 and 007 are additive: the old server never
   reads `generation_rate_limit`, `generation_allowances` or the two
   functions. Dropping them would only make the next deploy wait on them
   again. Leave the Redirect URLs and Dodo as they are too.
3. **What a rollback brings back**, until the next deploy:
   - HANDOVER §7 item 26: `POST /api/credits/refund` mints credits again.
   - The old charging, where the page pays after the fact through
     `POST /api/credits/deduct`. Tabs still holding the new dashboard never
     call it, so their generations go uncharged until they are reloaded.
   - Follow-ups the new server granted (free improvements and re-runs) are
     unknown to the old one. They last 30 days, so they work again after
     the next deploy.
4. **Why the deploy itself is safe for open tabs:** a tab still holding the
   old dashboard calls the new server's generate route, which now charges,
   and then `POST /api/credits/deduct`, which is now a no-op that answers
   with the balance. Charged once, not twice.
5. **The extension needs nothing:** 1.0.2 and 1.0.4 both work with the old
   site (§11).
6. Fix the cause on `merge/web-dashboard`, re-run the gate, and come back to
   §6.

---

## 9. Chrome Web Store: 1.0.4

After the website is live (see "Why this order").

1. **The zip** is B6's `release/onextap-1.0.4.zip`. Its SHA-256, from B6's
   run:

   ```
   SHA-256: ________________________________________________________________
            ^ TO FILL IN from B6's `npm run build:release` output
   ```

   Before uploading, check it is the same file:

   ```
   Get-FileHash -Algorithm SHA256 release\onextap-1.0.4.zip
   ```

   A different hash means a different zip: rebuild with
   `npm run build:release` (every check runs again) and record the new hash
   here.
2. **Upload:** the developer dashboard → the Onextap item
   (`fpleipjggoiolomkcnchnlelbjcnoklj`) → Package → upload the zip. Its
   version, 1.0.4, is above the store's 1.0.2.
3. **Permissions, unchanged from 1.0.2:** `storage`, `activeTab`,
   `scripting`, `identity`; host permissions `https://*.supabase.co/*`,
   `https://www.onextap.com/*`, `https://onextap.com/*`; and
   `externally_connectable` for the two `onextap.com` origins. 1.0.2 also
   listed `localhost` entries, which 1.0.4 drops: narrower, so no new
   permission warning for users (`scripts/releaseManifest.js` pins this, and
   B6 checked the zip's manifest). The justifications on the privacy
   practices tab stay as they are.
4. **The privacy policy URL:** `https://www.onextap.com/privacy/` (the old
   `/privacy-policy` redirects there on the new site). Data use is
   unchanged: 1.0.4 sends nothing anywhere new (`docs/extension-protocol.md`,
   the handoff and the wipe).
5. **What's new**, a draft. The store has no release-notes field to rely
   on; use it wherever it fits (the top of the description, the site):

   > **What's new in 1.0.4**
   >
   > - **Customize a cover letter from the job page.** Open Onextap on an
   >   application page and a "Customize cover letter" button appears in the
   >   corner of the cover-letter field. It opens your Onextap dashboard with
   >   the company, the role and the job description filled in. Fill the
   >   finished letter in from the popup's Cover tab.
   > - **Dashboard edits reach the extension.** Profiles you save on the
   >   dashboard now update the extension, also after you have opened the
   >   popup.
   > - **Cover-letter templates are managed on the dashboard.** The popup
   >   shows them read-only, with a link to manage them there.
   > - **Deleting your account clears the extension too.** Deleting your
   >   Onextap account now also removes the extension's saved data in this
   >   browser.

6. **Submit for review.** If the submit dialog lets you hold the release
   until you publish it yourself, use that, so it goes out when you choose.
7. **A staged rollout,** if the dashboard offers a percentage rollout for
   this item: start small, watch the reviews and support mail for a few
   days, then widen. If it is not offered, publish to everyone.
8. **When it is out:** update the store install in your own Chrome
   (`chrome://extensions` → Update), then check the 1.0.4 column of §11 by
   hand: a profile saved on the dashboard says "Saved and synced", and the
   job-page button on a real posting fills the dashboard.

---

## 10. Close out

1. HANDOVER §0: a new entry for the deploy, with the date, the deployed
   commit, the smoke run's counts, the checks by hand and anything that
   failed. In §7, mark the items the deploy closed (26 first) as deployed.
2. The ledger's production rows went in with §3; `git log origin/main`
   shows the commit.
3. When 1.0.4 is published: HANDOVER's state paragraph says the store
   version is 1.0.4, and the date.

---

## 11. Compatibility matrix

Every pairing works. "Old site" is today's production (`main`'s build);
"new site" is this branch. Each site talks to its own API, on the same
origin.

| | Extension 1.0.2 (the store today) | Extension 1.0.4 |
| --- | --- | --- |
| **Old site** | Today. A profile sync says success but reaches the popup only before its first open (HANDOVER §7 item 1); a resume uploaded through the extension loses its text (item 31); `POST /api/credits/refund` mints credits (item 26). | Works. 1.0.4 answers all four messages 1.0.2 answers, the same way for every sender the old site uses (`GENERATE_IMPROVED_ANSWER` is the popup's alone, and the old site never sends it), and its sync now also reaches an opened popup. The old site never asks `ONEXTAP_HELLO`, so its copy does not change. The job-page button and the popup's dashboard links open `/dashboard/…`, where the old site serves its own single page without the job filled in. No wipe on account deletion: the old site never sends it. |
| **New site** | Works, and says what it can't do. The site sees `legacy`: after a save the status says the extension is out of date, with a store link, and the sync is still sent (it helps a fresh install). Resume upload goes through the API. No job-page button. The delete dialog says the extension's copy stays. | Everything: `current`, with `profile-sync`, `cover-handoff` and `wipe-local`. "Saved and synced", the job-page button's handoff into the cover-letter workspace, the wipe on account deletion, read-only popup templates. |

Also:

- **No extension, new site:** `absent`; a save says "Saved on this device".
- **Old clients on the new API:** an old dashboard page or 1.0.2's popup
  still calls `POST /api/credits/deduct` after a generation; it charges
  nothing now and answers with the balance, so nothing is charged twice
  (§8, step 4).
- **Both extensions at once:** Chrome updates installs over hours to days
  after 1.0.4 is published, so the new site meets 1.0.2 and 1.0.4 side by
  side. It asks each browser's extension on every call.

How each cell is known:

- New site × 1.0.2: the `legacy` e2e against the real store 1.0.2
  (`web/tests/extension-legacy.spec.js`), and B4's checks 16 and 18 by hand
  (HANDOVER §5 has the results).
- New site × 1.0.4: `npm run test:e2e:extension` against stubs
  (`extension.spec.js`, `cover-handoff.spec.js`), and B4's checks 13 to 18
  with real services (HANDOVER §5).
- Old site × 1.0.4: the four 1.0.2 replies are unit-tested through the
  worker (`test/extension/workerCompat.test.js`). Not run against the live
  old site; where its pages land is read from `main`'s `vercel.json`, not
  tried.
- Old site × 1.0.2: HANDOVER §7 items 1, 26 and 31.
- The protocol itself: `docs/extension-protocol.md`.
