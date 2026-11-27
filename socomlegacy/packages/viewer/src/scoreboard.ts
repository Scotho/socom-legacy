import { FONT_TEXT_01, layoutText, textWidth } from './hudFont';
import { detailsHidden, mask, ownNameShown } from './streamerMode';
import type { HudQuad, HudTri } from './hud';
import { ARMORY_SERVER_NAME_READING } from './net/protocol';
import { plainBotText, botDisplayName } from './botPresentation';

/**
 * The multiplayer round's scoreboard (socomlegacy/docs/research/87-hud.md §12): what SOCOM II shows while SELECT is held in a
 * round -- `FUN_0022be20` (L79675) builds it on the press (`FUN_0022cc10` L79974), rebuilds it every second while held
 * and hides it on the release (`FUN_0022bb30`); `FUN_0022a8b0` (L79100) draws it; while it is up the ammo box, the
 * compass, the prompts, the reticle and the timer are hidden (L56808-56828). Two parts: the team tables (SEALs above,
 * TERRORISTS below) on a nine-sliced `newweapnbkrnd.tif`, and the left column's GAME DETAILS and SPECTATORS.
 *
 * The viewer fills it with what it has: one SEAL (the player's name, or `DEFAULT_PLAYER`), no terrorists, no
 * spectators, the scores 0; the game details are the LAN game's lines (`"LAN game"`, the game's name, its type).
 * ONL-19 (research 269 §5): a served round's details are the online lines (`GameDetails`, `gameDetailLines`), from the
 * front end's session (`sessionGameDetails`) or `/testroom`'s room (`servedRoomDetails`); a row draws its "[clan]"
 * (`ScoreRowInfo.clan`). No rank, medal or rating is drawn (research 155 §3, R155.11).
 */

/** The panel's top: the message window's bottom (91) + its YMargin (8) + 5 (`0x436aa8`/`0x436ae8`). */
export const SCORE_TOP = 104;
/**
 * The Modern presentation's lift, in the 640x448 frame's pixels (owner ruling 2026-09-29: "try to bump up the location
 * of the scoreboard a bit when in modern mode"): the whole scoreboard -- the panel, the team bars, the rows, GAME
 * DETAILS and SPECTATORS -- drawn this much higher. 4 is what the gap to what sits above it allows: the message window
 * (`HUD_LAYOUT.message`: its panel y 0..99, its newest line's glyph cells, drop shadow included, down to ~99.9 at scale
 * 1), centre-anchored and height-scaled like the board, so the gap is the same at every aspect; the board's top at 100
 * stays clear of both. The compass above the right end is hidden while the board is up. The PS2 presentation keeps
 * the game's 104 (lift 0).
 */
export const MODERN_SCOREBOARD_LIFT = 4;
export const SCORE_LAYOUT = {
  /** The team tables' nine-slice over x 153..630, y 104..430 (`FUN_0022ae90` L79223), alpha 100. */
  panel: { x0: 153, x1: 630, y0: SCORE_TOP, y1: 430, corner: 20, alpha: 100 / 128 },
  /** The corners' texels as fractions: 20/173 across, 20/74 down (`DAT_003e5718` 0.8844, `DAT_003e5720` 0.2703). */
  cornerUv: { u: 20 / 173, v: 20 / 74 },
  /** SEALs from the top, TERRORISTS from the panel's middle, (104 + 430) / 2 = 267 (`FUN_00229d00` L78846). */
  teams: [
    { name: 'SEALs', y: SCORE_TOP, header: [32, 32, 64] as [number, number, number] },
    { name: 'TERRORISTS', y: (SCORE_TOP + 430) / 2, header: [64, 32, 32] as [number, number, number] },
  ],
  /** A team's header bar: untextured, x 153..630, 25 high, alpha 80. */
  header: { h: 25, alpha: 80 / 128 },
  /** The header's line "SEALs :   %d" at the pen (171, y + 20), scale 1, alpha 90; the columns centred on y + 20. */
  title: { x: 171, dy: 20, scale: 1, alpha: 90 / 128 },
  /** "KILLS" (locale 60523), "DEATH", "SCORE" centred on 455, 522, 588 (175 and 175/3 from `DAT_003dc8e8`). */
  columns: [{ text: 'KILLS', x: 455 }, { text: 'DEATH', x: 522 }, { text: 'SCORE', x: 588 }],
  /** Rows: baseline y + 38 + 16.8 i, 8 a team, scale 0.8; the clan tag at 163, the name at 223 (`FUN_0022a290`). */
  rows: { dy: 38, pitch: 16.8, max: 8, scale: 0.8, clanX: 163, nameX: 223 },
  /** Row colours: (115, 115, 115) alpha 110; the local player's blue 12; the clan tag (128, 64, 32). */
  rowRgb: [115, 115, 115] as [number, number, number], localRgb: [115, 115, 12] as [number, number, number],
  clanRgb: [128, 64, 32] as [number, number, number], rowAlpha: 110 / 128,
  /** Odd rows' stripes: x 161..624, baseline - 12 .. + 4, `newweapnbkrnd`'s centre texel, alpha 60. */
  stripe: { x0: 161, x1: 624, up: 12, down: 4, alpha: 60 / 128 },
  /** The left column: x 10..152; its headers green (64, 128, 64) alpha 80, 25 high (`DAT_00412e68`, `FUN_0022ac30`). */
  left: {
    x0: 10, x1: 152, headerRgb: [64, 128, 64] as [number, number, number], headerAlpha: 80 / 128,
    details: { y0: SCORE_TOP, y1: 229, title: 'GAME DETAILS', titleAt: [20, 124] as [number, number] },
    spectators: { y0: 229, y1: 430, title: 'SPECTATORS', titleAt: [20, 249] as [number, number] },
    /** The detail lines at the pen x 24, y 145 / 165 / 185, scale 0.8, cut with "-" to 118 wide. */
    lines: { x: 24, ys: [145, 165, 185], scale: 0.8, width: 118 },
  },
} as const;

/** The viewer's SEAL when no name is set. */
export const DEFAULT_PLAYER = 'SEAL';

/** GAME DETAILS' first line on a LAN: "LAN game" (S:0x3e5860, `FUN_0022be20` D:L79780). */
export const LAN_GAME_LINE = 'LAN game';
/** A details line whose UI variable is not held: "UNKNOWN" (S:0x3e57e8, D:L79682, D:L79711, D:L79799). */
export const DETAILS_UNKNOWN = 'UNKNOWN';
/** A row's clan text without a clan: the buffer's seed `_DAT_003dc980`, bytes 20 00 .. -- one space (D:L79043-79046). */
export const NO_CLAN = ' ';

/**
 * What GAME DETAILS' first two lines read (`FUN_0022be20` D:L79678-79812, research 269 §5): `ComeFromLan` (the valve
 * S:0x3f6328 `FUN_003045b0` tests, D:L79678) and the UI variables MEDIUS_LOBBY_NAME (S:0x3e57d0) and GAMENAMEVAR
 * (S:0x3e57f0), null when not held.
 */
