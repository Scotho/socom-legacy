# 326 -- The grenade preparation, throw and release animations, standing and crouched (NU-8, PARITY-2)

- Date: 2026-10-14 (20:26Z). The next-update checklist's row NU-8
  ([plan](../plans/2026-10-13-next-update-checklist.md), folded into
  [PARITY-2](../plans/2026-10-08-web-sprint-parity-2.md) by NU.R2; the checklist leads the lane by PTW.R9). **A read
  alone** ([brief](../plans/briefs/2026-10-14-nu8-throw-animations-read.md)): the build is a later brief, from section 6.
  Branch `agent/nu8-read` from `dd2e33be4`.
- Review: a fresh Fable review of `8d7d9d35a` returned **FAIL (high)** on F1 -- the rifle's lower comes under the throw
  clip, not after its pop -- with F2 (the pistol-hand throw is in neither gate's list), F3 (the prone rest branch) and
  F4 (the raise's `+0x258` gate) beside it. It confirmed R326.1, R326.3, R326.5, R326.6, R326.7 and the cut table at
  the source. F1-F4 are folded here (R326.2, §1.4, §1.6, §2.3, D1, B1, §7), each re-read at the source, the text
  they corrected kept beside ("was: ..."). The narrow re-review of `022fb829e` returned **PASS WITH FINDINGS
  (high)**: F1-F4 resolved at the source, frame order included; its N1 (the last-grenade bullet's order and its
  gate), N2 (B1's cold-rifle RED) and a missing "was" in B1 are folded here. The status is unchanged.
- Build (2026-10-14, [brief](../plans/briefs/2026-10-14-nu8a-rifle-through-a-throw.md), branch `agent/nu8a`): B1 and T1
  of section 6 built, each marked "Built" in its row with what it replaced kept; `THROW_RIFLE_RAISE_READING` and
  `THROW_LAST_GRENADE_RAISE_READING` in code, `ACTION_PLANT_RAISE_READING` and `REMOTE_HAND_RAISE_READING` named by
  the build (§7). Its values are reading, pending review. B2-B4 are NU-8b's; B5 waits on its read. The build's fresh
  review at `5b9fb4f65` returned PASS WITH FINDINGS (high): F1 (the pistol hand's peek tosses are outside the gates,
  built), F2 (a refused release's one-update rise, named `REFUSED_RELEASE_RAISE_READING`, not built) and F3 (what a
  copy misses, widened in `REMOTE_HAND_RAISE_READING`'s rows, its case (b) pinned on the own body) are folded, the text
  they corrected kept beside ("was: ...").
- THROW-INTERRUPT (2026-10-16, [brief](../plans/briefs/2026-10-16-throw-interrupt.md), branch `agent/throwint` from
  `999ab80a6`; the owner's playtest item, and his word "Match the original" on the read): §2.4 reads a knock, a flinch
  and a death before the hand opens and corrects §2.1's row (the text it corrected kept beside, "was: ..."); both halves
  built -- the page's cut and the room's drop, on the additive `throwStart` event and the `throw`'s `start` (protocol 11
  kept; the wire hunk cleared by the merge controller and the online seat, 2026-10-16); `KNOCKED_THROW_POWER_READING`
  and `DEATH_DROP_HAND_READING` in code, `DEATH_THROW_DROP_READING` resolved (§7). Reading, pending review. *Was (the
  first build): "the page's half built, the room's drop not (a wire hunk, §2.4) ... `DEATH_THROW_DROP_READING` *note
  only*".*
- Build (2026-10-16, [brief](../plans/briefs/2026-10-15-nu8b-throw-stance-placings-takeup.md), branch `agent/nu8b` from
  `c761f4e74`; NU-8b): B2, B3 and B4's own body built, each marked "Built" in its row with what it replaced kept;
  `THROW_LOW_STANCE_POP_READING` and `PISTOL_ONESHOT_PARTS_READING` moved in place (research 101), `TAKE_UP_FADE_READING`
  in code and `REMOTE_TAKE_UP_FADE_READING` named (*note only*; B4's remote half is not on the wire) (§7). The build
  re-read every cite it builds on at the source and found no contradiction; two findings past §1.1's text are folded
  there (the class-0 items take the same branch; the put-away -- corrected by its review, F2: only after a take-up from
  a launcher -- asks the same blend; the launcher raised asks none, F1). Reading, pending review.
- Status throughout: **reading, pending review.** Source inspection only: the decompilation and the game ELF's bytes
  were read, the committed goldens and tests were read, and the port's code was read. No game, emulator, reader, test or
  browser was run (no node process at all). Where the port's behaviour is stated it is read off its source, not run.
  Nothing here is proven, and nothing counts as a reading until a reviewer who did not write this note re-reads it at
  the source. A step marked *inference* is one interpretive step past the code.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (the file research 325's header hashes;
  not re-hashed here). The ELF `game/disc/socom2_game.elf` (read only, by its program headers, through a scratch
  script): the action-type names at 0x660778 `Throw grenade`, 0x660788 `Toss grenade`, 0x6617c0 `Crouch throw
  grenade`, 0x661780 `Prone throw grenade`, 0x661800 `Prone toss grenade`, 0x6615c0 `Peek right toss`, 0x6615e8 `Peek
  left toss`, 0x660ed0 `Pistol throw grenade`, 0x660ef0 `Pistol toss grenade`, 0x6617e0 `Pistol crouch throw grenade`,
  0x6617a0 `Pistol prone throw grenade`, 0x661820 `Pistol prone toss grenade`, 0x661760 `Return throw grenade`,
  0x661618 `Kick grenade`, 0x661628 `Place claymore`, 0x6608d8 `Put on wall`; the node names 0x65f8d8 `aimnodes` and
  0x65c4a8 `grenade`. The disc's data: the committed goldens only -- `packages/viewer/test/golden/motion-rdr.json`
  (`motion.rdr`: `playback`, `BlendTime`, `NoInterrupt`, `NoPitchtwist`, the callbacks) and
  `packages/scene/test/golden/throwClips.json` (the keys per clip). No reader was run. The desktop: none read
  (`desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3` is the pin, unused). The port's lines are this branch's base
  `dd2e33be4`.
- Evidence read first, not restated (cited, built on, not re-derived): research
  [251](251-the-effective-action-life-model.md) §4.1 (D07, the wind-up gives way to a shoulder press), §11 (PAR-29, a
  kit hold over a running one), §12.5 PAR-70 (the throws' pushes in the frame and their counts), §12.6 (PAR-76, a
  throw let go on the run), §12.7 (PAR-77, the sounds), §12.8 (PAR-86, no throw in the air), §12.9 (PAR-85, the legs
  under a running throw, B1-B5; PAR-95, the twist's ease); [85](85-grenades.md) §2, §3, §8, §8.1 (the power, the clip
  table, the model, the equipment's hand pass); [320](320-the-grenade-aim-reticle.md) §4 (D7, the power held through
  the clip); [324](324-the-equipped-weapon-on-others-bodies.md) §1.5, §4 (the take-up moves no node; a copy plays its
  own clips from the item field); [325](325-the-throw-sounds-and-callouts.md) §1.2, §1.4 (no pin, no hold sound; G1,
  the copy's throw clip); [230](230-gameplay-feel-parity-audit.md) §2 (the explosives' transition table), §5.2.10-
  §5.2.11 (PAR-84, `network_log`); [214](214-demolition-as-built.md) (the placings' push and `network_log`);
  [211](211-the-weapon-swap-by-state.md) (the rifle raise machine `FUN_005dfe30` / `FUN_005dfc80`, the envelope
  `+0x1160`); [101](101-the-rounds-open-gaps.md) (the readings' registry).

## The owner's item (NU.R1)

From the checklist's NU.R1 (the owner, 2026-10-13, verbatim): "Match the original grenade preparation, throwing, and
release animations. Standing and crouching."

The row (NU-8, verbatim): "**The grenade preparation, throw and release animations, standing and crouching.** The
original's clip sequence for a readied throwable (the pin, the hold, the release; the twelve throw clips, PAR-76's
read), standing and crouched, with their cut and blend rules, against the port's; room and page on the same command;
PAR-85/PAR-86 (the running throw's legs; a throw let go in the air) are this row's neighbours and land with it or before
it."

## 0. Answers

| # | finding | the port | section |
|---|---|---|---|
| R326.1 | **The original has no preparation clip, no pin clip and no hold clip: the sequence is one one-shot, pushed at the release request.** Taking a grenade up moves no node and pushes nothing (the selector's class-3 branch: a 0.3 s snapshot blend with no play change, `FUN_005a64c0` D:L461887-461920; research 324 §1.5); the wind-up writes the power and plays nothing (`FUN_00594cf0` D:L453509-453517; research 325 §1.2); the throw's one-shot is pushed by the kit's frame at the release (`FUN_005be9a0` D:L475490-475511 -> `FUN_005802b0` D:L441900; PAR-70). `Return throw grenade` and `Kick grenade` exist on the disc (`seal_returnthrow`, `seal_kickgrenade`) and have no player path: `Kick grenade` is `CAiSGrenade`'s (D:L423448), `Return throw grenade` is only registered and paired (D:L494776, D:L494870-494872) | the same shape: `GrenadeThrower` plays nothing until `startThrow`; the hand's model differs (R326.4) | §1 |
| R326.2 | **The rifle's raise is part of the sequence, and it is a lowering.** With a grenade up and the trigger idle the controller asks the rifle down at once (`FUN_00594cf0` D:L453568, D:L453598-453600: the hand's class 'y' skips the 5 s countdown); a press with one left sets the wind-up bit and asks no raise (D:L453633-453637); the release asks the rifle up (`FUN_005dfe30(body, 1)` D:L453520, gated on `+0x258` bit 0, D:L494258: the envelope in 0.1 s, D:L494259-494265) -- and **with a grenade left, the second update after the release asks it down again, under the clip**: the throw on top makes `FUN_0059d830` answer 0 (D:L457352-457362), which skips the wind-up block (D:L453478-453541) and runs the plain trigger branch, whose edge goes 2 -> 3 -> 0 (D:L453546-453556) and whose state 0 with the class 'y' lowers (D:L453598-453600). So the rifle rises about two frames and falls over its 0.5 s out, all under a `NoPitchtwist` top: nothing shows. The after-pop call (D:L453488) is then a no-op (`FUN_005dfe30` returns on the same state, D:L494244). **The slot's last grenade differs**: the firearm comes back at the launch (`FUN_005c4b10` D:L477135-477136), the class is no longer 'y', and the plain branch runs the firearm's countdown, reset to 5 s at the edge-3 update (D:L453603-453610) and asking up while it runs (D:L453572-453584) -- against the pop's one-frame lower (D:L453488) and the raise tick's re-request (`FUN_005dfc80` D:L494190-494201): not settled (`THROW_LAST_GRENADE_RAISE_READING`, §7). A placing's press raises it as the firearm's trigger does (D:L453633-453634: the class is not 'y') and the countdown holds it 5 s. *Was (8d7d9d35a): "the release asks the rifle up ... the update after the throw's pop asks it down (bit 7 set and no throw on top, `FUN_005a7d10` D:L453484 -> `FUN_005dfe30(body, 2)` D:L453488: out 0.5 s)" -- the review's F1: that branch is skipped under the throw.* | **the port's `WeaponRaise` never hears the grenade's or a placing's trigger** (`matchThrow.ts:482-486` takes it first; `play.ts:484` feeds the firearm's input alone): a hot rifle stays hot through a throw where the original's is down; the countdown's 5 s kept after a take-up; no raise at a placing's press (D1-D3) | §1.3, §1.6 |
| R326.3 | **The clip sequence is the clip alone, drawn as the stack's top, with the push's and the pop's snapshot blends**: standing `seal_throwgrenade` (28 keys, playback 1.6, `NoInterrupt` 0.49, `BlendTime` none = 0.4, the grunt at 0.45) or `seal_tossgrenade` (30, 1.6, 0.75, 0.4); crouched still `seal_crouch_throwgrenade` (19, 1.1, 0.8, **0.2**), crouched moving the standing throw; prone `seal_prone_throwgrenade` (27, 1.6, 0.9, 0.4) or `seal_prone_tossgrenade` (27, 1.1, 0.9, 0.4); the peek tosses (35 / 28 keys, 1.25 / 1.2, 0.9, 0.4); the pistol hand's `seal_p_throwgrenade` (1.6, 0.49, 0.4, the grunt) and `seal_p_tossgrenade` (2.0, 0.8, 0.4). Every one `NoPitchtwist`, none `BlendOverlay`, none looped (the golden) | PAR-85 B1-B5 and PAR-95 built the throws so; the crouched and prone pops were left `'beneath'` (R326.5) | §1.4, §2 |
| R326.4 | **What the hand shows before the launch is not settled.** The kit's fill makes no model instance for a throwable (research 324 §1.1, §1.5), and the take-up's hang (`FUN_005c6980` D:L479747-479752) hangs only an instance the kit's list holds, so on that read nothing is in the hand from the take-up to the launch, where `CZKit_TickExplosives` makes the projectile (research 85 §4). Not read whole here (`THROW_HAND_MODEL_READING`, §7) | the page hangs the grenade's model on the `grenade` node from the take-up (`grenade.ts` `refreshHandModel`, `placeHand` L2132-2165) | §1.1 |
| R326.5 | **The crouched and the prone pop keep the play beneath, as the standing one does.** After a throw's pop the crouched state's case (`FUN_00584c60`) re-weighs the crouch play when it is on the stack (D:L444151-444155: type 0x14 pushed only when not playing) and pushes a new one only where the ground state would (the fast stick's walk set, D:L444180-444184; a turn, D:L444199-444215); the prone case (`FUN_005845c0` D:L443900-443904 -> `FUN_00583500`) the same for the crawl (D:L443415-443430) and the prone turn (D:L443924). So `THROW_LOW_STANCE_POP_READING` reads `'kept'` in every stance | `'beneath'` crouched and prone (`animator.ts:483`): the play changes to the idle under the hold and the pop lands on it (D5). *Built 2026-10-16 (NU-8b B2):* `'kept'` in every stance | §2.3 |
| R326.6 | **The placings are the same stack push and the same sampler.** `Place claymore` and `Put on wall` go through `FUN_0057d540` -> `FUN_00588bc0` -> `FUN_0028dc90` (D:L446292), the stack's top drawn alone (PAR-85's read), the push's snapshot over their `BlendTime` (none: 0.4), the pop's over the uncovered play's, the pistol's versions' missing parts holding the pose drawn | the placings keep the fading layer (`throwPose.ts:222-226`, `PISTOL_ONESHOT_PARTS_READING.place` `'beneath'`), their uncut end on the pose's own clock (`throwPoseEnds`) (D6). *Built 2026-10-16 (NU-8b B3):* the stack's top, as the throws | §3 |
| R326.7 | **Another console plays the pushed clip only, from the Push Blend, and raises its copy's rifle from the state byte.** No wind-up, pin or hold clip exists on any console; the throw's push goes out as a Push Blend when the type's anim-set row is `network_log` (`Throw grenade`'s is, research 230 §5.2.11; the SOLDIER set marks the throws and the placings, research 214) and the copy pushes the clip itself (research 325 §1.4); the raise state rides SealObject byte 0x7e into `FUN_005dfe30` on the copy (research 193 §4.1, 199 §12.10) | the hold code on the body starts the clip on the others' bodies (`ThrowPose.follow`) and pops it when the hold leaves (PAR-85 B3); their `WeaponRaise` hears the replicated firearm trigger alone (D1 on the others too); no wire change needed: the hold's start and end are the release and the pop | §4 |
| R326.8 | **The room draws nothing and already agrees on the command**: the hold from the command's code (`moverSim.ts:197-198`), its cut and uncut end on PAR-70's counts, the throw on the `throw` event (`room.ts:4083-4109`) | no room change in this row | §5.1 |

## 1. The clip sequence for a readied throwable

The stances are `GetThrowAnim`'s states (`FUN_0057fce0` D:L441773: the body's `+0x174` -- 0 stand, 1 crouch, 2 prone,
3 peek; research 85 §3). The sequence below is the same in every stance; where a step differs by stance it says so.

### 1.1 The raise into the hand (the take-up)

- **No clip.** The selector from a firearm (class 1 or 2) to a throwable or a charge (class 3) takes the `bVar6` branch
  of `FUN_005a64c0`: it snapshots the stack's pose (`FUN_0028e3e0`, D:L461917) and sets the body's blend to 0.3 s
  (D:L461919-461920), with no push, no re-parent and the hand word `+0xf79` unchanged (D:L461887-461920; research 85
  §8.1 item 1, research 324 §1.5). The firearm stays in the hand. So the take-up is a 0.3 s eased hold of the pose on
  screen onto the live play -- nothing a still SEAL shows, a small check in a running stride.
- **The hand's model.** The take-up's kit side (`FUN_005c50b0` D:L478991-478994) sets the pending bit and calls
  `FUN_005c6980(kit, 3, "aimnodes")`, which takes the class-3 node slot (`kit+0x388 + 3 x 8`, the `grenade` node
  `FUN_00553290` makes under `rhand`, D:L419038; research 85 §8.1 item 2), takes the instance at the slot's index + 1 of
  the kit's instance list when there is one (D:L479747-479752), and hangs that instance under the body's `aimnodes` node
  (D:L479754-479759). Research 324 §1.1 and §1.5 read the kit's fill as making instances for the primaries, the pistols
  and the rocket launchers only (D:L455806, D:L480112), so on that read the slot's instance is null and nothing is hung.
  **What the player sees in the hand from the take-up to the launch is therefore not settled by this read**: the
  projectile object is made by the kit's timer at the launch (`FUN_005c1970` D:L476897-476902 -> D:L477023-477133;
  research 85 §4), 0.71 s into the standing throw. Named `THROW_HAND_MODEL_READING` (§7; settles: capture NU8-1).
- **The rifle's raise.** With a grenade up and the trigger idle (`ctrl+0x118` 0), the controller's plain-trigger branch
  reads the hand's class (`FUN_005c8040`, D:L453568; 'y' = a hand grenade, research 85 §9.2) and, for 'y', asks the
  rifle **down at once** (`lVar13 = 2`, D:L453598; `FUN_005dfe30(body, 2)`, D:L453600) instead of running the 5 s
  countdown it runs for the firearm (D:L453574-453594; research 211, `weaponRaise.ts`). So a hot rifle lowers over its
  0.5 s out envelope on the first idle update with the grenade up, and stays down.
- **Which items take that branch** (NU-8b's re-read, 2026-10-16). The kit hands the selector the new item's class
  (`FUN_005c1660` D:L476709-476734, from the controller tick `FUN_00551ec0` D:L418611 -> `FUN_005dfc80` -> D:L494228):
  1 or 2 for the firearms, 4 for a launcher, 3 for the class bytes 0x79 (a hand grenade) and 0x97 (C4), and 0 for every
  other item (the claymore 0x99, the PMN 0x9e, the Detonator: D:L476712, D:L476719-476720). The selector's `bVar6` is
  set for any new class outside 1, 2 and 4 (`bVar3`, D:L461869, D:L461889-461895), so the claymore, the PMN and the
  Detonator take the same 0.3 s snapshot as a grenade -- **from a firearm only**: with a launcher raised the hand word
  is 4 (`FUN_005a6d30` D:L462119) and the selector goes to `FUN_005a6b70` (D:L461870-461876), the launcher's own lower
  clip (`FUN_00588bc0`, D:L462043-462093), no snapshot (built: NU-8b's review, F1). **The put-away:** the block at
  D:L461896-461914 runs only when the hand word is not 1 or 2 (D:L461867); a take-up from a firearm leaves the word at
  1 or 2 (§1.1), so the ordinary put-away to the firearm takes the swap's branch (D:L461927-461929 for class 2,
  D:L461966-461968 for class 1), no snapshot; only after a take-up from a launcher (`FUN_005a6b70` writes the word 0
  or 3, D:L462086) does the put-away take the 0.3 s snapshot -- named, not built (`TAKE_UP_FADE_READING`, §7). *Was
  (2026-10-16, NU-8b's build; corrected by its review, F2): "And from a class-3 or class-0 item **back to the firearm
  already on the hand's mount** (the hand word set, D:L461896-461914) `bVar6` is set too: the put-away asks the same
  0.3 s snapshot".* Neither changes §1.1's read of the take-up.
- The port: `grenade.on('equip')` lets the firearm's trigger go (`matchThrow.ts:205`) -- an edge that restarts the
  rifle's 5 s countdown (`weaponRaise.ts`, item 3) -- and asks no cross-fade. **D2** (§5.2). *Built 2026-10-16 (NU-8b
  B4): the take-up of a throwable, the claymore or the PMN asks the cross-fade (§6 B4).*

### 1.2 The pin

None: no clip, no sound, no event. Research 325 §1.2 searched the ELF, the clips' callbacks and the archives for a pin
and found no path; nothing here adds one. The port plays none: agrees.

### 1.3 The hold (the wind-up)

- **No clip; the power alone.** The press with one left sets the wind-up bit `ctrl+0x170` 0x40 (D:L453637) and leaves
  the trigger state 0 (D:L453638-453657); it asks no raise (the raise's call at D:L453634 is skipped for 'y' with
  `FUN_005bdb00` non-zero, D:L453633). From then the controller's update chases the power toward the pressure at 3/s
  rising and 1.5/s falling (D:L453509-453517; research 85 §2) while `FUN_0059d830` answers (on the floor, no throw on
  top; research 251 §12.8). The body plays its ground state as before -- the SEAL walks, runs, turns, crouches under the
  wind-up with nothing on the stack (research 251 §4.1: the wind-up owns no body).
- **How long it can run**: for as long as the button is held above 0.15 of the power (D:L453509). There is no cap and
  no cook-off: the fuse starts at the launch (research 85 §6). The power saturates toward the pressure (0.95 at 1 s on a
  digital button, research 320 §4).
- **What ends it**: the release (§1.4); a shoulder press for another slot drops it with nothing spent (research 251
  §4.1, D07); a swap or a stance change goes through with the wind-up kept (nothing on the stack refuses them); a
  take-off holds it with its power frozen to the landing (research 251 §12.8); a knock or a death is the body's
  (research 230 §2.1): a death in the wind-up throws nothing (§2.4).
- The port: `GrenadeThrower.pull` -> `holding`, `update` chases (`stepThrowPower`), PAR-86's air rule, D07's select.
  Agrees; nothing differs in this step but the raise (§1.1).

### 1.4 The release: the clip

- **The request** (`FUN_005be9a0`'s hand-grenade branch, D:L475490-475511, in the kit's frame after the driver, PAR-70):
  `FUN_0059d830` (the floor and no throw on top), the stance clearance `FUN_005499e0`, the power at or past
  `abort_threshold` 0.15 (D:L475491-475497); a refusal zeroes the power (`FUN_00592d40`, D:L475498) and pushes nothing.
- **The push**: `FUN_005802b0` (D:L441882-441906) asks `GetThrowAnim` for the type, the release fraction and the hand
  point, pushes it through `FUN_00588bc0(actor, type, +0x174, 0, 0)` (D:L441900) and sets the kit's timer to
  `fraction x playback x (n - 1) / n` (D:L441904). `FUN_00588bc0` resolves the pistol's pair with the sidearm in the hand
  (`FUN_0058c820`, D:L446077; research 85 §8.1 item 3) and, the entry being no `BlendOverlay`, links it on the stack
  (`FUN_0028dc90`, D:L446292) over the covered play: the snapshot of the pose drawn, the blend set to the clip's
  `BlendTime` (D:L135215-135220), the initial skip set (D:L135209-135212), the covered play's clock stopped (research
  251 §12.6, §12.9).
- **The raise**: the same frame, before the driver, the controller's release branch asked the rifle up
  (`FUN_005dfe30(body, 1)`, D:L453520: gated on the body's `+0x258` bit 0 (D:L494258, the review's F4), the state 0x11,
  the envelope started in 0.1 s when none runs and the hand's record is not the Detonator's, D:L494259-494265), set
  the trigger edge to 2 (D:L453532-453533) and the release bit `+0x170` 0x80 (D:L453537). Under the throw it shows
  nothing: the top is `NoPitchtwist` (no twist, PAR-85 B5) and the Fire-version table pairs the ground play types only
  (`FUN_005e0690` D:L494790-494801: types 1, 2-6, 0x10, 0x12, 0x14, 0x15, 0x18, 0x1a), not a throw. **And it is lowered
  again two updates later, still under the clip** (§1.6, the review's F1). *Was: "It shows at the pop (§1.6)."*
- **The clips** (the golden `motion-rdr.json`; the keys `throwClips.json`; the release fractions and hand points
  research 85 §3; the release seconds and PAR-70's counts research 251 §12.5):

| stance (`+0x174`) | pick | type | clip | keys | playback | release at | `NoInterrupt` | `BlendTime` | callback | first cut (command) | uncut end |
|---|---|---|---|---:|---:|---:|---:|---:|---|---:|---:|
| 0 stand | power >= 0.6 or aim sine >= 0.3 | `Throw grenade` | `seal_throwgrenade` | 28 | 1.6 | 0.46 (0.710 s) | 0.49 | none (0.4) | `throw_whoosh@0.45` | 48th | 91st |
| 0 stand | the toss (power < 0.6 and aim sine < 0.3) | `Toss grenade` | `seal_tossgrenade` | 30 | 1.6 | 0.69 (1.067 s) | 0.75 | none (0.4) | none | 72nd | 91st |
| 1 crouch, still (speed^2 <= 225) | any | `Crouch throw grenade` | `seal_crouch_throwgrenade` | 19 | 1.1 | 0.70 (0.729 s) | 0.8 | **0.2** | none | 53rd | 61st |
| 1 crouch, moving | any | `Throw grenade` | `seal_throwgrenade` | 28 | 1.6 | 0.46 | 0.49 | none (0.4) | `throw_whoosh@0.45` | 48th | 91st |
| 2 prone | throw | `Prone throw grenade` | `seal_prone_throwgrenade` | 27 | 1.6 | 0.66 (1.017 s) | 0.9 | none (0.4) | none | 86th | 91st |
| 2 prone | toss | `Prone toss grenade` | `seal_prone_tossgrenade` | 27 | 1.1 | 0.56 (0.593 s) | 0.9 | none (0.4) | none | 60th | 63rd |
| 3 peek right | the lean clip playing | `Peek right toss` | `seal_toss_rlean` | 35 | 1.25 | 0.55 | 0.9 | none (0.4) | none | 68th | 72nd |
| 3 peek left | the lean clip playing | `Peek left toss` | `seal_toss_llean` | 28 | 1.2 | 0.87 | 0.9 | none (0.4) | none | 65th | 68th |
| pistol hand, stand | throw | `Pistol throw grenade` | `seal_p_throwgrenade` | 28 | 1.6 | 0.46 | 0.49 | none (0.4) | `throw_whoosh@0.45` | 48th | 91st |
| pistol hand, stand | toss | `Pistol toss grenade` | `seal_p_tossgrenade` | 30 | 2.0 | 0.69 (1.334 s) | 0.8 | none (0.4) | none | 95th | 114th |
| pistol hand, peek | the lean | `Pistol peek right/left toss` | `seal_p_toss_rlean` / `seal_p_toss_llean` | 35 / 28 | 1.25 / 1.2 | 0.55 / 0.87 | 0.9 | none (0.4) | none | as the rifle's | as the rifle's |
| pistol hand, crouch or prone | any | the rifle's type (the pistol pairs 0x6617e0, 0x6617a0, 0x661820 are registered, D:L494748-494752, and not in the Seal set: research 85 §8.1) | the rifle's clip | | | | | | | | |

  Every throw clip is `NoPitchtwist`; none is looped or `BlendOverlay`; none carries `NoFire` (research 251 §12.6).
  The counts are the port's 60 Hz commands from the one that lays the hold, the stick held past 0.1 (the cut) or at
  rest (the uncut end), on the lagged clock (PAR-70; the peek tosses' and the pistol toss's from the same table). The
  standing throw is the crouch-walk's too: `GetThrowAnim` reads the velocity in state 1 (D:L441827-441830), never in
  state 0 (research 251 §12.6).

- **The hand opens** at the kit's timer (0.71 s standing, 0.73 crouched, 1.02 prone, 1.07 the toss; research 85 §3):
  the launch from the posed hand with the power the release kept (research 256 §2, PAR-20 D11), the release sound
  (research 325 §1.2) and, for the slot's last one, the firearm back in the hand (`FUN_005c4b10`, D:L477135-477136).
  The clip plays on.

### 1.5 The follow-through

The clip after its release fraction is the follow-through: the arm's swing out, the body back to the clip's last key.
It is the same one-shot, so nothing changes hands; it holds its last key (phase `(n - 1) / n`) until the end test pops
it (PAR-69, PAR-70: `FUN_00582540` D:L418193, no end callback on a throw), or the stick cuts it past `NoInterrupt`
(§2.1). The grunt (`throw_whoosh` at 0.45, the standing throws alone) fires one frame before the hand opens (research
325 §1.2). Nothing in the follow-through reads the stick, the stance press or the kit: they wait (§2).

### 1.6 The return to the firearm

- **The pop** (the cut's or the end's; `FUN_005870e0` -> `FUN_00589aa0` -> `FUN_0028da00`): the stack snapshots the pose
  drawn if a blend runs (D:L135042-135043), sets the blend to the uncovered play's first node's `BlendTime`
  (D:L135100-135103: the running clips none = 0.4, `seal_stand` and `seal_crouch` 0.5, `seal_crouchwalk`, `seal_prone`,
  `seal_p_crouch` and `seal_p_prone` none = 0.4 -- the golden), keeps the uncovered play's phase with the initial skip
  (D:L135105-135108), writes the state word from the throw's `+0x2b` (`FUN_0058a6b0` D:L446820-446823) and runs the
  state's case (D:L445164-445171; §2.3). Research 251 §12.9 read the standing case; §2.3 here reads the crouched and
  the prone.
- **The rifle's lower comes under the clip, not after the pop** (the review's F1, re-read at the source). From the frame
  the throw is pushed, `FUN_0059d830` answers 0 -- the stack's top is one of its nine throw types (D:L457352-457362) --
  so the wind-up block of the controller's update (D:L453478-453541, the chase, the release and the after-pop lower
  alike) is skipped and the plain trigger branch (D:L453543-453665) runs every update; its only enclosing conditions
  are the control gates at D:L453106 and D:L453176. The trigger edge the release left at 2 (D:L453532-453533) goes to 3
  on the next update, the button being up (D:L453552-453556), and to 0 on the one after (D:L453546-453550); at the
  edge-3 update the countdown is reset to 5 s (D:L453603-453610). **With a grenade left in the slot** the hand's class
  is still 'y', so the state-0 branch asks the rifle down (`lVar13 = 2`, D:L453598-453600): on the second update after
  the release, about two frames into the 0.1 s rise, the envelope turns over and runs out over 0.5 s (D:L494250-494256)
  -- under a `NoPitchtwist` top, where nothing of it shows. After the pop the state is already 2, so the after-pop call
  (`FUN_005dfe30(body, 2)` D:L453488, reached when `FUN_005a7d10` answers 0, D:L453484) is a no-op (`FUN_005dfe30`
  returns on the same state, D:L494244); that update still clears the wind-up bits and zeroes the power (D:L453485-453489;
  NU-2 D7). **So after a throw with a grenade left, the body comes back onto the play beneath's plain version: the rifle
  is down and stays down**, the aim's twist easing back in with the pop's blend (PAR-95) only to the extent the raise
  weight is above 0 (none, after the first few frames).
  *Was (8d7d9d35a): "the controller's next update sees the release bit with no throw on top ... asks the rifle down
  (`FUN_005dfe30(body, 2)` D:L453488 ...). So from the frame after the pop the body is the play beneath's Fire version at
  the raise's weight (1 after the throw's 0.1 s rise), easing to its plain version over 0.5 s" -- wrong: that branch does
  not run while the throw is on top.*
- **The slot's last grenade differs -- from the launch on.** The second update after the release comes long before
  the launch (0.71 s standing, §1.4) while the class is still 'y', so the last grenade's throw gets the same lower
  under the clip (D:L453598-453600); the edge-3 update's countdown reset (D:L453603-453610) is class-independent and
  happens either way. The launch then returns the firearm (`FUN_005c4b10` D:L477135-477136), so from the launch
  update on the class is not 'y' and the plain branch is the firearm's own: with no aim held (`lVar13 == 2`,
  D:L453087-453091) the state-0 branch runs that countdown and asks the rifle **up** while it runs
  (D:L453572-453584, `lVar13 = 1`) -- still under the clip, to the pop. The pop's one-frame lower (D:L453488) is
  reached **if** `FUN_0059d830` answers non-zero after the pop, which needs `FUN_005a7de0(actor, 1, 1)` non-zero
  (D:L457365) and that function's remaining conditions (D:L462636-462707), not read here; if reached it stands
  against the raise tick's own re-request (`FUN_005dfc80` D:L494190-494201: a state 2 with weight above 0 is
  re-asked down, a state 1 under weight 1 re-asked up) and the next update's countdown ask: whether the rifle
  shows a dip, or stays up through the countdown, is **not settled here** (`THROW_LAST_GRENADE_RAISE_READING`, §7).
  *Was (022fb829e): "so from the next update the class is not 'y' ... runs the countdown reset at the edge-3 update
  and asks the rifle up ... The pop's one-frame lower (D:L453488, now reached with the rifle's state 1)" -- the
  re-review's N1: the R+2 lower comes before the launch, the reset is not the countdown, and the after-pop call
  depends on the gate.*
  *Was: "with the firearm back after the last one, the state 2 resets the countdown and asks down, D:L453586-453600"
  -- that read the aiming branch (`lVar13 != 2`) as the plain one.*
