import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  ABSOLUTE_USER, CAPTURE_TASKS, MANIFEST_PATH, checkCaptures, coverage, inventoryDialogs, parseManifest, pcArchiveRoot, pngSize, presentRoots,
  readManifest, validateManifest, type GoldenManifest,
} from '../goldenManifest';

/**
 * PLAT-31's manifest (web research 113): screen or state -> capture path -> method, for the front end's references.
 * The CI half holds the committed manifest to PLAT-06's dialog inventory (`dialogInventory.pinned.json`, research 96)
 * and to its own rules, and plants bad manifests to show each rule can fail. The dev-host half (skips without
 * `SOCOM_PC_ROOT` and `SOCOM_PARITY_ARCHIVE`) checks every named capture exists with the recorded size and dimensions;
 * a `SOCOM_PC_ROOT` capture the PC project has moved off its tree is read at the same place under `SOCOM_PC_ARCHIVE`,
 * the archived copy of that tree, when that is set.
 * No frame, crop or hash enters git: names, byte counts and pixel sizes only.
 */

const REDOTCOM = resolve(import.meta.dirname, '..', '..');
const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'dialogInventory.pinned.json'), 'utf8')) as {
  perDialog: Record<string, unknown>; dangling: string[];
};
const INV = inventoryDialogs(PIN);
const manifest = (): GoldenManifest => readManifest(resolve(REDOTCOM, MANIFEST_PATH));

/** A small manifest that passes, to plant one fault at a time. */
function tiny(): GoldenManifest {
  return {
    schema: 1,
    about: 'planted',
    roots: { SOCOM_PC_ROOT: 'the PC project', SOCOM_PARITY_ARCHIVE: 'the parity archive' },
    methods: { m1: { how: 'a driven run', cites: ['PC research 18 §1'] } },
    owedMethods: { o1: { how: 'a driven run to come', cites: ['web roadmap OPT-19'] } },
    rows: [{
      id: 'boot.a', screen: 'a screen', dialogs: ['dlgA.rdr'], segment: 'boot', confidence: 'seen', cites: [],
      captures: [{ root: 'SOCOM_PC_ROOT', path: 'logs/parity/x/a.png', bytes: 10, width: 640, height: 448,
        source: 'recomp', method: 'm1', looked: true }],
    }],
    screensWithoutFrame: [
      { dialog: 'dlgB.rdr', owedBy: 'ONL-32', pcsx2Offline: 'no-our-server', why: 'online', method: 'o1' },
      { dialog: 'dlgGone.rdr', owedBy: null, pcsx2Offline: 'never', why: 'not on the disc', outOfScope: 'dangling' },
    ],
    statesWithoutFrame: [{ id: 'card.none', state: 'no card', owedBy: 'OPT-19', pcsx2Offline: 'yes', why: 'w', method: 'o1' }],
  };
}
const TINY_INV = { dialogs: ['dlgA.rdr', 'dlgB.rdr'], dangling: ['dlgGone.rdr'] };

