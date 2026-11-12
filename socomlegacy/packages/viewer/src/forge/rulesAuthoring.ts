import {
  behaviourCatalogue, checkCreatorRecord, checkPackRef, checkReport, diagnostic, ENGINE_CONTRACT_VERSIONS, forgeModeChoices, layoutEntityIds, layoutOfRecord,
  PACK_FORMAT, PACK_FORMAT_VERSION, PACK_MANIFEST_FILE, PACK_TARGET_US, parseLayout, readCreatorRecord, recordOfLayout, rulesCatalogue,
  rulesModeCatalogue, sha256Hex, validatePack, validateRules,
  type AnyLayoutRecord, type CheckReport, type CreatorLayoutRecord, type Diagnostic, type ForgeModeChoice, type InstalledRulesPack, type Layout, type PackManifest,
  type PackRef, type RulesModeEntry, type RulesSpec, type SpawnerSource,
} from '@s2u/creator-contracts';

/**
 * FCW-32 (steps 1-3; `docs/specs/2026-10-27-creator-rules-contract.md` §3-§4, §7, §11): the Forge's model of a layout's
 * rules -- a browser adaptation with no original, the Forge's own authoring instrument. It decides no outcome: the room
 * runs the rules (FCW-31), and with no rules pack the layout plays as before.
 *
 * A layout's rules are a rules pack the Forge authors beside it (`ForgeRulesDraft`): its `RulesSpec` (configuration,
 * variables, timers, phases, items, the entities it names, its capability claims and its rules) and the pack reference
 * it is exported as (`buildRulesPack`, whose digest is the reference's hash). The layout names it as its `mode`
 * (`{id: spec.id, version: pack.version, params}`, the configuration's values) and requires its pack. The checks the
 * Forge runs before any edit is staged: the validator's (`validateRules` against the layout's own entities), FCW-30's
 * review F2 (a `brain` that is no brain, a release whose kind does not match its spawner's source), and the layout's
 * dependency on the pack its mode names.
 *
 * Where the draft is kept (an interim of this task, reported): the record v3 has no field for a rules spec and its
 * contract is not this task's (`creator-contracts`), so the draft rides beside the record -- in the layout's text (the
 * undo steps, `parseForgeLayout`), in the autosave as an authoring envelope (`forgeAuthoringText`, written only when a
 * layout has rules, so every earlier text is unchanged), and on a named save (`../saves` `NamedSave.rules`). An earlier
 * build reads an envelope as unreadable and keeps it as it was (LATER 193's set-aside), never dropping it.
 */
export const FORGE_RULES_ADAPTATION =
  "the Forge's rules authoring: a browser adaptation with no original; the room decides every outcome, and a layout without rules plays as before" as const;

/** The Forge's own refusals beside the validator's (`rules.*`): FCW-30's review F2, and the mode's pack dependency. */
export const FORGE_RULES_CODES = Object.freeze({
  /** `spawner.release`'s `brain` names a claimed capability that is not an NPC brain (a bomb authority). */
  brainKind: 'forge.rules.BRAIN_KIND',
  /** `spawner.release` gives a brain to a spawner that is not an NPC's, or an item to one that is not an item's. */
  releaseSource: 'forge.rules.RELEASE_SOURCE',
  /** The layout's mode is offered by a rules pack the layout does not require. */
  packNotRequired: 'forge.rules.PACK_NOT_REQUIRED',
} as const);

/** The behaviour slots whose capabilities are brains a spawner may release NPCs with (`handlers.ts` `BEHAVIOUR_SLOTS`). */
export const BRAIN_SLOT_IDS: readonly string[] = Object.freeze(['behaviour.npc', 'behaviour.zombie']);

/** The rules pack a layout authors: its reference (the hash is its export's digest, `sealForgeRules`) and its spec. */
export interface ForgeRulesDraft {
  pack: PackRef;
  spec: RulesSpec;
  /**
   * FCW-32 round 2 (the review's F1): an imported pack's files as they came (`importRulesPack`), kept while the draft is
   * still that pack -- its reference the pack's own digest, never the Forge's re-serialisation -- and let go at the first
   * edit of its rules, which seals a pack of the Forge's own (`sealForgeRules`). `rules.export` gives them back as they are.
   */
  files?: RulesPackFile[];
}
/** A layout with the rules the Forge authors for it. */
export type ForgeLayout = Layout & { rules?: ForgeRulesDraft };

