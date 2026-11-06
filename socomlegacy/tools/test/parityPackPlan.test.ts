import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_SEEN_MARKER } from '../../packages/viewer/src/devSeen';
import { KEYBOARD_SITES } from '../../packages/viewer/src/keyboardTesting';
import { MOUSE_SITES } from '../../packages/viewer/src/mouseTesting';
import {
  CARD_FILES, EXPECTED_ELF_CRC, absoluteFolders, GUI_PORT, MATCH_HOOK, PACK_LAYOUT, PackPlanError, SITE_PORT, STATE_SLOTS, checkDevBuild,
  chromiumDirName, describePlan, fillTemplate, judgeChecklist, listTree, outDirRefusal, packEnv, packIni, packName,
  packStamp, parseBuildArgs, planPcsx2Copy, stateFileName, versionJson, type ListedFile, type PackFs, type PackPlan,
} from '../parity-pack/packPlan';

/**
 * PK-4 (docs/plans/2026-11-03-parity-pack.md; design 4, 7, 10.4): the parity pack's builder's plan, pure. Product
 * track (OT.R53): a validation instrument's packaging, an adaptation; nothing here changes what the game does. Every
 * input is a fake: no PCSX2 folder, no page build, no git.
 */
const here = dirname(fileURLToPath(import.meta.url));
const SRC = 'X:/eph/pcsx2';

const S5 = 'sstates/SCUS-97275 (0F6FC6CF).05.p2s';
const S8 = 'sstates/SCUS-97275 (0F6FC6CF).08.p2s';
const NEEDED: ListedFile[] = [
  { rel: 'pcsx2-qt.exe', size: 100 },
  { rel: 'inis/PCSX2.ini', size: 10 },
  { rel: S5, size: 50 },
  { rel: S8, size: 60 },
  ...CARD_FILES.map((f) => ({ rel: `memcards/${f}`, size: 8 })),
];
const EXCLUDED: ListedFile[] = [
  { rel: 'bios/scph-fake.bin', size: 4 }, { rel: 'bios/fake.rom1', size: 1 }, { rel: 'bios/fake.nvm', size: 1 },
  { rel: 'bios/fake.mec', size: 1 }, { rel: 'bios/fake.erom', size: 1 }, { rel: 'bios/readme.txt', size: 1 },
  { rel: 'cache/gamelist.cache', size: 2 }, { rel: 'logs/emulog.txt', size: 3 }, { rel: 'snaps/a.png', size: 4 },
  { rel: 'videos/a.mp4', size: 5 }, { rel: 'inputrecordings/a.p2m2', size: 6 }, { rel: 'textures/SCUS-97275/a.png', size: 7 },
  { rel: 'inis/PCSX2.ini.backup', size: 8 }, { rel: 'inis/PCSX2.ini.bak-20261030', size: 9 },
  { rel: 'sstates/SCUS-97275 (0F6FC6CF).01.p2s', size: 10 }, { rel: 'sstates/SLUS-20000 (12345678).05.p2s', size: 11 },
  { rel: 'game.iso', size: 12 },
];
const KEPT: ListedFile[] = [
  { rel: 'patches/0F6FC6CF.pnach', size: 3 }, { rel: 'cheats/0F6FC6CF.pnach', size: 3 }, { rel: 'gamesettings/SCUS-97275_0F6FC6CF.ini', size: 2 },
  { rel: 'resources/fonts/a.ttf', size: 5 },
];

