import { describe, expect, it } from 'vitest';
import type { AiLoc } from '@s2u/scene';
import { coverCell, type FleeNav } from '../src/hostageDanger';

/**
 * LATER 1226 (research 445 s5; simulation track, reading, pending review; the review's F5): the cover search's rules one
 * by one on synthetic grids -- `FUN_00536c80`'s flood (D:L402793-403000) and the callback 0x53a5e0 (D:L404560-404590).
 * A cell's word is its kind (bits 0-4) and bit 7; centres 10 u apart (`point`); x east, z south, as the AI grid's.
 */

const OPEN = 1, WALL = 0, CLOSED_NOT_BLOCKER = 9, MARKED = 128;
function grid(cells: Record<string, number>, fill: number | null = OPEN, size = 60, offsets: Record<string, number> = {}): Required<FleeNav> {
  const word = (l: AiLoc): number | null => {
    if (l.x < 0 || l.z < 0 || l.x >= size || l.z >= size) return null;
    return cells[`${l.x},${l.z}`] ?? fill;
  };
  return {
    word,
    traversable: (l) => { const w = word(l); return w !== null && ![0, 8, 9, 10].includes(w & 31); },
    point: (l) => [l.x * 10 + 5, 0, l.z * 10 + 5],
    markerOffset: (l) => offsets[`${l.x},${l.z}`] ?? null,
  };
}
const at = (x: number, z: number): AiLoc => ({ map: 0, x, z });
const FAR_WEST = [-10000, 0, 55], FAR_NORTH = [55, 0, -10000], FAR_SOUTH = [45, 0, 10000];

