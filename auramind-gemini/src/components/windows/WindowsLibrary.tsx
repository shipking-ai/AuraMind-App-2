/**
 * The Windows app's Library: every course, searchable and sortable. Click to
 * study; right-click for Study / Open / Delete.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import type { Deck } from '../../types';
import { libraryRows, studiedLabel, type LibrarySort } from './libraryModel';
import { WindowsDialog } from './WindowsDialog';

interface MenuState { deck: Deck; x: number; y: number; trigger: HTMLElement }
interface ConfirmState { deck: Deck; trigger: HTMLElement }

export function WindowsLibrary() {
  const navigate = useNavigate();
  const ws = useDashboardWorkspace()!;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('due');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const now = Date.now();
  const rows = libraryRows(ws.decks, ws.cards, now, query, sort);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  const pick = (action: () => void) => { setMenu(null); action(); };

  return (
    <div className="win-page">
      <div className="win-cmd">
        <button type="button" className="win-button win-button-primary" onClick={() => navigate('/dashboard/generator')}>
          New course
        </button>
        <div className="win-cmd-end">
          <input
            type="search"
            aria-label="Search courses"
            placeholder="Search courses"
            className="win-input"
            style={{ width: 220 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="win-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Sort
            <select aria-label="Sort" className="win-input" value={sort} onChange={(e) => setSort(e.target.value as LibrarySort)}>
              <option value="due">Due first</option>
              <option value="recent">Recently studied</option>
              <option value="az">A–Z</option>
            </select>
          </label>
        </div>
      </div>

      <div className="win-body">
        <h1 className="win-title">Library</h1>
        {rows.length === 0 ? (
          <p className="win-muted" style={{ marginTop: 16 }}>{query ? 'No courses match your search.' : 'No courses yet.'}</p>
        ) : (
          <table className="win-table" style={{ marginTop: 16 }}>
            <thead>
              <tr><th>Course</th><th className="num">Due</th><th className="num">Cards</th><th>Last studied</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.deck.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const trigger = (e.target as HTMLElement).closest('tr')?.querySelector('button') ?? (e.currentTarget as HTMLElement);
                    setMenu({ deck: r.deck, x: e.clientX, y: e.clientY, trigger });
                  }}
                >
                  <td>
                    <button type="button" className="win-cell-button" onClick={() => ws.startStudyForDeck(r.deck.id)}>
                      {r.deck.title}
                    </button>
                  </td>
                  <td className="num">{r.due}</td>
                  <td className="num">{r.cards}</td>
                  <td className="win-muted">{r.lastStudied ? studiedLabel(r.lastStudied, now) : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="win-status">
        {ws.decks.length} {ws.decks.length === 1 ? 'course' : 'courses'} · {rows.reduce((n, r) => n + r.due, 0)} cards due
      </div>

      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={menu.deck.title}
          className="win-menu"
          style={{ left: menu.x, top: menu.y }}
          onKeyDown={(e) => { if (e.key === 'Escape') setMenu(null); }}
        >
          <button type="button" role="menuitem" className="win-menu-item" onClick={() => pick(() => ws.startStudyForDeck(menu.deck.id))}>Study</button>
          <button type="button" role="menuitem" className="win-menu-item" onClick={() => pick(() => navigate(`/deck/${menu.deck.id}`))}>Open</button>
          <button type="button" role="menuitem" className="win-menu-item" onClick={() => pick(() => { setDeleteError(false); setConfirm({ deck: menu.deck, trigger: menu.trigger }); })}>Delete</button>
        </div>
      )}

      {confirm && (
        <WindowsDialog
          title={`Delete "${confirm.deck.title}"?`}
          onClose={() => { if (!deleting) setConfirm(null); }}
          closeOnBackdrop
          returnFocusTo={confirm.trigger}
          actions={
            <>
              <button type="button" className="win-button" data-autofocus disabled={deleting} onClick={() => setConfirm(null)}>Cancel</button>
              <button
                type="button"
                className="win-button win-button-danger"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  setDeleteError(false);
                  try {
                    await ws.deleteDeck(confirm.deck.id);
                    setConfirm(null);
                  } catch {
                    setDeleteError(true);
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                Delete course
              </button>
            </>
          }
        >
          <p className="win-muted">Its cards are deleted too. This can't be undone.</p>
          {deleteError && (
            <p role="alert" className="win-alert">Couldn't delete this course. Check your connection and try again.</p>
          )}
        </WindowsDialog>
      )}
    </div>
  );
}
