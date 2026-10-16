/**
 * The Windows app's study session, inside the app window (the sidebar stays).
 * Keyboard first: Space shows the answer, 1–4 grade, Esc ends. StudyModePage
 * keeps loading, grading, scheduling, saving and the offline queue; these
 * components only draw it.
 */
import { useCallback, useEffect, useState } from 'react';
import { Rating, type Card } from '../../types';
import { formatInterval } from '../../services/study/srs';
import { isDesktopApp, type AppPlatform } from '../../lib/platform';
import { isTextTarget } from '../../desktop/DesktopChrome';

/** Which session screens StudyModePage draws. Previews keep the iOS design. */
export function studyDesign({ platform, preview }: { platform: AppPlatform; preview: boolean }): 'windows' | 'ios' | 'web' {
  if (platform === 'ios' || preview) return 'ios';
  if (isDesktopApp()) return 'windows';
  return 'web';
}

const GRADES: Array<{ key: string; rating: Rating; label: string }> = [
  { key: '1', rating: Rating.AGAIN, label: 'Again' },
  { key: '2', rating: Rating.HARD, label: 'Hard' },
  { key: '3', rating: Rating.GOOD, label: 'Good' },
  { key: '4', rating: Rating.EASY, label: 'Easy' },
];

export interface WindowsStudySessionProps {
  deckTitle: string;
  card: Card;
  index: number;
  total: number;
  flipped: boolean;
  onFlip: () => void;
  onRate: (rating: Rating) => void;
  onExit: () => void;
  intervals: Partial<Record<Rating, number>>;
}

export function WindowsStudySession({
  deckTitle, card, index, total, flipped, onFlip, onRate, onExit, intervals,
}: WindowsStudySessionProps) {
  const [confirming, setConfirming] = useState(false);
  const question = card.front || card.question || '';
  const answer = card.back || card.answer || '';

  const requestExit = useCallback(() => {
    if (index > 0) setConfirming(true);
    else onExit();
  }, [index, onExit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTextTarget(e.target)) return;
      if (confirming) {
        if (e.key === 'Escape') { e.preventDefault(); setConfirming(false); }
        return;
      }
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (!flipped) onFlip();
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); requestExit(); return; }
      const grade = GRADES.find((g) => g.key === e.key);
      if (grade && flipped) { e.preventDefault(); onRate(grade.rating); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, flipped, onFlip, onRate, requestExit]);

  return (
    <div className="win-study">
      <div className="win-study-top">
        <span>{deckTitle}</span>
        <div className="win-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}>
          <i style={{ width: `${total ? (index / total) * 100 : 0}%` }} />
        </div>
        <span className="win-muted">{index + 1} / {total}</span>
        <button type="button" className="win-button" onClick={requestExit}>End</button>
      </div>

      <div className="win-card win-study-card" onClick={() => { if (!flipped) onFlip(); }}>
        <div className="win-study-question">{question}</div>
        {flipped && <div className="win-study-answer">{answer}</div>}
      </div>

      {flipped ? (
        <div className="win-study-grades">
          {GRADES.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`win-button${g.rating === Rating.GOOD ? ' win-button-primary' : ''}`}
              onClick={() => onRate(g.rating)}
            >
              <span className="win-key">{g.key}</span>
              {g.label}
              {intervals[g.rating] !== undefined && <span className="win-interval">{formatInterval(intervals[g.rating]!)}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="win-study-grades">
          <button type="button" className="win-button win-button-primary" onClick={onFlip}>
            <span className="win-key">Space</span>Show answer
          </button>
        </div>
      )}

      {confirming && (
        <div className="win-scrim">
          <div role="dialog" aria-modal="true" aria-labelledby="win-end-title" className="win-dialog">
            <h2 id="win-end-title" className="win-dialog-title">End this session?</h2>
            <p className="win-muted">The cards you've graded are saved.</p>
            <div className="win-dialog-actions">
              <button type="button" className="win-button" onClick={() => setConfirming(false)} autoFocus>Keep studying</button>
              <button type="button" className="win-button win-button-primary" onClick={onExit}>End session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

export function WindowsStudyComplete({
  deckTitle, reviewed, correct, elapsedMs, onRestart, onDone,
}: { deckTitle: string; reviewed: number; correct: number; elapsedMs: number; onRestart: () => void; onDone: () => void }) {
  const pct = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0;
  return (
    <div className="win-page">
      <h1 className="win-title">Session complete</h1>
      <p className="win-muted" style={{ margin: 0 }}>{deckTitle}</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="win-card" style={{ flex: 1 }}><div className="win-stat">{reviewed}</div><div className="win-muted">cards reviewed</div></div>
        <div className="win-card" style={{ flex: 1 }}><div className="win-stat">{pct}%</div><div className="win-muted">correct</div></div>
        <div className="win-card" style={{ flex: 1 }}><div className="win-stat">{duration(elapsedMs)}</div><div className="win-muted">time</div></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="win-button win-button-primary" onClick={onDone} autoFocus>Back to Today</button>
        <button type="button" className="win-button" onClick={onRestart}>Study again</button>
      </div>
    </div>
  );
}

export function WindowsStudyEmpty({ onDone }: { onDone: () => void }) {
  return (
    <div className="win-page">
      <h1 className="win-title">Nothing to study here right now</h1>
      <p className="win-muted" style={{ margin: 0 }}>Every card in this course is scheduled for later.</p>
      <div>
        <button type="button" className="win-button win-button-primary" onClick={onDone} autoFocus>Back to Today</button>
      </div>
    </div>
  );
}
