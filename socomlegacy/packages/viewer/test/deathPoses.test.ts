import { describe, expect, it } from 'vitest';
import { parseRdr, rdrGet, Zar, type RdrNode } from '@s2u/archive';
import { partMatrix, type MotionClip, type Skeleton } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { simSkeletonsFromBytes, type SimSkeleton } from '../src/simMap';
import { Animator, type MoverSnapshot } from '../src/animator';
import { deathPose } from '../src/remotePlayers';
import { oneShotSeconds } from '../src/locomotion';
import { deathClip, DEATH_CLIPS } from '../src/net/deaths';
import { PART } from '../src/net/damage';
import type { Stance } from '../src/mover';
import { KICK_DOOR_TYPE_READING, OPEN_DOOR_TYPE } from '../src/doors';

/**
 * LATER 967 (research 421; simulation track, a measuring tool: it changes nothing the game does): which way the disc's
 * death clips leave a body, and whether the port draws the same.
 *
 * For every clip of `MOTION_P.ZAR` whose name starts `death` (and the knock's two landings, the blast's and the fall's
 * bodies), on Frostfire's (MP2) SEAL 1 (`seal_A_scuba`) and TERRORIST 1 (`al_gman01`):
 * - the CLIP's own pose at its last distinct key, n - 1 (key n is key 0, research 77 section 5): every track the clip
 *   carries laid as it is, the root's x and z included;
 * - the PORT's drawn body: the animator (`Animator`, the page's) fed `deathPose` -- the traversal seam `remotePlayers`
 *   and `walk.ts`'s `setDeathPose` drive for a dead SEAL -- run past the one-shot's end (`oneShotSeconds`).
 * Each is read in the body frame (x right, y up, z behind: the model faces -z; `net/hitVolumes`): the chest's front (the
 * torso's normal, (lbicep - rbicep) x (neck - spinelo), and `spinehi`'s own axis that is the front in the bind), the
 * root's travel and height, the pelvis's heading. Then the port's pick (`deathClip`) for each case the Shadow PC looked
 * at, and the original's anim-type numbering the state word `[E+0x534]` reads in (`FUN_005e30f0` D:L495452-495487, the
 * ELF's static table at 0x661060; `FUN_005e3ff0` D:L496194-496238 appending `animset.rdr`'s other `type_name`s in
 * first appearance), so the three values the Shadow PC read (7, 149, 142) are named. Unit-test evidence over the
 * fixture disc's data (`RUN/MOTION_P.ZAR`, `RUN/READERC.ZAR`, `RUN/MP2.ZDB`); nothing measured running.
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
const HAVE = !!(MP2 && PACK && READERC);

/** The knock's landings (`./locomotion` `SEAL_ANIMS.landDeath`, `.landBackwards`): a blast's or a fall's dead body. */
const LANDINGS = ['seal_landforward01', 'seal_landbackwards01'] as const;

/**
 * The ELF's static anim-type names, `PTR_s_Reference_00661060`'s 137 (`DAT_0066b800 = 0x89`, D:L495452), id = index
 * (read off the r0001 ELF's data, as research 180 section 1.15 and 368 section 0 read it).
 */
