/**
 * FX-3 (FX.R4, FX.R11; `docs/specs/2026-11-11-pack-format-0.2-and-forge-io.md` sections 2 and 5), a browser adaptation
 * with no original: a Forge map as ONE v2 pack. Nothing here reads the disc, runs a pack's bytes or changes what the game
 * does: a standard match reads no pack. A disc-only layout names disc assets (`MP2:crate`), never their bytes.
 *
 * The shape:
 * - the layout record v3 (`layout.ts` `CreatorLayoutRecord`, read by `readCreatorRecord`) is a `gameplay`-role member at
 *   `layouts/<slug>.json` (`layoutMemberPath`; the slug rule `LAYOUT_SLUG`), under a `gameplay-value` intent -- the
 *   path the convention, as `maps/<mapId>.json` is a content map's (`maps.ts` `contentMapMemberPath`); a pack holds ONE
 *   (FX-5; the 0.2 spec's decision 3: its one `rules/mode.json` is that layout's), a second is `mapPack.LAYOUT_TWICE`;
 * - a layout's own rules draft is folded into the same pack as `rules/mode.json` (the path and the shape
 *   `viewer/src/forge/rulesAuthoring.ts` `buildRulesPack` writes: the `RulesSpec` itself, a `rules`-role member under a
 *   `new-behaviour` intent, the manifest's `handlers` the spec's capabilities), so the pack's kinds are `content` and
 *   `rules`;
 * - **self-reference**: a member cannot hold the hash of the pack it sits in (the hash is a digest over the member's own
 *   bytes, `packDigest`). So the packed layout leaves its own pack out of `requires`, and its `mode` (`{id, version,
 *   params}`, which carries no hash) names the folded spec's id at the pack's own version -- a mode's version is its
 *   pack's (`layout.ts` `RulesModeEntry`). The reader attaches the validated pack's reference after validation, as
 *   `maps.ts` does for a content map's own props (S3d): the rules are bound to it, and a layout playing the pack's own
 *   mode requires it. The own pack is matched by id and version, whatever hash (`maps.ts` `isOwnPack`, LATER 459);
 * - every other pack the layout needs stays in its `requires` (with its hash) and becomes one `{id, range}` dependency at
 *   its exact version. On read a dependency this device lacks is listed (`missing`), never refused (FX.R11): the
 *   validator lists it (`PackContext.missingDependencies`, FX-5);
 * - the store's root files (`manifest.json`, `icon.png`, `README.md`, `CHANGELOG.md`) are not written here and sit
 *   outside the pack's identity (`packs.ts` `THUNDERSTORE_STORE_FILES`).
 *
 * Every text is canonical JSON (`digest.ts` `canonicalJson`), so the same input gives the same bytes and the same pack
 * hash. Every finding is a `Diagnostic`, source `pack`, evidence `validation`, coded `mapPack.*` (`MAP_PACK_CODES`); a
 * pack that does not validate leads with `mapPack.PACK_INVALID` and forwards its own `pack.*` findings.
 */
import { missingPackRefs, packRefKey, sortPackRefs } from "./content.js";
import { diagnostic, reportStatus, type Diagnostic, type DiagnosticInput } from "./diagnostics.js";
import { canonicalJson, compareUtf8, sha256Hex, type Sha256 } from "./digest.js";
import { behaviourCatalogue } from "./handlers.js";
import {
  checkCreatorRecord, layoutEntityIds, readCreatorRecord, RECORD_SCHEMA, RECORD_VERSION, rulesModeCatalogue,
  type CreatorLayoutRecord, type ModeCatalogueEntry,
} from "./layout.js";
import {
  ENGINE_CONTRACT_VERSIONS, PACK_CONTRACT_0_2_FLOOR, PACK_FORMAT, PACK_FORMAT_VERSION, PACK_ID_CHARS_ADAPTATION, PACK_MANIFEST_FILE,
  PACK_TARGET_US, validatePack,
  type AvailablePack, type BufferedPackFile, type EngineContract, type PackFileEntry, type PackHandlerCapability, type PackIntent, type PackManifest, type PackRef,
} from "./packs.js";
import { rulesCatalogue, validateRules, type RulesSpec } from "./rules.js";
import { compareSemver, parseSemver } from "./semver.js";

