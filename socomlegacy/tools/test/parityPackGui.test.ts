import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BUILD_CARDS } from '../eph/build';
import { PAD_LAYOUTS } from '../eph/live';
import { STATUS_PREFIX, findOnPath, parseRunArgs } from '../eph/run';
import { CARD_FILES, EPH_STATUS_PREFIX, EXPECTED_ELF_CRC, GUI_PORT, PACK_CHORDS, PACK_PATHS, PAD_LAYOUT_NAMES, PAD_PRESETS, SITE_PORT, STATE_SLOTS } from '../parity-pack/gui/layout';
import { createPreparer } from '../parity-pack/gui/prepare';
import { SaveRefused, save, saveEntries, zipPathFor, type ZipEntry } from '../parity-pack/gui/save';
import { startGui, phaseWords, type GuiDeps } from '../parity-pack/gui/server';
import { HarnessSession, newestRunDirIn, sessionArgs, sessionEnv, type SessionChild, type SessionSpec } from '../parity-pack/gui/session';
import { canPlay, checklist, elfCrc, findBrowser, keyTable, withBios, type ChecklistFacts } from '../parity-pack/gui/state';
import { systemFacts } from '../parity-pack/gui/system';
import { createSiteServer } from '../siteServer';

/**
 * PK-5: the parity pack's GUI (product track, an adaptation; docs/specs/2026-11-03-parity-pack-design.md 5). Fakes only:
 * a scripted child for the harness, a fake extractor and zip writer, temp folders; the server on an ephemeral port.
 */

const GOOD: ChecklistFacts = {
  isos: [{ name: 'SOCOM2.iso', size: 3.2 * 1024 ** 3 }], elfCrc: EXPECTED_ELF_CRC, biosFiles: ['scph39001.bin'],
  mapsIndexExists: true, ffmpegFound: true, browser: { channel: 'msedge', name: 'Edge' }, padSeen: true,
};

describe('the constants agree with the harness', () => {
  it('ports, CRC, slots, cards, layouts and the status prefix', () => {
    expect([GUI_PORT, SITE_PORT, EXPECTED_ELF_CRC]).toEqual([5390, 5391, '0F6FC6CF']);
    expect(STATE_SLOTS).toEqual({ r0004: 5, r0001: 8 });
    expect(CARD_FILES).toEqual({ r0004: BUILD_CARDS.r0004, r0001: BUILD_CARDS.r0001 });
    expect([...PAD_LAYOUT_NAMES].sort()).toEqual(Object.keys(PAD_LAYOUTS).sort());
    // PK-8: the chords the GUI offers parse as EPH's --chord.
    for (const c of PACK_CHORDS) expect(parseRunArgs(['--live', '--map', 'M51', '--chord', c]).chordModifier).toBe(c);
    expect(EPH_STATUS_PREFIX).toBe(STATUS_PREFIX);
    expect(PACK_PATHS.bios).toBe('pack/run/pcsx2/bios');
    expect(PACK_PATHS.desktopStub).toBe('pack/harness/desktop-stub');
  });
});

