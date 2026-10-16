/**
 * The Windows app's home. A command bar (Start review, New course, the
 * date), one headline number, the courses with cards due as a details list,
 * and the streak and weekly recall in the status bar.
 */
import { Link, useNavigate } from 'react-router-dom';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import { useStudyStats } from '../../hooks/useStudyStats';
import { dueCount, nextDueAt, reviewMinutes, weekAnswered } from './todayModel';
import { libraryRows, studiedLabel } from './libraryModel';

const SHOWN_COURSES = 5;
const MIN_WEEK_ANSWERS = 10;

function whenLabel(at: number, now: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return new Date(now).toDateString() === d.toDateString()
    ? `today at ${time}`
    : `${d.toLocaleDateString([], { weekday: 'long' })} at ${time}`;
}

export function WindowsToday() {
  const navigate = useNavigate();
  const ws = useDashboardWorkspace()!;
  const stats = useStudyStats(ws.user?.id);
  const now = Date.now();
  const due = dueCount(ws.cards, now);
  const courses = libraryRows(ws.decks, ws.cards, now, '', 'due').filter((r) => r.due > 0);
  const create = () => navigate('/dashboard/generator');
  const date = new Date(now).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

  const streak = ws.user?.streak ?? 0;
  const showRemembered = stats.retention7d !== undefined && weekAnswered(stats.sessions, now) >= MIN_WEEK_ANSWERS;

  return (
    <div className="win-page">
      <div className="win-cmd">
        {due > 0 && (
          <button type="button" className="win-button win-button-primary" onClick={ws.startQuickStudy}>Start review</button>
        )}
        <button type="button" className="win-button" onClick={create}>New course</button>
        <span className="win-cmd-end win-muted">{date}</span>
      </div>

      <div className="win-body">
        {ws.decks.length === 0 ? (
          <>
            <h1 className="win-headline">Nothing to study yet</h1>
            <p className="win-muted" style={{ margin: '10px 0 16px' }}>
              Turn a PDF, a lecture or a topic into a course you can study here.
            </p>
            <button type="button" className="win-button win-button-primary" onClick={create}>Create your first course</button>
          </>
        ) : due > 0 ? (
          <>
            <h1 className="win-headline">
              <span data-testid="due-count">{due}</span> <em>{due === 1 ? 'card to review' : 'cards to review'}</em>
            </h1>
            <p className="win-muted" style={{ margin: '8px 0 0' }}>About {reviewMinutes(due)} minutes</p>
          </>
        ) : (
          <>
            <h1 className="win-headline">All caught up</h1>
            {(() => {
              const next = nextDueAt(ws.cards, now);
              return next !== undefined ? <p className="win-muted" style={{ margin: '8px 0 0' }}>Next review {whenLabel(next, now)}</p> : null;
            })()}
          </>
        )}

        {courses.length > 0 && (
          <table className="win-table" style={{ marginTop: 24 }}>
            <thead>
              <tr><th>Course</th><th className="num">Due</th><th className="num">Cards</th><th>Last studied</th></tr>
            </thead>
            <tbody>
              {courses.slice(0, SHOWN_COURSES).map((r) => (
                <tr key={r.deck.id}>
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
        {courses.length > SHOWN_COURSES && (
          <p style={{ marginTop: 10 }}><Link to="/dashboard/decks">See all in Library</Link></p>
        )}
      </div>

      <div className="win-status">
        {stats.error ? (
          <>
            <span>Couldn't load your stats.</span>
            <button type="button" className="win-link-button" onClick={() => void stats.refresh()}>Try again</button>
          </>
        ) : stats.loading ? (
          <span data-testid="stats-loading">Loading your stats…</span>
        ) : (
          <span>
            {`${streak}-day streak`}
            {showRemembered && ` · ${Math.round((stats.retention7d ?? 0) * 100)}% remembered this week`}
          </span>
        )}
      </div>
    </div>
  );
}
