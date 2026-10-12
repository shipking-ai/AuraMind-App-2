import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../data/auth';
import { useCards, useDecks } from '../data/hooks';
import { colors, fonts, radius, space } from '../design/tokens';
import { searchLibrary } from '../today/summary';

type Row = { key: string; title: string; meta: string; href: `/courses/${string}` };

/** Native search bar (glass on iOS 26) over the cached library. */
export function SearchScreen() {
  const { userId } = useAuth();
  const [q, setQ] = useState('');
  const decks = useDecks(userId).data ?? [];
  const cards = useCards(userId).data ?? [];
  const hits = searchLibrary(decks, cards, q);
  const deckTitle = new Map(decks.map((d) => [d.id, d.title]));
  const rows: Row[] = [
    ...hits.decks.map((d) => ({ key: `d${d.id}`, title: d.title, meta: 'Course', href: `/courses/${d.id}` as const })),
    ...hits.cards.slice(0, 50).map((c) => ({ key: `c${c.id}`, title: c.front, meta: deckTitle.get(c.deckId) ?? 'Card', href: `/courses/${c.deckId}` as const })),
  ];
  return (
    <>
      <Stack.Screen options={{ headerSearchBarOptions: { placeholder: 'Cards and courses', onChangeText: (e) => setQ(e.nativeEvent.text) } }} />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={styles.list}
        ListEmptyComponent={q ? <Text style={styles.empty}>Nothing matches “{q}”.</Text> : null}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push(item.href)} style={styles.row}>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            <View><Text style={styles.meta}>{item.meta}</Text></View>
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg, paddingBottom: 120, gap: space.sm },
  row: { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.md, gap: space.xs },
  title: { color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  meta: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 12 },
  empty: { color: colors.textMuted, fontFamily: fonts.ui, textAlign: 'center', marginTop: space.xl },
});
