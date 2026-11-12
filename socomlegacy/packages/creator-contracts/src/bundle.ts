/**
 * The forge-map bundle (FP-4, FP.R2), a browser adaptation with no original: one zip that carries a Forge layout and the
 * creator packs it stands on, so a player takes a custom map in one file. Nothing here reads the disc, runs a pack's
 * bytes or changes what the game does; it checks an already-unzipped entry list (the zip reader is the viewer's, FP-5),
 * and only a passing check yields the layout, the packs and the list of packs the layout needs that the bundle lacks.
 *
 * The envelope is `forge-bundle.json`, `{schema: "s2u.creator/forge-map-bundle", version: 1, layout, packs}`:
 * - at the zip's root, or inside exactly one top folder (a zip of a folder, as the pack import tolerates). The root's
 *   envelope is preferred when there is one: a `<folder>/forge-bundle.json` under a declared pack root is that pack's
 *   member; two envelopes neither under a declared root are two roots, refused;
 * - `layout` is a Forge layout record version 3, read by `layout.ts`'s `readCreatorRecord`;
 * - each `packs[i]` is `{ref, root}`: a `PackRef` and the folder (ending `/`) under the envelope that holds that pack
 *   whole, `s2u-pack.json` at its top, validated by `packs.ts`'s `validatePack` as any v2 pack is. Its validated
 *   reference must equal `ref`: the same id and version, and the hash `packDigest` (`digest.ts`) gives -- SHA-256 over
 *   the canonical `{"digest":"s2u.pack","manifest":...,"version":1}`, the manifest as the validator read it, its files
 *   NFC in UTF-8 path order and its sets in canonical order; the members enter it through their `sha256` rows;
 * - the layout's `requires` and its `contentBase.ref` are each carried in `packs` or listed in `missing`: a list, not
 *   a refusal (FP.R4's readiness caption reads it);
 * - when the content base's pack is carried, its member `maps/<mapId>.json` (`contentMapMemberPath`) is there and reads
 *   as a content map, version 1 or 2 (`readContentMapDefinition`; the review's F5);
 * - a file inside a pack root is that pack's business (`pack.MEMBER_UNLISTED` and the rest); any other file but the
 *   envelope is refused (`bundle.FILE_OUTSIDE`).
 *
 * Every finding is a `Diagnostic` (`diagnostics.ts`), source `pack`, evidence `validation`, coded `bundle.*`
 * (`BUNDLE_CODES`); a carried pack's own findings follow its `bundle.PACK_INVALID`, their `file` under the pack's root,
 * and a passing pack's warnings are forwarded the same way (the review's F3), so a bundle whose pack warns says so.
 */
import { checkPackRef, missingPackRefs, packRefKey, samePackRef, sortPackRefs } from "./content.js";
import { diagnostic, reportStatus, type Diagnostic, type DiagnosticInput } from "./diagnostics.js";
import type { Sha256 } from "./digest.js";
import { CONTENT_MAP_VERSIONS, contentMapMemberPath, readContentMapDefinition } from "./maps.js";
import { RECORD_LIMITS, RECORD_SCHEMA, RECORD_VERSION, readCreatorRecord, type CheckRecordOptions, type CreatorLayoutRecord } from "./layout.js";
import {
  ENGINE_CONTRACT_VERSION, PACK_BYTES_ADAPTATION, PACK_MANIFEST_BYTES_ADAPTATION, PACK_MANIFEST_FILE, PACK_TARGET_US, packPath, validatePack,
  type AvailablePack, type PackHandlerCapability, type PackManifest, type PackRef,
} from "./packs.js";

export const FORGE_BUNDLE_SCHEMA = "s2u.creator/forge-map-bundle" as const;
export const FORGE_BUNDLE_VERSION = 1 as const;
/** The envelope's name, at the bundle's root (or inside its one top folder). */
export const FORGE_BUNDLE_FILE = "forge-bundle.json" as const;
/** The envelope's fields, exactly. */
export const FORGE_BUNDLE_KEYS = Object.freeze(["schema", "version", "layout", "packs"] as const);
/** A pack entry's fields, exactly. */
export const FORGE_BUNDLE_PACK_KEYS = Object.freeze(["ref", "root"] as const);

