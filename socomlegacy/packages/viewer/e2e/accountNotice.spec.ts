import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { ACCOUNT_SERVICE_ABSENT_ADAPTATION, ACCOUNT_SERVICE_ABSENT_BAR_MIN_ADAPTATION, ACCOUNT_SERVICE_ABSENT_LINE_ID } from '../src/connectHost';
import { universeReplyOf } from '../src/universeHost';
import { at, key, popup, pressUntil, typeIn, until } from './frontEndWalk';
import { installStartupPads } from './startupDevices';
import { FRONT_END } from './urls';

/**
 * RV-10 (web sprint 39, LATER 27; research 276 §12): the page's "no account service" line
 * (`ACCOUNT_SERVICE_ABSENT_ADAPTATION`, research 157 §5), seen on a narrow window -- 375 x 812, a phone held upright.
 * A browser adaptation's look; nothing of the game is measured.
 *
 * How the line comes up: the front end's page at the base path with `?devmode` and no `server=`, deep-linked to the
 * persona form (`menuflow=dlgNetPlayerName.rdr`, which runs both halves of `LobbyConnect`, research 157 §5). The
 * account base is then the page's own origin (`accountServiceBase`), the run's Vite dev server, which has no account
 * service: CONNECT's `POST /account/login` gets Vite's bare 404, the original's Login Failure shows on `dlgNetConnect`
 * and the page's line beside it (`connectHostAbsent.test.ts` holds the rule in jsdom). The walk to CONNECT is
 * `frontEndWalk.ts` `toOnlineMenu`'s persona half, its helpers imported.
 *
 * **The test's arrangement: the universe answer** (RV-10c, research 276 §12 part 6). The deep link reads the universe
 * list first (`frontEnd.ts` :727-729, `fetchUniverseService` at the page's own origin with no `server=`); Vite answers
 * that POST with its own 404 too, and with no universe `personaHost.ts` `entered` (:308-315) returns before
 * `lobby.connect`, so `LobbyLogin` answers 0 and no login is ever sent (RV-10b, run 9). So this spec answers the page's
 * `POST /texts/universe` itself (`page.route`, before `goto`) with {@link UNIVERSE_REPLY}: what the match server's
 * texts endpoint answers for an empty data directory. That answer is the test's; nothing else is routed. The login's
 * POST, its 404 and the line are the page's own: `/account/login` reaches the Vite server untouched.
 *
 * What it asserts: the 404 seen; the line shown with its words; its computed cap
 * (`ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION`, the window less 16 px) and wrap; its box inside the viewport with the
 * 8 px gutter on both sides; and its bottom above the dialog's title (frame y 65, `dlgNetConnect`'s title at (30, 65),
 * `RUN/UI/READERC.ZAR`) mapped onto the window through the canvas's `object-fit: contain` (`frontEnd.ts`: a 640 x 448
 * canvas at 100vw x 100vh). The playtest badge is mounted only on `/testroom` (`main.ts` -> `playtestReport.ts` ->
 * `playtestSession.ts`), never on the front end's page, so here it is expected absent: its count is recorded, and
 * should a badge ever show on this page the spec asserts the line's box clear of it. Every box is recorded as an
 * annotation, and the window's picture saved under the test's output directory (`test-results/`, never committed).
 *
 * Written by reading (2026-10-11); its first run (run 9) was red at the login wait, on the path above with no universe
 * answer. Re-written by reading for RV-10c (2026-10-12): the universe answered, the wait armed before NO. Run since
 * (rendered, headless Chromium, the merge controller's slot; research 276 §12): 2026-10-12 on 8e293bc47, between
 * 10:39Z and 10:48Z (before the Log's 2026-10-12T10:52Z entry),
 * `E2E_PORT=5304`, **1 passed** (11.5 s) -- the line drawn at 375 x 812 inside its 8 px gutters, so the cap's value
 * stands as chosen. Run from `socomlegacy/`,
 * with `S2U_DEV_PROXY_PORT` unset (the dev proxy would forward `/texts` and `/account` to a match server):
 *
 *   E2E_PORT=5304 npx playwright test packages/viewer/e2e/accountNotice.spec.ts --workers=1 --reporter=line
 */

