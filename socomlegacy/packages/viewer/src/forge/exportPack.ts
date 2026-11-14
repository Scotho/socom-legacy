import {
  behaviourCatalogue, buildMapPack, canonicalJson, checkThunderstorePackage, diagnostic, ENGINE_CONTRACT_VERSIONS, MAP_PACK_LAYOUT_DIR,
  MAP_PACK_RULES_PATH, PACK_MANIFEST_FILE, PACK_TARGET_US, recordOfLayout, rulesModeCatalogue, THUNDERSTORE_TEAM, thunderstoreManifest,
  thunderstoreName, thunderstoreReadme, validatePack,
  type BufferedPackFile, type CreatorLayoutRecord, type Diagnostic, type DiagnosticInput, type InstalledRulesPack, type PackRef, type Sha256,
} from '@s2u/creator-contracts';
// The one store-only zip writer in the workspace (`packages/playtest/src/zip.ts`, PT-17): pure, no imports, browser-safe.
// The viewer does not depend on `@s2u/playtest` (its index pulls Node services), so the module is imported by path, as
// the viewer imports `match/src` modules; `tools/parity-pack/zipStream.ts` is held byte-equal to the same writer.
import { writeZip } from '../../../playtest/src/zip';
import { planIconPng } from './planIcon';
import { checkForgeRecord, checkForgeRules, refusalWords, sealForgeRules, type ForgeLayout } from './rulesAuthoring';

/**
 * FX-11a slice 2 (FX.R4, the owner: "Yes, lets export to thunderstore pack format"; FX.R11; the pack format 0.2 spec
 * section 5; H442 e, f, m; a browser adaptation with no original): the Forge's pack export. One zip that is our v2 map
 * pack and a Thunderstore package at once:
 *
 *   s2u-pack.json          ours, from `buildMapPack` (the licence and authors added when given: contract 0.2 fields)
 *   layouts/<slug>.json    the layout record v3, as Save writes it (`recordOfLayout`)
 *   rules/mode.json        its own rules draft, folded in, when it has one
 *   manifest.json          the store's, from `thunderstoreManifest`: each dependency under its own team
 *   icon.png               the drawn plan (`./planIcon`): no disc pixels (H442 f)
 *   README.md              from `thunderstoreReadme`
 *
 * Nothing of the disc enters it: a layout names disc assets (`MP2:crate`), the player's own disc supplies them (RS.R8,
 * OT.R34). The member list is held to a fixed allow-list (`FORGE_EXPORT_MEMBERS`) and the whole list checked by
 * `validatePack` and `checkThunderstorePackage` before anything is returned. Other packs are referenced, never carried.
 * The team (H442 m): the creator's own, passed in; the project's `THUNDERSTORE_TEAM` only for the project's own packs
 * (`project: true`). Changes no game behaviour: a standard match reads no pack.
 */
export const FORGE_EXPORT_ADAPTATION =
  "the Forge's pack export: a browser adaptation with no original; a layout names disc assets and carries none of their bytes" as const;

/** The export's own refusals (beside the contract's `mapPack.*`, `pack.*` and `store.*`, forwarded as they come). */
export const FORGE_EXPORT_CODES = Object.freeze({
  /** The layout does not pass the checks Save runs (the record with its modes, then its rules). */
  notSaveable: 'forge.export.NOT_SAVEABLE',
  /** A store export (`forStore`) with no licence (H442 e: required, any SPDX id). */
  licenceMissing: 'forge.export.LICENCE_MISSING',
  /** A store export (`forStore`) with no team, and not the project's own pack (H442 m). */
  teamMissing: 'forge.export.TEAM_MISSING',
  /** The project's own pack (`project: true`) given a team that is not the project's. */
  teamConflict: 'forge.export.TEAM_CONFLICT',
  /** A member the allow-list does not permit, or a second layout. */
  memberRefused: 'forge.export.MEMBER_REFUSED',
  /** No `s2u-pack.json`, or no layout member. */
  memberMissing: 'forge.export.MEMBER_MISSING',
  /** The assembled package fails `validatePack` or `checkThunderstorePackage` (their findings follow). */
  packageInvalid: 'forge.export.PACKAGE_INVALID',
} as const);
export type ForgeExportCode = (typeof FORGE_EXPORT_CODES)[keyof typeof FORGE_EXPORT_CODES];

/**
 * The fixed allow-list of an export's members (the spec section 5; A3 section 5): the pack's manifest, the store's three
 * root files, the folded rules, and one layout. Nothing else -- no texture, no mesh, no sound, no `CHANGELOG.md`, and
 * not yet `rules/map.json` (a layout's script, FX-16: added here when something writes it).
 */
