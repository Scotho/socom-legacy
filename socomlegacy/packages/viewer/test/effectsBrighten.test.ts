import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GlobalLighting } from '@s2u/scene';
import { effectBrighten } from '../src/effectMaterials';
import { brightenOf, DEFAULT_LIGHTING, FALLBACK_RIG, type Lighting } from '../src/lighting';
import { matchLighting } from '../src/matchMount';

/**
 * PAR-13 (web sprint PARITY-1, audit A.13; research 255 s4): the effects' brightness hand-off, its impact verified before
 * any change. `/testroom` writes `effects.setBrighten(brightenOf(lighting))` every frame (`main.ts:1582`); the menu-launched
 * match does not. The verdict is a demonstrated no-op on the menu path, so nothing is handed and nothing is tuned: these
 * cases hold the facts it rests on, and turn red if one of them changes (a brighten writer on the menu path, a rig that
 * moves the brighten, another start value).
 */

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (f: string): string => readFileSync(resolve(src, f), 'utf-8');

describe('PAR-13: the effects\' brighten on the menu path is the hand-off\'s value already (a demonstrated no-op)', () => {
  it('brightenOf reads the FIX alone, never the rig: under DEFAULT_LIGHTING (FIX 0, the multiplayer frame unbrightened) every rig is x1', () => {
    expect(DEFAULT_LIGHTING.brighten).toBe(0);
    const rigs: (GlobalLighting | null)[] = [
      null, FALLBACK_RIG,
      { directions: [[0.3, -0.9, 0.2], [-0.5, -0.5, 0.7], [0, 1, 0]], colours: [[1.2, 1.1, 0.9], [0.4, 0.4, 0.5], [0.1, 0.1, 0.1]], ambient: [0.5, 0.5, 0.55] },
      { directions: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], colours: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], ambient: [0, 0, 0] },
    ];
    for (const rig of rigs) {
      const lighting: Lighting = { ...DEFAULT_LIGHTING, rig };      // matchMount.ts's `place`: `lighting.rig = m.lightRig`
      expect(brightenOf(lighting)).toBe(1);
      expect(brightenOf({ ...lighting, rigEverywhere: true })).toBe(1);
    }
    expect(brightenOf({ ...DEFAULT_LIGHTING, brighten: 89 })).toBeCloseTo(1 + 89 / 128, 12);   // only the FIX moves it
  });

  it('the effects start at x1 and only main.ts writes them: no module of the menu path calls setBrighten or writes a FIX', () => {
    expect(effectBrighten.value).toBe(1);                              // `effectMaterials.ts`: `uniform(1)`
    const writers: string[] = [];
    for (const f of readdirSync(src).filter((n) => n.endsWith('.ts'))) {
      const text = read(f);
      if (/\.setBrighten\(/.test(text)) writers.push(`${f}: setBrighten`);
      if (/\.brighten\s*=(?!=)/.test(text)) writers.push(`${f}: .brighten =`);
    }
    // `/testroom`'s two: the per-frame hand-off and its slider (viewer chrome, PAR-17's exemption).
    expect(writers.sort()).toEqual(['main.ts: .brighten =', 'main.ts: setBrighten']);
    // FG-24 (the forge's day/night, 2026-10-14): the mount's lighting is `matchLighting(o.brighten)`, and unset it is
    // DEFAULT_LIGHTING field for field -- so the guarantee stands as long as no module of the menu path passes `brighten`.
    expect(read('matchMount.ts')).toMatch(/const lighting: Lighting = matchLighting\(o\.brighten\);/);
    expect(matchLighting(undefined)).toEqual({ ...DEFAULT_LIGHTING });
    // The menu path mounts through `matchLoader`'s `mount` (`{ ...o, assets }`), handed its options by these two: neither
    // names a brighten, so the menu's match mounts with DEFAULT_LIGHTING.
    for (const f of ['frontEnd.ts', 'lobbyMatch.ts']) expect(read(f)).not.toMatch(/brighten/);
  });
});
