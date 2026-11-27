# 427 -- The touch stance press judged by its events' own times (LATER 1059)

- Date: 2026-11-15. The MOVEMENT lane of the weekend mega sprint (seat "wm-move lane seat (weekend mega sprint)",
  Shadow PC 1), branch `agent/wm-move-touch`, base `agent/next` 4d89ef980a; the main controller's brief (2026-11-15T06:45Z,
  the owner's word of 06:20Z), task 3. Issue #813; LATER 1059, with LATER 986 beside it.
- Track: simulation (the stance's tap and hold), the change itself a **browser adaptation** that changes nothing the
  game decides. Status: the original's side is **reading** as research 87 s1.13 and research 373 s1 carry it (cited
  below, not re-read here); the port's side is source inspection and unit tests. **Nothing here is measured on the
  original running.**
- Evidence kinds, kept apart: **(S)** source inspection of the port; **(U)** a unit test (jsdom, no browser);
  **(B)** browser runs of `e2e/touch.spec.ts` (section 4, their own record).

## 1. What went wrong (S)

The touch layer's walk pad (`viewer/src/touch.ts` `attachWalkTouch`) holds a button on one virtual pad, and
`viewer/src/matchTouch.ts` keeps a lift until the frame's end (`endFrame`), so a tap shorter than a frame is still an
edge. The stance button (`viewer/src/stanceButton.ts` `StanceButton.update`) times the hold by the frames' `dt` summed
from the frame after the press. On a loaded page a 100 ms tap whose lift landed inside one long frame was still down on
that frame, and that frame's whole `dt` counted toward the hold: past `STANCE_HOLD_S_PLACEHOLDER` (0.4 s), the body went prone
where a tap crouches. That is the spec's red at :294 ("a press the page saw as under 200 ms wanted crouch and got
prone"). The reverse holds too: a press that lasted 500 ms by its events whose frames counted less was taken as a tap.

## 2. What the original does (reading, cited; not re-read in this note)

The original tells a tap by the press's pressure peak: under 0.3 (`DAT_0066b410`, `FUN_00594cf0` D:L453336-453351) is
the light press, acting at the release, and 0.3 or more decides at once (D:L453339-453340; the full press's branch
D:L453380-453425, whose outcomes are the water's, `FUN_005857e0` and `FUN_00584c10`; research 87 s1.13, LATER 492;
research 373 s1). **The original times nothing** -- r0004 the same (`FUN_0059a6e0`, D4:L494268-494365, the twin of r0001
`FUN_00594cf0` D:L453332-453428; the second read of 2026-11-24): the port's hold length is the owner's ruled one
(research 101 B1, R5), with no source in the game. On the original a quick FIRM press (a peak of 0.3 or more) still goes
prone at once: "a quick tap crouches" holds for a light press only, and on the port's digital lanes (no pressure) only
through the 0.4 s stand-in `STANCE_HOLD_S_PLACEHOLDER`. (The LATER 1059 row's "the hold by time (D:L453393-453416)" is wrong on this point: those
lines are the full press's water table. The fresh review's finding 1, 2026-11-15, re-read here at the source.) A touch
screen's press carries no pressure, and a browser pad's button is on or off, so the port's digital lanes keep a timed
hold (`STANCE_HOLD_S_PLACEHOLDER`).

