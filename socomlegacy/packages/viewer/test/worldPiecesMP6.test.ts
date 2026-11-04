import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap, type LoadedMap, type LoadedMesh } from '../src/loadMap';

/**
 * #432, taken over (OT.R69; the merge controller's pins), on Desert Glory's own data (the MP6 fixture): a swapped level
 * piece changes only the draw. The same map loaded plain and with every level piece it can ask for (the 128-id cap) must
 * read the same collision lines, the same movement grid (`ground`), the same doors and the same actions; and every world
 * draw that moves or breaks (an alternate state, a switch path) is left on the disc's draw, the ids asked for it reported
 * as kept and never swapped.
 */
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures');
const MP6 = fixture('RUN/MP6.ZDB');

/** The world draws that move or break, as comparable records (texture, flags, positions). */
const moving = (map: LoadedMap): string[] => map.world
  .filter((m: LoadedMesh) => m.alternate || (m as { switchPath?: string }).switchPath)
  .map((m) => `${m.textureName}|${m.alternate}|${(m as { switchPath?: string }).switchPath ?? ''}|${m.positions.length}|${Array.from(m.positions.slice(0, 6)).join(',')}`)
  .sort();

describe.skipIf(!MP6)(`#432's level pieces on MP6: the draw only${!MP6 ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('collision, the grid, the doors and the actions read the disc with and without the pieces; what moves or breaks keeps its draw', async () => {
    const source = new FsAssetSource(FIXTURES);
    const plain = await loadMap(source, 'RUN/MP6.ZDB');
    const listed = await loadMap(source, 'RUN/MP6.ZDB', undefined, { listWorldPieces: true });
    const ids = (listed.worldPieceList ?? []).map((piece) => piece.key).slice(0, 128);
    expect(ids.length).toBeGreaterThan(10);
    const swapped = await loadMap(source, 'RUN/MP6.ZDB', undefined, { worldPieces: ids });

    // The swap is real: some level pieces left the merged draw.
    expect(swapped.worldSwaps?.length ?? 0).toBeGreaterThan(0);
    // Collision and the movement grid: byte for byte.
    expect(Array.from(swapped.collision.positions)).toEqual(Array.from(plain.collision.positions));
    expect(Array.from(swapped.collision.colors)).toEqual(Array.from(plain.collision.colors));
    expect(Array.from(swapped.ground!.points)).toEqual(Array.from(plain.ground!.points));
    expect(Array.from(swapped.ground!.fields)).toEqual(Array.from(plain.ground!.fields));
    // The doors (their polygons, nodes, swings) and the map's actions (switches included).
    expect(JSON.stringify(swapped.doors ?? [])).toBe(JSON.stringify(plain.doors ?? []));
    expect(JSON.stringify(swapped.actions ?? [])).toBe(JSON.stringify(plain.actions ?? []));
    // What moves or breaks keeps the disc's draw: the same alternate-state and switch-path draws as the plain load.
    expect(moving(swapped)).toEqual(moving(plain));
    // The review's F1: every swap leaves at least one world draw out -- a piece that draws only props (`cdoor1`, the
    // breakable beer, the lights) is never swapped, only named.
    for (const swap of swapped.worldSwaps ?? []) expect(swap.cells.length, swap.id).toBeGreaterThan(0);
    expect(swapped.worldPiecesPropsOnly ?? []).toContain('world:cdoor1#0');
    // The kept ids are reported, and none of them is swapped.
    const kept = swapped.worldPiecesKept ?? [];
    const swappedIds = new Set((swapped.worldSwaps ?? []).map((swap) => swap.id));
    for (const id of kept) expect(swappedIds.has(id), id).toBe(false);
    for (const id of swapped.worldPiecesPropsOnly ?? []) expect(swappedIds.has(id), id).toBe(false);   // the re-check's 2
    if (moving(plain).length > 0) expect(kept.length).toBeGreaterThan(0);
  }, 120_000);
});
