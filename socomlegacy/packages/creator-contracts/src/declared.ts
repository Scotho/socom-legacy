/**
 * CMV-2 (the community-mods plan, `docs/plans/2026-11-12-community-mods-validation.md`; product track, a browser and
 * server adaptation with no original): one shared type for "the packs a server runs" -- each pack by its identity
 * (`PackRef`: id, version, hash) and the two manifest fields that say where it applies (`sides`, `kinds`). A list read
 * off an untrusted wire (`readDeclaredPacks`), checked against what a layout needs (`checkDeclaredPacks`, exact identity,
 * never a range), cut to what a joiner's page needs (`clientNeeds`, `appliesOn`), and a layout's needs
 * (`layoutPackNeeds`). Pure: no DOM, no Node API, no I/O. Nothing is wired here; later rows (CMV-3, CMV-5..7) call it.
 * CMV-16: a declaration's `sides` and `kinds` checked against the pack's manifest at its hash (`checkDeclaredAgainstManifest`).
 */
import { checkPackRef, packRefKey, samePackRef, sortPackRefs } from "./content.js";
import { diagnostic, type Diagnostic } from "./diagnostics.js";
import { isContentLayoutBase, RECORD_LIMITS, type ContentLayout, type Layout } from "./layout.js";
import { appliesOn, PACK_KINDS, PACK_SIDES, type PackKind, type PackManifest, type PackRef, type PackSide } from "./packs.js";

/**
 * A pack a server declares it runs: its identity (`PackRef`: id, version, hash) and where its members apply (`sides`,
 * `kinds`). CMV-16 (the main controller, 2026-11-13): `sides` and `kinds` are the HOST'S OWN CLAIM -- nothing ties them to
 * the pack's hash. Central decides by identity (id, version, hash) alone and holds no manifest; nothing may ACT on a
 * declared side or kind (`clientNeeds` included) until the party acting has checked it against the pack's manifest at
 * that hash (`checkDeclaredAgainstManifest`); a mismatch refuses, it is never ignored.
 */
export interface DeclaredPack extends PackRef {
  readonly sides: PackSide;
  readonly kinds: readonly PackKind[];
}

/**
 * The most packs one declaration lists -- a bound of ours (an adaptation, no original): the record's own bound on
 * `requires` (`RECORD_LIMITS.requires`), so one server can always cover every pack one layout needs.
 */
export const DECLARED_PACKS_MAX_ADAPTATION = RECORD_LIMITS.requires;

export const DECLARED_CODES = Object.freeze({
  /** The declaration is not a list. */
  listInvalid: "declared.LIST_INVALID",
  /** The list holds more than `DECLARED_PACKS_MAX_ADAPTATION` entries. */
  tooMany: "declared.TOO_MANY",
  /** An entry is not a declared pack (`checkDeclaredPack`); `field` its index, `actual` the reason. */
  entryInvalid: "declared.ENTRY_INVALID",
  /** One pack id declared twice, whatever the versions; `actual` the id. */
  duplicateId: "declared.DUPLICATE_ID",
  /** A needed pack no declared pack shares the id of. */
  packMissing: "declared.PACK_MISSING",
  /** A needed pack declared under its id at another version (exact strings, never a range). */
  versionMismatch: "declared.VERSION_MISMATCH",
  /** A needed pack declared at its id and version with another hash. */
  hashMismatch: "declared.HASH_MISMATCH",
  /**
   * CMV-16: a declared pack's `sides` or `kinds` is not its manifest's at the same id, version and hash
   * (`checkDeclaredAgainstManifest`); `field` names which, `expected` the manifest's, `actual` the claim's.
   */
  manifestMismatch: "declared.MANIFEST_MISMATCH",
} as const);
export type DeclaredCode = (typeof DECLARED_CODES)[keyof typeof DECLARED_CODES];

const DECLARED_KEYS = ["id", "version", "hash", "sides", "kinds"] as const;
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/**
 * Null when `v` is a declared pack -- exactly `id`, `version`, `hash` (a `PackRef`, `checkPackRef`), `sides` (one of
 * `PACK_SIDES`) and `kinds` (1 to 4 of `PACK_KINDS`, each once; a `plugin` kind only with `sides: "server"`, as a
 * manifest's) -- else a short reason that never repeats the value. `v` is plain data, as `JSON.parse` gives it off a
 * wire: a hole in `kinds` is refused as any other non-kind (`Array.from`), while an object built in code whose getter
 * throws, or a Proxy, is not such data and may throw here.
 */
