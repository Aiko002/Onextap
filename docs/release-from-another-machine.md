# Release from another machine

Written 2026-11-19, from the checkout on the owner's machine, for a session
that starts with nothing but a fresh clone of the dev repository.

**What this covers:** deploying the website to production (a push, which *is*
the deploy) and building the Chrome Web Store zip. Nothing else. It assumes
production is already set up — Supabase, Vercel, Dodo, Resend, the Google
consent screen, the store listing all exist and work. The first-time setup is
`docs/release-guide.md` (the ten-step 1.0.4 release) and
`docs/deploy-checklist.md` (the same with the reasons). **Read neither unless
this one sends you there.** They describe a release that already happened, and
following them end to end would have you re-run production setup.

Those two call the live remote `live`. This repository, `CLAUDE.md` and
everything below call it `origin`. Same GitHub repository, two names. Step 1
settles it.

---

## 0. The gate

Both of these need the owner to have asked for them, in words, in the session
you are in. They are on `CLAUDE.md`'s Escalate list.

- [ ] The owner asked for the **live push** ("push to live", "deploy", "push to
      the live website").
- [ ] The owner asked for the **store zip** ("build the release", "make the zip").

One does not imply the other. If only one was asked for, do only that one.

Hard rules for the whole run:

- **Never `--force`,** to either remote, for any reason. A rejected push means
  something changed under you: stop and tell the owner.
- **Never push to live a commit that is not already on the dev repository.**
  Live is always a fast-forward of dev.
- **Never run `supabase/schema.sql` against production.** It drops and
  recreates a trigger. Production gets numbered migrations, by hand, and this
  release has none (see step 3.3).
- **Never print, paste, commit or quote a key.** Not in chat, not in a commit
  message, not in a note to the owner. Name the variable; never its value.
- **No code changes during a release.** If something looks like it needs one,
  stop and say so. Fixing it mid-release is how a tested commit becomes an
  untested one.
- **You do not submit to the Chrome Web Store.** You build the zip and hand it
  over with its checksum. The upload, the listing text and the submit button
  are the owner's (step 8).
- Commit messages name no assistant and carry no co-author line. The owner's
  rule, 2026-10-21.

---

## 1. Clone, and name the remotes correctly

This is the one step that will quietly ruin the rest if you rush it. There are
two repositories:

| What | GitHub | Remote name below | Branch |
| --- | --- | --- | --- |
| **Dev** — everything lands here first | `UncannySteel/OneXtap-latest` | `latest` | `merge/web-dashboard` (its default) |
| **Live** — a push here is the production deploy | `Aiko002/Onextap` | `origin` | `main` |

Cloning the dev repository names it `origin` by default — **the opposite of
what every other file in this repository means by `origin`.** Rename it before
you do anything else.

```
git clone https://github.com/UncannySteel/OneXtap-latest.git onextap
cd onextap
git remote rename origin latest
git remote add origin https://github.com/Aiko002/Onextap.git
git fetch --all
git checkout merge/web-dashboard
git remote -v
```

The last line must print exactly this, four lines, before you go on:

```
latest  https://github.com/UncannySteel/OneXtap-latest.git (fetch)
latest  https://github.com/UncannySteel/OneXtap-latest.git (push)
origin  https://github.com/Aiko002/Onextap.git (fetch)
origin  https://github.com/Aiko002/Onextap.git (push)
```

If it does not, fix it now. From here on, `latest` is dev and `origin` is live,
and no command below ever writes to a remote you did not name.

**Do not reuse an old clone** taken before 2026-10-21: the branch's history was
reworded and force-pushed that day, so it will not fast-forward.

---

## 2. The machine

**What you need installed**

- **Node 22.15 or newer.** Older Node skips the tests that load `src/` through
  `test/extension/viteModules.js`, so a green run would mean less than it
  looks. The owner's machine runs 25.8.0 / npm 11.11.0.
- **git**, able to push to both repositories (the owner's GitHub account, or an
  account with write access to both).
- **A `tar` that writes zip files** — bsdtar. Windows 10+ and macOS ship it;
  the build script picks `C:\Windows\System32\tar.exe` on Windows explicitly,
  so Git Bash's GNU tar earlier in `PATH` does not get used. On Linux install
  `libarchive-tools`.
- Chrome, if you want to load the built zip and look at it (step 7.5).
- ~1.5 GB free for `node_modules`.

**Install**

```
npm ci
npm run server:install
```

`server/` has its own `package.json` and `node_modules`; the route tests load
the real Express app, so skipping the second line fails most of `npm test`.

**Check the shell is clean.** Vite's `loadEnv` reads `VITE_*` already set in
the shell *after* the files, so a stray one wins over `.env.production.local`
and ships in the bundle.

```
Get-ChildItem Env: | Where-Object Name -match 'VITE_|ONEXTAP_'
```

Expect nothing. `ONEXTAP_E2E_APPLICATION_TYPES` in particular is a test switch
the release build refuses.

**You do not need a `.env` for this task.** The website is built by Vercel from
its own environment variables, and the store zip gets its values from
`.env.production.local` in step 7. If you create a dev `.env` out of habit, the
release build will read it too and may refuse — or worse, pass with a dev key.

---

## 3. Work out what is actually unreleased

Do not assume. Six commands:

```
git fetch latest
git fetch origin
git log --oneline -1 latest/merge/web-dashboard
git log --oneline -1 origin/main
git rev-list --count origin/main..latest/merge/web-dashboard
git rev-list --count latest/merge/web-dashboard..origin/main
```

The last two are **dev-only commits** (what a deploy would ship) and
**live-only commits** (what someone pushed straight to live). Read them as:

| dev-only | live-only | What it is | What to do |
| --- | --- | --- | --- |
| > 0 | 0 | The normal case: live is behind, cleanly. | Go to step 4. |
| 0 | 0 | Live already has everything. | **Nothing to deploy.** Say so; skip to step 7 if a zip was asked for. |
| 0 | > 0 | Someone pushed straight to live. (Happened 2026-11-19: `82371dd`, a lockfile line.) | Fast-forward dev onto live, then re-run the counts — see below. |
| > 0 | > 0 | Diverged. | **STOP.** Tell the owner, name both tips, and wait. Do not merge, rebase or force. |

**The third case**, in full — it is a fast-forward of dev, no history is
rewritten, and it is what keeps the next deploy pushable:

```
git merge-base --is-ancestor HEAD origin/main
git merge --ff-only origin/main
git push latest merge/web-dashboard
```

The first line must succeed (exit 0) before the second. If it fails you are in
the fourth case.

**3.1 Read what is shipping.** Not just the count:

```
git log --oneline origin/main..latest/merge/web-dashboard
git diff --stat origin/main..latest/merge/web-dashboard
```

Tell the owner that list and confirm it is what they mean by "push to live"
before you push anything.

**3.2 Which parts does it touch?**

- `web/`, `src/`, `server/`, `api/`, `vercel.json` → the deploy matters.
- only `extension/`, `public/content.js`, `test/` → the website is unchanged;
  the deploy is harmless but pointless, and what the owner actually wants is
  the store zip. Say so rather than pushing for the sake of it.

**3.3 Any new migration is an escalation.**

```
git diff --name-only origin/main..latest/merge/web-dashboard -- supabase/
```

Expect nothing. If a numbered file in `supabase/migrations/` is new, **stop**:
it has to be applied to production by hand, in the SQL Editor, before the code
that needs it goes live, and `supabase/migrations/README.md` is the only record
of what is applied where. That is the owner's call, not yours. As of
2026-11-19 the last applied migration is `009`, applied 2026-11-03.

**3.4 What the store has today.** You need this in step 7 to pick a version.
Ask the owner, or look at the public listing. As of 2026-11-19 the record says:
**1.0.4 was submitted for review on 2026-11-03**; the publish date was never
written down. The repository is at **1.0.5** (unreleased, built 2026-11-15:
dropdown autofill).

---

## 4. Verify the code before it goes anywhere

```
npm run lint
npm test
```

Expect, from the owner's machine on 2026-11-19 at `82371dd`:

| Command | Expected |
| --- | --- |
| `npm run lint` | no output at all (ESLint 9, correctness only) |
| `npm test` | `tests 1193`, `pass 1191`, `fail 0`, `skipped 2` |

Anything failing stops the release. Report the failure; do not fix it and
deploy the fix in the same breath.

**End-to-end, optional** but worth it if the change touches the website or the
autofill. They need port 5173 free and Playwright's browsers:

```
npx playwright install chromium
npm run test:e2e
npm run test:e2e:extension
```

Baselines: `test:e2e` 229 passed / 10 skipped; `test:e2e:extension` 16/16
**with** the `legacy` project, which only runs when `E2E_LEGACY_EXTENSION_PATH`
points at an unpacked copy of store 1.0.2 — without it, expect 13. These run
against stubs: no real service is touched. If Chromium refuses to start from
its install folder, copy it elsewhere and set `E2E_CHROMIUM_PATH`.

Nothing automated drives the real dashboard or the popup. "Verified" beyond
this means you built it and clicked through it yourself — say plainly which one
you mean.

---

## 5. Deploy the website

The push is the deploy. Vercel builds `origin/main` and switches production
over when the build is Ready; a failed build leaves the old site up.

**5.1 Smoke the live site first,** so you know what "it was fine before" means:

```
node scripts/smoke-prod.mjs https://www.onextap.com
```

Nine unauthenticated GETs, one PASS/FAIL line each: `/api/health` 200 with an
`X-Request-Id`, `/api/credits` 401, `/api/jobs/ingest` 401, the four pages 200,
`/privacy-policy` a permanent redirect to `/privacy/`, and an unknown path 404.
Expect **9/9** — the live site has been on the new build since 2026-11-03. If
the redirect and 404 checks fail, an older build is answering: stop and find
out why before adding to it.

**5.2 Confirm the fast-forward.** Never skip this:

```
git merge-base --is-ancestor origin/main latest/merge/web-dashboard
```

Exit 0, or you are in step 3's fourth case.

**5.3 Push.**

```
git push origin latest/merge/web-dashboard:refs/heads/main
```

Pushing the remote-tracking ref, not your local branch, is deliberate: what
goes live is exactly what the dev repository has. If it is rejected as
non-fast-forward, someone pushed to live while you worked. Stop. Do not retry
with `--force`. Go back to step 3.

**5.4 Watch the build.** Vercel → the project serving www.onextap.com →
Deployments → the new commit. Both the site build and the `api/index.js`
function. Typically Ready in 30–40 seconds. Only when it is **Ready** is the
new site live.

**5.5 Smoke again.** Same command, expect **9/9**.

**5.6 Look at the actual change** in a browser, hard-reloaded. Asset filenames
are content-hashed, so a changed chunk has a new name — if you still see the
old one, you are looking at a cached page, not a failed deploy.

**5.7 Write down** the date and time, the deployed SHA, both smoke results, and
anything you checked by hand. Step 9 needs it.

---

## 6. If the deploy is wrong

**Prefer Vercel.** Deployments → the last good one → **Promote to Production**.
It is instant, it needs no git history games, and the repository stays honest
about what the code is.

Rolling production back **in git** means pushing an older commit over a newer
one, which is not a fast-forward and needs `--force`. Do not. If the owner
wants the history itself reverted, the clean way is a new commit on dev that
reverts the change, pushed to `latest` and then fast-forwarded to live like any
other release.

---

## 7. Build the Chrome Web Store zip

`npm run build:release` is five steps and stops at the first failure, zipping
nothing. It never prints a key.

**7.1 Pick the version.** Three files must agree, and a test enforces it:
`extension/manifest.json`, `package.json`, and `RELEASE_VERSION` in
`scripts/releaseManifest.js`. All three say **1.0.5** as of 2026-11-19.

- The store's published version is **below** 1.0.5 → build 1.0.5 as it is.
- The store already has 1.0.5 → bump all three to 1.0.6, run `npm test`, commit
  to dev and push to `latest` (a manifest bump needs no website deploy), then
  build.
- A 1.0.5 is sitting **in review** → uploading again replaces the pending
  submission. Ask the owner first.

**7.2 Production's four values**, in a new file `.env.production.local` at the
repository root. Nothing else goes in it. Git ignores `.env.*.local`, and a
release build reads it over any `.env`.

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://itqaozltgsyvjhlcllic.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | production's anon or publishable key — from the owner's backup. **Never** the service-role key |
| `VITE_DASHBOARD_URL` | `https://www.onextap.com` |
| `VITE_API_URL` | `https://www.onextap.com` |

Three of the four are written above because they are public addresses. The
fourth is the owner's to supply — ask for it, paste it into the file, and do
not echo the file afterwards. No `VITE_` name may look like a server secret
(`SERVICE_ROLE`, `SECRET`, `GROQ`, `GEMINI`, `DODO`, `OPIK`, `CRON`, `RESEND`,
`ADZUNA`): everything `VITE_*` is inlined into the shipped bundle, and the
build refuses such a name outright.

**7.3 Check the environment alone** before building anything:

```
node scripts/build-release.mjs --check-env .
```

Four `pass` lines, no values printed. A line saying a publishable key cannot
name its project, so confirm it is `itqaozltgsyvjhlcllic`'s, is **not** a
failure — a publishable key names no project. Confirm by hand with the owner
that it is production's, from Supabase → Settings → API Keys.

**7.4 Build.**

```
npm run build:release
```

Steps 1 to 5, each with pass/FAIL lines, ending with the zip path and
`SHA-256  <64 hex>`. Keep that line.

| Fails at | What it means | What to do |
| --- | --- | --- |
| 1 environment | a value is missing or is not production's | the line names the variable and the rule; fix the file |
| 2 build | `vite build` failed | a real build break — stop, report |
| 3 scan | the output carries a localhost address, a service-role JWT, a key shape, or a server-secret variable name | **stop and tell the owner.** Never work around it |
| 4 manifest | the version, permissions, host permissions or `externally_connectable` are not the pinned release | **stop.** A permission change is an escalation on its own |
| 5 zip | `tar` is not bsdtar, or wrote something that is not a zip | install bsdtar; on Windows make sure System32's `tar.exe` exists |

**7.5 Check the zip.**

```
tar -xOf release/onextap-1.0.5.zip manifest.json
```

```
Get-FileHash -Algorithm SHA256 release\onextap-1.0.5.zip
```

The manifest must say the version you meant, must contain no `localhost`, and
must list exactly `storage`, `activeTab`, `scripting`, `identity`. The hash
must equal what step 7.4 printed — a different hash is a different file.
(macOS/Linux: `shasum -a 256 release/onextap-1.0.5.zip`.)

Optional: unzip into an **empty** folder, load it in a spare Chrome profile via
`chrome://extensions` → Developer mode → Load unpacked, open the popup and see
it start. Do not sign in or sync in that profile.

**7.6 Delete `.env.production.local` immediately.**

```
Remove-Item .env.production.local
```

While it exists, every build on that machine silently uses production's values.

**7.7 The zip is not committed.** `/release/` is gitignored and holds live
addresses. Hand the owner the file and its SHA-256 directly.

---

## 8. The store submission is the owner's

Draft everything; do not upload, do not submit, do not create anything. The
Chrome Web Store developer dashboard does not render in Claude's built-in
browser pane either — the owner does this in their own Chrome.

Hand over:

- The zip and its SHA-256, and the sentence "check the hash again just before
  uploading".
- **The item:** `fpleipjggoiolomkcnchnlelbjcnoklj` → Package → upload the zip.
- **Permissions are unchanged** from the published version — `storage`,
  `activeTab`, `scripting`, `identity`; hosts `https://*.supabase.co/*`,
  `https://www.onextap.com/*`, `https://onextap.com/*`;
  `externally_connectable` for the two onextap.com addresses. So users see no
  new permission warning and the privacy-practice justifications stay as they
  are.
- **Privacy policy URL:** `https://www.onextap.com/privacy/` (the old
  `/privacy-policy` redirects there).
- **"What's new"** — draft for 1.0.5, for the owner to edit:

  > **What's new in 1.0.5**
  >
  > - **Dropdowns fill too.** Autofill now handles the select menus on
  >   application forms, both the browser's own and the custom ones sites
  >   build themselves, and recognises more education and demographic
  >   questions.

  If the version being submitted is a later one, write the entry from the
  commits in step 3.1 rather than reusing this.
- **Hold the release** if the dialog offers it, so publishing stays the owner's
  decision, and a **staged rollout** if offered.
- After it is published: update your own install (`chrome://extensions` →
  Update) and try it on a real job posting.

Say plainly, in the handover, that the submission has not happened.

---

## 9. Close out

**9.1 Write it into the repository.** A short entry — what was deployed, when,
the SHA, the smoke results, the zip's version and SHA-256, and what is still
waiting on the owner — at the top of `HANDOVER.md`'s §0, or as a note alongside
it. Commit on `merge/web-dashboard` and push to `latest` **only**:

```
git push latest merge/web-dashboard
```

That commit does not need to go live. It will ride along with the next deploy.

**9.2 Tell the owner,** in plain words: the deployed commit, that the site is
live and smoked 9/9, where the zip is and its hash, and that the store upload
is theirs. If any step was skipped or could not be checked, say which and why —
do not round it up to "done".

---

## Appendix A — the facts, in one place

| | |
| --- | --- |
| Dev repository | `https://github.com/UncannySteel/OneXtap-latest`, branch `merge/web-dashboard`, remote `latest` |
| Live repository | `https://github.com/Aiko002/Onextap`, branch `main`, remote `origin` — a push here is the deploy |
| Live site | `https://www.onextap.com` — landing `/`, dashboard `/dashboard/`, API `/api/`, privacy `/privacy/` |
| Hosting | one Vercel project builds the site (`npm run build:dashboard` → `dist-dashboard/`) and the API (`api/index.js`) |
| Production Supabase | project ref `itqaozltgsyvjhlcllic`; last migration applied `009`, 2026-11-03 |
| Chrome Web Store item | `fpleipjggoiolomkcnchnlelbjcnoklj` |
| Repository version | 1.0.5 (manifest, `package.json`, `RELEASE_VERSION`) |
| Store version | 1.0.4 submitted 2026-11-03; publish date not recorded — confirm with the owner |
| Smoke | `node scripts/smoke-prod.mjs https://www.onextap.com`, expect 9/9 |
| Baselines (2026-11-19, `82371dd`) | lint clean; `npm test` 1193 tests / 1191 pass / 0 fail / 2 skipped; e2e 229 + 10 skipped; extension e2e 16/16 with `legacy` |

## Appendix B — known and unfixed, as of 2026-11-17

Found in a UX audit across eight browser and device setups. **None of these is
a regression from this release, and none is yours to fix mid-release.** They
are here so you recognise them instead of chasing them:

- Generate / Personalise charge twice if pressed twice before the balance loads.
- "Explain my fit", second tap on touch, lands on a different job.
- Premium "Manage billing" opens two portal tabs.
- Raw error text surfaces across the dashboard ("Failed to fetch", Vercel's 502
  page text, `[debug: …]` on resume errors).
- Website sign-in shows "Load failed" on Safari only.
- Logging out of the website, back in, then any save overwrites the extension's
  profile with blanks.
- 1.0.2 → 1.0.5 drops the popup's dark mode.
- Inputs are 14–15.5px, so iOS zooms on tap; 200% text breaks the phone header.

Also unsupported and known: autofill inside iframes (embedded Greenhouse).

## Appendix C — when something is off

| Symptom | Reading |
| --- | --- |
| `git push origin …` rejected, non-fast-forward | someone pushed to live. Step 3, fourth case. Never `--force` |
| Smoke fails `/privacy-policy` and the 404 check | an older build is answering — a deploy did not land, or Vercel is serving a previous one |
| Smoke fails `/api/jobs/ingest` with 503 | `CRON_SECRET` is unset on the server, not a deploy problem |
| `build:release` step 5 says "did not write a zip" | the `tar` on `PATH` is GNU tar. Windows: System32's `tar.exe`; Linux: `libarchive-tools` |
| `npm test` fails loading `src/` modules | Node older than 22.15 |
| Most route tests fail | `npm run server:install` was not run |
| Vercel build fails | the old site stays up. Read the build log; do not push again blindly |
| The site looks unchanged after a Ready deploy | hard-reload. Asset names are content-hashed; a stale page is not a failed deploy |
