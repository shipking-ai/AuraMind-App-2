import type { CreateErrorKind } from '@bonamind/core';

/** Every line course creation shows, in the Part 1 voice (spec §5). */
export const CREATE_COPY = {
  title: 'New course',
  subtitle: 'Turn anything into cards',
  make: 'Make my course',
  offlineButton: 'Connect to make a course',
  proButton: 'Part of BonaMind Pro',
  waiting: 'Waiting for a connection',
  partial: 'Made from part of your source',
  pasteInstead: 'Paste text instead',
  saveRetry: 'Try saving again',
  errors: {
    offline: "You're offline. Connect to make a course.",
    subscription: 'Making courses is part of BonaMind Pro.',
    rate_limited: 'Give it a minute and try again.',
    unreadable: "Couldn't read that. Try another link or paste the text.",
    too_large: 'That PDF is too big for now (3 MB max).',
    empty: "Couldn't make cards from that. Try a different source.",
    busy: 'Something went wrong. Try again in a moment.',
  } satisfies Record<CreateErrorKind, string>,
  /** Source-specific wording for a source over the size limits. */
  tooLarge: {
    pdf: 'That PDF is too big for now (3 MB max).',
    photo: 'Those photos are too big to send. Try fewer pages or a closer shot.',
  },
  /** Source-specific wording for an unreadable source. */
  unreadable: {
    link: "Couldn't read that page. Try another link or paste the text.",
    pdf: 'That PDF is images only. Snap the pages with Photo instead.',
    photo: "Couldn't find text in that photo. Try a sharper, closer shot.",
  },
} as const;
