import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { hasVertexAlpha, isOwnDraw, loadMap, type LoadedMap } from '../src/loadMap';
import { linesWithout, placementsOf } from '../src/forge/hide';
import { placementKey } from '../src/forge/layout';
import type { TextureFlags } from '../src/materialSpec';
import type { GsState } from '@s2u/gs';

/**
 * The draw order a map carries out of `loadMap`, which is the order the engine drew it in.
 *
 * reCOM's `CPipe::RenderNode` (`zRender/zrndr_pipe.cpp`) walks the scene graph depth first, draws each
 * node's visuals as it reaches them, and defers only a node whose opacity is under 1 -- it sorts
 * nothing. So every drawn part records where in that walk it fell (`order`), and the merge that turns
 * hundreds of world packets into a few dozen draws must not let an opaque draw straddle a blended one,
 * or the blended surface would be drawn before or after geometry the hardware drew on the other side.
 */
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const absent = fixture('RUN/MP6.ZDB') === null;

const load = (path: string): Promise<LoadedMap> => loadMap(new FsAssetSource(FIXTURES), path);

describe.skipIf(absent)(`the draw order out of loadMap${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it.skipIf(absent)('every world draw and every prop carries a place in the scene walk, and the lists are in that order', async () => {
    const map = await load('RUN/MP6.ZDB');
    const orders = map.world.map((m) => m.order);
    expect(orders.every((o) => Number.isFinite(o) && o >= 0)).toBe(true);
    for (let i = 1; i < orders.length; i++) expect(orders[i]).toBeGreaterThan(orders[i - 1]!);
    for (const m of map.world) expect(m.orderEnd).toBeGreaterThanOrEqual(m.order);
    const props = map.props.map((p) => p.order);
    for (let i = 1; i < props.length; i++) expect(props[i]).toBeGreaterThan(props[i - 1]!);
  });

  it.skipIf(absent)('a blended world part keeps its own draw, and no opaque draw straddles one', async () => {
    const map = await load('RUN/MP72.ZDB');
    const blended = map.world.filter((m) => {
      const f = m.textureName === null ? undefined : map.textureFlags[m.textureName];
      return (f?.graded ?? false) && !(f?.opaque ?? true);
    });
    expect(blended.length).toBeGreaterThan(0);
    for (const b of blended) expect(b.orderEnd).toBe(b.order);
    for (const a of map.world) {
      if (a.orderEnd === a.order) continue;
      for (const b of blended) expect(b.order > a.order && b.order < a.orderEnd, `${a.textureName} straddles ${b.textureName}`).toBe(false);
    }
  });

  /**
   * MAP-02 (research 209 s9): the opening state is zAnim's. Desert Glory's nine `beerN` animations start with their set
   * (`params.flags` 0x21, AUTOSTART_INITIAL_READING) and turn `beer_parts` off as their first command, so the debris is
   * hidden though no node reference sets bit 31 on it; the barrels' `barrel_parts` and `access1/bad_parts` are hidden by
   * their references' bit 31; the intact bottles (`beer_vis`) are drawn.
   */
  it.skipIf(absent)("Desert Glory opens as zAnim has it: every beer_parts hidden by beerN's start, barrel_parts and access1/bad_parts by their references, the bottles drawn", async () => {
    const map = await load('RUN/MP6.ZDB');
    const placements = map.props.flatMap((p) => (p.paths ?? []).map((path) => ({ path, alternate: p.alternate })));
    const debris = placements.filter((p) => /\/beer_parts(\/|$)/.test(p.path));
    expect(debris.length).toBeGreaterThan(50);
    expect(debris.filter((p) => !p.alternate).map((p) => p.path)).toEqual([]);
    const barrels = placements.filter((p) => /\/barrel_parts(\/|$)/.test(p.path));
    expect(barrels.length).toBeGreaterThan(0);
    expect(barrels.every((p) => p.alternate)).toBe(true);
    const bottles = placements.filter((p) => /\/beer_vis(\/|$)/.test(p.path));
    expect(bottles.length).toBeGreaterThan(0);
    expect(bottles.every((p) => !p.alternate)).toBe(true);
    const bad = map.world.filter((m) => m.switchPath?.startsWith('worldmodel/access1/bad_parts'));
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.every((m) => m.alternate)).toBe(true);
    expect(map.meta!.initial.filter((e) => /\/beer_parts$/.test(e.path)).every((e) => e.deactivate && e.saveActive)).toBe(true);
  });

  /**
   * RENDER-VIG (research 82 round 5). The GS blends every packet by `As = At x Af` with `PRIM.ABE` set on every world
   * packet, so a packet whose vertices carry an alpha ramp over a solid texture -- Desert Glory's sky dome fading into
   * the fog at its rim (`gen_cloud_n_sun_256x256.tif`, 6 packets), its dirty floor and wall-rock blends -- is drawn
   * blended in its own place in the walk, as a graded texture is. Merged into the texture's opaque draw it lost its ramp
   * and z-fought the layer under it (Vigilance's grass over the courtyard cobbles, `ground_wc23` packet 4).
   */
  it.skipIf(absent)('a part whose vertices carry alpha below unity is marked, keeps its own draw, and no opaque draw straddles it', async () => {
    const map = await load('RUN/MP6.ZDB');
    const ramped = map.world.filter((m) => m.vertexAlpha === true);
    expect(new Set(ramped.map((m) => m.textureName))).toEqual(new Set(['gen_cloud_n_sun_256x256.tif', 'afghan2r_floor_dirty.tif', 'afghan2r_wallrock.tif']));
    expect(ramped).toHaveLength(11);
    for (const b of ramped) expect(b.orderEnd, b.textureName ?? '').toBe(b.order);
    for (const a of map.world) {
      if (a.orderEnd === a.order) continue;
      for (const b of ramped) expect(b.order > a.order && b.order < a.orderEnd, `${a.textureName} straddles ${b.textureName}`).toBe(false);
    }
    // The flag is the vertex data's own fact, and a draw without it holds no vertex under unity: no ramp is swallowed.
    for (const m of [...map.world, ...map.props.flatMap((p) => p.parts)]) {
      let min = 1;
      for (let i = 3; i < m.colors.length; i += 4) min = Math.min(min, m.colors[i]!);
      expect(m.vertexAlpha === true, `${m.textureName}: vertex alpha ${min}`).toBe(min < 1);
    }
  });

  /**
   * The engine's alpha pass (`PlacedModel.alphaPass`, research 82 round 5): a visual flagged for it is drawn after
   * the walk, far to near, so it reaches `world.ts` as a draw of its own with the flag on. On Frostfire the 70 flagged
   * visuals are the drop shadows, the lamp flares and glows and the windows; the world's walls and floors are not.
   */
  it.skipIf(absent)('an alpha-pass visual reaches the draw list flagged, as its own draw, world and prop alike', async () => {
    const map = await load('RUN/MP2.ZDB');
    const world = map.world.filter((m) => m.alphaPass === true);
    const props = map.props.flatMap((p) => p.parts.map((part) => ({ part, model: p.modelName }))).filter((x) => x.part.alphaPass === true);
    expect(world.length + props.length).toBeGreaterThan(0);
    for (const w of world) expect(w.orderEnd, w.textureName ?? '').toBe(w.order);
    const textures = new Set([...world.map((m) => m.textureName), ...props.map((x) => x.part.textureName)]);
    expect(textures).toEqual(new Set(['a_shadow.tif', 'lightrays.tif', 'lightglow01.tif', 'lightglow02.tif', 'a_window.tif']));
    // Every drop shadow is in the pass by its flag, not only by its name; a wall never is.
    for (const m of [...map.world, ...map.props.flatMap((p) => p.parts)]) {
      if (/shadow/i.test(m.textureName ?? '')) expect(m.alphaPass, m.textureName ?? '').toBe(true);
      if (/wall|floor|ground|ice|snow/i.test(m.textureName ?? '')) expect(m.alphaPass ?? false, m.textureName ?? '').toBe(false);
    }
  });

  it.skipIf(absent)('every draw carries its cull flag and its state, the alternate states are the ones the game switches to', async () => {
    const map = await load('RUN/MP72.ZDB');            // Crossroads: destructible crates, lamps with an unlit copy
    const draws = [...map.world, ...map.props.flatMap((p) => p.parts)];
    expect(draws.some((m) => m.cull)).toBe(true);
    expect(draws.some((m) => !m.cull)).toBe(true);
    const alternate = map.props.filter((p) => p.alternate);
    expect(alternate.length).toBeGreaterThan(0);
    expect(map.props.filter((p) => !p.alternate).length).toBeGreaterThan(alternate.length);
  });

  it.skipIf(absent)('a mipmapped texture carries the disc\'s own mip images, the records its MIPTBP1 names', async () => {
    // The GS samples level n from TBPn; the exporter wrote those levels as records of their own (`*_mip*.tif`), and a
    // detail texture's are authored transparent -- the pass fades out with distance -- which no generated chain does.
    const map = await load('RUN/MP72.ZDB');
    const mipped = Object.entries(map.textureFlags).filter(([name, f]) => f.gs?.mipmaps && map.textures[name]);
    expect(mipped.length).toBeGreaterThan(0);
    for (const [name, f] of mipped) {
      const levels = map.textureMips?.[name];
      expect(levels, name).toBeDefined();
      expect(levels!.length).toBe(f.gs!.levels);
      levels!.forEach((level, i) => {
        expect(level.width).toBe(map.textures[name]!.width >> (i + 1));
        expect(level.height).toBe(map.textures[name]!.height >> (i + 1));
      });
    }
  });

  it.skipIf(absent)('every placement of a prop is drawn with its own context\'s prelit colours, not the first one\'s', async () => {
    // Frostfire's tank rails: one model, seventeen placements, a chunk per placement whose baked light differs
    // (`N000_I001`..`I017`). Drawing the first member's chunk at every matrix drew the prototype's own bare
    // material colour -- (128, 109, 35), unity red -- on all seventeen, twice to three times the prelit rails
    // around them. Each placement must carry the colours of its own chunk.
    const map = await load('RUN/MP2.ZDB');
    const rails = map.props.filter((p) => p.modelName === 'tankrailbarshi');
    expect(rails.reduce((n, p) => n + p.matrices.length / 16, 0)).toBe(17);
    const meanRed = (c: Float32Array): number => { let s = 0; for (let i = 0; i < c.length; i += 4) s += c[i]!; return (s / (c.length / 4)) * 128; };
    for (const p of rails) for (const part of p.parts) expect(meanRed(part.colors)).toBeLessThan(64);
    // And each its own: the seventeen chunks' baked light takes a dozen distinct values, one per placement.
    const drawn = rails.flatMap((p) => Array.from({ length: p.matrices.length / 16 }, () => meanRed(p.parts[0]!.colors).toFixed(2)));
    expect(new Set(drawn).size).toBeGreaterThanOrEqual(10);
    // The supports (24 placements): no world placement is drawn with a bare prototype context's unity colour.
    const supports = map.props.filter((p) => p.modelName === 'tankrailsupport');
    expect(supports.reduce((n, p) => n + p.matrices.length / 16, 0)).toBe(24);
    for (const p of supports) for (const part of p.parts) expect(meanRed(part.colors)).toBeLessThan(100);
  });

  it.skipIf(absent)('the LOD pairs of the Frostfire railings carry their bands, and the facades and scrolls are marked', async () => {
    const map = await load('RUN/MP2.ZDB');
    // `railings_low` fades in at 100-120 units where `railings_high` fades out; the graph places both
    // sets on the same rails (10 placements each). `grate_lowlod` is in the table but never placed.
    const by = (name: string) => map.props.filter((p) => p.modelName === name);
    expect(by('railstraitlo1').length).toBeGreaterThan(0);
    expect(by('railstraitlo1').every((p) => p.lod?.nearFade[0] === 100 && p.lod.farFade[1] === 440)).toBe(true);
    expect(by('railstraithi1').length).toBe(by('railstraitlo1').length);
    expect(by('railstraithi1').every((p) => p.lod?.nearFade[0] === 0 && p.lod.farFade[0] === 100)).toBe(true);
    expect(by('railstraitlo1').every((p) => !p.alternate)).toBe(true);   // a LOD copy is not a state
    // The copies of one object share a placement: every low rail stands within 5 units of a high rail,
    // which is what lets `world.ts` tell a copy with a successor from the last one at its spot. The
    // grate has no low copy placed at all, so past 360 units it is the last one and stays.
    const spots = (name: string): [number, number, number][] => by(name).flatMap((p) => {
      const out: [number, number, number][] = [];
      for (let i = 0; i < p.matrices.length; i += 16) out.push([p.matrices[i + 12]!, p.matrices[i + 13]!, p.matrices[i + 14]!]);
      return out;
    });
    const near = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 5;
    const highs = spots('railstraithi1');
    expect(spots('railstraitlo1').every((lo) => highs.some((hi) => near(lo, hi)))).toBe(true);
    expect(by('grate_midlod').length).toBeGreaterThan(0);
    expect(by('grate_lowlod').length).toBe(0);
    expect(map.props.filter((p) => p.lod === null).length).toBeGreaterThan(map.props.filter((p) => p.lod !== null).length);
    // The facade flag reaches the props; the scroll bands reach the world chunks they name.
    expect(map.props.some((p) => p.facade !== 0)).toBe(true);
    const scrolled = map.world.filter((m) => m.scroll !== null);
    expect(scrolled.length).toBeGreaterThan(0);
    expect(scrolled.every((m) => m.orderEnd === m.order || m.scroll !== null)).toBe(true);
  });

  it.skipIf(absent)('the line strips come out grouped by texture and fog, with a uv per point and a place in the walk', async () => {
    const map = await load('RUN/MP6.ZDB');           // Desert Glory: power lines, lamp brackets, the cuffs
    expect(map.lines).not.toBeNull();
    const groups = map.lines!;
    expect(groups.length).toBeGreaterThan(1);
    const keys = new Set(groups.map((g) => `${g.textureName}|${g.fog}`));
    expect(keys.size).toBe(groups.length);
    for (const g of groups) {
      const points = g.positions.length / 3;
      expect(points % 2).toBe(0);                       // two points a segment
      expect(g.uvs.length).toBe(points * 2);
      expect(g.colors.length).toBe(points * 4);
      expect(g.normals.length).toBe(points * 3);
      expect(Number.isFinite(g.order)).toBe(true);
    }
    expect(groups.some((g) => g.textureName !== null)).toBe(true);
  });
});

/**
 * Night Stalker (MP7) stores its tent and table chunks under `<key>_L` only, the name `hookupVisuals`
 * gives a dynamically lit node (`vis_main.cpp:93-102`). None of the three committed fixtures has such a
 * key, so this reads the served copy `npm run extract-maps` writes to the git-ignored `public/maps`, and
 * skips where it is absent (CI). `resolveChunk`'s own test covers the rule without a disc.
 */
const MAPS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/maps');
const noMp7 = !existsSync(resolve(MAPS, 'RUN/MP7.ZDB'));

describe.skipIf(noMp7)(`the _L chunks out of loadMap${noMp7 ? ' (public/maps absent: run npm run extract-maps)' : ''}`, () => {
  it.skipIf(noMp7)('Night Stalker draws its tent_seals and seal_table chunks, lit, and reports no missing chain', async () => {
    const map = await loadMap(new FsAssetSource(MAPS), 'RUN/MP7.ZDB');
    expect(map.diagnostics.filter((d) => d.includes('no such chain'))).toEqual([]);
    // The `_L` chunks: tent_seals N001 and N011 (one context), seal_table N000 in both of its contexts,
    // N003 and N005 in the first, N004 in the second -- the suffix is per context, so a lit context is a
    // prop group of its own. Each lit group was drawn from no chain or an unlit one before; every part
    // of it is lit now, and the plain groups are not.
    for (const [name, litNodes] of [['tent_seals', 2], ['seal_table', 4]] as const) {
      const groups = map.props.filter((p) => p.modelName === name);
      const lit = groups.filter((p) => p.parts.some((m) => m.lit));
      expect(lit.length).toBe(litNodes);
      for (const p of lit) expect(p.parts.every((m) => m.lit)).toBe(true);
      expect(groups.length).toBeGreaterThan(litNodes);
    }
  });
});

/**
 * The merge's own-draw rule (`isOwnDraw`) and the vertex-alpha flag (`hasVertexAlpha`), each clause pinned without a
 * map (research 82 round 5's review: on MP2 every alpha-pass texture is graded too, so the pass clause was untested).
 */
describe('isOwnDraw and hasVertexAlpha', () => {
  const gs = (over: Partial<GsState> = {}): GsState => ({
    blend: 'source', alphaTest: null, depthTest: true, bilinear: true, mipmaps: false, levels: 0, wrapS: 'repeat', wrapT: 'repeat', ...over,
  });
  const flags = (over: Partial<TextureFlags> = {}): TextureFlags => ({ bilinear: true, transparent: false, graded: false, opaque: true, gs: gs(), ...over });

  it('a visual of the alpha pass keeps its own draw whatever its texture: opaque and ungraded too', () => {
    expect(isOwnDraw({ alphaPass: true }, flags())).toBe(true);
    expect(isOwnDraw({ alphaPass: true }, undefined)).toBe(true);
    expect(isOwnDraw({}, flags())).toBe(false);
  });
  it('a graded texture that is not opaque does; a vertex ramp does unless the texture is a cutout', () => {
    expect(isOwnDraw({}, flags({ graded: true, opaque: false }))).toBe(true);
    expect(isOwnDraw({}, flags({ graded: true, opaque: true }))).toBe(false);
    expect(isOwnDraw({ vertexAlpha: true }, flags())).toBe(true);
    expect(isOwnDraw({ vertexAlpha: true }, flags({ gs: gs({ alphaTest: 0.5 }) }))).toBe(false);
    expect(isOwnDraw({ vertexAlpha: true, alphaPass: true }, flags({ gs: gs({ alphaTest: 0.5 }) }))).toBe(true);
  });
  it('hasVertexAlpha: any vertex under unity, however little', () => {
    expect(hasVertexAlpha({ colors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]) })).toBe(false);
    expect(hasVertexAlpha({ colors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 0.75]) })).toBe(true);
    expect(hasVertexAlpha({ colors: new Float32Array([1, 1, 1, 0.999]) })).toBe(true);
    expect(hasVertexAlpha({ colors: new Float32Array([0, 0, 0, 1]) })).toBe(false);          // colour is not alpha
  });
});

/**
 * FG-32 (the forge's hide, a browser adaptation): a prop's line strips are merged into the world's line groups by texture
 * (`Segments`), so each group files the points every prop placement put in it by that placement's place in the walk
 * (`LoadedLineGroup.spans`, `LoadedMap.props[].walk`) -- what `WorldView.setPlacementActive` collapses. On Crossroads
 * every strip is a prop's (the tents' guy ropes, the lamps' filaments); Frostfire draws none.
 */
describe.skipIf(absent)(`the line strips' placements out of loadMap${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it.skipIf(absent)("Crossroads: every point of every line group is in one span, each span a prop placement's walk; the tents' among them", async () => {
    const map = await load('RUN/MP72.ZDB');
    const walks = new Map<number, string>();
    for (const p of map.props) (p.walk ?? []).forEach((w) => walks.set(w, p.modelName));
    expect(map.lines?.length).toBeGreaterThan(0);
    const models = new Set<string>();
    for (const g of map.lines!) {
      const spans = g.spans ?? [];
      let at = 0;
      for (const s of spans) {
        expect(s.first).toBe(at);                                   // in order, end to end
        expect(s.count % 2).toBe(0);                                // whole segments
        expect(walks.has(s.walk), `walk ${s.walk}`).toBe(true);
        models.add(walks.get(s.walk)!);
        at += s.count;
      }
      expect(at).toBe(g.positions.length / 3);
    }
    expect([...models].filter((m) => /^tent_/.test(m)).length).toBeGreaterThan(0);
    expect((await load('RUN/MP2.ZDB')).lines).toBeNull();
  });
});

