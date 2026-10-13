/**
 * AudioToFlashcardsPanel — record a lecture or upload an audio clip and
 * Linnea turns it into a flashcard deck via Groq Whisper + the LLM.
 *
 * Self-contained; takes the workspace save callbacks as props. Produces:
 *   - a preview of the generated cards
 *   - one-click "Save as Deck"
 *   - the raw transcript (collapsible)
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, UploadCloud, Check, ChevronDown } from '@/components/icons';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { audioToFlashcards, type AudioDeckResult } from '../../services/study/audioToFlashcardsService';
import { toast } from 'sonner';

interface AudioToFlashcardsPanelProps {
  createDeck?: (title: string, description: string) => Promise<{ id: string } | null>;
  addCardsToDeck?: (deckId: string, cards: any[]) => Promise<number | undefined>;
}

export function AudioToFlashcardsPanel({ createDeck, addCardsToDeck }: AudioToFlashcardsPanelProps) {
  const recorder = useAudioRecorder();
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState<AudioDeckResult | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const processAudio = async (blob: Blob, mime?: string) => {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await audioToFlashcards(blob, mime, setStage);
      setResult(r);
      recorder.clear();
      toast.success(`Generated ${r.cards.length} flashcards from audio`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process audio');
    } finally {
      setLoading(false);
    }
  };

  const handleRecorded = async () => {
    const blob = await recorder.stop();
    if (blob) processAudio(blob, blob.type);
  };

  const handleUpload = (f: File) => {
    processAudio(f, f.type);
  };

  const handleSaveDeck = async () => {
    if (!createDeck || !addCardsToDeck || !result || result.cards.length === 0) {
      toast.error('Sign in to save decks');
      return;
    }
    setLoading(true);
    try {
      const deck = await createDeck(result.title, result.description);
      if (deck) {
        const saved = await addCardsToDeck(deck.id, result.cards);
        toast.success(`Deck "${result.title}" created with ${saved ?? result.cards.length} cards`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save deck');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-5">
      <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
        <Mic className="w-4 h-4 text-fuchsia-300" /> Audio → Flashcards
      </h3>
      <p className="text-[11px] text-zinc-500 mb-4">
        Record a lecture or upload a recording. Linnea transcribes it (Whisper) and generates a deck.
      </p>

      {/* Record */}
      {!recorder.recording && !recorder.blob && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => recorder.start()}
            disabled={!recorder.supported || loading}
            className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-dashed border-white/[0.12] hover:border-fuchsia-400/40 transition-colors disabled:opacity-40"
          >
            <div className="w-9 h-9 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <Mic className="w-4 h-4 text-red-400" />
            </div>
            <span className="text-[11px] text-white font-medium">Record</span>
            <span className="text-[9px] text-zinc-500">{recorder.supported ? 'mic' : 'unsupported'}</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-dashed border-white/[0.12] hover:border-sky-400/40 transition-colors disabled:opacity-40"
          >
            <div className="w-9 h-9 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
              <UploadCloud className="w-4 h-4 text-sky-400" />
            </div>
            <span className="text-[11px] text-white font-medium">Upload</span>
            <span className="text-[9px] text-zinc-500">mp3, wav, m4a</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
          />
        </div>
      )}

      {/* Recording state */}
      {recorder.recording && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/5 mb-3">
          <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          </div>
          <div className="flex-1">
            <p className="text-red-400 text-sm font-medium">Recording…</p>
            <p className="text-[10px] text-zinc-500">
              {Math.floor(recorder.durationMs / 60000)}:{String(Math.floor((recorder.durationMs % 60000) / 1000)).padStart(2, '0')}
            </p>
          </div>
          <button onClick={handleRecorded} className="px-3 h-7 rounded-lg bg-red-500 text-white text-[11px] font-medium hover:bg-red-600 transition-colors">
            Done
          </button>
          <button onClick={() => recorder.cancel()} className="px-2 h-7 rounded-lg border border-white/[0.1] text-zinc-400 text-[11px] hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* Finished recording ready to transcribe */}
      {!recorder.recording && recorder.blob && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 mb-3">
          <Mic className="w-4 h-4 text-emerald-400" />
          <div className="flex-1">
            <p className="text-emerald-400 text-sm font-medium">Recording ready</p>
            <p className="text-[10px] text-zinc-500">
              {Math.floor(recorder.durationMs / 60000)}:{String(Math.floor((recorder.durationMs % 60000) / 1000)).padStart(2, '0')} captured
            </p>
          </div>
          <button onClick={handleRecorded} disabled={loading} className="px-3 h-7 rounded-lg bg-emerald-500 text-white text-[11px] font-medium hover:bg-emerald-600 transition-colors disabled:opacity-40">
            Transcribe
          </button>
          <button onClick={() => recorder.clear()} className="px-2 h-7 rounded-lg border border-white/[0.1] text-zinc-400 text-[11px] hover:text-white transition-colors">
            Discard
          </button>
        </div>
      )}

      {/* Processing */}
      {loading && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 text-[11px] text-zinc-300">
          <div className="w-5 h-5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
          {stage || 'Processing…'}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {/* Result */}
      <AnimatePresence>
        {result && !loading && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white font-medium">{result.title}</span>
              <button
                onClick={handleSaveDeck}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-[11px] font-medium hover:bg-emerald-500/30 transition-colors"
              >
                <Check className="w-3.5 h-3.5" /> Save as Deck ({result.cards.length})
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {result.cards.map((c, i) => (
                <div key={i} className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3">
                  <p className="text-[11px] text-white font-medium">{i + 1}. {c.question}</p>
                  <p className="text-[11px] text-zinc-400 mt-1">{c.answer}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowTranscript(s => !s)}
              className="mt-3 inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-white transition-colors"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showTranscript ? 'rotate-180' : ''}`} />
              {showTranscript ? 'Hide' : 'View'} transcript
            </button>
            {showTranscript && (
              <p className="mt-2 text-[11px] text-zinc-500 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                {result.transcript}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}