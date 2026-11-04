import { describe, expect, it } from 'vitest';
import {
  BACKSOLID_RGB, counterShown, countdownText, heldScreen, hitPct, pickMvp, READERX_LAYOUT, revealedRows, ROUND_COUNTERS, ROUND_LIST_COLUMNS,
  ROUND_NAME_CUT_READING, ROUND_SCREEN_TIMEOUT_DIALOG, ROUND_SCREEN_TIMEOUT_S, ROUND_SCREENS_AFTER_S, roundScreenBitmaps, roundScreenFrame, roundScreenLayout, ROW_REVEAL, screenTimedOut, sortRows, timePlayedText, yourStatsOf,
  type RoundScreen, type RoundText,
} from '../src/roundScreens';
import type { ScoreRowInfo } from '../src/scoreboard';
import { DEFAULT_MODEL, hudPass, ROUND_SCREEN_HIDES, SCOREBOARD_HIDES, Hud, AT_REST } from '../src/hud';
import type { Rgba } from '@s2u/gs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { armoryFromDisc } from '../src/armoryData';
import { armoryFrame } from '../src/armoryView';
import { FONT_TEXT_01, textWidth } from '../src/hudFont';
import { parseRdr, Zar } from '@s2u/archive';
import { loadDialog, type DialogRecord } from '@s2u/ui';

/**
 * The round's end screens as SOCOM II's `RUN/UI/READERX.ZAR` lays them out (PF-26; research 179 s10, research 216):
 * ROUND COMPLETE (`dlgMultiplayerRound.rdr`), FINAL ROUND (`dlgMultiplayerFinal.rdr`), GAME COMPLETE
 * (`dlgMultiplayerFinalReally.rdr`). Every value a reading of the dialogs' source (`scratch/C1/D/compact_READERX_*`).
 */

const PS2 = { width: 640, height: 448 };
const FONT_ONLY: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 },
};
const SIZES: Record<string, { width: number; height: number }> = {
  ...FONT_ONLY, 'multplay_back.tif': { width: 512, height: 512 }, 'backsolid.tif': { width: 16, height: 16 },
};
const GOLD = [91 / 128, 72 / 128, 36 / 128, 1];
const WHITE = [1, 1, 1, 1];
const row = (id: number, team: 'seal' | 'terrorist', kills: number, deaths: number, score: number, over: Partial<ScoreRowInfo> = {}): ScoreRowInfo =>
  ({ id, name: `P${id}`, team, kills, deaths, score, alive: true, self: false, ...over });
const ROWS: ScoreRowInfo[] = [
  row(1, 'seal', 2, 3, 4), row(2, 'seal', 5, 1, 10, { self: true }), row(3, 'terrorist', 3, 2, 6), row(4, 'terrorist', 1, 5, 2),
];
const screen = (over: Partial<RoundScreen>): RoundScreen =>
  ({ kind: 'roundComplete', secondsLeft: 5, elapsed: 5, winner: 'seal', wins: { seal: 1, terrorist: 0 }, rows: ROWS, ...over });
const byRole = (texts: RoundText[], role: RoundText['role']): RoundText[] => texts.filter((t) => t.role === role);
const words = (texts: RoundText[], role: RoundText['role']): string[] => byRole(texts, role).map((t) => t.text);
const final = (over: Partial<RoundScreen> = {}) =>
  roundScreenLayout(screen({ kind: 'gameComplete', secondsLeft: 10, winner: null, wins: { seal: 1, terrorist: 0 }, timePlayed: 367, ...over })).texts;

describe('countdownText', () => {
  it('counts ROUND COMPLETE 10..1 every 0.5 s, then GO at the 5 s end', () => {
    expect(countdownText('roundComplete', 5)).toBe('10');
    expect(countdownText('roundComplete', 4.9)).toBe('10');
    expect(countdownText('roundComplete', 4.5)).toBe('9');
    expect(countdownText('roundComplete', 2.4)).toBe('5');
    expect(countdownText('roundComplete', 0.2)).toBe('1');
    expect(countdownText('roundComplete', 0)).toBe('GO');
    expect(countdownText('roundComplete', 99)).toBe('10');
  });
  it('counts FINAL ROUND 20..1 every 0.5 s, then GO at the 10 s end', () => {
    expect(countdownText('finalRound', 10)).toBe('20');
    expect(countdownText('finalRound', 9.5)).toBe('19');
    expect(countdownText('finalRound', 5)).toBe('10');
    expect(countdownText('finalRound', 0.5)).toBe('1');
    expect(countdownText('finalRound', -1)).toBe('GO');
  });
  it('has none on GAME COMPLETE', () => {
    expect(countdownText('gameComplete', 3)).toBeNull();
  });
});