export const MAP_PACK_ADAPTATION =
  "a Forge map as one creator pack: a browser adaptation with no original; a standard match reads no pack" as const;

/** The folder a layout member sits in. */
export const MAP_PACK_LAYOUT_DIR = "layouts/" as const;
/** The folded rules draft's member: `rulesAuthoring.ts` `RULES_MEMBER_PATH`, the path `buildRulesPack` writes. */
export const MAP_PACK_RULES_PATH = "rules/mode.json" as const;
/**
 * The engine contract range a map pack states (FX-5; the spec's decision 8, "a writer writes the lowest range its
 * content needs"): `^0.2.0`, the first contract with a layout member (`PACK_CONTRACT_0_2_FLOOR`), so a 0.1.x build refuses
 * it by contract, never half reads it; it meets the rules floor (`RULES_PACK_CONTRACT_FLOOR`, 0.1.1) when the rules are
 * folded in. A fixed fact, not the build's version: it stays `^0.2.0` when `ENGINE_CONTRACT_VERSION` moves on.
 */
export const MAP_PACK_CONTRACT = `^${PACK_CONTRACT_0_2_FLOOR}`;

/** A layout's slug: 1-64 of lower-case `a-z 0-9` and `-`, a letter or digit at each end. */
export const LAYOUT_SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const LAYOUT_SLUG_CHARS = PACK_ID_CHARS_ADAPTATION;
/** A slug the pack path refuses as a reserved device name (`packs.ts` `packPath`'s `RESERVED`, on `<slug>.json`). */
const RESERVED_SLUG = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/** Whether `slug` follows the slug rule. */
export const isLayoutSlug = (slug: string): boolean =>
  slug.length <= LAYOUT_SLUG_CHARS && LAYOUT_SLUG.test(slug) && !RESERVED_SLUG.test(slug);

/** The member that holds a layout: derived from its slug only (as `contentMapMemberPath` from a map id). */
export const layoutMemberPath = (slug: string): string => `${MAP_PACK_LAYOUT_DIR}${slug}.json`;

/**
 * The slug a layout's name proposes: accents dropped, lower case, every run of other characters one `-`, trimmed, at
 * most 64; `layout` when nothing is left, and `<slug>-map` for a reserved device name. A creator may pass their own.
 */
export function layoutSlug(name: string): string {
  const s = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, LAYOUT_SLUG_CHARS).replace(/-+$/, "");
  if (!s) return "layout";
  return RESERVED_SLUG.test(s) ? `${s}-map` : s;
}

const LAYOUT_MEMBER = /^layouts\/([^/]+)\.json$/;

export const MAP_PACK_CODES = Object.freeze({
  /** The pack's id is not one `validatePack` takes (1-64 of a-z 0-9 . -, letter or digit at each end, no legacy prefix). */
  idInvalid: "mapPack.ID_INVALID",
  /** The pack's version is not a SemVer version. */
  versionInvalid: "mapPack.VERSION_INVALID",
  /** The slug given does not follow the slug rule (`LAYOUT_SLUG`). */
  slugInvalid: "mapPack.SLUG_INVALID",
  /** No `layouts/<slug>.json` member in the pack. */
  layoutMissing: "mapPack.LAYOUT_MISSING",
  /** A second member under `layouts/`: a map pack holds one layout (FX-5; the 0.2 spec's decision 3). */
  layoutTwice: "mapPack.LAYOUT_TWICE",
  /** A layout is not a record v3 this build reads (`actual` names the record reader's reason). */
  layoutInvalid: "mapPack.LAYOUT_INVALID",
  /** A member under `layouts/` whose role is not `gameplay`. */
  layoutRole: "mapPack.LAYOUT_ROLE",
  /** A member under `layouts/` that is not `layouts/<slug>.json` with a slug the rule takes. */
  layoutPath: "mapPack.LAYOUT_PATH",
  /** A layout whose `requires` names its own pack (its id and version, whatever hash): the reader attaches that one. */
  selfRequired: "mapPack.SELF_REQUIRED",
  /** The folded rules spec does not validate (`validateRules`); its `rules.*` findings follow. */
  rulesInvalid: "mapPack.RULES_INVALID",
  /** The pack does not validate (`validatePack`); its `pack.*` findings follow. */
  packInvalid: "mapPack.PACK_INVALID",
  /**
   * A `layouts/` member in a pack whose `contract` range admits an engine before `PACK_CONTRACT_0_2_FLOOR`: a layout
   * member is a 0.2 member, and a 0.1.x build would install the pack as plain content and ignore the layout (the
   * half-read the floor stops; as `packs.ts` `pack.CONTRACT_FIELD` for a 0.2 manifest field).
   */
  contractFloor: "mapPack.CONTRACT_FLOOR",
} as const);
export type MapPackCode = (typeof MAP_PACK_CODES)[keyof typeof MAP_PACK_CODES];

