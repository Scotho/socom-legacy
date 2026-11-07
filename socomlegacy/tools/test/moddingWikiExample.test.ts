import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  behaviourCatalogue, checkThunderstorePackage, ENGINE_CONTRACT_VERSION, layoutEntityIds, PACK_CODES, PACK_TARGET_US,
  rulesCatalogue, sha256Hex, THUNDERSTORE_CODES, THUNDERSTORE_PACKAGE_RULES, thunderstoreManifest, validatePack,
  validateRules, type BufferedPackFile, type PackManifest,
} from '../../packages/creator-contracts/src/index';

/**
 * The modding wiki's worked example never rots (B205 MW-5, MW.R5, MW.R7; product track, OT.R53: a project site's
 * example, nothing the game does). The guide `shared/modding-wiki/content/docs/guides/first-pack.mdx` walks a reader
 * through `shared/modding-wiki/examples/first-pack/pack/`, a small rules pack of made-up content (no disc data, no
 * third-party art); this test holds those files to the real validator in `packages/creator-contracts/src/packs.ts`:
 *
 * - `validatePack` passes the pack's files with every check run (the build's whole context, so nothing is skipped);
 * - each `files` row's sha256 and size are the member's, and the rules member passes `validateRules`;
 * - `checkThunderstorePackage` passes the store files (Thunderstore's root files beside `s2u-pack.json`), the icon
 *   drawn by the example's own script (`draw-icon.mjs`, run here exactly as the guide runs it; the PNG is never
 *   committed), and the store `manifest.json` is what `thunderstoreManifest` writes for the pack;
 * - the guide's code blocks that name a pack file are that file's text, its hashes and sizes are the members', and
 *   its zip commands name exactly the pack's files;
 * - and a drifted copy (a changed byte, a wrong size, a store manifest that is not the pack's) is refused.
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const EXAMPLE = join(REPO, 'shared', 'modding-wiki', 'examples', 'first-pack');
const PACK = join(EXAMPLE, 'pack');
const PAGE = join(REPO, 'shared', 'modding-wiki', 'content', 'docs', 'guides', 'first-pack.mdx');
const RULES_MEMBER = 'rules/half-damage.json';
/** The pack's files as the guide lists them (the icon is drawn, never committed). */
const PACK_FILES = ['CHANGELOG.md', 'README.md', 'icon.png', 'manifest.json', RULES_MEMBER, 's2u-pack.json'];

