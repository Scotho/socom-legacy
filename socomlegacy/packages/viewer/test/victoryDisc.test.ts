import { describe, expect, it } from 'vitest';
import { openSync, closeSync, fstatSync, readSync, existsSync } from 'node:fs';
import { IsoAssetSource, parseZdb } from '@s2u/archive';
import { victoryFromBytes } from '../src/victoryData';
import { readHud } from '../src/hudAssets';

const path = process.env.SOCOM_ISO;
describe.skipIf(!path || !existsSync(path))('victory assets from the supplied ISO, every multiplayer map', () => {
  it('decodes all seven original clips, motion flags, weights, timing and the original emblem', async () => {
    const fd = openSync(path!, 'r'), size = fstatSync(fd).size;
    const source = new IsoAssetSource({ size, slice: (a = 0, b = size) => ({ arrayBuffer: async () => {
      const out = new Uint8Array(b - a); let at = 0;
      while (at < out.length) { const n = readSync(fd, out, at, out.length - at, a + at); if (!n) throw Error('short ISO read'); at += n; }
      return out.buffer;
    } }) } as Blob);
    try {
      const readerc = await source.read('RUN/READERC.ZAR');
      const files = (await source.extents()).filter(f => /^RUN\/MP\d+\.ZDB$/.test(f.path));
      expect(files).toHaveLength(22);
      for (const file of files) {
        const map = await source.read(file.path), data = victoryFromBytes(map, readerc);
        expect(data.missing, file.path).toEqual([]);
        expect(data.variants.map(v => [v.name, v.weight, v.motion.playback, v.clip.frameCount]), file.path).toEqual([
          ['victory_macarena', .142, 6.6, 205], ['victory_chicken', .143, 5.9, 190], ['victory_break', .143, 2.8, 95],
          ['victory_funky', .143, 2.5, 85], ['victory_face', .143, 4.6, 149], ['victory_backflip', .143, 4.8, 155], ['victory_rodeo', .143, 4.7, 153],
        ]);
        for (const v of data.variants) {
          expect(v.motion).toMatchObject({ noPitchtwist: true, noInterrupt: null, looped: false, maxVelocity: -.1, callbacks: [] });
          expect(v.clip.parts).toHaveLength(26);
        }
        const icon = readHud(map, parseZdb(map)).bitmaps['action_victory_dance.tif'];
        expect(icon, file.path).toBeDefined();
        expect(icon!.width).toBe(64); expect(icon!.height).toBe(64);
      }
    } finally { closeSync(fd); }
  }, 60000);
});
