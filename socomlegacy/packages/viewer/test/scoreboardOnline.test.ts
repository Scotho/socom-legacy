import { describe, expect, it } from 'vitest';
import {
  CLAN_TAG_OVERRUN_READING, DETAILS_UNKNOWN, gameDetailLines, LAN_GAME_LINE, NO_CLAN, SCORE_LAYOUT, scoreboardLayout,
  servedRoomDetails, sessionGameDetails, SPECTATOR_ORDER_READING, SPECTATOR_RGB_READING, type GameDetails, type ScoreRowInfo,
} from '../src/scoreboard';
import { layoutText, textWidth } from '../src/hudFont';
import { gameCaption } from '../src/hud';
import { armoryNames } from '../src/armory';
import { ARMORY_SERVER_NAME_READING } from '../src/net/protocol';

/**
 * ONL-19 (research 269 §5): the SELECT scoreboard's online fields as `FUN_0022be20` (D:L79676-79843), `FUN_0022a290`
 * (D:L79023-79058) and `FUN_0022cc10` (D:L80025-80062) draw them -- GAME DETAILS' three lines online and on a LAN, the
 * rows' "[clan]" beside the name, the spectators' list; no rank, medal or rating (research 155 §3, R155.11).
 */

const PS2 = { width: 640, height: 448 };
const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 },
};
const info = { player: 'SEAL', game: 'CROSSROADS', type: 'DEMOLITION' };
type Quads = ReturnType<typeof scoreboardLayout>['quads'];
/** The text quads (not shadows) of `line` laid at the pen and baseline, as the layout draws them: the whole string, or none. */
const drawn = (quads: Quads, line: string, x: number, y: number, scale = 0.8): Quads => {
  const g = layoutText(line, x, y, scale).glyphs;
  const hit = g.map((h) => quads.find((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0
    && Math.abs(q.x - (h.x + h.w / 2)) < 1e-6 && Math.abs(q.y - (h.y + h.h / 2)) < 1e-6 && q.u0 === h.u0));
  return hit.every((q) => q) ? hit as Quads : [];
};
/** The text glyphs (not shadows) on a row's band (baseline - 14 .. + 4) between the panel's left (153) and `xMax`. */
const glyphsOn = (quads: Quads, base: number, xMax: number): Quads =>
  quads.filter((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0 && q.y > base - 14 && q.y < base + 4 && q.x > 153 && q.x < xMax);
const ONLINE: GameDetails = { comeFromLan: false, lobby: 'US East (Ohio)', game: 'Night Ops' };
const [Y1, Y2, Y3] = SCORE_LAYOUT.left.lines.ys;

describe('GAME DETAILS online and on a LAN (FUN_0022be20 D:L79676-79843)', () => {
  it('online: MEDIUS_LOBBY_NAME, GAMENAMEVAR, the type word', () => {
    expect(gameDetailLines(ONLINE, 'DEMOLITION')).toEqual(['US East (Ohio)', 'Night Ops', 'DEMOLITION']);
  });

  it('online, a variable not held: "UNKNOWN" (S:0x3e57e8) in its place', () => {
    expect(gameDetailLines({ comeFromLan: false, lobby: null, game: null }, 'BREACH')).toEqual([DETAILS_UNKNOWN, DETAILS_UNKNOWN, 'BREACH']);
    expect(DETAILS_UNKNOWN).toBe('UNKNOWN');
  });

  it('on a LAN (`ComeFromLan` non-zero): "LAN game" (S:0x3e5860), GAMENAMEVAR, the type word; the lobby not read', () => {
    expect(gameDetailLines({ comeFromLan: true, lobby: 'US East (Ohio)', game: 'Night Ops' }, 'ESCORT')).toEqual([LAN_GAME_LINE, 'Night Ops', 'ESCORT']);
    expect(gameDetailLines({ comeFromLan: true, lobby: null, game: null }, 'ESCORT')).toEqual([LAN_GAME_LINE, DETAILS_UNKNOWN, 'ESCORT']);
    expect(LAN_GAME_LINE).toBe('LAN game');
  });

  it('the third line by type, each from the game\'s mode: BREACH, DEMOLITION, ESCORT, EXTRACT, SUPPRESSION (S:0x3e5828-0x3e5850)', () => {
    const words = ['Breach', 'Demolition', 'Escort', 'Extraction', 'Suppression'].map((m) => gameDetailLines(ONLINE, gameCaption(m))[2]);
    expect(words).toEqual(['BREACH', 'DEMOLITION', 'ESCORT', 'EXTRACT', 'SUPPRESSION']);
  });

  it('the board draws the online lines at (24, 145 / 165 / 185), not "LAN game"', () => {
    const { quads } = scoreboardLayout(PS2, { ...info, details: ONLINE }, SIZES);
    expect(drawn(quads, 'US East (Ohio)', 24, Y1!).length).toBeGreaterThan(0);
    expect(drawn(quads, 'Night Ops', 24, Y2!).length).toBeGreaterThan(0);
    expect(drawn(quads, 'DEMOLITION', 24, Y3!).length).toBeGreaterThan(0);
    expect(drawn(quads, 'LAN game', 24, Y1!)).toHaveLength(0);
  });

  it('cuts an online line to 118 wide with "-" (D:L79712-79720), as the LAN one', () => {
    const long = 'A Very Long Lobby Name Indeed';
    const { quads } = scoreboardLayout(PS2, { ...info, details: { ...ONLINE, lobby: long } }, SIZES);
    const shown = drawn(quads, long, 24, Y1!);
    expect(shown).toHaveLength(0);
    let cut = long;
    while (textWidth(`${cut}-`, 0.8) > 118) cut = cut.slice(0, -1);
    expect(drawn(quads, `${cut}-`, 24, Y1!).length).toBeGreaterThan(0);
  });

  it('without details, the LAN fill unchanged: "LAN game", the map\'s name, its type', () => {
    const a = scoreboardLayout(PS2, info, SIZES);
    expect(drawn(a.quads, 'LAN game', 24, Y1!).length).toBeGreaterThan(0);
    expect(drawn(a.quads, 'CROSSROADS', 24, Y2!).length).toBeGreaterThan(0);
    expect(scoreboardLayout(PS2, { ...info, details: { comeFromLan: true, lobby: null, game: 'CROSSROADS' } }, SIZES)).toEqual(a);
  });
});

describe('the two matches\' sources of the lines', () => {
  it('the front end\'s: the session\'s `ComeFromLan` valve and its two UI variables, as the ARMORY reads them', () => {
    const vars: Record<string, string> = { MEDIUS_LOBBY_NAME: 'Recruits', GAMENAMEVAR: 'Night Ops' };
    const online = sessionGameDetails({ uiVar: (n) => vars[n] ?? null, valve: () => null });
    expect(online).toEqual({ comeFromLan: false, lobby: 'Recruits', game: 'Night Ops' });
    expect(sessionGameDetails({ uiVar: (n) => vars[n] ?? null, valve: (n) => (n === 'ComeFromLan' ? 0 : null) }).comeFromLan).toBe(false);
    expect(sessionGameDetails({ uiVar: () => null, valve: (n) => (n === 'ComeFromLan' ? 1 : null) })).toEqual({ comeFromLan: true, lobby: null, game: null });
  });

  it('/testroom\'s served round: the ARMORY title bar\'s stand-ins -- the server\'s name (or LOCAL) and the room\'s map', () => {
    expect(servedRoomDetails('US East (Ohio)', 'CROSSROADS')).toEqual({ comeFromLan: false, lobby: 'US East (Ohio)', game: 'CROSSROADS' });
    expect(servedRoomDetails(null, 'CROSSROADS').lobby).toBe(ARMORY_SERVER_NAME_READING);
    for (const server of ['Craig', null]) {
      const n = armoryNames({ online: true, server, room: 'FROSTFIRE' });
      expect(servedRoomDetails(server, 'FROSTFIRE')).toEqual({ comeFromLan: false, lobby: n.room, game: n.game });
    }
  });
});

describe('the rows\' "[clan]" (FUN_0022a290 D:L79042-79058)', () => {
  const row = (id: number, over: Partial<ScoreRowInfo> = {}): ScoreRowInfo =>
    ({ id, name: `P${id}`, team: 'seal', kills: 0, deaths: 0, score: 10 - id, alive: true, self: false, ...over });
  const base = (i: number): number => SCORE_LAYOUT.teams[0]!.y + 38 + 16.8 * i;
  const clanRgba = (f = 1): number[] => [128 / 128 * f, 64 / 128 * f, 32 / 128 * f, (110 / 128) * f];

  it('authored bots keep a gold first letter in their actual name; human names and clans retain native colors', () => {
    const bot = row(1, { name: 'Jester', bot: true });
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [bot] }, SIZES);
    const shown = drawn(quads, 'Jester', 223, base(0));
    expect(shown.length).toBe(6);
    expect(shown.slice(0, 1).map((quad) => quad.rgba)).toEqual(Array(1).fill([91 / 128, 72 / 128, 36 / 128, 110 / 128]));
    expect(shown.slice(1).every((quad) => quad.rgba[0] === 115 / 128 && quad.rgba[1] === 115 / 128 && quad.rgba[2] === 115 / 128)).toBe(true);
    expect(bot.name).toBe('Jester');
    expect(bot.clan).toBeUndefined();
    const human = scoreboardLayout(PS2, { ...info, rows: [row(1, { name: 'BOT Jester', clan: 'NSW' })] }, SIZES).quads;
    expect(drawn(human, 'BOT Jester', 223, base(0)).every((quad) => quad.rgba[0] === 115 / 128)).toBe(true);
    expect(drawn(human, '[NSW]', 163, base(0)).map((quad) => quad.rgba)).toEqual(Array(5).fill(clanRgba()));
  });

  it('a clan: "[" tag "]" (S:0x3e57a0, S:0x3e57a8) at x 163 in (128, 64, 32), alpha 110; the name still at 223', () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, { clan: 'NSW' })] }, SIZES);
    const tag = drawn(quads, '[NSW]', 163, base(0));
    expect(tag.length).toBe(5);
    for (const q of tag) expect(q.rgba).toEqual(clanRgba());
    expect(drawn(quads, 'P1', 223, base(0)).length).toBeGreaterThan(0);
  });

  it('no clan, or an empty tag: the buffer\'s single space (`_DAT_003dc980`) -- nothing drawn left of the name', () => {
    expect(NO_CLAN).toBe(' ');
    for (const r of [row(1), row(1, { clan: '' })]) {
      const { quads } = scoreboardLayout(PS2, { ...info, rows: [r] }, SIZES);
      expect(glyphsOn(quads, base(0), 223)).toHaveLength(0);
      expect(drawn(quads, 'P1', 223, base(0)).length).toBeGreaterThan(0);
    }
  });

  it('the local player\'s clan keeps its colour (only the name\'s blue turns 12); a dead row\'s clan x 0.6', () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, { clan: 'A', self: true }), row(2, { clan: 'B', alive: false })] }, SIZES);
    for (const q of drawn(quads, '[A]', 163, base(0))) expect(q.rgba).toEqual(clanRgba());
    expect(drawn(quads, 'P1', 223, base(0)).every((q) => q.rgba[2] === 12 / 128)).toBe(true);
    const dead = drawn(quads, '[B]', 163, base(1));
    expect(dead.length).toBe(3);
    for (const q of dead) clanRgba(0.6).forEach((c, k) => expect(q.rgba[k]).toBeCloseTo(c, 6));
  });

  it('the tag is not cut (only the details and the spectators are): a long one runs on under the name', () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, { clan: 'ABCDEFGHIJKLM' })] }, SIZES);
    expect(drawn(quads, '[ABCDEFGHIJKLM]', 163, base(0)).length).toBe(15);
  });

  it('a tag past the 16-byte buffer (14 or 15 characters): drawn whole, CLAN_TAG_OVERRUN_READING', () => {
    expect(CLAN_TAG_OVERRUN_READING).toBe('the whole tag, uncut');
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, { clan: 'ABCDEFGHIJKLMNO' })] }, SIZES);
    expect(drawn(quads, '[ABCDEFGHIJKLMNO]', 163, base(0)).length).toBe(17);
  });
});

