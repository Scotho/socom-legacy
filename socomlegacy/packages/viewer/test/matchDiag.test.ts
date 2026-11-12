import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  contextDiagMessage, DIAG_MESSAGE_MAX, DIAG_PAD_ID_CHARS_ADAPTATION, DIAG_RING_ADAPTATION, DIAG_SAMPLE_MS_ADAPTATION, DiagRing, gameInputActive,
  INPUT_DIAG_AT_MS_ADAPTATION, inputDiagMessage, inputSummary, InputTrack, MatchDiag, xboxMarks, type DiagInfo, type DiagKind, type GameInputLike, type XboxMarks,
} from '../src/matchDiag';
import { readPageState } from '../src/matchDiagPage';
import { inputPhase, inputSources, installInputSources, noteInput, padHasInput, resetInputSourcesForTest, setInputPhase, type SourcesSnapshot } from '../src/inputSources';
import { BEACON_DIAGS_PER_LOAD_ADAPTATION, ClientErrorBeacon, installClientErrorBeacon, resetPageClientErrorBeaconForTest, setBeaconLossDiag } from '../src/clientErrorBeacon';
import { resetGraphicsRecordForTest, watchGraphicsLost } from '../src/graphicsLost';
import { LOAD_PHASES, loadPhaseReached, markLoad } from '../src/loadMarks';
import { noInput } from '../src/gamepad';
import type { DeviceSignals } from '../src/deviceClass';

/**
 * XBOX-DIAG (`../src/matchDiag`, `../src/matchDiagPage`, `../src/inputSources`; product track, an instrument): the two
 * diagnostic reports b0's field read asked for -- `contextdiag` at a lost context or device, `inputdiag` once a match on an
 * Xbox-marked page -- built whole under the beacon's message cap, from a ring the match's frames fill every 2 s from the
 * mount, and from the page's input counted by source, the menus apart from the match.
 */

const XBOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) Edg/130.0.2849.56';
const SRAKMD = 'ANGLE (Microsoft, SraKmd_arden (0x0000D000) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/130.0.2849.56';
const sig = (o: Partial<DeviceSignals>): DeviceSignals => ({ userAgent: PC_UA, renderer: null, software: false, touch: false, xboxPick: false, ...o });
const read = (f: string): string => readFileSync(new URL(f, import.meta.url), 'utf8');

afterEach(() => { resetInputSourcesForTest(); resetPageClientErrorBeaconForTest(); resetGraphicsRecordForTest(); });

describe('XBOX-DIAG: how the page was taken for an Xbox, each signal apart (2f: three flags)', () => {
  it('the agent\'s token alone, the driver alone, the pick alone, none', () => {
    expect(xboxMarks(sig({ userAgent: XBOX_UA, renderer: 'ANGLE (NVIDIA GeForce RTX 3080 Direct3D12)' }))).toEqual({ ua: true, sraKmd: false, cls: false });
    expect(xboxMarks(sig({ renderer: SRAKMD }))).toEqual({ ua: false, sraKmd: true, cls: true });
    expect(xboxMarks(sig({ xboxPick: true }))).toEqual({ ua: false, sraKmd: false, cls: true });
    expect(xboxMarks(sig({ userAgent: XBOX_UA, renderer: SRAKMD }))).toEqual({ ua: true, sraKmd: true, cls: true });
    expect(xboxMarks(sig({}))).toEqual({ ua: false, sraKmd: false, cls: false });
  });
});

const info = (n: number): DiagInfo => ({ memory: { geometries: 10 + n, textures: 20 + n, uniformBuffers: 40 + n, total: (30 + n) * 1_048_576 }, programs: { length: 5 } });

