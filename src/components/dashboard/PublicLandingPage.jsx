import { useEffect } from 'react';
import { DASHBOARD_URL } from '../../config';

// Defined only by vite.dashboard.config.js (and so by `npm run dev`, which
// serves it at /app/): true in the web build and, never declared in the
// extension build, false there.
const WEB_LANDING = typeof __ONEXTAP_WEB_LANDING__ !== 'undefined' && __ONEXTAP_WEB_LANDING__;

/**
 * DashboardView's signed-out screen, which is a hand-over: the public landing
 * site (landing/, served at /) is the only signed-out page there is, with its
 * own sign-in window. The React landing page that used to live here is gone.
 *
 * Web build: back to / with the query kept (?extensionId=, ?view=), setting
 * the one-shot 'onextap:landing' flag so the landing page stays put even if a
 * stale session is still in storage, instead of forwarding the reader
 * straight back here. The landing page's inline script and
 * landing/src/onextap/session.js hold the same path and flag.
 *
 * Extension build (its own pages, index.html?mode=dashboard): on to the
 * website's landing page, DASHBOARD_URL. Where that is this very page (the
 * extension's dev server, when VITE_DASHBOARD_URL points at it) there is
 * nowhere to go, and it renders nothing rather than loop.
 *
 * Takes no props.
 */
function PublicLandingPage() {
  useEffect(() => {
    const here = new URL(window.location.href);
    const landing = new URL(WEB_LANDING ? '/' : DASHBOARD_URL, here);
    if (landing.origin === here.origin && landing.pathname === here.pathname) return;
    if (WEB_LANDING) {
      try {
        sessionStorage.setItem('onextap:landing', '1');
      } catch {
        // No sessionStorage: then the landing page sends the reader back here
        // only while a session is still stored, which signing out removes.
      }
      landing.search = here.search;
    }
    window.location.replace(landing.href);
  }, []);
  return null;
}

export default PublicLandingPage;
