import React, { useEffect, useRef, useState } from 'react';
import { creditManager } from '../../../creditManager';
import { log as baseLog } from '../../../logger';
import { CloseGlyph } from './icons';
import { PLANS } from './config';

const log = baseLog.child('ui');

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * A native <dialog> dressed as DEMO_DASH's window: oat paper under a browser
 * bar with a fake address. Open state is a prop; Escape and × both report
 * through `onClose`.
 */
export function ShellDialog({ open, onClose, url, labelledBy, wide = false, children }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    const handle = () => onCloseRef.current?.();
    dialog?.addEventListener('close', handle);
    return () => dialog?.removeEventListener('close', handle);
  }, []);

  return (
    <dialog className={`dialog${wide ? ' dialog-wide' : ''}`} ref={ref} aria-labelledby={labelledBy}>
      <div className="dialog-bar">
        <span className="dialog-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="dialog-url" aria-hidden="true">{url}</span>
        <button type="button" className="dialog-x" aria-label="Close" onClick={() => onCloseRef.current?.()}>
          <CloseGlyph />
        </button>
      </div>
      <div className="dialog-body">{open ? children : null}</div>
    </dialog>
  );
}

/**
 * Manage subscription: the plan you are on, both plans side by side, and the
 * one move available from here — wired to the same two routes the old
 * PremiumModal / AccountSettingsModal used:
 *
 *   Upgrade  → POST /api/create-checkout-session, then the hosted Dodo checkout
 *              (DashboardView polls verify-premium on the ?payment=success return)
 *   Downgrade → POST /api/cancel-subscription, after an in-panel confirmation
 *
 * DEMO_DASH also had "Billing & invoices"; the backend has no billing-portal
 * route, so that button is not rendered rather than rendered dead.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {boolean} props.isPremium Verified premium state from DashboardView.
 * @param {number|null} props.credits Balance; Infinity for premium, null unknown.
 * @param {() => void} props.onCancelled Premium was cancelled server-side.
 * @param {(message: string, type?: string) => void} props.showToast
 */
