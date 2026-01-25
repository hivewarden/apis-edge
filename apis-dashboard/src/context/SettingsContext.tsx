import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

/**
 * Voice input transcription method
 * - 'auto': Use native browser speech recognition if available, otherwise show unavailable
 * - 'native': Force native browser speech recognition (Web Speech API)
 * - 'whisper': Use server-side Whisper transcription (higher accuracy, requires internet)
 */
export type VoiceInputMethod = 'auto' | 'native' | 'whisper';

interface SettingsContextType {
  advancedMode: boolean;
  setAdvancedMode: (value: boolean) => void;
  /** Voice input transcription method */
  voiceInputMethod: VoiceInputMethod;
  setVoiceInputMethod: (value: VoiceInputMethod) => void;
  /** BCP 47 language code for voice recognition (e.g., 'en-US', 'fr-FR') */
  voiceLanguage: string;
  setVoiceLanguage: (value: string) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'apis_settings';

interface StoredSettings {
  advancedMode: boolean;
  voiceInputMethod?: VoiceInputMethod;
  voiceLanguage?: string;
}

interface SettingsProviderProps {
  children: ReactNode;
}

/**
 * Get default voice language from browser
 */
function getDefaultVoiceLanguage(): string {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en-US';
}

/**
 * Settings provider that persists user preferences to localStorage.
 * Provides access to advanced mode toggle for frame-level tracking
 * and voice input settings for speech recognition.
 *
 * Part of Epic 5, Story 5.5: Frame-Level Data Tracking
 * Part of Epic 7, Story 7.5: Voice Input for Notes
 */
export function SettingsProvider({ children }: SettingsProviderProps) {
  const [advancedMode, setAdvancedModeState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const settings: StoredSettings = JSON.parse(stored);
        return settings.advancedMode ?? false;
      }
    } catch {
      // Ignore parse errors
    }
    return false;
  });

  const [voiceInputMethod, setVoiceInputMethodState] = useState<VoiceInputMethod>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const settings: StoredSettings = JSON.parse(stored);
        return settings.voiceInputMethod ?? 'auto';
      }
    } catch {
      // Ignore parse errors
    }
    return 'auto';
  });

  const [voiceLanguage, setVoiceLanguageState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const settings: StoredSettings = JSON.parse(stored);
        return settings.voiceLanguage ?? getDefaultVoiceLanguage();
      }
    } catch {
      // Ignore parse errors
    }
    return getDefaultVoiceLanguage();
  });

  useEffect(() => {
    const settings: StoredSettings = {
      advancedMode,
      voiceInputMethod,
      voiceLanguage,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [advancedMode, voiceInputMethod, voiceLanguage]);

  const setAdvancedMode = (value: boolean) => {
    setAdvancedModeState(value);
  };

  const setVoiceInputMethod = (value: VoiceInputMethod) => {
    setVoiceInputMethodState(value);
  };

  const setVoiceLanguage = (value: string) => {
    setVoiceLanguageState(value);
  };

  return (
    <SettingsContext.Provider
      value={{
        advancedMode,
        setAdvancedMode,
        voiceInputMethod,
        setVoiceInputMethod,
        voiceLanguage,
        setVoiceLanguage,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Hook to access settings context.
 */
export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export default SettingsProvider;
