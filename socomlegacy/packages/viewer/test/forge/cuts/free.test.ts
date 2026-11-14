import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { Vector3 } from 'three';
import { checkCreatorRecord, layoutOfRecord, parseLayout, RECORD_LIMITS, recordOfLayout, type Layout } from '@s2u/creator-contracts';
import { facesOf, freeCutBox, withLayoutCuts, wordOf } from '../../../src/forge/cuts';

/**
 * FORGE CUTS, the free cut box (a browser adaptation, FG.R2): a box the layout places (`Layout.cuts`) that clips what it
 * holds out of the map, taking the surfaces its X / Y / Z faces name. Kept by the layout file and the record alike.
 */

const layout = (cuts: Layout['cuts']): Layout =>
  ({ forge: 1, base: { kind: 'map', archive: 'MP2' }, pieces: [], spawns: [], ...(cuts ? { cuts } : {}) }) as unknown as Layout;

describe('a cut box in the layout', () => {
  it('its faces: absent is all three; a word names a subset', () => {
    expect(facesOf(undefined)).toEqual({ x: true, y: true, z: true });
    expect(facesOf('xz')).toEqual({ x: true, y: false, z: true });
    expect(wordOf({ x: true, y: true, z: true })).toBeUndefined();
    expect(wordOf({ x: false, y: true, z: false })).toBe('y');
  });
  it('the record keeps its centre, turn, size, faces and lock, and refuses a flat box or a face outside xyz', () => {
    const l = layout([
      { at: [600, 154, 1002.5], yaw: Math.PI / 2, size: [14, 24, 10], faces: 'xz', locked: true },
      { at: [10, 20, 30], yaw: 0, size: [5, 6, 7] },
    ]);
    const r = recordOfLayout(l, 'cuts');
    expect(checkCreatorRecord(r)).toBeNull();
    expect(r.cuts).toEqual([[600, 154, 1002.5, 90, 14, 24, 10, 'xz', true], [10, 20, 30, 0, 5, 6, 7]]);
    const back = layoutOfRecord(r);
    expect(back.cuts![0]!.faces).toBe('xz');
    expect(back.cuts![0]!.locked).toBe(true);
    expect(back.cuts![0]!.yaw).toBeCloseTo(Math.PI / 2, 9);
    expect(back.cuts![1]).toEqual({ at: [10, 20, 30], yaw: 0, size: [5, 6, 7] });
    expect(checkCreatorRecord({ ...r, cuts: [[0, 0, 0, 0, 0, 1, 1]] })).toMatch(/cut 0/);
    expect(checkCreatorRecord({ ...r, cuts: [[0, 0, 0, 0, 1, 1, 1, 'w']] })).toMatch(/faces/);
  });
  it('the layout file keeps it too, and refuses one with no size', () => {
    const text = JSON.stringify({ forge: 1, base: { kind: 'map', archive: 'MP2' }, pieces: [], spawns: [], cuts: [{ at: [1, 2, 3], yaw: 0.5, size: [4, 5, 6], faces: 'y' }] });
    expect(parseLayout(text).cuts).toEqual([{ at: [1, 2, 3], yaw: 0.5, size: [4, 5, 6], faces: 'y' }]);
    expect(() => parseLayout(text.replace('"size":[4,5,6],', ''))).toThrow(/cut 0/);
    expect(() => parseLayout(text.replace('[4,5,6]', `[4,${RECORD_LIMITS.coord + 1},6]`))).toThrow(/cut 0/);
  });
  it('its box is centred on its place, turned by its yaw', () => {
    const b = freeCutBox({ at: [10, 5, 0], yaw: Math.PI / 2, size: [20, 4, 2] });
    // Turned a quarter, its 20 wide runs along world z.
    expect(b.max[2] - b.min[2]).toBeCloseTo(20, 6);
    expect(b.max[0] - b.min[0]).toBeCloseTo(2, 6);
    expect((b.max[1] + b.min[1]) / 2).toBeCloseTo(5, 6);
  });
});

const ISO = process.env['SOCOM_ISO'];
describe.skipIf(!ISO || !existsSync(ISO))("a cut box in Frostfire's barracks wall (SOCOM_ISO)", () => {
  it('walls only (xz): the wall opens and a SEAL walks through, the floor kept; all faces: the floor goes too', async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../../tools/fmv-spike');
    const { loadMap } = await import('../../../src/loadMap');
    const { groundGrid, groundPolygons, Walker } = await import('../../../src/mover');
    const map = await loadMap(new IsoAssetSource(fsBlob(ISO!)), 'RUN/MP2.ZDB');
    const box = { at: [616, 154, 1002.5] as [number, number, number], yaw: 0, size: [14, 24, 10] as [number, number, number] };
    const walk = (m: typeof map): number => {
      const w = new Walker(groundGrid(m.ground!));
      w.place(616, 150, 990);
      w.state.yaw = 180;
      for (let i = 0; i < 18; i++) w.tick({ forward: 0, right: 0, boost: false });
      for (let i = 0; i < 150; i++) w.tick({ forward: 1, right: 0, boost: false });
      return w.state.z;
    };
    expect(walk(map), 'the wall').toBeLessThan(1001);
    const walls = withLayoutCuts(map, [{ ...box, faces: 'xz' }]);
    expect(walls.cut).toBeGreaterThan(0);
    expect(walk(walls.map), 'through the hole').toBeGreaterThan(1010);
    const floorsNear = (m: typeof map) => groundPolygons(m.ground!).filter((p) => p.ditype === 3
      && Array.from({ length: p.points.length / 3 }, (_, i) => new Vector3(p.points[i * 3], p.points[i * 3 + 1], p.points[i * 3 + 2])).some((v) => Math.abs(v.x - 616) < 7 && Math.abs(v.z - 1002.5) < 5 && Math.abs(v.y - 142) < 1));
    expect(floorsNear(walls.map).length).toBe(floorsNear(map).length);
    // The box reaches 12 below its centre, to y 142: with all its faces on it takes the floor it stands on.
    const all = withLayoutCuts(map, [{ ...box, at: [616, 150, 1002.5] }]);
    const floorArea = (m: typeof map) => groundPolygons(m.ground!).filter((p) => p.ditype === 3).length;
    expect(floorArea(all.map)).not.toBe(floorArea(map));
  }, 180_000);
});
