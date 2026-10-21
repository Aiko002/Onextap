// The dashboard with every application type listed (completion plan B6-1):
// the `types-on` project runs this on the 5191 dev server, started with
// ONEXTAP_E2E_APPLICATION_TYPES=all (playwright.config.js), so turning the
// types on in src/applicationTypes.js is already tested. With Job alone (5190)
// there is no picker at all: tests/dashboard.spec.js holds that half.
//
// The choice is this browser's (localStorage, onextap_application_type) and
// never goes to the extension. Account and API are stubs (tests/stubs.js).
import { test, expect } from '@playwright/test';
import { stubAuth, stubApi } from './stubs.js';

const TYPES = ['Job', 'College / University', 'Scholarship', 'Internship'];

// Signed in through the sign-in window on Contact, as tests/dashboard.spec.js does.
async function signIn(page) {
  await page.goto('/contact/');
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.click('.hud [data-login]');
  await page.fill('#loginEmail', 'reader@example.com');
  await page.fill('#loginPassword', 'hunter22');
  await page.click('#loginSubmit');
  await expect(page.locator('#loginDoneText')).toHaveText('Signed in as reader@example.com.');
}

/** The dashboard, booted: the account is in the settings menu. */
async function openDashboard(page, path = '/dashboard/') {
  await page.goto(path);
  await expect(page.locator('#settings-menu [data-bind="email"]')).toHaveText('reader@example.com');
}

/** Picks a type from the settings menu's picker. */
async function chooseType(page, label) {
  await page.click('#settings-trigger');
  await page.getByRole('menuitemradio', { name: label }).click();
}

/**
 * The workspaces in the nav, by name (Overview first; it is hidden on the
 * home view). Polled: a type change redraws the nav inside a view transition.
 */
const expectNav = (page, names) =>
  expect.poll(() => page.locator('#nav .nav-link').evaluateAll((links) => links.map((a) => a.title))).toEqual(names);
const JOB_NAV = ['Overview', 'Job Matches', 'My Profiles', 'Answer Studio', 'Cover Letter'];
const COLLEGE_NAV = ['Overview', 'My Profiles', 'Application Essays', 'Personal Statement'];

