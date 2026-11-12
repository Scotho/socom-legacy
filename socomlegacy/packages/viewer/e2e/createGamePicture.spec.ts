import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { FrontEndWindowHook } from '../src/frontEnd';
import { CREATE_GAME_ROWS } from './createGameRows';
import { FRONT_END } from './urls';

/**
 * CREATE GAME's map picture in a rendered browser run (web research 164 R164.6; the owner's report of 2026-10-06, "the
 * lobby creation screen is missing the map images"). At `/?devmode&menuflow=dlgCreateGame.rdr` the screen is walked
 * from the page's keys (the arrows, Enter = CROSS): CHOOSE GAMES opens the PLAY LIST, and each of the four default maps (OT.R45:
 * OT.R16's three and NIGHT STALKER) focused in AVAILABLE MAPS runs the set's `DisplayGamePic`, which shows `CGBack` and `CGPic<n>`. Read off the page's
 * hook (`window.__frontEnd`): the picture's node shown and nothing undrawn in the session's own draw -- its bitmap
 * `mp<n>MissPic.tif` out of the page's UICG bank (`../src/frontEndAssets.ts`). `CREATE_GAME_SHOTS` names a directory
 * for the canvas's screenshots. Nothing of the original is measured here (the capture comparison is
 * `tools/test/createGamePictureDisc.test.ts`'s).
 *
 * Dev host only: skips without the served tree's UICG bank (`public/maps/RUN/UI/UICG_TXR.ZED`). Heavy (a browser):
 * the host's lock rules apply.
 */
const MAPS = fileURLToPath(new URL('../../../public/maps/', import.meta.url));
const HAVE = existsSync(`${MAPS}index.json`) && existsSync(`${MAPS}RUN/UI/UICG_TXR.ZED`);
test.skip(!HAVE, 'the served tree with its UICG bank absent');

type Hooked = Window & { __frontEnd?: FrontEndWindowHook };
interface Seen { dialog: string; focused: string | null; ready: boolean; row: number; shown: string[]; undrawn: string[] }

/** The dialog, its focus, the AVAILABLE_MISSIONS focus row, the CG pictures shown and what the session's draw left undrawn. */
const seen = (p: Page): Promise<Seen | null> => p.evaluate(() => {
  const h = (window as Hooked).__frontEnd;
  const sh = h?.session.machine.shell();
  if (!h || !sh) return null;
  const s = h.session;
  let focused: string | null = null;
  try { focused = s.input.ring()?.focused?.name ?? null; } catch { focused = null; }
  const shown: string[] = [];
  const walk = (n: { name: string; visible: boolean; children: unknown[] }, on: boolean): void => {
    const v = on && n.visible;
    if (v && /^CG(Back|Pic\d+|SS\d+)$/.test(n.name)) shown.push(n.name);
    for (const c of n.children) walk(c as typeof n, v);
  };
  walk(sh.screen.root as unknown as { name: string; visible: boolean; children: unknown[] }, true);
  const parts = s.parts.current;
  const rec = parts?.dialog.design.controls.find((c) => c.name === 'AVAILABLE_MISSIONS');
  const list = rec?.widget ? parts!.widgets.of(rec.widget) as unknown as { focus: number } : null;
  // GM-09: what the page's last frame left undrawn (`FrontEndSession.undrawn`), not a second draw of the spec's own.
  const undrawn = s.presenter ? [...s.undrawn()] : ['no frame'];
  return { dialog: sh.currentName, focused, ready: sh.switchState === -1 && sh.inputTimer <= 0, row: list?.focus ?? -1, shown, undrawn };
});

async function until(p: Page, what: string, want: (s: Seen) => boolean, ms = 60_000): Promise<Seen> {
  let last: Seen | null = null;
  const end = Date.now() + ms;
  for (;;) {
    last = await seen(p).catch(() => null);
    if (last && want(last)) return last;
    if (Date.now() > end) throw new Error(`${what}: last seen ${JSON.stringify(last)}`);
    await p.waitForTimeout(250);
  }
}
async function key(p: Page, k: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) { await p.keyboard.press(k); await p.waitForTimeout(300); }
}

test('CREATE GAME PLAY LIST: each offered map (CREATE_GAME_ROWS, the eight) focused draws its own map picture', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${FRONT_END}?devmode&menuflow=dlgCreateGame.rdr`);
  await expect(page.locator('canvas#front-end')).toHaveCount(1);
  await until(page, 'CREATE GAME', (s) => s.dialog === 'dlgCreateGame.rdr' && s.ready && s.focused !== null);
  for (let i = 0; i < 16; i++) {
    const s = await seen(page);
    if (s?.focused === 'SelectGames') break;
    await key(page, 'ArrowDown');
  }
  await until(page, 'CHOOSE GAMES', (s) => s.focused === 'SelectGames' && s.ready);
  await key(page, 'Enter');                                                       // open_missionsel_popup
  await until(page, 'the PLAY LIST', (s) => s.focused === 'AVAILABLE_MISSIONS' && s.ready);
  const shots = process.env['CREATE_GAME_SHOTS'];
  if (shots) mkdirSync(shots, { recursive: true });
  for (const { row, number: n, slug } of CREATE_GAME_ROWS) {   // the list holds only them (research 164 R164.3; OT.R45; V13-3: six, DF-14: eight, from FIRST_RELEASE_MAPS)
    while (((await seen(page))?.row ?? row) < row) await key(page, 'ArrowDown');
    const s = await until(page, `${slug}'s picture drawn`, (v) => v.row === row && v.shown.includes(`CGPic${n}`) && !v.undrawn.some((u) => /MissPic/i.test(u)), 30_000);
    console.log(`CREATEGAMEPICTURE ${JSON.stringify({ slug, ...s })}`);
    expect(s.shown.sort()).toEqual(['CGBack', `CGPic${n}`]);
    expect(s.undrawn.filter((u) => u !== 'models')).toEqual([]);
    await page.waitForTimeout(500);                                               // the list's scroll settled
    if (shots) await page.locator('canvas#front-end').screenshot({ path: `${shots}/create_game_play_list_${slug}.png` });
  }
  expect(errors).toEqual([]);
});
