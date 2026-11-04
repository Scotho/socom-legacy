// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Box3, LessEqualDepth, LineSegments, Mesh, type Material, type Object3D } from 'three';
import { CAMPAIGN_STEMS, parseZdb } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { GS_REG, parseTextureRecord } from '@s2u/gs';
import { loadMap } from '../src/loadMap';
import { textureLibrary } from '../src/mapTextures';
import { buildWorld } from '../src/world';

/**
 * NU-15 B2 (PARITY-2; research 330 §5 B2): every map's walk draws write depth, and every env and detail pass writes none
 * and tests less-or-equal, off the dev disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped -- and said so --
 * without it; with it, a map file missing is a failure, not a skip).
 *
 * Each of the 22 multiplayer and 12 campaign archives (`CAMPAIGN_STEMS`, the M51-M83 roots of `world-roots.json`) is
 * loaded through `loadMap` and built as the menu match builds it (`buildWorld`, every reveal task run, no toggle: three's
 * order, the default). The original writes depth under every draw of the walk (`RenderWorld` opens with
 * `FUN_003b7150(0)`, D:L236792 -> `FUN_003afe70` D:L304682-304710, `ZBUF_1.ZMSK` 0), and tests it on the water's passes.
 *
 * **A walk draw** is a world or prop object (a mesh, an instanced mesh, a LOD copy at rest, a flare, a line-strip group)
 * that is neither a shadow decal nor in the alpha pass. The test reads it off the view itself: the engine order writes
 * depth under every such draw and under no other (`drawState`'s engine branch; `alphaPassState`; the decal's own state,
 * `world.ts` `apply`), so the objects that write depth with `setEngineOrder(true)` are the walk's. The world's parts are
 * held to the disc's own flags as well: the first `map.world.length` objects are `map.world` in order, and each is a
 * walk draw exactly when its part is not `alphaPass` and its texture is not a `shadow*.tif`.
 *
 * Recorded per map (printed, not asserted): the walk draws, the blended ones among them (three's transparent list, the
 * draws B1 changes), the ones writing no depth (RED before B1), the alpha-pass and decal draws, the LOD copies (research
 * 330's NU15-W3), the env and detail passes, the env textures with their bind packet's raw `TEST_1`, and the bounds of
 * the draws that carry an env pass (`reflect > 0`; `MP71_WATER_EXTENT_READING`).
 *
 * `TEST_1` is read raw from the texture's own bind packet (the A+D quadwords after the pixels, `@s2u/gs` `texture.ts`'s
 * `findGsState`, register 0x47), because `decodeTest` reads `ZTE` alone and `decodeGsState` defaults it on without a
 * `TEST` register (`gsState.ts:72-76`, `:118`; research 330's review, F1). The env pass's state is its texture's bind
 * packet (`FUN_003549b0` D:L252528-252530, copied at D:L307770): MP71's `congo4s_sky01.tif` must hold `ZTE` 1 and `ZTST`
 * 2, GEQUAL (`ENV_PASS_TEST_READING`).
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '';
/** The 22 multiplayer maps (`packages/scene/test/golden/scene-graphs.json`) and the 12 campaign missions. */
const MP = ['MP1', 'MP2', 'MP5', 'MP6', 'MP7', 'MP8', 'MP9', 'MP10', 'MP11', 'MP12', 'MP51', 'MP52', 'MP53', 'MP61', 'MP62',
  'MP64', 'MP71', 'MP72', 'MP73', 'MP81', 'MP82', 'MP83'];
const MAPS = [...MP, ...CAMPAIGN_STEMS];
const SHADOW = /shadow/i;
/** `@s2u/gs` `texture.ts`: TEXTURE_PARAMS (16 bytes) and the 16-byte prefix before the pixels; a 9-quadword bind packet after. */
const BIND_AT = 16 + 16, BIND_QWC = 9;

/** The raw `TEST_1` of a texture's bind packet, through the map's own library chain (`textureLibrary`), or null. */
function rawTest(bytes: Uint8Array, stem: string, name: string): bigint | null {
  const lib = textureLibrary(bytes, parseZdb(bytes), stem, { add: () => {} });
  const hit = lib?.keys.get(name);
  const texdat = hit ? hit.zar.child(hit.key, 'texdat') : undefined;
  if (!hit || !texdat) return null;
  const data = hit.zar.data(texdat);
  const at = BIND_AT + parseTextureRecord(hit.key.name, data).size;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let o = at; o + 16 <= Math.min(at + BIND_QWC * 16, data.length); o += 16) {
    if (view.getUint8(o + 8) === GS_REG.TEST_1) return view.getBigUint64(o, true);
  }
  return null;
}
/** `TEST`'s depth fields (GS manual): `ZTE` bit 16, `ZTST` bits 17-18 (0 NEVER, 1 ALWAYS, 2 GEQUAL, 3 GREATER). */
const zte = (q: bigint): number => Number((q >> 16n) & 1n);
const ztst = (q: bigint): number => Number((q >> 17n) & 3n);

const materialOf = (o: Object3D): Material | null => (o instanceof Mesh || o instanceof LineSegments ? o.material as Material : null);
const round = (v: number): number => Math.round(v);

interface Row {
  stem: string; walk: number; blended: number; noDepth: number; afterWalk: number; lod: number; env: number; detail: number;
  envTextures: string; bounds: string;
}
const rows: Row[] = [];

