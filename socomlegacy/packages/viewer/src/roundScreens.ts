import { FONT_TEXT_01, layoutText, textWidth } from './hudFont';
import type { HudQuad, HudTri } from './hud';
import type { ScoreRowInfo } from './scoreboard';
import type { MatchStats } from './net/protocol';
import type { HudBitmaps } from './hudAssets';
import type { Rgba } from '@s2u/gs';

/**
 * The round's end screens, drawn in the HUD's own pass with its font (PF.R19): ROUND COMPLETE (`dlgMultiplayerRound.rdr`),
 * FINAL ROUND (`dlgMultiplayerFinal.rdr`: the last round's lists before the totals) and GAME COMPLETE
 * (`dlgMultiplayerFinalReally.rdr`). PF-26 (web sprint 26; socomlegacy/docs/research/216-the-round-screens-from-readerx.md)
 * transcribes SOCOM II's own layouts from `RUN/UI/READERX.ZAR` -- the member the game mounts at the round's end
 * (`FUN_00223970` 0x223f00, D:L76089) -- as research 179 s10 reads them (`scratch/C1/D/compact_READERX_<dialog>.rdr.out`):
 * every position, scale, colour, opacity and timing below is a reading of that source (pending review, AGENTS.md),
 * cited by its object's NAME. The strings are `UIMPXLOC`'s (research 91 s18 s2.3) or the dialog's own literals.
 *
 * The whole transcription lives here, so the front-end track's dialog runtime (`@s2u/ui`) can replace it later without
 * touching the room or the page (`roundScreens.ts` then shrinks to a UI-var feed: research 179 s10 s10). Pure: no
 * three, no DOM, no `@s2u/ui` (the HUD pass does not import it; the counter's law is transcribed, `counterShown`).
 *
 * Coordinates are the dialog's 640x448 frame. A TEXT's `YPOS` is taken as its baseline, as every HUD string's (research
 * 87 s3), and a LISTBOX row `k`'s as `YPOS + SPACING x k`; an IMAGE's `XPOS`/`YPOS` is its top-left corner; CHILDOF adds
 * the parent's place. COLOR is on the dialog engine's 0..128 scale: (128,128,128) white, the loader's default
 * (`packages/ui/src/dialog.ts` `DEFAULT_COLOR`); "gold" is (91,72,36).
 */

/** Which of the three screens. */
export type RoundScreenKind = 'roundComplete' | 'finalRound' | 'gameComplete';

/**
 * GAME COMPLETE's YOUR STATS, the nine values `FUN_00225a00` (D:L76886-76933) prints for the local player, in order:
 * total score +0x580, kills +0x550, deaths +0x556, the hit percentage (`hitPct`), headshots +0x544, primary objectives
 * +0x576, bonus objectives +0x578, team kills +0x55a, suicides +0x558 (research 179 s10 s6).
 */
export interface YourStats {
  score: number; kills: number; deaths: number; hitPct: number; headshots: number; primaryObjs: number; bonusObjs: number;
  friendlyKills: number; suicides: number;
}

/** What a round screen shows. */
export type RoundScreen = {
  kind: RoundScreenKind;
  /** Seconds to the screen's end: ROUND COMPLETE's 5 s, FINAL ROUND's 10 s; the countdown is derived from it. */
  secondsLeft: number;
  /** Seconds since this screen opened: the lists' reveal (`ROW_REVEAL`), the counters (`ROUND_COUNTERS`), the timeout. */
  elapsed: number;
  /** The round's winner (`mp_winner` 0 / 8), null for a draw (99, or `mission_timeout`). Unused on GAME COMPLETE. */
  winner: 'seal' | 'terrorist' | null;
  /** Rounds won (`mp_score00` / `mp_score08`): GAME COMPLETE's WINNER and its round counters. */
  wins: { seal: number; terrorist: number };
  /** Every player's row: the round lists; on GAME COMPLETE the totals and the MVP. A `clan` is drawn `"[%s]"`. */
  rows: (ScoreRowInfo & { clan?: string })[];
  /** The MVP's name: absent is `pickMvp`'s; null is none. */
  mvp?: string | null;
  /** YOUR STATS: absent is the `self` row's three numbers and zeros (`yourStatsOf`); null is none. */
  you?: YourStats | null;
  /** TIME PLAYED, seconds. */
  timePlayed?: number;
};

type Rgba4 = [number, number, number, number];
type Row = RoundScreen['rows'][number];

/** What a string is, for the tests and the page's inspection. */
export type RoundTextRole =
  | 'title' | 'next' | 'countdown' | 'team' | 'result' | 'header' | 'row' | 'totalsLabel' | 'totals' | 'mvpLabel' | 'mvp'
  | 'yourStatsLabel' | 'yourStats' | 'rounds' | 'counter' | 'time' | 'lobby';

/** One string of a screen, in the 640x448 frame's pixels: pen x (or the x it is right-aligned to / centred on), baseline. */
export interface RoundText {
  text: string; x: number; y: number; scale: number; align: 'left' | 'right' | 'centre'; rgba: Rgba4; role: RoundTextRole;
}

/** A `backsolid.tif` IMAGE of a screen (an opacity on the dialog's panel), by its dialog NAME; top-left, size. */
export interface RoundPanel { name: string; x: number; y: number; w: number; h: number; alpha: number }

