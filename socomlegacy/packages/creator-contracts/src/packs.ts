/**
 * Pack framework v2 (XT-1) and its validator (XT-3 diagnostics), a browser adaptation with no original
 * (`PACK_FRAMEWORK_ADAPTATION`; the frozen contract is `docs/specs/2026-10-25-pack-framework.md`). Nothing here reads
 * the disc, runs a pack's bytes or changes what the game does: it checks approved bytes against a manifest and the
 * build's context, and only a passing check yields a usable manifest and `PackRef`.
 */
import { checkReport, diagnostic, type CheckReport, type Diagnostic, type DiagnosticInput, type PackDiagnostic } from "./diagnostics.js";
import { compareUtf8, createSha256, packDigest, sha256Hex, type Sha256 } from "./digest.js";
import { compareSemver, parseRange, parseSemver, satisfiesRange } from "./semver.js";

export const PACK_FRAMEWORK_ADAPTATION =
  "a creator pack format with no original: opt-in, device-local bytes, checked before use; with no pack enabled the game is unchanged" as const;

export const PACK_FORMAT = "s2u-pack" as const;
export const PACK_FORMAT_VERSION = 2 as const;
/** The v2 manifest's name inside a pack (`pack.json` is already a texture upload's metadata member). */
export const PACK_MANIFEST_FILE = "s2u-pack.json" as const;
/**
 * The engine contract version the browser publishes today (product-track adaptation: the first published contract of
 * the pack framework v2; a manifest's `contract` range is checked against it). Under the repository's caret SemVer
 * (`semver.ts`: `^0.y.z` fixes the minor) an additive seam bumps the patch, so `^0.1.0` packs keep loading, and an
 * incompatible one the minor. 0.1.1 is FCW-30's rules vocabulary (a rules pack states `^0.1.1`); 0.1.2 is FP-4's bundle
 * (`bundle.ts`) and content map v2 (`maps.ts`), both additive. A registry builds its PackContext with it, not a guess.
 */
export const ENGINE_CONTRACT_VERSION = "0.1.2";
/** The disc revision this build targets (the US disc's product code, DATA_SOURCES.md); a manifest's `target`. */
export const PACK_TARGET_US = "SCUS-97275";
/**
 * The contract's own target aliases: an earlier spelling -> its canonical target. `socom2-us-r0001` is the `s2u-mod` v1
 * loader's (`viewer/src/mods/manifest.ts` `MOD_GAME_TARGET`, its only spelling). Only a legacy adapter resolves one; a
 * v2 manifest names the canonical value, and the registry never rewrites a target.
 */
export const PACK_TARGET_ALIASES: Readonly<Record<string, string>> = Object.freeze({ "socom2-us-r0001": PACK_TARGET_US });
/** The canonical target: exactly `PACK_TARGET_US`, or an alias's canonical value; anything else (no trimming or case folding) null. */
export function canonicalPackTarget(raw: unknown): string | null {
  if (raw === PACK_TARGET_US) return PACK_TARGET_US;
  return typeof raw === "string" && Object.prototype.hasOwnProperty.call(PACK_TARGET_ALIASES, raw) ? PACK_TARGET_ALIASES[raw]! : null;
}

/** Members in one pack: the local import's file bound (`viewer/src/agent/localFiles.ts` `LOCAL_FILE_LIMITS.files`). */
export const PACK_FILES_ADAPTATION = 8192;
/** All members together: the local import's byte bound (`LOCAL_FILE_LIMITS.bytes`, 512 MiB). */
export const PACK_BYTES_ADAPTATION = 512 * 1024 * 1024;
/** One member: the model pack's largest file (`viewer/src/modelPack.ts` `MODEL_PACK_LIMITS.glbBytes`, 500 MiB). */
export const PACK_MEMBER_BYTES_ADAPTATION = 500 * 1024 * 1024;
/** The manifest: the largest existing pack manifest bound (`viewer/src/texturePack.ts` `PACK_LIMITS.manifestBytes`). */
export const PACK_MANIFEST_BYTES_ADAPTATION = 1024 * 1024;
/** A member path's length and depth: `LOCAL_FILE_LIMITS.path` and `.depth`. */
export const PACK_PATH_CHARS_ADAPTATION = 240;
export const PACK_PATH_DEPTH_ADAPTATION = 16;
/** Chosen by the pack framework spec (no earlier loader names one): dependencies, intents, handler claims, actions. */
export const PACK_DEPENDENCIES_ADAPTATION = 64;
export const PACK_INTENTS_ADAPTATION = 64;
export const PACK_HANDLERS_ADAPTATION = 32;
export const PACK_HANDLER_ACTIONS_ADAPTATION = 64;
/**
 * A handler claim's `options` (LATER 458, chosen by the controller for the extension contracts; no earlier loader names
 * one): the UTF-8 bytes of their JSON, and how deep they nest (the options object is 1, an object or list in it 2).
 * The contract checks only this shape; the claimed handler checks the content (the tint's `checkVisualTintOptions`).
 */
export const PACK_HANDLER_OPTIONS_BYTES_ADAPTATION = 4096;
export const PACK_HANDLER_OPTIONS_DEPTH_ADAPTATION = 2;
/**
 * Text bounds: the `s2u-mod` v1 manifest's id, name and description (`viewer/src/mods/manifest.ts`). An id may carry
 * one legacy namespace (`mod.`, `model.`, `texture.`) outside its 64 characters, so every valid v1 id maps onto v2.
 */
export const PACK_ID_CHARS_ADAPTATION = 64;
export const PACK_NAME_CHARS_ADAPTATION = 48;
export const PACK_DESCRIPTION_CHARS_ADAPTATION = 400;

/**
 * The lowest engine contract a rules pack may admit (FCW-33, FCW-30's review F4): 0.1.1 is the first contract that
 * carries the rules vocabulary (`rules.ts`'s header; FCW-30). A fixed fact, not the build's version: it stays 0.1.1
 * when `ENGINE_CONTRACT_VERSION` moves on. A rules pack's `contract` holds, in every `||` alternative, a lower bound
 * (`>=`, `>`, `^`, `~`, `=` or a bare version) at or above it, so the range admits no engine before it.
 */
export const RULES_PACK_CONTRACT_FLOOR = "0.1.1";
/**
 * A `rules` member is read whole once (hashed and parsed from the same bytes) for its `RulesSpec.capabilities`; its
 * bound is the manifest's (`PACK_MANIFEST_BYTES_ADAPTATION`, 1 MiB), far above what the rules budgets (`rules.ts`
 * `*_ADAPTATION`) let a spec hold. FCW-33's choice.
 */
export const PACK_RULES_MEMBER_BYTES_ADAPTATION = PACK_MANIFEST_BYTES_ADAPTATION;
/**
 * Thunderstore's root files (wiki.thunderstore.io, "Creating a package", as the rules spec §8 quotes it): beside a v2
 * pack's `s2u-pack.json` they are a defined exception, never members -- a `files` row naming one is `STORE_FILE`, and
 * one present at the pack's root (that exact spelling) is not `MEMBER_UNLISTED`. They are not hashed, so the pack's
 * identity (`packDigest`, over the manifest) stays the same when only they change. A pack with no `s2u-pack.json` has
 * no exception: a texture pack's root `manifest.json` is its legacy manifest.
 */
export const THUNDERSTORE_STORE_FILES = Object.freeze(["manifest.json", "icon.png", "README.md", "CHANGELOG.md"] as const);
const STORE_FILES: ReadonlySet<string> = new Set(THUNDERSTORE_STORE_FILES);

export const PACK_KINDS = ["content", "rules", "system"] as const;
export type PackKind = (typeof PACK_KINDS)[number];
/** The three earlier loaders (XT.R11), read through `legacy` adapters onto v2 `content`. */
export const LEGACY_PACK_KINDS = ["mod", "model", "texture"] as const;
export type LegacyPackKind = (typeof LEGACY_PACK_KINDS)[number];
export const PACK_SIDES = ["client", "server", "both"] as const;
export type PackSide = (typeof PACK_SIDES)[number];
export const PACK_ROLES = ["mesh", "texture", "audio", "collision", "gameplay", "rules", "system", "data", "legacy-manifest"] as const;
export type PackFileRole = (typeof PACK_ROLES)[number];
/** XT.R12: what a change is declared to be. */
export const PACK_INTENT_KINDS = ["cosmetic", "gameplay-value", "new-behaviour"] as const;
export type PackIntentKind = (typeof PACK_INTENT_KINDS)[number];
/** The payload types each role carries (XT.R1's open formats); `data` is any. */
const ROLE_TYPES: Readonly<Record<PackFileRole, RegExp | null>> = {
  mesh: /\.(glb|gltf)$/i,
  texture: /\.(png|ktx2|rgba)$/i,
  audio: /\.(ogg|wav)$/i,
  collision: /\.(json|glb)$/i,
  gameplay: /\.json$/i,
  rules: /\.json$/i,
  system: /\.json$/i,
  data: null,
  "legacy-manifest": /\.json$/i,
};
/** Roles whose bytes change play, so a cosmetic intent cannot cover them. */
const GAMEPLAY_ROLES: ReadonlySet<PackFileRole> = new Set(["collision", "gameplay", "rules"]);
/**
 * The validator's own role tables, exported for the modding wiki's generated reference (B205 MW-2, MW.R5; exports
 * only): the same objects the check reads, so the wiki describes what the validator does, never a copy. Read-only by
 * type; nothing is to change them at run time.
 */
export const PACK_ROLE_TYPES: Readonly<Record<PackFileRole, RegExp | null>> = ROLE_TYPES;
export const PACK_GAMEPLAY_ROLES: ReadonlySet<PackFileRole> = GAMEPLAY_ROLES;

