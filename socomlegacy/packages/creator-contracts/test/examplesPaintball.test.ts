import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  behaviourCatalogue, ENGINE_CONTRACT_VERSIONS, forgeModeChoices, layoutEntityIds, PACK_CODES, PACK_TARGET_US, packDigest,
  RULE_ACTIONS, RULE_EVENTS, RULES_CODES, rulesCatalogue, rulesModeCatalogue, sha256Hex, validatePack, validateRules,
  type PackManifest, type RulesSpec,
} from "../src/index.js";

/**
 * FCW-13 (product track, OT.R53; re-cast by FCW.R18): paintball as an example rules pack (`examples/paintball/`), built
 * only on the published creator rules contract (spec section 11: `player.hit` -> `player.eliminate`, `loadout.restrict`,
 * `score.award`, `round.end` by count alive). Every check here goes through the package's public barrel, never an
 * internal; the frame is FCW-34's `examplesCtf.test.ts`.
 *
 * The scripted runs (a marker's hit eliminates and the side out ends the round; a duplicate, a forged and a friendly hit
 * count nothing; a disallowed weapon marks nothing) are held as data in `examples/paintball.run.json`: this package
 * exports no rule host, so they are checked here as data, and RUN through the Forge's `forge.rules.test` by the
 * viewer's `test/forge/paintballExample.test.ts` (with the clean-disable proof through the page's room, P3).
 */

const DIR = fileURLToPath(new URL("../examples/paintball/", import.meta.url));
const RUN = fileURLToPath(new URL("../examples/paintball.run.json", import.meta.url));
const bytesOf = (path: string): Uint8Array => new Uint8Array(readFileSync(DIR + path));
const textOf = (path: string): string => readFileSync(DIR + path, "utf8");

type Tick = { readonly events?: readonly { readonly name: string; readonly [k: string]: unknown }[] };
interface Run { readonly script: { readonly players: readonly { id: number; team: string }[]; readonly ticks: readonly Tick[] }; readonly expect: { readonly fired: readonly string[] } }
interface PaintballRun extends Run {
  readonly duplicate: Run;
  readonly disallowed: Run & { readonly any: { readonly fired: readonly string[] } };
}
const run = (): PaintballRun => JSON.parse(readFileSync(RUN, "utf8")) as PaintballRun;
const spec = (): RulesSpec => JSON.parse(textOf("rules/paintball.json")) as RulesSpec;
const manifest = (): PackManifest => JSON.parse(textOf("s2u-pack.json")) as PackManifest;
const packFiles = () => [{ path: "s2u-pack.json", bytes: bytesOf("s2u-pack.json") }, { path: "rules/paintball.json", bytes: bytesOf("rules/paintball.json") }];
/** The build's whole context, so no check is skipped (a skipped check is never a pass). */
const context = () => ({ target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, packs: [], archives: {}, handlers: behaviourCatalogue() });
/** Paintball names no layout entity: it plays on any floor (the blank floor, a retail map base). */
const anyFloor = () => rulesCatalogue({ layout: layoutEntityIds({}) });