/** Every row of the committed manifest and its capture count; a change to the manifest's rows changes this pin. */
const ROW_CAPTURES: Record<string, number> = {
  'boot.loading-logo': 3, 'boot.card-slot-select': 2, 'boot.card-searching': 1, 'boot.card-no-data': 2,
  'boot.sony-card-typing': 2, 'boot.sony-card-fade': 2, 'boot.zipper-card': 4, 'boot.intro2-opening': 5,
  'menu.main': 12, 'menu.main.options-lit': 1, 'menu.main.down-walk': 8, 'menu.attract-fade': 1, 'menu.attract': 2, 'campaign.select-rank': 3,
  'campaign.controller-config-select': 2, 'campaign.precision-config': 3, 'card.save-prompt': 6,
  'card.save-slot-select': 4, 'card.saving': 1, 'card.overwrite-warning': 1, 'campaign.albania-aop': 11,
  'campaign.briefing-overview': 7, 'campaign.briefing-objectives': 1, 'campaign.briefing-maps-intel': 1,
  'campaign.briefing-deploy': 1, 'options.menu': 2, 'options.menu.hdd-row': 1, 'options.menu.video-row': 1,
  'options.audio': 2, 'options.audio.default-confirm': 1, 'options.video': 1, 'options.controller-presets': 2,
  'online.login.no-config-popup': 1, 'online.login.no-config': 2, 'online.login': 2,
  'online.netgui': 2, 'online.netgui-return': 1, 'online.netgui-return.card-slot': 1, 'online.locating-universes': 1,
  'online.select-universe': 2, 'online.persona-form': 5, 'online.persona-list': 1, 'online.name-keyboard': 3,
  'online.write-down-notice': 4, 'online.persona-save-prompt': 1, 'online.persona-save-slot': 2, 'online.connecting': 3,
  'online.user-agreement': 3, 'online.server-news': 3, 'online.menu': 2,
  'online.briefing-rooms-list': 2, 'online.logoff-prompt': 2, 'online.briefing-room': 5, 'online.create-game': 4,
  'online.play-list': 3, 'online.play-list.map-rows': 25, 'online.game-lobby.ready-notice': 1,
  'online.game-lobby': 7, 'online.loading': 2, 'match.round-complete': 2,
};

