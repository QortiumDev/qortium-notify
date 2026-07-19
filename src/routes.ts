// Deep-linkable selection state: `qdn://APP/Notify/Notify?app=<appKey>`
// selects one app's detail view. Home preserves query parameters when it
// renders an app, and keeping the URL in sync (History API, not a reload)
// lets Home's address bar and Back/Forward controls track the open detail
// view, matching the pattern documented in other first-party apps' deep
// links (e.g. qortium-help's `?post=` / `?app=`).

const APP_QUERY_KEY = 'app';

export function readSelectedAppFromLocation(location: Pick<Location, 'search'> = window.location): string | null {
  const params = new URLSearchParams(location.search);
  const value = params.get(APP_QUERY_KEY);

  return value && value.trim() ? value.trim() : null;
}

/** Returns the URL (pathname + search + hash) that should replace/push for a given selection. */
export function buildLocationForSelectedApp(
  location: Pick<Location, 'hash' | 'pathname' | 'search'>,
  appKey: string | null,
): string {
  const params = new URLSearchParams(location.search);

  if (appKey) {
    params.set(APP_QUERY_KEY, appKey);
  } else {
    params.delete(APP_QUERY_KEY);
  }

  const query = params.toString();

  return `${location.pathname}${query ? `?${query}` : ''}${location.hash ?? ''}`;
}

/**
 * Pushes a new history entry when the app selection changes so Back/Forward
 * works, but replaces in place for the initial mount/no-op case so opening
 * the app doesn't add a spurious history entry.
 */
export function writeSelectedAppToLocation(appKey: string | null, push: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  const nextUrl = buildLocationForSelectedApp(window.location, appKey);
  const method = push ? 'pushState' : 'replaceState';

  window.history[method](null, '', nextUrl);
}

export function subscribeToPopState(listener: (appKey: string | null) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = () => listener(readSelectedAppFromLocation());

  window.addEventListener('popstate', handler);

  return () => window.removeEventListener('popstate', handler);
}
