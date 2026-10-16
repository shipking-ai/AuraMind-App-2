/**
 * The Windows app's Library: every course, searchable and sortable. Click to
 * study; right-click for Study / Open / Delete.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import type { Deck } from '../../types';
import { libraryRows, type LibrarySort } from './libraryModel';
import { WindowsDialog } from './WindowsDialog';

function relativeDay(at: number, now: number): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 className="win-title" style={{ marginRight: 'auto' }}>Library</h1>
        <button type="button" className="win-button win-button-primary" onClick={() => navigate('/dashboard/generator')}>
          New course
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <input
          type="search"
          aria-label="Search courses"
          placeholder="Search courses"
          className="win-input"
          style={{ flex: 1 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="win-muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Sort
          <select aria-label="Sort" className="win-input" value={sort} onChange={(e) => setSort(e.target.value as LibrarySort)}>
            <option value="due">Due first</option>
            <option value="recent">Recently studied</option>
            <option value="az">A–Z</option>
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="win-muted">{query ? 'No courses match your search.' : 'No courses yet.'}</p>
      ) : (
        <div className="win-card win-list">
          {rows.map((r) => (
            <button
              key={r.deck.id}
              type="button"
              className="win-row"
              onClick={() => ws.startStudyForDeck(r.deck.id)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ deck: r.deck, x: e.clientX, y: e.clientY, trigger: e.currentTarget }); }}
            >
              <span>{r.deck.title}</span>
              <span className="win-row-end">
                {r.cards} cards · {r.due} due{r.lastStudied ? ` · studied ${relativeDay(r.lastStudied, now)}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}

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
            <p role="alert" style={{ color: '#c42b1c' }}>Couldn't delete this course. Check your connection and try again.</p>
          )}
        </WindowsDialog>
      )}
    </div>
  );
}
