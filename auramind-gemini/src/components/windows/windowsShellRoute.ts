import { isDesktopApp } from '../../lib/platform';

/**
 * The Windows app gets its own shell on every dashboard route, study
 * sessions included, but the admin pages keep the website layout.
 */
export function shouldUseWindowsShell(pathname: string): boolean {
  return isDesktopApp() && !pathname.startsWith('/admin');
}
