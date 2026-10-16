/**
 * The Windows app's Settings: the few things people change here, plus the
 * Windows-only settings. Everything else is one click away on the full
 * settings page.
 */
import { Link } from 'react-router-dom';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import { useTheme } from '../../hooks/useTheme';
import { useAppPreference } from '../../lib/appPreferences';
import { isAdminOrHigher } from '../../utils/permissions';
import { DesktopSettingsSection } from '../../desktop/DesktopSettingsSection';

const THEMES: Array<{ value: 'light' | 'dark' | 'system'; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function WindowsSettings() {
  const ws = useDashboardWorkspace()!;
  const { theme, setTheme } = useTheme();
  const [goal, setGoal] = useAppPreference<string>('bonamind_dailyGoal', '20');
  const user = ws.user;

  return (
    <div className="win-page">
      <h1 className="win-title">Settings</h1>

      <h2 className="win-section-label">ACCOUNT</h2>
      <div className="win-card">
        <div style={{ fontWeight: 600 }}>{user?.name}</div>
        <div className="win-muted">{user?.email}</div>
        {user?.plan && <div className="win-muted">Plan: {user.plan}</div>}
      </div>

      <h2 className="win-section-label">APPEARANCE</h2>
      <div className="win-card" role="radiogroup" aria-label="Theme" style={{ display: 'flex', gap: 20 }}>
        {THEMES.map((t) => (
          <label key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="radio"
              name="win-theme"
              value={t.value}
              checked={theme === t.value}
              onChange={() => setTheme(t.value)}
            />
            {t.label}
          </label>
        ))}
      </div>

      <h2 className="win-section-label">WINDOWS</h2>
      <div className="win-card">
        <DesktopSettingsSection />
      </div>

      <h2 className="win-section-label">STUDY</h2>
      <div className="win-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          Daily goal
          <input
            type="number"
            min={5}
            max={200}
            aria-label="Daily goal"
            className="win-input"
            style={{ width: 90 }}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <span className="win-muted">cards a day</span>
        </label>
        <Link to="/dashboard/settings/all" className="win-muted">Reminders</Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link to="/dashboard/settings/all">More settings</Link>
        {isAdminOrHigher(user?.role) && <Link to="/admin">Admin</Link>}
        <button type="button" className="win-button" style={{ marginLeft: 'auto' }} onClick={ws.onLogout}>Sign out</button>
      </div>
    </div>
  );
}
