import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// End-to-end checks for the stage. `npm run test:e2e` starts its own dev
// servers on 5190 (or reuses one already running there) and 5191 (never
// reused: a server there without the override would test Job alone).
//
// The account and the API are stubbed in the tests themselves (see
// tests/stubs.js). The server is also started with a Supabase address that
// cannot resolve (.invalid is reserved, RFC 2606), so a request a test forgot
// to stub fails instead of reaching a real project. Variables set here win
// over the repo's .env: Vite reads the process environment first.
//
// 5191 is the same site with every application type listed
// (ONEXTAP_E2E_APPLICATION_TYPES, scripts/applicationTypesOverride.js), as if
// their ids were uncommented in src/applicationTypes.js: the `types-on`
// project runs tests/application-types.spec.js there, and only there. Every
// other project runs against 5190, where the source's switch (Job only)
// applies.
const STUB_ENV = {
  VITE_SUPABASE_URL: 'https://e2e.invalid',
  VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
  // Same origin, so /api/feedback is answered by the test's route.
  VITE_API_URL: ''
};
// The repo root: `npm run dev` is its script, and web/ has no package.json.
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Need the extension loaded: playwright.extension.config.js runs them.
const EXTENSION_SPECS = /(extension(-legacy)?|cover-handoff)\.spec\.js/;
// Needs every type listed: the types-on project, on 5191.
const TYPES_ON_SPEC = /application-types\.spec\.js/;
// A project's testIgnore replaces the config's, so each says both.
const WITHOUT_TYPES_ON = [EXTENSION_SPECS, TYPES_ON_SPEC];

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js/,
  testIgnore: EXTENSION_SPECS,
  timeout: 60000,
  fullyParallel: false,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5190',
    trace: 'off'
  },
  webServer: [
    {
      command: 'npm run dev -- --port 5190 --strictPort',
      cwd: ROOT,
      url: 'http://localhost:5190',
      reuseExistingServer: true,
      timeout: 60000,
      env: STUB_ENV
    },
    {
      command: 'npm run dev -- --port 5191 --strictPort',
      cwd: ROOT,
      url: 'http://localhost:5191',
      reuseExistingServer: false,
      timeout: 60000,
      env: { ...STUB_ENV, ONEXTAP_E2E_APPLICATION_TYPES: 'all' }
    }
  ],
  projects: [
    { name: 'chromium-desktop', testIgnore: WITHOUT_TYPES_ON, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-phone', testIgnore: WITHOUT_TYPES_ON, use: { ...devices['Pixel 7'] } },
    // Playwright's WebKit on Windows renders in software and manages a few
    // frames a second on the feature deck (the original page did too), so it
    // runs at 1x; the tests that wait on animation allow for that.
    { name: 'webkit-desktop', testIgnore: WITHOUT_TYPES_ON, use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    {
      name: 'types-on',
      testMatch: TYPES_ON_SPEC,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: 'http://localhost:5191' }
    }
  ]
});
