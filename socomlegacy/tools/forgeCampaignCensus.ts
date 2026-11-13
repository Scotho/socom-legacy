/**
 * FX-7 (the Forge export sprint, `docs/plans/2026-11-11-forge-export-sprint.md`; product track): a read-only census of
 * what the campaign's map archives hold, kind by kind, as the port's readers find it. An instrument with no original: it
 * reports what the disc holds and changes nothing the game or the port does. The question it answers: which interactive
 * kinds do the campaign maps hold that the multiplayer maps lack, so the Forge's campaign-assets pass knows what exists.
 *
 * The maps: the campaign's archives as the Forge lists them (`../packages/viewer/src/forge/catalog` `archivesOf`, the
 * twelve `RUN/M<NN>.ZDB`; `--with-multiplayer` adds the `RUN/MP<N>.ZDB` for the comparison, `--maps` names any). Each is
 * loaded as the page loads it (`../packages/viewer/src/loadMap` `loadMap`) and counted off the `LoadedMap` it gives:
 * its props (`props`, the world's facade nodes left out as `forge/hide` `placementsOf` leaves them), doors (`doors`,
 * `../doors` `readDoors`), turrets (`turrets`), lever gates (`gates`, `../gates`), cranes (`cranes`), the Forge's own
 * census of copyable kinds (`../packages/viewer/src/forge/mapCensus` `censusOf`: door, turret, hostage, ladder prop,
 * gate and C4 barrier access objects, flare), the hull's ladder polygons (`@s2u/scene` `findLadders`), the
 * destructibles and the set's programs (`meta.scene`, `../sceneHealth`), the map actions by type code
 * (`meta.actions`, `../mapActions` `ACTION_TYPE_CODES`), and the trigger-like records the readers expose: the
 * autostarting animations (`meta.autostart`), the fired nodes (`meta.fireNodes`), the tactical map's zones, points and
 * lines by kind (`tac`, `../tacMap`), the AI spawn list (`ai.spawns`), the escortees, the scenic views and the bomb start.
 *
 * It prints a table (the maps as columns) and a JSON object (`--json <path>` writes it to a file instead); it exits 0
 * whatever it finds, a map that does not load listed as failed. The disc is found as `./censusDisc`'s
 * `openDisc` finds it. From `socomlegacy/`:
 *   SOCOM_DISC=<dir> npx tsx tools/forgeCampaignCensus.ts [--with-multiplayer] [--json <path>] [--maps M51,MP2]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cleanError, openDisc, parseCensusArgs } from './censusDisc';

/**
 * How the port uses each action type code, as its code reads at this branch's base (agent/fx-w1 bef2dbd5e2). The names
 * and codes are `../packages/viewer/src/mapActions` `ACTION_TYPE_CODES` and `ACTION_TYPE_UNKNOWN` (the unit test holds
 * them equal). `prompt`: `mapActions.ts` `actionReachNote` refuses a record of code 8 outright (never a prompt) and
 * weighs every other code alike by range and elevation. `consumers`: the sources that act on a record by its code; a code
 * with none is parsed only -- read, placed on its node, and reachable by the pick, but no reader does anything with it.
 */
export interface ActionTypeUse { code: number; name: string; prompt: boolean; actedOn: boolean; consumers: readonly string[] }
const use = (code: number, name: string, consumers: readonly string[], prompt = true): ActionTypeUse =>
  ({ code, name, prompt, actedOn: consumers.length > 0, consumers });
export const ACTION_TYPES: readonly ActionTypeUse[] = [
  use(0, 'DOOR', ['viewer/src/doors.ts readDoors', 'viewer/src/forge/placedDoors.ts']),
  use(1, 'WINDOW', []),
  use(2, 'SWITCH', ['viewer/src/actionPage.ts', 'viewer/src/gates.ts', 'viewer/src/cranes.ts', 'viewer/src/forge/matchRules.ts', 'match/src/room.ts']),
  use(3, 'DEFUSE', []),
  use(4, 'MPBOMB', ['viewer/src/net/objective.ts', 'viewer/src/forge/objectives.ts']),
  use(5, 'ACT_BREACH', []),
  use(6, 'SATCHEL', []),
  use(7, 'ITEM', []),
  use(8, 'UNKNOWN', [], false),
];

