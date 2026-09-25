# Task Log (Tier 2)

Episodic memory. One entry per completed task. This is the record of what
you actually tried, not what you meant to try.

Loaded on demand, not always. It can grow.

## Why keep it

A single entry is worth little. The value shows up when the same lesson
appears three times. That repetition is the signal that something should be
promoted to a procedure (Tier 4) or a hot rule (Tier 1). See
`COMPACTION.md` at the repo root.

Write the entry when the task ends, while you still remember what went
wrong. An entry written a week later is a summary of the commit message,
which you already have.

## Entry format

Five fields. Nothing else. The date is generated for you.

```
date: <YYYY-MM-DD, filled in automatically>
task: <what you set out to do, one line>
approach: <what you actually did, including anything you tried first and abandoned>
result: <what happened, including failures and how many attempts it took>
lesson: <what you would tell someone starting the same task tomorrow>
```

Rules for filling it in:

- **date** is the day the task ended, `YYYY-MM-DD`.
- **task** is the goal, not the ticket number. "Fix the login timeout bug" beats "PROJ-4412".
- **approach** should mention the thing that did not work. That is usually where the lesson lives.
- **result** should be honest about attempt count. "Worked on the third try" carries information that "worked" does not.
- **lesson** must be transferable. If it only applies to this one file, it is not a lesson, it is a comment. Leave it blank rather than padding it.

An entry with a blank lesson is fine and common. Most tasks teach nothing.

---

## Entries

Oldest first. New entries are appended at the end.

Copy this file to `task-log.md` in this folder on first use and append
entries there. Keep the five fields in the order above.

The harness repo ships a `scripts/log-task` helper that stamps the date and
enforces field order. It was not copied here; add it if hand-written entries
start drifting.

```
date: 2026-09-25
task: Replace the React landing page with the UncannySteel/DEMO_WEB design, wired to the real backend, plus a cookie banner
approach: Vendored DEMO_WEB verbatim into landing/ as its own Vite build (no PostCSS plugins, Vite 7 targets) so Tailwind never reaches it; landing at /, React dashboard moved to /app/ with an inline head redirect for signed-in readers and a one-shot flag back. Considered mounting the vanilla page inside React first and dropped it: its global listeners never tear down and Tailwind's preflight would restyle it. Wired sign-in/Google/Web Store/pricing/feedback only through the design's own seams (landing/src/onextap/). Verified with DEMO_WEB's Playwright suite, a pixel diff against DEMO_WEB's own build, and the real Express server pointed at a mock Supabase.
result: Four verification rounds. Round 1 had 8 failures (7 test bugs, 1 real: the design's onextap:feedback event was dropped). Rounds 2–4 green. Pristine DEMO_WEB itself fails 6 of its tests here (no favicon → /favicon.ico 404 in the console).
lesson: In a cloud container, import /root/.ccr/agent-proxy-ca.crt into ~/.pki/nssdb (certutil) before running Playwright, or every page loading Google Fonts logs ERR_CERT_AUTHORITY_INVALID and "no console errors" tests fail. Measure a design's pixel-diff noise floor (its build against itself) before calling any diff a regression.
```
