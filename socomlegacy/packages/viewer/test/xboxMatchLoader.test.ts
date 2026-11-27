// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { MatchAssets, MatchLoader, MatchMountOptions } from '../src/matchMount';
import type { NetClient } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { lightweightMatchLoader, lightweightMatchWanted, LIGHTWEIGHT_MATCH_KEY, type LightweightMatchReport } from '../src/xboxPrototype/matchLoader';

/**
 * The lightweight match's loader (a browser adaptation, opt-in; `../src/xboxPrototype/matchLoader`): what it hands on to
 * the page's own loader, and what a mount does with the lobby's client BEFORE the lightweight runtime exists -- the
 * part a unit test can hold without a WebGL2 context. The mounted runtime is the rendered runs' evidence.
 */
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function inner(): MatchLoader & { calls: string[]; settle(assets: MatchAssets | null): void } {
  const calls: string[] = [];
  let settle = (_a: MatchAssets | null): void => {};
  const loading = new Promise<MatchAssets | null>((resolve) => { settle = resolve; });
  return {
    calls, settle,
    load: (mission) => { calls.push(`load:${mission}`); return loading; },
    prepare: (mission) => { calls.push(`prepare:${mission}`); return Promise.resolve(); },
    holds: () => 'prepared',
    dropPrepared: () => { calls.push('dropPrepared'); },
    reseat: () => { calls.push('reseat'); },
    mount: () => { throw new Error('the production mount must not be reached'); },
    dispose: () => { calls.push('dispose'); },
  };
}

function client(state: NetClient['state'] = 'open') {
  const listeners = new Set<(event: ServerEvent) => void>();
  const made = {
    url: 'ws://127.0.0.1:1/ws', state, close: vi.fn(() => { made.state = 'closed'; }),
    on: (listener: (event: ServerEvent) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    listeners,
  };
  return made;
}

/** The fake as the loader takes it: only `url`, `state`, `on` and `close` are read before the runtime exists. */
const net = (c: ReturnType<typeof client>): NetClient => c as unknown as NetClient;
const options = (c: ReturnType<typeof client>): Omit<MatchMountOptions, 'assets'> =>
  ({ client: net(c), events: [], handOff: { mission: 'MP2' } } as unknown as Omit<MatchMountOptions, 'assets'>);
const report = (): LightweightMatchReport | null =>
  (window as unknown as { __lightweightMatch?: () => LightweightMatchReport }).__lightweightMatch?.() ?? null;

describe('the lightweight match loader', () => {
  it('leaves loading to the page\'s own loader: a prepare is the decode alone, and nothing is ever held prepared', async () => {
    const page = inner(), loader = lightweightMatchLoader(page, document);
    void loader.load('MP2'); void loader.prepare('MP2');
    loader.dropPrepared(); loader.reseat(); loader.dispose();
    expect(page.calls).toEqual(['load:MP2', 'load:MP2', 'dropPrepared', 'reseat', 'dispose']);   // never the production prepare
    expect(loader.holds('MP2')).toBeNull();
  });

  it('a mount stands its own canvas and waits on the mission\'s decode, with the lobby\'s client listened to meanwhile', async () => {
    const page = inner(), c = client(), loader = lightweightMatchLoader(page, document);
    const mounted = loader.mount(document.body, options(c));
    expect(mounted.canvas.isConnected).toBe(true);
    expect([mounted.canvas.width, mounted.canvas.height]).toEqual([640, 448]);
    expect(page.calls).toEqual(['load:MP2']);
    expect(c.listeners.size).toBe(1);                              // the room's events kept for the adoption
    expect(report()).toMatchObject({ stage: 'loading', error: '', frames: 0 });
    expect(mounted.ended()).toBeNull(); expect(mounted.net()).toBeNull();
    mounted.close();
  });

  it('a release before the runtime exists hands the open client back unclosed and leaves nothing of the mount', async () => {
    const page = inner(), c = client(), loader = lightweightMatchLoader(page, document);
    const mounted = loader.mount(document.body, options(c));
    expect(mounted.release()).toBe(net(c));
    expect(c.close).not.toHaveBeenCalled();
    expect(c.listeners.size).toBe(0);
    expect(mounted.canvas.isConnected).toBe(false);
    expect(report()).toBeNull();
    expect(mounted.release()).toBeNull();                          // once
    page.settle(null); await flush();                              // the decode landing afterwards starts nothing
    expect(report()).toBeNull();
  });

  it('a release with the client no longer open closes it and gives none back; a close closes it', () => {
    const page = inner(), loader = lightweightMatchLoader(page, document);
    const lost = client('closed'), first = loader.mount(document.body, options(lost));
    expect(first.release()).toBeNull();
    expect(lost.close).toHaveBeenCalledTimes(1);
    const open = client(), second = loader.mount(document.body, options(open));
    second.close();
    expect(open.close).toHaveBeenCalledTimes(1);
    expect(second.canvas.isConnected).toBe(false);
    second.close();                                                // once
    expect(open.close).toHaveBeenCalledTimes(1);
  });

  it('a mission that decoded nothing fails the mount where it stands: said, never thrown at the page, the client left for the lobby', async () => {
    const page = inner(), c = client(), loader = lightweightMatchLoader(page, document);
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const mounted = loader.mount(document.body, options(c));
      page.settle(null); await flush();
      expect(report()).toMatchObject({ stage: 'failed', frames: 0 });
      expect(report()!.error).toContain('did not decode');
      expect(c.close).not.toHaveBeenCalled();
      expect(mounted.release()).toBe(net(c));                           // the lobby still gets its client back
    } finally { said.mockRestore(); }
  });
});

describe('the lightweight match\'s opt-in', () => {
  // XBOX-INTEGRATE: the saved key is read through the page's storage door (`read`), not the window's storage.
  // LW-DEFAULT: three states -- '1' the lightweight match, '0' the standard engine, anything else the class's default (off
  // for every class today); the address flag (1 or 0) wins over the key; only the Xbox class or pick enters it.
  const xbox = { deviceClass: 'xbox' as const, pick: false };
  const ask = (search: string, stored: string | null, on: { deviceClass: 'xbox' | 'standard'; pick: boolean } = xbox) =>
    lightweightMatchWanted({ location: { search } }, (key: string) => (key === LIGHTWEIGHT_MATCH_KEY ? stored : null), on);
  it("on the Xbox class: the saved '1' or the flag at 1 chooses it; '0', the flag at 0 or nothing (the default, off) does not", () => {
    expect(ask('', '1')).toBe(true);
    expect(ask('?lightweightmatch=1', null)).toBe(true);
    expect(ask('?lightweightmatch=1', '0')).toBe(true);
    expect(ask('', null)).toBe(false);
    expect(ask('', '')).toBe(false);
    expect(ask('', '0')).toBe(false);
    expect(ask('?lightweightmatch=0', '1')).toBe(false);
    expect(ask('?lightweightmatch', 'true')).toBe(false);
    expect(lightweightMatchWanted(undefined, () => null, xbox)).toBe(false);
  });
  it('off the Xbox class and pick nothing chooses it; the pick alone makes the page eligible', () => {
    expect(ask('?lightweightmatch=1', '1', { deviceClass: 'standard', pick: false })).toBe(false);
    expect(ask('', '1', { deviceClass: 'standard', pick: true })).toBe(true);
  });
  it('a storage that throws is the standard engine', () => {
    expect(lightweightMatchWanted({ location: { search: '' } }, () => { throw new Error('refused'); }, xbox)).toBe(false);
  });
});
