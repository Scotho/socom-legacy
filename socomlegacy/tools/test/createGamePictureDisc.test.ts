import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { FONTS_RDR, loadLocService } from '@s2u/scene';
import { readTextFaces } from '@s2u/ui';
import { pageUiTextures } from '../../packages/viewer/src/frontEndAssets';
import { rasterizeUiDrawList } from '../../packages/viewer/src/uiCompositorView';
import { createGameRig } from '../../packages/ui/test/screens/createGameRig';
import { rgbaToRgb, rgbToRgba, type Rgb } from '../captureImage';
import { encodePng } from '../png';

/**
 * The PLAY LIST's picture on the page (web research 164 R164.6; the owner's report of 2026-10-06, "the lobby creation
 * screen is missing the map images"): CREATE GAME (`dlgCreateGame.rdr`) run on the disc's layout and set through
 * `createGameRig`, the popup opened, each default map (OT.R16, OT.R45) focused in turn, and the frame drawn by PLAT-14's drawer
 * with the page's banks as the page loads them (`pageUiTextures` with its default stems, `frontEndAssets.ts`). The
 * set's `DisplayGamePic` shows `CGBack` and `CGPic<n>`, whose bitmap `mp<n>MissPic.tif` is held only by the bank the
 * dialog's `LIBRARIES` names beside UIMP -- `ui/assetlib/uicg`, `RUN/UI/UICG_TXR.ZED`. Pinned: no bitmap left undrawn
 * and the picture's box (`CGPic<n>` at 25, 245, 258 x 130) drawn from the map's own bitmap. Needs the disc; skips without.
 * `CREATE_GAME_PICTURE_OUT` writes the frames as PNGs.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? resolve(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && ['RUN/UI/READERC.ZAR', 'RUN/UI/UICG_TXR.ZED', 'RUN/UIZANIM.ZAR', 'RUN/READERC.ZAR', 'RUN/MP2.ZDB'].every((f) => existsSync(resolve(DISC, f)));

/** `CGPic<n>`'s box in the frame: XPOS 25, YPOS 245, SIZE 258 x 130 (the layout's). */
const PICTURE = [25, 245, 283, 375] as const;
/**
 * The default maps (OT.R16's three, OT.R45's Night Stalker the fourth) by their AVAILABLE_MISSIONS row: the list holds
 * only them, in `missionlist.rdr`'s order (research 164 R164.3).
 */
const MAPS = [[0, 51, 'vigilance'], [1, 72, 'crossroads'], [2, 2, 'frostfire'], [3, 7, 'nightstalker']] as const;

/** The mean absolute difference of two frames over the picture's box, 0..255. */
function boxDiff(a: Rgb, b: Rgb): number {
  const [x0, y0, x1, y1] = PICTURE;
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) { const i = (y * a.width + x) * 3 + c; sum += Math.abs(a.data[i]! - b.data[i]!); n++; }
  return sum / n;
}

