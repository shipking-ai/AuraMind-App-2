import { Capacitor, Haptics, ImpactStyle, NotificationType } from "../../lib/nativeShim";

/**
 * Haptics tuned for iPhone's Taptic Engine, following Apple's usage:
 * selection ticks for pickers, segmented controls and tab switches; a light
 * impact for button presses; notification patterns for outcomes. No-ops on
 * the web and never throw.
 */
function native(): boolean {
  return Capacitor.isNativePlatform();
}

export function iosSelection(): void {
  if (!native()) return;
  // UISelectionFeedbackGenerator: start prepares, changed fires the tick.
  void Haptics.selectionStart()
    .then(() => Haptics.selectionChanged())
    .then(() => Haptics.selectionEnd())
    .catch(() => undefined);
}

export function iosTap(style: ImpactStyle = ImpactStyle.Light): void {
  if (!native()) return;
  void Haptics.impact({ style }).catch(() => undefined);
}

export function iosSuccess(): void {
  if (!native()) return;
  void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
}

export function iosWarning(): void {
  if (!native()) return;
  void Haptics.notification({ type: NotificationType.Warning }).catch(() => undefined);
}
