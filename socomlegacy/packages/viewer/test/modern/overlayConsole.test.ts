// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountOverlay, OVERLAY_CONSOLE_BODY, OVERLAY_CONSOLE_SHEET, type Overlay } from '../../src/modern/overlay/index';
import { OVERLAY_BUTTON_KEY, readOverlayButton } from '../../src/modern/overlay/binding';
import { OVERLAY_BUTTON_ROW, liveOptions, overlayButtonChoices } from '../../src/console/adapters/options';
import { serverItems } from '../../src/console/state';
import type { PadLike } from '../../src/gamepad';
import { fakeLauncher, fakeSession, settle } from './lobbies/fixtures';
import { onOverlayFrame } from './overlayFrame';

/**
 * OVERLAY-CONSOLE (the console launcher plan; CX.R13, MU2.R10, MISSION's OT.R60): the overlay mounts the console launcher
 * in its frame, in overlay mode, over `overlayAdapters` -- the console's markup (`index.html`'s body regions) and its own
 * sheet in the frame's document, its pad on the real pads on the overlay's toggle frame while open and only then (the
 * game reading the pad untouched meanwhile, MU2.R3), the Report as Server's "Report a problem" row, and the overlay's
 * opening button chosen on Options > Controller (MU2-16, now that the retired shell's Settings page is not reached). A
 * browser adaptation with no original (OT.R28).
 */