/** The kinds counted per map, in table order. */
export const CAMPAIGN_KINDS = [
  { key: 'propPrototypes', label: 'prop prototypes (distinct models)' },
  { key: 'propEntries', label: 'prop entries (LOD twins apart)' },
  { key: 'propPlacements', label: 'prop placements' },
  { key: 'doors', label: 'doors (readDoors)' },
  { key: 'turrets', label: 'turrets (mapTurrets)' },
  { key: 'leverGates', label: 'lever gates (readGates)' },
  { key: 'forgeGates', label: 'gate access objects (Forge copies)' },
  { key: 'forgeBarriers', label: 'C4 barriers (Forge copies)' },
  { key: 'cranes', label: 'cranes (readCranes)' },
  { key: 'ladderProps', label: 'ladder props (Forge copies)' },
  { key: 'hullLadders', label: 'ladder polygons (hull)' },
  { key: 'destructibles', label: 'destructibles (placed)' },
  { key: 'destructibleAnims', label: 'destructible animations' },
  { key: 'unplacedDestructibles', label: 'destructibles unplaced' },
  { key: 'hostages', label: 'hostage characters (Forge)' },
  { key: 'escortees', label: 'escortees placed' },
  { key: 'flares', label: 'flares (Forge copies)' },
  { key: 'mapActions', label: 'map actions (all types)' },
  { key: 'scenePrograms', label: 'zAnim programs (set)' },
  { key: 'autostart', label: 'autostart commands' },
  { key: 'fireNodes', label: 'fired nodes' },
  { key: 'tacZones', label: 'tactical zones' },
  { key: 'tacPoints', label: 'tactical points' },
  { key: 'tacLines', label: 'tactical lines' },
  { key: 'aiSpawns', label: 'AI spawn records' },
  { key: 'scenicViews', label: 'scenic views' },
  { key: 'bombStart', label: 'bomb start' },
] as const;
export type KindKey = (typeof CAMPAIGN_KINDS)[number]['key'];

/** What the census reads off one loaded map: `LoadedMap`'s fields by shape, and the two counts the caller derives. */
export interface CampaignMapFacts {
  stem: string;
  campaign: boolean;
  /** The world's facade nodes already left out. */
  props: readonly { modelName: string; matrices: ArrayLike<number> }[];
  doors?: readonly unknown[];
  turrets?: readonly unknown[];
  gates?: readonly unknown[];
  cranes?: readonly unknown[];
  actions?: readonly { type: string; typeCode: number }[];
  meta?: {
    scene?: { destructibles: readonly { anim: string }[]; programs: readonly unknown[]; unplaced?: readonly string[] };
    autostart?: readonly unknown[];
    fireNodes?: ReadonlyMap<string, unknown>;
  };
  tac?: { zones: readonly { kind: number }[]; points: readonly { kind: number }[]; lines: readonly { type: number }[] } | null;
  ai?: { spawns: readonly unknown[] };
  escortees?: readonly unknown[];
  scenicViews?: readonly unknown[];
  bombStart?: readonly number[];
  /** `forge/mapCensus` `censusOf` on the map. */
  forgeCensus: { door: number; turret: number; hostage: number; ladder: number; gate: number; barrier: number; flare: number };
  /** `findLadders(groundPolygons(map.ground))`'s length, 0 without ground. */
  hullLadders: number;
}

export interface MapKindCounts {
  map: string;
  campaign: boolean;
  status: 'ok' | 'failed';
  error?: string;
  kinds: Record<KindKey, number>;
  /** `<code> <NAME>`, or for code 8 `8 UNKNOWN <the record's own type, or (none)>`: count. */
  actionTypes: Record<string, number>;
  /** The tactical map's zones and points by their `kind`. */
  tacZoneKinds: Record<string, number>;
  tacPointKinds: Record<string, number>;
}

