import React, { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

// DEMO_DASH's motion helpers (js/motion.js, js/util.js), made React-safe: the
// original split a headline by rewriting its text nodes in place, which React
// would fight on the next render, so here the split is rendered instead.

const WORD_MS = 900;
const STAGGER_MS = 60;

const reducedMotionQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

/** True when the user asked the OS for less motion. */
export const prefersReducedMotion = () => !!reducedMotionQuery?.matches;

/**
 * A headline whose words rise through masks on a stagger, once. With
 * `restore`, the plain text comes back once they have landed, so ellipsis and
 * wrapping behave normally afterwards. Reduced motion renders plain text.
 *
 * Remount it (via `key`) to replay.
 */
export function RiseWords({ as: Tag = 'span', text, delay = 0, restore = true, className = '', ...rest }) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const [rising, setRising] = useState(() => !prefersReducedMotion() && words.length > 0);

  useEffect(() => {
    if (!rising || !restore) return undefined;
    const t = setTimeout(() => setRising(false), delay + Math.max(0, words.length - 1) * STAGGER_MS + WORD_MS + 50);
    return () => clearTimeout(t);
    // Runs once per mount: the replay is a remount.
  }, []);

  if (!rising) return <Tag className={className} {...rest}>{text}</Tag>;
  return (
    <Tag className={`${className} rises`} style={{ '--rise-delay': `${delay}ms` }} aria-label={text} {...rest}>
      {words.map((word, i) => (
        <React.Fragment key={i}>
          {i > 0 && ' '}
          <span className="w" aria-hidden="true"><span className="wi" style={{ '--i': i }}>{word}</span></span>
        </React.Fragment>
      ))}
    </Tag>
  );
}

let transitionSeq = 0;

/**
 * Runs a DOM update inside a View Transition when the browser has them and
 * motion is allowed. `kind` ('enter' | 'swap' | 'leave') is set on <html> as
 * data-vt for the length of the transition, so dashboard.css can choreograph
 * the workspace sheet. React state updates are flushed synchronously inside
 * the transition callback so the "new" snapshot is the rendered result.
 *
 * @param {() => void} update
 * @param {string} [kind]
 */
export function runTransition(update, kind = '') {
  const flushed = () => flushSync(update);
  if (typeof document === 'undefined' || !document.startViewTransition || prefersReducedMotion()) {
    flushed();
    return;
  }
  const root = document.documentElement;
  const seq = ++transitionSeq;
  root.dataset.vt = kind || 'plain';
  let vt;
  try {
    vt = document.startViewTransition(flushed);
  } catch {
    delete root.dataset.vt;
    flushed();
    return;
  }
  // An aborted transition still applies the update; ignore the rejection.
  vt.ready.catch(() => {});
  const done = () => {
    if (seq === transitionSeq) delete root.dataset.vt;
  };
  vt.finished.then(done, done);
}
