import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildMapPack,
  MAP_PACK_CODES,
  MAP_PACK_CONTRACT,
  PACK_MANIFEST_FILE,
  PACK_TARGET_US,
  readMapPack,
  type BufferedPackFile,
  type CreatorLayoutRecord,
  type Diagnostic,
  type MapPackFile,
} from "../src/index.js";

/**
 * FX wave 1 fold (the fresh review's finding 2; product track, a browser adaptation with no original): a map pack's
 * layout member is a contract 0.2.0 member, so `readMapPack` refuses one in a pack whose `contract` range admits an engine
 * before 0.2.0 (`mapPack.CONTRACT_FLOOR`) -- a 0.1.2 build would install such a pack as plain content and ignore the
 * layout, the half-read the 0.2 floor exists to stop. Every value here is the test's own authored choice; no disc data.
 */

const enc = new TextEncoder();
const hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const entriesOf = (files: readonly MapPackFile[]): BufferedPackFile[] => files.map((f) => ({ path: f.path, bytes: enc.encode(f.text) }));
const codes = (v: { readonly diagnostics: readonly Diagnostic[] }): string[] => v.diagnostics.map((d) => d.code);

/** A layout over a retail base (as `mapPack.test.ts`'s `discLayout`): two disc pieces, two starts, no pack named. */
const discLayout = (): CreatorLayoutRecord => ({
  schema: "forge-layout", version: 3, name: "Crate Yard", base: "MP2", assets: ["MP2:crate", "MP2:barrel"],
  pieces: [[0, 1, 0, 2, 0], [1, -3.5, 0, 4, 90]], spawns: [["A", 1, 0, 2, 0], ["B", 3, 0, 4, 180]],
  ids: { pieces: ["p0", "p1"], spawns: ["s0", "s1"] },
});

/** A v2 content pack written by hand stating `contract`, its one member `layouts/x.json`, a gameplay member. */
function handPack(contract: string): BufferedPackFile[] {
  const text = JSON.stringify(discLayout());
  const b = enc.encode(text);
  const manifest = {
    format: "s2u-pack", formatVersion: 2, id: "hand.pack", version: "1.0.0", name: "Hand", target: PACK_TARGET_US, contract,
    kinds: ["content"], sides: "both", dependencies: [],
    files: [{ path: "layouts/x.json", sha256: hex(b), size: b.length, role: "gameplay" }],
    intents: [{ kind: "gameplay-value", files: ["layouts/x.json"] }],
  };
  return [{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(manifest)) }, { path: "layouts/x.json", bytes: b }];
}

describe("FX fold: a layout member needs a contract range with the 0.2.0 floor", () => {
  it("names the code in the mapPack. namespace", () => {
    expect(MAP_PACK_CODES.contractFloor).toBe("mapPack.CONTRACT_FLOOR");
  });

  it("refuses a hand-built pack stating ^0.1.1 with a valid layouts/x.json member, the code on that member", async () => {
    const v = await readMapPack(handPack("^0.1.1"));
    expect(v.ok).toBe(false);
    expect(v.pack).toBeNull();
    expect(codes(v)).toEqual([MAP_PACK_CODES.contractFloor]);
    const d = v.diagnostics[0]!;
    expect(d.file).toBe("layouts/x.json");
    expect(d.field).toBe("contract");
    expect(d.actual).toBe("^0.1.1");
    expect(d.expected).toBe("^0.2.0");
  });

  it("reads the same pack stating ^0.2.0", async () => {
    const v = await readMapPack(handPack("^0.2.0"));
    expect(codes(v)).toEqual([]);
    expect(v.ok).toBe(true);
    if (!v.ok) throw new Error("the map pack did not read");
    expect(v.pack.layouts.map((l) => l.path)).toEqual(["layouts/x.json"]);
    expect(v.pack.layouts[0]!.record).toEqual(discLayout());
  });

  it("refuses a range that admits 0.1.2 as well as 0.2.0 (>=0.1.2 <0.3.0)", async () => {
    const v = await readMapPack(handPack(">=0.1.2 <0.3.0"));
    expect(v.ok).toBe(false);
    expect(codes(v)).toEqual([MAP_PACK_CODES.contractFloor]);
  });

  it("refuses an alternative below the floor in a || range (^0.2.0 || ^0.1.1)", async () => {
    const v = await readMapPack(handPack("^0.2.0 || ^0.1.1"));
    expect(v.ok).toBe(false);
    expect(codes(v)).toEqual([MAP_PACK_CODES.contractFloor]);
  });

  it("reads what buildMapPack builds: it states MAP_PACK_CONTRACT, ^0.2.0, and passes the floor", async () => {
    const b = await buildMapPack({ id: "craig.crate-yard", version: "1.0.0", name: "Crate Yard", layout: discLayout() });
    expect(codes(b)).toEqual([]);
    if (!b.ok) throw new Error("the map pack did not build");
    expect(b.manifest.contract).toBe(MAP_PACK_CONTRACT);
    expect(MAP_PACK_CONTRACT).toBe("^0.2.0");
    const r = await readMapPack(entriesOf(b.files));
    expect(codes(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
