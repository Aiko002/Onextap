/**
 * CLAUDE.md rule 5, behaviourally: the two page scrapers give the same answer
 * on job-board markup.
 *
 * scrapeJobPage() (extension/background.js) and scrapePageContext()
 * (public/content.js) cannot call each other, so each is run here from its
 * own source, in a bare vm context, against the same stub pages. The one
 * intended difference is that scrapePageContext() also reads school /
 * university / organization / essay markup for college and scholarship
 * applications; scrapeJobPage() scrapes job pages only, and must not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { scrapeJobPage, scrapePageContext, runScraper } from './scrapers.js';

const SCRAPERS = {
  scrapeJobPage: scrapeJobPage().source,
  scrapePageContext: scrapePageContext().source,
};

const og = (content) => ({ tag: 'meta', attrs: { property: 'og:site_name' }, content });
const long = (word, n = 40) => Array.from({ length: n }, () => word).join(' ');

/** Run `page` through both scrapers and check `expected` against each. */
function both(name, page, expected) {
  for (const [scraper, source] of Object.entries(SCRAPERS)) {
    test(`${scraper}: ${name}`, () => {
      const result = runScraper(source, page);
      for (const [key, value] of Object.entries(expected)) assert.equal(result[key], value, key);
    });
  }
}

// ── Shared behaviour ──────────────────────────────────────────────────────

both(
  'og:site_name wins over company markup',
  { elements: [og(' Acme '), { className: 'company-name', innerText: 'Other' }], title: 'Role - Title Co' },
  { company: 'Acme' },
);

both(
  'a blank og:site_name falls through to the company selectors, case-insensitively',
  { elements: [og('   '), { className: 'TopCard__CompanyName', innerText: ' Initech ' }] },
  { company: 'Initech' },
);

both(
  'a company element with no text is skipped for the next selector',
  {
    elements: [
      { className: 'company-name', innerText: '   ' },
      { attrs: { 'data-testid': 'job-company' }, innerText: 'Globex' },
    ],
  },
  { company: 'Globex' },
);

both(
  'company selectors are tried in list order, not document order',
  {
    elements: [
      { className: 'employer-info', innerText: 'Employer Co' },
      { className: 'company-name', innerText: 'Name Co' },
    ],
  },
  { company: 'Name Co' },
);

both('the title fallback takes the last " - " segment', { title: 'Senior Engineer - Acme Corp' }, { company: 'Acme Corp' });
both('the title fallback splits on " at "', { title: 'Engineer at Initech' }, { company: 'Initech' });
both('the title fallback splits on | and —', { title: 'Engineer | Hooli — Careers' }, { company: 'Careers' });
both('a title with no separator gives no company', { title: 'Careers' }, { company: '' });

both(
  'the longest description candidate wins, whitespace collapsed',
  {
    elements: [
      { className: 'job-description', innerText: 'short' },
      { tag: 'article', innerText: '  a much   longer\n\n article text ' },
    ],
  },
  { description: 'a much longer article text' },
);

both(
  '#job-details is a description candidate',
  { elements: [{ id: 'job-details', innerText: long('details') }, { tag: 'main', innerText: 'main' }] },
  { description: long('details') },
);

both('the description is capped at 8000 characters', { elements: [{ tag: 'article', innerText: 'x'.repeat(9000) }] }, {
  description: 'x'.repeat(8000),
});

both('with no candidate, the body text is the description', { body: '  Body   text \n here ' }, { description: 'Body text here' });
both('with no candidate and no body, the description is empty', { body: null }, { description: '' });

// ── Job-board fixes (rule 5: both copies carry them) ──────────────────────

// [class*="company-name" i] already matches this class, but only finds the
// first such element; the exact class reaches past an empty one.
both(
  "LinkedIn's .job-details-jobs-unified-top-card__company-name behind an empty company-name element",
  {
    elements: [
      { className: 'company-name', innerText: '' },
      { className: 'job-details-jobs-unified-top-card__company-name', innerText: 'LinkedIn Co' },
    ],
    title: 'Role | Fallback',
  },
  { company: 'LinkedIn Co' },
);

both(
  "LinkedIn's .jobs-box__html-content",
  {
    elements: [
      { className: 'jobs-box__html-content', innerText: long('posting') },
      { tag: 'main', innerText: 'short main' },
    ],
  },
  { description: long('posting') },
);

both(
  'a data-testid description',
  {
    elements: [
      { attrs: { 'data-testid': 'jobDescriptionText' }, innerText: long('testid') },
      { tag: 'main', innerText: 'short main' },
    ],
  },
  { description: long('testid') },
);

both(
  '.jobs-description behind an earlier, shorter description element',
  {
    elements: [
      { className: 'description', innerText: 'tiny' },
      { className: 'jobs-description', innerText: long('jobs') },
    ],
  },
  { description: long('jobs') },
);