describe('the spectators (FUN_0022cc10 D:L80025-80062)', () => {
  it('in the room\'s order, at most 8, each cut to 118 with "-"', () => {
    const names = ['Zed', 'Alpha', 'AVeryLongSpectatorNameHere', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [], spectators: names, details: ONLINE }, SIZES);
    expect(drawn(quads, 'Zed', 24, 270).length).toBeGreaterThan(0);
    expect(drawn(quads, 'Alpha', 24, 270 + 16.8).length).toBeGreaterThan(0);
    let cut = names[2]!;
    while (textWidth(`${cut}-`, 0.8) > 118) cut = cut.slice(0, -1);
    expect(drawn(quads, `${cut}-`, 24, 270 + 16.8 * 2).length).toBeGreaterThan(0);
    expect(drawn(quads, 'S7', 24, 270 + 16.8 * 7).length).toBeGreaterThan(0);
    expect(drawn(quads, 'S8', 24, 270 + 16.8 * 8)).toHaveLength(0);
    expect(SPECTATOR_ORDER_READING).toMatch(/queue head first, then the watchers in join order/);
  });

  it('in SPECTATOR_RGB_READING (115, 115, 115) at alpha 110: the slots\' own colour is unread', () => {
    expect([...SPECTATOR_RGB_READING]).toEqual([115, 115, 115]);
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [], spectators: ['Zed'] }, SIZES);
    const zed = drawn(quads, 'Zed', 24, 270);
    expect(zed.length).toBe(3);
    for (const q of zed) expect(q.rgba).toEqual([115 / 128, 115 / 128, 115 / 128, 110 / 128]);
  });
});

describe('no rank, medal or rating on the board (research 155 §3, R155.11)', () => {
  const rows: ScoreRowInfo[] = [
    { id: 1, name: 'P1', team: 'seal', kills: 3, deaths: 1, score: 30, alive: true, self: true, clan: 'NSW' },
    { id: 2, name: 'P2', team: 'terrorist', kills: 1, deaths: 3, score: 10, alive: true, self: false },
  ];
  it('a row carrying a told rating and medal (SEAT-TOLD\'s) draws exactly as one without', () => {
    const told = rows.map((r, i) => ({ ...r, rating: 1003 - i * 6, medal: 4, rank: 1 + i }));
    const sizes = { ...SIZES, 'Medal_Gold.tif': { width: 32, height: 32 }, 'Medal_Black.tif': { width: 32, height: 32 } };
    const a = scoreboardLayout(PS2, { ...info, rows, spectators: ['S'], details: ONLINE }, sizes);
    const b = scoreboardLayout(PS2, { ...info, rows: told, spectators: ['S'], details: ONLINE }, sizes);
    expect(b).toEqual(a);
    expect(new Set(a.quads.map((q) => q.texture))).toEqual(new Set(['newweapnbkrnd.tif', 'font_text_01.tif']));
  });
});