describe('the round lists (dlgMultiplayerRound.rdr, dlgMultiplayerFinal.rdr; research 179 s10 s2, s5, s9)', () => {
  it('the headers read SCORE, KILLS, DEATHS by increasing x, centred at 368 / 470 / 578 at y 75 and 277 (column table 0x3e51c0; V1 #8)', () => {
    expect(ROUND_LIST_COLUMNS).toEqual(['score', 'kills', 'deaths']);
    for (const kind of ['roundComplete', 'finalRound'] as const) {
      const headers = byRole(roundScreenLayout(screen({ kind })).texts, 'header');
      for (const y of [75, 277]) {
        const line = headers.filter((t) => t.y === y).sort((a, b) => a.x - b.x);
        expect(line.map((t) => [t.text, t.x, t.align, t.scale])).toEqual([
          ['SCORE', 368, 'centre', 0.9], ['KILLS', 470, 'centre', 0.9], ['DEATHS', 578, 'centre', 0.9],
        ]);
      }
    }
  });

  it('a row is name at x 75, numbers right-justified at 373 / 475 / 582, rows at y 94 + 20k and 296 + 20k, scale 0.9; the local row\'s name gold, its numbers white (FUN_002b3580 D:L76322-76324)', () => {
    const rows = byRole(roundScreenLayout(screen({})).texts, 'row');
    expect(rows.every((t) => t.scale === 0.9)).toBe(true);
    expect(rows.filter((t) => t.x === 75).map((t) => [t.text, t.y, t.align])).toEqual(
      [['P2', 94, 'left'], ['P1', 114, 'left'], ['P3', 296, 'left'], ['P4', 316, 'left']]);
    // P2 (the local row): score 10, kills 5, deaths 1 in SCORE, KILLS, DEATHS order.
    expect(rows.filter((t) => t.y === 94 && t.x !== 75).map((t) => [t.text, t.x, t.align])).toEqual(
      [['10', 373, 'right'], ['5', 475, 'right'], ['1', 582, 'right']]);
    expect(rows.find((t) => t.text === 'P2')!.rgba).toEqual(GOLD);
    expect(rows.filter((t) => t.y === 94 && t.x !== 75).every((t) => t.rgba.join() === WHITE.join())).toBe(true);
    expect(rows.find((t) => t.text === 'P1')!.rgba).toEqual(WHITE);
    // A clan, when a row has one, is "[%s]" at x 20 (POSITION -345), in the row's name colour.
    const clan = byRole(roundScreenLayout(screen({ rows: [{ ...ROWS[1]!, clan: 'ABC' }] })).texts, 'row');
    expect(clan.find((t) => t.text === '[ABC]')).toMatchObject({ x: 20, y: 94, rgba: GOLD });
  });

  it('FINAL ROUND\'s lists: the seals at x 355 with 18 / 120 / 227 (373 / 475 / 582), the terrorists at 355 with 8 / 110 / 217, the name at 65', () => {
    const rows = byRole(roundScreenLayout(screen({ kind: 'finalRound', secondsLeft: 10 })).texts, 'row');
    expect(rows.filter((t) => t.y === 94).map((t) => [t.text, t.x])).toEqual([['P2', 65], ['10', 373], ['5', 475], ['1', 582]]);
    expect(rows.filter((t) => t.y === 296).map((t) => [t.text, t.x])).toEqual([['P3', 65], ['6', 363], ['3', 465], ['2', 572]]);
  });

  it('a side sorts by score, then kills, then name in reverse strcmp order, highest first (FUN_00225f30 D:L77014-77068; D:L76309)', () => {
    const r = (name: string, score: number, kills: number) => ({ ...row(0, 'seal', kills, 0, score), name });
    expect(sortRows([r('A', 10, 2), r('B', 10, 5), r('C', 10, 5), r('D', 3, 9)]).map((x) => x.name)).toEqual(['C', 'B', 'A', 'D']);
    // The layout lists them so.
    const rows = [r('A', 10, 2), r('B', 10, 5), r('C', 10, 5), r('D', 3, 9)];
    expect(byRole(roundScreenLayout(screen({ rows })).texts, 'row').filter((t) => t.x === 75).map((t) => t.text)).toEqual(['C', 'B', 'A', 'D']);
  });

  it('the lists reveal at 0.15 s then one row every 0.1 s (SEQUENCE_DELAY / SEQUENCE_INTERVAL)', () => {
    expect(ROW_REVEAL).toEqual({ delay: 0.15, interval: 0.1 });
    expect(revealedRows(0)).toBe(0);
    expect(revealedRows(0.1)).toBe(0);
    expect(revealedRows(0.15)).toBe(1);
    expect(revealedRows(0.249)).toBe(1);
    expect(revealedRows(0.25)).toBe(2);
    expect(revealedRows(0.85)).toBe(8);
    const names = (elapsed: number) => byRole(roundScreenLayout(screen({ elapsed })).texts, 'row').filter((t) => t.x === 75).map((t) => t.text);
    expect(names(0.1)).toEqual([]);
    expect(names(0.2)).toEqual(['P2', 'P3']);                     // one row a side
    expect(names(0.3)).toEqual(['P2', 'P1', 'P3', 'P4']);
  });
});

