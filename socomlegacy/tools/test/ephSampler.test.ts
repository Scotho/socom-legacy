import { describe, expect, it } from 'vitest';
import {
  DETECT_GAP_MS, DETECT_TIMEOUT_MS, GUEST_ADDRESSES, PINE_ERROR_BACKOFF_MS, PINE_ERROR_LIMIT, REVISIONS, PineFailedError, Recorder, RevisionError,
  STANCE_REQUEST_EVIDENCE, Sampler, detectRevision, f32, unreadFields, type PcsxSample, type PineReads, type Revision,
  EE_RAM_END, PCSX_TILT_COLUMNS, TILT_ADDRESSES, guestPointer, unreadTiltFields,
  PCSX_STICK_COLUMNS, STICK_ADDRESSES, EXTRA_ADDRESSES, PCSX_EXTRA_COLUMNS,
  COLUMN_EVIDENCE, COLUMN_INFERRED, PAD_PROBE_ADDRESSES, PCSX_PAD_PROBE_COLUMNS,
} from '../eph/sampler';

/**
 * The PCSX2 side's per-frame sampler (EPH-2 step 3), ported from desktop@be5578311:tools_py/parity/seal_speed_probe.py
 * `Sampler` with the r0001 and r0004 columns of desktop@be5578311:tools_py/parity/guest_addresses.py, plus the stance
 * request byte at actor+0x374 (r0001 only: no source gives its r0004 offset). The build is the one whose guest clock
 * advances (detectRevision), never assumed. Driven here by a fake PINE object: a map of guest words.
 */
const bits = (f: number): number => { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, f, true); return b.getUint32(0, true); };

class FakePine implements PineReads {
  readonly words = new Map<number, number>();
  readonly bytes = new Map<number, number>();
  /** Called after each read32 with its address: a test moves the clock mid-row here. */
  onRead: (a: number) => void = () => undefined;
  reads: number[] = [];
  async read32(a: number): Promise<number> { this.reads.push(a); const v = this.words.get(a) ?? 0; this.onRead(a); return v; }
  async read8(a: number): Promise<number> { this.reads.push(a); return this.bytes.get(a) ?? 0; }
}

const ACTOR = 0x01a00000;
const NODE = 0x01b00000;
const R1 = GUEST_ADDRESSES.r0001;
const R4 = GUEST_ADDRESSES.r0004;

function console_(clock = 12.5, rev: Revision = 'r0001'): FakePine {
  const c = GUEST_ADDRESSES[rev];
  const p = new FakePine();
  p.words.set(c.guestClock, bits(clock));
  p.words.set(c.playerActor, ACTOR);
  p.words.set(ACTOR + c.actorPos, bits(100.5));
  p.words.set(ACTOR + c.actorPos + 4, bits(-2.25));
  p.words.set(ACTOR + c.actorPos + 8, bits(640));
  p.words.set(ACTOR + c.rootNode, NODE);
  p.words.set(NODE + 4, bits(5.504));
  p.words.set(ACTOR + c.moveScale, bits(1));
  if (c.stanceRequest !== null) p.bytes.set(ACTOR + c.stanceRequest, 2);
  return p;
}

describe('the per-revision address table (desktop@be5578311:tools_py/parity/guest_addresses.py)', () => {
  it('r0001: PROBE_ADDRESSES :59-60, PROBE_OFFSETS :377-379, and the probe stance byte (seal_speed_probe.py:40-41)', () => {
    expect(R1).toEqual({ guestClock: 0x004365c0, playerActor: 0x00408c58, actorPos: 0x1c, rootNode: 0x2e8, moveScale: 0x1368, stanceRequest: 0x374 });
  });

  it('r0004: the data-via-twin column (:44-49 and :59-60; :350-375 and :377-379), MoveScale moved up by four', () => {
    expect(R4).toEqual({ guestClock: 0x00442fd0, playerActor: 0x00435618, actorPos: 0x1c, rootNode: 0x2e8, moveScale: 0x136c, stanceRequest: 0x374 });
  });

  it('item 6: the r0004 stance byte is +0x374 too (30 of 30 twinned sites; live: 0, 1, 2 on stand, crouch, prone), inferred', () => {
    expect(REVISIONS).toEqual(['r0001', 'r0004']);
    expect(unreadFields('r0001')).toEqual([]);
    expect(unreadFields('r0004')).toEqual([]);
    expect(STANCE_REQUEST_EVIDENCE.r0004).toMatch(/30 of 30.*live/);
  });

  it('f32 reads a word as a little-endian float, as the probe _f', () => {
    expect(f32(bits(11.484))).toBeCloseTo(11.484, 5);
    expect(f32(0x3f800000)).toBe(1);
  });
});