const text = (p: string): string => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** The icon, drawn by the example's script into a scratch folder with the command the guide shows. */
const scratch = mkdtempSync(join(tmpdir(), 'mw5-icon-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let drawn: Uint8Array | null = null;
function icon(): Uint8Array {
  if (drawn) return drawn;
  const out = join(scratch, 'icon.png');
  execFileSync(process.execPath, [join(EXAMPLE, 'draw-icon.mjs'), out], { stdio: 'pipe' });
  drawn = new Uint8Array(readFileSync(out));
  return drawn;
}

/** The committed files under `pack/` (a locally drawn `icon.png` left out: the test draws its own). */
function committed(): BufferedPackFile[] {
  return walk(PACK)
    .map((p) => relative(PACK, p).split(sep).join('/'))
    .filter((p) => p !== 'icon.png')
    .sort()
    .map((path) => ({ path, bytes: new Uint8Array(readFileSync(join(PACK, ...path.split('/')))) }));
}
const files = (): BufferedPackFile[] => [...committed(), { path: 'icon.png', bytes: icon() }];
const manifest = (): PackManifest => JSON.parse(text(join(PACK, 's2u-pack.json'))) as PackManifest;
const member = (path: string): Uint8Array => files().find((f) => f.path === path)!.bytes;
/** The build's whole context, so no check is skipped (a skipped check is never a pass). */
const context = () => ({ target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION, packs: [], archives: {}, handlers: behaviourCatalogue() });
const codes = (d: readonly { code: string }[]): string[] => d.map((x) => x.code);

describe('the modding wiki\'s first pack (MW-5): the files', () => {
  it('holds exactly the files the guide lists, and draws a 256x256 icon', () => {
    expect(files().map((f) => f.path).sort()).toEqual([...PACK_FILES].sort());
    expect(existsSync(join(EXAMPLE, 'draw-icon.mjs'))).toBe(true);
    const b = icon();
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([THUNDERSTORE_PACKAGE_RULES.icon.width, THUNDERSTORE_PACKAGE_RULES.icon.height]);
  });

  it('gives each files row the member\'s own sha256 and size', async () => {
    for (const row of manifest().files) {
      const bytes = member(row.path);
      expect({ path: row.path, sha256: row.sha256, size: row.size }).toEqual({ path: row.path, sha256: await sha256Hex(bytes), size: bytes.length });
    }
  });

  it('passes validatePack with every check run: a v2 rules pack, nothing skipped, nothing refused', async () => {
    const checked = await validatePack(files(), context());
    expect(checked.report.diagnostics).toEqual([]);
    expect(checked.report.status).toBe('pass');
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.ref.id).toBe('example.half-damage');
    expect(checked.ref.version).toBe('1.0.0');
    expect(checked.manifest.kinds).toEqual(['rules']);
    expect(checked.manifest.intents).toEqual([{ kind: 'new-behaviour', files: [RULES_MEMBER] }]);
  });

  it('holds a rules member that passes validateRules on a floor with no entities', () => {
    const report = validateRules(JSON.parse(text(join(PACK, ...RULES_MEMBER.split('/')))), rulesCatalogue({ layout: layoutEntityIds({}) }));
    expect(report.diagnostics).toEqual([]);
    expect(report.status).toBe('pass');
  });

  it('passes checkThunderstorePackage, its store manifest the one thunderstoreManifest writes for the pack', async () => {
    const checked = await validatePack(files(), context());
    if (!checked.ok) throw new Error(JSON.stringify(checked.report.diagnostics));
    const store = checkThunderstorePackage(files(), { pack: checked.manifest });
    expect(store.diagnostics).toEqual([]);
    expect(store.status).toBe('pass');
    const exported = thunderstoreManifest(checked.manifest);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(JSON.parse(text(join(PACK, 'manifest.json')))).toEqual(exported.manifest);
  });
});

describe('the modding wiki\'s first pack (MW-5): the guide matches the files', () => {
  const page = text(PAGE);

  it('shows each pack file it quotes exactly as committed', () => {
    const quoted = [...page.matchAll(/^```\w*\s+title="pack\/([^"]+)"\n([\s\S]*?)^```$/gm)].map((m) => ({ path: m[1]!, body: m[2]! }));
    expect(quoted.map((q) => q.path).sort()).toEqual([RULES_MEMBER, 'manifest.json', 's2u-pack.json'].sort());
    for (const q of quoted) expect(q.body.trimEnd(), q.path).toBe(text(join(PACK, ...q.path.split('/'))).trimEnd());
  });

  it('names only the member\'s own sha256 and size', async () => {
    const bytes = member(RULES_MEMBER);
    const hashes = new Set([...page.matchAll(/\b[0-9a-f]{64}\b/g)].map((m) => m[0]));
    expect([...hashes]).toEqual([await sha256Hex(bytes)]);
    const sizes = [...page.matchAll(/\b(\d+) bytes\b/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s).toBe(bytes.length);
  });

  it('zips exactly the pack\'s files, in each shell it shows', () => {
    const lines = page.split('\n').filter((l) => /^\s*(zip|tar)\s/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      const named = line.trim().split(/\s+/).filter((w) => PACK_FILES.includes(w) || /\.(json|md|png)$/.test(w));
      expect(named.sort(), line).toEqual([...PACK_FILES].sort());
    }
  });

  it('runs the icon script the way this test runs it', () => {
    expect(page).toMatch(/^node draw-icon\.mjs$/m);
  });
});

describe('the modding wiki\'s first pack (MW-5): a drifted copy is refused', () => {
  it('one changed byte of the rules member: MEMBER_HASH_MISMATCH', async () => {
    const changed = member(RULES_MEMBER).slice();
    const at = changed.indexOf(0x35); // the "5" of the factor 0.5: now a "6"
    expect(at).toBeGreaterThan(0);
    changed[at] = 0x36;
    const drifted = files().map((f) => (f.path === RULES_MEMBER ? { path: f.path, bytes: changed } : f));
    const checked = await validatePack(drifted, context());
    expect(checked.ok).toBe(false);
    expect(codes(checked.report.diagnostics)).toContain(PACK_CODES.memberHashMismatch);
  });

  it('a member one byte longer than its row: MEMBER_INFLATED', async () => {
    const longer = new Uint8Array([...member(RULES_MEMBER), 0x0a]);
    const drifted = files().map((f) => (f.path === RULES_MEMBER ? { path: f.path, bytes: longer } : f));
    const checked = await validatePack(drifted, context());
    expect(checked.ok).toBe(false);
    expect(codes(checked.report.diagnostics)).toContain(PACK_CODES.memberInflated);
  });

  it('a file left out of the files rows: MEMBER_UNLISTED', async () => {
    const extra = [...files(), { path: 'rules/notes.json', bytes: new TextEncoder().encode('{}') }];
    const checked = await validatePack(extra, context());
    expect(checked.ok).toBe(false);
    expect(codes(checked.report.diagnostics)).toContain(PACK_CODES.memberUnlisted);
  });

  it('a store manifest whose version is not the pack\'s: store.MANIFEST_MISMATCH', () => {
    const store = JSON.parse(text(join(PACK, 'manifest.json'))) as Record<string, unknown>;
    store['version_number'] = '1.0.1';
    const drifted = files().map((f) => (f.path === 'manifest.json' ? { path: f.path, bytes: new TextEncoder().encode(JSON.stringify(store)) } : f));
    const report = checkThunderstorePackage(drifted, { pack: manifest() });
    expect(report.status).not.toBe('pass');
    expect(codes(report.diagnostics)).toContain(THUNDERSTORE_CODES.manifestMismatch);
  });
});
