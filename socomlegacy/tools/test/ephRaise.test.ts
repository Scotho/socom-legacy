import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KeyTranslator } from '../eph/run';
import { parseScript } from '../eph/script';
import { GUEST_ADDRESSES, REVISIONS, Sampler, type PineReads, type Revision } from '../eph/sampler';
import {
  BODY_QUAT, BODY_VIEW, PCSX_RAISE_COLUMNS, RAISE_ADDRESSES, RAISE_EVIDENCE, RAISE_INFERRED, RAISE_RECORDS_MAX, RAISE_RECORD_FIELDS,
  decodeRaiseWord,
} from '../eph/raise';

/**
 * The enemy-raise columns (the raise option; agent-mail/evidence/enemy-raise/SCOPE.md s2.1, CAPTURE-JOB.md): the local
 * body from DAT_00440c38 (r0001; FUN_00599b60 D:L455684-455685, FUN_002b3a00 D:L156405-156407) or its r0004 twin
 * 0x44d648 (data_via_twin, SCOPE.md s2.1), its controller `*(body+0xc0)`, the identified-enemy count ctrl+0xc0 that
 * FUN_005c9b30 zeroes and adds to (D:L482090, D:L482131-482132), the raise word body+0xf74 FUN_005dfe30 tests and
 * writes (D:L494244-494259), and the perception records `*(body+0xd8) + 0x30*i` (D:L482101-482102). Driven by a fake
 * PINE object: a map of guest words. Product track: an instrument, never in a build.
 */
const bits = (f: number): number => { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, f, true); return b.getUint32(0, true); };

class FakePine implements PineReads {
  readonly words = new Map<number, number>();
  readonly bytes = new Map<number, number>();
  onRead: (a: number) => void = () => undefined;
  reads: number[] = [];
  async read32(a: number): Promise<number> { this.reads.push(a); const v = this.words.get(a) ?? 0; this.onRead(a); return v; }
  async read8(a: number): Promise<number> { this.reads.push(a); return this.bytes.get(a) ?? 0; }
}

const ACTOR = 0x01a00000;
const BODY = 0x01c00000;
const CTRL = 0x01c10000;
const ARR = 0x01c20000;
const T0 = 0x01c30000;
const T1 = 0x01c30400;

/** A guest frame: the base row's words, the local body and its controller, two perception records (T0 marked). */
function world(rev: Revision = 'r0004'): FakePine {
  const c = GUEST_ADDRESSES[rev];
  const o = RAISE_ADDRESSES[rev];
  const p = new FakePine();
  p.words.set(c.guestClock, bits(12.5));
  p.words.set(c.playerActor, ACTOR);
  p.words.set(ACTOR + c.actorPos, bits(100.5));
  p.words.set(ACTOR + c.moveScale, bits(1));
  p.words.set(o.localBody, BODY);
  p.words.set(BODY + o.bodyCtrl, CTRL);
  p.words.set(CTRL + o.ctrlCount, 1);
  p.words.set(CTRL + o.ctrlReach, bits(1000));
  p.bytes.set(CTRL + o.ctrlEdge, 0);
  p.words.set(CTRL + o.ctrlIdle, bits(4.25));
  p.words.set(CTRL + o.ctrlIdleBase, bits(5));
  p.words.set(CTRL + o.ctrlIdleSpread, 0);
  p.words.set(BODY + o.bodyRaise, 0x11);
  [0.25, 0.5, 0.75, 1.5].forEach((v, i) => p.words.set(BODY + o.bodyEnvelope + 4 * i, bits(v)));
  p.bytes.set(BODY + o.bodyCanRaise, 0x03);
  p.words.set(BODY + o.bodyMagnification, bits(2));
  p.words.set(BODY + o.bodyTeam, 0x40000001);
  p.words.set(BODY + o.bodyRecCount, 2);
  p.words.set(BODY + o.bodyRecArray, ARR);
  const recs = [[T0, 2500, 1.25, 7, 0x203], [T1, 90000, 0.5, 0, 0x002]] as const;
  recs.forEach(([t, d2, acc, w28, fl], i) => {
    const r = ARR + o.recStride * i;
    p.words.set(r + o.recTarget, t);
    p.words.set(r + o.recDist2, bits(d2));
    p.words.set(r + o.recAcc, bits(acc));
    p.words.set(r + o.recW28, w28);
    p.words.set(r + o.recFlags, fl);
  });
  const tg = [[T0, 2, 0x10, 0x80000100, [150, -2, 660]], [T1, 2, 0x14, 0x40000001, [400, 0, 900]]] as const;
  for (const [t, kind, e1, team, pos] of tg) {
    p.bytes.set(t + o.tgtKind, kind);
    p.bytes.set(t + o.tgtFlagsE1, e1);
    p.words.set(t + o.tgtTeam, team);
    pos.forEach((v, i) => p.words.set(t + o.tgtPos + 4 * i, bits(v)));
  }
  p.bytes.set(o.gate, 1);
  p.bytes.set(o.mpFlag, 0);
  if (o.freeze100 !== null) p.words.set(o.freeze100, 3);
  if (o.freeze108 !== null) p.words.set(o.freeze108, 0xfffffffe);
  if (o.freeze10e !== null) p.bytes.set(o.freeze10e, 1);
  return p;
}