describe('the golden capture manifest (PLAT-31, CI)', () => {
  it('parses, and its shape is the schema', () => {
    const m = manifest();
    expect(m.schema).toBe(1);
    expect(m.rows.length).toBeGreaterThan(0);
    expect(Object.keys(m.roots).sort()).toEqual(['SOCOM_PARITY_ARCHIVE', 'SOCOM_PC_ROOT']);
  });

  it('passes its own validator against PLAT-06\'s inventory', () => {
    expect(validateManifest(manifest(), INV)).toEqual([]);
  });

  it('covers every dialog of the inventory: in a row, or in the no-frame list with an owing task', () => {
    const m = manifest();
    const { framed, unframed } = coverage(m);
    for (const d of INV.dialogs) expect(framed.has(d) !== unframed.has(d), d).toBe(true);
    expect(INV.dialogs.length).toBe(103);
    for (const n of m.screensWithoutFrame) {
      if (n.owedBy === null) expect(n.outOfScope, n.dialog).toBeTruthy();
      else expect(CAPTURE_TASKS).toContain(n.owedBy);
    }
  });

  it('keeps ids unique, every row with a path and a method, and no absolute user path anywhere', () => {
    const m = manifest();
    const ids = m.rows.map((r) => r.id).concat(m.statesWithoutFrame.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of m.rows) {
      expect(r.captures.length, r.id).toBeGreaterThan(0);
      for (const c of r.captures) {
        expect(c.path, r.id).toMatch(/^[\w.-]+(\/[\w.-]+)*\.png$/);
        expect(m.methods[c.method], `${r.id} ${c.method}`).toBeDefined();
      }
    }
    const text = readFileSync(resolve(REDOTCOM, MANIFEST_PATH), 'utf8');
    expect(text).not.toMatch(ABSOLUTE_USER);
    expect(ABSOLUTE_USER.test('"path": "C:/Projects/x.png"')).toBe(true);
    expect(ABSOLUTE_USER.test(JSON.stringify('D:\\archive\\a.png'))).toBe(true);
    expect(ABSOLUTE_USER.test(JSON.stringify('"Select MEMORY CARD slot:" slot 1'))).toBe(false);
  });

  it('marks a row whose frames nobody looked at as name-only', () => {
    for (const r of manifest().rows) {
      const looked = r.captures.some((c) => c.looked);
      if (!looked) expect(r.confidence, r.id).toBe('name-only');
      else expect(r.confidence, r.id).not.toBe('name-only');
    }
  });

  it('holds every row and its capture count (the pin: a row or capture lost or added fails here)', () => {
    const m = manifest();
    expect(Object.fromEntries(m.rows.map((r) => [r.id, r.captures.length]))).toEqual(ROW_CAPTURES);
    expect(m.rows.length).toBe(60);                                          // 59 until ONL-07 found frames of dlgNetConnect: online.connecting (research 157 §8)
    expect(m.rows.reduce((n, r) => n + r.captures.length, 0)).toBe(188);                       // 183 until ONL-06 added A_38_named.png to online.persona-form (research 153 §4); 184 until ONL-07: 07_after_connect.png on the write-down notice and online.connecting's three (research 157 §8)
    expect(m.statesWithoutFrame.map((s) => s.id).length).toBe(19);         // 13 until ONL-07's six connect dialogs owed to ONL-32 (state.connect-*); PLAT-28's chrome frame, ONL-03's DNAS state (owed to H70; the older state.dnas-screen folded into it at sprint 11's close), MENU-02a's rows
    expect(m.statesWithoutFrame.filter((s) => /^state\.dnas-/.test(s.id)).map((s) => s.id)).toEqual(['state.dnas-connecting-authenticating']);   // one owed row for the one DNAS frame
    const owed: Record<string, number> = {};
    for (const n of m.screensWithoutFrame) owed[String(n.owedBy)] = (owed[String(n.owedBy)] ?? 0) + 1;
    expect(owed).toEqual({ 'BOOT-01': 1, 'OPT-19': 16, 'ONL-32': 21, 'PLAT-36': 4, null: 35 });   // ONL-32 22 until dlgNetConnect's frames were found (ONL-07)
  });

  it('names how every screen and state without a frame is to be captured (plan owner default 4; the gate\'s PLAT-31 row)', () => {
    const m = manifest();
    const dangling = new Set(INV.dangling);
    for (const n of m.screensWithoutFrame) {
      if (dangling.has(n.dialog)) continue;
      expect(m.owedMethods[n.method ?? ''], `${n.dialog} ${String(n.method)}`).toBeDefined();
    }
    for (const s of m.statesWithoutFrame) expect(m.owedMethods[s.method], `${s.id} ${s.method}`).toBeDefined();
    for (const [k, o] of Object.entries(m.owedMethods)) {
      expect(o.how, k).toBeTruthy();
      expect(o.cites.length, k).toBeGreaterThan(0);
    }
    // only what no capture can show is owed by none: R1's campaign dialogs (the method still named) and the dangling name
    const none = m.screensWithoutFrame.filter((n) => n.owedBy === null);
    expect(none.filter((n) => !dangling.has(n.dialog)).every((n) => /^R1:/.test(n.outOfScope ?? ''))).toBe(true);
  });

  it('puts the s4 slot popup after the NetGUI reboot under dlgReturnFromNTGUI2, and dlgMPswitch in the no-frame list', () => {
    // tools/dump-dialogs.ts --dialog: dlgMPswitch has 0 objects, no UIMemCardAnim, ONSTART StopStreaming ->
    // SWITCHMENU(dlgNetLogin); dlgReturnFromNTGUI2 includes UIMemCardAnim and its do_onstart calls intro_onstart.
    const m = manifest();
    const a30 = m.rows.filter((r) => r.captures.some((c) => c.path === 'logs/parity/s4_pcsx2/A_30.png'));
    expect(a30.map((r) => r.dialogs)).toEqual([['dlgReturnFromNTGUI2.rdr']]);
    const sw = m.screensWithoutFrame.find((n) => n.dialog === 'dlgMPswitch.rdr');
    expect(sw?.why).toMatch(/draws nothing/);
    // a dialog that draws nothing has no frame to take: its passage is a trace's (PLAT-36)
    expect([sw?.owedBy, sw?.method]).toEqual(['PLAT-36', 'call-trace']);
    expect(m.screensWithoutFrame.some((n) => n.dialog === 'dlgReturnFromNTGUI2.rdr')).toBe(false);
  });

  it('puts the harness card_slot crop with the persona-save slot prompt over CONNECT TO SOCOM II', () => {
    const rows = manifest().rows.filter((r) => r.captures.some((c) => c.path === 'scripts/parity/refs/card_slot.png'));
    expect(rows.map((r) => [r.id, r.dialogs])).toEqual([['online.persona-save-slot', ['dlgNetPlayerName.rdr']]]);
  });
});

