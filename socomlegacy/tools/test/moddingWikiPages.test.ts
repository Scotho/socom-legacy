import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as handlers from '../../packages/creator-contracts/src/handlers';
import * as packs from '../../packages/creator-contracts/src/packs';
import * as rules from '../../packages/creator-contracts/src/rules';

/**
 * The modding wiki's hand-written pages that restate the pack contract never drift from it (B205 MW-7, MW-8; product
 * track, OT.R53: a project site's text, nothing the game does). The generated reference pages are MW-2's
 * (`moddingWikiReference.test.ts`); these pages are prose, so this test holds what they restate:
 *
 * - Troubleshooting has one repair row for every refusal code the code has (`PACK_CODES`, `THUNDERSTORE_CODES`) and none
 *   for a code it does not have, and every hint it quotes is the checker's own text;
 * - Publishing -> Thunderstore names the store's root files and manifest keys from `THUNDERSTORE_PACKAGE_RULES`, its
 *   limits at the code's values, the team placeholder, our pack bound, and says plainly what is not built;
 * - a table row on these pages that names an exported constant of `packs.ts` or `rules.ts` gives its value as the code
 *   holds it (the rules budgets, the format versions);
 * - every `pack.` and `store.` code these pages name exists, and every link to another wiki page finds its file;
 * - the prose pages that restate a value -- Pack anatomy, Pack kinds, Making your first pack (the MW-12 review's N4) --
 *   give each bound, version, list and table at the exported constant's value (`PROSE`, `PROSE_VERSIONS`), and the
 *   import's file types as the viewer's `localFiles.ts` holds them, at the line it cites;
 * - every page holds HD texture packs at one status, Works, now that Home > Experiments > Mods applies them on every
 *   page and the HD picture is gone (B206 ML-11; it held Planned while `VIDEO_PICTURE_HD_OFFERED` was false, the
 *   review's B1); no page keeps the old loaders' words; Testing a pack locally describes the MODS screen in its own
 *   words (the file input, the temporary button, the download's count, the decoded size, where each kind applies, the
 *   overlay, the refusals); every `registry.ts` range a page cites holds the v2 refusal; and Testing a pack locally
 *   names both agent places a v2 pack is imported (N3).
 *
 * It reads the code and the wiki's committed files only (never the wiki's own node_modules), so it runs in the gate's
 * tools suite with no Next.js installed.
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CONTENT = join(REPO, 'shared', 'modding-wiki', 'content', 'docs');
const PACKS_SOURCE = join(REPO, 'socomlegacy', 'packages', 'creator-contracts', 'src', 'packs.ts');

const read = (p: string): string => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const page = (rel: string): string => read(join(CONTENT, rel));

const PAGES = ['publishing/thunderstore.mdx', 'rules-and-limits.mdx', 'troubleshooting.mdx', 'changelog.mdx', 'contributing.mdx'];

const ALL_CODES = new Set<string>([...Object.values(packs.PACK_CODES), ...Object.values(packs.THUNDERSTORE_CODES)]);
const exported = { ...(rules as unknown as Record<string, unknown>), ...(packs as unknown as Record<string, unknown>) };

/** The first cell of each table row that is one code span naming a refusal code, with the row's other cells. */
function codeRows(text: string): { code: string; rest: string }[] {
  const out: { code: string; rest: string }[] = [];
  for (const line of text.split('\n')) {
    const m = /^\|\s*`((?:pack|store)\.[A-Z_]+)`\s*\|(.*)\|\s*$/.exec(line);
    if (m) out.push({ code: m[1]!, rest: m[2]!.trim() });
  }
  return out;
}

/** Every page of the wiki, as a path under `content/docs/`. */
function allPages(dir = CONTENT): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...allPages(p));
    else if (/\.mdx?$/.test(name)) out.push(relative(CONTENT, p).split(sep).join('/'));
  }
  return out.sort();
}

