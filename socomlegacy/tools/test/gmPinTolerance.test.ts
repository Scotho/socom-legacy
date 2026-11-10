import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pinMain, pinRuns, renderTolerancePin, vendorsText, type PinSourceIn } from '../gm-pin-tolerance';

/**
 * GM-27 (the GPU menus plan, row GM-27; GM.R5): the generator of `GPU_RASTER_TOLERANCE_ADAPTATION`'s data -- per run key,
 * field by field, the max over the f32 twin (every line's) and every named run's GPU statistics. A small synthetic set.
 */

const line = (o: Record<string, unknown>): string => JSON.stringify(o);
const st = (maxAbs: number[], atLeast: number[]): { maxAbs: number[]; atLeast: number[] } => ({ maxAbs, atLeast });

describe('GM-27: the pin\'s max rule', () => {
  const a = [
    line({ run: 'r1/ff', path: 'gpu', gpu: st([1, 0, 0, 0], [10, 0, 0]), twin: st([0, 1, 0, 0], [3, 0, 0]) }),
    line({ run: 'r2/exact', path: 'gpu', gpu: st([0, 0, 0, 0], [0, 0, 0]), twin: st([0, 0, 0, 0], [0, 0, 0]) }),
    '',
  ].join('\n');
  const b = [
    line({ run: 'r1/ff', path: 'gpu', gpu: st([0, 0, 1, 0], [25, 0, 0]), twin: st([0, 1, 0, 0], [4, 0, 0]) }),
    // an L1 frame below its scale (GM.R9) and a software frame: the GPU did not draw them; only their twin counts
    line({ run: 'r2/exact', path: 'software', l1AtLowerScale: true, gpu: st([1, 1, 1, 1], [900, 0, 0]), twin: st([0, 0, 0, 0], [0, 0, 0]) }),
    line({ run: 'r3/ff', path: 'software', gpu: st([1, 1, 1, 1], [800, 0, 0]), twin: st([0, 0, 0, 1], [2, 0, 0]) }),
  ].join('\r\n');

  it('is the field-wise max over the twin and every source\'s gpu statistics, per run key, keys sorted', () => {
    const { gpu: runs, counts } = pinRuns([{ label: 'a', text: a }, { label: 'b', text: b }]);
    expect(Object.keys(runs)).toEqual(['r1/ff', 'r2/exact', 'r3/ff']);
    expect(runs['r1/ff']).toEqual(st([1, 1, 1, 0], [25, 0, 0]));
    expect(runs['r2/exact']).toEqual(st([0, 0, 0, 0], [0, 0, 0]));
    expect(runs['r3/ff'], 'a software frame gives its twin only').toEqual(st([0, 0, 0, 1], [2, 0, 0]));
    expect(counts).toEqual({ a: 2, b: 1 });
  });
  it('review F1: two classes -- software the twin and the software rasterisers\' runs only; gpu the twin and every run', () => {
    const hw = [line({ run: 'r1/ff', path: 'gpu', gpu: st([1, 1, 1, 0], [5931, 0, 0]), twin: st([1, 0, 0, 0], [168, 0, 0]) }),
      line({ run: 'r2/ff', path: 'gpu', gpu: st([0, 1, 0, 0], [4, 0, 0]), twin: st([0, 0, 0, 0], [0, 0, 0]) })].join('\n');
    const ss = [line({ run: 'r1/ff', path: 'gpu', gpu: st([1, 1, 0, 0], [176, 0, 0]), twin: st([1, 0, 0, 0], [168, 0, 0]) }),
      line({ run: 'r2/ff', path: 'gpu', gpu: st([0, 0, 1, 0], [9, 0, 0]), twin: st([0, 0, 0, 0], [0, 0, 0]) })].join('\n');
    const { software, gpu } = pinRuns([{ label: 'nv', text: hw }, { label: 'ss', text: ss, software: true }]);
    expect(software['r1/ff'], 'the SwiftShader run and the twin, not NVIDIA\'s 5931').toEqual(st([1, 1, 0, 0], [176, 0, 0]));
    expect(gpu['r1/ff']).toEqual(st([1, 1, 1, 0], [5931, 0, 0]));
    expect(gpu['r2/ff'], 'a software run over the hardware\'s enters the gpu class').toEqual(st([0, 1, 1, 0], [9, 0, 0]));
    expect(software['r2/ff']).toEqual(st([0, 0, 1, 0], [9, 0, 0]));
  });
  it('review F1: a key only hardware measured still gets a software line, the twin\'s', () => {
    const hw = line({ run: 'r9/ff', path: 'gpu', gpu: st([1, 0, 0, 0], [50, 0, 0]), twin: st([0, 1, 0, 0], [3, 0, 0]) });
    const ss = line({ run: 'r1/ff', path: 'gpu', gpu: st([0, 0, 0, 0], [0, 0, 0]), twin: st([0, 0, 0, 0], [0, 0, 0]) });
    const { software, gpu } = pinRuns([{ label: 'nv', text: hw }, { label: 'ss', text: ss, software: true }]);
    expect(software['r9/ff']).toEqual(st([0, 1, 0, 0], [3, 0, 0]));
    expect(Object.keys(software)).toEqual(Object.keys(gpu));
  });
  it('refuses a line it cannot read, naming the source and the line', () => {
    expect(() => pinRuns([{ label: 'a', text: 'nope' }])).toThrow(/a: line 1/);
    expect(() => pinRuns([{ label: 'b', text: line({ run: 'r', path: 'gpu', gpu: st([1, 1, 1], [0, 0, 0]), twin: st([0, 0, 0, 0], [0, 0, 0]) }) }])).toThrow(/b: line 1 \(r\)/);
    expect(() => pinRuns([{ label: 'c', text: line({ path: 'gpu' }) }])).toThrow(/c: line 1/);
  });
  it('refuses a source whose GPU drew no run', () => {
    expect(() => pinRuns([{ label: 'a', text: a }, { label: 'sw', text: line({ run: 'r3/ff', path: 'software', twin: st([0, 0, 0, 0], [0, 0, 0]) }) }])).toThrow(/sw.*no run/);
  });
  it('refuses a pin past |Δ| 1 before it writes anything, naming the key', () => {
    const big = line({ run: '6@4x/opaque/ff', path: 'gpu', gpu: st([2, 1, 1, 0], [216, 4, 0]), twin: st([0, 0, 0, 0], [0, 0, 0]) });
    expect(() => pinRuns([{ label: 'x', text: big }])).toThrow(/6@4x\/opaque\/ff/);
  });
});

