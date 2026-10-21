/**
 * The body's `applicationType` through the real route:
 * POST /api/answer-vault/generate with fake Supabase and Groq on loopback
 * (./fakeServices.js), as in improveGuardRoute.test.js.
 *
 * The contract with the clients (completion plan B6-1): the field is
 * `applicationType`, any id in src/applicationTypes.js's catalog, and missing,
 * blank, unknown or not a string means Job. It reaches the prompt builders
 * (answerVaultPrompts.test.js has their wording) and nothing else: the
 * charge and the Improve guard are what they are for a job.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { startHarness } from './harness.js';
import { fakeSupabase, fakeGroq } from './fakeServices.js';
import { memorySpendStore } from '../../server/lib/generationSpend.js';

const store = memorySpendStore();
const users = {};
const supabase = fakeSupabase({ store, users });
const groq = fakeGroq();

const harness = await startHarness({ fakes: { SUPABASE_URL: supabase.handler, GROQ_BASE_URL: groq.handler } });
test.after(() => harness.close());

const {
  buildGroqAnswerSystemInstruction,
  improveFactsRule,
  IMPROVE_FACTS_RULE,
} = await import('../../server/prompts/answerVault.js');

function account() {
  const id = randomUUID();
  const token = `token-${id}`;
  users[token] = { id, email: `${id.slice(0, 8)}@example.com` };
  store.setAccount(id, { credits: 10, isPremium: false });
  return { id, token };
}

async function generate(who, body) {
  const res = await harness.request('POST', '/api/answer-vault/generate', {
    headers: { 'content-type': 'application/json', authorization: `Bearer ${who.token}` },
    body,
  });
  return { status: res.status, body: res.body ? JSON.parse(res.body) : null };
}

const TASK = 'Write a tailored answer.';
const STYLE = 'Balanced.';
const BODY = {
  question: 'Tell us about a challenge you overcame.',
  jobContext: 'Organization: State University\nRole: Computer Science BSc\n\nWe look for curiosity.',
  taskHint: TASK,
  styleHint: STYLE,
  kind: 'answer',
};

/** The one Groq call a request made: its system and user turns. */
async function turnsFor(body) {
  const start = groq.calls.length;
  groq.state.reply = () => ({ content: 'An answer long enough to return.' });
  const who = account();
  const res = await generate(who, body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const calls = groq.calls.slice(start);
  assert.equal(calls.length, 1);
  const turn = (role) => calls[0].messages.find((m) => m.role === role).content;
  return { system: turn('system'), user: turn('user'), res, who };
}

const JOB_SYSTEM = buildGroqAnswerSystemInstruction(TASK, STYLE);

for (const type of ['college', 'scholarship']) {
  test(`${type}: the route builds the essay prompt`, async () => {
    const { system, user } = await turnsFor({ ...BODY, applicationType: type });
    assert.equal(system, buildGroqAnswerSystemInstruction(TASK, STYLE, type));
    assert.notEqual(system, JOB_SYSTEM);
    assert.match(user, /^APPLICATION CONTEXT:$/m);
    assert.doesNotMatch(user, /JOB CONTEXT/);
  });
}

for (const [label, extra] of [
  ['no applicationType', {}],
  ['a blank one', { applicationType: '  ' }],
  ['an unknown one', { applicationType: 'bootcamp' }],
  ['a capitalised id', { applicationType: 'College' }],
  ['a number', { applicationType: 7 }],
  ['an object', { applicationType: { id: 'college' } }],
  ['an array', { applicationType: ['college'] }],
  ['null', { applicationType: null }],
  ['job', { applicationType: 'job' }],
  ['internship', { applicationType: 'internship' }],
]) {
  test(`${label}: the route builds the job prompt, as it always did`, async () => {
    const { system, user } = await turnsFor({ ...BODY, ...extra });
    assert.equal(system, JOB_SYSTEM);
    assert.match(user, /^JOB CONTEXT:$/m);
    assert.doesNotMatch(user, /APPLICATION CONTEXT/);
  });
}

// The Improve guard's case from improveGuardRoute.test.js: the first answer
// invents a team size, a percentage and a tool, the retry does not.
const CORPUS = [
  { ref: 'exp.0', text: 'Backend Engineer, Kestrel Analytics, 2019 - 2023' },
  { ref: 'exp.0.b0', text: 'Built a billing service in Node.js and PostgreSQL that processed 2 million invoices a month' },
  { ref: 'skills.0', text: 'Node.js' },
];
const DRAFT = 'At Kestrel Analytics I built a billing service in Node.js that processed 2 million invoices a month.';
const INVENTED = `${DRAFT} I also led a team of 12 engineers and cut infrastructure costs by 40% using Kubernetes.`;
const CLEAN = `${DRAFT} That service is still in production today.`;

test('an essay Improve carries the essay rule, and gets the Improve guard and the charge a job does', async () => {
  const start = groq.calls.length;
  groq.state.reply = (_body, n) => ({ content: n === start + 1 ? INVENTED : CLEAN });
  const who = account();
  const res = await generate(who, { ...BODY, draft: DRAFT, corpus: CORPUS, applicationType: 'college' });
  const calls = groq.calls.slice(start);

  assert.equal(res.status, 200);
  const user = calls[0].messages.find((m) => m.role === 'user').content;
  assert.ok(user.includes(improveFactsRule('college')));
  assert.ok(!user.includes(IMPROVE_FACTS_RULE));
  assert.ok(user.indexOf(improveFactsRule('college')) > user.indexOf(DRAFT), 'after the draft');
  assert.equal(calls.length, 2, 'the first answer and the guard\'s one retry');
  assert.equal(calls[1].messages[0].content, buildGroqAnswerSystemInstruction(TASK, STYLE, 'college'), 'the retry keeps the essay prompt');
  const retryTurn = calls[1].messages.at(-1).content;
  assert.match(retryTurn, /improved essay/, 'the retry turn is worded for an essay');
  assert.doesNotMatch(retryTurn, /job titles/);
  assert.equal(res.body.text, CLEAN);
  assert.deepEqual(res.body.fabricationFlags, []);
  assert.equal(res.body.charge.charged, true);
  assert.equal(store.account(who.id).credits, 9, 'one credit, as for a job');
});

test('an essay cover letter is charged as a cover letter, with no Improve rule', async () => {
  const { system, user, res } = await turnsFor({
    ...BODY,
    question: 'Personal Statement for this application',
    draft: 'Dear committee, I am applying.',
    kind: 'cover_letter',
    applicationType: 'scholarship',
  });
  assert.equal(system, buildGroqAnswerSystemInstruction(TASK, STYLE, 'scholarship'));
  assert.ok(!user.includes(improveFactsRule('scholarship')));
  assert.equal(res.body.charge.charged, true);
  assert.ok(res.body.charge.allowanceId, 'its re-run is granted, as for a job\'s cover letter');
});

test('a legacy userPrompt keeps its text as sent; only the system turn follows the type', async () => {
  const { system, user } = await turnsFor({ userPrompt: 'Write my essay.', taskHint: TASK, styleHint: STYLE, applicationType: 'college' });
  assert.equal(user, 'Write my essay.');
  assert.equal(system, buildGroqAnswerSystemInstruction(TASK, STYLE, 'college'));
});
