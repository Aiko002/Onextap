import React, { useEffect } from 'react';

/**
 * DEMO_DASH's toast — an ink pill with a citrine dot — speaking the same
 * contract as shared/Toast.jsx, because the workspaces call
 * `showToast(message, type)` either way: 'success' and 'error' dismiss
 * themselves, 'loading' stays until the next toast replaces it.
 *
 * Always mounted, so the pill can animate out rather than vanish.
 */
export default function ShellToast({ message, type = 'success', isVisible, onDismiss }) {
  useEffect(() => {
    if (!isVisible || !message || type === 'loading') return undefined;
    const t = setTimeout(onDismiss, type === 'error' ? 4200 : 2800);
    return () => clearTimeout(t);
  }, [isVisible, message, type, onDismiss]);

  const show = isVisible && !!message;
  return (
    <div
      className="toast"
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      data-type={type}
      data-show={show ? '' : undefined}
    >
      {show ? message : ''}
    </div>
  );
}
