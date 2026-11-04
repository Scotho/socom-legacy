import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { LIST_LAYOUT } from '../src/weaponSelect';
import { shortTurn } from '../src/yaw';
import { OpenedContexts } from './openedContexts';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/** The contexts this spec opens on the worker's browser, closed after each test -- a failed one's too (issues #91, #117). */
const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

/**
 * Walk mode on a phone (owner, 2026-09-29: dual floating sticks; MP-1, the owner 2026-10-16: the PlayStation's buttons, no
 * action words): with emulated touch in landscape (812x375, 667x375, 915x412) and portrait (360x640, 375x812, 412x915), a
 * finger on the left half moves, one on the right half looks -- both at once -- and each touch button presses its pad
 * button (`data-pad`), so it holds the lanes the controller's button holds. The page is loaded with `?mode=play&fly`; the
 * touches go through the browser's own input (`Input.dispatchTouchEvent`), so a hold is a hold.
 */

// A phone's first visit, the panel folded: opened (the specs' default, `playwright.config.ts`) it would cover the buttons.
test.use({ storageState: { cookies: [], origins: [] } });
// Phone-only cases must not inherit a controller attached to the test host. The handoff case supplies its own pad.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] }));
});

const LANDSCAPES = [{ width: 812, height: 375 }, { width: 667, height: 375 }, { width: 915, height: 412 }, { width: 844, height: 390 }, { width: 932, height: 430 }];
const LANDSCAPE = LANDSCAPES[0]!;
const PORTRAITS = [{ width: 360, height: 640 }, { width: 375, height: 812 }, { width: 412, height: 915 }];
const PORTRAIT = PORTRAITS[1]!;
/** The walk's sixteen pad buttons (MP-1: `index.html` `#touch-walk`, each `data-pad`). */
const PAD_IDS = ['tw-l1', 'tw-l2', 'tw-r1', 'tw-r2', 'tw-up', 'tw-down', 'tw-left', 'tw-right', 'tw-triangle', 'tw-circle', 'tw-cross',
  'tw-square', 'tw-l3', 'tw-select', 'tw-start', 'tw-r3'];

type Rect = { x: number; y: number; width: number; height: number };
const hit = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

async function phone(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  // The kit these pins were measured on: the M4A1 SD, the Mark 23, the M67 and the HE, no 2X (W2.R4's), by the
  // developer's `&kit=` (README; the default spawn is the map's type's kit since web sprint 4).
  await page.goto(`${TEST_ROOM}?mode=play&fly&devmode&kit=62,15,121,126,255`);
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  await holdReleased(page);                                           // the hold lets the touch layer go every frame (`./loadHold`)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // The tip is a first visit's (`./mobileTip`); these specs are about the controls under it.
  await page.evaluate(() => document.getElementById('mobile-tip-close')?.click());
  // `?devmode`'s playtest overlay (`../src/playtestReport.ts`, a developer's instrument, z-index 10000) sits in the
  // bottom-right corner over the face buttons and the look zone on a phone: a player never has it, so it is not drawn here.
  await page.addStyleTag({ content: '#playtest-overlay { display: none !important; }' });
}

/** Touches and holds: each id is a finger, at a selector's centre or at a point. */
class Fingers {
  constructor(private readonly cdp: CDPSession, private readonly page: Page) {}
  private points = new Map<number, { x: number; y: number }>();
  private async at(where: string | { x: number; y: number }): Promise<{ x: number; y: number }> {
    if (typeof where !== 'string') return where;
    const b = (await this.page.locator(where).boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  async down(id: number, where: string | { x: number; y: number }): Promise<void> {
    this.points.set(id, await this.at(where));
    await this.send('touchStart');
  }
  async move(id: number, to: { x: number; y: number }): Promise<void> {
    this.points.set(id, to);
    await this.send('touchMove');
  }
  /** Every finger up: the protocol's touchEnd carries no points and ends all that are down. */
  async up(_id?: number): Promise<void> {
    this.points.clear();
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  /** One finger up: CDP releases the listed points; an empty list releases every finger. */
  async lift(id: number): Promise<void> {
    const point = this.points.get(id);
    if (!point) throw new Error(`Finger ${id} is not down`);
    this.points.delete(id);
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...point, id }] });
  }
  private send(type: 'touchStart' | 'touchMove'): Promise<unknown> {
    return this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...this.points.entries()].map(([id, p]) => ({ ...p, id })) });
  }
  async tap(id: number, selector: string, ms = 80): Promise<void> {
    await this.down(id, selector);
    await this.page.waitForTimeout(ms);
    await this.up(id);
  }
}

