import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appliesOn,
  ENGINE_CONTRACT_VERSIONS,
  PACK_CODES,
  PACK_KINDS,
  PACK_MANIFEST_FILE,
  PACK_TARGET_US,
  thunderstoreReadme,
  validatePack,
  type PackContext,
  type PackFile,
  type PackManifest,
  type PackValidation,
} from "../src/index.js";

/**
 * FX-5 slice 3 (OT.R118; `docs/specs/2026-11-11-pack-format-0.2-and-forge-io.md` section 3, the kinds and `sides` rows;
 * product track, a browser adaptation with no original): the `plugin` kind is RESERVED -- a server plugin for a
 * community server, its runtime Fuse's design, run by nothing in this build: valid only with `sides: "server"`, at
 * contract 0.2, and reported as a kind no page applies (a warning, never an error). `sides` is read: `appliesOn` says
 * which side applies a pack's members, and a page never applies a `server` pack's. Every value here is the test's own.
 */

const enc = new TextEncoder();
const hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const BUILD: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, packs: [], archives: {}, handlers: [] };
const MEMBER = enc.encode('{"plugin":"zombies"}');
const PATH = "plugin/zombies.json";

function pack(over: Record<string, unknown> = {}): PackFile[] {
  const manifest = {
    format: "s2u-pack", formatVersion: 2, id: "fuse.zombies-server", version: "0.1.0", name: "Zombies server", target: PACK_TARGET_US, contract: "^0.2.0",
    kinds: ["plugin"], sides: "server", dependencies: [],
    files: [{ path: PATH, sha256: hex(MEMBER), size: MEMBER.length, role: "data" }],
    intents: [{ kind: "new-behaviour", files: [PATH] }],
    ...over,
  };
  return [{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(manifest)) }, { path: PATH, bytes: MEMBER }];
}
const found = (v: PackValidation): [string, string, string | undefined][] => v.report.diagnostics.map((d) => [d.code, d.severity, d.field]);

describe("FX-5 the plugin kind, reserved (OT.R118)", () => {
  it("is the fourth kind, after content, rules and system", () => {
    expect([...PACK_KINDS]).toEqual(["content", "rules", "system", "plugin"]);
  });

  it("validates a server plugin pack, with one warning that no page applies the kind (a pass, never an error)", async () => {
    const v = await validatePack(pack(), BUILD);
    expect(found(v)).toEqual([[PACK_CODES.kindNotApplied, "warning", "kinds"]]);
    expect(v.report.status).toBe("pass");
    expect(v.ok).toBe(true);
    expect(v.ok && v.manifest.kinds).toEqual(["plugin"]);
  });

  it("refuses a plugin on a client or both pack: a plugin runs on a server only (FIELD_INVALID on sides)", async () => {
    for (const sides of ["client", "both"]) {
      const v = await validatePack(pack({ sides }), BUILD);
      expect(v.ok, sides).toBe(false);
      expect(found(v).filter(([, severity]) => severity === "error"), sides).toEqual([[PACK_CODES.fieldInvalid, "error", "sides"]]);
    }
  });

  it("refuses a plugin on a range that admits an engine before 0.2.0 (CONTRACT_FIELD on kinds)", async () => {
    for (const contract of ["^0.1.1", ">=0.1.2"]) {
      const v = await validatePack(pack({ contract }), BUILD);
      expect(found(v).filter(([, severity]) => severity === "error"), contract).toEqual([[PACK_CODES.contractField, "error", "kinds"]]);
    }
  });

  it("warns nothing for a pack that holds no plugin, the plugin beside other kinds warned once", async () => {
    const content = await validatePack(pack({ kinds: ["content"], sides: "both", intents: [{ kind: "new-behaviour", files: [PATH] }] }), BUILD);
    expect(found(content)).toEqual([]);
    const mixed = await validatePack(pack({ kinds: ["content", "plugin"] }), BUILD);
    expect(found(mixed)).toEqual([[PACK_CODES.kindNotApplied, "warning", "kinds"]]);
  });
});

describe("FX-5 sides read: appliesOn", () => {
  const of = (sides: PackManifest["sides"], kinds: PackManifest["kinds"] = ["content"]): Pick<PackManifest, "sides" | "kinds"> => ({ sides, kinds });
  it("gives a client pack to the page, a server pack to the server, a both pack to each", () => {
    expect([appliesOn(of("client"), "client"), appliesOn(of("client"), "server")]).toEqual([true, false]);
    expect([appliesOn(of("server"), "client"), appliesOn(of("server"), "server")]).toEqual([false, true]);
    expect([appliesOn(of("both"), "client"), appliesOn(of("both"), "server")]).toEqual([true, true]);
  });
  it("never gives a plugin to a page", () => {
    expect(appliesOn(of("server", ["plugin"]), "client")).toBe(false);
    expect(appliesOn(of("server", ["plugin"]), "server")).toBe(true);
    expect(appliesOn(of("both", ["content", "plugin"]), "client")).toBe(false);
  });
});

describe("FX-5 the store README names the plugin kind", () => {
  it("writes one line for a plugin pack, saying it is a server plugin no page applies", async () => {
    const v = await validatePack(pack(), BUILD);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const text = thunderstoreReadme({ manifest: v.manifest });
    expect(text).toContain("\n## What it is\n\n- Plugin (reserved): code for a community server, run by the server alone; no page applies it.\n");
  });
});
