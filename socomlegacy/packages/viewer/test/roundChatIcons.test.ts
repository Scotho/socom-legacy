import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import { MESSAGE_COLOURS } from '../src/matchMessages';
import { SPECTATOR_RGB_READING } from '../src/scoreboard';
import { HUD_LIBRARIES } from '../src/hudAssets';
import {
  ROUND_CHAT_EYE_FRAME_BITMAP, ROUND_CHAT_NAME_COLOURS_ADAPTATION, ROUND_CHAT_SKULL_BITMAP, roundChatEyeIcon, roundChatIconsFrom,
} from '../src/roundChatIcons';

// V21.R15a ROUND-CHAT, RC-4 (a browser adaptation): the skull is the disc's dead voice-channel icon; the eye is drawn in
// the frame and colours of the disc's spectators channel icon; the name colours' sources. Evidence kind: unit test.

/** A synthetic HUD-style icon: a 3 px frame (64, 96, 104), a black field, one art pixel (96, 144, 160). */
function frameIcon(size = 64): Rgba {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, edge = x < 3 || y < 3 || x >= size - 3 || y >= size - 3;
    data.set(edge ? [64, 96, 104, 255] : [0, 0, 0, 255], i);
  }
  data.set([96, 144, 160, 255], (10 * size + 10) * 4);
  return { width: size, height: size, data };
}
const px = (b: Rgba, x: number, y: number): number[] => Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4));

describe('RC-4: the round line\'s icons and name colours', () => {
  it('the skull is the disc\'s dead voice-channel icon and the eye\'s frame the spectators channel\'s, both in the HUD\'s library', () => {
    expect(ROUND_CHAT_SKULL_BITMAP).toBe('action_dead_zone.tif');
    expect(ROUND_CHAT_EYE_FRAME_BITMAP).toBe('action_tune_spectators.tif');
    expect(HUD_LIBRARIES.HUD).toContain(ROUND_CHAT_SKULL_BITMAP);
    expect(HUD_LIBRARIES.HUD).toContain(ROUND_CHAT_EYE_FRAME_BITMAP);
  });

  it('the drawn eye keeps the frame, clears the field to its colour, and draws its pupil in the art colour', () => {
    const src = frameIcon();
    const eye = roundChatEyeIcon(src);
    expect([eye.width, eye.height]).toEqual([64, 64]);
    for (const [x, y] of [[0, 0], [2, 31], [63, 63], [31, 61]] as const) expect(px(eye, x, y)).toEqual(px(src, x, y));
    expect(px(eye, 10, 10)).toEqual([0, 0, 0, 255]);            // the source's own art is not carried over
    expect(px(eye, 32, 32)).toEqual([96, 144, 160, 255]);        // the pupil, full ink
    expect(px(eye, 5, 32)).toEqual([0, 0, 0, 255]);              // the field outside the eye
    for (let y = 3; y < 61; y++) for (let x = 3; x < 32; x++) expect(px(eye, x, y)).toEqual(px(eye, 63 - x, y));   // symmetric
    expect(roundChatEyeIcon(src).data).toEqual(eye.data);        // pure
  });

  it('the HUD\'s icons from a map\'s HUD bitmaps: the skull as it is, the eye drawn in the spectators frame; none when absent', () => {
    const skull = frameIcon(), spectators = frameIcon();
    const got = roundChatIconsFrom({ [ROUND_CHAT_SKULL_BITMAP]: skull, [ROUND_CHAT_EYE_FRAME_BITMAP]: spectators });
    expect(got.skull).toBe(skull);
    expect(got.eye!.data).toEqual(roundChatEyeIcon(spectators).data);
    expect(roundChatIconsFrom({})).toEqual({ skull: null, eye: null });
    expect(roundChatIconsFrom(null)).toEqual({ skull: null, eye: null });
  });

  it('wired: both pages hand the HUD its round-chat icons right after the map\'s HUD bitmaps', () => {
    const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
    expect(read('../src/matchMount.ts')).toMatch(/hud\.setBitmaps\(m\.hud\);\r?\n\s+setRoundChatIcons\(hud, roundChatIconsFrom\(m\.hud\)\);/);
    expect(read('../src/main.ts')).toMatch(/hud\.setBitmaps\(map\.hud\);\r?\n\s+setRoundChatIcons\(hud, roundChatIconsFrom\(map\.hud\)\);/);
  });

  it('the name colours: the Terrorists\' the original\'s message red, the spectators\' the scoreboard\'s reading, the SEALs\' a lighter blue', () => {
    expect(ROUND_CHAT_NAME_COLOURS_ADAPTATION.terrorist).toEqual(MESSAGE_COLOURS[5]);
    expect(ROUND_CHAT_NAME_COLOURS_ADAPTATION.spectator).toEqual([...SPECTATOR_RGB_READING]);
    const [r, g, b] = ROUND_CHAT_NAME_COLOURS_ADAPTATION.seal;
    expect(b).toBeGreaterThan(g); expect(g).toBeGreaterThan(r);  // blue
    expect(r + g + b).toBeGreaterThan(64 + 64 + 96);             // brighter than the message window's dark blue
  });
});