export interface GameDetails { comeFromLan: boolean; lobby: string | null; game: string | null }

/**
 * The three detail lines (research 269 §5.1): online the lobby's name, the game's name and the type word; on a LAN
 * "LAN game", the game's name and the type word (D:L79776-79853); a variable not held is "UNKNOWN". `type` is the type
 * word already (`./hud`'s `gameCaption`, the switch on game +0x111 at D:L79742-79754 / D:L79833-79845).
 *
 * Three error branches are not modelled, because a held variable is always a string on the port's paths, so null
 * means "not held" here. On a LAN, a held GAMENAMEVAR that is not a string draws "GAME TYPE ERROR" (S:0x3e5870,
 * D:L79807-79809). Online, a non-string MEDIUS_LOBBY_NAME (D:L79685-79690) or GAMENAMEVAR (D:L79714-79719) copies from
 * a null pointer.
 */
export function gameDetailLines(d: GameDetails, type: string): [string, string, string] {
  return [d.comeFromLan ? LAN_GAME_LINE : d.lobby ?? DETAILS_UNKNOWN, d.game ?? DETAILS_UNKNOWN, type];
}

/**
 * STREAMER-P1 (OT.R152; product track, **a browser adaptation**, `./streamerMode`): GAME DETAILS as drawn. While Streamer
 * mode's Room and account details are Hidden, the lobby (or server) line and the game's name read
 * `HIDDEN_DETAIL_WORDS` -- what a viewer could use to find the game; "LAN game" and the type word are kept. Otherwise the
 * lines as `gameDetailLines` gives them. The original draws them always; this only hides them on this player's screen.
 */
export function shownDetailLines(lines: readonly [string, string, string]): [string, string, string] {
  const [where, game, type] = lines;
  return [where === LAN_GAME_LINE ? where : mask(where), mask(game), type];
}

/**
 * The front end's match (research 269 §5): the session's `ComeFromLan` valve (absent reads 0, `FUN_003045b0`) and its
 * two UI variables' strings, as the game lobby's ARMORY reads them (`./lobbyArmory`).
 */
export function sessionGameDetails(s: { uiVar(name: string): string | null; valve(name: string): number | null }): GameDetails {
  return { comeFromLan: (s.valve('ComeFromLan') ?? 0) !== 0, lobby: s.uiVar('MEDIUS_LOBBY_NAME'), game: s.uiVar('GAMENAMEVAR') };
}

/**
 * `/testroom`'s served round (research 269 §5): it has no Medius lobby and no created game, so the two variables take
 * the ARMORY title bar's stand-ins for the same two (`./armory`'s `armoryNames`): the match server's name, else
 * `ARMORY_SERVER_NAME_READING`; the room's map (ARMORY_GAME_NAME_READING). Online: the round is served.
 *
 * E17 (B-83; a browser adaptation, the replay viewer has no original): a replay's world hands `named`, the match central's
 * public replay entry names (`./modern/replays/worldHost` `details`) -- its region over the server's name, its lobby name
 * over the map, each stand-in kept where it carries none (a local replay, an older central, a password game's name).
 * Handed from the viewer's realm: anything not a non-empty string is none.
 */
export function servedRoomDetails(server: string | null, room: string,
  named?: { region: string | null; lobbyName: string | null } | null): GameDetails {
  const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  return { comeFromLan: false, lobby: text(named?.region) ?? server ?? ARMORY_SERVER_NAME_READING, game: text(named?.lobbyName) ?? room };
}

/** What the scoreboard shows. */
export interface ScoreboardInfo {
  /** The player's name (`hud.setPlayerName`), the one SEAL row. */
  player: string;
  /** The game's name (the viewer's: the map's) and its type (`BREACH`, `DEMOLITION`, ... `SUPPRESSION`). */
  game: string; type: string;
  /**
   * Every player of the round (`net`'s `ScoreRow`, plus `self`): absent is the single SEAL row above. Each team's rows are
   * sorted by `score` descending, ties in the order given (join order), cut to 8 (research 91 §11). Ghosts and nameless
   * players are the caller's to leave out.
   */
  rows?: ScoreRowInfo[];
  /** The spectators' names, the SPECTATORS panel's lines (87 §12: up to 8). */
  spectators?: string[];
  /** Rounds won, the team lines' number: the host's copy taken 3.0 s after the end state (87 §12, reading; 91 §18); with `rows` only, default 0. */
  wins?: { seal: number; terrorist: number };
  /** ONL-19: the details' source (`gameDetailLines`; line 3 is `type`); absent, the LAN fill: "LAN game", `game`, `type`. */
  details?: GameDetails;
  /**
   * BOMB-MARKS: the id of the player who holds the bomb (item 0x9a), or null / absent: his row takes the satchel
   * (`SCOREBOARD_SATCHEL_RECT`), for every viewer (OT.R109 as amended: the original's). Fed by `./bombPage` through
   * `Hud.setBombCarrier`.
   */
  bombCarrier?: number | null;
  /**
   * WM-DATA (a BROWSER ADAPTATION, `PING_BARS_ADAPTATION`): the id of the row under the mouse (`scoreboardRowAt`), or
   * null / absent: that row's ping is drawn as its number beside its bars while hovered. A pad has no hover.
   */
  hoverRow?: number | null;
  /**
   * WM-13 (a BROWSER ADAPTATION, the DAMAGE REPORT PANEL; `./damagePanel` `damagePanelRows`, look 2F): the report laid into
   * the board's rows -- the team lines, the column headers and the rows replaced, the frame (the header bars, the
   * nine-slice, the stripes, the left column) drawn as ever. Absent: the board.
   */
  damage?: DamageBoardReport;
  /**
   * WM-13: the damage panel's hint (`./damagePanel` `damageHintText`), drawn above the panel's right end
   * (`DAMAGE_HINT_ADAPTATION`) in the board's place and scale. Absent: none.
   */
  damageHint?: string;
}

/**
 * DAMAGE_HINT_ADAPTATION (WM-13, a browser adaptation; the owner: "the hint can be just above in the most visually
 * satisfying spot"; placement B, approved by the controller 2026-11-15 with the words "<SELECT> + <R2>  DMG"): the
 * hint's baseline 6 above the panel's top (104), so its tallest cell, the SELECT pad glyph's (to the baseline + 4.93 at 0.8), ends 1.07 above the panel;
 * right-aligned to the original panel's right edge (630, `SCORE_LAYOUT.panel.x1`) -- on a board with rows (OPS-S1, panel
 * 144..639) that is 9 inside the panel's right edge, not flush; the hint is not moved there; the board's rows' scale 0.8; the HUD's help
 * lines' colour and alpha (`./hud` `SPECTATOR_HELP`: (100, 100, 20), alpha 100 -- repeated here, the board imports no HUD
 * value; the test pins them equal), the letters with their drop shadow, the pad glyphs in their own grey with none.
 */
