import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Zar } from '@s2u/archive';
import { parseBankFile, renderSound, SampleCache, soundHash, soundScriptFromArchive, type SoundBank } from '@s2u/sound';
import { selectValidationMaps } from '../../../tools/mapValidation';
import { LADDER_SLIDE_SOUND } from '../src/soundData';

/**
 * PAR-89 (research 305 s2, s3; Chris's PR #90 at 14ece5c69): the disc's banks and script for the two sounds, read
 * through the repository's readers (`Zar`, `parseBankFile`, `soundScriptFromArchive`) on `SOCOM_DISC`. Skips without it.
 *
 * - `.GUN_EMPTY` (ELF 0x65f8f8): in every multiplayer map's own `<map>_fx.bnk`, rendering a sound; `sounds.rdr` files
 *   it `ONESHOT`.
 * - `~LADDER_SLIDE` (ELF 0x65f558): in the `_am.bnk` of 12 of the 22 maps (20 banks on the disc with the campaign's),
 *   none of the other ten maps' own banks holding it; `sounds.rdr` files it in each of those `_AM` sets, never
 *   `ONESHOT` (a held handle), `RANGE (80 100)`, no `DOPPLER`.
 */

const disc = process.env.SOCOM_DISC;
const store = disc ? join(disc, 'RUN/SOUNDS/BNKSTORE.ZAR') : '';
const script = disc ? join(disc, 'RUN/SOUNDRDR.ZAR') : '';
const present = !!disc && existsSync(store) && existsSync(script) && existsSync(join(disc, 'RUN'));

/** The 12 maps whose own banks hold `~LADDER_SLIDE` (research 305 s3.4). */
const SLIDE_MAPS = ['MP2', 'MP5', 'MP8', 'MP10', 'MP61', 'MP62', 'MP64', 'MP71', 'MP72', 'MP73', 'MP81', 'MP82'];

describe.skipIf(!present)('the empty click and the slide on the disc (PAR-89, research 305)', () => {
  const zar = present ? Zar.parse(readFileSync(store)) : null;
  const sets = present ? soundScriptFromArchive(readFileSync(script)) : null;
  const maps = present ? selectValidationMaps(readdirSync(join(disc!, 'RUN')).map((n) => 'RUN/' + n)) : [];
  const bank = (file: string): SoundBank | null => {
    const key = zar!.root.children.find((k) => k.name === file);
    return key ? parseBankFile(zar!.data(key)) : null;
  };
  const index = (b: SoundBank, name: string): number | undefined => b.names.get(name) ?? b.names.get(`${name} `);

  it('finds the 22 multiplayer maps', () => {
    expect(maps).toHaveLength(22);
  });

  it('.GUN_EMPTY: every map\'s own _fx bank holds it and renders it; the script files it ONESHOT', () => {
    for (const map of maps) {
      const fx = bank(`${map}_fx.bnk`);
      expect(fx, map).not.toBeNull();
      const at = index(fx!, '.GUN_EMPTY');
      expect(at, map).toBeDefined();
      const sound = renderSound(fx!, at!, new SampleCache(fx!.vag), { random: () => 0.5 });
      expect(sound.voices, map).toBeGreaterThan(0);
      expect(sound.peak, map).toBeGreaterThan(0);
      expect(sets!.get(`${map}_FX`)?.get(soundHash('.GUN_EMPTY'))?.oneShot, map).toBe(true);
    }
  });

  it('~LADDER_SLIDE: the _am bank of 12 maps, no other map\'s own banks; 20 banks on the disc', () => {
    const holding = maps.filter((map) => ['am', 'fx', 'vc'].some((k) => {
      const b = bank(`${map}_${k}.bnk`);
      return b !== null && index(b, LADDER_SLIDE_SOUND) !== undefined;
    }));
    expect(holding).toEqual(SLIDE_MAPS);
    for (const map of SLIDE_MAPS) expect(index(bank(`${map}_am.bnk`)!, LADDER_SLIDE_SOUND), map).toBeDefined();
    expect(index(bank('MP2_am.bnk')!, LADDER_SLIDE_SOUND)).toBe(68);
    const all = zar!.root.children.filter((k) => /\.bnk$/i.test(k.name)).filter((k) => index(parseBankFile(zar!.data(k)), LADDER_SLIDE_SOUND) !== undefined);
    expect(all).toHaveLength(20);
  });

  it('~LADDER_SLIDE: the script files it a held sound (not ONESHOT), RANGE 80-100, no DOPPLER, on each of the 12', () => {
    for (const map of SLIDE_MAPS) {
      const p = sets!.get(`${map}_AM`)?.get(soundHash(LADDER_SLIDE_SOUND));
      expect(p, map).toBeDefined();
      expect({ oneShot: p!.oneShot, range: p!.range, doppler: p!.doppler }, map).toEqual({ oneShot: false, range: [80, 100], doppler: false });
    }
  });
});
