/**
 * Prompt text for POST /api/answer-vault/generate (server/routes/generate.js):
 * the system instruction, the user message with its Improve block
 * ("EXISTING DRAFT (improve this)") and the rule that rides with it, and the
 * Improve guard's one retry turn.
 *
 * ═══ THE APPLICATION TYPE ═══
 *
 * The request's `applicationType` (src/applicationTypes.js, completion plan
 * B6-1) chooses wording and nothing else: not the charge, not the Improve
 * guard. Job and Internship get the text every request has had, byte for
 * byte. College and Scholarship are an application essay or personal
 * statement, read by a committee rather than an employer, under the same rules
 * otherwise (ESSAY_WORDING). Missing, blank or unknown is Job
 * ({@link applicationTypeOf}).
 */
import { ALL_APPLICATION_TYPES, DEFAULT_APPLICATION_TYPE } from '../../src/applicationTypes.js';

/**
 * The request's application type: one of the catalog's ids, else Job.
 *
 * Every id in the catalog, listed or not: which types are listed is the front
 * ends' switch (src/applicationTypes.js), and an id only ever picks wording
 * here.
 *
 * @param {unknown} raw The body's `applicationType`, untrusted.
 * @returns {string} A catalog id.
 */
export function applicationTypeOf(raw) {
  const id = typeof raw === 'string' ? raw.trim() : '';
  return ALL_APPLICATION_TYPES.some((type) => type.id === id) ? id : DEFAULT_APPLICATION_TYPE;
}

/**
 * The essay types' words, where the job prompt names an employer, a role or a
 * job. A type that is not here (Job, Internship) gets the job prompt as it
 * always was.
 *
 *   - `reader`: who reads the essay (the job prompt's "the employer").
 *   - `context`: the rule on the application's context (the job prompt's
 *     "tie concrete details to that role").
 *   - `target`: what the Improve rule lets the essay name (the job rule's
 *     "the organisation and the role"). The clients put these in the context's
 *     header lines, which is what the Improve guard grounds them against
 *     (applicationTargets() in server/lib/improveGuard.js).
 */
const ESSAY_WORDING = Object.freeze({
  college: Object.freeze({
    assistant: 'college application assistant',
    reader: 'the admissions committee',
    context: 'tie concrete details to that school and program (its focus, what it asks of applicants). Do not invent facts about the school',
    target: 'the school and the program',
    placeholders: '"university name" or "this program"',
  }),
  scholarship: Object.freeze({
    assistant: 'scholarship application assistant',
    reader: 'the scholarship selection committee',
    context: 'tie concrete details to that scholarship (its purpose, its criteria). Do not invent facts about the scholarship or its sponsor',
    target: 'the scholarship and its sponsor',
    placeholders: '"scholarship name" or "this award"',
  }),
});

/** The essay wording for `applicationType`, or null for the job prompt. */
function essayWordingFor(applicationType) {
  return ESSAY_WORDING[applicationTypeOf(applicationType)] ?? null;
}

