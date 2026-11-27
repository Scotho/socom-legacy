/**
 * DAY-P1a -- the Abandoned (Day) builder (the day-mode plan, `socomlegacy/docs/plans/2026-11-23-day-mode.md`; DAY.R1:
 * **product track**, a tool; its output is reviewed in DAY-P1b). **A browser adaptation**: the original SOCOM II has no
 * daytime Abandoned; this writes, outside the repository, the colour pack, key, settings and textures a DAY-P1b profile
 * would carry, from SOCOM (USA)'s own day bake of the same map. Nothing it writes is a reading of SOCOM II.
 *
 *   SOCOM_DISC=<disc tree> SOCOM1_MP5_DIR=<input dir> npx tsx tools/variants/buildAbandonedDay.ts [--out <dir>]
 *
 * Inputs (`tools/variants/README.md`): SOCOM II's MP5, a fresh `loadMap(FsAssetSource(SOCOM_DISC), 'RUN/MP5.ZDB')` with
 * no `LoadMapOptions` (the match's own load, DAY.R4); SOCOM (USA)'s MP5 as the day-mode study extracted it through the
 * parked SOCOM 1 readers (`SOCOM1_MP5_DIR`, every file pinned by sha256 in `S1_INPUT_SHA256`; a changed file is
 * refused).
 *
 * The rule, per `LoadedMap.world` vertex in part order then vertex order (`packages/viewer/src/variants/profile.ts`, the
 * pack layout), as the study's `pack.mjs` proved it:
 *   - a part whose texture is in `SKY_TEXTURES` (the sky) takes SOCOM 1's sky colour, its `sky` prop's one vertex
 *     colour (IQ-143: SOCOM II's own sky colours, kept before, drew a near-black rim under SOCOM 1's day sky texture);
 *   - otherwise the SOCOM 1 world vertices within `MATCH_POSITION_EPS` in position (Euclidean) AND `MATCH_NORMAL_EPS`
 *     in vertex normal (Euclidean, on the vertex normals as decoded and carried by the placement's 3x3 -- not
 *     renormalised, not from faces: `dump.mts` and `loadMap.ts` `placeMesh` both rotate them the same way) are the
 *     candidates; all candidates within one PS2 byte (1/128) of the first (lowest S1 index) on every lane -> **exact**,
 *     the first's colour; several colours -> **nearest**, the candidate nearest (Euclidean RGB) the gap-fill grade's
 *     prediction at the vertex's own colour (ties: the lowest S1 index); none -> **graded**, the gap-fill grade's
 *     prediction;
 *   - the gap-fill grade (`ABANDONED_DAY_FILL_GRADE_ADAPTATION`, README): a 33^3 LUT in DAY-2's layout (`profile.ts`
 *     `gradeIndex`, domain 0..2, byte / 128), fitted on the exact pairs (SOCOM II colour -> SOCOM 1 colour) by a
 *     trilinear splat -- each pair adds its target to the eight lattice points around its input with the trilinear
 *     weights; a point's value is the weighted mean -- then every point no pair reached is filled pass by pass with
 *     the mean of its already-filled six neighbours; sampled with `withVariant.ts` `gradeSample`, as a profile would.
 *
 * And per prop vertex (IQ-143: unlit props such as the bridges and the jungle trees carry SOCOM II's night bake), the
 * props pack keyed by `propsKey` (`buildPropsPack`). The binaries are written behind their `S2UV` headers (`withHeader`),
 * so the output's pack, props pack and textures are the files checked in.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '../../packages/archive/src/fsAssetSource';
import { variantTitle } from '../../packages/archive/src/mapNames';
import { loadMap, type LoadedMap, type LoadedMesh } from '../../packages/viewer/src/loadMap';
import { propsKey, worldKey } from '../../packages/viewer/src/variants/key';
import { RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER } from '../../packages/viewer/src/variants/ratsNestDay';
import { GRADE_SIZE, GRADE_TOP, PS2_UNITY, gradeIndex } from '../../packages/viewer/src/variants/profile';
import { gradeSample } from '../../packages/viewer/src/variants/withVariant';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');

/** The study's input files, relative to `SOCOM1_MP5_DIR`, each pinned (README, "The input"). */
export const S1_INPUT_SHA256 = {
  's1-MP5.world-verts.f32': '9b65fb56f75171eca47c05198430c4a06be9ff2f04c21603d012e48c65c193e3',
  's1-MP5.world-attrs.f32': '24bbc907391572a2c5e30979ab7f26457a65116ee0ab399e946299124e351f15',
  's1-MP5.world-tex.u16': 'd2b22b7d44cd890d6da5ac44e85c92fa0accd98bc2ce7398125ae3d6b7b50d24',
  's1-MP5.world-flags.u8': 'a9d57d327aee3725e0fab08a4971fe6a8b5a0bf08272c0c5462a55d60170b615',
  's1-MP5.world-idx.u32': 'dac36cdbfc884f4ea68e1ee04dffaa9c20fb47a4badaa06d45e229c67c8fef3f',
  's1-MP5.geom.json': 'af664a9f7ac633046313945935a6fdfbbe98bbbf5ce1888a4b30c84dfe4062cb',
  's1-MP5.json': 'e54202d5807a5d61584e8c4c77f734078863da805a5605277b9730d69234f059',
  'day-mode/dumps/s1-MP5.render.json': 'c2b8c6365f8b60ef00b537e9cef9c730b16bf90bc4063127969dbfeebf36139f',
  'day-mode/dumps/s1-MP5.render.bin': '660c3c80fc43440c0f879cd446e8a580b88eaf54fc487720a6f5a66f7199c30e',
} as const;
export const S1_INPUT_FILES = Object.keys(S1_INPUT_SHA256) as (keyof typeof S1_INPUT_SHA256)[];

