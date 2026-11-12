import { describe, expect, it } from 'vitest';
import {
  PINNED_BOUND_FROM, UI_GPU_LOADING_CASES, UI_GPU_LOADING_UNPINNED_NOTE, boundForRenderer, loadingParityRuns, loadingRunBound, parityBound, parityRuns, pinnedBound,
  parityRunFailures, requireBoundRuns, requireParityBound, wholeFrameExact, type UiGpuBStats,
} from '../e2e/uiGpuParityRecord';
import { GPU_RASTER_TOLERANCE_ADAPTATION, UI_GPU_TOLERANCE_MAX_ABS, checkTolerancePin, type UiGpuTolerancePin } from '../src/uiGpuTolerance';
import { UI_RASTER_CASES } from './uiRasterCases';

/**
 * GM-27 (the GPU menus plan, row GM-27; GM.R5; research 380 §1): the pinned tolerance `GPU_RASTER_TOLERANCE_ADAPTATION`
 * (a browser adaptation with no original: our GPU drawer against our own software drawer), per class -- the software
 * rasterisers and the GPUs (review finding 1) -- the guard that refuses a pin past rounding-class differences, and the
 * parity spec's bound by default: the pin when no `S2U_UI_GPU_PARITY_BOUND` is given (the class by the run's renderer;
 * the loading leg's B judged against it since the GM-27 re-pin, a run it lacks recorded unjudged), the given file when one is.
 */

const s = (maxAbs: number[], atLeast: number[]): UiGpuBStats => ({ maxAbs: maxAbs as UiGpuBStats['maxAbs'], atLeast: atLeast as UiGpuBStats['atLeast'] });
const pin = (runs: Record<string, UiGpuBStats>, gpu: Record<string, UiGpuBStats> = runs): UiGpuTolerancePin =>
  ({ ...GPU_RASTER_TOLERANCE_ADAPTATION, software: runs, gpu });
const ALL_RUNS = parityRuns(UI_RASTER_CASES, [1, 2, 4]);
const LOADING_RUNS = loadingParityRuns(UI_GPU_LOADING_CASES, [1, 2, 4]);
const EXACT_RUNS = ALL_RUNS.filter((r) => wholeFrameExact(UI_RASTER_CASES.find((c) => c.key === r.key)!, r.blend)).map((r) => r.run);
const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
const LLVMPIPE = 'ANGLE (Mesa, llvmpipe (LLVM 20.1.2 256 bits), OpenGL 4.5)';
const A4500 = 'ANGLE (NVIDIA, NVIDIA RTX A4500 (0x00002232) Direct3D11 vs_5_0 ps_5_0, D3D11)';

