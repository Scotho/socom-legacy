import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  behaviourCatalogue, ENGINE_CONTRACT_VERSIONS, forgeModeChoices, layoutEntityIds, PACK_CODES, PACK_TARGET_US, packDigest,
  RULE_ACTIONS, RULE_EVENTS, RULES_CODES, rulesCatalogue, rulesModeCatalogue, sha256Hex, validatePack, validateRules,
  type LayoutSpawner, type LayoutZone, type PackManifest, type RulesSpec,
} from "../src/index.js";

/**
 * FCW-34 (product track, OT.R53; the acceptance test of issue #532): the capture-the-flag example pack
 * (`examples/capture-the-flag/`), written by an implementer who built none of FCW-30..33, from the published contract
 * only -- the rules and pack-framework specs, this package's exported types and doc comments, and the Forge's MCP
 * operations. Every check here goes through the package's public barrel (`../src/index.js`), never an internal.
 *
 * The scripted run (a carrier takes the flag, enters its own base, scores; three captures end the round) is held as
 * data in `examples/capture-the-flag.run.json`: this package exports no rule host, so it is checked here as data
 * (its geometry against the layout it names, its expected rule trace against the spec), and RUN through the Forge's
 * `forge.rules.test` by the viewer's `test/forge/ctfExample.test.ts` (FCW-34's finding (b): no public way to run a
 * pack's rules outside the page).
 */

const DIR = fileURLToPath(new URL("../examples/capture-the-flag/", import.meta.url));
const RUN = fileURLToPath(new URL("../examples/capture-the-flag.run.json", import.meta.url));
const bytesOf = (path: string): Uint8Array => new Uint8Array(readFileSync(DIR + path));
const textOf = (path: string): string => readFileSync(DIR + path, "utf8");

interface CtfRun {
  readonly layout: { readonly zones: LayoutZone[]; readonly spawners: LayoutSpawner[] };
  readonly script: {
    readonly seed: number;
    readonly players: readonly { readonly id: number; readonly team: "seal" | "terrorist"; readonly at: [number, number, number] }[];
    readonly ticks: readonly { readonly move?: Readonly<Record<string, [number, number, number]>>; readonly events?: readonly Record<string, unknown>[] }[];
  };
  readonly expect: { readonly fired: readonly string[] };
  readonly dropped: {
    readonly ticks: CtfRun["script"]["ticks"];
    readonly expect: { readonly fired: readonly string[] };
  };
}
const run = (): CtfRun => JSON.parse(readFileSync(RUN, "utf8")) as CtfRun;
const spec = (): RulesSpec => JSON.parse(textOf("rules/ctf.json")) as RulesSpec;
const manifest = (): PackManifest => JSON.parse(textOf("s2u-pack.json")) as PackManifest;
const packFiles = () => [{ path: "s2u-pack.json", bytes: bytesOf("s2u-pack.json") }, { path: "rules/ctf.json", bytes: bytesOf("rules/ctf.json") }];
/** The build's whole context, so no check is skipped (a skipped check is never a pass). */
const context = () => ({ target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, packs: [], archives: {}, handlers: behaviourCatalogue() });
const layoutCatalogue = () => rulesCatalogue({ layout: layoutEntityIds(run().layout) });

describe("FCW-34: the CTF example's manifest", () => {
  it("validates as a v2 rules pack (validatePack, every check run): pass, kind rules, contract ^0.1.1, no code", async () => {
    const checked = await validatePack(packFiles(), context());
    expect(checked.report.diagnostics).toEqual([]);
    expect(checked.report.status).toBe("pass");
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.ref.id).toBe("example.capture-the-flag");
    expect(checked.ref.version).toBe("1.0.0");
    expect(checked.manifest.kinds).toEqual(["rules"]);
    expect(checked.manifest.contract).toBe("^0.1.1");
    expect(checked.manifest.handlers ?? []).toEqual([]);   // CTF claims no built-in capability: rules alone
    expect(checked.manifest.intents).toEqual([{ kind: "new-behaviour", files: ["rules/ctf.json"] }]);
  });

  it("the member row is the member: its sha256 and size", async () => {
    const row = manifest().files.find((f) => f.path === "rules/ctf.json");
    expect(row?.role).toBe("rules");
    expect(row?.size).toBe(bytesOf("rules/ctf.json").length);
    expect(row?.sha256).toBe(await sha256Hex(bytesOf("rules/ctf.json")));
  });

  it("its digest seals and is stable: packDigest twice, a reformatted manifest and the README beside it give one ref", async () => {
    const checked = await validatePack(packFiles(), context());
    if (!checked.ok) throw new Error(JSON.stringify(checked.report));
    expect(checked.ref.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await packDigest(manifest())).toBe(checked.ref.hash);
    expect(await packDigest(manifest())).toBe(checked.ref.hash);
    const reformatted = new TextEncoder().encode(JSON.stringify(manifest()));     // no whitespace: the same manifest
    const again = await validatePack([{ path: "s2u-pack.json", bytes: reformatted }, packFiles()[1]!], context());
    expect(again.ok && again.ref).toEqual(checked.ref);
    // README.md at the root is a Thunderstore store file: outside the pack's identity, never a member (FCW-33).
    const withReadme = await validatePack([...packFiles(), { path: "README.md", bytes: bytesOf("README.md") }], context());
    expect(withReadme.ok && withReadme.ref).toEqual(checked.ref);
  });

  it("the seal holds: one changed byte of the rules member is refused MEMBER_HASH_MISMATCH", async () => {
    const changed = bytesOf("rules/ctf.json").slice();
    const at = changed.indexOf(0x33);   // the first "3" in the member (the default capture count has one): now a "4"
    expect(at).toBeGreaterThan(0);
    changed[at] = 0x34;
    const checked = await validatePack([packFiles()[0]!, { path: "rules/ctf.json", bytes: changed }], context());
    expect(checked.ok).toBe(false);
    expect(checked.report.diagnostics.map((d) => d.code)).toContain(PACK_CODES.memberHashMismatch);
  });
});

