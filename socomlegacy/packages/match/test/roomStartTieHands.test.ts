import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POSED_RELEASE_HAND_READING, ROOM_START_TIE_RENDER_GRID_ADAPTATION } from '@s2u/scene';

/**
 * LATER 1428, the main controller's ruling "B" (2026-11-24T01:21Z): `POSED_RELEASE_HAND_READING` is re-read at the game
 * frame (k x `GAME_FRAME_DT`), but the room's start-tie (`room.ts` `throwTied`, LANE-KILL B-06, an adaptation) keeps the
 * page's samples on the 1/60 s render grid -- `ROOM_START_TIE_RENDER_GRID_ADAPTATION` -- until LATER 1428's page half
 * moves `Play.partPoint` to the game frame: no server check is loosened on a reading fix. This holds the two apart.
 */
describe('LATER 1428 (ruling B): the room start-tie keeps its render-grid hands apart from the re-read posed hand', () => {
  it('the room table is the render-grid sampling: every clip\'s frames before, at and after the release (review F5)', () => {
    expect(ROOM_START_TIE_RENDER_GRID_ADAPTATION).toEqual({
      standThrow: [[6.319, 22.051, -2.231], [4.240, 23.236, -6.407], [3.958, 22.002, -9.889]],
      standToss: [[3.498, 13.317, -10.313], [3.283, 14.040, -10.304], [3.181, 14.323, -10.294]],
      crouchThrow: [[5.284, 15.165, 1.691], [5.477, 16.404, -0.534], [5.408, 16.985, -3.021]],
      proneThrow: [[2.587, 8.025, 9.075], [3.533, 9.756, 8.542], [4.762, 11.934, 6.988]],
      proneToss: [[2.782, 8.037, -8.574], [1.892, 6.886, -8.980], [1.255, 5.870, -9.126]],
      peekRightToss: [[9.435, 9.489, -4.226], [8.888, 10.242, -4.997], [8.457, 10.801, -5.468]],
      peekLeftToss: [[-4.220, 11.975, -1.395], [-4.086, 12.033, -1.421], [-3.949, 12.092, -1.445]],
    });
  });

  it('it covers the same clips as the reading, and differs from it (the game-frame read moved the standing release)', () => {
    expect(Object.keys(ROOM_START_TIE_RENDER_GRID_ADAPTATION).sort()).toEqual(Object.keys(POSED_RELEASE_HAND_READING).sort());
    // The game-frame read's after frame reaches 14.5 ahead; the room's stays 9.9 (a forged start past a wall at 12 stays
    // refused: roomEquipment's B-06 "hand walled" case).
    expect(POSED_RELEASE_HAND_READING.standThrow![2][2]).toBeLessThan(-12);
    expect(ROOM_START_TIE_RENDER_GRID_ADAPTATION.standThrow![2][2]).toBeGreaterThan(-12);
  });

  it('the room\'s throwTied takes the render-grid table, not the reading', () => {
    const src = readFileSync(resolve(import.meta.dirname, '../src/room.ts'), 'utf8');
    const at = src.indexOf('private throwTied(');
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf('\n  }\n', at));
    expect(body).toContain('ROOM_START_TIE_RENDER_GRID_ADAPTATION[key]');
    expect(body).not.toContain('POSED_RELEASE_HAND_READING');
  });
});
