/**
 * The modding wiki's generated reference (B205 MW-2, MW.R5; product track, OT.R53: a project site's pages, nothing the
 * game does). Writes the three reference pages -- the manifest, the bounds, the refusal codes -- and their data under
 * `shared/modding-wiki/content/docs/reference/`, from the pack contract's code
 * (`packages/creator-contracts/src/packs.ts`) and one hand-written description a key (`reference/descriptions.json`).
 * `tools/test/moddingWikiReference.test.ts` fails when a key in the code has no description, a description names no
 * key, or a committed file differs from what this writes now.
 *
 *   npx tsx tools/moddingWikiReference.ts            (from socomlegacy/) write the files
 *   npx tsx tools/moddingWikiReference.ts --check    exit 1 naming each missing, extra or stale entry
 *
 * It reads the code and the wiki's committed files only, never the wiki's own node_modules.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as packs from '../packages/creator-contracts/src/packs';
import { writeFresh } from './freshFiles';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REFERENCE_DIR = join(REPO, 'shared', 'modding-wiki', 'content', 'docs', 'reference');
export const DESCRIPTIONS_FILE = join(REFERENCE_DIR, 'descriptions.json');
/** The data file the pages are rendered from, for the wiki's other pages to read (MW-7, MW-8). */
export const DATA_FILE = 'reference.json';

/** MW.R6's five statuses, in its order. */
export const STATUSES = ['Works', 'Test room only', 'Forge, local only', 'Format only', 'Planned'] as const;
export type Status = (typeof STATUSES)[number];

/** A description section: the keys the code has, one hand-written line each. */
export type Descriptions = Record<string, Record<string, string>>;

/** The values the manifest page publishes, by their exported names (the build's own values). */
export const PUBLISHED_VALUES = [
  'PACK_FORMAT', 'PACK_FORMAT_VERSION', 'PACK_MANIFEST_FILE', 'ENGINE_CONTRACT_VERSION', 'PACK_TARGET_US',
  'RULES_PACK_CONTRACT_FLOOR', 'THUNDERSTORE_TEAM_PLACEHOLDER',
] as const;

const exported = packs as unknown as Record<string, unknown>;

/** Every `*_ADAPTATION` bound `packs.ts` exports with a number, by name. */
function bounds(): [string, number][] {
  return Object.keys(exported)
    .filter((name) => name.endsWith('_ADAPTATION') && typeof exported[name] === 'number')
    .sort()
    .map((name) => [name, exported[name] as number]);
}

/** The store rules' keys (`THUNDERSTORE_PACKAGE_RULES`), its `source` line apart. */
function storeRuleKeys(): string[] {
  return Object.keys(packs.THUNDERSTORE_PACKAGE_RULES).filter((k) => k !== 'source');
}

/** Every key the code has, by description section. */
export function codeKeys(): Record<string, string[]> {
  return {
    manifest: [...packs.PACK_MANIFEST_KEYS],
    fileRow: [...packs.PACK_FILE_ROW_KEYS],
    handlerClaim: [...packs.PACK_HANDLER_CLAIM_KEYS],
    kinds: [...packs.PACK_KINDS],
    legacyKinds: [...packs.LEGACY_PACK_KINDS],
    sides: [...packs.PACK_SIDES],
    roles: [...packs.PACK_ROLES],
    intents: [...packs.PACK_INTENT_KINDS],
    values: [...PUBLISHED_VALUES],
    targetAliases: Object.keys(packs.PACK_TARGET_ALIASES),
    bounds: bounds().map(([name]) => name),
    storeRules: storeRuleKeys(),
    packCodes: Object.values(packs.PACK_CODES),
    storeCodes: Object.values(packs.THUNDERSTORE_CODES),
  };
}