const STATIC_TYPES: readonly string[] = [
  'Reference', 'Stand', 'Walk', 'Jog', 'Run', 'Walk backwards', 'Jog backwards', 'Die', 'Jump launch', 'Jump fall',
  'Jump land', 'Jump land hard', 'Strafe right', 'Strafe left', 'Strafe right fast', 'Strafe left fast', 'Step',
  'Stand -> Crouch', 'Crouch', 'Crouch -> Prone', 'Crouch walk', 'Crouch step', 'Crouch strafe right',
  'Crouch strafe right fast', 'Crouch walk backwards', 'Stand -> Prone', 'Prone', 'Prone crawl', 'Prone turn',
  'Peek left', 'Peek right', 'Crouch peek left', 'Crouch peek right', 'Stand -> Hang', 'Hang', 'Hang -> Climb',
  'Hang jump down', 'Ledge -> Hang backwards', 'Hop down backwards', 'Falling', 'Land soft', 'Land hanging',
  'Climb crate', 'Hop down forward', 'Stand -> Ladder', 'Climb ladder', 'Climb off ladder', 'Fall forward',
  'Get up forward', 'Throw grenade', 'Toss grenade', 'Flinch right arm', 'Flinch right leg', 'Rifle -> Pistol',
  'Crouch rifle -> Pistol', 'Prone rifle -> Pistol', 'Stand -> Binocular', 'Crouch -> Binocular',
  'Prone -> Binocular', 'Apply restraints', 'Receive restraints', 'Put on ground', 'Put on wall', 'Open door',
  'Get from ground', 'Get from surface', 'Run right', 'Run left', 'On wall', 'On wall smoke', 'Stand -> On wall',
  'Stand stretch', 'Slouch', 'Slouch smoke', 'Stab', 'Pistol stab', 'Stabbed', 'CQB', 'Pistol CQB',
  'CQBVictimFallBackwards', 'CQBVictimFallForwards', 'Head looks', 'Head looks prone', 'Pistol stand',
  'Pistol crouch', 'Pistol prone', 'Pistol hang', 'Pistol climb ladder', 'Pistol walk', 'Pistol jog', 'Pistol run',
  'Pistol walk backwards', 'Pistol jog backwards', 'Pistol die', 'Pistol strafe right', 'Pistol strafe left',
  'Pistol strafe right fast', 'Pistol strafe left fast', 'Pistol step', 'Pistol stand -> Crouch',
  'Pistol crouch -> Prone', 'Pistol crouch walk', 'Pistol crouch step', 'Pistol crouch strafe right',
  'Pistol crouch walk back', 'Pistol prone crawl', 'Pistol peek left', 'Pistol peek right',
  'Pistol crouch peek left', 'Pistol crouch peek right', 'Pistol stand -> Hang', 'Pistol hang -> Climb',
  'Pistol hang jump down', 'Pistol ledge -> Hang backwards', 'Pistol hop down backwards', 'Pistol falling',
  'Pistol land soft', 'Pistol land hanging', 'Pistol climb crate', 'Pistol hop down forward',
  'Pistol stand -> Ladder', 'Pistol climb off ladder', 'Pistol fall forward', 'Pistol get up forward',
  'Pistol throw grenade', 'Pistol toss grenade', 'Pistol stand -> Binocular', 'Pistol crouch -> Binocular',
  'Pistol prone -> Binocular', 'Pistol apply restraints', 'Pistol put on ground', 'Pistol put on wall',
  'Pistol open door', 'Pistol get from ground', 'Pistol get from surface', 'Pistol run right', 'Pistol run left',
];

/**
 * The anim-type values the Shadow PC read at `[E+0x534]` at rest: 7, 149, 142 (MP71, 2026-11-12 afternoon, n = 1 each);
 * 7, 7, 141, 148, 152 and more 7s (MP2, the death-pose read, 2026-11-12 21:18-21:45Z, the play on top read with them);
 * 150, 145, 144, 142, 140, 7 (MP2, the second read, 2026-11-13 00:37-00:45Z, the killing hit read after it).
 */
const SEEN_TYPES = [7, 149, 142, 141, 148, 152, 150, 145, 144, 140] as const;
/** Each seen value's type name on this numbering (research 421 sections 6 and 11). */
const SEEN_NAMES: Readonly<Record<number, string>> = {
  7: 'Die', 149: 'Death stand larm01', 142: 'Death crouch chest02', 141: 'Death crouch chest01',
  148: 'Death prone chest01', 152: 'Death stand chest03', 150: 'Death stand rarm01', 145: 'Death stand head02',
  144: 'Death stand head01', 140: 'Death crouch back01',
};

