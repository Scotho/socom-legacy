import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { blockScene, pictureScene } from './hdPackBlocksScene';
import { PICTURE_UPSCALE_ADAPTATION, amplifiedDiff, flipRows, maxChannelDiff, panelName, sideBySide, sideBySideName, upscaleNearest } from './hdPackBlocksPicture';
import { encodePng } from '../../../tools/png';

/**
 * WM-PACK-2 RUNTIME (a test instrument, product track; no original): an HD pack's exact KTX2 payloads uploaded as their
 * own BC blocks draw the RGBA path's pixels -- BC7 exactly, BC1/BC2/BC3 within `HD_BLOCK_DECODE_TOLERANCE_ADAPTATION`
 * per channel (a hardware decoder's rounding of interpolated texels; the main controller's ruling on review F1) -- on the
 * WebGL2 fallback and (where this browser has it) WebGPU. Each run names its backend, the kinds its device sampled and the
 * measured largest per-channel difference per kind, and fails when a kind is over its bound: never a silent pass. No disc,
 * no maps: `playwright.hdblocks.config.ts`.
 */
for (const graphics of ['webgl2', 'webgpu'] as const) {
  test(`exact KTX2 payloads as BC blocks draw the RGBA path's pixels (${graphics} asked)`, async ({ page }) => {
    await page.route(/\/__hd-blocks(?:\?|$)/, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
    await page.goto('/__hd-blocks');
    const result = await page.evaluate(async (g) => {
      const path = '/e2e/hdPackBlocksScene.ts';
      const scene = await import(/* @vite-ignore */ path) as { blockScene: typeof blockScene };
      return scene.blockScene(g);
    }, graphics);
    const maxDiff = (a: number[], b: number[]) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i]!)), a.length === b.length ? 0 : Infinity);
    const diffs = result.runs.blocks.map((b, i) => ({ kind: b.kind, diff: maxDiff(b.pixels, result.runs.rgba[i]!.pixels), bound: b.kind === 'bc7' ? 0 : result.tolerance }));
    const line = `[hd-blocks] asked ${graphics}: backend ${result.backend}, BC kinds sampled: ${result.supported.join(', ') || 'none'}; `
      + `max diff ${diffs.map((d) => `${d.kind} ${d.diff}`).join(', ')}`;
    console.log(line);
    test.info().annotations.push({ type: 'hd-blocks', description: line });
    if (graphics === 'webgl2') expect(result.backend).toBe('webgl2');
    // The control: today's plain RGBA texture through the same draw and read-back equals its texels (rows in either
    // order) -- the read-back itself held before the block path is judged by it.
    const rowsOf = (p: number[]) => Array.from({ length: 8 }, (_, y) => p.slice(y * 32, y * 32 + 32).join(','));
    const cw = rowsOf(result.control.texels), cg = rowsOf(result.control.pixels);
    expect(result.control.pixels.length, 'the control read back as tight rows').toBe(8 * 8 * 4);
    expect([cw.join('|'), [...cw].reverse().join('|')], 'the control: a plain RGBA texture reads back as its texels').toContain(cg.join('|'));
    test.skip(graphics === 'webgpu' && result.backend !== 'webgpu', 'this browser has no WebGPU: the WebGL2 fallback drew it (the webgl2 case covers that path)');
    for (const [i, b] of result.runs.blocks.entries()) {
      const r = result.runs.rgba[i]!, d = diffs[i]!;
      expect(r.compressed, `${r.kind}: the forced run stays RGBA`).toBe(false);
      expect(b.compressed, `${b.kind}: blocks exactly where the device samples them`).toBe(result.supported.includes(b.kind));
      expect(d.diff, `${b.kind}: the block upload's largest per-channel difference from the RGBA path, bound ${d.bound}`).toBeLessThanOrEqual(d.bound);
      // The RGBA path's pixels are the payload's decoded texels exactly (an RGBA upload; rows in either order: the
      // backends read back differently).
      const rows = (p: number[]) => Array.from({ length: 8 }, (_, y) => p.slice(y * 32, y * 32 + 32).join(','));
      const want = rows(result.texels[b.kind]!), got = rows(r.pixels);
      expect([want.join('|'), [...want].reverse().join('|')], `${b.kind}: the decode's texels`).toContain(got.join('|'));
    }
  });
}