describe('the checklist (pure)', () => {
  it('all green: six lines in order, Play allowed', () => {
    const l = checklist(GOOD);
    expect(l.map((x) => x.id)).toEqual(['image', 'bios', 'maps', 'ffmpeg', 'browser', 'pad']);
    expect(l.every((x) => x.ok)).toBe(true);
    expect(l[0]!.text).toBe('the disc image: SOCOM2.iso (3.2 GB), the US retail SOCOM II');
    expect(l[4]!.text).toBe('the page runs in your Edge');
    expect(canPlay(l)).toBe(true);
  });

  it('the image: none, two, the wrong CRC', () => {
    expect(checklist({ ...GOOD, isos: [] })[0]!.text).toBe('put your SOCOM II disc image (.iso) in drop-here');
    expect(checklist({ ...GOOD, isos: [GOOD.isos[0]!, GOOD.isos[0]!] })[0]!.text).toBe('one image only in drop-here: found 2');
    const wrong = checklist({ ...GOOD, elfCrc: 'DEADBEEF' });
    expect(wrong[0]!.text).toBe('this is not the US retail SOCOM II image the harness is built for');
    expect(canPlay(wrong)).toBe(false);
    expect(checklist({ ...GOOD, elfCrc: null })[0]!.level).toBe('warn');
    expect(checklist({ ...GOOD, elfCrc: '0f6fc6cf' })[0]!.ok).toBe(true);
  });

  it('the BIOS, the maps, ffmpeg, the browser; the pad only warns', () => {
    expect(checklist({ ...GOOD, biosFiles: [] })[1]!.text).toBe('put your PS2 BIOS dump (.bin) in drop-here\\bios');
    expect(checklist({ ...GOOD, biosFiles: ['b.bin', 'a.bin'] })[1]!.text).toBe('the PS2 BIOS: a.bin (the first of 2)');
    // PK.R6: a pack built --with-bios is green with nothing dropped in; a dropped BIOS is used instead of the shipped one.
    const shipped = checklist({ ...GOOD, biosFiles: [], shippedBios: ['ps2-0200a.bin'] })[1]!;
    expect(shipped.ok).toBe(true);
    expect(shipped.text).toBe('the PS2 BIOS: ps2-0200a.bin (included in the pack)');
    expect(checklist({ ...GOOD, biosFiles: ['mine.bin'], shippedBios: ['ps2-0200a.bin'] })[1]!.text).toBe('the PS2 BIOS: mine.bin');
    expect(checklist({ ...GOOD, mapsIndexExists: false })[2]!.ok).toBe(false);
    const prep = checklist({ ...GOOD, mapsIndexExists: false, preparing: { done: 3, total: 40 } })[2]!;
    expect([prep.text, prep.level]).toEqual(['preparing the maps: 3 of 40', 'warn']);
    expect(canPlay(checklist({ ...GOOD, ffmpegFound: false }))).toBe(false);
    expect(checklist({ ...GOOD, browser: null })[4]!.text).toBe('no Edge, Chrome or bundled browser');
    const noPad = checklist({ ...GOOD, padSeen: false });
    expect(noPad[5]!.level).toBe('warn');
    expect(canPlay(noPad)).toBe(true);
    expect(canPlay(checklist({ ...GOOD, padSeen: null }))).toBe(true);
  });

  it('PK-8: the pad line names the pad and its mapping; a mapping that is not the standard one is amber', () => {
    const std = checklist({ ...GOOD, padId: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', padMapping: 'standard' })[5]!;
    expect([std.ok, std.level, std.text]).toEqual([true, 'ok', 'pad seen: DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6) (standard mapping)']);
    const odd = checklist({ ...GOOD, padId: 'Generic USB Joystick', padMapping: '' })[5]!;
    expect([odd.level, odd.text]).toEqual(['warn', 'pad seen: Generic USB Joystick -- its mapping is not the standard one; the buttons may not line up']);
    expect(canPlay(checklist({ ...GOOD, padId: 'Generic USB Joystick', padMapping: '' }))).toBe(true);
    expect(checklist(GOOD)[5]!.text).toBe('a pad is connected');
  });

  it('findBrowser: Edge, else Chrome, else the bundled one, else none', () => {
    const env = { 'ProgramFiles(x86)': 'C:\\PF86', ProgramFiles: 'C:\\PF' };
    const has = (...ps: string[]) => (p: string) => ps.includes(p);
    expect(findBrowser(env, has('C:/PF86/Microsoft/Edge/Application/msedge.exe'), 'D:/pack')).toEqual({ channel: 'msedge', name: 'Edge' });
    expect(findBrowser(env, has('C:/PF/Google/Chrome/Application/chrome.exe'), 'D:/pack')).toEqual({ channel: 'chrome', name: 'Chrome' });
    expect(findBrowser(env, has('D:/pack/pack/runtime/ms-playwright'), 'D:/pack')).toEqual({ channel: null, name: 'the bundled browser', browsersPath: 'D:/pack/pack/runtime/ms-playwright' });
    expect(findBrowser(env, has(), 'D:/pack')).toBe(null);
  });
});

describe('withBios and elfCrc', () => {
  it('replaces the key in [Filenames], adds it at the section end, or adds the section; line ends kept', () => {
    expect(withBios('[UI]\r\nX = 1\r\n[Filenames]\r\nBIOS = old.bin\r\nOther = 2\r\n', 'new.bin')).toBe('[UI]\r\nX = 1\r\n[Filenames]\r\nBIOS = new.bin\r\nOther = 2\r\n');
    expect(withBios('[Filenames]\nOther = 2\n\n[UI]\nX = 1\n', 'b.bin')).toBe('[Filenames]\nOther = 2\nBIOS = b.bin\n\n[UI]\nX = 1\n');
    expect(withBios('[UI]\nX = 1\n', 'b.bin')).toBe('[UI]\nX = 1\n\n[Filenames]\nBIOS = b.bin\n');
    expect(withBios('[UI]\nBIOS = keep\n', 'b.bin')).toBe('[UI]\nBIOS = keep\n\n[Filenames]\nBIOS = b.bin\n');
    expect(() => withBios('', 'a\nb')).toThrow();
  });

  it('elfCrc: the XOR of the little-endian words; a trailing partial word not read', () => {
    expect(elfCrc(new Uint8Array([0x11, 0x11, 0x11, 0x11, 0x22, 0x22, 0x22, 0x22]))).toBe('33333333');
    expect(elfCrc(new Uint8Array([0x01, 0x02, 0x03, 0x04]))).toBe('04030201');
    expect(elfCrc(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x0f, 0, 0, 0, 0xaa]))).toBe('FFFFFFF0');
    expect(elfCrc(new Uint8Array(0))).toBe('00000000');
  });

  it('the key table: every [Pad1] button and its key, then the pause key', () => {
    const t = keyTable();
    expect(t).toContainEqual({ button: 'Cross', key: 'K' });
    expect(t).toContainEqual({ button: 'Triangle', key: 'I' });
    expect(t).toContainEqual({ button: 'Start', key: 'Enter' });
    expect(t).toContainEqual({ button: 'D-pad up', key: 'Up arrow' });
    expect(t).toContainEqual({ button: 'Left stick up', key: 'W' });
    expect(t[t.length - 1]).toEqual({ button: 'Pause PCSX2', key: 'Space' });
    expect(t.length).toBe(25);
  });
});

/** A scripted child: what stdin received, and stdout/stderr to write to. */
function fakeChild(onLine: (line: string, c: FakeChild) => void = () => {}): FakeChild {
  const ev = new EventEmitter();
  const got: string[] = [];
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const c: FakeChild = {
    pid: 4242, stdout, stderr, got,
    stdin: { write: (s: string) => { for (const l of s.split('\n').filter(Boolean)) { got.push(l); onLine(l, c); } return true; }, end: () => { got.push('<end>'); } },
    once: (e: string, cb: (...a: any[]) => void) => { ev.once(e, cb); return c; },
    close: (code: number) => { stdout.end(); stderr.end(); setTimeout(() => ev.emit('close', code, null), 20); },
  } as FakeChild;
  return c;
}
type FakeChild = SessionChild & { got: string[]; stdout: PassThrough; stderr: PassThrough; close(code: number): void };

