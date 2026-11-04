/**
 * The creator rules contract (FCW-30, issue #532), a browser adaptation with no original (`RULES_ADAPTATION`; the design
 * is `docs/specs/2026-10-27-creator-rules-contract.md`, §3-§7 and §10). A rules pack's `rules`-role JSON member is a
 * `RulesSpec`: a configuration schema (level 1), scoped variables, timers, phases, items, the layout entities it names,
 * the built-in capabilities it claims, and rules `when <event> [if <conditions>] then <actions> [else <actions>]`
 * (level 2). This module is types, data and `validateRules` only: nothing here runs a rule (FCW-31's room does), and
 * nothing here changes a round -- with every rules pack off the game is unchanged.
 *
 * The vocabulary v0's names (`RULE_EVENTS`, `RULE_CONDITIONS`, `RULE_ACTIONS`) and the graph's semantics below are
 * frozen by FCW-30 (`test/rules.test.ts` pins them): a change is a deliberate contract change under
 * `RULES_VOCABULARY_VERSION`, and `ENGINE_CONTRACT_VERSION` 0.1.1 is the first engine contract that carries them (the patch: additive under caret SemVer).
 *
 * The graph's semantics (frozen for a later node editor; FCW-31 implements them):
 * - A rule fires at most once per event (each event carries a room-unique sequence id). The rules on one event are
 *   tried in their order in `rules`; the conditions of `if` all hold (an `any` holds when one of its own does, a `not`
 *   when its own does not), then `then` runs in order, else `else`.
 * - State changes are immediate: a later rule on the same event sees what an earlier rule's actions changed (its
 *   variables, timers and the phase), so the order in `rules` is the creator's tool -- a counting rule before the rule
 *   that reads the count (paintball's `hit` before `out`), and a stepping chain written final-first, or one event
 *   walks every step (battle royale's ring steps).
 * - An action naming a player the event does not carry at run time (an NPC's killer that was no player) does nothing.
 * - The events an action causes (`RULE_ACTION_SPECS[a].emits`) are handled in the next step of the same tick, to the
 *   chain bound (`RULE_CHAIN_DEPTH_ADAPTATION`), checked here statically over every path and with the conditions
 *   ignored: a cycle is past any bound. A timer fires on a later tick, so `timer.start` causes nothing in the chain.
 * - A rule's `player.damage` is not a hit: it causes `player.death` and `player.eliminated`, never `player.hit`.
 * - A purchase request no rule accepts is refused by the room (FCW-31), after its own funds, price and stock checks.
 * - Every variable, timer and the phase return to their start at round start, or at match start when `reset` says so;
 *   the first phase listed is the start phase.
 * - Outcomes are the room's (spec §5): a rule with `side: "client"` may use only `PRESENTATION_ACTIONS`.
 */
import { checkReport, diagnostic, type CheckReport, type Diagnostic } from "./diagnostics.js";
import { BEHAVIOUR_CAPABILITIES, BEHAVIOUR_SLOTS, behaviourCatalogue, checkHandlerClaim, type HandlerSlot } from "./handlers.js";
import { PACK_CODES, PACK_HANDLERS_ADAPTATION, type PackHandlerCapability, type PackHandlerClaim } from "./packs.js";

export const RULES_ADAPTATION =
  "creator rules as data with no original: engine-run, server-owned outcomes, no pack code; with every rules pack off the game is unchanged" as const;

/** A rules member's schema name. */
export const RULES_SCHEMA = "s2u-rules" as const;
/** The vocabulary's own version (spec §4's "version 0"); a spec names the one it was written for, and a later one is refused. */
export const RULES_VOCABULARY_VERSION = 0;

// ---------------------------------------------------------------------------------------------------------------------
// The budgets (spec §6): browser adaptations with no original, chosen by FCW-30. The room disables a pack's rules for
// the round when one is exceeded at run time (FCW-31); the static ones are refused here, at validation.
// ---------------------------------------------------------------------------------------------------------------------

/** Rules in one spec (a pack's rules member). */
export const RULES_PER_PACK_ADAPTATION = 128;
/** Actions on one event, `then` and `else` together, across every rule on it. */
export const RULE_ACTIONS_PER_EVENT_ADAPTATION = 32;
/** Events the room handles in one tick (a run-time bound, FCW-31's; nothing static checks it). */
export const RULE_EVENTS_PER_TICK_ADAPTATION = 256;
/** Rules in one chain: an action's event triggering a rule whose action triggers another, and so on. */
export const RULE_CHAIN_DEPTH_ADAPTATION = 8;
/** Variables in one scope (`match`, `team`, `player`). */
export const RULE_VARIABLES_PER_SCOPE_ADAPTATION = 32;
/** Timers in one scope. */
export const RULE_TIMERS_PER_SCOPE_ADAPTATION = 8;
/** Conditions in one rule's `if` and in one `any`, and how deep `any`/`not` nest (the `if` list is depth 1). */
export const RULE_CONDITIONS_ADAPTATION = 16;
export const RULE_CONDITION_DEPTH_ADAPTATION = 4;
/** Configuration parameters, phases, items, and the ids of each entity kind a spec names. */
export const RULES_PARAMS_ADAPTATION = 32;
export const RULES_PHASES_ADAPTATION = 16;
export const RULES_ITEMS_ADAPTATION = 64;
export const RULES_ENTITY_REFS_ADAPTATION = 64;
/** A whole number's magnitude anywhere in a spec (a value, a bound, a price, a count). */
export const RULES_INT_ADAPTATION = 1_000_000;
/** A message's or a label's characters (one HUD line). */
export const RULES_TEXT_CHARS_ADAPTATION = 120;

// ---------------------------------------------------------------------------------------------------------------------
// The vocabulary v0 (spec §4)
// ---------------------------------------------------------------------------------------------------------------------

export const RULE_EVENTS = Object.freeze([
  "match.start", "match.end", "round.start", "round.end", "player.spawn", "player.hit", "player.death", "player.kill",
  "player.eliminated", "npc.death", "zone.enter", "zone.exit", "interact", "item.pickup", "purchase.request",
  "purchase.accepted", "purchase.refused", "objective.change", "timer.fire", "phase.change", "spawner.empty",
] as const);
export type RuleEventName = (typeof RULE_EVENTS)[number];

export const RULE_CONDITIONS = Object.freeze(["compare", "team", "inZone", "hasItem", "alive", "phase", "chance", "any", "not"] as const);
export type RuleConditionName = (typeof RULE_CONDITIONS)[number];

export const RULE_ACTIONS = Object.freeze([
  "variable.set", "variable.add", "score.award", "item.give", "item.take", "player.damage", "player.eliminate", "hit.scale",
  "purchase.accept", "purchase.refuse", "loadout.restrict", "zone.enable", "zone.disable", "zone.hazard", "zone.reshape",
  "spawner.release", "door.open", "door.close", "phase.set", "timer.start", "timer.stop", "round.end", "match.end",
  "message.show", "cue.play", "hud.value",
] as const);
export type RuleActionName = (typeof RULE_ACTIONS)[number];

/** The client's only actions (spec §5): presentation, driven by the room's broadcast state, deciding nothing. */
export const PRESENTATION_ACTIONS = Object.freeze(["message.show", "cue.play", "hud.value"] as const);

export const RULE_SCOPES = Object.freeze(["match", "team", "player"] as const);
export type RuleScope = (typeof RULE_SCOPES)[number];
export const RULE_VALUE_TYPES = Object.freeze(["int", "bool", "enum"] as const);
export type RuleValueType = (typeof RULE_VALUE_TYPES)[number];
/** The players an event carries, by their part in it. */
export const RULE_SUBJECTS = Object.freeze(["player", "attacker", "victim"] as const);
export type RuleSubject = (typeof RULE_SUBJECTS)[number];
/** The two sides (the layout's NPC sides, `NpcMarker.side`). */
export const RULE_SIDES = Object.freeze(["seal", "terrorist"] as const);
export type RuleSide = (typeof RULE_SIDES)[number];
export const RULE_COMPARE_OPS = Object.freeze(["=", "!=", "<", "<=", ">", ">="] as const);
export type RuleCompareOp = (typeof RULE_COMPARE_OPS)[number];
/** Why the room refused a purchase (spec §4). */
export const PURCHASE_REFUSALS = Object.freeze(["funds", "price", "stock", "phase"] as const);
export const RULE_RESETS = Object.freeze(["round", "match"] as const);
export const ITEM_GRANTS = Object.freeze(["token", "weapon", "equipment"] as const);

/** A value's type as the validator reasons about it. `text` is an event's open field (a weapon id), compared by = and != only. */
type VType = { readonly t: "int" } | { readonly t: "bool" } | { readonly t: "enum"; readonly values: readonly string[] } | { readonly t: "text" };

/** Which kind of declared name an event's filter key names. */
type FilterKind = "zone" | "target" | "item" | "timer" | "phase" | "spawner";

