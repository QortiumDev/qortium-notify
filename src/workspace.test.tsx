import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { SUMMARY_EXAMPLE } from './Reference';
import { NOTIFICATION_MANAGER_ACTIONS } from './notificationManager';

let root: Root;
let container: HTMLDivElement;
const tab = (index: number) => container.querySelectorAll<HTMLButtonElement>('.workspace-tab')[index];
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function mount() { await act(async () => root.render(<App />)); }
async function traverse(direction: 'back' | 'forward') {
  await act(async () => {
    await new Promise<void>(resolve => {
      window.addEventListener('popstate', () => resolve(), { once: true });
      window.history[direction]();
    });
  });
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({ host: 'retained' }, '', '/?app=qdn%3A%2F%2FAPP%2FExample%2FExample&future=a&future=b#retained');
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  delete window.qdnRequest; vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/');
});
describe('workspace integration', () => {
  it('exposes Developers without a bridge and explains manager unavailability', async () => {
    await mount(); expect(container.querySelector('.bridge-card')).not.toBeNull();
    await click(tab(1)); expect(container.querySelector('.reference')).not.toBeNull();
    await click(tab(0)); expect(container.querySelector('.bridge-card')).not.toBeNull();
  });
  it('never prompts or mutates for ungranted reference navigation/copy', async () => {
    const request = vi.fn(async ({ action }) => action === 'SHOW_ACTIONS' ? NOTIFICATION_MANAGER_ACTIONS : { granted: false });
    window.qdnRequest = request as NonNullable<typeof window.qdnRequest>;
    await mount(); await click(tab(1));
    await click(container.querySelector('a[href*="section=examples"]')!);
    const copy = vi.fn(async () => {}); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    await click(container.querySelector('[aria-label="Copy summary example"]')!);
    expect(copy).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Copied summary');
    expect(request.mock.calls.map(([r]) => r.action)).toEqual(['SHOW_ACTIONS', 'NOTIFICATION_MANAGER_HAS_PERMISSION']);
    await click(tab(0)); expect(container.querySelector('.permission-card')).not.toBeNull();
  });
  it('retains app and selected rules through Developers and actual browser Back/Forward', async () => {
    const request = vi.fn(async ({ action }) => action === 'SHOW_ACTIONS' ? NOTIFICATION_MANAGER_ACTIONS : action.endsWith('HAS_PERMISSION') ? { granted: true } : SUMMARY_EXAMPLE);
    window.qdnRequest = request as NonNullable<typeof window.qdnRequest>;
    await mount();
    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box).not.toBeNull(); await click(box); expect(box.checked).toBe(true);
    await click(tab(1)); expect(container.querySelector('.reference')).not.toBeNull();
    await traverse('back'); expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    await traverse('forward'); expect(container.querySelector('.reference')).not.toBeNull();
    await click(tab(0)); expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(new URLSearchParams(location.search).getAll('future')).toEqual(['a', 'b']);
    expect(location.hash).toBe('#retained'); expect(window.history.state).toEqual({ host: 'retained' });
    expect(request.mock.calls.some(([r]) => /SET_MUTED|REMOVE_RULES|REVOKE/.test(r.action))).toBe(false);
  });
  it('does not leave Developers when an already permitted summary resolves late', async () => {
    let finish!: (value: typeof SUMMARY_EXAMPLE) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    window.qdnRequest = vi.fn(async ({ action }) => action === 'SHOW_ACTIONS' ? NOTIFICATION_MANAGER_ACTIONS : action.endsWith('HAS_PERMISSION') ? { granted: true } : pending) as NonNullable<typeof window.qdnRequest>;
    await mount(); await click(tab(1));
    await act(async () => finish(SUMMARY_EXAMPLE));
    expect(container.querySelector('.reference')).not.toBeNull();
    await click(tab(0)); expect(container.querySelector('.detail-header h2')?.textContent).toBe('Example');
  });
});
