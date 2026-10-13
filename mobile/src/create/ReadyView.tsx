import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Confetti } from '../design/components/Confetti';
import { PaperCard } from '../design/components/PaperCard';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { SecondaryButton } from '../design/components/SecondaryButton';
import { haptic } from '../design/haptics';
import { useMotion } from '../design/motion';
import { colors, fonts, space } from '../design/tokens';
import { useCreateStore } from './store';

/** The saved moment: a check, confetti, and straight into the first review. */
export function ReadyView({ onStudy, onDone }: { onStudy(): void; onDone(): void }) {
  const { reduce } = useMotion();
  const { width } = useWindowDimensions();
  const draft = useCreateStore((s) => s.draft);
  const count = draft?.cards.length ?? 0;

  useEffect(() => { haptic('success'); }, []);

  return (
    <View style={styles.wrap}>
      <Animated.View entering={reduce ? undefined : ZoomIn.springify().damping(10)} style={styles.check}>
        <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} size={72} tintColor={colors.good} />
      </Animated.View>
      <Text style={styles.title} accessibilityRole="header">Course ready</Text>
      <Text style={styles.body}>{`${count} ${count === 1 ? 'card' : 'cards'} in ${draft?.title ?? 'your course'}`}</Text>
      <PaperCard style={styles.note}><Text style={styles.noteText}>Also on bonamind.app</Text></PaperCard>
      <View style={styles.actions}>
        <PrimaryButton label="Study now" onPress={onStudy} />
        <SecondaryButton label="Done" onPress={onDone} />
      </View>
      {!reduce && <Confetti trigger={1} origin={{ x: width / 2, y: 200 }} mode="burst" />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space.xl, gap: space.md, alignItems: 'center' },
  check: { marginTop: space.xxl },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 36 },
  body: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 16, textAlign: 'center' },
  note: { alignSelf: 'stretch', marginTop: space.md },
  noteText: { color: colors.ink, fontFamily: fonts.display, fontSize: 18, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: space.md, marginTop: 'auto' },
});
