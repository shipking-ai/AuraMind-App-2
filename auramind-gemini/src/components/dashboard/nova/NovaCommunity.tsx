import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Copy, Globe, Layers, Loader2, RefreshCw, Search, Users,
} from '@/components/icons';
import {
  forkPublicDeck,
  listPublicDecks,
  MARKETPLACE_CATEGORIES,
  type MarketplaceDeck,
  type MarketplaceSort,
} from '../../../services/decks/marketplaceService';
import { refreshWorkspace } from '../../../lib/workspaceRefresh';
import { FadeUp, StaggerList, StaggerItem, HoverLift } from './motion';

const SEARCH_DEBOUNCE_MS = 300;

function CommunityDeckCard({ deck, forking, onFork }: {
  deck: MarketplaceDeck;
  forking: boolean;
  onFork: (deck: MarketplaceDeck) => void;
}) {
  const byline = deck.isMine ? 'by you' : deck.creatorFirstName ? `by ${deck.creatorFirstName}` : 'by an BonaMind learner';

  return (
    <HoverLift className="h-full rounded-xl nova-card transition-shadow duration-300 hover:shadow-lg hover:border-violet-500/40">
      <div className="flex h-full flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-sm font-semibold text-white line-clamp-2">{deck.title}</h3>
          {deck.category && (
            <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-300">
              {deck.category}
            </span>
          )}
        </div>
        {deck.description && (
          <p className="mb-3 text-[11px] leading-relaxed text-zinc-400 line-clamp-2">{deck.description}</p>
        )}

        <div className="mt-auto flex items-center gap-3 text-[10px] text-zinc-500 tabular-nums">
          <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" />{deck.cardCount} card{deck.cardCount !== 1 ? 's' : ''}</span>
          <span className="inline-flex items-center gap-1"><Copy className="h-3 w-3" />{deck.forkCount} fork{deck.forkCount !== 1 ? 's' : ''}</span>
          <span className="min-w-0 truncate">{byline}</span>
        </div>

        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            disabled={forking || deck.cardCount === 0}
            onClick={() => onFork(deck)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-2 text-[11px] font-semibold text-violet-300 transition-colors hover:bg-violet-500/20 focus-visible:ring-2 focus-visible:ring-violet-400/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {forking
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Adding…</>
              : <><Copy className="h-3 w-3" /> {deck.isMine ? 'Make a copy' : 'Add to my library'}</>}
          </motion.button>
        </div>
      </div>
    </HoverLift>
  );
}

/**
 * Published decks from other learners. Adding one forks it on the server
 * (fork_public_deck), so the copy — deck and cards — belongs to the caller.
 */
export function NovaCommunity() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<string>('');
  const [sort, setSort] = useState<MarketplaceSort>('popular');
  const [decks, setDecks] = useState<MarketplaceDeck[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [forkingId, setForkingId] = useState<string | null>(null);
  const [forkError, setForkError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setStatus('loading');
    try {
      const rows = await listPublicDecks({ search: debounced, category, sort });
      if (id !== requestId.current) return; // a newer filter won the race
      setDecks(rows);
      setStatus('ready');
    } catch {
      if (id !== requestId.current) return;
      setStatus('error');
    }
  }, [debounced, category, sort]);

  useEffect(() => { void load(); }, [load]);

  const handleFork = async (deck: MarketplaceDeck) => {
    setForkError(null);
    setForkingId(deck.id);
    try {
      const newDeckId = await forkPublicDeck(deck.id);
      await refreshWorkspace();
      navigate(`/deck/${newDeckId}`);
    } catch {
      setForkError(`Couldn't add "${deck.title}". Try again in a moment.`);
      setForkingId(null);
    }
  };

  const filtering = Boolean(debounced.trim() || category);

  return (
    <div className="space-y-5">
      <FadeUp delay={0.05}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search community decks..."
              aria-label="Search community decks"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-white placeholder-zinc-500 transition-all focus:border-violet-500/40 focus:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
            />
          </div>
          <div className="flex shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5" role="group" aria-label="Sort">
            {(['popular', 'newest'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                aria-pressed={sort === s}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${sort === s ? 'bg-violet-500/20 text-violet-200' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </FadeUp>

      <FadeUp delay={0.08}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
          {['', ...MARKETPLACE_CATEGORIES].map(c => (
            <button
              key={c || 'all'}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${category === c ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/[0.08] text-zinc-400 hover:border-white/[0.16] hover:text-zinc-200'}`}
            >
              {c || 'All'}
            </button>
          ))}
        </div>
      </FadeUp>

      {forkError && (
        <div role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
          {forkError}
        </div>
      )}

      {status === 'loading' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading community decks">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-10 text-center">
          <h3 className="mb-2 text-sm font-semibold text-white">Couldn't load community decks</h3>
          <p className="mb-5 text-xs text-zinc-500">Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl bg-white/[0.06] px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.1]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {status === 'ready' && decks.length > 0 && (
        <StaggerList className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" stagger={0.04}>
          {decks.map(deck => (
            <StaggerItem key={deck.id}>
              <CommunityDeckCard deck={deck} forking={forkingId === deck.id} onFork={handleFork} />
            </StaggerItem>
          ))}
        </StaggerList>
      )}

      {status === 'ready' && decks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/20 to-violet-600/10">
            {filtering ? <Search className="h-6 w-6 text-violet-300" /> : <Globe className="h-6 w-6 text-violet-300" />}
          </div>
          <h3 className="mb-2 text-sm font-semibold text-white">
            {filtering ? 'No matching decks' : 'No community decks yet'}
          </h3>
          <p className="mx-auto max-w-sm text-xs text-zinc-500">
            {filtering
              ? 'Try a different search or category.'
              : 'Be the first: open one of your decks and choose "Publish to Marketplace" to share it here.'}
          </p>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[10px] text-zinc-600">
        <Users className="h-3 w-3" /> Adding a deck copies it into your library. Changes you make stay yours.
      </p>
    </div>
  );
}
