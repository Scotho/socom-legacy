import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_STEMS, parseRdr, parseZdb, rdrGet, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import { parseEscortees, parseSceneGraph, type SceneNode } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { HOSTAGE_COVER_OBJECTS_READING, HOSTAGE_FLEE_WALK_OBSTACLES_READING } from '../src/hostageDanger';
import { HOSTAGE_DYNAMIC_FOOTPRINT_READING } from '../src/hostageObstacles';

/**
 * Research 445 s7 and 335 s5 (reading, pending review): the hostages' AI overlay list -- r0001 0x66a0b8 (its first node at
 * +8, 0x66a0c0), r0004 0x669a38 -- has ONE producer, `CVehicle::Init` (r0001 `FUN_003adab0` D:L303286, r0004 `FUN_003cfc00`
 * D4:L328877, its `AddOverlay` call), reached only from `CVehicle`'s constructor by TWO paths, both over `ai_vehicles.rdr`'s
 * `VEHICLE` definitions: (1) `LoadVehicles` -> `ScanForVehicleDefinitionHookups`, a scene node whose name STARTS WITH a
 * definition's name (D:L303489-303490); (2) `CVehicle::Spawn` (`FUN_003ae030`, D:L156070-156072) for each record of the
 * map's own `READERM.ZAR/vehicles.rdr` that `CVehicleRdrEntry::Load` (`FUN_00533370`) makes kind 2 -- a record with the key
 * `vehicle` (D:L400427-400437) -- whose scene node is matched by EQUALITY with the record's `name` (D:L303067), any name.
 * So on a map with hostages and no vehicle by either path the list is empty: no object covers a cell, the flight's walk stops
 * on the soil alone, no dynamic footprint. A vehicle is found here by: a scene node or model whose name contains a
 * definition's or its collision box's name (path 1, a superset of the original's case-sensitive "starts with"), or a
 * `vehicle` tag at ANY depth of a `vehicles.rdr` record, compared case-sensitively as the original's depth-first
 * `zrdr_findstring` does (path 2; stricter than the original, which tries `character` first).
 * THE SCOPE this test pins: every map on the disc -- the 22 multiplayer maps and the campaign's 12 (`CAMPAIGN_STEMS`, which
 * the forge and the test room load) -- is read; the maps with hostages are pinned exactly, and so are the maps with hostages
 * AND a vehicle: exactly one, the campaign's M71 (its `tank1`), where the readings do NOT hold (the original's list holds the
 * tank's footprint; the port's vehicle producer is unported, `HOSTAGE_DYNAMIC_FOOTPRINT_READING`). The readings hold on the
 * multiplayer maps with hostages. A new map with hostages, or a new vehicle on one, fails here.
 * Without the disc: the committed fixtures (a subset, said).
 */

const DISC = process.env.SOCOM_DISC;
const discRun = DISC && existsSync(resolve(DISC, 'RUN')) ? resolve(DISC, 'RUN') : null;

function zdbs(): { stem: string; bytes: Uint8Array }[] {
  if (discRun) {
    const campaign = new Set<string>(CAMPAIGN_STEMS);
    return readdirSync(discRun).filter((f) => /^MP\d+\.ZDB$/i.test(f) || campaign.has(f.replace(/\.ZDB$/i, '').toUpperCase())).sort()
      .map((f) => ({ stem: f.replace(/\.ZDB$/i, ''), bytes: new Uint8Array(readFileSync(resolve(discRun, f))) }));
  }
  return ['MP2', 'MP6', 'MP11', 'MP71', 'MP72']
    .map((stem) => ({ stem, bytes: fixture(`RUN/${stem}.ZDB`) }))
    .filter((z): z is { stem: string; bytes: Uint8Array } => z.bytes !== null);
}

const common = discRun && existsSync(resolve(discRun, 'READERC.ZAR'))
  ? new Uint8Array(readFileSync(resolve(discRun, 'READERC.ZAR'))) : fixture('RUN/READERC.ZAR');

/** The configured vehicles' names and their `COLLISION_BBOX` nodes, read off `ai_vehicles.rdr` (research 335 s5). */
function vehicleNames(bytes: Uint8Array): string[] {
  const zar = Zar.parse(bytes);
  const entry = zar.root.children.find((k: { name: string }) => k.name.toLowerCase() === 'ai_vehicles.rdr');
  if (!entry) throw new Error('READERC.ZAR holds no ai_vehicles.rdr');
  const names: string[] = [];
  const visit = (node: RdrNode): void => {
    if (!Array.isArray(node)) return;
    for (let i = 0; i < node.length; i++) {
      const item = node[i];
      if (item === 'VEHICLE' && Array.isArray(node[i + 1])) {
        const defs = node[i + 1] as RdrNode[];
        for (let j = 0; j + 1 < defs.length; j += 2) {
          names.push(String(defs[j]));
          const fields = defs[j + 1] as RdrNode[];
          const k = fields.indexOf('COLLISION_BBOX');
          if (k >= 0) names.push(...(fields[k + 1] as RdrNode[]).map(String));
        }
      } else visit(item as RdrNode);
    }
  };
  visit(parseRdr(zar.data(entry)));
  return names.map((n) => n.toLowerCase());
}

