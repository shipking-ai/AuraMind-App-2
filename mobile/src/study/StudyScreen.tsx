import { computeStreak, DEFAULT_TARGET_RETENTION, dueCards, Rating, type Card, type ScheduleOptions, type StudySession as SessionRow } from '@bonamind/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useReducer, useState } from 'react';
import { AppState, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getOutbox } from '../data/app';
import { useAuth } from '../data/auth';
import { useCards, useDecks, useFsrsProfile, useSessions } from '../data/hooks';
import { getSyncEngine, useSync } from '../data/sync';
import { auroraWarmth } from '../design/components/AuroraBackground';
import { Confetti } from '../design/components/Confetti';
import { GlassButton } from '../design/components/GlassButton';
import { PaperCard } from '../design/components/PaperCard';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { ProgressBar } from '../design/components/ProgressBar';
import { colors, fonts, space } from '../design/tokens';
import { CardStack } from './CardStack';
import { Celebration } from './Celebration';
import { createStudySession } from './session';
import { useCloseOnLeave } from './useCloseOnLeave';

const queued = async (p: Promise<void>) => { await p; getSyncEngine().notifyEnqueued(); };

export function StudyScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const { userId } = useAuth();
  const cardsQuery = useCards(userId);
  const fsrs = useFsrsProfile(userId);
  const sessions = useSessions(userId).data;
  const deck = (useDecks(userId).data ?? []).find((d) => d.id === deckId);
  const { online } = useSync(userId);
  // Online, the queue is built from a fresh fetch, not the launch snapshot,
  // so cards studied on the website meanwhile aren't reviewed again.
  const fresh = !online || cardsQuery.isFetchedAfterMount || cardsQuery.isError;
  const fsrsReady = !online || fsrs.isFetchedAfterMount || fsrs.isError;
  const cards = cardsQuery.data;
  if (!cards || !sessions || !userId || !fresh || !fsrsReady) return <View style={styles.fill} />;
  return (
    <StudyRun
      deckId={deckId} deckTitle={deck?.title} userId={userId} cards={cards} sessions={sessions}
      schedule={{ weightsOverride: fsrs.data?.weights, profileLabel: fsrs.data?.profileLabel ?? null, retention: DEFAULT_TARGET_RETENTION }}
    />
  );
}

function StudyRun({ deckId, deckTitle, userId, cards, sessions, schedule }: {
  deckId: string; deckTitle?: string; userId: string; cards: Card[]; sessions: SessionRow[]; schedule: ScheduleOptions;
}) {
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  // The queue is fixed when the session starts; later cache refreshes don't reshuffle it.
  const [start] = useState(() => {
    const now = Date.now();
    const due = dueCards(cards.filter((c) => c.deckId === deckId), now);
    return {
      total: due.length,
      streakBefore: computeStreak(sessions, new Date(now)),
      session: createStudySession({
        userId, deckId, cards: due, startedAt: now, schedule,
        deps: {
          enqueueReview: (u, r, p) => queued(getOutbox().enqueueReview(u, r, p)),
          enqueueSession: (u, s) => queued(getOutbox().enqueueSession(u, s)),
          newId: () => Crypto.randomUUID(),
        },
      }),
    };
  });
  const { session, total, streakBefore } = start;
  const [burst, setBurst] = useState(0);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useCloseOnLeave(session);

  // Killed or backgrounded mid-deck: the studied part is saved as its own session.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') void session.background(Date.now());
      if (s === 'active') session.resume(Date.now());
    });
    return () => sub.remove();
  }, [session]);

  useEffect(() => () => { auroraWarmth.set(withTiming(0, { duration: 800 })); }, []);

  async function rate(rating: Rating) {
    const card = session.current();
    const at = Date.now();
    const result = await session.rate(rating, at);
    if (session.isComplete()) setFinishedAt(at);
    if (card && result) {
      queryClient.setQueryData<Card[]>(['cards', userId], (all) => all?.map((c) => (c.id === card.id ? { ...c, ...result.update } : c)));
    }
    if (rating !== Rating.AGAIN) setBurst((b) => b + 1);
    auroraWarmth.set(withTiming(session.goodRatio(), { duration: 900 }));
    rerender();
  }

  async function close() {
    await session.close(Date.now());
    router.back();
  }

  if (session.isComplete()) {
    const now = finishedAt ?? session.startedAt;
    const finished: SessionRow = { id: 'local', userId, startTime: now };
    return session.rated() === 0 ? (
      <SafeAreaView style={styles.center}>
        <PaperCard style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyBody}>Nothing in {deckTitle ?? 'this course'} is due right now.</Text>
        </PaperCard>
        <PrimaryButton label="Done" onPress={() => router.back()} />
      </SafeAreaView>
    ) : (
      <SafeAreaView style={styles.fill}>
        <Celebration
          fromStreak={streakBefore}
          toStreak={computeStreak([...sessions, finished], new Date(now))}
          line="Nice work. I'll bring these back right before you'd forget them."
          onDone={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const left = session.left();
  return (
    <SafeAreaView style={styles.fill}>
      <View style={styles.top}>
        <GlassButton symbol={{ ios: 'xmark', android: 'close' }} label="Close" onPress={() => void close()} tint={colors.text} />
        <View style={styles.pill} accessibilityRole="progressbar" accessibilityLabel={`${left} left`}>
          <Text style={styles.pillText} numberOfLines={1}>{`${deckTitle ?? 'Review'} · ${left} left`}</Text>
          <ProgressBar value={total ? 1 - left / total : 0} color={colors.violetSoft} />
        </View>
      </View>
      <View style={styles.stack}>
        <CardStack card={session.current()} turn={session.rated()} depth={left} onRate={(r) => void rate(r)} />
      </View>
      <Confetti trigger={burst} origin={{ x: width / 2, y: 320 }} mode="burst" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.sm },
  pill: { flex: 1, gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: space.lg, paddingVertical: 8 },
  pillText: { color: colors.text, fontFamily: fonts.ui, fontSize: 12 },
  stack: { flex: 1, padding: space.xl, paddingBottom: 110 },
  emptyCard: { gap: space.sm },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 34 },
  emptyBody: { color: '#57534E', fontFamily: fonts.ui, fontSize: 15 },
});
