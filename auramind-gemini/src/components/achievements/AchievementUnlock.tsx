import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrophyIcon as Trophy,
  AwardIcon as Award,
  StarIcon as Star,
  FlameIcon as Flame,
  ZapIcon as Zap,
  TargetIcon as Target,
  CrownIcon as Crown,
  MedalIcon as Medal,
  SparklesIcon as Sparkles,
  XIcon as X
} from '../icons/CustomIcons';
import {
  AnimeCelebration,
  type AnimeCelebrationHandle,
} from '../../lib/effects';

// Level system constants
const XP_LEVELS = [
  { level: 1, xp: 0, title: 'Novice Learner' },
  { level: 2, xp: 100, title: 'Apprentice Scholar' },
  { level: 3, xp: 250, title: 'Dedicated Student' },
  { level: 4, xp: 500, title: 'Knowledge Seeker' },
  { level: 5, xp: 1000, title: 'Focused Studier' },
  { level: 6, xp: 2000, title: 'Deep Learner' },
  { level: 7, xp: 3500, title: 'Subject Master' },
  { level: 8, xp: 5000, title: 'Expert Scholar' },
  { level: 9, xp: 7500, title: 'Academic Ace' },
  { level: 10, xp: 10000, title: 'Legendary Learner' },
  { level: 11, xp: 15000, title: 'Grand Master' },
  { level: 12, xp: 20000, title: 'Supreme Scholar' },
  { level: 13, xp: 30000, title: 'Ultimate Knowledge' },
  { level: 14, xp: 40000, title: 'Eternal Student' },
  { level: 15, xp: 50000, title: 'Transcendent Sage' }
];

export const calculateLevel = (xp: number) => {
  let level = 1;
  for (let i = XP_LEVELS.length - 1; i >= 0; i--) {
    if (xp >= XP_LEVELS[i].xp) {
      level = XP_LEVELS[i].level;
      break;
    }
  }
  return level;
};

export const getXPForLevel = (level: number) => {
  const levelData = XP_LEVELS.find(l => l.level === level);
  return levelData ? levelData.xp : 0;
};

export const getXPToNextLevel = (xp: number) => {
  const currentLevel = calculateLevel(xp);
  if (currentLevel >= XP_LEVELS[XP_LEVELS.length - 1].level) return 0;
  const nextLevelData = XP_LEVELS.find(l => l.level === currentLevel + 1);
  return nextLevelData ? (nextLevelData.xp - xp) : 0;
};

export const getLevelTitle = (level: number) => {
  const levelData = XP_LEVELS.find(l => l.level === level);
  return levelData ? levelData.title : 'Unknown';
};


// Glassmorphism utility classes
const glassCard = 'bg-zinc-900/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-xl';

// Animation variants
const scaleIn = {
  hidden: { opacity: 0, scale: 0.5 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, scale: 0.5, transition: { duration: 0.3 } },
};

const slideUp = {
  hidden: { opacity: 0, y: 100 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, y: 100, transition: { duration: 0.3 } },
};

const sparkleVariants = {
  hidden: { opacity: 0, scale: 0 },
  show: { 
    opacity: 1, 
    scale: 1, 
    transition: { 
      duration: 0.4, 
      ease: [0.22, 1, 0.36, 1] as const 
    } 
  },
  exit: { opacity: 0, scale: 0, transition: { duration: 0.2 } },
};

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: 'trophy' | 'award' | 'star' | 'flame' | 'zap' | 'target' | 'crown' | 'medal';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  xpReward: number;
}

