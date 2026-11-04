import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BEHAVIOUR_SLOTS,
  behaviourCatalogue,
  ENGINE_CONTRACT_VERSION,
  PACK_CODES,
  PACK_MANIFEST_FILE,
  PACK_TARGET_US,
  PRESENTATION_ACTIONS,
  RULE_ACTIONS,
  RULE_ACTIONS_PER_EVENT_ADAPTATION,
  RULE_CHAIN_DEPTH_ADAPTATION,
  RULE_CONDITIONS,
  RULE_EVENTS,
  RULE_EVENTS_PER_TICK_ADAPTATION,
  RULE_TIMERS_PER_SCOPE_ADAPTATION,
  RULE_VARIABLES_PER_SCOPE_ADAPTATION,
  RULES_ADAPTATION,
  RULES_CODES,
  RULES_PER_PACK_ADAPTATION,
  RULES_SCHEMA,
  RULES_VOCABULARY_VERSION,
  rulesCatalogue,
  satisfiesRange,
  validatePack,
  validateRules,
  type CheckReport,
  type HandlerSlot,
  type PackHandlerCapability,
  type RulesCatalogue,
} from "../src/index.js";

/**
 * FCW-30: the creator rules contract (`docs/specs/2026-10-27-creator-rules-contract.md`, §3-§7, §10, §11) and its
 * validator. Product track: types, data and a validator, a browser adaptation with no original; nothing here runs a
 * rule (FCW-31 does, in the room). Every refusal is by name, at validation, never at play.
 */

type Json = Record<string, unknown>;
const codes = (r: CheckReport): string[] => r.diagnostics.map((d) => d.code);

/**
 * A catalogue with one NPC brain on a behaviour slot, built here so the validator's own default (the `behaviour` slot
 * family, `handlers.ts`) is not what these cases depend on.
 */
const NPC_SLOT: HandlerSlot = { id: "behaviour.npc", kind: "behaviour", actions: ["install", "enable", "disable", "dispose"], exclusive: false };
const PATROL: PackHandlerCapability = { id: "behaviour.npc.patrol", slot: "behaviour.npc", actions: ["install", "enable", "disable", "dispose"], exclusive: false };
const CATALOGUE: RulesCatalogue = rulesCatalogue({ slots: [NPC_SLOT], capabilities: [PATROL] });

/** The smallest spec that passes: one player-scoped counter added on a kill. */
const minimal = (over: Json = {}): Json => ({
  schema: RULES_SCHEMA,
  vocabulary: RULES_VOCABULARY_VERSION,
  id: "test.mode",
  name: "Test",
  variables: [{ id: "kills", scope: "player", type: "int", start: 0, min: 0, max: 100 }],
  rules: [{ id: "count", when: "player.kill", then: [{ do: "variable.add", var: "kills", who: "attacker", amount: 1 }] }],
  ...over,
});
const withRule = (rule: Json, over: Json = {}): Json => minimal({ rules: [rule], ...over });

/** The report fails, and one of its diagnostics has `code`, and (when given) names `actual` and sits at `field`. */
function refusedBy(spec: unknown, code: string, actual?: string, field?: string, catalogue: RulesCatalogue = CATALOGUE): void {
  const report = validateRules(spec, catalogue);
  expect(report.status, JSON.stringify(report.diagnostics)).toBe("fail");
  const hit = report.diagnostics.find((d) => d.code === code && (actual === undefined || d.actual === actual) && (field === undefined || d.field === field));
  expect(hit, `${code} ${actual ?? ""} ${field ?? ""} in ${JSON.stringify(report.diagnostics.map((d) => [d.code, d.field, d.actual]))}`).toBeDefined();
  expect(hit!.severity).toBe("error");
  expect(hit!.text.length).toBeGreaterThan(0);
}
function passes(spec: unknown, catalogue: RulesCatalogue = CATALOGUE): void {
  const report = validateRules(spec, catalogue);
  expect(report.diagnostics.map((d) => [d.code, d.field, d.actual, d.text])).toEqual([]);
  expect(report.status).toBe("pass");
}

// ---------------------------------------------------------------------------------------------------------------------
// The five proof experiences (spec §11), as data. FCW-30's acceptance: the vocabulary is enough to express each one.
// None runs here (FCW-31 runs rules; FCW-13..16 and 34 ship them as packs).
// ---------------------------------------------------------------------------------------------------------------------

const ALL_OUT = (team: "seal" | "terrorist", winner: "seal" | "terrorist"): Json => ({
  id: `${team}-out`, when: "player.eliminated", if: [{ test: "alive", team, op: "=", count: 0 }], then: [{ do: "round.end", winner }],
});

/** Paintball (FCW-13): a hit counts, the last hit eliminates; no damage; one marker; the round ends on a side out. */
const PAINTBALL: Json = {
  schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: "example.paintball", name: "Paintball",
  config: [
    { id: "hitsToOut", type: "int", default: 1, min: 1, max: 10 },
    { id: "pointsPerOut", type: "int", default: 1, min: 0, max: 100 },
    { id: "friendlyFire", type: "bool", default: false },
  ],
  variables: [{ id: "hits", scope: "player", type: "int", start: 0, min: 0, max: 10 }],
  rules: [
    { id: "loadout", when: "round.start", then: [{ do: "loadout.restrict", allow: ["paintball.marker"] }] },
    {
      id: "hit", when: "player.hit",
      if: [{ test: "any", of: [{ test: "compare", left: { param: "friendlyFire" }, op: "=", right: true }, { test: "not", of: { test: "team", who: "attacker", same: "victim" } }] }],
      then: [{ do: "hit.scale", factor: 0 }, { do: "variable.add", var: "hits", who: "victim", amount: 1 }],
      else: [{ do: "hit.scale", factor: 0 }],
    },
    {
      id: "out", when: "player.hit",
      if: [{ test: "compare", left: { var: "hits", who: "victim" }, op: ">=", right: { param: "hitsToOut" } }],
      then: [{ do: "player.eliminate", who: "victim" }, { do: "score.award", who: "attacker", points: { param: "pointsPerOut" } }],
    },
    ALL_OUT("seal", "terrorist"),
    ALL_OUT("terrorist", "seal"),
    { id: "hits-hud", side: "client", when: "player.hit", then: [{ do: "hud.value", var: "hits", label: "Hits" }] },
  ],
};

