import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Rgba } from '@s2u/gs';
import { FsAssetSource } from '@s2u/archive/node';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { armoryFromDisc } from '../src/armoryData';
import { Hud } from '../src/hud';
import { handRoundScreenBitmaps, keepMissionRead, roundScreenLayout, ROUND_SCREEN_BITMAPS, type RoundScreen } from '../src/roundScreens';

/**
 * PAR-3 (web sprint PARITY-1, audit A.3; research 255 s3): the round screens' backdrop and panels (`multplay_back.tif`,
 * `backsolid.tif`, UIMP's copies; PF.R22) reach the HUD through one hand-off both pages call. `/testroom` hands them
 * from its ARMORY read (`main.ts` `armoryData`); the menu-launched match never did, so its end screens drew the
 * fallback shapes (`roundScreens.ts` `roundScreenLayout`). The menu page's own ARMORY read is the lobby's
 * (`frontEnd.ts`'s `armory.load`, `armoryFromDisc` with the world), kept for its mission so the match takes the same decode.
 */

const PS2 = { width: 640, height: 448 };
const rgba = (w: number, h: number, v = 255): Rgba => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(v) });
const font = { 'font_text_01.tif': rgba(512, 128), 'newweapnbkrnd.tif': rgba(128, 64) };
const screen: RoundScreen = { kind: 'roundComplete', secondsLeft: 5, elapsed: 5, winner: 'seal', wins: { seal: 1, terrorist: 0 }, rows: [] };
/** An ARMORY read as `armoryFromDisc` returns it: its bitmaps by lower-case name. */
const armoryRead = (): { bitmaps: [string, Rgba][] } => ({
  bitmaps: [['multplay_back.tif', rgba(512, 512)], ['backsolid.tif', rgba(16, 16)], ['popupop.tif', rgba(64, 64)]],
});
/** What the end screen draws with the HUD's bitmaps: the backdrop's and the panels' quads, and its shapes. */
const drawn = (hud: Hud) => {
  const { quads, tris, panels } = roundScreenLayout(screen, PS2, hud.sizes());
  return {
    backdrop: quads.filter((q) => q.texture === ROUND_SCREEN_BITMAPS.background).length,
    panels: quads.filter((q) => q.texture === ROUND_SCREEN_BITMAPS.panel).length,
    want: panels.length,
    shapes: tris.length,
  };
};

describe('PAR-3: the round screens\' bitmaps on the menu path, from the lobby\'s ARMORY read', () => {
  it('without the hand-off (the menu match before PAR-3) the end screen draws the fallback: no backdrop, the panels as shapes', () => {
    const hud = new Hud();
    hud.setBitmaps(font);                                            // the map's HUD set: no UIMP copies in it
    const d = drawn(hud);
    expect([d.backdrop, d.panels]).toEqual([0, 0]);
    expect(d.shapes).toBe(2 + 2 * d.want);                           // the opaque backdrop and every panel, as triangles
  });

  it('the lobby\'s read, kept for its mission, hands the match\'s HUD the two decoded bitmaps -- one decode -- and the end screen draws them as quads', async () => {
    let reads = 0;
    const read = keepMissionRead(async (mission: string) => { reads++; expect(mission.toUpperCase()).toBe('MP2'); return armoryRead(); });
    void read('mp2');                                                // the lobby's (`LobbyArmory.want` in dlgGameLobby)
    const hud = new Hud();
    expect(handRoundScreenBitmaps(hud, await read('MP2')).sort()).toEqual(['backsolid.tif', 'multplay_back.tif']);   // the match's
    expect(reads).toBe(1);
    hud.setBitmaps(font);
    expect(hud.sizes()['multplay_back.tif']).toEqual({ width: 512, height: 512 });
    expect(hud.sizes()['backsolid.tif']).toEqual({ width: 16, height: 16 });
    expect(hud.sizes()['popupop.tif']).toBeUndefined();              // the two the screens draw, no more
    const d = drawn(hud);
    expect(d.backdrop).toBe(1);
    expect(d.panels).toBe(d.want);
    expect(d.shapes).toBe(2);                                        // the backdrop's colour only; no fallback panels
  });

  it('another mission is read afresh and kept in its place; a read that found nothing hands nothing and the screens keep their shapes', async () => {
    const asked: string[] = [];
    const read = keepMissionRead(async (mission: string) => { asked.push(mission); return mission === 'mp6' ? { bitmaps: [] } : armoryRead(); });
    await read('mp2'); await read('mp6'); await read('mp6'); await read('mp2');
    expect(asked).toEqual(['mp2', 'mp6', 'mp2']);
    const hud = new Hud();
    hud.setBitmaps(font);
    expect(handRoundScreenBitmaps(hud, await read('mp6'))).toEqual([]);
    expect(handRoundScreenBitmaps(hud, null)).toEqual([]);          // the read would not come
    expect(drawn(hud).backdrop).toBe(0);
  });
});

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const present = ['RUN/MP2.ZDB', 'RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UIMP_PAL.ZED'].every((p) => existsSync(resolve(FIXTURES, p)));

describe.skipIf(!present)(`PAR-3 on the disc's files${present ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('the lobby\'s own read (armoryFromDisc with the world, as frontEnd.ts reads it) holds UIMP\'s two bitmaps; through the hand-off the end screen draws them', async () => {
    const read = keepMissionRead((mission: string) => armoryFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', mission.toUpperCase(), { models: false, world: true }));
    const hud = new Hud();
    expect(handRoundScreenBitmaps(hud, await read('mp2')).sort()).toEqual(['backsolid.tif', 'multplay_back.tif']);
    hud.setBitmaps(font);
    expect(hud.sizes()['multplay_back.tif']).toEqual({ width: 512, height: 512 });   // research 179 s10 s3
    expect(hud.sizes()['backsolid.tif']).toEqual({ width: 16, height: 16 });
    const d = drawn(hud);
    expect([d.backdrop, d.panels, d.shapes]).toEqual([1, d.want, 2]);
  });
});