describe('the pack\'s constants (design 4, 10)', () => {
  it('ports, the ELF CRC, the state slots and the card files', () => {
    expect(GUI_PORT).toBe(5390);
    expect(SITE_PORT).toBe(5391);
    expect(EXPECTED_ELF_CRC).toBe('0F6FC6CF');
    expect(STATE_SLOTS).toEqual({ r0004: 5, r0001: 8 });
    expect(CARD_FILES).toEqual(['Mcd001.ps2', 'Mcd002.ps2', 'EPH-r0001-1.ps2', 'EPH-r0001-2.ps2']);
    expect(stateFileName(5)).toBe('SCUS-97275 (0F6FC6CF).05.p2s');
    expect(stateFileName(8)).toBe('SCUS-97275 (0F6FC6CF).08.p2s');
  });
  it('the layout: the PCSX2 copy is the run directory\'s own (pack/run/pcsx2), no separate pack/pcsx2', () => {
    expect(PACK_LAYOUT.run).toBe('pack/run');
    expect(PACK_LAYOUT.pcsx2).toBe('pack/run/pcsx2');
    expect(Object.values(PACK_LAYOUT)).not.toContain('pack/pcsx2');
    expect(PACK_LAYOUT.startHere).toBe('START HERE.cmd');
    expect(PACK_LAYOUT.version).toBe('pack/VERSION.json');
    expect(PACK_LAYOUT.harnessBundle).toBe('pack/harness/harness.mjs');
    expect(PACK_LAYOUT.launchToMission).toBe('pack/harness/desktop-stub/scripts/parity/launch_to_mission.txt');
  });
  it('packName and packStamp are UTC', () => {
    const now = new Date('2026-11-03T23:59:58.500Z');
    expect(packName(now)).toBe('SOCOM-Parity-Harness-20261103');
    expect(packStamp(now)).toBe('2026-11-03T23:59:58Z');
  });
});

