import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

// DEMO_DASH's settings dropdown (js/settings.js): click or keyboard toggle,
// arrow-key navigation between items, Home/End, outside click and Escape to
// close. Rows rise in on one running stagger (--i) as the menu opens.

/**
 * Formats a credit balance for the pill. Premium accounts report Infinity
 * (CLAUDE.md rule 3), so the balance is guarded before it is rendered.
 * @param {{ value: number|null, loading: boolean, error: string|null }} credits
 */
function creditsLabel(credits) {
  if (credits.loading && credits.value === null) return '…';
  if (credits.error && credits.value === null) return 'Retry';
  if (credits.value === Infinity) return '∞';
  return Number.isFinite(credits.value) ? credits.value.toLocaleString() : '—';
}

/**
 * @param {object} props
 * @param {string} props.email
 * @param {{ value: number|null, loading: boolean, error: string|null }} props.credits
 * @param {() => void} props.onOpen Fired each time the menu opens (refresh credits).
 * @param {(action: string) => void} props.onAction
 */
export default function SettingsMenu({ email, credits, onOpen, onAction }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const pendingFocus = useRef(null);

  const items = () => [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])];

  const openMenu = useCallback((focusIndex = null) => {
    pendingFocus.current = focusIndex;
    setOpen(true);
    onOpen?.();
  }, [onOpen]);

  const closeMenu = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    if (pendingFocus.current !== null) {
      items().at(pendingFocus.current)?.focus();
      pendingFocus.current = null;
    }
    const onOutside = (e) => {
      if (!rootRef.current?.contains(e.target)) closeMenu();
    };
    document.addEventListener('pointerdown', onOutside, true);
    return () => document.removeEventListener('pointerdown', onOutside, true);
  }, [open, closeMenu]);

  const onTriggerKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu(e.key === 'ArrowDown' ? 0 : -1);
    }
  };

  const onRootKey = (e) => {
    if (!open) return;
    const list = items();
    const i = list.indexOf(document.activeElement);
    const focus = (n) => list[(n + list.length) % list.length]?.focus();
    switch (e.key) {
      case 'Escape': e.preventDefault(); closeMenu(true); break;
      case 'Tab': closeMenu(); break;
      case 'ArrowDown': e.preventDefault(); focus(i + 1); break;
      case 'ArrowUp': e.preventDefault(); focus(i < 0 ? -1 : i - 1); break;
      case 'Home': e.preventDefault(); focus(0); break;
      case 'End': e.preventDefault(); focus(-1); break;
      default: break;
    }
  };

  const act = (name) => {
    closeMenu(true);
    onAction(name);
  };

  const state = credits.value !== null ? 'ready' : credits.error ? 'error' : 'loading';
  let row = 0;
  const rise = () => ({ '--i': row++ });

  return (
    <div className="settings" ref={rootRef} data-open={open ? '' : undefined} onKeyDown={onRootKey} data-tour="settings">
      <button
        ref={triggerRef}
        className="icon-btn settings-trigger"
        type="button"
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="oxd-settings-menu"
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onTriggerKey}
      >
        <Icon name="settings" />
      </button>

      <div className="menu" id="oxd-settings-menu" role="menu" aria-label="Settings" ref={menuRef}>
        <div className="menu-header" style={rise()}>
          <span className="label menu-caption">Signed in as</span>
          <span className="menu-email" title={email}>{email}</span>
        </div>
        <div className="menu-stat" style={rise()} title={credits.error || undefined}>
          <Icon name="coins" />
          <span>Available credits</span>
          {state === 'error' ? (
            <button type="button" className="credits-pill" data-state="error" onClick={() => onOpen?.()} aria-label={`Couldn’t load credits: ${credits.error}. Retry`}>
              {creditsLabel(credits)}
            </button>
          ) : (
            <span className="credits-pill" data-state={state} aria-live="polite">{creditsLabel(credits)}</span>
          )}
        </div>
        <div className="menu-sep" role="separator" style={rise()} />
        <button type="button" role="menuitem" style={rise()} onClick={() => act('change-avatar')}><Icon name="image" />Change avatar</button>
        <button type="button" role="menuitem" style={rise()} onClick={() => act('manage-subscription')}><Icon name="card" />Manage subscription</button>
        <button type="button" role="menuitem" style={rise()} onClick={() => act('take-tour')}><Icon name="compass" />Take the tour</button>
        <div className="menu-sep" role="separator" style={rise()} />
        <button type="button" role="menuitem" style={rise()} onClick={() => act('log-out')}><Icon name="logout" />Log out</button>
        <button type="button" role="menuitem" className="is-danger" style={rise()} onClick={() => act('delete-account')}><Icon name="trash" />Delete account</button>
      </div>
    </div>
  );
}
