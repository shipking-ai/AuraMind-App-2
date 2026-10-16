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
      <div className="win-body">
        <h1 className="win-title">Settings</h1>

        <h2 className="win-section-label">Account</h2>
        <div className="win-group">
          <div className="win-field"><span className="win-field-label">Name</span><span>{user?.name}</span></div>
          <div className="win-field"><span className="win-field-label">Email</span><span>{user?.email}</span></div>
          {user?.plan && <div className="win-field"><span className="win-field-label">Plan</span><span>{user.plan}</span></div>}
        </div>

        <h2 className="win-section-label">Appearance</h2>
        <div className="win-group">
          <div className="win-field" role="radiogroup" aria-label="Theme">
            <span className="win-field-label">Theme</span>
            {THEMES.map((t) => (
              <label key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
        </div>

        <h2 className="win-section-label">Windows</h2>
        <div className="win-group" style={{ paddingTop: 8 }}>
          <DesktopSettingsSection />
        </div>

        <h2 className="win-section-label">Study</h2>
        <div className="win-group">
          <label className="win-field">
            <span className="win-field-label">Daily goal</span>
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
          <div className="win-field">
            <span className="win-field-label">Reminders</span>
            <Link to="/dashboard/settings/all">Reminders</Link>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
          <Link to="/dashboard/settings/all">More settings</Link>
          {isAdminOrHigher(user?.role) && <Link to="/admin">Admin</Link>}
          <button type="button" className="win-button" style={{ marginLeft: 'auto' }} onClick={ws.onLogout}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
