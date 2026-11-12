import { expect, type Browser, type Page } from '@playwright/test';
import type { FrontEndWindowHook } from '../src/frontEnd';
import type { MatchWindowHook } from '../src/matchMount';
import { installStartupPads } from './startupDevices';
import { focusGameRow } from './gameRow';
import { SETUP } from './urls';

/**
 * The front end's walk, step by step, as `twoPagesMatch.spec.ts` makes it (its helpers, copied so that spec stays as it
 * is): LOGIN to the briefing room, CREATE GAME on FROSTFIRE, the join, READY. Every dialog is walked by its own scripts
 * from the page's keys (`../src/menuInput.ts`: the arrows, Enter = CROSS, Backspace = TRIANGLE, V = SQUARE) and the soft
 * keyboard's physical typing; each helper waits on the shell's `currentName`, the focus ring's focused control and the
 * popup between presses -- never a `shell().event` shortcut. A playtest instrument of the specs.
 */

export type Hooked = Window & { __frontEnd?: FrontEndWindowHook; __frontEndMatch?: MatchWindowHook };

/** What a step waits on: the dialog, the focus, the popup, the shell's switch and input hold, the soft keyboard. */
export interface Seen { dialog: string; focused: string | null; enabled: string[]; popup: boolean; ready: boolean; keyboard: boolean; match: string }
export const seen = (p: Page): Promise<Seen | null> => p.evaluate(() => {
  const h = (window as Hooked).__frontEnd;
  if (!h) return null;
  const s = h.session, sh = s.machine.shell();
  let ring: ReturnType<typeof s.input.ring> = null;
  try { ring = s.input.ring(); } catch (e) { return { dialog: sh?.currentName ?? '', focused: `ring threw: ${String(e)}`, enabled: [], popup: false, ready: false, keyboard: false, match: s.match.phase }; }
  let popup = false;
  try { popup = sh ? sh.popups.shown(sh.screen) : false; } catch { popup = false; }
  return {
    dialog: sh?.currentName ?? '', focused: ring?.focused?.name ?? null,
    enabled: ring ? ring.controls.filter((c) => c.enabled()).map((c) => c.name) : [],
    popup, ready: !!sh && sh.switchState === -1 && sh.inputTimer <= 0,
    keyboard: s.keyboard.keyboard.isOpen && !s.keyboard.keyboard.busy, match: s.match.phase,
  };
});

/** Waits until `want` holds of what the page shows; the last seen in the failure. */
export async function until(p: Page, what: string, want: (s: Seen) => boolean, ms = 90_000): Promise<Seen> {
  let last: Seen | null = null;
  const end = Date.now() + ms;
  for (;;) {
    try { last = await seen(p); } catch { last = null; }
    if (last && want(last)) return last;
    if (Date.now() > end) throw new Error(`${what}: last seen ${JSON.stringify(last)}`);
    await p.waitForTimeout(250);
  }
}
/** The dialog up, settled (no switch, no input hold, no popup), its focus on `focused` when named. */
export const at = (p: Page, dialog: string, focused?: string): Promise<Seen> =>
  until(p, `${dialog}${focused ? ` on ${focused}` : ''}`, (s) => s.dialog === dialog && s.ready && !s.popup && !s.keyboard && (!focused || s.focused === focused));
export const popup = (p: Page, what: string): Promise<Seen> => until(p, `a popup: ${what}`, (s) => s.popup && s.ready);
export async function key(p: Page, k: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) { await p.keyboard.press(k); await p.waitForTimeout(350); }
}
/** A press the dialog's scripts may still be holding off: pressed again, a few times, until what it leads to is seen. */
export async function pressUntil(p: Page, k: string, what: string, want: (s: Seen) => boolean, tries = 5): Promise<void> {
  for (let i = 0; i < tries; i++) {
    await key(p, k);
    try { await until(p, what, want, 6_000); return; } catch { /* not yet: again */ }
  }
  await until(p, what, want, 1_000);
}
/** A soft keyboard's field: CROSS opened it; the text typed through the physical keys; Enter applies it. */
export async function typeIn(p: Page, text: string): Promise<void> {
  await until(p, 'the soft keyboard', (s) => s.keyboard);
  await p.keyboard.type(text, { delay: 90 });
  await key(p, 'Enter');
  await until(p, 'the soft keyboard closed', (s) => !s.keyboard && s.ready);
}

