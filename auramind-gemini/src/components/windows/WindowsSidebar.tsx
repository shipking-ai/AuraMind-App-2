/**
 * The Windows app's navigation, Windows 11 style: ☰, the core places, and
 * Settings at the bottom. Collapses to an icon strip (see useWindowsSidebar).
 */
import React from 'react';
import { NavLink } from 'react-router-dom';
import { BookOpen, Home, Menu, Plus, Settings, Sparkles, Users } from '../icons';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import { useWindowsSidebar } from './useWindowsSidebar';
import { useClassMembership } from './useClassMembership';

interface Place {
  label: string;
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  end?: boolean;
}

const TOP: Place[] = [
  { label: 'Today', to: '/dashboard', icon: Home, end: true },
  { label: 'Library', to: '/dashboard/decks', icon: BookOpen },
  { label: 'New course', to: '/dashboard/generator', icon: Plus },
  { label: 'Linnea', to: '/dashboard/chat', icon: Sparkles },
];
const CLASSES: Place = { label: 'Classes', to: '/dashboard/classes', icon: Users };
const SETTINGS: Place = { label: 'Settings', to: '/dashboard/settings', icon: Settings };

function Item({ place, collapsed }: { place: Place; collapsed: boolean }) {
  const Icon = place.icon;
  return (
    <NavLink
      to={place.to}
      end={place.end}
      aria-label={place.label}
      title={collapsed ? place.label : undefined}
      className={({ isActive }) => `win-nav-item${isActive ? ' is-active' : ''}`}
    >
      <Icon size={18} className="win-nav-icon" />
      {!collapsed && <span className="win-nav-label">{place.label}</span>}
    </NavLink>
  );
}

export function WindowsSidebar() {
  const { collapsed, toggle } = useWindowsSidebar();
  const workspace = useDashboardWorkspace();
  const member = useClassMembership(workspace?.user?.id);
  const places = member ? [...TOP, CLASSES] : TOP;

  return (
    <nav aria-label="BonaMind" className={`win-sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <button
        type="button"
        className="win-nav-toggle"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
        onClick={toggle}
      >
        <Menu size={18} />
      </button>
      <div className="win-nav-list">
        {places.map((p) => <Item key={p.to} place={p} collapsed={collapsed} />)}
      </div>
      <div className="win-nav-spacer" />
      <Item place={SETTINGS} collapsed={collapsed} />
    </nav>
  );
}
