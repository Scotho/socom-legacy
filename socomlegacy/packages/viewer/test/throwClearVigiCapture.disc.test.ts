import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { throwAnim, type Grid, type V3 } from '@s2u/scene';
import { GrenadeThrower, type GrenadeSource } from '../src/grenade';
import { probeLiftOf, rootY, Walker } from '../src/mover';
import { INIT_AIM_PITCH, PlayerCamera, viewFar } from '../src/playerCamera';
import { loadSimMap, type SimMap } from '../src/simMap';
import { bodyThrowAim } from '../src/throwAim';
import type { PlaySnapshot } from '../src/walk';

/**
 * Step 1 of agent-mail pilot/kill/keyjob-vigi-nearwall-read.md section 5: its section 3's table (the port at IQ-084's
 * MP51 spots against the original) as a test through the page's camera and thrower, as `throwAimCapture.disc.test.ts`
 * does it. No behaviour change: it pins what the read found, green on arrival.
 *
 * IQ-084 is a capture of the original (r0004), unscored, its yaw at A and B not in the record -- it holds a reading, it
 * does not make it proven. (agent-mail evidence/weekend-mega-2026-11-14/shadow/VIGITHROW-ORIG-PC2/SUMMARY.md, Shadow
 * PC 2, written from the PC's report, not reviewed; zip VIGITHROW-ORIG-PC2.zip sha256
 * 0b1612ba8783603cf1faacce206d8d3eb78ffadec5f0600ea27dcda1660def91, held on PC 2.) What it records: standing, the
 * default pitch -9.17; MAIN (1015, -17.6, 811) facing +x: R1 holds of 100, 150, 250 and 300 ms threw nothing (the
 * flashbang), 400 ms and full threw (the flashbang and the frag); SECOND (1038, -20.2, 811) facing -x: the flashbang
 * thrown at full (3 + 1); A (985, -16.5, 788) nothing x3 and B (1058, -24.6, 788) nothing x1, positions only -- no yaw,
 * no hold, no item.
 *
 * Applied from the second read (pilot/kill/review-vigi-nearwall-read.md, F6): only recorded poses are pinned. A's +x is
 * seat-shots' note of 03:05Z, not IQ-084's record; it is pinned here as section 3 lists it and labelled so.
 *
 * IQ-152 capture 1 (section 6's capture 1; complete, relayed by seat-kill): PC 4, r0004, PINE breakpoints, a trace of
 * the original, UNSCORED -- it holds a reading, it does not make it proven; the record's RESULT.md holds the per-trial
 * points once filed. The MARK141 (MP51's default SEAL kit carries AN-M8 smoke, so it was taken at the armory; `+0x804`
 * 6 -> 5 on a throw), selected STANDING (stance 0, the low half of `+0x174`; `+0x14a4` 13.097-13.116), the yaw logged
 * (+x = -90, -x = +90, within 1 degree). The verdict is the clearance's return at 0x54e88c; release power in brackets:
 *   B +x: 700 ms CLEAR 3/3, thrown (0.850, 0.865, 0.879); 400 ms CLEAR 3/3, thrown (0.613, 0.669, 0.669); 300 ms REFUSED
 *   3/3 (0.522, 0.522, 0.469); 150 ms REFUSED 3/3.
 *   B -x: 700 ms REFUSED 3/3; 300 ms REFUSED 3/3.
 *   A +x: 700 ms REFUSED 3/3 (hit x ~1001.7-1002.0); 300 ms REFUSED 3/3.
 *   A -x: 700 ms CLEAR 3/3, thrown; 300 ms REFUSED 3/3 (hit x 961.43-961.80).
 *   MAIN +x: 700 ms CLEAR 3/3, thrown; 300 ms REFUSED 3/3.
 *   Selected crouched, B +x 700 ms: CLEAR, thrown (`+0x14a4` = 13.22; the start essentially the standing one).
 * Every 300 ms hold is a TOSS (power about 0.47-0.55), refused at all five spot-yaws: its start 10-11 u ahead and lower
 * (at B +x 10.5 u ahead, 5.5 u lower; its 25 u segment meets the face at x ~1082.6; the floats logged beside that hit are
 * NOT a face normal, the record's RESULT.md says, so no normal is given).
 * The 700 ms THROW starts about 3.9 u behind the feet and ends at start + 25 x aim, as the port's throwClear. Every
 * clear had the hand-open 0x5c93ac v0 = 0; the rifle state was the same in every trial. Figures recorded, not asserted
 * (the cells ask clear or refused, thrown, and the clip): the B +x aim (-0.0134, 0.1236, -0.9922) at 700 ms and
 * (-0.0140, 0.1169, -0.9930) at 300 ms. The port's power at a true 300 ms is 0.6126, over the toss line, so the page
 * picks the THROW there (LATER 1302): where the throw start is clear (B +x, A -x, MAIN +x) the 300 ms cell is
 * `it.fails`; where the throw is refused anyway (B -x, A +x) it passes today FOR THE WRONG REASON (the port refuses
 * its throw, the original refuses the toss) until LATER 1302 lands.
 *
 * What is pinned of IQ-152 capture 1: 12 of the record's 20 standing cells -- the 700 and 300 ms columns at all five
 * spot-yaws and B +x's 400 and 150 ms -- and B +x crouched at 700 ms. The 400 and 150 ms columns at B -x, A +x, A -x
 * and MAIN +x were captured after this file was written and are NOT pinned here (a follow-up). The file holds FIVE
 * `it.fails`, each on LATER 1302: IQ-084 MAIN 300 ms at both latches, and IQ-152's B +x, A -x and MAIN +x at 300 ms;
 * two more cells (IQ-152's B -x and A +x at 300 ms) pass for the wrong reason, as above.
 *
 * A's item: IQ-084's summary lists A and B as no-throw spots by position only ("No-throw spots: (985, -16.5, 788) x3
 * and (1058, -24.6, 788) x1"), with no item; the session carried both the MARK141 and the frag, and section 3 of the
 * read does not name one for A either. So IQ-084's A cells stay on the M67, which is NOT the record's -- an open item,
 * not a reading; IQ-152 capture 1's A cells (the MARK141) are the record's.
 *
 * The latch (`THROW_AIM_ORIGIN_LATCH_READING`, set at the select): IQ-084 logged no `+0x14a4`, so no IQ-084 cell asserts
 * one (IQ-152 capture 1's cells take its logged select, above).
 * Each IQ-084 verdict is asked at BOTH latches, the M67 or Mark141 selected standing and selected crouched then stood: section
 * 3's probe gives the same verdict at both, so the pin holds whichever the capture's driver used. Section 3 reads
 * MAIN's launch elevation as fitting the crouch latch; the second read (F6) gives it a second explanation, the stand
 * latch's aim about 7 degrees low, so the elevation is printed beside the capture's (23.15 deg at 400 ms, 23.87-24.67
 * at full, the second read's re-derivation from the logged v) and never asserted, and no cause is asserted.
 *
 * The holds: the capture's in ms as page updates at 60 Hz (150 ms 9, 250 ms 15, 300 ms 18, 400 ms 24, 700 ms 42); its full hold's
 * length is not given (700 ms was full), here 1.5 s (90 updates). The power at the release is printed with each verdict:
 * under 0.6 the page's clip is the toss (start 10.5 u ahead), from 0.6 the throw (section 2 (c)); the toss class is
 * asserted on each short hold, so a toss refused is told from a throw refused. The feet: the logged point dropped onto
 * the floor under it by the page's `Walker.place`. A dev-disc test: MP51 from `SOCOM_DISC` (no fixture); it skips
 * without it, said in the suite's title.
 */

