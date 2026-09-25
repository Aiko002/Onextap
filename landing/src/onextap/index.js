/* ===========================================================================
   Onextap — what plugs the landing site into the product
   The design (everything else under landing/) is kept as it was drawn; its
   seams take these in (src/main.js, src/pages/sub-page.js and
   src/pages/contact/contact.js are the only files that call them):

     sign-in.js           the sign-in window's real accounts (Supabase)
     calls-to-action.js   Add to Chrome → the Web Store; the plans → sign-in
     feedback.js          the Contact page's feedback → the support inbox
     session.js           the hand-over to the dashboard at /app/

   It may import from the React app's src/ (auth, config, logger), never the
   other way round.
   =========================================================================== */
import { afterSignIn, loginOptions } from './sign-in.js';
import { wireCallsToAction } from './calls-to-action.js';

export { loginOptions };
export { sendFeedback } from './feedback.js';

// Everything a page's sign-in window, and the buttons around it, need.
export function connect(loginWindow) {
  afterSignIn(loginWindow);
  wireCallsToAction(loginWindow);
}