/** One written member: its path in the pack and its text (UTF-8 when zipped). */
export interface MapPackFile {
  readonly path: string;
  readonly text: string;
}

export interface MapPackInput {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description?: string;
  readonly layout: CreatorLayoutRecord;
  /** The layout's own rules draft's spec, folded in as `rules/mode.json`. */
  readonly rules?: RulesSpec;
  /**
   * The draft's own pack before the fold (`ForgeRulesDraft.pack`, which `sealForgeRules` puts in `requires`): left out
   * of the packed `requires` (by id and version, whatever hash), and the layout's mode at its version moved to the pack's.
   */
  readonly rulesPack?: PackRef;
  /** The layout's slug; by default `layoutSlug(layout.name)`. */
  readonly slug?: string;
  /** The modes of installed rules packs the layout may play (a dependency's mode); the folded spec's own is added. */
  readonly modes?: readonly ModeCatalogueEntry[];
  /** The handler catalogue the pack's claims are checked against; by default the behaviour family (`behaviourCatalogue`). */
  readonly handlers?: readonly PackHandlerCapability[];
  readonly sha256?: Sha256;
}

export type MapPackBuild =
  | { readonly ok: true; readonly manifest: PackManifest; readonly files: MapPackFile[]; readonly ref: PackRef; readonly diagnostics: Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: Diagnostic[] };

/** One layout read out of a map pack. */
export interface MapPackLayout {
  readonly path: string;
  readonly slug: string;
  /** The record, its own pack attached to `requires` when it plays the pack's own mode. */
  readonly record: CreatorLayoutRecord;
  /** The packs it requires that this device does not hold (its own pack never among them). */
  readonly missing: PackRef[];
}
export interface MapPack {
  readonly ref: PackRef;
  readonly manifest: PackManifest;
  readonly layouts: readonly MapPackLayout[];
  /** The folded rules, bound to the pack's own reference (`ForgeRulesDraft`'s shape). */
  readonly rules?: { readonly pack: PackRef; readonly spec: RulesSpec };
  /** Every layout's `missing`, each once, sorted (`sortPackRefs`). */
  readonly missing: PackRef[];
}
export type MapPackRead =
  | { readonly ok: true; readonly pack: MapPack; readonly diagnostics: Diagnostic[] }
  | { readonly ok: false; readonly pack: null; readonly diagnostics: Diagnostic[] };

/** The build context the pack is read in; each absent part as `validatePack` takes its absence, bar the noted defaults. */
export interface ReadMapPackOptions {
  /** `PACK_TARGET_US` by default. */
  readonly target?: string;
  /** The versions this build reads, `ENGINE_CONTRACT_VERSIONS`, by default (FX-5). */
  readonly contract?: EngineContract;
  /** The packs this device holds. Absent: none, so every dependency is listed `missing` (never refused: the validator lists it). */
  readonly packs?: readonly AvailablePack[];
  readonly archives?: Readonly<Record<string, string>>;
  /** The handler catalogue; by default the behaviour family (`behaviourCatalogue`). */
  readonly handlers?: readonly PackHandlerCapability[];
  /** The modes of installed rules packs a layout may play; the pack's own rules' mode is added. */
  readonly modes?: readonly ModeCatalogueEntry[];
  readonly sha256?: Sha256;
}

