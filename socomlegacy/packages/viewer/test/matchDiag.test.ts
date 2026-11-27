import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  contextDiagMessage, DIAG_MESSAGE_MAX, DIAG_REPORT_VERSION, DIAG_PAD_ID_CHARS_ADAPTATION, DIAG_RING_ADAPTATION, DIAG_SAMPLE_MS_ADAPTATION, DIAG_STAGE_LANE_ADAPTATION, DIAG_STAGES,
  DiagRing, gameInputActive, INPUT_DIAG_AT_MS_ADAPTATION, inputDiagMessage, inputSummary, InputTrack, lossInPlay, MatchDiag, sampleNow, StageLane, xboxMarks, type DiagInfo,
  type DiagKind, type DiagSource, type DiagStage, type GameInputLike, type XboxMarks,
} from '../src/matchDiag';
import { followLoad, noteLoadReply, readPageState } from '../src/matchDiagPage';
import { inputPhase, inputSources, installInputSources, noteInput, padHasInput, resetInputSourcesForTest, setInputPhase, type SourcesSnapshot } from '../src/inputSources';
import { BEACON_DIAGS_PER_LOAD_ADAPTATION, ClientErrorBeacon, installClientErrorBeacon, resetPageClientErrorBeaconForTest, setBeaconLossDiag } from '../src/clientErrorBeacon';
import { resetGraphicsRecordForTest, watchGraphicsLost } from '../src/graphicsLost';
import { LOAD_PHASES, loadPhaseReached, markLoad, setLoadMarkListener } from '../src/loadMarks';
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
    expect(rows[0]).toEqual([24, 22, 32, 52, 5, 42, 0.75, 8, null, null, null]);   // XBOX-CAUSE-B's frame lanes: none written here
    expect(rows.at(-1)).toEqual([38, 29, 39, 59, 5, 49, 0.75, 8, null, null, null]);
  });

  it('a lane the renderer does not give is null, never a guess; no phase is null', () => {
    const r = new DiagRing();
    r.write(1.04, { memory: { textures: 3 } }, null, -1);
    expect(r.rows()).toEqual([[1, null, 3, null, null, null, null, null, null, null, null]]);
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

/** A stage's id in the lane (`DIAG_STAGES`). */
const sid = (s: DiagStage): number => DIAG_STAGES.indexOf(s);

describe('XBOX-790-LOADDIAG (PR #790 piece 3): the load\'s stage lane beside the ring', () => {
  it('the ids: the load phases first, in LOAD_PHASES\' order (a phase\'s id is its loadPhaseReached), then the loader\'s', () => {
    expect(DIAG_STAGES.slice(0, LOAD_PHASES.length)).toEqual([...LOAD_PHASES]);
    expect(DIAG_STAGES.slice(LOAD_PHASES.length)).toEqual(['decode', 'map', 'play', 'effects', 'sound', 'soundLoops', 'error', 'crash', 'cancelled']);
    expect(DIAG_STAGES.length).toBeLessThan(100);                       // two digits at most in the report
  });

  it('keeps the latest DIAG_STAGE_LANE_ADAPTATION stages, oldest first, each [id, ms, heap MB, KiB, truncated]: a field not read is left off the end, never guessed', () => {
    const l = new StageLane();
    l.write(0, 0, 210.4, -1, false);                                   // the heap alone (Chromium's performance.memory)
    l.write(sid('map'), 9800.4, -1, 81_234.2, true);                   // a reply's KiB, no heap (another browser), the walk capped
    l.write(sid('decode'), 12, -1, -1, false);                         // neither
    expect(l.rows()).toEqual([[0, 0, 210], [sid('map'), 9800, null, 81_234, 1], [sid('decode'), 12]]);
    for (let i = 0; i < 20; i++) l.write(1, 100 + i, 300, -1, false);
    const rows = l.rows();
    expect(rows).toHaveLength(DIAG_STAGE_LANE_ADAPTATION);
    expect([rows[0], rows.at(-1)]).toEqual([[1, 100 + 20 - DIAG_STAGE_LANE_ADAPTATION, 300], [1, 119, 300]]);
    expect(l.dropped).toBe(23 - DIAG_STAGE_LANE_ADAPTATION);
    l.clear();
    expect([l.rows(), l.dropped]).toEqual([[], 0]);
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
  // I-4: the widest pad id the summary can carry is 'ffff:ffff:wireless controller' (29 characters), not a cut of free text (48).
  const WORST_PAD = 'Wireless Controller (Vendor: ffff Product: ffff)';
  const worstInput = (): Record<string, unknown> => {
    const t = new InputTrack();
    t.pads = BIG; t.padId = WORST_PAD; t.mapping = 'M'.repeat(500);
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

  it('contextdiag at its worst: every field, eight full samples, the input summary -- parses; since XBOX-CAUSE-B six kept', () => {
    const s = contextDiagMessage('gpudevicelost'.repeat(5), common, worstRing(), worstRing().rows()[0]!, { w: BIG, h: BIG }, BIG, worstInput());
    expect(s.length).toBeLessThanOrEqual(DIAG_MESSAGE_MAX);
    const d = JSON.parse(s) as { r: unknown[]; in: { id: string; map: string; emu: string; vis: string } };
    expect(d.r).toHaveLength(DIAG_RING_ADAPTATION - 2);          // XBOX-CAUSE-B's frame lanes: at every field's bound the two oldest shed
    expect(d.in.id).toBe('ffff:ffff:wireless controller');       // the pad as vendor:product:family, the JSON whole
    expect(d.in.id.length).toBeLessThanOrEqual(DIAG_PAD_ID_CHARS_ADAPTATION);
    expect([d.in.emu.length, d.in.map.length, d.in.vis.length]).toEqual([12, 12, 9]);
  });

  it('MATCH-RENDERER-RETRY A: contextdiag carries the extra fields under x, and at its worst still fits and parses', () => {
    const extra = { err: 'e'.repeat(120), err2: 'f'.repeat(120), cce: 'g'.repeat(120), retry: 'fail' };
    const s = contextDiagMessage('no-backend', common, worstRing(), worstRing().rows()[0]!, { w: BIG, h: BIG }, BIG, worstInput(), null, extra);
    expect(s.length).toBeLessThanOrEqual(DIAG_MESSAGE_MAX);
    expect((JSON.parse(s) as { x: unknown }).x).toEqual(extra);
    const plain = JSON.parse(contextDiagMessage('gpudevicelost', common, new DiagRing(), [], null, null, null)) as Record<string, unknown>;
    expect('x' in plain).toBe(false);                                    // no extra, no key: today's rows unchanged
  });

  it('review F3 (I-4): a pad id of quotes, backslashes and control characters sends only -:-:generic (11 characters); the other strings still go as ?', () => {
    const t = new InputTrack();
    t.padId = '"\\\u0001\u001f'.repeat(200); t.mapping = '"'.repeat(50);
    const input = inputSummary(t, { emulation: '\u0000'.repeat(50), visibility: '\\'.repeat(50) }, NO_SOURCES);
    const s = contextDiagMessage('w"hy'.repeat(10), { marks, backend: '"'.repeat(50), heapMB: BIG, deviceMemory: BIG }, worstRing(), worstRing().rows()[0]!, { w: BIG, h: BIG }, BIG, input);
    expect(s.length).toBeLessThanOrEqual(DIAG_MESSAGE_MAX);
    const d = JSON.parse(s) as { r: unknown[]; bk: string; in: { id: string; map: string; emu: string; vis: string } };
    expect(d.r).toHaveLength(DIAG_RING_ADAPTATION - 1);          // this id is 11 characters, not 48: 37 fewer, so only the oldest sample sheds (6 kept before I-4)
    expect(d.in.id).toBe('-:-:generic');
    expect([d.in.map, d.in.emu, d.in.vis, d.bk]).toEqual(['?'.repeat(12), '?'.repeat(12), '?'.repeat(9), '?'.repeat(12)]);
  });

  it("I-4: the input summary's id is vendor:product:family, and a renamed pad's name is in neither message kind", () => {
    const t = new InputTrack();
    t.pads = 1; t.padId = "Craig's Wireless Controller (Vendor: 054c Product: 09cc)"; t.mapping = 'standard';
    const input = inputSummary(t, {}, NO_SOURCES);
    expect(input['id']).toBe('054c:09cc:wireless controller');
    const ctx = contextDiagMessage('gpudevicelost', common, new DiagRing(), [], null, null, input);
    const inp = inputDiagMessage(common, 45, input);
    expect((JSON.parse(ctx) as { in: { id: string } }).in.id).toBe('054c:09cc:wireless controller');
    expect((JSON.parse(inp) as { in: { id: string } }).in.id).toBe('054c:09cc:wireless controller');
    expect(ctx).not.toContain('Craig');
    expect(inp).not.toContain('Craig');
    const bare = new InputTrack(); bare.padId = 'Some Pad';
    expect(inputSummary(bare, {}, NO_SOURCES)['id']).toBe('-:-:generic');
    expect(inputSummary(new InputTrack(), {}, NO_SOURCES)['id']).toBeNull();
  });

  it('XBOX-790-LOADDIAG: no load open, no load fields -- the report as before, all eight samples kept', () => {
    const d = JSON.parse(contextDiagMessage('gpudevicelost'.repeat(5), common, worstRing(), worstRing().rows()[0]!, { w: BIG, h: BIG }, BIG, worstInput(), null)) as Record<string, unknown>;
    expect(['s', 'sx', 'lt'].filter((k) => k in d)).toEqual([]);
    expect(d['r']).toHaveLength(DIAG_RING_ADAPTATION - 2);       // XBOX-CAUSE-B: at every field's bound the two oldest shed
  });

  it('XBOX-790-LOADDIAG review L1: contextdiag at its TRUE worst -- all eight ring samples shed and, since XBOX-WARM pc, XBOX-CAUSE-B and I-4 (the shorter pad id), the two oldest stages: 1008 characters, sx 99', () => {
    // The widest each field can be: every number at its bound; every string at its cut; the input's focus, activation and
    // pointer lock null (4 characters, wider than 0 or 1); every ring row's and the now row's phase null (4, wider than
    // its bound 9); the menus' last source 'ptr' (5 with its quotes, wider than null); the lane full of the widest stage
    // rows and dropped to sx's two-digit bound. Counted by hand: 621 characters beside the ring and the stages, the empty
    // ring 7, the 15 stages 396 -- 1024; one ring sample more (61) would not fit, so the cap sheds all eight and no stage.
    // XBOX-WARM: `"pc":null,` adds 10 (631 beside the ring and stages): 1034, so the oldest stage (26 with its comma) goes too.
    // XBOX-CAUSE-B: `"st":999,"rs":999,"ll":99999.9,` (32) and the now row's three frame lanes at their bounds
    // (`,999,9999,9999`, 14) make it 677 beside the ring and the stages: three stages go, 1001. The ring's samples, as wide,
    // all shed as before.
    // I-4: the pad id is at most 'ffff:ffff:wireless controller', 29 characters, not 48 (19 fewer): 1060 before the stages shed;
    // one stage (26) leaves 1034, over the cap, a second leaves 1008 -- two stages go, not three. (No field row comes near: a console's contextdiag rows measured 771-1012 characters.)
    const lane = new StageLane();
    for (let k = 0; k < DIAG_STAGE_LANE_ADAPTATION + 99; k++) lane.write(BIG, BIG, BIG, BIG, true);
    const ring = new DiagRing();
    for (let k = 0; k < DIAG_RING_ADAPTATION; k++) ring.write(BIG, worstInfo, BIG, -1, BIG, BIG, BIG);
    const nowRow = sampleNow(BIG, worstInfo, BIG, -1, BIG, BIG, BIG);
    expect(nowRow).toEqual([99_999.9, 999_999, 999_999, 999_999, 999_999, 999_999, 9.99, null, 999, 9_999, 9_999]);   // XBOX-CAUSE-B's lanes at their bounds
    expect(ring.rows()).toEqual(Array.from({ length: DIAG_RING_ADAPTATION }, () => nowRow));
    const t = new InputTrack();
    t.pads = BIG; t.padId = WORST_PAD; t.mapping = 'M'.repeat(500);
    t.firstButton = BIG; t.firstButtonT = BIG; t.firstStickT = BIG; t.held = BIG; t.frames = BIG; t.framesWithInput = BIG;
    const src: SourcesSnapshot = { menu: { pad: BIG, key: BIG, ptr: BIG }, match: { pad: BIG, key: BIG, ptr: BIG }, last: 'ptr', connected: BIG, disconnected: BIG };
    const input = inputSummary(t, { emulation: 'E'.repeat(500), visibility: 'V'.repeat(500) }, src);
    expect([input['foc'], input['act'], input['lock']]).toEqual([null, null, null]);
    const s = contextDiagMessage('gpudevicelost'.repeat(5), { ...common, parallelCompile: null, seats: BIG, room: BIG, sinceLink: BIG }, ring, nowRow, { w: BIG, h: BIG }, BIG, input, { lt: BIG, lane });
    expect(s.length).toBe(1008);
    const d = JSON.parse(s) as { r: unknown[]; now: unknown[]; s: number[][]; sx: number; lt: number; in: { id: string } };
    expect(d.r).toEqual([]);                                            // shed: all eight ring samples
    expect(d.s).toEqual(Array.from({ length: DIAG_STAGE_LANE_ADAPTATION - 2 }, () => [99, 999_999, 9_999, 999_999, 1]));   // shed: the two oldest stages (XBOX-WARM's pc, XBOX-CAUSE-B's fields, I-4's 29-character id)
    expect([d.lt, d.sx]).toEqual([999_999, 99]);                        // the lane's own 99 dropped, at sx's bound
    expect(d.now).toEqual(nowRow);
    expect(d.in.id).toBe('ffff:ffff:wireless controller');
  });

  it('XBOX-WARM: contextdiag and inputdiag carry pc -- KHR_parallel_shader_compile offered 1, not 0, unknown null', () => {
    const at = (pc: boolean | null | undefined): [unknown, unknown] => {
      const c = { marks, backend: 'webgl2', ...(pc !== undefined ? { parallelCompile: pc } : {}) };
      return [(JSON.parse(contextDiagMessage('webglcontextlost', c, new DiagRing(), [], null, null, null)) as Record<string, unknown>)['pc'],
        (JSON.parse(inputDiagMessage(c, 45, {})) as Record<string, unknown>)['pc']];
    };
    expect(at(true)).toEqual([1, 1]);
    expect(at(false)).toEqual([0, 0]);
    expect(at(null)).toEqual([null, null]);
    expect(at(undefined)).toEqual([null, null]);
  });

  it('XBOX-WARM: contextdiag at its worst with pc still fits and parses', () => {
    const s = contextDiagMessage('gpudevicelost'.repeat(5), { ...common, parallelCompile: null }, worstRing(), worstRing().rows()[0]!, { w: BIG, h: BIG }, BIG, worstInput());
    expect(s.length).toBeLessThanOrEqual(DIAG_MESSAGE_MAX);
    expect((JSON.parse(s) as Record<string, unknown>)['pc']).toBeNull();
  });

  it('inputdiag at its worst: parses', () => {
    const s = inputDiagMessage(common, BIG, worstInput());
    expect(s.length).toBeLessThanOrEqual(DIAG_MESSAGE_MAX);
    expect((JSON.parse(s) as { in: { id: string } }).in.id).toBe('ffff:ffff:wireless controller');
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

  it('XBOX-WARM: the option parallelCompile reaches the report; one that throws reads null', () => {
    const sent: Record<string, unknown>[] = [];
    const make = (pc: () => boolean | null) => new MatchDiag({ marks: () => XBOX, backend: () => 'webgl2', sources: () => NO_SOURCES, page: () => ({}), parallelCompile: pc,
      send: (_k, message) => { sent.push(JSON.parse(message) as Record<string, unknown>); } });
    make(() => false).lost('webglcontextlost', 1000);
    make(() => true).lost('webglcontextlost', 1000);
    make(() => { throw new Error('no'); }).lost('webglcontextlost', 1000);
    expect(sent.map((m) => m['pc'])).toEqual([0, 1, null]);
  });

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
    expect(m).toMatchObject({ v: 3, bk: 'webgl2', m: { ua: 0, sk: 1, cl: 1 },   // review M2: one version per build (v3: XBOX-CAUSE-B's lanes)
      in: { emu: 'mouse', pads: 1, map: 'standard', hld: 1, gf: 1, gfIn: 0, menu: { ptr: 14, pad: 0, last: 'ptr' }, match: { ptr: 3, pad: 0 } } });
    expect(m['t']).toBeGreaterThanOrEqual(INPUT_DIAG_AT_MS_ADAPTATION / 1000);
  });

  it('a match ended before 45 s sends it at the end', () => {
    const x = rig(XBOX);
    x.d.begin(0, x.source); x.d.frame(1000); x.d.end(20_000);
    expect(x.sent.map(([k]) => k)).toEqual(['inputdiag']);
    expect(x.sent[0]![1]['t']).toBe(20);
  });

  it('LATER 1001: a page not Xbox-marked sends a compact inputdiag once a page load -- the sticks (stk), no input summary', () => {
    const pc = rig(PC);
    pc.d.begin(0, pc.source);
    pc.d.pads([{ id: 'pad', mapping: 'standard', buttons: [{ pressed: false }], axes: [0.6, -0.05] }], 1000, true);
    for (let t = 0; t <= 60_000; t += 16) pc.d.frame(t);
    pc.d.end(61_000);
    expect(pc.sent.map(([k]) => k)).toEqual(['inputdiag']);
    const [, m] = pc.sent[0]!;
    expect(m).toMatchObject({ v: 3, bk: 'webgl2', m: { ua: 0, sk: 0, cl: 0 } });
    expect(m['in']).toBeUndefined();
    expect(m['stk']).toBeDefined();
    expect(m['t']).toBeGreaterThanOrEqual(INPUT_DIAG_AT_MS_ADAPTATION / 1000);
  });

  it("LATER 1001 (the batch review's F2): the compact report goes once a page load -- a second match on a PC page sends none; an Xbox page reports every match", () => {
    const pc = rig(PC);
    for (const at of [0, 100_000]) { pc.d.begin(at, pc.source); pc.d.frame(at + 1000); pc.d.end(at + 20_000); }
    expect(pc.sent.map(([k]) => k)).toEqual(['inputdiag']);
    const x = rig(XBOX);
    for (const at of [0, 100_000]) { x.d.begin(at, x.source); x.d.frame(at + 1000); x.d.end(at + 20_000); }
    expect(x.sent.map(([k]) => k)).toEqual(['inputdiag', 'inputdiag']);
  });

  it('a loss at 12 s on an Xbox-marked page (2f\'s ask 1): contextdiag with the ring, a sample now, the buffer, the links and the input so far', () => {
    const { d, sent, source } = rig(XBOX);
    d.begin(0, source);
    for (let t = 0; t <= 12_000; t += 16) d.frame(t);
    d.lost('webglcontextlost', 12_100);
    expect(sent.map(([k]) => k)).toEqual(['contextdiag']);
    const m = sent[0]![1] as { why: string; r: number[][]; now: number[]; buf: number[]; lk: number; heap: number; dm: number; in?: unknown };
    expect(m.why).toBe('webglcontextlost');
    expect(sent[0]![1]['v']).toBe(3);                                    // review M2: the ring's clock changed with v2; v3 XBOX-CAUSE-B's lanes
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
    expect(early.sent[0]![1]).toMatchObject({ v: 3, why: 'gpudevicelost', r: [], now: [], m: { sk: 1 } });   // review M2: one version with no load open too
  });

  type LoadReport = { r: number[][]; now: number[]; s: number[][]; sx: number; lt: number; in?: unknown };

  it('XBOX-790-LOADDIAG: a loss during the load, before any mount -- the stages reached, ms after load-start, the heap, each reply\'s KiB', () => {
    const { d, sent } = rig(XBOX);
    d.loadBegin(1000);
    d.loadStage('decode', 1004);
    d.loadStage('map', 9000, { bytes: 50 * 1_048_576, truncated: false });
    d.loadStage('play', 11_000, { bytes: 3 * 1_048_576, truncated: true });
    for (let t = 9000; t <= 11_500; t += 16) d.frame(t);               // no match mounted: frames still read nothing
    d.lost('webglcontextlost', 12_000);
    expect(sent.map(([k]) => k)).toEqual(['contextdiag']);
    const m = sent[0]![1] as LoadReport;
    expect(m.s).toEqual([[0, 0, 900], [sid('decode'), 4, 900], [sid('map'), 8000, 900, 51_200], [sid('play'), 10_000, 900, 3072, 1]]);
    expect([m.lt, m.sx, m.r, m.now]).toEqual([11_000, 0, [], []]);
    expect(m.in).toMatchObject({ emu: 'mouse' });
  });

  it('XBOX-790-LOADDIAG: the mount keeps what the load recorded; the ring counts from load-start; the input report still 45 s after the mount', () => {
    const { d, sent, source } = rig(XBOX);
    d.loadBegin(0);
    d.loadStage('decode-done', 30_000);
    d.begin(40_000, source);
    d.loadStage('first-frame', 41_000);
    for (let t = 40_000; t <= 46_000; t += 16) d.frame(t);
    d.lost('gpudevicelost', 46_100);
    const m = sent[0]![1] as LoadReport;
    expect(m.s.map((row) => row.slice(0, 2))).toEqual([[0, 0], [sid('decode-done'), 30_000], [sid('first-frame'), 41_000]]);
    expect(m.r.map((row) => row[0])).toEqual([40, 42, 44, 46]);
    expect([m.now[0], m.lt]).toEqual([46.1, 46_100]);
    d.frame(84_984);
    expect(sent.map(([k]) => k)).toEqual(['contextdiag']);
    d.frame(85_000);
    expect(sent.map(([k]) => k)).toEqual(['contextdiag', 'inputdiag']);
    expect(sent[1]![1]['t']).toBe(45);
  });

  it('XBOX-790-LOADDIAG: a whole load and 26 s of match on an Xbox page -- every stage kept, the ring\'s newest sample kept, under the cap', () => {
    const { d, sent, source } = rig(XBOX);
    d.loadBegin(0);
    const at: [DiagStage, number, number?][] = [['decode', 5], ['map', 8000, 40], ['play', 9000, 2], ['effects', 12_000, 6], ['sound', 14_000, 1], ['soundLoops', 15_000, 8],
      ['decode-done', 15_010], ['start', 15_020], ['mounted', 15_100]];
    for (const [s, t, mb] of at) d.loadStage(s, t, mb === undefined ? null : { bytes: mb * 1_048_576, truncated: false });
    d.begin(15_100, source);
    for (const [s, t] of [['world-built', 18_000], ['renderer', 18_500], ['warm-settled', 25_000], ['first-frame', 25_100], ['loaded-sent', 25_200]] as [DiagStage, number][]) d.loadStage(s, t);
    for (let t = 15_100; t <= 41_100; t += 16) d.frame(t);
    d.lost('webglcontextlost', 41_200);
    const m = sent.find(([k]) => k === 'contextdiag')![1] as LoadReport;
    expect(m.s).toHaveLength(15);
    expect(m.s.map((row) => row[0])).toEqual([0, ...at.map(([s]) => sid(s)), sid('world-built'), sid('renderer'), sid('warm-settled'), sid('first-frame'), sid('loaded-sent')]);
    expect(m.s[2]).toEqual([sid('map'), 8000, 900, 40_960]);
    expect(m.r.at(-1)![0]).toBe(41.1);
    expect(m.sx).toBe(0);
  });

  it('XBOX-790-LOADDIAG: a stage before any load-start opens the lane (the lobby\'s prepare); a load-start starts it again; the match\'s end lets it go', () => {
    const { d, sent, source } = rig(PC);
    d.loadStage('decode', 500);
    d.loadStage('map', 2500, { bytes: 1024, truncated: false });
    d.lost('webglcontextlost', 3000);
    expect((sent[0]![1] as LoadReport).s).toEqual([[sid('decode'), 0, 900], [sid('map'), 2000, 900, 1]]);
    d.loadBegin(10_000);
    d.loadStage('decode-done', 10_200);
    d.lost('webglcontextlost', 10_300);
    expect((sent[1]![1] as LoadReport).s).toEqual([[0, 0, 900], [sid('decode-done'), 200, 900]]);
    expect((sent[1]![1] as LoadReport).lt).toBe(300);
    d.begin(11_000, source); d.end(12_000);
    d.lost('webglcontextlost', 13_000);
    expect(['s', 'sx', 'lt'].filter((k) => k in sent[2]![1])).toEqual([]);
  });

  it('XBOX-790-LOADDIAG review M1: a load closed with no mount lets its lane go -- a loss during it reports the lane, a loss after it none; a close while a match is attached keeps the match\'s until its end', () => {
    const { d, sent, source } = rig(PC);
    d.loadStage('decode', 500);                                         // the lobby's prepare
    expect(d.loadOpen).toBe(true);
    d.lost('webglcontextlost', 600);
    expect((sent[0]![1] as LoadReport).s).toEqual([[sid('decode'), 0, 900]]);
    d.loadClose();                                                      // let go: no match came of it
    expect(d.loadOpen).toBe(false);
    d.lost('webglcontextlost', 700);
    expect(['s', 'sx', 'lt'].filter((k) => k in sent[1]![1])).toEqual([]);
    d.loadBegin(1000);
    d.begin(2000, source);
    d.loadClose();                                                      // the mounted match's load: its end lets it go, not this
    expect(d.loadOpen).toBe(true);
    d.lost('webglcontextlost', 3000);
    expect((sent[2]![1] as LoadReport).lt).toBe(2000);
    d.end(4000);
    expect(d.loadOpen).toBe(false);
  });

  it("LATER 987: of the loader's stages only a decode opens a lane -- a closed load's late reply, crash or cancel opens none; a load phase still does", () => {
    const { d, sent } = rig(PC);
    d.loadStage('decode', 500);                                         // the lobby's prepare
    d.loadClose();                                                      // the lobby left: the prepare let go
    d.loadStage('map', 4000, { bytes: 1024, truncated: false });        // its late worker reply
    d.loadStage('play', 4100, { bytes: 1024, truncated: false });
    d.loadStage('crash', 4200);
    d.loadStage('cancelled', 4300);
    expect(d.loadOpen).toBe(false);
    d.lost('webglcontextlost', 9000);                                   // a loss later, in the menus
    expect(['s', 'sx', 'lt'].filter((k) => k in sent[0]![1])).toEqual([]);
    d.loadStage('decode', 10_000);                                      // an explicit new decode does open one
    d.loadStage('map', 12_000, { bytes: 1024, truncated: false });
    d.lost('webglcontextlost', 12_500);
    expect((sent[1]![1] as LoadReport).s).toEqual([[sid('decode'), 0, 900], [sid('map'), 2000, 900, 1]]);
    expect((sent[1]![1] as LoadReport).lt).toBe(2500);
    d.loadClose();
    d.loadStage('world-built', 20_000);                                 // a load phase (a match built with no load-start: the Forge's)
    expect(d.loadOpen).toBe(true);
  });

  it('XBOX-790-LOADDIAG: never throws -- a heap read that throws is left off, a payload not finite carries no KiB', () => {
    const sent: Record<string, unknown>[] = [];
    const d = new MatchDiag({ marks: () => PC, backend: () => null, sources: () => NO_SOURCES, page: () => ({}),
      heapMB: () => { throw new Error('no'); }, send: (_k, message) => { sent.push(JSON.parse(message) as Record<string, unknown>); } });
    expect(() => { d.loadBegin(0); d.loadStage('map', 10, { bytes: Number.NaN, truncated: false }); }).not.toThrow();
    d.lost('gpudevicelost', 20);
    expect(sent[0]!['s']).toEqual([[0, 0], [sid('map'), 10]]);
  });
});

describe('XBOX-790-LOADDIAG: the page follows the load -- loadMarks\' listener seam, the loader\'s replies', () => {
  afterEach(() => { setLoadMarkListener(null); });
  const rig = () => {
    const sent: Record<string, unknown>[] = [];
    const d = new MatchDiag({ marks: () => ({ ua: false, sraKmd: false, cls: false }), backend: () => 'webgl2', heapMB: () => 900, sources: () => NO_SOURCES, page: () => ({}),
      send: (_k, message) => { sent.push(JSON.parse(message) as Record<string, unknown>); } });
    return { d, sent };
  };

  it('a load started before the diagnostic was made is caught up (its start, the heap not read then); the phases after it follow', () => {
    markLoad('load-start', null);                                       // the front end's, before the match's chunk is in
    const { d, sent } = rig();
    const now = (): number => globalThis.performance.now();
    followLoad(d, now);
    markLoad('decode-done', null);
    markLoad('start', null);
    d.lost('webglcontextlost', now());
    const s = sent[0]!['s'] as number[][];
    expect(s[0]).toEqual([0, 0]);
    expect(s.slice(1).map((row) => [row[0], row[2]])).toEqual([[sid('decode-done'), 900], [sid('start'), 900]]);
    markLoad('load-start', null);
    d.lost('webglcontextlost', now());
    expect((sent[1]!['s'] as number[][]).map((row) => row[0])).toEqual([0]);
  });

  it('a reply\'s bytes walked (each backing buffer once); progress and loading not stages; an error reply carries no bytes and none of its text', () => {
    const { d, sent } = rig();
    d.loadBegin(0);
    const buf = new ArrayBuffer(4096);
    noteLoadReply({ kind: 'map', id: 1, map: { a: new Uint8Array(buf), b: new Float32Array(buf), c: new Uint8Array(1024) } }, d, () => 10);
    noteLoadReply({ kind: 'progress', id: 1, stage: 'geometry', done: 1, total: 2 }, d, () => 11);
    noteLoadReply({ kind: 'loading', id: 1 }, d, () => 12);
    noteLoadReply({ kind: 'error', id: 2, doing: 'decoding play', message: 'a private path' }, d, () => 13);
    noteLoadReply({ kind: 'index', id: 3 }, d, () => 14);                // not the loader's: not a stage
    d.lost('webglcontextlost', 20);
    expect(sent[0]!['s']).toEqual([[0, 0, 900], [sid('map'), 10, 900, 5], [sid('error'), 13, 900]]);
    expect(JSON.stringify(sent[0])).not.toContain('private');
  });

  it('wired: the page\'s diagnostic follows the load; loadMarks imports none of it (OT.R12); the loader notes its stages and is made with the diagnostic', () => {
    expect(read('../src/matchDiagPage.ts')).toMatch(/followLoad\(made\);/);
    expect(read('../src/loadMarks.ts')).not.toMatch(/from '\.\/matchDiag/);
    const m = read('../src/matchMount.ts');
    const loader = m.slice(m.indexOf('export function matchLoader('));
    expect(loader).toMatch(/pageMatchDiag\(\);/);
    expect(loader).toMatch(/if \(m\.kind === 'progress' \|\| m\.kind === 'loading'\) return;\r?\n\s+noteLoadReply\(m\);/);
    expect(loader.match(/noteLoadStage\('crash'\); stopWorker\(\);/g) ?? []).toHaveLength(2);
    expect(loader).toMatch(/if \(kept\) noteLoadStage\('cancelled'\);\r?\n\s+kept = null;/);
    expect(loader).toMatch(/noteLoadStage\('decode'\);\r?\n\s+const path = missionMapPath\(mission\);/);
  });

  it("LATER 987 review F1: a torn-down mount's late scene warm marks no warm-settled -- the phase would reopen a closed load's lane", () => {
    // A lobby prepare's hidden mount, dropped (`dropPrepared` -> teardown, `gone`; the lane closed) while its warm is in
    // flight: the warm settles later (or fails: both call `settled`) and must not mark the phase `followLoad` reads.
    const m = read('../src/matchMount.ts');
    expect(m).toMatch(/if \(map === m && !gone\) markLoad\('warm-settled'\);/);
  });

  it('review L2: no note call looks the page\'s diagnostic up outside its try -- no default parameter makes it, the loader\'s own making is wrapped', () => {
    expect(read('../src/matchDiagPage.ts')).not.toMatch(/=\s*pageMatchDiag\(\)/);
    const m = read('../src/matchMount.ts');
    const loader = m.slice(m.indexOf('export function matchLoader('));
    expect(loader).toMatch(/try \{ pageMatchDiag\(\); \} catch \{/);
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

  it("B-22 S2 (the batch review's F2): settingdiag keeps its own cap -- eight of them leave the shared diagnostics' budget whole", () => {
    const { b, bodies } = beacon();
    for (let i = 0; i < 8; i++) expect(b.reportDiag('settingdiag', '{"v":1}')).toBe(true);
    for (let i = 0; i < BEACON_DIAGS_PER_LOAD_ADAPTATION; i++) expect(b.reportDiag('contextdiag', '{}')).toBe(true);
    expect(bodies.filter((x) => x['kind'] === 'contextdiag')).toHaveLength(BEACON_DIAGS_PER_LOAD_ADAPTATION);
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
    expect(m).toMatch(/Object\.assign\(pad, gamePad\.extras\(pad, padMenu\)\);\r?\n\s+matchDiag\.gameInput\(pad, true\);/);   // I-4 follow-up: the pad's lanes; the trigger follows the merge (`matchDiag.gameFire`)
    expect(m).toMatch(/matchDiag\.frame\(now\);[^\n]*\r?\n\s+if \(adaptiveRatio\.frame\(/);
  });
});

describe('XBOX-CAUSE-B (product track, an instrument): what a loss after a healthy match carries', () => {
  // The bugs seat's read s7 (`evidence/weekend-mega-2026-11-14/bugs/xbox-loss-read-2026-11-18.md`): seven console losses
  // after 43-119 s of healthy frames, no burst; the rows held counts, not frame times. Each ring sample now carries its
  // interval's frames, its longest frame (ms) and the main thread's own work in that frame (ms: the rest is the GPU's or
  // the compositor's -- the one GPU-process signal a page can read); the reports carry the others' bodies, the room's
  // rows and the seconds since the last program link.
  const rig = (clock: () => number) => {
    const sent: [string, Record<string, unknown>][] = [];
    const d = new MatchDiag({
      marks: () => ({ ua: true, sraKmd: false, cls: false }), backend: () => 'webgl2', sources: () => NO_SOURCES, page: () => ({}), clock,
      send: (kind, message) => { sent.push([kind, JSON.parse(message) as Record<string, unknown>]); },
    });
    return { d, sent };
  };
  const source = (over: Partial<DiagSource> = {}): DiagSource => ({ info: () => info(1), scale: () => 1, buffer: () => ({ w: 640, h: 448 }), phase: () => 8, links: () => 90, ...over });

  it('a ring sample carries its interval’s frames, longest gap and the work of the frame before it (review F1: a light frame, then a 300 ms gap)', () => {
    let work = 4;
    let rafAt = 0;
    const { d, sent } = rig(() => rafAt + work);
    d.begin(0, source());
    // 2 s of 16 ms frames; a 300 ms gap after a light frame (4 ms), the frame after it working 40: the gap reads as spent
    // elsewhere (review F1 corrected this test's first form, which paired the gap with the frame after it).
    let t = 0;
    for (let i = 0; i < 60; i++) { t += 16; rafAt = t; work = 4; d.frame(t); }
    t += 300; rafAt = t; work = 40; d.frame(t);
    for (; t < 2100;) { t += 16; rafAt = t; work = 4; d.frame(t); }
    d.lost('webglcontextlost', t + 1);
    const r = (sent[0]![1]['r'] as (number | null)[][]);
    const last = r[r.length - 1]!;
    expect(last.length).toBe(11);
    expect(last.slice(8)).toEqual([expect.any(Number), 300, 4]);
    expect(last[8]).toBeGreaterThan(60);
  });

  it('contextdiag and inputdiag carry st (the others’ bodies), rs (the room’s rows) and ll (s since the last link)', () => {
    let at = 0;
    const { d, sent } = rig(() => at);
    d.begin(0, source({ seats: () => 15, room: () => 16, lastLink: () => 20_000 }));
    at = 45_000; d.frame(45_000);                                // the input report at 45 s
    at = 50_000; d.lost('webglcontextlost', 50_000);
    const input = sent.find(([k]) => k === 'inputdiag')![1], ctx = sent.find(([k]) => k === 'contextdiag')![1];
    expect([input['st'], input['rs'], input['ll']]).toEqual([15, 16, 25]);
    expect([ctx['st'], ctx['rs'], ctx['ll']]).toEqual([15, 16, 30]);
  });

  it('unread, each is left out; a link never made is left out', () => {
    const { d, sent } = rig(() => 0);
    d.begin(0, source({ lastLink: () => null }));
    d.lost('webglcontextlost', 1000);
    const ctx = sent[0]![1];
    expect([ctx['st'], ctx['rs'], ctx['ll']]).toEqual([undefined, undefined, undefined]);   // left out unread (the size bound)
  });
});

describe('XBOX-CAUSE-B review folds (reviews/xbox-cause-b-review-47ddd3df92.md)', () => {
  const rig = (clock: () => number) => {
    const sent: [string, Record<string, unknown>][] = [];
    const d = new MatchDiag({
      marks: () => ({ ua: true, sraKmd: false, cls: false }), backend: () => 'webgl2', sources: () => NO_SOURCES, page: () => ({}), clock,
      send: (kind, message) => { sent.push([kind, JSON.parse(message) as Record<string, unknown>]); },
    });
    return { d, sent };
  };
  const source = (over: Partial<DiagSource> = {}): DiagSource => ({ info: () => info(1), scale: () => 1, buffer: () => ({ w: 640, h: 448 }), phase: () => 8, links: () => 90, ...over });
  /** 2.1 s of frames: 16 ms apart with 4 ms of work, but at `slowAt` one frame whose own work is `slowWork`, then a `gap` before the next. */
  const drive = (slowWork: number, gap: number) => {
    let rafAt = 0, work = 4;
    const { d, sent } = rig(() => rafAt + work);
    d.begin(0, source());
    let t = 0;
    for (let i = 0; i < 60; i++) { t += 16; rafAt = t; work = 4; d.frame(t); }
    t += 16; rafAt = t; work = slowWork; d.frame(t);              // the frame BEFORE the gap: its own work
    t += gap; rafAt = t; work = 4; d.frame(t);                    // the gap ends here: the frame after is light
    for (; t < 2100;) { t += 16; rafAt = t; work = 4; d.frame(t); }
    d.lost('webglcontextlost', t + 1);
    const r = sent[0]![1]['r'] as (number | null)[][];
    return r[r.length - 1]!;
  };

  it('F1: a long gap is paired with the work of the frame that used it -- a main-thread stall reads as work', () => {
    expect(drive(290, 300).slice(9)).toEqual([300, 290]);        // the frame before the gap worked 290 of it: the main thread
  });

  it('F1: the same gap after a light frame reads as a wait elsewhere (the GPU process or the compositor)', () => {
    expect(drive(4, 300).slice(9)).toEqual([300, 4]);
  });

  it('F5: the loss carries lf, ms since the last frame (a hung frame loop shows)', () => {
    let at = 0;
    const { d, sent } = rig(() => at);
    d.begin(0, source());
    for (let t = 16; t <= 1600; t += 16) { at = t; d.frame(t); }
    d.lost('webglcontextlost', 9600);                             // no frame for 8 s before the loss
    expect(sent[0]![1]['lf']).toBe(8000);
  });

  it('F6: every report says v 3 (the ring rows went from 8 lanes to 11)', () => {
    expect(DIAG_REPORT_VERSION).toBe(3);
  });

  it('F3: a loss in play (the first frame drawn) keeps every ring sample and sheds the load\u2019s stages first', () => {
    const BIG = 9_999_999_999;
    const lane = new StageLane();
    for (let k = 0; k < DIAG_STAGE_LANE_ADAPTATION; k++) lane.write(k % 9, 9_000 + k, 120, 2_000, false);
    const ring = new DiagRing();
    for (let k = 0; k < DIAG_RING_ADAPTATION; k++) ring.write(40 + k * 2, { memory: { geometries: 1100, textures: 220, uniformBuffers: 5600, total: 22 * 1_048_576 }, programs: { length: 140 } }, 0.75, 8, 120, 2_500, 33);
    const t = new InputTrack();
    t.pads = 1; t.padId = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)'; t.mapping = 'standard';
    t.firstButton = 0; t.firstButtonT = 3.2; t.firstStickT = 2.1; t.held = 20; t.frames = 3400; t.framesWithInput = 1900;
    const src: SourcesSnapshot = { menu: { pad: 300, key: 0, ptr: 4 }, match: { pad: 3400, key: 0, ptr: 0 }, last: 'pad', connected: 1, disconnected: 0 };
    const input = inputSummary(t, { emulation: 'gamepad', focus: true, visibility: 'visible', activation: true, pointerLock: false }, src);
    const nowRow = sampleNow(118.4, { memory: { geometries: 1180, textures: 230, uniformBuffers: 7400, total: 24 * 1_048_576 }, programs: { length: 168 } }, 0.75, 8, 90, 2_200, 30);
    const c = { marks: { ua: true, sraKmd: true, cls: true }, backend: 'webgl2', heapMB: 11, deviceMemory: 8, parallelCompile: true, seats: 15, room: 16, sinceLink: 88.4 };
    const inPlay = JSON.parse(contextDiagMessage('webglcontextlost', c, ring, nowRow, { w: 640, h: 448 }, 412, input, { lt: 121_000, lane }, null, true)) as { r: unknown[]; s: unknown[] };
    expect(inPlay.r).toHaveLength(DIAG_RING_ADAPTATION);           // every sample kept ...
    expect(inPlay.s.length).toBeLessThan(DIAG_STAGE_LANE_ADAPTATION);   // ... the stale load's stages shed first
    expect(BIG).toBeGreaterThan(0);
  });
});

describe('XBOX-CAUSE-B re-review folds (reviews/xbox-cause-b-rereview-1bb097225f.md)', () => {
  it('F1: in play is the mount\u2019s own first frame drawn, not the highest load phase (loaded-sent comes before the attach)', () => {
    expect(lossInPlay(true, true)).toBe(true);
    expect(lossInPlay(true, false)).toBe(false);                 // attached, phase 8, but held (XBOX-WARM) or never drawn
    expect(lossInPlay(false, true)).toBe(false);                 // no match running
    expect(lossInPlay(true, null)).toBe(false);                  // a source that cannot say: the ring first, as before
  });

  it('F1: the match hands its own firstDrawn to the diagnostic', () => {
    const m = read('../src/matchMount.ts');
    expect(m).toMatch(/drawn: \(\) => firstDrawn,/);
  });

  it('F2: the true worst in play with lf at its bound still fits whole (no cut fallback), stages shed before samples', () => {
    const BIG = 9_999_999_999;
    const lane = new StageLane();
    for (let k = 0; k < DIAG_STAGE_LANE_ADAPTATION + 99; k++) lane.write(BIG, BIG, BIG, BIG, true);
    const worstInfo: DiagInfo = { memory: { geometries: BIG, textures: BIG, uniformBuffers: BIG, total: BIG * 1_048_576 }, programs: { length: BIG } };
    const ring = new DiagRing();
    for (let k = 0; k < DIAG_RING_ADAPTATION; k++) ring.write(BIG, worstInfo, BIG, -1, BIG, BIG, BIG);
    const nowRow = sampleNow(BIG, worstInfo, BIG, -1, BIG, BIG, BIG);
    const t = new InputTrack();
    t.pads = BIG; t.padId = 'Wireless Controller (Vendor: ffff Product: ffff)'; t.mapping = 'M'.repeat(500);
    t.firstButton = BIG; t.firstButtonT = BIG; t.firstStickT = BIG; t.held = BIG; t.frames = BIG; t.framesWithInput = BIG;
    const src: SourcesSnapshot = { menu: { pad: BIG, key: BIG, ptr: BIG }, match: { pad: BIG, key: BIG, ptr: BIG }, last: 'ptr', connected: BIG, disconnected: BIG };
    const input = inputSummary(t, { emulation: 'E'.repeat(500), visibility: 'V'.repeat(500) }, src);
    const c = { marks: { ua: true, sraKmd: true, cls: true }, backend: 'B'.repeat(500), heapMB: BIG, deviceMemory: BIG, parallelCompile: null, seats: BIG, room: BIG, sinceLink: BIG };
    const s = contextDiagMessage('gpudevicelost'.repeat(5), c, ring, nowRow, { w: BIG, h: BIG }, BIG, input, { lt: BIG, lane }, null, true, BIG);
    expect(s.length).toBeLessThanOrEqual(DIAG_MESSAGE_MAX);
    const d = JSON.parse(s) as { r: unknown[]; s: unknown[]; lf: number; cut?: number };
    expect(d.cut).toBeUndefined();
    expect(d.s).toEqual([]);                                     // in play: every stage before any sample
    expect(d.r.length).toBeGreaterThan(0);
    expect(d.lf).toBe(999_999);
  });
});
