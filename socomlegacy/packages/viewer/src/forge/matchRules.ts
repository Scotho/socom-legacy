import { RULE_EVENT_SPECS, type InstalledRulesPack, type RuleEventName } from '@s2u/creator-contracts';
import {
  RuleHost, type RuleEventInput, type RuleLayout, type RuleNpcSeats, type RulePlayer, type RuleRoom, type RulesShow, type RulesWire, type RuleV3,
} from '../../../match/src/creator/rules';
import type { LoadedMap } from '../loadMap';
import { ACTION_TYPE_CODES } from '../mapActions';
import { forgeLayoutModes, refusalWords, type ForgeLayout } from './rulesAuthoring';

/**
 * FCW-32 round 2 (the held items of FCW-31's review; product track): Play runs the layout's rules. A browser adaptation
 * with no original -- the Forge's authoring instrument. A layout whose mode is a rules mode (its own draft's, or an
 * installed rules pack's: `../rulesAuthoring` `forgeLayoutModes`) plays with that mode's `RulesSpec`, its configuration's
 * values (the `RecordMode`'s `params`) and the layout's zones, markers and spawners, on the page's room's rule host
 * (FCW-31, `match/src/creator/rules`), which decides every outcome; the host is built with the loaded map's doors and
 * switches as the room names them (`ruleMapNames`), so a pack's `door.open|close` and `interact` refer to real ids and
 * one the map lacks is refused at enable by the host's own check. A layout without a rules mode plays as before: no host.
 */
export const FORGE_PLAY_RULES_ADAPTATION =
  "Forge Play runs a layout's rules mode on the page room's rule host, with the map's doors and switches; a fresh seed each Play; a release seats NPCs on that room; no rules mode, no host" as const;

/**
 * The rules' seed for one Play (spec §6: "a rules round takes the room's seed"; the page's loopback room keeps none, so
 * each Play draws one, as each match is a new one). A browser adaptation; `rules.test` takes its seed from the caller.
 */
export function playRulesSeed(): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') return c.getRandomValues(new Uint32Array(1))[0]!;
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

/**
 * The map's doors and switches by the names the room's events and actions use: a door by its spec's scene node
 * (`room.ts`'s seam `door(id)` finds `doors.specs[i].node`; its `interact` names `spec.node`), a switch by its action
 * record's valve (`room.ts` `useAction` takes only `SWITCH`-typed records, its `interact` naming `a.valve`). Each once,
 * in the map's order; none for a map without them (the blank floor).
 */
export function ruleMapNames(map: Pick<LoadedMap, 'doors' | 'meta'>): { doors: string[]; switches: string[] } {
  const doors = [...new Set((map.doors ?? []).map((d) => d.node).filter((n) => n.length > 0))];
  const switches = [...new Set((map.meta?.actions ?? []).filter((a) => a.typeCode === ACTION_TYPE_CODES['SWITCH'] && a.valve.length > 0).map((a) => a.valve))];
  return { doors, switches };
}

/**
 * The ONE derivation of "the map's names" for a layout's base (FCW-32 round 2 review F1): Play's room and `rules.test`
 * both take them here, so one pack is accepted or refused the same by each. A map base gives its doors and switches
 * (`ruleMapNames`); the blank floor plays on its library's archive with none of that map's world (the page's composition
 * clears its doors, slots and props), so it has none -- even when the library map's metadata holds switch records.
 */
export function ruleNamesOf(base: { kind: string } | null | undefined, map: Pick<LoadedMap, 'doors' | 'meta'> | null | undefined): { doors: string[]; switches: string[] } {
  return base && base.kind !== 'blank' && map ? ruleMapNames(map) : { doors: [], switches: [] };
}

/** What a Play hands the room's rule host (`./match` `startForgeMatch`'s `rules`). */
export interface ForgePlayRules {
  spec: unknown;
  seed: number;
  params: Readonly<Record<string, unknown>>;
  layout: RuleLayout;
  /** The map's names for the host (`ruleNamesOf`); unset, `startForgeMatch` reads them off its map. */
  names?: { doors: readonly string[]; switches: readonly string[] };
}

/**
 * The rules a layout plays, or null when its mode is no rules mode (a retail type, or none): the mode's spec from the
 * layout's own draft or an installed rules pack (`forgeLayoutModes`, the draft first), its params, the layout's rules
 * entities.
 */
