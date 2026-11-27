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
- Added 2026-11-18: section 8.16, LATER 1223 -- why the stick does not cut `Climb over` (the driver's axes zeroed by
  `FUN_005af930` under it), built as `CLIMB_OVER_AXES_READING` (branch `agent/later-1223` from `agent/later-278-climb`
  `238fcdb95e`; the stick's half proven on r0004 by l278-climbover, the read reading, pending review).
- Added 2026-11-18: section 8.13, LATER 278 ("stuck in a wall after a climb") -- the hand-off at a climb's end read
  against the port, the design and its RED's shape; design only, no build, the owner's spot not yet shown (branch
  `agent/later-278-design` from `agent/next` `827f5441e8`; reading, pending review).
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
| **the stick or the turn** | The driver's top-play block (D:L418172-418203): with the top the play it read before its work (D:L418176), `FUN_00587c20` past `NoInterrupt` (phase, research 230 section 3.3's review; D:L445549-445565) and the top not marked 8, a move axis or the turn past 0.1 (D:L418182-418185) cuts: `FUN_005870e0` pops one (D:L418203) and `FUN_00589aa0` runs the type's end handler (section 6). Cut times on the one-shot clock `t / (playback x (n - 1) / n) > NoInterrupt`, before the push's skip and the lag PAR-61/67 add (derived): step up 0.554 s of 0.639; crate 1.088 of 1.168; medium 1.308 of 1.408; over 0.758 of 0.898; stand-to-hang 1.142 of 1.290 (the cut reveals `Hang`); hang-to-climb 2.480 of 2.712 | LATER 1223 (2026-11-18, section 8.16): **the climb over is never cut by the stick or the turn** -- `FUN_005af930` zeroes the axes the test reads under it (`CLIMB_OVER_AXES_READING`); the rows below stand for the other climbs. NU-1a (2026-10-14, B2): cut on the first command past the clip's `NoInterrupt` with the stick or the turn past 0.1 (`Traversal.advance`, `CLIMB_CUT_READING`), settled on the floor pick, the walk taking the cut's tick; "Stand -> Hang" cut into the hang; room and page on the one `MoverSim`. Was: "never: `Traversal.step` runs `advance` to the path's end whatever the stick (`traversal.ts`), page and room" |
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
| `CLIMB_OVER_FALL_READING` | `Climb over` neither suspended nor integrated; at its end a one-frame hold at the root's world height over the floor pick, then the pick (section 8.13 (a); filed in 8.14; was: "at its end the fall from `+0xfac`") | a trace on MP6's `crate05/mp6_justbox1` (appflags 5): y per frame through the clip and after |
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

### 8.13 LATER 278 -- stuck after a climb: the hand-off and the RED (design, 2026-11-18; reading, pending review)

The report: LATER 278 (Fuse, 2026-10-21: "I find myself getting stuck in walls sometimes after climbing"). The owner
will show the spot (Desert Glory, the SEAL spawn side, up the middle and to the right; the main controller's order,
2026-11-18); this read was made **without it**: no spot was searched for or guessed, and nothing below assumes one.
Source inspection only -- the decompilation at this note's pin (re-hashed, `B9E863762F08D556...`), the port at
`agent/next` `827f5441e8`. No source or test changed; nothing run but the documents' tests. Design only, for the build
that follows the owner's spot.

**(a) The original's end of a climb.**

- **Two paths in the end handler** `FUN_00589aa0` (D:L446477-446660), by the action current before the pop (D:L446501):
  - *Crate, medium, `Hang -> Climb` (the climb up from the hang) and `Step up`* (D:L446582-446648, section 6): the
    actor set at its own x and z and the y `+0x2e4` (`FUN_003157d0`), the root node's height written (11.4 / 11.5 /
    10.73 / 10.45), its x and z kept. "Its own x and z" is the root's world point: each pose zeroes the root's x and z
    into the actor (`FUN_0057a330` D:L439147-439148), and under the climb's `UseVelY` top the actor moves by the root's
    velocity and the steer's (`FUN_0028c250` D:L438910, `FUN_0054d9a0` D:L416455; section 8.6). **No pre-climb x/z is
    kept anywhere**: the body ends where the clip's travel and the steer carried it.
  - *`Climb over`* (the case at D:L446538, its body D:L446539-446542): **no position is written**. `+0xfac` = the
    actor's y plus the root's height (the `+4` of the actor vtable's `+0x88` object, the field `FUN_0059afd0` caps at
    11.487 under a `UseVelY` top, D:L456455-456456, and sets to 11.487 under any other, D:L456460), `+0x1060` bit 1 set, and the physics y `+0x2e4` = the floor pick `+0x404`.
    *Corrected by section 8.18 (a):* the cap (D:L456455-456456) is under a non-reversed `UseVelY` top; the set (D:L456460)
    and the fold (D:L456426) are on a **reversed** `UseVelY` play only -- a top that is not `UseVelY` returns before them
    (D:L456356-456388). The climb over (not reversed) is capped, never folded or set.
- **The next state** is the revealed base (section 6): standing after a climb over, the crouch kind after a crouched
  step-up, crate or medium. Its first frame runs the move solver `FUN_005483d0`, whose new y is `FUN_0059afd0`'s
  (D:L413943-413946), after the frame's wall resolution (D:L413470-413614).