const rec = (i: number, f: string): string => `rec${i}${f}`;

describe('the raise addresses (SCOPE.md s2.1)', () => {
  it('cites each per build: the r0001 globals from the decompilation, the r0004 twins, the offsets unchanged', () => {
    const offsets = {
      bodyCtrl: 0xc0, ctrlCount: 0xc0, ctrlReach: 0xa8, ctrlEdge: 0x118, ctrlIdle: 0x234, ctrlIdleBase: 0x22c, ctrlIdleSpread: 0x230,
      bodyRaise: 0xf74, bodyEnvelope: 0x1160, bodyCanRaise: 0x258, bodyMagnification: 0x204, bodyTeam: 0xc8, bodyRecCount: 0xd4, bodyRecArray: 0xd8,
      recStride: 0x30, recTarget: 0, recDist2: 0x10, recAcc: 0x18, recW28: 0x28, recFlags: 0x2c, tgtKind: 0x10, tgtFlagsE1: 0xe1, tgtTeam: 0xc8, tgtPos: 0x1c,
    };
    expect(RAISE_ADDRESSES).toEqual({
      r0001: { localBody: 0x00440c38, gate: 0x003df1b0, mpFlag: 0x0045a0c1, freeze100: null, freeze108: null, freeze10e: null, ...offsets },
      r0004: { localBody: 0x0044d648, gate: 0x0040a378, mpFlag: 0x0045d481, freeze100: 0x0045d580, freeze108: 0x0045d588, freeze10e: 0x0045d58e, ...offsets },
    });
    for (const rev of REVISIONS) {
      expect(Object.keys(RAISE_EVIDENCE[rev]).sort()).toEqual(Object.keys(RAISE_ADDRESSES[rev]).sort());
      for (const [k, v] of Object.entries(RAISE_EVIDENCE[rev])) expect(v, `${rev} ${k}`).toMatch(/\S{8,}/);
    }
    expect(RAISE_EVIDENCE.r0001.localBody).toMatch(/D:L455684-455685/);
    expect(RAISE_EVIDENCE.r0001.localBody).toMatch(/D:L156405-156407/);
    expect(RAISE_EVIDENCE.r0004.localBody).toMatch(/data_via_twin 0x440c38/);
    expect(RAISE_EVIDENCE.r0004.gate).toMatch(/0x59cbd4/);
    expect(RAISE_EVIDENCE.r0001.freeze100).toMatch(/no r0001 twin/);
  });

  it('lists the inferred: none on r0001; on r0004 every offset carried over from r0001 and the multiplayer flag by layout', () => {
    expect(RAISE_INFERRED.r0001).toEqual([]);
    const r4 = [...RAISE_INFERRED.r0004].sort();
    for (const k of Object.keys(RAISE_ADDRESSES.r0004) as (keyof typeof RAISE_ADDRESSES.r0004)[]) {
      const global = ['localBody', 'gate', 'freeze100', 'freeze108', 'freeze10e'].includes(k);
      expect(r4.includes(k), k).toBe(!global);
    }
    expect(RAISE_RECORDS_MAX).toBe(8);
  });

  it('names the row columns: controller, body, the decoded raise, each record of eight, the globals, torn and stale', () => {
    expect(RAISE_RECORD_FIELDS).toEqual(['Target', 'Dist2', 'Acc', 'W28', 'Flags', 'Marked', 'Kind', 'Active', 'Team', 'X', 'Y', 'Z']);
    for (const k of ['raiseBody', 'raiseCtrl', 'raiseCount', 'raiseReach', 'raiseEdge', 'raiseIdle', 'raiseWord', 'raiseState', 'raiseMoving',
      'raiseEnv0', 'raiseEnv3', 'raiseCanRaise', 'raiseMag', 'raiseTeam', 'raiseRecs', 'raiseRecArray', 'raiseGate', 'raiseMp',
      'raiseFreeze100', 'raiseFreeze108', 'raiseFreeze10e', 'raiseTorn', 'raiseStale', 'rec0Target', 'rec7Z', 'raiseYaw', 'raiseViewX', 'raiseViewY', 'raiseViewZ']) expect(PCSX_RAISE_COLUMNS, k).toContain(k);
    expect(PCSX_RAISE_COLUMNS).not.toContain('rec8Target');
  });
});

