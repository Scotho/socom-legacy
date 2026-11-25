import { describe, expect, it } from "vitest";
import { onlineCreatorLayoutRefusal, parseLayout } from "../src/index.js";

/**
 * `Piece.active` (the owner, 2026-11-24: the Outliner's eye, saved): a placed piece's node off at the map's load -- its
 * `m_active` clear (research 318 section 1.2). Absent: active, as every node of the disc is. Unit tests, no disc.
 */
const M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 20, 1];
const layoutWith = (piece: Record<string, unknown>) =>
  JSON.stringify({ forge: 1, base: { kind: "map", archive: "MP2" }, pieces: [{ asset: "MP2:a_dumpster", m: M }, { asset: "MP2:a_dumpster", m: M, ...piece }], spawns: [] });

describe("a piece's node off at the load (Piece.active)", () => {
  it("is read as false, kept through a save, and absent when on", () => {
    const l = parseLayout(layoutWith({ active: false }));
    expect(l.pieces.map((p) => p.active)).toEqual([undefined, false]);
    expect(parseLayout(JSON.stringify(l)).pieces[1]!.active).toBe(false);
    expect("active" in parseLayout(layoutWith({})).pieces[1]!).toBe(false);
  });

  it("refuses any other value: the node's bit is on unless the field says false", () => {
    expect(() => parseLayout(layoutWith({ active: true }))).toThrow(/active is not false/);
    expect(() => parseLayout(layoutWith({ active: 0 }))).toThrow(/active is not false/);
  });

  it("is refused online: the record's piece row has no place for it", () => {
    const refused = onlineCreatorLayoutRefusal(parseLayout(layoutWith({ active: false })));
    expect(refused.map((d) => d.field)).toContain("pieces");
    expect(onlineCreatorLayoutRefusal(parseLayout(layoutWith({}))).map((d) => d.field)).not.toContain("pieces");
  });
});
