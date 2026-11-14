/**
 * POST /api/parse-resume picks its path by the file, through the real app
 * with fake Supabase, Groq and Gemini on loopback (./fakeServices.js):
 *
 *   PDF with a text layer → text read on the server, fields from Groq,
 *                           the extracted text returned as the transcription.
 *   scanned PDF, image    → Gemini reads the file, as before.
 *   Groq fails or answers nothing usable → Gemini, so the upload still works.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { startHarness } from './harness.js';
import { fakeSupabase, fakeGroq, fakeGemini } from './fakeServices.js';
import { memorySpendStore } from '../../server/lib/generationSpend.js';
import { textPdf, imagePdf, CV_LINES } from './pdfFixture.js';
import { extractPdfText, hasTextLayer } from '../../server/lib/pdfText.js';

const users = { 'token-a': { id: '00000000-0000-4000-8000-00000000000a', email: 'a@example.com' } };
const supabase = fakeSupabase({ store: memorySpendStore(), users });
const groq = fakeGroq();
const gemini = fakeGemini();

const harness = await startHarness({
  fakes: {
    SUPABASE_URL: supabase.handler,
    GROQ_BASE_URL: groq.handler,
    GEMINI_BASE_URL: gemini.handler,
  },
});
test.after(() => harness.close());

const GROQ_FIELDS = { firstName: 'Priya', lastName: 'Sharma', phone: '+91 98765 43210', skills: ['Kafka'] };
const groqOk = () => ({ content: JSON.stringify(GROQ_FIELDS) });
const GEMINI_FIELDS = { firstName: 'Scan', lastName: 'Person', __rawText: 'Scan Person\nEngineer' };
const geminiOk = () => JSON.stringify(GEMINI_FIELDS);

test.beforeEach(() => {
  groq.calls.length = 0;
  gemini.calls.length = 0;
  groq.state.reply = groqOk;
  gemini.state.reply = geminiOk;
});

async function parse(bytes, fileType = 'application/pdf', fileName = 'cv.pdf') {
  const res = await harness.request('POST', '/api/parse-resume', {
    headers: { 'content-type': 'application/json', authorization: 'Bearer token-a' },
    body: { fileData: Buffer.from(bytes).toString('base64'), fileName, fileType },
  });
  return { status: res.status, body: res.body ? JSON.parse(res.body) : null };
}

// ---------- Extraction on its own ----------

test('a text PDF yields its text; a scan and junk yield nothing', async () => {
  const text = await extractPdfText(textPdf(CV_LINES));
  for (const line of ['Priya Sharma', 'Senior Software Engineer, Acme Corp', 'TypeScript, Node.js']) {
    assert.ok(text.includes(line), `missing: ${line}\n---\n${text}`);
  }
  assert.ok(hasTextLayer(text));

  assert.equal(await extractPdfText(imagePdf()), '');
  assert.equal(await extractPdfText(Buffer.from('not a pdf at all')), '');
  assert.equal(hasTextLayer('Page 1'), false);
});

// ---------- Routing ----------

test('a text PDF: Groq reads the text, Gemini is never called', async () => {
  const res = await parse(textPdf(CV_LINES));

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.data, GROQ_FIELDS);
  assert.ok(res.body.text.includes('Priya Sharma'), 'the extracted text is the transcription');
  assert.equal(gemini.calls.length, 0);
  assert.equal(groq.calls.length, 1);

  const [call] = groq.calls;
  assert.deepEqual(call.response_format, { type: 'json_object' });
  assert.ok(call.messages[1].content.includes('Cut p95 checkout latency'), 'the resume text is in the prompt');
  assert.ok(!call.messages[0].content.includes('__rawText'), 'no transcription asked for');
});

test('a scanned PDF goes to Gemini, which reads the file', async () => {
  const res = await parse(imagePdf());

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.data, { firstName: 'Scan', lastName: 'Person' });
  assert.equal(res.body.text, 'Scan Person\nEngineer');
  assert.equal(groq.calls.length, 0);
  assert.equal(gemini.calls.length, 1);

  const { body } = gemini.calls[0];
  assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'application/pdf');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
});

test('an image goes to Gemini without trying to read it as a PDF', async () => {
  const res = await parse(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png', 'cv.png');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(groq.calls.length, 0);
  assert.equal(gemini.calls.length, 1);
});

test('Groq failing falls back to Gemini, and the upload still works', async () => {
  for (const reply of [
    () => ({ status: 500, message: 'down' }),
    () => ({ content: 'this is not json' }),
    () => ({ content: '{}' }),
    () => ({ content: '{"firstName":"Pri', finish: 'length' }),
  ]) {
    groq.calls.length = 0;
    gemini.calls.length = 0;
    groq.state.reply = reply;

    const res = await parse(textPdf(CV_LINES));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.firstName, 'Scan', 'Gemini answered');
    assert.equal(groq.calls.length, 1);
    assert.equal(gemini.calls.length, 1);
  }
});

test('signed out: 401, and no model is called', async () => {
  const res = await harness.request('POST', '/api/parse-resume', {
    headers: { 'content-type': 'application/json' },
    body: { fileData: Buffer.from(textPdf(CV_LINES)).toString('base64'), fileType: 'application/pdf' },
  });
  assert.equal(res.status, 401);
  assert.equal(groq.calls.length + gemini.calls.length, 0);
});
