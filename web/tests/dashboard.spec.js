// End-to-end checks for the dashboard (/dashboard/), against stubs: the
// account comes from a stubbed Supabase sign-in, and the API from stubApi
// (tests/stubs.js). Nothing here reaches a real project or a real model.
import { test, expect } from '@playwright/test';
import { stubAuth, stubApi } from './stubs.js';
import { mergeParsedResumeIntoProfile } from '../../src/resumeToProfile.js';
import { DEFAULT_PROFILE } from '../../src/profileDefaults.js';

// Signed in the way a reader is: through the sign-in window, here on Contact
// (a plain page, quicker than the landing page's stage). Supabase's own client
// stores the session, so the dashboard finds it as it would in real use.
async function signIn(page, isMobile) {
  await page.goto('/contact/');
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  // The website's pages log uncaught errors through the app's logger.
  expect(await page.evaluate(() => typeof window.__onextapIssues)).toBe('function');
  await (isMobile ? page.tap('.hud [data-login]') : page.click('.hud [data-login]'));
  await page.fill('#loginEmail', 'reader@example.com');
  await page.fill('#loginPassword', 'hunter22');
  await (isMobile ? page.tap('#loginSubmit') : page.click('#loginSubmit'));
  await expect(page.locator('#loginDoneText')).toHaveText('Signed in as reader@example.com.');
}

// src/applicationTypes.js lists Job alone, so the dashboard offers no choice
// of application type (completion plan B6-1). The other types, listed, are
// tests/application-types.spec.js's, on its own server.
test.describe('the dashboard: application types', () => {
  test('with only Job listed, no type picker renders, and every workspace has Job’s name', async ({ page, isMobile }) => {
    await stubAuth(page);
    await stubApi(page);
    await signIn(page, isMobile);
    await page.goto('/dashboard/');
    await expect(page.locator('#settings-menu [data-bind="email"]')).toHaveText('reader@example.com');

    await (isMobile ? page.tap('#settings-trigger') : page.click('#settings-trigger'));
    await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
    // Not hidden: not in the page at all.
    await expect(page.locator('#type-picker, [role="menuitemradio"]')).toHaveCount(0);
    expect(await page.locator('#nav .nav-link').evaluateAll((links) => links.map((a) => a.title)))
      .toEqual(['Overview', 'Job Matches', 'My Profiles', 'Answer Studio', 'Cover Letter']);
  });
});

const JD_ONE = 'Senior Backend Engineer at Norwick Labs. Requirements: Python, PostgreSQL, Docker.';
const JD_TWO = 'Platform Engineer at Kestrel Analytics. Requirements: Kubernetes, Terraform.';
const JD_THREE = 'Data Engineer at Fernhill Foods. Requirements: Airflow, dbt.';

