/**
 * Local Breach-map metadata and collision-state audit (research 99).
 * Usage: npx tsx tools/probe-breach-maps.ts [local RUN directory] [MP61|MP62|MP73]
 * Prints derived metadata only; never extracts game scripts or assets.
 * Segment results are geometric measurements, not capsule traversal or console parity.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, parseZdb, rdrGet, Reader, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import {
  buildGrid, collisionOwners, decodeEffectProgram, flattenScene, isWallSurface, parseAnimSets,
  parseGridParams, parseSceneGraph, polygonNormal, segmentHits, transformPoint, worldCollision,
  aiCellCentre, findLadders, parseAiMaps,
  type ZAnimAnimation,
} from '@s2u/scene';

const web = resolve(import.meta.dirname, '..');
const folder = process.argv[2] ? resolve(process.argv[2]) : [
  resolve(web, 'test-fixtures/RUN'), resolve(web, 'public/maps/RUN'),
].find((p) => existsSync(resolve(p, 'MP61.ZDB')));
if (!folder) throw new Error('Supply a local RUN directory containing MP61/MP62/MP73.ZDB.');
const stems = process.argv[3] ? [process.argv[3].toUpperCase()] : ['MP61', 'MP62', 'MP73'];
const under = (p: string, root: string): boolean => p === root || p.startsWith(`${root}/`) || p.startsWith(`${root}=`);
const round = (n: number): number => Math.round(n * 1000) / 1000;
const out = (record: object): void => console.log(JSON.stringify(record));
const scalar = (r: RdrNode, key: string): string => {
  const v = rdrGet(r, key);
  return typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : '';
};
const weaponSource = resolve(folder, 'ZWEAPON.ZAR');
if (existsSync(weaponSource)) {
  const z = Zar.parse(new Uint8Array(readFileSync(weaponSource)));
  const script = parseRdr(z.data(z.root.children[0]!));
  const ammo = rdrGet(script, 'ZAMMO');
  if (Array.isArray(ammo)) for (const r of ammo.filter(Array.isArray)) {
    const name = scalar(r, 'InternalName');
    if (['M67 Ammo', 'C4 Ammo', 'RPG Ammo', 'MPBOMB Ammo', 'explosive_stuff'].includes(name)) out({ source: weaponSource,
      ammo: name, impactDamage: Number(scalar(r, 'ImpactDamage')), explosionDamage: Number(scalar(r, 'Explosion_Damage')),
      explosionRadiusMetres: Number(scalar(r, 'Explosion_Radius')) });
  }
}
for (const stem of stems) {
  if (!['MP61', 'MP62', 'MP73'].includes(stem)) throw new Error(`Unsupported Breach map ${stem}.`);
  const source = resolve(folder, `${stem}.ZDB`), bytes = new Uint8Array(readFileSync(source)), toc = parseZdb(bytes);
  const member = (name: string): Zar => Zar.parse(zdbMember(bytes, toc, name));
  const rm = member('READERM.ZAR'), az = member('MZANIM.ZAR');
  const ak = rm.child(rm.root, 'actions.rdr');
  if (!ak) throw new Error(`${stem}: missing actions.rdr`);
  const list = rdrGet(parseRdr(rm.data(ak)), 'actions');
  const actions = Array.isArray(list) ? list.filter(Array.isArray) : [];
  const missionKey = rm.child(rm.root, 'mission.rdr');
  const valves = missionKey ? rdrGet(parseRdr(rm.data(missionKey)), 'Valves') : undefined;
  const weaponValves = Array.isArray(valves) ? valves.filter(Array.isArray)
    .filter((r) => /^Enable_(c4|frag|rpg|rpg_ammo|law)$/i.test(scalar(r, 'NAME')))
    .map((r) => ({ name: scalar(r, 'NAME'), value: Number(scalar(r, 'VALUE')) })) : [];
  const sets = parseAnimSets(az).sets, anims = sets.flatMap((s) => s.anims);
  const flightPaths = az.child(az.root, 'Anim_Sets')!.children.flatMap((set, si) =>
    (az.child(set, 'SoftImage_Script_List')?.children ?? []).map((key, i) => {
      const k = az.child(key, 'Script_Data')!, r = new Reader(az.data(k));
      let at = 0, records = 0, begin = 0, end = 0; const channels: Record<string, number> = {};
      while (at < k.size) {
        const flags = r.u32(at), size = 16 + 80 * ((flags & 1 ? 1 : 0) + (flags & 2 ? 1 : 0) + (flags & 4 ? 1 : 0));
        if (at + size > k.size) throw new Error(`${stem}: SI record overruns Script_Data`);
        if (!records) begin = r.f32(at + 4);
        end = r.f32(at + 8); records++; channels[flags] = (channels[flags] ?? 0) + 1; at += size;
      }
      return { ...sets[si]!.siScripts[i], dataOffsetInMZANIM: az.dataOffset + k.offset, measuredRecords: records,
        segmentStartSeconds: begin, segmentEndSeconds: end, channelFlagCounts: channels };
    }));
  const animKeys = az.child(az.root, 'Anim_Sets')!.children.flatMap((s) => az.child(s, 'Animation_List')?.children ?? []);
  if (animKeys.length !== anims.length) throw new Error(`${stem}: animation key/parser count mismatch`);
  const models = parseSceneGraph(member(`${stem}_GEO.ZED`));
  const flat = flattenScene(models), polys = worldCollision(models), owners = collisionOwners(models);
  const grid = buildGrid(parseGridParams(member(`${stem}.ZED`)), [], [], polys, owners);
  const matching = (name: string, parent?: string) => {
    const candidates = flat.filter((f) => f.node.name === name && (!parent || under(f.path, parent)));
    // Instance container, instance node and realised prototype can repeat a name on one ancestry chain.
    return candidates.filter((f) => !candidates.some((other) => other !== f && under(f.path, other.path)));
  };
  const roots = (a: ZAnimAnimation) => matching(a.nodeRefs[a.params.rootNodeIndex]?.name ?? 'NA');
  const refs = (a: ZAnimAnimation, i: number): typeof flat => {
    const r = a.nodeRefs[i];
    if (!r || r.name === 'NA') return [];
    if (i === a.params.rootNodeIndex || (r.parent === 0 && r.search !== 1)) return matching(r.name);
    const parents = typeof r.parent === 'number' && r.parent > 0 ? refs(a, r.parent) : roots(a);   // PAR-92: a sentinel parent (`root`, `caller`) as the root here
    return parents.flatMap((p) => matching(r.name, p.path));
  };
  const count = (path: string) => owners.filter((o) => under(o.path, path)).reduce((n, o) => n + o.count, 0);
  const commonAnims = parseAnimSets(member('CZANIM.ZAR')).sets.flatMap((s) => s.anims);
  out({ map: stem, source, actions: actions.length, nodes: flat.length, collisionOwners: owners.length, polygons: polys.length,
    missionAnimations: anims.length, missionHealthBlocks: anims.filter((a) => a.health !== null).length,
    commonAnimations: commonAnims.length, commonHealthBlocks: commonAnims.filter((a) => a.health !== null).length, weaponValves });
  const ai = parseAiMaps(zdbMember(bytes, toc, 'AIMAPS.MPS'));
  out({ map: stem, navigation: { submaps: ai.maps.map((m) => m.name),
    bombStartMarkers: ai.maps.flatMap((m) => m.points.filter((p) => p.name.toLowerCase() === 'startbomb')
      .map((p) => { const sub = ai.maps[p.loc.map]; if (!sub) throw new Error(`${stem}: invalid StartBomb map`);
        return { name: p.name, cell: p.loc, submap: sub.name,
          cellCentreXZ: aiCellCentre(sub, p.loc.x, p.loc.z).map(round) }; })),
    spawns: [0, 1].map((side) => ({ side, starts: ai.spawns.filter((s) => s.side === side && !s.twin).length,
      respawns: ai.spawns.filter((s) => s.side === side && s.twin).length })),
    ladders: findLadders(polys).length,
    turretNodes: flat.filter((f) => /turret/i.test(f.node.name)).map((f) => ({ path: f.path, at: transformPoint(f.world, 0, 0, 0).map(round) })),
  }, flightPaths });
  for (const action of actions) out({ map: stem, action: scalar(action, 'node'), type: scalar(action, 'type') || 'UNKNOWN (8)',
    valve: scalar(action, 'valve'), anim: rdrGet(action, 'anim'), team: scalar(action, 'team') || 'all (default)',
    range: Number(scalar(action, 'range') || 32), elevation: Number(scalar(action, 'elevation') || -1),
    points: Number(scalar(action, 'points') || 0), bitmap: scalar(action, 'bitmap'), descriptor: scalar(action, 'descriptor'),
    placed: matching(scalar(action, 'node')).map((f) => ({ path: f.path, at: transformPoint(f.world, 0, 0, 0).map(round) })) });
  for (const [ordinal, a] of anims.entries()) {
    if (a.health === null) continue;
    // Use parallel parse/key order: animation names need not be globally unique across sets.
    const k = animKeys[ordinal], h = k && az.child(k, 'Anim_Health');
    if (!h || h.size !== 24) throw new Error(`${stem}/${a.name}: missing 24-byte health record`);
    const r = new Reader(az.data(h));
    out({ map: stem, healthAnimation: a.name, flags: `0x${a.params.flags.toString(16)}`, activation: a.params.flags & 7,
      healthKeyOffsetInMZANIM: az.dataOffset + h.offset, nodeRef: r.u8(0),
      currentHp: r.f32(4), maxHp: r.f32(8), currentArmor: r.f32(12), maxArmor: r.f32(16), shield: r.f32(20),
      c4HealthPredicateAtDamage18: r.f32(4) > 0 && r.f32(20) <= 18,
      roots: roots(a).map((f) => f.path), targets: refs(a, r.u8(0)).map((f) => ({ path: f.path, polygons: count(f.path) })),
      executeActions: a.sequences.flatMap((s) => s.commands.filter((c) => c.type === 87)
        .map((c) => ({ offset: c.offset, action: a.names[new Reader(c.bytes).u8(4)] }))),
    });
  }
  const names = new Set(actions.flatMap((r) => { const v = rdrGet(r, 'anim'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; }));
  for (const a of anims) if (a.health || /^(objectives$|destroy_|base_explosion1|coop_blast|change_comm_wall|tower_fall|radio_dead|radio_disappear|off_lablights|gate_openclose|airstrike|f18_airstrike|knockdown_everything|action_reset|set_apache|setup_f18plane)/.test(a.name)) names.add(a.name);
  for (const a of anims.filter((a) => names.has(a.name))) {
    const program = decodeEffectProgram(a);
    out({ map: stem, stateAnimation: a.name, roots: roots(a).map((f) => f.path),
      refs: a.nodeRefs.flatMap((r, i) => r.name === 'NA' ? [] : [{ index: i, name: r.name, word: `0x${r.word.toString(16)}`,
        initiallyInactive: (r.word >>> 31) !== 0, saveActive: (r.word & 0x10000000) !== 0,
        placed: refs(a, i).map((f) => ({ path: f.path, polygons: count(f.path) })) }]),
      effects: program.sequences.flatMap((s, si) => s.ops.flatMap<object>((op, ci) => {
        const c = a.sequences[si]!.commands.filter((c) => !(c.set === 0 && c.cmd === 1))[ci]!;
        if (op.op === 'while') {
          const r = new Reader(c.bytes);
          const valve = c.bytes.length >= 24 && r.u8(8) === 61 ? {
            kind: 'valve', name: (r.u8(21) & 2) !== 0 ? a.names[r.u32(12)] : `#${r.u32(12)}`,
            operation: r.u8(20), operand: r.i32(16), context: (r.u8(21) & 1) !== 0,
          } : undefined;
          return [{ sourceSequence: s.name, offset: c.offset, ...op, condition: valve }];
        }
        if (op.op === 'fromTo') {
          const r = new Reader(c.bytes), at = r.u16(12);
          const vec = (offset: number) => [r.f32(offset), r.f32(offset + 4), r.f32(offset + 8)];
          // Translation block begins with a flags word. The existing generic effects decoder
          // interprets this as vector data and shifts translation coordinates by four bytes.
          return [{ sourceSequence: s.name, offset: c.offset, op: op.op, node: op.node, flags: op.flags,
            seconds: op.seconds, rotation: op.rotation,
            translation: at ? { blockOffset: at, flags: r.u32(at), from: vec(at + 4), to: vec(at + 16), rate: vec(at + 28) } : undefined }];
        }
        if (['active', 'call', 'callSequence', 'stopSequence', 'stopAnimation', 'valve', 'wait', 'if', 'elseif', 'endif', 'endWhile'].includes(op.op)) return [{ sourceSequence: s.name, offset: c.offset, ...op }];
        if (c.type === 57) { const r = new Reader(c.bytes); return [{ sourceSequence: s.name, offset: c.offset, op: 'fireWeapon',
          weapon: a.names[r.u8(6)], ammo: a.names[r.u8(5)], node: (r.u8(8) << 24) >> 24, timer1: r.f32(12), timer2: r.f32(16) }]; }
        return [];
      })) });
  }
  // Apply only literal, resolved mission Node_Ref initial-off flags; no simulated animation execution.
  for (const a of anims) a.nodeRefs.forEach((r, i) => {
    if (!(r.word >>> 31)) return;
    for (const f of refs(a, i)) for (const o of owners) if (under(o.path, f.path)) o.flags = (o.flags ?? 0) & ~1;
  });
  const baseline = owners.map((o) => o.flags);
  for (const a of anims.filter((a) => /^destroy_(access\d+|plank\d+)$/.test(a.name))) {
    const root = roots(a)[0]; if (!root) continue;
    const intact = a.nodeRefs.findIndex((r) => r.name === 'di_good');
    const target = refs(a, intact)[0]; if (!target) continue;
    const walls = polys.filter((p) => under(p.path, target.path) && isWallSurface(p));
    const measurements = walls.map((wall) => {
      const normal = polygonNormal(wall.points)!;
      const center: [number, number, number] = [0, 0, 0];
      for (let i = 0; i < wall.points.length; i++) center[i % 3]! += wall.points[i]! / (wall.points.length / 3);
      const from = center.map((v, i) => v - normal[i]! * 15) as [number, number, number];
      const to = center.map((v, i) => v + normal[i]! * 15) as [number, number, number];
      const measure = () => segmentHits(grid, from, to, isWallSurface).map((h) => ({ path: h.owner.path, point: h.point.map(round) }));
      owners.forEach((o, i) => { o.flags = baseline[i]; });
      const before = measure();
      for (const name of ['good_parts', 'di_good', 'whats_left', 'bad_parts']) {
        const index = a.nodeRefs.findIndex((r) => r.name === name);
        for (const f of refs(a, index)) for (const o of owners) if (under(o.path, f.path)) {
          // Settled route state: flying debris is excluded; whats_left persists.
          o.flags = name === 'whats_left' ? (o.flags ?? 0) | 1 : (o.flags ?? 0) & ~1;
        }
      }
      return { from: from.map(round), to: to.map(round), before, after: measure() };
    });
    // Report the first blocked-to-clear polygon-centre normal when one exists; otherwise the first candidate.
    // This establishes a local opening only, not a character-sized traversable corridor.
    const selected = measurements.find((m) => m.before.length > 0 && m.after.length === 0) ?? measurements[0];
    if (selected) out({ map: stem, segment: a.name, candidates: measurements.length, clearAfter: measurements.filter((m) => m.before.length > 0 && m.after.length === 0).length, ...selected });
  }
}
