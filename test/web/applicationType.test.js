/**
 * The website dashboard under each application type (completion plan B6-1):
 * which workspaces a type shows (its `features`), what it names them, where a
 * route to one it hides lands, the first-run tour's steps, and the task hint
 * Answer Studio and the Cover Letter workspace send. The types come from the
 * catalog, all four listed the way the e2e override lists them; with Job the
 * dashboard has to read exactly as it did before types existed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALL_APPLICATION_TYPES, getApplicationTypeConfig, listApplicationTypes } from '../../src/applicationTypes.js';
import { legacyViews, workspaces } from '../../web/dashboard/js/config.js';
import { icon } from '../../web/dashboard/js/icons.js';
import {
  TYPE_ICONS,
  answerTaskHint,
  coverLetterTaskHint,
  listPhrase,
  routeTo,
  workspacesFor,
} from '../../web/dashboard/js/application-type.js';
import { tourSteps } from '../../web/dashboard/js/tour.js';

const ALL = listApplicationTypes(ALL_APPLICATION_TYPES.map((t) => t.id));
const type = (id) => getApplicationTypeConfig(id, ALL);
const ids = (list) => list.map((ws) => ws.id);
const labels = (list) => list.map((ws) => ws.label);

// ---------- which workspaces, named how ----------

test('every workspace names a feature flag that every type declares', () => {
  for (const ws of workspaces) {
    assert.equal(typeof ws.feature, 'string', ws.id);
    for (const t of ALL) assert.equal(typeof t.features[ws.feature], 'boolean', `${t.id}.features.${ws.feature} for ${ws.id}`);
  }
  assert.deepEqual(Object.fromEntries(workspaces.map((ws) => [ws.id, ws.feature])), {
    'job-matches': 'jobMatches',
    'my-profiles': 'profiles',
    'answer-studio': 'vault',
    'cover-letter': 'coverLetter',
  });
});

test('Job: every workspace, exactly as config.js has it', () => {
  assert.deepEqual(workspacesFor(type('job'), workspaces), workspaces);
  assert.deepEqual(labels(workspacesFor(type('job'), workspaces)), ['Job Matches', 'My Profiles', 'Answer Studio', 'Cover Letter']);
  assert.equal(workspacesFor(type('job'), workspaces).at(-1).description, 'Cover letters tailored to each application.');
});

test('Internship: the same four, under the same names', () => {
  assert.deepEqual(workspacesFor(type('internship'), workspaces), workspaces);
});

test('College: no Job Matches, and its own names for the writing workspaces', () => {
  const shown = workspacesFor(type('college'), workspaces);
  assert.deepEqual(ids(shown), ['my-profiles', 'answer-studio', 'cover-letter']);
  assert.deepEqual(labels(shown), ['My Profiles', 'Application Essays', 'Personal Statement']);
  assert.equal(shown.at(-1).description, 'Personal statements tailored to each application.');
});

test('Scholarship: no Job Matches, and its own names for the writing workspaces', () => {
  const shown = workspacesFor(type('scholarship'), workspaces);
  assert.deepEqual(ids(shown), ['my-profiles', 'answer-studio', 'cover-letter']);
  assert.deepEqual(labels(shown), ['My Profiles', 'Essay Answers', 'Scholarship Essay']);
  assert.equal(shown.at(-1).description, 'Essays tailored to each application.');
});

test('a feature a type turns off hides its workspace, whichever it is', () => {
  const job = type('job');
  const noVault = { ...job, features: { ...job.features, vault: false } };
  assert.deepEqual(ids(workspacesFor(noVault, workspaces)), ['job-matches', 'my-profiles', 'cover-letter']);
  const nothing = { ...job, features: Object.fromEntries(Object.keys(job.features).map((k) => [k, false])) };
  assert.deepEqual(workspacesFor(nothing, workspaces), []);
});

test('config.js is never rewritten by a type', () => {
  const before = structuredClone(workspaces);
  for (const t of ALL) workspacesFor(t, workspaces);
  assert.deepEqual(workspaces, before);
});

// ---------- routes ----------

test('a route to a workspace the type hides falls back to Overview, and says it was hidden', () => {
  const college = workspacesFor(type('college'), workspaces);
  assert.deepEqual(routeTo('job-matches', college, workspaces), { ws: null, hidden: true });
  // The popup's ?view=jobs becomes #/job-matches first (main.js), so it lands the same way.
  assert.deepEqual(routeTo(legacyViews.jobs, college, workspaces), { ws: null, hidden: true });
  assert.equal(routeTo('cover-letter', college, workspaces).ws.label, 'Personal Statement');
});

test('a route under Job opens its workspace; Overview and unknown ids are not "hidden"', () => {
  const job = workspacesFor(type('job'), workspaces);
  assert.equal(routeTo('job-matches', job, workspaces).ws.id, 'job-matches');
  assert.deepEqual(routeTo('', job, workspaces), { ws: null, hidden: false });
  assert.deepEqual(routeTo('overview', job, workspaces), { ws: null, hidden: false });
  assert.deepEqual(routeTo('nonsense', job, workspaces), { ws: null, hidden: false });
});

// ---------- words ----------

test('listPhrase: commas, then "and"', () => {
  assert.equal(listPhrase(['A', 'B', 'C', 'D']), 'A, B, C and D');
  assert.equal(listPhrase(['A', 'B']), 'A and B');
  assert.equal(listPhrase(['A']), 'A');
  assert.equal(listPhrase([]), '');
});

test('every type in the catalog has a picker icon the dashboard draws', () => {
  for (const t of ALL) {
    assert.equal(typeof TYPE_ICONS[t.id], 'string', t.id);
    assert.match(icon(TYPE_ICONS[t.id]), /<(path|rect|circle)/, `${t.id}: ${TYPE_ICONS[t.id]}`);
  }
});

// ---------- the tour ----------

// The tour as it was before types: Job has to give exactly this.
const JOB_TOUR = [
  {
    target: '#nav',
    title: 'Your workspaces',
    text: 'Job Matches, My Profiles, Answer Studio and Cover Letter. Everything you set up here is what the extension fills applications with.',
  },
  {
    target: '.nav-link[data-id="my-profiles"]',
    title: 'Start with your profile',
    text: 'Add your details, education, experience and skills — or upload a resume and they are filled in for you.',
  },
  {
    target: '.nav-link[data-id="answer-studio"]',
    title: 'Answer Studio',
    text: 'Save answers to the questions applications keep asking, and let the AI draft ones tailored to a job description.',
  },
  {
    target: '#settings-trigger',
    title: 'Your account',
    text: 'Your credits, your plan and your account settings live here.',
  },
];

test('tour: Job (and Internship) walk the same four steps as before', () => {
  assert.deepEqual(tourSteps(workspacesFor(type('job'), workspaces)), JOB_TOUR);
  assert.deepEqual(tourSteps(workspacesFor(type('internship'), workspaces)), JOB_TOUR);
});

test('tour: College names only what it shows, under its own labels', () => {
  const steps = tourSteps(workspacesFor(type('college'), workspaces));
  assert.equal(steps[0].text, 'My Profiles, Application Essays and Personal Statement. Everything you set up here is what the extension fills applications with.');
  assert.equal(steps.find((s) => s.target.includes('answer-studio')).title, 'Application Essays');
  assert.doesNotMatch(steps[0].text, /Job Matches/);
});

test('tour: a step pointing at a hidden workspace is left out', () => {
  const job = type('job');
  const noVault = { ...job, features: { ...job.features, vault: false } };
  const steps = tourSteps(workspacesFor(noVault, workspaces));
  assert.equal(steps.length, 3);
  assert.ok(steps.every((s) => !s.target.includes('answer-studio')));
});

// ---------- task hints ----------

const LENGTH = 'Target length: 170-240 words unless the question clearly needs less.';
const IMPACT = 'Include at least one measurable or observable impact/result. Prefer numbers/percentages/timeframes when truthful; never invent facts.';

// Answer Studio's four hints as they were before types, byte for byte.
const JOB_ANSWER_HINTS = {
  'draft+context': `Rewrite the candidate draft to target the job description and company. Answer the application question directly. Tone: human, natural, confident. ${LENGTH} First person. At least two concrete details tied to the role; weave in 2-4 phrases from the job description. ${IMPACT} No filler, cliches, headings, or bullet points.`,
  'draft': `Improve the candidate draft so it is stronger and clearer. Answer the application question directly. Preserve the candidate's intent; add specificity and one concrete example or outcome. ${LENGTH} First person. ${IMPACT} No filler, cliches, headings, or bullet points.`,
  'context': `Write a tailored answer to the application question. Use the job description and company to ground specifics. ${LENGTH} First person. At least two concrete details; reflect 2-4 ideas from the job description. ${IMPACT} Interview-ready, not a template. No filler, cliches, headings, or bullet points.`,
  'neither': `Write a strong, portable first-draft answer that works across employers. Target length: 160-230 words unless the question clearly needs less. First person. At least one concrete skill and one measurable or observable result. ${IMPACT} Specific enough to sound real; broadly reusable. No filler, cliches, headings, or bullet points.`,
};
const CASES = {
  'draft+context': { hasDraft: true, hasJobContext: true },
  'draft': { hasDraft: true, hasJobContext: false },
  'context': { hasDraft: false, hasJobContext: true },
  'neither': { hasDraft: false, hasJobContext: false },
};
const JOB_COVER_HINT = 'Rewrite the cover letter template for this specific opportunity. Preserve the candidate\'s writing style and voice — do not make it generic. Reference the company and role by name. Weave in 2-4 key requirements from the description. Keep length within ±10% of the original. First person. No headings or bullet points.';

// Words an essay's hint must not carry over from a job's.
const JOB_WORDS = /\b(jobs?|employers?|company|role|candidate|interview)\b/i;

test('Answer Studio: Job and Internship keep their hints byte for byte', () => {
  for (const id of ['job', 'internship']) {
    for (const [name, flags] of Object.entries(CASES)) {
      assert.equal(answerTaskHint(type(id), flags), JOB_ANSWER_HINTS[name], `${id} ${name}`);
    }
  }
});

test('Answer Studio: College writes a personal statement for an admissions committee', () => {
  for (const [name, flags] of Object.entries(CASES)) {
    const hint = answerTaskHint(type('college'), flags);
    assert.match(hint, /personal statement/, name);
    assert.match(hint, /an admissions committee/, name);
    assert.doesNotMatch(hint, JOB_WORDS, name);
    assert.match(hint, /never invent facts/, name);
  }
  assert.match(answerTaskHint(type('college'), CASES['draft+context']), /the programme/);
  assert.match(answerTaskHint(type('college'), CASES.neither), /across programmes/);
});

test('Answer Studio: Scholarship writes a scholarship essay for a selection committee', () => {
  for (const [name, flags] of Object.entries(CASES)) {
    const hint = answerTaskHint(type('scholarship'), flags);
    assert.match(hint, /scholarship essay/, name);
    assert.match(hint, /a selection committee/, name);
    assert.doesNotMatch(hint, JOB_WORDS, name);
  }
  assert.match(answerTaskHint(type('scholarship'), CASES.context), /the scholarship/);
  assert.match(answerTaskHint(type('scholarship'), CASES.neither), /across scholarships/);
});

test('Answer Studio: the four cases stay four different hints for every type', () => {
  for (const t of ALL) {
    const hints = Object.values(CASES).map((flags) => answerTaskHint(t, flags));
    assert.equal(new Set(hints).size, 4, t.id);
  }
});

test('Cover Letter: Job and Internship keep their hint byte for byte', () => {
  assert.equal(coverLetterTaskHint(type('job')), JOB_COVER_HINT);
  assert.equal(coverLetterTaskHint(type('internship')), JOB_COVER_HINT);
});

test('Cover Letter: College and Scholarship rewrite an essay for its committee', () => {
  const college = coverLetterTaskHint(type('college'));
  assert.match(college, /personal statement template/);
  assert.match(college, /an admissions committee/);
  assert.match(college, /Reference the programme by name/);
  const scholarship = coverLetterTaskHint(type('scholarship'));
  assert.match(scholarship, /scholarship essay template/);
  assert.match(scholarship, /a selection committee/);
  assert.match(scholarship, /Reference the scholarship by name/);
  for (const hint of [college, scholarship]) {
    assert.doesNotMatch(hint, JOB_WORDS);
    // What the job's hint holds the rewrite to, kept.
    assert.match(hint, /Keep length within ±10% of the original\. First person\. No headings or bullet points\.$/);
    assert.match(hint, /writing style and voice/);
  }
});