describe.skipIf(!HAVE_DISC)(`CREATE GAME's map picture drawn with the page's banks${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  it('each of Vigilance, Crossroads, Frostfire and Night Stalker focused in the PLAY LIST draws its mp<n>MissPic.tif in the picture box; nothing undrawn', async () => {
    const src = new FsAssetSource(DISC);
    const fz = Zar.parse(new Uint8Array(readFileSync(resolve(DISC, FONTS_RDR.archive))));
    const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
    const { service } = await loadLocService(src, 'RUN/MP2.ZDB');
    const banks = pageUiTextures(src);
    expect(await banks.ready).toEqual([]);
    const r = createGameRig({ face: (n) => faces.find((f) => f.name.toLowerCase() === n.toLowerCase()) ?? null, captions: service, hasTexture: (n) => banks.textures(n) !== null });
    await r.enter();
    r.go('SelectGames');
    r.press('CROSS', 10);
    const out = process.env.CREATE_GAME_PICTURE_OUT;
    const draw = (name: string, textures = banks.textures): { frame: Rgb; undrawn: string[] } => {
      const got = rasterizeUiDrawList(r.last(), textures);
      const frame = rgbaToRgb(640, 448, got.frame.data);
      if (out) { mkdirSync(out, { recursive: true }); writeFileSync(resolve(out, `${name}.png`), encodePng(frame.width, frame.height, rgbToRgba(frame))); }
      return { frame, undrawn: got.undrawn };
    };
    for (const [index, n, slug] of MAPS) {
      while (r.list('AVAILABLE_MISSIONS').focus < index) r.press('DOWN', 3);
      r.run(30);                                                                          // the list's scroll settled
      expect([r.node(`CGPic${n}`)!.visible, r.node('CGBack')!.visible]).toEqual([true, true]);
      const pic = `mp${n}MissPic.tif`;
      const drawn = draw(`play_list_${slug}`);
      expect(drawn.undrawn, slug).toEqual(['models']);                                    // every bitmap and glyph drawn; the 3D pass is not this drawer's
      expect(banks.textures(pic), pic).not.toBeNull();
      const without = draw(`play_list_${slug}_without`, (name) => (name.toLowerCase() === pic.toLowerCase() ? null : banks.textures(name)));
      expect(boxDiff(drawn.frame, without.frame), slug).toBeGreaterThan(20);              // the map's own bitmap fills the box
    }
  }, 240_000);

  it('the four rows (OT.R16, OT.R45: the owner\'s four-map list) are drawn in the list\'s own colour: CROSSROADS\'s, FROSTFIRE\'s and NIGHT STALKER\'s names unfocused, as bright as text', async () => {
    const src = new FsAssetSource(DISC);
    const fz = Zar.parse(new Uint8Array(readFileSync(resolve(DISC, FONTS_RDR.archive))));
    const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
    const { service } = await loadLocService(src, 'RUN/MP2.ZDB');
    const banks = pageUiTextures(src);
    expect(await banks.ready).toEqual([]);
    const r = createGameRig({ face: (n) => faces.find((f) => f.name.toLowerCase() === n.toLowerCase()) ?? null, captions: service, hasTexture: (n) => banks.textures(n) !== null });
    await r.enter();
    r.go('SelectGames');
    r.press('CROSS', 10);
    r.run(30);                                                                            // the focus on row 0 (VIGILANCE), the rest unfocused
    const items = r.last();
    const frame = rgbaToRgb(640, 448, rasterizeUiDrawList(items, banks.textures).frame.data);
    // The list's cells in row order (number, name per row); a name cell's own glyphs (not the shadow's) bound its box.
    const cells = items.filter((it) => it.kind === 'glyphs' && it.node === 'AVAILABLE_MISSIONS');
    const brightest = (row: number): number => {
      const it = cells[row * 2 + 1];
      if (!it || it.kind !== 'glyphs') return -1;
      let best = 0;
      for (const q of it.quads.filter((g) => !g.shadow)) {
        for (let y = Math.max(0, Math.floor(q.top)); y < Math.min(frame.height, Math.ceil(q.bottom)); y++) {
          for (let x = Math.max(0, Math.floor(q.left)); x < Math.min(frame.width, Math.ceil(q.right)); x++) {
            const i = (y * frame.width + x) * 3;
            best = Math.max(best, (frame.data[i]! + frame.data[i + 1]! + frame.data[i + 2]!) / 3);
          }
        }
      }
      return best;
    };
    expect(r.list('AVAILABLE_MISSIONS').items.map((it) => `${it.captions[1]} ${it.selectable}`)).toEqual(['VIGILANCE true', 'CROSSROADS true', 'FROSTFIRE true', 'NIGHT STALKER true']);
    const crossroads = brightest(1), frostfire = brightest(2), nightStalker = brightest(3);
    expect(crossroads, `CROSSROADS ${crossroads}`).toBeGreaterThan(120);              // no row in a disabled grey (until 2026-10-07 the rows not offered were)
    expect(frostfire, `FROSTFIRE ${frostfire}`).toBeGreaterThan(120);
    expect(nightStalker, `NIGHT STALKER ${nightStalker}`).toBeGreaterThan(120);
  }, 240_000);
});
