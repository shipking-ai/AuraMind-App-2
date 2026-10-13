import { COURSE_SIZES, type CourseSize, type CourseSource } from '@bonamind/core';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../data/auth';
import { useSync } from '../data/sync';
import { AuroraBackground } from '../design/components/AuroraBackground';
import { GlassButton } from '../design/components/GlassButton';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { SecondaryButton } from '../design/components/SecondaryButton';
import { SegmentedControl } from '../design/components/SegmentedControl';
import { haptic } from '../design/haptics';
import { useMotion } from '../design/motion';
import { colors, fonts, radius, space } from '../design/tokens';
import { BuildingView } from './BuildingView';
import { CREATE_COPY } from './copy';
import { ReadyView } from './ReadyView';
import { ReviewDeck } from './ReviewDeck';
import {
  isHttpUrl, isYouTube, MAX_PHOTOS, pickPdf, pickPhotos, readLink, readPdf, readPhotos, readTopic,
  type PickedPdf, type PickedPhoto,
} from './sources';
import { useCreateStore } from './store';

type Kind = 'topic' | 'link' | 'pdf' | 'photo';

const SOURCES: { kind: Kind; label: string; symbol: SymbolViewProps['name']; tint: string }[] = [
  { kind: 'topic', label: 'Topic', symbol: { ios: 'sparkles', android: 'auto_awesome' }, tint: colors.violetSoft },
  { kind: 'link', label: 'Link or video', symbol: { ios: 'link', android: 'link' }, tint: colors.cyan },
  { kind: 'pdf', label: 'PDF', symbol: { ios: 'doc.text', android: 'description' }, tint: colors.hard },
  { kind: 'photo', label: 'Photo', symbol: { ios: 'camera', android: 'photo_camera' }, tint: colors.pink },
];

const SIZE_OPTIONS: { value: CourseSize; label: string }[] = [
  { value: 'quick', label: 'Quick' },
  { value: 'standard', label: 'Standard' },
  { value: 'deep', label: 'Deep' },
];

const MISSING: Record<Kind | 'text', string> = {
  topic: 'Add a topic first.',
  link: 'Paste a link first.',
  text: 'Paste some text first.',
  pdf: 'Choose a PDF first.',
  photo: 'Add a photo first.',
};

const PASTED_TITLE_CHARS = 60;