const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const HAVE_MP51 = !!DISC && existsSync(resolve(DISC, 'RUN', 'MP51.ZDB'));

type Stance = 'stand' | 'crouch';
type Item = 'M67' | 'Mark141';
/**
 * The port's yaw facing +x and -x (`actorToWorld`: yaw 0 faces -z; section 3's "+x is the port's yaw 270"). Checked
 * against IQ-152 capture 1's logged convention, +x = -90 and -x = +90: 270 is -90 mod 360, so they agree.
 */
const PLUS_X = 270, MINUS_X = 90;
const MAIN: V3 = [1015, -17.6, 811], SECOND: V3 = [1038, -20.2, 811], A: V3 = [985, -16.5, 788], B: V3 = [1058, -24.6, 788];
const HOLD = { ms150: 9, ms250: 15, ms300: 18, ms400: 24, ms700: 42, full: 90 } as const;
const LATCHES: readonly Stance[] = ['stand', 'crouch'];
/** The toss line (`THROW_PARAMS` 0.6, section 2 (c): power under +0x1a4). */
const TOSS_POWER = 0.6;
/** The capture's launch elevations at MAIN (the second read's re-derivation, F6): printed, never asserted. */
const MAIN_ELEVATION = { ms400: '23.15', full: '23.87..24.67' } as const;

