// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { Animator, PLAY_CLIPS, type MoverSnapshot } from '../src/animator';
import { heldSkeleton, muzzleOf, muzzlePoint } from '../src/heldItem';
import { loadMap } from '../src/loadMap';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { bodySkeleton } from '../src/play';
import { FIRE_VERSIONS, WEAPON_CLIPS, WeaponPose } from '../src/weaponPose';

/**
 * A MEASUREMENT, not a pin (LATER 1141): the port's posed `firepoint` for a crouched SEAL holding the 552 SD (item 67),
 * idle (raise 0: the crouch idle alone) and firing unscoped (raise 1: the crouch idle's Fire version `seal_fp_crouch`,
 * `FIRE_VERSIONS`, folded in at the full raise weight -- `./weaponPose`). The body is built as `Play.setBody` builds it
 * (`heldSkeleton(bodySkeleton(body))`, play.ts), the animator and the Fire layer as fireSubNode.disc.test.ts's `Body`,
 * the muzzle as `Play.muzzle` poses it (`muzzleOf`, `muzzlePoint`: heldItem.ts). Body frame: x right, y up, z behind,
 * from the feet (the model matrix is the identity, play.ts `bodySkeleton`); the forward reach is -z. The M4 (item 54)
 * is measured beside it as a check on research 217 s1.3's crouch value (1.341, 7.090, -11.438).
 * Asserts only finiteness; writes JSON to env P1_OUT when set. Skipped -- and said so -- without the dev disc.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const NEEDS = ['RUN/MP2.ZDB', 'RUN/MOTION_P.ZAR', 'RUN/READERC.ZAR'];
const HAVE_DISC = DISC !== '' && NEEDS.every((p) => existsSync(join(DISC, p)));
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(join(DISC, p)));
const DT = 1 / 60;

const CROUCH_STILL: MoverSnapshot = {
  vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: true, landing: null, jumps: 0, stance: 'crouch',
  ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null, turnRate: 0, pitch: 0,
};

type V3 = [number, number, number];
const r3 = (v: readonly number[]): V3 => [+v[0]!.toFixed(3), +v[1]!.toFixed(3), +v[2]!.toFixed(3)];

describe.skipIf(!HAVE_DISC)(`LATER 1141: the port's crouched firepoint, idle and firing${HAVE_DISC ? '' : ' (no dev disc -- skipped)'}`, () => {
  it('poses the 552 SD (and the M4) on the crouched SEAL, raise 0 and raise 1, and reads the firepoint', async () => {
    const map = await loadMap(new FsAssetSource(DISC), 'RUN/MP2.ZDB');
    const body = map.body;
    if (!body) throw new Error('MP2 loaded no body');
    const clips = clipsFromPack(read('RUN/MOTION_P.ZAR'), [...new Set([...PLAY_CLIPS, ...WEAPON_CLIPS, ...Object.values(FIRE_VERSIONS)])]);
    const table = motionTableFromArchive(read('RUN/READERC.ZAR'));
    const items = map.arsenal?.table.arsenal.items;
    const out: Record<string, unknown> = { body: body.model, fireOfCrouch: FIRE_VERSIONS['seal_crouch'] };
    for (const id of [67, 54]) {
      const rec = items?.get(id) as { model?: string; name?: string } | undefined;
      const model = rec?.model ?? null;
      const weapon = model ? map.weapons?.[model] ?? Object.values(map.weapons ?? {}).find((w) => w.name.toLowerCase() === model.toLowerCase()) : undefined;
      const muzzle = weapon ? muzzlePoint(weapon.points) : null;
      const entry: Record<string, unknown> = { id, record: rec?.name ?? null, model, weaponFound: !!weapon, muzzleInModel: muzzle };
      out[`item${id}`] = entry;
      if (!muzzle) continue;
      for (const [label, raise, pitch] of [['idle', 0, 0], ['firing', 1, 0], ['firingUp20', 1, 20], ['firingDown20', 1, -20]] as const) {
        const sk = heldSkeleton(bodySkeleton(body));
        const anim = new Animator(sk, clips, table, { random: () => 0 });
        const pose = new WeaponPose(new Map(clips.map((c) => [c.name, c])), table);
        anim.setWeapon('rifle');
        pose.item = 'rifle';
        anim.addPoseLayer(pose.fireLayer);
        anim.addPoseLayer(pose.reloadLayer);
        const step = (): void => { pose.fireWeight = raise; pose.step(DT); anim.step(DT, { ...CROUCH_STILL, pitch, aimWeight: raise }); };
        for (let t = 0; t < 3; t += DT) step();
        const root = sk.indexOf('skel_root'), rifleNode = sk.indexOf('rifle');
        const samples: { clip: string; frame: number; fire: string | null; fp: V3; root: V3; hand: V3 }[] = [];
        for (let t = 0; t < 4; t += DT) {
          step();
          sk.update();
          const fp = muzzleOf(sk, muzzle, 'rifle')!;
          const w = sk.world[root]!, rw = sk.world[rifleNode]!;
          const hand: V3 = [rw[12]!, rw[13]!, rw[14]!];
          const st = anim.stats() as unknown as { clip: string; frame: number };
          samples.push({ clip: st.clip, frame: st.frame, fire: (pose.stats() as { fire?: string | null }).fire ?? null, fp: [fp[0], fp[1], fp[2]], root: [w[12]!, w[13]!, w[14]!], hand });
        }
        const first = samples.reduce((a, b) => (b.frame < a.frame ? b : a));
        const reach = samples.map((s) => -s.fp[2]);
        entry[label] = {
          raise, pitch, barrelElevationDeg: +((Math.atan2(first.fp[1] - first.hand[1], Math.hypot(first.fp[0] - first.hand[0], first.fp[2] - first.hand[2])) * 180) / Math.PI).toFixed(3),
          clip: first.clip, fireClip: first.fire, firstKeyFrame: +first.frame.toFixed(3),
          firepoint: r3(first.fp), forwardReach: +(-first.fp[2]).toFixed(3),
          root: r3(first.root), fromRoot: r3([first.fp[0] - first.root[0], first.fp[1] - first.root[1], first.fp[2] - first.root[2]]),
          reachRange: [+Math.min(...reach).toFixed(3), +Math.max(...reach).toFixed(3)],
          clipsSeen: [...new Set(samples.map((s) => s.clip))],
        };
        for (const v of first.fp) expect(Number.isFinite(v)).toBe(true);
      }
    }
    const json = JSON.stringify(out, null, 1);
    console.log(json);
    if (process.env.P1_OUT) writeFileSync(process.env.P1_OUT, json);
  }, 120_000);
});
