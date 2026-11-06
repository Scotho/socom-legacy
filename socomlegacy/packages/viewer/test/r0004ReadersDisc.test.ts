// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { applyR0004MapPatch, flattenScene, parseSceneGraph, R0004_MAP_EDITS, worldCollision, type SceneNode } from '@s2u/scene';
import { effectsFromDisc } from '../src/effectData';
import { readMapActions } from '../src/mapActions';
import { soundFromDisc } from '../src/soundData';

/**
 * LATER 707 (research 383 §5; G1's fresh reviews 1's F3 and 2's N1), dev-disc: the page's other readers of a map's scene
 * graph read it with r0004's edits, as `loadMap.ts` `place`, `simMap.ts` and `forgeSimMap.ts` do -- each through
 * `applyR0004MapPatch` right after its parse -- so what they place stands where the page draws and the room collides:
 *
 * - `effectData.ts` `effectsFromDisc`: the ambient effects' scene nodes (`sceneNodes`, the first realised node of the
 *   name, as `flattenScene` walks);
 * - `mapActions.ts` `readMapActions`, when no graph is handed in (`loadMap.ts`'s fallback): each action's node path and
 *   place;
 * - `soundData.ts` `soundFromDisc`: the zAnim emitters' nodes, and the surfaces its banks are chosen by (each polygon's
 *   material and floor bit, `worldCollision`).
 *
 * Every r0004 level on the disc; skipped without `SOCOM_DISC`, a skip being said.
 */
const DISC = process.env.SOCOM_DISC ?? '';
const RUN = DISC ? resolve(DISC, 'RUN') : '';
const LEVELS = Object.keys(R0004_MAP_EDITS).map((id) => id.toUpperCase()).filter((stem) => RUN && existsSync(resolve(RUN, `${stem}.ZDB`)));

