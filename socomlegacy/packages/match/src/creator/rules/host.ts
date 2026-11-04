/**
 * FCW-31: the room's rule host (`docs/specs/2026-10-27-creator-rules-contract.md` §4-§6, §10; the plan's FCW-31 row).
 * RULES_ADAPTATION (`@s2u/creator-contracts`): creator rules have no original. The host runs a rules pack's `RulesSpec`
 * in the authoritative room -- the page's loopback room offline (S4), a match server once S5 allows it -- and implements
 * FCW-30's graph semantics (`creator-contracts/src/rules.ts`, its header). With no pack enabled it only listens: the
 * room's outcomes are numbered and counted, nothing is decided (`test/creator/rulesRetailParity.test.ts`).
 *
 * The order (spec §6): the room's events of a tick are handled in sequence-id order -- at the tick's end
 * (`endStep`), or at once when the room asks a hit's scale (`hit`), after the earlier ones -- each rule's conditions
 * reading the rule state as the earlier rules left it (state changes are immediate). An action on the rule state
 * (variables, timers, the phase, items, zones, a hit's scale, a purchase's answer, presentation) is applied at once; an
 * action on the room (damage, elimination, score, doors, spawns, the round's or the match's end) is applied by the room's
 * own paths after the step's events, and the events either kind causes are the chain's next step, to
 * `RULE_CHAIN_DEPTH_ADAPTATION` (deeper ones wait for the next tick). Past `RULE_EVENTS_PER_TICK_ADAPTATION` events in one
 * tick the pack's rules are off for the round, with a diagnostic naming the rules the storm reached, and nothing of that
 * tick reaches the room. Enabled, a pack starts at the next match or round start; disabled (pack-off, a map switch, a
 * failure), nothing of it remains and the room plays the retail round.
 */
import {
  checkReport, checkRulesParams, diagnostic, layoutEntityIds, rulesCatalogue, validateRules, RULE_ACTION_SPECS, RULE_CHAIN_DEPTH_ADAPTATION, RULE_EVENTS_PER_TICK_ADAPTATION,
  RULES_CODES, type CheckReport, type Diagnostic, type LayoutMarker, type LayoutSpawner, type LayoutZone, type RuleAction, type RuleCondition,
  type RuleDecl, type RuleEventName, type RuleOperand, type RuleSide, type RuleSubject, type RulesItem, type RulesSpec, type RulesVariable,
} from '@s2u/creator-contracts';
import { TICK_HZ, type Team } from '../../../../viewer/src/net/protocol';
import { RuleEventStream, type RuleEvent, type RuleEventInput } from './events';
import type { RoomRuleHost, RulePlayer, RuleRoom, RulesShow, RulesWire, RuleV3 } from './seam';

/** The events a host keeps for `log()` when asked to (`keepLog`), a test and playtest instrument; the oldest go first past it. */
export const RULE_LOG_EVENTS_ADAPTATION = 4096;
/** The rule firings `snapshot()` keeps, newest last. */
export const RULE_FIRED_KEPT_ADAPTATION = 256;
/** The most a hit's damage is multiplied by, all the matching rules' `hit.scale` factors together: one factor's bound (FCW-30's contract). */
export const RULE_HIT_SCALE_MAX = RULE_ACTION_SPECS['hit.scale'].params['factor']!.max ?? 10;
/** How near (world units, on the ground plane and in height) a living player's feet take a rules item lying in the world. */
export const RULE_ITEM_REACH_ADAPTATION = 40;
/** A purchase request the room's checks passed and no rule accepted or refused: refused with this reason (the mode's state does not sell it now). */
export const PURCHASE_UNANSWERED_ADAPTATION = 'phase' as const;
/**
 * The layout's player spawners' teams (`LayoutSpawner.team`, the spawn markers' `A`/`B`) as the rules' sides, once: `A` is
 * side 0 (the Forge's `viewer/src/forge/matchMap.ts` `slotsOfSpawns`: `s.team === 'A' ? 0 : 1`), and side 0 is the SEALs'
 * (`room.ts` `sideOf`: `team === 'seal' ? 0 : 1`) -- so `A` is `seal` and `B` is `terrorist`.
 */
export const RULE_SPAWNER_TEAMS: Readonly<Record<'A' | 'B', RuleSide>> = Object.freeze({ A: 'seal', B: 'terrorist' });

export interface RuleLayout {
  readonly zones?: readonly LayoutZone[];
  readonly markers?: readonly LayoutMarker[];
  readonly spawners?: readonly LayoutSpawner[];
}

/**
 * NPCs released from a spawner (`spawner.release` with a brain): the embedder that seats them -- the Forge's page, whose
 * NPC brains (`viewer/src/forge/npcBrain.ts`, the lobby bots' brain on the map's navigation) step them -- seats `count`
 * NPCs at `at` on `side` and returns their seat ids. Absent, a release of NPCs does nothing but say so (a diagnostic).
 */
export interface RuleNpcSeats {
  release(spawner: LayoutSpawner, count: number, brain: string, at: readonly RuleV3[], side: RuleSide): readonly number[];
}

export interface RuleHostOptions {
  /** The layout's rules entities (FCW-30's `zones`, `markers`, `spawners`), by id; a pack is checked against them. */
  layout?: RuleLayout;
  /** The map's doors and switches by name (a door's scene node, a switch's valve), for the pack's check. */
  doors?: readonly string[];
  switches?: readonly string[];
  npcs?: RuleNpcSeats;
  /** Keep the events heard (`log`), at most `RULE_LOG_EVENTS_ADAPTATION`. */
  keepLog?: boolean;
}

