import { expect, it } from 'vitest';
import { LINNEA_CHIPS, LINNEA_SYSTEM_PROMPT, linneaErrorLine, linneaOpening } from '../src';

it('speaks as Prof. Linnea', () => {
  expect(LINNEA_SYSTEM_PROMPT).toBe(
    'You are Prof. Linnea, the tutor inside BonaMind. You are warm, precise and brief: two to four sentences unless asked for more. You teach by asking one good question at a time, use vivid everyday analogies, and never shame a mistake. When the student is weak on a topic, offer a short fix they can do in three minutes.',
  );
  expect(LINNEA_CHIPS).toEqual(['Quiz me', 'Explain it simply']);
});

it('opens with a greeting when there are no weak spots', () => {
  expect(linneaOpening([])).toBe("Hi, I'm Prof. Linnea. What are you studying today?");
  expect(linneaOpening([], 'Sam')).toBe("Hi Sam, I'm Prof. Linnea. What are you studying today?");
});

it('opens on the card with the most lapses', () => {
  const weak = [{ front: 'ATP', lapses: 1 }, { front: 'Mitosis', lapses: 3 }, { front: 'Ribosomes', lapses: 2 }];
  expect(linneaOpening(weak, 'Sam')).toBe('Hey Sam. Mitosis keeps tripping you up. Want a three-minute fix?');
  expect(linneaOpening(weak)).toBe('Hey there. Mitosis keeps tripping you up. Want a three-minute fix?');
});

it('truncates a long card front to 60 characters', () => {
  const front = 'Which phase of mitosis lines every chromosome up along the metaphase plate?';
  const line = linneaOpening([{ front, lapses: 2 }], 'Sam');
  const shown = line.slice('Hey Sam. '.length, line.indexOf(' keeps tripping'));
  expect(shown).toHaveLength(60);
  expect(shown.endsWith('…')).toBe(true);
});

it('has a line for every failure', () => {
  expect(linneaErrorLine('busy')).toBe("I'm a little overloaded. Try me again in a moment.");
  expect(linneaErrorLine('unavailable')).toBe("I'm a little overloaded. Try me again in a moment.");
  expect(linneaErrorLine('rate_limited')).toBe("We've been talking a lot. Give me a minute to catch my breath.");
  expect(linneaErrorLine('auth')).toBe("Your session expired. Sign in again and I'll be right here.");
  expect(linneaErrorLine('network')).toBe("I can't reach the internet right now. Your cards still work offline.");
});