const zeroKinds = (): Record<KindKey, number> => Object.fromEntries(CAMPAIGN_KINDS.map((k) => [k.key, 0])) as Record<KindKey, number>;
const tally = <T>(items: readonly T[], key: (t: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const t of items) { const k = key(t); out[k] = (out[k] ?? 0) + 1; }
  return out;
};

/** The action's row: its code and the table's name, an unknown by the record's own type. */
export function actionTypeKey(a: { type: string; typeCode: number }): string {
  const known = ACTION_TYPES[a.typeCode];
  if (!known || known.code === 8) return `8 UNKNOWN ${a.type === '' ? '(none)' : a.type}`;
  return `${known.code} ${known.name}`;
}

/** One map's counts. Pure. */
export function campaignCountsOf(f: CampaignMapFacts): MapKindCounts {
  const kinds = zeroKinds();
  const scene = f.meta?.scene;
  kinds.propPrototypes = new Set(f.props.map((p) => p.modelName)).size;
  kinds.propEntries = f.props.length;
  kinds.propPlacements = f.props.reduce((n, p) => n + Math.floor(p.matrices.length / 16), 0);
  kinds.doors = f.doors?.length ?? 0;
  kinds.turrets = f.turrets?.length ?? 0;
  kinds.leverGates = f.gates?.length ?? 0;
  kinds.forgeGates = f.forgeCensus.gate;
  kinds.forgeBarriers = f.forgeCensus.barrier;
  kinds.cranes = f.cranes?.length ?? 0;
  kinds.ladderProps = f.forgeCensus.ladder;
  kinds.hullLadders = f.hullLadders;
  kinds.destructibles = scene?.destructibles.length ?? 0;
  kinds.destructibleAnims = new Set((scene?.destructibles ?? []).map((d) => d.anim)).size;
  kinds.unplacedDestructibles = scene?.unplaced?.length ?? 0;
  kinds.hostages = f.forgeCensus.hostage;
  kinds.escortees = f.escortees?.length ?? 0;
  kinds.flares = f.forgeCensus.flare;
  kinds.mapActions = f.actions?.length ?? 0;
  kinds.scenePrograms = scene?.programs.length ?? 0;
  kinds.autostart = f.meta?.autostart?.length ?? 0;
  kinds.fireNodes = f.meta?.fireNodes?.size ?? 0;
  kinds.tacZones = f.tac?.zones.length ?? 0;
  kinds.tacPoints = f.tac?.points.length ?? 0;
  kinds.tacLines = f.tac?.lines.length ?? 0;
  kinds.aiSpawns = f.ai?.spawns.length ?? 0;
  kinds.scenicViews = f.scenicViews?.length ?? 0;
  kinds.bombStart = f.bombStart ? 1 : 0;
  return {
    map: f.stem, campaign: f.campaign, status: 'ok', kinds,
    actionTypes: tally(f.actions ?? [], actionTypeKey),
    tacZoneKinds: tally(f.tac?.zones ?? [], (z) => String(z.kind)),
    tacPointKinds: tally(f.tac?.points ?? [], (p) => String(p.kind)),
  };
}

/** A map that did not load. */
export function failedKindMap(map: string, campaign: boolean, error: string): MapKindCounts {
  return { map, campaign, status: 'failed', error, kinds: zeroKinds(), actionTypes: {}, tacZoneKinds: {}, tacPointKinds: {} };
}