/** Party (FCW-14): a timed beat and a stage zone, presentation only. */
const PARTY: Json = {
  schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: "example.party", name: "Party",
  timers: [{ id: "beat", scope: "match", seconds: 30, repeat: true }],
  entities: { zones: ["stage"] },
  rules: [
    { id: "start", when: "round.start", then: [{ do: "timer.start", timer: "beat" }, { do: "message.show", text: "Party time" }] },
    { id: "beat", when: { event: "timer.fire", timer: "beat" }, then: [{ do: "cue.play", cue: "party.beat" }] },
    {
      id: "stage", when: { event: "zone.enter", zone: "stage" },
      then: [{ do: "cue.play", cue: "party.cheer", who: "player" }, { do: "message.show", text: "On stage!", who: "player" }],
    },
  ],
};

/** Zombies + shop (FCW-15): waves from a spawner with the engine's NPC brain, a bounty in cash, a shop zone. */
const ZOMBIES: Json = {
  schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: "example.zombies", name: "Zombies",
  capabilities: [{ slot: "behaviour.npc", handler: "behaviour.npc.patrol" }],
  variables: [
    { id: "cash", scope: "player", type: "int", start: 500, min: 0, max: 100000, reset: "match" },
    { id: "wave", scope: "match", type: "int", start: 0, min: 0, max: 100, reset: "match" },
  ],
  items: [
    { id: "rifle", grants: { kind: "weapon", ref: "m4a1" }, price: 1000, stock: 99, currency: "cash" },
    { id: "medkit", grants: { kind: "equipment", ref: "medkit" }, price: 250, stock: 99, currency: "cash" },
  ],
  entities: { zones: ["shop"], spawners: ["horde"] },
  rules: [
    {
      id: "first", when: "round.start",
      then: [{ do: "variable.set", var: "wave", value: 1 }, { do: "spawner.release", spawner: "horde", count: 8, brain: "behaviour.npc.patrol" }],
    },
    { id: "bounty", when: { event: "npc.death", spawner: "horde" }, then: [{ do: "variable.add", var: "cash", who: "attacker", amount: 100 }] },
    {
      id: "next", when: { event: "spawner.empty", spawner: "horde" },
      then: [{ do: "variable.add", var: "wave", amount: 1 }, { do: "spawner.release", spawner: "horde", count: 8, brain: "behaviour.npc.patrol" }],
    },
    { id: "buy", when: "purchase.request", if: [{ test: "inZone", who: "player", zone: "shop" }], then: [{ do: "purchase.accept" }] },
    { id: "bought", when: "purchase.accepted", then: [{ do: "message.show", text: "Bought", who: "player" }] },
    { id: "broke", when: { event: "purchase.refused", item: "rifle" }, if: [{ test: "compare", left: { field: "reason" }, op: "=", right: "funds" }], then: [{ do: "message.show", text: "Not enough cash", who: "player" }] },
    ALL_OUT("seal", "terrorist"),
    { id: "cash-hud", side: "client", when: "purchase.accepted", then: [{ do: "hud.value", var: "cash", label: "Cash" }] },
  ],
};

/** Battle royale (FCW-16): seeded drops and loot, a ring that reshapes by phase and hurts outside it. */
const RING_STEP = (from: string, to: string): Json => ({
  id: `to-${to}`, when: { event: "timer.fire", timer: "ring" }, if: [{ test: "phase", is: from }], then: [{ do: "phase.set", phase: to }],
});
const RING_SHAPE = (phase: string, radius: number, again: boolean): Json => ({
  id: `shape-${phase}`, when: { event: "phase.change", phase },
  then: [{ do: "zone.reshape", zone: "ring", radius, at: "centre", seconds: 60 }, ...(again ? [{ do: "timer.start", timer: "ring" }] : [])],
});
const BATTLE_ROYALE: Json = {
  schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: "example.battle-royale", name: "Battle royale",
  phases: ["drop", "shrink1", "shrink2", "final"],
  timers: [{ id: "ring", scope: "match", seconds: 90 }],
  items: [{ id: "rifle", grants: { kind: "weapon", ref: "m4a1" } }],
  entities: { zones: ["ring"], markers: ["centre"], spawners: ["drops", "loot"] },
  rules: [
    {
      id: "start", when: "round.start",
      then: [
        { do: "spawner.release", spawner: "drops" },
        { do: "spawner.release", spawner: "loot", item: "rifle", count: 20 },
        { do: "zone.hazard", zone: "ring", perSecond: 5, inside: false },
        { do: "timer.start", timer: "ring" },
      ],
    },
    // final-first: state changes are immediate (rules.ts's semantics), so one ring timer.fire takes one step
    RING_STEP("shrink2", "final"), RING_STEP("shrink1", "shrink2"), RING_STEP("drop", "shrink1"),
    RING_SHAPE("shrink1", 600, true), RING_SHAPE("shrink2", 300, true), RING_SHAPE("final", 50, false),
    ALL_OUT("seal", "terrorist"),
    ALL_OUT("terrorist", "seal"),
  ],
};

