import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DASHBOARD_URL } from '../../../config';
import TourOverlay from '../TourOverlay';
import Cursor from './Cursor';
import { DeleteAccountDialog, SubscriptionDialog } from './Dialogs';
import { BrandMark, Icon } from './icons';
import { OVERVIEW, WORKSPACES } from './config';
import { RiseWords, prefersReducedMotion, runTransition } from './motion';
import SettingsMenu from './SettingsMenu';
import ShellToast from './ShellToast';
import { useDock } from './useDock';

// The signed-in dashboard's layout, ported from UncannySteel/DEMO_DASH
// (index.html + js/main.js): an ink top bar with the settings menu; a home
// view that is the hero — avatar, name, plan tag, one-liner, one card per
// workspace; and a workspace view where the same profile block and cards
// become a dock beside an oat sheet. Routing is DEMO_DASH's `#/<slug>`.
//
// This component owns layout, routing and the dialogs' open state only.
// Everything that touches the account — auth, credits, premium, sign-out —
// arrives as props from DashboardView, which stays the auth boundary.

const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=DM+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap';
const CONTACT_HREF = 'mailto:mazzah70@gmail.com'; // the landing page's own Contact Us
const privacyHref = () => {
  try { return new URL('/privacy-policy', DASHBOARD_URL).href; } catch { return '/privacy-policy'; }
};

/** DEMO_DASH's initials: first letters of the first two words. */
function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '?';
}

/**
 * Where the address bar points. `#/<slug>` wins; failing that, the legacy
 * `?view=<id>` deep link the popup has always opened the dashboard with.
 * Anything else — including a Supabase OAuth `#access_token=…` return, which
 * supabase-js consumes before this renders — is the home view.
 */
function routeFromLocation() {
  const slug = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  const bySlug = WORKSPACES.find((w) => w.slug === slug);
  if (bySlug) return { id: bySlug.id, legacy: false };
  const view = new URLSearchParams(window.location.search).get('view');
  if (view && WORKSPACES.some((w) => w.id === view)) return { id: view, legacy: true };
  return { id: null, legacy: false };
}

/**
 * @param {object} props
 * @param {object} props.user Supabase user.
 * @param {string} props.displayName
 * @param {string|null} props.avatarUrl
 * @param {'standard'|'premium'|''} props.plan '' until verified.
 * @param {{ value: number|null, loading: boolean, error: string|null }} props.credits
 * @param {Array<object>} props.workspaces Enabled workspaces (shell/config.js).
 * @param {(id: string) => React.ReactNode} props.renderWorkspace
 * @param {{ message: string, type: string, visible: boolean }} props.toast
 * @param {(message: string, type?: string) => void} props.showToast
 * @param {() => void} props.hideToast
 * @param {() => void} props.refreshCredits
 * @param {(file: File) => Promise<void>} props.onAvatarFile
 * @param {() => void} props.onPremiumCancelled
 * @param {() => Promise<void>} props.onSignOut
 * @param {() => Promise<void>} props.onDeleteAccount
 * @param {{ show: boolean, step: number, steps: Array<object>, onNext: () => void, onSkip: () => void, onStart: () => void }} props.tour
 */
