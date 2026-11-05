import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  UI_GPU_PARITY_BLENDS, UI_GPU_PARITY_FRAME_FORMAT, UI_GPU_PARITY_MODES, UI_GPU_PARITY_SCALES, boundExcess, coldUploadFailures, coldUploadBoundRun, countDifferingBytes,
  decodeFrameFile, diffImage, encodeFrameFile, encodePng, frameFileStem, parityCases, parityEnv, parityRuns, parseBoundLines,
  provisionalBound, requireBoundRuns, wholeFrameExact, type UiGpuBStats,
} from '../e2e/uiGpuParityRecord';
import { UI_RASTER_CASES, caseRunKey } from './uiRasterCases';

/**
 * GM-11b (the GPU menus plan, row GM-11b; product track for the harness: these are the parity spec's instruments, pure
 * Node, and decide no pixel): the case list and the scale table the spec walks, the env it reads, the differing-byte
 * counter, the diff image, the frame files GM-11c reads, and the provisional bound's arithmetic (GM.R5).
 */

describe('GM-11b: the runs the parity spec walks', () => {
  it('the row\'s scale is 1 (GM-14a adds 2 and 4); both blend legs; both frame modes', () => {
    expect(UI_GPU_PARITY_SCALES).toEqual([1]);
    expect(UI_GPU_PARITY_BLENDS).toEqual(['exact', 'ff']);
    expect(UI_GPU_PARITY_MODES).toEqual(['opaque', 'transparent']);
  });
  it('every case of GM-03\'s table, each key once, in the table\'s order', () => {
    const cases = parityCases(UI_RASTER_CASES);
    expect(cases.map((c) => c.key)).toEqual(UI_RASTER_CASES.map((c) => c.key));
    expect(new Set(cases.map((c) => c.key)).size).toBe(cases.length);
    expect(cases.length, 'GM-03\'s 20 cases: 18 plain, 13 in 3 residencies, 19 at 5 source alphas (GM-11b review F3)').toBe(26);
    expect(cases.map((c) => c.key)).toEqual(expect.arrayContaining(['1', '9', '13.cold', '13.warm', '13.hot', '15', '19.a0', '19.a192', '20']));
  });
  it('a case filter names keys of the table; an unknown key is refused', () => {
    expect(parityCases(UI_RASTER_CASES, '9, 13.hot').map((c) => c.key)).toEqual(['9', '13.hot']);
    expect(parityCases(UI_RASTER_CASES, '').length).toBe(UI_RASTER_CASES.length);
    expect(() => parityCases(UI_RASTER_CASES, '9,99')).toThrow(/99/);
  });
  it('one run per case, scale, mode and blend, keyed as the case pins plus the blend', () => {
    const runs = parityRuns(UI_RASTER_CASES, [1]);
    expect(runs.length).toBe(UI_RASTER_CASES.length * 2 * 2);
    const c9 = UI_RASTER_CASES.find((c) => c.key === '9')!;
    expect(runs.filter((r) => r.key === '9').map((r) => r.run)).toEqual([
      `${caseRunKey(c9, 1, 'opaque')}/exact`, `${caseRunKey(c9, 1, 'opaque')}/ff`,
      `${caseRunKey(c9, 1, 'transparent')}/exact`, `${caseRunKey(c9, 1, 'transparent')}/ff`,
    ]);
    expect(new Set(runs.map((r) => r.run)).size).toBe(runs.length);
    expect(parityRuns(UI_RASTER_CASES, [1, 2, 4]).length).toBe(UI_RASTER_CASES.length * 12);
  });
  it('the whole frame is held at 0 bytes only on an E or E* case under the exact blend; elsewhere the exact class is', () => {
    const byKey = (k: string) => UI_RASTER_CASES.find((c) => c.key === k)!;
    expect(wholeFrameExact(byKey('9'), 'exact')).toBe(true);     // E*
    expect(wholeFrameExact(byKey('7'), 'exact')).toBe(true);     // E
    expect(wholeFrameExact(byKey('9'), 'ff')).toBe(false);
    expect(wholeFrameExact(byKey('6'), 'exact')).toBe(false);    // B
  });
});

