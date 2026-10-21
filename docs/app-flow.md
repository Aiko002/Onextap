# Onextap — Application Flows

Every user-facing path through the product, traced to the code that runs it.
Rewritten on 2026-10-03 for the website (landing page and dashboard under
`web/`); brought up to date on 2026-10-20 for extension 1.0.4 and
server-side charging (completion plan, batches B1 to B5).

**Checked against real services** on 2026-10-20 (the completion plan's B4
checks, run in B5): the dev Supabase project, Dodo in test mode, real Groq
and Gemini, extension 1.0.4 loaded unpacked, and store 1.0.2 in another
Chrome profile. That run covered sign-up and sign-in, profile sync, resume
parsing, Answer Studio, cover letters and the job-page button, Explain my
fit and ranking, the hourly ceiling, billing (checkout, a double checkout,
cancellation) and account deletion; the sections say what it found, and
mark what it did not reach ("Not checked on real services"). Autofill
itself, the password reset and the feedback form were not part of it. The
rest of the time the paths are exercised against stubs (`npm test`, the e2e
suites).

**Related:** [`repo-structure.md`](repo-structure.md) ·
[`extension-protocol.md`](extension-protocol.md) ·
[`../HANDOVER.md`](../HANDOVER.md) · [`../README.md`](../README.md) ·
[`backend-schema.md`](backend-schema.md) ·
[`google-sign-in-setup.md`](google-sign-in-setup.md)

---

## 0. Entry points

One origin serves the site and the API (`vercel.json`):

| Path | What | Code |
|---|---|---|
| `/` | Landing page | `web/index.html`, `web/src/main.js` |
| `/about/` `/contact/` `/privacy/` | Its company pages | `web/src/pages/` |
| `/reset-password/` | Where the password-reset email's link opens | `web/reset-password/`, `web/src/pages/reset-password/` |
| `/dashboard/` | Dashboard | `web/dashboard/index.html`, `web/dashboard/js/main.js` |
| `/dashboard/contact/` `/dashboard/privacy/` | The dashboard's company pages | `web/dashboard/site/` |
| `/api/*` | Express app | `api/index.js` → `server/index.js` → `server/app.js` (middleware order), `server/routes/` |
| `/privacy-policy`, `/privacy-policy.html` | 308 → `/privacy/` | `vercel.json` |

The extension has three: the popup (`index.html` → `src/popup.jsx` → `App` in
`OnextapDashboard.jsx` → `PopupView`), the service worker
(`extension/background.js`, every message routed by
`extension/messages/registry.js`), and the content script
(`public/content.js`, injected on demand into the active tab's top frame:
when the popup opens over an http(s) page, on Autofill, and on Fill). Opened
outside the extension, or with the old `?mode=dashboard`, the popup's page
redirects to the web dashboard. The messages between them and the website
are in [`extension-protocol.md`](extension-protocol.md).

**Arriving at the landing page** (`web/index.html`, a script in `<head>`,
before anything paints): `?extensionId=`, `?view=`, `?payment=`, `?code=` or
`#access_token=` is forwarded to `/dashboard/` with the rest of the address.
That covers the published extension (it opens the site root), a checkout
started before the dashboard moved, and a Supabase redirect to the site root.
A password-reset link (`#…type=recovery`) that lands on the root goes to
`/reset-password/` instead, and the dashboard sends one on there too, before
its Supabase client can take it as a plain sign-in. `?login=1` or `?signup`,
with `?next=/dashboard/…`, opens the sign-in window, and `?reset=1` opens it
on the reset request (`openOnArrival` in `web/src/app/wire.js`); `next` may
only point inside `/dashboard/`.

**Arriving at the dashboard** (`web/dashboard/js/main.js`):