/** The study's match tolerances (`pack.mjs` `EPS`, `N_EPS`), world units and normal units. */
export const MATCH_POSITION_EPS = 0.01;
export const MATCH_NORMAL_EPS = 0.02;
/** One colour, as the study counts it: every candidate within a PS2 byte of the first, on each lane. */
const SAME_COLOUR = 1 / PS2_UNITY + 1e-6;
/**
 * The sky: SOCOM II's parts drawn with it take SOCOM 1's sky colour -- its `sky` prop's vertex colour, one colour on
 * every vertex (checked; refused otherwise) -- not a match by position (the two domes differ). IQ-143: the study kept
 * SOCOM II's own sky colours (0 at the rim to 0.25), which under SOCOM 1's day sky texture drew a near-black rim.
 */
export const SKY_TEXTURES = ['sky01.tif'] as const;
/** The S1 prop whose vertex colour the sky parts take. */
const S1_SKY_PROP = 'sky';
/** The S1 props whose textures are carried beside the light-ray parts (the sky dome and the sun). */
const S1_SKY_PROPS = ['sky', 'sun'] as const;

/**
 * DAY-RN1 B2: one map's day build, per stem. MP5 (Abandoned (Day)) is the builder as it was, every value unchanged;
 * MP8 (Rat's Nest (Day), the owner 2026-11-24 ~17:52Z: "prepare the day version the same way we did abandoned") reads
 * the study's MP8 package, which holds no per-vertex texture file: SOCOM 1's MP8 world is checked for a sky part through
 * its render set's world parts instead (none: its dome is the `sky` prop alone).
 */
export interface DayStem {
  stem: 'MP5' | 'MP8';
  /** Who speaks in a refusal. */
  who: string;
  /** The plan's task name, for provenance. */
  task: string;
  /** The input directory's environment variable. */
  envVar: string;
  /** The input files, relative to that directory, each pinned by sha256 (a changed file is refused). */
  inputs: Readonly<Record<string, string>>;
  verts: string; attrs: string; settings: string; renderJson: string; renderBin: string;
  /** Per-vertex texture files (MP5's `dump2.mts` set): the sky test on SOCOM 1's world by vertex. Absent: by render part. */
  s1Textures?: { tex: string; flags: string; geom: string };
  /** SOCOM II's parts drawn with these take SOCOM 1's sky colour. */
  skyTextures: readonly string[];
  /** 'one': the sky prop is one colour, refused otherwise (MP5); 'mode': the colour on most of its vertices (MP8). */
  skyColour: 'one' | 'mode';
  /** SOCOM 1's light-ray world texture carried with the sky props' (MP5), or none. */
  lightRayTexture: string | null;
  /** The study's own counts, kept in the coverage for comparison (MP5). */
  study?: Record<string, unknown>;
  /**
   * The sky swap (MP8; a browser adaptation's art choice): another SOCOM II map's texture, written as
   * `textures/<as>.rgba` with a `textures.json` row (why "sky swap: ..."), for the profile to draw under SOCOM II's dome
   * texture name `as`. Absent (MP5): nothing written, the output unchanged.
   */
  skySwap?: { readonly map: string; readonly texture: string; readonly as: string };
}

export const DAY_STEMS: { readonly MP5: DayStem; readonly MP8: DayStem } = {
  MP5: {
    stem: 'MP5', who: 'buildAbandonedDay', task: 'DAY-P1a', envVar: 'SOCOM1_MP5_DIR', inputs: S1_INPUT_SHA256,
    verts: 's1-MP5.world-verts.f32', attrs: 's1-MP5.world-attrs.f32', settings: 's1-MP5.json',
    renderJson: 'day-mode/dumps/s1-MP5.render.json', renderBin: 'day-mode/dumps/s1-MP5.render.bin',
    s1Textures: { tex: 's1-MP5.world-tex.u16', flags: 's1-MP5.world-flags.u8', geom: 's1-MP5.geom.json' },
    skyTextures: SKY_TEXTURES, skyColour: 'one', lightRayTexture: 'lightrays.tif',
    study: { note: 'the study\'s pack.mjs over dump3.mts per-node order (packs.json)', vertices: 20016, exact: 16743, gradedSeveral: 1553, gradedNone: 1072, skyOwn: 648 },
  },
  MP8: {
    stem: 'MP8', who: 'buildRatsNestDay', task: 'DAY-RN1', envVar: 'SOCOM1_MP8_DIR',
    inputs: {
      's1-MP8.world-verts.f32': 'edfd4283cf74bd611852d2193e24c50a1f6a1dd2411b41fd5bb43688241f42b9',
      's1-MP8.world-attrs.f32': '1f057e2f80d24c9e536091a0fdf683ba77891c9c4420947e11c85dc45cb369e8',
      's1-MP8.json': '2783541ecbe74818bab82af705060399b671eab1769f5fe4d160fc683a1d9541',
      'dumps/s1-MP8.render.json': '407ef03f84f29b06c7e4cc81d26dff8f1195cf5a54f10475c85cbbd56359532d',
      'dumps/s1-MP8.render.bin': 'e8f745e5c9c0067ccf3e9e61698dd730076b511477ae8112d86daacff013caa1',
    },
    verts: 's1-MP8.world-verts.f32', attrs: 's1-MP8.world-attrs.f32', settings: 's1-MP8.json',
    renderJson: 'dumps/s1-MP8.render.json', renderBin: 'dumps/s1-MP8.render.bin',
    skyTextures: ['gen_cloudy_blue_sky.tif'], skyColour: 'mode', lightRayTexture: null,
    skySwap: RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER,
  },
};

