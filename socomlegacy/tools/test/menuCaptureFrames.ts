import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, readZdbMember, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { PaletteTable, type Rgba } from '@s2u/gs';
import { FONTS_RDR, loadLocService } from '@s2u/scene';
import { buildDialogScreen, composeScreen, findNode, loadDialog, readTextFaces } from '@s2u/ui';
import { decodeNamedTextures } from '../../packages/viewer/src/hudBitmaps';
import { flipRows } from '../../packages/viewer/src/hudAssets';
import { rasterizeUiDrawList } from '../../packages/viewer/src/uiCompositorView';
import { rgbaToRgb, type Rgb } from '../captureImage';

/**
 * GM-11c: the software frames `menuCaptureScore.ts`'s rows score, drawn in Node by the reference path -- moved, not
 * rewritten, from `uiCompositorScore.test.ts` (PLAT-14's `drawDialog`; W7.R6, research 112 §7), so the vitest scorer and
 * `menuGpuCompare.test.ts` (which writes the same frame as a GM-11b frame file) draw one frame. Needs the disc.
 */

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

/** What `drawDialog` gives: the frame (RGB), its RGBA as drawn, what was not drawn, and the frame with a node hidden. */
export interface DrawnDialog { frame: Rgb; rgba: Uint8Array; undrawn: string[]; hide: (n: string) => Rgb; hideRgba: (n: string) => Uint8Array }

/**
 * A dialog drawn as built: its `LIBRARIES` (`ui/assetlib/<stem>` -> `RUN/UI/<STEM cut to 4>_TXR.ZED`, `FUN_003199c0`,
 * research 95 §5.1), UIMP (the titlebar face's atlas) and the font library (`FONT_TXR` in a map archive), each bitmap
 * flipped top row first; MENUFADER at 0, where `menu_fade_up` leaves it (research 115 §5).
 */
export async function drawDialog(disc: string, name: string): Promise<DrawnDialog> {
  const read = (p: string): Uint8Array => new Uint8Array(readFileSync(resolve(disc, p)));
  const src = new FsAssetSource(disc);
  const fz = Zar.parse(read(FONTS_RDR.archive));
  const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
  const { service } = await loadLocService(src, 'RUN/MP2.ZDB');
  const z = Zar.parse(read('RUN/UI/READERC.ZAR'));
  const design = loadDialog(parseRdr(z.data(z.find(name)!)));
  const libs: Library[] = [];
  for (const l of design.libraries) {
    if (!('name' in l)) continue;
    const stem = l.name.split('/').pop()!.slice(0, 4).toUpperCase();
    if (existsSync(resolve(disc, `RUN/UI/${stem}_TXR.ZED`))) libs.push(library(read(`RUN/UI/${stem}_TXR.ZED`), read(`RUN/UI/${stem}_PAL.ZED`)));
  }
  libs.push(library(read('RUN/UI/UIMP_TXR.ZED'), read('RUN/UI/UIMP_PAL.ZED')));
  libs.push(library(await readZdbMember(src, 'RUN/MP2.ZDB', 'FONT_TXR.ZED'), await readZdbMember(src, 'RUN/MP2.ZDB', 'FONT_PAL.ZED')));
  const cache = new Map<string, Rgba | null>();
  const textures = (n: string): Rgba | null => {
    const k = n.toLowerCase();
    if (!cache.has(k)) {
      const got = libs.find((l) => l.has(n))?.decode(n) ?? null;
      cache.set(k, got ? flipRows(got) : null);
    }
    return cache.get(k)!;
  };
  const screen = buildDialogScreen(design, {
    face: (n) => faces.find((f) => f.name === n) ?? null, captions: service, hasTexture: (n) => libs.some((l) => l.has(n)),
  });
  screen.fader.opacity = 0;
  const draw = (): { rgba: Uint8Array; undrawn: string[] } => {
    const r = rasterizeUiDrawList(composeScreen(screen), textures);
    return { rgba: new Uint8Array(r.frame.data), undrawn: r.undrawn };
  };
  const hideRgba = (n: string): Uint8Array => { findNode(screen.root, n)!.visible = false; return draw().rgba; };
  const first = draw();
  return {
    frame: rgbaToRgb(640, 448, first.rgba), rgba: first.rgba, undrawn: first.undrawn,
    hide: (n) => rgbaToRgb(640, 448, hideRgba(n)), hideRgba,
  };
}

/** A row's frame name (`menuCaptureScore.ts` `MenuCRow.frame`) split: the dialog and the node it hides, if any. */
export function parseFrameName(frame: string): { dialog: string; hide: string | null } {
  const m = /^(\S+)(?: hide (\S+))?$/.exec(frame);
  if (!m) throw Error(`parseFrameName: ${JSON.stringify(frame)}`);
  return { dialog: m[1]!, hide: m[2] ?? null };
}