const snapOf = (feet: V3, yaw: number, stance: Stance): PlaySnapshot => ({
  feet: [...feet], yaw, pitch: INIT_AIM_PITCH, vx: 0, vz: 0, vy: 0, airborne: false, crouched: stance === 'crouch', stance,
  landing: null, jumps: 0,
} as unknown as PlaySnapshot);
const elevationOf = (v: readonly number[]): number => (Math.atan2(v[1]!, Math.hypot(v[0]!, v[2]!)) * 180) / Math.PI;

describe.skipIf(!HAVE_MP51)(`IQ-084 at MP51 (keyjob-vigi-nearwall-read s3, Step 1): the page refuses and throws where the original did, recorded poses only${HAVE_MP51 ? '' : ' -- SKIPPED: SOCOM_DISC with RUN/MP51.ZDB absent (MP51 is no fixture)'}`, () => {
  let loaded: SimMap | undefined;
  const map = async (): Promise<SimMap> => (loaded ??= await loadSimMap(new FsAssetSource(DISC), 'RUN/MP51.ZDB'));

  /** The logged point dropped onto the floor under it (the page's `Walker.place`). */
  const floorAt = (grid: Grid, p: V3): V3 => {
    const w = new Walker(grid);
    expect(w.place(p[0], p[1] + probeLiftOf('stand'), p[2]), `a floor under ${p.join(', ')}`).toBe(true);
    const f = w.tickFeet();
    return [f[0], f[1], f[2]];
  };
  /** The page's camera ray, as `throwAimCapture.disc.test.ts`'s `rayAt`. */
  const rayAt = (grid: Grid, feet: V3, yaw: number): { eye: V3; far: V3 } => {
    const cam = new PlayerCamera(grid);
    for (let i = 0; i < 120; i++) cam.tick(feet, yaw, INIT_AIM_PITCH, rootY('stand'));
    cam.settle();
    const v = cam.view(1);
    return { eye: [...v.aim.eye] as V3, far: [...viewFar(v.aim.eye, v.aim.target, v.far)] as V3 };
  };

  /**
   * A held throw let go through the page's thrower, as `throwAimCapture.disc.test.ts`'s `pageThrow`: the item selected
   * at `latch`, the body stood before the press, R1 held `hold` updates. Returns what the request and the hand-open did.
   */
  const pageThrow = async (spot: V3, yaw: number, item: Item, latch: Stance, hold: number) => {
    const m = await map();
    const grid = m.grid, material = m.defaultMaterial ?? '';
    const feet = floorAt(grid, spot);
    const ray = rayAt(grid, feet, yaw);
    let now: Stance = latch;
    const source: GrenadeSource = { grid: () => grid, snapshot: () => snapOf(feet, yaw, now), view: () => 'third', aim: () => ray };
    const g = new GrenadeThrower(source);
    g.setEnvironment(material);
    const starts: string[] = [];
    g.on('throwStart', (e) => starts.push(e.anim.clip));
    expect(g.select(item), `the ${item} taken up`).toBe(true);
    expect(g.diag().selectPosture, 'the latch at the select').toBe(latch);
    now = 'stand';                                               // stood before the press
    g.pull();
    for (let i = 0; i < hold; i++) g.update(1 / 60);
    const power = g.diag().power;
    g.release();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    const range = g.recordOf(item)!.maximumRange;
    const aim = bodyThrowAim(grid, ray, { feet, yaw, stance: 'stand', latch, pitch: INIT_AIM_PITCH }, range, material);
    const toss = throwAnim(power, aim[1], 'stand', 0).toss;
    const last = g.stats().lastThrow;
    return {
      feet, power, toss, aimSin: aim[1], started: starts.length > 0, clip: starts[0] ?? null,
      thrown: last !== null, elevation: last ? elevationOf(last.velocity) : null,
      refusal: g.diag().lastRefusal?.reason ?? null, abort: g.diag().lastAbort?.path ?? null,
    };
  };
  const show = (name: string, r: Awaited<ReturnType<typeof pageThrow>>): void => {
    console.log(`${name}: feet ${r.feet.map((x) => x.toFixed(2)).join(', ')}, power ${r.power.toFixed(4)} (${r.toss ? 'toss' : 'throw'}), aim sine ${r.aimSin.toFixed(4)}, ` +
      `request ${r.started ? `taken (${r.clip})` : `refused (${r.refusal})`}, hand-open ${r.thrown ? 'thrown' : `not thrown (${r.abort})`}${r.elevation !== null ? `, launch ${r.elevation.toFixed(2)} deg` : ''}`);
  };
  /** Refused at the request: the release judged (`lastRefusal` 'clear', the clearance's), no clip, nothing thrown. */
  const expectRefused = (r: Awaited<ReturnType<typeof pageThrow>>): void => {
    expect(r.power, 'the wind-up ran').toBeGreaterThan(0.15);
    expect(r.refusal, 'the release request was evaluated and refused by the clearance').toBe('clear');
    expect(r.started, 'no throw clip').toBe(false);
    expect(r.thrown, 'nothing thrown').toBe(false);
  };
  /** Thrown: the request taken and the hand opened (`lastThrow`). */
  const expectThrown = (r: Awaited<ReturnType<typeof pageThrow>>): void => {
    expect(r.started, `the release request taken (refusal ${r.refusal})`).toBe(true);
    expect(r.thrown, `the hand-open threw (abort ${r.abort})`).toBe(true);
  };
  /** Clear: the wind-up ran, the release request evaluated and not refused, the request taken (a clip started). */
  const expectClear = (r: Awaited<ReturnType<typeof pageThrow>>): void => {
    expect(r.power, 'the wind-up ran').toBeGreaterThan(0.15);
    expect(r.refusal, 'the release request was evaluated and not refused').toBe(null);
    expect(r.started, 'the release request taken (a clip started)').toBe(true);
  };

  const latchName = (l: Stance): string => (l === 'stand' ? 'selected standing' : 'selected crouched');

  for (const latch of LATCHES) {
    // IQ-152 capture 1 confirms MAIN +x with the MARK141 selected standing at a logged yaw (300 ms REFUSED 3/3, 700 ms
    // CLEAR and thrown); its own cells are below.
    const mainToss = (label: string, hold: number) => async (): Promise<void> => {
      const r = await pageThrow(MAIN, PLUS_X, 'Mark141', latch, hold);
      show(`MAIN +x ${label} ${latch} latch`, r);
      expect(r.power, 'under the toss line').toBeLessThan(TOSS_POWER);
      expect(r.toss, 'the clip is the toss').toBe(true);
      expectRefused(r);
    };
    for (const [label, hold] of [['150 ms', HOLD.ms150], ['250 ms', HOLD.ms250]] as const) {
      it(`IQ-084 MAIN facing +x, the Mark141 ${latchName(latch)}, a ${label} hold: the toss, refused (the original threw nothing)`,
        mainToss(label, hold), 60_000);
    }
    {
      // A REAL FINDING at 300 ms, held as `it.fails` (box run e4575ee413, J2): a true 300 ms by the page's clock (18 updates
      // of 1/60 s; the non-fed chase in `GrenadeCore.update`, viewer src/grenadeCore.ts:1649-1655, steps `stepThrowPower`
      // over `real` in pieces of at most THROW_POWER_STEP_MAX_S, :82) reaches power 0.6126 -- the page's curve
      // 1 - (1 - THROW_POWER_RISE x GAME_FRAME_DT)^(t / GAME_FRAME_DT), scene src/projectile.ts:531 (3, DAT_006505e0),
      // :537-547 (`chaseShare`, `stepThrowPower`; LATER 1027), scene src/gameFrame.ts:29 (525 / 15734): 1 - 0.8999^8.991 = 0.6126 -- over the
      // 0.6 toss line, so the page picks the THROW where the original, which steps N - 2 of N polls
      // (agent-mail pilot/kill/keyjob-r1-throw-read.md section 4: 9 polls, 7 steps, 0.52), picks the toss. That is
      // LATER 1302 (open: the port chases from the press, the original from the third poll). The cell goes green when
      // LATER 1302 lands, and `it.fails` then turns red: drop it there.
      // A plain `it.fails(` call (not a chosen callee), so tools/test/itFailsRegister.test.ts sees and registers it.
      it.fails(`IQ-084 MAIN facing +x, the Mark141 ${latchName(latch)}, a 300 ms hold: the toss, refused (the original threw nothing) -- FAILS today: LATER 1302, the page power at a true 300 ms is 0.6126, over the toss line`,
        mainToss('300 ms', HOLD.ms300), 60_000);
    }
    for (const item of ['M67', 'Mark141'] as const) {
      for (const [label, hold, key] of [['400 ms', HOLD.ms400, 'ms400'], ['full', HOLD.full, 'full']] as const) {
        it(`IQ-084 MAIN facing +x, the ${item} ${latchName(latch)}, a ${label} hold: the throw, clear (the original threw)`, async () => {
          const r = await pageThrow(MAIN, PLUS_X, item, latch, hold);
          show(`MAIN +x ${label} ${item} ${latch} latch (the capture's elevation ${MAIN_ELEVATION[key]} deg, not asserted)`, r);
          expect(r.power, 'at or over the toss line').toBeGreaterThanOrEqual(TOSS_POWER);
          expect(r.toss, 'the clip is the throw').toBe(false);
          expectThrown(r);
        }, 60_000);
      }
    }
    it(`IQ-084 SECOND facing -x, the Mark141 ${latchName(latch)}, a full hold: clear (the original threw)`, async () => {
      const r = await pageThrow(SECOND, MINUS_X, 'Mark141', latch, HOLD.full);
      show(`SECOND -x full ${latch} latch`, r);
      expectThrown(r);
    }, 60_000);
    // IQ-152 capture 1 supersedes these on the facing and the item: A +x at a logged yaw with the MARK141, REFUSED at 700
    // and 300 ms (its cells below). These IQ-084 cells stay, the M67 and the seat-shots facing labelled as above.
    for (const [label, hold] of [['300 ms', HOLD.ms300], ['400 ms', HOLD.ms400], ['full', HOLD.full]] as const) {
      it(`IQ-084 A facing +x (the facing from seat-shots note of 03:05Z, not in the record), the M67 ${latchName(latch)}, a ${label} hold: refused (the original threw nothing)`, async () => {
        const r = await pageThrow(A, PLUS_X, 'M67', latch, hold);
        show(`A +x ${label} ${latch} latch`, r);
        expectRefused(r);
      }, 60_000);
    }
  }

  // IQ-152 capture 1 (r0004, PC 4, unscored, relayed by seat-kill; the header's table): the MARK141, the yaw logged. A
  // reading, not proven. Each cell is one spot-yaw-hold of the capture; the verdict asked is the clearance's at the
  // release request (`lastRefusal` 'clear', or none and the clip started), and the hand-open where the original threw.
  type Cap = 'thrown' | 'clear' | 'refused';
  const SPOTS = { 'B +x': [B, PLUS_X], 'B -x': [B, MINUS_X], 'A +x': [A, PLUS_X], 'A -x': [A, MINUS_X], 'MAIN +x': [MAIN, PLUS_X] } as const;
  type SpotYaw = keyof typeof SPOTS;
  /** One capture cell; `wrongReason`: refused today by the port's THROW where the original refused its TOSS (no toss class asked). */
  const capCell = (spotYaw: SpotYaw, latch: Stance, label: string, hold: number, want: Cap, original: string, wrongReason = false) => async (): Promise<void> => {
    const [spot, yaw] = SPOTS[spotYaw];
    const r = await pageThrow(spot, yaw, 'Mark141', latch, hold);
    show(`IQ-152 c1 ${spotYaw} ${label} ${latch} latch (the original: ${original})`, r);
    if (want === 'refused') {
      if (!wrongReason && hold <= HOLD.ms300) {
        expect(r.power, 'under the toss line').toBeLessThan(TOSS_POWER);
        expect(r.toss, 'the clip is the toss').toBe(true);
      }
      expectRefused(r);
      return;
    }
    expect(r.toss, 'the clip is the throw').toBe(false);
    expectClear(r);
    if (want === 'thrown') expectThrown(r);
  };

  // The 700 ms holds, selected standing: the THROW, its start about 3.9 u behind the feet.
  it('IQ-152 capture 1 B facing +x, the Mark141 selected standing, a 700 ms hold: clear and thrown (the original CLEAR 3/3, thrown, power 0.850-0.879)',
    capCell('B +x', 'stand', '700 ms', HOLD.ms700, 'thrown', 'CLEAR 3/3, thrown, 0.850-0.879'), 60_000);
  it('IQ-152 capture 1 B facing -x, the Mark141 selected standing, a 700 ms hold: refused (the original REFUSED 3/3)',
    capCell('B -x', 'stand', '700 ms', HOLD.ms700, 'refused', 'REFUSED 3/3'), 60_000);
  it('IQ-152 capture 1 A facing +x, the Mark141 selected standing, a 700 ms hold: refused (the original REFUSED 3/3, hit x about 1001.7-1002.0)',
    capCell('A +x', 'stand', '700 ms', HOLD.ms700, 'refused', 'REFUSED 3/3, hit x ~1001.7-1002.0'), 60_000);
  it('IQ-152 capture 1 A facing -x, the Mark141 selected standing, a 700 ms hold: clear and thrown (the original CLEAR 3/3, thrown)',
    capCell('A -x', 'stand', '700 ms', HOLD.ms700, 'thrown', 'CLEAR 3/3, thrown'), 60_000);
  it('IQ-152 capture 1 MAIN facing +x, the Mark141 selected standing, a 700 ms hold: clear and thrown (the original CLEAR 3/3, thrown)',
    capCell('MAIN +x', 'stand', '700 ms', HOLD.ms700, 'thrown', 'CLEAR 3/3, thrown'), 60_000);
  // Selected crouched then stood: `+0x14a4` 13.22 against 13.11, the start essentially the standing one.
  it('IQ-152 capture 1 B facing +x, the Mark141 selected crouched, a 700 ms hold: clear and thrown (the original CLEAR, thrown, latch 13.22)',
    capCell('B +x', 'crouch', '700 ms', HOLD.ms700, 'thrown', 'CLEAR, thrown, latch 13.22'), 60_000);

  // B +x 400 ms: the first hold over the toss line in both (the original 0.613-0.669), thrown 3/3.
  it('IQ-152 capture 1 B facing +x, the Mark141 selected standing, a 400 ms hold: clear and thrown (the original CLEAR 3/3, thrown, power 0.613-0.669)',
    capCell('B +x', 'stand', '400 ms', HOLD.ms400, 'thrown', 'CLEAR 3/3, thrown, 0.613-0.669'), 60_000);

  // The 300 ms holds: the original TOSSES (power about 0.47-0.55) and refuses at every spot-yaw. The port's power at a
  // true 300 ms is 0.6126, a THROW (LATER 1302: the port chases from the press, the original from the third poll).
  // Where the throw start is clear the port launches: `it.fails` until LATER 1302 lands, then drop it.
  it.fails('IQ-152 capture 1 B facing +x, the Mark141 selected standing, a 300 ms hold: the toss, refused (the original REFUSED 3/3 as a toss, power 0.469-0.522) -- FAILS today: LATER 1302, the page power at 300 ms is 0.6126, a throw',
    capCell('B +x', 'stand', '300 ms', HOLD.ms300, 'refused', 'REFUSED 3/3, a toss, 0.469-0.522'), 60_000);
  it.fails('IQ-152 capture 1 A facing -x, the Mark141 selected standing, a 300 ms hold: the toss, refused (the original REFUSED 3/3 as a toss, hit x 961.43-961.80) -- FAILS today: LATER 1302, the page power at 300 ms is 0.6126, a throw',
    capCell('A -x', 'stand', '300 ms', HOLD.ms300, 'refused', 'REFUSED 3/3, a toss, hit x 961.43-961.80'), 60_000);
  it.fails('IQ-152 capture 1 MAIN facing +x, the Mark141 selected standing, a 300 ms hold: the toss, refused (the original REFUSED 3/3 as a toss) -- FAILS today: LATER 1302, the page power at 300 ms is 0.6126, a throw',
    capCell('MAIN +x', 'stand', '300 ms', HOLD.ms300, 'refused', 'REFUSED 3/3, a toss'), 60_000);
  // Where the throw start is refused anyway the cell passes today FOR THE WRONG REASON until LATER 1302: the port
  // refuses its THROW, the original refused the TOSS. The toss class is therefore not asked here; when LATER 1302 lands
  // the port's clip becomes the toss -- then ask the toss class too (drop `wrongReason`).
  it('IQ-152 capture 1 B facing -x, the Mark141 selected standing, a 300 ms hold: refused (the original REFUSED 3/3 as a toss; the port refuses its throw -- the wrong reason until LATER 1302)',
    capCell('B -x', 'stand', '300 ms', HOLD.ms300, 'refused', 'REFUSED 3/3, a toss', true), 60_000);
  it('IQ-152 capture 1 A facing +x, the Mark141 selected standing, a 300 ms hold: refused (the original REFUSED 3/3 as a toss; the port refuses its throw -- the wrong reason until LATER 1302)',
    capCell('A +x', 'stand', '300 ms', HOLD.ms300, 'refused', 'REFUSED 3/3, a toss', true), 60_000);

  // B +x 150 ms: the low-power path. The page's power at 9 updates is under the toss line, so its clip is the toss,
  // whose start is the one the original refuses; section 3's probe found the port's toss REFUSED at B +x. Pinned as the
  // original's refused, a plain test (expected green today; not yet run).
  it('IQ-152 capture 1 B facing +x, the Mark141 selected standing, a 150 ms hold: the toss, refused (the original REFUSED 3/3)',
    capCell('B +x', 'stand', '150 ms', HOLD.ms150, 'refused', 'REFUSED 3/3'), 60_000);
});
