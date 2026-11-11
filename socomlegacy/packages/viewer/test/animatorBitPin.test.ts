import { describe, expect, it } from 'vitest';
import { sampleClip, Skeleton, type MotionClip, type PartPose } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { Animator, type AnimEvent, type LayerContext, type MoverSnapshot, type PoseLayer } from '../src/animator';
import type { GroundMotion, MoverAction, MoverActionName } from '../src/mover';
import { simSkeletonsFromBytes, type SimSkeleton } from '../src/simMap';
import { SEAL_ANIMS } from '../src/locomotion';

/**
 * HIT-ALLOC's pin (a product-track adaptation: the Animator's per-step allocation cut, research 217 s3.6a; no value of
 * the game's changes): the page's `Animator` on the fixture disc's SEAL (MP2's skeleton, its motion from `MOTION_P.ZAR`
 * and `READERC.ZAR`, as `HitPoser` takes it) driven through a scripted `MoverSnapshot` run -- stand, the stand's
 * blends, a stick snap, the turn in place, the crouch and its idles, the crouch walk and strafe, the prone, its crawl,
 * strafe, turn and tilt, the get-up, a jump and its landing, the moving swap's overlay, the pistol, the launcher set, a
 * throw's hold, a pose layer (weighted, a cross-fade, a top), and every clip the motion holds through the traversal seam
 * (alone, held at its root turn, blended with another) -- and every output the page and the room read, each step: every
 * part's local and world matrix (the damage bones' among them), the held nodes' locals (`heldLocal`), `rootY`,
 * `stats()` and the events. Each float is hashed by its bits (a Float32's four bytes, a double's eight: `-0` and `0`
 * differ, as `Object.is` has them), per segment; `GOLDEN` was taken at dd00e82c6 (`agent/hitbox-anim`'s reviewed head),
 * before the cut. Unit-test evidence only.
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
const DT = 1 / 60;

/** Two 32-bit lanes (FNV-1a and a multiply-xorshift) over every word fed: a 64-bit digest. */
class Digest {
  private a = 0x811c9dc5;
  private b = 0x9e3779b9;
  private readonly buf64 = new Float64Array(1);
  private readonly u64 = new Uint32Array(this.buf64.buffer);
  count = 0;
  word(w: number): void {
    this.a = Math.imul(this.a ^ (w >>> 0), 0x01000193) >>> 0;
    this.b = Math.imul((this.b ^ (w >>> 0)) >>> 0, 0x85ebca6b) >>> 0;
    this.b = (this.b ^ (this.b >>> 13)) >>> 0;
    this.count++;
  }
  f32s(m: Float32Array | null): void {
    if (!m) { this.word(0xdeadbeef); return; }
    const u = new Uint32Array(m.buffer, m.byteOffset, m.length);
    for (let i = 0; i < u.length; i++) this.word(u[i]!);
  }
  f64(x: number | null): void {
    if (x === null) { this.word(0xfeedface); return; }
    this.buf64[0] = x;
    this.word(this.u64[0]!); this.word(this.u64[1]!);
  }
  text(s: string): void {
    this.word(s.length);
    for (let i = 0; i < s.length; i++) this.word(s.charCodeAt(i));
  }
  value(v: unknown): void {
    if (typeof v === 'number') { this.word(1); this.f64(v); }
    else if (typeof v === 'string') { this.word(2); this.text(v); }
    else if (typeof v === 'boolean') this.word(v ? 3 : 4);
    else if (v === null || v === undefined) this.word(5);
    else if (Array.isArray(v)) { this.word(6); this.word(v.length); for (const x of v) this.value(x); }
    else { this.word(7); for (const [k, x] of Object.entries(v as Record<string, unknown>)) { this.text(k); this.value(x); } }
  }
  hex(): string {
    return `${this.a.toString(16).padStart(8, '0')}${this.b.toString(16).padStart(8, '0')}`;
  }
}

