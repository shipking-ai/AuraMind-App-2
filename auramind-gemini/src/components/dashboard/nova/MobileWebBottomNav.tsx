import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Brain, GraduationCap, Sparkles } from '@/components/icons';

const NAV_ITEMS = [
  { label: 'Home', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Library', path: '/dashboard/decks', icon: BookOpen },
  { label: 'Study', path: '/dashboard/study', icon: Brain },
  { label: 'Prof. Linnea', path: '/dashboard/chat', icon: GraduationCap },
  { label: 'Generate', path: '/dashboard/generator', icon: Sparkles },
];

export function MobileWebBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden safe-area-bottom" aria-label="Mobile navigation">
      <div className="flex items-center justify-around h-16 bg-[#0A0A0F]/95 backdrop-blur-xl border-t border-[#2A2A3A]/50">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-0.5 p-2 min-w-[48px] transition-colors ${
                isActive ? 'text-[#8B5CF6]' : 'text-[#7A7A96] hover:text-[#F0EFFE]'
              }`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[9px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
