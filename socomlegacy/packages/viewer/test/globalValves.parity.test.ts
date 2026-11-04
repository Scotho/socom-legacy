// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { FsAssetSource } from '@s2u/archive/node';
import { VALVE_TYPE, type ValveEntry } from '@s2u/ui';
import { resolve } from 'node:path';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { bootValves, readGlobalValves } from '../src/originalOptions';

/**
 * `global_valves.rdr` (`RUN/READERC.ZAR`), the table `CValve_Open` (`FUN_00351d40`, the call D:L152619) loads at the
 * game's start (web research 104, 229 §1), pinned whole in `golden/global-valves.json` (TA.R3; the frontend registry's
 * `frontend.valves.defaults.table`). The unit half holds the pin's counts with no game data; the fixture half re-reads
 * the table through `readGlobalValves` and compares it with the pin row for row. `S2U_GOLDEN_WRITE=1` with the fixture
 * present rewrites the pin from it.
 */

interface Golden { _source: string; valves: ValveEntry[] }

const GOLDEN_URL = new URL('./golden/global-valves.json', import.meta.url);
const GOLDEN = JSON.parse(readFileSync(GOLDEN_URL, 'utf8')) as Golden;
const READERC = fixture('RUN/READERC.ZAR');
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');

function goldenText(g: Golden): string {
  return `{\n "_source": ${JSON.stringify(g._source)},\n "valves": [\n${g.valves.map((v) => `  ${JSON.stringify(v)}`).join(',\n')}\n ]\n}\n`;
}

describe('global_valves.rdr against its pin (unit: no game data)', () => {
  it('pins 185 valves, 65 typed PERSIST and the rest untyped, 23 of them non-zero', () => {
    expect(GOLDEN.valves.length).toBe(185);
    expect(GOLDEN.valves.filter((v) => v.type === 'PERSIST').length).toBe(65);
    expect(GOLDEN.valves.filter((v) => v.type === undefined).length).toBe(120);
    expect(GOLDEN.valves.filter((v) => v.value !== 0).length).toBe(23);
    // 184 names: the table declares room_rank_bits twice, both untyped at 0 (the rows as the disc holds them).
    expect(new Set(GOLDEN.valves.map((v) => v.name)).size).toBe(184);
    expect(GOLDEN.valves.filter((v) => v.name === 'room_rank_bits')).toEqual([{ name: 'room_rank_bits', value: 0 }, { name: 'room_rank_bits', value: 0 }]);
  });

  it('the pinned table boots 65 PERSIST valves, the untyped 120 PERM by CValve_Open\'s fallback (D:L152619)', () => {
    const valves = bootValves(GOLDEN.valves);
    const persistent = valves.persistentValves();
    expect(persistent.map((v) => v.name)).toEqual(GOLDEN.valves.filter((v) => v.type === 'PERSIST').map((v) => v.name));
    expect(persistent.find((v) => v.name === 'SecurePassword')?.value).toBe(1);
    expect(persistent.find((v) => v.name === 'GameSpeedFilter')?.value).toBe(65000);
    // the untyped rows boot at PERM (the review's low: the title's second half held, not only the PERSIST list)
    const untyped = new Set(GOLDEN.valves.filter((v) => v.type === undefined).map((v) => v.name));
    const perm = valves.all().filter((v) => v.type === VALVE_TYPE.PERM).map((v) => v.name);
    expect(new Set(perm)).toEqual(untyped);                            // 119 names: room_rank_bits declared twice
    expect(valves.all().length).toBe(184);
  });
});

describe(`global_valves.rdr re-read from the data (fixture)${READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!READERC)("readGlobalValves reads RUN/READERC.ZAR's table row for row as the pin holds it", async () => {
    const valves = await readGlobalValves(new FsAssetSource(FIXTURES));
    if (process.env.S2U_GOLDEN_WRITE === '1') {
      writeFileSync(GOLDEN_URL, goldenText({
        _source: 'disc RUN/READERC.ZAR global_valves.rdr through readGlobalValves (packages/viewer/src/originalOptions.ts: readZarMembers, parseRdr, globalValvesOf), the table\'s order and type words; decoded from the READERC.ZAR test fixture 2026-10-10',
        valves,
      }));
    }
    expect(valves).toEqual(GOLDEN.valves);
  });
});
