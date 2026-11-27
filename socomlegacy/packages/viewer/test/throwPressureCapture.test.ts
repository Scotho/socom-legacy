import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT, POSED_RELEASE_HAND_READING, THROW_ANIMS, THROW_PARAMS, throwVelocity } from '@s2u/scene';
import { GrenadeCore, type GrenadeSource, type ThrowInfo } from '../src/grenadeCore';
import type { PlaySnapshot } from '../src/walk';

/**
 * PAD-DS3 part 5 against the ORIGINAL (research 373, section 7): two captures of r0004 in PCSX2 on Shadow PC 2 (per-frame
 * memory reads with the pad state; capture, UNSCORED -- the comparison below is the port's, not yet accepted by a reviewer):
 *
 * - PADR1-PC2 (ledger #229; PADR1-PC2.zip sha256 8abdab4b43d0daae3411ea63f3f40f254bffeb359c63e69ad21de76007ec969c): M51
 *   offline, standing, the MARK141 flashbang. L1 R1 byte 127 held 2.0 s (60 game frames) then let go: clip 50, launch v
 *   (3.408, 17.268, 88.822), |v| 90.55. L2 byte 127 for 45 frames then 25 for 75: no release while held, nothing thrown
 *   at the let-go. L3 byte 25 steady 90 frames: never released, nothing thrown at the let-go. L4 byte 255 held 1.5 s
 *   (45 frames): clip 49, v (3.076, 49.432, 232.968), |v| 238.17.
 * - PADR1B-PC2 (ledger #232; PADR1B-PC2.zip sha256 53f0e47f84c5f48f203248411515b958a56e03f59e5a408a86d6d153bb770156):
 *   byte 127 for 60 frames, then eased to byte 12 (E05) or 7 (E03), still pressed: the release ON the ease frame (0
 *   frames later), the launch identical to every logged digit to PADR1's L1 -- the 0.5 power carried, no step that frame.
 *
 * The pad's byte is the original's input (x 1/255, `PRESSURE_SCALE`), so the histories below are in bytes: "0.5" is 127.
 */

const byte = (b: number): number => b / 255;

const snap = (): PlaySnapshot => ({ feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, airborne: false, crouched: false,
  stance: 'stand', landing: null, jumps: 0 } as PlaySnapshot);

/** The Mark141 up (the captures' item), settled; Fire fed by `pressure()`. */
function thrower(pressure: () => number): { g: GrenadeCore; thrown: ThrowInfo[] } {
  const source: GrenadeSource = { grid: () => null, snapshot: snap, view: () => 'third' as const, firePressure: pressure };
  const g = new GrenadeCore(source);
  g.setKit(['Mark141', 'Mark141', 'Mark141']);
  g.select('Mark141', 2);                          // the kit's slots are numbered from 2 (`setKit`)
  for (let i = 0; i < 3; i++) g.update(GAME_FRAME_DT);
  const thrown: ThrowInfo[] = [];
  g.on('throw', (info) => { thrown.push(info); });
  return { g, thrown };
}

/** Holds `frames` game frames at what the source feeds, returning the power after each. */
function hold(g: GrenadeCore, frames: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < frames; i++) { g.update(GAME_FRAME_DT); out.push(g.stats().power); }
  return out;
}