/** The strings: `UIMPXLOC` (research 91 s18 s2.3; the dialogs' `_NNNN_` captions) and the dialogs' literals (179 s10 s7). */
export const ROUND_STRINGS = {
  roundComplete: 'ROUND COMPLETE',        // 2133
  nextRound: 'NEXT ROUND',                // 2132
  finalRound: 'FINAL ROUND',              // 2103
  finalTotals: 'FINAL TOTALS',            // 2102
  gameComplete: 'GAME COMPLETE',          // 2105
  winner: 'WINNER', loser: 'LOSER', draw: 'DRAW',  // 2110 / 2109 / 2104
  go: 'GO',                               // 2111
  seals: 'SEALS', terrorists: 'TERRORISTS',        // 2101 / 2100
  score: 'SCORE', kills: 'KILLS', deaths: 'DEATHS', // 2106 / 2107 / 2108
  sealTotals: 'SEAL TOTALS', terroristTotals: 'TERRORIST TOTALS', mvp: 'MVP', yourStats: 'YOUR STATS', // 2112-2115
  hitPct: 'HIT %', headShots: 'HEAD SHOTS', primaryObjs: 'PRIMARY OBJECTIVES', bonusObjs: 'BONUS OBJECTIVES', // 2116-2119
  friendlyKills: 'FRIENDLY KILLS', suicides: 'SUICIDES', timePlayed: 'TIME PLAYED', // 2120 / 2121 / 2124
  sealRounds: 'SEAL ROUNDS', terroristRounds: 'TERRORIST ROUNDS', won: 'WON', lost: 'LOST', // the dialog's literals (RWS ..)
  lobby: 'RETURNING TO GAME LOBBY. . .',  // 2128, `RTGL` (`ReturnFlash`)
} as const;

/**
 * The lists' three numeric columns, left to right: SCORE, KILLS, DEATHS -- the column table 0x3e51c0 its static
 * initialiser `FUN_003fe860` (0x3fe8b8-0x3fe924) fills from .data 0x3dc750/60/70, whose getters 0x226010 / 0x226000 /
 * 0x225ff0 read `lh +0x3c`, `lhu +0xc`, `lhu +0x12` of the round block (+0x5c8 / +0x598 / +0x59e) or the totals block
 * (+0x580 / +0x550 / +0x556); `FUN_00224210` prints them at 0x2245a8-0x2245dc (research 179 s10 s2, s13.7 V1 #8).
 */
export const ROUND_LIST_COLUMNS = ['score', 'kills', 'deaths'] as const;

/** `backsolid.tif` (16x16, every texel CLUT `texpal_3` index 0 = PSMCT16 0xad20): RGB (0,72,88) (179 s10 s3). */
export const BACKSOLID_RGB = [0, 72, 88] as const;
/** The two bitmaps the screens draw beyond the font: the dialogs' BACKGROUND and their panels' IMAGE (179 s10 s3). */
export const ROUND_SCREEN_BITMAPS = { background: 'multplay_back.tif', panel: 'backsolid.tif' } as const;
/**
 * PF.R22: the two out of the ARMORY's decoded bitmaps (`./armoryData`, by lower-case name, top row first, UIMP's copies --
 * byte-identical to `RUN/COMMON/SPMP_TXR.ZED`'s, 179 s10 s3), for `Hud.addBitmaps`; a name not there is left out (the
 * screens then draw their colour-exact shapes).
 */
export function roundScreenBitmaps(bitmaps: readonly (readonly [string, Rgba])[]): HudBitmaps {
  const out: HudBitmaps = {};
  for (const name of Object.values(ROUND_SCREEN_BITMAPS)) {
    const hit = bitmaps.find(([n]) => n === name.toLowerCase());
    if (hit) out[name] = hit[1];
  }
  return out;
}

/** What the hand-off reads of a page's ARMORY read (`./armoryData` `ArmoryData`): its bitmaps by lower-case name. */
export interface ArmoryBitmaps { readonly bitmaps: readonly (readonly [string, Rgba])[] }

/**
 * PAR-3 (web sprint PARITY-1, audit A.3; web research 255 s3): PF.R22's hand-off, one for both pages -- the round
 * screens' two bitmaps out of the page's ARMORY read (`./armoryData`'s decode) into its HUD (`Hud.addBitmaps`).
 * `/testroom`'s read is its worker's `armory` answer (`./main` `armoryData`: this is its line); the front end's is the
 * lobby's (`frontEnd.ts`'s `armory.load`, kept by `keepMissionRead` so the match takes the same decode). No read (it
 * would not come) hands nothing, and a read without them hands an empty set: the screens keep their colour-exact shapes.
 * Returns the names handed.
 */
export function handRoundScreenBitmaps(hud: { addBitmaps(extra: HudBitmaps): void }, data: ArmoryBitmaps | null): string[] {
  if (!data) return [];
  const got = roundScreenBitmaps(data.bitmaps);
  hud.addBitmaps(got);
  return Object.keys(got);
}

/**
 * One mission's read kept (the last asked, by its archive's name), so two callers share one decode (PAR-3): the lobby's
 * ARMORY read (`./lobbyArmory` `want`, in the game lobby) and the match's round screens, which take their bitmaps from it.
 */
export function keepMissionRead<T>(read: (mission: string) => Promise<T>): (mission: string) => Promise<T> {
  let kept: { mission: string; got: Promise<T> } | null = null;
  return (mission) => {
    const key = mission.toUpperCase();
    if (kept?.mission === key) return kept.got;
    const got = read(mission);
    kept = { mission: key, got };
    return got;
  };
}

/** The lists' LISTBOX `SEQUENCE_DELAY 0.15`, `SEQUENCE_INTERVAL 0.1` (ROUND COMPLETE and FINAL ROUND; 179 s10 s11). */
export const ROW_REVEAL = { delay: 0.15, interval: 0.1 } as const;
/**
 * GAME COMPLETE's COUNTERs, two absolute StartTime/EndTime pairs (EndTime, not Duration): `RoundsWonSeals` and
 * `RoundsLostSeals` 3.5-4.0 s, `RoundsWonTerrs` and `RoundsLostTerrs` 4.0-4.5 s (179 s10 s7).
 */