describe('planPcsx2Copy: what ships of the EPH run directory\'s PCSX2 and why the rest does not (design 7; PK.R3)', () => {
  const plan = planPcsx2Copy(SRC, [...NEEDED, ...KEPT, ...EXCLUDED]);
  it('ships the exe, the ini, the two states, the four cards and the rest of the folder, into pack/run/pcsx2', () => {
    const rels = plan.files.map((f) => f.rel).sort();
    expect(rels).toEqual([...NEEDED, ...KEPT].map((f) => f.rel).sort());
    const ini = plan.files.find((f) => f.rel === 'inis/PCSX2.ini')!;
    expect(ini).toEqual({ rel: 'inis/PCSX2.ini', from: `${SRC}/inis/PCSX2.ini`, to: 'pack/run/pcsx2/inis/PCSX2.ini', size: 10 });
  });
  it('excludes every other file, each with its reason', () => {
    const why = new Map(plan.excluded.map((e) => [e.rel, e.reason]));
    expect([...why.keys()].sort()).toEqual(EXCLUDED.map((f) => f.rel).sort());
    for (const f of EXCLUDED.filter((e) => e.rel.startsWith('bios/'))) expect(why.get(f.rel), f.rel).toMatch(/BIOS.*never shipped/);
    expect(why.get('cache/gamelist.cache')).toMatch(/cache/);
    expect(why.get('logs/emulog.txt')).toMatch(/log/);
    expect(why.get('snaps/a.png')).toMatch(/screenshot/);
    expect(why.get('videos/a.mp4')).toMatch(/recording/);
    expect(why.get('inputrecordings/a.p2m2')).toMatch(/input recording/);
    expect(why.get('textures/SCUS-97275/a.png')).toMatch(/texture/);
    expect(why.get('inis/PCSX2.ini.backup')).toMatch(/backup/);
    expect(why.get('inis/PCSX2.ini.bak-20261030')).toMatch(/backup/);
    expect(why.get('sstates/SCUS-97275 (0F6FC6CF).01.p2s')).toMatch(/state other than.*5.*8/);
    expect(why.get('sstates/SLUS-20000 (12345678).05.p2s')).toMatch(/state other than/);
    expect(why.get('game.iso')).toMatch(/disc image.*never shipped/);
    expect(plan.excluded.find((e) => e.rel === 'logs/emulog.txt')!.size).toBe(3);
  });
  it('matches the folders without regard to case (Windows)', () => {
    const p = planPcsx2Copy(SRC, [...NEEDED, { rel: 'BIOS/x.BIN', size: 1 }]);
    expect(p.excluded.map((e) => e.rel)).toEqual(['BIOS/x.BIN']);
  });
  it('takes the cards from the memcards folder the ini names', () => {
    const moved = NEEDED.map((f) => ({ ...f, rel: f.rel.replace(/^memcards\//, 'cards/') }));
    expect(planPcsx2Copy(SRC, moved, { memcards: 'cards' }).files.length).toBe(moved.length);
  });
  it('refuses a missing exe, ini, either state or any card, one line each', () => {
    const without = (rel: string): ListedFile[] => NEEDED.filter((f) => f.rel !== rel);
    const refusal = (rel: string): string => {
      try { planPcsx2Copy(SRC, without(rel)); } catch (e) { expect(e).toBeInstanceOf(PackPlanError); return (e as Error).message; }
      throw new Error(`no refusal without ${rel}`);
    };
    expect(refusal('pcsx2-qt.exe')).toMatch(/no pcsx2-qt\.exe in X:\/eph\/pcsx2/);
    expect(refusal('inis/PCSX2.ini')).toMatch(/no inis\/PCSX2\.ini/);
    expect(refusal(S5)).toMatch(/r0004.*slot 5/);
    expect(refusal(S8)).toMatch(/r0001.*slot 8/);
    for (const c of CARD_FILES) expect(refusal(`memcards/${c}`)).toContain(c);
    for (const r of ['pcsx2-qt.exe', S5, `memcards/${CARD_FILES[2]}`]) expect(refusal(r)).not.toContain('\n');
  });
  it('a backed-up copy is not the file it backs up', () => {
    const list = [...NEEDED.filter((f) => f.rel !== 'inis/PCSX2.ini'), { rel: 'inis/PCSX2.ini.backup', size: 1 }];
    expect(() => planPcsx2Copy(SRC, list)).toThrow(/no inis\/PCSX2\.ini/);
  });
});

describe('listTree walks a folder through the injected fs', () => {
  it('every file, relative, forward slashes, sorted, with its size', () => {
    const tree: Record<string, number | string[]> = {
      'X:/p': ['b', 'a.txt'], 'X:/p/b': ['c.bin', 'd'], 'X:/p/b/d': [], 'X:/p/a.txt': 3, 'X:/p/b/c.bin': 7,
    };
    const fs: PackFs = {
      exists: (p) => p in tree,
      readdir: (p) => tree[p] as string[],
      stat: (p) => ({ size: typeof tree[p] === 'number' ? tree[p] as number : 0, isDirectory: Array.isArray(tree[p]) }),
      readText: () => '',
    };
    expect(listTree('X:/p', fs)).toEqual([{ rel: 'a.txt', size: 3 }, { rel: 'b/c.bin', size: 7 }]);
    expect(() => listTree('X:/q', fs)).toThrow(/no folder at X:\/q/);
  });
});

describe('packIni: DEV9 off, everything else byte for byte (design 10.4)', () => {
  const ini = [
    '[UI]', 'SettingsVersion = 1', '', '[Folders]', 'MemoryCards = memcards', '',
    '[DEV9/Eth]', 'EthEnable = true', 'EthApi = PCAP Switched', 'EthDevice = {FAKE-ADAPTER-GUID}',
    'EthLogDNS = false', 'InterceptDHCP = false', 'PS2IP = 0.0.0.0', 'Mask = 0.0.0.0', 'Gateway = 0.0.0.0',
    'DNS1 = 192.0.2.1', 'DNS2 = 192.0.2.2', 'AutoMask = true', 'AutoGateway = true', 'ModeDNS1 = Manual',
    'ModeDNS2 = Manual', 'EthHosts = 0', '', '[DEV9/Hdd]', 'HddEnable = false', '',
    '[Pad1]', 'Type = DualShock2', 'Cross = Keyboard/K', 'DNS1 = untouched-outside-dev9', '',
  ];
  const expected = ini.map((l) => ({
    'EthEnable = true': 'EthEnable = false', 'EthDevice = {FAKE-ADAPTER-GUID}': 'EthDevice = ',
    'DNS1 = 192.0.2.1': 'DNS1 = ', 'DNS2 = 192.0.2.2': 'DNS2 = ',
  } as Record<string, string>)[l] ?? l);
  it('rewrites the four DEV9 lines, LF ends', () => {
    expect(packIni(ini.join('\n'))).toBe(expected.join('\n'));
  });
  it('keeps CRLF line ends and every other line, [Pad1] untouched', () => {
    const out = packIni(ini.join('\r\n'));
    expect(out).toBe(expected.join('\r\n'));
    expect(out.slice(out.indexOf('[Pad1]'))).toBe(ini.slice(ini.indexOf('[Pad1]')).join('\r\n'));
  });
  it('an ini without the section is unchanged (PCSX2\'s default is DEV9 off)', () => {
    expect(packIni('[UI]\nA = 1\n')).toBe('[UI]\nA = 1\n');
  });
});

describe('checkDevBuild: the nightly\'s development markers (nightlyBuild.test.ts; OT.R47)', () => {
  const all = [...KEYBOARD_SITES, ...MOUSE_SITES, DEV_SEEN_MARKER, MATCH_HOOK, 'mu-overlay-frame', '{VITE_S2U_ACCOUNT_ORIGIN_ONLY:"1"}'].join(';');
  it('the match hook is matchMount.ts\'s, read as the nightly check reads it', () => {
    const line = readFileSync(resolve(here, '../../packages/viewer/src/matchMount.ts'), 'utf-8').split(/\r?\n/)
      .find((l) => l.startsWith('export const MATCH_WINDOW_HOOK: string = import.meta')) ?? '';
    expect(/DEV \? '([^']+)'/.exec(line)?.[1]).toBe(MATCH_HOOK);
  });
  it('all present: nothing missing', () => {
    expect(checkDevBuild(all, '')).toEqual([]);
  });
  it('the overlay frame may be in the CSS', () => {
    expect(checkDevBuild(all.replace('mu-overlay-frame', ''), '.mu-overlay-frame{}')).toEqual([]);
  });
  it('one missing is named', () => {
    expect(checkDevBuild(all.replace(KEYBOARD_SITES[3], 'x'), '')).toEqual([KEYBOARD_SITES[3]]);
    expect(checkDevBuild(all.replace(DEV_SEEN_MARKER, 'x'), '')).toEqual([DEV_SEEN_MARKER]);
    expect(checkDevBuild(all.replace(MATCH_HOOK, 'x'), '')).toEqual([MATCH_HOOK]);
    expect(checkDevBuild(all.replace('mu-overlay-frame', 'x'), '')).toEqual(['mu-overlay-frame']);
    expect(checkDevBuild(all.replace('"1"', '""'), '')).toEqual(['VITE_S2U_ACCOUNT_ORIGIN_ONLY="1"']);
  });
  it('a production build misses them all', () => {
    expect(checkDevBuild('', '').length).toBe(KEYBOARD_SITES.length + MOUSE_SITES.length + 4);
  });
});

describe('outDirRefusal: never an output git would see (design 3)', () => {
  const top = (d: string): string | null => (d.toLowerCase().startsWith('c:/projects/wt-x') ? 'C:/Projects/wt-x' : null);
  it('inside a tree and not ignored: refused', () => {
    expect(outDirRefusal('C:/Projects/wt-x/socomlegacy/tools/out', top, () => false)).toMatch(/inside the git tree C:\/Projects\/wt-x/);
  });
  it('inside a tree and ignored (socomlegacy/dist/...): allowed', () => {
    expect(outDirRefusal('C:/Projects/wt-x/socomlegacy/dist/parity-pack', top, () => true)).toBeNull();
  });
  it('outside every tree: allowed', () => {
    expect(outDirRefusal('D:/packs/p', top, () => false)).toBeNull();
  });
});

describe('versionJson: pack/VERSION.json (design 4; PK-2 packContext reads it)', () => {
  it('the shape', () => {
    const v = versionJson({
      pageSha: 'abc1234', pageTag: 'v0.3.40-2-gabc1234', pcsx2Version: '2.8.2', builderCommit: 'abc1234',
      now: new Date('2026-11-03T10:00:00Z'), included: ['pcsx2', 'site'],
    });
    expect(v).toEqual({
      pack: 'SOCOM-Parity-Harness-20261103', packStamp: '2026-11-03T10:00:00Z', pageSha: 'abc1234', pageTag: 'v0.3.40-2-gabc1234',
      pcsx2Version: '2.8.2', builderCommit: 'abc1234', expectedElfCrc: '0F6FC6CF', stateSlots: { r0004: 5, r0001: 8 },
      cardFiles: CARD_FILES, guiPort: 5390, sitePort: 5391, included: ['pcsx2', 'site'],
    });
  });
});

describe('describePlan: the --dry-run lines', () => {
  const plan: PackPlan = {
    out: 'D:/packs/SOCOM-Parity-Harness-20261103',
    groups: [
      { name: 'pcsx2', to: 'pack/run/pcsx2', files: [{ from: 'a', to: 'b', size: 1_500_000 }, { from: 'c', to: 'd', size: 500_000 }] },
      { name: 'runtime', to: 'pack/runtime', files: [{ from: 'node.exe', to: 'pack/runtime/node.exe', size: 1000 }] },
      { name: 'site', to: 'pack/site', files: [], built: 'vite build, a development build' },
    ],
    excluded: [{ rel: 'bios/x.bin', size: 4, reason: 'the BIOS folder: never shipped' }],
  };
  const lines = describePlan(plan);
  it('each group with its count and bytes, the built steps, the excluded with their reason, the total', () => {
    expect(lines[0]).toBe('out        D:/packs/SOCOM-Parity-Harness-20261103');
    expect(lines).toContain('pcsx2      2 files  2,000,000 bytes (1.9 MB)  -> pack/run/pcsx2');
    expect(lines).toContain('runtime    1 file  1,000 bytes (0.0 MB)  -> pack/runtime');
    expect(lines).toContain('site       built: vite build, a development build  -> pack/site');
    expect(lines).toContain('excluded   bios/x.bin  4 bytes  the BIOS folder: never shipped');
    expect(lines[lines.length - 1]).toBe('total      3 files  2,001,000 bytes (1.9 MB) copied, plus 1 built; 1 excluded');
  });
});

describe('parseBuildArgs: the builder\'s command line (the skill, section 2)', () => {
  it('the flags', () => {
    expect(parseBuildArgs(['--out', 'D:/p', '--pcsx2', 'X:/pc', '--ffmpeg', 'X:/ff.exe', '--with-chromium', '--zip', '--check'])).toEqual({
      out: 'D:/p', pcsx2: 'X:/pc', ffmpeg: 'X:/ff.exe', withChromium: true, withBios: false, zip: true, dryRun: false, check: true, checkOnly: false, help: false,
    });
    expect(parseBuildArgs(['--out=D:/p', '--dry-run'])).toMatchObject({ out: 'D:/p', dryRun: true });
    expect(parseBuildArgs(['--help']).help).toBe(true);
  });
  it('refusals', () => {
    expect(() => parseBuildArgs([])).toThrow(/--out/);
    expect(() => parseBuildArgs(['--out', 'D:/p', '--bogus'])).toThrow(/unknown option --bogus/);
    expect(() => parseBuildArgs(['--out'])).toThrow(/--out takes a value/);
    expect(() => parseBuildArgs(['--out', 'D:/p', '--dry-run', '--check'])).toThrow(/--dry-run/);
    expect(() => parseBuildArgs(['--out', 'D:/p', '--check-only', '--zip'])).toThrow(/--check-only/);
  });
});

describe('the pack\'s environment: START HERE.cmd and --check set the same five', () => {
  it('packEnv', () => {
    expect(packEnv('D:/p', 'C:/Windows', 'win32')).toEqual({
      EPH_PACK: 'D:\\p', EPH_RUN_DIR: 'D:\\p\\pack\\run', SOCOM_PC_ROOT: 'D:\\p\\pack\\harness\\desktop-stub',
      PATH: 'D:\\p\\pack\\runtime;C:/Windows', PLAYWRIGHT_BROWSERS_PATH: 'D:\\p\\pack\\runtime\\ms-playwright',
    });
  });
  it('the template sets each, and runs the shipped node in the foreground with gui --open', () => {
    const cmd = readFileSync(resolve(here, '../parity-pack/templates/START-HERE.cmd'), 'utf-8');
    expect(cmd.split(/\r?\n/)[0]).toBe('@echo off');
    for (const k of Object.keys(packEnv('D:/p', '', 'win32'))) expect(cmd, k).toMatch(new RegExp(`^set "${k}=`, 'm'));
    expect(cmd).toMatch(/^"%ROOT%\\pack\\runtime\\node\.exe" "%ROOT%\\pack\\harness\\harness\.mjs" gui --open\r?$/m);
    expect(cmd).not.toMatch(/start "" \/B/);
  });
  it('the README holds the three steps, the never-read list and the licences', () => {
    const t = readFileSync(resolve(here, '../parity-pack/templates/README.txt'), 'utf-8');
    for (const s of ['{{PACK_NAME}}', '{{PAGE_TAG}}', '{{STAMP}}', 'Program Files', 'drop-here', 'START HERE.cmd', 'handoff',
      'GPL', 'https://github.com/PCSX2/pcsx2', 'gyan.dev', 'MIT', 'Apache-2.0', 'Harry62', 'PSRewired', 'r0004']) expect(t, s).toContain(s);
    expect(t).toMatch(/NEVER/);
  });
});

describe('fillTemplate', () => {
  it('fills every placeholder and refuses one left', () => {
    expect(fillTemplate('{{A}}-{{B}}-{{A}}', { A: '1', B: '2' })).toBe('1-2-1');
    expect(() => fillTemplate('{{A}} {{C}}', { A: '1' })).toThrow(/\{\{C\}\}/);
  });
});

describe('chromiumDirName: the folder playwright-core\'s registry names', () => {
  it('chromium-<revision>', () => {
    expect(chromiumDirName(JSON.stringify({ browsers: [{ name: 'chromium-headless-shell', revision: '9' }, { name: 'chromium', revision: '1243' }] }))).toBe('chromium-1243');
    expect(() => chromiumDirName('{"browsers":[]}')).toThrow(/no chromium/);
  });
});

describe('judgeChecklist: --check reads the GUI\'s checklist (design 7: the tester\'s own lines missing, the rest green)', () => {
  it('the image, the BIOS and the maps missing, a pad warning, the rest ok: passes', () => {
    const r = judgeChecklist({ checklist: [
      { id: 'image', ok: false, text: 'no image' }, { id: 'bios', ok: false, text: 'no BIOS' }, { id: 'maps', ok: false, text: 'not prepared' },
      { id: 'ffmpeg', ok: true, text: 'ffmpeg found' }, { id: 'browser', ok: true, text: 'Edge' },
      { id: 'pad', ok: false, level: 'warn', text: 'no pad seen yet' },
    ] });
    expect(r.failed).toEqual([]);
    expect(r.lines).toEqual([
      '  --    image    no image', '  --    bios     no BIOS', '  --    maps     not prepared',
      '  ok    ffmpeg   ffmpeg found', '  ok    browser  Edge', '  warn  pad      no pad seen yet',
    ]);
  });
  it('a line that needs no tester file red: named', () => {
    expect(judgeChecklist({ checklist: [{ id: 'ffmpeg', ok: false, text: 'no ffmpeg' }] }).failed).toEqual(['ffmpeg']);
    expect(judgeChecklist({ checklist: [{ id: 'browser', ok: false, text: 'none' }, { id: 'bios', ok: true, text: 'x' }] }).failed).toEqual(['browser']);
  });
  it('no checklist: refused', () => {
    expect(judgeChecklist({}).failed).toEqual(['the status has no checklist']);
    expect(judgeChecklist({ checklist: [] }).failed).toEqual(['the status has no checklist']);
  });
});

describe('absoluteFolders: a [Folders] path the pack could not carry to another PC', () => {
  it('names each absolute one, ignores the relative ones and the other sections', () => {
    const ini = ['[Folders]', 'Bios = bios', 'Snapshots = D:/Shots', 'MemoryCards = memcards', 'Cheats = \\\\host\\share', '[Other]', 'Path = C:/x', ''].join('\r\n');
    expect(absoluteFolders(ini)).toEqual(['Snapshots', 'Cheats']);
    expect(absoluteFolders('[Folders]\nBios = bios\n')).toEqual([]);
  });
});

describe('the batch review\'s F1: no settings file but PCSX2.ini, no disabled patch (the builder host\'s network lines)', () => {
  it('inis/PCSX2.ini.before-interp-nav and patches/*.disabled-* are left out with their reasons', () => {
    const plan = planPcsx2Copy(SRC, [...NEEDED,
      { rel: 'inis/PCSX2.ini.before-interp-nav', size: 5 }, { rel: 'patches/0F6FC6CF.pnach.disabled-20261011-bootloop', size: 6 }]);
    const rels = plan.files.map((f) => f.rel);
    expect(rels).toContain('inis/PCSX2.ini');
    expect(rels).not.toContain('inis/PCSX2.ini.before-interp-nav');
    expect(rels).not.toContain('patches/0F6FC6CF.pnach.disabled-20261011-bootloop');
    const why = Object.fromEntries(plan.excluded.map((e) => [e.rel, e.reason]));
    expect(why['inis/PCSX2.ini.before-interp-nav']).toMatch(/other than PCSX2\.ini/);
    expect(why['patches/0F6FC6CF.pnach.disabled-20261011-bootloop']).toMatch(/disabled patch/);
  });
});

describe('PK.R6: --with-bios ships the BIOS folder (the owner\'s word, 2026-11-03: a pack handed to a trusted person)', () => {
  it('every bios/ file ships, the rest of the plan unchanged; without the flag none does', () => {
    const withBios = planPcsx2Copy(SRC, [...NEEDED, ...EXCLUDED, ...KEPT], { withBios: true });
    const biosRels = EXCLUDED.filter((f) => f.rel.startsWith('bios/')).map((f) => f.rel).sort();
    expect(withBios.files.map((f) => f.rel).filter((r) => r.startsWith('bios/')).sort()).toEqual(biosRels);
    expect(withBios.excluded.map((e) => e.rel).some((r) => r.startsWith('bios/'))).toBe(false);
    expect(withBios.excluded.length).toBe(EXCLUDED.length - biosRels.length);
    const without = planPcsx2Copy(SRC, [...NEEDED, ...EXCLUDED, ...KEPT]);
    expect(without.files.some((f) => f.rel.startsWith('bios/'))).toBe(false);
  });
  it('refuses --with-bios when the copy has no bios/*.bin', () => {
    expect(() => planPcsx2Copy(SRC, [...NEEDED, { rel: 'bios/readme.txt', size: 1 }], { withBios: true })).toThrow(/--with-bios: no BIOS file/);
  });
  it('the flag parses', () => {
    expect(parseBuildArgs(['--out', 'D:/p', '--with-bios'])).toMatchObject({ withBios: true });
    expect(() => parseBuildArgs(['--out', 'D:/p', '--check-only', '--with-bios'])).toThrow(/takes no build option/);
  });
});
