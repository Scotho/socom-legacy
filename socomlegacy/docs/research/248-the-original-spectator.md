# 248 -- The original spectator

For sprint 35 PT-19; research 244 remains the playtest owner's replay-viewer note.

By Craig's dot, 2026-10-08; **reading, pending verification of the review corrections**. The independent whole-note
review returned PASS WITH FINDINGS (high) on 2026-10-08; its six wording corrections are incorporated here.
F1's mode, initializer/constructor and X-cycle scope was also independently confirmed by the PT-19 reviewer.
This note concerns the original
spectator that replay reuses. Recording, seeking, playback speed and replay bindings remain browser adaptations
under PT.R3; they acquire no original-game provenance from this reading. No game, browser or server was run.

Pins: web behavior `4addfa363b0e083b991ff545260e3c3da708c206`; the web comparison's desktop gitlink
`be5578311ff2dd33a814d39e7d6d4f2255da4da3`; the consulted PT-18 note 244 snapshot
`4deda11a6a781b8ea009cb24dbdc6e5246d11384`. D:L means the line in
`game/analysis/socom2_game.elf.decomp.c`; ELF addresses refer to `game/disc/socom2_game.elf`
(SHA-256 `06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872`).
The patch adds only this note against main `96c9fcaed6aba5fee24ced69d5c6b4f156b0ba4d`. The decompilation artifact
SHA-256 is `b9e863762f08d55602c4310c9491286879cfcf2947683e723bc2905e1aaa42d4`; its hash, not a claim that generated analysis is tracked at the
submodule commit, pins D:L.

The small headless characterization used ACT's merged snapshot `e3642da2f90ac8a20b4c47caefff2d3d3f97e8a8`;
the spectator module and its direct dependencies were checked against the behavior pin. It measures the port only.

## 1. First finding: the mode labels are reversed in the earlier reading

**F1: original 0 = free, 1 = actor follow, 2 = scenic.** Research 91 §12, 179 §9.6, 232 §5 and
`spectatorView.ts` label 0/1 the other way round. This is consequential: the shared port goes scenic -> follow
on X, whereas the original goes scenic -> free. It is a finding against the shared camera, not a replay-only repair.
The controller forwarded it to the playtest owner at 15:00 UTC; the independent PT-19 review confirmed the
mode/initializer/X-cycle scope. PT-19b owns the shared correction; this is source-reviewed, not measured running.

Four paths establish the field's identity and meaning:

- `FUN_0029b0c0`, D:L142660, passes **camera + 0xf4** as the state to `FUN_00295260`.
- `FUN_002956e0`, D:L139698-139704, sets mode 0 for the local spectator actor, mode 1 and the saved target for
  another actor. For an ordinary target, D:L139646-139649 changes kind **6 to 2 only**, leaving other kinds alone.
  For a spectator target, D:L139655-139675 conditionally writes kind 6 on this camera when the target's `+0xea8`
  pointer is null, otherwise on the object that pointer names; its existing-kind/target guards still apply.
- `FUN_002964f0`, D:L140442-140510, translates the camera in mode 0; its mode-2 arm adjusts magnification instead
  (D:L140512-140529). Camera-kind 6 calls this function (`FUN_002998f0`, D:L142016-142017).
- `FUN_00297410`, D:L140957-140960, applies spectator orbit `FUN_00294b40` only for mode 1.

State relative to camera: `+0xf4` mode, `+0xf5` remembered mode, `+0xf8..+0x100` angles,
`+0x104/+0x108` orbit offsets, `+0x10c` saved target, `+0x110` scenic index, `+0x114` description pointer,
`+0x118` magnification. These are not the game object's coincidentally numbered fields.

| input / event | prior state | original result | D:L |
|---|---|---|---|
| X released | scenic (2) | remember 2, free (0); restore magnification to 1 when more than 0.01 away | 139480-139499 |
| X released | follow (1) | remember 1, free (0); camera target becomes local actor, kind 6; clear orbit offsets | 139500-139517 |
| X released | free (0), remembered 2 | scenic (2); reload current scenic record with step 0 | 139518-139524 |
| X released | free (0), remembered 1 | follow (1); kind 2, target restored through `FUN_002956e0` | 139525-139528 |
| X released | free (0), remembered 0 | remains 0; no follow/scenic branch | 139518-139528 |
| Up / Down released | any spectator mode | step scenic index +1 / -1; if nonnegative, kind 6 and scenic (2), local target, magnification 1 | 139531-139585 |
| actor target selected | any spectator mode | setter preserves old 0/1 as remembered; selects 0 for local actor or 1 for another; clears orbit offsets | 139677-139707 |
| camera initialization/reset | any | mode 0, remembered 0, index -1, target/name/orbit offsets zero, magnification 1 | `FUN_00299150` 141664-141671 |