const SPEC: SessionSpec = {
  kind: 'live', packRoot: 'D:/P', nodePath: 'D:/P/pack/runtime/node.exe', harnessEntry: 'D:/P/pack/harness/harness.mjs', build: 'r0004',
  layout: 'machete', chord: 'l2', chordSolo: false, siteUrl: 'http://127.0.0.1:5391/', iso: 'D:\\P\\drop-here\\SOCOM2.iso', browser: { channel: 'msedge', name: 'Edge' }, pageSha: 'abc1234',
};
const flush = () => new Promise((r) => setTimeout(r, 30));
/** The next change of `s` (a status taken, a log line, the exit). */
const nextChange = (s: HarnessSession) => new Promise<void>((ok) => { const off = s.onChange(() => { off(); ok(); }); });

describe('the session child', () => {
  it('the live command line parses as EPH reads it: live, M51, the build\'s slot, the site, l2, the layout, stdio', () => {
    const a = sessionArgs(SPEC);
    expect(a).toEqual(['run', '--live', '--map', 'M51', '--state', '5', '--build', 'r0004', '--base', 'http://127.0.0.1:5391/', '--chord', 'l2', '--pad-layout', 'machete', '--control', 'stdio']);
    const p = parseRunArgs(a.slice(1));
    expect([p.live, p.map, p.state, p.build, p.base, p.chordModifier, p.padLayout, p.control]).toEqual([true, 'M51', 5, 'r0004', 'http://127.0.0.1:5391/', 'l2', 'machete', 'stdio']);
    const m = sessionArgs({ ...SPEC, kind: 'mark', build: 'r0001' });
    expect(m).toEqual(['run', '--mark-state', '8', '--build', 'r0001', '--control', 'stdio']);
    expect(parseRunArgs(m.slice(1)).markState).toBe(8);
  });

  it("PK-8: the pad presets, and Machete's on the command line as --chord touchpad --chord-solo", () => {
    expect(PAD_PRESETS.standard).toMatchObject({ layout: 'standard', chord: 'l2', chordSolo: false });
    expect(PAD_PRESETS.machete).toMatchObject({ layout: 'machete', chord: 'touchpad', chordSolo: true });
    expect(PAD_PRESETS.machete.words).toBe("Machete's: Select on Create, Start on PS, Circle on Options, R3 on the Circle button; the touchpad alone or with Triangle is the light press");
    const m = PAD_PRESETS.machete;
    const a = sessionArgs({ ...SPEC, layout: m.layout, chord: m.chord, chordSolo: m.chordSolo });
    expect(a).toEqual(['run', '--live', '--map', 'M51', '--state', '5', '--build', 'r0004', '--base', 'http://127.0.0.1:5391/', '--chord', 'touchpad', '--chord-solo', '--pad-layout', 'machete', '--control', 'stdio']);
    const p = parseRunArgs(a.slice(1));
    expect([p.chordModifier, p.chordSolo, p.padLayout]).toEqual(['touchpad', true, 'machete']);
  });

  it('the env: the pack, its run dir, the stub, the image, the browser, the page build, PATH with the runtime first', () => {
    const e = sessionEnv(SPEC, { Path: 'C:\\Windows', EPH_BROWSER_CHANNEL: 'chrome', PLAYWRIGHT_BROWSERS_PATH: 'x', KEEP: '1' }, 'win32');
    expect(e).toMatchObject({
      EPH_PACK: 'D:/P', EPH_RUN_DIR: 'D:/P/pack/run', SOCOM_PC_ROOT: 'D:/P/pack/harness/desktop-stub', SOCOM_ISO: 'D:/P/drop-here/SOCOM2.iso',
      EPH_BROWSER_CHANNEL: 'msedge', EPH_PAGE_BUILD: 'abc1234', PATH: 'D:/P/pack/runtime;C:\\Windows', KEEP: '1',
    });
    expect(e.Path).toBeUndefined();
    expect(e.PLAYWRIGHT_BROWSERS_PATH).toBeUndefined();
    const b = sessionEnv({ ...SPEC, browser: { channel: null, name: 'the bundled browser', browsersPath: 'D:/P/pack/runtime/ms-playwright' } }, {}, 'win32');
    expect(b.EPH_BROWSER_CHANNEL).toBeUndefined();
    expect(b.PLAYWRIGHT_BROWSERS_PATH).toBe('D:/P/pack/runtime/ms-playwright');
  });

  it('spawns node with the entry, parses status lines, keeps stderr as the log, writes commands, resolves at exit', async () => {
    const spawned: { cmd: string; args: string[]; env: Record<string, string> }[] = [];
    let child!: FakeChild;
    const s = new HarnessSession(SPEC, {
      env: { PATH: '/bin' }, platform: 'win32', killTree: () => {}, now: () => new Date(0),
      spawn: (cmd, args, o) => { spawned.push({ cmd, args, env: o.env }); child = fakeChild(); return child; },
    });
    s.start();
    expect(spawned[0]!.cmd).toBe(SPEC.nodePath);
    expect(spawned[0]!.args[0]).toBe(SPEC.harnessEntry);
    expect(spawned[0]!.args.slice(1)).toEqual(sessionArgs(SPEC));
    expect(s.view().phase).toBe('starting');
    child.stdout.write(`${STATUS_PREFIX}{"phase":"live","paused":false,"recording":true,"clip":2,"clips":2,"activeMs":41000,"line":"x"}\n`);
    child.stderr.write('EPH run: build detected r0004\n');
    await flush();
    expect(s.view()).toMatchObject({ phase: 'live', recording: true, clip: 2, clips: 2, activeMs: 41000, lines: ['EPH run: build detected r0004'] });
    s.pause(); s.resume(); s.record(false);
    const ended = s.end();
    expect(child.got).toEqual(['{"cmd":"pause"}', '{"cmd":"resume"}', '{"cmd":"record","on":false}', '{"cmd":"end"}', '<end>']);
    child.stderr.write('EPH run (complete (live session ended by Save)) written to D:/P/pack/run/runs/20261103T101010Z\n');
    child.close(0);
    expect(await ended).toEqual({ code: 0, runDir: 'D:/P/pack/run/runs/20261103T101010Z' });
    expect(s.view().phase).toBe('ended');
  });

  it('PR #648 P2: the clock advances between the statuses while live, frozen while paused and after the exit', async () => {
    let t = 1_000_000;
    let child!: FakeChild;
    const s = new HarnessSession(SPEC, { env: {}, platform: 'win32', killTree: () => {}, now: () => new Date(t), spawn: () => { child = fakeChild(); return child; } });
    s.start();
    t += 5000;
    expect(s.view().activeMs).toBe(0); // no status yet: nothing to advance from
    let taken = nextChange(s);
    child.stdout.write(`${STATUS_PREFIX}{"phase":"live","paused":false,"recording":true,"clip":1,"clips":1,"activeMs":41000}\n`);
    await taken;
    expect(s.view().activeMs).toBe(41000);
    t += 2500;
    expect(s.view().activeMs).toBe(43500); // an uninterrupted clip: the clock runs between statuses
    taken = nextChange(s);
    child.stdout.write(`${STATUS_PREFIX}{"phase":"live","paused":true,"activeMs":43500}\n`);
    await taken;
    t += 9000;
    expect(s.view().activeMs).toBe(43500); // frozen while paused, as the harness's own clock is
    taken = nextChange(s);
    child.stdout.write(`${STATUS_PREFIX}{"phase":"live","paused":false,"activeMs":43500}\n`);
    await taken;
    t += 1000;
    expect(s.view().activeMs).toBe(44500);
    const ended = s.end();
    child.close(0);
    await ended;
    t += 60_000;
    expect(s.view().activeMs).toBe(43500); // ended: the clock stops at the child's last reported value (its own final status)
  });

  it('keeps the last 200 log lines; a failed run names its refusal and offers the repair on "no player actor"', async () => {
    let child!: FakeChild;
    const s = new HarnessSession(SPEC, { env: {}, killTree: () => {}, spawn: () => (child = fakeChild()) });
    s.start();
    for (let i = 0; i < 250; i++) child.stderr.write(`line ${i}\n`);
    child.stderr.write('EPH run: no player actor: is --state set?\n');
    child.close(1);
    await s.ended;
    const v = s.view();
    expect(v.lines.length).toBe(200);
    expect(v.repair).toBe(true);
    expect(v.refusal).toBe('EPH run: no player actor: is --state set?');
    expect(phaseWords('live', 'ended', v.refusal)).toBe('the session stopped: EPH run: no player actor: is --state set?');
  });

  it('end kills the PID tree when the child does not end within the grace', async () => {
    const killed: number[] = [];
    let child!: FakeChild;
    const s = new HarnessSession(SPEC, { env: {}, graceMs: 30, killTree: (pid) => { killed.push(pid); child.close(137); }, spawn: () => (child = fakeChild()) });
    s.start();
    const e = await s.end();
    expect(killed).toEqual([4242]);
    expect(e.code).toBe(137);
  });

  it('the newest run dir stamped since the start', () => {
    const since = new Date('2026-11-03T10:10:10Z');
    expect(newestRunDirIn('D:/r/', ['20261103T100000Z', '20261103T101009Z', '20261103T101500Z', 'junk'], since)).toBe('D:/r/20261103T101500Z');
    expect(newestRunDirIn('D:/r', ['20261103T100000Z'], since)).toBe(null);
  });
});

