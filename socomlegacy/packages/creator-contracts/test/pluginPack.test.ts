import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ENGINE_CONTRACT_VERSION, PACK_CODES, PACK_CONTRACT_0_2_FLOOR, PACK_MANIFEST_FILE, PACK_TARGET_US, PLUGIN_MAIN_PATH, validatePack,
  type PackContext, type PackFile,
} from "../src/index.js";

/**
 * The plugin pack (community-server plugin design, 2026-11-12, section 3). Product-track adaptation: one module at
 * `plugin/main.js`, other members data JSON, sides `server`, contract floor 0.2.0. No new manifest field.
 */

const enc = new TextEncoder();
const hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const member = (path: string, role: string, text: string): { path: string; role: string; bytes: Uint8Array } => ({ path, role, bytes: enc.encode(text) });
const rows = (members: readonly { path: string; role: string; bytes: Uint8Array }[]) =>
  members.map((m) => ({ path: m.path, sha256: hex(m.bytes), size: m.bytes.length, role: m.role }));

const SCRIPT = member(PLUGIN_MAIN_PATH, "plugin", "export default function plugin(){return []}\n");
const DATA = member("data/note.json", "data", "{\"n\":1}");

function manifest(over: Record<string, unknown> = {}, members = [SCRIPT, DATA]): Record<string, unknown> {
  return {
    format: "s2u-pack",
    formatVersion: 2,
    id: "example.notice",
    version: "1.0.0",
    name: "Notice",
    target: PACK_TARGET_US,
    contract: `^${PACK_CONTRACT_0_2_FLOOR}`,
    kinds: ["plugin"],
    sides: "server",
    dependencies: [],
    files: rows(members),
    intents: [{ kind: "new-behaviour", files: members.map((m) => m.path) }],
    ...over,
  };
}

function filesOf(body: Record<string, unknown>, members = [SCRIPT, DATA]): PackFile[] {
  return [{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(body)) }, ...members.map((m) => ({ path: m.path, bytes: m.bytes }))];
}

const context: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION };
const codes = async (files: PackFile[], ctx: PackContext = context): Promise<string[]> =>
  (await validatePack(files, ctx)).report.diagnostics.map((d) => d.code);

describe("a plugin pack", () => {
  it("passes with plugin/main.js, data JSON, sides server and a contract at 0.2.0", async () => {
    const v = await validatePack(filesOf(manifest()), context);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.manifest.kinds).toEqual(["plugin"]);
      expect(v.manifest.sides).toBe("server");
      expect(v.manifest.files.map((file) => file.path).sort()).toEqual(["data/note.json", PLUGIN_MAIN_PATH].sort());
    }
  });

  it("refuses sides other than server", async () => {
    for (const sides of ["client", "both"]) {
      const got = await codes(filesOf(manifest({ sides })));
      expect(got, sides).toContain(PACK_CODES.fieldInvalid);
    }
  });

  it("refuses a contract that admits an engine before 0.2.0", async () => {
    for (const contract of ["*", "^0.1.1", ">=0.1.0"]) {
      const got = await codes(filesOf(manifest({ contract })));
      expect(got, contract).toContain(PACK_CODES.contractField);
    }
  });

  it("does not hold a content pack that also names plugin to the one-module rules", async () => {
    const cover = member("assets/cover.json", "data", "{\"n\":1}");
    const glb = member("visuals/props/cover.glb", "data", "glb");
    const body = manifest({
      kinds: ["content", "plugin"],
      sides: "server",
      intents: [{ kind: "cosmetic", files: [cover.path, glb.path] }],
    }, [cover, glb]);
    const v = await validatePack(filesOf(body, [cover, glb]), context);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.report.diagnostics.map((d) => d.code)).toContain(PACK_CODES.kindNotApplied);
  });

  it("refuses a second script, a non-json member, and data that is not JSON", async () => {
    const extra = member("plugin/other.js", "plugin", "export default function plugin(){return []}\n");
    expect(await codes(filesOf(manifest({}, [SCRIPT, extra]), [SCRIPT, extra]))).toContain(PACK_CODES.fieldInvalid);
    const text = member("data/note.txt", "data", "hello");
    expect(await codes(filesOf(manifest({}, [SCRIPT, text]), [SCRIPT, text]))).toContain(PACK_CODES.roleMismatch);
    const broken = member("data/note.json", "data", "{");
    expect(await codes(filesOf(manifest({}, [SCRIPT, broken]), [SCRIPT, broken]))).toContain(PACK_CODES.fieldInvalid);
  });

  it("leaves a rules pack on the 0.1.1 floor", async () => {
    const rules = member("rules/mode.json", "rules", "{\"rules\":[]}");
    const body = manifest({
      kinds: ["rules"],
      sides: "server",
      contract: "^0.1.1",
      files: rows([rules]),
      intents: [{ kind: "new-behaviour", files: ["rules/mode.json"] }],
    }, [rules]);
    const v = await validatePack(filesOf(body, [rules]), { target: PACK_TARGET_US, contract: "0.1.2" });
    expect(v.report.diagnostics.map((d) => d.code)).not.toContain(PACK_CODES.contractFloor);
    expect(v.ok).toBe(true);
  });
});
