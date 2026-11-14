import { describe, expect, it } from 'vitest';
import {
  MAP_PACK_RULES_PATH, PACK_MANIFEST_FILE, readMapPack, recordOfLayout, THUNDERSTORE_CODES, THUNDERSTORE_TEAM, type Diagnostic,
} from '@s2u/creator-contracts';
import { bytesSource, openZip } from '../../src/zipReader';
import {
  checkExportMembers, exportForgePack, FORGE_EXPORT_CODES, ownCopyNeeds, type ForgeExportInput, type ForgeExportResult,
} from '../../src/forge/exportPack';
import { BLANK_LIBRARY } from '../../src/forge/matchMap';
import {
  CONTENT_MAP, CONTENT_MAP_TEAM, contentYard, DEPENDENCY, DEPENDENCY_TEAM, dependentYard, discYard, INSTALLED_RULES_TEAM, installedRulesYard,
  lentFloor, POSED_ROW, posedYard, rulesYard,
} from './exportFixture';

/**
 * FX-11a slice 2 (FX.R4 "Yes, lets export to thunderstore pack format"; FX.R11; the pack format 0.2 spec section 5; H442
 * e, f, m; a browser adaptation with no original): the Forge's pack export. One zip that is our v2 map pack and a
 * Thunderstore package at once: `s2u-pack.json` and the layout (and its rules) from `buildMapPack`, the store's
 * `manifest.json`, the drawn plan `icon.png` and a generated `README.md`; checked whole by `validatePack` and
 * `checkThunderstorePackage` before it is returned. Nothing of the disc is in it: a layout names disc assets.
 */

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const fileOf = (r: ForgeExportResult, path: string): Uint8Array => {
  const f = r.files.find((x) => x.path === path);
  if (!f) throw new Error(`no ${path} in the export`);
  return f.bytes;
};
const jsonOf = (r: ForgeExportResult, path: string): Record<string, unknown> => JSON.parse(text(fileOf(r, path))) as Record<string, unknown>;
const codes = (list: readonly Diagnostic[]): string[] => list.filter((d) => d.severity === 'error').map((d) => d.code);
const base = (extra: Partial<ForgeExportInput> = {}): Omit<ForgeExportInput, 'layout'> => ({ id: 'yard.map', version: '1.0.0', team: 'Yard_Builder', ...extra });