type V3 = [number, number, number];
type Q4 = [number, number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const deg = (r: number): number => (r * 180) / Math.PI;
const FRONT: V3 = [0, 0, -1], UP: V3 = [0, 1, 0];

/** A part's world position and its local axis `k` (0 x, 1 y, 2 z) in the body frame (row-major, row vectors). */
const posOf = (sk: Skeleton, name: string): V3 => { const w = sk.world[sk.indexOf(name)]!; return [w[12]!, w[13]!, w[14]!]; };
const axisOf = (sk: Skeleton, i: number, k: number): V3 => { const w = sk.world[i]!; return unit([w[4 * k]!, w[4 * k + 1]!, w[4 * k + 2]!]); };

/** The local axis (and its sign) of a part that lies nearest `want` in the bind pose. */
function bindAxis(sk: Skeleton, name: string, want: V3): { k: number; s: number; fit: number } {
  sk.resetToBind();
  const i = sk.indexOf(name);
  let best = { k: 0, s: 1, fit: -2 };
  for (let k = 0; k < 3; k++) for (const s of [1, -1]) {
    const a = axisOf(sk, i, k), fit = s * dot(a, want);
    if (fit > best.fit) best = { k, s, fit };
  }
  return best;
}

/** The torso's front: (lbicep - rbicep) x (neck - spinelo), the body's -z in the bind. */
const torsoFront = (sk: Skeleton): V3 => unit(cross(sub(posOf(sk, 'lbicep'), posOf(sk, 'rbicep')), sub(posOf(sk, 'neck'), posOf(sk, 'spinelo'))));

/** What a posed skeleton shows, body frame. Elevations in degrees: +90 straight up, -90 straight down. */
interface Seen {
  /** The torso's front's elevation: positive face up, negative face down. */
  chest: number;
  /** `spinehi`'s bind-front axis's elevation (the same question by the bone's own axes). */
  spinehi: number;
  /** The root's position (body frame) and the hips' height. */
  root: V3; hipsY: number;
  /** The pelvis (`hips`): its head-ward axis's heading (0 ahead, +90 to the left, 180 behind) and elevation; its front's elevation. */
  yaw: number; pitch: number; roll: number;
  /** Each part's world rotation (rows), to compare two poses. */
  rows: Float32Array[];
}

function seen(sk: Skeleton, axes: { spinehi: { k: number; s: number }; hipsFront: { k: number; s: number }; hipsUp: { k: number; s: number } }): Seen {
  const front = torsoFront(sk);
  const sh = axisOf(sk, sk.indexOf('spinehi'), axes.spinehi.k).map((v) => v * axes.spinehi.s) as V3;
  const hi = sk.indexOf('hips');
  const hf = axisOf(sk, hi, axes.hipsFront.k).map((v) => v * axes.hipsFront.s) as V3;
  const hu = axisOf(sk, hi, axes.hipsUp.k).map((v) => v * axes.hipsUp.s) as V3;
  return {
    chest: deg(Math.asin(Math.max(-1, Math.min(1, front[1])))),
    spinehi: deg(Math.asin(Math.max(-1, Math.min(1, sh[1])))),
    root: posOf(sk, 'skel_root'), hipsY: posOf(sk, 'hips')[1],
    yaw: deg(Math.atan2(-hu[0], -hu[2])), pitch: deg(Math.asin(Math.max(-1, Math.min(1, hu[1])))),
    roll: deg(Math.asin(Math.max(-1, Math.min(1, hf[1])))),
    rows: sk.world.map((w) => Float32Array.from(w)),
  };
}

/** The largest angle (degrees) between two poses' world rotations, over the 25 parts under the root. */
function worstTurn(a: Seen, b: Seen, sk: Skeleton): number {
  let worst = 0;
  sk.parts.forEach((p, i) => {
    if (p.name === 'body') return;
    const x = a.rows[i]!, y = b.rows[i]!;
    let tr = 0;
    for (let r = 0; r < 3; r++) tr += dot(unit([x[4 * r]!, x[4 * r + 1]!, x[4 * r + 2]!]), unit([y[4 * r]!, y[4 * r + 1]!, y[4 * r + 2]!]));
    worst = Math.max(worst, deg(Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)))));
  });
  return worst;
}

/** The clip's own last distinct key, n - 1, every track as it is (the root's x and z kept). */
function clipEnd(sk: Skeleton, clip: MotionClip): void {
  clipKey(sk, clip, clip.frameCount - 1);
}

/** The clip's own key `k`, every track as it is (the root's x and z kept). */
function clipKey(sk: Skeleton, clip: MotionClip, k: number, turn?: (part: string, q: Q4, p: MotionClip['parts'][number]) => Q4): void {
  sk.resetToBind();
  for (const p of clip.parts) {
    const i = sk.indexOf(p.name);
    if (i < 0) continue;
    const t = p.translations.length === 3 ? p.translations : p.translations.subarray(3 * k, 3 * k + 3);
    const q = p.rotations.length === 4 ? p.rotations : p.rotations.subarray(4 * k, 4 * k + 4);
    const own: Q4 = [q[0]!, q[1]!, q[2]!, q[3]!];
    sk.setLocal(i, partMatrix(turn ? turn(p.name, own, p) : own, [t[0]!, t[1]!, t[2]!]));
  }
  sk.update();
}

const REST: MoverSnapshot = {
  vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand',
  ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null,
};

/** The skel_root track's travel, key n - 1 less key 0 (body frame), or zero for a constant track. */
function travelOf(clip: MotionClip): V3 {
  const r = clip.parts.find((p) => p.name === 'skel_root');
  if (!r || r.translations.length === 3) return [0, 0, 0];
  const k = 3 * (clip.frameCount - 1), T = r.translations;
  return [T[k]! - T[0]!, T[k + 1]! - T[1]!, T[k + 2]! - T[2]!];
}

