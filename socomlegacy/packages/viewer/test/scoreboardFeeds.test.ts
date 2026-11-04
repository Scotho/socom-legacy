import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AT_REST, Hud, hudPass } from '../src/hud';
import { layoutText } from '../src/hudFont';
import { SCORE_LAYOUT, scoreboardLayout, type GameDetails } from '../src/scoreboard';

/**
 * ONL-19 (research 269 §5): the board's GAME DETAILS fed in both matches (OT.R43). The HUD takes the details from
 * their source when the board opens and keeps them until it closes:
 * - `FUN_0022be20` builds the three lines only on the press (`DAT_0040f608` 0, D:L79676-79866);
 * - the 1.0 s rebuild while SELECT is held calls `FUN_0022cc10` alone (D:L79872-79876), which never touches them;
 * - the close (`FUN_0022bb30`, D:L79529, D:L79543-79545) lets them go.
 * The front end's mount reads the session's `ComeFromLan` valve and its two UI variables (`sessionGameDetails`);
 * `/testroom`'s reads its room's server name and map (`servedRoomDetails`).
 */

const PS2 = { width: 640, height: 448 };
const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 },
};
type Quads = ReturnType<typeof scoreboardLayout>['quads'];
const drawn = (quads: Quads, line: string, x: number, y: number): boolean =>
  layoutText(line, x, y, 0.8).glyphs.every((h) => quads.some((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0
    && Math.abs(q.x - (h.x + h.w / 2)) < 1e-6 && Math.abs(q.y - (h.y + h.h / 2)) < 1e-6 && q.u0 === h.u0));
const [Y1, Y2, Y3] = SCORE_LAYOUT.left.lines.ys;

/**
 * A HUD whose board is drawn as the page draws it: `hudPass` over the HUD's own model (`Hud.render`'s pass, F5 of the
 * second review), on the PS2 frame with the board's bitmaps.
 */
function hudOnFrame(): { hud: Hud; board: () => Quads } {
  const hud = new Hud();
  hud.setPresentation('ps2');
  hud.setGame('CROSSROADS', 'Demolition');
  return { hud, board: () => hudPass(PS2, hud.state().model, SIZES, AT_REST, false, null, 'ps2').quads };
}

describe('the HUD carries the details\' source to the board', () => {
  it('none: the LAN fill ("LAN game", the map, its type)', () => {
    const { hud, board } = hudOnFrame();
    hud.setScoreboard(true);
    const q = board();
    expect(drawn(q, 'LAN game', 24, Y1!) && drawn(q, 'CROSSROADS', 24, Y2!) && drawn(q, 'DEMOLITION', 24, Y3!)).toBe(true);
  });

  it('online: the source\'s lobby and game and the map\'s type word, taken when the board opens', () => {
    const { hud, board } = hudOnFrame();
    hud.setGameDetails(() => ({ comeFromLan: false, lobby: 'Recruits', game: 'Night Ops' }));
    hud.setScoreboard(true);
    const q = board();
    expect(drawn(q, 'Recruits', 24, Y1!) && drawn(q, 'Night Ops', 24, Y2!) && drawn(q, 'DEMOLITION', 24, Y3!)).toBe(true);
    expect(drawn(q, 'LAN game', 24, Y1!)).toBe(false);
  });

  it('a variable changed while SELECT is held leaves the drawn line; the next open shows the new one', () => {
    const { hud, board } = hudOnFrame();
    let d: GameDetails | null = { comeFromLan: false, lobby: 'Recruits', game: 'Night Ops' };
    hud.setGameDetails(() => d);
    hud.setScoreboard(true);
    expect(drawn(board(), 'Recruits', 24, Y1!)).toBe(true);
    d = { comeFromLan: false, lobby: 'Veterans', game: 'Night Ops' };
    hud.setScoreboard(true);                            // the page sets it every frame while SELECT is held
    expect(drawn(board(), 'Recruits', 24, Y1!)).toBe(true);
    expect(drawn(board(), 'Veterans', 24, Y1!)).toBe(false);
    hud.setScoreboard(false);
    hud.setScoreboard(true);
    expect(drawn(board(), 'Veterans', 24, Y1!)).toBe(true);
    d = null;                                           // no details at the next open: the LAN fill
    hud.setScoreboard(false); hud.setScoreboard(true);
    expect(drawn(board(), 'LAN game', 24, Y1!)).toBe(true);
    hud.setGameDetails(null);                           // no source at all: the LAN fill
    hud.setScoreboard(false); hud.setScoreboard(true);
    const q = board();
    expect(drawn(q, 'LAN game', 24, Y1!) && drawn(q, 'CROSSROADS', 24, Y2!)).toBe(true);
  });

  it('the model carries the held details (one source for the pass and the measure); the close clears them', () => {
    const { hud } = hudOnFrame();
    const d: GameDetails = { comeFromLan: false, lobby: 'Recruits', game: 'Night Ops' };
    hud.setGameDetails(() => d);
    expect(hud.state().model.scoreboardDetails ?? null).toBeNull();
    hud.setScoreboard(true);
    expect(hud.state().model.scoreboardDetails).toEqual(d);
    hud.setScoreboard(false);
    expect(hud.state().model.scoreboardDetails ?? null).toBeNull();
  });
});

describe('both matches feed it (OT.R43; the mounts\' text)', () => {
  const src = (f: string): string => readFileSync(join(import.meta.dirname, '..', 'src', f), 'utf8');

  it('the front end\'s match: the session\'s UI variables and valve, through the mount, after each map\'s `setGame`', () => {
    const mount = src('matchMount.ts');
    expect(mount).toMatch(/gameVars\?: \{ uiVar\(name: string\): string \| null; valve\(name: string\): number \| null \}/);
    expect(mount).toMatch(/hud\.setGame\(m\.name, o\.gameMode \?\? rankOf\(m\.name\)\?\.mode \?\? ''\);\s*\n\s*hud\.setGameDetails\(o\.gameVars \? \(\) => sessionGameDetails\(o\.gameVars!\) : null\);/);
    const front = src('frontEnd.ts');
    expect(front).toMatch(/gameVars: \{ uiVar: \(n\) => \{ const v = session_\?\.uiVars\.find\(n\)\?\.value; return v\?\.type === 'string' \? v\.value : null; \}, valve: \(n\) => session_\?\.opener\.valves\.find\(n\)\?\.value \?\? null \}/);
    expect(front).not.toMatch(/from '\.\/scoreboard'/);   // OT.R12: the front end's bundle takes no board
  });

  it('/testroom\'s served round: its server\'s name and map while online; the walk the fill', () => {
    expect(src('main.ts')).toMatch(/hud\.setGame\(map\.name, rankOf\(map\.name\)\?\.mode \?\? ''\);\s*\n\s*hud\.setGameDetails\(\(\) => \(net && !solo \? servedRoomDetails\(net\.serverName\(\), map\.name\) : null\)\);/);
  });
});
