import { prefersReducedMotion } from '../../shared/lib/motion.js';
import markup from './cookie-consent.html?raw';
import '../../shared/styles/dialog.css';
import './cookie-consent.css';

export { markup };

/* --- the cookie note (Onextap) ---------------------------------------------
   On a first visit it is dealt in at the foot of the screen, a beat after
   the page. "Accept all" or "Essential only" is remembered in this browser
   (localStorage, under KEY, with the date) and the note goes, not to come
   back until the wording of the choice changes (bump VERSION).

   Nothing optional runs on the site today, so the choice gates nothing yet.
   Anything optional added later must ask first: readConsent() is 'all',
   'essential', or null before a choice, and each choice is announced on the
   document as an 'onextap:consent' event (detail: { choice }).

   Without storage (a private window that refuses it) the note still works
   for the visit, and asks again next time. */
var KEY = 'onextap_cookie_consent';
var VERSION = 1;
var CHOICES = { all: true, essential: true };
var DEAL_IN_MS = 700;

export function readConsent() {
  try {
    var saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && saved.v === VERSION && CHOICES[saved.choice]) return saved.choice;
  } catch (e) { /* no storage, or not ours: ask */ }
  return null;
}

export function initCookieConsent() {
  var root = document.getElementById('cookieConsent');
  if (readConsent()) return;

  root.hidden = false;
  // Laid out first, hidden, so the entrance has somewhere to come from.
  setTimeout(function () {
    requestAnimationFrame(function () { root.classList.add('is-in'); });
  }, prefersReducedMotion ? 0 : DEAL_IN_MS);

  root.addEventListener('click', function (e) {
    var button = e.target.closest && e.target.closest('[data-consent]');
    if (button) choose(button.getAttribute('data-consent'));
  });

  function choose(choice) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: VERSION, choice: choice, at: new Date().toISOString() }));
    } catch (e) { /* remembered for this visit only */ }
    document.dispatchEvent(new CustomEvent('onextap:consent', { detail: { choice: choice } }));

    // Focus leaves with the note rather than vanishing with it.
    if (root.contains(document.activeElement)) document.activeElement.blur();
    root.classList.remove('is-in');
    root.classList.add('is-out');
    var gone = false;
    function hide() {
      if (gone) return;
      gone = true;
      root.hidden = true;
    }
    if (prefersReducedMotion || document.documentElement.classList.contains('no-motion')) hide();
    else {
      root.addEventListener('transitionend', hide, { once: true });
      setTimeout(hide, 400);   // in case the transition never runs (a background tab)
    }
  }
}
