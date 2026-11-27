import { describe, expect, it } from 'vitest';
import { buildGrid, CLAYMORE, ITEM, type Grid, type GridParams, type ThrowableRecord, type V3, type WorldPoly } from '@s2u/scene';
import { GrenadeThrower } from '../src/grenade';
import type { ServerEvent } from '../src/net/protocol';
import { EVENT_CLASS, emptyFold, foldEvent, type ThrowableLookup } from '../src/replay/fold';
import type { PlaySnapshot } from '../src/walk';

/**
 * R4P-224 (the page half; research 235 s10.3; reading, pending review): the room's `chargeGone` -- a dead owner's claymore
 * or PMN removed in a respawn game (`DEAD_OWNER_MINES_CLEAR_READING`), the clear the original sends on the wire
 * (`FUN_003cceb0` -> `FUN_003c7170`, D:L321674) -- takes the page's copy away with no blast, no sound and no trip
 * (`GrenadeCore.removeRemote`), and the replay's fold forgets the charge (`foldEvent`), so a seek's welcome lays none.
 */

const snap = (over: Partial<PlaySnapshot> = {}): PlaySnapshot => ({
  feet: [600, 50, 200], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0, ...over,
} as PlaySnapshot);
const floor = (): Grid => {
  const f: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 50, 2000, 2000, 50, 2000, 2000, 50, -2000, -2000, 50, -2000]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  return buildGrid(params, [], [], [f], [{ modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }]);
};
const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };
const PMN_RECORD: ThrowableRecord = { ...CLAYMORE, name: 'PMN Mine', id: 158, fuse: 8, removal: 10, explosionDamage: 6.5, explosionRadius: 40, proximity: 10, model: 'pmn', icon: 'pmn.tif', capacity: 4 };

describe('R4P-224: chargeGone on the page -- the copy taken away silently (GrenadeCore.removeRemote)', () => {
  /** An offline page (it trips its own copies) with another player PMN (pid 5) and claymore (pid 6) at rest, armed. */
  const page = () => {
    const grid = floor();
    let actors: V3[] = [[600, 50, 200]];                                     // no one near
    const booms: string[] = [];
    const sounds: string[] = [];
    const g = new GrenadeThrower({ grid: () => grid, snapshot: () => snap(), view: () => 'third', actors: () => actors, online: () => false });
    g.setRecords([PMN_RECORD]);
    g.on('explode', (e) => booms.push(e.item));
    g.on('bounce', () => sounds.push('bounce'));
    g.on('detonate', () => sounds.push('detonate'));
    g.launchRemote('PMN Mine', [140, 50.1, 200], [1, 0, 0], 2, { pid: 5 });
    g.launchRemote('Claymore', [300, 50.1, 200], [1, 0, 0], 2, { pid: 6 });
    run(g, PMN_RECORD.fuse + 0.5);                                           // armed (Timer1 8 s), no one near
    expect(g.stats().live.map((l) => [l.pid, l.state])).toEqual([[5, 'rest'], [6, 'rest']]);
    expect(booms).toEqual([]);
    return { g, booms, sounds, walkIn: (): void => { actors = [[143, 50, 200]]; } };
  };

  it('control: offline, a body inside the PMN 10 u trips the copy (the path the removal must close)', () => {
    const { g, booms, walkIn } = page();
    walkIn();
    run(g, 0.5);
    expect(booms).toEqual(['PMN Mine']);
  });

  it('removeRemote takes the PMN and the claymore copies away: gone from the list, no explosion, no sound', () => {
    const { g, booms, sounds } = page();
    g.removeRemote(5);
    expect(g.stats().live.map((l) => l.pid)).toEqual([6]);
    g.removeRemote(6);
    expect(g.stats().live).toEqual([]);
    run(g, 1);
    expect(booms).toEqual([]);
    expect(sounds).toEqual([]);
  });

  it('a PMN copy removed does not trip when a body then walks onto it', () => {
    const { g, booms, walkIn } = page();
    g.removeRemote(5);
    walkIn();
    run(g, 1);
    expect(booms).toEqual([]);
    expect(g.stats().live.map((l) => l.pid)).toEqual([6]);
  });

  it('an unknown pid is ignored; a removed pid removed again is ignored', () => {
    const { g, booms } = page();
    g.removeRemote(99);
    g.removeRemote(5);
    g.removeRemote(5);
    expect(g.stats().live.map((l) => l.pid)).toEqual([6]);
    run(g, 0.5);
    expect(booms).toEqual([]);
  });
});

describe('R4P-224: chargeGone in the replay fold (a seek after the removal lays no charge)', () => {
  const PMN_TEST: ThrowableRecord = { ...CLAYMORE, name: 'PMN Mine', id: ITEM.PMN, fuse: 8, removal: 20, proximity: 10 };
  const lookup: ThrowableLookup = (kind) => (kind === 'PMN Mine' ? PMN_TEST : kind === 'Claymore' ? CLAYMORE : null);
  const place = (pid: number, kind: string, from: [number, number, number]): ServerEvent =>
    ({ type: 'grenade', id: 1, kind, from, velocity: [1, 0, 0], pid });

  it('chargeGone is a transient kind (never replayed), folded on the charges', () => {
    expect(EVENT_CLASS.chargeGone).toBe('transient');
  });

  it('a placed claymore and PMN, then chargeGone for each: the fold holds neither; another charge stays', () => {
    const s = emptyFold();
    foldEvent(s, place(0, 'Claymore', [10, 0, 5]), 100, 60, lookup);
    foldEvent(s, place(1, 'PMN Mine', [20, 0, 5]), 110, 60, lookup);
    foldEvent(s, place(2, 'Claymore', [30, 0, 5]), 120, 60, lookup);
    expect([...s.charges.keys()]).toEqual([0, 1, 2]);
    foldEvent(s, { type: 'chargeGone', pid: 0 } as ServerEvent, 500, 60, lookup);
    foldEvent(s, { type: 'chargeGone', pid: 1 } as ServerEvent, 500, 60, lookup);
    expect([...s.charges.keys()]).toEqual([2]);
    foldEvent(s, { type: 'chargeGone', pid: 9 } as ServerEvent, 501, 60, lookup);   // an unknown pid: nothing
    expect([...s.charges.keys()]).toEqual([2]);
  });
});
