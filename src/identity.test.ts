import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationManagerSummary } from './notificationManager';
import {
  ADDRESS_FILTER_KEYS,
  buildIdentityMap,
  chunkAddresses,
  extractAddressesFromRule,
  extractAddressesFromSummary,
  isCurrentIdentityResponse,
  isLikelyQortalAddress,
  parseIdentityResults,
  RESOLVE_IDENTITIES_CHUNK_SIZE,
  resolveIdentities,
} from './identity';

const ADDRESS_A = 'QUE2MRfg3vgxdLxNfLbjBS9jsyBSujeVED';
const ADDRESS_B = 'QUFqK5Xm2ur8vSmoUmvbSPr6xa9dS7B1n8';
const ADDRESS_C = 'QhqAJ5Kf9nx9m2u4vSmoUmvbSPr6xa9dS7';

afterEach(() => {
  delete (window as { qdnRequest?: unknown }).qdnRequest;
});

describe('isLikelyQortalAddress', () => {
  it('accepts Base58, Q-prefixed, address-length strings', () => {
    expect(isLikelyQortalAddress(ADDRESS_A)).toBe(true);
    expect(isLikelyQortalAddress(ADDRESS_B)).toBe(true);
  });

  it('rejects non-strings, wrong prefix, invalid Base58 characters, and mis-sized values', () => {
    expect(isLikelyQortalAddress(123)).toBe(false);
    expect(isLikelyQortalAddress(null)).toBe(false);
    expect(isLikelyQortalAddress('AUE2MRfg3vgxdLxNfLbjBS9jsyBSujeVED')).toBe(false);
    expect(isLikelyQortalAddress('Q0E2MRfg3vgxdLxNfLbjBS9jsyBSujeVED')).toBe(false);
    expect(isLikelyQortalAddress('QshortAddress')).toBe(false);
  });
});

describe('extractAddressesFromRule', () => {
  it('collects address-shaped values only from the four address filter keys', () => {
    const rule = {
      notificationId: 'n1',
      event: 'CHAT_MESSAGE' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      maskedFilterKeys: [],
      filters: {
        address: ADDRESS_A,
        involving: [ADDRESS_B, ADDRESS_C],
        recipient: 'not-an-address',
        txGroupId: 0,
        accountName: ADDRESS_A,
      },
    };

    expect(extractAddressesFromRule(rule)).toEqual([ADDRESS_A, ADDRESS_B, ADDRESS_C]);
  });

  it('returns an empty array when no filters carry addresses', () => {
    expect(
      extractAddressesFromRule({
        notificationId: 'n1',
        event: 'CHAT_MESSAGE',
        createdAt: '2026-01-01T00:00:00.000Z',
        maskedFilterKeys: ['involving'],
        filters: { txGroupId: 0 },
      }),
    ).toEqual([]);
  });
});

describe('extractAddressesFromSummary', () => {
  it('deduplicates addresses across every app and rule', () => {
    const summary: NotificationManagerSummary = {
      version: 1,
      revision: 1,
      apps: [
        {
          appKey: 'qdn://APP/Chat/Chat',
          grant: { grantedAt: '2026-01-01T00:00:00.000Z' },
          rules: [
            {
              notificationId: 'r1',
              event: 'CHAT_MESSAGE',
              createdAt: '2026-01-01T00:00:00.000Z',
              maskedFilterKeys: [],
              filters: { sender: ADDRESS_A, involving: [ADDRESS_A, ADDRESS_B] },
            },
          ],
        },
        {
          appKey: 'qdn://APP/Boards/Boards',
          grant: { grantedAt: '2026-01-01T00:00:00.000Z' },
          rules: [
            {
              notificationId: 'r2',
              event: 'PAYMENT_RECEIVED',
              createdAt: '2026-01-01T00:00:00.000Z',
              maskedFilterKeys: [],
              filters: { recipient: ADDRESS_C },
            },
          ],
        },
      ],
    };

    expect(extractAddressesFromSummary(summary)).toEqual([ADDRESS_A, ADDRESS_B, ADDRESS_C]);
  });

  it('lists every address filter key that Home can expose', () => {
    expect(ADDRESS_FILTER_KEYS).toEqual(['address', 'involving', 'recipient', 'sender']);
  });
});

