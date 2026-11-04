/**
 * Reproducible multiplayer map audit inventory (research 97 / 101).
 * Reads local disc files only; emits derived metadata, never extracted assets or command bodies.
 *
 *   npx tsx tools/probe-multiplayer-audit.ts                  # all locally available retail maps
 *   npx tsx tools/probe-multiplayer-audit.ts MP2 --details    # bindings, sequences and placed candidates
 *
 * A stored animation/root-name match is an audit lead, not proof of live gameplay activation.
 * Keep activation/damage/call-chain evidence separate from this candidate inventory.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Zar, parseRdr, parseZdb, rdrGet, zdbMember, type RdrNode } from '@s2u/archive';
import {
  aiCellCentre, decodeEffectProgram, flattenScene, parseAiMaps, parseAnimSets, parseSceneGraph,
  transformPoint, worldDi, ZANIM_COMMAND_NAMES,
} from '@s2u/scene';

const web = resolve(import.meta.dirname, '..');
const dirs = [resolve(web, 'public/maps/RUN'), resolve(web, 'test-fixtures/RUN')];
const args = process.argv.slice(2), details = args.includes('--details');
const file = (name: string): string => {
  const path = dirs.map((d) => resolve(d, name)).find(existsSync);
  if (!path) throw new Error(`Missing local ${name}; supply the disc through the existing extraction workflow.`);
  return path;
};
const scalar = (r: RdrNode | undefined): string | null => typeof r === 'string' ? r : Array.isArray(r) ? scalar(r[0]) : null;
const records = (r: RdrNode): RdrNode[][] => {
  if (!Array.isArray(r)) return [];
  return r.some((v) => typeof v === 'string') ? [r] : r.flatMap(records);
};
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const round = (n: number): number => Math.round(n * 1000) / 1000;
const common = Zar.parse(new Uint8Array(readFileSync(file('READERC.ZAR'))));
const missionKey = common.root.children.find((k) => k.name.toLowerCase() === 'missionlist.rdr');
if (!missionKey) throw new Error('READERC.ZAR has no missionlist.rdr.');
const missions = records(parseRdr(common.data(missionKey)));
let stems = args.filter((a) => /^MP\d+$/i.test(a)).map((a) => a.toUpperCase());
if (!stems.length) stems = [...new Set(dirs.filter(existsSync).flatMap((d) => readdirSync(d))
  .filter((n) => /^MP\d+\.ZDB$/i.test(n)).map((n) => n.toUpperCase().replace(/\.ZDB$/, '')))];
stems.sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));

for (const stem of stems) {
  const bytes = new Uint8Array(readFileSync(file(`${stem}.ZDB`))), toc = parseZdb(bytes);
  const member = (name: string): Zar => Zar.parse(zdbMember(bytes, toc, name));
  const reader = member('READERM.ZAR');
  const actionKey = reader.root.children.find((k) => k.name.toLowerCase() === 'actions.rdr');
  const actionList = actionKey ? rdrGet(parseRdr(reader.data(actionKey)), 'actions') : undefined;
  const actions = Array.isArray(actionList) ? records(actionList).map((r) => Object.fromEntries(
    ['node', 'type', 'valve', 'anim', 'range', 'elevation', 'team', 'points', 'bitmap', 'one_shot']
      .map((k) => [k, scalar(rdrGet(r, k))]),
  )) : [];
  const mission = missions.find((r) => scalar(rdrGet(r, 'NUMBER')) === stem.slice(2));
  const models = parseSceneGraph(member(`${stem}_GEO.ZED`)), flat = flattenScene(models);
  const animZar = member('MZANIM.ZAR');
  const library = parseAnimSets(animZar);
  const commonAnimZar = member('CZANIM.ZAR'), commonLibrary = parseAnimSets(commonAnimZar);
  const commonHealth = commonLibrary.sets.flatMap((s) => s.anims.filter((a) => a.health !== null).map((a) => ({ set: s.name, a })));
  const anims = library.sets.flatMap((s) => s.anims);
  const ai = parseAiMaps(zdbMember(bytes, toc, 'AIMAPS.MPS'));
  const counts = new Map<string, number>();
  for (const a of actions) counts.set(a.type ?? 'omitted', (counts.get(a.type ?? 'omitted') ?? 0) + 1);
  const health = anims.filter((a) => a.health !== null);
  const initialRefs = anims.reduce((n, a) => n + a.nodeRefs.filter((r) => (r.word >>> 31) !== 0).length, 0);
  const summary = {
    archive: stem, name: mission ? scalar(rdrGet(mission, 'NAME')) : null,
    mode: mission ? scalar(rdrGet(mission, 'TYPE')) : null, sha256: sha(bytes),
    actionRecords: actions.length, actionTypes: Object.fromEntries(counts), missionAnimations: anims.length,
    healthAnimations: health.length, initiallyInactiveRefs: initialRefs,
    commonHealthBlocks: commonHealth.length,
    commonHealthRootMatches: commonHealth.filter(({ a }) => flat.some((f) => f.node.name === a.nodeRefs[a.params.rootNodeIndex]?.name)).length,
    objectiveSequences: anims.find((a) => a.name === 'objectives')?.sequences.length ?? 0,
    aiMaps: ai.maps.length, aiPoints: ai.maps.reduce((n, m) => n + m.points.length, 0),
    aiZones: ai.maps.reduce((n, m) => n + m.zones.length, 0),
    collisionPolygons: flat.reduce((n, f) => n + worldDi(f).length, 0),
  };
  if (!details) { console.log(JSON.stringify(summary)); continue; }
  console.log(JSON.stringify({ ...summary, kind: 'map', readerMembers: reader.root.children.map((k) => k.name) }));
  for (const action of actions) {
    const matches = flat.filter((f) => f.node.name.toLowerCase() === action.node?.toLowerCase());
    console.log(JSON.stringify({ kind: 'action', archive: stem, ...action,
      placed: matches.map((f) => ({ path: f.path, at: transformPoint(f.world, 0, 0, 0).map(round) })),
      programPresent: anims.some((a) => a.name.toLowerCase() === action.anim?.toLowerCase()),
    }));
  }
  for (const a of anims) {
    const decoded = decodeEffectProgram(a);
    const activation = a.params.flags & 3;
    const root = a.nodeRefs[a.params.rootNodeIndex]?.name;
    const animSet = library.sets.find((s) => s.anims.includes(a))!;
    const healthKey = animZar.find(`Anim_Sets/${animSet.name}/Animation_List/${a.name}/Anim_Health`);
    const healthData = healthKey ? animZar.data(healthKey) : undefined;
    const hv = healthData ? new DataView(healthData.buffer, healthData.byteOffset, healthData.byteLength) : undefined;
    // Layout/eligibility traced in research 99; storing a block is not proof that the target is placed/live.
    const healthFields = hv && hv.byteLength >= 24 ? {
      nodeRef: hv.getUint8(0), targetName: a.nodeRefs[hv.getUint8(0)]?.name,
      hp: hv.getFloat32(4, true), maxHp: hv.getFloat32(8, true),
      armor: hv.getFloat32(12, true), maxArmor: hv.getFloat32(16, true), shield: hv.getFloat32(20, true),
    } : null;
    // Restrict detail output to audit candidates; ordinary impact/sound library entries are summarized above.
    if (!a.health && activation !== 1 && a.name !== 'objectives' &&
        !actions.some((v) => v.anim?.toLowerCase() === a.name.toLowerCase())) continue;
    const missing = new Set(decoded.sequences.flatMap((s) => s.ops.filter((op) => op.op === 'other')
      .map((op) => op.op === 'other' ? op.name : '')));
    console.log(JSON.stringify({ kind: 'animation-candidate', archive: stem, name: a.name, activation,
      flags: `0x${a.params.flags.toString(16)}`, healthBytes: a.health ? 24 : 0, healthFields, root: root ?? null,
      rootMatches: flat.filter((f) => f.node.name === root).map((f) => f.path),
      initialInactive: a.nodeRefs.filter((r) => (r.word >>> 31) !== 0).map((r) => r.name),
      sequences: a.sequences.map((s) => ({ name: s.name, offset: s.offset, commands: s.commands.length,
        operations: [...new Set(s.commands.map((c) => c.set ? `set${c.set}:${c.cmd}` : ZANIM_COMMAND_NAMES[c.cmd]))],
      })), unsupportedByEffectDecoder: [...missing],
    }));
  }
  for (const { set: setName, a } of commonHealth) {
    const root = a.nodeRefs[a.params.rootNodeIndex]?.name;
    const matches = flat.filter((f) => f.node.name === root);
    if (!matches.length) continue;
    const key = commonAnimZar.find(`Anim_Sets/${setName}/Animation_List/${a.name}/Anim_Health`)!;
    const data = commonAnimZar.data(key), d = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (d.byteLength !== 24) throw new Error(`${stem} CZANIM ${a.name}: unexpected health size ${d.byteLength}.`);
    console.log(JSON.stringify({ kind: 'common-health-candidate', archive: stem, name: a.name, root,
      nodeRef: d.getUint8(0), target: a.nodeRefs[d.getUint8(0)]?.name, hp: d.getFloat32(4, true),
      shield: d.getFloat32(20, true), activation: a.params.flags & 3, rootMatches: matches.map((f) => f.path),
      calls: decodeEffectProgram(a).sequences.flatMap((s) => s.ops.filter((o) => o.op === 'call')),
    }));
  }
  for (const m of ai.maps) console.log(JSON.stringify({ kind: 'ai', archive: stem, submap: m.name,
    points: m.points.map((p) => ({ name: p.name, loc: p.loc, xz: aiCellCentre(ai.maps[p.loc.map]!, p.loc.x, p.loc.z).map(round) })),
    zones: m.zones.map((z) => ({ name: z.name, corner: z.corner, width: z.width, height: z.height })),
    spawnRecords: m.spawns.length,
  }));
}