describe('Sampler', () => {
  it('reads one row: the guest clock, the actor feet, the root y, MoveScale and the stance request', async () => {
    const s = new Sampler(console_(), 'r0001');
    const row = await s.sample();
    expect(row).not.toBeNull();
    expect(row!.t).toBeCloseTo(12.5, 6);
    expect(row!.clockBits).toBe(bits(12.5));
    expect([row!.x, row!.y, row!.z]).toEqual([100.5, -2.25, 640]);
    expect(row!.rootY).toBeCloseTo(5.504, 5);
    expect(row!.moveScale).toBe(1);
    expect(row!.stanceRequest).toBe(2);
    expect(s.torn).toBe(0);
  });

  it('drops a torn row (the clock moved during the read) and counts it', async () => {
    const p = console_();
    let n = 0;
    p.onRead = (a) => { if (a === ACTOR + R1.moveScale && n++ === 0) p.words.set(R1.guestClock, bits(12.5 + 1 / 60)); };
    const s = new Sampler(p, 'r0001');
    expect(await s.sample()).toBeNull();
    expect(s.torn).toBe(1);
    const next = await s.sample();
    expect(next!.t).toBeCloseTo(12.5 + 1 / 60, 6);
    expect(s.torn).toBe(1);
  });

  it('counts a null actor and reads nothing past it', async () => {
    const p = console_();
    p.words.set(R1.playerActor, 0);
    const s = new Sampler(p, 'r0001');
    expect(await s.sample()).toBeNull();
    expect(s.nullActor).toBe(1);
    expect(p.reads).toEqual([R1.guestClock, R1.playerActor]);
  });

  it('reads a NaN root when the root node pointer is null', async () => {
    const p = console_();
    p.words.set(ACTOR + R1.rootNode, 0);
    expect(Number.isNaN((await new Sampler(p, 'r0001').sample())!.rootY)).toBe(true);
  });

  it('reads the r0004 column on r0004: its clock, its actor, MoveScale at 0x136c, the stance request at +0x374', async () => {
    const p = console_(49.585, 'r0004');
    p.words.set(ACTOR + R1.moveScale, bits(7));   // r0001's MoveScale word is another field on r0004
    p.bytes.set(ACTOR + 0x374, 9);
    const s = new Sampler(p, 'r0004');
    expect(s.revision).toBe('r0004');
    const row = await s.sample();
    expect(row!.t).toBeCloseTo(49.585, 3);
    expect([row!.x, row!.y, row!.z]).toEqual([100.5, -2.25, 640]);
    expect(row!.moveScale).toBe(1);
    expect(row!.stanceRequest).toBe(9);
    expect(p.reads.slice(0, 2)).toEqual([R4.guestClock, R4.playerActor]);
  });
});

describe('detectRevision: the build is the one whose guest clock advances, never assumed', () => {
  /** Each build's clock as a function of how often that clock was read; `fail` PINE reads throw first. */
  function detect(r0001: (n: number) => number, r0004: (n: number) => number, fail = 0) {
    const n = { r0001: 0, r0004: 0 };
    let failures = fail;
    let wall = 0;
    const slept: number[] = [];
    const pine: PineReads = {
      async read32(a: number): Promise<number> {
        if (failures > 0) { failures--; throw new Error('PINE op 0x2 timed out'); }
        if (a === R1.guestClock) return bits(r0001(n.r0001++));
        if (a === R4.guestClock) return bits(r0004(n.r0004++));
        return 0;
      },
      async read8(): Promise<number> { return 0; },
    };
    const go = () => detectRevision(pine, { sleep: async (ms) => { slept.push(ms); wall += ms; }, now: () => wall });
    return { go, slept };
  }

  it('carries the gap between the two reads and the bound, adaptations', () => {
    expect(DETECT_GAP_MS).toBe(250);
    expect(DETECT_TIMEOUT_MS).toBe(30_000);
  });

  it("r0004: its clock 49.585 -> 50.586 while r0001's stands at 0 (the 2026-10-31 measure)", async () => {
    const d = detect(() => 0, (n) => (n === 0 ? 49.585 : 50.586));
    const got = await d.go();
    expect(got.revision).toBe('r0004');
    expect(got.readings.map((r) => [r.revision, r.addr, r.advanced])).toEqual([['r0001', R1.guestClock, false], ['r0004', R4.guestClock, true]]);
    expect(got.readings[1]!.first).toBeCloseTo(49.585, 3);
    expect(got.readings[1]!.second).toBeCloseTo(50.586, 3);
    expect(got.pineErrors).toBe(0);
    expect(d.slept).toEqual([DETECT_GAP_MS]);
  });

  it("r0001: its clock advances, r0004's word is constant garbage", async () => {
    expect((await detect((n) => 10 + n / 60, () => 3e-29).go()).revision).toBe('r0001');
  });

  it('neither advancing: fails at DETECT_TIMEOUT_MS naming both readings, no fallback', async () => {
    const err = await detect(() => 0, () => 0).go().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RevisionError);
    expect((err as Error).message).toBe('EPH: cannot tell which build PCSX2 runs: neither guest clock advanced in 30 s '
      + '(r0001 clock 0x004365c0 read 0 then 0; r0004 clock 0x00442fd0 read 0 then 0)');
  });

  it('neither at first (the state still loading), then one: a later pair decides', async () => {
    expect((await detect((n) => (n < 4 ? 0 : n), () => 0).go()).revision).toBe('r0001');
  });

  it('both advancing: fails at once naming both readings', async () => {
    const err = await detect((n) => n, (n) => 2 * n).go().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RevisionError);
    expect((err as Error).message).toBe('EPH: cannot tell which build PCSX2 runs: both guest clocks advanced '
      + '(r0001 clock 0x004365c0 read 0 then 1; r0004 clock 0x00442fd0 read 0 then 2)');
  });

  it('counts PINE errors, backs off, and gives up after PINE_ERROR_LIMIT in a row', async () => {
    const ok = await detect((n) => n, () => 0, 3).go();
    expect([ok.revision, ok.pineErrors]).toEqual(['r0001', 3]);
    const err = await detect((n) => n, () => 0, 1000).go().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PineFailedError);
    expect((err as Error).message).toBe(`PINE failed ${PINE_ERROR_LIMIT} reads in a row in the build detection (last: PINE op 0x2 timed out)`);
  });
});