describe('the validator refuses what it should (planted)', () => {
  it('a clean planted manifest passes', () => {
    expect(validateManifest(tiny(), TINY_INV)).toEqual([]);
  });
  it('a duplicate id', () => {
    const m = tiny();
    m.rows.push({ ...m.rows[0]!, captures: [{ ...m.rows[0]!.captures[0]!, path: 'logs/parity/x/b.png' }] });
    expect(validateManifest(m, TINY_INV).join('\n')).toMatch(/duplicate id boot\.a/);
  });
  it('a capture with no method, or a method no entry defines', () => {
    const m = tiny();
    m.rows[0]!.captures[0]!.method = 'nope';
    expect(validateManifest(m, TINY_INV).join('\n')).toMatch(/method nope/);
  });
  it('an absolute or escaping path', () => {
    for (const p of ['C:/Projects/socom_pc/logs/a.png', '/home/u/a.png', '../a.png', 'logs\\a.png']) {
      const m = tiny();
      m.rows[0]!.captures[0]!.path = p;
      expect(validateManifest(m, TINY_INV).join('\n'), p).toMatch(/path/);
    }
  });
  it('an absolute user path in any text field', () => {
    const m = tiny();
    m.methods.m1!.how = 'ran from C:\\Users\\someone\\x';
    expect(validateManifest(m, TINY_INV).join('\n')).toMatch(/absolute/);
  });
  it('a dialog in neither list, in both, or unknown to the inventory', () => {
    const a = tiny();
    a.screensWithoutFrame = a.screensWithoutFrame.filter((n) => n.dialog !== 'dlgB.rdr');
    expect(validateManifest(a, TINY_INV).join('\n')).toMatch(/dlgB\.rdr.*neither/);
    const b = tiny();
    b.rows[0]!.dialogs.push('dlgB.rdr');
    expect(validateManifest(b, TINY_INV).join('\n')).toMatch(/dlgB\.rdr.*both/);
    const c = tiny();
    c.rows[0]!.dialogs.push('dlgNotOnDisc.rdr');
    expect(validateManifest(c, TINY_INV).join('\n')).toMatch(/dlgNotOnDisc\.rdr.*inventory/);
  });
  it('a no-frame entry with no owing task and no out-of-scope reason, or an unknown task', () => {
    const m = tiny();
    m.screensWithoutFrame[0]!.owedBy = null;
    expect(validateManifest(m, TINY_INV).join('\n')).toMatch(/dlgB\.rdr.*owing task/);
    const n = tiny();
    (n.screensWithoutFrame[0] as { owedBy: string }).owedBy = 'MENU-99';
    expect(validateManifest(n, TINY_INV).join('\n')).toMatch(/MENU-99/);
  });
  it('a no-frame entry or state with no method, or one owedMethods does not define', () => {
    const a = tiny();
    delete a.screensWithoutFrame[0]!.method;
    expect(validateManifest(a, TINY_INV).join('\n')).toMatch(/dlgB\.rdr.*no capture method/);
    const b = tiny();
    b.statesWithoutFrame[0]!.method = '';
    expect(validateManifest(b, TINY_INV).join('\n')).toMatch(/card\.none.*no capture method/);
    const c = tiny();
    c.statesWithoutFrame[0]!.method = 'nope';
    c.screensWithoutFrame[1]!.method = 'nope';
    const e = validateManifest(c, TINY_INV).join('\n');
    expect(e).toMatch(/card\.none.*method nope/);
    expect(e).toMatch(/dlgGone\.rdr.*method nope/);
    const d = tiny();
    d.owedMethods.o1!.cites = [];
    expect(validateManifest(d, TINY_INV).join('\n')).toMatch(/owed method o1 cites nothing/);
    expect(() => parseManifest(JSON.stringify({ ...tiny(), owedMethods: undefined }))).toThrow(/owedMethods/);
  });
  it('a seen row with no looked frame', () => {
    const m = tiny();
    m.rows[0]!.captures[0]!.looked = false;
    expect(validateManifest(m, TINY_INV).join('\n')).toMatch(/name-only/);
  });
  it('a capture whose size or source is missing', () => {
    const m = tiny();
    (m.rows[0]!.captures[0] as { bytes?: number }).bytes = 0;
    (m.rows[0]!.captures[0] as { source: string }).source = 'emulator';
    const e = validateManifest(m, TINY_INV).join('\n');
    expect(e).toMatch(/bytes/);
    expect(e).toMatch(/source emulator/);
  });
  it('parseManifest refuses text that is not the schema', () => {
    expect(() => parseManifest('{"schema":2}')).toThrow(/schema/);
    expect(() => parseManifest('not json')).toThrow();
  });
});

