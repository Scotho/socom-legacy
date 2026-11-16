// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { readSkeleton, type MotionClip, type Skeleton } from '@s2u/scene';
import { Animator, FIRE_SUB_MISSING_BONE_READING, PLAY_CLIPS, qmul, qrot, quatOfMatrix, type MoverSnapshot } from '../src/animator';
import { heldSkeleton } from '../src/heldItem';
import { PISTOL_ANIMS } from '../src/locomotion';
import { clipsFromPack, motionTableFromArchive, type MotionTable } from '../src/motionTable';
import { FIRE_VERSIONS, PISTOL_FIRE_VERSIONS, WeaponPose } from '../src/weaponPose';
import { fixture } from '../../archive/test/fixtures';

/**
 * FIRE-LAYER FL-0 (seat 8a's finding 16; research 217 s3.6c; simulation track; reading, pending review). The original
 * hangs each play node's Fire version on that node as a sub-node at the eased raise weight (`FUN_0057a330`
 * D:L438828-438859, `FUN_0028bdd0` D:L133955-133964) and folds it into the node bone by bone (`FUN_00576bb0`
 * D:L436709-436783) BEFORE the nodes are merged (`FUN_00577ea0` D:L437436-437455, `FUN_00577000`). The port laid the
 * Fire versions as one layer over the merged body, which halves the lateral clip's share with the rifle raised.
 *
 * The expected values are the original's, measured on the capture rig (AH-4, b0's box run of the move harness at
 * 67da2ffeb; agent-mail/evidence/diag-slide/ah4-67da2ffeb/keep/out/q16/, table (i), "hips - actor yaw"): standing,
 * raised, the stick at 45 degrees -- full (`st-full45`) -54.7 (-59.2..-50.8), half (`st-half45`) -45.7 (-47.6..-42.7);
 * at rest -60.14 (`seal_fp_stand`'s own hips). The port's lowered 45-degree run, -49.8 (the same table's "port
 * lowered" row; the original's own rows were raised), is the port's and stays.
 *
 * The hips' heading is the hips' local z axis through `skel_root` (identity in every locomotion clip), as the
 * finding's reduction reads it: the angle of (x, z), degrees, the root's own heading taken off. The skeleton is
 * MP2.ZDB's `seal_A_scuba`; the clips MOTION_P.ZAR's, the table READERC.ZAR's -- the fixtures' byte copies, else
 * `SOCOM_DISC` (or `<SOCOM_PC_ROOT>/game/disc`); skipped, said so, without either. Unit-test evidence of the port
 * against the rig's numbers; not a capture comparison of the port.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const read = (name: string): Uint8Array | null => {
  const f = fixture(`RUN/${name}`);
  if (f) return f;
  const p = DISC ? join(DISC, 'RUN', name) : '';
  return p && existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
};
const MP2 = read('MP2.ZDB'), PACK = read('MOTION_P.ZAR'), READERC = read('READERC.ZAR');
const HAVE = MP2 !== null && PACK !== null && READERC !== null;
const SKIP = HAVE ? '' : ' (skipped: test-fixtures/RUN and SOCOM_DISC lack MP2.ZDB, MOTION_P.ZAR or READERC.ZAR)';

const DT = 1 / 60;
const D = Math.SQRT1_2;
const DEG = 180 / Math.PI;

const clips: MotionClip[] = HAVE ? clipsFromPack(PACK!, [...new Set([...PLAY_CLIPS, ...Object.values(FIRE_VERSIONS)])]) : [];
const table: MotionTable | null = HAVE ? motionTableFromArchive(READERC!) : null;

const REST: MoverSnapshot = {
  vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand',
  ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null, turnRate: 0,
};

/** The stick at `deg` right of forward, `m` of the way: the standing blend (`FUN_00583030`), the body moving with it. */
const standing = (deg: number, m: number): MoverSnapshot => {
  const f = Math.cos(deg / DEG) * m, r = Math.sin(deg / DEG) * m;
  return { ...REST, vx: 65 * r, vz: -65 * f, ground: { state: 'stand', forward: f, right: r, cls: 1 } };
};