interface AchievementUnlockProps {
  achievement: Achievement;
  onClose: () => void;
  autoClose?: boolean;
  autoCloseDelay?: number;
}

  const AchievementUnlock: React.FC<AchievementUnlockProps> = ({
  achievement,
  onClose,
  autoClose = true,
  autoCloseDelay = 5000,
}) => {
  const [showSparkles, setShowSparkles] = useState(false);
  const [_userXP, setUserXP] = useState(0);
  // Crunchy halo reserved for top-tier rarities so common unlocks don't
  // compete with page-level celebrations.
  const celebrationRef = useRef<AnimeCelebrationHandle>(null);

  useEffect(() => {
    setShowSparkles(true);
    if (achievement.rarity === 'legendary' || achievement.rarity === 'epic') {
      celebrationRef.current?.celebrate({
        label: `+${achievement.xpReward} XP`,
        intensity: achievement.rarity === 'legendary' ? 'epic' : 'normal',
      });
    }
    if (autoClose) {
      const timer = setTimeout(onClose, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [autoClose, autoCloseDelay, onClose, achievement]);

  // Update level progress when component mounts or achievement changes
  useEffect(() => {
    // Get current user XP from localStorage or default to 0
    const savedXP = localStorage.getItem('bonamind_user_xp');
    const currentXP = savedXP ? parseInt(savedXP, 10) : 0;
    setUserXP(currentXP);

    // Calculate and update level progress
    const currentLevel = calculateLevel(currentXP);
    const xpForCurrentLevel = getXPForLevel(currentLevel);
    const xpForNextLevel = getXPForLevel(currentLevel + 1);
    const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
    const xpProgressInLevel = currentXP - xpForCurrentLevel;
    const progressPercentage = xpNeededForNextLevel > 0 
      ? (xpProgressInLevel / xpNeededForNextLevel) * 100 
      : 100;

    // Update DOM elements
    const levelDisplay = document.getElementById('level-display');
    const levelProgressBar = document.getElementById('level-progress-bar');
    const xpToNext = document.getElementById('xp-to-next');

    if (levelDisplay) levelDisplay.textContent = String(currentLevel);
    if (levelProgressBar) levelProgressBar.style.width = `${progressPercentage}%`;
    if (xpToNext) {
      const remainingXP = getXPToNextLevel(currentXP);
      xpToNext.textContent = `${remainingXP} XP to next level`;
    }

    // Award XP for the achievement
    const newXP = currentXP + achievement.xpReward;
    localStorage.setItem('bonamind_user_xp', String(newXP));
    
    // Animate the XP gain
    const animateXP = () => {
      let current = currentXP;
      const target = newXP;
      const increment = Math.max(1, Math.ceil((target - current) / 20));
      
      const timer = setInterval(() => {
        current = Math.min(current + increment, target);
        if (levelDisplay) {
          const level = calculateLevel(current);
          levelDisplay.textContent = String(level);
          
          const xpForLevel = getXPForLevel(level);
          const xpForNext = getXPForLevel(level + 1);
          const xpNeeded = xpForNext - xpForLevel;
          const progress = current - xpForLevel;
          const percentage = xpNeeded > 0 ? (progress / xpNeeded) * 100 : 100;
          
          if (levelProgressBar) {
            levelProgressBar.style.width = `${percentage}%`;
          }
          
          if (xpToNext) {
            const remaining = getXPToNextLevel(current);
            xpToNext.textContent = `${remaining} XP to next level`;
          }
        }
        
        if (current >= target) {
          clearInterval(timer);
        }
      }, 16); // ~60fps
    };

    animateXP();
  }, [achievement]);

  

  const getIcon = () => {
    switch (achievement.icon) {
      case 'trophy': return Trophy;
      case 'award': return Award;
      case 'star': return Star;
      case 'flame': return Flame;
      case 'zap': return Zap;
      case 'target': return Target;
      case 'crown': return Crown;
      case 'medal': return Medal;
      default: return Award;
    }
  };

  const getRarityColor = () => {
    switch (achievement.rarity) {
      case 'common': return 'from-gray-400 to-gray-500';
      case 'rare': return 'from-blue-400 to-blue-600';
      case 'epic': return 'from-purple-400 to-purple-600';
      case 'legendary': return 'from-yellow-400 to-orange-500';
      default: return 'from-gray-400 to-gray-500';
    }
  };

  const getRarityBorder = () => {
    switch (achievement.rarity) {
      case 'common': return 'border-gray-400/50';
      case 'rare': return 'border-blue-400/50';
      case 'epic': return 'border-purple-400/50';
      case 'legendary': return 'border-yellow-400/50';
      default: return 'border-gray-400/50';
    }
  };

  const Icon = getIcon();

  return (
    <>
      <AnimeCelebration ref={celebrationRef} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
      <motion.div
        variants={scaleIn}
        initial="hidden"
        animate="show"
        exit="exit"
        className={`${glassCard} p-8 max-w-md w-full text-center relative overflow-hidden`}
      >
        {/* Sparkle Effects */}
        <AnimatePresence>
          {showSparkles && (
            <>
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  variants={sparkleVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  transition={{ delay: i * 0.05 }}
                  className="absolute"
                  style={{
                    top: `${20 + Math.random() * 60}%`,
                    left: `${10 + Math.random() * 80}%`,
                  }}
                >
                  <Sparkles 
                    size={16} 
                    className={`text-${achievement.rarity === 'legendary' ? 'yellow' : achievement.rarity === 'epic' ? 'purple' : achievement.rarity === 'rare' ? 'blue' : 'gray'}-400`}
                  />
                </motion.div>
              ))}
            </>
          )}
        </AnimatePresence>

        {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 hover:bg-zinc-900/10 rounded-lg transition-colors"
            >
          <X size={20} className="text-gray-400" />
        </button>

        {/* Achievement Icon */}
        <motion.div
          variants={slideUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.2 }}
          className="relative mb-6"
        >
          <div className={`w-24 h-24 bg-gradient-to-br ${getRarityColor()} rounded-full flex items-center justify-center mx-auto shadow-2xl ${getRarityBorder()} border-4`}>
            <Icon size={48} className="text-white" />
          </div>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
            className="absolute -top-2 -right-2 bg-yellow-500 rounded-full p-2"
          >
            <Sparkles size={16} className="text-white" />
          </motion.div>
        </motion.div>

        {/* Achievement Text */}
        <motion.div
          variants={slideUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.3 }}
          className="space-y-3"
        >
           <div className="inline-block px-3 py-1 bg-zinc-900/10 rounded-full text-xs font-medium uppercase tracking-wider text-white">
            {achievement.rarity}
          </div>
          <h2 className="text-2xl font-bold text-white">{achievement.title}</h2>
          <p className="text-gray-400">{achievement.description}</p>
          
          {/* Level Progress */}
          <motion.div
            variants={slideUp}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.4 }}
            className="pt-4 border-t border-white/10"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Current Level</span>
                <span id="level-display">1</span>
              </div>
              <div className="w-full bg-zinc-800/30 h-2 rounded-full overflow-hidden">
                <div id="level-progress-bar" className="bg-primary h-2 transition-all duration-1000" style={{ width: '0%' }}></div>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>0 XP</span>
                <span id="xp-to-next">100 XP to next level</span>
              </div>
            </div>
          </motion.div>
          
          <motion.div
            variants={slideUp}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.4 }}
            className="pt-4 border-t border-white/10"
          >
            <div className="flex items-center justify-center gap-2 text-yellow-400">
              <Star size={16} />
              <span className="font-bold">+{achievement.xpReward} XP</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Confetti Effect for Legendary */}
        {achievement.rarity === 'legendary' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="absolute inset-0 pointer-events-none"
          >
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  x: '50%', 
                  y: '50%', 
                  opacity: 1,
                  rotate: 0
                }}
                animate={{ 
                  x: `${Math.random() * 100}%`,
                  y: `${Math.random() * 100}%`,
                  opacity: 0,
                  rotate: Math.random() * 360
                }}
                transition={{ 
                  delay: 0.6 + i * 0.05,
                  duration: 1.5,
                  ease: 'easeOut'
                }}
                className="absolute w-2 h-2"
                style={{
                  backgroundColor: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'][Math.floor(Math.random() * 5)]
                }}
              />
            ))}
          </motion.div>
        )}
      </motion.div>
      </div>
    </>
  );
};