The constructor `FUN_0029b5d0` agrees (D:L142860-142876); reset callers include
`FUN_002232a0` D:L75869 and `FUN_002a7d40` D:L149685. The initial mailbox report mistakenly treated
D:L76134-76135 as a camera reset: those are the game object's fields, excluded here and corrected at 15:03:59 UTC.

**Entry binding: FREE for the local spectator (reading).** The PT-19b reviewer identified the vtable route;
dot independently reread it and the ELF. The constructor installs vtable `0x406170` (D:L142824); its `+0xc`
entry at ELF VA `0x40617c`, file offset `0x2f577c`, is `0x0029b3c0`. For a nonnull target,
`FUN_0029b3c0` D:L142748-142768 calls `FUN_002956e0(camera, target, 0)`. In the online local-spectator
case, binding the local actor writes mode 0 (D:L139677-139700). In `FUN_00599b60`, the controller predicate
at D:L455680-455684 guards the entire local rebind: D:L455685 assigns the local actor, then every arm
inside that guard, including the spectator arm at D:L455698, reaches the virtual call at D:L455701.
This is a rebuild/respawn path; it is not an unconditional bind for every actor.

Two additional sites bind the local getter's result: `FUN_001ea720` after its successful load/setup calls
(D:L49722-49735), and `FUN_002abd40` (D:L151883-151885). These corroborate FREE at the local-spectator
binding points. They close the mode-at-bind unknown, **not the complete first-render or round-transition
schedule**. The controller accepted this bounded conclusion after dot's source check; the exact visible
entry pose remains `SPECTATOR_ENTRY_POSE_PLACEHOLDER` in the PT-19b lane's research 101.

## 2. Inputs, actor cycle, and jump

`FUN_00295260` acts online, only for a local spectator, with the controller's **control-state byte** `+0x221 == 0`
(D:L139463-139475). That neutral name is used throughout; this note does not establish the UI semantics of all its
values. All four buttons test raw state **3, released**: Triangle (+7) jumps first; X (+10), else Up
(+5), else Down (+6) form a separate priority chain. Raw slots and release-state identification reuse research
179 §9.6 and 232 §5; this reading independently checks their consumers, not the whole pad decoder.
Non-spectator dead players do not receive free/scenic/jump from this function.

The cycle latch `FUN_00592560` D:L451681-451694 runs with respawn off, for a ghost, or for a spectator.
Right (+3) / Left (+4) released set next/previous while the control-state byte is not 1. `FUN_00547350`
D:L412733-412750 consumes next before previous with the control-state byte equal to 0: argument 0 for spectators, 1 otherwise.

| cycle case | original eligibility / order | evidence |
|---|---|---|
| previous | actor-list index decreases, wraps at count; type 2, not a spectator | `FUN_00546fa0` D:L412584-412615 |
| next | actor-list index increases, wraps at count / exhausted lookup | `FUN_00547170` D:L412637-412672 |
| both directions | alive **or the local actor**, not merely the currently followed actor | D:L412585, 412605, 412638, 412658; local getter `FUN_002b3580` D:L156211-156216 |
| dead/ghost player (argument 1) | shared team flags at actor +200 decimal; reject bit 0x20000 (escortee) | D:L412607-412609, 412660-412662 |
| spectator (argument 0) | no team or escortee-bit test; type-2/list membership still required | same branches; hostage membership remains research 237's reading |

**F2: the local dead body can be eligible when cycling back from a teammate.** The port's `teammates`
(`spectatorView.ts:439-443`) always excludes self and all dead bodies. A headless example with dead self 1 and living
teammates 2/3 cycles 2,3,2,3. The source predicate would permit self 1; the visible return-to-own-body behavior still
needs capture. Do not confuse this exception with general permission to follow dead teammates. The next-function
half of `SPECTATOR_CYCLE_ORDER_READING` is now read; equivalence of network seat IDs to original actor indices is not.

`FUN_00294f40` D:L139348-139446 builds eye/far points, walks the linked actor list and selects type-2,
non-spectator characters by distance to that segment and distance to the eye. There is **no alive, team, wall-LOS
or frustum predicate in this walk**. `FUN_00308800` D:L207111-207228 clamps the distance to the segment's endpoints.
The first candidate wins initially; replacement uses relative distance < -0.1, or < 0.1 with relative eye-distance
< 0.1 and either delta negative (D:L139415-139424). It finally calls the common target setter (D:L139441-139442).