/** A body as the page's copy is built (`play.ts`): the animator, the weapon's Fire and reload layers, the rifle. */
class Body {
  readonly sk: Skeleton;
  readonly anim: Animator;
  readonly pose: WeaponPose;
  constructor(layers = true) {
    const toc = parseZdb(MP2!);
    this.sk = readSkeleton(Zar.parse(zdbMember(MP2!, toc, 'CLIB_GEO.ZED')), 'seal_A_scuba');
    this.anim = new Animator(this.sk, clips, table, { random: () => 0 });
    this.pose = new WeaponPose(new Map(clips.map((c) => [c.name, c])), table);
    this.anim.setWeapon('rifle');
    this.pose.item = 'rifle';
    if (layers) { this.anim.addPoseLayer(this.pose.fireLayer); this.anim.addPoseLayer(this.pose.reloadLayer); }
  }
  step(snap: MoverSnapshot, raise: number): void {
    this.pose.fireWeight = raise;
    this.pose.step(DT);
    this.anim.step(DT, { ...snap, aimWeight: raise });
  }
  /** Part `name`'s turn in the actor's frame: the locals from `skel_root` down to it, composed. */
  turn(name: string): [number, number, number, number] {
    const chain: number[] = [];
    for (let i = this.sk.indexOf(name); i >= 0; i = this.sk.parts[i]!.parent) chain.unshift(i);
    let q: [number, number, number, number] = [0, 0, 0, 1];
    for (const i of chain) q = qmul(q, quatOfMatrix(this.sk.local[i]!));
    return q;
  }
  /** The hips' heading minus the root's, degrees (finding 16's "hips - actor yaw"). */
  hips(): number {
    const heading = (q: readonly number[]): number => { const v = qrot(q, [0, 0, 1]); return Math.atan2(v[0], v[2]) * DEG; };
    const d = heading(this.turn('hips')) - heading(this.turn('skel_root'));
    return ((d + 540) % 360) - 180;
  }
}

/** `settle` seconds held, then each frame's `read` over `span` seconds. */
function hold<T>(body: Body, snap: MoverSnapshot, raise: number, read: () => T, settle = 3, span = 4): T[] {
  for (let t = 0; t < settle; t += DT) body.step(snap, raise);
  const out: T[] = [];
  for (let t = 0; t < span; t += DT) { body.step(snap, raise); out.push(read()); }
  return out;
}

const mean = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const swing = (v: readonly number[]): number => Math.max(...v) - Math.min(...v);

