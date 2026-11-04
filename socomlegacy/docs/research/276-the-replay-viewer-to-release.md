# 276 -- The replay viewer to release

> HF update, 2026-10-17: stationary/staged hostages in this note describe its historical replay tests. Live EXTRACTION now uses the shared planner and follower (research 333-334); those historical tests are not evidence of full physical following or original steering parity.

Written 2026-10-11 for RV-2 of web sprint 39 (the plan `docs/plans/2026-10-11-web-sprint-39-the-replay-viewer-to-release.md`,
rulings W39.R1 and W39.R2; the design `docs/specs/2026-10-06-playtest-and-replay-design.md` §4.1 and §4.8). Each of the
sprint's tasks writes its own section here: §1 is RV-2's, §2 RV-3's, §3 RV-4's, §4 RV-11's, §5 RV-6's, §6 RV-7's,
§7 RV-5's, §8 RV-8a's, §9 RV-1's, §10 RV-11b's, §11 RV-5 phase 2's (after PAR-48), §12 RV-10's (LATER 27, not a replay task), §13 RV-12's (the console plan's CX-15), §14 RV2-10's (the replay viewer redesign's engine members, RV2.R6). The note stands on research 244 (the replay viewer: §1 the seek, §7 the fold) and research 249
(the replay engine: §1-§5, what a seek restores since sprint 38).

**W39.R2: the engine's surface stays additive** (W38.R1 carried). `ReplayClient`, the `.s2r` format, the segment HTTP
and `GET /replays` change only additively, and every change to them is named here, in each section's "`ReplayClient`
and the segment HTTP" paragraph, so that any reader of the engine can follow it.

**No parity finding.** SOCOM II records no match and plays none back. The replay, its seek and the viewer's transport
are a browser adaptation (`REPLAY_ADAPTATION`, research 240 §3; PT.R3; MU.R1), and nothing here changes a game value or
behaviour.

## 1. The seek note from the engine (RV-2)

The code: `packages/viewer/src/replay/replayClient.ts` (`ReplaySeek`, `onSeek`, `seekTo`, `step`),
`packages/viewer/src/modern/replays/transport.ts` (the note) and `packages/viewer/src/modern/replays/worldStage.ts`
(`WorldClient.onSeek`). The tests: `packages/viewer/test/replayClient.test.ts` ("onSeek's argument (RV-2)"),
`test/modern/replays/transport.test.ts` ("the seek note from the engine (RV-2)", and the note's sentence in "the
transport bar"), `test/modern/replays/worldStage.test.ts` ("RV-2: onSeek follows each client ...") and the fake client
of `test/modern/replays/fixtures.ts`, which tells a seek as the engine does.

**What was there.** The modern transport (MU-10) raised its note by comparing the tick before and after each of its
own controls (`moved()`): a move back, or a move that was not a step on, was taken for a seek. The note said "Rebuilt
from the nearest snapshot: the events in between were skipped", and its header said the engine gave no flag of its own.
Two things were wrong with that by sprint 39:
- a seek the bar did not make (the world stage's own, a later timeline's) raised nothing, and the bar's guess was the
  page's, not the engine's;
- "the events in between were skipped" is no longer true of the match's state. Since sprint 38 a seek restores, at the
  target, the roster (244 §1), the scoreboard, the round's clock and screens, a body's death at its age, the bomb, the
  turrets and the drops (244 §7), a dance still running, the charges lying there and the ghosts (249 §1), EXTRACTION's
  hostages (249 §3), the page's clocks (249 §4), and it clears the air at the old playhead (249 §5).

### `onSeek`'s argument

`ReplayClient.onSeek(listener)` now hands its listener one argument, a `ReplaySeek`:
- `from`: the replay's tick before the seek. For a step back it is the tick before the step: `step` moves the clock
  first and hands its own `from` to `seekTo`.
- `to`: the tick the clock landed on, `ReplayClock.seek`'s value, so a target past the recording's span comes as the
  span's end.
- `folded`: true when the target was reached by the snapshot at or before it and the fold of the records up to it
  (`seekTo`), not by playing on. Every seek path is `seekTo` today (`seek`, `seekStart`, `seekEnd`, a step back), so it
  is always true. It is there so that a later path that reaches its target by playing on can say so without a second
  change to the surface. The name is the brief's: the plan's outline (its RV-2 brief) called the field `rebuilt`; the
  dispatched brief chose `folded`, which names what the engine does (the fold, 244 §7) rather than the old note's word.

**The order holds (RE-4, 249 §5).** The listeners are still told before anything of the target: before the roster's
diff, the world, the welcome and the `score`. `to` is known first because `seekTo` now calls `clock.seek(tick)` before
it tells the listeners, where RE-4 told them first and moved the clock after. Moving the clock tells the page nothing:
the page hears a seek only through its events and its next frame. A step back already moved the clock before its
listeners heard it. The test "told before the target's roster and welcome" holds the order: the listener first, then
`joined`, `welcome`, `score`.

**Play and a step on tell nothing**, as before: they are `playTo`, never `seekTo`.

**A listener that takes no argument still works.** `matchActions.ts`'s `followSeek` (RE-4: the page's `clearAir`)
passes `() => { ... }`, which the new type admits, and behaves as before: `replayAir.test.ts` passes unchanged.

### The world stage forwards it

`WorldClient` (`worldStage.ts`), the transport's client across the test room's room builds, gains `onSeek` with the
same signature. It subscribes once to each `ReplayClient` the test room takes and lets the old one's subscription go
when it takes the next, and at its close, so no listener is left on a closed client (the test reads the old client's
set: empty after the swap).

**A rebuild's restore is not told.** When the test room makes its room again, the stage puts the fresh client where the
old one stood (`take`: the speed, then `seek(place.tick)`). That seek is the engine's own (it folds, and RE-4 clears the
page's air), but it is not the watcher's: the watcher stays where they were, and nothing between was passed over. So the
stage does not forward it, and the note is not raised by a rebuild. This is a choice of this task beyond the brief's
words, held by its test.

### The note

The note is raised by `onSeek` alone (`TransportClient` gains `onSeek`; `moved()` is removed). It stands until playback
moves past `to`, as before. It is raised only for a folded seek that moved (`folded` true and `to` not equal to
`from`): a seek reached by playing on, or one landing where it stood, passed over nothing. A step back, the jumps
(J, L), Home and End, and the bar's press and drag raise it, as does a seek the bar did not make; play and a step on do
not.

