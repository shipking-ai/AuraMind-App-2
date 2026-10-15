import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, ArrowLeft, BookOpen } from '@/components/icons';
import ProfLinneaEmptyState from '../components/ui/ProfLinneaEmptyState';

// NotFoundPage: Prof. Linnea rescues the user from a dead route. Three concrete
// escape routes + a \u201Cyou\u2019re not lost\u201D reassurance line replace the prior
// 404 + book icon.
export default function NotFoundPage(): React.ReactElement {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }} className="w-[520px] max-w-[92vw]">
        <ProfLinneaEmptyState
          mood="inviting"
          size="lg"
          eyebrow="404 · BETWEEN SESSIONS"
          title="You’re off the map"
          description="Prof. Linnea doesn’t see a route at this address. Pick a place to dock and we’ll take it from there."
          actions={[
            { label: 'Back to Dashboard', icon: Home, onClick: () => navigate('/dashboard'), primary: true, href: '/dashboard' },
            { label: 'Open Library', icon: BookOpen, onClick: () => navigate('/dashboard/decks'), href: '/dashboard/decks' },
            { label: 'Back a step', icon: ArrowLeft, onClick: () => window.history.back() },
          ]}
          badges={['Routes reset on next visit', 'Your sessions are saved', 'Prof. Linnea is patient']}
        />
      </motion.div>
    </div>
  );
}
