// Dropdowns, end to end, from a heavily filled CV. The CV
// (fixtures/heavy-cv.pdf, from fixtures/heavy-cv.js) is uploaded on My
// Profiles with the parse stubbed by its recording, the fields a resume does not carry are typed in, the
// profile is saved and synced to the extension, and the popup autofills an
// application made of every kind of dropdown job sites use
// (fixtures/dropdown-form.html): native <select>s with each kind of
// placeholder, a React-controlled one, react-select comboboxes, Workday's
// listbox buttons and a Select2 widget. Then again on a page whose focus
// events never arrive, as a page behind the open popup gets none.
//
// playwright.extension.config.js runs this file (`npm run test:e2e:extension`)
// against the build tests/extension-build.js makes; the account and the API
// are stubbed on the whole browser context, as in extension.spec.js. No model
// is called and no real site is opened.
/* global chrome -- the evaluate() callbacks run in the extension's worker */
import { test as base, expect, chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EXTENSION_DIR } from './extension-build.js';
import { stubAuth, stubApi } from './stubs.js';
import { HEAVY_CV_TEXT, HEAVY_CV_PARSE, HEAVY_CV_EXTRAS } from './fixtures/heavy-cv.js';

const SITE = 'http://localhost:5173';

// HEAVY_CV_TEXT laid out as a CV (scripts/make-heavy-cv-pdf.mjs).
const HEAVY_CV_PDF = fileURLToPath(new URL('./fixtures/heavy-cv.pdf', import.meta.url));

// The application, on a third-party origin the manifest's host_permissions
// list (as cover-handoff.spec.js's job page). Nothing listens on 3001; the
// routes answer, React included, from node_modules.
const FORM_ORIGIN = 'http://localhost:3001';
const FORM_URL = `${FORM_ORIGIN}/e2e-apply-dropdowns/`;
const FORM = readFileSync(fileURLToPath(new URL('./fixtures/dropdown-form.html', import.meta.url)), 'utf8');
const VENDOR = {
  'react.js': fileURLToPath(new URL('../../node_modules/react/umd/react.production.min.js', import.meta.url)),
  'react-dom.js': fileURLToPath(new URL('../../node_modules/react-dom/umd/react-dom.production.min.js', import.meta.url))
};

// Every field on the form, and what it should hold after one autofill. The
// hidden inputs are what react-select and Workday submit; the <output> is
// React's own state, which a value React did not hear about leaves behind.
const EXPECTED = {
  '#first_name': 'Imogen',
  '#last_name': 'Thackeray-Vale',
  '#email': 'imogen.vale@example.com',
  '#phone_code': 'US', // "+1", with Canada's "+1" listed first
  '#phone': '(555) 014-2290', // without the dial code
  '#lever_country': 'USA', // labelled by a sibling <div>, placeholder without a value
  '#state': '43', // Texas, for the profile's "TX"
  '#city': 'Austin',
  '#gender': 'Woman', // for "Female", past a disabled placeholder
  '#dob_month': '07',
  '#dob_day': '14',
  '#dob_year': '1993',
  '#education_level': 'ma', // Master's Degree, for "M.S."
  '#discipline': 'Computer Science',
  '#grad_year': '2018',
  '#gpa': '3.9',
  '#notice': '1', // Less than 15 days, for "2 weeks"
  '#salary_band': 'c', // $150,001 – $200,000, for "185,000"
  '#years': '10+', // a custom field's "10"
  '#years-state': '10+',
  '[name=authorized]': 'Yes',
  '[name=sponsorship]': 'No',
  '[name=school]': 'Brookhollow State University', // listed only once typed
  '[name=hispanic]': 'No', // for "Not Hispanic or Latino"
  '[name=race]': 'Asian',
  '[name=veteran]': 'I am not a protected veteran',
  '[name=disability]': 'No, I do not have a disability', // for "No"
  '#hear-value': '2', // LinkedIn
  '#relocate-value': '0', // Yes
  '#residence': 'US',
  '#residence-rendered': 'United States',
  // Left alone: answered by the user before the autofill, matched by no
  // profile field, and a box whose label holds the word "statement".
  '#mailing_country': 'Canada',
  '#shirt': '',
  '#statement': ''
};
// The fields above that the autofill fills (not the mirrors, not the three left alone).
const FILLED = 29;

