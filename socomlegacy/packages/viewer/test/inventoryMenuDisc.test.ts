import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb } from '@s2u/archive';
import { readLocArchive } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { readHud } from '../src/hudAssets';
import { INVENTORY_COLUMN, INVENTORY_TAG, magsText } from '../src/inventoryMenu';
import { ARROW_TEXTURE, PANEL_TEXTURE } from '../src/weaponSelect';

/**
 * The R2 menu's words and bitmaps against the disc (research 212 §3, §4): the strings `FUN_00361b40` draws for the
 * shoulder tags (0xec6d, 0xec6e) and the magazines (0xec42, 0xec43) out of `RUN/LOCALE/STATES/HUDCLOC.ZAR`, and the
 * backdrop's and the arrows' bitmaps out of `MP2.ZDB`'s `HUD2_TXR`. Dev-disc tests (W6.R8): HUDCLOC is read from
 * `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; each part skips itself when its file is absent, as on CI.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HUDCLOC = DISC ? join(DISC, 'RUN', 'LOCALE', 'STATES', 'HUDCLOC.ZAR') : '';
const MP2 = fixture('RUN/MP2.ZDB');

describe.skipIf(!HUDCLOC || !existsSync(HUDCLOC))('the menu\'s strings are HUDCLOC\'s (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('0xec6d / 0xec6e are QUICK 1 / QUICK 2; 0xec43 is 1 MAG and 0xec42 $1s MAGS', () => {
    const table = readLocArchive(new Uint8Array(readFileSync(HUDCLOC)), 'HudC');
    const text = (id: number): string | undefined => table.entries.find((e) => e.id === id)?.text;
    expect(text(0xec6d)).toBe(INVENTORY_TAG.l1);
    expect(text(0xec6e)).toBe(INVENTORY_TAG.l2);
    expect(text(0xec43)).toBe(magsText(1));
    expect(text(0xec42)!.replace('$1s', '5')).toBe(magsText(5));
  });
});

describe.skipIf(!MP2)(`the menu's bitmaps are HUD2_TXR's (${MP2 ? 'MP2.ZDB' : FIXTURES_ABSENT})`, () => {
  it('newweapnbkrnd.tif is 128x64 and the same in every row; hud_arrow_off2.tif 32x32, its ink in rows 8-22', () => {
    const { bitmaps } = readHud(MP2!, parseZdb(MP2!) as never);
    const panel = bitmaps[PANEL_TEXTURE]!, arrow = bitmaps[ARROW_TEXTURE]!;
    expect([panel.width, panel.height]).toEqual([128, 64]);
    const row = (y: number): number[] => [...panel.data.subarray(y * 128 * 4, (y + 1) * 128 * 4)];
    for (let y = 1; y < 64; y++) expect(row(y), `row ${y}`).toEqual(row(0));   // the three pieces look as one
    // The lighter right-hand strip from texel 123 -- 154 on the 160-wide column, the capture's x 154-159.
    expect(panel.data[122 * 4]).toBeLessThan(panel.data[123 * 4]!);
    expect(Math.floor((123 / 128) * INVENTORY_COLUMN.w)).toBe(153);
    expect([arrow.width, arrow.height]).toEqual([32, 32]);
    const inked = [...Array(32).keys()].filter((y) => [...Array(32).keys()].some((x) => arrow.data[(y * 32 + x) * 4 + 3]! > 0));
    expect([inked[0], inked.at(-1)]).toEqual([8, 22]);
  });
});
