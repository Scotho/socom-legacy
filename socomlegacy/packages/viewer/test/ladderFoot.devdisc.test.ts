// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findLadders, probeGround, selectFloor, type Grid, type Ladder } from '@s2u/scene';
import { simMapFromBytes } from '../src/simMap';
import { groundPolygons, Walker, type WalkInput } from '../src/walk';
import { LADDER_STANDOFF, Traversal } from '../src/traversal';

/**
 * B-50 (SCOPE-C C4; tier 1 row 7): THE LADDER CENSUS of the 22 maps. Simulation track; a measurement of the port and a
 * hold on its ladders' ending, nothing here a value of the game's.
 *
 * For every ladder `findLadders` returns on each `RUN/MP*.ZDB` of the dev disc:
 * 1. **The foot column** (data): the highest floor (`probeGround`) in the column the climber hangs in -- the span's
 *    centre, `LADDER_STANDOFF` out from the rungs -- at or under the ladder's `bottom` + 1. `floorless` when none is
 *    within 1.0 under `bottom` (printed; the Fish Hook ladder B-50 names is expected among them).
 * 2. **The climb down and the slide** (the port): a `Walker` driven by a `Traversal`, mounted from the deck (backing onto
 *    the head) or else from the foot and climbed to the span's middle, then (a) the stick back until the ladder is
 *    left, (b) mounted and climbed again and the action button's slide until it ends. HELD: on the rungs or in the
 *    slide (the mount's clip not measured) neither carries the body under `bottom` - 1 -- or under the foot column's
 *    floor - 1 where one answers within 10 under `bottom` -- and each ends within `MAX_TICKS`; (c) mounted and the stick
 *    pulled back at once, no climb first (a player's step on and straight back off), held the same way. A ladder neither mount reaches is listed as `unmounted` (said, never counted as held).
 *
 * The maps: `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped without either (a skip is said). `LF_MAPS` (comma
 * list of stems) limits the maps. Run from socomlegacy/packages/viewer:
 * `SOCOM_PC_ROOT=<desktop tree> npx vitest run test/ladderFoot.devdisc.test.ts`.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const RUN = DISC ? join(DISC, 'RUN') : '';
const ONLY = (process.env.LF_MAPS ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const STEMS = RUN && existsSync(RUN)
  ? readdirSync(RUN).filter((f) => /^MP\d+\.ZDB$/i.test(f)).map((f) => f.replace(/\.ZDB$/i, '').toUpperCase())
    .filter((s) => ONLY.length === 0 || ONLY.includes(s)).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))
  : [];

const BACK: WalkInput = { forward: -1, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const ON_LADDER = new Set(['ladderMount', 'ladderMountTop', 'ladder', 'ladderSlide']);
const MAX_TICKS = 4000;

interface Row {
  map: string; path: string; x: number; z: number; bottom: number; top: number;
  footFloor: number | null; floorless: boolean;
  mount: 'deck' | 'foot' | 'unmounted';
  down?: { lowest: number; ticks: number; held: boolean };
  slide?: { lowest: number; ticks: number; held: boolean } | 'not taken';
  /** Mounted and the stick pulled back at once (no climb first): where the mount left the body, the floor it sees, the end. */
  backAtOnce?: { mountedY: number; seen: number | null; lowest: number; ticks: number; held: boolean };
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

function footFloor(grid: Grid, l: Ladder): number | null {
  const x = l.x + l.nx * LADDER_STANDOFF, z = l.z + l.nz * LADDER_STANDOFF;
  let best: number | null = null;
  for (const h of probeGround(grid, x, z)) if (h.y <= l.bottom + 1 && (best === null || h.y > best)) best = h.y;
  return best;
}