- **The pistol hand's throw rides a hole in both gates** (the review's F2). The pushed entry's `+0x2c` is the
  pair-resolved type with the pistol in the hand (`FUN_0058c960` D:L448224-448229 -> D:L446292, D:L135203), and
  neither `FUN_0059d830`'s list (D:L457352-457355) nor `FUN_005a7d10`'s (D:L462579-462582) holds `Pistol throw
  grenade` (`DAT_003debd0`), `Pistol crouch throw grenade` (`DAT_003debc0`) or `Pistol prone throw grenade`
  (`DAT_003debb0`), nor `Pistol peek right toss` (`DAT_003deb28`, D:L495212) or `Pistol peek left toss`
  (`DAT_003deb38`, D:L495214), paired with the rifle's peek tosses at D:L494720-494721 and pushed for the pistol hand
  under the rifle's lean codes (`scene/src/projectile.ts` `PISTOL_HAND_ANIMS`) -- the pistol's standing toss and prone
  toss are in both. *Was (NU-8a's review, F1): "the pistol tosses are in both" -- the peek tosses are not.* So a
  pistol-hand throw or peek toss is a "throw on top" to neither (the lower on the next update further needs
  `FUN_0059d830`'s other conditions to pass with the lean beneath -- `FUN_005a7de0(actor, 1, 1)`, D:L457365 and
  D:L462636-462707, and the floor tests, D:L457369-457371 -- named, not read):
  the wind-up block keeps running, its bit-7 branch finds "no throw on top" on the very next update and lowers the rifle
  at once (D:L453484-453489) -- the same end as the rifle hand's, a frame sooner -- and a second trigger press is not
  refused by `FUN_005a7de0` (research 251 §11.2's `HOLD_OVER_THROW_HAND_READING`, the second half of the same hole).
- **With the grenade still in the hand** (one or more left): the kit stays on the throwable (`FUN_005c4b10` only after
  the slot's last, D:L477135), the power 0, a new press starts a new wind-up (§1.3).
- The port: the pop's cross-fade and the twist's ease are PAR-85 B1 and PAR-95; the rifle is **D1** (§5.2): the port's
  `WeaponRaise` is untouched by a throw, so a rifle hot within its 5 s countdown stays hot through the clip and after
  it, where the original's is down; a cold one agrees by accident. *Was: "the port draws the play beneath's plain
  version at once, or its Fire version to the end of the firearm's own 5 s countdown when the trigger was down within
  it" -- the first half was the original's picture, not a difference.*

## 2. The cut and blend rules

### 2.1 What each input does to each clip of the sequence

The sequence has one clip, so one table covers every throw; the placings' differences are §3's. "Waits" means the press
is kept and taken at the pop; "refused" means dropped.

| input, during the clip | the original | cite | the port |
|---|---|---|---|
| the stick or the turn past 0.1 before `NoInterrupt` | nothing: the driver asks the cut only past the phase (`FUN_00587c20` D:L445547-445565) on the lagged clock; the stick is copied into the ramp's last value each tick (D:L438704-438706) so the run resumes unramped at the pop | research 251 §12.6 | the same (`holdCut`, PAR-70) |
| the stick or the turn past 0.1 at or past `NoInterrupt` | **the cut**: the pop that tick (`FUN_00550ef0` D:L418180-418190, the three axes against 0.1), the uncovered play at its kept phase under the pop's blend (0.4 run, 0.5 idle), re-weighed for the stick; the grenade already let go stays let go (the kit's timer is its own, `FUN_005c1970`) | research 251 §12.5-§12.6, §12.9 | the same command (PAR-70), the same blend (PAR-85 B1); crouched and prone **D5** |
| the stick at rest to the end | the uncut end on the lagged clock a frame past the last key (PAR-69's test), the pop's blend onto the idle (0.5) | research 251 §12.5 PAR-70 | the same (PAR-85 B3) |
| a crouch or prone press | **waits**: `FUN_00552ec0` refuses over a non-looped top (D:L418927-418930); `FUN_00552d60` asks again each frame (D:L418867-418908) and the change goes at the pop | research 251 §2 | the same (`retryStance`) |
| the jump | **refused** while the throw is on top (`FUN_0057e1b0`'s looped-top test, D:L440805-440810) | research 251 §12.6 | the same |
| a shoulder press, R2, a swap | **refused**: `FUN_005a8cb0`'s `FUN_005a7de0(actor, 1, 1)` (D:L463159) refuses over the nine throw types (D:L462620-462634); the pistol hand's throw types are not in that list | research 251 §11.1 | refused (`kitChangeGate`, `swapGate`); `HOLD_OVER_THROW_HAND_READING` stands |
| the trigger pressed again | **waits** (GRENADE-RETHROW, 2026-11-09; reading: GRENADE-RETHROW's third review PASS WITH FINDINGS, high, per the merge 6133a16fd): the *release request* is refused by the same gate from the kit's frame (`FUN_005c0ae0` -> `FUN_005a7de0`, D:L476442; the throw types D:L462620-462634), but the press is kept as the button's level -- the plain trigger branch runs under the clip (`FUN_0059d830` answering 0, D:L457352-457362) and sets the wind-up bit (D:L453543-453567, D:L453633-453637); at the pop the bit-0x80 branch clears it and remaps the edge (D:L453484-453500), so a button **still held** reads as a fresh press on the next update and the wind-up chases from 0 on the update after (`THROW_REARM_UPDATES_READING`, 2); a tap let go before the pop throws nothing; with the slot empty at the pop nothing re-arms (`FUN_005bdb00` -> `FUN_005bda70`, D:L474519-474538); no cooldown between two grenades of a slot (`FUN_005c5340` D:L479318-479343: `ReloadAfterShot`, which no throwable has); the kit's count `+0x818`, raised at the launch (D:L477023-477025), is zeroed by `FUN_005c0ae0` at edge 0 or 3 (D:L476380-476382, D:L476399-476400) on any kit frame `FUN_005c1970` passes (D:L476564-476569): a press after the hand opened leaves 0 (zeroed on the launch frame, the button up), last grenade or not; a press while pending leaves 0 as well, last grenade or not -- **measured** by capture GR-1 (§7.2; class 0x79, 3/3): with a grenade in the slot the re-arm's remap holds the edge at 0 through the pending window (D:L453633-453660), so the launch's own kit frame zeroes the count at the edge 0 (D:L476380-476382, D:L476566-476569; the mechanism a reading, GR-1's comparison reviewed PASS WITH FINDINGS, high, per the merge ccf3deed6) -- *was:* the edge 1 through the launch, 3 at the pop, and on the slot's last `LAST_GRENADE_PENDING_PRESS_PULLS_READING` 1 (retired 2026-11-09, GR-1); so a firearm taken in the re-armed wind-up fires under the held trigger (folds, reviews F1, F3) | research 251 §11.2; §2.1 note | the same (`GrenadeThrower.pull` keeps the level under `throwing`, `finishThrow` re-arms and `./matchThrow`'s `holdPulls` 0 for any press under a throw, pending or after the hand opened (GR-1 fold, 2026-11-09; *was:* 1 for a press while `throwPending`, settled at the pop), `release`, `cancelMenuHold`, a death, the turret's take and the `throwNow` hook drop it; `throwAgain.test.ts` "GRENADE-RETHROW"). *Was: "**refused** ... a second throw starts only after the pop | the same (`equip` and `pull` refuse while `throwing`)" -- half right: the request is refused, the press is not dropped; the port needed a let-go and a second press (the tester's report, 2026-11-09).* |
| the trigger's release | none: the release was the push; the button is a level the wind-up reads, not the clip | §1.3 | the same |
| a knock, a flinch's fall | **replaces** the top: the throw popped at once with its callback (`FUN_0028da00` D:L135092-135104; research 230 §2.1, D:L440992-440998 -> D:L446515), the grenade still leaving on the kit's timer, with the power `KNOCKED_THROW_POWER_READING` reads | research 251 §12.7, §12.8; §2.4 | the same (`Walker.knock` -> `endHold('knock')`; `followBody` keeps the launch; the power `'kept'`) |
| a death | the throw released and not yet out is **dropped at once, live, at power 0, and spent** (`FUN_00547af0` -> `FUN_005b8920`, D:L413023, D:L471751-471870); a charge under way cleared unspent (D:L471756-471759); a wind-up throws nothing (D:L457349) | §2.4 | the page cuts it (`GrenadeThrower.die`: nothing let go, spent or sent) and the room makes the drop (`Room.deathDrop`, from the page's `throwStart`; the hand `DEATH_DROP_HAND_READING`). *Was: "the room's drop is not built (`DEATH_THROW_DROP_READING`: the hand's item is not on the wire)".* |
| a take-off (a walk-off under the clip) | not reached by the SEAL's own motion: the throw's root has one key and the jump is refused; a fall's clip replaces it as a knock does | research 251 §12.8 | the same |
| a landing | none: no throw starts in the air (PAR-86) | research 251 §12.8 | the same |

*GRENADE-RETHROW (2026-11-09; reading: GRENADE-RETHROW's third review PASS WITH FINDINGS, high, per the merge 6133a16fd; scope `bugs-2026-11-09/SCOPE-grenade-second-throw.md`, §1):
the press under the clip, step by step -- the release (D:L453519-453538: bit 0x80, the edge forced to "pressed");
under the clip `FUN_0059d830` answers 0 and the plain branch reads the button each update (D:L453543-453567), a
pressed edge with class 'y' and a grenade left setting bit 0x40 (D:L453633-453637, which remaps the edge to 0 twice,
so a held button reads pressed again each update); the pop's update (`FUN_005a7d10` finding no throw, D:L453484)
clears 0x40 and 0x80 and the power (D:L453485-453489) and remaps the edge (D:L453490-453500); the next update's plain
branch sees the held button as a pressed edge and sets 0x40; the update after chases the power (D:L453505-453517).
A take-up is not this path: no bit 0x80, so a trigger held across a slot change starts no wind-up (research 211 §10).*
*GR-1 (2026-11-09, §7.2): the re-arm's two updates **proven** for the class-0x79 path (6/6 pops, ±0); a tap before or
after the hand opens throws nothing (6/6); the firearm taken in the re-armed wind-up fires under the held trigger from a
count of 0 (3/3). The table row's "a press while pending, held through the launch (edge 1)" does not occur: the edge
reads 0 until the slot is empty, and the launch's kit frame zeroes the count (measured 0 on the last grenade, 3/3).*

*Was (before THROW-INTERRUPT, 2026-10-16): one row, "a knock, a flinch's fall, a death | **replaces** the top ... the
grenade still leaving on the kit's timer ... | the same" -- a death is not a knock: its handler drops the pending throw
at once at power 0 (§2.4).*

### 2.2 How the upper body's clip layers over the legs

There is no mask and no node split in the original: **the stack draws its top alone** (`FUN_00577ea0` D:L437430-437455;
research 251 §12.9). A rifle-hand throw carries 26 parts, the six leg parts and `skel_root` among them, so the legs are
the clip's own -- a standing throw from the run stops the legs where the push's snapshot froze them and eases them into
the clip's over `BlendTime` (0.4), the run resuming at its kept phase under the pop's 0.4 (PAR-85, the weights table in
research 251 §12.9). The crouched throw's push eases over **0.2** (its `BlendTime`); its pop over the crouch play's
(`seal_crouch` 0.5, `seal_crouchwalk` 0.4). The pistol hand's `seal_p_throwgrenade` (16 parts) and `seal_p_tossgrenade`
(15) lack the root, the hips and every leg part, which hold the pose drawn at the push (PAR-85 B4,
`PISTOL_ONESHOT_PARTS_READING`). The second channel (the moving reload's overlay) is laid at 1 over the top
(D:L437456-437461), but no throw or placing uses it (research 251 §12.6). PAR-85 B1-B5 built this for the throws.

### 2.3 The pop crouched and prone (`THROW_LOW_STANCE_POP_READING`, read)

PAR-85 (research 251 §12.9) read the standing state's case after a throw's pop (`FUN_00586570`: the top Walk, Jog or
Run is re-weighed, nothing pushed, D:L444876-444889) and left the crouched and the prone cases named. Read here, under
the same pop (`FUN_005870e0` writes the state from the throw's `+0x2b` -- 1 for a crouched push, 2 for a prone one --
and runs the case, D:L445164-445171):

- **Crouched, `FUN_00584c60`** (D:L444037 on). For a local controller (`+0x34` answers 0, D:L444065) and a set
  that has the crouch types (D:L444070-444080; the pop-all at D:L444094-444106 is the branch that leaves the crouch
  when the set lacks them or the SEAL is falling more than 8.5, not the throw's), it reads the stick (`FUN_005858a0`,
  D:L444139) and asks the turn (`FUN_00586f00`, D:L444142):
  - no turn, the stick under the crouch-run threshold (D:L444145-444147: `|stick|^2 x 219.04 < 153.76`, or no headroom
    for the run, `FUN_0057efe0`): the crouch play 0x14 is pushed **only when it is not on the stack** (D:L444151-444155,
    after `FUN_0058a4d0(actor, 0)` pops to one play, D:L444153); otherwise the play on the stack -- the one the throw
    covered, at its kept phase -- is re-weighed for the stick (`FUN_005b56c0`, `FUN_00586c10`, `FUN_00582d10`,
    D:L444163-444169; research 201's crouch walk). **So the covered crouch play is drawn again where it stopped: `'kept'`.**
  - no turn, the stick fast with headroom: the crouch run is the standing walk set (types 2, 3, 4) in the crouch stance,
    pushed only when none of the three is on the stack (D:L444180-444184), else re-weighed (`FUN_00583030`, D:L444192).
    A throw from a crouch-run covered one of them: kept. A throw from a crouch-walk cut by a now-fast stick pushes the
    run set, as the ground state does without a throw.
  - a turn in place: the crouch turn 0x15 is pushed when not playing, the stack popped to two first (D:L444199-444215),
    as the ground state's turn step is.
- **Prone, `FUN_005845c0`** (D:L443839 on). For a local controller on the floor (D:L443860-443864; the stand-up is the
  drop's branch, D:L443870, not the throw's), the stick (D:L443897) and the turn (D:L443900):
  - no turn, the stick moving: `FUN_00583500` (D:L443904), which pushes the crawl 0x1b only when it is not on the stack
    (D:L443415-443430, the stack popped to two first) and otherwise re-weighs it: **`'kept'`**.
  - no turn, the stick at rest (under the threshold, D:L443934-443963; the review's F3): the stack popped to two and
    the prone idle 0x1a pushed only when it is not on the stack (D:L443948, D:L443963): kept when the throw covered it.
    *Was: not named.*
  - a turn: the prone turn 0x1c pushed when not playing, the stack popped to two (D:L443910-443924), as the ground
    state's prone turn is.

So in every stance the pop hands the covered play back at its kept phase and the stick's wanted play follows as the
ground state's would -- the standing read holds crouched and prone. `THROW_LOW_STANCE_POP_READING` moves from
`{ stand: 'kept', crouch: 'beneath', prone: 'beneath' }` to `'kept'` for all three (**D5**, B2). Not read here: the
remote controller's branch of both cases (`+0x34` answering 1 skips the set and floor tests, D:L444065, D:L443860), and
the crouch-run threshold's exact stick magnitude against the port's (`SEAL_TUNING`), which this row does not need.

### 2.4 A knock, a flinch or a death before the hand opens (THROW-INTERRUPT, 2026-10-16)

The owner's playtest on the nightly (verbatim, relayed by the merge controller): "during the last play test on nightly i
was knocked back and killed while throwing a grenade before or early in the throw animation before it left my hand, but
the grenade throw still occurred. please recreate and fix this, being knocked should cancel the animation up until the
grenade leaves the characters hand i believe". The read decides; it does not cancel, and the owner's word on it was
"Match the original". Status: **reading, pending review.** Source inspection of the decompilation (the lines cited) and
of the game ELF's bytes through a scratch reader (`DAT_00650988` 1, `DAT_00650948` 1, `DAT_006505a8` 10.0,
`DAT_006505b0` 12.0, `DAT_006505c8` 1); no game, capture or browser was run.

- **What "pending" is.** The release request arms the kit's timer `+0x87c` (`FUN_005802b0` D:L441904) and sets the
  kit's `+1` bit 0x02 (D:L475510); the timer counts down and the hand opens at 0 (`FUN_005c1970` D:L476883-476901), the
  launch at the controller's power `ctrl+0x11c` (D:L477024, D:L477108, D:L477111, `FUN_005c5340` D:L477133). Four
  places clear the bit and the timer, and only four: the refused request (D:L475503-475507), the timer's end
  (D:L476897-476901), the kit's initialiser `FUN_005c8190` (D:L480873-480877; its one caller the actor's constructor
  `FUN_00553ea0`, D:L419459), and `FUN_005b8920` (D:L471751-471755), whose one caller is the death `FUN_00547af0`
  (D:L413023; research 91 §3 reads it as the death).
- **A knock.** `FUN_0057e770` pops the stack (`FUN_0058a4d0` D:L440997, D:L441004), pushes the fall (`FUN_005807d0`
  D:L441047, D:L441050; prone `FUN_00588bc0` D:L441018) and calls `FUN_0057ee00`, `FUN_005a5da0` and `FUN_0059d750`
  (D:L440992-440998): none touches the kit's bit or its timer. **The throw is not cancelled**: the clip is cut, and the
  grenade leaves at the timer from the hand as the knock has posed it, at the controller's power then. Whether that power
  is still the release's is not settled: the controller's after-pop branch zeroes it (D:L453483-453489) on an update
  where `FUN_0059d830` answers before the timer runs out; it refuses while the knock has the SEAL in the air (`+0x105e`
  0x20, D:L457369; the knock's lift, D:L441064), and its refusals over the knock's own clip (`FUN_005a7de0`'s state and
  phase tests, D:L462620 on) are not read. `KNOCKED_THROW_POWER_READING` (§7), built `'kept'`: the port as it stood.
- **A flinch.** Nothing on the damage reaction's path is among the four clears: a throw under way goes on, as after a
  knock.
- **A death.** The handler's first call is `FUN_005b8920` on the kit (D:L413023), before the alive bit `+0xe1` 0x10 is
  cleared (`FUN_0029e8b0`, D:L413024 -> D:L144775). With a throw pending (D:L471751) it clears the bit and the timer
  (D:L471752-471755). A charge -- the record bytes 0x97-0x9a and 0x9e (C4 0x97, the claymore 0x99, the bomb 0x9a, the
  PMN 0x9e; §3) -- ends there, unspent (D:L471756-471759). A throwable is spent (`+0x818`, D:L471760; the slot's count,
  D:L471776) and **launched at once** (`FUN_005c5340`, D:L471867) by the timer's own launch with the power 0:
  `FUN_005976a0(0)` (D:L471842) and `FUN_00597630(0.05 max, max, 0)` (D:L471845), where the timer's launch passes the
  controller's power (D:L477108, D:L477111). The launch's guard `DAT_00650988` (D:L471803) is 1 in the ELF's data and
  written nowhere in the decompilation; the aimed correction's `DAT_006505c8` is 1 (research 85 §4 item 7). So the
  grenade is **dropped live from the hand at the tap's toss**: the pitch 10 degrees (`DAT_006505a8`) plus the aim's, the
  speed the hand's distance to the tap's range ahead -- research 85 §4's table, its "tap" row: about 7.7 units out,
  standing, at a level aim. Then, when the kit's `+0x828` is not negative, it calls `FUN_005c4b10` and sets `+0x828` to
  -1 (D:L471869-471874), as the timer's launch does (D:L477135-477140); what `+0x828` holds there is not read here.
  *Was: "The slot's last brings the firearm back (`FUN_005c4b10`, D:L471870), as the timer's launch does." -- the call is
  guarded by `+0x828 >= 0`, not by the slot emptying (the fresh review's F4).* *Inference:* the function's other branch (`+0x2c` false and `+0x30` true, D:L471816-471831) is the AI's aimed
  throw, not a copy's: another console hears the drop as the wire's throw.
- **A death in the wind-up** (no release yet): no pending bit, so `FUN_005b8920` launches nothing; once the alive bit
  is clear `FUN_0059d830` refuses (D:L457349), so a release is refused as a short tap (D:L475491-475498). Nothing is
  thrown.
- **After the hand opens**: the projectile is out and nothing is pending; a knock or a death leaves it flying.

**The port before this row** (`999ab80a6`). The page kept a throw not yet let go through a knock (`followBody`) and let
it go at the clip's release fraction with the release's power -- the original's, `KNOCKED_THROW_POWER_READING` aside. On
its own death (`net/client.ts`'s `kill` -> `WalkMode.setDead`) nothing reached the thrower: the throw left at the
release's power on the page, spent from its pouch, and its `throw` went to the room, which refuses a dead thrower's
(`room.ts` `throwGrenade`, 'not alive'). That is the owner's throw, drawn on his page alone (an inference from the
source; nothing was run). A wind-up held through the death threw the same way. The room's `kill` knows nothing of a
throw under way.

**Built (2026-10-16; reading, pending review).** The page: `GrenadeSource.dead` (`./matchThrow` hands it
`WalkMode.isDead`); `GrenadeThrower.die`, on the update after the death, cuts a throw or a placing not yet let go --
nothing let go, drawn, set down or spent, no `throw` sent, the power 0, the event `cut` on which `./matchThrow` stops
the clip -- and drops a wind-up; `pull` and `startThrow` take nothing while dead. The knock: `KNOCKED_THROW_POWER_READING`
in code (`'kept'`) and pinned. The room: its refusal of a dead thrower's `throw` pinned, and the drop below. Tests:
`packages/viewer/test/throwInterrupt.test.ts`, `matchThrow.test.ts` (THROW-INTERRUPT), `packages/central/test/roomThrowInterrupt.test.ts`.

**The room's drop, built (2026-10-16; reading, pending review).** The wire: the page's `throwStart { seq, kind }` at a
hand throwable's release request (`NetPage.throwStartEvent`, from `./matchThrow` on the thrower's `throwStart`; a placing
sends none) and the `throw`'s `start`, its seq echoed when the hand opens -- additive under protocol 11 (an older room
passes the event by at `Room.text`'s `default`; an older page sends neither). The room (`Room.takeThrowStart`, decided at
its command as a throw is): a living seat, a throwable its kit holds with the room's own count above 0, on the floor, not
mid-swap, past the playing clip's `NoFire` (the frame's `fire`), not in the binoculars, no launcher up, under NET-CAP's
cap, no sooner than `THROW_REPEAT_S` after the last taken; one a seat, a new one replacing the old; cleared by the
`throw` echoing its seq (or any throwable's from an older page), any refusal (a stale one told to no page), a weapon
change, a launcher's raise or lower, a respawn, and `THROW_START_WINDOW_S` -- the longest release of `GetThrowAnim`'s
table and the pistol hand's pairs (the pistol's toss, 1.334 s; `FUN_005802b0` D:L441904) -- on the command clock with
the arrival jitter. Its `kill` runs `deathDrop` first, as the death runs `FUN_005b8920` before the alive bit: the
throwable spent from the room's count and launched at power 0 (`throwVelocity(0, ..)`) at the death frame's aim from
`GetThrowAnim`'s table point for its stance (`DEATH_DROP_HAND_READING`, §7: the room poses no hand), told to every page,
its thrower's included (the page's `grenade` case flies it and sounds its release). *Was (the first build, before the
wire was cleared): "**Not built: the room's drop** ... Until then a death before the hand opens throws nothing anywhere,
where the original drops a live grenade at the feet." -- the reasoning that follows is kept as the hunk's record.*

**The fresh review's F1 (2026-10-16, folded; a server adaptation, no original behaviour changed):** a modified page could
arm a drop the original never makes -- a second grenade after the real throw (a `throw` naming another `start`), or a
request re-sent every `THROW_REPEAT_S` with no throw at all. Folded: any throwable `throw` the room takes ends the
request whatever its `start` (the `start` match stays for a refused one); a request is refused for its rate within
`THROW_TAIL_S` of the last hand opened -- the shortest tail of `GetThrowAnim`'s table, `throwClipSeconds` less
`releaseSeconds` (the release fractions `FUN_0057fce0` D:L441783-441856, the standing throw's 0.46 at D:L441839 and
D:L441856; the kit's timer `fraction x playback x (n - 1) / n`, `FUN_005802b0` D:L441904; the clip's whole play
`playback x ((n - 1) / n)^2`, keys 0 to n - 1, `FUN_0028c4f0`; each clip's `playback` from `motion.rdr` and its key count
from `MOTION_P.ZAR`, through `THROW_ANIMS`): the left lean's toss, 1.2 x 27/28 x (27/28 - 0.87) = 0.109 s (the next, the
crouched throw, 0.258 s), its inputs a reading and the bound a server adaptation, pinned in `roomThrowInterrupt.test.ts`
(*was, the narrow re-review's fold: "(1 - 0.87) x 1.2 x 27/28 = 0.150 s", the clip's length taken as `playback x (n - 1)
/ n` -- not the formula the code takes, the narrow check's 1*); `THROW_REPEAT_S`'s first
term, not `THROW_REPEAT_S` whole, whose second term (the next clip's release) comes after its request, so an honest quick
re-throw would be refused (the review asked `THROW_REPEAT_S`; the nearer bound is taken and said); `deathDrop` drops only
if a throw's clip was laid (its hold's start, `Walker.holdStarts`) on a command at or after the request's, not at the
death itself -- a knock popping it after the request keeps the drop, the owner's own case; and the seat's own round taken
ends its request (another seat's never does, the online seat's pin). *Was (before the narrow re-review's F1): "within
`THROW_TAIL_S` of the last hand opened -- the shortest tail of `GetThrowAnim`'s table, `THROW_REPEAT_S`'s first term"*,
with no cite, value or level.

**The narrow re-review's F2 and F3 (2026-10-16, folded; a server adaptation):** the clip must be laid within the command
after the request and the arrival jitter (`s.seq + 1 + FIRE_ARRIVAL_JITTER_TICKS`), the request and its clip one throw as
the original's one frame (a clip laid long after a request armed nothing); and a request decided before its next
command has run -- a death between the two -- counts any queued command's throw hold code in the window, so the honest
drop is not lost to a one-command gap. The narrow check's 2 (folded): a clip laid on a command dropped with a backlog
(`dropBacklog` lays each by `MoverSim.prepare`) is noted on its own command, not the kept one's, so a backlog dropped
under a throw keeps the honest drop.
A gap left open (the final narrow check's 1, low; not built): right after `dropBacklog` the room's last seq is a dropped
command, which has no aim frame (`ShotCone.frame` matches an exact command only, `room.ts` `deathDrop`), so a thrower
killed inside that one step -- a backlog dropped, a request pending, its clip on a dropped command, the death before the
kept command runs -- gets no drop where the original drops. The candidate fix: fall back to the cone's newest frame when
the exact one is missing. Needs a backlog drop, a pending throw and a death to coincide in one tick.

The hunk's record (written before it was cleared). The room cannot make it without a wire change. It knows a
throw is under way from the command's hold code (`holdBits`: the clip alone) and could time its release from the clip's
fraction, but it does not know which throwable is in the hand: no command or event carries it (`Player.held` is the
launcher's alone; §6 B1's `REMOTE_HAND_RAISE_READING` found the same). The hunk, the online seat's first: the page names
the throwable at its release request (a client event at `throwStart` carrying the seq and the kind: `net/protocol.ts`,
`netPage.ts`, `matchThrow.ts`), the room keeps it as the thrower's pending throw until its `throw` or its release
fraction, and its `kill` launches the power-0 drop (`launchOf` at power 0 from the room's frame and the table's hand
point -- the room poses no hand) and broadcasts it to every page, its thrower's included (`throwGrenade` tells the
thrower nothing). Until then a death before the hand opens throws nothing anywhere, where the original drops a live
grenade at the feet.

## 3. The throwables apart

| item | the sequence | the clip | the pistol hand | `NoInterrupt` / `BlendTime` | cite |
|---|---|---|---|---|---|
| M67, HE, AN-M8, Mark141 (class 0x79, 'y') | §1 whole: no take-up clip, the wind-up, the throw at the release, the raise at the release and the lower after the pop | `GetThrowAnim`'s table (§1.4) | `seal_p_throwgrenade`, `seal_p_tossgrenade`, the pistol peek tosses; the rifle's clip crouched and prone | the table's | research 85 §3, §8.1; §1 |
| red smoke, blue chem light | the same class: the same sequence | the same | the same | the same | research 320 §5 (in no multiplayer kit) |
| "thermite" | no such item (research 325 §1.1) | -- | -- | -- | -- |
| Claymore (0x99), PMN (0x9e) | the trigger's press is the placing (no wind-up: the power is never chased, research 320 §5); the press asks the rifle **up** as the firearm's trigger does (D:L453633-453634: the class is not 'y') and the 5 s countdown holds it; `Place claymore` pushed by the kit's frame (`FUN_0057d540(actor, DAT_003deb48, 0)`, D:L475322, D:L475354; PAR-70: after the driver) through the same `FUN_00588bc0` -> `FUN_0028dc90` (D:L446292): the stack's top, the push's snapshot over `BlendTime` none (0.4), the kit's timer 1.3 s to the set-down, the pop's blend as a throw's; the Detonator comes up after (research 85 §9.7) | `seal_place_claymore` (55 keys, 2.7) | `seal_p_place_claymore` (the same numbers) | 0.9 / none (0.4) | research 214; research 251 §11.1, §12.5 PAR-70, PAR-74 |
| C4 (0x97) | never taken up from its slot; the Action button's plant (`FUN_00592d50` -> `FUN_005c0020(.., 0x97)`, before the driver), `Put on wall` (0x3e; `NoInterrupt ()` bare: never cut) with its 0.45 callback; its press is the Action button's, not the trigger's, so no raise is asked by it (the trigger branch is not on its path; *inference*: the Action handler D:L452030-452055 calls no `FUN_005dfe30`, not searched whole here) | `seal_put_onwall` (42, 2.5) | `seal_p_put_onwall` | 1 / none (0.4) | research 85 §8.1 item 4; research 251 §12.5 PAR-70, PAR-75 |
| the bomb (0x9a) | `Place claymore` by its own plant and drop (PAR-74) | `seal_place_claymore` | `seal_p_place_claymore` | as the claymore's | research 214, 251 §12.5 PAR-74 |
| Detonator (0xbe, class 0) | no clip (`CZKit_DetonateRemoteExplosives`; research 251 §12.5 PAR-70); its trigger press reaches `FUN_005dfe30(body, 1)` (the class is not 'y'), where the envelope is refused for the Detonator's record (`+0x7c == 0xbe`, D:L494261-494263) -- what the state 0x11 with no envelope draws is not read (`DETONATOR_RAISE_READING`, §7) | none | none | -- | §7 |
| `Return throw grenade`, `Kick grenade` | no player path: `Kick grenade` (`DAT_003deb40`) is pushed by `CAiSGrenade`'s state (`FUN_0055ac20` D:L423448; research 325 §2.2 names the class); `Return throw grenade` (`DAT_003deba0`) is only registered (D:L495227), paired (D:L494776) and looked up by the set (D:L494870-494872), with no push found (a search of its two data references) | `seal_returnthrow` (1.6, `NoInterrupt` 1, `BlendTime` 0.2), `seal_kickgrenade` (0.82, 1, 0.2) | -- | -- | research 85 §8.1 |

The placings are the same stack push and the same sampler as the throws (R326.6). PAR-85 built the top-of-stack draw
for the throws only and left the placings on the fading layer; **D6** (§5.2) carries them over.

## 4. Another console

- **The clips.** A copy has no wind-up, pin or hold clip to play, since none exists (§1.1-§1.3). The throw's push, for a
  local actor on a network game, goes out as a Push Blend of the type and its state word when the type's anim-set row is
  `network_log` (`FUN_00588bc0` D:L446408-446416 -> `FUN_002bbaf0` D:L160789-160796); `Throw grenade`'s row is read as
  carrying it (research 230 §5.2.11's control, over the tracked `READERC.ZAR`), and research 214 reads the SOLDIER set as
  marking the throws, `Place claymore` and `Put on wall`. The receiver replays it as `FUN_00588bc0` on the copy
  (`FUN_002bba80` D:L160762-160766 -> `FUN_005880e0` case 0, D:L445755-445756), which resolves the pistol pair through
  the copy's own hand (research 230 §5.2.11), pushes the same one-shot on the copy's stack -- the same snapshot blend,
  the same top-alone draw, the same callback driver (research 325 §1.4) -- so the copy's picture is the thrower's, a
  message late. Which of `Toss grenade`, `Crouch throw grenade`, the prone and peek types' rows carry `network_log` is
  in no golden (`THROW_ROWS_NETWORK_LOG_READING`, §7; the build's dev-disc assertion settles it as PAR-84's did).
- **The pop on the copy**: the copy's driver runs the same end test; whether its cut reads the replicated stick, or a
  second Push Blend carries the owner's pop, is not read (`REMOTE_THROW_POP_READING`, §7). The port pops the others'
  throw when the hold leaves the body (PAR-85 B3), which is the thrower's own pop a snapshot late.
- **The rifle's raise on the copy** rides SealObject byte 0x7e (`body+0xf74 & 0xef`, `FUN_005e0010`) into
  `FUN_005dfe30(copy, b)` (D:L162310-162311; research 193 §4.1, 199 §12.10) at the policy's interval (>= 100 / 200 ms,
  research 193 §2.3): the copy's rifle rises at the thrower's release and lowers after his pop, as the owner's does.
- **What starts each part on a copy**: the take-up, the item field (`+0x66`, research 324 §3: the selector's 0.3 s
  blend on the copy, no clip); the wind-up, nothing; the throw clip, the Push Blend; the launch and its sound, the wire's
  throw (research 325 §1.4); the raise and the lower, byte 0x7e; the pop, not read.
- The port: the hold code in `BodyState.flags` starts the clip (`ThrowPose.follow`, the pistol's version with the
  sidearm in that hand) and pops it when the hold changes or leaves; the others' `Play` has its own `WeaponRaise` fed by
  the replicated firearm trigger and aim (`remotePlayers.ts:83`), which a throw never touches: **D1 on the others too**,
  with no wire change needed (the hold's start is the release, its end the pop).

## 5. The port against the read

The port's tree is `dd2e33be4`. Rows marked "--" agree. PAR-85 (B1-B5), PAR-86 and PAR-95 are built and not re-read:
their rows say so.

### 5.1 The room

| # | the original | the room | difference |
|---|---|---|---|
| -- | the throw's push at the release request, the stack's one-shot holding the body (§1.4) | the hold from the command's code (`moverSim.ts:197-198` -> `Walker.hold`), on the command the page lays it (`walk.ts`, `holdBits`) | none |
| -- | the cut past `NoInterrupt` on the lagged clock, the three axes; the uncut end a frame past the last key (§2.1) | `holdCut` / `runHold` on PAR-70's counts (`mover.ts:2085-2106`) | none |
| -- | the stance press waits, the jump refused, a kit change refused, a knock replaces (§2.1) | `retryStance`, the jump's gate, `holdOverHold`, `knock` (research 251 §11, PAR-19) | none |
| -- | no throw in the air (PAR-86) | `Walker.hold` refuses in the air; the room's hold code on a fall holds nothing | none |
| -- | the launch at the kit's timer | `throwGrenade` on the `throw` event (`room.ts:4083-4109`): the rate, the cap, the hand's reach, the launch | none |
| -- | the raise state (§1.6) | the room draws nothing; the wire carries the hold's start and end, which are the release and the pop | none: the page's `WeaponRaise` can read its own hold (D1) |

### 5.2 The page

| # | the original | the page | difference |
|---|---|---|---|
| -- | the take-up pushes nothing, the firearm stays in the hand (§1.1) | `equip` plays nothing; `stowRifle` stows only for a launcher | none |
| D4 | the take-up hangs an instance only when the kit's list holds one; the fill makes none for a throwable on research 324's read (§1.1) | the grenade's model on the `grenade` node from the take-up to the release (`grenade.ts` `refreshHandModel`, `placeHand` L2132-2165) | **the hand may show a grenade the original does not** -- not settled (`THROW_HAND_MODEL_READING`) |
| D7 | the take-up's 0.3 s snapshot blend of the pose drawn (D:L461917-461920) | no cross-fade on `equip` | **a running take-up's small check is missing** (low; invisible at rest). *Built 2026-10-16 (NU-8b B4) for the own body; the others' named (`REMOTE_TAKE_UP_FADE_READING`)* |
| D2 | with a grenade up and the trigger idle the rifle is asked down at once (D:L453598-453600) | `equip` lets the firearm's trigger go (`matchThrow.ts:205`): an edge, so `WeaponRaise` keeps the rifle hot to the end of its 5 s countdown | **a hot rifle stays up to 5 s after a grenade is taken up; the original lowers it over 0.5 s at once** |
| -- | the wind-up plays nothing; the power chases (§1.3) | `holding`, `stepThrowPower`, D07, PAR-86 | none |
| -- | the pin: nothing (§1.2) | nothing | none |
| -- | the clip at the release, `GetThrowAnim`'s pick, the pistol's pair, the hold (§1.4) | `startThrow` -> `throwStart` -> `walk.hold` + `ThrowPose.start` (`matchThrow.ts:218`) | none |
| D1 | the release asks the rifle up (D:L453520) and, with a grenade left, the second update after it asks it down under the clip (D:L453598-453600): the rifle is down through the throw and after it (§1.6); the slot's last grenade brings the firearm back under its countdown, the interplay unsettled (`THROW_LAST_GRENADE_RAISE_READING`) | `WeaponRaise` hears the firearm's trigger alone (`play.ts:484`; `matchThrow.ts:482-486` takes a throwable's trigger first): a rifle hot within its 5 s countdown stays hot through the clip and after it (research 251 §12.9 item 6's case) | **a hot rifle stays up through and after a throw where the original's is down**; the own body and the others' (§4). *Was: "after the throw the body is the play beneath's Fire version easing to its plain one over 0.5 s ... no 0.5 s eased lower from the ready pose" -- the review's F1.* |
| D3 | a placing's press raises the rifle as the firearm's trigger does (D:L453633-453634) and the countdown holds it 5 s (§3) | the trigger goes to `grenade.pull()`: no raise | **the rifle stays plain through and after a claymore's or a PMN's placing** |
| -- | the clip is the stack's top, the push's and the pop's snapshot blends, the pistol's missing parts, no twist (§2.2) | PAR-85 B1, B4, B5; PAR-95 | none (built) |
| -- | the cut on the lagged clock, the end a frame past the last key (§2.1) | PAR-70, PAR-85 B3 | none (built) |
| D5 | the crouched and prone pop hands the covered play back at its kept phase (§2.3) | `THROW_LOW_STANCE_POP_READING` `{ crouch: 'beneath', prone: 'beneath' }` (`animator.ts:483`): under a crouched or prone throw's hold the play changes to the idle beneath (`idle:*`, the turn step) and the pop lands on it | **a crouch-walk throw (standing clip, crouched state) and a crouched or prone throw come back onto the idle, not the stride where it stopped**. *Built 2026-10-16 (NU-8b B2)* |
| D6 | the placings are the same push and sampler: the top drawn alone, the push's snapshot over 0.4, the pop's over the play beneath's; the pistol's missing parts holding the pose drawn; the pop at the driver's end test (the claymore's lagged 158th, C4's 142nd, the bomb's 156th: PAR-74, PAR-75) (§3) | the placings keep the fading layer (`throwPose.ts:222-226`: linear in over `BlendTime`, out over 0.4 from the last key or a cut), `PISTOL_ONESHOT_PARTS_READING.place` `'beneath'`, and a placing's `complete` end is left to the pose's own clock (`throwPoseEnds`, `matchThrow.ts:85-89`) | **a placing's blends and its pistol legs are PAR-76's model, not PAR-85's; its uncut end runs on the pose's clock, not the hold's**. *Built 2026-10-16 (NU-8b B3)* |
| -- | no throw in the air (PAR-86) | PAR-86 | none (built) |
| -- | the others' clip from the push; popped on the copy (§4) | `ThrowPose.follow`, PAR-85 B3 | none for the clip; D1 for the raise |

## 6. The build list

Each row is RED first, on the simulation track. The room changes in none (§5.1: it draws nothing and already agrees on
the command), so "room and page on the same command" is the page alone, on the command the hold already rides; the
others' bodies take each change through the same classes. No wire change.

- **B1 -- the rifle through a throw and a placing (D1, D2, D3; page, own body and the others').** `WeaponRaise`
  (or its input in `play.ts` `weaponInput`) hears three more things, by the read (rewritten at the review's F1; *was*: a
  raise at the hold's start and a lower at its end):
  - a throwable up with the trigger idle asks the rifle down at once (D:L453598-453600), skipping the countdown;
  - a throw's release -- the hold's start of a throw family clip (`PlaySnapshot.hold`, `holdFamily` `'throw'`) -- asks
    the rifle up (D:L453520; the envelope in 0.1 s) and, **with a grenade left, down again two updates later**
    (D:L453598-453600; the envelope out 0.5 s from its weight), both under the clip, the power zeroed at the pop (NU-2
    D7). The slot's last grenade: the firearm back at the launch under the firearm's own countdown, as read (§1.6); the
    pop's lower against it is `THROW_LAST_GRENADE_RAISE_READING`'s and is **not pinned** until read -- the build takes
    the countdown (the firearm's rule as the port has it) and names it;
  - a placing's trigger press asks the rifle up as the firearm's does and resets the countdown (D:L453633-453634),
    which then holds it 5 s. C4's Action-button plant asks nothing (§3, *inference* until read).
  - The others' bodies: the same from the replicated hold (the start) and the replicated item; nothing new on the
    wire. *Was (8d7d9d35a): "the replicated hold (the start and the end)" -- the end asks nothing since F1.*
  - *RED, pinning the original's behaviour:* `weaponRaise.test.ts` / `play` cases: a hot rifle, a grenade taken up ->
    the weight falls over 0.5 s from the next frame (today: holds 5 s); a hot rifle, a throw's hold starts with a
    grenade left -> the weight is falling from the third frame and **0 at the pop** (today: 1, held by the countdown);
    a cold rifle, the same -> the envelope rises for two updates of its 0.1 s (a linear weight of about 0.33 at 60 Hz,
    less eased), then runs out over that weight x 0.5 s, and is **0 at the pop**; a claymore's press -> rises, held
    5 s. *Was: "about 0 throughout (the two-frame rise, then out)" -- the re-review's N2.*
    `animator.test.ts`: the frame after a standing throw's pop with a grenade left draws the play beneath's plain
    version with no twist (today: the Fire version and the twist when the rifle was hot within 5 s).
  - `THROW_RIFLE_RAISE_READING` (§7) goes in code with it.
  - *Built 2026-10-14 (NU-8a B1; reading, pending review).* `weaponRaise.ts`: `WeaponRaise.frame` takes the hand's
    class 'y' (`grenade`: the idle edge lowers, no countdown), the wind-up (`windUp`: its press resets the countdown,
    no request while held) and a throw's release (`release`: up and the edge moved as a press; `'ungated'` for the
    pistol hand's throw -- and its peek tosses since the review's F1 -- lowered on the next update by the bit-7 branch); `RaiseFeed` reads the release off the hold's
    start (`throwReleaseOf`: a throw-family code; `seal_throwgrenade` with the pistol in the hand is `Pistol throw
    grenade`, outside the gates). `play.ts`: `Play.frame` feeds the raise through `RaiseFeed`; `Play.setItemRaise`
    takes the own kit's hand. `matchThrow.ts`: the hand grenade up with one left (`handGrenade`, class 'y' by the
    item's id), its wind-up, and a claymore's or a PMN's trigger. The slot's last grenade takes the firearm's countdown
    from the launch (`THROW_LAST_GRENADE_RAISE_READING`, not pinned). C4's plant and the bomb's ask nothing
    (`ACTION_PLANT_RAISE_READING`, *inference*). **The others' bodies differ from the row**: the wire carries no grenade
    in the hand (the room's item is the launcher or the firearm, `room.ts` `bodyOf`) and its trigger is the firearm's
    alone, so a copy's hand is inferred -- a hand grenade's from a throw's hold start to its next trigger or firearm
    change -- and its take-up and a placing's press (whose hold code is the bomb's too) raise nothing
    (`REMOTE_HAND_RAISE_READING`). *Was: "The others' bodies: the same from the replicated hold (the start) and the
    replicated item".* `animator.ts` unchanged: the twist already scales with the raise's weight. RED and GREEN:
    `weaponRaise.test.ts`, `animator.test.ts` (the pop's frame).
- **B2 -- the crouched and prone pop keep the play (D5; page and the others').** `THROW_LOW_STANCE_POP_READING` to
  `'kept'` in every stance (§2.3), so `animator.ts`'s covered branch (L612) holds crouched and prone too: no `idle:*`,
  no turn step under the hold, the play resumed at its kept phase, the stick's wanted play then following.
  - *RED:* a crouch-walk at phase p, a throw pushed (the standing clip, state 1), cut on the 48th command with the stick
    held -> the play is the crouch walk throughout, its phase p until the cut and then p plus the frames since (today:
    the crouch idle); a prone crawl the same with `seal_prone_throwgrenade` cut on the 86th. The standing case's test
    (PAR-85 B2) stays green.
  - *Built 2026-10-16 (NU-8b B2; reading, pending review).* `animator.ts`: `THROW_LOW_STANCE_POP_READING` `'kept'` in
    every stance (*was* `{ crouch: 'beneath', prone: 'beneath' }`). RED and GREEN: `animator.test.ts` ("NU-8b B2"; PAR-85
    B4's crouched half and F4, which pinned the old play beneath, re-pinned with their "was"). The crouch-walk's phase
    after the cut runs at the play's own rate, not the step it ran at before the push: the mover's crouch stick is
    normalized and ramped again from the raw stick the hold left (`FUN_00584c60` D:L444160-444165; the port's
    `Walker.locomote`), so the test pins "p plus the frames since" as continuity at the play's rate; the prone crawl
    (no ramp) also at its earlier step. The remote controller's branch is not read (§2.3); the others' bodies take the
    same class.
- **B3 -- the placings as the stack's top (D6; page and the others').** `TOP_CLIPS` takes the placings
  (`seal_place_claymore`, `seal_put_onwall`, their pistol versions), `PISTOL_ONESHOT_PARTS_READING.place` to `'push'`,
  and `throwPoseEnds` true on a placing's hold end whatever its reason -- the hold already ends on the right command
  (PAR-74, PAR-75). The bomb's plant (`bombPage.ts` `startOwnClip`) rides the same class.
  - *RED:* a claymore's placing from the run: a leg part's rotation at t after the push is the slerp of the clip's key
    toward the frozen run by `E((0.4 - t) / 0.4)` (today: linear over 0.4 over the live idle); its layer at 1 to the
    hold's `complete` end on the 158th command, then the cross-fade over the play beneath's `BlendTime` (today: out from
    the last key on the pose's clock); `seal_p_place_claymore`'s `lthigh` through the placing equals the run's at the
    push (today: the idle's). `bombPage.test.ts`'s plant timings stay.
  - *Built 2026-10-16 (NU-8b B3; reading, pending review).* `throwPose.ts`: `TOP_CLIPS` takes `Place claymore`, `Put on
    wall` and their pistol versions; `PISTOL_ONESHOT_PARTS_READING.place` `'push'`; `throwPoseEnds` true on a placing's
    hold end whatever its reason (*was*: not on its own end `complete`). `animator.ts`: the covered branch takes a
    placing's hold as a throw's (`topHeld`, *was* `throwHeld`, the throws alone) -- without it the play beneath turned
    to the idle under the placing and its own play change reset the push's cross-fade; the push's snapshot is the
    stack's over the covered play (R326.6). `bombPage.ts` `ownBombBody`: the hold first, then the clip it carries
    (`ThrowPose.start(anim, held)`), as `./matchThrow`'s `throwStart` does (*was*: the clip first, carried by no hold).
    THROW-INTERRUPT's `cut` path (`matchThrow.ts` `grenade.on('cut')`) is unchanged: a placing cut by the page's death
    pops once on the thrower's `cut`, and the hold's own end later finds it stopped. RED and GREEN: `animator.test.ts`
    ("NU-8b B3": the push's eased snapshot from the run, the layer at 1 to the 158th command and the idle's 0.5 after,
    the pistol placing's held legs), `matchThrow.test.ts` ("NU-8b": the death's one pop), `bombPage.test.ts` (the plant
    rides the class; the order pin's "was" kept), `effectiveAction.test.ts` (`throwPoseEnds`; its title, renamed, moved in
    `docs/parity/registry/character.json`'s `character.action.throw-end`).
- **B4 -- the take-up's cross-fade (D7; page and the others'; low).** `equip(true)` for a throwable or a charge, and
  the item field's change on a remote body, asks the body's snapshot cross-fade over 0.3 s (D:L461917-461920) with no
  play change (`PoseLayer.crossFade`'s request, as a push's).
  - *RED:* a run, a grenade taken up -> the pose on the next frame is the slerp of the frozen pose toward the live run
    by `E((0.3 - t) / 0.3)` (today: the live run).
  - *Built 2026-10-16 (NU-8b B4, the own body; reading, pending review).* `matchThrow.ts`: `TAKE_UP_BLEND` (0.3,
    D:L461919-461920) asked of the body on the frame drawn after a take-up of a throwable, the claymore or the PMN, as a
    push's request with a tick run (the kit's frame after the driver, §1.1), on the part's one body layer (the throw's
    layer wrapped: one layer mounted); `TAKE_UP_FADE_READING` names what it covers and what it does not (the put-away
    after a take-up from a launcher -- the ordinary put-away asks none, as the original's swap branch, D:L461966-461968 --
    C4's plant, the Detonator's switches). RED and GREEN: `matchThrow.test.ts` ("NU-8b B4"). **The remote half is not
    buildable from the wire**: the room's body item is the launcher or the firearm (`room.ts` `bodyOf`, `p.held ??
    p.loadout[slot]`), so a copy never sees a throwable's or a charge's take-up -- named
    `REMOTE_TAKE_UP_FADE_READING` (§7), `remotePlayers.ts` untouched.
- **B5 -- the hand's model (D4): read first, not built.** Nothing changes until `THROW_HAND_MODEL_READING` is settled
  (the kit's instance list for class 3 read whole -- `FUN_005c72c0`'s callers and `FUN_005c6980`'s index -- or capture
  NU8-1). If the original shows nothing in the hand before the launch, `placeHand` hides the model until the kit's
  timer; if it shows one, the port's stands.
- **T1 -- the rest pinned (no behaviour change).** A test over the golden that every throw and placing clip is
  `NoPitchtwist`, non-looped, not `BlendOverlay`, with the `NoInterrupt` and `BlendTime` of §1.4's table; and that the
  page plays no clip between `equip` and `throwStart` (the take-up, the pin, the wind-up).
  - *Built 2026-10-14 (NU-8a T1; pins, passing with nothing changed for them):* `throwClipRules.test.ts` -- the
    golden's rows for the eleven throw clips (the pistol's peek tosses among them) and the four placings, `motion.rdr`
    re-read from the tracked `READERC.ZAR` for `BlendOverlay` (which the golden does not carry; skipped without the
    fixture, a skip said), and the page's part (`./matchThrow`) starting no clip and laying no hold from the take-up
    through a second of the wind-up, then the one clip and its hold at `throwStart`.
- **Not built:** a refused release's one-update rise (NU-8a's review, F2; `REFUSED_RELEASE_RAISE_READING`, §7): the
  controller asks the rifle up at any release (D:L453520), before the kit's request refuses it (a tap under 0.15 of
  the power, the stance clearance, a prone peek: D:L475491-475498; NET-CAP's `FUN_005c0ae0`, D:L476470-476491), and the next update's bit-7 branch finds no
  throw on top and lowers it (D:L453484-453489) -- a rise for one update (linear 1/6, eased about 0.056) with no clip on
  top, out over about 0.08 s. The port's refusals are made in `grenade.ts` (`refuseRelease`, which tells nothing),
  outside NU-8a's files, and from the page's part a refusal is not told from a wind-up dropped by a shoulder press
  (PAR-19 D07) or a menu: named, not built. The Detonator's state 0x11 with no envelope (`DETONATOR_RAISE_READING`); the copy's pop
  (`REMOTE_THROW_POP_READING`); the per-row `network_log` (`THROW_ROWS_NETWORK_LOG_READING`: a dev-disc assertion
  over the tracked `READERC.ZAR` in B1's or B3's test file, skipping without the data, a skip said).

## 7. Readings and placeholders (candidates for the build)

| name | where it would go | status |
|---|---|---|
| `THROW_RIFLE_RAISE_READING` (built 2026-10-14, NU-8a B1; was: *note only*, candidate, B1) | viewer `weaponRaise.ts` (`WeaponRaise.frame`, `RaiseFeed`; `play.ts` `Play.frame`, `matchThrow.ts`) | the rifle asked down at once with a throwable up and the trigger idle (D:L453568, D:L453598-453600); up at a throw's release (`FUN_005dfe30(body, 1)` D:L453520, gated D:L494258, the envelope D:L494259-494265) and, with a grenade left, down again on the second update after it under the clip (the gate `FUN_0059d830` D:L457352-457362 skipping D:L453478-453541; the edge 2 -> 3 -> 0, D:L453546-453556; the state-0 lower D:L453598-453600); the after-pop call D:L453488 a no-op (D:L494244); the pistol-hand throw and peek tosses outside both gates' lists (D:L457352-457355, D:L462579-462582; the peek tosses `DAT_003deb28` / `DAT_003deb38`, paired D:L494720-494721: lowered on the next update by the bit-7 branch, given `FUN_0059d830`'s other conditions with the lean beneath, D:L457365 on, not read; was: the throw alone, NU-8a's review F1); up at a placing's press as the firearm's (D:L453633-453634); C4's Action-button plant asking nothing is *inference* (`ACTION_PLANT_RAISE_READING`); *was: "down on the update after its pop" (the review's F1)*; built: `'down at a take-up; up at a release, down two updates on with one left'`; settles: capture NU8-1 (the rifle through and after each throw and placing) |
| `HELD_TRIGGER_ITEM_RAISE_READING` (RAISE-HELD-FIRE m02d, 2026-11-09; in code; reading: its review PASS WITH FINDINGS, high, in the merge 1387904d9) | viewer `weaponRaise.ts` (`WeaponRaise.update`'s edge 1 and 2; `matchFirearm.ts` `play.setWeaponInput` with `triggerOwed`) | `'up while held from before the take-up; a press with a grenade up asks nothing'`: the controller's trigger is the pad's level whatever is in the hand (`FUN_00594cf0` D:L453543-453567) and the slot change leaves it (`FUN_005c4b10`; research 211 §10), so a trigger held from before the take-up stays at edge 1, whose call `FUN_005dfe30(body)` (D:L453612-453613; its second argument dropped by the decompiler) passes 1 -- read off `socom2_game.elf` (the disc's and the repaired overlay's bytes alike): `addiu $a1, $zero, 1` at 0x596128 (the edge-3 test's delay slot), the edge-1 test `beq $v1, $a1, 0x596298` at 0x59612c on that register, the call `jal 0x5dfe30` at 0x596298 with `$a0 = $s2` in its delay slot and `$a1` untouched between -- so a held fire asks the rifle up every update, the countdown reset; a fresh press with a hand grenade up (edge 2, the class 'y' with a round left, `FUN_005bdb00` D:L474543) is the wind-up's: the countdown reset, no request, the edge 2 -> 3 -> 0 (D:L453624-453660); let go, the edge 3 resets (D:L453603-453610) and the edge 0 lowers at once (D:L453598-453600). Was: the port's feed let the firearm's trigger go at the take-up (`suspendTrigger`), so a held fire lowered the rifle within two game frames, and a press with a grenade up asked up at edge 2; settles: a capture -- the fire held, L2 to an M67, `actor+0xf74` per frame |
| `RAISE_CAPABILITY_GATE_READING` (RAISE-HELD-FIRE m02d, 2026-11-09; in code, the header's named stand-in; reading: its review PASS WITH FINDINGS, high, in the merge 1387904d9) | viewer `weaponRaise.ts` (`WeaponRaise.request`) | `'taken as passed'`: `FUN_005dfe30` tests the body's `+0x258` bit 0 before it stores the UP state (D:L494258-494259; r0004's at 0x5e7690-0x5e7698); the port's one request door takes it as passed, the held trigger's UP among every other; its three clears found are wall and weapon-line checks (`FUN_00549c30` D:L414153, `FUN_00549f30` D:L414275, D:L465223; `SWAP_RUN_FIRE_READING`); who sets it (r0004's U8) is unread; settles: the bit's writers read, or a capture with `actor+0x258` per frame |
| `THROW_LAST_GRENADE_RAISE_READING` (built 2026-10-14, NU-8a B1, pins nothing; was: *note only*, candidate, B1 names it) | viewer `weaponRaise.ts` (`matchThrow.ts`: the grenade flag off once none is left) | the slot's last grenade: the firearm back at the launch (`FUN_005c4b10` D:L477135-477136), the plain branch's countdown reset at the edge-3 update (D:L453603-453610) and asking up while it runs (D:L453572-453584), against the pop's one-frame `FUN_005dfe30(body, 2)` (D:L453488) and the raise tick's re-request (`FUN_005dfc80` D:L494190-494201): whether the rifle dips or stays up through the countdown; built: `'the countdown'` -- the firearm's countdown from the launch, no dip at the pop; settles: those three read whole frame by frame, or capture NU8-1's last-grenade throws |
| `THROW_LAST_GRENADE_RELOAD_READING` (*note only*; LATER 181's read, 2026-10-21; reading, pending review -- source inspection; nothing built: the port arms nothing) | -- (would be: viewer `matchThrow.ts` at the launch, `fire.ts` `Fire.reload`'s landing; the room's `throwGrenade`) | the throw spends before its release (`FUN_005c1970` D:L477040-477041; the death's drop `FUN_005b8920` D:L471775-471776), so the release's arm (`FUN_005c5340` D:L479296-479320: the slot in the hand at 0, a hand grenade 121-127 off the exempt list D:L479302-479317) sets the kit's timer at the grenade record's `ReloadDelay` (flag 0; 0.01 s when absent, research 94 C1.1) with the grenade's slot still in the hand; the firearm is taken back after it (`FUN_005c4b10` D:L477136-477142 on a quick throw's `+0x828`, set by `FUN_005c0020` D:L475979; with none, the grenade's slot stays and its walk finds no grenade, D:L477448-477459), and the timer lands about a frame later in `FUN_005c2a90` on that slot (D:L476553-476560, the timer zeroed whatever it answers). **The rifle hand's throws, tosses and peek tosses and the pistol's tosses:** the throw is still the top (it holds its last key until popped, §1.5) and in `FUN_005a7d10`'s list (D:L462579-462582; research 251 §11), so `FUN_005c2a90` refuses (D:L477397): nothing -- the port's own (it arms nothing). **The death's drop:** the body dead by then (`FUN_005c2a90`'s alive bit, D:L477395-477396; the bit's clear in the death `FUN_00547af0` not cited): nothing -- the port's. **The pistol hand's `Pistol throw grenade`, its crouched and prone kin and its peek tosses** are in neither list (research 251 §11, `HOLD_OVER_THROW_HAND_READING`), so the arm reaches the pistol's walk -- the next magazine with rounds put in, `FUN_005a82e0`'s reload clip, the `ReloadSound` (D:L477462-477488) -- unless `FUN_005b4340(actor, 3)` (D:L469494-469521: the top's flag word `+0x28 & 4`, `FUN_00588030`, `FUN_00587fe0`, `FUN_00587f90`, `FUN_0057b510`) or `FUN_005a82e0` (D:L462786-462935) refuses over that clip, unread: so a pistol reload a frame after the last grenade's launch, the throw's follow-through cut, is possible and not settled; the port: none. **The remote route** (`FUN_002c17b0` D:L163766 -> `FUN_005bd030` D:L474178): the release with no spend, so it arms only where this console's copy of the thrower's slot already reads 0, and the body bit `+0x105c & 0x20` (no spend, D:L477027, D:L471762; a round at 0, `FUN_005bd530` D:L474289-474290) keeps the count off 0; what a copy's counts hold and who sets the bit, unread; the port: none. Settles: `FUN_005b4340(actor, 3)` and `FUN_005a82e0` read over `Pistol throw grenade`, the throwables' `ReloadDelay` off the disc (`readKitTable`), or a capture -- the last M67 thrown from the pistol hand with the pistol part-spent (its count and its `ReloadSound` after the launch) |
| `ACTION_PLANT_RAISE_READING` (named by NU-8a B1, 2026-10-14) | viewer `weaponRaise.ts` (`matchThrow.ts` feeds no trigger for C4; `RaiseFeed` takes a placing's hold as no release) | `'none'`: C4's plant (`FUN_00592d50` -> `FUN_005c0020(.., 0x97)`) and the bomb's plant and drop (`FUN_005920c0`, `FUN_0059ddb0`) are the Action button's: the trigger branch that raises the rifle (D:L453633-453634) is not on their path (*inference*: the Action handler D:L452030-452055 not searched whole for `FUN_005dfe30`); settles: that handler read whole, or capture NU8-3 |
| `REMOTE_HAND_RAISE_READING` (named by NU-8a B1, 2026-10-14; retired for live copies by ER-2, 2026-11-09) | viewer `weaponRaise.ts` (`RaiseFeed`, for a body with no `Play.setItemRaise` and no raise field: a pre-14 replay's copies) | `'a hand grenade from a throw to the next trigger'`: **Retired for live copies 2026-11-09 (ENEMY-RAISE ER-2, protocol 14; reading: ER-2's re-review PASS WITH FINDINGS, high, `agent-mail/evidence/mega/REVIEW-ER2-AND-ER-BATCH.md` Review 1):** the owner's raise state is on the wire -- the page sends its own `WeaponRaise` state (`Command.raised`), the room relays it on `BodyFlag.Raised` (a bot's from `Player.raise`, never a dead body's), and the copy requests it each game frame and runs its own envelope (`RaiseInput.raised`; the original's `FUN_002bd640` D:L161978 packs `FUN_005e0010` D:L494306-494309 into byte +0x7e, `FUN_002be150` D:L162310-162312 replays it), so D2 (the take-up's lower: the grenade-equip report 1's copy case), D3 and F3 (a)-(c) follow the owner's own state (`weaponRaise.test.ts` RED 10-12, `remoteRaiseWire.test.ts`); kept, as below, only for a replay recorded before protocol 14 (`remotePlayers.ts` `setRaiseField`). Was: the copy's rifle rides the owner's raise state (byte 0x7e, D:L162310-162311; §4), which the port's wire does not carry, nor a grenade in the hand (`room.ts` `bodyOf`: `p.held ?? p.loadout[slot]`), its trigger the firearm's alone; so a copy's hand is a hand grenade's from a throw's hold start until its trigger or its firearm changes, and a take-up (D2) or a placing's press (D3, whose hold code is the bomb's plant's too) raises nothing on a copy; nor, where the owner's rifle comes up with no trigger, does the copy's (NU-8a's review, F3; was: D2 and D3 alone): (a) the slot's last grenade (the own body at 1 at the pop under the countdown), (b) the firearm taken back after a throw or a wind-up's press (the countdown reset at D:L453603-453610 / D:L453625-453632 frozen while the class is 'y', D:L453598, and written by nothing on the swap path: up to 5 s), (c) the firearm taken during the wind-up -- each shown on the owner's screen (the Fire version, the twist), each at 0 on the copy; settles: the raise state or the hand's item on the wire (a protocol change: the body flags' bits 16-31 are free), or capture NU8-2 |
| `REFUSED_RELEASE_RAISE_READING` (*note only*; named by NU-8a's review F2, 2026-10-14: not built) | viewer `weaponRaise.ts` (would be a `release: 'ungated'` at a refused release) | a refused release raises the rifle for one update: the controller's release asks up (D:L453520) before the kit's request refuses (D:L475491-475498: a tap under 0.15 of the power, the clearance, a prone peek; NET-CAP's `FUN_005c0ae0`, D:L476470-476491), and the bit-7 branch lowers it on the next update with no throw on top (D:L453484-453489): linear 1/6 (eased about 0.056), out in about 0.08 s, no clip; the port shows nothing -- its refusals are `grenade.ts`'s `refuseRelease`, which tells nothing; settles: a refusal told to the raise (a `grenade.ts` change), then built; capture NU8-1's taps for the picture |
| `THROW_HAND_MODEL_READING` (*note only*; candidate, B5) | viewer `grenade.ts` (`placeHand`) | whether the original shows a grenade in the hand from the take-up to the launch: the take-up hangs only an instance the kit's list holds (`FUN_005c6980` D:L479747-479759) and the fill makes none for class 3 on research 324 §1.1 and §1.5's read (D:L455806, D:L480112); the projectile is made at the launch (`FUN_005c1970` D:L476897-476902; research 85 §4); the clips' `rifle` track carries the firearm apart (research 85 §8.1); settles: `FUN_005c72c0`'s callers and `FUN_005c6980`'s index read whole, or capture NU8-1 |
| `THROW_ROWS_NETWORK_LOG_READING` (*note only*; candidate, none: no build depends on it) | -- | which of `Toss grenade`, `Crouch throw grenade`, `Prone throw grenade`, `Prone toss grenade`, the peek tosses' and the pistol pairs' anim-set rows carry `network_log` (bit 0 of `DAT_0044d458[type]`, D:L496507-496511; sent only then, D:L160789-160790); `Throw grenade`'s is read (research 230 §5.2.11), the SOLDIER set's throws and placings by research 214; settles: `parseRdr` over the tracked `READERC.ZAR` in a dev-disc test, as PAR-84's |
| `REMOTE_THROW_POP_READING` (*note only*; candidate, none: the port pops with the hold) | -- | how a copy's throw comes off: its own driver's cut on the replicated stick, its own end test, or a second Push Blend of the owner's pop; the port's others pop when the hold leaves the body (PAR-85 B3); settles: `FUN_005880e0`'s other cases and the remote controller's stick read, or capture NU8-2 |
| `KNOCKED_THROW_POWER_READING` (THROW-INTERRUPT, 2026-10-16; in code) | viewer `grenade.ts` (`GrenadeThrower.letGo`, a pending throw `popped`) | the power a throw knocked off its clip before the hand opens leaves with at the kit's timer (the knock clears neither the bit nor the timer, §2.4; the launch at `ctrl+0x11c`, D:L477024): `'kept'` the release's, or `'zeroed'` if the controller's after-pop branch (D:L453483-453489) runs first -- refused in the air (D:L457369), its refusals over the knock's clip (`FUN_005a7de0` D:L462620 on) not read; built `'kept'`, the port as it stood, pinned in `throwInterrupt.test.ts`; settles: those refusals read over the knock clips with their `NoFire`, or capture TI-1 |
| `DEATH_THROW_DROP_READING` (*note only*; THROW-INTERRUPT, 2026-10-16: resolved, built the same day -- was: not built) | server `room.ts` (`deathDrop` from `kill`; `takeThrowStart`), the wire's `throwStart` and `start` (§2.4) | the original's drop at a death with a throw pending: spent and launched at once at power 0 from the hand, live (`FUN_005b8920` D:L471751-471870 from `FUN_00547af0` D:L413023; research 85 §4's "tap" row, about 7.7 units out at a level aim), a charge cleared unspent (D:L471756-471759); built in the room on the page's `throwStart`, pinned in `roomThrowInterrupt.test.ts`; capture TI-2 for the picture; resolved |
| `DEATH_DROP_HAND_READING` (THROW-INTERRUPT, 2026-10-16; in code, the drop's doc) | server `room.ts` (`deathDrop`) | where the room's drop leaves from: `'table'` -- `GetThrowAnim`'s table point for the death frame's stance at power 0 (`throwAnim(0, ..)`: standing level, the toss's (3.13, 13.8, -10.5)), where the original launches from the hand as the dying body is posed (`FUN_002869d0` on the hand node, D:L471795-471802, as the timer's launch, research 85 §4 item 1); the room poses no hand; settles: capture TI-2 (the drop's place against the body's), or the death clip's hand node at its first frame through the repository's readers |
| `TAKE_UP_FADE_READING` (NU-8b B4, 2026-10-16; in code) | viewer `matchThrow.ts` (the part's body layer, `TAKE_UP_BLEND`) | `'a throwable, the claymore or the PMN'`: the take-ups that ask the body's 0.3 s snapshot cross-fade with no play change (`FUN_005a64c0` `bVar6`, D:L461889-461895, D:L461917-461920; the item's class from `FUN_005c1660` D:L476709-476734), on the frame drawn next with a tick run (the kit's frame, `FUN_00551ec0` D:L418611 -> `FUN_005dfc80` -> D:L494228, after the driver D:L418454-418455; PAR-67's order); not from a raised launcher (the hand word 4 -> `FUN_005a6b70`, D:L461870-461876: its own lower clip, no snapshot; the review's F1, built); not built: the put-away after a take-up from a launcher (the word 0 or 3, D:L462086, then the block D:L461896-461914; the ordinary put-away takes the swap's branch, D:L461966-461968, no snapshot -- was: "the put-away to the firearm in the hand (the same branch, D:L461896-461914)", the review's F2), C4's plant (its switch and its `Put on wall` push in one frame, their order not read), the Detonator's switches (the placement's own, `FUN_005c8a20`, not read); settles: capture NU8-1 |
| `REMOTE_TAKE_UP_FADE_READING` (*note only*; NU-8b B4, 2026-10-16: not built) | viewer `remotePlayers.ts` (would be) | the copy's take-up cross-fade from the item field (`+0x66` into the copy's selector, research 324 §3; §4) -- not settled by ER-2's raise state (protocol 14 carries byte +0x7e, not the item field +0x66; the fade is the body's snapshot cross-fade, not the raise envelope): the port's wire carries no throwable or charge in the hand (`room.ts` `bodyOf`, `held` the launcher's alone; `REMOTE_HAND_RAISE_READING`'s finding), so no copy sees a take-up; settles: the hand's item on the wire (a protocol change), then built; capture NU8-2 |
| `LAST_GRENADE_PENDING_PRESS_PULLS_READING` (*note only*; GRENADE-RETHROW fold 2, 2026-11-09; **retired 2026-11-09** by the GR-1 fold, capture GR-1 §7.2: the port's `holdPulls` is 0 from the launch for a press while pending, last grenade or not -- the measured value, class 0x79 (agent-mail `evidence/gr-1-2026-11-09/`, `capture/last-t1..t3.csv`), the M67's own pass open; `throwAgain.test.ts` "the slot's last grenade, pressed while pending" pins 0) | -- (was: viewer `matchThrow.ts` (`pendingPress`, settled in the part's `frame` at the pop); removed 2026-11-09) | was `1`: the slot's last grenade thrown with the trigger pressed while pending and held through the pop -- the launch's count 1 (D:L477023-477025) survives the held button (edge 1), the pop's one update of edge 3 (D:L453484-453500) zeroes it only if a kit frame runs then (D:L476399-476400), and the last launch's lower `kit+0x820` (`FUN_005c5340` D:L479318-479320) withholds them while it runs (D:L476549-476568); its length against the pop unread; pinned in `throwAgain.test.ts` ("GRENADE-RETHROW fold"); **GR-1 (2026-11-09, §7.2): the value contradicted** -- on the class-0x79 path `+0x818` reads 0 at every row from the launch through the pop and after (3/3, ±0): a press while pending stays at the edge 0 until the slot is empty (the double remap, D:L453633-453660), so the launch's own kit frame zeroes the count at the edge 0 (D:L476380-476382; the mechanism a reading, GR-1's comparison reviewed PASS WITH FINDINGS, high, per the merge ccf3deed6), and the lower `kit+0x820` lasts one kit frame (0.0100 on the launch's row only), 24-25 updates before the pop; the outcome, no round after L1 under the held R1 (3/3), is measured but not explained by the count (0); the port's fold done 2026-11-09 (0 from the launch; the constant removed); still owed: a pass with the hand's slot and the drawn firearm in the columns (§7.2's no-round outcome); was: "settles: capture GR-1's last-grenade pass"; was: "stays a reading, in code 1" |
| `THROW_REARM_UPDATES_READING` (GRENADE-RETHROW, 2026-11-09; in code; **proven** 2026-11-09 by capture GR-1 for the class-0x79 path, §7.2; the count's chain beneath, reading, GR-1's comparison reviewed PASS WITH FINDINGS, high, per the merge ccf3deed6) | viewer `grenade.ts` (`finishThrow` arms it, `update` -> `rearmWindUp`) | `2`: the updates from a throw clip's pop to the next wind-up's first chase with the trigger held through the clip -- **proven** by capture GR-1 (agent-mail `evidence/gr-1-2026-11-09/`, 2026-11-09T07:20-07:35Z, r0004 on PCSX2 2.8.2, M51 slot 5; the base and primary legs, 6/6 pops, ±0 updates, one row one controller update; the MARK141, class 0x79, in place of the M67, whose own clip is not measured -- an M67 pass open; compared by a reader who wrote neither, §7.2); the pop's update clears bits 0x40/0x80 and remaps the edge (D:L453484-453500), the next sets the wind-up bit on the held button's fresh press with a grenade left (D:L453543-453567, D:L453633-453637; `FUN_005bdb00` -> `FUN_005bda70` D:L474519-474538), the one after chases from 0 (D:L453505-453517); the updates are the original's controller updates (`FUN_00594cf0`, one a game frame, a fixed step); the port counts `GrenadeThrower.update` calls, one a page frame at a variable step (the "next update throws" precedent, `release`), so its re-arm lands two page frames after the pop -- about 14 ms at 144 Hz, 33 ms at 60 Hz, 67 ms at 30 Hz -- a frame-rate dependence against the original's two fixed updates (GRENADE-RETHROW fold, review F2); the kit count `+0x818` a firearm taken under the held trigger holds (`./matchThrow` `holdPulls`; reviews F1, F3, F4, F5, reading, GRENADE-RETHROW's third review PASS WITH FINDINGS, high, per the merge 6133a16fd): the launch raises it (D:L477023-477025) and `FUN_005c0ae0`, run on every kit frame `FUN_005c1970` passes (the launch's own among them, D:L476564-476569; D:L476877-476902, D:L477144-477150), zeroes it at edge 0 or 3 (D:L476380-476382, D:L476399-476400) -- a press after the hand opened: 0, zeroed on the launch frame itself, last grenade or not; a press while pending, held through the launch (edge 1): the pop remaps 1 to 3 for one update (D:L453484-453500), then the re-arm's double remap 0 (D:L453638-453660); with one left no `kit+0x820` runs (`FUN_005c5340` D:L479318-479343), so the first kit frame after the pop zeroes it (0); with the slot's last, `LAST_GRENADE_PENDING_PRESS_PULLS_READING` (retired 2026-11-09 by the GR-1 fold: 0, the port's `holdPulls` 0 from the launch) -- *GR-1 (§7.2): the edge 1 at the launch does not occur; a press while pending reads the edge 0 until the slot is empty (the double remap, D:L453638-453660, while a grenade is left), so the launch's own kit frame zeroes the count -- measured 0 on the last grenade, 3/3; the port's count 0 from the launch since the GR-1 fold (2026-11-09; was: "with one left the port's 1 settles to 0 at the pop, the same end")*; the controller's place in the frame against the driver's pop and `FUN_005a7de0(actor, 1, 1)`'s other conditions (D:L462636-462707, §1.6) unread; pinned in `throwAgain.test.ts` ("GRENADE-RETHROW"); no harness spec or golden trace holds it; the port's page-frame count (two `GrenadeThrower.update` calls) against the original's two fixed updates stays the named frame-rate difference (review F2); was: "settles: capture GR-1" |
| `DETONATOR_RAISE_READING` (*note only*; candidate, none: nothing built) | -- | the Detonator's trigger reaches `FUN_005dfe30(body, 1)` (its class is not 'y', D:L453633-453634) and the envelope is refused for its record (`+0x7c == 0xbe`, D:L494261-494263): what the state 0x11 with no envelope draws (`FUN_005dfc80` D:L494179-494230) is not read; settles: those lines read whole, or capture NU8-3 |

Readings the code holds that this note moves (their rows are research 251 §12.9's and research 101's): `THROW_LOW_STANCE_POP_READING` to `'kept'` in every stance (§2.3, B2); `PISTOL_ONESHOT_PARTS_READING.place` to `'push'` (§3, B3). *Both moved 2026-10-16 by NU-8b, research 101's rows in place with their "was".*
`RUNNING_THROW_BODY_READING` (`'snapshot'`) stands: nothing here disputes PAR-85.

The captures that would settle them (the original running, 60 fps video, the pad's state beside it):

- **NU8-1**: each of the M67, HE, AN-M8 and Mark141 thrown standing still, standing from a run (the stick held through
  the cut, and let go mid-throw), crouched still, crouch-walking, prone, from a peek, with the rifle and with the pistol
  in the hand; the rifle hot and cold before the take-up; the thrower's console in third person. Settles the hand's
  model before the launch, the rifle's lower at the take-up and after the pop (and the 0.5 s), the take-up's check in a
  stride, the crouched and prone pops, and proves PAR-85's blends.
- **NU8-2**: the same throws seen from another console: the clip's start against the thrower's, its pop, the copy's
  rifle.
- **NU8-3**: a claymore, a PMN and C4 placed, standing and crouched, rifle and pistol; the Detonator pressed; the
  rifle before and after each.
- **GR-1** (GRENADE-RETHROW): standing still with an M67, R1 held 0.5 s and let go; about 1.0 s after the let-go
  (in the follow-through) R1 pressed and held, let go about 0.5 s after the wind-up starts. Per frame: the controller's
  `+0x170` (bits 0x40, 0x80), `+0x118` (the edge), `+0x11c` (the power), the stack top's type (`actor+0x1c0` -> top
  `+0x2c`), the kit's `+0x820`, `+0x81c` and `+0x818`; then once more with the primary taken in the re-armed wind-up, R1 still held, pressed once while pending (before the hand opens) and once after; then the slot's last M67 pressed while pending and held, the primary taken after the pop. Expected: 0x40 set under the clip with 0x80 held; both cleared at the pop's
  update; 0x40 set on the next; the power rising from the update after; `+0x820` and `+0x81c` 0 between the throws;
  `+0x818` 0 from the launch frame for a press after the hand opened and from the first kit frame after the pop for one
  while pending, and the primary's round leaving under the held R1; on the last M67, `+0x820` at the pop's update and
  `+0x818` after it. Settles `THROW_REARM_UPDATES_READING`, the folds' count (reviews F1, F3) and
  `LAST_GRENADE_PENDING_PRESS_PULLS_READING` (retired by it, 2026-11-09: §7.2).
- **TI-1** (THROW-INTERRUPT): a standing M67 throw held a second, knocked off by a blast before its hand opens (and
  not killed); where the grenade lands against the same throw unknocked. Settles `KNOCKED_THROW_POWER_READING`.
- **TI-2** (THROW-INTERRUPT): the same throw killed before its hand opens, seen by the thrower and by another console:
  the drop's place and its blast. Proves `DEATH_DROP_HAND_READING`'s picture (the drop's hand point; the drop itself was `DEATH_THROW_DROP_READING`, resolved).

### 7.1 The kit's path: body+0x5e0 (for GR-1's reads; 2026-11-09)

GR-1 reads the kit's `+0x818`, `+0x81c` and `+0x820` every frame by PINE, so it needs the kit's address from a
pointer the harness already has: the local body (r0004 `0x44d648`: `agent/eph-raise@82dc0f201:socomlegacy/tools/eph/raise.ts:85`, `localBody`; it lands with that branch). Two kinds of evidence,
kept apart:

- **Source inspection (r0001; reading: the fresh review PASS WITH FINDINGS, high, 11 cites agree, per the merge b70ce48c4).** The kit is the body's embedded block at `+0x5e0`:
  `FUN_005506a0` (decomp L417804) takes the body as its second argument (L417821) and runs the kit's frame
  `FUN_005c0fd0` on `body + 0x178` words, i.e. byte `+0x5e0` (L417907); the same function calls through the vtable of
  the object at the body's `+0xc0` (L417872, L417905) -- the controller, as research's raise columns have it (`*(body+0xc0)`).
  Inside the kit frame (`FUN_005c0fd0`, L476510; the kit is its argument, L476531) the `+0x820` timer runs down
  (L476548-476563) and the controller's power is read through `*(kit+0x830)` -> `+0xc0` -> `+0x11c` (L476570): the kit's
  `+0x830` is a pointer back to its body. The same `+0x5e0` reaches the throw-gate function from another caller
  (`FUN_00563e10`, L427744, L428062). Re-read by that fresh review (the merge b70ce48c4).
- **A live memory read (r0004; one field measured, not a capture of the throw).** PCSX2 2.8.2 on the capture rig's
  copy, r0004 (the r0001 disc with the rig's Mcd001/Mcd002), M51 save-state slot 5, by PINE reads only
  (2026-11-09T06:54Z, the owner's second PC): the body `*(0x44d648)` = `0x14c5d00`; over every word offset `k` from
  `0x5c0` to `0x620`, only `k = 0x5e0` gives `*(body + k + 0x830) == body` (`k = 0x5e4` reads `8` there). So the
  r0004 kit is also at `body + 0x5e0`, by the back pointer the r0001 kit frame reads. At slot 5 (standing, the rifle
  in hand) the kit's `+0x818`, `+0x81c` and `+0x820` all read 0. This settles the path for GR-1's reads; it measures
  nothing of the throw itself.

What it does not settle: the meaning and timing of `+0x818`/`+0x81c`/`+0x820` in a throw (GR-1's own frames, with each
inferred field checked live before the trials -- the M67 count stepping down one per throw, `+0x818` rising at the
launch); the controller's `+0x170`/`+0x118`/`+0x11c` on r0004 are taken at their r0001 offsets as inferred until GR-1's
rows show them behaving.

### 7.2 GR-1, 2026-11-09: the capture compared value for value

A live memory trace of the original running, compared row by row against this note's readings by a reader who wrote
neither the readings nor the capture (the fresh reader of `agent/gr1-compare`, 2026-11-09). Kept apart from the source
readings: what is measured here is what the rows show at their trial counts; a mechanism named beside a measurement is
a reading (this reader's; GR-1's comparison reviewed PASS WITH FINDINGS, high, per the merge ccf3deed6) unless it says otherwise.

**The run.** agent-mail `evidence/gr-1-2026-11-09/` (`RECORD.md`, `capture-summary.txt`, the rows
`capture/<leg>-t<n>.csv`); the tool `tools/eph/gr1.ts` and `tools/eph/scripts/gr1-legs.json` at `agent/spc-gr1`
fe8be74a1; r0004 (the r0001 disc with the rig's memory cards) on PCSX2 2.8.2, PINE reads only, M51 save-state slot 5
restored before every trial, 2026-11-09T07:20-07:35Z on the owner's second PC. Five legs of three trials (base, primary,
pending, after, last), 5,398 rows (1 torn; was: "3,780 rows", the GR-1 fold's review). Each row is read once the guest clock moves; every step is 0.0333 or 0.0334 s (one
30 Hz game frame) but two: primary-t1 drops one frame between t 1.535 and 1.602 (under the clip, before its hand opens)
and primary-t2 one between 3.804 and 3.870 (after the rifle's third round) -- neither in a window compared below. One
row is torn (its clock moved while it was read): base-t1's first, t 0.000, before any input; excluded.
- **The item substituted.** The MARK141 (class 0x79), not the M67: every rig save state carries MARK141 x6 and none an
  M67. The readings compared are the controller's and the kit's paths keyed on the class `'y'` and the slot's count
  (§3: the same class and sequence), so what is measured is measured **for the class-0x79 path**. The M67's own clip
  (this item's let-go at 1.0 s, its hand opening at 1.77 s, its pop at 2.60 s) is not measured: an M67 pass stays open.
- **The throwable's count** is `kit+0x274` (found live by the run: the one kit word that falls by exactly 1 across a
  throw; 6 -> 0 over the last leg's six throws, at each launch).
- **One row is one controller update** (measured): the re-armed wind-up's power goes 0, 0.1001, 0.1902, 0.2712 on
  consecutive rows (every base and primary trial) -- increments in the ratio 0.900, 0.899, one chase step of 0.1 of the
  remainder a row (the chase, D:L453505-453517, at the 1/30 s step); two updates a row would give 0.81.
- **The sampling phase.** A row holds the state between two writes of the guest clock, which need not fall between the
  controller's update and the kit's frame of one loop; the order of the two within a loop is unread (the body's
  frame calls the controller's vtable slot `+0x3c` before the kit frame, `FUN_005506a0` D:L417905, D:L417907, but the
  controller table 0x6694b0 holds `FUN_00594cf0` at `+0x0c` and `FUN_005970b0` (D:L454032) at `+0x3c`, which never calls
  `FUN_00594cf0` -- the GR-1 fold's review; was: "that slot taken as `FUN_00594cf0`"). So a controller field and a kit field may show one update apart in one row. Tolerances: **±0 updates** between
  fields of one kind; **one row** where a controller field is compared against a kit field.

**The results, each at its level.**

| what was compared | the reading | the rows | trials | level |
|---|---|---|---|---|
| the re-arm under a trigger held through the clip (`THROW_REARM_UPDATES_READING`) | 2 updates from the pop's to the first chase: the pop clears 0x40, 0x80 and the power; the next sets 0x40; the one after chases | pop P (t 2.602): 0x40 0, 0x80 0, power 0, the stack top back to 0x1 from the row before; P+1: 0x40 1, the edge 0 (the held button read as a press and remapped twice, D:L453636-453660); P+2: power 0.1001 | 6/6 pops (base t1-t3, primary t1-t3: the primary leg is base's up to its L1), ±0 updates | **proven** for the class-0x79 path (the original's count of updates; the port's page-frame count is §7's named difference) |
| no re-arm with the button up at the pop | nothing re-arms | 0x40 stays 0 after the pop | 24/24 pops (base's second, pending, after, and the last leg's first five, three trials each) | proven, class 0x79 |
| a tap before the hand opens (pending, R1 at 1.15 s for 120 ms) or after it (after, 1.9 s) | throws nothing | the edge 0 at every row (the double remap while a grenade is left); no 0x40 after the pop; the count steps once | 6/6 | proven, class 0x79 |
| `+0x818` at a launch with the button up | the launch raises 1 and `FUN_005c0ae0` zeroes it in the launch's own kit frame (edge 0) | 1 on the launch's row in 3 (base-t1, primary-t2, primary-t3, t 1.768, the row where the count steps), 0 on the next row in all 3; 0 at every other row of every launch -- 3 of 33 | 33 launches (base 2, primary 1, pending 1, after 1, last 6, three trials each; was: "30 ... last 5", the GR-1 fold's review) | the outcome proven (never past the launch's row, one row); a row showing the stepped count beside 1 lies between the raise (D:L477023) and the same kit frame's `FUN_005c0ae0` (D:L476566-476569), which is the reading's order -- the in-frame zero itself is not resolved by a per-frame sampler |
| `+0x820`, `+0x81c` between throws | 0 with a grenade left (`FUN_005c5340` sets no lower without `ReloadAfterShot`) | 0 at every row of every throwable phase | 15/15 | proven, class 0x79 |
| `+0x820` at the slot's last launch | the lower's `ReloadDelay` (0.01 s when absent: §7 `THROW_LAST_GRENADE_RELOAD_READING` (*note only*), research 94 C1.1) | 0.0100 on the last launch's row only, 0 on the next (0.01 run down below 0 in one 1/30 s step: `FUN_005c0fd0` D:L476550-476561) -- 24 to 25 updates before the pop | 3/3 | proven, class 0x79: the lower lasts one kit frame |
| the primary taken in the re-armed wind-up under the held R1 (primary leg, L1 at 3.30, power 0.88) | the firearm fires under the held trigger, handed count 0 (a press after the hand opened) | the next row: 0x40 0, the power 0, the edge 2 (the class no longer `'y'`, the held button a fresh press with no remap), then 1; `+0x818` 1, 2, 3 (t 3.403/3.537/3.670; t3 3.437/3.537/3.670) and held at 3 to the let-go at 5.0, then 0 at the edge 3 (t3 one row later); `+0x81c` 0.0786, 0.0453, 0.0119, 0 between rounds (the rate timer, run down one step a row) | 3/3 | proven (the outcome and the count from 0): research 211 §10.6 |
| the slot's last grenade, pressed while pending (16.15 s) and held, L1 at 19.0 (`LAST_GRENADE_PENDING_PRESS_PULLS_READING`) | 1: the launch's count kept under a held edge 1 | below | 3/3 | **the count measured 0; the reading's value contradicted** (below); the port folded to 0 and the constant retired, 2026-11-09 |

**The last grenade, pressed while pending: the rows.** The edge reads 0 at every row from the press to the launch (t1,
t2: the launch at 16.782; t3: 16.849, its let-go taken one update later, power 0.77). It reads 2 on the first row where
the controller can see the slot empty -- t1 and t2 the row after the launch's (16.815), t3 the launch's own row (beside
`+0x820` still 0.0100, so before the next kit frame: the sampling phase) -- then 1 to the pop. At the pop (t1, t2 17.616;
t3 17.649) the edge 3, 2, 1, and no 0x40. `+0x818` is 0 at every row of the leg, the t3 launch row among them (read
after the launch's kit frame and before the next). L1 at 19.0 under the held R1 changes no row (the edge 1, `+0x818` 0)
to R1's let-go at 20.5 (the edge 3, then 0). 3/3, ±0 within a trial.

**Why the press reaches the edge only once the slot is empty** (reading, reviewed with the comparison per the merge ccf3deed6 -- this reader's, from the
decompilation). Under the clip `FUN_0059d830` answers 0 over the throw types (D:L457349-457362), so the throw branch
(gated by it, D:L453478-453480) does not run and the plain branch reads the button each update (D:L453543-453567): held,
the edge 0 becomes 2. With the class `'y'` and `FUN_005bdb00` finding a grenade (D:L453633), the branch sets 0x40
(D:L453637) and remaps the edge twice (D:L453638-453660: 2 -> 3 -> 0), so the edge reads 0 every update while the
slot holds the grenade -- the press is taken each update and handed back to 0. The launch's kit frame therefore sees
the edge 0 whichever runs first in that loop (the controller's place against the kit frame is unread: D:L417905 calls
the table's `+0x3c`, `FUN_005970b0`, not `FUN_00594cf0` -- the GR-1 fold's review; was: "the controller runs before the
kit frame (D:L417905, D:L417907)"): the controller of that loop, if first, still finds the grenade and leaves 0, and
if after, the previous update's 0 stands; the kit frame launches (`+0x818` + 1, D:L477023) and calls `FUN_005c0ae0`
(D:L476566-476569), which zeroes `+0x818` at the edge 0 (D:L476380-476382). On the next update `FUN_005bdb00` finds none, so the edge 2 stands (`FUN_005dfe30(actor, 1)`,
D:L453633-453634) and becomes 1. The action lock `FUN_005a7ab0` is not on this path: in the controller it gates only
button 6's request (D:L453461-453464). The same absorption holds for a press while pending with grenades left: the
edge 0 at the launch, the count zeroed there.

**What it means for the port's `holdPulls`.** The reading's premise -- "held through the launch (the edge 1)" -- does
not occur in the original: a press made while pending stays at the edge 0 until the slot is empty, and the launch's own
kit frame zeroes the count. Measured: `+0x818` 0 at the launch, through the pop and after, 3/3 -- not the reading's 1.
The reading's other branch fails as well: the last launch's lower (`+0x820`) ends one kit frame after the launch, long
before the pop, so it cannot shield a 1 to the pop. With a grenade left the port's `holdPulls` as compared (1 while pending,
settled to 0 at the pop) ended where the original does (0) -- a firearm cannot be taken under the clip (the shoulder
refusal, §2.1) -- so only the last grenade's case differed: the port handed 1, the original holds 0. Since the GR-1 fold
(2026-11-09) the port's count is 0 from the launch in both cases.
- **The outcome**: no round after L1 under the held R1, 3/3 -- measured. It is **not** explained by the count: the count
  is 0, and on the primary leg a count of 0 let the rifle fire three rounds. What refused it is not in the columns: the
  hand after the last launch (the throwable taken up through the inventory, so no quick-throw slot at `+0x828` and no
  `FUN_005c4b10` at the launch, D:L477135-477136; `THROW_LAST_GRENADE_RELOAD_READING`, *note only*), what L1 does from an empty
  throwable slot, or the swap's own refusals. So the outcome neither supports the value 1 by the count nor says why
  nothing fired.
- **Filed**: `LAST_GRENADE_PENDING_PRESS_PULLS_READING` -- *was:* a named reading (in code, 1) with this finding
  against it. **Folded 2026-11-09** (the GR-1 fold, `agent/gr1-compare`): the port's `holdPulls` is 0 from the launch
  for a press while pending, last grenade or not, and the constant is retired (§7's row): the count measured 0 for the
  class-0x79 path, the M67's own pass open. The port, after the fold, hands the firearm 0 in this case and so fires under the held R1 as on the primary leg (`Fire.pull(0)`; source inspection, no test of the case) -- against the original's no round; nothing is built for it until the pass below says what refused it (LATER 792). Owed: a pass with the hand's
  slot and the drawn firearm in the columns (an M67, by the quick throw and by the inventory).

**What stays open**: the M67's own clip and counts (a later M67 pass); the firearm-to-firearm swap
(`SWAP_HELD_TRIGGER_READING`'s own case, research 211 §10.4) and the launcher's timer through its lower
(`KIT_TIMER_TICK_READING`), which GR-1 did not exercise; the no-round outcome above.

## 8. Evidence, apart

- Source inspection: the decompilation (the lines cited) and the ELF's strings (the addresses in the header); the
  committed goldens read as JSON; the port's source read. No capture, no browser run, no unit test run, no dev-disc test
  run, no reader run, no node process. Nothing here is proven.
- The build (NU-8a, 2026-10-14), apart from the read: unit tests (vitest) of B1 on the raise, on `Play` with a stand-in
  walk and on `./matchThrow` mounted over a real `Play` (`weaponRaise.test.ts`), and of the pop's frame on the animator
  (`animator.test.ts`); T1's pins over the golden, a dev-disc test over the tracked `READERC.ZAR` and a unit test of
  the page's part (`throwClipRules.test.ts`); no browser run, no capture. They hold the transcription, not the original
  running.
- THROW-INTERRUPT (2026-10-16), apart from the read of §2.4: unit tests (vitest) of the page's thrower on a stand-in
  body (`throwInterrupt.test.ts`), of the part mounted on fakes (`matchThrow.test.ts`), and of the room on the flat map
  (`roomThrowInterrupt.test.ts`); no browser run, no capture. They hold the transcription, not the original running.
- NU-8b (2026-10-16), apart: unit tests (vitest) of the animator on synthetic clips with the real mover
  (`animator.test.ts`: B2's crouch-walk and prone crawl, B3's placings), of the part mounted on a real mover and
  animator (`matchThrow.test.ts`: B3's death cut, B4's take-up), of the bomb's lending (`bombPage.test.ts`) and of
  `throwPoseEnds` (`effectiveAction.test.ts`); no browser run, no capture. They hold the transcription, not the original
  running.
- GR-1 (2026-11-09, §7.2), apart: a live memory trace of the original running (PINE, r0004 on PCSX2 2.8.2, the
  MARK141 for the M67), compared value for value by a reader who wrote neither the readings nor the capture; no browser
  run, no unit test run against it, no harness spec or golden trace. What it proves is §7.2's table at its trial counts.
- What a reviewer should re-read first: §1.1 and §1.6 (the raise's three calls and the idle branch's 'y' test, D:L453568,
  D:L453598-453600, D:L453520, D:L453484-453488, D:L453633-453634), §2.3 (the two state handlers' pushes), and R326.4's
  reliance on research 324 for the instance list.