describe('Recorder (desktop@be5578311:tools_py/parity/seal_speed_probe.py:422-429: a PINE error is counted, not fatal)', () => {
  const row = (t: number): PcsxSample => ({ clockBits: t, t, x: 0, y: 0, z: 0, rootY: 5.5, moveScale: 1, stanceRequest: 0 });

  it('carries the probe backoff (time.sleep(0.05)) and the run stop after 50 errors in a row, an adaptation', () => {
    expect(PINE_ERROR_BACKOFF_MS).toBe(50);
    expect(PINE_ERROR_LIMIT).toBe(50);
  });

  it('counts an error, backs off, goes on sampling, and resets the run of errors on a good row', async () => {
    const script: (PcsxSample | null | Error)[] = [row(1), new Error('PINE op 0x2 timed out'), new Error('again'), null, row(2)];
    let i = 0;
    let on = true;
    const slept: number[] = [];
    const rows: PcsxSample[] = [];
    const rec = new Recorder({
      sample: async () => {
        const v = script[i++];
        if (i >= script.length) on = false;
        if (v instanceof Error) throw v;
        return v ?? null;
      },
    }, { running: () => on, onRow: (r) => rows.push(r), sleep: async (ms) => { slept.push(ms); } });
    expect(await rec.run()).toBeNull();
    expect(rows.map((r) => r.t)).toEqual([1, 2]);
    expect(rec.errors).toBe(2);
    expect(rec.consecutive).toBe(0);
    expect(slept).toEqual([50, 50]);
  });

  it('stops after the limit of errors in a row and says why', async () => {
    let calls = 0;
    const rec = new Recorder({ sample: async () => { calls++; throw new Error('PINE closed'); } }, { running: () => true, onRow: () => undefined, sleep: async () => undefined, limit: 5 });
    const why = await rec.run();
    expect(why?.message).toBe('PINE failed 5 reads in a row (last: PINE closed); 5 errors in all');
    expect(calls).toBe(5);
    expect(rec.errors).toBe(5);
  });

  it('does not count the read that fails because the run closed PINE (sampling already off)', async () => {
    let on = true;
    const rec = new Recorder({ sample: async () => { on = false; throw new Error('PINE closed'); } }, { running: () => on, onRow: () => undefined, sleep: async () => undefined });
    expect(await rec.run()).toBeNull();
    expect(rec.errors).toBe(0);
  });
});

/**
 * EPH-TILT: the prone body's tilt as FUN_00548090 (D:L413181-413287) writes and reads it, sampled at the local actor on
 * r0001 (TILT_ADDRESSES; the decompilation is r0001's ELF). r0004 has no source for these offsets: not read, columns empty.
 */