describe('PAD-DS3 part 5 against the original: the release law (PADR1-PC2, PADR1B-PC2)', () => {
  for (const [leg, ease] of [['E05', 12], ['E03', 7]] as const) {
    it(`${leg}: byte 127 for 60 frames, eased to ${ease}: released ON the ease frame, at the power the 60 frames built`, () => {
      let t = byte(127);
      const { g } = thrower(() => t);
      g.pull();
      const powers = hold(g, 60);
      expect(g.stats().phase).toBe('holding');
      const built = powers[59]!;
      t = byte(ease);                                    // still pressed: the level test decides
      g.update(GAME_FRAME_DT);
      expect(g.stats().phase).toBe('throwing');          // that frame, no extra one (PADR1B: 0 frames later)
      expect(g.stats().power).toBe(built);               // no chase step on the release frame: the 127 power carried
    });
  }

  it('L2: byte 127 for 45 frames, then 25 for 75: never released while held; the let-go throws nothing (power)', () => {
    let t = byte(127);
    const { g, thrown } = thrower(() => t);
    g.pull();
    hold(g, 45);
    t = byte(25);
    for (let i = 0; i < 75; i++) { g.update(GAME_FRAME_DT); expect(g.stats().phase).toBe('holding'); }
    expect(g.stats().power).toBeLessThan(THROW_PARAMS.abortThreshold);
    g.release();
    for (let i = 0; i < 60; i++) g.update(GAME_FRAME_DT);
    expect(g.diag().lastRefusal?.reason).toBe('power');
    expect(thrown).toEqual([]);
    expect(g.stats().thrown).toBe(0);
  });

  it('L3: byte 25 steady 90 frames: never released while held; the let-go throws nothing (power)', () => {
    const { g, thrown } = thrower(() => byte(25));
    g.pull();
    for (let i = 0; i < 90; i++) { g.update(GAME_FRAME_DT); expect(g.stats().phase).toBe('holding'); }
    g.release();
    for (let i = 0; i < 60; i++) g.update(GAME_FRAME_DT);
    expect(g.stats().phase).toBe('ready');
    expect(g.diag().lastRefusal?.reason).toBe('power');
    expect(thrown).toEqual([]);
  });
});

/**
 * The launch. The capture's velocity is in the world (its yaw unknown), so what compares is the yaw-free pair: the launch
 * pitch atan(vy / |v_xz|) -- `throwVelocity`'s aim (0 here, level) plus 10..12 degrees by the power, so it reads the
 * power off the capture -- and the speed |v|.
 *
 * LATER 1302, modelled here explicitly: the original's chase takes its first step on the third frame that sees R1 down,
 * the port's on the press's own update, so a hold of N frames is N - 2 chase steps in the original and N in the port.
 * The capture's pitch picks N - 2: for L4, 43 steps give 11.97855 deg against the capture's 11.97854, the port's own 45
 * give 11.98254 (0.004 off). The pitch's tolerance, 0.001 deg, is about three times what the capture's 3-decimal
 * components carry (0.0005 / 90 rad, about 0.0003 deg). (L1 cannot tell 58 steps from 60 at that tolerance: the power
 * is 99.8% settled by then.)
 *
 * The speed's tolerance is the port's own release-point span: the harness has no posed body, so the port launches from
 * `GetThrowAnim`'s table point (`THROW_ANIMS[...].offset`), and the page from its posed hand
 * (`POSED_RELEASE_HAND_READING`, the release frame); the capture's |v| should fall between the two speeds those give.
 */