/** A draft's hash before its first export (`sealForgeRules` writes the real one before any edit is staged). */
export const UNSEALED_HASH = '0'.repeat(64);
/** The rules member's path in an exported pack. */
export const RULES_MEMBER_PATH = 'rules/mode.json';
/**
 * The engine contract range an exported rules pack states (the rules spec §7: a rules pack states `^0.1.1`). It stays
 * `^0.1.1` at contract 0.2.0 (FX-5: a writer writes the lowest range its content needs, and a rules pack uses no 0.2
 * field); the build reads it through 0.1.2 in `ENGINE_CONTRACT_VERSIONS`.
 */
export const RULES_PACK_CONTRACT = '^0.1.1';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const sameRef = (a: PackRef, b: PackRef): boolean => a.id === b.id && a.version === b.version && a.hash === b.hash;

/** A draft read from a file, a save or an undo step: `{pack, spec}`, the pack a reference, the spec an object (checked later). */
export function readRulesDraft(v: unknown): ForgeRulesDraft {
  if (!isObj(v)) throw new Error('the layout\'s rules are not {pack, spec}');
  const extra = Object.keys(v).find((k) => k !== 'pack' && k !== 'spec' && k !== 'files');
  if (extra) throw new Error(`the layout's rules name no field ${extra.slice(0, 40)}`);
  const why = checkPackRef(v['pack']);
  if (why) throw new Error(`the layout's rules: ${why}`);
  if (!isObj(v['spec'])) throw new Error('the layout\'s rules spec is not an object');
  const pack = v['pack'] as PackRef;
  const files = v['files'];
  if (files !== undefined && (!Array.isArray(files) || files.length < 1 || files.length > RULES_PACK_FILES_MAX
    || !files.every((f) => isObj(f) && Object.keys(f).length === 2 && typeof f['path'] === 'string' && typeof f['text'] === 'string'))) {
    throw new Error(`the layout's rules: their pack's files are 1-${RULES_PACK_FILES_MAX} of {path, text}`);
  }
  return { pack: { id: pack.id, version: pack.version, hash: pack.hash }, spec: json(v['spec']) as unknown as RulesSpec,
    ...(files ? { files: (files as RulesPackFile[]).map((f) => ({ path: f.path, text: f.text })) } : {}) };
}

/** The most files a kept rules pack holds (`rules.import`'s schema: `s2u-pack.json`, its rules member, the store's). */
export const RULES_PACK_FILES_MAX = 8;

/**
 * FCW-32 round 2 (the review's F4; FUI.R19): why a layout cannot be shared as a link, or null. A share code carries the
 * record alone (`./share`), whose check knows the retail types only, so a layout playing a rules mode -- its own draft's
 * or an installed pack's -- travels as a file (the download keeps its rules beside the record).
 */
export function shareRefusal(l: ForgeLayout): string | null {
  return l.rules || l.mode ? 'A layout with rules travels as a file: download it from Saves (a share link carries no rules)' : null;
}

/** True when `text` is the Forge's authoring envelope (a layout with rules, `forgeAuthoringText`). */
export function isAuthoringEnvelope(text: string): boolean {
  try { const raw = JSON.parse(text) as unknown; return isObj(raw) && raw['schema'] === FORGE_AUTHORING_SCHEMA; } catch { return false; }
}

/** A layout's text (`./layout` `serializeLayout`) read whole: the layout (`parseLayout`) and its rules. */
export function parseForgeLayout(text: string): ForgeLayout {
  const l: ForgeLayout = parseLayout(text);
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (raw['rules'] !== undefined) l.rules = readRulesDraft(raw['rules']);
  return l;
}