export const DAMAGE_HINT_ADAPTATION = {
  baseline: SCORE_TOP - 6, right: SCORE_LAYOUT.panel.x1, scale: 0.8, rgb: [100, 100, 20] as const, alpha: 100,
} as const;

/** WM-13: the hint's pen and its glyph cells' box on the PS2 frame (unlifted, unscaled). */
export function damageHintBox(text: string): { pen: number; baseline: number; x0: number; x1: number; y0: number; y1: number } {
  const H = DAMAGE_HINT_ADAPTATION;
  const w = textWidth(text, H.scale, { special: true }), pen = H.right - w;
  const { glyphs } = layoutText(text, pen, H.baseline, H.scale, { special: true });
  return {
    pen, baseline: H.baseline, x0: pen, x1: pen + w,
    y0: Math.min(...glyphs.map((g) => g.y)), y1: Math.max(...glyphs.map((g) => g.y + g.h)),
  };
}

/** WM-13: one string of a panel row, at its x, aligned, in its colour (0..1). */
export interface DamageBoardCell { text: string; x: number; align: 'left' | 'centre' | 'right'; rgba: readonly [number, number, number, number] }
/** WM-13: a panel row's thin bar -- its track, then its fill to `share` -- `up` above the baseline, `h` high. */
export interface DamageBoardMeter {
  x0: number; x1: number; up: number; h: number; share: number;
  rgba: readonly [number, number, number, number]; track: readonly [number, number, number, number];
}
/** WM-13: one panel row. */
export interface DamageBoardRow { cells: DamageBoardCell[]; meters: DamageBoardMeter[] }
/** WM-13: the panel as the board draws it -- the two team lines' words, the headers, each block's rows. */
export interface DamageBoardReport {
  titles: readonly [string, string];
  headers: readonly { text: string; x: number }[];
  rows: readonly [readonly DamageBoardRow[], readonly DamageBoardRow[]];
}

/** One player's scoreboard row; KILLS / DEATH / SCORE are the match totals (91 §18). */
export interface ScoreRowInfo {
  id: number; name: string; team: 'seal' | 'terrorist'; kills: number; deaths: number; score: number; alive: boolean;
  /** The local player: drawn in `localRgb`, as the single-row layout does. */
  self: boolean;
  /** Authored extension: trusted CPU identity is separate from the name and clan tag. */
  bot?: true;
  /**
   * NCW-7 (a browser adaptation): the seat's ping, whole ms -- the room's score row's `ping` (`ScoreRow.ping`, the
   * heartbeat's smoothed round trip), handed here whole by the page (`NetPage`'s `score`). WM-DATA draws it as the row's
   * signal bars (`pingBars`) and its number on hover; 0 or absent (no reading yet, an older room) lights no bar, as a
   * bot's row does.
   */
  ping?: number;
  /**
   * WM-DATA (protocol 17; a PRODUCT ADAPTATION, the original keeps no assists, research 155 §3): the seat's assists this
   * match (`ScoreRow.assists`) -- the board's ASSISTS column (`SCORE_COLUMNS_ADAPTATION`) and GAME COMPLETE's -- and this
   * round (`ScoreRow.roundAssists`, ROUND COMPLETE's and FINAL ROUND's), handed whole by the page. Absent (a room with no
   * live match record: the Forge, the loopback test room) draws `ASSISTS_NONE`, never 0.
   */
  assists?: number; roundAssists?: number;
  /**
   * ONL-19: the player's clan tag (the record's +0x2e, `FUN_002c3ac0` D:L79042; research 91 §13), drawn "[tag]" at
   * `clanX`; absent or empty, nothing (`NO_CLAN`). CLAN-TAG-ROUND (research 275): the room's score rows carry it
   * (`ScoreRow.clan`, the server's tag of the seat's account at its seat, `CLAN_TAG_AT_SEAT_READING`), handed here whole by
   * the page (`NetPage`'s `score`).
   */
  clan?: string;
}

/** WM-DATA: the bars' bitmap -- the HUD's plain white texel (`./hud` `WHITE`, named here to keep `./hud` a type import). */
const PING_BAR_TEXTURE = 'white';

/** The dead rows' colour factor (`0x3f19999a`, `FUN_0022a290` L79022-79024, research 91 §11). */
export const DEAD_DIM = 0.6;
/** The SPECTATORS names: pen (24, 270 + 16.8 i), scale 0.8, up to 8 (research 87 §12). */
export const SPECTATOR_LINES = { x: 24, y0: 270, pitch: 16.8, max: 8 } as const;
/**
 * SPECTATOR_RGB_READING (ONL-19, research 269 §5.3, §5.6): the SPECTATORS names' colour. `FUN_0022ac30` sets only
 * their scale (+0x40) and their alpha 110 (+0x54, D:L79212-79216), so the colour is the text object's own default
 * (`FUN_003631c0`'s virtual initialiser, unread). The port draws the details' (115, 115, 115). [reading]
 */
export const SPECTATOR_RGB_READING = [115, 115, 115] as const;
/**
 * SPECTATOR_ORDER_READING (ONL-19, research 269 §5.3, §5.6): the board lists the spectators in the order the room's
 * `score` frame names them. That order is the room's lobby: the queue head first, then the watchers in join order
 * (`net/lobby.ts`). The original walks its player list (`DAT_004362e8`, `FUN_0022cc10` D:L80021-80055), whose
 * insertion order is unread. The two agree while no spectator is queued behind a watcher. [reading]
 */
export const SPECTATOR_ORDER_READING = 'the room\'s: its queue head first, then the watchers in join order';
/**
 * CLAN_TAG_OVERRUN_READING (ONL-19, research 269 §5.2, §5.6): "[" + tag + "]" + NUL fills `FUN_0022a290`'s 16-byte
 * buffer (D:L79043-79051) for a tag of up to 13 characters. A longer one (the record holds up to 15, research 91 §13)
 * runs past it, and what the console then draws is unread. The port draws the whole tag, uncut. [reading]
 */
export const CLAN_TAG_OVERRUN_READING = 'the whole tag, uncut';

/**
 * BOMB-MARKS (research 87 s12, 214 s3 "The scoreboard's satchel"): the satchel on the bomb carrier's row. `FUN_0022a290`
 * (D:L78976) tests the row's player for item 0x9a (`FUN_005c8640(+0x5e0, 0x9a)`, D:L79026) and places the sprite 0x40dbf0
 * (`hud_satchel.tif`, the string 0x3e5880 loaded at D:L80001-80003; HUD2 on MP2, MP6 and MP72) over x `DAT_003dc960`
 * .. + `DAT_003dc968` and the row's baseline - `DAT_003dc970` .. + `DAT_003dc968` - `DAT_003dc970` (D:L79028-79029):
 * 200.0, 16.0 and 12.0 off the ELF, so x 200..216, baseline - 12 .. + 4, the whole bitmap stretched over it. Drawn after
 * the rest of the board (`FUN_00364a30(0x40dbf0)` D:L79156, last in `FUN_0022a8b0`). Shown to every viewer, both teams
 * and a spectator alike, as the original: `FUN_00229d00` draws both teams' blocks (D:L80018-80019), `FUN_0022a290` tests
 * nothing of the viewer (D:L79026), and the board opens for any seat (`FUN_0022be20`, SELECT; research 87 s12). OT.R109
 * as amended 2026-11-06 (the owner: both teams). The single-SEAL board draws it here; a board with the room's rows draws
 * it in its own slot instead (`SCOREBOARD_SATCHEL_SLOT_ADAPTATION`, `pingBarsPlace().satchelX0`), the same height and
 * bitmap, still last.
 */