async function centre(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const b = (await page.locator(selector).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const input = (page: Page) => page.evaluate(() => window.__viewer.pad().input);
const buttonsShown = (page: Page): Promise<Array<{ id: string } & Rect>> => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('#touch button, .touch-stick-rest, #fullscreen')]
    .map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, x: r.x, y: r.y, width: r.width, height: r.height, shown: getComputedStyle(e).display !== 'none' }; })
    .filter((c) => c.shown && c.width > 0 && c.height > 0)
    .map(({ shown: _, ...c }) => c));

for (const size of [...LANDSCAPES, ...PORTRAITS]) {
  const upright = size.height > size.width;
  test.describe(`walk mode on a phone, ${upright ? 'portrait' : 'landscape'} ${size.width}x${size.height}`, () => {
    test.use({ hasTouch: true, isMobile: true, viewport: size });

    test('the bottom layout: PlayStation buttons, nothing overlapping, the complete HUD clear', async ({ page }) => {
      await phone(page, size);
      await expect(page.locator('#touch-lift')).toBeVisible();                   // flying: the lift buttons
      await expect(page.locator('#touch-walk')).toBeHidden();
      await expect(page.locator('#aim-zone')).toBeHidden();                      // flying: the canvas's drag looks
      expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
      await expect(page.locator('#tw-r1')).toBeVisible();
      await expect(page.locator('#tw-r1')).toHaveText('R1');                    // the pad button's name, never SHOOT
      await expect(page.locator('#tw-r1')).toHaveAttribute('aria-label', /^R1: /);
      await expect(page.locator('#touch-walk')).not.toContainText(/SHOOT|JUMP|RELOAD|NEXT/);
      await expect(page.locator('#aim-zone')).toBeVisible();
      await expect(page.locator('#touch-lift')).toBeHidden();
      if (upright) await expect(page.locator('#rotate-hint')).toBeVisible();
      else await expect(page.locator('#rotate-hint')).toBeHidden();
      const shown = await buttonsShown(page);
      const ids = shown.map((b) => b.id);
      for (const id of [...PAD_IDS, 'stick-rest', 'aim-rest', 'fullscreen']) expect(ids, id).toContain(id);
      await expect(page.locator('#tw-select')).toHaveText('');
      await expect(page.locator('#tw-start')).toHaveText('');
      // Browser adaptation: all 18 controls are below the complete game frame, with no overlap.
      const picture = (await page.locator('#view').boundingBox())!;
      for (const b of shown) {
        expect(b.x, b.id).toBeGreaterThanOrEqual(0);
        expect(b.y, b.id).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, b.id).toBeLessThanOrEqual(size.width);
        expect(b.y + b.height, b.id).toBeLessThanOrEqual(size.height);
        expect(Math.min(b.width, b.height), b.id).toBeGreaterThanOrEqual(36);
        if (b.id !== 'fullscreen') expect(b.y, `${b.id} clears the HUD`).toBeGreaterThanOrEqual(picture.y + picture.height - 1);
      }
      for (const [i, a] of shown.entries()) for (const b of shown.slice(i + 1)) expect(hit(a, b), `${a.id} over ${b.id}`).toBe(false);
      const fingers = new Fingers(await page.context().newCDPSession(page), page);
      await fingers.down(1, '#stick-zone');
      await expect(page.locator('#stick-base')).toBeVisible();
      await expect(page.locator('#tw-down.is-down, #tw-right.is-down')).toHaveCount(0);
      await fingers.up();
      await expect(page.locator('#stick-base')).toBeHidden();
    });
  });
}