export interface RuleEventSpec {
  /** The players it carries. */
  readonly roles: readonly RuleSubject[];
  /** Its fields a `{field}` operand reads, by type. */
  readonly fields: Readonly<Record<string, "int" | "text" | readonly string[]>>;
  /** The key a rule's `when` may filter it by, and the declared kind that key names. */
  readonly filter?: FilterKind;
}

const ev = (roles: readonly RuleSubject[], fields: RuleEventSpec["fields"] = {}, filter?: FilterKind): RuleEventSpec =>
  Object.freeze({ roles: Object.freeze([...roles]), fields: Object.freeze({ ...fields }), ...(filter ? { filter } : {}) });
const WINNER = Object.freeze(["seal", "terrorist", "none"]);

/** Each event's payload (spec §4). Frozen with the names. */
export const RULE_EVENT_SPECS: Readonly<Record<RuleEventName, RuleEventSpec>> = Object.freeze({
  "match.start": ev([]),
  "match.end": ev([], { winner: WINNER }),
  "round.start": ev([]),
  "round.end": ev([], { winner: WINNER }),
  "player.spawn": ev(["player"], {}, "spawner"),
  "player.hit": ev(["attacker", "victim"], { weapon: "text", weaponClass: "text", amount: "int" }),
  "player.death": ev(["victim", "attacker"], { weapon: "text" }),
  "player.kill": ev(["attacker", "victim"], { weapon: "text" }),
  "player.eliminated": ev(["player"]),
  "npc.death": ev(["attacker"], { npc: "text" }, "spawner"),
  "zone.enter": ev(["player"], {}, "zone"),
  "zone.exit": ev(["player"], {}, "zone"),
  "interact": ev(["player"], {}, "target"),
  "item.pickup": ev(["player"], {}, "item"),
  "purchase.request": ev(["player"], { price: "int" }, "item"),
  "purchase.accepted": ev(["player"], { price: "int" }, "item"),
  "purchase.refused": ev(["player"], { reason: PURCHASE_REFUSALS }, "item"),
  "objective.change": ev([], { objective: "text", state: "text" }),
  "timer.fire": ev([], {}, "timer"),
  "phase.change": ev([], {}, "phase"),
  "spawner.empty": ev([], { count: "int" }, "spawner"),
});

/** How an action's parameter is read. */
export type RuleParamKind =
  | "var" | "timer" | "phase" | "zone" | "marker" | "spawner" | "item" | "door" | "brain"
  | "who" | "team" | "winner" | "reason"
  | "operand" | "intOperand" | "int" | "number" | "bool" | "text" | "name" | "names";
export interface RuleParamSpec {
  readonly kind: RuleParamKind;
  readonly required?: true;
  readonly min?: number;
  readonly max?: number;
}
export interface RuleActionSpec {
  readonly params: Readonly<Record<string, RuleParamSpec>>;
  /** `server`: an outcome, the room's only. `presentation`: the client may run it too. */
  readonly side: "server" | "presentation";
  /** The events it causes in the chain (the graph's semantics, above). */
  readonly emits: readonly RuleEventName[];
  /** The events it may answer; absent, any. */
  readonly on?: readonly RuleEventName[];
}

const R = { required: true } as const;
const p = (kind: RuleParamKind, more: Omit<RuleParamSpec, "kind"> = {}): RuleParamSpec => Object.freeze({ kind, ...more });
const act = (params: Record<string, RuleParamSpec>, more: Partial<Omit<RuleActionSpec, "params">> = {}): RuleActionSpec => Object.freeze({
  params: Object.freeze(params), side: more.side ?? "server", emits: Object.freeze([...(more.emits ?? [])]), ...(more.on ? { on: Object.freeze([...more.on]) } : {}),
});
const scopedTo = { who: p("who"), team: p("team") };
const COORD = 100_000;

/** Each action's parameters, ownership, the events it causes and the events it answers (spec §4, §5). Frozen. */
export const RULE_ACTION_SPECS: Readonly<Record<RuleActionName, RuleActionSpec>> = Object.freeze({
  "variable.set": act({ var: p("var", R), ...scopedTo, value: p("operand", R) }),
  "variable.add": act({ var: p("var", R), ...scopedTo, amount: p("intOperand", R) }),
  "score.award": act({ ...scopedTo, points: p("intOperand", R) }),
  "item.give": act({ who: p("who", R), item: p("item", R) }),
  "item.take": act({ who: p("who", R), item: p("item", R) }),
  "player.damage": act({ who: p("who", R), amount: p("intOperand", R), cause: p("name") }, { emits: ["player.death", "player.eliminated"] }),
  "player.eliminate": act({ who: p("who", R) }, { emits: ["player.eliminated"] }),
  "hit.scale": act({ factor: p("number", { required: true, min: 0, max: 10 }), weaponClass: p("name") }, { on: ["player.hit"] }),
  "purchase.accept": act({}, { emits: ["purchase.accepted"], on: ["purchase.request"] }),
  "purchase.refuse": act({ reason: p("reason", R) }, { emits: ["purchase.refused"], on: ["purchase.request"] }),
  "loadout.restrict": act({ ...scopedTo, allow: p("names", R) }),
  "zone.enable": act({ zone: p("zone", R) }, { emits: ["zone.enter", "zone.exit"] }),
  "zone.disable": act({ zone: p("zone", R) }, { emits: ["zone.enter", "zone.exit"] }),
  "zone.hazard": act({ zone: p("zone", R), perSecond: p("int", { required: true, min: 0, max: 1000 }), inside: p("bool", R) }),
  "zone.reshape": act({ zone: p("zone", R), radius: p("number", { required: true, min: 0, max: COORD }), at: p("marker"), seconds: p("number", { required: true, min: 0, max: 3600 }) }, { emits: ["zone.enter", "zone.exit"] }),
  "spawner.release": act({ spawner: p("spawner", R), count: p("intOperand"), item: p("item"), brain: p("brain") }, { emits: ["player.spawn"] }),
  "door.open": act({ door: p("door", R) }),
  "door.close": act({ door: p("door", R) }),
  "phase.set": act({ phase: p("phase", R) }, { emits: ["phase.change"] }),
  "timer.start": act({ timer: p("timer", R), ...scopedTo, seconds: p("number", { min: 0, max: 3600 }) }),
  "timer.stop": act({ timer: p("timer", R), ...scopedTo }),
  "round.end": act({ winner: p("winner", R) }, { emits: ["round.end"] }),
  "match.end": act({ winner: p("winner") }, { emits: ["match.end"] }),
  "message.show": act({ text: p("text", R), ...scopedTo }, { side: "presentation" }),
  "cue.play": act({ cue: p("name", R), ...scopedTo }, { side: "presentation" }),
  "hud.value": act({ var: p("var", R), label: p("text", R) }, { side: "presentation" }),
});

// ---------------------------------------------------------------------------------------------------------------------
// The spec's types (the JSON a rules member holds)
// ---------------------------------------------------------------------------------------------------------------------

export type RuleTeamRef = RuleSide | { readonly of: RuleSubject };
export type RuleOperand =
  | number | boolean | string
  | { readonly var: string; readonly who?: RuleSubject; readonly team?: RuleTeamRef }
  | { readonly field: string }
  | { readonly param: string };
export type RuleCondition =
  | { readonly test: "compare"; readonly left: RuleOperand; readonly op: RuleCompareOp; readonly right: RuleOperand }
  | { readonly test: "team"; readonly who: RuleSubject; readonly is?: RuleSide; readonly same?: RuleSubject }
  | { readonly test: "inZone"; readonly who: RuleSubject; readonly zone: string }
  | { readonly test: "hasItem"; readonly who: RuleSubject; readonly item: string }
  | { readonly test: "alive"; readonly team?: RuleSide; readonly zone?: string; readonly op: RuleCompareOp; readonly count: number }
  | { readonly test: "phase"; readonly is: string }
  | { readonly test: "chance"; readonly percent: number }
  | { readonly test: "any"; readonly of: readonly RuleCondition[] }
  | { readonly test: "not"; readonly of: RuleCondition };
