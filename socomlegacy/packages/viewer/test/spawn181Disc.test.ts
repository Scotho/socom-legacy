import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeGround } from '@s2u/scene';
import { simMapFromBytes } from '../src/simMap';
import { probeLiftOf, Walker } from '../src/mover';   // probeLiftOf: the F3 rests are placed, not spawned

/**
 * L208 (ATLAS's reviewed record socomlegacy/docs/atlas/captures/mp64-spawn-r0004.md, agent/spc-atlas f70d8ff869, finding 1;
 * a capture of r0004, PCSX2): Shadow Falls respawn 181. The game's own respawn seeds the body at (1386.037, 10.210,
 * 2435.000), posture word 0 (standing), and lands it in that same update on the BED at (1387.826, 9.324, 2436.291),
 * normal (0, 1, 0); no read holds a y over 10.21. The port's placement took worldmodel/inv_di (material 3, normal y 0.067)
 * at 18.16 -- 8.84 over the bed -- pushed the body ~6.5 off the face over ticks 3-4 and dropped it 8.84 by tick 20.
 * WHY (seat-kill's key-job read, pilot/kill/keyjob-l208-faceprobe.md; r0004 0x2fa140 + its micro-programs, 0x555800,
 * 0x5bc180; r0001 FUN_002d3030, FUN_005506a0 D:L417822-417826; a reading, pending review): nothing refuses inv_di -- the
 * face passes every test and the pick would take it AT the seed column, as the port does. The original's update runs the
 * movement step FIRST (its walls push the body 2.206 off the face along the face's horizontal normal (0.811, 0.585)),
 * builds the probe's record from the MOVED position, THEN picks: there inv_di is no longer over the point, the bed is.
 */
const DISC = process.env.SOCOM_DISC;
const HAVE_MP64 = !!DISC && existsSync(join(DISC, 'RUN', 'MP64.ZDB'));
/**
 * The seed: the record's x/z and its CELL's y + 1 (10.210), as r0004 seeds it (ATLAS's R3-4..R3-6) -- and as Room.spawn
 * now seeds (`SpawnSlot.cellY` + SPAWN_LIFT; a342cbaf82). Before, it seeded at the slot's FLOOR y + 1 (10.321), which left
 * the push 0.007 short (seat-kill's first review F2, closed).
 */
const SEED = { x: 1386.037, y: 10.21, z: 2435.0 };
/** Record 181's OWN yaw: Room.spawn's -step x 45 (its step -2), 90. The fix holds at it; the outcome depends on it (yaw 0
 * pushes 1.10; 180 and 270 point the head line away and the pick takes inv_di at 18.16, as r0004's order would). */
const SEED_YAW = 90;
const BED_R0004 = 9.324;
/** The original's placing row after the respawn's first update (standing; R3-4..R3-6 identical). */
const PLACED_R0004 = { x: 1387.826, y: 9.324, z: 2436.291 };