test.describe('the dual sticks and the buttons, landscape', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: LANDSCAPE });

  test('the reference layout rotates within notch and home-indicator insets without overlapping controls', async ({ page }) => {
    await phone(page, LANDSCAPE);
    await page.evaluate(() => window.__viewer.setMode('walk'));
    for (const size of [
      { width: 844, height: 390, l: 47, r: 47, t: 0, b: 21 },
      { width: 390, height: 844, l: 0, r: 0, t: 47, b: 34 },
    ]) {
      await page.setViewportSize({ width: size.width, height: size.height });
      // Feed the same CSS variables normally supplied by env(safe-area-inset-*).
      await page.evaluate((s) => {
        for (const edge of ['l', 'r', 't', 'b'] as const) document.documentElement.style.setProperty(`--tw-${edge}`, `${s[edge]}px`);
      }, size);
      await expect(page.locator('#stick-rest')).toBeVisible();
      await expect(page.locator('#aim-rest')).toBeVisible();
      const shown = (await buttonsShown(page)).filter((b) => b.id !== 'fullscreen');
      expect(shown.length).toBeGreaterThanOrEqual(18);
      for (const b of shown) {
        expect(b.x, b.id).toBeGreaterThanOrEqual(size.l);
        expect(b.y, b.id).toBeGreaterThanOrEqual(size.t);
        expect(b.x + b.width, b.id).toBeLessThanOrEqual(size.width - size.r);
        expect(b.y + b.height, b.id).toBeLessThanOrEqual(size.height - size.b);
      }
      for (const [i, a] of shown.entries()) for (const b of shown.slice(i + 1)) expect(hit(a, b), `${a.id} over ${b.id}`).toBe(false);
    }
  });

  test('the left thumb moves and the right thumb looks, at once, each born where it lands', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await phone(page, LANDSCAPE);
    await page.evaluate(() => window.__viewer.setMode('walk'));
    await page.waitForTimeout(500);
    const fingers = new Fingers(await page.context().newCDPSession(page), page);
    const yaw0 = (await page.evaluate(() => window.__viewer.pose())).yaw;
    const feet0 = await page.evaluate(() => { const p = window.__viewer.pose(); return [p.x, p.z]; });

    const left = await centre(page, '#stick-zone'), right = await centre(page, '#aim-zone');
    await fingers.down(1, left);                                  // the left half: the move stick
    await expect(page.locator('#stick-base')).toBeVisible();
    const base = (await page.locator('#stick-base').boundingBox())!;
    expect(base.x + base.width / 2).toBeCloseTo(left.x, 0);
    expect(base.y + base.height / 2).toBeCloseTo(left.y, 0);
    await fingers.move(1, { x: left.x, y: left.y - 80 });                                  // pushed up: forward
    await fingers.down(2, right);                                  // the right half, a second finger: the look
    await expect(page.locator('#aim-base')).toBeVisible();
    await fingers.move(2, { x: right.x + 80, y: right.y });                                  // pushed right: turn right
    await expect.poll(async () => { const i = await input(page); return i.moveY > 0.9 && i.lookX > 0.9; }).toBe(true);
    await page.waitForTimeout(800);
    const yaw1 = (await page.evaluate(() => window.__viewer.pose())).yaw;
    expect(Math.abs(shortTurn(yaw0, yaw1)), 'the look stick turned the view').toBeGreaterThan(5);
    const feet1 = await page.evaluate(() => { const p = window.__viewer.pose(); return [p.x, p.z]; });
    expect(Math.hypot(feet1[0]! - feet0[0]!, feet1[1]! - feet0[1]!), 'the move stick walked').toBeGreaterThan(2);
    await fingers.up();
    await expect.poll(async () => { const i = await input(page); return [i.moveX, i.moveY, i.lookX, i.lookY]; }).toEqual([0, 0, 0, 0]);
    await expect(page.locator('#stick-base')).toBeHidden();
    await expect(page.locator('#aim-base')).toBeHidden();

    // A thumb that lands inside the dead zone and stays there moves nothing: the pad's dead zone.
    await fingers.down(1, left);
    await fingers.move(1, { x: left.x + 3, y: left.y - 2 });
    await page.waitForTimeout(100);
    expect((await input(page)).moveY).toBe(0);
    await fingers.up();
    expect(problems).toEqual([]);
  });

  test('releasing fire keeps both sticks held; each remaining finger releases independently', async ({ page }) => {
    await phone(page, LANDSCAPE);
    await page.evaluate(() => window.__viewer.setMode('walk'));
    const fingers = new Fingers(await page.context().newCDPSession(page), page);
    const left = await centre(page, '#stick-zone'), right = await centre(page, '#aim-zone');
    await fingers.down(1, left);
    await fingers.move(1, { x: left.x, y: left.y - 52 });
    await fingers.down(2, right);
    await fingers.move(2, { x: right.x + 52, y: right.y });
    await fingers.down(3, '#tw-r1');
    await expect.poll(async () => { const i = await input(page); return i.moveY > 0.9 && i.lookX > 0.9 && i.fire; }).toBe(true);
    await fingers.lift(3);
    await expect.poll(async () => { const i = await input(page); return i.moveY > 0.9 && i.lookX > 0.9 && !i.fire; }).toBe(true);
    await fingers.lift(1);
    await expect.poll(async () => { const i = await input(page); return i.moveY === 0 && i.lookX > 0.9 && !i.fire; }).toBe(true);
    await fingers.lift(2);
    await expect.poll(async () => { const i = await input(page); return [i.moveX, i.moveY, i.lookX, i.lookY, i.fire]; }).toEqual([0, 0, 0, 0, false]);
  });

  test('R1 and Square hold their lanes (fire, jump), together, and a stick starting on a button is no stick', async ({ page }) => {
    await phone(page, LANDSCAPE);
    await page.evaluate(() => window.__viewer.setMode('walk'));
    await page.waitForTimeout(500);
    const fingers = new Fingers(await page.context().newCDPSession(page), page);
    const shots = (): Promise<number> => page.evaluate(() => window.__viewer.fire().shots);
    const s0 = await shots();
    await fingers.down(1, '#tw-r1');
    await expect.poll(async () => (await input(page)).fire).toBe(true);
    await expect.poll(shots).toBeGreaterThan(s0);
    await expect(page.locator('#aim-base')).toBeHidden();                       // a button press starts no stick
    await fingers.down(2, '#tw-square');
    await expect.poll(async () => { const i = await input(page); return i.fire && i.jump; }).toBe(true);
    await fingers.up();
    await expect.poll(async () => (await input(page)).fire).toBe(false);
    await expect.poll(() => page.evaluate(() => window.__viewer.mover()!.airborne), { timeout: 3000 }).toBe(false);

    // A look stick dragged across R1 presses nothing.
    const s1 = await shots();
    const fire = (await page.locator('#tw-r1').boundingBox())!;
    await fingers.down(1, '#aim-zone');
    await fingers.move(1, { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 });
    await page.waitForTimeout(300);
    expect((await input(page)).fire).toBe(false);
    expect(await shots()).toBe(s1);
    await fingers.up();
  });

  test('the other buttons as the pad\'s: Triangle the stance, Cross the action, the D-pad the zoom, R2 the item menu, R3 the reload', async ({ page }) => {
    await phone(page, LANDSCAPE);
    await page.evaluate(() => window.__viewer.setMode('walk'));
    await page.waitForTimeout(500);
    const fingers = new Fingers(await page.context().newCDPSession(page), page);
    const stance = (): Promise<string> => page.evaluate(() => window.__viewer.stance());
    // How long the page saw each press (its pointerdown to its pointerup): the 100 ms tap is the harness's, and on a
    // loaded host the lift reached the page late enough to be a hold -- prone, rightly (the 2026-10-01 run). The rule is
    // judged on the press the page saw: under 0.2 s a tap, from the hold's 0.4 s a hold (`STANCE_HOLD_S_PLACEHOLDER`).
    await page.evaluate(() => {
      const w = window as unknown as { __pressMs: number[] };
      w.__pressMs = [];
      let at = 0;
      document.addEventListener('pointerdown', (e) => { if ((e.target as Element).closest?.('#tw-triangle')) at = e.timeStamp; }, true);
      document.addEventListener('pointerup', (e) => { if (at) { w.__pressMs.push(e.timeStamp - at); at = 0; } }, true);
    });
    const pressed = async (): Promise<number> => page.evaluate(() => (window as unknown as { __pressMs: number[] }).__pressMs.at(-1) ?? NaN);
    const tapped = async (want: string): Promise<void> => {
      await fingers.tap(1, '#tw-triangle', 100);
      await expect.poll(async () => Number.isFinite(await pressed())).toBe(true);
      const ms = await pressed();
      if (ms < 200) await expect.poll(stance).toBe(want);
      else if (ms >= 400) await expect.poll(stance).toBe('prone');
      else await expect.poll(async () => [want, 'prone'].includes(await stance())).toBe(true);
    };
    await tapped('crouch');
    if ((await stance()) === 'crouch') await tapped('stand');
    await fingers.down(1, '#tw-cross');
    await expect.poll(async () => (await input(page)).action).toBe(true);
    await fingers.up(1);
    const zoom = (): Promise<number> => page.evaluate(() => window.__viewer.zoom().state);
    const z0 = await zoom();
    await fingers.tap(1, '#tw-up', 1);
    await expect.poll(zoom).toBeGreaterThan(z0);
    await fingers.tap(1, '#tw-down', 60);
    await expect.poll(zoom).toBe(z0);
    const item = (): Promise<string> => page.evaluate(() => window.__viewer.hud().model.weaponIcon);
    const rifle = await item();
    // R2: the item menu (`./inventoryMenu`); the D-pad's up and down step it, R2 again takes the slot up.
    await fingers.tap(1, '#tw-r2', 60);
    await expect.poll(() => page.evaluate(() => window.__viewer.inventory().open)).toBe(true);
    await fingers.tap(1, '#tw-up', 60);
    await expect.poll(() => page.evaluate(() => window.__viewer.inventory().slot)).toBe(1);
    expect(await zoom()).toBe(z0);                                     // the menu's, not the zoom's
    await fingers.tap(1, '#tw-r2', 60);
    await expect.poll(item, { timeout: 5000 }).not.toBe(rifle);
    await page.waitForTimeout(1500);
    await fingers.tap(1, '#tw-r2', 60);
    await fingers.tap(1, '#tw-down', 60);
    await fingers.tap(1, '#tw-r2', 60);
    await expect.poll(item, { timeout: 5000 }).toBe(rifle);
    await fingers.tap(1, '#tw-r3');
    await expect.poll(() => page.evaluate(() => window.__viewer.fire().magazine.reloading), { timeout: 3000 }).toBe(true);
  });

  test('a pad connecting hides the touch layer and drives the walk; its leaving brings the layer back', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __pad: unknown };
      w.__pad = null;
      Object.defineProperty(navigator, 'getGamepads', { value: () => [w.__pad] });
    });
    await phone(page, LANDSCAPE);
    await page.evaluate(() => window.__viewer.setMode('walk'));
    await expect(page.locator('#tw-r1')).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __pad: unknown }).__pad = {
        id: 'Test pad', index: 0, connected: true, mapping: 'standard', axes: [0, -1, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      };
    });
    // Never assert visibility on `#touch` itself: it is a zero-size box (its sticks and buttons are fixed-position
    // children), so Playwright reads it hidden whether the layer shows or not. The switch is `pad-on` on the layer's root,
    // here the body (`src/styles.css`: `.touch.pad-on #touch { display: none }`; FI.R4: the pad the game reads is a
    // connected one), and a control inside the layer shows it.
    await expect(page.locator('body')).toHaveClass(/(^|\s)pad-on(\s|$)/);
    await expect(page.locator('#tw-r1')).toBeHidden();
    await expect(page.locator('#touch')).toHaveAttribute('inert', '');
    await expect.poll(async () => (await input(page)).moveY).toBe(1);
    await page.evaluate(() => { (window as unknown as { __pad: unknown }).__pad = null; });
    await expect(page.locator('body')).not.toHaveClass(/(^|\s)pad-on(\s|$)/);
    await expect(page.locator('#tw-r1')).toBeVisible();
  });
});

