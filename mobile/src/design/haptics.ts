import * as Haptics from 'expo-haptics';
import { useSettings } from './settings';

export type HapticKind = 'light' | 'selection' | 'success' | 'warning';

/** Fire-and-forget Taptic feedback that honors the in-app toggle. */
export function haptic(kind: HapticKind): void {
  if (!useSettings.getState().hapticsEnabled) return;
  switch (kind) {
    case 'light': void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
    case 'selection': void Haptics.selectionAsync(); break;
    case 'success': void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
    case 'warning': void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); break;
  }
}