describe('FX-11a: exportForgePack writes one zip that is a v2 map pack and a store package', () => {
  it('a disc-only layout: the five files, in order, its name the store form, and both checks pass', async () => {
    const r = await exportForgePack({ layout: discYard(), ...base() });
    expect(codes(r.diagnostics)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.files.map((f) => f.path)).toEqual([PACK_MANIFEST_FILE, 'layouts/yard.json', 'manifest.json', 'icon.png', 'README.md']);
    expect(r.name).toBe('Yard_Builder-yard_map-1.0.0.zip');
    expect(jsonOf(r, 'manifest.json')).toEqual({ name: 'yard_map', version_number: '1.0.0', website_url: '', description: '', dependencies: [] });
    const pack = jsonOf(r, PACK_MANIFEST_FILE);
    expect([pack['id'], pack['version'], pack['kinds'], pack['dependencies']]).toEqual(['yard.map', '1.0.0', ['content'], []]);
    expect(pack['license']).toBeUndefined();
  });

  it('the zip holds exactly the files, byte for byte, and reads back as the map pack with its layout', async () => {
    const r = await exportForgePack({ layout: discYard(), ...base() });
    if (!r.ok) throw new Error(codes(r.diagnostics).join(', '));
    const zip = await openZip(bytesSource(r.zip));
    expect(zip.members.map((m) => m.name)).toEqual(r.files.map((f) => f.path));
    for (const m of zip.members) expect(Buffer.from(await zip.read(m)).equals(Buffer.from(fileOf(r, m.name))), m.name).toBe(true);
    const read = await readMapPack(r.files);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.pack.ref).toEqual(r.ref);
    expect(read.pack.layouts.map((l) => [l.path, l.record.name, l.record.base])).toEqual([['layouts/yard.json', 'Yard', 'MP2']]);
  });

  it('the same layout and input give the same zip bytes', async () => {
    const a = await exportForgePack({ layout: discYard(), ...base() });
    const b = await exportForgePack({ layout: discYard(), ...base() });
    if (!a.ok || !b.ok) throw new Error('refused');
    expect(Buffer.from(a.zip).equals(Buffer.from(b.zip))).toBe(true);
  });

  it('a layout with a rules draft folds it in as rules/mode.json; the layout no longer names the draft pack', async () => {
    const r = await exportForgePack({ layout: await rulesYard(), ...base({ id: 'vault.map' }) });
    expect(codes(r.diagnostics)).toEqual([]);
    expect(r.files.map((f) => f.path)).toEqual([PACK_MANIFEST_FILE, 'layouts/vault.json', MAP_PACK_RULES_PATH, 'manifest.json', 'icon.png', 'README.md']);
    expect(jsonOf(r, PACK_MANIFEST_FILE)['kinds']).toEqual(['content', 'rules']);
    const layout = jsonOf(r, 'layouts/vault.json');
    expect(layout['requires']).toBeUndefined();
    expect(layout['mode']).toMatchObject({ id: 'vault.run', version: '1.0.0' });
    const read = await readMapPack(r.files);
    expect(read.ok && read.pack.rules?.pack).toEqual(r.ok && r.ref);
  });

  it('a layout that requires another pack names it under its own team, never carries it', async () => {
    const r = await exportForgePack({ layout: dependentYard(), ...base({ teams: { [DEPENDENCY.id]: DEPENDENCY_TEAM } }) });
    expect(codes(r.diagnostics)).toEqual([]);
    expect(r.files.map((f) => f.path)).toEqual([PACK_MANIFEST_FILE, 'layouts/crate-yard.json', 'manifest.json', 'icon.png', 'README.md']);
    expect(jsonOf(r, PACK_MANIFEST_FILE)['dependencies']).toEqual([{ id: DEPENDENCY.id, range: DEPENDENCY.version }]);
    expect(jsonOf(r, 'manifest.json')['dependencies']).toEqual([`${DEPENDENCY_TEAM}-fuse_crates-${DEPENDENCY.version}`]);
    expect(jsonOf(r, 'layouts/crate-yard.json')['requires']).toEqual([DEPENDENCY]);
  });

  it('the README names the base map by the display name given, never its stem, and the layout member', async () => {
    const r = await exportForgePack({ layout: discYard(), ...base({ baseName: 'Frostfire' }) });
    const readme = text(fileOf(r, 'README.md'));
    expect(readme).toContain('Frostfire');
    expect(readme).toContain('layouts/yard.json');
    expect(readme).not.toContain('MP2');
  });
});