function SourceTile({ label, symbol, tint, selected, onPress }: { label: string; symbol: SymbolViewProps['name']; tint: string; selected: boolean; onPress(): void }) {
  const { reduce, spring } = useMotion();
  const lift = useAnimatedStyle(() => ({
    transform: [{ scale: reduce ? 1 : withSpring(selected ? 1.04 : 1, spring('pop')) }],
    borderColor: withTiming(selected ? tint : colors.hairline, { duration: 200 }),
  }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={styles.tileHit}>
      <Animated.View style={[styles.tile, selected && styles.tileOn, lift]}>
        <SymbolView name={symbol} size={22} tintColor={tint} />
        <Text style={styles.tileLabel}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function Field(props: { label: string; value: string; onChangeText(t: string): void; placeholder: string; multiline?: boolean; url?: boolean }) {
  return (
    <TextInput
      accessibilityLabel={props.label} value={props.value} onChangeText={props.onChangeText} placeholder={props.placeholder}
      placeholderTextColor={colors.textMuted} multiline={props.multiline} autoCapitalize={props.url ? 'none' : 'sentences'}
      autoCorrect={!props.url} keyboardType={props.url ? 'url' : 'default'} style={[styles.input, props.multiline && styles.multiline]}
    />
  );
}

/** The source picker, its input, the size control and the Make button. */
function CreateForm() {
  const { userId } = useAuth();
  const { online } = useSync(userId);
  const start = useCreateStore((s) => s.start);
  const error = useCreateStore((s) => s.error);
  const failed = useCreateStore((s) => s.phase === 'error');
  const { reduce } = useMotion();

  const [kind, setKind] = useState<Kind>('topic');
  const [size, setSize] = useState<CourseSize>('standard');
  const [topic, setTopic] = useState('');
  const [url, setUrl] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pdf, setPdf] = useState<PickedPdf | null>(null);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  // Choosing Link fills in a link just copied elsewhere (only a real http(s)
  // URL), once per visit to the tile: clearing the field must not refill it.
  const askedClipboard = useRef(false);
  useEffect(() => {
    if (kind !== 'link') { askedClipboard.current = false; return; }
    if (askedClipboard.current) return;
    askedClipboard.current = true;
    let live = true;
    void Clipboard.getStringAsync().then((text) => { if (live && isHttpUrl(text)) setUrl((u) => u || text.trim()); }, () => {});
    return () => { live = false; };
  }, [kind]);

  const choose = (k: Kind) => { haptic('selection'); setKind(k); setHint(null); };
  const addPhotos = async (from: 'camera' | 'library') => {
    const picked = await pickPhotos(from, MAX_PHOTOS - photos.length);
    if (picked.length) setPhotos((p) => [...p, ...picked].slice(0, MAX_PHOTOS));
  };

  function reader(): { read: () => Promise<CourseSource> } | { missing: string } {
    if (kind === 'topic') return topic.trim() ? { read: async () => readTopic(topic) } : { missing: MISSING.topic };
    if (kind === 'link' && pasting) {
      const text = pasted.trim();
      return text
        ? { read: async () => ({ kind: 'text', text, title: text.split('\n')[0].slice(0, PASTED_TITLE_CHARS).trim(), label: 'your text' }) }
        : { missing: MISSING.text };
    }
    if (kind === 'link') return url.trim() ? { read: () => readLink(url) } : { missing: MISSING.link };
    if (kind === 'pdf') return pdf ? { read: () => readPdf(pdf) } : { missing: MISSING.pdf };
    return photos.length ? { read: () => readPhotos(photos) } : { missing: MISSING.photo };
  }

  const blocked = !online || error === 'subscription';
  const label = !online ? CREATE_COPY.offlineButton : error === 'subscription' ? CREATE_COPY.proButton : CREATE_COPY.make;
  const make = () => {
    if (blocked) return;
    const r = reader();
    if ('missing' in r) { setHint(r.missing); return; }
    setHint(null);
    start(r.read, size);
  };

  let errorLine: string | null = null;
  if (failed && error === 'unreadable' && kind !== 'topic') errorLine = CREATE_COPY.unreadable[kind];
  else if (failed && error === 'too_large') errorLine = kind === 'photo' ? CREATE_COPY.tooLarge.photo : CREATE_COPY.tooLarge.pdf;
  else if (failed && error) errorLine = CREATE_COPY.errors[error];
  const enter = reduce ? undefined : FadeIn.duration(250);

  let input: ReactNode;
  if (kind === 'topic') {
    input = <Field label="Your topic" value={topic} onChangeText={setTopic} placeholder="The French Revolution" />;
  } else if (kind === 'link') {
    input = pasting ? (
      <Field label="Text" value={pasted} onChangeText={setPasted} placeholder="Paste your notes or an article" multiline />
    ) : (
      <View style={styles.stack}>
        <Field label="Link" value={url} onChangeText={setUrl} placeholder="https://" url />
        {isYouTube(url) && <View style={styles.chip}><Text style={styles.chipText}>Video transcript</Text></View>}
        <SecondaryButton label={CREATE_COPY.pasteInstead} onPress={() => setPasting(true)} />
      </View>
    );
  } else if (kind === 'pdf') {
    input = (
      <View style={styles.stack}>
        {pdf && <Text style={styles.fileName} numberOfLines={1}>{`${pdf.name} · ${Math.max(1, Math.round(pdf.size / 1024))} KB`}</Text>}
        <SecondaryButton label={pdf ? 'Choose another PDF' : 'Choose a PDF'} onPress={() => void pickPdf().then((f) => { if (f) setPdf(f); })} />
      </View>
    );
  } else {
    input = (
      <View style={styles.stack}>
        {photos.length > 0 && (
          <View style={styles.thumbs}>
            {photos.map((p, i) => (
              <View key={`${p.uri}:${i}`} style={styles.thumb}>
                <Image source={{ uri: p.uri }} style={styles.thumbImage} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove page ${i + 1}`} hitSlop={6} style={styles.thumbClose}
                  onPress={() => setPhotos((all) => all.filter((_, k) => k !== i))}>
                  <SymbolView name={{ ios: 'xmark', android: 'close' }} size={10} tintColor={colors.ink} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        {photos.length < MAX_PHOTOS && (
          <View style={styles.row}>
            <View style={styles.flex}><SecondaryButton label="Take photo" onPress={() => void addPhotos('camera')} /></View>
            <View style={styles.flex}><SecondaryButton label="Choose photos" onPress={() => void addPhotos('library')} /></View>
          </View>
        )}
      </View>
    );
  }

  return (
    <>
      <View style={styles.grid}>
        {SOURCES.map((s) => <SourceTile key={s.kind} {...s} selected={kind === s.kind} onPress={() => choose(s.kind)} />)}
      </View>
      <Animated.View key={`${kind}:${pasting}`} entering={enter} layout={reduce ? undefined : LinearTransition} style={styles.inputArea}>
        {input}
      </Animated.View>
      <View style={styles.stack}>
        <Text style={styles.sectionLabel}>{`Size · about ${COURSE_SIZES[size]} cards`}</Text>
        <SegmentedControl<CourseSize> options={SIZE_OPTIONS} value={size} onChange={setSize} />
      </View>
      {(hint || errorLine) && <Text style={styles.error} accessibilityLiveRegion="polite">{hint ?? errorLine}</Text>}
      <View style={blocked && styles.dim}><PrimaryButton label={label} onPress={make} /></View>
    </>
  );
}

/** The "New course" sheet: one build at a time, owned by useCreateStore. */
export function CreateScreen() {
  const phase = useCreateStore((s) => s.phase);
  const savedDeckId = useCreateStore((s) => s.savedDeckId);
  const editing = phase === 'input' || phase === 'error';
  // Leave first; the unmount below clears the finished build (resetting
  // first flashed the form for a frame).
  const studyNow = () => {
    if (savedDeckId) router.replace(`/study/${savedDeckId}`);
    else router.back();
  };
  const done = () => router.back();
  // Closing the sheet any way (Close, swipe down) forgets a finished course or
  // an error; a build that is running or awaiting review carries on.
  useEffect(() => () => {
    const { phase: last, reset: clear } = useCreateStore.getState();
    if (last === 'ready' || last === 'error') clear();
  }, []);
  return (
    <View style={styles.sheet}>
      <AuroraBackground intensity={0.4} />
      <View style={styles.grabber} />
      <SafeAreaView style={styles.fill} edges={['bottom']}>
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.title} accessibilityRole="header">{CREATE_COPY.title}</Text>
              <Text style={styles.subtitle}>{CREATE_COPY.subtitle}</Text>
            </View>
            <GlassButton symbol={{ ios: 'xmark', android: 'close' }} label="Close" onPress={() => router.back()} tint={colors.text} />
          </View>
          {/* Stays mounted (hidden) through building and review, so an error
              comes back to the same source, inputs and size. */}
          <ScrollView style={!editing && styles.hidden} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <CreateForm />
          </ScrollView>
          {(phase === 'building' || phase === 'waiting') && <BuildingView />}
          {(phase === 'review' || phase === 'saving') && <ReviewDeck />}
          {phase === 'ready' && <ReadyView onStudy={studyNow} onDone={done} />}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.night },
  fill: { flex: 1 },
  flex: { flex: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.sm },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 34, lineHeight: 40 },
  subtitle: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 14 },
  body: { padding: space.xl, gap: space.xl, paddingBottom: space.xxl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tileHit: { width: '47%', flexGrow: 1 },
  tile: { backgroundColor: colors.raised, borderRadius: radius.tile, padding: space.lg, gap: space.sm, borderWidth: 1.5, borderColor: colors.hairline },
  tileOn: { backgroundColor: '#211B33' },
  tileLabel: { color: colors.text, fontFamily: fonts.uiBold, fontSize: 15 },
  inputArea: { gap: space.md },
  stack: { gap: space.md },
  row: { flexDirection: 'row', gap: space.md },
  input: {
    backgroundColor: colors.surface, color: colors.text, fontFamily: fonts.ui, fontSize: 16, borderRadius: radius.tile,
    paddingHorizontal: space.lg, paddingVertical: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline,
  },
  multiline: { minHeight: 140, textAlignVertical: 'top' },
  chip: { alignSelf: 'flex-start', backgroundColor: 'rgba(34,211,238,0.15)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { color: colors.cyan, fontFamily: fonts.uiBold, fontSize: 12 },
  fileName: { color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  thumbs: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  thumb: { width: 58, height: 76, borderRadius: 8, backgroundColor: colors.paper, overflow: 'visible' },
  thumbImage: { width: 58, height: 76, borderRadius: 8 },
  thumbClose: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 13 },
  error: { color: colors.again, fontFamily: fonts.ui, fontSize: 14 },
  dim: { opacity: 0.6 },
  hidden: { display: 'none' },
});