/** Capture the flag (FCW-34): flags as items on stands, a base zone with has-item, team-scoped captures. */
const CAPTURE = (team: "seal" | "terrorist", enemy: "seal" | "terrorist"): Json[] => [
  {
    id: `capture-${team}`, when: { event: "zone.enter", zone: `base-${team}` },
    if: [{ test: "team", who: "player", is: team }, { test: "hasItem", who: "player", item: `flag-${enemy}` }],
    then: [
      { do: "item.take", who: "player", item: `flag-${enemy}` },
      { do: "variable.add", var: "caps", team, amount: 1 },
      { do: "score.award", team, points: 1 },
      { do: "spawner.release", spawner: `stand-${enemy}`, item: `flag-${enemy}` },
      { do: "message.show", text: "Flag captured" },
    ],
  },
  {
    id: `win-${team}`, when: { event: "zone.enter", zone: `base-${team}` },
    if: [{ test: "compare", left: { var: "caps", team }, op: ">=", right: { param: "capsToWin" } }],
    then: [{ do: "round.end", winner: team }],
  },
  {
    id: `return-${team}`, when: { event: "item.pickup", item: `flag-${team}` }, if: [{ test: "team", who: "player", is: team }],
    then: [{ do: "item.take", who: "player", item: `flag-${team}` }, { do: "spawner.release", spawner: `stand-${team}`, item: `flag-${team}` }],
  },
  {
    id: `drop-${team}`, when: "player.death", if: [{ test: "hasItem", who: "victim", item: `flag-${team}` }],
    then: [{ do: "item.take", who: "victim", item: `flag-${team}` }, { do: "spawner.release", spawner: `stand-${team}`, item: `flag-${team}` }],
  },
];
const CAPTURE_THE_FLAG: Json = {
  schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: "example.ctf", name: "Capture the flag",
  config: [{ id: "capsToWin", type: "int", default: 3, min: 1, max: 10 }],
  variables: [{ id: "caps", scope: "team", type: "int", start: 0, min: 0, max: 10 }],
  items: [{ id: "flag-seal", grants: { kind: "token" } }, { id: "flag-terrorist", grants: { kind: "token" } }],
  entities: { zones: ["base-seal", "base-terrorist"], spawners: ["stand-seal", "stand-terrorist"] },
  rules: [
    { id: "place", when: "round.start", then: [{ do: "spawner.release", spawner: "stand-seal", item: "flag-seal" }, { do: "spawner.release", spawner: "stand-terrorist", item: "flag-terrorist" }] },
    ...CAPTURE("seal", "terrorist"),
    ...CAPTURE("terrorist", "seal"),
  ],
};

const PROOFS: readonly (readonly [string, Json])[] = [
  ["paintball (FCW-13)", PAINTBALL],
  ["party (FCW-14)", PARTY],
  ["zombies + shop (FCW-15)", ZOMBIES],
  ["battle royale (FCW-16)", BATTLE_ROYALE],
  ["capture the flag (FCW-34)", CAPTURE_THE_FLAG],
];

describe("the five proof experiences validate as data (spec §11, FCW-30's acceptance)", () => {
  for (const [name, spec] of PROOFS) {
    it(name, () => passes(spec));
  }
  it("each is valid JSON as a rules member would carry it (no function, no undefined)", () => {
    for (const [, spec] of PROOFS) passes(JSON.parse(JSON.stringify(spec)));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The vocabulary v0, frozen (spec §4): a change to any list is a deliberate contract change.
// ---------------------------------------------------------------------------------------------------------------------

describe("the vocabulary v0 (spec §4), frozen", () => {
  it("names its events, conditions and actions exactly", () => {
    expect(RULE_EVENTS).toStrictEqual([
      "match.start", "match.end", "round.start", "round.end", "player.spawn", "player.hit", "player.death", "player.kill",
      "player.eliminated", "npc.death", "zone.enter", "zone.exit", "interact", "item.pickup", "purchase.request",
      "purchase.accepted", "purchase.refused", "objective.change", "timer.fire", "phase.change", "spawner.empty",
    ]);
    expect(RULE_CONDITIONS).toStrictEqual(["compare", "team", "inZone", "hasItem", "alive", "phase", "chance", "any", "not"]);
    expect(RULE_ACTIONS).toStrictEqual([
      "variable.set", "variable.add", "score.award", "item.give", "item.take", "player.damage", "player.eliminate", "hit.scale",
      "purchase.accept", "purchase.refuse", "loadout.restrict", "zone.enable", "zone.disable", "zone.hazard", "zone.reshape",
      "spawner.release", "door.open", "door.close", "phase.set", "timer.start", "timer.stop", "round.end", "match.end",
      "message.show", "cue.play", "hud.value",
    ]);
    expect(PRESENTATION_ACTIONS).toStrictEqual(["message.show", "cue.play", "hud.value"]);
    for (const list of [RULE_EVENTS, RULE_CONDITIONS, RULE_ACTIONS, PRESENTATION_ACTIONS]) expect(Object.isFrozen(list)).toBe(true);
  });
  it("has its own version, a schema name and the adaptation's label", () => {
    expect(RULES_SCHEMA).toBe("s2u-rules");
    expect(RULES_VOCABULARY_VERSION).toBe(0);
    expect(RULES_ADAPTATION).toMatch(/no original/);
  });
  it("names its budgets as adaptations, each a positive whole number", () => {
    for (const n of [RULES_PER_PACK_ADAPTATION, RULE_ACTIONS_PER_EVENT_ADAPTATION, RULE_EVENTS_PER_TICK_ADAPTATION, RULE_CHAIN_DEPTH_ADAPTATION,
      RULE_VARIABLES_PER_SCOPE_ADAPTATION, RULE_TIMERS_PER_SCOPE_ADAPTATION]) {
      expect(Number.isInteger(n) && n > 0).toBe(true);
    }
  });
  it("namespaces its codes rules.*, apart from the pack framework's", () => {
    expect(Object.isFrozen(RULES_CODES)).toBe(true);
    expect(Object.values(RULES_CODES).every((c) => c.startsWith("rules."))).toBe(true);
    expect(Object.values(RULES_CODES).some((c) => (Object.values(PACK_CODES) as string[]).includes(c))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The refusals (FCW-30's RED): each by name, at validation.
// ---------------------------------------------------------------------------------------------------------------------

describe("validateRules: the minimal spec", () => {
  it("passes, and the report is a check report", () => {
    passes(minimal());
    const report = validateRules(minimal(), CATALOGUE);
    expect(report).toMatchObject({ schema: "s2u.creator/check-report", version: 1, status: "pass", diagnostics: [] });
  });
  it("is not a spec: not an object, another schema, another vocabulary version", () => {
    refusedBy(null, RULES_CODES.schema);
    refusedBy([], RULES_CODES.schema);
    refusedBy(minimal({ schema: "s2u-mission" }), RULES_CODES.schema, "s2u-mission", "schema");
    refusedBy(minimal({ vocabulary: RULES_VOCABULARY_VERSION + 1 }), RULES_CODES.vocabulary, String(RULES_VOCABULARY_VERSION + 1), "vocabulary");
  });
});

describe("validateRules: unknown names", () => {
  it("refuses an unknown event by name", () => {
    refusedBy(withRule({ id: "r", when: "player.teleport", then: [{ do: "message.show", text: "x" }] }), RULES_CODES.eventUnknown, "player.teleport", "rules[0].when");
    refusedBy(withRule({ id: "r", when: { event: "zone.hover", zone: "a" }, then: [{ do: "message.show", text: "x" }] }), RULES_CODES.eventUnknown, "zone.hover", "rules[0].when.event");
  });
  it("refuses an unknown condition by name", () => {
    refusedBy(withRule({ id: "r", when: "round.start", if: [{ test: "weather", is: "rain" }], then: [{ do: "message.show", text: "x" }] }), RULES_CODES.conditionUnknown, "weather", "rules[0].if[0].test");
    const nested = { test: "not", of: { test: "any", of: [{ test: "moon" }] } };
    refusedBy(withRule({ id: "r", when: "round.start", if: [nested], then: [{ do: "message.show", text: "x" }] }), RULES_CODES.conditionUnknown, "moon", "rules[0].if[0].of.of[0].test");
  });
  it("refuses an unknown action by name", () => {
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "player.fly", who: "player" }] }), RULES_CODES.actionUnknown, "player.fly", "rules[0].then[0].do");
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "message.show", text: "x" }], else: [{ do: "eval" }] }), RULES_CODES.actionUnknown, "eval", "rules[0].else[0].do");
  });
  it("refuses an unknown field at any level", () => {
    refusedBy(minimal({ extra: 1 }), RULES_CODES.fieldUnknown, undefined, "extra");
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "message.show", text: "x", colour: "red" }] }), RULES_CODES.fieldUnknown, undefined, "rules[0].then[0].colour");
    refusedBy(minimal({ variables: [{ id: "v", scope: "match", type: "int", start: 0, min: 0, max: 1, note: "x" }] }), RULES_CODES.fieldUnknown, undefined, "variables[0].note");
  });
});