describe('PAD-DS3 part 5 against the original: the launch (PADR1-PC2 L1, L4)', () => {
  const capture = {
    L1: { v: [3.408, 17.268, 88.822] as const, held: 60, byte: 127, clip: THROW_ANIMS.standToss, key: 'standToss' as const },
    L4: { v: [3.076, 49.432, 232.968] as const, held: 45, byte: 255, clip: THROW_ANIMS.standThrow, key: 'standThrow' as const },
  };
  const pitchOf = (v: readonly number[]): number => (Math.atan2(v[1]!, Math.hypot(v[0]!, v[2]!)) * 180) / Math.PI;
  const deg = (r: number): number => (r * 180) / Math.PI;

  /** The port's thrown launch after `steps` game frames at byte `b`, then let go (driven through to the hand-open). */
  const portLaunch = (b: number, steps: number): ThrowInfo => {
    let t = byte(b);
    const { g, thrown } = thrower(() => t);
    g.pull();
    hold(g, steps);
    t = 0; g.release();
    for (let i = 0; i < 90 && thrown.length === 0; i++) g.update(GAME_FRAME_DT);
    expect(thrown).toHaveLength(1);
    return thrown[0]!;
  };

  /** The two release points' speeds at the launch's power: [table point, posed hand]. */
  const speeds = (leg: 'L1' | 'L4', info: ThrowInfo): [number, number] => {
    const posed = POSED_RELEASE_HAND_READING[capture[leg].key]![1];
    return [info.launch.speed, throwVelocity(info.power, info.aimSin, posed, THROW_PARAMS.maxDistanceStand).speed];
  };

  for (const leg of ['L1', 'L4'] as const) {
    it(`${leg}: the power the original released at (N - 2 chase steps) gives the capture's launch pitch within 0.001 deg`, () => {
      const c = capture[leg];
      const info = portLaunch(c.byte, c.held - 2);
      expect(info.anim).toBe(c.clip);                    // L1 a toss (power < 0.6, level aim), L4 a throw: clips 50 / 49
      expect(info.fromHand).toBe(false);                 // the table point
      expect(Math.abs(deg(info.launch.pitch) - pitchOf(c.v))).toBeLessThan(0.001);
    });
  }

  it('L4 without the two-frame start (45 chase steps, the port\'s own count) misses the capture\'s pitch: LATER 1302 shows', () => {
    const info = portLaunch(255, 45);
    expect(Math.abs(deg(info.launch.pitch) - pitchOf(capture.L4.v))).toBeGreaterThan(0.003);
  });

  it('L4 (full R1, the speed clamped to ComputeMaxVel\'s): the capture\'s |v| 238.17 lies inside the port\'s release-point span', () => {
    const info = portLaunch(255, 43);
    const [table, posed] = speeds('L4', info);
    const v = Math.hypot(...capture.L4.v);
    expect(info.launch.speed).toBe(info.launch.maxSpeed);
    expect(table).toBeCloseTo(238.669, 3);
    expect(posed).toBeCloseTo(238.174, 3);              // LATER 1428: the posed hand read at the game frame (was 237.924)
    // LATER 1428 review F2: the capture EQUALS the posed hand within its own precision (3-decimal components, about
    // +-0.0006 u/s) -- the clamped speed depends on the hand's height alone, and only frame k's (21.927) fits -- so the
    // claim is equality within that band, not strict containment (which held by 0.0004).
    expect(Math.abs(v - posed)).toBeLessThan(0.002);
    expect(v).toBeLessThan(table);
  });

  // LATER 1428 (*was* a FINDING: the posed hand read on the 1/60 s render grid gave 91.916, outside the span): with
  // `POSED_RELEASE_HAND_READING` read at the game frame k x `GAME_FRAME_DT` the posed hand gives 90.541, the table point
  // 91.230, the capture 90.549 -- inside the span. The numbers stay pinned.
  it("L1 (byte 127, a toss): the port's speeds, pinned beside the capture's |v| 90.549 (LATER 1428)", () => {
    const [table, posed] = speeds('L1', portLaunch(127, 58));
    expect(table).toBeCloseTo(91.230, 2);
    expect(posed).toBeCloseTo(90.541, 2);
    expect(Math.hypot(...capture.L1.v)).toBeCloseTo(90.549, 3);
  });

  it('L1 (byte 127, a toss): the capture\'s |v| 90.55 inside the port\'s release-point span', () => {
    const [table, posed] = speeds('L1', portLaunch(127, 58));
    const v = Math.hypot(...capture.L1.v);
    expect(v).toBeGreaterThanOrEqual(Math.min(table, posed));
    expect(v).toBeLessThanOrEqual(Math.max(table, posed));
  });

  // LATER 1428 review F1: the above holds the CONSTANT. The page's own launch (`grenadeCore.ts` `launchOf`) still takes
  // `Play.partPoint` on the render frame the release lands on, so a half-pressure toss on the page can still leave about
  // 1% fast until LATER 1428's page half samples it at k x `GAME_FRAME_DT`.
  it.todo("LATER 1428's page half: the page's sampled `from` at the game frame k gives L1's |v| inside the span");
});
