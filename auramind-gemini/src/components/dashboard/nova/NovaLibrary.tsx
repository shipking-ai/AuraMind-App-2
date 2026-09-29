import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Plus, Search, Trash2, AlertTriangle, Brain, Edit3,
} from '@/components/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDashboardWorkspace } from '../../../contexts/DashboardWorkspaceContext';
import {
  FadeUp, StaggerList, StaggerItem, HoverLift, AnimatedBar,
} from './motion';
import { MiniSparkle } from './icons';
import { NovaCommunity } from './NovaCommunity';

type LibraryTab = 'mine' | 'community';

const LIBRARY_TABS: Array<{ id: LibraryTab; label: string }> = [
  { id: 'mine', label: 'My decks' },
  { id: 'community', label: 'Community' },
];

// ─── Deck Card ──────────────────────────────────────────────────────────────

function LibraryDeckCard({ deck, cards, onDelete, i }: {
  deck: any;
  cards: any[];
  onDelete: (id: string) => void;
  i: number;
}) {
  const navigate = useNavigate();
  const deckCards = cards.filter(c => c.deckId === deck.id);
  const due = deckCards.filter(c => c.nextReview <= Date.now()).length;
  const total = deckCards.length;
  const lastReviewed = deckCards.filter(c => c.lastReviewed).sort((a, b) => b.lastReviewed - a.lastReviewed)[0];
  const progress = total > 0 ? Math.round((deckCards.filter(c => (c.repetition ?? 0) > 0).length / total) * 100) : 0;

  const hoverBorder = [
    'hover:border-violet-500/40',
    'hover:border-cyan-500/40',
    'hover:border-emerald-500/40',
    'hover:border-rose-500/40',
    'hover:border-amber-500/40',
  ][i % 5];

  return (
    <HoverLift className={`rounded-xl nova-card transition-shadow duration-300 hover:shadow-lg ${hoverBorder}`}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white truncate group-hover:text-violet-200 transition-colors">
              {deck.title}
            </h3>
            {deck.description && (
              <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{deck.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2">
            {due > 0 && (
              <motion.span
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 + i * 0.04, type: 'spring', stiffness: 280, damping: 18 }}
                className="px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 text-[9px] font-bold tabular-nums"
              >
                {due}
              </motion.span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-zinc-500 tabular-nums">{total} cards</span>
              <span className="text-[10px] text-zinc-500 tabular-nums">{progress}%</span>
            </div>
            <AnimatedBar value={progress} delay={0.15 + i * 0.04} />
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
          {lastReviewed && <span>{Math.round((Date.now() - lastReviewed.lastReviewed) / 3600000)}h ago</span>}
          {!lastReviewed && <span>Not studied yet</span>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.06]">
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/study/${deck.id}`); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 text-violet-300 text-[10px] font-semibold rounded-lg hover:bg-violet-500/20 transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/40"
          >
            <Brain className="w-3 h-3" /> Study
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={(e) => { e.stopPropagation(); navigate(`/deck/${deck.id}`); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] text-zinc-400 text-[10px] font-semibold rounded-lg hover:bg-white/[0.08] hover:text-zinc-200 transition-colors"
          >
            <Edit3 className="w-3 h-3" /> Edit
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.stopPropagation(); onDelete(deck.id); }}
            className="ml-auto p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
            aria-label={`Delete ${deck.title}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </div>
    </HoverLift>
  );
}

// ─── New Deck Modal ─────────────────────────────────────────────────────────

function NewDeckModal({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string, desc: string) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try { await onCreate(title.trim(), desc.trim()); onClose(); }
    finally { setLoading(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#161B2E] p-6 shadow-2xl"
      >
        <div className="flex items-center gap-2 mb-1">
          <MiniSparkle size={14} color="#A78BFA" />
          <h2 className="text-lg font-semibold text-white">Create New Deck</h2>
        </div>
        <p className="text-sm text-zinc-500 mb-5">Name your deck — you can add cards right after.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Deck Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Biochemistry — Enzymes"
              className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/40 focus:bg-white/[0.06] transition-all focus-visible:ring-2 focus-visible:ring-violet-400/40"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Description (optional)</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="What's this deck about?"
              rows={2}
              className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/40 focus:bg-white/[0.06] transition-all resize-none"
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={!title.trim() || loading}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-violet-500 text-white text-sm font-semibold rounded-xl hover:from-violet-500 hover:to-violet-400 transition-all shadow-lg shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Deck'}
            </motion.button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-zinc-400 text-sm font-medium rounded-xl hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── NovaLibrary ────────────────────────────────────────────────────────────

export function NovaLibrary() {
  const _navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const { decks, cards, createDeck, deleteDeck } = workspace!;

  const [showNewDeck, setShowNewDeck] = useState(false);
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // The tab lives in the URL so /dashboard/decks?tab=community is linkable.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: LibraryTab = searchParams.get('tab') === 'community' ? 'community' : 'mine';
  const selectTab = (next: LibraryTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'mine') params.delete('tab'); else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  const filtered = decks.filter(d =>
    d.title.toLowerCase().includes(query.toLowerCase()) ||
    (d.description || '').toLowerCase().includes(query.toLowerCase())
  );

  const handleCreate = async (title: string, desc: string) => { await createDeck(title, desc); };
  const handleDelete = async (id: string) => {
    try { await deleteDeck(id); setConfirmDelete(null); }
    catch (err) { console.error('Delete failed:', err); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <FadeUp y={6}>
        <div className="nova-card-elevated flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div>
            <div className="nova-label text-violet-200/80">Your collection</div>
            <h1 className="nova-display mt-1 text-3xl text-white sm:text-4xl">Library</h1>
            <p className="mt-2 text-sm tabular-nums text-zinc-300/85">
              {decks.length} deck{decks.length !== 1 ? 's' : ''} · {cards.length} card{cards.length !== 1 ? 's' : ''}
            </p>
          </div>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowNewDeck(true)}
            className="nova-cta"
          >
            <Plus className="h-3.5 w-3.5" /> New deck
          </motion.button>
        </div>
      </FadeUp>

      {/* Tabs */}
      <div role="tablist" aria-label="Library" className="flex gap-1 border-b border-white/[0.06]">
        {LIBRARY_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`library-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`library-panel-${t.id}`}
            onClick={() => selectTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40 ${tab === t.id ? 'border-violet-400 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'community' ? (
        <div role="tabpanel" id="library-panel-community" aria-labelledby="library-tab-community">
          <NovaCommunity />
        </div>
      ) : (
      <div role="tabpanel" id="library-panel-mine" aria-labelledby="library-tab-mine" className="space-y-6">
      {/* Search */}
      <FadeUp delay={0.05}>
        <div className="relative max-w-md focus-within:max-w-lg transition-all duration-300">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search decks..."
            className="w-full pl-9 pr-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/40 focus:bg-white/[0.06] focus:shadow-lg focus:shadow-violet-500/5 transition-all focus-visible:ring-2 focus-visible:ring-violet-400/40"
          />
        </div>
      </FadeUp>

      {/* Grid */}
      {filtered.length > 0 ? (
        <StaggerList className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" stagger={0.04}>
          {filtered.map((deck, i) => (
            <StaggerItem key={deck.id}>
              <LibraryDeckCard deck={deck} cards={cards} onDelete={(id) => setConfirmDelete(id)} i={i} />
            </StaggerItem>
          ))}
        </StaggerList>
      ) : (
        <FadeUp delay={0.15}>
          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-12 text-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 220, damping: 18 }}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-600/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4"
            >
              {query ? <Search className="w-6 h-6 text-violet-300" /> : <BookOpen className="w-6 h-6 text-violet-300" />}
            </motion.div>
            <h3 className="text-sm font-semibold text-white mb-2">
              {query ? 'No matching decks' : 'Your library is empty'}
            </h3>
            <p className="text-xs text-zinc-500 mb-5">
              {query ? 'Try a different search term' : 'Create your first deck to start your learning journey'}
            </p>
            {!query && (
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowNewDeck(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-violet-500 text-white text-sm font-semibold rounded-xl hover:from-violet-500 hover:to-violet-400 transition-all shadow-lg shadow-violet-500/20"
              >
                <Plus className="w-4 h-4" /> Create Your First Deck
              </motion.button>
            )}
          </div>
        </FadeUp>
      )}
      </div>
      )}

      {/* Delete Confirmation */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-white/[0.12] bg-[#161B2E] p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <motion.div
                  initial={{ rotate: -15, scale: 0.6 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 16 }}
                  className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center"
                >
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                </motion.div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Delete deck?</h3>
                  <p className="text-xs text-zinc-400">This action cannot be undone.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleDelete(confirmDelete)}
                  className="flex-1 px-4 py-2.5 bg-rose-500 text-white text-sm font-semibold rounded-xl hover:bg-rose-600 transition-colors"
                >
                  Delete
                </motion.button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-4 py-2.5 bg-white/[0.04] text-zinc-400 text-sm font-medium rounded-xl hover:text-zinc-200 hover:bg-white/[0.08] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Deck Modal */}
      <AnimatePresence>
        {showNewDeck && (
          <NewDeckModal onClose={() => setShowNewDeck(false)} onCreate={handleCreate} />
        )}
      </AnimatePresence>
    </div>
  );
}