describe('XBOX-DIAG: the ring', () => {
  it('keeps the last eight samples, oldest first, each [t, geometries, textures, uniform buffers, programs, MB, scale, phase]', () => {
    const r = new DiagRing();
    for (let i = 0; i < 20; i++) r.write(i * 2, info(i), 0.75, Math.min(8, i));
    const rows = r.rows();
    expect(rows).toHaveLength(DIAG_RING_ADAPTATION);
    expect(rows[0]).toEqual([24, 22, 32, 52, 5, 42, 0.75, 8]);
    expect(rows.at(-1)).toEqual([38, 29, 39, 59, 5, 49, 0.75, 8]);
  });

  it('a lane the renderer does not give is null, never a guess; no phase is null', () => {
    const r = new DiagRing();
    r.write(1.04, { memory: { textures: 3 } }, null, -1);
    expect(r.rows()).toEqual([[1, null, 3, null, null, null, null, null]]);
  });

  it('the write allocates nothing (2f\'s ask 5): one preallocated array, written in place', () => {
    const src = read('../src/matchDiag.ts');
    const body = src.slice(src.indexOf('  write(t: number'), src.indexOf('  clear(): void'));
    expect(body.length).toBeGreaterThan(100);
    for (const bad of ['new ', '[...', '.slice(', '.map(', 'JSON', '{ ', 'push(']) expect(body, bad).not.toContain(bad);
  });

  it('the load phase reached: an index of LOAD_PHASES, back to 0 at a load\'s start', () => {
    markLoad('load-start', null);
    markLoad('world-built', null);
    expect(loadPhaseReached()).toBe(LOAD_PHASES.indexOf('world-built'));
    markLoad('renderer', null);
    markLoad('mounted', null);                                       // an earlier phase marked late never lowers it
    expect(loadPhaseReached()).toBe(LOAD_PHASES.indexOf('renderer'));
    markLoad('load-start', null);
    expect(loadPhaseReached()).toBe(0);
  });
});

describe('XBOX-DIAG: the match\'s input track', () => {
  it('the pads its reader found, the first pad\'s id and mapping, the first button and stick past 0.05 with their times', () => {
    const t = new InputTrack();
    const pad = (pressed: number | null, axis = 0) => ({ id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', mapping: 'standard',
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === pressed })), axes: [axis, 0, 0, 0] });
    t.poll([], 1);
    expect(t.pads).toBe(0);
    t.poll([pad(null, 0.04)], 2);
    t.poll([pad(null, 0.2)], 3);
    t.poll([pad(7), pad(0)], 4.5);
    t.poll([pad(0)], 5);
    expect([t.pads, t.mapping, t.firstStickT, t.firstButton, t.firstButtonT]).toEqual([2, 'standard', 3, 7, 4.5]);
    expect(t.padId).toContain('Xbox Wireless Controller');
  });

  it('the game\'s lanes with input: a stick or the look past 0.05, or any button', () => {
    expect(gameInputActive(noInput() as GameInputLike)).toBe(false);
    expect(gameInputActive({ ...noInput(), moveX: 0.04 } as GameInputLike)).toBe(false);
    expect(gameInputActive({ ...noInput(), lookY: -0.3 } as GameInputLike)).toBe(true);
    expect(gameInputActive({ ...noInput(), reload: true } as GameInputLike)).toBe(true);
    const t = new InputTrack();
    t.gameFrame(false); t.gameFrame(false); t.gameFrame(true);
    expect([t.frames, t.framesWithInput]).toEqual([3, 1]);
  });
});

describe('XBOX-DIAG: the page\'s input sources, the menus apart from the match (2f\'s ask 2)', () => {
  it('counted in the phase they came in; the menus\' last source kept through the match; the match\'s from zero at each', () => {
    noteInput('ptr'); noteInput('ptr'); noteInput('key');
    setInputPhase('match');
    expect(inputPhase()).toBe('match');
    noteInput('ptr');
    let s = inputSources();
    expect(s.menu).toEqual({ pad: 0, key: 1, ptr: 2 });
    expect(s.match).toEqual({ pad: 0, key: 0, ptr: 1 });
    expect(s.last).toBe('key');
    setInputPhase('menu'); noteInput('pad'); setInputPhase('match');
    s = inputSources();
    expect([s.match.ptr, s.menu.pad, s.last]).toEqual([0, 1, 'pad']);
  });

  it('the listeners: a key press (not its repeat), a pointer press, the pads\' connect and disconnect; once a window', () => {
    const fns = new Map<string, (e: Event) => void>();
    const win = { addEventListener: (t: string, f: (e: Event) => void) => { fns.set(t, f); }, removeEventListener: (t: string) => { fns.delete(t); } };
    const off = installInputSources(win);
    expect(installInputSources(win)()).toBeUndefined();              // a second install: a no-op
    fns.get('keydown')!({ repeat: false } as unknown as Event);
    fns.get('keydown')!({ repeat: true } as unknown as Event);
    fns.get('pointerdown')!({} as Event);
    fns.get('gamepadconnected')!({} as Event);
    fns.get('gamepaddisconnected')!({} as Event);
    expect(inputSources()).toMatchObject({ menu: { key: 1, ptr: 1, pad: 0 }, connected: 1, disconnected: 1 });
    off();
    expect(fns.size).toBe(0);
  });

  it('a pad read with input: a button down (pressed or value at 0.5), a stick past 0.05', () => {
    expect(padHasInput(null)).toBe(false);
    expect(padHasInput({ buttons: [{ pressed: false, value: 0.2 }], axes: [0.05, -0.05] })).toBe(false);
    expect(padHasInput({ buttons: [{ pressed: false, value: 0.5 }], axes: [] })).toBe(true);
    expect(padHasInput({ buttons: [], axes: [0, 0.06] })).toBe(true);
  });

  it('wired: the entry installs the listeners; the one pad reader the menus and the match share counts its input', () => {
    expect(read('../src/entry.ts')).toContain('installInputSources(window);');
    expect(read('../src/setupPad.ts')).toMatch(/if \(padHasInput\(this\.input\.raw\)\) noteInput\('pad'\);/);
  });
});