describe('ROUND COMPLETE and FINAL ROUND around the lists (research 179 s10 s1, s4, s10)', () => {
  it('the title at (45,50) / (75,50) / (55,60), scale 1.75, gold; NEXT ROUND / FINAL TOTALS at (380,50), the countdown +130 at 1.2', () => {
    const at = (kind: RoundScreen['kind']) => roundScreenLayout(screen({ kind, secondsLeft: 3 })).texts;
    expect(byRole(at('roundComplete'), 'title')).toEqual([expect.objectContaining({ text: 'ROUND COMPLETE', x: 45, y: 50, scale: 1.75, rgba: GOLD })]);
    expect(byRole(at('finalRound'), 'title')).toEqual([expect.objectContaining({ text: 'FINAL ROUND', x: 75, y: 50, scale: 1.75, rgba: GOLD })]);
    expect(byRole(at('gameComplete'), 'title')).toEqual([expect.objectContaining({ text: 'GAME COMPLETE', x: 55, y: 60, scale: 1.75, rgba: GOLD })]);
    expect(byRole(at('roundComplete'), 'next')).toEqual([expect.objectContaining({ text: 'NEXT ROUND', x: 380, y: 50, scale: 1 })]);
    expect(byRole(at('finalRound'), 'next')).toEqual([expect.objectContaining({ text: 'FINAL TOTALS', x: 380, y: 50, scale: 1 })]);
    expect(byRole(at('gameComplete'), 'next')).toEqual([]);
    expect(byRole(at('roundComplete'), 'countdown')[0]).toMatchObject({ text: '6', x: 510, y: 50, scale: 1.2 });
    expect(byRole(at('finalRound'), 'countdown')[0]).toMatchObject({ text: '6', x: 510, y: 50, scale: 1.2 });
  });

  it('SEALS (20,70) and TERRORISTS (20,270) at 1.0; WINNER / LOSER / DRAW gold at (200,70) / (200,273), FINAL ROUND\'s at 0.9 and (200,270)', () => {
    const texts = roundScreenLayout(screen({ winner: 'seal' })).texts;
    expect(byRole(texts, 'team').map((t) => [t.text, t.x, t.y, t.scale])).toEqual([['SEALS', 20, 70, 1], ['TERRORISTS', 20, 270, 1]]);
    expect(byRole(texts, 'result').map((t) => [t.text, t.x, t.y, t.scale])).toEqual([['WINNER', 200, 70, 1], ['LOSER', 200, 273, 1]]);
    expect(byRole(texts, 'result').every((t) => t.rgba.join() === GOLD.join())).toBe(true);
    expect(words(roundScreenLayout(screen({ winner: null })).texts, 'result')).toEqual(['DRAW', 'DRAW']);
    const fin = byRole(roundScreenLayout(screen({ kind: 'finalRound', winner: 'terrorist' })).texts, 'result');
    expect(fin.map((t) => [t.text, t.x, t.y, t.scale])).toEqual([['LOSER', 200, 70, 0.9], ['WINNER', 200, 270, 0.9]]);
  });

  it('the screen is multplay_back.tif under translucent backsolid panels: Team_back (5,10) 300x230 at 0.4, Team_back_Terr (5,240), column backs 100x180 at 0.3, 16 row strips 300x17 at 0.8 whatever the player count; no team bar', () => {
    for (const rows of [ROWS, [ROWS[0]!]]) {
      const { quads, tris, panels } = roundScreenLayout(screen({ rows }), PS2, SIZES);
      expect(quads.filter((q) => q.texture === 'multplay_back.tif')).toEqual([
        expect.objectContaining({ x: 320, y: 224, w: 640, h: 448, u0: 0, v0: 0, u1: 512, v1: 512, rgba: [1, 1, 1, 1], layer: 1 }),
      ]);
      const solid = quads.filter((q) => q.texture === 'backsolid.tif');
      expect(solid).toHaveLength(panels.length);
      expect(solid).toContainEqual(expect.objectContaining({ x: 155, y: 125, w: 300, h: 230, rgba: [1, 1, 1, 0.4] }));    // Team_back
      expect(solid).toContainEqual(expect.objectContaining({ x: 155, y: 340, w: 300, h: 200, rgba: [1, 1, 1, 0.4] }));    // Team_back_Terr
      expect(solid.filter((q) => q.w === 100 && q.h === 180 && q.rgba[3] === 0.3)).toHaveLength(6);
      const strips = solid.filter((q) => q.w === 300 && q.h === 17);
      expect(strips).toHaveLength(16);
      expect(strips.every((q) => q.rgba[3] === 0.8)).toBe(true);
      expect(strips.map((q) => q.y - 8.5)).toEqual([80, 100, 120, 140, 160, 180, 200, 220, 280, 300, 320, 340, 360, 380, 400, 420]);
      expect(solid.filter((q) => q.w === 100 && q.h === 17)).toHaveLength(48);
      expect(panels.filter((p) => p.name.startsWith('Kills_back_Seal') && p.h === 17).map((p) => p.alpha)).toEqual([1, 1, 1, 1, 0.9, 0.9, 0.9, 0.9]);
      // No team bar: nothing in the scoreboard's team colours (32,32,64) / (64,32,32), and only the backdrop as a shape.
      const team = (c: readonly number[]) => [c[0]! / 255, c[1]! / 255, c[2]! / 255].join();
      expect([...tris, ...quads].some((x) => [team([32, 32, 64]), team([64, 32, 32])].includes(x.rgba.slice(0, 3).join()))).toBe(false);
      expect(tris).toHaveLength(2);
      expect(tris[0]!.rgba).toEqual([0, 0, 0, 1]);
    }
  });

  it('without the bitmaps the panels are shapes in backsolid\'s (0,72,88) at the same alpha over the black backdrop', () => {
    expect(BACKSOLID_RGB).toEqual([0, 72, 88]);
    const { quads, tris, panels } = roundScreenLayout(screen({}), PS2, FONT_ONLY);
    expect(quads.some((q) => q.texture === 'multplay_back.tif' || q.texture === 'backsolid.tif')).toBe(false);
    expect(tris[0]!.rgba).toEqual([0, 0, 0, 1]);
    expect(tris[0]!.p.slice(0, 4)).toEqual([0, 0, 640, 0]);
    expect(tris).toHaveLength(2 + 2 * panels.length);
    const teal = [0, 72 / 255, 88 / 255];
    tris.slice(2).forEach((t, i) => expect(t.rgba).toEqual([...teal, panels[Math.floor(i / 2)]!.alpha]));
    expect(tris[2]!.p).toEqual([5, 10, 305, 10, 305, 240]);         // Team_back, (5,10) 300x230
    // On a wider frame the dialog's 640x448 sits centred, scaled by height.
    const wide = roundScreenLayout(screen({}), { width: 1280, height: 448 }, {});
    expect(wide.tris[2]!.p.slice(0, 2)).toEqual([325, 10]);
  });

  it('a screen up 90 s is timed out (TimeoutMonitor WAIT 90.0 -> GameStatePopCommand dlgNetError.rdr)', () => {
    expect(ROUND_SCREEN_TIMEOUT_S).toBe(90);
    expect(screenTimedOut(0)).toBe(false);
    expect(screenTimedOut(89.99)).toBe(false);
    expect(screenTimedOut(90)).toBe(true);
  });

  // ROUND-90 (research 315 §6 E1): each screen's own TimeoutMonitor starts at its own ONSTART (P:L13758-13760,
  // P:L14207-14209, P:L14664-14666), so the 90 s counts from the screen's open; the last screen the room names is held
  // until the room moves on (a client's ReplayMission / CloseAndSwitch do nothing, research 179 §6.18).
  it('ROUND-90: heldScreen -- which screen is up and for how long, each from its own open, the last held', () => {
    const round = [{ screen: 'roundComplete' as const, seconds: 5 }];
    const final = [{ screen: 'finalRound' as const, seconds: 10 }, { screen: 'gameComplete' as const, seconds: 10 }];
    expect(heldScreen(round, -0.1)).toBeNull();                                   // the engine's read: no screen yet
    expect(heldScreen([], 10)).toBeNull();
    expect(heldScreen(round, 0)).toEqual({ kind: 'roundComplete', index: 0, upFor: 0 });
    expect(heldScreen(round, 89.9)).toEqual({ kind: 'roundComplete', index: 0, upFor: 89.9 });   // held past its 5 s
    expect(heldScreen(final, 9.5)).toEqual({ kind: 'finalRound', index: 0, upFor: 9.5 });
    expect(heldScreen(final, 10)).toEqual({ kind: 'gameComplete', index: 1, upFor: 0 });   // FINAL ROUND's CountDown SWITCHMENU (P:L14205)
    expect(heldScreen(final, 100)).toEqual({ kind: 'gameComplete', index: 1, upFor: 90 });
    expect(screenTimedOut(heldScreen(final, 99.9)!.upFor)).toBe(false);
    expect(screenTimedOut(heldScreen(final, 100)!.upFor)).toBe(true);
  });

  it('ROUND-90: the screens open the engine\'s read after the roundOver -- the same 3 s as the page\'s own (netPage.ts ENGINE_READ_S, read as text)', () => {
    expect(ROUND_SCREENS_AFTER_S).toBe(3);
    const page = readFileSync(resolve(import.meta.dirname, '../src/netPage.ts'), 'utf8');
    expect(/const ENGINE_READ_S = (\d+(?:\.\d+)?);/.exec(page)?.[1]).toBe(String(ROUND_SCREENS_AFTER_S));
    expect(ROUND_SCREEN_TIMEOUT_DIALOG).toBe('dlgNetError.rdr');                // GameStatePopCommand(dlgNetError.rdr)
  });
});