**Its sentence**, re-read against what a seek restores now: "Jumped here: sounds, messages and effects in between
were not played; things in flight, smoke and scorch marks may not match." It names only what a seek still does not do,
clause by clause:
- **"Sounds, messages and effects in between were not played."** The events between are never played (244 §7, W37.R4:
  "the transient ones ... are never replayed"). These are the transient kinds a recording holds (`fold.ts`
  `EVENT_CLASS`): `shot` (a round's muzzle, tracer and report), `grenade` and `detonate` (an arc, a blast), `flinch`,
  `hurtVoice`, `reloadSound`, `action` (a switch's sounds and effects), `taunt` and `communication` (a voice and a
  line), `chat` (a line). A death folded at a seek runs no kill line, death voice or death camera (244 §7). A voice is
  a sound, a line a message.
- **"Things in flight ... may not match."** A grenade, round or rocket in flight at the target is not folded (249 §1,
  "Not folded, owed"): where each is at the target is the room's flight against the map's hull, which the recording
  does not hold. The air at the old playhead is cleared at the seek (249 §5), so none is drawn until play reaches the
  next launch. "Things", not "grenades": rounds and rockets are in the same case.
- **"Smoke ... may not match."** An AN-M8's smoke at the target is not folded (249 §1, the same item), and a smoke
  still pouring at the old playhead is not cleared: it keeps pouring after the seek, a seek back included (249 §5, "Not
  cleared"). So the smoke drawn after a seek may be missing or stale; "may not match" covers both, where "not redrawn"
  covered only the first. (Since RV-7c-2, §6: the pouring smoke is stopped and the target's laid; the clause still
  holds, for the puffs left to run out and the joiner's look.)
- **"Scorch marks may not match."** The scorches are the page's `clearScorches`, not the air: a seek clears none and
  folds none (249 §5, "Not cleared"), so the marks drawn are the old playhead's.

**What the sentence leaves out, and why** (each a limit of the engine or the page, said here, not under the bar):
- **The effects already playing at the old playhead** (a blast's particles; 249 §5, "Not cleared"): they run out in a
  moment; the smoke, the one that lasts, is named.
- **A dance the page refuses after a seek** (249 §1, "The page's limit (owed)"): a seek back into a dance already
  played, a seek within a dance playing, and play forward again through a dance sought back over draw no dance or the
  wrong age, because `Play.startVictory` refuses the serial (`play.ts` :187). It is a page bug, owed as LATER 31, which
  the plan's "Not this sprint" gives to the cloud batch, PR #135; it holds until LATER 31's fix lands, and it is not a
  seek's lasting limit, so the note does not name it.
- **A blast victim drawn at key 0** (249 §7.2, "A player's blast death, drawn at its age: owed"): a blast's fall reaches
  its victim alone and is not recorded, so a corpse a blast made is drawn at key 0 of `seal_landbackwards01` at the
  target, not at its age. RV-6 of this sprint records the fall and folds it.
- **C4 and the PMN.** The page in replay mode holds no record for either, so it draws neither in play or at a seek
  (249 §1, "Owed: the page holds no C4 or PMN record in replay mode"; LATER 32, which the plan's "Not this sprint"
  gives to the cloud batch, PR #135, not on this branch). It is not something a seek does, so the seek note does not
  name it.
- **A takeover's charges** (249 §1; LATER 33): too rare and too fine for a line under the bar.
- **A file with no `hostages` record** (249 §3): an older format's file, not a seek's limit.

The sentence is short, in the modern UI's voice (MU.R19: minimal text). It drops "rebuilt from the nearest snapshot",
which describes the method rather than what the watcher sees.

### `ReplayClient` and the segment HTTP (W39.R2)

- **`ReplayClient.onSeek(listener: (seek: ReplaySeek) => void): () => void`**: the listener gains one argument. This is
  additive: a listener of RE-4's `() => void` type is still admitted and called as before.
- **`ReplaySeek`** (new export of `replayClient.ts`): `{ from: number; to: number; folded: boolean }`.
- **What a seek tells the page**: unchanged. The clock now moves before the listeners are told, not after; no event is
  told in a different order.
- **The `.s2r` format, the segment HTTP and `GET /replays`**: unchanged.
- Not the engine's surface, listed for the page's readers: `TransportClient` gains `onSeek`; `WorldClient` implements it.

### Evidence

Unit tests only (node and jsdom). No browser, game, dev server or match server was run, and the note has not been seen
rendered (RV-1's run is where it is).
- `replayClient.test.ts`: every seek path tells `from`, `to` (clamped) and `folded`; play and a step on tell nothing; a
  zero-argument listener works and its removal holds; the listener is told before the target's roster and welcome.
- `transport.test.ts`: the bar subscribes once and lets go at dispose; a seek the client tells raises the note
  whoever made it, and a move told as no seek raises none; a seek back and a jump forward past the snapshot interval
  each raise it; play and a step on raise none; the bar's press and the keys raise it; a seek that lands where it stood,
  or one told as not folded, raises none; a 3-move drag raises it and it clears once playback passes the last target; the sentence.
- `worldStage.test.ts`: `onSeek` follows each client the test room takes, the old client's set empty after the swap,
  the rebuild's restore not told.
- `replayAir.test.ts` (RE-4) passes unchanged.

### 1.1 Placeholders

None: no `*_PLACEHOLDER` and no `*_READING`. The argument, the note and its sentence are the adaptation's own and name
no game value.

## 2. The controls to release (RV-3)

Written for RV-3 of web sprint 39 (W39.R3: "the controls are rough", the owner's words of 2026-10-09 about the test
room's replay mode, read as the release bar for the modern transport). The test room's controls stay the developers'
tool and are not changed here; the modern transport is what this task brings to release. Every control below is a
browser adaptation (REPLAY_ADAPTATION, MU.R1): SOCOM II has no replay and no such controls, so nothing here is a game
value.

### What is rough, read before any change

Read at `agent/playtest-rv3`'s base (`829c68be5`), side by side. One line each, with the place it is seen.

**The test room's replay controls** (`packages/viewer/src/replay/controls.ts`, `timeline.ts`, `mount.ts`). They stay
as they are.
- T1. The time is the recording's tick, not a clock: "tick 4512 / 9000" (`controls.ts:48`).
- T2. The keys are named in one dense line of punctuation, "Space play/pause, , . step, [ ] speed, Home End"
  (`controls.ts:49`); no control names its own key.
- T3. Play, step and speed are keys only: the bar is text that takes no pointer (`pointer-events:none`,
  `controls.ts:57-58`), so a mouse or a touch reaches only the timeline.
- T4. The pad reaches no replay control: the keys are read on the window (`controls.ts:61-71`) and the pad stays the
  spectator's (`controls.ts:12-14`).
- T5. A held key does nothing more: every action skips a repeat (`controls.ts:68`), so holding `,` steps once.
- T6. The timeline seeks on a click only: no drag and no hover time (`timeline.ts:155-161`).
- T7. The timeline is 12 px tall (`timeline.ts:124`), a small target for a finger.
- T8. The timeline is a `role="slider"` with no value, no focus and no keys (`timeline.ts:121-123`): a keyboard or a
  screen reader cannot use it.

**The modern transport** (`packages/viewer/src/modern/replays/transport.ts`, `view.ts`, `replays.css`), as MU-10 and
RV-2 left it.
- M1. A drag seeks on every pointer move (`transport.ts:205-217`). Each seek resets the world, lays the environment,
  folds the records and tells the page a welcome (`replayClient.ts:370-411`), so a drag rebuilds the world once per
  pointer event, however many events a frame brings.
- M2. The seek note is raised per seek, so a drag raises it once per pointer move. While playing, play clears it
  between two moves and the next move raises it again (`transport.ts:181`, `:244`): it flickers through a drag.
- M3. No hover time: the bar shows where the playhead is, never where a press would go (`transport.ts:203-222`).
- M4. The pad cannot reach the seek bar. It is a `div` with `role="slider"` (`transport.ts:135-138`), and the walker
  visits only native controls (`PAD_WALKED`, `startupNavigation.ts:9`). The arrows on the focused bar run the
  snapshot step (`transport.ts:224-234`), not a move of the bar's value.
- M5. The keys are named only in each button's tooltip (`transport.ts:124`): a mouse's hover shows it, a pad or a
  touch never does, and no pad button is named anywhere.
- M6. The touch targets are under 44 px (MU-F3's rule, `--s2u-hit-min`): the buttons 40 px (`replays.css:88`), the
  speed's 32 px (`replays.css:100`), the seek bar 8 px tall (`replays.css:78`), the camera buttons 36 x 32 px
  (`replays.css:51`) and the Back button 36 px (`.mu-button`, `modern.css:28`).
- M7. The time has no label: "1:05 / 3:20" (`transport.ts:260-261`). It is the recording's time, which it does not say;
  the round's clock is not shown.
- M8. On Watch the focus is the viewer's own box (`view.ts:245`, `:398`). The box is not a walker's control, so the
  pad's first move from it jumps to the page's first or last control (`startupNavigation.ts:107-108`), not the bar.
- M9. Circle in the viewer moves the focus to the shelf's Replays tile and leaves the viewer open: the launcher's
  back link is the only one on the page (`launcher.ts:524-543`). The modern UI's Circle is "back" (MU.R18).
- M10. Back to the list drops the focus on the page's body (`view.ts:259-264`, then `:400`), so the pad starts again
  from the page's top.
- M11. The idle dimming (MU.R13 F7: "the replay transport dims after 3s idle in fullscreen only") is not built: no
  idle, dim or fullscreen code is in `modern/replays/`. There is nothing to keep unchanged, and this task does not
  add it.

### What this task changed (the modern transport only)

The code: `packages/viewer/src/modern/replays/transport.ts`, `view.ts` and `replays.css`. `padLayers.ts` and the
walker (`startupNavigation.ts`) are unchanged.

- **The pad (M4, M8, M9, M10).** It goes through the launcher's one pad route for the page, the setup page's walker
  (`padLayers.ts` page layer: `walk` and `back` are the walker's). The transport reads no pad of its own.
  - The seek bar's focus is now a native range input (`.mur-seek__input`) laid over the bar. The walker visits it
    (`PAD_WALKED` holds `input`), and its D-pad left and right step a range by its `data-pad-step`
    (`startupNavigation.ts:161-170`). The transport sets that step to the jump in ticks
    (`MU_REPLAY_JUMP_SECONDS_ADAPTATION` x the recording's `tickHz`) and seeks to the input's value on its `input`
    event, so the D-pad moves the playhead by the jump while the focus stays. The input's `aria-valuetext` ("1:50 of
    3:20") says the time to a reader.
  - Every other control was already a native button, which the walker visits and Cross clicks.
  - On Watch, once the recording is open and the focus is still the viewer's box, the focus goes to the seek bar
    (`view.ts` `handFocus`). The keys still work there (below), and the pad's first move starts in the transport.
  - Circle in the viewer is its Back: a link of the page's back chain (`addBack`, rank 0, ahead of the launcher's
    rank-10 link), taken only while the focus is inside the viewer. On the keyboard Back is Escape, the launcher's
    "close the thing on top" (its fold's and the sign-in panel's), and an Escape something else already took
    (`defaultPrevented`) is left alone, as the fold leaves one. Back's button carries `aria-keyshortcuts="Escape"`.
  - Back, by Circle, Escape or its button, puts the focus on the Watch button of the card it was opened from
    (`view.ts` `back`). With the disc out that Watch is disabled and takes no focus, so the focus goes to the card
    itself (made focusable by script only, `tabIndex = -1`).
- **The keyboard on the focused bar.** Its arrows move it by the jump (`SEEK_BAR_KEYS`: left and down back, right and
  up on), as the D-pad does and as a native slider's arrows move its value. Every other transport key (Space, K, J,
  L, the speed, Home, End) stays the transport's there. Elsewhere in the viewer the arrows are still the snapshot step,
  but the step buttons advertise only `,` and `.` (their tooltip, hint and `aria-keyshortcuts`): those step wherever
  the focus is, and the arrows do not on the bar, which holds the focus at Watch.
- **The drag (M1, M2, M3).**
  - A press and a drag seek at most once an animation frame, at the latest position. The frame scheduler is the
    view's, the window's `requestAnimationFrame` by default.
  - The release seeks once at its own position, and a move still pending at the release is dropped.
  - A cancelled pointer (`pointercancel`) ends the drag where its last seek left it.
  - The note is raised once a drag, at its release, at the tick the release landed on. It is raised only if some
    seek of the drag moved, as RV-2's rule has it (§1, "The note"); it is never raised by a frame.
  - The hover shows the time under the pointer as m:ss, the time a press there would seek to, and seeks nothing.
- **Named and hinted (M5, M7).** Every control has an accessible name. Every control with a key names it in
  `aria-keyshortcuts`: the transport's, the seek bar and Back. The cameras have no key on this page; they are the
  world's own modes. A hint row under the bar (the design system's `s2u-prompts`, hidden from a reader because the
  names carry it) follows the focus anywhere in the viewer and shows:
  - for a focused transport button, its key caps and the Cross glyph ("Press");
  - for the focused bar, "← → 10 seconds" and "Keys or D-pad";
  - for the viewer's own buttons, its name, its caps (`data-hint-keys`: Back's "Esc") and Cross: Back and the cameras;
  - otherwise the main keys: Space play or pause, J and L the jump, Cross to press;
  - and in every case, in the viewer, the Circle glyph with "Back" (`TransportOptions.circleBack`).
  Each button's tooltip names its keys (a camera's says Cross). The time's tooltip says it is the recording's time and
  length. The bar's range input has no tooltip: it takes no pointer, so one would never show.
- **The targets (M6).** `.mur-tbtn` (the speed's included), `.mur__camera` and the viewer's Back are at least
  `--s2u-hit-min` both ways. The seek bar is a band that tall, with its 8 px rail drawn in it.

### Contacts with the launcher

The modern launcher is deferred to dot's launcher overhaul (the merge controller, 2026-10-11), so the Replays page must
not depend on its chrome: the top bar, the shelf, the action bar, the launcher's own regions and state. RV-3 touches
none of them. What it needs from whatever hosts it is the page's pad contract, listed here (lines at this task's head)
so the overhaul keeps it:

- **The back chain.** `padLayers(doc).addBack(link, 0)` (`view.ts:287`; `padLayers.ts:87`, its implementation at
  `:167`): the viewer's Circle. The chain must still be run by the page's Circle; today that is the walker's `goBack`,
  then `PadLayers.back()`. The viewer's link is rank 0, so it runs before any link ranked higher (the launcher's
  `regionBack` and the overlay's are rank 10). It answers false unless the focus is inside an open viewer.
- **The walker's controls.** The viewer and its transport sit inside the walker's page: the setup page
  (`startup.ts:71`) or the overlay's root (`overlay/index.ts:274`). Their controls are native buttons and one range input
  (`transport.ts:196`), the kinds `PAD_WALKED` visits (`startupNavigation.ts:9`). Cross clicks a button. Left and right
  on a range step it by its `data-pad-step` (`transport.ts:465`; the walker's range branch, `startupNavigation.ts:161`)
  and fire its `input` event, which seeks (`transport.ts:338`).
- **The walker's focus ring.** The class `is-pad-focused`, which the walker sets on the control it focuses
  (`startupNavigation.ts:94`, `:240`), rings the seek bar's band (`replays.css:87`).
- **The design system** (`shared/ds`, not the launcher):
  - the prompt classes of the hint row (`transport.ts:236-254`: `s2u-prompts`, `s2u-prompt`, `s2u-prompt__key`,
    `s2u-prompt__glyph--cross` and `--circle`; `shared/ds/components.css:471-482`). Their `is-pad` rule hides the row
    on a touch-only screen (see "Not done");
  - the token `--s2u-hit-min` (`replays.css:55`, `:57`, `:84`, `:102`; `shared/ds/base.css:59`).
- **Escape.** The viewer's Escape is Back (`view.ts:360`). It prevents the default, so a listener after it that heeds
  `defaultPrevented` (the launcher's fold, `launcher.ts:584-585`) does not also act. It leaves an Escape that something
  before it took. This is a convention shared with the launcher, not a call into it.
- **Unchanged from before RV-3:** `LauncherState` (`view.ts:3`, the disc's state for the Watch lock, MU.R3) and the
  `signIn` the launcher's context passes (`view.ts:58`).

### Not done, and why

- **The round's clock (M7's second half) is not shown.** It is not reachable from `ReplayClient` without new engine
  state:
  - `pageClock()` (RE-3, `replayClient.ts:336`) is the replay's own time in milliseconds, not the round's.
  - `stoppedFigure()` is the figure a seek left in a stopped period, and null while a clock runs.
  - The round's end (`FoldState.endsTick`, `launchEnds`) lives only inside a fold's state (`fold.ts`, `foldTo`), and
    `drawnFigure` is not exported.
  - The figure the player sees is the framed test room's `NetPage` timer (`netPage.ts:1134-1135`, its `endsAt` and
    `launchAt`).
  What would carry it: RV-5's watcher's HUD, which draws the original spectator's round clock in the world's frame
  (W39.R5). Or an additive `ReplayClient` reading of the round's seconds left (W39.R2), kept as the fold keeps
  `endsTick` while play goes on. That would be an engine change outside this task's files. The transport's time
  stays the recording's, now labelled as such.
- **No pad shortcut buttons** (L1 / R1 for the jumps, Triangle or Square for play). `padLayers.ts` cannot carry them
  additively without a second pad reader:
  - its readers are the keyboard's read, the walker, the launcher and START (`PadReader`, `padLayers.ts:35-37`);
  - on the page, L1 / R1 are the launcher's tiles and Triangle is the account (`PAD_LAYER_ROUTES_ADAPTATION`,
    `padLayers.ts:43-48`).
  A route for an open viewer would need a reader that polls the pad (the walker or the launcher, outside this task's
  files, or a new poll, which the brief forbids), and taking L1 / R1 or Triangle from the page would contradict the
  existing mapping. So every transport control is reached by the walk and Cross, and the bar's jump by the D-pad.
  `padLayers.ts` is not touched.
- **The hint row on a touch screen.** The design system hides `s2u-prompts` on a device with no hover unless the row
  carries `is-pad` (`shared/ds/components.css:481-483`). The launcher sets `is-pad` on its own action bar from its pad
  read (`launcher.ts:490-491`). The transport has no pad read, so on a touch-only screen its hint row stays hidden
  even with a pad connected. The tooltips and names are unchanged there.
- **The idle dimming** (M11) is not built and was not added: not in this task's brief, and MU.R13 F7's rule wants a
  fullscreen mode the viewer does not have yet.
- **The test room's controls** (T1-T8) are unchanged: they are the developers' tool (W39.R3).

### `ReplayClient` and the segment HTTP (W39.R2)

Unchanged: no change to `ReplayClient`, the `.s2r` format, the segment HTTP or `GET /replays`. Outside the engine,
for the page's readers: `TransportOptions` gains `frame` and `circleBack`, the transport exports `SEEK_BAR_KEYS`, and
the seek bar's element is now `[data-seek]` holding the range input. It was a `div[role="slider"]`. The viewer's Back
button's accessible name is now "Back to Replays" (it was its visible word, "Replays", which the name keeps).

### Evidence

Unit tests only (jsdom). No browser, game, dev server or match server was run, and nothing was seen rendered:
- the 44 px targets are read off the stylesheet's rules, not measured;
- the hover's and the hint row's look and the focus ring on the bar are unseen (RV-1's run is where they can be).

The walker in the tests is the real `StartupNavigation` on a fake standard pad, with the browser's layout mocked as
`padReach.test.ts` mocks it.
- `test/modern/replays/transport.test.ts`, "RV-3: the controls to release":
  - the walker reaches the seek bar and all nine buttons, and Cross runs each one's client call;
  - with the bar focused, the D-pad's right and left seek by the jump, the focus stays, and `aria-valuetext` follows;
  - the keyboard's arrows on the focused bar jump, and Space still toggles;
  - a 60-move drag over 15 frames makes one seek a frame at the latest move and one at the release's position; the
    move pending at the release is dropped; the note is raised once, while playing;
  - the hover's time;
  - the time as m:ss on a span that does not start at 0, labelled;
  - every control's name, `aria-keyshortcuts` and hint;
  - the step buttons advertising `,` and `.` alone, and the bar without a tooltip;
  - `circleBack`: the Circle "Back" wherever the focus is in the host, and a host's own button hinted by its name and
    caps; without it, no Circle;
  - the stylesheet's 44 px rules.
- The same file's older tests, changed for the new seek bar:
  - "a click on the seek bar" and RV-2's "a 3-move drag" now turn the fake frame; the drag makes two seeks, not
    three;
  - "draws the play state ..." reads the range input's value and maximum where it read the `div`'s `aria-valuenow`
    and `aria-valuemax`;
  - "dispose" looks for `[data-seek]`.
- `test/modern/replays/view.test.ts`, "RV-3: the viewer by pad":
  - the focus on the seek bar after Watch;
  - the walker reaching Back, both cameras and the transport (13 controls);
  - Circle closing the viewer and focusing the card's Watch, and taking nothing once the list is shown;
  - the Back button focusing the card;
  - the hint row in the viewer: Circle's Back on the bar, on Back and on each camera, Back's "Esc" and
    `aria-keyshortcuts`, Cross and the name on the cameras;
  - Escape closing the viewer, and an Escape another listener took first not closing it;
  - with the disc out, Back focusing the card itself (its Watch disabled).

### 2.1 Placeholders and adaptations

None new: no `*_PLACEHOLDER`, no `*_READING` and no new `*_ADAPTATION` constant.
- The pad's and the keyboard's step on the bar is the existing `MU_REPLAY_JUMP_SECONDS_ADAPTATION` (MU-10, `transport.ts`).
- The 44 px floor is the design system's `--s2u-hit-min` (`shared/ds/base.css`).
- The drag is held to the browser's animation frame, which is not a number this code chooses.
- The hint row has no delay.
- The Back link's rank 0 is an order, not a value: it puts the viewer's link ahead of the launcher's rank 10.

## 3. The list per account (RV-4)

Written 2026-10-11T04:34Z for RV-4 of web sprint 39 (W39.R4: the list is the page's own server, by the signed-in
account, H157's default; W39.R6: no launcher chrome). The server's half, the route's cursor and the sidecar's
`result`, is research 245 §8. This section is the page. The code: `packages/viewer/src/modern/replays/data.ts`,
`view.ts` and `replays.css`. Everything here is a browser adaptation (REPLAY_ADAPTATION, MU.R1): SOCOM II lists no
match.

### What the page does

- **Paging.** The first page is `source.list` as before, so Home's Recent matches card (its shared feed) sees it, and
  only it.
  - An answer with more after it ends the list with a **More** control: a native button, "More matches".
  - The next page is asked when the list's end is reached:
    - **by scroll**: an `IntersectionObserver` on More (`view.ts:340`), while More is idle, where the browser has one;
    - **by the pad**: the walker reaches More after the last card (a native button, `PAD_WALKED`), and Cross presses it.
  - The page is appended and the loaded cards are kept (`loadMore`, `view.ts:202`). A card the server sent again is not
    drawn twice.
  - Pressed, More hands the focus to the first card the page brought that the filter shows (its Watch, or the card
    itself while Watch is locked, RV-3's rule). A redraw of the list keeps the focus on the same control, whether a
    card's button, the filter or More (`focusKeyOf`, `view.ts:627`).
  - A failed page keeps the list and says so above More, which reads "Try again" and retries. Refresh starts again
    from the first page and clears the filter.
- **Where the next page comes from.**
  - `ReplayListSource.more` asks for it when the source has one.
  - The shell's source is Home's wrapper (`shareReplaySource`, `home/index.ts:136`, wired at `modern/index.ts:205`). It
    carries only `list`, so the page asks the same route itself (`httpReplaySource` at its base, `view.ts:211`). That
    is the same base the shell's source uses (both `accountServiceBase`), with the same bearer and no cookie.
  - The cursor of the first page survives the wrapper: `replaysOf` keeps an answer's `next` with the list it made
    (`nextCursor`, a `WeakMap`), and the wrapper returns the list as it came.
  - Passing `more` through the wrapper would make the page use it. That change is not in this task's files, and the
    fallback already reaches the same route.
- **The result on a card** (`resultWords`, `view.ts:99`), one line, minimal text (MU.R19), only when the record holds a
  `result`:
  - **the winner**, only for a match the room ended (`matchOver`), named as GAME COMPLETE names it: by the rounds won,
    `mp_score00 > mp_score08` SEALs, the reverse Terrorists (`CallRoundATie`; research 91 §18, 2.2; the page's own
    GAME COMPLETE, `roundScreens.ts:442`). Written "SEALs won" or "Terrorists won". On equal rounds GAME COMPLETE shows
    no winner, its caption " " on both sides (research 91 §18, 3, the `dlgMultiplayerFinalReally.rdr` row), so the card
    names none and shows the score alone. The record's `winner` is the last round's, which can differ (a last round
    drawn at the round limit), so the card does not name it;
  - **the rounds won by each side**, "SEALs 3 – 6 Terrorists" (the record's `wins`);
  - **how the record ended**: "Match over", or "Cut short" when the room had not ended the match (`matchOver` false: the
    file closed on a removal, an abandonment or an error).
  - The sides are named as research 91 names them (`aiteam_00` SEALs, `aiteam_08` Terrorists), the words the viewer's
    roster already uses. An older record shows nothing.
- **The filter by room** (`filterView`, `view.ts:296`) is a native select, "All rooms" and each room key of the loaded
  cards in the order first seen.
  - Its label reads "Room · filters the loaded matches". While a room is chosen, a note says "1 of the 2 loaded
    matches, in MP2/classic".
  - It asks the server nothing (the route's own `room=` exists, but a filter of what is loaded is what the brief asks).
  - The filter holds as More loads further pages.
  - A room key is set as text, never as markup.

### The spectator's mark: left out

The plan's row asks for "the spectator's matches marked as watched", if the sidecar already lets the page tell, for the
signed-in account, that it watched rather than played, with no new personal data. It does not:
- **The sidecar ties no role to an account.** `accounts` is the union of the seats' account ids over the match, players
  and watchers alike (245 §1), with no side. `players` holds names and their last side, with null for a name only ever
  seen as a spectator (`files.ts:154`; the lobby's `Member.team`, `net/lobby.ts:34`). The listing returns `players`
  and never `accounts` (245 §4).
- **The page could only guess by name.** A game's room names a seat by its account's name (`bridge.ts:39`), so the
  signed-in name with a null side in `players` would usually mean "watched". But:
  - the page holds the name as it was typed at the sign-in (`session.ts:249`), not as the account stores it, and the
    server matches names under `NAME_KEY_CASE_FOLD_PLACEHOLDER` (`serviceStore.ts:206`), so the two can differ in
    case;
  - a name is not the account, which is the visibility rule's key (W36.R2).
- **Telling it truly** would need the sidecar to hold each account's role (an account id beside a side), a new
  personal field the brief rules out. So no mark is drawn. A later task could add an additive, per-asker flag to the
  listing, computed by the server from such a field, once the owner's row on who sees what (H157) allows the field.

### Contacts with the launcher (W39.R6)

Nothing new beyond §2's list:
- More is a native button and the filter a native select, both kinds `PAD_WALKED` visits (`startupNavigation.ts:9`).
  Cross presses the button. The select takes the walker's focus ring (`is-pad-focused`, `replays.css`).
- The targets are `--s2u-hit-min` tall (`shared/ds`).
- No top bar, shelf, action bar or launcher region is read or written.

### `ReplayClient` and the segment HTTP (W39.R2)

- **`GET /replays`**: additive, research 245 §8. The answer gains `next`, an entry gains `result`, and a request may
  pass `before`.
- `ReplayClient`, the `.s2r` format, `/replays/<id>` and the segments: unchanged.
- Not the engine's surface, for the page's readers:
  - `ReplayListSource` gains an optional `more`;
  - `data.ts` exports `nextCursor` and `ReplayResult`, and `ReplayEntry` gains an optional `result`;
  - `view.ts` exports `resultWords`.

### Not done, and why

- **The spectator's mark** (above).
- **The winner is compared in the page, against the plan's outline.** The plan's RV-4 brief says the sidecar's result is
  "the final score by side and the winner, from the room's own score state at the match's end -- named at its `room.ts`
  read, never computed in the page". The room's own words are kept as it sent them (the sidecar's four fields, 245 §8).
  But the room's `winner` is the last round's (`room.ts:4679`), not the match's. The match's winner as the original
  shows it is GAME COMPLETE's own comparison of the rounds won, `mp_score00 > mp_score08` (`CallRoundATie`, research 91
  §18, 2.2 and 3), which the page's GAME COMPLETE already makes (`roundScreens.ts:442`). The card makes the same
  comparison on the room's `wins`, and names no winner on equal rounds, as GAME COMPLETE does. This departure from the
  outline's words was found by RV-4's review and kept on its word.
- **Where the browser has no `IntersectionObserver`**, scrolling does not load: More is still there for a click, a tap
  or the pad.
- **The filter covers only the loaded matches**, as the brief asks, and says so. A room whose matches are all on later
  pages is not offered until they load.
- **Seen rendered: nothing.** The card's result line, the filter and More have not been looked at in a browser (RV-1's
  run).

### Evidence

Unit tests only (node and jsdom). No browser, game, dev server or match server was run.
- `test/modern/replays/data.test.ts`, "RV-4: the cursor and the result":
  - `result` read field by field, absent when not sent, a refusal when of another shape;
  - `next` kept with its list, none when absent, a refusal when not base64url;
  - replays started in the same millisecond kept in the order the server sent them, across a page's edge too (the
    entry carries no `endedAt`, the server's tie key, so `replaysOf` sorts by `startedAt` alone, stably);
  - `more` asking `/replays?before=<cursor>` with the bearer, no cookie and no redirect, and its failure said by kind.
- `test/modern/replays/view.test.ts`, "RV-4: the list per account":
  - More asking the next pages and keeping the first, none after the last page, and Refresh starting again;
  - More scrolled into view asking once while it loads, with no observer left after the last page;
  - the walker reaching More after the last card, Cross asking, and the focus on the first new card's Watch;
  - the shell's wiring (Home's `shareReplaySource`) paging through the route at the page's base, Home's feed keeping
    the first page;
  - a failed page keeping the list, said, and More retrying;
  - each card's result: a terrorist win, a SEAL win by the rounds won after a drawn last round, a match cut short, a
    respawn match on equal rounds (the score alone, no winner word), and an older record with none;
  - the filter: its options, its label, its note, holding over More, a room key as text, and back to all.

### 3.1 Placeholders and adaptations

None: no `*_PLACEHOLDER`, no `*_READING` and no new `*_ADAPTATION` constant. The page's size is the server's
`REPLAYS_LIST_MAX_PLACEHOLDER` (245 §4.1). The cursor is the server's token, and the page checks only that it is
base64url.

## 4. A report's clips and its replay (RV-11, LATER 30)

Written 2026-10-11T05:29Z for RV-11 of web sprint 39 (LATER 30; research 249 §7.3, RE-5's runs 10 and 13; the report's
page and HTTP, research 243 and 247). The code: `packages/playtest/src/report/page.ts` (the card's clip, :217-220) and
`packages/playtest/src/report/http.ts` (`byteRange` :63, `sendClip` :81, `evidence` :101 and :114). The playtest
report is the project's own instrument (PLAYTEST_INSTRUMENT_ADAPTATION, research 243): SOCOM II has no such page, and
nothing here reads or changes a game value or behaviour.

### The suspicion

LATER 30, from RE-5 (249 §7.3): runs 10 and 13 hung while opening the report's replay frame, and run 12 did not. The
live report puts one `<video controls preload="metadata">` per mark with a clip (`page.ts` :217 before RV-11), and
`GET /evidence/<observation>/clip.webm` served the clip whole. The clips share the session service's origin with the
replay's segment reads (`GET /segments/<n>.s2r`, `segmentsHttp.ts`), and Chromium allows six connections a host. The
suspected cause: six clips taking all six connections, so the segment reads wait. Unproven.

### What was measured (unit tests, no browser)

`packages/playtest/test/reportClipRange.test.ts`, against a real `SessionService` on port 0 (as `reportHttp.test.ts`
does), on the owner's host, Node 24.13.1. Node's own HTTP client stands in for the browser: an `Agent` with six sockets
to the one host, and a reader that takes the answer's first chunk and stops reading.
1. **The route ignored `Range`.** Before RV-11, `Range: bytes=0-1023` on a 32 MiB clip was answered 200 with all
   33 554 432 bytes (the RED run: `expected [ 200, 33554432 ] to deeply equal [ 206, 1024 ]`). An open range, a
   suffix, a range past the end and a HEAD with a range were all answered 200, with no `Content-Range` and no
   `Accept-Ranges`. At the source: `evidence` (`http.ts` :53-66 before RV-11) ended in
   `send(res, 200, type, readFileSync(path))` and read no header.
2. **A clip asked whole and not read holds its connection.** Six clips asked whole, each read for one chunk and then
   left, took all six of the agent's sockets. A seventh request, `/segments/0.s2r`, was not answered within 500 ms. It
   was answered once the six were dropped. This holds before and after RV-11, since a request with no `Range` is still
   answered whole.
3. **What is held is the reader's connection, not the service's writer.** The service hands the whole clip to its
   socket at once (`res.end` of the file, read whole). In the first RED run, all six of those responses had finished
   writing (`writableFinished`) within the 500 ms, though their reader had stopped. The run's failing assertion counted
   the unfinished ones: `expected [] to have a length of 6 but got +0`. This was seen once, on this host, and it rests
   on the host's loopback buffers, so it is recorded here and not asserted.
4. **With the fix, a ranged read frees its connection.** Six clips asked `bytes=0-1023` were each answered 206 with
   1024 bytes, each finished on the service's side, and the seventh request was answered within 500 ms.

### What was not measured

- **What Chromium does with the report's videos is not measured.** No browser was run for this task. Still unseen:
  - which `Range` (if any) Chromium sends for a clip;
  - whether its metadata read goes on to the WebM's end;
  - whether it keeps or drops a connection it has stopped reading;
  - whether six such videos block the replay frame's segment reads.

  Runs 10 and 13 are **not proven** to be the clips. The HTML standard makes `preload` a hint to the user agent, so
  `none` is what the page asks, not a measured behaviour.
- **Run since (2026-10-11 21:14Z, the sprint 39 close's record):** `reportClips.spec.ts` (§10), on `6c30e6678`, **1
  passed (42.0 s), 0 skipped** -- a rendered browser run, headless Chromium, automated input, the merge controller's
  (the plan's Log, 2026-10-11T21:14Z). It saw: six marks, six clips kept; the report's six videos asked nothing before
  play (each `readyState` 0; the box 584 x 150 css px before play, the cosmetic note below); the replay frame up with
  `/segments/0.s2r` answered 200 beside the six videos; play on one clip asked `bytes=0-`, answered 206. So the check
  below is paid as far as that run reads; what caused RE-5's old hangs (runs 10 and 13) is still not shown, and whether
  Chromium keeps or drops a connection it stopped reading is not read by it. The text that follows is RV-11's, kept.
- **The rendered check is owed to the controller's browser window** (RV-1's run, or one of its own). It needs a closed
  session's report with six or more clips: open it and confirm the replay frame comes up and its segment reads are
  answered. A run should also record, in the network panel, whether any clip is asked before its play is pressed, and
  which `Range` the play then sends. Two things for that run (RV-11's review, F4):
  - `packages/viewer/e2e/replayEngine.spec.ts` :557-562 aborts every `clip.webm` request on the report page, so it
    cannot show this. The check is its own run, or that spec without the abort. Its comment still says
    `preload="metadata"`; the spec is outside RV-11's files and is not edited here.
  - Before play, a `preload="none"` video has no frame to size it by, so it may draw at the default 300x150 box,
    stretched to the card's width by the page's `.pt-cards video` rule (`page.ts` :220, :366). This is cosmetic, and
    that run should look at it.

### What changed

- **The page** (`page.ts` :217-220): each mark's clip is `<video controls preload="none">`, live and static (the
  export's page). The clip is asked only when the player presses play, and the frame above it already shows the
  moment. The comment labels it as the instrument's adaptation.
- **The clip route** (`http.ts`): the clip, and only the clip, answers one byte range to a GET:
  - `byteRange` reads `bytes=<first>-<last>`, `bytes=<first>-` and `bytes=-<suffix>` (RFC 9110 §14.1.2), and clamps
    the end to the file;
  - a satisfiable range is 206 with `Content-Range: bytes <first>-<last>/<size>`;
  - a range that starts at or past the end, a suffix of 0, or any range of an empty file is 416 with
    `Content-Range: bytes */<size>` and a short text body;
  - every clip answer, the 416 included, says `Accept-Ranges: bytes` and carries `Content-Length` (the clip's 200
    went chunked before, as `send` does);
  - several ranges, another unit, an unreadable range or any `If-Range` (the route sends no validator, so none can
    match: RFC 9110 §13.1.5) get the whole clip, 200, as before; RFC 9110 §14.2 lets a server ignore a `Range`, and
    the brief accepts a multi-range request answered whole;
  - the range is read on a GET only. RFC 9110 §14.2 has a server ignore `Range` on any other method, so a HEAD with
    a range is the whole clip's 200: its headers, with the whole `Content-Length` and no body (RV-11's review, F1).
- **What did not change.** The route's checks are as they were and run first: the peer and Origin rule, the method,
  the decode, the two parts, `OBSERVATION_ID` and `FILES`, and the resolved path. The range is read only once the file
  is found. `reportHttp.test.ts` passes unchanged. The frame and the telemetry take no range. The clip is still read
  whole from disk on every request, and a range is a slice of it.

### `ReplayClient` and the segment HTTP (W39.R2)

Unchanged: `/segments`, `/segments/<n>.s2r`, `ReplayClient` and the `.s2r` format. The report's own clip route gains
its range answers additively, and it is not the engine's surface.

### Not done, and why

- **The rendered check** (above): no browser in this task, by the host's rule for it.
- **Research 249 §7.3** gets only a one-line pointer to this section, added at the review's word (F3). The plan's
  RV-11 row names it, but the brief named only this section and LATER 30. The finding is recorded here, and 249
  §7.3's "not proven" line stays true.
- **The frame and the telemetry** take no range, since neither is a media element's read.

### Evidence

Unit tests only (node and jsdom). No browser, game, dev server or match server was run.
- `packages/playtest/test/reportClipRange.test.ts` (new, 10 tests):
  - "LATER 30, the measurement": items 2 and 4 above;
  - "RV-11: the clip route answers a single byte range": no Range (200 whole, `Accept-Ranges`), `bytes=0-1023` (206,
    1024 bytes, `Content-Range: bytes 0-1023/5000`), an open range, a suffix, an end past the file, `bytes=0-`, 416
    past the end with its `Content-Length`, the ignored forms, a HEAD's range ignored (200), the frame, and the route's
    403 and 404 with a range;
  - `byteRange`'s table.
- `packages/playtest/test/reportPage.test.ts`: "RV-11 (LATER 30)", the clip's `preload` is `none` on the live and the
  static page. The file's jsdom globals rule (RE-9) is kept.
- `packages/playtest/test/reportHttp.test.ts`: unchanged, 8 tests passing.

### 4.1 Placeholders and adaptations

None: no `*_PLACEHOLDER`, no `*_READING` and no new `*_ADAPTATION` constant. `preload="none"` and the range answers
are the report's own, under PLAYTEST_INSTRUMENT_ADAPTATION (research 243). The playtest package is outside research
101's round ledger (243 §3). The test's 32 MiB clip and its 500 ms wait are the test's own, not product values.

## 5. A player's blast death at its age (RV-6)

Written 2026-10-11T05:49Z for RV-6 of web sprint 39 (research 249 §7.2, "A player's blast death, drawn at its age:
owed", and §7.3, case 5 at D). The code: `packages/viewer/src/replay/fold.ts` (`REPLAY_CORPSE_LANDING_READING` :248,
`heldLanding` :251, and its one use in `foldedJoin` :515-516). The test: the new file
`packages/viewer/test/replayBlastFall.test.ts`; at the review's fix round, RE-5's spec case 5
(`packages/viewer/e2e/replayEngine.spec.ts` :732-739) and dated pointers in 249 §7.2, §7.3 and 244 §7.2. Like the rest of the replay, this is a browser adaptation
(`REPLAY_ADAPTATION`, research 240 §3; PT.R3), and nothing here reads or changes a game value or behaviour.

### The brief's premise, read at the source

The brief and 249 §7.2 say the recording cannot tell which fall a blast's corpse lies in. Their reason is that `blast`
goes to its victim by `send` (`room.ts:4064-4067`), and only `Room.broadcast` hands an event to the recorder
(`room.ts:5159-5163`). Both facts hold, but the conclusion does not follow, because the fall rides the snapshots:
- `Room.snapshots` hands the recorder every body (`room.ts:5120-5132`), each built by `Room.body` (:5147-5153) through
  `bodyOf`. `bodyOf` writes the mover's action and its clock: `action`, `actionSerial`, `actionT` and `actionSeconds`
  (`packages/viewer/src/net/body.ts:51-52`).
- Protocol 6 gave the knock's fall and landing their codes (`ACTION_CODES`, `net/protocol.ts:336-341`).
- The room ticks a corpse's mover every tick (`Room.corpse`, `room.ts:2148-2152`). The corpse is thrown in
  `fallForward` or `fallBackwards` (`Walker.knock`, `mover.ts:2006`), lands in `landDeath` or `landBackwards`
  (`Walker.land`, :2508-2512), and holds that landing on its end, dead (`runClocks`, :2190-2195). This is the room's
  transcription of `FUN_0057e770` / `FUN_005807d0` / `FUN_005805b0`, as cited in `net/blast.ts` `blastKnock`. It was
  not re-read at the decompilation for this task.
- The new test holds this on a real `Room`. It takes `roomBlast.test.ts`'s lethal M67 at the thrower's feet, records it
  through `FileRecorder`, and reads it back with `decodeRecords`. The kill names no clip. No `blast` event is in the
  recording. The victim's recorded snapshots show one fall (`fallForward` in this run), then `landDeath`, held at
  `actionT` = `actionSeconds`.

**Why the corpse was drawn at key 0** (249 §7.3). The page draws a body that has no death clip from its snapshot's
action. The animator starts every new play at phase 0, whatever the snapshot's clock says (`animator.ts:565`, `start`
:685-698). So after a seek, the held landing starts again at its key 0, and a paused replay leaves it there. The
landing's own clock (`actionT`) is in the recording; the page does not read it.

**So nothing new is recorded.**
- No record kind, no `RoomRecorder` member and no room line. The `room.ts` window granted for RV-6 was not used, and
  `room.ts` is untouched (the hunk claim in HANDOFF §3 can be released).
- The format, its version (2) and the recorder are unchanged.
- A recorded `fall` would have repeated what every snapshot already holds, and only for the cases that pass through
  `layKnock` (below).

### The lethal blast in a move (`KNOCK_LETHAL_IN_MOVE_READING`)

When a blast kills a SEAL in a move (`net/blast.ts:79`, 'kill-releases'), `Room.blast` lays no knock
(`room.ts:4062-4063`). `k` is null and the `blast` event's `knock` is null, so the briefed line would have recorded
nothing there. `kill` releases the move instead (`releaseMove`, `room.ts:4245`). The corpse falls from where it was and
lands in whatever `Walker.land` gives a dead body (`mover.ts:2513-2520`):
- `landDeath` when the contact speed is over `land_hard_fall_rate`. The fold covers this case as it covers a blast's;
- the soft `land` when still, or no landing clip at all. These are told as before.

No second room line would have helped, and none is needed.

### The fold, and how the page is told

In `foldedJoin`, a corpse is told in its landing when three things hold:
- its kill named no clip;
- the target's snapshot holds its body dead;
- that body's action is `landDeath` or `landBackwards`.

It is told with that landing's clip (`SEAL_ANIMS`: `seal_landforward01` / `seal_landbackwards01`,
`locomotion.ts:54-56`), at the death's age (the target less the kill's tick), as every corpse is.

The welcome already carries this. Its join envelope's corpse is one clip at one age (`JoinCorpseWire`), so no field is
added. The page lays it through `applyJoinState` (`joinState.ts:79-82`), then `RemotePlayers.hydrateCorpse`
(`remotePlayers.ts:624-630`), then, each frame, `deathPose(clip, deadFor)` (:560, :154-161). That draws the clip at the
age and holds it on its last key. It is the path PTT-6's bullet corpse and RE-2's hostage corpse already take.

RE-1's way of telling a dance (a `victory` with `elapsed`, `Play.startVictory`) cannot carry a corpse:
`RemotePlayers.frame` stops a dead body's dance (:559).

**Told as before:**
- a kill with a clip of its own: a bullet's, or a prone blast's (`deathClip('blast', ...)` prone, the BODY list);
- a body still in the air at the target;
- a body holding no landing;
- a hostage (RE-2's `hostages`).

### What a watcher now sees

- **A seek after the body has landed** (a blast's death, or a hard-fall death): the corpse in its landing at the death's
  age, held on its last key, as the room holds it. Before, it was the landing's key 0. This holds paused or playing.
- **A seek inside the landing** (`REPLAY_CORPSE_LANDING_READING`'s window): the pose runs ahead of the room's by the
  time the body spent in the air. Two clocks meet here:
  - the room's mover holds its landing after 0.331 s (`ACTION_SECONDS`, `oneShotSeconds` of `ACTION_CLIPS`,
    `mover.ts:720` and :731);
  - the page's `deathPose` reaches the landing's last key at the death's age of 0.4 s (its `motion.rdr` playback).

  The time in the air runs from 0 to about 0.85 s (the knock's rise at most `KNOCK_SPEED_MAX`, 100 u/s, against a
  gravity of 235). It is about 0.42 s at the `KNOCK_RISE` floor (50 u/s) of a close blast. So a seek inside the landing
  of a close lethal blast draws the landing's last key while the room's body is still early in it.
- **Measured, the 0.5 s case** (the real room's run, `replayBlastFall.test.ts`):
  - the kill at tick 242; the first snapshot in the landing (`landDeath`) at tick 268, its `actionT` 0.017 s, so
    about 0.42 s in the air;
  - at kill + 30 ticks (0.5 s) the room's body is 0.083 s into its 0.331 s landing, while the page, told 0.5 s, draws
    the landing's last key.

  The 0.5 s assertion is therefore inside the reading's window, and the test labels it so. The exact case is the
  seek past the landing (kill + 1 s), with the room's body held (`actionT` = `actionSeconds`) and the page told 1 s:
  both on the last key. A test of its own holds it.
- **A seek while the body is in the air:** as before. The fall plays from its key 0, and the landing follows on play.
  Paused, the body stays at the fall's key 0. A clip told here would hold the fall through the landing
  (`RemotePlayers.frame` :560), so none is told.
- **Play with no seek:** unchanged. The watcher sees the fall as a live page sees another player's, from the
  snapshots' actions, and the kill is told once with no clip. The test plays through the death and sees `died` once, no
  corpse laid, and one fall, then its landing, in the bodies.

### What is still not shown

- **The rendered check is owed.** No browser was run. RE-5's spec case 5 asserted that the corpse's `deathClip` at D
  is the kill's clip (null for a blast), which would now fail: the frag killed in every green run, at ages 1.75-2.47 s,
  with the body landed. At the review's fix round the assertion was edited by reading
  (`packages/viewer/e2e/replayEngine.spec.ts` :732-739). It now expects the kill's clip, or, for a kill with none, the
  landing the body holds at D in the recorded snapshot (`ACTION_CODES`, `SEAL_ANIMS`), as the fold tells it. That edit
  has not been run. Its browser run, and with it the drawn pose at D, are owed to the controller's browser window
  (RV-1 or RV-8).
  *Run since (the sprint 39 close's record; the plan's Log):* `replayEngine.spec.ts` whole, rendered (headless
  Chromium, `--workers=1`, the merge controller's slot): 2026-10-11 21:45-21:48Z on `1ebb0f3c9`, 12 passed, 1 skipped
  (the then-fixme of RV-8d), "RV-6's corpse green"; 2026-10-12 on `8e293bc47`, between 10:39Z and 10:48Z (before the Log's 2026-10-12T10:52Z entry), **13 passed, 0 skipped**. Case
  5's assertion held in both. The Log does not record whether the frag killed in those runs (without a kill the case
  logs so and makes no assertion at D), and the case reads the corpse's bookkeeping through `devSeen()` (its clip and
  its age), not the drawn pixels, so the drawn pose at D is still not seen.
- **The in-air pose at its age, and the landing's age inside its window.** These need the page to pose a corpse at an
  age other than the death's. The exact fix is an additive pose age on `JoinCorpseWire`, read by `hydrateCorpse`; the
  corpse's `age` cannot carry it, because it also drives the fade (`BODY_FADE_S`). Another fix would be the animator
  starting a play at the snapshot's clock (`animator.ts` `start`, reached through `play.ts`). Both are outside RV-6's
  files. The animator's restart also makes a live joiner see a landed corpse's landing from key 0, played through; the
  joiner's look is a capture gate (`CORPSE_HYDRATE_READING`).
- **Research 249 §7.2's premise** ("the recording cannot say otherwise") is corrected here. At the review's fix round,
  dated pointers to this section were added in 249 §7.2 and §7.3 and in 244 §7.2.

### `ReplayClient` and the segment HTTP (W39.R2)

- **`ReplayClient`:** no signature changes. What a seek's welcome tells changes additively: `join.corpses[].clip` may
  now name a landing clip for a corpse whose kill named none. That field is already in the welcome.
- **The format, the recorder and the segment HTTP:** unchanged. No record kind was added, and the version stays 2.

### Not done against the brief, and why

- **No `RoomRecorder.fall?`, no `fall` record and no `room.ts` line.** The recording already holds the fall (above).
  The rule for a wrong brief is to do the nearest correct thing and say so, and adding them would have recorded a copy
  of the snapshots' state.
- **No older-reader skip test.** No kind was added. The skip itself is RE-2's (`decodeRecords`, format 2) and is
  unchanged.
- **No no-recorder digest test.** `room.ts` is untouched.
- **The brief's "tells the corpse's fall at 0.5 s"** is read as the corpse's pose at 0.5 s. In the real room's run
  the body is 0.083 s into its landing at 0.5 s, so the page is told the landing at 0.5 s and draws its last key. That
  is inside the reading's window (above). The exact case is the seek past the landing. A body still in the air is told
  as before, for the reason above.

### Evidence

Unit tests only (node and jsdom). No browser, game, dev server or match server was run.
- `packages/viewer/test/replayBlastFall.test.ts` (new, 6 tests):
  - a real room's lethal blast as recorded: no clip, no `blast` recorded, one fall then its landing, held;
  - the exact case (the review's fix round): a seek 1 s after the real death, with the room's body held on its
    landing, tells the corpse `(1, 'seal_landforward01', 1)`;
  - a seek 0.5 s after the real death tells the corpse `(1, 'seal_landforward01', 0.5)` while the room's body is
    still inside its landing (`actionT` < `actionSeconds`, asserted and labelled: inside the reading's window). A seek
    before the death tells none;
  - play through the death: `died` once with no clip, no corpse laid, one fall then its landing;
  - synthetic segments:
    - a body in the air is told null;
    - a landed one is told `seal_landbackwards01`;
    - a kill's own clip is kept;
    - a body with no action is told null;
    - `landDeath` is told `seal_landforward01`.
  - The RED run (5 tests then) had 3 of these failing (each told null). Two passed before the change, because they
    hold the recording and the play path that the change leaves alone. The exact case was added after the change, at
    the fix round, so it has no RED run of its own.
- Unchanged and passing: `replaySeekFold.test.ts` (12), `replayFoldResidue.test.ts` (21), `replayFold.test.ts` (3),
  `replayHostages.test.ts` (9), `replayClient.test.ts` (19); at the fix round, `netPageClock.test.ts` (8).
- `packages/viewer/e2e/replayEngine.spec.ts` case 5: edited by reading at the fix round, **not run** (no browser in
  this task). Run since: green in the whole file's runs of 2026-10-11 21:48Z (`1ebb0f3c9`) and 2026-10-12
  (`8e293bc47`, between 10:39Z and 10:48Z, before the Log's 2026-10-12T10:52Z entry), "What is still not shown" above.

### 5.1 Placeholders and adaptations

| name | value | where | status |
|---|---|---|---|
| `REPLAY_CORPSE_LANDING_READING` | 'the landing held, at the death age' | `packages/viewer/src/replay/fold.ts` | reading (re-read by RV-6's fresh review before its merge, `84ca2a88d`, 2026-10-11T06:05Z: PASS WITH FINDINGS, high; the plan's Log). The rule (a corpse whose kill named no clip is told in the landing its body holds at the target, at the death's age) is exact once the room's landing is held (0.331 s, `ACTION_SECONDS`) and the death's age is past `deathPose`'s 0.4 s playback. Before that it runs ahead by the time in the air: 0 to about 0.85 s (rise at most 100 u/s, gravity 235), about 0.42 s at the `KNOCK_RISE` floor of a close blast (measured: kill tick 242, landing from tick 268). A seek inside the landing of a close lethal blast therefore draws its last key. A body in the air is told no clip. The exact fix that retires it is an additive pose age on `JoinCorpseWire`, read by `hydrateCorpse`; the `age` also drives the fade, so it cannot carry the pose age. It is not a game value: the original replays nothing |

No `*_PLACEHOLDER` and no new `*_ADAPTATION` constant. The value is the viewer's; research 101's round ledger scans the
viewer's sources too (`tools/test/roundLedger.test.ts`), so it has its row in 101 §5 (*corrected 2026-10-12, at the
landing: this said the ledger took no row*).

## 6. The smoke remnant (RV-7)

Written 2026-10-11T06:29Z for RV-7 of web sprint 39 (research 249 §1, "Not folded, owed", and §5, "Not cleared"; this
note's §1, the seek note's smoke and scorch clauses). The code: `packages/viewer/src/matchActions.ts` (`followSeek`
:145-150, the `grenade` dep :53), `packages/viewer/src/replay/fold.ts` (`FoldedSmoke` :210, `isSmoke` :238,
`REPLAY_SMOKE_FLIGHT_READING` :261, the throw folded :430-436, the air's clears :337 and :357, `statefulRecord` :525,
`foldedJoin`'s `hull` :572 and :587-590, `foldedSmokes` :665) and `packages/viewer/src/replay/replayClient.ts`
(`ReplayClientOptions.hull` :96-102, its reads :228 and :404-405). The tests: the new file
`packages/viewer/test/replaySmoke.test.ts` (a real `Room`) and `packages/viewer/test/replayAir.test.ts` (the RV-7
block, and the live path's case). Like the rest of the replay, this is a browser adaptation (`REPLAY_ADAPTATION`,
research 240 §3; PT.R3): it changes no game value or behaviour. What the seek lays is what the room's join tells a page
joining at the target. No browser, game, dev server or match server was run.

### What a round's start clears, read first

- **The page's round start** is the throwables part's `roundStart` (`matchThrow.ts` :460): `clearAir`, then
  `clearScorches`, then the flashbang's wash. `main.ts` reaches it through its `clearAir` round hook (:353, via
  `armoryGlue.ts` :29-30); the front end's match through `roundClear` (`matchMount.ts` :576).
- **`clearAir`** (`grenade.ts` :763-767) drops the projectiles and only strips the pids from the smokes still pouring. The
  smoke itself pours on: the puffs outlast the gap between rounds (research 231 §2). So a round's start does not stop a
  pouring smoke either. It clears the scorches (`clearScorches`, `grenade.ts` :747-754: the round's end in the
  original, CMPExitState `FUN_00223970` L76084, as its doc cites).
- **Where a pouring smoke lives** on the page, in one of two places:
  - the effects player's run of `smoke_grenade` (an observer's) or `JOIN_SMOKE_STREAM` (a joiner's). It is started
    through the grenade page's effect door (`setEffectPlayer`, `grenade.ts` :1644; wired at `matchThrow.ts` :250 to
    `Effects.play`, `effects.ts` :329-331), which answers yes or no and keeps no handle;
  - the placeholder puffs, `GrenadeThrower`'s private `smokes` (`grenade.ts` :1687, drawn by `smokeFrame` :1709), only
    on a map whose archives lack the program.
- **No existing method stops a pouring smoke alone.** `Effects.reset` (`effects.ts` :496-509) stops every run,
  including the map's ambient effects: it is a new map's. `GrenadeThrower.reset` (`grenade.ts` :770-790) is also a new
  map's (the pouch refilled, the logs emptied) and does not reach the effects player's run. Neither is a seek's.

### What a seek now clears

The scorches. `followSeek` (`matchActions.ts` :145-150) calls the `grenade` dep's `clearScorches` beside RE-4's
`clearAir`, in that order, at each seek and before anything of the target is told. `MatchActionsDeps.grenade` gains
`clearScorches?(): void`. It is optional: a page that does not hand it clears none. Both pages already hand the
`GrenadeThrower` itself (249 §5), so it reaches the part with no wiring. Play, a step on and the live path call neither
clear: a live `NetClient` has no `onSeek` (249 §5), unchanged.

The rule is the join's. A page joining the room holds no scorch from before its join: `hydrateLive` lays no mark, and
231 §2 records a hydrated charge's blast drawing none. So after a seek the page holds the scorches made from the target
on, as a joiner would. The target's own earlier scorches are not laid (below).

**The trade** (the review's L1). A backward seek no longer shows marks from later in the round or from another round,
which were wrong at the target. A forward seek within a round, or a one-snapshot step back, now drops marks that were
right there: a blast earlier in the same round left a scorch the room's page would still draw. That is what a page
joining at that tick sees, and the seek follows the join rather than keeping what play happened to draw.

### What a seek now lays

- **How the room tells a joiner a smoke.** `Room.hello` puts `join: this.joinWire()` in the welcome (`room.ts` :1398).
  `Room.joinWire` (:5170-5178) hands `joinWire` (`match/src/joinState.ts` :68) every flying projectile not removed.
  An AN-M8 stays in the flying list until its `Timer2`, so its entry is the smoke's phase
  (`SMOKE_PHASE_ON_WIRE_READING`, 231 §2). There is no separate field. The page lays the entry through `applyJoinState`
  (`viewer/src/joinState.ts` :66-78), then `NetPage.joinSinks` (`netPage.ts` :1163), then
  `GrenadeThrower.launchRemote`'s hydrate (`grenade.ts` :1358, `hydrateLive` :1449). That draws the canister and the
  stream (`JOIN_SMOKE_STREAM`), or the puffs from the detonation's age, and nothing is heard (231 §2).
- **What the recording lacks: where the canister lies.** The room broadcasts nothing when a smoke rests or pours. Its
  place at the target is the room's flight:
  - `Room.throwGrenade` (:3596) launches it with `launchGrenade(from, velocity, record)` and broadcasts that `from`,
    `velocity` and `pid` (:3615-3617);
  - `Room.flyGrenades` (:3864) then advances a `GameFrameAccumulator` one tick a step and runs `stepGrenade` once per
    game frame over `hullCast()` (:3566: `gridCast` of the map's grid with its `DefaultMaterial`).

  An AN-M8 is not an impact round (no `bodyCast`), has no proximity and is not `Volitile` (`AN_M8`,
  `scene/src/projectile.ts` :150-156). So its flight depends on its launch and the hull alone. `stepGrenade` (:1021)
  draws no random number.
- **The fold flies it again.** The fold keeps each AN-M8's `grenade` event (`isSmoke`: the page's own rule,
  `grenade.ts` `detonationOf`, `Explosion_Radius` 0). At the welcome it flies the canister from the throw to the target
  as the room does, over the page's hull (`REPLAY_SMOKE_FLIGHT_READING`), and lists it in the envelope's `projectiles` as
  `joinWire` would: place, velocity, state, age, fuse and removal in ticks, bounces, dud. It leaves it out once removed.
  The list is in the room's flying order (by pid, which `Room.flyer` gives in launch order). The air's clears at a round
  start and an abandon drop the fold's smokes, as `Room.clearAir` empties its flying list.
- **`Timer1` and `Timer2`** are the throw's record, the same record the room flies:
  - the fold's `throwable` lookup: the page's records, else the baked set (249 §1);
  - the room's `Room.throwable` (`room.ts` :3585-3589): the kit table's, else `BAKED_THROWN`;
  - the disc's reader for both is `throwableRecord` (`scene/src/projectile.ts` :320: `Timer1`, `Timer2` of
    zweapon.rdr), through `KitTable.throwables` (`scene/src/arsenal.ts` :421);
  - the baked `AN_M8` holds 3 s and 40 s.

  No window is coded apart: `stepGrenade` detonates the canister at its fuse and removes it at its removal, as in the
  room.
- **Thrown, not only pouring.** The brief asked for a smoke still pouring at the target. The room's join also lists the
  AN-M8 before its fuse (in flight or at rest), and so does the fold. The page then flies it on and it pours in play,
  through its own `explode`: heard and seen as an observer sees it, a moment after the target, not a replay of the
  skipped span. Without it, a seek just before a smoke's fuse would draw no smoke until the next throw.
- **The gate.** With a hull handed, a smoke's throw counts as state for PTT-6's gate (`statefulRecord`'s `smokes`), as a
  charge's placement does (249 §1), so a page is told a welcome once one lies behind a playhead.
- **Held against the room.** `replaySmoke.test.ts` records a real `Room` on the flat floor, with a throw made as
  `room.test.ts`'s M-8 thrower makes one. At four ticks a watcher joins the room, and the room's own welcome envelope is
  the expected value. For a throw decided between two steps the seek's welcome equals it entry for entry: in flight
  (throw + 20 ticks), pouring 5 s in, 1 s before `Timer2`, and none after it. A throw decided inside a step -- the live
  page's usual case: its throw names the command sent with it (`NetPage`'s `lastSeq()`, `netPage.ts` :979), so the
  room waits for that command (`Room.timed`, `room.ts` :1991-1997) and decides it in the step that runs it (`settle`,
  :2003 and :2241), before that step's `flyGrenades` (:2048) -- is recorded at that step (`broadcast`, :5160), whose own
  flight already moved it once. The fold starts at the next step, so it can trail the room by one game frame (about
  two ticks) for about half of the targets: the review's M1, held by the second block of `replaySmoke.test.ts` (same
  canister and state, its clock at most one frame behind, in flight at most one frame's travel apart).

### Not cleared, not laid: what still is not

- **A smoke pouring at the old playhead is not stopped at a seek** -- retired: PAR-45's `GrenadeThrower.clearSmokes`
  (`grenade.ts` :1692) stops it, called by RV-7c-1's `followSeek` (`matchActions.ts` :156); RV-7c-2 below. The text
  that follows is RV-7's, kept as written. (The brief's step 1, stopped and reported.) It needs
  methods in the gameplay seat's files. Stopping the handle of the run the door starts is not enough: an observer's
  smoke is `smoke_grenade`, whose `call` op starts `smoke_stream` as a run of its own with no link back
  (`Effects.begin`, `effects.ts` :680-683), and the stream's puffs emit while that run lives (`particles.emit`'s
  `() => !run.finished`, :736). Stopping the parent alone would leave the stream pouring (the review's M2). In order:
  - `effects.ts`: a `call` records the run it starts on the caller's `RunContext` (its children), and the handle's
    `stop()` (`run`, :338) stops the run's descendants too, recursively; optionally the particle system also drops the
    puffs those runs left in the air (the system has no such method today);
  - `grenade.ts`: `setEffectPlayer` (:1644) takes a callback that returns the `EffectHandle` (or null), a private list
    of smoke runs is filled where `Live.effectSmoke` is set (:1478 for a joiner's stream, :1679 for an observer's
    `smoke_grenade`), the placeholder puffs (`smokes`) are tagged as the seek's to clear, and a `clearSmokes()` stops
    every listed run and empties `smokes`;
  - `matchThrow.ts` :250: the door returns `Effects.run`'s handle (`effects.ts` :334-339) instead of `play`'s yes or no;
  - then one line here: `MatchActionsDeps.grenade` gains `clearSmokes?(): void`, called in `followSeek` beside
    `clearScorches`;
  - and only then the hull's wiring (below), or a seek inside a smoke's life draws it twice (next item).

  Nothing of this was added. The same handle would also let a rejoin's stream be stopped (231 §2,
  `JOIN_SMOKE_LOOK_READING`, names that handle as owed).
- **A seek inside a smoke's life draws it twice** -- retired by PAR-45 and RV-7c-2 (below): `clearSmokes` stops the
  old runs and deletes the `effectSmoke` marks before the welcome, so the hydrate lays one stream. RV-7's text:
  `clearAir` drops the live entry that carried `effectSmoke`, so the
  hydrate's guard against a second stream (`launchRemote`, `grenade.ts` :1369-1383) finds nothing, and the welcome lays
  a second stream (or a second set of puffs) beside the one still running, until the old stream's emission ends. It
  holds until `clearSmokes` lands. The hull's wiring (next item) should land with it or after it.
- **The hull is not wired, so nothing is laid yet in either viewer** -- retired by RV-7c-2 (below), which wired it with
  the shape below changed to a hook (`ReplayPageHooks.hull`). RV-7's text: `ReplayClientOptions.hull` is handed by no
  page;
  the wiring is outside RV-7's files and waits on the merge controller's window. Until then a seek lays no smoke, as
  before. The room flies over the walk's grid with the map's `DefaultMaterial`. On the page that is the world's grid
  (`WorldState.grid`, `pageWorld`, on the walk's own hull) and `map.grenade.defaultMaterial` (`grenadeAssets.ts` :36).
  The lines needed:
  - the test room's replay mode: `replay/mount.ts` :112, `replayClient(search, deps?, hull?: () => HullCast | null)`,
    its options at :136-137 gaining `...(hull ? { hull } : {})`; and `main.ts` :1763,
    `replayClient(SEARCH, undefined, () => (pageWorld?.ground === map.ground ? gridCast(pageWorld.grid,
    map.grenade?.defaultMaterial ?? '') : null))`;
  - the modern viewer's frame: `modern/replays/worldHost.ts` :50 and :82-83 (`client` and `replayWorldDeps` passing the
    same function on), `modern/replays/worldStage.ts` :234-237 (into its `new ReplayClient` options), and `main.ts`
    :1750 handing it.

  No page hands `ReplayClientOptions.throwable` either (249 §1, LATER 32). So once the hull is wired, the fold flies the
  baked `AN_M8` (3 s, 40 s) while a room with the disc's kit table flies the table's record (`Room.throwable`); the two
  agree only as far as the transcription matches the disc. Handing `throwable` with the hull closes it.
- **The page's own flight in replay mode may have no hull** (read, not run) -- since PAR-46a (merged with main
  `2d5618c23`) the thrower's hull is the map's walking or not (`hullGrid`, `matchThrow.ts` :158; `grenade.ts` :1579;
  `walk.ts` :1252-1257), so this item is the gameplay seat's to retire after a browser run. RV-7's text: `GrenadeThrower.hull` reads the walk's grid
  (`grenade.ts` :1544-1549, wired `grid: () => walk.grid()` at `matchThrow.ts` :144), and `WalkMode.grid` is null off
  the walk (`walk.ts` :980-982). A replay's watcher never walks, so a page that has not walked flies every recorded
  throw over no hull (`fly`'s empty cast, `grenade.ts` :1553). If so, in forward play a replayed AN-M8 falls through the
  floor and pours where its fall ends, while the folded one lies where the room had it. This is for RV-1's browser run
  to see, and for the gameplay seat.
- **The target's own scorches are not laid.** A blast's point and its surface are the room's flight again (a hand
  grenade's), and a joiner's page lays none either (231 §2, "Not reproduced").
- **Other throws in flight at the target** (an M67, an HE, a flashbang, a launched round, a rocket) are still not
  folded (249 §1). The same flight would serve the hand grenades, which fly over the hull alone. A launched round meets
  the bodies each frame (`bodyCast`), which the recording keeps only every other tick. Owed, and not briefed.
- **A takeover's smokes** keep their thrower as owner in the fold (LATER 33, as the charges). This changes nothing
  drawn: a smoke's owner gates nothing on the page.
- **The joiner's look** is the joiner's limit too: the stream from its start, with no canister burst
  (`JOIN_SMOKE_LOOK_READING`, 231 §2; capture B).
- **The seek note's sentence** (§1) still holds and is unchanged. The smoke may still be stale or doubled, the target's
  smoke is laid only once the hull is wired, and the scorches drawn are now only those made after the target. (Re-read
  at RV-7c-2, below: still unchanged.)

### `ReplayClient` and the segment HTTP (W39.R2)

- **`ReplayClientOptions.hull?(): HullCast | null`**: new and optional, so additive. Absent, a seek folds no smoke.
- **What a seek tells:** no new event and no new field. The welcome's `join.projectiles` may now carry an AN-M8 (in
  flight, at rest or detonated), in the shape the room's join already sends a joiner.
- **`fold.ts`** (internal, listed for completeness): `FoldState.smokes`, `FoldedSmoke`, `REPLAY_SMOKE_FLIGHT_READING`;
  `foldedJoin` takes an optional trailing `hull`, and `statefulRecord` an optional trailing `smokes`.
- **Not the engine's surface**, listed for the page's readers: `MatchActionsDeps.grenade.clearScorches?`.
- **The `.s2r` format, the recorder, the segment HTTP and `GET /replays`:** unchanged.

### Not done against the brief, and why

- **The smoke's clear** (step 1's second half): stopped, as the brief says to when the clear needs a new method in the
  effects module or `grenade.ts`. What it needs is above. The brief's test "a seek calls ... the smoke's clear" is
  therefore not written; the scorches' half is.
- **The hull's wiring** is not done (files not granted); the exact lines are above.
- **The AN-M8 is folded from its throw**, not only while it pours (above): the room's join lists it so.

### Evidence

Unit tests only (node and jsdom). No browser, game, dev server or match server was run.
- `packages/viewer/test/replaySmoke.test.ts` (new, 5 tests; a real `Room` recorded through `FileRecorder`):
  - the room itself tells a joiner the AN-M8 in flight, then pouring (bounced), then nothing after `Timer2`;
  - a seek pouring (5 s in, 1 s before `Timer2`) tells the welcome the room's own entry, equal entry for entry;
  - a seek in flight tells it in flight, equal;
  - a seek after `Timer2`, and one before the throw, tell none;
  - with no hull, none;
  - at the review's fix round, a second block (3 tests): the command and the throw sent before the step, as a live page
    sends them -- the room tells the AN-M8 in flight, pouring, then gone; a seek pouring tells the same canister at
    rest, its age, fuse and removal at most one game frame behind the room's; a seek in flight tells it in flight at
    most one frame's travel from the room's place; after `Timer2`, none.
- `packages/viewer/test/replayAir.test.ts` (the RV-7 block, 3 tests, and one line in the live case):
  - a seek clears the scorches once, after the air and before the welcome; a step on does not; a step back does;
  - a seek into a pouring AN-M8 lays its canister on the floor and its puffs at the smoke's age (about 5 s), its pid
    kept, nothing heard, no explosion;
  - with no hull, nothing is laid;
  - the live client's frames and round events call neither clear.
- RED: replaySmoke 2 of 5 failed (pouring and in flight told nothing), replayAir 2 of 12 failed (no scorch clear; no
  smoke laid). The source edits were set aside for the RED run and put back.

### RV-7c-1: the call (2026-10-11T22:01Z)

RV-7c-1 is done: the call. `MatchActionsDeps.grenade` gains `clearSmokes?(): void` (`matchActions.ts` :55) and
`followSeek` (:151-158) calls it after `clearAir` and `clearScorches` and before the welcome, so the target's smoke the
welcome lays is not stopped. Play, a step on and the live path (a client without `onSeek`) call it not. It is
optional: this lane's `GrenadeThrower` has no such method yet, so the call is a no-op here. The method is the gameplay
seat's PAR-45 (`GrenadeThrower.clearSmokes`, `grenade.ts` :1690 at `6e7101df9` on `agent/parity-2`), not on this lane.
Both pages hand the thrower itself (`main.ts` :754, `matchMount.ts` :406), so it wires with no further change once
PAR-45 reaches `main` and the lane merges it. Tests: `replayAir.test.ts`'s RV-7c-1 block (4 tests; two lay PAR-45's
method on the real thrower, two hand a plain deps object): a seek calls it once in the order `clearAir`,
`clearScorches`, `clearSmokes`, welcome; a step back calls it again; a page that lets go of the replay's client calls
it no more; the live path calls it not; a `grenade` dep without it still clears the air and the scorches, and the seek
does not throw (held without the thrower, so it stays green once PAR-45 is merged into the lane). RED: 1 of 16 failed
(the call absent). RV-7c-2 -- the hull's wiring and `throwable` (the `main.ts` lines above, "The hull is not wired")
-- follows once PAR-45 reaches `main`. Until RV-7c-2 lands, "A seek inside a smoke's
life draws it twice" and the seek note's sentence (§1, and the item above) stay as they are. Unit tests only; no
browser was run.

### RV-7c-2: the hull and the throwables wired (2026-10-12T01:27Z)

RV-7c-2 is done, in the merge controller's `main.ts` window (HANDOFF §3). Reading (written pending review; reviewed
fresh before its merge, `02a100cdd`, 2026-10-12T01:38Z: PASS WITH FINDINGS, high on the code and wiring, medium on the
cross-window call; the plan's Log); unit tests only.
- **What.** Both replay clients now get the page's hull and its throwable records:
  - the test room's replay mode: `ReplayPageHooks` (`replay/mount.ts` :102-115) gains `hull?(): HullCast | null`, and
    `replayClient` passes it to `ReplayClientOptions.hull` beside LATER 32's `throwable` (:155-157);
  - the modern viewer's frame: `ReplayWorldHost.client` (`modern/replays/worldHost.ts` :50-56) takes an optional third
    argument, the page's hooks, and `replayWorldDeps(host, page?)` (:87-93) passes them on. The frame's
    `new ReplayClient` (`modern/replays/worldStage.ts` :234-241) gives them to its options. Without them the modern page
    is as before (W39.R6: none of the launcher's chrome);
  - `main.ts`: one helper, `replayHull` (:1637), given to both replay branches with `throws.throwable`
    (:1642, `replayWorldDeps`; :1655, `replayClient`), and `gridCast` and `HullCast` added to the `@s2u/scene` import
    (:7-8). The live path is untouched.
- **The hull is the server room's flight surface** (a segment a server recorded; the offline room's differs, see
  "Still not done"). `Room.hullCast` (`match/src/room.ts` :3712-3714) is
  `gridCast(this.map.grid, this.map.defaultMaterial ?? '')`, and a server's map carries the world root's
  `DefaultMaterial` (`viewer/src/simMap.ts` `simMapFromBytes` :109-111, :140). On the page that is `pageWorld.grid`, which is the walk's
  hull (`main.ts` :1810-1831: `groundGrid(map.ground)` handed to both `WorldState` and `walk.setGround`), with
  `map.grenade.defaultMaterial` (`grenadeAssets.ts` :36, the map's `DefaultMaterial`, as `GrenadeThrower` reads it at
  `grenade.ts` :745). It is null while `pageWorld` is not this map's, so no smoke is folded then, as before.
  - The brief's `pageWorld?.ground === map.ground` became `pageWorld && pageWorld.ground === map.ground`. The meaning is
    the same, but `LoadedMap.ground` is optional, so the `?.` form does not narrow `pageWorld` for `.grid`.
  - The cast is built at each seek and read there, never copied.
  - In the modern frame the hooks are functions of the test room's realm that the shell's page calls. Both pages are
    the same origin, and the cast's hits are plain arrays and objects. This cross-window call is reasoned from the
    code, not run: the unit tests call the hooks from one realm (jsdom loads no frame), so a browser run (RV-1's) is
    what holds it.
- **Why.** RV-7's fold lays a recorded AN-M8 only when it is given a hull. `throwable` makes the fold fly the record
  the page holds (the baked set and the disc's `KitTable.throwables`), so the fold no longer flies the baked `AN_M8`
  while the room flies the table's (the item above).
- **"A seek inside a smoke's life draws it twice" is retired.** `followSeek` calls `clearAir`, `clearScorches`,
  `clearSmokes` and then the welcome (`matchActions.ts` :151-158). PAR-45's `clearSmokes` (`grenade.ts` :1692-1697)
  stops every smoke run (with the `smoke_stream` a `smoke_grenade` called) and the placeholder puffs' sources, and it
  deletes each `effectSmoke` mark, so the welcome's hydrate starts exactly one stream for the target's smoke.
- **The seek note, re-read** (`modern/replays/transport.ts` `SEEK_NOTE`, §1). A seek now stops the pouring smoke and
  lays the target's at its age, clears the scorches without laying the target's, and still folds no grenade, round or
  rocket in flight. No clause is false, so the sentence is unchanged:
  - "smoke ... may not match" still holds. The puffs already in the air run out their lifetimes
    (`CLEAR_SMOKES_PUFFS_READING`), the target's smoke is drawn with the joiner's look (`JOIN_SMOKE_LOOK_READING`) and
    can trail by a game frame (`REPLAY_SMOKE_FLIGHT_READING`), an offline room's recording can lay it over another
    material than its room flew (below), and nothing is laid while the page has no world of the map;
  - "scorch marks may not match" holds, because the target's own scorches are not laid;
  - "things in flight" holds.

  `transport.test.ts` :157 still pins it.
- **Still not done.** These items above are unchanged: the target's own scorches, the other throws in flight, a
  takeover's smokes and the joiner's look.
  - **The offline room's hull differs from the page's** (the review's finding). The loopback room's map,
    `simMapOfLoaded` (`viewer/src/net/loopback.ts` :69-82), sets no `defaultMaterial`, so its `Room.hullCast` is
    `gridCast(grid, '')`, and a polygon with material byte 0 falls back to `table[0]` (`surfaceMaterial`,
    `scene/src/projectile.ts` :432) rather than the map's `DefaultMaterial`. A solo or playtest recording (PT-03,
    header `kind` 'solo') sought while an AN-M8 pours can therefore lay the smoke where a flight over the page's hull
    (the map's `DefaultMaterial`) leads, not where the room flew it. On screen the seek note's "smoke ... may not
    match" covers it. The root fix is the gameplay seat's and changes the offline room, not the replay:
    `simMapOfLoaded` carries `defaultMaterial: map.grenade?.defaultMaterial`, as the server's `simMapFromBytes` does
    (`viewer/src/simMap.ts` :111, :140). Then the two hulls agree and the offline room's own throws meet the map's
    material too. Not fixed here (files not granted). The page's own flight in replay mode is for a browser run. No browser has
  seen the laid smoke yet (RV-1's run). `main.ts`'s lines can only be pinned by text in a unit test
  (`replayHull.test.ts`, `parityExemptions.test.ts`, `worldHost.test.ts`); the workspace typecheck and a browser run
  hold them.
  *(2026-10-17, MU2-14f: the browser case is written, not run -- `e2e/replayEngine.spec.ts` "MU2-14f (RV-7c-2) ...", on a
  real room's MP2 recording with the SEAL's AN-M8 (`e2e/roomRecordings.ts` `smokeRecording`; the AN-M8 put in his
  pouch, which held `{"M67":3,"HE":3}`, the one write the room does not make), sought before the throw, past its
  detonation, back and forward: the canister by the room's pid detonated where the room has it (`grenade().live`), its
  smoke started by the seek and drawn (`effects()`'s `smoke_stream` run and particles, else `grenade().smokes`' puffs),
  through existing instruments only. Its Node half, `test/replayRoomRecordings.test.ts` (unit, node, on the fixtures):
  the fold's seek with the room's hull and record lays the room's own join entry exactly (a throw decided between two
  steps), none without the hull or before the throw. The browser run is the seat's, from `socomlegacy/`:
  `E2E_PORT=5306 E2E_LOCAL_PORT=5307 E2E_PLAYTEST_PORT=5308 npx playwright test packages/viewer/e2e/replayEngine.spec.ts -g "MU2-14f" --workers=1 --reporter=line`.)*
- **Tests** (unit, node and jsdom):
  - `test/replayHull.test.ts` (new, 6 tests): through the test room's mount on the real room's recording, a seek into
    the pouring AN-M8 with the hull tells the room's own entry; the hull is read at the seek; hull and throwables
    together; none without the hull; and `main.ts`'s lines pinned by text;
  - `test/modern/replays/worldStage.test.ts` (2 tests): the same seek through the frame's host, with the hooks and
    without them;
  - `test/modern/replays/worldHost.test.ts` (2 tests): `replayWorldDeps` passes the hooks to `host.client`;
  - the recording is moved, unchanged, from `replaySmoke.test.ts` to `test/helpers/smokeRecording.ts`, which also
    returns the bytes;
  - the earlier `main.ts` pins in `parityExemptions.test.ts`, `worldHost.test.ts` and `replayThrowables.test.ts` are
    updated to the new lines.

  RED: 10 of 56 failed. GREEN: 73 of 73, across seven files.

### 6.1 Placeholders and adaptations

| name | value | where | status |
|---|---|---|---|
| `REPLAY_SMOKE_FLIGHT_READING` | 'flown again from the throw, over the page hull' | `packages/viewer/src/replay/fold.ts` | reading (re-read by RV-7's fresh review before its merge, `ca4c492c8`, 2026-10-11T07:18Z: PASS WITH FINDINGS, high, "the fold against `room.ts`'s launch, frame accumulator and `stepGrenade`"; the plan's Log). An AN-M8's place and phase at a seek's target are its flight from its recorded `grenade` event (`launchGrenade`, then `stepGrenade` a game frame at a time on a fresh `GameFrameAccumulator` advanced one tick per room step after the throw's tick, as `Room.flyGrenades`), over the page's hull at the seek (`ReplayClientOptions.hull`). Exact for a throw decided between two steps with nothing else flying (held equal against a real room's join to a watcher, `replaySmoke.test.ts`). A throw decided inside a step -- the live page's usual case, its throw naming the command sent with it -- is recorded at the step whose own flight already moved it once, and the recording does not say which, so the fold can trail the room by one game frame (about two ticks) for about half of the targets (held within one frame, the second block of the same file). With another projectile in the air at the throw the room's accumulator carries another phase, which can shift the count by one more. The path is the same frame by frame; its place in flight and its timers may be a frame off. A door or a destructible changed during the flight is met as the page holds it at the seek. Settled only if the recorder wrote the flight clock's phase, or the room broadcast a smoke's rest point (a room change, additive); neither is asked. Not a game value: the original replays nothing |

No `*_PLACEHOLDER` and no new `*_ADAPTATION` constant. The value is the viewer's; research 101's round ledger scans the
viewer's sources too (`tools/test/roundLedger.test.ts`), so it has its row in 101 §5 (*corrected 2026-10-12, at the
landing: this said the ledger took no row*).

## 7. RV-5, the watcher's HUD: the reading

Written 2026-10-11 for RV-5's first phase (ruling W39.R5: "what a replay draws to its watcher is what the original
draws to a spectator", read, never designed). This phase is a reading and a proposal: no source file is changed. The
level was **reading, pending review** when written, and is **reading** since RV-5 phase 1's fresh review re-read it
at the source before its merge (`cca98faad`, 2026-10-11T07:53Z-07:54Z: PASS WITH FINDINGS, high; the plan's Log), for
what the decompilation settles (`$SOCOM_PC_ROOT/game/analysis/
socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`). Words and strings marked "the ELF's" were read off the
disc's `game/disc/socom2_game.elf` with a throwaway script that maps an address through the ELF's program headers, as
research 244 §3 read the camera's vtable; nothing of it is in the tree. What the source does not settle is a
**placeholder**, named in §7.1. Nothing here was measured running.

This section closes what research 248 §5 left open ("exact group-to-widget mapping, final visibility for each
control-state byte value"), for the online spectator at control state 0, which is the replay watcher's case. It confirms
248 §5's warning: following a player does not give a spectator the living player's weapon HUD.

### How the original decides what a spectator sees

- **The frame.** The HUD's update `FUN_001f7ff0` (D:L56517) runs each frame (called at D:L50856), and then its three
  layers are drawn (`FUN_001fba70`, D:L50862-50868). So the last show or hide written in the frame is what is drawn.
  - A widget's vtable `+0x1c` shows it and `+0x18` hides it: the scope's two toggles use them in opposition
    (`FUN_001f7560` D:L56253-56300 against `FUN_001f7360` D:L56202-56251).
  - The whole-HUD bit (`+0x1a6f5` bit 0) is set at the HUD's init (D:L57250). No other line of the decompilation writes
    that bit.
- **The dispatch** (D:L56564-56600) picks a path by the local player's state and the viewed actor:
  - a live local player viewing himself: `FUN_001f7a90`; viewing another: `FUN_001f9f20`;
  - a dead player offline: `FUN_001f93c0`;
  - a dead player online who is not a spectator: `FUN_001f97b0` on his own body, `FUN_001f9f20` on another;
  - **a spectator: `FUN_001f9160`** (`FUN_002c2fd0`, "is a spectator", D:L56589).

  The spectator branch sits under the not-alive arm. The online set-up's spectator arm puts the spectator's own object
  in state 8, the death state (`FUN_00599b60` D:L455693-455698 -> `FUN_00543d50` D:L410437). That state 8 clears the
  alive bit is inferred.
- **The control-state byte** `ctrl+0x221` (written by `FUN_00597740`, D:L454339):
  - 0 in play;
  - 1 with R2's inventory or WEAPON EXCHANGE open (D:L72835, D:L88370);
  - 2 with the command menu open (`FUN_00235440` D:L83993);
  - 3 with the in-game options menu open (`FUN_00204a40` D:L61963) or `FUN_0022b4a0`'s screen (D:L79402);
  - 4 (`FUN_0020a780` D:L64813) and 5 (`FUN_00228ee0` D:L78534) also exist; the spectator's path does not test them,
    and what sets them is not read here.

  A replay's watcher opens no menu, so its state is 0.
- **The "SPECTATOR HUD: ON / OFF" option** (strings 0x3e3b20 / 0x3e3b40) is an item of that options menu. `FUN_002041e0`
  toggles it (D:L61847-61854) and `FUN_00204a40` labels it (D:L62094-62100), over the byte `DAT_003dc3e0`.
  - The byte is 1 in the ELF's data, and is set to 1 again when the HUD is torn down (D:L57799).
  - While it is on, online, D:L56803-56806 show the info box, the round timer and the number text every frame.
  - While it is off, or while the scoreboard is up, D:L56808-56827 hide these every frame: the weapon box, the info box,
    the compass, the spectator panel, the prompts, the reticle, the six help lines, the timer and the number text.
  - Who is offered the option is not read (the menu's item flag, D:L62017). The replay has no options menu, so the
    default holds: on.

**The widgets, by their place in the HUD object (`CHUD`).**

| `CHUD` offset | widget | evidence |
|---|---|---|
| `+0x4e20` | the round timer, "00:00" at (500, 433), online (research 87 §1.11) | init D:L57389-57390 (the ELF's `DAT_003dc398/3a0` = 500, 433; 0x3e34e0 "00:00"); written by `FUN_001f6b60` D:L55998-56003 |
| `+0x19cc0` | the info box's number, "00m" at (587, 433). Research 87 §1.12 calls it the range | init D:L57459-57471 (`DAT_003dc3a8/3b0` = 587, 433; 0x3e34f0 "00m"). Online, each frame, it is written `"%d"` (0x3e3080), or `"%dm"` (0x3e3078) on the host, of `FUN_0030d510(0x45a0c0)` (D:L56605-56613), which is not the reticle's range. `FUN_0030d510` (D:L209983-209993) calls `FUN_00623090` (D:L532383-532408) on the handle at 0x45a0c0 + 0xf4, which reaches `FUN_00615160` (D:L523200-523233): a count of the entries, out of 256, whose `+0x28` byte is 1, over a table of the network session. What those entries are is unread |
| `+0x17b70` | the info box: the health bar (`+0x20`, `CHealthBar`), the name on it (`+0x2f0`, at (555, 409), the ELF's `DAT_003dcc48/50`), a box (`+0x270`), and the radio icon (`+0x390` -> `FUN_00238f50` -> `FUN_00239570`, research 87 §1.16) | `FUN_002388a0` D:L85626 (init D:L57478); research 94 had it "[inferred: the info box strip]" |
| `+0x18280` | **`CSpectatorInfo`**, the spectator's own panel (below) | `FUN_00242bb0` D:L90372 (init D:L57479; research 94 named the class). Its vtable is 0x405f60, whose `+0x38` word in the ELF is 0x2425e0: the frame `FUN_002425e0` |
| `+0x19d58` (x 6) | the six help lines (research 91 §12) | init D:L57294-57307 |
| `+0x17580` | the voice element: the talk sprites (research 227 §2.2) | `FUN_00227340` (init D:L57287) |
| 0x4366a0, 0x437060, 0x436b80 | the main message window, the small one (pick-ups), the subtitles (research 87 §14) | D:L57423-57425 |
| 0x437540 | `FUN_002ca100`'s object, fed from key codes by `FUN_002c6c70` (D:L167306-167318). That it is a keyboard text line is inferred | D:L57429-57431 |
| `+0x1a700`, `+0x4fe0`, `+0x11df0`, `+0x174d0`, `+0x11ca0`, `+0x744` | the weapon box (research 87 §1.1-1.5); the compass (the ring `+0x290`, and `+0x480`, the parent of the 38 marks `+0x530`/`+0x68f0`, D:L68771-68791); the reticle (`FUN_00216770`, research 84); the prompts (research 87 §5); the stance word; the ZOOM line | the HUD's init, `FUN_001fa360` D:L57285-57421 |

**`CSpectatorInfo`** (`FUN_00242bb0` D:L90372-90440; its frame `FUN_002425e0` D:L90217-90330). The geometry is the
ELF's words, in the PS2's 640x448 frame:
- **The title bar**: `newweapnbkrnd.tif` over (10, 410)-(174, 438) at alpha 72 (`DAT_003dcf18/20/28/30/38`). Its title,
  "SPECTATOR INFO" (0x3e6ed8), is drawn at the pen (20, 430), scale 0.9.
- **The stats panel**: (10, 326)-(174, 410) at alpha 64 (`DAT_003dcf58..78`).
- **Its four labels**, at (20, 346 + 18i), scale 0.9: "Kill Count :", "Deaths :", "Headshots :" and "Score :" (0x3e6e88,
  0x3e6ea0, 0x3e6eb0, 0x3e6ec0).
- **Its four values**, "000" (0x3e6ef8), right-aligned to x 160 (their text's `+0x6a` is set, D:L90434, and
  `FUN_00362900` moves such a text left by its whole width, D:L260689-260690), at y `DAT_00414920` + 18i.

Each frame the panel reads the camera's viewed actor (`FUN_001fcd70`, `DAT_00415ff0+0xbc`, D:L58313-58316):
- **The spectator's own object** (free and scenic). The title bar takes colour 0x414958 and the stats are hidden
  (D:L90237-90238). The title is the camera's `+0x114` string when it has one (D:L90239-90255). That string is the scenic
  view's name: `FUN_002ab260`'s sixth output, its record's `+0x18` (D:L151485), the `Desc` that `SCENIC_VIEWS_READING`
  reads. Without one, the title is "FREE CAMERA" (0x3e6ec8) and the bar is coloured (100, 100, 100) (D:L90326-90328).
- **Another actor.** The title is its name (`+0x14`, or " " when it has none). With a clan tag of two characters or
  more it is `"[%s] %s"` (0x3e6e80; D:L90261-90271).
  - A SEAL's title bar takes 0x414928 and a Terrorist's 0x414938, and the stats are shown (D:L90273-90304).
  - The four values are the match block plus the round block, as research 91 §8 names them (D:L90308-90325): kills
    `+0x550` + `+0x598`, deaths `+0x556` + `+0x59e`, headshots `+0x544` + `+0x58c` (`HEADSHOT_COUNT_READING`'s
    `+0x544`), and score `+0x580` + `+0x5c8`.
  - Any other actor has its stats hidden: an escortee (`+200 & 0x20000`) takes 0x414948 (D:L90292-90293), and the rest
    take the own object's look (D:L90277-90289).
- SELECT pressed or held hides the panel (D:L56760-56763), as the scoreboard comes up.

### Step 1: what a spectator sees, element by element

(a) is the lobby's spectator: online, control state 0, SPECTATOR HUD on, the scoreboard down. (b) is a dead player
spectating for the rest of a round: respawn off (research 91 :163, :185). "Viewed" is the camera's actor,
`FUN_001fcd70`.

| element | (a) the lobby's spectator | (b) a dead player spectating | whose | citation |
|---|---|---|---|---|
| round timer | **shown** | shown | the round's clock (the bomb's fuse in its place is `DEFUSE_TIMER_LAYOUT_READING`'s, for every seat) | `FUN_001f6b60`, called each frame at D:L56604, writes the clock and, online, shows it at each new second whoever is viewed (D:L55998-56007); D:L56805 shows it each frame. The spectator's hide-all hides it offline only (D:L56320-56322) |
| scoreboard | **shown while SELECT is held**; while it is up, the info box, the panel, the help lines, the timer and the number are hidden | shown while held | the room's rows | `FUN_0022be20` (D:L79653, called at D:L56802) tests online, control state 0 and SELECT, and no seat; D:L56808-56827 run while it is up |
| compass ring and its marks | **hidden** | hidden, on the own body and on a teammate | -- | the hide-all `FUN_001f77c0` calls `FUN_00212260` each frame (D:L56359; D:L68360-68369). The show, `FUN_002122a0`, refuses unless the viewed actor is the local one, alive, at view state 1 or less (D:L68379-68386); on the dead's own body, D:L57115. The marks are children of `+0x480` (D:L68775-68791); that a hidden parent hides them is inferred |
| health bar (there is no armour readout: research 87 §1.8) | **shown** | shown | **the viewed actor's**: the followed player's; in free and scenic, the spectator's own object's | `FUN_00238500` D:L85555-85556; shown by D:L56876 and D:L56804. Placeholders: `WATCHER_HEALTH_PLACEHOLDER`, `WATCHER_OWN_INFO_PLACEHOLDER` |
| weapon and ammo box | **hidden** | shown: on the own body, his kit; on a teammate, **the teammate's** weapon and rounds | the viewed actor's | Hidden each frame (D:L56340), and its show `FUN_00237e50` refuses a local spectator online (D:L85354). Its update `FUN_00237760` reads the viewed actor's kit (D:L85148-85156) and is gated on the box's own state (D:L85170-85178; the gate's sense is inferred). For (b), `FUN_001f7a90` (D:L56405) and `FUN_001f9f20` (D:L57180) call the show, which a non-spectator passes |
| reticle | **hidden** (inferred) | on the own body, shown by `FUN_001f7a90` (D:L56394-56397); on a teammate, hidden | -- | The reticle's root is hidden each frame (D:L56327). Its own frame `FUN_00216770` (D:L56765) then shows sub-widgets (D:L69764), all children of that root (D:L70789-70797, D:L70986, D:L71145-71166); that a hidden root hides them is inferred, as for the compass |
| the followed player's name | **shown, twice**: on the info box's bar, and as the panel's title | on the info box's bar | the viewed actor's: `"[tag] name"` with a clan tag, else the name -- on the bar a tag of one character or more (`FUN_00199288`, a string length, D:L85563), on the panel's title two or more (D:L90266) | the bar D:L85558-85569; the title D:L90261-90271; free and scenic as above. For (b), the panel is hidden for a non-spectator (D:L57116-57118, D:L57181-57183) |
| the panel's four stats | **shown** when following a SEAL or a Terrorist; hidden otherwise | -- | the followed player's | D:L90273-90325. Placeholders: `WATCHER_HEADSHOTS_PLACEHOLDER`, `SPECTATOR_INFO_RGB_PLACEHOLDER`, `SPECTATOR_INFO_VALUE_Y_PLACEHOLDER` |
| help lines | **shown**: "You are a spectator.  Use the directional" / "buttons to cycle through active players" / "and fixed views.  [Cross] Use the Free-Motion" / "Camera.  [Triangle] Jump to visible players." | the dead's lines (research 91 §12) | -- | `FUN_001f9160` D:L56869-56872; the glyph bytes read off the ELF, 0xa6 Cross and 0xac Triangle (`PAD_GLYPH`, `packages/scene/src/uiFont.ts:117-119`). See "The help lines" below the table |
| message window: round banners, the side's objective, kill lines | **shown** (the main window) | shown | -- | D:L56878 (and D:L57178 for a dead player viewing a teammate). The kill line is posted on every online console, with no seat test (`FUN_00547860` D:L412863-412893). The round start posts "STARTING ROUND" and the side's objective (`FUN_001fb420`, research 87 §8). A spectator's objective is player team 16, which `NetPage.roundBanner` already passes |
| radio and voice | **shown**: the voice element, and the radio icon in the info box | shown | -- | D:L56875; D:L85578. Hidden with the command menu open (D:L56623). Whether a side's comm lines ("%s : %s", `FUN_005e7960`) reach a spectator's console is unread |
| `0x437540`'s object (probably a keyboard text line) | **shown** | shown on a teammate (D:L57179) | -- | D:L56879; fed from key codes by `FUN_002c6c70` (D:L167306-167318), so empty for a replay's watcher, which types nothing; phase 2 draws nothing for it |
| small message window (pick-ups) | **hidden** | as it was before the death | -- | D:L56355; the spectator's path does not show it again |
| stance word, prompts, ZOOM line | **hidden** | on the own body, shown by `FUN_001f7a90` (D:L56394-56397, D:L56403); on a teammate, hidden | -- | D:L56325, D:L56328, D:L56338-56339 |
| the info box's number | **shown** | shown | unread | D:L56806; `WATCHER_INFO_NUMBER_PLACEHOLDER` |

**The help lines** (a spectator's):
- **Place**: centred on x 324, at y 380 + 18i (D:L56883-56886; the ELF's `DAT_003dc3b8/3c0/3c8`). D:L56883 sets each
  line's byte `+0x19dc1`, the text's `+0x69`, and `FUN_00362900` moves a text with `+0x69` set left by half its width
  (D:L260684-260688).
- **Timing**: alpha 100, held to 10.0 s, faded to 0 by 10.5 s (D:L56541-56561). The clock restarts at the HUD's init
  (D:L57498) and at each round start (`FUN_001fb420` D:L57663).
- **When hidden**: while the scoreboard is up (D:L56817-56823), with the command menu open (D:L56617-56622), and at
  state 3 (D:L56887-56892).
- **Lines 5 and 6**: `SPECTATOR_HELP_TAIL_PLACEHOLDER`.

**Read, but not settled by this reading:**
- the round-end screens: research 91 §18 does not say whether a spectator's console draws them
  (`WATCHER_ROUND_SCREEN_PLACEHOLDER`);
- the fade at a round's start: research 87 §8 measured it on a SEAL's console (`WATCHER_ROUND_FADE_PLACEHOLDER`).

The SPECTATOR HUD option's default is `SPECTATOR_HUD_OPTION_READING`.

### Step 2: what the page draws today

- **The switch.**
  - Both frames call `hud.setVisible(walking)` (`main.ts:1588`, `matchMount.ts:756`), with
    `walking = walk.mode() === 'walk'` (`main.ts:1549`, `matchMount.ts:726`).
  - A spectator's welcome puts the walk in fly (`netPage.ts:1209`), and so does a dead player's first cycle
    (`leaveSelf`, `netPage.ts:630`).
  - While the HUD is off, `Hud.render` returns before any draw (`hud.ts:1288`), and `state()` reads `visible: false`
    (`hud.ts:1230`).
  - The scoreboard is gated on walking too: `const scoreboard = walking && ...` (`main.ts:1585`, `matchMount.ts:752`).
- **(a) A live spectator** (a lobby spectator, or the map viewer's `watch` page) is drawn **none of the HUD**.
  - Its model is fed but not drawn: the timer (`netPage.ts:1134-1135`); the message window, with the round start, the
    side's objective, the kill lines and TIME EXPIRED (`hud.postMessage`, `hud.startRound`); the round screens; and the
    voice element. It can hold no scoreboard.
  - This is a **parity defect of the live page**. It belongs to the online and gameplay seats: `main.ts` and
    `matchMount.ts` under the merge controller's window, and `hud.ts` the HUD's seat. The original draws a spectator the
    timer, the info box, the panel, the help lines, the main window and the voice element, with the scoreboard on
    SELECT. As the brief asks, it is reported here and not folded into the replay.
- **(b) A replay's watcher** is the same spectator page, so it draws none of the HUD (research 249 §7.2's third
  `fixme`):
  - its client's welcome says `role: 'spectator'` (`replayClient.ts:259`, with the id `REPLAY_WATCHER_ID` = -1,
    `replayClient.ts:73`);
  - both replay branches build a watching `NetPage`: `main.ts:1750` for the modern viewer's framed world, and
    `main.ts:1763` for the developers' mode;
  - the modern viewer frames the test room (`modern/replays/worldHost.ts`), so the frame that draws it is `main.ts`'s,
    never `matchMount.ts`'s.
- **A dead player**, live, also differs from the original. This is not this task's to fix (the gameplay and online
  seats'):
  - **On his own body**: the walk stays in walk mode, so the walking HUD is drawn whole, its compass included. The
    original hides the compass (D:L57115; `FUN_002122a0`'s alive test, D:L68382).
  - **After his first cycle to a teammate**: the walk goes to fly, and nothing is drawn. The original draws the
    teammate's health bar, name, weapon and rounds, the timer, the main window and the help lines (`FUN_001f9f20`
    D:L57174-57202; D:L56804-56806).
- **Found in passing, for the HUD's seat** (reading; reviewed with this section before RV-5 phase 1's merge,
  `cca98faad`): **the walker's scoreboard keeps the info box and
  the number in view.**
  - `SCOREBOARD_HIDES` (`hud.ts:419-423`) and `SCOREBOARD_KEEPS_BOTTOM` (`hud.ts:797`) keep 'bar', 'name', 'box' and
    'range' drawn under the board.
  - The original's scoreboard-up block also hides the info box `+0x17b70` (D:L56811), the number `+0x19cc0`
    (D:L56826) and the help lines (D:L56817-56823).
  - Research 87 §12's list (the weapon box, the compass, the prompts, the reticle, the timer) omits them.
- **RV-8's third `fixme`** (`e2e/replayEngine.spec.ts:813`, "the HUD's drawn compass on a replay after a seek") asks
  for something the original does not draw: a spectator has no compass. Once RV-5 lands, the case should read "a
  replay's watcher draws the round timer and the followed player's name, and no compass". Carrying that into RV-8's row
  is the merge controller's call.

### Step 3: the proposal (phase 2)

The proposal is the smallest change that draws a replay's watcher what step 1 found, and nothing else:
- A live spectator stays as it is: the defect above is its seats'.
- A walking player's quads stay byte-equal.
- The HUD draws a watcher's elements only while a **spectator source** is set, and only the two replay branches set
  one.

**H1. `packages/viewer/src/hudSpectator.ts` (new).**
- **Whose**: the plan's `hud*.ts` grant to RV-5 ("the spectator's draw"). It is the HUD's area, so the HUD's seat is
  told.
- **What**: pure, with no page state:

```ts
import type { HudElement, HudQuad } from './hud';
/** RV-5 (research 276 §7): what the original hides from a spectator -- the weapon box (D:L56340, D:L85354), the compass
 *  and its marks (D:L56359, D:L68379-68386), the prompts and the hold bar (D:L56325), the stance word (D:L56328), the
 *  ZOOM and scope lines (D:L56338-56339), the tactical map and the menus; 'bar' and 'range' are this file's two
 *  placeholders. */
export const SPECTATOR_HIDES: ReadonlySet<HudElement> = new Set<HudElement>([
  'panel', 'rounds', 'mags', 'icon', 'firemode', 'compass', 'marks', 'action', 'holdBar', 'stance', 'zoom',
  'scopeRange', 'tacmap', 'weaponSelect', 'chatMenu', 'bar', 'range',
]);
/** While the scoreboard is up a spectator also loses the info box, the panel and the help lines (D:L56808-56827). */
export const SPECTATOR_SCOREBOARD_HIDES: ReadonlySet<HudElement> = new Set<HudElement>(['box', 'name', 'spectatorInfo', 'help']);
/** One frame of a spectator's own elements (`./replay/watcherHud` builds it). */
export interface SpectatorHud {
  /** The info box's name: the followed player's; null in free and scenic (WATCHER_OWN_INFO_PLACEHOLDER). */
  name: string | null;
  /** The panel's title: the followed player's name, the scenic view's `Desc`, or 'FREE CAMERA' (D:L90231-90328). */
  title: string;
  /** The panel's four rows, a SEAL or a Terrorist followed; null hides them (D:L90273-90304). */
  stats: { kills: number; deaths: number; headshots: number | null; score: number } | null;
}
/** The ELF's DAT_003dcf18..3dcfa0 and its strings (research 276 §7). */
export const SPECTATOR_INFO_LAYOUT = {
  title: { x: 10, y: 410, w: 164, h: 28, alpha: 72 }, titlePen: { x: 20, y: 430, scale: 0.9 },
  stats: { x: 10, y: 326, w: 164, h: 84, alpha: 64 }, labels: { x: 20, y0: 346, pitch: 18, scale: 0.9 },
  values: { x: 160, align: 'right' }, words: ['Kill Count :', 'Deaths :', 'Headshots :', 'Score :'], free: 'FREE CAMERA',
  freeRgb: [100, 100, 100],
} as const;
/** 0x3e30f0..0x3e3180 (0xa6 Cross, 0xac Triangle); D:L56883-56886; D:L56541-56561. */
export const SPECTATOR_HELP = {
  lines: ['You are a spectator.  Use the directional', 'buttons to cycle through active players',
    'and fixed views.  ¦ Use the Free-Motion', 'Camera.  ¬ Jump to visible players.'],
  x: 324, align: 'centre', y0: 380, pitch: 18, scale: 0.9, hold: 10, fade: 0.5,   // +0x69: D:L56883, D:L260684-260688
} as const;
export const SPECTATOR_INFO_RGB_PLACEHOLDER = 'the panel colour of HUD_COLOURS' as const;
export const SPECTATOR_INFO_VALUE_Y_PLACEHOLDER = 'the labels’ baselines' as const;
export const WATCHER_HEALTH_PLACEHOLDER = 'not drawn' as const;
export const WATCHER_INFO_NUMBER_PLACEHOLDER = 'not drawn' as const;
export const SPECTATOR_HELP_TAIL_PLACEHOLDER = 'not drawn' as const;
/** The spectator's own quads: the panel and the help lines (`helpAge`: seconds since the HUD's start or the round's). */
export function spectatorLayout(frame: { width: number; height: number }, view: SpectatorHud, helpAge: number,
  scoreboard: boolean, sizes: Record<string, { width: number; height: number }>): HudQuad[] { /* ... */ }
```

`HudElement` gains `'spectatorInfo' | 'help'` (H2).

**H2. `packages/viewer/src/hud.ts`.**
- **Whose**: the HUD's seat. The plan grants `hud*.ts`, but the brief names this file another seat's, so the change goes
  through the merge controller.
- **What**: four hunks, each a no-op while no source is set:
  - `hud.ts:438-447`, `HudElement`: add `| 'spectatorInfo' | 'help'` (RV-5: the spectator's panel and help lines,
    `./hudSpectator`).
  - `hud.ts:767-783`, `hudPass`, gains a trailing optional `spectator: SpectatorHud | null = null, helpAge = 0`:
    ```ts
    const { quads } = hudLayout(frame, spectator ? { ...model, name: spectator.name ?? '' } : model, sizes, timing);
    const seen = spectator ? quads.filter((q) => !SPECTATOR_HIDES.has(q.element)
      && !(model.scoreboard && SPECTATOR_SCOREBOARD_HIDES.has(q.element))) : quads;
    // ... the round-screen, tactical-map and scoreboard branches as today, on `seen` in place of `quads` ...
    return { quads: [...base, ...(spectator ? spectatorLayout(frame, spectator, helpAge, model.scoreboard, sizes) : []),
      ...(tac?.quads ?? []), ...(board?.quads ?? [])], tris: /* as today */ };
    ```
  - `class Hud`, beside `setVisible` (`hud.ts:1051`):
    ```ts
    private spectator: (() => SpectatorHud | null) | null = null;
    /** RV-5 (research 276 §7): a spectator's HUD, drawn while not walking; null (every page but a replay's) draws none. */
    setSpectator(source: (() => SpectatorHud | null) | null): void { this.spectator = source; }
    /** A spectator's HUD is drawn now: the page's SELECT reaches the scoreboard for it (`FUN_0022be20`, no seat test). */
    spectating(): boolean { return !this.on && this.spectator !== null; }
    ```
  - `step`, `render` and `state`:
    - `step` (`hud.ts:1250`): `if (this.on || this.spectator) this.sinceOn += dt;`
    - `render` (`hud.ts:1288`): `const view = this.on ? null : this.spectator?.() ?? null;
      if ((!this.on && !view) || this.batches.size === 0) return;`, and then
      `hudPass(..., this.presentation, view, this.sinceOn)`.
    - `state` (`hud.ts:1230`): `visible` is `(this.on || view !== null)`, with `rects` less `SPECTATOR_HIDES` under a
      view.
    - `sinceOn` is the help lines' clock: it starts with the HUD (D:L57498), and `startRound` zeroes it (D:L57663).

**H3. `packages/viewer/src/replay/watcherHud.ts` (new).**
- **Whose**: this lane's.
- **What**: pure, over the watcher's `NetPage`:

```ts
import type { SpectatorHud } from '../hudSpectator';
import { SPECTATOR_INFO_LAYOUT } from '../hudSpectator';
import type { NetPage } from '../netPage';
/** RV-5 (research 276 §7): the watcher's panel and name, as `FUN_002425e0` and `FUN_00238500` read the viewed actor. */
export function watcherHud(page: Pick<NetPage, 'spectator' | 'rows' | 'nameOf'>,
  views: () => readonly { name: string }[]): SpectatorHud {
  const v = page.spectator;
  if (v.mode === 'follow' && v.target !== null) {
    const name = page.nameOf(v.target), row = page.rows.find((r) => r.id === v.target);
    return { name, title: name, stats: row ? { kills: row.kills, deaths: row.deaths, headshots: null, score: row.score } : null };
  }
  const desc = v.mode === 'scenic' ? views()[v.scenic]?.name ?? '' : '';
  return { name: null, title: desc || SPECTATOR_INFO_LAYOUT.free, stats: null };
}
```

- A followed hostage has no score row, so its stats are hidden, as an escortee's are (D:L90292-90293).
- The room has no clan tags, so no title takes the `"[%s] %s"` form.

**H4. `packages/viewer/src/main.ts`.**
- **Whose**: it needs the merge controller's window.
- **What**: four lines, none of them in a live page's path:
  - `main.ts:1585`: `const scoreboard = (walking || hud.spectating()) && (padMerged.scoreboard ||
    scoreboardKeys.held());   // research 87 §12; RV-5: a replay's watcher too (FUN_0022be20 tests no seat, research 276 §7)`
  - `main.ts:1694`, after `net = null;`: `hud.setSpectator(null);   // RV-5: no watcher's HUD past its page`
  - `main.ts:1751`, after `REPLAY_WORLD.attached(...)`, and after `net = new NetPage(...)` at `main.ts:1763`:
    `{ const page = net; hud.setSpectator(() => watcherHud(page, () => deps.scenicViews?.() ?? [])); }   // RV-5`
  - an import of `watcherHud` from `./replay/watcherHud`. It is a small pure module, so `replayClient.ts` is not pulled
    into the page's first chunk.
- **Not touched**:
  - `matchMount.ts`: no replay is mounted there.
  - `netPage.ts` and `spectatorView.ts`: their public `spectator`, `rows` and `nameOf` are only read.

**The failing tests the change needs (RED first):**
- `packages/viewer/test/hudSpectator.test.ts` (new):
  - Under a spectator source, with the HUD off, `hudPass` draws exactly these: the timer, its box, the name, the banner
    and the message, the fader, the voice element, `spectatorInfo` and `help`. It draws none of `SPECTATOR_HIDES`.
  - The panel has four rows when following a SEAL. It is titled "FREE CAMERA" in the free camera, and by the view's
    `Desc` on a scenic view. Following a hostage, it has no rows.
  - The help lines are at alpha 100 at 9.9 s, 0 at 10.5 s, and back after `startRound`. They are absent while the
    scoreboard is up.
  - SELECT held draws the board and drops `box`, `name`, `spectatorInfo` and `help`.
  - A walking HUD (`setVisible(true)`, no source) is quad for quad equal to today's, over the DEFAULT model and a
    populated one. The expected quads are recorded from the head before H1-H2.
- `packages/viewer/test/replayWatcherHud.test.ts` (new): `watcherHud` over a three-body recording on a watcher's
  `NetPage`, built as `replaySpectate.test.ts` builds one.
  - Follow gives the followed id's name and its row.
  - Free gives "FREE CAMERA" and no name.
  - Scenic gives MP2's view `Desc` (fixture-backed; skipped without `test-fixtures/`).
- `packages/viewer/test/replaySpectate.test.ts` (extended):
  - With the source set, the watcher's `Hud.state()` reads `visible: true` with no `compass` rect.
  - A live spectator page with no source still reads `visible: false`. That records the live defect as unchanged, and
    is labelled as such.
- RV-8 owns the rendered case (`e2e/replayEngine.spec.ts:813`, re-titled as above): `devSeen().hud` visible, the timer's
  and the name's quads drawn, and no `compass_lo.tif` quad.

### 7.1 Placeholders and readings

None of these is in code yet. Each is *note only* until phase 2 adds it, with the value phase 2 would give it.

| name | value phase 2 would give | what settles it | status |
|---|---|---|---|
| `WATCHER_HEALTH_PLACEHOLDER` | 'not drawn': the info box's bar for a followed player | The original draws the viewed actor's bar (D:L85555-85556). The page cannot know another body's health: the room tells only the hurt page (`hurt`, `protocol.ts:1034`), and a snapshot carries none. Settled by a capture of a spectator following a wounded player (does the bar fall?), or a memory trace of a remote actor's `+0x1044` on a third console; then a room change carrying each body's overall health to a spectator (additive) | *note only* until phase 2 |
| `WATCHER_OWN_INFO_PLACEHOLDER` | 'not drawn': the info box's name and bar in free and scenic | In free and scenic the original's viewed actor is the spectator's own object, whose name and bar it draws (D:L85555-85569). A replay's watcher has no seat in the recording. The original's look is settled by a capture of a lobby spectator in the free camera. What a watcher shows in that place (nothing, or the signed-in account's name) is an adaptation, for the owner | *note only* until phase 2 |
| `WATCHER_INFO_NUMBER_PLACEHOLDER` | 'not drawn': the number at (587, 433) | It is `FUN_0030d510(0x45a0c0)`, written `"%d"`, or `"%dm"` on the host (D:L56605-56613). The chain: `FUN_0030d510` (D:L209983-209993) -> `FUN_00623090` (D:L532383-532408) on the handle at 0x45a0c0 + 0xf4 -> `FUN_00615160` (D:L523200-523233), which counts the entries, out of 256, whose `+0x28` byte is 1, over a table of the network session. It is not the reticle's range that the page draws there for a walker. Settled by reading what those entries are and what their `+0x28` byte means (`FUN_0061c600`'s table), or by a capture of a spectator's info box beside the session's state | *note only* until phase 2 |
| `WATCHER_HEADSHOTS_PLACEHOLDER` | 'the label drawn, the value empty' | The original's row is the followed player's `+0x544` + `+0x58c` (D:L90317-90320). The room sends headshots only in a seat's own `MatchStats` at `roundOver` (`protocol.ts:623-632`), not on the score rows. Settled by an additive headshots field on the room's score rows, a room change no task asks for yet | *note only* until phase 2 |
| `SPECTATOR_INFO_RGB_PLACEHOLDER` | the panel colour of `HUD_COLOURS`, for the title bar and the stats panel, except the free camera's read (100, 100, 100) | The colours are `0x414900` and `0x414910` at the panel's init, then each frame `0x414928` (SEAL), `0x414938` (Terrorist), `0x414948` (escortee) and `0x414958` (none) (D:L90237-90304). All lie past the ELF's file image (`.bss`), written at run time by an initialiser not found. Settled by a memory read of 0x414900-0x414960 in the running original, or a capture of the panel following each side | *note only* until phase 2 |
| `SPECTATOR_INFO_VALUE_Y_PLACEHOLDER` | the labels' baselines (346 + 18i) | The values' y is `DAT_00414920` + 18i (`.bss`). Their x and alignment are read: right-aligned to x 160 (`+0x6a`, D:L90434; D:L260689-260690). Settled as the colours are | *note only* until phase 2 |
| `SPECTATOR_HELP_TAIL_PLACEHOLDER` | 'not drawn': help lines 5 and 6 | The spectator's path writes lines 1-4 only (D:L56869-56872), but shows all six (D:L56891). Lines 5-6 hold the HUD init's text, HudCLOC 60486 (D:L57297), unless a death's path wrote them " " (D:L57103, D:L57156); and the fade dims lines 1-4 only (D:L56546-56561). Settled by a capture of a lobby spectator's first ten seconds | *note only* until phase 2 |
| `SPECTATOR_HUD_OPTION_READING` | 'on' | The option's byte is 1 in the ELF's data (0x3dc3e0), is set to 1 again at the HUD's teardown (D:L57799), and is toggled only by the options menu (D:L61848). A replay has no options menu. Who is offered the option is unread (the menu's item flag, D:L62017) | *note only* until phase 2 (a reading) |
| `WATCHER_ROUND_SCREEN_PLACEHOLDER` | 'drawn as for a player' (the page's round screens, unchanged) | Research 91 §18 reads the round's screens on a player's console; whether a spectator's console draws them is unread. Settled by a capture of a round's end on a spectator's console | *note only* until phase 2 |
| `WATCHER_ROUND_FADE_PLACEHOLDER` | 'the page's round start, unchanged' (`ROUND_START`'s fade from black) | Research 87 §8 measured the picture's fade on a SEAL's console. It is not among the spectator dispatch's hides. Settled by a capture of a round's start on a spectator's console | *note only* until phase 2 |

Also open, with no stand-in: whether a side's comm lines reach a spectator's console (`FUN_005e7960`), and whether the
reticle's own frame (`FUN_00216770`) shows the reticle for a dead player on his own body. Phase 2 draws neither.

## 8. Two recordings of a real room for the fixmes (RV-8a)

Written 2026-10-11T08:24Z for RV-8a of web sprint 39: the CPU-only half of RV-8 (the plan's RV-8 row; research 249
§7.2's fixmes). The browser run is the merge controller's, later. The code: the new
`packages/viewer/e2e/roomRecordings.ts` (the generator), the new
`packages/viewer/test/replayRoomRecordings.test.ts` (its unit test), and the three former `test.fixme` cases at the
end of `packages/viewer/e2e/replayEngine.spec.ts`. Like the rest of the replay, this is a browser adaptation's test
(`REPLAY_ADAPTATION`, research 240 §3; PT.R3): nothing here reads or changes a game value or behaviour.

### The rule followed: the room's own records, none written by hand

The plan's RV-8 brief said "written with the format's own writer". The task's brief overrode it: every record is one a
real `Room` broadcast, listed or snapshotted. So no record is built in the test.
- **How each file is made.** `roomRecordings.ts` builds a map's room as `MatchServer` does (`server.ts`: `start`
  :420-429, `parse` :612-630, `room` :591-610): the disc's clips, kit source and mission list; the map through
  `simMapFromBytes` with the kits and the mission list's game type; its skeletons and kits; `forkSimMap`; `new Room`.
  The room's `recorder` is what a dedicated server gives a map's room: the real `RoomRecording`
  (`match/src/replay/files.ts` :335-394) over the real `FileRecorder` (`match/src/replay/recorder.ts`). So the file
  opens at the room's first snapshot with the roster and the events before it carried in, and it holds no command
  records (`RoomRecording` has no `command`). The bytes are gzipped with `gzipReplay`, as the server's closed files are.
  *(Fix round, 2026-10-11, the review's F3: the first commit recorded through `FileRecorder` alone, so its files
  carried the room's `cmd` records, unlike a server's file under the same 'dedicated' header.)* The header is
  `recording`'s for a map's room (`server.ts` :665-675): `kind` 'dedicated', no session, the commit 'unknown' (a
  server without `GIT_COMMIT`), and its wall clock fixed (`RV8A_STARTED_AT_PLACEHOLDER`). The header is the only
  record the room does not make; the server writes its own the same way.
- **The room's clock** is injected and stepped one tick at a time, every seated seat sending one still command a tick,
  as `replayBlastFall.test.ts`, `replaySmoke.test.ts` and the server's room tests step theirs. Its draw is a constant,
  `RV8A_DRAW_PLACEHOLDER` (0.1, `victoryServer.ts`'s), so the dance's variant is fixed.
- **Arranged by the test, through the room's own surface:** the two seats' hellos; still commands; bodies stood with
  `Walker.place` (`STEP_PROBE_LIFT_READING`'s lift, as `Room.spawn` lifts); a look laid with `MoverSim.allowSnap`
  (NET-LOOK's gate passed once, as the server tests stage a facing); shots sent as `fire` events
  (`central/test/helpers/mapCheck.ts` `fireAt`'s claim); a dance request and a hostage order sent as the pages send
  them.
- **One write the room does not make, in the rescue only:** the hostage's place (`Hostage.at`), set inside the
  extraction zone. Below, "placed by the test" means exactly this write.
- **Evidence that the events are the room's.** The unit test compares each recorded `victory`, `kill` and
  `hostageState` with what both seats' connections heard (the room's broadcasts reach every connection; only
  `Room.broadcast` hands an event to the recorder, `room.ts` :5159-5163).

### The dance (fixme 2)

**What it is.** MP2 (classic), two seats. The SEAL (seat 2 by the join rule) is the dancer, the Terrorist (seat 1) the
victim.
1. The round starts after the launch countdown, and `RV8A_PREROLL_S_PLACEHOLDER` (60 s) runs with both still.
   *(Retired 2026-10-17, MU2-14b: the staging now begins at round 1's start; §8.1's row says why.)*
2. The victim is stood where the room's own rule offers a dance at his corpse: `e2e/victoryArrangement.ts`
   `findVictoryArrangement` (the production `Walker.place` and `victoryEligibility`, the 20-unit spacing of
   `victory.spec.ts`).
3. The dancer shoots him dead through the room's fire path, at most `RV8A_MAX_SHOTS_PLACEHOLDER` rounds. The kill is the
   room's `kill`, by the dancer.
4. When the room offers the dancer the dance (`victoryOffer` 'available', `victoryStatus` -> `victoryEligibility`,
   30 units), his page asks it as the page does: `{ type: 'victory', request: 1 }` (`VictoryPage`).
5. The room picks the variant (`chooseVictory`), starts it, and broadcasts `victory` with the clip. It stops it at its
   own length (`tickVictories`) and broadcasts the stop (`clip: null`). `RV8A_TAIL_S_PLACEHOLDER` (3 s) follows.

**This run's recording** (fixture-backed, `test-fixtures/RUN`; the fix round's): made in 0.3 s of Node, 2,444 records,
none a command, 8,910 bytes gzipped; the header MP2, classic, game type 5. The recording opens at tick 0; round 1
starts at 601 (the 10 s launch countdown); the victim dies at 4252 (`kill`, by the dancer); the room starts
`victory_macarena` (serial 1) at 4263 -- 71 s after the file's open -- and stops it at 4656: 393 ticks,
`oneShotSeconds(6.6, 205)` = 6.54 s, its own length; the file ends at 4836. The
dance's two `victory` events and the `kill` are what both seats heard. *(These ticks are the fix round's, with the 60 s
preroll; since MU2-14b (2026-10-17) the staging begins at round 1's start, so the later ticks come earlier -- not
re-measured here.)*

### The rescue (fixme 1)

**The brief's question: can the room's surface place the hostage in the zone without a change to `room.ts`,
`hostageAi.ts` or the extraction?** Yes. `Room.extraction` is public, its `hostages` are its own objects, and
`Hostage.at` is a plain field (`extraction.ts` :274). `ExtractionAuthority.inZone` (:463) and the post-tick's
`rescueTest` (:477-486) read it. HX-5's own room test places a hostage the same way (`roomExtraction.test.ts` `carry`).
No other file was touched.

**What it is.** Desert Glory (MP6, EXTRACTION by the mission list, classic), two seats; the SEAL (seat 2) leads.
1. The round starts; `RV8A_PREROLL_S_PLACEHOLDER` runs, then `RV8A_KNEEL_S_PLACEHOLDER` (5 s) for the first hostage
   (body 240) to kneel. *(The preroll retired 2026-10-17, MU2-14b: the kneel now follows round 1's start; §8.1.)*
2. The SEAL is stood in the jail south of it and orders FOLLOW as his page does. The staging is
   `roomHostageOrderEye.test.ts`'s: distances `RV8A_LEADER_RANGES_PLACEHOLDER`, a pitch sweep
   (`RV8A_PITCH_SWEEP_PLACEHOLDER`), and an order sent only where the page's own third-person camera line
   (`PlayerCamera` on the hull) finds the hostage. **The room takes the order:** state 9, the SEAL its leader.
3. `RV8A_LED_HOLD_S_PLACEHOLDER` (2 s) passes with the hostage led in the jail. This is the spec's "before" window.
4. **The test places the hostage** at the extraction zone's centre: `extractionPoints(map.ai)`, the compass mark's
   point (`EXTRACTION_MARK_READING`). It is not led there: a following hostage holds its point
   (`hostageAi.ts` `FOLLOW_MOTION_PLACEHOLDER`; HX-4b owes the motion). The recorded snapshots show the body jump from
   the jail to the zone between two snapshots; that jump is the test's, and a replay draws it.
5. **The rescue is the room's own:** the next game frame's `rescueTest` finds the last leader seated and the cell in a
   kind-1 zone, enters 0x11 with the SEAL as rescuer, and the room credits him (+3) and broadcasts `hostageState`
   (0x11, rescuer). The fade (1.33 s) runs out and `RV8A_TAIL_S_PLACEHOLDER` follows.

**This run's recording** (the fix round's): made in 0.3 s, 2,461 records, none a command, 11,695 bytes gzipped; the
header MP6, classic, game type 4. Round 1 at 601; the room takes the FOLLOW at 4553 (`hostageState` ai 9, leader 2);
the hostage stands led in the jail at (1750.26, 50.99, 1179.72) until the test places it at 4674, at the zone's
centre (810.26, -30.08, 1959.72); the room rescues it in the same step (`hostageState` ai 0x11, rescuer 2) and
credits the SEAL +3 on the next `score`; the file ends at 4854. The
`hostageState` events are what both seats heard. *(The fix round's ticks, with the preroll; since MU2-14b the staging
begins at round 1's start -- not re-measured here.)*

### The spec's cases (written by reading, not run)

`replayEngine.spec.ts` (its last cases, its imports and, at the fix round, its top doc's paragraph on them):
- **How a recording is loaded.** Each file is made in the spec's process by the generator. It is served to the page by
  a Playwright route at `<vite>/segments/<n>.s2r` (no server is started), and opened as `replayPaths.spec.ts` case 4
  opens a segment: `/testroom?devmode&replay=<address>&map=<MAP>`. `embedder=` is the page's own origin, so the spec
  seeks in place by posting the report's seek message to the page itself (`embed.ts` `mountEmbed`, `replaySeeker`).
  The listing (`/segments`) is refused, so the timeline shows the file alone. The cases are independent of the
  session-recording case above them: `-g "RV-8a"` runs them alone.
- **"RV-8a: a running victory dance at its age after a seek..."** (fixme 2). Paused before the dance (asserted: a
  dance the page has played is not told to it again, below). A seek 1 s into the dance
  (`ENGINE_DANCE_INTO_S_PLACEHOLDER`): `victory().remotes` gives the dancer the recorded clip at the key its age gives
  (`Play.frame`'s rule, within `ENGINE_DANCE_KEY_TOLERANCE_PLACEHOLDER`). `devSeen()` shows his body drawn, playing the
  clip, and the key stands still while paused (the pause is asserted to land before the dance only while LATER 31 is
  open, below). A seek 1 s past the stop: no dance. A seek between the kill and the start (half a second before it,
  or the tick after the kill when that is later: here 10 ticks before it): no dance.
- **"RV-8a: a seek back into a dance the page has already been told..."** -- LATER 31, whose fix is PR #135
  (95aac5ce2, `RemotePlayers.resetVictories`, called by `NetPage` on a replay's re-told welcome). Without it,
  `Play.startVictory` (`play.ts` :184-193) refuses a serial at or below the last it started (`victorySeen`), and a
  replay seek's welcome leaves each remote body's `Play` in place (`remotePlayers.ts` `setTeam` :435-439 removes a body
  only on a team change), so when the fold tells the same dance again after a seek past its stop and back
  (`replayClient.ts` :406-415) the page drops it and the dancer stands. The unit test shows the fold does tell it again
  (`elapsed` 1 s, the same serial). The case is a plain `test` asserting the correct behaviour, its first line
  `test.fail(!LATER_31_FIXED, ...)`: an expected failure only while the tree under test has no
  `RemotePlayers.prototype.resetVictories`, so it turns green once the lane merges #135 and never reports "expected to
  fail but passed". It runs after the rescue case, so a failure skips none of the other RV-8a cases (the file is
  serial). *(Fix round, the review's F1: the first commit's unconditional `test.fail` would have turned red with #135
  and skipped the rescue case after it.)* The same gate makes the first case depend, while LATER 31 is open, on the
  pause landing before the dance's start: the replay's clock plays from the segment's open (`replayClient.ts` :248)
  while the page's load hold warms up, and `RV8A_PREROLL_S_PLACEHOLDER` (60 s, raised from 5 at the fix round, F2)
  puts the dance 71 s after the open. *(Both gates gone: MU2-14c (23d610382) dropped `LATER_31_FIXED` and its
  `test.fail`, the case asserting plainly; MU2-14b (2026-10-17) retired the preroll, §8.1.)*
- **"RV-8a: a rescued hostage's mark across a backward seek past the rescue..."** (fixme 1). Its comment says the
  hostage was placed by the test, not led. A seek 2 s past the rescue: the hostage rescued (0x11), two `ret_hostage`
  marks, none where it stood or where it was rescued, the extraction mark drawn. A seek back to 1 s after the lead:
  led (state 9, the SEAL its leader), three marks, its own at its place in the jail
  (`ENGINE_PLACE_TOLERANCE_PLACEHOLDER`). Forward past the rescue again: two.
- **The third fixme** stays `test.fixme`, retitled: it waits for RV-5 phase 2 and, per §7, will assert the round
  timer's and the followed player's name's quads drawn and no `compass_lo.tif` -- the original draws a spectator no
  compass.

**What the browser run must show** (owed to the merge controller's window; nothing here was run in a browser):
- the dance case green: the dancer's clip and key at the seek, still while paused, none past the stop or before the
  start;
- the seek-back case an expected failure on a tree without #135, and green on one with it;
- the rescue case green: two marks past the rescue, three with its own back in the jail across the backward seek, two
  again;
- no page error on either page.

*Run since (the sprint 39 close's record; the plan's Log):* `replayEngine.spec.ts` whole, rendered browser runs
(headless Chromium, `--workers=1`, the merge controller's slot): 2026-10-11 21:45-21:48Z on `1ebb0f3c9` (run 6), 12
passed, 1 skipped (the watcher's-HUD fixme), the seek back into a seen dance passing outright with #135 in the tree
(LATER 31); 2026-10-12 on `8e293bc47`, between 10:39Z and 10:48Z (before the Log's 2026-10-12T10:52Z entry), **13 passed, 0 skipped** (3.6 m), RV-8d's case (below) included.

The command, from `socomlegacy/`, with the disc's variables and the run's own ports:

```
E2E_PORT=5306 E2E_LOCAL_PORT=5307 E2E_PLAYTEST_PORT=5308 npx playwright test packages/viewer/e2e/replayEngine.spec.ts -g "RV-8a" --workers=1 --reporter=line
```

### `ReplayClient` and the segment HTTP (W39.R2)

Unchanged: no source file, no record kind, no format version. The files are version 2, read by the existing reader.

### Not done against the brief, and why

- **No browser, no typecheck.** The spec's cases and the module's types were written by reading; the typecheck and the
  first run are the merge controller's.
- **The generator is `packages/viewer/e2e/roomRecordings.ts`, not under `e2e/fixtures/`** as the brief named it:
  `.gitignore` ignores `/socomlegacy/packages/viewer/e2e/fixtures/` (the voice specs' tone, written there at run time by
  `voiceFixtures.ts`), so a module there would not be committed. It sits beside the other e2e helpers
  (`victoryArrangement.ts`, `hostageHarness.ts`); Playwright does not take it for a spec (not `*.spec.ts`).
- **Outside §8, one line of this note** changed: the opening paragraph's list of sections names §8.
- **LATER 31** (a dance told again after a seek back is dropped) is not fixed here: its fix is PR #135, in `play.ts` /
  `remotePlayers.ts` / `netPage.ts`, outside this task's files.
- **At the fix round, beyond the brief (granted by the coordinator):** the spec's top doc comment, and
  `test-fixtures/MANIFEST.json`'s `usedBy` for MP2.ZDB, MP6.ZDB, READERC.ZAR, ZWEAPON.ZAR and MOTION_P.ZAR, each now
  naming `packages/viewer/test/replayRoomRecordings.test.ts` and `packages/viewer/e2e/replayEngine.spec.ts`.

### Evidence

Unit tests only (node), on the fixtures (`test-fixtures/RUN`). No browser, game, dev server or match server was run, and
no typecheck. Kept apart:
- `packages/viewer/test/replayRoomRecordings.test.ts` (new, 7 tests; skipped, and said so, without the fixtures):
  - the dance: a closed classic MP2 file, a dedicated server's (no command record, the roster first); the `kill` by
    the dancer; exactly two `victory` events, the start (clip, `elapsed` 0) after the kill and the stop (`clip` null)
    at the start plus `ceil(seconds x 60)`; the tail recorded;
  - the dance's `victory` and `kill` events equal what both seats' connections heard;
  - the gzip file reads back to the same records; a seek 1 s into the dance tells it at `elapsed` 1; past its stop the
    stop is told; before its start no dance; back in, told again (the fold's side of LATER 31);
  - the rescue: a closed classic MP6 file (game type 4); the roster of three at the open; `hostageState` ai 9 with the
    SEAL as leader, then ai 0x11 with him as rescuer, at most two ticks after the test's placement;
  - the hostage's body in the jail before the placement and at the zone's centre after it; the SEAL's score row +3
    across the rescue;
  - the `hostageState` events equal what both seats heard;
  - a seek past the rescue tells it 0x11; back before it, state 9 and no rescuer; forward again, 0x11.
- RED: the file failed to load ("Cannot find module '../e2e/roomRecordings'"): the generator was set aside for the
  run (a first RED at the brief's `e2e/fixtures/` path, the same failure, before the move above). GREEN: 7 passed;
  at the fix round, with `RoomRecording`, the 60 s preroll and the command-record checks, 7 passed again.
- The ticks above were printed by a throwaway script run once with `tsx` from the session's scratch directory (nothing
  of it is in the tree).
- `packages/viewer/e2e/replayEngine.spec.ts`: the three RV-8a cases and the retitled `fixme` were written by
  reading, **not run**. Their first run is owed to the merge controller's browser window. *Run since:* green in run 6
  (2026-10-11 21:48Z, `1ebb0f3c9`) and again 2026-10-12 (`8e293bc47`, between 10:39Z and 10:48Z, before the Log's 2026-10-12T10:52Z entry), "What the browser run must show" above.
- `tools/test/conventions.test.ts`, `tools/test/docs.test.ts`, `tools/test/placeholderLedger.test.ts`: 105, 16
  and 13 passed, each run alone after this section was written; at the fix round, after
  its last edit, the three again and `tools/test/fixtureManifest.test.ts` (it reads MANIFEST.json's `usedBy`): 105, 16,
  13 and 13 passed.
- 2026-10-11 (RV-8c, issue #91's guard): the two RV-8a cases' fallback context is now `opened.add(...)`-ed, so it is
  closed in the spec's afterAll like `s.context`; context handling only, no assertion changed. Not run (no browser).
  *Run since:* in run 6 (2026-10-11 21:48Z, `1ebb0f3c9`), after RV-8c's merge, and 2026-10-12 (`8e293bc47`, between 10:39Z and 10:48Z, before the Log's 2026-10-12T10:52Z entry).

### RV-8d: the watcher's HUD case, turned on (2026-10-11T22:29Z)

Written for RV-8d of web sprint 39 (RV-8's fixme 3), by reading: no browser, no typecheck. PAR-48 (on this lane since
main `e766f8a64`, §11) draws a replay's watcher the spectator's HUD each frame (`main.ts`
`hud.setSpectator(spectatorHudView(net, walk))`), so the last `test.fixme` of `replayEngine.spec.ts` is now a plain
case, **"RV-8d: the watcher's HUD on a replay after a seek ..."**, on the session's own recording (not RV-8a's): the
report's replay, paused, sought by a mark's button.
- **Where.** Case 6 leaves the replay on segment 1 (Desert Glory), so the case seeks H0 and H1 there; if case 6 stopped
  before its reopen, segment 0's A and T. The report is brought to the front first (RV-8a's pages were opened since).
- **What `devSeen()` can tell, and what it cannot.** `devSeen().hud.drawn` keys the quads by `layer:bitmap`, with
  centres only, and every string the HUD draws is glyph quads of one bitmap (`font_text_01.tif`). The timer's and the
  name's glyphs are therefore told apart by where the layout put each element: the font quads whose centres fall
  inside `hud().rects.timer`, `.name` and `.spectatorInfo` (`Hud.state()`, the same frame's pixels, its rects already
  less `SPECTATOR_HIDES`). Their words are read off the model those quads were laid from: `hud().model.spectator` (the
  followed name, the stats, the title) and `.timer`. The case records this as an annotation. `devSeen.ts` is not
  extended.
- **What every view asserts** (§7's column (a)): `devSeen().hud.visible`; the view's path 'spectator'; **no
  `compass_lo.tif` and no `ret_*` quad drawn** and no `compass` or `marks` rect laid (`FUN_002122a0`, D:L68379-68386);
  the timer's glyphs drawn, and `model.timer` at `clockAt`'s value within `ENGINE_TIMER_TOLERANCE_S_PLACEHOLDER`; the
  panel's title glyphs drawn.
- **The three views, by the watcher's own keys** (`spectatorView.ts` `SPECTATOR_KEYS`, on keyup, pressed into the
  replay's iframe; Space is the replay's, W35.R8, so "next" is ArrowRight):
  - **free**, as the page opens (`SPECTATOR_START_READING`), at the first mark (H0, or A): no body, no stats, no title
    (FREE CAMERA), no `name` rect (`SPECTATOR_OWN_INFO_PLACEHOLDER`);
  - **follow**: ArrowRight follows `nextFollow(null, <the living bodies of net().bodies>)`; the view's name is the
    recording's (`nameAt`: the roster, then `joined` / `renamed`, else `Player<id>`, `NetPage.nameOf` restated); then a
    seek to the second mark (H1, or T), where the followed name (`health` null:
    `SPECTATOR_FOLLOWED_HEALTH_PLACEHOLDER`), the stats (the score row's kills, deaths and score, `headshots` null) and
    **the name's glyphs drawn on the info box** are asserted;
  - **free** again by X, as above;
  - **scenic**: ArrowUp steps to the first view (`scenicStep(-1, 1, n)` is 0); its name, read off the disc's
    `RUN/<map>.ZDB` with the page's own reader (`mapMeta.ts` `scenicViewsOf`; Crossroads holds 11, `mapMeta.test.ts`),
    is the panel's title, with no body, no stats, no name rect; then X from scenic is free with no title -- FREE CAMERA,
    §11 part 3. With no ZDB found (`SOCOM_DISC`, `public/maps`, `test-fixtures`) the scenic step is not checked, and with
    a map of no views ArrowUp must leave the free camera; each is said in an annotation.
- **Assumptions only a browser can check:** that the iframe's focus carries the arrows and X to the replay page's
  window `keyup` listener (`NetPage.onSpectatorKey`; case 5's Space reaches its bar the same way); that nothing else
  of the page acts on those keys for a watcher (X's own listener acts only walking, `main.ts`); that the report is not
  scrolled by an arrow's default (`inView()` after each key); that the font's glyph quads land inside their element's
  rect (`hudLayout` computes both from the same quads, so it holds by construction, but the drawn centres are what is
  read); that the watcher opens free and on scenic index -1 (a fresh page: no spectator key is pressed before this
  case); that MP6, if the case runs there, has scenic views (its count is not read here; the disc decides at the run).
- **Serial.** It runs after RV-8a's cases; a failure of the LATER 31 case (green since #135, run 6) would skip it.

The command, from `socomlegacy/`, with the disc's variables and the run's own ports (the whole file: the case needs the
session's recording):

```
E2E_PORT=5306 E2E_LOCAL_PORT=5307 E2E_PLAYTEST_PORT=5308 npx playwright test packages/viewer/e2e/replayEngine.spec.ts --workers=1 --reporter=line
```

No placeholder is added: the case uses `ENGINE_TIMER_TOLERANCE_S_PLACEHOLDER` (249 §7.1). Evidence: source inspection
only; the case was not run, and no typecheck was run (the file was only parsed, by esbuild's transform). Each alone
after a memory read: `e2eContextsClosed.test.ts` 75, `tools/test/docs.test.ts` 16, `tools/test/conventions.test.ts`
105 passed. There is no RED: a browser spec written by reading has no unit-level failing state, and its first run is
the merge controller's browser window.

*Run since (the sprint 39 close's record; the plan's Log, 2026-10-12T10:52Z):* `replayEngine.spec.ts` whole on
`8e293bc47`, between 10:39Z and 10:48Z (before the Log's 2026-10-12T10:52Z entry), a rendered browser run (headless Chromium, `--workers=1`, the merge controller's slot): **13
passed, 0 skipped** (3.6 m). RV-8d's case was green on its first run: follow, free and scenic, the timer's glyphs and
the followed player's name drawn, no compass. The annotations' values (which mark, the scenic step) are in that run's
output, not copied here.

### 8.1 Placeholders

Test values of the generator and the e2e, none a game value. They are outside the ledger's walk (`packages/<name>/src`
and `tools/`), so each row is *note only*, as 249 §7.1's are.

| name | value | where | status |
|---|---|---|---|
| `RV8A_DRAW_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 0.1 | `packages/viewer/e2e/roomRecordings.ts` | the room's draw, constant (`victoryServer.ts`'s): the first variant, `victory_macarena` (6.6 s playback, 205 keys), the longest; every other draw of the room (a death clip, a hostage's AI) takes it too |
| `RV8A_STARTED_AT_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | '2026-10-11T00:00:00.000Z' | `packages/viewer/e2e/roomRecordings.ts` | the header's wall clock, fixed so the file is the same each run |
| ~~`RV8A_PREROLL_S_PLACEHOLDER`~~ (*note only*: the e2e's, outside the ledger's walk) | ~~60 s~~ | `packages/viewer/e2e/roomRecordings.ts` (removed) | **retired 2026-10-17 (MU2-14b, the modern UI polish plan's row; `agent/mu2-replays`)**: the constant and its `steps(...)` after round 1's start are gone, a comment in its place. It was the round run still before any staging, so a replay opened at its start (its clock runs from the open while the load hold warms up, `replayClient.ts` :248) would be paused before reaching the dance -- needed only while LATER 31 was open, and LATER 31 is fixed (PR #135, `RemotePlayers.resetVictories`; LATER 31 struck), so a seek re-tells the dance wherever the replay paused. Nothing else read it: the rescue's kneel, order and hold now run from round 1's start (`roomHostageOrderEye.test.ts` stages them from the join), and `test/replayRoomRecordings.test.ts` passed 7 of 7 on the fixtures without it (unit test, node); the browser run that settles it is `replayEngine.spec.ts`'s RV-8a cases, the seat's. 5 s in the first commit; a minute at the fix round (F2) |
| `RV8A_TAIL_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 3 s | `packages/viewer/e2e/roomRecordings.ts` | recorded after the dance's stop and after the rescue (its 1.33 s fade run out) |
| `RV8A_MAX_SHOTS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 10 | `packages/viewer/e2e/roomRecordings.ts` | rounds fired at the victim before the arrangement fails (`mapCheck.ts`'s `MAX_SHOTS`) |
| `RV8A_OFFER_WAIT_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 3 s | `packages/viewer/e2e/roomRecordings.ts` | how long the dancer's page waits for the room's offer before the arrangement fails |
| `RV8A_KNEEL_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 5 s | `packages/viewer/e2e/roomRecordings.ts` | the hostage left to kneel before the order (`roomHostageOrderEye.test.ts`'s wait) |
| `RV8A_LEADER_RANGES_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 12, 15, 18, 21, 24 units south | `packages/viewer/e2e/roomRecordings.ts` | where the leader is stood in the jail (`roomHostageOrderEye.test.ts`'s second case) |
| `RV8A_PITCH_SWEEP_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 0 to -70 degrees, 2.5 a step | `packages/viewer/e2e/roomRecordings.ts` | the look swept down until the page's line finds the hostage (`roomHostageOrderEye.test.ts`'s first case) |
| `RV8A_LED_HOLD_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 2 s | `packages/viewer/e2e/roomRecordings.ts` | the led hostage left in the jail before the test places it: the spec's "before" window |
| `ENGINE_DANCE_INTO_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 1 s | `packages/viewer/e2e/replayEngine.spec.ts` | how far into the dance the spec seeks (inside the shortest variant's 2.5 s) |
| `ENGINE_DANCE_KEY_TOLERANCE_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 1 key | `packages/viewer/e2e/replayEngine.spec.ts` | the dancer's drawn key against the key its age gives; paused, only the animator's sampling separates them |

## 9. A hosted match's replay, seen whole (RV-1)

Written 2026-10-11T09:05Z for RV-1 of web sprint 39 (the plan's RV-1 row; wave 3). The code: the new
`packages/viewer/e2e/replayViewerMatch.ts` (the Node half: the server, the match, the recording, the answers by
account), its unit test `packages/viewer/test/replayViewerMatch.test.ts`, and the new browser spec
`packages/viewer/e2e/replayViewer.spec.ts`. Like the rest of the replay, a browser adaptation's test
(`REPLAY_ADAPTATION`, research 240 §3; PT.R3): nothing here reads or changes a game value or behaviour.

**The spec was written by reading.** Its author could run no browser. The Node half is unit-tested in Node (below,
"Evidence"); the page steps were first run in the merge controller's window on 2026-10-11 (below, "The browser runs":
run 4 red at its disc step, run 5 green, 6 passed, with the fixture-packed image; the run-4 red withdrawn as a spec
race, below):

```
S2U_DEV_PROXY_PORT=5307 E2E_PORT=5306 E2E_LOCAL_PORT=5307 E2E_PLAYTEST_PORT=5308 npx playwright test packages/viewer/e2e/replayViewer.spec.ts --workers=1 --reporter=line
```

(from `socomlegacy/`, with `test-fixtures/RUN` and the served maps the run's Vite waits on; it skips, and says so, without
the fixtures). Since RV-11b (2026-10-11) the disc is the fixture-packed image by default, and the owner's `SOCOM_ISO`
is used only with `RV1_OWNER_ISO=1` set beside it (`discImage`; "Withdrawn, a spec race", below). `S2U_DEV_PROXY_PORT` is MU-6's dev proxy's opt-in
(`packages/viewer/devProxy.ts`): the run's Vite forwards the pages' account, lobby, texts and replays requests to the
match server only with it, so case 1 fails at once, by name, when it does not equal `E2E_LOCAL_PORT`.

*Fix round, 2026-10-11 (the fresh review: FAIL, high, its H1 blocking).* The first commit opened the launcher pages at
`/?devmode&server=`, which never shows the launcher: with `devmode` the page takes the served tree and mounts the
original front end (`pageEntry.ts` `bootPage`, `source.ts` `startSource`; `devProxy.ts`'s doc and `docs/SETUP.md`
say so). The pages now open `/` through MU-6's dev proxy (below, "What the spec asserts", 2). The round's other fixes:
the owner's disc image when `SOCOM_ISO` names one (M1); the two sockets recorded as the controller's accepted deviation
(M2); the result line's guard out of the fixtures' skip (L1); case 4's note first seen hidden (L2); the countdown's
line asserted through a new dev read, `devSeen().hud.posts` (L3, granted by the merge controller); `rv1Port` held to
the lane's ports (L4); the viewer's own words on a world that does not open (the nit).

### The server, as main.ts builds it

`startHostedServer` builds, in the test's own process, what `packages/central/src/main.ts` builds with `DATA_DIR` and
`REPLAYS_DIR` set, in the same order:
- the service store (`ServiceStore.open`);
- SELECT UNIVERSE's texts (`ServerTexts.open`, `textsHandler`);
- the accounts, the lobby and the bridge (`createServices`);
- the recordings (`ReplayFiles`, with `replaysRetentionEnv`'s defaults) and their routes (`mountReplays`: `GET
  /replays`, `/replays/<id>`, the participant rule of W36.R2);
- the `MatchServer` over them, with the per-second rate and session sweep.

The settings it takes:
- `MAPS=MP72`: Crossroads, a DEMOLITION map, so the room has the bomb (`matchEndStats.test.ts`). It is on the CREATE GAME
  play list (OT.R42).
- `ALLOWED_ORIGINS`: the run's page origin.
- `ROUND_SECONDS`: `RV1_ROUND_S_PLACEHOLDER` (20 s).
- The port: in the spec, the run's Local port (`E2E_LOCAL_PORT`, as `victory.spec.ts` starts its server), which
  `rv1Port` takes only inside the lane's 5303-5308 and never unset (`./ports`' default 8811 is not the lane's); in the
  unit test, port 0.
- The address (`HOST`): `::` in the spec, as SETUP's two-window playtest binds it, since the dev proxy targets
  `localhost`, which Node may resolve to the IPv6 loopback first; the IPv4 loopback in the unit test. The helper's own
  requests go to `127.0.0.1` either way (a `::` bind takes IPv4 too).

Three invented accounts are made through `AccountService.create`, as `replayBridge.test.ts` makes its own: `RvAlpha`
(the host and the carrier), `RvBravo` and `RvCharlie` (never plays).

### The match: two page sockets, not two browser pages

The brief asked for two pages playing the match. The match is played by two **page sockets** instead: the raw socket
of `packages/central/test/replayBridge.test.ts`, whose hello names the game and the login's ticket and which sends
`loaded` at the launch (ONL-18b). **A deviation from the brief, accepted by the lane's controller** at the fresh review
(2026-10-11), on the reviewer's reasons: the sockets use the same `/ws` hello with the ticket and the game's id, the
same lobby and bridge routes, the same accounts, launch and `loaded` as a page; only the hello comes from the client.
The author's three reasons:
- the brief also asked that the recording's writing be verified without a browser, and only a match played in Node can
  be;
- the room records what it hears and broadcasts, which is the same for a socket and for a page: the hellos, its own
  events and its snapshots. No record comes from the client but the hello;
- a browser page reaches a game lobby only by the original front end's walk (`twoPagesMatch.spec.ts`, 15 minutes a
  map), which proves the walk, not the replay.

The browser pages are the watchers. The host's walk is `replayBridge.test.ts`'s `hostGame` on MP72, with
`matchEndStats.test.ts`'s world report. GameStats byte 2, the round's minutes, is left 0, so the server's
`ROUND_SECONDS` stands (`bridge.ts` `roomOptions`). Then, each step through the room's own surface:
1. The host's `launch` past its READY gate (`PreMatch.forceLaunch`, `HOST_LAUNCH_READING`). It starts the game lobby's
   countdown of `LAUNCH_COUNTDOWN_S_READING` (11 s), which `Room.launch` broadcasts (`countdown`), so it is recorded. A
   game where every player readies launches at once and records no countdown (`PreMatch.decide`), so the forced launch
   is the path that puts one in the file. The gate is passed by moving the services' clock on by
   `READY_GATE_MS_READING`, as `replayBridge.test.ts` and `matchEndStats.test.ts` move theirs.
2. Round 1 starts after the load hold.
3. `RV1_BEFORE_S_PLACEHOLDER` (3 s) pass with the bomb on the ground at StartBomb (the round's reset).
4. **The one write the room does not make:** the carrier is stood on the bomb's place with `Walker.place`, lifted by
   `STEP_PROBE_LIFT_READING` as `Room.spawn` lifts. This is `hostageHarness.ts`'s `place` and `roomBomb.test.ts`'s
   `carry`; a socket cannot walk there. The pickup is the room's own: `BombAuthority`'s proximity pickup
   (`pickupReach`), recorded as its `bomb` event.
5. `RV1_HOLD_S_PLACEHOLDER` (1 s) later the carrier is stood back at its spawn the same way, so the replay tells the
   carried bomb on a body away from the ground place. The spawn is checked to lie more than
   `RV1_CARRIED_AWAY_PLACEHOLDER` (40 units) from it.
6. The round runs out. DEMOLITION's time-out is a draw (`modeRules(2).timeoutWinner` null, the `mission_timer` branch
   of `Room.step`), so the room broadcasts `roundOver` (ROUND COMPLETE after `ENGINE_READ_S`) and starts round 2: one
   drawn round of eleven ends no match (`isMatchOver`).
7. `RV1_TAIL_S_PLACEHOLDER` (1 s) into round 2 both sockets close. A launched game left with fewer than three players
   ends (`GameBridge.leave`, `ABANDON_BELOW_PLAYERS_READING`). Its room is dropped and its recording closed, gzipped and
   given its sidecar (PT-24).

Both players then log off (`POST /account/logout`). A login of an account already logged in is refused
(`AccountService.login`, AccountLoggedIn), so the pages could not sign in as them otherwise.

What the sidecar holds:
- `accounts`: the two players (W36.R1);
- `result`: round 1's draw with `matchOver` false (RV-4). The card says "SEALs 0 – 0 Terrorists · Cut short".

`seekTargets` derives every target the spec seeks to from the recorded events, never from a wall clock:
- inside the countdown, `RV1_INTO_COUNTDOWN_S_PLACEHOLDER` (4 s) after its `countdown`;
- before the pickup, halfway between round 1's `roundStart` and the placement;
- after it, `RV1_AFTER_S_PLACEHOLDER` (1 s) after the carrier was stood back;
- inside the engine's read, the middle of `ENGINE_READ_S` after the `roundOver`;
- inside ROUND COMPLETE, `ENGINE_READ_S` plus `RV1_INTO_SCREEN_S_PLACEHOLDER` (2 s) after it.

### What the spec asserts, and where each read comes from

1. **The hosted match** (Node, in the spec's process). The sidecar's room, map, rules, accounts and result. Each
   player's `/replays` lists the match and the third account's is empty.
2. **The list by account** (RV-4, W39.R4). Three launcher pages at `/`, with no `devmode`: with it the page would take
   the served tree and mount the original front end, never the launcher (`pageEntry.ts` `bootPage`, `source.ts`
   `startSource`). Their account requests go to the page's own origin (`connectHost.ts` `accountServiceBase`), and
   MU-6's dev proxy (`devProxy.ts`; `docs/SETUP.md`, the modern Lobby tab against a local match server) forwards
   `/account`, `/lobby`, `/modern`, `/rooms`, `/health`, `/texts` and `/replays` to
   `http://localhost:<S2U_DEV_PROXY_PORT>` with the page's `Origin` kept (`changeOrigin: false`): the match server lists
   the page's origin in `ALLOWED_ORIGINS`, and a same-origin GET with no `Origin` passes by its `Sec-Fetch-Site`
   (`originGate.ts`). Each signs in through the Replays section's own Sign in, the modern sign-in panel (MU-2) and the USER AGREEMENT's ACCEPT
   (MU-13a).
   - A and B see one card. Its map, rules and players (in the sidecar's order) are asserted, and its result line equal
     to `resultWords`. The spec cannot import `view.ts` (it imports its stylesheet), so the rule is restated as
     `resultLine`, and the unit test holds the two equal on this result and four others.
   - A's Watch is live: the disc is in -- one packed from the fixtures as `iso.spec.ts` packs its own, written under the
     spec's temporary root; the owner's image (`SOCOM_ISO`, as `tauntsTestroom.spec.ts` and
     `weaponExchangeOriginal.spec.ts` read it) only with `RV1_OWNER_ISO=1` (since RV-11b; until then the owner's image
     whenever `SOCOM_ISO` named one). B's Watch is locked, with no disc (MU.R3).
   - C sees the empty list (`data-list-state="empty"`): the participant rule.
3. **The owner's case** in A's viewer (W37.R7 (a); 244 §7.3's bomb case on a hosted recording).
   - Watch opens the world frame (`testroom?replayview&map=MP72`, MU.R15). The spec waits for the frame's watcher to be
     open and its load hold released, and checks that the focus was handed to the seek bar (RV-3). If the world does not
     open, the failure carries the viewer's own `[data-status]` words: its 120 s world timeout
     (`MU_REPLAY_WORLD_TIMEOUT_MS_ADAPTATION`) fires before the spec's 180 s bound.
   - Paused, the bar is set to each target by its own `input` event: the way the walker's D-pad step sets a range input
     (`startupNavigation.ts` `adjust`), which the transport answers with one `seek`.
   - Past the pickup, read off `devSeen()`: `BombPage` carried by the carrier, no world bomb drawn, the carrier's
     Satchel asked and drawn. In the HUD's model, the one `ret_bomb` mark lies on the carrier's drawn body and more than
     30 units from the ground place.
   - Back before the pickup: on the ground at the recorded place, the world bomb drawn there, no Satchel asked or drawn,
     and the mark at the ground place (to the hundredth).
   - Forward again: carried, as the first time.
   - These are `replayEngine.spec.ts` case 2's and `replayPaths.spec.ts` case 5's reads, on a hosted recording.
4. **RV-2's note.** First with none: case 3's last seek left one up while paused, so play carries the replay past it,
   and paused again the note stays hidden (else "shown after a seek" could not fail). Then after a seek the note is
   shown with `SEEK_NOTE`'s words; played on, it is hidden once the bar has passed the target; paused again, it stays
   hidden.
5. **RV-7's moved remnant** (249 §4, :775-776; the plan's Log, 2026-10-11T04:22Z).
   - In the countdown, the HUD model's `timer` is the countdown's seconds left on the replay's clock (`NetPage.frame`,
     `launchAt`), within `RV1_CLOCK_TOLERANCE_S_PLACEHOLDER`, and stands while paused. No round screen is set.
   - The countdown's line is posted once by the seek: the message window holds one more post of exactly
     `countdownLine(seconds)` -- "GAME STARTS IN 7 SECONDS" (`net/rules.ts` `countdownLine`, the lobby's "GAME STARTS IN"
     n "SECONDS", UIMnLOC 354-355; posted by `NetPage.countdown` through `Hud.postMessage`) -- and it is the newest.
     Read off `devSeen().hud.posts` (below).
   - Inside the engine's read, no round screen.
   - Inside ROUND COMPLETE, the model's `roundScreen` is the recorded screen's kind at its age, with round 1's winner
     (none) and wins. Its start comes from the welcome's result (`applyJoinState`).
6. **RV-3's controls.**
   - The nine transport buttons, Back and the three camera buttons each have an accessible name. The transport buttons
     and Back also name their keys (`aria-keyshortcuts`).
   - Each of those buttons and the seek band measures at least 44 px both ways (`--s2u-hit-min`).
   - The bar is a native range input named "Seek", with its keys and its pad step (the jump in ticks).
   - Focused, the hint row shows the arrows, the D-pad and Circle's Back.
   - ArrowRight and ArrowLeft jump by `MU_REPLAY_JUMP_SECONDS_ADAPTATION` with the focus kept, and the band wears its
     focus ring (`outline` 2px solid).
   - The D-pad's right and left do the same through the walker. The pad is the stubbed controller of `startupDevices.ts`,
     as `startup.spec.ts` walks the launcher with it; so a pad press is asserted, not only the walker's attributes.
   - Circle closes the viewer and puts the focus on the card's Watch.
   - No page error on any page.

### What the page did not expose: the dev read added, and what stays unasserted

- **The countdown's line**, "GAME STARTS IN n SECONDS" (`countdownLine`), posted once on a seek into the countdown (249
  §4). It goes to the HUD's message window (`Hud.postMessage`, its private `posts`), which neither `hud()` nor
  `devSeen()` read, and a watcher's HUD is not drawn, so `devSeen().hud.drawn` holds no quads for it. **The read,
  granted by the merge controller at the fix round** (the first commit named `hook.ts` for it; `DevSeen` is declared in
  `devSeen.ts`, which `hook.ts` imports): `src/devSeen.ts` adds `hud.posts: { text, age }[]` -- each post `Hud.posts`
  holds, its lines' text newline-joined and its age on the HUD's own clock (`sinceOn` less its `at`), read by a cast
  from `Hud`'s private fields as `devSeen` reads `RemotePlayers`' and `GrenadeThrower`'s. A development build's only, as
  the rest of `devSeen`: `main.ts` hangs it under the literal `import.meta.env.DEV`, unchanged, and
  `test/devSeen.test.ts`'s `builtDist` guard still holds the release free of it; `hook.ts` is unchanged.
  `test/devSeen.test.ts` holds the read (held while the HUD is off, a watcher's, at age 0; aged on the HUD's clock while
  on; a two-line post; a copy) and the `Hud` field names it takes. On a watcher's page the HUD's clock stands (it runs
  while the HUD is on), so a post there is held at age 0 and never fades: the spec counts the posts of the line before
  and after the seek.
- **The round screen drawn.** `main.ts` hides the HUD for anyone not walking (`hud.setVisible(walking)`, §7), so a
  watcher's page sets the screen in the HUD's model but draws no quad of it. The spec asserts the model and records what
  `devSeen().hud` drew as an annotation, without asserting it. Whether a spectator's console draws the screens is
  `WATCHER_ROUND_SCREEN_PLACEHOLDER` (§7.1), RV-5 phase 2's.

### Assumptions the browser run must check

None of these could be checked without a browser. Each failing one is a finding for this section, not a reason to
loosen the spec.
1. The disc: with `SOCOM_ISO` set, the owner's image (the precedents' way). Without it, a disc image packed from
   `test-fixtures/RUN` (the front end's table and MP72 with the run's tables, the other maps left out) must pass the
   setup page's gate ("Disc loaded") and let the framed test room build MP72's world with its bodies and their fittings
   (the carrier's Satchel) with no served tree: **no precedent** -- `iso.spec.ts`'s pack draws a map, no body. The frame
   has no `?devmode`, so it reads the visitor's disc only.
2. The framed test room's `window.__viewer` carries `devSeen` (a development build's, the e2e's Vite), and Playwright
   finds the frame by its address.
3. The sign-in's form fields are `input[name="name"]` and `input[name="password"]` and its submit is the form's
   `button[type="submit"]`. ACCEPT is clickable while the agreement's text is still being retrieved.
4. The dev proxy carries the pages' requests: the login's POST (its `Origin` the page's, allowed), `/texts` for the
   agreement, `/replays` and `/replays/<id>` as same-origin GETs with the bearer (`originGate.ts`, by `Sec-Fetch-Site`),
   from the run's Vite on `localhost` to the match server bound `::`; and the run's Vite inherits `S2U_DEV_PROXY_PORT`
   from the command's environment (`playwright.config.ts` `webServer`).
5. With the pad stubbed in the page, the launcher's walker acts on the seek bar: the frame's own test room reads the
   same stub (its spectator moves its camera), which changes nothing the spec reads. `document.hasFocus()` holds while
   the bar is focused.
6. Setting the range input's value and dispatching `input` lands the seek exactly: `step` is 1, and `min` and `max` are
   the span's ticks.
7. The countdown's figure on a seek is the fold's (`countdown` in the welcome). The screen's age is the welcome's
   result's `at` (the `roundOver`'s tick). Both are read off 249 §4 and `joinState.ts`, not seen.

*Checked by runs 4-5 (2026-10-11; "The browser runs", below):* run 5, with the fixture-packed image, passed every case
(6 passed), so the assertions that rest on assumptions 1-7 held on it -- assumption 1's "no precedent" pack included:
the gate said "Disc loaded" and the framed test room built MP72's world with the carrier's Satchel. Assumption 1's
first sentence was doubted after run 4, when the owner's full image did not pass the launcher's gate; that red is now
read as this spec's race, not the image (withdrawn, below; the re-run through the console, 2026-10-12 on `9c4aaa385`,
passed its disc step with the image by the spec's default (`discImage`, the fixture-packed image; `RV1_OWNER_ISO` unset in the command)). The owner's image stays an explicit opt-in, not run through the
console.

### `ReplayClient` and the segment HTTP (W39.R2)

Unchanged: no record kind, no format version, no route. The one source change is the dev read in `src/devSeen.ts`
(above), a development build's only.

### Not done against the brief, and why

- **Two page sockets play the match, not two browser pages** ("The match", above): the controller's accepted
  deviation.
- **No browser, no typecheck.** The spec and the module's types were written by reading. The typecheck (`tsc -p
  packages/viewer`, which covers `e2e/` and `test/`) and the first run are the merge controller's.
- **Research 244 §7.3** is not edited. The plan's row names it, but the brief's files are this note's §9 alone. A dated
  pointer there to this section is owed at the merge. *(Paid at RV-11b, 2026-10-11: 244 §7.3 carries the pointer.)*
- **`test-fixtures/MANIFEST.json`'s `usedBy`** does not yet name the new test or spec for MP72.ZDB, READERC.ZAR,
  ZWEAPON.ZAR, MOTION_P.ZAR and RUN/UI/READERC.ZAR. That file is outside the brief's files, as it was for RV-8a until
  its fix round. *(Paid at RV-11b, 2026-10-11: `e2e/replayViewer.spec.ts` for all five, `test/replayViewerMatch.test.ts`
  for the four the match server reads -- not RUN/UI/READERC.ZAR, which only the launcher's disc gate reads. Not
  `e2e/replayViewerMatch.ts`: it is handed the fixtures' directory and names no fixture file, so
  `fixtureManifest.test.ts`'s rule -- each named file names the fixture -- would refuse it, as it would
  `e2e/roomRecordings.ts`, which is not listed either.)*
- **Outside §9, one line of this note** changed: the opening paragraph's list of sections names §9.

### Evidence

A unit test only (node), on the fixtures (`test-fixtures/RUN`): a match server and two page sockets, in the test's
process on port 0. No browser, game or dev server was run, and no typecheck. Kept apart:
- `packages/viewer/test/replayViewerMatch.test.ts` (new, 7 tests; the match's six are skipped, and said so, without
  the fixtures; about 42 s of real time):
  - `rv1Port` reads `E2E_LOCAL_PORT` and refuses every port the brief names as another session's (at the fix round:
    anything outside the lane's 5303-5308, and an unset or empty value);
  - one closed game recording under `game_MP72_<game>/`, a server's (no command records), its sidecar the game's room,
    MP72, classic, the two players' accounts and names, and round 1's draw as its result;
  - in the recording, in order: the game lobby's countdown (11 s), broadcast once; round 1 at least 11 s after it, of
    `RV1_ROUND_S_PLACEHOLDER`'s length; the bomb on the ground at its reset place before the placement; the room's
    pickup by the carrier after the placement and before the carrier's return; never on the ground again before round
    2; one `roundOver` (round 1, no winner, not the match's end, ROUND COMPLETE's 5 s); round 2 after it;
  - the carrier's body in the snapshots: more than 40 units from the bomb before the pickup, within 20 of it while
    carrying it, back at its spawn after;
  - the spec's targets: inside the countdown with the figure it should show, before and after the pickup, inside the
    engine's read and inside ROUND COMPLETE, all within the file;
  - `GET /replays` for each player lists the match with its players and result, and the fetch returns the file's bytes;
    the third account and a request with no bearer list nothing, and the third account's fetch is 404; each player can
    sign in again after logging off;
  - `resultLine` equals `view.ts`'s `resultWords` on this match's result and four others (a SEALs' and a Terrorists'
    win, a level match over, a match cut short) -- at the fix round in its own `describe`, which needs no fixture, so
    the guard runs where the match is skipped.
- RED: the file failed to load ("Cannot find module '../e2e/replayViewerMatch'"): the helper was written first and set
  aside for the run. GREEN, first run: 6 passed, 1 failed -- the snapshot at or before the pickup's tick still showed
  the carrier at its spawn (968.8 units away), because the room snapshots at `SNAPSHOT_HZ`, not every tick. The test was
  wrong, not the match: it now reads the last snapshot before the carrier's return. GREEN: 7 passed.
- `packages/viewer/e2e/replayViewer.spec.ts`: written by reading, **not run** at its commit. Its first runs were the
  merge controller's browser window on 2026-10-11 (below, "The browser runs").
- `tools/test/conventions.test.ts`, `tools/test/docs.test.ts`, `tools/test/placeholderLedger.test.ts`: run alone after
  this section was written: 105, 16 and 13 passed.
- Fix round (the host's turn, each run alone after its own memory read): `devSeen.test.ts` RED with the first
  commit's `src/devSeen.ts` put back (1 failed: "expected undefined to deeply equal []", the posts' read; 10 passed, 1
  skipped: no build in `dist/viewer`), GREEN 11 passed, 1 skipped (the same `builtDist` guard, said so);
  `replayViewerMatch.test.ts` 7 passed (`rv1Port` and the result line's guard now outside the fixtures' skip); the
  three tools tests after this line was written, 105, 16 and 13 passed. The spec is still not run (at this fix round;
  its runs since are "The browser runs", below).

### The browser runs (2026-10-11, the merge controller's window)

Copied from the sprint 39 plan's Log (2026-10-11T10:54Z), which holds the record; written here at RV-11b. **Evidence
kind: rendered browser runs** (headless Chromium, `--workers=1`, each after a memory read and the host lock read
`FREE`), on the lane after RV-1's merge (`78af4aaab`; the Log's entry names no commit for these two runs), with
`S2U_DEV_PROXY_PORT=5307 E2E_PORT=5306 E2E_LOCAL_PORT=5307 E2E_PLAYTEST_PORT=5308`.
- **Run 4, with `SOCOM_ISO` set** (the owner's full image, as the spec then chose), 10:33:04Z-10:34:50Z, exit 1: **1
  passed, 1 failed, 4 did not run** (1.7 min). Case 1 (the hosted match recorded by the match server) green. Case 2 red
  at its first step: after `setInputFiles` of the owner's full image, the launcher's disc badge stayed "Insert disc" for
  the spec's 60 s (`RV1_PAGE_WAIT_MS_PLACEHOLDER`). Withdrawn as a launcher finding, a spec race (below).
- **Run 5, with `SOCOM_ISO` unset** (the fixture-packed image, the spec's first design), 10:52:55Z-10:54:01Z, exit 0:
  **6 passed** (1.1 min). The whole path, seen rendered for the first time:
  - the hosted match recorded by the match server (game 1, 1228 records, MP72);
  - Replays by account: A and B list it with its result line, C the empty list (RV-4, W39.R4);
  - the owner's case in the modern viewer's frame: past the pickup (tick 964) the bomb's state 2, carrier 1, the world
    bomb gone; back before it (tick 752) state 1 at its place, the world bomb visible; forward again, carried;
  - RV-2's seek note shown after a seek and cleared once play passed the target;
  - the countdown at tick 242: the figure 7 and "GAME STARTS IN 7 SECONDS" posted; ROUND COMPLETE at tick 2162 in the
    HUD's model, not drawn (a watcher's HUD is RV-5 phase 2's);
  - RV-3's controls: the names, the keys, the bar's keyboard and pad jumps with the focus kept, its ring, 44 px, and
    Circle closing the viewer.
- **Since then** (RV-11b): the spec's disc is the fixture-packed image by default, the owner's full image an opt-in
  (`RV1_OWNER_ISO=1` with `SOCOM_ISO`; `discImage`). The run command above is unchanged. The edit has not been run.
  (Run since: runs 7 and 8 and the two runs of 2026-10-12 below, each on the image by the spec's default, `RV1_OWNER_ISO` unset
  in the command.)
- **Run 7, with the fixture-packed image** (`replayViewer.spec.ts` on `1ebb0f3c9`), 21:49:16Z-21:51:03Z, exit 1: **1
  passed, 1 failed, 4 did not run**. Case 1 green; case 2 red at its disc step, the badge "Insert disc" for the 60 s, as
  in run 4 -- with the fixture-packed image this time (withdrawn as a launcher finding, a spec race, below).
- **Run 8, after RV-1c's wait** (`replayViewer.spec.ts` on `33a6c1ffe`, the old setup page, before CX-9b),
  21:58:13Z-21:59:33Z, exit 0: **6 passed** (1.3 m), rendered, headless Chromium, the image by the spec's default. The
  disc step green on the old gate with the wait (`#setup-pad-status` "Connected", then `#startup-disc-badge` "Disc
  loaded"): the run-4/run-7 red confirmed a spec race (the plan's Log, 2026-10-11T21:59Z). The owner's bomb case green
  in the modern viewer; the watcher's HUD drawn at ROUND COMPLETE (3 bitmaps).
- **Through the console, 2026-10-12** (the sprint 39 close's record; the plan's Log, 2026-10-12T10:52Z). Since CX-9b
  the page at `/` is the console launcher, and RV-12 re-pointed the spec to it (§13): the disc through the console's
  picker input, the sign-in through its dialog, Watch from its row. Rendered browser runs, headless Chromium,
  `--workers=1`, the merge controller's slot (lock `FREE`), the image by the spec's default (`discImage`, the fixture-packed image; `RV1_OWNER_ISO` unset in the command), each before the Log's 2026-10-12T10:52Z entry (the times from the
  controller's command output, `date -u`):
  - begun 10:39Z on `8e293bc47`: 3 passed, case 4 failed at :438 (its bar read 752, not past the target, right after the
    note hid), 2 not run. The spec's race, not the transport's (RV-12b, §13), fixed by a bounded poll;
  - **10:48Z-10:49Z on `9c4aaa385`: 6 passed** (1.1 m) -- the hosted match recorded; the list per account (A Watch, B "Needs
    disc", C "No replays yet"); the result in the drawer for A and B; Watch from the console row; the owner's
    bomb-reverse case; the seek note; the countdown and ROUND COMPLETE; the controls by pad with Circle closing.

### Withdrawn, a spec race: the disc badge at "Insert disc"

**What was seen** (run 4 only, once): with `SOCOM_ISO` set, after `setInputFiles` of the owner's full image on
`#disc-page-file`, the launcher's disc badge (`#startup-disc-badge`) read "Insert disc" when the spec's 60 s bound
ran out. No precedent loads the full image through the **launcher's** disc gate: `startup.spec.ts` builds a small image,
and `tauntsTestroom.spec.ts` (:135-136) loads the full one into `/testroom?...&devmode`, whose page reads it through the
viewer's own disc path (`packages/viewer/src/ui.ts` `Ui.onDisc` :152, `main.ts` `openDisc` :954). The merge controller
filed it as a finding for the launcher work (the plan's Log, 10:54Z).

**Withdrawn, a spec race** (RV-1c, 2026-10-11; written "pending the re-run", settled below): the attribution to the owner's full image through
the launcher's gate is withdrawn. The same red -- "Insert disc" for the 60 s -- came with the fixture-packed image in
run 7 (2026-10-11, 21:49:16Z-21:51:03Z, "The browser runs", above), so the image is not the cause. The likely cause is
this spec's own race: `launcherAs` set the file (`setInputFiles`) at once after `page.goto('/')`, before the page could
have wired the input's `change` handler; a change set before the listener is missed, and the badge never leaves
"Insert disc" -- which agrees with this section's own reading below, "'Insert disc' at 60 s is not the reading
state". `startup.spec.ts` (:354) waits for the
page to boot (`#setup-pad-status` "Connected") before it sets the file; `launcherAs` now does the same, bounded by
`RV1_PAGE_WAIT_MS_PLACEHOLDER`. Why that wait proves the wiring (source inspection, at `1ebb0f3c9`): "Connected" is
written only by `ControllerSetup.frame` (`packages/viewer/src/controllerSetup.ts` :135; the page's own text is
"Connect a controller, then press a button.", `packages/viewer/index.html` :109), called from `Startup`'s animation frame
(`startup.ts` :109; the first frame requested :125, in the constructor `pageEntry.ts` `setup` :103 calls) or a START
click (:81); `bootPage` goes on from `await loaders.setup()` (`pageEntry.ts` :223) to `offerDisc` and `watchDiscPrompt`
(:248), which adds the `change` listener (`discPrompt.ts` :79) in the same task, before any animation frame runs. This
is a reading of the spec, not a product finding; run 8 re-ran it on the old gate and passed its disc step (below).
The `RV1_OWNER_ISO` opt-in stays.

*The re-run:* run 8 (2026-10-11 21:58Z-21:59Z, on `33a6c1ffe`, "The browser runs" above) re-ran the spec with the
wait on the old gate and passed its disc step: the race confirmed (the plan's Log, 2026-10-11T21:59Z). Since CX-9b the
old setup page's launcher and its disc gate (`#startup-disc-badge`) are gone (the sprint 39 close's record, 2026-10-12). The spec's disc step now
goes through the console's picker input, whose `change` the console's disc adapter wires before the first draw
(`packages/viewer/src/console/adapters/disc.ts`; the spec waits for the console drawn), and it passed in both runs of
2026-10-12 with the image by the spec's default (`discImage`, the fixture-packed image; `RV1_OWNER_ISO` unset in the command) (on `8e293bc47` and on `9c4aaa385`, "The browser runs" above): a rendered
browser run, headless Chromium. The withdrawal stands: nothing seen points at the image; the race's reading on the old
gate held in run 8 and is moot since CX-9b. The owner's full image through the console (`RV1_OWNER_ISO=1`) has not been run.

**What the code says should happen** (source inspection, at `7db5583d4`, RV-11b's base):
- the input's `change` hands the file to the gate (`packages/viewer/src/discPrompt.ts` `watchDiscPrompt`, `onChange`
  :58, listened at :79);
- the gate's handler sets the badge to "Reading disc…" at once, before any byte is read (`packages/viewer/src/pageEntry.ts`
  `offerDisc` :243, the handler :248, `gate.reading` :251; `packages/viewer/src/startup.ts` `reading` :184, the badge's
  words in `sync` :158);
- then it opens the image (`pageEntry.ts` :253, `open(file)`: `discPrompt.ts` `openFrontEndImage` :25, an
  `IsoAssetSource` over the `File` and one `size` of `RUN/UI/READERC.ZAR`, `packages/archive/src/isoAssetSource.ts`
  `size` :145; "one directory walk and no file's bytes", as `openFrontEndImage`'s own doc comment says,
  `discPrompt.ts` :22-23) and, when it opens, sets "Disc loaded" (`startup.ts` `ready`).
So "Insert disc" at 60 s is not the reading state: the badge was not in "Reading disc…" at the last read. Which step did
not happen is not known.

**What would settle it** (each a measurement in a browser, none run):
- whether the input's `change` reached `watchDiscPrompt`'s handler after `setInputFiles` of a multi-GB file, and when
  (Playwright hands a local path's file to the page; the time it takes for a file of the full image's size is not read);
- the gate's read timed: `openFrontEndImage`'s `IsoAssetSource` construction and its `size` call on the full image, in
  the launcher's page, against the fixture-packed image's;
- the badge and the status line (`#startup-disc-badge`, the gate's status) sampled through the wait, not only at its end;
- the same `setInputFiles` on `/testroom`'s disc input, where `tauntsTestroom.spec.ts` reads the full image, timed
  beside it.
`startupNavigation.ts` is the launcher's pad walker and reads no file; the reader is the disc page's (`discPrompt.ts`,
`pageEntry.ts` `offerDisc`). The spec uses the fixture-packed image by default; the owner's image stays an opt-in.

2026-10-11 (RV-8c, issue #91's guard): the launchers' contexts are registered with an `OpenedContexts` closed in
afterAll (cases 3-6 use A's launcher, so not afterEach), replacing `s.contexts`; the guard names the spec in `SHARED`.
Context handling only, no assertion changed. Not run (no browser).

### 9.1 Placeholders

Test values and bounds of the spec and its Node half, none a game value. They are outside the ledger's walk
(`packages/<name>/src` and `tools/`), so each row is *note only*, as §8.1's are.

| name | value | where | status |
|---|---|---|---|
| `RV1_ROUND_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 20 s | `packages/viewer/e2e/replayViewerMatch.ts` | the server's `ROUND_SECONDS` for the test match: above DEMOLITION's `timerWatchS` (15 s), so the time-out is the room's own |
| `RV1_BEFORE_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 3 s | `packages/viewer/e2e/replayViewerMatch.ts` | round 1 with the bomb on the ground before the carrier is stood on it: the "before" window |
| `RV1_HOLD_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 1 s | `packages/viewer/e2e/replayViewerMatch.ts` | the carrier on the bomb's place, carrying, before it is stood back |
| `RV1_AFTER_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 1 s | `packages/viewer/e2e/replayViewerMatch.ts` | the "after" target past the carrier's return (snapshots have it there) |
| `RV1_TAIL_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 1 s | `packages/viewer/e2e/replayViewerMatch.ts` | recorded into round 2 before the sockets close |
| `RV1_INTO_COUNTDOWN_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 4 s | `packages/viewer/e2e/replayViewerMatch.ts` | the countdown target's place inside the 11 s countdown |
| `RV1_INTO_SCREEN_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 2 s | `packages/viewer/e2e/replayViewerMatch.ts` | the screen target's age inside ROUND COMPLETE (5 s), past `ENGINE_READ_S` |
| `RV1_CARRIED_AWAY_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 40 units | `packages/viewer/e2e/replayViewerMatch.ts` | the least horizontal distance of the carrier's spawn from the bomb's ground place (`PATHS_CARRIED_AWAY_PLACEHOLDER`'s 30 and ten) |
| `RV1_STEP_WAIT_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 60 s | `packages/viewer/e2e/replayViewerMatch.ts` | the bound of each wait of the match's steps (the round's end: its length, 10 s and this) |
| `RV1_CASE_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 10 min | `packages/viewer/e2e/replayViewer.spec.ts` | each case's timeout: the match (about a minute), a world's first load on a loaded host |
| `RV1_PAGE_WAIT_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 60 s | `packages/viewer/e2e/replayViewer.spec.ts` | a launcher page's step: the modern chunk, the sign-in, the list, the frame's making |
| `RV1_WORLD_WAIT_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 180 s | `packages/viewer/e2e/replayViewer.spec.ts` | the framed world's open: the disc image indexed, MP72 loaded (`replayEngine.spec.ts`'s 180 s) |
| `RV1_SEEK_WAIT_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 10 s | `packages/viewer/e2e/replayViewer.spec.ts` | a seek's landing on the bar, a key's or a pad press's effect, the marks' poll |
| `RV1_PLAY_PAST_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 15 s | `packages/viewer/e2e/replayViewer.spec.ts` | play carrying the replay past a seek's target, which clears the note |
| `RV1_DRAW_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 0.3 s | `packages/viewer/e2e/replayViewer.spec.ts` | the frame's own frames after a seek before it is read (`replayEngine.spec.ts`'s) |
| `RV1_PLACE_TOLERANCE_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 1 unit | `packages/viewer/e2e/replayViewer.spec.ts` | a drawn place against the recorded one (`ENGINE_PLACE_TOLERANCE_PLACEHOLDER`'s) |
| `RV1_MARK_ON_BODY_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 1 unit | `packages/viewer/e2e/replayViewer.spec.ts` | the `ret_bomb` mark against the carrier's drawn body (`PATHS_MARK_ON_BODY_PLACEHOLDER`'s); **retired 2026-11-02** (OT.R99, as amended: no mark on the carrier for any viewer; the carried case asserts no `ret_bomb` and the carrier's body past `RV1_CARRIED_AWAY_SPEC_PLACEHOLDER`; task DkA3Lwsa) |
| `RV1_CARRIED_AWAY_SPEC_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 30 units | `packages/viewer/e2e/replayViewer.spec.ts` | the carried mark's least distance from the ground place (`PATHS_CARRIED_AWAY_PLACEHOLDER`'s) |
| `RV1_CLOCK_TOLERANCE_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 0.05 s | `packages/viewer/e2e/replayViewer.spec.ts` | the HUD's countdown figure and the round screen's age against the recording's (`ENGINE_TIMER_TOLERANCE_S_PLACEHOLDER`'s) |

## 10. A report's six clips and its replay, rendered: the spec (RV-11b)

Written 2026-10-11T11:05Z for RV-11b of web sprint 39 (the plan's Log, 10:32Z: "Run 3 (RV-11's six-mark report) has
no spec"; 10:54Z: "Owed from these runs"). It is §4's rendered check (§4, "What was not measured"; LATER 30; research 249
§7.3, RE-5's runs 10 and 13), written as its own spec because `replayEngine.spec.ts` :564-569 refuses every
`clip.webm` on its report page. The code: the new `packages/viewer/e2e/reportClips.spec.ts`, its pure half
`packages/viewer/e2e/reportClips.ts`, and that half's unit test `packages/viewer/test/reportClips.test.ts`. The
playtest report is the project's own instrument (PLAYTEST_INSTRUMENT_ADAPTATION, research 243): nothing here reads or
changes a game value or behaviour.

**The spec was written by reading and has not been run.** Its author could run no browser. Its first run is the merge
controller's window, from `socomlegacy/`, with the served maps the run's Vite waits on (`public/maps`, MP2):

```
E2E_PORT=5306 E2E_LOCAL_PORT=5307 E2E_PLAYTEST_PORT=5308 npx playwright test packages/viewer/e2e/reportClips.spec.ts --workers=1 --reporter=line
```

It refuses, by name, any of the three ports outside the lane's 5303-5308 (`lanePort`).

### The session: six marks, each with its clip, as the precedents make them

Nothing of the evidence is written by the test. The session is `playtestLoop.spec.ts`'s:
- a `SessionService` in the test's process on `E2E_PLAYTEST_PORT` over a temporary store;
- its record's `launch.url` is `pageUrl`'s address on the run's Vite origin (`sessionPage.ts` `onE2eDevServer`), so
  the report's iframe names that Vite (`report/page.ts` `replayFrameSrc`, through `devOrigin`);
- the closeout's resources are registered as `start` registers them: the page closed, the dev server kept (W35.R3).

The test room opens offline on Frostfire (MP2) with `&playtest=` and `&noarmory`. The spec waits for:
- the status line, the room open and the load's hold released;
- the page's session named on the hook;
- the page's video ring past `REPORT_CLIPS_RING_S_PLACEHOLDER`.

F8 is then pressed `REPORT_CLIPS_MARKS` (6) times, `REPORT_CLIPS_MARK_GAP_S_PLACEHOLDER` of frames apart. Each mark is
counted on the page and in the store, as `replayEngine.spec.ts`'s `mark` counts it. Each mark's frame, telemetry and
clip are the page's own, sent through its socket (`playtestSession.ts` `mark` :547-595: the ring's `pin`, then the
`clip` message and its bytes once the after-window is recorded). The service keeps them (`service.ts` `keepClip`).
The spec waits until all six observations hold a clip. A browser whose ring keeps none fails there, by name; it is
not skipped, since six clips are the spec's premise. The `close` verb then closes the session and the page.

### What the spec asserts on the report, and where each read comes from

The report is opened in a new page of the same context at `http://127.0.0.1:<service>/report`, to its DOM only (as
`replayEngine.spec.ts` opens it). Every request of the context from then on is logged through Playwright's context
events (`request`, `response`, `requestfailed`): its URL, the time seen, its `Range` header, the answer's status and
`Content-Range`. The play page is closed by then, so every entry is the report's or its replay frame's.
`reportClips.ts` reads the log: `clipObservation` (`/evidence/<observation>/clip.webm`, `report/http.ts`'s route),
`segmentIndex` (`/segments/<n>.s2r`, `segmentsHttp.ts` `SEGMENT`), `clipAsks`, `rangedAnswer`, `segmentAnswers`.
1. **On the page:** six `article[data-observation] video`, each `preload="none"` (`report/page.ts` :217-220), and the
   replay's iframe (`replayFrameSrc`, the session closed).
2. **The replay frame up, its segment answered, the six videos on the page** (RE-5's hang's opposite). The iframe is
   scrolled into view, since Chromium stops an out-of-view cross-origin frame's animation frames (`replayEngine.spec.ts`
   `inView`). Then, in order:
   - the frame's hook is up;
   - a `/segments/<n>.s2r` read is answered, and answered 200;
   - the replay's client is open (`net().state`) and its load's hold released;
   - its bar says REPLAY (`[data-replay-bar]`, as `playtestLoop.spec.ts` reads it);
   - the six videos are still on the page.

   Annotated: the time from the report's request to the bar; to the segment read's request (`at`, when the test saw the
   `request` event) and to its answer (`answeredAt`, when it saw the `response` event); and the report's `readyState`.
3. **No clip asked before play.** After the bar and `REPORT_CLIPS_SETTLE_S_PLACEHOLDER` of the report's own frames, the
   log holds no `clip.webm` request; checked again at the moment of the press.
4. **The video box before play**, annotated and asserted nothing about (§4's cosmetic note: a `preload="none"` video
   has no frame to size it by): each video's laid-out CSS size, its intrinsic size, `readyState` and `networkState`.
5. **Play on one clip** (the first mark's): the element's `play()`, what the native control's play runs, on a muted
   element so that the autoplay policy cannot refuse it, and not awaited. Within `REPORT_CLIPS_PLAY_WAIT_MS_PLACEHOLDER`
   the log must hold a read of that clip with a `bytes=` range answered 206 (`report/http.ts` `byteRange` :63,
   `sendClip` :81). The range, the `Content-Range`, the video's state after it and every clip request are annotated. If
   the other five clips are asked after the press, that is recorded, not asserted.
6. No page error on the play page or the report.

### Assumptions only a browser can check

None of these was checked; each failing one is a finding for this section, not a reason to loosen the spec.
1. Headless Chromium on this host records the canvas (MediaRecorder and `captureStream`), so each mark is `pinned` and
   six clips reach the service within `REPORT_CLIPS_PIN_WAIT_MS_PLACEHOLDER` of the last mark. `playtestMark.spec.ts`
   saw one clip so; six close marks pinning one ring at once are not seen. A mark made `REPORT_CLIPS_RING_S_PLACEHOLDER`
   into the ring has a Cluster to start from.
2. Chromium makes no request for a `<video preload="none">` until play, whatever the page's layout. The HTML standard
   makes `preload` a hint (§4).
3. Playwright's context events report the replay frame's requests (an out-of-process, cross-origin iframe's `fetch`) and
   the report's media requests, with the media request's `Range` in `headerValue('range')` and a `response` event for
   the 206.
4. Chromium's first read of a clip after `play()` carries a `Range` header with the `bytes=` unit (not seen on this
   report). The route answers 206 to `bytes=0-` (`byteRange`: the whole file as a range).
5. A muted `play()` from the test's evaluate starts the element's load as a pressed control would. The native control
   itself is not clicked, since its parts are in the browser's shadow tree.
6. The cards stay as served while the spec reads them. The report's script swaps card bodies only on a `record` event
   (`report/page.ts` SCRIPT), which the service writes after a store change, not on connect (`report/sse.ts` :38-39),
   and the spec changes nothing in the store after the close. A swap, if one came, would make new
   `<video preload="none">` elements and ask nothing, but the press could then land on an element that is replaced.
7. The report's replay iframe sits above the cards, partly in a 1280x720 view, so its frames run once it is scrolled into
   view.

**What a green run would and would not show.** It would show that, on this build, a report with six clips does not
stall its replay frame, that no clip is asked before play, and that play is answered with a range. It would not show
that the clips caused RE-5's runs 10 and 13 to hang: the report before RV-11 (`preload="metadata"`, no Range) is not
what this spec opens. That stays §4's "not proven", unless a run of this spec against RV-11's base reproduces the hang.
And it may say less still: the replay frame is another site (the run's Vite on `localhost`) inside the report on
`127.0.0.1`, and Chromium may pool a cross-site frame's connections apart from the top page's (its connections keyed by
the top-level site and whether the frame is cross-site), so the six clips may not contend with the segment reads at
all. Whether they share a pool on this build is not read; a run against RV-11's base that hangs would show that they
can, one that does not would leave it open (RV-11b's review, N3).

### `ReplayClient` and the segment HTTP (W39.R2)

Unchanged: no source change. RV-11b adds a spec, its pure helper and the helper's unit test.

### Not done against the brief, and why

- **No browser, no typecheck.** The spec was written by reading; the typecheck (`tsc -p packages/viewer`, which covers
  `e2e/` and `test/`) and its first run are the merge controller's.
- **A unit test outside the brief's file list:** `packages/viewer/test/reportClips.test.ts`, the failing test first
  for the helper the brief allowed (`e2e/reportClips.ts`). The spec itself cannot be run without a browser.
- **The press is the element's `play()`, not a click on the native control** (assumption 5).
- **Outside §9 and §10, one line of this note** changed: the opening paragraph's list of sections names §10.

### Evidence

A unit test only (node). No browser, game, dev server or match server was run, and no typecheck.
- `packages/viewer/test/reportClips.test.ts` (new, 9 tests):
  - `lanePort` takes 5303 and 5308, and refuses by name 5302, 5309, the owner's and the merge controller's ports, a
    fraction and NaN;
  - `clipObservation` names a clip's observation (an escaped one and one with a query too), and is null for the mark's
    other files, a segment, a deeper path and a non-URL;
  - `segmentIndex` reads `/segments/0.s2r` and `/12.s2r`, and refuses the listing, `01`, a `.part` and a clip;
  - `clipAsks` before a moment; `rangedAnswer` takes only a `bytes=` range of that clip answered 206; `segmentAnswers`
    only the answered segment reads.
- RED: the file failed to load ("Cannot find module '../e2e/reportClips'"): the test was written first. GREEN: 9
  passed.
- `packages/viewer/e2e/reportClips.spec.ts`: written by reading, **not run**. *Run since* (the sprint 39 close's
  record; the plan's Log, 2026-10-11T21:14Z): 2026-10-11 21:13-21:14Z on `6c30e6678`, **1 passed (42.0 s), 0 skipped**,
  a rendered browser run (headless Chromium, automated input, the merge controller's); what it saw is §4's "Run since".
- After this section and the MANIFEST's `usedBy` were written, each run alone after its own memory read:
  `tools/test/conventions.test.ts` 105, `docs.test.ts` 16, `placeholderLedger.test.ts` 13, `fixtureManifest.test.ts` 13
  passed.
- **The fresh review: PASS WITH FINDINGS, medium-high** (precedents matched; clips do come out of headless Chromium, as
  `playtestMark.spec.ts` saw; §9's finding holds at the source). Fixed in the fix round: (L1) `replayViewer.spec.ts`'s
  header said the spec was never run -- it now names runs 4-5 and says the `discImage` edit is not yet run; (L2) three
  waits had no bound of their own (the report's navigation, the second count of the six videos, and `holdReleased`'s
  `waitForFunction`, which passes no timeout) -- each now takes a named bound, `holdReleased`'s two waits written out
  in the spec, and the scroll, the bar's text and the video's evaluates take `REPORT_CLIPS_PAGE_WAIT_MS_PLACEHOLDER`
  too; (N1) the segment's annotation read the request's time as the answer's -- `NetEntry` gains `answeredAt`, set at
  the `response` event, and both are annotated; (N2) §9's quote "one directory walk and no file's bytes" attributed to
  `discPrompt.ts` :22-23; (N3) the connection-pool caveat added (above, and the spec's header). The fix round's runs,
  each alone after its own memory read: `reportClips.test.ts` 9, conventions 105, docs 16, placeholderLedger 13 passed.

### 10.1 Placeholders

Test values and bounds of the spec, none a game value. They are outside the ledger's walk (`packages/<name>/src` and
`tools/`), so each row is *note only*, as §8.1's and §9.1's are. `REPORT_CLIPS_MARKS` (6) is not a placeholder: it is
Chromium's per-host connection count that §4's suspicion names, and LATER 30's "six or more".

| name | value | where | status |
|---|---|---|---|
| `REPORT_CLIPS_CASE_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 420 s | `packages/viewer/e2e/reportClips.spec.ts` | the test's bound: the play page's load, six marks and their clips, the close, the report and its replay (`playtestLoop.spec.ts`'s 420 s) |
| `REPORT_CLIPS_LOAD_WAIT_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 120 s | `packages/viewer/e2e/reportClips.spec.ts` | the play page's navigation, status line, room open, hook up and load's hold released (`holdReleased`'s default, its two waits written out in the spec so each takes this bound) |
| `REPORT_CLIPS_RING_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 5 s | `packages/viewer/e2e/reportClips.spec.ts` | the video ring's seconds before the first mark, so its clip has a Cluster to start from |
| `REPORT_CLIPS_RING_WAIT_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 60 s | `packages/viewer/e2e/reportClips.spec.ts` | the page's session named, and the ring reaching `REPORT_CLIPS_RING_S_PLACEHOLDER` |
| `REPORT_CLIPS_MARK_GAP_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 1 s | `packages/viewer/e2e/reportClips.spec.ts` | real seconds of frames between two marks |
| `REPORT_CLIPS_MARK_WAIT_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 10 s | `packages/viewer/e2e/reportClips.spec.ts` | a mark counted on the page and kept by the service (`replayEngine.spec.ts` `mark`'s) |
| `REPORT_CLIPS_PIN_WAIT_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 60 s | `packages/viewer/e2e/reportClips.spec.ts` | every clip kept after the last mark: its after-window (`VIDEO_PIN_AFTER_S`, 10 s) and the send |
| `REPORT_CLIPS_CLOSE_WAIT_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 60 s | `packages/viewer/e2e/reportClips.spec.ts` | the `close` verb's closeout (`playtestLoop.spec.ts`'s) |
| `REPORT_CLIPS_PAGE_WAIT_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 30 s | `packages/viewer/e2e/reportClips.spec.ts` | a report step: its navigation to the DOM, its six videos (both counts), its iframe and the scroll to it, the replay frame found by its address, the bar's text read, each evaluate on the played video |
| `REPORT_CLIPS_FRAME_WAIT_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 180 s | `packages/viewer/e2e/reportClips.spec.ts` | each step of the replay frame's open: its hook, the segment answered, its client, its hold, its bar (`replayEngine.spec.ts`'s 180 s) |
| `REPORT_CLIPS_SETTLE_S_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 2 s | `packages/viewer/e2e/reportClips.spec.ts` | the report's own frames after the bar, still before any play, so that a clip asked late shows |
| `REPORT_CLIPS_PLAY_WAIT_MS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 30 s | `packages/viewer/e2e/reportClips.spec.ts` | from the press to the clip's ranged read answered 206 |

## 11. RV-5 phase 2 after PAR-48

Written 2026-10-11T21:06Z for RV-5 of web sprint 39 (the plan's RV-5 row, W39.R5, and its Log on RV-5 phase 1 and
PAR-48), on the merge controller's ruling of the same evening: **option (a), one setter**. No page, `main.ts` or
`hud.ts` line of this lane changes. The levels: what a spectator is shown or not is §7's reading (reviewed); the
free camera's title (part 3) is **reading** (written pending review; its fresh re-review, PASS, high, before RV-5
prep's merge, `b7146a8bf`, 2026-10-11T21:13Z; the plan's Log), and it agrees with PAR-48; nothing here was measured
running.

**What was built and removed.** A first commit of this task (`ec8c11ebe`) added
`packages/viewer/src/replay/watcherHud.ts` (a pure view of the watcher's page as a mirror of PAR-48's
`HudSpectatorView`, and a helper that set it at the open, after a seek's welcome and on a camera change) with its test
`packages/viewer/test/replayWatcherHud.test.ts`. Reading
PAR-48's `main.ts` showed that its frame already sets the watcher's view, so the helper would have been the HUD's
second setter. The controller ruled (a): the module and its test are removed in the next commit, and this section
records what remains.

### 1. PAR-48 sets the watcher's view; the replay needs no setter of its own

- PAR-48's frame (`agent/parity-2` 71892ee60, `packages/viewer/src/main.ts:1590` and `:1593`) computes
  `spectatorHudView(net, walk, () => loaded?.scenicViews ?? [])` once a frame and hands it to `hud.setSpectator`, for
  whichever page `net` is; the scoreboard's gate there is `walking || spectating !== null` (SELECT, `FUN_0022be20`
  tests no seat).
- Both replay branches assign the watcher's page to `net` (`main.ts:1755`, the modern viewer's framed world; `:1768`,
  the developers' mode).
- A recording's client joins as a spectator (`replayClient.ts` `welcome`: `role: 'spectator'`, id
  `REPLAY_WATCHER_ID`), and the page's spectator welcome flies the walk (`netPage.ts` `spectatorWelcome`). So
  `spectatorHudView` takes its spectator arm for the watcher: the followed player's name (`nameOf`) and score row,
  or no body in the free camera and on a scenic view.
- One setter is the rule: the replay sets nothing of its own, and §7 step 3's H3 (`replay/watcherHud.ts`) and H4 (four
  `main.ts` lines) are withdrawn. H1-H2 (the HUD's spectator draw) are PAR-48's.

### 2. What this lane checks once PARITY-2 lands on `main` and the lane merges it

- **The rendered HUD case**, RV-8's third `fixme` (`e2e/replayEngine.spec.ts`): a replay's watcher following a player
  draws the round timer and the followed player's name, and no compass (§7). Its browser run is the merge controller's
  window.
- **The replay's camera modes reach `spectatorHudView`**: follow, free and scenic, as the watcher's pad and keys set
  them on the page's `SpectatorView` (`NetPage.spectator`, research 244 §3). Each is read the same way as for a live
  spectator: follow gives the followed body's name and its row's kills, deaths and score; free gives FREE CAMERA; a
  scenic view gives its `Desc`, from `loaded?.scenicViews` (the frame's argument, not the replay page's own
  `scenicViews` dependency, so the two must name the same map's views). A unit test on a replay page with PAR-48's
  function, and the rendered case above, hold it.
- **After a seek**: PAR-48's line runs each frame, so the view follows the seek's restored rows and roster on the next
  frame, with no listener of the replay's (RV-2's order, §1, needs nothing more).

### 3. The free camera's title after a scenic view: FREE CAMERA, as PAR-48 has it (reading, reviewed before RV-5 prep's merge)

§7 read the panel's title for the spectator's own object as "the camera's `+0x114` string when it has one", else FREE
CAMERA. Re-read at the source:
- the own object's arm of `FUN_002425e0` (D:L90236-90257) reads the camera's `+0xf4` block's `+0x20` word (the
  camera's `+0x114`) with no test of the camera's mode; with no string there, the title is FREE CAMERA (0x3e6ec8) over
  (100, 100, 100) (D:L90326-90328);
- `FUN_00295260`, the spectator camera's controls, is called only from `FUN_0029b0c0` as
  `FUN_00295260(camera + 0xf4, ...)` (D:L142660), so its `pcVar8` is that `+0xf4` block and `pcVar8 + 0x20` is the
  `+0x114` word;
- at the top of every call, under the same online and spectator checks as its scenic steps (`DAT_0045a0c1`,
  `FUN_002c2fd0`), it zeroes that word byte by byte whenever the mode is not scenic (`if (*pcVar8 != 2)`,
  `pcVar8[0x20..0x23] = 0`, D:L139467-139472) -- free (0) and follow (1) alike;
- the word is set by `FUN_002ab260`'s sixth output (`*param_6 = record + 0x18`, D:L151485) at the three scenic steps
  -- X back to scenic (D:L139520-139522), Up (D:L139531-139533), Down (D:L139559-139561) -- and also cleared by the
  camera's initialiser `FUN_00299150` (D:L141667);
- X from scenic to free sets the mode to 0 (D:L139482-139483); the next call clears the word, and the title falls back
  to FREE CAMERA (D:L90326-90328).

So **the panel's title is a scenic view's `Desc` only in scenic mode, and FREE CAMERA in the free camera**, whatever
view was stood at before. That is what PAR-48's `spectatorHudView` does (it titles a scenic view only in scenic mode,
`agent/parity-2` 71892ee60, `hud.ts`): **no finding is pending for the gameplay seat.**

**A correction.** `ec8c11ebe`'s commit body and this part's first version (`3c8ced421`) claimed the opposite: that
after scenic -> free the last scenic name stays as the title, against PAR-48. It does not. The first reading's search
for `+ 0x114` missed the clearing write at D:L139467-139472, which the decompilation writes in byte-index form
(`pcVar8[0x20] = '\0'`, on the `+0xf4` block) rather than as an offset from the camera. The fresh review of
`3c8ced421` found it.

### 4. The elements of §7, for the replay's watcher under PAR-48

§7's step-1 table, column (a) (the lobby spectator), row by row: who carries each element for the watcher.

| §7's element | carried by | how, or why left out |
|---|---|---|
| round timer | the page | `spectatorHudView` gives no `roundTimer`: the HUD's own timer, fed by the watcher's `NetPage` on the replay's clock (RE-3, research 249 §4); shown whoever is viewed (D:L55998-56007, D:L56805) |
| scoreboard | the page | SELECT held, PAR-48's `main.ts:1590` gate (`walking \|\| spectating !== null`); the rows the recorded `score`'s |
| compass ring and its marks | the HUD | hidden on the spectator path (D:L56359; D:L68379-68386) by PAR-48's draw |
| health bar | left out | no snapshot carries another body's health: PAR-48's view gives `health: null`, no bar; free and scenic have no body (§7.1's own-info row) |
| weapon and ammo box | the HUD | hidden on the spectator path (D:L56340; D:L85354) |
| reticle | the HUD | hidden on the spectator path (D:L56327; its children inferred hidden with it, §7) |
| the followed player's name | PAR-48's view | `followed.name` from `nameOf`: the info box and the panel's title (D:L85558-85569, D:L90261-90271); the room has no clan tags |
| the panel's four stats | PAR-48's view | from the followed player's score row (D:L90308-90325); headshots empty, no row carries them; none with no row (a hostage) or no body |
| help lines | the HUD | the spectator path's four lines (D:L56869-56872) on the HUD's own clock |
| message window | the page | the watcher's `NetPage` posts the recorded round start, objective and kill lines as for a room's spectator (D:L56878) |
| radio and voice | the HUD | the voice element and the info box's radio icon (D:L56875, D:L85578); a recording holds no voice, so it shows none |
| `0x437540`'s object | left out | fed from key codes (D:L167306-167318); the watcher types nothing |
| small message window (pick-ups) | left out | hidden on the spectator path (D:L56355); the watcher has no body and picks nothing up |
| stance word, prompts, ZOOM line | the HUD | hidden on the spectator path (D:L56325, D:L56328, D:L56338-56339) |
| the info box's number | left out | unread (§7.1's info-number row); PAR-48's HUD does not draw it for a spectator |

### 5. What is dropped, and why

- **The module-specific names.** The removed module named `WATCHER_HEALTH_PLACEHOLDER` and
  `WATCHER_HEADSHOTS_PLACEHOLDER` in code, and added a third name for the title reading. No code carries any of them
  now: the first two stay §7.1's *note only* rows (PAR-48 names the same unknowns in its own code, research 282, not on
  this lane, and §7.1 is re-filed when PARITY-2 lands); the third, for a title kept after a scenic view, was wrong
  (part 3's correction) and has no successor: the title agrees with PAR-48.
- **The type-level drift test** (the brief's TODO) is moot: no local mirror of `HudSpectatorView` remains.

### `ReplayClient` and the segment HTTP (W39.R2)

Unchanged: no source change. The `.s2r` format, the segment HTTP and `GET /replays` are untouched.

### Evidence

Source inspection and unit tests of the removed module only. No browser, game, dev server or match server was run,
and no typecheck.
- PAR-48's `main.ts` and `hud.ts` read at `agent/parity-2` 71892ee60 (`git show`, read-only; nothing merged or picked).
- The free camera's title (part 3) re-read at the decompilation after the fresh review of `3c8ced421` found the
  first version wrong; this version is not yet re-reviewed.
- The removed module's own test passed (20) at `ec8c11ebe`; it is gone with the module and holds nothing now.
- After this section was written, each run alone after its own memory read: `tools/test/docs.test.ts` 16,
  `conventions.test.ts` 105, `placeholderLedger.test.ts` 13 passed.

### 11.1 Placeholders

None: this section adds no `*_PLACEHOLDER` and no `*_READING`, in code or in the note.

## 12. The "no account service" line on a narrow window (RV-10, LATER 27)

Written 2026-10-11T21:21Z for RV-10 of web sprint 39 (the plan's RV-10 row, and its Log entry of 21:03Z recording the
online seat's consent and its five conditions). Not a replay task: the sprint carries LATER 27 because its cap wants a
browser window, as the replay's specs do. No parity finding: the line is the page's own
(`ACCOUNT_SERVICE_ABSENT_ADAPTATION`, research 157 §5), the console has nothing like it, and nothing here changes a
game value, a request, or when the line shows. The levels: the cap and the geometry below are **read from the page's
code, not seen rendered**; the browser spec of part 4 is written and not yet run. (Since seen rendered: `accountNotice.spec.ts` on `8e293bc47`, 2026-10-12 between 10:39Z and 10:48Z, before the Log's 2026-10-12T10:52Z entry (`E2E_PORT=5304`, `S2U_DEV_PROXY_PORT` unset), **1 passed**
(11.5 s): a rendered browser run, headless Chromium, the merge controller's slot (the plan's Log, 2026-10-12T10:52Z) --
the line drawn at 375 x 812 inside its 8 px gutters; part 6.)

### 1. The change: two style lines and the cap's name

In `packages/viewer/src/connectHost.ts` `accountServiceAbsentLine`, `show`'s creation block, after
`el.style.right = '8px'` (:138):
- `el.style.maxWidth = ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION` (:139), the constant `'calc(100vw - 16px)'` (:107),
  labelled a browser adaptation in its comment;
- `el.style.overflowWrap = 'anywhere'` (:140): with a cap, a base with no break opportunity (a long host and port, one
  URL token) would otherwise overflow the box's right edge, past the window's.

Unchanged, as the consent's condition 1 asks: the words, the id, the class, the role, `data-adaptation`, the place
(top 8 px, right 8 px), the layer, the pointer, when the line shows and clears, and every request. The test
(`packages/viewer/test/connectHostAbsent.test.ts`, "RV-10") holds the two values (on the style object and in the
written `style` attribute), the rest of the block, the text, and one element after a second `show`.

**A deviation from condition 1's letter, accepted.** The constant's declaration sits at module scope beside
`ACCOUNT_SERVICE_ABSENT_LINE_ID`, outside the creation block: the brief offered "a named `*_ADAPTATION` constant in
`connectHost.ts`", and condition 2 asks for the cap to be a labelled adaptation, which is how the file labels its
others. **The online seat accepted the module-scope constant on 2026-10-11** (relayed by the merge controller with
RV-10's review): it stays, not inlined. The same day the seat took the short-window case (part 3) for its next
`connectHost` change.

### 2. Why this cap, and the badge's width

- **The badge exports no width, and has none.** `playtestSession.ts` builds it at :256-259 with `left:8px;top:8px`,
  padding and an 11 px monospace font, and no `width` or `max-width`: it is as wide as its text (branch, creation time,
  commit, and the marked and other-server words), so there is no width to import from its owner. The brief's first
  option (`calc(100vw - <badge's right edge> - <gutter>)`) cannot be written without an export added to
  `playtestSession.ts`, which is another grant (condition 2) -- and it would not help, below.
- **The badge never shares the login screen.** It is mounted by `mountPlaytestSession`, called only from
  `playtestReport.ts` :301-309, which `main.ts` imports at :2227-2230; `main.ts` loads only at `/testroom`
  (`pageEntry.ts` `bootPage`, :206-225: the base path mounts the front end alone), and `e2e/menuflow.spec.ts`
  (`frontEndAlone`) already asserts that the base path's body holds only `canvas#front-end` and never requests
  `main.ts`. The original front end's login screen builds the line (`pageAccountService` over the front end's
  document), and so LATER 27's "it may run under the playtest badge" does not arise there, and research 157 §5's "the
  playtest badge ... hold the top left" is true of `/testroom`, not of that screen.
- **The modern UI's sign-in builds the line too** (`modern/session.ts` :375-378, `pageSession` ->
  `pageAccountService`, the page's document by default; found by RV-10's review). Its two callers differ. The
  launcher's setup page (`modern/index.ts` :241, mounted by `modern/launcher.ts` :402) is the base path's, before
  START: no `main.ts`, so no badge -- the badge conclusion holds there. OV-2's in-game overlay
  (`modern/overlay/index.ts` :329, mounted by `main.ts` :2231-2233 under `?devmode&overlay` on a development build)
  runs **on `/testroom`**: with `&playtest=` as well, its sign-in meeting a 404 at the origin can put the line at the
  top right while the badge holds the top left, so there the two can share a narrow window (the badge drawn above,
  z-index 10001 against 1001) -- a developer's combination only, not checked here. Part 3's frame-title geometry and
  part 4's spec cover the original front end's login screen only.
- **No width cap could keep a top-right line clear of the badge at 375 px anyway**: the badge's text is about 55
  monospace characters at 11 px, some 360 px with its padding -- the whole window. Only a vertical offset could, and
  that is outside condition 1.
- **What the cap does answer.** The line is `position: fixed` with `right: 8px` and `left: auto`, so its width is
  shrink-to-fit up to the window less 8 px: on a window narrower than its one-line width (about 880 px: some 105
  characters of the design system's body type, Oswald 19/26, with `.s2u-notice`'s 18 px side padding; not measured)
  it wraps, and its left edge lands at x = 0, flush with the window. The design system's `box-sizing: border-box`
  (`shared/ds/base.css` :91) makes `max-width` the whole box, so `calc(100vw - 16px)` keeps the right gutter's 8 px on
  the left too. The page already uses the same gutter for its phone tip (`src/styles.css` :400,
  `width: min(460px, calc(100vw - 16px))`). On a window wide enough for one line nothing changes.

### 3. The geometry, read (not measured)

The front end's canvas is 640 x 448, fixed over the window at 100vw x 100vh with `object-fit: contain`
(`frontEnd.ts` :635-643), so the frame is scaled by `s = min(W / 640, H / 448)` and centred. The dialog's title is at
frame y 65 (`dlgNetConnect`, `dlgNetPlayerName`; research 157 §5). The line's height is 28 px of padding and 26 px a
line of text.

| window | s | the frame's top | the title on the window | the line (estimate) |
|---|---|---|---|---|
| 375 x 812 (a phone, upright) | 0.586 | y 274.8 | y 312.9 | 359 px wide from x 8; 3-4 lines, bottom ~114-140: far above the title |
| 1280 x 720 | 1.607 | y 0 | y 104.5 | one line, ~880 px wide from the right; bottom ~62: above it, the cap not reached |
| 640 x 448 (the specs' usual size) | 1 | y 0 | y 65 | two lines with or without the cap (632 px available, the cap 624 px); bottom ~88: over the title |
| 812 x 375 (a phone, sideways) | 0.837 | y 0 | y 54.4, from x 163 | two lines with or without the cap; bottom ~88: over the title |

So at 375 x 812 the title is not reached, cap or no cap. **Left, and not answerable by a width cap:** a short window --
a phone held sideways, a window shorter than about 400 px at 375 wide, the specs' own 640 x 448 -- brings the line's
second line onto the dialog's title, because the frame then starts at or near the window's top. A cap only makes the
line taller. What would answer it is a place or a size (a smaller type, or the line put elsewhere when the window is
short), outside this task's consent. **The online seat took it on 2026-10-11 for its next `connectHost` change**; it
stays open in LATER 27 (re-scoped, not struck), and the spec of part 4 does not test it.

### 4. The browser spec (written by reading, not run)

`packages/viewer/e2e/accountNotice.spec.ts`, one test at 375 x 812 (`test.use({ viewport })` and the `page` fixture:
no context of its own). Its command, in its header, from `socomlegacy/` with `S2U_DEV_PROXY_PORT` unset (the dev proxy
would forward `/account` to a match server, `devProxy.ts`; the spec skips when it is set, and without the extracted
maps):

    E2E_PORT=5303 npx playwright test packages/viewer/e2e/accountNotice.spec.ts --workers=1 --reporter=line

How the line comes up: `/?devmode&menuflow=dlgNetPlayerName.rdr` -- no `server=`, so the account base is the page's
own origin, the run's Vite server -- then the persona half of `frontEndWalk.ts` `toOnlineMenu`, its helpers imported:
a new name, a password, CONNECT, OK to #606, TRIANGLE at the card slot, NO to the save. CONNECT's
`POST /account/login` meets Vite's bare 404 (research 157 §5; Vite 7.3.6's HTML fallback serves GET and HEAD only,
`htmlFallbackMiddleware`, and the viewer's `projectRoutes` rewrites only its five project pages), the original's Login
Failure shows on `dlgNetConnect`, and the line beside it. What the spec asserts:
- the login's answer is 404; `dlgNetConnect` shows a popup; the line is visible with `ACCOUNT_SERVICE_ABSENT_ADAPTATION`'s words;
- computed: `max-width` 359px, `overflow-wrap` anywhere;
- the line's box: its top at 8 px, its left at least 8 px, its right at most 367 px, its bottom inside the window;
- its bottom above the title: frame y 65 mapped through the canvas's box and `object-fit: contain` (the canvas's 640 x
  448 and its `object-fit` asserted first, so the mapping is the page's own, not assumed);
- the playtest badge: its count and box recorded; expected absent (part 2), and if one is ever there, the line's box
  must not intersect it;
- no page error.

Every box is an annotation, and the window's picture is saved in the test's output directory (`test-results/`,
git-ignored).

**What the run must show, and what it decides.** Green, with the annotations giving the line's box (expected about
x 8, y 8, 359 px wide, 3-4 lines high) and the frame's top near y 275: the cap stands, and this part is re-filed as
seen. If the line's box is not where part 3 reads it, or the picture shows it crowding the window in a way the boxes
do not catch, the cap is changed from what is seen. **Browser-only assumptions** the run checks: that the deep link's
CONNECT walks the same three popups as `toOnlineMenu`'s after LOGIN; that the POST gets the bare 404; that the walk's
keys reach the canvas at 375 px wide; and the font's real metrics (the estimates assume Oswald loaded; another face
changes the line count, not the assertions).

### 5. RV-10b: the login is never sent on this path (2026-10-11T22:32Z)

The spec's first run (the merge controller's window, 2026-10-11, about 22:17Z) timed out at `accountNotice.spec.ts`:75:
`page.waitForResponse(POST /account/login, 90 s)`, armed before CONNECT's Enter, saw no such response while the walk's
later steps (#606, the card slot, NO to the save) ran. Re-read at the source (no browser), **no login request is made
on this path at all, so the line cannot come up there**; part 4's premise ("CONNECT's `POST /account/login` meets
Vite's bare 404") is wrong. The chain:
- The deep link to the persona form reads the universe list first (`personaHost.ts` `readsUniverseFirst`; the browser
  adaptation of the DNAS screen's `GetServerList`): `frontEnd.ts` :720-722 posts `<base>/texts/universe`
  (`universeHost.ts` `fetchUniverseService`), the base being the page's own origin with no `server=`
  (`universeServiceBase`). Vite answers that POST with its bare 404 (its HTML fallback serves GET and HEAD only, and
  `vite.config.ts` `projectRoutes` rewrites only the five project pages), so the query throws and the reply is null.
- With no universe, `personaHost.ts` `entered` (:308-315) logs "no universe was read" and returns before
  `o.lobby?.connect?.(...)`, LobbyConnect's other half: the lobby client's session flag stays clear.
- CONNECT then switches to `dlgNetConnect`, whose `init_socom_online` runs `IF LobbyLogin`. The row
  (`connectCommands.ts` `LobbyLogin`, `FUN_0027dd20`) calls `LobbyClient.login`, which with the flag clear answers 0
  and queues nothing (`lobbyClient.ts` :436-441, `FUN_002fa5a0` D:L198285-198325), so `exit_connect_screen` runs at once
  and no request is sent (research 157 §3.4 already says it: "the persona form's deep link with no universe reply never
  connects"; its §4 table, "`LobbyLogin` answers 0").

**No change to the predicate, the place or the bound of the wait would help**: the request never exists. Where it would
be made, if the lobby were up: on `dlgNetConnect`'s first frames after NO (state 12's `SESSION_BEGIN_ADAPTATION`
answers at once, then state 7's `service.login`), so the wait would rightly be armed just before NO's Enter. And no
configuration of our own servers puts a universe answer and a bare login 404 at one origin: the match server mounts the
texts and the account service together, only under `DATA_DIR` (`packages/central/src/main.ts` :94-117), and MU-6's dev
proxy forwards `/texts` and `/account` to that one server (`devProxy.ts` `DEV_LOCAL_PROXY_PREFIXES`).

**What changed: nothing.** The spec is left as it is, by the brief's rule (stop if the line never comes up on this
path), and LATER 27's 375 x 812 look stays owed. The ways open, each the merge controller's choice:
- (a) the spec answers `POST **/texts/universe` itself (`page.route`) with a one-universe reply in
  `universeReplyOf`'s shape naming the page's own host and port, so the deep link connects and CONNECT's login meets
  Vite's real 404 at the origin; a test arrangement, as RV-8a's route serves its segments, and the account service is
  still truly absent;
- (b) #100's own case, a link without `?devmode` (the universe from `server=`, the login at the page's own origin): it
  needs a real match server with `DATA_DIR` and the page's origin in `ALLOWED_ORIGINS`, and the visitor's disc (without
  `?devmode` the page reads no served tree), as `replayViewer.spec.ts`'s launcher does;
- or the look is taken by hand at 375 x 812.
Until one is chosen, **no run is owed** by this part.

### 6. RV-10c: option (a), the universe answered by the spec (2026-10-12T01:43Z)

The merge controller chose (a) (the plan's Log, RV-10b; the reviewer judged it a legitimate arrangement). Written by
reading; no browser was run, so the spec's next run is owed (the merge controller's window, `E2E_PORT=5304`,
`S2U_DEV_PROXY_PORT` unset; the command is in the spec's header). *Run since (the sprint 39 close's record):* `accountNotice.spec.ts` on `8e293bc47`, 2026-10-12 between 10:39Z and 10:48Z, before the Log's 2026-10-12T10:52Z entry (`E2E_PORT=5304`, `S2U_DEV_PROXY_PORT` unset), **1 passed**
(11.5 s): a rendered browser run, headless Chromium, the merge controller's slot (the plan's Log, 2026-10-12T10:52Z):
the login's POST seen answered 404 and the line shown inside its gutters. `accountNotice.spec.ts` only:
- **The test's arrangement.** Before `goto`, `page.route('**/texts/universe')` answers the page's POST (any other method
  falls through) with `UNIVERSE_REPLY`, 200 and `application/json`: the reply the match server's texts endpoint gives
  the page's query from an empty data directory -- `textsHandler` (`packages/central/src/serverTexts.ts` :378-381, its
  `answer` :362-366) over `universeInformation` (:275-298) and `SERVER_TEXTS_PLACEHOLDER` (:103-118): one entry of
  status 0, the placeholder's name and description, DNS '' and port 0 (the server's "connect back to the server that
  answered", :76-80: here the page's own origin), universe status 1, users 0, 256 max users, `endOfList` true; the
  placeholder news in one chunk. The spec asserts that it passes the page's own parser (`universeHost.ts`
  `universeReplyOf` :62-66) and records how many times the route answered (at least once). Checked once by script
  outside the tree (tsx): the literal passes `universeReplyOf` and equals, field for field, the reply built from the
  server module's own `SERVER_TEXTS_PLACEHOLDER`, `MEDIUS_TEXT_STATUS` and `chunkText`. **That answer is the test's, not
  the page's**: on the product's path it comes from a match server, here from the spec.
- **What stays the page's own.** Nothing else is routed: the login's `POST /account/login` reaches the Vite server, whose
  bare 404 (part 4) is the page's to meet, and the Login Failure and the "no account service" line that follow are the
  page's own -- the account service is truly absent at that origin. `entered` needs of the reply one entry of status 0
  (`UniverseList.entry`, `FUN_002fdaf0`, keeps no other) and its DNS and port, which it hands to `enterForm` and
  `lobby.connect` whatever the universe status; the account requests go to the page's origin whatever that address is
  (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`).
- **The login's wait, moved to where the POST happens.** Traced at the source: `entered` runs in the session's
  constructor (`frontEnd.ts` :464), the reply already in the list (:367), so `lobby.connect` queues state 12 at the
  boot; the first frames' steps (`ConnectCommands.frame` -> `LobbyClient.step`, `FUN_002dfe50`) enter it and
  `SESSION_BEGIN_ADAPTATION` answers it with no request, long before CONNECT. CONNECT's Enter runs
  `register_new_account` (research 153 §6): #606, `memcard_operations` (the card slot, #831), then
  `SWITCHMENU(dlgNetConnect.rdr)` -- no request on the way. Only the built `dlgNetConnect`'s `init_socom_online` runs
  `IF LobbyLogin` (research 157 §4), which queues state 7 (`LobbyClient.login`, `FUN_002fa5a0`); the next frame's step
  enters it and its handler posts `/account/login` (`FUN_002eede0`). So the POST follows NO's Enter, on
  `dlgNetConnect`'s first frames -- as research 157 §9's browser run saw its first request after #831's NO. The wait is
  now armed just before NO's Enter, bounded by `LOGIN_POST_BOUND_MS` (90 s, the connecting screen's own watchdog,
  `monitor_timeout`'s `WAIT 90`: past it the screen leaves with #547). A test's bound, not a game value.
- Every other assertion is kept as part 4 lists it.

**Browser-only assumptions** the run checks, beyond part 4's: that Playwright's route takes the page's same-origin POST
before Vite does; that with the universe read the deep link's form lists and walks as `toOnlineMenu`'s does after
SELECT UNIVERSE (the persona form's MP_SUCCESS from state 12 posted at the boot, as on research 157 §9's run with a
real server); and that the login's 404 arrives inside 90 s of NO.

### `ReplayClient` and the segment HTTP (W39.R2)

Unchanged: no replay source is touched.

### Evidence

Source inspection and a unit test (jsdom). No browser, dev server, match server or game was run, and no typecheck.
- RED on the base: `connectHostAbsent.test.ts` 1 failed, 16 passed (`ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION`
  undefined); GREEN after the change: 17 passed.
- Unchanged and green, each run alone: `connectHost.test.ts` 16 passed; `frontEnd.test.ts` 35 passed and 2 skipped (no
  dev disc in that shell); `chrome_classes.test.ts` 52; `flyAccess.test.ts` 16; `e2ePorts.test.ts` 2.
  `e2eContextsClosed.test.ts`: 72 passed and 2 failed, on `replayViewer.spec.ts` and `replayEngine.spec.ts` (contexts
  opened outside `OpenedContexts`), files this task does not touch; the new spec opens no context of its own.
- RV-10c (part 6), source inspection only for the spec (no browser, no typecheck): `e2eContextsClosed.test.ts` 78
  passed before and after the change; `tools/test/docs.test.ts` 16 passed. The universe literal checked once by a
  script outside the tree (above). No unit test can hold a Playwright route: the spec's own run is the evidence owed.
- Run since (the sprint 39 close's record): `accountNotice.spec.ts` on `8e293bc47`, 2026-10-12 between 10:39Z and 10:48Z, before the Log's 2026-10-12T10:52Z entry (`E2E_PORT=5304`, `S2U_DEV_PROXY_PORT` unset), **1 passed**
  (11.5 s): a rendered browser run, headless Chromium, the merge controller's slot (the plan's Log, 2026-10-12T10:52Z). Its earlier run 9 (2026-10-11
  22:15-22:17Z, `e372b05ca`) was red at the login wait (part 5).

### 12.1 Placeholders

None. `ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION` is a browser adaptation's chosen value, not an unknown of the
original; part 4's run confirms or changes it. Its run of 2026-10-12 (`8e293bc47`, before the Log's 2026-10-12T10:52Z entry, 1 passed; part 6) drew the
line within the cap and inside its 8 px gutters at 375 x 812, so the value stands.

## 13. The console's Watch opens the replay viewer (RV-12; the console plan's CX-15)

Written 2026-10-12T09:46Z for RV-12 of web sprint 39 (the plan's RV-12 row and its Log; the console plan
`docs/plans/2026-10-11-console-launcher.md`, row CX-15 and its rulings CX.R2, CX.R5, CX.R6, CX.R7, CX.R8). No parity
finding: the console launcher and the replay viewer are browser adaptations (OT.R28, `REPLAY_ADAPTATION`), and nothing
here changes a game value or the launched game's flow. The levels: the behaviour below is unit-tested in jsdom; what it
looks like and how it runs in a browser is **not seen** (the browser spec is re-pointed by reading, not run). *Since
seen* (the sprint 39 close's record): `replayViewer.spec.ts` through the console, 2026-10-12 10:48Z-10:49Z on `9c4aaa385`, **6
passed**, a rendered browser run (headless Chromium, the merge controller's slot); part 5 says what it holds and what
it does not.

### 1. The gap

Since CX-9b (main 26f3190f8) the page at `/` is the console launcher. Its Replays category listed the signed-in
account's matches (`src/console/adapters/replays.ts`, `render/replays.ts`, `state.ts` `replayRows`), but Cross on a row
with the disc ready only said "Watching from this launcher is not built yet" (`src/console/grammar.ts`). This sprint's
viewer -- `src/modern/replays/view.ts` `mountReplays`' viewer (RV-2's note, RV-3's pad and Back, MU-11's world frame,
MU.R15) -- was reachable only through the in-game development overlay (`?devmode&overlay`), and
`e2e/replayViewer.spec.ts` drove the launcher tiles CX-9b deleted.

### 2. The viewer, reusable (`src/modern/replays/view.ts`)

The viewer half of `mountReplays` is `mountReplayViewer(host, entry, opts)` (opts: the stage, the stage's context, the
frame scheduler, the date's words, the lock's "being read" reading, and `onClose`), answering `{ entry, root(), draw(),
lock(), locked(), close(), dispose() }`. It holds what the section's `Open` record held: the stage's handle, the
transport, the refusal, the failure, the lock, the drawn element and what it was drawn for, RV-3's one hand-over of the
focus to the seek bar, the roster, the cameras and the loop. Back's button and Escape on the viewer call `onClose`;
`close()` does the same; `dispose()` closes the stage and takes the element away without it. `mountReplays` opens it
in its body and keeps what is the section's: the list, Circle as its link of the page's back chain (`padLayers`, rank
0), the focus back on the card, and the disc's lock and a sign-out followed through `launcherState` and the session. Its
DOM and behaviour are unchanged: `test/modern/replays/view.test.ts` (27 tests) is green unmodified. One difference of
order, with no effect seen: the old open drew the section's mode before the viewer, the factored one draws the viewer
first and then the section (both inside the same task, before the stage's promise settles).

### 3. The console's Watch (CX-15)

- **The adapter** (`src/console/adapters/replays.ts`) keeps each listed row's whole `ReplayEntry` by id and gains
  `watch(id, onClose)` and `watching()`. `watch` lays a layer (`[data-cx-viewer]`, `data-modern`, the section's
  `.mur[data-replays]` root and its `.mur__body`) into the console's frame (`.cx-app`) over the stage's grid area
  (`src/console/console.css`: absolutely positioned on grid row 2, so the header and the legend stay and the frame's
  placement is untouched) and mounts the viewer there with the row's entry and the session's ticket and name, the
  stage being the viewer's default (`worldStage`: the disc the page opened, `discPrompt` `openedDiscRequest`, which the
  console's disc adapter's reads keep). No navigation (CX.R2). The modern UI's tokens and control rules
  (`src/modern/tokens.css`, `modern.css`, scoped to `[data-modern]` and `.mu-*`) are imported by the adapter so the
  viewer is drawn as in the section; the console's own rules are unchanged.
- **The pad** (`ReplayWatch.press`): while the viewer is open (`ConsoleState.overlay` `viewer`) the console's grammar
  hands the D-pad and Cross to it and keeps Circle as Close. The D-pad walks the viewer's native controls in their DOM
  order -- Back, the cameras, the seek bar, the transport's buttons, the speed -- up and left back, down and right on,
  wrapping, as the page walker (`startupNavigation.ts`) walks; on the seek bar left and right step it by its pad step
  (`data-pad-step`, the jump, as the walker steps a range) with the focus kept; Cross presses the focused control (the
  last one the pad stood on when the document's focus left the viewer, a legend click). OPTIONS, Square, Triangle and
  the shoulders are not read there, and the legend's START cluster is hidden while the viewer is open (START would hand
  the window over under a playing replay).
- **The legend** (`src/console/render/legend.ts`) names Cross by the focused control's own name (the viewer's words:
  "Pause", "To the start", "Back to Replays" ...), on the seek bar the D-pad's jump in the transport's words ("10
  seconds", `MU_REPLAY_JUMP_SECONDS_ADAPTATION`), and Circle "Close" (the console's word for closing what is on top). It
  follows the viewer's focus and the focused control's name (a `focusin` and an `aria-label` observer re-draw it).
- **Close**: Circle, the viewer's Back or Escape take the viewer away (its stage closed) and return to the replays list
  with the row it was opened from focused (`ConsoleState.rp.watching`; in pad mode the document's focus on it).
- **As the section follows the page**: the disc taken out locks the viewer (its stage closed, the lock's words); put
  back, the list again; a sign-out closes it.
- **The keyboard (CX.R6, OT.R29)**: in a release build no key reaches the viewer (the layer stops every keydown in its
  capture phase and, since the delta reviews' fixes, prevents the default of the keys that would press a control or
  move the range, never a browser shortcut: see the fix rounds below); in a development build the viewer's own keys
  work (the transport's, Escape for Back) and a key it took is stopped at the layer so the console's keymap does not
  act on it too.
- **Without the disc** the existing message stands, word for word ("Watching a replay needs your disc: Home, then
  Disc."), and the legend's "Needs disc".
- **CX.R5**: the viewer's words are its own; the console adds none but its existing "Watch" and "Close". **CX.R7**: no
  `cx-*` class is added or restyled (the layer is an attribute selector in `console.css`'s base layer); no name of the
  design export is added to the code.

### 4. The e2e re-pointed (`e2e/replayViewer.spec.ts`)

`launcherAs` now drives the console at `/`: the page drawn (`console.spec.ts`'s crossbar wait; the disc input is wired
before the first draw), the disc through the console's own picker input (`#disc-page-file`) and the legend's chip
ready, the Replays category by a click, its Sign in, the console's sign-in dialog (a fresh context's card holds no
persona: Another, its name field and password filled, the keyboard's Done) and the USER AGREEMENT's Accept. Case 2
reads the rows: A and B one row (map, rules, the drawer's players), A's Cross "Watch", B's "Needs disc"; C "No replays
yet". Case 3 watches by a click on the row and asserts the address unchanged. Case 6's pad goes through the console's
pad, its legend names the bar's jump and Close, and Circle returns the focus to the row. Each assertion replaced or
dropped is listed in the spec's header; the one dropped at 12b66c2fb, the card's result line (`[data-field="result"]`
and its `data-end`), is restored against the drawer by the fix rounds below. The RV1 constants, the accounts, the
recording and the `OpenedContexts` guard are kept.

### 5. What a browser must still show

*Run since (the sprint 39 close's record; the plan's Log, 2026-10-12T10:52Z):* `replayViewer.spec.ts`, rendered
browser runs (headless Chromium, `--workers=1`, the merge controller's slot, the image by the spec's default (`discImage`, the fixture-packed image; `RV1_OWNER_ISO` unset in the command); before the Log's 2026-10-12T10:52Z entry): begun 10:39Z on
`8e293bc47`, 3 passed, case 4 failed at its bar read, 2 not run (RV-12b, below); **10:48Z-10:49Z on `9c4aaa385`, 6 passed**
(1.1 m). Its cases asserted the first, second and fourth items below (the chip ready and Watch's world built from that
image; the sign-in through the console's dialog and the USER AGREEMENT; the bar focused and the pad's steps, Circle
closing to the row) and, of the third, the controls' names, keys, 44 px targets and the bar's focus ring. The layer's
place over the stage and its look as a whole are not asserted by any case, and the owner's eye (the fifth) is not
taken. RV-7c-2's laid smoke (§6) is still not seen: no case of this spec or `replayEngine.spec.ts` seeks into a pouring
smoke. The text that follows is RV-12's, kept.

The spec's run (its command in the spec's header) is owed, and with it:
- that `#disc-page-file`'s `setInputFiles` on the console reads the fixture-packed image and the chip turns ready, and
  that the framed test room takes that image (`openedDiscRequest` set by the console's reader);
- that Playwright's `fill` reaches the console's visually hidden name and password fields, and the keyboard's Done and
  Accept sign in through the dev proxy;
- the layer's place and look: over the stage only, the header and the legend visible, the viewer's controls 44 px and
  its focus rings as in the section (the modern tokens under `[data-modern]` inside the console's scaled root);
- that the focus reaches the seek bar on Watch (the row's click leaves the focus outside the viewer's host; the viewer
  takes it at mount), and that the stubbed pad drives the console's poll in the viewer (D-pad steps, Circle);
- the owner's eye on the viewer over the console page (the plan's Log names it beside RV-12).

### `ReplayClient` and the segment HTTP (W39.R2)

Unchanged: no replay source is touched. `view.ts`'s change is a factoring of the page; the transport, the stages and
the client are as they were.

### Evidence

Unit tests (jsdom) and source inspection. No browser, dev server, match server or game was run, and no typecheck (the
controller's).
- RED on the base: `test/modern/replays/viewer.test.ts` 8 failed (`mountReplayViewer` not a function);
  `test/console/watch.test.ts` 7 failed, 1 passed (the no-disc case, which pins the existing message).
- GREEN after the change: `viewer.test.ts` 8 passed; `watch.test.ts` 8 passed; unmodified and green:
  `test/modern/replays/view.test.ts` 27, `test/modern/signedOutEmpty.test.ts` 5, `test/console/grammar.test.ts` 28,
  `legend.test.ts` 9, `adapters/replays.test.ts` 6, `adapters/index.test.ts` 3, `scroll.test.ts` 7, `copy.test.ts` 10,
  `input.test.ts` 11, `launch.test.ts` 21.

### The review's fix round (2026-10-12T10:04Z)

A fresh review of 12b66c2fb returned PASS WITH FINDINGS (high); its three findings are fixed:
1. *Key hints where no key acts* (medium; OT.R29, CX.R6). `mountReplayViewer` and `mountTransport` take `keys`
   (absent: true, the Replays section's as before). False -- the console passes its own gate, `import.meta.env.DEV`
   unless a test says otherwise -- and the viewer listens to no key (no Escape for Back, no transport key) and names
   none: no key cap in the hint row, no `aria-keyshortcuts`, no `data-hint-keys`, no key in a tooltip (Back's title
   "Back to Replays (Circle)", a control's its name alone). The pad's prompts stay; on the seek bar the hint row says
   the D-pad's jump in the words the keys' prompt gave it ("10 seconds"; the D-pad named again by the delta review's
   fix, below).
2. *Watch while START arms* (low). `watch()` does nothing unless START is idle, so the arming timer can no longer lay
   the launch screen over a viewer.
3. *RV-4's result on the release path* (low). The console's row carries the record's result when it holds one
   (`ReplayRow.result`, `end`: additive), in `resultWords`' words, and the drawer's facts add it under the term
   "Result" -- the Replays card's own name for the field (`data-field="result"`, with its `data-end`). A record without
   one draws nothing. The adapter's stale header ("no result") is corrected, and the e2e's case 2 asserts the result
   line and its cut-short end on A's drawer again (the spec's header updated).

Evidence (unit tests, jsdom; no browser, no typecheck): RED -- `viewer.test.ts` 1 failed, 9 passed (keys false still
named the keys); `watch.test.ts` 2 failed, 8 passed (the release build's key names; Watch while arming mounted the
viewer); `adapters/replays.test.ts` 1 failed, 6 passed (no result in the drawer). GREEN -- `viewer.test.ts` 10,
`watch.test.ts` 10, `adapters/replays.test.ts` 7, and unmodified: `view.test.ts` 27, `transport.test.ts` 29,
`grammar.test.ts` 28, `legend.test.ts` 9, `scroll.test.ts` 7.

### The delta review's fix round (2026-10-12T10:10Z)

The delta review of 8037cbb0b returned PASS WITH FINDINGS (high), three lows, fixed:
1. *"No key acts" overstated.* The layer's release-build stop only stopped propagation, so the browser's own defaults
   still ran on a focused control: Space or Enter clicked a transport button, the arrows moved the seek bar's range
   (its `input` seeks). Now, in a release build, the layer's capture listeners on keydown and keyup also prevent the
   default of the keys that press a control or move the range (a button's Space clicks at its keyup) -- since the
   second delta review only those, below; Tab keeps the browser's focus order, a page's accessibility, not a launcher
   key. The pad is unaffected: it is the console's poll, not a key event. The wording
   above and the transport's `keys` comment no longer claim more: the bar listens to no key; the console's layer
   prevents the defaults.
2. *The e2e's result for A only.* Case 2 asserts the drawer's result line and its cut-short end in `listed`, for A and
   for B, as the card's assertions did; the spec's header says so.
3. *The release seek-bar hint lost the D-pad.* With no key it reads the jump's words and "D-pad" (the keys' row,
   "10 seconds" and "Keys or D-pad", without its keys), the D-pad named in text as the keys' row names it (no glyph is
   drawn for `data-pad="dpad"`).

Evidence (unit tests, jsdom; no browser, no typecheck): RED -- `watch.test.ts` 1 failed, 11 passed (the release
build's Space on the focused toggle not prevented); `viewer.test.ts` 1 failed, 9 passed (the D-pad unnamed). GREEN --
`watch.test.ts` 12, `viewer.test.ts` 10, and unmodified: `transport.test.ts`, `view.test.ts`.
Browser-only: that Chrome's Space activation of a button honours the keyup's prevented default (the keydown's too is
prevented), and that the range's arrows are its keydown's default.

### The second delta review's fix round (2026-10-12T10:17Z)

The delta review of c48ea1134 returned PASS WITH FINDINGS (high), two lows, fixed with the controller's typecheck fix
(`root` cast after `draw()` in `mountReplayViewer`, fde02328a: TS had narrowed it to null; no behaviour change):
1. *The release build swallowed the browser's shortcuts* while a viewer control had the focus (F5, Ctrl+R, Ctrl+F, the
   Ctrl zoom keys, Alt+Left). The layer now prevents only the keys whose default presses a control or moves the range
   -- Space, Enter, the four arrows, Home, End, Page Up, Page Down (`RELEASE_PREVENTED`) -- and never with Ctrl, Meta or
   Alt held, `../input`'s keymap's own rule; it still stops every key's propagation.
2. *The keyup listener was untested*: the release case now sends Space's keyup on the focused toggle and finds it
   prevented; F5, Ctrl+R, Ctrl+F, Ctrl+=, Alt+Left, Meta+Space, a plain letter and Tab are not.

The reviewer's observation, recorded: in a release build Tab can reach a legend prompt button (`#legend`, outside the
viewer's layer), and Space or Enter there runs its `press()` (Close, for one). That is the console's behaviour before
RV-12 for every legend prompt, not this task's.

Evidence (unit tests, jsdom; no browser, no typecheck): RED -- `watch.test.ts` 1 failed, 11 passed (F5 prevented);
GREEN -- `watch.test.ts` 12, `viewer.test.ts` 10, `view.test.ts` 27.

RV-12b (2026-10-12T10:45Z; browser run of 8e293bc47 at 10:41Z, case 4 failed at its bar read, "Expected > 752,
Received 752", the failure snapshot's slider at 764 and playing): the spec's race, not the transport's --
`transport.ts` `render` clears the note once `client.serverTick() > rebuiltAt` (:460-461) and in the same render sets
the bar to `Math.floor(tick)` (:481), the clock's tick being fractional (`replayClient.ts` `serverTick`, :509), so the
note hides at 752.x while the bar reads 752 until the next whole tick; case 4's read is now a poll bounded by
`RV1_PLAY_PAST_MS_PLACEHOLDER` (no other bar read in the spec follows an action that moves it unpolled).

### The sprint 39 close, fix round 1 (2026-10-12)

A fresh close review of the whole sprint returned PASS WITH FINDINGS (high). This round fixes its items; the levels are
unit tests (jsdom) and source inspection, no browser, no typecheck (the controller's). Reviewed (PASS WITH FINDINGS,
high; the plan's Log, 2026-10-12T11:30Z).

1. **The console's replays list pages past the cap (RV-4 on the release path; medium).** Since CX-9b the console is
   the release path, and its adapter read `source.list` only, so an account with more than the route's cap
   (`REPLAYS_LIST_MAX_PLACEHOLDER` = 100, `packages/central/src/replay/http.ts` :115) saw only the newest 100 at `/`. Now
   `src/console/adapters/replays.ts` keeps the answer's cursor (`modern/replays/data.ts` `nextCursor`) and, while one
   stands, the view's `more` (`state.ts` `ReplaysMore`: idle, loading, failed). The down press on the list's last row
   (`grammar.ts`, the replays screen) asks `Adapters.replays.more()`. That is the source's `more` -- a source without
   one asks the route at the account requests' base, as the Replays section's `ownRoute` does (`view.ts` `loadMore`) --
   once at a time. The page is appended and deduped by id in the server's order, and the focus stays on its row. A
   failed page keeps the rows read. The next down press on the last row is its retry; Refresh, or a sign-in change,
   starts again from the first page and drops a page still being read. The list's end (`render/replays.ts`
   `moreHtml`, not a row: the focus never stands on it) uses existing words only (CX.R5):
   - idle: the section's More label, "More matches" (`view.ts` `moreView`);
   - loading: its loading label, "Loading more" (the same);
   - failed: the failure's title and line in the section's words (`adapters/replays.ts` `FAILURE_WORDS`, the section's
     own), with the console's failed item's verb, "Try again" (`state.ts` `replaysItems`).
   **No room filter in the console:** the console's design has no filter control on the replays screen, so the room
   filter (RV-4, W39.R4) is the modern section's only. **No shoulder page jumps:** only the list's own next page is
   asked, on the down press; long-list paging by L2/R2 is the console plan's row CX-12, not yet built (the merge
   controller's note to this round). Tests: `test/console/replaysPaging.test.ts` (new, 5 tests): 101 entries over two
   pages all reached; the focus kept; the dedupe; the loading words and one ask at a time; a failed page kept, said and
   retried; no `more` without a cursor; a refresh drops a late page. `test/console/adapters/replays.test.ts` gains one
   case: the route's `?before=<cursor>` with the bearer, through `httpReplaySource`. RED: paging 4 of 5 failed (the
   no-cursor case passes on the base, as it should); the adapter case 1 of 8 failed with the source put back. GREEN:
   5 and 8.
2. **The browser runs recorded (low).** The runs after RV-12 (the plan's Log, 2026-10-12T10:52Z) and the reportClips
   run (2026-10-11T21:14Z) are written where this note said owed or not run: §4, §5, §8 (RV-8a, RV-8d), §9 (the browser
   runs and the withdrawn race), §10, §12 and part 5 above. The spec headers (`replayViewer`, `replayEngine`,
   `accountNotice`, and `reportClips` beside the brief's three) say the same. RV-7c-2's laid smoke stays owed: no case
   seeks into a pouring smoke.
3. **Reviewed readings filed (low).** `REPLAY_CORPSE_LANDING_READING` (§5.1), RV-7c-2 and `REPLAY_SMOKE_FLIGHT_READING`
   (§6), RV-5's reading and its scoreboard note (§7), and the FREE CAMERA title (§11.3) were each reviewed fresh before
   their merges. Each now says "reading" and names the review the plan's Log records. Research 244 §7.3's "a finding
   for the launcher work" now points at §9's withdrawal.
4. **A leftover test (low).** `test/devSeen.test.ts`'s regex pins on `Hud`'s private `sinceOn` and `posts` are
   deleted. The read goes through `Hud.postsForDev()` (`src/devSeen.ts` :125), which the posts case above it already
   exercises through `devSeen(...).hud.posts`.
5. **Nits.** `modern/replays/transport.ts` `SEEK_NOTE`'s comment is reworded to §6's re-read at RV-7c-2 (the words
   unchanged). `matchActions.ts`'s comments no longer call `clearSmokes` a no-op until PAR-45 or say the smokes pour on.
   `replay/replayClient.ts` `seekTo`'s outer `told` is renamed `seek`, so it no longer shadows `foldedJoin`'s `told`.

### The sprint 39 close, fix round 2 (2026-10-12)

The fresh review of round 1 (`d6cb2ff3a`, `0cb78b9cd`) returned PASS WITH FINDINGS (high). Its four findings are
fixed. Evidence: unit tests (jsdom) and source inspection; no browser, no typecheck. Reviewed (PASS WITH FINDINGS,
high; the plan's Log, 2026-10-12T11:30Z).

1. **The end line kept in view (medium).** Walking to the last of many rows kept that row's bottom on the box's
   bottom, and the down press there fetches without moving the focus. `render/frame.ts` scrolled again only when the
   focused element changed, so "More matches", "Loading more" and a failure's words were below the visible area. Now,
   when the focused element is a `.cx-room` whose next sibling is the end line (`[data-more]`), the frame keeps the
   end line in view, then the row (`keepInView`). The line's state is part of what `lastInView` remembers, so idle ->
   loading -> failed scrolls again. A re-render with the same focus and state still keeps the wheel's scroll.
   Test: `test/console/scroll.test.ts` (1 new case, the geometry stub placing the line where one more row would).
2. **Touch and mouse page too (medium; CX.R6).** Idle or failed, the end line is a
   `<button type="button" tabindex="-1" data-act="replays-more">` with no `data-fk`. A click goes to the grammar's
   `replaysMore`, the one path the down press on the last row takes too: it asks for the next page or retries a
   failed one, with the focus set on the last row. While the page is read, the line is a plain `div` with no act, so a
   click does nothing. The pad never stands on the button, because the pad walk is state-driven and only `.is-focused`
   takes the focus. A failed line announces its words with `aria-live="assertive"` (`role="alert"` would take the
   button's role). Tests: `test/console/replaysPaging.test.ts` (2 new cases): an idle click asks once and the 101st
   row comes in; a click while loading does nothing; a failed line's click retries.
3. **Run times (low).** The times written in round 1 ("~10:46Z", "~10:48Z", "10:49Z", "~10:41Z") were not the Log's.
   Each 2026-10-12 run now reads "before the Log's 2026-10-12T10:52Z entry", with only the start and end the merge
   controller gave from its command output (`date -u`):
   - the replayViewer re-run on `9c4aaa385`: 10:48Z-10:49Z;
   - replayEngine.spec and accountNotice.spec on `8e293bc47`: between 10:39Z and 10:48Z, before that re-run;
   - the first replayViewer run on `8e293bc47`: begun 10:39Z.

   This covers §5, §8, §9, §12, part 5 above and the spec headers. RV-12b's own paragraph (above, "at 10:41Z") is
   left as written.
4. **The image (low).** The 2026-10-12 runs' disc is now written as the image by the spec's default (`discImage`, the
   fixture-packed image; `RV1_OWNER_ISO` unset in the command), not asserted as seen.

### The sprint 39 close, pass 2 (2026-10-12T11:40Z)

The second close review (PASS WITH FINDINGS) found the list's count said as a total the server never gave (low;
CX.R5). With a next page (`more`), the Replays category's line and the list's foot now read "<n> loaded" -- the
Replays section's own word for the rows read (`view.ts` `filterView`: "Room · filters the loaded matches") -- and
"<n> saved" only once the last page is read (`state.ts` `replaysTally`). Test: `test/console/replaysPaging.test.ts`
(1 new case). RED: replaysPaging 1 failed, 7 passed; GREEN: 8 passed. Evidence: unit tests (jsdom); no browser, no
typecheck. Reviewed (close pass 3, PASS WITH FINDINGS, high; its one low answered by pass 3's round below; the plan's Log, 2026-10-12T11:57Z).

Pass 3 (2026-10-12T11:50Z): Home's Replays readout (`render/home.ts`) labels its figure "Loaded" while a next page
stands, else "Saved" (`state.ts` `replaysPaged`, `replaysTally`'s condition); the pass-2 case pins it. RED: 1 failed,
7 passed (`[ '100', 'Saved' ]`); GREEN: 8 passed. Reviewed (close pass 4, PASS for this commit, high; the plan's Log, 2026-10-12T11:57Z).

### 13.1 Placeholders

None. The layer's place, the walk's order and the legend's words are the console's and the viewer's own; nothing of the
original is unknown here.

## 14. The replay viewer redesign's additive members (RV2; W39.R2)

Written 2026-11-02T08:55Z for RV2-10 of the replay viewer redesign (the plan
`docs/plans/2026-11-02-replay-viewer-redesign.md`, rulings RV2.R1-RV2.R7; RV2.R6 asks this section, as W39.R2 does of any
change to the engine's surface). The lane is on the product track (OT.R53): **every member below is a browser
adaptation** (`REPLAY_ADAPTATION`; SOCOM II records no match and plays none back), labelled as one at its site, and none
changes a game value or behaviour -- no research finding, no placeholder, no ledger row. What it holds is named so a
reader of the engine can follow it. Read at `agent/rv2` `3d90af93d`; paths under `packages/viewer/`.

### 1. The engine (`src/replay/`)

- **`ReplayClientOptions.autoplay?: boolean`** (`replayClient.ts`; RV2-02, `8b20456a3`, merged `323daa95d`; RV2.R2).
  Absent or true: the recording plays from its open, as before -- the developers' mode, the embed and every earlier
  caller byte-equal. False: it opens paused and **held**.
- **`ReplayClient.held(): boolean`** and **`ReplayClient.release(): void`** (the same commit). Under the hold `advance()`
  plays nothing and `play()` / `toggle()` leave the clock paused, while a seek and a step still land (a `tick=` and the
  report's embed included). `release()` ends the hold and plays once; before the open it plays at the open; a second
  release, or one on a client never held, does nothing. `NetClientSurface` is unchanged (both members are the replay
  client's own, outside `NetClient`'s mapped shape).
- **`roundSpans(records, span): RoundSpan[]`** and **`roundsOf(records): number | null`** (`rounds.ts`, new;
  `RoundSpan = { round: number | null; start; end }`; RV2-01, `e982a1b8f`, merged `f10a68963`; RV2.R3). Pure readers of
  the `event` records the recording already holds -- the wire's `roundStart`, `roundOver`, `abandoned` -- giving one
  span per round from its `roundStart` to the next (or the `end` record, or `span.end` for a partial recording), the
  launch/lobby span before the first unnumbered, a respawn room's round already in play numbered by its first
  `roundOver`, an `abandoned` ending a span unnumbered; `roundsOf` the round count from the first `roundStart`. The
  `.s2r` format, its records and `homeTick` are unchanged.
- **`ReplayPageHooks.held?(): boolean`** (`mount.ts`; RV2-03, `c31ffe99f`, merged `f4c9c8eb2`; RV2.R2, RV2.R5). The
  developers' replay mode's page hands `held: () => loadingJoin.blocked` (`src/main.ts`, the RV2 claim's line); handed,
  the client opens held, the frame loop skips `advance` while it is true and releases the client on the first frame it is
  false. Absent: as before.

### 2. The viewer's world and stage (`src/modern/replays/`)

- **`ReplayWorldHost.ready?(): void`** (`worldHost.ts`; RV2-03). Optional: a host without it is still a host, one whose
  `ready` is not a function is none; `enterReplayWorld` is untouched. `src/main.ts` calls `REPLAY_WORLD?.ready?.()` in the
  loading hold's `released || failed` branch -- the test room's loading screen hiding -- and nowhere else.
- **`WorldClient.held(): boolean`** (`worldStage.ts`; RV2-02 forwarded it and exported `WorldClient` for its tests;
  RV2-03 made the stage's every client `autoplay: false`). The stage releases its client once a client is taken and
  the host's `ready()` has fired, in either order; a client taken on a room rebuild after the release is released at
  its take (paused again if the watcher had paused), one taken during the hold waits for `ready()` -- `take()` never
  resumes under the hold. The 120 s fallback (`MU_REPLAY_WORLD_TIMEOUT_MS_ADAPTATION`) now waits for the ready.
- **`cameraChoice.ts`** (new; RV2-06, `8578530e2` and `132111dce`, merged `7a5d28fa6` and `3d90af93d`; RV2.R1):
  `readCameraChoice()` (the kept mode, else `REPLAY_CAMERA_DEFAULT = 'follow'` -- nothing kept, a storage that throws,
  a value naming no mode) and `keepCameraChoice(mode)`, on the one key **`REPLAY_CAMERA_KEY = 's2u.replay.camera.v1'`**
  through the page's `pageSettings`, listed in `src/pageStore.ts` `PAGE_SETTING_KEYS`. The stage presses the choice
  through the existing `cameraPresses` on the frame's spectator view -- the original's own controls -- once the press can
  land, and again after each round's reset to free; the live spectator's start, `SPECTATOR_START_READING` (free / free,
  `spectatorView.ts`, `FUN_00295260`), is untouched.
- **The transport's exports** (`transport.ts`; RV2-05 `02cc91022`, merged `7c7811994`; RV2-07 `76bb255aa`, merged
  `c0497526c`): `HELD_STATUS` ("Loading the match's world", the lamp's and the status line's words), `spanAt`,
  `roundStepTarget`, `MU_REPLAY_ROUND_BACK_SECONDS_ADAPTATION` (1 s: within it of a span's start, Previous round goes
  to the previous span's start, else to the current span's), `Transport.layout(phone)` (RV2-08 `b9c775afc`, merged `db37d29f4`), and two keys in
  `TRANSPORT_KEYS`, **B** (`round-back`) and **N** (`round-forward`) -- development builds only, as every viewer key
  (`import.meta.env.DEV && keys`; CX.R6). `MU_REPLAY_JUMP_SECONDS_ADAPTATION` and `SEEK_NOTE` are unchanged; since the
  batch review's fold (F9) they and `HELD_STATUS` live in `modern/replays/transportStrings.ts`, which imports nothing
  (the e2e specs read them, and Playwright's loader cannot load `transport.ts`'s stylesheet), re-exported by
  `transport.ts`.

### 3. The data-* hook contract (RV2.R7)

The specs and the unit tests read the viewer by its `data-*` hooks; its class names (`cx-replay*`, in
`src/console/replay.css` and `src/console/replay-transport.css`) are not a contract. The hooks the redesign draws:
`view.ts` -- `data-viewer`, `data-status`, `data-world`, `data-camera`, `data-camera-toggle`, `data-roster`,
`data-roster-toggle`, `data-roster-count`, `data-team`, `data-field`, `data-locked`, `data-refusal`, `data-transport`,
`data-layout` (`phone` / `wide`), `data-back` (the crumb's Back; the batch review's F8 -- not a `data-action`, the
transport's, whose `back` is the step back); `transport.ts` -- `data-seek`, `data-seek-state`, `data-playhead`, `data-mark`,
`data-round` (empty for the launch/lobby span), `data-round-chip`, `data-hover`, `data-time`, `data-speed`,
`data-partial`, `data-action`, `data-pad-step`, `data-line`, `data-status`.

### `ReplayClient` and the segment HTTP (W39.R2)

Additive, as listed in parts 1 and 2: `autoplay`, `held`, `release` on `ReplayClient`; `held` on `ReplayPageHooks` and
`WorldClient`; `ready` on `ReplayWorldHost`; `roundSpans` and `roundsOf` beside the engine. The `.s2r` format, the
segment HTTP, `GET /replays` and the match server are untouched (`packages/match` has no change on the lane).

### Evidence

Source inspection of `agent/rv2` at `3d90af93d` against each task's commit; each member's unit tests are its task's
(the plan's Log). No browser run is claimed here: the lane's e2e is RV2-09's.

### 14.1 Placeholders

None. Every value here is the viewer's own; nothing of the original is unknown.
