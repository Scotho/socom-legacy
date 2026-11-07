import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, Zar, zdbMember } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { aiMapsFromZdb, parseAiMaps, parseEscortees, placeEscortees, type EscorteeRecord } from '../src/index';
import { syntheticAiMaps } from './syntheticAiMaps';

// The geometry is synthetic; expected yaw is the source's eight heading cases plus its placement half-turn.
// FUN_002b28d0 D:L155825-155826 -> FUN_00518ea0 D:L386398-386441 (research 237 section 1.3).
const ai = parseAiMaps(syntheticAiMaps());
const record: EscorteeRecord = { name: 'Hostage', character: 'mp_fem1', point: 'PlayerStart', heading: 0, teamBits: 0xc0020000 };

it.each([[0, 0], [1, 315], [2, 270], [3, 225], [4, 180], [5, 135], [6, 90], [7, 45]])(
  'setup heading %i places the escortee at yaw %i', (heading, yaw) => {
    const notes: string[] = [];
    const placed = placeEscortees([{ ...record, heading }], ai, note => notes.push(note));
    expect(placed).toHaveLength(1);
    expect(placed[0]!.yaw).toBe(yaw);
    expect(notes).toEqual([]);
  },
);

it.each([8, 255, -1])('unrecognized byte heading %i follows the original default yaw', heading => {
  const notes: string[] = [];
  expect(placeEscortees([{ ...record, heading }], ai, note => notes.push(note))[0]!.yaw).toBe(0);
  expect(notes).toEqual([]);
});

it('passes the setup heading through the original byte argument', () => {
  expect(placeEscortees([{ ...record, heading: 0x106 }], ai)[0]!.yaw).toBe(90);
});

for (const stem of ['MP71', 'MP53']) {
  const bytes = fixture(`RUN/${stem}.ZDB`);
  describe.skipIf(!bytes)(`${stem} authored escortee facing${bytes ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    it('places its heading-6 first hostage or VIP at yaw 90, retaining the other two at yaw 0', () => {
      const readerm = Zar.parse(zdbMember(bytes!, parseZdb(bytes!), 'READERM.ZAR'));
      const entry = readerm.root.children.find(k => k.name.toLowerCase() === 'vehicles.rdr')!;
      const records = parseEscortees(parseRdr(readerm.data(entry)));
      expect(records.map(r => r.heading)).toEqual([6, 0, 0]);
      const notes: string[] = [];
      const starts = placeEscortees(records, aiMapsFromZdb(bytes!), note => notes.push(note));
      expect(starts.map(s => s.yaw)).toEqual([90, 0, 0]);
      expect(notes).toEqual([]);
    });
  });
}