| Parameter | Effect |
|---|---|
| `?extensionId=<id>` | Which extension to talk to, on `localhost` and `127.0.0.1` only (an unpacked build's); elsewhere always the published extension's ID (`resolveExtensionId()` in `src/extensionClient.js`) |
| `?view=vault\|cover\|jobs\|profiles` | Opens that workspace (`legacyViews` in `js/config.js`) |
| `?handoff=<id>` | A job from the extension's job-page button (§6.1): kept in the tab's `sessionStorage` before the sign-in check, and opens the Cover Letter workspace |
| `?upgrade=1` | Opens the plan panel |
| `?payment=success\|cancelled` | Back from checkout (§8) |
| `#/` · `#/<workspace>` | Home · `job-matches`, `my-profiles`, `answer-studio`, `cover-letter` |

The one-shot parameters are removed from the address once read.

---

## 1. First run (popup)

```text
Install from Chrome Web Store
        │
        ▼
Click the toolbar icon ──► PopupView, checking = true
        │
        ├─ loadProfileStore()          (migrates legacy user_profile if present)
        ├─ getActiveLegacyProfile()
        └─ hasProfile = firstName || email || vault.length
                │
        ┌───────┴────────┐
        │                │
     false            true
        │                │
        ▼                ▼
 "Open Dashboard"   Full popup (tabs, autofill)
   empty state
        │
        ▼
 chrome.tabs.create(<site>/dashboard/?extensionId=<runtime.id>)
```

The popup deliberately refuses to be a profile editor. With no profile it
shows one route out: the web dashboard, told which extension it belongs to.
"Open Answer Studio" and Job Matches add `?view=vault` / `?view=jobs`.

---

## 2. Sign-up and sign-in

**On the website**, the sign-in window (`web/src/features/login/login.js`) is
on every page of the landing site, behind the header's Log in. What it does
is `signInAttempt` in `web/src/app/backend.js`, which loads `@app/auth.js`
(and so Supabase's SDK) on the first attempt:

```text
Sign-in window
        │
        ├─ Email + password
        │   ├─ checked first: an email, and on sign-up 8+ characters with
        │   │  upper and lower case and a number (features/login/password-rule.js)
        │   ├─ sign in:  supabase.auth.signInWithPassword
        │   │      └─ "Signed in as <email>."  ── Continue ──► /dashboard/ (or ?next)
        │   └─ sign up (+ an optional name → user_metadata.full_name):
        │          supabase.auth.signUp
        │          ├─ session back   ──► "Account created for <email>." ── Continue ──► dashboard
        │          └─ no session     ──► "Check your email." (Continue just closes)
        │
        ├─ Forgot password? ──► the email alone ──► supabase.auth.resetPasswordForEmail,
        │                        redirectTo = <site>/reset-password/
        │      └─ "Check your email." — the same words whether or not the address
        │         has an account; too soon after the last → "Wait a minute…"
        │
        └─ Google ──► supabase.auth.signInWithOAuth, redirectTo = <site> + (?next, else /dashboard/)
                      (off the redirect allowlist, Supabase falls back to the
                       site root, and the forwarding script passes it on)
```

**Google** works only once the Supabase project has the provider switched on
with a Google OAuth client ([`google-sign-in-setup.md`](google-sign-in-setup.md));
until then Supabase answers "Unsupported provider: provider is not enabled",
which is how the dev project first answered on 2026-10-20. Set up, it landed
on `/dashboard/` signed in. Google's account chooser names the Supabase
project's domain, not Onextap, until the consent screen is brand-verified
(the completion plan's B6-0). A dev project's Redirect URLs need
`http://localhost:5173/**`: the address sign-in returns to can carry a query
string (§6.1).

**The reset page** (`/reset-password/`) reads its address before Supabase's
client loads: the email's link carries the recovery session in the hash
(`#access_token=…&type=recovery`, the implicit flow), which the client then
takes, signing the page in. The page asks for the new password, held to the
sign-up rule, and `supabase.auth.updateUser({ password })` sets it: "Password
set." and on to the dashboard. Opened without a link, with one Supabase
refused (`#error=…`, e.g. expired), or with one whose session did not take,
it says so and offers a new link (`/?reset=1`).

Refusals are put in plain words (`WORDS` in `backend.js`): a wrong password,
an unconfirmed email, an existing account, a rate limit, a weak password, no
network. The session lands in `localStorage` (`sb-<project ref>-auth-token`),
which the landing page and the dashboard share, being one origin. Signed in,
the header's Log in reads Dashboard (`wireHeader`), and Get started free /
Upgrade to Premium go straight to the dashboard (`wireOffers`).

**The dashboard** checks the session before anything else
(`services.getSession`). None: it drops whatever session is stored, locally,
and sends the reader to `/?login=1&next=<where they were>`, so the two pages
can never bounce a dead session between them. Then `GET /api/me` reads the
account; a 401 there is the same trip to sign in, and an unreachable server
leaves a session-only view with a toast saying credits and plan may be out of
date.

**In the popup**, the session would live in `chrome.storage.local` (the
adapter in `src/supabaseClient.js`), but **nothing in the popup signs in**
(completion plan D5): signing in on the website leaves the extension signed
out, and the popup never spends credits. Its Answers and Cover tabs are
read-only and send people to the dashboard to write (§5, §6).
`src/auth.js` keeps an extension Google flow
(`chrome.identity.launchWebAuthFlow`, needing
`https://<extension-id>.chromiumapp.org/` on Supabase's allowlist) that no
screen calls; its last caller was the old in-extension dashboard.

**On the database side**, `on_auth_user_created` inserts a `profiles` row
with 3 credits and an `initial` credit transaction (seen on every sign-up in
the real run). If that trigger is missing, `getProfile()` backfills the row
on the first API call.

**First run of the dashboard:** the guided tour shows only on the home view,
and only to accounts created in the last 2 minutes; everyone else gets
`onextap_tutorial_seen` set so it never appears.

---

## 3. Building a profile (My Profiles)

### 3.1 By hand

```text
Dashboard ──► My Profiles ──► edit fields ──► Save
                                                │
                                    saveLegacyUserProfile(profile)   (this browser)
                                                │
                                    getExtensionInfo(): ONEXTAP_HELLO
                                                │
         ┌───────────────────┬──────────────────┴───┬────────────────────┐
      current              current                legacy (1.0.2)       absent
      confirmed            not confirmed          sync sent anyway     nothing sent
         │                    │                      │                    │
 "Saved and synced     "Saved here — the      "Saved — the extension  "Saved on this
  to the extension"     extension didn't       is out of date:         device"
                        confirm the sync"      update it" (store link)
```

`current` and `legacy` both get `ONEXTAP_SYNC_DATA`; only a `current`
extension with `profile-sync` that confirmed it counts as synced, because
1.0.2 says success to every sync. A failed sync is reported, never fatal:
the local save already happened.

**Which extension.** The page can reach one only from an origin in its
`externally_connectable` (`https://www.onextap.com`, `https://onextap.com`,
and `http://localhost:5173` in dev builds and store 1.0.2; the 1.0.4 release
manifest drops it), by ID. In production that is always the published
extension's. On localhost an unpacked build is reached only through
`?extensionId=`, which the popup's "Open Dashboard" adds: a tab opened another way (the confirmation email's link, in the real
run) messages the store's ID, finds nothing, and says "Saved on this
device"; reopened from the popup, the same save said "Saved and synced to
the extension" and the popup showed the edit.

**In the extension** (1.0.4: `extension/messages/syncData.js`,
`extension/profileSync.js`), the payload is filed into the profile store the
popup reads (`onextap_profiles`): matched by id, then by name, else added
under the dashboard's id; it becomes the active profile, and the
`user_profile` mirror is rebuilt from it. The extension's other profiles are
left alone. Store 1.0.2 writes `user_profile` only, which its popup reads
until it has made its own store on its first open, and ignores after.

### 3.2 From a resume

```text
Choose or drop a file (PDF or image, size-capped)
    │
    ├─ type and size checked; hashed (a re-upload of the same bytes is found in the library)
    ├─ getAccessToken()  ──► none → "Not authenticated. Please sign in first."
    ├─ GET /api/me       ──► rejected → "Session token rejected… sign out and sign in again."
    │
    └─ POST /api/parse-resume, always (the website no longer sends PARSE_RESUME)
                                        │
                                 Gemini (primary → fallback model)
                                        │
                                 { data: <structured>, text }
    │
    ▼
mergeParsedResumeIntoProfile (src/resumeToProfile.js): over the form, never replacing
    │
    └─ saveParsedResume ──► the resume library (onextap_resumes), for Job Matches
                            and the popup; a full library never costs the merge
"Resume read — review the fields, then save."
```

The pre-flight to `/api/me` is there so an expired token fails in a second
rather than after a long upload. The upload never goes through the extension,
so 1.0.2 installed changes nothing (the real run parsed a resume through the
API in about 16 s with 1.0.2 present).

### 3.3 Switching profiles

On the dashboard, the profile switcher (`web/dashboard/js/ui/switchers.js`)
creates, renames, deletes and switches; in the popup, `ProfileSwitcher`.
Every mutation writes the store *and* re-mirrors the active profile into
`user_profile`.

Guards: unique trimmed names (case-insensitive, ≤32 characters); `Default`
and the last remaining profile cannot be deleted; deleting the active profile
falls back to `Default`.

---

## 4. Autofill — the core flow (popup)

```text
User opens an application form, clicks the Onextap icon
        │
        ▼
PopupView mounts
        ├─ getApplicationType()
        ├─ loadProfileStore() + refreshProfileState()
        └─ detectSectionsOnPage()
                ├─ chrome.scripting.executeScript({ files: ['content.js'] })
                └─ DETECT_SECTIONS ──► { personalInfo, education,
                                          workExperience, openEnded, coverLetter }
                        │
                        ▼
        "What to fill" shows toggles for detected sections only
        (coverLetter also requires ≥1 saved template)
        │
        ▼
Click "Autofill Application"
        ├─ getActiveLegacyProfile()  ──► null → "No Profile - Open Dashboard"
        ├─ inject content.js         ──► throws → "Error: Cannot access this page"
        │
        ▼
AUTOFILL_TRIGGERED { profile, sections }
        │
        ▼  public/content.js → autofill()
   buildIntents(profile)         ordered, specific before generic
        │
   for each input / textarea / select:
        skip: wrong input type · invisible · disabled · readonly · already filled
        sig = name + id + placeholder + aria-label + autocomplete + label text
        first matching intent wins
        SELECT → fillSelect (exact value → exact text → substring)
        else   → setNativeValue + dispatch input & change
        │
        ▼
   { success: true, filled: N }  ──►  "Filled N fields"  (resets after 2s)
        │
        └─ then the "Customize cover letter" button, if the page has a
           cover-letter field (§6.1)
```

**Ordering rules that make matching work:** `first name` before `full name`;
`phone number` before `phone`; `address line 1` before generic address;
`postal code` before `country`; `current company` / `employer name` before
bare `company`. Bare `name` is deliberately never an intent keyword — it
would hit company-name and school-name fields.

**Known gap (still true on 2026-10-20):** `sections` is sent but `autofill()`
ignores it. Toggling a section off changes the button label only; every
matching field is still filled.

| Refusal | Message |
|---|---|
| `chrome:`, `chrome-extension:`, `edge:`, `about:`, Web Store | "Cannot read this page" (scrape) / "Cannot access this page" (fill) |
| No active tab | "Error: No active tab" |
| No profile | "No Profile - Open Dashboard" |
| Every section toggled off | Button disabled, "Select at least one section to fill." |

---

## 5. Answer Studio (dashboard)

```text
Answer Studio (or the popup's "Open Answer Studio" ──► ?view=vault)
        │
        ├─ the active profile's saved answers (each with aiAllowanceId, aiImprovementsLeft)
        └─ GET /api/credits: balance + Premium flag
        │
        ▼
Question (+ optional draft), tone, optional company and pasted job description
        │
   ┌────┴──────────────────────────────────────────────────────────┐
   │ free here = Premium, or this answer's allowance has some left  │
   │ not free && credits ≤ 0 → "No credits remaining. Premium       │
   │   makes answers unlimited."  (no request is sent)              │
   └────┬──────────────────────────────────────────────────────────┘
        ▼
POST /api/answer-vault/generate { kind: 'answer', allowanceId?, question, draft,
     job context ≤6000 chars, profile context, saved answers, task and style
     hints, model, applicationType, resume corpus if any }
        │
        ├─ past the hourly ceiling → 429, nothing charged
        ├─ the spend, before the model (spend_generation(), migration 007), in order:
        │     the allowance named, if it has an improvement left → free
        │     Premium → free
        │     1 credit → a new allowance: 2 free improvements, for 30 days
        │     no credit → 403 "No credits remaining"; no migration 007 → 503
        ▼
   Groq primary → fallback; empty, too short or cut-off answers rejected
   ┌────┴────┐
 fail      success
   │          ├─ an Improve (a draft given, with a resume corpus) whose answer has
 the spend    │  more unbacked claims than the draft → asked once more, same request, free
 given back   ├─ the answer replaces the editor; fabrication flags shown (advisory)
 (undo_       └─ charge: { charged, premium, allowanceId, followUpsLeft, credits }
 generation)       → the balance and "Free improvements on this answer: N" shown,
                     the allowance id kept with the saved answer
```

**Credit rule:** one credit buys an answer plus two free improvements of it,
for 30 days (three until 2026-10-20, the owner's call); Premium never pays.
The rule line under the balance says so. The server decides every charge
(`server/lib/generationSpend.js`, `ANSWER_FREE_IMPROVEMENTS`); the page only
mirrors its count, and refuses early at a balance of 0. Each step of the
spend is one conditional statement in the database, so two presses holding
the last credit cannot both spend it: four concurrent spends against three
credits in the real run charged three and refused one, and the balance never
went below 0. A request without `kind` (an old client) is charged a credit
and granted nothing.

An answer's improvements belong to the answer: a saved answer keeps its
allowance (`aiAllowanceId`), and an unsaved one is kept with its question in
`sessionStorage` for the tab, so a reload brings both back (since 2026-10-20;
before, the reload lost the improvements). Saving it, "New answer", a new
question or another profile drops the unsaved one.

**Hourly ceiling:** the generate route refuses an account's drafts past
`GENERATE_LIMIT_PER_HOUR` (default 30, Premium included) with a 429 and when
to try again, before the spend and the model (`server/generateLimit.js`; it
fails open if its table is missing). Cover letters count against the same
ceiling. With the ceiling at 2 the real run got 200, 200, 429, 429, and the
refusals charged nothing.

The dashboard has no access to the job page: the description is pasted.

Saving de-duplicates against existing questions *and* answers
(case-insensitive) when adding; editing updates in place. Every save writes
the store and syncs to the extension. "New answer" clears the editor and
puts the cursor in the Question field.

---

## 6. Cover letters (dashboard, popup and the job page)

Written on the dashboard, filled from the popup:

```text
Templates: up to 10 per profile, typed, pasted or uploaded (.txt/.md), on the dashboard
        │
        ▼
Select a template ──► company, role, job description
        │   (pasted, or filled in by the job-page button: §6.1)
        │
        ├─ no template body / no description → says which; Personalise stays off
        ├─ cost (src/coverLetterCredits.js, mirrored for the hint):
        │     free if Premium, or a re-run: same template, same description
        │     (its first 6000 characters, case and spacing aside)
        │     otherwise 1 credit; at 0 → "No credits remaining. Premium makes
        │     cover letters unlimited." (no request is sent)
        ▼
POST /api/answer-vault/generate { kind: 'cover_letter', allowanceId? }
   question: "<label> for this application", draft: the template body,
   job context: "Organization: …\nRole: …\n\n<description>",
   taskHint: rewrite for this opportunity, keep the voice, name the company
   and role, weave in 2–4 requirements, ±10% of the original length
        │
        ├─ the server spends as for answers (§5), with the allowance keyed to
        │  the description it was sent (not the company or role lines): a
        │  charge grants 1 free re-run for that description, for 30 days
        ▼
Result beside the original
        ├─ the template keeps the server's allowance (aiAllowanceId; aiRerunsLeft
        │  and aiRerunKey mirror it for the hint)
        └─ Copy · Save version (company, role, description excerpt, body)
                    │
                    ▼  ONEXTAP_SYNC_DATA (coverLetters, with the profile)
Popup ▸ Cover ▸ Saved versions ─► Fill ─► FILL_COVER_LETTER into the open page
```

Beside the button, the next press's cost is spelled out: "This one is a free
re-run.", "Uses 1 credit, which includes one free re-run.", or no credits
left. Personalising stamps `lastUsed` on the template. In the real run: a
personalisation charged, the same description's re-run was free, another
description was charged again.

**The popup's Cover tab is read-only** (completion plan D6;
`src/components/shared/CoverLetterPanel.jsx`): the active profile's saved
versions, newest first, each with Open (the whole text), Copy and Fill, and
"Manage templates on the dashboard", which opens
`<site>/dashboard/?extensionId=<id>&view=cover`. No Upload, Add, Edit or
Delete, no personalising, no credits: the popup has no sign-in (§2).

### 6.1 The job-page button (extension 1.0.4)

```text
User on a job posting or application page opens the popup
        │
        ▼
PopupView: inject content.js ──► MOUNT_COVER_BUTTON (also after AUTOFILL_TRIGGERED)
        │
        ▼
content.js: a cover-letter field (by its keywords; not the Onextap site)?
        │   no → nothing
        ▼   yes
"Customize cover letter" inside the field's bottom-right corner
        │   click
        ▼
scrapePageContext() + scrapeRole() + the page's url ──► OPEN_COVER_CUSTOMIZER
        │
        ▼
Worker: job sanitised and capped, kept in chrome.storage.session for 30 minutes,
        dashboard opened next to the job tab:
        <site>/dashboard/?view=cover&handoff=<uuid>&extensionId=<runtime id>
        │
        ▼
Dashboard: handoff id → this tab's sessionStorage, before the sign-in check
        ├─ signed out → sign in (email or Google) → back to /dashboard/
        ▼
Cover Letter workspace, once the account is confirmed:
   ONEXTAP_HELLO says current + cover-handoff → GET_COVER_HANDOFF { id } (read once)
        ├─ job with a description → company, role, description filled:
        │     "Filled from the job page: check it before personalising"
        ├─ job with no description (an application form with no ad on it)
        │     → company and role filled: "…which has no job description on
        │       it. Paste the description below to personalise."
        ├─ expired or already read → "The job page's details have expired…"
        └─ no extension that can answer → "The extension couldn't be reached
              for the job page's details. Paste the description below instead."
        │
        ▼
Personalise (the user's click, §6) ─► Save version ─► popup ▸ Cover ▸ Fill
```

**What the page gives.** Both scrapers (`scrapeJobPage()` in the worker and
`scrapePageContext()` in `content.js`) take the longest description
candidate that is not an application control and holds none
(`SELECTORS.formControls`: a textarea or a file input; a search box or a
filter doesn't count), and fall back to the page's text only on a page with
no such control; an application form with no job ad outside it gives an
empty description. Capped at 8,000
characters.

**In the real run** (dev project, 1.0.4 unpacked, 2026-10-20):

- Greenhouse, a posting on `job-boards.greenhouse.io`: the button sat in the
  cover-letter field's corner; the dashboard opened filled in; a saved
  version came back to the popup and Fill put it in the field.
- Lever, an `/apply` page: the button and the company and role were right,
  but the description was the whole page (a cookie notice, the form's
  questions). Greenhouse's description also carried the form's questions
  (its `<main>`, holding the form, outran the description). Both are what
  the form-controls rule above fixes; it came after the run and is covered
  by unit tests and `web/tests/cover-handoff.spec.js` (a form-only apply
  page), not re-run on the real boards.
- MyGreenhouse (`my.greenhouse.io`, the job seekers' portal): no button,
  most likely because its form is not in the tab's top frame, where
  `content.js` is injected only: `activeTab` reaches the tab's own origin,
  and an embedded form would need host permissions for the board, which the
  extension does not ask for (an escalation). An open question for the
  owner.
- Signed out: the job survived an email sign-in and the dashboard filled
  in.

*Not checked on real services:* Ashby, Workday and LinkedIn; the handoff
through Google sign-in (Google was off on the dev project at the time; the
id waits in the tab's `sessionStorage`, which Google's redirect back to the
same tab keeps). A cover-letter field inside a modal `<dialog>`, a popover
or an iframe gets no button (`docs/extension-protocol.md`, "The button's
known limits").

---

## 7. Job Matches (dashboard)

```text
Pick a resume from the library (or upload one, as in §3.2)
        │
        ▼
Filters: a DRAFT, applied with Apply / Enter (a rank costs LLM calls)
        │
        ▼
POST /api/jobs/rank  (the shared pool; prefilter → LLM batches → gate → up to 2 reformulations)
        │   hourly limit per account; results cached server-side
        ▼
Ranked cards: score band, evidence, matched and missing skills; "Low detail" for
snippet-only postings; every degraded state says so (keyword-only scoring, partly
AI-scored, filters broadened, the hourly limit, a thin pool)
        │
        ├─ Sort: re-orders what is in hand, no re-rank
        ├─ Refresh: the one way to ask the same question again
        └─ Explain my fit ──► POST /api/jobs/explain
                 the server spends a credit before the analysis (kind
                 'explain': a "Job fit analysis" credit row and a receipt row
                 with no follow-ups; Premium free; 403 at 0, 503 without
                 migration 007), refunds it once if the analysis fails;
                 reopening an explained job is free
```

The last result is kept in memory, keyed by the resume and the applied
filters, so leaving the page and coming back does not re-rank (a reload
does). Only the parsed fields the ranker needs, and for Explain the resume
corpus, leave the device, as request bodies.

**Rank budget.** A rank sends jobs to Gemini in batches of up to 30
(`RANK_BATCH_SIZE`), each reply capped at `RANK_MAX_TOKENS` (6,500 since
2026-10-20; the owner's profile needed ~5,200 for 30 jobs, and 5,000 cut
it off). With a richer profile a reply can still run out before its last jobs: the
parser keeps every entry the reply finished (`server/llmJson.js`; before
2026-10-20 a cut-off reply lost all 30) and the rest are keyword-scored,
which the cards say ("partly AI-scored"). A clean result is cached for 6 hours, a mostly scored one
for 30 minutes, a keyword-only one not at all. Real-run timings: 8 to 23 s a
rank, about 0.4 s from the cache; one "Explain my fit" took 6 s.

---

## 8. Upgrade, cancellation and billing (the plan panel)

```text
Upgrade (landing pricing, the dashboard's plan panel, ?upgrade=1)
        │
        ▼
POST /api/create-checkout-session (metadata.supabaseUserId)
        ├─ already active at Dodo → 400 "You already have an active Premium subscription."
        ▼
Dodo hosted checkout ──► return to <CLIENT_URL>/dashboard/?payment=success
        │
        ├── in parallel ──► Dodo webhook ──► POST /api/webhook
        │                        signature verified over the raw body
        │                        account resolved: metadata → dodo_customer_id → email
        │                        subscription.active → is_premium = true
        ▼
Dashboard sees ?payment=success
        ├─ "Payment received! Activating your Premium subscription…"
        └─ GET /api/verify-premium every 8 s, up to 15 times (2 minutes)
                ├─ Pro → "Premium activated! You now have unlimited AI credits."
                └─ timeout → "Premium may take a moment to activate — refresh shortly."

?payment=cancelled → "Payment cancelled."
```

The panel (`web/dashboard/js/subscription.js`) has four states: Standard;
Pro renewing (with the date); Pro ending (with its end date and "Keep Pro");
Pro without dates (Dodo could not be reached).

| Action | Route | Effect |
|---|---|---|
| Switch to Standard, subscription active | `POST /api/cancel-subscription` | Cancelled **at the end of the period** (`cancel_at_next_billing_date`). Premium stays on until Dodo's `subscription.cancelled` arrives |
| Switch to Standard, on hold / pending / past due | same | Cancelled at once, as before |
| Keep Pro | `POST /api/resume-subscription` | Withdraws the scheduled cancellation |
| Billing & invoices | `POST /api/create-portal-session` | Dodo's portal, in a new tab (opened on the click, so no pop-up block) |

| Webhook event | Effect on `profiles` |
|---|---|
| `subscription.active` | Linked (below): `is_premium = true`, subscription and customer ids, `status = active`, `premium_since = now()` |
| `subscription.renewed` | `is_premium = true`, `status = active` |
| `subscription.on_hold` | `status = on_hold`, `payment_failed = true`, `last_failed_payment = now()` |
| `subscription.cancelled` | `is_premium = false`, `status = cancelled`, `cancelled_at = now()` |
| `subscription.failed` | `is_premium = false`, `status = failed` |
| `payment.failed` | `payment_failed = true`, `last_failed_payment = now()` |

**One account, one subscription** (`server/subscriptionGuard.js`). Checkout
refuses an account already Pro, but two checkouts can both be paid before the
first webhook lands (two tabs, a double click). `subscription.active` links
with one conditional write and decides:

| The account's linked subscription | `subscription.active` for a new one |
|---|---|
| none, or one that has ended | linked; Pro on |
| the same one again (a redelivery or a resend) | Dodo asked first: still in force, linked again (the first `premium_since` kept); ended, nothing written; Dodo unreachable, linked again |
| one in force (`active`, `trialing`) | a duplicate: cancelled at Dodo at once, a warning naming both ids ("refund its payment in Dodo": refunds stay manual), Pro stays on |
| one stalled (`on_hold`, `paused`, `past_due`, `pending`) | linked, and the stalled one cancelled |
| one Dodo cannot be asked about | linked |

Every other event about a subscription that is not the linked one is
ignored and logged, so a duplicate's `subscription.cancelled` cannot switch
Pro off. A `subscription.active` the server could not finish answers 500, and
Dodo delivers it again. In the real run: two paid checkouts linked the first
and cancelled the second with both ids logged, and its later events were
ignored as foreign; a resent `subscription.active` for the linked
subscription changed nothing; Switch to Standard showed the pending end; an
immediate cancel in Dodo's dashboard turned Premium off through
`subscription.cancelled`.

Unresolvable users, and accounts already deleted, are logged and skipped;
the webhook still answers `{ received: true }` so Dodo does not retry
forever. Once per visit, as the dashboard boots, `verify-premium` re-checks
Premium against Dodo, and a Premium whose subscription can no longer bill
(cancelled, failed, expired) comes back to a real balance. On hold or past
due, Dodo is still retrying the payment, and Premium stays on, as the
webhook leaves it (since 2026-10-20).

---

## 9. Account settings (dashboard)

The settings menu (`web/dashboard/js/settings.js`, actions in `main.js`):

- **Change avatar** — an image of up to 5 MB, kept on this device
  (`onextap_avatar_<user id>`). Without one: the Google photo, else initials.
- **Manage subscription** — the plan panel (§8).
- **Log out** — `signOut`, then removes `user_profile` and `onextap_profiles`
  from this browser (resumes and the avatar stay), and goes to `/`. The
  extension's copy is left alone.
- **Delete account** — type `DELETE`, then `DELETE /api/account`: every
  subscription of the account's own that can still bill is cancelled at Dodo
  first (the deletion stops if Dodo cannot confirm), then the Supabase auth
  user is deleted, and `profiles`, `credit_transactions`,
  `generation_allowances`, `rank_cache`, `rank_rate_limit` and
  `generation_rate_limit` go with it by cascade. Only then does the browser
  side run (`deleteAccount()` in `web/dashboard/js/services.js`):

  ```text
  DELETE /api/account succeeded
          │
          ├─ the extension here is current with wipe-local (1.0.4)
          │     → ONEXTAP_WIPE_LOCAL: every key in src/localKeys.js removed
          │       from chrome.storage.local (the popup is back at Welcome)
          │     → no confirmation within 5 s: an error toast says the account
          │       is deleted but the extension kept its copy
          ├─ legacy (1.0.2), or current without wipe-local → not asked
          └─ absent → not asked
          │
          ▼
  this browser's localStorage cleared ─► signed out ─► /
  ```

  The dialog says which before you confirm: "The Onextap extension in this
  browser is cleared too" (1.0.4); "…a version that can't be cleared from
  here: its copy stays until you remove the extension" (1.0.2); with none
  found, an extension used elsewhere keeps its copy until removed there.
  Copies in other browsers always stay. In the real run, with 1.0.2 the
  dialog showed its "can't be cleared" line, with 1.0.4 the popup was back
  at Welcome afterwards, and every row of both accounts was gone.

---

## 10. Application types

`src/applicationTypes.js` knows job, college, scholarship and internship, but
**only Job is listed**: `LISTED_TYPE_IDS` there is the one switch, and
turning the others on is uncommenting their ids (completion plan B6-1). The
extension's list is bundled into the store zip, so turning them on there is
a new store release; on the website, a deploy. A stored type that is not
listed reads as Job.

With more than one type listed:

- **Pickers.** The popup shows a dropdown above the profile switcher; the
  dashboard's settings menu shows "Applying for" with one row per type. With
  Job alone neither renders. Each keeps its own choice on its own device
  (`onextap_application_type`): the dashboard's never reaches the extension,
  and the sync carries no choice of type (the owner's call, B6). A
  cover-letter template records the type it was made under
  (`applicationType`), which rides the sync with it; nothing reads it.
- **What follows the type.** The popup's tabs and the dashboard's workspaces
  (nav, dock, Overview, tour) hide what the type's `features` turn off: Job
  Matches for College and Scholarship. A link to a hidden workspace lands on
  Overview. Labels come from the type: Answer Studio is "Application Essays"
  or "Essay Answers", Cover Letter is "Personal Statement" or "Scholarship
  Essay".
- **The AI.** Answer Studio and the Cover Letter workspace send
  `applicationType`; the server words College and Scholarship as an essay
  read by an admissions or selection committee, and Job and Internship as
  before. The charge is the same for every type.
- **Essay pages.** The job-page button's scraper reads an essay or
  personal-statement container that wraps its own textarea as the prompt.

The e2e suites run with all four listed (`ONEXTAP_E2E_APPLICATION_TYPES`, a
test-time Vite define that a release build refuses), so turning them on is
already tested.

---

## 11. Error and recovery paths

| Where | Trigger | What the user sees |
|---|---|---|
| Dashboard boot | No Supabase settings in the build | "The dashboard couldn't start." with what to check |
| Dashboard boot | Dead session (or a 401 from `/api/me`) | Sent to sign in, the session dropped first |
| Dashboard boot | `/api/me` unreachable | Session-only view; "Couldn't load your account…" |
| Sign-in window | Supabase refuses | The reason in plain words; the form kept |
| Resume upload | Any pre-flight or parse failure | A specific message naming the cause |
| Answer Studio, cover letters | Generation fails | Inline error; the server gives the credit or the free follow-up back |
| Answer Studio, cover letters | No credits | The page refuses before sending; the server's own answer is a 403, nothing generated |
| Answer Studio, cover letters, Explain my fit | The spend cannot be made (migration 007 missing, the database unreachable) | 503: "AI writing is unavailable right now, so nothing was generated or charged." / "Couldn't check your credits, so nothing was generated." |
| Answer Studio, cover letters | Past the hourly ceiling | 429: "That's the limit of N AI drafts an hour. Try again in M minutes."; nothing charged |
| Reset page | No link, an expired or refused link | "Open the link from your email." / "This link can't be used." and a new link |
| Explain my fit | No credits / a failure after the charge | 403 refusal / the credit refunded by the server |
| Profile save | Extension did not confirm | "Saved here — the extension didn't confirm the sync" |
| Profile save | Store 1.0.2 installed | "Saved — the extension is out of date: update it" |
| Cover Letter, from the job page | The handoff expired (30 min) or was already read / no extension that can answer / no description on the page | An amber or clay note saying so, and to paste the description (§6.1) |
| Job-page button | The page could not be read, the extension was updated since the page loaded, or the dashboard did not open | Said in the button's own UI |
| Delete account | The extension promised a wipe and did not confirm it | The deletion stands; an error toast says the extension kept its copy and that removing it clears it |
| Feedback form | `/api/feedback` fails | "That didn't go through. Try again in a moment." |
| Popup render | Thrown error | `ErrorBoundary` with "Copy diagnostics" |
| Popup autofill | Restricted page | "Error: Cannot access this page" |
| Server | Unhandled route error | `errorLogger` answers JSON; `X-Request-Id` ties a report to the log |
| Any website page | Uncaught error | Logged (redacted) and kept for `__onextapIssues()` |

---

## 12. State that persists

| Key | Where | Contents |
|---|---|---|
| `onextap_profiles` | extension: `chrome.storage.local`; web: `localStorage` | `{ profiles: { id: { name, isDefault, autofillData, coverLetters, savedAnswers } }, activeProfileId }`; saved answers and templates carry the server's `aiAllowanceId` |
| `user_profile` | same | Flat mirror of the active profile |
| `onextap_resumes` | same | The resume library (parsed fields and text, never the file) |
| `onextap_application_type` | extension | `job` (the only live type) |
| `onextap_tutorial_seen` | web | The dashboard's tour, done |
| `onextap_avatar_<user id>` | web | The avatar chosen on this device |
| `dashboard.dock` | web | Where the dashboard's dock sits |
| `sb-<project ref>-auth-token` | web: `localStorage`; extension: `chrome.storage.local` | The Supabase session |
| `coverHandoff:<uuid>` | extension: `chrome.storage.session` | A job from the job-page button: 30 minutes or one read, whichever first; gone when the browser closes |
| `onextap_cover_handoff` | web: the tab's `sessionStorage` | That handoff's id, until the Cover Letter workspace takes it |
| `profiles` row | Postgres | Account, credits, premium and Dodo ids — **never profile content** |
| `credit_transactions` | Postgres | Every credit movement, written by the server only |
| `generation_allowances` | Postgres | One row per charge: the free follow-ups it bought, for 30 days, and its receipt for a refund (migration 007) |
| `generation_rate_limit` | Postgres | Drafts counted in the account's current hour (migration 006) |
| `rank_cache`, `rank_rate_limit` | Postgres | Job Matches' cached results and hourly rank count (migration 002) |

The extension's keys in `chrome.storage.local` are listed once, in
`src/localKeys.js`: what the wipe on account deletion removes (§9).
