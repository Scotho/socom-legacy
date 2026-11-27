/**
 * A read-only data dump (an instrument, product track; no original): the disc's character LOD tables and the sizes of
 * the meshes they name, as JSON lines on stdout for a research note to read. It changes nothing the game or the page
 * does and writes nothing into the repository (the caller redirects stdout). No assertion beyond "it ran and printed".
 *
 *   kind 'character' -- every `READERC.ZAR/character.rdr` entry: its base, model and `lods` (inherited through its bases,
 *                       and whether its own record states it), decoded into `[{ model, distance }]` only when the shape
 *                       is the nested pairs research 78 §5.2 prints, else the raw value with `lodsShape: 'ambiguous'`;
 *   kind 'mesh'      -- per map, every LOD 0 model and LOD copy its sides' characters name, out of that map's
 *                       `CLIB_MDL.ZED`: counts, one sub-mesh per texture (one draw each, as `buildBody` draws them,
 *                       bodyView.ts:191-208 over body.ts:354), and whether its skeleton's names equal LOD 0's in order;
 *   kind 'summary'   -- per map and character: LOD 0, 1, 2 draws, vertices, triangles, distinct textures, and
 *                       whether every texture of a copy is one of LOD 0's;
 *   kind 'map'       -- per map: each side's characters and whether their LOD copies are in the map's library.
 * The worn gear (`FLIB_MDL.ZED` fittings) is not counted: `lods` names only the body's mesh.
 *
 * Run (from redotcom, SOCOM_DISC or SOCOM_PC_ROOT set): `npx tsx tools/dump-character-lods.ts > <file outside the tree>`.
 * Without the disc it prints one SKIPPED line and exits 0.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseRdr, parseZdb, rdrGet, zdbMember, Zar, type RdrNode } from '@s2u/archive';
import { readMeshLibrary, type MeshLibraryEntry } from '@s2u/mesh';
import { parseCharacterTable, readSkeleton, teamCharacter, type CharacterTeam } from '@s2u/scene';

// The disc, resolved as packages/viewer/test/bodyFrameCost.bench.ts:43-46 resolves it.
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const RUN = DISC ? join(DISC, 'RUN') : '';
const out = (o: object): void => console.log(JSON.stringify(o));
if (!DISC || !existsSync(join(RUN, 'READERC.ZAR'))) {
  out({ kind: 'skipped', why: 'no disc: SOCOM_DISC or SOCOM_PC_ROOT/game/disc, needs RUN/READERC.ZAR and RUN/MP*.ZDB' });
  process.exit(0);
}

// character.rdr, as tools/dump-characters.ts:27-28 reads it: Zar.parse, parseRdr (archive/src/rdr.ts:51),
// parseCharacterTable (scene/src/character.ts:55; `get` walks the bases, character.ts:88-96).
const readerc = Zar.parse(new Uint8Array(readFileSync(join(RUN, 'READERC.ZAR'))));
const table = parseCharacterTable(parseRdr(readerc.data(readerc.root.children.find((k) => k.name === 'character.rdr')!)));
/** `seal_A_scuba_1.xsi` -> `seal_A_scuba_1`: the strip character.ts:45 applies to `model_name` (not exported). */
const stem = (file: string): string => file.replace(/\.[a-z]+$/i, '');

interface Lod { model: string; distance: number }
/**
 * `lods` as `rdrGet` (rdr.ts:103-111) returns it: research 78 §5.2 prints `lods (("seal_A_scuba_1.xsi" "150")
 * ("seal_A_scuba_2.xsi" "200"))`, a list of [file, distance] pairs. `rdrGet` unwraps a one-element value list, so a
 * single pair would arrive as the pair itself ([file, distance]); that case is decoded but flagged. Anything else is
 * left raw.
 */
function decodeLods(v: RdrNode | undefined): { lods: Lod[] | null; shape: string } {
  if (v === undefined) return { lods: [], shape: 'absent' };
  const pair = (p: RdrNode): Lod | null => {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [file, at] = p;
    return typeof file === 'string' && typeof at === 'string' && at !== '' && Number.isFinite(Number(at))
      ? { model: stem(file), distance: Number(at) } : null;
  };
  if (Array.isArray(v) && v.every((p) => Array.isArray(p))) {
    const pairs = v.map(pair);
    if (pairs.every((p): p is Lod => p !== null)) return { lods: pairs, shape: 'pairs' };
  }
  const one = pair(v);
  if (one) return { lods: [one], shape: 'one pair, unwrapped by rdrGet' };
  return { lods: null, shape: 'ambiguous' };
}

const lodsOf = new Map<string, Lod[] | null>();
for (const [name, c] of table.characters) {
  const raw = table.get(name, 'lods');
  const { lods, shape } = decodeLods(raw);
  lodsOf.set(name, lods);
  out({ kind: 'character', name, base: c.base, model: table.model(name), ownLods: rdrGet([c.record], 'lods') !== undefined,
    lodsShape: shape, lods, ...(shape !== 'pairs' && shape !== 'absent' ? { lodsRaw: raw ?? null } : {}) });
}

// The multiplayer maps, listed as tools/dump-characters.ts:20-21 lists them.
const maps = readdirSync(RUN).filter((f) => /^MP\d+\.ZDB$/i.test(f))
  .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
const TEAMS: CharacterTeam[] = ['navyseals', 'terrorists', 'escortees'];

