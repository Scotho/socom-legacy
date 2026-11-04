# 313 -- The climb check: the climb onto obstacles, the original's rules against the port's (NU-1)

- Date: 2026-10-13 (22:15Z). PARITY-2's next wave, row NU-1 of the
  [next-update checklist](../plans/2026-10-13-next-update-checklist.md) (NU.R1 "Climbing Check", NU.R2), read alone
  during the host hold ([brief](../plans/briefs/2026-10-13-nu1-climb-read.md)). Branch `agent/nu1-read` from
  `e9f9fd1e6`. The build -- RED first, room and page together -- is a later brief from this note (section 8).
- Status throughout: **reading, pending review.** Source inspection only: the decompilation and the game ELF's bytes
  were read, and the port's code was read. No game, emulator, capture, reader, test or browser was run (the host is under
  its memory floor; no node process at all). Nothing here is proven; nothing here is a measurement of the port either --
  where the port's behaviour is stated, it is read off its source, not run.
- Review: a fresh review returned PASS WITH FINDINGS (medium-high), seven findings F1-F7, folded here with the text
  they corrected kept beside ("was: ..."); status unchanged. Adding this note moved `docs/PROCESS.md`'s range of the
  web project's notes to 71-313 (in `4454417eb`), because `tools/test/placeholderLedger.test.ts:333-338` requires the
  range to end on the highest note.
- Built since (each row at **reading, pending review**): NU-1a (2026-10-14; B2, B4, B8, B9) and NU-1b (2026-10-17; B1, B3,
  B5, B6, B7 -- section 8.5; branch `agent/nu1b` from `bb690e9eb`). NU-1b's read (2026-10-17) re-filed B6 against this
  note's first text (section 5's grenade row, section 8.1 B6; the controller's ruling in the PARITY-2 Log) and found the
  offer's view-state gates (section 1.2); the room's halves of B1, B5 and B7 were drafted, cleared by the online seat and written (2026-10-17),
  the page's built. NU-1c (2026-10-17; B10, B11, B12 -- sections 8.6 and 8.7; branch `agent/nu1c` from `0faeea4dc`): the
  steer's worked trace, the pistol's sub-node re-read and the top's census first (section 8.6), then the build; no room hunk
  (the room runs the same `Traversal` through `MoverSim`). LATER 111 (2026-10-18; sections 8.8 and 8.9; branch
  `agent/l111` from `6d31b4800`): the top at the hit's column, the push's target on the cut at the hit's height, the
  obstacle ray's contact at its hit, with a census of the disc's 34 maps; no room hunk. LATER 115 (2026-10-19; section
  8.9; branch `agent/l115` from `9ec692439`): the column's frame read and measured on the disc's tilted climb faces,
  filed as a placeholder (a known difference from the reading), pinned by `climbFrame.disc.test.ts`; no build.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (SHA256 `B9E863762F08D556...AAA42D4`, the
  bytes research 230 and 251 pin; re-hashed for this note); the desktop pin `desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3`
  (`ref/desktop`). The ELF `game/disc/socom2_game.elf` (read only) for names and tables: its program headers (the
  fourth `PT_LOAD` maps file offset `0x2f7a80` to `0x4c5380`), the action-type name strings the runtime ids are made from
  (`FUN_005e1df0`, D:L495200-495336: `Step up` 0x661928 = `DAT_003dec80`, `Climb medium` 0x661940 = `DAT_003dec90`,
  `Climb over` 0x661968 = `DAT_003deca0`, `180` 0x6614c8, `dive_to_prone` 0x661fe8, `Fall forward` / `Fall backwards`
  0x660758 / 0x661f88, `Land forward` / `Land backwards` 0x661fa8 / 0x661fb8, `Stab` 0x6609a0, `CQB attack` 0x661d88,
  `Apply restraints` 0x660890, `Peek right toss` 0x6615c0, `Throw grenade` 0x660778), and the player controller's
  vtable at 0x6694b0 (+0xc `FUN_00594cf0`, +0x10 `FUN_00596f10`, +0x2c a stub returning 1, +0x30 and +0x34 stubs
  returning 0, +0x78 `FUN_00592d50`). The disc's clip fields only as the repository's readers already put them in the
  tree: the golden `packages/viewer/test/golden/motion-rdr.json` (`motionTableFromArchive`, extracted 2026-10-02:
  `NoInterrupt`, `BlendTime`, `playback`, the callbacks), research 86 section 1 (keys, roots, `refPt`) and research 230
  section 3.3's decode of `seal_climbcrate`'s flags (`UseVelY`, `NoTurn`, `NoFire`, re-checked by its review). No reader
  was run; where a value needs one it is named as owed (section 8.2).
- Built on: [research 86](86-traversal.md) section 3 (the climb's geometry, table, button, icon, steer, hang) and 8 (the
  states); [research 230](230-gameplay-feel-parity-audit.md) section 3.3 (a kit one-shot mid-climb, PB-7, with its two
  reviews); [research 251](251-the-effective-action-life-model.md) section 6 (PAR-30's F3, PAR-47's read) and 12.2
  (PAR-28's end 2) -- cited, not re-derived, except where this read contradicts them (section 9, history kept);
  [research 217](217-the-body-as-built.md) section 4.6 (the flinch gate); [research 218](218-the-permission-as-built.md)
  section 1 (`NoFire`'s consumer); [research 256](256-the-explosives-commit-rules-as-the-originals.md) section 5
  (`FUN_0059d830`); [research 281](281-mp6-scaffold.md) (the offer on a real face). The ladder is read only where it
  shares the climb's start (section 2.4).

## 0. Answers

| # | finding | port | section |
|---|---|---|---|
| R313.1 | **The reach test is the offer, and the press needs it.** The HUD's per-frame `FUN_00593500` sets the action mask's bit 2 ("CLIMB") from `FUN_0059d980` -> `FUN_005b3ce0` (D:L452277-452302); the Action's release climbs only when the HUD's selection holds that bit (`FUN_00592d50` D:L452064, D:L452182-452183). The offer wants the contact, the facing 0.3, the anim set's six climb types, `FUN_005b4340(actor, 2)` and no climb already playing; on the ground also the common gate `FUN_005a7de0(actor, 1, 0)` | the table, the facing and prone match; the offer's gates **built** by NU-1b (2026-10-17, section 8.1 B1, `CLIMB_OFFER_GATE_READING`; reading, pending review; the room's half written after the online seat's clearance) -- was: "the offer's other gates are missing (R313.6)" | 1 |
| R313.2 | **The height table is research 86's, read again**, with two additions: a crouched climb is pushed from the crouch (the base kept, the stance request written crouch, D:L446244-446274), and the prone branches of `FUN_00580b70` exist but the offer never reaches them for a player (`FUN_005b4340` code 2 refuses state 2, D:L469466-469467) | match, but the crouched climb ends standing in the port (R313.9) | 1, 6 |
| R313.3 | **The start is the Action button's release, on its own frame.** The release (slot 0 state 3, D:L453193-453200) calls the controller's +0x78 (`FUN_00592d50`, D:L453222 / D:L453243), which sets the controller's bit 0x4 (D:L452182-452183); the same frame's driver `FUN_00550ef0` sees it (D:L418121 or D:L418153 through `FUN_0057f2a0`) and calls `FUN_005b4b40` -> `FUN_005b2620` -> the push. The jump's press sets the same bit with the jump request, which `FUN_005b4b40` clears and returns (D:L469594-469596): a jump never climbs | match (the release's command, `traversalPage.ts` `padLanes`; the room on the same command) | 2 |
| R313.4 | **The clip runs from the press, the steer folded into it.** The climb is a one-shot on the stack (no climb clip is `BlendOverlay`), and its steer is the one-shot branch `FUN_005b3340` (D:L439017-439020): the turn up to 2 pi rad/s (D:L468862-468866), the position's remaining offset weighed by the phase's ease (`FUN_002874f0`, D:L468929). The 46 ticks, the 30-a-second axes and the abort past 30 are the looped branch's (`FUN_005b2d20`, D:L439024-439040) | **built** by NU-1c (2026-10-17, section 8.1 B10, `CLIMB_STEER_READING`; reading, pending review): the clip from the press, the body its track less the offset closed by the eased weight, the mount's law (`OneShotSteer`) -- was: "**differs**: the port aligns first (`climbAlign`, up to 46 ticks, frame 0 held) and plays the clip after" | 3 |
| R313.5 | **The stick or the turn cuts a climb past its `NoInterrupt`** -- the driver's ordinary cut (D:L418176-418203): step up 0.8, crate 0.9, medium 0.9, over 0.8, stand-to-hang 0.85, hang-to-climb 0.9 (the golden). The cut pops the climb and runs its end handler, so the body settles where the clip has carried it | **built** by NU-1a (2026-10-14, section 8.1 B2, `CLIMB_CUT_READING`; reading, pending review); was: "**differs**: the port's climb is never cut" | 4 |
| R313.6 | **What a climb refuses.** A stance press waits for its end (`FUN_00552ec0` D:L418927-418930), in the hang too -- the gate answers 0 in state 4 for every request (D:L418948-419015; the review, F1); an Action release in the hang does nothing (the review, F2); a jump is spent and refused; a weapon swap, a round and a grenade's release are refused by the climb's bare `NoFire` (`FUN_005a8cb0` D:L463159, `FUN_005c0ae0` D:L476442, `FUN_0059d830` D:L457365); a reload's clip is refused under a `UseVelY` top (`FUN_005b4340` code 3, D:L469517) and in the hang (D:L469460); the claymore's place is not refused (research 230 section 3.3). Before the climb, the offer itself is refused under a reload lock, a swap, a second-channel overlay, a throw, the knock's falls and landings, the launcher's or the turret's set | **built** by NU-1b (2026-10-17, section 8.1 B1, B3, B5, B6; reading, pending review; the room's halves of B1 and B5 written after the online seat's clearance, B6's room half already THROW-INTERRUPT's `'nofire'`); the grenade's row re-filed (section 5: the chase held under the climb, not the release refused); was: "**differs** on the stance (dropped), the reload and the throw (taken), and the offer's gates (none)" | 5 |
| R313.7 | **A hit mid-climb ends it.** `FUN_005a2690` pops the stack to its base under a one-shot top and pushes the flinch (D:L460011-460016); a knock's pop (`FUN_0058a4d0` D:L440997) runs the climb's end handler before the fall | the flinch **built** by NU-1b (2026-10-17, section 8.1 B7, `CLIMB_HIT_CANCELS_READING`; reading, pending review; the room's pop written after the online seat's clearance) -- was: "**differs**: the port draws the flinch over a climb that goes on (B7, open)"; the knock **built** by NU-1a (2026-10-14, section 8.1 B8, `CLIMB_KNOCK_SETTLE_READING`; reading, pending review): settled on the floor pick, then the fall. Was: "**differs**: the port draws the flinch over a climb that goes on; a knock releases the move and falls from mid-air with no settle" | 4 |
| R313.8 | **The end** is the one-shot's end test, the pop and the type's handler: the body set at its own x and z and the floor pick's y (`+0x2e4`, copied from `+0x404` each climb tick, D:L466784), the root's height 11.4 / 11.5 / 10.73 / 10.45 (D:L446582-446647); the ground state then takes the held stick unramped (D:L438704-438706) | the settle matches in kind; the ramp **built** by NU-1a (2026-10-14, section 8.1 B9, `CLIMB_RESUME_STICK_READING`; reading, pending review); was: "the settle matches in kind; **differs**: the port zeroes the stick's ramp (`Traversal.finish`)" | 6 |
| R313.9 | **A crouched SEAL's crate, medium or step-up climb ends crouched**; the hang (pushed over a pop to index 0, D:L446105) and the climb over (D:L442147-442163) end standing | **built** by NU-1a (2026-10-14, section 8.1 B4, `CLIMB_CROUCH_END_READING`; reading, pending review); was: "**differs**: the port stands every climber (`startClimb`)" | 6 |
| R313.10 | **The ladder's mount shares the press** (the same offer bit and the same `FUN_005b4b40`), against research 86 section 2.3's "no button" -- handed to the ladder's owner, not built by NU-1 | the port mounts on touch | 2.4, 9 |

## 1. The reach test

### 1.1 The contact and the facing (research 86 section 3.1-3.2, confirmed)

The wall the move solver last pushed against is the contact (`actor+0x1090`; `FUN_005483d0` via `FUN_005b0d30`, research 86
section 3.1); `FUN_005b3890` drops it past 24 across the ground, behind the face, or faced away (D:L468959-469015), and
with its second argument set drops it whatever (D:L468981-468982) -- the climb's start does that for every class but the
ladder (D:L469664-469665). The offer and the press each want the body's facing (the matrix's third row, horizontal)
against the contact's normal at 0.3 or more (`FUN_005b3ce0` D:L469243; `FUN_005b4b40` D:L469652), the ladder's 0.02
(`|dot|` for its short quad); the press also wants the direction from the contact to the actor at 0.3 (D:L469611). No
forward probe picks the wall; the only ray is the obstacle ray `FUN_0054e430` (D:L469246; research 86 section 3.3).

### 1.2 The offer (`FUN_005b3ce0`, D:L469088-469303)

Read whole for this note. For the contact's class (the polygon's appflags, research 86 section 0) it offers (returns 1)
when all hold:

1. the anim set `actor+0x528` has the types 0x21 (`Stand -> Hang`), 0x2c (`Stand -> Ladder`), 0x2e (`Climb off
   ladder`), `Climb medium`, 0x2a (`Climb crate`) and `Step up` (D:L469133-469158) -- the same six `FUN_005b2620` asks
   (D:L468322-468347);
2. `FUN_005b4340(actor, 2)` passes (D:L469160; section 1.3);
3. no climb plays already: the top is none of `Climb crate`, `Climb medium`, `Stand -> Hang`, `Climb over`, `Step up`,
   `Stand -> Ladder` (D:L469198-469210);
4. the facing (section 1.1);
5. by class: 1, 3 and 5 offer outright; 2 after the ladder's own facing and in-front tests (D:L469219-469242); 4 by
   the height of the obstacle ray's polygon (`h` = its top + the material's `FOOT_STEP_OFFSET` - the actor's y): at or
   under 5 it **offers** (D:L469263-469264),
   over 5 to 10 it climbs at once with no press -- `FUN_005b2620` from the offer, the contact dropped, nothing offered
   (D:L469266-469276) -- and over 10 it offers up to 32 (D:L469278-469281).

The HUD's `FUN_00593500` (every frame for the local player, D:L452227-452308) clears the mask and the selection
(D:L452239-452240) and sets bit 2 from this offer (`FUN_0059d980`: classes 3, 4, 1, 5; `FUN_0059da60`: class 2) in two
places: when the common gate `FUN_005a7de0(actor, 1, 0)` passes (D:L452296-452302), and when it does not but the body
is in the air or in a jump or landing clip (D:L452279-452290; the jump-grab's icon, research 86 section 3.4). On the
ground with the gate refused nothing is offered and the automatic step-up does not run. *NU-1b's read (2026-10-17):*
before either, `FUN_00593500` returns with nothing offered while the kit's view state (`actor+0x200`) is the binoculars
(4, `FUN_005b90f0` D:L452262) or a scope (over 4, `FUN_005b9990` D:L452259) -- the port's `Walker.scoped` (`./zoom`
`moveScale` under 1 from state 4) -- while `+0xee0` is over 0 (D:L452241) and while the controller's `+0x221` is
neither 0 nor 3 (D:L452244); the last two have no twin in the port (`CLIMB_OFFER_TIMER_READING`,
`CLIMB_OFFER_CONTROLLER_READING`, section 8.2, note only). This note's first text did not list them. The HUD's list is rebuilt from
the mask whenever the mask changes (`FUN_0021f850`, D:L73390-73395) and the selection `+0xed4` is `1 << id` of its
first entry (`FUN_00544c80` D:L411185-411189; D:L73399-73404).

### 1.3 `FUN_005b4340(actor, 2)`, the climb's condition (D:L469307-469475)

Refused (each a `return 0`): the actor's `+0xe1` bit 4 clear; dead (state 8, or a top whose `+0x2b` is 8); the knock's
falls and landings on top (`FUN_00588030`: `Fall forward` / `Fall backwards`; `FUN_00587fe0`: `Land forward` /
`Land backwards`; D:L469325-469326); `180` on top (D:L469327); on a ladder (state 5, or a top marked 5;
D:L469329-469330); `dive_to_prone` on top (D:L469334); carrying or carried (states 9, 10, `+0xeac`; D:L469409); a weapon
swap (`FUN_005a7980(actor, 1)`, D:L469412); **the reload lock** (`FUN_005a7ab0`, D:L469416: the kit's timer, a reload
or after-shot type anywhere on the stack, or the moving reload on the second channel -- research 251 section 12); `CQB
attack`, `Stab`, `Apply restraints` and their pistol twins on top (D:L469421-469452); `+0x1060` bit 4 (D:L469453);
the anim set `DAT_0044d3f8` (D:L469456); then, for code 2 itself, **prone** (state 2, D:L469467) and **the launcher's
set** (`DAT_0044d408`, research 179 section 11 / 217 section 4.4) or **the turret's** (`DAT_0044d410`, research 215)
(D:L469470-469474). Not refused by code 2: the air (codes 1, 3 and 4 test it -- code 4's, D:L469476-469490 -- code 2
does not), the hang (codes 3-8, D:L469460-469461), and an action that has not given way (code 1 alone asks
`FUN_00587c20`).

The common gate `FUN_005a7de0(actor, 1, 0)` on the ground (D:L462594-462705; research 218 section 1.2) refuses besides:
states other than 0, 1, 2, 3, 6; a throw or toss on top (`Throw grenade` and kin, `Peek right/left toss`,
D:L462622-462631); the reload lock (D:L462636); a swap (D:L462638); `Stab`, `Apply restraints`, `CQB attack`
(D:L462641-462671); state 9 (D:L462675); **any play on the second channel** (`actor+0x1e4`, D:L462681: the moving
reload, the moving swap); carrying (`+0xeac`, D:L462682). With its third argument 0 it reads no `NoFire`.

### 1.4 The height table and which clip each band picks

`FUN_00580b70` (D:L442174-442301) is research 86 section 3.3's table, re-read: `h` at or under 5 nothing; to 10 `Step up`;
to 12 `Climb crate` (0x2a); to 26.5 the crate/medium blend (`FUN_00581110`, D:L442306-442340: the crate at
`1 - (h - 12) / 14.5`); to 28 `Climb medium`; to 32 `Hang` then `Stand -> Hang` over it (0x22, 0x21, in state 4;
D:L442288-442293); over 32 nothing. Standing (state 0) and crouched (state 1) push the same clips with state 0
(D:L442225-442277). For prone (state 2) the function pushes a get-up to crouch instead (0x13 reversed, the stance request
1; D:L442219-442222, D:L442236-442239) and for 12 to 28 a crouch-get-up sequence -- but section 1.3 shows the offer
never lets a prone player press there; the branches serve another caller (the AI controller's, whose +0x30 answers
otherwise) and are not read further. `h` is measured from the actor's y whatever it is, so the air brings a ledge into
the table (the jump-grab, research 86 section 3.4). The ledge's height bands are literals; `dynamics.rdr`'s
`low/med/high_climb_height` have no reader (research 86 section 0).

**Class 5** (`Climb over`, `FUN_00580a80`, D:L442140-442169): no height test, refused only while `Climb over` already
plays (D:L442147), the stack popped to index 0 (D:L442152-442163) -- a crouched SEAL's crouch base goes with it.

### 1.5 The stance and the speed

Standing and crouched climb; prone does not (section 1.3). No speed test exists in the offer, the press or the push:
a run into a crate climbs as a walk does, the start zeroing the stick's axes and the velocity (D:L469667-469674).

## 2. The start command

### 2.1 The press and its frame

