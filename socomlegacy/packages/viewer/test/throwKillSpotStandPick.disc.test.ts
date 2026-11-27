import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { GAME_FRAME_DT, THROW_POWER_RISE, type Grid, type V3 } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { GrenadeThrower } from '../src/grenade';
import { loadMap } from '../src/loadMap';
import { groundGrid, moverSnapshot, probeLiftOf, rootY, Walker } from '../src/mover';
import { INIT_AIM_PITCH, PlayerCamera, viewFar } from '../src/playerCamera';
import { bodyThrowAim, THROW_AIM_ORIGIN_LATCH_READING } from '../src/throwAim';

/**
 * KILL-STANDPICK (LATER 1339): the M67 thrown STANDING at Kill's far spot by `worldmodel/g66` on Desert Glory (MP6, the
 * fixture `RUN/MP6.ZDB`, `test-fixtures/MANIFEST.json`) -- the release request's verdict (thrown, or refused 'clear')
 * and the body's aim y at the request, at each valid trial's exact logged pose, against the original.
 *
 * THE CAPTURE: PC 3, KILL-STANDPICK, the original under PCSX2, 2026-11-21.
 * BUILD: r0004 -- footer at a fresh boot after the trials, same image/cards/ini; detectRevision r0004 in the trial boots.
 *   - The footer file: `footer/TITLE-FOOTER-full.png` (and `-crop.png`) inside the zip, reading 'SOCOM 2 r0004 10:14:38
 *     Nov 3 2004' (~22:41Z).
 *   - Memory cards: card hash not recorded (the record names the hub's r0004 cards, Mcd001/Mcd002, with no sha256 at the
 *     trial boots or at the footer boot, so whether they match is not shown).
 *   - The r0001 disc image's sha256 (the DISC, not the build; CRC 0F6FC6CF is recorded as the r0001 disc image's ELF,
 *     specs/2026-11-03-parity-pack-design.md:286): 8e5efc836c69591cef5b2bc3f3cb425fb21983c4f490edd81711cb5be9d14273
 *     (the zip's `iso.sha256`).
 *   - detectRevision coverage: the record has ONE trial boot (consoles booted fresh ~19:58Z; every trial ran 20:24-21:21Z
 *     in it) and ONE detectRevision reading, at 21:19Z in that boot (r0004's clock advancing, r0001's 0); no per-trial
 *     reading exists. Every trial's frame CSV keys on the r0004 addresses and its clock advances in the valid ones. No
 *     trial is excluded for the build; the three voids stand for their frozen clocks.
 *   - PCSX2 (version in the note), the stock portable build; the community DNAS-bypass pnach (issue #112). Source:
 *     the summary's "The build" block and D:/s2u-records/KILL-STANDPICK-PC3/KILL-STANDPICK-PC3-BUILD-NOTE.md (sha256
 *     1cbf58d0328c30a3208800db71f125b138b9762a29dc889686b3344025db6ef7; written before the footer was taken).
 * THE RECORD (FINAL): `D:/s2u-records/KILL-STANDPICK-PC3/KILL-STANDPICK-PC3.zip`, sha256
 *   51e0e0b77f19fb57fba920e70d97f922c4c8abeba649c1e9312807c473f7bf3f. 18 valid trials, each validated by its power
 *   (0.989-0.990) and its clock. Superseded: the interim zip `KILL-STANDPICK-PC3-interim.zip`, sha256
 *   aa2d110374a652c2e31a4439a34ea108fa87dcf1728976458ea44507ae32f93f.
 * THE SUMMARY: `agent-mail/evidence/weekend-mega-2026-11-14/rig/KILL-STANDPICK-PC3/KILL-STANDPICK-summary.md` (under
 *   C:/Projects/).
 * THE REVIEW: `agent-mail/planning/mega-2026-11-21/pilot/kill/review-standpick-port.md` (its per-trial table: the poses,
 *   the max power in the hold, the aim y and the verdict read from the frame CSVs' R1-release rows).
 * EVIDENCE LEVEL: proven once this test is green -- a capture of the original, value for value; the tolerance stated:
 *   the verdict exact, the aim's y within `AIM_Y_TOL` (0.005) of the logged value, at the logged feet x, z and the yaw
 *   from the logged row 0 (`atan2(-row0z, row0x)`, 5 digits: about 0.003 deg).
 *
 * THE DRIVE (as `throwWallLegsClear.disc.test.ts` drives the page's pieces): the real `Walker` placed at the logged feet
 * and ticked standing until settled; the page's `PlayerCamera` eye ray (`viewFar`, as `WalkMode.fireAim` places it) at
 * the camera pitch the capture logs (-9.167, `INIT_AIM_PITCH`); the page's `GrenadeThrower` reading the walker's
 * snapshot, the M67 selected standing (the stand latch, `THROW_AIM_ORIGIN_LATCH_READING.stand`), the trigger held for
 * the time the power chase (`stepThrowPower`, `THROW_POWER_RISE` a second, per game frame) takes to reach the trial's
 * logged max power, then let go. The aim's y is `bodyThrowAim` at the request's own arguments (`grenadeCore.ts`
 * `startThrow`).
 *
 * EXCLUDED, and why (the review, "Excluded"):
 * - X-1722.3 (the first run), X-1721.7 and NEAR-stand-p1500-def-4: VOID -- the game clock frozen through the whole hold,
 *   the power never left 0 (X-1722.3 also drew the pistol, seal_rifle2pistol, and its feet moved 0.7 u
 *   in the switch). The interim's "REFUSED" for them is the harness's default for no throw clip, not a measured refusal.
 *   R-1722.3-1 is void the same way (the clock frozen, the power 0).
 * - def-4, def-6, def-8, X-1722.1: no M67 held (the pistol drawn), no trigger press. Void.
 * - Run 1 of the sweep, Y-20.4, Y-20.6, Y-21.0, Y-21.8: no actor, or the game ended. Void.
 *
 * THE LIMIT: the original's edge is resolved to 0.2 u in x (X-1721.8 refused, X-1722.0 / def-7 thrown) at one heading
 * (yaw about -21.48, z 1868); no yaw sweep was captured. These eighteen trials hold the verdicts on each side, not the
 * edge below 0.2 u. Differences kept: the port's feet settle at y 19.998 against the logged 20.004; the original's
 * camera sways slightly during a hold and the port's does not.
 */

