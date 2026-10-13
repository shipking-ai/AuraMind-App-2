import { dueCards } from '@bonamind/core';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useCreateStore } from '../create/store';
import { useAuth } from '../data/auth';
import { useCards, useDecks } from '../data/hooks';
import { GlassButton } from '../design/components/GlassButton';
import { PaperCard } from '../design/components/PaperCard';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { ProgressBar } from '../design/components/ProgressBar';
import { SecondaryButton } from '../design/components/SecondaryButton';
import { SerifTitle } from '../design/components/SerifTitle';
import { useMotion } from '../design/motion';
import { colors, confettiColors, fonts, space } from '../design/tokens';
import { env } from '../env';
import { useNow } from '../hooks/useNow';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const newCourse = () => router.push('/create');
/** How long a course made on the phone stays marked new. */
export const NEW_HIGHLIGHT_MS = 8_000;

export function CoursesScreen() {
  const { userId } = useAuth();
  const { reduce } = useMotion();
  const decks = useDecks(userId).data ?? [];
  const cards = useCards(userId).data ?? [];
  const now = useNow();
  // A course just made on the phone goes first and is marked new for a few
  // seconds. Subscribed, not read once: this tab stays mounted while the
  // create sheet is open over it.
  const fresh = useCreateStore((s) => s.justCreated);
  useEffect(() => {
    if (!fresh) return;
    const id = setTimeout(() => useCreateStore.getState().clearJustCreated(), NEW_HIGHLIGHT_MS);
    return () => clearTimeout(id);
  }, [fresh]);
  const ordered = fresh ? [...decks].sort((a, b) => Number(b.id === fresh) - Number(a.id === fresh)) : decks;

  const header = (
    <Stack.Screen
      options={{ headerRight: () => <GlassButton symbol={{ ios: 'plus', android: 'add' }} label="New course" onPress={newCourse} /> }}
    />
  );

  if (decks.length === 0) {
    return (
      <>
        {header}
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          <PaperCard style={styles.card}>
            <SerifTitle size="card" color={colors.ink}>Make your first course</SerifTitle>
            <Text style={styles.paperMeta}>Turn a topic, a link, a PDF or a photo of your notes into cards.</Text>
          </PaperCard>
          <PrimaryButton label="Make a course" onPress={newCourse} />
          <SecondaryButton label="Open BonaMind on the web" onPress={() => void Linking.openURL(env.apiBaseUrl)} />
        </ScrollView>
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {ordered.map((d, i) => {
          const deckCards = cards.filter((c) => c.deckId === d.id);
          const due = dueCards(deckCards, now).length;
          const total = deckCards.length || d.cardCount;
          const reviewed = deckCards.filter((c) => (c.repetition ?? 0) > 0 || c.lastReviewed).length;
          const isNew = d.id === fresh;
          return (
            <Animated.View key={d.id} entering={reduce ? undefined : FadeInDown.delay(i * 60).springify().damping(14).stiffness(160)}>
              <Pressable accessibilityRole="button" accessibilityLabel={isNew ? `${d.title}, new` : d.title} onPress={() => router.push(`/courses/${d.id}`)}>
                <PaperCard style={[styles.card, isNew && styles.fresh]}>
                  <View style={styles.titleRow}>
                    <View style={styles.flex}><SerifTitle size="card" color={colors.ink}>{d.title}</SerifTitle></View>
                    {isNew && <Text style={styles.badge}>New</Text>}
                  </View>
                  <Text style={styles.paperMeta}>{`${due > 0 ? `${due} due` : 'Up to date'} · ${plural(total, 'card')}`}</Text>
                  <ProgressBar value={total ? reviewed / total : 0} color={confettiColors[i % confettiColors.length]} />
                </PaperCard>
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120, gap: space.md },
  card: { gap: space.sm },
  fresh: { borderWidth: 2, borderColor: colors.violetSoft },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  badge: { color: '#fff', backgroundColor: colors.violet, fontFamily: fonts.uiBold, fontSize: 12, borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3 },
  paperMeta: { color: '#57534E', fontFamily: fonts.ui, fontSize: 13 },
});
