import { qdnRequest } from './qdnRequest';

// Mirrors Home's electron/notification-manager.ts and
// docs/HOME_DATA_MANAGERS.md `NOTIFICATION_MANAGER_GET` shape. Notify never
// invents its own copy of this data — every read is a fresh sanitized
// snapshot from Home, and every mutation round-trips the current revision.

export type NotificationEvent =
  | 'RESOURCE_PUBLISHED'
  | 'PAYMENT_RECEIVED'
  | 'CHAT_MESSAGE'
  | 'TRANSACTION_CONFIRMED'
  | 'FOREIGN_PAYMENT_RECEIVED';

export type NotificationFilters = Record<string, boolean | number | string | string[]>;

export type NotificationGrant = {
  grantedAt: string;
  muted?: boolean;
};

export type NotificationManagerRule = {
  createdAt: string;
  event: NotificationEvent;
  filters: NotificationFilters;
  link?: string;
  maskedFilterKeys: string[];
  notificationId: string;
  text?: string;
  title?: string;
};

export type NotificationManagerApp = {
  appKey: string;
  grant: NotificationGrant | null;
  rules: NotificationManagerRule[];
};

export type NotificationManagerSummary = {
  apps: NotificationManagerApp[];
  revision: number;
  version: 1;
};

export const NOTIFICATION_MANAGER_ACTIONS = [
  'NOTIFICATION_MANAGER_HAS_PERMISSION',
  'NOTIFICATION_MANAGER_GET',
  'NOTIFICATION_MANAGER_SET_MUTED',
  'NOTIFICATION_MANAGER_REMOVE_RULES',
  'NOTIFICATION_MANAGER_REVOKE',
] as const;

export const HOME_SETTINGS_ACTIONS_FOR_NOTIFY = ['GET_HOME_SETTINGS', 'UPDATE_HOME_SETTINGS'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isNotificationManagerSummary(value: unknown): value is NotificationManagerSummary {
  return (
    isRecord(value) &&
    value.version === 1 &&
    Number.isSafeInteger(value.revision) &&
    (value.revision as number) >= 0 &&
    Array.isArray(value.apps)
  );
}

export async function hasNotificationManagerPermission(): Promise<boolean> {
  const result = await qdnRequest<{ granted?: unknown }>({ action: 'NOTIFICATION_MANAGER_HAS_PERMISSION' });

  return result?.granted === true;
}

export async function getNotificationManagerSummary(): Promise<NotificationManagerSummary> {
  const result = await qdnRequest<unknown>({ action: 'NOTIFICATION_MANAGER_GET' });

  if (!isNotificationManagerSummary(result)) {
    throw new Error('Home returned an unexpected notification manager summary.');
  }

  return result;
}

export async function setAppMuted(
  appKey: string,
  muted: boolean,
  expectedRevision: number,
): Promise<NotificationManagerSummary> {
  const result = await qdnRequest<unknown>({
    action: 'NOTIFICATION_MANAGER_SET_MUTED',
    appKey,
    muted,
    expectedRevision,
  });

  if (!isNotificationManagerSummary(result)) {
    throw new Error('Home returned an unexpected notification manager summary.');
  }

  return result;
}

export async function removeAppRules(
  appKey: string,
  notificationIds: string[],
  expectedRevision: number,
): Promise<NotificationManagerSummary> {
  const result = await qdnRequest<unknown>({
    action: 'NOTIFICATION_MANAGER_REMOVE_RULES',
    appKey,
    notificationIds,
    expectedRevision,
  });

  if (!isNotificationManagerSummary(result)) {
    throw new Error('Home returned an unexpected notification manager summary.');
  }

  return result;
}

export async function revokeApp(appKey: string, expectedRevision: number): Promise<NotificationManagerSummary> {
  const result = await qdnRequest<unknown>({
    action: 'NOTIFICATION_MANAGER_REVOKE',
    appKey,
    expectedRevision,
  });

  if (!isNotificationManagerSummary(result)) {
    throw new Error('Home returned an unexpected notification manager summary.');
  }

  return result;
}

// `qortiumNotificationManagerChanged` per docs/HOME_DATA_MANAGERS.md — the
// event detail is only ever `{ revision }`, never the underlying data.
export const NOTIFICATION_MANAGER_CHANGED_EVENT = 'qortiumNotificationManagerChanged';

export type NotificationManagerChangedDetail = {
  revision: number;
};

export function getChangedRevision(event: Event): number | null {
  const detail = (event as CustomEvent<unknown>).detail;

  return isRecord(detail) && Number.isSafeInteger(detail.revision) ? (detail.revision as number) : null;
}

export function getChangedRevisionFromMessage(value: unknown): number | null {
  if (!isRecord(value) || value.type !== 'qortium:notification-manager-changed' || !isRecord(value.detail)) {
    return null;
  }

  return Number.isSafeInteger(value.detail.revision) && (value.detail.revision as number) >= 0
    ? (value.detail.revision as number)
    : null;
}

export function subscribeToNotificationManagerChanged(listener: (revision: number) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    const revision = getChangedRevision(event);

    if (revision !== null) {
      listener(revision);
    }
  };

  window.addEventListener(NOTIFICATION_MANAGER_CHANGED_EVENT, handler);

  return () => window.removeEventListener(NOTIFICATION_MANAGER_CHANGED_EVENT, handler);
}

export function isCurrentNotificationManagerResponse(
  requestId: number,
  latestRequestId: number,
  responseRevision: number,
  observedRevision: number,
) {
  return requestId === latestRequestId && responseRevision >= observedRevision;
}
