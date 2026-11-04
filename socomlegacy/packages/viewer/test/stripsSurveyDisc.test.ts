// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_STEMS, parseZdb, Zar, zdbMember, type ZdbEntry } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { archivePositionForm, interpretChainPartsAs, walkChain, type PositionForm } from '@s2u/mesh';
import {
  chunkKey, flattenScene, loadModelLibrary, matchTurretDef, NODE_INSTANCE, parseAnimSets, parseClutter, parseSceneGraph,
  placeClutter, placeInstances, placeTurrets, resolveChunk, transformPoint, turretSceneModels, turretScopeHidden,
  type ModelLibrary, type PlacedModel, type SceneInstance, type SceneNode, type TurretDef, type TurretPlacement,
} from '@s2u/scene';
import { loadMap, type LoadedMap } from '../src/loadMap';
import { kitTurretDefs, loadKitSource } from '../src/loadout';
import { readMapMeta, under } from '../src/mapMeta';
import { assetLibStems } from '../src/mapTextures';

/**
 * PAR-90 B0 (PARITY-2; research 318 §5 B0, §3.1): the survey of every map's line strips under the placements the page
 * hides at the opening, off the dev disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped -- and said so --
 * without it). It changes nothing the game draws: it measures through the repository's readers and logs a table that
 * research 318 §3.1 holds.
 *
 * The composition is `loadMap.ts`'s own, step for step, through the same exported readers -- `mdlArchives` (the model
 * buffers: `WORL_MDL` then the asset libraries but `CLIB`), `place` (`placeInstances` over `worldmodel`, the turret
 * parts, the clutter, `readMapMeta`'s initial state, the name rule), `decoder` (`resolveChunk`, `walkChain`,
 * `interpretChainPartsAs`) and `Segments.add` (a strip of n points is n-1 segments) -- kept per placement, which
 * `LoadedMap` does not keep. Two checks hold the composition to `loadMap` itself on every map: the strip segments summed
 * over every placement equal `LoadedMap.lines`' total, and the composition's opening state (`alternate`) equals
 * `LoadedMap.props[].alternate` on every prop path `loadMap` returns -- the meshed props only: the world's placements
 * (`placement.world`, merged by texture) and the strip-only props (dropped, `loadMap.ts:451`) carry no path out of
 * `loadMap`, so their opening state is the composition's own, unchecked. B1's entries for the strip-only props (D2)
 * would bring those into the check.
 *
 * The name rule is not exported from `loadMap.ts`; `ALTERNATE_STATE` below is its copy (`loadMap.ts:1127`), held to
 * `loadMap`'s own output by the second check, so a change to either breaks this file where it touches a meshed prop.
 *
 * Asserted are only research 318 §2's own readings, as pins: Crossroads' 13 `light_bright`, 7 `light_off` and 3
 * `light_dim` instances, their flag word `0x80801071` (bit 0 `m_active` set), the 7 `light_off` positions, the
 * `light_off` prototype root's `0x80841051`, and bit 0 set on every node above the 7. Everything else is printed.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
/** The 22 multiplayer maps (`packages/scene/test/golden/scene-graphs.json`) and the 12 campaign missions (`CAMPAIGN_STEMS`). */
const MP = ['MP1', 'MP2', 'MP5', 'MP6', 'MP7', 'MP8', 'MP9', 'MP10', 'MP11', 'MP12', 'MP51', 'MP52', 'MP53', 'MP61', 'MP62',
  'MP64', 'MP71', 'MP72', 'MP73', 'MP81', 'MP82', 'MP83'];
const MAPS = [...MP, ...CAMPAIGN_STEMS];
const HAVE_DISC = DISC !== '' && MAPS.every((m) => existsSync(join(DISC, 'RUN', `${m}.ZDB`)));

