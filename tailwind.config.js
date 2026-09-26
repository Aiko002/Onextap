// Each `onextap-*` colour is `rgb(var(--ox-*, <default>) / <alpha-value>)`.
// The default after the comma is the colour itself, so every surface that
// never sets the variable — the landing page, the extension popup — renders
// exactly the hex it always did. The signed-in dashboard sets the variables on
// its `.oxd` root (src/components/dashboard/dashboard.css) to the DEMO_DASH
// palette, which is how shared components rendered inside it (ProfileSwitcher,
// ResumeSwitcher, CoverLetterPanel, FabricationNotice) pick up that palette
// without a surface-specific prop.
const token = (name, rgb) => `rgb(var(--ox-${name}, ${rgb}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'ui-serif', 'serif'],
      },
      colors: {
        onextap: {
          primary: token('primary', '45 74 45'),              // #2D4A2D
          'primary-dark': token('primary-dark', '61 92 61'),  // #3D5C3D
          'primary-light': token('primary-light', '90 122 58'), // #5A7A3A
          'olive-muted': token('olive-muted', '232 239 216'), // #E8EFD8
          'olive-pale': token('olive-pale', '200 216 168'),   // #C8D8A8
          dark: token('dark', '26 26 20'),                    // #1A1A14
          cream: token('cream', '245 242 236'),               // #F5F2EC
          'cream-dark': token('cream-dark', '237 233 224'),   // #EDE9E0
          bark: token('bark', '58 46 28'),                    // #3A2E1C
          'bark-mid': token('bark-mid', '92 74 42'),          // #5C4A2A
          'bg-light': token('bg-light', '245 242 236'),       // #F5F2EC
          'bg-sidebar': token('bg-sidebar', '237 233 224'),   // #EDE9E0
          night: token('night', '26 36 20'),                  // #1A2414
          'night-card': token('night-card', '36 48 32'),      // #243020
          'night-surface': token('night-surface', '30 42 24'), // #1E2A18
          muted: token('muted', '122 122 100'),               // #7A7A64
          secondary: token('secondary', '74 74 56'),          // #4A4A38
        },
      },
    },
  },
  plugins: [],
}