describe('save', () => {
  let base = '';
  beforeAll(() => { base = mkdtempSync(join(tmpdir(), 's2u-pksave-')); });
  afterAll(() => rmSync(base, { recursive: true, force: true }));
  const SYS = { windows: { release: '10.0.26200', version: 'Windows 11 Home' }, cpu: { model: 'CPU', count: 8 }, memoryBytes: 1, gpu: 'GPU', node: 'v22' };

  it('the entries: the four top files, then the run dir under runs/<stamp>/', () => {
    const e = saveEntries('D:/r/runs/20261103T101010Z', ['clip-1.mp4', 'notes.txt', 'record.json', 'system.json'], { emulog: 'D:/e.txt', versionPath: 'D:/V.json' });
    expect(e.map((x) => x.name)).toEqual(['notes.txt', 'system.json', 'pcsx2-emulog.txt', 'VERSION.json', 'runs/20261103T101010Z/clip-1.mp4', 'runs/20261103T101010Z/record.json']);
    expect(saveEntries('D:/r/x', [], { emulog: null, versionPath: null }).map((x) => x.name)).toEqual(['notes.txt', 'system.json']);
    expect(zipPathFor('D:/h/', 's', (p) => p === 'D:/h/parity-s.zip')).toBe('D:/h/parity-s-2.zip');
  });

  it('writes notes.txt and system.json, zips through the writer, returns the path and size', async () => {
    const run = join(base, 'run', 'runs', '20261103T101010Z');
    mkdirSync(join(run, 'sub'), { recursive: true });
    writeFileSync(join(run, 'record.json'), '{}');
    writeFileSync(join(run, 'sub', 'pcsx2.csv'), 'a');
    writeFileSync(join(base, 'emulog.txt'), 'log');
    writeFileSync(join(base, 'VERSION.json'), '{}');
    let seen: { out: string; entries: ZipEntry[] } | null = null;
    const out = await save({
      runDir: run, notes: 'one\ntwo', system: SYS, session: { browser: 'Edge' }, versionPath: join(base, 'VERSION.json'), version: { pageTag: 't' },
      emulog: join(base, 'emulog.txt'), handoffDir: join(base, 'handoff'), now: new Date(0),
      writeZipFile: async (o, entries) => { seen = { out: o, entries }; return { bytes: 123, entries: entries.length }; },
    });
    expect(out.path).toMatch(/handoff\/parity-20261103T101010Z\.zip$/);
    expect(out.bytes).toBe(123);
    expect(existsSync(join(base, 'handoff'))).toBe(true);
    expect(seen!.entries.map((x) => x.name)).toEqual(['notes.txt', 'system.json', 'pcsx2-emulog.txt', 'VERSION.json', 'runs/20261103T101010Z/record.json', 'runs/20261103T101010Z/sub/pcsx2.csv']);
    expect(readFileSync(join(run, 'notes.txt'), 'utf8')).toBe('one\r\ntwo\r\n');
    expect(JSON.parse(readFileSync(join(run, 'system.json'), 'utf8'))).toMatchObject({ gpu: 'GPU', browser: 'Edge', version: { pageTag: 't' } });
  });

  it('a writer refusal is passed on in its words with the run dir named; a missing run dir refused', async () => {
    const run = join(base, 'run', 'runs', '20261103T111111Z');
    mkdirSync(run, { recursive: true });
    const r = save({
      runDir: run, notes: '', system: SYS, session: {}, versionPath: 'none', version: null, emulog: 'none', handoffDir: join(base, 'handoff'), now: new Date(0),
      writeZipFile: async () => { throw new Error('the zip would pass 4 GB (ZIP64 is not written)'); },
    });
    await expect(r).rejects.toBeInstanceOf(SaveRefused);
    await expect(r).rejects.toThrow(/^the zip would pass 4 GB \(ZIP64 is not written\) -- the session is kept in .*20261103T111111Z$/);
    await expect(save({ runDir: join(base, 'none'), notes: '', system: SYS, session: {}, versionPath: '', version: null, emulog: '', handoffDir: base, now: new Date(0), writeZipFile: async () => ({ bytes: 0, entries: 0 }) }))
      .rejects.toThrow(/record was not found/);
  });

  it('systemFacts: the GPU unknown on a failure, never fatal', async () => {
    const d = { release: () => '10.0', version: () => 'Win', cpus: () => [{ model: ' X ' }, { model: 'X' }], totalmem: () => 8, nodeVersion: 'v22.1.0' };
    expect(await systemFacts({ ...d, gpuNames: async () => 'NVIDIA A\r\nIntel B\r\n' })).toEqual({ windows: { release: '10.0', version: 'Win' }, cpu: { model: 'X', count: 2 }, memoryBytes: 8, gpu: 'NVIDIA A; Intel B', node: 'v22.1.0' });
    expect((await systemFacts({ ...d, gpuNames: async () => { throw new Error('no powershell'); } })).gpu).toBe('unknown');
    expect((await systemFacts({ ...d, gpuNames: async () => '  ' })).gpu).toBe('unknown');
  });
});