/** `loadMap.ts:1127`'s `ALTERNATE_STATE`, copied (not exported); held to `loadMap`'s output by the alternate check. */
const ALTERNATE_STATE = /^(vis_)?whats_left$|^parts$|^(beer|radio)_parts$|^nolight$|_off$|_pulse$/i;
const WORLD_MODEL = 'worldmodel';
/**
 * A twin: a name-hidden placement whose world bbox centre lies within this many map units, in (x, z), of the bbox
 * centre of a placement the page draws at the opening in the same realised instance (`instanceOf`). 0.5 units is 5 cm at
 * the maps' 0.1 m a unit (`DEFAULT_METERS_PER_UNIT`). The data's gap sets it (research 318 §3.1, every distance printed
 * below): the on/off pairs sit at 0.000-0.177 (`screen_on`/`_off`, `alarm_light_on`/`_off` and `alarm_spinner`,
 * `hornlightbox_off`, `nolight` under its lamp); the next same-instance distances, 0.784-0.810, are MP61's gate
 * remains, zAnim's in any case, and from 1.0 up debris against intact parts. Same-instance, because the nearest of any
 * placement put two radios' debris on a table and a desk (1.50-1.97) and a sub light on a room's chunk (0.04).
 */
const TWIN_TOLERANCE = 0.5;

/** The flag word's bits the draw gate reads (research 318 §1.2, `FUN_003389c0` D:L236069): bit 0, bit 23, bit 31 and its region (bits 13-17). */
const ACTIVE = 1, BIT23 = 1 << 23, BIT31 = 0x80000000;
const regionOf = (flags: number): number => (flags >>> 13) & 0x1f;

type Source = 'world' | 'prop' | 'clutter' | 'turret';
interface Row {
  source: Source;
  path: string;
  model: string;
  /** The node's own flag word, and the first node on its path, root to node, whose bit 0 is clear (null: none). */
  flags: number;
  offOnPath: string | null;
  /** The path segment the name rule hides it by (null: not hidden by name). */
  rule: string | null;
  /** Under a path zAnim's initial state deactivates (`MapMeta.initial`, bit 31 or an autostart's opening command). */
  zanimOff: boolean;
  /** The page's opening state: drawn at the opening (`!alternate`). */
  shown: boolean;
  /** The rule's segment, or a node below it on the path, named by a node reference of any zAnim archive. */
  scriptNamed: boolean;
  /** `loadMap.ts` `switchPath`: the deepest path zAnim's initial state names over the placement, or null. */
  switchPath: string | null;
  centre: [number, number, number];
  /** The world bbox's diagonal, map units. */
  size: number;
  segments: number;
  /** `chunk key (vparams word)` for each visual that holds strips. */
  stripVisuals: string[];
  /** The meshes its chunks decode to: a prop placement with none is dropped by `loadMap` with its strips drawn (D2). */
  meshes: number;
}
interface MapSurvey {
  stem: string;
  rows: Row[];
  /** `LoadedMap.lines`' segment total, and the alternate mismatches against `LoadedMap.props`. */
  loadMapSegments: number;
  alternateMismatches: string[];
  /** Every node of the GEO archive's models, and those whose bit 0 is clear. */
  nodes: number;
  nodesOff: number;
  /** zAnim archives read and refused, and the distinct node-reference names they carry. */
  zanim: { read: number; refused: number; names: number };
  diagnostics: string[];
}

/** For each realised node, the first node on its path (root to itself) whose bit 0 is clear, or null. */
function offOnPaths(flat: readonly SceneInstance[]): (string | null)[] {
  const seen = new Map<string, number>();
  return flat.map((f) => {
    seen.set(f.path, f.node.flags);
    for (const m of f.path.matchAll(/[/=]|$/g)) {
      const prefix = f.path.slice(0, m.index);
      const flags = seen.get(prefix);
      if (flags !== undefined && (flags & ACTIVE) === 0) return prefix;
    }
    return null;
  });
}

