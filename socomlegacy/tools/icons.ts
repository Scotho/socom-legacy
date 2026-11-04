import { readFileSync } from 'node:fs';
import sharp from 'sharp';

/**
 * The installable app's icon set, drawn from `shared/ds/emblem.svg` and nothing else (PWA-1, PWA.R2).
 * A browser adaptation: no new art, and no disc or console picture. `favicon.ico` is the three PNG sizes
 * in one ICO. The maskable icon keeps the emblem inside the centre 80% (the safe zone a launcher may crop).
 * The screenshots are the launcher's own chrome -- the emblem and the launcher's category names -- never disc media.
 */

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

/** The emblem scaled into a square of `size` px, on the ground colour. `scale` 1 fills the square; 0.8 is the maskable safe zone. */
export function framedEmblem(emblemSvg: string, size: number, scale: number): string {
  const box = size * scale;
  const margin = (size - box) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${GROUND}"/>
  <svg x="${margin}" y="${margin}" width="${box}" height="${box}" viewBox="0 0 64 64">${innerOf(emblemSvg)}</svg>
</svg>`;
}

/** One black silhouette on a clear ground, for `purpose: "monochrome"`. */
export function monochromeEmblem(emblemSvg: string): string {
  return emblemSvg
    .replace(/fill="#000e11"/i, 'fill="none"')
    .replace(/#(?:000e11|c4a04a|786e3b|dcb85c)/gi, '#000');
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

export async function renderIconSet(emblemSvg: string): Promise<IconSet> {
  const pngSpecs: { name: string; size: number; scale: number }[] = [
    { name: 'apple-touch-icon.png', size: 180, scale: 1 },
    { name: 'icon-192.png', size: 192, scale: 1 },
    { name: 'icon-512.png', size: 512, scale: 1 },
    { name: 'icon-maskable-512.png', size: 512, scale: 0.8 },
  ];
  const png: PngIcon[] = [];
  for (const spec of pngSpecs) {
    const body = await raster(framedEmblem(emblemSvg, spec.size, spec.scale), spec.size, spec.size);
    png.push({ name: spec.name, png: body, width: spec.size, height: spec.size });
  }
  const icoSizes = [16, 32, 48];
  const icoPngs: { size: number; png: Buffer }[] = [];
  for (const size of icoSizes) icoPngs.push({ size, png: await raster(framedEmblem(emblemSvg, size, 1), size, size) });
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
    faviconSvg: emblemSvg,
    monochromeSvg: monochromeEmblem(emblemSvg),
    faviconIco: encodeIco(icoPngs),
    png,
    screenshots,
  };
}

/** The emblem file the icon set is drawn from. */
export function readEmblem(path: string): string {
  return readFileSync(path, 'utf8');
}