/** The keys with no description (`section.key`), and the descriptions with no key. */
export function descriptionGaps(code: Record<string, string[]>, described: Descriptions): { missing: string[]; extra: string[] } {
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [section, keys] of Object.entries(code)) {
    const have = described[section] ?? {};
    for (const key of keys) if (typeof have[key] !== 'string' || !have[key]!.trim()) missing.push(`${section}.${key}`);
    for (const key of Object.keys(have)) if (!keys.includes(key)) extra.push(`${section}.${key}`);
  }
  for (const section of Object.keys(described)) if (!(section in code)) extra.push(section);
  return { missing, extra };
}

export function readDescriptions(file: string = DESCRIPTIONS_FILE): Descriptions {
  return JSON.parse(readFileSync(file, 'utf8')) as Descriptions;
}

/** What owns a reference page's status (MW.R6): repository paths the public export ships, a line or range after `:`. */
const SPEC = 'socomlegacy/docs/specs/2026-10-25-pack-framework.md';
const REGISTRY_REFUSES_APPLY = 'socomlegacy/packages/viewer/src/packs/registry.ts:527-535';
const PACKS = 'socomlegacy/packages/creator-contracts/src/packs.ts';
const THUNDERSTORE_NOTE = 'socomlegacy/docs/research/370-the-thunderstore-package-format.md';

/**
 * The reference pages, in the sidebar's order (`reference/meta.json`), each with its MW.R6 status and what owns it
 * (`source`, written into the page's frontmatter for the badge; `tools/test/moddingWikiStatus.test.ts` holds it).
 */
export const PAGES: readonly { slug: string; title: string; summary: string; status: Status; source: readonly string[]; statusText: string }[] = [
  {
    slug: 'manifest',
    title: 'Manifest reference',
    summary: 'Every field of the pack manifest, generated from the pack contract.',
    status: 'Format only',
    source: [SPEC, REGISTRY_REFUSES_APPLY, PACKS],
    statusText:
      'A v2 pack is checked against these fields and stored on your device; nothing in the game applies one yet ' +
      '(the pack-framework spec, "Import": the registry refuses `apply`). Each kind has its own status on [Pack kinds](/kinds/).',
  },
  {
    slug: 'bounds',
    title: 'Bounds',
    summary: "The pack contract's limits and their values, generated from the code.",
    status: 'Format only',
    source: [SPEC, REGISTRY_REFUSES_APPLY, PACKS, THUNDERSTORE_NOTE],
    statusText:
      'The checker holds a pack to these bounds before it is stored; nothing in the game applies a v2 pack yet ' +
      '(the pack-framework spec, "Import"). Thunderstore\'s rules are the format only: no tool writes the store zip ' +
      'and nothing installs from the store (research 370; the store team is the owner\'s question H342).',
  },
  {
    slug: 'codes',
    title: 'Refusal codes',
    summary: 'Every code the pack checker can refuse with, generated from the code.',
    status: 'Format only',
    source: [SPEC, REGISTRY_REFUSES_APPLY, PACKS],
    statusText:
      'These are the findings of the pack check and of the Thunderstore export and checker; a pack that passes is ' +
      'stored, not applied (the pack-framework spec, "Import").',
  },
];

// ---------------------------------------------------------------------------------------------------------------------
// Rendering

