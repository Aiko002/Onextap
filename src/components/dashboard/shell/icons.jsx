import React from 'react';

// DEMO_DASH's inline icon set (js/icons.js), adapted from Lucide (ISC). Kept
// as its own set rather than swapped for lucide-react so the shell draws the
// exact strokes the design specifies; the workspaces keep using lucide-react.
// The markup is static and authored here — nothing user-supplied reaches it.
const PATHS = {
  overview: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  dockLeft: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  dockRight: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
  float: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="11" y="11" width="7" height="7" rx="1"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"/>',
};

/**
 * @param {object} props
 * @param {keyof typeof PATHS} props.name
 * @param {number} [props.size=18]
 */
export function Icon({ name, size = 18 }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }}
    />
  );
}

/** The Onextap mark, as the landing's nav draws it. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 92.84 100" aria-hidden="true">
      <path fillRule="evenodd" d="M92.84 50.05C92.84 58.13 91.43 66.31 88.03 74C84.63 81.69 78.91 88.7 71.49 93.27C64.07 97.84 55.26 100.02 46.54 100C37.82 99.98 29.01 97.86 21.55 93.33C14.1 88.79 8.34 81.79 4.9 74.08C1.47 66.38 -0.01 58.17 0 50.05C0.01 41.92 1.47 33.72 4.88 26C8.29 18.27 14.01 11.19 21.5 6.67C28.98 2.15 37.8 0.02 46.54 0C55.27 -0.02 64.11 2.17 71.53 6.75C78.96 11.34 84.66 18.38 88.05 26.08C91.44 33.78 92.84 41.97 92.84 50.05ZM83.91 50.05C85.07 56.57 86.01 64.05 84.27 71.83C82.53 79.61 77.58 87.16 70.39 91.36C63.2 95.56 54.24 95.87 46.54 94.19C38.84 92.5 32.11 88.77 26.89 84.08C21.67 79.4 17.89 73.9 15.11 68.19C12.32 62.49 10.31 56.58 9.12 50.05C7.92 43.52 7.03 36.02 8.77 28.24C10.52 20.46 15.54 12.99 22.71 8.78C29.88 4.56 38.84 4.24 46.54 5.91C54.24 7.58 60.99 11.29 66.19 16.01C71.39 20.72 75.22 26.16 78.02 31.87C80.83 37.58 82.74 43.52 83.91 50.05Z" />
    </svg>
  );
}

/** The dialog close glyph (DEMO_DASH's ×). */
export function CloseGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}
