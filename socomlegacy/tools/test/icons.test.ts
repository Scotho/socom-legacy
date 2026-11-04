import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { LAUNCHER_SCREEN_LABELS, monochromeEmblem, renderIconSet } from '../icons';

/**
 * PWA-1: the icon set is rendered from `shared/ds/emblem.svg` and nothing else. A browser adaptation.
 * Screenshots are the launcher's category names on the ground colour, never disc media.
 */

const emblemPath = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../shared/ds/emblem.svg');
const emblem = readFileSync(emblemPath, 'utf8');

const rgb = (data: Buffer, width: number, channels: number, x: number, y: number): number[] => {
  const i = (y * width + x) * channels;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
};

const isGold = (p: number[]): boolean => p[0]! > 180 && p[1]! > 140 && p[2]! < 140 && p[0]! > p[1]! && p[1]! > p[2]!;

describe('PWA-1: icons from the emblem', () => {
  it('renders the set from the emblem file: sizes, PNG, opaque apple icon, maskable safe zone, ICO', async () => {
    const set = await renderIconSet(emblem);
    expect(set.faviconSvg).toBe(emblem);
    expect(monochromeEmblem(emblem)).toMatch(/fill="none"/);
    expect(monochromeEmblem(emblem)).not.toMatch(/#(?:c4a04a|786e3b|dcb85c|000e11)/i);
    expect(set.monochromeSvg).toContain('#000');

    const byName = new Map(set.png.map((p) => [p.name, p]));
    for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]] as const) {
      const icon = byName.get(name)!;
      expect(icon.width).toBe(size);
      expect(icon.height).toBe(size);
      expect(icon.png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const meta = await sharp(icon.png).metadata();
      expect(meta.hasAlpha, name).toBe(false);
      expect(meta.channels, name).toBe(3);
    }

    const mask = byName.get('icon-maskable-512.png')!;
    const raw = await sharp(mask.png).raw().toBuffer({ resolveWithObject: true });
    const ground = [0, 14, 17];
    expect(rgb(raw.data, raw.info.width, raw.info.channels, 0, 0)).toEqual(ground);
    expect(rgb(raw.data, raw.info.width, raw.info.channels, 20, 20)).toEqual(ground);
    let goldInMargin = false;
    let goldInside = false;
    for (let y = 0; y < 512; y += 2) {
      for (let x = 0; x < 512; x += 2) {
        if (!isGold(rgb(raw.data, raw.info.width, raw.info.channels, x, y))) continue;
        const margin = x < 51 || y < 51 || x > 460 || y > 460;
        if (margin) goldInMargin = true;
        else goldInside = true;
      }
    }
    expect(goldInMargin).toBe(false);
    expect(goldInside).toBe(true);

    const full = await sharp(byName.get('icon-512.png')!.png).raw().toBuffer({ resolveWithObject: true });
    let goldNearEdge = false;
    for (let y = 0; y < 512 && !goldNearEdge; y += 2) {
      for (let x = 0; x < 40; x += 2) {
        if (isGold(rgb(full.data, full.info.width, full.info.channels, x, y))) goldNearEdge = true;
      }
    }
    expect(goldNearEdge).toBe(true);

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
    }
    expect(sizes).toEqual([16, 32, 48]);
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