describe('LATER 1226: the cover search, rule by rule (FUN_00536c80, callback 0x53a5e0)', () => {
  it('the answer is the POPPED cell beside the blocker, not the blocker; the start itself can be it', () => {
    expect(coverCell(grid({ '4,5': WALL }), at(5, 5), FAR_WEST)).toEqual(at(5, 5));
  });

  it('a blocker is accepted only when the landing lies beyond it in the step\'s own direction; a rejected one is NOT marked and is offered again from another cell', () => {
    // the wall at (4,5); the landing far south of it: from the start (step west) it is rejected; from (4,4) (step south) accepted
    expect(coverCell(grid({ '4,5': WALL }), at(5, 5), FAR_SOUTH)).toEqual(at(4, 4));
  });

  it('kind 9 and an open bit-7 cell are neither crossed nor accepted', () => {
    const corridor = (mid: number) => grid({ '5,5': OPEN, '4,5': mid, '3,5': WALL }, CLOSED_NOT_BLOCKER);
    expect(coverCell(corridor(OPEN), at(5, 5), FAR_WEST), 'control: crossed, then cover at (4,5)').toEqual(at(4, 5));
    expect(coverCell(corridor(OPEN | MARKED), at(5, 5), FAR_WEST), 'bit 7: not crossed').toBeNull();
    expect(coverCell(corridor(CLOSED_NOT_BLOCKER), at(5, 5), FAR_WEST), 'kind 9: not crossed, not cover').toBeNull();
  });

  it('the neighbour order (0x64f910: N, NE, E, SE, S, SW, W, NW) decides between two equal covers: the earlier queued wins', () => {
    // walls north of (6,5) and of (4,5); north of the start is kind 9; the landing far north: (6,5) (queued as E) before (4,5) (as W)
    const g = grid({ '5,4': CLOSED_NOT_BLOCKER, '6,4': WALL, '4,4': WALL });
    expect(coverCell(g, at(5, 5), FAR_NORTH)).toEqual(at(6, 5));
  });

  it('at most (2 x depth)^2 pops: a cover 12 cells off is out of reach at depth 10 (400 pops), within it at depth 13 (676)', () => {
    const g = grid({ '18,30': WALL });                              // 12 cells west of the start (30,30); the landing far west
    expect(coverCell(g, at(30, 30), [-10000, 0, 305], 10)).toBeNull();
    expect(coverCell(g, at(30, 30), [-10000, 0, 305], 13)).toEqual(at(19, 30));
  });

  it('off the map is skipped; an open grid with no blocker answers nothing', () => {
    expect(coverCell(grid({}, OPEN, 8), at(4, 4), FAR_WEST)).toBeNull();
  });

  // HOSTAGE_COVER_MARKER_CENTRE_READING: the callback takes the blocker's octant from FUN_00518900 (D:L386144-386197;
  // r0004 FUN_00518bc0, D4:L423200-423253): the cell centre, moved 0.75 (DAT_0065b030; r0004 DAT_0065b090) along
  // GetDirVec (FUN_00519130) of the marker's direction nibble when the cell has bit 7 and the nibble is not 8.
  // The wall (4,5), centre (45, 55); the landing 10 u west and 4.3 u north of it: 23.3 degrees off west, so its
  // plain-centre octant is NW (7) and the cover is (5,6), the cell south-east of it. Moved 0.75 north (nibble 0) or
  // north-east (nibble 1), the landing is under 22.5 degrees off west: octant W (6), accepted from the start (5,5).
  const NEAR_WNW = [35, 0, 50.7];
  it('a bit-7 blocker\'s centre moves 0.75 along its marker\'s direction before the octant is taken', () => {
    const marked = (offset: number | null) => grid({ '4,5': WALL | MARKED }, OPEN, 60, offset === null ? {} : { '4,5': offset });
    expect(coverCell(marked(null), at(5, 5), NEAR_WNW), 'no marker record: the plain centre').toEqual(at(5, 6));
    expect(coverCell(marked(8), at(5, 5), NEAR_WNW), 'nibble 8, no direction: the plain centre').toEqual(at(5, 6));
    expect(coverCell(marked(0), at(5, 5), NEAR_WNW), 'nibble 0: 0.75 north').toEqual(at(5, 5));
    expect(coverCell(marked(1), at(5, 5), NEAR_WNW), 'nibble 1: 0.75 x 0.7071 north and east').toEqual(at(5, 5));
  });

  // Tight landings (the review's F1), each d u north of the wall's centre and 10 u west; W (accepted at the start) is
  // under 22.5 degrees off west, tan 0.41421:
  //  - d 4.7921, nibble 0 (N): W needs a move over 0.65 -- 0.75 is W, 0.5 would be NW;
  //  - d 3.2921, nibble 4 (S): NW needs a move over 0.85 -- 0.75 stays W, 1.0 would be NW;
  //  - d 4.3, nibble 2 (E): 0.75 east is W (21.8 deg); west instead (the x sign swapped) would be NW;
  //  - d 4.52, nibble 7 (NW): with the 0.7071 factor NW (22.85 deg); without it W (22.17 deg);
  //  - d 4.52, nibble 15: FUN_00519130's default, north unscaled -- W (20.66 deg); as NW x 0.7071 it would be NW.
  const north = (d: number): number[] => [35, 0, 55 - d];
  const one = (nibble: number, d: number): AiLoc | null => coverCell(grid({ '4,5': WALL | MARKED }, OPEN, 60, { '4,5': nibble }), at(5, 5), north(d));
  it('the move is 0.75, its x sign east-positive, a diagonal scaled 0.70710677, and a nibble 9..15 north unscaled', () => {
    expect(one(0, 4.7921), 'N, the scale over 0.65').toEqual(at(5, 5));
    expect(one(4, 3.2921), 'S, the scale under 0.85').toEqual(at(5, 5));
    expect(one(2, 4.3), 'E: the centre moves +x').toEqual(at(5, 5));
    expect(one(7, 4.52), 'NW: the diagonal factor').toEqual(at(5, 6));
    expect(one(15, 4.52), 'nibble 15: north, unscaled').toEqual(at(5, 5));
  });

  it('a blocker without bit 7 keeps the plain centre whatever a record says (HasAction, FUN_00516920)', () => {
    expect(coverCell(grid({ '4,5': WALL }, OPEN, 60, { '4,5': 0 }), at(5, 5), NEAR_WNW)).toEqual(at(5, 6));
  });

  it('HOSTAGE_COVER_VISITED_READING: the flood clears its visited bits at its end, so a second search answers as the first', () => {
    const g = grid({ '4,5': WALL });
    expect(coverCell(g, at(5, 5), FAR_SOUTH)).toEqual(at(4, 4));
    expect(coverCell(g, at(5, 5), FAR_SOUTH)).toEqual(at(4, 4));
  });
});