/** An action: its name and its parameters (`RULE_ACTION_SPECS`). */
export interface RuleAction {
  readonly do: RuleActionName;
  readonly [param: string]: unknown;
}
export type RuleWhen = RuleEventName | { readonly event: RuleEventName; readonly [filter: string]: string };
export interface RuleDecl {
  readonly id: string;
  readonly side?: "server" | "client";
  readonly when: RuleWhen;
  readonly if?: readonly RuleCondition[];
  readonly then: readonly RuleAction[];
  readonly else?: readonly RuleAction[];
}
interface TypedDecl {
  readonly id: string;
  readonly type: RuleValueType;
  readonly min?: number;
  readonly max?: number;
  readonly values?: readonly string[];
}
/** Level 1: a published parameter, its default and its bounds (a `RecordMode`'s `params` are checked against these). */
export interface RulesConfigParam extends TypedDecl {
  readonly default: number | boolean | string;
  readonly label?: string;
}
export interface RulesVariable extends TypedDecl {
  readonly scope: RuleScope;
  readonly start: number | boolean | string;
  readonly reset?: "round" | "match";
}
export interface RulesTimer {
  readonly id: string;
  readonly scope: RuleScope;
  readonly seconds: number;
  readonly repeat?: boolean;
  readonly reset?: "round" | "match";
}
/** An item: what it grants, and -- all three or none -- its price, its stock and the player's variable it is paid from. */
export interface RulesItem {
  readonly id: string;
  readonly grants: { readonly kind: "token" } | { readonly kind: "weapon" | "equipment"; readonly ref: string };
  readonly price?: number;
  readonly stock?: number;
  readonly currency?: string;
}
/** The layout's (zones, markers, spawners) and the disc's (doors, switches) entities the rules name, by authored id. */
export interface RulesEntities {
  readonly zones?: readonly string[];
  readonly markers?: readonly string[];
  readonly spawners?: readonly string[];
  readonly doors?: readonly string[];
  readonly switches?: readonly string[];
}
export interface RulesSpec {
  readonly schema: typeof RULES_SCHEMA;
  readonly vocabulary: number;
  /** The mode's id (a `RecordMode`'s `id`); its version is the pack's. */
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly config?: readonly RulesConfigParam[];
  readonly variables?: readonly RulesVariable[];
  readonly timers?: readonly RulesTimer[];
  /** The phases in order; the first is the start phase. */
  readonly phases?: readonly string[];
  readonly phaseReset?: "round" | "match";
  readonly items?: readonly RulesItem[];
  readonly entities?: RulesEntities;
  /** The built-in capabilities claimed by name (the `behaviour` slot family); the manifest's `handlers` carry the same claims. */
  readonly capabilities?: readonly PackHandlerClaim[];
  readonly rules: readonly RuleDecl[];
}

/** The layout's own entity ids (`layout.ts` `layoutEntityIds`), when the spec is checked against one layout. */
export interface RulesLayoutEntities {
  readonly zones: readonly string[];
  readonly markers: readonly string[];
  readonly spawners: readonly string[];
}
/** What the build offers a spec: the vocabulary version, the behaviour slots and capabilities, and (optionally) one layout's entities. */
export interface RulesCatalogue {
  readonly vocabulary: number;
  readonly slots: readonly HandlerSlot[];
  readonly capabilities: readonly PackHandlerCapability[];
  readonly layout?: RulesLayoutEntities;
  readonly doors?: readonly string[];
  readonly switches?: readonly string[];
}

/**
 * The catalogue `validateRules` checks against: this vocabulary, and the slots and capabilities given -- by default the
 * behaviour slot family (`BEHAVIOUR_SLOTS`, `behaviourCatalogue`: the available capabilities, never a reserved one).
 */
export function rulesCatalogue(options: Partial<Omit<RulesCatalogue, "vocabulary">> = {}): RulesCatalogue {
  return {
    vocabulary: RULES_VOCABULARY_VERSION,
    slots: options.slots ?? BEHAVIOUR_SLOTS,
    capabilities: options.capabilities ?? behaviourCatalogue(),
    ...(options.layout ? { layout: options.layout } : {}),
    ...(options.doors ? { doors: options.doors } : {}),
    ...(options.switches ? { switches: options.switches } : {}),
  };
}

/** The validator's refusals (namespace `rules.`, beside the pack framework's `pack.EXTERNAL_URI` and `pack.HANDLER_UNKNOWN`). */
export const RULES_CODES = Object.freeze({
  /** Not a rules spec: not an object, or another schema. */
  schema: "rules.SCHEMA",
  /** A vocabulary version this build does not have. */
  vocabulary: "rules.VOCABULARY_VERSION",
  fieldUnknown: "rules.FIELD_UNKNOWN",
  fieldMissing: "rules.FIELD_MISSING",
  /** A field of the wrong JSON type or grammar, or a value outside its listed set. */
  fieldType: "rules.FIELD_TYPE",
  eventUnknown: "rules.EVENT_UNKNOWN",
  conditionUnknown: "rules.CONDITION_UNKNOWN",
  actionUnknown: "rules.ACTION_UNKNOWN",
  /** An outcome action in a client rule (spec §5). */
  actionSide: "rules.ACTION_SIDE",
  /** An action outside the event it answers (`hit.scale` off a hit, a purchase answer off a request). */
  actionEvent: "rules.ACTION_EVENT",
  budget: "rules.BUDGET",
  /** A chain deeper than `RULE_CHAIN_DEPTH_ADAPTATION`, or a cycle. */
  chainDepth: "rules.CHAIN_DEPTH",
  /** A variable or timer named without the player or team its scope needs, or with one it has not. */
  scope: "rules.SCOPE",
  /** A player the event does not carry. */
  subject: "rules.SUBJECT",
  /** A value or comparison that is not of the declared type or within its bounds. */
  type: "rules.TYPE",
  referenceUnknown: "rules.REFERENCE_UNKNOWN",
  duplicateId: "rules.DUPLICATE_ID",
  /** A purchase rule over an item with no price, stock and currency. */
  itemNotForSale: "rules.ITEM_NOT_FOR_SALE",
  /** A layout entity the given layout does not hold. */
  entityMissing: "rules.ENTITY_MISSING",
  /** Code in a spec: a script member or a code field (H272: no pack code runs). */
  code: "rules.CODE",
  /** A built-in capability that is named but not yet claimable (`BEHAVIOUR_CAPABILITIES` status `reserved`). */
  capabilityReserved: "rules.CAPABILITY_RESERVED",
} as const);
export type RulesCode = (typeof RULES_CODES)[keyof typeof RULES_CODES];

// ---------------------------------------------------------------------------------------------------------------------
// The validator
// ---------------------------------------------------------------------------------------------------------------------

/** The layout's authored-id grammar (`layout.ts` `AUTHORED_ID`), for every name a spec declares. */
const NAME = /^[A-Za-z0-9_.-]{1,64}$/;
/** The mode id's grammar (`layout.ts`'s `RecordMode.id`): lower case, dots and hyphens, no `..`. */
const MODE_ID = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const PRINTABLE = /^[^\u0000-\u001f\u007f]+$/;
/** The pack framework's external-URI refusal (`packs.ts` `URI_ANYWHERE`, `URI_START`), the same two patterns. */
const URI_ANYWHERE = /[a-z][a-z0-9+.-]*:\/\//i;
const URI_START = /^\s*(?:data|javascript|vbscript|blob|file|about|mailto):/i;
/** A string naming a script or a program (a script member), and the keys code would sit under. */
const SCRIPT_FILE = /\.(?:m?js|cjs|jsx|ts|tsx|wasm|lua|py|sh|bat|exe|dll)$/i;
const CODE_KEYS = new Set(["script", "scripts", "code", "source", "js", "javascript", "wasm", "eval", "function", "module", "program"]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isSafeInteger(v) && Math.abs(v as number) <= RULES_INT_ADAPTATION;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const has = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
const show = (v: unknown): string => (typeof v === "string" ? v.slice(0, 80) : (JSON.stringify(v) ?? String(v)).slice(0, 80));
const typeText = (t: VType): string => (t.t === "enum" ? `enum(${t.values.join("|")})` : t.t);

class Findings {
  readonly list: Diagnostic[] = [];
  err(code: string, text: string, field?: string, actual?: string, expected?: string): void {
    this.list.push(diagnostic({ source: "pack", severity: "error", code, text, field, actual, expected }));
  }
}

/** What a spec declares, as the rules read it. */
interface Decls {
  params: Map<string, VType>;
  vars: Map<string, { scope: RuleScope; type: VType }>;
  timers: Map<string, RuleScope>;
  phases: Set<string>;
  items: Map<string, { forSale: boolean }>;
  zones: Set<string>;
  markers: Set<string>;
  spawners: Set<string>;
  doors: Set<string>;
  switches: Set<string>;
  brains: Set<string>;
}

/** The event a rule answers, as its conditions and actions see it. */
interface Ctx {
  event: RuleEventName | null;
  roles: ReadonlySet<RuleSubject>;
  fields: Readonly<Record<string, VType>>;
  client: boolean;
}

/** Every string and key in the spec: an external URI, a script member, a code field. */
function scanCode(v: unknown, at: string, f: Findings): void {
  if (typeof v === "string") {
    if (URI_ANYWHERE.test(v) || URI_START.test(v)) f.err(PACK_CODES.externalUri, "A rules spec names no external URI: every byte comes from the pack or the user's own disc.", at, v.slice(0, 80));
    else if (SCRIPT_FILE.test(v)) f.err(RULES_CODES.code, "A rules spec names no script: rules are data the engine runs (H272).", at, v.slice(0, 80));
  } else if (Array.isArray(v)) v.forEach((x, i) => scanCode(x, `${at}[${i}]`, f));
  else if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      const here = at ? `${at}.${k}` : k;
      if (CODE_KEYS.has(k.toLowerCase())) f.err(RULES_CODES.code, `A rules spec has no ${k.slice(0, 40)} field: rules are data the engine runs (H272).`, here);
      scanCode(x, here, f);
    }
  }
}

