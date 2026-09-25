// End-to-end checks for what plugs the landing site into Onextap
// (src/onextap/, the cookie note, the inline hand-over in index.html).
// Supabase is answered here, in the browser, as the stand-in project the
// dev server is given (playwright.config.js); the dashboard at /app/ is a
// stub page, since this dev server serves only the landing site.
import { test, expect } from '@playwright/test';

const SUPABASE = 'https://onextap-test.supabase.co';
const AUTH_KEY = 'sb-onextap-test-auth-token';
const STORE = 'https://chromewebstore.google.com/detail/fpleipjggoiolomkcnchnlelbjcnoklj?utm_source=item-share-cb';
const CONSENT = 'onextap_cookie_consent';

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function session(email) {
  const user = { id: 'u-' + email.split('@')[0], aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return { access_token: b64({ alg: 'HS256' }) + '.' + b64({ sub: user.id, email, exp }) + '.sig', token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'rt', user };
}

// Answers the auth calls, and records them (never with the password's value).
async function stubSupabase(page, { signIn = 'ok', signUp = 'session' } = {}) {
  const calls = [];
  await page.route(SUPABASE + '/auth/v1/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postDataJSON ? (() => { try { return req.postDataJSON(); } catch { return null; } })() : null;
    calls.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), email: body && body.email, password: body && body.password ? 'sent' : undefined });
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname === '/auth/v1/token') {
      return signIn === 'ok'
        ? json(200, session(body.email))
        : json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (url.pathname === '/auth/v1/signup') {
      if (signUp === 'confirm') return json(200, { ...session(body.email).user, identities: [{}] });
      return json(200, session(body.email));
    }
    if (url.pathname === '/auth/v1/authorize') return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Google</title>' });
    return json(404, {});
  });
  return calls;
}

// The dashboard lives elsewhere (the React build); here it is a stub.
async function stubDashboard(page) {
  await page.route(/\/app\/(\?.*)?(#.*)?$/, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Dashboard</title><p>dashboard</p>' }));
}

async function bootLanding(page, path = '/') {
  const errors = watchErrors(page);
  await page.goto(path);
  await page.waitForFunction(() => window.__stage && window.__stage.info().snapshotsPending === 0, null, { timeout: 30000 });
  return errors;
}

// To a moment in a chapter, in screens past its arrival.
async function toChapter(page, id, past = 0.3) {
  await page.evaluate(({ id, past }) => new Promise(done => {
    const i = window.__stage.info();
    const ch = i.chapters.find(c => c.id === id);
    window.__lenis.scrollTo(i.top + (ch.arrive + past) * i.unit, { immediate: true, force: true });
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 120)));
  }), { id, past });
}

const press = (page, isMobile, sel) => isMobile ? page.tap(sel) : page.click(sel);
const isOpen = (page, id) => page.evaluate(id => document.getElementById(id).classList.contains('is-open'), id);