describe('the reader\'s helpers', () => {
  it('pngSize reads the IHDR, and refuses what is not a PNG', () => {
    const b = new Uint8Array(24);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 0);
    new DataView(b.buffer).setUint32(16, 640);
    new DataView(b.buffer).setUint32(20, 448);
    expect(pngSize(b)).toEqual({ width: 640, height: 448 });
    expect(pngSize(new Uint8Array(24))).toBeNull();
  });
  it('presentRoots takes each root from its environment variable only', () => {
    expect(presentRoots({}, () => true)).toEqual({});
    expect(presentRoots({ SOCOM_PC_ROOT: '/pc', SOCOM_PARITY_ARCHIVE: '/ar' }, (p) => p === '/pc'))
      .toEqual({ SOCOM_PC_ROOT: '/pc' });
  });
  it('checkCaptures reports a missing file and a size that moved, and skips an absent root', () => {
    const m = tiny();
    m.rows[0]!.captures.push({ ...m.rows[0]!.captures[0]!, root: 'SOCOM_PARITY_ARCHIVE', path: 'golden/s00.png' });
    const png = new Uint8Array(10);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const fs = { size: (_p: string) => 11, head: (_p: string) => png, exists: (_p: string) => true };
    const r = checkCaptures(m, { SOCOM_PC_ROOT: '/pc' }, fs);
    expect(r.checked).toBe(1);
    expect(r.skipped).toEqual(['SOCOM_PARITY_ARCHIVE:golden/s00.png']);
    expect(r.errors.join('\n')).toMatch(/bytes 11, recorded 10/);
    const gone = checkCaptures(m, { SOCOM_PC_ROOT: '/pc' }, { ...fs, exists: () => false });
    expect(gone.errors.join('\n')).toMatch(/missing/);
  });
});

/** A PNG of `bytes` bytes whose IHDR says `width` x `height`. */
function pngOf(bytes: number, width: number, height: number): Uint8Array {
  const b = new Uint8Array(bytes);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 0);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

