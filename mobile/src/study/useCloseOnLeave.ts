import { useEffect } from 'react';

/**
 * However the study screen goes away (close button, Android back, the
 * predictive back gesture), the studied part is saved as a session. Closing
 * twice is harmless: an empty segment records nothing.
 */
export function useCloseOnLeave(session: { close(at: number): Promise<void> }) {
  useEffect(() => () => { void session.close(Date.now()); }, [session]);
}