export function SubscriptionDialog({ open, onClose, isPremium, credits, onCancelled, showToast }) {
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(null); // 'upgrade' | 'cancel' | null
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setConfirming(false);
    setError('');
    setBusy(null);
    creditManager.getAccount().then((a) => { if (!cancelled && a.ok) setAccount(a); });
    return () => { cancelled = true; };
  }, [open]);

  const current = PLANS.find((p) => p.id === (isPremium ? 'premium' : 'standard'));
  const rank = PLANS.indexOf(current);

  let status;
  if (isPremium) {
    const since = account?.premiumSince ? new Date(account.premiumSince) : null;
    status = `You’re on Premium, ${current.price} ${current.period}.${since && !Number.isNaN(since.getTime()) ? ` Premium since ${dateFormat.format(since)}.` : ''}`;
  } else {
    const left = Number.isFinite(credits) ? ` ${credits} AI credit${credits === 1 ? '' : 's'} left.` : '';
    status = `You’re on Standard: free forever, no card on file.${left}`;
  }

  const upgrade = async () => {
    setBusy('upgrade');
    setError('');
    try {
      const { url } = await creditManager.createCheckoutSession();
      if (!url) throw new Error('Checkout did not return a payment link. Please try again.');
      window.location.href = url;
    } catch (err) {
      log.error('Checkout error:', err);
      setError(err?.message || 'Failed to start checkout. Please try again.');
      showToast?.('Couldn’t start checkout. Try again.', 'error');
      setBusy(null);
    }
  };

  const cancelPremium = async () => {
    setBusy('cancel');
    setError('');
    try {
      await creditManager.cancelSubscription();
      setConfirming(false);
      onCancelled?.();
      showToast?.('Premium cancelled. You’re on Standard now.', 'success');
    } catch (err) {
      log.error('Cancel error:', err);
      setError(err?.message || 'Failed to cancel subscription.');
      showToast?.('Couldn’t change your plan. Try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ShellDialog open={open} onClose={onClose} url="account / settings / subscription" labelledBy="oxd-subscription-title" wide>
      <p className="label dialog-eyebrow">Subscription</p>
      <h2 className="display" id="oxd-subscription-title">Your plan</h2>
      <p data-testid="subscription-status">{status}</p>
      <ul className="plans">
        {PLANS.map((plan, i) => {
          const isCurrent = plan === current;
          return (
            <li key={plan.id} className="plan" data-current={isCurrent ? '' : undefined}>
              <div className="plan-head">
                <h3 className="label plan-name">{plan.name}</h3>
                {isCurrent && <span className="plan-badge">Current plan</span>}
              </div>
              <div className="plan-price"><span className="display">{plan.price}</span> <span className="plan-period">{plan.period}</span></div>
              <ul className="plan-features">{plan.features.map((f) => <li key={f}>{f}</li>)}</ul>
              {!isCurrent && i > rank && (
                <button type="button" className="btn btn-solid plan-cta" onClick={upgrade} disabled={busy !== null}>
                  {busy === 'upgrade' ? 'Redirecting to checkout…' : <>Upgrade to {plan.name} <span className="btn-arrow" aria-hidden="true">→</span></>}
                </button>
              )}
              {!isCurrent && i < rank && !confirming && (
                <button type="button" className="btn btn-ghost plan-cta" onClick={() => setConfirming(true)} disabled={busy !== null}>
                  Switch to {plan.name}
                </button>
              )}
              {!isCurrent && i < rank && confirming && (
                <div className="plan-confirm" role="group" aria-label="Confirm cancellation">
                  <p>This cancels Premium now. AI answers and fit analyses go back to using credits straight away.</p>
                  <div className="plan-confirm-actions">
                    <button type="button" className="btn btn-danger btn-sm" onClick={cancelPremium} disabled={busy !== null}>
                      {busy === 'cancel' ? 'Cancelling…' : 'Cancel Premium'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={busy !== null}>Keep Premium</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="dialog-error" role="alert">{error}</p>}
      <p className="mono" style={{ fontSize: 11 }}>Payments are handled securely by Dodo Payments.</p>
      <div className="dialog-actions">
        <button type="button" className="btn btn-solid" onClick={onClose}>Done</button>
      </div>
    </ShellDialog>
  );
}

/**
 * Delete account. Behaviour is exactly the old AccountSettingsModal's: clear
 * everything Onextap stored on this device, sign out, reload. There is no
 * server-side deletion route, so the copy says what actually happens rather
 * than promising the account row and its credits are erased.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => Promise<void>} props.onConfirm Throws with a message on failure.
 * @param {boolean} props.isPremium
 */
export function DeleteAccountDialog({ open, onClose, onConfirm, isPremium }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setValue(''); setError(''); setBusy(false); }
  }, [open]);

  const confirm = async (e) => {
    e.preventDefault();
    if (value.trim() !== 'DELETE') return;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err?.message || 'Couldn’t delete your account. Try again.');
      setBusy(false);
    }
  };

  return (
    <ShellDialog open={open} onClose={onClose} url="account / settings / delete" labelledBy="oxd-delete-title">
      <form onSubmit={confirm} style={{ display: 'contents' }}>
        <p className="label dialog-eyebrow is-danger">Danger zone</p>
        <h2 className="display" id="oxd-delete-title">Delete your account?</h2>
        <p>
          This erases your profiles, saved answers, cover letters and resumes from this device and signs you out.
          It can’t be undone.
        </p>
        {isPremium && (
          <p><strong>Premium stays active</strong> until you cancel it under Manage subscription — do that first if you want billing to stop.</p>
        )}
        <label className="field">
          <span className="field-k">type <strong>DELETE</strong> to confirm</span>
          <input type="text" value={value} onChange={(e) => { setValue(e.target.value); setError(''); }} autoComplete="off" spellCheck="false" />
        </label>
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-danger" disabled={value.trim() !== 'DELETE' || busy}>
            {busy ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </form>
    </ShellDialog>
  );
}