export default function DashboardShell({
  user,
  displayName,
  avatarUrl,
  plan,
  credits,
  workspaces,
  renderWorkspace,
  toast,
  showToast,
  hideToast,
  refreshCredits,
  onAvatarFile,
  onPremiumCancelled,
  onSignOut,
  onDeleteAccount,
  tour,
}) {
  const appRef = useRef(null);
  const dockRef = useRef(null);
  const handleRef = useRef(null);
  const resizerRef = useRef(null);
  const navRef = useRef(null);
  const workspaceRef = useRef(null);
  const avatarInputRef = useRef(null);
  const viewRef = useRef('home');

  const [activeId, setActiveId] = useState(() => {
    const { id } = routeFromLocation();
    return id && workspaces.some((w) => w.id === id) ? id : null;
  });
  const [dialog, setDialog] = useState(null); // 'subscription' | 'delete' | null

  const active = workspaces.find((w) => w.id === activeId) || null;
  const view = active ? 'workspace' : 'home';
  const dock = useDock({ appRef, dockRef, handleRef, resizerRef });

  // ── Page-level setup: fonts, the page background, the theme class ─────────
  useEffect(() => {
    const html = document.documentElement;
    if (!document.querySelector('link[data-oxd-fonts]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONTS_HREF;
      link.dataset.oxdFonts = '';
      document.head.appendChild(link);
    }
    // One committed visual world: the oat sheet is light whatever the landing
    // page's dark-mode preference says, so shared components rendered inside
    // it take their light variants. The class goes back on the way out.
    const hadDark = html.classList.contains('dark');
    html.classList.remove('dark');
    html.classList.add('oxd-page');
    const title = document.title;
    return () => {
      html.classList.remove('oxd-page');
      if (hadDark) html.classList.add('dark');
      document.title = title;
    };
  }, []);

  // ── Entrance, once ───────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const app = appRef.current;
    if (!app || prefersReducedMotion()) return undefined;
    app.classList.add('is-entering');
    const t = setTimeout(() => app.classList.remove('is-entering'), 1800);
    return () => clearTimeout(t);
  }, []);

  // ── Routing ──────────────────────────────────────────────────────────────
  // A legacy ?view= deep link becomes the hash route it means, so reloads and
  // back/forward speak one scheme from here on.
  useEffect(() => {
    const { id, legacy } = routeFromLocation();
    const url = new URL(window.location.href);
    if (legacy) {
      const ws = WORKSPACES.find((w) => w.id === id);
      url.searchParams.delete('view');
      url.hash = ws && workspaces.some((w) => w.id === ws.id) ? `/${ws.slug}` : '';
      window.history.replaceState(window.history.state, '', url);
    }
  }, []);

  useEffect(() => {
    const onHash = () => {
      const slug = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
      const next = workspaces.find((w) => w.slug === slug)?.id ?? null;
      const from = viewRef.current;
      const to = next ? 'workspace' : 'home';
      const kind = from === 'home' ? (to === 'workspace' ? 'enter' : '') : to === 'workspace' ? 'swap' : 'leave';
      runTransition(() => setActiveId(next), kind);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [workspaces]);

  // An application type that turns a workspace off sends its route home.
  useEffect(() => {
    if (activeId && !workspaces.some((w) => w.id === activeId)) setActiveId(null);
  }, [activeId, workspaces]);

  // ── The dock's citrine thumb slides to the open workspace ────────────────
  const moveThumb = useCallback((instant = false) => {
    const nav = navRef.current;
    const link = nav?.querySelector('.nav-link[aria-current="page"]');
    if (!nav || !link || appRef.current?.dataset.view !== 'workspace') return;
    if (instant) nav.classList.add('is-placing');
    nav.style.setProperty('--thumb-y', `${link.offsetTop}px`);
    nav.style.setProperty('--thumb-h', `${link.offsetHeight}px`);
    if (instant) {
      void nav.offsetHeight; // commit the new place before transitions come back
      nav.classList.remove('is-placing');
    }
  }, []);

  useLayoutEffect(() => {
    const dockAppears = viewRef.current !== 'workspace';
    viewRef.current = view;
    if (workspaceRef.current) workspaceRef.current.scrollTop = 0;
    document.title = active ? `${active.label} — Onextap` : 'Dashboard — Onextap';
    dock.current.refresh();
    moveThumb(dockAppears);
    if (activeId && tour.show) tour.onSkip();
  }, [activeId]);

  useEffect(() => {
    const onResize = () => moveThumb(true);
    window.addEventListener('resize', onResize);
    document.fonts?.ready.then(() => moveThumb(true)).catch(() => {});
    return () => window.removeEventListener('resize', onResize);
  }, [moveThumb]);

  // ── Settings actions ─────────────────────────────────────────────────────
  const onAction = (name) => {
    switch (name) {
      case 'change-avatar': avatarInputRef.current?.click(); break;
      case 'manage-subscription': setDialog('subscription'); break;
      case 'take-tour':
        if (activeId) window.location.hash = '#/';
        tour.onStart();
        break;
      case 'log-out': onSignOut(); break;
      case 'delete-account': setDialog('delete'); break;
      default: break;
    }
  };

  const onAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // picking the same file twice must still fire
    if (file) await onAvatarFile(file);
  };

  const firstName = String(displayName || '').split(/\s+/)[0] || 'there';
  const items = [OVERVIEW, ...workspaces];

  return (
    <div className="oxd" ref={appRef} data-view={view}>
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Onextap dashboard home">
          <BrandMark />
          <span className="brand-name">Onextap</span>
        </a>
        <SettingsMenu email={user?.email || ''} credits={credits} onOpen={refreshCredits} onAction={onAction} />
      </header>

      <main className="stage">
        {/* On the home view this is the centred hero; inside a workspace it becomes the dock. */}
        <aside className="dock" id="dock" ref={dockRef} aria-label="Profile and navigation">
          <div className="dock-body">
            <div className="dock-bar" ref={handleRef} title="Drag to move · double-click to re-dock">
              <span className="dock-grip" aria-hidden="true"><Icon name="grip" /></span>
              <div className="dock-controls" role="group" aria-label="Panel position">
                <button type="button" className="icon-btn icon-btn-sm" data-dock-to="left" aria-label="Dock left" title="Dock left"><Icon name="dockLeft" /></button>
                <button type="button" className="icon-btn icon-btn-sm" data-dock-to="float" aria-label="Undock" title="Undock"><Icon name="float" /></button>
                <button type="button" className="icon-btn icon-btn-sm" data-dock-to="right" aria-label="Dock right" title="Dock right"><Icon name="dockRight" /></button>
              </div>
            </div>

            <div className="profile">
              <div className="avatar" role="img" aria-label={`${displayName}'s avatar`}>
                {avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : initials(displayName)}
              </div>
              <div className="profile-text">
                <RiseWords as="h1" key={displayName} className="user-name" text={displayName} delay={150} />
                <span className="plan-tag" data-plan={plan} aria-live="polite">
                  {plan === 'premium' ? 'Premium' : plan === 'standard' ? 'Standard' : ''}
                </span>
              </div>
            </div>

            <p className="tagline">Welcome back, {firstName}. Pick up where you left off.</p>

            <nav className="nav" ref={navRef} aria-label="Workspaces" data-tour="sidebar-nav" style={{ '--cards': workspaces.length }}>
              <span className="nav-thumb" aria-hidden="true" />
              {items.map((item, n) => {
                const current = item.id === (active ? active.id : OVERVIEW.id);
                return (
                  <a
                    key={item.id}
                    className="nav-link"
                    href={item === OVERVIEW ? '#/' : `#/${item.slug}`}
                    data-id={item.id}
                    data-tour={`nav-${item.id}`}
                    title={item.label}
                    aria-current={current ? 'page' : undefined}
                    style={{ viewTransitionName: `nav-${item.id}`, '--n': n }}
                  >
                    <span className="nav-num" aria-hidden="true">{String(n).padStart(2, '0')}</span>
                    <Icon name={item.icon} size={20} />
                    <span className="nav-label">
                      <span className="nav-word">{item.label}</span>
                      <span className="nav-word nav-word-alt" aria-hidden="true">{item.label}</span>
                    </span>
                  </a>
                );
              })}
            </nav>

            {/*
              ═══ APPLICATION TYPE PICKER — HIDDEN, NOT REMOVED ═══

              Parked on purpose. Everything it needs is still wired in
              DashboardView: the `applicationType` state, its loader,
              `handleApplicationTypeChange`, and the workspace filtering that
              reads `appConfig.features` (shell/config.js → workspacesFor).
              Job is also the only type src/applicationTypes.js still lists.

              THREE THINGS COME BACK TOGETHER: a picker here (restyle it as a
              `field-input` select under the nav), the matching one in
              src/components/popup/PopupView.jsx, and the commented-out entries
              in src/applicationTypes.js.
            */}
          </div>

          <div
            className="dock-resize"
            ref={resizerRef}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            title="Drag to resize · double-click to reset"
            tabIndex={0}
          />
        </aside>

        <section className="workspace" id="workspace" ref={workspaceRef} tabIndex={-1} aria-label={active?.label}>
          {active && (
            <React.Fragment key={active.id}>
              <header className="ws-head">
                <p className="label ws-label" data-rise="">
                  <span className="ws-num">{String(workspaces.indexOf(active) + 1).padStart(2, '0')}</span>Workspace
                </p>
                <div>
                  <RiseWords as="h2" className="display ws-title" text={active.label} delay={80} />
                  <p className="ws-desc" data-rise="" style={{ '--r': 2 }}>{active.description}</p>
                </div>
              </header>
              <div className="ws-body" data-rise="" style={{ '--r': 3 }}>
                {renderWorkspace(active.id)}
              </div>
            </React.Fragment>
          )}
        </section>
      </main>

      <footer className="footer">
        <a href={CONTACT_HREF}>Contact us</a>
        <a href={privacyHref()} target="_blank" rel="noopener noreferrer">Privacy policy</a>
      </footer>

      <div className="snap-hint" data-side="left" aria-hidden="true" />
      <div className="snap-hint" data-side="right" aria-hidden="true" />

      <input
        type="file"
        ref={avatarInputRef}
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={onAvatarChange}
        data-testid="avatar-input"
      />

      <SubscriptionDialog
        open={dialog === 'subscription'}
        onClose={() => setDialog(null)}
        isPremium={plan === 'premium'}
        credits={credits.value}
        onCancelled={onPremiumCancelled}
        showToast={showToast}
      />
      <DeleteAccountDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={onDeleteAccount}
        isPremium={plan === 'premium'}
      />

      {tour.show && !active && (
        <TourOverlay
          step={tour.steps[tour.step]}
          totalSteps={tour.steps.length}
          currentStep={tour.step}
          onNext={tour.onNext}
          onSkip={tour.onSkip}
        />
      )}

      <ShellToast message={toast.message} type={toast.type} isVisible={toast.visible} onDismiss={hideToast} />
      <Cursor appRef={appRef} />
    </div>
  );
}
