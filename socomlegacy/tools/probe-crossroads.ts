/**
 * Crossroads' two environmental bridge switches, measured from a locally supplied MP72 archive.
 * No extraction: prints record/node metadata and full-map segment intersections only.
 *
 *   npx tsx tools/probe-crossroads.ts [path/to/MP72.ZDB]
 *
 * Node-ref initial states: `_zanim_node_ref` (reCOM zanim.h:417-435), retail FUN_0026b5e0
 * (decomp 115740-115750): bit 31 deactivates before bit 28 saves the node's active state.
 * The state comparison changes owner active bits in memory; it is a geometry probe, not a
 * capsule movement, alternate-route, original-console, or network-parity test.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, parseZdb, rdrGet, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import {
  buildGrid, collisionOwners, flattenScene, parseAnimSets, parseGridParams, parseSceneGraph,
  segmentHits, surfaceWord, SURFACE_SKIP, transformPoint, worldCollision,
} from '@s2u/scene';

const web = resolve(import.meta.dirname, '..');
const supplied = process.argv[2];
const source = supplied ? resolve(supplied) : [
  resolve(web, 'test-fixtures/RUN/MP72.ZDB'), resolve(web, 'public/maps/RUN/MP72.ZDB'),
].find(existsSync);
if (!source) throw new Error('Supply a local MP72.ZDB or extract it into test-fixtures/RUN.');
const bytes = new Uint8Array(readFileSync(source)), toc = parseZdb(bytes);
const member = (name: string): Zar => Zar.parse(zdbMember(bytes, toc, name));
const reader = member('READERM.ZAR');
const actionsKey = reader.root.children.find((k) => k.name.toLowerCase() === 'actions.rdr');
if (!actionsKey) throw new Error('MP72 READERM.ZAR has no actions.rdr.');
const script = parseRdr(reader.data(actionsKey));
const raw = rdrGet(script, 'actions');
if (!Array.isArray(raw)) throw new Error('actions.rdr has no actions list.');
const one = (record: RdrNode, key: string): string => {
  const value = rdrGet(record, key);
  return typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
};
const actions = raw.filter((r) => Array.isArray(r) && one(r, 'type') === 'SWITCH');
const animations = parseAnimSets(member('MZANIM.ZAR')).sets.flatMap((s) => s.anims);
const models = parseSceneGraph(member('MP72_GEO.ZED'));
const flat = flattenScene(models), polys = worldCollision(models), owners = collisionOwners(models);
const grid = buildGrid(parseGridParams(member('MP72.ZED')), [], [], polys, owners);
const round = (n: number): number => Math.round(n * 1000) / 1000;
const under = (path: string, parent: string): boolean => path === parent || path.startsWith(`${parent}/`) || path.startsWith(`${parent}=`);

const bridges = actions.map((record) => {
  const node = one(record, 'node'), animation = one(record, 'anim');
  const program = animations.find((a) => a.name === animation);
  if (!program) throw new Error(`Missing switch animation ${animation}.`);
  const rootName = program.nodeRefs[program.params.rootNodeIndex]?.name;
  const root = flat.find((f) => f.node.name === rootName);
  const trigger = flat.find((f) => f.node.name === node);
  if (!root || !trigger) throw new Error(`Unplaced bridge or switch: ${rootName}, ${node}.`);
  const refs = program.nodeRefs.filter((r) => ['healthy', 'destroyed', 'parts'].includes(r.name)).map((r) => {
    const placed = flat.find((f) => under(f.path, root.path) && f.node.name === r.name);
    if (!placed) throw new Error(`Unresolved ${root.path}/${r.name}.`);
    return {
      name: r.name, path: placed.path, word: `0x${r.word.toString(16)}`,
      initiallyInactive: (r.word >>> 31) !== 0, saveActive: (r.word & 0x10000000) !== 0,
      polygons: owners.filter((o) => under(o.path, placed.path)).reduce((n, o) => n + o.count, 0),
    };
  });
  return { node, animation, root, trigger, refs, record };
});
if (bridges.length !== 2) throw new Error(`Expected MP72's two switches, found ${bridges.length}.`);

console.log(JSON.stringify({ source, kind: 'bridge geometry probe', switches: bridges.length }));
for (const bridge of bridges) {
  console.log(JSON.stringify({
    switch: bridge.node, valve: one(bridge.record, 'valve'), animation: bridge.animation,
    range: Number(one(bridge.record, 'range')), elevation: one(bridge.record, 'elevation') || 'default -1',
    points: Number(one(bridge.record, 'points')), bitmap: one(bridge.record, 'bitmap'),
    triggerAt: transformPoint(bridge.trigger.world, 0, 0, 0).map(round),
    bridgeRoot: bridge.root.path, bridgeAt: transformPoint(bridge.root.world, 0, 0, 0).map(round),
    states: bridge.refs,
  }));
}

for (const bridge of bridges) {
  // The authored road passes across x under each arch; y=54 is above the 42.5-unit street floor.
  const [x, , z] = transformPoint(bridge.root.world, 0, 0, 0);
  const a: [number, number, number] = [x - 67, 54, z - 1];
  const b: [number, number, number] = [x + 53, 54, z - 1];
  const results = (['intact', 'destroyed'] as const).map((state) => {
    for (const item of bridges) {
      const activeState = item === bridge && state === 'destroyed' ? 'destroyed' : 'healthy';
      for (const ref of item.refs) for (const owner of owners) {
        if (!under(owner.path, ref.path)) continue;
        owner.flags = ref.name === activeState ? (owner.flags ?? 0) | 1 : (owner.flags ?? 0) & ~1;
      }
    }
    const hits = segmentHits(grid, a, b, (p) => (surfaceWord(p) & SURFACE_SKIP) === 0);
    return { state, hits: hits.map((h) => ({ point: h.point.map(round), path: h.owner.path })) };
  });
  console.log(JSON.stringify({ bridge: bridge.root.path, from: a.map(round), to: b.map(round), results }));
}