describe('GAME COMPLETE (dlgMultiplayerFinalReally.rdr; research 179 s10 s6, s7, s9, s10)', () => {
  it('the MVP is the highest total score, then kills, then name, over both sides (FUN_002256f0 D:L76771-76885); its name at (20,155), its numbers at y 155 x 375 / 475 / 580', () => {
    const rows = [row(1, 'seal', 3, 1, 12), row(2, 'terrorist', 3, 4, 12), row(3, 'terrorist', 2, 0, 12), row(4, 'seal', 9, 9, 8)];
    expect(pickMvp(rows)!.name).toBe('P2');                       // 12 / 3 twice: the greater name
    expect(pickMvp([])).toBeNull();
    const texts = final({ rows });
    expect(byRole(texts, 'mvpLabel')).toEqual([expect.objectContaining({ text: 'MVP', x: 20, y: 135, scale: 1, rgba: GOLD })]);
    expect(byRole(texts, 'mvp').map((t) => [t.text, t.x, t.y, t.align])).toEqual(
      [['P2', 20, 155, 'left'], ['12', 375, 155, 'right'], ['3', 475, 155, 'right'], ['4', 580, 155, 'right']]);
    expect(words(final({ rows, mvp: 'P4' }), 'mvp')).toEqual(['P4', '8', '9', '9']);
    expect(byRole(final({ rows, mvp: null }), 'mvp')).toEqual([]);
  });

  it('GAME COMPLETE\'s YOUR STATS is nine values at x 250, y 225 + 23k: score, kills, deaths, hit %, head shots, primary, bonus, friendly kills, suicides (FUN_00225a00 D:L76886-76933)', () => {
    const you = { score: 11, kills: 12, deaths: 13, hitPct: 14, headshots: 15, primaryObjs: 16, bonusObjs: 17, friendlyKills: 18, suicides: 19 };
    const texts = final({ you });
    expect(byRole(texts, 'yourStats').map((t) => [t.text, t.x, t.y, t.scale, t.align])).toEqual(
      [11, 12, 13, 14, 15, 16, 17, 18, 19].map((v, k) => [String(v), 250, 225 + 23 * k, 0.9, 'left']));
    expect(byRole(texts, 'yourStatsLabel').map((t) => [t.text, t.x, t.y])).toEqual([
      ['YOUR STATS', 20, 198], ...['SCORE', 'KILLS', 'DEATHS', 'HIT %', 'HEAD SHOTS', 'PRIMARY OBJECTIVES', 'BONUS OBJECTIVES', 'FRIENDLY KILLS', 'SUICIDES']
        .map((l, k) => [l, 20, 224 + 23 * k]),
    ]);
    // Absent, the local row's three numbers and zeros; with the room's counters, theirs.
    expect(words(final(), 'yourStats')).toEqual(['10', '5', '1', '0', '0', '0', '0', '0', '0']);
    expect(yourStatsOf({ score: 1, kills: 2, deaths: 3 }, { shotsFired: 3, shotsHit: 2, headshots: 1, teamKills: 4, suicides: 5, primaryObjs: 0, bonusObjs: 0 }))
      .toEqual({ score: 1, kills: 2, deaths: 3, hitPct: 67, headshots: 1, primaryObjs: 0, bonusObjs: 0, friendlyKills: 4, suicides: 5 });
    expect(byRole(final({ you: null }), 'yourStats')).toEqual([]);
  });

  it('hit % is (int)(hits / shots x 100 + 0.5), 0 with no shot (FUN_00223970 D:L76064-76069)', () => {
    expect(hitPct(1, 3)).toBe(33);
    expect(hitPct(2, 3)).toBe(67);
    expect(hitPct(0, 0)).toBe(0);
    expect(hitPct(5, 5)).toBe(100);
    expect(hitPct(1, 8)).toBe(13);                                // 12.5 + 0.5
  });

  it('SEAL ROUNDS counts up 3.5-4.0 s and TERRORIST ROUNDS 4.0-4.5 s, the law of C2DCounter (FUN_0037b5c0 D:L274186-274245)', () => {
    expect(ROUND_COUNTERS).toEqual({ seal: { start: 3.5, end: 4.0 }, terrorist: { start: 4.0, end: 4.5 } });
    const S = ROUND_COUNTERS.seal, T = ROUND_COUNTERS.terrorist;
    expect(counterShown(6, 3.49, S.start, S.end)).toBeNull();
    expect(counterShown(6, 3.75, S.start, S.end)).toBe(3);
    expect(counterShown(6, 4.0, S.start, S.end)).toBe(6);
    expect(counterShown(4, 4.25, T.start, T.end)).toBe(2);
    // The four counters on the screen: RWS (390,196) / RLS (555,197) / RWT / RLT (267), each +35, HCENTERED 0.9.
    const at = (elapsed: number) => byRole(final({ wins: { seal: 6, terrorist: 4 }, elapsed }), 'counter').map((t) => [t.text, t.x, t.y, t.align]);
    expect(at(3.49)).toEqual([]);
    expect(at(3.75)).toEqual([['3', 390, 231, 'centre'], ['2', 555, 232, 'centre']]);
    expect(at(4.25)).toEqual([['6', 390, 231, 'centre'], ['4', 555, 232, 'centre'], ['2', 390, 302, 'centre'], ['3', 555, 302, 'centre']]);
    expect(at(5)).toEqual([['6', 390, 231, 'centre'], ['4', 555, 232, 'centre'], ['4', 390, 302, 'centre'], ['6', 555, 302, 'centre']]);
  });

  it('sums each side into SEAL TOTALS (20,85) and TERRORIST TOTALS (20,110) at 375 / 475 / 580; WINNER +220 on the side with more rounds', () => {
    const texts = final();
    expect(byRole(texts, 'totalsLabel').map((t) => [t.text, t.x, t.y, t.scale])).toEqual([['SEAL TOTALS', 20, 85, 0.9], ['TERRORIST TOTALS', 20, 110, 0.9]]);
    const totals = byRole(texts, 'totals');
    expect(totals.filter((t) => t.y === 85).map((t) => [t.text, t.x])).toEqual([['14', 375], ['7', 475], ['4', 580]]);
    expect(totals.filter((t) => t.y === 110).map((t) => [t.text, t.x])).toEqual([['8', 375], ['4', 475], ['7', 580]]);
    expect(byRole(texts, 'result').map((t) => [t.text, t.x, t.y])).toEqual([['WINNER', 240, 85]]);
    expect(byRole(final({ wins: { seal: 2, terrorist: 5 } }), 'result').map((t) => [t.text, t.y])).toEqual([['WINNER', 110]]);
    expect(byRole(final({ wins: { seal: 3, terrorist: 3 } }), 'result')).toEqual([]);
    expect(byRole(texts, 'header').filter((t) => t.y === 55).map((t) => [t.text, t.x])).toEqual([['SCORE', 368], ['KILLS', 475], ['DEATHS', 578]]);
  });

  it('the two-line round captions, TIME PLAYED at (470,350) and its value +25, the lobby line at (20,430); no round lists', () => {
    const texts = final();
    expect(byRole(texts, 'rounds').map((t) => [t.text, t.x, t.y])).toEqual([
      ['SEAL ROUNDS', 390, 196], ['WON', 390, 212], ['SEAL ROUNDS', 555, 197], ['LOST', 555, 213],
      ['TERRORIST ROUNDS', 390, 267], ['WON', 390, 283], ['TERRORIST ROUNDS', 555, 267], ['LOST', 555, 283],
    ]);
    expect(byRole(texts, 'time').map((t) => [t.text, t.x, t.y, t.align])).toEqual([['TIME PLAYED', 470, 350, 'centre'], ['00:06:07', 470, 375, 'centre']]);
    expect(timePlayedText(3600 + 61.9)).toBe('01:01:01');
    expect(byRole(texts, 'lobby')).toEqual([expect.objectContaining({ text: 'RETURNING TO GAME LOBBY. . .', x: 20, y: 430, scale: 0.9 })]);
    expect(byRole(texts, 'row')).toEqual([]);
    expect(byRole(texts, 'countdown')).toEqual([]);
    expect(READERX_LAYOUT.gameComplete.panels.filter((p) => p.name.startsWith('YourStatsRow')).map((p) => p.y)).toEqual([208, 231, 254, 277, 300, 323, 346, 369, 392]);
  });
});