export function forgePlayRules(l: ForgeLayout, seed: number, installed: readonly InstalledRulesPack[] = []): ForgePlayRules | null {
  const mode = l.mode;
  if (!mode) return null;
  const entry = forgeLayoutModes(l, installed).find((m) => m.id === mode.id && m.version === mode.version);
  if (!entry) return null;
  const sameRef = (a: { id: string; version: string; hash: string }): boolean => a.id === entry.pack.id && a.version === entry.pack.version && a.hash === entry.pack.hash;
  const spec = l.rules && sameRef(l.rules.pack) ? l.rules.spec : installed.find((p) => sameRef(p.ref))?.spec;
  if (spec === undefined) return null;
  const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    spec: copy(spec), seed: seed >>> 0, params: copy(mode.params ?? {}),
    layout: { ...(l.zones ? { zones: copy(l.zones) } : {}), ...(l.markers ? { markers: copy(l.markers) } : {}), ...(l.spawners ? { spawners: copy(l.spawners) } : {}) },
  };
}

/**
 * The room's rule host for a Play: built with the layout's entities and the map's doors and switches, the pack enabled
 * (the host's own check: `validateRules` against them, then the params). Refused, it throws naming each refusal by its
 * code, field and words (`refusalWords`): the Play does not start.
 */
export function forgeRuleHost(rules: Pick<ForgePlayRules, 'spec' | 'seed' | 'params' | 'layout'>, names: { doors: readonly string[]; switches: readonly string[] },
  extra: { npcs?: RuleNpcSeats; keepLog?: boolean } = {}): RuleHost {
  const host = new RuleHost({ ...(rules.layout ? { layout: rules.layout } : {}), doors: names.doors, switches: names.switches, ...extra });
  const report = host.enable(rules.spec, rules.seed, rules.params ?? {});
  if (report.status !== 'pass') throw new Error(`the layout's rules pack was refused: ${refusalWords(report) ?? report.diagnostics.map((d) => d.code).join(', ')}`);
  return host;
}

// ---------------------------------------------------------------------------------------------------------------------
// rules.test: a mode's rules run on the room's own rule host against a scripted run, with no room
// ---------------------------------------------------------------------------------------------------------------------

/**
 * FCW-32 round 2 (the review's F2: the brief's step 3 "test" verb; product track, the Forge's authoring instrument): a
 * layout's rules mode run on the room's rule host (`RuleHost`, FCW-31 -- the same host the Play's room runs) against a
 * scripted run instead of a room. The host is built as Play builds it (`forgeRuleHost`: the layout's entities, the base
 * map's doors and switches) and attached to a recording room (`RulesTestRoom`): the seats are the script's, each room
 * action the host asks (damage, elimination, score, the round's or match's end, a door, a respawn) is recorded, never
 * applied, and each presentation the host tells is recorded. The match and its first round start at tick 1; each of the
 * script's ticks is the next tick: its seats moved and their life set, then its events told to the host, then the host's
 * step (timers, zones, items, the events' rules and their chains). The answer: the host's state, the rules fired in
 * order, the variables, the phase, the shows, the room actions and the host's diagnostics. A browser adaptation: nothing
 * of a match runs, and the room's own outcomes (a kill, a door's swing) are whatever the script says.
 */
export const RULES_TEST_ADAPTATION =
  "rules.test runs a layout's rules mode on the room's rule host over a scripted run and a recording room: nothing applied, every room action and show recorded; a release is given seat ids the host tracks" as const;
/**
 * The first seat id `rules.test` gives a released NPC. A script's own seats stay below `RULES_TEST_SEATS_ADAPTATION`.
 * The next release continues after these. A scripted `player.death` of one of them is that spawner's `npc.death`.
 */
export const RULES_TEST_NPC_SEAT = 64;
/** The most ticks one scripted run takes, and events per tick (the host's own per-tick budget then applies). */
export const RULES_TEST_TICKS_ADAPTATION = 600;
export const RULES_TEST_EVENTS_ADAPTATION = 64;
/** A script's own seat ids are 0 to this less one (`checkRulesScript`), below `RULES_TEST_NPC_SEAT`. */
export const RULES_TEST_SEATS_ADAPTATION = 16;

export interface RulesTestSeat { id: number; team: 'seal' | 'terrorist'; at?: RuleV3; alive?: boolean }
export interface RulesTestTick {
  /** Seats moved to these feet this tick, by seat id. */
  move?: Readonly<Record<string, RuleV3>>;
  /** Seats whose body lives (true) or died (false) this tick, by seat id. */
  alive?: Readonly<Record<string, boolean>>;
  /** The room's outcomes this tick, as the room would tell them (`RuleEventInput`). */
  events?: readonly RuleEventInput[];
}
export interface RulesTestScript { seed?: number; players?: readonly RulesTestSeat[]; ticks?: readonly RulesTestTick[] }
export type RulesTestAction = { tick: number; do: string } & Record<string, unknown>;
export interface RulesTestResult {
  state: string;
  mode: string | null;
  seed: number;
  ticks: number;
  fired: string[];
  variables: Readonly<Record<string, number | boolean | string>>;
  phase: string | null;
  shows: ({ tick: number; to: number | null } & Omit<RulesShow, 'to'>)[];
  purchases: ({ tick: number; to: number | null } & Record<string, unknown>)[];
  applied: RulesTestAction[];
  diagnostics: { code: string; field?: string; text: string }[];
}