test.describe('Onextap: sign-in reaches the real accounts', () => {
  test('email sign-in goes through Supabase, then on to the dashboard with the query', async ({ page, isMobile }) => {
    const calls = await stubSupabase(page);
    await stubDashboard(page);
    const errors = await bootLanding(page, '/?extensionId=abc123&view=vault');
    await press(page, isMobile, '.hud [data-login]');
    await page.fill('#loginEmail', 'reader@example.com');
    await page.fill('#loginPassword', 'correct-horse-9');
    await press(page, isMobile, '#loginSubmit');

    await expect(page.locator('#loginDoneText')).toHaveText('Signed in as reader@example.com.');
    expect(calls).toEqual([{ path: '/auth/v1/token', query: { grant_type: 'password' }, email: 'reader@example.com', password: 'sent' }]);
    expect(await page.evaluate(k => !!localStorage.getItem(k), AUTH_KEY)).toBe(true);
    expect(errors).toEqual([]);

    await press(page, isMobile, '#loginDone [data-dlg-close]');
    await expect(page).toHaveURL(/\/app\/\?extensionId=abc123&view=vault$/);
  });

  test('a refused sign-in says so, and stays', async ({ page, isMobile }) => {
    await stubSupabase(page, { signIn: 'refused' });
    await bootLanding(page);
    await press(page, isMobile, '.hud [data-login]');
    await page.fill('#loginEmail', 'reader@example.com');
    await page.fill('#loginPassword', 'wrong-password');
    await press(page, isMobile, '#loginSubmit');
    await expect(page.locator('#loginSendErr')).toHaveText('That didn’t work. Check your details and try again.');
    await expect(page.locator('#loginSubmit')).toBeEnabled();
    await expect(page.locator('#loginSubmit')).toHaveText('Sign In');
    await expect(page.locator('#loginView')).toBeVisible();
    expect(await page.evaluate(k => localStorage.getItem(k), AUTH_KEY)).toBeNull();
    // Closing without an account goes nowhere.
    await press(page, isMobile, '#login .dlg__x');
    await expect.poll(() => isOpen(page, 'login')).toBe(false);
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('sign-up creates the account through Supabase and goes on in', async ({ page, isMobile }) => {
    const calls = await stubSupabase(page);
    await stubDashboard(page);
    await bootLanding(page);
    await press(page, isMobile, '.hud [data-login]');
    await press(page, isMobile, '#loginSwitch');
    await page.fill('#loginEmail', 'new@example.com');
    await page.fill('#loginPassword', 'long-enough-1');
    await press(page, isMobile, '#loginSubmit');
    await expect(page.locator('#loginDoneText')).toHaveText('Account created for new@example.com.');
    expect(calls.map(c => c.path)).toEqual(['/auth/v1/signup']);
    await press(page, isMobile, '#loginDone [data-dlg-close]');
    await expect(page).toHaveURL(/\/app\/$/);
  });

  test('Continue with Google goes out through Supabase, to come back to the root', async ({ page, isMobile }) => {
    const calls = await stubSupabase(page);
    await page.goto('/about/');
    const root = new URL('/', page.url()).href;
    await press(page, isMobile, '.hud [data-login]');
    await press(page, isMobile, '#loginGoogle');
    await expect(page).toHaveTitle('Google');
    const out = calls.find(c => c.path === '/auth/v1/authorize');
    expect(out.query.provider).toBe('google');
    expect(out.query.redirect_to).toBe(root);
  });

  test('the window starts fresh each time it opens', async ({ page, isMobile }) => {
    await bootLanding(page);
    await press(page, isMobile, '.hud [data-login]');
    await press(page, isMobile, '#loginSwitch');
    await page.fill('#loginEmail', 'half@example.com');
    await page.fill('#loginPassword', 'typed');
    await press(page, isMobile, '#login .dlg__x');
    await press(page, isMobile, '.hud [data-login]');
    await expect(page.locator('#loginTitle')).toHaveText('Welcome back');
    await expect(page.locator('#loginEmail')).toHaveValue('');
    await expect(page.locator('#loginPassword')).toHaveValue('');
  });

  test('signed in from a company page, the dashboard is next too', async ({ page, isMobile }) => {
    await stubSupabase(page);
    await stubDashboard(page);
    await page.goto('/privacy/');
    await press(page, isMobile, '.hud [data-login]');
    await page.fill('#loginEmail', 'reader@example.com');
    await page.fill('#loginPassword', 'correct-horse-9');
    await press(page, isMobile, '#loginSubmit');
    await expect(page.locator('#loginDone')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/app\/$/);
  });
});

test.describe('Onextap: the hand-over at /', () => {
  test('a stored session goes straight to the dashboard, query and all', async ({ page }) => {
    await stubDashboard(page);
    await page.addInitScript(k => localStorage.setItem(k, '{"access_token":"x"}'), AUTH_KEY);
    await page.goto('/?extensionId=abc123&view=jobs');
    await expect(page).toHaveURL(/\/app\/\?extensionId=abc123&view=jobs$/);
  });

  test('tokens coming back from Google go to the dashboard, hash and all', async ({ page }) => {
    await stubDashboard(page);
    await page.goto('/#access_token=aaa&refresh_token=bbb&token_type=bearer');
    await expect(page).toHaveURL(/\/app\/#access_token=aaa&refresh_token=bbb&token_type=bearer$/);
  });

  test('a chapter link from a company page is not mistaken for sign-in', async ({ page }) => {
    await page.goto('/#price');
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test("the dashboard's one-shot flag keeps a stale session here, once", async ({ page }) => {
    await stubDashboard(page);
    await page.goto('/');
    await page.evaluate(k => {
      localStorage.setItem(k, '{"access_token":"stale"}');
      sessionStorage.setItem('onextap:landing', '1');
    }, AUTH_KEY);
    await page.reload();
    expect(new URL(page.url()).pathname).toBe('/');
    expect(await page.evaluate(() => sessionStorage.getItem('onextap:landing'))).toBeNull();
    await page.reload();
    await expect(page).toHaveURL(/\/app\/$/);
  });

  test('the company pages stay readable when signed in', async ({ page }) => {
    await page.addInitScript(k => localStorage.setItem(k, '{"access_token":"x"}'), AUTH_KEY);
    for (const path of ['/about/', '/contact/', '/privacy/']) {
      await page.goto(path);
      expect(new URL(page.url()).pathname).toBe(path);
    }
  });
});

test.describe('Onextap: the calls to action', () => {
  // What the page asks the browser to open (the tab itself is the browser's
  // business, and the listing is not ours to load in a test).
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__opened = [];
      window.open = (...args) => { window.__opened.push(args); return null; };
    });
  });

  async function opensStore(page, click) {
    const before = await page.evaluate(() => window.scrollY);
    const count = await page.evaluate(() => window.__opened.length);
    await click();
    await expect.poll(() => page.evaluate(() => window.__opened.length)).toBe(count + 1);
    expect(await page.evaluate(() => window.__opened.at(-1))).toEqual([STORE, '_blank', 'noopener,noreferrer']);
    // The anchor's own smooth scroll to its placeholder never ran.
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  }

  test("the header's Add to Chrome opens the Web Store listing, on every page", async ({ page, isMobile }) => {
    for (const path of ['/', '/about/', '/contact/', '/privacy/']) {
      await page.goto(path);
      await opensStore(page, () => press(page, isMobile, '.hud__cta'));
    }
  });

  test("CH 00's and CH 05's Add to Chrome open it too", async ({ page, isMobile }) => {
    const errors = await bootLanding(page);
    await opensStore(page, () => page.evaluate(() => document.querySelector('#hero .truth__actions .btn--solid').click()));
    await toChapter(page, 'close');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.close__row')).opacity)).toBe('1');
    await opensStore(page, () => press(page, isMobile, '#close .close__actions .btn--solid'));
    expect(errors).toEqual([]);
  });

  test('both plans open the sign-in window, where the page is', async ({ page, isMobile }) => {
    await bootLanding(page);
    await toChapter(page, 'price', 0.6);
    for (const sel of ['#price .plan .btn--ghost', '#price .plan .btn--solid']) {
      const before = await page.evaluate(() => window.scrollY);
      await press(page, isMobile, sel);
      await expect(page.getByRole('dialog', { name: 'Welcome back' })).toBeVisible();
      await press(page, isMobile, '#login .dlg__x');
      await expect.poll(() => isOpen(page, 'login')).toBe(false);
      expect(await page.evaluate(() => window.scrollY)).toBe(before);
    }
  });
});

test.describe('Onextap: feedback goes to the support inbox', () => {
  test('a note opens the mail app, written out, then says it is done', async ({ page, isMobile }) => {
    test.skip(test.info().project.name.startsWith('webkit'), 'reads the navigation from Chromium (CDP)');
    await page.goto('/contact/');
    // A mailto: navigation leaves no request behind; Chromium reports it asked.
    const cdp = await page.context().newCDPSession(page);
    const asked = [];
    await cdp.send('Page.enable');
    cdp.on('Page.frameRequestedNavigation', e => asked.push(e.url));
    await press(page, isMobile, '.sub-hero [data-feedback]');
    await page.locator('#feedback label.fb__chip', { hasText: 'Something broke' }).click();
    await page.fill('#fbMessage', 'Workday skipped my phone number.');
    await page.fill('#fbEmail', 'reader@example.com');
    await press(page, isMobile, '#fbSubmit');
    await expect(page.locator('#fbDone')).toBeVisible();
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    const mail = new URL(asked[0]);
    expect(mail.protocol).toBe('mailto:');
    expect(mail.pathname).toBe('mazzah70@gmail.com');
    expect(mail.searchParams.get('subject')).toBe('Onextap feedback: Something broke');
    const body = mail.searchParams.get('body');
    expect(body).toContain('Workday skipped my phone number.');
    expect(body).toContain('Reply to: reader@example.com');
    expect(body).toContain('/contact/');
  });
});

test.describe('Onextap: the cookie note', () => {
  // A first visit: no choice made yet (the config makes one for every other test).
  test.use({ storageState: { cookies: [], origins: [] } });

  const note = page => page.locator('#cookieConsent');
  const shown = page => page.evaluate(() => {
    const el = document.getElementById('cookieConsent');
    return !el.hidden && getComputedStyle(el).opacity === '1' && getComputedStyle(el).visibility === 'visible';
  });

  test('deals in on a first visit, in the paper, type and buttons of the site', async ({ page }) => {
    const errors = await bootLanding(page);
    await expect.poll(() => shown(page)).toBe(true);
    await expect(page.getByRole('region', { name: 'Cookies, briefly.' })).toBeVisible();
    await expect(note(page).locator('.dlg__url')).toHaveText('onextap / cookies');
    await expect(note(page).getByRole('button', { name: 'Accept all' })).toHaveClass(/btn btn--solid/);
    await expect(note(page).getByRole('button', { name: 'Essential only' })).toHaveClass(/btn btn--ghost/);
    await expect(note(page).getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy-policy');
    const look = await page.evaluate(() => {
      const cs = s => getComputedStyle(document.querySelector(s));
      return {
        paper: cs('#cookieConsent').backgroundColor, ink: cs('#cookieConsent').color,
        bar: cs('#cookieConsent .dlg__bar').backgroundColor,
        titleFace: cs('#ccTitle').fontFamily, titleCase: cs('#ccTitle').textTransform,
        asideFace: cs('.cc__aside').fontFamily, textFace: cs('#ccText').fontFamily,
        z: cs('#cookieConsent').zIndex
      };
    });
    expect(look).toMatchObject({ paper: 'rgb(233, 228, 212)', ink: 'rgb(12, 23, 16)', bar: 'rgb(221, 215, 196)', titleCase: 'uppercase', z: '63' });
    expect(look.titleFace).toMatch(/^"?Archivo/);
    expect(look.asideFace).toMatch(/^"?Instrument Serif/);
    expect(look.textFace).toMatch(/^"?Instrument Sans/);
    expect(errors).toEqual([]);
  });

  for (const [button, choice] of [['Accept all', 'all'], ['Essential only', 'essential']]) {
    test(`"${button}" is remembered, announced, and the note goes`, async ({ page, isMobile }) => {
      await bootLanding(page);
      await expect.poll(() => shown(page)).toBe(true);
      await page.evaluate(() => { window.__consent = []; document.addEventListener('onextap:consent', e => window.__consent.push(e.detail)); });
      if (isMobile) await note(page).getByRole('button', { name: button }).tap();
      else await note(page).getByRole('button', { name: button }).click();
      await expect(note(page)).toBeHidden();
      expect(await page.evaluate(() => window.__consent)).toEqual([{ choice }]);
      const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), CONSENT);
      expect(saved).toMatchObject({ v: 1, choice });
      expect(Date.parse(saved.at)).toBeGreaterThan(0);
      await page.reload();
      await page.waitForTimeout(1200);
      await expect(note(page)).toBeHidden();
    });
  }

  test('shows on the company pages, and never holds them', async ({ page }) => {
    for (const path of ['/about/', '/contact/', '/privacy/']) {
      await page.goto(path);
      await expect.poll(() => shown(page)).toBe(true);
      expect(await page.evaluate(() => [...document.body.children].some(el => el.inert && !el.matches('#siteMenu, .dlg')))).toBe(false);
    }
  });

  test('sits inside the screen with room to spare, and nothing scrolls sideways', async ({ page, isMobile }) => {
    await bootLanding(page);
    await expect.poll(() => shown(page)).toBe(true);
    const box = await note(page).boundingBox();
    const vw = page.viewportSize().width;
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(vw - (box.x + box.width)).toBeGreaterThanOrEqual(16);
    if (isMobile) expect(Math.round(box.x)).toBe(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Clear of the chapter bar along the bottom.
    const bar = await page.locator('.hud-foot').boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 1);
  });

  test('the story still scrolls while it shows', async ({ page, isMobile }) => {
    test.skip(isMobile, 'wheel');
    await bootLanding(page);
    await expect.poll(() => shown(page)).toBe(true);
    await page.mouse.move(400, 400);
    await page.mouse.wheel(0, 1200);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  });

  test('steps aside for the menu, and goes inert under a window', async ({ page, isMobile }) => {
    await bootLanding(page);
    await expect.poll(() => shown(page)).toBe(true);
    await press(page, isMobile, '#burger');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('cookieConsent')).visibility)).toBe('hidden');
    await press(page, isMobile, '#burger');
    await expect.poll(() => shown(page)).toBe(true);
    await press(page, isMobile, '.hud [data-login]');
    expect(await page.evaluate(() => document.getElementById('cookieConsent').inert)).toBe(true);
    await press(page, isMobile, '#login .dlg__x');
    await expect.poll(() => isOpen(page, 'login')).toBe(false);
    expect(await page.evaluate(() => document.getElementById('cookieConsent').inert)).toBe(false);
  });

  test('is not asked again for a choice already made', async ({ page }) => {
    await page.addInitScript(k => localStorage.setItem(k, JSON.stringify({ v: 1, choice: 'essential', at: '2026-01-01T00:00:00Z' })), CONSENT);
    await bootLanding(page);
    await page.waitForTimeout(1200);
    await expect(note(page)).toBeHidden();
  });
});

test.describe('Onextap: the cookie note, reduced motion', () => {
  test.use({ reducedMotion: 'reduce', storageState: { cookies: [], origins: [] } });

  test('appears at once, and goes at once', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page.locator('#cookieConsent')).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('cookieConsent')).transitionDuration)).toMatch(/^0s/);
    await page.locator('#cookieConsent').getByRole('button', { name: 'Essential only' }).click();
    await expect(page.locator('#cookieConsent')).toBeHidden();
    expect(errors).toEqual([]);
  });
});
