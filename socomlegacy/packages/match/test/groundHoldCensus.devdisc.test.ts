// @vitest-environment node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { probeGround, selectFloor, type Grid } from '@s2u/scene';
import { simMapFromBytes } from '../../viewer/src/simMap';
import { probeLiftOf, throttleFrameEnds, Walker } from '../../viewer/src/mover';
import { prepareBotNavigation } from '../src/bots/navigation';

/**
 * THE HELD-FRAME CENSUS (SCOPE-C A1 task 1; LANE-WALLS step 2; B-17 "stuck on corners and doorways"; PRODUCT TRACK: an
 * instrument, it changes nothing and pins nothing). Every map on the dev disc: the bots' walking graph built from the map
 * (`prepareBotNavigation`, the routes a body can walk), and along ROUTES of it (`walkRoute`: 60 hops, the straightest
 * way on) a plain pad-stick `Walker` at the run (stick 1) and the walk (stick 0.45, the census's choice). At each game frame's end (`throttleFrameEnds` of the tick counted from the placing) a
 * grounded body whose frame moved under `HELD_MOVE` is HELD; a run of `HELD_MIN` frames or more is listed with the map,
 * where, how long, why (FLOOR: the frame-end floor rule refused it, LATER 1148's `groundRefusals_`; WALL: the walls held
 * it with the floor taking every frame) and the floor's owner under the feet. Run on the trunk and on the walls branch,
 * the two lists diffed, so B-17's holds can be told from LATER 1194b's (the lane's step 2: "both builds, the difference
 * listed"). It reads only the Walker's public state and the refusal counter (by name, present on both builds).
 *
 * The dev disc: `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped (and said) without it. Output: JSON lines to
 * `S2U_HOLD_CENSUS_OUT` when set, a summary per map on the console either way. `S2U_HOLD_CENSUS_ROUTES` caps the
 * routes a map walks (from every k-th node, default 200); `S2U_HOLD_CENSUS_MAPS` (comma stems) narrows the maps.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const RUN = DISC ? join(DISC, 'RUN') : '';
const HAVE = !!RUN && existsSync(RUN);
const ONLY = (process.env.S2U_HOLD_CENSUS_MAPS ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const ROUTES = Math.max(1, Number(process.env.S2U_HOLD_CENSUS_ROUTES ?? 200) || 200);
const OUT = process.env.S2U_HOLD_CENSUS_OUT ?? '';
const SPEEDS = [{ name: 'run', stick: 1 }, { name: 'walk', stick: 0.45 }] as const;
const HELD_MOVE = 0.05;
const HELD_MIN = 3;
const ARRIVE = 3;
const HOPS = 60;
const STUCK = 30;
const TICKS_MAX = 3600;

interface Hold { map: string; route: number; speed: string; x: number; y: number; z: number; frames: number; cause: 'FLOOR' | 'WALL'; floor: string; ended: 'moved-on' | 'stuck' | 'time' }

const mapStems = (): string[] => (HAVE ? readdirSync(RUN) : [])
  .filter((f) => /^MP\d+\.ZDB$/i.test(f)).map((f) => f.replace(/\.ZDB$/i, '').toUpperCase())
  .filter((s) => ONLY.length === 0 || ONLY.includes(s)).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));

/**
 * One ROUTE: from node `start`, `HOPS` hops along the graph, each hop the edge whose direction keeps closest to the walk's
 * heading (ties to the lower index; never back to a node of the last `HOPS` visited), the body steered at each node in turn
 * as a pad would (the facing set toward it each tick, full or walk stick). Continuous: one placing, so doorways and corners
 * are met at speed, as a player meets them.
 */