/** `off`: no pack (listening only); `pending`: a pack waits for the next match or round start; `on`; `tripped`: off for the round (a budget). */
export type RuleHostState = 'off' | 'pending' | 'on' | 'tripped';

/** The host's state for a test, a playtest panel or a reviewer (no wire: the page is told only presentation). */
export interface RuleHostSnapshot {
  readonly state: RuleHostState;
  readonly mode: string | null;
  readonly seed: number;
  readonly heard: Partial<Record<RuleEventName, number>>;
  readonly fired: readonly { readonly rule: string; readonly seq: number }[];
  /** Each variable's value: a match's by its id, a team's `id@side`, a player's `id@seat`. */
  readonly variables: Readonly<Record<string, number | boolean | string>>;
  readonly timers: readonly { readonly timer: string; readonly owner: string; readonly at: number }[];
  readonly phase: string | null;
  /** Each seat's rules items. */
  readonly inventories: Readonly<Record<number, readonly string[]>>;
  readonly world: readonly { readonly item: string; readonly at: RuleV3 }[];
  readonly stock: Readonly<Record<string, number>>;
  readonly zones: readonly { readonly id: string; readonly enabled: boolean; readonly radius: number | null; readonly centre: RuleV3; readonly hazard: { perSecond: number; inside: boolean } | null }[];
  readonly restricted: Readonly<Record<string, readonly string[]>>;
  /** Events and room actions waiting (the chain's next steps). */
  readonly pending: number;
  readonly diagnostics: readonly Diagnostic[];
}

type Value = number | boolean | string;
interface ZoneState {
  readonly decl: LayoutZone;
  enabled: boolean;
  centre: RuleV3;
  radius: number | null;
  reshape: { fromR: number; toR: number; from: RuleV3; to: RuleV3; start: number; end: number } | null;
  hazard: { perSecond: number; inside: boolean } | null;
  inside: Set<number>;
}
interface TimerState { timer: string; owner: string; player?: number; at: number; period: number; repeat: boolean }
interface Purchase { player: number; seq: number; item: RulesItem; answer: 'accept' | { refuse: string } | null }
interface Outcome { depth: number; apply: () => void }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sideOf = (t: Team): RuleSide => t;