describe('the tilt reads (EPH-TILT; FUN_00548090)', () => {
  const T = TILT_ADDRESSES.r0001!;
  const STACK = 0x01c00000, TOP = 0x01c10000, PLAYREF = 0x01c20000, REC = 0x01c30000, ENTRY = 0x01c40000;

  /** The fake console with a prone body on a slope: root quaternion, the two normals, the ease basis, the top play. */
  function tilted(): FakePine {
    const p = console_();
    const sh = Math.sin((10 * Math.PI) / 180), ch = Math.cos((10 * Math.PI) / 180);   // a half angle of 10 deg
    [sh, 0, 0, ch].forEach((v, i) => p.words.set(NODE + T.rootQuat + 4 * i, bits(v)));            // 20 deg about x
    [0, 0.9396926, -0.3420201].forEach((v, i) => p.words.set(ACTOR + T.floorNormal + 4 * i, bits(v)));
    [0, 0.9396926, -0.3420201].forEach((v, i) => p.words.set(ACTOR + T.savedNormal + 4 * i, bits(v)));
    [0, 0.98, -0.2].forEach((v, i) => p.words.set(T.easeBasis + 4 * i, bits(v)));
    [0, 1, 0, 0].forEach((v, i) => p.words.set(ACTOR + T.actorQuat + 4 * i, bits(v)));            // yaw 180
    p.words.set(ACTOR + T.posture, 0xabcd0002);                                                     // the short is the low half
    p.words.set(ACTOR + T.action, 0x00000013);
    p.bytes.set(ACTOR + T.airFlags, 0x20);                                                          // bit 5: off the ground
    p.words.set(ACTOR + T.playStack, STACK);
    p.words.set(ACTOR + T.playStack + 8, 1);                                                        // FUN_00555170: index word 2
    p.words.set(STACK + 4, TOP);
    p.words.set(TOP + T.playPhase, bits(0.5));
    p.words.set(TOP + T.playMotion, PLAYREF);
    p.words.set(PLAYREF + 4, REC);
    p.words.set(REC + 4, ENTRY);
    p.words.set(ENTRY + T.windowA, bits(0));
    p.words.set(ENTRY + T.windowB, bits(1));
    return p;
  }

  it('cites its offsets: the root at *(actor+0x2e8)+0x20, +0x410, +0x1344, DAT_0066acd0, +0x50, +0x174, +0x534, +0x105e, +0x1c0', () => {
    expect(T).toEqual({
      rootQuat: 0x20, floorNormal: 0x410, savedNormal: 0x1344, easeBasis: 0x0066acd0, actorQuat: 0x50, posture: 0x174,
      action: 0x534, airFlags: 0x105e, playStack: 0x1c0, playPhase: 0x1c, playMotion: 0x34, windowA: 0x24, windowB: 0x28,
    });
    expect(unreadTiltFields('r0001')).toEqual([]);
  });

  it('r0004 (item 6, OT.R97): the twin scans place the column -- +0x1344 moved to +0x1348, the ease basis to 0x66a650', () => {
    expect(TILT_ADDRESSES.r0004).toEqual({
      rootQuat: 0x20, floorNormal: 0x410, savedNormal: 0x1348, easeBasis: 0x0066a650, actorQuat: 0x50, posture: 0x174,
      action: 0x534, airFlags: 0x105e, playStack: 0x1c0, playPhase: 0x1c, playMotion: 0x34, windowA: 0x24, windowB: 0x28,
    });
    expect(unreadTiltFields('r0004')).toEqual([]);
    for (const k of Object.keys(TILT_ADDRESSES.r0004!)) expect(COLUMN_EVIDENCE.r0004.tilt[k], k).toMatch(/twin|vote|layout|live/);
    expect(COLUMN_INFERRED.r0004.tilt).toEqual(['floorNormal', 'easeBasis', 'playMotion']);
    expect(COLUMN_INFERRED.r0001).toEqual({ tilt: [], stick: [] });
  });

  it('validates a guest pointer: non-zero, word aligned, inside the EE main RAM', () => {
    expect(guestPointer(0)).toBe(false);
    expect(guestPointer(0x01b00000)).toBe(true);
    expect(guestPointer(0x01b00002)).toBe(false);
    expect(guestPointer(EE_RAM_END)).toBe(false);
    expect(guestPointer(0x3f800000)).toBe(false);   // a float read as a pointer
  });

  it('decodes the root quaternion, both normals, the ease basis, the actor quaternion, posture, action, air bit, top play', async () => {
    const row = (await new Sampler(tilted(), 'r0001').sample())!;
    expect([row.rootQx, row.rootQy, row.rootQz, row.rootQw].map((v) => Number(v!.toFixed(5)))).toEqual([0.17365, 0, 0, 0.98481]);
    expect([row.floorNx, row.floorNy, row.floorNz].map((v) => Number(v!.toFixed(5)))).toEqual([0, 0.93969, -0.34202]);
    expect([row.savedNx, row.savedNy, row.savedNz].map((v) => Number(v!.toFixed(5)))).toEqual([0, 0.93969, -0.34202]);
    expect([row.easeX, row.easeY, row.easeZ].map((v) => Number(v!.toFixed(2)))).toEqual([0, 0.98, -0.2]);
    expect([row.actorQx, row.actorQy, row.actorQz, row.actorQw]).toEqual([0, 1, 0, 0]);
    expect([row.posture, row.actionId, row.airborne]).toEqual([2, 0x13, 1]);
    expect([row.playPhase, row.playClip, row.playWindowA, row.playWindowB]).toEqual([0.5, ENTRY, 0, 1]);
  });

  it('records the root quaternion null on a bad node pointer (zero, or out of RAM), never a guess', async () => {
    for (const bad of [0, 0x3f800000, 0x01b00001]) {
      const p = tilted();
      p.words.set(ACTOR + R1.rootNode, bad);
      const row = (await new Sampler(p, 'r0001').sample())!;
      expect([row.rootQx, row.rootQy, row.rootQz, row.rootQw]).toEqual([null, null, null, null]);
      expect(row.floorNy).toBeCloseTo(0.93969, 4);   // the actor's own words are still read
    }
  });

  it('records the top play null when its stack index is negative or a pointer on the way is bad', async () => {
    const neg = tilted();
    neg.words.set(ACTOR + T.playStack + 8, 0xffffffff);
    const a = (await new Sampler(neg, 'r0001').sample())!;
    expect([a.playPhase, a.playClip, a.playWindowA, a.playWindowB]).toEqual([null, null, null, null]);
    const badRef = tilted();
    badRef.words.set(TOP + T.playMotion, 0);
    const b = (await new Sampler(badRef, 'r0001').sample())!;
    expect(b.playPhase).toBe(0.5);
    expect([b.playClip, b.playWindowA, b.playWindowB]).toEqual([null, null, null]);
  });

  it("reads r0004's tilt column on r0004: the saved normal at +0x1348, the ease basis at 0x66a650, never r0001's", async () => {
    const p = console_(49.585, 'r0004');
    p.words.set(ACTOR + 0x174, 1);
    p.words.set(ACTOR + 0x1348 + 4, bits(0.5));
    p.words.set(0x0066a650 + 4, bits(0.75));
    const row = (await new Sampler(p, 'r0004').sample())!;
    expect([row.posture, row.savedNy, row.easeY]).toEqual([1, 0.5, 0.75]);
    expect(p.reads).not.toContain(0x0066acd0);
    expect(p.reads).not.toContain(ACTOR + 0x1344);
  });

  it('keeps the torn-row check over the tilt reads: the second clock read is the last', async () => {
    const p = tilted();
    const s = new Sampler(p, 'r0001');
    await s.sample();
    expect(p.reads[p.reads.length - 1]).toBe(R1.guestClock);
    expect(PCSX_TILT_COLUMNS).toEqual([
      'rootQx', 'rootQy', 'rootQz', 'rootQw', 'floorNx', 'floorNy', 'floorNz', 'savedNx', 'savedNy', 'savedNz',
      'easeX', 'easeY', 'easeZ', 'actorQx', 'actorQy', 'actorQz', 'actorQw', 'posture', 'actionId', 'airborne',
      'playPhase', 'playClip', 'playWindowA', 'playWindowB', 'flags105e', 'topActionId',
    ]);
  });
});

/**
 * EPH-TILT follow-up: the SEAL's move axes as the ground driver reads them, FUN_00586570 (D:L444830-444832 reads +0x240,
 * +0x244 and +0x23c; D:L444868-444869 writes +0x244 and +0x240 back). +0x240 is the forward axis (the asymmetric
 * forward/back crouch threshold on it, D:L444900; FUN_00550ef0 keeps it while zeroing +0x23c and +0x244 on posture 5,
 * D:L418256-418258), +0x244 the lateral, +0x23c the turn (D:L418340). +0x248 is not read there.
 */