/** The modes a layout's rules offer (`rulesModeCatalogue`): its draft's, then the installed packs'. */
export function draftModes(draft: ForgeRulesDraft | undefined, installed: readonly InstalledRulesPack[] = []): RulesModeEntry[] {
  return [...rulesModeCatalogue([...(draft ? [{ ref: draft.pack, spec: draft.spec }] : []), ...installed]).modes];
}
export const forgeLayoutModes = (l: ForgeLayout, installed: readonly InstalledRulesPack[] = []): RulesModeEntry[] => draftModes(l.rules, installed);

/** The Forge's mode list (spec §7): the retail types, then the modes the layout's rules and the installed packs offer. */
export const forgeModeList = (l: ForgeLayout, installed: readonly InstalledRulesPack[] = []): ForgeModeChoice[] =>
  forgeModeChoices(forgeLayoutModes(l, installed));

/** The record's check with the layout's modes wired in (`checkCreatorRecord`'s `modes`): null, or why not. */
export function checkForgeRecord(l: ForgeLayout, installed: readonly InstalledRulesPack[] = []): string | null {
  return checkCreatorRecord(recordOfLayout(l, l.name?.trim() || 'Layout'), { modes: forgeLayoutModes(l, installed) });
}

/** Each spawner's source, by id (`layoutEntityIds` carries the ids only). */
export function spawnerSources(l: Pick<Layout, 'spawners'>): Map<string, SpawnerSource> {
  return new Map((l.spawners ?? []).map((s) => [s.id, s.source]));
}

/** F2: each `spawner.release` whose brain is no brain or whose kind does not match its spawner's source. */
function releaseFindings(l: Layout, spec: RulesSpec): Diagnostic[] {
  const out: Diagnostic[] = [];
  const sources = spawnerSources(l);
  const err = (code: string, text: string, field: string, actual: string, expected: string): void => {
    out.push(diagnostic({ source: 'check', severity: 'error', code, text, field, actual, expected }));
  };
  spec.rules.forEach((rule, i) => {
    for (const branch of ['then', 'else'] as const) {
      (rule[branch] ?? []).forEach((a, j) => {
        if (a.do !== 'spawner.release') return;
        const at = `rules[${i}].${branch}[${j}]`;
        const spawner = String(a['spawner']);
        const source = sources.get(spawner);
        const brain = typeof a['brain'] === 'string' ? a['brain'] : undefined;
        const item = typeof a['item'] === 'string' ? a['item'] : undefined;
        if (brain !== undefined) {
          const slot = (spec.capabilities ?? []).find((c) => c.handler === brain)?.slot ?? '';
          if (!BRAIN_SLOT_IDS.includes(slot)) err(FORGE_RULES_CODES.brainKind, `${brain} is not an NPC brain: a spawner releases NPCs with a brain on ${BRAIN_SLOT_IDS.join(' or ')}.`, `${at}.brain`, brain, BRAIN_SLOT_IDS.join(', '));
          else if (source !== 'npc') err(FORGE_RULES_CODES.releaseSource, `${spawner} is a ${source} spawner: only an NPC spawner releases with a brain.`, `${at}.brain`, String(source), 'npc');
        }
        if (item !== undefined && source !== 'item') err(FORGE_RULES_CODES.releaseSource, `${spawner} is a ${source} spawner: only an item spawner releases an item.`, `${at}.item`, String(source), 'item');
      });
    }
  });
  return out;
}

/**
 * The layout's rules checked as the Forge refuses them before an edit: the validator against the layout's own entities
 * (`rulesCatalogue({layout: layoutEntityIds(l)})`), F2's release checks, and the mode's pack among the layout's
 * dependencies. `pass` for a layout with no rules and no mode.
 */
export function checkForgeRules(l: ForgeLayout, installed: readonly InstalledRulesPack[] = []): CheckReport {
  const out: Diagnostic[] = [];
  if (l.rules) {
    const report = validateRules(l.rules.spec, rulesCatalogue({ layout: layoutEntityIds(l) }));
    out.push(...report.diagnostics);
    if (report.status === 'pass') out.push(...releaseFindings(l, l.rules.spec));
  }
  if (l.mode) {
    const entry = forgeLayoutModes(l, installed).find((m) => m.id === l.mode!.id && m.version === l.mode!.version);
    if (entry && !(l.requires ?? []).some((r) => sameRef(r, entry.pack))) {
      out.push(diagnostic({ source: 'check', severity: 'error', code: FORGE_RULES_CODES.packNotRequired, field: 'requires',
        text: `The mode ${entry.id}@${entry.version} comes from ${entry.pack.id}@${entry.pack.version}, which the layout does not require.`,
        actual: (l.requires ?? []).map((r) => `${r.id}@${r.version}`).join(', ') || 'none', expected: `${entry.pack.id}@${entry.pack.version}` }));
    }
  }
  return checkReport(out, { evidence: 'validation' });
}

