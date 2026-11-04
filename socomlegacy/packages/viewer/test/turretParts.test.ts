import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { flattenScene, parseSceneGraph, turretSceneModels } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap } from '../src/loadMap';

/**
 * MAP-10b's drawn turrets at their own size (socomlegacy/docs/research/79 §2, 215 s3). `turretParts` places the library
 * prototypes' parts beneath each placed turret; their chains are the turret libraries' (`TURR_MDL`, `TLMG_MDL`,
 * `TLRM_MDL`, `T30M_MDL`, ...), which are drawn by command `0x70`, the `'scale'` form. Decoded in the world's `'bias'`
 * form Vigilance's tripod (bbox about +-7 x 17) came out +-1048 x 2048: the owner's mustard "bubbles" over 15 maps.
 * The rule: every decoded vertex of every turret part lies inside its own node's `nparams` bbox, as research 79 found
 * for every visual node of the scaled libraries. Crossroads (the fixture) has an RMG and an LMG; off the disc, MP62
 * adds the 30 mm MGL out of `TURR_MDL`, and MP10 draws its LMG and MGL out of `TLMG` and `T30M` (`'scale'`) and its RMG
 * out of its own `MP10_MDL` (`'bias'`, placed by the map's graph): one model name in both forms, so the form is the
 * archive's, never the model's.
 */
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const absent = fixture('RUN/MP72.ZDB') === null;

/** The disc: the served copies (tools/extract-maps.ts), else `<SOCOM_PC_ROOT>/game/disc`. */
const web = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DISC = [resolve(web, 'public/maps'), ...(process.env.SOCOM_PC_ROOT ? [resolve(process.env.SOCOM_PC_ROOT, 'game/disc')] : [])]
  .find((d) => ['MP62.ZDB', 'MP10.ZDB', 'READERC.ZAR', 'ZWEAPON.ZAR'].every((f) => existsSync(resolve(d, 'RUN', f))));

/**
 * How far outside its bbox a vertex may sit: nothing like the bug's 1000 units. The scaled libraries land inside exactly;
 * MP10's own `'bias'` RMG (sixteenths of a unit) has its belt 0.08 past its bbox's z maximum.
 */
const TOLERANCE = 0.1;

interface PartCheck { models: Set<string>; parts: number; vertices: number; outside: string[] }

async function checkTurretParts(root: string, stem: string): Promise<PartCheck> {
  const map = await loadMap(new FsAssetSource(root), `RUN/${stem}.ZDB`);
  const bytes = await new FsAssetSource(root).read(`RUN/${stem}.ZDB`);
  const toc = parseZdb(bytes);
  const own = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`)));
  const bboxOf = new Map(flattenScene(turretSceneModels(bytes, toc, stem, own), 'worldmodel').map((f) => [f.path, f.node.bbox]));
  const roots = (map.turrets ?? []).map((t) => t.root);
  const under = (path: string): boolean => roots.some((r) => path.startsWith(`${r}/`) || path.startsWith(`${r}=`));
  const out: PartCheck = { models: new Set(), parts: 0, vertices: 0, outside: [] };
  for (const prop of map.props) {
    const path = (prop.paths ?? []).find(under);
    if (path === undefined) continue;
    const bbox = bboxOf.get(path);
    if (!bbox) throw new Error(`${stem}: no node at ${path}`);
    out.models.add(prop.modelName);
    out.parts++;
    for (const mesh of prop.parts) {
      const p = mesh.positions;
      for (let i = 0; i < p.length; i += 3) {
        out.vertices++;
        for (let a = 0; a < 3; a++) {
          if (p[i + a]! < bbox[a]! - TOLERANCE || p[i + a]! > bbox[a + 3]! + TOLERANCE) {
            if (out.outside.length < 5) out.outside.push(`${path} (${mesh.textureName}): axis ${a} ${p[i + a]!.toFixed(2)} outside ${bbox[a]!.toFixed(2)}..${bbox[a + 3]!.toFixed(2)}`);
          }
        }
      }
    }
  }
  return out;
}

describe.skipIf(absent)(`the drawn turrets at their own size${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it("Crossroads' RMG and LMG turrets: every part decoded 'scale' lies in its node's bbox (TURR_MDL; research 79 s2)", async () => {
    const r = await checkTurretParts(FIXTURES, 'MP72');
    expect([...r.models].sort()).toEqual(['LMG_turret', 'RMG_turret']);
    expect(r.parts).toBeGreaterThanOrEqual(10);
    expect(r.vertices).toBeGreaterThan(500);
    expect(r.outside).toEqual([]);
  }, 120_000);
});

