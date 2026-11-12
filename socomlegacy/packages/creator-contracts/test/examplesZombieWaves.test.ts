import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  behaviourCatalogue, ENGINE_CONTRACT_VERSION, forgeModeChoices, layoutEntityIds, PACK_CODES, PACK_TARGET_US, packDigest,
  RULE_ACTIONS, RULE_EVENTS, RULES_CODES, rulesCatalogue, rulesModeCatalogue, sha256Hex, validatePack, validateRules,
  type PackManifest, type RulesSpec,
} from "../src/index.js";

/**
 * Issue #766, the first piece (product track, OT.R53): zombie waves as an example rules pack
 * (`examples/zombie-waves/`), copied from the paintball example and kept on the published vocabulary. Waves are
 * phases, a rest timer and one NPC spawner. The brain is `behaviour.npc.patrol`. The chase brain is not claimed.
 *
 * The scripted runs are data here. `forge.rules.test` runs them in the viewer's `test/forge/zombieWavesExample.test.ts`.
 */

const DIR = fileURLToPath(new URL("../examples/zombie-waves/", import.meta.url));
const RUN = fileURLToPath(new URL("../examples/zombie-waves.run.json", import.meta.url));
const bytesOf = (path: string): Uint8Array => new Uint8Array(readFileSync(DIR + path));
const textOf = (path: string): string => readFileSync(DIR + path, "utf8");

type Tick = { readonly events?: readonly { readonly name: string }[] };
interface Expectation {
  readonly fired: readonly string[];
  readonly messages: readonly string[];
  readonly phase: string;
  readonly wave: number;
  readonly left: number;
  readonly cash: number;
  readonly awards: number;
  readonly winner: "seal" | null;
  readonly releases: number;
}
interface WaveRun {
  readonly layout: { readonly base: { readonly kind: string; readonly archive: string }; readonly spawners: readonly { readonly id: string }[] };
  readonly script: { readonly players: readonly { id: number; team: string }[]; readonly ticks: readonly Tick[] };
  readonly expect: Expectation;
  readonly wipe: { readonly script: { readonly ticks: readonly Tick[] }; readonly expect: Expectation };
}
const run = (): WaveRun => JSON.parse(readFileSync(RUN, "utf8")) as WaveRun;
const spec = (): RulesSpec => JSON.parse(textOf("rules/waves.json")) as RulesSpec;
const manifest = (): PackManifest => JSON.parse(textOf("s2u-pack.json")) as PackManifest;
const packFiles = () => [{ path: "s2u-pack.json", bytes: bytesOf("s2u-pack.json") }, { path: "rules/waves.json", bytes: bytesOf("rules/waves.json") }];
const context = () => ({ target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION, packs: [], archives: {}, handlers: behaviourCatalogue() });
const floor = () => rulesCatalogue({ layout: layoutEntityIds({ spawners: [{ id: "horde" }] }) });

