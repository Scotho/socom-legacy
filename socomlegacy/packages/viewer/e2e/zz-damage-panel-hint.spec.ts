import { execSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { OpenedContexts } from './openedContexts';

/**
 * WM-13, the DAMAGE REPORT PANEL's hint, measured in a capture (a capture kit, product track: the panel is a browser
 * adaptation with no original, and this spec changes nothing the game does). The test room (Frostfire, `mode=play`,
 * `?devmode`) draws the board, the panel and the hint with the build's own code; the spec stands in only for the page's
 * window -- the test room plays no round to its result -- through `../src/damagePanel` `stageDamageWindow`
 * (`DAMAGE_WINDOW_STAGE_ADAPTATION`, a development build only; it also names the pad as the hint's device, so the capture
 * shows the disc font's SELECT and R2 glyphs the owner sees, where a development page names Tab and I), and drives the
 * build's own keys: Tab held (the board,
 * `./scoreboardKeys`) and I (the panel, `damagePanelKey`). The message window is the HUD test hook's (`setHud({ message })`).
 *
 * Four scenes a view: (a) the result window (the round's report), (b) a respawn wait (the life's report) with a message
 * in the window, (c) the wide-message worst case (the hook's unwrapped line, wider than the window's cap, OT.R82), (d) a
 * line at the cap's width (the widest window with its text inside). Each: the board with
 * the long hint, then the panel with the short one -- a PNG of the canvas's own drawing buffer, and the numbers read off
 * the drawn HUD (`__viewer.hud()`: the message window's rect, the board's rect, the hint's text) with the hint's box laid
 * by the build's own `damageHintBox` in the board's place (its lift and the board's scale read off the board's drawn rect).
 * Views: PS2 (640 x 448), MODERN 16:9 (1920 x 1080) and MODERN 4:3 (1024 x 768).
 *
 * On request only (the gate's `--e2e` sees one skipped test without it), from `socomlegacy/`:
 *   S2U_DAMAGE_PANEL=1 S2U_DAMAGE_PANEL_OUT=<dir> npx playwright test zz-damage-panel-hint
 * Writes `<scene>-<state>-<view>.png`, `captures.jsonl` and `measurements.json` / `measurements.md` in the out directory
 * (the test's output directory without `S2U_DAMAGE_PANEL_OUT`).
 */
test.skip(!process.env['S2U_DAMAGE_PANEL'], 'the damage panel captures run on request: S2U_DAMAGE_PANEL=1');

const OUT = process.env['S2U_DAMAGE_PANEL_OUT'] ?? null;
const VIEWS = {
  ps2: { query: 'ps2', viewport: { width: 640, height: 448 }, lift: 0 },
  'modern-16x9': { query: 'modern', viewport: { width: 1920, height: 1080 }, lift: 4 },
  'modern-4x3': { query: 'modern', viewport: { width: 1024, height: 768 }, lift: 4 },
} as const;
type View = keyof typeof VIEWS;

/** The staged reports (the room's shape, `DamageReport`): a few lines each way, one departed id (-3), one KILL each way. */
const ROUND = {
  round: 3, life: false,
  dealt: [{ id: 5, name: 'Cobra', hits: 6, health: 100, kill: true }, { id: 6, name: 'Mako', hits: 2, health: 46 }, { id: -3, name: null, hits: 1, health: 18 }],
  taken: [{ id: 7, name: 'Rook', hits: 4, health: 81 }, { id: 5, name: 'Cobra', hits: 1, health: 12 }],
};
const LIFE = {
  round: 1, life: true,
  dealt: [{ id: 6, name: 'Mako', hits: 3, health: 64 }],
  taken: [{ id: 7, name: 'Rook', hits: 5, health: 100, kill: true }, { id: -3, name: null, hits: 1, health: 20 }],
};
/**
 * The message window's lines, through the HUD test hook (`setHud({ message })` -> `Hud.flashMessage`: one line at scale 1
 * in `model.message`, NOT the game's post -- `Hud.postMessage` breaks a line wider than the window's 297 at a space
 * (TAUNT-WRAP, `./hudMessagePanel` `wrapMessageLine`), the hook does not). The window grows for its widest line to the cap
 * (`messagePanelSpan`: 1.25 x its half-width, x 104.4..535.6) and no further; the line is drawn centred on x 320 at its
 * whole width (`hudLayout`'s `text('message', ...)`), so a line wider than the cap overflows the panel; nothing scrolls.
 * - b: an ordinary kill line.
 * - c: the old wide line: unwrapped by the hook, wider than the cap -- the overflow worst case (no game post draws it).
 * - d: a line built to the cap's width (`CAP_TEXT_UNITS`): the widest the window draws with its text inside it.
 */
const MESSAGE = 'Rook fragged Viper with AK-47';
const WIDE = 'THE TERRORISTS HAVE PLANTED THE BOMB. IT WILL DETONATE IN THIRTY SECONDS UNLESS DEFUSED';
/** d's line: words of `WIDE` while the line at scale 1 is at most this wide -- (215.6 - 10) x 2, the cap's half less the inset. */
const CAP_TEXT_UNITS = 411.2;
const SETTLE_MS = 700;

/**
 * e: the game's real post path (`Hud.postMessage`, reached through `stageDamagePost`): the worst case it can draw -- e1 one
 * line built to just fit the wrap (`MESSAGE_WRAP_WIDTH`, 297 units at the window's measure scale 0.9), e2 a second such
 * line under it (two lines: the panel widens for its widest line, if any neighbour lets it).
 */
const POSTED = 'THE TERRORISTS HAVE PLANTED THE BOMB AT THE WAREHOUSE DOOR AND IT WILL DETONATE IN THIRTY SECONDS UNLESS SOMEONE DEFUSES IT NOW';
type Scene = { scene: string; window: unknown; message: string | null; posts?: number };
/** The marker for d's line, built in the page (`capLine`). */
const CAP = '<cap>';
const SCENES: Scene[] = [
  { scene: 'a-result', window: { kind: 'round', report: ROUND }, message: null },
  { scene: 'b-respawn', window: { kind: 'life', report: LIFE }, message: MESSAGE },
  { scene: 'c-wide', window: { kind: 'life', report: LIFE }, message: WIDE },
  { scene: 'd-cap', window: { kind: 'life', report: LIFE }, message: CAP },
  { scene: 'e1-post', window: { kind: 'life', report: LIFE }, message: null, posts: 1 },
  { scene: 'e2-posts', window: { kind: 'life', report: LIFE }, message: null, posts: 1 },
];
/** The hook-only scenes: lines the game's posts cannot produce (no wrap; scale 1). */
const HOOK_ONLY = new Set(['c-wide', 'd-cap']);

interface Measure {
  view: View; scene: string; state: 'board' | 'panel'; hint: string | null;
  /** In the 640-wide frame's pixels (the board's coordinates: x about the centre, y / (height / 448)). */
  hintBox: { x0: number; x1: number; y0: number; y1: number } | null;
  /** The window's panel as drawn (`rects.banner`, the nine-sliced bitmap). */
  window: { x0: number; x1: number; y0: number; y1: number } | null;
  /** The window's text as drawn (`rects.message`: the glyph quads' extent, their drop shadow included). */
  text: { x0: number; x1: number; y0: number; y1: number } | null;
  /** hint x0 - panel x1, and hint x0 - text x1: positive, clear by that much; negative, an overlap of that width. */
  gapX: number | null; textGapX: number | null;
  /** The boxes' common height with the hint (> 0: they share rows, so the side gap is what keeps them apart). */
  overlapY: number | null; textOverlapY: number | null;
  /** Where the hint and the window's text cross: their common box's width and height (0 when clear). */
  textOverlap: { w: number; h: number };
  boardScale: number; boardTopDrawn: number | null; panelShown: boolean;
}

async function open(page: Page, view: View): Promise<void> {
  await page.goto(`/testroom?map=MP2&mode=play&devmode&noarmory&view=${VIEWS[view].query}`);
  await page.waitForFunction(() => !!(window as any).__viewer?.feet(), undefined, { timeout: 240_000 });
  await expect(page.locator('#original-loading')).toBeHidden({ timeout: 120_000 });
  await page.addStyleTag({ content: 'body > *:not(#view) { visibility: hidden !important; }' });   // only the game's canvas
  await page.evaluate(() => (window as any).__viewer.setHud({ settled: true }));
  await page.waitForTimeout(SETTLE_MS);
}

async function stage(page: Page, w: unknown): Promise<void> {
  expect(await page.evaluate(`import('/src/damagePanel.ts').then((m) => m.stageDamageWindow(${JSON.stringify(w)}, 'pad'))`)).toBe(true);
}

/** The drawn HUD's numbers for the hint against the message window. */
async function measure(page: Page, view: View, scene: string, state: 'board' | 'panel'): Promise<Measure> {
  const lift = VIEWS[view].lift;
  const m = await page.evaluate(`import('/src/scoreboard.ts').then((sb) => {
    const st = window.__viewer.hud(), f = st.frame, s = f.height / 448, cx = f.width / 2;
    const bx = (x) => 320 + (x - cx) / s, by = (y) => y / s;
    const box = (r) => r ? { x0: bx(r.x), x1: bx(r.x + r.width), y0: by(r.y), y1: by(r.y + r.height) } : null;
    const board = box(st.rects.scoreboard), win = box(st.rects.banner), ink = box(st.rects.message);
    const top = sb.SCORE_TOP - ${lift};
    const k = board ? (board.y1 - top) / (sb.SCORE_LAYOUT.panel.y1 - sb.SCORE_TOP) : 1;   // the board's drawn scale (its bottom 430)
    const hint = st.model.damagePanel && st.model.damagePanel.hint || null;
    let hb = null;
    if (hint) {
      const b = sb.damageHintBox(hint);
      hb = { x0: 320 + (b.x0 - 320) * k, x1: 320 + (b.x1 - 320) * k, y0: top + (b.y0 - sb.SCORE_TOP) * k, y1: top + (b.y1 - sb.SCORE_TOP) * k };
    }
    return { hint, hintBox: hb, window: win, text: ink, boardScale: k, boardTopDrawn: board ? board.y0 : null,
      panelShown: !!(st.model.damagePanel && st.model.damagePanel.report) };
  })`) as Omit<Measure, 'view' | 'scene' | 'state' | 'gapX' | 'textGapX' | 'overlapY' | 'textOverlapY' | 'textOverlap'>;
  const h = m.hintBox;
  const gap = (b: Measure['window']): number | null => (h && b ? h.x0 - b.x1 : null);
  const rows = (b: Measure['window']): number | null => (h && b ? Math.min(h.y1, b.y1) - Math.max(h.y0, b.y0) : null);
  const cross = h && m.text
    ? { w: Math.max(0, Math.min(h.x1, m.text.x1) - Math.max(h.x0, m.text.x0)), h: Math.max(0, Math.min(h.y1, m.text.y1) - Math.max(h.y0, m.text.y0)) }
    : { w: 0, h: 0 };
  return { view, scene, state, ...m, gapX: gap(m.window), textGapX: gap(m.text), overlapY: rows(m.window), textOverlapY: rows(m.text), textOverlap: cross };
}

let sha: string | null = null;
async function capture(page: Page, dir: string, file: string, view: View): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  const png = await page.evaluate(() => new Promise<string>((done) => requestAnimationFrame(() => done((document.getElementById('view') as HTMLCanvasElement).toDataURL('image/png')))));
  writeFileSync(join(dir, file), Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
  sha ??= execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const backing = await page.evaluate(() => { const c = document.getElementById('view') as HTMLCanvasElement; return { width: c.width, height: c.height }; });
  appendFileSync(join(dir, 'captures.jsonl'), `${JSON.stringify({ file, view, viewport: VIEWS[view].viewport, backing, sha, browser: page.context().browser()?.version() ?? null, at: new Date().toISOString() })}\n`);
  await test.info().attach(file, { path: join(dir, file), contentType: 'image/png' });
}

const fmt = (n: number | null): string => (n === null ? '-' : n.toFixed(2));

// Issue #91 / #117: each view's context registered, closed at the test's end even when a step fails.
const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

test('WM-13: the damage panel\'s hint against the message window -- result window, respawn wait, wide message', async ({ browser }) => {
  test.setTimeout(900_000);
  const dir = OUT ?? test.info().outputPath('wm-data-panel');
  mkdirSync(dir, { recursive: true });
  const all: Measure[] = [];
  for (const view of Object.keys(VIEWS) as View[]) {
    const context = opened.add(await browser.newContext({ viewport: { ...VIEWS[view].viewport }, deviceScaleFactor: 1 }));
    const page = await context.newPage();
    try {
      await open(page, view);
      const capLine = await page.evaluate(`import('/src/hudFont.ts').then((f) => {
        let line = '';
        for (const w of ${JSON.stringify(WIDE)}.split(' ')) { const next = line ? line + ' ' + w : w; if (f.textWidth(next, 1) > ${CAP_TEXT_UNITS}) break; line = next; }
        return line;
      })`) as string;
      // e's lines: words of POSTED while a line fits the wrap at the window's measure scale (the post's own wrap keeps it whole).
      const postLines = await page.evaluate(`Promise.all([import('/src/hudFont.ts'), import('/src/hudMessagePanel.ts')]).then(([f, w]) => {
        const scale = w.messageMeasureScale(0), out = [];
        let line = '';
        for (const word of ${JSON.stringify(POSTED)}.split(' ')) {
          const next = line ? line + ' ' + word : word;
          if (f.textWidth(next, scale) > w.MESSAGE_WRAP_WIDTH) { out.push(line); line = word; } else line = next;
        }
        return out;
      })`) as string[];
      let posted = 0;
      for (const sc of SCENES) {
        await page.evaluate((message) => (window as any).__viewer.setHud({ message }), sc.message === CAP ? capLine : sc.message);
        if (sc.posts) {
          const lines = postLines.slice(posted, posted + sc.posts);
          posted += sc.posts;
          expect(await page.evaluate(`import('/src/damagePanel.ts').then((m) => m.stageDamagePost(${JSON.stringify(lines)}))`)).toBe(true);
        }
        await stage(page, sc.window);
        await page.keyboard.down('Tab');                                   // SELECT held: the board, the long hint
        await page.waitForTimeout(SETTLE_MS);
        const board = await measure(page, view, sc.scene, 'board');
        expect(board.hint, `${view} ${sc.scene}: the long hint (the pad's glyphs, staged)`).toMatch(/ \+ .  DMG$/);
        expect(board.panelShown).toBe(false);
        await capture(page, dir, `${sc.scene}-board-${view}.png`, view);
        all.push(board);
        await page.keyboard.press('KeyI');                                 // the panel, the short hint
        await page.waitForTimeout(SETTLE_MS);
        const panel = await measure(page, view, sc.scene, 'panel');
        expect(panel.hint, `${view} ${sc.scene}: the short hint`).toMatch(/SCOREBOARD$/);
        expect(panel.panelShown).toBe(true);
        await capture(page, dir, `${sc.scene}-panel-${view}.png`, view);
        all.push(panel);
        await page.keyboard.up('Tab');                                     // let go: the panel closes
        await page.waitForTimeout(SETTLE_MS);
      }
    } finally {
      await page.evaluate(`import('/src/damagePanel.ts').then((m) => m.stageDamageWindow(undefined))`).catch(() => undefined);
      await context.close();
    }
  }
  writeFileSync(join(dir, 'measurements.json'), `${JSON.stringify({ sha, measures: all }, null, 2)}\n`);
  const range = (b: { x0: number; x1: number } | null): string => (b ? `${fmt(b.x0)}..${fmt(b.x1)}` : '-');
  const rows = all.map((m) => `| ${m.view} | ${HOOK_ONLY.has(m.scene) ? `${m.scene} (hook-only, not producible by the game)` : m.scene} | ${m.state} | ${range(m.hintBox)} | ${range(m.window)} | ${fmt(m.gapX)} | ${range(m.text)} | ${fmt(m.textGapX)} | ${fmt(m.textOverlapY)} | ${fmt(m.textOverlap.w)} x ${fmt(m.textOverlap.h)} | ${fmt(m.boardScale)} |`);
  writeFileSync(join(dir, 'measurements.md'), [
    '# WM-13: the damage panel\'s hint against the message window', '',
    `Commit ${sha}. The 640-wide frame's pixels. The hint's box is damageHintBox in the board's drawn place and scale; the`,
    "window's panel is __viewer.hud().rects.banner, its text rects.message (the drawn glyph quads' extent, shadow included).",
    "gap = hint x0 - box x1 (negative: an overlap that wide); rows = the hint's and the text's common height; cross = their",
    'common box (w x h; 0 x 0 when clear). c-wide and d-cap are the test hook\'s lines (unwrapped, scale 1): hook-only, not',
    'producible by the game. e1/e2 are posted through Hud.postMessage (the game\'s wrap and scale): the real worst case.', '',
    '| view | scene | state | hint x | panel x | panel gap | text x | text gap | text rows | cross | board scale |',
    '|---|---|---|---|---|---|---|---|---|---|---|', ...rows, '',
  ].join('\n'));
});
