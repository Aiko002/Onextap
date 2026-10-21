/**
 * supabase/templates/: Onextap's auth emails (completion plan B6-0 (a)).
 *
 * Supabase sends these; nothing here runs them. The owner pastes each file
 * into its slot by hand (the folder's README), so this checks what a paste
 * would carry: the Go-template variables Supabase fills, spelled the way
 * Supabase documents them; nothing a mail client fetches or runs (no script,
 * no stylesheet, no image, no address but Supabase's own variables); none of
 * Supabase's default wording left behind; and a README that names every file
 * with a subject of its own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const DIR = path.join(repoRoot, 'supabase', 'templates');

/**
 * One entry per Supabase slot. `needs`: the variables the email cannot do
 * without. Every link is {{ .ConfirmationURL }}: the site runs supabase-js's
 * implicit flow (see the flowType test below), where Supabase's verify
 * address hands the session back in the URL's hash and the page it lands on
 * picks it up.
 */
const TEMPLATES = [
  { file: 'confirm-signup.html', slot: 'Confirm sign up', needs: ['{{ .ConfirmationURL }}'] },
  { file: 'reset-password.html', slot: 'Reset password', needs: ['{{ .ConfirmationURL }}'] },
  { file: 'magic-link.html', slot: 'Magic link', needs: ['{{ .ConfirmationURL }}'] },
  {
    file: 'change-email.html',
    slot: 'Change email address',
    needs: ['{{ .ConfirmationURL }}', '{{ .Email }}', '{{ .NewEmail }}'],
  },
];

/**
 * The variables Supabase documents for these four templates
 * (https://supabase.com/docs/guides/auth/auth-email-templates). NewEmail is
 * the "Change email address" template's alone. Token and TokenHash are left
 * out on purpose: a code needs a page to type it into, and a token-hash link
 * a page that calls verifyOtp, and the site has neither.
 */
const VARIABLES = new Set(['ConfirmationURL', 'SiteURL', 'Email', 'RedirectTo']);
const CHANGE_EMAIL_ONLY = new Set(['NewEmail']);

/**
 * Supabase's own wording, from its current defaults and the older ones a
 * dashboard may still show. Distinct phrases only: a heading like "Reset
 * your password" is plain English, but a sentence Supabase wrote means a
 * default was pasted over only in part.
 */
const SUPABASE_DEFAULT_TEXT = [
  'Follow this link',
  'Follow the link below',
  'confirm your user',
  'Confirm your mail',
  'for your user',
  'Magic Link',
  'Confirm Change of Email',
  'confirm the update of your email',
  'Alternatively, enter the code',
  'safely ignore this email',
  'You have been invited',
  'This link expires shortly and can only be used once',
];

/** The subjects Supabase fills in by default, old and current. */
const SUPABASE_DEFAULT_SUBJECTS = [
  'Confirm Your Signup',
  'Reset Your Password',
  'Your Magic Link',
  'Confirm Email Change',
  'Confirm your email address',
  'Your sign-in link',
  'Confirm your new email address',
];

const read = (file) => readFileSync(path.join(DIR, file), 'utf8');
const withoutComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

test('every template file exists', () => {
  for (const { file } of TEMPLATES) {
    assert.ok(existsSync(path.join(DIR, file)), `supabase/templates/${file} is missing`);
  }
});

test('the folder holds no template this test does not know', () => {
  const html = readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();
  assert.deepEqual(html, TEMPLATES.map((t) => t.file).sort());
});

