/**
 * The application type's wording in the Answer Studio and cover-letter
 * prompts (server/prompts/answerVault.js), completion plan B6-1.
 *
 * The body's `applicationType` chooses wording and nothing else. Job and
 * Internship get the text every request has had, byte for byte; College and
 * Scholarship ask for an application essay or personal statement, read by a
 * committee, with no invented facts. Missing, blank, unknown or not a string
 * is Job. The route's half (it passes the body's type here) is in
 * applicationTypeRoute.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applicationTypeOf,
  buildGroqAnswerSystemInstruction,
  buildAnswerVaultUserContent,
  improveFactsRule,
  IMPROVE_FACTS_RULE,
} from '../../server/prompts/answerVault.js';
import { ALL_APPLICATION_TYPES } from '../../src/applicationTypes.js';

const TASK = 'Rewrite the draft.';
const STYLE = 'Warm and direct.';

/** The system instruction as it was before application types reached the server. */
const JOB_SYSTEM = `You are a job application assistant. Always write complete, polished answers in plain text only.
Never truncate. Never use "..." to stand in for content. Return only the answer text the employer should read—no headings, bullet lists, markdown, labels, or meta commentary.

Follow for this request:
- ${TASK}
- ${STYLE}

Rules:
- Answer the QUESTION in the user message directly; do not answer a different question.
- When job context is provided, tie concrete details to that role (tools, domain). Do not invent employer facts.
- First person ("I"); include specific examples and a measurable or observable result when consistent with context; never fabricate numbers.
- About 160–230 words unless the question clearly needs less.
- Never use placeholders like "company name" or "this role" as stand-ins.`;

const JOB_SYSTEM_NO_HINTS = JOB_SYSTEM.replace(`\n\nFollow for this request:\n- ${TASK}\n- ${STYLE}`, '');

const PARTS = {
  relevantAnswers: 'Q: Why us?\nA: Because.',
  profileBlock: 'PROFILE (brief):\nCore skills: Node.js\n\n',
  jobContext: 'Organization: Acme\nRole: Engineer\n\nWe build robots.',
  question: 'Why do you want this?',
};
const DRAFT = 'I like robots.';

/** The user message as it was, with and without the Improve rule. */
const JOB_USER = `SAVED ANSWERS FOR CONTEXT:
${PARTS.relevantAnswers}

${PARTS.profileBlock}JOB CONTEXT:
${PARTS.jobContext}

QUESTION:
${PARTS.question}

EXISTING DRAFT (improve this):
${DRAFT}`;

const JOB_IMPROVE_RULE = `When you improve the EXISTING DRAFT, keep its facts and improve how they are said. You may name the organisation and the role this application is for, as the JOB CONTEXT names them. Do not claim any experience, number, percentage, employer, job title, product or tool that appears in neither the PROFILE nor the EXISTING DRAFT: a requirement in the JOB CONTEXT is something the employer wants, not something the candidate has. This overrides any instruction above to add specifics, examples or measurable results: if the draft and the profile do not supply one, leave it out rather than invent it.`;

const ESSAY_TYPES = ['college', 'scholarship'];
const JOB_TYPES = ['job', 'internship'];

// ------------------------------------------------------------------
// The type, from an untrusted body field
// ------------------------------------------------------------------
test('every catalog id is its own type', () => {
  for (const { id } of ALL_APPLICATION_TYPES) assert.equal(applicationTypeOf(id), id);
  assert.equal(applicationTypeOf('  college '), 'college', 'surrounding whitespace is not part of an id');
});

test('missing, blank, unknown or not a string is Job', () => {
  for (const raw of [undefined, null, '', '   ', 'College', 'colege', 'essay', 'constructor', '__proto__', 'toString']) {
    assert.equal(applicationTypeOf(raw), 'job', JSON.stringify(raw) ?? String(raw));
  }
  for (const raw of [42, true, {}, { id: 'college' }, ['college'], () => 'college']) {
    assert.equal(applicationTypeOf(raw), 'job', typeof raw);
  }
});

test('the catalog the server reads lists both essay types and both job types', () => {
  const ids = ALL_APPLICATION_TYPES.map((t) => t.id);
  for (const id of [...ESSAY_TYPES, ...JOB_TYPES]) assert.ok(ids.includes(id), id);
});

