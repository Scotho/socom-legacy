// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mountTouch, type MatchTouchDeps } from '../src/matchTouch';
import { mergeInput, noInput, PAD_BUTTON, type Input } from '../src/gamepad';
import { playerLanes, type LaneParts } from '../src/matchLanes';
import { StanceButton, STANCE_HOLD_S_PLACEHOLDER, TOUCH_STALL_WAIT_FRAMES_ADAPTATION } from '../src/stanceButton';
import type { Stance } from '../src/walk';

/**
 * LATER 1059 (issue #813; `e2e/touch.spec.ts` :273): a quick touch Triangle tap must not read as a hold on a loaded page.
 * The touch layer's virtual pad keeps a lift until the frame's end (`./matchTouch` `endFrame`), so a 100 ms tap whose
 * lift lands inside one long frame was still down on that frame, and the frame's whole `dt` was counted to the hold
 * (`StanceButton.update`): prone where a tap crouches. The original tells a tap by the press's pressure peak (under
 * 0.3, `DAT_0066b410`, `FUN_00594cf0` D:L453336-453351); a press of 0.3 or more decides at once (D:L453339-453340), and
 * the original times nothing (the port's hold length is the owner's, research 101 B1); a
 * touch screen's press has no pressure. BROWSER ADAPTATION (`STANCE_TOUCH_EVENT_TIME_ADAPTATION`): the touch press is
 * judged by its input events' own times (pointerdown to pointerup), whatever the frames between them took; the hold's
 * length stays `STANCE_HOLD_S_PLACEHOLDER`. A unit test: jsdom, no browser; the events' times are set on the events.
 */

const here = dirname(fileURLToPath(import.meta.url));
const page = new DOMParser().parseFromString(readFileSync(resolve(here, '../setup/index.html'), 'utf-8'), 'text/html');

function rootWithLayer(): HTMLElement {
  const root = document.createElement('div');
  root.append(page.getElementById('touch')!.cloneNode(true), page.getElementById('mobile-tip')!.cloneNode(true));
  document.body.append(root);
  return root;
}
/** The walk pad's Triangle under the root (`[id=]`: jsdom answers `#id` document-wide). */
const triangle = (root: HTMLElement): Element => root.querySelector(`[id="touch-walk"] button[data-pad="${PAD_BUTTON.Triangle}"]`)!;
/** A pointer event at the event time `at` (ms, the page clock `Event.timeStamp` reads). */
const ptr = (el: Element, type: string, at: number): void => {
  const e = new PointerEvent(type, { pointerId: 1, pointerType: 'touch', bubbles: true, cancelable: true });
  Object.defineProperty(e, 'timeStamp', { value: at });
  el.dispatchEvent(e);
};

const deps: MatchTouchDeps = {
  stance: () => {}, fire: () => {}, reload: () => {}, cancelAction: () => {},
  exchange: {
    menu: { touchButton: () => true } as never, refresh: () => {},
    gate: () => ({ inMatch: true, alive: true, cameraOnSelf: true, spectator: false }),
    isOpen: () => false, prompt: () => null,
  },
  covered: () => false,
};

/** The page's frame as `main.ts` runs it: the touch lanes merged, the game lanes read, then the frame's end. */
function rig() {
  const root = rootWithLayer();
  const touch = mountTouch(root, deps);
  const asked: Stance[] = [];
  let stance: Stance = 'stand';
  const l: LaneParts = {
    walk: {
      mode: () => 'walk', isDead: () => false, stance: () => stance, stanceIntent: () => stance,
      jump: () => true, crouch: () => true, setStance: (s) => { asked.push(s); stance = s; return true; },
      stanceMode: () => 'separate',
    },
    firearm: { stepZoom: () => 1, switchFireMode: () => 'auto', viewLanes: () => {}, fire: { reload: () => true } },
    stanceButton: new StanceButton(),
    shoulder: () => {},
  };
  let before: Input = noInput();
  const frame = (dt: number): void => {
    const after = mergeInput(touch.input, noInput());
    playerLanes(l, before, after, dt, { walking: true, menu: false });
    before = after;
    touch.endFrame();
  };
  return { root, touch, frame, asked };
}

