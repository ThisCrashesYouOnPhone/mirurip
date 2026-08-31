import { useEffect, useState, type CSSProperties } from 'react';
import {
  safeLocalStorageGetJson,
  safeLocalStorageSet,
} from '../../../client/safeStorage';

export type SubtitleFontSize = 'small' | 'medium' | 'large' | 'extra-large';
export type SubtitleBackground = 'none' | 'semi' | 'black';

export type SubtitleSettings = {
  fontSize: SubtitleFontSize;
  background: SubtitleBackground;
};

const STORAGE_KEY = 'miruro_subtitle_settings';

export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  fontSize: 'medium',
  background: 'none',
};

const FONT_SIZE_VALUES: Record<SubtitleFontSize, string> = {
  small: 'clamp(1rem, 2.4cqi, 1.8rem)',
  medium: 'clamp(1.2rem, 3.2cqi, 2.5rem)',
  large: 'clamp(1.4rem, 4.2cqi, 3.2rem)',
  'extra-large': 'clamp(1.7rem, 5.2cqi, 4rem)',
};

const BACKGROUND_VALUES: Record<SubtitleBackground, string> = {
  none: 'transparent',
  semi: 'rgba(0, 0, 0, 0.65)',
  black: 'rgba(0, 0, 0, 0.95)',
};

function isFontSize(value: unknown): value is SubtitleFontSize {
  return value === 'small' || value === 'medium' || value === 'large' || value === 'extra-large';
}

function isBackground(value: unknown): value is SubtitleBackground {
  return value === 'none' || value === 'semi' || value === 'black';
}

export function normalizeSubtitleSettings(value: unknown): SubtitleSettings {
  if (!value || typeof value !== 'object') return DEFAULT_SUBTITLE_SETTINGS;
  const candidate = value as Partial<SubtitleSettings>;
  return {
    fontSize: isFontSize(candidate.fontSize) ? candidate.fontSize : DEFAULT_SUBTITLE_SETTINGS.fontSize,
    background: isBackground(candidate.background) ? candidate.background : DEFAULT_SUBTITLE_SETTINGS.background,
  };
}

export function subtitleStyleVariables(settings: SubtitleSettings): CSSProperties {
  return {
    '--sub-font-size': FONT_SIZE_VALUES[settings.fontSize],
    '--sub-bg': BACKGROUND_VALUES[settings.background],
  } as CSSProperties;
}

export function useSubtitleSettings() {
  const [settings, setSettings] = useState<SubtitleSettings>(() => (
    normalizeSubtitleSettings(
      safeLocalStorageGetJson<unknown>(STORAGE_KEY, DEFAULT_SUBTITLE_SETTINGS),
    )
  ));

  useEffect(() => {
    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  return {
    settings,
    setSettings,
    styleVariables: subtitleStyleVariables(settings),
  };
}