describe('GM-11b: the env', () => {
  it('defaults: a scratch directory under the OS temp directory (outside test-results), scale 1, every case, no bound file', () => {
    const e = parityEnv({}, '/web', '/tmp');
    expect(e.out).toBe(join('/tmp', 's2u-ui-gpu-parity'));
    expect(e.scales).toEqual([1]);
    expect(e.cases).toBe('');
    expect(e.bound).toBeNull();
  });
  it('reads S2U_UI_GPU_PARITY_OUT, _SCALES, _CASES and _BOUND', () => {
    const e = parityEnv({ S2U_UI_GPU_PARITY_OUT: '/tmp/p', S2U_UI_GPU_PARITY_SCALES: '4, 1,2', S2U_UI_GPU_PARITY_CASES: '9', S2U_UI_GPU_PARITY_BOUND: '/tmp/s/summary.jsonl' }, '/web');
    expect(e).toEqual({ out: '/tmp/p', scales: [1, 2, 4], cases: '9', bound: '/tmp/s/summary.jsonl' });
  });
  it('refuses an OUT or BOUND inside test-results, which Playwright empties at every run start (GM-11b review F1)', () => {
    for (const p of [resolve('/web/test-results'), resolve('/web/test-results/ui-gpu-parity'), resolve('/web/test-results/a/summary.jsonl')]) {
      expect(() => parityEnv({ S2U_UI_GPU_PARITY_OUT: p }, '/web', '/tmp'), p).toThrow(/S2U_UI_GPU_PARITY_OUT.*test-results/);
      expect(() => parityEnv({ S2U_UI_GPU_PARITY_BOUND: p }, '/web', '/tmp'), p).toThrow(/S2U_UI_GPU_PARITY_BOUND.*test-results/);
    }
    expect(() => parityEnv({ S2U_UI_GPU_PARITY_OUT: 'test-results/x' }, resolve('.'), '/tmp'), 'a relative path inside it').toThrow(/test-results/);
    expect(parityEnv({ S2U_UI_GPU_PARITY_OUT: resolve('/web/test-results-kept') }, '/web', '/tmp').out).toBe(resolve('/web/test-results-kept'));
  });
  it('refuses a scale outside 1, 2, 4 rather than dropping it', () => {
    for (const v of ['3', '1,8', 'x', '0']) expect(() => parityEnv({ S2U_UI_GPU_PARITY_SCALES: v }, '/web'), v).toThrow(/S2U_UI_GPU_PARITY_SCALES/);
    expect(parityEnv({ S2U_UI_GPU_PARITY_SCALES: ' ' }, '/web').scales).toEqual([1]);
  });
});

describe('GM-11b: the differing-byte counter', () => {
  it('counts every byte that differs, and names the first (pixel, channel, both values)', () => {
    const a = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const b = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 0, 8, 9, 0, 0, 12]);
    expect(countDifferingBytes(a, b, 3)).toEqual({ bytes: 12, differ: 3, pixels: 2, first: { index: 6, x: 1, y: 0, channel: 2, a: 7, b: 0 } });
    expect(countDifferingBytes(a, a, 3)).toEqual({ bytes: 12, differ: 0, pixels: 0, first: null });
  });
  it('places the first by the frame width', () => {
    const a = new Uint8Array(16), b = new Uint8Array(16);
    b[13] = 9;
    expect(countDifferingBytes(a, b, 2).first).toEqual({ index: 13, x: 1, y: 1, channel: 1, a: 0, b: 9 });
  });
  it('refuses frames of different sizes', () => {
    expect(() => countDifferingBytes(new Uint8Array(8), new Uint8Array(12), 2)).toThrow(/8.*12/);
  });
});

