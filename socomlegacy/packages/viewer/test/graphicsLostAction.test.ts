// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GRAPHICS_LOST_LEAVE_LABEL, GRAPHICS_LOST_REJOIN_LABEL, GRAPHICS_LOST_REJOIN_LINES, resetGraphicsRecordForTest, setGraphicsLostAction,
  showGraphicsLost, watchGraphicsLost,
} from '../src/graphicsLost';

/**
 * LATER 896 (product track, a browser adaptation; the controller's rulings of 2026-11-18): a match whose WebGL context or
 * WebGPU device is lost keeps the notice's own words and adds the match's two ways on -- "Reload and rejoin" (part 2: that
 * reload keeps the seat for 3 minutes, `../src/seatKeep`, central `lobbyGameParkedResume.test.ts`) and "Leave match" (the
 * START menu's ABORT: the seat let go). Nothing is promised about the body. Before it a lost match left the player one
 * blind path (START, ABORT, under a dead picture) beside a reload that gave the seat up.
 */
afterEach(() => { resetGraphicsRecordForTest(); document.body.innerHTML = ''; });

const info = { api: 'WebGL', message: 'context lost' };
const buttons = (el: Element): HTMLButtonElement[] => [...el.querySelectorAll<HTMLButtonElement>('button[data-graphics-lost-action]')];

describe('LATER 896: the lost notice carries the match’s "Reload and rejoin" and "Leave match"', () => {
  it('the copy: the notice’s words kept, the seat held 3 minutes, the sign-in line; nothing about the body', () => {
    expect(GRAPHICS_LOST_REJOIN_LINES.join(' ')).toMatch(/3 minutes/);
    expect(GRAPHICS_LOST_REJOIN_LINES.join(' ')).toMatch(/already signed in, wait a few seconds/);
    expect(GRAPHICS_LOST_REJOIN_LINES.join(' ')).not.toMatch(/body|spot|alive|where you were/i);
    setGraphicsLostAction({ lines: GRAPHICS_LOST_REJOIN_LINES, actions: [{ label: GRAPHICS_LOST_REJOIN_LABEL, run: () => undefined }, { label: GRAPHICS_LOST_LEAVE_LABEL, run: () => undefined }] });
    const el = showGraphicsLost(document, info, new Date('2026-11-18T12:00:00Z'));
    expect(el.textContent).toMatch(/Graphics stopped at 12:00:00Z \(WebGL: context lost\)\./);
    for (const line of GRAPHICS_LOST_REJOIN_LINES) expect(el.textContent).toContain(line);
    expect(buttons(el).map((b) => b.textContent)).toEqual(['Reload and rejoin', 'Leave match']);
  });

  it('a press runs its own action once and spends both buttons', () => {
    const rejoin = vi.fn(), leave = vi.fn();
    setGraphicsLostAction({ actions: [{ label: GRAPHICS_LOST_REJOIN_LABEL, run: rejoin }, { label: GRAPHICS_LOST_LEAVE_LABEL, run: leave }] });
    const [r, l] = buttons(showGraphicsLost(document, info));
    l!.click(); l!.click(); r!.click();
    expect(leave).toHaveBeenCalledTimes(1);
    expect(rejoin).not.toHaveBeenCalled();
    expect([r!.disabled, l!.disabled]).toEqual([true, true]);
  });

  it('with none registered (the menus, the test room), the notice is as before: no button, no line', () => {
    const el = showGraphicsLost(document, info);
    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent).toMatch(/Reload the page to continue\.$/);
  });

  it('the registration’s removal takes the buttons away from later notices, and only its own', () => {
    const off = setGraphicsLostAction({ actions: [{ label: GRAPHICS_LOST_LEAVE_LABEL, run: () => undefined }] });
    const offB = setGraphicsLostAction({ actions: [{ label: GRAPHICS_LOST_LEAVE_LABEL, run: () => undefined }] });
    off();                                                               // an older mount's teardown: not the newer's
    expect(buttons(showGraphicsLost(document, info))).toHaveLength(1);
    offB();
    expect(buttons(showGraphicsLost(document, info))).toHaveLength(0);
  });

  it('a lost renderer (watchGraphicsLost) shows them, and a throwing action never reaches the page', () => {
    setGraphicsLostAction({ actions: [{ label: GRAPHICS_LOST_LEAVE_LABEL, run: () => { throw new Error('gone'); } }] });
    const r = { onDeviceLost: (_: never): void => undefined };
    watchGraphicsLost(r, document);
    (r.onDeviceLost as (i: typeof info) => void)(info);
    const [b] = buttons(document.querySelector('[data-graphics-lost]')!);
    expect(() => b!.click()).not.toThrow();
  });

  it('the match registers both at its attach -- the rejoin keeps the seat THEN reloads; Leave match is the ABORT -- and lets them go at its teardown', () => {
    const m = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchMount.ts'), 'utf8');
    expect(m).toMatch(/\{ label: GRAPHICS_LOST_REJOIN_LABEL, run: \(\) => \{ keepSeatOnUnload\(\); doc\.defaultView\?\.location\.reload\(\); \} \}/);
    expect(m).toMatch(/\{ label: GRAPHICS_LOST_LEAVE_LABEL, run: \(\) => \{ matchAbort\.abort\(\); \} \}/);
    expect(m).toMatch(/lostLeave\?\.\(\); lostLeave = null; releaseSeatKeep\(\);/);
  });

  it('review F1: a loss before the registration (the load, the lobby’s prepare) gets the buttons when the match registers', () => {
    const r = { onDeviceLost: (_: never): void => undefined };
    watchGraphicsLost(r, document, () => new Date('2026-11-18T12:00:00Z'));
    (r.onDeviceLost as (i: typeof info) => void)(info);
    expect(buttons(document.querySelector('[data-graphics-lost]')!)).toHaveLength(0);
    setGraphicsLostAction({ lines: GRAPHICS_LOST_REJOIN_LINES, actions: [{ label: GRAPHICS_LOST_REJOIN_LABEL, run: () => undefined }, { label: GRAPHICS_LOST_LEAVE_LABEL, run: () => undefined }] }, document);
    const el = document.querySelector('[data-graphics-lost]')!;
    expect(buttons(el).map((b) => b.textContent)).toEqual(['Reload and rejoin', 'Leave match']);
    expect(el.textContent).toMatch(/Graphics stopped at 12:00:00Z \(WebGL: context lost\)\./);   // the loss's own time kept
  });

  it('review F2: the match’s end takes its notice away (no stale notice over the menus); a newer registration’s stays', () => {
    const off = setGraphicsLostAction({ actions: [{ label: GRAPHICS_LOST_LEAVE_LABEL, run: () => undefined }] }, document);
    showGraphicsLost(document, info);
    off();
    expect(document.querySelector('[data-graphics-lost]')).toBeNull();
    const old = setGraphicsLostAction({ actions: [] }, document);
    setGraphicsLostAction({ actions: [{ label: GRAPHICS_LOST_LEAVE_LABEL, run: () => undefined }] }, document);
    showGraphicsLost(document, info);
    old();                                                               // not the current one: nothing removed
    expect(document.querySelector('[data-graphics-lost]')).not.toBeNull();
  });

  it('review F3: the match lets them go first in its teardown', () => {
    const m = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchMount.ts'), 'utf8');
    expect(m).toMatch(/const teardown = \(\): void => \{\r?\n\s*lostLeave\?\.\(\); lostLeave = null; releaseSeatKeep\(\);/);
  });
});
