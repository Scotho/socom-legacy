// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountOverlay, type Overlay } from '../../src/modern/overlay/index';
import { CATS, homeItems } from '../../src/console/state';
import type { PadLike } from '../../src/gamepad';
import { fakeLauncher, fakeSession, settle } from './lobbies/fixtures';
import { onOverlayFrame } from './overlayFrame';

/**
 * MU2-8 (the modern UI polish plan, row MU2-8; the first plan's MU-8, the polish pass's focus and keyboard order; MU.R18)
 * as OVERLAY-CONSOLE has it (CX.R13, OT.R60): the overlay draws the console, so the case that walked the retired shell's
 * tabs and sections walks the console's crossbar and lists in their place. With each category current, Down walks its
 * actions top-down -- every stop after the one before in the page's order -- with one visible focus (the console's
 * `is-focused`, which is the document's focus in pad mode) and the walk never trapped: past the last action it stays
 * there (the console's lists end, the design's), R1 moves on to the next category, and Circle at the top goes back to the
 * game. Signed out and signed in, the overlay's own document.
 */
const offline = (async () => new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
const CIRCLE = 1, L1 = 4, R1 = 5, DOWN = 13;
interface FakePad extends PadLike { buttons: { pressed: boolean; value: number; touched: boolean }[]; axes: number[] }
const fakePad = (): FakePad => ({
  id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
} as FakePad);

let overlay: Overlay | null = null;
let pad: FakePad;
beforeEach(() => { vi.stubGlobal('fetch', offline); document.body.innerHTML = '<canvas id="front-end"></canvas>'; pad = fakePad(); });
afterEach(() => { overlay?.dispose(); overlay = null; vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

async function open(state: 'signed-out' | 'signed-in') {
  let t = 1000;
  // OT.R60 (e): the transition completes at once here (`motion: false`); its hand-over of the pad is test/modern/overlayMotion.test.ts's.
  overlay = mountOverlay(document, { nav: { getGamepads: () => [pad] }, session: fakeSession(state), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {}, now: () => t, motion: false })!;
  // The frame is made at the first open (the closed overlay is inert): jsdom's missing scrollIntoView is fitted as the
  // frame is put on the page, before the console's first draw (`./overlayFrame`), and the frame read after the open.
  onOverlayFrame((d) => { (d.defaultView as Window & typeof globalThis).HTMLElement.prototype.scrollIntoView = vi.fn(); });
  overlay.open();
  const inner = document.querySelector('iframe')!.contentDocument!;
  await settle();
  const step = (down: number[] = []): void => { t += 16; pad.buttons.forEach((b, i) => { b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; b.touched = b.pressed; }); overlay!.poll(); };
  step(); step();
  return { inner, press: (b: number): void => { step(); step([b]); step(); }, active: (): HTMLElement => inner.activeElement as HTMLElement };
}

describe('the overlay\'s focus order on the pad: top-down, one visible focus, nothing trapped (MU2-8; OVERLAY-CONSOLE)', () => {
  for (const state of ['signed-out', 'signed-in'] as const) {
    it.each(CATS.map((c) => c.id))(`${state}: %s`, async (id) => {
      const o = await open(state);
      const ctl = overlay!.console()!.ctl;
      const target = CATS.findIndex((c) => c.id === id);
      for (let n = 0; n < CATS.length && ctl.S.cat !== target; n++) o.press(ctl.S.cat < target ? R1 : L1);
      expect(CATS[ctl.S.cat]!.id).toBe(id);
      const items = homeItems(id, ctl.S, ctl.A).length;
      expect(items).toBeGreaterThan(0);
      const stops: HTMLElement[] = [];
      const ringed = (): HTMLElement[] => {
        // LATER 291: above the phone rule Home's Discord stop is the header icon, the one visible ring.
        const head = [...o.inner.querySelectorAll<HTMLElement>('#header .cx-discord.is-focused')];
        return head.length ? head : [...o.inner.querySelectorAll<HTMLElement>('#stage .cx-list .is-focused')];
      };
      for (let n = 0; n < items + 2; n++) {
        const at = ringed();
        expect(at.length, `one visible focus at stop ${n}`).toBe(1);
        expect(o.active(), `the document's focus on it at stop ${n}`).toBe(at[0]);
        if (stops.at(-1) !== at[0]) stops.push(at[0]!);
        o.press(DOWN);
      }
      expect(stops.length, 'every action reached').toBe(items);
      // Top-down: each stop follows the one before in the page's order. The desktop Discord icon sits in the
      // header and is still Home's last action, reached after the list.
      for (let i = 1; i < stops.length; i++) {
        const cur = stops[i]!;
        if (cur.classList.contains('cx-discord')) {
          expect(i, 'the header icon is Home\'s last stop').toBe(stops.length - 1);
          continue;
        }
        const following = stops[i - 1]!.compareDocumentPosition(cur) & Node.DOCUMENT_POSITION_FOLLOWING;
        expect(following, `${stops[i - 1]!.outerHTML.slice(0, 80)} then ${cur.outerHTML.slice(0, 80)}`).toBeTruthy();
      }
      // Nothing trapped: an adjacent category is a shoulder away; at the last category the rail steps left.
      const next = target < CATS.length - 1 ? target + 1 : target - 1;
      o.press(next > target ? R1 : L1);
      expect(ctl.S.cat).toBe(next);
      o.press(CIRCLE);
      expect(overlay!.isOpen()).toBe(false);
    });
  }
});