describe('the stick axes (FUN_00586570)', () => {
  const K = STICK_ADDRESSES.r0001!;

  it('cites +0x23c turn, +0x240 forward, +0x244 lateral on r0001; none on r0004', () => {
    expect(K).toEqual({ turn: 0x23c, forward: 0x240, lateral: 0x244, padObject: 0x0044f108, padRaw: 0x240, padMove: 0x210, padFlag: 0, controller: 0xc0, ctlForward: 0x08, ctlLateral: 0x0c, ctlTurn: 0x10 });
    expect(STICK_ADDRESSES.r0004).toEqual({ ...K, padObject: 0x004524d8 });
    for (const k of Object.keys(STICK_ADDRESSES.r0004!)) expect(COLUMN_EVIDENCE.r0004.stick[k], k).toMatch(/twin|vote|layout|live/);
    expect(COLUMN_INFERRED.r0004.stick).toEqual(['padFlag']);
    expect(PCSX_STICK_COLUMNS).toEqual(['stickTurn', 'stickForward', 'stickLateral', 'padRaw0', 'padRaw1', 'padRaw2', 'padRaw3', 'padMoveA', 'padMoveB', 'padFlag0', 'ctlForward', 'ctlLateral', 'ctlTurn']);
  });

  it('decodes the three floats off the actor', async () => {
    const p = console_();
    p.words.set(ACTOR + 0x23c, bits(0.25));
    p.words.set(ACTOR + 0x240, bits(1));
    p.words.set(ACTOR + 0x244, bits(-1));
    const row = (await new Sampler(p, 'r0001').sample())!;
    expect([row.stickTurn, row.stickForward, row.stickLateral]).toEqual([0.25, 1, -1]);
  });

  it("reads r0004's stick column on r0004: the axes on the actor, the pad object at 0x4524d8", async () => {
    const p = console_(49.585, 'r0004');
    p.words.set(ACTOR + 0x240, bits(1));
    const row = (await new Sampler(p, 'r0004').sample())!;
    expect(row.stickForward).toBe(1);
    expect(p.reads).toContain(0x004524d8);
    expect(p.reads).not.toContain(0x0044f108);
  });
});

/**
 * The 2026-10-31 live pass (runs 20261031T160305Z..160707Z): no PCSX2 row in 30 s, 5-6 PINE errors -- one 5 s timeout
 * after another. The tilt reads were issued together (Promise.all); the base sampler had always read one word at a time.
 * A strict fake PINE: one request in flight at a time (a second while one is pending is lost, as a coalesced request
 * would be), a read32 off a 4-byte boundary, a read16 off a 2-byte one, or an address past the EE RAM refused.
 */
class StrictPine implements PineReads {
  readonly words = new Map<number, number>();
  readonly bytes = new Map<number, number>();
  inFlight = 0;
  maxInFlight = 0;
  refused: string[] = [];
  /** Addresses whose read throws (PINE answers a failure), to test one tilt read failing. */
  readonly failAt = new Set<number>();
  onRead: (a: number) => void = () => undefined;
  private async gate<T>(a: number, size: number, v: () => T): Promise<T> {
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await Promise.resolve();
      if (this.inFlight > 1) { this.refused.push(`overlap 0x${a.toString(16)}`); throw new Error('PINE op timed out after 5000 ms'); }
      if (a % size !== 0) { this.refused.push(`unaligned${size * 8} 0x${a.toString(16)}`); throw new Error(`PINE op failed (unaligned ${size * 8})`); }
      if (a < 0 || a + size > 0x02000000) { this.refused.push(`range 0x${a.toString(16)}`); throw new Error('PINE op failed (range)'); }
      if (this.failAt.has(a)) throw new Error(`PINE op failed at 0x${a.toString(16)}`);
      const out = v();
      this.onRead(a);
      return out;
    } finally {
      this.inFlight--;
    }
  }
  read32(a: number): Promise<number> { return this.gate(a, 4, () => this.words.get(a) ?? 0); }
  read8(a: number): Promise<number> { return this.gate(a, 1, () => this.bytes.get(a) ?? 0); }
}

function strict(): StrictPine {
  const src = console_();
  const p = new StrictPine();
  for (const [a, v] of src.words) p.words.set(a, v);
  for (const [a, v] of src.bytes) p.bytes.set(a, v);
  const T = TILT_ADDRESSES.r0001!;
  const STACK = 0x01c00000, TOP = 0x01c10000;
  [0, 0, 0, 1].forEach((v, i) => p.words.set(NODE + T.rootQuat + 4 * i, bits(v)));
  [0, 1, 0].forEach((v, i) => p.words.set(ACTOR + T.floorNormal + 4 * i, bits(v)));
  p.words.set(ACTOR + T.playStack, STACK);
  p.words.set(ACTOR + T.playStack + 8, 0);
  p.words.set(STACK, TOP);
  p.words.set(TOP + T.playPhase, bits(0.5));
  return p;
}