/** mulberry32: the rules' own random (RULES_ADAPTATION; spec §6 "a seeded random"), a round's from the seed and its count. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RuleHost implements RoomRuleHost {
  private room: RuleRoom | null = null;
  private readonly stream = new RuleEventStream();
  private readonly heard: Partial<Record<RuleEventName, number>> = {};
  private readonly kept: RuleEvent[] = [];
  private lastSeq = 0;

  private state: RuleHostState = 'off';
  private spec: RulesSpec | null = null;
  private params: Record<string, Value> = {};
  private seed = 0;
  private byEvent = new Map<RuleEventName, RuleDecl[]>();
  private vars = new Map<string, RulesVariable>();
  private diagnostics: Diagnostic[] = [];

  // the rule state (reset at round or match start, cleared at disable)
  private values = new Map<string, Value>();
  private timers = new Map<string, TimerState>();
  private phase: string | null = null;
  private inventories = new Map<number, Set<string>>();
  private world: { item: string; at: RuleV3 }[] = [];
  private stock = new Map<string, number>();
  private zones = new Map<string, ZoneState>();
  private restricted = new Map<string, string[]>();
  private npcs = new Map<string, { seats: Set<number>; released: number }>();
  private queue: RuleEvent[] = [];
  private carry: RuleEvent[] = [];
  private outcomes: Outcome[] = [];
  private shows: RulesShow[] = [];
  private fired: { rule: string; seq: number }[] = [];
  private purchases = new Map<number, Purchase>();
  private lastRequest = new Map<number, number>();
  private random: () => number = Math.random;
  private rounds = 0;

  private countTick = -1;
  private count = 0;
  /** The depth of the room action being applied (its events are the chain's next step), else 0. */
  private applying = 0;
  /** The hit whose scale the room asked (`hit`), while its rules run. */
  private hitAt: { seq: number; factor: number } | null = null;
  /** A reset during a step's run (a disable from a room callback): the run stops. */
  private epoch = 0;
  /** The state was just reset by a match's start and nothing else was taken since. */
  private fresh = false;
  /** The `round.end` the room handed over before telling it (`roundEnd`), while the rules run; else null. */
  private endingAt: number | null = null;
  /** A `match.end` asked while `endingAt` runs: the round is the match's last. */
  private finalAsked = false;

  constructor(private readonly options: RuleHostOptions = {}) {}

  // ---- the lifecycle ----

  /**
   * Enables a rules pack's spec (`RulesSpec`, a pack's `rules`-role member) from the next match or round start, with the
   * rules' seed and its configuration's parameters (a `RecordMode`'s `params`). Checked first (`validateRules` against the
   * layout's entities and the map's doors and switches, `checkRulesParams`); refused, nothing changes. A pack already on
   * is switched off first.
   */
  enable(spec: unknown, seed: number, params: Readonly<Record<string, unknown>> = {}): CheckReport {
    const layout = this.options.layout;
    const report = validateRules(spec, rulesCatalogue({
      ...(layout ? { layout: layoutEntityIds(layout) } : {}),
      ...(this.options.doors ? { doors: this.options.doors } : {}),
      ...(this.options.switches ? { switches: this.options.switches } : {}),
    }));
    if (report.status !== 'pass') return report;
    const s = spec as RulesSpec;
    const why = checkRulesParams(s, params);
    if (why !== null) return checkReport([diagnostic({ source: 'pack', severity: 'error', code: RULES_CODES.type, text: why, field: 'params' })], { evidence: 'validation' });
    this.disable();
    this.spec = s;
    this.seed = seed >>> 0;
    this.params = {};
    for (const c of s.config ?? []) this.params[c.id] = (params[c.id] as Value | undefined) ?? c.default;
    this.byEvent = new Map();
    for (const r of s.rules) {
      const e = typeof r.when === 'string' ? r.when : r.when.event;
      const list = this.byEvent.get(e) ?? [];
      list.push(r);
      this.byEvent.set(e, list);
    }
    this.vars = new Map((s.variables ?? []).map((v) => [v.id, v]));
    this.state = 'pending';
    return report;
  }

  /** Pack-off (or a map switch, or a failure): nothing of the pack remains -- no rule state, no event or action waiting. */
  disable(): void {
    this.state = 'off';
    this.spec = null;
    this.byEvent = new Map();
    this.vars = new Map();
    this.params = {};
    this.diagnostics = [];
    this.clearState(true);
    this.epoch++;
  }

  private clearState(all: boolean): void {
    if (all) { this.values.clear(); this.inventories.clear(); this.lastRequest.clear(); this.rounds = 0; }
    this.timers.clear();
    this.world = [];
    this.stock.clear();
    this.zones.clear();
    this.restricted.clear();
    this.npcs.clear();
    this.queue = [];
    this.carry = [];
    this.outcomes = [];
    this.shows = [];
    this.fired = [];
    this.purchases.clear();
    this.hitAt = null;
  }

  /** A new match: every variable, timer and the phase from its start; a new round: those reset at the round. */
  private reset(match: boolean): void {
    const s = this.spec!;
    this.epoch++;
    this.clearState(match);
    if (!match) {
      for (const [k] of [...this.values]) {
        const id = k.split('@')[0]!;
        if ((this.vars.get(id)?.reset ?? 'round') === 'round') this.values.delete(k);
      }
      if ((s.phaseReset ?? 'round') === 'round') this.phase = s.phases?.[0] ?? null;
      this.inventories.clear();
    } else this.phase = s.phases?.[0] ?? null;
    this.rounds++;
    this.random = seeded((this.seed ^ Math.imul(this.rounds, 0x9e3779b9)) >>> 0);
    for (const it of s.items ?? []) if (it.stock !== undefined) this.stock.set(it.id, it.stock);
    for (const z of this.options.layout?.zones ?? []) {
      if (!(s.entities?.zones ?? []).includes(z.id)) continue;
      this.zones.set(z.id, { decl: z, enabled: true, centre: [...z.at], radius: z.shape === 'cylinder' ? z.radius : null, reshape: null, hazard: null, inside: new Set() });
    }
  }

  attach(room: RuleRoom): void { this.room = room; }

  // ---- what the room tells ----

  event(input: RuleEventInput): void {
    this.deliver(this.stream.emit(input, this.room?.tick ?? 0, this.applying));
  }

  /**
   * A numbered event taken (the room's, through `event`, or the host's own): counted, kept under `keepLog`, and queued for
   * the rules. An id at or under one already taken is a duplicate and is dropped (false): a rule fires once per event.
   */
  deliver(ev: RuleEvent): boolean {
    if (ev.seq <= this.lastSeq) return false;
    this.lastSeq = ev.seq;
    this.stream.advance(ev.seq);
    this.heard[ev.name] = (this.heard[ev.name] ?? 0) + 1;
    if (this.options.keepLog) {
      this.kept.push(ev);
      if (this.kept.length > RULE_LOG_EVENTS_ADAPTATION) this.kept.shift();
    }
    if (ev.name === 'match.start' && this.state !== 'off') { this.state = 'on'; this.reset(true); this.fresh = true; }
    else if (ev.name === 'round.start' && this.state !== 'off') {
      // a round start right behind its match's start finds the state fresh, the match's start still to be handled
      if (!this.fresh || this.state !== 'on') this.reset(this.state === 'pending');
      this.state = 'on';
      this.fresh = false;
    } else this.fresh = false;
    if (this.state !== 'on') return true;
    const tick = this.room?.tick ?? 0;
    if (tick !== this.countTick) { this.countTick = tick; this.count = 0; }
    if (++this.count > RULE_EVENTS_PER_TICK_ADAPTATION) { this.trip(ev); return true; }
    this.queue.push(ev);
    // NPC deaths: a released NPC's death is its spawner's `npc.death`, and the last of a release its `spawner.empty`.
    if (ev.name === 'player.death' && ev.victim !== undefined) {
      for (const [id, n] of this.npcs) {
        if (!n.seats.has(ev.victim)) continue;
        n.seats.delete(ev.victim);
        this.emit({ name: 'npc.death', ...(ev.attacker !== undefined ? { attacker: ev.attacker } : {}), id, fields: { npc: String(ev.victim) } }, ev.depth);
        if (n.seats.size === 0) this.emit({ name: 'spawner.empty', id, fields: { count: n.released } }, ev.depth);
      }
    }
    return true;
  }

  /** The pack's rules off for the round (a budget): a diagnostic naming the rules, the round's rule state from its start, nothing of this tick applied. */
  private trip(ev: RuleEvent): void {
    const rules = [...new Set([...this.queue, ev].map((e) => e.name))].flatMap((n) => (this.byEvent.get(n) ?? []).map((r) => r.id));
    this.diagnostics.push(diagnostic({
      source: 'pack', severity: 'error', code: RULES_CODES.budget,
      text: `More than ${RULE_EVENTS_PER_TICK_ADAPTATION} events in one tick (the rules ${rules.join(', ') || 'none'} answered them): the pack's rules are off for this round.`,
      field: 'rules', actual: String(this.count), expected: String(RULE_EVENTS_PER_TICK_ADAPTATION),
    }));
    this.state = 'tripped';
    this.reset(false);
    this.rounds--;                                                // the trip is no round of its own
  }

  /**
   * A hit about to be laid (`player.hit`): its rules run now, after this tick's earlier events, and the factor the room
   * multiplies the hit's damage by is returned -- 1 with no pack, or none of its rules scaling it.
   */
  hit(input: RuleEventInput): number {
    const ev = this.stream.emit(input, this.room?.tick ?? 0, this.applying);
    this.deliver(ev);
    if (this.state !== 'on' || !this.queue.includes(ev)) return 1;
    const epoch = this.epoch;
    this.hitAt = { seq: ev.seq, factor: 1 };
    this.handleThrough(ev, epoch);
    const factor = this.hitAt?.factor ?? 1;
    this.hitAt = null;
    // F4 of FCW-31's review: the factors of the rules that match multiply, the product held to one factor's bounds
    return this.state === 'on' && this.epoch === epoch ? Math.min(RULE_HIT_SCALE_MAX, Math.max(0, factor)) : 1;
  }

  /**
   * The round's end, before the room tells it (F1 of FCW-31's review): `round.end` handled now, after the tick's earlier
   * events, so a rule answering it with `match.end` makes this round the match's last -- true then, and the room tells
   * the round as final and `match.end` after it. Its other room actions wait for the step's end as any event's do.
   */
  roundEnd(input: RuleEventInput): boolean {
    const ev = this.stream.emit(input, this.room?.tick ?? 0, this.applying);
    this.deliver(ev);
    if (this.state !== 'on' || !this.queue.includes(ev)) return false;
    const epoch = this.epoch;
    this.endingAt = ev.seq;
    this.finalAsked = false;
    try { this.handleThrough(ev, epoch); } finally { this.endingAt = null; }
    const final = this.finalAsked && this.state === 'on' && this.epoch === epoch;
    this.finalAsked = false;
    return final;
  }

  /** The queued events up to `ev` (its id and earlier), handled now in id order; the later ones stay for the step's end. */
  private handleThrough(ev: RuleEvent, epoch: number): void {
    const now = this.queue.filter((e) => e.seq <= ev.seq);
    this.queue = this.queue.filter((e) => e.seq > ev.seq);
    for (const e of now) { if (this.epoch !== epoch || this.state !== 'on') break; this.handle(e); }
  }

  /**
   * A client's `rulePurchase` (`{seq, item, price}`): the room's checks -- the request's shape, its sequence (a repeat or
   * an older one dropped, `stale`), the item (an unknown one dropped), the round in play and the requester alive
   * (`phase`), the price the client saw against the item's (`price`), its stock (`stock`), the requester's funds
   * (`funds`) -- then `purchase.request` for the rules, answered once (`settle`).
   */
  request(player: number, raw: Readonly<Record<string, unknown>>): void {
    const room = this.room;
    if (!room || this.state !== 'on') return;                       // no pack on: as a room without one, nothing
    const seq = raw['seq'], itemId = raw['item'], price = raw['price'];
    if (!Number.isSafeInteger(seq) || (seq as number) < 1 || typeof itemId !== 'string' || !Number.isSafeInteger(price)) { room.drop(player, 'shape'); return; }
    if ((seq as number) <= (this.lastRequest.get(player) ?? 0)) { room.drop(player, 'stale'); return; }
    this.lastRequest.set(player, seq as number);
    const item = (this.spec?.items ?? []).find((i) => i.id === itemId && i.price !== undefined && i.stock !== undefined && i.currency !== undefined);
    const who = room.players().find((p) => p.id === player);
    if (!item || !who) { room.drop(player, 'unknown item'); return; }
    const refused = !room.inRound() || !who.alive || who.out ? 'phase' : price !== item.price ? 'price' : (this.stock.get(item.id) ?? 0) <= 0 ? 'stock'
      : Number(this.read(item.currency!, String(player))) < item.price! ? 'funds' : null;
    if (refused) { this.answer(player, seq as number, item, refused, 0); return; }
    const ev = this.stream.emit({ name: 'purchase.request', player, id: item.id, fields: { price: item.price! } }, room.tick, this.applying);
    this.purchases.set(ev.seq, { player, seq: seq as number, item, answer: null });
    this.deliver(ev);
  }

  /** A request answered once: told to the requester, and `purchase.accepted` (the price taken, the item given, a stock spent) or `purchase.refused`. */
  private answer(player: number, seq: number, item: RulesItem, refused: string | null, depth: number): void {
    if (refused === null) {
      this.write(item.currency!, String(player), Number(this.read(item.currency!, String(player))) - item.price!);
      this.stock.set(item.id, (this.stock.get(item.id) ?? 0) - 1);
      this.give(player, item.id);
    }
    this.room?.tell({ type: 'rulesPurchase', seq, item: item.id, result: refused === null ? 'accepted' : 'refused', ...(refused !== null ? { reason: refused } : {}) }, player);
    this.emit(refused === null
      ? { name: 'purchase.accepted', player, id: item.id, fields: { price: item.price! } }
      : { name: 'purchase.refused', player, id: item.id, fields: { reason: refused } }, depth);
  }

  /** The end of the room's step: the timers, the zones and the items lying in the world, then the tick's events and their chain. */
  endStep(): void {
    if (this.state !== 'on' || !this.room) return;
    const epoch = this.epoch;
    this.queue.push(...this.carry);
    this.carry = [];
    this.queue.sort((a, b) => a.seq - b.seq);
    this.engineTick();
    while (this.state === 'on' && this.epoch === epoch && (this.queue.length || this.outcomes.length)) {
      const step = this.queue;
      this.queue = [];
      for (const ev of step) {
        if (this.state !== 'on' || this.epoch !== epoch) break;
        if (ev.depth > RULE_CHAIN_DEPTH_ADAPTATION) { this.carry.push(ev); continue; }
        this.handle(ev);
      }
      const outs = this.outcomes;
      this.outcomes = [];
      for (const o of outs) {
        if (this.state !== 'on' || this.epoch !== epoch) break;
        this.applying = o.depth + 1;
        try { o.apply(); } finally { this.applying = 0; }
      }
    }
    if (this.state === 'on' && this.epoch === epoch) this.present();
  }

  // ---- the host's own events: timers, zones, items ----

  private emit(input: RuleEventInput, depth: number): void {
    this.deliver(this.stream.emit(input, this.room?.tick ?? 0, depth));
  }

  private engineTick(): void {
    const room = this.room!, tick = room.tick;
    for (const [key, t] of [...this.timers]) {
      if (tick < t.at) continue;
      if (t.repeat && t.period > 0) t.at += t.period; else this.timers.delete(key);
      this.emit({ name: 'timer.fire', id: t.timer, ...(t.player !== undefined ? { player: t.player } : {}) }, 0);
    }
    const players = room.players();
    for (const z of this.zones.values()) {
      if (z.reshape) {
        const k = z.reshape.end <= z.reshape.start ? 1 : Math.min(1, (tick - z.reshape.start) / (z.reshape.end - z.reshape.start));
        z.radius = z.reshape.fromR + (z.reshape.toR - z.reshape.fromR) * k;
        z.centre = [0, 1, 2].map((i) => z.reshape!.from[i]! + (z.reshape!.to[i]! - z.reshape!.from[i]!) * k) as RuleV3;
        if (k >= 1) z.reshape = null;
      }
      this.crossings(z, players, 0);
      if (z.hazard && z.enabled && z.hazard.perSecond > 0) {
        const amount = z.hazard.perSecond / TICK_HZ;
        for (const p of players) {
          if (!p.alive || p.out || this.inside(z, p.feet) !== z.hazard.inside) continue;
          this.outcome(0, () => room.damage(p.id, amount, 'hazard'));
        }
      }
    }
    for (const p of players) {
      if (!p.alive || p.out) continue;
      for (let i = 0; i < this.world.length; i++) {
        const w = this.world[i]!;
        if (Math.hypot(w.at[0] - p.feet[0], w.at[2] - p.feet[2]) > RULE_ITEM_REACH_ADAPTATION || Math.abs(w.at[1] - p.feet[1]) > RULE_ITEM_REACH_ADAPTATION) continue;
        this.world.splice(i--, 1);
        this.give(p.id, w.item);
        this.emit({ name: 'item.pickup', player: p.id, id: w.item }, 0);
      }
    }
  }

  /** The zone's entries and exits now, each an event at `depth`. */
  private crossings(z: ZoneState, players: readonly RulePlayer[], depth: number): void {
    for (const p of players) {
      const now = z.enabled && p.alive && !p.out && this.inside(z, p.feet), was = z.inside.has(p.id);
      if (now === was) continue;
      if (now) z.inside.add(p.id); else z.inside.delete(p.id);
      this.emit({ name: now ? 'zone.enter' : 'zone.exit', player: p.id, id: z.decl.id }, depth);
    }
  }

  /** A cylinder upright about its centre, `height` tall; a box centred on it, turned by `yaw` (radians), `size` across (`layout.ts`). */
  private inside(z: ZoneState, f: RuleV3): boolean {
    const d = z.decl, dx = f[0] - z.centre[0], dy = f[1] - z.centre[1], dz = f[2] - z.centre[2];
    if (d.shape === 'cylinder') return Math.hypot(dx, dz) <= (z.radius ?? d.radius) && Math.abs(dy) <= d.height / 2;
    const c = Math.cos(-d.yaw), s = Math.sin(-d.yaw);
    const x = dx * c - dz * s, zz = dx * s + dz * c;
    return Math.abs(x) <= d.size[0] / 2 && Math.abs(dy) <= d.size[1] / 2 && Math.abs(zz) <= d.size[2] / 2;
  }

  // ---- the rules ----

  private handle(ev: RuleEvent): void {
    for (const r of this.byEvent.get(ev.name) ?? []) {
      if (this.state !== 'on') return;
      if (typeof r.when !== 'string') {
        const key = Object.keys(r.when).find((k) => k !== 'event');
        if (key !== undefined && (r.when as Record<string, string>)[key] !== ev.id) continue;
      }
      const ok = (r.if ?? []).every((c) => this.test(c, ev));
      const acts = ok ? r.then : r.else;
      if (!acts) continue;
      this.fired.push({ rule: r.id, seq: ev.seq });
      if (this.fired.length > RULE_FIRED_KEPT_ADAPTATION) this.fired.shift();
      for (const a of acts) this.act(a, ev);
    }
    const p = this.purchases.get(ev.seq);
    if (ev.name === 'purchase.request' && p) {
      this.purchases.delete(ev.seq);
      // accepted: the room's funds and stock checked again (an earlier rule's action may have spent them)
      const refused = p.answer === null ? PURCHASE_UNANSWERED_ADAPTATION : p.answer !== 'accept' ? p.answer.refuse
        : (this.stock.get(p.item.id) ?? 0) <= 0 ? 'stock' : Number(this.read(p.item.currency!, String(p.player))) < p.item.price! ? 'funds' : null;
      this.answer(p.player, p.seq, p.item, refused, ev.depth + 1);
    }
  }

  private subject(ev: RuleEvent, s: RuleSubject): number | undefined { return ev[s]; }
  private player(id: number | undefined): RulePlayer | undefined { return id === undefined ? undefined : this.room?.players().find((p) => p.id === id); }
  private teamOf(ref: unknown, ev: RuleEvent): RuleSide | undefined {
    if (ref === 'seal' || ref === 'terrorist') return ref;
    if (isObj(ref) && typeof ref['of'] === 'string') { const p = this.player(this.subject(ev, ref['of'] as RuleSubject)); return p ? sideOf(p.team) : undefined; }
    return undefined;
  }
  /** The owner key of a variable or timer of `scope` the action or operand `o` names: '' for the match's, a side, a seat; undefined when the event carries none. */
  private owner(scope: 'match' | 'team' | 'player', o: Record<string, unknown>, ev: RuleEvent): string | undefined {
    if (scope === 'match') return '';
    if (scope === 'team') return this.teamOf(o['team'], ev);
    const id = typeof o['who'] === 'string' ? this.subject(ev, o['who'] as RuleSubject) : undefined;
    return id === undefined ? undefined : String(id);
  }
  private key(id: string, owner: string): string { return owner === '' ? id : `${id}@${owner}`; }
  private read(id: string, owner: string): Value {
    const v = this.values.get(this.key(id, owner));
    return v !== undefined ? v : this.vars.get(id)?.start ?? 0;
  }
  private write(id: string, owner: string, v: Value): void {
    const d = this.vars.get(id);
    if (!d) return;
    let x = v;
    if (d.type === 'int' && typeof x === 'number') x = Math.max(d.min ?? -Infinity, Math.min(d.max ?? Infinity, Math.trunc(x)));
    this.values.set(this.key(id, owner), x);
  }
  private value(o: RuleOperand, ev: RuleEvent): Value | undefined {
    if (typeof o !== 'object') return o;
    if ('var' in o) {
      const d = this.vars.get(o.var);
      const owner = d ? this.owner(d.scope, o as Record<string, unknown>, ev) : undefined;
      return owner === undefined ? undefined : this.read(o.var, owner);
    }
    if ('field' in o) return ev.fields?.[o.field];
    if ('param' in o) return this.params[o.param];
    return undefined;
  }
  private num(o: unknown, ev: RuleEvent): number | undefined {
    const v = o === undefined ? undefined : this.value(o as RuleOperand, ev);
    return typeof v === 'number' ? v : undefined;
  }

  private test(c: RuleCondition, ev: RuleEvent): boolean {
    switch (c.test) {
      case 'compare': {
        const l = this.value(c.left, ev), r = this.value(c.right, ev);
        if (l === undefined || r === undefined) return false;
        switch (c.op) {
          case '=': return l === r;
          case '!=': return l !== r;
          default: {
            if (typeof l !== 'number' || typeof r !== 'number') return false;
            return c.op === '<' ? l < r : c.op === '<=' ? l <= r : c.op === '>' ? l > r : l >= r;
          }
        }
      }
      case 'team': {
        const p = this.player(this.subject(ev, c.who));
        if (!p) return false;
        if (c.is !== undefined) return p.team === c.is;
        const q = this.player(c.same !== undefined ? this.subject(ev, c.same) : undefined);
        return q !== undefined && q.team === p.team;
      }
      case 'inZone': {
        const p = this.player(this.subject(ev, c.who)), z = this.zones.get(c.zone);
        return !!p && !!z && z.enabled && this.inside(z, p.feet);
      }
      case 'hasItem': {
        const id = this.subject(ev, c.who);
        return id !== undefined && (this.inventories.get(id)?.has(c.item) ?? false);
      }
      case 'alive': {
        const z = c.zone !== undefined ? this.zones.get(c.zone) : undefined;
        if (c.zone !== undefined && !z) return false;
        const n = (this.room?.players() ?? []).filter((p) => p.alive && !p.out && (c.team === undefined || p.team === c.team) && (!z || (z.enabled && this.inside(z, p.feet)))).length;
        return compareInt(n, c.op, c.count);
      }
      case 'phase': return this.phase === c.is;
      case 'chance': return this.random() * 100 < c.percent;
      case 'any': return c.of.some((x) => this.test(x, ev));
      case 'not': return !this.test(c.of, ev);
    }
  }

  /** A room action, applied after the step's events by the room's own path; the events it causes are the next step's. */
  private outcome(depth: number, apply: () => void): void { this.outcomes.push({ depth, apply }); }

  private give(player: number, item: string): void {
    const inv = this.inventories.get(player) ?? new Set<string>();
    inv.add(item);
    this.inventories.set(player, inv);
  }

  private recipients(a: RuleAction, ev: RuleEvent): number[] | null {
    if (typeof a['who'] === 'string') { const id = this.subject(ev, a['who'] as RuleSubject); return id === undefined ? [] : [id]; }
    if (a['team'] !== undefined) { const t = this.teamOf(a['team'], ev); return (this.room?.players() ?? []).filter((p) => p.team === t).map((p) => p.id); }
    return null;
  }

  private act(a: RuleAction, ev: RuleEvent): void {
    const room = this.room!, depth = ev.depth;
    switch (a.do) {
      case 'variable.set': case 'variable.add': {
        const id = a['var'] as string, d = this.vars.get(id);
        const owner = d ? this.owner(d.scope, a, ev) : undefined;
        if (owner === undefined) return;
        if (a.do === 'variable.set') { const v = this.value(a['value'] as RuleOperand, ev); if (v !== undefined) this.write(id, owner, v); return; }
        const n = this.num(a['amount'], ev);
        if (n !== undefined) this.write(id, owner, Number(this.read(id, owner)) + n);
        return;
      }
      case 'score.award': {
        const points = this.num(a['points'], ev);
        if (points === undefined) return;
        if (typeof a['who'] === 'string') {
          const id = this.subject(ev, a['who'] as RuleSubject);
          if (id !== undefined) this.outcome(depth, () => room.award({ player: id }, points));
        } else {
          const t = this.teamOf(a['team'], ev);
          if (t) this.outcome(depth, () => room.award({ team: t }, points));
        }
        return;
      }
      case 'item.give': case 'item.take': {
        const id = this.subject(ev, a['who'] as RuleSubject);
        if (id === undefined) return;
        if (a.do === 'item.give') this.give(id, a['item'] as string); else this.inventories.get(id)?.delete(a['item'] as string);
        return;
      }
      case 'player.damage': {
        const id = this.subject(ev, a['who'] as RuleSubject), amount = this.num(a['amount'], ev);
        if (id !== undefined && amount !== undefined && amount > 0) this.outcome(depth, () => room.damage(id, amount, typeof a['cause'] === 'string' ? a['cause'] : 'rules'));
        return;
      }
      case 'player.eliminate': {
        const id = this.subject(ev, a['who'] as RuleSubject);
        if (id !== undefined) this.outcome(depth, () => room.eliminate(id));
        return;
      }
      case 'hit.scale': {
        if (!this.hitAt || this.hitAt.seq !== ev.seq) return;
        const cls = a['weaponClass'];
        if (typeof cls === 'string' && ev.fields?.['weaponClass'] !== cls) return;
        this.hitAt.factor *= a['factor'] as number;
        return;
      }
      case 'purchase.accept': case 'purchase.refuse': {
        const p = this.purchases.get(ev.seq);
        if (p && p.answer === null) p.answer = a.do === 'purchase.accept' ? 'accept' : { refuse: a['reason'] as string };
        return;
      }
      case 'loadout.restrict': {
        const to = this.recipients(a, ev);
        this.restricted.set(to === null ? '*' : to.join(','), [...(a['allow'] as string[])]);
        return;
      }
      case 'zone.enable': case 'zone.disable': {
        const z = this.zones.get(a['zone'] as string);
        if (!z) return;
        z.enabled = a.do === 'zone.enable';
        this.crossings(z, room.players(), depth + 1);
        return;
      }
      case 'zone.hazard': {
        const z = this.zones.get(a['zone'] as string);
        if (z) z.hazard = { perSecond: a['perSecond'] as number, inside: a['inside'] as boolean };
        return;
      }
      case 'zone.reshape': {
        const z = this.zones.get(a['zone'] as string);
        if (!z || z.radius === null) return;                       // a box keeps its size (the radius is a cylinder's)
        const m = typeof a['at'] === 'string' ? this.options.layout?.markers?.find((x) => x.id === a['at']) : undefined;
        const seconds = a['seconds'] as number, tick = room.tick;
        z.reshape = { fromR: z.radius, toR: a['radius'] as number, from: [...z.centre], to: m ? [...m.at] : [...z.centre], start: tick, end: tick + Math.round(seconds * TICK_HZ) };
        return;
      }
      case 'spawner.release': this.release(a, ev); return;
      case 'door.open': case 'door.close': {
        const id = a['door'] as string, open = a.do === 'door.open';
        this.outcome(depth, () => { room.door(id, open); });
        return;
      }
      case 'phase.set': {
        const to = a['phase'] as string;
        if (this.phase === to) return;
        this.phase = to;
        this.emit({ name: 'phase.change', id: to }, depth + 1);
        return;
      }
      case 'timer.start': case 'timer.stop': {
        const id = a['timer'] as string, t = this.spec?.timers?.find((x) => x.id === id);
        if (!t) return;
        const owner = this.owner(t.scope, a, ev);
        if (owner === undefined) return;
        const key = this.key(id, owner);
        if (a.do === 'timer.stop') { this.timers.delete(key); return; }
        const seconds = typeof a['seconds'] === 'number' ? a['seconds'] : t.seconds;
        const period = Math.max(1, Math.round(seconds * TICK_HZ));
        this.timers.set(key, { timer: id, owner, ...(t.scope === 'player' ? { player: Number(owner) } : {}), at: room.tick + period, period, repeat: t.repeat === true });
        return;
      }
      case 'round.end': case 'match.end': {
        const w = a['winner'];
        const winner: Team | null = w === undefined || w === 'none' ? null : this.teamOf(w, ev) ?? null;
        // a match end asked while the room's round end is handed over (`roundEnd`) makes that round final, the room's own
        // wins naming the match's winner, as for any final round
        if (a.do === 'match.end' && this.endingAt !== null) { this.finalAsked = true; return; }
        if (a.do === 'round.end') this.outcome(depth, () => room.endRound(winner)); else this.outcome(depth, () => room.endMatch(winner));
        return;
      }
      case 'message.show': case 'cue.play': {
        const to = this.recipients(a, ev);
        this.shows.push(a.do === 'message.show' ? { kind: 'message', text: a['text'] as string, to } : { kind: 'cue', cue: a['cue'] as string, to });
        return;
      }
      case 'hud.value': {
        const id = a['var'] as string, d = this.vars.get(id);
        if (!d) return;
        if (d.scope === 'match') { this.shows.push({ kind: 'hud', label: a['label'] as string, value: this.read(id, ''), to: null }); return; }
        for (const p of room.players()) {
          const owner = d.scope === 'team' ? p.team : String(p.id);
          this.shows.push({ kind: 'hud', label: a['label'] as string, value: this.read(id, owner), to: [p.id] });
        }
        return;
      }
    }
  }

  /** `spawner.release`: items lying in the world; players (re)spawned at it; NPCs seated by the embedder. Positions by the rules' random, within its radius. */
  private release(a: RuleAction, ev: RuleEvent): void {
    const room = this.room!, id = a['spawner'] as string;
    const s = this.options.layout?.spawners?.find((x) => x.id === id);
    if (!s) return;
    const count = this.num(a['count'], ev);
    const spot = (): RuleV3 => {
      const t = this.random() * 2 * Math.PI, r = Math.sqrt(this.random()) * s.radius;
      return [s.at[0] + Math.sin(t) * r, s.at[1], s.at[2] + Math.cos(t) * r];
    };
    const itemId = typeof a['item'] === 'string' ? a['item'] : null;
    if (itemId !== null || s.source === 'item') {
      if (itemId === null) return;
      for (let i = 0; i < Math.max(1, count ?? 1); i++) this.world.push({ item: itemId, at: spot() });
      return;
    }
    if (s.source === 'player') {
      const team = s.team ? RULE_SPAWNER_TEAMS[s.team] : undefined;
      const who = room.players().filter((p) => !p.out && (team === undefined || p.team === team)).slice(0, count ?? Infinity);
      for (const p of who) { const at = spot(); this.outcome(ev.depth, () => room.respawn(p.id, at, s.yaw, id)); }
      return;
    }
    const n = Math.max(1, count ?? 1), brain = typeof a['brain'] === 'string' ? a['brain'] : '';
    const npcs = this.options.npcs;
    if (!npcs) {
      this.diagnostics.push(diagnostic({ source: 'pack', severity: 'warning', code: RULES_CODES.referenceUnknown, text: `Nothing seats NPCs in this room: the release from ${id} seats none.`, field: 'spawner', actual: id }));
      return;
    }
    const at = Array.from({ length: n }, spot), side = s.side ?? 'terrorist';
    this.outcome(ev.depth, () => {
      const seats = npcs.release(s, n, brain, at, side);
      const kept = this.npcs.get(id) ?? { seats: new Set<number>(), released: 0 };
      for (const x of seats) kept.seats.add(x);
      kept.released = seats.length;
      this.npcs.set(id, kept);
    });
  }

  /** The tick's presentation, to each recipient (`RulesWire` `rulesPresent`): shown by the page, deciding nothing. */
  private present(): void {
    if (!this.shows.length || !this.room || !this.spec) return;
    const all = this.shows.filter((s) => s.to === null).map(({ to: _to, ...s }) => s);
    const each = new Map<number, Omit<RulesShow, 'to'>[]>();
    for (const s of this.shows) {
      if (s.to === null) continue;
      const { to, ...rest } = s;
      for (const id of to) each.set(id, [...(each.get(id) ?? []), rest]);
    }
    this.shows = [];
    if (all.length) this.room.tell({ type: 'rulesPresent', mode: this.spec.id, shows: all });
    for (const [id, shows] of each) this.room.tell({ type: 'rulesPresent', mode: this.spec.id, shows }, id);
  }

  // ---- reading ----

  /** The events kept (`keepLog`), oldest first. */
  log(): readonly RuleEvent[] { return [...this.kept]; }

  snapshot(): RuleHostSnapshot {
    const variables: Record<string, Value> = {};
    if (this.state === 'on' || this.state === 'tripped') {
      for (const v of this.vars.values()) if (v.scope === 'match') variables[v.id] = this.read(v.id, '');
      for (const [k, v] of this.values) variables[k] = v;
    }
    return {
      state: this.state, mode: this.spec?.id ?? null, seed: this.seed, heard: { ...this.heard }, fired: [...this.fired], variables,
      timers: [...this.timers.values()].map((t) => ({ timer: t.timer, owner: t.owner, at: t.at })),
      phase: this.state === 'off' ? null : this.phase,
      inventories: Object.fromEntries([...this.inventories].map(([k, v]) => [k, [...v].sort()])),
      world: this.world.map((w) => ({ item: w.item, at: [...w.at] as RuleV3 })),
      stock: Object.fromEntries(this.stock),
      zones: [...this.zones.values()].map((z) => ({ id: z.decl.id, enabled: z.enabled, radius: z.radius, centre: [...z.centre] as RuleV3, hazard: z.hazard })),
      restricted: Object.fromEntries(this.restricted),
      pending: this.queue.length + this.carry.length + this.outcomes.length,
      diagnostics: [...this.diagnostics],
    };
  }
}

function compareInt(n: number, op: string, k: number): boolean {
  switch (op) {
    case '=': return n === k;
    case '!=': return n !== k;
    case '<': return n < k;
    case '<=': return n <= k;
    case '>': return n > k;
    default: return n >= k;
  }
}

export type { RulesWire };
