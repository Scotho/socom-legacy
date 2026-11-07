// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { readSkeleton } from '@s2u/scene';
import { Animator, PLAY_CLIPS, type MoverSnapshot } from '../src/animator';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { groundPolygons, POSED_HEAD_READING, WALL_HEAD_LINE_READING, Walker, wallProbeHeights, type Stance } from '../src/mover';
import { Traversal } from '../src/traversal';
import { loadSimMap } from '../src/simMap';

/**
 * The crouch-run head line (seat b6's finding, 2026-11-06; simulation track; reading, pending review). A dev-disc test:
 * `RUN/MP72.ZDB` (Crossroads) through `loadSimMap`, and `MOTION_P.ZAR` / `READERC.ZAR` / `MP2.ZDB`'s `seal_A_scuba`
 * through the port's animator; it reads `SOCOM_DISC` (else `<SOCOM_PC_ROOT>/game/disc`) and skips -- said so -- without.
 *
 * At MP72 (569.28, 13.81, 1459.43), facing 184.8, the warehouse doorway's lintel slab stands 4 ahead with its underside
 * 18.23 over the feet. A crouched body with the stick at or over `CROUCH_RUN` (12.4 / 14.8 = 0.838) runs the standing
 * blend (`FUN_00584c60`); the head line is cast at the head node as posed + 2 (`FUN_0054aa30` D:L415441-415443). The
 * port took the stance's idle head for every standing state (17.394 + 2 = 19.394), so the line met the slab; the
 * running posed head is 15.40-15.76 (research 217 s2.3), the line 17.40-17.76, under it. `WALL_HEAD_LINE_READING`
 * `'posed'` takes the head the clip the ground state plays poses (`POSED_HEAD_READING`).
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const RUN = join(DISC, 'RUN');
const HAVE = DISC !== '' && ['MP72.ZDB', 'MP2.ZDB', 'MOTION_P.ZAR', 'READERC.ZAR'].every((f) => existsSync(join(RUN, f)));
const SPOT = [569.28, 13.81, 1459.43] as const;
const YAW = 184.8;

describe.skipIf(!HAVE)(`the crouch run under MP72's warehouse lintel${HAVE ? '' : ' (SOCOM_DISC with RUN/MP72.ZDB, MP2.ZDB, MOTION_P.ZAR, READERC.ZAR absent: skipped)'}`, () => {
  /** From the spot, `stance` held, the stick `push` straight ahead for 4 s: the furthest the feet got along +z. */
  const drive = async (stance: Stance, push: number): Promise<{ z: number; posture: Stance }> => {
    const map = await loadSimMap(new FsAssetSource(DISC), 'RUN/MP72.ZDB');
    const w = new Walker(map.grid);
    w.driver = new Traversal(map.grid, groundPolygons(map.ground));
    expect(w.place(SPOT[0], SPOT[1], SPOT[2])).toBe(true);
    w.state.yaw = YAW;
    w.stance = stance;
    for (let i = 0; i < 30; i++) w.tick({ forward: 0, right: 0, boost: false });
    let z = -Infinity, posture: Stance = w.posture;
    for (let i = 0; i < 240; i++) {
      w.tick({ forward: push, right: 0, boost: false });
      if (w.state.z > z) { z = w.state.z; posture = w.posture; }
    }
    return { z, posture };
  };

  it('a crouch run (stick 1) passes under the lintel (underside 18.23 over the feet) -- the posed run head + 2 is 17.76 at most', async () => {
    const run = await drive('crouch', 1);
    expect(run.posture).toBe('stand');                           // FUN_00584c60: the crouch run stands and runs
    expect(run.z).toBeGreaterThan(1490);                         // through the doorway (with the idle head it never left 1459.43)
    expect(WALL_HEAD_LINE_READING).toBe('posed');
  }, 120_000);

  // Review F3 (2026-11-07): a partial-push crouch run, the stick in (0.8, 0.9], takes the greater of the 0.8 and 0.9
  // samples, 16.530 + 2 = 18.53, over the lintel's 18.23 -- still stopped; from 0.9 (16.006 + 2) it passes. The
  // animator's own head at 0.86 is 16.215 (18.215), so the original may pass there by 0.015: the reading over-stops.
  it('a partial-push crouch run (0.86) is still stopped by the lintel (POSED_HEAD_READING takes 16.530 there); at 0.9 it passes', async () => {
    const part = await drive('crouch', 0.86);
    expect(part.posture).toBe('stand');
    expect(part.z).toBeLessThan(1460);
    expect((await drive('crouch', 0.9)).z).toBeGreaterThan(1490);
  }, 120_000);

  it('the crouch walk (0.83) and the crawl pass as before; standing idle keeps 17.394 + 2', async () => {
    expect((await drive('crouch', 0.83)).z).toBeGreaterThan(1490);
    expect((await drive('prone', 1)).z).toBeGreaterThan(1490);
    expect(wallProbeHeights('stand')).toEqual([6.5, 17.394 + 2]);
  }, 120_000);

  // OBF-21's canopy band (the overnight plan 2026-10-30, 21:40Z; MP72, not MP2: MP2 has no floor there): at (1284.78,
  // 56.87, 1545.75) under `tent_beige`'s canopy (y 75.8-76.9) the run and the crouch run facing 0 were held by the idle
  // head line at 76.26 (moved 1.0 and 1.3 in 3 s); the run's posed head + 2 (74.63) passes under it, as the plan said
  // the original's would. The crouch walk's line (71.99 facing 0, the forward class) went down before and does still
  // (40.5).
  it('under the canopy band at (1284.78, 56.87, 1545.75), facing 0, the run and the crouch run pass; the crouch walk as before', async () => {
    const map = await loadSimMap(new FsAssetSource(DISC), 'RUN/MP72.ZDB');
    const moved = (stance: Stance, push: number): number => {
      const w = new Walker(map.grid);
      w.driver = new Traversal(map.grid, groundPolygons(map.ground));
      expect(w.place(1284.78, 56.87 + 3, 1545.75)).toBe(true);
      w.state.yaw = 0;
      w.stance = stance;
      for (let i = 0; i < 30; i++) w.tick({ forward: 0, right: 0, boost: false });
      const x0 = w.state.x, z0 = w.state.z;
      for (let i = 0; i < 180; i++) w.tick({ forward: push, right: 0, boost: false });
      return Math.hypot(w.state.x - x0, w.state.z - z0);
    };
    expect(moved('stand', 1)).toBeGreaterThan(100);
    expect(moved('crouch', 1)).toBeGreaterThan(100);
    expect(moved('crouch', 0.5)).toBeGreaterThan(30);
  }, 120_000);

  it('POSED_HEAD_READING is the port\'s animator over MOTION_P.ZAR: the head node\'s greatest height over each cycle', () => {
    const mp2 = new Uint8Array(readFileSync(join(RUN, 'MP2.ZDB')));
    const toc = parseZdb(mp2);
    const clips = clipsFromPack(new Uint8Array(readFileSync(join(RUN, 'MOTION_P.ZAR'))), PLAY_CLIPS);
    const table = motionTableFromArchive(new Uint8Array(readFileSync(join(RUN, 'READERC.ZAR'))))!;
    const REST: MoverSnapshot = {
      vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand',
      ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null,
    };
    /** The head node's greatest y over ticks 120-300 of a held snapshot (two seconds settled, three of cycles). */
    const peak = (snap: MoverSnapshot): number => {
      const sk = readSkeleton(Zar.parse(zdbMember(mp2, toc, 'CLIB_GEO.ZED')), 'seal_A_scuba');
      const anim = new Animator(sk, clips, table, { random: () => 0 });
      const head = sk.indexOf('head');
      let hi = -Infinity;
      for (let i = 0; i < 300; i++) {
        anim.step(1 / 60, snap);
        if (i >= 120) hi = Math.max(hi, sk.world[head]![13]!);
      }
      return hi;
    };
    const D = Math.SQRT1_2;
    // Each class with its two diagonals (`moveClass`: a diagonal stick plays the blend between them).
    const dirs: Record<'forward' | 'back' | 'right' | 'left', [number, number][]> = {
      forward: [[1, 0], [D, D], [D, -D]], back: [[-1, 0], [-D, D], [-D, -D]],
      right: [[0, 1], [D, D], [-D, D]], left: [[0, -1], [D, -D], [-D, -D]],
    };
    const P = POSED_HEAD_READING;
    for (const [cls, list] of Object.entries(dirs) as [keyof typeof dirs, [number, number][]][]) {
      P.stand[cls].forEach((want, i) => {
        const m = (i + 1) / 10;
        const got = Math.max(...list.map(([f, r]) => peak({ ...REST, vz: -65 * m, ground: { state: 'stand', forward: f * m, right: r * m, cls: 1 } })));
        expect(got, `stand ${cls} ${m}`).toBeCloseTo(want, 2);
      });
      const c = ({ right: 0, forward: 1, left: 2, back: 3 } as const)[cls];      // the crouch's clips follow the class
      // FUN_00582d10: the crouch plays the class's own set, no blend; the greatest over two stick lengths.
      let crouch = -Infinity;
      for (const m of [0.3, 0.8]) for (const [f, r] of list) crouch = Math.max(crouch, peak({ ...REST, stance: 'crouch', crouched: true, vz: -20, ground: { state: 'crouch', forward: f * m, right: r * m, cls: c } }));
      expect(crouch, `crouch ${cls}`).toBeCloseTo(P.crouch[cls], 2);
    }
    let prone = -Infinity;
    for (const [f, r] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      prone = Math.max(prone, peak({ ...REST, stance: 'prone', vz: -5, ground: { state: 'prone', forward: f, right: r, cls: f > 0 ? 1 : f < 0 ? 3 : r > 0 ? 0 : 2 } }));
    }
    expect(prone, 'prone').toBeCloseTo(P.prone, 2);
  }, 120_000);
});