type Extra = Pick<DiagnosticInput, "file" | "field" | "expected" | "actual" | "hint">;
class Findings {
  readonly list: Diagnostic[] = [];
  error(code: MapPackCode, text: string, extra: Extra = {}): void {
    this.list.push(diagnostic({ source: "pack", severity: "error", code, text, evidence: "validation", ...extra }));
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const readText = (bytes: Uint8Array): string | null => {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return null; }
};
/** The own pack: the same id and version, whatever hash (a writer cannot know its own pack's hash; `maps.ts` `isOwnPack`). */
const isOwn = (p: { readonly id: string; readonly version: string }, own: { readonly id: string; readonly version: string }): boolean =>
  p.id === own.id && p.version === own.version;
/** A pack id as `packs.ts` reads a v2 manifest's (`packId`, not exported there): no legacy namespace in a v2 pack. */
const PACK_ID = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const LEGACY_NAMESPACE = /^(?:mod|model|texture)\./;
const packIdOk = (id: unknown): id is string =>
  typeof id === "string" && id.length <= PACK_ID_CHARS_ADAPTATION && PACK_ID.test(id) && !id.includes("..") && !LEGACY_NAMESPACE.test(id);
/**
 * A hash no pack has: the pack's own hash while it is being built (`buildMapPack`: its folded mode is checked before the
 * pack exists). FX-3 also stood it in for a dependency the device lacked; FX-5's `missingDependencies: "list"` replaced that.
 */
const UNHELD_HASH = "0".repeat(64);
/**
 * Whether a range admits no version before `floor`: `packs.ts` `rangeHasFloor`'s rule, restated here because that one is
 * not exported -- every `||` alternative holds a lower bound (`>=v`, `>v`, `^v`, `~v`, `=v` or a bare `v`) with `v` at
 * or above `floor` by SemVer precedence; an alternative bounded only from above, or `*`, does not.
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
/** The folded spec's mode at the pack's own version (`rulesModeCatalogue`: id the spec's, version the pack's). */
const ownModes = (own: PackRef, spec: RulesSpec | undefined): ModeCatalogueEntry[] =>
  spec ? [...rulesModeCatalogue([{ ref: own, spec }]).modes] : [];

/**
 * A Forge map as one v2 pack: the layout a `gameplay` member, its own rules draft (when given) folded in, its other packs
 * the manifest's dependencies at their exact versions. Refused, by name: an id or version `validatePack` would refuse, a
 * slug the rule does not take, a layout whose `requires` names the pack being built, a layout or a spec that does not
 * check; and the built pack is validated (`validatePack`) before it is returned, its reference the validator's.
 */
export async function buildMapPack(input: MapPackInput): Promise<MapPackBuild> {
  const f = new Findings();
  const failed = (): MapPackBuild => ({ ok: false, diagnostics: f.list });
  if (!packIdOk(input.id)) {
    f.error(MAP_PACK_CODES.idInvalid, "A pack id is 1-64 characters of a-z, 0-9, dots and hyphens, a letter or digit at each end, not mod., model. or texture.", { field: "id", actual: String(input.id).slice(0, 80) });
  }
  if (typeof input.version !== "string" || !parseSemver(input.version)) {
    f.error(MAP_PACK_CODES.versionInvalid, "A pack version is a semantic version such as 1.0.0.", { field: "version", actual: String(input.version).slice(0, 80) });
  }
  const slug = input.slug ?? layoutSlug(typeof input.layout?.name === "string" ? input.layout.name : "");
  if (!isLayoutSlug(slug)) {
    f.error(MAP_PACK_CODES.slugInvalid, `A layout's slug is 1-${LAYOUT_SLUG_CHARS} of a-z, 0-9 and hyphens, a letter or digit at each end.`, { field: "slug", actual: slug.slice(0, 80) });
  }
  if (f.list.length) return failed();

  // The fold: the draft's own pack leaves `requires`, the mode it offered moves to this pack's version.
  let record: CreatorLayoutRecord;
  try { record = json(input.layout); } catch { f.error(MAP_PACK_CODES.layoutInvalid, "The layout is not JSON data.", { field: "layout" }); return failed(); }
  if (!isObject(record as unknown)) { f.error(MAP_PACK_CODES.layoutInvalid, "The layout is not a record.", { field: "layout" }); return failed(); }
  const own = { id: input.id, version: input.version };
  if (input.rules) {
    const draft = input.rulesPack;
    if (draft && Array.isArray(record.requires)) {
      const kept = record.requires.filter((r) => !isOwn(r, draft));
      if (kept.length) record.requires = kept; else delete record.requires;
    }
    if (record.mode && record.mode.id === input.rules.id && (!draft || record.mode.version === draft.version)) record.mode = { ...record.mode, version: input.version };
  }
  (record.requires ?? []).forEach((r, i) => {
    if (isOwn(r, own)) {
      f.error(MAP_PACK_CODES.selfRequired, "A layout never names the pack it sits in: the reader attaches that pack's reference.", {
        field: `layout.requires[${i}]`, actual: packRefKey(r), hint: "Leave the map's own pack out of the layout's requires.",
      });
    }
  });
  if (f.list.length) return failed();

  // The spec against the layout's own entities (as the Forge checks it, `checkForgeRules`), then the record with its modes.
  if (input.rules) {
    const report = validateRules(input.rules, rulesCatalogue({ layout: layoutEntityIds(record) }));
    if (report.status !== "pass") {
      f.error(MAP_PACK_CODES.rulesInvalid, "The layout's rules do not validate.", { file: MAP_PACK_RULES_PATH, actual: report.status });
      f.list.push(...report.diagnostics);
      return failed();
    }
  }
  const modes = [...ownModes({ id: input.id, version: input.version, hash: UNHELD_HASH }, input.rules), ...(input.modes ?? [])];
  const why = checkCreatorRecord(record, { modes });
  if (why) {
    f.error(MAP_PACK_CODES.layoutInvalid, "The layout is not a record this build reads.", { field: "layout", actual: why });
    return failed();
  }

  // The members, canonical; then the manifest over them.
  const path = layoutMemberPath(slug);
  let members: MapPackFile[];
  try {
    members = [{ path, text: canonicalJson(record) }, ...(input.rules ? [{ path: MAP_PACK_RULES_PATH, text: canonicalJson(input.rules) }] : [])];
  } catch (err) {
    f.error(MAP_PACK_CODES.layoutInvalid, "The layout or its rules are not plain JSON data.", { actual: err instanceof Error ? err.message : String(err) });
    return failed();
  }
  const roles: Record<string, PackFileEntry["role"]> = { [path]: "gameplay", [MAP_PACK_RULES_PATH]: "rules" };
  const rows: PackFileEntry[] = [];
  for (const m of members) {
    const bytes = utf8(m.text);
    rows.push({ path: m.path, sha256: await sha256Hex(bytes, input.sha256), size: bytes.length, role: roles[m.path]! });
  }
  rows.sort((a, b) => compareUtf8(a.path, b.path));
  const requires = sortPackRefs(record.requires ?? []);
  const intents: PackIntent[] = [{ kind: "gameplay-value", files: [path] }, ...(input.rules ? [{ kind: "new-behaviour" as const, files: [MAP_PACK_RULES_PATH] }] : [])];
  const manifest = {
    format: PACK_FORMAT, formatVersion: PACK_FORMAT_VERSION, id: input.id, version: input.version, name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
    target: PACK_TARGET_US, contract: MAP_PACK_CONTRACT, kinds: input.rules ? ["content", "rules"] : ["content"], sides: "both",
    dependencies: requires.map((r) => ({ id: r.id, range: r.version })),
    files: rows, intents,
    ...(input.rules?.capabilities?.length ? { handlers: json(input.rules.capabilities) } : {}),
  };
  let manifestText: string;
  try { manifestText = canonicalJson(manifest); } catch (err) {
    f.error(MAP_PACK_CODES.packInvalid, "The manifest is not plain JSON data.", { file: PACK_MANIFEST_FILE, actual: err instanceof Error ? err.message : String(err) });
    return failed();
  }
  const files: MapPackFile[] = [{ path: PACK_MANIFEST_FILE, text: manifestText }, ...members];

  // The pack as any reader checks it: the layout's own packs are the dependencies' context (their references are known).
  const checked = await validatePack(files.map((x) => ({ path: x.path, bytes: utf8(x.text) })), {
    target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, packs: requires.map((ref) => ({ ref })),
    handlers: input.handlers ?? behaviourCatalogue(), ...(input.sha256 ? { sha256: input.sha256 } : {}),
  });
  if (!checked.ok) {
    f.error(MAP_PACK_CODES.packInvalid, "The map pack does not validate.", { actual: checked.report.status });
    f.list.push(...checked.report.diagnostics);
    return failed();
  }
  return { ok: true, manifest: checked.manifest, files, ref: { id: checked.ref.id, version: checked.ref.version, hash: checked.ref.hash }, diagnostics: [...checked.report.diagnostics] };
}

/**
 * Reads a map pack's already-unzipped entries: the pack validated (`validatePack`, the store's root files beside it
 * tolerated), every `layouts/<slug>.json` member read by `readCreatorRecord` (strict v3), the pack's own reference
 * attached after validation -- to the folded rules, and to the `requires` of a layout playing the pack's own mode -- and
 * the packs each layout needs that this device lacks listed in `missing`. Refused, by name: a pack that does not
 * validate, no layout member, a layout member in a pack whose contract admits an engine before 0.2.0 (`CONTRACT_FLOOR`),
 * a second layout member (`LAYOUT_TWICE`: one layout a pack), a layout member that does not
 * read, is not `gameplay` or is off the path rule, a layout naming its own pack in `requires`, folded rules that do not
 * validate. A `{id, range}` dependency this device lacks is the validator's to list (`missingDependencies: "list"`).
 */
export async function readMapPack(entries: readonly BufferedPackFile[], options: ReadMapPackOptions = {}): Promise<MapPackRead> {
  const f = new Findings();
  const failed = (): MapPackRead => ({ ok: false, pack: null, diagnostics: f.list });
  const held = options.packs ?? [];
  const checked = await validatePack(entries, {
    target: options.target ?? PACK_TARGET_US,
    contract: options.contract ?? ENGINE_CONTRACT_VERSIONS,
    packs: held,
    missingDependencies: "list",
    handlers: options.handlers ?? behaviourCatalogue(),
    ...(options.archives ? { archives: options.archives } : {}),
    ...(options.sha256 ? { sha256: options.sha256 } : {}),
  });
  if (!checked.ok) {
    f.error(MAP_PACK_CODES.packInvalid, "The map pack does not validate.", { actual: checked.report.status });
    f.list.push(...checked.report.diagnostics);
    return failed();
  }
  const own: PackRef = { id: checked.ref.id, version: checked.ref.version, hash: checked.ref.hash };
  const manifest = checked.manifest;
  const bytesOf = (path: string): Uint8Array | undefined => entries.find((e) => e.path.normalize("NFC") === path)?.bytes;
  const warnings: Diagnostic[] = [...checked.report.diagnostics];

  // The folded rules, when there are: one spec the validator passes, bound to the pack's own reference.
  let rules: { pack: PackRef; spec: RulesSpec } | undefined;
  const rulesRow = manifest.files.find((m) => m.path === MAP_PACK_RULES_PATH && m.role === "rules");
  if (rulesRow) {
    const text = readText(bytesOf(rulesRow.path) ?? new Uint8Array(0));
    let spec: unknown;
    try { spec = text === null ? undefined : JSON.parse(text); } catch { spec = undefined; }
    const report = validateRules(spec);
    if (report.status !== "pass") {
      f.error(MAP_PACK_CODES.rulesInvalid, "The pack's rules do not validate.", { file: rulesRow.path, actual: report.status });
      f.list.push(...report.diagnostics);
    } else rules = { pack: own, spec: spec as RulesSpec };
  }
  const modes = [...ownModes(own, rules?.spec), ...(options.modes ?? [])];
  const plays = (r: CreatorLayoutRecord): boolean => !!rules && !!r.mode && r.mode.id === rules.spec.id && r.mode.version === own.version;

  const layouts: MapPackLayout[] = [];
  const rows = manifest.files.filter((m) => m.path.startsWith(MAP_PACK_LAYOUT_DIR));
  if (rows.length === 0) f.error(MAP_PACK_CODES.layoutMissing, `The pack has no ${MAP_PACK_LAYOUT_DIR}<slug>.json member.`, { field: "files" });
  // A layout member is a contract 0.2.0 member (FX-5): the pack's range must admit no engine before it, as `packs.ts`
  // refuses a 0.2 manifest field (`pack.CONTRACT_FIELD`). Reported on each layout member; the read is not ok.
  if (!rangeHasFloor(manifest.contract, PACK_CONTRACT_0_2_FLOOR)) {
    const why = `A ${MAP_PACK_LAYOUT_DIR} member is a contract ${PACK_CONTRACT_0_2_FLOOR} member: the pack's contract must admit no engine before ${PACK_CONTRACT_0_2_FLOOR}.`;
    const hint = `State ^${PACK_CONTRACT_0_2_FLOOR} (MAP_PACK_CONTRACT), as buildMapPack writes.`;
    for (const row of rows) f.error(MAP_PACK_CODES.contractFloor, why, { file: row.path, field: "contract", expected: `^${PACK_CONTRACT_0_2_FLOOR}`, actual: manifest.contract, hint });
  }
  // One layout a pack (FX-5; the 0.2 spec's decision 3): the first, in the manifest's path order, is read; each other is refused.
  for (const extra of rows.slice(1)) {
    const hint = "Put each layout in its own pack; a set of maps is a pack whose dependencies are the maps' packs.";
    f.error(MAP_PACK_CODES.layoutTwice, `A map pack holds one ${MAP_PACK_LAYOUT_DIR}<slug>.json member.`, { file: extra.path, expected: rows[0]!.path, hint });
  }
  for (const row of rows.slice(0, 1)) {
    const at = LAYOUT_MEMBER.exec(row.path);
    if (!at || !isLayoutSlug(at[1]!)) {
      f.error(MAP_PACK_CODES.layoutPath, `A layout member is ${MAP_PACK_LAYOUT_DIR}<slug>.json, the slug 1-${LAYOUT_SLUG_CHARS} of a-z, 0-9 and hyphens.`, { file: row.path });
      continue;
    }
    if (row.role !== "gameplay") {
      f.error(MAP_PACK_CODES.layoutRole, "A layout member's role is gameplay.", { file: row.path, expected: "gameplay", actual: row.role });
      continue;
    }
    const text = readText(bytesOf(row.path) ?? new Uint8Array(0));
    let raw: unknown;
    try { raw = text === null ? undefined : JSON.parse(text); } catch { raw = undefined; }
    if (!isObject(raw) || raw["schema"] !== RECORD_SCHEMA || raw["version"] !== RECORD_VERSION) {
      f.error(MAP_PACK_CODES.layoutInvalid, `A layout member is a ${RECORD_SCHEMA} record version ${RECORD_VERSION}.`, { file: row.path });
      continue;
    }
    const requires = Array.isArray(raw["requires"]) ? raw["requires"] as unknown[] : [];
    const selfAt = requires.findIndex((r) => isObject(r) && r["id"] === own.id && r["version"] === own.version);
    if (selfAt >= 0) {
      f.error(MAP_PACK_CODES.selfRequired, "A layout never names the pack it sits in: the reader attaches that pack's reference.", {
        file: row.path, field: `requires[${selfAt}]`, actual: `${own.id}@${own.version}`,
      });
      continue;
    }
    let record: CreatorLayoutRecord;
    try {
      const read = readCreatorRecord(text!, { modes });
      record = read.record;
      warnings.push(...read.warnings);
    } catch (err) {
      f.error(MAP_PACK_CODES.layoutInvalid, "A layout member is not a record this build reads.", { file: row.path, actual: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (plays(record)) {
      const report = validateRules(rules!.spec, rulesCatalogue({ layout: layoutEntityIds(record) }));
      if (report.status !== "pass") {
        f.error(MAP_PACK_CODES.rulesInvalid, "The pack's rules do not validate against this layout's entities.", { file: row.path, actual: report.status });
        f.list.push(...report.diagnostics);
        continue;
      }
      record.requires = sortPackRefs([...(record.requires ?? []), own]);
    }
    const missing = missingPackRefs(sortPackRefs(record.requires ?? []), [...held.map((p) => p.ref), own]);
    layouts.push({ path: row.path, slug: at[1]!, record, missing });
  }

  const diagnostics = [...f.list, ...warnings];
  if (f.list.length || layouts.length === 0 || reportStatus(diagnostics) !== "pass") return { ok: false, pack: null, diagnostics };
  const missing = sortPackRefs(layouts.flatMap((l) => l.missing));
  return { ok: true, pack: { ref: own, manifest, layouts, ...(rules ? { rules } : {}), missing }, diagnostics };
}