describe("FCW-13: the paintball example's manifest", () => {
  it("validates as a v2 rules pack (validatePack, every check run): pass, kind rules, contract ^0.1.1, no code", async () => {
    const checked = await validatePack(packFiles(), context());
    expect(checked.report.diagnostics).toEqual([]);
    expect(checked.report.status).toBe("pass");
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.ref.id).toBe("example.paintball");
    expect(checked.ref.version).toBe("1.0.0");
    expect(checked.manifest.kinds).toEqual(["rules"]);
    expect(checked.manifest.sides).toBe("server");
    expect(checked.manifest.contract).toBe("^0.1.1");
    expect(checked.manifest.handlers ?? []).toEqual([]);   // no built-in capability: rules alone
    expect(checked.manifest.intents).toEqual([{ kind: "new-behaviour", files: ["rules/paintball.json"] }]);
  });

  it("the member row is the member: its sha256 and size", async () => {
    const row = manifest().files.find((f) => f.path === "rules/paintball.json");
    expect(row?.role).toBe("rules");
    expect(row?.size).toBe(bytesOf("rules/paintball.json").length);
    expect(row?.sha256).toBe(await sha256Hex(bytesOf("rules/paintball.json")));
  });

  it("its digest seals and is stable: packDigest twice, a reformatted manifest and the README beside it give one ref", async () => {
    const checked = await validatePack(packFiles(), context());
    if (!checked.ok) throw new Error(JSON.stringify(checked.report));
    expect(checked.ref.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await packDigest(manifest())).toBe(checked.ref.hash);
    expect(await packDigest(manifest())).toBe(checked.ref.hash);
    const reformatted = new TextEncoder().encode(JSON.stringify(manifest()));
    const again = await validatePack([{ path: "s2u-pack.json", bytes: reformatted }, packFiles()[1]!], context());
    expect(again.ok && again.ref).toEqual(checked.ref);
    // README.md at the root is a Thunderstore store file: outside the pack's identity, never a member (FCW-33).
    const withReadme = await validatePack([...packFiles(), { path: "README.md", bytes: bytesOf("README.md") }], context());
    expect(withReadme.ok && withReadme.ref).toEqual(checked.ref);
  });

  it("the seal holds: one changed byte of the rules member is refused MEMBER_HASH_MISMATCH", async () => {
    const changed = bytesOf("rules/paintball.json").slice();
    const at = changed.indexOf(0x31);   // the first "1" in the member (the default hits to eliminate is one): now a "2"
    expect(at).toBeGreaterThan(0);
    changed[at] = 0x32;
    const checked = await validatePack([packFiles()[0]!, { path: "rules/paintball.json", bytes: changed }], context());
    expect(checked.ok).toBe(false);
    expect(checked.report.diagnostics.map((d) => d.code)).toContain(PACK_CODES.memberHashMismatch);
  });
});

describe("FCW-13: the paintball example's RulesSpec", () => {
  it("validates on a floor with no entities (validateRules): pass -- it names no zone, marker, spawner, door or switch", () => {
    const report = validateRules(spec(), anyFloor());
    expect(report.diagnostics).toEqual([]);
    expect(report.status).toBe("pass");
    const s = spec();
    expect(s.entities).toBeUndefined();
    expect(s.capabilities).toBeUndefined();
  });

  it("uses only the published vocabulary, and spec section 11's paintball primitives each at least once", () => {
    const s = spec();
    const actions = new Set<string>(), events = new Set<string>();
    for (const rule of s.rules) {
      const event = typeof rule.when === "string" ? rule.when : rule.when.event;
      expect(RULE_EVENTS).toContain(event);
      events.add(event);
      for (const a of [...rule.then, ...(rule.else ?? [])]) { expect(RULE_ACTIONS).toContain(a.do); actions.add(a.do); }
    }
    for (const e of ["round.start", "player.hit", "player.eliminated"]) expect(events).toContain(e);
    for (const a of ["player.eliminate", "hit.scale", "loadout.restrict", "score.award", "round.end"]) expect(actions).toContain(a);
  });

  it("its configuration: hits (1, 1..10), points (1, 0..100), loadout (sidearms | any, default sidearms) -- authored values", () => {
    const config = spec().config ?? [];
    expect(config.map((c) => [c.id, c.type, c.default])).toEqual([["hits", "int", 1], ["points", "int", 1], ["loadout", "enum", "sidearms"]]);
    const hits = config.find((c) => c.id === "hits")!, points = config.find((c) => c.id === "points")!, loadout = config.find((c) => c.id === "loadout")!;
    expect([hits.min, hits.max]).toEqual([1, 10]);
    expect([points.min, points.max]).toEqual([0, 100]);
    expect(loadout.values).toEqual(["sidearms", "any"]);
    for (const c of config) expect(typeof c.label).toBe("string");
  });

  it("the sidearms-only loadout restricts to the published weapon class `pistol`, and the hit rule reads the same class", () => {
    const rules = spec().rules;
    const restrict = rules.flatMap((r) => r.then).filter((a) => a.do === "loadout.restrict");
    expect(restrict).toEqual([{ do: "loadout.restrict", allow: ["pistol"] }]);
    const mark = rules.find((r) => r.id === "mark")!;
    expect(JSON.stringify(mark.if)).toContain('{"field":"weaponClass"},"op":"=","right":"pistol"');
  });

  it("counts before it reads (state is immediate): no-damage, then mark, then out; the side-out rules on player.eliminated", () => {
    const ids = spec().rules.map((r) => r.id);
    expect(ids).toEqual(["start", "sidearms-only", "no-damage", "mark", "out", "seal-wins", "terrorist-wins"]);
    const out = spec().rules.find((r) => r.id === "out")!;
    expect(out.then.map((a) => a.do)).toEqual(["variable.set", "player.eliminate", "score.award", "message.show"]);
    expect(out.then.find((a) => a.do === "score.award")).toEqual({ do: "score.award", team: { of: "attacker" }, points: { param: "points" } });
  });

  it("is a Forge mode: rulesModeCatalogue offers it, its configuration checked, and forgeModeChoices lists it after the retail types", async () => {
    const checked = await validatePack(packFiles(), context());
    if (!checked.ok) throw new Error(JSON.stringify(checked.report));
    const catalogue = rulesModeCatalogue([{ ref: checked.ref, spec: spec() }], anyFloor());
    expect(catalogue.refused).toEqual([]);
    expect(catalogue.modes).toHaveLength(1);
    const mode = catalogue.modes[0]!;
    expect([mode.id, mode.version, mode.name, mode.pack]).toEqual(["paintball", "1.0.0", "Paintball", checked.ref]);
    expect(mode.check({})).toBeNull();
    expect(mode.check({ hits: 3, points: 2, loadout: "any" })).toBeNull();
    expect(mode.check({ hits: 0 })).not.toBeNull();              // below the declared min
    expect(mode.check({ loadout: "rifles" })).not.toBeNull();    // not one of the enum's values
    const last = forgeModeChoices(catalogue.modes).at(-1);
    expect(last).toEqual({ kind: "rules", id: "paintball", version: "1.0.0", name: "Paintball", pack: checked.ref });
  });

  it("a rule naming an undeclared variable is refused by name (the validator holds the pack's own words)", () => {
    const s = spec();
    const broken = { ...s, variables: (s.variables ?? []).filter((v) => v.id !== "marks") };
    const report = validateRules(broken, anyFloor());
    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code).some((c) => (Object.values(RULES_CODES) as string[]).includes(c))).toBe(true);
  });
});

