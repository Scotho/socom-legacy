/**
 * Research 98: metadata-only audit of the six retail Demolition map archives.
 * Supply the user's extracted RUN directory with --run; no asset is extracted or written.
 *
 * npx tsx tools/probe-demolition-maps.ts > test-fixtures/research/demolition-summary.json
 * npx tsx tools/probe-demolition-maps.ts MP83 --programs
 * npx tsx tools/probe-demolition-maps.ts MP7 --animation spinner_hit
 * npx tsx tools/probe-demolition-maps.ts MP83 --animation access --barrier-probes
 *
 * Decoded operations are research aids, not a general mission interpreter: the current
 * effect decoder omits WHILE predicates and valve operand-reference flags. Raw bytes
 * are intentionally not printed; use dump-effects.ts for local command inspection.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseRdr, parseZdb, rdrGet, Zar, zdbMember, type RdrNode, type ZarKey } from '@s2u/archive';
import {
  aiCellCentre, aiCellIndex, buildGrid, collisionOwners, decodeEffectProgram, flattenScene, parseAiMaps,
  parseAnimSets, parseGridParams, parseSceneGraph, parseWorldRoot, segmentHits, surfaceWord, SURFACE_SKIP, transformPoint, worldCollision,
} from '@s2u/scene';

const args = process.argv.slice(2);
const option = (key: string): string | undefined => {
  const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1];
};
const run = resolve(option('--run') ?? resolve(import.meta.dirname, '../public/maps/RUN'));
const requested = args.filter((x) => /^MP\d+$/i.test(x)).map((x) => x.toUpperCase());
const stems = requested.length ? requested : ['MP1', 'MP7', 'MP9', 'MP12', 'MP72', 'MP83'];
const readerc = Zar.parse(new Uint8Array(readFileSync(resolve(run, 'READERC.ZAR'))));
function script(zar: Zar, name: string): RdrNode {
  const key = zar.root.children.find((k) => k.name.toLowerCase() === name.toLowerCase());
  return key ? parseRdr(zar.data(key)) : [];
}
function scalar(record: RdrNode, key: string): string | null {
  const v = rdrGet(record, key);
  return typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null;
}
function object(record: RdrNode): Record<string, RdrNode> {
  if (!Array.isArray(record)) return {};
  return Object.fromEntries(record.flatMap((v, i) => typeof v === 'string' && Array.isArray(record[i + 1]) ? [[v, record[i + 1]!]] : []));
}
function records(root: RdrNode): RdrNode[] {
  if (!Array.isArray(root)) return [];
  if (root.some((v) => typeof v === 'string')) return [root];
  return root.flatMap(records);
}
const missions = records(script(readerc, 'missionlist.rdr'));
const under = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}=`);
const round = (n: number): number => Math.round(n * 1000) / 1000;
const report = stems.map((stem) => {
  const bytes = new Uint8Array(readFileSync(resolve(run, `${stem}.ZDB`))), toc = parseZdb(bytes);
  const member = (name: string): Zar => Zar.parse(zdbMember(bytes, toc, name));
  const rdr = member('READERM.ZAR'), geo = parseSceneGraph(member(`${stem}_GEO.ZED`));
  const flat = flattenScene(geo), owners = collisionOwners(geo);
  const placed = (name: string) => flat.filter((f) => f.node.name.toLowerCase() === name.toLowerCase()).map((f) => ({
    path: f.path, at: transformPoint(f.world, 0, 0, 0).map(round), flags: `0x${f.node.flags.toString(16)}`,
    localBounds: Array.from(f.node.bbox).map(round),
    worldBounds: (() => {
      const b = f.node.bbox;
      const corners = Array.from({ length: 8 }, (_, i) => transformPoint(f.world, b[(i & 1) ? 3 : 0]!, b[(i & 2) ? 4 : 1]!, b[(i & 4) ? 5 : 2]!));
      return [0, 1, 2].map((axis) => round(Math.min(...corners.map((p) => p[axis]!)))).concat([0, 1, 2].map((axis) => round(Math.max(...corners.map((p) => p[axis]!)))));
    })(),
    polygons: owners.filter((o) => under(o.path, f.path)).reduce((n, o) => n + o.count, 0),
  }));
  const actionList = rdrGet(script(rdr, 'actions.rdr'), 'actions');
  const actions = Array.isArray(actionList) ? actionList.filter((r) => Array.isArray(r) && scalar(r, 'node')).map((r) => ({
    ...object(r), placements: placed(scalar(r, 'node')!),
  })) : [];
  const ai = parseAiMaps(zdbMember(bytes, toc, 'AIMAPS.MPS'));
  const animZar = member('MZANIM.ZAR');
  const anims = parseAnimSets(animZar).sets.flatMap((s) => s.anims);
  const animKeys = animZar.child(animZar.root, 'Anim_Sets')!.children.flatMap((s) => animZar.child(s, 'Animation_List')?.children ?? []);
  const health = (ordinal: number) => {
    const k = animZar.child(animKeys[ordinal]!, 'Anim_Health');
    if (!k) return null;
    if (k.size !== 24) throw new Error(`${stem} animation ${ordinal}: unexpected Anim_Health length ${k.size}`);
    const data = animZar.data(k), d = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return { offset: k.offset, offsetInZar: animZar.dataOffset + k.offset, nodeRefIndex: d.getUint8(0), hp: d.getFloat32(4, true), maxHp: d.getFloat32(8, true), armor: d.getFloat32(12, true), maxArmor: d.getFloat32(16, true), shield: d.getFloat32(20, true) };
  };
  const worldZar = member(`${stem}.ZED`);
  const keyMeta = (key: ZarKey): object => ({ name: key.name, size: key.size, offsetInZar: worldZar.dataOffset + key.offset,
    children: key.children.map(keyMeta),
    ...(key.size > 0 && key.size <= 256 ? { strings: new TextDecoder().decode(worldZar.data(key)).match(/[ -~]{4,}/g) ?? [] } : {}),
  });
  const commonZar = member('CZANIM.ZAR');
  const commonAnimations = parseAnimSets(commonZar).sets.flatMap((s) => s.anims);
  const commonKeys = commonZar.child(commonZar.root, 'Anim_Sets')!.children.flatMap((s) => commonZar.child(s, 'Animation_List')?.children ?? []);
  const commonHealth = commonAnimations.flatMap((a, ordinal) => {
    const k = commonZar.child(commonKeys[ordinal]!, 'Anim_Health');
    if (!k) return [];
    const data = commonZar.data(k), d = new DataView(data.buffer, data.byteOffset, data.byteLength), nodeRefIndex = d.getUint8(0);
    return [{ ordinal, name: a.name, flags: a.params.flags, root: a.nodeRefs[a.params.rootNodeIndex]?.name ?? null,
      target: a.nodeRefs[nodeRefIndex]?.name ?? null, nodeRefIndex, hp: d.getFloat32(4, true), shield: d.getFloat32(20, true),
      offsetInZar: commonZar.dataOffset + k.offset,
      roots: placed(a.nodeRefs[a.params.rootNodeIndex]?.name ?? 'NA'),
      program: decodeEffectProgram(a),
    }];
  });
  const selected = option('--animation');
  const barrierProbes = () => {
    if (stem !== 'MP83' || !args.includes('--barrier-probes')) return undefined;
    const probeOwners = collisionOwners(geo), polys = worldCollision(geo);
    const grid = buildGrid(parseGridParams(member(`${stem}.ZED`)), [], [], polys, probeOwners);
    return ['access1', 'access2'].flatMap((rootName) => {
      const root = placed(rootName)[0]!;
      return [8, 12, 18].map((height) => {
        const a: [number, number, number] = [root.at[0]!, root.worldBounds[1]! + height, root.at[2]! - 12];
        const b: [number, number, number] = [a[0], a[1], root.at[2]! + 12];
        const results = ['intact', 'destroyed'].map((state) => {
          for (const name of ['access1', 'access2']) {
            const isDestroyed = name === rootName && state === 'destroyed';
            for (const owner of probeOwners) {
              if (!under(owner.path, `worldmodel/${name}`)) continue;
              const on = owner.path.includes('/good_parts') ? !isDestroyed : owner.path.includes('/whats_left') ? isDestroyed : false;
              owner.flags = on ? (owner.flags ?? 0) | 1 : (owner.flags ?? 0) & ~1;
            }
          }
          return { state, hits: segmentHits(grid, a, b, (p) => (surfaceWord(p) & SURFACE_SKIP) === 0)
            .map((h) => ({ at: h.point.map(round), path: h.owner.path })) };
        });
        return { rootName, height, from: a, to: b, results };
      });
    });
  };
  return {
    stem, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    archiveMembers: toc.map((e) => e.name),
    mission: object(missions.find((m) => scalar(m, 'NUMBER') === stem.slice(2)) ?? []),
    turretDefinitions: script(readerc, 'ai_turrets.rdr'),
    sourceMembers: toc.filter((e) => /(?:READERM\.ZAR|MZANIM\.ZAR|AIMAPS\.MPS|_GEO\.ZED|MP\d+\.ZED)$/.test(e.name)),
    readerFiles: rdr.root.children.map((k) => k.name), actions,
    valves: script(rdr, 'valves.rdr'), vehicles: script(rdr, 'vehicles.rdr'),
    missionScript: script(rdr, 'mission.rdr'), mapScript: script(rdr, 'map.rdr'),
    mapSettings: script(rdr, `${stem.toLowerCase()}.rdr`), networkScript: script(rdr, 'net_000.rdr'),
    dynamicTextures: script(rdr, 'dyntex.rdr'), rawWorldKeys: worldZar.root.children.map(keyMeta), world: parseWorldRoot(worldZar),
    commonHealth, commonAnimationCount: commonAnimations.length,
    specialNodes: flat.filter((f) => /turret|light|lamp|machinegun/i.test(f.node.name)).map((f) => ({ path: f.path,
      at: transformPoint(f.world, 0, 0, 0).map(round), flags: `0x${f.node.flags.toString(16)}` })),
    ai: {
      submaps: ai.maps.map((m) => ({ index: m.index, name: m.name, min: m.min, max: m.max, points: m.points.map((p) => ({
        ...p, xz: aiCellCentre(m, p.loc.x, p.loc.z).map(round),
        cellWord: m.cells[aiCellIndex(m, p.loc.x, p.loc.z)],
        // FUN_00516940 + FUN_0051afe0. Optional slope correction in 0052d480 is not emulated.
        quantizedY: round(m.min[1] + (m.max[1] - m.min[1]) / 1024 * ((m.cells[aiCellIndex(m, p.loc.x, p.loc.z)]! >>> 9) & 1023)),
      })), zones: m.zones, links: m.links.length })),
      spawnRecords: ai.spawns.length,
    },
    locale: script(readerc, `${stem.toLowerCase()}LOC.rdr`),
    barrierProbes: barrierProbes(),
    animations: anims.map((a, ordinal) => ({
      ordinal, name: a.name, params: a.params, healthBytes: a.health ? 24 : 0,
      health: health(ordinal), sequenceDataOffset: animZar.child(animKeys[ordinal]!, 'Seq_Data')?.offset ?? null,
      commandCount: a.sequences.reduce((n, s) => n + s.commands.length, 0),
      references: a.nodeRefs.map((r, index) => {
        const roots = placed(a.nodeRefs[a.params.rootNodeIndex]?.name ?? 'NA');
        const placements = placed(r.name);
        return { ...r, index, initialInactive: (r.word >>> 31) !== 0, saveActive: (r.word & 0x10000000) !== 0, placements,
          // Candidates inside the animation root, not a full emulation of the executable's node resolver.
          rootScopedCandidates: placements.filter((p) => roots.some((root) => under(p.path, root.path))),
        };
      }),
      sequences: a.sequences.map((s) => ({ name: s.name, offset: s.offset, word: s.word, size: s.size,
        commandCount: s.commands.length, commands: s.commands.map((c) => ({ at: c.offset, set: c.set, cmd: c.cmd })) })),
      ...((args.includes('--programs') || selected) ? { program: decodeEffectProgram(a) } : {}),
    })).filter((a) => !selected || a.name.toLowerCase().includes(selected.toLowerCase())),
  };
});
console.log(JSON.stringify(report, null, 2));
