import type { DraftCard } from '@bonamind/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn, FadeOut, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming, type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useAuth } from '../data/auth';
import { PaperCard } from '../design/components/PaperCard';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { SecondaryButton } from '../design/components/SecondaryButton';
import { haptic } from '../design/haptics';
import { useMotion } from '../design/motion';
import { colors, fonts, radius, space } from '../design/tokens';
import { FaceBody, SWIPE_DISTANCE, SWIPE_VELOCITY } from '../study/CardStack';
import { CREATE_COPY } from './copy';
import { EditCardSheet } from './EditCardSheet';
import { useCreateStore } from './store';

const UNDO_MS = 4_000;
const ROTATE_DIVISOR = 14;

/** One generated card: swipe right to keep, left to remove, tap to flip, hold to edit. */
function ReviewCard({ card, onKeep, onRemove, onEdit }: { card: DraftCard; onKeep(): void; onRemove(): void; onEdit(): void }) {
  const { reduce } = useMotion();
  const [flipped, setFlipped] = useState(false);
  const tx = useSharedValue(0);

  const flip = () => { haptic('light'); setFlipped((f) => !f); };
  const keep = () => { haptic('success'); onKeep(); };
  const remove = () => { haptic('warning'); onRemove(); };
  const edit = () => { haptic('selection'); onEdit(); };

  const pan = Gesture.Pan()
    .withTestId('review-pan')
    .onUpdate((e) => { tx.value = e.translationX; })
    .onEnd((e) => {
      if (e.translationX > SWIPE_DISTANCE || e.velocityX > SWIPE_VELOCITY) scheduleOnRN(keep);
      else if (e.translationX < -SWIPE_DISTANCE || e.velocityX < -SWIPE_VELOCITY) scheduleOnRN(remove);
      else tx.value = withSpring(0, { damping: 12, stiffness: 160 });
    });
  const tap = Gesture.Tap().withTestId('review-tap').onEnd(() => scheduleOnRN(flip));
  const long = Gesture.LongPress().minDuration(350).withTestId('review-long').onStart(() => scheduleOnRN(edit));
  const gesture = Gesture.Race(pan, Gesture.Exclusive(long, tap));

  const drag = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { rotate: `${tx.value / ROTATE_DIVISOR}deg` }] }));
  const keepStamp = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [0, SWIPE_DISTANCE], [0, 1], 'clamp') }));
  const removeStamp = useAnimatedStyle(() => ({ opacity: interpolate(-tx.value, [0, SWIPE_DISTANCE], [0, 1], 'clamp') }));
  const exiting: EntryExitAnimationFunction = () => {
    'worklet';
    const toX = tx.value >= 0 ? 520 : -520;
    return {
      initialValues: { opacity: 1, transform: [{ translateX: tx.value }, { rotate: `${tx.value / ROTATE_DIVISOR}deg` }] },
      animations: {
        opacity: withTiming(0, { duration: 360 }),
        transform: [{ translateX: withTiming(toX, { duration: 360 }) }, { rotate: withTiming(`${toX / 16}deg`, { duration: 360 }) }],
      },
    };
  };

  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'activate') flip();
    else if (name === 'keep') keep();
    else if (name === 'remove') remove();
    else if (name === 'edit') edit();
  };

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.card, drag]}
        exiting={reduce ? FadeOut.duration(180) : exiting}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={flipped ? `Answer: ${card.back}` : `Question: ${card.front}`}
        accessibilityActions={[{ name: 'activate', label: 'Flip card' }, { name: 'keep', label: 'Keep' }, { name: 'remove', label: 'Remove' }, { name: 'edit', label: 'Edit' }]}
        onAccessibilityAction={onAction}
      >
        <Text style={styles.label}>{flipped ? 'Answer' : 'Question'}</Text>
        <FaceBody testID="review-face">
          <Text style={flipped ? styles.back : styles.front}>{flipped ? card.back : card.front}</Text>
        </FaceBody>
        <Text style={styles.hint}>Tap to flip · hold to edit</Text>
        <Animated.Text style={[styles.stamp, styles.stampKeep, keepStamp]}>Keep</Animated.Text>
        <Animated.Text style={[styles.stamp, styles.stampRemove, removeStamp]}>Remove</Animated.Text>
      </Animated.View>
    </GestureDetector>
  );
}