const r1 = (v: number): number => Math.round(v * 10) / 10;
const r0 = (v: number): number => Math.round(v);
const way = (el: number): string => (el > 30 ? 'UP' : el < -30 ? 'DOWN' : 'SIDE');

/** One clip on one body: the clip's own end and the port's drawn end. */
interface Row { clip: string; model: string; own: Seen; port: Seen; turn: number; frame: number; frames: number }

/**
 * The pins (research 421's table): per clip, the torso front's elevation at the clip's own last key on the SEAL and
 * on al_gman01, and the root's travel (forward, left, down) and the root's height at that key. Filled from the first
 * measuring run; a change to the reader, the skeletons or the port's posing shows here.
 */
const PINNED: Readonly<Record<string, { seal: number; gman: number; travel: V3; height: number }>> = {
  death_buddy_crouch01: { seal: -70, gman: -70, travel: [11.8, 1.7, 6.4], height: 2.3 },
  death_buddy_prone01: { seal: 89, gman: 89, travel: [-0.2, 3.6, 0.8], height: 1.7 },
  death_buddy_stand01: { seal: -24, gman: -24, travel: [-4.1, 6.5, 7.9], height: 3.1 },
  death_buddy_stand02: { seal: 80, gman: 80, travel: [-6.8, 0.9, 8.2], height: 0.7 },
  death_buddy_stand03: { seal: -41, gman: -41, travel: [4.8, 13.4, 9.1], height: 2.3 },
  death_crouch_back01: { seal: -75, gman: -75, travel: [11.1, -2.8, 3.4], height: 2.1 },
  death_crouch_chest01: { seal: 87, gman: 87, travel: [-11.6, -2.1, 4.9], height: 0.9 },
  death_crouch_chest02: { seal: 83, gman: 83, travel: [1, 9.4, 4], height: 1.2 },
  death_crouch_head01: { seal: 85, gman: 85, travel: [-11.5, -1.8, 5], height: 1.2 },
  death_prone_chest01: { seal: 87, gman: 87, travel: [-0.8, 4.6, 1.1], height: 1.5 },
  death_stand_chest01: { seal: 80, gman: 80, travel: [18.6, 4.8, 10], height: 1.5 },
  death_stand_chest02: { seal: 76, gman: 76, travel: [12.7, 3.2, 9.8], height: 0.9 },
  death_stand_chest03: { seal: 86, gman: 86, travel: [-14.2, -0.6, 9.7], height: 1.5 },
  death_stand_groin01: { seal: -84, gman: -84, travel: [29.3, 0, 8.9], height: 1.6 },
  death_stand_groin02: { seal: -87, gman: -87, travel: [36.8, 0.5, 9.7], height: 1.7 },
  death_stand_head01: { seal: 87, gman: 87, travel: [-12.8, -1.3, 10.5], height: 1.1 },
  death_stand_head02: { seal: -78, gman: -78, travel: [14.7, 0.5, 9.5], height: 1.6 },
  death_stand_head03: { seal: -76, gman: -76, travel: [14.4, -0.4, 9.5], height: 1.7 },
  death_stand_head04: { seal: 85, gman: 85, travel: [17.5, 3.9, 9.6], height: 1.6 },
  death_stand_larm01: { seal: 85, gman: 85, travel: [-10.5, -1.7, 9.8], height: 1.4 },
  death_stand_larm02: { seal: -77, gman: -77, travel: [2, 12.7, 9.6], height: 1.2 },
  death_stand_rarm01: { seal: -81, gman: -81, travel: [-3.1, -7.8, 9.5], height: 1.9 },
  seal_landforward01: { seal: -83, gman: -83, travel: [0.7, -0.1, 0.4], height: 1.7 },
  seal_landbackwards01: { seal: 82, gman: 82, travel: [-4.6, 0.2, 2.8], height: 1 },
};

