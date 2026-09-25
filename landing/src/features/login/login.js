import { createDialog } from '../../shared/lib/dialog.js';
import markup from './login.html?raw';
import './login.css';

export { markup };

/* --- the sign-in window ---------------------------------------------------
   Any [data-login] button opens it (the header's Log in, on every page); it
   opens, closes and holds the page as every window does (shared/lib/
   dialog.js). "Sign up" turns it into the sign-up form and back. The form
   checks itself before it goes; `signIn` is where it goes.

   No accounts are wired up yet. Until they are, an attempt is announced on
   the document as an 'onextap:login' event (detail: the method, the mode
   and the email; never the password) and counts as signed in. Pass
   initLogin({ signIn }) a function that takes { method, mode, email,
   password } and returns a promise to sign in somewhere real. */
var MIN_NEW_PASSWORD = 8;

var MODES = {
  in: {
    title: 'Welcome back', intro: 'Sign in to access your dashboard.',
    submit: 'Sign In', busy: 'Signing in…', ask: 'Don’t have an account?', other: 'Sign up',
    password: 'current-password'
  },
  up: {
    title: 'Create an account', intro: 'Sign up to set up your dashboard.',
    submit: 'Sign Up', busy: 'Signing up…', ask: 'Already have an account?', other: 'Sign in',
    password: 'new-password'
  }
};

function announce(attempt) {
  document.dispatchEvent(new CustomEvent('onextap:login', {
    detail: { method: attempt.method, mode: attempt.mode, email: attempt.email || null }
  }));
  return Promise.resolve();
}

export function initLogin(opts) {
  var signIn = (opts && opts.signIn) || announce;
  var root = document.getElementById('login');
  var view = document.getElementById('loginView');
  var done = document.getElementById('loginDone');
  var form = document.getElementById('loginForm');
  var google = document.getElementById('loginGoogle');
  var submit = document.getElementById('loginSubmit');
  var show = document.getElementById('loginShow');
  var sendErr = document.getElementById('loginSendErr');
  var email = form.elements.email;
  var password = form.elements.password;
  var mode = 'in';

  function setMode(next) {
    mode = next;
    var m = MODES[mode];
    document.getElementById('loginTitle').textContent = m.title;
    document.getElementById('loginIntro').textContent = m.intro;
    document.getElementById('loginAsk').textContent = m.ask;
    document.getElementById('loginSwitch').textContent = m.other;
    submit.textContent = m.submit;
    password.setAttribute('autocomplete', m.password);
    [email, password].forEach(function (input) { setError(input, ''); });
    sendErr.textContent = '';
  }

  function reset() {
    form.reset();
    view.hidden = false;
    done.hidden = true;
    reveal(false);
    setBusy(false);
    setMode('in');
  }

  /* --- showing the password ------------------------------------------- */
  function reveal(on) {
    password.type = on ? 'text' : 'password';
    show.textContent = on ? 'Hide' : 'Show';
    show.setAttribute('aria-pressed', String(on));
  }
  show.addEventListener('click', function () {
    reveal(password.type === 'password');
    password.focus();
  });

  document.getElementById('loginSwitch').addEventListener('click', function () {
    setMode(mode === 'in' ? 'up' : 'in');
  });

  /* --- checking --------------------------------------------------------- */
  function setError(input, text) {
    input.closest('.login__field').classList.toggle('is-bad', !!text);
    input.setAttribute('aria-invalid', text ? 'true' : 'false');
    document.getElementById(input.getAttribute('aria-describedby')).textContent = text;
    return !text;
  }
  function checkEmail() {
    var text = email.value.trim();
    return setError(email,
      !text ? 'Enter your email address.' :
      !email.checkValidity() ? 'That email doesn’t look right.' : '');
  }
  function checkPassword() {
    var text = password.value;
    return setError(password,
      !text ? 'Enter your password.' :
      mode === 'up' && text.length < MIN_NEW_PASSWORD ? 'At least ' + MIN_NEW_PASSWORD + ' characters, please.' : '');
  }

  // Once a field has been marked wrong, it is re-checked as it is fixed.
  email.addEventListener('input', function () {
    if (email.getAttribute('aria-invalid') === 'true') checkEmail();
  });
  password.addEventListener('input', function () {
    if (password.getAttribute('aria-invalid') === 'true') checkPassword();
  });

  /* --- signing in ------------------------------------------------------- */
  function setBusy(busy) {
    submit.disabled = google.disabled = busy;
    submit.textContent = busy ? MODES[mode].busy : MODES[mode].submit;
  }

  function attempt(details, doneText) {
    sendErr.textContent = '';
    setBusy(true);
    Promise.resolve(signIn(Object.assign({ mode: mode }, details))).then(function () {
      document.getElementById('loginDoneText').textContent = doneText;
      view.hidden = true;
      done.hidden = false;
      document.getElementById('loginDoneTitle').focus();
    }, function () {
      sendErr.textContent = 'That didn’t work. Check your details and try again.';
    }).then(function () { setBusy(false); });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = checkEmail();
    ok = checkPassword() && ok;
    if (!ok) {
      form.querySelector('[aria-invalid="true"]').focus();
      return;
    }
    var who = email.value.trim();
    attempt({ method: 'email', email: who, password: password.value },
      (mode === 'up' ? 'Account created for ' : 'Signed in as ') + who + '.');
  });

  google.addEventListener('click', function () {
    attempt({ method: 'google' }, 'Signed in with Google.');
  });

  return createDialog(root, {
    trigger: '[data-login]',
    reset: reset,
    focus: function () { return google; }
  });
}