const HAVE = existsSync(fileURLToPath(new URL('../../../public/maps/index.json', import.meta.url)));
test.skip(!HAVE, 'maps absent: run npm run extract-maps');
test.skip(!!process.env['S2U_DEV_PROXY_PORT'], 'S2U_DEV_PROXY_PORT set: the dev server forwards /account, so no 404 at the origin');

const VIEWPORT = { width: 375, height: 812 };
/**
 * LATER 27 (a) (the merge controller's call; its review's F3): the windows the line is drawn at -- 375 x 812 (no bar: RV-10's
 * cap, above the title), 812 x 375 (a phone held sideways) and 1280 x 720 (a desktop): in the right letterbox bar, clear of
 * the frame (`connectHost.ts` `ACCOUNT_SERVICE_ABSENT_BAR_MIN_ADAPTATION`).
 */
const VIEWPORTS = [VIEWPORT, { width: 812, height: 375 }, { width: 1280, height: 720 }] as const;
/** The front end's frame (`frontEnd.ts`: `canvas.width = 640`, `canvas.height = 448`). */
const FRAME = { width: 640, height: 448 };
/** The dialog's title's top in the frame (`dlgNetConnect` and `dlgNetPlayerName`: (30, 65); research 157 §5). */
const TITLE_Y = 65;
/** The line's gutter on each side: its `right` (8 px) and the cap's other 8 px (`connectHost.ts`). */
const GUTTER = 8;

/**
 * The test's universe answer (RV-10c; research 276 §12 part 6): the reply the match server's texts endpoint gives the
 * page's query (`UNIVERSE_QUERY`, infoType 3: both bits) from an empty data directory -- `textsHandler`'s
 * `answer(200, texts.universeInformation(infoType))` (`packages/central/src/serverTexts.ts` :378-381; `answer` :362-366
 * writes JSON with `content-type: application/json`) over `SERVER_TEXTS_PLACEHOLDER`'s one universe (:103-118), as
 * SVC-05 makes `texts.json` in a data directory without one (`ServerTexts.open`): an entry of status Success (0,
 * `MEDIUS_TEXT_STATUS` :60), the placeholder's name, DNS '' and port 0 (the server's "connect back to the server that
 * answered": here the page's own origin, :76-80), universe status 1, users 0 (no `userCount` given, :241), 256 max
 * users, empty billing, `endOfList` true (`universeInformation` :275-291); and the placeholder news in one chunk (71
 * bytes, under `TEXT_WIDTHS.news` - 1 = 255, `chunkText` :170-185). It passes the page's own parser,
 * `universeHost.ts` `universeReplyOf` (:62-66, `entryOf` :40-53, `newsOf` :55-59), which the test asserts. What
 * `entered` needs of it: one entry of status 0, so that `UniverseList.entry` (`@s2u/ui` `universeCommands.ts`
 * :153-167, `FUN_002fdaf0`) keeps it, and its DNS and port, which `entered` hands to `enterForm` and `lobby.connect`
 * whatever the universe status; the account requests go to the page's own origin whatever the address
 * (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`). A test arrangement, as RV-8a's route serves its segments.
 */
const UNIVERSE_REPLY = {
  universes: [{
    status: 0, name: 'PLACEHOLDER UNIVERSE', dns: '', port: 0,
    description: 'Placeholder description: the owner writes this universe\'s text in texts.json (H73).',
    universeStatus: 1, userCount: 0, maxUsers: 256, billing: '', billingName: '', extendedInfo: '', endOfList: true,
  }],
  news: [{ status: 0, news: 'Placeholder server news: the owner writes the news in texts.json (H73).', endOfList: true }],
} as const;