const REST: MoverSnapshot = {
  vx: 0, vz: 0, vy: 0, yaw: 30, airborne: false, crouched: false, landing: 'soft', jumps: 0, stance: 'stand',
  ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null, turnRate: 0, pitch: 8, aimWeight: 1, stickSnaps: 0,
};
const ground = (state: GroundMotion['state'], forward: number, right: number, cls: GroundMotion['cls']): GroundMotion => ({ state, forward, right, cls });
/** Velocity along the stick in the facing's frame (forward (-sin, -cos), right (cos, -sin)), `speed` units a second. */
function moving(yaw: number, forward: number, right: number, speed: number): Pick<MoverSnapshot, 'vx' | 'vz'> {
  const r = (yaw * Math.PI) / 180;
  return { vx: (-Math.sin(r) * forward + Math.cos(r) * right) * speed, vz: (-Math.cos(r) * forward - Math.sin(r) * right) * speed };
}
const action = (name: MoverActionName, serial: number, t: number, reversed = false): MoverAction => ({ name, serial, t, seconds: 1, reversed });

/** The layer's script: what `PoseLayer.sample` answers at each step of its window (set by the run). */
type LayerAnswer = { clip: MotionClip; weight: number; crossFade?: number; top?: boolean; noPitchtwist?: boolean } | null;

/** A segment: a name and its steps; each step a snapshot and, before it, an optional call on the animator. */
type Step = { mover: MoverSnapshot; before?: (a: Animator) => void; layer?: LayerAnswer };
type Segment = { name: string; steps: Step[] };

