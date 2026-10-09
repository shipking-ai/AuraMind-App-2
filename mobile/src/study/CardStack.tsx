import { Rating, type Card } from '@bonamind/core';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeOut, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptic } from '../design/haptics';
import { useMotion } from '../design/motion';
import { colors, fonts, radius, space } from '../design/tokens';
import { RatingBar } from './RatingBar';

/** How far (pt) or how fast (pt/s) a swipe must go to count as a rating. */
export const SWIPE_DISTANCE = 90;
export const SWIPE_VELOCITY = 800;
const RUBBER_BAND = 0.22;
const ROTATE_DIVISOR = 13;

const A11Y_ACTIONS = [
  { name: 'activate', label: 'Flip card' },
  { name: 'again', label: 'Again' },
  { name: 'hard', label: 'Hard' },
  { name: 'good', label: 'Good' },
  { name: 'easy', label: 'Easy' },
];
const ACTION_RATING: Record<string, Rating> = { again: Rating.AGAIN, hard: Rating.HARD, good: Rating.GOOD, easy: Rating.EASY };

/** The deck: up to two papers peeking out behind the current card. */
export function CardStack({ card, turn, depth, onRate }: { card: Card | null; turn: number; depth: number; onRate(rating: Rating): void }) {
  const behind = Math.min(2, Math.max(0, depth - 1));
  return (
    <View style={styles.stage}>
      {behind >= 2 && <View style={[styles.paper, styles.behind2]} />}
      {behind >= 1 && <View style={[styles.paper, styles.behind1]} />}
      {/* Keyed by turn too: an Again card that comes straight back starts fresh. */}
      {card && <SwipeCard key={`${card.id}:${turn}`} card={card} onRate={onRate} />}
    </View>
  );
}

function decide(dx: number, dy: number, vx: number, vy: number): Rating | null {
  'worklet';
  if (dy < -SWIPE_DISTANCE || vy < -SWIPE_VELOCITY) return Rating.EASY;
  if (dx > SWIPE_DISTANCE || vx > SWIPE_VELOCITY) return Rating.GOOD;
  if (dx < -SWIPE_DISTANCE || vx < -SWIPE_VELOCITY) return Rating.AGAIN;
  return null;
}

