/**
 * The Windows app's layout: a Windows 11-style sidebar beside the page.
 * Chosen by NovaDashboardShell via shouldUseWindowsShell(); styles live in
 * src/styles/windows.css.
 */
import React from 'react';
import { WindowsSidebar } from './WindowsSidebar';

export function WindowsShell({ children, overlays }: { children: React.ReactNode; overlays?: React.ReactNode }) {
  return (
    <div className="win-shell">
      <WindowsSidebar />
      <main className="win-content" id="nova-main-content">
        {children}
      </main>
      {overlays}
    </div>
  );
}