export interface CampaignCensusReport {
  kinds: typeof CAMPAIGN_KINDS;
  actionTypes: readonly ActionTypeUse[];
  maps: MapKindCounts[];
  campaignMaps: string[];
  multiplayerMaps: string[];
  failed: string[];
  /** Each kind summed over the campaign maps. */
  campaignTotals: Record<KindKey, number>;
  /** Each action type summed over the campaign maps. */
  campaignActionTypes: Record<string, number>;
  /**
   * What some campaign map holds and no multiplayer map read here does: kinds, action types, tactical zone and point
   * kinds. Null when no multiplayer map was read (no comparison).
   */
  campaignOnly: { kinds: KindKey[]; actionTypes: string[]; tacZoneKinds: string[]; tacPointKinds: string[] } | null;
}

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The report over every map's counts. Pure. */
export function buildCampaignReport(rows: readonly MapKindCounts[]): CampaignCensusReport {
  const ok = rows.filter((r) => r.status === 'ok');
  const camp = ok.filter((r) => r.campaign), mp = ok.filter((r) => !r.campaign);
  const campaignTotals = zeroKinds();
  const campaignActionTypes: Record<string, number> = {};
  for (const r of camp) {
    for (const k of CAMPAIGN_KINDS) campaignTotals[k.key] += r.kinds[k.key];
    for (const [t, n] of Object.entries(r.actionTypes)) campaignActionTypes[t] = (campaignActionTypes[t] ?? 0) + n;
  }
  const keysOf = (pick: (r: MapKindCounts) => Record<string, number>, set: readonly MapKindCounts[]): Set<string> =>
    new Set(set.flatMap((r) => Object.entries(pick(r)).filter(([, n]) => n > 0).map(([k]) => k)));
  const only = (pick: (r: MapKindCounts) => Record<string, number>): string[] => {
    const theirs = keysOf(pick, mp);
    return [...keysOf(pick, camp)].filter((k) => !theirs.has(k)).sort(byKey);
  };
  return {
    kinds: CAMPAIGN_KINDS,
    actionTypes: ACTION_TYPES,
    maps: [...rows],
    campaignMaps: rows.filter((r) => r.campaign).map((r) => r.map),
    multiplayerMaps: rows.filter((r) => !r.campaign).map((r) => r.map),
    failed: rows.filter((r) => r.status === 'failed').map((r) => r.map),
    campaignTotals,
    campaignActionTypes,
    campaignOnly: mp.length === 0 ? null : {
      kinds: CAMPAIGN_KINDS.map((k) => k.key).filter((k) => camp.some((r) => r.kinds[k] > 0) && mp.every((r) => r.kinds[k] === 0)),
      actionTypes: only((r) => r.actionTypes),
      tacZoneKinds: only((r) => r.tacZoneKinds),
      tacPointKinds: only((r) => r.tacPointKinds),
    },
  };
}

/** How the port uses an action row's code, for the table. */
function useOf(key: string): string {
  const t = ACTION_TYPES[Number.parseInt(key, 10)];
  if (!t) return '?';
  if (!t.prompt) return 'never a prompt';
  return t.actedOn ? 'acted on' : 'parsed only';
}

/** The text table: kinds, action types and tactical kinds as rows, the maps as columns. Pure. */
export function renderCampaignTable(report: CampaignCensusReport): string {
  const maps = report.maps.filter((r) => r.status === 'ok');
  const W = 6, L = 36;
  const cols = (cells: readonly (string | number)[]): string => cells.map((c) => String(c).padStart(W)).join('');
  const out = [`${''.padEnd(L)}${cols(maps.map((m) => m.map))}`];
  for (const k of CAMPAIGN_KINDS) out.push(`${k.label.padEnd(L)}${cols(maps.map((m) => m.kinds[k.key]))}`);
  const actionKeys = [...new Set(maps.flatMap((m) => Object.keys(m.actionTypes)))].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10) || byKey(a, b));
  out.push('', 'action types by ACTION_TYPE_CODES code [how the port uses it at this base]');
  for (const a of actionKeys) out.push(`${`${a} [${useOf(a)}]`.slice(0, L - 1).padEnd(L)}${cols(maps.map((m) => m.actionTypes[a] ?? 0))}`);
  for (const [title, pick] of [['tactical zone kinds', (m: MapKindCounts) => m.tacZoneKinds], ['tactical point kinds', (m: MapKindCounts) => m.tacPointKinds]] as const) {
    const keys = [...new Set(maps.flatMap((m) => Object.keys(pick(m))))].sort((a, b) => Number(a) - Number(b));
    out.push('', title);
    for (const k of keys) out.push(`${`kind ${k}`.padEnd(L)}${cols(maps.map((m) => pick(m)[k] ?? 0))}`);
  }
  out.push('', 'action type codes: ' + report.actionTypes.map((t) => `${t.code} ${t.name} ${t.prompt ? (t.actedOn ? 'acted on' : 'parsed only') : 'never a prompt'}`).join('; '));
  for (const r of report.maps) if (r.status === 'failed') out.push(`${r.map}: FAILED: ${r.error ?? ''}`);
  if (report.campaignOnly) {
    const c = report.campaignOnly;
    out.push('', `on a campaign map and on no multiplayer map read (${report.multiplayerMaps.length}):`,
      `  kinds: ${c.kinds.join(', ') || '(none)'}`, `  action types: ${c.actionTypes.join(', ') || '(none)'}`,
      `  tactical zone kinds: ${c.tacZoneKinds.join(', ') || '(none)'}`, `  tactical point kinds: ${c.tacPointKinds.join(', ') || '(none)'}`);
  } else out.push('', 'no multiplayer map read: run with --with-multiplayer for the comparison');
  return out.join('\n');
}