describe('GM-11b: the diff image', () => {
  it('a differing pixel is red, brighter green with its largest |Δ|; an equal one is the reference dimmed to a quarter grey', () => {
    const a = new Uint8ClampedArray([100, 100, 100, 255, 10, 20, 30, 255]);
    const b = new Uint8ClampedArray([100, 100, 100, 255, 10, 23, 30, 250]);
    const d = diffImage(a, b, 2, 1);
    expect([...d.subarray(0, 4)]).toEqual([25, 25, 25, 255]);
    expect([...d.subarray(4, 8)]).toEqual([255, 5 * 16, 0, 255]);
  });
  it('saturates the green at 255', () => {
    const d = diffImage(new Uint8Array([0, 0, 0, 255]), new Uint8Array([200, 0, 0, 255]), 1, 1);
    expect([...d]).toEqual([255, 255, 0, 255]);
  });
});

describe('GM-11b: the frame files (RGBA and a header: dialog, scale, renderer)', () => {
  const header = { dialog: 'case 9', run: '9@1x/opaque/exact', scale: 1, mode: 'opaque' as const, blend: 'exact' as const, which: 'gpu' as const, width: 2, height: 1, renderer: 'SwiftShader', path: 'gpu' as const };
  it('round-trips the header and the bytes', () => {
    const rgba = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const file = encodeFrameFile(header, rgba);
    const back = decodeFrameFile(file);
    expect(back.header).toEqual({ format: UI_GPU_PARITY_FRAME_FORMAT, ...header });
    expect([...back.rgba]).toEqual([...rgba]);
  });
  it('the header is one JSON line before the bytes', () => {
    const file = encodeFrameFile(header, new Uint8Array(8));
    const nl = file.indexOf(10);
    expect(JSON.parse(new TextDecoder().decode(file.subarray(0, nl))).format).toBe(UI_GPU_PARITY_FRAME_FORMAT);
    expect(file.length - nl - 1).toBe(8);
  });
  it('refuses bytes that are not width x height x 4', () => {
    expect(() => encodeFrameFile(header, new Uint8Array(7))).toThrow(/2 x 1/);
  });
  it('a file stem names the run with no path separators', () => {
    expect(frameFileStem('13.cold@1x/transparent/ff')).toBe('13.cold@1x_transparent_ff');
  });
});

describe('GM-11b: the PNG of a diff image', () => {
  it('is a PNG whose IHDR names the size and whose IDAT inflates to filter-0 rows of RGBA', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 1, 2, 3, 4]);
    const png = encodePng(2, 2, rgba);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(new TextDecoder().decode(png.subarray(12, 16))).toBe('IHDR');
    expect([view.getUint32(16), view.getUint32(20), png[24], png[25]]).toEqual([2, 2, 8, 6]);
    const idatLen = view.getUint32(33);
    expect(new TextDecoder().decode(png.subarray(37, 41))).toBe('IDAT');
    const raw = inflateSync(png.subarray(41, 41 + idatLen));
    expect([...raw]).toEqual([0, ...rgba.subarray(0, 8), 0, ...rgba.subarray(8, 16)]);
    expect(new TextDecoder().decode(png.subarray(png.length - 8, png.length - 4))).toBe('IEND');
  });
  it('carries a correct CRC on each chunk (IEND\'s is the well-known AE426082)', () => {
    const png = encodePng(1, 1, new Uint8Array(4));
    expect([...png.subarray(png.length - 4)]).toEqual([0xae, 0x42, 0x60, 0x82]);
  });
});

