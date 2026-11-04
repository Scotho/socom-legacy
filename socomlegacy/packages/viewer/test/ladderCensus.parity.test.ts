// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { FsAssetSource } from '@s2u/archive/node';
import { findLadders, type Ladder } from '@s2u/scene';
import { resolve } from 'node:path';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap } from '../src/loadMap';
import { groundGrid, groundPolygons } from '../src/walk';

/**
 * Frostfire's ladders (web research 86 §2.2; the movement registry's `movement.ladder.census`), pinned in
 * `golden/mp2-ladders.json` (TA.R3): every ladder `findLadders` finds by `appflags 2` in `RUN/MP2.ZDB`'s world
 * collision -- its span, cap, the side it is climbed from, its width and its owner -- to 1e-4. The unit half holds the
 * pin against the values `traversal.test.ts` asserts with no game data; the fixture half re-derives it from the MP2
 * fixture. `S2U_GOLDEN_WRITE=1` with the fixture present rewrites the pin from it.
 */

interface Golden { _source: string; ladders: Ladder[] }

const GOLDEN_URL = new URL('./golden/mp2-ladders.json', import.meta.url);
const GOLDEN = JSON.parse(readFileSync(GOLDEN_URL, 'utf8')) as Golden;
const MP2 = fixture('RUN/MP2.ZDB');
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');

/** A ladder's numbers to 1e-4, the pin's precision. */
const pinned = (l: Ladder): Ladder => ({
  x: round(l.x), z: round(l.z), bottom: round(l.bottom), top: round(l.top), capTop: round(l.capTop), nx: round(l.nx), nz: round(l.nz),
  halfWidth: round(l.halfWidth), sided: l.sided, path: l.path,
});
const round = (v: number): number => Math.round(v * 1e4) / 1e4 + 0;

function goldenText(g: Golden): string {
  return `{\n "_source": ${JSON.stringify(g._source)},\n "ladders": [\n${g.ladders.map((l) => `  ${JSON.stringify(l)}`).join(',\n')}\n ]\n}\n`;
}

describe("Frostfire's ladders against their pin (unit: no game data)", () => {
  it('pins the five ladders of research 86 section 2.2, the spans traversal.test.ts asserts, each sided with a unit normal', () => {
    expect(GOLDEN.ladders.map((l) => [Math.round(l.x), Math.round(l.z), Math.round(l.bottom), Math.round(l.top)])).toEqual([
      [548, 854, 100, 160], [783, 364, 100, 155], [497, 596, 100, 155], [989, 617, 103, 153], [159, 913, 100, 157],
    ]);
    expect(GOLDEN.ladders.every((l) => l.sided)).toBe(true);
    for (const l of GOLDEN.ladders) {
      expect(Math.hypot(l.nx, l.nz), l.path).toBeCloseTo(1, 4);
      expect(l.capTop, l.path).toBeGreaterThan(l.top);
      expect(l.halfWidth, l.path).toBeGreaterThan(0);
    }
    const sniper = GOLDEN.ladders[0]!;
    expect([sniper.x, sniper.z, sniper.bottom, sniper.top, sniper.path]).toEqual([547.5, 854.4055, 100, 160, 'worldmodel/ladsnipe/ladderdown']);
  });
});

describe(`Frostfire's ladders re-derived from the data (fixture)${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP2)("findLadders over RUN/MP2.ZDB's world collision finds the pinned ladders, in order, to 1e-4", async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const ladders = findLadders(groundPolygons(map.ground!), groundGrid(map.ground!)).map(pinned);
    if (process.env.S2U_GOLDEN_WRITE === '1') {
      writeFileSync(GOLDEN_URL, goldenText({
        _source: 'disc RUN/MP2.ZDB world collision (appflags 2) through loadMap, groundPolygons and groundGrid (packages/viewer/src/loadMap.ts, walk.ts) and findLadders (packages/scene/src/ladder.ts), each number to 1e-4; decoded from the MP2 test fixture 2026-10-10',
        ladders,
      }));
    }
    expect(ladders).toEqual(GOLDEN.ladders);
  });
});
