/**
 * QuizGenerationNotifier — Listens for background quiz generation completions
 * and shows toast notifications so users know when their quiz is ready.
 *
 * Mount this once at app root level so it works regardless of which page
 * the user is currently viewing.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { SparklesIcon, AlertTriangleIcon } from '../icons/CustomIcons';
import {
  onQuizCompleted,
  loadAllCachedQuizzes,
  type GenerationProgress,
} from '../../services/quiz/quizGenerationCache';
import {
  addNotification,
} from '../../services/notifications/notificationStore';

// Track which completions we've already notified about (survives re-renders)
const NOTIFIED_KEY = 'bonamind:notified-quizzes';

function getNotifiedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markNotified(deckId: string): void {
  const set = getNotifiedSet();
  set.add(deckId);
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set]));
}

export default function QuizGenerationNotifier() {
  const navigate = useNavigate();
  const notifiedRef = useRef(getNotifiedSet());

  useEffect(() => {
    // On mount, check for any cached quizzes we haven't notified about
    // (e.g., user refreshed while generating, or generation finished in another tab)
    const checkExisting = () => {
      try {
        const cached = loadAllCachedQuizzes();
        for (const [deckId, quiz] of cached) {
          if (!notifiedRef.current.has(deckId)) {
            notifiedRef.current.add(deckId);
            markNotified(deckId);
            addNotification({
              title: 'Quiz Ready!',
              description: quiz.title,
              type: 'success',
              actionUrl: `/deck/${deckId}`,
              actionLabel: 'Take Quiz',
            });
            toast.success(
              <div className='flex flex-col gap-1'>
                <span className='font-semibold text-sm'>Quiz Ready!</span>
                <span className='text-xs opacity-80'>{quiz.title}</span>
              </div>,
              {
                duration: 8000,
                icon: <SparklesIcon className='w-5 h-5' />,
                action: {
                  label: 'Take Quiz',
                  onClick: () => navigate(`/deck/${deckId}`),
                },
              }
            );
          }
        }
      } catch { /* ignore */ }
    };

    // Small delay so the app is fully mounted
    const t = setTimeout(checkExisting, 500);

    // Subscribe to future completions
    const unsub = onQuizCompleted((deckId: string, progress: GenerationProgress) => {
      // Already notified for this completion?
      if (notifiedRef.current.has(deckId)) return;

      notifiedRef.current.add(deckId);
      markNotified(deckId);

      if (progress.status === 'done' && progress.quiz) {
        addNotification({
          title: 'Quiz Ready!',
          description: `${progress.quiz.title} · ${progress.quiz.questions.length} questions`,
          type: 'success',
          actionUrl: `/deck/${deckId}`,
          actionLabel: 'Take Quiz',
        });
        toast.success(
          <div className='flex flex-col gap-1'>
            <span className='font-semibold text-sm'>Quiz Ready!</span>
            <span className='text-xs opacity-80'>{progress.quiz.title}</span>
            <span className='text-[10px] opacity-60'>
              {progress.quiz.questions.length} questions
            </span>
          </div>,
          {
            duration: 10000,
            icon: <SparklesIcon className='w-5 h-5' />,
            action: {
              label: 'Take Quiz',
              onClick: () => navigate(`/deck/${deckId}`),
            },
          }
        );
      } else if (progress.status === 'error') {
        addNotification({
          title: 'Quiz Generation Failed',
          description: progress.error || 'An error occurred',
          type: 'error',
          actionUrl: `/deck/${deckId}`,
          actionLabel: 'Retry',
        });
        toast.error(
          <div className='flex flex-col gap-1'>
            <span className='font-semibold text-sm'>Quiz Generation Failed</span>
            <span className='text-xs opacity-80'>
              {progress.error || 'An error occurred'}
            </span>
          </div>,
          {
            duration: 6000,
            icon: <AlertTriangleIcon className='w-5 h-5' />,
            action: {
              label: 'Retry',
              onClick: () => navigate(`/deck/${deckId}`),
            },
          }
        );
      }
    });

    return () => {
      clearTimeout(t);
      unsub();
    };
  }, [navigate]);

  // This component renders nothing — it just listens
  return null;
}