/** Look through the generated cards, drop or fix any, rename, then save. */
export function ReviewDeck() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const { reduce } = useMotion();
  const draft = useCreateStore((s) => s.draft);
  const phase = useCreateStore((s) => s.phase);
  const error = useCreateStore((s) => s.error);
  const { removeCard, restoreCard, editCard, rename, save } = useCreateStore.getState();

  const [at, setAt] = useState(0);
  const [undo, setUndo] = useState<{ i: number; card: DraftCard } | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(id);
  }, [undo]);

  if (!draft) return null;
  const cards = draft.cards;
  const current = at < cards.length ? cards[at] : null;
  const partial = draft.truncated || draft.skippedPieces > 0;

  const onRemove = () => {
    setUndo({ i: at, card: cards[at] });
    removeCard(at);
  };
  const onUndo = () => {
    if (!undo) return;
    restoreCard(undo.i, undo.card);
    setAt(undo.i);
    setUndo(null);
  };
  const onSave = () => {
    if (!userId || !cards.length || phase === 'saving') return;
    // The new course and its cards show up in Courses and Today straight away.
    void save(userId, () => {
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
      void queryClient.invalidateQueries({ queryKey: ['cards'] });
    });
  };

  const saveLabel = phase === 'saving' ? 'Saving…' : error ? CREATE_COPY.saveRetry : 'Save course';

  return (
    <View style={styles.wrap}>
      <TextInput
        accessibilityLabel="Course title" value={draft.title} onChangeText={rename} style={styles.title}
        placeholder="Course title" placeholderTextColor={colors.textMuted}
      />
      <Text style={styles.sub}>{`${cards.length} ${cards.length === 1 ? 'card' : 'cards'} · swipe away any you don't want`}</Text>
      {partial && <Text style={styles.note}>{CREATE_COPY.partial}</Text>}

      <View style={styles.stage}>
        {current ? (
          <ReviewCard key={`${at}:${cards.length}`} card={current} onKeep={() => setAt((i) => i + 1)} onRemove={onRemove} onEdit={() => setEditing(true)} />
        ) : (
          <Animated.View entering={reduce ? undefined : FadeIn.duration(300)} style={styles.endWrap}>
            <PaperCard>
              <Text style={styles.endText}>
                {cards.length ? `All ${cards.length} cards reviewed` : 'Every card was removed. Keep at least one to save.'}
              </Text>
            </PaperCard>
          </Animated.View>
        )}
      </View>

      {undo && (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(200)} exiting={reduce ? undefined : FadeOut.duration(200)} style={styles.undoWrap}>
          <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={onUndo} style={styles.undo}>
            <Text style={styles.undoText}>Card removed · Undo</Text>
          </Pressable>
        </Animated.View>
      )}

      {error && <Text style={styles.error} accessibilityLiveRegion="polite">{CREATE_COPY.errors[error]}</Text>}
      <View style={styles.actions}>
        {current && <SecondaryButton label="Keep all" onPress={() => setAt(cards.length)} />}
        <PrimaryButton label={saveLabel} onPress={onSave} />
      </View>

      {editing && current && (
        <EditCardSheet card={current} onCancel={() => setEditing(false)} onSave={(c) => { editCard(at, c); setEditing(false); }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, gap: space.sm },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 28, paddingVertical: 4 },
  sub: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 14 },
  note: { color: colors.hard, fontFamily: fonts.ui, fontSize: 13 },
  stage: { flex: 1, minHeight: 300, marginVertical: space.md },
  card: { ...StyleSheet.absoluteFill, backgroundColor: colors.paper, borderRadius: radius.card, padding: space.xl, borderCurve: 'continuous' },
  label: { color: colors.inkMuted, fontFamily: fonts.ui, fontSize: 12 },
  front: { color: colors.ink, fontFamily: fonts.display, fontSize: 28, lineHeight: 33 },
  back: { color: '#5B21B6', fontFamily: fonts.display, fontSize: 30, lineHeight: 35 },
  hint: { color: '#A8A29E', fontFamily: fonts.ui, fontSize: 12, textAlign: 'center' },
  stamp: { position: 'absolute', top: 24, fontFamily: fonts.uiBold, fontSize: 18, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 2.5, borderRadius: 9 },
  stampKeep: { left: 20, color: colors.good, borderColor: colors.good, transform: [{ rotate: '-14deg' }] },
  stampRemove: { right: 20, color: colors.again, borderColor: colors.again, transform: [{ rotate: '14deg' }] },
  endWrap: { flex: 1, justifyContent: 'center' },
  endText: { color: colors.ink, fontFamily: fonts.display, fontSize: 24, textAlign: 'center' },
  undoWrap: { alignItems: 'center' },
  undo: { backgroundColor: colors.raised, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  undoText: { color: colors.text, fontFamily: fonts.uiBold, fontSize: 14 },
  error: { color: colors.again, fontFamily: fonts.ui, fontSize: 14 },
  actions: { gap: space.md },
});
