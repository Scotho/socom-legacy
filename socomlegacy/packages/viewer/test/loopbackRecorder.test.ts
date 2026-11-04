import { afterEach, describe, expect, it } from 'vitest';
import { type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { decodeRecords, REPLAY_FORMAT_VERSION, type ReplayHeader, type ReplayRecord } from '../../match/src/replay/format';
import { FileRecorder } from '../../match/src/replay/recorder';
import { NetClient, type NetWalk } from '../src/net/client';
import { LoopbackMatch, setLoopbackDefaults, simMapOfLoaded } from '../src/net/loopback';
import { packGround, PROTOCOL_VERSION, SNAPSHOT_HZ, TICK_HZ, type Command, type Knock } from '../src/sim';

/**
 * PT-03 (web sprint 33; research 240 §5): the playtest instrument's seam in `../src/net/loopback`. The page builds its
 * `LoopbackMatch` in `main.ts`, which the playtest lane never edits (PT.R5), so the recorder reaches the page's room
 * through `setLoopbackDefaults`: options merged under the caller's, the caller's keys winning.
 */

// The synthetic flat map of `./loopback.test.ts` (`loaded()`), copied: a test file's helper is not importable.
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
function loaded() {
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: 2, facing: [1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  return {
    path: 'RUN/MP99.ZDB', name: 'FLAT', ground: packGround(PARAMS, [floor], owners),
    slots: [slot(0, 0, -100, 0), slot(1, 0, 100, 0)], respawns: [slot(0, 0, -300, 0)], doors: [],
  };
}

/** The walk as the net client drives it (the stick at rest). */
class Walk implements NetWalk {
  tap: ((cmd: Omit<Command, 'seq'>, feet: [number, number, number]) => void) | null = null;
  feet: [number, number, number] = [0, 0, 0];
  setNetTap(tap: Walk['tap']): void { this.tap = tap; }
  respawn(at: readonly [number, number, number]): boolean { this.feet = [at[0], at[1], at[2]]; return true; }
  nudge(): void {}
  setLocked(): void {}
  knock(_k: Knock): boolean { return true; }
  tick(): void { this.tap?.({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }, this.feet); }
}

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

const HEADER: ReplayHeader = {
  format: REPLAY_FORMAT_VERSION, protocol: PROTOCOL_VERSION,
  build: { commit: 'abc1234', dirty: false, branch: null, branchCreated: null },
  map: 'MP99', rules: 'classic', gameType: null, tickHz: TICK_HZ, snapshotHz: SNAPSHOT_HZ, kind: 'solo', serverName: null,
  startedAt: '2026-10-06T12:00:00.000Z', session: { id: '20261006-1a2b', segment: 0 },
};

function collecting(): { recorder: FileRecorder; records(): ReplayRecord[] } {
  const chunks: Uint8Array[] = [];
  const recorder = new FileRecorder(HEADER, (b) => chunks.push(b));
  return {
    recorder,
    records: () => {
      const all = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
      let at = 0;
      for (const c of chunks) { all.set(c, at); at += c.byteLength; }
      const d = decodeRecords(all);
      expect(d.truncated).toBe(false);
      return d.records;
    },
  };
}

/** The room joined as the page joins it, stepped `n` ticks with the page. */
async function play(match: LoopbackMatch, n: number): Promise<void> {
  const walk = new Walk();
  new NetClient({ url: 'loopback:', map: 'MP99', name: 'Solo', socket: match.socket }, walk);
  await flush();
  for (let i = 0; i < n; i++) { walk.tick(); match.step(); }
  await flush();
}

describe('the loopback seam (setLoopbackDefaults, PT-03)', () => {
  afterEach(() => setLoopbackDefaults({}));

  it('a default recorder reaches the page\'s room: 60 ticks record the header, then 30 snaps with the solo player', async () => {
    const c = collecting();
    setLoopbackDefaults({ recorder: c.recorder });
    const match = new LoopbackMatch(simMapOfLoaded(loaded()), null, { auto: false });
    await play(match, 60);
    match.room.closeRecording('test');
    match.stop();
    const records = c.records();
    expect(records[0]).toEqual({ kind: 'header', header: HEADER });
    const snaps = records.filter((r): r is Extract<ReplayRecord, { kind: 'snap' }> => r.kind === 'snap');
    expect(snaps).toHaveLength(60 * SNAPSHOT_HZ / TICK_HZ);
    for (const s of snaps) expect(s.bodies.map((b) => b.id)).toEqual([1]);
    expect(records.at(-1)).toMatchObject({ kind: 'end', reason: 'test' });
  });

  it('the caller\'s own recorder beats the default', async () => {
    const def = collecting(), own = collecting();
    setLoopbackDefaults({ recorder: def.recorder });
    const match = new LoopbackMatch(simMapOfLoaded(loaded()), null, { auto: false, recorder: own.recorder });
    await play(match, 10);
    match.room.closeRecording('test');
    match.stop();
    expect(own.records().filter((r) => r.kind === 'snap')).toHaveLength(5);
    expect(def.records()).toEqual([]);                    // never flushed: the default recorder saw nothing
  });

  it('a function given as the defaults is read at each construction', () => {
    let calls = 0;
    const c = collecting();
    setLoopbackDefaults(() => { calls++; return calls === 2 ? { recorder: c.recorder } : {}; });
    const a = new LoopbackMatch(simMapOfLoaded(loaded()), null, { auto: false });
    const b = new LoopbackMatch(simMapOfLoaded(loaded()), null, { auto: false });
    expect(calls).toBe(2);
    const opts = (m: LoopbackMatch) => (m.room as unknown as { opts: { recorder?: unknown } }).opts;
    expect(opts(a).recorder).toBeUndefined();
    expect(opts(b).recorder).toBe(c.recorder);
    a.stop(); b.stop();
  });

  it('setLoopbackDefaults({}) clears the defaults', async () => {
    const c = collecting();
    setLoopbackDefaults({ recorder: c.recorder });
    setLoopbackDefaults({});
    const match = new LoopbackMatch(simMapOfLoaded(loaded()), null, { auto: false });
    await play(match, 60);
    match.room.closeRecording('test');
    match.stop();
    expect(c.records()).toEqual([]);
  });
});