describe("validateRules: fields of the wrong type, and missing fields", () => {
  it("refuses a field of the wrong type by name", () => {
    refusedBy(withRule({ id: 5, when: "round.start", then: [{ do: "message.show", text: "x" }] }), RULES_CODES.fieldType, undefined, "rules[0].id");
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "zone.hazard", zone: "z", perSecond: "lots", inside: true }] }, { entities: { zones: ["z"] } }), RULES_CODES.fieldType, undefined, "rules[0].then[0].perSecond");
    refusedBy(minimal({ variables: [{ id: "v", scope: "match", type: "int", start: "zero", min: 0, max: 1 }] }), RULES_CODES.fieldType, undefined, "variables[0].start");
    refusedBy(minimal({ rules: {} }), RULES_CODES.fieldType, undefined, "rules");
    refusedBy(minimal({ variables: [{ id: "v", scope: "galaxy", type: "int", start: 0, min: 0, max: 1 }] }), RULES_CODES.fieldType, "galaxy", "variables[0].scope");
  });
  it("refuses a missing required field by name", () => {
    refusedBy(withRule({ id: "r", when: "round.start" }), RULES_CODES.fieldMissing, undefined, "rules[0].then");
    refusedBy(withRule({ id: "r", when: "player.kill", then: [{ do: "variable.add", who: "attacker", amount: 1 }] }), RULES_CODES.fieldMissing, undefined, "rules[0].then[0].var");
    const { id: _id, ...noId } = minimal();
    refusedBy(noId, RULES_CODES.fieldMissing, undefined, "id");
    refusedBy(minimal({ variables: [{ id: "v", scope: "match", type: "int", start: 0 }] }), RULES_CODES.fieldMissing, undefined, "variables[0].min");
  });
});

describe("validateRules: ownership (spec §5) -- an outcome is never client-side", () => {
  it("admits the presentation actions in a client rule", () => {
    passes(withRule({ id: "r", side: "client", when: "player.kill", then: [{ do: "message.show", text: "Kill" }, { do: "cue.play", cue: "ding" }, { do: "hud.value", var: "kills", label: "Kills" }] }));
  });
  it("refuses an outcome action placed client-side, by name", () => {
    for (const action of [
      { do: "score.award", who: "attacker", points: 1 },
      { do: "variable.add", var: "kills", who: "attacker", amount: 1 },
      { do: "round.end", winner: "seal" },
      { do: "player.eliminate", who: "victim" },
    ]) {
      refusedBy(withRule({ id: "r", side: "client", when: "player.kill", then: [action] }), RULES_CODES.actionSide, action.do as string, "rules[0].then[0].do");
    }
  });
  it("refuses an action outside the event it answers", () => {
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "hit.scale", factor: 2 }] }), RULES_CODES.actionEvent, "hit.scale", "rules[0].then[0].do");
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "purchase.accept" }] }), RULES_CODES.actionEvent, "purchase.accept", "rules[0].then[0].do");
  });
});

