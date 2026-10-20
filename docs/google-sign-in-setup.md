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

## What Google's screen says

Google's account chooser says "to continue to `<project>.supabase.co`", not
"Onextap". On dev that is expected. Making it say Onextap is production work
in batch B6 of `docs/plans/active/completion-plan.md` (brand verification of
the consent screen, and optionally a Supabase custom domain).
