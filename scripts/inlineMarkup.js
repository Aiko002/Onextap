import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/* ===========================================================================
   The website's pages ship their markup in the HTML.

   Each page is a skeleton of `<div data-mount="name"></div>` placeholders,
   and web/src/app/mount.js swaps each one for that feature's markup when the
   page's script runs. Done only in the browser, that leaves the HTML a server
   sends with an empty body: a crawler that does not run JavaScript (AI search
   crawlers, Bing much of the time, every link preview) reads a title and a
   description and nothing else. So the website build, and the dev server
   through the same hook, makes the same swap in the HTML. mount.js then finds
   no placeholders left on these pages and has nothing to do.

   The page stays hidden until its script has set it up, as it was when the
   markup arrived with the script: the stage lays the landing page out as
   full-screen layers, and a reader should not see plain document flow first.
   An inline script sets `booting` on <html>; the page's boot clears it
   (revealPage() in web/src/app/mount.js), and a timer clears it if the
   script never runs. Without JavaScript the class is never set, so the page
   reads as ordinary flow. The words are in the HTML either way, which is
   what a crawler reads.

   The dashboard's pages are left alone: signed in, noindex, and booted by
   their own scripts.
   =========================================================================== */

const BOOT_CLASS = 'booting';
// Long enough for a slow connection to fetch the page's script, short enough
// that a page whose script failed to load is still read.
const BOOT_TIMEOUT_MS = 5000;

const SLOT = /<div data-mount="([^"]*)"><\/div>/g;

// Where a data-mount name's markup lives: a landing-page feature, a company
// page, or a piece the company pages share (page-foot).
function markupPath(webRoot, name) {
  if (!/^[a-z][a-z-]*$/.test(name)) {
    throw new Error('inlineMarkup: bad data-mount name "' + name + '"');
  }
  const found = [
    join(webRoot, 'src', 'features', name, name + '.html'),
    join(webRoot, 'src', 'pages', name, name + '.html'),
    join(webRoot, 'src', 'pages', name + '.html'),
  ].filter((path) => existsSync(path));
  if (found.length !== 1) {
    throw new Error('inlineMarkup: data-mount="' + name + '" matches ' + found.length +
      ' markup files under ' + webRoot + ' (needs exactly one)');
  }
  return found[0];
}

export function inlineMarkup({ webRoot }) {
  return {
    name: 'onextap-inline-markup',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const file = (ctx.filename || '').replace(/\\/g, '/');
        if (file.includes('/web/dashboard/')) return html;
        if (!SLOT.test(html)) return html;
        SLOT.lastIndex = 0;

        // Trimmed, as mount.js trims it: the DOM is the same either way.
        const out = html.replace(SLOT, (_, name) =>
          readFileSync(markupPath(webRoot, name), 'utf8').trim());

        return {
          html: out,
          tags: [
            {
              tag: 'style',
              children: 'html.' + BOOT_CLASS + ' body{visibility:hidden}',
              injectTo: 'head',
            },
            {
              tag: 'script',
              children:
                'document.documentElement.classList.add("' + BOOT_CLASS + '");' +
                'setTimeout(function(){document.documentElement.classList.remove("' +
                BOOT_CLASS + '")},' + BOOT_TIMEOUT_MS + ');',
              injectTo: 'head',
            },
          ],
        };
      },
    },
  };
}
