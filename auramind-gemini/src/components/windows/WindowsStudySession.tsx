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
import { WindowsDialog } from './WindowsDialog';

/**
 * Which session screens StudyModePage draws. The Windows app always gets its
 * own; previews (the iOS sample-data harness) otherwise keep the iOS design.
 */
export function studyDesign({ platform, preview }: { platform: AppPlatform; preview: boolean }): 'windows' | 'ios' | 'web' {
  if (isDesktopApp()) return 'windows';
  if (platform === 'ios' || preview) return 'ios';
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
    <div className="win-page">
      <div className="win-cmd">
        <span style={{ fontWeight: 600 }}>{deckTitle}</span>
        <div className="win-cmd-end">
          <div className="win-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}>
            <i style={{ width: `${total ? (index / total) * 100 : 0}%` }} />
          </div>
          <span className="win-muted">{index + 1} of {total}</span>
          <button type="button" className="win-button" onClick={requestExit}>End</button>
        </div>
      </div>

      <div className="win-study">
        <div className="win-index-card" onClick={() => { if (!flipped) onFlip(); }}>
          <div className="win-index-meta">{deckTitle} · card {index + 1}</div>
          <div className="win-index-question">{question}</div>
          {flipped && <div className="win-index-answer">{answer}</div>}
        </div>

        <div className="win-grades">
          {flipped ? (
            GRADES.map((g) => (
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
            ))
          ) : (
            <button type="button" className="win-button win-button-primary" onClick={onFlip}>
              <span className="win-key">Space</span>Show answer
            </button>
          )}
        </div>
      </div>

      <div className="win-status">Space shows the answer · 1–4 grade · Esc ends</div>

      {confirming && (
        <WindowsDialog
          title="End this session?"
          onClose={() => setConfirming(false)}
          actions={
            <>
              <button type="button" className="win-button" data-autofocus onClick={() => setConfirming(false)}>Keep studying</button>
              <button type="button" className="win-button win-button-primary" onClick={onExit}>End session</button>
            </>
          }
        >
          <p className="win-muted">The cards you've graded are saved.</p>
        </WindowsDialog>
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
      <div className="win-cmd">
        <button type="button" className="win-button win-button-primary" onClick={onDone} autoFocus>Back to Today</button>
        <button type="button" className="win-button" onClick={onRestart}>Study again</button>
      </div>
      <div className="win-body">
        <h1 className="win-headline">Session complete</h1>
        <p className="win-muted" style={{ margin: '8px 0 24px' }}>{deckTitle}</p>
        <table className="win-table" style={{ maxWidth: 420 }}>
          <tbody>
            <tr><td className="win-muted">Cards reviewed</td><td className="num win-stat">{reviewed}</td></tr>
            <tr><td className="win-muted">Correct</td><td className="num win-stat">{pct}%</td></tr>
            <tr><td className="win-muted">Time</td><td className="num win-stat">{duration(elapsedMs)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WindowsStudyEmpty({ onDone }: { onDone: () => void }) {
  return (
    <div className="win-page">
      <div className="win-cmd">
        <button type="button" className="win-button win-button-primary" onClick={onDone} autoFocus>Back to Today</button>
      </div>
      <div className="win-body">
        <h1 className="win-headline">Nothing to study here right now</h1>
        <p className="win-muted" style={{ margin: '8px 0 0' }}>Every card in this course is scheduled for later.</p>
      </div>
    </div>
  );
}