describe.skipIf(!DISC)(`the drawn turrets off the disc${DISC ? '' : ' (no public/maps or SOCOM_PC_ROOT disc)'}`, () => {
  it.each([
    ['MP62', ['30mm_MGL_turret', 'RMG_turret']],
    ['MP10', ['30mm_MGL_turret', 'LMG_turret', 'RMG_turret']],
  ])('%s: every turret part lies in its node bbox, the 30 mm MGL included (MP62 TURR_MDL; MP10 TLMG, T30M, its own MP10_MDL)', async (stem, models) => {
    const r = await checkTurretParts(DISC!, stem);
    expect([...r.models].sort()).toEqual(models);
    expect(r.outside).toEqual([]);
  }, 180_000);
});

/**
 * W0 (research 237 §0): a prototype the map's own graph supplies is placed by `placeInstances(models)` already, so the
 * turret join (`turretSceneModels`: the map's models win a name clash) must not place it a second time under the
 * libraries' fallback chunk keys (`N000_000`), which the map's own buffer does not hold -- MP10's `RMG_turret` wrote
 * 14 `chunk <model>/<chunk>: no such chain in the model buffer` notes a load (the three-maps plan's Log, 2026-10-06
 * ~01:00). The case reads MP10 off the disc (no synthetic stand-in: the served maps hold MP10 on this host) and the
 * MP72 fixture.
 */
async function placementsOf(root: string, stem: string): Promise<{ noChain: string[]; turretPaths: string[]; models: Set<string> }> {
  const map = await loadMap(new FsAssetSource(root), `RUN/${stem}.ZDB`);
  const roots = (map.turrets ?? []).map((t) => t.root);
  const under = (path: string): boolean => roots.some((r) => path.startsWith(`${r}/`) || path.startsWith(`${r}=`));
  const turretPaths: string[] = [];
  const models = new Set<string>();
  for (const prop of map.props) {
    for (const path of (prop.paths ?? []).filter(under)) { turretPaths.push(path); models.add(prop.modelName); }
  }
  return { noChain: map.diagnostics.filter((d) => /no such chain/.test(d)), turretPaths, models };
}

describe.skipIf(absent || !DISC)(`a prototype the map's own graph supplies${absent || !DISC ? ' (no MP72 fixture or no MP10 disc)' : ''}`, () => {
  it("a map whose own graph places a turret library's prototype (MP10's RMG) keeps one placement per model and writes no 'no such chain' note; a map without one (MP72) is unchanged", async () => {
    const mp10 = await placementsOf(DISC!, 'MP10');
    expect(mp10.noChain).toEqual([]);
    expect(new Set(mp10.turretPaths).size).toBe(mp10.turretPaths.length);
    expect([...mp10.models].sort()).toEqual(['30mm_MGL_turret', 'LMG_turret', 'RMG_turret']);
    // LATER 166's review F2 (a pin): MP10 is not THERMAL, and its own-graph RMG (placed by `placeInstances(models)`, not
    // `turretParts`) draws no `thermal_scope` either -- `place` filters the whole list (`turretScopeHidden`).
    expect(mp10.turretPaths.filter((p) => p.split('/').some((seg) => seg === 'thermal_scope' || seg.startsWith('thermal_scope='))), 'MP10: no thermal_scope drawn').toEqual([]);
    const mp72 = await placementsOf(FIXTURES, 'MP72');
    expect(mp72.noChain).toEqual([]);
    expect(new Set(mp72.turretPaths).size).toBe(mp72.turretPaths.length);
    expect([...mp72.models].sort()).toEqual(['LMG_turret', 'RMG_turret']);
    expect(mp72.turretPaths.length).toBeGreaterThanOrEqual(10);
  }, 240_000);
});

/**
 * LATER 166 (`@s2u/scene` `turretScopeHidden`; `FUN_003a9a80` D:L300804-300828): Crossroads' two turrets are not THERMAL
 * (research 177), so neither draws its `thermal_scope` node -- the libraries hold that node alone (no `scope`), and the
 * page drew it on every placement. The gun's other parts still draw.
 */
describe.skipIf(absent)(`LATER 166: a plain turret draws no thermal_scope${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it("Crossroads' RMG and LMG (not THERMAL): no placed part beneath a `thermal_scope` node; both guns' other parts drawn", async () => {
    const mp72 = await placementsOf(FIXTURES, 'MP72');
    const scoped = mp72.turretPaths.filter((p) => p.split('/').some((s) => s === 'thermal_scope' || s.startsWith('thermal_scope=')));
    expect(scoped).toEqual([]);
    expect([...mp72.models].sort()).toEqual(['LMG_turret', 'RMG_turret']);
    expect(mp72.turretPaths.filter((p) => /\/gun\//.test(p)).length).toBeGreaterThan(0);
  }, 240_000);
});
