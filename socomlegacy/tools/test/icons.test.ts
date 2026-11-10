import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { LAUNCHER_SCREEN_LABELS, renderIconSet, SL_MARK_PATH } from '../icons';

/**
 * PWA-1, re-pinned by RB-29 (the owner's "S2 Launcher v2" export, its favicon and touch icon): the favicons, the touch
 * icon and the manifest's icons are rendered from the SL mark, `shared/brand/sl-icon.png`, and nothing else. A browser
 * adaptation. Screenshots stay the launcher's category names and the emblem on the ground colour, never disc media.
 */

const repo = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const emblem = readFileSync(resolve(repo, 'shared/ds/emblem.svg'), 'utf8');
const mark = readFileSync(resolve(repo, 'shared/brand/sl-icon.png'));

const rgb = (data: Buffer, width: number, channels: number, x: number, y: number): number[] => {
  const i = (y * width + x) * channels;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
};

const GROUND = [0, 14, 17];
const isGround = (p: number[]): boolean => Math.abs(p[0]! - GROUND[0]!) < 6 && Math.abs(p[1]! - GROUND[1]!) < 6 && Math.abs(p[2]! - GROUND[2]!) < 6;
/** The SL mark's blue `S` -- a colour the emblem (`#000e11`, `#c4a04a`, `#786e3b`, `#dcb85c`) does not hold. */
const isBlue = (p: number[]): boolean => p[2]! > 180 && p[1]! > 110 && p[0]! < 90;

async function hasBlue(png: Buffer): Promise<boolean> {
  const raw = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < raw.info.height; y++) {
    for (let x = 0; x < raw.info.width; x++) if (isBlue(rgb(raw.data, raw.info.width, raw.info.channels, x, y))) return true;
  }
  return false;
}

/** The PNG an icon SVG wraps (`<image href="data:image/png;base64,...">`). */
function embeddedPng(svg: string): Buffer {
  const m = /href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/.exec(svg);
  expect(m, 'an embedded PNG').not.toBeNull();
  return Buffer.from(m![1]!, 'base64');
}

