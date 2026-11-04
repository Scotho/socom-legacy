import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { FONTS_RDR, loadLocService } from '@s2u/scene';
import { readTextFaces } from '@s2u/ui';
import { pageUiTextures } from '../../packages/viewer/src/frontEndAssets';
import { rasterizeUiDrawList } from '../../packages/viewer/src/uiCompositorView';
import { HAVE_DISC, DISC, netLoginRig } from '../../packages/ui/test/screens/netLoginRig';
import { decodePng, rgbaToRgb, type Rgb } from '../captureImage';
import { judge, type Rect } from '../captureScore';

/**
 * POPUP-PLACE (web research 142 §3a): where the original puts a POPUPDIALOG popup, checked on the one console frame of
 * a `popupOp.tif` popup the archive holds -- `A_05_online.png` (PCSX2, 640 x 480): LOGIN TO SOCOM II ONLINE with
 * slot 1 holding no configuration, the no-configuration popup (#581, `buttons #226 -> SitHere`) up over the dimmed
 * screen. The port reaches it by the original's own path (`OpenCardOne` on an empty `mc0:` raises the record through
 * the dialog's script, applied by PLAT-16's `SlotPopup.command`: the record's x, y written to the `POPUP` node,
 * `FUN_003157d0` D:L266844-266848). No capture of the main menu's record 517 (the desktop notice's template) exists,
 * so the notice's place is held by the rule this frame confirms: the panel at the record's (x, y) on the 640 x 448
 * screen, not centred, not at the origin. Needs the disc and `SOCOM_PC_ROOT`'s capture; skips without.
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const A05 = ROOT ? resolve(ROOT, 'logs/parity/s4_pcsx2/A_05_online.png') : null;
const ready = HAVE_DISC && A05 !== null && existsSync(A05);
/** Everything but `keep` masked: the four rectangles around it. */
const allBut = ([x0, y0, x1, y1]: Rect): Rect[] => [[0, 0, 640, y0], [0, y1, 640, 448], [0, y0, x0, y1], [x1, y0, 640, y1]];
/** Our frame moved by (dx, dy), the uncovered edge black: the place's sensitivity. */
const moved = (f: Rgb, dx: number, dy: number): Rgb => {
  const out: Rgb = { width: 640, height: 448, data: new Uint8Array(640 * 448 * 3) };
  for (let y = 0; y < 448; y++) for (let x = 0; x < 640; x++) {
    const sx = x - dx, sy = y - dy;
    if (sx < 0 || sy < 0 || sx >= 640 || sy >= 448) continue;
    for (let c = 0; c < 3; c++) out.data[(y * 640 + x) * 3 + c] = f.data[(sy * 640 + sx) * 3 + c]!;
  }
  return out;
};

describe.skipIf(!ready)(`a popup's place against the console's A_05${ready ? '' : ' (no disc or no SOCOM_PC_ROOT capture)'}`, () => {
  it('#581 on LOGIN by the original\'s path: the panel at its record\'s (150, 100), 340 x 280; A_05 scores best within 2 px of it', async () => {
    const src = new FsAssetSource(DISC);
    const fz = Zar.parse(new Uint8Array(readFileSync(resolve(DISC, FONTS_RDR.archive))));
    const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
    const { service } = await loadLocService(src, 'RUN/MP2.ZDB');
    const banks = pageUiTextures(src, ['UIMP']);
    expect(await banks.ready).toEqual([]);
    const t = netLoginRig({
      lists: { 'mc0:': { result: 0, entries: [] }, 'mc1:': { result: 0, entries: [] } },
      face: (n) => faces.find((f) => f.name.toLowerCase() === n.toLowerCase()) ?? null, captions: service,
      hasTexture: (n) => banks.textures(n) !== null,
    });
    t.run(1 + 93 + 10);                                              // ONSTART, OpenCardOne: netLoginScore's SETTLED
    const g = t.m.shell()!;
    expect(g.popups.shown(g.screen)).toBe(true);
    expect([g.screen.popup!.x, g.screen.popup!.y]).toEqual([150, 100]);   // the record's +8 / +12 on the node
    const boxes = t.last().flatMap((d) => (d.kind === 'sprite' && d.node === 'POPUP' ? [[d.texture, d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0]] : []));
    expect(boxes).toEqual([['popupOp.tif', 150, 100, 340, 280], ['active_back.tif', 275, 330, 90, 25]]);
    const r = rasterizeUiDrawList(t.last(), banks.textures);
    const frame: Rgb = rgbaToRgb(640, 448, r.frame.data);
    const a05 = decodePng(new Uint8Array(readFileSync(A05!)));
    expect([a05.width, a05.height]).toEqual([640, 480]);
    const panel: Rect = [150, 100, 490, 380];
    const whole = judge(a05, frame, { pcsx2Letterbox: true });
    const band = judge(a05, frame, { pcsx2Letterbox: true, mask: allBut(panel) });
    const at = (dx: number, dy: number): number => judge(a05, moved(frame, dx, dy), { pcsx2Letterbox: true, mask: allBut(panel) }).score;
    const sweep = [[-10, 0], [10, 0], [0, -10], [0, 10], [-2, 0], [2, 0], [0, 2]].map(([dx, dy]) => at(dx!, dy!));
    console.info(`A_05 whole ${JSON.stringify(whole)}; panel band ${JSON.stringify(band)}; moved ${JSON.stringify(sweep)}`);
    // The record. The whole frame and the panel band both match, and every move of the frame scores lower -- by 2 px
    // as by 10, up as down: the record's place is the best.
    // Until ONL-07 (2026-10-05; research 157 §8) the numbers were 95.2 whole, 87.4 for the band (under the bar) and
    // 87.8 two rows up -- read then as the 4:3 correction's resample over twelve lines of dense glyphs. The cause was
    // the popup's text drawn at alpha 128 where the original gives each line its face's opacity (`FUN_00362b20`,
    // D:L273492): white glyphs where `A_05` shows them at the body text's level. (Before that: 95.1 until FOCUS-RING,
    // the title "LOGIN TO SOCOM II ONLINE" under the dimmed screen, research 116 §17.)
    expect([whole.score, whole.control, whole.matched]).toEqual([99.8, 78, true]);
    expect([band.score, band.control, band.matched]).toEqual([99.6, 38.2, true]);
    expect(sweep).toEqual([91.3, 91.3, 92.9, 90.6, 95.8, 95.8, 97.6]);
    expect(at(0, -2)).toBe(97.6);
  }, 180_000);
});
