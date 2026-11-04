// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { mountMatch, type MatchRenderer, type MatchWindow } from '../src/matchMount';
import { pinnedMatchSocket } from '../src/connectHost';
import { blankLibraryMap } from '../src/forge/matchMap';
import { createForgePlayDriver } from '../src/forge/agent/play';
import { FlyCamera } from '../src/camera';
import type { GameLobbyHandOff } from '../src/gameLobbyHost';
import type { ServerEvent } from '../src/net/protocol';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
describe('private Forge Play input port on the actual mounted match', () => {
  it.each(['loopback:', 'wss://uncontacted.test/ws'])('feeds normal camera lanes only for private loopback identity (%s)', async (url) => {
    const stick = vi.spyOn(FlyCamera.prototype, 'setStick');
    const source = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
    const idle: NetWalk = { setNetTap: () => undefined, respawn: () => false, nudge: () => undefined, setLocked: () => undefined };
    const client = new NetClient({ url, map: 'MP2', name: 'fixture', socket: () => source }, idle);
    const welcome = { type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'fixture',
      players: [], rules: 'classic', round: 1, rounds: 11, ghost: false } as unknown as ServerEvent;
    source.onopen?.({}); source.onmessage?.({ data: JSON.stringify(welcome) });
    const handOff: GameLobbyHandOff = { mediusWorldId: 0, gameName: 'FORGE', mission: 'MP2', lateJoiner: false, client,
      pinned: pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false),
      ticket: '', held: true, welcome: welcome as GameLobbyHandOff['welcome'], roundStart: null };
    const frames = new Map<number, FrameRequestCallback>(); let next = 0, time = 0;
    const win: MatchWindow = { requestAnimationFrame: (cb) => { frames.set(++next, cb); return next; },
      cancelAnimationFrame: (id) => { frames.delete(id); }, addEventListener: () => undefined, removeEventListener: () => undefined,
      navigator: { getGamepads: () => [] } };
    const renderer = { backend: 'webgpu', render: () => undefined, resize: () => undefined, setClearColor: () => undefined,
      renderer: { autoClear: true, getDrawingBufferSize: (v: { x: number; y: number }) => { v.x = 640; v.y = 448; return v; }, render: () => undefined } } as unknown as MatchRenderer;
    const driver = createForgePlayDriver({ now: () => time });
    const match = mountMatch(document.body, { client, events: [welcome], handOff, holds: () => undefined, normalInput: driver.port,
      assets: Promise.resolve({ map: blankLibraryMap('MP2', 1200), clips: null }), renderer: async () => renderer, win });
    await new Promise((r) => setTimeout(r, 0));
    const frame = (): void => { const pending = [...frames.values()]; frames.clear(); time += 16; pending.forEach((cb) => cb(time)); };
    frame();
    if (url === 'loopback:') expect(driver.read()).toMatchObject({ local: true, ready: true });
    else expect(driver.read()).toBeNull();
    expect(driver.execute('input.set', { moveY: 1 }).ok).toBe(url === 'loopback:');
    frame();
    expect(stick.mock.calls.some(([x, y]) => x === 0 && y === 1)).toBe(url === 'loopback:');
    match.close();
    expect(driver.input().moveY).toBe(0);
    expect(driver.read()).toBeNull();
  });
});