**F3: `jumpToVisible` adds an alive filter and sorts by seat ID** (`spectatorView.ts:238`). The filter's difference
is reproduced with a dead body on the centre segment and a living off-axis body: the port chooses the living one.
The original selector would take the eligible dead candidate in that ordering. Whether such bodies remain in the
active original list, their lifetime, the far-distance producer, and the rendered result are open. Keep the 0.1 band;
do not add a guessed LOS rule based on the function's English label.
*2026-10-14, SPECTATOR-VIEW (research 314 §7 W5; reading, pending review): `jumpToVisible` takes every body, dead or alive
(the walk re-read, D:L139398-139424: a type-2 entry, not a spectator, nothing else), in the seat ids' order as the list's
stand-in (`SPECTATOR_CYCLE_ORDER_READING`); `JUMP_TO_VISIBLE_READING`'s doc re-filed. The follow camera's port rule still
moves off a dead followed body the next frame (§5's open death fallback), unchanged.*

## 3. Camera rules: follow is not one fixed offset

When actor follow uses camera kind 2, `FUN_002998f0` D:L141991-141999 calls `FUN_00296f10`.
That function gets the target-relative setup from `FUN_0029a950`, applies `FUN_00297410`, then smooths and resolves
camera obstruction through `FUN_0029bf70` (D:L140696-140799). In `FUN_0029a950`, **only when camera `+0xc0`
equals `+0xbc`**, `FUN_002869d0` queries a node position on actor `+0x170` (D:L142451-142463); that position's
z component gains 28 and its y determines the height gain (D:L142464-142489). When those camera fields differ,
the setup instead takes the fixed vector `DAT_004161e8..DAT_004161f0` (D:L142547-142554). This is not a
universally fixed world-space distance and height; the branch condition belongs to the reading.

For spectator follow specifically, `FUN_00294b40` D:L139269-139343 accumulates the local controller's two input
values at **2 * dt**, wraps angles, clamps relative and absolute pitch to [-1,1] radians if the target is null or
its `+0xf7a == 1`, otherwise [-1,-0.2], and forms an orbit matrix. The semantic name of `+0xf7a` is not established
here. The original follow path can therefore orbit; the port's `followPose` uses target yaw and fixed pitch.

**F4: `FOLLOW_BEHIND=24.906`, `FOLLOW_OVER=25.709`, `FOLLOW_PITCH=-9.167` are the earlier standing-rest
approximation** (research 83/88; `spectatorView.ts:152-158,271-273`). This reading supplies no replacement triple.
The conditional node-position setup, orbit, transition smoothing and camera obstruction must be understood together before
a parity claim. PT-19 may reuse the shared approximation as recorded; a replay-only camera fork would conceal the gap.

## 4. Free and scenic motion, bounds, and map data

Free/scenic kind 6 shares `FUN_002964f0`. With a pad available and the control-state byte equal to 0, it computes
translation coefficients from the pad's
`+0x220/+0x224` and pressure channels 0x1c/0x1e; the ELF float at **0x3de2c8 is -300**
(file offset 0x2cd8c8). Rotation inputs `+0x228/+0x22c` are multiplied by **1.8849558 * dt**. The pitch step also
multiplies by `DAT_003df198` (D:L140426): ELF float **1.0**, address 0x3df198, file offset 0x2ce798. Pitch is clamped
to [-1.5,1.5] radians and yaw wrapped over 2*pi (D:L140398-140438). These are source coefficients, not a measured
metres-per-second specification. Axis mapping, processed-input range, and the runtime initialization of the basis
vector at 0x3f64f0 remain open; its on-disc bytes are zero, so reading them as a unit vector would be unsound.
*2026-10-14, the SPECTATOR-VIEW review's B1: `DAT_003df198` is not a constant but INVERT PITCH's sign -- 1.0 in the ELF is
only its initial value; the START menu's row flips it (D:L61699-61721) and the stored option sets it to +-1
(D:L125167-125171). The scenic look takes it (research 314 §8, `SCENIC_LOOK_AXES_READING`).*

Mode 0 changes position (D:L140442-140510). Mode 2 changes magnification by
`m = clamp(m + dt * input224 * m * 1.3, 1, 30)` (D:L140408,140512-140529), updates the projection, and still
passes through the common look and bounds code. Entering a scenic view or leaving scenic resets magnification to 1.
**F5: a scenic view is an authored starting position/orientation with live look and zoom**, not necessarily a
permanently frozen pose as `standScenic` currently supplies (`spectatorView.ts:434-436`). The pose type also omits roll; every disc record read here has zero roll.
*2026-10-14, SPECTATOR-VIEW (research 314 §7 W6; reading, pending review): the module's half built -- the look from the
view's `Rot` at entry (D:L140414-140439), the magnification by this formula (D:L140513-140521), reset to 1 at X, Up / Down
and a bind out of scenic when more than 0.01 from it (D:L139485-139498, D:L139536-139578, D:L139687-139697); the sticks'
mapping is `SCENIC_LOOK_AXES_READING` (research 314 §8: +0x224 the left stick's y, +0x228 / +0x22c the right stick's, up
and left positive, D:L179557-179563, D:L179808-179811). The projection's use: the magnification scales its x / y
(D:L140524-140527, `FUN_0029b2f0`'s), so tan(half FOV) / m; the LOD scale (D:L140528) and the bounds pass are not
ported. The page's wiring (the frame's dt, the projection) is pending; built the same day (research 314 §7 item 6:
the frame's real seconds, `FlyCamera.setMagnification`).*

Bounds, D:L140531-140593: when authored x-width exceeds 5, x/z clamp to the authored min/max. If a spatial cell
has height records, y stays at least 10 above their minimum and no higher than their maximum plus half a projection
field (`camera+0xb4` -> `+0xf0`); its exact semantic name is not established here. With no such records, authored
y bounds apply if active; otherwise position rolls back to the previous value. This is not a general collision-free
flight guarantee, and the cell-height representation needs its own reading before porting.

The mission reader is **`FUN_002aab20` D:L151385-151443**. ELF strings identify
`Free_Fly_Camera_Extents` / `Min` / `Max` (0x3f15c0/0x3f15d8/0x3f15e0) and
`Scenic_Views` / `Pos` / `Rot` / `Desc` (0x3f15e8/0x3f15f8/0x3f1600/0x3f1608).
Extents default to (-1,-1,-1)/(1,1,1). Scenic `Pos` is copied; if **Rot[0] > 90**, the reader subtracts 360 once;
all three rotation components become radians. This is narrower than the port's general signed-degree wrapping,
although they agree for the views read below. Matrix composition/picture alignment still requires verification.

`RUN/<map>.ZDB` -> `READERM.ZAR/mission.rdr`, read with repository `parseZdb`, `Zar`, `parseRdr`, `rdrGet`:

| map | count | first `Desc` | first `Pos` | first raw `Rot` | `Free_Fly_Camera_Extents` |
|---|---|---|---|---|---|
| MP2 | 6 | SEAL Start | 979,236,689 | -26,53,0 | absent |
| MP6 | 9 | Extraction Area | 1028,136,1997 | -40,73,0 | absent |
| MP51 | 4 | Northeast Overlook | 1329,98,477 | -15,154,0 | absent |
| MP72 | 11 | SEAL Base | 2179,153,1480 | 337,72,0 | absent |

All 30 records read have roll 0. MP51's remaining records are Back Alley (712,137,328; -15,183,0), Southeast
Overlook (1597,155,940; -21,53,0), Southwest Overlook (407,249,1325; -24,327,0). Research 232 §5.5 retains MP2's
complete table. No archive data is changed. `FUN_002ab260` D:L151462-151487 reads file order and wrap:
from index -1, Up selects 0 and Down the last; no records leaves the index unchanged. Its step-0 return selects
the stored view (or 0 from a negative index). The initializer confirms scenic index -1 without a placeholder.

**F6: the shared `FlyCamera` is a documented creative-camera adaptation**, with 12 metres/s, boost, glide and its
own pitch limit (`camera.ts:18-45,139-150`); those values are not validated by the original coefficients above.
Reusing it for replay is allowed by the adaptation brief; saying it establishes original spectator-flight parity is not.

## 5. HUD and entry/exit scope

`FUN_001f7ff0` D:L56564-56600 chooses by local alive/dead/spectator and current viewed actor. Dead player viewing
self uses `FUN_001f97b0`; viewing another uses `FUN_001f9f20`; a spectator uses `FUN_001f9160`. The spectator
help names cycling players/fixed views, free motion and jump; the ELF strings at 0x3e30f0/0x3e3120/0x3e3150/
0x3e3180 were reread directly, including their embedded glyph bytes. The earlier spectator/dead split in research
91 §12 stands, independently of its reversed camera-mode labels.

The spectator path first calls the common HUD hide routine `FUN_001f77c0` (D:L56319-56359), then re-enables
selected groups except when the control-state byte is 3 (`FUN_001f9160`, D:L56873-56895). Other online groups receive
further common visibility writes at D:L56605-56629. **Do not infer that following an actor gives the spectator the full
living player's weapon HUD.** Exact group-to-widget mapping, final visibility for each control-state byte value,
target/scenic-name presentation, and screenshot alignment remain open; this is a dispatch reading, not a full HUD
render audit. Existing help timing reads 10 seconds then a 0.5-second fade, gated by its timer/alpha state
(D:L56541-56561), not an unconditional timer on every camera switch.

Death, lobby spectate, ghost, and replay are distinct entry conditions. Camera-mode controls require the spectator
flag; the dead/ghost cycle has its separate respawn gate (§2). Constructor/reset bytes and FREE at the
local-spectator binding points are known (§1), but the first rendered pose after lobby entry, the final ordering
of round resets and target selection, target departure/death
fallback, and return from teammate viewing to own body need their complete call chains or a later capture.
The port automatically advances from a missing/dead followed target (`spectatorView.ts:421-427,456-464`);
this reading does not certify that as the original's transition rule.

## 6. Confidence, captures, and handoff

The very high / high / medium scale below is the author's **prioritisation judgement** for each bounded claim,
not the repository's proven / reading / placeholder levels and **never proof of rendered parity**. The independent
whole-note review reread about 40 source citations, the disc tables, ELF constants and all port citations; the six
wording corrections await verification. Named unknowns and capture requirements remain open.

| finding | prioritisation judgement / reason | what could change the conclusion | capture before a scoped implementation? |
|---|---|---|---|
| F1 mode meanings and X transition | very high: setter, movement, orbit and state-base caller agree | wrong source/version pin; later code may change entry state, not these transitions | no for shared transition correction; capture still owed for entry pose |
| F2 local actor exception / next-order walk | very high predicate, high visible consequence: both directions and local getter agree | actor-list lifetime or a later target/entry rule | no for documenting predicate; yes before claiming own-corpse visual parity |
| F3 jump predicate/order gap | high: complete selector, headless port delta | original list may omit an otherwise eligible dead actor; ID/index mapping unresolved | yes for observed dead-target behavior; no to retain documented selector predicate |
| F4 follow approximation | high that current fixed triple omits dynamic rules | further camera stages may reduce a particular rest pose to the same triple | yes for camera parity; first finish transform/obstruction source chain |
| F5 scenic live look/zoom and range | high: shared update and explicit formula | processed-input routing/projection convention | no for formula; yes for final image and feel |
| F6 free-camera equivalence | medium: coefficient and clamps read, basis/input/cell semantics open | runtime basis initialization and input scaling | yes; do not infer a replacement speed from -300 alone |
| scenic fields/counts/wrap | very high: disc records, loader strings and consumer agree | another disc revision or map | no for data/wrap; capture rotation/picture convention |
| HUD dispatch and help | high source dispatch, medium final visible set | later frame visibility writes and menu state | yes for exact visible HUD |

The following probes are **uncommitted scripts in dot's local evidence folder, not repository files**.
`port-probe.cjs` imports the unchanged production spectator module and characterizes initial state,
scenic/X/X, dead-self cycle, dead jump candidate, and first scenic directions. `disc-probe.cjs` decodes the four
archives and records archive/mission/reader hashes; `elf-read.py` maps ELF program headers before reading constants
and strings. These are bounded evidence scripts, not substitutes for an original-game run or a newly approved lane.

Adopted by the controller at `a6c488548747a7d3b7054d720a514f4b40bb5870` on `agent/parity-audit`; the
playtest lane's PT-19b owns the shared mode correction. Research 91/179/232's superseded labels need re-filing
with their scope preserved. PT-19 (merged into the playtest lane at `696f03475`) has since resolved the two
handoff issues from the consulted PT-18 snapshot: W35.R8 gives replay Space to play/pause while live Space stays
next-target; the replay clock supplies animation `dtScale` (research 244 §3). PT-20/23 retain playback/HUD/acceptance
work. These are lane dispositions, not claims of original-game parity. Original capture
remains deferred until an agreed host window. No new numeric stand-in or `_READING` constant is introduced here;
unresolved items are named in words above.