afterAll(() => {
  if (rows.length === 0) return;
  console.log(['stem | walk | blended walk | walk writing no depth | alpha pass + decals | LOD copies | env | detail | env TEST_1 | union of the reflecting draws (min..max, map units)',
    ...rows.map((r) => [r.stem, r.walk, r.blended, r.noDepth, r.afterWalk, r.lod, r.env, r.detail, r.envTextures, r.bounds].join(' | '))].join('\n'));
});

describe.skipIf(!HAVE_DISC)(`NU-15 B2: the walk writes depth, the passes test it, on every map${HAVE_DISC ? '' : ' (no dev disc: SOCOM_DISC or SOCOM_PC_ROOT -- skipped)'}`, () => {
  for (const stem of MAPS) {
    it(`${stem}: every walk draw writes depth in three's order; every env and detail pass writes none and tests less-or-equal`, async () => {
      const file = join(DISC, 'RUN', `${stem}.ZDB`);
      expect(existsSync(file), `${file} on the dev disc`).toBe(true);
      const map = await loadMap(new FsAssetSource(DISC), `RUN/${stem}.ZDB`);
      const view = buildWorld(map);
      try {
        for (const task of [...view.revealWorld, ...view.revealProps]) task();
        view.group.updateMatrixWorld(true);
        const objects = view.group.children.filter((o) => materialOf(o) !== null);
        // The default order, as the match builds it.
        const three = objects.map((o) => ({ transparent: materialOf(o)!.transparent, depthWrite: materialOf(o)!.depthWrite }));
        view.setEngineOrder(true);
        const walk = objects.map((o) => materialOf(o)!.depthWrite);
        view.setEngineOrder(false);
        // The world's parts against the disc's flags: walk exactly when not the alpha pass and not a decal.
        for (const [i, part] of map.world.entries()) {
          const want = part.alphaPass !== true && !SHADOW.test(part.textureName ?? '');
          expect(walk[i], `${stem} world part ${i} (${part.textureName}) is a walk draw`).toBe(want);
        }
        const failing = objects.filter((o, i) => walk[i] && !three[i]!.depthWrite).map((o) => o.name);
        // The passes, at any depth under a walk draw.
        const passes: Mesh[] = [];
        for (const o of objects) o.traverse((c) => { if (c !== o && c instanceof Mesh && / \((env|detail)\)$/.test(c.name)) passes.push(c); });
        const env = passes.filter((p) => p.name.endsWith(' (env)'));
        for (const p of passes) {
          const m = p.material as Material;
          expect({ depthWrite: m.depthWrite, depthFunc: m.depthFunc }, `${stem} ${p.name}`).toEqual({ depthWrite: false, depthFunc: LessEqualDepth });
        }
        // The env textures and their raw `TEST_1`; the draws that carry an env pass and their extent.
        const bytes = new Uint8Array(readFileSync(file));
        const tests = new Map((map.envMaterials ?? []).map((e) => [e.texture, rawTest(bytes, stem, e.texture)] as const));
        const union = new Box3();
        for (const p of env) union.union(new Box3().setFromObject(p.parent!));
        const envNames = [...new Set(env.map((p) => (p.material as Material).name.replace(/^env /, '')))].sort();
        rows.push({
          stem, walk: walk.filter(Boolean).length, blended: objects.filter((_, i) => walk[i] && three[i]!.transparent).length,
          noDepth: failing.length, afterWalk: walk.filter((w) => !w).length, lod: objects.filter((o) => o.name.endsWith(' (lod)')).length,
          env: env.length, detail: passes.length - env.length,
          envTextures: [...tests].map(([t, q]) => `${t}${envNames.includes(t) ? '' : ' (no draw)'} ${q === null ? 'none' : `0x${q.toString(16)}`}`).join(', ') || '-',
          bounds: env.length === 0 ? '-' : `(${round(union.min.x)}, ${round(union.min.y)}, ${round(union.min.z)})..(${round(union.max.x)}, ${round(union.max.y)}, ${round(union.max.z)})`,
        });
        if (stem === 'MP71') {
          // MP71's water: the env pass on `congo4s_sky01.tif` (`palEntry_1`), its `TEST_1` GEQUAL with the test on.
          expect(envNames).toContain('congo4s_sky01.tif');
          const q = tests.get('congo4s_sky01.tif') ?? null;
          expect(q, 'congo4s_sky01.tif TEST_1').not.toBeNull();
          console.log(`MP71 congo4s_sky01.tif TEST_1 0x${q!.toString(16)}: ZTE ${zte(q!)}, ZTST ${ztst(q!)}`);
          expect([zte(q!), ztst(q!)]).toEqual([1, 2]);
          // Each reflecting draw's own extent (MP71_WATER_EXTENT_READING), in map units, beside the map's.
          const extent = view.box;
          console.log(`MP71 the map's extent: (${round(extent.min.x)}, ${round(extent.min.y)}, ${round(extent.min.z)})..(${round(extent.max.x)}, ${round(extent.max.y)}, ${round(extent.max.z)})`);
          for (const p of env) {
            const b = new Box3().setFromObject(p.parent!);
            console.log(`MP71 reflecting ${p.parent!.name}${p.parent!.visible ? '' : ' (hidden)'}: (${round(b.min.x)}, ${round(b.min.y)}, ${round(b.min.z)})..(${round(b.max.x)}, ${round(b.max.y)}, ${round(b.max.z)})`);
          }
        }
        // The rule: no walk draw writes no depth (NU-15 B1). Named, so a RED lists the draws.
        expect(failing.length, `${stem}: ${failing.length} walk draws writing no depth in three's order (${failing.slice(0, 6).join(', ')})`).toBe(0);
      } finally {
        view.dispose();
      }
    }, 240_000);
  }
});
