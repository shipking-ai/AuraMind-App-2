/**
 * The Windows app's home: what's due and one button to start, the streak and
 * "remembered this week", and the courses with cards due.
 */
import { Link, useNavigate } from 'react-router-dom';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import { useStudyStats } from '../../hooks/useStudyStats';
import { coursesWithDue, dueCount, nextDueAt, reviewMinutes, weekAnswered } from './todayModel';

const SHOWN_COURSES = 5;
const MIN_WEEK_ANSWERS = 10;

function greeting(now: Date): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

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
  const firstName = (ws.user?.name ?? '').trim().split(/\s+/)[0];
  const due = dueCount(ws.cards, now);
  const courses = coursesWithDue(ws.decks, ws.cards, now);
  const showRemembered = stats.retention7d !== undefined && weekAnswered(stats.sessions, now) >= MIN_WEEK_ANSWERS;
  const create = () => navigate('/dashboard/generator');

  if (ws.decks.length === 0) {
    return (
      <div className="win-page">
        <h1 className="win-title">{greeting(new Date(now))}{firstName ? `, ${firstName}` : ''}</h1>
        <div className="win-card">
          <p style={{ margin: '0 0 12px' }}>Turn a PDF, a lecture or a topic into a course you can study here.</p>
          <button type="button" className="win-button win-button-primary" onClick={create}>Create your first course</button>
        </div>
      </div>
    );
  }

  const next = nextDueAt(ws.cards, now);

  return (
    <div className="win-page">
      <h1 className="win-title">{greeting(new Date(now))}{firstName ? `, ${firstName}` : ''}</h1>

      {due > 0 ? (
        <div className="win-card" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div>
            <div className="win-muted">Due today</div>
            <div data-testid="due-count" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>{due}</div>
          </div>
          <div className="win-muted">about {reviewMinutes(due)} min</div>
          <button type="button" className="win-button win-button-primary" style={{ marginLeft: 'auto' }} onClick={ws.startQuickStudy}>
            Start review
          </button>
        </div>
      ) : (
        <div className="win-card" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>You're all caught up</div>
            {next !== undefined && <div className="win-muted">Next review {whenLabel(next, now)}</div>}
          </div>
          <button type="button" className="win-button" style={{ marginLeft: 'auto' }} onClick={create}>Create a course</button>
        </div>
      )}

      {stats.error ? (
        <div className="win-card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="win-muted">Couldn't load your stats.</span>
          <button type="button" className="win-button" onClick={() => void stats.refresh()}>Try again</button>
        </div>
      ) : stats.loading ? (
        <div data-testid="stats-loading" style={{ display: 'flex', gap: 12 }}>
          <div className="win-placeholder" style={{ flex: 1, height: 64 }} />
          <div className="win-placeholder" style={{ flex: 1, height: 64 }} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="win-card" style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{(ws.user?.streak ?? 0) === 1 ? '1 day' : `${ws.user?.streak ?? 0} days`}</div>
            <div className="win-muted">streak</div>
          </div>
          {showRemembered && (
            <div className="win-card" style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{Math.round((stats.retention7d ?? 0) * 100)}%</div>
              <div className="win-muted">remembered this week</div>
            </div>
          )}
        </div>
      )}

      {courses.length > 0 && (
        <>
          <h2 className="win-section-label">COURSES WITH CARDS DUE</h2>
          <div className="win-card win-list">
            {courses.slice(0, SHOWN_COURSES).map(({ deck, due: n }) => (
              <button key={deck.id} type="button" className="win-row" onClick={() => ws.startStudyForDeck(deck.id)}>
                <span>{deck.title}</span>
                <span className="win-row-end">{n} due ›</span>
              </button>
            ))}
          </div>
          {courses.length > SHOWN_COURSES && (
            <Link to="/dashboard/decks" className="win-muted">See all in Library</Link>
          )}
        </>
      )}
    </div>
  );
}
