// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseZdb } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { DEFAULT_MODEL, hudLayout, type HudModel } from '../src/hud';
import { HUD_LIBRARIES, readHud } from '../src/hudAssets';

/**
 * TA-COMBATFX: the HUD's data (socomlegacy/docs/research/87-hud.md), registered in docs/parity/registry/combatfx.json. The
 * layout's rectangles are `CHUD`'s constants, held by `hud.test.ts`; what the disc decides is each bitmap's size (the
 * icon, the fire-mode round and the compass are drawn at their own size, or a fixed fraction of it) and its pixels.
 * `test/golden/hudBitmaps.json` pins Frostfire's four HUD libraries as `readHud` decodes them -- each bitmap's size and
 * the SHA-256 of its decoded, flipped RGBA -- and the unit tests lay the HUD out from those sizes with no game data;
 * the last block re-decodes the libraries and compares the pin whole (it skips without the fixtures).
 */

const PIN = JSON.parse(readFileSync(new URL('./golden/hudBitmaps.json', import.meta.url), 'utf8')) as { bitmaps: Record<string, { width: number; height: number; sha256: string }> };
const SIZES: Record<string, { width: number; height: number }> = Object.fromEntries(
  Object.entries(PIN.bitmaps).map(([name, b]) => [name, { width: b.width, height: b.height }]));
const PS2 = { width: 640, height: 448 };
const layout = (over: Partial<HudModel> = {}) => hudLayout(PS2, { ...DEFAULT_MODEL, ...over }, SIZES);

describe('the HUD laid out from the disc\'s bitmap sizes (research 87 section 1)', () => {
  it('the pin holds every bitmap the HUD reads, from its four libraries', () => {
    expect(Object.keys(PIN.bitmaps).sort()).toEqual(Object.values(HUD_LIBRARIES).flat().sort());
  });

  it('the ammo box\'s weapon icon is the held item\'s HUDW bitmap at its own size, top-left (20, 389): the M4 128x32, the Mark 23 64x32, the M67 32x32, the claymore 64x32', () => {
    const at = (icon: string) => layout({ weaponIcon: icon }).rects.icon;
    expect(at('m4carbine_icon.tif')).toEqual({ x: 20, y: 389, width: 128, height: 32 });
    expect(at('mark23_icon.tif')).toEqual({ x: 20, y: 389, width: 64, height: 32 });
    expect(at('grenade_frag_icon.tif')).toEqual({ x: 20, y: 389, width: 32, height: 32 });
    expect(at('claymore_icon.tif')).toEqual({ x: 20, y: 389, width: 64, height: 32 });
  });

  it('the fire mode is firemode.tif\'s 32x16 rounds at x 10, 51, 87 and 123, y 422: one, three or four', () => {
    expect(layout({ fireMode: 'single' }).rects.firemode).toEqual({ x: 10, y: 422, width: 32, height: 16 });
    expect(layout({ fireMode: 'burst' }).rects.firemode).toEqual({ x: 10, y: 422, width: 87 + 32 - 10, height: 16 });
    expect(layout({ fireMode: 'auto' }).rects.firemode).toEqual({ x: 10, y: 422, width: 123 + 32 - 10, height: 16 });
  });

  it('the compass is compass_lo (128x128 on the disc) at 0.75: a 96-pixel ring centred on (565, 90)', () => {
    const q = layout().quads.find((x) => x.element === 'compass')!;
    expect([q.texture, q.x, q.y, q.w, q.h]).toEqual(['compass_lo.tif', 565, 90, 0.75 * SIZES['compass_lo.tif']!.width, 0.75 * SIZES['compass_lo.tif']!.height]);
  });

  it('a door\'s prompt is the map\'s action_door_open.tif (64x64 on the disc) drawn 50x50 centred on x 306, y 365..415; an icon the libraries lack is action_x', () => {
    const door = layout({ action: 'door' });
    expect(door.quads.find((x) => x.element === 'action')!.texture).toBe('action_door_open.tif');
    expect(door.rects.action).toEqual({ x: 281, y: 365, width: 50, height: 50 });
    expect([SIZES['action_door_open.tif']!.width, SIZES['action_door_open.tif']!.height]).toEqual([64, 64]);
    expect(layout({ action: 'knife' }).quads.find((x) => x.element === 'action')!.texture).toBe('action_x.tif');
  });
});

// ---- the data-backed half -------------------------------------------------------------------------------------------

const MP2 = fixture('RUN/MP2.ZDB');
describe(`the HUD's pin against Frostfire's libraries${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP2)('hudBitmaps.json is readHud\'s decode of MP2\'s HUD, HUD2, HUDW and FONT libraries: sizes and pixels', () => {
    const { bitmaps, diagnostics } = readHud(MP2!, parseZdb(MP2!));
    expect(diagnostics).toEqual([]);
    const read = Object.fromEntries(Object.keys(PIN.bitmaps).map((n) => {
      const b = bitmaps[n]!;
      return [n, { width: b.width, height: b.height, sha256: createHash('sha256').update(b.data).digest('hex') }];
    }));
    expect(read).toEqual(PIN.bitmaps);
  });
});
