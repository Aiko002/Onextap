// Photographs scripts/og-image.html at 1200×630 into web/public/og.png, the
// link-preview image every public page names in og:image.
//
//   npm run og:image
//
// Needs the network for the site's Google Fonts, and Playwright's Chromium
// (the one the e2e suites use; E2E_CHROMIUM_PATH picks another). Refuses to
// write an image drawn in fallback faces.
// page.evaluate() runs its function in the page, where `document` exists.
/* global document */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const source = new URL('./og-image.html', import.meta.url).href;
const out = fileURLToPath(new URL('../web/public/og.png', import.meta.url));

const browser = await chromium.launch(
  process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {}
);
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(source, { waitUntil: 'networkidle' });
  const missing = await page.evaluate(async () => {
    await document.fonts.ready;
    return [
      '650 100px Archivo',
      'italic 400 40px "Instrument Serif"',
      '500 17px "DM Mono"',
    ].filter((face) => !document.fonts.check(face));
  });
  if (missing.length) {
    throw new Error('Fonts did not load (' + missing.join(', ') + '); is the network up?');
  }
  await page.screenshot({ path: out, type: 'png' });
  console.log('Wrote ' + out);
} finally {
  await browser.close();
}
