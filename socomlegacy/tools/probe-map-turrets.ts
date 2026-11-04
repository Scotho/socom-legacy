/**
 * Join common ai_turrets.rdr definitions to placed retail map scene nodes (research 177; the package's resolution since
 * MAP-10a, research 215: `@s2u/scene` `parseTurretDefs`, `matchTurretDef`, `turretSceneModels`, `placeTurrets`).
 * npx tsx tools/probe-map-turrets.ts [MP2 MP5 ...]
 * Reads local disc data (public/maps/RUN, test-fixtures/RUN, else $SOCOM_DISC/RUN) and prints metadata only. A placement
 * is a definition match with its three parts; it is not a runtime mount/fire test.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { flattenScene, matchTurretDef, parseSceneGraph, parseTurretDefs, placeTurrets, readArsenal, transformPoint, turretSceneModels } from '@s2u/scene';

const web = resolve(import.meta.dirname, '..');
const dirs = ['public/maps/RUN', 'test-fixtures/RUN', ...(process.env.SOCOM_DISC ? [resolve(process.env.SOCOM_DISC, 'RUN')] : [])].map((d) => resolve(web, d));
const local = (name: string): string => {
  const p = dirs.map((d) => resolve(d, name)).find(existsSync);
  if (!p) throw new Error(`Missing local ${name}.`);
  return p;
};
const under = (p: string, r: string): boolean => p === r || p.startsWith(`${r}/`) || p.startsWith(`${r}=`);
const defs = parseTurretDefs(Zar.parse(new Uint8Array(readFileSync(local('READERC.ZAR')))));
const arsenal = readArsenal(new Uint8Array(readFileSync(local('ZWEAPON.ZAR'))));
let stems = process.argv.slice(2).map((s) => s.toUpperCase());
if (!stems.length) stems = [...new Set(dirs.filter(existsSync).flatMap((d) => readdirSync(d))
  .filter((n) => /^MP\d+\.ZDB$/i.test(n)).map((n) => n.toUpperCase().replace(/\.ZDB$/, '')))];
stems.sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
let total = 0;
for (const stem of stems) {
  if (!/^MP\d+$/.test(stem)) throw new Error(`Expected an MP archive stem, got ${stem}.`);
  const bytes = new Uint8Array(readFileSync(local(`${stem}.ZDB`))), toc = parseZdb(bytes);
  const mapModels = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`)));
  const models = turretSceneModels(bytes, toc, stem, mapModels);
  const excluded: string[] = [];
  const placed = placeTurrets(models, defs, arsenal, (line) => excluded.push(line));
  total += placed.length;
  const flat = flattenScene(models);
  const matched = flat.filter((f) => matchTurretDef(defs, f.node.name));
  console.log(JSON.stringify({
    archive: stem, placements: placed.length, excluded,
    turrets: placed.map((t) => ({
      id: t.id, root: t.root, definition: t.def.name,
      // Every definition whose name begins the node's, in file order: the first is the one taken (FUN_003aac40).
      matchingDefinitions: defs.filter((d) => d.name.length > 0 && t.name.startsWith(d.name)).map((d) => d.name),
      parts: t.parts, at: t.origin.map((n) => Math.round(n * 1000) / 1000),
      manual: t.def.manual, thermal: t.def.thermal, health: t.def.health, range: t.mountRange, angle: t.def.mountAngle,
      weapon: t.weapon, ammo: t.def.ammo, ammoInit: t.ammoInit, yaw: t.def.limitsDeg.yaw, pitch: t.def.limitsDeg.pitch,
      rates: t.def.rates, team: t.def.team,
    })),
    unmatchedTurretNames: flat.filter((f) => /turret/i.test(f.node.name) && !matched.some((m) => under(f.path, m.path)))
      .map((f) => ({ path: f.path, model: f.node.modelName, at: transformPoint(f.world, 0, 0, 0).map((n) => Math.round(n * 1000) / 1000) })),
  }));
}
console.log(JSON.stringify({ maps: stems.length, placements: total }));