/** The map's `READERM.ZAR/vehicles.rdr` tree, or null when the map has none; a member that fails to parse throws (F3). */
function vehiclesRdr(zdb: Uint8Array): RdrNode | null {
  const readerm = Zar.parse(zdbMember(zdb, parseZdb(zdb), 'READERM.ZAR'));
  const entry = readerm.root.children.find((k: { name: string }) => k.name.toLowerCase() === 'vehicles.rdr');
  return entry ? parseRdr(readerm.data(entry)) : null;
}

/** The records of a `vehicles.rdr` tree, as `parseEscortees` walks them (scene `escortees.ts`, `recordsOf`). */
function recordsOf(root: RdrNode): RdrNode[][] {
  let n: RdrNode = root;
  while (Array.isArray(n) && n.length === 1 && Array.isArray(n[0])) n = n[0];
  if (!Array.isArray(n)) return [];
  return typeof n[0] === 'string' ? [n] : n.filter((r): r is RdrNode[] => Array.isArray(r));
}

/** Path 2: a `vehicle` tag anywhere in the record (the original's lookup recurses into every nested list). */
function hasVehicleTag(node: RdrNode): boolean {
  return typeof node === 'string' ? node === 'vehicle' : node.some(hasVehicleTag);
}

/** Every reason the map builds a CVehicle (paths 1 and 2), empty when none. */
function vehicleHits(stem: string, bytes: Uint8Array, vehicles: RdrNode, names: readonly string[]): string[] {
  const hits: string[] = [];
  for (const record of recordsOf(vehicles)) {
    if (hasVehicleTag(record)) hits.push(`record ${String(rdrGet(record, 'name'))} has a vehicle tag`);
  }
  const roots = parseSceneGraph(Zar.parse(zdbMember(bytes, parseZdb(bytes), `${stem}_GEO.ZED`)));
  let visited = 0;
  const walk = (node: SceneNode): void => {
    visited++;
    for (const name of [node.name, node.modelName]) if (name && names.some((n) => name.toLowerCase().includes(n))) hits.push(`node ${name}`);
    node.children.forEach(walk);
  };
  roots.forEach(walk);
  if (visited === 0) throw new Error(`${stem}: no scene nodes read`);
  return hits;
}

const maps = zdbs();
const source = discRun ? 'SOCOM_DISC' : `the fixtures (${maps.map((m) => m.stem).join(', ') || FIXTURES_ABSENT})`;

describe('the hostages\' overlay readings (research 445 s7, 335 s5; reading, pending review)', () => {
  it('cover meets no object, the flight walks on the soil alone, no dynamic footprint: the empty overlay list', () => {
    expect(HOSTAGE_COVER_OBJECTS_READING).toBe('none');
    expect(HOSTAGE_FLEE_WALK_OBSTACLES_READING).toBe('the soil alone');
    expect(HOSTAGE_DYNAMIC_FOOTPRINT_READING).toBe('none on a hostage map but M71');
  });
});

describe.skipIf(!common || maps.length === 0)(`the scope: the maps with hostages and a vehicle (dev-disc; ${source})`, () => {
  it('reads the configured vehicles off ai_vehicles.rdr (tank1, drugplane and their collision boxes, research 335 s5)', () => {
    expect(vehicleNames(common!)).toEqual(['tank1', 't72tankdi', 'drugplane', 'planedi_invis']);
  });

  it('pins every map with hostages, and the ones among them with a vehicle: on the disc, M71 alone (its tank1)', () => {
    const names = vehicleNames(common!);
    const hostageMaps: string[] = [];
    const withVehicle: Record<string, string[]> = {};
    for (const { stem, bytes } of maps) {
      const vehicles = vehiclesRdr(bytes);
      if (!vehicles || parseEscortees(vehicles).length === 0) continue;
      hostageMaps.push(stem);
      const hits = vehicleHits(stem, bytes, vehicles, names);
      if (hits.length > 0) withVehicle[stem] = hits;
    }
    expect(hostageMaps.length, `no map with hostages among ${source}`).toBeGreaterThan(0);
    if (discRun) {
      expect(maps.length, "the disc's 22 multiplayer maps and the campaign's 12 are all read").toBe(34);
      expect(hostageMaps).toEqual(['M51', 'M52', 'M61', 'M71', 'M73', 'M83', 'MP10', 'MP11', 'MP52', 'MP53', 'MP6', 'MP71', 'MP82']);
      expect(withVehicle).toEqual({ M71: ['node tank1'] });
    } else {
      expect(withVehicle, 'a fixture map with hostages has a vehicle').toEqual({});
    }
  });
});