describe("validateRules: budgets (spec §6, *_ADAPTATION)", () => {
  // spread over the events so the rules bound is the only one met (the GREEN's harness correction: all on round.start
  // also passed the actions-per-event bound)
  const say = (i: number): Json => ({ id: `r${i}`, when: RULE_EVENTS[i % RULE_EVENTS.length], then: [{ do: "message.show", text: "x" }] });
  it("refuses more rules than a pack may hold", () => {
    passes(minimal({ rules: Array.from({ length: RULES_PER_PACK_ADAPTATION }, (_, i) => say(i)) }));
    refusedBy(minimal({ rules: Array.from({ length: RULES_PER_PACK_ADAPTATION + 1 }, (_, i) => say(i)) }), RULES_CODES.budget, String(RULES_PER_PACK_ADAPTATION + 1), "rules");
  });
  it("refuses more actions on one event than its bound, across the rules on it", () => {
    const half = Math.ceil((RULE_ACTIONS_PER_EVENT_ADAPTATION + 1) / 2);
    const many = (id: string): Json => ({ id, when: "round.start", then: Array.from({ length: half }, () => ({ do: "message.show", text: "x" })) });
    refusedBy(minimal({ rules: [many("a"), many("b")] }), RULES_CODES.budget, "round.start");
  });
  it("refuses more variables, or timers, in one scope than its bound", () => {
    const vars = Array.from({ length: RULE_VARIABLES_PER_SCOPE_ADAPTATION + 1 }, (_, i) => ({ id: `v${i}`, scope: "team", type: "bool", start: false }));
    refusedBy(minimal({ variables: [...(minimal().variables as Json[]), ...vars] }), RULES_CODES.budget, "team", "variables");
    const timers = Array.from({ length: RULE_TIMERS_PER_SCOPE_ADAPTATION + 1 }, (_, i) => ({ id: `t${i}`, scope: "match", seconds: 10 }));
    refusedBy(minimal({ timers }), RULES_CODES.budget, "match", "timers");
    const fine = Array.from({ length: RULE_TIMERS_PER_SCOPE_ADAPTATION }, (_, i) => ({ id: `t${i}`, scope: "match", seconds: 10 }));
    passes(minimal({ timers: fine }));
  });
  it("refuses a rule chain deeper than its bound", () => {
    const n = RULE_CHAIN_DEPTH_ADAPTATION + 1;
    const phases = Array.from({ length: n + 1 }, (_, i) => `p${i}`);
    const chain = (len: number): Json[] => [
      { id: "kick", when: "round.start", then: [{ do: "phase.set", phase: "p1" }] },
      ...Array.from({ length: len - 1 }, (_, i) => ({ id: `step${i + 1}`, when: { event: "phase.change", phase: `p${i + 1}` }, then: [{ do: "phase.set", phase: `p${i + 2}` }] })),
    ];
    passes(minimal({ phases, rules: chain(RULE_CHAIN_DEPTH_ADAPTATION) }));
    refusedBy(minimal({ phases, rules: chain(n) }), RULES_CODES.chainDepth, undefined, "rules[0]");
  });
  it("refuses a chain past the bound by a cycle, naming its rules", () => {
    const spec = minimal({
      phases: ["a", "b"],
      rules: [
        { id: "ping", when: { event: "phase.change", phase: "a" }, then: [{ do: "phase.set", phase: "b" }] },
        { id: "pong", when: { event: "phase.change", phase: "b" }, then: [{ do: "phase.set", phase: "a" }] },
      ],
    });
    refusedBy(spec, RULES_CODES.chainDepth);
    const d = validateRules(spec, CATALOGUE).diagnostics.find((x) => x.code === RULES_CODES.chainDepth)!;
    expect(d.actual).toMatch(/ping/);
    expect(d.actual).toMatch(/pong/);
    // a self-loop: an elimination rule that eliminates again on the same event
    refusedBy(withRule({ id: "again", when: "player.eliminated", then: [{ do: "player.eliminate", who: "player" }] }), RULES_CODES.chainDepth, "again -> again");
  });
});

