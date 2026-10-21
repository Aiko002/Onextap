/* global __ONEXTAP_APPLICATION_TYPES__ */
/**
 * Application type configuration — controls labels and visible features
 * in the dashboard and extension popup.
 *
 * Every type must declare every `features` key. A missing key reads as
 * `undefined`, which is falsy, so a forgotten flag silently hides a tab rather
 * than failing loudly — `jobMatches` is the flag most recently added, and it is
 * false for college and scholarship because the ranked pool holds job postings
 * only. Each surface hides what a type turns off: the popup its tabs
 * (src/components/popup/PopupView.jsx), the website dashboard its workspaces
 * (web/dashboard/js/), falling back to Overview.
 *
 * ═══ THE SWITCH: LISTED_TYPE_IDS ═══
 *
 * ALL_APPLICATION_TYPES is every type the product knows; LISTED_TYPE_IDS says
 * which of them users see. Job is the only one listed. Turning College,
 * Scholarship and Internship on is uncommenting their ids there, with no
 * other change (completion plan B6-1): each surface shows its picker only
 * when more than one type is listed (`hasTypeChoice()`), and both readers fall
 * back to the first listed entry:
 *
 *   - `getApplicationTypeConfig(id)` returns APPLICATION_TYPES[0] for an id it
 *     does not list, so every 'college' left in stored data — a cover letter
 *     template carries its `applicationType` — renders as Job.
 *   - `getApplicationType()` in applicationTypeStorage.js validates the stored
 *     id against APPLICATION_TYPES and returns DEFAULT_APPLICATION_TYPE when it
 *     misses, so an account that picked College while the types were listed
 *     is put back on Job rather than stranded in a mode with no control.
 *
 * `setApplicationType()` throws on anything not listed, which is why nothing
 * can write an unlisted id back. Job is always listed.
 *
 * The extension's list is bundled into the store zip: listing a type in the
 * extension is a new store release, on the website a deploy.
 *
 * ═══ THE TEST-TIME OVERRIDE ═══
 *
 * `__ONEXTAP_APPLICATION_TYPES__` is a Vite `define`: null, unless the build
 * or dev server was started with ONEXTAP_E2E_APPLICATION_TYPES set
 * (scripts/applicationTypesOverride.js, which a release build refuses). The
 * e2e suites use it to run with every type listed, so turning them on is
 * already tested. Outside Vite (node --test, the server) the name is not
 * defined and the switch applies.
 */
export const DEFAULT_APPLICATION_TYPE = 'job';

export const ALL_APPLICATION_TYPES = [
  {
    id: 'job',
    label: 'Job',
    shortLabel: 'Job',
    description: 'Job applications, cover letters, and role-specific answers.',
    features: { profiles: true, vault: true, coverLetter: true, autofill: true, jobMatches: true },
    coverLetterLabel: 'Cover Letter',
    vaultLabel: 'Answer Studio',
    documentLabel: 'Cover letters',
  },
  {
    id: 'college',
    label: 'College / University',
    shortLabel: 'College',
    description: 'Undergraduate and graduate school applications.',
    features: { profiles: true, vault: true, coverLetter: true, autofill: true, jobMatches: false },
    coverLetterLabel: 'Personal Statement',
    vaultLabel: 'Application Essays',
    documentLabel: 'Personal statements',
  },
  {
    id: 'scholarship',
    label: 'Scholarship',
    shortLabel: 'Scholarship',
    description: 'Scholarship essays, statements, and supporting documents.',
    features: { profiles: true, vault: true, coverLetter: true, autofill: true, jobMatches: false },
    coverLetterLabel: 'Scholarship Essay',
    vaultLabel: 'Essay Answers',
    documentLabel: 'Essays',
  },
  {
    id: 'internship',
    label: 'Internship',
    shortLabel: 'Internship',
    description: 'Internship applications with tailored cover letters.',
    features: { profiles: true, vault: true, coverLetter: true, autofill: true, jobMatches: true },
    coverLetterLabel: 'Cover Letter',
    vaultLabel: 'Answer Studio',
    documentLabel: 'Cover letters',
  },
];

// The switch. Uncomment an id to list that type on both surfaces.
const LISTED_TYPE_IDS = [
  'job',
  // 'college',
  // 'scholarship',
  // 'internship',
];

/**
 * The catalog's entries for `ids`, in the catalog's order. Unknown ids are
 * dropped, and Job is always among them.
 *
 * @param {string[]} ids
 */
export function listApplicationTypes(ids) {
  const wanted = new Set([DEFAULT_APPLICATION_TYPE, ...(Array.isArray(ids) ? ids : [])]);
  return ALL_APPLICATION_TYPES.filter((t) => wanted.has(t.id));
}

const override = typeof __ONEXTAP_APPLICATION_TYPES__ === 'undefined' ? null : __ONEXTAP_APPLICATION_TYPES__;

/** The types users see: the switch above, or the e2e override. */
export const APPLICATION_TYPES = listApplicationTypes(override ?? LISTED_TYPE_IDS);

/** Whether a surface shows its type picker: only when more than one type is listed. */
export function hasTypeChoice(types = APPLICATION_TYPES) {
  return types.length > 1;
}

export function getApplicationTypeConfig(typeId, types = APPLICATION_TYPES) {
  return types.find((t) => t.id === typeId) || types[0];
}
