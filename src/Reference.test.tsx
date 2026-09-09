import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Reference, REFERENCE_SNIPPETS, RULE_EXAMPLES, SUMMARY_EXAMPLE } from './Reference';
import { NOTIFICATION_EVENTS, NOTIFICATION_MANAGER_ACTIONS } from './notificationManager';
import { referenceSectionUrl } from './ReferenceNavigation';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
describe('developer reference contract', () => {
  it('has complete sanitized event examples without private account bindings', () => {
    expect(Object.keys(RULE_EXAMPLES)).toEqual([...NOTIFICATION_EVENTS]);
    expect(JSON.parse(REFERENCE_SNIPPETS.summary)).toEqual(SUMMARY_EXAMPLE);
    expect(REFERENCE_SNIPPETS.summary).not.toContain('accountAddress');
    expect(RULE_EXAMPLES.FOREIGN_PAYMENT_RECEIVED.filters).not.toHaveProperty('xpub');
  });
  it('renders an English public reference with selectable code and accessible copying', () => {
    const html = renderToStaticMarkup(<Reference />);
    expect(html).toContain('lang="en" dir="ltr"');
    expect(html).toContain('aria-live="polite"');
    for (const key of Object.keys(REFERENCE_SNIPPETS)) expect(html).toContain(`aria-label="Copy ${key} example"`);
    for (const action of NOTIFICATION_MANAGER_ACTIONS) expect(html).toContain(action);
  });
  it('keeps section links under the current Core path and preserves repeated parameters and fragments', () => {
    expect(referenceSectionUrl('/render/APP/Notify/Notify?view=reference&app=example&host=a&host=b#fragment', 'summary'))
      .toBe('/render/APP/Notify/Notify?view=developers&app=example&host=a&host=b&section=summary#fragment');
  });
  it('runs capability discovery without requesting a permission-prompting read when ungranted', async () => {
    const request = vi.fn(async ({ action }) => action === 'SHOW_ACTIONS' ? NOTIFICATION_MANAGER_ACTIONS : { granted: false });
    await new AsyncFunction('qdnRequest', REFERENCE_SNIPPETS.capabilities)(request);
    expect(request.mock.calls.map(([r]) => r.action)).toEqual(['SHOW_ACTIONS', 'NOTIFICATION_MANAGER_HAS_PERMISSION']);
  });
  it('checks the returned envelope when granted and stops on unsupported hosts', async () => {
    const request = vi.fn(async ({ action }) => action === 'SHOW_ACTIONS' ? NOTIFICATION_MANAGER_ACTIONS : action.endsWith('HAS_PERMISSION') ? { granted: true } : { version: 2, revision: 0, apps: [] });
    await expect(new AsyncFunction('qdnRequest', REFERENCE_SNIPPETS.capabilities)(request)).rejects.toThrow('Unsupported');
    const unavailable = vi.fn(async () => []);
    await expect(new AsyncFunction('qdnRequest', REFERENCE_SNIPPETS.capabilities)(unavailable)).rejects.toThrow('unavailable');
    expect(unavailable).toHaveBeenCalledOnce();
  });
  it('uses the reviewed revision for mute and never silently retries stale requests', async () => {
    const request = vi.fn(async () => { throw Object.assign(new Error('stale'), { code: 'HOME_DATA_STALE' }); });
    const setMuted = await new AsyncFunction('qdnRequest', REFERENCE_SNIPPETS.mute + '\nreturn setMuted;')(request);
    await expect(setMuted({ revision: 42 }, 'qdn://APP/Example/Example', true)).rejects.toMatchObject({ code: 'HOME_DATA_STALE' });
    expect(request).toHaveBeenCalledExactlyOnceWith({ action: 'NOTIFICATION_MANAGER_SET_MUTED', expectedRevision: 42, appKey: 'qdn://APP/Example/Example', muted: true });
  });
  it('writes only the Home notifications setting and resolves deduplicated bounded identity batches', async () => {
    const request = vi.fn(async ({ action, addresses }) => action === 'SHOW_ACTIONS' ? ['GET_HOME_SETTINGS', 'UPDATE_HOME_SETTINGS', 'RESOLVE_IDENTITIES'] : action === 'GET_HOME_SETTINGS' ? { appNotifications: true, theme: 'dark' } : addresses ? addresses.map((address: string) => ({ address, name: null, avatarSrc: null })) : { appNotifications: false });
    await new AsyncFunction('qdnRequest', REFERENCE_SNIPPETS.settings)(request);
    expect(request.mock.calls[2][0]).toEqual({ action: 'UPDATE_HOME_SETTINGS', patch: { appNotifications: false } });
    request.mockClear();
    const resolve = await new AsyncFunction('qdnRequest', REFERENCE_SNIPPETS.identities + '\nreturn resolveVisibleAddresses;')(request);
    const values = Array.from({ length: 501 }, (_, i) => `fixture-${i}`);
    expect(await resolve([...values, values[0]])).toHaveLength(501);
    expect(request.mock.calls.slice(1).map(([r]) => r.addresses.length)).toEqual([500, 1]);
  });
});
