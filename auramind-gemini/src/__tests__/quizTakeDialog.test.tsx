import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuizTakeDialog } from '../components/classroom/QuizTakeDialog';
import type { Assignment } from '../types/classroom';

const getQuizQuestions = vi.fn();
const submitQuiz = vi.fn();
vi.mock('../services/classroom/assignmentService', () => ({
  assignmentService: {
    getQuizQuestions: (...args: unknown[]) => getQuizQuestions(...args),
    submitQuiz: (...args: unknown[]) => submitQuiz(...args),
  },
}));

const QUIZ: Assignment = {
  id: 'a1',
  classroomId: 'c1',
  createdBy: 't1',
  title: 'Capitals quiz',
  kind: 'quiz',
  deckId: 'd1',
  deckCardCount: 2,
  createdAt: 0,
};

describe('QuizTakeDialog', () => {
  beforeEach(() => {
    getQuizQuestions.mockReset();
    submitQuiz.mockReset();
    getQuizQuestions.mockResolvedValue([
      { id: 'q1', prompt: 'Capital of France', choices: ['Rome', 'Paris'] },
      { id: 'q2', prompt: 'Capital of Italy', choices: ['Rome', 'Paris'] },
    ]);
  });

  it('walks the questions, submits answers keyed by question, and shows the graded result', async () => {
    submitQuiz.mockResolvedValue({ score: 1, total: 2, accuracy: 50, attempts: 1, missed: ['Capital of Italy'] });
    const onSubmitted = vi.fn();
    render(<QuizTakeDialog assignment={QUIZ} onClose={() => {}} onSubmitted={onSubmitted} />);

    expect(await screen.findByText('Capital of France')).toBeTruthy();
    const next = screen.getByRole('button', { name: 'Next' });
    expect((next as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: 'Paris' }));
    fireEvent.click(next);
    expect(screen.getByText('Capital of Italy')).toBeTruthy();

    const submit = screen.getByRole('button', { name: 'Submit answers' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Paris' }));
    fireEvent.click(submit);

    await waitFor(() => expect(submitQuiz).toHaveBeenCalledWith('a1', { q1: 'Paris', q2: 'Paris' }));
    expect(await screen.findByText('1/2')).toBeTruthy();
    expect(screen.getByText('Capital of Italy')).toBeTruthy();
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  it('shows an error instead of questions when loading fails', async () => {
    getQuizQuestions.mockRejectedValue(new Error('nope'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<QuizTakeDialog assignment={QUIZ} onClose={() => {}} onSubmitted={() => {}} />);
    expect(await screen.findByText(/could not be loaded/i)).toBeTruthy();
  });
});