export const FORGE_EXPORT_MEMBERS: readonly string[] = Object.freeze([PACK_MANIFEST_FILE, 'manifest.json', 'icon.png', 'README.md', MAP_PACK_RULES_PATH]);
/** The one layout member: `layouts/<slug>.json`, the slug rule's characters (`mapPack.ts` `LAYOUT_SLUG`). */
export const FORGE_EXPORT_LAYOUT_MEMBER = /^layouts\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.json$/;

/** Whether `path` is a member an export may hold. */
export const exportMemberAllowed = (path: string): boolean => FORGE_EXPORT_MEMBERS.includes(path) || FORGE_EXPORT_LAYOUT_MEMBER.test(path);

type Extra = Pick<DiagnosticInput, 'file' | 'field' | 'expected' | 'actual' | 'hint'>;
const error = (code: ForgeExportCode, text: string, extra: Extra = {}): Diagnostic =>
  diagnostic({ source: 'pack', severity: 'error', code, text, evidence: 'validation', ...extra });

/**
 * The allow-list over a member list: each path off the list, and each layout past the first, refused
 * (`MEMBER_REFUSED`); no `s2u-pack.json`, or no layout, missing (`MEMBER_MISSING`). Empty when the list is one an
 * export may hold.
 */
export function checkExportMembers(paths: readonly string[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  let layouts = 0;
  const allowed = `${FORGE_EXPORT_MEMBERS.join(', ')} and one ${MAP_PACK_LAYOUT_DIR}<slug>.json`;
  for (const path of paths) {
    if (FORGE_EXPORT_LAYOUT_MEMBER.test(path) && ++layouts === 1) continue;
    if (FORGE_EXPORT_MEMBERS.includes(path)) continue;
    const second = FORGE_EXPORT_LAYOUT_MEMBER.test(path);
    out.push(error(FORGE_EXPORT_CODES.memberRefused, second ? 'An export holds one layout.' : 'An export holds only its pack manifest, its layout, its rules and the store files.',
      { file: path, expected: allowed }));
  }
  if (!paths.includes(PACK_MANIFEST_FILE)) out.push(error(FORGE_EXPORT_CODES.memberMissing, `An export holds ${PACK_MANIFEST_FILE}.`, { file: PACK_MANIFEST_FILE }));
  if (layouts === 0) out.push(error(FORGE_EXPORT_CODES.memberMissing, `An export holds one ${MAP_PACK_LAYOUT_DIR}<slug>.json.`, { field: 'files' }));
  return out;
}

/**
 * The forge's own blank floor, which lends no game map's props (`matchMap.ts` `BLANK_LIBRARY`, the contract's
 * `BLANK_FLOOR` in `layout.ts`): written here, not imported, so the export's module graph stays the leak test's.
 */
const OWN_FLOOR_LIBRARY = 'floor';

/**
 * What the player's own copy of the game supplies a layout, as the README's own-copy phrases (`thunderstoreReadme`'s
 * `ownCopy`; FX-11a's review): a game map's world (`base.kind` `map`), the game map whose props a blank floor borrows
 * (`blank` with a library), the game map whose props, characters and kits an authored map's layout takes (`content`:
 * its library); nothing when the library is the forge's own floor. `baseName` is the base map's display name: a game
 * map's, or the lending map's for a blank floor; for a `content` base it names the authored map, not the game map, so it
 * is not used there. Never an archive stem (a store page is a public surface).
 */
export function ownCopyNeeds(base: ForgeLayout['base'], baseName?: string): string[] {
  const named = (role: string): string => (baseName ? `${baseName}, the game map ${role},` : `The game map ${role},`);
  if (base.kind === 'map') return [named('this layout is built on')];
  if (base.library === OWN_FLOOR_LIBRARY) return [];
  if (base.kind === 'blank') return [named('whose props the floor uses')];
  return ['The game map whose props, characters and kits the base map uses,'];
}

/** What the export writes from: the layout as Save sees it, and the pack's identity and the store's facts. */
export interface ForgeExportInput {
  /** The layout as Save sees it (the page's `layoutToSave()`), its rules draft riding on it when it has one. */
  readonly layout: ForgeLayout;
  /** The pack's id (`validatePack`'s rule) and SemVer version; the store's name is derived from the id. */
  readonly id: string;
  readonly version: string;
  /** The pack's display name; by default the layout's name. */
  readonly name?: string;
  /** Inside the pack's identity; at most 250 characters for the store (its own bound). */
  readonly description?: string;
  /** An SPDX licence id (contract 0.2); required when `forStore` (H442 e). */
  readonly license?: string;
  /** The authors' display names (contract 0.2); no contact data. */
  readonly authors?: readonly string[];
  /** The creator's own store team (H442 m). Required when `forStore`, unless `project`. */
  readonly team?: string;
  /** The project's own pack: its team is `THUNDERSTORE_TEAM` (FX.R2). Never assumed. */
  readonly project?: boolean;
  /** Each dependency's store team by pack id, as the caller can prove it; one missing is `store.DEPENDENCY_TEAM_UNKNOWN`. */
  readonly teams?: Readonly<Record<string, string>>;
  /** For the store: a licence and a team are required (H442 e, m). A local pack needs neither. */
  readonly forStore?: boolean;
  /** The base map's display name for the README (never its stem: a store page is a public surface). */
  readonly baseName?: string;
  /** The layout member's slug; by default the layout name's (`layoutSlug`). */
  readonly slug?: string;
  /** The installed rules packs whose modes the layout may play (the page's `installedRules`). */
  readonly installed?: readonly InstalledRulesPack[];
  /** The store's `website_url`: empty, or an http(s) address. */
  readonly websiteUrl?: string;
  readonly sha256?: Sha256;
}
/** One file of the export, at its path in the zip. */
export interface ForgeExportFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}
export type ForgeExportResult =
  | {
      readonly ok: true;
      /** The zip's members, in its order: `s2u-pack.json`, the pack's members, then the store's three files. */
      readonly files: readonly ForgeExportFile[];
      /** The zip (stored entries, `writeZip`). */
      readonly zip: Uint8Array;
      /** The download's name in the store's form, `<Team>-<Name>-<version>.zip`; `<Name>-<version>.zip` with no team. */
      readonly name: string;
      /** The pack's reference: its id, version and digest (`packDigest`). */
      readonly ref: PackRef;
      readonly diagnostics: readonly Diagnostic[];
    }
  /** Refused: no file (`files` empty), no zip, no name; the diagnostics say why, each by its code. */
  | { readonly ok: false; readonly files: readonly ForgeExportFile[]; readonly zip?: undefined; readonly name: ''; readonly ref?: undefined; readonly diagnostics: readonly Diagnostic[] };

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const refused = (diagnostics: readonly Diagnostic[]): ForgeExportResult => ({ ok: false, files: [], name: '', diagnostics: [...diagnostics] });