export function checkDeclaredPack(v: unknown): string | null {
  if (!isObject(v)) return "a declared pack is not {id, version, hash, sides, kinds}";
  const extra = Object.keys(v).find((k) => !(DECLARED_KEYS as readonly string[]).includes(k));
  if (extra !== undefined) return `a declared pack names no field ${extra.slice(0, 24)}`;
  const absent = DECLARED_KEYS.find((k) => !Object.prototype.hasOwnProperty.call(v, k));
  if (absent !== undefined) return `a declared pack lacks its ${absent}`;
  const why = checkPackRef({ id: v["id"], version: v["version"], hash: v["hash"] });
  if (why) return why;
  if (!oneOf(PACK_SIDES, v["sides"])) return `a declared pack's sides is not one of ${PACK_SIDES.join(", ")}`;
  const kinds = v["kinds"];
  if (!Array.isArray(kinds) || kinds.length < 1 || kinds.length > PACK_KINDS.length || new Set(kinds).size !== kinds.length
    || !Array.from(kinds).every((k) => oneOf(PACK_KINDS, k))) return `a declared pack's kinds lists each of ${PACK_KINDS.join(", ")} at most once, at least one`;
  if (kinds.includes("plugin") && v["sides"] !== "server") return 'a declared plugin pack runs on a server alone: its sides is "server"';
  return null;
}

/** A fresh copy, `kinds` in `PACK_KINDS` order. */
const copyCanonical = (p: DeclaredPack): DeclaredPack => ({
  id: p.id, version: p.version, hash: p.hash, sides: p.sides, kinds: PACK_KINDS.filter((k) => p.kinds.includes(k)),
});
const refuse = (code: DeclaredCode, text: string, more: { field?: string; expected?: string; actual?: string } = {}): Diagnostic =>
  diagnostic({ source: "pack", severity: "error", code, text, ...more });

/**
 * An untrusted declaration (off a wire): the first fault only, in this order -- not a list (`listInvalid`), more than
 * the maximum (`tooMany`), the first entry `checkDeclaredPack` refuses (`entryInvalid`), the same id twice
 * (`duplicateId`). Else fresh copies, sorted as `sortPackRefs` sorts (by `packRefKey`), each `kinds` in `PACK_KINDS`
 * order; the input is never mutated or returned.
 */
export function readDeclaredPacks(raw: unknown): { ok: true; packs: DeclaredPack[] } | { ok: false; diagnostics: Diagnostic[] } {
  if (!Array.isArray(raw)) return { ok: false, diagnostics: [refuse(DECLARED_CODES.listInvalid, "The declared packs are not a list.")] };
  if (raw.length > DECLARED_PACKS_MAX_ADAPTATION) {
    const text = `The declared packs list more than ${DECLARED_PACKS_MAX_ADAPTATION} packs.`;
    return { ok: false, diagnostics: [refuse(DECLARED_CODES.tooMany, text, { expected: String(DECLARED_PACKS_MAX_ADAPTATION), actual: String(raw.length) })] };
  }
  for (let i = 0; i < raw.length; i++) {
    const why = checkDeclaredPack(raw[i]);
    if (why) return { ok: false, diagnostics: [refuse(DECLARED_CODES.entryInvalid, `Declared pack ${i} is not a declared pack: ${why}.`, { field: String(i), actual: why })] };
  }
  const packs = (raw as DeclaredPack[]).map(copyCanonical);
  const ids = new Set<string>();
  for (const p of packs) {
    if (ids.has(p.id)) return { ok: false, diagnostics: [refuse(DECLARED_CODES.duplicateId, `The pack ${p.id} is declared twice.`, { actual: p.id })] };
    ids.add(p.id);
  }
  // the ids are distinct, so each key is too: `sortPackRefs` gives the order, the key finds the entry
  const byKey = new Map(packs.map((p): [string, DeclaredPack] => [packRefKey(p), p]));
  return { ok: true, packs: sortPackRefs(packs).map((r) => byKey.get(packRefKey(r))!) };
}

/**
 * What a declaration lacks of `needed`: one error per distinct needed ref not declared exactly (`samePackRef`), in
 * `sortPackRefs` order -- no pack of its id (`packMissing`), its id at another version (`versionMismatch`), its id and
 * version with another hash (`hashMismatch`); `expected` the needed ref's `packRefKey`, `actual` the declared one's or
 * `missing`. A declared pack nobody needs is ignored. Empty: every need declared.
 */
