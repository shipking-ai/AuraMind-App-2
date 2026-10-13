
// Achievement types
export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  category: 'streak' | 'study' | 'creation' | 'social' | 'mastery';
  requirement: number;
  requirementType: 'streak' | 'cards' | 'decks' | 'sessions' | 'accuracy' | 'level';
}

// Achievements definition
export const ACHIEVEMENTS: Achievement[] = [
  // Streak achievements
  { id: 'streak_3', title: 'Getting Started', description: 'Maintain a 3-day study streak', icon: 'local_fire_department', xpReward: 50, category: 'streak', requirement: 3, requirementType: 'streak' },
  { id: 'streak_7', title: 'Week Warrior', description: 'Maintain a 7-day study streak', icon: 'whatshot', xpReward: 150, category: 'streak', requirement: 7, requirementType: 'streak' },
  { id: 'streak_30', title: 'Monthly Master', description: 'Maintain a 30-day study streak', icon: 'military_tech', xpReward: 500, category: 'streak', requirement: 30, requirementType: 'streak' },
  { id: 'streak_100', title: 'Century Studier', description: 'Maintain a 100-day study streak', icon: 'emoji_events', xpReward: 2000, category: 'streak', requirement: 100, requirementType: 'streak' },
  { id: 'streak_365', title: 'Year of Learning', description: 'Maintain a full year study streak', icon: 'workspace_premium', xpReward: 5000, category: 'streak', requirement: 365, requirementType: 'streak' },

  // Study achievements
  { id: 'cards_10', title: 'First Steps', description: 'Review 10 flashcards', icon: 'style', xpReward: 25, category: 'study', requirement: 10, requirementType: 'cards' },
  { id: 'cards_100', title: 'Card Collector', description: 'Review 100 flashcards', icon: 'collections', xpReward: 100, category: 'study', requirement: 100, requirementType: 'cards' },
  { id: 'cards_500', title: 'Knowledge Keeper', description: 'Review 500 flashcards', icon: 'library_books', xpReward: 250, category: 'study', requirement: 500, requirementType: 'cards' },
  { id: 'cards_1000', title: 'Memory Master', description: 'Review 1000 flashcards', icon: 'psychology', xpReward: 500, category: 'study', requirement: 1000, requirementType: 'cards' },

  // Session achievements
  { id: 'sessions_10', title: 'Regular Learner', description: 'Complete 10 study sessions', icon: 'school', xpReward: 75, category: 'study', requirement: 10, requirementType: 'sessions' },
  { id: 'sessions_50', title: 'Dedicated Student', description: 'Complete 50 study sessions', icon: 'menu_book', xpReward: 200, category: 'study', requirement: 50, requirementType: 'sessions' },
  { id: 'sessions_100', title: 'Study Champion', description: 'Complete 100 study sessions', icon: 'emoji_events', xpReward: 400, category: 'study', requirement: 100, requirementType: 'sessions' },

  // Deck achievements
  { id: 'decks_3', title: 'Deck Builder', description: 'Create 3 decks', icon: 'dashboard', xpReward: 75, category: 'creation', requirement: 3, requirementType: 'decks' },
  { id: 'decks_10', title: 'Content Creator', description: 'Create 10 decks', icon: 'construction', xpReward: 200, category: 'creation', requirement: 10, requirementType: 'decks' },

  // Accuracy achievements
  { id: 'accuracy_80', title: 'Sharp Mind', description: 'Achieve 80% accuracy in a session', icon: 'check_circle', xpReward: 50, category: 'mastery', requirement: 80, requirementType: 'accuracy' },
  { id: 'accuracy_90', title: 'Perfect Recall', description: 'Achieve 90% accuracy in a session', icon: 'verified', xpReward: 100, category: 'mastery', requirement: 90, requirementType: 'accuracy' },
  { id: 'accuracy_100', title: 'Flawless', description: 'Achieve 100% accuracy in a session', icon: 'stars', xpReward: 150, category: 'mastery', requirement: 100, requirementType: 'accuracy' },

  // Level achievements
  { id: 'level_5', title: 'Rising Star', description: 'Reach level 5', icon: 'trending_up', xpReward: 100, category: 'mastery', requirement: 5, requirementType: 'level' },
  { id: 'level_10', title: 'Expert', description: 'Reach level 10', icon: 'grade', xpReward: 300, category: 'mastery', requirement: 10, requirementType: 'level' },
  { id: 'level_15', title: 'Legend', description: 'Reach level 15', icon: 'diamond', xpReward: 1000, category: 'mastery', requirement: 15, requirementType: 'level' },
];