/** The offline match's map (`weaponExchange.spec.ts`'s route): Frostfire in the fixtures. */
const HAVE_MP2 = existsSync(join(fileURLToPath(new URL('../../..', import.meta.url)), 'test-fixtures', 'RUN', 'MP2.ZDB'));

test.describe('WEAPON EXCHANGE on a phone (PAR-5a), landscape', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: LANDSCAPE });

  /**
   * The route to an open menu's gate (`weaponExchange.spec.ts`'s), shared by this describe's cases: `/testroom`'s offline
   * match on Frostfire, walking on the phone, the SEAL killed by its own grenade -- dead, the camera on self.
   */
  async function deadWalkingOnPhone(page: Page, menu: () => Promise<{ gate: { inMatch: boolean; alive: boolean; cameraOnSelf: boolean; spectator: boolean } }>): Promise<void> {
    // The route to an open menu (`weaponExchange.spec.ts`'s): `/testroom`'s offline match on Frostfire (the page's own
    // room, `../src/net/loopback`), the SEAL killed by its own grenade -- the gate (`canOpen`: in the match, dead, the
    // camera on self, no spectator) -- then INV, the touch button (WEAPON_SELECT_TOUCH_READING).
    await page.setViewportSize(LANDSCAPE);
    await page.goto(`${TEST_ROOM}?map=MP2&mode=play&devmode&noarmory&kit=62,15,121,126,255`);
    await expect(page.locator('#status')).toContainText('FROSTFIRE (MP2)', { timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => window.__viewer.net?.()?.state ?? null), { timeout: 30_000 }).toBe('open');
    await expect.poll(() => page.evaluate(() => window.__viewer.feet()), { timeout: 30_000 }).not.toBeNull();
    await holdReleased(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() => document.getElementById('mobile-tip-close')?.click());
    await page.addStyleTag({ content: '#playtest-overlay { display: none !important; }' });   // `phone`'s: a developer's instrument
    await page.evaluate(() => window.__viewer.setMode('walk'));
    // Walking on a touch screen: the two zones are up over the window below the bar -- the case F1 was found in.
    await expect(page.locator('body')).toHaveClass(/(^|\s)is-walking(\s|$)/);
    await expect(page.locator('#stick-zone')).toBeVisible();
    await expect(page.locator('#aim-zone')).toBeVisible();

    for (let i = 0; i < 4 && (await page.evaluate(() => window.__viewer.hud().model.health)) > 0; i++) {
      // Four 60 Hz ticks' hold (power .185): the weakest lob the release request takes (PAR-20 D10, research 256 s1).
      await page.evaluate(() => window.__viewer.throwGrenade(4 / 60, true));
      await expect.poll(async () => (await menu()).gate.alive, { timeout: 8_000 }).toBe(false).catch(() => undefined);
    }
    await expect.poll(async () => (await menu()).gate, { timeout: 10_000 }).toMatchObject({ inMatch: true, alive: false, cameraOnSelf: true, spectator: false });
    await expect(page.locator('body')).toHaveClass(/(^|\s)is-walking(\s|$)/);
  }

  test("walking and dead: INV opens the menu, and a finger on a row reaches it through the stick zones", async ({ page }) => {
    test.skip(!HAVE_MP2, 'needs the fixtures (npm run extract-maps)');
    test.setTimeout(240_000);
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    const menu = () => page.evaluate(() => window.__viewer.weaponSelect());
    await deadWalkingOnPhone(page, menu);

    const fingers = new Fingers(await page.context().newCDPSession(page), page);
    await expect.poll(async () => (await menu()).touchButton).toBe(true);
    await fingers.tap(1, '#tw-weapons', 60);
    await expect.poll(async () => (await menu()).screen).toBe('list');
    expect((await menu()).slot).toBe(0);
    // The menu open: the part's class on the body, and the zones take no pointer (`styles.css`, research 222 §11.4).
    await expect(page.locator('body')).toHaveClass(/(^|\s)is-exchange-open(\s|$)/);
    await expect(page.locator('#stick-zone')).toHaveCSS('pointer-events', 'none');
    await expect(page.locator('#aim-zone')).toHaveCSS('pointer-events', 'none');

    // The third row's bar (LIST_LAYOUT.bar, i = 2: the first equipment slot, `weaponExchange.spec.ts`'s) at its centre, on
    // the canvas's box as `exchangeTaps` reads it -- `frameOfPoint` (`../src/weaponExchange`) undone: s = height / 448,
    // x = (fx - 320) s + width / 2, y = fy s. In the left half below the bar: where `#stick-zone` lay.
    const box = (await page.locator('#view').boundingBox())!;
    const s = box.height / 448;
    const bar = LIST_LAYOUT.bar;
    const fx = bar.x + bar.w / 2, fy = bar.y + bar.pitch * 2 + bar.h / 2;
    const at = { x: box.x + (fx - 320) * s + box.width / 2, y: box.y + fy * s };
    expect(at.x, 'the row is in the left half (the move zone)').toBeLessThan(LANDSCAPE.width / 2);
    expect(at.y, 'the row is below the top strip').toBeGreaterThan(56);
    // The element a finger reaches there is the canvas (before PAR-5a: `stick-zone`).
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.id ?? null, [at.x, at.y])).toBe('view');
    await fingers.down(1, at);
    await page.waitForTimeout(60);
    await fingers.up(1);
    // The tap is the row's (`menuTap`): the cursor stepped to it and Action -- its picker open on that slot.
    await expect.poll(async () => { const m = await menu(); return [m.screen, m.slot]; }, { timeout: 5_000 }).toEqual(['picker', 2]);
    await expect(page.locator('#stick-base')).toBeHidden();                       // no stick started under the menu
    expect((await page.evaluate(() => window.__viewer.pad().input)).moveX).toBe(0);
    expect(problems).toEqual([]);
  });

  test("a stick held while INV opens the menu lets go when its finger lifts under the menu (pointer capture; the review's F1)", async ({ page }) => {
    test.skip(!HAVE_MP2, 'needs the fixtures (npm run extract-maps)');
    test.setTimeout(240_000);
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    const menu = () => page.evaluate(() => window.__viewer.weaponSelect());
    await deadWalkingOnPhone(page, menu);
    const fingers = new Fingers(await page.context().newCDPSession(page), page);
    await expect.poll(async () => (await menu()).touchButton).toBe(true);
    // Finger 2 starts on the visible move stick in the bottom strip.
    const hold = await centre(page, '#stick-zone');
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.id ?? null, [hold.x, hold.y])).toBe('stick-zone');
    await fingers.down(2, hold);
    await fingers.move(2, { x: hold.x + 40, y: hold.y });
    await expect(page.locator('#stick-base')).toBeVisible();
    // Finger 1 taps INV while finger 2 holds: the menu opens and the zones yield (`is-exchange-open`).
    await fingers.down(1, '#tw-weapons');
    await page.waitForTimeout(60);
    await fingers.lift(1);
    await expect.poll(async () => (await menu()).screen).toBe('list');
    await expect(page.locator('body')).toHaveClass(/(^|\s)is-exchange-open(\s|$)/);
    await expect(page.locator('#stick-zone')).toHaveCSS('pointer-events', 'none');
    // Finger 2 lifts under the open menu: the captured pointer still ends the stick (`touch.ts` `wire`'s pointerup).
    await fingers.lift(2);
    await expect(page.locator('#stick-base')).toBeHidden();
    // The menu closed (INV again): nothing walks.
    await fingers.tap(1, '#tw-weapons', 60);
    await expect.poll(async () => (await menu()).screen).toBe('closed');
    await expect(page.locator('body')).not.toHaveClass(/(^|\s)is-exchange-open(\s|$)/);
    await page.waitForTimeout(300);
    expect((await page.evaluate(() => window.__viewer.pad().input)).moveX).toBe(0);
    await expect(page.locator('#stick-base')).toBeHidden();
    expect(problems).toEqual([]);
  });
});

