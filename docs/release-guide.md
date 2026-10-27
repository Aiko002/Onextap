# Onextap live release guide

As of 2026-10-21. The same guide is kept as a shared doc for whoever runs the
release; this copy travels with the code. `docs/deploy-checklist.md` is the
detailed version, with the reasons behind each step.

Onextap is already live at www.onextap.com, with real users, on the old
build. This release updates it in place: the new website, dashboard and API,
then extension 1.0.4 on the Chrome Web Store. The code goes to the live
repository, and **pushing it there is the deploy**, so steps 2 to 4 come
before that push. Everything is built and tested against the dev project;
nothing here has touched production yet. Follow the steps in order.

## Before you start

You need the repository, access to seven dashboards, and four things from the
owner. Get all of it before step 1.

**What ships**

| Part | Where it goes | From |
| --- | --- | --- |
| Website, dashboard and API (one Vercel project) | `https://www.onextap.com` (`/`, `/dashboard/`, `/api/`) | branch `merge/web-dashboard` |
| Two database migrations, 006 and 007 | the production Supabase project, `itqaozltgsyvjhlcllic` | `supabase/migrations/` |
| Extension 1.0.4 | the Chrome Web Store item `fpleipjggoiolomkcnchnlelbjcnoklj` (the store has 1.0.2 today) | `release/onextap-1.0.4.zip`, built from the branch in step 9 |

**Access you need**

- [ ] The production Supabase project (SQL Editor, Authentication settings)
- [ ] The Vercel project that serves www.onextap.com
- [ ] Dodo Payments, the **live** dashboard
- [ ] The Chrome Web Store developer dashboard
- [ ] GitHub, with push rights to the repository Vercel deploys from (step 1 finds out which)
- [ ] Resend (the account the feedback form uses) and onextap.com's DNS settings, for step 6
- [ ] Google Search Console, and the Google Cloud project that holds production's Google sign-in client, as Owner or Editor, for step 8

**From the owner**

- [ ] The owner's private Supabase runbook. It is not in this guide and not in the repository: get it from the owner directly, and finish it before step 2.
- [ ] Production's keys, from their backup. You type them into the dashboards that need them.
- [ ] The release zip, `release/onextap-1.0.4.zip`, which you build yourself in step 9: you need production's Supabase anon key for it.
- [ ] The commit to deploy: `merge/web-dashboard` at checkpoint 16 or later, on the remote `latest` (`github.com/UncannySteel/OneXtap-latest`).

**Rules for the whole release**

- **The push is the deploy.** Nothing goes to the live repository's production branch before step 5, and never with `--force`.
- **Clone fresh.** Get the code from `latest` after 2026-10-21: the branch's history was reworded that day, so an older clone won't fast-forward.
- Never paste a key into this guide, a commit, a chat or a ticket. The guide names variables, never values.
- Never run `supabase/schema.sql` on production. It bootstraps a brand-new project only; production gets the numbered migrations.
- No code changes during the release. If something seems to need one, stop and tell the owner.
- Ask the owner before anything not written here that touches production.

## The order at a glance

Ten steps, in this order. Steps 1 to 5 put the new site live; 6 and 7 finish
and check it; 8 and 9 can take days and wait on nothing else.

1. Confirm the live repository and branch, and that pushing this code there is a plain fast-forward.
2. Production Supabase: the owner's runbook, migrations 006 then 007, the ledger, Redirect URLs.
3. Vercel's environment variables.
4. Dodo Payments, live: confirm what exists.
5. Push to the live repository: this is the deploy.
6. The auth emails: custom SMTP (sender "Onextap"), then the four templates.
7. Check the live site: the smoke script, then by hand.
8. Google's sign-in screen: name, logo, brand verification (days).
9. Build the extension's release zip, then submit 1.0.4 to the Chrome Web Store.
10. Close out.

Why this order:

- **Migration 007 before the new server.** Without it every generation and "Explain my fit" answers 503: nothing generated, nothing charged. Both migrations only add tables and functions, and today's server never reads them, so applying them early is safe.
- **Variables before the deploy.** Vercel bakes `VITE_*` values in when it builds; a change after a deploy reaches only the next one.
- **Emails after the deploy.** Custom SMTP sends through Resend, which only the new privacy page names.
- **Google and the store after the site is live.** Google reads the new home page and `/privacy/`; the store listing points at `/privacy/`, which only the new site serves. Every website works with both extension versions, so neither side blocks the other.

