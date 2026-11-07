import { Matrix4, Vector3 } from 'three';
import { bombOfMarkerStates, bombRestOf, markersOfBomb } from '../bombMarkers';
import { RULES_SCHEMA, RULES_VOCABULARY_VERSION, type InstalledRulesPack, type LayoutMarker, type LayoutSpawner, type LayoutZone, type RuleDecl, type RulesSpec, type RulesVariable } from '@s2u/creator-contracts';
import { emptyLayout, newLayout, parseAssetId, parseSettings, serializeLayout, type Layout } from '../layout';
import { checkRecord, layoutOfRecord, recordOfLayout, type LayoutRecord } from '../record';
import {
  checkForgeRules, FORGE_AUTHORING_SCHEMA, forgeLayoutModes, layoutOfAuthoring, parseForgeLayout, readForgeAuthoring, refusalWords, UNSEALED_HASH,
  type ForgeLayout, type ForgeRulesDraft,
} from '../rulesAuthoring';
import { ForgeAgentError, validateForgeAgentArguments } from './api';
import { EXTRACTION_ZONE_SIZE, nextSafetyName } from '../extractionZones';
import { nextHostageName } from '../hostages';
import { nextNavName, nextViewName } from '../placedPoints';
// The disc objects a placement copies unless it names one (`../copyDefaults`), re-exported where the planner's callers read them.
import { DEFAULT_BARRIER, DEFAULT_DOOR, DEFAULT_GATE, DEFAULT_TURRET } from '../copyDefaults';
export { DEFAULT_BARRIER, DEFAULT_DOOR, DEFAULT_GATE, DEFAULT_TURRET };

/**
 * FCW-32: the edits of the rules entities (zones, markers, spawners, by authored id) and of the layout's rules pack
 * (`../rulesAuthoring`). An entity moves, turns, locks, unlocks and is deleted as the layout's other rows (`zone:<id>`,
 * `marker:<id>`, `spawner:<id>` beside `piece:N`); every edit is checked whole before it is staged: the rules against
 * the layout (`checkForgeRules`, the validator's own diagnostics naming the field), then the record with the layout's
 * modes. A browser adaptation: nothing here runs a rule.
 */
export const FORGE_RULES_EDITS: readonly string[] = ['zone.place', 'marker.place', 'spawner.place', 'rules.new', 'rules.set', 'rules.rule.set',
  'rules.rule.delete', 'rules.variable.set', 'rules.variable.delete', 'rules.config.set', 'rules.clear'];
/** Browser adaptation: prepare a recipe using the existing serializer; the page stages its real pieces before commit. */
export const FORGE_LAYOUT_OPERATIONS = new Set(['layout.import', 'layout.new', 'layout.base', 'layout.name', 'layout.batch', 'piece.place', 'piece.move',
  'piece.rotate', 'piece.delete', 'piece.lock', 'piece.unlock', 'piece.hide', 'piece.restore', 'selection.move', 'selection.rotate',
  'selection.duplicate', 'spawn.place', 'respawn.place', 'flare.place', 'npc.place', 'hostage.place', 'extraction.place', 'point.place', 'view.place', 'turret.place', 'door.place', 'gate.place', 'barrier.place', 'placement.set', 'bomb.place', 'settings.set', 'objectives.set', 'type.set',
  // FCW-32 (a browser adaptation, the Forge's own authoring): the rules entities and the layout's rules pack.
  ...FORGE_RULES_EDITS]);