- **The button.** Action is Cross (`controller.rdr` Default, research 86 section 3.4). The player update `FUN_00594cf0`
  (the controller's vtable +0xc, ELF 0x6694bc) reads slot 0's state byte -- 1 the press, 2 held, 3 the release, as
  research 86 section 2.4 reads them (`FUN_002c64e0`, D:L166917-166931; D:L453193-453200). In the default layout
  (`FUN_002c63d0` false, D:L453191) the release calls +0x78, `FUN_00592d50` (D:L453221-453222); in the one-button
  layout the same release does (D:L453241-453243).
- **What the release does.** `FUN_00592d50` (D:L451971-452185): with the HUD's panel live (`+0xed8` set, D:L73329) it
  dispatches on the selection `+0xed4`; the climb's bit (4) sets `m_action_climb` (`+0x105e` bit 1, `FUN_005469e0`
  D:L412333-412337) and the controller's bit 0x4 at `+0x170` (D:L452182-452183). With the panel not live it sets the
  jump request (`+0x105e` bit 2, `FUN_005469c0`) and the same controller bit (D:L451992-451994) -- research 86 section
  3.7's "action with nothing offered". For a living local player the panel is live every frame (the HUD sets
  `+0xed8` = 1, D:L73316-73329), so that latch does not run for one; a release with nothing selected falls through the
  dispatch and does nothing (the review, F2). `m_action_climb` has no reader this read found (the patterns `<< 0x3e` and
  `& 0xfd` on `+0x105e`: only its setter and the actor initializer `FUN_00553ea0`'s reset, D:L419791).
- **A one-frame pulse, not a level.** The controller bit is cleared every frame the jump's slot is not in its press state
  (D:L453218-453219), by `FUN_00593500` when bits 0 or 1 are set (D:L452254-452255), and at `FUN_00592d50`'s exit
  (`LAB_005934a0`) whenever the selection lacks the climb's bit 4 (D:L452216-452217) -- which is what leaves a release
  with no climb selected without the bit, and so makes R313.1 true (the review, F2; was: the first two clears only);
  only four writers set it (D:L451994, D:L452183, D:L453215, D:L453235).
- **The driver, the same frame.** `FUN_00550ef0` (D:L418040-418240) runs after the player update (research 251 section
  12.5, PAR-74: the controller's tick before the driver). Under a looped top it calls `FUN_005b4b40` when no jump request
  is set and `FUN_0057f2a0` says the controller's bit is set (D:L418147-418155; `FUN_0057f2a0` D:L441293-441310 reads
  `+0x170` bit 2 because the player controller's +0x30 is a stub returning 0, ELF 0x5499d0). Under a one-shot top it calls
  it on the bit, unless no contact is held and the jump request is set, which goes to the jump instead (D:L418119-418133).
  In the hang it lets go (D:L418136-418139); on a ladder it asks the head (D:L418141-418146).
- **The start.** `FUN_005b4b40` (D:L469564-469680): a jump request is cleared and nothing else happens (D:L469594-469596);
  else, with a contact, in front and facing (section 1.1), the controller's +0x34 (a stub returning 0) lets it call
  `FUN_005b2620` (D:L469659-469662), then drop the contact (D:L469664-469665) and zero the stick's two axes
  (`+0x240`, `+0x244`), the velocity and the carried velocity `+0x1350` (D:L469667-469674). `FUN_005b2620`
  (D:L468292-468514) refuses states 9 and 10 (D:L468349), measures `h` (D:L468431-468432), dispatches by class
  (D:L468433-468502) and records the steer (`FUN_005b1a10`, D:L468504).

So the climb starts on the frame of the Action's release, provided the HUD's selection that frame holds the climb's bit.
Which frame's selection that is -- the HUD's pass before or after the player update -- is not read
(`CLIMB_OFFER_FRAME_READING`, section 8.2).

### 2.2 What the push does

`FUN_00580b70` pops the stack to index 0 standing, to index 1 otherwise (D:L442186-442214; research 251 section 12.2),
then pushes through `FUN_00588bc0` (D:L446055-446300), which for `Step up`, `Climb crate` and `Climb medium` pops again
the same way and, not standing, writes the stance request `actor+0x374` to 1 (crouch) (D:L446244-446274). The push's own
gate `FUN_00589900` (D:L446072, D:L446425-446473) refuses only over a top marked 8, online under `+0x1061` bit 5, over
the knock's falls and landings under `+0x1060` bit 4, or over `Slide` (research 251 section 12.6). No climb clip is a
`BlendOverlay` (research 251 section 12.6's list of the seven), so the clip goes on the stack (`FUN_0028dc90`,
D:L446292), never the second channel. The crate/medium blend is one play of two nodes (research 86 section 3.3).

### 2.3 The port, on the same command

The pad's lane and the keyboard's X fire `WalkMode.action()` on the **release** (`traversalPage.ts` `padLanes`, `bindKeys`);
the command carries `Button.Action`, which the room's `MoverSim.prepare` hands to the same `Traversal.action()`
(`net/moverSim.ts`). `Traversal.step` reads the press on that command's tick (`actionPressed`), refreshes the contact
and the plan (`keepContact`) and starts the climb when a plan exists (`startClimb`). Page and room run one `Traversal`
class through one `MoverSim`, so the start agrees on both ends. The release's frame matches the original's.

### 2.4 The ladder shares the start (for the ladder's owner)

`FUN_005b2620`'s class 2 (D:L468376-468482) makes the ladder's reservation, executed by `FUN_005b1c80` (research 86
section 2.3). Its only callers are `FUN_005b4b40` (D:L469662) and the offer's automatic step-up (class 4 only,
D:L469274), and `FUN_005b4b40` runs only on the frame of the controller's bit (section 2.1). The ladder is offered on
the same CLIMB bit (`FUN_0059da60` -> `FUN_005b3ce0(actor, 2)`, D:L452285-452289, D:L452300-452302). So by this read
**the ladder mounts on the Action's release**, not by walking into it -- against research 86 section 2.3 ("The
contact, no button ... `FUN_005b4b40` runs each tick"), which read the call without its gate. The port mounts on touch
(`Traversal.touchLadder`). Not NU-1's build; named `LADDER_PRESS_READING` for the ladder's owner (section 9).

## 3. The hold through the pull

- **The stack, a one-shot, no second channel** (section 2.2). `NoInterrupt` and `BlendTime` from the golden
  (`motion-rdr.json`): `seal_step_up` 0.8 and 0.27; `seal_climbcrate` 0.9; `seal_climb_medium` 0.9; `seal_climb_over`
  0.8; `seal_stand2hang` 0.85; `seal_hang2climbup` 0.9; `seal_hang_jumpdown` 0.8 -- the climbs' `BlendTime` absent, so
  the loader's 0.4 (research 251 section 12.6). The pistol's copies differ: `seal_p_climbcrate` and
  `seal_p_hang_jumpdown` have `NoInterrupt` 1 (never cut); no `seal_p_step_up` or `seal_p_climb_over` row exists.
  `FUN_0058c820` (D:L448155-448195) picks the push's type on the actor's `+0xf79` / `+0xf78` and the stack base's type,
  not on the weapon in hand; the pistol's version of a motion is a sub-node `FUN_0057a330` hangs under each node
  (D:L438760-438850), which the port models (`animator.ts:764-773`, `pistolOf`). So the open question is whether that
  sub-node is among the nodes `FUN_00587c20` loops over for `NoInterrupt`, the last node's answer deciding
  (D:L445551-445565) -- if it is, a pistol-holder's crate climb (`seal_p_climbcrate`, 1) is never cut
  (`PISTOL_CLIMB_CLIPS_READING`; the review, F3; was: "Which clip a pistol-holder plays is the anim set's map
  (`FUN_0058c820` -> `FUN_005e3d90`, D:L446077-446078), not read").
- **The root drives the body.** The top play alone advances (`FUN_0057a330`, research 230 section 3.3's review); the
  climbs are `UseVelY`, so the root's velocity is the actor's (`FUN_0028c250` D:L438910), the root held at most 11.487
  over the actor (`FUN_0059afd0` D:L456455-456460; research 86 section 3.5). Gravity is suspended while the current
  action is `Climb off ladder`, `Climb crate`, `Climb medium`, `Hang -> Climb`, `Step up` or `Climb ladder`, or in
  state 4: the physics y `+0x2e4` is the floor pick `+0x404` each tick and the airborne bit is cleared
  (`FUN_005af930` D:L466760-466787; research 230 section 3.3, decider 1). `Climb over` is not in that list; under it the
  fall is not integrated either (D:L466808-466809) -- what holds its height is its root (`CLIMB_OVER_FALL_READING`).
  The wall probes are skipped under a `UseVelY` top (`FUN_0054aa30` D:L415085-415087, research 230 section 3.3).
- **The steer** (R313.4). The steer record lives on the climb's play (`+0x78`); the one-shot branch is `FUN_005b3340`
  (D:L439017-439020; research 230 section 3.3's review corrected research 86 section 3.5's `FUN_005b2d20` here). Read
  for this note (D:L468761-468957): the turn to the record's facing at its angle over the frame's dt, clamped to 2 pi
  radians a second (D:L468862-468866), the short way by the cross product's sign; the position's remaining offset to
  where the turned `refPt` meets the target, scaled by the square root of the phase's ease (`FUN_002874f0`
  D:L131137-131148: `2p^2` to 0.5, `1 - 2(p - 1)^2` after; D:L468929-468931) and divided by dt into the play's velocity
  (D:L468943-468955); its vertical kept for the climbs, zeroed only for `Stand -> Ladder` and a reversed `Climb off
  ladder` (D:L468933-468941). It runs from the clip's first advance; there is no stop test, no tick limit and no abort
  on this branch -- the 0.993 / inside 1 / 46 ticks / past 30 are `FUN_005b2d20`'s, the looped branch's
  (D:L439024-439040). How the eased offset plays out frame by frame is not worked here (`CLIMB_STEER_READING`).
  *NU-1c (2026-10-17):* worked (section 8.6, the trace at Frostfire's 11.85 crate) and built (B10); the read adds that the
  actor moves by the clip root's velocity and the play's steer velocity together (`FUN_0054d9a0` D:L416455), so the body
  goes with its clip and the steer closes only the offset to the aligned start.
- **The stick and the turn.** The pad's axes are copied each frame (research 230 section 5.2.3, PAR-64) but no ground
  state runs under a one-shot top, so they move nothing; `seal_climbcrate` carries `NoTurn` (research 230 section
  3.3's decode); the other climb clips' `NoTurn` is unread -- the golden `motion-rdr.json` has no `NoTurn` column (the
  review, F6; was: "the climb clips carry `NoTurn`"). They count for the cut (section 4) and are copied into the ramp's last value every advance
  (D:L438704-438706).

**The port.** `startClimb` stands the mover (`w.stance = 'stand'`), ends the air, the action and the hold
(`setAirborne(false)` -> `endBody('replaced')`, `endHold('replaced')`), holds the yaw (`lock`) and enters `climbAlign`:
each tick the feet move toward the aligned start (`REF_AHEAD` back from the edge) at 30 a second an axis and the yaw at
4.712 rad/s, the clip held at frame 0, until inside 1 and facing 0.993 or 46 ticks; then `climbClip` lays a `ClipPath`
from where the feet are to the end target, with the vertical steer as `lift`, and `advance` carries the feet along it,
the velocities zeroed, no gravity, no walls. So the port's climb starts with up to 46 ticks the original does not have
(a contact 3.5-3.75 off the face against a start 8.92 back is about 5.2 units, about 11 ticks at 30 a second --
derived from the port's `TOUCH`, `REF_AHEAD` and `ALIGN_SPEED`), moving the body backwards before it rises; the original's clip begins on the press's next advance. The pull itself (rise,
travel, the lift's correction) is research 86's and research 230's port and is not re-judged here. (NU-1c, 2026-10-17:
the align is gone -- B10, section 8.7; the paragraph above is the port as read at `e9f9fd1e6`.)

## 4. What cuts it

| what | the original | the port |
|---|---|---|
| **the stick or the turn** | The driver's top-play block (D:L418172-418203): with the top the play it read before its work (D:L418176), `FUN_00587c20` past `NoInterrupt` (phase, research 230 section 3.3's review; D:L445549-445565) and the top not marked 8, a move axis or the turn past 0.1 (D:L418182-418185) cuts: `FUN_005870e0` pops one (D:L418203) and `FUN_00589aa0` runs the type's end handler (section 6). Cut times on the one-shot clock `t / (playback x (n - 1) / n) > NoInterrupt`, before the push's skip and the lag PAR-61/67 add (derived): step up 0.554 s of 0.639; crate 1.088 of 1.168; medium 1.308 of 1.408; over 0.758 of 0.898; stand-to-hang 1.142 of 1.290 (the cut reveals `Hang`); hang-to-climb 2.480 of 2.712 | NU-1a (2026-10-14, B2): cut on the first command past the clip's `NoInterrupt` with the stick or the turn past 0.1 (`Traversal.advance`, `CLIMB_CUT_READING`), settled on the floor pick, the walk taking the cut's tick; "Stand -> Hang" cut into the hang; room and page on the one `MoverSim`. Was: "never: `Traversal.step` runs `advance` to the path's end whatever the stick (`traversal.ts`), page and room" |
| **a hit (non-lethal)** | `FUN_005a2690` (D:L460002-460016): under a one-shot top, alive, not marked 8, not on a turret, it pops to the base (`FUN_0058a4d0`, so the climb's end handler runs) and pushes the flinch in the current state. Not refused by the climb: research 217 section 4.6 | NU-1b (2026-10-17, B7): the flinch taken pops the climb -- `Traversal.flinchPop`: the crate, the medium, the step-up, the climb over and `Hang -> Climb` settled on the floor pick, `Stand -> Hang` handed to the fall -- and plays alone; `flinchRefused` no longer refuses `seal_stand2hang` and `seal_hang2climbup` (the hang's loop still refused, section 8.3; NU-1b's review F3: the jump down taken and popped, looped 0 (was: "the hang's loop and its jump down still refused")); the page's pop in `WalkMode.setFlinchPose`, the room's in `Room.flinch`. Was: "the flinch is allowed over a climb (`deaths.ts` `flinchRefused`: only clips naming `ladder` or `hang` refuse) but drawn over it; the climb goes on, the room's and the page's mover untouched" |
| **a knock** | `FUN_0057e770` pops the stack (`FUN_0058a4d0`, D:L440997), each pop running `FUN_00589aa0`: the climb's settle (y to `+0x2e4`) before the fall is laid | NU-1a (2026-10-14, B8): `applyKnock` (`net/blast.ts`) asks `Traversal.popSettle` first -- a running climb clip but `Stand -> Hang` settles on the floor pick -- then `releaseMove` and the fall from there; room (`Room.layKnock`) and page (`WalkMode.knock`) alike. Was: "`releaseMove` (`net/blast.ts`): the move reset and the mover airborne from where it is, no settle; room and page alike" |
| **a death** | the death's state 8 drops a hang or a ladder (`FUN_005af590` -> `FUN_005a5da0`, research 86 section 8); whether the death's push pops a climb's play (and so its settle) is not read | `WalkMode.setDead` / `Room.kill`: the move reset, the corpse falls (`KNOCK_LETHAL_IN_MOVE_READING`) |
| **a stance press** | never cuts: it waits (section 5) | dropped (section 5) |
| **a fall** | none during a climb: gravity is suspended (section 3); the air cannot begin under the climb | none |
| **the jump** | never (section 5) | never |

## 5. What a climb refuses

| press | the original, while a climb plays | dropped or kept | the port |
|---|---|---|---|
| **jump** | `FUN_00550ef0`'s one-shot branch: no contact (dropped at the start), the request set -> cleared and `FUN_0057e1b0` refuses under the one-shot (D:L418121-418130, D:L440805-440810; research 251 section 6, F3). The hang lets go (D:L418136-418139) | spent | `WalkMode.jump` / `MoverSim.jump`: busy -> `Traversal.jump` false except hanging. **Matches** |
| **stance** | the press writes the request `+0x374`; `FUN_00552d60` asks `FUN_00552ec0` each frame, which refuses under a non-looped top that is no stance transition (D:L418875, D:L418927-418930): **the request waits and is taken when the climb ends** (research 251 R251.2). **In the hang it waits too** (the review, F1): `FUN_00552ec0` returns 0 in state 4 for every request -- prone wants state 0 or 1 (D:L418948-418949), crouch 0 or 2 (D:L418976-418992), stand 1 or 2 (D:L418999-419012), else 0 (D:L419015) -- so `FUN_00552d60` never reaches `FUN_00581ed0` for a hanging player; that function's other caller is an AI's random pick (`FUN_005fe880` D:L510414-510420), and the hang's own tick `FUN_00584390` (D:L443782-443834) reads no stance. The request appears to wait until the hang ends; research 86 section 3.7 read the call without its gate (was: "In the hang (a looped top) it goes to `FUN_00581ed0`: stand climbs, crouch or prone let go (research 86 section 3.7). A press made during `Stand -> Hang` waits for the hang and is taken there") | kept | NU-1b (2026-10-17, B3): `Traversal.stanceButton` under a climb's one-shot (the align, the clip, `Hang -> Climb`) writes the mover's request (`Walker.changeStance`), kept while `TickDriver.topOneShot` answers for the climb and asked from the tick after its end; a crouched SEAL's push writes it crouch. `Stand -> Hang` and the hang unchanged (D16, the hang's owner). Was: "`WalkMode.setStance` / `MoverSim.stance`: busy -> `Traversal.stanceButton`, false unless hanging: **dropped**, no pending request (`Walker.bodyOwner` has no climb). Hanging, the port climbs on stand and lets go on crouch or prone (`traversal.ts:473-476`): D16. **Differs**" |
| **weapon swap** | `FUN_005a8cb0` (from the press, D:L453290, D:L453302) asks `FUN_005a7de0(actor, 1, 1)` (D:L463159), which reads the climb's bare `NoFire` (`FUN_0058a8c0`, research 218 section 1.2): refused | dropped | `MoverSim.prepare` (`!m.busy()`), `WalkMode.swapGate` (`moves.busy()`): refused. **Matches** |
| **fire** | `FUN_005c0ae0` -> `FUN_005a7de0(actor, 1, uVar8)` (D:L476442; research 218): refused through the bare `NoFire`; `uVar8` is 0 for item kinds 0x79 and 0x97 (D:L476376-476378), so `NoFire` is not read for those two kinds (the review, F4; was: "`FUN_005a7de0(actor, 1, 1)`") | the trigger is a level: a round when it opens | `fireCapability` reads the move's clip (`Traversal.clip`, frame 0 during the align); the room's `'nofire'`. **Matches** |
| **reload** | the press starts the kit's timer if no lock (D:L453460-453463); when it runs out `FUN_005c2a90` is asked once and the timer zeroed (D:L476550-476560), and `FUN_005c2a90` refuses on `FUN_005b4340(actor, 3)` (D:L477404) under a `UseVelY` top (`FUN_0057b510`, D:L469517-469520) or in the hang (D:L469460-469461): no clip, no magazine taken | dropped (a timer that outlives the climb is asked after it) | NU-1b (2026-10-17, B5): the page's `Fire` refuses the start under a climb's clip or the hang (`FireSource.climbHolds`, `WalkMode.climbHolds`), the timer spent; the room's reload (its frame's motion). Was: "the page's `Fire.reload` and the room's reload take it (`room.ts` reload: airborne, flinch, cover and lock only); a still crouched reload's hold is accepted (`Walker.hold`) and frozen under the move. **Differs**" |
| **grenade** | NU-1b's read (2026-10-17; the controller's ruling): the controller chases the power and asks the release only while `FUN_0059d830` answers (`FUN_00594cf0` D:L453478-453480; the ask `FUN_005dfe30(actor, 1)` D:L453520 -- its first argument the actor `piVar1`, not the controller (NU-1b's review; was: "`FUN_005dfe30(ctrl, 1)`")), and `FUN_0059d830` asks `FUN_005a7de0(actor, 1, 1)` (D:L457365), which the climb's bare `NoFire` refuses: **the wind-up is held, its power frozen, no release asked**; at the climb's end the chase runs and a button let go asks the release at once, at the frozen power -- the air's case read by PAR-86 (research 251 section 12.8). The release request's own refusal (D:L475491-475498: no clip, nothing spent, the power zeroed) meets one case: a release asked on the frame the climb is pushed (the driver's, after the controller's update). Was: "the release request asks `FUN_0059d830` (research 256 section 5), which asks `FUN_005a7de0(actor, 1, 1)` (D:L457365): the climb's `NoFire` refuses -- no clip, nothing spent, the power zeroed (research 256 section 1)" | held (was: dropped) | NU-1b (2026-10-17, B6): `grenade.ts` holds the chase under a climb's clip as the last update left the body (`climbBefore`, beside PAR-86's `airborneBefore`) and refuses the release request under it; the room's throw already refused it (`room.ts` `takeThrowStart`'s `'nofire'`, the frame's `fire`, THROW-INTERRUPT). Was: "accepted: `grenade.ts` / `matchThrow.ts` have no move test (research 230 section 3.3); the room's throw checks no motion. **Differs**" |
| **claymore / place** | accepted: phase test 0 skips `NoFire` (research 230 section 3.3) -- PB-7's case, open | -- | accepted, but the climb keeps the tick (PB-7 (b2), unbuilt) |
| **lean (peek)** | `FUN_005b4340(actor, 1)` wants the top to give way (`FUN_00587c20`): refused until the climb's `NoInterrupt`; past it, what `FUN_0057d810` does to the climb under the lean is not read | -- | the lean is not read while a move runs (`leanTick` after the move's cases): held off to the climb's end. Within a climb's last tenth at most; named `CLIMB_PEEK_READING` |
| **Action (again)** | the contact was dropped at the start and the wall probes are off: the press finds no climb (D:L469599-469600) | dropped | consumed, nothing done. **Matches** during the climb. **In the hang it differs** (the review, F2): the original's no-offer latch (D:L451992-451994) runs only with the HUD's panel not live, and a living local player's panel is live every frame (D:L73316-73329); in the hang the offer gives nothing (the common gate refuses state 4, D:L462612; the air bit is cleared, D:L466782-466787), so the selection is 0, the release does nothing and the exit clears the bit (D:L452216-452217) -- the original does not let go on Action; the port does (`traversal.ts:965`, `pressed` -> `hangDown`): D17 (was: "consumed, nothing done (the hang lets go on it, as the original's no-offer latch). **Matches**") |

**Before the climb: the offer's refusals** (section 1.3). The original offers no climb (and no ladder) while: a reload's
timer, still clip or moving overlay holds the lock; a swap; any second-channel play on the ground; a throw or a toss on
top; the knock's falls and landings; `180`, `dive_to_prone`, a ladder; `Stab`, `CQB attack`, `Apply restraints`;
carrying; the launcher's or the turret's anim set; prone. *NU-1b (2026-10-17, B1):* the port's offer asks them through
`climbOffered` (`Traversal.keepContact`) -- with the binoculars and the scope (section 1.2) -- and `Walker.climbLock` for
the parts the mover does not carry (the page's from its still clip, the firearm's lock, the launcher's set and the
turret's; the room's in `watchMoves`); the port has no carrying. Was: "The port's `planClimb` refuses prone only (and the dance,
`Traversal.step`); `startClimb` then ends whatever runs."

## 6. The mantle's end

- **The end test.** An uncut climb ends on the driver's end test (`FUN_00582540`, D:L442907-443160): no climb type has a
  case of its own; with the play's callback `+0x64` clear the end pops (D:L443131-443132). On which frame relative to the
  last key is research 251 section 12.5's clock (the push's initial skip, PAR-61; the end test's lag, PAR-69, PAR-80):
  the climb is pushed inside the driver before its top-play block (D:L418132, D:L418155 before D:L418172), as the swap
  is before it -- `CLIMB_END_FRAME_READING`.
- **The pop and the handler.** `FUN_005870e0` pops one (research 230 section 3.3); `FUN_00589aa0` (D:L446479-446660)
  takes the action current before the pop (D:L446501) and, for `Climb crate` (D:L446582-446597), `Climb medium`
  (D:L446599-446614), `Hang -> Climb` (D:L446616-446631) and `Step up` (D:L446633-446648), sets the actor at its own x and
  z and the y `+0x2e4` (the floor pick, section 3) and the root node's y to 11.4, 11.5, 10.73 and 10.45 (0x41366666,
  0x41380000, 0x412bae14, 0x41273333). For `Climb over` (D:L446538-446542) it records `+0xfac` = the actor's y + the
  root's, sets `+0x1060` bit 1 and `+0x2e4` from `+0x404`: the body is handed to the fall from there
  (`CLIMB_OVER_FALL_READING`, not followed further). A cut runs the same handler at the cut's phase.
- **The pose and the next state.** The revealed entry is the base the start kept: **standing after a standing climb;
  the crouch kind after a crouched step-up, crate or medium climb** (the pops to index 1, D:L442201-442214,
  D:L446246-446274), so the SEAL is crouched again, the request already crouch; the hang's pushes pop to index 0
  (`Hang`, D:L446105; `Hang -> Climb`, D:L446199) and the climb over does (D:L442152-442163), so those end standing. The
  pop writes the state from the revealed entry (research 86 section 4.1, D:L135104) and the ground state picks the
  locomotion for the stick (research 251 section 12.6, D:L445160-445169), the ramp starting from the held stick
  (D:L438704-438706; the ramp that reads the copied stick is `FUN_00586c10`, D:L444985-445010, its last value
  `+0x248` / `+0x24c`): a SEAL holding forward walks on at once.
- **The pending stance** (section 5) is asked from the next frame on the revealed base.
- **A live one-shot under it.** None survives the start: the start pops the stack (research 251 section 12.2, PAR-47);
  the second channel is left (ibid.). And by section 1.3 no reload clip can be on the stack when a climb is offered
  (the reload lock refuses the offer), so the pop's end of a still reload (research 251 sections 6 and 12.2) is not
  reached by a player's climb -- section 9.

**The port.** `endClimb` -> `finish`: the move cleared, the stick's ramp zeroed (`stickForward = 0`, `stickRight = 0`),
the air cleared, `settle()`; the feet are where the `ClipPath` ends (`topFloor(...) ?? c.top` on top, the clip's travel
ahead), the stance standing. The climb over ends on `floorUnder` at most `stepHeight` over the start, with no fall.
(NU-1a, 2026-10-14: the ramp is now kept at the stick each climb advance copies (B9), and a crouched step-up, crate
or medium climber ends crouched (B4); the paragraph above is the port as read at `e9f9fd1e6`.)

## 7. The port, against the read

All rows are the shared `Traversal` / `Walker` code unless marked; "both" means the page's prediction and the room's
`MoverSim` run the same lines on the same command, so they agree with each other and differ from the original together.

| # | difference | command | room / page |
|---|---|---|---|
| D1 | The climb is offered and started under the reload lock (a still clip, a timer, a moving overlay), a swap, a throw on top, any second-channel play, the knock's falls and landings, carrying, the launcher's or the turret's set: `planClimb` asks none of section 1.3's gates (the original's offer refuses each). PAR-28's end 2 then ends the reload the original would have kept (built by NU-1b, 2026-10-17: B1; the room's half written after the online seat's clearance) | the Action's release | both (the plan); the reload's end is the room's `endStillReload` and the page's `reloadPopped` |
| D2 | The align before the clip: up to 46 ticks at 30 a second an axis and 4.712 rad/s, the clip held at frame 0, the body moved back from the face; the original's clip runs from the press with `FUN_005b3340`'s eased steer and a 2 pi rad/s turn (built by NU-1c, 2026-10-17: B10) | the release and the ~11 ticks after | both |
| D3 | No cut: the stick or the turn past 0.1 never ends a climb past its `NoInterrupt` (built by NU-1a, 2026-10-14: B2) | each command past phase 0.8-0.9 with the stick held | both |
| D4 | A stance press during a climb (and during `Stand -> Hang`) is dropped, not kept pending to the climb's end or the hang (built by NU-1b, 2026-10-17: B3, the climb's half; `Stand -> Hang` and the hang the hang's owner's, D16) | the stance press | both |
| D5 | A crouched climber is stood (`startClimb`) and ends standing; the original ends a crouched step-up, crate or medium climb crouched (built by NU-1a, 2026-10-14: B4) | the release; the end | both |
| D6 | A reload pressed during a climb (or the hang) is taken: the magazine refills on the page's clock, the room accepts it (built by NU-1b, 2026-10-17: B5, the page; the room's in `watchMoves`) | the reload's command | page (`Fire`) and room (`room.ts` reload) apart |
| D7 | A grenade released during a climb is thrown; the original holds the wind-up through the climb and throws at its end (re-filed by NU-1b's read; built by NU-1b, 2026-10-17: B6, the page; the room's `'nofire'` already) | the release request | page (`grenade.ts`, `matchThrow.ts`) and room (`room.ts` throw) apart |
| D8 | A non-lethal hit mid-climb (the step-up, crate, medium and climb over) draws a flinch over a climb that continues; over `seal_stand2hang` and `seal_hang2climbup` the port drops the flinch outright (`net/deaths.ts:197-198` refuses any clip naming `hang`). The original's flinch pops all of these one-shots (its settle) and plays alone (D:L460011-460019) (the review, F5; was: "A non-lethal hit mid-climb draws a flinch over a climb that continues ...", the hang's two clips not split out) | the hit's event (built by NU-1b, 2026-10-17: B7, the page and `flinchRefused`; the room's pop written after the online seat's clearance) | both (`flinchRefused`, the mover); the room's flinch window too |
| D9 | A knock mid-climb falls from mid-air; the original settles the climb first (y to the floor pick) (built by NU-1a, 2026-10-14: B8) | the knock | both (`applyKnock` -> `releaseMove`) |
| D10 | The climb's end zeroes the stick's ramp; the original resumes at the held stick (built by NU-1a, 2026-10-14: B9) | the end's command and the next | both |
| D11 | Open, not yet a difference: the port draws the pistol's version as a per-node sub-node (`animator.ts:764-773`), as `FUN_0057a330` hangs it (D:L438760-438850); whether that sub-node is among the nodes `FUN_00587c20` reads for `NoInterrupt` (the last deciding, D:L445551-445565) decides whether a pistol-holder's crate climb (`seal_p_climbcrate`, 1) is ever cut -- it matters with D3 (the review, F3; was: "The port's climb plays the rifle's clips with any weapon; the pistol's anim set maps its own"). *NU-1c's re-read (2026-10-17, section 8.6):* it is -- a difference while the port read the rifle's; built by NU-1c: B11 | the cut's commands | both |
| D12 | `topFloor` (a floor within 1.5 of the top, 4 past the edge) is a port gate with no original counterpart: the original offers and climbs a face whose top has no floor, and settles on the floor pick (dropped by NU-1c, 2026-10-17: B12, its census in section 8.6) | the offer | both |
| D13 | The automatic step-up (class 4, 5 < h <= 10) needs the stick pushing into the face (`pushing`); the original's runs from the offer with the contact held and faced, no stick test (D:L469266-469276) (dropped by NU-1c, 2026-10-17: B12) | each tick at such a face | both |
| D14 | The class-4 offer at h <= 5 (the original shows CLIMB; its press records a steer and pushes no clip, D:L468492-468504) is absent from the port | the offer | both (a quirk: section 8.3) |
| D15 | The ladder mounts on touch; by section 2.4 the original's mounts on the Action's release | walking into the rungs | both (the ladder's owner) |
| D16 | Hanging, a stance press climbs (stand) or lets go (crouch, prone) at once (`traversal.ts:473-476`); the original's gate refuses every request in state 4, so it waits until the hang ends (section 5; the review, F1) | the stance press in the hang | both (the hang's owner, outside NU-1) |
| D17 | Hanging, an Action release lets go (`traversal.ts:965`, `pressed` -> `hangDown`); the original's does nothing (section 5; the review, F2) | the Action's release in the hang | both (the hang's owner, outside NU-1) |

The contact itself is **built** (2026-10-16, PB-3b; research 281 §4.1-§4.3): the climb's contact from the walk's own
wall hit, and the climb faces one-sided. (Was: "the port's proximity `touchClimbable` against the move solver's hit,
and the port's two-sided `contactOf` against `FUN_005b3890`'s one side ... already with PAR-21; not repeated as a
row".) The four rules PB-3b named and did not build are research 281 §4.1 / §4.3's.

## 8. The build list

### 8.1 Rows for the build brief (RED first; room and page on the same command)

| row | change | room / page | the test that shows it (RED first) |
|---|---|---|---|
| B1 (D1) | **Built 2026-10-17 (NU-1b; reading, pending review; the room's half written after the online seat's clearance)**: `climbOffered(walker)` in `Traversal.keepContact` -- the binoculars and the scope (`Walker.scoped`, section 1.2), dead, the knock's falls and landings, a swap, a still clip's hold, `Walker.climbLock` (the page's: the standing still clip, `Fire.reloadLocked`, the launcher's set, the turret's; the room's in `watchMoves`: `reloadUntil`, `launcherSet`, `mounted`) in the air and on the ground; a throw on top and the second channel on the ground only; section 8.5's `CLIMB_OFFER_GATE_READING`. Was the row's text: `planClimb`'s offer asks the original's gates: the reload lock, a swap, a second-channel overlay, a throw or toss on top, the knock's falls and landings, carrying, the launcher's and the turret's sets, `180` and `dive_to_prone` -- one predicate (`climbOffered(walker, ...)`) on the mover so the room and the page answer alike, **keeping the ground/air split**: the common gate's refusals (a second-channel play, a throw or toss on top, the reload lock as the gate asks it) apply on the ground only, while in the air or a jump or landing clip the offer runs without the gate (D:L452277-452290, section 1.2), or a jump-grab is refused wrongly; `FUN_005b4340(actor, 2)`'s refusals apply in both (the review, F7); PAR-28's end-2 pop wiring kept (the source's pop is real), now reached only by a case the offer allows | both | `traversal.test.ts`: a crouched still reload's hold, then Cross at Frostfire's crate -- RED: the climb starts; GREEN: no plan, the hold runs on; a moving reload's overlay the same; the room twin in `roomStillReloadJump.test.ts` ("the climb is not offered under a still clip") |
| B2 (D3) | **Built 2026-10-14 (NU-1a; reading, pending review)**: `Traversal.advance` asks the cut before its advance (`climbCut`, `CLIMB_NO_INTERRUPT`, `Walker.stickCut`); the cut settles the body on the floor pick (`climbSettle`) and runs `endClimb`, the walk taking the same tick; `Stand -> Hang` cut reveals the hang where the clip has the body; section 8.4's `CLIMB_CUT_READING` and `PISTOL_CLIMB_CLIPS_READING`. As written: The cut: a climb's run (`Traversal.advance`) ends at the first command whose stick or turn passes 0.1 past the clip's `NoInterrupt` (phase, `NOFIRE_PHASE_READING`'s clock, the lag of `Walker.holdCut`), running the end (`endClimb`); `Stand -> Hang` cut into the hang | both | `traversal.test.ts`: a crate climb with the stick held forward -- RED: the climb ends at the path's end (1.168 s); GREEN: it ends on the command past phase 0.9 (with the push's skip), the feet short of the full travel; the stick at rest unchanged; a `MoverSim` twin |
| B3 (D4) | **Built 2026-10-17 (NU-1b; reading, pending review)**: `Traversal.stanceButton` under the climb's one-shot writes `Walker.changeStance`'s request, `topOneShot` answers for the climb (the body's owner `move`), the end keeps the request (`Walker.requestStance`) and a crouched push writes it crouch; `Stand -> Hang` and the hang unchanged; room and page on the one `MoverSim` (no room hunk); section 8.5's `CLIMB_PENDING_STANCE_READING`. Was the row's text: A stance press during a climb (not the hang) becomes the mover's pending request (`changeStance`), refused by the body's owner while the climb's one-shot runs (`TickDriver.topOneShot` true for a running climb, not for the looped hang or ladder) and taken at the end. The hang's half (a press during `Stand -> Hang` or the hang): **re-read first** -- by section 5 the request waits through the hang too (D16), so no hang behaviour is built from this row until the hang's owner re-reads it (the review, F1; was: "during `Stand -> Hang`, taken by the hang's `stanceButton` when it begins") | both | `traversal.test.ts`: crouch pressed mid-climb -- RED: standing after the climb; GREEN: the crouch transition after the end (was also: "a press during `Stand -> Hang` lets go at the hang") |
| B4 (D5) | **Built 2026-10-14 (NU-1a; reading, pending review)**: `startClimb` keeps whether the SEAL was crouched and stands it for the clip (state 0); `endClimb`, cut or not, sets the crouch back (`w.stance`, the request with it, no transition) for `CLIMB_CROUCH_END_READING`'s step-up, crate and medium; the hang and the climb over stand; section 8.4. As written: A crouched climber keeps the crouch: the step-up, crate and medium climbs end crouched (the request crouch); the hang and the climb over end standing | both | `traversal.test.ts`: a crouched SEAL at a 12 crate -- RED: `stance` stand at the end; GREEN: crouch; the hang's case stands |
| B5 (D6) | **Built 2026-10-17 (NU-1b; reading, pending review; the room's half written after the online seat's clearance)**: `Fire`'s start asks `FireSource.climbHolds` (`WalkMode.climbHolds`, `climbHoldsBody` of the move's clip), the timer spent; the room's reload by its frame's motion; section 8.5's `CLIMB_RELOAD_REFUSED_READING`. Was the row's text: A reload's clip start refused while a climb's `UseVelY` clip or the hang holds the body, the press's timer spent: `Fire.reload` asks the walk, the room's reload asks the mover's move | page and room apart, one predicate | `fire.test.ts` / `roomReloadLock.test.ts`: R mid-climb -- RED: the magazine refills; GREEN: refused, the magazine kept, nothing sent; the R after the climb taken |
| B6 (D7) | **Re-filed and built 2026-10-17 (NU-1b; reading, pending review)**: the chase held under a climb's clip (`FUN_0059d830` gating `FUN_00594cf0` D:L453478-453480; section 5): the wind-up's power frozen, no release asked, the release at the climb's end at the frozen power; the release request's refusal kept for a release asked on the climb's first frame (D:L475491-475498); `grenade.ts` `climbBefore` beside PAR-86's `airborneBefore`; the room's half is THROW-INTERRUPT's `takeThrowStart` `'nofire'` (no hunk); the claymore's placing unchanged (#96, pinned); section 8.5's `CLIMB_THROW_REFUSED_READING`. Was: "A grenade's release request refused while a climb's clip plays (`NoFire` bare on the top, as `FUN_0059d830` asks): nothing spent, the power zeroed (research 256's refusal)", its test "a release mid-climb -- RED: thrown; GREEN: refused, the count kept" | page (`grenade.ts`); the room's `'nofire'` already (was: page and room (`room.ts` throw: the frame's motion, as `'nofire'`)) | `grenade.test.ts` "NU-1b B6": held through a climb -- RED: the power chased and the grenade thrown mid-climb; GREEN: the power frozen, thrown at the climb's end; released on the climb's first update -- RED: thrown; GREEN: refused, nothing spent; the claymore's placing pinned |
| B7 (D8) | **Built 2026-10-17 (NU-1b; reading, pending review; the room's pop written after the online seat's clearance)**: `Traversal.flinchPop` (the page's `WalkMode.setFlinchPose`; the room's `Room.flinch`), `flinchRefused` taking `seal_stand2hang` and `seal_hang2climbup`; section 8.5's `CLIMB_HIT_CANCELS_READING`. Was the row's text: A non-lethal flinch over a running climb ends the climb (the end's settle) and plays alone; the room's flinch window then holds as on the floor. The two hang one-shots too: over `seal_stand2hang` and `seal_hang2climbup` the flinch is taken (no longer refused by the `hang` name) and pops them (the review, F5) | both | `traversal.test.ts` + the room's flinch test: a hit at phase 0.5 -- RED: the climb ends on top; GREEN: settled at the floor pick, the flinch playing; the same over `Stand -> Hang` -- RED: no flinch; GREEN: the flinch, the hang popped |
| B8 (D9) | **Built 2026-10-14 (NU-1a; reading, pending review)**, `net/blast.ts` added to its files by the gameplay controller: `applyKnock` asks `KnockMoves.popSettle` (`Traversal.popSettle`) before `releaseMove` -- a running crate, medium, step-up, climb-over or `Hang -> Climb` clip settles on the floor pick (`climbSettle`); `Stand -> Hang` (no case in `FUN_00589aa0`), the hang and the dive settle nothing; the ladder's 0x2c / 0x2e cases (D:L446544-446576) are not read for the knock (PF-19's `KNOCK_LADDER_STATE_READING` holds them); the port's ladder knock is unchanged (F1 of NU-1a's review, 2026-10-14; was: "the hang, the ladder and the dive settle nothing"); section 8.4's `CLIMB_KNOCK_SETTLE_READING`. **In `applyKnock`, not `releaseMove`** (the controller's ruling): `Room.kill`'s death shares `releaseMove`, and whether the death's push pops a climb and so settles it is not read (section 4), so the death's path is left unchanged on no reading. RED: a blast at phase 0.5 of a 12 crate climb laid the fall from y 6.246 over a floor pick of 0 (viewer `knock.test.ts`, and the room's `Room.layKnock` in `roomClimb.test.ts`). Was: "**Not built by NU-1a (2026-10-14)**: the knock's path is `net/blast.ts` ... the hunk is with the gameplay controller"; as the brief wrote it: "Build it in `releaseMove`, for both room and page". As written: A knock mid-climb settles first (y to the climb's floor pick) and falls from there | both (`applyKnock`; was: `releaseMove`) | `knock.test.ts`: a blast at phase 0.5 -- RED: the fall from mid-air y; GREEN: from the settled y |
| B9 (D10) | **Built 2026-10-14 (NU-1a; reading, pending review)**: each climb advance (`Traversal.advance`, the `climb` and `hangUp` clips) copies the tick's stick (`Walker.cutStick`) into the ramp, and `endClimb` keeps it (`finish`'s `keepStick`); the ladder's ends still zero it; section 8.4's `CLIMB_RESUME_STICK_READING`. As written: The climb's end keeps the stick's ramp at the held stick (the copy D:L438704-438706, read by the ramp `FUN_00586c10` D:L444985-445010) | both | `traversal.test.ts`: the stick held through a climb -- RED: the first walking command after the end at a ramped speed; GREEN: the held stick's |
| B10 (D2) | **Built 2026-10-17 (NU-1c; reading, pending review)**, after the worked trace (section 8.6): `Traversal.startClimb` pushes the clip on the press's command (`climbClip` from the aligned start, `CLIMB_STEER_READING`), each advance turns the body by `seatTurn` and closes `steerWeight(phase)` of the offset between the body and the clip's track (`Traversal.climbSteer`), the vertical lift by the same weight (`Traversal.drawnRoot`); the clock, weight and turn are `net/emplacement.ts` `OneShotSteer` / `oneShotPhase` / `steerWeight`, which `SeatSteer` (the mount) now runs (its pins unchanged); the align, the `ALIGN_*` constants and the `climbAlign` kind removed. Was the row's text: The align replaced by the original's concurrent steer (`FUN_005b3340`): the clip from the press, the turn at most 2 pi rad/s, the remaining offset closed by the eased weight -- after `CLIMB_STEER_READING`'s worked trace, not before | both | `traversal.test.ts` "NU-1c B10" (the clip's key 0 on the press's command and its first advance on the next; the twin at the aligned start; the turn; the vertical), `climbFacing.test.ts` (the clip on the press, faced within 2 degrees at its end; was: within 0.993 as the clip started), `traversalBody.test.ts` (the hands at the ledge at the grab, kept from round 4, green unchanged); the room's `roomClimb.test.ts` (the press's command `'climb'`, was `'climbAlign'`) |
| B11 (D11) | **Re-read and built 2026-10-17 (NU-1c; reading, pending review)**: the sub-node is walked (section 8.6), so the cut reads the pistol clip's `NoInterrupt` for a pistol-holder (`climbNoInterrupt`, `PISTOL_CLIMB_CLIPS`, `PISTOL_CLIMB_NO_INTERRUPT`; `PISTOL_CLIMB_CLIPS_READING` `'sub-node'`, was `'rifle'`); the hand is the mover's (`Walker.hand`, taken by `swapWeapon` at both ends, laid by `WalkMode.resume`). Was the row's text: **Re-read first**: whether the pistol's sub-node is among `FUN_00587c20`'s nodes (D:L445551-445565); then, with B2, the pistol-holder's cut from the sub-node's `NoInterrupt` (the review, F3; was: "The pistol's climb clips from the anim set's map, after the reader run (8.2)") | both | `traversal.parity.test.ts` "NU-1c B11": the cut with the pistol in hand, per climb clip (the crate and the blend never cut; the medium, the hang, the step-up and the climb over as the rifle's), the clips against the golden and the disc's `animset.rdr`; the room's `roomClimb.test.ts` "NU-1c in the room" |
| B12 (D12, D13) | **Decided and built 2026-10-17 (NU-1c; reading, pending review)**: both dropped -- `CLIMB_TOP_FLOOR_READING` `'dropped'` (`climb.ts` `planClimb` asks no floor of the top; an uncut end settles on the floor pick as a cut does, `Traversal.endUncut`; `topFloor` stays the track's end target) and `CLIMB_STEP_UP_STICK_READING` `'none'` (the step-up from the offer, no stick); the census in section 8.6. Was the row's text: Decide `topFloor` and the step-up's stick test against the source: drop both, or keep each as a named `*_PLACEHOLDER` with its census | both | `traversal.parity.test.ts` "NU-1c B12" (the census over the fixture maps' class-4 faces: each refused face offered now), `traversal.test.ts` "NU-1c B12" (a box whose top has no floor climbed onto the floor pick; the step-up with the stick let go) |

