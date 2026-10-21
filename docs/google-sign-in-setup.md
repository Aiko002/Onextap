# Turning on "Continue with Google"

For the **dev** Supabase project and the local site (`http://localhost:5173`).
About 10 minutes. You type every ID and secret yourself; they never go into a
file in this repo.

You need two browser tabs: the Supabase dashboard (dev project) and the
Google Cloud Console (<https://console.cloud.google.com>).

## 1. Supabase: switch Google on and copy its callback address

1. Supabase dashboard → open the **dev** project.
2. Left menu: **Authentication** → **Sign In / Providers**.
3. Click **Google**. Turn on **Enable Sign in with Google**.
4. Find **Callback URL (for OAuth)**. It ends in `/auth/v1/callback`. Click its
   copy button. Leave this tab open; you come back in step 4.

## 2. Google: name the app (first time only)

1. Google Cloud Console → pick a project at the top (or create one, e.g.
   "Onextap").
2. Left menu: **APIs & Services** → **OAuth consent screen** (Google may call
   it **Google Auth Platform**). If it says **Get started**, click it.
3. **App name:** `Onextap`. **User support email:** yours.
4. **Audience:** **External**.
5. **Contact email:** yours. Agree to the policy, then **Create**.
6. **Audience** page → **Test users** → **Add users** → your Google address →
   **Save**. (While the app is in "Testing", only test users can sign in.)

## 3. Google: make the sign-in client

1. Left menu: **Clients** (or **APIs & Services** → **Credentials** →
   **Create credentials** → **OAuth client ID**).
2. **Application type:** **Web application**. **Name:** `Onextap dev`.
3. **Authorized JavaScript origins** → **Add URI** → `http://localhost:5173`
4. **Authorized redirect URIs** → **Add URI** → paste the Supabase callback
   address from step 1.
5. **Create**. A box shows the **Client ID** and **Client secret**. Keep it
   open.

## 4. Supabase: paste the client in

1. Back in the Supabase tab (Google provider, from step 1).
2. Paste the **Client ID** into **Client IDs**, and the **Client secret** into
   **Client Secret (for OAuth)**.
3. **Save**.

## 5. Supabase: allow the local site as a return address

1. Left menu: **Authentication** → **URL Configuration**.
2. **Redirect URLs** → **Add URL** → `http://localhost:5173/**` → **Save**.

   Keep the `/**` at the end. The site sends you back to `/dashboard/`,
   sometimes with extra bits after it (the job-page button's handoff), and
   only the wildcard matches those.

## 6. Try it

1. Open `http://localhost:5173` → **Sign in** → **Continue with Google**.
2. Pick your Google account (it must be a test user from step 2).
3. You should land on `http://localhost:5173/dashboard/`, signed in, with your
   Google name in the greeting.

## If it goes wrong

| What you see | What to fix |
| --- | --- |
| `Unsupported provider: provider is not enabled` | Step 1 (switch on) or step 4 (Save) didn't stick. |
| Google: `Error 400: redirect_uri_mismatch` | Step 3.4: the redirect URI must be exactly Supabase's callback address. |
| Google: "Access blocked" / "app is being tested" | Step 2.6: add your address as a test user. |
| You land on onextap.com, or on `/` signed out | Step 5: the Redirect URL is missing or has no `/**`. |

## 7. Google: brand the consent screen (optional on dev)

What Google shows on its sign-in screens: the name, the logo and the links.
About 5 minutes. Sign-in works without it.

1. Google Cloud Console → the same project as step 2.
2. Left menu: **Google Auth Platform** → **Branding** (older consoles:
   **APIs & Services** → **OAuth consent screen**).
3. **App name:** `Onextap`. **User support email:** yours.
4. **App logo** → upload `docs/brand/google-consent-logo-120.png` from this
   repo (square, 120×120 pixels, PNG; Google wants it under 1 MB).
5. **App domain:**
   - **Application home page:** `https://www.onextap.com`
   - **Application privacy policy link:** `https://www.onextap.com/privacy/`
   - **Terms of service:** leave empty (the site has none).
6. **Authorized domains** → **Add domain** → `onextap.com`. (Not
   `localhost`: Google doesn't take it, and the client from step 3 works
   without it.)
7. **Developer contact information:** yours. **Save**.
8. Don't press **Verify branding** here unless this Google project is also
   production's. Verifying is done once, on production's project, after the
   new site is live: `docs/deploy-checklist.md` §12. Branding belongs to the
   Google project, not to one client, so if dev's and production's clients
   share a project, they share this screen too.

## What Google's screen says

**Before Google verifies the brand** (dev, always, unless you verify it):
the account chooser says "to continue to `<project>.supabase.co`", not
"Onextap", and the name and logo from step 7 don't show yet. That is
expected.

**After Google verifies the brand:** the name and logo from step 7 replace
the domain. Google's help page says the app name is shown on the consent
screen only once the app is verified, and that without verification users
see only the app's domain (Google Cloud Help, "Manage OAuth App Branding",
<https://support.google.com/cloud/answer/15549049>). Supabase's guide says
the same: a verified brand shows the logo and name instead of the Supabase
address (<https://supabase.com/docs/guides/auth/social-login/auth-google>).

Unconfirmed: neither page says line by line which words of the account
chooser change, so check by signing in once verification has passed. To
show onextap.com instead of supabase.co anywhere on the screen takes a
Supabase custom domain (such as `auth.onextap.com`, a paid add-on): optional
and not planned (`docs/deploy-checklist.md` §12, step 10).
