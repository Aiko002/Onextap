import React, { useEffect, useState } from 'react';

// --- GUIDED TOUR ---
// Shown once to brand-new accounts (DashboardView decides), and on demand from
// the settings menu. Every step points at something on the dashboard's home
// view, which is where the tour runs.
export const TOUR_STEPS = [
  {
    target: 'sidebar-nav',
    title: 'Your workspaces',
    desc: 'Everything lives in these four. Open one and this row becomes a dock at the side — drag it, float it, or resize it to taste.',
    position: 'top',
  },
  {
    target: 'nav-profiles',
    title: 'My Profiles',
    desc: 'Add your personal details, education, work experience and skills — or upload a resume and we’ll parse it for you.',
    position: 'top',
  },
  {
    target: 'nav-vault',
    title: 'Answer Studio',
    desc: 'Save answers to common application questions, and let AI draft or sharpen them against a job description.',
    position: 'top',
  },
  {
    target: 'settings',
    title: 'Settings',
    desc: 'Your credits, plan, avatar and sign-out live behind the gear.',
    position: 'bottom',
  },
];

const TIP_W = 320;
const TIP_H = 210;
const GAP = 16;

/**
 * One step of the guided tour: a spotlight on the step's target and a small
 * ink window beside it, clamped to stay on screen.
 *
 * @param {object} props
 * @param {{ target: string, title: string, desc: string, position: string }} props.step
 * @param {number} props.totalSteps
 * @param {number} props.currentStep Zero-based index, for the progress dots.
 * @param {() => void} props.onNext Advances, or finishes on the last step.
 * @param {() => void} props.onSkip Ends the tour immediately.
 */
const TourOverlay = ({ step, totalSteps, currentStep, onNext, onSkip }) => {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) { setRect(null); return undefined; }
    const update = () => setRect(el.getBoundingClientRect());
    update();
    // Cards rise in on the entrance, so settle the spotlight once they land.
    const settle = setTimeout(update, 900);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      clearTimeout(settle);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onSkip(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  if (!rect) return null;

  let top;
  let left;
  if (step.position === 'bottom') {
    top = rect.bottom + GAP;
    left = rect.left + rect.width / 2 - TIP_W / 2;
  } else if (step.position === 'right') {
    top = rect.top + rect.height / 2 - TIP_H / 2;
    left = rect.right + GAP;
  } else {
    top = rect.top - TIP_H - GAP;
    left = rect.left + rect.width / 2 - TIP_W / 2;
    if (top < 16) top = rect.bottom + GAP;
  }
  top = Math.max(16, Math.min(top, window.innerHeight - TIP_H - 16));
  left = Math.max(16, Math.min(left, window.innerWidth - TIP_W - 16));

  const pad = 6;
  const last = currentStep >= totalSteps - 1;

  return (
    <>
      <div
        className="tour-spot"
        style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
      />
      <div className="tour-tip" style={{ top, left }} role="dialog" aria-live="polite" aria-labelledby="oxd-tour-title" key={step.target}>
        <div className="tour-top">
          <span className="tour-step label">
            <span className="ws-num">{String(currentStep + 1).padStart(2, '0')}</span>
            of {String(totalSteps).padStart(2, '0')}
          </span>
          <button type="button" className="tour-skip" onClick={onSkip}>Skip tour</button>
        </div>
        <h3 className="tour-title" id="oxd-tour-title">{step.title}</h3>
        <p className="tour-desc">{step.desc}</p>
        <div className="tour-foot">
          <span className="tour-dots" aria-hidden="true">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <i key={i} data-on={i === currentStep ? '' : undefined} data-done={i < currentStep ? '' : undefined} />
            ))}
          </span>
          <button type="button" className="btn btn-accent btn-sm" onClick={onNext} autoFocus>
            {last ? 'Get started' : 'Next'} <span className="btn-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default TourOverlay;