// Check if user earned a new achievement
export const checkAchievements = (stats: UserStats): Achievement[] => {
  const earnedAchievements: Achievement[] = [];
  const earnedIds = stats.earnedAchievements || [];

  for (const achievement of ACHIEVEMENTS) {
    if (earnedIds.includes(achievement.id)) continue;

    let earned = false;
    switch (achievement.requirementType) {
      case 'streak':
        earned = stats.streakDays >= achievement.requirement;
        break;
      case 'cards':
        earned = stats.cardsStudied >= achievement.requirement;
        break;
      case 'decks':
        earned = stats.decksCreated >= achievement.requirement;
        break;
      case 'sessions':
        earned = stats.sessionsCompleted >= achievement.requirement;
        break;
      case 'accuracy':
        earned = stats.accuracy >= achievement.requirement;
        break;
      case 'level':
        earned = stats.level >= achievement.requirement;
        break;
    }

    if (earned) {
      earnedAchievements.push(achievement);
    }
  }

  return earnedAchievements;
};

// User stats interface
export interface UserStats {
  xp: number;
  level: number;
  title: string;
  streakDays: number;
  cardsStudied: number;
  decksCreated: number;
  sessionsCompleted: number;
  accuracy: number;
  totalStudyTime: number;
  earnedAchievements: string[];
}

// XP rewards for various actions
export const XP_REWARDS = {
  // Study actions
  CARD_REVIEWED: 10,
  STUDY_SESSION_COMPLETED: 25,
  DAILY_STREAK: 50,
  WEEKLY_STREAK: 150,
  MONTHLY_STREAK: 500,
  
  // Content creation
  DECK_CREATED: 50,
  CARD_CREATED: 5,
  CARDS_IMPORTED: 2,
  
  // AI interactions
  AI_CHAT_MESSAGE: 2,
  FLASHCARDS_GENERATED: 15,
  DECK_GENERATED: 40,
  
  // Quiz performance
  QUIZ_PERFECT_SCORE: 30,
  QUIZ_GOOD_SCORE: 15,
  QUIZ_COMPLETED: 5,
  
  // Social
  DECK_SHARED: 20,
  STUDY_JOINED: 10,
  
  // Platform
  PROFILE_COMPLETED: 25,
  FEEDBACK_SUBMITTED: 15
};

// Streak bonuses
export const STREAK_BONUSES = {
  3: 25,   // 3-day streak bonus
  7: 75,   // 7-day streak bonus
  14: 150, // 2-week streak bonus
  30: 300, // Monthly streak bonus
  60: 600, // 2-month streak bonus
  90: 900, // 3-month streak bonus
  365: 2000 // Yearly streak bonus
};

// Level calculation
export const calculateLevel = (xp: number) => {
  const levels = [
    { xp: 0, level: 1, title: 'Novice Learner' },
    { xp: 100, level: 2, title: 'Apprentice Scholar' },
    { xp: 250, level: 3, title: 'Dedicated Student' },
    { xp: 500, level: 4, title: 'Knowledge Seeker' },
    { xp: 1000, level: 5, title: 'Focused Studier' },
    { xp: 2000, level: 6, title: 'Deep Learner' },
    { xp: 3500, level: 7, title: 'Subject Master' },
    { xp: 5000, level: 8, title: 'Expert Scholar' },
    { xp: 7500, level: 9, title: 'Academic Ace' },
    { xp: 10000, level: 10, title: 'Legendary Learner' },
    { xp: 15000, level: 11, title: 'Grand Master' },
    { xp: 20000, level: 12, title: 'Supreme Scholar' },
    { xp: 30000, level: 13, title: 'Ultimate Knowledge' },
    { xp: 40000, level: 14, title: 'Eternal Student' },
    { xp: 50000, level: 15, title: 'Transcendent Sage' }
  ];

  let userLevel = 1;
  let userTitle = 'Novice Learner';
  
  for (const level of levels) {
    if (xp >= level.xp) {
      userLevel = level.level;
      userTitle = level.title;
    }
  }
  
  return { level: userLevel, title: userTitle };
};

// XP needed for next level
export const getXPToNextLevel = (xp: number) => {
  const { level } = calculateLevel(xp);
  const levelXPMap: Record<number, number> = {
    1: 0,
    2: 100,
    3: 250,
    4: 500,
    5: 1000,
    6: 2000,
    7: 3500,
    8: 5000,
    9: 7500,
    10: 10000,
    11: 15000,
    12: 20000,
    13: 30000,
    14: 40000,
    15: 50000
  };
  
  const _currentLevelXP = levelXPMap[level] || 0;
  const nextLevelXP = levelXPMap[level + 1] || 50000;
  
  return Math.max(0, nextLevelXP - xp);
};

