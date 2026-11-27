import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import type { Grid, V3 } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { GrenadeThrower } from '../src/grenade';
import { loadMap } from '../src/loadMap';
import { ACTION_CLIPS, groundGrid, moverSnapshot, probeLiftOf, rootY, Walker } from '../src/mover';
import { INIT_AIM_PITCH, PlayerCamera, viewFar } from '../src/playerCamera';
import { THROW_AIM_ORIGIN_LATCH_READING } from '../src/throwAim';
import type { PlaySnapshot } from '../src/walk';

/**
 * LANE-KILL B-06, the browser spec's crouched legs re-checked in the tree (`../e2e/throwWallB06.spec.ts`, THE CROUCH'S
 * DISPLACEMENT; the delta review of 091605d2cc, F3: the spec's 243/243 and 27/27 cited a deleted scratch test). On Desert
 * Glory (MP6, the fixture `RUN/MP6.ZDB`, `test-fixtures/MANIFEST.json`), through the page's own pieces: the real `Walker`
 * (the crouch press through `changeStance`, `standToCrouch`'s root travel carried by its ticks), the page's `PlayerCamera`
 * eye ray (`viewFar`, as `WalkMode.fireAim` places it) and the page's `GrenadeThrower` (the latch at the select, the
 * release request and the hand-open).
 *
 * WHAT THESE ARE: the PORT's readings at poses no capture of the original covers -- no capture throws at g373, and none
 * at wc1di2 from the crouch's displaced feet. They hold the port's own verdicts so the browser spec's legs 8c and 7b
 * stand on the tree, not on a scratch; they are not a parity claim. The latch values are `THROW_AIM_ORIGIN_LATCH_READING`
 * (captures KILL-AIMORIGIN-PC2 and KILL-LATCH-PC2 s1, cited there); the crouch's travel `ACTION_CLIPS.standToCrouch
 * .travel` (`seal_stand2crouch`'s root in `MOTION_P.ZAR`, pinned by `locomotion.test.ts`).
 */

const FIXTURE_ROOT = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP6_ZDB = fixture('RUN/MP6.ZDB');

type Stance = 'stand' | 'crouch' | 'prone';

/** The M67's range (`ThrowableRecord.maximumRange`): the ray's length past the 600 floor (as `throwAimCapture.disc`). */
const M67_RANGE = 100000;
/** The held throw: 43 updates at 60 Hz, about LATER 247's 0.895 (the spec's 600 ms). A test choice. */
const HOLD_UPDATES = 43;
/** The page's per-key carry ends within this of the named travel (the scratch's 0.09 u; the spec's FEET_U is 0.5). */
const CARRY_TOL_U = 0.15;
/** g373's tall face (z 1380, normal +z) and wc1di2's face (x 1566): the spec's walls. */
const G373_FACE_Z = 1380, WC1DI2_FACE_X = 1566;

const snapOf = (feet: V3, yaw: number, stance: Stance, pitch: number): PlaySnapshot => ({
  feet: [...feet], yaw, pitch, vx: 0, vz: 0, vy: 0, airborne: false, crouched: stance === 'crouch', stance,
  landing: null, jumps: 0,
} as unknown as PlaySnapshot);

