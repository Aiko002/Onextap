import React, { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './motion';

// DEMO_DASH's cursor (js/cursor.js): a citrine ring that trails the pointer and
// swells over anything clickable. Over the dock's bar it turns into a grip
// labelled "Drag", which closes while the dock is dragged. Fine pointers only;
// the system cursor stays everywhere except over the bar. Not mounted at all
// on touch or under reduced motion.

const HOT = 'a, button, [role="menuitem"], label, input, select, textarea, summary';
const FOLLOW_MS = 70; // time constant of the trail

const canUseCursor = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  && !prefersReducedMotion();

/** @param {{ appRef: React.RefObject<HTMLElement> }} props */
export default function Cursor({ appRef }) {
  const [enabled] = useState(canUseCursor);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    const app = appRef.current;
    if (!enabled || !el || !app) return undefined;
    const html = document.documentElement;
    html.classList.add('has-fine-cursor');

    const pos = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let frame = 0;
    let last = 0;

    const tick = (now) => {
      const k = 1 - Math.exp(-(now - last) / FOLLOW_MS);
      last = now;
      pos.x += (target.x - pos.x) * k;
      pos.y += (target.y - pos.y) * k;
      el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      frame = Math.hypot(target.x - pos.x, target.y - pos.y) > 0.1 ? requestAnimationFrame(tick) : 0;
    };

    const onMove = (e) => {
      if (e.pointerType !== 'mouse') return;
      target.x = e.clientX;
      target.y = e.clientY;
      if (!el.classList.contains('is-on')) {
        pos.x = target.x;
        pos.y = target.y;
        el.classList.add('is-on');
      }
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const onLeave = () => el.classList.remove('is-on');
    const onOver = (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      const sash = !!t.closest('.dock-resize');
      const drag = !sash && !t.closest('[data-dock-to]') && !!t.closest('.dock-bar');
      el.classList.toggle('is-hidden', sash);
      el.classList.toggle('is-drag', drag);
      el.classList.toggle('is-hot', !sash && !drag && !!t.closest(HOT));
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver);
    html.addEventListener('mouseleave', onLeave);
    // useDock marks the app while the dock is being dragged: the hand closes.
    const observer = new MutationObserver(() => el.classList.toggle('is-dragging', app.classList.contains('is-dragging')));
    observer.observe(app, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      html.removeEventListener('mouseleave', onLeave);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      html.classList.remove('has-fine-cursor');
    };
  }, [enabled, appRef]);

  if (!enabled) return null;
  return (
    <div className="cursor" aria-hidden="true" ref={ref}>
      <span className="cursor-ring" />
      <span className="cursor-grip">
        <svg className="cursor-icon cursor-icon-open" viewBox="0 0 24 24">
          <path d="M9 12.6V6.4a1.4 1.4 0 0 1 2.8 0v6.2" />
          <path d="M11.8 12.6V5.6a1.4 1.4 0 0 1 2.8 0v7" />
          <path d="M14.6 12.6V6.9a1.4 1.4 0 0 1 2.8 0v5.7" />
          <path d="M9 12.6v-1.2a1.4 1.4 0 0 0-2.8 0v3.1a5.3 5.3 0 0 0 5.3 5.3h1.7a4.4 4.4 0 0 0 4.4-4.4v-2.8" />
        </svg>
        <svg className="cursor-icon cursor-icon-closed" viewBox="0 0 24 24">
          <path d="M5.6 12.4v2.1a5.3 5.3 0 0 0 5.3 5.3h1.7a4.4 4.4 0 0 0 4.4-4.4v-3.5" />
          <path d="M8.8 11.9v-1.4a1.4 1.4 0 0 1 2.8 0v1.3" />
          <path d="M11.6 11.8v-1.8a1.4 1.4 0 0 1 2.8 0v1.7" />
          <path d="M14.4 11.9v-1.4a1.4 1.4 0 0 1 2.6 0v1.4" />
          <path d="M8.8 11.9v-1.2a1.4 1.4 0 0 0-2.8 0v1.4" />
        </svg>
      </span>
      <span className="cursor-label">Drag</span>
    </div>
  );
}