// Progress to next level (0-1)
export const getLevelProgress = (xp: number) => {
  const { level } = calculateLevel(xp);
  const levelXPMap: Record<number, number> = {
    1: 0,
    2: 100,
    3: 250,
    4: 500,
    5: 1000,
    6: 2000,
    7: 3500,
    8: 5000,
    9: 7500,
    10: 10000,
    11: 15000,
    12: 20000,
    13: 30000,
    14: 40000,
    15: 50000
  };
  
  const currentLevelXP = levelXPMap[level] || 0;
  const nextLevelXP = levelXPMap[level + 1] || 50000;
  const levelRange = nextLevelXP - currentLevelXP;
  
  if (levelRange === 0) return 1;
  return (xp - currentLevelXP) / levelRange;
};

// Award XP and check for achievements
export const awardXP = (action: keyof typeof XP_REWARDS, multiplier: number = 1) => {
  const xpToAdd = XP_REWARDS[action] * multiplier;
  
  // Get current XP
  let currentXP = 0;
  if (typeof window !== 'undefined') {
    const savedXP = localStorage.getItem('bonamind_user_xp');
    currentXP = savedXP ? parseInt(savedXP, 10) : 0;
  }
  
  // Add XP
  const newXP = currentXP + xpToAdd;
  
  // Save XP
  if (typeof window !== 'undefined') {
    localStorage.setItem('bonamind_user_xp', String(newXP));
  }
  
  // Check for streak bonuses (this would be enhanced with actual streak tracking)
  // For now, we'll just return the XP added
  
  return {
    xpAdded: xpToAdd,
    totalXP: newXP,
    level: calculateLevel(newXP),
    xpToNextLevel: getXPToNextLevel(newXP),
    levelProgress: getLevelProgress(newXP)
  };
};

// Get comprehensive user stats
export const getUserStats = (): UserStats => {
  if (typeof window === 'undefined') {
    return getDefaultStats();
  }

  const xp = parseInt(localStorage.getItem('bonamind_user_xp') || '0', 10);
  const streakDays = parseInt(localStorage.getItem('bonamind_streak_days') || '0', 10);
  const cardsStudied = parseInt(localStorage.getItem('bonamind_cards_studied') || '0', 10);
  const decksCreated = parseInt(localStorage.getItem('bonamind_decks_created') || '0', 10);
  const sessionsCompleted = parseInt(localStorage.getItem('bonamind_sessions_completed') || '0', 10);
  const accuracy = parseFloat(localStorage.getItem('bonamind_accuracy') || '0');
  const totalStudyTime = parseInt(localStorage.getItem('bonamind_study_time') || '0', 10);
  const earnedAchievements = JSON.parse(localStorage.getItem('bonamind_achievements') || '[]');

  const { level, title } = calculateLevel(xp);

  return {
    xp,
    level,
    title,
    streakDays,
    cardsStudied,
    decksCreated,
    sessionsCompleted,
    accuracy,
    totalStudyTime,
    earnedAchievements
  };
};

// Get default stats
const getDefaultStats = (): UserStats => ({
  xp: 0,
  level: 1,
  title: 'Novice Learner',
  streakDays: 0,
  cardsStudied: 0,
  decksCreated: 0,
  sessionsCompleted: 0,
  accuracy: 0,
  totalStudyTime: 0,
  earnedAchievements: []
});

// Update user stats
export const updateUserStats = (updates: Partial<UserStats>): UserStats => {
  if (typeof window === 'undefined') return getDefaultStats();

  const currentStats = getUserStats();
  const newStats = { ...currentStats, ...updates };

  localStorage.setItem('bonamind_user_xp', String(newStats.xp));
  localStorage.setItem('bonamind_streak_days', String(newStats.streakDays));
  localStorage.setItem('bonamind_cards_studied', String(newStats.cardsStudied));
  localStorage.setItem('bonamind_decks_created', String(newStats.decksCreated));
  localStorage.setItem('bonamind_sessions_completed', String(newStats.sessionsCompleted));
  localStorage.setItem('bonamind_accuracy', String(newStats.accuracy));
  localStorage.setItem('bonamind_study_time', String(newStats.totalStudyTime));
  localStorage.setItem('bonamind_achievements', JSON.stringify(newStats.earnedAchievements));

  return newStats;
};

// Track card reviewed
export const trackCardReviewed = (correct: boolean) => {
  const stats = getUserStats();
  const newCardsStudied = stats.cardsStudied + 1;

  // Calculate new accuracy
  const totalCorrect = (stats.accuracy / 100) * stats.cardsStudied + (correct ? 1 : 0);
  const newAccuracy = (totalCorrect / newCardsStudied) * 100;

  updateUserStats({
    cardsStudied: newCardsStudied,
    accuracy: newAccuracy
  });

  // Award XP
  return awardXP('CARD_REVIEWED');
};

