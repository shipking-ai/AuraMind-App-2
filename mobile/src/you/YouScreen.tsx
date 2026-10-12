import { computeStreak } from '@bonamind/core';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { getOutbox } from '../data/app';
import { signOut, useAuth } from '../data/auth';
import { useDisplayName, useSessions } from '../data/hooks';
import { useSync } from '../data/sync';
import { PaperCard } from '../design/components/PaperCard';
import { SecondaryButton } from '../design/components/SecondaryButton';
import { useSettings } from '../design/settings';
import { colors, fonts, radius, space } from '../design/tokens';
import { env } from '../env';
import { useNow } from '../hooks/useNow';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function YouScreen() {
  const { userId, session } = useAuth();
  const now = useNow();
  const name = useDisplayName(userId).data || session?.user.email?.split('@')[0] || 'You';
  const streak = computeStreak(useSessions(userId).data ?? [], new Date(now));
  const { flushNow } = useSync(userId);
  const hapticsEnabled = useSettings((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettings((s) => s.setHapticsEnabled);

  async function onSignOut() {
    await flushNow();
    const waiting = userId ? await getOutbox().pending(userId) : 0;
    if (waiting === 0) return void signOut();
    Alert.alert(
      'Reviews waiting to sync',
      `You have ${plural(waiting, 'review')} waiting to sync. They'll upload next time you sign in to this account.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => void signOut() }],
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <PaperCard style={styles.who}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.streak}>{`${plural(streak, 'day')} streak`}</Text>
      </PaperCard>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Haptics</Text>
        <Switch
          accessibilityLabel="Haptics"
          accessibilityRole="switch"
          value={hapticsEnabled}
          onValueChange={setHapticsEnabled}
          trackColor={{ true: colors.violet, false: colors.raised }}
        />
      </View>
      <SecondaryButton label="Open BonaMind on the web" onPress={() => void Linking.openURL(env.apiBaseUrl)} />
      <SecondaryButton label="Sign out" onPress={() => void onSignOut()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120, gap: space.md },
  who: { gap: space.xs },
  name: { color: colors.ink, fontFamily: fonts.display, fontSize: 32 },
  streak: { color: colors.inkMuted, fontFamily: fonts.ui, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.lg, paddingVertical: space.md },
  rowLabel: { color: colors.text, fontFamily: fonts.ui, fontSize: 16 },
});
