// @vitest-environment jsdom
// N-28 (the Xbox lightweight fork, imbennyhim's; a browser adaptation, product track): Edge on Xbox maps the pad's
// View button to the browser's Back, and a tap moves DOM focus off the match canvas. The fork polled the pad only while
// the canvas held focus, so the pad went dead until a reload. The standard engine polls every frame
// (`../src/main.ts` `gamePad.poll(navigator)`, no focus test); the fork now polls whenever the page is visible.
import { afterEach, expect, it, vi } from 'vitest';
import { Matrix4 } from 'three';
import { packGround } from '../src/walk';
import { bareMeta } from '../src/worldState';
import type { ServerEvent } from '../src/net/protocol';
import type { WebSocketLike } from '../src/net/client';
import type { BodyRig } from '../src/xboxPrototype/runtimeAssets';
import { walkingRuntime } from '../src/xboxPrototype/walkingRuntime';

const clean: (() => void)[] = [];
afterEach(() => { for (const dispose of clean.splice(0).reverse()) dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(axes: number[]) {
  let socket!: WebSocketLike;
  vi.stubGlobal('WebSocket', class {
    readyState = 1; bufferedAmount = 0; binaryType = 'arraybuffer';
    onopen = null; onclose = null; onmessage = null; onerror = null;
    constructor() { socket = this; }
    send() { /* nothing read back */ }
    close() { this.readyState = 3; }
  });
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = { index: 0, id: 'fixture pad', connected: true, mapping: 'standard', axes, buttons, timestamp: 0 };
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  clean.push(() => { delete (navigator as { getGamepads?: unknown }).getGamepads; });
  const canvas = document.createElement('canvas'); document.body.append(canvas); clean.push(() => canvas.remove());   // the runtime makes it focusable (review F3)
  const ground = packGround({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [{ modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]) }],
    [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }]);
  const identity = () => new Float32Array(new Matrix4().elements);
  const body: BodyRig = { model: 'fixture', height: 20, at: null, fittings: [],
    parts: ['skel_root', 'rhand'].map((name, i) => ({ name, parent: i ? 0 : -1,
      bindLocal: identity(), bindWorld: identity(), bbox: new Float32Array([-1, -1, -1, 1, 1, 1]) })) };
  const runtime = walkingRuntime(canvas, { ground, meta: bareMeta(), doors: [], camera: null, origin: [0, 0, 0], metersPerUnit: 0.1 },
    { clips: [], table: null }, [body], { url: 'ws://fixture.invalid', map: 'MP2', name: 'Fixture' });
  clean.push(() => runtime.dispose()); socket.onopen?.({});
  const server = (event: ServerEvent) => socket.onmessage?.({ data: JSON.stringify(event) });
  server({ type: 'welcome', id: 1, version: 4, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0,
    name: 'Fixture', players: [{ id: 1, name: 'Fixture', team: 'seal' }], phase: 'play' } as ServerEvent);
  server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 });
  return { runtime, canvas, pad };
}

const run = (runtime: ReturnType<typeof walkingRuntime>, frames: number) => {
  let now = performance.now();
  for (let i = 0; i < frames; i++) runtime.step(1 / 60, now += 1000 / 60);
};

it('N-28: the left stick still walks after View/Back moves focus off the canvas', () => {
  const { runtime, pad } = mount([0, 0, 0, 0]);
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);   // Edge took focus with View; the canvas is not the active element
  run(runtime, 3);                                   // the pad at rest first (`../src/controllerInput` waits for it)
  const start = [...runtime.report().feet];
  pad.axes[1] = -1;                                  // then the left stick held forward
  run(runtime, 30);
  const feet = runtime.report().feet;
  expect(Math.hypot(feet[0]! - start[0]!, feet[2]! - start[2]!)).toBeGreaterThan(0);
});

it('N-28: a hidden page reads no pad', () => {
  const { runtime, pad } = mount([0, 0, 0, 0]);
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  run(runtime, 3);
  const start = [...runtime.report().feet];
  pad.axes[1] = -1;
  run(runtime, 30);
  expect(runtime.report().feet).toEqual(start);
});

it('N-28: the window regaining focus gives the canvas its keys back', () => {
  const { canvas } = mount([0, 0, 0, 0]);
  document.body.focus();
  expect(document.activeElement).not.toBe(canvas);
  window.dispatchEvent(new Event('focus'));
  expect(document.activeElement).toBe(canvas);
  canvas.blur();
  document.dispatchEvent(new Event('visibilitychange'));
  expect(document.activeElement).toBe(canvas);
});

it('N-28 review: a disposed match takes focus no more (its refocus is let go with it)', () => {
  const { runtime, canvas } = mount([0, 0, 0, 0]);
  runtime.dispose();
  canvas.blur();
  window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'));
  expect(document.activeElement).not.toBe(canvas);
});