describe('chunkAddresses', () => {
  it('splits into RESOLVE_IDENTITIES-sized batches of at most 500 by default', () => {
    const addresses = Array.from({ length: 1200 }, (_, index) => `addr-${index}`);
    const chunks = chunkAddresses(addresses);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(RESOLVE_IDENTITIES_CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(RESOLVE_IDENTITIES_CHUNK_SIZE);
    expect(chunks[2]).toHaveLength(200);
  });

  it('returns no chunks for an empty list and one chunk when under the size', () => {
    expect(chunkAddresses([])).toEqual([]);
    expect(chunkAddresses(['a', 'b'])).toEqual([['a', 'b']]);
  });

  it('rejects a non-positive chunk size', () => {
    expect(() => chunkAddresses(['a'], 0)).toThrow();
    expect(() => chunkAddresses(['a'], -5)).toThrow();
  });
});

describe('parseIdentityResults', () => {
  it('keeps only well-formed entries with an address-shaped address', () => {
    const results = parseIdentityResults([
      { address: ADDRESS_A, name: 'Alice', avatarSrc: 'qdn://APP/Avatars/alice' },
      { address: ADDRESS_B, name: '  ', avatarSrc: '  ' },
      { address: 'not-an-address', name: 'Ghost' },
      { address: ADDRESS_C },
      'garbage',
      null,
    ]);

    expect(results).toEqual([
      { address: ADDRESS_A, name: 'Alice', avatarSrc: 'qdn://APP/Avatars/alice' },
      { address: ADDRESS_B, name: null, avatarSrc: null },
      { address: ADDRESS_C, name: null, avatarSrc: null },
    ]);
  });

  it('returns an empty array for a non-array response', () => {
    expect(parseIdentityResults(null)).toEqual([]);
    expect(parseIdentityResults({ address: ADDRESS_A })).toEqual([]);
  });
});

describe('resolveIdentities', () => {
  it('makes no bridge call for an empty address list', async () => {
    const bridge = vi.fn();
    window.qdnRequest = bridge;

    await expect(resolveIdentities([])).resolves.toEqual([]);
    expect(bridge).not.toHaveBeenCalled();
  });

  it('batches addresses into chunks of at most 500 and merges the responses', async () => {
    const addresses = Array.from({ length: 620 }, (_, index) => `addr-${index}`);
    const bridge = vi.fn().mockImplementation(({ addresses: batch }: { addresses: string[] }) =>
      Promise.resolve(batch.map((address) => ({ address: ADDRESS_A, name: address, avatarSrc: null }))),
    );
    window.qdnRequest = bridge;

    const results = await resolveIdentities(addresses);

    expect(bridge).toHaveBeenCalledTimes(2);
    expect(bridge).toHaveBeenNthCalledWith(1, { action: 'RESOLVE_IDENTITIES', addresses: addresses.slice(0, 500) });
    expect(bridge).toHaveBeenNthCalledWith(2, { action: 'RESOLVE_IDENTITIES', addresses: addresses.slice(500) });
    expect(results).toHaveLength(620);
  });
});

describe('buildIdentityMap', () => {
  it('indexes identity results by address', () => {
    const map = buildIdentityMap([
      { address: ADDRESS_A, name: 'Alice', avatarSrc: null },
      { address: ADDRESS_B, name: null, avatarSrc: 'qdn://APP/Avatars/bob' },
    ]);

    expect(map.get(ADDRESS_A)).toEqual({ address: ADDRESS_A, name: 'Alice', avatarSrc: null });
    expect(map.get(ADDRESS_B)?.avatarSrc).toBe('qdn://APP/Avatars/bob');
    expect(map.get(ADDRESS_C)).toBeUndefined();
  });
});

describe('isCurrentIdentityResponse', () => {
  it('accepts a response only when its request id is still the latest', () => {
    expect(isCurrentIdentityResponse(1, 1)).toBe(true);
    expect(isCurrentIdentityResponse(1, 2)).toBe(false);
  });
});