/**
 * The Forge's pack export: the layout as Save sees it written as one zip that is a v2 map pack and a store package. The
 * order: the store's preconditions (a licence and a team for the store, the project's team only for the project), the
 * checks Save runs, the rules draft sealed (`sealForgeRules`), the record (`recordOfLayout`), the pack (`buildMapPack`,
 * with the licence and authors), the store's manifest (`thunderstoreManifest`, every dependency under its own team), the
 * icon and the README; then the allow-list, and the whole list through `validatePack` and `checkThunderstorePackage`.
 * Each refusal is a named diagnostic and returns no file; a refusal of the contract's comes with its own code.
 */
export async function exportForgePack(input: ForgeExportInput): Promise<ForgeExportResult> {
  const pre: Diagnostic[] = [];
  const team = input.project ? THUNDERSTORE_TEAM : input.team;
  if (input.project && input.team !== undefined && input.team !== THUNDERSTORE_TEAM) {
    pre.push(error(FORGE_EXPORT_CODES.teamConflict, `The project's own packs go under ${THUNDERSTORE_TEAM}.`, { field: 'team', expected: THUNDERSTORE_TEAM, actual: input.team }));
  }
  if (input.forStore && !input.license) {
    pre.push(error(FORGE_EXPORT_CODES.licenceMissing, 'A package for the store names its licence (an SPDX id such as CC-BY-4.0 or MIT).', { field: 'license' }));
  }
  if (input.forStore && !team) {
    pre.push(error(FORGE_EXPORT_CODES.teamMissing, 'A package for the store names your Thunderstore team.', { field: 'team', hint: 'The team you upload under on thunderstore.io.' }));
  }
  const installed = input.installed ?? [];
  const why = checkForgeRecord(input.layout, installed) ?? refusalWords(checkForgeRules(input.layout, installed));
  if (why) pre.push(error(FORGE_EXPORT_CODES.notSaveable, 'The layout cannot be saved, so it cannot be exported.', { field: 'layout', actual: why.slice(0, 400) }));
  if (pre.length) return refused(pre);

  // The pack: the draft sealed (its reference the digest of its own pack), the record as Save writes it, then the fold.
  let sealed: ForgeLayout;
  try { sealed = await sealForgeRules(input.layout); } catch (e) {
    return refused([error(FORGE_EXPORT_CODES.notSaveable, 'The layout\'s rules do not build.', { field: 'rules', actual: e instanceof Error ? e.message.slice(0, 400) : String(e) })]);
  }
  const record: CreatorLayoutRecord = recordOfLayout(sealed, sealed.name?.trim() || 'Layout');
  const built = await buildMapPack({
    id: input.id, version: input.version, name: input.name ?? record.name, layout: record,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(sealed.rules ? { rules: sealed.rules.spec, rulesPack: sealed.rules.pack } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    modes: rulesModeCatalogue(installed).modes,
    ...(input.sha256 ? { sha256: input.sha256 } : {}),
  });
  if (!built.ok) return refused(built.diagnostics);

  // The licence and authors (contract 0.2 fields; the map pack's range is ^0.2.0 already): added to the pack's manifest.
  let manifestText = built.files[0]!.text;
  if (input.license !== undefined || input.authors !== undefined) {
    const raw = JSON.parse(manifestText) as Record<string, unknown>;
    if (input.license !== undefined) raw['license'] = input.license;
    if (input.authors !== undefined) raw['authors'] = [...input.authors];
    manifestText = canonicalJson(raw);
  }
  const packFiles: ForgeExportFile[] = [
    { path: PACK_MANIFEST_FILE, bytes: utf8(manifestText) },
    ...built.files.slice(1).map((f) => ({ path: f.path, bytes: utf8(f.text) })),
  ];
  const layoutPath = packFiles.find((f) => f.path.startsWith(MAP_PACK_LAYOUT_DIR))!.path;
  const packed = JSON.parse(built.files.find((f) => f.path === layoutPath)!.text) as CreatorLayoutRecord;
  const held = (packed.requires ?? []).map((ref) => ({ ref }));
  const context = {
    target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, packs: held, handlers: behaviourCatalogue(),
    ...(input.sha256 ? { sha256: input.sha256 } : {}),
  };
  const pack = await validatePack(packFiles, context);
  if (!pack.ok) return refused([error(FORGE_EXPORT_CODES.packageInvalid, 'The map pack does not validate.', { actual: pack.report.status }), ...pack.report.diagnostics]);

  // The store's files. The team is only checked here (the store's manifest holds none; the uploader's account gives it):
  // a local pack with no team is checked under the project's name and named without a team.
  const store = thunderstoreManifest(pack.manifest, {
    team: team ?? THUNDERSTORE_TEAM, packs: held,
    ...(input.teams ? { teams: input.teams } : {}),
    ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}),
  });
  if (!store.ok) return refused(store.report.diagnostics);
  const mapName = input.baseName ? `${record.name}, on ${input.baseName}` : record.name;
  const readme = thunderstoreReadme({ manifest: pack.manifest, maps: [{ name: mapName, path: layoutPath }], ownCopy: ownCopyNeeds(sealed.base, input.baseName),
    ...(input.license !== undefined ? { license: input.license } : {}), ...(input.authors !== undefined ? { authors: input.authors } : {}) });
  const files: ForgeExportFile[] = [
    ...packFiles,
    { path: 'manifest.json', bytes: utf8(`${JSON.stringify(store.manifest, null, 2)}\n`) },
    { path: 'icon.png', bytes: planIconPng(sealed) },
    { path: 'README.md', bytes: utf8(readme) },
  ];

  // The whole list: the allow-list, then both checks over every file (the store's files ride outside the pack's identity).
  const members = checkExportMembers(files.map((f) => f.path));
  if (members.length) return refused(members);
  const whole = await validatePack(files as readonly BufferedPackFile[], context);
  if (!whole.ok || whole.ref.hash !== pack.ref.hash) {
    return refused([error(FORGE_EXPORT_CODES.packageInvalid, 'The package does not validate as a pack.', { actual: whole.ok ? 'another reference' : whole.report.status }), ...(whole.ok ? [] : whole.report.diagnostics)]);
  }
  const shop = checkThunderstorePackage(files as readonly BufferedPackFile[], { pack: whole.manifest });
  if (shop.status !== 'pass') return refused([error(FORGE_EXPORT_CODES.packageInvalid, 'The package does not keep the store\'s rules.', { actual: shop.status }), ...shop.diagnostics]);

  const zip = writeZip(files.map((f) => ({ name: f.path, data: f.bytes })));
  const storeName = thunderstoreName(input.id)!;
  const name = `${team ? `${team}-` : ''}${storeName}-${input.version}.zip`;
  return { ok: true, files, zip, name, ref: { id: whole.ref.id, version: whole.ref.version, hash: whole.ref.hash },
    diagnostics: [...pack.report.diagnostics, ...store.report.diagnostics] };
}
