import { qdnRequest } from './qdnRequest';

// Notify only ever reads/writes the single `appNotifications` field of
// Home's settings bridge (electron/home-settings-bridge.ts) — the master
// switch documented in docs/APP_NOTIFICATIONS.md. It never touches theme,
// accent, language, text size, or UI style; those are host-owned display
// preferences Notify only *observes* via displaySettings.ts.

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export type HomeSettingsSnapshot = {
  accent?: unknown;
  appNotifications: boolean;
  language?: unknown;
  lang?: unknown;
  textSize?: unknown;
  theme?: unknown;
  ui?: unknown;
  uiStyle?: unknown;
};

export function parseHomeSettingsSnapshot(value: unknown): HomeSettingsSnapshot | null {
  if (!isRecord(value) || typeof value.appNotifications !== 'boolean') {
    return null;
  }

  return value as HomeSettingsSnapshot;
}

export async function getHomeSettings(): Promise<HomeSettingsSnapshot> {
  const settings = parseHomeSettingsSnapshot(await qdnRequest<unknown>({ action: 'GET_HOME_SETTINGS' }));

  if (!settings) {
    throw new Error('Home returned an unexpected settings response.');
  }

  return settings;
}

export async function getAppNotificationsEnabled(): Promise<boolean> {
  return (await getHomeSettings()).appNotifications;
}

export async function setAppNotificationsEnabled(enabled: boolean): Promise<boolean> {
  const settings = await qdnRequest<unknown>({
    action: 'UPDATE_HOME_SETTINGS',
    patch: { appNotifications: enabled },
  });

  if (!isRecord(settings) || typeof settings.appNotifications !== 'boolean') {
    throw new Error('Home returned an unexpected settings response.');
  }

  return settings.appNotifications;
}