function script(clips: readonly MotionClip[]): Segment[] {
  const segs: Segment[] = [];
  const seg = (name: string, n: number, at: (k: number) => Partial<MoverSnapshot>, extra?: (k: number) => Omit<Step, 'mover'>): void => {
    segs.push({ name, steps: Array.from({ length: n }, (_, k) => ({ mover: { ...REST, ...at(k) }, ...(extra?.(k) ?? {}) })) });
  };
  let yaw = 30, snaps = 0;
  const turnYaw = (rate: number): number => { yaw += (rate * DT * 180) / Math.PI; return yaw; };
  seg('stand idle, the look', 30, (k) => ({ yaw, pitch: 8 + k * 0.3 }));
  seg('stand forward ramp, banked', 60, (k) => {
    const f = Math.min(1, 0.15 + k / 40), rate = k < 30 ? 0.8 : -1.2;
    return { yaw: turnYaw(rate), turnRate: rate, ground: ground('stand', f, 0, 1), ...moving(yaw, f, 0, 60 * f), pitch: -5 };
  });
  seg('stand diagonal, a snap', 30, (k) => {
    if (k === 15) snaps++;
    return { yaw, ground: ground('stand', 0.7, k < 15 ? 0.5 : 0, 1), ...moving(yaw, 0.7, k < 15 ? 0.5 : 0, 50), stickSnaps: snaps };
  });
  seg('stand back-left', 30, (k) => ({ yaw, ground: ground('stand', -0.6, -0.4 - k / 100, 3), ...moving(yaw, -0.6, -0.5, 35) }));
  seg('stand stop', 20, () => ({ yaw }));
  seg('stand turn in place', 30, (k) => { const rate = k < 15 ? 2 : -1.5; return { yaw: turnYaw(rate), turnRate: rate }; });
  seg('stand to crouch', 24, (k) => ({ yaw, action: action('standToCrouch', 1, k * DT), crouched: true, stance: 'crouch' }));
  seg('crouch idle', 40, () => ({ yaw, crouched: true, stance: 'crouch', pitch: 20 }));
  seg('crouch walk', 40, (k) => ({ yaw, crouched: true, stance: 'crouch', ground: ground('crouch', 0.3 + k / 80, 0, 1), ...moving(yaw, 0.6, 0, 20) }));
  seg('crouch strafe right', 30, () => ({ yaw, crouched: true, stance: 'crouch', ground: ground('crouch', 0, 0.6, 0), ...moving(yaw, 0, 0.6, 18) }));
  seg('crouch back', 20, () => ({ yaw, crouched: true, stance: 'crouch', ground: ground('crouch', -0.5, 0, 3), ...moving(yaw, -0.5, 0, 15) }));
  seg('crouch turn', 20, () => ({ yaw: turnYaw(1.4), turnRate: 1.4, crouched: true, stance: 'crouch' }));
  seg('crouch to prone', 40, (k) => ({ yaw, action: action('crouchToProne', 2, k * DT), crouched: true, stance: 'prone' }));
  const tilt = (k: number): [number, number, number, number] => { const a = 0.05 + k * 0.002; return [Math.sin(a), 0, 0, Math.cos(a)]; };
  seg('prone idle, tilted', 30, (k) => ({ yaw, stance: 'prone', rootTilt: tilt(k) }));
  seg('prone crawl', 40, (k) => ({ yaw, stance: 'prone', ground: ground('prone', 0.8, 0, 1), ...moving(yaw, 0.8, 0, 8), rootTilt: tilt(k) }));
  seg('prone crawl back', 20, () => ({ yaw, stance: 'prone', ground: ground('prone', -0.7, 0, 3), ...moving(yaw, -0.7, 0, 6) }));
  seg('prone strafe left', 30, () => ({ yaw, stance: 'prone', ground: ground('prone', 0, -0.9, 2), ...moving(yaw, 0, -0.9, 7) }));
  seg('prone turn', 30, () => ({ yaw: turnYaw(-1.8), turnRate: -1.8, stance: 'prone' }));
  seg('prone get up (stand to prone, reversed)', 50, (k) => ({ yaw, action: action('standToProne', 3, k * DT, true), stance: 'stand' }));
  seg('stand idle again', 20, () => ({ yaw }));
  seg('jump', 24, (k) => ({ yaw, action: action('jump', 4, k * DT), airborne: k > 4, vy: 40 - k * 3, jumps: 1, landing: null }));
  seg('fall', 12, (k) => ({ yaw, action: action('fall', 5, k * DT), airborne: true, vy: -30, jumps: 1, landing: null }));
  seg('land', 20, (k) => ({ yaw, action: k < 12 ? action('land', 6, k * DT) : null, jumps: 1, landing: 'soft' }));
  seg('run with the moving swap overlay', 50, (k) => ({
    yaw, ground: ground('stand', 1, 0, 1), ...moving(yaw, 1, 0, 65),
    overlay: k < 40 ? { clip: SEAL_ANIMS.swapMoving, t: k * DT, seconds: 0.6, reversed: false, serial: 1 } : null,
  }));
  seg('pistol: run, stop, idle', 60, (k) => (k < 30 ? { yaw, ground: ground('stand', 0.9, 0.1, 1), ...moving(yaw, 0.9, 0.1, 55) } : { yaw }),
    (k) => (k === 0 ? { before: (a) => a.setWeapon('pistol') } : {}));
  seg('pistol back to the rifle', 20, () => ({ yaw }), (k) => (k === 0 ? { before: (a) => a.setWeapon('rifle') } : {}));
  seg('launcher set: crouch, crouch step', 40, (k) => ({ yaw: k >= 20 ? turnYaw(1) : yaw, turnRate: k >= 20 ? 1 : 0, crouched: true, stance: 'crouch' }),
    (k) => (k === 0 ? { before: (a) => a.setLauncherSet(true) } : k === 39 ? { before: (a) => a.setLauncherSet(false) } : {}));
  seg('a throw\'s hold over the run', 40, (k) => ({
    yaw, ground: ground('stand', 0.8, 0, 1), ...moving(yaw, 0.8, 0, 50), hold: k < 30 ? 'seal_throwgrenade' : null,
  }));
  const byName = new Map(clips.map((c) => [c.name, c]));
  const fire = byName.get('seal_crouch_recoil') ?? byName.get(SEAL_ANIMS.swapStand) ?? clips[0]!;
  const top = byName.get('seal_throwgrenade') ?? clips[1]!;
  seg('a pose layer: weighted, a cross-fade, then a top', 60, (k) => ({ yaw, ground: ground('stand', k < 40 ? 0.5 : 0, 0, k < 40 ? 1 : -1), ...moving(yaw, k < 40 ? 0.5 : 0, 0, 30) }),
    (k) => ({
      layer: k < 15 ? { clip: fire, weight: 0.5 } : k < 30 ? { clip: fire, weight: 1, crossFade: k === 15 ? 0.2 : undefined, noPitchtwist: k > 25 }
        : k < 45 ? { clip: top, weight: 1, top: true, crossFade: k === 30 ? 0.25 : undefined } : null,
    }));
  seg('a death landing', 30, (k) => ({ yaw, action: action('landDeath', 7, k * DT) }));
  // Every clip the motion holds, through the traversal seam: alone, then held at its root turn with a root height, then
  // blended with the next clip; a few keys of each.
  // Ten clips a segment (each a new play: a cross-fade from the last).
  for (let first = 0; first < clips.length; first += 10) {
    const group = clips.slice(first, first + 10);
    seg(`clips ${first}..${first + group.length - 1}`, group.length * 6, (s) => {
      const i = first + Math.floor(s / 6), k = s % 6, c = clips[i]!, next = clips[(i + 1) % clips.length]!;
      return {
        yaw,
        traversal: {
          clip: c.name, frame: (k * c.frameCount) / 5 + (i % 3) * 0.37, loop: i % 2 === 0, rootY: k >= 2 ? 11 + k : null,
          holdRootTurn: k === 2 || k === 3, blend: k >= 4 ? { clip: next.name, weight: 0.35 } : undefined,
        },
      };
    });
  }
  seg('back on the ground', 30, (k) => ({ yaw, ground: ground('stand', k < 20 ? 1 : 0, 0, k < 20 ? 1 : -1), ...moving(yaw, 1, 0, 65) }));
  return segs;
}

