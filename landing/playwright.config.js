import { defineConfig, devices } from '@playwright/test';

// End-to-end checks for the stage. `npm run test:landing` (from the repo
// root) starts its own landing dev server on 5190 (or reuses one already
// running there).
//
// Onextap: the dev server is given a stand-in Supabase project, whatever the
// root .env says, and tests/onextap.spec.js answers its auth calls in the
// browser, so no test can reach a real project or account.
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js/,
  timeout: 60000,
  fullyParallel: false,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5190',
    trace: 'off',
    // Onextap: a cookie choice already made, so the design's own checks see
    // the page as designed. tests/onextap.spec.js clears it for the note's.
    storageState: {
      cookies: [],
      origins: [{
        origin: 'http://localhost:5190',
        localStorage: [{ name: 'onextap_cookie_consent', value: '{"v":1,"choice":"essential","at":"2026-01-01T00:00:00.000Z"}' }]
      }]
    }
  },
  webServer: {
    command: 'npx vite --config ../vite.landing.config.js --port 5190 --strictPort',
    url: 'http://localhost:5190',
    reuseExistingServer: true,
    timeout: 60000,
    env: {
      VITE_SUPABASE_URL: 'https://onextap-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key'
    }
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-phone', use: { ...devices['Pixel 7'] } },
    // Playwright's WebKit on Windows renders in software and manages a few
    // frames a second on the feature deck (the original page did too), so it
    // runs at 1x; the tests that wait on animation allow for that.
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } }
  ]
});