describe('XBOX-DIAG: the page\'s state as the reports read it', () => {
  it('Edge on Xbox\'s emulation as it says; absent where the browser has none; each part alone', () => {
    const doc = { hasFocus: () => true, visibilityState: 'visible', pointerLockElement: null };
    expect(readPageState({ gamepadInputEmulation: 'mouse', userActivation: { hasBeenActive: false } }, doc))
      .toEqual({ emulation: 'mouse', focus: true, visibility: 'visible', activation: false, pointerLock: false });
    const s = readPageState({}, { hasFocus: () => { throw new Error('no'); } });
    expect('emulation' in s || 'focus' in s).toBe(false);
    expect(inputSummary(new InputTrack(), s, inputSources())).toMatchObject({ emu: 'absent', foc: null });
  });
});

const NO_SOURCES: SourcesSnapshot = { menu: { pad: 0, key: 0, ptr: 0 }, match: { pad: 0, key: 0, ptr: 0 }, last: null, connected: 0, disconnected: 0 };

describe('XBOX-DIAG: every report under the beacon\'s 1024-character message cap, whole (2f\'s ask 3)', () => {
  const BIG = 9_999_999_999;
  const worstInput = (): Record<string, unknown> => {
    const t = new InputTrack();
    t.pads = BIG; t.padId = 'P'.repeat(500); t.mapping = 'M'.repeat(500);
    t.firstButton = BIG; t.firstButtonT = BIG; t.firstStickT = BIG; t.held = BIG; t.frames = BIG; t.framesWithInput = BIG;
    const s: SourcesSnapshot = { menu: { pad: BIG, key: BIG, ptr: BIG }, match: { pad: BIG, key: BIG, ptr: BIG }, last: 'ptr', connected: BIG, disconnected: BIG };
    return inputSummary(t, { emulation: 'E'.repeat(500), focus: true, visibility: 'V'.repeat(500), activation: true, pointerLock: true }, s);
  };
  const worstInfo: DiagInfo = { memory: { geometries: BIG, textures: BIG, uniformBuffers: BIG, total: BIG * 1_048_576 }, programs: { length: BIG } };
  const worstRing = (): DiagRing => {
    const r = new DiagRing();
    for (let k = 0; k < DIAG_RING_ADAPTATION; k++) r.write(BIG, worstInfo, BIG, BIG);
    return r;
  };
  const marks: XboxMarks = { ua: true, sraKmd: true, cls: true };
  const common = { marks, backend: 'B'.repeat(500), heapMB: BIG, deviceMemory: BIG };

  it('contextdiag at its worst: every field, eight full samples, the input summary -- parses, all eight kept', () => {
    const s = contextDiagMessage('gpudevicelost'.repeat(5), common, worstRing(), worstRing().rows()[0]!, { w: BIG, h: BIG }, BIG, worstInput());
    expect(s.length).toBeLessThanOrEqual(DIAG_MESSAGE_MAX);
    const d = JSON.parse(s) as { r: unknown[]; in: { id: string; map: string; emu: string; vis: string } };
    expect(d.r).toHaveLength(DIAG_RING_ADAPTATION);
    expect(d.in.id).toHaveLength(DIAG_PAD_ID_CHARS_ADAPTATION);   // the pad's id cut inside the JSON, the JSON whole
    expect([d.in.emu.length, d.in.map.length, d.in.vis.length]).toEqual([12, 12, 9]);
  });

  it('review F3: a pad id of quotes, backslashes and control characters is put as ? -- its JSON length its length, all eight rows kept', () => {
    const t = new InputTrack();
    t.padId = '"\\\u0001\u001f'.repeat(200); t.mapping = '"'.repeat(50);
    const input = inputSummary(t, { emulation: '\u0000'.repeat(50), visibility: '\\'.repeat(50) }, NO_SOURCES);
    const s = contextDiagMessage('w"hy'.repeat(10), { marks, backend: '"'.repeat(50), heapMB: BIG, deviceMemory: BIG }, worstRing(), worstRing().rows()[0]!, { w: BIG, h: BIG }, BIG, input);
    expect(s.length).toBeLessThanOrEqual(DIAG_MESSAGE_MAX);
    const d = JSON.parse(s) as { r: unknown[]; bk: string; in: { id: string; map: string; emu: string; vis: string } };
    expect(d.r).toHaveLength(DIAG_RING_ADAPTATION);
    expect(d.in.id).toBe('?'.repeat(DIAG_PAD_ID_CHARS_ADAPTATION));
    expect([d.in.map, d.in.emu, d.in.vis, d.bk]).toEqual(['?'.repeat(12), '?'.repeat(12), '?'.repeat(9), '?'.repeat(12)]);
  });

  it('inputdiag at its worst: parses', () => {
    const s = inputDiagMessage(common, BIG, worstInput());
    expect(s.length).toBeLessThanOrEqual(DIAG_MESSAGE_MAX);
    expect((JSON.parse(s) as { in: { id: string } }).in.id).toHaveLength(DIAG_PAD_ID_CHARS_ADAPTATION);
  });
});