both(
  'a jobDescription class behind an earlier, shorter description element',
  {
    elements: [
      { className: 'description', innerText: 'tiny' },
      { className: 'jobDescriptionContent', innerText: long('camel') },
    ],
  },
  { description: long('camel') },
);

both(
  'on an exact-length tie, the earlier selector in the list wins',
  {
    elements: [
      { className: 'description', innerText: 'from-description' },
      { id: 'job-details', innerText: 'from-job-details' },
    ],
  },
  // 16 characters each; #job-details precedes [class*="description" i].
  { description: 'from-job-details' },
);

// ── Application pages: the form is not the description ───────────────────
// Measured on real boards on 2026-10-20. A page with the ad and the form
// together has a container holding both, longer than the ad alone, and its
// body is every question on the form.

const input = (type) => ({ tag: 'input', attrs: type ? { type } : {} });
const FORM = { tag: 'form', children: [input('text'), input('file'), { tag: 'textarea' }, { tag: 'select' }] };

both(
  'a main holding the application form loses to a shorter description with no controls (Greenhouse)',
  {
    elements: [
      {
        tag: 'main',
        innerText: `${long('posting')} ${long('question')}`,
        children: [{ className: 'job__description', innerText: long('posting') }, FORM],
      },
    ],
    body: `${long('posting')} ${long('question')}`,
  },
  { description: long('posting') },
);

both(
  'a page with form controls and no description candidate has no description, not the body text (Lever /apply)',
  { elements: [FORM], body: 'Cookie notice. Full name. Email. Resume/CV. SUBMIT APPLICATION' },
  { description: '' },
);

both(
  'a page with form controls and only form candidates has no description',
  { elements: [{ tag: 'article', innerText: long('question'), children: [FORM] }], body: long('question') },
  { description: '' },
);

// An application asks for prose or a file. Found in B5's review: counting any
// input made a job ad with a site search box in its <main> (or anywhere on
// the page) lose its description.
for (const [label, control] of [
  ['a textarea', { tag: 'textarea' }],
  ['a file input', input('file')],
]) {
  both(`${label} anywhere on the page turns the body fallback off`, { elements: [control], body: 'Body text' }, { description: '' });
}

for (const [label, control] of [
  ['a search form', { tag: 'form', children: [input('search')] }],
  ['a select', { tag: 'select' }],
  ['a text input', input('text')],
  ['an input with no type', input()],
  ['an email field', input('email')],
]) {
  both(`${label} alone does not make the page a form: the body fallback stays`, { elements: [control], body: 'Body text' }, { description: 'Body text' });
}

both(
  'a job ad whose main holds a search box is still the description',
  { elements: [{ tag: 'main', innerText: long('posting'), children: [{ tag: 'form', children: [input('search')] }] }] },
  { description: long('posting') },
);

both(
  'a page with no form controls keeps the body fallback; a hidden input is not one',
  { elements: [{ className: 'site-header', innerText: 'Jobs' }, input('hidden')], body: '  The   job ad ' },
  { description: 'The job ad' },
);

both(
  'a hidden input inside a candidate does not make it a form',
  {
    elements: [
      { className: 'job-description', innerText: long('posting'), children: [input('hidden')] },
      { tag: 'main', innerText: 'short main' },
    ],
  },
  { description: long('posting') },
);

both(
  'a candidate that is itself a control is skipped',
  {
    elements: [
      { tag: 'textarea', className: 'description-field', innerText: long('typed') },
      { tag: 'article', innerText: 'the job ad' },
    ],
  },
  { description: 'the job ad' },
);

// ── The intended difference ───────────────────────────────────────────────

const ACADEMIC_COMPANY = [
  ['organization', { className: 'organization-name', innerText: 'Rotary Club' }],
  ['school', { className: 'school-name', innerText: 'Springfield High' }],
  ['university', { className: 'university-title', innerText: 'State University' }],
];

for (const [kind, element] of ACADEMIC_COMPANY) {
  test(`scrapePageContext: reads ${kind} markup as the institution`, () => {
    const result = runScraper(SCRAPERS.scrapePageContext, { elements: [element], title: 'Apply | Fallback' });
    assert.equal(result.company, element.innerText);
  });

  test(`scrapeJobPage: ignores ${kind} markup`, () => {
    const result = runScraper(SCRAPERS.scrapeJobPage, { elements: [element], title: 'Apply | Fallback' });
    assert.equal(result.company, 'Fallback');
  });
}

test('scrapePageContext: academic institutions come after every job-board selector', () => {
  const result = runScraper(SCRAPERS.scrapePageContext, {
    elements: [
      { className: 'school-name', innerText: 'Springfield High' },
      { className: 'employer', innerText: 'Employer Co' },
    ],
  });
  assert.equal(result.company, 'Employer Co');
});