Not NU-1's: D16 and D17 (the hang's stance press and Action release) go to the hang's owner (the review, F1, F2); D15
(the ladder's press) goes to the ladder's owner with `LADDER_PRESS_READING`; the claymore mid-climb stays
PB-7 (b2).

### 8.2 The unknowns, as candidate constants (for research 101 and the ledger at the build; none added now)

(NU-1c, 2026-10-17: the candidates its build consumes are filed in section 8.7 and in research 101 -- `CLIMB_STEER_READING` with
B10, the two of B12 (`CLIMB_TOP_FLOOR_READING`, `CLIMB_STEP_UP_STICK_READING`); `PISTOL_CLIMB_CLIPS_READING` settled in place
(section 8.4); `CLIMB_TOP_FLOOR_PLACEHOLDER` not filed -- the gate is dropped, not kept as a placeholder.)

(NU-1b, 2026-10-17: the candidates its build consumes are filed in section 8.5 and in research 101 -- `CLIMB_OFFER_GATE_READING`
with B1, `CLIMB_PENDING_STANCE_READING` with B3, `CLIMB_RELOAD_REFUSED_READING` with B5, `CLIMB_THROW_REFUSED_READING` with
B6 (re-filed: the chase held, not the release refused), `CLIMB_HIT_CANCELS_READING` with B7; and two found by its read,
note only below.)

(NU-1a, 2026-10-14: the candidates its build consumes are filed in section 8.4 and in research 101 -- `CLIMB_CUT_READING` and `PISTOL_CLIMB_CLIPS_READING` with B2, `CLIMB_CROUCH_END_READING` with B4, `CLIMB_RESUME_STICK_READING` with B9, `CLIMB_KNOCK_SETTLE_READING` with B8; the rest stay candidates here. Was: "... the rest stay candidates here, `CLIMB_KNOCK_SETTLE_READING` among them until B8 is built.")

| candidate | stands for | the evidence that settles it |
|---|---|---|
| `CLIMB_OFFER_FRAME_READING` | the HUD's offer (`FUN_00593500`) runs before or after the player update in a frame, so the release reads this frame's offer or the last (one frame at most) | a PINE trace of `+0xed0`, `+0xed4` and the controller's `+0x170` around a release at a crate's edge of reach |
| `CLIMB_STEER_READING` | `FUN_005b3340`'s eased correction and 2 pi rad/s turn, concurrent with the clip from its first advance (the port's align replaced) | a PINE trace of `actor+0x1c..+0x24`, the rotation and the play's `+0x1c` from the release through the clip on MP2's test crate (research 86 section 3.6), at a 60-degree approach |
| `CLIMB_CUT_READING` | the stick or turn past 0.1 cuts a climb past `NoInterrupt` (phase), the end's settle at the cut | a capture of a crate climb with the stick held forward: the frame the walk resumes and the feet against the edge |
| `CLIMB_END_FRAME_READING` | the uncut end's frame on the driver's clock (the push inside the driver, its skip, the end test's lag) | the same capture with the stick at rest |
| `CLIMB_CROUCH_END_READING` | a crouched crate, medium or step-up climb ends crouched; the hang and the climb over stand | a capture of a crouched climb at a 12 crate and a 30 face |
| `CLIMB_PENDING_STANCE_READING` | a stance press mid-climb waits for the end (the hang: taken at its start) | a capture: crouch pressed mid-climb |
| `CLIMB_RELOAD_REFUSED_READING` | R mid-climb is spent with no reload; a delay outliving the climb asked after | a capture: the magazine's count after R mid-climb, with an M4 and the 870 |
| `CLIMB_THROW_REFUSED_READING` | a release mid-climb refused, nothing spent | a capture of a frag released mid-climb: the count |
| `CLIMB_OFFER_GATE_READING` | section 1.3's list refuses the offer (the reload lock, the second channel, a throw, the knock's clips, the launcher's set ...) | a capture: Cross at a crate during a moving reload; with the launcher up |
| `CLIMB_HIT_CANCELS_READING` | a non-lethal hit pops the climb (its settle) and plays the flinch | a capture of a hit mid-climb |
| `CLIMB_KNOCK_SETTLE_READING` | the knock's pop runs the climb's settle before the fall | a recomp or PINE trace of a blast mid-climb (`+0x2e4`, the matrix y) |
| `CLIMB_RESUME_STICK_READING` | the walk after a climb starts at the held stick, unramped | a capture: the first frames' speed after an uncut climb with forward held |
| `CLIMB_OVER_FALL_READING` | `Climb over` neither suspended nor integrated; at its end the fall from `+0xfac` | a trace on MP6's `crate05/mp6_justbox1` (appflags 5): y per frame through the clip and after |
| `PISTOL_CLIMB_CLIPS_READING` | whether the pistol's sub-node (`FUN_0057a330` D:L438760-438850; the port's `animator.ts:764-773`) is among the nodes `FUN_00587c20` loops over for `NoInterrupt`, the last deciding (D:L445551-445565) -- so whether a pistol-holder's climb takes the `seal_p_*` value (`seal_p_climbcrate` 1: never cut) | first a source re-read of `FUN_00587c20`'s node walk (`FUN_005780e0`) against `FUN_0057a330`'s sub-node; then a capture of a crate climb with the pistol in hand and the stick held forward (the review, F3; was: "a reader run (owed to the build): `animset.rdr` ... for the pistol's set" -- `FUN_0058c820`, D:L448155-448195, picks on `+0xf79` / `+0xf78` and the stack base, not the weapon) |
| `CLIMB_TOP_FLOOR_PLACEHOLDER` | the port's `topFloor` gate, no source | a census run (owed to the build): class-4 faces of the served maps whose top has no floor within 1.5; a capture at one |
| `CLIMB_PEEK_READING` | the peek over a climb's last tenth (`FUN_0057d810` over the climb) | a capture: the d-pad held through a climb's end |
| `CLIMB_OFFER_TIMER_READING` | note only (NU-1b's read, 2026-10-17): `FUN_00593500` offers nothing while `actor+0xee0` is over 0 (D:L452241); what writes it is not read and the port has no twin | a source read of `+0xee0`'s writers; then a capture of the CLIMB icon around whatever sets it |
| `CLIMB_OFFER_CONTROLLER_READING` | note only (NU-1b's read, 2026-10-17): `FUN_00593500` offers nothing while the controller's `+0x221` is neither 0 nor 3 (D:L452244); its states are not read and the port has no twin | a source read of `+0x221`'s writers (the player controller's mode) |
| `LADDER_PRESS_READING` | the ladder mounts on the Action's release, not by walking in (the ladder's owner) | a capture: walking into MP2's sniper ladder with no press, then with Cross |