/** A report's errors as one refusal's words, each naming its code and field: `rules.ACTION_UNKNOWN at rules[2].then[0].do: ...`. */
export function refusalWords(report: CheckReport, max = 8): string | null {
  const errors = report.diagnostics.filter((d) => d.severity === 'error');
  if (!errors.length) return null;
  const words = errors.slice(0, max).map((d) => `${d.code}${d.field ? ` at ${d.field}` : ''}: ${d.text}`);
  if (errors.length > max) words.push(`and ${errors.length - max} more`);
  return words.join('; ');
}

// ---------------------------------------------------------------------------------------------------------------------
// The pack: export and import
// ---------------------------------------------------------------------------------------------------------------------

/** One exported member: its path in the pack and its text. */
export interface RulesPackFile { path: string; text: string }
export interface BuiltRulesPack { ref: PackRef; manifest: PackManifest; files: RulesPackFile[]; report: CheckReport }
export class RulesPackError extends Error {
  constructor(readonly report: CheckReport, words: string) { super(words); this.name = 'RulesPackError'; }
}

/**
 * The pack check the Forge's import, export and seal share. Handler claims are checked against the behaviour catalogue
 * the room publishes (`behaviourCatalogue`: patrol, sentry, the bomb authority and the extraction authority). A
 * reserved capability is absent from that catalogue, so a claim on it is refused by name.
 */
function rulesPackContext() {
  return { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, handlers: behaviourCatalogue() };
}

/**
 * A spec as a v2 rules pack (spec §7): `s2u-pack.json` and one `rules`-role member under a `new-behaviour` intent, its
 * claims the spec's capabilities, `contract` `^0.1.1`, for this disc; checked by the pack framework's own validator
 * (`validatePack` with `rulesPackContext`), and its reference the validator's (`packDigest`).
 */
export async function buildRulesPack(pack: Pick<PackRef, 'id' | 'version'>, spec: RulesSpec): Promise<BuiltRulesPack> {
  const member = JSON.stringify(spec);
  const bytes = utf8(member);
  const client = spec.rules.some((r) => r.side === 'client');
  const manifest = {
    format: PACK_FORMAT, formatVersion: PACK_FORMAT_VERSION, id: pack.id, version: pack.version, name: spec.name,
    ...(spec.description ? { description: spec.description } : {}),
    target: PACK_TARGET_US, contract: RULES_PACK_CONTRACT, kinds: ['rules'], sides: client ? 'both' : 'server', dependencies: [],
    files: [{ path: RULES_MEMBER_PATH, sha256: await sha256Hex(bytes), size: bytes.length, role: 'rules' }],
    intents: [{ kind: 'new-behaviour', files: [RULES_MEMBER_PATH] }],
    ...(spec.capabilities?.length ? { handlers: json(spec.capabilities) } : {}),
  };
  const files: RulesPackFile[] = [{ path: PACK_MANIFEST_FILE, text: JSON.stringify(manifest, null, 1) }, { path: RULES_MEMBER_PATH, text: member }];
  const checked = await validatePack(files.map((f) => ({ path: f.path, bytes: utf8(f.text) })), rulesPackContext());
  if (!checked.ok) throw new RulesPackError(checked.report, refusalWords(checked.report) ?? 'The pack does not validate.');
  return { ref: { id: checked.ref.id, version: checked.ref.version, hash: checked.ref.hash }, manifest: checked.manifest, files, report: checked.report };
}

/**
 * A rules pack's files read back as a draft: the pack validated (`validatePack`), of kind `rules`, with exactly one
 * `rules` member whose spec validates (`validateRules`, without a layout: the layout's check is the adoption's).
 */