/** Mounts `l` from its deck (backing onto the head) or else its foot; returns which, the walker on the rungs. */
function mount(grid: Grid, polys: ReturnType<typeof groundPolygons>, l: Ladder): { w: Walker; t: Traversal; how: 'deck' | 'foot' } | null {
  const face = Math.atan2(l.nx, l.nz) * 180 / Math.PI;
  const tries: Array<{ how: 'deck' | 'foot'; at: [number, number, number]; yaw: number }> = [
    { how: 'deck', at: [l.x - l.nx * 15, l.top + 1, l.z - l.nz * 15], yaw: face + 180 },
    { how: 'foot', at: [l.x + l.nx * 15, l.bottom + 1, l.z + l.nz * 15], yaw: face },
  ];
  for (const tr of tries) {
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    if (!w.place(tr.at[0], tr.at[1], tr.at[2])) continue;
    w.state.yaw = tr.yaw;
    for (let i = 0; i < 600 && t.climbPrompt()?.kind !== 'ladder'; i++) w.tick(FORWARD);
    if (t.climbPrompt()?.kind !== 'ladder') continue;
    t.action(); w.tick(FORWARD);
    for (let i = 0; i < 600 && t.state().kind !== 'ladder' && ON_LADDER.has(t.state().kind); i++) w.tick(STILL);
    if (t.state().kind === 'ladder' && Math.abs(w.state.x - l.x) + Math.abs(w.state.z - l.z) < 3 * LADDER_STANDOFF) return { w, t, how: tr.how };
  }
  return null;
}

/** The states in which the body hangs on the rungs or slides down them (the mount's clip is not measured). */
const MEASURED = new Set(['ladder', 'ladderSlide']);

function whileOnLadder(w: Walker, t: Traversal, input: WalkInput): { lowest: number; ticks: number } {
  let lowest = w.state.y, i = 0;
  for (; i < MAX_TICKS && ON_LADDER.has(t.state().kind); i++) { w.tick(input); if (MEASURED.has(t.state().kind)) lowest = Math.min(lowest, w.state.y); }
  return { lowest, ticks: i };
}

/**
 * Up the rungs at full stick to 0.4 of the span (under the head on a short ladder: Fish Hook's 40-high ones clear the
 * head ray at 0.49); false when the ladder was left on the way.
 */
function toMiddle(w: Walker, t: Traversal, l: Ladder): boolean {
  const mid = l.bottom + 0.4 * (l.top - l.bottom);
  for (let i = 0; i < 1500 && t.state().kind === 'ladder' && w.state.y < mid; i++) w.tick(FORWARD);
  return t.state().kind === 'ladder';
}

/**
 * The lowest the body may go: the ladder's `bottom`, or the floor in the foot column when one answers within 10 under
 * it (the descent then steps off on that floor, as the port's foot test reads it), less 1.
 */
const floorLimit = (l: Ladder, ff: number | null): number => (ff !== null && ff >= l.bottom - 10 && ff < l.bottom ? ff : l.bottom) - 1;

function census(stem: string): Row[] {
  const sim = simMapFromBytes(new Uint8Array(readFileSync(join(RUN, `${stem}.ZDB`))), `RUN/${stem}.ZDB`);
  const polys = groundPolygons(sim.ground), grid = sim.grid;
  const rows: Row[] = [];
  for (const l of findLadders(polys, grid)) {
    const ff = footFloor(grid, l);
    const row: Row = {
      map: stem, path: l.path, x: r2(l.x), z: r2(l.z), bottom: r2(l.bottom), top: r2(l.top),
      footFloor: ff === null ? null : r2(ff), floorless: ff === null || ff < l.bottom - 1, mount: 'unmounted',
    };
    const m = mount(grid, polys, l);
    if (m) {
      row.mount = m.how;
      const limit = floorLimit(l, ff);
      if (toMiddle(m.w, m.t, l)) {
        const d = whileOnLadder(m.w, m.t, BACK);
        row.down = { lowest: r2(d.lowest), ticks: d.ticks, held: d.lowest >= limit && d.ticks < MAX_TICKS };
      }
      const first = mount(grid, polys, l);
      if (first) {
        const y0 = first.w.state.y;
        const pick = selectFloor(probeGround(grid, first.w.state.x, first.w.state.z), y0 + 1, y0);
        const seen: number | null = pick ? pick.y : null;
        const b = whileOnLadder(first.w, first.t, BACK);
        row.backAtOnce = { mountedY: Math.round(y0 * 1e4) / 1e4, seen: seen === null ? null : Math.round(seen * 1e4) / 1e4, lowest: r2(b.lowest), ticks: b.ticks, held: b.lowest >= limit && b.ticks < MAX_TICKS };
      }
      const again = mount(grid, polys, l);
      if (again && toMiddle(again.w, again.t, l)) {
        again.t.action(); again.w.tick(STILL);
        if (again.t.state().kind === 'ladderSlide') {
          const s = whileOnLadder(again.w, again.t, STILL);
          row.slide = { lowest: r2(s.lowest), ticks: s.ticks, held: s.lowest >= limit && s.ticks < MAX_TICKS };
        } else row.slide = 'not taken';
      } else row.slide = 'not taken';
    }
    rows.push(row);
  }
  return rows;
}

