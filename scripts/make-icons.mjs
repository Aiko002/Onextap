/**
 * `node scripts/make-icons.mjs`: every icon PNG, rendered from one SVG
 * (completion plan B6-0 (c)). Run it after changing the mark, and commit what
 * it writes; test/release/icons.test.js checks the committed files.
 *
 * The source is web/public/favicon.svg, the website's tab icon: the ring
 * mark's one evenodd path, exactly as web/src/features/nav/nav.html and the
 * dashboard topbar (web/dashboard/index.html) draw it inline, coloured ink on
 * a light tab strip and citrine on a dark one. Only the path is taken from
 * it; each PNG is that path in ICON_COLOUR on a transparent background.
 *
 * ICON_COLOUR is the palette's olive (--i1, web/src/shared/styles/tokens.css),
 * a deepened citrine. A PNG has no light/dark variant, and Chrome MV3 has no
 * per-theme toolbar icon, so it takes one colour that reads on both: 3.2:1
 * against a white toolbar, 3.4:1 against Chrome's dark toolbar grey
 * (#3C3C3C), both over the 3:1 WCAG asks of a graphic. Ink would vanish on
 * dark, and citrine or bone on white; olive is the palette colour nearest the
 * middle.
 *
 * Weight: the ring's wall runs from about 12 units (lower left, upper right)
 * down to about 2.2 (upper left, lower right), in a mark 100 tall. At 16 px
 * the thin parts are a third of a pixel and antialias away, leaving two
 * crescents. So the toolbar sizes add a stroke of the same colour along both
 * edges of the same path: the same mark, heavier, its thinnest wall about
 * 1.5 px (stroke 8 at 16, 3 at 32). From 48 px up (a 1 px thin wall and
 * more) it is drawn as it is.
 *
 * Sizes: Chrome wants 16, 32, 48 and 128 (the toolbar takes 16 and 32, the
 * extensions page 48, the Web Store and install dialog 128). The 128 keeps
 * Chrome's 16 px of padding a side (96 px of artwork); the toolbar sizes
 * fill their square. public/icon.png is the popup header's logo
 * (src/extensionClient.js getIconUrl), full bleed; web/public/icon.png is the
 * same file, kept because /icon.png was the site's favicon. The Google OAuth
 * consent screen asks for a 120 px square; its 96 px of mark stays inside a
 * round crop. A 180 px apple-touch-icon is left out on purpose: iOS fills a
 * transparent one with black, so it would need an opaque tile, and the
 * product is a desktop Chrome extension.
 *
 * Renders with Playwright's Chromium at E2E_CHROMIUM_PATH (Playwright's own
 * download does not start on every machine), on a transparent page
 * (omitBackground), one CSS pixel to one image pixel.
 *
 *   E2E_CHROMIUM_PATH=<chrome> node scripts/make-icons.mjs
 *
 * The exports are for test/release/icons.test.js.
 */
import { copyFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

/** The one source: the website's favicon. Paths are relative to the repo. */
export const SOURCE = 'web/public/favicon.svg';
/** The popup (the extension build, public/) links its own copy. */
export const POPUP_FAVICON = 'public/icons/favicon.svg';

export const MARK_VIEWBOX = '0 0 92.84 100';
const MARK_WIDTH = 92.84;
const MARK_HEIGHT = 100;

/** Olive, --i1 in the palette: one colour for a light and a dark toolbar. */
export const ICON_COLOUR = '#7F9A1E';

const icon = (file, size, height, stroke = 0) => ({ file, size, height, stroke, colour: ICON_COLOUR });

/**
 * Every PNG this writes: `size` the square, `height` the mark's height in it
 * (stroke included), `stroke` in the mark's units (it is 100 tall).
 */
export const TARGETS = Object.freeze([
  icon('public/icons/icon-16.png', 16, 16, 8),
  icon('public/icons/icon-32.png', 32, 32, 3),
  icon('public/icons/icon-48.png', 48, 48),
  icon('public/icons/icon-128.png', 128, 96),
  icon('public/icon.png', 128, 128),
  icon('web/public/icon.png', 128, 128),
  icon('web/public/favicon-32.png', 32, 32, 3),
  icon('docs/brand/google-consent-logo-120.png', 120, 96),
]);

/**
 * The mark's path data: the one <path> inside the <svg viewBox="0 0 92.84 100">
 * of an SVG file or a page.
 * @param {string} text
 */
export function markPath(text) {
  const svgs = [...String(text).matchAll(/<svg\b[^>]*\bviewBox="0 0 92\.84 100"[^>]*>([\s\S]*?)<\/svg>/g)];
  const paths = svgs.flatMap((svg) => [...svg[1].matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((p) => p[1]));
  if (paths.length !== 1) {
    throw new Error(`expected the mark (one <path> in an <svg viewBox="${MARK_VIEWBOX}">), found ${paths.length} paths`);
  }
  return paths[0];
}

/**
 * The mark as a size × size SVG: `height` px tall including the stroke,
 * centred, `colour` on nothing.
 * @param {string} d the mark's path
 * @param {{ size: number, height: number, stroke?: number, colour: string }} options
 */
export function iconSvg(d, { size, height, stroke = 0, colour }) {
  // A stroke adds half its width outside the outer edge (and half into the
  // hole), so the stroked mark is 100 + stroke units tall.
  const span = (size * (MARK_HEIGHT + stroke)) / height;
  const x = MARK_WIDTH / 2 - span / 2;
  const y = MARK_HEIGHT / 2 - span / 2;
  const strokeAttrs = stroke ? ` stroke="${colour}" stroke-width="${stroke}" stroke-linejoin="round"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${x} ${y} ${span} ${span}">` +
    `<path fill-rule="evenodd" fill="${colour}"${strokeAttrs} d="${d}"/></svg>`
  );
}

async function main() {
  const executablePath = process.env.E2E_CHROMIUM_PATH;
  if (!executablePath) {
    console.error('Set E2E_CHROMIUM_PATH to a Chromium executable, the one the e2e suites use (CLAUDE.md, Commands).');
    return 1;
  }
  const { chromium } = await import('@playwright/test');
  const d = markPath(readFileSync(path.join(repoRoot, SOURCE), 'utf8'));

  const browser = await chromium.launch({ executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
    for (const target of TARGETS) {
      await page.setContent(
        '<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>' +
          iconSvg(d, target),
      );
      const png = await page.screenshot({
        omitBackground: true,
        clip: { x: 0, y: 0, width: target.size, height: target.size },
      });
      const file = path.join(repoRoot, target.file);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, png);
      console.log(`${target.file}  ${target.size}x${target.size}`);
    }
  } finally {
    await browser.close();
  }

  mkdirSync(path.dirname(path.join(repoRoot, POPUP_FAVICON)), { recursive: true });
  copyFileSync(path.join(repoRoot, SOURCE), path.join(repoRoot, POPUP_FAVICON));
  console.log(`${POPUP_FAVICON}  copy of ${SOURCE}`);
  return 0;
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