describe("FCW-13: the scripted runs, as data (no public rule host here; run by the viewer's paintballExample.test.ts)", () => {
  const ids = () => spec().rules.map((r) => r.id);

  it("every rule a run expects is the spec's, and each run's events are the vocabulary's", () => {
    const r = run();
    for (const want of [r.expect.fired, r.duplicate.expect.fired, r.disallowed.expect.fired, r.disallowed.any.fired]) for (const id of want) expect(ids()).toContain(id);
    for (const x of [r, r.duplicate, r.disallowed]) for (const t of x.script.ticks) for (const e of t.events ?? []) expect(RULE_EVENTS).toContain(e.name);
  });

  it("the main run: one marker hit, the victim out, the side out -- start, the loadout, the hit's three rules, the win", () => {
    const r = run();
    expect(r.expect.fired).toEqual(["start", "sidearms-only", "no-damage", "mark", "out", "seal-wins"]);
    expect(r.script.ticks[0]!.events![0]).toMatchObject({ name: "player.hit", attacker: 1, victim: 2, fields: { weaponClass: "pistol" } });
  });

  it("the duplicate run: out once, however many hits, forged or friendly, the room tells after it", () => {
    const fired = run().duplicate.expect.fired;
    expect(fired).toEqual(["start", "sidearms-only", "no-damage", "mark", "out", "no-damage", "no-damage", "no-damage"]);
    expect(fired.filter((id) => id === "out")).toHaveLength(1);
    expect(fired.filter((id) => id === "mark")).toHaveLength(1);
    expect(fired.filter((id) => id === "no-damage").length).toBeGreaterThan(1);   // every hit is scaled to nothing
  });

  it("the disallowed run: a rifle marks nothing by default, and eliminates with the loadout `any`", () => {
    const { disallowed } = run();
    expect(disallowed.script.ticks[0]!.events![0]).toMatchObject({ name: "player.hit", fields: { weaponClass: "rifle" } });
    expect(disallowed.expect.fired).toEqual(["start", "sidearms-only", "no-damage"]);
    expect(disallowed.any.fired).toEqual(["start", "no-damage", "mark", "out"]);   // the script tells no elimination: no round end
  });
});