/**
 * The sky swap's texture, as the repository's reader decoded it (`LoadedMap.textures`, keyed lower-cased) at its native
 * size; refused, naming the map and the texture, when that map holds no such texture or its pixels do not fill it.
 */
export function skySwapTexture(
  textures: LoadedMap['textures'], choice: NonNullable<DayStem['skySwap']>, who: string,
): LoadedMap['textures'][string] {
  const t = Object.prototype.hasOwnProperty.call(textures, choice.texture) ? textures[choice.texture] : undefined;
  if (!t) throw new Error(`${who}: ${choice.map} holds no texture ${choice.texture} (the sky swap for ${choice.as})`);
  if (t.data.length !== t.width * t.height * 4) {
    throw new Error(`${who}: ${choice.map} ${choice.texture} is ${t.width} x ${t.height} but holds ${t.data.length} bytes, not ${t.width * t.height * 4}`);
  }
  return t;
}

/**
 * SOCOM 1's sky colour from its sky prop's vertex colours (RGBA floats, one array a part). 'one': every vertex within a
 * PS2 byte of the first, refused otherwise. 'mode': the vertices grouped by colour (a vertex joins the first group whose
 * first colour is within a PS2 byte on every lane, else starts one), the largest group's first colour; a tie goes to
 * the group seen first. `share` is that group's share of the prop's vertices.
 */
export function skyColourOf(parts: Float32Array[], rule: 'one' | 'mode'): { colour: [number, number, number]; vertices: number; share: number } {
  const groups: { rgb: [number, number, number]; n: number }[] = [];
  let vertices = 0;
  for (const c of parts) {
    for (let i = 0; i < c.length / 4; i++, vertices++) {
      const rgb: [number, number, number] = [c[i * 4]!, c[i * 4 + 1]!, c[i * 4 + 2]!];
      const g = groups.find((q) => rgb.every((x, k) => Math.abs(x - q.rgb[k]!) <= SAME_COLOUR));
      if (g) { g.n++; continue; }
      if (rule === 'one' && groups.length) throw new Error(`sky prop is not one colour (${groups[0]!.rgb} vs ${rgb})`);
      groups.push({ rgb, n: 1 });
    }
  }
  if (!groups.length) throw new Error('sky prop has no vertex');
  const best = groups.reduce((a, b) => (b.n > a.n ? b : a));
  return { colour: best.rgb, vertices, share: best.n / vertices };
}

export interface BuildOptions {
  /** SOCOM II's extracted disc tree (`SOCOM_DISC`). */
  disc: string;
  /** SOCOM (USA)'s MP5 input directory (`SOCOM1_MP5_DIR`). */
  s1Dir: string;
  /** The output directory; refused inside the repository. */
  out: string;
  /** A fresh `loadMap` of MP5 already made by the caller (no `LoadMapOptions`); absent, the builder loads it. */
  map?: LoadedMap;
  /** A fresh `loadMap` of the sky swap's map (`DayStem.skySwap.map`) made by the caller; absent, the builder loads it. */
  skyMap?: LoadedMap;
}

interface Share { count: number; share: number; shareOfNonSky?: number }
export interface BuildResult {
  key: { vertices: number; fnv64: string };
  propsKey: { vertices: number; fnv64: string };
  coverage: { vertices: number; sky: Share; exact: Share; nearest: Share; graded: Share; props: PropsCoverage };
  files: { name: string; bytes: number }[];
}

const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const view = <T>(b: Buffer, T: new (buf: ArrayBuffer) => T): T => new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
const toByte = (c: number): number => Math.max(0, Math.min(255, Math.round(c * PS2_UNITY)));
const json = (v: unknown): string => `${JSON.stringify(v, null, 1)}\n`;
const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/** Builds the Abandoned (Day) outputs into `opts.out`. */
export async function buildAbandonedDay(opts: BuildOptions): Promise<BuildResult> {
  return buildDayVariant('MP5', opts);
}