/** The rows of the Markdown table whose header row is `header`, as their trimmed cells (the separator row skipped). */
function table(text: string, header: string): string[][] {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.trim() === header);
  expect(at, header).toBeGreaterThanOrEqual(0);
  const rows: string[][] = [];
  for (const line of lines.slice(at + 2)) {
    if (!line.startsWith('|')) break;
    rows.push(line.slice(1, -1).split('|').map((c) => c.trim()));
  }
  return rows;
}

/** The code spans of a cell or a sentence, in order. */
const spans = (text: string): string[] => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);

/** Prose with fenced code blocks and the frontmatter blanked, so a JSON example is not read as a sentence. */
const prose = (text: string): string => text.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^```[\s\S]*?^```$/gm, '');

/** One sentence as the page writes it, with every value it restates taken from the code (the MW-12 review's N4). */
const FACTOR = rules.RULE_ACTION_SPECS['hit.scale'].params['factor']!;
const PROSE: Record<string, string[]> = {
  'anatomy.mdx': [
    `always \`${packs.PACK_FORMAT}\` and \`${packs.PACK_FORMAT_VERSION}\``,
    `exactly the build's disc revision, \`${packs.PACK_TARGET_US}\` (the contract's \`PACK_TARGET_US\`)`,
    `\`${packs.ENGINE_CONTRACT_VERSION}\` today (the contract's\n  \`ENGINE_CONTRACT_VERSION\`)`,
    `must not admit any version before \`${packs.RULES_PACK_CONTRACT_FLOOR}\``,
    `\`sides\` is ${packs.PACK_SIDES.slice(0, -1).map((s) => `\`${s}\``).join(', ')} or \`${packs.PACK_SIDES.at(-1)}\``,
    `at most ${packs.PACK_PATH_CHARS_ADAPTATION} characters and ${packs.PACK_PATH_DEPTH_ADAPTATION} folders deep`,
    `at most ${packs.PACK_DEPENDENCIES_ADAPTATION} entries`,
    `of at most ${packs.PACK_HANDLERS_ADAPTATION} \`{slot, handler, actions?, options?}\` entries`,
    `(${packs.PACK_HANDLER_OPTIONS_BYTES_ADAPTATION} bytes of JSON, nested at most ${packs.PACK_HANDLER_OPTIONS_DEPTH_ADAPTATION} deep)`,
    `whose role can change play -- ${[...packs.PACK_GAMEPLAY_ROLES].slice(0, -1).map((r) => `\`${r}\``).join(', ')} or \`${[...packs.PACK_GAMEPLAY_ROLES].at(-1)}\` -- cannot be covered by \`cosmetic\` alone`,
  ],
  'kinds/index.mdx': [
    // FX-5 added the reserved `plugin`, a fourth kind: the sentence counts no kinds any more.
    `one or more of ${packs.PACK_KINDS.slice(0, -1).map((k) => `\`${k}\``).join(', ')} and \`${packs.PACK_KINDS.at(-1)}\``,
    `must not admit any engine contract before \`${packs.RULES_PACK_CONTRACT_FLOOR}\``,
    `Write \`^${packs.RULES_PACK_CONTRACT_FLOOR}\` or \`>=${packs.RULES_PACK_CONTRACT_FLOOR}\``,
    `The page offers one slot, \`${handlers.HANDLER_SLOTS[0]!.id}\``,
  ],
  'guides/first-pack.mdx': [
    `version ${rules.RULES_VOCABULARY_VERSION} of the rules vocabulary`,
    `anything from ${FACTOR.min} (no damage at all) to ${FACTOR.max}`,
    `exactly ${packs.THUNDERSTORE_PACKAGE_RULES.icon.width} by ${packs.THUNDERSTORE_PACKAGE_RULES.icon.height} pixels`,
    `always \`${packs.PACK_FORMAT}\` and \`${packs.PACK_FORMAT_VERSION}\``,
    `(\`${packs.PACK_TARGET_US}\`, the US release of SOCOM II)`,
    `must ask for \`^${packs.RULES_PACK_CONTRACT_FLOOR}\` or later`,
  ],
};
/** Engine-contract versions a page may name: the code's, and on a page that warns against it, the one before the floor. */
const PROSE_VERSIONS: Record<string, string[]> = {
  'anatomy.mdx': [packs.ENGINE_CONTRACT_VERSION, packs.RULES_PACK_CONTRACT_FLOOR],
  'kinds/index.mdx': [packs.ENGINE_CONTRACT_VERSION, packs.RULES_PACK_CONTRACT_FLOOR, '0.1.0'],
  'guides/first-pack.mdx': [packs.ENGINE_CONTRACT_VERSION, packs.RULES_PACK_CONTRACT_FLOOR],
};
/** A restated number another test holds: the example member's size, `moddingWikiExample.test.ts`. */
const HELD_ELSEWHERE: Record<string, RegExp[]> = { 'guides/first-pack.mdx': [/a size of \d+ bytes/g] };