describe.skipIf(!HAVE)(`FL-0: each node's Fire version folded in before the mix${SKIP}`, () => {
  // The swing is AH-4 q16 `st-full45`'s range, -50.8 - -59.2 = 8.4 (the review's F2; Q11's own measured swing was 8.6).
  it("raised, standing, the stick at 45 degrees full: the hips' heading over the root is the original's -54.7 (swing 8.4) -- the port laid Fire over the mix, -31.0", () => {
    const b = new Body();
    const h = hold(b, standing(45, 1), 1, () => b.hips());
    console.log(`FL-0 full45 raised: mean ${mean(h).toFixed(2)} swing ${swing(h).toFixed(2)} nodes ${JSON.stringify(b.anim.stats().nodes)}`);
    expect(mean(h)).toBeGreaterThan(-54.7 - 2);
    expect(mean(h)).toBeLessThan(-54.7 + 2);
    expect(swing(h)).toBeGreaterThan(8.4 - 2);
    expect(swing(h)).toBeLessThan(8.4 + 2);
  });

  // The review's F1: the original folds a part the node lacks from its slot's leftover (FUN_00576bb0 D:L436732; the
  // copy at D:L436756-436763 never runs), which the port does not keep (`FIRE_SUB_MISSING_BONE_READING`). Measured on
  // the box (b0, fl0 at 5b99c2d3ce): all 46 pairs in the pack, 39 of them with such parts -- and only two names,
  // `pistol` and `do_not_use` (the held item's `weapon` read as `rifle`, as `partIndex` reads it). `do_not_use` is no
  // node of the play skeleton (the body's 26 parts and the two held items, `heldSkeleton`): the fold never meets it
  // (`slotOf` -1). `pistol` is the sidearm's held node (`HELD_NODES`): drawn, the node's clip is first the pistol's
  // version (`PISTOL_ANIMS`, laid as the chain's hand variant at 1.0 is, D:L438802-438826), which carries `pistol`, so
  // the fold is the ordinary one; with the rifle in hand the `pistol` node is posed by its mount, not its track.
  it("every Fire version's parts beyond its node clip's are only `pistol` and `do_not_use`; `do_not_use` is no node the port poses; each pistol version laid first carries `pistol`", () => {
    const pairs = [...Object.entries(FIRE_VERSIONS), ...Object.entries(PISTOL_FIRE_VERSIONS)];
    const hands = [...new Set(Object.keys(PISTOL_FIRE_VERSIONS).map((b) => PISTOL_ANIMS[b]).filter((h): h is string => !!h))];
    const pack = new Map(clipsFromPack(PACK!, [...new Set([...pairs.flat(), ...hands])]).map((c) => [c.name, c]));
    const names = (c: MotionClip): Set<string> => new Set(c.parts.map((p) => (p.name === 'weapon' ? 'rifle' : p.name)));
    const absent: string[] = [], lines: string[] = [];
    const extra = new Set<string>();
    for (const [base, fire] of pairs) {
      const b = pack.get(base), f = pack.get(fire);
      if (!b || !f) { absent.push(`${base} -> ${fire}`); continue; }
      const has = names(b);
      for (const n of names(f)) if (!has.has(n)) { extra.add(n); lines.push(`${fire} (${base}): ${n}`); }
    }
    console.log(`FL-0 Fire parts: ${pairs.length} pairs, absent ${JSON.stringify(absent)}; ${lines.length} parts beyond the node clip's: ${[...extra].sort().join(', ')}`);
    // every pair, the pistol's too (re-review 1): the note's claim needs each pair read
    expect(absent, 'every FIRE_VERSIONS and PISTOL_FIRE_VERSIONS pair in MOTION_P.ZAR').toEqual([]);
    for (const n of extra) expect(['do_not_use', 'pistol'], n).toContain(n);
    const toc = parseZdb(MP2!);
    const play = heldSkeleton(readSkeleton(Zar.parse(zdbMember(MP2!, toc, 'CLIB_GEO.ZED')), 'seal_A_scuba'));
    expect(play.indexOf('do_not_use'), 'do_not_use: no node of the play skeleton').toBe(-1);
    expect(play.indexOf('pistol'), 'pistol: the sidearm held node').toBeGreaterThanOrEqual(0);
    for (const hand of hands) expect(pack.get(hand) ? names(pack.get(hand)!).has('pistol') : false, `${hand} carries pistol`).toBe(true);
    const bare = Object.keys(PISTOL_FIRE_VERSIONS).filter((b) => !PISTOL_ANIMS[b]);
    console.log(`FL-0 pistol bases with no pistol version in PISTOL_ANIMS (the Fire's own \`pistol\` taken whole while the raise eases): ${bare.join(', ')}`);
    expect(FIRE_SUB_MISSING_BONE_READING).toBe('whole');
  });

  it("raised, standing, the stick at 45 degrees half: the original's -45.7 -- the port laid Fire over the mix, -28.8", () => {
    const b = new Body();
    const h = hold(b, standing(45, 0.5), 1, () => b.hips());
    console.log(`FL-0 half45 raised: mean ${mean(h).toFixed(2)} swing ${swing(h).toFixed(2)} nodes ${JSON.stringify(b.anim.stats().nodes)}`);
    expect(mean(h)).toBeGreaterThan(-45.7 - 2);
    expect(mean(h)).toBeLessThan(-45.7 + 2);
  });

  it("lowered, the stick at 45 degrees full: the port's own -49.8 stays (no Fire laid at weight 0)", () => {
    const b = new Body();
    const h = hold(b, standing(45, 1), 0, () => b.hips());
    expect(mean(h)).toBeGreaterThan(-49.8 - 1);
    expect(mean(h)).toBeLessThan(-49.8 + 1);
  });

  it("raised and still: seal_fp_stand's hips, -60.14, every frame", () => {
    const b = new Body();
    const h = hold(b, REST, 1, () => b.hips());
    for (const v of h) expect(v).toBeCloseTo(-60.14, 0);
    expect(b.pose.stats()).toMatchObject({ fire: 'seal_fp_stand', fireWeight: 1 });
  });

  it('lowered, crouched and walking on the diagonal: the pose is the bare animator\'s, to the float (the layers lay nothing at 0)', () => {
    const snap: MoverSnapshot = { ...REST, stance: 'crouch', crouched: true, vx: 10, vz: -10, ground: { state: 'crouch', forward: D * 0.5, right: D * 0.5, cls: 1 } };
    const b = new Body(), bare = new Body(false);
    for (let t = 0; t < 3; t += DT) { b.step(snap, 0); bare.step(snap, 0); }
    for (let i = 0; i < b.sk.parts.length; i++) expect(Array.from(b.sk.local[i]!), b.sk.parts[i]!.name).toEqual(Array.from(bare.sk.local[i]!));
  });
});