/** A description as MDX table text: refused when it holds a newline or MDX's `{ } < >` outside a code span. */
function cell(text: string, at: string): string {
  if (/\r|\n/.test(text)) throw new Error(`${at}: a description is one line`);
  const outside = text.split(/(`[^`]*`)/).filter((_, i) => i % 2 === 0).join('');
  if (/[{}<>]/.test(outside)) throw new Error(`${at}: put { } < > inside a code span`);
  return text.replace(/\|/g, '\\|');
}
const code = (v: string): string => '`' + v.replace(/\|/g, '\\|') + '`';

/**
 * A description's values written as tokens, so a number or name the code holds is never copied by hand: `%NAME%` is the
 * exported constant `NAME` of `packs.ts` (a string or number), `%NAME.a.b%` a value inside an exported object.
 */
export function expandTokens(text: string, at: string): string {
  return text.replace(/%([A-Z][A-Z0-9_]*(?:\.[A-Za-z0-9_]+)*)%/g, (_, path: string) => {
    let v: unknown = exported;
    for (const part of path.split('.')) v = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[part] : undefined;
    if (typeof v !== 'string' && typeof v !== 'number') throw new Error(`${at}: %${path}% names no exported string or number in packs.ts`);
    return String(v);
  });
}

/** Every description with its tokens expanded. */
export function expandDescriptions(d: Descriptions): Descriptions {
  return Object.fromEntries(
    Object.entries(d).map(([section, entries]) => [
      section,
      Object.fromEntries(Object.entries(entries).map(([key, text]) => [key, expandTokens(text, `${section}.${key}`)])),
    ]),
  );
}

/** A byte count as itself and, when it is a whole number of them, KiB or MiB. */
function bytesText(n: number): string {
  if (n >= 1 << 20 && n % (1 << 20) === 0) return `${n} (${n / (1 << 20)} MiB)`;
  if (n >= 1 << 10 && n % (1 << 10) === 0) return `${n} (${n / (1 << 10)} KiB)`;
  return String(n);
}

/** The file extensions a role's payload pattern accepts (`\.(a|b)$` or `\.a$`, case-insensitive), or null for any. */
export function roleExtensions(pattern: RegExp | null): string[] | null {
  if (pattern === null) return null;
  const m = /^\\\.(?:\(([a-z0-9]+(?:\|[a-z0-9]+)*)\)|([a-z0-9]+))\$$/.exec(pattern.source);
  if (!m || pattern.flags !== 'i') throw new Error(`a role's payload pattern this generator cannot read: /${pattern.source}/${pattern.flags}`);
  return (m[1] ?? m[2]!).split('|').map((x) => `.${x}`);
}

function storeRuleValue(key: string): string {
  const rule = (packs.THUNDERSTORE_PACKAGE_RULES as unknown as Record<string, unknown>)[key];
  if (Array.isArray(rule)) return rule.map((x) => code(String(x))).join(', ');
  if (rule && typeof rule === 'object') {
    return Object.entries(rule as Record<string, unknown>).map(([k, v]) => `${k} ${code(String(v))}`).join(', ');
  }
  throw new Error(`THUNDERSTORE_PACKAGE_RULES.${key}: a rule this generator cannot render`);
}

function publishedValue(name: string): string {
  const v = exported[name];
  if (typeof v !== 'string' && typeof v !== 'number') throw new Error(`${name} is not an exported string or number`);
  return String(v);
}

/** The data the pages are rendered from: every section's keys in the code's order, with their values and text. */
export function referenceData(d: Descriptions): Record<string, unknown> {
  const text = (section: string, key: string): string => {
    const t = d[section]?.[key];
    if (typeof t !== 'string' || !t.trim()) throw new Error(`descriptions.json has no ${section}.${key}`);
    return t;
  };
  const keys = codeKeys();
  const plain = (section: string) => keys[section]!.map((key) => ({ key, description: text(section, key) }));
  return {
    generatedBy: 'socomlegacy/tools/moddingWikiReference.ts',
    source: 'socomlegacy/packages/creator-contracts/src/packs.ts',
    manifest: plain('manifest'),
    fileRow: plain('fileRow'),
    handlerClaim: plain('handlerClaim'),
    kinds: plain('kinds'),
    legacyKinds: plain('legacyKinds'),
    sides: plain('sides'),
    roles: keys.roles!.map((key) => ({
      key,
      payloadTypes: roleExtensions(packs.PACK_ROLE_TYPES[key as packs.PackFileRole]),
      changesPlay: packs.PACK_GAMEPLAY_ROLES.has(key as packs.PackFileRole),
      description: text('roles', key),
    })),
    intents: plain('intents'),
    values: keys.values!.map((key) => ({ key, value: publishedValue(key), description: text('values', key) })),
    targetAliases: keys.targetAliases!.map((key) => ({ key, value: packs.PACK_TARGET_ALIASES[key], description: text('targetAliases', key) })),
    bounds: bounds().map(([key, value]) => ({ key, value, description: text('bounds', key) })),
    storeRulesSource: packs.THUNDERSTORE_PACKAGE_RULES.source,
    storeRules: keys.storeRules!.map((key) => ({
      key,
      value: (packs.THUNDERSTORE_PACKAGE_RULES as unknown as Record<string, unknown>)[key],
      description: text('storeRules', key),
    })),
    packCodes: keys.packCodes!.map((key) => ({ key, description: text('packCodes', key) })),
    storeCodes: keys.storeCodes!.map((key) => ({ key, description: text('storeCodes', key) })),
  };
}

const HEAD = (page: (typeof PAGES)[number]): string =>
  [
    '---',
    `title: ${JSON.stringify(page.title)}`,
    `description: ${JSON.stringify(page.summary)}`,
    `status: ${JSON.stringify(page.status)}`,
    `source: ${JSON.stringify(page.source)}`,
    '---',
    '',
    '{/* Generated by socomlegacy/tools/moddingWikiReference.ts from packages/creator-contracts/src/packs.ts and',
    '    reference/descriptions.json. Do not edit: change a description, then run `npx tsx tools/moddingWikiReference.ts`',
    '    from socomlegacy/. tools/test/moddingWikiReference.test.ts fails when this file is stale. */}',
    '',
    `**Status: ${page.status}.** ${page.statusText}`,
    '',
  ].join('\n');

function table(head: string[], rows: string[][]): string {
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

function page(slug: string): (typeof PAGES)[number] {
  return PAGES.find((p) => p.slug === slug)!;
}

function manifestPage(d: Descriptions): string {
  const keys = codeKeys();
  const rows = (section: string, first: (k: string) => string = (k) => code(k)) =>
    keys[section]!.map((k) => [first(k), cell(d[section]![k]!, `${section}.${k}`)]);
  return [
    HEAD(page('manifest')),
    `A v2 pack is a zip whose root holds the manifest ${code(packs.PACK_MANIFEST_FILE)}: a JSON object with the fields`,
    'below and no others (an unknown field is refused with `pack.FIELD_UNKNOWN`). Every list on this page is read from the',
    'pack contract\'s code, so it is the checker\'s own list.',
    '',
    '## Manifest fields',
    '',
    table(['field', 'what it is'], rows('manifest')),
    '',
    '## A `files` row',
    '',
    table(['field', 'what it is'], rows('fileRow')),
    '',
    '## A `handlers` claim',
    '',
    table(['field', 'what it is'], rows('handlerClaim')),
    '',
    '## Kinds',
    '',
    table(['kind', 'what it is'], rows('kinds')),
    '',
    '### The earlier formats',
    '',
    'An earlier loader\'s pack has no `s2u-pack.json`; the contract reads it through an adapter as a v2 `content` pack.',
    '',
    table(['legacy kind', 'what it is'], rows('legacyKinds')),
    '',
    '## Sides',
    '',
    table(['side', 'what it is'], rows('sides')),
    '',
    '## Roles and payload types',
    '',
    'A `files` row\'s `role` names what the member is; its path must end in one of the role\'s file types (case does not',
    'matter), or the row is refused with `pack.ROLE_MISMATCH`. A role that changes play cannot be covered by a `cosmetic`',
    'intent alone.',
    '',
    table(
      ['role', 'file types', 'changes play', 'what it is'],
      keys.roles!.map((k) => {
        const ext = roleExtensions(packs.PACK_ROLE_TYPES[k as packs.PackFileRole]);
        return [
          code(k),
          ext === null ? 'any' : ext.map(code).join(', '),
          packs.PACK_GAMEPLAY_ROLES.has(k as packs.PackFileRole) ? 'yes' : 'no',
          cell(d['roles']![k]!, `roles.${k}`),
        ];
      }),
    ),
    '',
    '## Intents',
    '',
    table(['intent', 'what it is'], rows('intents')),
    '',
    '## Published values',
    '',
    table(
      ['name', 'value', 'what it is'],
      keys.values!.map((k) => [code(k), code(publishedValue(k)), cell(d['values']![k]!, `values.${k}`)]),
    ),
    '',
    '### Target aliases',
    '',
    table(
      ['earlier spelling', 'canonical target', 'what it is'],
      keys.targetAliases!.map((k) => [code(k), code(packs.PACK_TARGET_ALIASES[k]!), cell(d['targetAliases']![k]!, `targetAliases.${k}`)]),
    ),
    '',
  ].join('\n');
}

function boundsPage(d: Descriptions): string {
  return [
    HEAD(page('bounds')),
    'Each bound is a named constant in the pack contract (`*_ADAPTATION`: chosen for this project, not taken from the',
    'game). A pack over one is refused with the code its description names.',
    '',
    '## The pack\'s bounds',
    '',
    table(
      ['constant', 'value', 'what it bounds'],
      bounds().map(([k, v]) => [code(k), /BYTES/.test(k) ? bytesText(v) : String(v), cell(d['bounds']![k]!, `bounds.${k}`)]),
    ),
    '',
    '## Thunderstore\'s package rules',
    '',
    `Held as data in ${code('THUNDERSTORE_PACKAGE_RULES')}; its source: ${cell(packs.THUNDERSTORE_PACKAGE_RULES.source, 'storeRules.source')}.`,
    'Nothing is fetched from Thunderstore.',
    '',
    table(
      ['rule', 'value', 'what it is'],
      storeRuleKeys().map((k) => [code(k), storeRuleValue(k), cell(d['storeRules']![k]!, `storeRules.${k}`)]),
    ),
    '',
  ].join('\n');
}

function codesPage(d: Descriptions): string {
  const keys = codeKeys();
  return [
    HEAD(page('codes')),
    'Every finding names its code, and where it helps a repair the field or file it is about, what was expected, what',
    'was found and a hint. An error refuses the pack; a note does not, but a skipped check leaves the report incomplete,',
    'never a pass.',
    '',
    '## The pack check (`pack.`)',
    '',
    table(['code', 'when'], keys.packCodes!.map((k) => [code(k), cell(d['packCodes']![k]!, `packCodes.${k}`)])),
    '',
    '## The Thunderstore export and checker (`store.`)',
    '',
    table(['code', 'when'], keys.storeCodes!.map((k) => [code(k), cell(d['storeCodes']![k]!, `storeCodes.${k}`)])),
    '',
  ].join('\n');
}

/** Every generated file, by its name in `reference/`, as it should be committed now. */
export function referenceFiles(d: Descriptions): Record<string, string> {
  const gaps = descriptionGaps(codeKeys(), d);
  if (gaps.missing.length || gaps.extra.length) {
    throw new Error(`descriptions.json: missing ${gaps.missing.join(', ') || 'none'}; extra ${gaps.extra.join(', ') || 'none'}`);
  }
  const e = expandDescriptions(d);
  return {
    [DATA_FILE]: `${JSON.stringify(referenceData(e), null, 2)}\n`,
    'manifest.mdx': manifestPage(e),
    'bounds.mdx': boundsPage(e),
    'codes.mdx': codesPage(e),
  };
}

function main(argv: string[]): number {
  const d = readDescriptions();
  const gaps = descriptionGaps(codeKeys(), d);
  for (const k of gaps.missing) console.error(`missing description: ${k}`);
  for (const k of gaps.extra) console.error(`description with no key in the code: ${k}`);
  if (gaps.missing.length || gaps.extra.length) return 1;
  const files = referenceFiles(d);
  if (argv.includes('--check')) {
    const stale = Object.entries(files).filter(([rel, text]) => {
      const p = join(REFERENCE_DIR, rel);
      return !existsSync(p) || readFileSync(p, 'utf8').replace(/\r\n/g, '\n') !== text;
    });
    for (const [rel] of stale) console.error(`stale: reference/${rel}`);
    return stale.length ? 1 : 0;
  }
  for (const [rel, text] of Object.entries(files)) console.log(`${writeFresh(join(REFERENCE_DIR, rel), text)} reference/${rel}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exit(main(process.argv.slice(2)));
