import { openChromeWebStore } from '../../../src/extensionClient.js';

/* ===========================================================================
   Onextap — where the page's calls to action go
   The design's buttons stay exactly as drawn; this gives the ones that were
   placeholders (#top, #how, a bare button) somewhere real to go, the same
   places the previous landing page sent them:

   - every "Add to Chrome": the extension's Chrome Web Store listing, in a
     new tab (src/config.js holds the URL);
   - both plans' buttons in CH 04, Pricing: the sign-in window. Premium is
     bought from inside the dashboard (its Premium window starts checkout
     with the account's token), so either way the first step is an account.

   One listener, in the capture phase, so it runs before the anchors' own
   smooth scroll to their placeholder targets (shared/lib/motion.js) and
   stops it. A button missing from a page (the company pages have only the
   header's) simply never matches.
   =========================================================================== */
var TO_STORE = [
  '.hud__cta',                             // header, every page
  '#hero .truth__actions .btn--solid',     // CH 00
  '#close .close__actions .btn--solid'     // CH 05
].join(',');
var TO_ACCOUNT = '#price .plan .btn';      // CH 04: "Get started free", "Upgrade to Premium"

export function wireCallsToAction(loginWindow) {
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var store = e.target.closest(TO_STORE);
    var account = !store && e.target.closest(TO_ACCOUNT);
    if (!store && !account) return;
    e.preventDefault();
    e.stopPropagation();
    if (store) openChromeWebStore();
    else loginWindow.open();
  }, true);
}