export function checkDeclaredPacks(declared: readonly DeclaredPack[], needed: readonly PackRef[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const need of sortPackRefs(needed)) {
    if (declared.some((d) => samePackRef(d, need))) continue;
    const expected = packRefKey(need);
    const sameId = declared.filter((d) => d.id === need.id);
    const sameVersion = sameId.find((d) => d.version === need.version);
    if (sameVersion) {
      out.push(refuse(DECLARED_CODES.hashMismatch, `The server runs ${need.id} ${need.version} with another hash than the one needed.`, { expected, actual: packRefKey(sameVersion) }));
    } else if (sameId[0]) {
      out.push(refuse(DECLARED_CODES.versionMismatch, `The server runs ${need.id} at another version than ${need.version}.`, { expected, actual: packRefKey(sameId[0]) }));
    } else {
      out.push(refuse(DECLARED_CODES.packMissing, `The server does not run the pack ${need.id}.`, { expected, actual: "missing" }));
    }
  }
  return out;
}

/** A kinds list as one text: the set in `PACK_KINDS` order, comma-joined (whatever the order or repeats it came in). */
const kindsText = (kinds: readonly PackKind[]): string => PACK_KINDS.filter((k) => kinds.includes(k)).join(",");

/**
 * CMV-16 (the community-mods plan's row CMV-16; CMV-2's fresh review, note 3): a declaration checked against the pack's
 * manifest at `manifestHash` -- the hash the CALLER computed over that manifest (`packDigest`, which is asynchronous; this
 * stays synchronous and pure). A declaration's `sides` and `kinds` are the host's claim: central never decides by them, and
 * whoever holds the pack's manifest at that hash checks them with this before trusting `clientNeeds` (CMV-6/7 wire it at
 * the page). Empty only when the manifest's `id` and `version` equal the declaration's, `manifestHash` equals its `hash`,
 * its `sides` equals, and its `kinds`, as a set in `PACK_KINDS` order, equal. Else ONE error, the first fault in this
 * order: another id (`packMissing`), another version (`versionMismatch`), another hash (`hashMismatch`) -- each `expected`
 * the manifest's `packRefKey` at `manifestHash`, `actual` the claim's -- then another `sides`, then another set of `kinds`
 * (`manifestMismatch`, `field` naming which, `expected` the manifest's, `actual` the claim's). Never mutates either input.
 */
export function checkDeclaredAgainstManifest(declared: DeclaredPack, manifest: PackManifest, manifestHash: string): Diagnostic[] {
  const held: PackRef = { id: manifest.id, version: manifest.version, hash: manifestHash };
  const claimed: PackRef = { id: declared.id, version: declared.version, hash: declared.hash };
  const identity = { expected: packRefKey(held), actual: packRefKey(claimed) };
  if (claimed.id !== held.id) return [refuse(DECLARED_CODES.packMissing, `The manifest is not the declared pack ${claimed.id}'s.`, identity)];
  if (claimed.version !== held.version) return [refuse(DECLARED_CODES.versionMismatch, `The manifest of ${held.id} is at another version than the declared ${claimed.version}.`, identity)];
  if (claimed.hash !== held.hash) return [refuse(DECLARED_CODES.hashMismatch, `The manifest of ${held.id} ${held.version} has another hash than the declared one.`, identity)];
  if (declared.sides !== manifest.sides) {
    return [refuse(DECLARED_CODES.manifestMismatch, `The declared sides of ${held.id} are not its manifest's.`, { field: "sides", expected: manifest.sides, actual: declared.sides })];
  }
  const expected = kindsText(manifest.kinds), actual = kindsText(declared.kinds);
  if (expected !== actual) return [refuse(DECLARED_CODES.manifestMismatch, `The declared kinds of ${held.id} are not its manifest's.`, { field: "kinds", expected, actual })];
  return [];
}

/** The declared packs a joiner's page needs (`appliesOn(p, "client")`): never a server pack nor a plugin; order kept, fresh copies. */
export function clientNeeds(declared: readonly DeclaredPack[]): DeclaredPack[] {
  return declared.filter((p) => appliesOn(p, "client")).map((p) => ({ id: p.id, version: p.version, hash: p.hash, sides: p.sides, kinds: [...p.kinds] }));
}

/**
 * Every pack a layout needs, each once, sorted (`sortPackRefs`): its declared `requires`, its content base's `ref`, and
 * each piece's `content.pack`. A `mode` names no pack and adds nothing. The same union `recordOfLayout` writes as the
 * record's `requires` and `onlineCreatorLayoutRefusal` refuses (stated a third time here, as `layout.ts` is another
 * sprint's claim; a test pins it equal to the record's).
 */
export function layoutPackNeeds(l: Layout | ContentLayout): PackRef[] {
  return sortPackRefs([
    ...(l.requires ?? []),
    ...(isContentLayoutBase(l.base) ? [l.base.ref] : []),
    ...l.pieces.flatMap((p) => (p.content ? [p.content.pack] : [])),
  ]);
}