/**
 * The picture mode for the owner's board (a test instrument), every panel SYNTHETIC (no HD pack art on the box): a smooth
 * gradient (BC3, BC1) and the worst case -- the first test's own block patterns, tiled (BC1, BC2, BC3) -- each uploaded
 * both ways on one page and written beside the run's results (`testInfo.outputPath`): the RGBA path, the block path and
 * the difference amplified (|a - b| x PICTURE_DIFF_GAIN_ADAPTATION, clamped, per channel), each at 1:1 and at
 * PICTURE_UPSCALE_ADAPTATION x nearest, and the three side by side, captioned in the name (columns, max diff). Prints and
 * annotates each panel's measured max difference, and fails above the bound (8) as the first test does.
 */
test('picture: SYNTHETIC gradient and worst-case panels as blocks beside the RGBA path, with the amplified difference', async ({ page }, testInfo) => {
  await page.route(/\/__hd-blocks(?:\?|$)/, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto('/__hd-blocks');
  const result = await page.evaluate(async () => {
    const path = '/e2e/hdPackBlocksScene.ts';
    const scene = await import(/* @vite-ignore */ path) as { pictureScene: typeof pictureScene };
    return scene.pictureScene('webgl2');
  });
  const n = result.size, k = PICTURE_UPSCALE_ADAPTATION, upright = (p: number[]) => result.backend === 'webgl2' ? flipRows(n, n, p) : Uint8ClampedArray.from(p);
  const png = (name: string, w: number, h: number, data: Uint8ClampedArray) => writeFileSync(testInfo.outputPath(name), encodePng(w, h, data));
  const parts: string[] = [];
  for (const r of result.runs) {
    const rgba = upright(r.rgba), blocks = upright(r.blocks), diff = amplifiedDiff(rgba, blocks), max = maxChannelDiff(rgba, blocks);
    for (const [what, img] of [['rgba-path', rgba], ['block-path', blocks], ['diff-x32', diff]] as const) {
      png(panelName(r.panel, r.kind, what), n, n, img);
      png(panelName(r.panel, r.kind, `${what}-${k}x`), n * k, n * k, upscaleNearest(n, n, img, k));
    }
    const side = sideBySide(n, n, [rgba, blocks, diff]);
    png(sideBySideName(r.panel, r.kind, max, 1), side.width, side.height, side.data);
    png(sideBySideName(r.panel, r.kind, max, k), side.width * k, side.height * k, upscaleNearest(side.width, side.height, side.data, k));
    parts.push(`${r.panel} ${r.kind} ${max}${r.blocksCompressed ? '' : ' (not uploaded as blocks: the device lacks the kind)'}`);
    expect(r.rgbaCompressed, `${r.panel} ${r.kind}: the forced run stays RGBA`).toBe(false);
    expect(r.blocksCompressed, `${r.panel} ${r.kind}: blocks exactly where the device samples them`).toBe(result.supported.includes(r.kind));
    expect(max, `${r.panel} ${r.kind}: the SYNTHETIC panel's largest per-channel difference, bound ${result.tolerance}`).toBeLessThanOrEqual(result.tolerance);
  }
  const line = `[hd-blocks] picture (SYNTHETIC panels, ${n}x${n}, also ${k}x): backend ${result.backend}; max diff ${parts.join(', ')}; PNGs in ${testInfo.outputDir}`;
  console.log(line);
  testInfo.annotations.push({ type: 'hd-blocks-picture', description: line });
});
