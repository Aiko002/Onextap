/**
 * The icons (completion plan B6-0 (c)): the browser tab and the extension
 * show the transparent ring mark that the landing (web/src/features/nav) and
 * the dashboard topbar draw inline. scripts/make-icons.mjs renders every PNG
 * from one SVG, web/public/favicon.svg; these check the committed files are
 * what it declares, and that the manifest and every page point at them.
 *
 * The PNGs are decoded here with node:zlib only (no image library), enough
 * to read their pixels: 8-bit RGBA, not interlaced, which is what Chromium's
 * screenshots are.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import { checkReleaseManifest, releaseManifest } from '../../scripts/releaseManifest.js';
import {
  ICON_COLOUR,
  MARK_VIEWBOX,
  SOURCE,
  POPUP_FAVICON,
  TARGETS,
  iconSvg,
  markPath,
} from '../../scripts/make-icons.mjs';

const root = new URL('../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root));
const readText = (rel) => readFileSync(new URL(rel, root), 'utf8');
const manifest = () => JSON.parse(readText('extension/manifest.json'));

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A PNG's header and, for 8-bit RGBA without interlace, its pixels unfiltered. */
function decodePng(buf) {
  assert.ok(buf.subarray(0, 8).equals(PNG_SIGNATURE), 'a PNG signature');
  let header = null;
  const idat = [];
  for (let off = 8; off < buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colourType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  assert.ok(header, 'an IHDR chunk');
  if (header.depth !== 8 || header.colourType !== 6 || header.interlace !== 0) return { ...header, pixels: null };

  const { width, height } = header;
  const stride = width * 4;
  const raw = inflateSync(Buffer.concat(idat));
  assert.equal(raw.length, height * (stride + 1), 'the image data is whole');
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= 4 ? out[y * stride + x - 4] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4] : 0;
      let predicted;
      if (filter === 0) predicted = 0;
      else if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else {
        assert.fail(`unknown PNG filter ${filter} on row ${y}`);
      }
      out[y * stride + x] = (v + predicted) & 0xff;
    }
  }
  return { ...header, pixels: out };
}

const hex = (r, g, b) => '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();

/** Within 2 of each other on every channel: where the small sizes' stroke
 * meets the fill, the blend can round a fully opaque pixel one step off. */
const sameColour = (a, b) =>
  [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 2);

/**
 * A transparent, one-colour icon of `size`: RGBA, every corner clear, the
 * mark drawn (some pixel fully opaque), and every opaque pixel `colour`.
 */
function assertTransparentMark(rel, size, colour = ICON_COLOUR) {
  assert.ok(existsSync(new URL(rel, root)), `${rel} exists`);
  const png = decodePng(read(rel));
  assert.equal(png.width, size, `${rel} is ${size} wide`);
  assert.equal(png.height, size, `${rel} is ${size} tall`);
  assert.equal(png.colourType, 6, `${rel} is RGBA (colour type 6)`);
  assert.equal(png.depth, 8, `${rel} is 8-bit`);
  assert.ok(png.pixels, `${rel} decodes`);

  const alpha = (x, y) => png.pixels[(y * size + x) * 4 + 3];
  for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
    assert.equal(alpha(x, y), 0, `${rel}: the corner (${x}, ${y}) is transparent`);
  }
  // The middle of the ring is its hole.
  assert.equal(alpha(size >> 1, size >> 1), 0, `${rel}: the ring's hole is transparent`);

  const opaque = new Set();
  for (let i = 0; i < png.pixels.length; i += 4) {
    if (png.pixels[i + 3] === 255) opaque.add(hex(png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]));
  }
  assert.ok(opaque.has(colour.toUpperCase()), `${rel}: the mark is drawn, in ${colour}`);
  const others = [...opaque].filter((c) => !sameColour(c, colour));
  assert.deepEqual(others, [], `${rel}: one colour`);
}