export const ROUND_COUNTERS = { seal: { start: 3.5, end: 4.0 }, terrorist: { start: 4.0, end: 4.5 } } as const;
/** `TimeoutMonitor` on all three screens: WAIT 90.0, then `GameStatePopCommand dlgNetError.rdr` (179 s10 s11). */
export const ROUND_SCREEN_TIMEOUT_S = 90;

/**
 * FINAL_TITLE_READING (PF.R24): `dlgMultiplayerFinal.rdr` holds two objects named `TitleBar` -- the FINAL ROUND caption
 * at (75,50) 1.75 and a `font_titlebar_01` GAME COMPLETE at (15,45) 0.95 -- and no script names either (179 s10 s1;
 * the loader keeps both, research 203 s12). The port draws the first only; owed: a FINAL ROUND capture (206 s4.4).
 */
export const FINAL_TITLE_READING = 'the (75,50) FINAL ROUND title only' as const;
/** YOUR_STATS_ALIGN_READING: `YourTotals` has no COLUMNS -- its values at the LISTBOX's pen, left-justified at x 250. */
export const YOUR_STATS_ALIGN_READING = 'left at the LISTBOX pen' as const;
/**
 * NAME_ORDER_READING: the sort's and the MVP's `strcmp` (`FUN_00198f18`) on the original's byte names is matched by a
 * code-unit comparison on the port's names: printable ASCII and an accented page (research 91 s13), whose code units
 * are their Latin-1 bytes; `strcmp`'s signedness on bytes over 0x7f was not read.
 */
export const NAME_ORDER_READING = 'code-unit order' as const;
/**
 * ROUND_NAME_CUT_READING (NU-10; research 216 s7): a row's string -- a long name, a wide number -- is drawn whole at the
 * list's SCALE, over the next column if it is wider than the gap, and cut only where the frame ends. The list's own
 * scissor is x 0..`DAT_004a44c4`, the frame's 640 (`FUN_00373850` D:L270012; `FUN_003b1200` D:L305276-305277 sets it),
 * and the UI's scissor after it the whole 640x448 frame (`FUN_003b0fa0(0,0,0x280,0x1c0)`, D:L270042). The round lists'
 * COLUMNS carry no MAXWIDTH, so the loader's 1000 (D:L276178-276183; `YourTotals`' default column 0, D:L276086-276109,
 * its values drawn all the same); what reads a text column's +8 was not traced. Settles with a frame of a long name.
 */
export const ROUND_NAME_CUT_READING = 'cut only at the frame' as const;

/**
 * ROUND_SCREEN_FRAME_FIT (NU-10, the owner's NU.R4: "The round-end screen does not resize it's width to the screen's
 * max width when cut off, it should"): the dialog's 640x448 frame fitted whole into the page's frame -- scaled by the
 * smaller of width / 640 and height / 448, centred both ways -- as the front end's menus are (`./frontEnd`, the
 * canvas's `object-fit: contain`) and the ARMORY is (`./armoryView` `armoryFrame`, ARMORY_FRAME_FIT; a test pins the
 * two equal). The original's frame was the screen (`FUN_003b1200` D:L305276-305277), so nothing of these dialogs fell
 * off it; scaled by height / 448 alone (the in-round HUD's rule, which stays the HUD's), a window narrower than 640:448
 * cut their sides. A browser adaptation: no value of the game's changes, only where the page puts its frame.
 */
export function roundScreenFrame(width: number, height: number): { s: number; x0: number; y0: number } {
  const s = Math.max(0, Math.min(width / 640, height / 448));
  return { s, x0: (width - 640 * s) / 2, y0: (height - 448 * s) / 2 };
}

const GOLD = [91, 72, 36] as const, WHITE = [128, 128, 128] as const;
const c128 = (rgb: readonly number[], a = 1): Rgba4 => [rgb[0]! / 128, rgb[1]! / 128, rgb[2]! / 128, a];
/** The colours: the dialogs' white and gold, and the backdrop under the 640x448 frame (a runtime fallback, PF.R22). */
export const ROUND_COLOURS = {
  white: c128(WHITE),
  gold: c128(GOLD),
  /** Under everything, opaque: the screen replaces the game (91 s18 s2.4); seen where `multplay_back.tif` is absent. */
  backdrop: [0, 0, 0, 1] as Rgba4,
};

/** A list: LISTBOX place and its COLUMNS (name -290, clan -345, the numbers RIGHT_JUSTIFIED), SPACING 20, SCALE 0.9. */
interface ListSpec { x: number; y: number; columns: readonly [number, number, number] }
const list = (x: number, y: number, columns: readonly [number, number, number]): ListSpec => ({ x, y, columns });

/** Each of a side's 8 row strips and the 100x17 strips under the number columns (`Team_back_Seal1..8` ..; 179 s10 s5). */
function roundPanels(): RoundPanel[] {
  const out: RoundPanel[] = [];
  const children = (name: string, px: number, py: number, w: number, first: number, alpha: (k: number) => number): void => {
    for (let k = 0; k < 8; k++) out.push({ name: `${name}${k + 1}`, x: px, y: py + first + 20 * k, w, h: 17, alpha: alpha(k) });
  };
  out.push({ name: 'Team_back', x: 5, y: 10, w: 300, h: 230, alpha: 0.4 });
  children('Team_back_Seal', 5, 10, 300, 70, () => 0.8);
  out.push({ name: 'Team_back_Terr', x: 5, y: 240, w: 300, h: 200, alpha: 0.4 });
  children('Team_back_Terr', 5, 240, 300, 40, () => 0.8);
  // The column backings, seal side then terrorist side; `Kills_back_Seals`' first four strips carry no OPACITY (the
  // loader's default 1, `packages/ui/src/dialog.ts` L573).
  for (const [side, y] of [['Seals', 60], ['Terrs', 260]] as const) {
    for (const [col, x] of [['Score', 315], ['Kills', 420], ['Deaths', 525]] as const) {
      out.push({ name: `${col}_back_${side}`, x, y, w: 100, h: 180, alpha: 0.3 });
      children(`${col}_back_${side.slice(0, -1)}`, x, y, 100, 20, (k) => (col === 'Kills' && side === 'Seals' && k < 4 ? 1 : 0.9));
    }
  }
  return out;
}