/** Builds one stem's day outputs into `opts.out` (DAY-RN1 B2: `DAY_STEMS`). */
export async function buildDayVariant(stem: keyof typeof DAY_STEMS, opts: BuildOptions): Promise<BuildResult> {
  const spec: DayStem | undefined = Object.prototype.hasOwnProperty.call(DAY_STEMS, stem) ? DAY_STEMS[stem] : undefined;
  if (!spec) throw new Error(`buildDayVariant: no day builder for ${stem} (DAY_STEMS: ${Object.keys(DAY_STEMS).join(', ')})`);
  const who = spec.who;
  const out = resolve(opts.out);
  const rel = relative(REPO, out);
  if (!rel.startsWith('..') && !isAbsolute(rel)) throw new Error(`${who}: --out ${out} is inside the repository; outputs live outside it until DAY-P1b`);

  // ---- the SOCOM 1 side: the pinned input files
  const input: Record<string, Buffer> = {};
  const inputSha: Record<string, string> = {};
  for (const f of Object.keys(spec.inputs)) {
    const b = readFileSync(join(opts.s1Dir, f));
    const h = sha256(b);
    if (h !== spec.inputs[f]) throw new Error(`${who}: ${f} has sha256 ${h}, pinned ${spec.inputs[f]} (README, "The input")`);
    input[f] = b; inputSha[f] = h;
  }
  const s1v = view(input[spec.verts]!, Float32Array); // x y z r g b, 1.0 = byte 128 (dump.mts)
  const s1a = view(input[spec.attrs]!, Float32Array); // nx ny nz u v (dump.mts)
  const n1 = s1v.length / 6;
  const keep = new Set<string>(spec.skyTextures);
  let s1Sky: (i: number) => boolean;
  if (spec.s1Textures) {
    const s1t = view(input[spec.s1Textures.tex]!, Uint16Array); // texture index into geom.json's list (dump2.mts)
    const geom = JSON.parse(input[spec.s1Textures.geom]!.toString('utf8')) as { vertices: number; textures: { name: string }[] };
    if (s1a.length / 5 !== n1 || s1t.length !== n1 || input[spec.s1Textures.flags]!.length !== n1 || geom.vertices !== n1) {
      throw new Error(`${who}: the SOCOM 1 input files disagree on the vertex count (${n1})`);
    }
    s1Sky = (i: number) => keep.has((geom.textures[s1t[i]!]?.name ?? '').toLowerCase());
  } else {
    // no per-vertex texture file: the render set's world parts (the same vertices, another order) name every texture
    const rj = JSON.parse(input[spec.renderJson]!.toString('utf8')) as { world: { texture: string | null; positions: Range }[] };
    const rn = rj.world.reduce((n, w) => n + (w.positions ? w.positions[1] / 3 : 0), 0);
    if (s1a.length / 5 !== n1 || rn !== n1) throw new Error(`${who}: the SOCOM 1 input files disagree on the vertex count (${n1}; render set ${rn})`);
    const skyParts = rj.world.filter((w) => keep.has((w.texture ?? '').toLowerCase()));
    if (skyParts.length) throw new Error(`${who}: SOCOM 1's world holds ${skyParts.length} sky parts; this stem's rule has no per-vertex texture to leave them out`);
    s1Sky = () => false;
  }

  // the SOCOM 1 vertices on a 0.5 grid (pack.mjs's), each cell's list in index order
  const CELL = 0.5;
  const cellKey = (x: number, y: number, z: number) => `${Math.round(x / CELL)},${Math.round(y / CELL)},${Math.round(z / CELL)}`;
  const grid = new Map<string, number[]>();
  let s1SkyCount = 0;
  for (let i = 0; i < n1; i++) {
    if (s1Sky(i)) { s1SkyCount++; continue; }
    const k = cellKey(s1v[i * 6]!, s1v[i * 6 + 1]!, s1v[i * 6 + 2]!);
    let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(i);
  }

  // ---- the SOCOM II side: a fresh load
  const zdbPath = `RUN/${spec.stem}.ZDB`;
  const map = opts.map ?? await loadMap(new FsAssetSource(opts.disc), zdbPath);
  if (map.archive !== spec.stem) throw new Error(`${who}: the map is ${map.archive}, not ${spec.stem}`);
  const key = worldKey(map);
  const n2 = key.vertices;

  // pass 1: classify; collect the exact pairs
  const SKY = 0, EXACT = 1, NEAREST = 2, GRADED = 3;
  const kind = new Uint8Array(n2);
  const night = new Float32Array(n2 * 3);
  const day = new Float32Array(n2 * 3);
  const several = new Map<number, number[]>();
  const nLen = { s2Min: Infinity, s2Max: -Infinity, s2Missing: 0, s1Min: Infinity, s1Max: -Infinity };
  for (let i = 0; i < n1; i++) { const l = Math.hypot(s1a[i * 5]!, s1a[i * 5 + 1]!, s1a[i * 5 + 2]!); nLen.s1Min = Math.min(nLen.s1Min, l); nLen.s1Max = Math.max(nLen.s1Max, l); }
  let v = 0;
  for (const part of map.world) {
    const count = Math.floor(part.positions.length / 3);
    const kept = part.textureName !== null && keep.has(part.textureName.toLowerCase());
    for (let j = 0; j < count; j++, v++) {
      for (let c = 0; c < 3; c++) night[v * 3 + c] = part.colors[j * 4 + c]!;
      if (kept) { kind[v] = SKY; continue; }
      const x = part.positions[j * 3]!, y = part.positions[j * 3 + 1]!, z = part.positions[j * 3 + 2]!;
      const nx = part.normals ? part.normals[j * 3]! : 0, ny = part.normals ? part.normals[j * 3 + 1]! : 0, nz = part.normals ? part.normals[j * 3 + 2]! : 0;
      if (!part.normals) nLen.s2Missing++;
      const l = Math.hypot(nx, ny, nz); nLen.s2Min = Math.min(nLen.s2Min, l); nLen.s2Max = Math.max(nLen.s2Max, l);
      const cx = Math.round(x / CELL), cy = Math.round(y / CELL), cz = Math.round(z / CELL);
      const hits: number[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const h of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
          if (Math.hypot(s1v[h * 6]! - x, s1v[h * 6 + 1]! - y, s1v[h * 6 + 2]! - z) <= MATCH_POSITION_EPS
            && Math.hypot(s1a[h * 5]! - nx, s1a[h * 5 + 1]! - ny, s1a[h * 5 + 2]! - nz) <= MATCH_NORMAL_EPS) hits.push(h);
        }
      }
      hits.sort((a, b) => a - b);
      if (hits.length === 0) { kind[v] = GRADED; continue; }
      const h0 = hits[0]!;
      const one = hits.every((h) => [3, 4, 5].every((c) => Math.abs(s1v[h * 6 + c]! - s1v[h0 * 6 + c]!) <= SAME_COLOUR));
      if (one) {
        kind[v] = EXACT;
        for (let c = 0; c < 3; c++) day[v * 3 + c] = s1v[h0 * 6 + 3 + c]!;
      } else { kind[v] = NEAREST; several.set(v, hits); }
    }
  }

  // the gap-fill grade, fitted on the exact pairs
  const lut = fitGrade(n2, kind, EXACT, night, day);
  const lutStats = lut.stats;

  // ---- SOCOM 1's render set (the textures, the sky and the props)
  const render = JSON.parse(input[spec.renderJson]!.toString('utf8')) as {
    world: { texture: string | null; positions: [number, number] | null; indices: [number, number] | null }[];
    props: S1Prop[];
    textures: Record<string, { width: number; height: number; data: [number, number] }>;
  };
  const bin = input[spec.renderBin]!;
  const f32 = (r: [number, number] | null | undefined): Float32Array =>
    (r ? new Float32Array(bin.buffer.slice(bin.byteOffset + r[0], bin.byteOffset + r[0] + r[1] * 4) as ArrayBuffer) : new Float32Array(0));

  // the sky colour: SOCOM 1's sky prop -- one colour on every vertex (MP5), or the colour on most of them (MP8)
  const skyProp = render.props.filter((q) => q.modelName === S1_SKY_PROP);
  if (skyProp.length !== 1) throw new Error(`${who}: SOCOM 1's ${spec.stem} holds ${skyProp.length} '${S1_SKY_PROP}' props, not one`);
  let sky: ReturnType<typeof skyColourOf>;
  try { sky = skyColourOf(skyProp[0]!.parts.map((q) => f32(q.colors)), spec.skyColour); } catch (e) { throw new Error(`${who}: SOCOM 1's ${e instanceof Error ? e.message : String(e)}`); }
  const skyColour = sky.colour;
  const s1SkyPropVertices = sky.vertices;

  // pass 2: the nearest and the graded
  const pred: [number, number, number] = [0, 0, 0];
  const rgb8 = new Uint8Array(n2 * 3);
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < n2; i++) {
    const k = kind[i]!;
    counts[k]!++;
    if (k === SKY) { for (let c = 0; c < 3; c++) rgb8[i * 3 + c] = toByte(skyColour[c]!); continue; }
    if (k === NEAREST || k === GRADED) gradeSample(lut.bytes, night[i * 3]!, night[i * 3 + 1]!, night[i * 3 + 2]!, pred);
    if (k === GRADED) { for (let c = 0; c < 3; c++) day[i * 3 + c] = pred[c]!; }
    if (k === NEAREST) {
      let best = -1, bd = Infinity;
      for (const h of several.get(i)!) {
        const d = Math.hypot(s1v[h * 6 + 3]! - pred[0], s1v[h * 6 + 4]! - pred[1], s1v[h * 6 + 5]! - pred[2]);
        if (d < bd) { bd = d; best = h; }
      }
      for (let c = 0; c < 3; c++) day[i * 3 + c] = s1v[best * 6 + 3 + c]!;
    }
    for (let c = 0; c < 3; c++) rgb8[i * 3 + c] = toByte(day[i * 3 + c]!);
  }

  // ---- settings: SOCOM 1's values as the input JSON holds them
  const s1json = JSON.parse(input[spec.settings]!.toString('utf8')) as {
    mapName: string; settings: { camera: Record<string, unknown>; worldRoot: { shadowVector: number[]; nightMission: boolean }; globalLighting: unknown };
  };
  const src = spec.settings;
  const settings: Record<string, { value: unknown; source: string }> = {
    mapName: { value: s1json.mapName, source: `${src} mapName` },
    nightMission: { value: s1json.settings.worldRoot.nightMission, source: `${src} settings.worldRoot.nightMission` },
    shadowVector: { value: s1json.settings.worldRoot.shadowVector, source: `${src} settings.worldRoot.shadowVector` },
    globalLighting: { value: s1json.settings.globalLighting, source: `${src} settings.globalLighting` },
  };
  for (const f of ['fogColor', 'fogNear', 'fogFar', 'fogTop', 'fogBottom', 'fogEnabled', 'fogDirectional', 'fogAltitude', 'nearPlane', 'farPlane']) {
    if (f in s1json.settings.camera) settings[f] = { value: s1json.settings.camera[f], source: `${src} settings.camera.${f}` };
  }

  // ---- the props pack (IQ-143): every SOCOM II prop vertex, map.props order, each entry's parts, each part's vertices
  const props = buildPropsPack(map, render.props, f32, lut.bytes);

  // ---- textures: SOCOM 1's decoded RGBA from the study's render set
  const s2Tex = map.textures;
  const lightRayParts = spec.lightRayTexture ? render.world.filter((w) => w.texture === spec.lightRayTexture) : [];
  const skyProps = render.props.filter((q) => (S1_SKY_PROPS as readonly string[]).includes(q.modelName));
  const wanted = new Set<string>();
  for (const w of lightRayParts) wanted.add(w.texture!);
  for (const p of skyProps) for (const q of p.parts) if (q.texture) wanted.add(q.texture);
  const texRows: { name: string; width: number; height: number; bytes: number; sha256: string; why: string; s2?: { width: number; height: number } }[] = [];
  const texFiles: [string, Uint8Array][] = [];
  for (const name of Object.keys(render.textures).sort()) {
    const t = render.textures[name]!;
    const px = new Uint8Array(bin.buffer, bin.byteOffset + t.data[0], t.data[1]);
    const s2 = s2Tex[name];
    let why: string | null = null;
    if (s2) {
      const same = s2.width === t.width && s2.height === t.height && s2.data.length === px.length && s2.data.every((b, i) => b === px[i]);
      if (!same) why = `changed: the same name in SOCOM II ${spec.stem} holds other pixels`;
    } else if (wanted.has(name)) why = 'SOCOM 1 only: drawn by the sky/sun props or the light-ray parts';
    if (!why) continue;
    const file = `textures/${name}.rgba`;
    texFiles.push([file, withHeader([t.width, t.height], px)]);
    texRows.push({ name, width: t.width, height: t.height, bytes: px.length, sha256: sha256(px), why, ...(s2 ? { s2: { width: s2.width, height: s2.height } } : {}) });
  }
  // the sky swap (MP8): another SOCOM II map's sky texture under SOCOM II's dome texture name, at its native size
  let skySwapProvenance: Record<string, string> | undefined;
  if (spec.skySwap) {
    const sw = spec.skySwap;
    const skyMap = opts.skyMap ?? await loadMap(new FsAssetSource(opts.disc), sw.map);
    const t = skySwapTexture(skyMap.textures, sw, who);
    const px = new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength);
    texFiles.push([`textures/${sw.as}.rgba`, withHeader([t.width, t.height], px)]);
    texRows.push({
      name: sw.as, width: t.width, height: t.height, bytes: px.length, sha256: sha256(px),
      why: `sky swap: ${sw.map} ${sw.texture} (SOCOM II's own, at its native size), drawn in place of SOCOM II ${spec.stem}'s ${sw.as}; a browser adaptation's art choice, the owner's pick (MISSION OT.R158)`,
      s2: { width: s2Tex[sw.as]?.width ?? 0, height: s2Tex[sw.as]?.height ?? 0 },
    });
    skySwapProvenance = { file: sw.map, sha256: sha256(readFileSync(join(opts.disc, ...sw.map.split('/')))), texture: sw.texture, as: sw.as };
  }
  const elems = (r: [number, number] | null) => (r ? r[1] : 0);
  const parts = {
    note: `sizes only (no geometry carried): SOCOM 1 ${spec.stem}'s light-ray world parts and its sky and sun props, from the study's render set`,
    source: spec.renderJson,
    lightRayParts: lightRayParts.map((w) => ({ texture: w.texture, vertices: elems(w.positions) / 3, triangles: elems(w.indices) / 3 })),
    props: skyProps.map((p) => ({ modelName: p.modelName, placements: elems(p.matrices) / 16, parts: p.parts.map((q) => ({ texture: q.texture, vertices: elems(q.positions) / 3, triangles: elems(q.indices) / 3 })) })),
  };

  // ---- coverage
  const nonSky = n2 - counts[SKY]!;
  const share = (c: number, of: boolean): Share => ({ count: c, share: r6(c / n2), ...(of ? { shareOfNonSky: r6(c / nonSky) } : {}) });
  const coverage = {
    vertices: n2,
    s1Vertices: n1,
    s1SkyVerticesLeftOut: s1SkyCount,
    sky: {
      ...share(counts[SKY]!, false), textures: [...spec.skyTextures], colour: skyColour,
      source: spec.skyColour === 'one'
        ? `${spec.renderJson} props '${S1_SKY_PROP}' (${s1SkyPropVertices} vertices, one colour)`
        : `${spec.renderJson} props '${S1_SKY_PROP}' (${s1SkyPropVertices} vertices; the colour on most of them, ${r6(sky.share)})`,
    },
    exact: share(counts[EXACT]!, true),
    nearest: share(counts[NEAREST]!, true),
    graded: share(counts[GRADED]!, true),
    rule: { positionEps: MATCH_POSITION_EPS, normalEps: MATCH_NORMAL_EPS, sameColour: '1/128 on each lane, against the lowest S1 index', grid: CELL },
    normals: { s2LengthMin: r6(nLen.s2Min), s2LengthMax: r6(nLen.s2Max), s2PartsVerticesWithoutNormals: nLen.s2Missing, s1LengthMin: r6(nLen.s1Min), s1LengthMax: r6(nLen.s1Max) },
    grade: lutStats,
    props: props.coverage,
    ...(spec.study ? { study: spec.study } : {}),
  };

  // ---- provenance
  let base = 'unknown';
  try { base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: HERE, encoding: 'utf8' }).trim(); } catch { /* not a git tree */ }
  const zdb = readFileSync(join(opts.disc, 'RUN', `${spec.stem}.ZDB`));
  const provenance = {
    what: `${spec.task} ${variantTitle(spec.stem, 'day')} builder output (a browser adaptation; product track, DAY.R1)`,
    generated: new Date().toISOString(),
    baseCommit: base,
    socom2: { file: zdbPath, sha256: sha256(zdb), load: `loadMap(FsAssetSource(SOCOM_DISC), "${zdbPath}"), no LoadMapOptions` },
    socom1: { dir: spec.envVar, files: inputSha },
    ...(skySwapProvenance ? { skySwap: skySwapProvenance } : {}),
  };

  // ---- write
  mkdirSync(join(out, 'textures'), { recursive: true });
  const written: [string, Uint8Array | string][] = [
    ['pack.rgb8', withHeader([n2], rgb8)],
    ['props.rgb8', withHeader([props.key.vertices], props.rgb8)],
    ['grade.lut33', lut.bytes],
    ['key.json', json(key)],
    ['props-key.json', json(props.key)],
    ['settings.json', json(settings)],
    ['coverage.json', json(coverage)],
    ['textures.json', json(texRows)],
    ['parts.json', json(parts)],
    ...texFiles,
    ['provenance.json', json(provenance)],
  ];
  const files: { name: string; bytes: number }[] = [];
  for (const [name, data] of written) {
    writeFileSync(join(out, name), data);
    files.push({ name, bytes: typeof data === 'string' ? Buffer.byteLength(data) : data.length });
  }
  return { key, propsKey: props.key, coverage: { vertices: n2, sky: coverage.sky, exact: coverage.exact, nearest: coverage.nearest, graded: coverage.graded, props: props.coverage }, files };
}