for (const { file, needs } of TEMPLATES) {
  test(`${file}: carries the variables it needs`, () => {
    const html = read(file);
    for (const variable of needs) {
      assert.ok(html.includes(variable), `${file} has no ${variable}`);
    }
  });

  test(`${file}: its button and its fallback both carry the link`, () => {
    const html = withoutComments(read(file));
    const hrefs = html.match(/href="\{\{ \.ConfirmationURL \}\}"/g) || [];
    assert.ok(hrefs.length >= 2, `${file}: expected a button and a fallback link, found ${hrefs.length} link(s)`);
    // The fallback shows the address itself, for a client that hides buttons.
    assert.match(html, />\s*\{\{ \.ConfirmationURL \}\}\s*</, `${file}: the fallback link does not show the address`);
  });

  test(`${file}: uses only Supabase's documented variables, spelled as documented`, () => {
    const html = read(file);
    const opens = (html.match(/\{\{/g) || []).length;
    const closes = (html.match(/\}\}/g) || []).length;
    assert.equal(opens, closes, `${file}: unbalanced {{ }}`);
    const allowed = file === 'change-email.html' ? new Set([...VARIABLES, ...CHANGE_EMAIL_ONLY]) : VARIABLES;
    for (const [, inner] of html.matchAll(/\{\{([^}]*)\}\}/g)) {
      const name = /^ \.([A-Za-z]+) $/.exec(inner);
      assert.ok(name, `${file}: "{{${inner}}}" is not written as {{ .Name }}`);
      assert.ok(allowed.has(name[1]), `${file}: {{ .${name[1]} }} is not a variable this template can use`);
    }
  });

  test(`${file}: nothing a mail client would fetch or run`, () => {
    const html = read(file);
    assert.doesNotMatch(html, /<script\b/i, `${file} has a <script>`);
    assert.doesNotMatch(html, /<link\b/i, `${file} links a stylesheet (or anything else)`);
    assert.doesNotMatch(html, /@import/i, `${file} imports a stylesheet`);
    // Inline styles only: many mail clients drop a <style> block.
    assert.doesNotMatch(html, /<style\b/i, `${file} has a <style> block`);
    assert.doesNotMatch(html, /<img\b/i, `${file} has an image (remote images and tracking pixels are out)`);
    assert.doesNotMatch(html, /url\s*\(/i, `${file} has a CSS url()`);
    // Every address in the email is one Supabase fills in, so nothing is
    // hot-linked and nothing points at one project from another's email.
    const literal = html.match(/(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/gi);
    assert.equal(literal, null, `${file} has a literal address: ${literal}`);
  });

  test(`${file}: none of Supabase's default wording is left`, () => {
    const html = withoutComments(read(file)).toLowerCase();
    for (const phrase of SUPABASE_DEFAULT_TEXT) {
      assert.ok(!html.includes(phrase.toLowerCase()), `${file} still says "${phrase}"`);
    }
  });

  test(`${file}: is an email laid out in tables, and says it is Onextap's`, () => {
    const html = read(file);
    assert.match(html, /<table\b[^>]*role="presentation"/, `${file}: no layout table`);
    assert.match(withoutComments(html), /Onextap/, `${file} never names Onextap`);
  });
}

test('the README names every template, its slot and an Onextap subject', () => {
  const readme = read('README.md');
  for (const { file, slot } of TEMPLATES) {
    const row = readme.split('\n').find((line) => line.startsWith('|') && line.includes(`\`${file}\``));
    assert.ok(row, `README.md has no table row for ${file}`);
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    assert.equal(cells.length, 3, `README.md: the row for ${file} should be | slot | file | subject |`);
    const [slotCell, , subject] = cells;
    assert.ok(slotCell.includes(slot), `README.md: ${file} should go in "${slot}", the row says "${slotCell}"`);
    const bare = subject.replace(/`/g, '');
    assert.match(bare, /Onextap/, `README.md: the subject for ${file} does not name Onextap`);
    for (const fallback of SUPABASE_DEFAULT_SUBJECTS) {
      assert.notEqual(bare.toLowerCase(), fallback.toLowerCase(), `README.md: ${file}'s subject is Supabase's default`);
    }
  }
});

test('the site still runs the implicit flow the templates are written for', () => {
  // With flowType 'pkce', a link opened in another browser than the one that
  // asked would fail; revisit the templates (and the README) before changing it.
  const client = readFileSync(path.join(repoRoot, 'src', 'supabaseClient.js'), 'utf8');
  assert.doesNotMatch(client, /flowType/, 'src/supabaseClient.js sets a flowType: check supabase/templates/README.md');
});
