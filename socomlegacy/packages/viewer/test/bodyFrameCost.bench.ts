import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { bench, describe } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import type { Skeleton } from '@s2u/scene';
import { Animator, PLAY_CLIPS, type MoverSnapshot } from '../src/animator';
import { buildBody, type BodyView } from '../src/bodyView';
import { HELD_ITEM, PISTOL_ITEM, heldSkeleton } from '../src/heldItem';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { loadMap } from '../src/loadMap';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { bodySkeleton } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { WEAPON_CLIPS, WeaponPose } from '../src/weaponPose';

/**
 * LATER 881 / 884: what another player's body costs the CPU each frame, in Node (no browser, no GPU). A product-track
 * instrument with no original: it measures the port's own code and changes nothing the game or the page does. MP2's
 * SEAL (`loadMap`, as `body.test.ts`), `MOTION_P.ZAR`'s clips, `READERC.ZAR`'s motion table; N = 1, 4, 8, 16 bodies
 * running (stick forward, 65 a second, each its own facing), 1/60 s frames:
 *  (a) `Animator.step` alone -- the play's pick, `pose` and the aim (`pose` is private; `step` is how `Play` calls it);
 *  (b) the same with the two pose layers `Play` adds (`WeaponPose`'s Fire layer at full raise and its reload layer, the
 *      moving reload restarted whenever it ends) -- both at once, an upper bound on a firing or reloading body;
 *  (c) `BodyView.setPose` (bodyView.ts:276-281, one `decompose` a bone) on a posed skeleton; (c2) the same plus the
 *      body group's `updateMatrixWorld(true)`, the bone walk three's render makes (three's `skeleton.update()` bone
 *      palette, done inside the renderer, is not measured);
 *  (d) `RemotePlayers.frame` for N bodies fed moving `BodyState`s (no kit hung: `kitOf` null, as `remoteWake.test.ts`):
 *      the flinch and tilt probes, the hands and binoculars, `Play.frame` (raise, layers, step, setPose); (d2) every body's
 *      trigger and aim held; (d3) (d) then `applyZoneGate` hiding every body -- the cost a region-gated body still pays.
 * Not measured: the client's snapshot interpolation (`net/client`, upstream of `frame`; the states here are given),
 * the GPU's skinning and draw, the renderer's own per-object work, garbage collection pauses beyond the timed loop.
 *
 * It prints one `BODY_FRAME_COST` line: microseconds per body per frame for each case and N (120 warm frames, then 600
 * timed), and `growth16over1` -- the per-body cost at 16 over that at 1 (1.0: linear in N; above 1, worse than linear).
 * Then vitest's own table: one frame of N bodies per iteration. No time is asserted.
 * Run (from socomlegacy/packages/viewer, SOCOM_DISC or SOCOM_PC_ROOT set): `npx vitest bench --run test/bodyFrameCost.bench.ts`.
 * Without the disc it benches nothing and says so.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const NEEDS = ['RUN/MP2.ZDB', 'RUN/MOTION_P.ZAR', 'RUN/READERC.ZAR'];
const HAVE_DISC = DISC !== '' && NEEDS.every((p) => existsSync(join(DISC, p)));
const SKIP = HAVE_DISC ? '' : ` -- SKIPPED: no disc (SOCOM_DISC or SOCOM_PC_ROOT/game/disc, needs ${NEEDS.join(', ')})`;
if (!HAVE_DISC) console.info(`BODY_FRAME_COST${SKIP}`);

const COUNTS = [1, 4, 8, 16] as const;
const DT = 1 / 60;
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(join(DISC, p)));

const rig = HAVE_DISC ? await (async () => {
  const map = await loadMap(new FsAssetSource(DISC), 'RUN/MP2.ZDB');                   // loadMap.ts:456; body.test.ts:192
  const body = map.body;
  if (!body) throw new Error('MP2 loaded no body');
  const clips = clipsFromPack(read('RUN/MOTION_P.ZAR'), [...PLAY_CLIPS, ...WEAPON_CLIPS]);   // motionTable.ts:194
  const table = motionTableFromArchive(read('RUN/READERC.ZAR'));                        // motionTable.ts:183
  const at: [number, number, number] = map.slots[0]?.position ?? body.at?.position ?? [0, 0, 0];   // a spawn slot, else slot A
  return { map, body, clips, table, at };
})() : null;

/** Running forward along the facing (`MoverSnapshot`, animator.ts:67; forward is (-sin, -cos) of the yaw). */
function running(i: number): MoverSnapshot {
  const yaw = (i * 23) % 360, a = (yaw * Math.PI) / 180;
  return {
    vx: -65 * Math.sin(a), vz: -65 * Math.cos(a), vy: 0, yaw, airborne: false, crouched: false, landing: null, jumps: 0,
    stance: 'stand', ground: { state: 'stand', forward: 1, right: 0, cls: 1 }, action: null, pitch: 0, aimWeight: 1, turnRate: 0,
  };
}

