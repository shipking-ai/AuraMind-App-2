/**
 * Shared role + starter-topic vocabulary for the onboarding flow.
 *
 * Single source of truth for the persona labels shown on the onboarding
 * role step, the query param the plan page reads (`?role=`), and the
 * suggested topics per role. Kept out of a component so AuthPage,
 * OnboardingFlow, and the plan page can all agree on the same strings
 * without importing each other's UI.
 *
 * These roles are display personas (user_metadata.role) — they never
 * drive authorization. Authorization reads app_metadata.role only.
 */

export const ONBOARDING_ROLES = [
  { value: "learner", label: "Learner" },
  { value: "student", label: "Student" },
  { value: "teacher", label: "Teacher" },
  { value: "doctor", label: "Doctor" },
  { value: "professional", label: "Professional" },
  { value: "researcher", label: "Researcher" },
] as const;

export type OnboardingRole = (typeof ONBOARDING_ROLES)[number]["value"];

export const ONBOARDING_ROLE_LABEL: Record<OnboardingRole, string> = {
  learner: "Learner",
  student: "Student",
  teacher: "Teacher",
  doctor: "Doctor",
  professional: "Professional",
  researcher: "Researcher",
};

/** Human copy for the "what brings you here?" step, per persona. */
export const ONBOARDING_ROLE_PROMISE: Record<OnboardingRole, string> = {
  learner: "A curious mind with a goal.",
  student: "Classes, exams, and grades to beat.",
  teacher: "Prep, and classrooms full of learners.",
  doctor: "Clinical knowledge that must stick.",
  professional: "Skills that advance the career.",
  researcher: "Deep material worth mastering.",
};

/** Starter topic chips shown beside the free-text field, per persona. */
export const ONBOARDING_ROLE_TOPICS: Record<OnboardingRole, string[]> = {
  learner: ["Spanish basics", "Photo editing", "Public speaking", "Personal finance"],
  student: ["Cell biology", "US history", "Algebra II", "Essay writing"],
  teacher: ["Lesson planning", "Classroom management", "Grading rubrics", "EdTech tools"],
  doctor: ["Cardiac anatomy", "Pharmacology", "ECG reading", "Medical terminology"],
  professional: ["SQL & data", "Product strategy", "Presentation skills", "Negotiation"],
  researcher: ["Study design", "Stats & methods", "Lit review", "Grant writing"],
};

export function isOnboardingRole(value: string): value is OnboardingRole {
  return ONBOARDING_ROLES.some((r) => r.value === value);
}

export function safeRole(value: string | null | undefined): OnboardingRole {
  return value && isOnboardingRole(value) ? value : "learner";
}