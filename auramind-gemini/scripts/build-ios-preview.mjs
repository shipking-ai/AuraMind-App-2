/**
 * Builds the web bundle with the sample-data iPhone preview enabled
 * (`VITE_IOS_PREVIEW=true`), for deploying /__preview/ios to a static host
 * or a second Vercel project — no sideloading, no account. See
 * DEPLOYMENT.md "iOS Preview Deploy".
 *
 * A wrapper script (not `VITE_IOS_PREVIEW=true vite build`) so it works on
 * Windows PowerShell too, which has no inline-env syntax. Same `--mode
 * mobile` shape as build:ios, minus the Capacitor sync.
 */
import { spawnSync } from 'node:child_process';

process.env.VITE_IOS_PREVIEW = 'true';
const result = spawnSync('npx', ['vite', 'build', '--mode', 'mobile'], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