describe('GM-27: the guard on a pin (the lane holder\'s ruling: rounding-class differences only)', () => {
  it('the contract\'s largest |Δ| is 1', () => {
    expect(UI_GPU_TOLERANCE_MAX_ABS).toBe(1);
  });
  it('takes a pin within |Δ| <= 1 on every channel of every key of both classes', () => {
    expect(() => checkTolerancePin(pin({ 'a@1x/opaque/ff': s([1, 1, 1, 0], [176, 0, 0]), 'b@1x/opaque/exact': s([0, 0, 0, 0], [0, 0, 0]) },
      { 'a@1x/opaque/ff': s([1, 1, 1, 0], [5931, 0, 0]), 'b@1x/opaque/exact': s([0, 0, 0, 0], [0, 0, 0]) }))).not.toThrow();
  });
  it('refuses a key whose max |Δ| is over 1 on any channel, in either class, naming the class, the key and the channel', () => {
    expect(() => checkTolerancePin(pin({ 'ok@1x/opaque/ff': s([1, 1, 1, 1], [3, 0, 0]), '13.warm@4x/opaque/ff': s([1, 2, 1, 0], [5931, 3, 0]) })))
      .toThrow(/software.*13\.warm@4x\/opaque\/ff.*G.*2/);
    expect(() => checkTolerancePin(pin({ 'x@2x/transparent/ff': s([0, 0, 0, 0], [0, 0, 0]) }, { 'x@2x/transparent/ff': s([0, 0, 0, 9], [1, 1, 1]) })))
      .toThrow(/gpu.*x@2x\/transparent\/ff.*A/);
  });
  it('refuses a key counting pixels at |Δ| >= 2 or 3 (impossible within |Δ| <= 1), a malformed one, an empty class, classes with different keys', () => {
    expect(() => checkTolerancePin(pin({ 'y@1x/opaque/ff': s([1, 1, 1, 0], [10, 1, 0]) }))).toThrow(/y@1x\/opaque\/ff.*>= 2/);
    expect(() => checkTolerancePin(pin({ 'z@1x/opaque/ff': s([1, 1, 1], [0, 0, 0]) }))).toThrow(/z@1x\/opaque\/ff/);
    expect(() => checkTolerancePin(pin({ 'w@1x/opaque/ff': s([0, 0, 0, 0], [-1, 0, 0]) }))).toThrow(/w@1x\/opaque\/ff/);
    expect(() => checkTolerancePin(pin({}))).toThrow(/no run/);
    expect(() => checkTolerancePin(pin({ 'a@1x/opaque/ff': s([0, 0, 0, 0], [0, 0, 0]) }, { 'b@1x/opaque/ff': s([0, 0, 0, 0], [0, 0, 0]) })))
      .toThrow(/a@1x\/opaque\/ff|b@1x\/opaque\/ff/);
  });
});