// The server charges inside the generate call and answers with `charge`
// (stubApi does the same); the dashboard never calls POST /api/credits/deduct.
test.describe('the dashboard: cover letters and credits', () => {
  test('one credit buys a personalisation and one free re-run; none left, it says so', async ({ page, isMobile }) => {
    await stubAuth(page);
    const api = await stubApi(page, { credits: 2 });
    await signIn(page, isMobile);
    await page.goto('/dashboard/#/cover-letter');

    const deducts = () => api.calls.filter(c => c.path === '/api/credits/deduct').length;
    const generateCalls = () => api.calls.filter(c => c.path === '/api/answer-vault/generate');
    const generations = () => generateCalls().length;
    const lastRequest = () => generateCalls().at(-1).body;
    const hint = page.locator('#cl-hint');
    const button = page.getByRole('button', { name: 'Personalise for this job' });
    const letter = page.getByRole('textbox', { name: 'Personalised version' });
    const description = page.getByPlaceholder('Paste the job description — the letter is rewritten around what it asks for.');

    // A template to work from.
    await page.getByRole('button', { name: 'Add a template' }).click();
    expect(await page.evaluate(() => typeof window.__onextapIssues)).toBe('function');
    await page.getByPlaceholder('Template name (e.g. Formal)').fill('Formal');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByPlaceholder('Paste your base cover letter…').fill('Dear team, I build payment systems that stay up.');
    await page.getByPlaceholder('Company or organisation').fill('Norwick Labs');
    await description.fill(JD_ONE);
    await expect(hint).toHaveText('Using “Formal”. Uses 1 credit, which includes one free re-run.');

    // Paid: one credit, charged by the server inside the generation.
    await button.click();
    await expect(letter).toHaveValue('Dear Norwick Labs team, letter number 1.');
    expect(lastRequest()).toMatchObject({ kind: 'cover_letter', applicationType: 'job' });
    expect(lastRequest().allowanceId).toBeUndefined();
    expect(api.state.credits).toBe(1);
    await expect(page.locator('[data-bind="credits"]').first()).toHaveText('1');
    await expect(hint).toHaveText('Using “Formal”. This one is a free re-run.');

    // The re-run of the same application is free, once: the page hands back
    // the allowance the server granted.
    const afterFirst = await page.evaluate(() => JSON.parse(localStorage.getItem('onextap_profiles')));
    const grantedId = afterFirst.profiles[afterFirst.activeProfileId].coverLetters[0].aiAllowanceId;
    expect(grantedId).toMatch(/^[0-9a-f-]{36}$/);
    await button.click();
    await expect(letter).toHaveValue('Dear Norwick Labs team, letter number 2.');
    expect(lastRequest()).toMatchObject({ kind: 'cover_letter', allowanceId: grantedId });
    expect(api.state.credits).toBe(1);
    await expect(hint).toHaveText('Using “Formal”. Uses 1 credit, which includes one free re-run.');

    // Another job is another application: paid, and it buys its own re-run,
    // which still works with the balance at zero.
    await description.fill(JD_TWO);
    await button.click();
    await expect(letter).toHaveValue('Dear Norwick Labs team, letter number 3.');
    expect(api.state.credits).toBe(0);
    await expect(page.locator('[data-bind="credits"]').first()).toHaveText('0');
    await expect(hint).toHaveText('Using “Formal”. This one is a free re-run.');
    await button.click();
    await expect(letter).toHaveValue('Dear Norwick Labs team, letter number 4.');
    expect(api.state.credits).toBe(0);

    // A third job with no credits left: refused before any AI call.
    await description.fill(JD_THREE);
    await expect(hint).toHaveText('Using “Formal”. No credits left: Premium makes cover letters unlimited.');
    await button.click();
    await expect(page.getByText('No credits remaining. Premium makes cover letters unlimited.')).toBeVisible();
    expect(generations()).toBe(4);
    expect(deducts()).toBe(0);

    // The allowance is kept on the template, in this browser's profile store:
    // its re-run used, so no id left to send.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('onextap_profiles')));
    const template = stored.profiles[stored.activeProfileId].coverLetters[0];
    expect(template).toMatchObject({ name: 'Formal', aiRerunsLeft: 0, aiAllowanceId: null });
    expect(template.aiRerunKey).toMatch(/^[0-9a-f]{8}$/);
  });
});

