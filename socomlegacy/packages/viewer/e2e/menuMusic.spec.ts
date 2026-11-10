import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { FRONT_END } from './urls';

/**
 * MENU-MUSIC (web research 152 §4): the front end's music in a rendered browser run. At
 * `/?devmode&menuflow=dlgWorldOfSOCOM.rdr` SOCOM II ONLINE's start (`CallMusic`: `VagStreaming(ON)`, `SOUND
 * MUS_ONLINE_MENU`) reaches the page's streamer (`../src/menuMusic.ts`), which, after a gesture, plays MUUI0003.VPK
 * from the served tree's VAGSTORE by range on the front end's own audio; moved near its end by the test instrument
 * `skip`, it wraps and plays on (flags 4). At `menuflow=dlgMenu.rdr` the main menu starts no music stream: its sound is
 * MENULOOP's own track (the movies' sound), as the disc's scripts have it. The streamer's and the movies' stats are read
 * off the page's hook (`window.__frontEnd`) and printed as `MENUMUSIC {...}` lines. Nothing of the original is
 * measured here: the owner's ear is the acceptance.
 *
 * Dev host only: skips without the served tree's VAGSTORE (`public/maps/RUN/SOUNDS/VAGSTORE.ZAR`). Heavy (a browser):
 * the host's lock rules apply.
 */
const MAPS = fileURLToPath(new URL('../../../public/maps/', import.meta.url));
const HAVE = existsSync(`${MAPS}index.json`) && existsSync(`${MAPS}RUN/SOUNDS/VAGSTORE.ZAR`);
test.skip(!HAVE, 'the served tree with its VAGSTORE absent');

interface StreamView { name: string; member: string; state: string; loop: boolean; buffers: number; wraps: number; scheduledSeconds: number; startedAt: number | null; underruns: number; words: number[]; error: string | null }
interface View {
  music: { streamingOn: boolean; plays: number; refused: { off: number }; streams: StreamView[] } | null;
  movieSound: { movie: string; frames: number; startTime: number | null } | null;
  dialogs: string[];
}

function view(page: Page): Promise<View> {
  return page.evaluate(() => {
    const h = (window as unknown as { __frontEnd?: {
      music: { stats(): View['music'] } | null;
      movies: { sound: { stats(): View['movieSound'] } } | null;
      events: { kind: string; name?: string }[];
    } }).__frontEnd;
    if (!h) return { music: null, movieSound: null, dialogs: [] };
    return {
      music: h.music ? h.music.stats() : null,
      movieSound: h.movies ? h.movies.sound.stats() : null,
      dialogs: h.events.filter((e) => e.kind === 'dialog').map((e) => e.name ?? ''),
    };
  });
}
const playing = (v: View): StreamView | null => v.music?.streams.find((s) => s.state === 'playing') ?? null;

test('SOCOM II ONLINE: after a gesture MUS_ONLINE_MENU plays MUUI0003.VPK from VAGSTORE, and loops past its end', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${FRONT_END}?devmode&menuflow=dlgWorldOfSOCOM.rdr`);
  await expect(page.locator('canvas#front-end')).toHaveCount(1);
  await expect.poll(async () => (await view(page)).music?.plays ?? 0, { timeout: 60_000 }).toBeGreaterThan(0);
  // A key no binding of the screen reads (Q): the gesture the front end's audio unlock counts.
  await page.keyboard.press('KeyQ');
  // RC-MENUMUSIC-CLICK (a spec correction): the click lands where a player's does -- on whichever menu surface is on top.
  // Since the GPU menus' flip (GM.R18) a GPU host shows `#front-end-gpu` over `#front-end` (`./uiGpuFront`), so a click
  // aimed at `#front-end` itself was refused by Playwright as intercepted (shadow's A4500 at d628ce86e: 226 retries,
  // 120 s); SwiftShader keeps the software path and never showed it. The unlock it gives is the document's (`pageUiSounds`
  // binds `unlockOn` to the document, capture phase), so either canvas unlocks the music, for a player as here.
  // Was: `locator('canvas#front-end').click({ position: { x: 5, y: 5 } })`.
  const front = (await page.locator('canvas#front-end').boundingBox())!;
  await page.mouse.click(front.x + 5, front.y + 5);
  await expect.poll(async () => playing(await view(page))?.buffers ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
  const v1 = await view(page);
  await page.waitForTimeout(3_000);
  const v2 = await view(page);
  const s1 = playing(v1)!, s2 = playing(v2)!;
  console.log(`MENUMUSIC ${JSON.stringify({ at: 'start', stream: s1, later: s2, streamingOn: v2.music?.streamingOn, dialogs: v2.dialogs })}`);
  expect([s1.name, s1.member, s1.loop]).toEqual(['MUS_ONLINE_MENU', 'MUUI0003.VPK', true]);
  expect(s1.startedAt, 'started on a running output').not.toBeNull();
  expect(s2.scheduledSeconds - s1.scheduledSeconds, 'the pump keeps the lead up: about 3 s more scheduled in 3 s').toBeGreaterThan(2);
  expect(s2.words.slice(2).map((w) => w >>> 0)).toEqual([0x04000000, 0xffff0000, 1, 0, 0, 4]);

  // The test instrument: the read moved 2 s before the pass's end; the loop's wrap follows and the stream plays on.
  await page.evaluate(() => (window as unknown as { __frontEnd: { music: { skip(s: number): void } } }).__frontEnd.music.skip(2));
  await expect.poll(async () => playing(await view(page))?.wraps ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(4_000);
  const v3 = await view(page);
  const s3 = playing(v3);
  console.log(`MENUMUSIC ${JSON.stringify({ at: 'after the wrap', stream: s3 })}`);
  expect(s3?.state).toBe('playing');
  expect(s3!.scheduledSeconds - s2.scheduledSeconds).toBeGreaterThan(4);
  expect(s3!.error).toBeNull();
  expect(errors).toEqual([]);
});

test('the main menu (dlgMenu) starts no music stream: its sound is MENULOOP\'s own track', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${FRONT_END}?devmode&menuflow=dlgMenu.rdr`);
  await expect(page.locator('canvas#front-end')).toHaveCount(1);
  await expect.poll(async () => (await view(page)).dialogs.includes('dlgMenu.rdr'), { timeout: 60_000 }).toBe(true);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(8_000);
  const v = await view(page);
  console.log(`MENUMUSIC ${JSON.stringify({ at: 'dlgMenu', music: v.music, movieSound: v.movieSound, dialogs: v.dialogs })}`);
  expect(v.music?.plays).toBe(0);
  expect(v.music?.streams).toEqual([]);
  expect(errors).toEqual([]);
});
