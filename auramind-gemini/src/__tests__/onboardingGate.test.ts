import { describe, expect, it } from 'vitest';
import { hasCompletedOnboarding } from '../lib/onboardingGate';

describe('hasCompletedOnboarding', () => {
  it('is false for a brand-new account with no metadata', () => {
    expect(hasCompletedOnboarding(undefined)).toBe(false);
    expect(hasCompletedOnboarding(null)).toBe(false);
    expect(hasCompletedOnboarding({})).toBe(false);
  });

  it('is true when the new flow set onboarding_completed', () => {
    expect(hasCompletedOnboarding({ onboarding_completed: true })).toBe(true);
  });

  it('treats legacy picker accounts as onboarded (they own a saved role)', () => {
    expect(hasCompletedOnboarding({ role: 'student' })).toBe(true);
    expect(hasCompletedOnboarding({ role: 'teacher' })).toBe(true);
  });

  it('ignores roles that are not onboarding personas', () => {
    expect(hasCompletedOnboarding({ role: 3 })).toBe(false);
  });

  it('treats internal staff roles as onboarded (no consumer persona picker)', () => {
    expect(hasCompletedOnboarding({ role: 'admin' })).toBe(true);
    expect(hasCompletedOnboarding({ role: 'tester' })).toBe(true);
    expect(hasCompletedOnboarding({ role: 'employee' })).toBe(true);
    expect(hasCompletedOnboarding({ role: 'ceo' })).toBe(true);
    expect(hasCompletedOnboarding({ role: 'owner' })).toBe(true);
  });

  it('does NOT treat the default "user" role as onboarded', () => {
    // "user" is the default role every new signup gets — those accounts must
    // still see the onboarding flow.
    expect(hasCompletedOnboarding({ role: 'user' })).toBe(false);
  });

  it('is false when onboarding_completed is not literally true', () => {
    expect(hasCompletedOnboarding({ onboarding_completed: 'true' })).toBe(false);
    expect(hasCompletedOnboarding({ onboarding_completed: 1 })).toBe(false);
  });
});