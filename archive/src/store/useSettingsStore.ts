import { AppSettings, AiEngineConfig } from '../types/models';

interface SettingsState {
  settings: AppSettings;
  updateAiConfig: (config: Partial<AiEngineConfig>) => void;
  updateCustomBaseUrl: (url: string) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  aiConfig: {
    mode: 'cloud',
    apiKey: '',
    customBaseUrl: '',
    model: 'gemini-2.5-flash',
  },
  theme: 'apple',
  fontSize: 16,
};

const SETTINGS_STORAGE_KEY = 'lp_app_settings';

function loadInitialSettings(): AppSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      aiConfig: {
        ...DEFAULT_SETTINGS.aiConfig,
        ...(parsed.aiConfig || {}),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(settings: AppSettings) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

// Minimal reactive store pattern compatible with Zustand API
type Listener = () => void;
let currentSettings = loadInitialSettings();
const listeners = new Set<Listener>();

export const useSettingsStore = {
  getState: () => ({
    settings: currentSettings,
    updateAiConfig: (patch: Partial<AiEngineConfig>) => {
      currentSettings = {
        ...currentSettings,
        aiConfig: {
          ...currentSettings.aiConfig,
          ...patch,
        },
      };
      persistSettings(currentSettings);
      listeners.forEach(fn => fn());
    },
    updateCustomBaseUrl: (customBaseUrl: string) => {
      currentSettings = {
        ...currentSettings,
        aiConfig: {
          ...currentSettings.aiConfig,
          customBaseUrl: customBaseUrl.trim(),
        },
      };
      persistSettings(currentSettings);
      listeners.forEach(fn => fn());
    },
  }),
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
