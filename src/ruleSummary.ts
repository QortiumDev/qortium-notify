import type { MessageKey, TranslateFunction } from './i18n';
import { ADDRESS_FILTER_KEYS, isLikelyQortalAddress } from './identity';
import type { NotificationEvent, NotificationManagerApp, NotificationManagerRule } from './notificationManager';

// Pure display transforms over the sanitized summary Home hands back — no
// bridge calls here, so these are fully unit-testable without a QDN app host.

const EVENT_LABELS: Record<NotificationEvent, string> = {
  RESOURCE_PUBLISHED: 'New QDN resource published',
  PAYMENT_RECEIVED: 'Payment received',
  CHAT_MESSAGE: 'Chat message',
  TRANSACTION_CONFIRMED: 'Transaction confirmed',
  FOREIGN_PAYMENT_RECEIVED: 'Foreign payment received',
};

const EVENT_LABEL_KEYS: Record<NotificationEvent, MessageKey> = {
  RESOURCE_PUBLISHED: 'event.resourcePublished',
  PAYMENT_RECEIVED: 'event.paymentReceived',
  CHAT_MESSAGE: 'event.chatMessage',
  TRANSACTION_CONFIRMED: 'event.transactionConfirmed',
  FOREIGN_PAYMENT_RECEIVED: 'event.foreignPaymentReceived',
};

export function formatEventLabel(event: NotificationEvent, translate?: TranslateFunction): string {
  return translate ? translate(EVENT_LABEL_KEYS[event]) : (EVENT_LABELS[event] ?? event);
}

const QDN_APP_KEY_PATTERN = /^qdn:\/\/(APP|WEBSITE)\/([^/?#]+)\/?([^/?#]*)$/i;

export type AppKeyParts = {
  identifier: string | null;
  name: string;
  service: 'APP' | 'WEBSITE';
};

/** Parses a manager `appKey` into its display parts, or null if malformed. */
export function parseAppKey(appKey: string): AppKeyParts | null {
  const match = QDN_APP_KEY_PATTERN.exec(appKey.trim());

  if (!match) {
    return null;
  }

  const [, service, name, identifier] = match;

  return {
    service: service.toUpperCase() as 'APP' | 'WEBSITE',
    name,
    identifier: identifier && identifier !== name ? identifier : null,
  };
}

/** Human-friendly label for an app row: "Chat" or "Chat / chat-legacy" when the identifier differs from the name. */
export function formatAppDisplayName(appKey: string): string {
  const parts = parseAppKey(appKey);

  if (!parts) {
    return appKey;
  }

  return parts.identifier ? `${parts.name} / ${parts.identifier}` : parts.name;
}

const ADDRESS_FILTER_KEY_SET = new Set<string>(ADDRESS_FILTER_KEYS);

/** True for the four filter keys Home may expose as validated Qortal addresses. */
export function isAddressFilterKey(key: string): boolean {
  return ADDRESS_FILTER_KEY_SET.has(key);
}

export type VisibleFilterEntry = {
  isAddressFilter: boolean;
  key: string;
  masked: boolean;
  partiallyMasked: boolean;
  value?: boolean | number | string | string[];
};

/** Merges visible filter values with Home's `maskedFilterKeys` into one sorted, renderable list. */
export function getVisibleFilterEntries(rule: NotificationManagerRule): VisibleFilterEntry[] {
  const partiallyMaskedKeys = new Set(rule.partiallyMaskedFilterKeys ?? []);
  const visible: VisibleFilterEntry[] = Object.entries(rule.filters).map(([key, value]) => ({
    isAddressFilter: isAddressFilterKey(key),
    key,
    masked: false,
    partiallyMasked: partiallyMaskedKeys.has(key),
    value,
  }));
  const masked: VisibleFilterEntry[] = rule.maskedFilterKeys.map((key) => ({
    isAddressFilter: isAddressFilterKey(key),
    key,
    masked: true,
    partiallyMasked: false,
  }));

  return [...visible, ...masked].sort((left, right) => left.key.localeCompare(right.key));
}

/** Address-shaped values out of one visible (non-masked) address-filter entry, in original order. */
export function getEntryAddresses(entry: VisibleFilterEntry): string[] {
  if (entry.masked || !entry.isAddressFilter || entry.value === undefined) {
    return [];
  }

  const values: unknown[] = Array.isArray(entry.value) ? entry.value : [entry.value];

  return values.filter(isLikelyQortalAddress);
}

/** Stable sort by display name so re-fetches don't reshuffle the list under the user. */
export function sortAppsByDisplayName(apps: NotificationManagerApp[]): NotificationManagerApp[] {
  return [...apps].sort((left, right) => formatAppDisplayName(left.appKey).localeCompare(formatAppDisplayName(right.appKey)));
}

export function countGrantedApps(apps: NotificationManagerApp[]): number {
  return apps.filter((app) => app.grant !== null).length;
}

export function countMutedApps(apps: NotificationManagerApp[]): number {
  return apps.filter((app) => app.grant?.muted === true).length;
}

export function countRules(app: NotificationManagerApp): number {
  return app.rules.length;
}

export function canMuteApp(app: NotificationManagerApp) {
  return app.grant !== null;
}

export function findAppByKey(apps: NotificationManagerApp[], appKey: string | null): NotificationManagerApp | null {
  if (!appKey) {
    return null;
  }

  return apps.find((app) => app.appKey === appKey) ?? null;
}

const RELATIVE_TIME_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 1000 * 60 * 60 * 24 * 365],
  ['month', 1000 * 60 * 60 * 24 * 30],
  ['day', 1000 * 60 * 60 * 24],
  ['hour', 1000 * 60 * 60],
  ['minute', 1000 * 60],
];

/** Coarse relative-time label ("3 days ago"); falls back to "just now" under a minute. */
export function formatRelativeTime(isoDate: string, now: number, locale = 'en'): string {
  const then = Date.parse(isoDate);

  if (Number.isNaN(then)) {
    return isoDate;
  }

  const diffMs = then - now;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });

  for (const [unit, unitMs] of RELATIVE_TIME_UNITS) {
    if (Math.abs(diffMs) >= unitMs) {
      return formatter.format(Math.round(diffMs / unitMs), unit);
    }
  }

  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'second');
}