/**
 * LATER 141 (the forge's hide, a browser adaptation; FG-32): a node with line strips and no mesh has no prop entry
 * (`loadMap`'s props loop skips an entry with no geometry), so its strips' span was filed under a walk no entry owns and
 * the hide never dropped it -- MP11's `light_bulb` `wire`: with a bulb hidden its flare, `bulb_1` and frame went, its
 * wire stayed. Its strips are filed under its placement's entry (the same model and place, `placementKey`'s). Read off the
 * disc (`SOCOM_DISC`); skipped without it.
 */
const DISC = process.env['SOCOM_DISC'];
const MP11 = !!DISC && existsSync(resolve(DISC, 'RUN/MP11.ZDB'));
describe.skipIf(!MP11)(`LATER 141: a strips-only node's strips filed under its placement (MP11)${MP11 ? '' : ' (no SOCOM_DISC)'}`, () => {
  const mp11 = (): Promise<LoadedMap> => loadMap(new FsAssetSource(DISC!), 'RUN/MP11.ZDB');
  const points = (lines: LoadedMap['lines']): number => (lines ?? []).reduce((n, g) => n + g.positions.length / 3, 0);

  it("every line span is a prop entry's walk -- the bulbs' wires among them", async () => {
    const map = await mp11();
    const walks = new Set<number>();
    for (const p of map.props) for (const w of p.walk ?? []) walks.add(w);
    const orphans = (map.lines ?? []).flatMap((g) => (g.spans ?? []).filter((s) => !walks.has(s.walk)).map((s) => s.walk));
    expect(orphans).toEqual([]);
  });

  // e3's condition: the re-file changes the spans' walks and nothing else -- every group as it was, its texture, fog, turn
  // (LATER 120: the 13 wires each its own turned group, facade 2), points and spans' places. Captured off the disc on the
  // code before LATER 141 (main 2fa36f9bb, 2026-10-19).
  it('the re-file changes only the spans\' walks: every group\'s texture, fog, turn, points and spans as before', async () => {
    const map = await mp11();
    const sum = (a: ArrayLike<number>): number => Math.round(Array.from(a).reduce((s, v) => s + v, 0) * 1000) / 1000;
    const got = (map.lines ?? []).map((g) => ({
      texture: g.textureName, fog: g.fog, turn: g.turn ? [g.turn.facade, sum(g.turn.matrix)] : null, points: g.positions.length / 3,
      positions: sum(g.positions), spans: (g.spans ?? []).map((s) => [s.first, s.count]),
    }));
    const wire = (matrix: number) => ({ texture: 'a_ball_pipe.tif', fog: true, turn: [2, matrix], points: 56, positions: -140.25, spans: [[0, 56]] });
    expect(got).toEqual([
      { texture: 'ground.tif', fog: true, turn: null, points: 108, positions: 186602.188, spans: [] },
      ...[1261.084, 1095.598, 1144.957, 1518.647, 2128.01, 1513.146, 1598.588, 1865.399, 1772.101, 1557.847, 1755.408, 1687.567, 2059.389].map(wire),
    ]);
  });

  it("a hidden light_bulb drops its wire's strips with its flare, bulb and frame (the hide's own placementsOf and linesWithout)", async () => {
    const map = await mp11();
    const bulb = map.props.find((p) => p.modelName === 'light_bulb')!;
    const m = bulb.matrices;
    const hidden = placementsOf(map, [placementKey('light_bulb', m[12]!, m[13]!, m[14]!)]);
    expect(hidden.size).toBeGreaterThanOrEqual(3);                     // the flare, bulb_1, frame entries at that place
    const dropped = points(map.lines) - points(linesWithout(map, hidden));
    expect(dropped).toBeGreaterThan(0);                                // the wire's points go
    expect(dropped % 2).toBe(0);                                       // whole segments
  });
});