const test = base.extend({
  // As extension.spec.js: an extension loads only into a persistent context.
  // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this destructure
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
      viewport: { width: 1280, height: 900 },
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`]
    });
    await use(context);
    await context.close();
  },
  page: async ({ context }, use) => {
    await use(context.pages()[0] || await context.newPage());
  },
  serviceWorker: async ({ context }, use) => {
    const [running] = context.serviceWorkers();
    await use(running || await context.waitForEvent('serviceworker'));
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  }
});

// Signed in on the website, through its sign-in window (see dashboard.spec.js).
async function signIn(page) {
  await page.goto(`${SITE}/contact/`);
  await page.click('.hud [data-login]');
  await page.fill('#loginEmail', 'reader@example.com');
  await page.fill('#loginPassword', 'hunter22');
  await page.click('#loginSubmit');
  await expect(page.locator('#loginDoneText')).toHaveText('Signed in as reader@example.com.');
}

const extensionStorage = (serviceWorker, keys) =>
  serviceWorker.evaluate((k) => chrome.storage.local.get(k), keys);
const activeProfile = (store) => store.onextap_profiles.profiles[store.onextap_profiles.activeProfileId];

async function serveForm(context) {
  await context.route(FORM_URL, (route) => route.fulfill({ contentType: 'text/html', body: FORM }));
  await context.route(`${FORM_ORIGIN}/e2e-vendor/*`, (route) =>
    route.fulfill({ contentType: 'text/javascript', path: VENDOR[new URL(route.request().url()).pathname.split('/').pop()] }));
}

/** The form, open in front, with the one answer the user gave before autofilling. */
async function openForm(context) {
  const form = await context.newPage();
  await form.goto(FORM_URL);
  await expect(form.locator('[data-rs="disability"]')).toBeVisible();
  await form.selectOption('#mailing_country', 'Canada');
  await form.bringToFront();
  return form;
}

async function expectFilled(form) {
  for (const [selector, value] of Object.entries(EXPECTED)) {
    const field = form.locator(selector);
    const tag = await field.evaluate((el) => el.tagName);
    if (tag === 'OUTPUT' || tag === 'SPAN') await expect(field, selector).toHaveText(value);
    else await expect(field, selector).toHaveValue(value);
  }
}

test.describe('dropdown autofill, from a heavily filled CV', () => {
  test('the CV, uploaded and saved on the dashboard, answers every kind of dropdown, and again on a page that never gets focus', async ({ context, page, serviceWorker, extensionId }) => {
    test.setTimeout(150000);
    await stubAuth(context);
    await stubApi(context);
    // After stubApi, so it answers first: the recorded parse, as the server sends it.
    await context.route(`${SITE}/api/parse-resume`, (route) =>
      route.fulfill({ json: { data: HEAVY_CV_PARSE, text: HEAVY_CV_TEXT } }));
    await serveForm(context);
    await signIn(page);

    // Upload the CV's PDF on My Profiles, opened as the popup opens it.
    await page.goto(`${SITE}/dashboard/?extensionId=${extensionId}&view=profiles`);
    await page.locator('.drop-act input[type="file"]').setInputFiles(HEAVY_CV_PDF);
    await expect(page.getByLabel('First name')).toHaveValue('Imogen');
    await expect(page.getByLabel('Address line 1')).toHaveValue('1180 Larkspur Avenue');

    // What a resume does not say, typed in as a user would.
    const x = HEAVY_CV_EXTRAS;
    await page.getByLabel('Birth date').fill(x.birthDate);
    await page.getByLabel('Gender').selectOption(x.gender);
    for (const race of x.race) await page.getByRole('group', { name: 'Race' }).getByRole('button', { name: race }).click();
    await page.getByLabel('Ethnicity').fill(x.ethnicity);
    await page.getByLabel('Veteran status').selectOption(x.veteran);
    await page.getByLabel('Disability').fill(x.disability);
    await page.getByLabel('Current salary').fill(x.currentSalary);
    await page.getByLabel('Pay expectation').fill(x.payExpectation);
    await page.getByLabel('Notice period').fill(x.noticePeriod);
    for (const [i, custom] of x.customFields.entries()) {
      await page.getByRole('button', { name: 'Add field' }).click();
      const row = page.locator('.row-inline', { has: page.getByLabel('Field name') }).nth(i);
      await row.getByLabel('Field name').fill(custom.label);
      await row.locator('input').nth(1).fill(custom.value);
    }
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('.savebar-status')).toHaveText('Saved and synced to the extension');

    const stored = activeProfile(await extensionStorage(serviceWorker, ['onextap_profiles'])).autofillData;
    expect(stored).toMatchObject({
      firstName: 'Imogen', country: 'United States', countryCode: '+1', phone: '(555) 014-2290',
      address: { addressLine1: '1180 Larkspur Avenue', addressLine2: 'Apt 4B', city: 'Austin', state: 'TX', postalCode: '78704' },
      gender: 'Female', birthDate: '1993-07-14', race: ['Asian'], veteran: x.veteran, disability: 'No', noticePeriod: '2 weeks',
      customFields: x.customFields
    });
    expect(stored.education).toHaveLength(2);
    expect(stored.experience).toHaveLength(4);
    expect(stored.certificates).toHaveLength(3);
    expect(stored.skills).toHaveLength(25);

    // Autofill from the popup.
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    // Its label says "Filled N fields" for two seconds after a run, then
    // this again.
    const autofill = popup.getByRole('button', { name: 'Autofill Application' });
    await expect(autofill).toBeVisible();
    let form = await openForm(context);
    await autofill.click();
    await expect(popup.getByText(`Filled ${FILLED} fields`)).toBeVisible({ timeout: 20000 });
    await expectFilled(form);
    await form.close();

    // Again, with every focus event stopped before the page hears it: behind
    // the open popup a page has no focus, and react-select opens on focus.
    // Its keyboard and its typing are what must open it then.
    await form.context().addInitScript(() => {
      for (const type of ['focus', 'focusin']) window.addEventListener(type, (e) => e.stopImmediatePropagation(), true);
    });
    form = await openForm(context);
    await expect(autofill).toBeVisible();
    await autofill.click();
    await expect(popup.getByText(`Filled ${FILLED} fields`)).toBeVisible({ timeout: 30000 });
    await expectFilled(form);
  });
});