/** GAME COMPLETE's panels in the dialog's order (`dlgMultiplayerFinalReally.rdr` CONTROLS; 179 s10 s3-s7). */
function finalPanels(): RoundPanel[] {
  const out: RoundPanel[] = [{ name: 'Team_back', x: 5, y: 20, w: 300, h: 150, alpha: 0.4 }];
  const rows = (name: string, x: number, w: number): void => {
    out.push({ name: `${name}_Seal`, x, y: 70, w, h: 20, alpha: 0.8 }, { name: `${name}_Terr`, x, y: 95, w, h: 20, alpha: 0.8 },
      { name: `${name}_MVP`, x, y: 140, w, h: 20, alpha: 1 });
  };
  rows('Team_back', 5, 300);
  for (const [col, x] of [['Score', 315], ['Kills', 420], ['Deaths', 525]] as const) {
    out.push({ name: `${col}_back`, x, y: 20, w: 100, h: 150, alpha: 0.3 }, { name: `${col}_Head_Top`, x, y: 20, w: 100, h: 40, alpha: 0.75 });
    rows(`${col}_back`, x, 100);
  }
  out.push({ name: 'Stat_back', x: 5, y: 180, w: 300, h: 233, alpha: 0.4 }, { name: 'YourStatBack', x: 5, y: 180, w: 300, h: 23, alpha: 0.7 });
  for (let k = 0; k < 9; k++) out.push({ name: `YourStatsRow${k + 1}`, x: 5, y: 208 + 23 * k, w: 300, h: 20, alpha: 0.6 });
  out.push({ name: 'RoundsTime_back', x: 315, y: 180, w: 310, h: 233, alpha: 0.4 });
  for (const dy of [0, 70]) {
    out.push({ name: 'YRWSBack', x: 315, y: 180 + dy, w: 310, h: 55, alpha: 0.7 }, { name: 'YRWSBack', x: 315, y: 180 + dy, w: 310, h: 36, alpha: 0.9 });
  }
  out.push({ name: 'TimeBack', x: 315, y: 330, w: 310, h: 60, alpha: 0.8 });
  return out;
}

