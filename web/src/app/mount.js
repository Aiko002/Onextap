import { log as baseLog } from '@app/logger.js';

var log = baseLog.child('mount');

// Swaps each `[data-mount="name"]` placeholder for that feature's markup, so the
// live DOM is exactly what the single-file page shipped — no wrapper elements.
//
// On the landing and company pages the website build has already made this
// swap in the HTML (scripts/inlineMarkup.js), so crawlers read the page
// without running it, and there is nothing left here to mount. The
// dashboard's company pages still mount here.
export function mountFeatures(features) {
  document.querySelectorAll('[data-mount]').forEach(function (slot) {
    var name = slot.getAttribute('data-mount');
    var feature = features[name];
    if (!feature) {
      log.warn('No feature registered for data-mount="' + name + '"');
      return;
    }
    var tpl = document.createElement('template');
    tpl.innerHTML = feature.markup.trim();
    slot.replaceWith(tpl.content);
  });
}

// A page whose markup came in its HTML is kept hidden (`booting` on <html>,
// scripts/inlineMarkup.js) until its script has laid it out; the page's boot
// calls this once it has, in the same task, so no half-built frame is drawn.
// A no-op on a page that never set the class.
export function revealPage() {
  document.documentElement.classList.remove('booting');
}