describe.skipIf(STEMS.length === 0)(`B-50: every ladder of the 22 maps ends at its foot${STEMS.length ? '' : ' (no dev disc: SOCOM_DISC / SOCOM_PC_ROOT unset; SKIPPED)'}`, () => {
  const all: Row[] = [];

  it.each(STEMS)('%s: the climb down and the slide never pass under the ladder\'s bottom - 1, and end', (stem) => {
    const rows = census(stem);
    all.push(...rows);
    for (const r of rows) {
      const down = r.down ? `down lowest ${r.down.lowest} in ${r.down.ticks}${r.down.held ? '' : ' NOT HELD'}` : 'down -';
      const slide = r.slide === undefined ? 'slide -' : r.slide === 'not taken' ? 'slide not taken'
        : `slide lowest ${r.slide.lowest} in ${r.slide.ticks}${r.slide.held ? '' : ' NOT HELD'}`;
      const b = r.backAtOnce ? `back at once: mounted y ${r.backAtOnce.mountedY} floor seen ${r.backAtOnce.seen ?? 'none'} lowest ${r.backAtOnce.lowest} in ${r.backAtOnce.ticks}${r.backAtOnce.held ? '' : ' NOT HELD'}` : 'back at once -';
      console.log(`[ladderFoot] ${stem} ${r.path} (${r.x}, ${r.z}) span ${r.bottom}..${r.top} footFloor ${r.footFloor ?? 'none'}${r.floorless ? ' FLOORLESS' : ''} mount ${r.mount}; ${down}; ${slide}; ${b}`);
    }
    const failed = rows.filter((r) => r.down?.held === false || (typeof r.slide === 'object' && !r.slide.held) || r.backAtOnce?.held === false);
    expect(failed.map((r) => `${r.path} (${r.x}, ${r.z})`)).toEqual([]);
  }, 180_000);

  it('summary: ladders, floorless foot columns, unmounted (said, never counted as held)', () => {
    const floorless = all.filter((r) => r.floorless), unmounted = all.filter((r) => r.mount === 'unmounted');
    console.log(`[ladderFoot] SUMMARY maps ${new Set(all.map((r) => r.map)).size}, ladders ${all.length}, floorless foot columns ${floorless.length}, unmounted ${unmounted.length}`);
    for (const r of floorless) console.log(`[ladderFoot] FLOORLESS ${r.map} ${r.path} (${r.x}, ${r.z}) bottom ${r.bottom} footFloor ${r.footFloor ?? 'none'}`);
    for (const r of unmounted) console.log(`[ladderFoot] UNMOUNTED ${r.map} ${r.path} (${r.x}, ${r.z})`);
    // Review F3: a leg not run is said, never counted as held; and the whole census's counts are pinned (a port
    // measurement on agent/next 5c3a1ded9b's tree: 39 ladders on 14 maps, 36 mounted, 3 unmounted, 0 mounted with a leg
    // not run), so a census that stops mounting stays red. Pinned only on the full 22-map run (`LF_MAPS` unset).
    const legsNotRun = all.filter((r) => r.mount !== 'unmounted' && (r.down === undefined || r.slide === undefined || r.slide === 'not taken' || r.backAtOnce === undefined));
    for (const r of legsNotRun) {
      const legs = [r.down === undefined && 'down', (r.slide === undefined || r.slide === 'not taken') && 'slide', r.backAtOnce === undefined && 'back at once'].filter(Boolean).join(', ');
      console.log(`[ladderFoot] LEG NOT RUN ${r.map} ${r.path} (${r.x}, ${r.z}): ${legs}`);
    }
    const mounted = all.length - unmounted.length;
    console.log(`[ladderFoot] COUNTS mounted ${mounted}, unmounted ${unmounted.length}, mounted with a leg not run ${legsNotRun.length}`);
    expect(all.length).toBeGreaterThan(0);
    if (ONLY.length === 0) {
      expect([all.length, new Set(all.map((r) => r.map)).size, mounted, unmounted.length, legsNotRun.length]).toEqual([39, 14, 36, 3, 0]);
    }
  });
});