const fail = (code: string, message: string): never => { throw new ForgeAgentError(code, message); };
export function importedLayout(raw: unknown): ForgeLayout {
  // A record (v2, or v3 since FCW-07a: `schema`), FCW-32's authoring envelope (a record and its rules), or else a v1
  // layout file (its rules with it, `parseForgeLayout`).
  const obj = raw as { v?: unknown; schema?: unknown } | null;
  if (obj?.schema === FORGE_AUTHORING_SCHEMA) {
    try { return layoutOfAuthoring(readForgeAuthoring(JSON.stringify(raw), 'Layout')); } catch (e) { return fail('INVALID_LAYOUT', e instanceof Error ? e.message : String(e)); }
  }
  if (obj?.v === 2 || (obj?.schema !== undefined && obj?.schema !== null)) {
    const why = checkRecord(raw);
    if (why) fail('INVALID_LAYOUT', why);
    return layoutOfRecord(raw as LayoutRecord);
  }
  return parseForgeLayout(JSON.stringify(raw));
}
export function planForgeLayout(current: ForgeLayout, operation: string, args: Record<string, unknown>, selection: readonly string[], duplicateDelta: readonly number[] = [20, 0, 0],
  installed: readonly InstalledRulesPack[] = []): ForgeLayout {
  validateForgeAgentArguments(operation, args);
  if (operation === 'layout.batch') {
    let planned = current;
    let reindexed = false;
    for (const edit of args['edits'] as { operation: string; args: Record<string, unknown> }[]) {
      if (reindexed && 'refs' in edit.args) fail('INVALID_REFERENCE', 'A batch cannot reuse revision refs after deleting or replacing markers');
      planned = planForgeLayout(planned, edit.operation, edit.args, selection, duplicateDelta, installed);
      if (['piece.delete', 'bomb.place', 'objectives.set'].includes(edit.operation)) reindexed = true;
    }
    return planned;
  }
  let l = parseForgeLayout(serializeLayout(current));
  const at = args['at'] as [number, number, number];
  const yaw = (args['yaw'] as number | undefined) ?? 0;
  const bombs = markersOfBomb(l.objectives?.bomb);
  const rows = new Map<string, { locked: boolean; p: number[]; turn: (r: number) => void; move: (v: number[]) => void; lock: (on: boolean) => void; remove: () => void; duplicate: (delta: readonly number[]) => void }>();
  for (const [i, p] of l.pieces.entries()) {
    const move = (v: number[]): void => { p.m[12] = v[0]!; p.m[13] = v[1]!; p.m[14] = v[2]!; };
    rows.set(`piece:${i}`, { locked: !!p.locked, p: p.m.slice(12, 15), move,
      turn: (r) => { const m = new Matrix4().makeRotationY(r).multiply(new Matrix4().fromArray(p.m)); m.setPosition(new Vector3(...p.m.slice(12, 15) as [number, number, number])); p.m = m.toArray(); },
      lock: (on) => { if (on) p.locked = true; else delete p.locked; },
      remove: () => { l.pieces.splice(l.pieces.indexOf(p), 1); },
      duplicate: (d) => { const copy = { ...p, m: [...p.m] }; for (let k = 0; k < 3; k++) copy.m[12 + k]! += d[k]!; l.pieces.push(copy); },
    });
  }
  const marker = (id: string, m: { p: [number, number, number]; yaw: number; locked?: boolean }, remove: () => void, duplicate: (d: readonly number[]) => void): void => {
    rows.set(id, { locked: !!m.locked, p: [...m.p], move: (p) => { m.p = p as [number, number, number]; },
      turn: (r) => { m.yaw += r; }, lock: (on) => { if (on) m.locked = true; else delete m.locked; }, remove, duplicate });
  };
  for (const [i, s] of l.spawns.entries()) marker(`spawn:${i}`, s, () => { l.spawns.splice(l.spawns.indexOf(s), 1); },
    (d) => { l.spawns.push({ ...s, p: s.p.map((v, k) => v + d[k]!) as [number, number, number] }); });
  for (const [i, s] of (l.respawns ?? []).entries()) marker(`respawn:${i}`, s, () => { l.respawns!.splice(l.respawns!.indexOf(s), 1); },
    (d) => { l.respawns!.push({ ...s, p: s.p.map((v, k) => v + d[k]!) as [number, number, number] }); });
  for (const [i, n] of (l.npcs ?? []).entries()) marker(`npc:${i}`, n, () => { l.npcs!.splice(l.npcs!.indexOf(n), 1); },
    (d) => { l.npcs!.push({ ...n, p: n.p.map((v, k) => v + d[k]!) as [number, number, number] }); });
  // A placed point's or view's row: moved, locked, removed and copied as a marker; never turned (a view's yaw is its field).
  const pointRow = (id: string, m: { at: [number, number, number]; locked?: boolean }, remove: () => void, duplicate: (d: readonly number[]) => void): void => {
    rows.set(id, { locked: !!m.locked, p: [...m.at], move: (p) => { m.at = p as [number, number, number]; }, turn: () => undefined,
      lock: (on) => { if (on) m.locked = true; else delete m.locked; }, remove, duplicate });
  };
  // A placed turret: moved, turned (its facing), locked, removed and copied as a marker.
  // A placed gate or C4 barrier: as a door.
  for (const key of ['gates', 'barriers'] as const) {
    for (const [i, t] of (l[key] ?? []).entries()) {
      rows.set(`${key === 'gates' ? 'gate' : 'barrier'}:${i}`, { locked: !!t.locked, p: [...t.at], move: (p) => { t.at = p as [number, number, number]; }, turn: (r) => { t.yaw += r; },
        lock: (on) => { if (on) t.locked = true; else delete t.locked; }, remove: () => { l[key]!.splice(l[key]!.indexOf(t), 1); },
        duplicate: (d) => { l[key]!.push({ ...t, at: t.at.map((v, k) => v + d[k]!) as [number, number, number] }); } });
    }
  }
  // A placed door: moved (its hinge), turned, locked, removed and copied as a marker.
  for (const [i, t] of (l.doors ?? []).entries()) {
    rows.set(`door:${i}`, { locked: !!t.locked, p: [...t.at], move: (p) => { t.at = p as [number, number, number]; }, turn: (r) => { t.yaw += r; },
      lock: (on) => { if (on) t.locked = true; else delete t.locked; }, remove: () => { l.doors!.splice(l.doors!.indexOf(t), 1); },
      duplicate: (d) => { l.doors!.push({ ...t, at: t.at.map((v, k) => v + d[k]!) as [number, number, number] }); } });
  }
  for (const [i, t] of (l.turrets ?? []).entries()) {
    rows.set(`turret:${i}`, { locked: !!t.locked, p: [...t.at], move: (p) => { t.at = p as [number, number, number]; }, turn: (r) => { t.yaw += r; },
      lock: (on) => { if (on) t.locked = true; else delete t.locked; }, remove: () => { l.turrets!.splice(l.turrets!.indexOf(t), 1); },
      duplicate: (d) => { l.turrets!.push({ ...t, at: t.at.map((v, k) => v + d[k]!) as [number, number, number] }); } });
  }
  // A placed flare: moved, locked, removed and copied as a point; never turned (the engine faces it to the camera).
  for (const [i, f] of (l.flares ?? []).entries()) pointRow(`flare:${i}`, f, () => { l.flares!.splice(l.flares!.indexOf(f), 1); },
    (d) => { l.flares!.push({ ...f, at: f.at.map((v, k) => v + d[k]!) as [number, number, number] }); });
  for (const [i, t] of (l.tacPoints ?? []).entries()) pointRow(`point:${i}`, t, () => { l.tacPoints!.splice(l.tacPoints!.indexOf(t), 1); },
    (d) => { l.tacPoints!.push({ ...t, name: nextNavName(l.tacPoints!.map((x) => x.name)), at: t.at.map((v, k) => v + d[k]!) as [number, number, number] }); });
  for (const [i, v] of (l.scenicViews ?? []).entries()) pointRow(`view:${i}`, v, () => { l.scenicViews!.splice(l.scenicViews!.indexOf(v), 1); },
    (d) => { l.scenicViews!.push({ ...v, name: nextViewName(l.scenicViews!.map((x) => x.name)), at: v.at.map((n, k) => n + d[k]!) as [number, number, number] }); });
  for (const [i, z] of (l.extractionZones ?? []).entries()) {
    rows.set(`zone:${i}`, { locked: !!z.locked, p: [...z.at], move: (p) => { z.at = p as [number, number, number]; }, turn: () => undefined,
      lock: (on) => { if (on) z.locked = true; else delete z.locked; }, remove: () => { l.extractionZones!.splice(l.extractionZones!.indexOf(z), 1); },
      duplicate: (d) => { l.extractionZones!.push({ ...z, name: nextSafetyName(l.extractionZones!.map((x) => x.name)), at: z.at.map((v, k) => v + d[k]!) as [number, number, number] }); } });
  }
  for (const [i, h] of (l.hostages ?? []).entries()) marker(`hostage:${i}`, h, () => { l.hostages!.splice(l.hostages!.indexOf(h), 1); },
    (d) => { l.hostages!.push({ ...h, p: h.p.map((v, k) => v + d[k]!) as [number, number, number] }); });
  // FCW-32: the rules entities by their authored ids; each turns about its own point (a box and a marker by their yaw too).
  const entity = (kind: 'zone' | 'marker' | 'spawner', e: { id: string; at: [number, number, number]; yaw?: number; locked?: true }, list: unknown[]): void => {
    rows.set(`${kind}:${e.id}`, { locked: !!e.locked, p: [...e.at], move: (p) => { e.at = p as [number, number, number]; },
      turn: (r) => { if (e.yaw !== undefined) e.yaw += r; }, lock: (on) => { if (on) e.locked = true; else delete e.locked; },
      remove: () => { list.splice(list.indexOf(e), 1); },
      duplicate: () => fail('UNSUPPORTED', `A ${kind}'s id is its own: place a new one`) });
  };
  for (const z of l.zones ?? []) entity('zone', z, l.zones!);
  for (const m of l.markers ?? []) entity('marker', m, l.markers!);
  for (const s of l.spawners ?? []) entity('spawner', s, l.spawners!);
  const counts = { start: 0, seal: 0, terrorist: 0 };
  for (const b of bombs) {
    const id = `bomb:${b.kind}:${counts[b.kind]++}`;
    rows.set(id, { locked: !!b.locked, p: [...b.at], move: (p) => { b.at = p as [number, number, number]; }, turn: (r) => { b.yaw += r; },
      lock: (on) => { b.locked = on; }, remove: () => { bombs.splice(bombs.indexOf(b), 1); },
      duplicate: () => fail('UNSUPPORTED', 'One of each bomb marker: move the marker already placed') });
  }
  const refs = (operation.startsWith('selection.') ? selection : args['refs'] ?? []) as string[];
  if (new Set(refs).size !== refs.length) fail('INVALID_ARGUMENT', 'Duplicate references are not allowed');
  const targets = refs.map((ref) => rows.get(ref) ?? fail('INVALID_REFERENCE', `Unknown reference ${ref}`));
  if (!['piece.unlock', 'piece.lock'].includes(operation) && targets.some((r) => r.locked)) fail('LOCKED', 'A referenced placement is locked');
  switch (operation) {
    case 'layout.import': l = importedLayout(args['layout']); break;
    case 'layout.new': l = newLayout(l.base); break;
    // A new base takes its own game type (the owner, 2026-11-06): the old base's is dropped, the page then shows the new
    // map's own (`../page` `ownTypeOf`).
    case 'layout.base': {
      l = { ...l, base: args['base'] as Layout['base'] };
      if (l.objectives?.gameType !== undefined) {
        const { gameType: _dropped, ...rest } = l.objectives;
        if (Object.keys(rest).length) l.objectives = rest; else delete l.objectives;
      }
      break;
    }
    case 'layout.name': l.name = args['name'] as string; break;
    case 'piece.place': {
      const m = new Matrix4().makeRotationY(yaw); m.setPosition(...at);
      l.pieces.push({ asset: args['asset'] as string, m: m.toArray() }); break;
    }
    case 'spawn.place': l.spawns.push({ team: args['team'] as 'A' | 'B', p: at, yaw }); break;
    // A placed respawn point (a browser adaptation, `Layout.respawns`): a team, a place and a yaw, as a spawn.
    case 'respawn.place': (l.respawns ??= []).push({ team: args['team'] as 'A' | 'B', p: at, yaw }); break;
    // A placed flare (a browser adaptation, `Layout.flares`): a disc map's facade node, by its archive and node name.
    case 'flare.place': (l.flares ??= []).push({ source: args['source'] as string, name: args['name'] as string, at }); break;
    case 'placement.set': {
      // One field a placement keeps, set (a browser adaptation, FG.R2: the Inspector's Data, and the agent's): the record's
      // own checks then run on the whole layout (`checkedLayout`).
      const ref = args['ref'] as string, field = args['field'] as string, value = args['value'];
      const row = rows.get(ref) ?? fail('INVALID_REFERENCE', `Unknown reference ${ref}`);
      if (row.locked) fail('LOCKED', 'A referenced placement is locked');
      const bad = (why: string): never => fail('INVALID_ARGUMENT', `${field} ${why}`);
      const above0 = (): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : bad('must be a number above 0'));
      const [kind, a, b] = ref.split(':');
      if (kind === 'zone') {
        const z = l.extractionZones![Number(a)]!;
        if (field === 'name') z.name = typeof value === 'string' && /^[A-Za-z0-9_ -]{1,32}$/.test(value) ? value : bad('must be 1-32 letters, digits, spaces, _ or -');
        else if (field === 'width') z.size = [above0(), z.size[1]];
        else if (field === 'depth') z.size = [z.size[0], above0()];
        else bad('is not a zone\'s');
      } else if (kind === 'piece') {
        // A placed ladder's Map and Ladder (the owner, 2026-11-06): the disc prop it is, `<archive>:<model>`.
        if (field !== 'model') bad('is not a piece\'s');
        const id = typeof value === 'string' ? parseAssetId(value) : null;
        if (!id || !/^[A-Z]{1,3}\d{1,3}$/.test(id.archive)) bad('must be a disc prop <archive>:<model>, as MP73:ladder35');
        l.pieces[Number(a)]!.asset = value as string;
      } else if (kind === 'turret' || kind === 'door' || kind === 'gate' || kind === 'barrier') {
        const t = (kind === 'turret' ? l.turrets : kind === 'door' ? l.doors : kind === 'gate' ? l.gates : l.barriers)![Number(a)]!;
        const m = field === 'model' && typeof value === 'string' ? /^([A-Z]{1,3}\d{1,3}):([A-Za-z0-9_ ]{1,48})$/.exec(value) : null;
        if (!m) bad('must be a model <archive>:<node>, as MP72:mp72_turret01 or MP2:bdoor_4');
        t.source = m![1]!; t.name = m![2]!;
      } else if (kind === 'flare') {
        // A placed flare's Map and Flare: the disc facade node it copies, `<archive>:<node>`.
        const f = l.flares![Number(a)]!;
        const m = field === 'model' && typeof value === 'string' ? /^([A-Z]{1,3}\d{1,3}):([A-Za-z0-9_ .-]{1,48})$/.exec(value) : null;
        if (!m) bad('must be a flare <archive>:<node>');
        f.source = m![1]!; f.name = m![2]!;
      } else if (kind === 'point') {
        const t = l.tacPoints![Number(a)]!;
        if (field === 'name') t.name = typeof value === 'string' && /^[A-Za-z0-9_ -]{1,32}$/.test(value) ? value : bad('must be 1-32 letters, digits, spaces, _ or -');
        else if (field === 'kind') t.kind = Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 31 ? value as number : bad('must be a kind 0-31');
        else bad('is not a tactical point\'s');
      } else if (kind === 'view') {
        const v = l.scenicViews![Number(a)]!;
        const angle = (): number => (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 360 ? value : bad('must be degrees, -360..360'));
        if (field === 'name') v.name = typeof value === 'string' && /^[A-Za-z0-9_ -]{1,32}$/.test(value) ? value : bad('must be 1-32 letters, digits, spaces, _ or -');
        else if (field === 'yaw') v.yaw = angle();
        else if (field === 'pitch') v.pitch = angle();
        else bad('is not a spectator view\'s');
      } else if (kind === 'hostage') {
        const h = l.hostages![Number(a)]!;
        if (field === 'name') h.name = typeof value === 'string' && /^[A-Za-z0-9_ -]{1,32}$/.test(value) ? value : bad('must be 1-32 letters, digits, spaces, _ or -');
        else if (field === 'character') {
          // A bare key is the base's own character; `<stem>:<key>` another disc map's, lent to the match (`source`).
          const m = typeof value === 'string' ? /^(?:([A-Z]{1,3}\d{1,3}):)?([A-Za-z0-9_]{1,32})$/.exec(value) : null;
          if (value === '') { delete h.character; delete h.source; }   // back to the base's first hostage's
          else if (!m) bad('must be a character key, or <map>:<character key>');
          else { h.character = m[2]!; if (m[1]) h.source = m[1]; else delete h.source; }
        } else bad('is not a hostage\'s');
      } else if (kind === 'spawn') {
        if (field !== 'team') bad('is not a spawn\'s');
        l.spawns[Number(a)]!.team = value === 'A' || value === 'B' ? value : bad('must be A or B');
      } else if (kind === 'npc') {
        const n = l.npcs![Number(a)]!;
        if (field === 'side') n.side = value === 'seal' || value === 'terrorist' ? value : bad('must be seal or terrorist');
        else if (field === 'type') n.type = Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 31 ? value as number : bad('must be a character type 0-31');
        else bad('is not an NPC\'s');
      } else if (kind === 'bomb' && (a === 'seal' || a === 'terrorist')) {
        const site = bombs.filter((m) => m.kind === a)[Number(b)]!;
        if (field === 'range') site.range = above0();
        else if (field === 'elevation') site.elevation = above0();
        else bad('is not a bomb site\'s');
      } else fail('UNSUPPORTED', `${ref} has no field to set`);
      break;
    }
    case 'gate.place': case 'barrier.place': {
      // A copy of a disc map's access object (a browser adaptation, `../placedAccess`), in any game type.
      const key = operation === 'gate.place' ? 'gates' : 'barriers';
      const fallback = operation === 'gate.place' ? DEFAULT_GATE : DEFAULT_BARRIER;
      (l[key] ??= []).push({ source: (args['source'] as string | undefined) ?? fallback.source, name: (args['name'] as string | undefined) ?? fallback.name, at, yaw }); break;
    }
    case 'door.place': {
      // A copy of a disc door (a browser adaptation, `../placedDoors`), in any game type: Frostfire's bdoor_4 unless named.
      (l.doors ??= []).push({ source: (args['source'] as string | undefined) ?? DEFAULT_DOOR.source, name: (args['name'] as string | undefined) ?? DEFAULT_DOOR.name, at, yaw }); break;
    }
    case 'turret.place': {
      // A copy of a disc turret (a browser adaptation, `../turrets`), in any game type: Crossroads' RMG unless named.
      (l.turrets ??= []).push({ source: (args['source'] as string | undefined) ?? DEFAULT_TURRET.source, name: (args['name'] as string | undefined) ?? DEFAULT_TURRET.name, at, yaw }); break;
    }
    case 'point.place': {
      // A tactical point, in any game type (a browser adaptation): kind 1, a nav point the compass marks, by default.
      const name = (args['name'] as string | undefined) ?? nextNavName((l.tacPoints ?? []).map((t) => t.name));
      (l.tacPoints ??= []).push({ name, kind: (args['kind'] as number | undefined) ?? 1, at }); break;
    }
    case 'view.place': {
      const name = (args['name'] as string | undefined) ?? nextViewName((l.scenicViews ?? []).map((v) => v.name));
      (l.scenicViews ??= []).push({ name, at, yaw: (args['yaw'] as number | undefined) ?? 0, pitch: (args['pitch'] as number | undefined) ?? 0 }); break;
    }
    case 'extraction.place': {
      // Placed extraction zones play in Extraction only (the owner, 2026-11-05; `../extractionZones`), as the page's tool.
      if (l.objectives?.gameType !== 3 && l.objectives?.gameType !== 4) fail('GAME_TYPE', 'Set the game type to Escort or Extraction to place a Safety zone');
      const size = (args['size'] as [number, number] | undefined) ?? [EXTRACTION_ZONE_SIZE, EXTRACTION_ZONE_SIZE];
      const name = (args['name'] as string | undefined) ?? nextSafetyName((l.extractionZones ?? []).map((z) => z.name));
      (l.extractionZones ??= []).push({ name, at, size: [size[0], size[1]] }); break;
    }
    case 'hostage.place': {
      // Placed hostages play in Escort and Extraction only (the owner, 2026-11-05; `../hostages`), as the page's tool.
      if (l.objectives?.gameType !== 3 && l.objectives?.gameType !== 4) fail('GAME_TYPE', 'Set the game type to Escort or Extraction to place a hostage');
      const taken = (l.hostages ?? []).flatMap((x) => (x.name ? [x.name] : []));
      (l.hostages ??= []).push({ p: at, yaw, name: (args['name'] as string | undefined) ?? nextHostageName(taken) }); break;
    }
    case 'npc.place': (l.npcs ??= []).push({ side: args['side'] as 'seal' | 'terrorist', type: args['type'] as number, p: at, yaw }); break;
    case 'piece.move': case 'selection.move': {
      const d = args['delta'] as number[];
      targets.forEach((r) => r.move(r.p.map((n, i) => n + d[i]!))); break;
    }
    case 'piece.rotate': case 'selection.rotate': {
      const centre = targets.reduce((c, r) => c.map((n, i) => n + r.p[i]! / targets.length), [0, 0, 0]);
      const m = new Matrix4().makeRotationY(yaw);
      targets.forEach((r) => {
        const p = new Vector3(...r.p as [number, number, number]).sub(new Vector3(...centre as [number, number, number])).applyMatrix4(m).add(new Vector3(...centre as [number, number, number]));
        r.turn(yaw); r.move(p.toArray());
      }); break;
    }
    case 'piece.delete': targets.forEach((r) => r.remove()); break;
    case 'piece.lock': case 'piece.unlock': targets.forEach((r) => r.lock(operation === 'piece.lock')); break;
    case 'piece.hide': l.hidden = [...new Set([...(l.hidden ?? []), ...args['keys'] as string[]])]; break;
    case 'piece.restore': l.hidden = (l.hidden ?? []).filter((k) => !(args['keys'] as string[]).includes(k)); break;
    case 'selection.duplicate': targets.forEach((r) => r.duplicate((args['delta'] as number[] | undefined) ?? duplicateDelta)); break;
    case 'bomb.place': {
      const kind = args['kind'] as 'start' | 'seal' | 'terrorist';
      if (bombs.some((b) => b.kind === kind && b.locked)) fail('LOCKED', 'The bomb marker is locked');
      for (let i = bombs.length - 1; i >= 0; i--) if (bombs[i]!.kind === kind) bombs.splice(i, 1);
      // A bomb marker is Demolition's (the owner, 2026-11-05; a browser adaptation): placed only once the layout plays it.
      if (l.objectives?.gameType !== 2) fail('GAME_TYPE', 'Set the game type to Demolition to place the bomb or its sites');
      bombs.push({ kind, at, yaw, locked: false });
      break;
    }
    case 'settings.set': l.settings = parseSettings({ ...l.settings, ...args['settings'] as object }); break;
    case 'objectives.set': {
      if (bombs.some((b) => b.locked)) fail('LOCKED', 'Unlock bomb markers before replacing objectives');
      l.objectives = args['objectives'] as Layout['objectives']; break;
    }
    case 'type.set': {
      l.objectives = { ...l.objectives };
      if (args['type'] === 0) delete l.objectives.gameType;
      else l.objectives.gameType = args['type'] as 1 | 2 | 3 | 4 | 5;
      break;
    }
    default:
      if (FORGE_RULES_EDITS.includes(operation)) { l = planRulesEdit(l, operation, args); break; }
      fail('UNKNOWN_OPERATION', operation);
  }
  if (['piece.move', 'piece.rotate', 'piece.delete', 'piece.lock', 'piece.unlock', 'selection.move', 'selection.rotate', 'bomb.place', 'placement.set'].includes(operation)) {
    const bomb = bombOfMarkerStates(bombs, bombRestOf(l.objectives?.bomb));
    if (bomb) l.objectives = { ...l.objectives, bomb };
    else if (l.objectives) delete l.objectives.bomb;
  }
  return checkedLayout(l, installed);
}

