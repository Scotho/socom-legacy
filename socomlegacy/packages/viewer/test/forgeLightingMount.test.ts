// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mesh, type Scene } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { mountMatch, type MatchRenderer, type MatchWindow } from '../src/matchMount';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { pinnedMatchSocket } from '../src/connectHost';
import { blankLibraryMap, floorMesh } from '../src/forge/matchMap';
import { atmosphereTarget } from '../src/forge/lightingBaseline';
import { fogUniforms } from '../src/fog';
import type { GameLobbyHandOff } from '../src/gameLobbyHost';
import type { ServerEvent } from '../src/net/protocol';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
describe('actual match mount opts into Forge lighting only', () => {
  it.each([null, 0])('preserves default identity or grades Night including late scene content and restores on close (%s)', async timeOfDay => {
    const socket = { binaryType: '', readyState: 1, send() {}, close() {} } as unknown as WebSocketLike;
    const idle: NetWalk = { setNetTap() {}, respawn: () => false, nudge() {}, setLocked() {} };
    const client = new NetClient({ url: 'loopback:', map: 'MP2', name: 'fixture', socket: () => socket }, idle);
    const welcome = { type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'fixture',
      players: [], rules: 'classic', round: 1, rounds: 11, ghost: false } as unknown as ServerEvent;
    socket.onopen?.({}); socket.onmessage?.({ data: JSON.stringify(welcome) });
    const handOff: GameLobbyHandOff = { mediusWorldId: 0, gameName: 'FORGE', mission: 'MP2', lateJoiner: false, client,
      pinned: pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false),
      ticket: '', held: true, welcome: welcome as GameLobbyHandOff['welcome'], roundStart: null };
    const frames = new Map<number, FrameRequestCallback>(); let next = 0, now = 0;
    const win: MatchWindow = { requestAnimationFrame: cb => { frames.set(++next, cb); return next; }, cancelAnimationFrame: id => { frames.delete(id); },
      addEventListener() {}, removeEventListener() {}, navigator: { getGamepads: () => [] } };
    let scene!: Scene;
    const renderer = { backend: 'webgpu', render: (s: Scene) => { scene = s; }, resize() {}, setClearColor() {},
      renderer: { autoClear: true, getDrawingBufferSize: (v: { x: number; y: number }) => { v.x = 640; v.y = 448; return v; }, render() {} } } as unknown as MatchRenderer;
    const map = blankLibraryMap('MP2', 1200); map.world = [floorMesh(1200)];
    const match = mountMatch(document.body, { client, events: [welcome], handOff, holds() {},
      ...(timeOfDay === null ? {} : { forgeLighting: { timeOfDay, baseline: 0.18 } }),
      assets: Promise.resolve({ map, clips: null }), renderer: async () => renderer, win });
    try {
      await new Promise(r => setTimeout(r, 0));
      const frame = () => { const pending = [...frames.values()]; frames.clear(); now += 16; pending.forEach(cb => cb(now)); };
      frame();
      const worldMaterials: MeshBasicNodeMaterial[] = [];
      scene.traverse(o => { if (o instanceof Mesh && o.material instanceof MeshBasicNodeMaterial) worldMaterials.push(o.material); });
      expect(worldMaterials.length).toBeGreaterThan(0);
      for (const m of worldMaterials) expect(Object.hasOwn(m, 'setupOutput')).toBe(timeOfDay !== null);
      const late = new MeshBasicNodeMaterial(), original = late.setupOutput, dispose = vi.spyOn(late, 'dispose');
      scene.add(new Mesh(undefined, late)); frame();
      expect(Object.hasOwn(late, 'setupOutput')).toBe(timeOfDay !== null);
      if (timeOfDay !== null) {
        const color = fogUniforms(scene)!.color.value;
        expect([color.r, color.g, color.b]).toEqual(atmosphereTarget(timeOfDay));
      }
      match.close();
      expect(late.setupOutput).toBe(original); expect(Object.hasOwn(late, 'customProgramCacheKey')).toBe(false);
      expect(dispose).not.toHaveBeenCalled();
    } finally { match.close(); }
  });
});
