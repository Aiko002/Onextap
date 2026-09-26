/* ===========================================================================
   Onextap — where the landing site hands over to the dashboard
   The dashboard is the React app, served at /app/ (vite.dashboard.config.js
   puts it there). Three places agree on that path, and on the one-shot
   sessionStorage flag 'onextap:landing' the dashboard sets when it finds no
   one signed in and sends the reader back here, and they cannot share code:
   this file, the inline script at the top of landing/index.html (it has to
   run before any module can), and
   src/components/dashboard/PublicLandingPage.jsx (the dashboard's side).
   =========================================================================== */
export var APP_PATH = '/app/';

/* On to the dashboard, keeping the query the extension and checkout rely on
   (?extensionId=, ?view=, ?payment=). It replaces this history entry: Back
   from the dashboard would only land here and be forwarded straight on. */
export function goToApp() {
  location.replace(APP_PATH + location.search);
}