class Reader {
  constructor(readonly f: Findings) {}
  /** Unknown keys (code keys are `scanCode`'s). */
  keys(o: Record<string, unknown>, at: string, allowed: readonly string[]): void {
    for (const k of Object.keys(o)) {
      if (allowed.includes(k) || CODE_KEYS.has(k.toLowerCase())) continue;
      this.f.err(RULES_CODES.fieldUnknown, `There is no field ${k.slice(0, 40)} here.`, at ? `${at}.${k}` : k, undefined, allowed.join(", "));
    }
  }
  path(at: string, k: string): string { return at ? `${at}.${k}` : k; }
  /** The value at `k`, or undefined with FIELD_MISSING when required. */
  need(o: Record<string, unknown>, k: string, at: string, required: boolean): unknown {
    if (has(o, k)) return o[k];
    if (required) this.f.err(RULES_CODES.fieldMissing, `${k} is required here.`, this.path(at, k));
    return undefined;
  }
  name(o: Record<string, unknown>, k: string, at: string, required = true): string | undefined {
    const v = this.need(o, k, at, required);
    if (v === undefined) return undefined;
    if (typeof v !== "string" || !NAME.test(v)) { this.f.err(RULES_CODES.fieldType, `${k} is 1-64 of A-Z a-z 0-9 _ . -.`, this.path(at, k), show(v)); return undefined; }
    return v;
  }
  text(o: Record<string, unknown>, k: string, at: string, max: number, required = true): string | undefined {
    const v = this.need(o, k, at, required);
    if (v === undefined) return undefined;
    if (typeof v !== "string" || v.length < 1 || v.length > max || !PRINTABLE.test(v)) { this.f.err(RULES_CODES.fieldType, `${k} is 1-${max} printable characters.`, this.path(at, k), show(v)); return undefined; }
    return v;
  }
  oneOf<T extends string>(o: Record<string, unknown>, k: string, at: string, values: readonly T[], required = true): T | undefined {
    const v = this.need(o, k, at, required);
    if (v === undefined) return undefined;
    if (typeof v !== "string" || !(values as readonly string[]).includes(v)) { this.f.err(RULES_CODES.fieldType, `${k} is one of ${values.join(", ")}.`, this.path(at, k), show(v), values.join(", ")); return undefined; }
    return v as T;
  }
  int(o: Record<string, unknown>, k: string, at: string, min: number, max: number, required = true): number | undefined {
    const v = this.need(o, k, at, required);
    if (v === undefined) return undefined;
    if (!isInt(v) || v < min || v > max) { this.f.err(RULES_CODES.fieldType, `${k} is a whole number in ${min}..${max}.`, this.path(at, k), show(v)); return undefined; }
    return v;
  }
  num(o: Record<string, unknown>, k: string, at: string, min: number, max: number, required = true): number | undefined {
    const v = this.need(o, k, at, required);
    if (v === undefined) return undefined;
    if (!isNum(v) || v < min || v > max) { this.f.err(RULES_CODES.fieldType, `${k} is a number in ${min}..${max}.`, this.path(at, k), show(v)); return undefined; }
    return v;
  }
  bool(o: Record<string, unknown>, k: string, at: string, required = true): boolean | undefined {
    const v = this.need(o, k, at, required);
    if (v === undefined) return undefined;
    if (typeof v !== "boolean") { this.f.err(RULES_CODES.fieldType, `${k} is true or false.`, this.path(at, k), show(v)); return undefined; }
    return v;
  }
  /** A list at `k` (absent: undefined, or FIELD_MISSING when required), its length under `max` or BUDGET. */
  list(o: Record<string, unknown>, k: string, at: string, max: number, required = false): unknown[] | undefined {
    const v = this.need(o, k, at, required);
    if (v === undefined) return undefined;
    if (!Array.isArray(v)) { this.f.err(RULES_CODES.fieldType, `${k} is a list.`, this.path(at, k), show(v)); return undefined; }
    if (v.length > max) { this.f.err(RULES_CODES.budget, `${k} holds at most ${max}.`, this.path(at, k), String(v.length), String(max)); return v.slice(0, max); }
    return v;
  }
  obj(v: unknown, at: string, what: string): Record<string, unknown> | undefined {
    if (isObj(v)) return v;
    this.f.err(RULES_CODES.fieldType, `${what} is an object.`, at, show(v));
    return undefined;
  }
}

/** A declaration's type and its start (or default) value at `valueKey`, checked against it. */
function typedDecl(r: Reader, o: Record<string, unknown>, at: string, valueKey: string): VType | null {
  const type = r.oneOf(o, "type", at, RULE_VALUE_TYPES);
  if (type === undefined) return null;
  const value = r.need(o, valueKey, at, true);
  const field = `${at}.${valueKey}`;
  if (type === "int") {
    const min = r.int(o, "min", at, -RULES_INT_ADAPTATION, RULES_INT_ADAPTATION);
    const max = r.int(o, "max", at, -RULES_INT_ADAPTATION, RULES_INT_ADAPTATION);
    if (has(o, "values")) r.f.err(RULES_CODES.fieldUnknown, "An int has no values.", `${at}.values`);
    if (min !== undefined && max !== undefined && min > max) r.f.err(RULES_CODES.type, "min is above max.", `${at}.min`, `${min} > ${max}`);
    if (value !== undefined) {
      if (!isInt(value)) r.f.err(RULES_CODES.fieldType, `${valueKey} is a whole number.`, field, show(value));
      else if ((min !== undefined && value < min) || (max !== undefined && value > max)) r.f.err(RULES_CODES.type, `${valueKey} is outside ${min}..${max}.`, field, String(value), `${min}..${max}`);
    }
    return { t: "int" };
  }
  if (type === "bool") {
    for (const k of ["min", "max", "values"]) if (has(o, k)) r.f.err(RULES_CODES.fieldUnknown, `A bool has no ${k}.`, `${at}.${k}`);
    if (value !== undefined && typeof value !== "boolean") r.f.err(RULES_CODES.fieldType, `${valueKey} is true or false.`, field, show(value));
    return { t: "bool" };
  }
  for (const k of ["min", "max"]) if (has(o, k)) r.f.err(RULES_CODES.fieldUnknown, `An enum has no ${k}.`, `${at}.${k}`);
  const raw = r.list(o, "values", at, 32, true);
  const values: string[] = [];
  raw?.forEach((v, i) => {
    if (typeof v !== "string" || !NAME.test(v)) r.f.err(RULES_CODES.fieldType, "An enum value is 1-64 of A-Z a-z 0-9 _ . -.", `${at}.values[${i}]`, show(v));
    else if (values.includes(v)) r.f.err(RULES_CODES.duplicateId, `The value ${v} is listed twice.`, `${at}.values[${i}]`, v);
    else values.push(v);
  });
  if (raw && raw.length === 0) r.f.err(RULES_CODES.fieldType, "An enum lists at least one value.", `${at}.values`);
  if (value !== undefined) {
    if (typeof value !== "string") r.f.err(RULES_CODES.fieldType, `${valueKey} is one of the values.`, field, show(value));
    else if (raw && !values.includes(value)) r.f.err(RULES_CODES.type, `${valueKey} is not one of ${values.join(", ")}.`, field, value, values.join(", "));
  }
  return { t: "enum", values };
}

/** Declared ids of one kind: unique, of the name grammar. */
function ids(r: Reader, list: readonly unknown[], at: string, read: (o: Record<string, unknown>, at: string) => string | undefined): void {
  const seen = new Set<string>();
  list.forEach((v, i) => {
    const here = `${at}[${i}]`;
    const o = r.obj(v, here, "A declaration");
    if (!o) return;
    const id = read(o, here);
    if (id === undefined) return;
    if (seen.has(id)) r.f.err(RULES_CODES.duplicateId, `${id} is declared twice.`, `${here}.id`, id);
    seen.add(id);
  });
}

