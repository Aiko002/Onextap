import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

// Public landing site → dist-dashboard/: `/`, `/about/`, `/contact/`,
// `/privacy/`. The source is landing/, a vendored copy of
// UncannySteel/DEMO_WEB (see landing/README.md and docs/repo-structure.md).
//
// Built the way that repo builds itself, so the page ships as designed:
//   - no PostCSS plugins. An inline `css.postcss` stops Vite finding the root
//     postcss.config.js, whose Tailwind preflight and autoprefixer belong to
//     the React app and would restyle the landing page;
//   - the browser targets of that repo's Vite 7 default
//     ('baseline-widely-available'), not this repo's Vite 5 default, so
//     esbuild lowers neither its CSS nor its JS any further.
//
// `npm run build:dashboard` runs vite.dashboard.config.js first (it empties
// dist-dashboard/ and puts the React dashboard at /app/), then this, which
// adds to the same folder without emptying it.
export default defineConfig({
  root: here('./landing'),
  envDir: here('.'),            // VITE_SUPABASE_* come from the root .env
  publicDir: here('./public'),  // /icon.png for the favicon in dev
  // Its own pre-bundle cache: `npm run dev` runs this beside the dashboard's
  // dev server, and two servers sharing node_modules/.vite race each other.
  cacheDir: here('./node_modules/.vite-landing'),
  css: { postcss: {} },
  // Four real pages and nothing else: no fallback to the landing page for
  // unknown paths in dev, where /app/ (the dashboard) does not exist and the
  // landing page would forward a signed-in reader to itself.
  appType: 'mpa',
  server: {
    port: 5180,
    strictPort: true,
  },
  build: {
    outDir: here('./dist-dashboard'),
    emptyOutDir: false,
    target: ['chrome107', 'edge107', 'firefox104', 'safari16'],
    rollupOptions: {
      input: {
        main: here('./landing/index.html'),
        about: here('./landing/about/index.html'),
        contact: here('./landing/contact/index.html'),
        privacy: here('./landing/privacy/index.html'),
      },
    },
  },
});
