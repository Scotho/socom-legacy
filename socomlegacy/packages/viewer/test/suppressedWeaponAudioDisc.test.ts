import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseRdr, rdrGet, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { parseSoundScript, soundHash, type RenderedSound } from '@s2u/sound';
import { selectValidationMaps } from '../../../tools/mapValidation';
import { GameAudio, type AudioOut } from '../src/audio';
import { MP_SOUND_GROUPS, scriptFiles, soundFromDisc } from '../src/soundData';

const disc = process.env.SOCOM_DISC;
const present = Boolean(disc && ['RUN/SOUNDS/BNKSTORE.ZAR', 'RUN/SOUNDRDR.ZAR', 'RUN/ZWEAPON.ZAR']
  .every(path => existsSync(join(disc, path))));
const maps = present ? selectValidationMaps(readdirSync(join(disc!, 'RUN')).map(name => `RUN/${name}`)) : [];
const listener = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const weapons = [
  { name: 'M4A1 SD', close: '.M4A1_SIL', range: [20, 200] },
  { name: '552SD', close: '.SIG_552_SIL', range: [85, 1700] },
] as const;

/** Research 81 section 5.1: retail r0001/current-port behavior; r0004 R4B-10a remains unverified here. */
describe.skipIf(!present)('suppressed rifle reports on the retail multiplayer maps', () => {
  it('finds all 22 maps and no sound entry for the original reader\'s NOT_FOUND default', () => {
    expect(maps).toHaveLength(22);
    const archive = Zar.parse(readFileSync(join(disc!, 'RUN/SOUNDRDR.ZAR')));
    const member = archive.root.children.find(key => key.name.toLowerCase() === 'sounds.rdr')!;
    const root = parseRdr(archive.data(member)), sets = parseSoundScript(root);
    // FUN_003cda30 D:L322155-322157, 322595-322609; resolved independently by FUN_003c4700.
    for (const [name, set] of sets) expect(set.has(soundHash('NOT_FOUND')), name).toBe(false);
    for (const map of maps) expect(scriptFiles(root, sets, map)('NOT_FOUND'), map).toBe(false);
    // Original lookup is by hash, including the group objects, rather than by exact group name.
    const groups = rdrGet(root, 'GROUPS');
    expect(Array.isArray(groups)).toBe(true);
    if (Array.isArray(groups)) {
      for (let i = 0; i + 1 < groups.length; i += 2) {
        if (typeof groups[i] !== 'string' || !MP_SOUND_GROUPS.includes(groups[i] as string)) continue;
        const block = groups[i + 1];
        expect(Array.isArray(block)).toBe(true);
        if (!Array.isArray(block)) continue;
        for (const entry of block) {
          if (Array.isArray(entry) && typeof entry[0] === 'string') {
            expect(soundHash(entry[0]), entry[0]).not.toBe(soundHash('NOT_FOUND'));
          }
        }
      }
    }
  });

  for (const map of maps) it(`${map}: both rifles render through 9 m, with no report beyond the empty medium slot`, async () => {
    const data = await soundFromDisc(new FsAssetSource(disc!), `RUN/${map}.ZDB`, map);
    const played: RenderedSound[] = [];
    const out: AudioOut = {
      unlocked: true, state: 'running', unlock() {}, setGain() {},
      play(sound) { played.push(sound); }, setReverb() {}, rampReverb() {}, loop() { return null; },
    };
    const audio = new GameAudio(out, () => 0.5);
    audio.setData(data);
    audio.setListener(listener);
    try {
      expect(data.fireDistances).toEqual({ close: 0, med: 90, far: 500 });
      for (const weapon of weapons) {
        expect(data.weapons.find(w => w.name === weapon.name)).toMatchObject({
          fireClose: weapon.close, fireMed: null, fireFar: null,
        });
        expect(new Map(data.params).get(weapon.close)?.range).toEqual(weapon.range);
        const peaks: number[] = [];
        for (const distance of [0, 20, 50, 89, 90]) {
          const count = played.length;
          expect(audio.onFire(weapon.name, [0, 0, -distance]), `${weapon.name} at ${distance} units`).toBe(weapon.close);
          expect(played).toHaveLength(count + 1);
          const sound = played.at(-1)!;
          expect(sound.voices).toBeGreaterThan(0);
          expect(sound.peak).toBeGreaterThan(0);
          peaks.push(sound.peak);
        }
        // These differ on the disc: the M4A1 SD fades after 2 m; the 552SD remains full through 8.5 m.
        expect(peaks[1]).toBe(peaks[0]);
        if (weapon.name === 'M4A1 SD') expect(peaks[2]!).toBeLessThan(peaks[1]!);
        else expect(peaks[2]).toBe(peaks[1]);
        expect(peaks[4]!).toBeLessThan(peaks[0]!);

        // FUN_003d2d70 D:L325671-325696 and FUN_003d2c50 D:L325524-325535:
        // strictly over 90 units chooses the absent medium handle, even inside the sample's RANGE.
        const count = played.length, silent = audio.stats().dropped.silent, range = audio.stats().dropped.range;
        for (const distance of [90.1, 150, 200, 501]) expect(audio.onFire(weapon.name, [0, 0, -distance])).toBeNull();
        expect(played).toHaveLength(count);
        expect(audio.stats().dropped.silent).toBe(silent + 4);
        expect(audio.stats().dropped.range).toBe(range);
      }
      expect(audio.stats().unknownNames).toEqual({});
    } finally {
      audio.setData(null);
    }
  }, 30_000);
});
