import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { SWAP_MARK_ARROW_TEXELS, SWAP_MARK_TEXTURES, SWAP_MARK_TEXTURE_SIZE, type DialogDesign } from '@s2u/ui';
import { readMenuArt } from '../src/menuArt';

/**
 * WM-51 (WM.R21, the owner's team swap queue; ui `screens/swapMark.ts` `SWAP_MARK_ADAPTATION`): the two disc textures the
 * mark draws, read off the disc -- each one's size (`SWAP_MARK_TEXTURE_SIZE`) and the box its arrow's texels fill
 * (`SWAP_MARK_ARROW_TEXELS`: the bounding box of every texel whose alpha is not 0), which the mark's quad is
 * scaled and placed by so the arrow itself, not the texture's transparent margin, spans the ruled size. Dev disc only:
 * skips without SOCOM_DISC / SOCOM_PC_ROOT (a skip, said).
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '';

const design: DialogDesign = {
  libraries: [{ name: 'ui/assetlib/ui2d' }, { name: 'ui/assetlib/uibf' }], usesMemcard: false, font: 'font_text_01', fontLib: true, background: null,
  bindings: [], controls: [], objects: [], scripts: [], models: [], dropped: [],
};

describe.skipIf(!HAVE_DISC)(`the swap mark's arrow textures over the disc${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  it('arrow_top.tif and arrow_botm.tif: 16 x 16, the arrow\'s texels at columns 3-12, rows 5-10, every other texel transparent', async () => {
    const art = await readMenuArt(new FsAssetSource(DISC), [design]);
    expect(art.missing).toEqual([]);
    for (const name of [SWAP_MARK_TEXTURES.up, SWAP_MARK_TEXTURES.down]) {
      const t = art.textures(name)!;
      expect(t, name).not.toBeNull();
      expect([t.width, t.height], name).toEqual([...SWAP_MARK_TEXTURE_SIZE]);
      let x0 = t.width, y0 = t.height, x1 = -1, y1 = -1;
      for (let y = 0; y < t.height; y++) {
        for (let x = 0; x < t.width; x++) {
          if (t.data[(y * t.width + x) * 4 + 3] === 0) continue;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
      expect([x0, y0, x1 - x0 + 1, y1 - y0 + 1], name).toEqual([...SWAP_MARK_ARROW_TEXELS]);
    }
  }, 60_000);
});