export async function importRulesPack(files: readonly RulesPackFile[]): Promise<ForgeRulesDraft> {
  const checked = await validatePack(files.map((f) => ({ path: f.path, bytes: utf8(f.text) })), rulesPackContext());
  if (!checked.ok) throw new RulesPackError(checked.report, refusalWords(checked.report) ?? 'The pack does not validate.');
  const members = checked.manifest.files.filter((m) => m.role === 'rules');
  const one = (code: string, text: string): RulesPackError => {
    const report = checkReport([diagnostic({ source: 'pack', severity: 'error', code, text, field: 'files' })], { evidence: 'validation' });
    return new RulesPackError(report, `${code} at files: ${text}`);
  };
  if (!checked.manifest.kinds.includes('rules')) throw one('forge.rules.PACK_KIND', 'The pack is not of kind rules.');
  if (members.length !== 1) throw one('forge.rules.PACK_MEMBERS', `A rules pack the Forge opens holds one rules member; this one holds ${members.length}.`);
  let spec: unknown;
  try { spec = JSON.parse(files.find((f) => f.path === members[0]!.path)!.text); } catch { throw one('rules.SCHEMA', 'The rules member is not JSON.'); }
  const report = validateRules(spec);
  if (report.status !== 'pass') throw new RulesPackError(report, refusalWords(report) ?? 'The rules do not validate.');
  // F1 (round 2): adopted as it is -- its own reference, its files kept for its export until the first edit of its rules
  return { pack: { id: checked.ref.id, version: checked.ref.version, hash: checked.ref.hash }, spec: spec as RulesSpec,
    files: files.map((f) => ({ path: f.path, text: f.text })) };
}

/**
 * The draft's pack for export: an imported pack's own files (checked again: their digest must still be the draft's
 * reference), else the pack built from the spec (`buildRulesPack`).
 */
export async function exportRulesPack(draft: ForgeRulesDraft): Promise<{ ref: PackRef; files: RulesPackFile[] }> {
  if (!draft.files) { const built = await buildRulesPack(draft.pack, draft.spec); return { ref: built.ref, files: built.files }; }
  const checked = await validatePack(draft.files.map((f) => ({ path: f.path, bytes: utf8(f.text) })), rulesPackContext());
  if (!checked.ok) throw new RulesPackError(checked.report, refusalWords(checked.report) ?? 'The kept pack does not validate.');
  if (!sameRef(checked.ref, draft.pack)) {
    const report = checkReport([diagnostic({ source: 'pack', severity: 'error', code: 'forge.rules.PACK_CHANGED', field: 'files',
      text: 'The kept pack\'s files no longer give its reference.', actual: checked.ref.hash, expected: draft.pack.hash })], { evidence: 'validation' });
    throw new RulesPackError(report, refusalWords(report) ?? 'The kept pack changed.');
  }
  return { ref: { ...draft.pack }, files: draft.files.map((f) => ({ ...f })) };
}

/** Whether a kept imported pack still is the draft: its manifest's id and version the reference's, its one rules member the spec. */
function keptPackIsDraft(draft: ForgeRulesDraft): boolean {
  if (!draft.files || draft.pack.hash === UNSEALED_HASH) return false;
  try {
    const manifest = JSON.parse(draft.files.find((f) => f.path === PACK_MANIFEST_FILE)?.text ?? 'null') as
      { id?: unknown; version?: unknown; files?: { path?: unknown; role?: unknown }[] } | null;
    if (!manifest || manifest.id !== draft.pack.id || manifest.version !== draft.pack.version) return false;
    const members = (manifest.files ?? []).filter((m) => m.role === 'rules');
    if (members.length !== 1) return false;
    const member = draft.files.find((f) => f.path === members[0]!.path);
    return !!member && JSON.stringify(JSON.parse(member.text)) === JSON.stringify(draft.spec);
  } catch { return false; }
}

/**
 * The layout with its draft sealed: the pack built (`buildRulesPack`), the draft's reference its digest, and the
 * layout's requirement on the draft's pack the same reference. A layout without rules is returned as it is. F1 (round 2):
 * an imported pack still unedited (its kept files still the draft, `keptPackIsDraft`) keeps its own reference; the first
 * edit of its rules seals the Forge's own pack and lets the kept files go.
 */