/**
 * The data files' header (README, "The outputs"; `packages/viewer/src/variants/abandonedDay.ts` `unpackPack`,
 * `unpackTexture`): ASCII `S2UV`, then little-endian u32s (a pack's vertex count; a texture's width and height), then
 * the bytes unchanged. A browser adaptation of the file format: it makes the files self-describing and binary to the
 * leak check (a NUL in the first 8 KB). IQ-143: written here, so the builder's output is what is checked in.
 */
function withHeader(u32s: number[], body: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + 4 * u32s.length + body.length);
  out.set([0x53, 0x32, 0x55, 0x56]);
  const dv = new DataView(out.buffer);
  u32s.forEach((v, i) => dv.setUint32(4 + 4 * i, v, true));
  out.set(body, 4 + 4 * u32s.length);
  return out;
}

export type Range = [number, number] | null;
export interface S1Prop {
  modelName: string; matrices: Range;
  parts: { texture: string | null; positions: Range; colors?: Range; normals?: Range; indices: Range }[];
}
export interface PropsCoverage {
  vertices: number;
  matched: { count: number; share: number };
  graded: { count: number; share: number };
  own: { count: number; share: number };
  byModel: Record<string, { vertices: number; matched: number; graded: number; own: number; s1Entries: number }>;
  rule: string;
}