function SwipeCard({ card, onRate }: { card: Card; onRate(rating: Rating): void }) {
  const { reduce, spring } = useMotion();
  const [flipped, setFlipped] = useState(false);
  const [barOpen, setBarOpen] = useState(false);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const turn = useSharedValue(0);
  const isFlipped = useSharedValue(0);
  const lastZone = useSharedValue(0);

  const flip = () => {
    const next = !flipped;
    setFlipped(next);
    isFlipped.set(next ? 1 : 0);
    turn.set(reduce ? withTiming(next ? 1 : 0, { duration: 180 }) : withSpring(next ? 1 : 0, spring('flip')));
    haptic('light');
  };
  const committed = useSharedValue(false);
  const commit = (rating: Rating) => {
    if (committed.get()) return; // one rating per card, however fast input repeats
    committed.set(true);
    haptic(rating === Rating.AGAIN ? 'warning' : 'success');
    onRate(rating);
  };
  const openBar = () => { if (flipped) { setBarOpen(true); haptic('selection'); } };
  const tick = () => haptic('selection');

  const pan = Gesture.Pan()
    .withTestId('card-pan')
    .onUpdate((e) => {
      const k = isFlipped.value ? 1 : RUBBER_BAND;
      tx.value = e.translationX * k;
      ty.value = e.translationY * k;
      const zone = isFlipped.value ? (decide(e.translationX, e.translationY, 0, 0) ?? 0) : 0;
      if (zone !== lastZone.value) {
        lastZone.value = zone;
        if (zone) scheduleOnRN(tick);
      }
    })
    .onEnd((e) => {
      const rating = isFlipped.value ? decide(e.translationX, e.translationY, e.velocityX, e.velocityY) : null;
      lastZone.value = 0;
      if (rating !== null) {
        scheduleOnRN(commit, rating);
        return;
      }
      tx.value = withSpring(0, { damping: 12, stiffness: 160 });
      ty.value = withSpring(0, { damping: 12, stiffness: 160 });
    });
  const tap = Gesture.Tap().withTestId('card-tap').onEnd(() => scheduleOnRN(flip));
  const long = Gesture.LongPress().minDuration(350).withTestId('card-long').onStart(() => scheduleOnRN(openBar));
  const gesture = Gesture.Race(pan, Gesture.Exclusive(long, tap));

  // The card leaves from wherever the thumb let go, in the direction rated.
  const exiting: EntryExitAnimationFunction = () => {
    'worklet';
    const x = tx.value;
    const y = ty.value;
    const up = y < -SWIPE_DISTANCE && Math.abs(y) > Math.abs(x);
    const toX = up ? x : x >= 0 ? 520 : -520;
    const toY = up ? -900 : y;
    return {
      initialValues: { opacity: 1, transform: [{ translateX: x }, { translateY: y }, { rotate: `${x / ROTATE_DIVISOR}deg` }] },
      animations: {
        opacity: withTiming(0, { duration: 420 }),
        transform: [
          { translateX: withTiming(toX, { duration: 420 }) },
          { translateY: withTiming(toY, { duration: 420 }) },
          { rotate: withTiming(`${toX / 15}deg`, { duration: 420 }) },
        ],
      },
    };
  };

  const drag = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotate: `${tx.value / ROTATE_DIVISOR}deg` }],
  }));
  const front = useAnimatedStyle(() =>
    reduce
      ? { opacity: 1 - turn.value }
      : { opacity: turn.value < 0.5 ? 1 : 0, transform: [{ perspective: 1000 }, { rotateY: `${turn.value * 180}deg` }] },
  );
  const back = useAnimatedStyle(() =>
    reduce
      ? { opacity: turn.value }
      : { opacity: turn.value >= 0.5 ? 1 : 0, transform: [{ perspective: 1000 }, { rotateY: `${turn.value * 180 - 180}deg` }] },
  );
  const good = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [0, SWIPE_DISTANCE], [0, 1], 'clamp') }));
  const again = useAnimatedStyle(() => ({ opacity: interpolate(-tx.value, [0, SWIPE_DISTANCE], [0, 1], 'clamp') }));
  const easy = useAnimatedStyle(() => ({ opacity: interpolate(-ty.value, [0, SWIPE_DISTANCE], [0, 1], 'clamp') }));

  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'activate') return flip();
    const rating = ACTION_RATING[name];
    if (rating !== undefined) commit(rating);
  };

  return (
    <>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[styles.card, drag]}
          exiting={reduce ? FadeOut.duration(180) : exiting}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={flipped ? `Answer: ${card.back}` : `Question: ${card.front}`}
          accessibilityHint="Double-tap to flip. Swipe up or down with the actions rotor to rate."
          accessibilityActions={A11Y_ACTIONS}
          onAccessibilityAction={onAction}
        >
          <Animated.View style={[styles.face, front]} pointerEvents={flipped ? 'none' : 'auto'}>
            <Text style={styles.label}>Question</Text>
            <ScrollView testID="card-front-scroll" contentContainerStyle={styles.faceBody}>
              <Text style={styles.front}>{card.front}</Text>
            </ScrollView>
            <Text style={styles.hint}>Tap to reveal</Text>
          </Animated.View>
          <Animated.View style={[styles.face, styles.faceBack, back]} pointerEvents={flipped ? 'auto' : 'none'}>
            <Text style={styles.label}>Answer</Text>
            <ScrollView contentContainerStyle={styles.faceBody}>
              <Text style={styles.back}>{card.back}</Text>
            </ScrollView>
            <Text style={styles.hint}>Swipe → good · ← again · ↑ easy · hold for more</Text>
          </Animated.View>
          <Animated.Text style={[styles.stamp, styles.stampGood, good]}>Good</Animated.Text>
          <Animated.Text style={[styles.stamp, styles.stampAgain, again]}>Again</Animated.Text>
          <Animated.Text style={[styles.stamp, styles.stampEasy, easy]}>Easy</Animated.Text>
        </Animated.View>
      </GestureDetector>
      {barOpen && <RatingBar onRate={(r) => { setBarOpen(false); commit(r); }} onDismiss={() => setBarOpen(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, minHeight: 360 },
  paper: { ...StyleSheet.absoluteFill, backgroundColor: colors.paper, borderRadius: radius.card },
  behind1: { transform: [{ translateY: 10 }, { scale: 0.94 }], opacity: 0.55 },
  behind2: { transform: [{ translateY: 20 }, { scale: 0.88 }], opacity: 0.3 },
  card: { ...StyleSheet.absoluteFill },
  face: {
    ...StyleSheet.absoluteFill, backgroundColor: colors.paper, borderRadius: radius.card, padding: space.xl,
    backfaceVisibility: 'hidden', borderCurve: 'continuous',
  },
  faceBack: {},
  faceBody: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.md },
  label: { color: colors.inkMuted, fontFamily: fonts.ui, fontSize: 12 },
  front: { color: colors.ink, fontFamily: fonts.display, fontSize: 28, lineHeight: 33 },
  back: { color: '#5B21B6', fontFamily: fonts.display, fontSize: 36, lineHeight: 40 },
  hint: { color: '#A8A29E', fontFamily: fonts.ui, fontSize: 12, textAlign: 'center' },
  stamp: { position: 'absolute', fontFamily: fonts.uiBold, fontSize: 18, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 2.5, borderRadius: 9 },
  stampGood: { top: 24, left: 20, color: colors.good, borderColor: colors.good, transform: [{ rotate: '-14deg' }] },
  stampAgain: { top: 24, right: 20, color: colors.again, borderColor: colors.again, transform: [{ rotate: '14deg' }] },
  stampEasy: { bottom: 56, alignSelf: 'center', color: colors.violetSoft, borderColor: colors.violetSoft },
});
