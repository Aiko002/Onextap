/* ===========================================================================
   Onextap — where the Contact page's feedback goes
   features/feedback takes a `send(note)` that returns a promise. There is no
   feedback endpoint on the server, so the note goes by email instead: the
   reader's own mail app opens with it written out, addressed to the support
   inbox the previous landing page's footer linked to. The window then shows
   its "Got it."; the note leaves when the reader presses send there.
   A server route would make it a true send (see docs/repo-structure.md).

   Each note is still announced on the document as 'onextap:feedback'
   (detail: the note), as the page did before it had anywhere to send it.
   =========================================================================== */
var SUPPORT_EMAIL = 'mazzah70@gmail.com';

// The labels on the window's chips (feedback.html), by their values.
var KINDS = {
  idea: 'An idea',
  bug: 'Something broke',
  board: 'A job board',
  other: 'Something else'
};

export function sendFeedback(note) {
  document.dispatchEvent(new CustomEvent('onextap:feedback', { detail: note }));
  var lines = [note.message, ''];
  if (note.email) lines.push('Reply to: ' + note.email);
  lines.push('Sent from: ' + location.origin + note.page);
  var subject = 'Onextap feedback: ' + (KINDS[note.kind] || note.kind);
  window.location.href = 'mailto:' + SUPPORT_EMAIL +
    '?subject=' + encodeURIComponent(subject) +
    '&body=' + encodeURIComponent(lines.join('\n'));
  return Promise.resolve();
}