/** Every node-reference name of every zAnim archive the map's ZDB carries and the disc's `RUN/MPZANIM.ZAR`, lower-cased. */
function zanimNames(bytes: Uint8Array, toc: readonly ZdbEntry[], common: Uint8Array | null, diagnostics: string[]): { names: Set<string>; read: number; refused: number } {
  const names = new Set<string>();
  let read = 0, refused = 0;
  const archives: [string, Uint8Array][] = toc.filter((e) => /ZANIM\.ZAR$/i.test(e.name))
    .map((e) => [e.name, bytes.subarray(e.offset, e.offset + e.size)]);
  if (common) archives.push(['RUN/MPZANIM.ZAR', common]);
  for (const [name, data] of archives) {
    try {
      for (const a of parseAnimSets(Zar.parse(data)).sets.flatMap((s) => s.anims)) for (const r of a.nodeRefs) names.add(r.name.toLowerCase());
      read++;
    } catch (e) {
      refused++;
      diagnostics.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { names, read, refused };
}

/** `loadMap.ts` `mdlArchives`: `WORL_MDL.ZED`, then the asset libraries but `CLIB`, each in its position form. */
function library(bytes: Uint8Array, toc: ZdbEntry[], stem: string): ModelLibrary {
  const members = [...new Set(['WORL_MDL.ZED', ...assetLibStems(bytes, toc, stem, { add: () => {} })
    .filter((lib) => lib !== 'CLIB').map((lib) => `${lib}_MDL.ZED`)])];
  const out: { zar: Zar; form: PositionForm }[] = [];
  for (const member of members) {
    try {
      out.push({ zar: Zar.parse(zdbMember(bytes, toc, member)), form: archivePositionForm(member) });
    } catch {
      // A library with no models of its own, as `mdlArchives` allows.
    }
  }
  return loadModelLibrary(out.map((a) => a.zar), out.map((a) => a.form));
}

/** A placement's strips, per visual: `loadMap.ts` `decoder`'s walk, counting what `Segments.add` would add. */
function stripsOf(lib: ModelLibrary, p: PlacedModel, vparams: readonly number[]): { segments: number; meshes: number; visuals: string[] } {
  const entry = lib.get(p.modelName);
  if (!entry) return { segments: 0, meshes: 0, visuals: [] };
  let segments = 0, meshes = 0;
  const visuals: string[] = [];
  for (const [i, chunk] of p.chunks.entries()) {
    const at = resolveChunk(entry, chunk);
    if (at === null) continue;
    try {
      const { lines, meshes: drawn } = interpretChainPartsAs(walkChain(entry.buffer, at.offset, chunk), entry.form ?? 'bias');
      meshes += drawn.length;
      const n = lines.reduce((s, l) => s + Math.max(0, l.positions.length / 3 - 1), 0);
      if (n > 0) visuals.push(`${chunk} (0x${(vparams[i] ?? 0).toString(16)})`);
      segments += n;
    } catch {
      // `decoder` notes it and draws the rest.
    }
  }
  return { segments, meshes, visuals };
}

const centreOf = (p: PlacedModel): [number, number, number] => {
  const b = p.bbox;
  if (!b) return [p.rowMajor[12]!, p.rowMajor[13]!, p.rowMajor[14]!];
  return transformPoint(p.rowMajor, (b[0]! + b[3]!) / 2, (b[1]! + b[4]!) / 2, (b[2]! + b[5]!) / 2);
};
const sizeOf = (p: PlacedModel): number => {
  const b = p.bbox;
  if (!b) return 0;
  const lo = transformPoint(p.rowMajor, b[0]!, b[1]!, b[2]!), hi = transformPoint(p.rowMajor, b[3]!, b[4]!, b[5]!);
  return Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
};

/** Pairs `placeInstances(models, root)` with its nodes: it is `flattenScene(models, root)` filtered to visuals, in order. */
function placedWithNodes(models: SceneNode[], root: string): { p: PlacedModel; f: SceneInstance; off: string | null }[] {
  const flat = flattenScene(models, root);
  const off = offOnPaths(flat);
  const drawn = flat.map((f, i) => ({ f, off: off[i] ?? null })).filter(({ f }) => f.node.visuals > 0);
  const placed = placeInstances(models, root);
  if (placed.length !== drawn.length) throw new Error(`${root}: ${placed.length} placements but ${drawn.length} drawn nodes`);
  return placed.map((p, i) => ({ p, f: drawn[i]!.f, off: drawn[i]!.off }));
}

/** The survey of one map: `loadMap.ts` `place`'s placements, each with its node, its opening state and its strips. */
function surveyMap(stem: string, bytes: Uint8Array, defs: readonly TurretDef[] | null, common: Uint8Array | null): Omit<MapSurvey, 'loadMapSegments' | 'alternateMismatches'> {
  const diagnostics: string[] = [];
  const toc = parseZdb(bytes);
  const lib = library(bytes, toc, stem);
  const models = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`)));
  const items: { source: Source; p: PlacedModel; node: SceneNode; off: string | null }[] = [];
  for (const { p, f, off } of placedWithNodes(models, WORLD_MODEL)) items.push({ source: p.modelName === WORLD_MODEL ? 'world' : 'prop', p, node: f.node, off });
  // `loadMap.ts` `turretParts`: the libraries' turret prototypes under a placed turret's root, in the fallback naming.
  let turretsPlaced: TurretPlacement[] = [];
  if (defs?.length) {
    const named = (n: string | null): boolean => n !== null && matchTurretDef(defs, n) !== null;
    try {
      if (flattenScene(models, WORLD_MODEL).some((f) => named(f.node.name) || named(f.node.modelName))) {
        const joined = turretSceneModels(bytes, toc, stem, models, (line) => diagnostics.push(line));
        turretsPlaced = placeTurrets(joined, defs, null);
        const roots = turretsPlaced.map((t) => t.root);
        const own = new Set(flattenScene(models, WORLD_MODEL).map((f) => f.modelName));
        if (roots.length) {
          for (const { p, f, off } of placedWithNodes(joined, WORLD_MODEL)) {
            if (own.has(p.modelName) || !roots.some((r) => under(p.path, r))) continue;
            items.push({ source: 'turret', p: { ...p, instanceIndex: null, chunks: p.chunks.map((_, v) => chunkKey(p.nodeIndex, null, v)) }, node: f.node, off });
          }
        }
      }
    } catch (e) {
      diagnostics.push(`turret parts: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // `loadMap.ts` `place` (LATER 166): a turret's scope node of the other kind is not drawn (`turretScopeHidden`).
  for (let i = items.length - 1; i >= 0; i--) if (turretScopeHidden(turretsPlaced, items[i]!.p.path)) items.splice(i, 1);
  // `loadMap.ts` `clutter`: `placeClutter`'s placements, each instance a run of its prototype's drawn nodes in order.
  try {
    const { placed } = placeClutter(models, parseClutter(Zar.parse(zdbMember(bytes, toc, 'CLUTTER.ZAR'))));
    const runs = new Map<string, { f: SceneInstance; off: string | null }[]>();
    let at = 0, run = '';
    for (const p of placed) {
      const proto = p.path.slice('clutter/'.length);
      let nodes = runs.get(proto);
      if (!nodes) runs.set(proto, nodes = placedWithNodes(models, proto).map(({ f, off }) => ({ f, off })));
      if (proto !== run || at >= nodes.length) { run = proto; at = 0; }
      const n = nodes[at++]!;
      items.push({ source: 'clutter', p, node: n.f.node, off: n.off });
    }
  } catch (e) {
    diagnostics.push(`clutter: ${e instanceof Error ? e.message : String(e)}`);
  }

  // `loadMap.ts` `place`: zAnim's initial state, then the name rule for what it does not name.
  const meta = readMapMeta(bytes, toc, stem, models);
  const off = meta.initial.filter((e) => e.deactivate).map((e) => e.path);
  const named = new Set(meta.initial.map((e) => e.path));
  const ruleOf = (path: string): { segment: string; index: number } | null => {
    for (const m of path.matchAll(/[^/=]+/g)) {
      if (ALTERNATE_STATE.test(m[0]) && !named.has(path.slice(0, m.index + m[0].length))) return { segment: m[0], index: m.index };
    }
    return null;
  };
  const zanim = zanimNames(bytes, toc, common, diagnostics);
  const scripted = zanim.names;
  const switchPath = (path: string): string | null => {
    let best: string | null = null;
    for (const e of meta.initial) if (under(path, e.path) && (best === null || e.path.length > best.length)) best = e.path;
    return best;
  };
  const all: SceneNode[] = [];
  const walk = (n: SceneNode): void => { all.push(n); n.children.forEach(walk); };
  models.forEach(walk);
  const rows = items.map(({ source, p, node, off: offOnPath }): Row => {
    const rule = ruleOf(p.path);
    const zanimOff = off.some((root) => under(p.path, root));
    const strips = stripsOf(lib, p, node.visualParams);
    const below = rule ? p.path.slice(rule.index).split(/[/=]/).map((s) => s.toLowerCase()) : [];
    return {
      source, path: p.path, model: p.modelName, flags: node.flags >>> 0, offOnPath, rule: rule ? rule.segment.toLowerCase() : null,
      zanimOff, shown: !(zanimOff || rule !== null), scriptNamed: below.some((s) => scripted.has(s)), switchPath: switchPath(p.path),
      centre: centreOf(p), size: sizeOf(p), segments: strips.segments, stripVisuals: strips.visuals, meshes: strips.meshes,
    };
  });
  return {
    stem, rows, diagnostics, nodes: all.length, nodesOff: all.filter((n) => (n.flags & ACTIVE) === 0).length,
    zanim: { read: zanim.read, refused: zanim.refused, names: scripted.size },
  };
}

/** The nearest of `shown`, in (x, z), to a hidden placement: the distance, the height between centres, the size ratio, the path. */
function nearestShown(row: Row, shown: readonly Row[]): { d: number; dy: number; ratio: number; path: string } {
  let best = { d: Infinity, dy: 0, ratio: 0, path: '' };
  for (const s of shown) {
    if (s.path === row.path) continue;
    const d = Math.hypot(s.centre[0] - row.centre[0], s.centre[2] - row.centre[2]);
    if (d < best.d) best = { d, dy: s.centre[1] - row.centre[1], ratio: row.size > 0 ? s.size / row.size : 0, path: s.path };
  }
  return best;
}

/** The innermost realised instance a placement lies in: its path up to the end of its last `=` segment; `worldmodel` for the world's own. */
function instanceOf(path: string): string {
  const eq = path.lastIndexOf('=');
  if (eq < 0) return path.startsWith('clutter/') ? path : WORLD_MODEL;
  const end = path.indexOf('/', eq);
  return end < 0 ? path : path.slice(0, end);
}

/**
 * What a name-hidden placement is, by the data (research 318 §3.1): `zanim` -- zAnim's initial state hides it as well;
 * `twin` -- a placement of its own realised instance that the page draws stands within `TWIN_TOLERANCE` in (x, z);
 * `named` -- a node reference of some zAnim archive names its rule's node or one below it; `alone` -- none of these,
 * bit 0 set on its whole path (the case of Crossroads' `light_off`, R318.3); `unread` -- not `zanim` or `twin`, on a
 * map whose `MZANIM.ZAR` `parseAnimSets` refuses, so neither zAnim's initial state nor its names are known.
 */
type Class = 'zanim' | 'twin' | 'named' | 'alone' | 'unread';
function classify(r: Row, twinDistance: number, zanimUnread: boolean): Class {
  if (r.zanimOff) return 'zanim';
  if (twinDistance <= TWIN_TOLERANCE) return 'twin';
  if (zanimUnread) return 'unread';
  return r.scriptNamed ? 'named' : 'alone';
}

const surveys: MapSurvey[] = [];
const hex = (n: number): string => `0x${(n >>> 0).toString(16)}`;

describe.skipIf(!HAVE_DISC)(`PAR-90 B0: the line strips under hidden placements, every map${HAVE_DISC ? '' : ' (no dev disc: SOCOM_DISC or SOCOM_PC_ROOT -- skipped)'}`, () => {
  const source = (): FsAssetSource => new FsAssetSource(DISC);
  const common = (): Uint8Array | null => (existsSync(join(DISC, 'RUN', 'MPZANIM.ZAR')) ? new Uint8Array(readFileSync(join(DISC, 'RUN', 'MPZANIM.ZAR'))) : null);

  for (const stem of MAPS) {
    it(`${stem}: the composition matches loadMap (every segment, every prop's opening state), and its rows are kept`, async () => {
      const path = `RUN/${stem}.ZDB`;
      const bytes = new Uint8Array(readFileSync(join(DISC, path)));
      const defs = kitTurretDefs(await loadKitSource(source()));
      const s = surveyMap(stem, bytes, defs, common());
      const map: LoadedMap = await loadMap(source(), path);
      const loadMapSegments = (map.lines ?? []).reduce((n, g) => n + g.positions.length / 6, 0);
      const byPath = new Map<string, Set<boolean>>();
      for (const r of s.rows) {
        const was = byPath.get(r.path) ?? new Set<boolean>();
        was.add(!r.shown);
        byPath.set(r.path, was);
      }
      // The meshed props only: the world's placements and the strip-only props leave `loadMap` without paths.
      const alternateMismatches: string[] = [];
      for (const prop of map.props) {
        for (const p of prop.paths ?? []) {
          const mine = byPath.get(p);
          if (!mine || mine.size !== 1 || !mine.has(prop.alternate)) alternateMismatches.push(`${p}: loadMap ${prop.alternate}, survey ${mine ? [...mine].join('/') : 'absent'}`);
        }
      }
      surveys.push({ ...s, loadMapSegments, alternateMismatches });
      expect(alternateMismatches.slice(0, 5), `${stem}: the survey's opening state against loadMap's props`).toEqual([]);
      expect(s.rows.reduce((n, r) => n + r.segments, 0), `${stem}: the survey's segments against loadMap's lines`).toBe(loadMapSegments);
    }, 300_000);
  }

  it("Crossroads (MP72), research 318 §2's pins: 13 light_bright, 7 light_off, 3 light_dim, 0x80801071 on all, the prototype's 0x80841051", () => {
    const bytes = new Uint8Array(readFileSync(join(DISC, 'RUN', 'MP72.ZDB')));
    const toc = parseZdb(bytes);
    const models = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, 'MP72_GEO.ZED')));
    const flat = flattenScene(models, WORLD_MODEL);
    const off = offOnPaths(flat);
    const lamps = (model: string): { f: SceneInstance; off: string | null }[] => flat.map((f, i) => ({ f, off: off[i] ?? null }))
      .filter(({ f }) => f.node.type === NODE_INSTANCE && f.node.modelName === model);
    const counts = Object.fromEntries(['light_bright', 'light_off', 'light_dim'].map((m) => [m, lamps(m).length]));
    expect(counts).toEqual({ light_bright: 13, light_off: 7, light_dim: 3 });
    for (const m of ['light_bright', 'light_off', 'light_dim']) {
      expect(lamps(m).map(({ f }) => hex(f.node.flags)), m).toEqual(lamps(m).map(() => '0x80801071'));
      // §2.3 (the review's F1): no node above any lamp has bit 0 clear.
      expect(lamps(m).map(({ off: o }) => o), m).toEqual(lamps(m).map(() => null));
    }
    // §2.2: the 7 `light_off` at their translation rows, to the note's 0.1.
    const at = lamps('light_off').map(({ f }) => [f.world[12]!, f.world[13]!, f.world[14]!].map((v) => Math.round(v * 10) / 10));
    expect(at).toEqual([[1615, 132.8, 1471.1], [1576, 132.8, 1552.4], [1313.7, 142.8, 1104.6], [1184.7, 86.1, 1074.7],
      [1395, 142.9, 1102.4], [923.4, 138.1, 1397.7], [965.6, 138.1, 1762.1]]);
    const prototype = models.find((m) => m.name === 'light_off');
    expect(prototype && hex(prototype.flags)).toBe('0x80841051');

    // Printed, not asserted (the brief: B0 confirms or corrects): every node of the realised prototype, and the strips.
    const realised = flat.map((f, i) => ({ f, off: off[i] ?? null })).filter(({ f }) => /=light_off(\/|$)/.test(f.path));
    const survey = surveys.find((s) => s.stem === 'MP72');
    const strips = survey?.rows.filter((r) => /=light_off(\/|$)/.test(r.path)) ?? [];
    const lines = [
      `MP72 light_off: ${realised.length} realised prototype nodes, bit 0 clear on ${realised.filter(({ f }) => (f.node.flags & ACTIVE) === 0).length}, `
        + `a clear node on the path of ${realised.filter(({ off: o }) => o !== null).length}; words ${[...new Set(realised.map(({ f }) => `${f.node.name}=${hex(f.node.flags)} (v${f.node.visuals})`))].join(', ')}`,
      `MP72 light_off: ${strips.length} placements drawing visuals, ${strips.reduce((n, r) => n + r.segments, 0)} segments; `
        + `the visuals holding them: ${[...new Set(strips.flatMap((r) => r.stripVisuals.map((v) => `${r.path.replace(/^.*=light_off/, 'light_off')} ${v}`)))].join('; ')}`,
      `MP72 light_off: opening state on the page: ${strips.filter((r) => r.shown).length} shown, ${strips.filter((r) => !r.shown).length} hidden (rule ${[...new Set(strips.map((r) => r.rule))].join(',')})`,
    ];
    for (const kind of ['light_bright', 'light_dim']) {
      const rows = survey?.rows.filter((r) => new RegExp(`=${kind}(/|$)`).test(r.path)) ?? [];
      lines.push(`MP72 ${kind}: ${rows.length} placements, ${rows.reduce((n, r) => n + r.segments, 0)} segments, `
        + `visuals ${[...new Set(rows.flatMap((r) => r.stripVisuals.map((v) => `${r.path.replace(new RegExp(`^.*=${kind}`), kind)} ${v}`)))].join('; ')}`);
    }
    const byModel = new Map<string, number>();
    for (const r of survey?.rows ?? []) if (r.segments > 0) byModel.set(r.model, (byModel.get(r.model) ?? 0) + r.segments);
    lines.push(`MP72 segments by model: ${[...byModel].map(([m, n]) => `${m} ${n}`).join(', ')}`);
    console.log(lines.join('\n'));
    expect(realised.length).toBeGreaterThan(0);
  });

  it('prints the survey: per map and per kind the name rule hides -- counts, bits, twins, segments -- with each placement classified', () => {
    expect(surveys.length, 'every map surveyed').toBe(MAPS.length);
    const out: string[] = [];
    const sum = (rows: readonly Row[]): number => rows.reduce((n, r) => n + r.segments, 0);
    const classes: Record<Class, number> = { zanim: 0, twin: 0, alone: 0, named: 0, unread: 0 };
    const detail: string[] = [];
    out.push('| map | kind | placements | segments | bit 0 clear on the node / on its path | bits 23/31, region | zAnim-off too | twin | named by a zAnim reference | alone | zAnim unread |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const s of surveys) {
      const shown = s.rows.filter((r) => r.shown);
      const kinds = new Map<string, Row[]>();
      for (const r of s.rows) if (r.rule !== null) kinds.set(r.rule, [...(kinds.get(r.rule) ?? []), r]);
      for (const [kind, rows] of [...kinds].sort(([a], [b]) => a.localeCompare(b))) {
        const sorted = rows.map((r) => {
          const near = nearestShown(r, shown), twin = nearestShown(r, shown.filter((o) => instanceOf(o.path) === instanceOf(r.path)));
          const c = classify(r, twin.d, s.zanim.refused > 0);
          classes[c]++;
          detail.push(`  ${s.stem} ${c}: ${r.path} (${r.segments} seg, ${r.meshes} meshes; ${hex(r.flags)}; zAnim-named ${r.scriptNamed ? 'yes' : 'no'}) -- same instance ${twin.path ? `${twin.path.slice(instanceOf(r.path).length) || '(root)'} xz ${twin.d.toFixed(3)} dy ${twin.dy.toFixed(2)} size x${twin.ratio.toFixed(2)}` : 'none shown'}; `
            + `any ${near.path} xz ${near.d.toFixed(3)}`);
          return c;
        });
        const n = (c: Class): number => sorted.filter((x) => x === c).length;
        const bits = [...new Set(rows.map((r) => `${(r.flags & BIT23) !== 0 ? 1 : 0}/${(r.flags & BIT31) !== 0 ? 1 : 0}, r${regionOf(r.flags)}`))].join('; ');
        out.push(`| ${s.stem} | \`${kind}\` | ${rows.length} (${[...new Set(rows.map((r) => r.source))].join('+')}) | ${sum(rows)} `
          + `| ${rows.filter((r) => (r.flags & ACTIVE) === 0).length} / ${rows.filter((r) => r.offOnPath !== null).length} | ${bits} `
          + `| ${n('zanim')} | ${n('twin')} | ${n('named')} | ${n('alone')} | ${n('unread')} |`);
      }
    }
    out.push('', `classes over every map: ${Object.entries(classes).map(([c, k]) => `${c} ${k}`).join(', ')} (twin: a shown placement of the same realised instance within ${TWIN_TOLERANCE} units in (x, z))`);
    out.push('', '| map | GEO nodes (bit 0 clear) | zAnim archives read/refused (reference names) | placements | segments (loadMap\'s) | name-hidden | their segments | zAnim-off | their segments | bit 0 clear on the path | their segments | bit 23 clear: shown (no clutter) / name-hidden / zAnim-off | segments under a zAnim-named path | strip-only props (segments) |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const s of surveys) {
      const stripOnly = s.rows.filter((r) => r.source !== 'world' && r.meshes === 0 && r.segments > 0);
      const clear23 = (rows: readonly Row[]): number => rows.filter((r) => (r.flags & BIT23) === 0).length;
      const byName = s.rows.filter((r) => r.rule !== null), byZanim = s.rows.filter((r) => r.zanimOff), disc = s.rows.filter((r) => r.offOnPath !== null);
      out.push(`| ${s.stem} | ${s.nodes} (${s.nodesOff}) | ${s.zanim.read}/${s.zanim.refused} (${s.zanim.names}) | ${s.rows.length} | ${sum(s.rows)} (${s.loadMapSegments}) `
        + `| ${byName.length} | ${sum(byName)} | ${byZanim.length} | ${sum(byZanim)} | ${disc.length} | ${sum(disc)} `
        + `| ${clear23(s.rows.filter((r) => r.shown && r.source !== 'clutter'))} / ${clear23(byName)} / ${clear23(byZanim)} `
        + `| ${sum(s.rows.filter((r) => r.switchPath !== null))} | ${stripOnly.length} (${sum(stripOnly)}) |`);
    }
    out.push('', 'every name-hidden placement: its class, its segments and meshes (0 meshes: a strip-only or bare prop, outside the alternate check), its own word, whether a zAnim reference names its rule\'s node or one below (read before the class, whatever the class), the nearest shown placement of its realised instance and the nearest of any:');
    out.push(`  zAnim-named over every name-hidden placement: ${surveys.reduce((n, s) => n + s.rows.filter((r) => r.rule !== null && r.scriptNamed).length, 0)}`);
    out.push(...detail);
    out.push('', 'strips under name-hidden placements (map: path -> segments, the visuals that hold them):');
    for (const s of surveys) for (const r of s.rows) if (r.rule !== null && r.segments > 0) out.push(`  ${s.stem}: ${r.path} -> ${r.segments}, ${r.stripVisuals.join(' ')}`);
    out.push('', 'strips under zAnim-off placements, per map: ' + surveys.map((s) => `${s.stem} ${sum(s.rows.filter((r) => r.zanimOff))}`).join(', '));
    out.push('', 'diagnostics:');
    for (const s of surveys) for (const d of new Set(s.diagnostics)) out.push(`  ${s.stem}: ${d}`);
    console.log(out.join('\n'));
  });
});
