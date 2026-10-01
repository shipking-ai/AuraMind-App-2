/** Keyboard shortcut strings in the form the Tauri global-shortcut plugin reads. */
const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;

function keyName(code: string): string | null {
  if (code === 'Space') return 'Space';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return null;
}

export function acceleratorFromEvent(e: {
  key: string; code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean;
}): string | null {
  if (MODIFIER_CODES.test(e.code)) return null;
  const key = keyName(e.code);
  if (!key) return null;
  const mods = [e.ctrlKey || e.metaKey ? 'CommandOrControl' : null, e.altKey ? 'Alt' : null, e.shiftKey ? 'Shift' : null].filter(Boolean);
  // A bare key (or Shift+key) would fire while typing.
  if (!mods.some((m) => m === 'CommandOrControl' || m === 'Alt')) return null;
  return [...mods, key].join('+');
}

export function displayAccelerator(acc: string): string {
  return acc.split('+').map((p) => (p === 'CommandOrControl' ? 'Ctrl' : p)).join(' + ');
}