/**
 * FIRE-LAYER FL-0b (seat 8a's finding 18; research 217 s3.6c; reading, pending review): the Fire sub-node runs at its
 * node's phase. `FUN_0028c380` (D:L134196-134219) gives each node the play's phase plus its offset and every sub-node on
 * its chain the same (D:L134213-134216), and `FUN_0028d670` (D:L134881-134903) samples each at that phase times its own
 * key count; the actor update calls it on every branch (`FUN_0057a330` D:L438875, D:L438891, D:L438909). The port ran
 * a still Fire clip (`seal_fp_step`, `seal_fp_crouch_step`: `max_velocity` -2 in motion.rdr) on its own clock at its
 * own `playback`, while the turn's clip crawls with the turn (`FUN_00583960`).
 *
 * The bound is the original's (AH-4 q16, table (iii), "row-2 turn deg/s" medians over the steady part, raised): standing
 * `stand-turnL` hips 6.3, feet 6.6 / 3.7; crouched `crouch-turnL` hips 7.7, feet 4.8 / 9.0; the port read 31.5 / 104 /
 * 89 and 132 / 99 / 171. Each bound 2 x the original's + 5 degrees a second (the harness's). The rig measures the turn in
 * the world, the actor's 4.9 degrees a second in it; this test reads each node's turn in the actor's frame, so a smooth
 * pose reads under the rig's figure, not over it.
 */
describe.skipIf(!HAVE)(`FL-0b: the Fire sub-node at its node's phase${SKIP}`, () => {
  const TURN = 4.9 / DEG;                                       // the rigs' turn, radians a second, left positive
  /** The angle between two unit quaternions, degrees. */
  const angle = (a: readonly number[], b: readonly number[]): number =>
    2 * Math.acos(Math.min(1, Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! + a[3]! * b[3]!))) * DEG;
  const median = (v: number[]): number => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]!; };
  /** Raised, turning in place: the median frame-to-frame turn of the hips and the feet, degrees a second. */
  const rates = (snap: MoverSnapshot): { hips: number; lfoot: number; rfoot: number } => {
    const b = new Body();
    const names = ['hips', 'lfoot', 'rfoot'] as const;
    let last: [number, number, number, number][] | null = null;
    const seen = hold(b, snap, 1, () => {
      const now = names.map((n) => b.turn(n));
      const d = last ? now.map((q, k) => angle(q, last![k]!) / DT) : null;
      last = now;
      return d;
    }, 3, 4).slice(30).filter((d): d is number[] => d !== null);
    const out = { hips: median(seen.map((d) => d[0]!)), lfoot: median(seen.map((d) => d[1]!)), rfoot: median(seen.map((d) => d[2]!)) };
    console.log(`FL-0b ${snap.stance} turn raised: ${JSON.stringify(out)} play ${b.anim.stats().play} fire ${b.pose.stats().fire}`);
    return out;
  };

  it("standing, raised, turning left at 4.9 degrees a second: hips and feet turn at the original's rate (under 2 x 6.3 / 6.6 / 3.7 + 5) -- the port read 31.5 / 104 / 89", () => {
    const r = rates({ ...REST, turnRate: TURN });
    expect(r.hips).toBeLessThan(2 * 6.3 + 5);
    expect(r.lfoot).toBeLessThan(2 * 6.6 + 5);
    expect(r.rfoot).toBeLessThan(2 * 3.7 + 5);
  });

  it("crouched, raised, turning left at 4.9 degrees a second: under 2 x 7.7 / 4.8 / 9.0 + 5 -- the port read 132 / 99 / 171", () => {
    const r = rates({ ...REST, stance: 'crouch', crouched: true, turnRate: TURN });
    expect(r.hips).toBeLessThan(2 * 7.7 + 5);
    expect(r.lfoot).toBeLessThan(2 * 4.8 + 5);
    expect(r.rfoot).toBeLessThan(2 * 9.0 + 5);
  });
});
