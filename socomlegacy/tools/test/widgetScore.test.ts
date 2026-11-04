import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, readZdbMember, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { PaletteTable, type Rgba } from '@s2u/gs';
import { FONTS_RDR, loadLocService } from '@s2u/scene';
import { buildDialogScreen, composeScreen, loadDialog, readTextFaces, WidgetSet, type ZAnimUiCommand } from '@s2u/ui';
import { decodeNamedTextures } from '../../packages/viewer/src/hudBitmaps';
import { flipRows } from '../../packages/viewer/src/hudAssets';
import { rasterizeUiDrawList } from '../../packages/viewer/src/uiCompositorView';
import { decodePng, rgbaToRgb, type Rgb } from '../captureImage';
import { judge, type Rect } from '../captureScore';

/**
 * PLAT-15's scored items (W9.R8; web research 117 §13), run through PLAT-30's scorer: a dialog built by PLAT-14, its
 * widgets made, set and drawn by PLAT-15 (`WidgetSet`), rasterised by PLAT-14's viewer drawer with the disc's bitmaps,
 * scored against a capture of the same state. The block's bar is PCSX2's capture; the options menu has none in any
 * archive (golden manifest rows `options.menu`, `options.menu.hdd-row`: recomp frames only), so the PCSX2 score is
 * **owed to OPT-19** and the number here is against the recompiled game's frame of the same state -- recorded, not
 * the bar. No script has run (the instruction line is the dialog's own caption, not the one ONFOCUS writes).
 *
 * Needs the disc (`SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`) and the PC project's run (`SOCOM_PC_ROOT/logs/parity`);
 * skips without them.
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const DISC = [process.env.SOCOM_DISC, ROOT ? resolve(ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, FONTS_RDR.archive))) ?? null;
const RUN = ROOT ? resolve(ROOT, 'logs/parity/runs/options_explore') : null;
const ready = DISC !== null && RUN !== null && existsSync(resolve(RUN, 's05_DOWN.png'));
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(resolve(DISC ?? '', p)));

interface Library { has(name: string): boolean; decode(name: string): Rgba | null }
function library(txr: Uint8Array, pal: Uint8Array): Library {
  const t = Zar.parse(txr), palettes = PaletteTable.fromZars([Zar.parse(pal)]);
  const keys = new Map((t.find('textures')?.children ?? []).map((k) => [k.name.toLowerCase(), k]));
  const texdat = (n: string): Uint8Array | null => {
    const key = keys.get(n.toLowerCase());
    const child = key ? t.child(key, 'texdat') : undefined;
    return child ? t.data(child) : null;
  };
  return { has: (n) => keys.has(n.toLowerCase()), decode: (n) => decodeNamedTextures(texdat, palettes, [n]).textures[n] ?? null };
}

const host = { animation: () => true, hasAnimation: () => true, sound: () => {}, screenEvent: () => {} };
const selection = (node: string, index: number): ZAnimUiCommand => {
  const bytes = new Uint8Array(16);
  bytes[6] = 0xe8 + 4; bytes[8] = index;
  return { anim: '', sequence: '', nodeIndex: 1, node, opcodeByte: 0xe8 + 4, fn: null, arg: '', loc: 0, bytes };
};

/** dlgOptions_Menu drawn as built (research 112), its libraries as `uiCompositorScore.test.ts` loads them, its widgets set by `set`. */
async function drawOptions(set: (w: WidgetSet) => void): Promise<{ frame: Rgb; undrawn: string[] }> {
  const src = new FsAssetSource(DISC ?? '');
  const fz = Zar.parse(read(FONTS_RDR.archive));
  const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
  const { service } = await loadLocService(src, 'RUN/MP2.ZDB');
  const z = Zar.parse(read('RUN/UI/READERC.ZAR'));
  const design = loadDialog(parseRdr(z.data(z.find('dlgOptions_Menu.rdr')!)));
  const libs: Library[] = [];
  for (const l of design.libraries) {
    if (!('name' in l)) continue;
    const stem = l.name.split('/').pop()!.slice(0, 4).toUpperCase();
    if (existsSync(resolve(DISC ?? '', `RUN/UI/${stem}_TXR.ZED`))) libs.push(library(read(`RUN/UI/${stem}_TXR.ZED`), read(`RUN/UI/${stem}_PAL.ZED`)));
  }
  libs.push(library(read('RUN/UI/UIMP_TXR.ZED'), read('RUN/UI/UIMP_PAL.ZED')));
  libs.push(library(await readZdbMember(src, 'RUN/MP2.ZDB', 'FONT_TXR.ZED'), await readZdbMember(src, 'RUN/MP2.ZDB', 'FONT_PAL.ZED')));
  const cache = new Map<string, Rgba | null>();
  const textures = (n: string): Rgba | null => {
    const k = n.toLowerCase();
    if (!cache.has(k)) { const got = libs.find((l) => l.has(n))?.decode(n) ?? null; cache.set(k, got ? flipRows(got) : null); }
    return cache.get(k)!;
  };
  const o = { face: (n: string) => faces.find((f) => f.name === n) ?? null, captions: service, hasTexture: (n: string) => libs.some((l) => l.has(n)) };
  const screen = buildDialogScreen(design, o);
  screen.fader.opacity = 0;
  const widgets = WidgetSet.build(design, screen, o);
  set(widgets);
  const { items } = widgets.draw(composeScreen(screen));
  const r = rasterizeUiDrawList(items, textures);
  return { frame: rgbaToRgb(640, 448, r.frame.data), undrawn: r.undrawn };
}

describe.skipIf(!ready)(`PLAT-15's scores${ready ? '' : ' (no disc or no SOCOM_PC_ROOT run)'}`, () => {
  it('dlgOptions_Menu, AUDIO OPTIONS focused and HDD DISABLED checked, against the recompiled game frame of that state (options_explore s05)', async () => {
    const state = (focus: string) => async () => drawOptions((w) => {
      w.nodeCommand(selection('HDDOnOff', 1), host);                  // the strip on DISABLED, as the frame shows it
      w.tick(1 / 60, host);
      w.get(focus)!.setActive(host);
    });
    const { frame, undrawn } = await state('AudioOpBtn')();
    expect(undrawn).toEqual(['models']);
    const recomp = decodePng(new Uint8Array(readFileSync(resolve(RUN ?? '', 's05_DOWN.png'))));
    expect([recomp.width, recomp.height]).toEqual([640, 448]);       // the recomp's frame: no 4:3 correction (W7.R7)
    const whole = judge(recomp, frame);
    expect([whole.score, whole.control, whole.matched]).toEqual([99.5, 89, true]);
    // The widgets' own region (the five rows, RETURN, the strip), everything else masked: the state the widgets draw.
    const rows: Rect[] = [[0, 0, 640, 100], [0, 310, 640, 448], [0, 100, 16, 310], [450, 100, 640, 310]];
    const own = judge(recomp, frame, { mask: rows });
    const { frame: wrong } = await state('VideoOpBtn')();             // another state's drawing: VIDEO OPTIONS lit instead
    const other = judge(recomp, wrong, { mask: rows });
    expect([own.score, own.control, own.matched]).toEqual([99.1, 75.2, true]);
    expect([other.score, other.matched]).toEqual([95.7, true]);       // the scorer sees the lit row: 3.4 points apart
  });
});
