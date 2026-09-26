import { useLayoutEffect, useRef } from 'react';
import { storage } from '../../../storage';
import { runTransition } from './motion';

// The workspace dock (DEMO_DASH js/dock.js): docked left, docked right, or
// floating. Drag the bar to undock; drop near an edge to re-dock; double-click
// the bar to toggle. Drag the inner edge (or focus it and use the arrow keys,
// Home, End) to resize; double-click it to reset.
//
// ═══ IMPERATIVE ON PURPOSE ═══
//
// Dragging writes a position sixty times a second. Routing that through React
// state would re-render the whole dashboard — every open workspace included —
// per pointer move. So, as in the original, the hook owns the DOM it touches:
// `data-dock` and the `is-dragging` / `is-resizing` classes on the app root,
// and the `--dock-w` / `--float-x` / `--float-y` custom properties. React never
// renders any of those, so the two never contend for an attribute.
//
// The preference persists through src/storage.js (rule 4), which is async, so
// the saved layout is applied a frame after mount rather than before paint.

const STORAGE_KEY = 'onextap_dashboard_dock';
const MODES = ['left', 'right', 'float'];
const SNAP_EDGE = 56; // px from the viewport edge that triggers a dock-snap while dragging
const MARGIN = 12;
const DRAG_THRESHOLD = 4;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480; // also capped at half the viewport
const KEY_STEP = 16;
const DEFAULT_WIDTH = 264;

/**
 * @param {object} refs
 * @param {React.RefObject<HTMLElement>} refs.appRef The `.oxd` root.
 * @param {React.RefObject<HTMLElement>} refs.dockRef
 * @param {React.RefObject<HTMLElement>} refs.handleRef The dock's drag bar.
 * @param {React.RefObject<HTMLElement>} refs.resizerRef
 * @returns {React.MutableRefObject<{refresh: () => void}>} Call `refresh`
 *   after the view changes, so a floating dock is re-placed.
 */