describe('the live-pass fix: one PINE read at a time, every read aligned, a failed tilt read never costs the row', () => {
  it('issues one read at a time, aligned and in range, over a whole row', async () => {
    const p = strict();
    const s = new Sampler(p, 'r0001');
    const row = await s.sample();
    expect(p.refused).toEqual([]);
    expect(p.maxInFlight).toBe(1);
    expect(row).not.toBeNull();
    expect(row!.floorNy).toBe(1);
    expect(row!.playPhase).toBe(0.5);
    expect(s.tiltErrors).toBe(0);
  });

  it('a tilt read that fails is null in its column and counted; the base row comes through', async () => {
    const p = strict();
    p.failAt.add(ACTOR + TILT_ADDRESSES.r0001!.floorNormal + 4);
    const s = new Sampler(p, 'r0001');
    const row = (await s.sample())!;
    expect([row.x, row.y, row.z]).toEqual([100.5, -2.25, 640]);
    expect(row.t).toBeCloseTo(12.5, 6);
    expect([row.floorNx, row.floorNy, row.floorNz]).toEqual([0, null, 0]);
    expect(s.tiltErrors).toBe(1);
  });

  it('every tilt and stick read failing still gives rows, every tilt column null', async () => {
    const p = strict();
    const T = TILT_ADDRESSES.r0001!;
    const base = new Set([R1.guestClock, R1.playerActor, ACTOR + R1.actorPos, ACTOR + R1.actorPos + 4, ACTOR + R1.actorPos + 8, ACTOR + R1.rootNode, NODE + 4, ACTOR + R1.moveScale, ACTOR + R1.stanceRequest!]);
    p.onRead = () => undefined;
    const all = new StrictPine();
    for (const [a, v] of p.words) all.words.set(a, v);
    for (const [a, v] of p.bytes) all.bytes.set(a, v);
    const orig = all.read32.bind(all);
    all.read32 = (a: number) => (base.has(a) ? orig(a) : Promise.reject(new Error('PINE op failed')));
    all.read8 = (a: number) => (base.has(a) ? Promise.resolve(2) : Promise.reject(new Error('PINE op failed')));
    const s = new Sampler(all, 'r0001');
    for (let i = 0; i < 3; i++) {
      const row = (await s.sample())!;
      expect(row.x).toBe(100.5);
      for (const k of [...PCSX_TILT_COLUMNS, ...PCSX_STICK_COLUMNS]) expect(row[k], k).toBeNull();
    }
    expect(s.tiltErrors).toBeGreaterThan(0);
    expect(T.rootQuat).toBe(0x20);
  });

  it('a clock moving during the tilt reads keeps the base row and marks the tilt torn', async () => {
    const p = strict();
    let moved = false;
    p.onRead = (a) => { if (!moved && a === ACTOR + TILT_ADDRESSES.r0001!.floorNormal) { moved = true; p.words.set(R1.guestClock, bits(12.5 + 1 / 60)); } };
    const s = new Sampler(p, 'r0001');
    const row = (await s.sample())!;
    expect(row.t).toBeCloseTo(12.5, 6);
    expect(row.tiltTorn).toBe(1);
    expect(s.torn).toBe(0);
    expect(s.tiltTorn).toBe(1);
  });
});

/**
 * MV-PARITY (a), the prone-pop slide: the whole +0x105e flag byte (bit 2 the jump flag, set by FUN_005469c0 D:L412326,
 * called from FUN_00594cf0 D:L453214; bit 5 off the ground) and the top action's id, the short at +0x22 of the record
 * FUN_0028c1e0 gives for the +0x1c0 stack's top (D:L440388-440391 copy it to actor+0x534). The short is read as the high
 * half of the aligned word at +0x20.
 */
describe('the prone-pop fields (flags byte, top action id)', () => {
  it('decodes the flag byte whole and the top action id off the aligned word, one read at a time', async () => {
    const p = strict();
    const T = TILT_ADDRESSES.r0001!;
    const TOP = 0x01c10000, PLAYREF = 0x01c20000, REC = 0x01c30000, ENTRY = 0x01c40000;
    p.bytes.set(ACTOR + T.airFlags, 0x24);                      // bits 2 and 5
    p.words.set(TOP + T.playMotion, PLAYREF);
    p.words.set(PLAYREF + 4, REC);
    p.words.set(REC + 4, ENTRY);
    p.words.set(REC + 0x20, 0x0019abcd);                        // the short at +0x22 = 0x19 (Stand -> Prone)
    const s = new Sampler(p, 'r0001');
    const row = (await s.sample())!;
    expect(p.refused).toEqual([]);
    expect(p.maxInFlight).toBe(1);
    expect([row.flags105e, row.airborne, row.topActionId]).toEqual([0x24, 1, 0x19]);
  });

  it('leaves the top action id null with no record behind the top play', async () => {
    const row = (await new Sampler(strict(), 'r0001').sample())!;
    expect(row.topActionId).toBeNull();
    expect(row.flags105e).toBe(0);
  });
});

/**
 * The guest pad's own read of the sticks, before the SEAL's: FUN_002da930 (D:L179484) stores the four analog bytes of
 * the pad buffer at pad+0x240..+0x243 (libpad indices 0x12, 0x13, 0x10, 0x11, D:L179548-179555) and the move stick's two
 * floats, (127.5 - byte) / 127.5, at pad+0x210 / +0x214 (D:L179556-179559; its dead zone +0x288, D:L179564-179577). The
 * pad object is DAT_0044f108's (FUN_002d9e40 D:L179058-179062 calls FUN_002da930 under it; FUN_00592ac0 D:L451824-451831).
 */
describe('the guest pad bytes (FUN_002da930)', () => {
  const PAD = 0x01d00000;
  it('reads the four raw bytes off the aligned word at pad+0x240 and the two move floats', async () => {
    const p = strict();
    p.words.set(0x0044f108, PAD);
    p.words.set(PAD + 0x240, 0x80ff0080);       // bytes 0x80, 0x00, 0xff, 0x80 (little-endian)
    p.words.set(PAD + 0x210, bits(-0.5));
    p.words.set(PAD + 0x214, bits(1));
    const row = (await new Sampler(p, 'r0001').sample())!;
    expect(p.refused).toEqual([]);
    expect([row.padRaw0, row.padRaw1, row.padRaw2, row.padRaw3]).toEqual([0x80, 0x00, 0xff, 0x80]);
    expect([row.padMoveA, row.padMoveB]).toEqual([-0.5, 1]);
  });

  it('a bad pad pointer leaves the pad columns null', async () => {
    const p = strict();
    p.words.set(0x0044f108, 0x3f800000);
    const row = (await new Sampler(p, 'r0001').sample())!;
    expect([row.padRaw0, row.padMoveA]).toEqual([null, null]);
    expect(row.x).toBe(100.5);
  });
});