## What live users notice

The switch is in place, with no downtime and nothing for users to do. This
follows from the code and the tests; it has not been watched on the live site.

| At the deploy | Why |
| --- | --- |
| No downtime | Vercel serves the new build only once it has built; a failed build leaves the old site up |
| Signed-in users stay signed in | Same Supabase project, same address, same session storage key |
| Profiles and saved answers in the browser carry over | Same address, same storage keys (`onextap_profiles`, `user_profile`) |
| Old links still work | The old dashboard's addresses (the extension's `?extensionId=` and `?view=`, a checkout's `?payment=`, sign-in returns) forward to `/dashboard/`; `/privacy-policy` redirects to `/privacy/` |
| Tabs left open on the old dashboard keep working | They are charged once per generation, not twice |
| Extension 1.0.2 keeps working | After a save, the new dashboard says the extension is out of date, with a store link, until 1.0.4 is out (step 9) |

Today's live site, checked 2026-10-27 with the smoke script (step 7): 7 of 9
pass. The two that fail (`/privacy-policy` and the not-found page) are the old
build's; after the deploy all nine pass.

## Step 1 · The live repository

This code is pushed to the live repository, and that push deploys production.
Confirm which repository and branch Vercel deploys from, and that the push
will be a plain fast-forward, before changing anything else.

1. Vercel → the project → **Settings → Git**: the connected repository and its **Production Branch** are the live repository and branch (expected: `github.com/Aiko002/Onextap`, `main`). **Settings → Domains**: `www.onextap.com` and `onextap.com` belong to this project.
2. Vercel → **Deployments**: the live Production deployment's commit. Expect `main` at `bae4abc`, where this work started.
3. Make a fresh clone of this code with its remote named `latest` (steps 2 and 9 use that name), and add the live repository as a remote named `live`:

    ```
    git clone -o latest https://github.com/UncannySteel/OneXtap-latest.git onextap-release
    cd onextap-release
    git remote add live https://github.com/Aiko002/Onextap.git
    git fetch live
    ```
4. The push must be a fast-forward: the live branch may not hold anything this code lacks. This must print `fast-forward: ok` (use the Production Branch from item 1 in place of `main`):

    ```
    git merge-base --is-ancestor live/main latest/merge/web-dashboard && echo "fast-forward: ok"
    ```

    If it prints nothing, production changed after this work left it. Stop and tell the owner: those commits need merging into `merge/web-dashboard` and the full test gate run again first.
5. If Vercel builds previews of other branches, note which variables its **Preview** environment holds (step 3 decides what goes there).
6. If the live repository is not the one item 1 expects, or Vercel deploys some other way (the CLI, another branch), stop and ask the owner before going on.

## Step 2 · Production Supabase

Apply migrations 006 and 007 to production, check each with a read-only query,
record it, and add two Redirect URLs. All SQL is pasted into production's
**SQL Editor** by hand.

1. **The owner's private runbook first.** Finish it before anything below. Ask the owner for it; it is not written here.
2. **Read the ledger:** `supabase/migrations/README.md`. Production should show `001` to `005` applied, `006` and `007` not. There is no `008`.
3. **Probe before applying** (read-only):

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

    Expected: the first three **not null**, the last four **null**. If any of the last four is already there, write down what you found and tell the owner; both files can be re-run safely.
4. **Apply 006:** paste all of `supabase/migrations/006_generation_rate_limit.sql` and run it once. A warning about destructive operations is a false positive: its `drop trigger if exists` and `alter table` touch only the table the file creates.
5. **Verify 006** (read-only):

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

    Expected: `true`, `0`, `1`. "Relation does not exist" means 006 did not apply.
6. **Apply 007:** paste all of `supabase/migrations/007_generation_charges.sql` and run it once. It ends with `notify pgrst, 'reload schema'`, so the API sees the new functions straight away.
7. **Verify 007** (read-only), two queries:

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

    Expected: two rows, each `false`, `false`, `true`. A signed-in browser must not be able to call either function.
8. **Record it in the ledger, before the deploy.** In `supabase/migrations/README.md`'s Status table, set the Production column of the 006 and 007 rows to **applied** and the date, and add a sentence under the table that both were verified that day with these read-only queries. Then:

    ```
    git add supabase/migrations/README.md
    git commit -m "Ledger: 006 and 007 applied to production"
    git push latest merge/web-dashboard
    ```
