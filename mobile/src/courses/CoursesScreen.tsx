import { dueCards } from '@bonamind/core';
import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from '../data/auth';
import { useCards, useDecks } from '../data/hooks';
import { PaperCard } from '../design/components/PaperCard';
import { ProgressBar } from '../design/components/ProgressBar';
import { SecondaryButton } from '../design/components/SecondaryButton';
import { SerifTitle } from '../design/components/SerifTitle';
import { useMotion } from '../design/motion';
import { colors, confettiColors, fonts, space } from '../design/tokens';
import { env } from '../env';
import { useNow } from '../hooks/useNow';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function CoursesScreen() {
  const { userId } = useAuth();
  const { reduce } = useMotion();
  const decks = useDecks(userId).data ?? [];
  const cards = useCards(userId).data ?? [];
  const now = useNow();

  if (decks.length === 0) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <PaperCard>
          <SerifTitle size="card" color={colors.ink}>Create your first course on the web</SerifTitle>
          <Text style={styles.paperMeta}>Turn a PDF, a video or a topic into a course on bonamind.app. It appears here right away.</Text>
        </PaperCard>
        <SecondaryButton label="Open BonaMind on the web" onPress={() => void Linking.openURL(env.apiBaseUrl)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      {decks.map((d, i) => {
        const deckCards = cards.filter((c) => c.deckId === d.id);
        const due = dueCards(deckCards, now).length;
        const total = deckCards.length || d.cardCount;
        const reviewed = deckCards.filter((c) => (c.repetition ?? 0) > 0 || c.lastReviewed).length;
        return (
          <Animated.View key={d.id} entering={reduce ? undefined : FadeInDown.delay(i * 60).springify().damping(14).stiffness(160)}>
            <Pressable accessibilityRole="button" accessibilityLabel={d.title} onPress={() => router.push(`/courses/${d.id}`)}>
              <PaperCard style={styles.card}>
                <SerifTitle size="card" color={colors.ink}>{d.title}</SerifTitle>
                <Text style={styles.paperMeta}>{`${due > 0 ? `${due} due` : 'Up to date'} · ${plural(total, 'card')}`}</Text>
                <ProgressBar value={total ? reviewed / total : 0} color={confettiColors[i % confettiColors.length]} />
              </PaperCard>
            </Pressable>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120, gap: space.md },
  card: { gap: space.sm },
  paperMeta: { color: '#57534E', fontFamily: fonts.ui, fontSize: 13 },
});