/** Top vault entries by word overlap with the application question (not full dump). */
export function pickRelevantAnswers(vaultAnswers, question) {
  const q = String(question || '').trim();
  const list = Array.isArray(vaultAnswers) ? vaultAnswers : [];
  if (!q) return '(No question provided.)';
  if (list.length === 0) return '(No saved answers in vault.)';

  const questionWords = new Set(
    q.toLowerCase().split(/\W+/).filter((w) => w.length > 4)
  );

  const scored = list.map((entry) => {
    const eq = String(entry?.question || '');
    const ea = String(entry?.answer || '');
    const entryWords = `${eq} ${ea}`.toLowerCase().split(/\W+/);
    const overlap = entryWords.filter((w) => questionWords.has(w)).length;
    return { question: eq, answer: ea, score: overlap };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((e) => `Q: ${e.question}\nA: ${e.answer}`)
    .join('\n\n');
}

/**
 * The system turn. `applicationType` is the request's (see the header); the
 * job prompt below is what Job, Internship and any unknown type get.
 */
export function buildGroqAnswerSystemInstruction(taskHint, styleHint, applicationType) {
  const hints = [taskHint, styleHint].filter(Boolean);
  const hintBlock = hints.length
    ? `\n\nFollow for this request:\n${hints.map((h) => `- ${h}`).join('\n')}`
    : '';

  const essay = essayWordingFor(applicationType);
  if (essay) {
    return `You are a ${essay.assistant}, writing an application essay or personal statement. Always write complete, polished answers in plain text only.
Never truncate. Never use "..." to stand in for content. Return only the essay text ${essay.reader} should read—no headings, bullet lists, markdown, labels, or meta commentary.${hintBlock}

Rules:
- Answer the QUESTION in the user message directly; do not answer a different question.
- When application context is provided, ${essay.context}.
- First person ("I"); include specific examples and an observable result when consistent with context; never invent experiences, achievements, awards, grades or numbers.
- About 160–230 words unless the question clearly needs less.
- Never use placeholders like ${essay.placeholders} as stand-ins.`;
  }

  return `You are a job application assistant. Always write complete, polished answers in plain text only.
Never truncate. Never use "..." to stand in for content. Return only the answer text the employer should read—no headings, bullet lists, markdown, labels, or meta commentary.${hintBlock}

Rules:
- Answer the QUESTION in the user message directly; do not answer a different question.
- When job context is provided, tie concrete details to that role (tools, domain). Do not invent employer facts.
- First person ("I"); include specific examples and a measurable or observable result when consistent with context; never fabricate numbers.
- About 160–230 words unless the question clearly needs less.
- Never use placeholders like "company name" or "this role" as stand-ins.`;
}

/**
 * The rule an Improve request carries, under the draft it improves.
 *
 * Improve is where invented figures came from (HANDOVER §7 item 32: one run
 * took a draft from one claim the resume does not back to four). The client's
 * task hint asks for "one concrete example or outcome" and for numbers "when
 * truthful", and with nothing true to hand the model supplied its own. This
 * says what the model may add: wording, structure, relevance. Not facts. It is
 * stated as overriding the hints because the hints arrive first, in the system
 * turn, and read as permission.
 *
 * Naming the organisation and role the application is FOR is allowed: an
 * answer to "why do you want to work here?" has to name "here". What is
 * forbidden is claiming things about the candidate, and the job context's
 * requirements are what the employer wants, not evidence the candidate has
 * them.
 *
 * Answer Studio's Improve only (`improve` below). A cover letter's draft is
 * the user's template, and its task hint asks for the company, the role and
 * the posting's requirements by name; this rule would fight it.
 *
 * "PROFILE" is the resume as this request carries it; the fabrication check
 * behind this rule (server/lib/improveGuard.js) grounds against the resume
 * corpus, the draft, and the organisation and role lines of the job context,
 * the same sources named here.
 *
 * This is the job rule (Job, Internship); an essay's is
 * {@link improveFactsRule}'s, the same rule in an essay's words.
 */
export const IMPROVE_FACTS_RULE = `When you improve the EXISTING DRAFT, keep its facts and improve how they are said. You may name the organisation and the role this application is for, as the JOB CONTEXT names them. Do not claim any experience, number, percentage, employer, job title, product or tool that appears in neither the PROFILE nor the EXISTING DRAFT: a requirement in the JOB CONTEXT is something the employer wants, not something the candidate has. This overrides any instruction above to add specifics, examples or measurable results: if the draft and the profile do not supply one, leave it out rather than invent it.`;

/**
 * The Improve rule for `applicationType`: IMPROVE_FACTS_RULE for Job,
 * Internship and any unknown type. An essay's names what an essay would
 * invent (activities, awards, grades) and calls the context the
 * application's, as its user message does; it allows and forbids the same
 * things.
 */
export function improveFactsRule(applicationType) {
  const essay = essayWordingFor(applicationType);
  if (!essay) return IMPROVE_FACTS_RULE;
  return `When you improve the EXISTING DRAFT, keep its facts and improve how they are said. You may name ${essay.target} this application is for, as the APPLICATION CONTEXT names them. Do not claim any experience, activity, achievement, award, grade, score, number, percentage, school, organisation or position that appears in neither the PROFILE nor the EXISTING DRAFT: a criterion in the APPLICATION CONTEXT is something ${essay.reader} looks for, not something the applicant has. This overrides any instruction above to add specifics, examples or measurable results: if the draft and the profile do not supply one, leave it out rather than invent it.`;
}

/**
 * The user message for a request that sends `question` (a `userPrompt` is
 * sent as it is).
 *
 * `improve` (Answer Studio's Improve: `kind: 'answer'` with a draft) adds
 * IMPROVE_FACTS_RULE after the draft. Without it the message is byte-identical
 * to what it was before the rule existed — cover letters, first drafts and
 * clients that send no `kind`.
 *
 * `applicationType` (see the header) changes two things for an essay: the
 * context is labelled APPLICATION CONTEXT rather than JOB CONTEXT, and the
 * Improve rule is the essay's. For Job, Internship and no type the message is
 * what it was.
 */
export function buildAnswerVaultUserContent({ relevantAnswers, profileBlock, jobContext, question, draft, improve = false, applicationType }) {
  const essay = essayWordingFor(applicationType);
  const improveRule = improve === true && draft ? `\n\n${improveFactsRule(applicationType)}` : '';
  return `
SAVED ANSWERS FOR CONTEXT:
${relevantAnswers}

${profileBlock}${essay ? 'APPLICATION CONTEXT' : 'JOB CONTEXT'}:
${jobContext || 'Not provided'}

QUESTION:
${question}

EXISTING DRAFT (improve this):
${draft || 'None'}${improveRule}
`.trim();
}

/** Claims quoted back in a retry, and the characters kept of each. */
const RETRY_MAX_CLAIMS = 6;
const RETRY_CLAIM_CHARS = 300;

/**
 * The follow-up turn for the one retry the Improve guard may make
 * (server/lib/improveGuard.js). It follows the model's own first answer in the
 * conversation, so "your improved answer" is unambiguous.
 *
 * The claims are the model's own sentences from that answer, sent back to the
 * same model inside the same request. They are never logged.
 *
 * @param {string[]} claims Sentences from the first answer that neither the
 *   resume nor the draft backs.
 * @param {string} [applicationType] The request's (see the header): an
 *   essay's retry names what an essay would invent, as improveFactsRule()
 *   does; Job, Internship and no type get the message as it always was.
 * @returns {string}
 */
export function buildImproveRetryMessage(claims, applicationType) {
  const list = (Array.isArray(claims) ? claims : [])
    .map((claim) => String(claim || '').trim())
    .filter(Boolean)
    .slice(0, RETRY_MAX_CLAIMS)
    .map((claim) => `- "${claim.slice(0, RETRY_CLAIM_CHARS)}"`)
    .join('\n');

  const essay = essayWordingFor(applicationType);
  if (essay) {
    return `These sentences in your improved essay state things that appear in neither the PROFILE nor the EXISTING DRAFT:
${list}

Rewrite the improved essay without those details. Do not replace them with other experiences, activities, awards, grades, scores or numbers. Keep everything that came from the profile or the draft, and you may still name ${essay.target} this application is for. Keep the length and tone, and return only the essay text.`;
  }

  return `These sentences in your improved answer state things that appear in neither the PROFILE nor the EXISTING DRAFT:
${list}

Rewrite the improved answer without those details. Do not replace them with other numbers, employers, job titles or tools. Keep everything that came from the profile or the draft, and you may still name the organisation and role this application is for. Keep the length and tone, and return only the answer text.`;
}
