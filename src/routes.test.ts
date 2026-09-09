import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildLocationForSelectedApp,
  buildLocationForWorkspace,
  readWorkspaceFromLocation,
  writeWorkspaceToLocation,
  readSelectedAppFromLocation,
  subscribeToPopState,
  writeSelectedAppToLocation,
} from './routes';

describe('readSelectedAppFromLocation', () => {
  it('reads and trims the app query parameter', () => {
    expect(readSelectedAppFromLocation({ search: '?app=qdn%3A%2F%2FAPP%2FChat%2FChat' })).toBe('qdn://APP/Chat/Chat');
  });

  it('returns null when absent or blank', () => {
    expect(readSelectedAppFromLocation({ search: '' })).toBeNull();
    expect(readSelectedAppFromLocation({ search: '?app=' })).toBeNull();
  });
});

describe('buildLocationForSelectedApp', () => {
  const location = { pathname: '/render/APP/Notify/Notify', search: '', hash: '' };

  it('adds the app param when selecting', () => {
    expect(buildLocationForSelectedApp(location, 'qdn://APP/Chat/Chat')).toBe(
      '/render/APP/Notify/Notify?app=qdn%3A%2F%2FAPP%2FChat%2FChat',
    );
  });

  it('removes the app param when clearing the selection', () => {
    const selected = { ...location, search: '?app=qdn%3A%2F%2FAPP%2FChat%2FChat' };

    expect(buildLocationForSelectedApp(selected, null)).toBe('/render/APP/Notify/Notify');
  });

  it('preserves unrelated query params and the hash', () => {
    const withExtras = { ...location, search: '?theme=dark', hash: '#section' };

    expect(buildLocationForSelectedApp(withExtras, 'qdn://APP/Chat/Chat')).toBe(
      '/render/APP/Notify/Notify?theme=dark&app=qdn%3A%2F%2FAPP%2FChat%2FChat#section',
    );
  });
});

describe('writeSelectedAppToLocation', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('pushes a history entry when push is requested', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');

    writeSelectedAppToLocation('qdn://APP/Chat/Chat', true);

    expect(pushSpy).toHaveBeenCalledWith(null, '', expect.stringContaining('app=qdn'));
  });

  it('replaces the current entry when push is not requested', () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    writeSelectedAppToLocation(null, false);

    expect(replaceSpy).toHaveBeenCalled();
  });
});

describe('subscribeToPopState', () => {
  it('invokes the listener with the current selection on popstate and unsubscribes cleanly', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToPopState(listener);

    window.history.pushState(null, '', '?app=qdn%3A%2F%2FAPP%2FChat%2FChat');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(listener).toHaveBeenCalledWith('qdn://APP/Chat/Chat');

    unsubscribe();
    listener.mockClear();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(listener).not.toHaveBeenCalled();

    window.history.replaceState(null, '', '/');
  });
});


describe('workspace routing', () => {
  afterEach(() => { window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); });
  it.each(['developers', 'developer', 'reference'])('recognizes %s independently of an app detail', view => {
    expect(readWorkspaceFromLocation({ search: `?app=qdn://APP/Example/Example&view=${view}` })).toBe('developers');
  });
  it('canonicalizes aliases without dropping app, repeated host parameters or fragment', () => {
    window.history.replaceState({ host: 3 }, '', '/render/APP/Notify/Notify?view=reference&app=example&future=a&future=b&section=summary#retained');
    writeWorkspaceToLocation('developers', false);
    expect(window.history.state).toEqual({ host: 3 });
    expect(new URLSearchParams(location.search).getAll('future')).toEqual(['a', 'b']);
    expect(new URLSearchParams(location.search).get('app')).toBe('example');
    expect(location.hash).toBe('#retained');
    expect(new URLSearchParams(location.search).get('view')).toBe('developers');
    const push = vi.spyOn(window.history, 'pushState');
    writeWorkspaceToLocation('developers', true);
    expect(push).not.toHaveBeenCalled();
    writeWorkspaceToLocation('manager', true);
    expect(push).toHaveBeenCalledOnce();
    expect(location.search).toBe('?app=example&future=a&future=b');
  });
  it('retains developer routing when a background mutation clears the selected app', () => {
    const next = buildLocationForSelectedApp({ pathname: '/', search: '?view=developers&section=mutations&app=example', hash: '#host' }, null);
    expect(next).toBe('/?view=developers&section=mutations#host');
    expect(buildLocationForWorkspace({ pathname: '/', search: '?app=example', hash: '#host' }, 'developers')).toBe('/?app=example&view=developers#host');
  });
});