export const PACK_CODES = {
  manifestMissing: "pack.MANIFEST_MISSING",
  manifestTooLarge: "pack.MANIFEST_TOO_LARGE",
  manifestInvalid: "pack.MANIFEST_INVALID",
  legacyInvalid: "pack.LEGACY_INVALID",
  fieldUnknown: "pack.FIELD_UNKNOWN",
  fieldInvalid: "pack.FIELD_INVALID",
  formatVersion: "pack.FORMAT_VERSION",
  targetMismatch: "pack.TARGET_MISMATCH",
  contractMismatch: "pack.CONTRACT_MISMATCH",
  pathInvalid: "pack.PATH_INVALID",
  pathEscape: "pack.PATH_ESCAPE",
  pathCollision: "pack.PATH_COLLISION",
  externalUri: "pack.EXTERNAL_URI",
  tooManyFiles: "pack.TOO_MANY_FILES",
  tooLarge: "pack.TOO_LARGE",
  limitExceeded: "pack.LIMIT_EXCEEDED",
  memberTooLarge: "pack.MEMBER_TOO_LARGE",
  memberInflated: "pack.MEMBER_INFLATED",
  memberTruncated: "pack.MEMBER_TRUNCATED",
  memberMissing: "pack.MEMBER_MISSING",
  memberHashMismatch: "pack.MEMBER_HASH_MISMATCH",
  memberUnlisted: "pack.MEMBER_UNLISTED",
  roleMismatch: "pack.ROLE_MISMATCH",
  intentMissing: "pack.INTENT_MISSING",
  intentMismatch: "pack.INTENT_MISMATCH",
  duplicateId: "pack.DUPLICATE_ID",
  dependencyMissing: "pack.DEPENDENCY_MISSING",
  dependencyArchiveMismatch: "pack.DEPENDENCY_ARCHIVE_MISMATCH",
  dependencyCycle: "pack.DEPENDENCY_CYCLE",
  handlerConflict: "pack.HANDLER_CONFLICT",
  handlerUnknown: "pack.HANDLER_UNKNOWN",
  actionUnknown: "pack.ACTION_UNKNOWN",
  /** A `files` row naming one of Thunderstore's root files (`THUNDERSTORE_STORE_FILES`): never a member (FCW-33). */
  storeFile: "pack.STORE_FILE",
  /** A rules pack whose `contract` admits an engine before `RULES_PACK_CONTRACT_FLOOR` (FCW-33, FCW-30's review F4). */
  contractFloor: "pack.CONTRACT_FLOOR",
  /** A `rules` member that is not a UTF-8 JSON object, or whose `capabilities` are not a list of claims (FCW-33). */
  rulesMemberInvalid: "pack.RULES_MEMBER_INVALID",
  /** A rules member's `RulesSpec.capabilities` and the manifest's `behaviour` handler claims disagree (FCW-33). */
  capabilityMismatch: "pack.CAPABILITY_MISMATCH",
  checkSkipped: "pack.CHECK_SKIPPED",
} as const;
export type PackCode = (typeof PACK_CODES)[keyof typeof PACK_CODES];

/** A pack's identity (XT.R6): id, version and the canonical pack hash (`packDigest`). Compatibility, never proof. */
export interface PackRef {
  readonly id: string;
  readonly version: string;
  readonly hash: string;
}
export interface PackFileEntry {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
  readonly role: PackFileRole;
}
export type PackDependency = { readonly id: string; readonly range: string } | { readonly archive: string; readonly sha256: string };
export interface PackIntent {
  readonly kind: PackIntentKind;
  readonly files: readonly string[];
}
/**
 * A claim on an engine-owned handler slot, naming the engine handler and the actions it uses (no pack code), and the
 * options it gives that handler: plain JSON data whose shape the contract bounds (`PACK_HANDLER_OPTIONS_*`) and whose
 * content only the handler checks (LATER 458). The application hands them to the handler's system; a claim without
 * options leaves the application's own.
 */
export interface PackHandlerClaim {
  readonly slot: string;
  readonly handler: string;
  readonly actions?: readonly string[];
  readonly options?: Readonly<Record<string, unknown>>;
}
export interface PackManifest {
  readonly format: typeof PACK_FORMAT;
  readonly formatVersion: typeof PACK_FORMAT_VERSION;
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description?: string;
  /** The disc revision this pack is for (`PACK_TARGET_US`, never an alias). */
  readonly target: string;
  /** The engine contract version range it needs. */
  readonly contract: string;
  readonly kinds: readonly PackKind[];
  readonly sides: PackSide;
  readonly dependencies: readonly PackDependency[];
  /** NFC paths in UTF-8 byte order. */
  readonly files: readonly PackFileEntry[];
  readonly intents: readonly PackIntent[];
  readonly handlers?: readonly PackHandlerClaim[];
  /** Set only by a legacy adapter: the earlier loader and its manifest member. */
  readonly legacy?: { readonly kind: LegacyPackKind; readonly manifest: string };
}

/** One approved member held whole: its path in the pack and its bytes. */
export interface BufferedPackFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}
/**
 * One approved member held by a store (a 500 MiB member kept as chunks in IndexedDB): `size` is the byte count the
 * store declares, and `read()` yields the bytes in order, once per call. The validator bounds and compares `size`
 * before any read, hashes the chunks as they come, stops reading at the first byte past `size`, and never reassembles
 * or keeps them.
 */
export interface StreamedPackFile {
  readonly path: string;
  readonly size: number;
  read(): AsyncIterable<Uint8Array>;
}
/** One approved member, whole or streamed. */
export type PackFile = BufferedPackFile | StreamedPackFile;
/** A member held by a store and read as a stream. */
export function isStreamedPackFile(file: PackFile): file is StreamedPackFile {
  return typeof (file as Partial<StreamedPackFile>).read === "function";
}
/** An engine-owned handler the build offers: its slot and its allowed actions (FCW-07b's registry supplies these). */
export interface PackHandlerCapability {
  readonly id: string;
  readonly slot: string;
  readonly actions: readonly string[];
  /**
   * Whether its slot is held by one pack at a time (`HandlerSlot.exclusive`, set by `handlerCatalogue`). Absent: exclusive,
   * today's behaviour. `false` makes the slot shared: another pack's hold on it is no `HANDLER_CONFLICT` (LATER 472).
   */
  readonly exclusive?: boolean;
}
export interface AvailablePack {
  readonly ref: PackRef;
  readonly dependencies?: readonly { readonly id: string; readonly range: string }[];
}
/** `viewer/src/mods/manifest.ts` `ModManifest`, structurally (parsed by the viewer's own parser). */
export interface LegacyModShape {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly target: string;
  readonly files: readonly { readonly file: string }[];
}
/** `viewer/src/modelPack.ts` `ModelManifest`, structurally. */
export interface LegacyModelShape {
  readonly models: readonly { readonly id?: string; readonly file: string }[];
}
/** `viewer/src/texturePack.ts` `PackManifest`, structurally. */
export interface LegacyTextureShape {
  readonly mapArchive: string;
  readonly entries: readonly { readonly file: string; readonly sha256: string; readonly bytes: number }[];
  readonly provenance?: { readonly archiveSha256?: string };
}
export type LegacyPackInput =
  | { readonly kind: "mod"; readonly manifestPath: string; readonly manifest: LegacyModShape }
  | { readonly kind: "model"; readonly manifestPath: string; readonly manifest: LegacyModelShape; readonly id?: string; readonly version?: string }
  | { readonly kind: "texture"; readonly manifestPath: string; readonly manifest: LegacyTextureShape };

/** The build and dependency context. A check whose context is absent is skipped and said, never passed. */
export interface PackContext {
  /** The build's disc revision. */
  readonly target: string;
  /** The build's engine contract version (SemVer). */
  readonly contract: string;
  /** Packs available to satisfy dependencies; absent: dependencies are not resolved (skipped). */
  readonly packs?: readonly AvailablePack[];
  /** The user's own disc archives by path, with their SHA-256; absent: archive dependencies are skipped. */
  readonly archives?: Readonly<Record<string, string>>;
  /** The engine-owned handler catalogue; absent: handler claims are skipped. */
  readonly handlers?: readonly PackHandlerCapability[];
  /** Slots already held, by the holding pack's id. */
  readonly claimedSlots?: Readonly<Record<string, string>>;
  /** With no `s2u-pack.json`: the earlier loader's parsed manifest. */
  readonly legacy?: LegacyPackInput;
  /** The digest; WebCrypto by default. */
  readonly sha256?: Sha256;
}

export type PackValidation =
  | { readonly ok: true; readonly manifest: PackManifest; readonly ref: PackRef; readonly report: CheckReport }
  | { readonly ok: false; readonly report: CheckReport };

type Extra = Pick<DiagnosticInput, "file" | "field" | "expected" | "actual" | "hint">;
class Findings {
  readonly list: PackDiagnostic[] = [];
  errors = 0;
  error(code: PackCode, text: string, extra: Extra = {}): void {
    this.list.push(diagnostic({ source: "pack", severity: "error", code, text, ...extra }) as PackDiagnostic);
    this.errors++;
  }
  skipped(field: string, text: string): void {
    this.list.push(diagnostic({ source: "pack", severity: "note", status: "skipped", code: PACK_CODES.checkSkipped, text, field }) as PackDiagnostic);
  }
}

/** A member's declared byte count: its bytes' length, or the store's `size` (known before any byte is read). */
function memberSize(file: PackFile): number {
  return isStreamedPackFile(file) ? file.size : file.bytes.length;
}

/** One read of a member: its SHA-256 (null when the read stopped past the declared size) and the bytes it counted. */
interface MemberRead {
  readonly sha256: string | null;
  readonly size: number;
}
type MemberReader = (file: PackFile) => Promise<MemberRead>;

/**
 * The one hashing path for a member. Whole bytes are hashed at once (`context.sha256`, else WebCrypto); a streamed
 * member's chunks are fed to `createSha256()` with a running count, never concatenated or kept, and the read stops
 * (the iteration is broken, so the store's cursor closes) at the first chunk that carries the count past `size`.
 */
async function memberHash(file: PackFile, hash?: Sha256): Promise<MemberRead> {
  if (!isStreamedPackFile(file)) return { sha256: await sha256Hex(file.bytes, hash), size: file.bytes.length };
  const stream = createSha256();
  let size = 0;
  let over = false;
  for await (const chunk of file.read()) {
    size += chunk.length;
    if (size > file.size) {
      over = true;
      break;
    }
    stream.update(chunk);
  }
  return { sha256: over ? null : await stream.digestHex(), size };
}

/**
 * A small member's text (a manifest, whose size the caller has bounded before this reads it): a stream is gathered
 * into one buffer of its declared `size` and never past it. `text` is null when the bytes counted are not the declared
 * size (`size` says how many were), or are not UTF-8; a leading byte-order mark is dropped.
 */
async function memberText(file: PackFile): Promise<{ readonly text: string | null; readonly size: number }> {
  const body = await memberBytes(file);
  return { text: body.bytes === null ? null : utf8Text(body.bytes), size: body.size };
}

/**
 * A small member's bytes, gathered once (a manifest, a `rules` member; the caller has bounded the size): a stream into
 * one buffer of its declared `size`, never past it. `bytes` is null when the bytes counted are not the declared size.
 */
async function memberBytes(file: PackFile): Promise<{ readonly bytes: Uint8Array | null; readonly size: number }> {
  if (!isStreamedPackFile(file)) return { bytes: file.bytes, size: file.bytes.length };
  const body = new Uint8Array(file.size);
  let size = 0;
  for await (const chunk of file.read()) {
    if (size + chunk.length > file.size) return { bytes: null, size: size + chunk.length };
    body.set(chunk, size);
    size += chunk.length;
  }
  return size < file.size ? { bytes: null, size } : { bytes: body, size };
}

/** UTF-8 text, a leading byte-order mark dropped; null when the bytes are not UTF-8. */
function utf8Text(body: Uint8Array): string | null {
  try {
    const bom = body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf;
    return new TextDecoder("utf-8", { fatal: true }).decode(bom ? body.subarray(3) : body);
  } catch {
    return null;
  }
}

/** A member whose bytes are not its declared size: inflated past it, or truncated short of it. */
function sizeFinding(f: Findings, file: string, declared: number, actual: number): void {
  const extra = { file, expected: String(declared), actual: String(actual) };
  if (actual > declared) f.error(PACK_CODES.memberInflated, "A member is larger than its declared size.", extra);
  else f.error(PACK_CODES.memberTruncated, "A member is smaller than its declared size.", extra);
}