// ---------- the generator's pure parts ----------

test('markPath: the one path of an SVG or a page that draws the mark', () => {
  const d = 'M0 0L1 1Z';
  assert.equal(markPath(`<svg viewBox="${MARK_VIEWBOX}"><path fill-rule="evenodd" d="${d}"/></svg>`), d);
  assert.throws(() => markPath('<svg></svg>'), /mark/);
  assert.throws(
    () => markPath(`<svg viewBox="${MARK_VIEWBOX}"><path d="${d}"/><path d="${d}"/></svg>`),
    /mark/,
  );
});

test('iconSvg: the mark centred in a square, as tall as asked, stroke included', () => {
  const d = markPath(readText(SOURCE));
  for (const { size, height, stroke } of [
    { size: 128, height: 96, stroke: 0 },
    { size: 16, height: 16, stroke: 6 },
    { size: 32, height: 30, stroke: 2.5 },
  ]) {
    const svg = iconSvg(d, { size, height, stroke, colour: ICON_COLOUR });
    assert.match(svg, new RegExp(`width="${size}" height="${size}"`));
    assert.ok(svg.includes(`d="${d}"`), 'the same path');
    assert.match(svg, /fill-rule="evenodd"/);
    assert.ok(svg.includes(`fill="${ICON_COLOUR}"`));

    const [vx, vy, vw, vh] = /viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number);
    assert.ok(Math.abs(vw - vh) < 1e-9, 'square');
    assert.ok(Math.abs(vx + vw / 2 - 92.84 / 2) < 1e-9, 'centred across');
    assert.ok(Math.abs(vy + vh / 2 - 50) < 1e-9, 'centred down');
    // The mark is 100 units tall, plus half the stroke above and below.
    assert.ok(Math.abs(((100 + stroke) * size) / vh - height) < 1e-9, `${height}px tall in ${size}`);
    if (stroke) {
      assert.match(svg, new RegExp(`stroke="${ICON_COLOUR}" stroke-width="${stroke}"`));
    } else {
      assert.doesNotMatch(svg, /stroke=/);
    }
  }
});

// ---------- the committed files ----------

test('the favicon is the mark: the same path the landing and the dashboard draw', () => {
  const svg = readText(SOURCE);
  const d = markPath(svg);
  assert.equal(d, markPath(readText('web/src/features/nav/nav.html')), 'the landing\'s mark');
  assert.equal(d, markPath(readText('web/dashboard/index.html')), 'the dashboard\'s mark');
  assert.match(svg, new RegExp(`viewBox="${MARK_VIEWBOX}"`));
  assert.match(svg, /fill-rule="evenodd"/);
  assert.match(svg, /@media\s*\(prefers-color-scheme:\s*dark\)/, 'a dark-tab variant');

  // Both colours come from the site's palette.
  const tokens = readText('web/src/shared/styles/tokens.css');
  const fills = [...svg.matchAll(/fill:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1].toUpperCase());
  assert.equal(fills.length, 2, 'a light and a dark fill');
  assert.notEqual(fills[0], fills[1]);
  for (const fill of fills) {
    assert.match(tokens.toUpperCase(), new RegExp(`--[A-Z0-9-]+:\\s*${fill}`), `${fill} is a token`);
  }
  assert.match(tokens.toUpperCase(), new RegExp(`--[A-Z0-9-]+:\\s*${ICON_COLOUR.toUpperCase()}`), 'the PNG colour too');

  // The popup is the other build: it carries its own copy, byte for byte.
  assert.ok(read(POPUP_FAVICON).equals(read(SOURCE)), `${POPUP_FAVICON} is a copy of ${SOURCE}`);
});