/** The crouch's travel turned by the yaw as the mover turns it (the spec's `crouchShift`): world x = tx c + tz s, z = -tx s + tz c. */
const crouchShift = (yaw: number): [number, number] => {
  const [tx, tz] = ACTION_CLIPS.standToCrouch.travel as readonly [number, number];
  const a = (yaw * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [tx * c + tz * s, -tx * s + tz * c];
};

describe.skipIf(!MP6_ZDB)(`LANE-KILL B-06: the browser spec's crouched legs (8c, 7b) thrown from the crouch's displaced feet, the port's readings on MP6${MP6_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let loaded: { grid: Grid; material: string } | undefined;
  const map = async () => {
    if (loaded) return loaded;
    const m = await loadMap(new FsAssetSource(FIXTURE_ROOT), 'RUN/MP6.ZDB');
    return (loaded = { grid: groundGrid(m.ground!), material: m.grenade?.defaultMaterial ?? '' });
  };
  /** The page's camera ray: `PlayerCamera` settled at the feet, the yaw and the look pitch. */
  const rayAt = (grid: Grid, feet: V3, yaw: number, stance: Stance, pitch: number): { eye: V3; far: V3 } => {
    const cam = new PlayerCamera(grid);
    for (let i = 0; i < 120; i++) cam.tick(feet, yaw, pitch, rootY(stance));
    cam.settle();
    const v = cam.view(1);
    return { eye: [...v.aim.eye] as V3, far: [...viewFar(v.aim.eye, v.aim.target, v.far)] as V3 };
  };

  /**
   * The real `Walker` at the mark facing the yaw; the crouch pressed; ticked until `standToCrouch` is off the body; the
   * M67 selected on the page's thrower reading the walker's snapshot. The posture, the latch and the feet read back.
   */
  const crouchFrom = async (mark: V3, yaw: number) => {
    const { grid } = await map();
    const w = new Walker(grid);
    w.place(mark[0], mark[1] + probeLiftOf('stand'), mark[2]);
    w.state.yaw = yaw;
    const still = { forward: 0, right: 0, boost: false };
    for (let i = 0; i < 18; i++) w.tick(still);
    const feetAtPress = [...w.tickFeet()] as V3;
    w.changeStance('crouch');
    let held = 0;
    while (w.action?.name === 'standToCrouch' && held < 600) { w.tick(still); held++; }
    for (let i = 0; i < 30; i++) w.tick(still);
    const g = new GrenadeThrower({ grid: () => grid, snapshot: () => moverSnapshot(w, null, 0, 0), view: () => 'third' });
    expect(g.select('M67'), 'the M67 taken up').toBe(true);
    return { w, feetAtPress, feet: [...w.tickFeet()] as V3, posture: w.posture, action: w.action?.name ?? null, held, selectPosture: g.diag().selectPosture, latchH: g.diag().latchH };
  };

  /** The page's thrower at `feet`: the M67 selected at `latch`, the body stood before the press, the trigger held and let go. */
  const throwAt = async (feet: V3, yaw: number, latch: Stance, pitch: number) => {
    const { grid, material } = await map();
    const ray = rayAt(grid, feet, yaw, 'stand', pitch);
    let now: Stance = latch;
    const g = new GrenadeThrower({ grid: () => grid, snapshot: () => snapOf(feet, yaw, now, pitch), view: () => 'third', aim: () => ray });
    g.setEnvironment(material);
    let started = false;
    g.on('throwStart', () => { started = true; });
    g.select('M67');
    expect(g.diag().selectPosture, 'the latch at the select').toBe(latch);
    now = 'stand';                                               // stood after the select (the spec's legs)
    g.pull();
    for (let i = 0; i < HOLD_UPDATES; i++) g.update(1 / 60);
    g.release();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    const last = g.stats().lastThrow;
    return { thrown: started && last !== null, started, flew: last !== null, refusal: g.diag().lastRefusal?.reason ?? null };
  };

  const D2 = [-2, 0, 2], D1 = [-1, 0, 1];

  it("leg 8c (g373, 22 u off, yaw 0): the crouch is TAKEN, the feet carried by standToCrouch's travel, the M67 latched crouch; the crouch latch THROWS across the band, the crouched feet (about 23.3 u off) +-4 u every 1 u, x +-2, yaw +-2 deg, pitch +-1 (243)", async () => {
    const mark: V3 = [1640.1, 0, 1402], yaw = 0;
    const c = await crouchFrom(mark, yaw);
    const [sx, sz] = crouchShift(yaw);
    const named: V3 = [mark[0] + sx, mark[1], mark[2] + sz];
    console.log(`8c: feet at the press ${c.feetAtPress.map((x) => x.toFixed(3)).join(', ')}; standToCrouch held ${c.held} ticks; crouched feet ${c.feet.map((x) => x.toFixed(3)).join(', ')} against the named ${named.map((x) => x.toFixed(3)).join(', ')}; select ${c.selectPosture} H ${c.latchH}`);
    expect(Math.hypot(c.feetAtPress[0] - mark[0], c.feetAtPress[2] - mark[2]), 'the feet at the press on the mark').toBeLessThan(0.01);
    expect(c.posture, 'the crouch taken (the gate open 22 u off)').toBe('crouch');
    expect(c.action, 'the transition clip played out').toBeNull();
    expect(c.selectPosture).toBe('crouch');
    expect(c.latchH).toBe(THROW_AIM_ORIGIN_LATCH_READING.crouch.up);
    expect(Math.hypot(c.feet[0] - named[0], c.feet[2] - named[2]), 'the crouched feet: the mark plus the travel turned by the yaw').toBeLessThan(CARRY_TOL_U);
    let thrown = 0, total = 0;
    const missed: string[] = [];
    for (let off = -4; off <= 4; off++) {
      for (const dx of D2) for (const dyaw of D2) for (const dp of D1) {
        const feet: V3 = [c.feet[0] + dx, c.feet[1], c.feet[2] + off];
        const r = await throwAt(feet, yaw + dyaw, 'crouch', INIT_AIM_PITCH + dp);
        total++;
        if (r.thrown) thrown++; else missed.push(`${(feet[2] - G373_FACE_Z).toFixed(2)} u off, x ${feet[0].toFixed(2)}, yaw ${dyaw}, pitch ${dp}: ${r.refusal ?? (r.started ? 'walled at the hand-open' : 'no clip')}`);
      }
    }
    console.log(`8c band: ${thrown} of ${total} thrown${missed.length ? `; missed ${missed.join('; ')}` : ''}`);
    expect(total).toBe(243);
    expect(missed, 'every pose of the band thrown').toEqual([]);
  }, 600_000);

  it("leg 7b (wc1di2, 20 u, yaw 270): the crouch TAKEN, the feet carried to about 21.3 u off; the crouch latch THROWS at z +-1, yaw +-2 deg, pitch +-1 (27)", async () => {
    const mark: V3 = [1546, 30, 2090], yaw = 270;
    const c = await crouchFrom(mark, yaw);
    const [sx, sz] = crouchShift(yaw);
    const named: V3 = [mark[0] + sx, mark[1], mark[2] + sz];
    console.log(`7b: crouched feet ${c.feet.map((x) => x.toFixed(3)).join(', ')} (${(WC1DI2_FACE_X - c.feet[0]).toFixed(2)} u off wc1di2) against the named ${named.map((x) => x.toFixed(3)).join(', ')}; select ${c.selectPosture}`);
    expect(c.posture, 'the crouch taken').toBe('crouch');
    expect(c.action).toBeNull();
    expect(c.selectPosture).toBe('crouch');
    expect(Math.hypot(c.feet[0] - named[0], c.feet[2] - named[2]), 'the crouched feet: the mark plus the travel turned by the yaw').toBeLessThan(CARRY_TOL_U);
    let total = 0;
    const missed: string[] = [];
    for (const dz of D1) for (const dyaw of D2) for (const dp of D1) {
      const feet: V3 = [c.feet[0], c.feet[1], c.feet[2] + dz];
      const r = await throwAt(feet, yaw + dyaw, 'crouch', INIT_AIM_PITCH + dp);
      total++;
      if (!r.thrown) missed.push(`z ${feet[2].toFixed(2)}, yaw ${dyaw}, pitch ${dp}: ${r.refusal ?? (r.started ? 'walled at the hand-open' : 'no clip')}`);
    }
    console.log(`7b: ${total - missed.length} of ${total} thrown${missed.length ? `; missed ${missed.join('; ')}` : ''}`);
    expect(total).toBe(27);
    expect(missed, 'every pose thrown').toEqual([]);
  }, 600_000);

  it("control: leg 8b (g373, 4 u off, selected standing) and leg 8 (3.65 u off, the crouch press kept by the gate, so selected standing) are REFUSED ('clear') at the stand latch", async () => {
    const leg8 = await crouchFrom([1640.1, 0, 1383.65], 0);
    expect(leg8.posture, "leg 8: the port's crouch gate keeps the press").toBe('stand');
    expect(leg8.selectPosture).toBe('stand');
    expect(leg8.latchH).toBe(THROW_AIM_ORIGIN_LATCH_READING.stand.up);
    const r8 = await throwAt(leg8.feet, 0, 'stand', INIT_AIM_PITCH);
    const r8b = await throwAt([1640.1, 0, 1384], 0, 'stand', INIT_AIM_PITCH);
    console.log(`control: leg 8 ${JSON.stringify(r8)}; leg 8b ${JSON.stringify(r8b)}`);
    for (const [name, r] of [['leg 8', r8], ['leg 8b', r8b]] as const) {
      expect(r.started, `${name}: no throw clip`).toBe(false);
      expect(r.refusal, `${name}: the refusal`).toBe('clear');
    }
  }, 600_000);
});