export function useDock({ appRef, dockRef, handleRef, resizerRef }) {
  const api = useRef({ refresh: () => {} });

  useLayoutEffect(() => {
    const app = appRef.current;
    const dock = dockRef.current;
    const handle = handleRef.current;
    const resizer = resizerRef.current;
    if (!app || !dock || !handle || !resizer) return undefined;

    const canFloat = window.matchMedia('(min-width: 760px)');
    const hints = () => [...app.querySelectorAll('.snap-hint')];
    const controls = () => [...dock.querySelectorAll('[data-dock-to]')];
    const topbarHeight = () => app.querySelector('.topbar')?.offsetHeight || 64;
    const state = { mode: 'left', lastDocked: 'left', x: null, y: null, width: DEFAULT_WIDTH };

    const save = () => { storage.set(STORAGE_KEY, { ...state }); };

    function place(x, y) {
      const minY = topbarHeight() + MARGIN;
      const maxX = Math.max(MARGIN, window.innerWidth - dock.offsetWidth - MARGIN);
      const maxY = Math.max(minY, window.innerHeight - dock.offsetHeight - MARGIN);
      state.x = Math.round(Math.min(Math.max(x, MARGIN), maxX));
      state.y = Math.round(Math.min(Math.max(y, minY), maxY));
      dock.style.setProperty('--float-x', `${state.x}px`);
      dock.style.setProperty('--float-y', `${state.y}px`);
    }

    const maxWidth = () => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(window.innerWidth / 2)));
    const isFloating = () => state.mode === 'float' && app.dataset.view === 'workspace';

    // state.width is the preferred width; a small viewport clamps what is
    // applied without overwriting it.
    function applyWidth() {
      const width = Math.min(state.width, maxWidth());
      app.style.setProperty('--dock-w', `${width}px`);
      resizer.setAttribute('aria-valuemin', MIN_WIDTH);
      resizer.setAttribute('aria-valuemax', maxWidth());
      resizer.setAttribute('aria-valuenow', width);
      if (isFloating()) place(state.x, state.y);
    }

    function setWidth(px) {
      state.width = Math.round(Math.min(Math.max(px, MIN_WIDTH), maxWidth()));
      applyWidth();
    }

    function apply() {
      app.dataset.dock = state.mode;
      controls().forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.dockTo === state.mode)));
      if (isFloating()) place(state.x ?? MARGIN * 2, state.y ?? topbarHeight() + MARGIN * 2);
    }

    function setMode(mode) {
      if (mode === state.mode) return;
      if (mode === 'float' && state.x === null) {
        const rect = dock.getBoundingClientRect();
        state.x = rect.left + 16;
        state.y = rect.top + 16;
      }
      if (mode !== 'float') state.lastDocked = mode;
      state.mode = mode;
      save();
      runTransition(apply);
    }

    const onControlClick = (e) => {
      const btn = e.target.closest('[data-dock-to]');
      if (btn && dock.contains(btn)) setMode(btn.dataset.dockTo);
    };

    const onHandleDblClick = (e) => {
      if (e.target.closest('[data-dock-to]')) return;
      setMode(state.mode === 'float' ? state.lastDocked : 'float');
    };

    const onHandleDown = (e) => {
      if (e.button !== 0 || e.target.closest('[data-dock-to]') || !canFloat.matches) return;
      e.preventDefault(); // no text selection while dragging
      const start = { x: e.clientX, y: e.clientY };
      let offset = null;
      let snap = null;
      handle.setPointerCapture?.(e.pointerId);

      const onMove = (ev) => {
        if (!offset) {
          if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
          const rect = dock.getBoundingClientRect();
          offset = { x: start.x - rect.left, y: start.y - rect.top };
          app.classList.add('is-dragging');
          if (state.mode !== 'float') {
            state.x = rect.left;
            state.y = rect.top;
            state.mode = 'float';
            apply();
          }
        }
        place(ev.clientX - offset.x, ev.clientY - offset.y);
        snap = ev.clientX < SNAP_EDGE ? 'left' : ev.clientX > window.innerWidth - SNAP_EDGE ? 'right' : null;
        hints().forEach((hint) => hint.toggleAttribute('data-active', hint.dataset.side === snap));
      };

      const onEnd = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onEnd);
        handle.removeEventListener('pointercancel', onEnd);
        if (!offset) return;
        app.classList.remove('is-dragging');
        hints().forEach((hint) => hint.removeAttribute('data-active'));
        if (snap) setMode(snap);
        else save();
      };

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onEnd);
      handle.addEventListener('pointercancel', onEnd);
    };

    const onResizeDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      resizer.setPointerCapture?.(e.pointerId);
      const startX = e.clientX;
      const startWidth = Math.min(state.width, maxWidth());
      const direction = state.mode === 'right' ? -1 : 1; // the handle is on the left edge when docked right
      app.classList.add('is-resizing');

      const onMove = (ev) => setWidth(startWidth + (ev.clientX - startX) * direction);
      const onEnd = () => {
        resizer.removeEventListener('pointermove', onMove);
        resizer.removeEventListener('pointerup', onEnd);
        resizer.removeEventListener('pointercancel', onEnd);
        app.classList.remove('is-resizing');
        save();
      };

      resizer.addEventListener('pointermove', onMove);
      resizer.addEventListener('pointerup', onEnd);
      resizer.addEventListener('pointercancel', onEnd);
    };

    const onResizeDblClick = () => {
      setWidth(DEFAULT_WIDTH);
      save();
    };

    const onResizeKey = (e) => {
      const [grow, shrink] = state.mode === 'right' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft'];
      const width = Math.min(state.width, maxWidth());
      const next = { [grow]: width + KEY_STEP, [shrink]: width - KEY_STEP, Home: MIN_WIDTH, End: maxWidth() }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      setWidth(next);
      save();
    };

    dock.addEventListener('click', onControlClick);
    handle.addEventListener('dblclick', onHandleDblClick);
    handle.addEventListener('pointerdown', onHandleDown);
    resizer.addEventListener('pointerdown', onResizeDown);
    resizer.addEventListener('dblclick', onResizeDblClick);
    resizer.addEventListener('keydown', onResizeKey);
    window.addEventListener('resize', applyWidth);

    applyWidth();
    apply();
    api.current.refresh = apply;

    let cancelled = false;
    storage.get(STORAGE_KEY).then((saved) => {
      if (cancelled || !saved || typeof saved !== 'object') return;
      state.mode = MODES.includes(saved.mode) ? saved.mode : state.mode;
      state.lastDocked = saved.lastDocked === 'right' ? 'right' : 'left';
      state.x = Number.isFinite(saved.x) ? saved.x : null;
      state.y = Number.isFinite(saved.y) ? saved.y : null;
      state.width = Number.isFinite(saved.width) ? saved.width : DEFAULT_WIDTH;
      applyWidth();
      apply();
    }).catch(() => { /* a missing preference is the default layout */ });

    return () => {
      cancelled = true;
      dock.removeEventListener('click', onControlClick);
      handle.removeEventListener('dblclick', onHandleDblClick);
      handle.removeEventListener('pointerdown', onHandleDown);
      resizer.removeEventListener('pointerdown', onResizeDown);
      resizer.removeEventListener('dblclick', onResizeDblClick);
      resizer.removeEventListener('keydown', onResizeKey);
      window.removeEventListener('resize', applyWidth);
      api.current.refresh = () => {};
    };
  }, [appRef, dockRef, handleRef, resizerRef]);

  return api;
}