/**
 * LOGIN_POST_BOUND_MS: how long the spec waits for the page's `POST /account/login`, armed just before NO's Enter. On
 * this path the request is made on `dlgNetConnect`'s first frames: the persona form's CONNECT runs `register_new_account`
 * (#606, `memcard_operations` with the card slot and #831, then `SWITCHMENU(dlgNetConnect.rdr)`; research 153 §6), and
 * only the built `dlgNetConnect`'s `init_socom_online` dispatches `LobbyLogin` (research 157 §4), which queues state 7
 * (`lobbyClient.ts` `login`, `FUN_002fa5a0`); the next frame's step (`ConnectCommands.frame` -> `LobbyClient.step`,
 * `FUN_002dfe50`) enters it and state 7's handler posts the login (`FUN_002eede0`). State 12, which `entered`'s
 * `lobby.connect` queued at the boot, was entered and answered long before (`SESSION_BEGIN_ADAPTATION`: no request).
 * The bound is the connecting screen's own watchdog, `monitor_timeout`'s `WAIT 90` (research 157 §4): past it the
 * screen leaves with #547 and no login of this visit can come. A test's bound, not a game value.
 */
const LOGIN_POST_BOUND_MS = 90_000;


type Box = { x: number; y: number; width: number; height: number };
const hit = (a: Box, b: Box): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

