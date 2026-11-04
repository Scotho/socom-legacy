import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  aiMapsFromZdb, ESCORTEE_BIT_READING, HOSTAGE_FACING_READING, HOSTAGE_START_LIFT_READING, HOSTAGE_TEAM_READING,
  parseEscortees, placeEscortees,
} from '../src/index';

/**
 * HX-0b (web sprint 31; research 237 s1, 190 s2.2 A2, s3.1 B1 and V2 claims 2-3): Desert Glory's three escortee records
 * off `READERM.ZAR/vehicles.rdr`, their team mask as the record parser builds it, and their starts at their named
 * points' cells.
 */

const MP6 = fixture('RUN/MP6.ZDB');

function vehicles(zdb: Uint8Array): RdrNode {
  const readerm = Zar.parse(zdbMember(zdb, parseZdb(zdb), 'READERM.ZAR'));
  const entry = readerm.root.children.find((k: { name: string }) => k.name.toLowerCase() === 'vehicles.rdr')!;
  return parseRdr(readerm.data(entry));
}

describe.skipIf(!MP6)(`Desert Glory's escortees${MP6 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("parseEscortees reads MP6's vehicles.rdr as Hostage, Hostage2, Hostage3 with mp_fem1-3, their setup points and team 17 30 31 -> 0xC0020000 (D:L400381-400401, 400443; HOSTAGE_TEAM_READING), and skips the disabled player record", () => {
    const records = parseEscortees(vehicles(MP6!));
    expect(records).toEqual([
      { name: 'Hostage', character: 'mp_fem1', point: 'hostageStart', heading: 0, teamBits: HOSTAGE_TEAM_READING },
      { name: 'Hostage2', character: 'mp_fem2', point: 'hostage2Start', heading: 0, teamBits: HOSTAGE_TEAM_READING },
      { name: 'Hostage3', character: 'mp_fem3', point: 'hostage3Start', heading: 0, teamBits: HOSTAGE_TEAM_READING },
    ]);
    expect(HOSTAGE_TEAM_READING).toBe(0xc0020000);
    expect(ESCORTEE_BIT_READING).toBe(0x20000);
    expect(records.every((r) => (r.teamBits & ESCORTEE_BIT_READING) !== 0)).toBe(true);
  });

  it("placeEscortees puts them at their cells' centre and height plus the lift: (1750.26, 50.99, 1179.72), (1770.26, 50.99, 1169.72), (1770.26, 50.99, 1239.72), yaw 0 (190 B1; HOSTAGE_START_LIFT_READING, HOSTAGE_FACING_READING); a record whose point is absent is dropped and noted", () => {
    const ai = aiMapsFromZdb(MP6!);
    const records = parseEscortees(vehicles(MP6!));
    const notes: string[] = [];
    const starts = placeEscortees(records, ai, (line) => notes.push(line));
    expect(HOSTAGE_START_LIFT_READING).toBe(1);
    expect(HOSTAGE_FACING_READING).toBe(0);
    expect(starts.map((s) => [s.name, s.character, s.loc])).toEqual([
      ['Hostage', 'mp_fem1', { map: 0, x: 104, z: 5 }],
      ['Hostage2', 'mp_fem2', { map: 0, x: 106, z: 4 }],
      ['Hostage3', 'mp_fem3', { map: 0, x: 106, z: 11 }],
    ]);
    const want = [[1750.26, 50.99, 1179.72], [1770.26, 50.99, 1169.72], [1770.26, 50.99, 1239.72]];
    starts.forEach((s, i) => {
      for (let k = 0; k < 3; k++) expect(s.at[k]).toBeCloseTo(want[i]![k]!, 2);
      expect(s.yaw).toBe(0);
      expect(s.team).toBe(HOSTAGE_TEAM_READING);
    });
    expect(notes).toEqual([]);

    const lost = placeEscortees([...records, { ...records[0]!, name: 'Hostage4', point: 'hostage4Start' }], ai, (line) => notes.push(line));
    expect(lost.map((s) => s.name)).toEqual(['Hostage', 'Hostage2', 'Hostage3']);
    expect(notes).toEqual(["escortee Hostage4: no named point 'hostage4Start' in the AI maps -- not placed"]);
  });
});