function declare(r: Reader, s: Record<string, unknown>, catalogue: RulesCatalogue): Decls {
  const d: Decls = {
    params: new Map(), vars: new Map(), timers: new Map(), phases: new Set(), items: new Map(),
    zones: new Set(), markers: new Set(), spawners: new Set(), doors: new Set(), switches: new Set(), brains: new Set(),
  };
  const config = r.list(s, "config", "", RULES_PARAMS_ADAPTATION);
  if (config) ids(r, config, "config", (o, at) => {
    r.keys(o, at, ["id", "type", "default", "min", "max", "values", "label"]);
    const id = r.name(o, "id", at);
    r.text(o, "label", at, RULES_TEXT_CHARS_ADAPTATION, false);
    const t = typedDecl(r, o, at, "default");
    if (id !== undefined && t && !d.params.has(id)) d.params.set(id, t);
    return id;
  });

  const perScope = (k: string, list: readonly unknown[] | undefined, bound: number): void => {
    for (const scope of RULE_SCOPES) {
      const n = (list ?? []).filter((v) => isObj(v) && v["scope"] === scope).length;
      if (n > bound) r.f.err(RULES_CODES.budget, `At most ${bound} ${k} in the ${scope} scope.`, k, scope, String(bound));
    }
  };
  const variables = r.list(s, "variables", "", RULE_VARIABLES_PER_SCOPE_ADAPTATION * RULE_SCOPES.length + 1);
  perScope("variables", variables, RULE_VARIABLES_PER_SCOPE_ADAPTATION);
  if (variables) ids(r, variables, "variables", (o, at) => {
    r.keys(o, at, ["id", "scope", "type", "start", "min", "max", "values", "reset"]);
    const id = r.name(o, "id", at);
    const scope = r.oneOf(o, "scope", at, RULE_SCOPES);
    r.oneOf(o, "reset", at, RULE_RESETS, false);
    const t = typedDecl(r, o, at, "start");
    if (id !== undefined && scope && t && !d.vars.has(id)) d.vars.set(id, { scope, type: t });
    return id;
  });

  const timers = r.list(s, "timers", "", RULE_TIMERS_PER_SCOPE_ADAPTATION * RULE_SCOPES.length + 1);
  perScope("timers", timers, RULE_TIMERS_PER_SCOPE_ADAPTATION);
  if (timers) ids(r, timers, "timers", (o, at) => {
    r.keys(o, at, ["id", "scope", "seconds", "repeat", "reset"]);
    const id = r.name(o, "id", at);
    const scope = r.oneOf(o, "scope", at, RULE_SCOPES);
    r.num(o, "seconds", at, 0.05, 3600);
    r.bool(o, "repeat", at, false);
    r.oneOf(o, "reset", at, RULE_RESETS, false);
    if (id !== undefined && scope && !d.timers.has(id)) d.timers.set(id, scope);
    return id;
  });

  const phases = r.list(s, "phases", "", RULES_PHASES_ADAPTATION);
  phases?.forEach((v, i) => {
    if (typeof v !== "string" || !NAME.test(v)) r.f.err(RULES_CODES.fieldType, "A phase is 1-64 of A-Z a-z 0-9 _ . -.", `phases[${i}]`, show(v));
    else if (d.phases.has(v)) r.f.err(RULES_CODES.duplicateId, `The phase ${v} is listed twice.`, `phases[${i}]`, v);
    else d.phases.add(v);
  });
  if (phases && phases.length === 0) r.f.err(RULES_CODES.fieldType, "phases lists at least one phase, or is left out.", "phases");
  r.oneOf(s, "phaseReset", "", RULE_RESETS, false);

  const items = r.list(s, "items", "", RULES_ITEMS_ADAPTATION);
  if (items) ids(r, items, "items", (o, at) => {
    r.keys(o, at, ["id", "grants", "price", "stock", "currency"]);
    const id = r.name(o, "id", at);
    const g = r.need(o, "grants", at, true);
    if (g !== undefined) {
      const grants = r.obj(g, `${at}.grants`, "grants");
      if (grants) {
        const kind = r.oneOf(grants, "kind", `${at}.grants`, ITEM_GRANTS);
        r.keys(grants, `${at}.grants`, kind === "token" ? ["kind"] : ["kind", "ref"]);
        if (kind && kind !== "token") r.name(grants, "ref", `${at}.grants`);
      }
    }
    const sale = ["price", "stock", "currency"].filter((k) => has(o, k));
    let forSale = false;
    if (sale.length) {
      const price = r.int(o, "price", at, 0, RULES_INT_ADAPTATION);
      const stock = r.int(o, "stock", at, 1, RULES_INT_ADAPTATION);
      const currency = r.name(o, "currency", at);
      let paid = false;
      if (currency !== undefined) {
        const v = d.vars.get(currency);
        if (!v) r.f.err(RULES_CODES.referenceUnknown, `No variable ${currency} is declared.`, `${at}.currency`, currency);
        else if (v.scope !== "player") r.f.err(RULES_CODES.scope, `A price is paid from a player's variable; ${currency} is ${v.scope}-scoped.`, `${at}.currency`, currency, "player");
        else if (v.type.t !== "int") r.f.err(RULES_CODES.type, `A price is paid from an int; ${currency} is ${typeText(v.type)}.`, `${at}.currency`, currency, "int");
        else paid = true;
      }
      forSale = price !== undefined && stock !== undefined && paid;
    }
    if (id !== undefined && !d.items.has(id)) d.items.set(id, { forSale });
    return id;
  });

  const e = r.need(s, "entities", "", false);
  if (e !== undefined) {
    const ent = r.obj(e, "entities", "entities");
    if (ent) {
      r.keys(ent, "entities", ["zones", "markers", "spawners", "doors", "switches"]);
      const kinds = [["zones", d.zones, catalogue.layout?.zones], ["markers", d.markers, catalogue.layout?.markers], ["spawners", d.spawners, catalogue.layout?.spawners],
        ["doors", d.doors, catalogue.doors], ["switches", d.switches, catalogue.switches]] as const;
      for (const [k, set, offered] of kinds) {
        r.list(ent, k, "entities", RULES_ENTITY_REFS_ADAPTATION)?.forEach((v, i) => {
          const at = `entities.${k}[${i}]`;
          if (typeof v !== "string" || !NAME.test(v)) { r.f.err(RULES_CODES.fieldType, "An entity id is 1-64 of A-Z a-z 0-9 _ . -.", at, show(v)); return; }
          if (set.has(v)) { r.f.err(RULES_CODES.duplicateId, `${v} is listed twice.`, at, v); return; }
          set.add(v);
          if (offered && !offered.includes(v)) r.f.err(RULES_CODES.entityMissing, `The layout has no ${k === "switches" ? "switch" : k.slice(0, -1)} ${v}.`, at, v, offered.join(", ") || "none");
        });
      }
    }
  }

  r.list(s, "capabilities", "", PACK_HANDLERS_ADAPTATION)?.forEach((v, i) => {
    const at = `capabilities[${i}]`;
    const o = r.obj(v, at, "A capability claim");
    if (!o) return;
    r.keys(o, at, ["slot", "handler", "actions", "options"]);
    const slot = r.name(o, "slot", at);
    const handler = r.name(o, "handler", at);
    const actions = r.list(o, "actions", at, 64);
    if (has(o, "options") && !isObj(o["options"])) r.f.err(RULES_CODES.fieldType, "options is an object.", `${at}.options`, show(o["options"]));
    if (slot === undefined || handler === undefined) return;
    if (actions && !actions.every((a) => typeof a === "string")) { r.f.err(RULES_CODES.fieldType, "actions is a list of names.", `${at}.actions`); return; }
    const claim: PackHandlerClaim = { slot, handler, ...(actions ? { actions: actions as string[] } : {}) };
    // a capability named but reserved (the zombies' chase and melee until FCW-15/31), when the catalogue does not offer it
    const reserved = BEHAVIOUR_CAPABILITIES.find((c) => c.status === "reserved" && c.id === handler && c.slot === slot);
    if (reserved && !catalogue.capabilities.some((c) => c.id === handler && c.slot === slot)) {
      r.f.err(RULES_CODES.capabilityReserved, `${handler} is reserved until ${reserved.until ?? "its task"} makes it server-owned: it cannot be claimed yet.`, `${at}.handler`, handler);
      return;
    }
    const found = checkHandlerClaim(claim, catalogue.capabilities, {}, { slots: catalogue.slots });
    for (const x of found) r.f.err(x.code, x.text, `${at}.${x.field ?? "handler"}`, x.actual, x.expected);
    if (!found.length) d.brains.add(handler);
  });
  return d;
}

/** Whether `who` names a subject the event carries (FIELD_TYPE, SUBJECT); the subject or undefined. */
function subject(r: Reader, v: unknown, at: string, ctx: Ctx): RuleSubject | undefined {
  if (typeof v !== "string" || !(RULE_SUBJECTS as readonly string[]).includes(v)) { r.f.err(RULES_CODES.fieldType, `A player is one of ${RULE_SUBJECTS.join(", ")}.`, at, show(v)); return undefined; }
  const s = v as RuleSubject;
  if (ctx.event && !ctx.roles.has(s)) r.f.err(RULES_CODES.subject, `${ctx.event} carries no ${s}.`, at, s, [...ctx.roles].join(", ") || "none");
  return s;
}
function team(r: Reader, v: unknown, at: string, ctx: Ctx): void {
  if (typeof v === "string") {
    if (!(RULE_SIDES as readonly string[]).includes(v)) r.f.err(RULES_CODES.fieldType, `A team is ${RULE_SIDES.join(" or ")}, or {of: a player}.`, at, v);
    return;
  }
  const o = r.obj(v, at, "A team");
  if (!o) return;
  r.keys(o, at, ["of"]);
  if (r.need(o, "of", at, true) !== undefined) subject(r, o["of"], `${at}.of`, ctx);
}
function winner(r: Reader, v: unknown, at: string, ctx: Ctx): void {
  if (v === "none") return;
  team(r, v, at, ctx);
}