// Achievement Queue System
interface AchievementQueueContextType {
  unlockAchievement: (achievement: Achievement) => void;
}

const AchievementQueueContext = React.createContext<AchievementQueueContextType | undefined>(undefined);

export const AchievementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<Achievement[]>([]);
  const [current, setCurrent] = useState<Achievement | null>(null);

  const unlockAchievement = (achievement: Achievement) => {
    setQueue(prev => [...prev, achievement]);
  };

  const handleNext = () => {
    setCurrent(null);
    setTimeout(() => {
      setQueue(prev => {
        if (prev.length === 0) return [];
        const [next, ...rest] = prev;
        setCurrent(next);
        return rest;
      });
    }, 300);
  };

  useEffect(() => {
    if (queue.length > 0 && !current) {
      setCurrent(queue[0]);
    }
  }, [queue, current]);

  return (
    <AchievementQueueContext.Provider value={{ unlockAchievement }}>
      {children}
      <AnimatePresence>
        {current && (
          <AchievementUnlock
            achievement={current}
            onClose={handleNext}
          />
        )}
      </AnimatePresence>
    </AchievementQueueContext.Provider>
  );
};

export const useAchievements = () => {
  const context = React.useContext(AchievementQueueContext);
  if (!context) {
    throw new Error('useAchievements must be used within an AchievementProvider');
  }
  return context;
};