/** The three layouts, from READERX (research 179 s10; each value a reading of the dialog named beside it). */
export const READERX_LAYOUT = {
  /** `dlgMultiplayerRound.rdr`. */
  roundComplete: {
    /** `TitleBar` (45,50) 1.75 gold (OBJECTS). */
    title: { x: 45, y: 50, scale: 1.75 },
    /** `NextMission` (380,50) 1.0; `CountDown` CHILDOF it +130, 1.2. */
    next: { x: 380, y: 50, scale: 1, text: ROUND_STRINGS.nextRound },
    countdown: { dx: 130, scale: 1.2 },
    /** `SealText` (20,70) / `CharText` (20,270) 1.0; `DrawRoundS` (200,70) / `DrawRoundT` (200,273) 1.0 gold. */
    teams: [
      { team: 'seal', caption: [20, 70], result: [200, 70], headerY: 75, list: list(365, 94, [8, 110, 217]) },
      { team: 'terrorist', caption: [20, 270], result: [200, 273], headerY: 277, list: list(365, 296, [8, 110, 217]) },
    ],
    resultScale: 1,
    panels: roundPanels(),
  },
  /** `dlgMultiplayerFinal.rdr`. */
  finalRound: {
    /** `TitleBar` (75,50) 1.75 gold (CONTROLS; FINAL_TITLE_READING). */
    title: { x: 75, y: 50, scale: 1.75 },
    next: { x: 380, y: 50, scale: 1, text: ROUND_STRINGS.finalTotals },
    countdown: { dx: 130, scale: 1.2 },
    /** Results 0.9, `DrawRoundT` (200,270); `RoundStatsSealsList` at (355,94) with 18/120/227, the terrorists' (355,296) 8/110/217. */
    teams: [
      { team: 'seal', caption: [20, 70], result: [200, 70], headerY: 75, list: list(355, 94, [18, 120, 227]) },
      { team: 'terrorist', caption: [20, 270], result: [200, 270], headerY: 277, list: list(355, 296, [8, 110, 217]) },
    ],
    resultScale: 0.9,
    panels: roundPanels(),
  },
  /** The lists and headers both round screens share (179 s10 s2, s5, s10). */
  lists: {
    /** Headers HCENTERED at 368 / 470 / 578, 0.9 (`Score_Text`, the misnamed KILLS `Score_Text`, `Deaths_Text`). */
    headers: [368, 470, 578], headerScale: 0.9, captionScale: 1,
    /** COLUMNS: the name at -290, the clan `"[%s]"` (0x3e53b8) at -345; SPACING 20, SCALE 0.9; 8 strips a side. */
    name: -290, clan: -345, spacing: 20, scale: 0.9, max: 8,
  },
  /** `dlgMultiplayerFinalReally.rdr`. */
  gameComplete: {
    title: { x: 55, y: 60, scale: 1.75 },
    /** `Score_Text` / `KillsText` / `DeathsText` HCENTERED at 368 / 475 / 578, y 55, 0.9, gold. */
    headers: { x: [368, 475, 578], y: 55, scale: 0.9 },
    /** `SealText` (20,85) / `TerrText` (20,110) 0.9; `DrawRoundS` / `DrawRoundT` CHILDOF +220, 0.9 gold. */
    totals: [
      { team: 'seal', caption: ROUND_STRINGS.sealTotals, at: [20, 85], resultDx: 220 },
      { team: 'terrorist', caption: ROUND_STRINGS.terroristTotals, at: [20, 110], resultDx: 220 },
    ],
    labelScale: 0.9,
    /** `SealsTotals` (350,85), `TerrsTotals` (350,110), `MvpTotals` (350,155): COLUMNS 25 / 125 / 230 right-justified, 0.9. */
    lists: { x: 350, columns: [25, 125, 230], scale: 0.9, mvpY: 155 },
    /** `MVPText1` (20,135) 1.0 gold; `MVPText` CHILDOF +20, 0.9 (UIVAR `MvpName`, `"[%s] %s"` / `"%s"`, 0x3e5438 / 0x3e5440). */
    mvp: { caption: [20, 135], captionScale: 1, nameDy: 20, nameScale: 0.9 },
    /**
     * YOUR STATS: `YourStats` (20,198) 1.0 gold; the labels (20, 224 + 23k) 0.9 (SCORE, KILLS, DEATHS COLOR white, the
     * rest the default white); `YourTotals` LISTBOX (250,225) SPACING 23 SCALE 0.9, no COLUMNS (YOUR_STATS_ALIGN_READING).
     */
    yourStats: { caption: [20, 198], captionScale: 1, labelX: 20, labelY: 224, valueX: 250, valueY: 225, spacing: 23, scale: 0.9 },
    /**
     * The bottom captions, HCENTERED 0.9 gold, their second line CHILDOF +16 and their COUNTER CHILDOF +35 (0.9, white):
     * `RWS` (390,196) SEAL ROUNDS / WON, `RoundsWonSeals`; `RLS` (555,197) SEAL ROUNDS / LOST, ValVar `RoundsWonTerrs`;
     * `RWT` (390,267) TERRORIST ROUNDS / WON, `RoundsWonTerrs`; `RLT` (555,267) TERRORIST ROUNDS / LOST, ValVar
     * `RoundsWonSeals` (179 s10 s7).
     */
    rounds: [
      { caption: ROUND_STRINGS.sealRounds, second: ROUND_STRINGS.won, at: [390, 196], value: 'seal', timing: 'seal' },
      { caption: ROUND_STRINGS.sealRounds, second: ROUND_STRINGS.lost, at: [555, 197], value: 'terrorist', timing: 'seal' },
      { caption: ROUND_STRINGS.terroristRounds, second: ROUND_STRINGS.won, at: [390, 267], value: 'terrorist', timing: 'terrorist' },
      { caption: ROUND_STRINGS.terroristRounds, second: ROUND_STRINGS.lost, at: [555, 267], value: 'seal', timing: 'terrorist' },
    ],
    roundsScale: 0.9, secondDy: 16, counterDy: 35,
    /** `Time` (470,350) HCENTERED 0.9 gold; `TimePlayed` CHILDOF +25, 0.9 (UIVAR `TimeInGame`). */
    time: { at: [470, 350], valueDy: 25, scale: 0.9 },
    /** `RTGL` (20,430) 0.9. */
    lobby: { x: 20, y: 430, scale: 0.9 },
    panels: finalPanels(),
  },
} as const;

/**
 * The countdown's caption `secondsLeft` before the screen's end: `CountDown` sets "10" (or "20") at once and one less
 * every 0.5 s, "GO" at the end (5 s / 10 s; research 91 s18 s2.4, s3; READERX agrees, 179 s10 s11). None on GAME COMPLETE.
 */
export function countdownText(kind: RoundScreenKind, secondsLeft: number): string | null {
  if (kind === 'gameComplete') return null;
  const from = kind === 'roundComplete' ? 10 : 20, every = 0.5;
  const n = Math.min(from, Math.ceil(secondsLeft / every - 1e-9));
  return n <= 0 ? ROUND_STRINGS.go : String(n);
}

/** TIME PLAYED as `FUN_00224670` writes `TimeInGame` (L76431-76444): hh:mm:ss, whole seconds. */
export function timePlayedText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

/**
 * A list's order: the comparator `FUN_00225f30` (round) / `FUN_00225e70` (totals) is "less" by score (+0x3c), then
 * kills (+0xc), then `strcmp` (`FUN_00198f18`; D:L77014-77068), and the rows are added from the sorted array's end
 * (D:L76309) -- so score, then kills, then the name in reverse `strcmp` order, highest first (research 179 s10 s9;
 * `FUN_00226060` taken as an ascending sort, interpretive; NAME_ORDER_READING). A new array.
 */
