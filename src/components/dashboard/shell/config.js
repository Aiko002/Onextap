// Workspace registry and plans for the signed-in dashboard (DEMO_DASH
// js/config.js). A workspace listed here gets a home card, a dock entry and a
// `#/<slug>` route; DashboardView decides which content renders in it.
//
// `id` is the name the rest of the app already uses for each tab — the popup
// opens the dashboard with `?view=vault` or `?view=jobs`, and the tour and
// application-type feature flags key on the same ids — so the slug is only
// the address bar's spelling.

export const OVERVIEW = { id: 'overview', slug: '', label: 'Overview', icon: 'overview' };

export const WORKSPACES = [
  {
    id: 'jobs',
    slug: 'job-matches',
    feature: 'jobMatches',
    label: 'Job Matches',
    icon: 'briefcase',
    description: 'Roles from the live job pool, ranked against your resume.',
  },
  {
    id: 'profiles',
    slug: 'my-profiles',
    feature: 'profiles',
    label: 'My Profiles',
    icon: 'user',
    description: 'The details autofill applies with — kept on this device, never on our servers.',
  },
  {
    id: 'vault',
    slug: 'answer-studio',
    feature: 'vault',
    labelKey: 'vaultLabel',
    label: 'Answer Studio',
    icon: 'pen',
    description: 'Draft and save answers to common application questions.',
  },
  {
    id: 'cover',
    slug: 'cover-letter',
    feature: 'coverLetter',
    labelKey: 'coverLetterLabel',
    label: 'Cover Letter',
    icon: 'file',
    description: 'Cover letters tailored to each application, ready to fill from the extension.',
  },
];

/**
 * The workspaces an application type turns on, with its labels applied.
 * @param {object} appConfig From getApplicationTypeConfig().
 */
export function workspacesFor(appConfig) {
  return WORKSPACES
    .filter((ws) => appConfig?.features?.[ws.feature] !== false)
    .map((ws) => ({ ...ws, label: (ws.labelKey && appConfig?.[ws.labelKey]) || ws.label }));
}

/**
 * The two plans, priced as the live landing page and PremiumModal price them.
 * `id` matches the dashboard's premium flag: 'premium' when verifyPremium()
 * says so, 'standard' otherwise.
 *
 * The feature lines are held to what server/index.js actually does. Premium's
 * one server-side difference is that credit-spending routes skip the charge
 * (chargeOneCredit / POST /api/credits/deduct return `remaining: Infinity`);
 * the model is the same for both tiers. So this copy does not repeat the
 * older "priority processing" / "smart field mapping" lines that
 * docs/ui-ux-design.md §10 (U2, U7) flags as unbuilt.
 */
export const PLANS = [
  {
    id: 'standard',
    name: 'Standard',
    price: '$0',
    period: 'forever',
    features: [
      'Unlimited autofill applications',
      'Multiple profiles, stored on this device',
      'Job matches ranked against your resume',
      '3 AI credits for answers and fit analyses',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$5',
    period: 'per month',
    features: [
      'Everything in Standard',
      'Unlimited AI answer generations',
      'Unlimited job-fit analyses',
      'Cancel anytime — no lock-in',
    ],
  },
];