describe('the HUD with a round screen up', () => {
  it('sets and clears the screen', () => {
    const hud = new Hud();
    expect(hud.state().model.roundScreen ?? null).toBeNull();
    const s = screen({});
    hud.setRoundScreen(s);
    expect(hud.state().model.roundScreen).toBe(s);
    hud.setRoundScreen(null);
    expect(hud.state().model.roundScreen).toBeNull();
  });

  it('hides what the scoreboard hides and the rest of the in-round HUD, and replaces the scoreboard', () => {
    for (const e of SCOREBOARD_HIDES) expect(ROUND_SCREEN_HIDES.has(e)).toBe(true);
    for (const e of ['bar', 'name', 'box', 'range', 'stance', 'banner', 'message'] as const) expect(ROUND_SCREEN_HIDES.has(e)).toBe(true);
    expect(ROUND_SCREEN_HIDES.has('fader')).toBe(false);
    const model = { ...DEFAULT_MODEL, name: 'SEAL', scoreboard: true, roundScreen: screen({}) };
    const pass = hudPass(PS2, model, FONT_ONLY, AT_REST, false, null);
    expect(pass.quads.some((q) => q.element === 'scoreboard')).toBe(false);
    expect(pass.quads.some((q) => q.element === 'roundScreen')).toBe(true);
    expect(pass.quads.some((q) => ROUND_SCREEN_HIDES.has(q.element))).toBe(false);
    // Without it, the scoreboard is back.
    const board = hudPass(PS2, { ...model, roundScreen: null }, FONT_ONLY, AT_REST, false, null);
    expect(board.quads.some((q) => q.element === 'scoreboard')).toBe(true);
    expect(board.quads.some((q) => q.element === 'roundScreen')).toBe(false);
  });

  it('Hud.addBitmaps (PF.R22): the round screens\' two bitmaps join the map\'s, kept across maps, the map\'s winning a shared name', () => {
    const rgba = (w: number, h: number, v = 255): Rgba => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(v) });
    const hud = new Hud();
    hud.addBitmaps({ 'multplay_back.tif': rgba(512, 512), 'backsolid.tif': rgba(16, 16) });
    expect(hud.sizes()).toEqual({});                               // no map yet: the HUD draws nothing
    hud.setBitmaps({ 'font_text_01.tif': rgba(512, 128) });
    expect(hud.sizes()).toMatchObject({ 'multplay_back.tif': { width: 512, height: 512 }, 'backsolid.tif': { width: 16, height: 16 }, 'font_text_01.tif': { width: 512, height: 128 } });
    hud.setBitmaps({ 'font_text_01.tif': rgba(512, 128), 'backsolid.tif': rgba(32, 32) });
    expect(hud.sizes()['multplay_back.tif']).toEqual({ width: 512, height: 512 });
    expect(hud.sizes()['backsolid.tif']).toEqual({ width: 32, height: 32 });
    hud.setBitmaps(null);
    expect(hud.sizes()).toEqual({});
  });
});

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const uimpPresent = ['RUN/MP2.ZDB', 'RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UIMP_PAL.ZED'].every((p) => existsSync(resolve(FIXTURES, p)));

