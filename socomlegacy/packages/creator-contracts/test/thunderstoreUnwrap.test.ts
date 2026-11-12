import { describe, expect, it } from "vitest";
import { THUNDERSTORE_CODES, unwrapThunderstore, type ThunderstoreUnwrapEntry } from "../src/index.js";

/**
 * B206 ML-5 (plan 2026-11-06-mods-loader, ML.R3): the inverse of the owner's upload zip -- a Thunderstore package's root
 * files set aside and the bare pack under them yielded, for ML-1's importer to classify. Product track (OT.R53): a
 * browser adaptation's packaging, no game value. Synthetic entries only (made-up names and bytes, no disc data).
 */

const enc = new TextEncoder();
function pngHeader(width: number, height: number): Uint8Array {
  const out = new Uint8Array(33);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(out.buffer);
  view.setUint32(8, 13);
  out.set(enc.encode("IHDR"), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return out;
}
const STORE_MANIFEST = { name: "Example_HD", version_number: "1.0.0", website_url: "", description: "A made-up pack.", dependencies: [] };
const json = (v: unknown): Uint8Array => enc.encode(JSON.stringify(v));
/** A bare HD layout (the served shape `importHdZip` reads), its payloads made-up bytes. */
const BARE: ThunderstoreUnwrapEntry[] = [
  { path: "experimental-packs/hd/current.json", bytes: json({ version: 1, packId: "a".repeat(64) }) },
  { path: `experimental-packs/hd/${"a".repeat(64)}/manifest.json`, bytes: json({ format: "s2u-hd-texture-pack" }) },
  { path: `experimental-packs/hd/${"a".repeat(64)}/0.png`, bytes: new Uint8Array([1, 2, 3]) },
];
function wrapped(prefix = "", manifest: unknown = STORE_MANIFEST, icon = pngHeader(256, 256)): ThunderstoreUnwrapEntry[] {
  return [
    { path: `${prefix}manifest.json`, bytes: json(manifest) },
    { path: `${prefix}icon.png`, bytes: icon },
    { path: `${prefix}README.md`, bytes: enc.encode("# Example\n") },
    ...BARE.map((e) => ({ ...e, path: prefix + e.path })),
  ];
}

describe("unwrapThunderstore (ML-5, ML.R3)", () => {
  it("sets the store's root files aside and yields the bare pack", () => {
    const u = unwrapThunderstore(wrapped());
    expect(u.wrapped).toBe(true);
    if (!u.wrapped) return;
    expect(u.root).toBe("");
    expect(u.report.status).toBe("pass");
    expect(u.manifest).toEqual(STORE_MANIFEST);
    expect(u.store.map((e) => e.path).sort()).toEqual(["README.md", "icon.png", "manifest.json"]);
    expect(u.members).toEqual(BARE);
  });

  it("reads a package zipped as one top folder, its members' paths made relative to it", () => {
    const u = unwrapThunderstore(wrapped("Team-Example_HD-1.0.0/"));
    expect(u.wrapped).toBe(true);
    if (!u.wrapped) return;
    expect(u.root).toBe("Team-Example_HD-1.0.0/");
    expect(u.members).toEqual(BARE);
  });

  it("passes a bare pack through unchanged", () => {
    const u = unwrapThunderstore(BARE);
    expect(u.wrapped).toBe(false);
    expect(u.members).toBe(BARE);
  });

  it("never takes a texture pack's own root manifest.json for the store's", () => {
    const gx: ThunderstoreUnwrapEntry[] = [
      { path: "manifest.json", bytes: json({ format: "s2u-local-texture-pack", version: 1, entries: [] }) },
      { path: "0.png", bytes: new Uint8Array([9]) },
    ];
    const u = unwrapThunderstore(gx);
    expect(u.wrapped).toBe(false);
    expect(u.members).toBe(gx);
  });

  it("leaves a v2 pack's store files to its own validator (their defined exception beside s2u-pack.json)", () => {
    const v2 = [...wrapped().slice(0, 3), { path: "s2u-pack.json", bytes: json({ format: "s2u-pack" }) }];
    const u = unwrapThunderstore(v2);
    expect(u.wrapped).toBe(false);
    expect(u.members).toBe(v2);
  });

  it("reports a store package that breaks the store's rules (a bad name, version, icon)", () => {
    const u = unwrapThunderstore(wrapped("", { ...STORE_MANIFEST, name: "bad name", version_number: "1.0" }, pngHeader(128, 128)));
    expect(u.wrapped).toBe(true);
    if (!u.wrapped) return;
    expect(u.report.status).toBe("fail");
    const codes = u.report.diagnostics.map((d) => `${d.code}:${d.field ?? d.file}`);
    expect(codes).toEqual(expect.arrayContaining([
      `${THUNDERSTORE_CODES.manifestInvalid}:name`,
      `${THUNDERSTORE_CODES.manifestInvalid}:version_number`,
      `${THUNDERSTORE_CODES.iconInvalid}:icon.png`,
    ]));
  });

  it("reports a missing root file of a recognised package", () => {
    const u = unwrapThunderstore(wrapped().filter((e) => e.path !== "icon.png"));
    expect(u.wrapped).toBe(true);
    if (!u.wrapped) return;
    expect(u.report.diagnostics.map((d) => `${d.code}:${d.file}`)).toContain(`${THUNDERSTORE_CODES.fileMissing}:icon.png`);
  });

  it("needs the root manifest.json's bytes (and the icon's) to tell a package from a pack", () => {
    const noBytes = wrapped().map((e) => (e.path === "manifest.json" ? { path: e.path } : e));
    expect(() => unwrapThunderstore(noBytes)).toThrow(/manifest\.json/);
  });
});