describe('the GUI server (real HTTP on an ephemeral port, fakes behind it)', () => {
  let root = '';
  let gui: Awaited<ReturnType<typeof startGui>>;
  const children: FakeChild[] = [];
  const spawnedArgs: string[][] = [];
  const zips: ZipEntry[][] = [];
  const opened: string[] = [];
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => new Promise<{ status: number; json: any; text: string }>((ok, fail) => {
    const u = new URL(gui.url);
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ host: u.hostname, port: Number(u.port), path, method, headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let json: any = null; try { json = JSON.parse(text); } catch { /* text */ } ok({ status: res.statusCode ?? 0, json, text }); });
    });
    req.on('error', fail);
    req.end(data);
  });
  /** Child n writes its record to its own stamp (child 0's is 20261103T101010Z). */
  const runDir = (n = 0) => `${root.replace(/\\/g, '/')}/pack/run/runs/20261103T1010${10 + n}Z`;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 's2u-pkgui-'));
    const mk = (rel: string, text: string) => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), text); };
    mk('drop-here/SOCOM2.iso', 'iso');
    mk('drop-here/bios/scph.bin', 'bios');
    mk('drop-here/bios/scph.nvm', 'nvm');
    mk('drop-here/bios/PUT-YOUR-BIOS-HERE.txt', 'x');
    mk('pack/run/pcsx2/inis/PCSX2.ini', '[UI]\r\nX = 1\r\n');
    mk('pack/VERSION.json', JSON.stringify({ pack: 'SOCOM-Parity-Harness-20261103', packStamp: '20261103T0900Z', pageSha: 'abc1234', pageTag: 'v0.3.40', pcsx2Version: '2.8.2', builderCommit: 'def' }));
    mk('pack/maps/index.json', '{}');
    mk('pack/site/index.html', 'site');
    mk('gui/index.html', '<title>gui</title>');
    mk('PF/Microsoft/Edge/Application/msedge.exe', '');
    const deps: GuiDeps = {
      packRoot: root, guiDir: join(root, 'gui'), harnessEntry: 'H.mjs', nodePath: 'N.exe', platform: 'win32',
      env: { ProgramFiles: join(root, 'PF'), PATH: '/bin' },
      findOnPath: (name) => (name === 'ffmpeg' ? 'X/ffmpeg.exe' : null),
      readElfCrc: async () => EXPECTED_ELF_CRC,
      spawn: (_cmd, args) => {
        const n = children.length;
        spawnedArgs.push(args);
        const c = fakeChild((line, self) => {
          if (line === '{"cmd":"end"}') {
            mkdirSync(runDir(n), { recursive: true });
            writeFileSync(`${runDir(n)}/record.json`, '{}');
            self.stderr.write(`EPH run (complete (live session ended by Save)) written to ${runDir(n)}\n`);
            self.close(0);
          }
        });
        children.push(c);
        return c;
      },
      killTree: () => {},
      preparer: createPreparer(async () => { throw new Error('not called'); }),
      writeZipFile: async (_o, entries) => { zips.push(entries); return { bytes: 99, entries: entries.length }; },
      systemFacts: async () => ({ windows: { release: 'r', version: 'v' }, cpu: { model: 'c', count: 1 }, memoryBytes: 1, gpu: 'g', node: 'n' }),
      openFolder: (p) => opened.push(p),
      startSite: (o) => createSiteServer({ ...o, port: 0 }),
      log: () => {},
    };
    gui = await startGui(deps, { port: 0, sitePort: 0 });
  });
  afterAll(async () => {
    await gui.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('serves the page and /api/status: the checklist, settings, no session, the pack', async () => {
    expect((await call('GET', '/')).text).toBe('<title>gui</title>');
    await flush();
    const s = (await call('GET', '/api/status')).json;
    expect(s.checklist.map((l: { ok: boolean }) => l.ok)).toEqual([true, true, true, true, true, false]);
    expect(s.canPlay).toBe(true);
    expect(s.settings).toEqual({ build: 'r0004', layout: 'standard', chord: 'l2', chordSolo: false, notes: '' });
    expect(s.padPresets.map((x: { name: string }) => x.name)).toEqual(['standard', 'machete']);
    expect([s.unsaved, s.resetting]).toEqual([null, false]);
    expect(s.session.phase).toBe('idle');
    expect(s.saved).toBe(null);
    expect(s.pack).toEqual({ name: 'SOCOM-Parity-Harness-20261103', pageTag: 'v0.3.40', pageSha: 'abc1234', build: 'r0004' });
    expect(s.keys.length).toBe(25);
  });

  it('refuses: a wrong Host 421, a form 415, a foreign Origin 403, a command with nothing to act on 409 in one sentence', async () => {
    expect((await call('GET', '/api/status', undefined, { host: 'evil.example:80' })).status).toBe(421);
    expect((await call('POST', '/api/pause', undefined, { 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(415);
    expect((await call('POST', '/api/pause', {}, { origin: 'http://evil.example' })).status).toBe(403);
    const r = await call('POST', '/api/pause', {});
    expect([r.status, r.json.error]).toEqual([409, 'nothing is playing']);
    expect((await call('POST', '/api/settings', { build: 'r0002' })).json.error).toBe('the build is r0004 or r0001');
    expect((await call('POST', '/api/nope', {})).status).toBe(404);
  });

  it('settings, then Play: the BIOS copied and named in the ini, the session spawned at the site', async () => {
    expect((await call('POST', '/api/settings', { layout: 'machete', notes: 'felt slow' })).json.result).toEqual({ build: 'r0004', layout: 'machete', chord: 'l2', chordSolo: false, notes: 'felt slow' });
    expect((await call('POST', '/api/pad', { seen: true })).status).toBe(200);
    const r = await call('POST', '/api/play', {});
    expect(r.status).toBe(200);
    expect(children.length).toBe(1);
    expect(readFileSync(join(root, 'pack/run/pcsx2/bios/scph.bin'), 'utf8')).toBe('bios');
    expect(existsSync(join(root, 'pack/run/pcsx2/bios/scph.nvm'))).toBe(true);
    expect(existsSync(join(root, 'pack/run/pcsx2/bios/PUT-YOUR-BIOS-HERE.txt'))).toBe(false);
    expect(readFileSync(join(root, 'pack/run/pcsx2/inis/PCSX2.ini'), 'utf8')).toBe('[UI]\r\nX = 1\r\n\r\n[Filenames]\r\nBIOS = scph.bin\r\n');
    for (const rel of ['pack/run/runs', 'pack/logs', 'handoff']) expect(existsSync(join(root, rel)), rel).toBe(true);
    children[0]!.stdout.write(`${STATUS_PREFIX}{"phase":"live","paused":false,"recording":false,"clip":null,"clips":0,"activeMs":1000}\n`);
    await flush();
    const s = (await call('GET', '/api/status')).json;
    expect(s.checklist[5].ok).toBe(true);
    expect([s.session.phase, s.session.words, s.session.active]).toEqual(['live', 'playing', true]);
    expect((await call('POST', '/api/play', {})).json.error).toBe('the session is playing already');
    expect((await call('POST', '/api/boot', {})).status).toBe(409);
  });

  it('pause, record, play (resume) go to the child as JSON lines', async () => {
    expect((await call('POST', '/api/pause', {})).status).toBe(200);
    children[0]!.stdout.write(`${STATUS_PREFIX}{"phase":"paused","paused":true}\n`);
    await flush();
    expect((await call('POST', '/api/play', {})).json.result).toEqual({ resumed: true });
    expect((await call('POST', '/api/record', { on: true })).status).toBe(200);
    expect((await call('POST', '/api/record', {})).json.error).toBe('say on or off');
    expect(children[0]!.got).toEqual(['{"cmd":"pause"}', '{"cmd":"resume"}', '{"cmd":"record","on":true}']);
  });

  it('save ends the session, waits for its record, zips it and answers the path', async () => {
    const r = await call('POST', '/api/save', {});
    expect(r.status).toBe(200);
    expect(r.json.result.path).toMatch(/\/handoff\/parity-20261103T101010Z\.zip$/);
    expect(r.json.result.bytes).toBe(99);
    expect(children[0]!.got.slice(-2)).toEqual(['{"cmd":"end"}', '<end>']);
    expect(zips[0]!.map((e) => e.name)).toEqual(['notes.txt', 'system.json', 'VERSION.json', 'runs/20261103T101010Z/record.json']);
    expect(readFileSync(`${runDir()}/notes.txt`, 'utf8')).toBe('felt slow\r\n');
    const s = (await call('GET', '/api/status')).json;
    expect(s.saved.path).toBe(r.json.result.path);
    expect(s.session.phase).toBe('ended');
    expect((await call('POST', '/api/save', {})).json.error).toBe('there is no session to save: press Play first');
    expect((await call('POST', '/api/open-folder', {})).status).toBe(200);
    expect(opened[0]).toMatch(/\/handoff$/);
  });

  it('the mark flow: boot starts --mark-state, mark sends mark', async () => {
    expect((await call('POST', '/api/mark', {})).json.error).toBe('press Boot the original first');
    expect((await call('POST', '/api/boot', {})).status).toBe(200);
    expect(children.length).toBe(2);
    expect((await call('POST', '/api/mark', {})).status).toBe(200);
    expect(children[1]!.got).toEqual(['{"cmd":"mark"}']);
    expect((await call('POST', '/api/play', {})).status).toBe(409);
    children[1]!.close(0);
    await flush();
  });

  it('PK-8: stop and reset are refused in one sentence when nothing is playing', async () => {
    const st = await call('POST', '/api/stop', {});
    expect([st.status, st.json.error]).toEqual([409, 'nothing is playing']);
    const rs = await call('POST', '/api/reset', {});
    expect([rs.status, rs.json.error]).toEqual([409, 'nothing is playing']);
  });

  it("PK-8: the pad preset sets the layout and the chord; the pad's id and mapping reach the pad line", async () => {
    expect((await call('POST', '/api/settings', { preset: 'machete' })).json.result).toMatchObject({ layout: 'machete', chord: 'touchpad', chordSolo: true });
    expect((await call('POST', '/api/settings', { preset: 'nope' })).json.error).toBe('the pad preset is standard or machete');
    expect((await call('POST', '/api/settings', { chord: 'r9' })).json.error).toBe('the chord is l2 or touchpad');
    expect((await call('POST', '/api/pad', { seen: true, id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', mapping: 'standard' })).status).toBe(200);
    const s = (await call('GET', '/api/status')).json;
    expect(s.checklist[5].text).toBe('pad seen: Xbox 360 Controller (XInput STANDARD GAMEPAD) (standard mapping)');
    await call('POST', '/api/pad', { seen: true, id: 'Odd pad', mapping: '' });
    expect((await call('GET', '/api/status')).json.checklist[5].level).toBe('warn');
  });

  it('PK-8: stop ends the session without a zip; Save then takes its run directory', async () => {
    const zipsBefore = zips.length;
    expect((await call('POST', '/api/play', {})).status).toBe(200);
    const c = children[children.length - 1]!;
    const n = children.length - 1;
    expect(spawnedArgs[n]).toContain('--chord-solo');
    expect(spawnedArgs[n]!.slice(spawnedArgs[n]!.indexOf('--chord'), spawnedArgs[n]!.indexOf('--chord') + 2)).toEqual(['--chord', 'touchpad']);
    c.stdout.write(`${STATUS_PREFIX}{"phase":"live","paused":false}\n`);
    await flush();
    const r = await call('POST', '/api/stop', {});
    expect(r.status).toBe(200);
    expect(c.got.slice(-2)).toEqual(['{"cmd":"end"}', '<end>']);
    expect(zips.length).toBe(zipsBefore);
    const s = (await call('GET', '/api/status')).json;
    expect([s.session.phase, s.session.active]).toEqual(['ended', false]);
    expect(s.notice).toBe('Stopped. Save keeps this session as a file, or Play starts a new one.');
    expect(s.unsaved).toBe(runDir(n));
    const sv = await call('POST', '/api/save', {});
    expect(sv.status).toBe(200);
    expect(zips[zips.length - 1]!.map((e) => e.name)).toContain(`runs/20261103T1010${10 + n}Z/record.json`);
    expect((await call('GET', '/api/status')).json.unsaved).toBe(null);
  });

  it('PK-8: reset ends the session, then spawns a new one with the same command line; the old run stays unsaved', async () => {
    expect((await call('POST', '/api/play', {})).status).toBe(200);
    const first = children.length - 1;
    children[first]!.stdout.write(`${STATUS_PREFIX}{"phase":"live","paused":false}\n`);
    await flush();
    const r = await call('POST', '/api/reset', {});
    expect(r.status).toBe(200);
    expect(children.length).toBe(first + 2);
    expect(children[first]!.got.slice(-2)).toEqual(['{"cmd":"end"}', '<end>']);
    expect(spawnedArgs[first + 1]).toEqual(spawnedArgs[first]);
    let s = (await call('GET', '/api/status')).json;
    expect([s.resetting, s.session.active, s.unsaved]).toEqual([true, true, runDir(first)]);
    children[first + 1]!.stdout.write(`${STATUS_PREFIX}{"phase":"live","paused":false}\n`);
    await flush();
    s = (await call('GET', '/api/status')).json;
    expect([s.resetting, s.session.phase]).toEqual([false, 'live']);
    // Save takes the session playing now (it ends it), not the one before the reset.
    const sv = await call('POST', '/api/save', {});
    expect(sv.json.result.path).toMatch(new RegExp(`parity-20261103T1010${10 + first + 1}Z\\.zip$`));
  });

  it('PR #648 P2: a session that ends on its own is saved with the settings it was launched with, not those changed after', async () => {
    expect((await call('POST', '/api/settings', { build: 'r0004', preset: 'machete' })).status).toBe(200);
    expect((await call('POST', '/api/play', {})).status).toBe(200);
    const n = children.length - 1;
    const c = children[n]!;
    c.stdout.write(`${STATUS_PREFIX}{"phase":"live","paused":false}\n`);
    await flush();
    // The page closes: the harness writes its record and exits by itself (no Stop, no Save).
    mkdirSync(runDir(n), { recursive: true });
    writeFileSync(`${runDir(n)}/record.json`, '{}');
    c.stderr.write(`EPH run (complete (page closed)) written to ${runDir(n)}\n`);
    c.close(0);
    await flush();
    let s = (await call('GET', '/api/status')).json;
    expect([s.session.active, s.unsaved]).toEqual([false, runDir(n)]);
    // The controls are open again; the tester changes the build and the pad for the next session before saving this one.
    expect((await call('POST', '/api/settings', { build: 'r0001', preset: 'standard' })).json.result).toMatchObject({ build: 'r0001', layout: 'standard', chord: 'l2', chordSolo: false });
    expect((await call('POST', '/api/save', {})).status).toBe(200);
    const sys = JSON.parse(readFileSync(`${runDir(n)}/system.json`, 'utf8'));
    expect(sys).toMatchObject({ build: 'r0004', stateSlot: STATE_SLOTS.r0004, padLayout: 'machete', chord: 'touchpad', chordSolo: true });
    s = (await call('GET', '/api/status')).json;
    expect([s.unsaved, s.settings.build, s.settings.layout]).toEqual([null, 'r0001', 'standard']);
  });

  it('PR #648 P2: server-sent events carry the running clock: a second status within the tick while a session plays', async () => {
    expect((await call('POST', '/api/play', {})).status).toBe(200);
    const c = children[children.length - 1]!;
    c.stdout.write(`${STATUS_PREFIX}{"phase":"live","paused":false,"activeMs":1000}\n`);
    await flush();
    const u = new URL(gui.url);
    const seen = await new Promise<number[]>((ok, fail) => {
      const got: number[] = [];
      const req = request({ host: u.hostname, port: Number(u.port), path: '/api/events' }, (res) => {
        res.on('data', (chunk) => {
          for (const line of String(chunk).split('\n')) if (line.startsWith('data: ')) got.push(JSON.parse(line.slice(6)).session.activeMs);
          if (got.length >= 2) { ok(got); req.destroy(); }
        });
      });
      req.on('error', fail);
      req.end();
      setTimeout(() => { ok(got); req.destroy(); }, 2500);
    });
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[1]!).toBeGreaterThan(seen[0]!);
    expect((await call('POST', '/api/stop', {})).status).toBe(200);
  });

  it('server-sent events: the status object first', async () => {
    const u = new URL(gui.url);
    const first = await new Promise<string>((ok, fail) => {
      const req = request({ host: u.hostname, port: Number(u.port), path: '/api/events' }, (res) => {
        expect(res.headers['content-type']).toBe('text/event-stream');
        res.once('data', (c) => { ok(String(c)); req.destroy(); });
      });
      req.on('error', fail);
      req.end();
    });
    expect(first.startsWith('data: ')).toBe(true);
    expect(JSON.parse(first.slice(6)).pack.pageTag).toBe('v0.3.40');
  });
});

describe('findOnPath (run.ts) is what the GUI uses for ffmpeg', () => {
  it('finds ffmpeg.exe in the runtime folder', () => {
    expect(findOnPath('ffmpeg', { PATH: 'D:\\P\\pack\\runtime;C:\\W' }, (p) => p === 'D:/P/pack/runtime/ffmpeg.exe', 'win32')).toBe('D:/P/pack/runtime/ffmpeg.exe');
  });
});
