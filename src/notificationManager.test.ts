import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getChangedRevision,
  getChangedRevisionFromMessage,
  getNotificationManagerSummary,
  hasNotificationManagerPermission,
  isCurrentNotificationManagerResponse,
  isNotificationManagerSummary,
  NOTIFICATION_MANAGER_CHANGED_EVENT,
  removeAppRules,
  revokeApp,
  setAppMuted,
  subscribeToNotificationManagerChanged,
} from './notificationManager';

const SUMMARY = {
  version: 1 as const,
  revision: 4,
  apps: [
    {
      appKey: 'qdn://APP/Chat/Chat',
      grant: { grantedAt: '2026-01-01T00:00:00.000Z' },
      rules: [
        {
          notificationId: 'direct-messages',
          event: 'CHAT_MESSAGE' as const,
          filters: {},
          maskedFilterKeys: ['involving'],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
  ],
};

afterEach(() => {
  delete (window as { qdnRequest?: unknown }).qdnRequest;
});

describe('isCurrentNotificationManagerResponse', () => {
  it('rejects out-of-order requests and revisions older than a live event', () => {
    expect(isCurrentNotificationManagerResponse(1, 2, 7, 7)).toBe(false);
    expect(isCurrentNotificationManagerResponse(2, 2, 6, 7)).toBe(false);
    expect(isCurrentNotificationManagerResponse(2, 2, 7, 7)).toBe(true);
  });
});

describe('Android manager revision messages', () => {
  it('accepts only the Home QdnViewer message shape', () => {
    expect(getChangedRevisionFromMessage({
      type: 'qortium:notification-manager-changed',
      detail: { revision: 9 },
    })).toBe(9);
    expect(getChangedRevisionFromMessage({ type: 'qortium:notification-manager-changed', detail: { revision: -1 } })).toBeNull();
    expect(getChangedRevisionFromMessage({ type: 'other', detail: { revision: 9 } })).toBeNull();
  });
});

describe('isNotificationManagerSummary', () => {
  it('accepts a well-formed summary', () => {
    expect(isNotificationManagerSummary(SUMMARY)).toBe(true);
  });

  it('rejects malformed shapes', () => {
    expect(isNotificationManagerSummary(null)).toBe(false);
    expect(isNotificationManagerSummary({ version: 1, revision: 1 })).toBe(false);
    expect(isNotificationManagerSummary({ version: 2, revision: 1, apps: [] })).toBe(false);
    expect(isNotificationManagerSummary({ version: 1, revision: -1, apps: [] })).toBe(false);
  });
});

describe('hasNotificationManagerPermission', () => {
  it('returns true only when granted is strictly true', async () => {
    window.qdnRequest = vi.fn().mockResolvedValue({ granted: true });
    await expect(hasNotificationManagerPermission()).resolves.toBe(true);

    window.qdnRequest = vi.fn().mockResolvedValue({ granted: false });
    await expect(hasNotificationManagerPermission()).resolves.toBe(false);

    window.qdnRequest = vi.fn().mockResolvedValue({});
    await expect(hasNotificationManagerPermission()).resolves.toBe(false);
  });
});

describe('getNotificationManagerSummary', () => {
  it('returns a valid summary from the bridge', async () => {
    window.qdnRequest = vi.fn().mockResolvedValue(SUMMARY);

    await expect(getNotificationManagerSummary()).resolves.toEqual(SUMMARY);
  });

  it('throws when the bridge returns something malformed', async () => {
    window.qdnRequest = vi.fn().mockResolvedValue({ nonsense: true });

    await expect(getNotificationManagerSummary()).rejects.toThrow('unexpected notification manager summary');
  });
});

describe('mutations', () => {
  it('setAppMuted sends the expected request shape', async () => {
    const bridge = vi.fn().mockResolvedValue(SUMMARY);
    window.qdnRequest = bridge;

    await setAppMuted('qdn://APP/Chat/Chat', true, 4);

    expect(bridge).toHaveBeenCalledWith({
      action: 'NOTIFICATION_MANAGER_SET_MUTED',
      appKey: 'qdn://APP/Chat/Chat',
      muted: true,
      expectedRevision: 4,
    });
  });

  it('removeAppRules sends the expected request shape', async () => {
    const bridge = vi.fn().mockResolvedValue(SUMMARY);
    window.qdnRequest = bridge;

    await removeAppRules('qdn://APP/Chat/Chat', ['direct-messages'], 4);

    expect(bridge).toHaveBeenCalledWith({
      action: 'NOTIFICATION_MANAGER_REMOVE_RULES',
      appKey: 'qdn://APP/Chat/Chat',
      notificationIds: ['direct-messages'],
      expectedRevision: 4,
    });
  });

  it('revokeApp sends the expected request shape', async () => {
    const bridge = vi.fn().mockResolvedValue(SUMMARY);
    window.qdnRequest = bridge;

    await revokeApp('qdn://APP/Chat/Chat', 4);

    expect(bridge).toHaveBeenCalledWith({
      action: 'NOTIFICATION_MANAGER_REVOKE',
      appKey: 'qdn://APP/Chat/Chat',
      expectedRevision: 4,
    });
  });

  it('propagates a stale-revision rejection untouched', async () => {
    const staleError = Object.assign(new Error('stale'), { code: 'HOME_DATA_STALE' });
    window.qdnRequest = vi.fn().mockRejectedValue(staleError);

    await expect(setAppMuted('qdn://APP/Chat/Chat', true, 1)).rejects.toBe(staleError);
  });
});

describe('getChangedRevision', () => {
  it('reads a numeric revision out of the event detail', () => {
    const event = new CustomEvent(NOTIFICATION_MANAGER_CHANGED_EVENT, { detail: { revision: 7 } });

    expect(getChangedRevision(event)).toBe(7);
  });

  it('returns null for a missing or non-numeric revision', () => {
    expect(getChangedRevision(new CustomEvent(NOTIFICATION_MANAGER_CHANGED_EVENT, { detail: {} }))).toBeNull();
    expect(
      getChangedRevision(new CustomEvent(NOTIFICATION_MANAGER_CHANGED_EVENT, { detail: { revision: 'seven' } })),
    ).toBeNull();
  });
});

describe('subscribeToNotificationManagerChanged', () => {
  it('invokes the listener with the new revision and unsubscribes cleanly', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToNotificationManagerChanged(listener);

    window.dispatchEvent(new CustomEvent(NOTIFICATION_MANAGER_CHANGED_EVENT, { detail: { revision: 9 } }));
    expect(listener).toHaveBeenCalledWith(9);

    unsubscribe();
    listener.mockClear();
    window.dispatchEvent(new CustomEvent(NOTIFICATION_MANAGER_CHANGED_EVENT, { detail: { revision: 10 } }));
    expect(listener).not.toHaveBeenCalled();
  });
});
