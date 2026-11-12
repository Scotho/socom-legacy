import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * The installable app's icon set (PWA-1). RB-29 (the replay batch; the owner's "S2 Launcher v2" export, its favicon and
 * touch icon, `D:8-9`): the favicons, the touch icon and the manifest's icons are drawn from the project's SL mark,
 * `shared/brand/sl-icon.png` (Phil's kit, `shared/brand/README.md`), in place of the emblem PWA.R2 named; RB.R9 Q1 reads
 * the design as superseding PWA.R2 here, the owner to confirm (the plan's Q14). A browser adaptation: no disc or console
 * picture. `favicon.ico` is the three PNG sizes in one ICO; `favicon.svg` wraps the mark at the design's 64 px. The
 * maskable icon keeps the mark inside the centre 80% (the safe zone a launcher may crop). The screenshots and the
 * offline page are unchanged: the launcher's own chrome -- the emblem and its category names -- never disc media.
 */

/** The SL mark the icons are drawn from (transparent, 256 x 256). */
export const SL_MARK_PATH = fileURLToPath(new URL('../../shared/brand/sl-icon.png', import.meta.url));
/** The design's favicon size (`D:8`, `sl-icon-64.png`). */
const FAVICON_SVG_PX = 64;

/** The launcher's category names as the console draws them (`packages/viewer/src/console/state.ts` `CATS`). */
export const LAUNCHER_SCREEN_LABELS = ['Profile', 'Settings', 'Home', 'Online', 'Experiments'] as const;   // LR.R2

const GROUND = '#000e11';
const GOLD = '#dcb85c';

export interface PngIcon {
  name: string;
  png: Buffer;
  width: number;
  height: number;
}

export interface IconSet {
  faviconSvg: string;
  monochromeSvg: string;
  faviconIco: Buffer;
  png: PngIcon[];
  /** Launcher-chrome screenshots. `svg` is what was rasterised, so a test can see it holds no disc media. */
  screenshots: { name: string; png: Buffer; svg: string; width: number; height: number; formFactor: 'wide' | 'narrow' }[];
}

const innerOf = (svg: string): string => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

/**
 * The SL mark scaled into a square of `size` px, centred, on the ground colour, opaque (an iOS touch icon has no
 * transparency). `scale` 1 fits the mark's square to the icon's; 0.8 is the maskable safe zone.
 */
export async function framedMark(markPng: Buffer, size: number, scale: number): Promise<Buffer> {
  const box = Math.round(size * scale);
  const inner = await sharp(markPng).resize(box, box, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const margin = Math.floor((size - box) / 2);
  return sharp({ create: { width: size, height: size, channels: 3, background: GROUND } })
    .composite([{ input: inner, left: margin, top: margin }])
    .removeAlpha().png().toBuffer();
}

/** An SVG holding the PNG `png` at `px` square: the SVG favicon and the monochrome icon keep their file names and types. */
function pngInSvg(png: Buffer, px: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" role="img" aria-label="SOCOM Legacy"><image width="${px}" height="${px}" href="data:image/png;base64,${png.toString('base64')}"/></svg>`;
}

/** The mark at `px`, transparent around it: the SVG favicon's picture. */
async function markAt(markPng: Buffer, px: number): Promise<Buffer> {
  return sharp(markPng).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

/** The mark as one black silhouette on a clear ground, for `purpose: "monochrome"`. */
async function monochromeMark(markPng: Buffer, px: number): Promise<Buffer> {
  const alpha = await sharp(markPng).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().extractChannel(3).raw().toBuffer();
  return sharp({ create: { width: px, height: px, channels: 3, background: { r: 0, g: 0, b: 0 } } }).joinChannel(alpha, { raw: { width: px, height: px, channels: 1 } }).png().toBuffer();
}

/** The launcher chrome: ground, the emblem, the product name, and the launcher's own category names. No image but the emblem. */
export function launcherScreenshotSvg(emblemSvg: string, form: 'wide' | 'narrow', labels: readonly string[] = LAUNCHER_SCREEN_LABELS): string {
  const wide = form === 'wide';
  const w = wide ? 1280 : 750;
  const h = wide ? 720 : 1334;
  const emblem = wide ? 96 : 128;
  const titleSize = wide ? 42 : 48;
  const rowSize = wide ? 28 : 36;
  const rowH = wide ? 52 : 72;
  const left = wide ? 64 : 48;
  const top = wide ? 48 : 72;
  const rows = labels.map((label, i) => {
    const y = top + emblem + 80 + i * rowH;
    return `<text x="${left}" y="${y}" fill="${GOLD}" font-family="sans-serif" font-size="${rowSize}">${label}</text>`;
  }).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${GROUND}"/>
  <svg x="${left}" y="${top}" width="${emblem}" height="${emblem}" viewBox="0 0 64 64">${innerOf(emblemSvg)}</svg>
  <text x="${left + emblem + 28}" y="${top + emblem * 0.62}" fill="${GOLD}" font-family="sans-serif" font-size="${titleSize}">SOCOM II Legacy</text>
  ${rows}
</svg>`;
}

async function raster(svg: string, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize(width, height, { fit: 'fill' }).flatten({ background: GROUND }).removeAlpha().png().toBuffer();
}

/** A PNG-in-ICO (Vista and later). `size` 256 would be stored as 0; these three are 16, 32 and 48. */
export function encodeIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map((img) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 0);
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(img.png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.png.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((img) => img.png)]);
}

/** The icon set: the icons from the SL mark (`markPng`, by default `SL_MARK_PATH`), the screenshots from the emblem. */
export async function renderIconSet(emblemSvg: string, markPng: Buffer = readFileSync(SL_MARK_PATH)): Promise<IconSet> {
  const pngSpecs: { name: string; size: number; scale: number }[] = [
    { name: 'apple-touch-icon.png', size: 180, scale: 1 },
    { name: 'icon-192.png', size: 192, scale: 1 },
    { name: 'icon-512.png', size: 512, scale: 1 },
    { name: 'icon-maskable-512.png', size: 512, scale: 0.8 },
  ];
  const png: PngIcon[] = [];
  for (const spec of pngSpecs) {
    const body = await framedMark(markPng, spec.size, spec.scale);
    png.push({ name: spec.name, png: body, width: spec.size, height: spec.size });
  }
  const icoSizes = [16, 32, 48];
  const icoPngs: { size: number; png: Buffer }[] = [];
  for (const size of icoSizes) icoPngs.push({ size, png: await framedMark(markPng, size, 1) });
  const shots: { form: 'wide' | 'narrow'; name: string; width: number; height: number }[] = [
    { form: 'wide', name: 'screenshot-wide.png', width: 1280, height: 720 },
    { form: 'narrow', name: 'screenshot-narrow.png', width: 750, height: 1334 },
  ];
  const screenshots = [];
  for (const shot of shots) {
    const svg = launcherScreenshotSvg(emblemSvg, shot.form);
    screenshots.push({ name: shot.name, png: await raster(svg, shot.width, shot.height), svg, width: shot.width, height: shot.height, formFactor: shot.form });
  }
  return {
    faviconSvg: pngInSvg(await markAt(markPng, FAVICON_SVG_PX), FAVICON_SVG_PX),
    monochromeSvg: pngInSvg(await monochromeMark(markPng, 512), 512),
    faviconIco: encodeIco(icoPngs),
    png,
    screenshots,
  };
}

/** The emblem file the icon set is drawn from. */
export function readEmblem(path: string): string {
  return readFileSync(path, 'utf8');
}
