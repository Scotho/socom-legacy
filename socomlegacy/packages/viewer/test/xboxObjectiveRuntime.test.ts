// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Matrix4 } from 'three';
import { packGround } from '../src/walk';
import { bareMeta } from '../src/worldState';
import type { ClientEvent, ServerEvent } from '../src/net/protocol';
import type { WebSocketLike } from '../src/net/client';
import type { BodyRig } from '../src/xboxPrototype/runtimeAssets';
import { walkingRuntime } from '../src/xboxPrototype/walkingRuntime';

const clean: (() => void)[] = [];
afterEach(() => { for (const dispose of clean.splice(0).reverse()) dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('mounts bomb state before the first rendered frame and sends one drop for a short keyboard release', () => {
  const sent: ClientEvent[] = [];
  let socket!: WebSocketLike;
  vi.stubGlobal('WebSocket', class {
    readyState = 1; bufferedAmount = 0; binaryType = 'arraybuffer';
    onopen = null; onclose = null; onmessage = null; onerror = null;
    constructor() { socket = this; }
    send(value: string | ArrayBuffer | ArrayBufferView) { if (typeof value === 'string') sent.push(JSON.parse(value) as ClientEvent); }
    close() { this.readyState = 3; }
  });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const canvas = document.createElement('canvas'); document.body.append(canvas); clean.push(() => canvas.remove());
  const ground = packGround({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [{ modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-200, 0, 200, 200, 0, 200, 200, 0, -200, -200, 0, -200]) }],
    [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }]);
  const identity = () => new Float32Array(new Matrix4().elements);
  const body: BodyRig = { model: 'fixture', height: 20, at: null,
    fittings: [{ name: 'Satchel', model: 'satchel', part: 0, offset: identity() }],
    parts: ['skel_root', 'rhand'].map((name, i) => ({ name, parent: i ? 0 : -1,
      bindLocal: identity(), bindWorld: identity(), bbox: new Float32Array([-1, -1, -1, 1, 1, 1]) })) };
  const runtime = walkingRuntime(canvas, { ground, meta: bareMeta(), doors: [], camera: null, origin: [0, 0, 0], metersPerUnit: 0.1 },
    { clips: [], table: null }, [body], { url: 'ws://fixture.invalid', map: 'MP2', name: 'Fixture' });
  clean.push(() => runtime.dispose()); canvas.focus(); socket.onopen?.({});
  const server = (event: ServerEvent) => socket.onmessage?.({ data: JSON.stringify(event) });
  const bomb = { state: 2, pos: [0, 0, 0], carrier: 1, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 };
  server({ type: 'welcome', id: 1, version: 4, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0,
    name: 'Fixture', players: [{ id: 1, name: 'Fixture', team: 'seal' }], phase: 'play', objective: bomb } as ServerEvent);
  server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 });
  runtime.fly.setPose({ pitch: -20 });
  const frame = runtime.step(1 / 60, performance.now());
  expect(frame.body.gear?.get('Satchel')).toBe(true);
  expect(frame.objects).toEqual([]);
  expect(runtime.report()).toHaveProperty('objectives.context', 'bombDrop');
  const key = (type: 'keydown' | 'keyup') => canvas.dispatchEvent(new KeyboardEvent(type, { code: 'KeyX', bubbles: true }));
  key('keydown'); key('keyup');
  runtime.step(1 / 60, performance.now()); runtime.step(1 / 60, performance.now());
  const drops = sent.filter(event => event.type === 'bombAction' && event.action === 'drop');
  expect(drops).toHaveLength(1);
  expect(drops[0]).toMatchObject({ type: 'bombAction', action: 'drop' });
  expect(runtime.client()!.lastSeq()).toBeGreaterThan(0);
  runtime.dispose(); expect(runtime.frame.body.gear?.get('Satchel')).toBe(false);
});
