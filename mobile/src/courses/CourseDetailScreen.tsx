import { dueCards } from '@bonamind/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../data/auth';
import { useCards, useDecks } from '../data/hooks';
import { PaperCard } from '../design/components/PaperCard';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { ProgressBar } from '../design/components/ProgressBar';
import { colors, fonts, radius, space } from '../design/tokens';
import { useNow } from '../hooks/useNow';

/** A card whose next interval is three weeks or more is counted as mastered. */
export const MASTERED_INTERVAL_DAYS = 21;

export function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const now = useNow();
  const deck = (useDecks(userId).data ?? []).find((d) => d.id === id);
  const cards = (useCards(userId).data ?? []).filter((c) => c.deckId === id);
  const due = dueCards(cards, now).length;
  const mastered = cards.filter((c) => (c.interval ?? 0) >= MASTERED_INTERVAL_DAYS).length;
  const total = cards.length || deck?.cardCount || 0;

  return (
    <>
      <Stack.Screen options={{ title: deck?.title ?? 'Course' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {!!deck?.description && (
          <PaperCard><Text style={styles.description}>{deck.description}</Text></PaperCard>
        )}
        <View style={styles.tiles}>
          <View style={styles.tile}><Text style={[styles.tileValue, { color: colors.violetMist }]}>{`${due} due`}</Text></View>
          <View style={styles.tile}><Text style={[styles.tileValue, { color: colors.good }]}>{`${mastered} mastered`}</Text></View>
        </View>
        <ProgressBar value={total ? mastered / total : 0} color={colors.good} />
        <PrimaryButton label="Study this course" onPress={() => router.push(`/study/${id}`)} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120, gap: space.md },
  description: { color: colors.ink, fontFamily: fonts.ui, fontSize: 15, lineHeight: 22 },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.md },
  tileValue: { fontFamily: fonts.display, fontSize: 26 },
});
