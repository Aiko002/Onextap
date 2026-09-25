import { log } from './log.js';
import { goToApp } from './session.js';

/* ===========================================================================
   Onextap — the sign-in window's real accounts
   features/login takes a `signIn({ method, mode, email, password })` that
   returns a promise; this is it. It goes through the same Supabase client
   and helpers as the dashboard (src/supabaseClient.js, src/auth.js), loaded
   only when someone actually signs in, so the page itself does not wait on
   them. The session lands in localStorage where the dashboard reads it.

   Every attempt is still announced on the document as 'onextap:login' (the
   method, the mode and the email; never the password), as the page did
   before it had accounts.

   Signed in, the window shows its "You're in." and the reader goes on to
   the dashboard as it closes (Continue, the ×, Escape or the scrim).
   =========================================================================== */
var signedIn = false;

export function loginOptions() {
  return { signIn: signIn };
}

// Once a sign-in has worked, closing the window is the way into the dashboard.
export function afterSignIn(loginWindow) {
  loginWindow.onToggle(function (open) {
    if (!open && signedIn) goToApp();
  });
}

function announce(attempt) {
  document.dispatchEvent(new CustomEvent('onextap:login', {
    detail: { method: attempt.method, mode: attempt.mode, email: attempt.email || null }
  }));
}

function signIn(attempt) {
  announce(attempt);
  return Promise.all([import('../../../src/auth.js'), import('../../../src/supabaseClient.js')])
    .then(function (mods) {
      var auth = mods[0], supabase = mods[1].supabase;
      if (attempt.method === 'google') return withGoogle(supabase);
      return attempt.mode === 'up' ? signUp(auth, attempt) : withPassword(auth, attempt);
    })
    .catch(function (err) {
      // Supabase's reason ("Invalid login credentials", a rate limit) is for
      // the console; the window shows its own one-line apology.
      log.warn('Sign-in failed:', (err && err.message) || err);
      throw err;
    });
}

function withPassword(auth, attempt) {
  return auth.signIn(attempt.email, attempt.password).then(function (res) {
    if (res.error) throw res.error;
    if (!res.session) throw new Error('Signed in, but no session came back.');
    signedIn = true;
  });
}

// `session` is null when the Supabase project asks new accounts to confirm
// their email first. The window still says the account was created (it
// was), and the reader stays here rather than being sent to a dashboard
// that would only send them back.
function signUp(auth, attempt) {
  return auth.signUp(attempt.email, attempt.password).then(function (res) {
    if (res.error) throw res.error;
    signedIn = !!res.session;
  });
}

/* Google hands the reader back to the root of the site, whichever page the
   window was opened on: that is the address sign-in has always returned to
   (src/auth.js sends origin + pathname, and the dashboard lived at /), so it
   is the one on the project's redirect allow-list. There, the inline script
   in index.html sees the tokens in the URL and passes them on to /app/.
   Once the browser is on its way the promise never settles, so the window
   stays busy until the page goes. */
function withGoogle(supabase) {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + '/' }
  }).then(function (res) {
    if (res.error) throw res.error;
    return new Promise(function () {});
  });
}