/**
 * Why a script cannot run, or null (the round-2 re-look's F7): each player's seat id below `RULES_TEST_SEATS_ADAPTATION`,
 * every tick's moves are seat ids to points (three finite
 * numbers), its alive flags seat ids to booleans, each event an object of a name the vocabulary has
 * (`RULE_EVENT_SPECS`) with integer seats, a text id and number-or-text fields -- nothing else. The caller refuses
 * `INVALID_ARGUMENT`: a malformed script is the caller's mistake, not the pack's.
 */
export function checkRulesScript(script: RulesTestScript): string | null {
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const seatKey = (k: string): boolean => k !== '' && Number.isInteger(Number(k)) && Number(k) >= 0;
  // The review's F2 (a maintainers' fix): a script's own seats stay below `RULES_TEST_SEATS_ADAPTATION`, so none is ever
  // a release's id (`RULES_TEST_NPC_SEAT` on) and taken for that spawner's NPC.
  const players = Array.isArray(script.players) ? script.players : [];
  for (let i = 0; i < players.length; i++) {
    const id = (players[i] as { id?: unknown } | null)?.id;
    if (typeof id === 'number' && id >= RULES_TEST_SEATS_ADAPTATION) {
      return `players[${i}].id is ${id}: a script's seats are 0 to ${RULES_TEST_SEATS_ADAPTATION - 1}; a release's ids start at ${RULES_TEST_NPC_SEAT}`;
    }
  }
  const ticks = script.ticks ?? [];
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i] as unknown;
    const at = `ticks[${i}]`;
    if (!isObj(t)) return `${at} is not an object`;
    if (t['move'] !== undefined) {
      if (!isObj(t['move'])) return `${at}.move is not an object of seat id to point`;
      for (const [k, p] of Object.entries(t['move'])) {
        if (!seatKey(k)) return `${at}.move names ${k.slice(0, 40)}, not a seat id`;
        if (!Array.isArray(p) || p.length !== 3 || !p.every((n) => typeof n === 'number' && Number.isFinite(n))) return `${at}.move[${k}] is not a point of three numbers`;
      }
    }
    if (t['alive'] !== undefined) {
      if (!isObj(t['alive'])) return `${at}.alive is not an object of seat id to true or false`;
      for (const [k, a] of Object.entries(t['alive'])) {
        if (!seatKey(k)) return `${at}.alive names ${k.slice(0, 40)}, not a seat id`;
        if (typeof a !== 'boolean') return `${at}.alive[${k}] is not true or false`;
      }
    }
    if (t['events'] !== undefined) {
      if (!Array.isArray(t['events'])) return `${at}.events is not a list`;
      for (let j = 0; j < t['events'].length; j++) {
        const e = t['events'][j] as unknown, where = `${at}.events[${j}]`;
        if (!isObj(e)) return `${where} is not an object`;
        const extra = Object.keys(e).find((k) => !['name', 'player', 'attacker', 'victim', 'id', 'fields'].includes(k));
        if (extra) return `${where} has no field ${extra.slice(0, 40)}`;
        if (typeof e['name'] !== 'string' || !Object.hasOwn(RULE_EVENT_SPECS, e['name'])) return `${where}.name is not an event of the vocabulary (forge.rules, section vocabulary)`;
        for (const k of ['player', 'attacker', 'victim']) if (e[k] !== undefined && !(Number.isInteger(e[k]) && (e[k] as number) >= 0)) return `${where}.${k} is not a seat id`;
        if (e['id'] !== undefined && typeof e['id'] !== 'string') return `${where}.id is not text`;
        if (e['fields'] !== undefined) {
          if (!isObj(e['fields'])) return `${where}.fields is not an object`;
          for (const [k, v] of Object.entries(e['fields'])) if (!(typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) return `${where}.fields.${k.slice(0, 40)} is not a number or text`;
        }
      }
    }
  }
  return null;
}

/**
 * Seat ids for a scripted run's `spawner.release`. The recording room applies nothing and gains no body: the host still
 * tracks the ids, so a scripted `player.death` of one is `npc.death` and the last of them is `spawner.empty`. Play's
 * own seats are `forgePlayNpcSeats` (bodies on the map).
 */