/**
 * The planned layout read back whole and checked. FCW-32: the rules first, each refusal naming its code and field (a
 * broken reference, an invalid rule, F2, the mode's pack), then the record with the layout's modes wired in
 * (`checkCreatorRecord`'s `modes`).
 */
function checkedLayout(planned: ForgeLayout, installed: readonly InstalledRulesPack[] = []): ForgeLayout {
  const l = parseForgeLayout(serializeLayout(planned));
  const rulesWhy = refusalWords(checkForgeRules(l, installed));
  if (rulesWhy) fail('INVALID_RULES', rulesWhy);
  const why = checkRecord(recordOfLayout(l, l.name || 'Layout'), { modes: forgeLayoutModes(l, installed) });   // round 2: and the installed packs' (spec §7)
  if (why) fail('INVALID_LAYOUT', why);
  return l;
}

/**
 * FCW-32: an imported rules pack (`../rulesAuthoring` `importRulesPack`) adopted as the layout's rules -- any rules it
 * had removed first (`rules.clear`), its mode the pack's (the configuration's defaults), its pack required -- and the
 * whole layout checked as every edit is.
 */
export function adoptForgeRules(current: ForgeLayout, draft: ForgeRulesDraft, installed: readonly InstalledRulesPack[] = []): ForgeLayout {
  const l = current.rules ? planRulesEdit(parseForgeLayout(serializeLayout(current)), 'rules.clear', {}) : parseForgeLayout(serializeLayout(current));
  if ((l.requires ?? []).some((r) => r.id === draft.pack.id)) fail('INVALID_ARGUMENT', `The layout already requires a pack ${draft.pack.id}`);
  l.rules = copy(draft);
  l.mode = { id: draft.spec.id, version: draft.pack.version, params: {} };
  l.requires = [...(l.requires ?? []), { ...draft.pack }];
  return checkedLayout(l, installed);
}

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const point = (v: unknown): [number, number, number] => v as [number, number, number];

