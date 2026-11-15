/**
 * `node scripts/make-heavy-cv-pdf.mjs`: web/tests/fixtures/heavy-cv.pdf, the
 * heavily filled test CV (HEAVY_CV_TEXT in web/tests/fixtures/heavy-cv.js)
 * laid out as a CV and printed by Playwright's Chromium. Run it after
 * changing that text, and commit what it writes.
 *
 * The PDF is for testing by hand: upload it on My Profiles to put the real
 * parser in front of every section a profile has, then autofill a form. The
 * e2e (tests/autofill-dropdowns.spec.js) uploads it too, with the parse
 * stubbed by HEAVY_CV_PARSE.
 *
 * It is a text PDF, not an image: the server reads those itself (unpdf) and
 * sends the text to the fast path. The script checks that every line of
 * HEAVY_CV_TEXT reads back out of the file, so a layout that scrambles the
 * text fails here instead of in a parse.
 *
 * Everyone in it is invented (see the fixture's header).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { extractText, getDocumentProxy } from 'unpdf';
import { HEAVY_CV_TEXT } from '../web/tests/fixtures/heavy-cv.js';

const OUT = fileURLToPath(new URL('../web/tests/fixtures/heavy-cv.pdf', import.meta.url));
const SECTIONS = new Set(['Summary', 'Experience', 'Education', 'Certifications', 'Skills']);

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** HEAVY_CV_TEXT as HTML: a name, a contact block, then each section. */
function render(text) {
  const [name, ...rest] = text.split('\n').map((l) => l.trim());
  const contact = [];
  while (rest.length && !SECTIONS.has(rest[0])) contact.push(rest.shift());

  const body = [];
  let section = '';
  for (const line of rest) {
    if (!line) continue;
    if (SECTIONS.has(line)) {
      section = line;
      body.push(`<h2>${escape(line)}</h2>`);
    } else if ((section === 'Experience' || section === 'Education') && line.includes(' — ')) {
      // "Title, Company — dates": the entry's heading, the dates on the
      // right. A degree's "dates, GPA, specialization" is too long to sit
      // there, and gets its own line.
      const [what, when] = line.split(' — ');
      if (when.length > 24) {
        body.push(`<div class="entry"><span class="what">${escape(what)}</span></div><p class="detail">${escape(when)}</p>`);
      } else {
        body.push(`<div class="entry"><span class="what">${escape(what)}</span><span class="when">${escape(when)}</span></div>`);
      }
    } else if (section === 'Experience' || section === 'Certifications') {
      body.push(`<p class="point">• ${escape(line)}</p>`);
    } else {
      body.push(`<p>${escape(line)}</p>`);
    }
  }

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(name)}</title>
<style>
  @page { size: Letter; margin: 0.6in 0.7in; }
  body { font: 10.5pt/1.45 "Segoe UI", Arial, sans-serif; color: #111; margin: 0; }
  /* No letter-spacing: it splits words in the PDF's text ("E XPERIENCE"). */
  h1 { font-size: 22pt; margin: 0 0 4pt; }
  .contact { margin: 0; color: #333; }
  h2 { font-size: 11.5pt; text-transform: uppercase; border-bottom: 1px solid #999; padding-bottom: 2pt; margin: 14pt 0 6pt; }
  .entry { display: flex; justify-content: space-between; gap: 16pt; font-weight: 600; margin: 8pt 0 2pt; }
  .when { font-weight: 400; color: #444; white-space: nowrap; }
  .detail { color: #444; }
  p { margin: 0 0 3pt; }
  .point { padding-left: 10pt; text-indent: -8pt; }
</style></head><body>
<h1>${escape(name)}</h1>
${contact.map((l) => `<p class="contact">${escape(l)}</p>`).join('\n')}
${body.join('\n')}
</body></html>`;
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(render(HEAVY_CV_TEXT), { waitUntil: 'load' });
  const pdf = await page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true });
  writeFileSync(OUT, pdf);

  // Read it back as the server will, and look for every line of the CV.
  const { totalPages, text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true });
  // Case aside: the section headings print in capitals.
  const flat = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const read = flat(text);
  const missing = HEAVY_CV_TEXT.split('\n').map((l) => flat(l).replace(/^•\s*/, '')).filter(Boolean)
    .flatMap((l) => l.split(' — '))
    .filter((piece) => !read.includes(piece));
  if (missing.length) {
    console.error(`heavy-cv.pdf: ${missing.length} line(s) do not read back:\n  ${missing.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`wrote ${OUT}: ${pdf.length} bytes, ${totalPages} page(s), every line reads back`);
  }
} finally {
  await browser.close();
}