/**
 * The props pack (IQ-143): one RGB8 triple a SOCOM II prop vertex, `map.props` order, each entry's parts in order, each
 * part's vertices in order (`propsKey`'s walk). Per vertex, in the prop's own (model) space:
 * - **matched**: SOCOM 1's props of the same model name are the candidates, ranked by how many of SOCOM II's entry's
 *   vertices each holds (most first: the entry with the same geometry), then by its first placement's distance from
 *   SOCOM II's entry's first placement (nearest first), then by index; the first candidate holding a vertex within
 *   `MATCH_POSITION_EPS` in position and `MATCH_NORMAL_EPS` in normal (the normal only where both carry one) gives its
 *   colour -- its lowest such vertex, parts then vertices. (The fresh review's F1: the four `a_bridge` entries of both
 *   discs stand at one placement, so distance alone tied and pieces took a neighbour piece's colour.)
 * - **graded**: no match on an unlit part (its colour is a night bake): the gap-fill grade at its own colour.
 * - **own**: no match on a lit part (the light rig carries the night there): its own decoded byte (inert).
 */
export function buildPropsPack(map: LoadedMap, s1Props: S1Prop[], f32: (r: Range | undefined) => Float32Array, lut: Uint8Array) {
  const key = propsKey(map);
  const rgb8 = new Uint8Array(key.vertices * 3);
  const byModel: PropsCoverage['byModel'] = {};
  const counts = { matched: 0, graded: 0, own: 0 };
  const s1 = s1Props.map((e, index) => {
    const m = f32(e.matrices);
    return { index, modelName: e.modelName, t: [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0], parts: e.parts.map((q) => ({ p: f32(q.positions), c: f32(q.colors), n: f32(q.normals) })) };
  });
  const pred: [number, number, number] = [0, 0, 0];
  let v = 0;
  for (const entry of map.props) {
    const t2 = [entry.matrices[12] ?? 0, entry.matrices[13] ?? 0, entry.matrices[14] ?? 0];
    const vertexAt = (part: LoadedMesh, j: number) => ({
      x: part.positions[j * 3]!, y: part.positions[j * 3 + 1]!, z: part.positions[j * 3 + 2]!,
      nrm: part.normals && part.normals.length >= (j + 1) * 3 ? [part.normals[j * 3]!, part.normals[j * 3 + 1]!, part.normals[j * 3 + 2]!] : null,
    });
    const colourIn = (c: typeof s1[number], at: ReturnType<typeof vertexAt>): number[] | null => {
      for (const q of c.parts) {
        for (let k = 0; k < q.p.length / 3; k++) {
          if (Math.hypot(q.p[k * 3]! - at.x, q.p[k * 3 + 1]! - at.y, q.p[k * 3 + 2]! - at.z) > MATCH_POSITION_EPS) continue;
          if (at.nrm && q.n.length >= (k + 1) * 3 && Math.hypot(q.n[k * 3]! - at.nrm[0]!, q.n[k * 3 + 1]! - at.nrm[1]!, q.n[k * 3 + 2]! - at.nrm[2]!) > MATCH_NORMAL_EPS) continue;
          return [q.c[k * 4]!, q.c[k * 4 + 1]!, q.c[k * 4 + 2]!];
        }
      }
      return null;
    };
    const held = (c: typeof s1[number]) => {
      let h = 0;
      for (const part of entry.parts) for (let j = 0; j < Math.floor(part.positions.length / 3); j++) if (colourIn(c, vertexAt(part, j))) h++;
      return h;
    };
    const cands = s1.filter((e) => e.modelName === entry.modelName)
      .map((e) => ({ e, h: held(e), d: Math.hypot(e.t[0]! - t2[0]!, e.t[1]! - t2[1]!, e.t[2]! - t2[2]!) }))
      .sort((a, b) => b.h - a.h || a.d - b.d || a.e.index - b.e.index).map((x) => x.e);
    const row = byModel[entry.modelName] ??= { vertices: 0, matched: 0, graded: 0, own: 0, s1Entries: cands.length };
    for (const part of entry.parts) {
      const n = Math.floor(part.positions.length / 3);
      for (let j = 0; j < n; j++, v++) {
        const at = vertexAt(part, j);
        let hit: number[] | null = null;
        for (const c of cands) { hit = colourIn(c, at); if (hit) break; }
        const own = [part.colors[j * 4]!, part.colors[j * 4 + 1]!, part.colors[j * 4 + 2]!];
        let rgb: number[];
        if (hit) { rgb = hit; counts.matched++; row.matched++; }
        else if (!part.lit) { gradeSample(lut, own[0]!, own[1]!, own[2]!, pred); rgb = [...pred]; counts.graded++; row.graded++; }
        else { rgb = own; counts.own++; row.own++; }
        row.vertices++;
        for (let c = 0; c < 3; c++) rgb8[v * 3 + c] = toByte(rgb[c]!);
      }
    }
  }
  const sh = (c: number) => ({ count: c, share: r6(c / Math.max(key.vertices, 1)) });
  const coverage: PropsCoverage = {
    vertices: key.vertices, matched: sh(counts.matched), graded: sh(counts.graded), own: sh(counts.own), byModel,
    rule: 'same model name; the S1 entries holding most of the entry vertices first, then the nearest first placement, then the lower index; a vertex within the position and normal tolerances in model space; else the gap-fill grade (unlit) or its own colour (lit)',
  };
  return { key, rgb8, coverage };
}