describe('GM-11b: the provisional bound, max(twin, SwiftShader) (GM.R5)', () => {
  const s = (maxAbs: number[], atLeast: number[]): UiGpuBStats => ({ maxAbs: maxAbs as UiGpuBStats['maxAbs'], atLeast: atLeast as UiGpuBStats['atLeast'] });
  it('is the per-field max of the twin\'s statistics and an earlier run\'s', () => {
    expect(provisionalBound(s([1, 0, 0, 0], [112, 0, 0]), s([0, 2, 0, 1], [40, 3, 0]))).toEqual(s([1, 2, 0, 1], [112, 3, 0]));
    expect(provisionalBound(s([1, 0, 0, 0], [112, 0, 0]))).toEqual(s([1, 0, 0, 0], [112, 0, 0]));
  });
  it('names every field over the bound; none when within', () => {
    expect(boundExcess(s([1, 0, 0, 0], [5, 0, 0]), s([1, 1, 1, 1], [5, 0, 0]))).toEqual([]);
    expect(boundExcess(s([2, 0, 0, 3], [6, 1, 0]), s([1, 1, 1, 1], [5, 0, 0]))).toEqual([
      'max |Δ| R 2 > 1', 'max |Δ| A 3 > 1', 'pixels at |Δ| >= 1: 6 > 5', 'pixels at |Δ| >= 2: 1 > 0',
    ]);
  });
  it('reads an earlier run\'s summary lines by run key (the last line of a key wins; blank lines between)', () => {
    const text = [
      JSON.stringify({ run: '9@1x/opaque/exact', gpu: s([0, 0, 0, 0], [0, 0, 0]) }),
      '',
      JSON.stringify({ run: '13.cold@1x/opaque/ff', gpu: s([1, 1, 1, 0], [100, 0, 0]) }),
      JSON.stringify({ run: '13.cold@1x/opaque/ff', gpu: s([1, 1, 1, 0], [116, 0, 0]) }),
      '',
    ].join('\r\n');
    const m = parseBoundLines(text);
    expect([...m.keys()]).toEqual(['9@1x/opaque/exact', '13.cold@1x/opaque/ff']);
    expect(m.get('13.cold@1x/opaque/ff')).toEqual(s([1, 1, 1, 0], [116, 0, 0]));
  });
  it('refuses a line it cannot read, by its number, rather than skipping it (GM-11b review F2)', () => {
    const good = JSON.stringify({ run: '9@1x/opaque/exact', gpu: s([0, 0, 0, 0], [0, 0, 0]) });
    expect(() => parseBoundLines(`${good}\nnot json`)).toThrow(/line 2/);
    expect(() => parseBoundLines(`${good}\n${JSON.stringify({ run: 'x' })}`)).toThrow(/line 2.*gpu/);
    expect(() => parseBoundLines(JSON.stringify({ run: 'x', gpu: { maxAbs: [1, 2, 3], atLeast: [0, 0, 0] } }))).toThrow(/line 1/);
    expect(() => parseBoundLines(JSON.stringify({ run: 'x', gpu: { maxAbs: [0, 0, 0, 0], atLeast: [0, 'a', 0] } }))).toThrow(/line 1/);
  });
  it('GM-14a review F5: an L1 line drawn below its scale (l1AtLowerScale) names its run but gives no bound, whatever its gpu field', () => {
    const m = parseBoundLines([
      JSON.stringify({ run: '2@2x/opaque/ff', l1AtLowerScale: true, gpu: s([255, 255, 255, 0], [900000, 800000, 700000]) }),
      JSON.stringify({ run: '2@4x/opaque/ff', l1AtLowerScale: true }),
      JSON.stringify({ run: '9@2x/opaque/ff', l1AtLowerScale: false, gpu: s([0, 0, 0, 0], [0, 0, 0]) }),
    ].join('\n'));
    expect(m.get('2@2x/opaque/ff')).toBeNull();
    expect(m.get('2@4x/opaque/ff')).toBeNull();
    expect(m.get('9@2x/opaque/ff')).toEqual(s([0, 0, 0, 0], [0, 0, 0]));
    expect(() => requireBoundRuns(m, ['2@2x/opaque/ff', '2@4x/opaque/ff', '9@2x/opaque/ff'])).not.toThrow();
    expect(provisionalBound(s([1, 0, 0, 0], [3, 0, 0]), m.get('2@2x/opaque/ff'))).toEqual(s([1, 0, 0, 0], [3, 0, 0]));
  });
  it('refuses a bound file with no run in it', () => {
    expect(() => parseBoundLines('')).toThrow(/no run/);
    expect(() => parseBoundLines('\n\n')).toThrow(/no run/);
  });
  it('refuses a bound file missing any run this run needs, naming them; extra runs are fine', () => {
    const m = parseBoundLines([
      JSON.stringify({ run: 'a/exact', gpu: s([0, 0, 0, 0], [0, 0, 0]) }),
      JSON.stringify({ run: 'b/exact', gpu: s([0, 0, 0, 0], [0, 0, 0]) }),
    ].join('\n'));
    expect(() => requireBoundRuns(m, ['a/exact'])).not.toThrow();
    expect(() => requireBoundRuns(m, ['a/exact', 'c/ff', 'd/ff'])).toThrow(/2 runs.*c\/ff, d\/ff/);
  });
});