const FIXTURE_ROOT = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP6_ZDB = fixture('RUN/MP6.ZDB');

/** The M67's range (`ThrowableRecord.maximumRange`), as `throwWallLegsClear.disc` and `throwAimCapture.disc`. */
const M67_RANGE = 100000;
/** The capture's camera pitch at every valid trial (the review's table: -9.167). */
const CAPTURE_PITCH = -9.167;
/** The tolerance on the aim's y against the logged value. */
const AIM_Y_TOL = 0.005;
/** The walker's settle, standing (2.5 s at 60 Hz, the review's run). A test choice. */
const SETTLE_TICKS = 150;

type Verdict = 'THROWN' | 'REFUSED';
type Trial = { id: string; feet: V3; row0: [number, number]; power: number; aimY: number; verdict: Verdict };

/** The eighteen valid trials: the first eleven from the review's table (the frame CSVs' R1-release row); the last seven from
 * the final summary's "Every trial" table (feet, row0, aim y at R1, max power after R1). */
const TRIALS: readonly Trial[] = [
  { id: 'def-1 (T1)', feet: [1721.779, 20.004, 1867.964], row0: [0.93255, 0.36103], power: 0.9887, aimY: -0.1279, verdict: 'REFUSED' },
  { id: 'def-2 (T2)', feet: [1721.848, 20.004, 1867.930], row0: [0.93101, 0.36500], power: 0.9893, aimY: -0.1272, verdict: 'REFUSED' },
  { id: 'def-3 (T3)', feet: [1722.538, 20.004, 1867.763], row0: [0.93001, 0.36754], power: 0.9887, aimY: 0.0654, verdict: 'THROWN' },
  { id: 'def-5', feet: [1722.000, 20.004, 1868.000], row0: [0.92984, 0.36797], power: 0.9881, aimY: 0.0513, verdict: 'THROWN' },
  { id: 'def-7', feet: [1722.000, 20.004, 1868.000], row0: [0.93057, 0.36611], power: 0.9887, aimY: 0.0494, verdict: 'THROWN' },
  { id: 'def-9', feet: [1722.000, 20.004, 1868.000], row0: [0.92983, 0.36799], power: 0.9887, aimY: 0.0497, verdict: 'THROWN' },
  { id: 'X-1721.8', feet: [1721.800, 20.004, 1868.000], row0: [0.93046, 0.36640], power: 0.9898, aimY: -0.1271, verdict: 'REFUSED' },
  { id: 'X-1721.9', feet: [1721.900, 20.004, 1868.000], row0: [0.93175, 0.36311], power: 0.9893, aimY: -0.1277, verdict: 'REFUSED' },
  { id: 'X-1722.0', feet: [1722.000, 20.004, 1868.000], row0: [0.93057, 0.36611], power: 0.9893, aimY: 0.0479, verdict: 'THROWN' },
  { id: 'X-1722.2', feet: [1722.200, 20.004, 1868.000], row0: [0.93139, 0.36403], power: 0.9887, aimY: 0.0515, verdict: 'THROWN' },
  { id: 'X-1722.4', feet: [1722.400, 20.004, 1868.000], row0: [0.92863, 0.37100], power: 0.9887, aimY: 0.0690, verdict: 'THROWN' },
  { id: 'R-1722.3-2', feet: [1722.300, 20.004, 1868.000], row0: [0.92994, 0.36771], power: 0.9898, aimY: 0.0604, verdict: 'THROWN' },
  { id: 'R-1722.3-3', feet: [1722.300, 20.004, 1868.000], row0: [0.93175, 0.36311], power: 0.9898, aimY: 0.0550, verdict: 'THROWN' },
  { id: 'NEAR-stand-p1500-def-2', feet: [1722.000, 3.117, 1838.000], row0: [0.61813, 0.78608], power: 0.9887, aimY: -0.1052, verdict: 'REFUSED' },
  { id: 'NEAR-stand-p1500-def-3', feet: [1722.000, 3.117, 1838.000], row0: [0.61696, 0.78700], power: 0.9887, aimY: -0.1054, verdict: 'REFUSED' },
  { id: 'LEFT-stand-p1500-def-1', feet: [1714.610, 20.000, 1864.940], row0: [0.92887, 0.37041], power: 0.9893, aimY: -0.1278, verdict: 'THROWN' },
  { id: 'LEFT-stand-p1500-def-4', feet: [1714.610, 20.000, 1864.940], row0: [0.92933, 0.36925], power: 0.9898, aimY: -0.1271, verdict: 'THROWN' },
  { id: 'LEFT-stand-p1500-def-5', feet: [1714.610, 20.000, 1864.940], row0: [0.92957, 0.36864], power: 0.9887, aimY: -0.1275, verdict: 'THROWN' },
];