9. **Redirect URLs:** Authentication → **URL Configuration**.
    - Add `https://www.onextap.com/dashboard/**` (where sign-in lands; the wildcard because the job-page handoff comes back with a query string).
    - Add `https://www.onextap.com/reset-password/` (the password-reset email's link).
    - Keep the existing `https://fpleipjggoiolomkcnchnlelbjcnoklj.chromiumapp.org/` entry (the store extension).
    - The **Site URL** stays `https://www.onextap.com`.
    - No `localhost` entries here: those belong to the dev project.
    - If `https://onextap.com/` serves the site itself instead of redirecting to `www`, add the same two paths for it.

## Step 3 · Vercel's environment variables

Set these in Vercel → the project → **Settings → Environment Variables**, for
the **Production** environment, before step 5. Values come from production's
backup; only names are written here.

**Server variables** (read by the API at run time; never give one a `VITE_`
prefix, which would publish it in the website's code):

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | the production project, `https://itqaozltgsyvjhlcllic.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | secret |
| `GROQ_API_KEY` | secret |
| `GEMINI_API_KEY` | secret |
| `DODO_PAYMENTS_API_KEY` | secret: the **live** key (step 4) |
| `DODO_PAYMENTS_WEBHOOK_KEY` | secret: the live webhook's signing secret (step 4) |
| `DODO_PAYMENTS_ENVIRONMENT` | `live_mode` |
| `DODO_PRODUCT_ID` | the live subscription product |
| `CRON_SECRET` | secret. Unset, the daily job ingest answers 503 |
| `RESEND_API_KEY` | secret. Unset, the feedback form fails |
| `CLIENT_URL` | `https://www.onextap.com` |
| `ALLOW_CACHE_SOURCE` | `false`, or unset |

Optional, unset means the code's default: the Adzuna job source
(`ADZUNA_APP_ID` and `ADZUNA_APP_KEY` together, `ADZUNA_COUNTRIES`),
`ATS_BOARDS`, `INGEST_SWEEP_PAGES`; model choices (`GEMINI_*_MODEL(S)`,
`GROQ_MODEL`, `GROQ_FALLBACK_MODEL`, `GROQ_MAX_TOKENS`, `GROQ_TIMEOUT_MS`,
`GROQ_MAX_RETRIES`); `GENERATE_LIMIT_PER_HOUR` (default 30); the `RANK_*`
tuning; `RESEND_FROM_EMAIL`, `FEEDBACK_TO_EMAIL`; tracing (`OPIK_API_KEY` and
friends; unset, tracing is off); `LOG_LEVEL`, `LOG_FORMAT`.

**Leave unset:** `VERCEL`, `NODE_ENV` and `PORT` (Vercel's own),
`ONEXTAP_SKIP_DOTENV`, and the test overrides `GROQ_BASE_URL`,
`RESEND_BASE_URL`, `DODO_PAYMENTS_BASE_URL`. The last one, set beside
`DODO_PAYMENTS_ENVIRONMENT`, makes payments fail.

**Website variables** (`VITE_*`, built into the public site; public by design):

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | the same project as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | the anon (publishable) key. **Never** the service-role key |
| `VITE_DASHBOARD_URL` | `https://www.onextap.com` |
| `VITE_API_URL` | unset or empty: the site calls its own `/api/` |
| `VITE_ANSWER_STUDIO_MODEL` | optional (default `llama-3.3-70b-versatile`) |
| `VITE_LOG_LEVEL` | optional |

Then:

1. **One project everywhere.** `VITE_SUPABASE_URL`, `SUPABASE_URL` and the extension zip must all name `itqaozltgsyvjhlcllic`. Compare the addresses, never the keys.
2. **Preview environment:** decide what it gets. Previews run the server with whatever is set there, so production's secrets in Preview mean previews act on real data and real payments.
3. Mark the secrets **Sensitive** if Vercel offers it.
4. A variable changed after a deploy reaches only the next one: set them now, or redeploy after.

## Step 4 · Dodo Payments, live

Production already takes live payments, so most of this should exist: confirm
each item and change only what is missing. Everything here is in Dodo's
**live** dashboard, not test mode.

- [ ] **Webhook endpoint** is `https://www.onextap.com/api/webhook`, subscribed to at least `subscription.active`, `subscription.renewed`, `subscription.on_hold`, `subscription.cancelled`, `subscription.failed` and `payment.failed`.
- [ ] **Its signing secret** is Vercel's `DODO_PAYMENTS_WEBHOOK_KEY`, copied with Dodo's copy button (it starts `whsec_`). A new endpoint has a new secret.
- [ ] **The live API key** is `DODO_PAYMENTS_API_KEY`, and `DODO_PRODUCT_ID` names the live subscription product.
- [ ] **The customer portal** is enabled on the live account (it was only checked in test mode). "Manage subscription" opens it.

After launch, from time to time: a duplicate subscription is cancelled
automatically, but its payment is refunded **by hand** in Dodo. The API log
names both subscriptions.

## Step 5 · Push to the live repository (the deploy)

Push this code to the live repository's production branch; Vercel builds it
and switches the live site over when the build is ready.

1. **Last look:** step 2 done (006 and 007 verified, the ledger committed and pushed to `latest`), step 3 set, step 4 confirmed.
2. **Baseline:** run the smoke script (step 7) against the live site. Expect 7 of 9: the old build fails `/privacy-policy` and the not-found check.
3. **Optional preview:** if Vercel builds previews and you are happy with Preview's variables, push the code to the live repository under its own branch name first (never the production branch) and run the smoke script against the preview's address. If previews are password-protected every check answers 401: skip it.

    ```
    git push live latest/merge/web-dashboard:refs/heads/release-1.0.4
    ```
4. **Deploy.** In the clone from step 1:

    ```
    git fetch latest
    git fetch live
    git merge-base --is-ancestor live/main latest/merge/web-dashboard && echo "fast-forward: ok"
    git push live latest/merge/web-dashboard:refs/heads/main
    ```

    Push only after `fast-forward: ok`, and check `git log -1 latest/merge/web-dashboard` shows step 2's ledger commit. If the push is refused as "non-fast-forward", someone changed the live branch: stop, never retry with `--force`, and go back to step 1, item 4.
5. **Watch the build** in Vercel → Deployments: the website build and the `api/index.js` function. When it is **Ready**, the new site is live; a failed build leaves the old one up.
6. If you pushed a preview branch in item 3, delete it: `git push live --delete release-1.0.4`.

## Step 6 · The auth emails

Sign-up and password emails come from "Onextap" with Onextap's design once
custom SMTP is on; Supabase won't let a project edit its email templates until
it is. Do this after step 5: the new privacy page is the one that names Resend
for these emails.

First look at production's Authentication → Sign In / Providers → Email →
**Confirm email**. If it is on and there is no custom SMTP yet, new users get
no confirmation email at all today (Supabase's own sender only reaches the
project team), so this step is a fix.

**A. The sender: custom SMTP through Resend**

1. Resend → **Domains** → **Add domain** → `onextap.com` (or a sending subdomain such as `mail.onextap.com`, the owner's call). Add the DNS records Resend lists (SPF and DKIM; DMARC too if the domain has none) at onextap.com's DNS host, and wait for **Verified**.
2. In that domain's Resend settings, turn **click tracking** and **open tracking** off: tracking rewrites links and breaks Supabase's sign-in links.
3. Resend → **API Keys** → **Create API key**: name `Supabase Auth (production)`, permission **Sending access**, domain onextap.com. Keep it apart from the feedback form's key, so either can be revoked alone. Copy it for the next step only.
4. Supabase → Authentication → Emails → **SMTP Settings** → **Enable custom SMTP**, then Save:

    | Field | Value |
    | --- | --- |
    | Sender email | `no-reply@onextap.com` (any address on the verified domain) |
    | Sender name | `Onextap` |
    | Host | `smtp.resend.com` |
    | Port | `465` |
    | Username | `resend` |
    | Password | the key from 3, typed in, never pasted anywhere else |
5. Authentication → **Rate Limits**: Supabase starts custom SMTP at 30 emails an hour. Set what sign-ups need, within Resend's plan (the free plan is 100 a day, shared with the feedback form).
6. Optional: move `RESEND_FROM_EMAIL` in Vercel to an address on onextap.com, so feedback mail stops coming from `onboarding@resend.dev`.

**B. The templates**

The files are in the repository's `supabase/templates/` (its `README.md` says
the same). Authentication → Emails → **Templates**: for each slot, type the
subject, switch the body to its HTML source view, paste the whole file from
`<!doctype html>` to `</html>`, and Save. The preview shows a dark ONEXTAP
band, an oat card and a citrine button.

| Slot | File | Subject |
| --- | --- | --- |
| Confirm sign up | `confirm-signup.html` | Confirm your email for Onextap |
| Reset password | `reset-password.html` | Set a new Onextap password |
| Magic link | `magic-link.html` | Your Onextap sign-in link |
| Change email address | `change-email.html` | Confirm your new email for Onextap |

Leave the other slots as Supabase wrote them: nothing on the site sends them.
Step 7 sends the first real one.

## Step 7 · Check the live site

The release is good when the smoke script passes 9 of 9 and each check by
hand below works. Every API response carries an `X-Request-Id`: quote it to
find the log line in Vercel.

1. **The smoke script** (GET requests only, no credentials, prints status codes only):

    ```
    node scripts/smoke-prod.mjs https://www.onextap.com
    ```

    Expected: nine `PASS` lines, then `9 checks: 9 passed, 0 failed`. If one fails:
    - `/api/health`: the API is not up. Read the function's logs in Vercel.
    - `/api/jobs/ingest` answering 503: `CRON_SECRET` is not set (step 3).
    - `/privacy-policy` or the not-found check answering 200: the old build still answers. Check Domains, and that the deployment was promoted.
2. **The old credit-minting route is gone:**

    ```
    curl -i -X POST https://www.onextap.com/api/credits/refund
    ```

    (In Windows PowerShell 5.1 type `curl.exe`.) Expected `404`. A `401` means the old server is still answering. The request has no token, so it cannot mint anything either way.
3. **By hand, in a browser, with your own account:**
    - [ ] Sign in at `https://www.onextap.com`: `/dashboard/` greets you and shows your credits.
    - [ ] Generate one answer in Answer Studio: an answer comes back and the balance drops by one (Premium: no change). "AI writing is unavailable right now" means charging failed: search the logs for `generation charging is not set up` (007 missing, step 2). If 007 verified fine, run `notify pgrst, 'reload schema';` in the SQL Editor and try again.
    - [ ] The logs show no `generation limit unavailable` warning (that would mean 006 is missing).
    - [ ] Sign out, then sign in with Google: you land on `/dashboard/` signed in. Landing on the home page first is the fallback for a missing Redirect URL, not a failure; a Supabase error about the provider means Google sign-in is not enabled on production.
    - [ ] **Manage subscription** opens; for a paying account, Dodo's portal opens.
    - [ ] With the store extension (1.0.2) installed, save a profile: the dashboard says the extension is out of date, with a link to the store. That is expected until 1.0.4 is out.
    - [ ] Sign out, **Forgot password?** with your own address: the email comes from "Onextap", has the subject and design from step 6, its button points at a `supabase.co` address (not a tracking redirect), and it opens `/reset-password/`. Check spam too: a new sending domain can land there at first.
4. **The first live webhook:** at the next subscription event, Dodo's live delivery log shows a 2xx for `/api/webhook`. A 400 is the signing secret, a 404 the endpoint's address; a 500 makes Dodo retry, and the function's log says why.
5. **The next morning**, after 06:00 UTC: Vercel's cron log shows `/api/jobs/ingest` ran and answered 200.

## If something breaks: rollback

Roll the website and API back in Vercel and leave everything else as it is;
the old site works with both migrations and both extensions.

1. **Vercel → Deployments** → the deployment that was live before → **Instant Rollback**. It takes seconds and builds nothing. Vercel may then hold back automatic promotion of new pushes until one is promoted again: read the project's banner.
2. **Leave the migrations, Redirect URLs and Dodo alone.** 006 and 007 only add tables and functions the old server never reads.
3. **What a rollback brings back** until the next deploy: the old `POST /api/credits/refund` route that mints credits, and the old charging (the page pays after generating). Free improvements and re-runs granted by the new server pause and work again after the next deploy (they last 30 days).
4. **Open tabs are safe either way:** an old dashboard tab calling the new server is charged once, not twice.
5. **The extension needs nothing:** 1.0.2 and 1.0.4 both work with the old site.
6. Fix the cause on `merge/web-dashboard`, run the full test gate again, and come back to step 5. Never roll back by force-pushing the live branch: Vercel's rollback is the way back, and the next push is a normal fast-forward.

## Step 8 · Google's sign-in screen

Google shows "Onextap" and its logo on the sign-in screen only after it
verifies the brand; until then it shows production's
`itqaozltgsyvjhlcllic.supabase.co` address
([Google Cloud Help](https://support.google.com/cloud/answer/15549049),
[Supabase's Google guide](https://supabase.com/docs/guides/auth/social-login/auth-google)).
Start once step 7 passes. Nothing here changes the code.

1. **Home page ready.** Google checks the app name against the home page. The new site's tab title is "Onextap" and its header says Onextap, so this is ready once step 5 is live.
2. **Find the client.** Production Supabase → Authentication → Sign In / Providers → **Google**: note the **Client ID** (not a secret; leave the secret where it is). In the Google Cloud Console, open the project whose **Clients** list has that ID.
3. **Branding:** Google Auth Platform → **Branding** (older consoles: APIs & Services → OAuth consent screen):

    | Field | Value |
    | --- | --- |
    | App name | `Onextap` |
    | User support email | the address users should write to |
    | App logo | `docs/brand/google-consent-logo-120.png` from the repository (120 × 120 PNG) |
    | Home page | `https://www.onextap.com` |
    | Privacy policy | `https://www.onextap.com/privacy/` |
    | Terms of service | empty (the site has none) |
    | Authorized domains | `onextap.com` |
    | Developer contact | where Google should write about the verification |

    Save. Changing the name or the logo after verification means verifying again.
4. **Data Access:** only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`, which is all Supabase asks for. Add nothing else.
5. **Audience:** the publishing status should be **In production**. If it says **Testing**, only listed test users can sign in: ask the owner before publishing it.
6. **Search Console:** verify ownership of `onextap.com` (a DNS TXT record), signed in with a Google account that is Owner or Editor on the Cloud project.
7. **Verify:** Google Auth Platform → **Verification Center** → **Verify branding** (or **Submit for verification**). Google's automated check usually takes minutes; a review by a person usually 2 to 3 business days ([Google's brand verification page](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)). When it passes, publish the branding from the same page: a pass is valid for 7 days.
8. **Check:** in a private window, `https://www.onextap.com` → Sign in → **Continue with Google**. Before: "to continue to …supabase.co". After: Onextap's name and logo. Write down exactly what the account chooser says.
9. **If Google rejects it** because the app name doesn't match the home page: Supabase users report this, since the unverified screen shows the supabase.co address as the name. Recheck item 1, then reply or appeal from the Verification Center, or open a Google Cloud support case.
10. **Optional, not planned: a Supabase custom domain** such as `auth.onextap.com` (a paid add-on; the owner's call). Google's screens would then show onextap.com. It changes the website's Supabase address and needs an extension permission change, so it is a separate release, not part of this one.

## Step 9 · Chrome Web Store: build and submit 1.0.4

Build the release zip on your machine with one command, then upload it to the
existing Onextap item and submit it for review, after the website is live.
Its permissions are the same as 1.0.2's minus the `localhost` entries, so
users see no new permission warning.

**A. Build the zip**

`npm run build:release` checks the settings, builds, scans for secrets, checks
the manifest, and zips: if any check fails it stops and zips nothing. It never
prints a key.

1. **What you need:** Node.js 22 or newer; the repository on `merge/web-dashboard` at checkpoint 16 or later (the commit you deploy in step 5); and `tar` that can write zip files. Windows 10 and later and macOS have it built in; on Linux install `bsdtar` (the `libarchive-tools` package).

    ```
    git fetch latest
    git checkout merge/web-dashboard
    git merge --ff-only latest/merge/web-dashboard
    npm ci
    ```
2. **Production's four settings**, from the owner's backup, in a new file named `.env.production.local` at the repository's root. Git ignores it, and a release build reads it over any `.env` you have for development:

    | Name | Value |
    | --- | --- |
    | `VITE_SUPABASE_URL` | `https://itqaozltgsyvjhlcllic.supabase.co` |
    | `VITE_SUPABASE_ANON_KEY` | production's anon (publishable) key. **Never** the service-role key |
    | `VITE_DASHBOARD_URL` | `https://www.onextap.com` |
    | `VITE_API_URL` | `https://www.onextap.com` |

    Nothing else goes in it: server keys never belong in a `VITE_` name, and the build refuses one that looks like a secret. Also make sure no `ONEXTAP_E2E_APPLICATION_TYPES` is set in your shell (a test switch the release build refuses).
3. **Build:**

    ```
    npm run build:release
    ```

    It prints `Step 1/5` to `Step 5/5`, each with `pass` or `FAIL` lines, and ends with the zip, `release/onextap-1.0.4.zip`, and a line `SHA-256  <64 hex characters>`. Copy that SHA-256 into item 1 of part B below.
    - **Step 1 fails:** a setting is missing or not production's. The line names which one and the rule it broke.
    - **"Confirm it is itqaozltgsyvjhlcllic's"** in step 1 is not a failure: a publishable key doesn't name its project. Check by hand that it is the key on production's Supabase → Settings → API Keys.
    - **Step 3 or 4 fails:** stop and tell the owner. It means the build carries something it must not, or a permission changed.
4. **Look at the zip's manifest:**

    ```
    tar -xOf release/onextap-1.0.4.zip manifest.json
    ```

    It says `"version": "1.0.4"`, and no address in it contains `localhost`.
5. **Optional:** unzip it into an empty folder, load that folder in a spare Chrome profile (`chrome://extensions` → **Developer mode** → **Load unpacked**), and open the popup to see it start. Don't sign in or sync there.
6. **Delete `.env.production.local`** right after. While it exists, every build on your machine uses production's settings.

**B. Submit it**

1. **Keep the SHA-256** that part A printed, here:

    ```
    SHA-256: ________________________________________________________________
    ```

    Just before uploading, check it is still the same file:

    ```
    Get-FileHash -Algorithm SHA256 release\onextap-1.0.4.zip
    ```

    (macOS or Linux: `shasum -a 256 release/onextap-1.0.4.zip`.) A different hash is a different zip: build it again with part A.
2. **Upload:** developer dashboard → the Onextap item (`fpleipjggoiolomkcnchnlelbjcnoklj`) → **Package** → upload the zip. Its version, 1.0.4, is above the store's 1.0.2.
3. **Permissions, unchanged:** `storage`, `activeTab`, `scripting`, `identity`; host permissions `https://*.supabase.co/*`, `https://www.onextap.com/*`, `https://onextap.com/*`; `externally_connectable` for the two onextap.com addresses. Leave the privacy-practices justifications as they are.
4. **Privacy policy URL:** `https://www.onextap.com/privacy/` (the old `/privacy-policy` redirects there). Data use is unchanged: 1.0.4 sends nothing anywhere new.
5. **What's new**, for the top of the description or the site:

    > **What's new in 1.0.4**
    >
    > - **Customize a cover letter from the job page.** Open Onextap on an application page and a "Customize cover letter" button appears in the corner of the cover-letter field. It opens your dashboard with the company, the role and the job description filled in. Fill the finished letter in from the popup's Cover tab.
    > - **Dashboard edits reach the extension.** Profiles you save on the dashboard now update the extension, also after you have opened the popup.
    > - **Cover-letter templates are managed on the dashboard.** The popup shows them read-only, with a link to manage them there.
    > - **Deleting your account clears the extension too.** Deleting your Onextap account now also removes the extension's saved data in this browser.
    > - **A new icon:** the Onextap ring.
6. **Submit for review.** If the dialog lets you hold the release until you publish it yourself, choose that, so it goes out when you decide.
7. **Staged rollout,** if offered: start with a small percentage, watch reviews and support mail for a few days, then widen. If not offered, publish to everyone.
8. **When it is out:** update your own install (`chrome://extensions` → **Update**). Save a profile on the dashboard: it says "Saved and synced to the extension". On a real job posting, the button fills the dashboard.

## Step 10 · Close out

Tell the owner what went live and when, so the project's records can say so.

- [ ] The deploy: the date, the deployed commit, the smoke script's result, the checks by hand, and anything that failed.
- [ ] The ledger commit from step 2 is in `main` (`git log origin/main` shows it).
- [ ] When 1.0.4 is published: the date.
- [ ] When Google's brand verification passes: the date, and what the account chooser now says.

**Which website works with which extension.** Every pairing works, so the
site and the store release can go out in either order:

| | Extension 1.0.2 (the store today) | Extension 1.0.4 |
| --- | --- | --- |
| **Old site** (live today) | Today's behaviour | Works; the job-page button opens the dashboard without the job filled in, and deleting an account doesn't clear the extension |
| **New site** (this release) | Works, and says so honestly: after a save the dashboard says the extension is out of date, with a store link; resumes are read through the API; no job-page button | Everything: "Saved and synced", the job-page button, clearing the extension when an account is deleted |

Chrome updates installs over hours to days after 1.0.4 is published, so the
new site will meet both versions side by side for a while; it checks each
browser's extension on every call.
