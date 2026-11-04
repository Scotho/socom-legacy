// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveReplays } from '../../src/console/adapters/replays';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import { replaysOf, type ReplayListSource } from '../../src/modern/replays/data';
import { fakeSession } from '../modern/lobbies/fixtures';
import { mountShell } from './shell';

/**
 * OVERLAY-CONSOLE fold 2 (the seat's browser run, `modernReplays.spec.ts:123`): Square on the console's replays list
 * (Refresh) asks the list again and keeps the focus on its row -- by the pad as by the development build's keyboard, in
 * the overlay's console as on the launcher page. The run found the pad's Square putting the focus back on the first row;
 * the cause is not the pad's route: the refresh empties the list while it is read again (the view `loading`), and the
 * draw's clamp (`../../src/console/state` `normalize`) put the row at 0 then, on either route -- the keyboard's case in
 * the spec pressed F on the first row, where the clamp changes nothing. The focus now waits through the reading and
 * follows its replay by id once the list is back. Generated values only. A browser adaptation with no original (OT.R28).
 */
const pad = () => ({
  index: 0, id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })),
});
type Pad = ReturnType<typeof pad>;
const DOWN = 13;
const SQUARE = 2;

let page: ConsolePage | null = null;
let pads: Pad[] = [];
let t = 10_000;
let frame: ((now: number) => void) | null = null;
const realRaf = window.requestAnimationFrame;
const realCaf = window.cancelAnimationFrame;
beforeEach(() => {
  vi.useFakeTimers();
  mountShell(document);
  pads = [];
  t = 10_000;
  frame = null;
  // The page's frame by hand: the console's pad poll is run one frame at a time (`tick`).
  window.requestAnimationFrame = ((cb: (now: number) => void) => { frame = cb; return 1; }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => { frame = null; }) as typeof window.cancelAnimationFrame;
  Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
});
afterEach(() => {
  page?.dispose(); page = null;
  window.requestAnimationFrame = realRaf;
  window.cancelAnimationFrame = realCaf;
  vi.useRealTimers();
});
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(10); };
/** One frame of the page's pad poll at the next clock tick. */
const tick = (): void => { t += 16; const f = frame; frame = null; f?.(t); };
/** A press of `button` on the pad: down for a frame, then up for a frame. */
const tap = (p: Pad, button: number): void => {
  p.buttons[button]!.pressed = true; p.buttons[button]!.value = 1; tick();
  p.buttons[button]!.pressed = false; p.buttons[button]!.value = 0; tick();
};
const key = (k: string): void => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); };

/** The `n`th replay (0 the newest of the first answer; a negative `n` newer still): a 16-hex id, a minute apart. */
const id = (n: number): string => (n + 16).toString(16).padStart(16, '0');
const entry = (n: number): Record<string, unknown> => ({
  id: id(n), room: 'MP2/classic', map: 'MP2', rules: 'classic',
  startedAt: new Date(Date.UTC(2026, 9, 1, 12, 0) - n * 60_000).toISOString(), seconds: 60, players: [{ name: 'Alpha', team: 'seal' }],
});

/** A source answering each list in turn from `answers` (the last one again once they run out). */
function source(...answers: number[][]): ReplayListSource & { list: ReturnType<typeof vi.fn> } {
  let at = 0;
  return { list: vi.fn(async () => replaysOf({ replays: answers[Math.min(at++, answers.length - 1)]!.map(entry) })) };
}

function boot(src: ReplayListSource, mode: 'page' | 'overlay') {
  const p = pad();
  pads = [p];
  const session = fakeSession('signed-in');
  const replays = liveReplays(() => { page?.render(); }, { source: src, session });
  const sample = sampleAdapters();
  const A: Adapters = {
    ...sample, data: 'live', states: undefined, replays,
    session: { ...sample.session, signedIn: () => session.state() === 'signed-in' },
  };
  page = bootConsole(document, window, A, mode === 'overlay'
    ? { keymap: true, mode, page: { gameHolds: () => false, roundRunning: () => false, gamePage: () => true }, close: () => undefined }
    : { keymap: true });
  tick();                                                                   // the pad seen, nothing held
  return { ctl: page.ctl, p };
}

/** Profile (L1 twice, LR.R2), then its Replays action: the list's first row focused. */
async function toList(ctl: ConsolePage['ctl']): Promise<void> {
  ctl.press('l1');
  ctl.press('l1');
  ctl.press('down');
  await flush();
  ctl.press('cross');
  expect(ctl.S.screen).toBe('replays');
}
const focusedId = (): string | undefined => document.querySelector<HTMLElement>('#stage .cx-room.is-focused')?.dataset['fk']?.replace('replay-', '');

describe('Square (Refresh) on the replays list keeps the focus on its row', () => {
  it.each(['page', 'overlay'] as const)('%s mode, the pad: Down to the second row, Square -- the list asked again, the focus still there', async (mode) => {
    const src = source([0, 1]);
    const { ctl, p } = boot(src, mode);
    await toList(ctl);
    expect(focusedId()).toBe(id(0));
    tap(p, DOWN);
    expect(focusedId()).toBe(id(1));
    tap(p, SQUARE);
    expect(src.list).toHaveBeenCalledTimes(2);
    await flush();
    expect(document.querySelectorAll('#stage .cx-room')).toHaveLength(2);
    expect(ctl.S.rp.row).toBe(1);
    expect(focusedId()).toBe(id(1));
  });

  it.each(['page', 'overlay'] as const)('%s mode, the development build\'s keyboard: Down, then F -- the same', async (mode) => {
    const src = source([0, 1]);
    const { ctl } = boot(src, mode);
    await toList(ctl);
    key('ArrowDown');
    expect(focusedId()).toBe(id(1));
    key('f');
    expect(src.list).toHaveBeenCalledTimes(2);
    await flush();
    expect(ctl.S.rp.row).toBe(1);
    expect(focusedId()).toBe(id(1));
  });

  it('the focus follows its replay by id: a newer one listed first by the refresh, the focus on the same replay', async () => {
    const src = source([0, 1], [-1, 0, 1]);
    const { ctl, p } = boot(src, 'page');
    await toList(ctl);
    tap(p, DOWN);
    expect(focusedId()).toBe(id(1));
    tap(p, SQUARE);
    await flush();
    expect(document.querySelectorAll('#stage .cx-room')).toHaveLength(3);
    expect(focusedId()).toBe(id(1));
    expect(ctl.S.rp.row).toBe(2);
  });

  it('its replay gone from the refreshed list: the focus on a row that is there', async () => {
    const src = source([0, 1], [0]);
    const { ctl, p } = boot(src, 'page');
    await toList(ctl);
    tap(p, DOWN);
    tap(p, SQUARE);
    await flush();
    expect(ctl.S.rp.row).toBe(0);
    expect(focusedId()).toBe(id(0));
  });
});