export const SCOREBOARD_SATCHEL_RECT = { x0: 200, x1: 216, up: 12, down: 4 } as const;
/**
 * SCOREBOARD_SATCHEL_RGBA_READING (BOMB-MARKS; research 87 s16): the satchel's colour, 0-1 of GS 128 -- the sprite's own.
 * Its constructor `FUN_00364c50` (run on 0x40dbf0 by `FUN_003fe980` D:L327849) sets (128, 128, 128) (D:L262041-262046)
 * and alpha 128 through its `+0x34` virtual (D:L262047; `+0x34` is the alpha setter by `FUN_00229d00`'s use, D:L78881,
 * research 87 s12's bar alpha 80); nothing sets it after (D:L79028-79030, D:L80002-80003, D:L79156 and D:L327850 are the
 * sprite's only other uses). [reading]
 */
export const SCOREBOARD_SATCHEL_RGBA_READING = [1, 1, 1, 1] as const;

/** NCW-7 (a browser adaptation): a bot's ping, or a seat's with no reading yet -- WM-DATA draws no number for it on hover. */
export const PING_NONE = '--';
/** NCW-7: a row's ping as text -- whole ms, or `PING_NONE` for a bot or a ping of 0 / absent (WM-DATA's hovered number). */
export function pingCell(r: Pick<ScoreRowInfo, 'ping' | 'bot'>): string {
  return r.bot === true || !r.ping || r.ping <= 0 ? PING_NONE : String(Math.round(r.ping));
}

/*
 * WM-DATA, the SCOREBOARD's look (lane MATCH-DATA; product track, a BROWSER ADAPTATION with no original -- the original's
 * board has no ping and no assists, research 155 §3). The owner's call 1, decided 2026-11-15 (his words through the main
 * controller 8f: "1. A / 2. yeah the squeeze is acceptable ... / 3. hovered ping number overlapping the tag is okay as
 * long as its temporary / 4. can the bars just be aligned all the way left?", then on 1E: "give enough left padding such
 * that bars start at the same visual area as seals/terorsit text"). Drawn only on a board with the room's rows
 * (`info.rows`): the single-SEAL board of a round with no room stays the original's three columns, untouched.
 */

/**
 * SCORE_COLUMNS_ADAPTATION (WM-DATA, order A): the four number columns on a board with rows -- KILLS, DEATHS, ASSISTS,
 * SCORE (K / D / A: the contributor's PR #940, ruled by the owner on 2026-11-25, MISSION OT.R161; was KILLS, ASSISTS,
 * DEATH -- DEATHS as the round screens spell it, where the original's board has "DEATH": a labelled divergence from the
 * original's DEATH, the owner's ruling, MISSION OT.R161) -- in the board's four slots one pitch (66.5) apart: the slot NCW-7's PING
 * column held (388.5) and the original's three (455, 522, 588; `SCORE_LAYOUT.columns`). The headers in the original three's font, scale, colour and alpha;
 * "ASSISTS" (no string of the game's) 59 wide at scale 1, clear of its neighbours. The ping leaves its column for the
 * row's bars (`PING_BARS_ADAPTATION`).
 */
export const SCORE_COLUMNS_ADAPTATION = [
  // DEATHS: a labelled divergence from the original's DEATH (SCORE_LAYOUT.columns): the owner's ruling, MISSION OT.R161.
  { key: 'kills', text: 'KILLS', x: 388.5 }, { key: 'deaths', text: 'DEATHS', x: 455 },
  { key: 'assists', text: 'ASSISTS', x: 522 }, { key: 'score', text: 'SCORE', x: 588 },
] as const;
/** WM-DATA: a row's figure by column. */
export type ScoreColumnKey = (typeof SCORE_COLUMNS_ADAPTATION)[number]['key'];
/** WM-DATA: the ASSISTS cell of a row with no `assists` (a room with no live match record) -- a dash, never 0. */
export const ASSISTS_NONE = '-';
/** WM-DATA: a row's cell under a column -- the number, or `ASSISTS_NONE` for assists not carried. */
export function scoreCell(r: Pick<ScoreRowInfo, ScoreColumnKey>, key: ScoreColumnKey): string {
  const n = r[key];
  return n === undefined ? ASSISTS_NONE : String(n);
}
/**
 * WM-DATA: the widest a row's name may be -- from its pen (`pingBarsPlace().nameX`, 241.4 on the widened board) to 4
 * before the KILLS column's widest figure ("999" at the row scale, centred on 388.5 + `grow` = 397.5), as NCW-7's PING
 * column cut it: 141.6, as before OPS-S1 widened the board. A 14-letter W name is whole.
 */
export function rowNameWidth(): number {
  const L = SCORE_LAYOUT, P = pingBarsPlace();
  return SCORE_COLUMNS_ADAPTATION[0].x + P.grow - textWidth('999', L.rows.scale) / 2 - 4 - P.nameX;
}

/**
 * PING_BAR_THRESHOLDS_ADAPTATION (WM-DATA; the owner's "three signal bars"): whole ms -- at most `green` lights three bars
 * green, at most `yellow` two yellow, above that one red; a bot or a seat with no reading lights none. The same two the
 * look's mock (MEGA-MOCK call 1) drew.
 */
export const PING_BAR_THRESHOLDS_ADAPTATION = { green: 80, yellow: 150 } as const;
/**
 * PING_BARS_ADAPTATION (WM-DATA): the three bars -- each `w` wide, `gap` apart, `heights` tall up from the row's baseline,
 * an untextured quad (the HUD's white texel, `./hud` `WHITE`); lit in the message window's green, yellow and red
 * (`./matchMessages` `MESSAGE_COLOURS` 3, 1 and 5, 0..128), the unlit ones in the row's grey at `dim` of its alpha; the
 * whole set dimmed with a dead row (`DEAD_DIM`).
 */
export const PING_BARS_ADAPTATION = {
  w: 3, gap: 1, heights: [4, 7, 10], dim: 0.35,
  rgb: { green: [64, 128, 64], yellow: [128, 128, 64], red: [128, 64, 64] },
} as const;
/**
 * The longest clan tag a player can type: the CLAN TAG keyboard's cap, 3 characters -- the disc's `dlgManageRosterLeader`
 * `clan_tag` GetTextInput, `MaxChars` 3 / `MaxBytes` 15 (research 272 s6, 272-clan-roster.md:107-111;
 * `tools/test/manageRosterDisc.test.ts`). The seat's field is the record's 15 (`CLAN_TAG_OVERRUN_READING`), wider than any
 * tag the keyboard sets.
 */