/**
 * All the bundle's entries together, in bytes: one pack's bound (`PACK_BYTES_ADAPTATION`, the local import's 512 MiB).
 * A ceiling of this tool, not a game value; FP-8 (the pack-format 0.2 review, with its zip-bomb policy) replaces it.
 */
export const BUNDLE_MAX_BYTES_ADAPTATION = PACK_BYTES_ADAPTATION;
/** The envelope's bound: a pack manifest's (`PACK_MANIFEST_BYTES_ADAPTATION`, 1 MiB). An adaptation. */
export const BUNDLE_ENVELOPE_BYTES_ADAPTATION = PACK_MANIFEST_BYTES_ADAPTATION;
/** The most packs a bundle carries: the record's bound on the packs a layout requires (`RECORD_LIMITS.requires`). */
export const BUNDLE_PACKS_MAX_ADAPTATION = RECORD_LIMITS.requires;

export const BUNDLE_CODES = Object.freeze({
  tooLarge: "bundle.TOO_LARGE",
  pathInvalid: "bundle.PATH_INVALID",
  envelopeMissing: "bundle.ENVELOPE_MISSING",
  /** Two envelopes neither under a declared pack root: at the root and in a top folder, or in two top folders. */
  rootAmbiguous: "bundle.ROOT_AMBIGUOUS",
  envelopeInvalid: "bundle.ENVELOPE_INVALID",
  fieldUnknown: "bundle.FIELD_UNKNOWN",
  schema: "bundle.SCHEMA",
  version: "bundle.VERSION",
  layoutInvalid: "bundle.LAYOUT_INVALID",
  packsInvalid: "bundle.PACKS_INVALID",
  packRefInvalid: "bundle.PACK_REF_INVALID",
  packRootInvalid: "bundle.PACK_ROOT_INVALID",
  /** Two entries naming one pack id and version. */
  packDuplicate: "bundle.PACK_DUPLICATE",
  /** The pack under a root failed its own validation; its findings follow. */
  packInvalid: "bundle.PACK_INVALID",
  /** The pack under a root is not the one its `ref` names (id, version or hash). */
  packRefMismatch: "bundle.PACK_REF_MISMATCH",
  /** A file outside every pack root that is not the envelope. */
  fileOutside: "bundle.FILE_OUTSIDE",
  /** The carried base pack has no member `maps/<mapId>.json` for the layout's `contentBase.mapId`. */
  baseMapMissing: "bundle.BASE_MAP_MISSING",
  /** The base map member is not a content map the maps reader takes; its `map.*` findings follow. */
  baseMapInvalid: "bundle.BASE_MAP_INVALID",
} as const);
export type BundleCode = (typeof BUNDLE_CODES)[keyof typeof BUNDLE_CODES];

/** One already-unzipped entry: its path in the zip and its bytes. A folder entry (path ending `/`, no bytes) is ignored. */
export interface BundleEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface ForgeBundlePack {
  readonly ref: PackRef;
  /** The pack's folder under the envelope, ending `/`. */
  readonly root: string;
  readonly manifest: PackManifest;
}
export interface ForgeBundle {
  readonly layout: CreatorLayoutRecord;
  readonly packs: readonly ForgeBundlePack[];
  /** The layout's `requires` and `contentBase.ref` the bundle does not carry, each once, sorted (`sortPackRefs`). */
  readonly missing: PackRef[];
}
export type ForgeBundleValidation =
  | { readonly ok: true; readonly bundle: ForgeBundle; readonly diagnostics: Diagnostic[] }
  | { readonly ok: false; readonly bundle: null; readonly diagnostics: Diagnostic[] };

