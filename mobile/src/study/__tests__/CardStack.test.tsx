import { Rating, type Card } from '@bonamind/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { CardStack } from '../CardStack';

jest.mock('../../design/motion', () => ({ useMotion: () => ({ reduce: false, spring: () => ({ damping: 12, stiffness: 140 }) }) }));
jest.mock('../../design/haptics', () => ({ haptic: jest.fn() }));

const card: Card = { id: 'c1', deckId: 'bio', front: 'Which phase lines chromosomes up?', back: 'Metaphase' };
const pan = (dx: number, dy = 0) => [
  { state: State.BEGAN, translationX: 0, translationY: 0 },
  { state: State.ACTIVE, translationX: dx / 2, translationY: dy / 2 },
  { state: State.ACTIVE, translationX: dx, translationY: dy },
  { state: State.END, translationX: dx, translationY: dy, velocityX: 0, velocityY: 0 },
];

async function setup(c: Card = card) {
  const onRate = jest.fn();
  await render(<CardStack card={c} turn={0} depth={3} onRate={onRate} />);
  // Gesture callbacks hop to JS via scheduleOnRN, which lands a tick later.
  const flip = async () => {
    fireGestureHandler(getByGestureTestId('card-tap'));
    await screen.findByLabelText(/^Answer:/);
  };
  return { onRate, flip };
}

it('flips to the answer on tap', async () => {
  const { flip } = await setup();
  expect(screen.getByLabelText('Question: Which phase lines chromosomes up?')).toBeTruthy();
  await flip();
  expect(screen.getByLabelText('Answer: Metaphase')).toBeTruthy();
});

it('rates by swipe direction once flipped', async () => {
  const { onRate, flip } = await setup();
  await flip();
  fireGestureHandler(getByGestureTestId('card-pan'), pan(120));
  await waitFor(() => expect(onRate).toHaveBeenLastCalledWith(Rating.GOOD));
});

it.each([[[-120, 0], Rating.AGAIN], [[0, -120], Rating.EASY]] as const)('swipe %j rates %s', async ([dx, dy], rating) => {
  const { onRate, flip } = await setup();
  await flip();
  fireGestureHandler(getByGestureTestId('card-pan'), pan(dx, dy));
  await waitFor(() => expect(onRate).toHaveBeenLastCalledWith(rating));
});

it('does not rate before the answer is shown', async () => {
  const { onRate } = await setup();
  fireGestureHandler(getByGestureTestId('card-pan'), pan(160));
  await new Promise((r) => setTimeout(r, 50));
  expect(onRate).not.toHaveBeenCalled();
});

// Swiping the question used to rubber-band and do nothing, which read as a
// broken swipe. A full swipe now turns the card over (still no rating).
it('turns the card over when the question is swiped', async () => {
  const { onRate } = await setup();
  fireGestureHandler(getByGestureTestId('card-pan'), pan(160));
  expect(await screen.findByLabelText('Answer: Metaphase')).toBeTruthy();
  expect(onRate).not.toHaveBeenCalled();
});

it('leaves the question up after a small nudge', async () => {
  await setup();
  fireGestureHandler(getByGestureTestId('card-pan'), pan(30));
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.getByLabelText(/^Question:/)).toBeTruthy();
});

it('springs back from a short drag', async () => {
  const { onRate, flip } = await setup();
  await flip();
  fireGestureHandler(getByGestureTestId('card-pan'), pan(40));
  await new Promise((r) => setTimeout(r, 50));
  expect(onRate).not.toHaveBeenCalled();
});

it('offers all four ratings on long-press, including Hard', async () => {
  const { onRate, flip } = await setup();
  await flip();
  fireGestureHandler(getByGestureTestId('card-long'));
  await fireEvent.press(await screen.findByRole('button', { name: 'Hard' }));
  expect(onRate).toHaveBeenCalledWith(Rating.HARD);
});

it('exposes the ratings to screen readers', async () => {
  const { onRate } = await setup();
  await fireEvent(screen.getByLabelText(/^Question:/), 'accessibilityAction', { nativeEvent: { actionName: 'hard' } });
  expect(onRate).toHaveBeenCalledWith(Rating.HARD);
});

it('scrolls a very long card instead of shrinking it', async () => {
  await setup({ ...card, front: 'x'.repeat(2000) });
  const scroll = screen.getByTestId('card-front-scroll');
  await fireEvent(scroll, 'layout', { nativeEvent: { layout: { height: 300 } } });
  await fireEvent(scroll, 'contentSizeChange', 320, 2400);
  expect(screen.getByTestId('card-front-scroll').props.scrollEnabled).toBe(true);
});

// A scroll view that can scroll (or bounce) claims vertical drags on iOS before
// the card's pan does. A card whose text fits must not be scrollable at all.
it('keeps a card that fits from scrolling or bouncing, so swipes reach the card', async () => {
  await setup();
  const scroll = screen.getByTestId('card-front-scroll');
  await fireEvent(scroll, 'layout', { nativeEvent: { layout: { height: 300 } } });
  await fireEvent(scroll, 'contentSizeChange', 320, 120);
  const after = screen.getByTestId('card-front-scroll');
  expect(after.props.scrollEnabled).toBe(false);
  expect(after.props.bounces).toBe(false);
});

it('shows the question again when an Again card comes straight back', async () => {
  const onRate = jest.fn();
  const view = await render(<CardStack card={card} turn={0} depth={1} onRate={onRate} />);
  fireGestureHandler(getByGestureTestId('card-tap'));
  await screen.findByLabelText(/^Answer:/);
  await view.rerender(<CardStack card={card} turn={1} depth={1} onRate={onRate} />);
  expect(screen.getByLabelText(/^Question:/)).toBeTruthy();
});

it('rates a card only once, however fast the input repeats', async () => {
  const { onRate } = await setup();
  const target = screen.getByLabelText(/^Question:/);
  await fireEvent(target, 'accessibilityAction', { nativeEvent: { actionName: 'good' } });
  await fireEvent(target, 'accessibilityAction', { nativeEvent: { actionName: 'good' } });
  expect(onRate).toHaveBeenCalledTimes(1);
});
