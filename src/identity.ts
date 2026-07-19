import { qdnRequest } from './qdnRequest';
import type { NotificationManagerRule, NotificationManagerSummary } from './notificationManager';

// Home's NOTIFICATION_MANAGER_GET only ever exposes a filter value under
// these four keys once it has validated the value as a Qortal address —
// every other address-shaped value (contacts, stored bindings, etc.) stays
// masked. Notify mirrors that allowlist here rather than trusting key names
// alone, and re-checks the address shape defensively since filter values
// are otherwise untyped bridge data.
export const ADDRESS_FILTER_KEYS = ['address', 'involving', 'recipient', 'sender'] as const;
export type AddressFilterKey = (typeof ADDRESS_FILTER_KEYS)[number];

const ADDRESS_FILTER_KEY_SET = new Set<string>(ADDRESS_FILTER_KEYS);

// Qortal addresses are Base58Check-encoded 25-byte payloads that always
// start with 'Q'; this is a shape check, not a checksum verification —
// Home is the authority on whether a value is truly a live address.
const QORTAL_ADDRESS_PATTERN = /^Q[1-9A-HJ-NP-Za-km-z]{24,35}$/;

export function isLikelyQortalAddress(value: unknown): value is string {
  return typeof value === 'string' && QORTAL_ADDRESS_PATTERN.test(value);
}

function isAddressFilterKey(key: string): key is AddressFilterKey {
  return ADDRESS_FILTER_KEY_SET.has(key);
}

/** Collects the address-shaped values out of one rule's four address filter keys. */
export function extractAddressesFromRule(rule: NotificationManagerRule): string[] {
  const found: string[] = [];

  for (const [key, value] of Object.entries(rule.filters)) {
    if (!isAddressFilterKey(key)) {
      continue;
    }

    if (isLikelyQortalAddress(value)) {
      found.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isLikelyQortalAddress(item)) {
          found.push(item);
        }
      }
    }
  }

  return found;
}

/** Deduplicated set of every address-filter value exposed anywhere in the summary. */
export function extractAddressesFromSummary(summary: NotificationManagerSummary): string[] {
  const addresses = new Set<string>();

  for (const app of summary.apps) {
    for (const rule of app.rules) {
      for (const address of extractAddressesFromRule(rule)) {
        addresses.add(address);
      }
    }
  }

  return [...addresses];
}

export const RESOLVE_IDENTITIES_CHUNK_SIZE = 500;

/** Splits addresses into RESOLVE_IDENTITIES-sized batches (500 max per call). */
export function chunkAddresses(addresses: string[], size = RESOLVE_IDENTITIES_CHUNK_SIZE): string[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error('chunk size must be a positive integer');
  }

  const chunks: string[][] = [];

  for (let index = 0; index < addresses.length; index += size) {
    chunks.push(addresses.slice(index, index + size));
  }

  return chunks;
}

export type IdentityResult = {
  address: string;
  avatarSrc: string | null;
  name: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Defensively parses RESOLVE_IDENTITIES's `[{ address, name, avatarSrc }]` response. */
export function parseIdentityResults(value: unknown): IdentityResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const results: IdentityResult[] = [];

  for (const item of value) {
    if (!isRecord(item) || !isLikelyQortalAddress(item.address)) {
      continue;
    }

    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : null;
    const avatarSrc = typeof item.avatarSrc === 'string' && item.avatarSrc.trim() ? item.avatarSrc.trim() : null;

    results.push({ address: item.address, avatarSrc, name });
  }

  return results;
}

/** Resolves every address through RESOLVE_IDENTITIES in chunks of at most 500. */
export async function resolveIdentities(addresses: string[]): Promise<IdentityResult[]> {
  if (addresses.length === 0) {
    return [];
  }

  const batches = await Promise.all(
    chunkAddresses(addresses).map((batch) =>
      qdnRequest<unknown>({ action: 'RESOLVE_IDENTITIES', addresses: batch }).then(parseIdentityResults),
    ),
  );

  return batches.flat();
}

export function buildIdentityMap(results: IdentityResult[]): Map<string, IdentityResult> {
  const map = new Map<string, IdentityResult>();

  for (const result of results) {
    map.set(result.address, result);
  }

  return map;
}

/** Same stale/out-of-order guard shape as notification-manager responses, for identity refetches. */
export function isCurrentIdentityResponse(requestId: number, latestRequestId: number): boolean {
  return requestId === latestRequestId;
}