describe('LATER 1059: a touch Triangle press is judged by its events\' own times, whatever the frames took', () => {
  it('a 100 ms tap whose lift lands inside one 600 ms frame is a tap (crouch), never a hold', () => {
    const { root, frame, asked } = rig();
    ptr(triangle(root), 'pointerdown', 1000);
    frame(1 / 60);                                   // the press's frame
    ptr(triangle(root), 'pointerup', 1100);          // lifted 100 ms after the press, by the events
    frame(0.6);                                      // a loaded page: one long frame, the lift kept to its end
    frame(1 / 60);                                   // the release read
    frame(1 / 60);
    expect(0.1).toBeLessThan(STANCE_HOLD_S_PLACEHOLDER);
    expect(asked).toEqual(['crouch']);
  });

  it('run 8 (touch.spec :273 at 7c6ac98f23, 1 of 10): a stall whose frame runs BEFORE the queued 100 ms lift is dispatched is still a tap', () => {
    const { root, frame, asked } = rig();
    ptr(triangle(root), 'pointerdown', 1000);
    frame(1 / 60);                                   // the press's frame
    frame(0.6);                                      // a stalled frame: the frames' sum passes 0.4 s, the lift not yet dispatched
    ptr(triangle(root), 'pointerup', 1100);          // the queued lift, 100 ms after the press by the events
    frame(1 / 60);
    frame(1 / 60);
    expect(asked).toEqual(['crouch']);
  });

  it('a stall defers the hold once only: a page whose frames all run long still goes prone, a frame late', () => {
    const { root, frame, asked } = rig();
    ptr(triangle(root), 'pointerdown', 1000);
    frame(0.2);                                      // the press's frame
    frame(0.3); frame(0.3);                          // 0.6 s of long frames, no lift: deferred once
    expect(asked).toEqual([]);
    frame(0.3);
    expect(asked).toEqual(['prone']);
  });

  it('touch.spec :273 at 961f3f2afd (9 of 10): a 155 ms tap whose lift is dispatched two frames after a 533 ms stall is a tap', () => {
    // The red run's press log: down 9391, up 9545 by the events (155 ms); frames [34, 533, 17, 50, 33, ...] ms, the lift
    // dispatched 481 ms after its timestamp -- after the two frames that followed the stall.
    const { root, frame, asked } = rig();
    ptr(triangle(root), 'pointerdown', 9391);
    frame(0.034);                                    // the press's frame
    frame(0.533);                                    // the stall: the frames' sum passes 0.4 s, no lift in
    frame(0.017);                                    // a short frame, still no lift
    frame(0.050);                                    // another, still no lift
    ptr(triangle(root), 'pointerup', 9546);          // the queued lift lands, 155 ms after the press by the events
    frame(0.033);
    frame(0.050);
    expect(asked).toEqual(['crouch']);
  });

  it('a press truly held across a stall still goes prone, at most TOUCH_STALL_WAIT_FRAMES_ADAPTATION short frames late', () => {
    const { root, frame, asked } = rig();
    ptr(triangle(root), 'pointerdown', 1000);
    frame(1 / 60);                                   // the press's frame
    frame(0.6);                                      // the stall: the hold waits for a queued lift
    for (let i = 0; i < TOUCH_STALL_WAIT_FRAMES_ADAPTATION; i++) frame(1 / 60);
    expect(asked).toEqual([]);
    frame(1 / 60);                                   // the wait spent, no lift: the hold
    expect(asked).toEqual(['prone']);
    ptr(triangle(root), 'pointerup', 2000);
    frame(1 / 60); frame(1 / 60);
    expect(asked).toEqual(['prone']);                // its release does nothing more
  });

  it('the wait is bounded in seconds too: wait frames summing past 3 x 0.05 s end it early (steady 0.1 s frames: two)', () => {
    const { root, frame, asked } = rig();
    ptr(triangle(root), 'pointerdown', 1000);
    frame(1 / 60);                                   // the press's frame
    frame(0.6);                                      // the stall: the hold waits for a queued lift
    frame(0.1);                                      // 0.1 s of waiting: within 0.15 s
    expect(asked).toEqual([]);
    frame(0.1);                                      // 0.2 s: past the seconds' bound, before the third frame
    expect(asked).toEqual(['prone']);
  });

  it('the press and its lift both inside one frame (40 ms apart) is a tap', () => {
    const { root, frame, asked } = rig();
    ptr(triangle(root), 'pointerdown', 1000);
    ptr(triangle(root), 'pointerup', 1040);
    frame(0.5);
    frame(1 / 60);
    frame(1 / 60);
    expect(asked).toEqual(['crouch']);
  });

  it('a press held 500 ms by its events is a hold (prone) even when the frames between counted less', () => {
    const { root, frame, asked } = rig();
    ptr(triangle(root), 'pointerdown', 1000);
    frame(1 / 60);
    ptr(triangle(root), 'pointerup', 1500);          // the events say 500 ms: past the hold's 0.4 s
    frame(0.05);                                     // the frames after the press's counted 50 ms
    frame(1 / 60);
    frame(1 / 60);
    expect(asked).toEqual(['prone']);
  });

  it('a press still down (no lift yet) keeps the frame loop\'s hold: 30 frames of 1/60 s still down go prone at 0.4 s', () => {
    const { root, frame, asked } = rig();
    ptr(triangle(root), 'pointerdown', 1000);
    for (let i = 0; i < 30; i++) frame(1 / 60);
    expect(asked).toEqual(['prone']);
    ptr(triangle(root), 'pointerup', 1500);
    frame(1 / 60);
    frame(1 / 60);
    expect(asked).toEqual(['prone']);                // its release does nothing more
  });

  it('a cancel lift (the system took the finger) carries no length: the frame loop decides, as before', () => {
    const { root, touch } = rig();
    ptr(triangle(root), 'pointerdown', 1000);
    ptr(triangle(root), 'pointercancel', 1100);
    expect(touch.input.stance).toBe(true);           // kept to the frame's end
    expect(touch.input.stanceLength).toBeUndefined();
  });

  it('mergeInput keeps the touch length only when every source holding the stance lane timed it: a pad holding Triangle beside it drops it', () => {
    const touchTimed: Input = { ...noInput(), stance: true, stanceLength: 0.1 };
    expect(mergeInput(touchTimed, noInput()).stanceLength).toBe(0.1);
    expect(mergeInput(touchTimed, { ...noInput(), stance: true }).stanceLength).toBeUndefined();
    // A source whose Triangle is the action alone (OT.R107 `stanceOff`) holds no stance lane, so the touch length stands.
    expect(mergeInput(touchTimed, { ...noInput(), stance: true, stanceOff: true }).stanceLength).toBe(0.1);
  });

  it('a press held past the hold, then cancelled by the system before a stalled frame, still goes prone (no deferral on a cancel)', () => {
    const { root, frame, asked } = rig();
    ptr(triangle(root), 'pointerdown', 1000);
    frame(1 / 60);
    ptr(triangle(root), 'pointercancel', 1450);
    frame(0.6);                                      // stalled: the frames' sum past 0.4 s, the cancel's lift already in
    frame(1 / 60);
    expect(asked).toEqual(['prone']);
  });

  it('mergeInput marks the lane timed only when every source holding it is the timed touch layer', () => {
    const touch: Input = { ...noInput(), stance: true, stanceTimed: true };
    expect(mergeInput(touch, noInput()).stanceTimed).toBe(true);
    expect(mergeInput(touch, { ...noInput(), stance: true }).stanceTimed).toBeUndefined();
    expect(mergeInput(touch, { ...noInput(), stance: true, stanceOff: true }).stanceTimed).toBe(true);
  });
});
