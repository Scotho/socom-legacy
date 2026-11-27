// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { Animator, PLAY_CLIPS, type AnimEvent, type MoverSnapshot } from '../src/animator';
import { heldSkeleton } from '../src/heldItem';
import { loadMap } from '../src/loadMap';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { bodySkeleton } from '../src/play';
import { WEAPON_CLIPS, WeaponPose } from '../src/weaponPose';

/**
 * LATER 1221 (product track: the animator's per-frame work, every body; NO pose or timing change): a digest of every
 * sampled pose (each part's local matrix, every frame) and every event the animator emits (its clip, kind, name and
 * frame) over a scripted run of MP2's SEAL -- standing, running at several facings, a stick snap, crouched, prone, a jump
 * and its landing, the fire layer raised and lowered, the pistol -- with and without the fire and reload layers. Pinned
 * at agent/next 10fa1e2639, before the change: a faster animator must give the same floats and the same events, bit for
 * bit. Disc-backed (MP2, MOTION_P.ZAR, READERC.ZAR); skipped -- and said so -- without the disc.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const NEEDS = ['RUN/MP2.ZDB', 'RUN/MOTION_P.ZAR', 'RUN/READERC.ZAR'];
const HAVE_DISC = DISC !== '' && NEEDS.every((p) => existsSync(join(DISC, p)));
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(join(DISC, p)));
const DT = 1 / 60;

const base = (o: Partial<MoverSnapshot>): MoverSnapshot => ({
  vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand',
  ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null, pitch: 0, aimWeight: 0, turnRate: 0, ...o,
});
const run = (yaw: number, fwd = 1, right = 0): MoverSnapshot => {
  const a = (yaw * Math.PI) / 180;
  return base({ vx: -65 * Math.sin(a) * fwd, vz: -65 * Math.cos(a) * fwd, yaw, ground: { state: 'stand', forward: fwd, right, cls: 1 }, aimWeight: 1 });
};
/** The script: [frames, mover, fire weight, item]. */
const SCRIPT: [number, MoverSnapshot, number, 'rifle' | 'pistol'][] = [
  [60, base({}), 0, 'rifle'],
  [90, run(0), 1, 'rifle'],
  [45, run(45, 1, 1), 1, 'rifle'],
  [30, run(45, 1, 0), 1, 'rifle'],                                   // the side let go: a stick snap
  [60, run(200, -1), 0.5, 'rifle'],
  [60, base({ crouched: true, stance: 'crouch', ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, aimWeight: 1, pitch: 20 }), 1, 'rifle'],
  [60, base({ crouched: true, stance: 'crouch', ground: { state: 'crouch', forward: 1, right: 0, cls: 1 }, vz: -30, aimWeight: 1 }), 1, 'pistol'],
  [60, base({ stance: 'prone', ground: { state: 'idle', forward: 0, right: 0, cls: -1 } }), 0, 'pistol'],
  [20, base({ airborne: true, vy: 40, jumps: 1 }), 0, 'rifle'],
  [40, base({ landing: 'soft', jumps: 1 }), 0, 'rifle'],
  [90, run(300), 1, 'rifle'],
];

const rig = HAVE_DISC ? await (async () => {
  const map = await loadMap(new FsAssetSource(DISC), 'RUN/MP2.ZDB');
  if (!map.body) throw new Error('MP2 loaded no body');
  const clips = clipsFromPack(read('RUN/MOTION_P.ZAR'), [...new Set([...PLAY_CLIPS, ...WEAPON_CLIPS])]);
  const table = motionTableFromArchive(read('RUN/READERC.ZAR'));
  return { body: map.body, clips, table };
})() : null;

function digest(layers: boolean): { hash: string; frames: number; events: number; world: string } {
  const { body, clips, table } = rig!;
  const skel = heldSkeleton(bodySkeleton(body));
  const anim = new Animator(skel, clips, table, { random: () => 0.25 });
  const weapon = layers ? new WeaponPose(new Map(clips.map((c) => [c.name, c])), table) : null;
  if (weapon) { anim.addPoseLayer(weapon.fireLayer); anim.addPoseLayer(weapon.reloadLayer); }
  const h = createHash('sha256'), hw = createHash('sha256');
  let frame = 0, events = 0;
  anim.onEvent((e: AnimEvent) => { events++; h.update(`E${frame}:${JSON.stringify(e)}\n`); });
  for (const [frames, mover, fire, item] of SCRIPT) {
    anim.setWeapon(item);
    if (weapon) { weapon.item = item; weapon.fireWeight = fire; }
    for (let k = 0; k < frames; k++, frame++) {
      weapon?.step(DT);
      anim.step(DT, mover);
      for (const m of skel.local) h.update(new Uint8Array(m.buffer, m.byteOffset, m.byteLength));
      for (const m of skel.world) hw.update(new Uint8Array(m.buffer, m.byteOffset, m.byteLength));   // part 2: the palette after the step
    }
  }
  return { hash: h.digest('hex'), frames: frame, events, world: hw.digest('hex') };
}

describe.skipIf(!rig)(`LATER 1221: the animator's poses and events, bit for bit${rig ? '' : ' (no dev disc -- skipped)'}`, () => {
  it('without the layers', () => {
    const d = digest(false);
    expect(d.frames).toBe(615);
    expect({ hash: d.hash, frames: d.frames, events: d.events }).toEqual(PINNED.plain);
    expect(d.world, 'the palette after every step (LATER 1221 part 2)').toBe(PINNED_WORLD.plain);
  });
  it('with the fire layer (and the reload layer added: no reload is started, so its clip paths are not run)', () => {
    const d = digest(true);
    expect({ hash: d.hash, frames: d.frames, events: d.events }).toEqual(PINNED.layered);
    expect(d.world, 'the palette after every step (LATER 1221 part 2)').toBe(PINNED_WORLD.layered);
  });
});

/** At agent/next 10fa1e2639 (before LATER 1221's change). */
const PINNED = {
  plain: { hash: '7a5cb6cef0e869530268b37faed279c06f58d0d00a183e122c24b18823622e7c', frames: 615, events: 32 },
  layered: { hash: 'e63e49cbbf2b8ba321da4f1b1a99c700f9f1db8949cd78032e68d2aad6a3d034', frames: 615, events: 32 },
};
/** LATER 1221 part 2: the world palette after each step, pinned at 6833425aea (before the lazy compose). */
const PINNED_WORLD = { plain: '84e98040d3d9d5d3920335fceebd38de9b9d233a4837afd09b2fad6f0369b286', layered: 'c956c297a0d73cad650409cc3112e80aa49520064de26f9513767db1678717ff' };
