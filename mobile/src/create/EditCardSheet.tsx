import type { DraftCard } from '@bonamind/core';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { SecondaryButton } from '../design/components/SecondaryButton';
import { useMotion } from '../design/motion';
import { colors, fonts, radius, space } from '../design/tokens';

/** Edit one generated card's question and answer before the course is saved. */
export function EditCardSheet({ card, onSave, onCancel }: { card: DraftCard; onSave(c: DraftCard): void; onCancel(): void }) {
  const { reduce } = useMotion();
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const valid = front.trim().length > 0 && back.trim().length > 0;
  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(200)} exiting={reduce ? undefined : FadeOut.duration(150)} style={styles.scrim}>
      <Animated.View entering={reduce ? undefined : SlideInDown.springify().damping(16)} style={styles.sheet}>
        <Text style={styles.title} accessibilityRole="header">Edit card</Text>
        <TextInput accessibilityLabel="Question" value={front} onChangeText={setFront} multiline style={styles.input} placeholderTextColor={colors.textMuted} placeholder="Question" />
        <TextInput accessibilityLabel="Answer" value={back} onChangeText={setBack} multiline style={styles.input} placeholderTextColor={colors.textMuted} placeholder="Answer" />
        <View style={!valid && styles.dim}>
          <PrimaryButton label="Save card" onPress={() => { if (valid) onSave({ front: front.trim(), back: back.trim() }); }} />
        </View>
        <SecondaryButton label="Cancel" onPress={onCancel} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.raised, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space.xl, gap: space.md },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 26 },
  input: {
    backgroundColor: colors.surface, color: colors.text, fontFamily: fonts.ui, fontSize: 16, borderRadius: radius.tile,
    paddingHorizontal: space.lg, paddingVertical: 12, minHeight: 64, textAlignVertical: 'top',
  },
  dim: { opacity: 0.5 },
});
