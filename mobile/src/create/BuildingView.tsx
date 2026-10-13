import type { BuildProgress } from '@bonamind/core';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Prism } from '../design/components/LoadingScreen';
import { PaperCard } from '../design/components/PaperCard';
import { ProgressBar } from '../design/components/ProgressBar';
import { haptic } from '../design/haptics';
import { useMotion } from '../design/motion';
import { colors, fonts, space } from '../design/tokens';
import { CREATE_COPY } from './copy';
import { useCreateStore } from './store';

const ORDER: BuildProgress['step'][] = ['reading', 'ideas', 'writing', 'done'];

function Step({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  const { reduce } = useMotion();
  return (
    <Animated.View
      entering={reduce ? undefined : FadeIn.duration(300)}
      style={styles.step}
      accessible
      accessibilityLabel={done ? `${label}, done` : label}
    >
      {done
        ? <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} size={18} tintColor={colors.good} />
        : <View style={[styles.dot, active && styles.dotActive]} />}
      <Text style={[styles.stepText, active && styles.stepActive]}>{label}</Text>
    </Animated.View>
  );
}

/** Live progress: real steps ticking off, and each new card landing on paper. */
export function BuildingView() {
  const { reduce } = useMotion();
  const phase = useCreateStore((s) => s.phase);
  const progress = useCreateStore((s) => s.progress);
  const step = progress?.step ?? 'reading';
  const at = ORDER.indexOf(step);
  const cards = progress?.cardsSoFar ?? 0;
  const target = progress?.target ?? 0;

  // A light tick each time a step finishes.
  const last = useRef(at);
  useEffect(() => {
    if (at > last.current) haptic('selection');
    last.current = at;
  }, [at]);

  const writing = phase === 'waiting'
    ? CREATE_COPY.waiting
    : step === 'writing' || step === 'done' ? `Writing card ${Math.min(cards, target)} of ${target}` : 'Writing your cards';

  return (
    <View style={styles.wrap}>
      <View style={styles.prism}><Prism still={reduce} /></View>
      <Text style={styles.title} accessibilityRole="header">Building your course</Text>
      <View style={styles.steps}>
        <Step label="Reading your source" done={at > 0} active={at === 0} />
        <Step label="Finding key ideas" done={at > 1} active={at === 1} />
        <Step label={writing} done={at > 2} active={at === 2} />
        <ProgressBar value={target ? cards / target : 0} color={colors.violetSoft} />
      </View>
      {progress?.latest && (
        <Animated.View key={progress.latest.front} entering={reduce ? undefined : FadeInDown.springify().damping(14)} style={styles.latest}>
          <PaperCard><Text style={styles.latestText} numberOfLines={3}>{progress.latest.front}</Text></PaperCard>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space.xl, gap: space.lg, alignItems: 'center' },
  prism: { marginTop: space.lg },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 30, textAlign: 'center' },
  steps: { alignSelf: 'stretch', gap: space.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.hairline },
  dotActive: { borderColor: colors.violetSoft },
  stepText: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 16 },
  stepActive: { color: colors.violetMist },
  latest: { alignSelf: 'stretch', marginTop: 'auto' },
  latestText: { color: colors.ink, fontFamily: fonts.display, fontSize: 20, lineHeight: 25 },
});