function graphs(stem: string): { bytes: Uint8Array; base: SceneNode[]; patched: SceneNode[] } {
  const bytes = new Uint8Array(readFileSync(resolve(RUN, `${stem}.ZDB`)));
  const toc = parseZdb(bytes);
  const read = (): SceneNode[] => parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`)));
  const patched = read();
  applyR0004MapPatch(patched, stem);
  return { bytes, base: read(), patched };
}

/** The first realised node of each name, its world matrix (`flattenScene` order): what the three readers look up. */
function firstByName(models: SceneNode[], lower = false): Map<string, number[]> {
  const at = new Map<string, number[]>();
  for (const f of flattenScene(models)) {
    const name = lower ? f.node.name.toLowerCase() : f.node.name;
    if (!at.has(name)) at.set(name, Array.from(f.world));
  }
  return at;
}

/** The same matrix, or the node absent from both (Vigilance's `pipe`: `soundData.ts` `emitterPosition`). */
const same = (a: readonly number[] | undefined, b: readonly number[] | undefined): boolean =>
  a === undefined || b === undefined ? a === b : a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

describe.skipIf(LEVELS.length === 0)(`LATER 707: the page's other graph readers take r0004's edits${LEVELS.length ? '' : ' (SOCOM_DISC absent: skipped)'}`, () => {
  it(`effectData: every ambient effect's node at its patched place (${LEVELS.length} levels)`, async () => {
    const off: string[] = [], moved: string[] = [];
    for (const stem of LEVELS) {
      const { base, patched } = graphs(stem);
      const want = firstByName(patched), was = firstByName(base);
      const data = await effectsFromDisc(new FsAssetSource(DISC), `RUN/${stem}.ZDB`, stem);
      for (const [name, world] of data.sceneNodes) {
        if (!same(world, want.get(name))) off.push(`${stem} ${name}`);
        if (!same(was.get(name), want.get(name))) moved.push(`${stem} ${name}`);
      }
    }
    console.log(`LATER 707 effectData: ambient nodes r0004 moves: ${moved.length ? moved.join(', ') : 'none'}; read off the patched place: ${off.length}`);
    expect(off).toEqual([]);
    // As read, no ambient effect sits at a node r0004 moves: the patch changes no position here (the reader takes it for
    // one path with the draw).
    expect(moved).toEqual([]);
  }, 600_000);

  it('readMapActions without a graph: the patched graph\'s actions, path and place', () => {
    const off: string[] = [], moved: string[] = [];
    for (const stem of LEVELS) {
      const { bytes, base, patched } = graphs(stem);
      const toc = parseZdb(bytes);
      const own = readMapActions(bytes, toc, stem).actions;
      const want = readMapActions(bytes, toc, stem, patched).actions;
      const was = readMapActions(bytes, toc, stem, base).actions;
      const key = (a: { node: string; path: string; at: readonly number[] }): string => `${a.node} ${a.path} ${a.at.join(',')}`;
      if (JSON.stringify(own.map(key)) !== JSON.stringify(want.map(key))) off.push(stem);
      if (JSON.stringify(was.map(key)) !== JSON.stringify(want.map(key))) moved.push(`${stem} (${want.filter((a, i) => key(a) !== key(was[i]!)).map((a) => a.node).join(', ')})`);
    }
    console.log(`LATER 707 readMapActions: levels whose actions r0004 moves: ${moved.length ? moved.join('; ') : 'none'}; read unpatched: ${off.join(', ') || 'none'}`);
    expect(off).toEqual([]);
    // As read, no action node is moved or shadowed by r0004: the patch changes no action here.
    expect(moved).toEqual([]);
  });

  it('soundData: no emitter r0004 moves; the surfaces its banks are chosen by change on MP2 and MP11 only', async () => {
    const movedEmitters: string[] = [], surfaces: string[] = [];
    for (const stem of LEVELS) {
      const { base, patched } = graphs(stem);
      const want = firstByName(patched), was = firstByName(base);
      const data = await soundFromDisc(new FsAssetSource(DISC), `RUN/${stem}.ZDB`, stem);
      for (const e of data.emitters) if (!same(was.get(e.node), want.get(e.node))) movedEmitters.push(`${stem} ${e.node}`);
      // The banks are chosen by each polygon's (material, floor bit) pairs (`floors`, `surfaces`): the same set either way,
      // or the read moves.
      const pairs = (models: SceneNode[]): string[] => [...new Set(worldCollision(models).map((p) => `${p.material}:${p.ditype & 1}`))];
      const before = new Set(pairs(base));
      const added = pairs(patched).filter((k) => !before.has(k));
      if (added.length) surfaces.push(`${stem} +${added.join(' +')}`);
    }
    console.log(`LATER 707 soundData: emitters r0004 moves: ${movedEmitters.join(', ') || 'none'}; surfaces r0004 adds: ${surfaces.join('; ') || 'none'}`);
    expect(movedEmitters).toEqual([]);
    // MP2's r0004 floor is PLASTER (39), a floor material MP2 had not (its step sounds wanted); MP11's material 0 floor is its
    // DefaultMaterial `none`, UNKNOWN (no sounds).
    expect(surfaces).toEqual(['MP11 +0:1', 'MP2 +39:1']);
  }, 600_000);

  it.skipIf(!LEVELS.includes('MP2'))('soundData on MP2: r0004\'s PLASTER floor wants its footsteps (borrowed, as any floor\'s are)', async () => {
    // r4 0x2e47f0's node (`R0004_MAP_EDITS.mp2`): floors of material 39 (PLASTER), which no floor of MP2's own is; the
    // page wants a floor's step, stealth step, crawl and landing (`floors`), and MP2's banks lack PLASTER's, so
    // `borrowMissing` (its own PLACEHOLDER) lends them from MP71's ambience bank -- as it lends TIN's already.
    const data = await soundFromDisc(new FsAssetSource(DISC), 'RUN/MP2.ZDB', 'MP2');
    const lent = data.banks.find((b) => b.file === 'MP71_am.bnk')?.only ?? [];
    expect(lent).toEqual(expect.arrayContaining(['.STEP_PLASTER', '.STEALTH_PLAST', '.CRAWL_PLASTER', '.PLASTER_JUMP']));
  }, 600_000);
});
