import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAP_STILLS_TABLE, REPO, main, readStills, renderTable } from '../forge-map-stills';

/**
 * FP-15 (FP.R15; product track, a Forge start view -- the Forge has no original): the generator of
 * `packages/viewer/src/forge/mapStills.ts` from Craig's map stills (2026-11-08, build c7c4cf31e), and the table's drift
 * check against the stills in the tree (`shared/map-stills`, which lands with agent/live-cards).
 */
const STILLS_IN_TREE = join(REPO, 'shared', 'map-stills');
let dirs: string[] = [];
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = []; });

const still = (mapId: string, camera: Record<string, number>): string => JSON.stringify({ mapId, mapName: mapId, build: 'c7c4cf31e', camera, view: { camera } });
function folder(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), 'fp15-stills-'));
  dirs.push(d);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(d, name), text);
  return d;
}
const TWO = {
  'manifest.json': JSON.stringify({ maps: [{ stem: 'MP2' }, { stem: 'MP10' }] }),
  'MP10-blood-lake.json': still('MP10', { x: 1643.6092434002815, y: 58.35133900188689, z: 1385.7407919986754, yaw: 74.06058503628446, pitch: -1.516716401301488 }),
  'MP2-frostfire.json': still('MP2', { x: 1490, y: 130, z: 1680, yaw: 42.455195620186885, pitch: -11.534191874519522 }),
  'MP2-frostfire.png': 'not read',
};

describe('the Forge map stills generator (forge-map-stills, FP-15)', () => {
  it("reads each still's camera exactly, in the manifest's order, with its file name", () => {
    expect(readStills(folder(TWO))).toEqual([
      { id: 'MP2', file: 'MP2-frostfire.json', camera: { x: 1490, y: 130, z: 1680, yaw: 42.455195620186885, pitch: -11.534191874519522 } },
      { id: 'MP10', file: 'MP10-blood-lake.json', camera: { x: 1643.6092434002815, y: 58.35133900188689, z: 1385.7407919986754, yaw: 74.06058503628446, pitch: -1.516716401301488 } },
    ]);
  });
  it('writes each row with its values unrounded and its source file in a comment', () => {
    const text = renderTable(readStills(folder(TWO)));
    expect(text).toContain("  MP2: { x: 1490, y: 130, z: 1680, yaw: 42.455195620186885, pitch: -11.534191874519522 },   // MP2-frostfire.json\n");
    expect(text).toContain('  MP10: { x: 1643.6092434002815, y: 58.35133900188689, z: 1385.7407919986754, yaw: 74.06058503628446, pitch: -1.516716401301488 },   // MP10-blood-lake.json\n');
    expect(text).toMatch(/Craig's map stills, 2026-11-08, build c7c4cf31e/);
    expect(text).toMatch(/FP\.R15/);
  });
  it('refuses a still without a finite camera, a duplicate id, or a manifest that names a map with no still', () => {
    expect(() => readStills(folder({ 'MP1-a.json': still('MP1', { x: 1, y: 2, z: 3, yaw: 4 }) }))).toThrow(/MP1-a\.json.*pitch/);
    expect(() => readStills(folder({ 'MP1-a.json': JSON.stringify({ mapId: 'MP1', camera: { x: 1, y: 2, z: 3, yaw: 4, pitch: 'x' } }) }))).toThrow(/pitch/);
    expect(() => readStills(folder({ 'MP1-a.json': still('MP1', { x: 1, y: 2, z: 3, yaw: 4, pitch: 5 }), 'MP1-b.json': still('MP1', { x: 1, y: 2, z: 3, yaw: 4, pitch: 5 }) }))).toThrow(/MP1.*twice/);
    expect(() => readStills(folder({ ...TWO, 'manifest.json': JSON.stringify({ maps: [{ stem: 'MP2' }, { stem: 'MP10' }, { stem: 'MP9' }] }) }))).toThrow(/MP9/);
    expect(() => readStills(folder({ ...TWO, 'manifest.json': JSON.stringify({ maps: [{ stem: 'MP2' }] }) }))).toThrow(/MP10/);
    // The review's finding 1: a stem listed twice would write a duplicate key that --check then passes.
    expect(() => readStills(folder({ ...TWO, 'manifest.json': JSON.stringify({ maps: [{ stem: 'MP2' }, { stem: 'MP2' }, { stem: 'MP10' }] }) }))).toThrow('manifest.json names a map twice');
  });
  it('--check exits 0 on a table that matches and 1 on one that differs; a write makes it match', () => {
    const src = folder(TWO);
    const out = join(folder({}), 'mapStills.ts');
    expect(main([src, '--out', out], () => undefined)).toBe(0);
    expect(main([src, '--out', out, '--check'], () => undefined)).toBe(0);
    writeFileSync(out, readFileSync(out, 'utf8').replace('1490', '1491'));
    const said: string[] = [];
    expect(main(['--check', src, '--out', out], (l) => said.push(l))).toBe(1);
    expect(said.join('\n')).toMatch(/differs/);
    expect(main([], () => undefined)).toBe(2);
  });
  // Skipped, and said so, while shared/map-stills is not in this tree: it lands with agent/live-cards (79b122043).
  it.skipIf(!existsSync(STILLS_IN_TREE))('the committed table matches the stills in the tree (shared/map-stills) by --check [skipped while that folder is absent]', () => {
    expect(main(['--check', STILLS_IN_TREE, '--out', MAP_STILLS_TABLE], (l) => console.log(l))).toBe(0);
  });
});