/** Steps one animator over the segments; `each` reads its outputs after every step into the segment's digest. */
function drive(motion: NonNullable<SimSkeleton['motion']>, base: Skeleton, segs: readonly Segment[]) {
  const skeleton = new Skeleton(base.model, base.modelMatrix, base.parts);
  let seed = 7;
  const anim = new Animator(skeleton, motion.clips, motion.table, { random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; } });
  let answer: LayerAnswer = null;
  const layer: PoseLayer = {
    sample(current: LayerContext) {
      if (!answer) return null;
      const parts: PartPose[] = sampleClip(answer.clip, (current.phase * answer.clip.frameCount) / answer.clip.rate, { loop: true }).parts;
      return { parts, weight: answer.weight, crossFade: answer.crossFade, top: answer.top, noPitchtwist: answer.noPitchtwist };
    },
  };
  anim.addPoseLayer(layer);
  const events: AnimEvent[] = [];
  anim.onEvent((e) => events.push(e));
  let seg = 0, at = 0, digest = new Digest();
  const out: { name: string; hex: string; words: number }[] = [];
  return {
    /** One step; true while steps remain. */
    step(): boolean {
      const s = segs[seg];
      if (!s) return false;
      const st = s.steps[at]!;
      answer = st.layer ?? null;
      st.before?.(anim);
      events.length = 0;
      anim.step(DT, st.mover);
      for (let i = 0; i < skeleton.parts.length; i++) { digest.f32s(skeleton.local[i]!); digest.f32s(skeleton.world[i]!); }
      digest.f32s(anim.heldLocal('rifle'));
      digest.f32s(anim.heldLocal('pistol'));
      digest.f64(anim.rootY());
      digest.value(anim.stats());
      digest.value(events);
      if (++at >= s.steps.length) {
        out.push({ name: s.name, hex: digest.hex(), words: digest.count });
        seg++; at = 0; digest = new Digest();
      }
      return true;
    },
    out,
  };
}