describe("validateRules: state -- scope, type and declaration", () => {
  it("refuses a variable of the wrong scope for its use", () => {
    // a player-scoped variable with no player named
    refusedBy(withRule({ id: "r", when: "player.kill", then: [{ do: "variable.add", var: "kills", amount: 1 }] }), RULES_CODES.scope, "kills", "rules[0].then[0].var");
    // a match-scoped variable named for a player
    refusedBy(minimal({ variables: [{ id: "total", scope: "match", type: "int", start: 0, min: 0, max: 9 }], rules: [{ id: "r", when: "player.kill", then: [{ do: "variable.add", var: "total", who: "attacker", amount: 1 }] }] }), RULES_CODES.scope, "total");
    // a team-scoped variable with no team
    refusedBy(minimal({ variables: [{ id: "caps", scope: "team", type: "int", start: 0, min: 0, max: 9 }], rules: [{ id: "r", when: "round.start", then: [{ do: "variable.add", var: "caps", amount: 1 }] }] }), RULES_CODES.scope, "caps");
    // the currency of a shop is a player's
    refusedBy(minimal({
      variables: [{ id: "bank", scope: "match", type: "int", start: 0, min: 0, max: 9 }],
      items: [{ id: "gun", grants: { kind: "token" }, price: 1, stock: 1, currency: "bank" }],
      rules: [{ id: "r", when: "purchase.request", then: [{ do: "purchase.accept" }] }],
    }), RULES_CODES.scope, "bank", "items[0].currency");
  });
  it("refuses a player the event does not carry", () => {
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "variable.add", var: "kills", who: "attacker", amount: 1 }] }), RULES_CODES.subject, "attacker", "rules[0].then[0].who");
  });
  it("refuses a variable of the wrong type for its use", () => {
    const flags = [{ id: "armed", scope: "match", type: "bool", start: false }, { id: "mood", scope: "match", type: "enum", values: ["calm", "angry"], start: "calm" }];
    refusedBy(minimal({ variables: flags, rules: [{ id: "r", when: "round.start", then: [{ do: "variable.add", var: "armed", amount: 1 }] }] }), RULES_CODES.type, "armed");
    refusedBy(minimal({ variables: flags, rules: [{ id: "r", when: "round.start", if: [{ test: "compare", left: { var: "armed" }, op: "<", right: 3 }], then: [{ do: "message.show", text: "x" }] }] }), RULES_CODES.type);
    refusedBy(minimal({ variables: flags, rules: [{ id: "r", when: "round.start", then: [{ do: "variable.set", var: "mood", value: "sleepy" }] }] }), RULES_CODES.type, "sleepy");
    refusedBy(minimal({ variables: [{ id: "v", scope: "match", type: "int", start: 50, min: 0, max: 10 }] }), RULES_CODES.type, "50", "variables[0].start");
  });
  it("refuses a reference to an undeclared variable, timer, phase, zone, marker, spawner or item", () => {
    const say = { do: "message.show", text: "x" };
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "variable.set", var: "ghost", value: 1 }] }), RULES_CODES.referenceUnknown, "ghost");
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "timer.start", timer: "clock" }] }), RULES_CODES.referenceUnknown, "clock");
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "phase.set", phase: "overtime" }] }), RULES_CODES.referenceUnknown, "overtime");
    refusedBy(withRule({ id: "r", when: { event: "zone.enter", zone: "vault" }, then: [say] }), RULES_CODES.referenceUnknown, "vault", "rules[0].when.zone");
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "zone.reshape", zone: "ring", radius: 10, at: "middle", seconds: 5 }] }, { entities: { zones: ["ring"] } }), RULES_CODES.referenceUnknown, "middle");
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "spawner.release", spawner: "horde" }] }), RULES_CODES.referenceUnknown, "horde");
    refusedBy(withRule({ id: "r", when: "player.kill", then: [{ do: "item.give", who: "attacker", item: "medal" }] }), RULES_CODES.referenceUnknown, "medal");
    refusedBy(withRule({ id: "r", when: "round.start", if: [{ test: "phase", is: "warmup" }], then: [say] }), RULES_CODES.referenceUnknown, "warmup");
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "door.open", door: "vault-door" }] }), RULES_CODES.referenceUnknown, "vault-door");
    refusedBy(withRule({ id: "r", when: "round.start", if: [{ test: "compare", left: { param: "speed" }, op: ">", right: 1 }], then: [say] }), RULES_CODES.referenceUnknown, "speed");
    refusedBy(withRule({ id: "r", when: "round.start", if: [{ test: "compare", left: { field: "amount" }, op: ">", right: 1 }], then: [say] }), RULES_CODES.referenceUnknown, "amount");
  });
  it("refuses an id declared twice", () => {
    refusedBy(minimal({ rules: [{ id: "r", when: "round.start", then: [{ do: "message.show", text: "x" }] }, { id: "r", when: "round.end", then: [{ do: "message.show", text: "y" }] }] }), RULES_CODES.duplicateId, "r");
  });
  it("refuses a layout entity the layout does not hold, when the catalogue names the layout's", () => {
    const spec = withRule({ id: "r", when: { event: "zone.enter", zone: "vault" }, then: [{ do: "message.show", text: "x" }] }, { entities: { zones: ["vault"] } });
    passes(spec);
    passes(spec, rulesCatalogue({ slots: [NPC_SLOT], capabilities: [PATROL], layout: { zones: ["vault"], markers: [], spawners: [] } }));
    refusedBy(spec, RULES_CODES.entityMissing, "vault", "entities.zones[0]", rulesCatalogue({ slots: [NPC_SLOT], capabilities: [PATROL], layout: { zones: ["lobby"], markers: [], spawners: [] } }));
  });
  it("names a missing entity in the singular -- a switch as a switch (FCW-32: it read \"switche\")", () => {
    const texts = validateRules(minimal({ entities: { zones: ["z1"], markers: ["m1"], spawners: ["s1"], doors: ["d1"], switches: ["valve_z"] } }),
      rulesCatalogue({ slots: [NPC_SLOT], capabilities: [PATROL], layout: { zones: [], markers: [], spawners: [] }, doors: [], switches: [] }))
      .diagnostics.filter((d) => d.code === RULES_CODES.entityMissing).map((d) => d.text);
    expect(texts).toEqual(["The layout has no zone z1.", "The layout has no marker m1.", "The layout has no spawner s1.",
      "The layout has no door d1.", "The layout has no switch valve_z."]);
  });
});

describe("validateRules: purchases (spec §5)", () => {
  it("refuses an item without a price or stock used in a purchase rule", () => {
    const spec = (item: Json): Json => minimal({
      variables: [{ id: "cash", scope: "player", type: "int", start: 0, min: 0, max: 9999 }],
      items: [item],
      rules: [{ id: "buy", when: { event: "purchase.request", item: "gun" }, then: [{ do: "purchase.accept" }] }],
    });
    passes(spec({ id: "gun", grants: { kind: "weapon", ref: "m4a1" }, price: 100, stock: 5, currency: "cash" }));
    refusedBy(spec({ id: "gun", grants: { kind: "weapon", ref: "m4a1" } }), RULES_CODES.itemNotForSale, "gun", "rules[0].when.item");
    refusedBy(spec({ id: "gun", grants: { kind: "weapon", ref: "m4a1" }, price: 100, currency: "cash" }), RULES_CODES.fieldMissing, undefined, "items[0].stock");
    // a purchase rule with no item filter answers for every item: each one must be for sale
    refusedBy(minimal({
      variables: [{ id: "cash", scope: "player", type: "int", start: 0, min: 0, max: 9999 }],
      items: [{ id: "gun", grants: { kind: "token" }, price: 1, stock: 1, currency: "cash" }, { id: "flag", grants: { kind: "token" } }],
      rules: [{ id: "buy", when: "purchase.request", then: [{ do: "purchase.accept" }] }],
    }), RULES_CODES.itemNotForSale, "flag");
  });
});

describe("validateRules: no pack code (H272; spec §10)", () => {
  it("refuses any string the pack framework's EXTERNAL_URI refuses", () => {
    for (const text of ["see https://example.com", "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd"]) {
      refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "message.show", text }] }), PACK_CODES.externalUri, undefined, "rules[0].then[0].text");
    }
  });
  it("refuses a script member or a code field", () => {
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "cue.play", cue: "boot.js" }] }), RULES_CODES.code, "boot.js");
    refusedBy(minimal({ script: "return 1" }), RULES_CODES.code, undefined, "script");
    refusedBy(withRule({ id: "r", when: "round.start", code: "x()", then: [{ do: "message.show", text: "x" }] }), RULES_CODES.code, undefined, "rules[0].code");
  });
  it("refuses a behaviour claim for an unknown capability, and a brain not claimed", () => {
    refusedBy(minimal({ capabilities: [{ slot: "behaviour.npc", handler: "behaviour.npc.telepath" }] }), PACK_CODES.handlerUnknown, "behaviour.npc.telepath", "capabilities[0].handler");
    refusedBy(minimal({ capabilities: [{ slot: "behaviour.weather", handler: "behaviour.weather.rain" }] }), PACK_CODES.handlerUnknown, "behaviour.weather", "capabilities[0].slot");
    refusedBy(withRule({ id: "r", when: "round.start", then: [{ do: "spawner.release", spawner: "s", brain: "behaviour.npc.patrol" }] }, { entities: { spawners: ["s"] } }), RULES_CODES.referenceUnknown, "behaviour.npc.patrol");
  });
});

