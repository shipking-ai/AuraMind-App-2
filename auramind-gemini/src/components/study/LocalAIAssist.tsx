/**
 * On-device help with the card in front of you, using Chrome's built-in AI
 * (see src/lib/builtInAI.ts). Two things students ask for constantly and the
 * server model charges for every time:
 *
 *  - "Key idea" — the one-sentence version of a long answer.
 *  - "Translate" — the answer in their own language.
 *
 * Both run inside the browser: free, offline, and the card never leaves the
 * machine. The row renders only where the APIs exist, so everywhere else the
 * study screen is exactly what it was.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Languages, Loader2, Sparkles } from '@/components/icons';
import {
  hasBuiltInAI,
  hasBuiltInTranslator,
  summarizeLocally,
  summarizerStatus,
  translateLocally,
  type LocalAIStatus,
} from '../../lib/builtInAI';
import { useAppPreference } from '../../lib/appPreferences';

const LANGUAGES = [
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
];

type Job = 'idle' | 'summary' | 'translation';

export function LocalAIAssist({ front, back }: { front: string; back: string }) {
  const supported = useMemo(() => hasBuiltInAI(), []);
  const [status, setStatus] = useState<LocalAIStatus>('unavailable');
  const [job, setJob] = useState<Job>('idle');
  const [output, setOutput] = useState<{ kind: Job; text: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [language, setLanguage] = useAppPreference('auramind_localAiLanguage', 'es');

  useEffect(() => {
    if (!supported) return;
    let live = true;
    void summarizerStatus().then((s) => {
      if (live) setStatus(s);
    });
    return () => {
      live = false;
    };
  }, [supported]);

  // A new card invalidates whatever was generated for the previous one.
  useEffect(() => {
    setOutput(null);
    setFailed(false);
  }, [front, back]);

  const run = useCallback(
    async (kind: Exclude<Job, 'idle'>) => {
      setJob(kind);
      setFailed(false);
      setProgress(null);
      const onDownload = (fraction: number) => setProgress(fraction);
      const text =
        kind === 'summary'
          ? await summarizeLocally(back, { context: front, onDownload })
          : await translateLocally(back, language, { onDownload });
      setProgress(null);
      setJob('idle');
      if (text) setOutput({ kind, text });
      else setFailed(true);
    },
    [back, front, language],
  );

  if (!supported || status === 'unsupported' || status === 'unavailable') return null;

  const busy = job !== 'idle';
  return (
    <div className="mx-auto mt-3 max-w-lg">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('summary')}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-violet-400/30 hover:text-white disabled:opacity-50"
        >
          {job === 'summary' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          )}
          Key idea
        </button>

        {hasBuiltInTranslator() && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('translation')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-violet-400/30 hover:text-white disabled:opacity-50"
            >
              {job === 'translation' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Languages className="h-3.5 w-3.5" aria-hidden />
              )}
              Translate
            </button>
            <select
              aria-label="Translation language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-[#14121f]">
                  {l.label}
                </option>
              ))}
            </select>
          </>
        )}

        <span className="ml-auto text-[10px] text-zinc-500">
          {status === 'downloadable' ? 'Downloads once, then offline' : 'Runs on your device'}
        </span>
      </div>

      {progress !== null && (
        <p className="mt-2 text-[11px] text-zinc-400" role="status">
          Downloading the on-device model… {Math.round(progress * 100)}%
        </p>
      )}

      {output && (
        <div className="mt-2 rounded-xl border border-violet-400/20 bg-violet-500/[0.07] px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-violet-200/70">
            {output.kind === 'summary'
              ? 'Key idea'
              : LANGUAGES.find((l) => l.code === language)?.label ?? 'Translation'}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-100">{output.text}</p>
        </div>
      )}

      {failed && !busy && (
        <p className="mt-2 text-[11px] text-zinc-500" role="status">
          The on-device model couldn&rsquo;t help with this one. The card is unchanged.
        </p>
      )}
    </div>
  );
}

export default LocalAIAssist;
