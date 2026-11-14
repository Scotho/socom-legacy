# 402 -- The player's view: what a watcher needs to draw the watched player's own picture

Date: 2026-11-11. Track: product (a browser adaptation: the original has no such view). Status: **a design reading of
the port's own code**, against `main` at `9002339114`; nothing here is a reading of the original but the two facts
cited from research 248 and 314. Sections 1, 3, 4 and 5's table were written from the code alone (no game, browser
or server run for them); the measured figures came later and are said where they stand, each with its kind of
evidence: rendered browser runs in section 2, the measured cost in section 5 (two seeded box runs of `mp-bots`), the
instrument's tolerances in section 8 (two counting runs of the accuracy instrument). **Line pointers**: those in
section 2's table read at `9002339114`; those in the dated entries and in sections 3 to 8 read at the lane's head as of
its close (2026-11-14, after `main` a1e9779400 was merged in), re-found there by the close's reviews.
The plan is `../plans/2026-11-11-players-view.md` (prefix PV).

## 1. What is asked

The owner, 2026-11-11 (seat redotcom-29; his correction of "not" to "NOW" applied): "we had a spectate/replay plan to
use actual controller movements for smoother movement and i'm NOW actually imagining a full on replay of the actual
players perspective in third person with view as the player you are viewing sees it. A new mode that is enabled by
holding X to switch between views on a visible teammate. it becomes a new view in replays in a shared way." His caps:
"within a range of 10-20% extra network bandwitdth and up to like 30-40% larger logs would be acceptable. These are
not targets but caps."

The earlier plan he names is LATER 735 ("Spectator smoothness, fix B1": the seat's commands run per snapshot, so a
watcher draws a body on its owner's command clock; INV-SPECTATE, `agent-mail/evidence/spectate-smoothness/`).

**The original has no player's view.** Its spectator has free, actor-follow and scenic (research 248 section 1: X at
release moves between follow or scenic and free, for a local spectator only, D:L139480-139528); a dead player
watching a teammate is the death camera's state 7 (research 314 section 5.7). A dead player's X does nothing there
(research 248 section 2: "Non-spectator dead players do not receive free/scenic/jump from this function"). So the
view, and the hold that reaches it, are a browser adaptation, labelled `*_ADAPTATION`, and today's follow is not
changed by it.

## 2. What today's follow already is, and what the player's own picture has beyond it