/** The scope rule for a variable or timer named at `at` (its name at `nameAt`): who for a player's, team for a team's, neither for the match's. */
function scoped(r: Reader, o: Record<string, unknown>, at: string, scope: RuleScope, name: string, nameAt: string, ctx: Ctx): void {
  const who = has(o, "who"), tm = has(o, "team");
  if (scope === "player" && !who) r.f.err(RULES_CODES.scope, `${name} is a player's: name the player (who).`, nameAt, name, "who");
  else if (scope === "team" && !tm) r.f.err(RULES_CODES.scope, `${name} is a team's: name the team.`, nameAt, name, "team");
  if (scope !== "player" && who) r.f.err(RULES_CODES.scope, `${name} is ${scope}-scoped: it has no player.`, nameAt, name, scope);
  if (scope !== "team" && tm) r.f.err(RULES_CODES.scope, `${name} is ${scope}-scoped: it has no team.`, nameAt, name, scope);
  if (who) subject(r, o["who"], `${at}.who`, ctx);
  if (tm) team(r, o["team"], `${at}.team`, ctx);
}

/** An operand's type, or null when it is refused (or names something undeclared). A string literal is `text` with its value. */
function operand(r: Reader, v: unknown, at: string, d: Decls, ctx: Ctx): { type: VType; literal?: string | number } | null {
  if (typeof v === "number") {
    if (!isInt(v)) { r.f.err(RULES_CODES.fieldType, `A number here is a whole number within ${RULES_INT_ADAPTATION}.`, at, show(v)); return null; }
    return { type: { t: "int" }, literal: v };
  }
  if (typeof v === "boolean") return { type: { t: "bool" } };
  if (typeof v === "string") {
    if (!NAME.test(v)) { r.f.err(RULES_CODES.fieldType, "A word here is 1-64 of A-Z a-z 0-9 _ . -.", at, show(v)); return null; }
    return { type: { t: "text" }, literal: v };
  }
  const o = r.obj(v, at, "An operand");
  if (!o) return null;
  if (has(o, "var")) {
    r.keys(o, at, ["var", "who", "team"]);
    const name = r.name(o, "var", at);
    if (name === undefined) return null;
    const decl = d.vars.get(name);
    if (!decl) { r.f.err(RULES_CODES.referenceUnknown, `No variable ${name} is declared.`, `${at}.var`, name); return null; }
    scoped(r, o, at, decl.scope, name, `${at}.var`, ctx);
    return { type: decl.type };
  }
  if (has(o, "field")) {
    r.keys(o, at, ["field"]);
    const name = r.name(o, "field", at);
    if (name === undefined) return null;
    const t = Object.prototype.hasOwnProperty.call(ctx.fields, name) ? ctx.fields[name] : undefined;
    if (!t) { r.f.err(RULES_CODES.referenceUnknown, `${ctx.event ?? "The event"} has no field ${name}.`, `${at}.field`, name, Object.keys(ctx.fields).join(", ") || "none"); return null; }
    return { type: t };
  }
  if (has(o, "param")) {
    r.keys(o, at, ["param"]);
    const name = r.name(o, "param", at);
    if (name === undefined) return null;
    const t = d.params.get(name);
    if (!t) { r.f.err(RULES_CODES.referenceUnknown, `No parameter ${name} is declared.`, `${at}.param`, name); return null; }
    return { type: t };
  }
  r.f.err(RULES_CODES.fieldType, "An operand is a value, {var}, {field} or {param}.", at, show(v));
  return null;
}

/** Whether a value of type `b` (a literal `lit` when given) may stand where `a` is expected. */
function fits(a: VType, b: VType, lit?: string | number): boolean {
  if (a.t === "enum") return (b.t === "enum" && b.values.join("|") === a.values.join("|")) || (b.t === "text" && typeof lit === "string" && a.values.includes(lit));
  if (a.t === "text") return b.t === "text";
  return a.t === b.t;
}
function comparable(a: VType, b: VType, la?: string | number, lb?: string | number): boolean {
  if (a.t === "text" && b.t === "text") return true;
  if (a.t === "text") return fits(b, a, la);
  if (b.t === "text") return fits(a, b, lb);
  return fits(a, b);
}

/** A name a parameter or a filter refers to, checked against what is declared. */
function declared(d: Decls, kind: FilterKind | "marker" | "door" | "brain"): ReadonlySet<string> {
  switch (kind) {
    case "zone": return d.zones;
    case "marker": return d.markers;
    case "spawner": return d.spawners;
    case "door": return d.doors;
    case "brain": return d.brains;
    case "phase": return d.phases;
    case "timer": return new Set(d.timers.keys());
    case "item": return new Set(d.items.keys());
    case "target": return new Set([...d.doors, ...d.switches, ...d.markers]);
  }
}
function reference(r: Reader, o: Record<string, unknown>, k: string, at: string, kind: FilterKind | "marker" | "door" | "brain", d: Decls, required: boolean): string | undefined {
  const v = kind === "brain" ? r.need(o, k, at, required) : r.name(o, k, at, required);
  if (v === undefined) return undefined;
  if (typeof v !== "string") { r.f.err(RULES_CODES.fieldType, `${k} is a name.`, `${at}.${k}`, show(v)); return undefined; }
  if (!declared(d, kind).has(v)) {
    const what = kind === "brain" ? "claimed capability" : kind === "target" ? "door, switch or marker" : kind;
    r.f.err(RULES_CODES.referenceUnknown, `No ${what} ${v} is declared.`, `${at}.${k}`, v);
    return undefined;
  }
  return v;
}

function condition(r: Reader, v: unknown, at: string, d: Decls, ctx: Ctx, depth: number): void {
  const o = r.obj(v, at, "A condition");
  if (!o) return;
  const test = r.need(o, "test", at, true);
  if (test === undefined) return;
  if (typeof test !== "string" || !(RULE_CONDITIONS as readonly string[]).includes(test)) {
    r.f.err(RULES_CODES.conditionUnknown, `There is no condition ${show(test)}.`, `${at}.test`, show(test), RULE_CONDITIONS.join(", "));
    return;
  }
  switch (test as RuleConditionName) {
    case "compare": {
      r.keys(o, at, ["test", "left", "op", "right"]);
      const op = r.oneOf(o, "op", at, RULE_COMPARE_OPS);
      const left = r.need(o, "left", at, true) === undefined ? null : operand(r, o["left"], `${at}.left`, d, ctx);
      const right = r.need(o, "right", at, true) === undefined ? null : operand(r, o["right"], `${at}.right`, d, ctx);
      if (!left || !right || !op) return;
      const seen = `${typeText(left.type)} ${op} ${typeText(right.type)}`;
      if (!comparable(left.type, right.type, left.literal, right.literal)) r.f.err(RULES_CODES.type, `These are not of one type: ${seen}.`, at, seen);
      else if (!["=", "!="].includes(op) && (left.type.t !== "int" || right.type.t !== "int")) r.f.err(RULES_CODES.type, `${op} orders whole numbers only: ${seen}.`, at, seen);
      return;
    }
    case "team": {
      r.keys(o, at, ["test", "who", "is", "same"]);
      if (r.need(o, "who", at, true) !== undefined) subject(r, o["who"], `${at}.who`, ctx);
      const is = has(o, "is"), same = has(o, "same");
      if (is === same) r.f.err(is ? RULES_CODES.fieldType : RULES_CODES.fieldMissing, "A team test names a side (is) or another player (same), one of them.", `${at}.is`);
      if (is) r.oneOf(o, "is", at, RULE_SIDES);
      if (same) subject(r, o["same"], `${at}.same`, ctx);
      return;
    }
    case "inZone":
      r.keys(o, at, ["test", "who", "zone"]);
      if (r.need(o, "who", at, true) !== undefined) subject(r, o["who"], `${at}.who`, ctx);
      reference(r, o, "zone", at, "zone", d, true);
      return;
    case "hasItem":
      r.keys(o, at, ["test", "who", "item"]);
      if (r.need(o, "who", at, true) !== undefined) subject(r, o["who"], `${at}.who`, ctx);
      reference(r, o, "item", at, "item", d, true);
      return;
    case "alive":
      r.keys(o, at, ["test", "team", "zone", "op", "count"]);
      r.oneOf(o, "team", at, RULE_SIDES, false);
      if (has(o, "zone")) reference(r, o, "zone", at, "zone", d, true);
      r.oneOf(o, "op", at, RULE_COMPARE_OPS);
      r.int(o, "count", at, 0, 64);
      return;
    case "phase":
      r.keys(o, at, ["test", "is"]);
      reference(r, o, "is", at, "phase", d, true);
      return;
    case "chance":
      r.keys(o, at, ["test", "percent"]);
      r.num(o, "percent", at, 0, 100);
      return;
    case "any": {
      r.keys(o, at, ["test", "of"]);
      if (depth + 1 > RULE_CONDITION_DEPTH_ADAPTATION) { r.f.err(RULES_CODES.budget, `Conditions nest at most ${RULE_CONDITION_DEPTH_ADAPTATION} deep.`, at, String(depth + 1)); return; }
      const of = r.list(o, "of", at, RULE_CONDITIONS_ADAPTATION, true);
      if (of && of.length === 0) r.f.err(RULES_CODES.fieldType, "any lists at least one condition.", `${at}.of`);
      of?.forEach((c, i) => condition(r, c, `${at}.of[${i}]`, d, ctx, depth + 1));
      return;
    }
    case "not":
      r.keys(o, at, ["test", "of"]);
      if (depth + 1 > RULE_CONDITION_DEPTH_ADAPTATION) { r.f.err(RULES_CODES.budget, `Conditions nest at most ${RULE_CONDITION_DEPTH_ADAPTATION} deep.`, at, String(depth + 1)); return; }
      if (r.need(o, "of", at, true) !== undefined) condition(r, o["of"], `${at}.of`, d, ctx, depth + 1);
      return;
  }
}