describe.skipIf(!HAVE_MP64)(`L208: Shadow Falls respawn 181 lands on the bed${HAVE_MP64 ? '' : ' (SOCOM_DISC with RUN/MP64.ZDB absent)'}`, () => {
  // The rest pinned below is STANDING: r0004's body crouches by its second update and the crouch clip carries it ~1.7
  // (LATER 1402, spawn crouched; ATLAS finding 2-3); this case pins the first frame's placing row, not the original's rest.
  it('a standing body spawned at the seed is on the bed at the original placing row after the first game frame', () => {
    const sim = simMapFromBytes(new Uint8Array(readFileSync(join(DISC!, 'RUN', 'MP64.ZDB'))), 'RUN/MP64.ZDB');
    // The column still holds both faces (so the case still discriminates).
    const hits = probeGround(sim.grid, SEED.x, SEED.z);
    expect(hits.some((h) => h.poly.path === 'worldmodel/inv_di' && Math.abs(h.y - 18.16) < 0.01), 'inv_di over the seed').toBe(true);
    expect(hits.some((h) => Math.abs(h.y - BED_R0004) < 0.01 && h.normal[1] > 0.999), 'the bed under it').toBe(true);
    const w = new Walker(sim.grid);
    // The spawn's seed (record + 1) facing the record's yaw: 90 here (the head line's put-out depends on it: at yaw 0 the
    // same rule pushes 1.10, not 2.206 -- seat-kill's order read).
    expect(w.seed(SEED.x, SEED.y, SEED.z)).toBe(true);
    w.state.yaw = SEED_YAW;
    // The first game frame: from the placing the port's ground frames end on THROTTLE-FRAME's count, the first one three
    // ticks long here; its walls are met over the frame and taken whole at its end (LATER 1148, 1194). The fresh review's
    // F1: its BETWEEN ticks hold at the seed -- no pick at a part-moved column (a seed deeper in a leaning face would stand
    // on it there) -- so the first pick is the frame end's, from the moved position, as r0004's one move a frame.
    for (let i = 0; i < 2; i++) {
      w.tick({ forward: 0, right: 0, boost: false });
      expect([w.state.x, w.state.y, w.state.z], `between tick ${i + 1}: held at the seed`).toEqual([SEED.x, SEED.y, SEED.z]);
    }
    w.tick({ forward: 0, right: 0, boost: false });
    expect(w.state.y, 'on the bed').toBeCloseTo(PLACED_R0004.y, 2);
    expect(Math.hypot(w.state.x - PLACED_R0004.x, w.state.z - PLACED_R0004.z), 'at the original placing row (across)').toBeLessThan(0.05);
    for (let i = 0; i < 60; i++) w.tick({ forward: 0, right: 0, boost: false });
    expect(Math.hypot(w.state.x - PLACED_R0004.x, w.state.z - PLACED_R0004.z), 'and stays there, still').toBeLessThan(0.05);
    expect(w.state.y, 'on the bed, never on inv_di').toBeCloseTo(PLACED_R0004.y, 2);
  });

  it('a null pick holds the body at its seed: r0004 refuses nothing at a spawn (seat-kill withdrew its review F4)', () => {
    // MP8 respawn 0/326 is the case on the disc (seat-kill's read, kill/keyjob-l208-mp8-mp64-read.md; the sweep's pin); here
    // the rule itself: seeded 1000 under every floor, the first frame's pick is null (nothing at or under the origin + 1, the
    // lowest over the feet + 20) and the miss branch (r0004 0x5b63d0-0x5b6468) keeps the body at the stored record, the seed.
    const sim = simMapFromBytes(new Uint8Array(readFileSync(join(DISC!, 'RUN', 'MP64.ZDB'))), 'RUN/MP64.ZDB');
    const w = new Walker(sim.grid);
    expect(w.seed(SEED.x, -1000, SEED.z), 'every floor more than 20 over the feet: still seeded').toBe(true);
    for (let i = 0; i < 60; i++) w.tick({ forward: 0, right: 0, boost: false });
    expect([w.state.x, w.state.y, w.state.z], 'held at the seed').toEqual([SEED.x, -1000, SEED.z]);
    // The port's one guard: a column with no face at all (off the map) is refused and nothing moves.
    const before = [w.state.x, w.state.y, w.state.z];
    expect(w.seed(-1e6, 0, -1e6), 'no face in the column').toBe(false);
    expect([w.state.x, w.state.y, w.state.z]).toEqual(before);
  });

  it('MP8 respawn 0/326: seeded at its CELL y + 1 (19.096), no line hits, the pick is null, and the body holds at the seed', async () => {
    // seat-kill's read (kill/keyjob-l208-mp8-mp64-read.md; reading, pending review; a capture proves it): the record's cell
    // y is 18.096; the port's slot y 102.862 is placeSpawnSlots' fallback pick on a near-vertical face 84.8 up. Room.spawn
    // seeds at SpawnSlot.cellY + 1 as r0004's TeleportTo.
    const mp8 = join(DISC!, 'RUN', 'MP8.ZDB');
    if (!existsSync(mp8)) return;
    const { loadSimMap } = await import('../src/simMap');
    const { FsAssetSource } = await import('@s2u/archive/node');
    const map = await loadSimMap(new FsAssetSource(DISC!), 'RUN/MP8.ZDB');
    const r = map.respawns.find((q) => q.side === 0 && q.index === 326)!;
    expect(r.position[1], 'the slot y: the fallback pick').toBeCloseTo(102.862, 2);
    expect(r.cellY!, 'the cell y').toBeCloseTo(18.096, 2);
    const w = new Walker(map.grid);
    expect(w.seed(r.position[0], r.cellY! + 1, r.position[2])).toBe(true);
    w.state.yaw = 135;
    for (let i = 0; i < 120; i++) w.tick({ forward: 0, right: 0, boost: false });
    expect(w.state.x).toBeCloseTo(1065.848, 2);
    expect(w.state.y, 'held at the seed').toBeCloseTo(19.096, 2);
    expect(w.state.z).toBeCloseTo(484.239, 2);
  }, 120_000);

  it('F3: at the rest a crouch press is taken (the original crouches there by itself, and a crouched body rests there)', () => {
    // The record's F3: at respawn 181's rest the port's stance stayed stand, the request pending, for 300 ticks. Both rests:
    // the original's (crouched, 1392.394 / 9.324 / 2439.893) and the port's (standing, 1391.552 / 9.321 / 2438.980).
    const sim = simMapFromBytes(new Uint8Array(readFileSync(join(DISC!, 'RUN', 'MP64.ZDB'))), 'RUN/MP64.ZDB');
    for (const [x, y, z] of [[1392.394, 9.324, 2439.893], [1391.552, 9.321, 2438.98]] as const) {
      const w = new Walker(sim.grid);
      expect(w.place(x, y + probeLiftOf('stand'), z), `placed at ${x}, ${z}`).toBe(true);
      w.settle();
      for (let i = 0; i < 30; i++) w.tick({ forward: 0, right: 0, boost: false });
      w.requestStance('crouch');
      for (let i = 0; i < 300; i++) w.tick({ forward: 0, right: 0, boost: false });
      expect(w.stance, `the stance at ${x}, ${z} after a crouch press`).toBe('crouch');
    }
  });
});