describe('XBOX-DIAG: the page\'s diagnostic through a match', () => {
  const rig = (marks: XboxMarks, sources: SourcesSnapshot = NO_SOURCES) => {
    const sent: [DiagKind, Record<string, unknown>][] = [];
    let reads = 0;
    const d = new MatchDiag({
      marks: () => marks, backend: () => 'webgl2', heapMB: () => 900, deviceMemory: () => 8, sources: () => sources,
      page: () => ({ emulation: 'mouse', focus: true, visibility: 'visible', activation: true, pointerLock: false }),
      send: (kind, message) => { sent.push([kind, JSON.parse(message) as Record<string, unknown>]); },
    });
    const source = { info: () => { reads++; return info(reads); }, scale: () => 1, buffer: () => ({ w: 1920, h: 1080 }), phase: () => 6, links: () => 412 };
    return { d, sent, source, reads: () => reads };
  };
  const XBOX: XboxMarks = { ua: false, sraKmd: true, cls: true };
  const PC: XboxMarks = { ua: false, sraKmd: false, cls: false };

  it('off outside a match (2f\'s ask 5): frames read nothing; in one, a sample every 2 s, not every frame', () => {
    const { d, source, reads } = rig(XBOX);
    for (let f = 0; f < 600; f++) d.frame(f * 16);
    expect(reads()).toBe(0);
    d.begin(10_000, source);
    for (let f = 0; f <= 625; f++) d.frame(10_000 + f * 16);          // 10 s of frames
    expect(reads()).toBe(Math.floor(10_000 / DIAG_SAMPLE_MS_ADAPTATION) + 1);
    d.end(20_000);
    for (let f = 0; f < 600; f++) d.frame(20_000 + f * 16);
    expect(reads()).toBe(6);
  });

  it('an Xbox-marked page: inputdiag once, 45 s after the mount, with the marks, the summary and the sources', () => {
    const sources: SourcesSnapshot = { ...NO_SOURCES, menu: { pad: 0, key: 0, ptr: 14 }, match: { pad: 0, key: 0, ptr: 3 }, last: 'ptr' };
    const { d, sent, source } = rig(XBOX, sources);
    d.begin(0, source);
    d.pads([{ id: 'pad', mapping: 'standard', buttons: [{ pressed: false }], axes: [0, 0] }], 3000, true);
    d.gameInput(noInput() as GameInputLike);
    for (let t = 0; t <= 60_000; t += 16) d.frame(t);
    d.end(61_000);
    expect(sent.map(([k]) => k)).toEqual(['inputdiag']);
    const [, m] = sent[0]!;
    expect(m).toMatchObject({ v: 1, bk: 'webgl2', m: { ua: 0, sk: 1, cl: 1 },
      in: { emu: 'mouse', pads: 1, map: 'standard', hld: 1, gf: 1, gfIn: 0, menu: { ptr: 14, pad: 0, last: 'ptr' }, match: { ptr: 3, pad: 0 } } });
    expect(m['t']).toBeGreaterThanOrEqual(INPUT_DIAG_AT_MS_ADAPTATION / 1000);
  });

  it('a match ended before 45 s sends it at the end; a page not Xbox-marked never sends it', () => {
    const x = rig(XBOX);
    x.d.begin(0, x.source); x.d.frame(1000); x.d.end(20_000);
    expect(x.sent.map(([k]) => k)).toEqual(['inputdiag']);
    expect(x.sent[0]![1]['t']).toBe(20);
    const pc = rig(PC);
    pc.d.begin(0, pc.source);
    for (let t = 0; t <= 60_000; t += 16) pc.d.frame(t);
    pc.d.end(61_000);
    expect(pc.sent).toEqual([]);
  });

  it('a loss at 12 s on an Xbox-marked page (2f\'s ask 1): contextdiag with the ring, a sample now, the buffer, the links and the input so far', () => {
    const { d, sent, source } = rig(XBOX);
    d.begin(0, source);
    for (let t = 0; t <= 12_000; t += 16) d.frame(t);
    d.lost('webglcontextlost', 12_100);
    expect(sent.map(([k]) => k)).toEqual(['contextdiag']);
    const m = sent[0]![1] as { why: string; r: number[][]; now: number[]; buf: number[]; lk: number; heap: number; dm: number; in?: unknown };
    expect(m.why).toBe('webglcontextlost');
    expect(m.r.map((row) => row[0])).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(m.r[0]![7]).toBe(6);                                          // the load phase at each sample
    expect([m.now[0], m.now[7]]).toEqual([12.1, 6]);
    expect([m.buf, m.lk, m.heap, m.dm]).toEqual([[1920, 1080], 412, 900, 8]);
    expect(m.in).toMatchObject({ emu: 'mouse' });
  });

  it('review F2: a loss after a match ended carries none of that match: the ring empty, the input from zero', () => {
    const { d, sent, source } = rig(XBOX);
    d.begin(0, source);
    d.pads([{ id: 'pad', mapping: 'standard', buttons: [{ pressed: true }], axes: [0] }], 1000);
    for (let t = 0; t <= 12_000; t += 16) d.frame(t);
    d.end(13_000);
    d.lost('webglcontextlost', 20_000);
    const m = sent.find(([k]) => k === 'contextdiag')![1] as { r: unknown[]; now: unknown[]; in: { pads: number; btn: number | null } };
    expect([m.r, m.now]).toEqual([[], []]);
    expect([m.in.pads, m.in.btn]).toEqual([0, null]);
  });

  it('a loss on a page not Xbox-marked: no input summary; a loss before any match (a map loading): the ring empty, no time', () => {
    const pc = rig(PC);
    pc.d.begin(0, pc.source); pc.d.frame(0); pc.d.lost('gpudevicelost', 500);
    expect(pc.sent[0]![1]['in']).toBeUndefined();
    const early = rig(XBOX);
    early.d.lost('gpudevicelost', 500);
    expect(early.sent[0]![1]).toMatchObject({ why: 'gpudevicelost', r: [], now: [], m: { sk: 1 } });
  });
});