describe('PWA-1 / RB-29: icons from the SL mark', () => {
  it('reads the mark from shared/brand/sl-icon.png by default', async () => {
    expect(SL_MARK_PATH.replace(/\\/g, '/')).toMatch(/shared\/brand\/sl-icon\.png$/);
    expect(readFileSync(SL_MARK_PATH).equals(mark)).toBe(true);
    const byDefault = await renderIconSet(emblem);
    const given = await renderIconSet(emblem, mark);
    expect(byDefault.png.map((p) => p.png.toString('base64'))).toEqual(given.png.map((p) => p.png.toString('base64')));
  }, 60_000);

  it('renders the set from the mark: sizes, PNG, opaque apple icon, maskable safe zone, ICO, the mark\'s blue in each', async () => {
    const set = await renderIconSet(emblem, mark);

    const byName = new Map(set.png.map((p) => [p.name, p]));
    for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]] as const) {
      const icon = byName.get(name)!;
      expect(icon.width).toBe(size);
      expect(icon.height).toBe(size);
      expect(icon.png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const meta = await sharp(icon.png).metadata();
      expect(meta.hasAlpha, name).toBe(false);
      expect(meta.channels, name).toBe(3);
      expect(await hasBlue(icon.png), name).toBe(true);
    }

    const mask = byName.get('icon-maskable-512.png')!;
    const raw = await sharp(mask.png).raw().toBuffer({ resolveWithObject: true });
    expect(rgb(raw.data, raw.info.width, raw.info.channels, 0, 0)).toEqual(GROUND);
    expect(rgb(raw.data, raw.info.width, raw.info.channels, 20, 20)).toEqual(GROUND);
    let markInMargin = false;
    let markInside = false;
    for (let y = 0; y < 512; y += 2) {
      for (let x = 0; x < 512; x += 2) {
        if (isGround(rgb(raw.data, raw.info.width, raw.info.channels, x, y))) continue;
        const margin = x < 51 || y < 51 || x > 460 || y > 460;
        if (margin) markInMargin = true;
        else markInside = true;
      }
    }
    expect(markInMargin).toBe(false);
    expect(markInside).toBe(true);

    // The full icon draws the mark as wide as the square holds it: the mark reaches within 40 px of the left edge.
    const full = await sharp(byName.get('icon-512.png')!.png).raw().toBuffer({ resolveWithObject: true });
    let markNearEdge = false;
    for (let y = 0; y < 512 && !markNearEdge; y += 2) {
      for (let x = 0; x < 40; x += 2) {
        if (!isGround(rgb(full.data, full.info.width, full.info.channels, x, y))) markNearEdge = true;
      }
    }
    expect(markNearEdge).toBe(true);

    expect(set.faviconIco.readUInt16LE(0)).toBe(0);
    expect(set.faviconIco.readUInt16LE(2)).toBe(1);
    expect(set.faviconIco.readUInt16LE(4)).toBe(3);
    const sizes: number[] = [];
    for (let i = 0; i < 3; i++) {
      sizes.push(set.faviconIco.readUInt8(6 + i * 16));
      const len = set.faviconIco.readUInt32LE(6 + i * 16 + 8);
      const off = set.faviconIco.readUInt32LE(6 + i * 16 + 12);
      expect(set.faviconIco.subarray(off, off + 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(len).toBeGreaterThan(8);
      expect(await hasBlue(set.faviconIco.subarray(off, off + len)), `ico ${sizes[i]}`).toBe(true);
    }
    expect(sizes).toEqual([16, 32, 48]);
  }, 60_000);

  it('the SVG favicon is the mark at the design\'s 64 px (D:8), and the monochrome icon its black silhouette', async () => {
    const set = await renderIconSet(emblem, mark);
    expect(set.faviconSvg).not.toBe(emblem);
    expect(set.faviconSvg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]* viewBox="0 0 64 64"/);
    expect(set.faviconSvg).toContain('role="img"');
    expect(set.faviconSvg).toContain('aria-label="SOCOM Legacy"');
    const fav = embeddedPng(set.faviconSvg);
    const meta = await sharp(fav).metadata();
    expect([meta.width, meta.height, meta.hasAlpha]).toEqual([64, 64, true]);
    expect(await hasBlue(fav)).toBe(true);

    const mono = embeddedPng(set.monochromeSvg);
    const raw = await sharp(mono).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let opaque = 0;
    let coloured = 0;
    for (let i = 0; i < raw.data.length; i += 4) {
      if (raw.data[i + 3]! < 16) continue;
      opaque++;
      if (raw.data[i]! !== 0 || raw.data[i + 1]! !== 0 || raw.data[i + 2]! !== 0) coloured++;
    }
    expect(opaque).toBeGreaterThan(0);
    expect(coloured).toBe(0);
    expect(set.monochromeSvg).not.toMatch(/#(?:c4a04a|786e3b|dcb85c)/i);
  }, 60_000);

  it('screenshots are the launcher chrome: the category names and the emblem, never disc media', async () => {
    const set = await renderIconSet(emblem);
    expect(set.screenshots.map((s) => [s.name, s.width, s.height, s.formFactor])).toEqual([
      ['screenshot-wide.png', 1280, 720, 'wide'],
      ['screenshot-narrow.png', 750, 1334, 'narrow'],
    ]);
    for (const shot of set.screenshots) {
      expect(shot.png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(shot.svg).toContain('SOCOM II Legacy');
      for (const label of LAUNCHER_SCREEN_LABELS) expect(shot.svg).toContain(label);
      expect(shot.svg).toContain('M21 45');
      expect(shot.svg).not.toMatch(/\/maps\/|\.zdb|\.zar|\.zed|\.rdr|\.pss|\.mps|\.iso|playstation|sony/i);
    }
  }, 60_000);
});