describe("validateRules: configuration (level 1)", () => {
  it("refuses a parameter whose default is outside its bounds or of the wrong type", () => {
    refusedBy(minimal({ config: [{ id: "n", type: "int", default: 20, min: 1, max: 10 }] }), RULES_CODES.type, "20", "config[0].default");
    refusedBy(minimal({ config: [{ id: "b", type: "bool", default: 1 }] }), RULES_CODES.fieldType, undefined, "config[0].default");
    refusedBy(minimal({ config: [{ id: "e", type: "enum", values: ["a", "b"], default: "c" }] }), RULES_CODES.type, "c", "config[0].default");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Compatibility (step 5): ENGINE_CONTRACT_VERSION 0.1.1 is additive (the patch, under caret SemVer); a v2 pack without
// rules validates as before.
// ---------------------------------------------------------------------------------------------------------------------

describe("the engine contract 0.1.1 (additive)", () => {
  const enc = new TextEncoder();
  const hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
  const pack = (contract: string, members: readonly { path: string; role: string; text: string }[], kinds: string[], intent: string) => {
    const files = members.map((m) => ({ path: m.path, bytes: enc.encode(m.text) }));
    const manifest = {
      format: "s2u-pack", formatVersion: 2, id: "example.pack", version: "1.0.0", name: "Example", target: PACK_TARGET_US, contract,
      kinds, sides: "both", dependencies: [], files: files.map((f, i) => ({ path: f.path, sha256: hex(f.bytes), size: f.bytes.length, role: members[i]!.role })),
      intents: [{ kind: intent, files: files.map((f) => f.path) }],
    };
    return [{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(manifest)) }, ...files];
  };
  const context = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION, packs: [], handlers: [] };
  it("is 0.1.1", () => {
    expect(ENGINE_CONTRACT_VERSION).toBe("0.1.1");
  });
  it("admits every 0.1.x range, the caret one included; a rules pack's ^0.1.1 refuses a 0.1.0 engine", () => {
    for (const range of ["^0.1.0", ">=0.1.0", ">=0.1.0 <1.0.0", "*", "^0.1.1"]) expect(satisfiesRange(ENGINE_CONTRACT_VERSION, range), range).toBe(true);
    // the repository's semver (`semver.ts`: `^0.y.z` fixes the minor): an additive 0.x change is the patch
    expect(satisfiesRange("0.1.0", "^0.1.1")).toBe(false);
  });
  it("validates a v2 content pack without rules as before", async () => {
    const v = await validatePack(pack(">=0.1.0", [{ path: "maps/yard.json", role: "gameplay", text: "{}" }], ["content"], "gameplay-value"), context);
    expect(v.report.diagnostics).toEqual([]);
    expect(v.ok).toBe(true);
  });
  it("validates a rules pack whose member is a proof experience, and the member validates as rules", async () => {
    const text = JSON.stringify(PAINTBALL);
    const v = await validatePack(pack("^0.1.1", [{ path: "rules/paintball.json", role: "rules", text }], ["rules"], "new-behaviour"), context);
    expect(v.report.diagnostics).toEqual([]);
    expect(v.ok).toBe(true);
    passes(JSON.parse(text));
  });
  // FCW-30's review F4 (FCW-33): "a rules pack states ^0.1.1" is enforced -- its range admits no engine before 0.1.1.
  it("refuses a rules pack whose contract range admits an engine before 0.1.1, by name", async () => {
    const text = JSON.stringify(PAINTBALL);
    for (const range of [">=0.1.0", "*", "^0.1.0", ">0.1.0", "<0.2.0", "^0.1.1 || ^0.1.0", ">=0.1.1-rc.1"]) {
      const v = await validatePack(pack(range, [{ path: "rules/paintball.json", role: "rules", text }], ["rules"], "new-behaviour"), context);
      expect(v.ok, range).toBe(false);
      expect(v.report.diagnostics.map((d) => [d.code, d.field]), range).toEqual([[PACK_CODES.contractFloor, "contract"]]);
    }
  });
  it("admits every rules-pack range whose every alternative holds a floor at 0.1.1 or above", async () => {
    const text = JSON.stringify(PAINTBALL);
    for (const range of ["^0.1.1", ">=0.1.1", ">=0.1.1 <1.0.0", "~0.1.1", "0.1.1", "=0.1.1", ">=0.1.0 >=0.1.1", "^0.1.1 || >=0.2.0"]) {
      const v = await validatePack(pack(range, [{ path: "rules/paintball.json", role: "rules", text }], ["rules"], "new-behaviour"), context);
      expect(v.report.diagnostics, range).toEqual([]);
    }
  });
  it("leaves a content or system pack's range as it was: >=0.1.0 still validates without rules", async () => {
    const v = await validatePack(pack(">=0.1.0", [{ path: "systems/sky.json", role: "system", text: "{}" }], ["system"], "cosmetic"), context);
    expect(v.report.diagnostics).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// FCW-30's review F4 (FCW-33): a pack's handler claims and its rules members' `RulesSpec.capabilities` agree.
// ---------------------------------------------------------------------------------------------------------------------

describe("a rules pack's handler claims agree with its RulesSpec.capabilities", () => {
  const enc = new TextEncoder();
  const hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
  const SENTRY: PackHandlerCapability = { ...PATROL, id: "behaviour.npc.sentry" };
  const TINT: PackHandlerCapability = { id: "visual.post.tint", slot: "visual.post", actions: ["install", "enable", "disable", "dispose"] };
  const context = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION, packs: [], handlers: [PATROL, SENTRY, TINT] };
  const rulesPack = (handlers: readonly object[] | undefined, text: string = JSON.stringify(ZOMBIES)) => {
    const bytes = enc.encode(text);
    const manifest = {
      format: "s2u-pack", formatVersion: 2, id: "example.zombies", version: "1.0.0", name: "Zombies", target: PACK_TARGET_US, contract: "^0.1.1",
      kinds: ["rules"], sides: "server", dependencies: [], files: [{ path: "rules/zombies.json", sha256: hex(bytes), size: bytes.length, role: "rules" }],
      intents: [{ kind: "new-behaviour", files: ["rules/zombies.json"] }], ...(handlers ? { handlers } : {}),
    };
    return [{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(manifest)) }, { path: "rules/zombies.json", bytes }];
  };
  const found = async (files: { path: string; bytes: Uint8Array }[]) => (await validatePack(files, context)).report.diagnostics.map((d) => [d.code, d.file ?? d.field, d.actual]);
  it("passes when the manifest claims exactly the capability the spec names", async () => {
    const v = await validatePack(rulesPack([{ slot: "behaviour.npc", handler: "behaviour.npc.patrol" }]), context);
    expect(v.report.diagnostics).toEqual([]);
    expect(v.ok).toBe(true);
  });
  it("refuses a capability the manifest does not claim", async () => {
    expect(await found(rulesPack(undefined))).toEqual([[PACK_CODES.capabilityMismatch, "rules/zombies.json", "behaviour.npc.patrol"]]);
  });
  it("refuses a behaviour claim no rules member names, and a claim on the slot with another handler", async () => {
    expect(await found(rulesPack([{ slot: "behaviour.npc", handler: "behaviour.npc.sentry" }]))).toEqual([
      [PACK_CODES.capabilityMismatch, "rules/zombies.json", "behaviour.npc.patrol"],
      [PACK_CODES.capabilityMismatch, "handlers[0]", "behaviour.npc.sentry"],
    ]);
  });
  it("refuses a capability's action the claim does not list", async () => {
    const text = JSON.stringify({ ...ZOMBIES, capabilities: [{ slot: "behaviour.npc", handler: "behaviour.npc.patrol", actions: ["enable"] }] });
    expect(await found(rulesPack([{ slot: "behaviour.npc", handler: "behaviour.npc.patrol", actions: ["install"] }], text))).toEqual([
      [PACK_CODES.capabilityMismatch, "rules/zombies.json", "behaviour.npc.patrol"],
    ]);
    expect(await found(rulesPack([{ slot: "behaviour.npc", handler: "behaviour.npc.patrol", actions: ["install", "enable"] }], text))).toEqual([]);
  });
  it("leaves a claim outside the behaviour family to the manifest (presentation needs no rules member)", async () => {
    expect(await found(rulesPack([{ slot: "behaviour.npc", handler: "behaviour.npc.patrol" }, { slot: "visual.post", handler: "visual.post.tint" }]))).toEqual([]);
  });
  it("refuses a rules member that is not a UTF-8 JSON object, or whose capabilities are not a list of claims", async () => {
    expect(await found(rulesPack(undefined, "not json"))).toEqual([[PACK_CODES.rulesMemberInvalid, "rules/zombies.json", undefined]]);
    expect(await found(rulesPack(undefined, JSON.stringify({ ...ZOMBIES, capabilities: {} })))).toEqual([[PACK_CODES.rulesMemberInvalid, "rules/zombies.json", undefined]]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The behaviour slot family as the validator's default catalogue (FCW-30's slot-family step).
// ---------------------------------------------------------------------------------------------------------------------

describe("the default catalogue: the behaviour slot family", () => {
  it("is the vocabulary with BEHAVIOUR_SLOTS and the available capabilities", () => {
    const c = rulesCatalogue();
    expect(c.vocabulary).toBe(RULES_VOCABULARY_VERSION);
    expect(c.slots).toEqual(BEHAVIOUR_SLOTS);
    expect(c.capabilities).toEqual(behaviourCatalogue());
  });
  it("validates the five proof experiences", () => {
    for (const [, spec] of PROOFS) passes(spec, rulesCatalogue());
  });
  it("admits a claim on the bomb authority, an NPC brain or both brains", () => {
    passes(minimal({ capabilities: [{ slot: "behaviour.bomb", handler: "behaviour.bomb.authority" }] }), rulesCatalogue());
    passes(minimal({ capabilities: [{ slot: "behaviour.npc", handler: "behaviour.npc.patrol" }, { slot: "behaviour.npc", handler: "behaviour.npc.sentry" }] }), rulesCatalogue());
  });
  it("refuses a reserved capability by name, saying what it waits for", () => {
    const spec = minimal({ capabilities: [{ slot: "behaviour.zombie", handler: "behaviour.zombie.chase-melee" }] });
    refusedBy(spec, RULES_CODES.capabilityReserved, "behaviour.zombie.chase-melee", "capabilities[0].handler", rulesCatalogue());
    expect(validateRules(spec, rulesCatalogue()).diagnostics.find((d) => d.code === RULES_CODES.capabilityReserved)!.text).toMatch(/FCW-15\/FCW-31/);
    refusedBy(minimal({ capabilities: [{ slot: "visual.post", handler: "visual.post.tint" }] }), PACK_CODES.handlerUnknown, "visual.post", "capabilities[0].slot", rulesCatalogue());
  });
});

// The review's F1 (2026-10-27): the semantics say state changes are immediate, and the examples are ordered for it.
describe("rule order under immediate state (FCW-30's review F1)", () => {
  const ids = (spec: Json): string[] => ((spec as { rules: { id: string }[] }).rules).map((r) => r.id);
  it("the semantics header states immediate visibility", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/rules.ts", import.meta.url), "utf8");
    expect(src).toMatch(/State changes are immediate: a later rule on the same event sees what an earlier rule's actions changed/);
  });
  it("paintball counts the hit before the rule that reads the count (one hit can put a player out)", () => {
    const r = ids(PAINTBALL);
    expect(r.indexOf("hit")).toBeGreaterThanOrEqual(0);
    expect(r.indexOf("hit")).toBeLessThan(r.indexOf("out"));
  });
  it("battle royale's ring steps are final-first, so one timer.fire takes one step", () => {
    const steps = ids(BATTLE_ROYALE).filter((id) => id.startsWith("to-"));
    expect(steps).toEqual(["to-final", "to-shrink2", "to-shrink1"]);
  });
});