test.describe('the dashboard with every application type listed', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);
  });

  test('the settings menu offers the four types, Job first and chosen', async ({ page }) => {
    await stubApi(page);
    await signIn(page);
    await openDashboard(page);

    await page.click('#settings-trigger');
    const picker = page.getByRole('group', { name: 'Applying for' });
    await expect(picker.getByRole('menuitemradio')).toHaveText(TYPES);
    await expect(picker.getByRole('menuitemradio', { name: 'Job' })).toHaveAttribute('aria-checked', 'true');
    await expect(picker.locator('[aria-checked="true"]')).toHaveCount(1);
    // The rows are the menu's: the arrow keys reach them.
    await page.keyboard.press('Home');
    await expect(page.getByRole('menuitemradio', { name: 'Job' })).toBeFocused();
    await expectNav(page, JOB_NAV);
  });

  test('College hides Job Matches and renames the writing workspaces, without a reload, and keeps it after one', async ({ page }) => {
    await stubApi(page);
    await signIn(page);
    await openDashboard(page);
    await page.evaluate(() => { window.__sameDocument = true; });

    await chooseType(page, 'College / University');
    await expect(page.locator('#nav .nav-link[data-id="job-matches"]')).toHaveCount(0);
    await expectNav(page, COLLEGE_NAV);
    // The Overview cards are the nav: three of them now, under the new names.
    await expect(page.getByRole('link', { name: 'Job Matches' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Application Essays' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Personal Statement' })).toBeVisible();
    expect(await page.evaluate(() => window.__sameDocument)).toBe(true);

    // Inside a workspace the names follow too.
    await page.getByRole('link', { name: 'Personal Statement' }).click();
    await expect(page.locator('.ws-title')).toHaveText('Personal Statement');
    await expect(page.locator('.ws-desc')).toHaveText('Personal statements tailored to each application.');
    await expect(page).toHaveTitle('Personal Statement — Onextap');

    // Changing it there re-renders the open workspace in place.
    await chooseType(page, 'Scholarship');
    await expect(page.locator('.ws-title')).toHaveText('Scholarship Essay');
    await expectNav(page, ['Overview', 'My Profiles', 'Essay Answers', 'Scholarship Essay']);
    await chooseType(page, 'College / University');
    await expect(page.locator('.ws-title')).toHaveText('Personal Statement');
    expect(await page.evaluate(() => window.__sameDocument)).toBe(true);

    // Kept by this browser, and only here.
    expect(await page.evaluate(() => localStorage.getItem('onextap_application_type'))).toBe('"college"');
    await page.reload();
    await expect(page.locator('.ws-title')).toHaveText('Personal Statement');
    await expectNav(page, COLLEGE_NAV);
    await page.click('#settings-trigger');
    await expect(page.getByRole('menuitemradio', { name: 'College / University' })).toHaveAttribute('aria-checked', 'true');

    // And back: Job shows Job Matches again.
    await page.getByRole('menuitemradio', { name: 'Job' }).click();
    await expectNav(page, JOB_NAV);
    await expect(page.locator('.ws-title')).toHaveText('Cover Letter');
  });

  test('under College, a link to Job Matches lands on Overview', async ({ page }) => {
    await stubApi(page);
    await signIn(page);
    await openDashboard(page);
    await chooseType(page, 'College / University');

    // Arriving with it: a deep link, and the popup's old ?view=jobs.
    for (const path of ['/dashboard/#/job-matches', '/dashboard/?view=jobs']) {
      await page.goto('/contact/');
      await openDashboard(page, path);
      await expect(page.locator('#app')).toHaveAttribute('data-view', 'home');
      await expect(page.locator('.ws-title')).toHaveCount(0);
      expect(new URL(page.url()).hash).toBe('#/');
      await expect(page).toHaveTitle('Dashboard — Onextap');
    }

    // Following one from inside a workspace.
    await page.getByRole('link', { name: 'Personal Statement' }).click();
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'workspace');
    await page.evaluate(() => { location.hash = '#/job-matches'; });
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'home');
    await expect(page).toHaveURL(/\/dashboard\/#\/$/);
    await expect(page.locator('.ws-title')).toHaveCount(0);
  });

  test('under College, Answer Studio and the Personal Statement send applicationType "college"', async ({ page }) => {
    const api = await stubApi(page, { credits: 3 });
    await signIn(page);
    await openDashboard(page);
    await chooseType(page, 'College / University');
    const generated = () => api.calls.filter((c) => c.path === '/api/answer-vault/generate').map((c) => c.body);

    // Application Essays (Answer Studio).
    await page.getByRole('link', { name: 'Application Essays' }).click();
    await expect(page.locator('.ws-title')).toHaveText('Application Essays');
    await page.getByPlaceholder('e.g. Why do you want to work here?').fill('Why this programme?');
    await page.getByRole('button', { name: 'Generate answer' }).click();
    await expect(page.getByPlaceholder('Optional — your own draft. Generate writes one; Improve rewrites what is here.'))
      .toHaveValue('Dear Norwick Labs team, letter number 1.');
    expect(generated()[0]).toMatchObject({ kind: 'answer', applicationType: 'college' });
    expect(generated()[0].taskHint).toMatch(/personal statement/);
    expect(generated()[0].taskHint).toMatch(/an admissions committee/);

    // Personal Statement (Cover Letter): its template is saved as College's.
    await page.getByRole('link', { name: 'Personal Statement' }).click();
    await expect(page.locator('.ws-title')).toHaveText('Personal Statement');
    await page.getByRole('button', { name: 'Add a template' }).click();
    await page.getByPlaceholder('Template name (e.g. Formal)').fill('Main');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByPlaceholder('Paste your base personal statement…').fill('I have wanted to study marine biology since I was nine.');
    await page.getByPlaceholder('Paste the job description — the letter is rewritten around what it asks for.')
      .fill('BSc Marine Biology at Fernhill University. We look for curiosity and fieldwork.');
    await page.getByRole('button', { name: 'Personalise for this college' }).click();
    await expect(page.getByRole('textbox', { name: 'Personalised version' })).toHaveValue('Dear Norwick Labs team, letter number 2.');
    expect(generated()[1]).toMatchObject({ kind: 'cover_letter', applicationType: 'college', question: 'Personal Statement for this application' });
    expect(generated()[1].taskHint).toMatch(/personal statement template/);
    expect(generated()[1].taskHint).toMatch(/Reference the programme by name/);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('onextap_profiles')));
    expect(stored.profiles[stored.activeProfileId].coverLetters[0]).toMatchObject({ name: 'Main', applicationType: 'college' });
  });

  test('under Job, the requests say so', async ({ page }) => {
    const api = await stubApi(page, { credits: 1 });
    await signIn(page);
    await openDashboard(page, '/dashboard/#/answer-studio');
    await page.getByPlaceholder('e.g. Why do you want to work here?').fill('Why do you want to work here?');
    await page.getByRole('button', { name: 'Generate answer' }).click();
    await expect(page.getByPlaceholder('Optional — your own draft. Generate writes one; Improve rewrites what is here.'))
      .toHaveValue('Dear Norwick Labs team, letter number 1.');
    const body = api.calls.find((c) => c.path === '/api/answer-vault/generate').body;
    expect(body).toMatchObject({ kind: 'answer', applicationType: 'job' });
    expect(body.taskHint).toMatch(/^Write a strong, portable first-draft answer that works across employers\./);
  });
});