- **The climb over's hand-off frame** (`FUN_0059afd0`, the top no longer `UseVelY`, D:L456356-456388): with bit 1 set
  (D:L456359) it clears it (D:L456366) and takes `+0xfac` less the revealed pose's root height; at or above `+0x2e4`
  that is the frame's y (D:L456368-456371); under it, the root is lowered to keep its world height and the actor set on
  `+0x2e4` at its own x and z (D:L456372-456386). From the next frame, bit 1 clear and no jump, the y is `+0x2e4` again
  (D:L456359-456363). So the climb over's body is held one frame at its root's world height and then stands on the floor
  pick made at the pop. Section 6's "handed to the fall" reads, on this read, as that one-frame hold over the floor
  pick; whether a pick under the body then falls or is stood on is still unread (`CLIMB_OVER_FALL_READING`, section
  8.2's candidate; note only, no constant). **Both paths therefore end at the root's x and z and the floor pick's y.**
- **The floor pick's height.** `+0x404` is copied into `+0x2e4` each climb tick for the gravity-suspended climbs
  (D:L466784) and once at the pop for the over (D:L446542): the pick at the actor's x and z, from the actor's own
  height (the port's model: `selectFloor` from the feet + the posture's lift, LATER 785; its origin during a climb is
  not re-read here -- `CLIMB_END_PICK_ORIGIN_READING`, note only). **The actor's height through the clip is its own**:
  under `UseVelY` the actor's y integrates the root's vertical velocity (D:L438910; the `UseVelY` branch's y,
  D:L456435), the root's own height capped at 11.487 (D:L456455-456456 write the root field only, `0x4137cac0`, and do not touch the actor; that the actor keeps the rise above it is an inference from D:L438910 and D:L456435), and the steer's vertical is kept for every
  climb (D:L468933-468941), its target's y the contact's top (D:L467887). Gravity is suspended for the crate, medium,
  step-up and hang-climb (D:L466760-466787); under `Climb over` it is neither suspended nor integrated (D:L466808-466809).
  Whether the climb over is `UseVelY` rests on research 86 section 1's word (`CLIMB_USEVELY_READING`, section 8.5).
- **The walls at the hand-off.** During the climb the wall probes are skipped under a `UseVelY` top (`FUN_0054aa30`
  D:L415085-415087): nothing keeps a climbing body out of a wall. On the first ground frame they run again under the
  resolution of every frame (`FUN_005483d0`, research 217 s2.9): one-sided hits (a segment from in front of a face to
  behind it), each taking the displacement's part along its normal; the deepest hit over 1 with at most two hits adds
  (depth - 1) along its normal (D:L413612-413614); over 1 with more than two hits, or prone, the body goes back where
  the tick began (D:L413602-413611). **No resolution special to the hand-off** exists, in `FUN_00589aa0` or in the bit-1
  branch. A body a clip leaves inside a solid meets its faces from behind and is not held by them; a body left where
  more than two segments meet faces over 1 deep is jammed every frame -- in the original too.

**(b) The port, at the same moment** (source inspection at `827f5441e8`).

- **`climbSettle`** (`viewer/src/traversal.ts:2020-2024`): x and z kept, y the floor pick from the feet + the posture's
  lift (`selectFloor`, `probeLiftOf`), unchanged where there is none. Asked by the uncut end (`endUncut`, :1856, every
  kind, `CLIMB_TOP_FLOOR_READING` `'dropped'`), the cut (`cutClimb`, :1991), the knock's pop (`popSettle`, :2009) and
  the flinch's (`flinchPop`, :1880) -- the climb over among them; then `endClimb` -> `finish` (:2032): not airborne,
  `settle()`.
- **Where the root's travel goes: into the feet.** `climbClip` (:1535) lays a `ClipPath` from the aligned start
  (`REF_AHEAD` back from the edge's target, :491) along the face's inward normal by the clip's root travel; each
  `advance` (:1907) writes the track's x and z less the steer's open offset (`climbSteer`) and the track's y, the
  velocities zeroed, no walls and no floors. The kept x and z are the track's end -- the counterpart of the original's
  root, not the pre-climb point. That end lies `ahead` less `refPt` z past the edge's target: step-up 2.46, crate 2.42,
  medium 2.52, **climb over 6.00** (research 86 section 1's table).
- **The track's y** (`ClipPath.at`, `viewer/src/clipPath.ts:158-183`): the feet go from the start's y to the end
  target's by the share of the rise made; the steer's vertical (`lift`, `traversal.ts:1255`) goes into the drawn root
  only (`drawnRoot`, :1966). The end target: the crate, medium, step-up and hang-climb `topFloor(...) ?? c.top`; **the
  climb over `floorUnder(x, start y, z, step_height) ?? start y`** (:1575-1577) -- the floor at most 6.5 over the
  start's y, a port rule no line of the original gives (section 6's port paragraph named it; it has no D row).
- **The next ticks.** `Walker.move` (`viewer/src/mover.ts:5430`) resolves the tick's move by the segment body
  (`resolveSegments`, :5179; `WALL_BODY_READING` `'segments'` for every walker), with the original's depth push and jam
  (`SEGMENT_BODY_READING` `depth` 1, `jamHits` 2, :567): the same law as the first ground frame of (a). A still body
  casts along its facing.
- **The push-out.** `unwedge` (`mover.ts:5273`; `WEDGE_PUSH_OUT_ADAPTATION`, an adaptation, research 217 s2.10) is
  asked only on the `'disc'` arm -- from `pushOut` (:5254) and from `step`'s crossing refusals (:5715-5737) -- and only
  within 30 ticks of a landing (`land` arms `wedgeArmed`, :5596; the bound kept so a healthy or placed body is never
  moved). On the segment arm, every map's walkers, it is never asked; a climb's end is no landing (`finish` ->
  `setAirborne(false)` arms nothing). So "the unwedge runs only on landing" holds for the disc arm; on the live arm it
  does not run at all. Neither is a departure: (a) has no push at the hand-off beyond the every-frame depth push, which
  the port runs.

**The paths by which our body can end in a wall where the original's would not:**

| # | path | the original | the port | a gap? |
|---|---|---|---|---|
| G1 | **the climb over's height** | the actor carries the root's vertical and the steer's lift (`lift` = the top - (start + 11.487 - 0.96)); the pick from there reaches the top: its origin + 1 lands about 0.99 over it whatever the top's height -- a **model value** under `CLIMB_OVER_RISE_READING` (derived from research 86 s1's root and `refPt` and the port's lift and pick; the climb over's own steer offset (0, -0.29, -2.42), D:L467909-467910, is not in it, its application unread; the first frame's fold, D:L456426, would narrow it to about 0.46 -- the review, F5; *corrected by section 8.18 (a): the offset, play `+0xa8`, is read by neither steer branch and does not apply; the fold is a reversed play's only and does not apply*) | the feet stay on the start-to-`floorUnder` line, the lift in the drawn root only; the pick from the start's y reaches 12.48 (11.48 + 1) | **yes**: a class-5 face whose top lies under the end point more than 12.48 over the start leaves ours on the floor inside the obstacle's footprint, the original's on its top |
| G2 | the climb over cut, knocked or flinched | the same case (D:L446538) from the actor's own height mid-clip | `climbSettle` from the track's feet on the start's line | **yes**, with G1 |
| G3 | a clip whose travel passes the top's depth (a thin top) | the end past the far edge; the pick there | the same: the track's end past the far edge; the pick there | no, by the reading |
| G4 | a wall standing on the top within the end's reach (2.42-2.52 past the edge, plus the body's segments) | the body ends against or in it (walls off through the clip); the first frame's resolution as every frame's | the same, by the segment arm | no: a body the original also leaves wedged is a quirk of the original, for the owner, not fixed |
| G5 | a floor over the top within the pick's reach (a low slab's upper face) | the pick by the same rule (LATER 785's model) | `climbSettle` lifts the body onto it | no, by the model (`CLIMB_END_PICK_ORIGIN_READING`) |
| G6 | the end's x and z | the root's velocity along the turning body and the steer | the track along the contact's normal, the same steer law (NU-1c B10, `CLIMB_STEER_READING`) | no in kind; the numbers unmeasured |
| G7 | no push-out | none at the hand-off | none (`unwedge` disc arm only) | no |

So by this read the port's one departure at the hand-off is the **climb over's height** (G1, G2); a crate, medium,
step-up or hang-climb that ends a body in a wall ends the original's there too, and a fix there would be an adaptation.

**(c) The design** (simulation track; RED first; the smallest change).

1. **The climb over's feet carry the vertical the original's actor carries** (`CLIMB_OVER_RISE_READING`, note only):
   the end target's y = the start's y + the clip's root rise (-0.96, research 86 s1) + the steer's lift
   (`Traversal.lift`, already computed for the drawn root), in place of `floorUnder(x, start y, z, step_height) ??
   start y`; through the clip the feet take the steer's closed share of the lift as the root gives it up, so the drawn
   root's world height is unchanged on screen. The share of the root's vertical the feet take mid-clip (the actor's
   whole root velocity, D:L438910 and D:L456435) is the reading's; the trace in (e) settles it.
   **Corrected at the build (2026-11-18; the review, F1): not built as written -- see (f).** As designed (A), the
   sentence "the drawn root's world height is unchanged on screen" was false for `ClipPath` as built: its `rest`
   (`clipPath.ts:180`) carries `-lift`, so with the end target moved the drawn root no longer sinks back, and the feet's
   mid-clip share is `ClipPath`'s running share of the drop `u` (`clipPath.ts:174`), not the steer's closed share.
2. **The hand-off reads the pick from there**: the uncut end, the cut, the knock's pop and the flinch's pop keep
   `climbSettle` for the over (the floor pick at the root's x and z from the feet, D:L446542 with D:L456359-456386),
   now from the lifted feet. The one-frame hold at the root's world height (D:L456368-456371) is a draw detail and is
   not built (`CLIMB_OVER_FALL_READING`, note only).
3. **Unchanged**: the crate, medium, step-up and hang-climb ends (D:L446582-446648); the cut's, knock's and flinch's
   timing (B2, B7, B8); the steer (B10); the segment resolution; `unwedge` and its bound. **No push-out is added at a
   climb's end** -- the original has none (a); one would be an adaptation, and only on the owner's word, as a
   `HUMAN_TASKS` row (the parity rule: a preference the original does not support is recorded, not applied).
4. **Room and page**: the room runs the same `Traversal` (`match/src/room.ts:4267-4271`, `newSim` -> `MoverSim`), and
   the bots drive it (`match/src/bots/climbDrive.ts`); the change lands on page, room and bots together, no room hunk.
   The existing pin "climbs over appflags 5 whatever its height" (`traversal.test.ts`, a 10 wall 2 deep with no top)
   stays green by the arithmetic: the lifted end's pick (from -1.49) still finds only the floor at 0.

**(d) The RED's shape.**

- **The synthetic case** (`packages/viewer/test/traversal.test.ts`, beside the climb-over pin; its twin in the room's
  `roomClimb.test.ts`): the floor at 0 (-100..100); a block x -10..10, z -20..0, **16 tall**, its four sides appflags 5
  with outward normals (the climb faces are one-sided, research 281 s4.3) and its top a floor at 16; the walker at
  (0, 0, 12) facing -z (`climber`). The over offered, Action pressed, the clip run to `climbEnd`, then 30 still ticks.
  Asserts: **the feet are not inside the block** -- not (x and z within its footprint and y under 16): on its top, y 16;
  then the stick forward 120 ticks carries the body at least 10 and never inside the footprint under the top.
  **Today it reads red**: the end target is `floorUnder(...)` = 0 (the top 16 is over 6.5), the end 6.0 past the edge
  (z about -6, inside the 20-deep block), and `climbSettle`'s pick from 0 reaches 12.48 < 16: y 0 inside. After (c)
  the feet end at about 16 - 11.49 = 4.51 and the pick (reaching 16.99) takes the top. The walk-away half may read
  green today -- a body inside meets the faces from behind and walks out through them (research 281 s4.3) -- so this
  case shows the port's gap, not necessarily the reporter's stuck body.
- **A guard beside it, green before and after** (not a RED): a crate (appflags 4, 12 tall, 20 deep) with a plain wall
  (appflags 0) standing on its top 1.5 behind the near edge: the end's x, z the track's and y the top, as the original's
  by (a) -- pinning that (c) leaves the non-over climbs alone (G4).
- **The disc-backed case, once the owner shows the spot** (`packages/viewer/test/parity/later278Climb.parity.test.ts`,
  the fixture tier, skipping by name without its files): `LATER_278_SPOT_PLACEHOLDER` (note only; no constant until
  the spot is known), its fields: the map file `RUN/MP6.ZDB` (Desert Glory, MP6, the fixture `test-fixtures/RUN/MP6.ZDB`;
  the map is the owner's word, the spot is not chosen here); the start (x, y, z) and yaw; the stance; the climb's
  face (its polygon and appflags, the offer's kind); the press (Action, or none for the automatic step-up); the stick
  through the clip and after (held or released, which heading); the ticks. Asserts as the synthetic case (after
  `climbEnd` and 30 ticks not inside geometry; walks out in at least 6 of 8 headings, `bridgeWedge.test.ts`'s
  measure), RED on today's code if the spot is G1's or G2's. If the spot is a crate, medium, step-up or hang-climb,
  this read predicts the original ends there too (G3-G5): then the case pins the port as the original's and the
  capture below decides.

**(e) What a capture of the original would settle.** At the owner's spot, on r0004 (the spec, OT.R97; these lines are
r0001's and are re-checked there, research 217 s2.9), a PINE or rig trace per frame from the press to 60 frames after
the pop: the actor `+0x1c..+0x24`, `+0x2e4`, `+0x404`, `+0xfac`, `+0x1060` bit 1, the root (the `+0x88` object's `+4`
and `+0x10..+0x18`), the top action's type and phase, the contact `+0x1090`, and on the first ground frames the hit
count and the deepest depth of `FUN_005483d0`; then the stick in eight headings. It settles `CLIMB_OVER_RISE_READING`,
`CLIMB_OVER_FALL_READING` and `CLIMB_END_PICK_ORIGIN_READING`, and whether the original's body is stuck there too --
then the spot is the original's quirk, recorded for the owner and not fixed.

Readings and placeholders this section names (**note only**; none is a constant): `CLIMB_OVER_RISE_READING`,
`CLIMB_END_PICK_ORIGIN_READING`, `LATER_278_SPOT_PLACEHOLDER`; and `CLIMB_OVER_FALL_READING`, section 8.2's candidate.
Filed in section 8.14 at the build.

**(f) The build (2026-11-18, `agent/later-278-climb`; reading, pending review): the smaller change, B.** The
controller chose B over (c)1 as designed (A), on the measure below.

- **What A does to every climb over** (measured on the synthetic hull with the placeholder shape, then reverted, never
  committed): moving the clip's end target to start - 0.96 + the steer's lift lowers the feet along the whole clip
  wherever the lift is negative -- every face under about 10.5 -- and the drawn root with them, since `rest` no longer
  takes the lift back. On a class-5 fence 7 tall and 2 deep the feet reach **-4.48** under the floor on the clip's last
  tick (today 0) and the drawn root ends at **about 7.0** (today 11.475, the standing root), then jumps about 4.5 when
  the end handler stands the body on the floor. The readers that see it: the page's camera (the first-person eye from
  the feet and the posed root, `walk.ts` `noteTick` :2709-2711; the third person's target from the animator's root,
  `play.ts` :651); the remote draw (`net/body.ts` :63 and :102 carry the feet and `travRootY`); the room's hit pose
  (`HitPoser.stepBody` poses the boxes from the same body snapshot, `net/hitPose.ts` :218); and the ripple, which reads
  the feet alone (`traversal.ts` :1373, `remotePlayers.ts` :853). Whether the original's actor dips so is
  `CLIMB_OVER_RISE_READING`'s question, unread; so the build changes nothing a low fence shows.
- **What B builds** (`viewer/src/traversal.ts`): the clip's track is left as it was (`floorUnder(x, start y, z, 6.5) ??
  start y`), so the feet and the drawn root are what they were at every tick, and `clipPath.ts` is untouched. Only the
  climb over's **end floor pick** changes: `climbClip` lays a second `ClipPath` (`overPick`) from the aligned start to
  start + the root's drop (-0.96) + the steer's lift, on the same shape and law; `climbSettle` starts the pick from the
  higher of the feet and `overPick`'s feet at the clip's clock -- the end where the clip ran out (`endUncut`), the clock
  at the cut (`cutClimb`), at the knock's pop (`popSettle`) and at the flinch's (`flinchPop`). The higher of the two is
  the port's choice (`CLIMB_END_PICK_ORIGIN_READING`): it keeps every climb over that ends on the floor it left, low
  fences among them, frame for frame as before -- by construction (the clip's path is untouched and `climbSettle` runs only at the hand-off; source inspection), not by a test: the F3 guard pins the end, the lowest feet and the drawn root's end only. The pick's reject (`REJECT_ABOVE` 20, `scene/src/probe.ts`) is measured from the same carried height, not the start line (the build's review, finding 1: from the start a class-5 top over 20 was refused and the body stayed inside; test "LATER 278 G1b", a block 22 tall). The room and the bots run the same `Traversal`: no room hunk. No push-out.
- **Under B the drawn root**: its world height is what it was before the build at every tick of every climb over
  (the sentence of (c)1 is true under B, not under A). **A known divergence**, named: on a tall block the drawn root
  sinks mid-clip back toward the standing height over the floor it left (`rest` takes the lift back), then **pops about
  16** when the pick stands the body on a 16 top at the hand-off -- where the original's model (a) carries the actor up
  with the steer. Before the build that body stayed inside the block; the pop is the price of B until the trace settles
  `CLIMB_OVER_RISE_READING`.
- **Tests**: viewer `test/traversal.test.ts` "LATER 278 G1" (a block 16 tall, 20 deep: on its top; the walk away never
  enters it) and "LATER 278 G2" (the stick held: cut past 0.8, on the top), RED before the fix; "LATER 278 F3 guard"
  (the 7 fence: the end on the floor, the feet never under it, the drawn root back at standing), green before and after;
  the pin "climbs over appflags 5 whatever its height" unchanged; central `test/roomClimb.test.ts` "LATER 278 in the
  room" G1 and G2, the room's rows the page's.
- **G2 is open, not claimed.** The synthetic G2 runs `FALLBACK`'s placeholder shape (a smoothstep root, monotone): at
  the cut its running share of the drop is about 0.94, so the pick from `overPick` reaches the top. It shows that the
  cut, the knock and the flinch read the pick from `overPick` at their clock; it does not show the disc's clip does. The
  pack's `seal_climb_over` (`MOTION_P.ZAR`, 19 keys) dips its root to 10.227 by key 5, rises to 15.59 at key 11 and ends
  at 10.004, so `ClipPath`'s share stays about 0.767 from key 5 to key 17: a cut at 0.8 on the 16 block starts the pick
  at about 3.46 and reaches about 15.94, just under the top -- inside, as before. The rise over 11.487, which the original's actor
  keeps by inference (D:L438910, D:L456435; D:L456455-456456 cap only the root field), is in no share the port models; the trace settles it.

### 8.14 Readings and placeholders (LATER 278's build)

Filed 2026-11-18 by LATER 278's build (`packages/viewer/src/traversal.ts`); reading, pending review. **Note only**: no
constant holds any of them, so research 101 and the ledger take no row; a build that adds one files it there (OC-M3).

| name | stands for | value in the code | the evidence that settles it |
|---|---|---|---|
| `CLIMB_OVER_RISE_READING` (*note only*) | the original's actor motion through `Climb over`: under a `UseVelY` top its y integrates the play's vertical (the root's velocity, D:L438910; D:L456435) with the steer's vertical kept (D:L468933-468941); a root above 11.487 is capped in the root field (D:L456455-456456), the actor keeping the excess by inference (D:L438910, D:L456435); ~~off `UseVelY` the frame folds the root's height in and sets it to 11.487 (D:L456426, D:L456460); the climb over's own steer offset (0, -0.29, -2.42), D:L467909-467910, its application unread~~ *corrected by section 8.18 (a): the fold (D:L456426) and the set (D:L456460) are on a reversed `UseVelY` play only, not the climb over; the offset (play `+0xa8`, D:L467909-467910) is read by neither steer branch and does not apply*. The port's model: the end at start - 0.96 + the steer's lift (the pick's origin about 0.007 under the top, so origin + 1 reaches about 0.99 over it -- a model value; ~~about 0.46 with the first frame's fold~~ no fold applies, section 8.18), its share along the clip `ClipPath`'s running share of the drop. Unread: how much of this the actor carries mid-clip, so whether the original's body dips on a low fence (A) or not | note only; the end pick's origin (`overPick`), not the feet or the drawn root (B, section 8.13 (f)) | the per-frame r0004 trace section 8.13 (e) names (ordered of PC 3, 2026-11-18): a climb over a low fence and over a tall block, the actor `+0x1c..+0x24`, the root (`+0x88` object's `+4`), `+0x2e4`, `+0x404`, `+0xfac`, `+0x1060` bit 1 each frame **Measured 2026-11-18 (section 8.15, l278-climbover): the body carries the vertical; the build to it is LATER 1222.** **Fitted 2026-11-18 (section 8.17): the lift closes on the port's steer weight and the root's whole vertical is carried, but no simple model fits the three faces within 0.5 (0.59-0.79); no design yet.** **Read at its source and scored 2026-11-18 (section 8.18): the per-frame law fits every trial within 0.43 (MP81 0.49-0.58 by row, 0.21-0.30 at its rows' own clock), the node's blend pinned at 0.4 s by skel_root; the design and the RED are section 8.18 (f), (g).** |
| `CLIMB_OVER_FALL_READING` (*note only*) | the climb over's hand-off: one frame held at its root's world height over the floor pick (`FUN_0059afd0` bit 1, D:L456359-456386), then the floor pick (`+0x2e4` from `+0x404`, D:L446542); whether a pick under the body then falls or is stood on is unread. ~~The one-frame hold is a draw detail, not built~~ *Built by LATER 1222 (section 8.19): the hand-off frame at the higher of the pick and `+0xfac` less the revealed root, held one game frame where over the pick, then the pick (r0004: stood on, action 10). Unread still, named here: the pick's origin in the original (the port's from that height + the posture's lift, so about `+0xfac`) and the revealed node (the port's the posture's standing root 11.4844; the original's on the fence action 9's first frame, 10.60 -- the fence's hand-off row 0.58 under the measured 52.71 under the built pairing)* | note only; `Traversal.overHandOff` | the same trace: y per frame through the pop and the frames after **On r0004 (section 8.15): `+0x1060` bit 1 is never set; `+0xfac` is written the frame after the clip; the one-frame hold is seen on the tall fence only.** |
| `CLIMB_END_PICK_ORIGIN_READING` (*note only*) | the height the climb's end pick is taken from (the port's `selectFloor` from the origin + the posture's lift, LATER 785's model); ~~for the climb over the higher of the feet and `overPick` at the clip's clock -- the higher being the port's choice, keeping a climb over that ends on the floor it left as before~~ *for the climb over replaced by LATER 1222 (section 8.19): the hand-off's pick from `+0xfac` less the revealed root (`CLIMB_OVER_FALL_READING`); `overPick` removed* | note only; `climbSettle`'s `from` (the other climbs) | the same trace: `+0x404` against the actor's y at the pop, at a low fence and a tall block |
| `LATER_278_SPOT_PLACEHOLDER` (*note only*) | the owner's spot on Desert Glory (MP6; the SEAL spawn side, up the middle and to the right) for the disc-backed case `viewer/test/parity/later278Climb.parity.test.ts`, its fields section 8.13 (d) | note only; no case until the spot is shown | the owner's spot (the start, yaw, stance, face, press, stick, ticks); then the capture of section 8.13 (e) there |

### 8.15 Measured: the climb over on r0004 (l278-climbover, 2026-11-18)

**Proven** -- a capture of the original running: shadow PC 3, r0004 under PCSX2, per-frame PINE reads of the body with
PCSX2 video, the body placed by position writes; not harness-scored. `agent-mail` `evidence/later278-climbover/`
(l278-climbover.zip, sha256 c0764f553b66b16aaec20b392df9804f959092fdd694a66b2c8eaa6e3cdf2e29; `unpacked/` rows.csv,
SUMMARY.txt, RECORD.md). Eight trials on three faces the port's census reads as class 5:

| face | trials | the feet's rise mid-clip | at clip frame | x/z travel | hand-off |
|---|---|---|---|---|---|
| MP1 `alaska4d_fence01`, 16.41 (1773.3, 47.86, 1944.5) | T1, T2; F1, F2 (stick held) | +11.42, +11.14; +11.42, +10.87 | 15-16 | 9.17-9.21 (F2 8.85) | one frame of action 9 at the clip's last y (52.7), then action 10 on the floor (48.4) |
| MP81 `cell3_drydockcap1`, 10.15 (1487.6, 120.0, 2127.3) | L1, L2 | +3.96, +4.06 | 15 | 8.79-8.80 | action 1 on the floor that frame, then 10 |
| MP1 `alaska4d_fence01` at (1615.65, 49.97, 1985.91) | L1x, L2x | +1.36, +1.35 | 15 | 9.77-9.78 | action 1 on the floor that frame, then 10 |

- **The body carries the vertical** (LATER 1222): the position word rises with the clip while skel_root's local y stays
  10.00-11.49 -- the lift is in the body, not the root. Section 8.13 (f)'s option B (the clip's path kept, the pick from
  `overPick` at the end) does not carry it: its drawn body sinks mid-clip and pops at the hand-off. Option A's end formula
  (start + rise + lift) dips low faces, where the original rises. Both are departures from the measured motion.
- **The prompt and the action**: the original's prompt on all three is "CLIMB" with the ladder icon, not the words CLIMB
  OVER; the press plays action 189 for its clip: 27 rows (0.851-0.868 s between the first and the last action-189 row),
  0.901 s from the first action-189 row to the first other row (F1 48.3831 to 49.2840) -- the port's clip is 0.8975 s.
- **No cut** (LATER 1223): with the stick held forward from the press (F1; F2 through a 0.17 s recorder gap) the clip runs to its end, then the run
  (action 2). The port's `CLIMB_NO_INTERRUPT.seal_climb_over` 0.8 cut is a departure; 8.13's G2 moves to LATER 1223.
- **The hand-off on r0004**: `+0xfac` is written on the frame after the clip, the clip's last feet y + skel_root's y (T1
  63.3089 = 53.3050 + 10.0039), and kept. `+0x1060` bit 1 is **never** set on r0004 (the word gains 0x400 at the press:
  0x..89 -> 0x..489, MP81 0x0d -> 0x40d), so section 8.13 (a)'s reading of D:L446538-446542 (r0001) does not hold on
  r0004 as written; `CLIMB_OVER_FALL_READING`'s one-frame hold is seen on the tall fence (action 9) and not on the low faces.
- **Mid-clip floors**: `+0x2e4` does not follow the body (43.0-48.5 on the fence, 115.9-121.3 on MP81's floor at 120);
  `+0x404` stays at the floor pick but for one frame reading the fence top (64.27 = 47.86 + 16.41).

### 8.16 Readings: LATER 1223, the climb over is not cut by the stick (2026-11-18)

Filed 2026-11-18 by LATER 1223's build (`packages/viewer/src/traversal.ts`, `Traversal.climbCut`). The capture
(section 8.15, F1/F2) is proven; the read that explains it is reading, pending review. The source does not contradict
the capture.

**Why section 4's cut does not reach `Climb over`.** The driver's cut (`FUN_00550ef0`, D:L418172-418203) asks four
things: the top play one-shot (its `+0x28` bit 0x40 clear, D:L418174-418175), the same play as before the tick's work
(D:L418176), `FUN_00587c20` -- the play's first node's `+0x28` bit 0x2 set (`FUN_0028dc90` sets it on every node it makes,
D:L135174; only the prone push clears it, D:L442221), not the AI's refusals (the player's `IsAi` stub returns 0),
the phase past the last node's `NoInterrupt` (D:L445549-445565) -- with the play's posture byte `+0x2b` not 8 (the climb
over's push writes 0: `FUN_00580a80` pushes `Climb over` with posture 0, `FUN_00588bc0` -> `FUN_0028dc90` D:L135204); and
then a move axis or the turn past 0.1 (D:L418182-418185). For `Climb over` all four hold. What fails is the axes: the
driver reads them from the actor's `+0x240`, `+0x244` and `+0x23c` (`piVar14[0x90]`, `[0x91]`, `[0x8f]`, the actor itself,
D:L418069), and one line before the block it hands those three to `FUN_005af930` (D:L418169). There:

- the suspended list -- action 0x2e, 0x2a, `Climb medium`, 0x23, `Step up`, 0x2d, or state 4 (D:L466760-466782) -- copies the
  floor pick and clears the actor's `+0x105e` bit 0x20 (D:L466784-466787); `Climb over` is not in it;
- otherwise the bit is set (D:L466805-466806) and the floor routine `FUN_0059b440` is run for every action but `Climb over`
  (D:L466808-466810); that routine is what clears the bit on a floor (D:L456508, D:L456528, D:L456558, D:L456602);
- with the bit still set the three axes are written 0 (D:L466811-466815).

So under `Climb over` the bit is never cleared, the axes reach the cut as zeros every frame, and the phase passing 0.8
cuts nothing: the clip runs to its end, and the ground state after it takes the stick (section 8.15: action 2 next). The
turn is zeroed with the move axes, so neither cuts. This matches the capture and is the rule built.

| name | stands for | value in the code | the evidence that settles it |
|---|---|---|---|
| `CLIMB_OVER_AXES_READING` | the stick or the turn never cuts `Climb over`: `FUN_005af930` zeroes the driver's axes under it before the cut reads them (D:L418169, D:L466805-466815, D:L418182-418185; the bit's clear only through `FUN_0059b440`, skipped under `Climb over`, D:L466808-466810); the stick's half PROVEN on r0004 (l278-climbover F1/F2: the full clip, F1 0.901 s from its first 189 row to its first other row, F2 through a 0.17 s recorder gap, as the uncut T1/T2, then the run); the read reading, pending review | `'zeroed'` (`Traversal.climbCut` returns no cut for the climb over; `CLIMB_NO_INTERRUPT.seal_climb_over` 0.8 kept as the disc's value) | the review's re-read of D:L466729-466815 and D:L418160-418203; a capture with the turn alone held through a climb over (the turn's half is the read only) |

**The build.** `Traversal.climbCut` returns no cut while the climb's plan is the climb over; the other climbs (the step-up,
the crate, the medium and their blend, `Stand -> Hang`, `Hang -> Climb`) keep `CLIMB_CUT_READING` as it was -- each is in
`FUN_005af930`'s suspended list or reached in state 4, so its axes are not zeroed there (whether `Stand -> Hang` runs in state 4
from its push is not re-read here; the capture measured only the climb over). There is no pistol climb over in the Seal anim
set (section 8.6), so the rifle's rule is the pistol-holder's too. The knock's and the flinch's pops do not read the axes and are
unchanged. `Walker.stickCut` (mover.ts) is unchanged. The port's clip runs (18/19)^2 = 0.8975 s against the capture's 0.901 s (F1, its first
action-189 row to its first other row; 0.851-0.868 s is first-to-last row, 26 intervals): the tests hold 0.02 s. *Corrected
by the build's review: the push's skip, first named as the gap, would lengthen the original, not shorten it.* Owed: `Stand ->
Hang` (0x21) is not in `FUN_005af930`'s suspended list either, so its stick cut may be a departure too (unread; LATER 1223).

**The tests.** Viewer `test/traversal.test.ts` "LATER 1223 (was LATER 278 G2)": the stick held forward from the press runs the
climb over to the same tick as the stick at rest (55 ticks from the press; RED before: 47, the cut past 0.8), past the clip's last
key, on the block top, then walks on the held stick; "LATER 1223 guard": the crate still cut. Central `test/roomClimb.test.ts`
"LATER 1223 (was G2)": the same at both ends (54 commands from the push; RED before: 46). `test/traversal.parity.test.ts` NU-1c B11:
the climb over moved from the cut rows to "no cut, either hand". **G2 is rewritten, not retired**: it asserted the cut the original
does not make; it now asserts the full clip and the same end on the top.

### 8.17 LATER 1222 -- the climb over carries the body's vertical: the fit (no design: no simple model within 0.5)

Written 2026-11-18 on `agent/later-1222` (base `26214106b8`, LATER 278 B and LATER 1223 stacked). **The answer first: no
simple model reproduces the feet on all three faces within 0.5.** The best simple one -- the port's own quantities, one
timing fitted -- misses by 0.59-0.79 on every trial; a richer reading reaches 0.48 only with three timings fitted to the
same rows. By the brief's rule the work stops at this analysis: no port design and no RED are written here; what a design
must hold is listed at the end so the next row starts from it. No source or test changed. *Superseded by section 8.18
(the same day): the law read at its source, per game frame, fits within about 0.5 with no timing fitted; kept as the
history of the fit.*

**The evidence, apart.**

- *A capture of the original running (proven):* section 8.15's l278-climbover rows (`rows.csv`, 8 trials), read by a
  scratch script outside the repository (not committed). Per trial, every action-189 row: the feet's y less the row
  before the first 189 row, skel_root's local y, the x/z travel along the trial's own start-to-end line. The stale row
  of T2 and F2 (their recorder gap: one row repeating the last, its clock 0.15 s on) is dropped, so clip frame i (0 at the first action-189
  row) is the i-th game frame read. The faces' tops: the fence's 64.27 (47.86 + 16.41; `+0x404` reads 64.27 on its one top frame), the
  low fence's 56.49 (`+0x404` on its top frames), MP81's 130.15 (the stand 120.00 + 10.15, the spec's height; `+0x404`
  never reads it). L1 and L2 each hold one row whose clock steps half a frame (L1's row 18, its clip frame 6; L2's row 21, clip frame 9): their reads
  straddle a frame there, so a single row of theirs carries up to half a frame of the clip's motion (about 0.5 at the
  clip's fastest) as reading noise.
- *The disc's data (reading):* `seal_climb_over` read through the repository's readers (`clipsFromPack` over
  `RUN/MOTION_P.ZAR`, `clipShape` with `motion.rdr`'s entry from `RUN/READERC.ZAR`; a scratch, not committed): 19 keys,
  0.8975 s, playback 1, `refPt` (0, -0.96, -10.28), `verticalMotion` not set. Its root y per key: 10.961, 10.813,
  10.621, 10.441, 10.305, 10.227, 10.516, 11.465, 12.680, 14.336, 15.285, 15.590, 15.418, 14.938, 14.152, 13.137,
  11.988, 10.813, 10.004 -- under 11.487 at keys 0-6 and 17-18.
- *Source inspection (reading, pending review):* the steer's weight is the port's `steerWeight` (`FUN_002874f0`'s ease,
  its square root, D:L468929-468930), laid each frame on the offset still open; the steer's reference is taken through
  the body's root node (`FUN_003085c0` of the actor's `+0x2e8`, D:L468927; the node whose local y the capture reads as
  skel_root; the port's `STEER_ROOT` reads the same line as 11.487 over the feet) -- re-read for this note at the line,
  its signs not decoded. No other line re-read.
- *Model fits (a model, not a reading):* the scratch's per-frame simulations below, scored against the capture. No unit
  test, no dev-disc test, no browser run, no playtest.

**(a) What the rows show, before any model.** Per frame i, over three faces (T1, L1x, L2: three heights, clean timing
but L2's one row), the feet's rise fits `a(i) + b(i) x (top - start)` -- a part proportional to the face's height over
the start and a part every face shares:

| clip frame | b (fitted) | the port's closure 1 - open | shared part, `a + 10.527 b` | the clip root's rise one frame on, R - R(key 0) | worst face off the line |
|---|---|---|---|---|---|
| 0 | 0.053 | 0.050 | -0.09 | -0.10 | 0.01 |
| 2 | 0.286 | 0.272 | -0.29 | -0.34 | 0.04 |
| 4 | 0.589 | 0.562 | -0.39 | -0.57 | 0.07 |
| 6 | 0.833 | 0.800 | -0.24 | -0.71 | 0.08 |
| 8 | 0.966 | 0.933 | +0.92 | -0.43 | 0.08 |
| 10 | 1.015 | 0.985 | +2.04 | +0.93 | 0.16 |
| 12 | 1.033 | 0.998 | +3.55 | +2.86 | 0.40 |
| 14 | 1.019 | 1.000 | +4.40 | +4.33 | 0.14 |
| 16 | 1.014 | 1.000 | +4.47 | +4.57 | 0.13 |
| 18 | 1.003 | 1.000 | +3.91 | +4.12 | 0.00 |
| 20 | 0.993 | 1.000 | +2.81 | +3.15 | 0.11 |
| 22 | 0.984 | 1.000 | +1.42 | +1.74 | 0.14 |
| 24 | 0.973 | 1.000 | -0.09 | +0.19 | 0.17 |
| 25 | 0.978 | 1.000 | -0.39 | -0.46 | 0.04 |
| 26 | 0.972 | 1.000 | -0.24 | -0.96 | 0.02 |

("The port's closure" is `1 - open`, `open` the product of `1 - steerWeight(phase)` over the frames so far, the phase one
frame on at each frame; "10.527" is the port's `STEER_ROOT` 11.487 less 0.96, `Traversal.lift`'s constant.)

1. **The height-proportional part is the steer's lift, closed by the port's own weight.** `b` follows `1 - open` within
   0.04 through the clip (3-6 % high to clip frame 12, up to 3 % low after): on the tall fence (lift about 6.7) that is under
   0.3. The lift is the one `Traversal.lift` already computes -- the top less (start + 11.487 - 0.96). Its largest step,
   about 0.97 a frame on the tall fence (clip frames 3-4), sits just under `FUN_005b2d20`'s 30 a second; the clamp does not
   bind on these faces.
2. **The shared part is the clip root's vertical, all of it, not its excess over 11.487.** It rises with the root from
   clip frame 7 and falls with it after clip frame 16, about 5.0 up and 5.0 down (the root's own swing 5.4); the excess
   over the cap (4.1 at most, none in the clip's first nine frames or its dip) misses by over 1 (below). So the actor carries the root's whole vertical velocity -- the reading of
   D:L438910 and D:L456435 (section 8.13 (a)) -- while the root node's local y is held at 11.487 (skel_root reads
   11.4870 from clip frame 10 or 11 to 23-25 on every trial): the capped root field and the body's rise are two separate things,
   as section 8.15 found.
3. **Where the shared part leaves the root, on every face alike.** It leads the root by one to three frames through the
   rise (+1.35 over it at clip frame 8, +1.11 at 10) and stays 0.3 under it on the fall (frames 19-24); on the last
   two frames it stops falling (-0.39, then -0.24) while the root goes on to -0.96 -- the frames where skel_root leaves the
   cap (11.13, 10.49, 10.00). Neither the lead nor the end's flattening is in the root track or the closure.

**(b) The models scored** (max |feet y error| over every action-189 row of the trial; the clip's clock offset from the
first 189 row and, where named free, the lift's constant fitted to all eight trials together):

| model | fitted | T1 | T2 | F1 | F2 | L1 | L2 | L1x | L2x |
|---|---|---|---|---|---|---|---|---|---|
| **(1) the clip root's whole vertical + the lift closed by `1 - open`** (the brief's (a), the root uncapped) | the clock 2 frames on; the constant 10.527 (the port's) | 0.76 | 0.75 | 0.79 | 0.59 | 0.75 | 0.75 | 0.79 | 0.79 |
| (1), the constant free | 10.5, 2 frames | 0.73 | 0.72 | 0.76 | 0.61 | 0.78 | 0.72 | 0.76 | 0.76 |
| (1), the clip's clock also scaled (0.95-1.10) | 0.95, 2.5 frames, 10.4 | 0.73 | 0.74 | 0.71 | 0.70 | 0.72 | 0.63 | 0.67 | 0.67 |
| the root's excess over 11.487 only + the closed lift | 2 frames, 10.3 | 1.15 | 1.15 | 1.10 | 1.12 | 0.79 | 0.88 | 0.97 | 0.97 |
| the closed lift alone (the brief's (b) without the root) | 2.5 frames, 8.6 | 2.81 | 2.80 | 2.81 | 2.72 | 2.44 | 2.51 | 2.70 | 2.70 |
| (2) the steer's reference through the root node: each frame the actor takes the root's step, then the steer closes `steerWeight`'s share of what is left toward start + lift + (R - R(key 0)) + (11.487 - the root node's local y two frames before) | 1.5 frames, the node's y modelled as the clip root blended in from the stand's 11.484 over 9 frames and capped at 11.487; the constant 10.527 | 0.39 | 0.38 | 0.39 | 0.37 | 0.48 | 0.39 | 0.44 | 0.43 |
| (2) with the node's y as measured (T1's skel_root), one frame before | 1.5 frames, 10.6 | 0.56 | 0.55 | 0.57 | 0.58 | 0.40 | 0.35 | 0.40 | 0.40 |

- **(1) is the simple model**, and it is built from quantities the port already holds: `ClipPath`'s root track (uncapped),
  the steer's `open` (`ClimbSteer`), `Traversal.lift`. Its misses are the same on every face (section (a) 3): +0.46 to
  +0.74 at clip frames 7-9, +0.40 to +0.76 on the last two, -0.4 to -0.5 at frames 1-3 on the tall fence. Its two-frame
  clock is itself a compromise: the lift's share alone fits a one-frame clock (section (a) 1), and the root's lead pulls
  it to two; with the steer's clock at one frame and the root's at two, (1) misses by up to 1.00, and with both at one
  by up to 1.63. **Its fit is 0.59-0.79: over the 0.5 asked.**
- **(2) fits within 0.5**, and it is the more literal reading of the steer -- its reference the root node's point
  (D:L468927) as it is, not the actor plus a constant 11.487 (`STEER_ROOT`, true only while the node is capped) -- so it carries what (1) misses: the node's dip under the cap
  early raises the steer's target (the lead), and at the end, the steer closing fully, the node's fall under the cap
  cancels the root's (the flattening). But it holds three timings fitted to these same rows (the clock 1.5 frames on,
  the node read two frames late, a 9-frame blend no table gives: `seal_climb_over`'s `BlendTime` is unset), its signs are
  not decoded at D:L468927-468951, and with the node's y as measured in place of the modelled one it misses by 0.58.
  It is a lead for the reading's review and for a capture, **not a basis for a design**.

**(c) The hand-off, measured (proven), for whichever design follows.** The clip's last row's feet, then the next: on the
16.41 fence 53.31, then 52.71 for one frame (action 9) = `+0xfac` 63.31 less the revealed root's 10.60, then 48.41 on the
floor (action 10, about 4.3 lower); on the low faces the next row is on the floor at once (L1x 49.46 = 55.80 less 6.34,
the root node lowered to keep the root's world height, `+0x2e4` 49.46; MP81 120.00, the node 9.54). That is section 8.13
(a)'s arithmetic for the hand-off frame (D:L456368-456386: at or over `+0x2e4` the frame's y is `+0xfac` less the
revealed root; under it, the body on `+0x2e4` and the node lowered) -- though `+0x1060` bit 1, which that reading has
gate it, is never set on r0004 (section 8.15): which word gates it there is unread.

**(d) What a design will have to hold** (not a design; for the row that writes one):

- the feet on the clip's whole root vertical plus the lift closed by the steer's weight (the part this fit proves the
  shape of), whichever of (1) or (2) the review and the next capture settle;
- LATER 278's G1 and G1b (the 16 and 22 blocks: the end on the top) and the F3 guard (the 7 fence: the end on the floor);
  under (1) the 16 block's feet end at start + lift - 0.96 (about 4.5 over the start against the top's 16), so the
  end's floor pick, not the clip, puts the body on the top -- as on the 16.41 fence, where the original's body ends 6.2
  over the start (model (1): 5.7) and drops to the floor beyond it, the fence being thin;
- the readers that see the feet mid-clip: the page's cameras (`walk.ts` `noteTick`, `play.ts`'s third-person target),
  the remote draw (`net/body.ts`, the feet and `travRootY`), the room's `HitPoser.stepBody` (`net/hitPose.ts`) and the
  ripple (`traversal.ts`, `remotePlayers.ts`) -- section 8.13 (f)'s list; the drawn root then over the carried feet, not
  `ClipPath`'s `rest`;
- the hand-off of (c): one frame held at `+0xfac` less the revealed root where that is over the floor pick, else the
  floor at once.

**Unread, and what would settle it.** The signs and the order of D:L468927-468951 (whether the steer's reference is the
root node's point and the stored `refPt` is carried with the root's travel, model (2)); the root node's blend into the
clip (its length; the capture shows it, clip frames 0-9); and, for the rows themselves, the clip's phase per row -- a capture
that reads the play's phase (`+0x1c`) and the root node's world point beside the feet each frame would decide (1) against
(2) without fitting a clock. `CLIMB_OVER_RISE_READING` (section 8.14, note only) stays as filed: its "measured" note now
points here.

### 8.18 LATER 1222 -- the law read at its source, scored against l278-climbover (2026-11-18; reading, pending review)

Written 2026-11-18 on `agent/later-1222` (over `56e78aa2fd`). **The answer first: the law fits.** Read at the source
and run per game frame, with the root node's blend pinned at **0.4 s** by the capture's own skel_root (matched within
0.0001 on every clean trial, independently of the feet), it reproduces the feet within **0.41-0.43** on the four
16.41-fence trials, **0.12** on the low fence and **0.49 / 0.58** on MP81 by row (**0.21 / 0.30** with MP81's
half-frame rows placed at their own clock), and the hand-off within 0.22. No timing is fitted: the one alignment (capture
frame i = tick i + 1) is the one the node matches at. So the port's design and the RED follow ((f), (g)). No source or
test changed. *Folded from the design's fresh review (PASS WITH FINDINGS, confidence medium; F1-F4, 2026-11-18): the
alignment above held a tick the source would also have stepped the blend on (F1); the pairing the source allows and
the node matches -- no held tick seen, the blend stepped from the push -- is built, and scores **0.33 / 0.32 / 0.33 /
0.53** on the four fence trials, **0.03** on the low fence and **0.40 / 0.30** on MP81 at its rows' own clock ((b), (c));
one game-frame clock owns the climb over's phase, x/z, vertical, end and hand-off (F2, (f) 1); two citations corrected
(F3, F4).*

**The evidence, apart.**

- *Source inspection (reading, pending review):* r0001's decompilation (`socom2_game.elf.decomp.c`, this note's pin);
  every `D:L` in (a) re-read at the line for this section. r0004's frame order is **not** re-checked (OT.R97).
- *The disc's data (reading):* `seal_climb_over` as section 8.17 read it (`clipsFromPack` over `RUN/MOTION_P.ZAR`, the
  entry from `RUN/READERC.ZAR`; 19 keys, playback 1, `refPt` (0, -0.96, -10.28), `BlendTime` unset); a scratch, not
  committed.
- *A capture of the original running (proven):* section 8.15's `rows.csv`, 8 trials, per trial the row before the first
  action-189 row as the start (its y the feet, its skelY the blend's snapshot: 11.4844 standing, F1 11.3587 running) and
  every action-189 row; T2's and F2's stale recorder-gap row dropped (section 8.17).
- *Model (a simulation of the reading, not a test):* a scratch script outside the repository (`law.py`, not committed)
  steps (a) per game frame and scores it against the rows. No unit test, dev-disc test, browser run or playtest.

**(a) The law, per game frame** (`dt` = 525/15734 s, the actor's `+0x2e0`). Section numbers in the port are (e)'s.

1. **The phase advances** (`FUN_0028c4f0`, called at D:L438901): play `+0x1c` += dt x the node's weight x rate / (the
   motion's `+0x10` x `FUN_0028ada0`'s (N-1)/N), clamped at the play's end (`+0xc`). A one-shot's **first tick after
   the push does not advance**: the push sets bit 8 of play `+0x28` on a non-looped play (D:L135209-135212) and
   `FUN_0028c4f0` clears it in place of the advance. For `seal_climb_over`: 0.035221 a frame, the end (18/19) reached at
   frame 26.9. *Folded from the design's review (F1):* the blend timer is stepped by dt every frame `FUN_00576860` runs
   (D:L436624-436629), whether or not that frame's tick advanced, so a held tick still steps the blend; which frame the
   held tick falls on against the capture's rows is the frame order, (b) and `CLIMB_OVER_FRAME_ORDER_READING`.
2. **The root's velocity for the whole frame** (D:L438909-438910): `FUN_0028c380` re-keys the play's node from the NEW
   phase (`FUN_0028d670`: key = floor(phase x N), clamped to N-1 with fraction 0), and `FUN_0028c250` writes the actor's
   `+0x2c..+0x34` from `FUN_00289bb0`: (key[i+1] - key[i]) x N / the motion's `+0x10` (the last interval's slope at the
   end, D:L132713-132718). Over one key interval this integrates to (N-1)/N of the key's step, not all of it.
3. **The steer** (`FUN_005b3340`, called at D:L439020; D:L468892-468951). The error is the target (play `+0x8c`, its y
   the contact's top, D:L467887, stored D:L467933) less the stored `refPt` turned by the body (play `+0x6c`) less the
   root node's world point (`FUN_003085c0` of the actor's `+0x2e8` through its matrix, D:L468927) -- in y, the last
   frame's feet plus the last frame's node y, whose x and z the pose zeroes (D:L439147-439148). The weight is
   k = sqrt(`FUN_002874f0`(phase)) (D:L468929-468930; the ease: 2p^2 to 0.5, then 1 - 2(p-1)^2, D:L131137-131149). The
   vertical is kept for the climb over (it is zeroed only under action 0x2c or a reversed 0x2e, D:L468933-468941); the
   error x k over dt goes to play `+0..+8` (D:L468943), and `FUN_0054d9a0` adds it to the actor's velocity
   (D:L416455). No 30 a second clamp: that is the looped branch's (`FUN_005b2d20`, D:L439024-439040).
4. **The `refPt` follows the root**: `refPt` -= the actor's `+0x2c` x dt (D:L468947-468951) -- the root's velocity alone,
   the steer's being added later in the frame.
5. **The node is posed** at the new phase (`FUN_00577ea0`, D:L439091), folded (D:L439110-439148: x and z into the actor,
   y kept), **blended** from the pose snapshot taken at the push by ease(remaining / length) (`FUN_00576860`,
   D:L436621-436634, called at D:L418455 right after the tick at D:L418454 -- *corrected by the review, F3: was
   "D:L418456"*; the length from the motion's `+0x20`, D:L135218-135220; the timer stepped by dt before it is read,
   D:L436624-436629), and
   capped at 11.487 under a non-reversed `UseVelY` top (`FUN_0059afd0`, D:L456455-456456).
6. **The feet integrate** (D:L456402 with D:L456435): y += the actor's `+0x30` x dt -- the root's vertical and the
   steer's.

So, with S(n) the root's vertical integrated so far and N(n) the node's y after the cap:
**A(n) = A(n-1) + v(n) dt + k(n) [top + 0.96 + S(n-1) - A(n-1) - N(n-1)].**

**Corrections the same pass found** (applied in place, marked "corrected by section 8.18"):

- Section 8.13 (a) and 8.14 `CLIMB_OVER_RISE_READING` said "off `UseVelY` the frame folds and sets 11.487". A top that is
  not `UseVelY` returns at D:L456356-456388, before both; under `UseVelY` the fold (D:L456426) and the set (D:L456460)
  are reached only when the play is **reversed** (flag 0x20); otherwise the root is capped (D:L456455-456456). The climb
  over is capped, never folded.
- The climb over's steer offset (0, -0.29, -2.42) in play `+0xa8` (D:L467909-467910) is read by neither steer branch
  (`FUN_005b2d20` D:L468521-468760, `FUN_005b3340` D:L468761-468951): it does not apply. G1's "about 0.46 with the
  first frame's fold" falls with the fold.

Not read: the default that fills the motion's `+0x20` when the motion table leaves `BlendTime` unset (*at the build: the
port's `./locomotion` `BLEND_TIME_DEFAULT` already reads it as `FUN_00287620`'s 0.4, not re-read here*; the capture pins the
value, (b)); r0004's frame order.

**(b) The blend, pinned by skel_root; the clock.** Capture frames 0-9 show the node blending into the clip (skelY
11.476 -> 10.585 -> 11.487 against the clip's root 10.86 -> 10.33). With the snapshot the start row's skelY and the
weight ease(max(0, L - j dt) / L) at tick j, **L = 0.40 s reproduces skelY within 0.00006 over all 27 frames** of T1,
F1 (its running snapshot), L1x and L2x; L = 0.39 or 0.41 miss by 0.03, 0.38 or 0.42 by 0.06. So the blend is 0.4 s on
r0004 -- pinned by the capture, its source's default unread (`CLIMB_OVER_BLEND_READING`). The same match
fixes the clock: capture frame i shows the phase (i + 1) x 0.035221 and the blend timer stepped i + 1 times; frame 26 is
the end phase, skelY 10.0039 = key 18. The alignments that shift either by a frame miss the feet by 1.04-1.45 at every
blend.

*Folded from the design's review (F1, the held tick; PASS WITH FINDINGS, confidence medium).* As first written this
paragraph read the match as "capture frame i is tick i + 1, tick 0 the push's held tick", and `law.py` integrated that
tick's root velocity (v dt = -0.094) with no blend step on it. The source does not allow that pairing: the push sets the
blend timer to its full length (D:L135218-135220) and `FUN_00576860` steps it by dt every frame it runs (D:L436624-436629),
right after the tick (D:L418455) -- a held tick steps the blend too, and with it the node leaves skelY at every blend
length. **Two pairings** remain, and they differ only in that one frame:

- **(A) the held tick seen**: the push frame's tick is held (bit 8, D:L135209-135212) and its blend step is taken; the
  first action-189 row is the frame after. Then the node is a frame ahead of skelY (the node does not fit at 0.4 s, nor at
  any length with the phase it implies).
- **(B) no held tick seen, built**: the push frame is the first action-189 row, its tick advances and its blend steps
  (capture frame i = tick i, the phase (i + 1) x 0.035221, the timer stepped i + 1 times). The node matches skelY within
  **0.00006** on T1, F1, L1x and L2x over all 27 frames, and no root velocity is integrated before frame 0 (the push
  frame's v dt is its own advance's). How the source's bit 8 (D:L135209-135212) is not seen on r0004 -- the push made after
  that frame's tick, or the bit cleared before it -- is not read: r0004's frame order is not re-checked (OT.R97).

(B) is built: it is the one pairing the source allows that the capture's own node matches. The +0.1 residual that (c) 1
named belongs to (A)'s integration of the held tick and does not appear under (B); what (B) leaves is (c) 2 and 3.

**(c) The scores** (max |feet y error| over every action-189 row; the alignment of (b); "hand" the row after the clip,
(d)):

| the node N | T1 | T2 | F1 | F2 | L1 | L2 | L1x | L2x | hand (fence / low) |
|---|---|---|---|---|---|---|---|---|---|
| blend 0 (none) | 0.27 | 0.26 | 0.27 | 0.48 | 0.74 | 0.49 | 0.41 | 0.41 | -0.21..-0.17 / 0.00 |
| blend 0.2 s | 0.27 | 0.26 | 0.28 | 0.45 | 0.71 | 0.49 | 0.30 | 0.30 | the same |
| blend 0.3 s | 0.30 | 0.29 | 0.30 | 0.43 | 0.59 | 0.49 | 0.12 | 0.12 | the same |
| **blend 0.4 s (pinned, (b))** | **0.42** | **0.41** | **0.42** | **0.43** | **0.58** | **0.49** | **0.12** | **0.12** | **-0.21, -0.22, -0.21, -0.17 / 0.00** |
| blend 0.5 s | 0.61 | 0.61 | 0.59 | 0.45 | 0.57 | 0.48 | 0.33 | 0.33 | the same |
| blend 0.6 s | 0.76 | 0.75 | 0.72 | 0.55 | 0.57 | 0.48 | 0.47 | 0.47 | the same |
| the capture's own skelY as N(n-1) | 0.42 | 0.41 | 0.42 | 0.42 | 0.59 | 0.49 | 0.12 | 0.12 | -0.21, -0.22, -0.21, -0.12 / 0.00 |
| 0.4 s, MP81's half-frame rows at their own clock | | | | | 0.30 | 0.21 | | | |
| **(B), built: 0.4 s, no held tick, the blend stepped from the push** (by row) | **0.33** | **0.32** | **0.33** | **0.53** | **0.67** | **0.58** | **0.03** | **0.03** | +0.58 / 0.00 (the port's standing root, (d)) |
| (B), MP81's rows at their own clock | | | | | **0.40** | **0.30** | | | |
| (B), the port's standing snapshot 11.4844 in place of F1's running 11.3587 | | | 0.39 | | | | | | |

*The rows above (B) are the first draft's pairing (A), kept as its history.* Under (B) the node matches skelY within
0.00006 on T1, F1, L1x and L2x (all 27 frames; T2 0.00006 by row too); F2 and MP81 leave it by up to 0.36 at their
half-frame rows. F2's rows after its recorder gap cannot be put at their own clock (the gap's shift is the recorder's:
placed at it, F2 misses by 0.72), so F2 is scored by row; MP81's rows are scored at their own clock, as before.

- **The feet alone do not pin the blend** (0.3-0.47 s all fit within 0.58; the best by the feet alone is 0.47 s at
  0.575); skel_root does, and with it the capture's own skelY scores as the modelled node: the blend is no longer an
  unknown for the feet.
- **What is left, at 0.4 s**, in three parts:
  1. *A constant +0.09 to +0.12 on every trial from frame 0* -- the size of the held tick's root velocity (its v dt,
     -0.094). With that tick's velocity left out, the low fence fits within **0.03**; the other maxima do not fall (T1
     0.33, F2 0.53, L1 0.67). *Folded (F1):* leaving it out is pairing (B) of (b), the one built; this residual is
     (A)'s and does not appear under (B).
  2. *A part proportional to the face's lift* -- on the 16.41 fence (lift 6.68) the original closes ahead of the law by
     up to 0.30 at clip frames 5-9 and ends 0.21 under it (0.27 under, against the low fence's +0.06). The weight alone
     cannot leave a closed offset short: some scale on the lift of about 3 % at the end is not in the reading. Under 0.5;
     the next capture's `+0x8c` and `+0x6c` would name it.
  3. *MP81's rows read mid-frame* -- L1's clock steps half a frame at its clip frame 6, L2's at 9 (section 8.17); at the
     same rows their skelY leaves the model (and T1's) by up to 0.36, so those reads straddle a frame. By row index
     L1 misses by 0.58 (its clip frames 11-13) and L2 by 0.49; with the law read at the rows' own clock (between its
     frames) 0.30 and 0.21. T2's and F2's rows after their gap are half-frame too and fit by index (0.41, 0.43).

**(d) The hand-off** (proven rows, the law's last frame): `+0xfac` = the last frame's feet + node -- T1 63.52 against
the 63.31 measured under (A) (the feet's end error, -0.21; under (B) 63.61, -0.30); the next row = `+0xfac` less the
revealed root where that is over `+0x2e4` (the fence: 52.92 against 52.71, action 9, with the capture's own revealed node
10.60), else `+0x2e4`. *Corrected by the review (F4):* on the low faces the floor picks are **120.00** (MP81) and
**49.46** (L1x); 129.40 and 55.74 are the modelled `+0xfac` (under (A)), not picks. What decides is `+0xfac` less the
revealed root -- the modelled 129.40 and 55.74 less the hand-off rows' nodes 9.54 and 6.34: **119.86** and **49.40** --
against `+0x2e4` (120.00, 49.46): under it on both, so the body is on `+0x2e4` at once, exact (under (B) with the port's
standing root, 129.49 - 11.48 = 118.01 and 55.83 - 11.48 = 44.35, under it too). Section 8.17 (c)'s arithmetic stands.
**The port's revealed root** (built): the revealed posture's own root (standing, 11.4844), where the original's node on
the hand-off frame is the new play's first blended frame (action 9 on the fence, 10.60; its pose and blend unread). On
the fence that puts the hand-off row 0.58 under the measured 52.71 under (B) (0.30 of it the feet's end error, the rest
the node); on the low faces the floor wins either way. Named under `CLIMB_OVER_FALL_READING` (section 8.14).

**Also measured, for the design:** on the low faces the original's feet go **under the start** mid-clip -- L1x/L2x
-2.90 at clip frame 6 and -3.56 at 25, MP81 L1 -0.69 (row 5) and -0.90 (row 25), L2 -0.80 -- while the root's world height (feet + skel_root) stays
at least 6.57 over the start (MP81 9.54). Section 8.13 (f)'s option A dipped too (-4.48 on a 7 fence 2 deep); a dip of the feet is the original's in
kind, and section 8.15's "A dips low faces where the original rises" is to be read as "dips by its own law, not the
original's".

**(e) The port, against the law** (source inspection at this branch's head; design input, no code):

- **The closure's clock.** `OneShotSteer.advance` (`viewer/src/net/emplacement.ts:387-410`), called by `climbSteer`
  (`viewer/src/traversal.ts:1978`), lays the weight each 60 Hz tick; the original lays it once a game frame. The law
  stepped per 60 Hz tick misses T1 by 1.20 and L1x by 0.71 (clip frame 4). It also advances on its first tick; the
  original holds the push's (D:L135209-135212).
- **The node.** `STEER_ROOT` and `lift()` (`traversal.ts:507`, `:1277-1282`, taken once at `climbClip`, `:1563`) use a
  constant 11.487; the original uses the last frame's blended, capped node y (11.48 -> 10.58 -> 11.487 -> 10.00 over the
  clip). The comment at `traversal.ts:502-506` is stale on this (the reference is the node's world point, 11.487 over
  the feet only while capped).
- **Where the lift goes.** It is closed on the drawn root only (`drawnRoot`, `st.open *= 1 - k`, `traversal.ts:1986`,
  `:1995`), while the feet ride `ClipPath`'s line (`viewer/src/clipPath.ts:158-183`).
- **The root's travel.** `ClipPath` interpolates the running share of the rise; the original integrates the key
  intervals' slopes x N / playback -- the law the port already holds as `mountRootVelocity`
  (`net/emplacement.ts:419`).

**(f) The port change** (design; simulation track; RED first):

1. The climb over's vertical runs (a) on the original's frame clock: a `GAME_FRAME_DT` accumulator in the climb's
   running state steps it once a game frame, ~~the first frame after the push held~~ *folded (F1): the push's own frame
   advances and steps the blend -- pairing (B) of (b), `CLIMB_OVER_FRAME_ORDER_READING`; the port steps game frame 0 on
   the press's tick.*
   *Folded (F2, two clocks):* **one game-frame clock owns the climb over** -- its phase, its x/z steer (`climbSteer`'s
   closure through `OneShotSteer.advance`, laid once a game frame at dt `GAME_FRAME_DT`, the turn with it), its vertical,
   its end and its hand-off. As first designed only the vertical moved and the x/z closure stayed per 60 Hz tick: the
   same clock error, two phase clocks in one play. `ClipPath` is read at the game frame's clock (frame i at (i + 1) x
   `GAME_FRAME_DT`), so `done` comes on the 27th game frame, not on a 60 Hz tick; the end test is the driver's
   (`FUN_0028c6e0`, the phase before the frame's advance plus half a frame's step past (n-1)/n, `mountPlayedOut`) on the
   frame after, the 28th, which is the hand-off's.
2. Each frame: v from the clip's key slopes (`mountRootVelocity`'s law on the climb shape); e = the contact's top + 0.96 +
   S - the feet - N(previous); the feet += v dt + k e; S += v dt.
3. N: the clip's root y at the phase, blended from the push's root height over 0.4 s by the ease
   (`CLIMB_OVER_BLEND_READING`), capped at 11.487; the drawn root over the feet is N, not `ClipPath`'s `rest`.
4. `ClipPath` keeps the climb over's x and z; `lift()` / `STEER_ROOT` leave the climb over (the other climbs keep them
   until their own capture); the stale comment is corrected.
5. The hand-off: `+0xfac` = the last frame's feet + N; the next frame stands at the higher of the floor pick and
   `+0xfac` less the revealed posture's root. LATER 278's `overPick` is replaced by the carried feet.
   *As built:* the floor pick is taken from `+0xfac` (the carried root's world height; its origin in the original unread,
   `CLIMB_OVER_FALL_READING`), so a deep top within the pick's reach (LATER 278's G1 16 and G1b 22 blocks) is stood on;
   where `+0xfac` less the root is over the pick (the 17.21 fence) that height is held one game frame and the pick's taken
   the next (section 8.13 (a), D:L456359-456386; on r0004 action 9 then 10), else the pick at once. A knock or a flinch
   mid-clip settles on the pick from the actor's own `+0xfac` at that frame (no hold: the move is released).
6. *Decided (the draw between game frames):* **the simulation holds the frame's values between game frames** -- the feet,
   x/z, the node and the drawn root (`pose().rootY` = N) all change once a game frame -- so the room, the bots, the shot's
   eye and the room's `HitPoser` (`net/hitPose.ts`, posed from the body snapshot) see the original's frame values, held
   for the tick between. That is MISSION R8's shape for a trajectory (the step-by-step arithmetic is the result: the law
   per 60 Hz tick misses by 1.20). R8 also draws its trajectories interpolated between game frames (the jump's
   `Walker.drawnFeet` by `airClock.alpha()`, the grenade by `flight.alpha()`); **that draw-only interpolation is not built
   here**: it lives in `Walker.drawnFeet` (`viewer/src/mover.ts`, a hot file outside this task's claim). So the page's
   cameras (the first-person eye from `drawnFeet`/`tickFeet`, the third person's target from the posed root) see each
   game frame's step spread over the 60 Hz tick it lands in and held over the next, as the jump was before R8; the remote
   draw (`net/body.ts`, the feet and `travRootY` per snapshot) sees the held frame values under its own snapshot
   interpolation. Owed (named for the controller): R8's interpolation for the climb over's drawn feet, a `mover.ts` hunk.
   Room and bots run the same `Traversal`: no room hunk. The 0.4 s and the frame order go to research 101 and the ledger
   at the build.

**(g) The RED's shape.**

- *Per measured trial, a synthetic class-5 face* (`viewer/test/traversal.test.ts`, "LATER 1222"; its twin in central
  `test/roomClimb.test.ts`): a thin face whose top lies the capture's top - start over the feet (T1 and F1 17.21, the
  latter from the running snapshot; L1 10.15 on MP81's cap; L1x 7.26), the floor beyond it at the start's level, the
  walker at the start, Action pressed. Asserts, at each game frame of the clip, the feet's y less the start within the
  capture's row (decoded values in the test, RS.R8) by **0.5** on the fence, **0.2** on the low fence and **0.4** on
  MP81 (its half-frame rows at their own clock); the drawn root over the feet within 0.01 of the row's skelY on T1 and
  L1x (the blend); the row after the clip within 0.3 (52.71 - 47.06 on the fence; the floor on the others).
  *Folded (F1): the tolerances set against the built pairing (B), each its scored maximum ((c)) plus a stated margin of
  0.07:* T1 **0.40** (scored 0.33), F1 **0.46** (0.39 from the port's standing snapshot), L1 **0.47** at its rows' own
  clock (0.40), L1x **0.10** (0.03); the drawn root 0.01 (0.00006); the row after the clip on the fence **0.66** (0.58:
  the port's standing revealed root, (d)), on the low faces the floor beyond exactly. L1x's floor beyond is put at the
  capture's walk-away height (48.66, 0.57 under the start; its hand-off row's 49.46 is `+0x404`, 0.8 over it on these
  rows, not modelled).
- *Red today:* the feet stay on `ClipPath`'s line to `floorUnder(...) ?? start` -- by up to **11.4** on the fence, 4.1
  on MP81 and 3.6 on the low fence.
- *Kept green:* LATER 278's G1 and G1b (the 16 and 22 blocks end on the top) and LATER 1223's full clip. **F3's "the feet
  never under the floor" is contradicted by the capture** (the low fence's -3.56, above) and is rewritten with the RED to
  the measured dip; its end on the floor stays.

**What the next capture would still settle** (not a gate on the design): play `+0x1c`, the actor's `+0x2c..+0x34` and
skel_root's y per frame at the three spots, one trial each, read at the frame's end -- it settles (c) 1's frame order and
names (c) 2's lift scale.

| name | stands for | value in the code | the evidence that settles it |
|---|---|---|---|
| `CLIMB_OVER_BLEND_READING` (*note only*) | the root node's blend into `seal_climb_over` from the push's pose: ease(remaining / 0.4 s) (`FUN_00576860` D:L436621-436634; the length the motion's `+0x20`, D:L135218-135220, unset in the table); 0.4 s **pinned by the capture** (skel_root within 0.0001 on T1, F1, L1x, L2x), the default's source unread | none (no build yet) -- *built: section 8.19* | the read of the motion table's default for an unset `BlendTime`; the build files it in research 101 and the ledger |
| `CLIMB_OVER_FRAME_ORDER_READING` (*note only*) | ~~whether the push frame's held tick moves the feet by its root velocity (-0.094) before the first action-189 row (section (c) 1)~~ *folded (F1):* which frame the first action-189 row is against the push. Two pairings the source allows ((b)): **(A)** the push frame's tick held (bit 8, D:L135209-135212) with its blend step taken (D:L436624-436629, `FUN_00576860` at D:L418455), the first row the frame after; **(B)** no held tick seen -- the push frame is the first row, its tick advances and its blend steps (capture frame i = tick i). **(B) is built**: the node matches skelY within 0.00006 under it and not under (A) at any blend length; the +0.1 residual of (c) 1 is (A)'s. How bit 8 goes unseen on r0004 is unread | none -- *built: section 8.19* | the capture of "the next capture" above, read at the frame's end (play `+0x1c` and `+0x28` bit 8 on the push frame) |

### 8.19 Readings (LATER 1222's build, 2026-11-18; reading, pending review)

Filed by LATER 1222's build (`agent/later-1222`; `packages/viewer/src/traversal.ts`), section 8.18 (f) as folded. Research
101's "LATER 1222" group and the ledger carry the two constants.

**As built.** One game-frame clock owns the climb over (`OverCarry`'s `GameFrameAccumulator`, fed each 60 Hz tick):
`overFrame` steps, once a game frame, the end test (`mountPlayedOut` on the phase before the advance), the phase and the
x/z steer (`climbSteer` through `OneShotSteer.advance` at dt `GAME_FRAME_DT`, `ClipPath` read at the frame's clock for
x and z only), the root's vertical velocity (`mountRootVelocity`'s law), the steer's vertical on the last frame's feet
and node, and the node (blended over `CLIMB_OVER_BLEND_READING`, capped at 11.487), which is the drawn root
(`Traversal.drawnRoot`). Game frame 0 is stepped on the press's tick (`CLIMB_OVER_FRAME_ORDER_READING`); the clip's 27
frames run 0-26 and the end test passes on frame 27, the hand-off's (`overHandOff`): the frame at the higher of the floor
pick and `+0xfac` less the posture's root, held one frame where over the pick, then the pick; the climb ends there
(`endClimb`), not through `endUncut`'s pick. A knock's or flinch's pop mid-clip settles on the same pick from the carried
`+0xfac` (`climbSettle`). `lift()` and `STEER_ROOT` no longer reach the climb over (its node is its own); the other
climbs keep them. LATER 278's `overPick` is removed. Between game frames every value holds (section 8.18 (f) 6: the draw
interpolation of MISSION R8 is not built -- it lives in `Walker.drawnFeet`, `mover.ts`, outside this build's claim).

**Measured against the build** (unit tests on synthetic faces, `seal_climb_over`'s disc keys decoded in the test):
the port's per-frame feet equal the scratch law's within 0.005 on T1, F1, L1 and L1x; against the capture's rows T1
0.33, F1 0.39 (the standing snapshot), L1 0.40 at its rows' own clock, L1x 0.03; the drawn root within 0.01 of
skel_root on T1 and L1x (asserted; the snapshot the port's 11.484 against the rows' 11.4844); the fence's hand-off row 0.58 under the measured, then the floor beyond; the low faces' the
floor beyond at once. The room's mover and the page's agree at every command (central `roomClimb.test.ts`). The climb's
end now lands on the 60 Hz tick its 28th game frame falls on: 55 ticks from the press's (0.917 s against the capture's
0.901 s first-row-to-first-other-row), where the 60 Hz clip ran 54.

| name | stands for | value in the code | the evidence that settles it |
|---|---|---|---|
| `CLIMB_OVER_BLEND_READING` | the root node's blend into `Climb over` from the push's pose, its length (`FUN_00576860` D:L436621-436634, called at D:L418455; the timer from the motion's `+0x20`, D:L135218-135220, unset in the row; the 0.4 the port's `BLEND_TIME_DEFAULT` reads in `FUN_00287620`), pinned by the capture (skel_root within 0.00006 on T1, F1, L1x, L2x); the snapshot the posture's root | `0.4` (`Traversal.overFrame`) | the read of `FUN_00287620`'s default at its line; a capture of a climb over from a run with the run cycle's root read at the push |
| `CLIMB_OVER_FRAME_ORDER_READING` | the frame order against the capture's rows: pairing (B), the push's own frame the first action-189 row (its tick advancing, its blend stepped) -- section 8.18 (b), the review's F1; (A), the held tick seen, leaves the node off skel_root | `'push-advances'` (`Traversal.climbClip` steps game frame 0 on the press's tick) | play `+0x1c` and `+0x28` bit 8 read on the push frame of a climb over (section 8.18, "the next capture") |

**The build's review (2026-11-18, PASS WITH FINDINGS, high), folded.** (1) How the push frame's bit 8 goes unseen, read
on r0001 (reading, pending review): the press's push runs early in the driver (`FUN_005b4b40`, D:L418132, D:L418155); the
driver's phase preview `FUN_0028c4f0(.., 0)` on the top play (D:L418293) clears bit 8 without storing the phase
(D:L134257), so the tick at D:L438901 advances on the push frame -- pairing (B) predicted by the source, not only fitted.
The same preview would reach the other one-shot climbs pushed on this path, which keep their first advance on the next
command in the port: possibly a frame late (owed, outside LATER 1222). (2) The dip figures: MP81 is L1 -0.69 (row 5) and
-0.90 (row 25), L2 -0.80. (3) The T1/F1 synthetic face puts the floor beyond at the start's height, where the capture's
is +1.35 (48.407): the test's second row after the clip checks the synthetic face, not the capture; the hand-off row's
comparison is unaffected. (4) The 1223 timing test (55 ticks from the press's tick) is the original's frame of
reference: the push frame is the first action-189 row (pairing B), the first other row is 0.901 s (27 game frames)
later in T1, F1, L1x and L2x; the room's twin already measured from the push.

### 8.20 LATER 1222 -- the built law against l1222-climbover2 (2026-11-19)

Written 2026-11-19 on `agent/later-1222` (over `3fb47ecaae`); no source or test changed. **The answer first.** The law of
section 8.18 (a) reproduces every field this capture read, value for value, once it is given two inputs the build does
not carry: **each game frame's own dt** (the actor's `+0x2e0`) and **the steer record's turn of `refPt` onto the
contact's normal, its vertical included** ((b)). With both, the feet agree within **0.0022 / 0.0007 / 0.0002** (S1b / S3b
/ S2), the node within 0.0001, the phase within 0.00001, the blend timer within 0.00001, `refPt` within 0.00014 and
`+0xfac` within 0.0016; nothing is fitted. **The built port** (a fixed `GAME_FRAME_DT`, no tilt) agrees at the CSV's
resolution on S1b (no short frame in its clip) for the phase, the blend, `refPt` and the node, and misses the feet by
**0.36** there (the tilt; T1's stated tolerance is 0.40). On S3b and S2 the original ran one **short game frame** inside
the clip (dt 0.01672), which puts the port half a frame ahead from that row on: S3b misses by 0.37 by row and **0.15 at
its rows' own clock, over L1x's tolerance of 0.10**; S2 misses by 0.58 by row and 0.30 at its own clock, within L1's
0.47. Given the capture's dt, the built law is within 0.033 (S3b) and 0.019 (S2). So the end phase (0.947 on the tall
fence, 0.933 on the low faces) is set by the short frame, not by the face ((c)). The blend's 0.4, the frame order
`'push-advances'`, the `refPt` law, the root's velocity law and `+0xfac` = the feet + the node are now **measured** ((d)).
Section 8.18's two sub-0.5 residuals are settled ((f)).

**The evidence, apart.**

- *A capture of the original running:* l1222-climbover2 (`agent-mail`
  `evidence/weekend-mega-2026-11-14/later1222-climbover2/`, sha256 `017ea6d2...a5ce`). Shadow PC 3 ran r0004 under PCSX2
  2.8.2 on 2026-11-19 at 03:24-03:33Z, with per-frame PINE memory reads (no breakpoints) beside PCSX2's video. It is not
  harness-scored. There are five trials: S1 and S1b on MP1 `alaska4d_fence01` (16.37 tall), S3 and S3b on MP1's low
  fence01 at section 8.17's spot, and S2 on MP81 `cell3_drydockcap1` (10.15). The gap-free trials S1b, S3b and S2 are
  scored. S1 and S3 were checked the same way, and their 4 frames lost at the press fall before the clip. The CSVs
  round positions to 0.0001 and the phase, blend and dt to 0.00001; the tolerances below are stated against that. One
  stale read was found: S1b row 16 (clip frame 5) holds the previous frame's feet x, y and z, and row 24 (frame 13) the
  previous frame's x. Both are replaced by the body matrix's translation (`+0x28` row 3), which the rows' own velocity
  confirms; every other row reads the two equal.
- *The disc's data (reading):* the contact faces' normals from the collision (`simMapFromBytes` -> `groundPolygons`,
  `polygonNormal` and each polygon's first triangle) for MP1 `alaska4d_fence01` (both fences) and MP81
  `cell3_drydockcap1`, and `seal_climb_over`'s keys as section 8.17 read them. This was a scratch run and is not
  committed.
- *Source inspection (reading, pending review):* the steer record `FUN_005b1a10` (D:L467927, D:L467932-467934), its
  caller's contact record (D:L468353-468369, D:L468504) and `FUN_005b3340` (D:L468841-468844, D:L468892-468893,
  D:L468898-468926), on this note's pin. The vector at `0x3f6500` that `+0x9c` copies is zero in the ELF's file image:
  it is set at run time, and its value is unread.
- *Model (a simulation of the reading, not a test):* scratch scripts outside the repository (not committed) step the
  law per game frame against the rows, and also one frame at a time from the capture's own state. There is no unit
  test, dev-disc test, browser run or playtest of this section.

**(a) The table** (max |capture - law| over the 27 clip frames; "built" means the port's law: a fixed `GAME_FRAME_DT`,
`refPt` flat, the capture's target y as the top, the snapshot 11.4844; the "source law" is the same with the frame's own
dt and (b) 1's tilt):

| quantity | built, by row (S1b / S3b / S2) | built, the capture's dt | source law | measured within |
|---|---|---|---|---|
| phase (play `+0x1c`) | 0.00001 / 0.0176 / 0.0176 | 0.00001 / 0.00000 / 0.00001 | the same | 0.00002 |
| blend remaining (`+0x178`; length `+0x17c` 0.4 on every row) | 0.00000 / 0.00000 / 0.0167 | 0.00000 / 0.00000 / 0.00001 | the same | 0.00002 |
| `refPt` x (play `+0x6c`) | 0.00005 / 0.027 / 0.053 | 0.00005 | 0.00005 | 0.0002 |
| `refPt` y (`+0x70`) | 0.00005 / 0.381 / 0.580 | 0.00005 / 0.00014 / 0.00013 | the same | 0.0002 |
| `refPt` z (`+0x74`) | 0.00005 / 0.456 / 0.325 | 0.00005 / 0.00014 / 0.00013 | the same | 0.0002 |
| target (play `+0x8c..+0x94`) | constant on every frame of the five trials; y against the disc's top at the target's column 0.04 / 0.006 / 0.0001 | | | (see (d)) |
| root velocity x / y / z (u/s; the capture's from `refPt`'s step over dt) | 0.0023 / 0.0020 / 0.0028 (S1b); 0.74 / 0.53 / 0.38 (S3b); 0.74 / 12.2 / 4.9 (S2) | 0.0023-0.0025 / 0.0020-0.0081 / 0.0028-0.0072 | the same | 0.01 |
| the steer's step k e, y | 0.070 / 0.359 / 0.352 | 0.070 / 0.0064 / 0.0038 | 0.0004 / 0.0002 / 0.0001 | 0.001 |
| the steer's velocity, y (u/s; the capture's `+0x30` less the root's) | 2.09 / 10.8 / 10.5 | 2.09 / 0.28 / 0.11 | 0.013 / 0.004 / 0.004 | 0.03 |
| feet y (`+0x20`) | **0.358 / 0.369 / 0.579** (at the rows' own clock 0.360 / 0.152 / 0.303) | 0.358 / 0.033 / 0.019 | **0.0022 / 0.0007 / 0.0002** | 0.003 |
| node (skel_root's local y) | 0.00006 / 0.357 / 0.357 | 0.00006 / 0.0001 / 0.0001 | the same | 0.0002 |
| `+0xfac` on the hand-off row (capture - law) | -0.266 / +0.302 / +0.144 | -0.266 / -0.022 / +0.013 | +0.0016 / +0.0005 / -0.0002 | 0.003 |

- *The steer, one frame at a time:* from the capture's own state each frame (the body matrix, the feet, the node and
  `refPt` of the frame before), the steer's displacement (the velocity less the root's, times dt, turned to the world)
  equals k x (target - the turned `refPt` - the root's world point) within 0.0008 / 0.0016 / 0.0016 in x / y / z on
  S1b, 0.0004 on S3b and 0.0001 on S2. The steer's error and its step are therefore measured on all three axes, and the
  steer's velocity (D:L416455) is separated from the root's in `+0x2c..+0x34`.
- *The feet's x and z* are not scored against the port. The port's x and z ride `ClipPath` and its closure
  (`climbSteer`), and no per-frame x/z of the port was computed for these spots. The source law's x and z are covered by
  the one-frame check above and by `refPt` x/z.
- *The node:* the recorder's skel_root world point is the feet + skel_root's local y on every row (the body matrix is a
  pure yaw).

**(b) The two inputs the build does not carry.**

1. **`refPt` is turned onto the contact's normal, its vertical included.** The steer record `FUN_005b1a10` (called at
   D:L468504 with the stored contact: its hit point and its normal, D:L468353-468369) stores three things: the normal
   reversed at play `+0x7c` (D:L467927, D:L467932), whole, its y kept; the target at `+0x8c` (D:L467933); and a fixed
   vector at `+0x9c` (D:L467934). Each frame `FUN_005b3340` turns `+0x7c` into the body's frame (D:L468841-468844),
   builds the rotation that takes `+0x9c` onto it (`FUN_00306d40`, D:L468892), and turns the stored `refPt` by that
   rotation (D:L468893) and then by the body matrix (D:L468898-468925), before taking it from the target (D:L468926). So
   on a face whose normal leans by ny (its y component), the turned `refPt`'s y is refPt.y x sqrt(1 - ny^2) +
   refPt.z x ny. As `refPt.z` walks from -10.28 to +5.4, the steer's aim moves by -ny x refPt.z: on `alaska4d_fence01`
   (ny 0.05614) that is +0.58 at the clip's start and -0.27 at its end. The capture fits `+0x9c` = (0, 0, -1) (in y and z; x unread) in the
   body's frame: the other sign misses by 9. The normal that fits is the polygon's first triangle's (0.05614 / 0.00521 /
   -0.00301). Its Newell normal (0.0568 / 0.00277) misses S3b by 0.015. Which normal the collision stores is unread.
   **The port** carries the contact's nx and nz only, with `refPt` flat (`REF_UP`), so on that fence its steer aims
   0.58 low at the start. The same turn is `FUN_005b3340`'s for every one-shot climb and for the mount, so the other
   climbs' `lift()` / `STEER_ROOT` miss it as well (outside LATER 1222).
2. **The game frame's own dt.** Most rows read `+0x2e0` 0.03337, but one row in each trial reads **0.01672**: S1b row 10
   (before the press), S3 clip frame 11, S3b clip frame 23, S2 clip frame 9. On that row the clock (`0x442fd0`) and the
   phase step half a frame, and the blend timer, `refPt`'s step and the root's v dt take the short dt, while k e is not
   scaled by dt. These are short frames of the original, not reads that straddle a frame. **The port** steps a fixed
   `GAME_FRAME_DT`. How often the original runs a short frame on a PS2, against PCSX2 2.8.2's frame pacing, is unread.

**(c) The end phase.** The original ends every trial after 27 action-189 rows. With 27 full frames the phase takes 27
steps of 0.035221 and is clamped at 18/19 = 0.94737 on frame 26 (S1, S1b). With one short frame among the 27 it reaches 26.5
steps = **0.93336** (S3, S3b, S2; read 0.93339), so it stops short of the clamp. The frame count stays 27 because the
end test (`FUN_0028c6e0`, the phase before the frame plus half a frame's step past 18/19, section 8.18 (f) 1) passes
on frame 27 either way: 0.93339 + 0.01761 = 0.95100 > 0.94737. Two short frames would leave 0.9157 + 0.0176 < 18/19 and
take a 28th row. The node follows the phase: 10.0039 (key 18) at the clamp, and 10.2187 at 17.73 keys. The tall fence
ended at 0.947 only because its short frame fell before the press. **The port** ends every face at 0.94737 on frame
26 (fixed dt), as the original does without a short frame. Fed the capture's dt, the built law ends S3b and S2 at
0.93339, with the node at 10.2187 within 0.0001.

**(d) What is now measured** (proven: a memory trace of the original compared value for value within the stated
tolerance; the comparison is this section's, pending its fresh review):

- **`CLIMB_OVER_BLEND_READING` 0.4.** The original's blend length (`+0x17c`) reads **0.4** on every clip row of the five
  trials. The time left (`+0x178`) equals 0.4 less the frames' dt, the push's own frame included (0.36663 on the first
  row), within 0.00001, and it is zero from clip frame 11/12. Blended and capped at 11.487, the node is skel_root within
  0.0001. The source line of the default (`FUN_00287620`) is still unread; the value no longer rests on it.
- **`CLIMB_OVER_FRAME_ORDER_READING` `'push-advances'`.** The first action-189 row is the new play's first frame: the
  stack's top goes from index 0 to 1, with end 18/19 and flags 0x1, so bit 8 (0x100) is clear. Its phase is one frame's
  step (0.03522), each later full frame adds one more within 0.00001, and its blend has stepped once. Pairing (B) of
  section 8.18 (b) is measured, and (A) is excluded.
- **The `refPt` law** (section 8.18 (a) 4): from (0, -0.96, -10.28), less the root's velocity in the body's frame x dt
  each frame, never turned in storage: x, y and z within 0.00014 on every frame.
- **The root's velocity law** (section 8.18 (a) 2, `mountRootVelocity`'s): the key slope at the new phase x 19 / the
  playback, within 0.01 u/s on x, y and z.
- **`+0xfac`** = the last clip frame's feet + node, within 0.0001 of the capture's own rows (S1b, S3b, S2).
- **The steer** (section 8.18 (a) 3, with (b) 1): k = sqrt(ease(phase)), and its vertical is kept. One frame at a time
  it is within 0.0016 on x, y and z. This is the law; the port's build of it lacks (b) 1.
- **The target** is constant through the clip on all five trials. Its y is the contact's top within 0.0001 on MP81's
  level cap. On the two sloped fence tops it lies 0.006 and 0.04 off the disc's top at the target's column; the column
  the original takes it at (LATER 111's top at the hit's column) is not reconstructed here. So "the target y = the top"
  is measured within 0.0001 on the flat cap only, and within 0.05 on the sloped tops.
- The built port as a whole is **not** proven: (e).

**(e) What still differs** (the build against this capture):

1. **The tilt (b) 1: a departure.** It costs 0.36 on the feet and +0.27 on `+0xfac` on S1b, about 0.03 on S3b and 0.02
   on S2 (whose normals lean 0.005 and 0.003). That is within T1's tolerance, but the build omits a term of the source.
   Owed: the contact's normal y on the climb over's steer record, with `refPt` turned by it in y, x and z
   (`CLIMB_STEER_TILT_READING`, below).
2. **The short frame (b) 2.** It is the port's fixed game-frame clock, not LATER 1222's law. S3b is **over L1x's 0.10 at
   its rows' own clock (0.15)**. Named for the controller and not changed here. Whether the port's game clock should
   ever take a short frame is a question about the whole simulation and the original's pacing, outside LATER 1222.
3. **The fence's hand-off row.** The original stands it at `+0xfac` 63.2992 less the revealed node **10.5977**
   (skel_root on action 9's first frame), which gives 52.7015 exactly. The port subtracts the standing root 11.4844
   instead: 52.08 from the built `+0xfac`, 0.62 under (within its 0.66). With (b) 1 built, `+0xfac` would be right
   (63.298) and the row would fall 0.89 under, so today the two errors partly cancel (`CLIMB_OVER_FALL_READING`). The low
   faces go to the floor (`+0x2e4`) at once in both.

**(f) Section 8.18's sub-0.5 residuals, settled.**

- **(c) 2, "a part proportional to the face's lift"**, is (b) 1. l278-climbover's rows rerun under the law with the
  fence's tilt: T1 0.327 -> **0.037**, F1 0.325 -> 0.038, T2 0.318 -> 0.047, and L1x 0.029 -> 0.006. It is not a scale on
  the lift.
- **(c) 3, "MP81's rows read mid-frame"**, is (b) 2. l278's L1 and L2 half-steps are short frames, and with the rows' dt
  taken from their clock (and MP81's tilt) L1 goes 0.673 -> **0.001** and L2 0.580 -> 0.001, the node within 0.0005.
  F2's recorder gap is the recorder's, as before.
- (c) 1 already belonged to pairing (A); (d) measures (B).

| name | stands for | value in the code | level (2026-11-19) | the evidence that settles the rest |
|---|---|---|---|---|
| `CLIMB_OVER_BLEND_READING` | the root node's blend into `Climb over` from the push's pose, its length | `0.4` (`Traversal.overFrame`) | **proven** (l1222-climbover2: `+0x17c` 0.4 on every row, `+0x178` within 0.00001, the node within 0.0001), pending review | none for the value; `FUN_00287620`'s default at its line for the record |
| `CLIMB_OVER_FRAME_ORDER_READING` | the push's own frame is the first action-189 row, advancing and its blend stepped | `'push-advances'` (`Traversal.climbClip`) | **proven** (l1222-climbover2: the first row's phase one step, bit 8 clear, the blend stepped once; within 0.00001), pending review | none |
| `CLIMB_STEER_TILT_READING` (*note only*) | `FUN_005b3340` turns the stored `refPt` by the rotation from `+0x9c` onto the contact's reversed normal (`+0x7c`, its y kept: D:L467927, D:L467932, D:L468841-468844, D:L468892-468893): on a leaning face the steer's aim moves by -ny x refPt.z | none: the port's climb over steers on a flat `refPt` (the contact's nx, nz only) | gap: the source read (pending review), and the capture measures it (one frame within 0.0016; the feet 0.36 -> 0.0022 on S1b) | the build: the contact's normal y on the steer record (which normal the collision stores -- first triangle or plane -- read at the source); `+0x9c`'s run-time value |

**Ruled 2026-11-19 (the main controller, after s8.20).** (1) The port keeps its fixed game frame (`GAME_FRAME_DT`):
the console's short frames (+0x2e0 0.01672, one inside S3, S3b and S2's clips) are a **named known departure**, the same
family as LATER 1052's measured frame time; the tests stay on short-frame-free trials. (2) The steer's tilt
(`CLIMB_STEER_TILT_READING`) and the hand-off from the revealed node are one follow-up, LATER 1244, built together so the
hand-off row does not regress alone.

### 8.21 LATER 1244 -- the steer's tilt and the hand-off's revealed node, read at the source (2026-11-19; reading, pending review)

Written 2026-11-19 on `agent/later-1244` (over `16ffcaa405`), before the build. Source inspection on this note's pin; the
disc through the repository's readers in a scratch (not committed); the capture is section 8.20's (proven).

**(a) The tilt.** The push records the steer (`FUN_005b2620` -> `FUN_005b1a10`, D:L468504) with the stored contact's
normal, words 4-6 of the hit slot (`pfVar13 + 4`; the slot's layout, research 281 s4.3). `FUN_005b1a10` negates the whole
vector (D:L467927-467929) and stores it once at play `+0x7c` (D:L467932), with the target at `+0x8c` (D:L467933) and the
vector at `0x3f6500` at `+0x9c` (D:L467934); nothing writes `+0x7c` again. The stored `refPt` (`+0x6c`) is **never turned
in storage**: each frame `FUN_005b3340` turns `+0x7c` into the body's frame by the actor's conjugate rotation
(D:L468840-468844), builds the rotation from `+0x9c` onto it (`FUN_00306d40`, D:L468892: the half-way vector
h = normalize(a + b), the quaternion (a x h, a . h), D:L206032-206078 -- the shortest arc), turns a copy of `refPt` by it
(D:L468893), then by the body matrix (D:L468898-468925), and takes it from the target (D:L468926); the stored `refPt` only
loses the root's velocity x dt (D:L468947-468951). **Which normal**: the hit slot's is the plane of the polygon's first
three points, `(p2 - p1) x (p0 - p1)`, its sign kept and renormalised (the hull's VU0 routine, micro 279-285 and 364-377,
research 281 s4.3) -- the first triangle's normal, the one section 8.20 (b) 1 found to fit (Newell's misses S3b by
0.015). `+0x9c` is set at run time (zero in the ELF's file image); the capture fits it as (0, 0, -1) in the body's frame (y and z only: the capture never reads `+0x9c`, and its rows constrain only y and z; one PINE read of play `+0x9c` would settle x),
the body's forward (the other sign misses by 9). So on a face leaning by ny the steer's aim moves by about -ny x refPt.z in
y (+0.58 at the start on `alaska4d_fence01`) and by about ny x refPt.y along the facing (up to 0.3 mid-clip, where the
root has risen 4.6 over its start).

**(b) The hand-off's node.** Action 9 on the hand-off row is `Jump fall` (the anim-type table at `0x661060`, entry 9;
10 is `Jump land`, 1 `Stand`), pushed by `FUN_0057e050` (D:L440726) when the climb over's end leaves the body over its
floor; its Seal clip is `seal_runningjump_in_air` (`motion.rdr`: playback 5, 14 keys, `BlendTime` 0.75), whose
`skel_root` holds **one key, y 10.59765625** (`RUN/MOTION_P.ZAR` through `clipsFromPack`). The capture's action-9 row
reads skel_root **10.5977**, its phase 0.00719 (one 5 s frame of 13/14) and its blend 0.71663 of 0.75 (stepped once):
the node is the clip's own root, the 0.75 blend from the climb over's last node (10.0039) not seen in it (weighted by
ease(0.9555) = 0.996 it would read 10.006); `Jump land`'s next row reads that clip's root at its phase the same way
(10.7412 at key 1.0036). `FUN_0059afd0` then stands the feet at `+0xfac` less that node where that is over `+0x2e4`
(D:L456368-456371): 63.2992 - 10.5977 = 52.7015, the row exactly. Why the blend is not in the node on these rows (the
push against the blend's step, D:L418454-418455) is r0004's frame order, not read (OT.R97). On the low faces the end
reveals `Stand` on the floor at once (the node then rewritten as `+0xfac` less the floor, D:L456372), as built.

**(c) The design** (simulation track):
1. The climb over's record keeps the contact polygon's first-triangle normal, reversed (world), and `refPt`'s x and z
   besides its y; each game frame, before the turn, that normal is taken into the body's frame (the yaw), the shortest
   arc from `CLIMB_STEER_TILT_READING` (0, 0, -1) onto it is built and the stored `refPt` is turned by it.
2. The vertical error takes the turned `refPt`'s y in place of the flat one; the x/z closure takes the turned `refPt`'s
   horizontal change (turned less flat, through the yaw) as a move of its aim, closed by the same weight k.
3. The stored `refPt` loses the root's velocity x dt on all three axes (`mountRootVelocity`'s law), never turned.
4. The hand-off over the pick stands on `+0xfac` less `CLIMB_OVER_FALL_READING` (`Jump fall`'s root, 10.59765625), the
   held frame's drawn node that root; where that is not over the pick, the pick at once, as built.
5. Tests: the fence and the low faces of l1222-climbover2 on synthetic faces with the disc's measured slope, the feet
   per game frame within 0.01 on short-frame-free rows and the hand-off row within 0.05; LATER 1222's cases given their
   faces' slopes and tightened (T1 0.06, F1 0.06, L1x 0.03; the hand-off 0.06); the room's twin.

**(d) As built** (`agent/later-1244`, `packages/viewer/src/traversal.ts`; unit tests on synthetic faces, `seal_climb_over`'s
disc keys decoded in the test). `climbClip` keeps on the climb over's `OverCarry` the contact polygon's first-triangle
normal, reversed (`firstTriangleNormal`), and `refPt`'s x and z (0, -10.28); `overFrame` takes that normal into the body's
frame by the yaw before the frame's turn, turns the stored `refPt` by the shortest arc from `CLIMB_STEER_TILT_READING`
onto it (`turnByArc`, `FUN_00306d40`'s quaternion), uses the turned y in the vertical error and moves the x/z closure's
open offset by k x (the turned less the flat, through the yaw); the stored `refPt` loses the root's velocity x dt on all
three axes. `overHandOff` stands the held frame at `+0xfac` less `CLIMB_OVER_FALL_READING`, its drawn node that root, the
pick taken as before. Every face keeps its flat steer where the polygon's first triangle is degenerate. Measured against
the build: l1222-climbover2's S1b feet within **0.0024** of every row (built LATER 1222: 0.358), S3b **0.0009** and S2
**0.0002** on the rows before their short frames (0.033, 0.020); S1b's hand-off row **5.6405** against 5.6421 (-0.0016;
built LATER 1222: 0.62 under), its node 10.59765625 against skel_root's 10.5977; the low faces on their floor at once.
l278-climbover's T1 **0.037** (0.33), F1 0.039 (0.39), L1 0.385 at its rows' own clock (0.40; its short frames), L1x
0.0057 (0.029); the fence's hand-off row 0.034 / 0.035 over (T1, F1; was 0.58 under). The room's mover and the page's
agree at every command (central `roomClimb.test.ts`: T1, L1x, S1b, S3b). LATER 278's G1 and G1b, LATER 1223's
no-cut and timing, LATER 1222's flinch pop and low-fence dip unchanged and green.

### 8.22 Readings (LATER 1244's build, 2026-11-19; reading, pending review)

Filed by LATER 1244's build (section 8.21). Research 101's "LATER 1222" group carries both rows.

| name | stands for | value in the code | level (2026-11-19) | the evidence that settles the rest |
|---|---|---|---|---|
| `CLIMB_STEER_TILT_READING` | play `+0x9c` in the body's frame: the vector `FUN_005b3340` turns the stored `refPt` from, by the shortest arc, onto the contact's reversed first-triangle normal in the body's frame (D:L467927-467934, D:L468840-468844, D:L468892-468893; research 281 s4.3 for the normal) | `[0, 0, -1]` (`Traversal.overFrame`) | **proven** for the value (l1222-climbover2: the port's feet within 0.0024 on S1b; the other sign misses by 9), pending review; the turn read at the source, pending review | the run-time writer of `0x3f6500` (zero in the ELF's file image) |
| `CLIMB_OVER_FALL_READING` | the node the hand-off stands the feet under `+0xfac` by, over the pick: `Jump fall`'s (`seal_runningjump_in_air`) one `skel_root` key (`FUN_0057e050` D:L440726; `FUN_0059afd0` D:L456368-456371) | `10.59765625` (`Traversal.overHandOff`) | **proven** (l1222-climbover2: skel_root 10.5977 on the action-9 rows, the port's row within 0.0016), pending review; the disc's key a reading (`traversal.test.ts` pins it on the pack) | why the 0.75 blend is not in that row's node (the push against `FUN_00576860`'s step, D:L418454-418455; r0004's frame order, OT.R97) |

### 8.23 LATER 1250 -- the other climbs' and the mount's steer tilt, read at the source (2026-11-19; reading, pending review)

Written 2026-11-19 on `agent/later-1250` (over `a1664ed509`), before the build; (e) as built. Source inspection on this
note's pin; no disc reader run, no capture. **The answer first:** every climb kind gets the tilt -- the step-up, the
crate, the medium (and the crate/medium blend) and `Stand -> Hang` are recorded by the same push as the climb over, with
the contact's whole normal -- and the mount does **not**: its record stores a level vector, so its arc is a turn about
the vertical, which the port's `seatTarget` already lays. The other climbs also run once a game frame in the source; the
port keeps them on its 60 Hz tick (not built here, (d) 6; LATER 1253).

**(a) Which plays reach the tilt, and their `+0x7c`.**

- *The branch.* `FUN_0057a330` steers any play that holds a steer record (`+0x78` set) through `FUN_005b3340` when the
  play's flag 0x40 is clear -- every one-shot -- and through `FUN_005b2d20` when it is set (the looped motions)
  (D:L439017-439020). `FUN_005b3340` has no branch on the action before its turn: it takes `+0x7c` into the body's frame by
  the actor's conjugate rotation (D:L468840-468844), builds the arc from `+0x9c` onto it (D:L468892) and turns a copy of
  `refPt` by it (D:L468893), for every play that reaches it.
- *The climbs.* `FUN_005b2620` pushes class 1, 3 and 4 (the step-up, the crate, the medium or their blend, and `Stand ->
  Hang`, by the height, `FUN_00580b70`) and class 5 (`Climb over`, `FUN_00580a80`), then records the steer for all of them
  in one call, `FUN_005b1a10(actor, 0, target, ..., pfVar13 + 4)` (D:L468433-468504): `pfVar13 + 4` is the stored
  contact's normal (words 4-6 of the hit slot, section 8.21 (a)). `FUN_005b1a10` keeps the record only when the top play is
  one of `Stand -> Hang` (0x21, D:L467888), `Climb medium` (`DAT_003dec90`, its `refPt` y weighed with the crate's for the
  blend, D:L467914-467919), `Climb over` (`DAT_003deca0`), `Step up` (`DAT_003dec80`, `refPt` y + 1, D:L467905) or `Climb
  crate` (0x2a, D:L467899) -- the five kinds -- and stores the normal negated, **whole**, its y kept (D:L467927-467932),
  the target at `+0x8c` and `0x3f6500` at `+0x9c` (D:L467933-467934), for each the same way. So the crate, the medium, the
  hang and the step-up are tilted exactly as the climb over is (`CLIMB_STEER_TILT_READING`).
- *The mount.* `FUN_005463c0`'s record (D:L412258-412313) is written by its own lines, not by `FUN_005b1a10`: `+0x7c` is
  the vector at `0x3f6500` (the one `+0x9c` copies, D:L412269) through the gun's matrix (the turret's vfunc `+0xc`,
  D:L412268-412295), its y cleared (`auStack_30[0] & 0xffffffff` on a `ulong[2]`, D:L412296: the low word x kept, the high
  word y zeroed) and renormalised (`FUN_00309110`), stored at D:L412305 with `+0x9c` at D:L412307. There is no contact
  polygon: `+0x7c` is the gun's forward made level. A level `+0x7c` in a yaw-only body frame makes the arc a turn about the
  vertical by the gun's yaw less the body's, and the body matrix adds the body's back: `refPt` laid by the gun's yaw, which
  is `seatTarget`'s `R(facing)` (PB-2c) -- **no tilt for the mount**. Not changed; pinned (viewer `emplacement.test.ts`
  "LATER 1250"). The other writers of a one-shot record are outside this row: `FUN_005b1750` (its vector's y zeroed before
  `FUN_00309110` too, D:L467791-467798; callers D:L437934, D:L438032, D:L438449 through `actor+0xeac`, the campaign's
  restraint, which no multiplayer body sets) and `FUN_005b1890` (D:L467818-467853; callers D:L446651, D:L468255).
- *The vertical keep* (D:L468933-468941) zeroes the steer's vertical only under action 0x2c (`Stand -> Ladder`) or a
  reversed 0x2e (`Climb off ladder`): the five climb kinds and `Stand -> Turret` keep it (the mount's height is the floor's
  in the port, D:L413943-413946, as PB-2c reads).

**(b) The clock.** The advance and the steer run inside `FUN_0057a330` (the advance D:L438901, the steer D:L439020),
called once from the actor's driver each game frame (D:L418454, `FUN_00576860` after it at D:L418455) -- the same path for
every play, the climb over's included. So the step-up, the crate, the medium and the hang step once a game frame too,
with the press's own frame advancing (the driver's preview clears bit 8, section 8.19's review (1), D:L418293). The port
steps them on its 60 Hz tick with the first advance on the next command (`CLIMB_STEER_READING`).

**(c) Also read, not built** (named for the controller):

1. *The turn's lean.* `FUN_005b3340` spins the body by the angle between `+0x9c` and the body-frame `+0x7c` (acos of their
   dot, D:L468847-468862, over dt, clamped to 2 pi) times the length of their cross product (D:L468878-468886), its side
   the cross product's y (D:L468882). On a leaning face both include the lean: faced square to a face leaning by ny the
   cross is (ny, -nx, 0), so the body still turns by about ny^2 a frame (0.0032 rad on MP1's fence), its side flipping as
   nx crosses 0 -- a dither, where the port's `seatTurn` (flat) settles. Not built for any climb (the climb over neither);
   unmeasured.
2. *LATER 1244's x/z term with the body turned off the face.* The flat steer the port lays (the track and the target on
   the contact's level normal, `climbSteer`) is the arc onto that normal **made level**; LATER 1244's `overFrame` moves the
   x/z aim by the turned `refPt` less the **stored** one, which equals the turned less the level-turned only while the body
   faces the normal. Faced off it (the climb over's tests are head on), its x/z aim takes the body's yaw lag twice. This
   build lays the other climbs' term against the level-turned `refPt` ((d) 2). **Built 2026-11-19 (the fresh review's
   F1, (e)):** the climb over's term now takes the same level-turned `refPt`; *was:* owed.

**(d) The design** (simulation track):

1. `climbClip`'s steer record keeps, for every kind but the over, the contact polygon's first-triangle normal negated
   (`firstTriangleNormal`) and the stored `refPt` (x 0, y `REF_UP` -- the blend's weighed --, z `-REF_AHEAD`).
2. Each command after `climbSteer` (its weight k): the normal into the body's frame by the yaw before the command's turn;
   the stored `refPt` turned by `turnByArc` from `CLIMB_STEER_TILT_READING`, and turned again onto the normal made level.
3. Their difference's y is the vertical the turn leaves open on the drawn root (`v' = (1 - k) v + k dy`, beside the flat
   `lift`); its x and z, through the yaw, move the x/z offset still open, the feet by k of it.
4. The stored `refPt` loses the clip root's velocity x dt at the phase (`mountRootVelocity`'s law).
5. `Stand -> Hang`'s uncut end keeps the open vertical in the hang's root (`hangRoot`), so the hang draws the root the
   clip's end drew; the cut already takes it (`drawnRoot`).
6. The clock stays the 60 Hz tick. The game-frame clock for these climbs is LATER 1222's `advanceOver` in kind, but their
   vertical is still `ClipPath`'s line plus the drawn root's lift, not the carried law, so moving them to the game frame is
   the carried law's build for each kind, not a clock switch -- **owed, not half-built** (LATER 1253).
7. (The fresh review's F1.) The climb over's x/z term in `overFrame` subtracts the level-turned `refPt` as 2 does
   (`levelTurn`, one helper for both): `FUN_005b3340` makes one turn (D:L468840-468844, D:L468892-468893), and the
   flat steer already lays its level part.

**(e) As built** (`agent/later-1250`, `packages/viewer/src/traversal.ts`: `ClimbTilt`, `climbTilt`, `refUp`, the steer
record in `climbClip`, `drawnRoot`, the hang's end). Unit tests on synthetic faces (no disc data): viewer
`traversal.test.ts` "LATER 1250" climbs each kind head on at a box whose near face leans by MP1's fence slope (ny 0.05614)
and at its upright twin standing where the offer's ray meets the leaning face (one target, one plan, one press), and holds
the difference of the drawn root and the feet, every command, to the law computed in the test apart from the port
(Rodrigues' rotation; the phase, `sqrt(ease)` and the key-slope velocity written out) within 5e-7; the offset reaches over
0.1 on every kind; a crate turned 60 degrees off the face the same, in x and z through the yaw; the hang's reveal keeps the
open vertical. Central `roomClimb.test.ts` "LATER 1250": the crate on the room's mover and the page's, every command the
same, the room's feet off the upright twin's by the press's offset closed (NU-1c B10's reading) plus the tilt's law
within 5e-6. LATER 278 / 1223 / 1222 / 1244's tests green and unchanged. RED before the build: the twins agreed (the
drawn root 0.006-0.015 off the law at the first steered command, growing).

The fresh review's fold (2026-11-19, same branch): (F1, (d) 7) viewer `traversal.test.ts` "LATER 1250 F1": a climb
over on a class-5 fence 17.1652 tall leaning by ny 0.05614, pressed with the body 30 degrees off the face, against the
same run with the carry's stored normal cleared after the push's frame (the flat `refPt`; a degenerate polygon cannot
stand in, the hull's hit reading the same first triangle): each game frame's feet x, z and the carried y off it by the
law above on the game-frame clock within 5e-7; RED before: 0.40 in x at the first parted frame (the stored `refPt`
subtracted). Head on the level turn is the identity: l1222-climbover2's S1b, S3b and S2 feet and drawn node identical
to the digit before and after. No central twin for this case: the room runs the same `Traversal.overFrame` (PTW.R3),
and a turned press on the room's command script is the costlier harness. (F3) "LATER 1250 blend": h 20 (the crate's
weight 0.448, `climbClass`), the stored `refPt` x 0, y weighed w 1.48 + (1 - w) 9.98 (D:L467914-467919), z the crate's
-8.92, by the same law; the root's velocity the stored `refPt` loses is the play's root (`+0x2c`, D:L468947-468951),
taken from the port's two-node model (`blendShapes`) as the data the law runs on -- that model's root is not measured.
(F2) the describe's comment now names the upright twin this section's tests use.

**(f) Evidence, apart.** Source inspection (reading, pending review): every `D:L` above, re-read at the line for this
section. Unit tests (vitest, single files) on synthetic faces: the law transcribed, not measured. **No capture of the
original measures these climbs or the mount** (l278-climbover and l1222-climbover2 are the climb over only), so the build
is a reading, pending review. No browser run, no playtest, no dev-disc test.

**(g) The capture that would settle it** (a spec; not run). r0004 under PCSX2 with per-frame PINE reads, as
l1222-climbover2: (1) a crate climb (`Climb crate`, 5 < h <= 12 over the feet) on a leaning face -- an MP1
`alaska4d_fence01` face that offers the crate (first-triangle ny 0.05614), else the leaning climbable face nearest a crate's
height on MP1 -- head on and from about 45 degrees, two trials each; (2) a `Stand -> Hang` on a ledge 28-32 over the feet,
one trial; (3) a turret mount from behind and from a side (capture B 13's spots). Each frame from the press to two frames
after the clip: the feet (`actor+0x1c..+0x24`), the body matrix (`+0x28`, its rotation rows), the actor's `+0x2c..+0x34`
and `+0x2e0`; the play's `+0x1c` (phase), `+0x28` (flags), `+0x6c..+0x74` (`refPt`), `+0x7c..+0x84`, `+0x8c..+0x94`
(target), `+0x9c..+0xa4`, and `+0x0..+0x8` (the steer's velocity); skel_root's local translation (`*(actor+0x2e8)`); the
blend timer `+0x178` / `+0x17c`. Scored as section 8.20 (a): the steer one frame at a time from the capture's own state
(the tilt in y and z), `+0x7c` against the disc's first-triangle normal of the hit polygon (the climbs) and against the
gun's level forward (the mount: y 0), and `+0x9c`'s x read at last.

| name | stands for | value in the code | level (2026-11-19) | the evidence that settles the rest |
|---|---|---|---|---|
| `CLIMB_STEER_TILT_READING` (*widened; no new name*) | the arc's `+0x9c`, now for the step-up, the crate, the medium (and the blend) and `Stand -> Hang` too (`FUN_005b1a10` D:L467888-467934 for all five kinds; `FUN_005b3340` D:L468840-468844, D:L468892-468893); not the mount (its `+0x7c` level, D:L412296) | `[0, 0, -1]` (`Traversal.overFrame`, `Traversal.climbTilt`) | the climb over's as section 8.22; **the other climbs: reading, pending review** -- no capture | (g) |

### 8.24 R4P-243 -- r0004's three offer gates (2026-11-24; reading, pending review; capture IQ-179 queued)

ATLAS (atlas-maps) read these three as a non-author read of both exports (LEADS L367, L372, L373); the port took them
on 2026-11-24 (R4P-243, `agent/move2-offers`). None rests on a capture; IQ-179 is the capture that settles them. The
cites are the r0004 export's (`D4:L`) and the r0001 export's (`D:L`); the implementer re-read none of them at the source
(no decompilation on the host it ran on), so each stays reading, pending review, until a reviewer re-reads it.

- **L367: an unselectable item in hand.** r0004's CSealCtrl::SampleActionAvailable `FUN_00598d30`, in its air branch
  (D4:L493145-493148) and its ground branch (D4:L493164-493168): when GetCurItem (0x5cac50) answers an item and
  isSelectableItem (0x5c47e0, the twin of `FUN_005bdc30`, the port's `slotSelectable`) refuses its slot, it returns
  before CanClimbWall (0x5a3400) and CanClimbLadder (0x5a34e0). An empty hand passes. CanClimbWall covers CanTraverse
  kind 4, the automatic step-up, so the step-up is refused too. The r0001 twin `FUN_00593500` has no item test. Built as
  `climbOffered(w, handRefuses)`, the refusal beside `Walker.climbLock`'s and above the air's early return, through
  `Traversal.handRefusesClimb`, which the page's walk (from `./matchThrow`, the hand's slot and its selectability) and
  the room (`watchMoves`: `held`, the launcher's rounds, the hand item, the claymores down) set. Under
  `CLIMB_OFFER_GATE_READING` (no new name). Held by `offerGates.test.ts` (the hook), `matchThrow.test.ts` and match
  `roomEquipment.test.ts` (the wiring: the Detonator with no claymore down refuses, one claymore down offers).
  - **OPEN, two cases (capture Q-243a / IQ-179).** What GetCurItem (0x5cac50) answers is not read for (a) the firearm
    in hand and (b) a throwable slot thrown empty (`grenadeCore.ts` reads that after the last claymore "the game selects
    the empty slot"). Research 84 s6 item 2 reads 0x5cac50 -> 0x5cac10 -> 0x5cdd10 as the selected slot's own record for
    the fire-wait (the firearm's included), which suggests (a) answers the firearm's record -- selectable, so nothing is
    refused either way -- but GetCurItem's answer at `FUN_00598d30` is not read there. For (b) the empty slot's
    `EMPTY_ITEM` would be refused by `slotSelectable` if GetCurItem answered it. The port's choice, a reading: the
    firearm in hand refuses nothing, and a slot thrown empty is not in hand (the port puts the firearm up), so nothing
    is refused. No constant: the code does not branch on either.
  - **The launcher held: no wading term** (the review's F2). `FUN_005857e0` passes at any depth once the body's set is
    the launcher's (research 236 s3, D:L444340), so the port asks `slotSelectable` of a held launcher with depth 0, as
    `RocketLauncher.selectSlot` does; only its round decides. `Walker.climbLock`'s launcher-set refusal (D:L469470-469472)
    already refuses the climb while the launcher's set holds the body, so the round term reaches the case only past it.
- **L372: no ladder under `Place claymore`.** r0004's CanTraverse `FUN_005b9ff0` kind 2, after the one-SEAL-a-ladder
  test (D4:L510524-510554): `IsCurrentBlend(DAT_00409d18 = "Place claymore")` returns 0 (D4:L510555-510557). Only the
  ladder kind is refused. The r0001 twin `FUN_005b3ce0` (D:L469165-469197) has no blend test. Built in `offerLadder`:
  the walker's hold `seal_place_claymore` refuses; C4's `put_onwall` (the same 'place' family, `holdFamily`) does not.
  The PMN's placing and the bomb plant push the same blend and clip (`bombPage.ts` `PLANT_ANIM`: D:L475322, D:L475354,
  D:L475480-475481), so they are refused too. After the clip the ladder is offered again (`offerGates.test.ts`).
  Open: the pistol pair `Pistol place claymore` (0x409d20; `zoom.ts`'s pairing) -- the cite tests 0x409d18 alone, and
  the port plays the rifle clip for both, so a sidearm placing is refused as the rifle's; whether r0004 refuses it is
  unread. Open: whether CanFire(actor, 1, 0) (0x5adae0) already refuses the offer while placing. IQ-179 settles both.
  Under `CLIMB_OFFER_GATE_READING` (no new name).
- **L373: no step-up under `Jump launch` or `Jump fall`.** r0004's CanTraverse kind 4 (D4:L510624-510642): for
  5 < h <= 10 the front impact and the contact release run only when `FUN_0058d580` answers 0 -- the top blend neither
  `Jump launch` (8) nor `Jump fall` (9). A blend test, not an airborne one: refused in the launch or the fall airborne
  or not, not in the landing. The r0001 twin (D:L469263-469276) runs it unconditionally. Built as
  `AIR_STEP_UP_READING` `'not-in-jump-blend'` (was `'not-in-launch'`: the airborne launch only), the cause research 80
  section 7 called unread; it agrees with the proven jump-near-wall capture (ac, 2026-11-04: 8 -> 10 -> 2, no climb).

Held by `packages/viewer/test/offerGates.test.ts` (unit tests against the transcription); `weaponLine.test.ts`'s two
JUMP-AIR cases keep the capture's no-climb.

**IQ-179, the original measured (PC 3, r0004, 2026-11-24; HUD by screenshot, per-frame logs; record
`Q243-OFFERS-PC3`; seat-move2's scoring).** Each result is n=1-4 by sight, so the gates stay **reading, pending
review**, now with capture support; none is harness-scored.
- **L372, MATCH.** MP2 ladder `lad2/ladderdown` (foot (491.9, 100, 599)), the claymore placed at its foot: CLIMB was
  on before, OFF in every shot during the 83-frame place clip (act `+0x534` 15), and ON again 2 frames after the clip
  ended, the Detonator then in hand. The port withholds the ladder over the hold and offers it again after.
  CanFire's share is still unread; the capture cannot separate it from the blend test, and the port's behaviour is
  the same either way.
- **L367, the cases measured.** The claymore in hand (MP5, 4/4) and the Detonator in hand with a charge down (MP2):
  CLIMB offered, as selectable items should be. The emptied M79 on MP8: offered, and the climb RAN. That M79 is the
  Terrorist kit's PRIMARY (hand `+0x824` 0), for which GetCurItem answers 0, so the gate does not apply; the port's hand
  gate looks only at an equipment-slot launcher raised (`p.held`, `rocket.held()`) and at the Detonator, so it offers
  the climb too. A LOADED AT-4 raised (MP8, `+0xe04` 2) WITHHOLDS CLIMB; the crouched-rifle control is offered. The
  port withholds it through the climb lock's launcher set (`Walker.climbLock`, D:L469470-469472, LATER 504), not
  through this gate. So the gate's launcher branch is redundant while the launcher stays raised (the review's F2).
  The EMPTIED AT-4 withholds CLIMB too: it stays in hand (`+0xe04` 2; IQ-179 a'', record `Q243-OFFERS-PC3`), which the
  port matches through the same launcher set (`Walker.climbLock`).
- **The Detonator cannot be held with no charge down.** Setting off the last charge puts the claymore back in hand
  (`+0x824` 5 -> 2), and the selector stops listing the Detonator. The port does the same (`detonateCharges`,
  `FUN_005c8a20(0x99)`; `slotSelectable`). So the gate's "Detonator, no charge down" case is a guard that ordinary play
  does not reach. One path stays untested: the last charge set off by another player while the Detonator is held.
- **No new refusal observed.** On the evidence so far, L367 adds no refusal the original shows over the port's
  existing locks, and holds no wrong one (the primary M79, the claymore and the Detonator are all offered). Not run:
  an equipment launcher fired EMPTY (whether it stays raised or swaps away). Either way both games agree: the set's
  lock refuses it, or no item is in hand.
- **Aside, the ladder offer's hysteresis** (stick only, facing the ladder): CLIMB on at ~11-13 u from the foot point,
  off at ~19-22 u walking back. From the face that is ~16.6-18.6 on and ~24.8-27.8 off, against the port's keep of
  `CONTACT_KEEP` 24 from the hit (`contactHolds`). It is passed to the ladder offer's owner (seat-movement) as a
  candidate row. The 130 u latch seen on MP5 followed position writes only: a capture artefact.

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
- *LATER 278 (2026-11-18, section 8.13):* source inspection only -- D:L446477-446660 (`FUN_00589aa0`), D:L456328-456470
  (`FUN_0059afd0`), D:L413470-413625 and D:L413900-413950 (`FUN_005483d0`), D:L415080-415090, D:L438905-438912,
  D:L439144-439150, D:L416450-416458, D:L466800-466812; the port at `827f5441e8` (`traversal.ts`, `clipPath.ts`,
  `mover.ts`, `match/src/room.ts`, `match/src/bots/climbDrive.ts`, `viewer/test/traversal.test.ts`). The fixture
  heights in (d) are derived from research 86 section 1's table and the port's constants, not run. No unit test, no
  dev-disc test, no browser, no capture, no playtest; the owner's spot not shown yet.
- *LATER 1244 (2026-11-19, sections 8.21-8.22):* source inspection (D:L467924-467934, D:L468504, D:L468761-468951,
  D:L206003-206092, D:L456330-456466, D:L440715-440735, D:L436606-436640); the ELF's anim-type table (`0x661060`) read in a
  scratch; the disc's `seal_runningjump_in_air` and its `motion.rdr` row through the repository's readers in a scratch (not
  committed) and pinned by a fixture-tier unit test; l1222-climbover2 and l278-climbover's rows (proven captures) scored
  in scratch scripts (not committed); unit tests (vitest, single files: viewer `traversal.test.ts`, central
  `roomClimb.test.ts`). No dev-disc test, browser run, capture or playtest.
- *LATER 1222 (2026-11-18, section 8.17):* a capture of the original (section 8.15's l278-climbover rows, proven) analysed
  in a scratch outside the repository; the disc's `seal_climb_over` through the repository's readers in a scratch (not
  committed); source inspection of D:L468927-468930 only; model fits scored against the capture (a model). No unit test,
  no dev-disc test, no browser run, no playtest; no source or test changed.