function rulesTestNpcSeats(): RuleNpcSeats {
  let next = RULES_TEST_NPC_SEAT;
  return {
    release: (_spawner, count) => {
      const ids: number[] = [];
      const n = Math.max(0, count);
      for (let i = 0; i < n; i++) ids.push(next++);
      return ids;
    },
  };
}

/** The recording room a scripted run's host sees: the script's seats; every room action recorded, never applied. */
class RulesTestRoom implements RuleRoom {
  tick = 1;
  readonly applied: RulesTestAction[] = [];
  readonly told: { tick: number; to: number | null; ev: RulesWire }[] = [];
  readonly seats = new Map<number, { team: 'seal' | 'terrorist'; alive: boolean; out: boolean; feet: RuleV3 }>();
  players(): readonly RulePlayer[] { return [...this.seats].map(([id, s]) => ({ id, team: s.team, alive: s.alive, out: s.out, feet: [...s.feet] as RuleV3 })); }
  inRound(): boolean { return true; }
  private act(what: string, rest: Record<string, unknown>): void { this.applied.push({ tick: this.tick, do: what, ...rest }); }
  damage(id: number, amount: number, cause: string): void { this.act('damage', { player: id, amount, cause }); }
  eliminate(id: number): void { const s = this.seats.get(id); if (s) { s.out = true; s.alive = false; } this.act('eliminate', { player: id }); }
  award(to: { player: number } | { team: 'seal' | 'terrorist' }, points: number): void { this.act('award', { to, points }); }
  endRound(winner: 'seal' | 'terrorist' | null): void { this.act('round.end', { winner }); }
  endMatch(winner: 'seal' | 'terrorist' | null): void { this.act('match.end', { winner }); }
  door(id: string, open: boolean): boolean { this.act(open ? 'door.open' : 'door.close', { door: id }); return true; }
  respawn(id: number, at: RuleV3, yaw: number, spawner: string): void { this.act('respawn', { player: id, at, yaw, spawner }); }
  tell(ev: RulesWire, to?: number): void { this.told.push({ tick: this.tick, to: to ?? null, ev }); }
  drop(id: number, why: string): void { this.act('drop', { player: id, why }); }
}

/**
 * A layout's rules mode run against `script` (see `RULES_TEST_ADAPTATION`). Throws when the layout plays no rules mode
 * (`null` from `forgePlayRules`: the caller's NO_RULES) or the host refuses the pack (`forgeRuleHost`'s words).
 */
export function runRulesTest(l: ForgeLayout, names: { doors: readonly string[]; switches: readonly string[] }, script: RulesTestScript,
  installed: readonly InstalledRulesPack[] = []): RulesTestResult | null {
  const seed = (script.seed ?? 1) >>> 0;
  const rules = forgePlayRules(l, seed, installed);
  if (!rules) return null;
  const host = forgeRuleHost(rules, names, { npcs: rulesTestNpcSeats() });
  const room = new RulesTestRoom();
  for (const s of script.players ?? []) room.seats.set(s.id, { team: s.team, alive: s.alive ?? true, out: false, feet: [...(s.at ?? [0, 0, 0])] as RuleV3 });
  host.attach(room);
  host.event({ name: 'match.start' as RuleEventName });
  host.event({ name: 'round.start' as RuleEventName });
  host.endStep();
  const ticks = script.ticks ?? [];
  for (const t of ticks) {
    room.tick++;
    for (const [id, at] of Object.entries(t.move ?? {})) { const s = room.seats.get(Number(id)); if (s) s.feet = [...at] as RuleV3; }
    for (const [id, alive] of Object.entries(t.alive ?? {})) { const s = room.seats.get(Number(id)); if (s) s.alive = alive; }
    for (const ev of t.events ?? []) host.event(ev);
    host.endStep();
  }
  const snap = host.snapshot();
  const shows: RulesTestResult['shows'] = [];
  const purchases: RulesTestResult['purchases'] = [];
  for (const { tick, to, ev } of room.told) {
    if (ev.type === 'rulesPresent') for (const s of ev.shows) shows.push({ tick, ...s, to });
    else { const { type: _type, ...rest } = ev; purchases.push({ tick, to, ...rest }); }
  }
  return {
    state: snap.state, mode: snap.mode, seed: snap.seed, ticks: room.tick, fired: snap.fired.map((f) => f.rule), variables: snap.variables, phase: snap.phase,
    shows, purchases, applied: room.applied,
    diagnostics: snap.diagnostics.map((d) => ({ code: d.code, ...(d.field ? { field: d.field } : {}), text: d.text })),
  };
}
