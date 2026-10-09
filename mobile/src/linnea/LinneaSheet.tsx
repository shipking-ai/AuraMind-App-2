import { LINNEA_CHIPS, TUTOR_NAME } from '@bonamind/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { useAuth } from '../data/auth';
import { useCards, useDisplayName } from '../data/hooks';
import { GlassButton } from '../design/components/GlassButton';
import { haptic } from '../design/haptics';
import { useMotion } from '../design/motion';
import { colors, fonts, radius, space } from '../design/tokens';
import { useLinneaChat, type ChatItem } from './useLinneaChat';

function Orb() {
  const { reduce } = useMotion();
  const breathe = useSharedValue(1);
  const ripple = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    breathe.set(withRepeat(withSequence(withTiming(1.12, { duration: 1000 }), withTiming(1, { duration: 1000 })), -1));
    ripple.set(withRepeat(withTiming(1, { duration: 2000 }), -1));
  }, [reduce, breathe, ripple]);
  const core = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }));
  const ring = useAnimatedStyle(() => ({ opacity: 0.7 * (1 - ripple.value), transform: [{ scale: 1 + 1.4 * ripple.value }] }));
  return (
    <View style={styles.orbBox}>
      {!reduce && <Animated.View style={[styles.ring, ring]} />}
      <Animated.View style={[styles.orb, core]}><Text style={styles.orbLetter}>L</Text></Animated.View>
    </View>
  );
}

function Dots() {
  const { reduce } = useMotion();
  return (
    <View style={styles.dots} accessibilityLabel={`${TUTOR_NAME} is typing`}>
      {[0, 1, 2].map((i) => <Dot key={i} delay={i * 150} still={reduce} />)}
    </View>
  );
}

function Dot({ delay, still }: { delay: number; still: boolean }) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    y.set(withDelay(delay, withRepeat(withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 300 })), -1)));
  }, [delay, still, y]);
  const s = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[styles.dot, s]} />;
}

function Message({ m, onRetry }: { m: ChatItem; onRetry(): void }) {
  const { reduce } = useMotion();
  const enter = reduce ? undefined : FadeInUp.springify().damping(15);
  if (m.role === 'user') {
    return <Animated.View entering={enter} style={styles.userBubble}><Text style={styles.userText}>{m.text}</Text></Animated.View>;
  }
  return (
    <Animated.View entering={enter} style={styles.linneaRow}>
      {m.state === 'streaming' && !m.text ? <Dots /> : <Text style={styles.linneaText}>{m.text}</Text>}
      {m.state === 'error' && (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.chip}><Text style={styles.chipText}>Try again</Text></Pressable>
      )}
    </Animated.View>
  );
}

export function LinneaSheet() {
  const { userId } = useAuth();
  const cards = useCards(userId).data ?? [];
  const name = useDisplayName(userId).data;
  const weak = useMemo(() => [...cards].sort((a, b) => (b.lapses ?? 0) - (a.lapses ?? 0)).slice(0, 3).filter((c) => (c.lapses ?? 0) > 0), [cards]);
  const { messages, send, retry, streaming } = useLinneaChat({
    userId: userId ?? 'anon',
    firstName: name?.split(' ')[0] ?? null,
    weak,
  });
  const [draft, setDraft] = useState('');
  const list = useRef<FlatList<ChatItem>>(null);
  const showChips = !streaming && messages.at(-1)?.role === 'linnea';
  const submit = (text: string) => { haptic('light'); send(text); setDraft(''); };

  return (
    <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Orb />
        <View>
          <Text style={styles.name}>{TUTOR_NAME}</Text>
          <Text style={styles.sub}>{streaming ? 'Thinking…' : 'Drag up for the full conversation'}</Text>
        </View>
      </View>
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <Message m={item} onRetry={retry} />}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={showChips ? (
          <View style={styles.chips}>
            {LINNEA_CHIPS.map((c) => (
              <Pressable key={c} accessibilityRole="button" onPress={() => submit(c)} style={styles.chip}><Text style={styles.chipText}>{c}</Text></Pressable>
            ))}
          </View>
        ) : null}
      />
      <View style={styles.composer}>
        <TextInput
          value={draft} onChangeText={setDraft} placeholder={`Ask ${TUTOR_NAME}`} placeholderTextColor={colors.textMuted}
          style={styles.input} multiline accessibilityLabel={`Message ${TUTOR_NAME}`}
        />
        <GlassButton symbol={{ ios: 'arrow.up', android: 'arrow_upward' }} label="Send" onPress={() => submit(draft)} tint={colors.text} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingTop: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.sm },
  orbBox: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.violetSoft },
  orb: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center' },
  orbLetter: { color: '#fff', fontFamily: fonts.display, fontSize: 19 },
  name: { color: colors.text, fontFamily: fonts.uiBold, fontSize: 16 },
  sub: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 12 },
  list: { padding: space.lg, gap: space.md },
  linneaRow: { gap: space.sm },
  linneaText: { color: '#EDE9FE', fontFamily: fonts.displayItalic, fontSize: 19, lineHeight: 25 },
  userBubble: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: colors.violet, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 9 },
  userText: { color: '#fff', fontFamily: fonts.ui, fontSize: 15 },
  dots: { flexDirection: 'row', gap: 4, paddingVertical: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.violetMist },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  chip: { alignSelf: 'flex-start', backgroundColor: 'rgba(124,58,237,0.25)', borderColor: 'rgba(167,139,250,0.4)', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 7 },
  chipText: { color: '#DDD6FE', fontFamily: fonts.ui, fontSize: 13 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.md, paddingBottom: space.xl },
  input: {
    flex: 1, maxHeight: 120, color: colors.text, fontFamily: fonts.ui, fontSize: 16, backgroundColor: colors.surface,
    borderRadius: 20, paddingHorizontal: space.lg, paddingTop: 10, paddingBottom: 10,
  },
});