### 8.3 Noted, not built

- The class-4 offer at `h` at or under 5 (D14): the icon shows and the press records a steer with no clip. A quirk of the
  original; the move solver rarely keeps a contact on a face under the step height (6.5). Recorded for the owner's
  quirks list (research 230 section 6) if a playtest meets it.
- `FUN_00580b70`'s prone branches (section 1.4): not reached by a player.
- Which context action wins when several are offered (the HUD list's order, `FUN_0021f850`, and the d-pad's cycling
  `+0xedc`, D:L73332-73386) against the port's `actionFilter`-first order (`WalkMode.action`): not read.
- *Found by NU-1b's read (2026-10-17), not built:* the reload's start is refused on a ladder too -- `FUN_005b4340`
  refuses state 5 for every code before its code's own tests (D:L469329-469330), code 3 among them (`FUN_005c2a90`
  D:L477404) -- and the port takes it. For the ladder's owner, with D15.
- *NU-1b's review F1 (2026-10-17; the controller's ruling, page and room on one law):* the reload's kit timer
  (`ReloadDelay`, `FUN_005c32b0`) runs on the page only -- the room hears the reload at its clip's start (`reloadStart`,
  research 251 section 6) -- so the page's offer lock no longer counts it (`Fire.reloadLocked`): both sides offer the
  climb through the timer, where the original refuses it from the press (`FUN_005a7ab0` D:L469416, `kit+0x820`
  D:L462522-462523). A known divergence, `CLIMB_LOCK_RELOAD_DELAY_READING` (section 8.5), until the press reaches the
  room -- **closed by LATER 72 (2026-10-19; reading, pending review):** the press reaches the room (`reloadPress`, its
  command's number), which refuses the offer for the delay's commands after it (`Room.pressLock`: the same weapon and
  record, `from < seq < from + ReloadDelay x 60`), and the page counts the same commands (`Fire.reloadLocked`'s window);
  offline the timer by its time. The reading is now `'counted'`. The swap through the timer, which the original refuses
  too (`kit+0x820`) and the page already refuses (`kitFree`), was the room's alone: LATER 167 closes it (`swapRefused`
  counts the window). A claim of another firearm into the hand ends the room's window at its tick and the page's when its
  `kit` arrives, a round trip later: a climb pressed in between goes to the room first and the snapshot corrects the page
  -- the class of every room-decided event (the gameplay seat's note at LATER 72's landing). Was: offered through the timer on both ends until the press reached the
  room (LATER 72, the online seat's wire). Was the open point: "the page's offer refuses a climb under the timer
  (`Fire.reloadLocked`) where the room's `climbLock` cannot -- the two may part for the timer's length (the 870's and
  the shotguns' 0.5-1 s). For the controller with B1's room hunk."
- The hang's flinch: research 217 section 4.6 lists the hang as refused; `FUN_005a2690`'s refusals read here
  (D:L460004-460009: a swap, three named types, states 5 and 9, the restrained and turret sets) do not name state 4, and
  its looped-top branch was not read. Left to the flinch's owner.

- *Owed, noted (NU-1c's review, F3):* `clipPath.ts` :134-138's doc still names `FUN_005b2d20`'s 30-a-second lift as the
  climb's vertical steer; `Traversal.drawnRoot` takes that lift back (B10, the shared one-shot steer). Reworded, and
  `ClipPath`'s `STEER_RATE` lift retired, at the file's next touch.
- *Noted (NU-1c's re-review, F4):* the press (`FUN_005b4b40`) zeroes the stick, the velocity and the take-off carry `+0x1350`
  whatever it pushed (D:L469667-469674). Where a climb starts the port matches (`startClimb` zeroes the velocity; the carry
  ends with the airborne flag); a press that pushes nothing (a class-2 ladder refusal, or D14's class-4 face at `h` at or
  under 5) keeps the port's velocity where the original's stops. Not built.

### 8.4 Readings and placeholders (NU-1a's build)

Filed 2026-10-14 by NU-1a (`packages/viewer/src/traversal.ts`); reading, pending review. Research 101 holds their rows
(its NU-1a group).

| name | stands for | value in the code | the evidence that settles it |
|---|---|---|---|
| `CLIMB_CUT_READING` | the stick or the turn past 0.1 cuts a climb's clip (the step-up, the crate, the medium and their blend, the climb over, `Stand -> Hang`, `Hang -> Climb`) on the first command its phase is past its `NoInterrupt` (`CLIMB_NO_INTERRUPT`, the golden's), the cut asked before the tick's advance (D:L418176-418203, D:L445549-445565), on the clip's clock from its push with `Walker.holdCut`'s lag for a push before the driver's top-play block -- none (D:L418132, D:L418155 before D:L418172); the end handler at the cut: the body at its x and z, the floor pick's y (D:L446582-446648, D:L466784; the port's `selectFloor` from the feet + `STEP_PROBE_LIFT_READING`), the ground state the same tick (D:L418203); `Stand -> Hang` cut reveals the hang (D:L442288-442293); the climb over settled on the floor pick, its fall (D:L446538-446542) not followed (section 6) | `'before'` (`HoldPass`: the push's own clock) | a capture of a crate climb with the stick held forward: the frame the walk resumes and the feet against the edge (section 8.2) |
| `PISTOL_CLIMB_CLIPS_READING` | the cut reads the pistol clip's `NoInterrupt` for a pistol-holder: `FUN_0057a330` links each one-shot node's pistol version at its `+0x10` (D:L438711-438772; `FUN_0058c9e0` on the hand `+0xf79`; `FUN_0028bdd0` D:L133953-133962), `FUN_00587c20` walks the play's first node and that chain, the last deciding (D:L437475-437489, D:L445551-445565); the blend's first node the crate's (D:L442323-442333); the Seal anim set's four pistol climb clips, no `Pistol step up` or `Pistol climb over` (NU-1c's re-read, section 8.6) -- was: "the cut reads the rifle's climb clips' `NoInterrupt` whatever the weapon in hand; whether the pistol's sub-node ... is not read" (D11) | `'sub-node'` (was `'rifle'`) | a capture of a crate climb with the pistol in hand and the stick held forward (was also: "first a source re-read ... (B11)", done by NU-1c) |
| `CLIMB_CROUCH_END_READING` | a SEAL crouched at the press ends a step-up, a crate or a medium climb (their blend among them) crouched, the request crouch, no transition: the push pops to index 1 and writes `actor+0x374` = 1 (D:L442186-442214, D:L446244-446274), the climb's pop reveals the crouch base (D:L135104); the hang (D:L446105, D:L446199) and the climb over (D:L442152-442163) end standing; the clip plays in state 0 (D:L442225-442277) | `['step', 'low', 'med']` (`endClimb`) | a capture of a crouched climb at a 12 crate and at a 30 face (section 8.2) |
| `CLIMB_RESUME_STICK_READING` | the walk after a climb, cut or not, starts at the held stick, unramped: each advance of the top play copies the pad's axes into the ramp's last value (`FUN_0057a330` D:L438704-438706: `+0x248` <- `+0x244`, `+0x24c` <- `+0x240`), which the ground state's ramp `FUN_00586c10` (D:L444985-445010) starts from; the port copies the tick's stick (`Walker.cutStick`) at each climb advance and keeps it at the end; the ladder's ends not this row's | `'held'` (`finish`'s `keepStick`) | a capture: the first frames' speed after an uncut climb with forward held (section 8.2) |
| `CLIMB_KNOCK_SETTLE_READING` | a knock mid-climb settles the climb before the fall: `FUN_0057e770` pops the stack (`FUN_0058a4d0`, D:L440997), each pop running `FUN_00589aa0` -- the crate, the medium, `Hang -> Climb` and the step-up's body on the floor pick (D:L446582-446648, D:L466784); the climb over settled the same way (its fall, D:L446538-446542, not followed); `Stand -> Hang`, the hang and the dive settle nothing; the ladder's 0x2c / 0x2e cases (D:L446544-446576) are not read for the knock (PF-19's `KNOCK_LADDER_STATE_READING` holds them); the port's ladder knock is unchanged (F1 of NU-1a's review, 2026-10-14; was: "the hang, the ladder and the dive settle nothing"); asked by the knock only (`applyKnock`), the death's release (`Room.kill`) unchanged on no reading (section 4) | `'settled'` (`Traversal.popSettle`) | a recomp or PINE trace of a blast mid-climb (`+0x2e4`, the matrix y; section 8.2) |

### 8.5 Readings and placeholders (NU-1b's build)

Filed 2026-10-17 by NU-1b (`packages/viewer/src/traversal.ts`, `grenade.ts`); reading, pending review. Research 101 holds
their rows (its NU-1b group). The room's halves of B1, B5 and B7 were drafted, cleared by the online seat and written (2026-10-17).

| name | stands for | value in the code | the evidence that settles it |
|---|---|---|---|
| `CLIMB_OFFER_GATE_READING` | the climb's offer asks the original's gates through `climbOffered(walker)`: the binoculars and the scope (D:L452259-452262), dead (D:L469321), the knock's falls and landings (D:L469325-469326), a swap (D:L469412), the reload lock (D:L469416), the launcher's and the turret's sets (D:L469470-469474) in the air and on the ground; a throw or toss on top (D:L462622-462631) and the second channel (D:L462681) on the ground only (D:L452277-452290); `Walker.climbLock` the parts the mover does not carry; no carrying in the port | `'gated'` | a capture: Cross at a crate during a moving reload, and with the launcher up (section 8.2) |
| `CLIMB_PENDING_STANCE_READING` | a stance press during a climb's one-shot is the mover's request, kept while the climb owns the body (D:L418927-418930) and asked from the tick after its end (D:L418867-418908); a crouched SEAL's push writes it crouch (D:L446244-446274); `Stand -> Hang` and the hang unchanged (D16) | `'kept'` | a capture: crouch pressed mid-climb (section 8.2) |
| `CLIMB_RELOAD_REFUSED_READING` | a reload's start refused while a climb's clip or the hang holds the body (`FUN_005b4340(actor, 3)` D:L477404; D:L469517, D:L469460-469461), the timer spent (D:L476560) | `'refused'` | a capture: the magazine's count after R mid-climb, with an M4 and the 870 (section 8.2) |
| `CLIMB_THROW_REFUSED_READING` | the grenade's wind-up held under a climb's clip -- the chase stands (`FUN_0059d830` D:L453478-453480 -> D:L457365), the release at the climb's end at the frozen power; the release request refused on the climb's first frame (D:L475491-475498); the placing untouched (#96) | `'held'` | a capture of a frag held through a climb and let go under it (section 8.2; was: "a capture of a frag released mid-climb: the count") |
| `CLIMB_OFFER_TIMER_READING` (*note only*) | the offer refused while `actor+0xee0` is over 0 (`FUN_00593500` D:L452241); its writers are not read and the port has no twin | none (named in `CLIMB_OFFER_GATE_READING`'s doc) | a source read of `+0xee0`'s writers, then a capture of the CLIMB icon around them (section 8.2) |
| `CLIMB_OFFER_CONTROLLER_READING` (*note only*) | the offer refused while the controller's `+0x221` is neither 0 nor 3 (`FUN_00593500` D:L452244); its states are not read and the port has no twin | none (named in `CLIMB_OFFER_GATE_READING`'s doc) | a source read of `+0x221`'s writers (section 8.2) |
| `CLIMB_LOCK_RELOAD_DELAY_READING` | the climb's offer lock counts the reload's delay timer, as the original refuses from the press (`FUN_005a7ab0` D:L469416 on `kit+0x820` D:L462522-462523): LATER 72 -- the press reaches the room (`reloadPress`), which refuses the offer for the delay's commands after it (`Room.pressLock`), the page the same commands (`Fire.reloadLocked`'s window), offline by its time (was NU-1b's review F1: `'not counted'`, the room unable to see the timer) | `'counted'` (`Fire.reloadLocked`, `Room.pressLocked`) | a capture: R then Cross inside an 870's `ReloadDelay` (reading, pending review) |
| `CLIMB_USEVELY_READING` | NU-1b's review F3: the climb clips (`CLIMB_BODY_CLIPS`) carry `UseVelY` on research 86 section 1's word -- no reader reads the flag (`FUN_0057b510`'s `+0x4a` bit 4, D:L469517); read through the reader instead: every one a bare `NoFire`, only `seal_hang` looped (`seal_hang_jumpdown` a one-shot, `NoInterrupt` 0.8) | `'every climb clip'` | a reader of the loader's `+0x4a` bits (`FUN_00287620`) run over the clips |
| `CLIMB_HIT_CANCELS_READING` | a non-lethal flinch over a running climb pops it (`FUN_005a2690` D:L460011-460019; `FUN_0058a4d0` to the base kind, each pop `FUN_00589aa0` D:L446582-446648): settled on the floor pick, `Stand -> Hang` handed to the fall; the hang's jump down popped with no settle (NU-1b's review F3: `motion.rdr` looped 0); the hang's loop not popped (section 8.3); the page pops on the flinch's event only a climb it began at or before the hit's command, `cut.start - 1` (NU-1b's review F2: the room pops the climb its mover runs at the hit; was: any climb running when the event arrived) | `'popped'` | a capture of a hit mid-climb (section 8.2) |

### 8.6 The read behind NU-1c (2026-10-17; reading, pending review)

Step 1 of NU-1c's brief, before any build: source inspection of the decompilation (the lines below), and one scratch run
(a throwaway vitest file outside the commits, deleted after) that read the disc's data through the repository's readers
(`simClipsFromBytes`, `loadMap`, `animset.rdr` through `parseRdr`) and computed the law below. No game, capture or
browser was run. Nothing here contradicts sections 3, 4 or 7 or PB-2c's `SeatSteer` law (research 215 s7.1); the two
additions are marked.

**B10, the steer's worked trace.** The record: `FUN_005b2620` pushes the clip, then `FUN_005b1a10` (D:L468504) writes it
on the pushed play -- `+0x6c` the clip's `refPt` as it is (D:L467883, D:L467931; "Step up" `refPt.y` + 1, D:L467905; the
blend's y weighed, D:L467914-467919), `+0x7c` the contact's normal negated (the facing, D:L467927-467932), `+0x8c` the edge's
target with the top point's y (D:L467887, D:L467933). `+0xa8` (the hang's and the climb over's extra offsets, research 86
section 3.5) is not read by `FUN_005b3340`. The mount records `refPt` negated (research 215 s7.1), so both aim the actor's
root at `place - R(facing) x stored` and move `stored` by the root's velocity x dt (D:L468947-468951): one law. *Added:*
the actor moves by the clip root's velocity (`FUN_0028c250`, D:L438910) **plus** the play's steer velocity
(`FUN_0054d9a0` adds the play's `+0x0` to `+0x2c`, D:L416455, clears it, D:L416456-416458, rotates and integrates both,
D:L416515-416520); the mount's root velocity is zeroed under its seat record (`+0xeac`, D:L439099-439105), the climb's is
not (D:L439107-439148). So the climbing body goes with its clip and the steer closes only the offset between the body and
where the clip's `refPt` meets the target: `e' = (1 - k) e` (plus the root's step turned by the body's lag on the
facing), `k = sqrt(ease(phase))`. Frostfire's crate `crates1/prop02`, its west face (x 922.8, top 111.85 over the 100
floor: h 11.85, `seal_climbcrate` alone; the disc's clip: 30 keys, playback 1.25, the run 1.168 s, rise 12.88, 11.36
ahead), walked into head on and at 30 and 60 degrees, pressed at the prompt (the feet 3.54 off the face), at the port's
60 Hz tick:

| tick | phase | k | the root ahead / up this tick | offset still open (head on; from 5.42 back) | vertical open (from -1.117) | degrees off the face, from 60 |
|---|---|---|---|---|---|---|
| 1 | 0.014 | 0.020 | 0.016 / -0.079 | 5.314 | -1.095 | 54.80 |
| 3 | 0.041 | 0.059 | 0.033 / -0.126 | 4.808 | -0.991 | 45.31 |
| 5 | 0.069 | 0.098 | 0.064 / -0.158 | 4.001 | -0.824 | 37.11 |
| 8 | 0.110 | 0.156 | 0.258 / -0.240 | 2.574 | -0.530 | 27.16 |
| 10 | 0.138 | 0.195 | 0.308 / -0.246 | 1.708 | -0.352 | 21.94 |
| 12 | 0.166 | 0.234 | 0.341 / -0.199 | 1.028 | -0.212 | 17.68 |
| 15 | 0.207 | 0.293 | 0.383 / 0.337 | 0.394 | -0.081 | 12.74 |
| 20 | 0.276 | 0.390 | 0.239 / 0.614 | 0.045 | -0.009 | 7.35 |
| 25 | 0.345 | 0.488 | 0.114 / 0.364 | 0.002 | 0 | 4.40 |
| 30 | 0.414 | 0.585 | 0.042 / 0.225 | 0 | 0 | 3.12 |
| 45 | 0.621 | 0.844 | 0.116 / 0.336 | 0 | 0 | 1.69 |
| 60 | 0.828 | 0.970 | 0.299 / 0.207 | 0 | 0 | 1.16 |
| 70 | 0.966 | 0.999 | 0.162 / 0.095 | 0 | 0 | 0.96 |

The aligned start is 8.92 (`refPt.z`) back from the edge's target, 5.42 behind the feet at the press; the correction moves
the body back against the clip's own early travel (net back about 2.5 over the first ten ticks), closes 93% of it by tick
15 (0.25 s) and all of it before the pull (the rise from tick 15); the vertical (the 11.85 ledge against the clip's
13 = 11.487 + `refPt.y` 1.48) closes alike. The turn from 60 degrees: 5.2 degrees on the first tick (2 pi rad/s x sin 60),
under 6 degrees near tick 23, then `a sin a` a tick -- 0.96 off at the clip's end, never closed by the steer (the end's
handler and the walk take the facing from there). At 30 degrees the offset 5.43 (0.36 across) closes alike, 0.86 off at
the end. Was (the port's align): about 11 ticks at 30 a second and 4.712 rad/s with the clip held at frame 0, then the
clip from the aligned start.

**B11, the pistol's sub-node.** `FUN_0057a330`'s one-shot branch (play `+0x28` bit 0x40 clear, D:L438710-438711) walks the
play's top-level nodes (`FUN_005780e0` / `FUN_00578110`, D:L437475-437512, the list's entries' `+0x8`) and for each maps
its type by the hand (`FUN_0058c9e0(actor, type, +0xf79)`, D:L438739-438740: 2 the pistol -- `FUN_005a6fc0`
D:L462189-462191 pairs 2 with `Pistol stand -> Turret` -- through the anim set's table, `FUN_005e1a50`; 1 the rifle maps to
itself), takes the set's motion (`FUN_005e3d90`, D:L438745) and links it under the node at weight 1 (`FUN_0028bdd0`
D:L133953-133962: the node's `+0x10` the sub-node, the sub-node's `+0x10` cleared), each tick. `FUN_00587c20` starts at the
play's first node and follows `+0x10` (D:L445551) -- the node's sub-chain, not the play's list -- each node's
`NoInterrupt` (`+0x30` of its motion) replacing the answer (D:L445552-445564): **the pistol's sub-node is walked and
decides**. *Added:* only the play's first node is read; in the crate/medium blend that is the crate's (`FUN_00581110`
appends it first, D:L442323-442333, through `FUN_0028cfb0` and `FUN_0028bef0`'s `FUN_0028f430`, both appending at the tail,
read from the head by `FUN_0028f120`). The Seal anim set (`animset.rdr` with its includes, read for this note) maps
`Pistol climb crate` to `seal_p_climbcrate` (`NoInterrupt` 1), `Pistol climb medium` to `seal_p_climb_medium` (0.9),
`Pistol stand -> Hang` to `seal_p_stand2hang` (0.85), `Pistol hang -> Climb` to `seal_p_hang2climbup` (0.9) and holds no
`Pistol step up` or `Pistol climb over` (the ELF names both, 0x494030 and 0x494080). So a pistol-holder's crate climb and
every blend (h under 26.5) is never cut by the stick (the phase stops at (n - 1) / n); the medium alone, the hang, the
pull-up, the step-up and the climb over cut as the rifle's.

**B12, the census.** The offer's class-4 branch (`FUN_005b3ce0` D:L469246-469285) and the push (`FUN_005b2620`
D:L468420-468504) re-read: no floor is asked of the top, and the step-up (5 < h <= 10) is pushed from the offer with the
contact held and faced, no stick (D:L469266-469276) -- D12 and D13 as section 7 has them. The census: every class-4 wall
polygon of the served maps (`public/maps`: MP2, MP51, MP62, MP64, MP71, MP72) and of the MP6 fixture, stood 3.75 in front
of its middle on the highest floor under its top less 5 (and not 2 under its bottom), its height's class by the table,
then `topFloor` at the top edge's middle, 4 past it. No class-1 or class-3 face is on these maps.

| map | class-4 faces | walls | in the table (not over) | `topFloor` refuses | the refused |
|---|---|---|---|---|---|
| MP2 (Frostfire) | 359 | 340 | 294 | 2 | `container_blue01/climb` twice (h 29.99, the hang): no floor 4 past the edge's middle, only the ground at 100 |
| MP51 | 16 | 16 | 13 | 1 | `wc12B/di_climb_uppy13_1` (h 18.72): floors 78 and 46.9 past it, the top 60.76 |
| MP62 | 1 | 1 | 1 | 1 | `climbers` (h 20.14): the floor 114.83, 1.68 over the top 113.15 |
| MP64 | 10 | 9 | 7 | 1 | `climb_2` (h 22.5): the floor 113.51, 2.62 over the top 110.89 |
| MP71 | 46 | 33 | 21 | 0 | -- |
| MP72 | 11 | 11 | 10 | 0 | -- |
| MP6 (Desert Glory, fixture) | 89 | 79 | 59 | 10 | `crate04/mp6_justbox2` eight times (h 13.39; past it 0 and 60, the top 73.39), `firstwall_climber1` (h 29.98; past it 32.82), `building_wc2` (h 30; past it 32.31) |

What dropping the gate changes: these faces are offered and climbed; the clip's track ends on `topFloor ?? the polygon's
top` and the end handler sets the body on the floor pick there (`Traversal.endUncut` -> `climbSettle`, the cut's own), so
on MP62's and MP64's faces the body ends on the floor 1.7 and 2.6 over the climbed face's top, and where no floor stands
within the pick's reach over the feet (MP6's `mp6_justbox2`) on the highest one under them. **`mp6_justbox2` is an
open-topped box** (NU-1c's review, F1, its polygons dumped off the fixture): four outer walls 60 -> 73.39, four inner walls
61.5 -> 73.39, a rim about 1.3 wide of four floor quads (ditype 3) at 73.39, and no floor inside but the garage roof at 60
it stands on; the climb's end lands 2.45 past the outer face (the clip's travel less `refPt`, about 11.36 - 8.92), past the
rim, so the floor pick there (the original's `+0x2e4` from `+0x404`, `FUN_005b0840` D:L467215-467256 at the actor's own
x and z, the root's zeroed, D:L439147-439148) is the roof inside the box at 60 -- the original's too, by the read; it would
end on the rim only if the original's actor stopped 1.15 or more short of the port's end (nothing read supports it).
(Was: "... on the highest one under them" -- read as a fall through a solid crate.) The census here is the port's rule
measured on the data, not the original's behaviour; a capture at one of those faces is owed (section 8.7), `mp6_justbox2` first.

*The launch is not state 6 (NU-1c's review F2, withdrawn at its re-review, 2026-10-17; reading, pending review).* The review
had read the running jump's push `FUN_00588bc0(actor, 8, 6, 0, 0xd)` (D:L440820) as putting the actor in state 6, where
`FUN_00580b70` pushes no climb (D:L442216-442232). The 6 is the play's own posture byte: `FUN_0028dc90` stores it at the
play's `+0x2b` (D:L135204), and the state `+0x174` changes only through the actor's `+0x90` setter or a pop with the revealed
play's posture (D:L445115-445147). The dive shows the difference: it pushes its plays with posture 2 and then sets state 6
itself (D:L440896-440898); so does the fall pushed after a climb over pops in the air (D:L445135-445136). Through a running
jump the state stays the stance (0 or 1): `FUN_00580b70` pops the launch (D:L442186-442199) and pushes the climb by height,
so the running jump's ledge grab and a step-up met inside the launch are the original's, as the port had them. The fold
(d4aae4e30, a launch gate) is reverted. What would overturn it: a state write through a vtable slot not resolved here --
a trace of `+0x174` through a running jump, or a capture of a running jump into a 30-36 ledge with Cross pressed in the air.
In a dive the original is in state 6 and pushes nothing; the port never offers a climb in a dive (`step` returns from the
dive's tick first): the same outcome.

### 8.7 Readings and placeholders (NU-1c's build)

Filed 2026-10-17 by NU-1c (`packages/viewer/src/traversal.ts`, `climb.ts`; the shared steer in `net/emplacement.ts`);
reading, pending review. Research 101 holds their rows (its NU-1c group; `PISTOL_CLIMB_CLIPS_READING` settled in place in
its NU-1a group and in section 8.4). No room hunk: the room's mover runs the same `Traversal` through `MoverSim`.

| name | stands for | value in the code | the evidence that settles it |
|---|---|---|---|
| `CLIMB_STEER_READING` | the climb's clip runs from the press with `FUN_005b3340`'s steer folded in (D:L439017-439020): the body its clip's track from the aligned start less the offset still open, `steerWeight(phase)` of it closed each tick (D:L468928-468943, the target moving with the root's travel, D:L468947-468951; the play's velocity added to the root's, D:L416455), the vertical kept (D:L468933-468941), the turn `seatTurn`'s (D:L468862-468886); `OneShotSteer` shared with the mount; no abandon, no tick limit (section 8.6) | `'concurrent'` | a PINE trace of `actor+0x1c..+0x24`, the rotation and the play's `+0x1c` from the release through a crate climb at a 60-degree approach (section 8.2) |
| `CLIMB_TOP_FLOOR_READING` | no floor asked of the top (D12): `FUN_005b3ce0` and `FUN_005b2620` offer and push by the height alone (D:L469246-469285, D:L468420-468504); the end, cut or not, on the floor pick (`FUN_00589aa0` D:L446582-446648); the census in section 8.6 | `'dropped'` (was `'gated'`: `topFloor` within 1.5, 4 past the edge) | a capture at MP62's `worldmodel/climbers` (its floor 1.68 over the face's top): the icon, the climb and where the body ends (NU-1c's review F1: the capture first at MP6's open-topped `mp6_justbox2`, the end inside the box at 60 or on its rim at 73.39) |
| `CLIMB_STEP_UP_STICK_READING` | the automatic step-up (class 4, 5 < h <= 10) from the offer with the contact held and faced, no stick (D13; D:L469266-469276), in the air as on the ground (the offer's air branch, D:L452279-452290) | `'none'` (was `'pushing'`) | a capture of a walk into an 8-high crate, the stick let go on the contact's frame |

### 8.8 The read behind LATER 111: the top at the hit's column (2026-10-18; reading, pending review)

LATER 111 (found by #292's read; the merge controller's GO for one task: the column top, the push's target cut and the
ray's contact). Branch `agent/l111` from the PARITY-2 lane. Source inspection of the decompilation, and a scratch census
through the repository's readers (`simMapFromBytes`, `groundPolygons`) over the disc's 34 maps; no capture.

**The top.** `FUN_002dbfb0` (D:L180183-180212) maps the contact's stored hit (record +0; polygon +0xc; collider +0x1c)
into the collider's frame (`FUN_003109f0`, `FUN_00308160`, `FUN_003085c0`, D:L180195-180202) and calls `FUN_002dd4d0`
(D:L180890-180956), which walks the edges, the previous point to the current (the first from the last point,
D:L180912-180916), through `FUN_002dd690` (D:L180962-181050): the hit projected on the edge's own line in xz -- fVar4,
(b - a) . (p - a) (D:L181003), and fVar5, (b - a) . (b - p) (D:L181020) -- and the edge's point there
(D:L181035-181038) kept only when both are over 0 (D:L181005-181006, D:L181022-181023): strictly inside the edge; an
edge with no length in xz never is. The highest kept point is the top, the lowest the bottom, `<` both ways, so the first
stays on a tie (D:L180939, D:L180944); both are mapped back out (`FUN_00308640`, D:L180208-180209). No kept edge:
`FUN_002dbfb0` returns 0 (D:L180204-180205) -- the class-4 offer refuses (D:L469252-469254), the push refuses
(D:L468371-468373), the obstacle ray casts at the head's height instead (D:L416735-416743, not modelled, research 281
s4.1), the ladder's drop test keeps the contact (D:L468997-468999). The port took the polygon's highest and lowest points.

**The push's target is on a cut, not the top edge.** `FUN_005b2620` asks `FUN_002dc090` (D:L468422) ->
`FUN_002dd2b0` (D:L180803-180885): the polygon's crossings at the hit's own height (an edge counts when the previous
point is under it and the current at or over it, or the current at or under it and the previous over it,
D:L180846-180847; its point at D:L180857-180860), in the edges' order; under two, the push refuses (D:L180240,
D:L468423-468425). `FUN_005b3a60` (D:L469016-469080) places the target on the first two: the hit itself when both are 3
or more away in xz, 3 in from the one under 3 away, the midpoint when both are (and for appflags 1, research 86 s3.3);
`FUN_005b1a10` sets its y to the column top's (D:L467887). The port's edge was the vertices within 0.01 of the
polygon's highest (`FUN_005b1c80`'s ladder test), which a sloped top shrinks to one vertex: its climb aimed at the high
corner.

**The obstacle ray** (`FUN_0054e430`) casts at the column top + 0.5 (D:L416734, D:L416745) and stores its hit
(`FUN_005b0d30` at D:L416793): the new contact is at the ray's hit (the port's: the polygon's point nearest the mover).

**What the port does now** (`climb.ts`: `columnTop`, `crossSection`; `contactOf` at the hit -- `contactFromHits` the walk's,
`obstacleRay` the ray's; `planClimb`'s target by `FUN_005b3a60`; `ClimbContact` gains the hit's `y`, its `edge` the cut,
null under two crossings). `traversal.ts` is unchanged in code (its `lift`, `topFloor` and `hangUp` read
`plan.contact.top`, the column's now); the room and the AI path run the same `Traversal`; ladders (`@s2u/scene`
`ladder.ts`) keep their own spans. A reading and a placeholder (section 8.9): `CLIMB_COLUMN_END_READING` and
`CLIMB_COLUMN_FRAME_PLACEHOLDER` (it was `CLIMB_COLUMN_FRAME_READING` until LATER 115). A named departure (the review, F1-F2): the port's offer is its plan, so where the
original offers and refuses only the press the port offers nothing -- with no top (under `'none'`), an appflags 1, 3 or 5
face, which `FUN_005b3ce0` offers outright; with a top and a cut under two crossings, any class, class 4 by the top
alone (h <= 5, or 10 < h <= 32; D:L469252-469285 call `FUN_002dbfb0`, never `FUN_002dc090`). The second is almost
unreachable with the port's hits (a hit on the polygon strictly between its column's bottom and top has the cut's two
crossings); with no top, the original's head-height ray (D:L416735-416743) is not modelled either (research 281 s4.1).

**The census** (dev-disc scratch, not a test; every appflags 1, 3, 4 or 5 wall -- one-sided, its normal's horizontal
part 0.7 or more -- sampled at 64 columns; at 16 a body stood 3.75 in front on the highest floor between the column's
bottom - 2 and its top - 5, facing it, the whole offer (the obstacle ray, then `planClimb`) compared with the polygon's
top and with the column's; the standing height a heuristic, so these are where a band can change, not where a player
will see it): 1,450 climb faces on the 34 maps (appflags 4 and 5 only: the disc holds no 1 or 3); 293 whose top is not
level (209 by over 0.5); **77 on 16 maps whose offer changes** at some column (513 of 4,034 sampled spots). By kind:
low -> step 149, high -> med 126, med -> low 90, none -> high 82, high -> low 29, none -> med 20, high -> step 13,
med -> step 4. The obstacle ray's polygon changes at 20 spots (MP1 16, MP7 1, MP64 1, M52 2). The target moves more
than 5 at 2,857 of the 3,739 offered spots on those faces (MP2's `container_blue01`: up to 36 along a 40-wide side).

| map | faces changed | the changes (sampled spots, polygon top -> column top) |
|---|---|---|
| MP1 | 2 | `land52` high -> med / low; `land26` low -> step |
| MP5 | 4 | `g840_2/g843_1` med -> low, low -> step; `tower/climb` low -> step |
| MP6 | 2 | `firstwall_climber1` high -> med; `garage_wall` high -> med / low / step |
| MP7 | 3 | `backwall_climb` low -> step; `g493` high -> med; `g704` high -> med / low / step |
| MP9 | 15 | the `land_*` cliffs: high -> med / low / step, med -> low / step, low -> step |
| MP10 | 1 | `g13990` high -> med / low |
| MP12 | 2 | `g1030` low -> step |
| MP51 | 2 | `wc14/climb_wc14`, `wc22A/climb_uppy_3` low -> step |
| MP61 | 7 | `park` med -> low, low -> step; `g1894` none -> high; `g1895` none -> med, high -> med, med -> low |
| MP71 | 6 | `climbwall/wall_climber*` high -> med, none -> med |
| MP72 | 1 | `wc15/climber13` low -> step (the automatic step-up) |
| MP81 | 2 | `crate`, `crate_1` low -> step |
| MP83 | 2 | `wc03_wh`, `wc04_wh` low -> step |
| M51 | 6 | `guardwall/g19733` low -> step, med -> low, high -> low |
| M52 | 9 | `g20308_13`, `g20310_14`, `g20311_*`, `wc4/g21235`, `wc12`: high -> med, med -> low, low -> step, none -> high |
| M61 | 13 | `wc38`, `wc21`, `wc28a`: high -> med / low / step, none -> high; `wc23`, `wc25` low -> step; `di_climb07` none -> med, high -> med |

The brief's first counts (MP6 2 of 79, MP2 1 of 340, MP72 1 of 11) were the faces whose band changes on the fixtures;
corrected here (MP6: 14 of 87 not level, 2 changing; MP2: `container_blue01`'s two polygons, no band change, its target
moved; MP72: confirmed). Tilted climb instances (the frame reading): MP1 `alaska4d_fence01/02` (16), MP2
`container_blue01`, M52's trucks and railcars, M82 `m82truck_utility` -- the world and the collider frame agree to 0.06
on all but MP1's fences, where the scratch's estimate (3-19) is unchecked (its hit off the tilted plane): LATER 115.

**Pins.** `traversal.test.ts` "LATER 111" (R1 the row's trapezoid, RED `expected null to be 'med'`; R2 the target at the
column, RED `expected 10 to be close to -5`; R4 the corner's `'inside'`: a level face's end vertex keeps its offer, a
sloped face's low end takes its top 20, RED `expected 40 to be close to 20`); `traversal.parity.test.ts` "LATER 111" on
the fixtures (MP6 `garage_wall` 'med', RED `expected 'high' to be 'med'`; MP72 `wc15/climber13` the automatic step, RED
`expected 'low' to be 'step'`; MP2 `container_blue01`'s target at the hit, RED `expected 19.61 to be less than 0.05`).
Section 8.6's census of the top's floor, re-measured on the column: MP2 0 of 294, MP6 10 of 57, MP72 1 of 10 (was 2 of
294, 10 of 59, 0 of 10).

### 8.9 Readings and placeholders (LATER 111's build)

Filed 2026-10-18 by LATER 111 (`packages/viewer/src/climb.ts`); reading, pending review. Research 101 holds their rows
(its LATER 111 group). Re-filed 2026-10-19 by LATER 115: the column's frame is a placeholder, not a reading -- the
original's frame is read (the collider's own), and the port's world frame is a known difference from it, measured
on the disc (the row below; source inspection, and the disc's 34 maps through the repository's readers in a scratch,
then the dev-disc pin `packages/viewer/test/climbFrame.disc.test.ts`). Retired 2026-10-19 by LATER 142 (section 8.10): the frame carried through, the row kept as history, its measure corrected in place.

| name | stands for | value in the code | the evidence that settles it |
|---|---|---|---|
| `CLIMB_COLUMN_END_READING` | the column at a hit no edge spans strictly. `FUN_002dd690`'s strict test (D:L181005-181006, D:L181022-181023) gives the face's end column no top, so `FUN_002dbfb0` returns 0 there (no offer for class 4, no push). The original's hits are segment crossings on the polygon (`FUN_002d4cc0` D:L175906-175960, research 281 s4.1), which reach that column at almost no point; the port's walk hit is the nearest point of the wall's cut, its end vertex exactly at an outside corner. `'inside'` (the controller's call between readings, 2026-10-18): the column taken just inside the face -- the hit's projection clamped to the face, the edges' ends kept -- so a corner's offer stands as beside it; `'none'` (recorded, not chosen): as read, every outside corner's offer goes | `'inside'` | PAR-21 C3's segment records (the corner's hits then crossings, as the original's), or a capture at an outside corner of a sloped climb face (the icon and the clip by the height there) |
| `CLIMB_COLUMN_FRAME_PLACEHOLDER` | the frame the column is taken in -- a known difference from the reading, not a choice between readings (renamed from `CLIMB_COLUMN_FRAME_READING` by LATER 115, 2026-10-19). The read: the collider's own frame. `FUN_002dbfb0` (D:L180187-180212) builds the collider's matrix with `FUN_003109f0` (D:L212151: the node's matrix and its ancestors', up to, not including, the first ancestor of runtime type 6 (the parent link at +0x64); no column if none is met -- `FUN_002dbfb0` returns 0), inverts it with `FUN_00308160` (D:L206756: the 3x3 transposed over row 0's squared length, a rotation with uniform scale -- every tilted climb instance on the disc is one), maps the hit in (`FUN_003085c0`, D:L206952), takes the column along the collider's local up axis, the highest by local height (`FUN_002dd4d0`, D:L180890-180956), and maps the top and bottom back out (`FUN_00308640`, D:L206996); the push's cut is taken in the same frame (`FUN_002dc090`, D:L180218-180248). The port computes in world space: its polygons carry no matrix (`placeCollision` drops it). Measured (LATER 115): off MP1's fences nothing changes: the appflags-4 tilted instances (MP2 `container_blue01`, M52's trucks and railcars, M82 `m82truck_utility`) differ by 0.17 at most, with no floor in front inside that margin. MP1's tilted fences (`alaska4d_fence01/02`, leaning 2.6 to 8 degrees, the column top up to 17.82 apart at hits on the face) are all appflags 5, whose class never reads the height (`FUN_00580a80` D:L442138; offered outright, D:L469247-469250); the climb's target does read the top, for every class: `FUN_005b1a10` sets its y to the column top's (D:L467887; called at D:L468504 with the top of D:L468371, stored at D:L467933). Through the walk's own contact (bodies every 0.25, standing and crouched: both probe lines' hits over every wall within the probe radius 3.5 of the body, `mover.ts` `slide`, and the contact `contactFromHits` picks from them, D:L413823-413848 -- the radius a test on the hit point; a kept contact is offered up to 24 from it, `CONTACT_KEEP`), the whole offer both ways at 150,421 contacts on the fences: 410 spots are offered only in the world's frame and 80 only in the collider's (at the stand-off, 3.0 to 3.5 from the hit, 114 and 30), all at contacts on a face's edge -- the slide's nearest point at the cut's end, on a fence's top edge (level in the collider's frame, so its cut there has under two crossings) or at its end; the target differs by up to 23.64 in height (4,171 spots over 2; the largest at a face's end, where the collider's column keeps one edge under `FUN_002dd690`'s strict test and its top is the face's bottom corner) and 5.56 in xz (607 over 2). At contacts inside the cut no offer changes and the target differs by up to 8.21 in height (416 over 2) and 5.52 in xz. Those edge contacts exist partly because the port's walk hit is the nearest point clamped to the cut's end, where the original's hits are segment crossings that reach that column at almost no point (`CLIMB_COLUMN_END_READING`); the 23.64 comes from that reading together with the frame. *Corrected by LATER 142 (2026-10-19, section 8.10):* those offer flips were not the frame but f32 rounding at the cut's end vertex -- the walk's hit on the polygon's boundary, where the column is ill-conditioned in either frame: at the first pinned spot a hit moved 1e-5 inward is offered in the collider's frame, and at the second the collider's 34.25 becomes the world frame's 57.88 1e-4 inward; at the hit taken 0.01 inside its cut (`CLIMB_EDGE_INSET_PLACEHOLDER`) the frame changes 14 offers of 100,554 static-body contacts on the fences (fence02's two top corners, offered in the collider's frame only, at a still body's contact selection; through the port's walk neither is a refusal, LATER 142's re-review G1) and the target's height up to 9.62 (2,519 over 2). Single-line hits without the selection (bodies every 0.25): 858 spots offered only in the world's frame and 252 only in the collider's. (Was, LATER 115's first counts, from one body per spot of a 16 x 9 grid: 14 of 509 spots over 2 in xz and 4 refused, the refusals' hits 8.4 to 11.4 from the body; then 439 offered and none refused within the reach -- a sample that missed the edge hits.) What the target's height does to a climb over is, in the original, the steer's (`FUN_005b3340`, `CLIMB_STEER_READING`); in the port, the climb's vertical steer reads the top (`traversal.ts` `lift`, :1001-1005, computed at :1230 and used at :1234 and :1271) and the climb over ends on the floor under its clip's end (`floorUnder`, :1264-1266) -- neither measured here | `'world'` | LATER 142's build (the collider's frame carried through to the climb's polygons), and a capture of a climb over at MP1 `alaska4d_fence01`, at the two spots the pin holds, each at the stand-off through the walk's contact selection: a body at (1615.65, 49.97, 1985.91), standing or crouched, whose low line meets the fence's top edge at (1614.02, 56.47, 1983.16), 3.20 away -- offered in the world's frame, refused in the collider's: whether CLIMB is offered there and the press climbs; and a standing body at (1699.86, 50.26, 1967.64) whose low line meets the face's end at (1698.63, 56.76, 1964.70), 3.19 away -- the target's height 57.88 in the world's frame, 34.25 in the collider's: the aligned start, the clip's path and its end height against both frames' targets -- **retired 2026-10-19 by LATER 142** (section 8.10): the frame carried; the two spots' outcomes were f32 rounding at the boundary hit; the captures owed move to section 8.10's witnesses |

### 8.10 Placeholders and the read behind LATER 142's build: the collider's frame carried, a hit at its cut's end (2026-10-19; reading, pending review)

LATER 142 (the merge controller's GO; branch `agent/l142` from main 7f5001734). Source inspection of the decompilation;
dev-disc scratches through the repository's readers over the disc's 34 maps (deleted); the dev-disc pin
`climbFrame.disc.test.ts`, the fixture pin `climbEdgeInset.parity.test.ts` and the unit pin `climbColliderFrame.test.ts`.
No capture, no browser.

**The frame.** `FUN_002dbfb0` and `FUN_002dc090` (D:L180187-180212, D:L180218-180248) build the contact's collider
matrix with `FUN_003109f0` (D:L212151): the node's own matrix composed up the parent link `+0x64` until a node of
runtime type 6 (`+0x58`), not included; a null parent first returns 0 (no column, no cut). Type 6 is the world root: the
one store of 6 to `+0x58` in the ELF is the world's constructor `FUN_00320310` (D:L221318; the singleton `DAT_0045c380`,
research 213's world root). No node read from the disc's 34 scene graphs has type 6 (their types 1, 2, 7, 8, and three
with high bits set whose low half is 1 or 2), so the walk stops only at the world root, and every hull polygon is under
it: the "none met" branch is not reachable from the hull. `flattenScene`'s `world` composes the same chain plus the world
model's own root, identity on all 34 maps: it is the frame. Every non-upright node frame on the 34 maps is a rotation
with uniform scale (row lengths within 1e-4, rows orthogonal), so `FUN_00308160`'s transpose over row 0's squared length
is its inverse. A known difference no climb face reaches (LATER 142's review, F3): an *upright* node with non-uniform scale carries no
frame, so the port takes its column and cut in the world's frame, where the original's `FUN_00308160` -- no true inverse
there -- would carry the hit into a distorted frame; the review's census on the 34 maps: 24 wall polygons under such
nodes, none of them a climb face.

**The build.** `collisionOwners` (`@s2u/scene` `grid.ts`) sets `CollisionOwner.frame` -- the node's `world`, absent when
upright (`m[1]`, `m[4]`, `m[6]`, `m[9]` zero and `m[5]` over 0: the column and the cut come out the same in either frame);
`groundPolygons` (`mover.ts`, the one hot hunk) gives each polygon its owner's frame by reference (`WorldPoly.frame`);
`contactOf` takes the column (`columnTop`, `'inside'`'s limit as before) and the cut (`crossSection`) on the polygon's
points carried into the frame, mapped back out (`climb.ts` `colliderColumn`). The page and the room both read the hull
through `collisionOwners` and `groundPolygons` (`simMap.ts`, `loadMap.ts`, `forkGround` unchanged); the forge's pieces
carry theirs since LATER 146 (2026-10-19; reading, pending review): `forge/ground.ts` `prototypePolygons` gives each
polygon its frame in the prototype's model space (the placement's inverse times the owner's frame; none for the
placement node's own owner, or a frameless owner under an upright placement), and `layoutGround` gives a piece one
owner a run of polygons sharing it, carrying the piece's matrix composed with it (the piece's matrix alone where the
run has none; none when the piece turns about y alone, `uprightFrame` on its stored matrix) -- the page's layout and
the room's (`match/src/forgeSimMap.ts`) through the one function. Pinned on the dev disc (`forge/pieceFrame.disc.test.ts`):
MP1's fences, MP2's container, M52's truck and railcar and M82's truck placed as pieces at their own disc placements
carry the base's frames, the column top equal to the base's at all 19,424 on-face hits; every prototype on the 34 maps
placed as a moved piece (turned 0.7 about y and shifted) has each of its 20,675 polygons' up axis its collider's from
the scene graph within 3e-8 rad; and a door prototype's piece reads its owner's rest frame (`restFrame`) where LATER
142 dropped `frame` -- LATER 146's review F1: MP1's `dredge_door`, placed tilted 2.0 degrees, had taken that
placement's inverse as upright, a 2-degree frame on the page and one upright to about 1e-4 degrees in the room, whose
library owners keep their frames (`match/src/forgeSimMap.ts` `archiveParts`); now bit-identical on both over all 795
prototypes. A known limit at a moved piece: the column top at a short near-vertical end edge is f32-ill-conditioned
(M52's `m52_railcar03` turned 0.7 about y and shifted: 40 of 7,776 on-face hits over 1e-2 from the base's, up to 1.32,
the frame within 2.1e-4), as at the cut's end above. The points carried in are the archive's model-space points to f32 rounding (2.3e-4 at most
on the disc's tilted climb faces): the top against LATER 115's model on the archive's own points is under 2.5e-4 at all
11,232 on-face hits of MP1, MP2, M52 and M82, the cut and the class alike. The frames: 0 (MP8, MP53) to 543 (M52)
framed nodes a map; with a climb polygon MP1 16 (the fences, up to 8 degrees), M52 7, MP52 3, M81 2, MP6 2, MP2 1 (1.47
degrees), M82 1 (0.43) -- M81's, MP52's and MP6's leaning under 0.005 degrees; no door and no upside-down frame holds a
climb polygon. **A door's owner carries no frame** (the merge controller's ruling): the original builds the frame live each
call (`FUN_003109f0` walks the current matrices), so it follows the swing, and the port turns a door's points in place
in the world (`doors.ts`), so the world frame is the live one -- for a door whose frame is upright up to rounding; MP1's
`alaska4d_outhouse_door` (1.55 degrees) is a known difference there, the original's live frame staying tilted as it
swings while the port's path is the world's, and it holds no climb polygon (LATER 142's re-review, G3); a frame kept
from the load could only go stale.
`readDoors` drops it where it marks the owner's `sweep` (`doors.ts`, before the pack), keeping it as `restFrame` for the
forge's pieces of a door prototype alone (LATER 146: the piece stands still; the walk and the climb never read it,
`groundPolygons` copying `frame` only). Of the disc's 249 door owners
(34 maps) 108 would have carried one -- MP1's `alaska4d_outhouse_door` leaning 1.55 degrees, the rest under 0.001
(rounding in the rotation's off-axis terms) -- and none holds a climb polygon; `climbFrame.disc.test.ts` pins it (MP1 7
and M82 12 framed before the change).

**A hit at its cut's end (`CLIMB_EDGE_INSET_PLACEHOLDER`, the merge controller's ruling).** The port's walk hit is the
nearest point of the wall's cut (`mover.ts` `slide`: `nearest` over `bandFootprint`); at an outside corner it is the
cut's end vertex, on the polygon's boundary, where the original's hits, segment crossings (`FUN_002d4cc0`
D:L175906-175960, research 281 s4.1), almost never land. There f32 rounding decides the column, in both frames:

- **In a tilted collider's frame** the boundary column is ill-conditioned. At section 8.9's first pinned spot a hit moved
  1e-5 inward is offered in the collider's frame (pinned: refused); at its second, 1e-4 inward, the collider's 34.25
  becomes the world frame's 57.88. The hull's points carried in and the archive's own disagree at 730 of 2,851 MP1 cut
  ends at 1e-5, 19 at 1e-4, 1 at 1e-3, none at 1e-2. LATER 115's 410 and 80 offer flips (section 8.9) were this rounding,
  not the frame.
- **In the world's frame** (beyond LATER 115) `'inside'`'s clamp (LATER 111) still keeps no edge, or one, at the end of a
  face not aligned to the axes or whose end is not quite vertical: the top NaN or the hit's own height, no offer. Through
  the slide's own hit, a body 3.2 in front and 0.05 to 1.5 past a face's end at the low line: refused at 114 of MP2's
  1,352 corner contacts (Frostfire's `prop02` among them), 53 of MP6's 218, 31 of MP8's 127, every one offered 0.01
  inside, none the other way. (At `crossSection`'s own ends, a coarser count, every map but M63, M71, MP62 and MP82 gains
  offers; MP72 `di_climbwall` 72, MP52 80, M52 69, MP51 18 and M83 5 sampled ends lose one.)

The placeholder moves a hit within 0.01 of its cut's end (the cut's first two crossings at the hit's height) to 0.01
from it, before either frame's column and cut; the contact's point stays the hit. The outcome is the same for any inset
from 1e-3 to 1e-2 (3 of 2,851 MP1 cut ends change between them); at 1e-2 no offer at an MP1 cut end differs from the
world frame's. Its cost: a sloped top's corner takes the slope 0.01 in (`traversal.test.ts` R4: 20 -> 20.01). A hit on a
non-convex face's third or later crossing -- beyond the first pair's ends by more than 0.01 -- is taken as it is
(LATER 147; LATER 142's review F1: was moved onto the first pair's end, `climbColliderFrame.test.ts`'s U-wall).

**What changes, by the frame** (the hit inset; a census over static bodies on MP1 -- bodies every 0.25 within 3.5 in
front, both stances, each still, the walk's contact selection applied once: not walked): of 100,554 such contacts on the
fences 14 offers change -- fence02's two top corners near (2413.7, 3112.0) and (2575.1, 3220.2), refused in the world
frame (its top at the hit's height, the obstacle ray at the top + 0.5 on another polygon), offered in the collider's --
and the target's height moves over 2 at 2,519 (up to 9.62) and its xz up to 5.56. Through the port's walk the two
corners are not refusals (LATER 142's re-review, G1, as LATER 115's F7 found for its own witness): near the first, at 36
poses (back-offs 0, 1, 3 and 6, 1 across either way, the yaw 20 degrees either way), today's code offers wherever the
build does, the target 251.4 to 252.2 against 252.2; at the second, a walk from (2580.11, 228.77, 3219.72) facing 95.71
degrees has today's prompt at ticks 6 to 22, none at 23 to 27, and again from 28 (the target (2572.28, 235.82,
3219.45)), and the build's from 6 to 36 without a break (the target (2574.85, 235.81, 3221.18)): a 5-tick gap and a
3.10 shift in xz, not a refusal.
LATER 115's sample of 439 offers as the model, the target within 0.01. Off MP1's fences, at hits on the faces, no class
changes and the top moves 0.17 at most (section 8.9's census); at their cut ends the frame and the inset were measured
together only (MP2 `container_blue01`, M52's trucks and railcars, M82 `m82truck_utility`), not apart.

**Pins** (RED on main 7f5001734, then GREEN): `climbColliderFrame.test.ts` (a 20 x 10 face rolled 30 degrees: the top
59.66 at local (2, 10), was 61.68; the cut's end 98.5, was 97.92; the frame through the pack and `forkGround`);
`climbFrame.disc.test.ts` (the frames carried; the census against the model; MP1 (1615.65, 1985.91) the target at the hit
(1614.02, 1983.16), was 3 in from a short cut's end (1616.45, 1981.41); (1699.86, 1967.64) 57.88 in both frames (section
8.9's 34.25 was rounding); (2410.75, 3111.25), a static-body census case: offered, refused at the census's still body
(the walk offers it both ways, G1); (1802, 1953) the target 66.17, was 56.55);
`climbEdgeInset.parity.test.ts` (MP2 `prop02`'s and MP6 `mp6_justbox1`'s corners: the top 111.85 and 13, was NaN).

| name | stands for | value in the code | the evidence that settles it |
|---|---|---|---|
| `CLIMB_EDGE_INSET_PLACEHOLDER` | a hit within this of its cut's end is moved this far into the cut before either frame's column and cut (`contactOf`, `insetHit`); no source gives it -- it stands in for the original's hits landing inside the cut, segment crossings (`FUN_002d4cc0` D:L175906-175960); stable from 1e-3 to 1e-2 (above) | `0.01` | PAR-21 C3's segment records (the walk's hits then crossings: the placeholder dropped), or a capture at an outside corner of Frostfire's `prop02` (the CLIMB icon, the crate climb to 111.85) and at MP1's three spots that hold through the walk (LATER 142's re-review, G1): `alaska4d_fence01` (1802, 1953), the target's height 56.5 to 60.5 today and 66.15 to 66.17 built; (1699.86, 1967.64), 57.88 in both frames; (1615.65, 1985.91), the target's xz at the hit (1614.02, 1983.16) built, 3 in from a short cut's end (1616.45, 1981.41) today -- the climb over's end against each |

### 8.11 The read behind LATER 147: a non-convex cut (2026-10-19; reading, pending review)

LATER 147 (filed by LATER 142's read and review; the merge controller's GO; branch `agent/l147` from the lane
`daf34d5db`). Source inspection of the decompilation and of the game ELF's machine code; a scratch census of the disc's
34 maps through the repository's readers (not committed); the dev-disc pin `climbCut.disc.test.ts`. No build of the
climb, no capture, no browser.

**The original's pair.** `FUN_002dd2b0` (D:L180803-180884), the cut, keeps every crossing: each edge, the previous point
to the current, the first from the last point, that spans the height (D:L180846-180847) writes its point 12 bytes on
(D:L180849-180866), unsorted, in the edges' order, and the count is returned (D:L180884). `FUN_002dc090` refuses under
two (D:L180239-180240) and carries all of them out of the collider's frame in place (`FUN_00308640`, D:L180244).
`FUN_005b3a60` reads the first two only (`pfVar1[0..5]`, D:L469038-469077): on a cut of four crossings the climb's
segment is the first pair in the edges' order, whichever stretch the hit lies on, so the target follows the polygon's
winding there. The port does the same (`crossSection`, `ClimbContact.edge`). **The column reads no pair**:
`FUN_002dd4d0` (D:L180890-180955) keeps every edge whose span holds the hit strictly (`FUN_002dd690`) and takes the
highest and the lowest, as `columnTop` does. LATER 147's row ("the column and the inset read the cut's first pair") is
corrected: the inset alone does (`CLIMB_EDGE_INSET_PLACEHOLDER`, section 8.10), and only the walk's boundary hits reach
it, which are offered on climb faces alone (`Traversal.keepContact`), whose cuts have at most two crossings (below).

**The cut's buffer: a known difference no map reaches.** The push `FUN_005b2620` passes a 32-byte buffer, two
crossings, to the cut (`auStack_60[32]`, D:L468309, at D:L468422), and its top lies straight after it (`auStack_40` /
`fStack_3c`, D:L468310-468311). The ELF's code agrees (a 256-byte frame: the cut at sp+0xa0, the top sp+0xc0, the bottom
sp+0xd0, the target sp+0xe0, the saved registers under sp+0xa0; the height's load `lwc1 196(sp)` at 0x5b2a7c after the
cut's call at 0x5b2a38). A third crossing writes the top's x (unread: `FUN_005b1a10` reads the top's y alone,
D:L467887); a fourth writes the top's y with its own x in the world -- the height (D:L468431), the target's height
(D:L468504 -> D:L467887) and the ladder's top - bottom (D:L468439) then read it; a fifth the bottom, a sixth to eighth
the target and the direction, a ninth the caller's frame. On the review's U-wall (`climbColliderFrame.test.ts`; a
scratch, both windings, the hit at height 7) the port's top at x 25 is 12, its target the hit; the original's push would
read the top as 10 (the listed winding) or 30 (reversed): the overrun, not a rule. The port keeps the transcription,
without the overrun: no constant, no placeholder, no ledger row -- no climb face or ladder on the disc has a cut of more
than two crossings (below), pinned by `climbCut.disc.test.ts`.

**The column's buffer: the push's saved class register, reachable -- LATER 156.** `FUN_002dd4d0` keeps its points in
four slots (`uStack_30` / `auStack_24[9]`, D:L180900-180903; sp+0x90 in a 192-byte frame), so a fifth point lands at
its entry sp: `FUN_002dbfb0`'s sp+0, where `FUN_002dbfb0` saved its caller's `s0` (`sq s0,0(sp)` at 0x2dbfc4, restored by
`lq s0,0(sp)` at 0x2dc07c; a 272-byte frame, no stack argument between). In the push, `s0` holds the contact's appflags
class across that call (`andi s0,v0,0x7` at 0x5b27e0, the call at 0x5b2818, `andi s0,s0,0xff` at 0x5b2830 feeding the
ladder test at 0x5b2838 and the class switch at 0x5b2a98-0x5b2abc): on a wall whose column writes the fifth slot the
push takes as its class the low byte of that point's x bits in the collider's frame (it can be 1 to 5, a ladder or a
climb), not the polygon's. The fifth slot is written by a fifth kept edge, or by `FUN_002dd690`'s uncounted end-point
write after four kept (the projection within 1e-5 at or before an edge's end writes that end and returns 0,
D:L181005-181011, D:L181022-181028; an edge with no length in xz always does). *(Corrected by LATER 156, section 8.12:
the press is NOT reached on a plain stored wall -- `FUN_005b4b40` runs only when the HUD's climb bit is selected, which
needs a climbable offered contact (section 1, 2.1); a plain wall is offered nothing and its stored contact is never
pressed. The column overrun on a plain wall is reached instead by the obstacle ray's replacement feeding the push and
the offer -- which reaches no exposed face on the disc -- and by the slide test `FUN_0054f330` every tick, which reaches
M71. Was: "The press handler `FUN_005b4b40` pushes any stored contact the body faces at 0.3 or more (D:L469641-469662,
unless the controller's `+0x34` answers), reading the column before the class, so every wall the move solver stores is
exposed.")* Counted exactly over the 34 maps (each wall's
face in its collider's frame, one point in every cell of the strict test's lines and the face's edges): 78 walls with a
column of more than four kept edges, 66 of them kept by the move solver (`moveHit`), and 11 more kept walls written by an
end write alone -- 77 kept walls in the PORT's computation (its carried-in f64 points and frame inverse; not the original's exposure, which LATER 156's read owns: the original's f32 points over the archive may keep fewer edges -- MP72 `sign_noenter`, M53 `tower_ruin_3` and the cellar doors by its first single-map scratches), snapshotted by map and path in `climbCut.disc.test.ts`: MP82's `worldmodel/wc` x24,
M53's `tower_ruin_2` / `tower_ruin_3` x4, `ext3_wc5`, `reg28` and nine `m53_doorcellar1` doors, M71's `di_good` x4 and
`g25472`, M72's `g800`, `g903_1`, `g936_1`, `g942`, `g944` x2, `g3866` x2, M73's `g734`, `g747`, `ballroom_down/g44`, MP1's
`pipe/dipip` x2 and `dicamonly`, MP53's `bunker1` / `bunker3`, MP61's `di_ext01` / `di26`, MP7's `dish_di`, MP71's
`building_really_small`, MP72's `basket_open_up` x2; by an end write, M73 `g618`, MP5 `di_bridge1_2`, MP51 `di_good`, MP6
`tank_1` and the truck's two tanks, MP72 `sign_noenter` x2, MP73's `di_wheels` x3. LATER 147's review counted 65 and 53
by sampling each face on a grid (24 steps a fan triangle), which this census reproduces; the exact count adds 13 walls
whose cells are thin (the nine doors and MP61's `di_ext01` met by no point of 200,000 random ones on the face, M71
`g25472`, MP61 `di26` and MP71 `building_really_small` by 3e-4 to 8e-4 of them; whether f32 keeps those cells is unread),
and a grid four times finer finds two of them. The share of a face's points that write the fifth slot runs from 3e-4 to
0.40 (MP72 `basket_open_up`); this note's first census sampled one line per face and found 8. What the class byte is at
the hits a body can make, what the misread class then plays, and what the offer (`FUN_005b3ce0`) and the obstacle ray
(`FUN_0054e430`) do with the same overrun (each calls `FUN_002dbfb0` with its own saved registers) are LATER 156's read, as are the overhangs the snapshot leaves out -- the original stores any hit the move solver keeps and the press pushes it faced at 0.3 or more, so a face with a horizontal normal between 0.3 and the port's 0.7 is exposed the same way (the narrow re-review's sampled census: 20 such faces with a fifth kept edge, among them M53 `vault_wc1` x2, M72's `g1557_1`, `g930` and `g945`, M73's `g723/g1543` x4, MP1's `alaska4d_outbuilding01/roofdi` and MP6's `building_wc2/big_concrete1`);
no build without the owner; then a capture row at MP82 `worldmodel/wc` or M53 `tower_ruin_2`.

**The cut's census** (the scratch, then the pin; each polygon in its collider's frame, `WorldPoly.frame`, the cut counted
at each vertex's height and between them). 201,027 walls (`contactOf`'s: a horizontal normal of 0.7 or more) on the 34
maps; 1,450 climb faces (appflags 4 and 5) and 158 ladders among them, none with more than two crossings at any
height. Over two: 11 walls, all plain (appflags 0), four crossings each -- three with a band of height (M52
`wc5/exterior213434_1`, 57.97 to 58.61; MP52 `pipe3434_3/g21085_8`, 0.49 high; MP83 `wc01_soBld02`, 0.008 high), the
rest at a vertex's height alone or level in their frame (M52 `wc1/g20689`, `wc1/g20694`; M63 `room_table_kit02` x4;
MP72 `basket_open_up` x2). MP1's `alaska4d_fence01` caps (appflags 5) count four at their own height by f32 rounding but
are level, with a horizontal normal of about 0 (no wall, never a contact: the port's 0.7, the original's facing tests
0.3); the pin's first disc run was RED on them before its check was narrowed to walls. Reached by the obstacle ray
(`obstacleRay`; the scratch's bodies 3.75 in front of every climb face, 32 columns, each floor between the column's
bottom - 2 and its top - 5: 41,613 spots, 1,441 replacements): none on any of the 11. The one climb face within 30 whose
top + 0.5 meets a band is M52 `g20311_8` against `g20694`'s band of no height, 26.3 away, past the ray's reach (1.1 of
the body's distance to the contact). A plain wall pushed with its class intact returns at the class switch (D:L468492)
before the top is used; the port's ray contact is the named departure PAR-21a F1, `Traversal.keepContact`. **For the cut
no offer, band or target changes**: LATER 147 is closed on this read, nothing built; the column's overrun is LATER 156.

### 8.12 The read behind LATER 156: the column overrun's class, callers and reach (2026-10-19; reading, pending review)

LATER 156 (filed by LATER 147's read and review; the merge controller's GO, read only, no build either way without the
owner -- modelling an original's stack overrun is a quirk he holds for his own validation). Source inspection of the
decompilation and of the game ELF's machine code; dev-disc scratches through the repository's readers over the 34 maps
(`SOCOM_DISC`; deleted, not committed). No capture, no browser, no build. A fresh review returned PASS WITH FINDINGS
(medium), F1-F6, folded here. Everything in this section is reading, pending review (the M71 slide-test outcome is an
unread **hardware** reading, below).

**The overrun, past `s0`.** `FUN_002dd4d0` keeps four points (`uStack_30` / `auStack_24[9]`, sp+0x90 in a 192-byte
frame); the fifth and later writes land in its caller `FUN_002dbfb0`'s saved registers (ELF 0x2dbfb4-0x2dbfc4,
restored 0x2dc070-0x2dc07c; a 272-byte frame, no stack argument between): the slots counted from 1, slot 5 -> `s0` (sp+0),
slot 6 -> `s0`'s high word and `s1`'s low 64 bits (sp+0x10), slot 7 -> `s2`'s low word (sp+0x20), slot 8 -> the rest
of `s2`, slot 9 -> `ra` (sp+0x30). A write is a kept
point (a fifth edge strictly spanning the hit) or `FUN_002dd690`'s uncounted end-point write after four kept
(D:L181005-181011, D:L181022-181028). The point's three floats are stored 12 bytes apart, so the fifth point's x lands
on `s0`, its y on `s0`'s second word (bits 32-63), its z on the third. The column is computed in f32 (`FUN_002dd690`'s `mula.s`/`madd.s`, the frame
inverse `FUN_00308160` and the transform `FUN_003085c0`, both VU0 macro code), on the collider's own model-space points.

**The class the push then takes.** `FUN_005b2620` masks the contact's appflags class to `s0 & 0xff` (`andi s0,v0,0x7`
0x5b27e0; `andi s0,s0,0xff` 0x5b2830) and, after the column call `FUN_002dbfb0` at 0x5b2818, dispatches on it
(0x5b2a98-0x5b2ac4): class 3 (target, then the height table `FUN_00580b70`), 1 (the table, midpoint target), 4 (the
table, but h <= 5 pushes nothing and h > 32 returns 0), 5 (`Climb over`, `FUN_00580a80`, any height), 2 (the ladder's
reservation), anything else returns 0 (nothing). So on a wall whose column writes the fifth slot the push takes as its
class the low byte of that point's x bits, not the polygon's: it can be 1-5 (a climb or a ladder) or any other byte
(nothing). The ladder path (class 2) on a plain wall then looks the ladder id up (`FUN_002a90f0`, D:L150260, returns
null) and `FUN_005b1130` finds no ladder under it (D:L467600-467612): no mount; online a request is sent
(`FUN_002b9f60`, unread). A slot-7 write also clobbers `s2`, the contact's normal pointer `FUN_005b1a10` reads at
0x5b2cd4 (a bad pointer): only M71's rubble reaches it (below).

**The seven callers of `FUN_002dbfb0`** (exactly seven, the reviewer re-counted: D:L180183 is the definition;
D:L416734 the ray, D:L417235 the slide test, D:L468371 the push, D:L468997 the drop test, D:L469220 and D:L469252 the
offer's two, D:L469641 the press). Each saves its own `s0`/`s1`/`s2` at the slot the overrun writes:

| caller | FUN | `s0` at the call | an overrun's effect |
|---|---|---|---|
| push | `FUN_005b2620` | the contact's class (0x5b27e0) | the class switch above; a slot-7 `s2` is the normal pointer (fault) |
| offer, class 2 | `FUN_005b3ce0` D:L469220 | the class / `s1` the contact / `s2` the actor | the offer runs only when the contact's own class matches (`uVar9 == param_2`, D:L469130-469131), so a plain wall never reaches it; the full 64-bit `s0` compares can't match a misread class |
| offer, class 4 | `FUN_005b3ce0` D:L469252 | `s0` the class; here on the **ray's** result `uVar8` | `s1` (the result) faulted at D:L469263's read if slot 6 written |
| ray | `FUN_0054e430` D:L416734 | `s0` the contact pointer (dereferenced 0x54e578, or returned to the offer) | run on the original climbable contact (safe); its replacement is stored by `FUN_005b0d30`, not column-read here |
| press | `FUN_005b4b40` D:L469641 | `s0` the contact pointer | called only for a class-2 (ladder) contact (`((...pfVar8[3]...) >> 4) == 2`); for other classes it goes to the push |
| drop test | `FUN_005b3890` D:L468997 | `s0` the contact / `s1` a flag / `s2` the actor | class-2 contact only; `s2` faults if slot 7 written |
| slide test | `FUN_0054f330` D:L417235 | `s0` **the actor** (`lh v1,372(s0)` at 0x54f3b4 straight after) | the M71 finding below |

**What the press can reach (F, the reviewer's correction to section 8.11).** The press `FUN_005b4b40` is called by the
driver only when the controller's bit 0x4 is set (D:L418121, D:L418153), which `FUN_00592d50` sets only when the HUD's
climb bit is selected (section 2.1), which needs a climbable **offered** contact (section 1). A plain stored wall is
offered nothing (the offer wants the contact's own class, D:L469130), so it is never pressed. Section 8.11's "every wall
the move solver stores is exposed" is wrong. The plain-wall column overrun is reached only two ways: (a) the obstacle
ray `FUN_0054e430`, run by the offer on a climbable contact, replaces the stored contact with a wall behind the ledge
(`FUN_005b0d30` D:L416793); the same frame's offer (class 4, D:L469252) and the next press's push then column-read that
replacement; (b) the slide test `FUN_0054f330`, run every physics tick on the steep ground polygon under the feet
(`FUN_0054edf0` D:L417032, when no `Climb over` plays, D:L416558-416560).

**The frame order** (research 230 section 5.2.2, 251 section 12.5). The actor's vtable 0x6691a0 runs the pad copy
`FUN_00551ec0` (+0x14), the driver `FUN_00550ef0` (+0x18) and the actor update `FUN_005506a0` (+0x20), and the slide
test runs under the driver (`FUN_00550ef0`'s vtable +0x28 call at D:L418458 -> `FUN_0054d9a0` -> D:L416560 ->
`FUN_0054edf0` -> `FUN_0054f330`); the HUD's offer runs later in the state tick (D:L50801, then D:L50856 ->
`FUN_001f7ff0` -> the picker `FUN_0021d9d0` D:L73286 -> `FUN_00593500`). The press (+0x18) runs before the HUD, so the
contact the press would read is the one the previous frame's offer saw, after any ray replacement.

**The reach census** (dev-disc scratch; deleted). For every wall and overhang the move solver keeps (`moveHit`,
appflags-free), the column rebuilt in f32 on the archive's points, at the hits a body can make (the low line 6.5 and
the idle head lines 12.138 crouched / 19.394 standing, over floors in front within 9.43), under two rounding models;
and the ray from every climbable face within 25 of an overrunning face.

- **75 faces write the fifth slot or beyond**: by the one-point-per-cell test, 55 walls (horizontal normal 0.7 or more)
  and 20 overhangs (0.3 to 0.7). That test undercounts the thin overruns (F1): 400,000 random f32 points per face
  add M53 `tower_ruin_3` ×2 (cells 0, randOver about 1001 of 363,927 under both models), so **the walls are at least
  57**. The maps: MP82 `wc` ×24 (three vault levels), M53, M71, M72, M73, MP1, MP5, MP53, MP6, MP61, MP7, MP71, MP72.
  Deepest: M71's rubble reaches slot 7 (`s2`); MP1 `pipe/dipip`, MP7 `dish_di`, MP72 `basket_open_up`, MP6
  `big_concrete1` and MP1 `roofdi` reach slot 6.
- **The ray reaches none of them.** On M53 one climbable contact stood within 25 of an overrunning face and cast 5,413
  rays; zero replaced a face (exposed or other). On every other map no climbable face stood near an overrunning one.
  So no plain wall is pressed or offered on the disc.
- **The class byte is not a prediction (F5).** The two rounding models (nearest, and toward zero as the repository
  reads the EE) are not a bracket -- they omit `madd`'s internal precision, flush-to-zero and VU0's inexact multiply.
  Which faces and slots overrun is robust (it turns on the kept-edge count, not the arithmetic's last bits); the class
  byte at a given hit is not. Of about 20,040 reachable hits writing slot 5, about 1,130 give a fixed byte (an end
  write, or an x with no run), none of them 1-5 (they read 0, 23, 142); the rest interpolate, reading 1-5 at about 1
  hit in 150 (nearest) or 1 in 80 (chop), the two models disagreeing at 8,022 of 20,041.

**The M71 slide-test freeze (an unread hardware reading).** `FUN_0054f330` (D:L417208-417260) takes the column of the
steep ground polygon under the feet with `s0` the actor, then `lh v1,372(s0)` at 0x54f3b4. On an overrun `s0` becomes
the fifth point's x bits and that half-word load is of an arbitrary address. M71's `hallway_blocked/good_parts/di_good`
(two instances: #6347 at 2675,187,1282 and #7554 at 2442,345,1900; ditype 3 ground, surface-word bits 28-30 = 4 which
passes `FUN_0054f330`'s byte-0xB test D:L417222-417227, slope 54 degrees, normal y 0.589 just over max_slope's 0.6428)
has its overrun from the foot up: the lowest overrun point y 188.14 over a foot at 188.10. Stopped by the wall probe
(radius 3.5) a standing body reaches about 0.8 onto the ramp (the reviewer's measure; this note's first report said 1.2
in error), where the overrun already begins (the lowest overrun point is 0.04 over the foot), so the strip a body
reaches does overrun. **Over the step band (the 6.5-high band at the ramp's foot, about 4.7 units across on the
54-degree ramp, over the ramp's width): 2,097 of 6,802 points overrun (30.8%).** The ramp is steeper than max_slope, so it stops a
body rather than being climbed, which is exactly why the slide test runs on it each tick a body stands at its foot; the
same function runs for every actor, bots included.

What the bad half-word load does is a **hardware** reading, not a code reading (F2): the game installs no exception
handler of its own (`FUN_001abfd8` and the 0x1ac038 installer are never referenced), so the BIOS default takes any
fault, and whether the EE runs in kernel mode here is unread. `lh` needs an even address, so an odd bit pattern faults
(AdEL) anywhere; a few even patterns land in a known-mapped window (in kernel mode: ±0, where -0.0 = 0x80000174 is
KSEG0 RAM; the BIOS window x in (-2, -1.5] = 0xBFC00000-0xBFFFFFFF; the IOP's RAM window x in (-0.009765625,
-0.0078125] = 0xBC000000-0xBC1FFFFF). Of M71's 2,097 step-band overrun points, **1,961 (93.5%) fault** (678 of them
odd); the other 136 land in physical space 0x1C200000-0x1FBFFFFF (x in (-1.5, -0.0098]) whose EE behaviour is unread;
none land in a known-mapped window -- so between 93.5% and 100% of the step band's overrun points are a bad load. What
the BIOS default handler does with it (a reset, a hang, a silent return) is the unread part; a capture on real
hardware would settle it (HUMAN_TASKS, below). The port models none of this.

**The other steep-ground overruns do not plausibly freeze (F4).** The slide test needs the body's feet standing on the
face (the floor pick returns it), which an ordinary body does only on a near-walkable slope:

- **M71 `hallway_blocked` ×2** (54 degrees, ny 0.589): a genuine rubble ramp just over the slope limit, the floor pick
  holds a body at its foot -- the finding above.
- **M72 `g362/g3866` #6607** (about 78 degrees, ny 0.203, 5.06 tall, under a step): 11 of 1,381 step-band points
  overrun (0.8%), all 11 fault. Near-vertical; a body's feet rest on it only if the floor pick returns it over the
  genuine floor there, unlikely.
- **MP72 `basket_open_up` ×2** (about 80 degrees, ny 0.167, 8.7 tall): 1,792 of 3,904 of its narrow step band (45.9%),
  1,627 faulting. Near-vertical; a body would have to stand on the basket's own face.
- **MP1 `pipe/dipip` #7607** (about 83 degrees, ny 0.122): 57 of 1,081 (5.3%), all faulting; `dipip` #7597 0 of 1,034;
  `dicamonly` #7637 20 of 7,518 (0.3%). Near-vertical pipes.
- **M53 `tower_ruin_2` ×2** (about 87 degrees, ny 0.050): 39 of 7,068 (0.6%), all faulting. Near-vertical.
- **M53 `tower_ruin_3` #5495** (ditype 3, ny 0.050): the same near-vertical case as `tower_ruin_2`.
- **MP6 `building_wc2/big_concrete1`** is a wall (ditype 2, not ground), so the slide test never takes it.

So on the disc M71's ramp is the one steep ground face a body stands on where the overrun begins at the foot; the rest
are near-vertical "ground" the floor pick is unlikely to hold a body against. Unread: a fall or landing onto the
near-vertical faces, and the floor pick's exact behaviour on an 78-87 degree ground polygon.

**Against LATER 147's f64 snapshot** (section 8.11's `climbCut.disc.test.ts`, 77 walls). That pin runs the column in
f64 on points carried into the frame through an f64 inverse. The f32 set on the archive's own points is 55 walls by the
cell test, 57 with the two `tower_ruin_3` instances the random sample adds. The 20 in the f64 snapshot not in the f32
set split two ways:
- **The ten end-write faces**: M73 `g618`, MP51 `access2/.../di_good`, MP6 `tank_1` and the two truck tanks, MP72
  `sign_noenter` ×2, MP73 `di_wheels` ×3 (checked: MP72's sign keeps 2 at most in either frame). Seven of the ten carry
  a rotated frame (the two truck tanks, `di_wheels` ×3, `sign_noenter` ×2), where **the f64 inverse slants exactly
  vertical edges** (a zero-length xz edge becomes a short counted one). For MP6 `tank_1` (identity frame) and M73
  `g618` and MP51 `access2/.../di_good` (translated only) the f64 inverse can't slant their vertical edges, so their
  cause is **unread** (`tank_1`: no overrun in 140,732 random f32 points).
- **Thin, unresolved in f32**: the nine `m53_doorcellar1` cellar doors (only translated, no rotation) and MP61
  `g1902/di_ext01` -- their overrun cells are so thin that the one-point-per-cell and 400,000-random f32 samples miss
  them; whether f32 ever lands in them is unread. M53 `tower_ruin_3` ×2 are in both sets: the f64 snapshot lists both
  instances, and in f32 the random sample finds their overrun where the cell test misses it. The snapshot's number is a pin of the current code's f64 behaviour; refiling it is the
  seat's call.

## 9. Against earlier notes (history kept; those notes are not edited by this row)

- **Research 86 section 2.3** ("The contact, no button. `FUN_005b4b40` (decomp 469562) runs each tick ... Walking into
  the ladder mounts it"): by section 2.4 `FUN_005b4b40` runs only on the frame of the controller's bit 0x4
  (D:L418121, D:L418153 through `FUN_0057f2a0`), set by the jump's press and the Action's release alone; the jump's
  request returns at D:L469594-469596. The ladder therefore mounts on the Action's release with the CLIMB icon. Reading,
  pending review; for the ladder's owner (`LADDER_PRESS_READING`).
- **Research 86 section 3.5** (the climb's steer as `FUN_005b2d20`, its 30 a second, 46 ticks and abort past 30): already
  corrected by research 230 section 3.3's review (the one-shot branch is `FUN_005b3340`); section 3 here reads that branch.
  The port's `ALIGN_*` constants cite the looped branch.
- **Research 251 section 6, F3** ("A climb *is* startable under a still clip in the original by this read (the non-looped
  branch's contact call, D:L418131-418132 ...) ... which frame that is turns on `FUN_005469c0` and `cVar7` ..., not
  read") and **section 12.2** (PAR-28's end 2, built): the frame is now read (section 2.1) -- the Action's release with
  the climb selected -- and the selection needs the offer, which the reload lock refuses (`FUN_005b4340` code 2,
  D:L469416; the common gate, D:L462636). So a player's climb never starts under a still clip; the pop that ends one
  (D:L442186-442214) is real but not reached that way. PAR-28's wiring is harmless once the offer refuses (B1).
- **Research 86 section 3.7** ("a stance button climbs on stand and lets go on crouch or prone (`FUN_00581ed0` ...)"
  and "an action with nothing offered" lets go): by the review's F1 and F2, folded in section 5, neither reaches a
  hanging player -- `FUN_00552ec0` refuses every stance request in state 4 (D:L418948-419015), and the no-offer latch
  runs only with the HUD's panel not live, which a living local player's never is (D:L73316-73329). Reading, pending
  review; for the hang's owner (D16, D17).
- **Research 86 section 3.4** ("a press jumps only if the stick moves or no action is offered" in the one-button layout):
  consistent; the default layout's release is read in section 2.1.

## 10. Evidence, apart

- Source inspection: every `D:L` above re-read at the line for this note; the ELF's bytes read with `od`/`xxd` for the
  program headers, the vtable at 0x6694b0 and its stubs (0x5499d0, 0x5431f0, 0x544200), and the type-name strings.
- The disc's data: only as the committed golden and earlier notes give it; no reader run.
- The port: its source read at `e9f9fd1e6` (`traversal.ts`, `climb.ts`, `mover.ts`, `walk.ts`, `net/moverSim.ts`,
  `net/blast.ts`, `net/deaths.ts`, `net/fireCapability.ts`, `traversalPage.ts`, `match/src/room.ts`); nothing run.
- Unit tests, dev-disc tests, browser runs, playtests, captures: **none** (skipped by the host rule, not failed).
- *NU-1b (2026-10-17):* source inspection of the rows' lines above (D:L452236-452305, D:L453476-453545, D:L457338-457380,
  D:L460002-460019, D:L469305-469530, D:L475300-475512, D:L476545-476562, D:L477388-477412, `FUN_0058a4d0`,
  `FUN_0057b510`); unit tests (vitest, single files) of the page's rows and the room's twins that need no room hunk; the
  room's twins ran RED against the room before its hunks and GREEN with them (`roomStillReloadJump.test.ts`, `roomResume.test.ts`). No browser, capture or playtest.
- *NU-1c (2026-10-17):* source inspection (D:L416430-416530, D:L437475-437512, D:L438702-438860, D:L438880-439150,
  D:L442304-442342, D:L445540-445566, D:L447933-447952, D:L448153-448300, D:L461880-461912, D:L462173-462200,
  D:L467857-467943, D:L468420-468514, D:L468759-468954, D:L469236-469285, D:L133953-134075, D:L134145-134181,
  D:L134569-134600) and the ELF's name strings; one scratch run over the disc's data through the repository's readers
  (section 8.6's trace, the anim set's types, the census; not committed); unit and fixture-tier tests (vitest, single
  files) of B10-B12 and the room's twins (`roomClimb.test.ts`, no room hunk). No browser, capture or playtest.
- *LATER 115 (2026-10-19):* source inspection (D:L180187-180248, D:L212151, D:L206756, D:L206952, D:L206996,
  D:L40417, D:L442138, D:L468371-468504, D:L469246-469262, D:L416725-416750); the disc's 34 maps through the
  repository's readers in a scratch (not committed); the dev-disc test `climbFrame.disc.test.ts` (vitest, one file).
  No browser, capture or playtest.
- *LATER 147 (2026-10-19):* source inspection (D:L180803-180955, D:L180239-180244, D:L468309-468319, D:L468422-468504,
  D:L469038-469077, D:L467887); the game ELF's machine code for the stack frames of `FUN_005b2620`, `FUN_002dd4d0` and
  `FUN_002dc090` (a decode of their stack-relative instructions, not committed); the disc's 34 maps through the
  repository's readers in a scratch (the census, not committed) and a synthetic U-wall scratch; the dev-disc pin
  `climbCut.disc.test.ts` (vitest, one file; it pins today's facts, so no RED of a change -- but its first disc run was
  RED on MP1's four `alaska4d_fence01` caps, appflags 5, four crossings by f32 rounding, before its check (a) was
  narrowed to walls, the port's 0.7: the original's facing tests need 0.3 and the caps' horizontal normal is about 0).
  LATER 147's fresh review (FAIL, high, on the column) and its fold: the ELF's code of `FUN_002dbfb0` (0x2dbfb0-0x2dc088)
  and of the push's class register (0x5b27c0-0x5b2850, 0x5b2a90-0x5b2ac8) decoded again for this note, D:L469562-469662
  and D:L181000-181030 re-read; the reviewer's sampled census (65 / 53) reproduced in a scratch, then counted exactly
  (78 / 66, and 11 by an end write) and snapshotted in the pin. No build of the climb, no browser, capture or playtest.
- *LATER 156 (2026-10-19):* source inspection (D:L180183-180212, D:L180890-181050; D:L468292-468514, D:L469084-469303,
  D:L469562-469680, D:L416696-416800, D:L417208-417260, D:L468957-469015; the frame order D:L50780-50929, D:L50856,
  D:L56695, D:L73286-73404, D:L417826; `FUN_002a90f0` D:L150260, `FUN_005b1130` D:L467575-467635) and the game ELF's
  machine code decoded for this note (`FUN_002dbfb0` 0x2dbfb0-0x2dc088 and its saved-register slots; `FUN_002dd4d0`
  0x2dd4d0-0x2dd8d0, `FUN_002dd690` 0x2dd690-0x2dd8e0; the VU0 inverse and transform 0x308160, 0x3085c0, 0x309180-0x309270;
  the push 0x5b2620-0x5b2d20 with the class mask 0x5b27e0/0x5b2830 and the dispatch 0x5b2a98-0x5b2ac4; the offer
  0x5b3ce0-0x5b4340; the press 0x5b4b40-0x5b4f30; the slide test 0x54f330-0x54f410 with `lh v1,372(s0)` at 0x54f3b4;
  the actor vtable 0x6691a0; no self-installed handler, `FUN_001abfd8` / 0x1ac038 never referenced). One all-maps scratch
  run and single-map scratches through the repository's readers (the class census, the step-band and fault-window counts,
  the random-f32 recount of `tower_ruin_3`, and the obstacle-ray reach; a debug scratch; all deleted, not committed). The
  M71 slide-test freeze is an unread **hardware** reading (what the BIOS default handler does, and the EE's mode); the
  class byte at a hit is not a prediction (the rounding models are not a bracket). No build, no browser, no capture, no
  playtest.
