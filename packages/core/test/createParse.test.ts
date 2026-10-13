import { expect, it } from 'vitest';
import { cardsPrompt, dedupeCards, MAX_SIDE_CHARS, parseCards, parseTopicDeck, topicPrompt } from '../src';

it('reads a bare JSON array', () => {
  expect(parseCards('[{"question":"Q1","answer":"A1"}]')).toEqual([{ front: 'Q1', back: 'A1' }]);
});

it('reads fenced and chatty replies', () => {
  expect(parseCards('Sure!\n```json\n[{"front":"Q","back":"A"}]\n```\nHope it helps')).toEqual([{ front: 'Q', back: 'A' }]);
  expect(parseCards('Here are your cards: [{"question":"Q","answer":"A"}] Enjoy!')).toEqual([{ front: 'Q', back: 'A' }]);
});

it('reads a cards array wrapped in an object', () => {
  expect(parseCards('{"cards":[{"question":"Q","answer":"A"}]}')).toEqual([{ front: 'Q', back: 'A' }]);
});

it('returns [] for broken JSON instead of throwing', () => {
  expect(parseCards('[{"question": "Q1", "answer": ')).toEqual([]);
  expect(parseCards('')).toEqual([]);
});

it('drops empty, oversize and duplicate cards and trims', () => {
  const long = 'x'.repeat(MAX_SIDE_CHARS + 1);
  const reply = JSON.stringify([
    { question: '  What is ATP? ', answer: ' Energy ' }, { question: 'what is atp', answer: 'dup' },
    { question: '', answer: 'A' }, { question: 'Q', answer: long }, { question: 42, answer: 'A' },
  ]);
  expect(parseCards(reply)).toEqual([{ front: 'What is ATP?', back: 'Energy' }]);
});

it('dedupes ignoring case, punctuation and spacing', () => {
  expect(dedupeCards([{ front: 'What is ATP?', back: 'a' }, { front: 'what  is ATP', back: 'b' }, { front: 'What is ADP?', back: 'c' }]))
    .toEqual([{ front: 'What is ATP?', back: 'a' }, { front: 'What is ADP?', back: 'c' }]);
});

it('reads a topic deck object', () => {
  const reply = 'Here:\n{"title":"Cells","description":"Basics","cards":[{"question":"Q","answer":"A"}]}';
  expect(parseTopicDeck(reply)).toEqual({ title: 'Cells', description: 'Basics', cards: [{ front: 'Q', back: 'A' }] });
  expect(parseTopicDeck('no json here')).toBeNull();
});

it('asks for exactly N cards as JSON only', () => {
  expect(cardsPrompt('text', 7, 'Biology')).toMatch(/exactly 7/);
  expect(cardsPrompt('text', 7, 'Biology')).toMatch(/Biology/);
  expect(topicPrompt('Cells', 12)).toMatch(/exactly 12/);
  expect(topicPrompt('Cells', 12, ['What is ATP?'])).toMatch(/What is ATP\?/);
});