// Predefined Achievements (42 total — 8 original + 34 new)
export const ACHIEVEMENTS: Record<string, Achievement> = {
  // ── Existing (8) ──
  FIRST_DECK: {
    id: 'first_deck',
    title: 'Deck Creator',
    description: 'Create your first flashcard deck',
    icon: 'award',
    rarity: 'common',
    xpReward: 50,
  },
  WEEK_WARRIOR: {
    id: 'week_warrior',
    title: 'Week Warrior',
    description: 'Maintain a 7-day study streak',
    icon: 'flame',
    rarity: 'rare',
    xpReward: 100,
  },
  DECK_MASTER: {
    id: 'deck_master',
    title: 'Deck Master',
    description: 'Create 10 flashcard decks',
    icon: 'trophy',
    rarity: 'rare',
    xpReward: 200,
  },
  SHARP_MIND: {
    id: 'sharp_mind',
    title: 'Sharp Mind',
    description: 'Achieve 90% average retention',
    icon: 'zap',
    rarity: 'epic',
    xpReward: 300,
  },
  LEGENDARY_LEARNER: {
    id: 'legendary_learner',
    title: 'Legendary Learner',
    description: 'Maintain a 30-day study streak',
    icon: 'crown',
    rarity: 'legendary',
    xpReward: 500,
  },
  PERFECT_SCORE: {
    id: 'perfect_score',
    title: 'Perfect Score',
    description: 'Get 100% on a quiz',
    icon: 'star',
    rarity: 'epic',
    xpReward: 250,
  },
  SPEED_DEMON: {
    id: 'speed_demon',
    title: 'Speed Demon',
    description: 'Complete 100 cards in one session',
    icon: 'target',
    rarity: 'rare',
    xpReward: 150,
  },
  KNOWLEDGE_HUNTER: {
    id: 'knowledge_hunter',
    title: 'Knowledge Hunter',
    description: 'Study 1000 total cards',
    icon: 'medal',
    rarity: 'epic',
    xpReward: 400,
  },

  // ── Streaks (9 new) ──
  STREAK_1: {
    id: 'streak_1',
    title: 'First Step',
    description: 'Start your first study streak',
    icon: 'flame',
    rarity: 'common',
    xpReward: 25,
  },
  STREAK_3: {
    id: 'streak_3',
    title: 'Warming Up',
    description: 'Maintain a 3-day study streak',
    icon: 'flame',
    rarity: 'common',
    xpReward: 50,
  },
  STREAK_14: {
    id: 'streak_14',
    title: 'Fortnight Fighter',
    description: 'Maintain a 14-day study streak',
    icon: 'flame',
    rarity: 'rare',
    xpReward: 150,
  },
  STREAK_21: {
    id: 'streak_21',
    title: 'Habit Builder',
    description: 'Maintain a 21-day study streak',
    icon: 'flame',
    rarity: 'rare',
    xpReward: 200,
  },
  STREAK_60: {
    id: 'streak_60',
    title: 'Unstoppable',
    description: 'Maintain a 60-day study streak',
    icon: 'flame',
    rarity: 'epic',
    xpReward: 400,
  },
  STREAK_90: {
    id: 'streak_90',
    title: 'Quarter Century',
    description: 'Maintain a 90-day study streak',
    icon: 'flame',
    rarity: 'epic',
    xpReward: 500,
  },
  STREAK_180: {
    id: 'streak_180',
    title: 'Half Year Hero',
    description: 'Maintain a 180-day study streak',
    icon: 'flame',
    rarity: 'legendary',
    xpReward: 1000,
  },
  STREAK_365: {
    id: 'streak_365',
    title: 'Year of the Scholar',
    description: 'Maintain a full 365-day study streak',
    icon: 'flame',
    rarity: 'legendary',
    xpReward: 2000,
  },

  // ── Card Milestones (6 new) ──
  CARDS_10: {
    id: 'cards_10',
    title: 'Getting Started',
    description: 'Review 10 cards',
    icon: 'trophy',
    rarity: 'common',
    xpReward: 25,
  },
  CARDS_50: {
    id: 'cards_50',
    title: 'Card Flipper',
    description: 'Review 50 cards',
    icon: 'trophy',
    rarity: 'common',
    xpReward: 50,
  },
  CARDS_100: {
    id: 'cards_100',
    title: 'Century Mark',
    description: 'Review 100 cards',
    icon: 'trophy',
    rarity: 'rare',
    xpReward: 100,
  },
  CARDS_500: {
    id: 'cards_500',
    title: 'Dedicated Reader',
    description: 'Review 500 cards',
    icon: 'trophy',
    rarity: 'rare',
    xpReward: 200,
  },
  CARDS_5000: {
    id: 'cards_5000',
    title: 'Library Patron',
    description: 'Review 5000 cards',
    icon: 'trophy',
    rarity: 'epic',
    xpReward: 500,
  },
  CARDS_10000: {
    id: 'cards_10000',
    title: 'Walking Encyclopedia',
    description: 'Review 10000 cards',
    icon: 'crown',
    rarity: 'legendary',
    xpReward: 1500,
  },

  // ── Deck Creation (3 new) ──
  DECKS_5: {
    id: 'decks_5',
    title: 'Curator',
    description: 'Create 5 flashcard decks',
    icon: 'award',
    rarity: 'common',
    xpReward: 50,
  },
  DECKS_25: {
    id: 'decks_25',
    title: 'Syllabus Architect',
    description: 'Create 25 flashcard decks',
    icon: 'award',
    rarity: 'epic',
    xpReward: 300,
  },
  DECKS_50: {
    id: 'decks_50',
    title: 'Librarian',
    description: 'Create 50 flashcard decks',
    icon: 'crown',
    rarity: 'legendary',
    xpReward: 1000,
  },

  // ── Study Sessions (5 new) ──
  SESSION_1: {
    id: 'session_1',
    title: 'First Lesson',
    description: 'Complete your first study session',
    icon: 'star',
    rarity: 'common',
    xpReward: 25,
  },
  SESSION_10: {
    id: 'session_10',
    title: 'Steady Student',
    description: 'Complete 10 study sessions',
    icon: 'star',
    rarity: 'rare',
    xpReward: 100,
  },
  SESSION_50: {
    id: 'session_50',
    title: 'Avid Learner',
    description: 'Complete 50 study sessions',
    icon: 'star',
    rarity: 'epic',
    xpReward: 300,
  },
  SESSION_100: {
    id: 'session_100',
    title: 'Century Scholar',
    description: 'Complete 100 study sessions',
    icon: 'star',
    rarity: 'epic',
    xpReward: 500,
  },
  SESSION_500: {
    id: 'session_500',
    title: 'Session Master',
    description: 'Complete 500 study sessions',
    icon: 'crown',
    rarity: 'legendary',
    xpReward: 1500,
  },

  // ── Accuracy (3 new) ──
  ACCURACY_80: {
    id: 'accuracy_80',
    title: 'On Point',
    description: 'Achieve 80% accuracy in a session',
    icon: 'target',
    rarity: 'common',
    xpReward: 50,
  },
  ACCURACY_95: {
    id: 'accuracy_95',
    title: 'Laser Focus',
    description: 'Achieve 95% accuracy in a session',
    icon: 'target',
    rarity: 'rare',
    xpReward: 150,
  },
  ACCURACY_100: {
    id: 'accuracy_100',
    title: 'Flawless Recall',
    description: 'Achieve 100% accuracy in a session',
    icon: 'target',
    rarity: 'epic',
    xpReward: 350,
  },

  // ── Speed (2 new) ──
  SPEED_50: {
    id: 'speed_50',
    title: 'Pacing Well',
    description: 'Review 50 cards in one day',
    icon: 'zap',
    rarity: 'common',
    xpReward: 50,
  },
  SPEED_2S: {
    id: 'speed_2s',
    title: 'Lightning Fast',
    description: 'Maintain under 2s average response time',
    icon: 'zap',
    rarity: 'rare',
    xpReward: 150,
  },

  // ── AI Generation (4 new) ──
  AI_DECK_1: {
    id: 'ai_deck_1',
    title: 'AI Pioneer',
    description: 'Generate your first AI deck',
    icon: 'zap',
    rarity: 'common',
    xpReward: 50,
  },
  AI_DECK_10: {
    id: 'ai_deck_10',
    title: 'Prompt Engineer',
    description: 'Generate 10 AI decks',
    icon: 'zap',
    rarity: 'rare',
    xpReward: 150,
  },
  AI_DECK_50: {
    id: 'ai_deck_50',
    title: 'AI Orchestrator',
    description: 'Generate 50 AI decks',
    icon: 'zap',
    rarity: 'epic',
    xpReward: 400,
  },
  AI_CARDS_1000: {
    id: 'ai_cards_1000',
    title: 'Synthesis Master',
    description: 'Generate 1000 AI cards',
    icon: 'crown',
    rarity: 'legendary',
    xpReward: 1000,
  },

  // ── Quiz (3 new) ──
  PERFECT_QUIZ_5: {
    id: 'perfect_quiz_5',
    title: 'Quiz Ace',
    description: 'Get a perfect score on 5 quizzes',
    icon: 'star',
    rarity: 'rare',
    xpReward: 150,
  },
  PERFECT_QUIZ_25: {
    id: 'perfect_quiz_25',
    title: 'Exam Champion',
    description: 'Get a perfect score on 25 quizzes',
    icon: 'star',
    rarity: 'epic',
    xpReward: 400,
  },
  QUIZZES_50: {
    id: 'quizzes_50',
    title: 'Test Taker',
    description: 'Complete 50 quizzes',
    icon: 'star',
    rarity: 'rare',
    xpReward: 200,
  },

  // ── Social (3 new) ──
  SOCIAL_SHARE_1: {
    id: 'social_share_1',
    title: 'Knowledge Sharer',
    description: 'Share your first deck',
    icon: 'award',
    rarity: 'common',
    xpReward: 50,
  },
  SOCIAL_SHARE_10: {
    id: 'social_share_10',
    title: 'Community Pillar',
    description: 'Share 10 decks',
    icon: 'award',
    rarity: 'rare',
    xpReward: 150,
  },
  SOCIAL_GROUP: {
    id: 'social_group',
    title: 'Team Player',
    description: 'Join a study group',
    icon: 'medal',
    rarity: 'common',
    xpReward: 50,
  },

  // ── Profile (3 new) ──
  PROFILE_SETUP: {
    id: 'profile_setup',
    title: 'Who Am I',
    description: 'Complete your profile setup',
    icon: 'medal',
    rarity: 'common',
    xpReward: 25,
  },
  PROFILE_AVATAR: {
    id: 'profile_avatar',
    title: 'Looking Good',
    description: 'Upload a profile avatar',
    icon: 'medal',
    rarity: 'common',
    xpReward: 25,
  },
  PROFILE_LINK: {
    id: 'profile_link',
    title: 'Connected',
    description: 'Link your Schoology or Notion account',
    icon: 'medal',
    rarity: 'rare',
    xpReward: 75,
  },

  // ── Special (5 new) ──
  NIGHT_OWL: {
    id: 'night_owl',
    title: 'Night Owl',
    description: 'Study at midnight',
    icon: 'medal',
    rarity: 'rare',
    xpReward: 100,
  },
  EARLY_BIRD: {
    id: 'early_bird',
    title: 'Early Bird',
    description: 'Study before 6 AM',
    icon: 'medal',
    rarity: 'rare',
    xpReward: 100,
  },
  MARATHON: {
    id: 'marathon',
    title: 'Marathon Runner',
    description: 'Complete a 2+ hour study session',
    icon: 'flame',
    rarity: 'epic',
    xpReward: 300,
  },
  STREAK_FREEZE: {
    id: 'streak_freeze',
    title: 'Saved by the Bell',
    description: 'Use a streak freeze to save your streak',
    icon: 'medal',
    rarity: 'common',
    xpReward: 50,
  },
  PHOENIX: {
    id: 'phoenix',
    title: 'Phoenix',
    description: 'Come back after losing a 7+ day streak',
    icon: 'flame',
    rarity: 'rare',
    xpReward: 150,
  },
};

export default AchievementUnlock;