// Track study session completed
export const trackStudySession = (duration: number, accuracy: number) => {
  const stats = getUserStats();

  // Update streak
  const today = new Date().toDateString();
  const lastStudy = localStorage.getItem('bonamind_last_study_date');
  let newStreak = stats.streakDays;

  // Persist this session's contribution to the rolling XP history used
  // by AreaChart on the dashboard RetentionPanel. Append happens AFTER
  // awardXP returns below so we know `xpResult.xpAdded` — single push,
  // no placeholder/overwrite dance.

  if (lastStudy !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (lastStudy === yesterday.toDateString()) {
      newStreak += 1;
    } else if (lastStudy !== today) {
      newStreak = 1;
    }
    localStorage.setItem('bonamind_last_study_date', today);
  }

  const newSessionsCompleted = stats.sessionsCompleted + 1;
  const newTotalTime = stats.totalStudyTime + duration;

  // Calculate accuracy (average with previous)
  const totalAccuracy = (stats.accuracy * stats.sessionsCompleted + accuracy) / (newSessionsCompleted || 1);

  updateUserStats({
    streakDays: newStreak,
    sessionsCompleted: newSessionsCompleted,
    totalStudyTime: newTotalTime,
    accuracy: totalAccuracy
  });

  // Check for new achievements
  const newStats = getUserStats();
  const newAchievements = checkAchievements(newStats);

  // Award XP for session
  const xpResult = awardXP('STUDY_SESSION_COMPLETED');

  // Append this session's contribution to the rolling XP history used
  // by AreaChart on the dashboard RetentionPanel. Without this writer
  // the chart reads from a localStorage key no one populates and falls
  // back to a smoothed bucketing of lifetime XP — decorative but
  // dishonest. Append one row per call, cap at 365 entries so the
  // localStorage budget stays bounded. Quota-exceeded writes surface
  // a one-time toast so the user knows data is being trimmed.
  if (typeof window !== 'undefined') {
    try {
      const HISTORY_KEY = 'bonamind_study_history';
      const HISTORY_CAP = 365;
      const raw = window.localStorage.getItem(HISTORY_KEY);
      const history: Array<{ date: string; xp: number; accuracy: number }> = raw
        ? JSON.parse(raw)
        : [];
      history.push({
        date: new Date().toISOString(),
        xp: xpResult?.xpAdded ?? 0,
        accuracy,
      });
      if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (err) {
      const isQuota =
        err instanceof DOMException &&
        (err.name === 'QuotaExceededError' || (err as any).code === 22);
      if (isQuota && typeof window !== 'undefined') {
        // Best-effort fire-and-forget; do not block the return.
        try {
          window.dispatchEvent(
            new CustomEvent('bonamind:study-history-truncated', { detail: {} }),
          );
        } catch {
          /* no-op */
        }
      }
      // Localstorage write failure (quota or stale JSON) — the streak
      // counter and XP are already persisted by updateUserStats, so
      // the user-facing study session is unaffected.
      void err;
    }
  }

  return {
    ...xpResult,
    newAchievements
  };
};

// Track deck created
export const trackDeckCreated = () => {
  const stats = getUserStats();
  updateUserStats({
    decksCreated: stats.decksCreated + 1
  });
  return awardXP('DECK_CREATED');
};

// Unlock achievement
export const unlockAchievement = (achievementId: string): Achievement | null => {
  if (typeof window === 'undefined') return null;

  const stats = getUserStats();
  if (stats.earnedAchievements.includes(achievementId)) return null;

  const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
  if (!achievement) return null;

  const newEarned = [...stats.earnedAchievements, achievementId];
  updateUserStats({
    earnedAchievements: newEarned,
    xp: stats.xp + achievement.xpReward
  });

  return achievement;
};

// Get all earned achievements
export const getEarnedAchievements = (): Achievement[] => {
  const stats = getUserStats();
  return ACHIEVEMENTS.filter(a => stats.earnedAchievements.includes(a.id));
};

// Get next achievable achievements
export const getNextAchievements = (): { earned: Achievement[]; available: Achievement[] } => {
  const stats = getUserStats();
  const earned = ACHIEVEMENTS.filter(a => stats.earnedAchievements.includes(a.id));
  const available = ACHIEVEMENTS.filter(a => !stats.earnedAchievements.includes(a.id));
  return { earned, available };
};

// Reset user data (for testing + signed-out fresh state)
// Keeps the keyset in lockstep with what `updateUserStats()` writes above —
// a stale key here means testing/QA could never actually clear the streak
// widget or progress widgets between runs. Update both places together.
export const resetUserData = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('bonamind_user_xp');
    localStorage.removeItem('bonamind_streak_days');
    localStorage.removeItem('bonamind_cards_studied');
    localStorage.removeItem('bonamind_decks_created');
    localStorage.removeItem('bonamind_sessions_completed');
    localStorage.removeItem('bonamind_accuracy');
    localStorage.removeItem('bonamind_study_time');
    localStorage.removeItem('bonamind_achievements');
    localStorage.removeItem('bonamind_last_study_date');
  }
};


