import { describe, expect, it, vi } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import type { RasterOptions, UiTextures } from '../src/uiCompositorView';
import * as compositor from '../src/uiCompositorView';
import { planFrame } from '../src/uiFramePlan';
import { uiGpuKeyCounts, uiGpuTextureKey } from '../src/uiGpuTextures';
import { CORPUS_SKIP, HAVE_CORPUS_DISC, walkMenuCorpus, type RecordedFrame } from './uiGpuCorpus';

/**
 * GM-13's owed corpus pin (plan `docs/plans/2026-11-01-gpu-menus.md`, row GM-13 and its 18:01Z/18:18Z Log entries; GM-12a
 * review F4, GM-11a-2 review F4): **no producer rewrites a bitmap it has handed out**. The GPU texture cache keys an
 * image object once (`uiGpuTextures.ts`, a `WeakMap` memo checked by 256 probes); a rewrite between the probes would
 * leave a stale texture on the GPU, so the rule is held here over GM-04's whole corpus (`uiGpuCorpus.ts`: the 114
 * dialogs, dlgMenu with MENULOOP, CREATE GAME, the ARMORY both sides, the Settings overlay, the loader screens) under
 * `'full'` verification -- every byte of every texture each frame names, hashed **as the frame is made** (the walker's
 * per-frame hook; the overlay's frames at the drawer's call, where its recorder sees them), so a rewrite between two
 * frames of one session is seen. Asserted: `uiGpuKeyCounts.rewritten` does not move. Dev-disc (reads the disc through
 * the repository's readers); skips without `SOCOM_DISC` / `SOCOM_PC_ROOT`, naming it. A PRODUCT-TRACK pin of a browser
 * adaptation's precondition: no rule of the game is read or asserted.
 */

const rec = vi.hoisted(() => ({ on: false, frames: [] as { items: readonly UiDrawItem[]; textures: UiTextures; transparent: boolean }[], hook: null as null | ((items: readonly UiDrawItem[], t: UiTextures) => void) }));
vi.mock('../src/uiCompositorView', async (importOriginal) => {
  const actual = await importOriginal<typeof compositor>();
  return {
    ...actual,
    rasterizeUiDrawList: (items: readonly UiDrawItem[], textures: UiTextures, o?: RasterOptions) => {
      if (rec.on) { rec.hook?.(items, textures); rec.frames.push({ items: items.slice(), textures, transparent: o?.transparent === true }); }
      return actual.rasterizeUiDrawList(items, textures, o);
    },
  };
});
const recorder = {
  start: (): void => { rec.frames.length = 0; rec.on = true; },
  stop: (): RecordedFrame[] => { rec.on = false; return rec.frames.splice(0); },
};

describe(`GM-13: no producer rewrites a bitmap it handed out, over GM-04's corpus ('full')${CORPUS_SKIP}`, () => {
  it.skipIf(!HAVE_CORPUS_DISC)('every texture each frame names keeps its bytes from frame to frame (uiGpuKeyCounts.rewritten stays 0)', async () => {
    const before = { ...uiGpuKeyCounts };
    const images = new Set<Rgba>();
    let frames = 0, entries = 0;
    const check = (items: readonly UiDrawItem[], textures: UiTextures): void => {
      frames++;
      const seen = new Set<Rgba>();
      for (const t of planFrame(items, textures).textures) {
        if (seen.has(t.image)) continue;
        seen.add(t.image); images.add(t.image);
        uiGpuTextureKey(t.name, t.image, 'full');
      }
    };
    rec.hook = check;
    try {
      await walkMenuCorpus(recorder, () => { entries++; }, check);
    } finally { rec.hook = null; }
    const rewritten = uiGpuKeyCounts.rewritten - before.rewritten;
    console.info(`[GM-13 rewrite pin] entries ${entries}, frames ${frames}, images ${images.size}, hashed ${uiGpuKeyCounts.hashed - before.hashed}, rewritten ${rewritten}`);
    expect(entries).toBeGreaterThan(100);
    expect(frames).toBeGreaterThan(0);
    expect(images.size).toBeGreaterThan(0);
    expect(rewritten, 'a bitmap rewritten in place after it was handed out').toBe(0);
  }, 3_600_000);
});
