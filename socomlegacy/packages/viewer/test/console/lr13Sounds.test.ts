// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleController, type Host } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { UI_CUE_SOURCE } from '../../src/console/sounds';
import { CATS, createState, homeItems } from '../../src/console/state';

/**
 * LR-13, item E (LR.R16 (3), the owner, 2026-10-26T18:40Z: the Launcher sounds row and label stay; "feel free to extend
 * more sounds if the launcher can support them and it adds to the experience" -- the disc's own sounds, CX.R19). The
 * launcher's cues are the original's menu cues off the player's disc (HUDUI through `uisounds.rdr`'s code cues,
 * `src/console/sounds.ts` `UI_CUE_SOURCE`, research 122); nothing is synthesized and no new sound file is read. The new
 * acts take the cue their kind already has: a toggle flipped by Cross or a click says the setting cue (`toggle`:
 * SELECTION, `.METAL`) as Left / Right did; Play's panel opening was a push (`confirm`: SELECTION) and Circle out of it a
 * back (`back`: BACK, `.BACK`) -- LR-23 (LR.R22) took the panel away, Play's Cross launching (START's `confirm`); the theme drop-up opening is a pop-up (`open`: `PopUpDialog`'s `.METAL`), its Circle a
 * close (`close`: BACK), its pick a confirm (`confirm`: SELECTION), a move inside it the move cue. Play's dot turning
 * green says nothing: no press makes it, and the original's menus have no cue for a readiness change (said in the Log).
 */
function cued() {
  const A = sampleAdapters();
  const S = createState(A);
  const host: Host = { render: vi.fn(), announce: vi.fn(), fit: vi.fn() };
  const c = new ConsoleController(S, A, host);
  const played: string[] = [];
  A.cue = { selection: () => { played.push('move'); }, play: (k) => { played.push(k); } };
  return { A, S, c, played };
}
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe('LR-13 E: the new acts say the disc\'s cues of their kind', () => {
  it('the cues stay the original\'s code cues (no new source)', () => {
    expect(UI_CUE_SOURCE).toEqual({ move: 'selection', toggle: 'selection', confirm: 'selection', open: 'popup', back: 'back', close: 'back', error: null });
  });

  // LR-23 (LR.R22): Play's panel is gone, and its cues with it (was: Cross on Play a push, `confirm`; a move inside it the
  // move cue; Circle or Left out of it a `back`). Play's Cross is the launch: START's arming says `confirm`, once.
  it('Play\'s Cross, ready: the launch\'s confirm (START\'s arming), once', () => {
    const { S, c, played } = cued();
    c.press('cross');
    expect(S.start).toBe('arming');
    expect(played).toEqual(['confirm']);
  });

  // LR-36 (LR.R30): the input not ready, Play's Cross opens the "Before you deploy" panel (LR-13's cue for Play's panel
  // opened, `confirm`); a move inside it is the move cue, Circle out of it a `back`. Was (LR-23 / LR-31): Settings opened.
  it('Play\'s Cross, the input not ready: the launch check opens (confirm); a move in it (move); Circle out (back)', () => {
    const { S, A, c, played } = cued();
    A.controls = { ready: () => false, line: () => 'Controller needed', reason: () => 'Connect a controller to start.' };
    c.press('cross');
    expect(S.screen).toBe('home');
    expect(S.chk.open).toBe(true);
    expect(played).toEqual(['confirm']);
    c.press('down');
    expect(played).toEqual(['confirm', 'move']);
    c.press('circle');
    expect(S.chk.open).toBe(false);
    expect(played).toEqual(['confirm', 'move', 'back']);
  });

  it('Left on Home is the rail\'s move (was: out of Play\'s panel, a back)', () => {
    const { c, played } = cued();
    c.press('left');
    expect(played).toEqual(['move']);
  });

  it('the theme drop-up: open, a move, a pick (confirm); open again and Circle (close)', async () => {
    const { S, A, c, played } = cued();
    S.cat = CATS.findIndex((x) => x.id === 'options');
    S.item[S.cat] = homeItems('options', S, A).findIndex((x) => x.act === 'themes');
    c.press('cross');
    expect(played).toEqual(['open']);
    c.press('down');
    expect(played).toEqual(['open', 'move']);
    c.press('cross');
    await vi.advanceTimersByTimeAsync(0);
    expect(played).toEqual(['open', 'move', 'confirm']);
    played.length = 0;
    c.press('cross');
    c.press('circle');
    expect(played).toEqual(['open', 'close']);
  });

  it('a click on the drop-up\'s item says open and close as the pad does; a click on an option confirm', async () => {
    const { S, A, c, played } = cued();
    S.cat = CATS.findIndex((x) => x.id === 'options');
    const at = homeItems('options', S, A).findIndex((x) => x.act === 'themes');
    S.item[S.cat] = at;
    c.pointer('item', { i: String(at) });
    c.pointer('item', { i: String(at) });
    expect(played).toEqual(['open', 'close']);
    c.pointer('item', { i: String(at) });
    c.pointer('themeopt', { i: '3' });
    await vi.advanceTimersByTimeAsync(0);
    expect(played).toEqual(['open', 'close', 'open', 'confirm']);
  });
});