test.describe('the dashboard: Answer Studio and credits', () => {
  test('one credit writes an answer with two free improvements, charged by the server', async ({ page, isMobile }) => {
    await stubAuth(page);
    const api = await stubApi(page, { credits: 1 });
    await signIn(page, isMobile);
    await page.goto('/dashboard/#/answer-studio');

    const generateCalls = () => api.calls.filter(c => c.path === '/api/answer-vault/generate');
    const answer = page.getByPlaceholder('Optional — your own draft. Generate writes one; Improve rewrites what is here.');

    await page.getByPlaceholder('e.g. Why do you want to work here?').fill('Why do you want to work here?');
    await page.getByRole('button', { name: 'Generate answer' }).click();
    await expect(answer).toHaveValue('Dear Norwick Labs team, letter number 1.');
    expect(generateCalls()[0].body).toMatchObject({ kind: 'answer', applicationType: 'job' });
    expect(generateCalls()[0].body.allowanceId).toBeUndefined();
    expect(api.state.credits).toBe(0);
    await expect(page.getByText('Free improvements on this answer: 2')).toBeVisible();
    await expect(page.locator('.credit-pill')).toHaveText('0 credits left');

    // Improving it is free, at zero credits, with the allowance handed back.
    await page.getByRole('button', { name: 'Improve answer' }).click();
    await expect(answer).toHaveValue('Dear Norwick Labs team, letter number 2.');
    expect(generateCalls()[1].body.allowanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(api.state.credits).toBe(0);
    await expect(page.getByText('Free improvements on this answer: 1')).toBeVisible();

    // "New answer" empties the editor and puts the cursor where it starts.
    await page.getByRole('button', { name: 'New answer' }).click();
    await expect(page.getByPlaceholder('e.g. Why do you want to work here?')).toBeFocused();
    await expect(page.getByRole('button', { name: 'Generate answer' })).toBeDisabled();

    expect(api.calls.filter(c => c.path === '/api/credits/deduct')).toHaveLength(0);
  });

  // Seen in B5's real run: a reload before saving lost the improvements the
  // credit had bought, and the next Improve was charged again.
  test('a reload keeps an unsaved answer and the improvements its credit bought', async ({ page, isMobile }) => {
    await stubAuth(page);
    const api = await stubApi(page, { credits: 1 });
    await signIn(page, isMobile);
    await page.goto('/dashboard/#/answer-studio');

    const generateCalls = () => api.calls.filter(c => c.path === '/api/answer-vault/generate');
    const answer = page.getByPlaceholder('Optional — your own draft. Generate writes one; Improve rewrites what is here.');
    await page.getByPlaceholder('e.g. Why do you want to work here?').fill('Why do you want to work here?');
    await page.getByRole('button', { name: 'Generate answer' }).click();
    await expect(answer).toHaveValue('Dear Norwick Labs team, letter number 1.');
    await expect(page.getByText('Free improvements on this answer: 2')).toBeVisible();

    await page.reload();
    await expect(answer).toHaveValue('Dear Norwick Labs team, letter number 1.');
    await expect(page.getByPlaceholder('e.g. Why do you want to work here?')).toHaveValue('Why do you want to work here?');
    await expect(page.getByText('Free improvements on this answer: 2')).toBeVisible();

    await page.getByRole('button', { name: 'Improve answer' }).click();
    await expect(answer).toHaveValue('Dear Norwick Labs team, letter number 2.');
    // At 0 credits only the kept allowance can pay for this.
    expect(generateCalls()[1].body.allowanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(api.state.credits).toBe(0);
    await expect(page.getByText('Free improvements on this answer: 1')).toBeVisible();
  });
});

// The phone's dial code is its own choice: Country sets it, but a number can
// be from somewhere other than where you live, so picking a code leaves
// Country alone (dialPicker in ws/my-profiles.js).
//
// A resume upload fills the same two fields, through
// mergeParsedResumeIntoProfile (src/resumeToProfile.js); the picker only
// shows what that merge produced, so what is saved is exactly its output.
const savedPhone = (page) => page.evaluate(() => {
  const store = JSON.parse(localStorage.getItem('onextap_profiles'));
  const { country, countryCode, phone, address } = store.profiles[store.activeProfileId].autofillData;
  return { country, countryCode, phone, addressCountry: address?.country };
});
const phoneFields = ({ country, countryCode, phone, address }) => ({ country, countryCode, phone, addressCountry: address?.country });

// POST /api/parse-resume answering with `data` as the parser's fields, and a
// PDF dropped on the upload (the client checks only its type and size).
async function uploadResume(page, data) {
  await page.route('**/api/parse-resume', (route) => route.fulfill({ json: { data, text: 'An e2e resume.' } }));
  await page.getByRole('region', { name: 'Start from a resume' }).locator('input[type="file"]').setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') });
  await expect(page.getByText('Resume read — review the fields, then save.')).toBeVisible();
}

test.describe('the dashboard: My Profiles', () => {
  test('the phone’s dial code can be picked apart from Country, and is saved', async ({ page, isMobile }) => {
    await stubAuth(page);
    await stubApi(page);
    await signIn(page, isMobile);
    await page.goto('/dashboard/#/my-profiles');

    const country = page.getByLabel('Country', { exact: true }).first();
    const dial = page.getByLabel('Phone country code');
    const code = page.locator('.f-dial-code');
    await expect(country).toHaveValue('United States');
    await expect(code).toHaveText('+1');

    await country.selectOption('Germany');
    await expect(code).toHaveText('+49');

    await dial.selectOption('India');
    await expect(code).toHaveText('+91');
    await expect(country).toHaveValue('Germany');
    await page.getByLabel('Phone', { exact: true }).fill('98765 43210');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('.savebar-status')).toHaveText('Saved on this device');

    expect(await savedPhone(page)).toEqual({ country: 'Germany', countryCode: '+91', phone: '98765 43210', addressCountry: 'Germany' });

    await page.reload();
    await expect(code).toHaveText('+91');
    await expect(dial).toHaveValue('India');
    await expect(country).toHaveValue('Germany');
  });

  // What the resume says, and what the editor then shows and saves: the
  // number's own code wins the dial code, and moves Country only when the
  // resume names none.
  const RESUMES = [
    {
      title: 'a +91 number with an address in Germany: the code is India’s, Country stays Germany',
      parsed: { phone: '+91 98765 43210', address: { country: 'Germany' } },
      shown: { country: 'Germany', dial: 'India', code: '+91', phone: '98765 43210' },
    },
    {
      title: 'a +44 number and no country: Country follows the code',
      parsed: { phone: '+44 20 7946 0958' },
      shown: { country: 'United Kingdom', dial: 'United Kingdom', code: '+44', phone: '20 7946 0958' },
    },
    {
      title: 'a number with no code: the address country’s code',
      parsed: { phone: '98765 43210', address: { country: 'India' } },
      shown: { country: 'India', dial: 'India', code: '+91', phone: '98765 43210' },
    },
  ];
  for (const { title, parsed, shown } of RESUMES) {
    test(`resume upload, ${title}`, async ({ page, isMobile }) => {
      await stubAuth(page);
      await stubApi(page);
      await signIn(page, isMobile);
      await page.goto('/dashboard/#/my-profiles');
      await expect(page.locator('.f-dial-code')).toHaveText('+1');

      await uploadResume(page, parsed);
      await expect(page.getByLabel('Country', { exact: true }).first()).toHaveValue(shown.country);
      await expect(page.getByLabel('Phone country code')).toHaveValue(shown.dial);
      await expect(page.locator('.f-dial-code')).toHaveText(shown.code);
      await expect(page.getByLabel('Phone', { exact: true })).toHaveValue(shown.phone);

      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.locator('.savebar-status')).toHaveText('Saved on this device');
      const saved = await savedPhone(page);
      expect(saved).toMatchObject({ country: shown.country, countryCode: shown.code, phone: shown.phone });
      // The editor starts from the default profile, hydrated by the same merge.
      expect(saved).toEqual(phoneFields(mergeParsedResumeIntoProfile(mergeParsedResumeIntoProfile(DEFAULT_PROFILE, {}), parsed)));
    });
  }

  test('a code picked by hand survives a resume whose number names none', async ({ page, isMobile }) => {
    await stubAuth(page);
    await stubApi(page);
    await signIn(page, isMobile);
    await page.goto('/dashboard/#/my-profiles');

    await page.getByLabel('Phone country code').selectOption('India');
    const parsed = { phone: '555 0100' };
    await uploadResume(page, parsed);
    await expect(page.getByLabel('Country', { exact: true }).first()).toHaveValue('United States');
    await expect(page.locator('.f-dial-code')).toHaveText('+91');
    await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('555 0100');

    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('.savebar-status')).toHaveText('Saved on this device');
    const picked = { ...mergeParsedResumeIntoProfile(DEFAULT_PROFILE, {}), countryCode: '+91' };
    expect(await savedPhone(page)).toEqual(phoneFields(mergeParsedResumeIntoProfile(picked, parsed)));
    expect(await savedPhone(page)).toMatchObject({ country: 'United States', countryCode: '+91', phone: '555 0100' });
  });
});