/** What one action causes in the chain: an event and, where the action names it, the id its filter would match. */
interface Emitted { event: RuleEventName; id?: string }

function action(r: Reader, v: unknown, at: string, d: Decls, ctx: Ctx, filterId: string | undefined, out: Emitted[]): void {
  const o = r.obj(v, at, "An action");
  if (!o) return;
  const name = r.need(o, "do", at, true);
  if (name === undefined) return;
  if (typeof name !== "string" || !(RULE_ACTIONS as readonly string[]).includes(name)) {
    r.f.err(RULES_CODES.actionUnknown, `There is no action ${show(name)}.`, `${at}.do`, show(name), "the vocabulary's actions (RULE_ACTIONS)");
    return;
  }
  const a = name as RuleActionName;
  const spec = RULE_ACTION_SPECS[a];
  r.keys(o, at, ["do", ...Object.keys(spec.params)]);
  if (ctx.client && spec.side !== "presentation") r.f.err(RULES_CODES.actionSide, `${a} is an outcome, the room's only: a client rule shows, it decides nothing.`, `${at}.do`, a, PRESENTATION_ACTIONS.join(", "));
  if (spec.on && ctx.event && !spec.on.includes(ctx.event)) r.f.err(RULES_CODES.actionEvent, `${a} answers ${spec.on.join(", ")} only, not ${ctx.event}.`, `${at}.do`, a, spec.on.join(", "));
  const named: Record<string, string | undefined> = {};
  for (const [k, ps] of Object.entries(spec.params)) {
    const required = ps.required === true;
    switch (ps.kind) {
      case "var": case "who": case "team": break;   // the scope rule, below
      case "timer": case "phase": case "zone": case "marker": case "spawner": case "item": case "door": case "brain":
        named[k] = reference(r, o, k, at, ps.kind, d, required);
        break;
      case "winner": if (r.need(o, k, at, required) !== undefined) winner(r, o[k], `${at}.${k}`, ctx); break;
      case "reason": r.oneOf(o, k, at, PURCHASE_REFUSALS, required); break;
      case "operand": if (r.need(o, k, at, required) !== undefined) operand(r, o[k], `${at}.${k}`, d, ctx); break;
      case "intOperand": {
        if (r.need(o, k, at, required) === undefined) break;
        const t = operand(r, o[k], `${at}.${k}`, d, ctx);
        if (t && t.type.t !== "int") r.f.err(RULES_CODES.type, `${k} is a whole number; this is ${typeText(t.type)}.`, `${at}.${k}`, show(o[k]), "int");
        break;
      }
      case "int": r.int(o, k, at, ps.min ?? -RULES_INT_ADAPTATION, ps.max ?? RULES_INT_ADAPTATION, required); break;
      case "number": r.num(o, k, at, ps.min ?? -RULES_INT_ADAPTATION, ps.max ?? RULES_INT_ADAPTATION, required); break;
      case "bool": r.bool(o, k, at, required); break;
      case "text": r.text(o, k, at, RULES_TEXT_CHARS_ADAPTATION, required); break;
      case "name": r.name(o, k, at, required); break;
      case "names": {
        const list = r.list(o, k, at, 32, required);
        if (list && list.length === 0) r.f.err(RULES_CODES.fieldType, `${k} lists at least one.`, `${at}.${k}`);
        list?.forEach((x, i) => { if (typeof x !== "string" || !NAME.test(x)) r.f.err(RULES_CODES.fieldType, "A name is 1-64 of A-Z a-z 0-9 _ . -.", `${at}.${k}[${i}]`, show(x)); });
        break;
      }
    }
  }
  // the scope rule: a variable's or a timer's scope decides who/team; elsewhere who/team are free (one of them at most)
  const scopedName = (k: "var" | "timer"): void => {
    // a timer's name was read (and any refusal reported) with the other references, above
    const name = k === "var" ? r.name(o, k, at, true) : named["timer"];
    if (name === undefined) return;
    const scope = k === "var" ? d.vars.get(name)?.scope : d.timers.get(name);
    if (scope === undefined) { r.f.err(RULES_CODES.referenceUnknown, `No variable ${name} is declared.`, `${at}.${k}`, name); return; }
    scoped(r, o, at, scope, name, `${at}.${k}`, ctx);
  };
  if (a === "variable.set" || a === "variable.add") {
    scopedName("var");
    const decl = typeof o["var"] === "string" ? d.vars.get(o["var"]) : undefined;
    if (decl && a === "variable.add" && decl.type.t !== "int") r.f.err(RULES_CODES.type, `${o["var"] as string} is ${typeText(decl.type)}: only an int is added to.`, `${at}.var`, o["var"] as string, "int");
    if (decl && a === "variable.set" && has(o, "value")) {
      const t = operand(new Reader(new Findings()), o["value"], `${at}.value`, d, ctx);   // its own refusals were reported above
      if (t && !fits(decl.type, t.type, t.literal)) r.f.err(RULES_CODES.type, `${o["var"] as string} is ${typeText(decl.type)}; this is ${typeText(t.type)}.`, `${at}.value`, show(o["value"]), typeText(decl.type));
    }
  } else if (a === "timer.start" || a === "timer.stop") {
    scopedName("timer");
  } else if (a === "hud.value") {
    const name = r.name(o, "var", at, true);
    if (name !== undefined && !d.vars.has(name)) r.f.err(RULES_CODES.referenceUnknown, `No variable ${name} is declared.`, `${at}.var`, name);
  } else if ("who" in spec.params && !spec.params["who"]!.required) {
    const who = has(o, "who"), tm = has(o, "team");
    if (who && tm) r.f.err(RULES_CODES.fieldType, `${a} names a player or a team, not both.`, `${at}.team`);
    if (a === "score.award" && !who && !tm) r.f.err(RULES_CODES.fieldMissing, "score.award names the player (who) or the team it awards.", `${at}.who`);
    if (who) subject(r, o["who"], `${at}.who`, ctx);
    if (tm) team(r, o["team"], `${at}.team`, ctx);
  } else if (spec.params["who"]?.required) {
    if (r.need(o, "who", at, true) !== undefined) subject(r, o["who"], `${at}.who`, ctx);
  }
  for (const e of spec.emits) {
    const id = e === "phase.change" ? named["phase"] : e === "zone.enter" || e === "zone.exit" ? named["zone"] : e === "player.spawn" ? named["spawner"]
      : e === "purchase.accepted" || e === "purchase.refused" ? filterId : undefined;
    out.push(id === undefined ? { event: e } : { event: e, id });
  }
}

interface ParsedRule { id: string; event: RuleEventName; filter?: string; emits: Emitted[]; actions: number }