/** The build context the carried packs are checked in; each absent part as `validatePack` takes its absence. */
export interface ValidateBundleOptions extends CheckRecordOptions {
  /** The build's disc revision: `PACK_TARGET_US` by default. */
  readonly target?: string;
  /** The build's engine contract: `ENGINE_CONTRACT_VERSION` by default. */
  readonly contract?: string;
  /** Packs this device holds beside the carried ones, for a carried pack's `{id, range}` dependencies. */
  readonly packs?: readonly AvailablePack[];
  readonly archives?: Readonly<Record<string, string>>;
  readonly handlers?: readonly PackHandlerCapability[];
  readonly sha256?: Sha256;
}

type Extra = Pick<DiagnosticInput, "file" | "field" | "expected" | "actual" | "hint">;
class Findings {
  readonly list: Diagnostic[] = [];
  error(code: BundleCode, text: string, extra: Extra = {}): void {
    this.list.push(diagnostic({ source: "pack", severity: "error", code, text, evidence: "validation", ...extra }));
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const TOP_ENVELOPE = /^[^/]+\/forge-bundle\.json$/;
const failed = (f: Findings): ForgeBundleValidation => ({ ok: false, bundle: null, diagnostics: f.list });
/**
 * An archive path as `packPath` reads a member's, less its length and depth bounds: no drive, URI, leading `/` or
 * backslash, and every segment one `packPath` takes (no empty, `.`, `..`, hidden, reserved or unsafe segment). The
 * bounds are applied where they belong, to the path relative to the pack's root, by `validatePack`.
 */
function archivePath(raw: unknown): { ok: true; path: string } | { ok: false; text: string } {
  if (typeof raw !== "string" || raw.length === 0) return { ok: false, text: "A path must be a non-empty string." };
  if (raw.includes("\\")) return { ok: false, text: "Use forward slashes." };
  const path = raw.normalize("NFC");
  for (const segment of path.split("/")) {
    const s = packPath(segment);
    if (!s.ok) return { ok: false, text: segment === "" && path.startsWith("/") ? "A path must be relative to the bundle, not absolute." : s.text };
  }
  return { ok: true, path };
}
/** A carried manifest's `{id, range}` dependencies, read leniently (bounded, never thrown): the edges of the carried graph. */
function declaredDependencies(manifest: BundleEntry | undefined): { id: string; range: string }[] {
  if (!manifest || manifest.bytes.length > PACK_MANIFEST_BYTES_ADAPTATION) return [];
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifest.bytes)); } catch { return []; }
  const deps = isObject(raw) ? raw["dependencies"] : undefined;
  if (!Array.isArray(deps)) return [];
  return deps.filter((d): d is { id: string; range: string } => isObject(d) && typeof d["id"] === "string" && typeof d["range"] === "string")
    .map((d) => ({ id: d.id, range: d.range }));
}
/** A carried pack's finding as the bundle reports it: the same diagnostic, its `file` under the pack's folder `at`. */
const underRoot = (x: Diagnostic, at: string): Diagnostic => {
  const { schema: _schema, version: _version, ...input } = x;
  return diagnostic({ ...input, file: at + (x.file ?? "") });
};

/**
 * Check a forge-map bundle's entries (FP-4). Only a bundle with no error and no skipped check returns its layout, its
 * packs and its `missing` list; every finding is in `diagnostics` either way.
 */