const HEX64 = /^[0-9a-f]{64}$/;
const PRINTABLE = /^[\x20-\x7e]*$/;
const PACK_ID = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
/**
 * The namespaces the legacy adapters add; each sits outside the id's budget, and each is the adapters' alone: a v2
 * manifest's own id may not begin with one (a `{id, range}` dependency may name an adapted pack by it).
 */
const LEGACY_NAMESPACE = /^(?:mod|model|texture)\./;
const LEGACY_NAMESPACE_CHARS = "texture.".length;
const HANDLE = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/;
const URI_ANYWHERE = /[a-z][a-z0-9+.-]*:\/\//i;
const URI_START = /^\s*(?:data|javascript|vbscript|blob|file|about|mailto):/i;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i;
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const packId = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length <= PACK_ID_CHARS_ADAPTATION + LEGACY_NAMESPACE_CHARS &&
  PACK_ID.test(v) &&
  !v.includes("..") &&
  v.replace(LEGACY_NAMESPACE, "").length <= PACK_ID_CHARS_ADAPTATION;
const handle = (v: unknown): v is string => typeof v === "string" && v.length <= 64 && HANDLE.test(v);

/** Why a claim's options are refused: the field's expected and actual values. */
interface OptionsFault {
  readonly why: string;
  readonly expected: string;
  readonly actual: string;
}
const kindOf = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "a list" : typeof v);
const plainObject = (v: unknown): v is Record<string, unknown> =>
  isObject(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
/**
 * A claim's options as the contract takes them (LATER 458): a copy of a plain JSON object -- null, booleans, finite
 * numbers, strings, and lists or objects at most `PACK_HANDLER_OPTIONS_DEPTH_ADAPTATION` deep, no `__proto__`, `constructor` or `prototype` key --
 * whose JSON is at most `PACK_HANDLER_OPTIONS_BYTES_ADAPTATION` UTF-8 bytes; or why it is refused. The content is the
 * handler's to check.
 */
function copyClaimOptions(raw: unknown): { readonly value: Record<string, unknown> } | { readonly fault: OptionsFault } {
  const depth = PACK_HANDLER_OPTIONS_DEPTH_ADAPTATION;
  if (!plainObject(raw)) return { fault: { why: "A claim's options are a plain JSON object.", expected: "an object", actual: kindOf(raw) } };
  const state: { fault: OptionsFault | null } = { fault: null };
  const copy = (v: unknown, level: number): unknown => {
    if (state.fault) return null;
    if (v === null || typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number") {
      if (Number.isFinite(v)) return v;
      state.fault = { why: "A claim's options hold only finite numbers.", expected: "a finite number", actual: String(v) };
      return null;
    }
    if (!Array.isArray(v) && !plainObject(v)) {
      state.fault = { why: "A claim's options hold only JSON data.", expected: "null, a boolean, a number, a string, a list or an object", actual: kindOf(v) };
      return null;
    }
    if (level > depth) {
      state.fault = { why: `A claim's options nest at most ${depth} deep.`, expected: String(depth), actual: String(level) };
      return null;
    }
    if (Array.isArray(v)) return Array.from(v, (x) => copy(x, level + 1));
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") {
        state.fault = { why: "A claim's options name no __proto__, constructor or prototype key.", expected: "a plain key", actual: k };
        return null;
      }
      out[k] = copy(x, level + 1);
    }
    return out;
  };
  const value = copy(raw, 1) as Record<string, unknown>;
  if (state.fault) return { fault: state.fault };
  const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
  if (bytes > PACK_HANDLER_OPTIONS_BYTES_ADAPTATION) {
    return { fault: { why: `A claim's options are at most ${PACK_HANDLER_OPTIONS_BYTES_ADAPTATION} bytes of JSON.`, expected: String(PACK_HANDLER_OPTIONS_BYTES_ADAPTATION), actual: String(bytes) } };
  }
  return { value };
}
const text = (v: unknown, min: number, max: number): v is string => typeof v === "string" && v.length >= min && v.length <= max && PRINTABLE.test(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

type PathResult = { ok: true; path: string } | { ok: false; code: PackCode; text: string };
/** A member path: relative, forward slashes, NFC, no escape, no scheme, no unsafe or reserved segment. */
export function packPath(raw: unknown): PathResult {
  const bad = (code: PackCode, why: string): PathResult => ({ ok: false, code, text: why });
  if (typeof raw !== "string" || raw.length === 0) return bad(PACK_CODES.pathInvalid, "A path must be a non-empty string.");
  if (/^[a-z]:/i.test(raw)) return bad(PACK_CODES.pathEscape, "A path must be relative to the pack, not on a drive.");
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return bad(PACK_CODES.externalUri, "A path must name a member, not a URI.");
  if (raw.startsWith("/") || raw.startsWith("\\")) return bad(PACK_CODES.pathEscape, "A path must be relative to the pack, not absolute.");
  if (raw.includes("\\")) return bad(PACK_CODES.pathInvalid, "Use forward slashes.");
  const path = raw.normalize("NFC");
  if (path.length > PACK_PATH_CHARS_ADAPTATION) return bad(PACK_CODES.pathInvalid, `A path is at most ${PACK_PATH_CHARS_ADAPTATION} characters.`);
  if (/[\u0000-\u001f\u007f:%]/.test(path)) return bad(PACK_CODES.pathInvalid, "A path holds no control character, colon or percent sign.");
  const parts = path.split("/");
  if (parts.includes("..")) return bad(PACK_CODES.pathEscape, "A path must not leave the pack (`..`).");
  if (parts.length > PACK_PATH_DEPTH_ADAPTATION) return bad(PACK_CODES.pathInvalid, `A path is at most ${PACK_PATH_DEPTH_ADAPTATION} folders deep.`);
  for (const part of parts) {
    if (!part || part === "." || part.startsWith(".") || /[. ]$/.test(part) || /[<>"|?*]/.test(part) || RESERVED.test(part)) {
      return bad(PACK_CODES.pathInvalid, "A path segment is empty, hidden, reserved or unsafe.");
    }
  }
  return { ok: true, path };
}

/**
 * Whether a range (already parsed by `parseRange`) admits no version before `floor`: every `||` alternative holds a
 * lower bound -- `>=v`, `>v`, `^v`, `~v`, `=v` or a bare `v` -- with `v` at or above `floor` by SemVer precedence (a
 * pre-release of the floor is below it). Sufficient, and stated so: an alternative bounded only from above, or `*`, or
 * by a floor below `floor` (`>0.1.0` admits `0.1.1-rc.1`) is refused even where it happens to be empty. The tokens are
 * `semver.ts` `parseRange`'s (alternatives split on `||`, comparators on spaces).
 */
function rangeHasFloor(range: string, floor: string): boolean {
  const least = parseSemver(floor)!;
  return range.split("||").every((alt) =>
    alt.trim().split(/\s+/).filter(Boolean).some((token) => {
      const m = /^(<=|>=|<|>|=|\^|~)?(.+)$/.exec(token);
      if (!m || m[1] === "<" || m[1] === "<=") return false;
      const v = parseSemver(m[2]!);
      return v !== null && compareSemver(v, least) >= 0;
    }),
  );
}

function scanUris(value: unknown, at: string, f: Findings, flagged: Set<string>): void {
  if (/^intents\[\d+\]\.files\[\d+\]$/.test(at)) return;
  if (typeof value === "string") {
    if (URI_ANYWHERE.test(value) || URI_START.test(value)) {
      f.error(PACK_CODES.externalUri, "A pack names no external URI: every byte comes from the pack or the user's own disc.", { field: at, actual: value.slice(0, 80) });
      flagged.add(at);
    }
  } else if (Array.isArray(value)) value.forEach((v, i) => scanUris(v, `${at}[${i}]`, f, flagged));
  else if (isObject(value)) for (const [k, v] of Object.entries(value)) scanUris(v, at ? `${at}.${k}` : k, f, flagged);
}

const TOP_KEYS = new Set(["format", "formatVersion", "id", "version", "name", "description", "target", "contract", "kinds", "sides", "dependencies", "files", "intents", "handlers"]);
const ROW_KEYS = new Set(["path", "sha256", "size", "role"]);
const CLAIM_KEYS = new Set(["slot", "handler", "actions", "options"]);
/**
 * The fields the validator accepts -- a manifest's top level (beside `legacy`, an adapter's alone), a `files` row, a
 * `handlers` claim -- exported for the modding wiki's generated reference and its drift test (B205 MW-2, MW.R5; exports
 * only): the same `Set`s `readManifest` reads, so the wiki's field list is the validator's. Read-only by type.
 */
export const PACK_MANIFEST_KEYS: ReadonlySet<string> = TOP_KEYS;
export const PACK_FILE_ROW_KEYS: ReadonlySet<string> = ROW_KEYS;
export const PACK_HANDLER_CLAIM_KEYS: ReadonlySet<string> = CLAIM_KEYS;

interface Parsed {
  manifest: PackManifest;
  /** Dependency indices that are resolvable (not duplicate, not self). */
  packDeps: number[];
  archiveDeps: number[];
  claims: number[];
}

function readManifest(raw: Record<string, unknown>, context: PackContext, f: Findings, legacy: boolean): Parsed | null {
  const start = f.errors;
  for (const key of Object.keys(raw)) {
    if (TOP_KEYS.has(key) || (legacy && key === "legacy")) continue;
    const hint = "Remove it; v2 accepts only its listed fields.";
    f.error(PACK_CODES.fieldUnknown, `The manifest has no field "${key.slice(0, 40)}".`, { field: key.slice(0, 80), hint });
  }
  const flagged = new Set<string>();
  scanUris(raw, "", f, flagged);
  const invalid = (field: string, why: string, expected?: string): void => f.error(PACK_CODES.fieldInvalid, why, { field, expected });

  if (raw.format !== PACK_FORMAT) invalid("format", `format must be "${PACK_FORMAT}".`, PACK_FORMAT);
  if (raw.formatVersion !== PACK_FORMAT_VERSION) {
    f.error(PACK_CODES.formatVersion, `formatVersion must be ${PACK_FORMAT_VERSION}.`, { field: "formatVersion", expected: String(PACK_FORMAT_VERSION), actual: String(raw.formatVersion) });
  }
  const reserved = !legacy && typeof raw.id === "string" ? LEGACY_NAMESPACE.exec(raw.id) : null;
  if (reserved) {
    invalid("id", `id must not begin with "${reserved[0]}": the prefixes mod., model. and texture. are reserved for the earlier loaders' adapters.`);
  } else if (!packId(raw.id)) {
    const after = legacy ? " (after mod., model. or texture.)" : "";
    invalid("id", `id is 1-64 characters of a-z, 0-9, dots and hyphens, starting and ending with a letter or digit${after}.`);
  }
  if (typeof raw.version !== "string" || !parseSemver(raw.version)) invalid("version", "version must be a semantic version such as 1.0.0.");
  if (!text(raw.name, 1, PACK_NAME_CHARS_ADAPTATION)) invalid("name", `name is 1-${PACK_NAME_CHARS_ADAPTATION} printable characters.`);
  if (raw.description !== undefined && !flagged.has("description") && !text(raw.description, 0, PACK_DESCRIPTION_CHARS_ADAPTATION)) {
    invalid("description", `description is at most ${PACK_DESCRIPTION_CHARS_ADAPTATION} printable characters.`);
  }
  if (!text(raw.target, 1, 64)) invalid("target", `target names the disc revision, such as ${PACK_TARGET_US}.`);
  else if (raw.target !== PACK_TARGET_US && canonicalPackTarget(raw.target) !== null) {
    const canonical = canonicalPackTarget(raw.target)!;
    const why = `target "${raw.target}" is an earlier spelling: write the canonical "${canonical}".`;
    f.error(PACK_CODES.fieldInvalid, why, { field: "target", expected: canonical, actual: raw.target });
  } else if (raw.target !== context.target) {
    f.error(PACK_CODES.targetMismatch, "The pack is for another disc revision than this build's.", { field: "target", expected: context.target, actual: raw.target });
  }
  if (typeof raw.contract !== "string" || !parseRange(raw.contract)) invalid("contract", "contract is a version range such as ^1.0.0.");
  else if (satisfiesRange(context.contract, raw.contract) !== true) {
    f.error(PACK_CODES.contractMismatch, "The build's engine contract is outside the pack's range.", { field: "contract", expected: raw.contract, actual: context.contract });
  }
  const kinds = raw.kinds;
  if (!Array.isArray(kinds) || kinds.length < 1 || kinds.length > PACK_KINDS.length || new Set(kinds).size !== kinds.length || !kinds.every((k) => oneOf(PACK_KINDS, k))) {
    invalid("kinds", `kinds lists each of ${PACK_KINDS.join(", ")} at most once.`);
  }
  if (!oneOf(PACK_SIDES, raw.sides)) invalid("sides", `sides is one of ${PACK_SIDES.join(", ")}.`);
  if (Array.isArray(kinds) && kinds.includes("rules") && typeof raw.contract === "string" && parseRange(raw.contract) && !rangeHasFloor(raw.contract, RULES_PACK_CONTRACT_FLOOR)) {
    const why = `A rules pack's contract admits no engine before ${RULES_PACK_CONTRACT_FLOOR}, the first with the rules vocabulary.`;
    f.error(PACK_CODES.contractFloor, why, { field: "contract", expected: `^${RULES_PACK_CONTRACT_FLOOR}`, actual: raw.contract, hint: `State ^${RULES_PACK_CONTRACT_FLOOR} or a range whose every alternative starts at ${RULES_PACK_CONTRACT_FLOOR} or above.` });
  }

  const dependencies: PackDependency[] = [];
  const packDeps: number[] = [];
  const archiveDeps: number[] = [];
  if (!Array.isArray(raw.dependencies)) invalid("dependencies", "dependencies is a list (empty when none).");
  else if (raw.dependencies.length > PACK_DEPENDENCIES_ADAPTATION) {
    f.error(PACK_CODES.limitExceeded, "Too many dependencies.", { field: "dependencies", expected: String(PACK_DEPENDENCIES_ADAPTATION), actual: String(raw.dependencies.length) });
  } else {
    const ids = new Set<string>();
    raw.dependencies.forEach((dep: unknown, i: number) => {
      const at = `dependencies[${i}]`;
      if (isObject(dep) && "id" in dep) {
        if (!packId(dep.id) || typeof dep.range !== "string" || !parseRange(dep.range) || Object.keys(dep).length !== 2) {
          return invalid(at, "A pack dependency is {id, range}.");
        }
        if (ids.has(dep.id)) return f.error(PACK_CODES.duplicateId, `${dep.id} is named twice.`, { field: `${at}.id`, actual: dep.id });
        ids.add(dep.id);
        if (dep.id === raw.id) return f.error(PACK_CODES.dependencyCycle, "A pack cannot depend on itself.", { field: `${at}.id`, actual: `${dep.id} > ${dep.id}` });
        packDeps.push(dependencies.length);
        dependencies.push({ id: dep.id, range: dep.range });
      } else if (isObject(dep) && "archive" in dep) {
        if (flagged.has(`${at}.archive`)) return;
        const p = packPath(dep.archive);
        if (!p.ok) return f.error(p.code, p.text, { field: `${at}.archive` });
        if (typeof dep.sha256 !== "string" || !HEX64.test(dep.sha256) || Object.keys(dep).length !== 2) return invalid(at, "A disc archive dependency is {archive, sha256}.");
        if (ids.has(`archive:${p.path}`)) return f.error(PACK_CODES.duplicateId, `${p.path} is named twice.`, { field: `${at}.archive`, actual: p.path });
        ids.add(`archive:${p.path}`);
        archiveDeps.push(dependencies.length);
        dependencies.push({ archive: p.path, sha256: dep.sha256 });
      } else invalid(at, "A dependency is {id, range} or {archive, sha256}.");
    });
  }

  const files: PackFileEntry[] = [];
  const refusedRaw = new Set<string>();
  if (!Array.isArray(raw.files) || raw.files.length < 1) invalid("files", "files lists the pack's members.");
  else if (raw.files.length > PACK_FILES_ADAPTATION) {
    f.error(PACK_CODES.tooManyFiles, "The manifest lists too many members.", { field: "files", expected: String(PACK_FILES_ADAPTATION), actual: String(raw.files.length) });
  } else {
    const seen = new Map<string, string>();
    raw.files.forEach((row: unknown, i: number) => {
      const at = `files[${i}]`;
      if (!isObject(row)) return invalid(at, "A member row is {path, sha256, size, role}.");
      if (isObject(row) && typeof row.path === "string") refusedRaw.add(row.path);
      for (const key of Object.keys(row)) if (!ROW_KEYS.has(key)) return f.error(PACK_CODES.fieldUnknown, `A member row has no field "${key.slice(0, 40)}".`, { field: `${at}.${key.slice(0, 40)}` });
      if (flagged.has(`${at}.path`)) return;
      const p = packPath(row.path);
      if (!p.ok) return f.error(p.code, p.text, { field: `${at}.path`, file: typeof row.path === "string" ? row.path.slice(0, 240) : undefined });
      if (p.path === PACK_MANIFEST_FILE) return invalid(`${at}.path`, `${PACK_MANIFEST_FILE} is the manifest, not a member.`);
      if (!legacy && STORE_FILES.has(p.path)) {
        const hint = "Leave it out of files: the store files ride at the pack's root outside its identity.";
        return f.error(PACK_CODES.storeFile, `${p.path} is a Thunderstore store file, never a member.`, { field: `${at}.path`, file: p.path, hint });
      }
      const fold = p.path.toLowerCase();
      if (seen.has(fold)) {
        return f.error(PACK_CODES.pathCollision, "Two members are one path once normalised (NFC, case).", { field: `${at}.path`, file: p.path, actual: seen.get(fold) });
      }
      seen.set(fold, p.path);
      if (typeof row.sha256 !== "string" || !HEX64.test(row.sha256)) return invalid(`${at}.sha256`, "sha256 is 64 lower-case hex digits.");
      if (!Number.isSafeInteger(row.size) || (row.size as number) < 0) return invalid(`${at}.size`, "size is the member's byte count.");
      if (!oneOf(PACK_ROLES, row.role)) return invalid(`${at}.role`, `role is one of ${PACK_ROLES.join(", ")}.`);
      const types = ROLE_TYPES[row.role];
      if (types && !types.test(p.path)) {
        return f.error(PACK_CODES.roleMismatch, `A ${row.role} member is not that payload type.`, { file: p.path, field: `${at}.role`, expected: types.source, actual: p.path.split("/").pop() });
      }
      refusedRaw.delete(row.path as string);
      files.push({ path: p.path, sha256: row.sha256, size: row.size as number, role: row.role });
    });
  }
  files.sort((a, b) => compareUtf8(a.path, b.path));
  const byPath = new Map(files.map((m) => [m.path, m]));

  const intents: PackIntent[] = [];
  const cover = new Map<string, PackIntentKind[]>();
  if (!Array.isArray(raw.intents)) invalid("intents", "intents declares what each member changes (XT.R12).");
  else if (raw.intents.length > PACK_INTENTS_ADAPTATION) {
    f.error(PACK_CODES.limitExceeded, "Too many intents.", { field: "intents", expected: String(PACK_INTENTS_ADAPTATION), actual: String(raw.intents.length) });
  } else {
    raw.intents.forEach((intent: unknown, i: number) => {
      const at = `intents[${i}]`;
      if (!isObject(intent) || !oneOf(PACK_INTENT_KINDS, intent.kind) || !Array.isArray(intent.files) || intent.files.length < 1 || Object.keys(intent).length !== 2) {
        return invalid(at, `An intent is {kind: ${PACK_INTENT_KINDS.join(" | ")}, files}.`);
      }
      const kind = intent.kind;
      const paths: string[] = [];
      intent.files.forEach((rawPath: unknown, j: number) => {
        if (typeof rawPath === "string" && refusedRaw.has(rawPath)) return;
        const p = packPath(rawPath);
        if (!p.ok || !byPath.has(p.path)) return invalid(`${at}.files[${j}]`, "An intent names a member listed in files.");
        paths.push(p.path);
        cover.set(p.path, [...(cover.get(p.path) ?? []), kind]);
      });
      intents.push({ kind, files: paths });
    });
    for (const m of files) {
      const kinds = cover.get(m.path);
      if (!kinds) {
        const hint = "Add it to a cosmetic, gameplay-value or new-behaviour intent.";
        f.error(PACK_CODES.intentMissing, "No intent declares what this member changes.", { file: m.path, field: "intents", hint });
      } else if (GAMEPLAY_ROLES.has(m.role) && kinds.every((k) => k === "cosmetic")) {
        f.error(PACK_CODES.intentMismatch, `A ${m.role} member changes play, so a cosmetic intent cannot cover it.`, {
          file: m.path,
          field: "intents",
          expected: "gameplay-value or new-behaviour",
          actual: "cosmetic",
        });
      }
    }
  }

  let handlers: PackHandlerClaim[] | undefined;
  const claims: number[] = [];
  if (raw.handlers !== undefined) {
    if (!Array.isArray(raw.handlers)) invalid("handlers", "handlers is a list of {slot, handler, actions?, options?}.");
    else if (raw.handlers.length > PACK_HANDLERS_ADAPTATION) {
      f.error(PACK_CODES.limitExceeded, "Too many handler claims.", { field: "handlers", expected: String(PACK_HANDLERS_ADAPTATION), actual: String(raw.handlers.length) });
    } else {
      handlers = [];
      const slots = new Set<string>();
      const list = handlers;
      raw.handlers.forEach((claim: unknown, i: number) => {
        const at = `handlers[${i}]`;
        if (!isObject(claim) || !handle(claim.slot) || !handle(claim.handler) || Object.keys(claim).some((k) => !CLAIM_KEYS.has(k))) {
          return invalid(at, "A handler claim is {slot, handler, actions?, options?}; slot, handler and actions are dotted lower-case names.");
        }
        const actions = claim.actions;
        if (actions !== undefined && (!Array.isArray(actions) || actions.length > PACK_HANDLER_ACTIONS_ADAPTATION || !actions.every(handle) || new Set(actions).size !== actions.length)) {
          return invalid(`${at}.actions`, "actions lists distinct dotted lower-case action names.");
        }
        // LATER 458: the options' shape here (`copyClaimOptions`), their content the claimed handler's to check.
        const options = Object.prototype.hasOwnProperty.call(claim, "options") ? copyClaimOptions(claim.options) : undefined;
        if (options !== undefined && "fault" in options) {
          const { why, expected, actual } = options.fault;
          return f.error(PACK_CODES.fieldInvalid, why, { field: `${at}.options`, expected, actual });
        }
        if (slots.has(claim.slot)) return f.error(PACK_CODES.handlerConflict, "Two claims on one slot.", { field: `${at}.slot`, actual: claim.slot });
        slots.add(claim.slot);
        claims.push(list.length);
        list.push({
          slot: claim.slot,
          handler: claim.handler,
          ...(actions === undefined ? {} : { actions: [...(actions as string[])] }),
          ...(options === undefined ? {} : { options: options.value }),
        });
      });
    }
  }

  let legacyField: PackManifest["legacy"];
  if (legacy && raw.legacy !== undefined) {
    const l = raw.legacy;
    if (!isObject(l) || !oneOf(LEGACY_PACK_KINDS, l.kind) || typeof l.manifest !== "string") invalid("legacy", "legacy is {kind, manifest}.");
    else legacyField = { kind: l.kind, manifest: l.manifest };
  }
  if (f.errors > start) return null;
  const manifest: PackManifest = {
    format: PACK_FORMAT,
    formatVersion: PACK_FORMAT_VERSION,
    id: raw.id as string,
    version: raw.version as string,
    name: raw.name as string,
    ...(raw.description !== undefined ? { description: raw.description as string } : {}),
    target: raw.target as string,
    contract: raw.contract as string,
    kinds: [...(kinds as PackKind[])],
    sides: raw.sides as PackSide,
    dependencies,
    files,
    intents,
    ...(handlers ? { handlers } : {}),
    ...(legacyField ? { legacy: legacyField } : {}),
  };
  return { manifest, packDeps, archiveDeps, claims };
}

function legacyVersion(version: string): string {
  if (parseSemver(version)) return version;
  const build = version.split(/[.+]/).filter(Boolean).map((s) => s.replace(/[^0-9A-Za-z-]/g, "-")).join(".");
  return `0.0.0+legacy.${build || "0"}`;
}

/**
 * An earlier loader's parsed manifest as a v2 manifest object. A member it names without a hash is bounded by its
 * declared size (`PACK_MEMBER_BYTES_ADAPTATION`) before it is read, then hashed by `read`, the validation's one path.
 */
async function legacyManifest(input: LegacyPackInput, members: Map<string, PackFile>, read: MemberReader, f: Findings, context: PackContext): Promise<Record<string, unknown> | null> {
  const start = f.errors;
  const bad = (why: string): null => (f.error(PACK_CODES.legacyInvalid, why, { file: input.manifestPath, field: "legacy.manifest" }), null);
  const m = input.manifest as unknown as Record<string, unknown>;
  const manifestPath = packPath(input.manifestPath);
  if (!manifestPath.ok) return bad("The legacy manifest's own path is not a member path.");
  let listed: { file: string; sha256?: string; size?: number }[];
  let base: Record<string, unknown>;
  let role: PackFileRole;
  let intent: PackIntentKind;
  if (input.kind === "mod") {
    if (
      !isObject(m) ||
      typeof m.id !== "string" ||
      !/^[a-z0-9-]{1,64}$/.test(m.id) ||
      typeof m.name !== "string" ||
      typeof m.version !== "string" ||
      typeof m.target !== "string" ||
      !Array.isArray(m.files)
    ) {
      return bad("Not an s2u-mod v1 manifest.");
    }
    if (!m.files.every((e: unknown) => isObject(e) && typeof e.file === "string")) return bad("Every mod override names its file.");
    listed = (m.files as { file: string }[]).map((e) => ({ file: e.file }));
    // The literal v1 target stays in the legacy manifest member (`legacy.manifest`, hashed in `files`); v2 holds the canonical.
    const target = canonicalPackTarget(m.target);
    if (target === null) {
      const extra = { file: input.manifestPath, field: "target", expected: context.target, actual: m.target.slice(0, 64) };
      f.error(PACK_CODES.targetMismatch, "The mod is for another disc revision than this build's.", extra);
      return null;
    }
    base = { id: `mod.${m.id}`, version: legacyVersion(m.version), name: m.name.slice(0, PACK_NAME_CHARS_ADAPTATION) || "Mod", target, dependencies: [] };
    role = "data";
    intent = "gameplay-value";
  } else if (input.kind === "model") {
    if (!isObject(m) || !Array.isArray(m.models) || !m.models.every((e: unknown) => isObject(e) && typeof e.file === "string")) return bad("Not an s2u-model-pack manifest.");
    listed = (m.models as { file: string }[]).map((e) => ({ file: e.file }));
    base = { id: input.id ?? "model.current", version: input.version ?? "1.0.0", name: "Model pack", target: context.target, dependencies: [] };
    role = "mesh";
    intent = "cosmetic";
  } else {
    const map = isObject(m) && typeof m.mapArchive === "string" ? /^RUN\/(MP?\d+)\.ZDB$/.exec(m.mapArchive) : null;
    if (!map || !Array.isArray(m.entries)) return bad("Not an s2u-local-texture-pack manifest.");
    const entries = m.entries as unknown[];
    if (!entries.every((e) => isObject(e) && typeof e.file === "string" && typeof e.sha256 === "string" && Number.isSafeInteger(e.bytes))) {
      return bad("Every texture entry names its file, sha256 and bytes.");
    }
    listed = (entries as { file: string; sha256: string; bytes: number }[]).map((e) => ({ file: e.file, sha256: e.sha256, size: e.bytes }));
    const archiveSha = isObject(m.provenance) && typeof m.provenance.archiveSha256 === "string" ? m.provenance.archiveSha256 : null;
    base = {
      id: `texture.${map[1]!.toLowerCase()}`,
      version: "1.0.0",
      name: `Texture pack ${map[1]}`,
      target: context.target,
      dependencies: archiveSha ? [{ archive: m.mapArchive, sha256: archiveSha }] : [],
    };
    role = "texture";
    intent = "cosmetic";
  }
  const rows = new Map<string, Record<string, unknown>>();
  const add = async (rawPath: string, rowRole: PackFileRole, sha?: string, size?: number): Promise<void> => {
    const p = packPath(rawPath);
    if (!p.ok) return f.error(p.code, p.text, { file: rawPath.slice(0, 240), field: "legacy.manifest" });
    if (rows.has(p.path)) return;
    const file = members.get(p.path);
    if (!file) return f.error(PACK_CODES.memberMissing, "The legacy manifest names a file the pack does not hold.", { file: p.path });
    const declared = memberSize(file);
    let hash = sha;
    if (hash === undefined) {
      if (declared > PACK_MEMBER_BYTES_ADAPTATION) {
        return f.error(PACK_CODES.memberTooLarge, "A member is over the bound.", { file: p.path, expected: String(PACK_MEMBER_BYTES_ADAPTATION), actual: String(declared) });
      }
      const got = await read(file);
      if (got.sha256 === null || got.size !== declared) return sizeFinding(f, p.path, declared, got.size);
      hash = got.sha256;
    }
    rows.set(p.path, { path: p.path, sha256: hash, size: size ?? declared, role: rowRole });
  };
  for (const e of listed) await add(e.file, role, e.sha256, e.size);
  await add(manifestPath.path, "legacy-manifest");
  if (f.errors > start) return null;
  const paths = [...rows.keys()].sort(compareUtf8);
  return {
    format: PACK_FORMAT,
    formatVersion: PACK_FORMAT_VERSION,
    ...base,
    contract: "*",
    kinds: ["content"],
    sides: "client",
    files: paths.map((p) => rows.get(p)),
    intents: [{ kind: intent, files: paths }],
    legacy: { kind: input.kind, manifest: manifestPath.path },
  };
}

function cyclePath(start: string, first: readonly string[], packs: readonly AvailablePack[]): string[] | null {
  const edges = new Map<string, Set<string>>();
  for (const p of packs) {
    if (p.ref.id === start) continue;
    const set = edges.get(p.ref.id) ?? new Set<string>();
    for (const d of p.dependencies ?? []) set.add(d.id);
    edges.set(p.ref.id, set);
  }
  const visiting = new Set<string>();
  const walk = (id: string, trail: string[]): string[] | null => {
    if (id === start) return [...trail, id];
    if (visiting.has(id)) return null;
    visiting.add(id);
    for (const next of [...(edges.get(id) ?? [])].sort(compareUtf8)) {
      const found = walk(next, [...trail, id]);
      if (found) return found;
    }
    return null;
  };
  for (const id of first) {
    const found = walk(id, [start]);
    if (found) return found;
  }
  return null;
}

/** The `behaviour` slot family's slots (`handlers.ts` `BEHAVIOUR_SLOTS`, all `behaviour.*`; matched by name: handlers.ts imports this module). */
const BEHAVIOUR_SLOT = /^behaviour\./;
const claimKey = (slot: string, handler: string): string => `${slot}\u0000${handler}`;

/**
 * FCW-30's review F4 (FCW-33): a pack's handler claims and its rules members' `RulesSpec.capabilities` agree. Each
 * capability a rules member names is a manifest claim on the same slot with the same handler, its actions among the
 * claim's; each manifest claim on a `behaviour.*` slot is named by some rules member's capabilities. A claim outside
 * the behaviour family (presentation, a `visual.post` tint) is the manifest's alone. The rest of a spec is
 * `validateRules`' to check; here a rules member must only be a UTF-8 JSON object whose `capabilities`, when present,
 * are a list of `{slot, handler, actions?}`. Members whose bytes did not verify never reach this check.
 */
function capabilityChecks(manifest: PackManifest, bodies: readonly { readonly path: string; readonly bytes: Uint8Array }[], f: Findings): void {
  const claims = manifest.handlers ?? [];
  const named = new Set<string>();
  for (const body of bodies) {
    const text = utf8Text(body.bytes);
    let spec: unknown;
    try {
      spec = text === null ? undefined : JSON.parse(text);
    } catch {
      spec = undefined;
    }
    if (!isObject(spec)) {
      f.error(PACK_CODES.rulesMemberInvalid, "A rules member is a UTF-8 JSON object (a RulesSpec).", { file: body.path });
      continue;
    }
    const caps = spec.capabilities;
    if (caps === undefined) continue;
    const shaped = (c: unknown): c is { slot: string; handler: string; actions?: string[] } =>
      isObject(c) && typeof c.slot === "string" && typeof c.handler === "string" && (c.actions === undefined || (Array.isArray(c.actions) && c.actions.every((a) => typeof a === "string")));
    if (!Array.isArray(caps) || !caps.every(shaped)) {
      f.error(PACK_CODES.rulesMemberInvalid, "A rules member's capabilities are a list of {slot, handler, actions?}.", { file: body.path, field: "capabilities" });
      continue;
    }
    caps.forEach((cap, i) => {
      named.add(claimKey(cap.slot, cap.handler));
      const claim = claims.find((h) => h.slot === cap.slot && h.handler === cap.handler);
      const unlisted = claim ? (cap.actions ?? []).filter((a) => !(claim.actions ?? []).includes(a)) : [];
      if (claim && !unlisted.length) return;
      const why = claim
        ? `The manifest's claim on ${cap.slot} does not list the action ${unlisted[0]} the rules member's capability uses.`
        : `The rules member claims ${cap.handler} on ${cap.slot}, which the manifest's handlers do not.`;
      const expected = claim ? (claim.actions ?? []).join(", ") || "none" : `a handlers claim {slot: ${cap.slot}, handler: ${cap.handler}}`;
      f.error(PACK_CODES.capabilityMismatch, why, { file: body.path, field: `capabilities[${i}]`, expected, actual: cap.handler.slice(0, 80) });
    });
  }
  claims.forEach((h, i) => {
    if (!BEHAVIOUR_SLOT.test(h.slot) || named.has(claimKey(h.slot, h.handler))) return;
    const why = `The manifest claims ${h.handler} on ${h.slot}, which no rules member's capabilities name.`;
    f.error(PACK_CODES.capabilityMismatch, why, { field: `handlers[${i}]`, expected: "a rules member's capability naming it", actual: h.handler });
  });
}

function contextChecks(parsed: Parsed, context: PackContext, f: Findings): void {
  const { manifest } = parsed;
  const deps = manifest.dependencies;
  if (parsed.packDeps.length) {
    if (!context.packs) f.skipped("dependencies", "No list of available packs was given, so dependencies were not resolved.");
    else {
      for (const i of parsed.packDeps) {
        const dep = deps[i] as { id: string; range: string };
        const candidates = context.packs.filter((p) => p.ref.id === dep.id);
        if (!candidates.some((p) => satisfiesRange(p.ref.version, dep.range) === true)) {
          f.error(PACK_CODES.dependencyMissing, `No available ${dep.id} is in ${dep.range}.`, {
            field: `dependencies[${i}]`,
            expected: `${dep.id} ${dep.range}`,
            actual: candidates.map((p) => p.ref.version).join(", ") || "absent",
          });
        }
      }
      const first = parsed.packDeps.map((i) => (deps[i] as { id: string }).id);
      const cycle = cyclePath(manifest.id, first, context.packs);
      if (cycle) {
        const index = parsed.packDeps.find((i) => (deps[i] as { id: string }).id === cycle[1]);
        f.error(PACK_CODES.dependencyCycle, "The dependencies lead back to this pack.", { field: `dependencies[${index}]`, actual: cycle.join(" > ") });
      }
    }
  }
  if (parsed.archiveDeps.length) {
    if (!context.archives) f.skipped("dependencies", "The user's disc archives were not given, so archive dependencies were not checked.");
    else {
      for (const i of parsed.archiveDeps) {
        const dep = deps[i] as { archive: string; sha256: string };
        const have = Object.prototype.hasOwnProperty.call(context.archives, dep.archive) ? context.archives[dep.archive] : undefined;
        if (have === undefined) {
          const extra = { field: `dependencies[${i}].archive`, expected: dep.archive, actual: "absent" };
          f.error(PACK_CODES.dependencyMissing, `The disc archive ${dep.archive} is not present.`, extra);
        } else if (have !== dep.sha256) {
          const extra = { field: `dependencies[${i}].sha256`, expected: dep.sha256, actual: have };
          f.error(PACK_CODES.dependencyArchiveMismatch, `${dep.archive} is not the revision the pack needs.`, extra);
        }
      }
    }
  }
  const handlers = manifest.handlers ?? [];
  if (parsed.claims.length && !context.handlers) f.skipped("handlers", "No handler catalogue was given, so handler claims were not checked.");
  for (const i of parsed.claims) {
    const claim = handlers[i]!;
    if (context.handlers) {
      const cap = context.handlers.find((h) => h.id === claim.handler);
      if (!cap || cap.slot !== claim.slot) {
        const offered = context.handlers.filter((h) => h.slot === claim.slot).map((h) => h.id);
        const extra = { field: `handlers[${i}].handler`, expected: offered.join(", ") || "none", actual: claim.handler };
        f.error(PACK_CODES.handlerUnknown, `The engine offers no handler ${claim.handler} for slot ${claim.slot}.`, extra);
      } else {
        (claim.actions ?? []).forEach((a, j) => {
          if (cap.actions.includes(a)) return;
          const extra = { field: `handlers[${i}].actions[${j}]`, expected: cap.actions.join(", ") || "none", actual: a };
          f.error(PACK_CODES.actionUnknown, `${claim.handler} has no action ${a}.`, extra);
        });
      }
    }
    const holder = context.claimedSlots && Object.prototype.hasOwnProperty.call(context.claimedSlots, claim.slot) ? context.claimedSlots[claim.slot] : undefined;
    // As `checkHandlerClaim`: only an exclusive slot conflicts. A capability on the slot with `exclusive: false` makes it
    // shared; with no catalogue, or none saying so, the slot is exclusive (LATER 472).
    const shared = context.handlers?.some((h) => h.slot === claim.slot && h.exclusive === false) ?? false;
    if (!shared && holder !== undefined && holder !== manifest.id) {
      f.error(PACK_CODES.handlerConflict, `Slot ${claim.slot} is held by another pack.`, { field: `handlers[${i}].slot`, expected: "a free slot", actual: holder });
    }
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}

const done = (f: Findings): PackValidation => ({ ok: false, report: checkReport(f.list, { evidence: "validation" }) });

/**
 * Check approved bytes against their manifest (`s2u-pack.json`, or a legacy loader's through `context.legacy`) and
 * the build's context. Every finding is a `pack` diagnostic; only a `pass` report returns the manifest and its ref.
 */
export async function validatePack(files: readonly PackFile[], context: PackContext): Promise<PackValidation> {
  const f = new Findings();
  const members = files.filter((x) => x.path !== PACK_MANIFEST_FILE).length;
  if (members > PACK_FILES_ADAPTATION) {
    f.error(PACK_CODES.tooManyFiles, "The pack holds too many files.", { field: "files", expected: String(PACK_FILES_ADAPTATION), actual: String(members) });
    return done(f);
  }
  const input = new Map<string, PackFile>();
  const folded = new Map<string, string>();
  let bytes = 0;
  for (const file of files) {
    const p = packPath(file.path);
    if (!p.ok) {
      f.error(p.code, p.text, { file: String(file.path).slice(0, 240) });
      continue;
    }
    const fold = p.path.toLowerCase();
    if (folded.has(fold)) {
      f.error(PACK_CODES.pathCollision, "Two files are one path once normalised (NFC, case).", { file: p.path, actual: folded.get(fold) });
      continue;
    }
    folded.set(fold, p.path);
    const size = memberSize(file);
    if (!Number.isSafeInteger(size) || size < 0) {
      f.error(PACK_CODES.fieldInvalid, "A stored member's size is not a byte count.", { file: p.path, actual: String(size) });
      continue;
    }
    input.set(p.path, file);
    bytes += size;
  }
  if (bytes > PACK_BYTES_ADAPTATION + PACK_MANIFEST_BYTES_ADAPTATION) {
    f.error(PACK_CODES.tooLarge, "The pack's bytes are over the bound.", { field: "files", expected: String(PACK_BYTES_ADAPTATION), actual: String(bytes) });
  }
  if (f.errors) return done(f);
  // Each member is read at most once per validation (a legacy adapter's hash is the check's), through one path.
  const reads = new Map<PackFile, Promise<MemberRead>>();
  const read: MemberReader = (file) => {
    let got = reads.get(file);
    if (!got) reads.set(file, (got = memberHash(file, context.sha256)));
    return got;
  };

  let raw: unknown;
  const own = input.get(PACK_MANIFEST_FILE);
  if (own) {
    const size = memberSize(own);
    if (size > PACK_MANIFEST_BYTES_ADAPTATION) {
      f.error(PACK_CODES.manifestTooLarge, "The manifest is over its bound.", { file: PACK_MANIFEST_FILE, expected: String(PACK_MANIFEST_BYTES_ADAPTATION), actual: String(size) });
      return done(f);
    }
    const body = await memberText(own);
    if (body.size !== size) {
      sizeFinding(f, PACK_MANIFEST_FILE, size, body.size);
      return done(f);
    }
    try {
      if (body.text === null) throw new SyntaxError("not UTF-8");
      raw = JSON.parse(body.text);
    } catch {
      f.error(PACK_CODES.manifestInvalid, "The manifest is not UTF-8 JSON.", { file: PACK_MANIFEST_FILE });
      return done(f);
    }
  } else if (context.legacy) {
    raw = await legacyManifest(context.legacy, input, read, f, context);
    if (raw === null) return done(f);
  } else {
    f.error(PACK_CODES.manifestMissing, `The pack has no ${PACK_MANIFEST_FILE}.`, { file: PACK_MANIFEST_FILE, hint: "Add the v2 manifest, or import it through its earlier loader." });
    return done(f);
  }
  if (!isObject(raw)) {
    f.error(PACK_CODES.manifestInvalid, "The manifest must be a JSON object.", { file: PACK_MANIFEST_FILE });
    return done(f);
  }
  const parsed = readManifest(raw, context, f, !own);
  if (!parsed) return done(f);
  const { manifest } = parsed;

  let declared = 0;
  for (const [i, m] of manifest.files.entries()) {
    declared += m.size;
    const bound = m.role === "rules" ? PACK_RULES_MEMBER_BYTES_ADAPTATION : PACK_MEMBER_BYTES_ADAPTATION;
    if (m.size > bound) {
      f.error(PACK_CODES.memberTooLarge, "A member is over the bound.", { file: m.path, field: `files[${i}].size`, expected: String(bound), actual: String(m.size) });
    }
  }
  if (!f.errors && declared > PACK_BYTES_ADAPTATION) {
    f.error(PACK_CODES.tooLarge, "The members together are over the bound.", { field: "files", expected: String(PACK_BYTES_ADAPTATION), actual: String(declared) });
  }
  if (!f.errors) {
    // One pass over every member's declared size first (the spec's "Streamed members": every bound and comparison on the
    // declared sizes before any read), so no stream is opened while another member's stored size is already wrong.
    const present: { m: PackFileEntry; file: PackFile }[] = [];
    for (const m of manifest.files) {
      const file = input.get(m.path);
      if (!file) {
        f.error(PACK_CODES.memberMissing, "A listed member is not in the pack.", { file: m.path });
        continue;
      }
      const size = memberSize(file);
      if (size !== m.size) {
        sizeFinding(f, m.path, m.size, size);
        continue;
      }
      present.push({ m, file });
    }
    // Then the bytes, only once every declared size agrees. A `rules` member (bounded above) is gathered whole once and
    // hashed from those bytes, so its `RulesSpec.capabilities` are read from the bytes the hash verified.
    const rulesBodies: { readonly path: string; readonly bytes: Uint8Array }[] = [];
    for (const { m, file } of f.errors ? [] : present) {
      let got: MemberRead;
      if (m.role === "rules") {
        const body = await memberBytes(file);
        got = { sha256: body.bytes === null ? null : await sha256Hex(body.bytes, context.sha256), size: body.size };
        if (body.bytes !== null && got.sha256 === m.sha256) rulesBodies.push({ path: m.path, bytes: body.bytes });
      } else got = await read(file);
      if (got.sha256 === null || got.size !== m.size) sizeFinding(f, m.path, m.size, got.size);
      else if (got.sha256 !== m.sha256) {
        const extra = { file: m.path, expected: m.sha256, actual: got.sha256, hint: "Write the member's sha256 again, or restore its bytes." };
        f.error(PACK_CODES.memberHashMismatch, "A member's bytes are not the ones the manifest names.", extra);
      }
    }
    const listed = new Set(manifest.files.map((m) => m.path));
    for (const path of input.keys()) {
      // Thunderstore's root files beside an own `s2u-pack.json`: the defined exception (`THUNDERSTORE_STORE_FILES`).
      if (path === PACK_MANIFEST_FILE || listed.has(path) || (own && STORE_FILES.has(path))) continue;
      const hint = "List it in files, or leave it out of the pack.";
      f.error(PACK_CODES.memberUnlisted, "A file in the pack is not listed in the manifest.", { file: path, hint });
    }
    if (!f.errors && manifest.files.some((m) => m.role === "rules")) capabilityChecks(manifest, rulesBodies, f);
  }
  contextChecks(parsed, context, f);
  const report = checkReport(f.list, { evidence: "validation" });
  if (report.status !== "pass") return { ok: false, report };
  const ref: PackRef = freeze({ id: manifest.id, version: manifest.version, hash: await packDigest(manifest, context.sha256) });
  return { ok: true, manifest: freeze(manifest), ref, report };
}

// ---------------------------------------------------------------------------------------------------------------------
// Thunderstore's package format (FCW-33): the format only -- nothing here fetches, uploads or names a store page (H342).
// ---------------------------------------------------------------------------------------------------------------------

export const THUNDERSTORE_ADAPTATION =
  "Thunderstore's package format, fitted with no fetch and no store page (H342): its root files ride beside s2u-pack.json outside the pack's identity, and an export maps our identity onto the store's" as const;
/**
 * The Thunderstore team (namespace) our packs publish under: the owner's to name (HUMAN_TASKS H342; the rules spec §8,
 * §13). A stand-in until H342 is answered -- itself a valid store name, so an export's dependency pins are well formed
 * -- and never a real team. Listed in research 370's placeholders.
 */
export const THUNDERSTORE_TEAM_PLACEHOLDER = "TEAM_PLACEHOLDER";
/**
 * Thunderstore's stated package rules as data (wiki.thunderstore.io, "Creating a package", read 2026-10-26 and quoted
 * in `docs/specs/2026-10-27-creator-rules-contract.md` §8; nothing fetched at run time): the root files, the store
 * manifest's keys and each one's rule, and the icon's size. `websiteUrl` is ours: the wiki names the field, and an
 * export writes it empty or as an http(s) address. The wiki's ~5 GB package bound is not checked: ours
 * (`PACK_BYTES_ADAPTATION`, 512 MiB) is below it.
 */
export const THUNDERSTORE_PACKAGE_RULES = Object.freeze({
  source: 'wiki.thunderstore.io, "Creating a package" (read 2026-10-26; quoted in docs/specs/2026-10-27-creator-rules-contract.md §8)',
  required: Object.freeze(["manifest.json", "icon.png", "README.md"] as const),
  optional: Object.freeze(["CHANGELOG.md"] as const),
  manifestKeys: Object.freeze(["name", "version_number", "website_url", "description", "dependencies"] as const),
  name: Object.freeze({ pattern: "^[A-Za-z0-9_]+$", maxChars: 128 }),
  versionNumber: Object.freeze({ pattern: "^\\d+\\.\\d+\\.\\d+$" }),
  description: Object.freeze({ maxChars: 250 }),
  websiteUrl: Object.freeze({ pattern: "^(?:https?://\\S+)?$" }),
  dependency: Object.freeze({ pattern: "^[A-Za-z0-9_]+-[A-Za-z0-9_]+-\\d+\\.\\d+\\.\\d+$" }),
  icon: Object.freeze({ width: 256, height: 256 }),
});
/** The export's and the checker's findings (namespace `store.`, source `pack`). */
export const THUNDERSTORE_CODES = Object.freeze({
  teamInvalid: "store.TEAM_INVALID",
  nameInvalid: "store.NAME_INVALID",
  /** Two of our ids that would share one store name: refused, never renamed. */
  nameCollision: "store.NAME_COLLISION",
  /** A version that is not strictly Major.Minor.Patch (a pre-release or build). */
  versionInvalid: "store.VERSION_INVALID",
  descriptionTooLong: "store.DESCRIPTION_TOO_LONG",
  websiteInvalid: "store.WEBSITE_INVALID",
  /** A `{id, range}` dependency with no available release in its range to pin. */
  dependencyUnresolved: "store.DEPENDENCY_UNRESOLVED",
  /** A note: a disc archive dependency stays in `s2u-pack.json`; the store has no such dependency. */
  archiveDependency: "store.ARCHIVE_DEPENDENCY",
  fileMissing: "store.FILE_MISSING",
  manifestInvalid: "store.MANIFEST_INVALID",
  /** The store manifest's name or version is not the pack's own. */
  manifestMismatch: "store.MANIFEST_MISMATCH",
  iconInvalid: "store.ICON_INVALID",
} as const);
export type ThunderstoreCode = (typeof THUNDERSTORE_CODES)[keyof typeof THUNDERSTORE_CODES];

const STORE_NAME = new RegExp(THUNDERSTORE_PACKAGE_RULES.name.pattern);
const STORE_VERSION = new RegExp(THUNDERSTORE_PACKAGE_RULES.versionNumber.pattern);
const STORE_WEBSITE = new RegExp(THUNDERSTORE_PACKAGE_RULES.websiteUrl.pattern);
const STORE_DEPENDENCY = new RegExp(THUNDERSTORE_PACKAGE_RULES.dependency.pattern);
const storeName = (v: unknown): v is string => typeof v === "string" && v.length <= THUNDERSTORE_PACKAGE_RULES.name.maxChars && STORE_NAME.test(v);

/**
 * Our id's store name: `.` and `-` become `_` (the store's grammar is `[A-Za-z0-9_]`, at most 128; ours is lower case
 * with `.` and `-`, at most 64 past a legacy namespace). Null for what is not a pack id. The map is not one-to-one
 * (`a.b` and `a-b` meet), so an export refuses two ids that meet (`NAME_COLLISION`) rather than renaming either.
 */
export function thunderstoreName(id: string): string | null {
  if (!packId(id)) return null;
  const name = id.replace(/[.-]/g, "_");
  return storeName(name) ? name : null;
}
/** Our id as the store's `Team-Name` under `team` (the placeholder until H342); null when either is outside the grammar. */
export function thunderstoreIdentity(id: string, team: string = THUNDERSTORE_TEAM_PLACEHOLDER): { readonly team: string; readonly name: string; readonly full: string } | null {
  const name = thunderstoreName(id);
  return name !== null && storeName(team) ? { team, name, full: `${team}-${name}` } : null;
}
/** A version the store takes: ours (SemVer) when it is strictly Major.Minor.Patch -- no pre-release, no build -- else null. */
export function thunderstoreVersion(version: string): string | null {
  return typeof version === "string" && parseSemver(version) !== null && STORE_VERSION.test(version) ? version : null;
}

/** The store's `manifest.json`, its keys in the wiki's order. */
export interface ThunderstoreManifest {
  readonly name: string;
  readonly version_number: string;
  readonly website_url: string;
  readonly description: string;
  readonly dependencies: readonly string[];
}
export interface ThunderstoreExportOptions {
  /** The team; `THUNDERSTORE_TEAM_PLACEHOLDER` until H342 names it. */
  readonly team?: string;
  /** The packs the dependency ranges resolve against (the device's); absent, a `{id, range}` dependency is unresolved. */
  readonly packs?: readonly AvailablePack[];
  /** The store's `website_url` (ours cannot carry one: `EXTERNAL_URI`); empty by default. */
  readonly websiteUrl?: string;
  /** The store's description (at most 250); the manifest's own by default, never cut. */
  readonly description?: string;
}
export type ThunderstoreExport =
  | { readonly ok: true; readonly manifest: ThunderstoreManifest; readonly report: CheckReport }
  | { readonly ok: false; readonly report: CheckReport };

/**
 * A validated v2 manifest as the store's `manifest.json`. The name is `thunderstoreName(id)`; the version must be
 * strictly Major.Minor.Patch. Each `{id, range}` dependency becomes the exact pin `Team-Name-x.y.z`, its version the
 * highest release among `options.packs` with that id inside the range (pre-releases are not store versions, so never
 * pinned); none is `DEPENDENCY_UNRESOLVED`. A disc archive dependency has no store form: it stays in `s2u-pack.json`
 * (a note). Any two ids among the pack's own and its dependency closure (the given packs' own dependencies, followed) that meet on one store name are
 * `NAME_COLLISION`. Nothing is truncated or renamed to fit: what does not fit is refused.
 */
export function thunderstoreManifest(manifest: PackManifest, options: ThunderstoreExportOptions = {}): ThunderstoreExport {
  const list: Diagnostic[] = [];
  const error = (code: ThunderstoreCode, text: string, extra: Extra = {}): void => void list.push(diagnostic({ source: "pack", severity: "error", code, text, ...extra }));
  const team = options.team ?? THUNDERSTORE_TEAM_PLACEHOLDER;
  if (!storeName(team)) error(THUNDERSTORE_CODES.teamInvalid, "The team is 1-128 of A-Z, a-z, 0-9 and _.", { field: "team", actual: String(team).slice(0, 80) });
  const name = thunderstoreName(manifest.id);
  if (name === null) error(THUNDERSTORE_CODES.nameInvalid, "The pack's id has no store name.", { field: "id", actual: manifest.id });
  const version = thunderstoreVersion(manifest.version);
  if (version === null) {
    const hint = "Publish a release: the store's version_number is strictly Major.Minor.Patch.";
    error(THUNDERSTORE_CODES.versionInvalid, "The pack's version is not a store version.", { field: "version", expected: "Major.Minor.Patch", actual: manifest.version, hint });
  }
  const description = options.description ?? manifest.description ?? "";
  if (typeof description !== "string" || description.length > THUNDERSTORE_PACKAGE_RULES.description.maxChars) {
    const max = THUNDERSTORE_PACKAGE_RULES.description.maxChars;
    error(THUNDERSTORE_CODES.descriptionTooLong, `The store's description is at most ${max} characters; give a shorter one.`, { field: "description", expected: String(max), actual: String(String(description).length) });
  }
  const website = options.websiteUrl ?? "";
  if (typeof website !== "string" || !STORE_WEBSITE.test(website)) {
    error(THUNDERSTORE_CODES.websiteInvalid, "website_url is empty or an http(s) address.", { field: "website_url", actual: String(website).slice(0, 80) });
  }
  // Collisions: one store name per id, over the pack's own and its dependency closure.
  const owners = new Map<string, string>();
  const claim = (id: string, field: string): void => {
    const n = thunderstoreName(id);
    if (n === null) return;
    const holder = owners.get(n);
    if (holder === undefined) owners.set(n, id);
    else if (holder !== id) error(THUNDERSTORE_CODES.nameCollision, `${holder} and ${id} would both be the store name ${n}.`, { field, expected: holder, actual: id, hint: "Rename one of the packs: the store name is never changed to fit." });
  };
  claim(manifest.id, "id");
  manifest.dependencies.forEach((dep, i) => {
    if ("id" in dep) claim(dep.id, `dependencies[${i}].id`);
  });
  // Only the dependency closure is checked (FCW-33 fold F4): an installed pack the export does not reach cannot collide.
  const given = options.packs ?? [];
  const reached = new Set<string>(manifest.dependencies.flatMap((dep) => ("id" in dep ? [dep.id] : [])));
  for (const id of reached) {
    for (const p of given) {
      if (p.ref.id !== id) continue;
      for (const dep of p.dependencies ?? []) reached.add(dep.id);
    }
  }
  let n = 0;
  for (const id of reached) claim(id, `dependencies[${n++}]`);
  const pins: string[] = [];
  manifest.dependencies.forEach((dep, i) => {
    const field = `dependencies[${i}]`;
    if (!("id" in dep)) {
      list.push(diagnostic({ source: "pack", severity: "note", code: THUNDERSTORE_CODES.archiveDependency, text: "A disc archive dependency stays in s2u-pack.json; the store has none.", field, actual: dep.archive }));
      return;
    }
    const candidates = (options.packs ?? []).filter((p) => p.ref.id === dep.id);
    const releases = candidates.filter((p) => thunderstoreVersion(p.ref.version) !== null && satisfiesRange(p.ref.version, dep.range) === true);
    const best = releases.reduce<AvailablePack | null>((top, p) => (top === null || compareSemver(parseSemver(p.ref.version)!, parseSemver(top.ref.version)!) > 0 ? p : top), null);
    const depName = thunderstoreName(dep.id);
    if (best === null || depName === null) {
      const actual = candidates.map((p) => p.ref.version).join(", ") || "absent";
      error(THUNDERSTORE_CODES.dependencyUnresolved, `No available release of ${dep.id} is in ${dep.range} to pin.`, { field, expected: `${dep.id} ${dep.range}`, actual });
      return;
    }
    pins.push(`${team}-${depName}-${best.ref.version}`);
  });
  const report = checkReport(list, { evidence: "validation" });
  if (report.status !== "pass" || name === null || version === null) return { ok: false, report };
  return { ok: true, manifest: freeze({ name, version_number: version, website_url: website, description, dependencies: pins }), report };
}

export interface ThunderstoreCheckOptions {
  /** The pack's own validated manifest: the store manifest's name and version must be its. */
  readonly pack?: PackManifest;
}
/**
 * Test a zip's members against Thunderstore's stated rules (`THUNDERSTORE_PACKAGE_RULES`; no network): the root files
 * present (at the root, not in a folder), the store `manifest.json` a UTF-8 JSON object within its bound whose keys
 * keep their rules, `icon.png` a PNG whose header says 256x256 (the header only: no image is decoded), and -- given the
 * pack's own manifest -- the store name and version its. A `pass` here says nothing of our own validation
 * (`validatePack`), which a store-shaped pack also needs.
 */
export function checkThunderstorePackage(files: readonly BufferedPackFile[], options: ThunderstoreCheckOptions = {}): CheckReport {
  const list: Diagnostic[] = [];
  const error = (code: ThunderstoreCode, text: string, extra: Extra = {}): void => void list.push(diagnostic({ source: "pack", severity: "error", code, text, ...extra }));
  const byPath = new Map(files.map((f) => [f.path, f]));
  for (const path of THUNDERSTORE_PACKAGE_RULES.required) {
    if (!byPath.has(path)) error(THUNDERSTORE_CODES.fileMissing, `The package has no ${path} at its root.`, { file: path });
  }
  const manifestFile = byPath.get("manifest.json");
  if (manifestFile) {
    const file = "manifest.json";
    const text = manifestFile.bytes.length <= PACK_MANIFEST_BYTES_ADAPTATION ? utf8Text(manifestFile.bytes) : null;
    let raw: unknown;
    try {
      raw = text === null ? undefined : JSON.parse(text);
    } catch {
      raw = undefined;
    }
    if (!isObject(raw)) error(THUNDERSTORE_CODES.manifestInvalid, "The store manifest is a UTF-8 JSON object.", { file });
    else {
      const bad = (field: string, why: string, actual?: unknown): void =>
        error(THUNDERSTORE_CODES.manifestInvalid, why, { file, field, ...(actual === undefined ? {} : { actual: String(actual).slice(0, 80) }) });
      const rules = THUNDERSTORE_PACKAGE_RULES;
      const nameOk = storeName(raw.name);
      if (!nameOk) bad("name", `name is 1-${rules.name.maxChars} of A-Z, a-z, 0-9 and _.`, raw.name);
      const versionOk = typeof raw.version_number === "string" && STORE_VERSION.test(raw.version_number);
      if (!versionOk) bad("version_number", "version_number is strictly Major.Minor.Patch.", raw.version_number);
      if (typeof raw.website_url !== "string" || !STORE_WEBSITE.test(raw.website_url)) bad("website_url", "website_url is empty or an http(s) address.", raw.website_url);
      if (typeof raw.description !== "string" || raw.description.length > rules.description.maxChars) bad("description", `description is at most ${rules.description.maxChars} characters.`);
      if (!Array.isArray(raw.dependencies)) bad("dependencies", "dependencies is a list of Team-Name-x.y.z strings.");
      else raw.dependencies.forEach((d: unknown, i: number) => {
        if (typeof d !== "string" || !STORE_DEPENDENCY.test(d)) bad(`dependencies[${i}]`, "A dependency is Team-Name-x.y.z.", d);
      });
      const pack = options.pack;
      if (pack && nameOk && raw.name !== thunderstoreName(pack.id)) {
        error(THUNDERSTORE_CODES.manifestMismatch, "The store name is not the pack's.", { file, field: "name", expected: thunderstoreName(pack.id) ?? "none", actual: raw.name as string });
      }
      if (pack && versionOk && raw.version_number !== pack.version) {
        error(THUNDERSTORE_CODES.manifestMismatch, "The store version is not the pack's.", { file, field: "version_number", expected: pack.version, actual: raw.version_number as string });
      }
    }
  }
  const icon = byPath.get("icon.png");
  if (icon) {
    const b = icon.bytes;
    const png = b.length >= 24 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x) && String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) === "IHDR";
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const size = png ? `${view.getUint32(16)}x${view.getUint32(20)}` : "not a PNG";
    const want = `${THUNDERSTORE_PACKAGE_RULES.icon.width}x${THUNDERSTORE_PACKAGE_RULES.icon.height}`;
    if (size !== want) error(THUNDERSTORE_CODES.iconInvalid, `icon.png is a ${want} PNG.`, { file: "icon.png", expected: want, actual: size });
  }
  return checkReport(list, { evidence: "validation" });
}

/** An entry of a dropped zip or folder: its path, and its bytes where the caller has read them (see `unwrapThunderstore`). */
export interface ThunderstoreUnwrapEntry {
  readonly path: string;
  readonly bytes?: Uint8Array;
}
export type ThunderstoreUnwrap<T extends ThunderstoreUnwrapEntry> =
  | { readonly wrapped: false; readonly members: readonly T[] }
  | {
      readonly wrapped: true;
      /** "" for a package at the zip's root, else its one top folder with its slash (a zip of the folder). */
      readonly root: string;
      /** The store's `manifest.json` as parsed: its keys are the store's; whether each keeps its rule is `report`'s. */
      readonly manifest: Readonly<Record<string, unknown>>;
      /** `checkThunderstorePackage` over the root files: an importer refuses a package whose report is not `pass`. */
      readonly report: CheckReport;
      /** The store's root files present (paths relative to `root`): set aside, never members. */
      readonly store: readonly T[];
      /** The bare pack: every other entry, a shallow copy with its path relative to `root`. */
      readonly members: readonly T[];
    };

/**
 * B206 ML-5 (plan 2026-11-06-mods-loader, ML.R3; product track): a Thunderstore package -- the owner's upload made by
 * `tools/thunderstore-wrap.ts`, or any pack wrapped by hand -- recognised and its bare pack yielded, for ML-1's drop
 * classifier, which then reads the members as it reads an unwrapped drop. Pure: no zip, no fetch.
 *
 * Recognised when `manifest.json` sits at the root, or under the one top folder every entry shares (a zip of the
 * folder, as a mod manager's install leaves it), and parses to a JSON object holding every one of the store's manifest
 * keys (`THUNDERSTORE_PACKAGE_RULES.manifestKeys`). Anything else is returned unchanged (`members` is `entries`): a
 * bare pack, and a texture pack whose own root `manifest.json` is its legacy manifest (`format:
 * 's2u-local-texture-pack'`, without the store's keys). A v2 pack (an `s2u-pack.json` at that root) is returned
 * unchanged too: its store files are its own validator's defined exception, outside its identity (`validatePack`).
 *
 * The caller reads the bytes of the root `manifest.json` and `icon.png` (each small) before the call; the members
 * need none. A recognised package missing those bytes is a caller's error (thrown), not a refusal.
 */
export function unwrapThunderstore<T extends ThunderstoreUnwrapEntry>(entries: readonly T[]): ThunderstoreUnwrap<T> {
  const bare = { wrapped: false, members: entries } as const;
  const at = (path: string): T | undefined => entries.find((e) => e.path === path);
  let root = "";
  if (at("manifest.json") === undefined) {
    const top = entries[0]?.path.split("/")[0];
    if (top === undefined || !entries.every((e) => e.path.startsWith(`${top}/`)) || at(`${top}/manifest.json`) === undefined) return bare;
    root = `${top}/`;
  }
  if (at(`${root}${PACK_MANIFEST_FILE}`) !== undefined) return bare;
  const need = (path: string): Uint8Array => {
    const bytes = at(`${root}${path}`)?.bytes;
    if (bytes === undefined) throw new TypeError(`unwrapThunderstore: read ${root}${path}'s bytes before the call`);
    return bytes;
  };
  const manifestBytes = need("manifest.json");
  const text = manifestBytes.length <= PACK_MANIFEST_BYTES_ADAPTATION ? utf8Text(manifestBytes) : null;
  let raw: unknown;
  try {
    raw = text === null ? undefined : JSON.parse(text);
  } catch {
    return bare;
  }
  if (!isObject(raw) || !THUNDERSTORE_PACKAGE_RULES.manifestKeys.every((k) => k in raw)) return bare;
  const store: T[] = [];
  const members: T[] = [];
  for (const e of entries) {
    const rel = e.path.slice(root.length);
    const copy = (root === "" ? e : { ...e, path: rel }) as T;
    (STORE_FILES.has(rel) ? store : members).push(copy);
  }
  const buffered: BufferedPackFile[] = store.map((e) => ({ path: e.path, bytes: e.path === "README.md" || e.path === "CHANGELOG.md" ? (e.bytes ?? new Uint8Array(0)) : need(e.path) }));
  return { wrapped: true, root, manifest: raw, report: checkThunderstorePackage(buffered), store, members };
}
