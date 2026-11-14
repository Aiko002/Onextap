/**
 * Text out of a PDF, on the server, with no model involved.
 *
 * Used by POST /api/parse-resume (server/routes/resume.js) to decide which
 * way a resume goes. A PDF with a text layer, which is nearly every exported
 * CV, is read here in milliseconds and its text goes to Groq for the fields.
 * A scan or a photo has no text layer, so this returns '' and the file goes
 * to Gemini, which can read images.
 *
 * The text returned here also becomes the resume's stored transcription
 * (`cvText`), replacing the verbatim copy Gemini used to type out. That copy
 * was most of what made parsing slow.
 */
import { extractText, getDocumentProxy } from 'unpdf';
import { log } from '../logger.js';

/**
 * Fewer characters than this and the PDF is treated as a scan. A real
 * one-page CV is well over a thousand; a scanned one yields nothing, or a
 * stray page number or watermark.
 */
export const MIN_TEXT_LAYER_CHARS = 200;

/** Resumes are short. Pages past this are not read, so a huge PDF cannot stall the request. */
const MAX_PAGES = 10;

/** Extraction normally takes milliseconds; past this, Gemini handles the file instead. */
const EXTRACT_TIMEOUT_MS = 5000;

/**
 * The PDF's text, pages joined by blank lines, whitespace tidied.
 *
 * Never throws: a broken, encrypted or image-only PDF yields '', which the
 * caller reads as "send it to Gemini".
 *
 * @param {Buffer|Uint8Array} bytes The decoded file.
 * @returns {Promise<string>}
 */
export async function extractPdfText(bytes) {
  let timer;
  try {
    const work = (async () => {
      // verbosity 0: pdf.js otherwise prints its own warnings with a raw
      // console.log, around the redacting logger (rule 11).
      const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
      if (pdf.numPages > MAX_PAGES) return '';
      const { text } = await extractText(pdf, { mergePages: false });
      return (Array.isArray(text) ? text : [text])
        .map((page) => String(page || '')
          // Any whitespace but a newline, non-breaking spaces included.
          .replace(/[^\S\n]+/g, ' ')
          .replace(/ *\n */g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim())
        .filter(Boolean)
        .join('\n\n');
    })();
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(''), EXTRACT_TIMEOUT_MS);
    });
    return await Promise.race([work, timeout]);
  } catch (error) {
    log.warn('pdf text extraction failed; using the vision path', { errName: error?.name });
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Does this text look like a real text layer rather than a scan's leftovers?
 * @param {string} text
 * @returns {boolean}
 */
export function hasTextLayer(text) {
  return typeof text === 'string' && text.replace(/\s/g, '').length >= MIN_TEXT_LAYER_CHARS;
}