interface Posed { anim: Animator; skel: Skeleton; view: BodyView; weapon: WeaponPose | null; mover: MoverSnapshot }

/** N bodies built as `Play.setBody` / `Play.rebuild` build one (play.ts:275-290, 830-845). */
function bodies(n: number, layers: boolean): Posed[] {
  const { map, body, clips, table } = rig!;
  return Array.from({ length: n }, (_, i) => {
    const skel = heldSkeleton(bodySkeleton(body));                                       // heldItem.ts:58, play.ts:64
    const view = buildBody(body, map, DEFAULT_LIGHTING);                                 // bodyView.ts:103
    if (skel.indexOf(HELD_ITEM.name) >= 0) view.addProp(HELD_ITEM.name, HELD_ITEM.parent);       // play.ts:279
    if (skel.indexOf(PISTOL_ITEM.name) >= 0) view.addProp(PISTOL_ITEM.name, PISTOL_ITEM.parent); // play.ts:282
    const anim = new Animator(skel, clips, table, { random: () => 0.25 });              // animator.ts:805
    let weapon: WeaponPose | null = null;
    if (layers) {
      weapon = new WeaponPose(new Map(clips.map((c) => [c.name, c])), table);           // weaponPose.ts:207; play.ts:838
      anim.addPoseLayer(weapon.fireLayer);                                               // animator.ts:838; play.ts:842
      anim.addPoseLayer(weapon.reloadLayer);
      weapon.fireWeight = 1;                                                             // weaponPose.ts:172: fully raised
    }
    return { anim, skel, view, weapon, mover: running(i) };
  });
}

/** Another player's state as the room sends it (`BodyState`, net/protocol.ts:469; `remoteZoneGate.test.ts`'s fields). */
function remoteBody(id: number, k: number, trigger: boolean): BodyState {
  const { at } = rig!, mover = running(id), a = (mover.yaw * Math.PI) / 180, s = 40 * Math.sin((2 * Math.PI * k) / 120 + id);
  return {
    id, feet: [at[0] + 8 * id - Math.sin(a) * s, at[1], at[2] - Math.cos(a) * s], yaw: mover.yaw, pitch: 0, vx: mover.vx, vy: 0, vz: mover.vz,
    flags: BodyFlag.Alive | (trigger ? BodyFlag.Aiming | BodyFlag.Trigger : 0), stance: 0, landing: 0, jumps: 0,
    ground: 1, groundForward: 1, groundRight: 0, groundCls: 1, stickSnaps: 0, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
    overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0, trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0,
    peek: 0, weapon: 255, slot: 0,
  };
}

