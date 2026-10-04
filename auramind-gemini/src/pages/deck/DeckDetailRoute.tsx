import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PlusIcon, Trash2Icon, BookOpenIcon, PlayIcon, PencilIcon, CheckIcon, XIcon, AlertTriangleIcon, RotateCcwIcon, SparklesIcon, ClockIcon, GlobeIcon, ShareIcon } from '../../components/icons/CustomIcons';
import GlassCard from '../../components/shared/GlassCard';
import { useContextMenu } from '../../components/ui/ContextMenu';
import { dbService } from '../../services/database/dbService';
import { getInitialCardState } from '../../services/study/srs';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';
import { usePersonalizedFsrs } from '../../hooks/usePersonalizedFsrs';
import { useShare } from '../../hooks/useNative';
import DashboardQuiz from '../../components/quiz/DashboardQuiz';
import type { Deck, Card, Quiz } from '../../types';
import {
  startGeneration,
  subscribeToGeneration,
  clearCache,
  isCached,
  type GenerationProgress,
} from '../../services/quiz/quizGenerationCache';
import { publishDeckToMarketplace, unpublishDeck, MARKETPLACE_CATEGORIES } from '../../services/decks/marketplaceService';

interface CardForm {
  question: string;
  answer: string;
}

export default function DeckDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showContextMenu, ContextMenuComponent } = useContextMenu();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CardForm>({ question: '', answer: '' });
  const userId = useCurrentUserId();
  const personalization = usePersonalizedFsrs(userId);
  const { share } = useShare();
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CardForm>({ question: '', answer: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishCategory, setPublishCategory] = useState('');
  const [publishTags, setPublishTags] = useState('');
  const [publishDescription, setPublishDescription] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);

  // Quiz generation state (backed by module-level cache so it survives navigation)
  const [quizProgress, setQuizProgress] = useState<GenerationProgress>({ deckId: id || '', status: 'idle', progress: 0, elapsedSeconds: 0, estimatedTotalSeconds: 0 });
  // Increment to re-trigger generation subscription after retry/regenerate
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!id) return;
    if (userId === undefined) return;
    let cancelled = false;
    if (userId === null) { setLoading(false); return; }
    const run = async () => {
      const decks = await dbService.fetchDecks(userId);
      if (cancelled) return;
      const found = decks.find((d) => d.id === id);
      if (cancelled) return;
      setDeck(found || null);
      if (found) setIsPublished(!!found.is_public);
      const allCards = await dbService.fetchCards(userId);
      if (cancelled) return;
      setCards(allCards.filter((c) => c.deckId === id));
      setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [id, userId]);

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.question.trim() || !form.answer.trim() || !userId || !id) return;
    setSaving(true);
    try {
      const newCard = getInitialCardState(id, form.question.trim(), form.answer.trim());
      // Thread personalization into saveCards so the new card starts at the
      // profile-specific difficulty center instead of population-default 7.21.
      const saved = await dbService.saveCards(
        userId,
        [newCard],
        {
          profileLabel: personalization.profileLabel,
          weightsOverride: personalization.weights,
        },
      );
      setForm({ question: '', answer: '' });
      setCards((prev) => [...prev, ...saved]);
    } catch (err) {
      console.error('Failed to save card:', err);
    }
    setSaving(false);
  };

  const handleDeleteCard = useCallback(async (cardId: string) => {
    if (!userId) return;
    await dbService.deleteCard(cardId);
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    if (editingCardId === cardId) setEditingCardId(null);
  }, [userId, editingCardId]);

  const handleDeleteDeck = async () => {
    if (!userId || !id) return;
    try {
      await dbService.deleteDeck(id);
      navigate('/dashboard/decks', { replace: true });
    } catch (err) {
      console.error('Failed to delete deck:', err);
    }
  };

  const handleEditCard = useCallback((card: Card) => {
    setEditingCardId(card.id);
    setEditForm({
      question: (card as any).front || (card as any).question || '',
      answer: (card as any).back || (card as any).answer || '',
    });
  }, []);

  const handleCancelEdit = () => {
    setEditingCardId(null);
    setEditForm({ question: '', answer: '' });
  };

  const handleSaveEdit = async () => {
    if (!editingCardId || !editForm.question.trim() || !editForm.answer.trim()) return;
    setEditSaving(true);
    try {
      const updated = await dbService.updateCard(editingCardId, {
        front: editForm.question.trim(),
        back: editForm.answer.trim(),
      } as Partial<Card>);
      setCards((prev) =>
        prev.map((c) => (c.id === editingCardId ? { ...c, ...updated } : c))
      );
      setEditingCardId(null);
      setEditForm({ question: '', answer: '' });
    } catch (err) {
      console.error('Failed to update card:', err);
    }
    setEditSaving(false);
  };

  const handleCardContextMenu = useCallback(
    (e: React.MouseEvent, card: Card) => {
      showContextMenu(e, [
        {
          id: 'edit',
          label: 'Edit card',
          icon: PencilIcon,
          action: () => handleEditCard(card),
        },
        {
          id: 'delete',
          label: 'Delete card',
          icon: Trash2Icon,
          danger: true,
          action: () => handleDeleteCard(card.id),
        },
      ]);
    },
    [showContextMenu, handleEditCard, handleDeleteCard]
  );

  const handleShareDeck = useCallback(async () => {
    if (!deck) return;
    try {
      await share({
        title: `${deck.title} · BonaMind`,
        text: `${deck.title}\n${deck.description || 'Study this deck in BonaMind.'}\n\nCards: ${cards.length}`,
      });
    } catch {
      // Android share sheets can be dismissed; that is not an app error.
    }
  }, [deck, cards.length, share]);

  const isQuizDeck = useMemo(() => {
    if (!deck) return false;
    return deck.title.includes('(Quiz)') || deck.description?.toLowerCase().includes('quiz');
  }, [deck]);

  // Check for pre-embedded quiz data (from Generator)
  const embeddedQuizData: Quiz | null = useMemo(() => {
    if (!deck?.description?.startsWith('__QUIZ__:')) return null;
    try {
      return JSON.parse(deck.description.slice(9));
    } catch {
      return null;
    }
  }, [deck?.description]);

  const quizData: Quiz | null = embeddedQuizData || quizProgress.quiz || null;

  // Auto-generate quiz from cards using the background cache service.
  // The cache persists across navigation so users can leave and come back.
  useEffect(() => {
    if (!isQuizDeck || !id || embeddedQuizData || cards.length === 0) return;

    // Already cached? Just subscribe for progress updates
    const unsub = subscribeToGeneration(id, (progress) => {
      setQuizProgress(progress);
    });

    // Start generation if not already done/in-flight
    if (!isCached(id)) {
      startGeneration(id, cards);
    }

    return () => { unsub(); };
  }, [isQuizDeck, id, embeddedQuizData, cards, retryKey]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">Loading deck…</p>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-zinc-600 dark:text-zinc-400 text-lg">Deck not found</p>
          <button onClick={() => navigate('/dashboard/decks')} className="text-primary hover:underline text-sm">
            Back to decks
          </button>
        </div>
      </div>
    );
  }

  // ─── Quiz Deck View ────────────────────────────────────────────
  if (isQuizDeck) {
    const { status, progress, elapsedSeconds, estimatedTotalSeconds, error } = quizProgress;
    const etaSeconds = Math.max(0, estimatedTotalSeconds - elapsedSeconds);
    const etaFormatted = etaSeconds < 60
      ? `~${etaSeconds}s`
      : `~${Math.ceil(etaSeconds / 60)}m`;

    // Generating quiz from cards (with ETA progress bar)
    if (status === 'generating') {
      return (
        <div className="min-h-screen bg-zinc-950">
          <div className="max-w-3xl mx-auto px-4 py-8">
            <button
              onClick={() => navigate('/dashboard/decks')}
              className="flex items-center gap-2 text-sm text-zinc-500 hover:text-primary transition-colors mb-6"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Back to decks
            </button>
            <GlassCard variant="neural" className="border-violet-500/25">
              <div className="flex flex-col items-center justify-center py-12 gap-6">
                {/* Spinner */}
                <div className="relative">
                  <div className="animate-spin w-12 h-12 border-2 border-violet-500/30 border-t-violet-400 rounded-full" />
                  <SparklesIcon className="w-5 h-5 text-violet-400 absolute inset-0 m-auto" />
                </div>

                <div className="text-center space-y-2">
                  <p className="text-lg font-semibold text-zinc-100">Generating Quiz</p>
                  <p className="text-sm text-zinc-500">
                    Creating questions from "{deck.title.replace(' (Quiz)', '')}"
                  </p>
                  <p className="text-xs text-zinc-600">
                    {cards.length} card{cards.length === 1 ? '' : 's'} → {Math.min(cards.length, 8)} question{Math.min(cards.length, 8) === 1 ? '' : 's'}
                  </p>
                </div>

                {/* ETA Progress Bar */}
                <div className="w-full max-w-xs space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <div className="flex items-center gap-1.5">
                      <ClockIcon className="w-3 h-3" />
                      <span>ETA {etaFormatted}</span>
                    </div>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${Math.round(progress)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-zinc-600 text-center">
                    Navigate away — generation continues in the background
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      );
    }

    // Quiz error
    if (status === 'error' && !quizData) {
      return (
        <div className="min-h-screen bg-zinc-950">
          <div className="max-w-3xl mx-auto px-4 py-8">
            <button
              onClick={() => navigate('/dashboard/decks')}
              className="flex items-center gap-2 text-sm text-zinc-500 hover:text-primary transition-colors mb-6"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Back to decks
            </button>
            <GlassCard variant="neural" className="border-red-500/20">
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="p-3 bg-red-500/10 rounded-full">
                  <AlertTriangleIcon className="w-8 h-8 text-red-400" />
                </div>
                <p className="text-lg font-semibold text-zinc-100">
                  {error || 'Failed to generate quiz. Try again.'}
                </p>
                <button
                  onClick={() => {
                    if (id) {
                      clearCache(id);
                      startGeneration(id, cards);
                      setRetryKey(k => k + 1);
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 transition-colors"
                >
                  <RotateCcwIcon className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      );
    }

    // No cards — fall through to regular deck view (which has an Add card form)
    // Show quiz when data is ready
    if (quizData) {
      return (
        <div className="min-h-screen bg-zinc-950">
          <div className="max-w-3xl mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => navigate('/dashboard/decks')}
                className="flex items-center gap-2 text-sm text-zinc-500 hover:text-primary transition-colors"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                Back to decks
              </button>
              <button
                onClick={() => {
                  if (id) {
                    clearCache(id);
                    startGeneration(id, cards);
                    setRetryKey(k => k + 1);
                  }
                }}
                className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-800 dark:hover:text-zinc-400 transition-colors"
                title="Regenerate quiz"
              >
                <RotateCcwIcon className="w-3 h-3" />
                Regenerate
              </button>
            </div>
            <DashboardQuiz
              quiz={quizData}
              onComplete={(score, total) => {
                console.warn(`Quiz complete: ${score}/${total}`);
              }}
            />
          </div>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <ContextMenuComponent />
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <button
          onClick={() => navigate('/dashboard/decks')}
          className="flex items-center gap-2 text-sm text-zinc-500 hover:text-primary transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to decks
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">{deck.title}</h1>
            <p className="text-zinc-500 mt-1">{deck.description || 'No description'}</p>
            <p className="text-sm text-zinc-600 mt-1">
              {cards.length} card{cards.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleShareDeck()}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-cyan-400/30 text-cyan-300 text-sm font-medium hover:bg-cyan-400/10 transition-colors"
            >
              <ShareIcon className="w-4 h-4" />
              Share
            </button>
            {isPublished ? (
              <button
                onClick={async () => {
                  if (!id) return;
                  setUnpublishing(true);
                  try {
                    const res = await unpublishDeck(id);
                    if (res.success) {
                      setIsPublished(false);
                    }
                  } finally {
                    setUnpublishing(false);
                  }
                }}
                disabled={unpublishing}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-amber-500/30 text-amber-400 text-sm font-medium hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
              >
                {unpublishing ? (
                  <span className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                ) : (
                  <GlobeIcon className="w-4 h-4" />
                )}
                {unpublishing ? 'Unpublishing…' : 'Unpublish'}
              </button>
            ) : (
              <button
                onClick={() => setShowPublishModal(true)}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-[#7C3AED]/40 text-[#8B5CF6] text-sm font-medium hover:bg-[#7C3AED]/10 transition-colors"
              >
                <GlobeIcon className="w-4 h-4" />
                Publish
              </button>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors"
            >
              <Trash2Icon className="w-4 h-4" />
              Delete
            </button>
            <button
              onClick={() => navigate(`/study/${id}`)}
              disabled={cards.length === 0}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-black font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none"
            >
              <PlayIcon className="w-5 h-5" />
              Study
            </button>
          </div>
        </div>

        {/* Publish to Marketplace Modal */}
        {showPublishModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPublishModal(false)}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-[#7C3AED]/10 rounded-lg">
                  <GlobeIcon className="h-6 w-6 text-[#8B5CF6]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Publish to Marketplace</h3>
                  <p className="text-sm text-zinc-400">
                    Share "{deck.title}" with the community. Others can find and fork it.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {publishSuccess ? (
                  <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
                    <p className="text-emerald-400 text-sm font-medium">Published!</p>
                    <p className="text-zinc-400 text-xs mt-1">
                      Your deck is now live on the marketplace.
                    </p>
                    <button
                      onClick={() => { setShowPublishModal(false); setPublishSuccess(false); }}
                      className="mt-3 px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Category</label>
                      <select
                        value={publishCategory}
                        onChange={e => setPublishCategory(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm focus:border-[#7C3AED]/50 focus:outline-none"
                      >
                        <option value="">Select a category…</option>
                        {MARKETPLACE_CATEGORIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Tags <span className="text-zinc-600 font-normal">(comma-separated)</span></label>
                      <input
                        type="text"
                        value={publishTags}
                        onChange={e => setPublishTags(e.target.value)}
                        placeholder="e.g. biology, cells, mitosis"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm placeholder-zinc-500 focus:border-[#7C3AED]/50 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Description</label>
                      <textarea
                        value={publishDescription}
                        onChange={e => setPublishDescription(e.target.value)}
                        placeholder="What makes this deck useful?"
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm placeholder-zinc-500 focus:border-[#7C3AED]/50 focus:outline-none resize-none"
                      />
                    </div>

                    {publishError && (
                      <p className="text-xs text-red-400">{publishError}</p>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        onClick={() => { setShowPublishModal(false); setPublishError(null); }}
                        className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          if (!publishCategory) {
                            setPublishError('Please select a category');
                            return;
                          }
                          if (!id) return;
                          setPublishing(true);
                          setPublishError(null);
                          try {
                            const tags = publishTags.split(',').map(t => t.trim()).filter(Boolean);
                            const res = await publishDeckToMarketplace(id, {
                              category: publishCategory,
                              tags,
                              description: publishDescription.trim() || deck.description || '',
                            });
                            if (res.success) {
                              setPublishSuccess(true);
                              setIsPublished(true);
                            } else {
                              setPublishError(res.error ?? 'Failed to publish');
                            }
                          } catch (err) {
                            setPublishError(err instanceof Error ? err.message : 'Something went wrong');
                          } finally {
                            setPublishing(false);
                          }
                        }}
                        disabled={publishing || !publishCategory}
                        className="px-4 py-2 rounded-lg bg-[#7C3AED] text-white text-sm font-semibold hover:bg-[#6D28D9] disabled:opacity-50 transition-colors flex items-center gap-2"
                      >
                        {publishing ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Publishing…
                          </>
                        ) : (
                          <>
                            <GlobeIcon className="w-4 h-4" />
                            Publish
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm && (
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-500/10 rounded-lg">
                  <AlertTriangleIcon className="h-6 w-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Delete "{deck.title}"?</h3>
                  <p className="text-sm text-zinc-400">
                    This will permanently delete this deck and all {cards.length} card{cards.length === 1 ? '' : 's'}. This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
<button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteDeck}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-500 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        <GlassCard variant="bordered" className="border-primary/25">
          <h2 className="text-lg font-semibold text-primary mb-4 flex items-center gap-2">
            <PlusIcon className="w-5 h-5" />
            Add card
          </h2>
          <form onSubmit={handleAddCard} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Question</label>
<textarea
                value={form.question}
                onChange={(e) => setForm((p) => ({ ...p, question: e.target.value }))}
                placeholder="What is the capital of France?"
                rows={2}
                className="w-full px-4 py-2.5 rounded-lg bg-zinc-800/70 border border-zinc-700 text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Answer</label>
<textarea
                value={form.answer}
                onChange={(e) => setForm((p) => ({ ...p, answer: e.target.value }))}
                placeholder="Paris"
                rows={2}
                className="w-full px-4 py-2.5 rounded-lg bg-zinc-800/70 border border-zinc-700 text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !form.question.trim() || !form.answer.trim()}
              className="px-5 py-2.5 rounded-xl bg-primary text-black font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add card'}
            </button>
          </form>
        </GlassCard>

        <div className="space-y-3">
          {cards.length === 0 ? (
            <GlassCard variant="neural" className="text-center py-12">
              <BookOpenIcon className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-500">No cards yet. Add your first card above.</p>
            </GlassCard>
          ) : (
            cards.map((card) => {
              const isEditing = editingCardId === card.id;

              if (isEditing) {
                return (
                  <GlassCard key={card.id} variant="bordered" className="border-primary/30 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Question</label>
<textarea
                        value={editForm.question}
                        onChange={(e) => setEditForm((p) => ({ ...p, question: e.target.value }))}
                        rows={2}
                        autoFocus
                        className="w-full px-3 py-2 rounded-lg bg-zinc-800/70 border border-zinc-700 text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Answer</label>
<textarea
                        value={editForm.answer}
                        onChange={(e) => setEditForm((p) => ({ ...p, answer: e.target.value }))}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-800/70 border border-zinc-700 text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleSaveEdit}
                        disabled={editSaving || !editForm.question.trim() || !editForm.answer.trim()}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-black text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        <CheckIcon className="w-3.5 h-3.5" />
                        {editSaving ? 'Saving…' : 'Save'}
                      </button>
<button
                        onClick={handleCancelEdit}
                        disabled={editSaving}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    </div>
                  </GlassCard>
                );
              }

              return (
                <div key={card.id} onContextMenu={(e) => handleCardContextMenu(e, card)}>
                  <GlassCard 
                    variant="neural" 
                    className="flex items-start justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-900 dark:text-white font-medium mb-1 line-clamp-2">{(card as any).front || (card as any).question}</p>
                      <p className="text-zinc-500 text-sm line-clamp-2">{(card as any).back || (card as any).answer}</p>
                      <p className="text-xs text-zinc-600 mt-2">
                        Due {new Date(card.nextReview ?? Date.now()).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEditCard(card)}
                        className="p-2 rounded-lg text-zinc-600 hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Edit card"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCard(card.id)}
                        className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete card"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </div>
                  </GlassCard>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}