/**
 * MV-PARITY (c): the two stages between the pad and the SEAL's axes. FUN_005966a0 writes the controller's axes only when
 * the pad's +0 byte is set (D:L453768; its pad is DAT_0044f108's object, D:L451666, D:L451672), and FUN_00551ec0 copies the
 * controller *(actor+0xc0) (D:L418509) words [4], [2], [3] to +0x23c, +0x240, +0x244 (D:L418613-418615).
 */
describe('the controller object and the pad flag (MV-PARITY c)', () => {
  const PAD = 0x01d00000, CTL = 0x01e00000;
  it("reads the pad's +0 byte off its aligned word and the controller's three axes, one aligned read at a time", async () => {
    const p = strict();
    p.words.set(0x0044f108, PAD);
    p.words.set(PAD, 0xabcdef01);
    p.words.set(ACTOR + 0xc0, CTL);
    p.words.set(CTL + 0x08, bits(1));
    p.words.set(CTL + 0x0c, bits(-1));
    p.words.set(CTL + 0x10, bits(0.25));
    const row = (await new Sampler(p, 'r0001').sample())!;
    expect(p.refused).toEqual([]);
    expect(p.maxInFlight).toBe(1);
    expect([row.padFlag0, row.ctlForward, row.ctlLateral, row.ctlTurn]).toEqual([1, 1, -1, 0.25]);
  });

  it('a bad controller pointer leaves its axes null, the row kept', async () => {
    const p = strict();
    p.words.set(ACTOR + 0xc0, 0x01e00002);
    const row = (await new Sampler(p, 'r0001').sample())!;
    expect([row.ctlForward, row.ctlLateral, row.ctlTurn]).toEqual([null, null, null]);
    expect(row.x).toBe(100.5);
  });
});

/**
 * Item 6(b), the gameplay seat's reads (agent-mail/evidence/move-reads/READS-2026-11-01.md: C1a, MOVE-6): an option to
 * log the player actor's velocity +0x2c..+0x34 (FUN_00581c10's speed test D:L442633-442637; FUN_0054d9a0 adds to it,
 * D:L416435-416455), the dive's saved world velocity +0x1350 (FUN_0057e540 D:L440899-440907; the contact projections
 * write it, D:L413588-413594, D:L417619-417626), and the actors near the player off the game's actor list (r0001
 * 0x4362e0: count, +8 the first node, the list's +4 its end; a node's +4 the next, +8 its object, FUN_0029e470
 * D:L144674-144684 and FUN_002269a0 D:L77357-77362). r0004's list: 0x442ce8, the desktop's data-via-twin scan, 127
 * evidence-twinned sites in 62 functions, unanimous. The contact normal is a stack local of the projection, not on the
 * actor: not readable.
 */
describe('the extra words (velocity, the dive velocity, the actors near)', () => {
  const LIST_NODE = 0x01c00000;
  const OTHER = 0x01d00000;
  const FAR = 0x01e00000;
  const withList = (rev: Revision = 'r0001'): FakePine => {
    const p = console_(12.5, rev);
    const x = EXTRA_ADDRESSES[rev];
    p.words.set(ACTOR + x.velocity, bits(1.5));
    p.words.set(ACTOR + x.velocity + 4, bits(-0.5));
    p.words.set(ACTOR + x.velocity + 8, bits(-37));
    p.words.set(ACTOR + x.diveVelocity, bits(-11));
    p.words.set(ACTOR + x.diveVelocity + 4, bits(0));
    p.words.set(ACTOR + x.diveVelocity + 8, bits(-33.4));
    // The list: the player, a teammate 10 u behind, and one 200 u away.
    const L = x.actorList;
    p.words.set(L, 3);
    p.words.set(L + 8, LIST_NODE);
    const nodes = [[LIST_NODE, ACTOR], [LIST_NODE + 0x10, OTHER], [LIST_NODE + 0x20, FAR]] as const;
    nodes.forEach(([n, obj], i) => {
      p.words.set(n + 4, i + 1 < nodes.length ? nodes[i + 1]![0] : L + 4);
      p.words.set(n + 8, obj);
    });
    for (const [obj, at] of [[OTHER, [100.5, -2.25, 650]], [FAR, [300.5, -2.25, 640]]] as const) {
      p.bytes.set(obj + 0x10, 2);
      p.words.set(obj + 0x1c, bits(at[0]));
      p.words.set(obj + 0x20, bits(at[1]));
      p.words.set(obj + 0x24, bits(at[2]));
    }
    return p;
  };

  it('cites the offsets per build: velocity +0x2c, dive velocity +0x1350 (r0004 +0x1354, above the +0x1334 word), the list', () => {
    expect(EXTRA_ADDRESSES).toEqual({
      r0001: { velocity: 0x2c, diveVelocity: 0x1350, actorList: 0x004362e0, actorType: 0x10 },
      r0004: { velocity: 0x2c, diveVelocity: 0x1354, actorList: 0x00442ce8, actorType: 0x10 },
    });
    expect(PCSX_EXTRA_COLUMNS).toEqual(['velX', 'velY', 'velZ', 'diveVelX', 'diveVelY', 'diveVelZ', 'nearCount', 'near']);
  });

  it('off by default: a row carries none of them and reads none of their words', async () => {
    const p = withList();
    const row = (await new Sampler(p, 'r0001').sample())!;
    expect('velX' in row).toBe(false);
    expect(p.reads).not.toContain(ACTOR + 0x2c);
    expect(p.reads).not.toContain(EXTRA_ADDRESSES.r0001.actorList);
  });

  for (const rev of REVISIONS) {
    it(`${rev}: reads the velocity, the dive velocity, and the actors within the radius (not the player, not the far one)`, async () => {
      const p = withList(rev);
      const row = (await new Sampler(p, rev, { extra: true, nearRadius: 30 }).sample())!;
      expect([row.velX, row.velY, row.velZ]).toEqual([1.5, -0.5, -37]);
      expect([row.diveVelX, row.diveVelY, row.diveVelZ]).toEqual([-11, 0, expect.closeTo(-33.4, 4)]);
      expect(row.nearCount).toBe(1);
      expect(row.near).toBe(`0x${OTHER.toString(16)}:2:100.50/-2.25/650.00/10.00`);
      expect(row.near).not.toContain(',');
    });
  }

  it('walks the list only every nearRefreshRows rows, reading the kept actors positions on the others', async () => {
    const p = withList();
    const s = new Sampler(p, 'r0001', { extra: true, nearRadius: 30, nearRefreshRows: 3 });
    await s.sample();
    p.words.set(OTHER + 0x24, bits(700));   // walked 50 u off
    p.reads = [];
    const row = (await s.sample())!;
    expect(p.reads).not.toContain(EXTRA_ADDRESSES.r0001.actorList + 8);
    expect(row.nearCount).toBe(0);
    expect(row.near).toBe('');
  });

  it('a broken list (a bad pointer, or a loop) ends the walk; the row still comes through', async () => {
    const p = withList();
    p.words.set(LIST_NODE + 0x10 + 4, LIST_NODE);   // a loop back to the first node
    const row = (await new Sampler(p, 'r0001', { extra: true, nearRadius: 30 }).sample())!;
    expect(row.nearCount).toBe(1);
    p.words.set(EXTRA_ADDRESSES.r0001.actorList + 8, 0x03000000);   // out of the EE RAM
    const row2 = (await new Sampler(p, 'r0001', { extra: true, nearRadius: 30 }).sample())!;
    expect(row2.nearCount).toBe(0);
    expect(row2.x).toBe(100.5);
  });
});

