import { WEAR_GRADE_PATH, WEAR_SYNC_PATH } from '../../lib/legacyNames';

// Permanent: the watch app matches these exact paths (see legacyNames.ts).
export const WEAR_URI_SYNC = WEAR_SYNC_PATH;
export const WEAR_URI_GRADE = WEAR_GRADE_PATH;
export const WEAR_PAYLOAD_VERSION = 1;
export const WEAR_MAX_CARDS = 40;
// Per-field safety ceiling — the flashcards must read identically on the
// watch as on the phone, so text is never silently cut for realistic cards.
// 1000 chars/side is far beyond any real flashcard; worst case (40 cards ×
// 2000 chars ASCII) ≈ 80 KB, inside the Wear data-layer ~100 KB budget.
export const WEAR_MAX_TEXT = 1000;