/** The digests at dd00e82c6, one per segment, in the script's order (`S2U_ANIM_PIN_RECORD=1` prints them). */
const GOLDEN: readonly string[] = [
  'bf5a961feae38497:30976', '38ba71fe1b6b7cbb:63445', '0ebd81961a1ad3f6:32937', 'e0c11b67ffca80f1:32679',
  '2ec60dd62b0227ac:20926', 'fafb359dd49871b4:31245', '3946ba364ca59373:25498', 'f05c21f494c5f78f:42665',
  'dd94f1ac1caee6b2:42393', 'c5ab3bf4d543f61d:32614', '964ead2ac5c9cee7:21742', 'ee48a774194307f6:21313',
  'b437b5aeb98f9601:42466', 'f8a01b63febd1b27:31408', 'fd37292ade3b0544:42219', 'd11bcb88125cd3a5:21345',
  'b8d8c2f5cb197fdb:32039', '6059958fb3a19f23:31851', '34e848a810e5e49f:52790', '7617da22d29bd621:21006',
  '4c4b4a470b465ac8:24861', 'f75417cfcc5a7559:12811', 'ffc09f821b6041cc:21168', '3e66085d183fbf11:52758',
  'a50a2db8b16ba8e9:65425', 'd838bf6e5685f6b2:20840', '900272949a70b47e:42126', 'd6ae779a8c8c9845:42815',
  'd2e4d7bd758d556d:65825', 'badab9ab33505fdc:31855', '9259c31661cdb199:66547', '629aedfd42e3a43c:65809',
  '07821c00edaa1d03:67690', 'fb291a73f3567470:67236', '203ee25e012f40c4:68018', '27b451ef628ca5aa:66852',
  '1badfa2a657df35d:66736', '9176d647d84d9eed:67240', 'b3624f29c42c906a:64860', '43e1fef8bcddb65f:67505',
  '98d775b34cf50158:60197', 'ae08458ef3d4b763:31269',
];

describe.skipIf(!MP2 || !PACK || !READERC)(`HIT-ALLOC pin: the Animator's outputs, bit for bit${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const seal = MP2 && PACK && READERC ? simSkeletonsFromBytes(MP2, READERC, PACK).seal[0] : undefined;

  it('every part\'s local and world matrix, the held locals, rootY, stats and events, each step, equal the pin taken at dd00e82c6', () => {
    expect(seal?.motion).toBeDefined();
    const motion = seal!.motion!;
    expect(motion.clips.length).toBeGreaterThan(100);
    const segs = script(motion.clips);
    const run = drive(motion, seal!.skeleton, segs);
    while (run.step()) { /* the whole script */ }
    const steps = segs.reduce((n, s) => n + s.steps.length, 0);
    const got = run.out.map((o) => `${o.hex}:${o.words}`);
    if (process.env.S2U_ANIM_PIN_RECORD === '1') {
      console.log(`HIT-ALLOC pin record: ${segs.length} segments, ${steps} steps, ${motion.clips.length} clips`);
      for (let i = 0; i < got.length; i += 8) console.log(`HIT-ALLOC pin golden ${i}: ${JSON.stringify(got.slice(i, i + 8))}`);
      return;
    }
    console.log(`HIT-ALLOC pin: ${segs.length} segments, ${steps} steps, ${motion.clips.length} clips, ${run.out.reduce((n, o) => n + o.words, 0)} words hashed`);
    expect(got.length).toBe(GOLDEN.length);
    got.forEach((g, i) => expect(g, `segment ${i}: ${run.out[i]!.name}`).toBe(GOLDEN[i]));
  });

  it('two animators stepped in turn give each one\'s outputs alone (no scratch shared between animators)', () => {
    const motion = seal!.motion!;
    const segs = script(motion.clips);
    const alone = drive(motion, seal!.skeleton, segs);
    while (alone.step()) { /* the whole script */ }
    const a = drive(motion, seal!.skeleton, segs), b = drive(motion, seal!.skeleton, segs.slice(7).concat(segs.slice(0, 7)));
    for (let k = 0; k < 40; k++) b.step();                       // out of phase
    let more = true;
    while (more) { more = a.step(); b.step(); }
    expect(a.out.map((o) => o.hex)).toEqual(alone.out.map((o) => o.hex));
  });
});