/** The yaw from the logged row 0 (x, z), degrees. */
const yawOf = (rx: number, rz: number): number => (Math.atan2(-rz, rx) * 180) / Math.PI;

/** The seconds held at full pressure the chase needs to reach `p`: `1 - (1 - rate x frame)^(t / frame) = p`. */
const holdSecondsFor = (p: number): number => (GAME_FRAME_DT * Math.log(1 - p)) / Math.log(1 - THROW_POWER_RISE * GAME_FRAME_DT);

describe.skipIf(!MP6_ZDB)(`KILL-STANDPICK: the M67 thrown standing at Kill's spot by g66, the port against r0004 at the 18 valid trials on MP6${MP6_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let loaded: { grid: Grid; material: string } | undefined;
  const map = async () => {
    if (loaded) return loaded;
    const m = await loadMap(new FsAssetSource(FIXTURE_ROOT), 'RUN/MP6.ZDB');
    return (loaded = { grid: groundGrid(m.ground!), material: m.grenade?.defaultMaterial ?? '' });
  };

  const throwAt = async (t: Trial) => {
    const { grid, material } = await map();
    const yaw = yawOf(t.row0[0], t.row0[1]);
    const w = new Walker(grid);
    const placed = w.place(t.feet[0], t.feet[1] + probeLiftOf('stand'), t.feet[2]);
    w.state.yaw = yaw;
    const still = { forward: 0, right: 0, boost: false };
    for (let i = 0; i < SETTLE_TICKS; i++) w.tick(still);
    w.state.yaw = yaw; w.state.pitch = INIT_AIM_PITCH;
    const feet = [...w.tickFeet()] as V3;
    const cam = new PlayerCamera(grid);
    for (let i = 0; i < 120; i++) cam.tick(feet, yaw, INIT_AIM_PITCH, rootY('stand'));
    cam.settle();
    const v = cam.view(1);
    const ray = { eye: [...v.aim.eye] as V3, far: [...viewFar(v.aim.eye, v.aim.target, v.far)] as V3 };
    const g = new GrenadeThrower({ grid: () => grid, snapshot: () => moverSnapshot(w, null, 0, 0), view: () => 'third', aim: () => ray });
    g.setEnvironment(material);
    let started = false;
    g.on('throwStart', () => { started = true; });
    const selected = g.select('M67');
    const sel = g.diag();
    g.pull();
    const hold = holdSecondsFor(t.power);
    const whole = Math.floor(hold * 60);
    for (let i = 0; i < whole; i++) g.update(1 / 60);
    const rest = hold - whole / 60;
    if (rest > 1e-9) g.update(rest);
    const power = g.stats().power;
    const snap = moverSnapshot(w, null, 0, 0);
    const aim = bodyThrowAim(grid, ray, { feet: snap.feet, yaw: snap.yaw, stance: snap.stance, latch: sel.selectPosture ?? snap.stance, pitch: snap.pitch }, M67_RANGE, material);
    g.release();
    for (let i = 0; i < 180; i++) g.update(1 / 60);
    const last = g.stats().lastThrow;
    const refusal = g.diag().lastRefusal?.reason ?? null;
    return { placed, selected, posture: w.posture, feet, yaw, pitch: snap.pitch, selectPosture: sel.selectPosture, latchH: sel.latchH, power, aimY: aim[1], started, flew: last !== null, refusal };
  };

  for (const t of TRIALS) {
    it(`${t.id}: ${t.verdict}${t.verdict === 'REFUSED' ? " ('clear', at the release request)" : ''}, the aim's y ${t.aimY} +-${AIM_Y_TOL} (r0004)`, async () => {
      const r = await throwAt(t);
      console.log(`${t.id}: feet ${r.feet.map((x) => x.toFixed(3)).join(', ')} yaw ${r.yaw.toFixed(3)} pitch ${r.pitch} | select ${r.selectPosture} H ${r.latchH} | power ${r.power.toFixed(4)} (logged ${t.power}) | aim y ${r.aimY.toFixed(4)} (logged ${t.aimY}) | started ${r.started} flew ${r.flew} refusal ${r.refusal}`);
      expect(INIT_AIM_PITCH, 'the camera pitch the capture logs').toBeCloseTo(CAPTURE_PITCH, 3);
      expect(r.placed, 'the walker placed').toBe(true);
      expect(r.selected, 'the M67 taken up').toBe(true);
      expect(r.posture, 'standing, settled').toBe('stand');
      expect(Math.hypot(r.feet[0] - t.feet[0], r.feet[2] - t.feet[2]), 'the feet at the logged x, z').toBeLessThan(0.001);
      expect(r.selectPosture, 'the M67 switched standing').toBe('stand');
      expect(r.latchH, 'the stand latch').toBe(THROW_AIM_ORIGIN_LATCH_READING.stand.up);
      expect(Math.abs(r.power - t.power), "the power at the release: the trial's logged max").toBeLessThan(5e-4);
      expect(Math.abs(r.aimY - t.aimY), "the aim's y against r0004's").toBeLessThan(AIM_Y_TOL);
      if (t.verdict === 'THROWN') {
        expect(r.refusal, 'no refusal').toBeNull();
        expect(r.started, 'the throw clip').toBe(true);
        expect(r.flew, 'the grenade let go').toBe(true);
      } else {
        expect(r.started, 'no throw clip').toBe(false);
        expect(r.flew, 'nothing thrown').toBe(false);
        expect(r.refusal, 'refused at the release request').toBe('clear');
      }
    }, 300_000);
  }
});