describe('GM-27: GPU_RASTER_TOLERANCE_ADAPTATION, pinned per class: the software rasterisers and the GPUs (GM.R5)', () => {
  const t = GPU_RASTER_TOLERANCE_ADAPTATION;
  it('is dated, says one vendor only, and names each source with its host, UNMASKED_RENDERER and sha', () => {
    expect(t.pinned).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(t.vendors).toMatch(/^one vendor only \(NVIDIA: /);
    for (const src of t.sources) {
      expect(src.host.length, src.label).toBeGreaterThan(0);
      expect(src.unmasked, src.label).toMatch(/^ANGLE \(/);
      expect(src.sha, src.label).toMatch(/^[0-9a-f]{9,40}$/);
      expect(src.date, src.label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(src.runs, src.label).toBeGreaterThan(0);
    }
    const nvidia = t.sources.filter((x) => x.vendor === 'NVIDIA');
    expect(nvidia.map((x) => x.backend).sort(), 'NVIDIA: D3D11 x4 (the A4500 and the 4070 SUPER, before and after the flip), Vulkan x1 (the T4)')
      .toEqual(['D3D11', 'D3D11', 'D3D11', 'D3D11', 'Vulkan']);
    expect(t.vendors).toBe('one vendor only (NVIDIA: D3D11 x4, Vulkan x1) plus SwiftShader and llvmpipe');
    expect(nvidia.every((x) => x.unmasked.includes('NVIDIA'))).toBe(true);
    expect(new Set(t.sources.map((x) => x.vendor))).toEqual(new Set(['NVIDIA', 'SwiftShader', 'llvmpipe']));
  });
  it('holds a line in each class for every run of GM-03\'s table at 1, 2 and 4, and for every run of the loading leg (exact only)', () => {
    expect(ALL_RUNS.length).toBe(312);
    expect(LOADING_RUNS.length).toBe(18);
    for (const cls of ['software', 'gpu'] as const) {
      expect(() => requireBoundRuns(pinnedBound(t, [], cls), [...ALL_RUNS, ...LOADING_RUNS].map((r) => r.run)), cls).not.toThrow();
      expect(Object.keys(t[cls]).length, cls).toBe(ALL_RUNS.length + LOADING_RUNS.length);
      expect(Object.keys(t[cls]).filter((k) => k.startsWith('loading.')).sort(), cls).toEqual(LOADING_RUNS.map((r) => r.run).sort());
      expect(Object.keys(t[cls]).filter((k) => k.startsWith('loading.')).every((k) => k.endsWith('/exact')), cls).toBe(true);
    }
  });
  it('the re-pin\'s sources: the four records at cf124a15c that carry the loading lines (the A4500 and the 4070 SUPER, each with its host\'s SwiftShader)', () => {
    const flip = t.sources.filter((x) => x.sha === 'cf124a15cea9cb31d41a8a09d262c67fc7f2fd5e');
    expect(flip.map((x) => x.vendor).sort()).toEqual(['NVIDIA', 'NVIDIA', 'SwiftShader', 'SwiftShader']);
    for (const x of flip) expect(x.runs, x.label).toBe(330);
  });
  it('the loading runs\' bound is rounding class: max |Δ| 1 (loading.black 0), loading.alpha192@4x the largest count, 1814 in both classes', () => {
    for (const cls of ['software', 'gpu'] as const) {
      for (const r of LOADING_RUNS) expect(Math.max(...t[cls][r.run]!.maxAbs), `${cls} ${r.run}`).toBe(r.key === 'loading.black' ? 0 : 1);
      expect(t[cls]['loading.alpha192@4x/opaque/exact'], cls).toEqual(s([1, 1, 1, 0], [1814, 0, 0]));
    }
  });
  it('the software class is the software rasterisers\' own: 13.warm@4x/ff 176 there, 5931 for the GPUs; no software key over the GPU class', () => {
    expect(t.software['13.warm@4x/opaque/ff']).toEqual(s([1, 1, 1, 0], [176, 0, 0]));
    expect(t.gpu['13.warm@4x/opaque/ff']).toEqual(s([1, 1, 1, 0], [5931, 0, 0]));
    for (const k of Object.keys(t.gpu)) {
      t.software[k]!.atLeast.forEach((v, i) => expect(v, `${k} >= ${i + 1}`).toBeLessThanOrEqual(t.gpu[k]!.atLeast[i]!));
    }
  });
  it('is 0 on every field of every E/E* run under exact, in both classes (the whole frame is held at 0 bytes, whatever the tolerance)', () => {
    expect(EXACT_RUNS.length).toBeGreaterThan(0);
    for (const run of EXACT_RUNS) {
      expect(t.software[run], run).toEqual(s([0, 0, 0, 0], [0, 0, 0]));
      expect(t.gpu[run], run).toEqual(s([0, 0, 0, 0], [0, 0, 0]));
    }
  });
});

describe('GM-27: the parity spec\'s bound by default', () => {
  const file = [
    JSON.stringify({ run: '9@1x/opaque/exact', gpu: s([0, 0, 0, 0], [0, 0, 0]) }),
    JSON.stringify({ run: '13.cold@1x/opaque/ff', gpu: s([1, 1, 1, 0], [14, 0, 0]) }),
  ].join('\n');
  it('with no S2U_UI_GPU_PARITY_BOUND: the pin, named GPU_RASTER_TOLERANCE_ADAPTATION, and no file read', () => {
    const read = (): string => { throw Error('read'); };
    const b = parityBound(null, read, EXACT_RUNS);
    expect(b.from).toBe(PINNED_BOUND_FROM);
    expect(b.pinned).toBe(true);
    expect(PINNED_BOUND_FROM).toBe('GPU_RASTER_TOLERANCE_ADAPTATION');
    expect(b.gpu.size).toBe(ALL_RUNS.length + LOADING_RUNS.length);
    expect(b.software.size).toBe(ALL_RUNS.length + LOADING_RUNS.length);
  });
  it('picks the class from the run\'s renderer (isSoftwareAdapter): SwiftShader and llvmpipe the software class; any other renderer, AMD and Intel too, the GPU class', () => {
    const b = parityBound(null, () => '', EXACT_RUNS);
    const k = '13.warm@4x/opaque/ff';
    expect(boundForRenderer(b, SWIFTSHADER).get(k)).toEqual(s([1, 1, 1, 0], [176, 0, 0]));
    expect(boundForRenderer(b, LLVMPIPE).get(k)).toEqual(s([1, 1, 1, 0], [176, 0, 0]));
    for (const r of [A4500, 'ANGLE (AMD, Radeon Pro V520 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)', null]) {
      expect(boundForRenderer(b, r).get(k), String(r)).toEqual(s([1, 1, 1, 0], [5931, 0, 0]));
    }
  });
  it('with a file given: that file, as before, for every renderer (S2U_UI_GPU_PARITY_BOUND, the last line of a key wins)', () => {
    const seen: string[] = [];
    const b = parityBound('/tmp/ss/summary.jsonl', (p) => { seen.push(p); return file; });
    expect(seen).toEqual(['/tmp/ss/summary.jsonl']);
    expect(b.from).toBe('/tmp/ss/summary.jsonl');
    expect(b.pinned).toBe(false);
    expect([...boundForRenderer(b, SWIFTSHADER).keys()]).toEqual(['9@1x/opaque/exact', '13.cold@1x/opaque/ff']);
    expect(boundForRenderer(b, A4500).get('13.cold@1x/opaque/ff')).toEqual(s([1, 1, 1, 0], [14, 0, 0]));
  });
  it('refuses at load a pin over |Δ| 1, naming the key', () => {
    expect(() => pinnedBound(pin({ 'k@4x/opaque/ff': s([3, 0, 0, 0], [1, 1, 1]) }))).toThrow(/k@4x\/opaque\/ff/);
  });
  it('refuses at load a pin that would let an E/E* run under exact differ, in either class', () => {
    const z = { '9@1x/opaque/exact': s([0, 0, 0, 0], [0, 0, 0]) }, nz = { '9@1x/opaque/exact': s([1, 0, 0, 0], [2, 0, 0]) };
    expect(() => pinnedBound(pin(nz, z), ['9@1x/opaque/exact'], 'software')).toThrow(/9@1x\/opaque\/exact.*E\/E\*/);
    expect(() => pinnedBound(pin(z, nz), ['9@1x/opaque/exact'], 'gpu')).toThrow(/9@1x\/opaque\/exact.*E\/E\*/);
    expect(() => pinnedBound(pin({ '9@1x/opaque/ff': s([1, 0, 0, 0], [2, 0, 0]) }), ['9@1x/opaque/exact'])).not.toThrow();
  });
  it('a run the pin does not hold is refused by its name, the pin named as the source (re-pin with tools/gm-pin-tolerance.ts)', () => {
    expect(() => requireBoundRuns(pinnedBound(), ['99@1x/opaque/ff'], PINNED_BOUND_FROM)).toThrow(/GPU_RASTER_TOLERANCE_ADAPTATION: 1 runs.*99@1x\/opaque\/ff/);
  });
});

// GM-27 review F2, re-done by the 4070 evidence run's finding 1: under the pin the loading leg RUNS -- since the re-pin
// its B judged against the pin's lines; a run a pin lacks is judged on E/E*, the L1 rules and the owed path, its B
// recorded unjudged -- so a SwiftShader run made to serve as the bound writes its loading lines; with a file bound, its
// loading lines are required and B judged against them.
describe('GM-27 review F2 / the 4070 run finding 1: the loading leg (GM-30) under the pin, B judged (unjudged where a key is missing)', () => {
  const main = ALL_RUNS.map((r) => r.run), loading = LOADING_RUNS.map((r) => r.run);
  const twin = s([1, 1, 1, 0], [4, 0, 0]);
  const SW = 'Google SwiftShader', GPU = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)';
  it('the loading leg has runs, and the note says B is unjudged', () => {
    expect(loading.length).toBeGreaterThan(0);
    expect(UI_GPU_LOADING_UNPINNED_NOTE).toBe('B unjudged: no pinned bound yet');
  });
  it('with no file: every run held to the pin, the loading leg\'s B judged against its class\'s line max the twin\'s, no note', () => {
    const b = parityBound(null, () => '', EXACT_RUNS);
    expect(() => requireParityBound(b, main, loading)).not.toThrow();
    expect(() => requireParityBound(b, [...main, '99@1x/opaque/ff'], loading)).toThrow(/GPU_RASTER_TOLERANCE_ADAPTATION: 1 runs.*99@1x/);
    for (const run of loading) {
      for (const r of [SW, GPU]) {
        const { bound, note } = loadingRunBound(b, r, run, twin);
        expect(note, `${r} ${run}`).toBeNull();
        expect(bound, `${r} ${run}`).not.toBeNull();
      }
    }
    expect(loadingRunBound(b, GPU, 'loading.up@4x/opaque/exact', twin)).toEqual({ bound: s([1, 1, 1, 0], [1335, 0, 0]), note: null });
  });
  it('a pin that lacks a loading key: that run neither refused nor skipped, no bound and the note (B unjudged)', () => {
    const drop = <T,>(r: Readonly<Record<string, T>>): Record<string, T> =>
      Object.fromEntries(Object.entries(r).filter(([k]) => k !== loading[0]));
    const p = { ...GPU_RASTER_TOLERANCE_ADAPTATION, software: drop(GPU_RASTER_TOLERANCE_ADAPTATION.software), gpu: drop(GPU_RASTER_TOLERANCE_ADAPTATION.gpu) };
    const b = { from: PINNED_BOUND_FROM, pinned: true, software: pinnedBound(p, EXACT_RUNS, 'software'), gpu: pinnedBound(p, EXACT_RUNS, 'gpu') };
    expect(() => requireParityBound(b, main, loading)).not.toThrow();
    for (const r of [SW, GPU]) expect(loadingRunBound(b, r, loading[0]!, twin), r).toEqual({ bound: null, note: UI_GPU_LOADING_UNPINNED_NOTE });
    expect(loadingRunBound(b, GPU, loading[1]!, twin).note).toBeNull();
  });
  it('with no file bound, parityRunFailures judges E/E*, L1 and the path, and no B (bound null)', () => {
    const o = {
      scale: 2 as const, path: 'gpu' as const, why: [], expectGpu: true, refusal: null, drawnAt: 2, l1Differ: null, pageDiffer: 9, nodeDiffer: 9,
      gpu: { maxAbs: [3, 3, 3, 0] as [number, number, number, number], atLeast: [99, 50, 9] as [number, number, number], exactDiffering: 0 }, pre: null,
    };
    expect(parityRunFailures(o, { gpu: 'B' }, 'ff', null)).toEqual([]);
    expect(parityRunFailures({ ...o, gpu: { ...o.gpu, exactDiffering: 2 } }, { gpu: 'B' }, 'ff', null)).toEqual(['E/E*: 2 pixels of the exact class differ']);
    expect(parityRunFailures({ ...o, path: 'software', drawnAt: 1, l1Differ: 0 }, { gpu: 'B' }, 'ff', null)[0]).toMatch(/owed on the GPU/);
  });
  it('a pin that holds the loading runs (after the re-pin) bounds them: the pin\'s line max the twin\'s, no note', () => {
    const zero = s([0, 0, 0, 0], [0, 0, 0]);
    const runs = Object.fromEntries([...main, ...loading].map((k) => [k, zero]));
    const b = { from: PINNED_BOUND_FROM, pinned: true, software: pinnedBound(pin(runs), [], 'software'), gpu: pinnedBound(pin(runs), [], 'gpu') };
    expect(() => requireParityBound(b, main, loading)).not.toThrow();
    expect(loadingRunBound(b, GPU, loading[0]!, twin)).toEqual({ bound: twin, note: null });
  });
  it('with a file: every run held to it, the loading runs required as before and B judged against their lines', () => {
    const lines = (runs: string[]): string => runs.map((run) => JSON.stringify({ run, gpu: s([1, 1, 1, 1], [7, 0, 0]) })).join('\n');
    const f = parityBound('/f', () => lines([...main, ...loading]));
    expect(() => requireParityBound(f, main, loading)).not.toThrow();
    expect(() => requireParityBound(parityBound('/f', () => lines(main)), main, loading)).toThrow(new RegExp(`/f: ${loading.length} runs.*loading\\.`));
    expect(loadingRunBound(f, SW, loading[0]!, twin)).toEqual({ bound: s([1, 1, 1, 1], [7, 0, 0]), note: null });
  });
});