test('src/applicationTypes.js stays importable by the server: no imports at all', () => {
  // The server imports it from src/ directly, as it does
  // src/coverLetterCredits.js: an import added there would follow it into the
  // server bundle.
  const source = readFileSync(new URL('../../src/applicationTypes.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\brequire\(/);
});

// ------------------------------------------------------------------
// Job and Internship: unchanged, byte for byte
// ------------------------------------------------------------------
test('the system instruction for Job, Internship and no type is the one it always was', () => {
  for (const type of [undefined, null, '', 'unknown', 42, ...JOB_TYPES]) {
    assert.equal(buildGroqAnswerSystemInstruction(TASK, STYLE, type), JOB_SYSTEM, String(type));
    assert.equal(buildGroqAnswerSystemInstruction('', '', type), JOB_SYSTEM_NO_HINTS, String(type));
  }
  assert.equal(buildGroqAnswerSystemInstruction(TASK, STYLE), JOB_SYSTEM, 'two arguments, as before');
});

test('the user message and the Improve rule for Job, Internship and no type are unchanged', () => {
  assert.equal(IMPROVE_FACTS_RULE, JOB_IMPROVE_RULE);
  for (const applicationType of [undefined, 'unknown', ...JOB_TYPES]) {
    assert.equal(improveFactsRule(applicationType), IMPROVE_FACTS_RULE, String(applicationType));
    assert.equal(buildAnswerVaultUserContent({ ...PARTS, draft: DRAFT, applicationType }), JOB_USER, String(applicationType));
    assert.equal(
      buildAnswerVaultUserContent({ ...PARTS, draft: DRAFT, improve: true, applicationType }),
      `${JOB_USER}\n\n${IMPROVE_FACTS_RULE}`,
      String(applicationType),
    );
  }
});

// ------------------------------------------------------------------
// College and Scholarship: an essay, for a committee
// ------------------------------------------------------------------
const READERS = { college: 'the admissions committee', scholarship: 'the scholarship selection committee' };

for (const type of ESSAY_TYPES) {
  test(`${type}: the system instruction asks for an essay or personal statement, read by ${READERS[type]}`, () => {
    const system = buildGroqAnswerSystemInstruction(TASK, STYLE, type);
    assert.match(system, /application essay or personal statement/);
    assert.ok(system.includes(`text ${READERS[type]} should read`), 'names who reads it');
    for (const jobWord of ['job application assistant', 'employer', 'that role', '"this role"']) {
      assert.ok(!system.includes(jobWord), `no "${jobWord}"`);
    }
    // No invented facts: what an essay could be tempted to make up.
    assert.match(system, /never invent experiences, achievements, awards, grades or numbers/);
    assert.match(system, /Do not invent facts about/);
  });

  test(`${type}: every other rule is the job prompt's`, () => {
    const system = buildGroqAnswerSystemInstruction(TASK, STYLE, type);
    for (const line of [
      'Always write complete, polished answers in plain text only.',
      'Never truncate. Never use "..." to stand in for content.',
      '—no headings, bullet lists, markdown, labels, or meta commentary.',
      `\n\nFollow for this request:\n- ${TASK}\n- ${STYLE}\n\nRules:\n`,
      '- Answer the QUESTION in the user message directly; do not answer a different question.',
      '- First person ("I"); include specific examples',
      '- About 160–230 words unless the question clearly needs less.',
      '- Never use placeholders like',
    ]) {
      assert.ok(system.includes(line), line);
    }
    assert.ok(!buildGroqAnswerSystemInstruction('', '', type).includes('Follow for this request'));
  });

  test(`${type}: the user message calls its context the application's, and the Improve rule follows it`, () => {
    const plain = buildAnswerVaultUserContent({ ...PARTS, draft: DRAFT, applicationType: type });
    assert.equal(plain, JOB_USER.replace('JOB CONTEXT:', 'APPLICATION CONTEXT:'), 'only the label differs');

    const rule = improveFactsRule(type);
    assert.notEqual(rule, IMPROVE_FACTS_RULE);
    const improved = buildAnswerVaultUserContent({ ...PARTS, draft: DRAFT, improve: true, applicationType: type });
    assert.equal(improved, `${plain}\n\n${rule}`, 'after the draft, as for a job');
  });

  test(`${type}: the Improve rule still forbids new facts, and names no employer or job`, () => {
    const rule = improveFactsRule(type);
    // The same shape as the job rule, which the Improve guard
    // (server/lib/improveGuard.js) is the check behind.
    for (const words of ['EXISTING DRAFT', 'PROFILE', 'APPLICATION CONTEXT', 'experience', 'number', 'award', 'grade',
      'not something the applicant has', 'This overrides any instruction above to add specifics, examples or measurable results',
      'leave it out rather than invent it']) {
      assert.ok(rule.includes(words), words);
    }
    assert.ok(rule.includes(READERS[type].replace(/^the /, '')), 'names who it is for');
    for (const jobWord of ['JOB CONTEXT', 'employer', 'job title', 'candidate']) assert.ok(!rule.includes(jobWord), jobWord);
    assert.match(rule, /You may name the .+ this application is for, as the APPLICATION CONTEXT names them\./);
  });
}

test('College and Scholarship differ only where the reader and the institution do', () => {
  const college = buildGroqAnswerSystemInstruction(TASK, STYLE, 'college');
  const scholarship = buildGroqAnswerSystemInstruction(TASK, STYLE, 'scholarship');
  assert.notEqual(college, scholarship);
  assert.match(college, /college application assistant/);
  assert.match(scholarship, /scholarship application assistant/);
});

test('without `improve` an essay message has no rule either, draft or not', () => {
  for (const type of ESSAY_TYPES) {
    for (const extra of [{ draft: DRAFT }, { draft: DRAFT, improve: false }, { draft: '' }, { draft: '', improve: true }]) {
      const content = buildAnswerVaultUserContent({ ...PARTS, ...extra, applicationType: type });
      assert.ok(!content.includes(improveFactsRule(type)), `${type} ${JSON.stringify(extra)}`);
      assert.ok(content.endsWith(`EXISTING DRAFT (improve this):\n${extra.draft || 'None'}`));
    }
  }
});