function remoteFrame(n: number, trigger: boolean, gated: boolean): () => void {
  const { map, clips, table } = rig!;
  const remote = new RemotePlayers(new Scene());                                         // remotePlayers.ts:785
  remote.setMap(map, DEFAULT_LIGHTING, null);                                            // remotePlayers.ts:883
  remote.setClips({ clips, table: table ? [...table] : null });                          // remotePlayers.ts:897; play.ts:88
  for (let id = 1; id <= n; id++) remote.setTeam(id, 'seal');                            // remotePlayers.ts:1094
  const camera = new PerspectiveCamera();
  const frames = Array.from({ length: 120 }, (_, k) => Array.from({ length: n }, (_, i) => remoteBody(i + 1, k, trigger)));
  let k = 0;
  return () => {
    remote.frame(DT, frames[k++ % frames.length]!, camera);                              // remotePlayers.ts:1233
    if (gated) remote.applyZoneGate(() => false);                                        // remotePlayers.ts:1530
  };
}

const CASES: { name: string; make: (n: number) => () => void }[] = [
  { name: '(a) Animator.step', make: (n) => { const b = bodies(n, false); return () => { for (const x of b) x.anim.step(DT, x.mover); }; } },
  { name: '(b) Animator.step + fire and reload layers', make: (n) => { const b = bodies(n, true); return () => { for (const x of b) layered(x); }; } },
  { name: '(c) BodyView.setPose', make: (n) => { const b = posed(n); return () => { for (const x of b) x.view.setPose(x.skel.local); }; } },
  { name: '(c2) setPose + group.updateMatrixWorld', make: (n) => {
    const b = posed(n); return () => { for (const x of b) { x.view.setPose(x.skel.local); x.view.group.updateMatrixWorld(true); } };
  } },
  { name: '(d) RemotePlayers.frame, running', make: (n) => remoteFrame(n, false, false) },
  { name: '(d2) RemotePlayers.frame, trigger and aim held', make: (n) => remoteFrame(n, true, false) },
  { name: '(d3) RemotePlayers.frame + applyZoneGate hiding all', make: (n) => remoteFrame(n, false, true) },
];

/** (b)'s frame: the moving reload restarted when it ends, the layers stepped, then the body (`Play.frame`'s order). */
function layered(x: Posed): void {
  const w = x.weapon!;
  if (!w.reloading()) w.startReload('stand', w.reloadSeconds('stand', true) ?? 2, null, true);   // weaponPose.ts:387, 395, 288
  w.step(DT);                                                                            // weaponPose.ts:230; play.ts:632
  x.anim.step(DT, x.mover);
}

/** Bodies stepped half a second into the run, so `setPose` writes a real pose. */
function posed(n: number): Posed[] {
  const b = bodies(n, false);
  for (const x of b) for (let k = 0; k < 30; k++) x.anim.step(DT, x.mover);
  return b;
}

function perBodyUs(n: number, frame: () => void): number {
  for (let i = 0; i < 120; i++) frame();
  const t0 = performance.now();
  for (let i = 0; i < 600; i++) frame();
  return Math.round(((performance.now() - t0) * 1000 * 100) / (600 * n)) / 100;
}

const built = new Map<string, () => void>();
if (rig) {
  const cases: Record<string, Record<string, number>> = {};
  for (const c of CASES) {
    const row: Record<string, number> = {};
    for (const n of COUNTS) { const f = c.make(n); built.set(`${c.name}|${n}`, f); row[`n${n}`] = perBodyUs(n, f); }
    row['growth16over1'] = Math.round((row['n16']! / row['n1']!) * 100) / 100;
    cases[c.name] = row;
  }
  console.log(`BODY_FRAME_COST ${JSON.stringify({ unit: 'us per body per frame', map: 'MP2', model: rig.body.model, clips: rig.clips.length, node: process.version, cases })}`);
}

describe.skipIf(!rig)(`LATER 881/884: one frame of N other players' bodies${SKIP}`, () => {
  for (const c of CASES) for (const n of COUNTS) bench(`${c.name}, ${n} bodies`, () => { built.get(`${c.name}|${n}`)!(); }, { time: 1000, warmupTime: 200 });
});
