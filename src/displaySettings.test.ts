import { describe, expect, it } from 'vitest';
import {
  getDisplaySettingsUpdateFromHomeSettings,
  getDisplaySettingsUpdateFromMessage,
  normalizeAccent,
  normalizeTextSize,
  normalizeTheme,
  normalizeUiStyle,
} from './displaySettings';

const BASE = {
  accent: 'green',
  language: 'en',
  textSize: 'medium',
  theme: 'light',
  uiStyle: 'classic',
} as const;

describe('normalizers', () => {
  it('accept only known values, case-insensitively', () => {
    expect(normalizeAccent('BLUE')).toBe('blue');
    expect(normalizeAccent('turquoise')).toBeNull();
    expect(normalizeTextSize('Huge')).toBe('huge');
    expect(normalizeTextSize('xl')).toBeNull();
    expect(normalizeTheme('DARK')).toBe('dark');
    expect(normalizeTheme('midnight')).toBeNull();
    expect(normalizeUiStyle('Fun')).toBe('fun');
    expect(normalizeUiStyle('retro')).toBeNull();
  });
});

describe('getDisplaySettingsUpdateFromMessage', () => {
  it('ignores messages without a string action', () => {
    expect(getDisplaySettingsUpdateFromMessage({}, BASE)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage(null, BASE)).toBeNull();
  });

  it('ignores messages addressed to a different handler', () => {
    const message = { action: 'THEME_CHANGED', theme: 'dark', requestedHandler: 'ACCOUNTS' };

    expect(getDisplaySettingsUpdateFromMessage(message, BASE)).toBeNull();
  });

  it('applies a single-field change and keeps the rest', () => {
    const message = { action: 'THEME_CHANGED', theme: 'dark' };

    expect(getDisplaySettingsUpdateFromMessage(message, BASE)).toEqual({ ...BASE, theme: 'dark' });
  });

  it('applies a full DISPLAY_SETTINGS_CHANGED snapshot, falling back per-field', () => {
    const message = { action: 'DISPLAY_SETTINGS_CHANGED', accent: 'purple', uiStyle: 'modern' };

    expect(getDisplaySettingsUpdateFromMessage(message, BASE)).toEqual({
      ...BASE,
      accent: 'purple',
      uiStyle: 'modern',
    });
  });

  it('returns null for an unrecognized action', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'SOMETHING_ELSE' }, BASE)).toBeNull();
  });

  it('returns null when the new value fails validation', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'THEME_CHANGED', theme: 'sepia' }, BASE)).toBeNull();
  });
});

describe('getDisplaySettingsUpdateFromHomeSettings', () => {
  it('applies the current Home snapshot fields', () => {
    expect(getDisplaySettingsUpdateFromHomeSettings({
      accent: 'blue',
      language: 'ar',
      textSize: 'large',
      theme: 'dark',
      ui: 'fun',
    }, BASE)).toEqual({
      accent: 'blue',
      language: 'ar',
      textSize: 'large',
      theme: 'dark',
      uiStyle: 'fun',
    });
  });

  it('preserves the effective query theme when Home reports system', () => {
    expect(getDisplaySettingsUpdateFromHomeSettings({ theme: 'system', accent: 'purple' }, BASE)).toEqual({
      ...BASE,
      accent: 'purple',
    });
  });
});