test.describe('the tip on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: LANDSCAPE });

  test('recommends a controller and landscape once a visit, and a dismissal is remembered', async ({ page }) => {
    await page.setViewportSize(LANDSCAPE);
    // The kit these pins were measured on: the M4A1 SD, the Mark 23, the M67 and the HE, no 2X (W2.R4's), by the
    // developer's `&kit=` (README; the default spawn is the map's type's kit since web sprint 4).
    await page.goto(`${TEST_ROOM}?mode=play&fly&devmode&kit=62,15,121,126,255`);
    const tip = page.locator('#mobile-tip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/controller/i);
    await expect(tip).toContainText(/landscape/i);
    await page.reload();                                                        // the same visit: not again
    await expect(page.locator('#status')).toContainText(/triangles|tris/);
    await expect(tip).toBeHidden();
    await page.setViewportSize(PORTRAIT);                                       // a turn to portrait: again
    await expect(tip).toBeVisible();
    await page.locator('#mobile-tip-close').click();
    await expect(tip).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('s2u.viewer.mobileTipDismissed'))).toBe('1');
    await page.setViewportSize(LANDSCAPE);
    await page.setViewportSize(PORTRAIT);
    await page.waitForTimeout(200);
    await expect(tip).toBeHidden();
  });

  test('is not shown on a desktop', async ({ browser }) => {
    const context = opened.add(await browser.newContext({ viewport: { width: 1280, height: 720 } }));
    const page = await context.newPage();
    // The kit these pins were measured on: the M4A1 SD, the Mark 23, the M67 and the HE, no 2X (W2.R4's), by the
    // developer's `&kit=` (README; the default spawn is the map's type's kit since web sprint 4).
    await page.goto(`${TEST_ROOM}?mode=play&fly&devmode&kit=62,15,121,126,255`);
    await expect(page.locator('#status')).toContainText(/triangles|tris/);
    await expect(page.locator('#mobile-tip')).toBeHidden();
  });
});