/** A page at LOGIN on the spec's match server, a test pad installed. */
export async function open(browser: Browser, port: number): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const page = await context.newPage();
  await installStartupPads(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${SETUP}?devmode&menuflow=dlgNetLogin.rdr&server=${encodeURIComponent(`http://127.0.0.1:${port}`)}`);
  return { page, errors };
}

/** LOGIN to the SOCOM II ONLINE menu, a new player name registered on the way (NO to the persona form's card save). */
export async function toOnlineMenu(p: Page, name: string): Promise<void> {
  await at(p, 'dlgNetLogin.rdr', 'login_btn');
  await pressUntil(p, 'Enter', 'DNAS', (s) => s.dialog !== 'dlgNetLogin.rdr');
  await at(p, 'dlgNetServerSelect.rdr', 'SERVERLIST');
  await pressUntil(p, 'Enter', 'the persona form', (s) => s.dialog === 'dlgNetPlayerName.rdr');
  await at(p, 'dlgNetPlayerName.rdr', 'playername_btn');
  await pressUntil(p, 'Enter', 'the persona list', (s) => s.focused === 'PersonaList' && s.ready);
  await pressUntil(p, 'Enter', 'the soft keyboard', (s) => s.keyboard);
  await typeIn(p, name);
  await until(p, 'the password enabled', (s) => s.enabled.includes('passwd_btn'));
  await key(p, 'ArrowDown');
  await at(p, 'dlgNetPlayerName.rdr', 'passwd_btn');
  await pressUntil(p, 'Enter', 'the soft keyboard', (s) => s.keyboard);
  await typeIn(p, 'secret1');
  await until(p, 'CONNECT enabled', (s) => s.enabled.includes('connect_btn'));
  await key(p, 'ArrowDown', 4);
  await at(p, 'dlgNetPlayerName.rdr', 'connect_btn');
  await key(p, 'Enter');
  await popup(p, '#606 (OK)');
  await key(p, 'Enter');
  await popup(p, 'the MEMORY CARD slot');
  await key(p, 'Backspace');
  await popup(p, 'save to the memory card? YES / NO');
  await key(p, 'ArrowRight');
  await key(p, 'Enter');                                              // NO
  await until(p, 'dlgNetConnect: the name not found, register it?', (s) => s.dialog === 'dlgNetConnect.rdr' && s.popup);
  await key(p, 'Enter');                                              // YES
  await at(p, 'dlgUsagePolicy.rdr', 'YesAccept');
  await pressUntil(p, 'Enter', 'the online menu', (s) => s.dialog === 'dlgWorldOfSOCOM.rdr');
  await until(p, 'the message of the day', (s) => s.dialog === 'dlgWorldOfSOCOM.rdr' && s.focused === 'popup_motd_button' && s.ready);
  await pressUntil(p, 'Enter', 'the online menu', (s) => s.dialog === 'dlgWorldOfSOCOM.rdr' && s.focused !== 'popup_motd_button' && s.ready);
}

/**
 * The focus stepped down the ring onto `name` (each press one step, as the pad's d-pad), read from the ring after every
 * press -- never a count of presses: a row the screen gains (CREATE GAME's RESPAWN, OT.R71 slice 4) moves every row
 * below it. Bounded by the ring itself: one lap of its enabled controls (at least 12), then `name` or the failure.
 */
export async function focusOn(p: Page, dialog: string, name: string, step = 'ArrowDown'): Promise<void> {
  for (let i = 0, lap = 12; i < lap; i++) {
    const now = await at(p, dialog);
    if (now.focused === name) return;
    lap = Math.max(lap, now.enabled.length + 1);
    await key(p, step);
  }
  await at(p, dialog, name);
}

/** From the online menu into a briefing room, JOIN GAME focused. */
export async function toBriefingRoom(p: Page): Promise<void> {
  await focusOn(p, 'dlgWorldOfSOCOM.rdr', 'briefingrooms');
  await pressUntil(p, 'Enter', 'the rooms list', (s) => s.focused === 'ROOMLIST' && s.ready);
  await pressUntil(p, 'Enter', 'the briefing room', (s) => s.dialog === 'dlgMPBriefingRoom.rdr');
  await at(p, 'dlgMPBriefingRoom.rdr', 'JoinGame');
}

/** The game lobby up, its first popups answered (the session master's #350, a late joiner's #352 / #353). */
export async function inLobby(p: Page): Promise<void> {
  await until(p, 'the game lobby', (s) => s.dialog === 'dlgGameLobby.rdr' && s.ready);
  const end = Date.now() + 8_000;
  while (Date.now() < end) {
    const s = await seen(p);
    if (s?.popup && s.ready) { await key(p, 'Enter'); await p.waitForTimeout(800); continue; }
    await p.waitForTimeout(300);
  }
  await at(p, 'dlgGameLobby.rdr');
}

/**
 * CREATE GAME: the game's name, the map captioned `caption` (FROSTFIRE by default; `menuSides.spec.ts` plays VIGILANCE
 * and CROSSROADS too) the play list's one map, SQUARE to create (`create_game`).
 */
export async function createGame(p: Page, name: string, caption = 'FROSTFIRE'): Promise<void> {
  await key(p, 'ArrowUp');
  await at(p, 'dlgMPBriefingRoom.rdr', 'CRgame');
  await pressUntil(p, 'Enter', 'CREATE GAME', (s) => s.dialog === 'dlgCreateGame.rdr');
  await at(p, 'dlgCreateGame.rdr', 'gamename_btn');
  await pressUntil(p, 'Enter', 'the soft keyboard', (s) => s.keyboard);
  await typeIn(p, name);
  await focusOn(p, 'dlgCreateGame.rdr', 'SelectGames');                // by the ring, never a count of rows
  await pressUntil(p, 'Enter', 'the available maps', (s) => s.focused === 'AVAILABLE_MISSIONS' && s.ready);
  const captions = await p.evaluate(() => {
    const parts = (window as Hooked).__frontEnd!.session.parts.current!;
    const rec = parts.dialog.design.controls.find((c) => c.name === 'AVAILABLE_MISSIONS')!;
    const list = parts.widgets.of(rec.widget!) as unknown as { items: { captions: string[] }[] };
    return list.items.map((i) => i.captions);
  });
  const index = captions.findIndex((c) => c.includes(caption));
  expect(index, `${caption} in ${JSON.stringify(captions)}`).toBeGreaterThanOrEqual(0);
  await key(p, 'ArrowDown', index);
  await key(p, 'Enter');
  await key(p, 'KeyV');
  await at(p, 'dlgCreateGame.rdr');
  await key(p, 'KeyV');
  await inLobby(p);
}

/** JOIN GAME from the briefing room: the room's first game -- or, with `name`, the game of that name
 * (`./gameRow` `focusGameRow`): a room that may still hold another test's game is joined by name; the first row only
 * where the room holds one game.
 */
export async function joinGame(p: Page, name?: string): Promise<void> {
  await pressUntil(p, 'Enter', 'the games list', (s) => s.focused === 'GAMELIST' && s.ready);
  if (name !== undefined) await focusGameRow(p, name);
  await pressUntil(p, 'Enter', 'the game lobby', (s) => s.dialog === 'dlgGameLobby.rdr');
  await inLobby(p);
}

/** The room's own view of the game lobby: its seats, sides, READY. */
export const lobbyView = (p: Page) => p.evaluate(() => ((window as Hooked).__frontEnd!.session.gameLobby.commands as unknown as {
  view: { seats: { name: string; team: string | null; ready: boolean }[] } | null;
}).view);

/** READY in the game lobby: once its hold lets it on, then CROSS (`ready_anim`). */
export async function ready(p: Page): Promise<void> {
  await until(p, 'READY enabled', (s) => s.dialog === 'dlgGameLobby.rdr' && s.enabled.includes('PlayerReady') && s.ready && !s.popup);
  await focusOn(p, 'dlgGameLobby.rdr', 'PlayerReady');
  await key(p, 'Enter');
}