describe('GM-27: the vendor line and the module text', () => {
  const src = (label: string, vendor: string, backend: string): PinSourceIn => ({
    label, vendor, backend, host: 'h', unmasked: `ANGLE (${vendor})`, sha: 'abcdef012', date: '2026-11-09', summary: `${label}/summary.jsonl`,
  });
  it('says "one vendor only" with the backends counted when one hardware vendor ran, the software rasterisers after', () => {
    expect(vendorsText([src('a', 'NVIDIA', 'D3D11'), src('b', 'NVIDIA', 'Vulkan'), src('c', 'NVIDIA', 'D3D11'), src('s', 'SwiftShader', 'Vulkan'), src('l', 'llvmpipe', 'OpenGL')]))
      .toBe('one vendor only (NVIDIA: D3D11 x2, Vulkan x1) plus SwiftShader and llvmpipe');
    expect(vendorsText([src('a', 'NVIDIA', 'D3D11'), src('b', 'AMD', 'D3D11'), src('s', 'SwiftShader', 'Vulkan')]))
      .toBe('2 vendors (AMD: D3D11 x1; NVIDIA: D3D11 x1) plus SwiftShader');
  });
  it('writes a data module of the pin: dated, every source, both classes, every run on one line', () => {
    const text = renderTolerancePin({
      pinned: '2026-11-09', vendors: 'one vendor only (NVIDIA: D3D11 x1)',
      sources: [{ ...src('a', 'NVIDIA', 'D3D11'), runs: 2 }],
      software: { 'r1/ff': st([1, 0, 0, 0], [3, 0, 0]) as never, 'r2/exact': st([0, 0, 0, 0], [0, 0, 0]) as never },
      gpu: { 'r1/ff': st([1, 1, 1, 0], [25, 0, 0]) as never, 'r2/exact': st([0, 0, 0, 0], [0, 0, 0]) as never },
    });
    expect(text).toContain('export const UI_GPU_TOLERANCE_PIN: UiGpuTolerancePin = {');
    expect(text).toContain("pinned: '2026-11-09'");
    expect(text.indexOf('  software: {')).toBeGreaterThan(0);
    expect(text.indexOf('  gpu: {')).toBeGreaterThan(text.indexOf('  software: {'));
    expect(text.indexOf("'r1/ff': { maxAbs: [1, 0, 0, 0], atLeast: [3, 0, 0] },")).toBeGreaterThan(text.indexOf('  software: {'));
    expect(text.indexOf("'r1/ff': { maxAbs: [1, 1, 1, 0], atLeast: [25, 0, 0] },")).toBeGreaterThan(text.indexOf('  gpu: {'));
    expect(text).toContain('tools/gm-pin-tolerance.ts');
  });
  it('reads the named summaries under the evidence root, checks each renderer.json, and writes the module', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-pin-'));
    try {
      mkdirSync(join(root, 'a'));
      writeFileSync(join(root, 'a', 'summary.jsonl'), line({ run: 'r1/ff', path: 'gpu', gpu: st([1, 0, 0, 0], [7, 0, 0]), twin: st([0, 0, 0, 0], [1, 0, 0]) }));
      writeFileSync(join(root, 'a', 'renderer.json'), JSON.stringify({ unmasked: 'ANGLE (NVIDIA)' }));
      const sources = join(root, 'sources.json');
      writeFileSync(sources, JSON.stringify([src('a', 'NVIDIA', 'D3D11')]));
      const out = join(root, 'pin.ts');
      pinMain(['--evidence', root, '--sources', sources, '--out', out, '--date', '2026-11-09']);
      const text = readFileSync(out, 'utf8');
      expect(text).toContain("'r1/ff': { maxAbs: [1, 0, 0, 0], atLeast: [7, 0, 0] },");
      expect(text).toContain("vendors: 'one vendor only (NVIDIA: D3D11 x1)'");
      expect(text).toContain('runs: 1 }');
      writeFileSync(join(root, 'a', 'renderer.json'), JSON.stringify({ unmasked: 'ANGLE (Google, SwiftShader)' }));
      expect(() => pinMain(['--evidence', root, '--sources', sources, '--out', out, '--date', '2026-11-09'])).toThrow(/a: renderer\.json/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