for (const kind of ['personal-statement', 'essay']) {
  const page = { elements: [{ className: `${kind}-prompt`, innerText: long(kind) }], body: 'Body' };

  test(`scrapePageContext: reads ${kind} markup as the description`, () => {
    assert.equal(runScraper(SCRAPERS.scrapePageContext, page).description, long(kind));
  });

  test(`scrapeJobPage: ignores ${kind} markup`, () => {
    assert.equal(runScraper(SCRAPERS.scrapeJobPage, page).description, 'Body');
  });
}

// The academic candidates and the controls rule (completion plan B6-1). On an
// essay page the prompt and its textarea share a wrapper, and what is typed in
// a textarea is not in innerText, so a personal-statement or essay wrapper
// that holds its textarea is the prompt, not the form. The job-ad candidates
// keep the rule, and so does the body fallback.
test('scrapePageContext: an essay prompt beside its textarea is the description', () => {
  const page = { elements: [{ className: 'essay-prompt', innerText: long('prompt') }, { tag: 'textarea' }], body: 'Body' };
  assert.equal(runScraper(SCRAPERS.scrapePageContext, page).description, long('prompt'));
});

for (const kind of ['personal-statement', 'essay']) {
  const page = {
    elements: [{ className: `${kind}-question`, innerText: `  ${long('prompt')}  `, children: [{ tag: 'textarea' }] }],
    body: `${long('prompt')} Submit`,
  };

  test(`scrapePageContext: ${kind} markup wrapping its textarea gives its prompt`, () => {
    assert.equal(runScraper(SCRAPERS.scrapePageContext, page).description, long('prompt'));
  });

  test(`scrapeJobPage: ${kind} markup wrapping its textarea is no description, and the body fallback stays off`, () => {
    assert.equal(runScraper(SCRAPERS.scrapeJobPage, page).description, '');
  });
}

test('scrapePageContext: an essay wrapper holding a file input as well still gives its prompt', () => {
  const page = {
    elements: [{ className: 'essay-block', innerText: long('prompt'), children: [{ tag: 'textarea' }, input('file')] }],
  };
  assert.equal(runScraper(SCRAPERS.scrapePageContext, page).description, long('prompt'));
});

test('scrapePageContext: an essay-classed wrapper around a whole form (more than one textarea) is the form, not a prompt', () => {
  // A job board's /apply page whose form sits in an "essay" class: holding
  // several textareas, it is not one prompt and its own answer box, so the
  // controls rule applies and the page gives no description.
  const page = {
    elements: [{ className: 'essay-form', innerText: long('questions'), children: [{ tag: 'textarea' }, { tag: 'textarea' }, input('file')] }],
    body: long('questions'),
  };
  assert.equal(runScraper(SCRAPERS.scrapePageContext, page).description, '');
});

test('scrapePageContext: on an essay page, the main holding the form is skipped and the essay wrapper read', () => {
  const page = {
    elements: [{
      tag: 'main',
      innerText: `${long('prompt')} ${long('question')}`,
      children: [{ className: 'essay-question', innerText: long('prompt'), children: [{ tag: 'textarea' }] }, FORM],
    }],
    body: `${long('prompt')} ${long('question')}`,
  };
  assert.equal(runScraper(SCRAPERS.scrapePageContext, page).description, long('prompt'));
});

test('scrapePageContext: an essay candidate that is itself the textarea is still skipped', () => {
  const page = {
    elements: [{ tag: 'textarea', className: 'essay-answer', innerText: long('typed') }, { tag: 'article', innerText: 'the prompt' }],
  };
  assert.equal(runScraper(SCRAPERS.scrapePageContext, page).description, 'the prompt');
});

test('scrapePageContext: a job-ad candidate holding a textarea is still skipped', () => {
  for (const className of ['job-description', 'description']) {
    const page = { elements: [{ className, innerText: long('question'), children: [{ tag: 'textarea' }] }], body: long('question') };
    assert.equal(runScraper(SCRAPERS.scrapePageContext, page).description, '', className);
  }
});

test('scrapePageContext: a job-ad candidate holding controls still loses to an essay wrapper that holds its own', () => {
  const page = {
    elements: [
      { className: 'job-description', innerText: `${long('prompt')} ${long('question')}`, children: [FORM] },
      { className: 'essay-question', innerText: long('prompt'), children: [{ tag: 'textarea' }] },
    ],
  };
  assert.equal(runScraper(SCRAPERS.scrapePageContext, page).description, long('prompt'));
});

test('scrapePageContext: an essay page with a textarea and no essay markup has no description, not the body', () => {
  const page = { elements: [{ tag: 'label', innerText: 'Tell us about yourself' }, { tag: 'textarea' }], body: 'Tell us about yourself Submit' };
  assert.equal(runScraper(SCRAPERS.scrapePageContext, page).description, '');
});
