import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from './tailwind.config.js';

// The dashboard's page is emitted at app/index.html, not index.html: `/`
// belongs to the public landing site (vite.landing.config.js, built after
// this into the same folder), and the dashboard is served at /app/.
const DASHBOARD_HTML = 'app/index.html';

function dashboardAtApp() {
  return {
    name: 'onextap-dashboard-at-app',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = bundle['index.html'];
      if (!page) this.error('expected the dashboard page at index.html');
      delete bundle['index.html'];
      // Its asset URLs are absolute (base '/'), so it works from /app/ as is.
      this.emitFile({ type: 'asset', fileName: DASHBOARD_HTML, source: page.source });
    },
  };
}

// Web dashboard build → dist-dashboard/. `npm run build:dashboard` runs this
// and then vite.landing.config.js; that script is what vercel.json runs. No
// crx() plugin and no extension APIs — the same React app detects at runtime
// that chrome.* is absent. The extension build is the separate vite.config.js.
export default defineConfig({
  plugins: [
    react(),
    dashboardAtApp(),
  ],
  // Web build only: PublicLandingPage hands signed-out readers to the landing
  // site. The extension build never defines it and keeps its own landing.
  define: {
    __ONEXTAP_WEB_LANDING__: 'true',
  },
  build: {
    outDir: 'dist-dashboard',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './index.html',
        privacy: './privacy-policy.html',
      },
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss(tailwindConfig), autoprefixer()]
    }
  },
  base: '/', // Adjust if deploying to a subdirectory
});