export function sortRows<T extends { score: number; kills: number; name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.score - a.score || b.kills - a.kills || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

/**
 * The MVP: `FUN_002256f0` (D:L76771-76885) walks every player of either side and keeps the higher total score (+0x580),
 * on a tie the higher total kills (+0x550), on a tie `strcmp(best, cand) < 0` takes the candidate -- the same key as
 * `sortRows`' first row. Null with no rows. (Its `+0xfd2 == 0` filter has no flag on the wire: GHOST_ROW_PLACEHOLDER.)
 */
export function pickMvp<T extends { score: number; kills: number; name: string }>(rows: readonly T[]): T | null {
  return sortRows(rows)[0] ?? null;
}

/** How many rows of a list are shown `elapsed` seconds after the screen opened (`ROW_REVEAL`): none before 0.15 s. */
export function revealedRows(elapsed: number): number {
  if (!(elapsed >= ROW_REVEAL.delay)) return 0;
  return Math.floor((elapsed - ROW_REVEAL.delay) / ROW_REVEAL.interval + 1e-9) + 1;
}

/** `x` to single precision rounded toward zero, as the EE's FPU (`packages/ui/src/text/f32.ts` `f32`, transcribed). */
const BOX = new Float32Array(1), BITS = new Uint32Array(BOX.buffer);
function f32(x: number): number {
  const r = Math.fround(x);
  if (!Number.isFinite(x) || r === x || Math.abs(r) <= Math.abs(x)) return r;
  BOX[0] = r;
  BITS[0] = BITS[0]! - 1;
  return BOX[0]!;
}

/**
 * C2DCounter's number (`packages/ui/src/widgets/counter.ts` `tick`, `FUN_0037b5c0` D:L274186-274245; research 117 s7),
 * transcribed for the HUD pass: before `start` nothing (the number +0xd4 is -1, the caption blank); while `start <=
 * elapsed < end`, `(int)(target x (elapsed - start) / (end - start))` in single precision; from `end`, the target.
 */
export function counterShown(target: number, elapsed: number, start: number, end: number): number | null {
  if (!(start <= elapsed)) return null;
  if (!(elapsed < end)) return target;
  return Math.trunc(f32(f32(target) * f32(f32(elapsed - start) / f32(end - start))));
}

/** YOUR STATS' fourth row: `(int)(+0x588 x 100 + 0.5)`, +0x588 = hits +0x548 / shots +0x54c (`FUN_00223970` D:L76064-76069); 0 with no shot. */
export function hitPct(hits: number, shots: number): number {
  if (!(shots > 0)) return 0;
  return Math.trunc(f32(f32(f32(hits / shots) * 100) + 0.5));
}

/** Whether a screen up `elapsed` seconds has hit `TimeoutMonitor`'s WAIT 90.0 (`ROUND_SCREEN_TIMEOUT_S`; PF.R23: the page's action is ONL-22's). */
export function screenTimedOut(elapsed: number): boolean {
  return elapsed >= ROUND_SCREEN_TIMEOUT_S;
}

/**
 * ROUND-90 (research 315 §6 E1): the dialog `TimeoutMonitor`'s end opens -- `GameStatePopCommand(dlgNetError.rdr)`
 * (`onlineDialogs.pinned.json` P:L13759, P:L14208, P:L14665; the command `FUN_00278df0` D:L123731-123745 copies the name
 * into the menu state's start dialog, pops the game state and switches to the menu state).
 */
export const ROUND_SCREEN_TIMEOUT_DIALOG = 'dlgNetError.rdr' as const;
/**
 * ROUND-90: the screens open this long after the room's `roundOver` -- the engine's read (`FUN_002a9b30`: +0xe4 set
 * 3.0 s ahead, D:L150631, then at its passing the result read and the switch to the exit state, D:L150633-150669), the same 3 s as `./netPage`'s own private `ENGINE_READ_S` (that file is not this row's; a test reads
 * it as text and pins the two equal).
 */
export const ROUND_SCREENS_AFTER_S = 3;

/**
 * ROUND-90 (research 315 §6 E1): which of the room's screens is up `elapsed` seconds after they began (after the
 * engine's read; negative: none yet), and for how long it has been up. Each screen's `TimeoutMonitor` starts at its own
 * ONSTART (P:L13758-13760, P:L14207-14209, P:L14664-14666), so `upFor` counts from that screen's open: a next screen
 * resets it -- FINAL ROUND's `CountDown` switches to GAME COMPLETE at its end (P:L14205), before its WAIT 90. The last
 * screen the room names is held until the room moves on (a client's `ReplayMission` and `CloseAndSwitch` do nothing,
 * research 179 §6.18), its `upFor` growing past its seconds. Null with no list.
 */
export function heldScreen(
  list: readonly { screen: RoundScreenKind; seconds: number }[], elapsed: number,
): { kind: RoundScreenKind; index: number; upFor: number } | null {
  if (!(elapsed >= 0)) return null;
  let t = elapsed;
  for (let i = 0; i < list.length; i++) {
    const item = list[i]!;
    if (i === list.length - 1 || t < item.seconds) return { kind: item.screen, index: i, upFor: t };
    t -= item.seconds;
  }
  return null;
}

/** YOUR STATS from the score row's three numbers and the room's counters (`roundOver.stats`; none: zeros). */
export function yourStatsOf(row: { score: number; kills: number; deaths: number }, stats?: MatchStats | null): YourStats {
  return {
    score: row.score, kills: row.kills, deaths: row.deaths, hitPct: hitPct(stats?.shotsHit ?? 0, stats?.shotsFired ?? 0),
    headshots: stats?.headshots ?? 0, primaryObjs: stats?.primaryObjs ?? 0, bonusObjs: stats?.bonusObjs ?? 0,
    friendlyKills: stats?.teamKills ?? 0, suicides: stats?.suicides ?? 0,
  };
}

const numbers = (r: { kills: number; deaths: number; score: number }): string[] => ROUND_LIST_COLUMNS.map((k) => String(r[k]));
const HEADERS: Record<(typeof ROUND_LIST_COLUMNS)[number], string> = {
  score: ROUND_STRINGS.score, kills: ROUND_STRINGS.kills, deaths: ROUND_STRINGS.deaths,
};

/** The screen's strings, in the 640x448 frame. */
function screenTexts(screen: RoundScreen): RoundText[] {
  const S = ROUND_STRINGS, K = ROUND_COLOURS;
  const texts: RoundText[] = [];
  const put = (role: RoundTextRole, text: string, x: number, y: number, scale: number, rgba: Rgba4, align: RoundText['align'] = 'left'): void => {
    if (text.trim()) texts.push({ text, x, y, scale, align, rgba, role });
  };
  const sum = (rows: readonly Row[]) => rows.reduce((a, r) => ({ kills: a.kills + r.kills, deaths: a.deaths + r.deaths, score: a.score + r.score }), { kills: 0, deaths: 0, score: 0 });

  if (screen.kind !== 'gameComplete') {
    const L = READERX_LAYOUT[screen.kind], C = READERX_LAYOUT.lists;
    put('title', screen.kind === 'roundComplete' ? S.roundComplete : S.finalRound, L.title.x, L.title.y, L.title.scale, K.gold);
    put('next', L.next.text, L.next.x, L.next.y, L.next.scale, K.white);
    put('countdown', countdownText(screen.kind, screen.secondsLeft)!, L.next.x + L.countdown.dx, L.next.y, L.countdown.scale, K.white);
    const shown = revealedRows(screen.elapsed);
    for (const t of L.teams) {
      put('team', t.team === 'seal' ? S.seals : S.terrorists, t.caption[0], t.caption[1], C.captionScale, K.white);
      // `CallRoundATie`: a draw (99 or a time-out) DRAW on both; else WINNER / LOSER (91 s18 s2.4; 179 s10 s11).
      const word = screen.winner === null ? S.draw : screen.winner === t.team ? S.winner : S.loser;
      put('result', word, t.result[0], t.result[1], L.resultScale, K.gold);
      C.headers.forEach((x, i) => put('header', HEADERS[ROUND_LIST_COLUMNS[i]!], x, t.headerY, C.headerScale, K.white, 'centre'));
      sortRows(screen.rows.filter((r) => r.team === t.team)).slice(0, Math.min(C.max, shown)).forEach((r, k) => {
        const y = t.list.y + C.spacing * k;
        // The local row's name and clan gold (`FUN_002b3580`, D:L76322-76324), its numbers the list's white.
        const own = r.self ? K.gold : K.white;
        put('row', r.name, t.list.x + C.name, y, C.scale, own);
        if (r.clan) put('row', `[${r.clan}]`, t.list.x + C.clan, y, C.scale, own);
        numbers(r).forEach((n, i) => put('row', n, t.list.x + t.list.columns[i]!, y, C.scale, K.white, 'right'));
      });
    }
    return texts;
  }

  // GAME COMPLETE: the totals, the MVP, YOUR STATS, the round counters, TIME PLAYED, the lobby line.
  const G = READERX_LAYOUT.gameComplete;
  put('title', S.gameComplete, G.title.x, G.title.y, G.title.scale, K.gold);
  G.headers.x.forEach((x, i) => put('header', HEADERS[ROUND_LIST_COLUMNS[i]!], x, G.headers.y, G.headers.scale, K.gold, 'centre'));
  const cols = G.lists.columns.map((c) => G.lists.x + c);
  // `CallRoundATie`: `mp_score00 > mp_score08` SEALs WINNER, the reverse Terrorists, equal " " on both (91 s18 s3).
  const winner = screen.wins.seal > screen.wins.terrorist ? 'seal' : screen.wins.terrorist > screen.wins.seal ? 'terrorist' : null;
  for (const t of G.totals) {
    put('totalsLabel', t.caption, t.at[0], t.at[1], G.labelScale, K.white);
    if (winner === t.team) put('result', S.winner, t.at[0] + t.resultDx, t.at[1], G.labelScale, K.gold);
    // `FUN_00225bc0` (D:L76935+): each column summed over the side.
    numbers(sum(screen.rows.filter((r) => r.team === t.team))).forEach((n, i) => put('totals', n, cols[i]!, t.at[1], G.lists.scale, K.white, 'right'));
  }

  const M = G.mvp;
  put('mvpLabel', S.mvp, M.caption[0], M.caption[1], M.captionScale, K.gold);
  const best = screen.mvp === undefined ? pickMvp(screen.rows) : screen.mvp === null ? null : screen.rows.find((r) => r.name === screen.mvp) ?? null;
  const mvpName = screen.mvp === undefined ? best?.name ?? null : screen.mvp;
  if (mvpName) {
    put('mvp', best?.clan ? `[${best.clan}] ${mvpName}` : mvpName, M.caption[0], M.caption[1] + M.nameDy, M.nameScale, K.white);
    if (best) numbers(best).forEach((n, i) => put('mvp', n, cols[i]!, G.lists.mvpY, G.lists.scale, K.white, 'right'));
  }

  const Y = G.yourStats;
  const self = screen.rows.find((r) => r.self);
  const you = screen.you === undefined ? (self ? yourStatsOf(self) : null) : screen.you;
  put('yourStatsLabel', S.yourStats, Y.caption[0], Y.caption[1], Y.captionScale, K.gold);
  const labels = [S.score, S.kills, S.deaths, S.hitPct, S.headShots, S.primaryObjs, S.bonusObjs, S.friendlyKills, S.suicides];
  labels.forEach((l, k) => put('yourStatsLabel', l, Y.labelX, Y.labelY + Y.spacing * k, Y.scale, K.white));
  if (you) {
    const values = [you.score, you.kills, you.deaths, you.hitPct, you.headshots, you.primaryObjs, you.bonusObjs, you.friendlyKills, you.suicides];
    values.forEach((v, k) => put('yourStats', String(v), Y.valueX, Y.valueY + Y.spacing * k, Y.scale, K.white));
  }

  for (const r of G.rounds) {
    put('rounds', r.caption, r.at[0], r.at[1], G.roundsScale, K.gold, 'centre');
    put('rounds', r.second, r.at[0], r.at[1] + G.secondDy, G.roundsScale, K.gold, 'centre');
    const T = ROUND_COUNTERS[r.timing];
    const n = counterShown(screen.wins[r.value], screen.elapsed, T.start, T.end);
    if (n !== null) put('counter', String(n), r.at[0], r.at[1] + G.counterDy, G.roundsScale, K.white, 'centre');
  }

  put('time', S.timePlayed, G.time.at[0], G.time.at[1], G.time.scale, K.gold, 'centre');
  if (screen.timePlayed !== undefined) put('time', timePlayedText(screen.timePlayed), G.time.at[0], G.time.at[1] + G.time.valueDy, G.time.scale, K.white, 'centre');
  put('lobby', S.lobby, G.lobby.x, G.lobby.y, G.lobby.scale, K.white);
  return texts;
}

/**
 * A round screen's strings, quads and shapes (layer 1 of the HUD pass, over everything; element `roundScreen`) on a
 * frame: pure. `texts` and `panels` are in the 640x448 frame and always given. The quads need `sizes` (the HUD's
 * bitmaps): the BACKGROUND `multplay_back.tif` over the dialog's frame and every panel a `backsolid.tif` quad at its
 * opacity when they are there (`Hud.addBitmaps`, PF.R22); without them -- a runtime fallback, no value -- the panels are
 * shapes in `BACKSOLID_RGB` at the same opacity over the opaque backdrop. The 640x448 frame is fitted whole and
 * centred (`roundScreenFrame`, ROUND_SCREEN_FRAME_FIT), the backdrop over the whole page frame; every bitmap is cut at
 * the dialog's frame, as the original's scissor cuts it (ROUND_NAME_CUT_READING).
 */
export function roundScreenLayout(
  screen: RoundScreen, frame: { width: number; height: number } = { width: 640, height: 448 },
  sizes: Record<string, { width: number; height: number }> = {},
): { quads: HudQuad[]; tris: HudTri[]; texts: RoundText[]; panels: RoundPanel[] } {
  const texts = screenTexts(screen);
  const panels: RoundPanel[] = [...(screen.kind === 'gameComplete' ? READERX_LAYOUT.gameComplete.panels : READERX_LAYOUT[screen.kind].panels)];
  const { s, x0: fx, y0: fy } = roundScreenFrame(frame.width, frame.height);
  const X = (x: number): number => fx + x * s, Y = (y: number): number => fy + y * s;
  const quads: HudQuad[] = [];
  const tris: HudTri[] = [];
  const tri = (x0: number, y0: number, x1: number, y1: number, rgba: Rgba4): void => {
    tris.push({ layer: 1, p: [x0, y0, x1, y0, x1, y1], rgba }, { layer: 1, p: [x0, y0, x1, y1, x0, y1], rgba });
  };
  const rect = (texture: string, x0: number, y0: number, x1: number, y1: number, rgba: Rgba4, uv?: [number, number, number, number]): void => {
    const size = sizes[texture];
    if (!size || rgba[3] <= 0) return;
    let [u0, v0, u1, v1] = uv ?? [0, 0, size.width, size.height];
    // The frame's scissor (ROUND_NAME_CUT_READING): a quad is cut at 0..640 x 0..448, its texels kept at their scale.
    const cx0 = Math.max(x0, 0), cx1 = Math.min(x1, 640), cy0 = Math.max(y0, 0), cy1 = Math.min(y1, 448);
    if (cx1 <= cx0 || cy1 <= cy0) return;
    const du = (u1 - u0) / (x1 - x0), dv = (v1 - v0) / (y1 - y0);
    [u0, u1, v0, v1] = [u0 + (cx0 - x0) * du, u0 + (cx1 - x0) * du, v0 + (cy0 - y0) * dv, v0 + (cy1 - y0) * dv];
    [x0, x1, y0, y1] = [cx0, cx1, cy0, cy1];
    quads.push({ element: 'roundScreen', texture, x: (X(x0) + X(x1)) / 2, y: (Y(y0) + Y(y1)) / 2, w: X(x1) - X(x0), h: Y(y1) - Y(y0),
      turn: 0, u0, v0, u1, v1, rgba, layer: 1 });
  };

  // The backdrop over the whole frame (shapes draw before the layer's bitmaps), then the dialog's BACKGROUND.
  tri(0, 0, frame.width, frame.height, ROUND_COLOURS.backdrop);
  const B = ROUND_SCREEN_BITMAPS;
  rect(B.background, 0, 0, 640, 448, [1, 1, 1, 1]);
  const solid = sizes[B.panel] !== undefined;
  for (const p of panels) {
    if (solid) rect(B.panel, p.x, p.y, p.x + p.w, p.y + p.h, [1, 1, 1, p.alpha]);
    else tri(X(p.x), Y(p.y), X(p.x + p.w), Y(p.y + p.h), [BACKSOLID_RGB[0] / 255, BACKSOLID_RGB[1] / 255, BACKSOLID_RGB[2] / 255, p.alpha]);
  }

  // The strings, each with the font's drop shadow (the scoreboard's text path).
  if (sizes[FONT_TEXT_01.texture]) {
    const [dx, dy] = FONT_TEXT_01.dropShadow.pixels;
    for (const t of texts) {
      const w = textWidth(t.text, t.scale);
      const pen = t.align === 'right' ? t.x - w : t.align === 'centre' ? t.x - w / 2 : t.x;
      const { glyphs } = layoutText(t.text, pen, t.y, t.scale);
      for (const pass of ['shadow', 'text'] as const) {
        const [ox, oy] = pass === 'shadow' ? [dx * t.scale, dy * t.scale] : [0, 0];
        const c: Rgba4 = pass === 'shadow' ? [0, 0, 0, t.rgba[3]] : t.rgba;
        for (const g of glyphs) {
          const x0 = g.x + ox, y0 = g.y + oy;
          rect(FONT_TEXT_01.texture, x0, y0, x0 + g.w, y0 + g.h, c, [g.u0, g.v0, g.u1, g.v1]);
        }
      }
    }
  }
  return { quads, tris, texts, panels };
}
