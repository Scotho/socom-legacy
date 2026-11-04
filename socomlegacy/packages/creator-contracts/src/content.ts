/**
 * Content references (FCW-07a), a browser adaptation with no original: how a layout record names an asset a creator
 * pack supplies, beside the retail `<archive>:<prototype>` ids that name the player's own disc. A record holds the
 * reference only -- never the pack's bytes (the registry, FCW-06, owns those; XT.R4, H275, H276).
 */
import { compareUtf8 } from "./digest.js";
import type { PackRef } from "./packs.js";
import { parseSemver } from "./semver.js";

/** A pack asset: the pack by its identity (`PackRef`, the hash `packDigest`'s) and the asset's id inside it. */
export interface ContentRef {
  readonly kind: "pack";
  readonly pack: PackRef;
  readonly assetId: string;
}

/** An asset id inside a pack: the same characters and length as a disc prototype's name. */
export const CONTENT_ASSET_ID = /^[A-Za-z0-9_.-]{1,64}$/;

const HEX64 = /^[0-9a-f]{64}$/;
/**
 * A pack id as `packs.ts` reads a manifest's (`packId`, not exported there): 1-64 of `a-z 0-9 . -`, a letter or digit
 * at each end, no `..`, a legacy adapter's namespace (`mod.`, `model.`, `texture.`) outside the 64, since an adapted
 * pack's `PackRef` carries it.
 */
const PACK_ID = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const LEGACY_NAMESPACE = /^(?:mod|model|texture)\./;
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const keysOnly = (v: Record<string, unknown>, keys: readonly string[]): string | null => {
  for (const k of Object.keys(v)) if (!keys.includes(k)) return k;
  return null;
};

/** Null when `v` is a `PackRef` {id, version, hash} and nothing else, else why not. */
export function checkPackRef(v: unknown): string | null {
  if (!isObject(v)) return "a pack reference is not {id, version, hash}";
  const extra = keysOnly(v, ["id", "version", "hash"]);
  if (extra) return `a pack reference names no field ${extra}`;
  const id = v["id"];
  if (typeof id !== "string" || id.length > 64 + "texture.".length || !PACK_ID.test(id) || id.includes("..")
    || id.replace(LEGACY_NAMESPACE, "").length > 64) return "a pack reference's id is not a pack id";
  if (typeof v["version"] !== "string" || !parseSemver(v["version"])) return "a pack reference's version is not a SemVer version";
  if (typeof v["hash"] !== "string" || !HEX64.test(v["hash"])) return "a pack reference's hash is not 64 lower-case hex digits";
  return null;
}

/** Null when `v` is a `ContentRef` {kind: "pack", pack, assetId} and nothing else, else why not. */
export function checkContentRef(v: unknown): string | null {
  if (!isObject(v)) return "a content reference is not {kind, pack, assetId}";
  const extra = keysOnly(v, ["kind", "pack", "assetId"]);
  if (extra) return `a content reference names no field ${extra}`;
  if (v["kind"] !== "pack") return "a content reference's kind is not pack";
  const why = checkPackRef(v["pack"]);
  if (why) return why;
  if (typeof v["assetId"] !== "string" || !CONTENT_ASSET_ID.test(v["assetId"])) return "a content reference's assetId is not 1-64 of A-Z a-z 0-9 _ . -";
  return null;
}

/** One string for a pack identity: `<id>@<version>#<hash>`. */
export const packRefKey = (ref: PackRef): string => `${ref.id}@${ref.version}#${ref.hash}`;
export const samePackRef = (a: PackRef, b: PackRef): boolean => a.id === b.id && a.version === b.version && a.hash === b.hash;

/** The references each once (`packRefKey`), in UTF-8 byte order of that key, each a plain {id, version, hash}. */
export function sortPackRefs(refs: readonly PackRef[]): PackRef[] {
  const byKey = new Map<string, PackRef>();
  for (const r of refs) byKey.set(packRefKey(r), { id: r.id, version: r.version, hash: r.hash });
  return [...byKey.keys()].sort(compareUtf8).map((k) => byKey.get(k)!);
}

/**
 * The layout's in-memory key for a pack piece (`Layout` `Piece.asset`): a label the page can show and compare, never
 * read as a disc archive -- the piece's `content` is the reference. The disc's own ids (`MP2:crate`) never start `pack:`.
 */
export const contentAssetKey = (ref: ContentRef): string => `pack:${ref.pack.id}@${ref.pack.version}#${ref.pack.hash.slice(0, 12)}/${ref.assetId}`;

/** The references not among `available` (same id, version and hash), in their own order. */
export function missingPackRefs(requires: readonly PackRef[], available: readonly PackRef[]): PackRef[] {
  return requires.filter((r) => !available.some((a) => samePackRef(a, r))).map((r) => ({ id: r.id, version: r.version, hash: r.hash }));
}