export async function sealForgeRules(l: ForgeLayout): Promise<ForgeLayout> {
  if (!l.rules) return l;
  if (keptPackIsDraft(l.rules)) {
    // The round-2 re-look's F2: the kept files must give the reference they keep (an envelope through forge.import or a
    // hand-edited download may carry any 64-hex hash); else they go and the Forge's own pack is sealed below.
    const checked = await validatePack(l.rules.files!.map((f) => ({ path: f.path, bytes: utf8(f.text) })), rulesPackContext());
    if (checked.ok && sameRef(checked.ref, l.rules.pack)) return l;
  }
  const old = l.rules.pack;
  const { ref } = await buildRulesPack(old, l.rules.spec);
  const requires = l.requires ?? [];
  const at = requires.findIndex((r) => r.id === old.id && r.version === old.version);
  const next = at < 0 ? [...requires, ref] : requires.map((r, i) => (i === at ? ref : r));
  return { ...l, requires: next, rules: { pack: ref, spec: l.rules.spec } };
}

// ---------------------------------------------------------------------------------------------------------------------
// The authoring envelope: the autosave's text of a layout with rules
// ---------------------------------------------------------------------------------------------------------------------

export const FORGE_AUTHORING_SCHEMA = 'forge-authoring' as const;
export const FORGE_AUTHORING_VERSION = 1 as const;
export interface ForgeAuthoringEnvelope {
  schema: typeof FORGE_AUTHORING_SCHEMA;
  version: typeof FORGE_AUTHORING_VERSION;
  record: CreatorLayoutRecord;
  rules: ForgeRulesDraft;
}

/**
 * The text the Forge keeps for `l`: the record (v3) as before when the layout has no rules, else the envelope of the
 * record and its rules; or why it is not written (the record's check with the layout's modes, then the rules' check).
 */
export function forgeAuthoringText(l: ForgeLayout, name: string): { text: string } | { why: string } {
  const record = recordOfLayout(l, name);
  const why = checkCreatorRecord(record, { modes: forgeLayoutModes(l) }) ?? refusalWords(checkForgeRules(l));
  if (why) return { why };
  if (!l.rules) return { text: JSON.stringify(record) };
  const envelope: ForgeAuthoringEnvelope = { schema: FORGE_AUTHORING_SCHEMA, version: FORGE_AUTHORING_VERSION, record, rules: l.rules };
  return { text: JSON.stringify(envelope) };
}

/**
 * A kept text read back: an envelope as its record (checked with its rules' modes) and its rules (checked against the
 * record's layout), or any other text as `readCreatorRecord` reads it (a v1 file, a v2 or a v3 record). Throws with the
 * reason otherwise.
 */
export function readForgeAuthoring(text: string, name: string): { record: CreatorLayoutRecord; rules?: ForgeRulesDraft } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('not a forge layout: the file is not JSON'); }
  if (!isObj(raw) || raw['schema'] !== FORGE_AUTHORING_SCHEMA) return { record: readCreatorRecord(text, { name }).record };
  const extra = Object.keys(raw).find((k) => !['schema', 'version', 'record', 'rules'].includes(k));
  if (extra) throw new Error(`not a forge layout: the authoring text names no field ${extra.slice(0, 40)}`);
  if (raw['version'] !== FORGE_AUTHORING_VERSION) throw new Error(`not a forge layout: an authoring text of version ${FORGE_AUTHORING_VERSION} only`);
  const rules = readRulesDraft(raw['rules']);
  const record = readCreatorRecord(JSON.stringify(raw['record']), { name, modes: draftModes(rules) }).record;
  const why = refusalWords(checkForgeRules({ ...layoutOfRecord(record), rules }));
  if (why) throw new Error(`not a forge layout: ${why}`);
  return { record, rules };
}

/** A kept record and its rules as the layout the page opens. */
export function layoutOfAuthoring(read: { record: AnyLayoutRecord; rules?: ForgeRulesDraft }): ForgeLayout {
  const l: ForgeLayout = layoutOfRecord(read.record);
  if (read.rules) l.rules = json(read.rules);
  return l;
}