describe('XBOX-DIAG: on the beacon -- its own kinds, past the gap, never in the error record', () => {
  const beacon = () => {
    const bodies: Record<string, unknown>[] = [];
    let t = 0;
    const b = new ClientErrorBeacon({
      context: () => ({ release: 'v0.4.19', builtAt: null, backend: 'webgl2', adapter: SRAKMD, map: 'MP2', matchElapsedMs: 12_000 }),
      send: (body) => { bodies.push(JSON.parse(body) as Record<string, unknown>); }, now: () => t, pageId: 'p',
    });
    return { b, bodies, at: (ms: number) => { t = ms; } };
  };

  it('a diag report goes as its kind with its JSON in message, right after an error, and is not an error of the page', () => {
    const { b, bodies } = beacon();
    b.report('webglcontextlost', 'WebGL: Unknown reason');
    expect(b.reportDiag('contextdiag', '{"v":1}')).toBe(true);
    expect(bodies.map((x) => [x['kind'], x['message'], x['matchElapsedMs']])).toEqual([['webglcontextlost', 'WebGL: Unknown reason', 12_000], ['contextdiag', '{"v":1}', 12_000]]);
    expect(b.record().counts).toEqual({ webglcontextlost: 1 });
    expect(b.text()).not.toContain('contextdiag');
  });

  it('review F1: diagnostics on their own budget -- they never hold an error back by the gap, never count against the errors\' twenty', () => {
    const { b, bodies, at } = beacon();
    expect(b.reportDiag('inputdiag', '{"v":1}')).toBe(true);
    at(1000);
    b.report('webglcontextlost', 'WebGL: Unknown reason');                 // a second later: the diagnostic held no gap
    expect(bodies.map((x) => x['kind'])).toEqual(['inputdiag', 'webglcontextlost']);
    expect(b.record().sent).toBe(1);
    for (let i = 0; i < BEACON_DIAGS_PER_LOAD_ADAPTATION + 5; i++) b.reportDiag('contextdiag', '{}');
    expect(bodies.filter((x) => x['kind'] !== 'webglcontextlost')).toHaveLength(BEACON_DIAGS_PER_LOAD_ADAPTATION);
    at(100_000);
    b.report('error', 'later');                                             // the errors' own budget untouched
    expect(bodies.at(-1)!['kind']).toBe('error');
  });

  it('the graphics loss calls the match\'s hook after its own report; no hook, nothing more; a throwing hook adds no error', () => {
    const { b, bodies } = beacon();
    const win = { addEventListener: () => undefined, removeEventListener: () => undefined };
    const off = installClientErrorBeacon(win, b);
    const renderer = { onDeviceLost: (_info: unknown) => undefined };
    watchGraphicsLost(renderer, undefined);
    const lose = (api: string, message: string): void => { renderer.onDeviceLost({ api, message, reason: null } as never); };
    const why: string[] = [];
    lose('WebGL', 'Unknown reason');                                  // no hook yet: the loss's own report alone
    setBeaconLossDiag((w) => { why.push(w); b.reportDiag('contextdiag', '{}'); });
    lose('WebGPU', 'lost');
    lose('WebGL', 'again');
    setBeaconLossDiag(() => { throw new Error('diag'); });
    expect(() => lose('WebGL', 'thrice')).not.toThrow();
    off();
    expect(why).toEqual(['gpudevicelost', 'webglcontextlost']);
    expect(bodies.map((x) => x['kind'])).toContain('contextdiag');
  });

  it('wired: the match begins and ends the diagnostic with the beacon\'s match, samples at its frame tail, reads its pads and lanes', () => {
    const m = read('../src/matchMount.ts');
    expect(m.indexOf("setInputPhase('match'); matchDiag.begin(")).toBeGreaterThan(m.indexOf('beaconMatchBegan();'));
    expect(m).toMatch(/beaconMatchEnded\(\{[^\n]*\r?\n\s+if \(attached\) \{ matchDiag\.end\([^\n]*setInputPhase\('menu'\); \}/);   // review F5
    expect(m).toMatch(/const polled = gamePad\.poll\(nav\);\r?\n\s+matchDiag\.pads\(gamePad\.input\.devices, now, held\);/);
    expect(m).toMatch(/Object\.assign\(pad, gamePad\.extras\(pad, padMenu\)\);\r?\n\s+matchDiag\.gameInput\(pad\);/);
    expect(m).toMatch(/matchDiag\.frame\(now\);[^\n]*\r?\n\s+if \(adaptiveRatio\.frame\(/);
  });
});