export const CLAN_TAG_TYPEABLE_CHARS = 3;
/** WM-DATA: the widest tag a player can type -- three "&", the font's widest printable glyph (14 at scale 1; "[&&&]" 45 at 0.8). */
export const CLAN_TAG_WIDEST = '&'.repeat(CLAN_TAG_TYPEABLE_CHARS);
/**
 * PING_TAG_GAP_ADAPTATION (WM-DATA, capture 1F; the controller's ruling 2026-11-15, building to 1F as the default until the
 * owner confirms): the clan tag's pen this far after the bars' right edge. The bars' left edge is the team heading's first
 * glyph, computed at draw time (`pingBarsPlace`; 161.4 for "SEALs" and "TERRORISTS" alike on the board OPS-S1 widened,
 * 170.4 before) -- the owner's "bars start at the same visual area as seals/terorsit text".
 */
export const PING_TAG_GAP_ADAPTATION = 4;
/**
 * PING_NAME_GAP_ADAPTATION (WM-DATA, capture 1F): the name's pen this far after the widest typeable tag (`CLAN_TAG_WIDEST`)
 * drawn at the tag's pen, so every row's name starts at one x and no tag a player can have reaches it. Since OPS-S1 the
 * satchel's slot stands between them (`SCOREBOARD_SATCHEL_SLOT_ADAPTATION`, its own gap each side); this gap is what the
 * slot replaces, so the board grows by the slot less it.
 */
export const PING_NAME_GAP_ADAPTATION = 2;
/**
 * SCOREBOARD_SATCHEL_SLOT_ADAPTATION (OPS-S1, a BROWSER ADAPTATION of the board with the room's rows; product track).
 * The original draws the bomb carrier's satchel at x 200..216 (`SCOREBOARD_SATCHEL_RECT`, `FUN_0022a290` D:L79028-79029),
 * between its clan tag's pen (163) and its name's (223). WM-DATA's ping bars moved the tag's pen to 185.4 and the name's to
 * 232.4, so 200..216 lay inside the tag's lane, over any tag wider than 14.6 ("[rK]" is 25 wide) -- seen by the owner on the
 * live board (v0.4.23). The owner's ruling, 2026-11-15 (typed in the OPS seat): "lets just go back to the same design and
 * increase the width of the scoreboard a bit i think giving the space to the area that needs it and keeping the rest of
 * the design". So the original's order is kept -- tag, satchel, name: the satchel in its own `w`-wide slot after the widest
 * tag a player can type (`CLAN_TAG_WIDEST`), `gap` clear each side, at the original's height and bitmap; and the room it
 * needs is ADDED to the board, half to each side (`pingBarsPlace().grow`, (16 + 2 * 2 - 2) / 2 = 9: the slot and its gaps
 * less the tag-to-name gap it replaces, `PING_NAME_GAP_ADAPTATION`), the board staying centred on x 320 inside the 640
 * frame. Everything left of the slot (the left column, the panel's left edge, the stripes', the team titles, the bars, the
 * hovered number, the tag) moves `grow` left; everything right of it (the name, the four columns, the stripes' and the
 * panel's right edges) `grow` right. Nothing shrinks: the name's lane stays 141.6, the columns keep their pitch. Given up:
 * the board with rows is 18 wider than the original's (1..639 against 10..630) and its left column sits 9 further left.
 * The 9 / 9 split is the OPS seat's reading, shown to the owner as a sample -- his to change here. The single-SEAL board of
 * a round with no room stays the original's, untouched (`SCORE_LAYOUT`).
 */
export const SCOREBOARD_SATCHEL_SLOT_ADAPTATION = { w: 16, gap: 2 } as const;
/**
 * PING_HOVER_GAP_ADAPTATION (WM-DATA; the controller's ruling on the owner's "make the tooltip show left"): the hovered
 * number is right-aligned to end this far LEFT of the bars' left edge (159.4 for bars at 161.4). It may run past the
 * row's left edge, over the panel's border, while the pointer rests there; it never moves the bars, the tag or the name.
 */
export const PING_HOVER_GAP_ADAPTATION = 2;
/**
 * PING_HOVER_BACKING_ADAPTATION (WM-DATA, the same ruling): the hovered number's backing -- a small dark tag in the
 * panel's own style: the panel's bitmap `newweapnbkrnd.tif`, its centre texel (as the odd rows' stripes take it), at the
 * panel's alpha (100 / 128, `SCORE_LAYOUT.panel.alpha`), stacked over the panel and so darker than it; `pad` either side
 * of the number (its right edge meets the bars' left edge), from the baseline - `up` to + `down` -- the row stripe's
 * band, so it never reaches another row's bars. Drawn under the number.
 */
export const PING_HOVER_BACKING_ADAPTATION = { pad: 2, up: 12, down: 4, alpha: SCORE_LAYOUT.panel.alpha } as const;
/**
 * PING_OWN_ROW_ALWAYS_ADAPTATION (WM-DATA): whether the player's own row shows its number without a hover. The look's
 * first pick (1C) drew it on the own row only; the owner's later words replace it ("ping as three singnal bars (hover over
 * to see)"), so every row, the own included, shows its number on hover alone. The alternative is this one constant away.
 */
export const PING_OWN_ROW_ALWAYS_ADAPTATION: boolean = false;

/** WM-DATA: how many of the three bars a row lights, and their colour (0..128); none for a bot or no reading. */
export function pingBars(r: Pick<ScoreRowInfo, 'ping' | 'bot'>): { lit: 0 | 1 | 2 | 3; rgb: readonly [number, number, number] } {
  const T = PING_BAR_THRESHOLDS_ADAPTATION, B = PING_BARS_ADAPTATION;
  if (r.bot === true || !r.ping || r.ping <= 0) return { lit: 0, rgb: SCORE_LAYOUT.rowRgb };
  if (r.ping <= T.green) return { lit: 3, rgb: B.rgb.green };
  if (r.ping <= T.yellow) return { lit: 2, rgb: B.rgb.yellow };
  return { lit: 1, rgb: B.rgb.red };
}
/**
 * WM-DATA (capture 1F) and OPS-S1: the row's x places on the 640-wide board with the room's rows -- the one place they are
 * computed. `grow`: how far everything left of the satchel's slot moves left and everything right of it moves right
 * (`SCOREBOARD_SATCHEL_SLOT_ADAPTATION`; 9). The bars' span from the team heading's first glyph (`SCORE_LAYOUT.title`'s pen
 * moved `grow` left, the SEALs heading; the TERRORISTS one starts at the same x), the clan tag's pen, the satchel's slot
 * after the widest typeable tag, the name's pen after the slot, where the hovered number ends (right-aligned, left of the
 * bars). At 640x448: bars 161.4..172.4, tag 176.4, satchel 223.4..239.4, name 241.4, hover end 159.4.
 */