function rule(r: Reader, v: unknown, i: number, d: Decls, seen: Set<string>): ParsedRule | null {
  const at = `rules[${i}]`;
  const o = r.obj(v, at, "A rule");
  if (!o) return null;
  r.keys(o, at, ["id", "side", "when", "if", "then", "else"]);
  const id = r.name(o, "id", at);
  if (id !== undefined) {
    if (seen.has(id)) r.f.err(RULES_CODES.duplicateId, `The rule ${id} is declared twice.`, `${at}.id`, id);
    seen.add(id);
  }
  const side = r.oneOf(o, "side", at, ["server", "client"] as const, false);
  let event: RuleEventName | null = null;
  let filter: string | undefined;
  let filterKind: FilterKind | undefined;
  const when = r.need(o, "when", at, true);
  const known = (e: unknown, field: string): RuleEventName | null => {
    if (typeof e === "string" && (RULE_EVENTS as readonly string[]).includes(e)) return e as RuleEventName;
    r.f.err(RULES_CODES.eventUnknown, `There is no event ${show(e)}.`, field, show(e), "the vocabulary's events (RULE_EVENTS)");
    return null;
  };
  if (typeof when === "string") event = known(when, `${at}.when`);
  else if (when !== undefined) {
    const w = r.obj(when, `${at}.when`, "when");
    if (w) {
      event = r.need(w, "event", `${at}.when`, true) === undefined ? null : known(w["event"], `${at}.when.event`);
      filterKind = event ? RULE_EVENT_SPECS[event].filter : undefined;
      const filterKey = filterKind;
      if (event) r.keys(w, `${at}.when`, filterKey ? ["event", filterKey] : ["event"]);
      if (filterKey && has(w, filterKey)) filter = reference(r, w, filterKey, `${at}.when`, filterKind!, d, true);
    }
  }
  const es = event ? RULE_EVENT_SPECS[event] : null;
  const roles = new Set<RuleSubject>(es?.roles ?? []);
  if (event === "timer.fire" && filter !== undefined && d.timers.get(filter) === "player") roles.add("player");
  const fields: Record<string, VType> = {};
  for (const [k, t] of Object.entries(es?.fields ?? {})) fields[k] = t === "int" ? { t: "int" } : t === "text" ? { t: "text" } : { t: "enum", values: t as readonly string[] };
  const ctx: Ctx = { event, roles, fields, client: side === "client" };
  r.list(o, "if", at, RULE_CONDITIONS_ADAPTATION)?.forEach((c, j) => condition(r, c, `${at}.if[${j}]`, d, ctx, 1));
  const emits: Emitted[] = [];
  const then = r.list(o, "then", at, RULE_ACTIONS_PER_EVENT_ADAPTATION + 1, true);
  if (then && then.length === 0) r.f.err(RULES_CODES.fieldType, "then lists at least one action.", `${at}.then`);
  then?.forEach((x, j) => action(r, x, `${at}.then[${j}]`, d, ctx, filter, emits));
  const otherwise = r.list(o, "else", at, RULE_ACTIONS_PER_EVENT_ADAPTATION + 1);
  otherwise?.forEach((x, j) => action(r, x, `${at}.else[${j}]`, d, ctx, filter, emits));
  // a purchase rule's items are for sale: price, stock and currency
  if (event && event.startsWith("purchase.")) {
    if (filter !== undefined) {
      if (d.items.get(filter)?.forSale === false) r.f.err(RULES_CODES.itemNotForSale, `${filter} has no price, stock and currency: it cannot be bought.`, `${at}.when.item`, filter);
    } else {
      for (const [item, x] of d.items) if (!x.forSale) r.f.err(RULES_CODES.itemNotForSale, `This purchase rule answers for every item, and ${item} has no price, stock and currency.`, `${at}.when`, item);
    }
  }
  if (!event || id === undefined) return null;
  return { id, event, ...(filter !== undefined ? { filter } : {}), emits, actions: (then?.length ?? 0) + (otherwise?.length ?? 0) };
}

/** The chain bound over every path, the conditions ignored: a cycle, and a chain longer than the bound, from its head. */
function chains(f: Findings, rules: readonly (ParsedRule | null)[]): void {
  const n = rules.length;
  const edges: number[][] = rules.map((a) => {
    if (!a) return [];
    const out: number[] = [];
    rules.forEach((b, j) => {
      if (b && a.emits.some((e) => e.event === b.event && (b.filter === undefined || e.id === undefined || e.id === b.filter))) out.push(j);
    });
    return out;
  });
  const state = new Array<number>(n).fill(0);
  const depth = new Array<number>(n).fill(0);
  const next = new Array<number>(n).fill(-1);
  const inf = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  const cycles = new Set<string>();
  const visit = (i: number): void => {
    state[i] = 1;
    stack.push(i);
    let best = 0;
    for (const j of edges[i]!) {
      if (state[j] === 1) {
        const cyc = [...stack.slice(stack.indexOf(j)), j];
        const key = [...new Set(cyc)].sort((x, y) => x - y).join(",");
        if (!cycles.has(key)) {
          cycles.add(key);
          const names = cyc.map((k) => rules[k]!.id).join(" -> ");
          f.err(RULES_CODES.chainDepth, `These rules trigger each other without end (${names}): past any chain bound.`, `rules[${cyc[0]}]`, names, `at most ${RULE_CHAIN_DEPTH_ADAPTATION}`);
        }
        inf[i] = true;
        continue;
      }
      if (state[j] === 0) visit(j);
      if (inf[j]) inf[i] = true;
      else if (depth[j]! > best) { best = depth[j]!; next[i] = j; }
    }
    stack.pop();
    state[i] = 2;
    depth[i] = 1 + best;
  };
  for (let i = 0; i < n; i++) if (rules[i] && state[i] === 0) visit(i);
  const deep = (i: number): boolean => !inf[i] && depth[i]! > RULE_CHAIN_DEPTH_ADAPTATION;
  for (let i = 0; i < n; i++) {
    if (!rules[i] || !deep(i)) continue;
    if (edges.some((e, k) => k !== i && e.includes(i) && deep(k))) continue;   // reported from its head
    const path: string[] = [];
    for (let k = i; k >= 0; k = next[k]!) path.push(rules[k]!.id);
    f.err(RULES_CODES.chainDepth, `A chain of ${depth[i]} rules is past the bound of ${RULE_CHAIN_DEPTH_ADAPTATION}.`, `rules[${i}]`, path.join(" -> "), `at most ${RULE_CHAIN_DEPTH_ADAPTATION}`);
  }
}

/**
 * A rules spec checked against the catalogue (FCW-30): every refusal by name, at validation, never at play. `pass` only
 * when nothing is refused. Pure; the spec is not changed.
 */
export function validateRules(spec: unknown, catalogue: RulesCatalogue = rulesCatalogue()): CheckReport {
  const f = new Findings();
  if (!isObj(spec)) {
    f.err(RULES_CODES.schema, "A rules spec is a JSON object.", undefined, Array.isArray(spec) ? "a list" : show(spec));
    return checkReport(f.list, { evidence: "validation" });
  }
  if (spec["schema"] !== RULES_SCHEMA) {
    f.err(RULES_CODES.schema, `A rules spec's schema is "${RULES_SCHEMA}".`, "schema", show(spec["schema"]), RULES_SCHEMA);
    return checkReport(f.list, { evidence: "validation" });
  }
  const vocabulary = spec["vocabulary"];
  if (!Number.isInteger(vocabulary) || (vocabulary as number) < 0 || (vocabulary as number) > catalogue.vocabulary) {
    f.err(RULES_CODES.vocabulary, `This build reads rules vocabulary 0..${catalogue.vocabulary}.`, "vocabulary", show(vocabulary), `0..${catalogue.vocabulary}`);
    return checkReport(f.list, { evidence: "validation" });
  }
  scanCode(spec, "", f);
  const r = new Reader(f);
  r.keys(spec, "", ["schema", "vocabulary", "id", "name", "description", "config", "variables", "timers", "phases", "phaseReset", "items", "entities", "capabilities", "rules"]);
  const id = r.need(spec, "id", "", true);
  if (id !== undefined && (typeof id !== "string" || id.length > 64 || !MODE_ID.test(id) || id.includes(".."))) {
    f.err(RULES_CODES.fieldType, "id is a mode id: 1-64 of a-z, 0-9, dots and hyphens, starting and ending with a letter or digit.", "id", show(id));
  }
  r.text(spec, "name", "", 48);
  r.text(spec, "description", "", 400, false);
  const d = declare(r, spec, catalogue);
  const list = r.list(spec, "rules", "", RULES_PER_PACK_ADAPTATION, true);
  const seen = new Set<string>();
  const rules = (list ?? []).map((v, i) => rule(r, v, i, d, seen));
  const perEvent = new Map<RuleEventName, number>();
  for (const x of rules) if (x) perEvent.set(x.event, (perEvent.get(x.event) ?? 0) + x.actions);
  for (const [event, count] of perEvent) {
    if (count > RULE_ACTIONS_PER_EVENT_ADAPTATION) f.err(RULES_CODES.budget, `${count} actions answer ${event}; the bound is ${RULE_ACTIONS_PER_EVENT_ADAPTATION}.`, "rules", event, String(RULE_ACTIONS_PER_EVENT_ADAPTATION));
  }
  chains(f, rules);
  return checkReport(f.list, { evidence: "validation" });
}

/**
 * A `RecordMode`'s `params` against a valid spec's configuration (level 1): null when they suit it, else why not. A
 * parameter left out takes its default.
 */
export function checkRulesParams(spec: RulesSpec, params: Readonly<Record<string, unknown>>): string | null {
  const config = spec.config ?? [];
  for (const [k, v] of Object.entries(params)) {
    const c = config.find((x) => x.id === k);
    if (!c) return `${spec.id} has no parameter ${k}`;
    if (c.type === "int" && (!isInt(v) || (c.min !== undefined && v < c.min) || (c.max !== undefined && v > c.max))) return `${k} is a whole number in ${c.min}..${c.max}`;
    if (c.type === "bool" && typeof v !== "boolean") return `${k} is true or false`;
    if (c.type === "enum" && (typeof v !== "string" || !(c.values ?? []).includes(v))) return `${k} is one of ${(c.values ?? []).join(", ")}`;
  }
  return null;
}