describe.skipIf(!uimpPresent)(`the round screens' bitmaps from UIMP (PF.R22)${uimpPresent ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('PF.R22: the UIMP copies of multplay_back.tif and backsolid.tif reach the HUD through addBitmaps, so the round screens draw the backdrop and the panels as quads', async () => {
    // The ARMORY's decode (`armoryFromDisc`, UIMP first in its library order) is the one path: no second decoder.
    const data = await armoryFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2', { models: false });
    const extra = roundScreenBitmaps(data.bitmaps);
    expect(Object.keys(extra).sort()).toEqual(['backsolid.tif', 'multplay_back.tif']);
    // Research 179 s10 s3: multplay_back 512x512; backsolid 16x16, every texel CLUT index 0 = RGB (0,72,88).
    expect([extra['multplay_back.tif']!.width, extra['multplay_back.tif']!.height]).toEqual([512, 512]);
    const solid = extra['backsolid.tif']!;
    expect([solid.width, solid.height]).toEqual([16, 16]);
    expect([...solid.data.slice(0, 3)]).toEqual([...BACKSOLID_RGB]);
    const hud = new Hud();
    hud.addBitmaps(extra);
    const font = (w: number, h: number): Rgba => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    hud.setBitmaps({ 'font_text_01.tif': font(512, 128) });              // a map's HUD set
    hud.setBitmaps({ 'font_text_01.tif': font(512, 128) });              // a map change: the extras survive
    const sizes = hud.sizes();
    expect(sizes['multplay_back.tif']).toEqual({ width: 512, height: 512 });
    expect(sizes['backsolid.tif']).toEqual({ width: 16, height: 16 });
    for (const kind of ['roundComplete', 'finalRound', 'gameComplete'] as const) {
      const { quads, tris, panels } = roundScreenLayout(screen({ kind, ...(kind === 'gameComplete' ? { winner: null, timePlayed: 367 } : {}) }), PS2, sizes);
      expect(quads.filter((q) => q.texture === 'multplay_back.tif')).toHaveLength(1);
      expect(quads.filter((q) => q.texture === 'backsolid.tif')).toHaveLength(panels.length);
      expect(tris).toHaveLength(2);                                     // the backdrop only; no fallback panels
    }
  });
});

/**
 * NU-10 (the owner, NU.R4: "The round-end screen does not resize it's width to the screen's max width when cut off, it
 * should"). The original draws the three dialogs on its 640x448 frame (`FUN_003b1200` D:L305276-305277), which is the
 * whole screen, and cuts everything at that frame (the UI's scissor `FUN_003b0fa0(0,0,0x280,0x1c0)`, D:L270042; a
 * list's own scissor x 0..`DAT_004a44c4`, D:L270012): nothing of a round screen ever falls off the screen. The page's
 * frame is the window's; the screens were scaled by height / 448 alone, so a window narrower than 640:448 (two windows
 * side by side) cut their sides. They now fit as the front end's menus and the ARMORY do (ROUND_SCREEN_FRAME_FIT).
 */
describe('NU-10: the round screens fit the window as the menus do, cut only at their own frame', () => {
  const kinds = ['roundComplete', 'finalRound', 'gameComplete'] as const;
  const of = (kind: RoundScreen['kind'], over: Partial<RoundScreen> = {}) =>
    screen({ kind, ...(kind === 'gameComplete' ? { winner: null, timePlayed: 367 } : {}), ...over });
  const edges = (q: { x: number; y: number; w: number; h: number }) => [q.x - q.w / 2, q.y - q.h / 2, q.x + q.w / 2, q.y + q.h / 2];
  const glyphsOf = (quads: { texture: string }[]) => quads.filter((q) => q.texture === FONT_TEXT_01.texture) as unknown as { x: number; y: number; w: number; h: number; u0: number; u1: number }[];

  it('the fit is the menus\' and the ARMORY\'s rule (armoryFrame) at every window shape, portrait to 32:9', () => {
    for (const [w, h] of [[400, 800], [900, 500], [390, 844], [640, 448], [1280, 896], [1920, 600], [2560, 720], [960, 1040]] as const) {
      expect(roundScreenFrame(w, h)).toEqual(armoryFrame(w, h));
    }
  });

  it('a narrow window (960x1040, one of two side by side): the dialog spans the window\'s full width, letterboxed, on all three screens', () => {
    const frame = { width: 960, height: 1040 };
    for (const kind of kinds) {
      const { quads, tris } = roundScreenLayout(of(kind), frame, SIZES);
      // The BACKGROUND over the dialog's frame: 640 x 1.5 = 960 wide, 448 x 1.5 = 672 tall, centred both ways.
      const back = quads.find((q) => q.texture === 'multplay_back.tif')!;
      expect(edges(back)).toEqual([0, (1040 - 672) / 2, 960, (1040 + 672) / 2]);
      // Every panel and every glyph inside the window: nothing cut off at the sides.
      for (const q of quads) {
        const [x0, , x1] = edges(q);
        expect(x0).toBeGreaterThanOrEqual(-1e-9);
        expect(x1).toBeLessThanOrEqual(960 + 1e-9);
      }
      // The backdrop still covers the whole window (the bands above and below the frame).
      expect(tris[0]!.p).toEqual([0, 0, 960, 0, 960, 1040]);
    }
  });

  it('a wide window (1920x896): the dialog scales by height, centred across -- unchanged', () => {
    for (const kind of kinds) {
      const back = roundScreenLayout(of(kind), { width: 1920, height: 896 }, SIZES).quads.find((q) => q.texture === 'multplay_back.tif')!;
      expect(edges(back)).toEqual([320, 0, 1600, 896]);
    }
  });

  it('the fallback shapes take the same fit (no bitmaps): Team_back (5,10) 300x230 at x 1.5 in the narrow window', () => {
    const { tris } = roundScreenLayout(of('roundComplete'), { width: 960, height: 1040 }, FONT_ONLY);
    const y0 = (1040 - 672) / 2;
    expect(tris[2]!.p).toEqual([7.5, y0 + 15, 457.5, y0 + 15, 457.5, y0 + 360]);
  });

  it('a long name is drawn whole at the list\'s scale over the number columns -- no shrink, no cut short of the frame (ROUND_NAME_CUT_READING)', () => {
    expect(ROUND_NAME_CUT_READING).toBe('cut only at the frame');
    const name = 'W'.repeat(30);
    const rows = [{ ...ROWS[1]!, name }, ROWS[0]!];
    for (const kind of ['roundComplete', 'finalRound'] as const) {
      const base = glyphsOf(roundScreenLayout(of(kind, { rows: [ROWS[1]!, ROWS[0]!] }), PS2, FONT_ONLY).quads).length;
      const { texts, quads } = roundScreenLayout(of(kind, { rows }), PS2, FONT_ONLY);
      const t = byRole(texts, 'row').find((r) => r.text === name)!;
      expect([t.text, t.scale, t.align]).toEqual([name, 0.9, 'left']);
      // Wider than the gap to the first number column: it runs over the SCORE column, as the list draws it.
      const list = READERX_LAYOUT[kind].teams[0].list;
      expect(t.x + textWidth(name, 0.9)).toBeGreaterThan(list.x + list.columns[0]);
      // Every glyph of it drawn, shadow and text (P2's two glyphs gave way to 30): none cut, all inside the 640 frame.
      const glyphs = glyphsOf(quads);
      expect(glyphs.length - base).toBe(2 * (30 - 2));
      expect(Math.max(...glyphs.map((q) => edges(q)[2]!))).toBeLessThanOrEqual(640);
    }
    // GAME COMPLETE's MVP name likewise, whole.
    expect(byRole(roundScreenLayout(of('gameComplete', { rows })).texts, 'mvp')[0]!.text).toBe(name);
  });

  it('a name too long for the frame is cut at the frame\'s right edge (x 640), in the console frame and in a wide window', () => {
    const name = 'W'.repeat(80);
    const rows = [{ ...ROWS[1]!, name }, ROWS[0]!];
    for (const [frame, right] of [[PS2, 640], [{ width: 1920, height: 896 }, 1600]] as const) {
      const { quads, texts } = roundScreenLayout(of('roundComplete', { rows }), frame, FONT_ONLY);
      expect(byRole(texts, 'row').some((r) => r.text === name)).toBe(true);           // the string is whole; its drawing is cut
      const glyphs = glyphsOf(quads);
      expect(Math.max(...glyphs.map((q) => edges(q)[2]!))).toBeCloseTo(right, 6);
      // A glyph straddling the edge keeps its texels' scale: its texture span shrinks with its width.
      const edge = glyphs.filter((q) => Math.abs(edges(q)[2]! - right) < 1e-6);
      const same = (g: { u0: number; h: number }, q: { u0: number; h: number }) => g.u0 === q.u0 && g.h === q.h;   // the glyph at the row's scale
      const cut = edge.find((q) => glyphs.some((g) => same(g, q) && g.w > q.w + 1))!;
      expect(cut).toBeDefined();
      const full = glyphs.find((g) => same(g, cut) && g.w > cut.w + 1)!;
      expect((cut.u1 - cut.u0) / cut.w).toBeCloseTo((full.u1 - full.u0) / full.w, 6);
      // And nothing is drawn left of the frame either.
      expect(glyphs.every((q) => edges(q)[0]! >= (frame.width - 640 * (frame.height / 448)) / 2 - 1e-6)).toBe(true);
    }
  });
});

const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, 'RUN/UI/READERX.ZAR'))) ?? null;

describe.skipIf(DISC === null)(`NU-10: the three dialogs on the disc are the whole 640x448 frame${DISC === null ? ' (no SOCOM_DISC / SOCOM_PC_ROOT)' : ''}`, () => {
  // `RUN/UI/READERX.ZAR`, the member the game mounts at the round's end (`FUN_00223970` 0x223f00, D:L76089).
  const zar = DISC ? Zar.parse(new Uint8Array(readFileSync(resolve(DISC, 'RUN/UI/READERX.ZAR')))) : null;
  const dialog = (name: string) => loadDialog(parseRdr(zar!.data(zar!.find(name)!)));
  const DIALOGS = [['roundComplete', 'dlgMultiplayerRound.rdr'], ['finalRound', 'dlgMultiplayerFinal.rdr'], ['gameComplete', 'dlgMultiplayerFinalReally.rdr']] as const;

  it('each draws multplay_back.tif over its frame and its backsolid panels where the port puts them (place, size, opacity), x 5..625 of 640', () => {
    for (const [kind, file] of DIALOGS) {
      const d = dialog(file);
      expect(d.background?.filename).toBe('multplay_back.tif');
      const all = [...d.objects, ...d.controls];
      const at = (r: DialogRecord): [number, number] => {
        const p = r.childOf ? all.find((o) => o.name === r.childOf) : undefined;
        if (!p) return [r.x, r.y];
        const [px, py] = at(p);
        return [px + r.x, py + r.y];
      };
      const disc = all.filter((r) => r.widget.type === 'IMAGE' && r.widget.image.filename === 'backsolid.tif').map((r) => {
        const [x, y] = at(r);
        const size = (r.widget as { image: { size: [number, number] } }).image.size;
        return [x, y, size[0], size[1], r.opacity];
      });
      const port = (kind === 'gameComplete' ? READERX_LAYOUT.gameComplete.panels : READERX_LAYOUT[kind].panels).map((p) => [p.x, p.y, p.w, p.h, Math.fround(p.alpha)]);   // OPACITY is a single
      const key = (a: number[]) => a.join();
      expect(disc.map(key).sort()).toEqual(port.map(key).sort());
      expect(Math.min(...disc.map((p) => p[0]!))).toBe(5);
      expect(Math.max(...disc.map((p) => p[0]! + p[2]!))).toBe(625);
    }
  });

  it('no list column carries MAXWIDTH (ROUND_NAME_CUT_READING): every written column the loader\'s 1000, YourTotals\' default column 0', () => {
    for (const [, file] of DIALOGS) {
      const lists = dialog(file).controls.filter((r) => r.widget.type === 'LISTBOX');
      expect(lists.length).toBeGreaterThan(0);
      for (const r of lists) {
        const cols = (r.widget as { columns: { kind: number; maxWidth: number }[] }).columns;
        // `YourTotals` has no COLUMNS: the one default column, its +8 left 0 (D:L276086-276109), and its values still drawn.
        if (r.name === 'YourTotals') expect(cols.map((c) => [c.kind, c.maxWidth])).toEqual([[1, 0]]);
        else expect(cols.every((c) => c.kind === 1 && c.maxWidth === 1000)).toBe(true);   // D:L276178-276183
      }
    }
  });
});