export function pingBarsPlace(): {
  x0: number; x1: number; tagX: number; nameX: number; hoverEnd: number; satchelX0: number; satchelX1: number; grow: number;
} {
  const B = PING_BARS_ADAPTATION, L = SCORE_LAYOUT, S = SCOREBOARD_SATCHEL_SLOT_ADAPTATION;
  const grow = (S.w + 2 * S.gap - PING_NAME_GAP_ADAPTATION) / 2;
  const x0 = layoutText(L.teams[0].name, L.title.x - grow, 0, L.title.scale).glyphs[0]!.x;
  const x1 = x0 + B.heights.length * (B.w + B.gap) - B.gap;
  const tagX = x1 + PING_TAG_GAP_ADAPTATION;
  const satchelX0 = tagX + textWidth(`[${CLAN_TAG_WIDEST}]`, L.rows.scale) + S.gap, satchelX1 = satchelX0 + S.w;
  const nameX = satchelX1 + S.gap;
  return { x0, x1, tagX, nameX, hoverEnd: x0 - PING_HOVER_GAP_ADAPTATION, satchelX0, satchelX1, grow };
}

/** A team's rows as the board lists them: sorted by score descending, ties in the given (join) order, cut to 8. */
function teamRows(rows: readonly ScoreRowInfo[], team: 'seal' | 'terrorist'): ScoreRowInfo[] {
  // Array.prototype.sort is stable: equal scores keep the given (join) order.
  return rows.filter((r) => r.team === team).sort((a, b) => b.score - a.score).slice(0, SCORE_LAYOUT.rows.max);
}

/**
 * WM-DATA (a BROWSER ADAPTATION, the hover of `PING_BARS_ADAPTATION`): the id of the row under the frame's pixel (x, y),
 * or null -- a row is its stripe's band (x 161..624 widened by `pingBarsPlace().grow` each side, 152..633 -- OPS-S1;
 * baseline - 12 .. + 4), placed as `scoreboardLayout` places it with the same `lift` and `scale`. Null on a board without
 * the room's rows.
 */
export function scoreboardRowAt(
  frame: { width: number; height: number }, info: Pick<ScoreboardInfo, 'rows'>, x: number, y: number, lift = 0, scale = 1,
): number | null {
  if (!info.rows) return null;
  const s = frame.height / 448, L = SCORE_LAYOUT;
  const bx = 320 + (x - frame.width / 2) / (scale * s);
  const by = SCORE_TOP + (y / s - (SCORE_TOP - lift)) / scale;
  const grow = pingBarsPlace().grow;
  if (bx < L.stripe.x0 - grow || bx > L.stripe.x1 + grow) return null;
  for (const [i, t] of L.teams.entries()) {
    const hit = teamRows(info.rows, i === 0 ? 'seal' : 'terrorist').find((_, k) => {
      const base = t.y + L.rows.dy + L.rows.pitch * k;
      return by >= base - L.stripe.up && by <= base + L.stripe.down;
    });
    if (hit) return hit.id;
  }
  return null;
}

/** A detail line cut to `width` at `scale` with a trailing "-", as `FUN_0022ac30` does. */
export function cutLine(text: string, scale: number, width: number): string {
  if (textWidth(text, scale) <= width) return text;
  let t = text;
  while (t.length > 0 && textWidth(`${t}-`, scale) > width) t = t.slice(0, -1);
  return `${t}-`;
}

type Rgba4 = [number, number, number, number];

/**
 * The scoreboard's quads (layer 1 of the HUD pass) on a frame: pure. `sizes` are the HUD's bitmaps; `white` the
 * untextured rects' bitmap. Centred on the frame, scaled by height / 448 like the HUD. `lift` raises all of it by that
 * many frame pixels: the Modern presentation's `MODERN_SCOREBOARD_LIFT`, 0 (the game's place) for the PS2 one.
 * `scale` shrinks all of it -- panel, bars, rows, strings, GAME DETAILS, SPECTATORS -- uniformly about its (lifted)
 * top-centre, (320, SCORE_TOP - lift): the Modern presentation's `modernScoreboardFit` (`./hud`), 1 for the PS2 one
 * (whose numbers then take exactly the unscaled path, bit for bit).
 */
