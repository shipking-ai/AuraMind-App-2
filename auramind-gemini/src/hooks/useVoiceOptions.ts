import { useEffect, useState } from 'react';
import { listVoices, VOICE_AUTO, VOICE_RANDOM } from '../services/voice/speechOutput';
import { AI_VOICES } from '../services/voice/aiVoice';

export interface VoiceSelectOption {
  value: string;
  label: string;
}

const BASE_OPTIONS: VoiceSelectOption[] = [
  // Server-generated voices first: they sound human on every device.
  ...AI_VOICES.map((voice) => ({ value: voice.id, label: voice.label })),
  { value: VOICE_AUTO, label: 'Automatic (best built-in voice)' },
  { value: VOICE_RANDOM, label: 'Random built-in voice' },
];

/**
 * Options for a voice picker: the natural AI voices, Automatic, Random, then
 * every installed voice for the app language, most natural-sounding first. A saved voice that has since been uninstalled is
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