export async function validateForgeBundle(entries: readonly BundleEntry[], options: ValidateBundleOptions = {}): Promise<ForgeBundleValidation> {
  const f = new Findings();
  let total = 0;
  for (const e of entries) total += e.bytes.length;
  if (total > BUNDLE_MAX_BYTES_ADAPTATION) {
    f.error(BUNDLE_CODES.tooLarge, "The bundle's files are over the bound.", { expected: String(BUNDLE_MAX_BYTES_ADAPTATION), actual: String(total) });
    return failed(f);
  }
  // The archive's paths: relative, NFC, no escape, each segment safe (`archivePath`), no case-fold duplicate; folder
  // entries dropped. The pack's length and depth bounds are a member's, relative to its root (`validatePack` applies
  // them to the pack-relative name; Codex P2 on #746): `packs/0/` and an enclosing folder never count against them.
  const files: BundleEntry[] = [];
  const folded = new Set<string>();
  for (const e of entries) {
    if (typeof e.path === "string" && e.path.endsWith("/") && e.bytes.length === 0) continue;
    const p = archivePath(e.path);
    if (!p.ok) { f.error(BUNDLE_CODES.pathInvalid, p.text, { file: String(e.path).slice(0, 240) }); continue; }
    const fold = p.path.toLowerCase();
    if (folded.has(fold)) { f.error(BUNDLE_CODES.pathInvalid, "Two files are one path once normalised (NFC, case).", { file: p.path }); continue; }
    folded.add(fold);
    files.push({ path: p.path, bytes: e.bytes });
  }
  if (f.list.length) return failed(f);

  // The envelope: the root's when there is one (a top-folder candidate is checked against the declared roots below),
  // else exactly one in a top folder.
  const candidates = files.filter((e) => e.path === FORGE_BUNDLE_FILE || TOP_ENVELOPE.test(e.path));
  const atRoot = candidates.find((e) => e.path === FORGE_BUNDLE_FILE);
  const envelopes = atRoot ? [atRoot] : candidates;
  if (envelopes.length === 0) {
    f.error(BUNDLE_CODES.envelopeMissing, `The bundle has no ${FORGE_BUNDLE_FILE} at its root or in one top folder.`, { file: FORGE_BUNDLE_FILE });
    return failed(f);
  }
  if (envelopes.length > 1) {
    f.error(BUNDLE_CODES.rootAmbiguous, `The bundle has ${envelopes.length} ${FORGE_BUNDLE_FILE} files: one root only.`, { actual: envelopes.map((e) => e.path).join(", ") });
    return failed(f);
  }
  const envelope = envelopes[0]!;
  const prefix = envelope.path.slice(0, envelope.path.length - FORGE_BUNDLE_FILE.length);
  if (envelope.bytes.length > BUNDLE_ENVELOPE_BYTES_ADAPTATION) {
    f.error(BUNDLE_CODES.tooLarge, "The envelope is over its bound.", { file: envelope.path, expected: String(BUNDLE_ENVELOPE_BYTES_ADAPTATION), actual: String(envelope.bytes.length) });
    return failed(f);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(envelope.bytes));
  } catch {
    f.error(BUNDLE_CODES.envelopeInvalid, "The envelope is not UTF-8 JSON.", { file: envelope.path });
    return failed(f);
  }
  if (!isObject(raw)) {
    f.error(BUNDLE_CODES.envelopeInvalid, "The envelope is not a JSON object.", { file: envelope.path });
    return failed(f);
  }
  for (const k of Object.keys(raw)) {
    if (!(FORGE_BUNDLE_KEYS as readonly string[]).includes(k)) f.error(BUNDLE_CODES.fieldUnknown, `The envelope names no field ${k}.`, { file: envelope.path, field: k });
  }
  if (raw["schema"] !== FORGE_BUNDLE_SCHEMA) {
    f.error(BUNDLE_CODES.schema, `The envelope's schema is ${FORGE_BUNDLE_SCHEMA}.`, { file: envelope.path, field: "schema", expected: FORGE_BUNDLE_SCHEMA, actual: String(raw["schema"]) });
  }
  if (raw["version"] !== FORGE_BUNDLE_VERSION) {
    f.error(BUNDLE_CODES.version, `The envelope's version is ${FORGE_BUNDLE_VERSION}.`, { file: envelope.path, field: "version", expected: String(FORGE_BUNDLE_VERSION), actual: String(raw["version"]) });
  }
  if (f.list.length) return failed(f);

  // The packs' entries: {ref, root}, each root a folder no other root holds or is held by.
  const declared: { ref: PackRef; root: string; index: number }[] = [];
  const packs = raw["packs"];
  if (!Array.isArray(packs) || packs.length > BUNDLE_PACKS_MAX_ADAPTATION) {
    f.error(BUNDLE_CODES.packsInvalid, `The envelope's packs are a list of at most ${BUNDLE_PACKS_MAX_ADAPTATION}.`, { file: envelope.path, field: "packs" });
    return failed(f);
  }
  for (const [i, p] of packs.entries()) {
    const field = `packs[${i}]`;
    if (!isObject(p) || Object.keys(p).some((k) => !(FORGE_BUNDLE_PACK_KEYS as readonly string[]).includes(k))) {
      f.error(BUNDLE_CODES.packsInvalid, "A pack entry is {ref, root} and nothing else.", { file: envelope.path, field });
      continue;
    }
    const why = checkPackRef(p["ref"]);
    if (why) {
      f.error(BUNDLE_CODES.packRefInvalid, why, { file: envelope.path, field: `${field}.ref` });
      continue;
    }
    const root = p["root"];
    const rootPath = typeof root === "string" && root.endsWith("/") ? packPath(root.slice(0, -1)) : null;
    if (typeof root !== "string" || !rootPath || !rootPath.ok || `${rootPath.path}/` !== root) {
      f.error(BUNDLE_CODES.packRootInvalid, "A pack's root is a folder path under the envelope, ending /.", { file: envelope.path, field: `${field}.root`, actual: String(root) });
      continue;
    }
    const ref = p["ref"] as unknown as PackRef;
    const clash = declared.find((d) => d.root.startsWith(root) || root.startsWith(d.root));
    if (clash) {
      f.error(BUNDLE_CODES.packRootInvalid, "Two packs' roots are one folder, or one holds the other.", { file: envelope.path, field: `${field}.root`, actual: `${root} / ${clash.root}` });
      continue;
    }
    if (declared.some((d) => d.ref.id === ref.id && d.ref.version === ref.version)) {
      f.error(BUNDLE_CODES.packDuplicate, "Two pack entries name one pack id and version.", { file: envelope.path, field: `${field}.ref`, actual: `${ref.id}@${ref.version}` });
      continue;
    }
    declared.push({ ref: { id: ref.id, version: ref.version, hash: ref.hash }, root, index: i });
  }

  // The review's F2: beside the root's envelope, another candidate is a pack's member only under a declared root.
  const second = candidates.filter((e) => e !== envelope && !declared.some((d) => e.path.startsWith(prefix + d.root)));
  if (second.length) {
    f.error(BUNDLE_CODES.rootAmbiguous, `The bundle has ${second.length + 1} ${FORGE_BUNDLE_FILE} files outside its packs: one root only.`, {
      actual: [envelope, ...second].map((e) => e.path).join(", "),
    });
    return failed(f);
  }

  // Every file is the envelope, or under the envelope's folder and one pack's root.
  for (const e of files) {
    if (e === envelope) continue;
    const rel = e.path.startsWith(prefix) ? e.path.slice(prefix.length) : null;
    if (rel === null || !declared.some((d) => rel.startsWith(d.root))) {
      f.error(BUNDLE_CODES.fileOutside, "A file is outside every pack root, and not the envelope.", { file: e.path, hint: "Move it into a pack (and list it there), or leave it out of the bundle." });
    }
  }

  // The layout: a record v3, read by the record's own reader.
  const layout = raw["layout"];
  let record: CreatorLayoutRecord | null = null;
  let warnings: Diagnostic[] = [];
  if (!isObject(layout) || layout["schema"] !== RECORD_SCHEMA || layout["version"] !== RECORD_VERSION) {
    f.error(BUNDLE_CODES.layoutInvalid, `The bundle's layout is a ${RECORD_SCHEMA} record version ${RECORD_VERSION}.`, { file: envelope.path, field: "layout" });
  } else {
    try {
      const read = readCreatorRecord(JSON.stringify(layout), options.modes ? { modes: options.modes } : {});
      record = read.record;
      warnings = read.warnings;
    } catch (err) {
      const actual = err instanceof Error ? err.message : String(err);
      f.error(BUNDLE_CODES.layoutInvalid, "The bundle's layout is not a record this build reads.", { file: envelope.path, field: "layout", actual });
    }
  }

  // Each declared pack, validated whole under its root as any v2 pack is, against the build and the carried packs.
  const carried: ForgeBundlePack[] = [];
  // Codex P2 (#746): each carried pack enters the shared context with its manifest's `{id, range}` dependencies, read
  // before any is validated, so `validatePack`'s cycle check (`AvailablePack.dependencies`) sees the carried graph:
  // A -> B -> A is refused DEPENDENCY_CYCLE. A manifest that does not parse gives no edges; its own check refuses it.
  const available: AvailablePack[] = [
    ...declared.map((d) => ({ ref: d.ref, dependencies: declaredDependencies(files.find((e) => e.path === prefix + d.root + PACK_MANIFEST_FILE)) })),
    ...(options.packs ?? []),
  ];
  for (const d of declared) {
    const at = prefix + d.root;
    const members = files.filter((e) => e.path.startsWith(at)).map((e) => ({ path: e.path.slice(at.length), bytes: e.bytes }));
    const checked = await validatePack(members, {
      target: options.target ?? PACK_TARGET_US,
      contract: options.contract ?? ENGINE_CONTRACT_VERSION,
      packs: available,
      ...(options.archives ? { archives: options.archives } : {}),
      ...(options.handlers ? { handlers: options.handlers } : {}),
      ...(options.sha256 ? { sha256: options.sha256 } : {}),
    });
    if (!checked.ok) {
      f.error(BUNDLE_CODES.packInvalid, `The pack under ${d.root} is not a valid pack.`, { file: at, field: `packs[${d.index}]`, actual: checked.report.status });
      for (const x of checked.report.diagnostics) f.list.push(underRoot(x, at));
      continue;
    }
    if (!samePackRef(checked.ref, d.ref)) {
      f.error(BUNDLE_CODES.packRefMismatch, `The pack under ${d.root} is not the one its entry names.`, {
        file: at, field: `packs[${d.index}].ref`, expected: packRefKey(d.ref), actual: packRefKey(checked.ref),
        hint: "Write the entry's ref again from the pack (its hash is the pack digest), or restore the pack.",
      });
      continue;
    }
    // A pass may still carry warnings (a pass is no error, `reportStatus`): forwarded, never dropped.
    for (const x of checked.report.diagnostics) f.list.push(underRoot(x, at));
    carried.push({ ref: checked.ref, root: d.root, manifest: checked.manifest });
  }

  // The content base's map, when its pack is carried: the member is there and reads as a content map (v1 or v2). Its
  // dependencies are not resolved here (no device list): the map is checked as the member it is.
  const base = record?.contentBase;
  const basePack = base ? carried.find((c) => samePackRef(c.ref, base.ref)) : undefined;
  if (base && basePack) {
    const member = contentMapMemberPath(base.mapId);
    const at = prefix + basePack.root;
    const file = basePack.manifest.files.some((m) => m.path === member) ? files.find((e) => e.path === at + member) : undefined;
    if (!file) {
      f.error(BUNDLE_CODES.baseMapMissing, `The base pack has no ${member} for the layout's map ${base.mapId}.`, {
        file: at + member, field: "layout.contentBase.mapId", actual: packRefKey(basePack.ref),
      });
    } else {
      const read = readContentMapDefinition(new TextDecoder().decode(file.bytes), { kind: "pack", pack: basePack.ref, assetId: base.mapId }, { versions: CONTENT_MAP_VERSIONS });
      if (Array.isArray(read)) {
        f.error(BUNDLE_CODES.baseMapInvalid, `The base pack's ${member} is not a content map this build reads.`, { file: at + member, actual: packRefKey(basePack.ref) });
        for (const x of read) f.list.push(underRoot(x, at + member));
      }
    }
  }

  const diagnostics = [...f.list, ...warnings];
  if (!record || reportStatus(diagnostics) !== "pass") return { ok: false, bundle: null, diagnostics };
  const required = sortPackRefs([...(record.requires ?? []), ...(record.contentBase ? [record.contentBase.ref] : [])]);
  const missing = missingPackRefs(required, carried.map((c) => c.ref));
  return { ok: true, bundle: { layout: record, packs: carried, missing }, diagnostics };
}