test.describe('walk mode on a phone, portrait', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: PORTRAIT });

  test('asks for a turn while walking (the layout itself is checked upright above, at 360x640, 375x812 and 412x915)', async ({ page }) => {
    await phone(page, PORTRAIT);
    await expect(page.locator('#rotate-hint')).toBeHidden();                      // flying: no ask
    await page.evaluate(() => window.__viewer.setMode('walk'));
    await expect(page.locator('#rotate-hint')).toBeVisible();
    await expect(page.locator('#rotate-hint')).toContainText('sideways');
    await expect(page.locator('#tw-r1')).toBeVisible();
    const hint = (await page.locator('#rotate-hint').boundingBox())!;
    for (const b of await buttonsShown(page)) expect(hit(hint, b), `the hint over #${b.id}`).toBe(false);
    await page.evaluate(() => window.__viewer.setMode('fly'));
    await expect(page.locator('#rotate-hint')).toBeHidden();
  });
});

test.describe('in Explore (no mode=play)', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: LANDSCAPE });

  test('the phone has no walk layout, no look stick, no hint, and the fly touch UI as it was', async ({ page }) => {
    await page.goto(`${TEST_ROOM}?devmode`);
    await expect(page.locator('#status')).toContainText(/triangles|tris/);
    for (const id of ['touch-walk', 'rotate-hint', 'tw-r1', 'tw-square', 'aim-zone']) await expect(page.locator(`#${id}`)).toHaveCount(0);
    await expect(page.locator('#touch-lift')).toBeVisible();
    expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(false);
  });
});
