/* The dashboard under an application type (completion plan B6-1): which
   workspaces it shows, what it calls them, and what Answer Studio and the
   Cover Letter workspace ask the AI for.

   The type is an entry of src/applicationTypes.js, passed in: main.js reads
   it with getApplicationType() (this browser's choice, never the
   extension's) and the workspaces get it on their context. With only Job
   listed, everything here gives back what the dashboard said before types
   existed, which test/web/applicationType.test.js holds byte for byte.

   Pure and import-free, so that test can load it; main.js and the
   workspaces import through @app, which Node cannot resolve. */

// What a type renames, as the popup's tabs do: Answer Studio and Cover
// Letter take its labels, and the cover letters' plural is its documentLabel.
// Every other workspace keeps config.js's words.
const NAMED_BY_TYPE = {
  'answer-studio': (type) => ({ label: type.vaultLabel }),
  'cover-letter': (type) => ({
    label: type.coverLetterLabel,
    description: `${type.documentLabel} tailored to each application.`,
  }),
};

/**
 * The workspaces a type shows, named as it names them: each workspace in
 * config.js says which of the type's `features` turns it on (`feature`).
 * Copies; config.js is left as it is.
 * @param {{ features: Record<string, boolean> }} type
 * @param {Array<{ id: string, feature: string }>} list config.js's workspaces
 */
export function workspacesFor(type, list) {
  return list
    .filter((ws) => type.features?.[ws.feature] === true)
    .map((ws) => ({ ...ws, ...NAMED_BY_TYPE[ws.id]?.(type) }));
}

/**
 * Where a route (#/<id>) goes under the type. `ws` null is Overview, as for
 * an id that names no workspace; `hidden` says the id names one the type
 * turns off (a deep link, or the popup's ?view=jobs under College), so the
 * address can be put back on Overview.
 * @param {string} id
 * @param {Array<{ id: string }>} shown workspacesFor()'s list
 * @param {Array<{ id: string }>} all config.js's workspaces
 */
export function routeTo(id, shown, all) {
  const ws = shown.find((w) => w.id === id) ?? null;
  return { ws, hidden: !ws && all.some((w) => w.id === id) };
}

/** "A, B, C and D". */
export function listPhrase(words) {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : (words[0] ?? '');
}

/** The picker's icon for each type (js/icons.js). */
export const TYPE_ICONS = {
  job: 'briefcase',
  college: 'school',
  scholarship: 'award',
  internship: 'flag',
};

// ---------- what the AI is asked for ----------

// The types whose writing is an essay: what it is, who reads it, and what it
// is for, where a job's hint says "the company and role". Any other type
// (Job, Internship) is asked for what a job always was.
const ESSAYS = {
  college: { essay: 'personal statement', readers: 'an admissions committee', target: 'the programme', targets: 'programmes' },
  scholarship: { essay: 'scholarship essay', readers: 'a selection committee', target: 'the scholarship', targets: 'scholarships' },
};

const LENGTH_RULE = 'Target length: 170-240 words unless the question clearly needs less.';
const IMPACT_RULE = 'Include at least one measurable or observable impact/result. Prefer numbers/percentages/timeframes when truthful; never invent facts.';
// An essay is judged on what an experience showed, more than on a metric.
const ESSAY_RULE = 'Ground it in at least one specific experience and what it taught or changed. Use numbers only when truthful; never invent facts.';

/**
 * Answer Studio's task hint (`taskHint` in POST /api/answer-vault/generate).
 * @param {{ id: string }} type
 * @param {{ hasDraft: boolean, hasJobContext: boolean }} what Improve (a draft
 *   is there) or Generate; a pasted description or not.
 */
export function answerTaskHint(type, { hasDraft, hasJobContext }) {
  const e = ESSAYS[type?.id];
  if (!e) {
    if (hasDraft) {
      return hasJobContext
        ? `Rewrite the candidate draft to target the job description and company. Answer the application question directly. Tone: human, natural, confident. ${LENGTH_RULE} First person. At least two concrete details tied to the role; weave in 2-4 phrases from the job description. ${IMPACT_RULE} No filler, cliches, headings, or bullet points.`
        : `Improve the candidate draft so it is stronger and clearer. Answer the application question directly. Preserve the candidate's intent; add specificity and one concrete example or outcome. ${LENGTH_RULE} First person. ${IMPACT_RULE} No filler, cliches, headings, or bullet points.`;
    }
    return hasJobContext
      ? `Write a tailored answer to the application question. Use the job description and company to ground specifics. ${LENGTH_RULE} First person. At least two concrete details; reflect 2-4 ideas from the job description. ${IMPACT_RULE} Interview-ready, not a template. No filler, cliches, headings, or bullet points.`
      : `Write a strong, portable first-draft answer that works across employers. Target length: 160-230 words unless the question clearly needs less. First person. At least one concrete skill and one measurable or observable result. ${IMPACT_RULE} Specific enough to sound real; broadly reusable. No filler, cliches, headings, or bullet points.`;
  }
  // Improve adds no facts (the server's IMPROVE_FACTS_RULE says so too), so
  // an essay's Improve asks for specificity from what is already there.
  if (hasDraft) {
    return hasJobContext
      ? `Rewrite the applicant's draft as a ${e.essay} answer addressed to ${e.readers}, aimed at ${e.target} the description sets out. Answer the essay question directly. Tone: human, reflective, confident. ${LENGTH_RULE} First person. At least two concrete details tied to ${e.target}; weave in 2-4 ideas from its description. ${ESSAY_RULE} No filler, cliches, headings, or bullet points.`
      : `Improve the applicant's draft so it reads as a stronger, clearer ${e.essay} answer for ${e.readers}. Answer the essay question directly. Preserve the applicant's intent; add specificity from what the draft and profile already say. ${LENGTH_RULE} First person. ${ESSAY_RULE} No filler, cliches, headings, or bullet points.`;
  }
  return hasJobContext
    ? `Write a ${e.essay} answer to the essay question, addressed to ${e.readers}. Use the description of ${e.target} to ground specifics. ${LENGTH_RULE} First person. At least two concrete details; reflect 2-4 ideas from the description. ${ESSAY_RULE} Personal and specific, not a template. No filler, cliches, headings, or bullet points.`
    : `Write a strong, portable first-draft ${e.essay} answer that works across ${e.targets}, addressed to ${e.readers}. Target length: 160-230 words unless the question clearly needs less. First person. At least one specific experience and what it taught or changed. Use numbers only when truthful; never invent facts. Specific enough to sound real; broadly reusable. No filler, cliches, headings, or bullet points.`;
}

/**
 * The Cover Letter workspace's task hint, for personalising a template.
 * @param {{ id: string }} type
 */
export function coverLetterTaskHint(type) {
  const e = ESSAYS[type?.id];
  if (!e) {
    return 'Rewrite the cover letter template for this specific opportunity. Preserve the candidate\'s writing style and voice — do not make it generic. Reference the company and role by name. Weave in 2-4 key requirements from the description. Keep length within ±10% of the original. First person. No headings or bullet points.';
  }
  return `Rewrite the ${e.essay} template for ${e.target} described below, addressed to ${e.readers}. Preserve the applicant's writing style and voice — do not make it generic. Reference ${e.target} by name. Weave in 2-4 of the qualities or aims the description asks for. Keep length within ±10% of the original. First person. No headings or bullet points.`;
}
