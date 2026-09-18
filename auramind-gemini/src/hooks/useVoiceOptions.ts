import { useEffect, useState } from 'react';
import { listVoices, VOICE_AUTO, VOICE_RANDOM } from '../services/voice/speechOutput';

export interface VoiceSelectOption {
  value: string;
  label: string;
}

const BASE_OPTIONS: VoiceSelectOption[] = [
  { value: VOICE_AUTO, label: 'Automatic (best voice)' },
  { value: VOICE_RANDOM, label: 'Random voice' },
];

/**
 * Options for a voice picker: Automatic, Random, then every installed voice
 * for the app language. A saved voice that has since been uninstalled is
 * kept in the list so the picker shows the real setting, not a silent
 * switch to Automatic; speaking falls back to Automatic for it.
 */
export function useVoiceOptions(current: string): VoiceSelectOption[] {
  const [voices, setVoices] = useState<VoiceSelectOption[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void listVoices('en').then((list) => {
      if (!alive) return;
      setVoices(list.map((voice) => ({ value: voice.id, label: voice.label })));
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const options = [...BASE_OPTIONS, ...voices];
  if (current && !options.some((option) => option.value === current)) {
    options.push({
      value: current,
      label: loaded ? 'Saved voice (not installed)' : 'Loading voices…',
    });
  }
  return options;
}