const here = dirname(fileURLToPath(import.meta.url));
const VIEWER = resolve(here, '../..');
const offline = (async () => new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
const CROSS = 0, DOWN = 13;

interface FakePad extends PadLike { buttons: { pressed: boolean; value: number; touched: boolean }[]; axes: number[] }
const fakePad = (): FakePad => ({
  id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
} as FakePad);

let overlay: Overlay | null = null;
let pad: FakePad;
let nav: { getGamepads(): ArrayLike<PadLike | null> };
let t = 1000;
beforeEach(() => {
  vi.stubGlobal('fetch', offline);
  document.body.innerHTML = '<canvas id="front-end"></canvas>';
  pad = fakePad();
  nav = { getGamepads: () => [pad] };
  t = 1000;
  localStorage.clear();
});
afterEach(() => { overlay?.dispose(); overlay = null; vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; localStorage.clear(); });

// OT.R60 (e): the transition completes at once here (`motion: false`); its hand-over of the pad is test/modern/overlayMotion.test.ts's.
const mount = (): Overlay =>
  (overlay = mountOverlay(document, { nav, session: fakeSession('signed-out'), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {}, now: () => t, motion: false }));
const inner = (): Document => document.querySelector('iframe')!.contentDocument!;
const step = (down: number[] = []): void => {
  t += 16;
  pad.buttons.forEach((b, i) => { b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; b.touched = b.pressed; });
  overlay!.poll();
};

describe('OVERLAY-CONSOLE: the console in the overlay\'s frame', () => {
  it('the markup is the console page\'s own body regions (index.html), ids and classes alike', () => {
    const page = new DOMParser().parseFromString(readFileSync(resolve(VIEWER, 'index.html'), 'utf8'), 'text/html').body;
    const ours = new DOMParser().parseFromString(`<body>${OVERLAY_CONSOLE_BODY}</body>`, 'text/html').body;
    const shape = (b: HTMLElement): string[] => [...b.querySelectorAll('*')].filter((e) => e.tagName !== 'SCRIPT').map((e) => `${e.tagName}#${e.id}.${e.className}`);
    expect(shape(ours)).toEqual(shape(page));
  });

  it('open: the console booted in overlay mode in the frame\'s document, under its own mark and with its own sheet; the page is not marked', async () => {
    const o = mount();
    expect(o.console()).toBeNull();
    o.open();
    await settle();
    const page = o.console()!;
    expect(page.ctl.S.mode).toBe('overlay');
    expect(inner().documentElement.hasAttribute('data-console')).toBe(true);
    expect(document.documentElement.hasAttribute('data-console')).toBe(false);
    expect(inner().querySelector('link[data-overlay-console-sheet]')!.getAttribute('href')).toBe(OVERLAY_CONSOLE_SHEET);
    expect(readFileSync(resolve(VIEWER, 'src/modern/overlay/index.ts'), 'utf8')).toContain("import CONSOLE_SHEET from '../../console/console.css?url';");
    expect(inner().querySelector('#stage .cx-crossbar')).not.toBeNull();
    o.close();
    expect(o.console()).toBeNull();
    expect(inner().querySelector('.cx-app')).toBeNull();                 // taken down at the close
  });

  it('the console\'s pad reads the real pads on the toggle\'s frame while the game reads them untouched; closed, it reads nothing', async () => {
    const o = mount();
    o.open();
    await settle();
    step(); step();
    const S = o.console()!.ctl.S;
    step([DOWN]);
    expect(nav.getGamepads()[0]!.buttons.some((b) => b.pressed)).toBe(false);   // the game's read: untouched
    step();
    expect(S.item[S.cat]).toBe(1);                                                // the console's: the real pad
    step([CROSS]);
    o.close();                                                                    // Cross held through the close
    expect(o.console()).toBeNull();
    step([CROSS]);
    expect(nav.getGamepads()[0]!.buttons[CROSS]!.pressed).toBe(false);           // held through the close: released to the game
    step();
    step([CROSS]);
    expect(nav.getGamepads()[0]!.buttons[CROSS]!.pressed).toBe(true);            // a new press is the game's
  });

  it('the console\'s pad runs only on the overlay\'s frame: the frame\'s own animation frames never poll it', async () => {
    const o = mount();
    // The frame is made at the first open (OVERLAY-CONSOLE's landing gate): its window spied as it is made.
    const spied: { raf: { mock: { calls: unknown[] } } | null } = { raf: null };
    onOverlayFrame((d) => { spied.raf = vi.spyOn(d.defaultView!, 'requestAnimationFrame'); });
    o.open();
    const raf = spied.raf;
    expect(raf).not.toBeNull();
    await settle();
    expect(raf).not.toHaveBeenCalled();
  });

  it('the Report is the Server screen\'s last row, "Report a problem"; its pad\'s Circle closes it, no press reaching the console', async () => {
    const o = mount();
    o.open();
    await settle();
    const page = o.console()!;
    page.ctl.doAct('server');
    const rows = serverItems(page.ctl.A);
    expect(rows.at(-1)).toMatchObject({ title: 'Report a problem', act: 'report' });
    page.ctl.S.sv.row = rows.length - 1;
    page.render();
    step(); step();
    step([CROSS]); step();
    const dialog = inner().querySelector<HTMLElement>('.mu-overlay__report-host [role="dialog"]')!;
    expect(dialog.hidden).toBe(false);
    step([DOWN]); step();
    expect(page.ctl.S.sv.row).toBe(rows.length - 1);              // the console stood down under it
    step([1]); step();
    expect(dialog.hidden).toBe(true);
    expect(o.isOpen()).toBe(true);
  });
});

describe("OVERLAY-CONSOLE: the opening button on the console's Options > Controller (MU2-16, OT.R51)", () => {
  it("a roller of Home first, the standard mapping's buttons, then the touchpad; a step saves the binding the overlay follows", async () => {
    const o = mount();
    o.open();
    await settle();
    const options = o.console()!.ctl.A.options;
    const row = options.categories().find((c) => c.id === 'controller')!.rows.find((r) => r.id === OVERLAY_BUTTON_ROW)!;
    const choices = overlayButtonChoices(16);
    expect(choices[0]).toBe(16);
    expect(choices.slice(1, 17)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(choices.at(-1)).toBe(17);
    expect(row.values![0]).toBe('Home (PS / Xbox Guide)');
    expect(row.values!.length).toBe(choices.length);
    expect(row.def).toBe(0);
    expect(options.value(OVERLAY_BUTTON_ROW)).toBe(0);
    options.set(OVERLAY_BUTTON_ROW, choices.indexOf(10));                         // L3
    expect(localStorage.getItem(OVERLAY_BUTTON_KEY)).toBe('10');
    expect(readOverlayButton()).toBe(10);
    expect(inner().querySelector('[data-overlay-close]')!.textContent).toContain('L3');   // followed at once (review F3)
    expect(options.value(OVERLAY_BUTTON_ROW)).toBe(choices.indexOf(10));
    options.reset(OVERLAY_BUTTON_ROW);
    expect(readOverlayButton()).toBe(16);
  });

  it("the launcher page's Options have no such row: nothing under src/console loads the overlay's binding (the seam test's rule)", () => {
    const options = liveOptions(() => {}, { signedIn: () => false });
    expect(options.categories().find((c) => c.id === 'controller')!.rows.some((r) => r.id === OVERLAY_BUTTON_ROW)).toBe(false);
    options.dispose();
  });
});
