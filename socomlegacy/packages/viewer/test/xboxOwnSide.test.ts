// @vitest-environment jsdom
// N-07 (the Xbox lightweight fork, imbennyhim's; product track): with no character picked, the page's own body wore the
// wrong side's uniform. The room leaves the receiving seat out of `welcome.players` and names its side and type in
// `welcome.team` / `welcome.char` (match room.ts, the welcome); the fork took its own side from the `players` list only,
// so its own body fell back to the SEAL. The standard engine dresses its own body from the client's team
// (`../src/teamBody` `bodyForTeam(map, team, ...)`, `../src/main.ts` / `../src/matchMount.ts`).
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

/** Four bodies: 0 the SEAL, 1 the Terrorist, 2 and 3 each side's second type (`../src/xboxPrototype/runtimeAssets` `typedModels`). */
function mount() {
  let socket!: WebSocketLike;
  vi.stubGlobal('WebSocket', class {
    readyState = 1; bufferedAmount = 0; binaryType = 'arraybuffer';
    onopen = null; onclose = null; onmessage = null; onerror = null;
    constructor() { socket = this; }
    send() { /* nothing read back */ }
    close() { this.readyState = 3; }
  });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const canvas = document.createElement('canvas'); document.body.append(canvas); clean.push(() => canvas.remove());
  const ground = packGround({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [{ modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-200, 0, 200, 200, 0, 200, 200, 0, -200, -200, 0, -200]) }],
    [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }]);
  const identity = () => new Float32Array(new Matrix4().elements);
  const rig = (model: string): BodyRig => ({ model, height: 20, at: null, fittings: [],
    parts: ['skel_root', 'rhand'].map((name, i) => ({ name, parent: i ? 0 : -1,
      bindLocal: identity(), bindWorld: identity(), bbox: new Float32Array([-1, -1, -1, 1, 1, 1]) })) });
  const runtime = walkingRuntime(canvas, { ground, meta: bareMeta(), doors: [], camera: null, origin: [0, 0, 0], metersPerUnit: 0.1,
    typeModels: { seal: [0, 2], terrorist: [1, 3] } },
  { clips: [], table: null }, [rig('seal'), rig('terrorist'), rig('seal2'), rig('terrorist2')],
  { url: 'ws://fixture.invalid', map: 'MP2', name: 'Fixture' });
  clean.push(() => runtime.dispose()); canvas.focus(); socket.onopen?.({});
  const server = (event: ServerEvent) => socket.onmessage?.({ data: JSON.stringify(event) });
  return { runtime, server };
}

const welcome = (extra: Record<string, unknown>) => ({ type: 'welcome', id: 5, version: 4, map: 'MP2', tick: 0, role: 'player',
  team: 'terrorist', queue: 0, name: 'Fixture', players: [{ id: 2, name: 'Other', team: 'seal' }], phase: 'play', ...extra }) as ServerEvent;
const ownModel = (runtime: ReturnType<typeof walkingRuntime>) => { runtime.step(1 / 60, performance.now()); return runtime.step(1 / 60, performance.now()).body.modelIndex; };

it('N-07: a Terrorist seat with no character picked wears the Terrorist body', () => {
  const { runtime, server } = mount();
  server(welcome({}));                               // no `char`: the side's first type
  server({ type: 'spawn', id: 5, at: [0, 0, 0], yaw: 0, after: 0 });
  expect(ownModel(runtime)).toBe(1);
});

// A guard, green before the fix too (the fork's own `teams` hears the seat): the switch must still re-dress the own body.
it("N-07: SWITCH TEAMS in the game lobby dresses the own body as the new side's", () => {
  const { runtime, server } = mount();
  server(welcome({ team: 'seal' }));
  server({ type: 'gameLobby', seats: [{ id: 5, team: 'terrorist' }] } as unknown as ServerEvent);   // the client re-seats on it
  server({ type: 'spawn', id: 5, at: [0, 0, 0], yaw: 0, after: 0 });
  expect(ownModel(runtime)).toBe(1);
});

it("N-07: the welcome's own `char` dresses the own body as that type", () => {
  const { runtime, server } = mount();
  server(welcome({ char: 1 }));                      // the Terrorist's second type, no spawn.char after it
  server({ type: 'spawn', id: 5, at: [0, 0, 0], yaw: 0, after: 0 });
  expect(ownModel(runtime)).toBe(3);
});