describe('FX-11a: the store export (H442 e, m): a licence and a team', () => {
  it('forStore with a licence and a team writes the licence and authors into s2u-pack.json and the README', async () => {
    const r = await exportForgePack({ layout: discYard(), ...base({ forStore: true, license: 'CC-BY-4.0', authors: ['Yard Builder'] }) });
    expect(codes(r.diagnostics)).toEqual([]);
    const pack = jsonOf(r, PACK_MANIFEST_FILE);
    expect([pack['license'], pack['authors']]).toEqual(['CC-BY-4.0', ['Yard Builder']]);
    const readme = text(fileOf(r, 'README.md'));
    expect(readme).toContain('## Licence');
    expect(readme).toContain('CC-BY-4.0');
    expect(readme).toContain('- Yard Builder');
  });

  it('forStore with no licence is refused by name, with no file and no zip', async () => {
    const r = await exportForgePack({ layout: discYard(), ...base({ forStore: true }) });
    expect(r.ok).toBe(false);
    expect(codes(r.diagnostics)).toContain(FORGE_EXPORT_CODES.licenceMissing);
    expect(r.files).toEqual([]);
    expect(r.zip).toBeUndefined();
  });

  it('forStore with no team is refused by name', async () => {
    const r = await exportForgePack({ layout: discYard(), id: 'yard.map', version: '1.0.0', forStore: true, license: 'MIT' });
    expect(r.ok).toBe(false);
    expect(codes(r.diagnostics)).toContain(FORGE_EXPORT_CODES.teamMissing);
  });

  it('a local pack with no team is written, its file name without a team', async () => {
    const r = await exportForgePack({ layout: discYard(), id: 'yard.map', version: '1.0.0' });
    expect(codes(r.diagnostics)).toEqual([]);
    expect(r.name).toBe('yard_map-1.0.0.zip');
  });

  it('the project pack goes under SOCOM_Legacy; a project pack with another team is refused', async () => {
    const own = await exportForgePack({ layout: discYard(), id: 'yard.map', version: '1.0.0', project: true });
    expect(own.name).toBe(`${THUNDERSTORE_TEAM}-yard_map-1.0.0.zip`);
    const clash = await exportForgePack({ layout: discYard(), ...base({ project: true }) });
    expect(clash.ok).toBe(false);
    expect(codes(clash.diagnostics)).toContain(FORGE_EXPORT_CODES.teamConflict);
  });

  it('a creator export never falls back to the project team', async () => {
    const r = await exportForgePack({ layout: discYard(), id: 'yard.map', version: '1.0.0', forStore: true, license: 'MIT' });
    expect(r.name.startsWith(THUNDERSTORE_TEAM)).toBe(false);
  });
});

describe('FX-11a: the refusals, each by name', () => {
  it('a layout that is not saveable', async () => {
    const bad = discYard();
    bad.pieces.push({ asset: 'not an asset', m: bad.pieces[0]!.m.slice() });
    const r = await exportForgePack({ layout: bad, ...base() });
    expect(r.ok).toBe(false);
    expect(codes(r.diagnostics)).toEqual([FORGE_EXPORT_CODES.notSaveable]);
    expect(r.files).toEqual([]);
  });

  it('a dependency with no known team surfaces the contract refusal store.DEPENDENCY_TEAM_UNKNOWN', async () => {
    const r = await exportForgePack({ layout: dependentYard(), ...base() });
    expect(r.ok).toBe(false);
    expect(codes(r.diagnostics)).toContain(THUNDERSTORE_CODES.dependencyTeamUnknown);
    expect(r.zip).toBeUndefined();
  });

  it('a version the store does not take (a pre-release) is refused by the store rule', async () => {
    const r = await exportForgePack({ layout: discYard(), ...base({ version: '1.0.0-beta' }) });
    expect(r.ok).toBe(false);
    expect(codes(r.diagnostics)).toContain(THUNDERSTORE_CODES.versionInvalid);
  });

  it('a pack id the contract refuses is refused with the contract code', async () => {
    const r = await exportForgePack({ layout: discYard(), ...base({ id: 'Bad Id' }) });
    expect(r.ok).toBe(false);
    expect(codes(r.diagnostics)).toContain('mapPack.ID_INVALID');
  });

  it('a member the allow-list does not permit, a second layout, rules/map.json and a member under a folder are refused', () => {
    expect(codes(checkExportMembers([PACK_MANIFEST_FILE, 'layouts/yard.json', MAP_PACK_RULES_PATH, 'manifest.json', 'icon.png', 'README.md']))).toEqual([]);
    const refused = checkExportMembers([PACK_MANIFEST_FILE, 'layouts/yard.json', 'layouts/other.json', 'textures/crate.png', 'rules/map.json', 'models/crate.glb', 'manifest.json']);
    expect(codes(refused)).toEqual(Array(4).fill(FORGE_EXPORT_CODES.memberRefused));
    expect(refused.map((d) => d.file)).toEqual(['layouts/other.json', 'textures/crate.png', 'rules/map.json', 'models/crate.glb']);
    // No s2u-pack.json and no layout: each named missing.
    expect(codes(checkExportMembers(['manifest.json', 'icon.png']))).toEqual([FORGE_EXPORT_CODES.memberMissing, FORGE_EXPORT_CODES.memberMissing]);
  });

  it('every refusal is a diagnostic in the contract shape, source pack, evidence validation', async () => {
    const r = await exportForgePack({ layout: discYard(), ...base({ forStore: true }) });
    const d = r.diagnostics.find((x) => x.code === FORGE_EXPORT_CODES.licenceMissing)!;
    expect(d).toMatchObject({ schema: 's2u.creator/diagnostic', version: 1, source: 'pack', severity: 'error', evidence: 'validation' });
    expect(d.text.length).toBeGreaterThan(0);
  });
});