describe("FCW-34: the CTF example's RulesSpec", () => {
  it("validates against a catalogue holding the layout entities it names (validateRules): pass", () => {
    const report = validateRules(spec(), layoutCatalogue());
    expect(report.diagnostics).toEqual([]);
    expect(report.status).toBe("pass");
  });

  it("is bound to the layout: without a flag stand it is refused ENTITY_MISSING by name", () => {
    const layout = run().layout;
    const report = validateRules(spec(), rulesCatalogue({ layout: layoutEntityIds({ zones: layout.zones, spawners: layout.spawners.slice(1) }) }));
    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((d) => d.code)).toContain(RULES_CODES.entityMissing);
  });

  it("uses only the published vocabulary (spec section 11: none beyond it), and names no map door or switch (O4)", () => {
    const s = spec();
    for (const rule of s.rules) {
      expect(RULE_EVENTS).toContain(typeof rule.when === "string" ? rule.when : rule.when.event);
      for (const a of [...rule.then, ...(rule.else ?? [])]) {
        expect(RULE_ACTIONS).toContain(a.do);
        expect(a.do.startsWith("door.")).toBe(false);
      }
      expect(typeof rule.when === "string" ? rule.when : rule.when.event).not.toBe("interact");
    }
    expect(s.entities?.doors).toBeUndefined();
    expect(s.entities?.switches).toBeUndefined();
    expect(s.capabilities).toBeUndefined();
  });

  it("is a Forge mode: rulesModeCatalogue offers it, its configuration checked, and forgeModeChoices lists it after the retail types", async () => {
    const checked = await validatePack(packFiles(), context());
    if (!checked.ok) throw new Error(JSON.stringify(checked.report));
    const catalogue = rulesModeCatalogue([{ ref: checked.ref, spec: spec() }], layoutCatalogue());
    expect(catalogue.refused).toEqual([]);
    expect(catalogue.modes).toHaveLength(1);
    const mode = catalogue.modes[0]!;
    expect([mode.id, mode.version, mode.name, mode.pack]).toEqual(["ctf", "1.0.0", "Capture the flag", checked.ref]);
    expect(mode.check({})).toBeNull();
    expect(mode.check({ capturesToWin: 5, capturePoints: 2 })).toBeNull();
    expect(mode.check({ capturesToWin: 0 })).not.toBeNull();   // below the parameter's declared min
    const last = forgeModeChoices(catalogue.modes).at(-1);
    expect(last).toEqual({ kind: "rules", id: "ctf", version: "1.0.0", name: "Capture the flag", pack: checked.ref });
  });
});

describe("FCW-34: the scripted run, as data (no public rule host here; run by the viewer's ctfExample.test.ts)", () => {
  const inZone = (z: LayoutZone, p: readonly number[]): boolean =>
    z.shape === "cylinder" && Math.hypot(p[0]! - z.at[0], p[2]! - z.at[2]) < z.radius && Math.abs(p[1]! - z.at[1]) < z.height / 2;

  it("the run's layout is the spec's entities, no more and no fewer", () => {
    expect(layoutEntityIds(run().layout)).toEqual({ zones: spec().entities?.zones, markers: [], spawners: spec().entities?.spawners });
  });

  it("each move lands on a flag stand or inside a base, and the players start in neither", () => {
    const { layout, script } = run();
    const stands = layout.spawners.filter((s) => s.source === "item");
    expect(stands.map((s) => s.id)).toEqual(["stand-seal", "stand-terrorist"]);
    const places = (p: readonly number[]) => [...stands.filter((s) => s.at.every((v, i) => v === p[i])).map((s) => s.id),
      ...layout.zones.filter((z) => inZone(z, p)).map((z) => z.id)];
    for (const player of script.players) expect(places(player.at)).toEqual([]);
    // the carrier, a SEAL: the terrorists' stand, then the SEALs' base, three times
    expect(script.ticks.map((t) => places(t.move!["1"]!))).toEqual([
      ["stand-terrorist"], ["base-seal"], ["stand-terrorist"], ["base-seal"], ["stand-terrorist"], ["base-seal"],
    ]);
    // no zone holds a stand, so a carrier at a stand is never in a base
    for (const s of stands) for (const z of layout.zones) expect(inZone(z, s.at)).toBe(false);
  });

  it("the expected trace: three captures, each counted before the win rule reads the count, and one win", () => {
    const s = spec(), ids = s.rules.map((r) => r.id), { expect: want, dropped } = run();
    for (const id of [...want.fired, ...dropped.expect.fired]) expect(ids).toContain(id);
    expect(want.fired.filter((id) => id === "seal-captures")).toHaveLength(3);
    expect(want.fired.at(-1)).toBe("seal-wins");
    expect(want.fired.at(-2)).toBe("seal-captures");
    expect(ids.indexOf("seal-captures")).toBeLessThan(ids.indexOf("seal-wins"));            // state is immediate: count first
    expect(ids.indexOf("terrorist-captures")).toBeLessThan(ids.indexOf("terrorist-wins"));
    expect(s.config?.find((c) => c.id === "capturesToWin")?.default).toBe(3);
  });
});