/** FCW-32: one entity or rules edit on `l` (a copy already); the whole layout is checked after (`planForgeLayout`). */
function planRulesEdit(l: ForgeLayout, operation: string, args: Record<string, unknown>): ForgeLayout {
  const draft = (): ForgeRulesDraft => l.rules ?? fail('NO_RULES', 'The layout has no rules: make them first (rules.new)');
  const withSpec = (spec: RulesSpec): void => { l.rules = { pack: draft().pack, spec }; };
  switch (operation) {
    case 'zone.place': {
      const zone = args['shape'] === 'box'
        ? { id: args['id'], shape: 'box', at: point(args['at']), size: args['size'] ?? fail('INVALID_ARGUMENT', 'A box zone has a size [x, y, z]'), yaw: (args['yaw'] as number | undefined) ?? 0 }
        : { id: args['id'], shape: 'cylinder', at: point(args['at']), radius: args['radius'] ?? fail('INVALID_ARGUMENT', 'A cylinder zone has a radius'),
          height: args['height'] ?? fail('INVALID_ARGUMENT', 'A cylinder zone has a height') };
      (l.zones ??= []).push(zone as unknown as LayoutZone);
      return l;
    }
    case 'marker.place': (l.markers ??= []).push({ id: args['id'] as string, at: point(args['at']), yaw: (args['yaw'] as number | undefined) ?? 0 } as LayoutMarker); return l;
    case 'spawner.place': {
      const { id, source, at, yaw, radius, team, side, type } = args;
      (l.spawners ??= []).push({ id, source, at: point(at), yaw: yaw ?? 0, radius: radius ?? 0,
        ...(team === undefined ? {} : { team }), ...(side === undefined ? {} : { side }), ...(type === undefined ? {} : { type }) } as unknown as LayoutSpawner);
      return l;
    }
    case 'rules.new': {
      if (l.rules) fail('RULES_EXIST', 'The layout has rules already: clear them first (rules.clear)');
      const pack = { id: args['pack'] as string, version: (args['version'] as string | undefined) ?? '1.0.0', hash: UNSEALED_HASH };
      if ((l.requires ?? []).some((r) => r.id === pack.id)) fail('INVALID_ARGUMENT', `The layout already requires a pack ${pack.id}`);
      const spec = { schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: args['id'] as string, name: args['name'] as string, rules: [] } as RulesSpec;
      l.rules = { pack, spec };
      l.mode = { id: spec.id, version: pack.version, params: {} };
      l.requires = [...(l.requires ?? []), pack];
      return l;
    }
    case 'rules.set': {
      const old = draft();
      const version = (args['version'] as string | undefined) ?? old.pack.version;
      const spec = copy(args['spec']) as RulesSpec;
      const pack = { ...old.pack, version };
      l.rules = { pack, spec };
      l.requires = (l.requires ?? []).map((r) => (r.id === old.pack.id && r.version === old.pack.version ? pack : r));
      l.mode = { id: typeof spec.id === 'string' ? spec.id : '', version, params: l.mode?.params ?? {} };
      return l;
    }
    case 'rules.rule.set': {
      const spec = copy(draft().spec);
      const rule = copy(args['rule']) as RuleDecl;
      const list = [...spec.rules];
      const was = list.findIndex((r) => r.id === rule.id);
      if (was >= 0) list.splice(was, 1);
      const index = (args['index'] as number | undefined) ?? (was >= 0 ? was : list.length);
      list.splice(Math.min(index, list.length), 0, rule);
      withSpec({ ...spec, rules: list });
      return l;
    }
    case 'rules.rule.delete': {
      const spec = copy(draft().spec);
      if (!spec.rules.some((r) => r.id === args['id'])) fail('NOT_FOUND', `The rules hold no rule ${String(args['id'])}`);
      withSpec({ ...spec, rules: spec.rules.filter((r) => r.id !== args['id']) });
      return l;
    }
    case 'rules.variable.set': {
      const spec = copy(draft().spec);
      const variable = copy(args['variable']) as RulesVariable;
      const list = [...(spec.variables ?? [])];
      const was = list.findIndex((v) => v.id === variable.id);
      if (was >= 0) list[was] = variable; else list.push(variable);
      withSpec({ ...spec, variables: list });
      return l;
    }
    case 'rules.variable.delete': {
      const spec = copy(draft().spec);
      if (!(spec.variables ?? []).some((v) => v.id === args['id'])) fail('NOT_FOUND', `The rules declare no variable ${String(args['id'])}`);
      const variables = (spec.variables ?? []).filter((v) => v.id !== args['id']);
      const rest: RulesSpec = { ...spec };
      delete (rest as { variables?: unknown }).variables;
      withSpec(variables.length ? { ...rest, variables } : rest);
      return l;
    }
    case 'rules.config.set': {
      const mode = l.mode ?? fail('NO_RULES', 'The layout plays no rules mode: make its rules first (rules.new)');
      l.mode = { ...mode, params: copy(args['params']) as Record<string, unknown> };
      return l;
    }
    case 'rules.clear': {
      const old = draft();
      delete l.rules;
      if (l.mode?.id === old.spec.id && l.mode.version === old.pack.version) delete l.mode;
      const requires = (l.requires ?? []).filter((r) => !(r.id === old.pack.id && r.version === old.pack.version));
      if (requires.length) l.requires = requires; else delete l.requires;
      return l;
    }
    default: return fail('UNKNOWN_OPERATION', operation);
  }
}