async function main(argv: readonly string[]): Promise<void> {
  let args: ReturnType<typeof parseCensusArgs>;
  try { args = parseCensusArgs(argv, ['--with-multiplayer']); } catch (e) {
    console.error(`forgeCampaignCensus: ${(e as Error).message}\nusage: npx tsx tools/forgeCampaignCensus.ts [--with-multiplayer] [--json <path>] [--maps M51,MP2]`);
    process.exitCode = 2;
    return;
  }
  const disc = await openDisc();
  if (!disc) {
    console.error('forgeCampaignCensus: no disc -- set SOCOM_DISC (the directory holding RUN/), SOCOM_PC_ROOT or SOCOM_ISO');
    process.exitCode = 2;
    return;
  }
  const { archivesOf } = await import('../packages/viewer/src/forge/catalog');
  const { loadMap } = await import('../packages/viewer/src/loadMap');
  const { isWorldFacadeProp } = await import('../packages/viewer/src/worldFacadeProps');
  const { censusOf } = await import('../packages/viewer/src/forge/mapCensus');
  const { groundPolygons } = await import('../packages/viewer/src/mover');
  const { findLadders } = await import('@s2u/scene');
  const { ACTION_TYPE_CODES } = await import('../packages/viewer/src/mapActions');
  for (const [name, code] of Object.entries(ACTION_TYPE_CODES)) {
    if (ACTION_TYPES[code]?.name !== name) console.error(`forgeCampaignCensus: ACTION_TYPE_CODES ${name}=${code} differs from this census's table`);
  }
  const only = args.maps;
  const archives = archivesOf(await disc.source.list())
    .filter((a) => (only ? only.includes(a.stem) : a.campaign || args.flags.has('--with-multiplayer')));
  const rows: MapKindCounts[] = [];
  for (const a of archives) {
    const t = Date.now();
    try {
      const map = await loadMap(disc.source, a.path);
      rows.push(campaignCountsOf({
        stem: a.stem, campaign: a.campaign,
        props: map.props.filter((p) => !isWorldFacadeProp(p)),
        doors: map.doors, turrets: map.turrets, gates: map.gates, cranes: map.cranes,
        actions: map.meta?.actions ?? map.actions,
        meta: map.meta, tac: map.tac, ai: map.ai, escortees: map.escortees, scenicViews: map.scenicViews, bombStart: map.bombStart,
        forgeCensus: censusOf(map),
        hullLadders: map.ground ? findLadders(groundPolygons(map.ground)).length : 0,
      }));
      console.error(`${a.stem}: ${Date.now() - t} ms`);
    } catch (e) {
      rows.push(failedKindMap(a.stem, a.campaign, cleanError(e, disc.root)));
      console.error(`${a.stem}: FAILED after ${Date.now() - t} ms`);
    }
  }
  const report = buildCampaignReport(rows);
  console.log(renderCampaignTable(report));
  if (args.json) {
    writeFileSync(args.json, JSON.stringify(report, null, 2));
    console.log(`\nJSON written to ${args.json}`);
  } else console.log(`\n${JSON.stringify(report, null, 2)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // A map that fails to load is a finding (exit 0); only the census's own crash exits 1.
  main(process.argv.slice(2)).catch((e: unknown) => { console.error(e); process.exitCode = 1; });
}