/** The gap-fill grade (README, `ABANDONED_DAY_FILL_GRADE_ADAPTATION`): trilinear splat of the exact pairs, then neighbour fill. */
function fitGrade(n: number, kind: Uint8Array, exact: number, night: Float32Array, day: Float32Array) {
  const N = GRADE_SIZE, last = N - 1, scale = last / GRADE_TOP, P = N * N * N;
  const acc = new Float64Array(P * 3), wsum = new Float64Array(P);
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    if (kind[i] !== exact) continue;
    pairs++;
    const p = [0, 1, 2].map((c) => Math.min(Math.max(night[i * 3 + c]! * scale, 0), last));
    const i0 = p.map((x) => Math.min(Math.floor(x), last - 1)), f = p.map((x, c) => x - i0[c]!);
    for (let db = 0; db < 2; db++) for (let dg = 0; dg < 2; dg++) for (let dr = 0; dr < 2; dr++) {
      const w = (dr ? f[0]! : 1 - f[0]!) * (dg ? f[1]! : 1 - f[1]!) * (db ? f[2]! : 1 - f[2]!);
      if (w === 0) continue;
      const at = gradeIndex(i0[0]! + dr, i0[1]! + dg, i0[2]! + db);
      wsum[at]! += w;
      for (let c = 0; c < 3; c++) acc[at * 3 + c]! += w * day[i * 3 + c]!;
    }
  }
  const val = new Float64Array(P * 3), filled = new Uint8Array(P);
  let reached = 0;
  for (let k = 0; k < P; k++) if (wsum[k]! > 0) { filled[k] = 1; reached++; for (let c = 0; c < 3; c++) val[k * 3 + c] = acc[k * 3 + c]! / wsum[k]!; }
  let passes = 0, left = P - reached;
  while (left > 0 && reached > 0) {
    passes++;
    const next: [number, number, number, number][] = [];
    for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
      const k = gradeIndex(r, g, b);
      if (filled[k]) continue;
      let m = 0; const s = [0, 0, 0];
      for (const [dr, dg, db] of [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]] as const) {
        const rr = r + dr, gg = g + dg, bb = b + db;
        if (rr < 0 || gg < 0 || bb < 0 || rr > last || gg > last || bb > last) continue;
        const q = gradeIndex(rr, gg, bb);
        if (!filled[q]) continue;
        m++; for (let c = 0; c < 3; c++) s[c]! += val[q * 3 + c]!;
      }
      if (m) next.push([k, s[0]! / m, s[1]! / m, s[2]! / m]);
    }
    for (const [k, r, g, b] of next) { val[k * 3] = r; val[k * 3 + 1] = g; val[k * 3 + 2] = b; filled[k] = 1; }
    left -= next.length;
  }
  const bytes = new Uint8Array(P * 3);
  for (let k = 0; k < P * 3; k++) bytes[k] = toByte(val[k]!);
  return { bytes, stats: { method: 'trilinear splat, weighted mean per lattice point; empty points filled pass by pass from their six neighbours', pairs, latticePointsReached: reached, latticePoints: P, fillPasses: passes } };
}

// ---- the command line
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const arg = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const stem = (arg('--stem') ?? 'MP5').toUpperCase() as keyof typeof DAY_STEMS;
  const spec: DayStem | undefined = Object.prototype.hasOwnProperty.call(DAY_STEMS, stem) ? DAY_STEMS[stem] : undefined;
  const disc = arg('--disc') ?? process.env.SOCOM_DISC;
  const s1Dir = arg('--s1') ?? (spec ? process.env[spec.envVar] : undefined);
  const out = arg('--out') ?? join(tmpdir(), 'redotcom-variants', `${stem}-day`);
  if (!spec || !disc || !s1Dir) { console.error(`usage: SOCOM_DISC=<disc tree> SOCOM1_<STEM>_DIR=<input dir> npx tsx tools/variants/buildAbandonedDay.ts [--stem ${Object.keys(DAY_STEMS).join('|')}] [--out <dir>]`); process.exit(2); }
  buildDayVariant(stem, { disc, s1Dir, out }).then((r) => {
    console.log(JSON.stringify({ out: resolve(out), key: r.key, coverage: r.coverage, files: r.files }, null, 1));
  }, (e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
}
