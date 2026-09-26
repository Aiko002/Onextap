// `npm run dev` — the website in development, laid out the way vercel.json
// serves it in production: the landing site at / (vite.landing.config.js) and
// the React dashboard at /app/ (vite.dashboard.config.js). Two Vite dev
// servers, each with its own hot reload, behind one port, because the two
// builds cannot share one: the landing page must never go through the
// dashboard's Tailwind/PostCSS pipeline.
//
// Port 5173 on purpose: it is the local origin the backend's CORS list, the
// extension's externally_connectable and .env.example's VITE_DASHBOARD_URL
// already expect. The extension's own dev server (CRXJS) is
// `npm run dev:extension`, and the two cannot run at once.
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const APP = '/app/';

// vercel.json's redirects (/about → /about/, /app → /app/, …), so dev and
// production agree on every address.
const { redirects = [] } = JSON.parse(fs.readFileSync(here('../vercel.json'), 'utf8'));
const redirectFor = (path) => redirects.find((r) => r.source === path)?.destination;

const landing = await createServer({
  configFile: here('../vite.landing.config.js'),
  server: { middlewareMode: true, hmr: { port: 24678 } },
});
const dashboard = await createServer({
  configFile: here('../vite.dashboard.config.js'),
  base: APP,
  server: { middlewareMode: true, hmr: { port: 24679 } },
});

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const to = redirectFor(url.pathname);
  if (to) {
    res.writeHead(307, { location: to + url.search });
    return res.end();
  }
  // The legal policy, as vercel.json rewrites it (a dashboard build entry).
  if (url.pathname === '/privacy-policy') req.url = APP + 'privacy-policy.html';
  if (req.url.startsWith(APP)) return dashboard.middlewares(req, res);
  return landing.middlewares(req, res);
}).listen(PORT, () => {
  landing.config.logger.info(
    `\n  Onextap website (dev)\n` +
    `  ➜  Landing:   http://localhost:${PORT}/\n` +
    `  ➜  Dashboard: http://localhost:${PORT}${APP}\n`,
  );
});