Today a watcher's page rebuilds the watched body's own rig (`viewer/src/matchNet.ts:176-194` at `9002339114`, `spectateFollow`: a
`PlayerCamera` per followed body, ticked once a page frame from the interpolated body's feet, yaw, pitch, peek and
the remote skeleton's posed root; WALL-CAM, research 382 section 2). The table is every term of the owner's own
on-screen camera against that, and what this design does about it.

| term | the owner's page | a watcher today | the player's view |
|---|---|---|---|
| the rig's time base | one 60 Hz tick after each command, drawn between the last two (`walk.ts:2535`, `:2883`; `playerCamera.ts:457-461`) | one tick a page frame (`matchNet.ts:190`) | **rebuilt**: one tick per command crossed on the subject's command clock (section 4), the fraction between |
| the look's evenness | its own commands | 30 Hz samples moved 1x-3x a tick's worth (LATER 735) | **carried**: the command clock's nibble (section 3) |
| the look's precision | float | yaw 1/182 of a degree, pitch 1/100 (`net/codec.ts:107-110`) | as today; about 2 pixels at 9x on a 1080-line screen -- the instrument's tolerance per view |
| the view state (first person, night vision, binoculars, a scope's level) and its zoom run, FOV and far range | `zoom.ts` states 0-12; `matchFirearm.ts:1212`, `:1222-1223` | nothing: a body carries only `Aiming` and `Binoculars` (`net/protocol.ts:465-493`), the room never learns the state | **carried**: the state, 4 bits (section 3); the run is rebuilt from it (its phase within one snapshot) |
| the scope's sway | moves the view and, scoped, is where the round goes (`accuracy.ts:85-95`, `:674-686`); stepped by the page's own frames and the body's exertion | nothing | **carried**: two bytes (section 3). Rebuilt it would put the watcher's cross off the player's target |
| the head or scope eye, the prone tilt | `walk.ts:2903-2922`; the floor's normal at `:2909` | not drawn | **rebuilt**: posture, peek and look are on the wire; the floor is probed on the watcher's grid as `remotePlayers.ts:888-906` does |
| the peek's ease | eased (`traversal.ts:1086-1092`) | the held side -1/0/1, snapping | **rebuilt** by the same ease |
| the recoil's kick | `fly.addPitch` (`matchFirearm.ts:410`) | in the command's pitch | covered |
| the camera's pull at walls | the pass's history (`cameraRig.ts:217-256`) | a fresh rig per bind (`matchNet.ts:177-180`) | **rebuilt**, warmed while the follow is shown; the first seconds after a bind may differ |
| the window's aspect | the owner's (`walk.ts:2846-2848`) | the watcher's | the watcher's own (H309 must hold on its screen): the instrument compares equal viewports |
| the posed root inside a stance or landing blend | its own animator | the remote animator's (`remotePlayers.ts:677-679`) | **rebuilt**; a tolerance the instrument measures |
| the first-person bob, the screen shake | local stick and random phase (`camera.ts:938-971`, `look.ts:496-556`) | none | **rebuilt in kind**, not in phase; said on the HUD's label, never called exact |
| the reticle | `reticle.ts`; its bloom from `accuracy.ts` | hidden | **rebuilt**: the weapon's own reticle with a bloom run on the watcher from the body's velocity, stance, turn and shots; no pip, threat marks or target name (the owner's perception) |
| the scope, binocular and night-vision overlays, "ZOOM" | `matchFirearm.ts:1232-1246`, `:1322-1337` | none | exact from the state, the weapon id and the kit |
| a mounted turret | `walk.ts:1656-1681`; view 1 or 2 (`matchFirearm.ts:1183-1187`) | third person works | third person unchanged; a head view on a turret **falls back to the follow** (LATER 897) |
| the death camera | the owner's stick and killer (`playerCamera.ts:480-483` `deathStick`, `:537-540` `deathEye`) | none | **not shown**: the view falls back to the follow (LATER 897) |
| the owner's prediction between corrections | predicted (`net/client.ts:952`, `:1058`) | the room's truth | not shown; rare |
| the owner's HUD (ammunition, kit, health dial) | its own | none | **not shown** (LATER 898) |

**The limits found while the halves were built** (PV-4a, PV-5a, PV-7a and their reviews; each is in the module's
own header, and PV-9's browser run measures the ones it can):

- **The zoom's run** is rebuilt from the carried state by the game's own `Zoom`: during a run the watcher is at most
  3 commands behind or 1 ahead of the owner (owners at 30, 60 and 144 frames a second), equal once it has settled.
  One near-miss: a second zoom-out pressed within about two frames of the first run's end can run at the other of
  its two speeds for up to 9 commands (about 150 ms), since that edge falls inside one snapshot.
- **The launcher's reticle**: the wire carries no fire mode, so a rifle in its launcher-round mode shows the rifle's
  reticle. **A thermal sight** shows only if the page can resolve the subject's kit (the spawn and welcome messages
  carry it; the wiring task settles it).
- **The bloom** is the room's model of the owner's bloom (the per-seat cone the room already runs), not the value
  on the owner's own page.
- **In a head view against an owner's screen above 60 Hz** the watcher's look trails by up to one command's turn
  while the aim turns, and is exact when it is still; the wire does not carry the owner's frame phase.
- **After a rebuild of the rig** (a burst past the 90-command warm window, a seek, a bind) a wall pull that was still
  easing out is not recovered inside that window; a burst within it is ticked through (PV-10a).

**The limits the first rendered run measured** (2026-11-12, a build box, SwiftShader; `agent-mail` evidence
`player-view/pv9-run1-06f38d534`; PV-10a's reading of the dumps). Facts of the adaptation, no claim about the original:

- **2026-11-12: the camera's let-out at a wall can end about two commands later on the watcher than on the owner**,
  leaving the boom longer or shorter until the next move: 0.64 units on both watchers through the still second after
  the right strafe (the owner's let-out stopped at its command 3915, the watchers' about two commands later). The feet
  are 1/8-unit steps on the wire and interpolated for the commands between the snapshots' two-tick commands, and the
  pass's 1.5 s hold keeps whatever distance the last hit left.
- **2026-11-12: the camera's height follows the watcher's own copy of the watched body**, whose posed root can differ
  from the owner's own body in a crouch: 0.47 units (a crouch before a jump, both watchers) and 1.84 (the dead watcher's
  copy held the crouch transition's root, about 5.5, where the owner's body went on to about 4.7). The rig follows the
  copy the watcher sees, so the camera and the drawn body agree on the watcher's page.
- **2026-11-12: a view change is never drawn late, and can be drawn early by up to the gap between two snapshots'
  commands**: the command clock fills a command between two samples with the NEWER one's discrete fields
  (`net/commandClock.ts`), so every command after the older sample already shows the newer view. The gap is usually
  one command (the run's 29.1-unit pair at the first person's entry, command 7486, was one early), up to about six
  in steady play, and more after a stall (the clock's own header gives the samples' spacing). The review of PV-10a
  corrected an earlier wording here ("within one command").

**What the second rendered run's two large differences are** (2026-11-12, a build box, SwiftShader; `agent-mail`
evidence `player-view/pv10-run2-c27485f55`; PV-10e's reading of the three dumps' camera inputs, frame by frame). Facts
of the adaptation, no claim about the original:

- **2026-11-12: the ladder's 3-6 units are the command clock's numbers, not the camera.** At the owner's page hitch at
  his command 10261 (one 251 ms frame that ran 6 commands; no frame in his dump runs more than 6 -- of the 56 longer
  than 100.5 ms, the two puts' gaps left out, 26 run exactly 6.000 and 30 fewer, 1.098 to 5.904 -- the page's frame cap
  of 0.1 s, `main.ts:2152`) the room's ticks ran on for about 15 with fewer of his commands; the burst rule
  (`net/commandClock.ts` `hear`, before PV-10f) read the burst as 16 more than ran (inferred from the rule and the shift
  below; the dumps hold no room tick). Both watchers' clocks jumped 17.4 and 16.8 commands in one frame there (the
  playout clock's snap), and every number after it in that epoch stands 16 high: the watched body's feet match the
  owner's at a shift of -1.0 command (the owner's drawn feet lie a tick behind his command, `walk.ts:2908`) in every
  moving stretch before it and at +15.0 in every one after (walk-to-crate, the wall, walk-to-ladder, the ladder).
  Compared 16 commands apart, the ladder's eye error is p50 0.14 / p95 0.90 on the spectator and 0.08 / 0.69 on the dead
  watcher (the feet 0.034 p50: the wire's 1/8 step), against 3.6 / 8.6 as paired; the wall leg's eye p95 falls from 14
  to 0.3 the same way. What is left on the ladder is the remote body's posed root at the grab and at the top (up to
  about 1.5 units for a few frames: the camera's height limit above, the camera on the watcher's copy). The owner's page
  draws a climbing body at its simulated feet (`walk.ts:2908` moves them only by a jump's drawn height or LATER
  96's offset), and a watcher's page draws the remote body at the wire's feet with its own posed root
  (`remotePlayers.ts` `feet`, `cameraRoot`), which the rig takes: on a watcher's page the camera and the drawn body
  agree. What the over-count costs a watcher's picture: one skip at the snap, and the rig's per-command timers (the
  pass's hold, the peek's ease) run 16 commands (0.27 s) ahead once. Its root was the clock's header's own over-count
  case, there called rare on the premise that a hitching page sends its whole backlog (`MAX_TICKS`, 30); but both pages
  that send commands cap a frame's step at 0.1 s (`main.ts`, `matchMount.ts`), so a hitch runs at most 6 commands
  however long it lasts (here the frame dropped 151.6 ms, about 9 commands; the next frames caught some of it back --
  4.25 commands in 25.4 ms -- and from t 179262 to 181265 his commands stood 5.7 to 7.4 behind his wall clock), and the
  old rule (the candidate nearest T on either side) read 16 high whenever the shortfall was 8 or more.
- **2026-11-12: fixed at the clock (PV-10f).** The burst rule now never counts more commands than the room's ticks since
  the last advance plus `COMMAND_CLOCK_BURST_SLACK_ADAPTATION` (4: the uplink delay's 50 ms spread the clock is modelled
  for, 3 ticks, and 1 for a page's frame; derived in its doc): among `raw + 16 j` it takes the nearest to T not above T
  + 4, else raw. The second run's hitch, modelled from the owner's frame times over every phase of the room's ticks
  (`test/commandClock.test.ts`, PV-10f), reads its true count at every sample (T 14-16, 6 or 10 commands; the old rule
  read 22 at most phases), and the rig is asked at most 2 whole commands in one frame through it, where the second run's
  watchers were asked 17. What remains, for the four bits: a burst of raw after T >= raw + 12 ticks still reads raw + 16
  -- for a capped page's hitch of 6 commands, T from about 18 to 30 ticks, a hitch of about 300 to 500 ms -- because an
  uplink stall that long runs about T and the nibble cannot tell the two apart (the clock's header gives the rest). So a
  third run should show, at an owner hitch of up to about 280 ms, no watcher jump of about 17 commands and the feet's
  best shift -1.0 in every moving stretch, the ladder at the eye's p50 about 0.1; and the instrument's compare must
  still detect a 16-command slip inside an epoch for the longer hitches -- the instrument's task (PV-10d), not the
  clock's.
- **2026-11-13: the instrument's `put` pulled a watcher's boom, and the tail was read as the view's error (PV-10j).**
  Not a limit of the view: a fault of the instrument, recorded here because four runs' third-person maxima were it.
  The harness stands the owner elsewhere by the room's `Walker.place` -- no spawn. `net/commandClock.ts` `at` draws a
  command between two snapshots by a lerp and only a change of the seat's spawn count whole, so a put between two
  snapshots gives the rig one command with the feet midway along the jump; `cameraRig.ts` `cameraPass` may keep a hit
  there (the distance cut at once, the hold set: `CAM_HOLD` 1.5 s), and after the hold the distance lets out by
  `CAM_REGROW` (0.03) of the gap a game frame -- x 0.985 a 60 Hz tick, about x 0.40 a second, with no snap at the end.
  The owner's own camera ticks the old place, then the new (a put past his page's `SNAP_DISTANCE`, 24 units, as the
  six observed were, 105 to 411; under it his page too would pass midway places). Figures (a Python port of the compare's slip-corrected
  pairing, unreviewed, kept beside the lane's briefs; its third-person maximum on the real-GPU run equals the tool's):
  the real-GPU run at 9b53fcf223, the put of `to-stances` at command 7495 -- the watcher's boom 12.52 against the
  owner's 26.4 through the void leg, 17.4 at its end (the run's maximum, 9.04, at command 7616), 4.3 short at the
  crouch leg's start and 0.1 short 410 commands after the put; the build box's run 4, the put of `to-wall` -- 19.6
  against 26.52 at the void leg's end (6.86). The other two puts show how much is chance: the box's `to-stances` met
  the map as well (the watcher's hold set, the owner's not) and cut the distance by 0.01; the GPU run's `to-wall` stood
  both cameras against the wall at once (10.46 on both pages, both holds set), masking any cut. Where the midway
  command falls is the snapshot's phase. From the shortest distance the pass leaves
  (`CAM_MARGIN`) or any above it, the hold and the regrowth to within 0.05 of a 30-unit reach take at most 505 ticks,
  8.4 s (`packages/viewer/test/playersViewPutSettle.test.ts`, the product's `cameraPass` ticked); the spec now waits
  `PUT_SETTLE_MS_ADAPTATION` (10 s) after each put inside its void leg. In play a body is moved so only by a spawn,
  which the clock draws whole; whether the rig then carries the LAST life's camera to the spawn is PV-15's question.
- **2026-11-12: the boom after a wall is the feet interpolated across a corner of the body's path** (the first limit
  above, measured: its "about 0.6" was one instance, not a bound). In the run leg the body slid along a wall from about
  command 6045 and came off its end at command 6107: the owner's feet after 6106, 6107 and 6108 (from his drawn frames)
  are (753.57, 558.71), (752.96, 558.82), (752.21, 558.04) -- a slide step, then the heading's full step. The wire held
  samples at 6106 and 6108 (on the 1/8 grid, each within 0.07 of the owner's), none at 6107, so both watchers' clocks
  gave 6107 the chord's midpoint (752.94, 558.38): 0.44 units from the owner's, across the corner; the yaw (44.14), the
  root (10.305), the pass's distance (12.13) and its hold (0.033) were equal on all three pages after 6106. At 6107 the
  hold had 0.017 s left: on the owner's page the boom let out anyway (12.13 to 12.35) and the hold went back to 1.5 --
  `cameraRig.ts` `cameraPass` lets out under a running hold only when its main probe meets a surface (`any`, :250-256),
  and a kept hit beyond the boom sets the hold without shortening it (:266-271). On the disc's MP2 at those inputs
  (`viewer/test/povPassCorner.test.ts`) the main probe from the owner's target meets `container_blue01`'s climb face
  26.24 units out, at the far end of its 26.52 reach -- a graze; from the chord's target it meets nothing, and along the
  line between the two feet the hit begins between 0.25 and 0.30 units from the chord's. The watchers' hold ran out and
  their boom let out from 6109. The owner's then held 1.5 s at 12.35 (no further hit: his hold counts down from 6108)
  while the watchers' reached about 23, so the boom stood up to 10.4 units apart (command 6196; 199 of the leg's 296
  commands over 0.5), closing as the owner's let out; the eye, on the frames the view was drawn from 6107 to the leg's
  end, p50 2.2 / p95 4.8 / max 5.2 (the spectator) and 5.4 (the dead watcher), against p50 0.04 / p95 0.18 before 6107.
  The two watchers never parted (the boom within 0.13 the whole leg): the difference is the owner's page against the
  wire, not one watcher's. No watcher-side change recovers it: the hit was at a command with no sample, and at the
  samples either side the owner's own pass set no hold, so a rig ticked only on samples (the camera interpolated
  between) would miss it as well and would leave the owner's per-command history (the hold's count, the let-out's steps)
  in every other stretch. Exact agreement needs the feet of every command, or the pass's state, on the wire: no byte for
  it (the 16:25Z ruling in the plan's Log). Recorded: where the watched body's path turns between two snapshots near a
  wall, the watcher's camera can miss a wall hit the owner's takes (or take one he misses), and the hold then keeps a
  different boom for up to 1.5 s and the let-out closes it over a few more seconds -- in this run 10.4 units of boom,
  5.4 of eye, about four seconds.

## 3. The wire's layout for v0.4.20 (WIRE-16)

One bump, 15 to 16, carried by this lane and shared by the release's other lanes (the main controller's ruling,
2026-11-11, seat redotcom-2f: "take the byte, not the flag bits"; "YOU own the v0.4.20 bump commit"). Objections to
the main controller by 2026-11-12T18:00Z.

**A command, 15 -> 18 bytes** (a batch of three 51 -> 60). After today's last byte:

| byte | field | meaning |
|---|---|---|
| 15 | `view` u8 | the page's view state, `zoom.ts` 0-12; a value past 12 is read as 0 |
| 16 | `swayX` i8 | the scope's sway, the page's `accuracy` value in PS2 pixels at `VIEW_SWAY_STEP_ADAPTATION` (0.5 px: set by PV-1 from the largest `SniperDistLimit` on the disc's records, 60; section 7) |
| 17 | `swayY` i8 | the same, y |

The view's rule is one function, viewer `net/codec.ts` `viewState` (an integer 0-12 is itself, anything else 0): both
encoders write through it and both decoders read through it, the body's after its `& 15`.

**A body, 52 -> 55 bytes.** After today's last byte (`peek`):

| byte | field | meaning |
|---|---|---|
| 52 | `view` u8 | bits 0-3 the seat's view state; bits 4-7 the low four bits of the seat's last run command number (`sim.seq`), the owner's command clock |
| 53 | `swayX` i8 | as the command's |
| 54 | `swayY` i8 | as the command's |

- **Who receives the tail** (the main controller's condition, 2026-11-11, seat redotcom-2f: "the tail is a
  PER-RECIPIENT field ... a living opponent receives zeros"). The three bytes are a player's exact view -- scoped or
  not, the zoom's step, where the sway puts the round -- so they go only to a recipient who may watch that body: **a
  recipient on the body's own side, alive or dead, and a spectator**. Every other recipient -- the other side, alive
  or dead (a dead player cycles his own side only) -- receives the same three bytes **zeroed**: the size is fixed,
  the codec has one layout, and the cost in section 5 does not change. **The recording stores the whole tail** (a
  replay is not a live opponent), so the replay viewer and the public `/replay/<id>` page may show any player's view
  once the match is recorded. The room does this in the one per-recipient pass of its snapshot build that the fog of
  war's withheld bodies also use (one pass, settled with the FOW lane), and a test holds it: whatever the subject
  does, an opposing recipient's snapshot carries zeros there.
- **A dead body**: the state 0 and the sway 0 (the original drops the view to 0 at death, `zoom.ts`'s header); the
  clock's nibble keeps running (a dead seat's commands still arrive).
- **A body with no command number** (a hostage): all three bytes 0; a watcher draws it on the tick clock as today.
- **A body the fog of war withholds** (the FOW lane): all three bytes 0 unless that lane decides otherwise; the
  player's view of a withheld body falls back to the follow.
- **`BodyState.flags`**: this lane takes no bit. Bit 17, the lowest free, is reserved for the FOW lane.
- **The own state**: untouched; the ladder lane's traversal mode, if it comes, is its own field there.
- **The hello** is strict equality on the version (`match/src/room.ts:3166`): a 15 page and a 16 room refuse each
  other with the version's text, as at every bump.
- **Recordings**: the recorder writes the wire's own frame, so a 16 recording holds the three bytes with no other
  change. A recording of 15 or under is read by frozen decoders (`net/codecV15.ts`, as `codecV10` is for 10); the
  viewer does not offer the player's view on it and says so (`VIEW_SINCE_PROTOCOL = 16`) -- nothing is inferred from
  `Aiming`, which cannot tell first person from night vision or a scope's level and is OR-ed with a bot's raise.
- **The room never simulates from these fields.** It stores the last command's three bytes on the seat and copies
  them into the body; no mover, cone, hit or rule reads them. A test holds it: a hostile `view` and sway change no
  byte of a snapshot but the three, and no event.

Why the clock is the command number's low bits and not a count: a seat's credit lets the room run about 60 commands
in one step (`match/src/room.ts:535` `CREDIT_MAX`, `Room.run`'s loop at `:4862-4889`), so a count per snapshot would need seven bits and a
per-seat counter; the number's low bits need neither and survive a replay's seek. Four bits alias at a burst of 16
commands or more, and that burst is not rare: it is what follows an uplink stall of 267 ms or more (one
retransmit), while the room's ticks keep arriving and the playout clock's guard holds the clock rather than
snapping it. So the watcher unwraps the nibble against the room's ticks since the number last advanced: an uplink
stall of T ticks is followed by about T commands, a page hitch by at most 6 (its frame's 0.1 s cap), and never more
than T plus a slack of 4 run, so the count is the nibble's difference plus the multiple of 16 nearest T that does not
pass T + 4 (PV-10f, 2026-11-12: the first rule, the nearest multiple on either side, read a page hitch of 233 ms or
more 16 high -- section 2; a hitch of about 300 to 500 ms still reads 16 high, the four bits' alias). That holds while
the stall is at most 30 ticks (half a second, inside the seat's credit of 60); after a longer one
-- a hidden tab, an uplink stall past the credit -- fewer commands than ticks may exist, the count cannot be known,
and the clock restarts from that sample (the picture has stood still for half a second by then). Only a burst of
exactly 16 or 32, which leaves the nibble unchanged, still reads as no command, and a room's own hitch can leave a
burst 16 short; the body then jumps at one number, as it does on the tick clock today. *(Corrected 2026-11-11
from PV-4a's review: this paragraph first said such a burst falls past the playout clock's snap; it does not.)*

## 4. The command clock, for one body

`NetClient.setCommandClockBody(id | null)`; `ReplayClient` the same (HAZARDS, the `NetClient` member rule). For that
one body `bodies()` returns the feet, yaw and pitch interpolated between the two snapshots that bracket the drawn
command time, on a second `PlayoutClock` fed the unwrapped command number at each arrival. `viewTick`, `shownTick`
and `drawnAt` are not touched, so the room's rewind and the hit-registration instrument see no change, and it is set
only on a page that is not playing (a dead watcher, a spectator, a replay). The animator and the camera's root read
the same substituted body, so body and camera share one clock. A stall holds the newest; the burst after it is
unwrapped against the room's ticks (section 3); a gap in the subject's snapshots, a seat's reconnect or a subject's
change restarts the clock and tells the caller by an epoch, at which the rig is rebuilt; a window with no advance
falls back to the tick clock. Between two samples of different spawn counts nothing is interpolated: the newer
body is drawn whole, as `bodies()` does today. **A dead subject is drawn on the tick clock** (a corpse moves on the
room's ticks while its seat's commands still arrive). A replay feeds the clock its own media time, never the
page's, so a changed speed or a pause does not fight the clock's slew.

**What PV-15 found: the rig's history must not cross a spawn** (2026-11-13; source inspection and unit tests, not yet
run; fresh review folded). At a spawn the owner's page makes a new camera (`walk.ts` `respawn`: the commands the room
has not run replayed on the new mover, then `restart` -- `player.reset()` and one tick; NU-12 B1, citing the original's
`FUN_00299150`): the goal's distance at once, no hold. A watcher's rig had no such rule.

- **The carry.** A dead seat's commands still count (`match/src/room.ts` `run`: `p.sim.seq = cmd.seq` for the dead,
  whose page goes on sending for the respawn press), so the body's nibble runs on through a death, the command clock
  neither stalls nor resets, and its two seconds of samples at the first living frame are the corpse's. `matchNet.ts`
  `povFrame` asks the rig nothing while the subject is dead and nothing resets it at a respawn mid-round; at the first
  living frame the rig rebuilt (more than 90 commands crossed) or caught up (fewer) THROUGH those commands: settled at
  the corpse's place -- a wall behind it cuts the pass's distance and sets its 1.5 s hold on every tick -- then moved to
  the spawn with that distance and hold, and let out over up to 8.4 s (the pass's law, as the instrument's put showed
  it). Where: a respawn mid-round (a respawn game), a re-place by the room, and a rig bound or rebuilt -- a seek, a
  hitch past the warm window -- within 90 commands after a spawn. NOT at a round's start: a `roundStart`, live or
  played through in a replay, resets the spectator's view and drops the rig (`netPage.ts` `unbench` ->
  `SpectatorView.reset` -> `resetFollow` -> `povReset`). And a seat whose page stops sending stalls: past 30 ticks its
  next CHANGED nibble resets the clock (`commandClock.ts` `hear`, rule 3: a new epoch, a new rig); a nibble that comes
  back the same is read as a stall, with no reset -- and the stall's sample then takes the spawned body and its count,
  so the life check still rebuilds there.
- **Built.** The clock answers the spawn count of the body it gives at a command (`net/commandClock.ts` `lifeAt`: the
  newer sample of the bracket, as `at` draws a respawn's newer body whole -- the count changes with the body, not a
  snapshot early or late); `NetClient.lifeAtCommand`; the replay client's reads its own window as the body's read left
  it (no second look at the playhead, so a body and its life are one state's), and that window counts the room's
  recorded `spawn` events for the seat at or before each snapshot, as the live client counts them (`NetClient.spawnsAt`)
  -- so a re-place without a death (a survivor at a classic round's start) is a new life in a replay too (close review
  pass 2, `test/replayPovPaused.test.ts`; before it the window counted only a dead-to-alive change, and the body slid
  from the old place to the new); a recording holding no `spawn` event for the seat falls back to the dead-to-alive
  change. `povFrame` hands the count on the rig's body (`PovBody.life`); the rig's rebuild stops its walk back at
  a command of another life, and a frame that meets one on its way rebuilds there: settled at the first command of the
  new life the clock holds, then ticked on. The owner's new camera stands on the state after his replayed commands; in
  the open the two are one, and they can differ for the first few commands only where those commands meet a wall. A
  source with no life on its bodies is one life, as before.
- **Held by** `test/povCamera.test.ts` (a death of 100 commands, one of 20, a re-place with no death, a rig bound after
  the spawn, a seek back before it, a source without lives) against a fresh owner's camera ticked from the spawn, and
  `test/commandClock.test.ts` (`lifeAt`, and a stall across the spawn).
- **The watched lens's spawn count** (LATER 1015, fixed after PV-15 in 995161084f). Before it, `matchNet.ts` handed
  PV-7b's seam `spawns: (k) => net.bodyAtCommand(k)?.spawns ?? 0`, and a live client's clock body carries no `spawns`
  (the clock stores the snapshot's own body): 0 always, the same defect in the lens's state across a respawn. The seam
  now reads `net.lifeAtCommand?.(k) ?? net.bodyAtCommand(k)?.spawns ?? 0` (`matchNet.ts`), the client's spawn count at
  the command, live and in a replay; held by `test/matchFirearmSubject.test.ts` (LATER 1015's case).

**The limits PV-14 traced** (2026-11-13; source inspection and unit tests, `viewer/test/replayPovPaused.test.ts`; no
browser run). Facts of the adaptation, no claim about the original:

- **2026-11-13: a living subject whose seat sends no commands is never drawn in the player's view** (LATER 981). Its
  nibble stands (match `room.ts`, the body's tail, `clock: p.sim.seq & 15`; `sim.seq` moves only when a queued command
  runs, `Room.run`), so the clock holds one sample -- each later one replaces it as a stall (`net/commandClock.ts`
  `CommandClock.hear`) -- or none advancing within `COMMAND_CLOCK_IDLE_TICKS_ADAPTATION` (`cmd()`); `cmd()` is null, so
  the client's `commandClock()` is null (`replay/replayClient.ts` `ccRead`; the live `NetClient` alike), the rig is never
  run (`matchNet.ts` `povFrame`), `spectatePov` answers false, `SpectatorView.drawPov` never marks the frame shown
  (`spectatorView.ts`) and the HUD reads 'waiting' (`hud.ts`, the spectator's `pov`): the follow drawn, the strip's
  mark half-lit, live and in a replay, playing or paused. Likely, e.g., a hidden or throttled tab past a second is such a seat (not yet shown by a run); so
  were the two raw sockets of the replay viewer's browser spec until PV-14 (its case 11 read 'waiting' for 180 s on a
  build box, pv13-e0a15b4eb). The room's own bots are not: each sends one command a room tick through the same queue
  (match `bots/matchBots.ts` :2289-2291, its other paths :1301, :1680-1683, :1771-1773; `Room.binary` :4128;
  `MatchBots.step` once a tick, :1558, from the room's `beforeStep`), so a bot's nibble advances two a snapshot and the
  view lands on it, paused after a seek on the first frame (the test's bot case). This is the clock's designed fallback,
  not one of PV.R6's; drawing such a subject from its snapshots would change the live view and is a ruling.
- **2026-11-13: paused within 20 ticks before a reset of the subject's clock, the view waits for as long as the pause.**
  A replay's window is primed `REPLAY_COMMAND_CLOCK_AHEAD_TICKS_ADAPTATION` (20) ticks past the playhead; a reset heard
  in that reach -- a changed nibble after more than `COMMAND_CLOCK_STALL_TICKS_ADAPTATION` (30) ticks without an advance,
  a gap past `COMMAND_CLOCK_GAP_TICKS_ADAPTATION` -- has already dropped the older samples, and the read answers null
  until the playhead reaches it (`replay/replayClient.ts` `ccWindow`, its fold 1 doc :774-780 and the `resetAt` wait :811-814, the review's fold 1). Played, that is at
  most 20 ticks of the follow; paused there, the follow stands for the whole pause. Reachable from a real recording: a
  subject whose page stopped for half a second to a second (a hidden tab, an uplink stall), the replay paused in the last
  third of a second before his commands came back (the test's 40-tick stall, paused 10 ticks before its end: 'waiting'
  for 120 frames, drawn within 12 frames once played; paused 26 ticks before it, drawn on the first frame). Not one
  line to change: the window would have to stop hearing at a reset ahead and keep the old clock until the playhead
  reaches it. Left as it is.
- **2026-11-13: with history short of the warm-up the view still lands at once.** After a seek to within
  `POV_WARM_TICKS_ADAPTATION` (90) commands of the recording's first snapshot or of a respawn, the rig is rebuilt from
  the commands there are (`povCamera.ts` `rebuild`): drawn on the first frame in both (the test's tick-6 and
  respawn-plus-4 cases), the respawn's at the spawn point. What it costs is the warm-up's own stated limit: the wall
  pass's hold and let-out and the peek's ease start from rest rather than from the owner's history.

The simulator behind the clock's unit test (PV-4a, `viewer/test/commandClock.test.ts`) models the room three ways
-- the room's 0, 1 or 2 commands a tick on a clean uplink; an uplink with jitter, the room running all that has
arrived; and both links with jitter. **Its numbers are a model, not a measurement of a field line**; the browser
instrument (PV-9) and a playtest are what measure the view. The model's reading (each frame's motion as time at the
median speed less the frame's duration, ms, rms / p99; 60 frames a second):

| model | the command clock | the tick clock (today) | frames held on the newest sample |
|---|---|---|---|
| the room's cadence, clean line | 0.16 / 0.83 | 4.58 / 16.67 | 0 |
| the room's cadence, 30-80 ms jitter down | 0.91 / 0.83 | 5.26 / 16.67 | 8 of about 1,130 |
| uplink jitter 30-80 ms | 0.31 / 0.83 | 7.63 / 16.67 | 0 |
| both links 0-8 ms | 0.09 / 0.52 | 4.63 / 8.33 | 0 |
| both links 30-80 ms | 0.80 / 0.83 | 8.17 / 20.68 | 11 of about 1,130 |

On the heaviest row about one frame in a hundred stands on the newest sample (a step of up to 11.5 ms): the 100 ms
interpolation delay covers about 67 ms past one snapshot's period, and 30-80 ms of jitter on both links with the
commands' uneven arrival at the room sometimes exceeds it. That is what the delay buys, not the clock's doing; the
tick clock on the same row is ten times as uneven.

## 5. The cost, on paper (the measured figures replace these)

Payload bytes, no doors, the environment unchanged; 30 snapshots and 60 command messages a second.

| | today | with WIRE-16 | change |
|---|---|---|---|
| a body | 52 B | 55 B | +5.8% |
| a snapshot to a player, 16 seats | 830 B | 875 B | +5.4% (+1,350 B/s) |
| a snapshot to a spectator, 16 seats | 846 B | 894 B | +5.7% |
| a snapshot to a player, 8 seats | 414 B | 435 B | +5.1% |
| a command message | 51 B | 60 B | +17.6% of the up stream (+540 B/s) |
| a player's whole traffic, 16 seats | 27,960 B/s | 29,850 B/s | **+6.8%** |
| a player's whole traffic, 8 seats | 15,480 B/s | 16,650 B/s | **+7.6%** |
| a recorded 16-body snapshot, before gzip | 859 B | 907 B | **+5.6%** |

The owner's caps are +10-20% network and +30-40% recording. The gzipped recording is the figure that counts and is
not known until measured: the clock's nibble changes every snapshot and compresses poorly, the state and the sway
are zero outside a scope and compress well. The one measured base (research 245: 2,069,910 bytes gzipped for 300.4 s
of 16 players and 8 spectators, 26.41 KiB/s out per client) predates this protocol and is re-measured at the base
head by PV-0's instrument.

**Measured** (the plan's Log, 2026-11-13T21:01Z; kind: seeded box runs of `mp-bots`, scored by `mp-bots-compare`,
evidence `caps-e94c20132`): three runs a side (MP2, 16 players, 8 spectators, 300 s, `--scoped 0.3`: every player bot scheduled to hold a scope for 30 % of the
run in 3 s blocks, dropping it while dead or aiming at a body, so it held one for at most that share), the
lane at e94c20132f against `main` a1e9779400 carrying only the measuring tool. Network, bytes a second per client in
and out: 29,322.2 -> 31,067.8, **+6.0 %** (cap 20 %); the recording, gzipped bytes a second: 5,938.6 -> 7,220.3,
**+21.6 %** (cap 40 %). The table above stays as the paper estimate it was; the measured figures are these. PV.R7's
second configuration, 8 players and no spectators (the plan's Log 2026-11-14T03:23Z; evidence `caps8-9b6017f4d`; the
same runs, the lane at 9b6017f4d5 against `main` a1e9779400 with only the measuring tool, `--scoped 0.3` on every run):
network 16,751.7 -> 17,889.3, **+6.8 %** (cap 20 %); the recording 2,912.4 -> 3,482.1 gzipped bytes a second,
**+19.6 %** (cap 40 %); the base matching PV-0's own within 0.2 % on the network.

## 6. What the view exposes

- A page receives the view state and sway of its own side's bodies only (a spectator: every body's); the other
  side's arrive zeroed (section 3), so a modified page learns nothing of an enemy's scope or aim point from them.
  Today's `Aiming` and `Binoculars` flags still go to everyone, as before.
- A classic round's dead player sees a living teammate's scoped picture. He already sees that teammate's follow.
- A recording holds every player's view, and whoever may open the replay may watch it.
- A forged page can send any state or sway: it changes what watchers draw of that page's own body and nothing else
  (section 3's test).
These are in the owner's row H443 with the default in force (the view on).

## 7. Adaptations

Every constant the lane adds is a browser adaptation with no original: the view, its control and its clock do not
exist in the original (section 1). The ledger's guard (`tools/test/placeholderLedger.test.ts`, P34 (B)) reads this
section for the ones the shared sim declares.

| name | value | where | what it is |
|---|---|---|---|
| `POV_VIEW_ADAPTATION` | (a doc anchor) | viewer `spectatorView.ts` | the player's view itself: a sub-mode of the follow, the owner's request of 2026-11-11 (PV.R1) |
| `POV_HOLD_S_ADAPTATION` | 0.4 s | viewer `spectatorView.ts` | how long X is held to switch the view (PV.R5); the original reads X at its release only (research 248 section 2) |
| `POV_MAX_TICKS_ADAPTATION` | 90 (`POV_WARM_TICKS_ADAPTATION`) | viewer `povCamera.ts` | the most commands the rig ticks through in one frame before it rebuilds; PV-10a (was 8): a rebuild's own cost bound, and ticking through gives the uninterrupted run's state given the same samples and the frame's one root (as a rebuild is handed them): a root that changed inside the burst is the frame's for every command of it |
| `POV_WARM_TICKS_ADAPTATION` | 90 | viewer `povCamera.ts` | the commands of history a rebuild is warmed from (1.5 s: the wall pass's hold, the peek's ease) |
| `POV_COMMAND_DT_ADAPTATION` | 1/60 s | viewer `povLens.ts` | the step of the subject's zoom run per command crossed (the owner's page steps it per frame) |
| `POV_DROP_SHOT_WINDOW_ADAPTATION` | 4 | viewer `povLens.ts` | the commands within which a round heard after the view dropped out of a scope is put back on the scoped command, as the room's cone replays it |
| `VIEW_SWAY_STEP_ADAPTATION` | 0.5 px | viewer `net/codec.ts` | PS2 pixels one unit of the wire's sway i8 is (section 3; PV-1): the smallest round step holding the largest `SniperDistLimit` over every weapon record and stance (60, the M82A1A's and the M87ELR's standing x; `RUN/ZWEAPON.ZAR` through `readKitTable`) in +-127 steps |
| `VIEW_RECIPIENTS_ADAPTATION` | (a doc anchor) | viewer `net/protocol.ts` | who is told a body's tail whole (section 3; PV.R9; PV-2): the body's own side, alive or dead, and the spectators (`viewTold`, the recipients of NU-3c's `healthTold`); the other side gets the three bytes zeroed, and the recording keeps them whole |
| `COMMAND_CLOCK_BASE_ADAPTATION` | 1024 | viewer `net/commandClock.ts` | where the unwrapped command count starts, above the rig's warm window (LATER 735; section 4) |
| `COMMAND_CLOCK_GAP_TICKS_ADAPTATION` | 15 | viewer `net/commandClock.ts` | a gap in the subject's snapshots past which the four-bit number cannot be unwrapped and the clock restarts |
| `COMMAND_CLOCK_STALL_TICKS_ADAPTATION` | 30 | viewer `net/commandClock.ts` | the longest stall whose burst is unwrapped against the room's ticks; past it the count is unknowable and the clock restarts (section 3) |
| `COMMAND_CLOCK_BURST_SLACK_ADAPTATION` | 4 | viewer `net/commandClock.ts` | PV-10f: the most commands past the room's ticks a burst is read as (the uplink delay's 50 ms spread, 3 ticks, and a page frame's 1); a page hitch's few commands are no longer read 16 high below it (section 2) |
| `PUT_SETTLE_MS_ADAPTATION` | 10 000 ms | `tools/perf/players-view/instrument.ts` | the instrument's wait after each put, inside its void leg: past the obstruction pass's hold and regrowth on a watcher's rig (at most 8.4 s), so the put's tail is not judged (PV-10j) |
| `COMMAND_CLOCK_IDLE_TICKS_ADAPTATION` | 60 | viewer `net/commandClock.ts` | ticks without an advance after which there is no command clock and the body is drawn on the tick clock |
| `COMMAND_CLOCK_HISTORY_TICKS_ADAPTATION` | 120 | viewer `net/commandClock.ts` | the samples kept, two seconds, for the rig's warm window |
| `SOCKET_BYTES_ADAPTATION` | (a doc anchor) | `tools/mp-bots.ts` | the instrument's count of payload bytes at each bot's socket (PV-0) |
| `SCOPED_BLOCK_TICKS_ADAPTATION` | 3 s of ticks | `tools/mp-bots.ts` | the length of a bot's scoped block under `--scoped` (PV-0) |
| `SCOPED_SWAY_PERIOD_TICKS_ADAPTATION` | 2 s of ticks | `tools/mp-bots.ts` | one period of a scoped bot's sway triangle wave under `--scoped`, within the record's `swayLimit`; the instrument's own, the page's sway is `Accuracy`'s (PV-3) |

## 8. The instrument's tolerances (PV-10g)

The accuracy instrument's limits (`tools/perf/players-view/tolerances.json`), derived by the rule the controller ruled
before the real-GPU run was back (the plan's Log, 2026-11-13T05:42Z, rules 1-6; rule 1 amended at 10:17Z, after the
runs of 9b53fcf223 had been read leg by leg: a run counts only when each put is followed by its settle inside its void
leg -- which is what leaves run 4 and the 9b53fcf223 GPU run out and runs 6 and 7 in) by the lane's derivation script and
its counting check (`derive.py`, `qualify.py`; kept with the lane's evidence, outside git, the inputs being the runs'
compare JSONs, which are not in git either), never typed or edited by hand: the table below is the script's own output,
and every figure in it can be re-read from the named run's `compare-*.json`. Product track: the instrument
measures an adaptation against itself (the watcher's picture against the owner's own); nothing here is a reading of the
original. Kind of evidence: two rendered browser runs of `e2e/playersView.spec.ts`, each scored by `compare.ts` with
`--legs`.

**The counting runs** (rule 1: every leg PV.R8 names happened in the run's own record; both compares exact, with the
per-leg table; no clock slip "not located"):
- **run 6**, a build box (b0's c7a.4xlarge; the software renderer, headless), the lane at 2def5343ac, 2026-11-13
  (the plan's Log 19:56Z; evidence `pv10-run6-2def5343a`): paired 86.68 % (the spectator), 87.73 % (the dead watcher).
- **run 7**, a real GPU (the Shadow PC; WebGPU on Direct3D 11, headed, the windows tiled, every page visible and
  focused throughout by the sampler's own account), the lane at 3b1a1a56ef, 2026-11-14T01:16:50-01:24:47Z (evidence
  `pv10-run7-3b1a1a56e`): paired 97.58 % and 98.39 %; view changes 8 of 8 matched on each, one clock slip found and
  placed.
Both watchers of both runs are over the paired floor of 0.8, so all four contributed (rule 4).

The figures the owner's row quotes (H443), third person, settled forward pairs, each run's own `compare-*.json`
`groups[third].settled.errors`: the eye's median about 0.04 units in all four (0.038-0.041); its 95th percentile 0.196
(run 7, the spectator) and 0.164 (run 7, the dead watcher) on the real GPU, 0.388 and 0.345 on the build box (run 6);
the look's 95th percentile 0.060 degrees for both of run 7's watchers, 0.184 and 0.216 for run 6's.

**The limits** (rule 2: per group and quantity, the worst over both runs, both watchers and both directions -- the
settled forward set and the converse -- times 2 for a p95 and 1.5 for a max, rounded up to two significant figures,
never under the wire's floor: 0.25 units for the eye, 0.25 degrees for the look and the FOV, 1 px; rule 3: `minSeconds`
and the motion minima at half the smallest the runs show, rounded down to two significant figures). Units: eye and
`minPath` world units; look, fov, `minYawDeg`, `minPitchDeg` degrees; offset and `lookPx` pixels; `minSeconds` seconds.

| group | quantity | limit of | worst measured | where (run, watcher, direction) | factor | x factor | LIMIT |
|---|---|---|---|---|---|---|---|
| third | eye | p95 | 0.3876 | run6 spectator fwd | 2.0 | 0.7752 | **0.78** |
| third | eye | max | 7.305 | run7 dead fwd | 1.5 | 10.96 | **11** |
| third | look | p95 | 0.216 | run6 dead fwd | 2.0 | 0.432 | **0.44** |
| third | look | max | 2.289 | run7 spectator conv | 1.5 | 3.433 | **3.5** |
| third | fov | p95 | 0 | run6 spectator fwd | 2.0 | 0 | **0.25** (the floor) |
| third | fov | max | 0 | run6 spectator fwd | 1.5 | 0 | **0.25** (the floor) |
| third | offset | p95 | 0 | run6 spectator fwd | 2.0 | 0 | **1** (the floor) |
| third | offset | max | 0 | run6 spectator fwd | 1.5 | 0 | **1** (the floor) |
| third | minSeconds | gate | 89.5 | run6 dead | 0.5 | 44.75 | **44** |
| third | minYawDeg | gate | 1711 | run6 spectator | 0.5 | 855.6 | **850** |
| third | minPitchDeg | gate | 2.073 | run6 dead | 0.5 | 1.036 | **1** |
| third | minPath | gate | 1032 | run6 dead | 0.5 | 516 | **510** |
| first | eye | p95 | 0.07171 | run7 spectator fwd | 2.0 | 0.1434 | **0.25** (the floor) |
| first | eye | max | 0.5336 | run6 spectator conv | 1.5 | 0.8004 | **0.81** |
| first | look | p95 | 0.2435 | run6 spectator conv | 2.0 | 0.4871 | **0.49** |
| first | look | max | 0.4261 | run6 dead conv | 1.5 | 0.6391 | **0.64** |
| first | fov | p95 | 0 | run6 spectator fwd | 2.0 | 0 | **0.25** (the floor) |
| first | fov | max | 1.534 | run6 dead fwd | 1.5 | 2.301 | **2.4** |
| first | offset | p95 | 0 | run6 spectator fwd | 2.0 | 0 | **1** (the floor) |
| first | offset | max | 0 | run6 spectator fwd | 1.5 | 0 | **1** (the floor) |
| first | lookPx | p95 | 2.707 | run6 spectator conv | 2.0 | 5.415 | **5.5** |
| first | lookPx | max | 4.737 | run6 dead conv | 1.5 | 7.105 | **7.2** |
| first | minSeconds | gate | 9.667 | run6 dead | 0.5 | 4.833 | **4.8** |
| first | minYawDeg | gate | 141.1 | run7 spectator | 0.5 | 70.53 | **70** |
| first | minPitchDeg | gate | 1.164e-05 | run6 dead | 0.5 | 5.82e-06 | **5.8e-06** |
| first | minPath | gate | 6.882 | run6 spectator | 0.5 | 3.441 | **3.4** |
| binoculars | eye | p95 | 0.04625 | run7 spectator conv | 2.0 | 0.09251 | **0.25** (the floor) |
| binoculars | eye | max | 0.04839 | run6 spectator fwd | 1.5 | 0.07259 | **0.25** (the floor) |
| binoculars | look | p95 | 0.0397 | run6 spectator conv | 2.0 | 0.0794 | **0.25** (the floor) |
| binoculars | look | max | 0.05423 | run6 dead conv | 1.5 | 0.08135 | **0.25** (the floor) |
| binoculars | fov | p95 | 0.5759 | run7 spectator fwd | 2.0 | 1.152 | **1.2** |
| binoculars | fov | max | 9.187 | run7 spectator fwd | 1.5 | 13.78 | **14** |
| binoculars | offset | p95 | 0.2419 | run6 spectator fwd | 2.0 | 0.4839 | **1** (the floor) |
| binoculars | offset | max | 0.2419 | run6 spectator fwd | 1.5 | 0.3629 | **1** (the floor) |
| binoculars | lookPx | p95 | 3.697 | run6 spectator conv | 2.0 | 7.395 | **7.4** |
| binoculars | lookPx | max | 5.051 | run6 dead conv | 1.5 | 7.577 | **7.6** |
| binoculars | minSeconds | gate | 3.194 | run6 spectator | 0.5 | 1.597 | **1.5** |
| binoculars | minYawDeg | gate | 7.846 | run6 dead | 0.5 | 3.923 | **3.9** |
| binoculars | minPitchDeg | gate | 1.086e-05 | run7 dead | 0.5 | 5.428e-06 | **5.4e-06** |
| binoculars | minPath | gate | 0.6547 | run6 spectator | 0.5 | 0.3273 | **0.32** |
| scope5 | eye | p95 | 0.07187 | run7 spectator conv | 2.0 | 0.1437 | **0.25** (the floor) |
| scope5 | eye | max | 0.07258 | run7 dead fwd | 1.5 | 0.1089 | **0.25** (the floor) |
| scope5 | look | p95 | 0.08237 | run6 spectator conv | 2.0 | 0.1647 | **0.25** (the floor) |
| scope5 | look | max | 0.166 | run6 spectator conv | 1.5 | 0.249 | **0.25** (the floor) |
| scope5 | fov | p95 | 0 | run6 spectator fwd | 2.0 | 0 | **0.25** (the floor) |
| scope5 | fov | max | 8.334 | run6 spectator fwd | 1.5 | 12.5 | **13** |
| scope5 | offset | p95 | 0.4041 | run7 spectator conv | 2.0 | 0.8081 | **1** (the floor) |
| scope5 | offset | max | 0.5303 | run6 dead conv | 1.5 | 0.7954 | **1** (the floor) |
| scope5 | lookPx | p95 | 2.153 | run6 spectator conv | 2.0 | 4.305 | **4.4** |
| scope5 | lookPx | max | 4.339 | run6 spectator conv | 1.5 | 6.508 | **6.6** |
| scope5 | minSeconds | gate | 4.023 | run6 spectator | 0.5 | 2.012 | **2** |
| scope5 | minYawDeg | gate | 29.26 | run7 dead | 0.5 | 14.63 | **14** |
| scope5 | minPitchDeg | gate | 1.074e-05 | run6 dead | 0.5 | 5.371e-06 | **5.3e-06** |
| scope5 | minPath | gate | 1.377 | run7 dead | 0.5 | 0.6884 | **0.68** |

maxFallbackShare: the worst measured 0.1515 (run7 spectator) + 0.05 = **0.2015**; maxViewMismatch 0 on every group; maxClockSlips absent.

**`maxFallbackShare`'s quantity, said plainly** (PV-10g's review): rule 3 names "the worst measured share over the legs
meant to show the view"; the compare judges one share only, `coverage.watcherFallbackShare`, over the whole drawable
span -- the follow legs (`expectShown: false`) included -- and the gate is derived from that quantity, the one it is
then judged against. It is therefore looser than the rule's words: read over the view's own legs alone, the counting
runs' shares are about 0.095 (run 7) and 0.03 (run 6), so a run that falls back for some 5 % more of those legs still
passes. A share over the shown legs alone needs a new figure in the compare (LATER 1028), then a re-derivation.

Groups: the runs showed third person, first person, the binoculars and the scope's level 5, all four in every counting
run, so each is required. **The motion minima on a head view** (`minPitchDeg` of a few millionths of a degree on first
person, the binoculars and scope 5) are set as rule 3 is written -- the pitch range those legs show is above 0 but is
numerical noise, since no head-view leg pitches -- so in effect they test nothing; `minYawDeg` and `minPath` carry those
groups' data gates.

**Held by rule 6**: the compare run WITH the file over each counting run's dumps -- run 6 spectator, run 6 dead watcher,
run 7 spectator, run 7 dead watcher -- exit 0 each, no limit over. A pass on the runs the limits came from shows only
that the file is consistent with them; the next counting run is the first judged by it.

**Not under a tolerance, and said beside them** (rule 5): the void legs (the instrument's own places, `to-stances` and
`to-wall`, and the walk helper's `walk-to-ladder`), left out of the pairs, the converse frames and the FOV search --
though the watcher's fallback share (`maxFallbackShare`), `shownWhileNotDrawable` and the view-change lists still count
their frames (`compare.ts` `coverage`; LATER 1028); and four limits recorded with their
figures, inside these limits only as far as the counting runs showed them -- the watcher's copy of a crouched or prone
body and of a body at a ladder's grab and top (LATER 973; the `crouch`, `prone`, `prone-turn` and `ladder` legs); the
camera's boom for a few seconds after a corner beside a surface at its far reach, and while it lets back out at a wall
(the `run` and `wall` legs, and any turn that swings the boom onto a surface: the third-person eye max, 7.3 units in
run 7's dead watcher, is two pairs at the end of the second `capture:turnRight`, where the owner's camera pulled in
against a surface between two of his frames -- its eye from 37.5 to 33.3 units off his feet, its boom (the dump's
`boom`) from 26.5 to 23.4 -- and the watcher's copy pulled in the same way about one command later -- the limit of 11 carries it, as rule 2 says it must); a change of view or zoom drawn early by up to
the gap between two snapshots' commands -- usually one, up to about six in steady play (section 2; the compare's
`--view-lead-cmds` 6) -- when it falls between samples (the `scope` leg's view changes); and
the 16-command alias of a hitch of 300-500 ms (wherever a hitch lands; run 7 placed its one slip). A new counting run
re-derives the file by the same rule, never by hand.
