import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Activity } from 'lucide-react';
import { getApplicationType, setApplicationType } from '../../applicationTypeStorage';
import { getApplicationTypeConfig } from '../../applicationTypes';
import { onAuthStateChange, signOut as supaSignOut } from '../../auth';
import { getAvatar, setAvatarFromFile } from '../../avatarStore';
import { creditManager } from '../../creditManager';
import { storage } from '../../storage';
import Toast from '../shared/Toast';
import PremiumModal from './PremiumModal';
import PublicLandingPage from './PublicLandingPage';
import { useAuthForm } from './useAuthForm';
import { TOUR_STEPS } from './TourOverlay';
import ProfilesPage from './ProfilesPage';
import VaultPage from './VaultPage';
import CoverLetterPage from './CoverLetterPage';
import JobMatchesPage from './JobMatchesPage';
import DashboardShell from './shell/DashboardShell';
import { workspacesFor } from './shell/config';
import { log as baseLog } from '../../logger';
import './dashboard.css';

const log = baseLog.child('ui');

const PROFILE_KEYS = ['user_profile', 'onextap_profiles'];

// --- DASHBOARD VIEW (Main Auth Logic — Supabase) ---
/**
 * Root of the signed-in dashboard, and the app's auth boundary.
 *
 * Owns the Supabase session (via onAuthStateChange), the sign-in form state it
 * passes down to PublicLandingPage, premium status and credits, the
 * application type, the guided tour, and the account actions (avatar,
 * sign-out, delete). Renders PublicLandingPage — unchanged — until a session
 * exists, then DashboardShell (the DEMO_DASH layout in ./shell/), handing it
 * the workspace content through `renderWorkspace`.
 *
 * Also handles the post-checkout `?payment=success` return by polling
 * verify-premium until the Dodo webhook lands.
 *
 * @param {object} props
 * @param {() => void} props.onClose Closes the surrounding window — meaningful
 *   in the popup, a no-op on the web dashboard.
 */
