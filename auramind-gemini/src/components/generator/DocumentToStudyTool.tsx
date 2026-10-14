/**
 * DocumentToStudyTool — upload a document (PDF/DOCX/PPTX/TXT) and turn it
 * into organised study material:
 *   - organized notes (markdown-style, with sections)
 *   - a presentation deck (rendered slides)
 *   - a flashcard deck (sent back through the workspace's addCardsToDeck)
 *
 * Self-contained: takes the workspace save callbacks as props so it can be
 * dropped into the Generator page, the Dashboard, or anywhere else.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, NotebookPen, Presentation, Layers, Sparkles, Check, Download } from '@/components/icons';
import { extractStudyAssetText } from '../../services/import/documentImportService';
import { generateOrganizedNotes, generatePresentation, type StudyNotes, type Slide } from '../../services/study/documentToStudyService';
import { generateFlashcards, type GeneratedCard } from '../../services/api/groqService';
import { toast } from 'sonner';

type OutputTab = 'notes' | 'slides' | 'flashcards';

interface DocumentToStudyToolProps {
  createDeck?: (title: string, description: string) => Promise<{ id: string } | null>;
  addCardsToDeck?: (deckId: string, cards: any[]) => Promise<number | undefined>;
}

export function DocumentToStudyTool({ createDeck, addCardsToDeck }: DocumentToStudyToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<OutputTab>('notes');
  const [notes, setNotes] = useState<StudyNotes | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pickFile = async (f: File) => {
    setFile(f);
    setError(null);
    setLoading(true);
    try {
      const text = await extractStudyAssetText(f);
      setSourceText(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to extract text');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNotes = async () => {
    setBusy(true); setError(null);
    try {
      const n = await generateOrganizedNotes(sourceText);
      setNotes(n); setTab('notes');
      toast.success('Notes generated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate notes');
    } finally { setBusy(false); }
  };

  const handleGenerateSlides = async () => {
    setBusy(true); setError(null);
    try {
      const s = await generatePresentation(sourceText, 6);
      setSlides(s); setTab('slides');
      toast.success('Presentation generated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate slides');
    } finally { setBusy(false); }
  };

  const handleGenerateCards = async () => {
    setBusy(true); setError(null);
    try {
      const c = await generateFlashcards(sourceText, { difficulty: 'mixed', includeExplanations: true });
      setCards(c); setTab('flashcards');
      toast.success(`${c.length} flashcards generated`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate flashcards');
    } finally { setBusy(false); }
  };

  const handleSaveDeck = async () => {
    if (!createDeck || !addCardsToDeck || cards.length === 0) {
      toast.error('Sign in to save decks');
      return;
    }
    setBusy(true);
    try {
      const title = file?.name.replace(/\.[^.]+$/, '') ?? 'Document Deck';
      const deck = await createDeck(title, `Auto-generated from ${file?.name ?? 'document'}`);
      if (deck) {
        await addCardsToDeck(deck.id, cards);
        toast.success(`Deck "${title}" created with ${cards.length} cards`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save deck');
    } finally { setBusy(false); }
  };

  const exportNotes = () => {
    if (!notes) return;
    const md = `# ${notes.title}\n\n${notes.summary}\n\n` +
      notes.sections.map(s => `## ${s.heading}\n\n${s.body}`).join('\n\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${notes.title.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-5">
      <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
        <NotebookPen className="w-4 h-4 text-violet-300" />
        Document → Study Material
      </h3>
      <p className="text-[11px] text-zinc-500 mb-4">
        Upload a PDF, DOCX, PPTX or TXT. Linnea extracts the text and turns it into organized notes, slides, or flashcards.
      </p>

      {/* File dropzone */}
      <div
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => document.getElementById('doc-input')?.click()}
        className="border border-dashed border-white/[0.12] hover:border-violet-400/40 rounded-xl p-6 text-center cursor-pointer transition-colors bg-white/[0.02]"
      >
        <input
          id="doc-input"
          type="file"
          accept=".pdf,.pptx,.docx,.doc,.txt,.md"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
        />
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-7 h-7 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
            <p className="text-[11px] text-zinc-400">Extracting text…</p>
          </div>
        ) : file ? (
          <div className="flex flex-col items-center gap-1">
            <FileText className="w-7 h-7 text-emerald-400" />
            <p className="text-xs text-emerald-400 font-medium">{file.name}</p>
            <p className="text-[10px] text-zinc-500">{sourceText.length.toLocaleString()} characters extracted</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <FileText className="w-7 h-7 text-zinc-500" />
            <p className="text-xs text-white font-medium">Drop a document or click to browse</p>
            <p className="text-[10px] text-zinc-500">PDF · DOCX · PPTX · TXT · MD</p>
          </div>
        )}
      </div>

      {/* Actions */}
      {sourceText && (
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={handleGenerateNotes}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-200 text-[11px] font-medium hover:bg-violet-500/30 transition-colors disabled:opacity-40"
          >
            <NotebookPen className="w-3.5 h-3.5" /> Notes
          </button>
          <button
            onClick={handleGenerateSlides}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 text-sky-200 text-[11px] font-medium hover:bg-sky-500/30 transition-colors disabled:opacity-40"
          >
            <Presentation className="w-3.5 h-3.5" /> Slides
          </button>
          <button
            onClick={handleGenerateCards}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-200 text-[11px] font-medium hover:bg-amber-500/30 transition-colors disabled:opacity-40"
          >
            <Layers className="w-3.5 h-3.5" /> Flashcards
          </button>
          {busy && <span className="text-[11px] text-zinc-500 self-center">Generating…</span>}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {/* Output */}
      <AnimatePresence>
        {tab === 'notes' && notes && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-white">{notes.title}</h4>
              <button onClick={exportNotes} className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white transition-colors">
                <Download className="w-3 h-3" /> Markdown
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 mb-3">{notes.summary}</p>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {notes.sections.map((s, i) => (
                <div key={i} className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3">
                  <h5 className="text-xs font-medium text-violet-200 mb-1">{s.heading}</h5>
                  <pre className="text-[11px] text-zinc-400 whitespace-pre-wrap font-sans leading-relaxed">{s.body}</pre>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {tab === 'slides' && slides.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
            <div className="grid gap-3 max-h-80 overflow-y-auto pr-1">
              {slides.map((s, i) => (
                <div key={i} className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-4 aspect-[16/9] flex flex-col">
                  <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Slide {i + 1}</div>
                  <h5 className="text-sm font-semibold text-white mb-2">{s.title}</h5>
                  <ul className="space-y-1">
                    {s.bullets.map((b, j) => (
                      <li key={j} className="text-[11px] text-zinc-400 flex gap-1.5">
                        <Sparkles className="w-3 h-3 text-violet-300 shrink-0 mt-0.5" /> {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {tab === 'flashcards' && cards.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400">{cards.length} cards generated</span>
              <button
                onClick={handleSaveDeck}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-[11px] font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" /> Save as Deck
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {cards.map((c, i) => (
                <div key={i} className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3">
                  <p className="text-[11px] text-white font-medium">{i + 1}. {c.question}</p>
                  <p className="text-[11px] text-zinc-400 mt-1">{c.answer}</p>
                  {c.explanation && <p className="text-[10px] text-zinc-500 mt-1 italic">{c.explanation}</p>}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