export function scoreboardLayout(
  frame: { width: number; height: number }, info: ScoreboardInfo, sizes: Record<string, { width: number; height: number }>,
  lift = 0, scale = 1,
): { quads: HudQuad[]; tris: HudTri[] } {
  const s = frame.height / 448;
  const tris: HudTri[] = [];
  const top = SCORE_TOP - lift;
  const X = scale === 1 ? (x: number): number => frame.width / 2 + (x - 320) * s
    : (x: number): number => frame.width / 2 + (x - 320) * scale * s;
  const Y = scale === 1 ? (y: number): number => (y - lift) * s : (y: number): number => (top + (y - SCORE_TOP) * scale) * s;
  const quads: HudQuad[] = [];
  const L = SCORE_LAYOUT;
  // OPS-S1 (SCOREBOARD_SATCHEL_SLOT_ADAPTATION): a board with the room's rows is `grow` wider each side -- what is left of
  // the satchel's slot moves `dl`, what is right of it `dr`; the single-SEAL board keeps the original's places (0, 0).
  const place = pingBarsPlace();
  const dl = info.rows ? -place.grow : 0, dr = info.rows ? place.grow : 0;
  const panel = sizes['newweapnbkrnd.tif'];
  const rect = (texture: string, x0: number, y0: number, x1: number, y1: number, rgba: Rgba4,
    uv?: [number, number, number, number], element: HudQuad['element'] = 'scoreboard'): void => {
    const size = sizes[texture];
    if (!size || rgba[3] <= 0 || x1 <= x0 || y1 <= y0) return;
    const [u0, v0, u1, v1] = uv ?? [0, 0, size.width, size.height];
    quads.push({ element, texture, x: (X(x0) + X(x1)) / 2, y: (Y(y0) + Y(y1)) / 2, w: X(x1) - X(x0), h: Y(y1) - Y(y0),
      turn: 0, u0, v0, u1, v1, rgba, layer: 1 });
  };
  const text = (line: string, x: number, y: number, scale: number, rgba: Rgba4, align: 'left' | 'centre' | 'right' = 'left'): void => {
    if (!sizes[FONT_TEXT_01.texture] || !line.trim()) return;
    const pen = align === 'centre' ? x - textWidth(line, scale) / 2 : align === 'right' ? x - textWidth(line, scale) : x;
    const { glyphs } = layoutText(line, pen, y, scale);
    const [dx, dy] = FONT_TEXT_01.dropShadow.pixels;
    for (const pass of ['shadow', 'text'] as const) {
      const [ox, oy] = pass === 'shadow' ? [dx * scale, dy * scale] : [0, 0];
      const c: Rgba4 = pass === 'shadow' ? [0, 0, 0, rgba[3]] : rgba;
      for (const g of glyphs) {
        const x0 = g.x + ox, y0 = g.y + oy;
        const ink: Rgba4 = pass === 'text' && g.rgb ? [g.rgb[0] / 128, g.rgb[1] / 128, g.rgb[2] / 128, c[3]] : c;
        rect(FONT_TEXT_01.texture, x0, y0, x0 + g.w, y0 + g.h, ink, [g.u0, g.v0, g.u1, g.v1]);
      }
    }
  };
  const c255 = (rgb: readonly number[], a: number): Rgba4 => [rgb[0]! / 255, rgb[1]! / 255, rgb[2]! / 255, a];
  const c128 = (rgb: readonly number[], a: number): Rgba4 => [rgb[0]! / 128, rgb[1]! / 128, rgb[2]! / 128, a];

  // The team headers' bars: untextured, under the nine-slice (the draw order's first) -- the layer's shapes.
  for (const t of L.teams) {
    const [x0, y0, x1, y1] = [X(L.panel.x0 + dl), Y(t.y), X(L.panel.x1 + dr), Y(t.y + L.header.h)];
    const rgba = c255(t.header, L.header.alpha);
    tris.push({ layer: 1, p: [x0, y0, x1, y0, x1, y1], rgba }, { layer: 1, p: [x0, y0, x1, y1, x0, y1], rgba });
  }

  // The nine-slice: 20-pixel corners, the left column mirrored (its stripe on both sides).
  if (panel) {
    const P = L.panel, c = P.corner, W = panel.width, H = panel.height, px0 = P.x0 + dl, px1 = P.x1 + dr;
    const fu = L.cornerUv.u * W, fv = L.cornerUv.v * H;
    const xs: [number, number, number, number][] = [
      [px0, px0 + c, W, W - fu], [px0 + c, px1 - c, fu, W - fu], [px1 - c, px1, W - fu, W],
    ];
    const ys: [number, number, number, number][] = [
      [P.y0, P.y0 + c, 0, fv], [P.y0 + c, P.y1 - c, fv, H - fv], [P.y1 - c, P.y1, H - fv, H],
    ];
    for (const [x0, x1, u0, u1] of xs) for (const [y0, y1, v0, v1] of ys) rect('newweapnbkrnd.tif', x0, y0, x1, y1, [1, 1, 1, P.alpha], [u0, v0, u1, v1]);
  }

  // The left column: GAME DETAILS and SPECTATORS, each a green header strip over its body.
  const C = L.left, white: Rgba4 = [1, 1, 1, L.panel.alpha];
  for (const part of [C.details, C.spectators]) {
    rect('newweapnbkrnd.tif', C.x0 + dl, part.y0 + 25, C.x1 + dl, part.y1, white);
    rect('newweapnbkrnd.tif', C.x0 + dl, part.y0, C.x1 + dl, part.y0 + 25, c128(C.headerRgb, C.headerAlpha));
  }
  text(C.details.title, C.details.titleAt[0] + dl, C.details.titleAt[1], 1, [1, 1, 1, L.title.alpha]);

  // The odd rows' stripes.
  if (panel) {
    const mid: [number, number, number, number] = [panel.width / 2, panel.height / 2, panel.width / 2 + 0.01, panel.height / 2 + 0.01];
    for (const t of L.teams) {
      for (let i = 1; i < L.rows.max; i += 2) {
        const base = t.y + L.rows.dy + L.rows.pitch * i;
        rect('newweapnbkrnd.tif', L.stripe.x0 + dl, base - L.stripe.up, L.stripe.x1 + dr, base + L.stripe.down, [1, 1, 1, L.stripe.alpha], mid);
      }
    }
  }

  // The teams' strings: the header lines, the columns, the rows (the one SEAL).
  const rowRgba = c128(L.rowRgb, L.rowAlpha);
  const wins = info.rows ? [info.wins?.seal ?? 0, info.wins?.terrorist ?? 0] : [0, 0];
  // BOMB-MARKS: the carrier's row's baseline, if his row is drawn, for the satchel drawn last (every viewer: OT.R109 amended).
  let satchelBase: number | null = null;
  const nameWidth = rowNameWidth();
  const damage = info.damage;
  L.teams.forEach((t, i) => {
    // WM-13 (a browser adaptation, `./damagePanel`; look 2F): the panel's titles, headers and rows in the board's place --
    // the title with the board's (OPS-S1: `dl` on a board with rows), the panel's own cells at their own x, unmoved.
    if (damage) {
      text(damage.titles[i]!, L.title.x + dl, t.y + L.title.dy, L.title.scale, [1, 1, 1, L.title.alpha]);
      for (const col of damage.headers) text(col.text, col.x, t.y + L.title.dy, L.title.scale, [1, 1, 1, L.title.alpha], 'centre');
      damage.rows[i]!.slice(0, L.rows.max).forEach((row, k) => {
        const base = t.y + L.rows.dy + L.rows.pitch * k;
        for (const m of row.meters) {
          const y0 = base - m.up, y1 = y0 + m.h;
          rect(PING_BAR_TEXTURE, m.x0, y0, m.x1, y1, [...m.track], [0, 0, 1, 1]);
          rect(PING_BAR_TEXTURE, m.x0, y0, m.x0 + (m.x1 - m.x0) * Math.max(0, Math.min(1, m.share)), y1, [...m.rgba], [0, 0, 1, 1]);
        }
        for (const c of row.cells) text(c.text, c.x, base, L.rows.scale, [...c.rgba], c.align);
      });
      return;
    }
    text(`${t.name} :   ${wins[i]}`, L.title.x + dl, t.y + L.title.dy, L.title.scale, [1, 1, 1, L.title.alpha]);
    // WM-DATA (a browser adaptation, `SCORE_COLUMNS_ADAPTATION`): a board with the room's rows takes order A's four
    // headers (OPS-S1: `dr` right of their slots); the single-SEAL board keeps the original's three.
    const heads = info.rows ? SCORE_COLUMNS_ADAPTATION : L.columns;
    for (const col of heads) text(col.text, col.x + dr, t.y + L.title.dy, L.title.scale, [1, 1, 1, L.title.alpha], 'centre');
    if (info.rows) {
      const mine = teamRows(info.rows, i === 0 ? 'seal' : 'terrorist');
      mine.forEach((r, k) => {
        const base = t.y + L.rows.dy + L.rows.pitch * k;
        const f = r.alive ? 1 : DEAD_DIM;
        const [cr, cg, cb, ca] = r.self ? c128(L.localRgb, L.rowAlpha) : rowRgba;
        const rgba: Rgba4 = [cr * f, cg * f, cb * f, ca * f];
        // WM-DATA (capture 1F): the name at its pen after the widest tag, cut before the KILLS column (`rowNameWidth`).
        // STREAMER-P1 (a browser adaptation): the own row reads YOU while details are Hidden (`ownNameShown`), its tag dropped.
        const bare = r.self && detailsHidden();
        text(bare ? ownNameShown(r.name) : botDisplayName(cutLine(plainBotText(r.name), L.rows.scale, nameWidth), r.bot === true), place.nameX, base, L.rows.scale, rgba);
        // The clan: "[" tag "]" (S:0x3e57a0, S:0x3e57a8) over the seed's space, uncut (CLAN_TAG_OVERRUN_READING past 13
        // characters), in (128, 64, 32) for every row --
        // the local player's blue is the name's alone (D:L79020) -- and dimmed with it (D:L79024; D:L79042-79058).
        // WM-DATA (PING_TAG_GAP_ADAPTATION): its pen after the bars, not the original's 163. LATER 1030 (c): the tag is the
        // room's byte string, decoded once by the engine's decoder (`FONT_TEXT_01.tagText`) as every HUD site's; the name not.
        const [kr, kg, kb, ka] = c128(L.clanRgb, L.rowAlpha);
        text(r.clan && !bare ? `[${plainBotText(FONT_TEXT_01.tagText(r.clan))}]` : NO_CLAN, place.tagX, base, L.rows.scale, [kr * f, kg * f, kb * f, ka * f]);
        // WM-DATA: order A's four figures in the row's colour; assists not carried draw `ASSISTS_NONE`.
        for (const col of SCORE_COLUMNS_ADAPTATION) text(scoreCell(r, col.key), col.x + dr, base, L.rows.scale, rgba, 'centre');
        // WM-DATA (PING_BARS_ADAPTATION): the three bars at the row's far left, lit by its ping, dimmed with a dead row.
        const B = PING_BARS_ADAPTATION, bars = pingBars(r);
        const [lr, lg, lb] = c128(bars.rgb, 1), [ur, ug, ub] = c128(L.rowRgb, 1);
        B.heights.forEach((h, b) => {
          const x0 = place.x0 + b * (B.w + B.gap);
          const ink: Rgba4 = b < bars.lit ? [lr * f, lg * f, lb * f, L.rowAlpha * f] : [ur * f, ug * f, ub * f, L.rowAlpha * B.dim * f];
          rect(PING_BAR_TEXTURE, x0, base - h, x0 + B.w, base, ink, [0, 0, 1, 1]);
        });
        // WM-DATA: the number while the row is hovered (or the own row, PING_OWN_ROW_ALWAYS_ADAPTATION), after the bars and
        // over the tag; none for a bot or a seat with no reading.
        const shown = info.hoverRow === r.id || (PING_OWN_ROW_ALWAYS_ADAPTATION && r.self);
        if (shown && pingCell(r) !== PING_NONE) {
          // PING_HOVER_GAP_ADAPTATION / PING_HOVER_BACKING_ADAPTATION: right-aligned to end left of the bars, on its backing.
          const n = pingCell(r), H = PING_HOVER_BACKING_ADAPTATION, pen = place.hoverEnd - textWidth(n, L.rows.scale);
          if (panel) {
            const cu = panel.width / 2, cv = panel.height / 2;
            rect('newweapnbkrnd.tif', pen - H.pad, base - H.up, place.hoverEnd + H.pad, base + H.down, [1, 1, 1, H.alpha], [cu, cv, cu + 0.01, cv + 0.01]);
          }
          text(n, pen, base, L.rows.scale, rgba);
        }
        if (info.bombCarrier != null && r.id === info.bombCarrier) satchelBase = base;
      });
      return;
    }
    if (i !== 0) return;
    const base = t.y + L.rows.dy;
    text(ownNameShown(info.player), L.rows.nameX, base, L.rows.scale, c128(L.localRgb, L.rowAlpha));   // STREAMER-P1: YOU while Hidden
    for (const col of L.columns) text('0', col.x, base, L.rows.scale, c128(L.localRgb, L.rowAlpha), 'centre');
  });

  // The detail lines, then the spectators' header.
  const details = shownDetailLines(info.details ? gameDetailLines(info.details, info.type) : [LAN_GAME_LINE, info.game, info.type]);   // STREAMER-P1
  details.forEach((d, i) => text(cutLine(d, C.lines.scale, C.lines.width), C.lines.x + dl, C.lines.ys[i]!, C.lines.scale, rowRgba));
  text(C.spectators.title, C.spectators.titleAt[0] + dl, C.spectators.titleAt[1], 1, [1, 1, 1, L.title.alpha]);
  // In the order given (SPECTATOR_ORDER_READING), in SPECTATOR_RGB_READING at the details' alpha 110.
  const spectatorRgba = c128(SPECTATOR_RGB_READING, L.rowAlpha);
  (info.spectators ?? []).slice(0, SPECTATOR_LINES.max).forEach((n, i) =>
    text(cutLine(n, C.lines.scale, C.lines.width), SPECTATOR_LINES.x + dl, SPECTATOR_LINES.y0 + SPECTATOR_LINES.pitch * i, C.lines.scale, spectatorRgba));
  // WM-13 (DAMAGE_HINT_ADAPTATION): the hint above the panel, in the board's place and scale (the Modern lift and fit with it).
  if (info.damageHint && info.damageHint.trim() && sizes[FONT_TEXT_01.texture]) {
    const H = DAMAGE_HINT_ADAPTATION, box = damageHintBox(info.damageHint);
    const { glyphs } = layoutText(info.damageHint, box.pen, box.baseline, H.scale, { special: true });
    const [dx, dy] = FONT_TEXT_01.dropShadow.pixels, a = H.alpha / 128;
    for (const pass of ['shadow', 'text'] as const) {
      for (const g of glyphs) {
        if (pass === 'shadow' && g.texture) continue;
        const [ox, oy] = pass === 'shadow' ? [dx * H.scale, dy * H.scale] : [0, 0];
        const ink: Rgba4 = pass === 'shadow' ? [0, 0, 0, a] : g.rgb ? [g.rgb[0] / 128, g.rgb[1] / 128, g.rgb[2] / 128, a] : [H.rgb[0] / 128, H.rgb[1] / 128, H.rgb[2] / 128, a];
        rect(g.texture ?? FONT_TEXT_01.texture, g.x + ox, g.y + oy, g.x + ox + g.w, g.y + oy + g.h, ink, [g.u0, g.v0, g.u1, g.v1]);
      }
    }
  }
  // BOMB-MARKS: the satchel on the carrier's row, last (D:L79156), the whole bitmap at its own colour. A carrier's row is
  // drawn only on a board with the room's rows, so its x is the slot's (OPS-S1, `SCOREBOARD_SATCHEL_SLOT_ADAPTATION`),
  // not the original's 200..216 the bars' tag lane now covers; the height is the original's.
  if (satchelBase !== null) {
    const S = SCOREBOARD_SATCHEL_RECT;
    rect('hud_satchel.tif', place.satchelX0, satchelBase - S.up, place.satchelX1, satchelBase + S.down, [...SCOREBOARD_SATCHEL_RGBA_READING]);
  }
  return { quads, tris };
}
