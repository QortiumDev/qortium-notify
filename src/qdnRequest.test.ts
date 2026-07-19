import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBridgeErrorCode, getBridgeState, hasAction, hasHomeBridge, isStaleRevisionError, qdnRequest } from './qdnRequest';

afterEach(() => {
  delete (window as { qdnRequest?: unknown }).qdnRequest;
});

describe('hasHomeBridge', () => {
  it('is false without an injected bridge and true once one exists', () => {
    expect(hasHomeBridge()).toBe(false);

    window.qdnRequest = vi.fn();

    expect(hasHomeBridge()).toBe(true);
  });
});

describe('qdnRequest', () => {
  it('rejects a request with no string action', async () => {
    await expect(qdnRequest({} as never)).rejects.toThrow('QDN requests must include an action.');
  });

  it('delegates to window.qdnRequest when present', async () => {
    const bridge = vi.fn().mockResolvedValue({ granted: true });
    window.qdnRequest = bridge;

    const result = await qdnRequest({ action: 'NOTIFICATION_MANAGER_HAS_PERMISSION' });

    expect(bridge).toHaveBeenCalledWith({ action: 'NOTIFICATION_MANAGER_HAS_PERMISSION' });
    expect(result).toEqual({ granted: true });
  });

  it('answers SHOW_ACTIONS and WHICH_UI locally without a bridge', async () => {
    await expect(qdnRequest({ action: 'SHOW_ACTIONS' })).resolves.toEqual(['SHOW_ACTIONS', 'WHICH_UI']);
    await expect(qdnRequest({ action: 'WHICH_UI' })).resolves.toBe('BROWSER_DEV');
  });

  it('rejects manager actions locally with a Home-required message', async () => {
    await expect(qdnRequest({ action: 'NOTIFICATION_MANAGER_GET' })).rejects.toThrow('requires Qortium Home');
  });
});

describe('getBridgeState', () => {
  it('reports actions and UI from the bridge', async () => {
    const bridge = vi.fn((request: { action: string }) => {
      if (request.action === 'SHOW_ACTIONS') return Promise.resolve(['SHOW_ACTIONS', 'NOTIFICATION_MANAGER_GET']);
      return Promise.reject(new Error('unexpected'));
    });
    window.qdnRequest = bridge as unknown as NonNullable<typeof window.qdnRequest>;

    const state = await getBridgeState();

    expect(state.isHomeBridge).toBe(true);
    expect(state.ui).toBe('QORTIUM_HOME');
    expect(state.actions).toEqual(['SHOW_ACTIONS', 'NOTIFICATION_MANAGER_GET']);
  });

  it('falls back to the local read-only action list when SHOW_ACTIONS throws', async () => {
    window.qdnRequest = vi.fn().mockRejectedValue(new Error('nope'));

    const state = await getBridgeState();

    expect(state.actions).toEqual(['SHOW_ACTIONS', 'WHICH_UI']);
  });

  it('ignores non-string entries in a malformed SHOW_ACTIONS response', async () => {
    window.qdnRequest = vi.fn().mockResolvedValue(['SHOW_ACTIONS', 42, null, 'NOTIFICATION_MANAGER_GET']);

    const state = await getBridgeState();

    expect(state.actions).toEqual(['SHOW_ACTIONS', 'NOTIFICATION_MANAGER_GET']);
  });
});

describe('hasAction', () => {
  it('matches case-insensitively against any candidate', () => {
    const actions = ['show_actions', 'NOTIFICATION_MANAGER_GET'];

    expect(hasAction(actions, 'SHOW_ACTIONS')).toBe(true);
    expect(hasAction(actions, 'notification_manager_get')).toBe(true);
    expect(hasAction(actions, 'BOOKMARKS_GET', 'NOTIFICATION_MANAGER_REVOKE')).toBe(false);
  });
});

describe('bridge error helpers', () => {
  it('extracts a coded error and identifies HOME_DATA_STALE', () => {
    const staleError = Object.assign(new Error('stale'), { code: 'HOME_DATA_STALE' });
    const plainError = new Error('boom');

    expect(getBridgeErrorCode(staleError)).toBe('HOME_DATA_STALE');
    expect(getBridgeErrorCode(plainError)).toBeUndefined();
    expect(isStaleRevisionError(staleError)).toBe(true);
    expect(isStaleRevisionError(plainError)).toBe(false);
  });
});