**What the original does, then, to tell a tap from a hold: the pressure peak alone.** A press whose peak stays under
0.3 is the light press and acts at its release (the tap's outcomes); a press whose pressure reaches 0.3 is the full press
and acts on that frame (D:L453339-453340), whatever its length. So `STANCE_HOLD_S_PLACEHOLDER` stands in for the
pressure a digital button and a touch screen do not give: it is the owner's length (R5; research 101 B1), not the
placeholder of a time the original keeps. A press's length is the browser's proxy for how hard it was pressed. (The fresh
review's fold check, F3: the full press's branch opens at D:L453380; the earlier D:L453377 here was its line before.)

## 3. The change (S, U)

- `touch.ts` `attachWalkTouch` hands each press and lift its event's own time (`Event.timeStamp`, the page clock).
- `matchTouch.ts` keeps each button's press time. On a lift (`up`, never a cancel) it keeps the press's whole length by
  the events, until the frame's end lets the button go. It sets `Input.stanceLength` while every button holding the
  stance lane has its lift in.
- `gamepad.ts` `mergeInput` carries `stanceLength` only when every source that holds the stance lane timed it. A pad
  or a key held beside it leaves the frame loop's time in charge.
- `matchLanes.ts` hands it to `StanceButton.lanes` (`StanceLanes.triangleLength`). `StanceButton.update` judges a
  press whose length is known by that length: under the hold's time it is a tap at the release, otherwise a hold at once.
  A press still down (no lift yet) keeps the frame loop's time, as before.
- The keyboard's `C`, the touch C (`WalkMode.stanceTouch`) and a pad are unchanged. They carry no event length.

Held by `viewer/test/stanceTapEventTime.test.ts` (U): a 100 ms tap whose lift lands inside one 600 ms frame is a tap
(crouch); a press and lift 40 ms apart inside one frame is a tap; a press of 500 ms by its events is a hold (prone) when
the frames counted 50 ms; a press still down goes prone at 0.4 s of frames and its release does nothing more. The first
and third cases were RED on the trunk (41e858496e: prone where crouch was asked; crouch where prone was asked).

## 3b. Run 8: the stall before the lift's dispatch (S, U)

The spec's ten runs at 7c6ac98f23 (Shadow PC 1, SwiftShader, one worker; the record `box/wm-move-touch-7c6ac98f2-touch273-shadow1/RECORD.md`)
passed 9 and failed run 8 at :294 ("crouch" wanted, "prone" read) on a press the page measured as under 200 ms. The run's
log keeps no event times, so the path is the one the order of events allows (inferred, not traced): after a long task
the browser may run the next frame before it dispatches a queued discrete input event. That stalled frame's `dt` carries
the frames' sum past 0.4 s while the press still has no lift, so section 3's rule (a press still down keeps the frame
loop's time) took the hold, and the lift that came next could not undo it. The fix (`TOUCH_STALL_FRAME_S_ADAPTATION`, part of the
adaptation): when the touch layer holds the stance lane with its press time (`Input.stanceTimed`) and no lift is in, a
hold that a frame longer than 0.05 s would cross waits one frame, once a press. A lift queued behind the stall lands
first and is judged by its events' times; a press truly held goes prone a frame late; a page whose frames all run long
still goes prone (deferred once only). Held by `stanceTapEventTime.test.ts`: run 8's order (RED at 6ba2c18a41) and the
once-only deferral.

**2026-11-24 (LATER 1059, the x10 at 961f3f2afd).** One frame was not always enough: in the ten runs at 961f3f2afd
(box/touch273-961f3f2af, 9 passed) the red run's press log shows a 155 ms tap by its events, a 533 ms frame, and the lift
dispatched 481 ms late -- after the two short frames (17, 50 ms) that followed the stall -- so the one-frame wait ran out
and the hold fired. The wait is now the stall frame and up to `TOUCH_STALL_WAIT_FRAMES_ADAPTATION` (3) more, while those
frames sum to no more than 3 x 0.05 s, still once a press: two is the observed need, three the smallest with a frame of
margin; the seconds' bound caps the extra wait at about 0.15 s plus the frame that fires (frames over 0.15 s go prone a
frame late, as before; steady 0.1 s frames, two frames, about 0.2 s). A real hold on a stalling page goes prone on the
fourth short frame after the stall (three wait frames, then the one that fires). Held by `stanceTapEventTime.test.ts`: the red run's shape and
a real hold across a stall.

## 4. The browser spec

`e2e/touch.spec.ts` :273 ("the other buttons as the pad's: Triangle the stance, ...") is run alone on the PC's lock, each run's
result said: ten at 7c6ac98f23 (9 passed, run 8 red: section 3b); twenty owed at the fix. Its record is the head's box record, not this note's.

## 5. Adaptations

| Name | Where | What | Status |
|---|---|---|---|
| `STANCE_TOUCH_EVENT_TIME_ADAPTATION` | viewer `src/stanceButton.ts`, `src/matchTouch.ts`, `src/touch.ts`, `src/gamepad.ts` `Input.stanceLength` | A touch press of the stance button whose lift is in is judged by its events' times (pointerdown to pointerup), not by the frames between them. A press still down keeps the frame loop's time. The hold's length stays `STANCE_HOLD_S_PLACEHOLDER` | browser adaptation (no original: a touch screen has no pressure); the main controller's brief, task 3, on the owner's word of 2026-11-15 06:20Z |
| `TOUCH_STALL_FRAME_S_ADAPTATION` | viewer `src/stanceButton.ts` (`StanceButton.update`'s deferral), `src/matchTouch.ts` and `src/gamepad.ts` `Input.stanceTimed` | 0.05 s: a touch-timed stance press with no lift in, whose hold a frame longer than this would cross, defers the hold -- that frame, then up to `TOUCH_STALL_WAIT_FRAMES_ADAPTATION` more (2026-11-24; was one frame) -- once a press, so a pointerup the browser dispatched late behind a stall is judged by its events' times (section 3b). Its cost: a real hold on a stalling page goes prone one frame late. Nothing of the original's | browser adaptation for a late-dispatched pointerup (touch.spec :273's run 8); the main controller, 2026-11-15 |
| `TOUCH_STALL_WAIT_FRAMES_ADAPTATION` | viewer `src/stanceButton.ts` (`StanceButton.update`'s deferral) | 3: after the stall frame, the hold with no lift in waits up to this many more frames (summing to at most 3 x `TOUCH_STALL_FRAME_S_ADAPTATION`) for a queued lift (section 3b, 2026-11-24). Its cost: a real hold on a stalling page goes prone on the fourth short frame after the stall (three wait frames, then the one that fires). Nothing of the original's | browser adaptation for a pointerup dispatched two frames after a stall (touch.spec :273 x10 at 961f3f2afd); LATER 1059, 2026-11-24 |

## 6. Not done, and owed

- `STANCE_HOLD_S_PLACEHOLDER` has no source in the original to read: it stays the owner's ruled length. The LATER 1059
  row's citation of the hold "by time" is to be corrected when the row closes.
- LATER 986's other half (a press the page saw as 400 ms or more that wanted prone and got stand, :295): the event
  length makes such a press a hold whatever the frames did, so it should go too. Only the spec's ten runs show whether it does.