/**
 * Review F2: the extra reads (the list walk above all) are off the row's path -- after the base row's clock check and
 * after the tilt and stick reads -- with their own torn flag (`extraTorn`, a clock read after them), and the sampler
 * keeps what they cost per row (`extraCost`: rows, total and max wall ms), for record.json's row gap.
 */
describe('review F2: the extra reads off the row path', () => {
  it('reads them after the tilt and stick reads and the clock read that closes those, then reads the clock again', async () => {
    const p = console_();
    const s = new Sampler(p, 'r0001', { extra: true });
    await s.sample();
    const clockReads = p.reads.map((a, i) => (a === R1.guestClock ? i : -1)).filter((i) => i >= 0);
    const vel = p.reads.indexOf(ACTOR + EXTRA_ADDRESSES.r0001.velocity);
    expect(clockReads.length).toBe(4);
    expect(vel).toBeGreaterThan(clockReads[2]!);
    expect(clockReads[3]!).toBeGreaterThan(vel);
  });

  it('flags a row whose extra reads straddled a guest frame (extraTorn 1), keeping the row; 0 otherwise', async () => {
    const p = console_();
    const s = new Sampler(p, 'r0001', { extra: true, nearRefreshRows: 1 });
    expect((await s.sample())!.extraTorn).toBe(0);
    p.onRead = (a) => { if (a === EXTRA_ADDRESSES.r0001.actorList + 8) p.words.set(R1.guestClock, bits(13)); };
    const row = (await s.sample())!;
    expect(row.extraTorn).toBe(1);
    expect(row.x).toBe(100.5);
    expect(s.extraCost.rows).toBe(2);
    expect(s.extraCost.maxMs).toBeGreaterThanOrEqual(0);
  });
});

/**
 * The press probes (6d, before the cancel reruns): the pad object's 16 button bytes from +0 and 16 pressure floats from
 * +0x10 (FUN_00594cf0 reads Triangle's digital at pad+7 and its pressure at pad+0x2c, D:L453334-453340), and the
 * Triangle peak FUN_00594cf0 keeps (DAT_0066b410, D:L453337-453345; r0004 0x66ad90, the function placed at 0x59a6e0,
 * 1635 of 1642 instructions in order, agent-mail/evidence/eph-hunt-2026-11-01/r0004-offsets/place_594cf0.out).
 */
describe('the pad probe (padProbe option)', () => {
  it('cites the peak per build and the pad layout', () => {
    expect(PAD_PROBE_ADDRESSES).toEqual({
      r0001: { peak: 0x0066b410, digital: 0, pressure: 0x10, buttons: 16 },
      r0004: { peak: 0x0066ad90, digital: 0, pressure: 0x10, buttons: 16 },
    });
    expect(PCSX_PAD_PROBE_COLUMNS).toEqual(['padButtons', 'padPressure', 'triPressure', 'triPeak']);
  });

  for (const rev of REVISIONS) {
    it(`${rev}: reads the button bytes as hex, the pressures, Triangle's (index 7) and the peak`, async () => {
      const p = console_(12.5, rev);
      const pad = 0x01e80000;
      p.words.set(STICK_ADDRESSES[rev]!.padObject, pad);
      p.words.set(pad + 4, 0x01000000);                 // byte 7 (Triangle) held
      p.words.set(pad + 0x10 + 4 * 7, bits(0.75));
      p.words.set(PAD_PROBE_ADDRESSES[rev].peak, bits(0.875));
      const row = (await new Sampler(p, rev, { padProbe: true }).sample())!;
      expect(row.padButtons).toBe('00000000000000010000000000000000');
      expect(row.triPressure).toBe(0.75);
      expect(row.triPeak).toBe(0.875);
      expect(row.padPressure!.split('/')).toHaveLength(16);
      expect(row.padPressure).not.toContain(',');
    });
  }

  it('off by default', async () => {
    const p = console_();
    const row = (await new Sampler(p, 'r0001').sample())!;
    expect('triPeak' in row).toBe(false);
  });
});