interface Size { draws: number; vertices: number; triangles: number; textures: string[] }
for (const file of maps) {
  const map = file.replace(/\.ZDB$/i, '');
  const bytes = new Uint8Array(readFileSync(join(RUN, file)));
  const toc = parseZdb(bytes);                                                   // archive/src/zdb.ts:25
  let parts: { mdl: Zar; geo: Zar; chartype: RdrNode };
  try {
    const readerm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));             // zdb.ts:82
    const key = readerm.root.children.find((k) => k.name.toLowerCase() === 'chartype.rdr');   // body.ts:196
    if (!key) throw new Error('READERM.ZAR has no chartype.rdr');
    parts = { mdl: Zar.parse(zdbMember(bytes, toc, 'CLIB_MDL.ZED')), geo: Zar.parse(zdbMember(bytes, toc, 'CLIB_GEO.ZED')),   // body.ts:325-326
      chartype: parseRdr(readerm.data(key)) };
  } catch (e) {
    out({ kind: 'map', map, error: e instanceof Error ? e.message : String(e) });
    continue;
  }
  const { mdl, geo, chartype } = parts;
  // Each side's characters in the map's order: teamCharacter (scene/src/character.ts:143) until it returns null.
  const sides: Record<string, string[]> = {};
  for (const team of TEAMS) {
    const list: string[] = [];
    for (let i = 0; ; i++) { const c = teamCharacter(chartype, team, i); if (c === null) break; list.push(c); }
    sides[team] = list;
  }
  const characters = [...new Set(Object.values(sides).flat())];
  const wanted = new Set<string>();
  for (const c of characters) {
    const m = table.model(c);                                                    // character.ts:99
    if (m) wanted.add(m);
    for (const l of lodsOf.get(c) ?? []) wanted.add(l.model);
  }
  // Only the named meshes decoded (readMeshLibrary's `only`, mesh/src/skin.ts:467), as body.ts:335 decodes one.
  const lib = new Map<string, MeshLibraryEntry>(readMeshLibrary(mdl, [...wanted]).map((e) => [e.name, e]));
  const boneNames = new Map<string, string[] | string>();
  const bonesOf = (model: string): string[] | string => {
    if (!boneNames.has(model)) {
      try { boneNames.set(model, readSkeleton(geo, model).parts.map((p) => p.name)); }   // scene/src/skeleton.ts:149
      catch (e) { boneNames.set(model, e instanceof Error ? e.message : String(e)); }
    }
    return boneNames.get(model)!;
  };
  const sizeOf = (model: string): Size | null => {
    const mesh = lib.get(model)?.mesh;                                           // SkinnedMeshData, skin.ts:110-121
    if (!mesh) return null;
    return { draws: mesh.subMeshes.length, vertices: mesh.vertexCount, triangles: mesh.triangleCount,
      textures: [...new Set(mesh.subMeshes.map((s) => s.textureName ?? '(untextured)'))] };
  };

  const printed = new Set<string>();
  const sideLines: Record<string, object[]> = {};
  for (const team of TEAMS) sideLines[team] = [];
  for (const c of characters) {
    const lod0 = table.model(c);
    const lods = lodsOf.get(c) ?? null;
    const chain = [lod0, ...(lods ?? []).map((l) => l.model)];
    const lod0Bones = lod0 ? bonesOf(lod0) : 'no model_name';
    for (const [level, model] of chain.entries()) {
      if (!model || printed.has(`${lod0}|${model}`)) continue;
      printed.add(`${lod0}|${model}`);
      const e = lib.get(model);
      const bones = bonesOf(model);
      out({ kind: 'mesh', map, model, lod0, level, present: e !== undefined, error: e?.error ?? null,
        ...(e?.mesh ? {
          vertices: e.mesh.vertexCount, triangles: e.mesh.triangleCount, draws: e.mesh.subMeshes.length,
          batches: e.mesh.batches.length, maxInfluences: e.mesh.maxInfluences, mtxCount: e.mtxCount,
          paletteSlotsUsed: e.mesh.bones.length,                                // SkinnedMeshData.bones, skin.ts:118-119
          subMeshes: e.mesh.subMeshes.map((s) => ({ texture: s.textureName, vertices: s.vertexCount, triangles: s.indices.length / 3 })),
        } : {}),
        skeletonParts: Array.isArray(bones) ? bones.length : null, skeletonError: Array.isArray(bones) ? null : bones,
        skeletonEqualsLod0: Array.isArray(bones) && Array.isArray(lod0Bones) ? bones.join(' ') === lod0Bones.join(' ') : null });
    }
    const levels = chain.map((m) => (m ? sizeOf(m) : null));
    const base = new Set(levels[0]?.textures ?? []);
    out({ kind: 'summary', map, character: c, lod0, lods,
      levels: levels.map((s, i) => ({ level: i, model: chain[i] ?? null, ...(s ?? { missing: true }),
        ...(i > 0 && s ? { texturesInLod0: s.textures.every((t) => base.has(t)) } : {}) })),
      everyCopyTextureInLod0: levels.slice(1).every((s) => s !== null && s.textures.every((t) => base.has(t))) });
    for (const team of TEAMS) {
      if (!sides[team]!.includes(c)) continue;
      sideLines[team]!.push({ character: c, model: lod0, lodsShape: lods === null ? 'ambiguous' : undefined,
        copies: (lods ?? []).map((l) => ({ model: l.model, distance: l.distance, present: lib.get(l.model)?.mesh != null })) });
    }
  }
  out({ kind: 'map', map, sides: sideLines, libraryMeshesDecoded: lib.size });
}
