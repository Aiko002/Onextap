/**
 * Minimal, valid PDFs built in memory, for the resume-parse tests.
 *
 * `textPdf(lines)` has a real text layer (Helvetica, one line per entry), the
 * shape of an exported CV. `imagePdf()` has a page and no text at all, which
 * is how a scanned CV looks to a text extractor.
 */

function build(objects) {
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const escape = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);

/** @param {string[]} lines */
export function textPdf(lines) {
  const stream = ['BT', '/F1 11 Tf', '14 TL', '50 760 Td']
    .concat(lines.map((l) => `(${escape(l)}) Tj T*`), ['ET'])
    .join('\n');
  return build([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]);
}

export function imagePdf() {
  const stream = '0.5 g 50 50 500 700 re f';
  return build([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]);
}

/** A believable one-page CV's lines, comfortably over the text-layer threshold. */
export const CV_LINES = [
  'Priya Sharma',
  'priya.sharma@example.com | +91 98765 43210 | Bengaluru, India',
  'EXPERIENCE',
  'Senior Software Engineer, Acme Corp, Jan 2021 - Present',
  '- Led the migration of the billing service to event sourcing',
  '- Cut p95 checkout latency from 900ms to 250ms',
  'Software Engineer, Globex, Jul 2018 - Dec 2020',
  'EDUCATION',
  'B.Tech, Computer Science, IIT Delhi, 2014 - 2018',
  'SKILLS',
  'TypeScript, Node.js, PostgreSQL, Kafka, AWS',
];
