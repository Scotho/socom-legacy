/**
 * Read-only metadata audit of retail Extraction and Escort multiplayer maps.
 * Reads a locally supplied extracted RUN tree; never writes game assets.
 *
 *   npx tsx tools/probe-npc-maps.ts [--root PATH] [--maps MP6,MP10] [--section summary|reader|ai|anims|commands|bindings|callers|global]
 *   --record selects one READERM member; --animation selects one zAnim (default objectives).
 * Script command output is a local research aid, not a complete mission VM or runtime-parity claim.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, parseZdb, rdrGet, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import {
  aiCellCentre, aiCellIndex, aiZoneRect, collisionOwners, decodeEffectOp, flattenScene, parseAiMaps, parseAnimSets,
  parseSceneGraph, transformPoint, ZANIM_COMMAND_NAMES, type ZAnimAnimation,
} from '@s2u/scene';

const args = process.argv.slice(2);
const flag = (key: string): string | undefined => {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : undefined;
};
const web = resolve(import.meta.dirname, '..');
const root = flag('--root') ?? [resolve(web, 'public/maps/RUN'), resolve(web, 'test-fixtures/RUN')].find(existsSync);
if (!root) throw new Error('Supply --root with your own extracted RUN directory.');
const maps = (flag('--maps') ?? 'MP6,MP10,MP11,MP71,MP52,MP53,MP82').split(',').map((n) => n.toUpperCase());
const section = flag('--section') ?? 'summary';
const round = (n: number): number => Math.round(n * 1000) / 1000;
const emit = (value: unknown): void => { console.log(JSON.stringify(value)); };
const one = (record: RdrNode, key: string): string => {
  const value = rdrGet(record, key);
  return typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
};

if (section === 'global') {
  const reader = Zar.parse(new Uint8Array(readFileSync(resolve(root, 'READERC.ZAR'))));
  const record = flag('--record') ?? 'missionlist.rdr';
  const key = reader.root.children.find((k) => k.name.toLowerCase() === record.toLowerCase());
  emit({ record, parsed: key ? parseRdr(reader.data(key)) : null });
  process.exit(0);
}

for (const map of maps) {
  const path = resolve(root, `${map}.ZDB`);
  if (!existsSync(path)) throw new Error(`Missing local archive ${path}.`);
  const bytes = new Uint8Array(readFileSync(path)), toc = parseZdb(bytes);
  const member = (name: string): Zar => Zar.parse(zdbMember(bytes, toc, name));
  const reader = member('READERM.ZAR');
  const read = (name: string): RdrNode | null => {
    const key = reader.root.children.find((k) => k.name.toLowerCase() === name.toLowerCase());
    return key ? parseRdr(reader.data(key)) : null;
  };
  const animArchive = member('MZANIM.ZAR'), parsedAnims = parseAnimSets(animArchive);
  const entries = parsedAnims.sets.flatMap((s) => s.anims.map((animation) => ({ set: s.name, animation })));
  const anims = entries.map((e) => e.animation);
  if (section === 'reader') {
    const record = flag('--record');
    emit({ map, records: reader.root.children.map((k) => k.name), ...(record ? { record, parsed: read(record) } : {}) });
    continue;
  }
  if (section === 'commands') {
    const name = flag('--animation') ?? 'objectives';
    const anim = anims.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (!anim) { emit({ map, missingAnimation: name }); continue; }
    emit({ map, animation: anim.name, params: anim.params, names: anim.names, refs: anim.nodeRefs });
    for (const seq of anim.sequences.filter((s) => !flag('--sequence') || s.name === flag('--sequence'))) {
      emit({ map, sequence: seq.name, offset: seq.offset, word: `0x${seq.word.toString(16)}`, commands: seq.commands.map((c) => {
        const op = decodeEffectOp(c, anim.names);
        const view = new DataView(c.bytes.buffer, c.bytes.byteOffset, c.bytes.byteLength);
        // Undecoded command payload words are printed only for local inspection; no bytes are saved.
        const words = Array.from({ length: Math.floor(c.bytes.length / 4) }, (_, i) => view.getUint32(i * 4, true));
        const translationAt = c.set === 0 && c.cmd === 22 && c.bytes.length >= 14 ? view.getUint16(12, true) : 0;
        const vector = (at: number): number[] => [0, 4, 8].map((delta) => view.getFloat32(at + delta, true));
        const motionTranslation = translationAt && translationAt + 40 <= c.bytes.length
          ? { blockOffset: translationAt, flags: view.getUint32(translationAt, true),
            from: vector(translationAt + 4), to: vector(translationAt + 16), rate: vector(translationAt + 28) } : undefined;
        const aiNames = ['COMM', 'CREATE', 'DEBUG', 'DRAIN', 'EVENT', 'FIREMODE', 'FIREWEAPON', 'GOTO', 'GROUP', 'HOLD',
          'INSTATE', 'INVIEW', 'LOOKAT', 'MACRO', 'MAP', 'MOVE', 'PAINT', 'PARAM', 'PURSUE', 'ANIMATE', 'INRANGE',
          'INREGION', 'SELECT', 'SETMODE', 'SETANIMSET', 'SIGNAL', 'SOUND', 'STANCE', 'STATE', 'STOPALL', 'TEAM', 'TURRET', 'VALVE', 'WAIT'];
        return { offset: c.offset, set: c.set, name: c.set === 0 ? ZANIM_COMMAND_NAMES[c.cmd] ?? `cmd${c.cmd}`
          : c.set === 2 ? `ai::${aiNames[c.cmd - 1] ?? c.cmd}` : `set${c.set}:${c.cmd}`, op, motionTranslation, words };
      }) });
    }
    continue;
  }
  if (section === 'callers') {
    const target = (flag('--animation') ?? '').toLowerCase();
    const common = parseAnimSets(member('CZANIM.ZAR')).sets.flatMap((s) => s.anims.map((animation) => ({ set: s.name, animation })));
    emit({ map, target, callers: [...entries.map((e) => ({ archive: 'MZANIM', ...e })), ...common.map((e) => ({ archive: 'CZANIM', ...e }))]
      .flatMap(({ archive, set, animation }, ordinal) => animation.sequences.flatMap((seq) => seq.commands.flatMap((cmd) => {
        const op = decodeEffectOp(cmd, animation.names);
        return op.op === 'call' && op.anim.toLowerCase().includes(target)
          ? [{ archive, set, ordinal, animation: animation.name, sequence: seq.name, offset: cmd.offset, ...op }] : [];
      }))) });
    continue;
  }
  if (section === 'ai') {
    const ai = parseAiMaps(zdbMember(bytes, toc, 'AIMAPS.MPS'));
    emit({ map, submaps: ai.maps.map((sub) => ({
      index: sub.index, name: sub.name, min: sub.min, max: sub.max, cells: [sub.cellsX, sub.cellsZ], stored: sub.cells.length,
      points: sub.points.map((p) => {
        const word = sub.cells[aiCellIndex(sub, p.loc.x, p.loc.z)];
        return { name: p.name, kind: p.kind, loc: p.loc, xz: aiCellCentre(sub, p.loc.x, p.loc.z).map(round), cellWord: word,
          // FUN_00516940 / FUN_0051afe0, shared audit 98. Does not emulate optional slope correction.
          quantizedY: word === undefined ? null : round(sub.min[1] + (sub.max[1] - sub.min[1]) / 1024 * ((word >>> 9) & 1023)),
        };
      }),
      zones: sub.zones.map((z) => ({ name: z.name, kind: z.kind, corner: z.corner, width: z.width, height: z.height, rect: aiZoneRect(sub, z) })),
      links: sub.links.length, lines: sub.lines.map((l) => ({ value: l.value, points: l.locs.length, first: l.locs[0], last: l.locs.at(-1) })),
    })) });
    continue;
  }
  if (section === 'anims') {
    emit({ map, animations: anims.map((a) => ({
      name: a.name, flags: a.params.flags, refs: a.nodeRefs.map((r) => ({ name: r.name, word: `0x${r.word.toString(16)}` })),
      commands: [...new Set(a.sequences.flatMap((s) => s.commands.map((c) => c.set === 0 ? ZANIM_COMMAND_NAMES[c.cmd] ?? `cmd${c.cmd}` : `set${c.set}:${c.cmd}`)))],
      sequences: a.sequences.map((s) => ({ name: s.name, offset: s.offset, word: `0x${s.word.toString(16)}`, count: s.commands.length })),
    })) });
    continue;
  }
  const models = parseSceneGraph(member(`${map}_GEO.ZED`)), flat = flattenScene(models), owners = collisionOwners(models);
  const under = (path: string, parent: string): boolean => path === parent || path.startsWith(`${parent}/`) || path.startsWith(`${parent}=`);
  const matching = (name: string, parent?: string): typeof flat => {
    const candidates = flat.filter((f) => f.node.name.toLowerCase() === name.toLowerCase() && (!parent || under(f.path, parent)));
    return candidates.filter((f) => !candidates.some((p) => p !== f && under(f.path, p.path)));
  };
  // Follow the encoded parent/root search instead of conflating every repeated di_good in a map.
  // This is a static binding census, not execution of runtime search/copy/activation semantics.
  const refs = (a: ZAnimAnimation, index: number, seen = new Set<number>()): typeof flat => {
    const ref = a.nodeRefs[index];
    if (!ref || ref.name === 'NA' || seen.has(index)) return [];
    seen.add(index);
    if (index === a.params.rootNodeIndex || (ref.parent === 0 && ref.search !== 1)) return matching(ref.name);
    const parents = typeof ref.parent === 'number' && ref.parent > 0 ? refs(a, ref.parent, seen) : matching(a.nodeRefs[a.params.rootNodeIndex]?.name ?? 'NA');
    return parents.flatMap((p) => matching(ref.name, p.path));
  };
  if (section === 'bindings') {
    const keys = animArchive.child(animArchive.root, 'Anim_Sets')!.children.flatMap((s) => animArchive.child(s, 'Animation_List')?.children ?? []);
    emit({ map, animations: anims.map((a, i) => {
      const healthKey = animArchive.child(keys[i]!, 'Anim_Health');
      const data = healthKey ? animArchive.data(healthKey) : null;
      const d = data ? new DataView(data.buffer, data.byteOffset, data.byteLength) : null;
      return { set: entries[i]!.set, ordinal: i, name: a.name, flags: a.params.flags, root: a.nodeRefs[a.params.rootNodeIndex]?.name,
        roots: matching(a.nodeRefs[a.params.rootNodeIndex]?.name ?? 'NA').map((f) => f.path),
        health: d ? { node: a.nodeRefs[d.getUint8(0)]?.name, hp: d.getFloat32(4, true), maxHp: d.getFloat32(8, true),
          armor: d.getFloat32(12, true), maxArmor: d.getFloat32(16, true), shield: d.getFloat32(20, true) } : null,
        refs: a.nodeRefs.flatMap((r, refIndex) => !flag('--animation') && (!d || refIndex !== d.getUint8(0)) ? [] : [{ index: refIndex, name: r.name, parent: r.parent, search: r.search, word: `0x${r.word.toString(16)}`,
          placements: refs(a, refIndex).map((f) => ({ path: f.path,
            at: transformPoint(f.world, 0, 0, 0).map(round),
            ...(flag('--animation') ? { worldXAxis: transformPoint(f.world, 1, 0, 0).map((n, axis) => round(n - transformPoint(f.world, 0, 0, 0)[axis]!)) } : {}),
            polygons: owners.filter((o) => o.path === f.path || o.path.startsWith(`${f.path}/`) || o.path.startsWith(`${f.path}=`)).reduce((n, o) => n + o.count, 0),
          })) }]),
      };
    }).filter((a) => flag('--animation') ? a.name.toLowerCase().includes(flag('--animation')!.toLowerCase()) : a.health) });
    continue;
  }
  const mission = read('mission.rdr'), actions = read('actions.rdr');
  const actionRecords = actions ? rdrGet(actions, 'actions') : null;
  const common = parseAnimSets(member('CZANIM.ZAR')).sets.flatMap((s) => s.anims);
  emit({ map, description: mission ? one(mission, 'description') : '', reader: reader.root.children.map((k) => k.name),
    commonAnimations: common.length, commonHealthRecords: common.filter((a) => a.health !== null).length,
    chartype: read('chartype.rdr'),
    actions: Array.isArray(actionRecords) ? actionRecords.filter(Array.isArray).map((r) => {
      const node = one(r, 'node'), placed = flat.filter((f) => f.node.name.toLowerCase() === node.toLowerCase());
      return { node, type: one(r, 'type'), anim: rdrGet(r, 'anim'), valve: one(r, 'valve'), range: one(r, 'range'), elevation: one(r, 'elevation'),
        bitmap: one(r, 'bitmap'), points: one(r, 'points'), team: one(r, 'team'),
        placements: placed.map((f) => ({ path: f.path, at: transformPoint(f.world, 0, 0, 0).map(round) })) };
    }) : [],
    dynamicGroups: flat.filter((f) => /^(healthy|destroyed|whats_left|parts|vis_whats_left)$/.test(f.node.name)).map((f) => ({
      path: f.path, flags: f.node.flags, at: transformPoint(f.world, 0, 0, 0).map(round),
      polygons: owners.filter((o) => o.path === f.path || o.path.startsWith(`${f.path}/`) || o.path.startsWith(`${f.path}=`)).reduce((n, o) => n + o.count, 0),
    })),
    animations: anims.map((a) => ({ name: a.name, sequences: a.sequences.length, commands: a.sequences.reduce((n, s) => n + s.commands.length, 0) })),
  });
}