describe.skipIf(!HAVE)(`LATER 967: the death clips' last poses, the clip's own and the port's drawn${HAVE ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const packNames = HAVE ? Zar.parse(PACK!).root.children.map((k) => k.name) : [];
  const deaths = packNames.filter((n) => n.startsWith('death')).sort();
  const names = [...deaths, ...LANDINGS];
  const clips = HAVE ? clipsFromPack(PACK!, names) : [];
  const table = HAVE ? motionTableFromArchive(READERC!) : null;
  const skeletons = HAVE ? simSkeletonsFromBytes(MP2!, READERC!, PACK!) : { seal: [], terrorist: [], escortees: [] };
  const bodies = [skeletons.seal[0], skeletons.terrorist[0]].filter((b): b is SimSkeleton => !!b);
  const rows: Row[] = [];

  const measure = (body: SimSkeleton, clip: MotionClip): Row => {
    const sk = body.skeleton;
    const axes = { spinehi: bindAxis(sk, 'spinehi', FRONT), hipsFront: bindAxis(sk, 'hips', FRONT), hipsUp: bindAxis(sk, 'hips', UP) };
    clipEnd(sk, clip);
    const own = seen(sk, axes);
    // The port: the page's animator fed the death's traversal pose, as `remotePlayers` / `walk.ts` do, to the end.
    sk.resetToBind();
    const anim = new Animator(sk, clips, table);
    const playback = table?.get(clip.name)?.playback ?? clip.frameCount / 30;
    const end = oneShotSeconds(playback, clip.frameCount), dt = 1 / 30, playClips = { clips, table: [...table!] };
    for (let t = 0; t <= end + 1; t += dt) anim.step(dt, { ...REST, traversal: deathPose(clip.name, t, playClips) });
    const port = seen(sk, axes);
    const frame = anim.stats().frame;
    return { clip: clip.name, model: body.model, own, port, turn: worstTurn(own, port, sk), frame, frames: clip.frameCount };
  };

  it('reads the death clips off the pack through the port\'s reader, and both skeletons', () => {
    console.log(`REPORT DP clips: ${deaths.length} in MOTION_P.ZAR named death* (${deaths.join(', ')})`);
    const tableDeaths = table ? [...table.keys()].filter((n) => n.startsWith('death')).sort() : [];
    console.log(`REPORT DP motion.rdr rows named death*: ${tableDeaths.length}; in the pack, not in motion.rdr: ${deaths.filter((d) => !tableDeaths.includes(d)).join(', ') || 'none'}`);
    console.log(`REPORT DP the port's DEATH_CLIPS (${DEATH_CLIPS.length}): every one in the pack: ${DEATH_CLIPS.every((c) => deaths.includes(c))}; in the pack, none of the port's lists: ${deaths.filter((d) => !DEATH_CLIPS.includes(d)).join(', ') || 'none'}`);
    console.log(`REPORT DP bodies: ${bodies.map((b) => b.model).join(', ')}`);
    expect(deaths.length).toBe(22);
    expect(clips.length).toBe(names.length);
    expect(bodies.map((b) => b.model)).toEqual(['seal_A_scuba', 'al_gman01']);
    for (const c of DEATH_CLIPS) expect(deaths, c).toContain(c);
  });

  it('the torso front and spinehi\'s front axis are the body\'s -z in the bind (the measure is sound)', () => {
    for (const body of bodies) {
      const sk = body.skeleton;
      sk.resetToBind();
      const f = torsoFront(sk), a = bindAxis(sk, 'spinehi', FRONT), h = bindAxis(sk, 'hips', FRONT), u = bindAxis(sk, 'hips', UP);
      console.log(`REPORT DP bind ${body.model}: torso front (${f.map(r1).join(', ')}); spinehi front = local axis ${'xyz'[a.k]} x ${a.s} (fit ${a.fit.toFixed(3)}); hips front ${'xyz'[h.k]} x ${h.s} (${h.fit.toFixed(3)}), hips up ${'xyz'[u.k]} x ${u.s} (${u.fit.toFixed(3)})`);
      // The front is -z by the body itself, not by the port's convention alone: the toes stand ahead of the ankles, and
      // the run's root travels toward -z (the mover's forward).
      const toes = [sub(posOf(sk, 'rtoe'), posOf(sk, 'rfoot')), sub(posOf(sk, 'ltoe'), posOf(sk, 'lfoot'))];
      const run = clipsFromPack(PACK!, ['seal_run'])[0]!, rt = travelOf(run);
      console.log(`REPORT DP facing ${body.model}: toe - ankle z ${toes.map((t) => r1(t[2])).join(', ')}; lthigh x ${r1(posOf(sk, 'lthigh')[0])}, rthigh x ${r1(posOf(sk, 'rthigh')[0])}; seal_run root travel z ${r1(rt[2])} over ${run.frameCount} keys`);
      for (const t of toes) expect(t[2]).toBeLessThan(0);
      expect(rt[2]).toBeLessThan(0);
      expect(dot(f, FRONT)).toBeGreaterThan(0.9);
      expect(a.fit).toBeGreaterThan(0.9);
      expect(h.fit).toBeGreaterThan(0.8);
      expect(u.fit).toBeGreaterThan(0.8);
    }
  });

  it('each clip on each body: the clip\'s own last key against the port\'s drawn end', () => {
    for (const body of bodies) for (const clip of clips) rows.push(measure(body, clip));
    console.log('REPORT DP columns: clip | model | OWN chest el (way) / spinehi el | root (x, y, z) | hips y | yaw pitch roll || PORT chest el (way) | root (x, y, z) | worst bone turn | frame/n-1');
    for (const r of rows) {
      const o = r.own, p = r.port;
      console.log(`REPORT DP ${r.clip} | ${r.model} | OWN ${r0(o.chest)} (${way(o.chest)}) / ${r0(o.spinehi)} | (${o.root.map(r1).join(', ')}) | ${r1(o.hipsY)} | ${r0(o.yaw)} ${r0(o.pitch)} ${r0(o.roll)} || PORT ${r0(p.chest)} (${way(p.chest)}) | (${p.root.map(r1).join(', ')}) | ${r.turn.toFixed(3)} | ${r1(r.frame)}/${r.frames - 1}`);
    }
    for (const clip of clips) {
      const t = travelOf(clip), entry = table?.get(clip.name);
      // The root's own rotation over every key: the lying is the hips' and the spine's, not the root's (research 217 s7,
      // `rootTilt.ts`'s ROOT_TILT_UNWRITTEN_READING: every clip's skel_root rotation is the identity but three).
      const R = clip.parts.find((p) => p.name === 'skel_root')!.rotations;
      let rootTurn = 0;
      for (let k = 0; k < R.length; k += 4) rootTurn = Math.max(rootTurn, deg(2 * Math.acos(Math.min(1, Math.abs(R[k + 3]!)))));
      console.log(`REPORT DP travel ${clip.name}: forward ${r1(-t[2])} left ${r1(-t[0])} down ${r1(-t[1])} (raw d ${t.map(r1).join(', ')}); keys ${clip.frameCount}; playback ${entry?.playback ?? 'none'}; one-shot end ${entry?.playback ? oneShotSeconds(entry.playback, clip.frameCount).toFixed(3) : '-'} s; root rotation at most ${rootTurn.toFixed(2)} deg`);
      expect(rootTurn, `${clip.name}: skel_root turns`).toBeLessThan(0.5);
    }
    // The clip's own path, key by key on the SEAL: the chest's elevation and the root's forward travel, and the key the
    // one-shot clock reaches 2.5 s after the death (the Shadow PC's pictures were taken then).
    const seal = bodies[0]!, sk = seal.skeleton;
    const axes = { spinehi: bindAxis(sk, 'spinehi', FRONT), hipsFront: bindAxis(sk, 'hips', FRONT), hipsUp: bindAxis(sk, 'hips', UP) };
    for (const clip of clips) {
      const n = clip.frameCount, chest: number[] = [], fwd: number[] = [];
      const r = clip.parts.find((p) => p.name === 'skel_root')!, T = r.translations;
      for (let k = 0; k < n; k++) {
        clipKey(sk, clip, k);
        chest.push(r0(seen(sk, axes).chest));
        fwd.push(T.length === 3 ? 0 : r0(T[2]! - T[3 * k + 2]!));
      }
      const playback = table?.get(clip.name)?.playback ?? n / 30, end = oneShotSeconds(playback, n);
      const at = Math.min(n - 1, (2.5 / end) * (n - 1));
      console.log(`REPORT DP path ${clip.name}: chest by key [${chest.join(' ')}]; forward by key [${fwd.join(' ')}]; at 2.5 s key ${r1(at)} of ${n - 1}`);
    }
    for (const r of rows) {
      // The port draws the clip's last key: the same rotations on every part, the root's x and z taken away.
      expect(r.frame, `${r.clip} ${r.model}: the port's key`).toBeCloseTo(r.frames - 1, 6);
      expect(r.turn, `${r.clip} ${r.model}: the port's bone turns`).toBeLessThan(0.05);
      // the chest's normal reads bone positions: the port lays the bind's translations on all but six parts (SAMPLED_TRANSLATIONS)
      expect(Math.abs(r.port.chest - r.own.chest), `${r.clip} ${r.model}: chest`).toBeLessThan(1);
      expect(r.port.root[0], `${r.clip} ${r.model}: the port's root x`).toBeCloseTo(0, 6);
      expect(r.port.root[2], `${r.clip} ${r.model}: the port's root z`).toBeCloseTo(0, 6);
      expect(r.port.root[1], `${r.clip} ${r.model}: the port's root height`).toBeCloseTo(r.own.root[1], 3);
    }
  });

  it('the pins: each clip\'s own end, chest and travel (research 421\'s table)', () => {
    const measured: Record<string, { seal: number; gman: number; travel: V3; height: number }> = {};
    for (const clip of clips) {
      const of = (model: string): Row => rows.find((r) => r.clip === clip.name && r.model === model)!;
      const t = travelOf(clip);
      measured[clip.name] = { seal: r0(of('seal_A_scuba').own.chest), gman: r0(of('al_gman01').own.chest), travel: [r1(-t[2]), r1(-t[0]), r1(-t[1])], height: r1(of('seal_A_scuba').own.root[1]) };
    }
    console.log(`REPORT DP measured ${JSON.stringify(measured)}`);
    expect(Object.keys(measured).sort()).toEqual(Object.keys(PINNED).sort());
    for (const [name, pin] of Object.entries(PINNED)) {
      const m = measured[name]!;
      expect(Math.abs(m.seal - pin.seal), `${name} seal chest`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.gman - pin.gman), `${name} gman chest`).toBeLessThanOrEqual(1);
      for (let k = 0; k < 3; k++) expect(m.travel[k], `${name} travel ${k}`).toBeCloseTo(pin.travel[k]!, 1);
      expect(m.height, `${name} height`).toBeCloseTo(pin.height, 1);
    }
  });

  it("the port's pick for each case the Shadow PC looked at (deathClip, every draw of its list)", () => {
    const draws = (cause: 'bullet' | 'blast' | 'fall', part: number, stance: Stance): (string | null)[] => {
      const out: (string | null)[] = [];
      for (let i = 0; i < 16; i++) { const c = deathClip(cause, part, stance, () => (i + 0.5) / 16); if (!out.includes(c)) out.push(c); }
      return out;
    };
    const cases: [string, 'bullet' | 'blast' | 'fall', number, Stance][] = [
      ['standing, chest from the front (BODY)', 'bullet', PART.BODY, 'stand'],
      ['standing, the hip box (hips -> BODY)', 'bullet', PART.BODY, 'stand'],
      ['crouched, chest (BODY)', 'bullet', PART.BODY, 'crouch'],
      ['standing, head', 'bullet', PART.HEAD, 'stand'],
      ['crouched, head', 'bullet', PART.HEAD, 'crouch'],
      ['prone, body', 'bullet', PART.BODY, 'prone'],
      ['prone, head', 'bullet', PART.HEAD, 'prone'],
      ['standing, a limb (RARM)', 'bullet', PART.RARM, 'stand'],
      ['standing, grenade', 'blast', PART.BODY, 'stand'],
      ['crouched, grenade', 'blast', PART.BODY, 'crouch'],
      ['prone, grenade', 'blast', PART.BODY, 'prone'],
      ['a fall', 'fall', PART.BODY, 'stand'],
    ];
    const own = (c: string | null, model: string): string => {
      if (!c) return 'no clip';
      const r = rows.find((x) => x.clip === c && x.model === model);
      return r ? `${c} ${way(r.own.chest)} ${r0(r.own.chest)}` : `${c} (not measured)`;
    };
    for (const [label, cause, part, stance] of cases) {
      const list = draws(cause, part, stance);
      const down = list.filter((c) => { const r = rows.find((x) => x.clip === c && x.model === 'seal_A_scuba'); return r && way(r.own.chest) === 'DOWN'; }).length;
      console.log(`REPORT DP pick ${label}: ${list.map((c) => own(c, 'seal_A_scuba')).join('; ')} -- face down ${down} of ${list.length}`);
    }
    expect(draws('bullet', PART.BODY, 'stand')).toHaveLength(8);
    expect(draws('blast', PART.BODY, 'stand')).toEqual([null]);
  });

  it('diagnostics, not readings: what would lay the seen clips face down (the hips or every part turned the other way, the hips held)', () => {
    // Research 421 section 7: the original was seen face down where the clips' own ends are face up. Each line is a
    // hypothesis's end pose on the SEAL, for the note to weigh; nothing here is the original's code.
    const sk = bodies[0]!.skeleton;
    const axes = { spinehi: bindAxis(sk, 'spinehi', FRONT), hipsFront: bindAxis(sk, 'hips', FRONT), hipsUp: bindAxis(sk, 'hips', UP) };
    const conj = (q: Q4): Q4 => [-q[0], -q[1], -q[2], q[3]];
    const variants: [string, ((part: string, q: Q4, p: MotionClip['parts'][number]) => Q4) | undefined][] = [
      ['as read', undefined],
      ['hips conjugated', (n, q) => (n === 'hips' ? conj(q) : q)],
      ['every part conjugated', (_n, q) => conj(q)],
      ['hips held at key 0', (n, q, p) => (n === 'hips' ? [p.rotations[0]!, p.rotations[1]!, p.rotations[2]!, p.rotations[3]!] : q)],
    ];
    for (const clip of clips) {
      const parts = variants.map(([label, turn]) => {
        clipKey(sk, clip, clip.frameCount - 1, turn);
        const s = seen(sk, axes);
        return `${label}: chest ${r0(s.chest)} (${way(s.chest)}) head-ward ${r0(s.yaw)}`;
      });
      const h = clip.parts.find((p) => p.name === 'hips')!.rotations, k = 4 * (clip.frameCount - 1);
      const q0: Q4 = [h[0]!, h[1]!, h[2]!, h[3]!], q1: Q4 = h.length === 4 ? q0 : [h[k]!, h[k + 1]!, h[k + 2]!, h[k + 3]!];
      console.log(`REPORT DP diag ${clip.name}: ${parts.join('; ')}; hips key 0 (${q0.map((v) => v.toFixed(2)).join(', ')}) key n-1 (${q1.map((v) => v.toFixed(2)).join(', ')})`);
    }
    expect(clips.length).toBeGreaterThan(0);
  });

  it("the original's anim-type numbering: every state word the Shadow PC read, named (ELF 0x661060 + animset.rdr)", () => {
    const zar = Zar.parse(READERC!);
    const flat = (n: RdrNode): RdrNode[] => (Array.isArray(n) && n.length === 1 && Array.isArray(n[0]) ? flat(n[0]) : n as RdrNode[]);
    const sets = flat(parseRdr(zar.data(zar.find('animset.rdr')!)));
    // FUN_005e30f0 (D:L495452-495487): the static names 0..136; FUN_005e3ff0 (D:L496194-496238): every set in the file's
    // order, every `anim_set_anims` row in order, a `type_name` not yet known takes the next id (`DAT_0066b800`).
    const ids = new Map<string, number>(STATIC_TYPES.map((n, i) => [n, i]));
    let next = STATIC_TYPES.length;
    for (const set of sets) for (const a of (rdrGet(set, 'anim_set_anims') ?? []) as RdrNode[]) {
      const type = rdrGet(a, 'type_name');
      if (typeof type === 'string' && !ids.has(type)) ids.set(type, next++);
    }
    const nameOf = new Map([...ids].map(([n, i]) => [i, n]));
    const byName = (n: string): RdrNode | undefined => sets.find((s) => rdrGet(s, 'anim_set_name') === n);
    const clipIn = (setName: string, type: string): string | null => {
      const set = byName(setName);
      if (!set) return null;
      for (const a of (rdrGet(set, 'anim_set_anims') ?? []) as RdrNode[]) if (rdrGet(a, 'type_name') === type) return String(rdrGet(a, 'anim_name'));
      for (const inc of (rdrGet(set, 'include') ?? []) as string[]) { const c = clipIn(inc, type); if (c) return c; }
      return null;
    };
    console.log(`REPORT DP types: ${STATIC_TYPES.length} static, ${next - STATIC_TYPES.length} from animset.rdr (${next} in all); Open door ${ids.get('Open door')}, Kick open door ${ids.get('Kick open door')}`);
    for (const v of SEEN_TYPES) {
      const n = nameOf.get(v);
      console.log(`REPORT DP [E+0x534] = ${v}: ${n ?? 'no type'} -> Seal anim set: ${n ? clipIn('Seal anim set', n) : '-'}`);
    }
    for (const set of sets) for (const a of (rdrGet(set, 'anim_set_anims') ?? []) as RdrNode[]) {
      const type = rdrGet(a, 'type_name'), clip = rdrGet(a, 'anim_name');
      if (typeof clip === 'string' && (clip.startsWith('death') || LANDINGS.includes(clip as typeof LANDINGS[number])) && typeof type === 'string') {
        console.log(`REPORT DP row ${String(rdrGet(set, 'anim_set_name'))}: ${type} (${ids.get(type)}) -> ${clip}`);
      }
    }
    // The numbering reproduces the doors' two types (research 92: 63 `Open door`, the static table's; 284 `Kick open door`).
    expect(ids.get('Open door')).toBe(OPEN_DOOR_TYPE);
    expect(ids.get('Kick open door')).toBe(KICK_DOOR_TYPE_READING);
    for (const v of SEEN_TYPES) expect(nameOf.get(v), `[E+0x534] = ${v}`).toBe(SEEN_NAMES[v]);
  });
});
