import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** The current time, refreshed every minute and on return to the foreground. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setNow(Date.now()); });
    return () => { clearInterval(id); sub.remove(); };
  }, [intervalMs]);
  return now;
}