const DashboardView = ({ onClose }) => {
  const [applicationType, setApplicationTypeState] = useState('job');

  useEffect(() => {
    getApplicationType().then(setApplicationTypeState);
  }, []);

  const appConfig = getApplicationTypeConfig(applicationType);
  const workspaces = useMemo(() => workspacesFor(appConfig), [appConfig]);

  // Kept for the parked application-type picker (see DashboardShell). The
  // shell sends a route home by itself when its workspace is switched off.
  const handleApplicationTypeChange = async (nextType) => {
    await setApplicationType(nextType);
    setApplicationTypeState(nextType);
  };

  const [user, setUser] = useState(null); // Supabase User Object
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Sign-in/sign-up form state and handlers. DashboardView stays the auth
  // boundary: the hook reports success here and owns nothing else.
  const authForm = useAuthForm({
    onAuthenticated: (signedInUser) => {
      setUser(signedInUser);
      setIsCheckingAuth(false);
    },
  });
  const [contentKey, setContentKey] = useState(0);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  // False until verify-premium has answered once, so the plan tag does not
  // flash "Standard" at a Premium user while the check is in flight.
  const [planKnown, setPlanKnown] = useState(false);
  const [credits, setCredits] = useState({ value: null, loading: false, error: null });
  const [avatarUrl, setAvatarUrl] = useState(null);

  // Guided tour state
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  // Initialize Supabase & Check Auth
  useEffect(() => {
    const { unsubscribe } = onAuthStateChange((event, session) => {
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session?.user) {
        setUser(session.user);
        // Premium status is not read here — the lazy check keyed on user.id
        // below fetches it once the user is set.
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsPremiumUser(false);
        setPlanKnown(false);
        setCredits({ value: null, loading: false, error: null });
        setContentKey((k) => k + 1);
      }
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        setIsCheckingAuth(false);
      }
    });

    // Fallback: never block the UI if auth listener doesn't fire promptly
    const authTimeout = setTimeout(() => setIsCheckingAuth(false), 5000);

    return () => {
      clearTimeout(authTimeout);
      unsubscribe();
    };
  }, []);

  // Trigger guided tour only for brand-new accounts (created within the last 2 minutes)
  useEffect(() => {
    if (user && !isCheckingAuth) {
      const checkTour = async () => {
        const seen = await storage.get('onextap_tutorial_seen');
        if (seen) return;

        const createdAt = user.created_at ? new Date(user.created_at) : null;
        const isNewAccount = createdAt && (Date.now() - createdAt.getTime() < 2 * 60 * 1000);
        if (isNewAccount) {
          setTimeout(() => setShowTour(true), 1400);
        } else {
          await storage.set('onextap_tutorial_seen', true);
        }
      };
      checkTour();
    }
  }, [user, isCheckingAuth]);

  const dismissTour = useCallback(async () => {
    setShowTour(false);
    setTourStep(0);
    await storage.set('onextap_tutorial_seen', true);
  }, []);

  const nextTourStep = () => {
    if (tourStep < TOUR_STEPS.length - 1) {
      setTourStep(tourStep + 1);
    } else {
      dismissTour();
    }
  };

  const startTour = () => {
    setTourStep(0);
    setShowTour(true);
  };

  const handleSignOut = async () => {
    await supaSignOut();
    setUser(null);

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await new Promise((resolve) => {
          chrome.storage.local.remove(PROFILE_KEYS, () => resolve());
        });
      }
      if (typeof localStorage !== 'undefined') {
        PROFILE_KEYS.forEach((k) => localStorage.removeItem(k));
      }
    } catch (err) {
      log.warn('Storage clear on sign-out:', err);
    }

    setContentKey((k) => k + 1);
  };

  // Delete account — the steps AccountSettingsModal ran (sign out, clear what
  // this device holds, reload), with sign-out moved FIRST. The old order
  // cleared storage before calling Supabase, which erased the stored session,
  // so signOut() found nothing to revoke and never reached the server. There
  // is no server-side deletion route; DeleteAccountDialog's copy says so.
  const handleDeleteAccount = async () => {
    try {
      await supaSignOut();
    } catch (err) {
      log.warn('Sign-out before account deletion failed:', err);
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await new Promise((resolve) => {
          chrome.storage.local.clear(() => resolve());
        });
      } else {
        localStorage.clear();
      }
    } catch (err) {
      log.warn('Failed to clear local storage:', err);
    }

    try {
      await handleSignOut();
      window.location.reload();
    } catch (error) {
      log.error('Account deletion failed:', error);
      throw new Error(error?.message || 'Failed to delete account. Please try again.');
    }
  };

  const [toast, setToast] = useState({ message: '', type: 'success', visible: false });
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);

  // Credits, from the server (GET /api/credits). Premium reads as Infinity —
  // SettingsMenu guards it with Number.isFinite before rendering (rule 3).
  const refreshCredits = useCallback(async () => {
    setCredits((c) => ({ ...c, loading: true }));
    const { credits: value, error } = await creditManager.getCreditsWithStatus();
    setCredits((c) => (error
      ? { value: c.value, loading: false, error }
      : { value, loading: false, error: null }));
  }, []);

  // Lazy premium check — fires once after login, non-blocking, doesn't delay
  // the UI. Credits are read after it, so the flag they carry has already been
  // corrected by verify-premium if the subscription lapsed.
  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    creditManager.verifyPremium()
      .then((p) => { if (!cancelled) setIsPremiumUser(p); })
      .catch(() => {}) // silent fail — UI shows free tier by default
      .finally(() => {
        if (cancelled) return;
        setPlanKnown(true);
        refreshCredits();
      });
    return () => { cancelled = true; };
  }, [user?.id, refreshCredits]); // only re-runs when the actual user ID changes

  // Avatar: the one stored on this device, else the OAuth provider's picture.
  useEffect(() => {
    if (!user?.id) { setAvatarUrl(null); return undefined; }
    let cancelled = false;
    const providerPicture = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
    getAvatar(user.id)
      .then((stored) => { if (!cancelled) setAvatarUrl(stored || providerPicture); })
      .catch(() => { if (!cancelled) setAvatarUrl(providerPicture); });
    return () => { cancelled = true; };
  }, [user?.id, user?.user_metadata?.avatar_url, user?.user_metadata?.picture]);

  const handleAvatarFile = async (file) => {
    try {
      const url = await setAvatarFromFile(user?.id, file);
      setAvatarUrl(url);
      showToast('Avatar updated.');
    } catch (err) {
      showToast(err?.message || 'Couldn’t update your avatar. Try again.', 'error');
    }
  };

  // Handle ?payment=success after checkout redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success' && user?.id) {
      // Clean up URL params (including Dodo's appended params)
      const url = new URL(window.location);
      ['payment', 'session_id', 'payment_id', 'status', 'email', 'license_key'].forEach(p => url.searchParams.delete(p));
      window.history.replaceState({}, '', url);

      // Poll for premium activation — webhook can take up to a few minutes
      setToast({ message: 'Payment received! Activating your Premium subscription...', type: 'loading', visible: true });
      let attempts = 0;
      const maxAttempts = 15;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const isPrem = await creditManager.verifyPremium();
          if (isPrem) {
            clearInterval(poll);
            setIsPremiumUser(true);
            setPlanKnown(true);
            refreshCredits();
            setToast({ message: 'Premium activated! You now have unlimited AI credits.', type: 'success', visible: true });
          } else if (attempts >= maxAttempts) {
            clearInterval(poll);
            setToast({ message: 'Payment received! Premium may take a moment to activate — please refresh shortly.', type: 'success', visible: true });
          }
        } catch {
          if (attempts >= maxAttempts) clearInterval(poll);
        }
      }, 8000);
      return () => clearInterval(poll);
    } else if (params.get('payment') === 'cancelled') {
      setToast({ message: 'Payment cancelled.', type: 'error', visible: true });
      const url = new URL(window.location);
      url.searchParams.delete('payment');
      window.history.replaceState({}, '', url);
    }
    return undefined;
  // Keyed on the id, not the object: Supabase re-emits the session (a new
  // user object) right after load, and re-running this effect then would clear
  // the poll it just started — with the URL already cleaned, nothing restarts it.
  }, [user?.id, refreshCredits]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, visible: true });
  }, []);
  const hideToast = useCallback(() => setToast((t) => ({ ...t, visible: false })), []);

  const renderWorkspace = (id) => {
    switch (id) {
      case 'jobs': return <JobMatchesPage key={contentKey} showToast={showToast} />;
      case 'profiles': return <ProfilesPage key={contentKey} showToast={showToast} />;
      case 'vault': return <VaultPage key={contentKey} showToast={showToast} user={user} />;
      case 'cover': return <CoverLetterPage key={contentKey} showToast={showToast} user={user} applicationType={applicationType} />;
      default: return null;
    }
  };

  // Auth loading — avoid showing a broken dashboard shell while session is restored
  if (isCheckingAuth && !user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-onextap-cream text-onextap-dark dark:bg-onextap-night dark:text-[#E8EFD8]">
        <div className="flex items-center gap-3 rounded-xl border border-[rgba(42,60,28,0.12)] bg-white px-6 py-4 shadow-sm dark:border-[rgba(200,216,168,0.15)] dark:bg-onextap-night-card">
          <Activity className="animate-spin text-onextap-primary" size={20} />
          <span className="text-sm font-medium text-onextap-secondary dark:text-[#9AB07A]">Loading your account...</span>
        </div>
      </div>
    );
  }

  // Landing page when not signed in (same style as popup)
  if (!user) {
    return (
      <>
        <PublicLandingPage
          {...authForm}
          onOpenPremiumModal={() => setIsPremiumModalOpen(true)}
          user={user}
        />
        <Toast message={toast.message} type={toast.type} isVisible={toast.visible} onDismiss={hideToast} />
        <PremiumModal isOpen={isPremiumModalOpen} onClose={() => setIsPremiumModalOpen(false)} user={user} />
      </>
    );
  }

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'You';

  return (
    <DashboardShell
      user={user}
      displayName={displayName}
      avatarUrl={avatarUrl}
      plan={planKnown ? (isPremiumUser ? 'premium' : 'standard') : ''}
      credits={credits}
      workspaces={workspaces}
      renderWorkspace={renderWorkspace}
      toast={toast}
      showToast={showToast}
      hideToast={hideToast}
      refreshCredits={refreshCredits}
      onAvatarFile={handleAvatarFile}
      onPremiumCancelled={() => { setIsPremiumUser(false); refreshCredits(); }}
      onSignOut={handleSignOut}
      onDeleteAccount={handleDeleteAccount}
      tour={{
        show: showTour,
        step: tourStep,
        steps: TOUR_STEPS,
        onNext: nextTourStep,
        onSkip: dismissTour,
        onStart: startTour,
      }}
    />
  );
};

export default DashboardView;