for (const vp of VIEWPORTS) test.describe(`at ${vp.width} x ${vp.height}`, () => {
  test.use({ viewport: vp });
  test(`the "no account service" line at ${vp.width} x ${vp.height}: inside the window, its 8 px gutters, off the dialog title, clear of any badge (RV-10, LATER 27 (a))`, async ({ page }) => {
    test.setTimeout(180_000);
    const note = (type: string, value: unknown): void => { test.info().annotations.push({ type, description: JSON.stringify(value) }); };
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await installStartupPads(page);
    // The test's arrangement (UNIVERSE_REPLY): the universe query answered, in the page's parser's shape; nothing else routed.
    expect(() => universeReplyOf(UNIVERSE_REPLY)).not.toThrow();
    let universeAnswered = 0;
    await page.route('**/texts/universe', async (route) => {
      if (route.request().method() !== 'POST') { await route.fallback(); return; }
      universeAnswered++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(UNIVERSE_REPLY) });
    });
    await page.goto(`${FRONT_END}?devmode&menuflow=dlgNetPlayerName.rdr`);

    // The persona form's half of `toOnlineMenu` (frontEndWalk.ts): a new name, a password, CONNECT, NO to the card save.
    await at(page, 'dlgNetPlayerName.rdr', 'playername_btn');
    await pressUntil(page, 'Enter', 'the persona list', (s) => s.focused === 'PersonaList' && s.ready);
    await pressUntil(page, 'Enter', 'the soft keyboard', (s) => s.keyboard);
    await typeIn(page, 'rvten');
    await until(page, 'the password enabled', (s) => s.enabled.includes('passwd_btn'));
    await key(page, 'ArrowDown');
    await at(page, 'dlgNetPlayerName.rdr', 'passwd_btn');
    await pressUntil(page, 'Enter', 'the soft keyboard', (s) => s.keyboard);
    await typeIn(page, 'secret1');
    await until(page, 'CONNECT enabled', (s) => s.enabled.includes('connect_btn'));
    await key(page, 'ArrowDown', 4);
    await at(page, 'dlgNetPlayerName.rdr', 'connect_btn');
    await key(page, 'Enter');
    await popup(page, '#606 (OK)');
    await key(page, 'Enter');
    await popup(page, 'the MEMORY CARD slot');
    await key(page, 'Backspace');
    await popup(page, 'save to the memory card? YES / NO');
    await key(page, 'ArrowRight');
    // The login is posted on dlgNetConnect's first frames, after NO (LOGIN_POST_BOUND_MS): the wait armed here.
    const login = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/account/login', { timeout: LOGIN_POST_BOUND_MS });
    await key(page, 'Enter');                                            // NO

    // The account base is this page's origin, the dev server: a bare 404, the Login Failure, and the page's line beside it.
    const answered = await login;
    note('universe answered (the test\'s route)', universeAnswered);
    expect(universeAnswered).toBeGreaterThanOrEqual(1);
    note('login answer', { url: answered.url(), status: answered.status() });
    expect(answered.status()).toBe(404);
    await until(page, 'dlgNetConnect: the Login Failure', (s) => s.dialog === 'dlgNetConnect.rdr' && s.popup);
    const line = page.locator(`#${ACCOUNT_SERVICE_ABSENT_LINE_ID}`);
    await expect(line).toBeVisible();
    await expect(line).toContainText(ACCOUNT_SERVICE_ABSENT_ADAPTATION);
    await page.waitForTimeout(500);                                      // the web font's swap, if any, before the boxes

    const seenBoxes = await page.evaluate((id) => {
      const rect = (e: Element | null): { x: number; y: number; width: number; height: number } | null => {
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const el = document.getElementById(id)!;
      const cs = getComputedStyle(el);
      const canvas = document.getElementById('front-end') as HTMLCanvasElement | null;
      return {
        window: { width: innerWidth, height: innerHeight },
        line: rect(el), maxWidth: cs.maxWidth, overflowWrap: cs.overflowWrap, font: cs.font, lineHeight: cs.lineHeight,
        canvas: rect(canvas), canvasSize: canvas ? [canvas.width, canvas.height] : null, objectFit: canvas ? getComputedStyle(canvas).objectFit : null,
        badges: document.querySelectorAll('#playtest-badge').length, badge: rect(document.getElementById('playtest-badge')),
      };
    }, ACCOUNT_SERVICE_ABSENT_LINE_ID);
    note('window', seenBoxes.window);
    note('line box', seenBoxes.line);
    note('line style', { maxWidth: seenBoxes.maxWidth, overflowWrap: seenBoxes.overflowWrap, font: seenBoxes.font, lineHeight: seenBoxes.lineHeight });
    note('canvas', { box: seenBoxes.canvas, size: seenBoxes.canvasSize, objectFit: seenBoxes.objectFit });
    note('playtest badge', { count: seenBoxes.badges, box: seenBoxes.badge });
    await page.screenshot({ path: test.info().outputPath(`account-notice-${vp.width}x${vp.height}.png`) });

    // The cap and its wrap, as computed: the right bar's on a window with one (LATER 27 (a)), else RV-10's.
    expect(seenBoxes.window).toEqual(vp);
    expect(seenBoxes.overflowWrap).toBe('anywhere');

    // Inside the window, 8 px from its top, its right and its left (half a pixel for subpixel layout).
    const l = seenBoxes.line!;
    expect(l.y).toBeCloseTo(GUTTER, 0);
    expect(l.x).toBeGreaterThanOrEqual(GUTTER - 0.5);
    expect(l.x + l.width).toBeLessThanOrEqual(vp.width - GUTTER + 0.5);
    expect(l.y + l.height).toBeLessThanOrEqual(vp.height);

    // Above the dialog's title: frame y 65, mapped through the canvas's object-fit: contain.
    expect(seenBoxes.canvasSize).toEqual([FRAME.width, FRAME.height]);
    expect(seenBoxes.objectFit).toBe('contain');
    const c = seenBoxes.canvas!;
    const scale = Math.min(c.width / FRAME.width, c.height / FRAME.height);
    const frame = { x: c.x + (c.width - FRAME.width * scale) / 2, y: c.y + (c.height - FRAME.height * scale) / 2, width: FRAME.width * scale, height: FRAME.height * scale };
    const titleTop = frame.y + TITLE_Y * scale;
    note('frame on the window', { ...frame, scale, titleTop });
    const bar = Math.floor(vp.width - (frame.x + frame.width) - 2 * GUTTER);
    if (bar >= ACCOUNT_SERVICE_ABSENT_BAR_MIN_ADAPTATION) {
      // In the right bar: its cap the bar's, its left edge right of the frame's (LATER 27 (a)).
      expect(seenBoxes.maxWidth).toBe(`${bar}px`);
      expect(l.x).toBeGreaterThanOrEqual(frame.x + frame.width + GUTTER - 0.5);
    } else {
      // No bar: RV-10's cap, and above the dialog's title.
      expect(seenBoxes.maxWidth).toBe(`${vp.width - 2 * GUTTER}px`);
      expect(l.y + l.height).toBeLessThan(titleTop);
    }

    // The playtest badge: expected absent on the front end's page; were it ever there, the line stays clear of it.
    if (seenBoxes.badge) expect(hit(l, seenBoxes.badge), `line ${JSON.stringify(l)} over badge ${JSON.stringify(seenBoxes.badge)}`).toBe(false);
    expect(errors).toEqual([]);
  });
});