describe('a capture moved off the PC project\'s tree (SOCOM_PC_ARCHIVE: its archived run output, same relative place)', () => {
  /** Two temp directories standing in for `SOCOM_PC_ROOT` and the archived copy of its tree. */
  function hosts(): { pc: string; arc: string; put: (base: string, rel: string, b: Uint8Array) => void; done: () => void } {
    const top = mkdtempSync(join(tmpdir(), 'golden-archive-'));
    const pc = join(top, 'pc'), arc = join(top, 'arc');
    mkdirSync(pc); mkdirSync(arc);
    const put = (base: string, rel: string, b: Uint8Array): void => {
      mkdirSync(dirname(join(base, rel)), { recursive: true });
      writeFileSync(join(base, rel), b);
    };
    return { pc, arc, put, done: () => rmSync(top, { recursive: true, force: true }) };
  }
  const REL = 'logs/parity/x/a.png';
  /** The planted manifest with a capture of 30 bytes: room for a PNG's IHDR. */
  const m30 = (): GoldenManifest => { const m = tiny(); m.rows[0]!.captures[0]!.bytes = 30; return m; };

  it('pcArchiveRoot takes the archive from SOCOM_PC_ARCHIVE only, kept when the directory exists, as the PC root\'s', () => {
    expect(pcArchiveRoot({}, () => true)).toEqual({});
    expect(pcArchiveRoot({ SOCOM_PARITY_ARCHIVE: '/ar' }, () => true)).toEqual({});
    expect(pcArchiveRoot({ SOCOM_PC_ARCHIVE: '/pa' }, () => false)).toEqual({});
    expect(pcArchiveRoot({ SOCOM_PC_ARCHIVE: '/pa' }, (p) => p === '/pa')).toEqual({ SOCOM_PC_ROOT: '/pa' });
  });

  it('a capture missing under SOCOM_PC_ROOT and present at the same place under the archive is found there', () => {
    const h = hosts();
    try {
      h.put(h.arc, REL, pngOf(30, 640, 448));
      const r = checkCaptures(m30(), { SOCOM_PC_ROOT: h.pc }, undefined, { SOCOM_PC_ROOT: h.arc });
      expect(r).toEqual({ checked: 1, skipped: [], errors: [] });
      // and the archive's copy is held to the record like any other: a size that moved is still reported
      h.put(h.arc, REL, pngOf(31, 640, 448));
      expect(checkCaptures(m30(), { SOCOM_PC_ROOT: h.pc }, undefined, { SOCOM_PC_ROOT: h.arc }).errors.join('\n'))
        .toMatch(/bytes 31, recorded 30/);
    } finally { h.done(); }
  });

  it('a capture missing in both places is still missing; without the archive it is missing as before', () => {
    const h = hosts();
    try {
      expect(checkCaptures(m30(), { SOCOM_PC_ROOT: h.pc }, undefined, { SOCOM_PC_ROOT: h.arc }).errors)
        .toEqual([`boot.a SOCOM_PC_ROOT:${REL}: missing`]);
      h.put(h.arc, REL, pngOf(30, 640, 448));
      expect(checkCaptures(m30(), { SOCOM_PC_ROOT: h.pc }).errors).toEqual([`boot.a SOCOM_PC_ROOT:${REL}: missing`]);
    } finally { h.done(); }
  });

  it('a capture present under SOCOM_PC_ROOT is read there, never from the archive', () => {
    const h = hosts();
    try {
      h.put(h.pc, REL, pngOf(30, 640, 448));
      h.put(h.arc, REL, pngOf(32, 320, 224));
      expect(checkCaptures(m30(), { SOCOM_PC_ROOT: h.pc }, undefined, { SOCOM_PC_ROOT: h.arc }).errors).toEqual([]);
      h.put(h.pc, REL, pngOf(33, 640, 448));
      h.put(h.arc, REL, pngOf(30, 640, 448));
      expect(checkCaptures(m30(), { SOCOM_PC_ROOT: h.pc }, undefined, { SOCOM_PC_ROOT: h.arc }).errors.join('\n'))
        .toMatch(/bytes 33, recorded 30/);
    } finally { h.done(); }
  });

  it('a capture rooted at SOCOM_PARITY_ARCHIVE is read under that root alone, as before', () => {
    const h = hosts();
    try {
      const m = m30();
      m.rows[0]!.captures[0] = { ...m.rows[0]!.captures[0]!, root: 'SOCOM_PARITY_ARCHIVE', path: 'golden/s00.png' };
      h.put(h.arc, 'golden/s00.png', pngOf(30, 640, 448));
      expect(checkCaptures(m, { SOCOM_PARITY_ARCHIVE: h.pc }, undefined, { SOCOM_PC_ROOT: h.arc }).errors)
        .toEqual(['boot.a SOCOM_PARITY_ARCHIVE:golden/s00.png: missing']);
      expect(checkCaptures(m, {}, undefined, { SOCOM_PC_ROOT: h.arc })).toEqual(
        { checked: 0, skipped: ['SOCOM_PARITY_ARCHIVE:golden/s00.png'], errors: [] });
    } finally { h.done(); }
  });
});

const ROOTS = presentRoots(process.env);
describe.skipIf(Object.keys(ROOTS).length === 0)('every named capture on the dev host (SOCOM_PC_ROOT / SOCOM_PARITY_ARCHIVE)', () => {
  it('exists with the recorded byte count and pixel size', () => {
    const r = checkCaptures(manifest(), ROOTS, undefined, pcArchiveRoot(process.env));
    expect(r.errors).toEqual([]);
    expect(r.checked).toBeGreaterThan(0);
  });
});