describe('GM-14a review F2: the cold-upload leg holds each first frame to what its path owes', () => {
  const s = (maxAbs: number[], atLeast: number[]): UiGpuBStats => ({ maxAbs: maxAbs as UiGpuBStats['maxAbs'], atLeast: atLeast as UiGpuBStats['atLeast'] });
  const gpu = (exactDiffering: number, maxAbs = [1, 0, 0, 0], atLeast = [10, 0, 0]) => ({ exactDiffering, ...s(maxAbs, atLeast) });
  it('a first frame the GPU drew (a case of 0 or 1 texture: the first upload always goes) is held to the exact class and the bound, not to the software', () => {
    expect(coldUploadFailures({ path: 'gpu', why: [], drawnAt: null, differ: 5000, gpu: gpu(0), twin: s([1, 0, 0, 0], [10, 0, 0]), finalPath: 'gpu' }, null)).toEqual([]);
    expect(coldUploadFailures({ path: 'gpu', why: [], drawnAt: null, differ: 5000, gpu: gpu(2), twin: s([1, 0, 0, 0], [10, 0, 0]), finalPath: 'gpu' }, null))
      .toEqual(['E/E*: 2 pixels of the exact class differ']);
    expect(coldUploadFailures({ path: 'gpu', why: [], drawnAt: null, differ: 5000, gpu: gpu(0, [2, 0, 0, 0], [12, 0, 0]), twin: s([1, 0, 0, 0], [10, 0, 0]), finalPath: 'gpu' }, s([1, 0, 0, 0], [11, 0, 0])))
      .toEqual(['B: max |Δ| R 2 > 1', 'B: pixels at |Δ| >= 1: 12 > 11']);
    expect(coldUploadFailures({ path: 'gpu', why: [], drawnAt: null, differ: 0, gpu: null, twin: null, finalPath: 'gpu' }, null))
      .toEqual(['a GPU first frame without its statistics']);
  });
  it('a first frame that fell back is the software\'s at 1x, 0 bytes; one that waited for its textures ends on the GPU', () => {
    const waited = ['textures uploading: 4096 bytes wait for the next frame (HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION)'];
    expect(coldUploadFailures({ path: 'software', why: waited, drawnAt: 1, differ: 0, gpu: null, twin: null, finalPath: 'gpu' }, null)).toEqual([]);
    expect(coldUploadFailures({ path: 'software', why: waited, drawnAt: 2, differ: 3, gpu: null, twin: null, finalPath: 'software' }, null))
      .toEqual(['L1 drawn at 2x, not 1x', 'L1: 3 bytes differ from the software at 1x shown s x s', 'still software after its textures went up']);
    expect(coldUploadFailures({ path: 'software', why: ['steps not drawn on the GPU yet (pass): GM-15'], drawnAt: 1, differ: 0, gpu: null, twin: null, finalPath: 'software' }, null)).toEqual([]);
  });
  it('re-review (1): a transparent GPU first frame is held to the exact class before its divide too (P14/P22), as the main leg', () => {
    const base = { path: 'gpu' as const, why: [], drawnAt: null, differ: 0, gpu: gpu(0), twin: s([1, 0, 0, 0], [10, 0, 0]), finalPath: 'gpu' as const };
    expect(coldUploadFailures({ ...base, preExactDiffering: 0 }, null)).toEqual([]);
    expect(coldUploadFailures({ ...base, preExactDiffering: 3 }, null)).toEqual(['E/E* before the divide: 3 pixels of the exact class differ']);
    expect(coldUploadFailures({ ...base, preExactDiffering: null }, null)).toEqual([]);   // an opaque frame has no divide
  });
  it('a GPU first frame takes the main leg\'s ff run as its bound line (the cold backend blends by the HD default)', () => {
    expect(coldUploadBoundRun('13.hot', 2, 'transparent')).toBe('13.hot@2x/transparent/ff');
  });
});