describe("FX-11a's review, finding A: the README says what the player's own copy of the game supplies", () => {
  const OWN_COPY = 'from your own copy of the game; it is not in this package.';
  const readmeOf = (r: ForgeExportResult): string => text(fileOf(r, 'README.md'));

  it('RED: a layout on a game map names that map by its display name, from the own copy, and never says it stands alone', async () => {
    const r = await exportForgePack({ layout: discYard(), ...base({ baseName: 'Frostfire' }) });
    expect(codes(r.diagnostics)).toEqual([]);
    const readme = readmeOf(r);
    expect(readme).toContain(`\n## What it needs\n\n- Frostfire, the game map this layout is built on, ${OWN_COPY}\n`);
    expect(readme).not.toContain('stands alone');
    expect(readme).not.toContain('MP2');
  });

  it('RED: with no display name given the own-copy line still stands, and never names the stem', async () => {
    const readme = readmeOf(await exportForgePack({ layout: discYard(), ...base() }));
    expect(readme).toContain(`\n- The game map this layout is built on, ${OWN_COPY}\n`);
    expect(readme).not.toContain('stands alone');
    expect(readme).not.toContain('MP2');
  });

  it('RED: a blank floor lent a game map\'s props names that map from the own copy', async () => {
    const r = await exportForgePack({ layout: lentFloor(), ...base({ id: 'lent.map', baseName: 'Frostfire' }) });
    expect(codes(r.diagnostics)).toEqual([]);
    const readme = readmeOf(r);
    expect(readme).toContain(`\n- Frostfire, the game map whose props the floor uses, ${OWN_COPY}\n`);
    expect(readme).not.toContain('stands alone');
    expect(readme).not.toContain('MP2');
  });

  it('RED: a layout on another pack\'s map names "the game map" from the own copy (never its stem), then the map\'s pack', async () => {
    const r = await exportForgePack({ layout: contentYard(), ...base({ id: 'on.yard', teams: { [CONTENT_MAP.id]: CONTENT_MAP_TEAM } }) });
    expect(codes(r.diagnostics)).toEqual([]);
    const readme = readmeOf(r);
    expect(readme).toContain(`\n## What it needs\n\n- The game map whose props, characters and kits the base map uses, ${OWN_COPY}\n- The pack \`${CONTENT_MAP.id}\`, a version in \`${CONTENT_MAP.version}\`.\n`);
    expect(readme).not.toContain('stands alone');
    expect(readme).not.toContain('MP2');
  });

  it('pin: the floor the export treats as the forge\'s own is the editor\'s BLANK_LIBRARY (the fold\'s review, finding 2)', () => {
    // exportPack.ts writes the name and does not import it (its module graph is the leak test's): this ties the two.
    expect(ownCopyNeeds({ kind: 'blank', library: BLANK_LIBRARY })).toEqual([]);
    expect(ownCopyNeeds({ kind: 'blank', library: 'MP2' })).toHaveLength(1);
  });

  it('pin: a layout on the forge\'s own blank floor, with no library, still stands alone', async () => {
    const readme = readmeOf(await exportForgePack({ layout: await rulesYard(), ...base({ id: 'vault.map' }) }));
    expect(readme).toContain('\n## What it needs\n\nNothing else: this pack stands alone.\n');
    expect(readme).not.toContain('own copy');
  });
});