function walkRoute(grid: Grid, map: string, route: number, nodes: readonly { at: readonly number[]; edges: readonly number[] }[], start: number, speed: typeof SPEEDS[number], holds: Hold[]): void {
  const path = [start];
  const seen = new Set([start]);
  let hx = 0, hz = 0;
  for (let k = 0; k < HOPS; k++) {
    const here = nodes[path[path.length - 1]!]!;
    let best = -1, bestDot = -Infinity;
    for (const j of here.edges) {
      if (seen.has(j)) continue;
      const dx = nodes[j]!.at[0]! - here.at[0]!, dz = nodes[j]!.at[2]! - here.at[2]!, len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const dot = k === 0 ? -j : (dx * hx + dz * hz) / len;      // the first hop: the lowest index (deterministic)
      if (dot > bestDot) { bestDot = dot; best = j; }
    }
    if (best < 0) break;
    const dx = nodes[best]!.at[0]! - here.at[0]!, dz = nodes[best]!.at[2]! - here.at[2]!, len = Math.hypot(dx, dz);
    hx = dx / len; hz = dz / len;
    path.push(best); seen.add(best);
  }
  if (path.length < 2) return;
  const from = nodes[start]!.at;
  const w = new Walker(grid);
  if (!w.place(from[0]!, from[1]! + 2 + probeLiftOf('stand'), from[2]!)) return;
  // FLOOR when the refusal counter ran or the retry's idle frame is set (the counter resets as the idle frame starts:
  // the third fresh review's F6).
  const refusals = (): number => { const o = w as unknown as { groundRefusals_?: number; groundIdle_?: boolean }; return (o.groundRefusals_ ?? 0) + (o.groundIdle_ ? 1 : 0); };
  let frameX = w.state.x, frameZ = w.state.z, run = 0, floorSeen = false, at: [number, number, number] = [0, 0, 0], aim = 1;
  const close = (ended: Hold['ended']): void => {
    if (run >= HELD_MIN) {
      const f = selectFloor(probeGround(grid, at[0], at[2]), at[1] + probeLiftOf('stand'), at[1]);
      holds.push({ map, route, speed: speed.name, x: +at[0].toFixed(2), y: +at[1].toFixed(2), z: +at[2].toFixed(2), frames: run, cause: floorSeen ? 'FLOOR' : 'WALL', floor: f?.poly.path ?? '(none)', ended });
    }
    run = 0; floorSeen = false;
  };
  for (let n = 1; n <= TICKS_MAX; n++) {
    const s = w.state;
    let to = nodes[path[aim]!]!.at;
    while (Math.hypot(to[0]! - s.x, to[2]! - s.z) < ARRIVE) {
      if (++aim >= path.length) { close('moved-on'); return; }
      to = nodes[path[aim]!]!.at;
    }
    s.yaw = (Math.atan2(-(to[0]! - s.x), -(to[2]! - s.z)) * 180) / Math.PI;   // forward is (-sin yaw, -cos yaw)
    w.tick({ forward: speed.stick, right: 0, boost: false });
    if (!throttleFrameEnds(n)) continue;
    const moved = Math.hypot(w.state.x - frameX, w.state.z - frameZ);
    frameX = w.state.x; frameZ = w.state.z;
    if (!w.airborne && moved < HELD_MOVE) {
      if (run === 0) { at = [w.state.x, w.state.y, w.state.z]; floorSeen = refusals() > 0; }
      else if (refusals() > 0) floorSeen = true;
      run++;
      if (run >= STUCK) { close('stuck'); return; }
    } else close('moved-on');
  }
  close('time');
}

describe.skipIf(!HAVE)('THE HELD-FRAME CENSUS (SCOPE-C A1; LANE-WALLS step 2): where a walk along the bots\' graph is held 3 frames or more', () => {
  it('walks every map and lists its holds (an instrument: it asserts only that it ran)', () => {
    const stems = mapStems();
    expect(stems.length).toBeGreaterThan(0);
    const all: Hold[] = [];
    const lines: string[] = [];
    for (const stem of stems) {
      const map = simMapFromBytes(new Uint8Array(readFileSync(join(RUN, `${stem}.ZDB`))), `RUN/${stem}.ZDB`);
      let nav;
      try { nav = prepareBotNavigation(map); } catch (e) { console.log(`CENSUS ${stem}: no graph (${String(e).slice(0, 120)})`); continue; }
      const nodes = nav.nodes, step = Math.max(1, Math.floor(nodes.length / ROUTES));
      const holds: Hold[] = [];
      let walked = 0;
      for (let r = 0, i = 0; r < ROUTES && i < nodes.length; r++, i += step) {
        if (nodes[i]!.edges.length === 0) continue;
        for (const speed of SPEEDS) walkRoute(map.grid, stem, r, nodes, i, speed, holds);
        walked++;
      }
      const floor = holds.filter((h) => h.cause === 'FLOOR').length, stuck = holds.filter((h) => h.ended === 'stuck').length;
      console.log(`CENSUS ${stem}: nodes ${nodes.length}, routes ${walked} x ${SPEEDS.length}; holds ${holds.length} (FLOOR ${floor}, WALL ${holds.length - floor}; stuck ${stuck})`);
      for (const h of holds) lines.push(JSON.stringify(h));
      all.push(...holds);
    }
    console.log(`CENSUS TOTAL: holds ${all.length}, FLOOR ${all.filter((h) => h.cause === 'FLOOR').length}, stuck ${all.filter((h) => h.ended === 'stuck').length}`);
    if (OUT) writeFileSync(OUT, lines.join('\n') + '\n');
  }, 3_600_000);
});
