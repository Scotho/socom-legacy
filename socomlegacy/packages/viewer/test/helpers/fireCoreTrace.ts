import { createHash } from 'node:crypto';
import { buildGrid, BULLET_MARK, DEFAULT_RIFLE, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import type { Fire, FireEvent, FireSource, MarkTable } from '../../src/fire';
import type { MarkClipper } from '../../src/markClip';

export const FIRE_TRACE_MODES = ['fallback', 'table', 'missing-row', 'missing-material', 'clipped', 'callbacks'] as const;
export type FireTraceMode = typeof FIRE_TRACE_MODES[number];
type Engine = Pick<Fire, 'subscribe' | 'setGun' | 'pull' | 'release' | 'update' | 'reload' | 'setWeapon' | 'refundRound' | 'reset' | 'state' | 'dispose'>;
type Factory = (source: FireSource, record: WeaponRecord, random: () => number) => Engine;
export function fireTrace(make: Factory, mode: FireTraceMode,
  configure: (fire: Engine, table: MarkTable | null, clipped: boolean, clip: MarkClipper, shade: () => [number, number, number, number]) => void) {
  const calls: unknown[] = [], events: FireEvent[] = [], states: unknown[] = [];
  let seed = 1;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const value = seed / 4294967296; calls.push(['random', value]); return value; };
  const wall: WorldPoly = { modelName: 'world', path: 'world/wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: new Float32Array([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30]) };
  if (mode === 'missing-material') delete (wall as Partial<WorldPoly>).material;
  const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], [wall],
    [{ modelName: 'world', path: 'world', first: 0, count: 1 }]);
  let pitch = 0;
  const source: FireSource = { grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }),
    look: () => ({ pitch, stance: 'stand' }), kickPitch: turn => { pitch += turn; calls.push(['kick', turn]); }, reloadSeconds: () => 0.3 };
  const fire = make(source, DEFAULT_RIFLE, random);
  const callback = (name: string) => { calls.push([name]); if (mode === 'callbacks') random(); };
  const table: MarkTable | null = mode === 'fallback' || mode === 'clipped' ? null : {
    row: material => { calls.push(['row', material]); return mode === 'missing-row' ? null : BULLET_MARK; },
    bitmap: () => null, material: () => { callback('material'); return null; },
  };
  const clip = { clip: () => { callback('clip'); return 0; }, lastNodePath: null } as unknown as MarkClipper;
  configure(fire, table, mode === 'clipped', clip, () => { callback('shade'); return [1, 1, 1, 1]; });
  fire.subscribe(event => { events.push(event); calls.push(['event', event.type]); });
  fire.setGun({ trigger: down => { calls.push(['trigger', down]); }, round: direction => { calls.push(['cone']); return direction; },
    interval: wait => wait, roundsPerPull: () => Infinity });
  const sample = () => { const { decals: _d, lastShade: _s, ...state } = fire.state(); states.push({ ...state, pitch }); };
  fire.pull(); sample();
  for (let i = 0; i < 24; i++) { fire.update(1 / 60); sample(); }
  fire.release(); fire.reload();
  for (let i = 0; i < 30; i++) { fire.update(1 / 60); sample(); }
  const shot = events.find((e): e is Extract<FireEvent, { type: 'round' }> => e.type === 'round');
  if (shot?.shot !== undefined) fire.refundRound(shot.shot);
  sample();
  fire.setWeapon({ ...DEFAULT_RIFLE, name: 'trace-sidearm', id: 4 });
  fire.pull(); fire.update(0.1); fire.release(); sample();
  fire.setWeapon(DEFAULT_RIFLE); sample();
  fire.reset(); sample(); fire.dispose();
  return { events, states, calls };
}
export const traceDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function renderedFireTrace(make: Factory, mode: FireTraceMode) {
  return fireTrace(make, mode, (engine, table, clipped, clip, shade) => {
    const fire = engine as Fire;
    fire.setMarks(table); if (clipped) fire.setClip(clip);
    if (mode === 'callbacks') fire.setShade(shade);
  });
}