describe("FX-11a's review, finding B (pin): the layout and its rules read back from the zip as they were exported", () => {
  it('pin: a posed piece, two spawns and a rules draft, through the zip reader and readMapPack', async () => {
    const layout = await posedYard();
    const exported = recordOfLayout(layout, layout.name!);
    expect(exported.poses).toEqual([POSED_ROW]);
    expect(exported.spawns).toHaveLength(2);
    const r = await exportForgePack({ layout, ...base({ id: 'posed.map' }) });
    expect(codes(r.diagnostics)).toEqual([]);
    if (!r.ok) throw new Error('refused');
    const zip = await openZip(bytesSource(r.zip));
    const entries = await Promise.all(zip.members.map(async (m) => ({ path: m.name, bytes: await zip.read(m) })));
    const read = await readMapPack(entries);
    expect(codes(read.diagnostics)).toEqual([]);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.pack.ref).toEqual(r.ref);
    expect(read.pack.layouts.map((l) => l.path)).toEqual(['layouts/posed-yard.json']);
    // The fold (`mapPack.ts`): the draft's own pack leaves `requires`, and the reader attaches the pack's own reference.
    expect(read.pack.layouts[0]!.record).toEqual({ ...exported, requires: [r.ref] });
    expect(read.pack.rules).toEqual({ pack: r.ref, spec: layout.rules!.spec });
  });
});

describe("FX-11a's review, finding C (pins): the packs a layout needs are dependencies in both manifests, under their teams", () => {
  it('pin: a mode from an installed rules pack: that pack is a dependency, never carried', async () => {
    const { layout, installed } = await installedRulesYard();
    const ref = installed[0]!.ref;
    expect(layout.requires).toEqual([ref]);
    const r = await exportForgePack({ layout, installed, ...base({ id: 'borrowed.map', teams: { [ref.id]: INSTALLED_RULES_TEAM } }) });
    expect(codes(r.diagnostics)).toEqual([]);
    expect(r.files.map((f) => f.path)).toEqual([PACK_MANIFEST_FILE, 'layouts/borrowed-vault.json', 'manifest.json', 'icon.png', 'README.md']);
    const pack = jsonOf(r, PACK_MANIFEST_FILE);
    expect([pack['kinds'], pack['dependencies']]).toEqual([['content'], [{ id: ref.id, range: ref.version }]]);
    expect(jsonOf(r, 'manifest.json')['dependencies']).toEqual([`${INSTALLED_RULES_TEAM}-my_vault-${ref.version}`]);
    const record = jsonOf(r, 'layouts/borrowed-vault.json');
    expect(record['requires']).toEqual([ref]);
    expect(record['mode']).toMatchObject({ id: 'vault.run', version: ref.version });
  });

  it('pin: a layout on another pack\'s map: that map\'s pack is a dependency, never carried', async () => {
    const r = await exportForgePack({ layout: contentYard(), ...base({ id: 'on.yard', teams: { [CONTENT_MAP.id]: CONTENT_MAP_TEAM } }) });
    expect(codes(r.diagnostics)).toEqual([]);
    expect(r.files.map((f) => f.path)).toEqual([PACK_MANIFEST_FILE, 'layouts/on-the-yard.json', 'manifest.json', 'icon.png', 'README.md']);
    expect(jsonOf(r, PACK_MANIFEST_FILE)['dependencies']).toEqual([{ id: CONTENT_MAP.id, range: CONTENT_MAP.version }]);
    expect(jsonOf(r, 'manifest.json')['dependencies']).toEqual([`${CONTENT_MAP_TEAM}-fuse_maps-${CONTENT_MAP.version}`]);
    const record = jsonOf(r, 'layouts/on-the-yard.json');
    expect([record['base'], record['contentBase'], record['requires']]).toEqual(['content:MP2', { ref: { ...CONTENT_MAP }, mapId: 'yard' }, [{ ...CONTENT_MAP }]]);
  });
});