test('every PNG make-icons.mjs declares is committed, at its size, transparent', () => {
  const files = TARGETS.map((t) => t.file);
  assert.equal(new Set(files).size, files.length, 'no file twice');
  for (const required of [
    'public/icons/icon-16.png',
    'public/icons/icon-32.png',
    'public/icons/icon-48.png',
    'public/icons/icon-128.png',
    'public/icon.png',
    'web/public/icon.png',
    'web/public/favicon-32.png',
    'docs/brand/google-consent-logo-120.png',
  ]) {
    assert.ok(files.includes(required), `make-icons.mjs renders ${required}`);
  }
  for (const { file, size } of TARGETS) assertTransparentMark(file, size);
  assert.equal(TARGETS.find((t) => t.file === 'docs/brand/google-consent-logo-120.png').size, 120);
});

test('the manifest\'s icons and the toolbar icon are the transparent mark at 16, 32, 48 and 128', () => {
  const m = manifest();
  assert.deepEqual(Object.keys(m.icons).map(Number), [16, 32, 48, 128]);
  const toolbar = m.action.default_icon;
  assert.equal(typeof toolbar, 'object', 'action.default_icon lists sizes');
  assert.deepEqual(Object.keys(toolbar).map(Number), [16, 32]);
  for (const [size, file] of [...Object.entries(m.icons), ...Object.entries(toolbar)]) {
    assert.equal(file, m.icons[size], `${size}: the toolbar and the icons agree`);
    assertTransparentMark(`public/${file}`, Number(size));
  }
});

test('the release manifest still passes build:release\'s check, icons included', () => {
  const release = releaseManifest(manifest());
  assert.deepEqual(checkReleaseManifest(release), []);
  assert.equal(typeof release.icons, 'object');
  assert.deepEqual(release.icons, manifest().icons);
  assert.deepEqual(release.action.default_icon, manifest().action.default_icon);
  assert.equal(release.permissions.length, 4, 'no permission change');
});

const PAGES = [
  // [page, the folder its absolute URLs are served from]
  ['index.html', 'public/'],
  ['web/index.html', 'web/public/'],
  ['web/404.html', 'web/public/'],
  ['web/about/index.html', 'web/public/'],
  ['web/contact/index.html', 'web/public/'],
  ['web/privacy/index.html', 'web/public/'],
  ['web/reset-password/index.html', 'web/public/'],
  ['web/dashboard/index.html', 'web/public/'],
  ['web/dashboard/contact/index.html', 'web/public/'],
  ['web/dashboard/privacy/index.html', 'web/public/'],
];

test('every page links the SVG favicon, then its PNG fallback', () => {
  const favicon = read(SOURCE);
  for (const [page, served] of PAGES) {
    const head = readText(page).split(/<\/head>/i)[0];
    const icons = [...head.matchAll(/<link\b[^>]*\brel="icon"[^>]*>/gi)].map((m) => m[0]);
    const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

    const svg = icons.filter((tag) => attr(tag, 'type') === 'image/svg+xml');
    assert.equal(svg.length, 1, `${page}: one SVG favicon`);
    const svgHref = attr(svg[0], 'href');
    assert.match(svgHref, /^\/.*\.svg$/, `${page}: an absolute path`);
    assert.ok(read(served + svgHref.slice(1)).equals(favicon), `${page}: ${svgHref} is the mark's favicon`);

    const png = icons.filter((tag) => attr(tag, 'type') === 'image/png');
    assert.equal(png.length, 1, `${page}: one PNG fallback`);
    const pngHref = attr(png[0], 'href');
    assert.equal(attr(png[0], 'sizes'), '32x32', `${page}: the fallback says its size`);
    assertTransparentMark(served + pngHref.slice(1), 32);

    assert.equal(icons.length, 2, `${page}: no other icon link (the opaque icon.png is gone)`);
    // Chrome takes the SVG over a PNG that names its size; listing the PNG
    // first is the usual order for the browsers that cannot read the SVG.
    assert.ok(head.indexOf(png[0]) < head.indexOf(svg[0]), `${page}: the PNG first, then the SVG`);
  }
});