describe('the modding wiki\'s hand-written pages (MW-7, MW-8)', () => {
  it('has the five pages, each past its stub', () => {
    for (const rel of PAGES) {
      const text = page(rel);
      expect(text, rel).not.toMatch(/This page is not written yet/);
    }
  });

  it('gives every refusal code one repair row on Troubleshooting, and none a code the code lacks', () => {
    const rows = codeRows(page('troubleshooting.mdx'));
    const seen = rows.map((r) => r.code);
    const missing = [...ALL_CODES].filter((c) => !seen.includes(c));
    const extra = seen.filter((c) => !ALL_CODES.has(c));
    const doubled = seen.filter((c, i) => seen.indexOf(c) !== i);
    expect({ missing, extra, doubled }).toEqual({ missing: [], extra: [], doubled: [] });
    for (const r of rows) expect(r.rest.replace(/\|/g, '').trim().length, r.code).toBeGreaterThan(20);
  });

  it('quotes only the checker\'s own hints on Troubleshooting', () => {
    const source = read(PACKS_SOURCE);
    const quoted = [...page('troubleshooting.mdx').matchAll(/The checker's hint: "([^"]+)"/g)].map((m) => m[1]!);
    expect(quoted.length).toBeGreaterThan(0);
    for (const q of quoted) expect(source.includes(`"${q}"`), q).toBe(true);
  });

  it('states the store\'s rules on Publishing -> Thunderstore at the code\'s values, and what is not built', () => {
    const text = page('publishing/thunderstore.mdx');
    const store = packs.THUNDERSTORE_PACKAGE_RULES;
    for (const f of [...store.required, ...store.optional, ...store.manifestKeys]) expect(text, f).toContain(`\`${f}\``);
    expect(text).toContain(`${store.name.maxChars} characters`);
    expect(text).toContain(`${store.description.maxChars} characters`);
    expect(text).toContain(`${store.icon.width}x${store.icon.height}`);
    expect(text).toContain(`\`${packs.THUNDERSTORE_TEAM}\``);
    expect(text).toContain(`${packs.PACK_BYTES_ADAPTATION / (1024 * 1024)} MiB`);
    expect(text).toContain(`${packs.PACK_DESCRIPTION_CHARS_ADAPTATION} characters`);
    for (const fn of ['thunderstoreName', 'thunderstoreVersion', 'thunderstoreManifest', 'checkThunderstorePackage']) {
      expect(typeof exported[fn], fn).toBe('function');
      expect(text, fn).toContain(`\`${fn}\``);
    }
    expect(text).toMatch(/not yet created/);
    expect(text).toMatch(/nothing builds a store package/i);
    expect(text).toMatch(/loads nothing from Thunderstore/);
    for (const code of Object.values(packs.THUNDERSTORE_CODES)) expect(text, code).toContain(`\`${code}\``);
  });

  it('gives an exported constant\'s value as the code holds it, in every table row that names one', () => {
    let rows = 0;
    for (const rel of PAGES) {
      for (const line of page(rel).split('\n')) {
        const m = /^\|\s*`([A-Z][A-Z0-9_]+)`\s*\|\s*`?([^|`]+?)`?\s*\|/.exec(line);
        if (!m || !(m[1]! in exported)) continue;
        const value = exported[m[1]!];
        if (typeof value !== 'string' && typeof value !== 'number') continue;
        rows += 1;
        expect(m[2], `${rel}: ${m[1]}`).toBe(String(value));
      }
    }
    expect(rows).toBeGreaterThanOrEqual(15);
  });

  it('names the current format versions on the Changelog', () => {
    const text = page('changelog.mdx');
    expect(text).toContain(`| \`ENGINE_CONTRACT_VERSION\` | \`${packs.ENGINE_CONTRACT_VERSION}\` |`);
    expect(text).toContain(`| \`RULES_VOCABULARY_VERSION\` | \`${rules.RULES_VOCABULARY_VERSION}\` |`);
    expect(text).toContain(`| \`PACK_FORMAT_VERSION\` | \`${packs.PACK_FORMAT_VERSION}\` |`);
    expect(text).toContain(`| \`RULES_PACK_CONTRACT_FLOOR\` | \`${packs.RULES_PACK_CONTRACT_FLOOR}\` |`);
  });

  it('names only codes the code has, and links only to pages that exist', () => {
    for (const rel of PAGES) {
      const text = page(rel);
      for (const m of text.matchAll(/`((?:pack|store)\.[A-Z][A-Z_]*)`/g)) expect(ALL_CODES.has(m[1]!), `${rel}: ${m[1]}`).toBe(true);
      for (const m of text.matchAll(/\]\((\/[^)#\s]*)(?:#[^)]*)?\)/g)) {
        const url = m[1]!.replace(/^\/|\/$/g, '');
        const hit = url === '' ? ['index.mdx'] : [`${url}.mdx`, `${url}/index.mdx`];
        expect(hit.some((h) => existsSync(join(CONTENT, h))), `${rel}: ${m[1]}`).toBe(true);
      }
    }
  });

  it('tells a contributor where the wiki lives, the status rule, the drift tests and the check', () => {
    const text = page('contributing.mdx');
    for (const s of ['shared/modding-wiki', 'npm run check', 'moddingWikiStatus.test.ts', 'moddingWikiReference.test.ts', 'moddingWikiPages.test.ts', 'moddingWikiExample.test.ts', 'descriptions.json']) {
      expect(text, s).toContain(s);
    }
    for (const t of ['tools/test/moddingWikiStatus.test.ts', 'tools/test/moddingWikiReference.test.ts', 'tools/test/moddingWikiPages.test.ts', 'tools/test/moddingWikiExample.test.ts']) {
      expect(existsSync(join(REPO, 'socomlegacy', t)), t).toBe(true);
    }
  });
});

describe('the modding wiki\'s prose pages restate the code\'s values (the MW-12 review\'s N4)', () => {
  it('gives every restated bound, version and list at the exported constant\'s value', () => {
    for (const [rel, phrases] of Object.entries(PROSE)) {
      const text = flat(page(rel));
      for (const p of phrases) expect(text, `${rel}: ${p}`).toContain(flat(p));
    }
  });

  it('restates no bound outside those sentences, and names only the code\'s engine-contract versions', () => {
    for (const [rel, phrases] of Object.entries(PROSE)) {
      const text = flat(prose(page(rel)));
      const covered: [number, number][] = [];
      for (const p of phrases) for (let i = text.indexOf(flat(p)); i >= 0; i = text.indexOf(flat(p), i + 1)) covered.push([i, i + flat(p).length]);
      for (const rx of HELD_ELSEWHERE[rel] ?? []) for (const m of text.matchAll(rx)) covered.push([m.index!, m.index! + m[0].length]);
      const bounds = /\b(?:at most|exactly|up to) \d+\b|\b\d+ (?:bytes|characters|folders|entries|deep|pixels|MiB|KiB)\b/g;
      const loose = [...text.matchAll(bounds)].filter((m) => !covered.some(([a, b]) => m.index! >= a && m.index! < b)).map((m) => m[0]);
      expect(loose, `${rel}: a restated bound PROSE does not hold`).toEqual([]);
      const versions = [...page(rel).matchAll(/(?<![\w.])0\.\d+\.\d+(?![\w.])/g)].map((m) => m[0]);
      expect(versions.length, rel).toBeGreaterThan(0);
      for (const v of versions) expect(PROSE_VERSIONS[rel], `${rel}: ${v}`).toContain(v);
    }
  });

  it('lists every role\'s file types on Pack anatomy as the validator\'s PACK_ROLE_TYPES', () => {
    const want = (role: string): string[] => {
      const rx = packs.PACK_ROLE_TYPES[role as keyof typeof packs.PACK_ROLE_TYPES];
      // `\.(glb|gltf)$` or `\.json$`: the alternatives after the dot
      return rx === null ? ['any'] : rx.source.replace(/^\\\./, '').replace(/\$$/, '').replace(/^\(|\)$/g, '').split('|').map((e) => `.${e}`);
    };
    const seen: string[] = [];
    for (const [roles, types] of table(page('anatomy.mdx'), '| role | file types |')) {
      for (const role of spans(roles!)) {
        seen.push(role);
        expect(spans(types!).length ? spans(types!) : [types!], role).toEqual(want(role));
      }
    }
    expect(seen.sort()).toEqual([...packs.PACK_ROLES].sort());
  });

  it('names the intents on Pack anatomy and the kinds on Pack kinds as the code has them', () => {
    expect(table(page('anatomy.mdx'), '| intent | meaning |').map(([k]) => spans(k!)[0])).toEqual([...packs.PACK_INTENT_KINDS]);
    expect(table(page('kinds/index.mdx'), '| kind | what it holds | status |').map(([k]) => spans(k!)[0])).toEqual([...packs.PACK_KINDS]);
  });

  it('gives the behaviour slots on Pack kinds with their one-pack-at-a-time rule, and the one visual slot', () => {
    const rows = table(page('kinds/index.mdx'), '| slot | what it is | one pack at a time |');
    expect(rows.map(([s]) => spans(s!)[0])).toEqual(handlers.BEHAVIOUR_SLOTS.map((s) => s.id));
    for (const [s, , one] of rows) expect(one, s).toBe(handlers.BEHAVIOUR_SLOTS.find((x) => x.id === spans(s!)[0])!.exclusive ? 'yes' : 'no');
    expect(handlers.HANDLER_SLOTS.map((s) => s.id)).toEqual([handlers.HANDLER_SLOTS[0]!.id]);
  });

  it('lists the import\'s file types on Pack anatomy as the viewer\'s localFiles.ts holds them, at the line it cites', () => {
    const lines = read(join(REPO, 'socomlegacy', 'packages', 'viewer', 'src', 'agent', 'localFiles.ts')).split('\n');
    const at = lines.findIndex((l) => /^const DATA_EXTENSION = /.test(l));
    expect(at).toBeGreaterThanOrEqual(0);
    const alts = /\\\.\(([^)]+)\)/.exec(lines[at]!)![1]!.split('|').map((e) => `.${e}`);
    const text = flat(page('anatomy.mdx'));
    const listed = spans(/reads only these file types for a v2 pack: (.*?), and a few of the game's own archive types/.exec(text)![1]!);
    expect(listed).toEqual(alts.slice(0, listed.length));
    expect(text).toContain(`\`localFiles.ts\`, line ${at + 1})`);
    expect(text).toContain(`socomlegacy/packages/viewer/src/agent/localFiles.ts:${at + 1}"`);
  });
});

describe('the modding wiki holds HD texture packs at one status, the MODS loader as the code has it, and both v2 import places (B206 ML-11; the MW-12 review\'s B1, N3)', () => {
  const VIEWER = join(REPO, 'socomlegacy', 'packages', 'viewer', 'src');
  const mods = read(join(VIEWER, 'console', 'adapters', 'mods.ts'));
  /** A string constant's value as `console/adapters/mods.ts` declares it. */
  const modsConst = (name: string): string => {
    const m = new RegExp(`^export const ${name} = '([^']+)';$`, 'm').exec(mods);
    expect(m, name).not.toBeNull();
    return m![1]!;
  };

  it('says Works wherever a page gives HD texture packs a status, now that Home > Experiments > Mods applies them on every page', () => {
    // the code: no HD picture any more (ML-6), and the MODS screen says an HD pack applies on every page, every map (ML-3)
    expect(read(join(REPO, 'socomlegacy', 'packages', 'ui', 'src', 'screens', 'videoPicture.ts'))).not.toMatch(/^export const VIDEO_PICTURE_HD_OFFERED/m);
    expect(mods).toContain("if (p.kind === 'hd') return 'Every page, every map';");
    const wrong: string[] = [];
    for (const rel of allPages()) {
      const text = page(rel);
      for (const stale of ['lifts the hold', 'VIDEO_PICTURE_HD_OFFERED', 'experimentalGraphics.ts:437', 'videoPicture.ts:27-32', 'Enable mods', 'Add a mod (.zip)']) {
        if (text.includes(stale)) wrong.push(`${rel}: "${stale}"`);
      }
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        const where = `${rel}:${i + 1}`;
        if (line.startsWith('|') && /\bHD texture packs?\b/.test(line)) {
          // an HD row's status is its last cell; a comparison table's `status` row gives it in the cell that names HD
          const cells = line.slice(1, -1).split('|').map((c) => c.trim());
          if (/\bHD texture packs?\b/.test(cells[0]!)) {
            if (!/Works/.test(cells.at(-1)!) || /Planned|held|Test room only|Format only/.test(cells.at(-1)!)) wrong.push(where);
          } else if (/^status$/i.test(cells[0]!)) {
            for (const c of cells.filter((x) => /\bHD texture packs?\b/.test(x))) if (!/HD texture packs?: Works\b/.test(c)) wrong.push(where);
          }
        }
        if (/^#+ .*\bHD texture packs?\b/.test(line)) {
          const next = lines.findIndex((l, j) => j > i && /^#+ /.test(l));
          const status = lines.slice(i + 1, next < 0 ? undefined : next).find((l) => /^\**Status:?\**/.test(l.trim()));
          if (status && (!/Works/.test(status) || /Planned|held/.test(status))) wrong.push(`${where} (its Status line)`);
        }
        if (/^\*Today:/.test(line) && lines.slice(Math.max(0, i - 4), i).some((l) => /^#+ .*\bHD texture packs?\b/.test(l))) {
          if (!/\bworks\b/i.test(line) || /planned|\bheld\b/i.test(line)) wrong.push(`${where} (its Today line)`);
        }
      });
    }
    expect(wrong).toEqual([]);
  });

  it('describes Home > Experiments > Mods in the screen\'s own words, on Testing a pack locally', () => {
    const raw = page('guides/test-locally.mdx');
    const text = flat(raw);
    expect(text).toContain('Home > Experiments > Mods');
    expect(text).toContain(`\`#${modsConst('MODS_FILE_INPUT_ID')}\``);
    // the temporary button (ML-12, ML.R16): its label, its words, its refusal, and the constant that names its removal
    for (const name of ['TEST_HD_PACK_LABEL', 'TEST_HD_PACK_ABOUT', 'TEST_HD_PACK_NOT_SERVED']) expect(text, name).toContain(modsConst(name));
    expect(mods).toMatch(/^export const TEST_HD_PACK_BUTTON_ADAPTATION = /m);
    expect(text).toContain('`TEST_HD_PACK_BUTTON_ADAPTATION`');
    expect(mods).toMatch(/^export const HD_PACK_STORE_PAGE_PLACEHOLDER: string \| null = null;$/m);
    expect(text).toContain('`HD_PACK_STORE_PAGE_PLACEHOLDER` is empty');
    // the download counts files (ML-9's F3), the list gives an HD pack's size decoded
    expect(mods).toContain('`Downloading the test HD pack… ${p.files} of ${p.ofFiles} files, ');
    expect(text).toContain('"Downloading the test HD pack… *n* of *N* files, *x* MB downloaded"');
    expect(mods).toContain("p.kind === 'hd' ? ' decoded' : ''");
    expect(text).toContain('"… MB decoded"');
    // where each kind applies, as the screen says it (ML.R5)
    for (const w of ['Every page, every map', 'The test room']) {
      expect(mods + read(join(VIEWER, 'console', 'render', 'mods.ts')), w).toContain(`'${w}'`);
      expect(text, w).toContain(`"${w}"`);
    }
    // the overlay's words (ML-4) and the pacing's constants (ML-9), as the code names them
    expect(read(join(VIEWER, 'packApplyOverlay.ts'))).toContain('`Applying pack... ${p.applied}/${p.total}`');
    expect(text).toContain('"Applying pack... *n*/*N*"');
    const hd = read(join(VIEWER, 'hdTexturePack.ts'));
    for (const c of ['MODS_APPLY_FRAME_BUDGET_MS_ADAPTATION', 'HD_DRAW_TEXELS_PER_SLICE_ADAPTATION']) {
      expect(hd, c).toMatch(new RegExp(`^export const ${c}=`, 'm'));
      expect(text, c).toContain(`\`${c}\``);
    }
    expect(read(join(VIEWER, 'packApplyOverlay.ts'))).toMatch(/^export const PACK_APPLY_OVERLAY_ADAPTATION =/m);
    // every refusal the page quotes is the classifier's or the registry's own text, up to its ellipsis
    const said = read(join(VIEWER, 'packs', 'classify.ts')) + read(join(VIEWER, 'packs', 'registry.ts'));
    const refusals = table(raw, '| refusal | what to do |').map(([r]) => /^"(.*?)(?: …)?"$/.exec(r!)?.[1] ?? r!);
    expect(refusals.length).toBeGreaterThanOrEqual(6);
    for (const r of refusals) expect(said.includes(r.replace(/'/g, "\\'")) || said.includes(r), r).toBe(true);
  });

  it('cites the registry\'s v2 refusal at the lines that hold it, on every page', () => {
    const lines = read(join(VIEWER, 'packs', 'registry.ts')).split('\n');
    for (const rel of allPages()) {
      for (const m of page(rel).matchAll(/registry\.ts:(\d+)-(\d+)/g)) {
        const held = lines.slice(Number(m[1]) - 1, Number(m[2])).join('\n');
        expect(held, `${rel}: ${m[0]}`).toContain('A v2 pack is stored, not applied: no live driver applies one.');
      }
    }
  });

  it('names both places a v2 pack is imported on Testing a pack locally: the test room\'s agent dock and the Forge\'s', () => {
    const text = flat(page('guides/test-locally.mdx'));
    const row = page('guides/test-locally.mdx').split('\n').find((l) => l.startsWith('| any v2 pack'));
    expect(row).toBeDefined();
    expect(row).toMatch(/test room/);
    expect(row).toMatch(/Forge/);
    const section = flat(/## A v2 pack's import[\s\S]*?(?=\n## )/.exec(page('guides/test-locally.mdx'))![0]);
    expect(section).toMatch(/\*\*Connect your agent\*\*/);
    expect(section).toMatch(/test room/);
    expect(section).toMatch(/Forge/);
    expect(section).toContain('`packs.import`');
    for (const f of ['testroomInstall.ts', 'testroomTarget.ts', 'forgePacks.ts']) {
      expect(existsSync(join(REPO, 'socomlegacy', 'packages', 'viewer', 'src', 'agent', f)), f).toBe(true);
    }
    expect(text).toContain('Build');
  });
});

function flat(s: string): string {
  return s.replace(/\s+/g, ' ');
}
