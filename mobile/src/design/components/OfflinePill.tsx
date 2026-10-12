import { BlurView } from 'expo-blur';
import { StyleSheet, Text } from 'react-native';
import { colors, fonts } from '../tokens';

export const OFFLINE_TEXT = 'Offline · reviews will sync';

export function OfflinePill({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <BlurView intensity={40} tint="dark" style={styles.pill} accessibilityLiveRegion="polite">
      <Text style={styles.text}>{OFFLINE_TEXT}</Text>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'center', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  text: { color: colors.text, fontFamily: fonts.ui, fontSize: 13 },
});