describe('decodeRaiseWord (FUN_005dfe30 D:L494244: v & 0xef; FUN_005e0010)', () => {
  it('reads 0x11 / 0x01 up, 0x12 / 0x02 down, bit 0x10 the moving bit; null stays null', () => {
    expect(decodeRaiseWord(0x11)).toEqual({ raiseState: 1, raiseMoving: 1 });
    expect(decodeRaiseWord(0x01)).toEqual({ raiseState: 1, raiseMoving: 0 });
    expect(decodeRaiseWord(0x12)).toEqual({ raiseState: 2, raiseMoving: 1 });
    expect(decodeRaiseWord(0x02)).toEqual({ raiseState: 2, raiseMoving: 0 });
    expect(decodeRaiseWord(null)).toEqual({ raiseState: null, raiseMoving: null });
  });
});

describe('the raise columns (raise option)', () => {
  it('off by default: a row carries none of them and reads neither the body global nor a record', async () => {
    const p = world();
    const row = (await new Sampler(p, 'r0004').sample())! as unknown as Record<string, unknown>;
    expect('raiseCount' in row).toBe(false);
    expect('rec0Target' in row).toBe(false);
    expect(p.reads).not.toContain(RAISE_ADDRESSES.r0004.localBody);
  });

  for (const rev of REVISIONS) {
    it(`${rev}: chases body -> ctrl -> records and reads every column`, async () => {
      const p = world(rev);
      const s = new Sampler(p, rev, { raise: true });
      const row = (await s.sample())! as unknown as Record<string, unknown>;
      expect(row.x).toBe(100.5);
      expect(row.raiseBody).toBe(`0x${BODY.toString(16)}`);
      expect(row.raiseCtrl).toBe(`0x${CTRL.toString(16)}`);
      expect(row.raiseCount).toBe(1);
      expect(row.raiseReach).toBe(1000);
      expect(row.raiseEdge).toBe(0);
      expect(row.raiseIdle).toBe(4.25);
      expect(row.raiseWord).toBe(0x11);
      expect(row.raiseState).toBe(1);
      expect(row.raiseMoving).toBe(1);
      expect([row.raiseEnv0, row.raiseEnv1, row.raiseEnv2, row.raiseEnv3]).toEqual([0.25, 0.5, 0.75, 1.5]);
      expect(row.raiseCanRaise).toBe(1);
      expect(row.raiseMag).toBe(2);
      expect(row.raiseTeam).toBe('0x40000001');
      expect(row.raiseRecs).toBe(2);
      expect(row.raiseRecArray).toBe(`0x${ARR.toString(16)}`);
      expect(row[rec(0, 'Target')]).toBe(`0x${T0.toString(16)}`);
      expect(row[rec(0, 'Dist2')]).toBe(2500);
      expect(row[rec(0, 'Acc')]).toBe(1.25);
      expect(row[rec(0, 'W28')]).toBe(7);
      expect(row[rec(0, 'Flags')]).toBe(0x203);
      expect(row[rec(0, 'Marked')]).toBe(1);
      expect(row[rec(0, 'Kind')]).toBe(2);
      expect(row[rec(0, 'Active')]).toBe(1);
      expect(row[rec(0, 'Team')]).toBe('0x80000100');
      expect([row[rec(0, 'X')], row[rec(0, 'Y')], row[rec(0, 'Z')]]).toEqual([150, -2, 660]);
      expect(row[rec(1, 'Marked')]).toBe(0);
      expect(row[rec(1, 'Active')]).toBe(1);
      expect(row[rec(1, 'Team')]).toBe('0x40000001');
      for (let i = 2; i < RAISE_RECORDS_MAX; i++) for (const f of RAISE_RECORD_FIELDS) expect(row[rec(i, f)], rec(i, f)).toBeNull();
      expect(row.raiseGate).toBe(1);
      expect(row.raiseMp).toBe(0);
      if (rev === 'r0004') expect([row.raiseFreeze100, row.raiseFreeze108, row.raiseFreeze10e]).toEqual([3, -2, 1]);
      else expect([row.raiseFreeze100, row.raiseFreeze108, row.raiseFreeze10e]).toEqual([null, null, null]);
      expect(row.raiseTorn).toBe(0);
      expect(row.raiseStale).toBe(0);
      expect(s.raiseErrors).toBe(0);
    });
  }

  it("reads the body's facing: raiseYaw = 2 atan2(q.y, q.w) off body+0x50 (qx, qy, qz, qw), raiseViewX/Y/Z off body+0x38", async () => {
    const p = world();
    const half = (85 * Math.PI) / 180;   // a 170-degree yaw about y: qy = sin 85, qw = cos 85, qx = qz = 0
    [0, Math.sin(half), 0, Math.cos(half)].forEach((v, i) => p.words.set(BODY + BODY_QUAT + 4 * i, bits(v)));
    [0.5, -0.25, 1].forEach((v, i) => p.words.set(BODY + BODY_VIEW + 4 * i, bits(v)));
    const row = (await new Sampler(p, 'r0004', { raise: true }).sample())! as unknown as Record<string, unknown>;
    expect(BODY_QUAT).toBe(0x50);
    expect(BODY_VIEW).toBe(0x38);
    expect(row.raiseYaw as number).toBeCloseTo(170, 3);
    expect([row.raiseViewX, row.raiseViewY, row.raiseViewZ]).toEqual([0.5, -0.25, 1]);
    expect(row.raiseTorn).toBe(0);
  });

  it('reads ctrl+0x22c / +0x230 once (the idle base 5.0 and its spread 0) into raiseIdleConfig, not again', async () => {
    const p = world();
    const s = new Sampler(p, 'r0004', { raise: true });
    expect(s.raiseIdleConfig).toBeNull();
    await s.sample();
    expect(s.raiseIdleConfig).toEqual({ ctrl: `0x${CTRL.toString(16)}`, idleBase: 5, idleSpread: 0 });
    p.reads = [];
    await s.sample();
    expect(p.reads).not.toContain(CTRL + 0x22c);
    expect(p.reads).not.toContain(CTRL + 0x230);
  });

  it('an empty record (target 0, skipped by FUN_005c9b30 D:L482111) keeps its own words and nulls its target columns', async () => {
    const p = world();
    p.words.set(ARR + 0x30 + 0, 0);
    const s = new Sampler(p, 'r0004', { raise: true });
    const row = (await s.sample())! as unknown as Record<string, unknown>;
    expect(row[rec(1, 'Target')]).toBe('0x0');
    expect(row[rec(1, 'Dist2')]).toBe(90000);
    for (const f of ['Kind', 'Active', 'Team', 'X', 'Y', 'Z']) expect(row[rec(1, f)], f).toBeNull();
    expect(s.raiseErrors).toBe(0);
  });

  it('a bad target pointer is never followed: its target columns null, counted in raiseErrors, the row kept', async () => {
    const p = world();
    p.words.set(ARR + 0x30 + 0, 0x03000001);
    const s = new Sampler(p, 'r0004', { raise: true });
    const row = (await s.sample())! as unknown as Record<string, unknown>;
    expect(row[rec(1, 'Target')]).toBe('0x3000001');
    expect(row[rec(1, 'Kind')]).toBeNull();
    expect(p.reads).not.toContain(0x03000001 + 0x10);
    expect(s.raiseErrors).toBe(1);
    expect(row[rec(0, 'Marked')]).toBe(1);
  });

  it('a bad array pointer reads no record; a bad controller nulls the controller columns; the body words kept', async () => {
    const p = world();
    p.words.set(BODY + 0xd8, 0x02000000);
    p.words.set(BODY + 0xc0, 0);
    const row = (await new Sampler(p, 'r0004', { raise: true }).sample())! as unknown as Record<string, unknown>;
    for (let i = 0; i < RAISE_RECORDS_MAX; i++) expect(row[rec(i, 'Target')]).toBeNull();
    expect(row.raiseRecs).toBe(2);
    expect(row.raiseCtrl).toBe('0x0');
    for (const k of ['raiseCount', 'raiseReach', 'raiseEdge', 'raiseIdle']) expect(row[k], k).toBeNull();
    expect(row.raiseState).toBe(1);
  });

  it('no local body (the global 0): every raise column null but the globals; the base row kept', async () => {
    const p = world();
    p.words.set(RAISE_ADDRESSES.r0004.localBody, 0);
    const row = (await new Sampler(p, 'r0004', { raise: true }).sample())! as unknown as Record<string, unknown>;
    expect(row.raiseBody).toBe('0x0');
    expect(row.raiseState).toBeNull();
    expect(row.raiseCount).toBeNull();
    expect(row[rec(0, 'Target')]).toBeNull();
    expect(row.raiseGate).toBe(1);
    expect(row.x).toBe(100.5);
  });

  it('walks at most RAISE_RECORDS_MAX records and counts a frame past the cap in raiseBeyondCap', async () => {
    const p = world();
    p.words.set(BODY + 0xd4, RAISE_RECORDS_MAX + 3);
    const s = new Sampler(p, 'r0004', { raise: true });
    const row = (await s.sample())! as unknown as Record<string, unknown>;
    expect(row.raiseRecs).toBe(RAISE_RECORDS_MAX + 3);
    expect(p.reads).not.toContain(ARR + 0x30 * RAISE_RECORDS_MAX);
    expect(s.raiseBeyondCap).toBe(1);
    const q = world();
    const t = new Sampler(q, 'r0004', { raise: true });
    await t.sample();
    expect(t.raiseBeyondCap).toBe(0);
  });

  it('raiseRecords lowers the walk cap (probe.ts --raise-records): one record read, the second null, the frame counted past the cap', async () => {
    const p = world();
    const s = new Sampler(p, 'r0004', { raise: true, raiseRecords: 1 });
    const row = (await s.sample())! as unknown as Record<string, unknown>;
    expect(row[rec(0, 'Marked')]).toBe(1);
    for (const f of RAISE_RECORD_FIELDS) expect(row[rec(1, f)], f).toBeNull();
    expect(p.reads).not.toContain(ARR + 0x30);
    expect(s.raiseBeyondCap).toBe(1);
    expect(() => new Sampler(p, 'r0004', { raise: true, raiseRecords: RAISE_RECORDS_MAX + 1 })).toThrow(/raiseRecords/);
    expect(() => new Sampler(p, 'r0004', { raise: true, raiseRecords: 0 })).toThrow(/raiseRecords/);
  });

  it('flags a row whose raise reads straddled a guest frame (raiseTorn 1, raiseStale null), keeping the row', async () => {
    const p = world();
    p.onRead = (a) => { if (a === RAISE_ADDRESSES.r0004.localBody) p.words.set(GUEST_ADDRESSES.r0004.guestClock, bits(12.5 + 1 / 60)); };
    const s = new Sampler(p, 'r0004', { raise: true });
    const row = (await s.sample())! as unknown as Record<string, unknown>;
    expect(row.raiseTorn).toBe(1);
    expect(row.raiseStale).toBeNull();
    expect(row.raiseCount).toBe(1);
    expect(s.raiseTorn).toBe(1);
  });

  it('a stale count (the gate byte 0: FUN_005970b0 skips FUN_005c9b30, D:L454091-454093): raiseStale 1, the count kept raw', async () => {
    const p = world();
    p.bytes.set(RAISE_ADDRESSES.r0004.gate, 0);
    const row = (await new Sampler(p, 'r0004', { raise: true }).sample())! as unknown as Record<string, unknown>;
    expect(row.raiseGate).toBe(0);
    expect(row.raiseStale).toBe(1);
    expect(row.raiseCount).toBe(1);
  });
});

describe('the smoke script (tools/eph/scripts/raise-idle.txt), dry: parsed, nothing run', () => {
  it('stands idle 10 s: one release of a key never pressed at 10000 ms (it sets the case length and sends no key)', () => {
    const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../eph/scripts/raise-idle.txt'), 'utf8');
    const events = parseScript(text);
    expect(events.map((e) => e.t)).toEqual([10000]);
    const keys = new KeyTranslator();
    expect(events.flatMap((e) => keys.push(e))).toEqual([]);
    expect(text).toMatch(/--raise/);
    expect(text).toMatch(/raise\.torn/);
    expect(text).toMatch(/--raise-records/);
  });
});
