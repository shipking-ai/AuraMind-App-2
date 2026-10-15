import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseMicVolumeResult {
  /** Clamped RMS volume in 0..1. 0 when not active. */
  level: number;
  /** True when the mic stream + analyser are live. */
  isActive: boolean;
  /** Last error message (permission denial, no device, etc.) or null. */
  error: string | null;
  /** Ask the user for mic permission + start streaming. Idempotent. */
  start(): Promise<void>;
  /** Release mic + AudioContext. */
  stop(): void;
}

/**
 * Live microphone RMS volume hook.
 *
 * Pass `audioLevel` from this hook into <ProfLinnea audioLevel={...} /> to
 * make the orbit stars grow outward when the user is dictating.
 *
 * Notes:
 *  - Never auto-starts. The host component decides the affordance (button
 *    click, voice-input toggle, etc.) and timing (start on focus, stop
 *    on blur). Avoids surprise permission prompts.
 *  - Cleans up stream + analyser + rAF on unmount OR when stop() is
 *    called. Multiple stop() calls are safe.
 *  - On errors (permission denied, no device, secure-context missing)
 *    we set error and stay inactive — never throw, so React trees
 *    don't crash.
 *  - getUserMedia requires HTTPS or localhost. In non-secure contexts
 *    the call rejects and we surface the error.
 */
/**
 * Maps getUserMedia failures to copy written for a student, not a dev.
 */
function describeMicError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Microphone access is blocked. Allow the mic for this site in your browser’s address-bar icon, then try again.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No microphone found. Check that one is connected and not in use by another app.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Your microphone is busy or unavailable. Close other apps using it, then try again.';
      case 'SecurityError':
        return 'Microphone access requires a secure (HTTPS) connection.';
    }
  }
  const msg = err instanceof Error ? err.message : '';
  if (/denied|blocked|permission/i.test(msg)) {
    return 'Microphone access is blocked. Allow the mic for this site in your browser’s address-bar icon, then try again.';
  }
  return msg || 'Microphone unavailable.';
}

export function useMicVolume(): UseMicVolumeResult {
  const [level, setLevel] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const isStartingRef = useRef(false);

  const start = useCallback(async () => {
    if (isStartingRef.current || isActive) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access needs a secure (HTTPS) connection to work.');
      return;
    }
    isStartingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // AudioContext must be created (or resumed) in a user gesture in
      // some browsers; calling it inside start() — which is always invoked
      // from a click — satisfies that.
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        analyser.getByteTimeDomainData(buf);
        // Compute RMS — sample values are 0..255 centred at 128.
        let sumSq = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = ( buf[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / buf.length);
        // Boost ×2.5 because real speech rarely reaches 1.0 RMS even when
        // loud. Clamp at 1.
        setLevel(Math.min(1, rms * 2.5));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();

      streamRef.current = stream;
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      setIsActive(true);
      setError(null);
    } catch (e) {
      setError(describeMicError(e));
      setIsActive(false);
    } finally {
      isStartingRef.current = false;
    }
  }, [isActive]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close().catch(() => {});
    streamRef.current = null;
    ctxRef.current = null;
    analyserRef.current = null;
    setIsActive(false);
    setLevel(0);
  }, []);

  // Cleanup on unmount.
  useEffect(() => () => stop(), [stop]);

  return { level, isActive, error, start, stop };
}

export default useMicVolume;
