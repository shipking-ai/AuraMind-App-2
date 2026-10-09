import { router, Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from '../data/auth';
import { useCards, useDecks, useSessions } from '../data/hooks';
import { CountUp } from '../design/components/CountUp';
import { GlassButton } from '../design/components/GlassButton';
import { PaperCard } from '../design/components/PaperCard';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { ProgressBar } from '../design/components/ProgressBar';
import { SerifTitle } from '../design/components/SerifTitle';
import { useMotion } from '../design/motion';
import { colors, confettiColors, fonts, radius, space } from '../design/tokens';
import { minutesLabel, summarizeToday } from './summary';

const STAGGER_MS = 70;

export function TodayScreen() {
  const { userId } = useAuth();
  const { reduce } = useMotion();
  const decks = useDecks(userId).data ?? [];
  const cards = useCards(userId).data ?? [];
  const sessions = useSessions(userId).data ?? [];
  const s = summarizeToday(decks, cards, sessions, new Date());
  const rise = (i: number) => (reduce ? undefined : FadeInDown.delay(i * STAGGER_MS).springify().damping(14).stiffness(160));

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <GlassButton symbol={{ ios: 'sparkles', android: 'auto_awesome' }} label="Ask Prof. Linnea" lively onPress={() => router.push('/linnea')} />
          ),
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Animated.View entering={rise(0)}>
          <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        </Animated.View>

        <Animated.View entering={rise(1)}>
          <PaperCard>
            {s.due > 0 ? (
              <>
                <Text style={styles.paperLabel}>Due today</Text>
                <Text style={styles.dueCount}>
                  <CountUp to={s.due} /> cards
                </Text>
                <Text style={styles.paperMeta}>{minutesLabel(s.minutes)}</Text>
                <View style={styles.cta}>
                  <PrimaryButton label="Start review" onPress={() => s.topDeckId && router.push(`/study/${s.topDeckId}`)} />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.dueCount}>All caught up</Text>
                <Text style={styles.paperMeta}>Nothing is due. Prof. Linnea will bring cards back when they matter.</Text>
              </>
            )}
          </PaperCard>
        </Animated.View>

        <Animated.View entering={rise(2)} style={styles.tiles}>
          <View style={styles.tile}>
            <Text style={[styles.tileValue, { color: colors.streak }]}>{s.streak}</Text>
            <Text style={styles.tileLabel}>day streak</Text>
          </View>
          <View style={styles.tile}>
            <Text style={[styles.tileValue, { color: colors.good }]}>{s.recall === undefined ? '—' : `${Math.round(s.recall * 100)}%`}</Text>
            <Text style={styles.tileLabel}>recall this week</Text>
          </View>
        </Animated.View>

        {s.courses.length > 0 && (
          <Animated.View entering={rise(3)}>
            <SerifTitle size="title" style={styles.section}>Your courses</SerifTitle>
            {s.courses.map((c, i) => (
              <View key={c.deck.id} style={styles.course}>
                <View style={styles.courseRow}>
                  <Text style={styles.courseTitle} numberOfLines={1}>{c.deck.title}</Text>
                  <Text style={styles.courseMeta}>{c.due > 0 ? `${c.due} due` : 'Up to date'}</Text>
                </View>
                <ProgressBar value={c.total ? c.reviewed / c.total : 0} color={confettiColors[i % confettiColors.length]} />
              </View>
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120, gap: space.md },
  date: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 13 },
  paperLabel: { color: colors.inkMuted, fontFamily: fonts.ui, fontSize: 12 },
  dueCount: { color: colors.ink, fontFamily: fonts.display, fontSize: 44, lineHeight: 48 },
  paperMeta: { color: '#57534E', fontFamily: fonts.ui, fontSize: 13, marginTop: space.xs },
  cta: { marginTop: space.md },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.md },
  tileValue: { fontFamily: fonts.display, fontSize: 30 },
  tileLabel: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 12 },
  section: { marginTop: space.md, marginBottom: space.sm },
  course: { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.md, marginBottom: space.sm, gap: space.sm },
  courseRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  courseTitle: { color: colors.text, fontFamily: fonts.ui, fontSize: 15, flex: 1 },
  courseMeta: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 13 },
});