describe("issue #766: the zombie-wave example's manifest", () => {
  it("validates as a v2 rules pack: kind rules, contract ^0.1.1, one patrol claim, no chase brain", async () => {
    const checked = await validatePack(packFiles(), context());
    expect(checked.report.diagnostics).toEqual([]);
    expect(checked.report.status).toBe("pass");
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.ref.id).toBe("example.zombie-waves");
    expect(checked.ref.version).toBe("1.0.0");
    expect(checked.manifest.kinds).toEqual(["rules"]);
    expect(checked.manifest.sides).toBe("server");
    expect(checked.manifest.contract).toBe("^0.1.1");
    expect(checked.manifest.handlers).toEqual([{ slot: "behaviour.npc", handler: "behaviour.npc.patrol" }]);
    expect(JSON.stringify(checked.manifest)).not.toContain("chase-melee");
    expect(checked.manifest.intents).toEqual([{ kind: "new-behaviour", files: ["rules/waves.json"] }]);
  });

  it("the member row is the member: its sha256 and size", async () => {
    const row = manifest().files.find((f) => f.path === "rules/waves.json");
    expect(row?.role).toBe("rules");
    expect(row?.size).toBe(bytesOf("rules/waves.json").length);
    expect(row?.sha256).toBe(await sha256Hex(bytesOf("rules/waves.json")));
  });

  it("its digest seals and is stable, and the README beside it is outside the identity", async () => {
    const checked = await validatePack(packFiles(), context());
    if (!checked.ok) throw new Error(JSON.stringify(checked.report));
    expect(checked.ref.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await packDigest(manifest())).toBe(checked.ref.hash);
    expect(await packDigest(manifest())).toBe(checked.ref.hash);
    const withReadme = await validatePack([...packFiles(), { path: "README.md", bytes: bytesOf("README.md") }], context());
    expect(withReadme.ok && withReadme.ref).toEqual(checked.ref);
  });

  it("one changed byte of the rules member is refused MEMBER_HASH_MISMATCH", async () => {
    const changed = bytesOf("rules/waves.json").slice();
    const at = changed.indexOf(0x34); // the first "4", wave 1's default size
    expect(at).toBeGreaterThan(0);
    changed[at] = 0x35;
    const checked = await validatePack([packFiles()[0]!, { path: "rules/waves.json", bytes: changed }], context());
    expect(checked.ok).toBe(false);
    expect(checked.report.diagnostics.map((d) => d.code)).toContain(PACK_CODES.memberHashMismatch);
  });
});

describe("issue #766: the zombie-wave RulesSpec", () => {
  it("validates against a layout that places the horde, and is refused when that spawner is absent", () => {
    const report = validateRules(spec(), floor());
    expect(report.diagnostics).toEqual([]);
    expect(report.status).toBe("pass");
    const missing = validateRules(spec(), rulesCatalogue({ layout: layoutEntityIds({}) }));
    expect(missing.status).toBe("fail");
    expect(missing.diagnostics.map((d) => d.code)).toContain(RULES_CODES.entityMissing);
  });

  it("uses phases, a timer and the spawner, and claims only the patrol brain", () => {
    const s = spec();
    const actions = new Set<string>(), events = new Set<string>();
    for (const rule of s.rules) {
      const event = typeof rule.when === "string" ? rule.when : rule.when.event;
      expect(RULE_EVENTS).toContain(event);
      events.add(event);
      for (const a of [...rule.then, ...(rule.else ?? [])]) { expect(RULE_ACTIONS).toContain(a.do); actions.add(a.do); }
    }
    for (const e of ["round.start", "npc.death", "spawner.empty", "timer.fire", "player.eliminated"]) expect(events).toContain(e);
    for (const a of ["spawner.release", "phase.set", "timer.start", "variable.add", "score.award", "hud.value", "message.show", "round.end"]) expect(actions).toContain(a);
    expect(s.phases).toEqual(["wave-1", "rest-1", "wave-2", "rest-2", "wave-3", "cleared"]);
    expect(s.timers).toEqual([{ id: "rest", scope: "match", seconds: 10, reset: "round" }]);
    expect(s.entities).toEqual({ spawners: ["horde"] });
    expect(s.capabilities).toEqual([{ slot: "behaviour.npc", handler: "behaviour.npc.patrol" }]);
    const released = s.rules.flatMap((r) => r.then).filter((a) => a.do === "spawner.release");
    expect(released).toHaveLength(3);
    for (const a of released) expect(a["brain"]).toBe("behaviour.npc.patrol");
    expect(JSON.stringify(s)).not.toContain("chase-melee");
    expect(JSON.stringify(s)).not.toContain("behaviour.zombie");
  });

  it("the wave sizes are 4, 7 and 10, the rest is ten seconds, and a kill pays cash and a point", () => {
    const config = spec().config ?? [];
    expect(config.map((c) => [c.id, c.default])).toEqual([["wave1", 4], ["wave2", 7], ["wave3", 10], ["bounty", 100], ["points", 1]]);
    const ids = spec().rules.map((r) => r.id);
    expect(ids).toEqual(["open-1", "bounty", "clear-1", "open-2", "clear-2", "open-3", "clear-3", "wiped"]);
    const bounty = spec().rules.find((r) => r.id === "bounty")!;
    expect(bounty.then.map((a) => a.do)).toEqual(["variable.add", "score.award", "variable.add", "hud.value"]);
    expect(spec().rules.find((r) => r.id === "clear-3")!.then.map((a) => a.do)).toEqual(["phase.set", "message.show", "round.end"]);
    expect(spec().rules.find((r) => r.id === "wiped")!.then).toContainEqual({ do: "round.end", winner: "none" });
  });

  it("is a Forge mode, and a chase claim is reserved", () => {
    const catalogue = rulesModeCatalogue([{ ref: { id: "example.zombie-waves", version: "1.0.0", hash: "ab".repeat(32) }, spec: spec() }], floor());
    expect(catalogue.refused).toEqual([]);
    expect(catalogue.modes).toHaveLength(1);
    const mode = catalogue.modes[0]!;
    expect([mode.id, mode.version, mode.name]).toEqual(["zombie-waves", "1.0.0", "Zombie waves"]);
    expect(mode.check({})).toBeNull();
    expect(mode.check({ wave1: 0 })).not.toBeNull();
    const last = forgeModeChoices(catalogue.modes).at(-1);
    expect(last).toMatchObject({ kind: "rules", id: "zombie-waves", version: "1.0.0", name: "Zombie waves" });
    const chase = { ...spec(), capabilities: [{ slot: "behaviour.zombie", handler: "behaviour.zombie.chase-melee" }] };
    const refused = validateRules(chase, floor());
    expect(refused.status).toBe("fail");
    expect(refused.diagnostics.map((d) => d.code)).toContain(RULES_CODES.capabilityReserved);
  });
});

