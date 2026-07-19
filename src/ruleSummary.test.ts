import { describe, expect, it } from 'vitest';
import type { NotificationManagerApp, NotificationManagerRule } from './notificationManager';
import {
  canMuteApp,
  countGrantedApps,
  countMutedApps,
  countRules,
  findAppByKey,
  formatAppDisplayName,
  formatEventLabel,
  formatRelativeTime,
  getVisibleFilterEntries,
  parseAppKey,
  sortAppsByDisplayName,
} from './ruleSummary';

const RULE: NotificationManagerRule = {
  notificationId: 'direct-messages',
  event: 'CHAT_MESSAGE',
  filters: { txGroupId: 0 },
  maskedFilterKeys: ['involving'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const APPS: NotificationManagerApp[] = [
  { appKey: 'qdn://APP/Chat/Chat', grant: { grantedAt: '2026-01-01T00:00:00.000Z' }, rules: [RULE] },
  {
    appKey: 'qdn://APP/Boards/Boards',
    grant: { grantedAt: '2026-01-01T00:00:00.000Z', muted: true },
    rules: [],
  },
  { appKey: 'qdn://WEBSITE/Example/example-id', grant: null, rules: [] },
];

describe('formatEventLabel', () => {
  it('returns a friendly label for each known event', () => {
    expect(formatEventLabel('CHAT_MESSAGE')).toBe('Chat message');
    expect(formatEventLabel('FOREIGN_PAYMENT_RECEIVED')).toBe('Foreign payment received');
  });
});

describe('parseAppKey', () => {
  it('parses service, name, and an identifier that differs from the name', () => {
    expect(parseAppKey('qdn://WEBSITE/Example/example-id')).toEqual({
      service: 'WEBSITE',
      name: 'Example',
      identifier: 'example-id',
    });
  });

  it('drops the identifier when it duplicates the name (the common APP/Name/Name case)', () => {
    expect(parseAppKey('qdn://APP/Chat/Chat')).toEqual({ service: 'APP', name: 'Chat', identifier: null });
  });

  it('returns null for a malformed key', () => {
    expect(parseAppKey('not-a-qdn-key')).toBeNull();
  });
});

describe('formatAppDisplayName', () => {
  it('shows just the name when the identifier matches it', () => {
    expect(formatAppDisplayName('qdn://APP/Chat/Chat')).toBe('Chat');
  });

  it('shows name and identifier when they differ', () => {
    expect(formatAppDisplayName('qdn://WEBSITE/Example/example-id')).toBe('Example / example-id');
  });

  it('falls back to the raw key when parsing fails', () => {
    expect(formatAppDisplayName('garbage')).toBe('garbage');
  });
});

describe('getVisibleFilterEntries', () => {
  it('merges visible and masked filter keys into one sorted list', () => {
    expect(getVisibleFilterEntries(RULE)).toEqual([
      { key: 'involving', masked: true },
      { key: 'txGroupId', masked: false, value: 0 },
    ]);
  });

  it('never leaks a masked value even if present on the object incidentally', () => {
    const entries = getVisibleFilterEntries(RULE);
    const maskedEntry = entries.find((entry) => entry.key === 'involving');

    expect(maskedEntry).not.toHaveProperty('value');
  });
});

describe('sortAppsByDisplayName', () => {
  it('sorts by display name without mutating the input', () => {
    const sorted = sortAppsByDisplayName(APPS);

    expect(sorted.map((app) => app.appKey)).toEqual([
      'qdn://APP/Boards/Boards',
      'qdn://APP/Chat/Chat',
      'qdn://WEBSITE/Example/example-id',
    ]);
    expect(APPS[0].appKey).toBe('qdn://APP/Chat/Chat');
  });
});

describe('counters', () => {
  it('counts granted and muted apps independently', () => {
    expect(countGrantedApps(APPS)).toBe(2);
    expect(countMutedApps(APPS)).toBe(1);
  });

  it('counts rules for a single app', () => {
    expect(countRules(APPS[0])).toBe(1);
    expect(countRules(APPS[1])).toBe(0);
  });
});

describe('canMuteApp', () => {
  it('requires a notification grant even when orphan rules remain', () => {
    expect(canMuteApp({ appKey: 'qdn://APP/Chat/Chat', grant: null, rules: [RULE] })).toBe(false);
    expect(canMuteApp({ appKey: 'qdn://APP/Chat/Chat', grant: { grantedAt: '2026-01-01T00:00:00Z' }, rules: [] })).toBe(true);
  });
});

describe('findAppByKey', () => {
  it('finds an app by exact key', () => {
    expect(findAppByKey(APPS, 'qdn://APP/Boards/Boards')?.appKey).toBe('qdn://APP/Boards/Boards');
  });

  it('returns null for no match or a null key', () => {
    expect(findAppByKey(APPS, 'qdn://APP/Missing/Missing')).toBeNull();
    expect(findAppByKey(APPS, null)).toBeNull();
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-01-08T00:00:00.000Z');

  it('formats a past date in coarse units', () => {
    expect(formatRelativeTime('2026-01-01T00:00:00.000Z', now)).toBe('7 days ago');
  });

  it('falls back to "now" for sub-minute differences', () => {
    expect(formatRelativeTime('2026-01-07T23:59:45.000Z', now)).toBe('now');
  });

  it('returns the raw string for an unparsable date', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('not-a-date');
  });
});
