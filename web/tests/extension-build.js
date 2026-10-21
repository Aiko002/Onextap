// Builds the extension for tests/extension.spec.js, into a temp folder (never
// dist/), with addresses that cannot resolve (.invalid is reserved, RFC 2606):
// the tests answer every call with stubs, and a call they forgot fails instead
// of reaching a real project or the live API. Variables set here win over the
// repo's .env: Vite reads the process environment first.
//
// Two copies. EXTENSION_DIR lists the application types src/applicationTypes.js
// lists (Job alone today, so no type picker). EXTENSION_ALL_TYPES_DIR lists
// every type through the e2e override (ONEXTAP_E2E_APPLICATION_TYPES=all,
// scripts/applicationTypesOverride.js), so turning the others on is already
// tested (completion plan B6-1). The first copy clears the override, so a value
// left in the shell cannot list more types in it.
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXTENSION_DIR = path.join(os.tmpdir(), 'onextap-e2e-extension');
export const EXTENSION_ALL_TYPES_DIR = path.join(os.tmpdir(), 'onextap-e2e-extension-all-types');

export const EXTENSION_ENV = {
  VITE_SUPABASE_URL: 'https://e2e.invalid',
  VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
  VITE_API_URL: 'https://api.e2e.invalid',
  VITE_DASHBOARD_URL: 'http://localhost:5173'
};

function build(outDir, env) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  execFileSync(process.execPath, [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'
  ], { cwd: root, env: { ...process.env, ...EXTENSION_ENV, ...env }, stdio: 'inherit' });
}

export default function buildExtension() {
  build(EXTENSION_DIR, { ONEXTAP_E2E_APPLICATION_TYPES: '' });
  build(EXTENSION_ALL_TYPES_DIR, { ONEXTAP_E2E_APPLICATION_TYPES: 'all' });
}
