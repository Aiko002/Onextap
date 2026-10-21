# Supabase auth emails

Onextap's versions of the emails Supabase Auth sends, in the site's palette
and type (completion plan B6-0 (a)). Supabase keeps its templates in each
project's dashboard, not in a repo, so these are pasted in **by hand**, on
**production** at deploy (`docs/deploy-checklist.md` §3, steps 11 and 12).
Nothing deploys them. Supabase won't let a project edit its templates until
it has custom SMTP (found on the dev project, 2026-10-21), so the sender
comes first; dev, without custom SMTP, keeps Supabase's text.

## Which file goes where

Supabase dashboard → the project → **Authentication** → **Emails** →
**Templates** (some dashboards list **Emails** under **Notifications**). Each
slot has a **Subject** field and a **Body**.

| Slot | File | Subject |
| --- | --- | --- |
| Confirm sign up | `confirm-signup.html` | Confirm your email for Onextap |
| Reset password | `reset-password.html` | Set a new Onextap password |
| Magic link (or "Magic link or OTP") | `magic-link.html` | Your Onextap sign-in link |
| Change email address | `change-email.html` | Confirm your new email for Onextap |

For each one:

1. Click the slot.
2. **Subject:** type the subject from the table.
3. **Body:** switch to the source (HTML) view if the editor has one, select
   everything, and paste the whole file, from `<!doctype html>` to
   `</html>`.
4. **Save**. The preview should show a dark band with ONEXTAP, an oat card,
   and a citrine button.

The other slots (Invite user, Reauthentication, and the security
notifications, if they are on) keep Supabase's text: nothing on the site
sends them.

The sender's name and address are not in a template. Supabase's built-in
sender is always Supabase's, delivers only to the project team's own
addresses, and sends 2 an hour; "Onextap" as the sender needs custom SMTP
(`docs/deploy-checklist.md` §3).

## Checking them

Before a paste, open each file in a browser with the variables swapped for
sample values to see its layout (B6 checked them this way). After the paste
on production, the real check is `docs/deploy-checklist.md` §7, step 3.7:
**Forgot password?** with your own address; the email comes from "Onextap"
with the subject above and the branded layout, and its button lands on
`/reset-password/`. On a project with custom SMTP, a sign-up with an address
that has no account checks the confirmation email the same way, landing
signed in on `/dashboard/`; delete that test user afterwards
(Authentication → Users).

## Where each link lands

The site runs supabase-js's implicit flow (`src/supabaseClient.js` sets no
`flowType`). So every button is `{{ .ConfirmationURL }}`: Supabase's own
verify address, which checks the link and sends the browser on with the
session in the address's `#` part. The page it lands on picks it up.

| Email | Sent by | Lands on |
| --- | --- | --- |
| Confirm sign up | the sign-up form (`src/auth.js` `signUp`, no `emailRedirectTo`) | the Site URL (the landing), which forwards the session to `/dashboard/` (`web/index.html`) |
| Reset password | **Forgot password?** (`requestPasswordReset`, `redirectTo` = `/reset-password/`) | `/reset-password/`, signed in by the link, to set the new password. Not on the Redirect URLs list, it falls back to the landing, which forwards a recovery link there too |
| Magic link | no screen today (the dashboard's Users list can send one) | the Site URL, forwarded to `/dashboard/` |
| Change email address | no screen today | the Site URL, forwarded to `/dashboard/` once both links are opened; the first of the two lands on the landing |

Variables used: `{{ .ConfirmationURL }}`, `{{ .Email }}` (the account's
address; in the change email, the old one), `{{ .NewEmail }}` (the change
email only) and `{{ .SiteURL }}` (the footer's link). Not used:
`{{ .Token }}` (a 6-digit code needs a page to type it into, and the site has
none) and `{{ .TokenHash }}` (a hand-built link needs a page that calls
`verifyOtp`).

A known limit: some mail systems open links to scan them before the reader
does, which uses up a one-time link ("expired" when the reader clicks). The
fix would be a code or a page that holds the link behind a button; neither
is built.

## Editing them

Keep them email-safe: tables for layout, inline styles only (no `<style>`,
no stylesheet), no images (no remote ones, no tracking pixels), and no web
font loaded (each face is named first and falls back to Georgia, Helvetica
or Arial). Every address in them is a Supabase variable, so the same file
works on dev and production. Colours are the site's tokens
(`web/src/shared/styles/tokens.css`): ink `#0C1710`, oat `#E9E4D4` and
`#DDD7C4`, hairline `#C8C1AC`, citrine `#C6DA43`, secondary text `#5E6858`.

`npm test` runs `test/supabase/authEmailTemplates.test.js`, which checks the
variables, the rules above, that no Supabase default wording is left, and
this table. After an edit, paste the file in again on every project that
has them (production; dev too, if it gets custom SMTP).
