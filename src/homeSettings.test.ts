import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppNotificationsEnabled, getHomeSettings, parseHomeSettingsSnapshot, setAppNotificationsEnabled } from './homeSettings';

afterEach(() => {
  delete (window as { qdnRequest?: unknown }).qdnRequest;
});

describe('getAppNotificationsEnabled', () => {
  it('reads the boolean field from GET_HOME_SETTINGS', async () => {
    const bridge = vi.fn().mockResolvedValue({ appNotifications: true, theme: 'light' });
    window.qdnRequest = bridge;

    await expect(getAppNotificationsEnabled()).resolves.toBe(true);
    expect(bridge).toHaveBeenCalledWith({ action: 'GET_HOME_SETTINGS' });
  });

  it('throws when the field is missing or the wrong type', async () => {
    window.qdnRequest = vi.fn().mockResolvedValue({ appNotifications: 'yes' });

    await expect(getAppNotificationsEnabled()).rejects.toThrow('unexpected settings response');
  });
});

describe('Home settings snapshot', () => {
  it('retains display fields alongside the notification switch', async () => {
    window.qdnRequest = vi.fn().mockResolvedValue({
      accent: 'purple',
      appNotifications: true,
      language: 'en',
      textSize: 'large',
      theme: 'dark',
      ui: 'modern',
    });

    await expect(getHomeSettings()).resolves.toMatchObject({ accent: 'purple', appNotifications: true, ui: 'modern' });
  });

  it('rejects a live snapshot without the notification switch', () => {
    expect(parseHomeSettingsSnapshot({ theme: 'dark' })).toBeNull();
  });
});

describe('setAppNotificationsEnabled', () => {
  it('sends a minimal patch and returns the new value', async () => {
    const bridge = vi.fn().mockResolvedValue({ appNotifications: false });
    window.qdnRequest = bridge;

    await expect(setAppNotificationsEnabled(false)).resolves.toBe(false);
    expect(bridge).toHaveBeenCalledWith({
      action: 'UPDATE_HOME_SETTINGS',
      patch: { appNotifications: false },
    });
  });
});