describe("issue #766: the scripted runs, as data (run by the viewer's zombieWavesExample.test.ts)", () => {
  const ids = () => spec().rules.map((r) => r.id);

  it("the Crossroads layout names the horde, and every expected rule and event is in the vocabulary", () => {
    const r = run();
    expect(r.layout.base).toEqual({ kind: "map", archive: "MP72" });
    expect(r.layout.spawners.map((s) => s.id)).toEqual(["horde"]);
    for (const want of [r.expect.fired, r.wipe.expect.fired]) for (const id of want) expect(ids()).toContain(id);
    for (const x of [r, r.wipe]) for (const t of x.script.ticks) for (const e of t.events ?? []) expect(RULE_EVENTS).toContain(e.name);
  });

  it("the main run clears three waves, and one extra empty report sits between wave 1 clearing and wave 2", () => {
    const { expect: want, script } = run();
    expect(want.fired.filter((id) => id === "bounty")).toHaveLength(4 + 7 + 10);
    expect(want.fired.filter((id) => id === "clear-1")).toEqual(["clear-1"]);
    expect(want.messages).toEqual(["Wave 1", "Wave 1 cleared", "Wave 2", "Wave 2 cleared", "Wave 3", "All waves cleared"]);
    const names = script.ticks.map((t) => (t.events ?? []).map((e) => e.name).join("+"));
    expect(names[1]).toBe("spawner.empty");
    expect(names[2]).toBe("spawner.empty");
    expect(names[3]).toBe("timer.fire");
  });

  it("the wipe run ends the round on the only player and does not open wave 2", () => {
    const { wipe } = run();
    expect(wipe.expect.fired).toEqual(["open-1", "bounty", "wiped"]);
    expect(wipe.expect.phase).toBe("wave-1");
    expect(wipe.expect.messages).toEqual(["Wave 1", "The squad is down"]);
  });
});
