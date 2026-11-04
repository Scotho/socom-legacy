# 238 -- The hostage as built: the body and the AI (web sprint 31, HX-2 and HX-3)

- Date: 2026-10-06 (web sprint 31, wave 1). HX-2, the hostage body (§1, §3, §5's HX-2 rows, §6, §7): the third body
  family off `chartype.rdr`'s `escortees`, the No_weapon set's clips with V6's root travel, the TEAMMATE deaths, the
  voices, the rescued fade, the room's hit volumes and the health read. HX-3, the hostage AI on the server (§2 and its §5
  rows), writes its own sections in its own commit (the stubs below are its places). 2026-10-07: §8, the hit blood the
  owner's playtest found "way off" (`bullet_hit_person`'s range test, every body's).
- Status: **reading, pending review.** Every value below is a read of the disc (`READERC.ZAR`'s `character.rdr`,
  `animset.rdr`, `motion.rdr`, `damanim.rdr`; MP6's `READERM.ZAR/chartype.rdr`, `CLIB_MDL.ZED`, `CLIB_GEO.ZED`;
  `MOTION_P.ZAR`) through the port's decoders, or of the decompilation (`D:L<n>` of `socom2_game.elf.decomp.c` r0001),
  re-read by this task's implementer. **No hostage behaviour has been measured on a running console** (research 207
  L20-21): nothing here is parity; capture C2 is the last gate. The digests' PROVEN/STRONG map to reading (research 206).
- Sources: research [189](189-h1-hostage-ai-animation.md) #9, #11-#14, §2, §5-§7, §14.11 (V2's decoder);
  [199](199-h4-hostage-closures.md) §2, §3, §8-§9, §12.3-§12.4, §12.9-§12.10 (V5); [206](206-verification-overrides-and-the-waves-close.md)
  §2 (V6's root travel, overriding 189 §7's "travel 0"); [207](207-hostage-mode-desert-glory.md) §4.5; the plan
  `docs/plans/2026-10-06-hostage-and-modes.md` (rulings HX.R1-HX.R8, proposed).
- Code (HX-2): `packages/scene/src/character.ts` (`CharacterTeam`, `teamCharacter`'s `escortees`, `healthOf`,
  `HOSTAGE_HEALTH_READING`); `packages/viewer/src/body.ts` (`loadBody`/`mapPlayer` take `escortees`,
  `LoadedBody.textureAsset`, `HOSTAGE_MODELS_READING`); `packages/viewer/src/loadMap.ts` (`types.escortees`, their
  textures and transferables); `packages/viewer/src/teamBody.ts` (`MapBodies.types.escortees`, `escorteeBody`,
  `hitBodiesOfPage`'s `escortees`); `packages/viewer/src/locomotion.ts` (`CIV_ANIMS`, `CIV_SETS`, `AnimSet`,
  `SEAL_ANIM_SET`, `CIV_ANIM_SET`, `setsOf`, `MOTION_CLIPS`, the five readings); `packages/viewer/src/animator.ts`
  (`AnimatorOptions.anims`; `PLAY_CLIPS` once each); `packages/viewer/src/play.ts` (`setAnimSet`);
  `packages/viewer/src/remotePlayers.ts` (`setEscortee`, `setOpacity`, `animStats`, `escorteeSnapshot`);
  `packages/viewer/src/bodyView.ts` (`setOpacity`); `packages/viewer/src/net/escortee.ts` (new: the fade, the hidden
  rule, the hands byte); `packages/viewer/src/net/deaths.ts` (`deathClip`'s `teammate` family, the two readings,
  `DEATH_CLIPS`); `packages/viewer/src/soundData.ts` (`escorteeVoicesOf`, `SoundData.escorteeVoices`,
  `HOSTAGE_VOICES_READING`); `packages/viewer/src/simMap.ts` (`ESCORTEE_IDLE_CLIPS`, `TypeSkeletons.escortees`);
  `packages/match/src/server.ts` (the type, the log line); `packages/match/src/room.ts` (`TeamHitBodies.escortees`,
  `volumesOf({ escortee })`).
- Tests (HX-2): `packages/scene/test/character.test.ts`, `packages/viewer/test/body.test.ts`,
  `packages/viewer/test/locomotion.test.ts`, `packages/viewer/test/remoteEscortee.test.ts` (new),
  `packages/viewer/test/deaths.test.ts` (new), `packages/viewer/test/deathVoice.test.ts`,
  `packages/viewer/test/simMap.test.ts`, `packages/match/test/roomDamage.test.ts`. Registry `character.json`'s
  `character.hostage.*`.

## 0. The answers

- **The body.** A hostage is `chartype.rdr`'s `escortees` entry -- MP6 lists `mp_fem1-3` (Hostage1-3), no other
  fixture map lists any -- dressed as `character.rdr` says: `thai_biologist01`, `thai_biologist02`, `thai_wife`, each
  `texture_asset` `thcivpow`, parent `mp_hostage_extract` (its `default_gear` the two eyes). Their skeletons carry the
  SEAL's 26 part names, parents and order (read here mesh by mesh, which V2 had not done): the port's skinning, clips
  and capsules apply unchanged.
- **The clips.** The No_weapon set's ten, played through the port's `motionOf` with their own root travel and K (V6:
  11.72 / 25.00 / 40.62, K 5.97 / 2.93 / 1.81) and picked by their own bands (0-29, 12-56, 34-65 u/s).
- **The death** is the TEAMMATE list's by stance, a limb hit BODY STAND's first in every stance (the decomp, §1.5: the
  digests' "the stance's default" read as STAND's). **The flinch** is the players' lists. **The voices** are three
  (YES, DAMAGE, DEATH). **The fade** is 0.75 a second, then inactive. **The health** is `mp_hostage_extract`'s, read.

## 1. The body as built

### 1.1 The family

`teamCharacter(chartype, 'escortees', i)` reads the `escortees` list as the two sides' (`FUN_0053b5f0` D:L405207-405245
finds an entry by name without case; `armoryCharacters.ts:23` cites the same lookup). `loadBody(..., 'escortees', i)`
decodes the mesh, the skeleton and the default gear through the sides' path; with no entry (or no `character.rdr`) it
returns null -- a hostage is never drawn as the fallback SEAL. `loadMap` loads one body per entry it reads (three on MP6,
none elsewhere: never assumed), a character named twice sharing its body, their textures with the rest, their buffers in
the transfer list (`LoadedMap.types.escortees`).

| model | character | LOD 0 vertices | LOD copies (character.rdr `lods`) |
|---|---|---|---|
| `thai_biologist01` | `mp_fem1` | 3,292 | `_1` 160, `_2` 260 |
| `thai_biologist02` | `mp_fem2` | 3,358 | `_1` 160, `_2` 260 |
| `thai_wife` | `mp_fem3` | 3,459 | `_1` 150, `_2` 250 |

The port's `buildBody` draws LOD 0 only, for every body, the players' included: the LOD distances are recorded, not used
(`HOSTAGE_LOD_READING`, note only).

### 1.2 The clips

`animset.rdr`'s `No_weapon anim set` (`mp_hostage_extract`'s `anim_set`): Stand `civ_stand` (its `conversation` mode
`conv_stand01/02` is SINGLEPLAYER's and not in `MOTION_P.ZAR`), Stand -> Crouch `civ_stand2crouch`, Crouch `civ_crouch`,
Walk / Jog / Run `civ_walk` / `civ_jog` / `civ_run`, Walk backwards `civ_walk_bw`, Strafe right / left `civ_rstep` /
`civ_lstep`, Step `civ_step`; it includes `GLOBAL` and names no Prone. The ten join `MOTION_CLIPS` (so the page's clip
request carries them: `PLAY_CLIPS`, now once each since `layerName` leaves a `civ_*` name as it is).

| clip | seconds / keys | motion.rdr | D, K (V6) | band (u/s) |
|---|---|---|---|---|
| `civ_stand` | 0.2333 / 7 | loop, playback 4.6, max_velocity -0.1 | -- | (0-1) |
| `civ_stand2crouch` | 0.4000 / 12 | one-shot, playback 0.65, NoFire, NoPitchtwist | -- | -- |
| `civ_crouch` | 1.4000 / 42 | loop, playback 5.06, BlendTime 0.5 | -- | -- |
| `civ_walk` | 0.7000 / 21 | loop, max_velocity 6.5 | 11.72, 5.97 | 0-29 |
| `civ_jog` | 0.7333 / 22 | loop, max_velocity 6.5 | 25.00, 2.93 | 12-56 |
| `civ_run` | 0.7333 / 22 | loop, max_velocity 6.5 | 40.62, 1.81 | 34-65 |
| `civ_walk_bw` | 0.5333 / 16 | loop, max_velocity 1.1 | 13.85, 3.85 | 0-11 |
| `civ_rstep` | 1.0000 / 30 | loop, playback 1.2, max_velocity 0.8 | 6.41, 13.00 | 0-8 |
| `civ_lstep` | 0.7667 / 23 | loop, playback 1.2, max_velocity 0.8 | 4.99, 12.81 | 0-8 |
| `civ_step` | 0.2667 / 8 | loop, playback 0.65, max_velocity -1, BlendTime 0.6 | -- | (0-0.5) |

The sets (`CIV_SETS`) are the builder's (`FUN_005e0030` D:L494315-494470): forward walk, jog, run; back `civ_walk_bw`;
right `civ_rstep`; left `civ_lstep`; no crouch walk. The tops (`FUN_005e0450` D:L494498-494627; 199 §3's
`[65, 11, 8, 8, 0, ...]`) are 65 ahead, 11 back, 8 aside, 0 crouched. A play is told its set (`AnimatorOptions.anims`,
`Play.setAnimSet`): the idles, the crouch's one idle, the turn step and the stance change come from it; the jumps, the
falls, the swaps and the hits stay the Seal set's, which a hostage never asks for.

### 1.3 The bands and the travel

The bands are `transition_speed_A/B` x 10, read off the table by `bandPick` as the SEAL's are: at 20 u/s `civ_walk`
leads (0.53, `civ_jog` 0.47), at 40 `civ_jog` (0.73, `civ_run` 0.27), at 60 `civ_run` alone; every node's root at the
commanded speed (`speed x D / T` = v). V6's travel (206 §2) is the clips' own: `motionOf` reads it off the clip, and
`CIV_ROOT_TRAVEL_READING` pins the read values in a test, overriding nothing.

### 1.4 The voices

`mp_fem1-3` name three slots of their own -- `CHRSND_DEATH` `.FEMALE_DEATH`, `CHRSND_DAMAGE` `.FEMALE_DAMAGE`,
`CHRSND_YES` `^CO_0343` -- and `mp_hostage_extract` names none, so RESTRAINED, HELPME, PANIC, WAIT_UP, NO and
DEATH_QUIET are null and play nothing (`FUN_0053b710` D:L405260-405266; the tables zeroed D:L406662-406663 and copied
from the parent D:L406771-406772). The slots resolve by a player's rule (`FUN_0053c200`: the name when the map's script
files it, else `MALE_DAMAGE` / `DEATH_SOUNDS` when filed, else none; `characterVoicesOf`'s), and **on MP6 that leaves
the hostage silent when hurt or killed**: `.FEMALE_DAMAGE` and `.FEMALE_DEATH` are filed by no block MP6 loads -- only
the `_vc` banks of the maps with a female team character hold them (MP51, MP52, MP53, MP61-MP64, MP71-MP73, MP81-MP83;
`MP6_vc.bnk` does not) -- nor are the two fallbacks, so the handles are null, as Desert Glory's `mp_terror3_alg`'s
`.DEATH` is. YES, `^CO_0343`, is the `HOSTAGE` group's line (`DYNAMIC_WEIGHTS` 0.05 over `^*CO_0343A-C`): three streams
`CO_0343A.VAG`-`CO_0343C.VAG` in the `HOSTAGE` block, which MP6 loads (`missionSoundBlocks`) -- a stream, not a bank
sound, so it is never asked of the banks (the review of b08e7cd6 found "no bank holds ^CO_0343" in `missing`: fixed).
`HOSTAGE_VOICES_READING.mp6` pins `{ damage: null, death: null, yes: '^CO_0343' }`, the disc test the whole chain.
`escorteeVoicesOf` gives one entry an escortee; `soundFromDisc` carries them as `SoundData.escorteeVoices` beside the
sides' `characterVoices` (whose shape is unchanged) and asks the banks for the DAMAGE and DEATH names only. Which page plays them (the death voice
at the body on a hostage's `kill`, the YES on an order) is HX-1's and HX-4a's: `audio.ts` reads the sides' voices only
today and is held this sprint (§6). Whoever wires it: on MP6 the death and hurt are silent by the original's own rule, and
the YES goes through the stream path (`readSoundStreams`, as the round's `^PH_*` lines), not `GameAudio.has`.

### 1.5 The death and the flinch

`FUN_005a0950` (D:L458898-458960) takes the 0x44d050 table (`FUN_005a44f0` loads it from `damanim.rdr`'s
`TEAMMATE_HEAD_DEATH_ANIMATIONS` and `TEAMMATE_BODY_DEATH_ANIMATIONS`) when the victim is no local human and shares a
`+200` bit with the local player (D:L458919): the hostage's 0xC0020000 shares one with every side. A head or body hit
draws `rand() % count` of the stance's row (D:L458919-458939): standing `death_buddy_stand01/02/03` (1.5000 / 45,
0.6333 / 19, 1.3000 / 39 s / keys; playback 4.9, 3, 4.8), crouched `death_buddy_crouch01` (1.1333 / 34, 4.2), prone
`death_buddy_prone01` (0.9000 / 27, 4.05). **A limb's row is empty** (only HEAD and BODY are loaded), so its count is 0
and the branch jumps to `LAB_005a0b20`: `sVar6 = *DAT_0044cee4` (D:L458957-458959), the first entry of the players' BODY
STAND list -- `death_stand_chest01` ("Die") -- in every stance. 189 §5 and the dispatch say "the stance's default"; the
decomp gives STAND's whatever the stance, and the port follows the decomp. A blast kills prone in the same picker
(`FUN_0057e770` L441013-441015), so prone it is `death_buddy_prone01`. Prone excepted, the hostage is thrown (below;
research 237, corrected 2026-10-23), and the death function picks no clip for an explosion (cause 4, research 91
§3: `FUN_005a54d0` D:L461384-461390 calls `FUN_005a0700` and `FUN_005a2690` only for a cause other than 4 and 7).
*Corrected 2026-10-23 (the #389 takeover's fresh review; re-read by the gameplay seat):* a standing or crouched
hostage IS thrown -- the knock `FUN_0057e770` is the body's own code -- the body's per-frame `FUN_005506a0` calls its blast handler `FUN_005a0e70` (D:L417906), which calls `FUN_0057e770` whenever the body's controller is local (`+0x34` false, D:L459307-459311): on the host a hostage's (`CSealCtrlAi`, 191; a `CZSealBody`, 193 §8.1) -- a dead body not prone by side (`FUN_005807d0` kind 8, D:L440999-441001,
D:L441040-441051): Fall, then at the landing Land, no get-up. `HOSTAGE_BLAST_DEATH_READING` = "the knock's clips":
no death-list clip standing or crouched (the kill's clip null, as a player's), prone `death_buddy_prone01`; the
hostage's knock: `HostageFollow.knock` (LATER 354; reading, pending review). Was: "not thrown, so the corpse stays in its idle" (the takeover's
first cut, and the choice it put to the owner) and #389's "the stance's TEAMMATE row" -- neither a read path.
`deathClip(cause, part, stance, random, 'teammate')` is the room's picker for a hostage (HX-1 calls it); the players'
lists are byte-identical.

`damanim.rdr` has no TEAMMATE flinch rows: a hostage flinches in the players' lists (`flinchClip`), its names resolved
through the No_weapon set's `GLOBAL` include.

### 1.6 The fade

`CAiSRescued::Tick` sub-state 2 (`FUN_00559070` D:L422191-422212): the body node's `+0x9c` (`m_Opacity`) moves toward 0
by dt x 0.75, clamped to [0, 1] (`FUN_00539b70`), then the node's vt(+0x60)+0x38 `SetActive(opacity != 0)`. The AI word
carries it as nibble 24-27, (1 - opacity) x 15 as an integer (`FUN_001b3648`), 15 when inactive (D:L432905-432913), read
back as 1 - n / 15 with `SetActive(n != 15)` (D:L432833-432834). Every console fades its own copy: at most 1.33 s. An
inactive node leaves every grid ray query (`FUN_002d6260` D:L176893, `FUN_002d61b0` D:L176837). The page:
`RemotePlayers.setOpacity(id, opacity, fading)` keeps the opacity by id; `fading` runs it down at 0.75 a second
(`fadeStep`); the body's own materials (made per body by `buildBody`) take it while under 1, their colour blended by the
source's alpha (SrcAlpha, OneMinusSrcAlpha) with no depth written and the canvas's alpha factors kept -- `buildBody`'s
opaque draw is a copy (One, Zero), under which an opacity shows nothing (the review of b08e7cd6: fixed) -- and each back
to its own blend at 1 (`BodyView.setOpacity`); at 0 the body is hidden and leaves the page's aim
(`aimDistance` skips a hidden body). The room's side of the fade (the rescue, the hit refused once inactive) is HX-5's
and HX-1's.

### 1.7 The health

`healthOf(table, character)` reads `health` and `armor` through the base chain: `mp_fem1-3` state none and take
`mp_hostage_extract`'s -- head 8, body 40, larm and rarm 10, lleg and rleg 15, armour 0 on every part (strength 4,
recovery 2). The same read gives `mp6_seal1` the port's `MP_HEALTH` (8 / 50 / 30) and armour 25 off the head. HX-1's
hit path reads the table (`HOSTAGE_HEALTH_READING` names the character it is read from) rather than a literal.

### 1.8 The room's hit volumes

`simSkeletonsFromBytes` builds `TypeSkeletons.escortees` -- one skeleton an entry, a model shared as the sides' are --
at the No_weapon set's idles (`ESCORTEE_IDLE_CLIPS`: `civ_stand`, `civ_crouch`, no prone: a prone hostage would stand in
the bind pose; the AI never lays one down, 199 §9); `loadSimSkeletons` carries them to the server (its log line names
the models), and `Room` builds their stance volumes beside the sides'. `volumesOf({ escortee })` gives a hostage its own
skeleton's at its stance, else the first hostage's, else SEAL 1's (the 26 bones are the same, the bind poses are not:
the thai_wife's head capsule stands elsewhere than SEAL 1's). HX-1's hit loops ask for them by the hostage's index; the
page's loopback room gets the same through `hitBodiesOfPage`'s `escortees`.

## 2. The AI on the room (HX-3)

The original's session master runs every hostage's `CSealCtrlAi` and the other consoles draw a remote body (research
191 §1); the port's room is the master (HX.R2). `HostageAi` is that AI, pure: HX-1's hostage step calls
`step(GAME_FRAME_DT, { feet, bodies })` once a game frame from its own accumulator (`AI_FRAME_READING`; the driver
`FUN_005f8030` takes the frame's dt, D:L506884), with the room's seeded random injected. It draws nothing and sends
nothing: HX-1 reads `stance`, `opacity`, `hidden`, `state` and `sub` into the snapshot's body and `hostageState`.

### 2.1 The states

Four states, their ids the original's numbers (the factory `FUN_005f6550` D:L505850-506230): **0x17** `CAiSHostage`
(vt 0x669ab0, D:L506120), **9** `CAiSFollow` (0x6699a0, D:L505987), **0x11** `CAiSRescued` (0x669260, D:L506080),
**2** `CAiSHold` (vt 0x669d30). The spawn (`FUN_00573130` D:L434903-434920, online): `ctrl+0x26c = 4`,
`FUN_00555900(ctrl, 3, 0)` -- 0x17 at sub-state 3 -- then the escortee unit 0x11 (`FUN_005ef2f0(0x11)`,
`FUN_005ee250`, D:L434915-434918) and the compass anchor (`FUN_005434b0(body, 4, 0)`, D:L434920). The port's
constructor does the same (`unit` 0x11, `anchored`).

`enterHostage(sub)` is `FUN_00555900` (D:L420206-420275): sub-state 3 needs an escortee online (the offline restrain
bit aside, D:L420221-420230), the others an escortee with 0x17 on the stack or admitted by the gate (D:L420232-420238);
with 0x17 on the stack it unwinds to it (D:L420253), else it unwinds to 6 or 1 or clears the stack (D:L420241-420250)
and pushes 0x17 (D:L420262); the sub-state is set (its time zeroed when it changes), the timer stopped.

### 2.2 The sub-states and the timers (`CAiSHostage::Tick`, `FUN_00601910` D:L511764-511910)

While a timer runs (`FUN_005f61e0` D:L505794-505818: the frame dt subtracted from `+0x40`) the Tick does nothing else;
the frame it runs out sets the next sub-state and runs its case at once. `FUN_005f62c0(delay, state, next)`
(D:L505832-505851) with 0 sets the sub-state now.

| sub | what the Tick does (online) | line |
|---|---|---|
| 0 | -> 2 at once | D:L511810-511812 |
| 1 | ClearRoute, AllStop(1), prone with the default delay; 10 s -> 5 (unreachable online: 189 §14.5) | D:L511814-511819 |
| 2 | AI mode IDLE, crouch with the default delay; 5 s -> 5 | D:L511820-511825 |
| 3 | RESTRAINED (0x4b) at 1.0 -- silent, no MP record defines it (199 §8); in unit 0x11 stand now, 2 s -> 2; else prone after 0.15 s, 0.5 s -> 4 | D:L511826-511837 |
| 4 | rest, no case | -- |
| 5 | the watch (§2.3) | D:L511865-511894 |
| 6 | crouch with the default delay; 10 s -> 5 | D:L511896-511899 |

So a spawned hostage stands, after 2 s (60 game frames) enters sub-state 2 and asks the crouch, which lands after the
default stance delay -- 0.25 + U(0, 0.95) s (`FUN_00563100` D:L427285-427300), counted down by the post-tick
`FUN_0056f970` (D:L432948-432953: dt subtracted while the asked stance differs, applied below 0) -- and 5 s (150
frames) later enters sub-state 5 for good. HOLD (§2.5) re-enters sub-state 2, so a held hostage crouches and watches
again.

### 2.3 The watch (sub-state 5)

The watch runs while `(int)(t x 10) % (int)(T x 10) == 0` (`FUN_005f6270` D:L505822-505828), `t` the stack's running
time (`ctrl+0x434`: the driver adds dt after each Tick, D:L506919; every activation zeroes it, D:L506356), `T` 5 s (3 s
with the state's flag bit 1, D:L511866-511871): every frame of a 0.1 s window every 5 s, about three frames at 30 Hz
(189 §14.4 correction 4 -- not a one-shot). In the window `FUN_00569c60(body, 250, 0, 0, 0)` (D:L430176-430218) takes
the first living type-2 body of the hostage's neighbour list within 250 -- the nearest, of any side, other hostages
included -- and `FUN_00601200` (D:L511496-511520) looks at it only when its horizontal distance squared is at least
100 (`DAT_00650da0`, D:L511517): a nearest body closer than 10 u records no look, whatever stands behind it. The look
(the CURIOUS head turn, held 5 s, D:L511879-511880) is recorded on the AI (`look`, `lookAt`) and drawn nowhere
(`HOSTAGE_WATCH_LOOK_PLACEHOLDER`: the remote bodies have no head channel).

The cries: PANIC (0x48) when the watched body shares no team bit with the hostage (D:L511882-511884), HELPME (0x49) at
0.15 with flag bit 1 (D:L511887-511889). Online neither happens (`HOSTAGE_CRIES_READING`, V2 #16): the hostage's
0xC0020000 shares bit 30 with the SEALs' 0x40000001 and bit 31 with the Terrorists' 0x80000100, and the three callers
of `FUN_00555900` pass flags 0 (D:L434913, 437711, 450478). The port runs both tests as written, on the bodies' masks.

No AI event reaches it: `FUN_00572d70` zeroes every event mask online (`HOSTAGE_EVENTS_READING`); `onEvent` changes
nothing, so the ShotAt (0x13) push 0x17 would admit in sub-state 5 never comes.

### 2.4 The stack and its masks

`AiStack` is `ctrl+0x41c`, its moves the original's, each recomputing the masks (`FUN_005f7470` D:L506410-506591):

| move | function | what it does |
|---|---|---|
| Push | `FUN_005f5c00` -> `FUN_005f7ee0` D:L506832-506867 | the gate; the top suspended (signal 2); the new state activated (signal 0) |
| Replace | `FUN_005f5ba0` -> `FUN_005f7d80` D:L506781-506827 | the gate; the top ended (signal 1) and deleted; the new state activated |
| UnwindTo | `FUN_005f5c80` -> `FUN_005f7b10` D:L506689-506728 | pops until the top is `id`, only when `id` is on the stack |
| Pop | `FUN_005f7c40` D:L506733-506776 | signal 1 to the top, deleted, signal 3 (resume) to the next |
| ClearStack | `FUN_005f5f20` D:L505663-505679 | the whole stack only on force or a dead body; else the masks recomputed, **nothing popped** (199 §1 correction 1) |
| the driver | `FUN_005f8030` D:L506872-506930 | a top whose `+0x4a` bit 1 is clear is popped, nothing ticks that frame; else the Tick runs, then the stack's and the state's times take dt |

The gate `FUN_005f5cd0` (D:L505594-505658): 0x12 always; the body alive (D:L505611); the id in `+0x428`, the AND of
the allowed-next masks of every state on the stack (D:L505621-505624); not the top's id (D:L505625-505626); the top's
CanPushAiState (D:L505650-505654). Signal 0 (`FUN_005f6fa0` D:L506330-506357) zeroes the state's fields, sets its
live bit, calls OnSignal(4) then OnSignal(0).

The masks (`AI_STACK_MASKS_READING`; the switch D:L506481-506571): 0x17 `0x190f4bc0` (D:L506552; 9 and 0x11 in; 1, 2,
0x17 out), 9 `0x1ffffdfe` (D:L506510), 0x11 `0x190c48c6` (D:L506534; bits 1, 2, 6, 7, 11, 14, 18, 19, 24, 27, 28 --
V5's correction, 199 §12.2: no 9, no 0x17, no 0x11), 2 `0x3ffffffa` (D:L506489). The CanPush slots: CAiSHostage
(0x601ec0) refuses 0x10 and admits 0x13 only in sub-states 5 and 6; the other three `return 1` (0x555390). The empty
stack's top is the static `DAT_0066b990` (D:L505613), id and CanPush unread: the port's empty stack admits any push.
Not modelled: the gate's `+0x265` controller flags and `+0x430` bit 2 (set only with state 1 on the stack).

### 2.5 The hooks HX-4a and HX-5 call

| hook | the original's moves | caller |
|---|---|---|
| `follow(leader)` | OnCommand case 4 (D:L450351-450410): ClearStack(0) (D:L450385); 9 kept on top or pushed (D:L450393); the leader recorded on 9 | HX-4a (adds the gates, the unit, YES, the radio, `FUN_005fd010`) |
| `hold(issuer)` | case 5 (D:L450465-450540): ClearStack(0) (D:L450473); `FUN_00555900(ctrl, 2)` (D:L450478) and the issuer recorded (`FUN_00601e50`, D:L450521); else UnwindTo(6), else Replace by 2 (D:L450480-450482) | HX-4a (adds YES and unit 0x11) |
| `releaseFollow()` | `ControlHostageAction(ai, 0)` (`FUN_005fcf10` D:L509476-509527) clears the follow state's live bit; the driver pops 9 next frame; 0x17 resumes where it was | HX-4a (the leader's death or departure) |
| `rescue(rescuer)` | the post-tick's Replace by 0x11 (`FUN_0056f970` D:L432975), refused while 0x11 is on top | HX-5 (the zone test, the credit) |
| `stack` | `push`, `replace`, `unwindTo`, `pop`, `clear`, `canPush(id, flags)`, `has`, `find`, `top`, `ids`, `allowedMask`, `presentMask` | 199 §1's replay runs on it unchanged |
| `signal` option | every signal, after the state's own (`(state, 0 | 1 | 2 | 3)`) | HX-4a: Follow's end (signal 1) drops the leader's count |

199 §1's replay on these: spawn [0x17]; FOLLOW [9, 0x17]; the rescue Replace [0x11, 0x17]; HOLD unwinds to [0x17]
sub-state 2; the next rescue Replace [0x11]; FOLLOW's push 9 refused by 0x11's mask; HOLD's `FUN_00555900` refused
(0x17 neither present nor admitted) -> Replace by 2 -> [2]; the next rescue [0x11]. Every step is the hooks' own
gate; the test "the masks ..." holds the [0x11] row.

### 2.6 The stubs

- **State 9's stationary stub is superseded** (HF-FOLLOW, 2026-10-17): the shared planner and physical follower are
  [research 333](333-hostage-follow-pathing.md) and [research 334](334-hostage-follow-motion.md). The initial
  trail phase mirrors stance; afterwards an escortee asks stand (`FUN_005fc590` D:L509159, D:L509203-509205).
  Remaining controller, physical actor-contact/delayed-yield and vehicle-binding limitations are named in research 334-335; normal route steering, live-actor occupancy stamps, actor-probe stops and recovery lifecycle are built.
- **State 0x11's fade clock** (`HOSTAGE_FADE_READING`, `RESCUED_SIGNAL_READING`): OnSignal(0) online sets sub-state 2
  at once (`FUN_005594b0` D:L422309-422313), frees the compass anchor (D:L422308), sets body `+0x105c` bit 3
  (D:L422314) and skips case 0's rejoin of unit 0x11 (D:L422179-422184); sub-state 2 moves the node's opacity toward 0
  at 0.75/s, clamped (D:L422198-422203), and sets the node inactive at 0 (D:L422207): hidden after 40 game frames
  (1.335 s; 1 / 0.75 = 1.33 s at most in continuous time). The opacity is the body's, so a popped and re-entered 0x11
  continues it (199 §1). The offline self-pop (D:L422208-422211) never runs online.
- **State 2** (`HOLD_STATE_TICK_PLACEHOLDER`): its Tick is unread; it lives one frame in the replay.
- **Cower** (`COWER_START_READING`): `Hostage_start` runs on the host at each level start and round restart
  (`FUN_002a7d40` D:L149744-149746; `FUN_00223680` D:L75920-75935; 199 §12.8, V5: H4-7 WRONG), its anim instance
  started before the script-state push 0x17's mask refuses; not built -- the port's crouch is the state machine's; the
  visible effect is owed (§7).
- **A dead hostage** is not stepped (HX-1 clears `alive`); the gate refuses every push and ClearStack(0) clears it.


*(HX-3's section: the sub-states, the timers, the watch, the stack and its masks, the stubs -- written in its own commit.)*

## 3. What a remote draws

The room names a hostage's id (HX-1: the welcome's `hostages` list, `hostageState`); the page calls
`remote.setEscortee(id, character)` (or an index) and `remote.setOpacity(id, opacity, rescued)`. The body is drawn
by 199 §9's table as the port makes it (`escorteeSnapshot`):

| original (199 §9, §12.10) | the port's remote |
|---|---|
| 0x17 sub 3: `civ_stand` | stance code 0, speed under the dead stick: `civ_stand` |
| sub 2 / 5: `civ_stand2crouch` once, then `civ_crouch` | stance code 0 -> 1: the transition as a one-shot action (its `oneShotSeconds`), then `civ_crouch`; first seen crouched: `civ_crouch` |
| state 9, stance 0, `civ_walk/jog/run` by speed | stance 0 and moving: speed / 65 through `bandPick` over `CIV_SETS` (the snapshot's `vx`, `vz`) |
| 0x11: stands, stops, fades | the fade (§1.6); the stance and speed as above |
| the hands byte 0x7e -> `FUN_005dfe30` | ignored (`HOSTAGE_HANDS_PLACEHOLDER`): no weapon hung, no raise, no binoculars |

A getting-up hostage cross-fades straight to `civ_stand` (`HOSTAGE_CROUCH_CLIP_READING`: the set names no Crouch ->
Stand). A death plays the room's clip (`died`), a flinch the room's (`flinch`), as a player's. A hostage hears no
footfalls (the `civ_*` clips carry no step callbacks), and takes no slot of the page's three heard footfalls
(`footfallsHeard` is given the bodies without the escortees; the fix round of b08e7cd6: on MP6 the three stand together
and would have silenced the players' steps near them). As of HF (2026-10-17), the room follows through the shared planner and physical mover (research 333-334); full steering remains a named gap.

## 4. The wire

Nothing of its own: HX-1's snapshot body and `hostageState` carry the AI's `stance`, `state`, `opacity`.


Nothing of HX-2's: the hostage's body is one more `BodyState` of the snapshot's list (HX-1, ruling HX.R7), its id and its
character from HX-1's welcome list and `hostageState`.

## 5. Readings and placeholders

| name | where | status |
|---|---|---|
| `HOSTAGE_TIMERS_READING` | server `hostageAi.ts` | `{ restrained: 2, hold: 5, getDown: 10, crouch: 10, rest: 0.5, proneDelay: 0.15 }` s: `FUN_00601910`'s `FUN_005f62c0` operands (D:L511818, 511824, 511831-511836, 511898; 189 s2, s14.4). Owed: C2 (the first 2 s on the host) |
| `HOSTAGE_WATCH_READING` | server `hostageAi.ts` | `{ range: 250, period: 5, window: 0.1, minDist2: 100 }`: D:L511874, D:L511867, `FUN_005f6270` D:L505822-505828, `DAT_00650da0` D:L511517 (189 s2, s14.4); the neighbour list's metric is the squared XYZ distance, as the port's 3D one: `FUN_00601910` D:L511865-511880 passes 250 in watch state 5 to `FUN_00569c60`, which compares the squared limit with the sorted neighbour record's `+0x10` (D:L430178-430219), written by `FUN_002a0a10` as the sum of the three squared axes, not XZ alone (D:L145912-145914, 145934-145936; the chain's square root `FUN_002a0120` D:L145572-145579) -- reading, re-read independently (the research reconciliation's chunks 04 and 10, C41); the look's gaze and visibility are not measured (C40) *[2026-10-15, sprint 40 AD-0: was "the neighbour list's metric unread (the port: 3D)"]* |
| `HOSTAGE_WATCH_LOOK_PLACEHOLDER` | server `hostageAi.ts` | `'unseen'`: the CURIOUS look (`FUN_00601200`) recorded on the AI, drawn nowhere: no head-look channel on the wire |
| `HOSTAGE_CRIES_READING` | server `hostageAi.ts` | `'never online'`: PANIC needs no shared team bit, HELPME flag bit 1 (never passed: D:L434913, 437711, 450478); 189 s14.4 (V2 #16), 199 s8 |
| `HOSTAGE_EVENTS_READING` | server `hostageAi.ts` | `'mask 0'`: `FUN_00572d70` zeroes every AI event mask online (189 s2) |
| `STANCE_DELAY_READING` | server `hostageAi.ts` | `{ base: 0.25, spread: 0.95 }` = 0.25 + U(0, 0.95) s, U the room's seeded random (`FUN_00563100` D:L427285-427300; the countdown D:L432948-432953) |
| `AI_STACK_MASKS_READING` | server `hostageAi.ts` (`stateCanPush`) | the four allowed-next masks (D:L506489, 506510, 506534, 506552) and the CanPush slots (0x601ec0; 0x555390), 199 s1, s12.2 |
| `AI_FRAME_READING` | server `hostageAi.ts` | `'game frame'`: the caller steps at `GAME_FRAME_DT` (the driver's dt, D:L506884; research 208) |
| Retired: former stationary follow stub | server `hostageFollow.ts` | Superseded by HF-FOLLOW; research 334-335 own the remaining controller, physical actor-contact/delayed-yield and vehicle-binding gaps; live-actor occupancy stamps are built. |
| `HOSTAGE_FADE_READING` | server `hostageAi.ts` | `{ rate: 0.75 }` /s, clamped [0, 1], hidden at 0 (D:L422191-422212; 199 s2, s12.3). Owed: C2 (the fade time after a rescue) |
| `COWER_START_READING` | server `hostageAi.ts` | `'not built'`: `Hostage_start` runs on the host (199 s12.8); its visible effect owed to C2 |
| `RESCUED_SIGNAL_READING` | server `hostageAi.ts` | `'sub 2 at once'`: 0x11's OnSignal(0) online (D:L422309-422313), no rejoin of unit 0x11 -- the double-credit path (199 s1) |
| `HOLD_STATE_TICK_PLACEHOLDER` | server `hostageAi.ts` | `'idle'`: `CAiSHold`'s Tick unread; one frame in 199 s1's replay |
| `HOSTAGE_MODELS_READING` | `mp_fem1` `thai_biologist01`, `mp_fem2` `thai_biologist02`, `mp_fem3` `thai_wife`, texture `thcivpow` | `character.rdr`, MP6 `chartype.rdr`; 189 #12, §6, §14.11 | reading (HX-2) |
| `HOSTAGE_LOD_READING` | 160 / 260 (the biologists), 150 / 250 (the wife) | `character.rdr` `lods` | *note only*: the port's `buildBody` draws LOD 0 for every body (HX-2) |
| `CIV_CLIPS_READING` | the ten clips' seconds, keys and `motion.rdr` rules (§1.2) | `MOTION_P.ZAR`, `motion.rdr`; 189 §7 | reading (HX-2) |
| `CIV_BANDS_READING` | walk 0-29, jog 12-56, run 34-65 u/s | `FUN_005e0030` D:L494315-494470; 199 §3, §12.4 | reading (HX-2) |
| `CIV_ROOT_TRAVEL_READING` | 11.72 / 25.00 / 40.62 a cycle, K 5.97 / 2.93 / 1.81 | V6, 206 §2 (overrides 189 §7) | reading (HX-2) |
| `HOSTAGE_TOP_SPEED_READING` | 65 ahead, 11 back, 8 aside, 0 crouched | `FUN_005e0450` D:L494498-494627; 199 §3 | reading (HX-2; HX-4b moves the hostage) |
| `HOSTAGE_CROUCH_CLIP_READING` | `civ_stand2crouch` once, then `civ_crouch`; up: straight to `civ_stand` | 199 §9, §12.10 | reading (HX-2); getting up unread |
| `HOSTAGE_DEATH_LIST_READING` | TEAMMATE; a limb BODY STAND's first | `FUN_005a0950` D:L458919-458939, D:L458957-458959 | reading (HX-2) |
| `HOSTAGE_BLAST_DEATH_READING` | `"the knock's clips"` | 238 §1.5; `FUN_005a54d0` D:L461384-461390 (cause 4 no clip; research 91 §3); the knock the body's (`FUN_005506a0` D:L417906 -> `FUN_005a0e70` D:L459307-459311 -> `FUN_0057e770`): dead not prone thrown (`FUN_005807d0` D:L441040-441051, Fall then Land), prone the body row (D:L441003-441015); 237 corrected 2026-10-23. The hostage's knock: `HostageFollow.knock` (LATER 354; reading, pending review) | reading |
| `HOSTAGE_FLINCH_READING` | the players' lists | `damanim.rdr` (no TEAMMATE flinch rows); 189 §5 | reading (HX-2) |
| `HOSTAGE_VOICES_READING` | slots YES, DAMAGE, DEATH; on MP6 DAMAGE and DEATH none (silent), YES `^CO_0343` (the HOSTAGE group's streams `CO_0343A-C`) | `character.rdr`; `FUN_0053b710` D:L405260-405266, `FUN_0053c200`; MP6's `sounds.rdr`, `MP6_vc.bnk`; 199 §8, §12.9 | reading (HX-2, re-valued in its fix round) |
| `HOSTAGE_FADE_READING` | 0.75 a second (<= 1.33 s) | `FUN_00559070` D:L422191-422212 | reading (HX-2) |
| `HOSTAGE_HIDDEN_READING` | inactive at 0: unpicked, unhit, unseen | D:L422203-422212; `FUN_002d6260` D:L176893, `FUN_002d61b0` D:L176837 | reading (HX-2) |
| `HOSTAGE_HANDS_PLACEHOLDER` | ignored | byte 0x7e -> `FUN_005dfe30` untraced (199 §12.10) | placeholder (HX-2); C2 settles it |
| `HOSTAGE_HEALTH_READING` | `mp_hostage_extract`: 8 / 40 / 10 / 10 / 15 / 15, armour 0 | `character.rdr` through `healthOf`; 189 §2, §14.11 | reading (HX-2: the read, not a literal) |

## 6. The wiring owed

None of HX-2's: the bodies are the shared `remote`'s, no held file needs a line. The page's two calls
(`remote.setEscortee`, `remote.setOpacity`) are HX-1's own lines in `netPage.ts`'s welcome and `hostageState` cases
(open, not held). For HX-1 and HX-4a, not HX-2's: a hostage's death and YES voices are in `SoundData.escorteeVoices`;
`audio.ts` (held by FE-SWEEP, 0 lines this sprint) reads only the sides' `characterVoices`, so playing them is a
later line there.

## 7. Owed

- **C2:** the hostage's first 2 s on the host (the Cower), whether byte 0x7e changes its clip (`HOSTAGE_HANDS_PLACEHOLDER`),
  whether a hostage getting up plays `civ_stand2crouch` backwards, and a limb kill's clip in a crouch (STAND's, by the
  decomp).
- **The voices on the page** (§6): `audio.ts`'s read of `escorteeVoices` when it is free; YES through the stream path.
- **The footfall cap and the hostages:** the page leaves the escortees out of the three heard (§3); whether the console's
  `FUN_00552850` (D:L418748-418861) counts them in its `+0xd8` list -- they are actors with no footfall of their own -- is
  unread.
- **The LODs** (`HOSTAGE_LOD_READING`): only if the port's bodies ever draw LODs.

## 8. The blood on a hostage hit (2026-10-07, the owner's Desert Glory playtest)

The owner, on main 003477bc in `/testroom` with two players: "i could see the hostages but their hit blood animation
was way off". Status: **reading, pending review** (the decomp and the disc's data through the port's decoders; no
capture of the original's blood).

**What is the hostage's own, and holds.** Measured on the page's own room (MP6, `?mode=play&map=MP6&devmode`, headless):
the room's hit point lies on the drawn body -- crouched, `to` (1751.49, 57.67, 1179.68) beside the drawn hips (1750.31,
56.34, 1179.84) and spine (1749.78, 57.97, 1178.28); standing (a FOLLOW), `to` (1752.30, 63.65, 1179.68) beside the
hips (1750.29, 62.61, 1179.72). The crouched capsules (`civ_crouch`, the server's `loadSimSkeletons` and the page's
`hitBodiesOfPage` alike: identical, compared in the page) put the head at (-2.1, 8.5, -4.0) off the feet, the drawn
head bone at (-1.67, 8.78, -4.39). The material is PERSON as for any body: the character models carry no collision
polygons of their own (`CLIB_GEO.ZED`'s `thai_*`, `seal_*`, `afg_*` models: no `di` keys), so nothing names a hostage
material. The hit's position, normal (back along the round), timing and material are the players'.

**What was wrong: the blood program's range test, for every body.** `FUN_003c8920` plays the material's impact at the
hit (`FUN_00272bb0(anim, 1, 5 position, 7 normal, 6 velocity)`, D:L319497-319500). MP6's (and every map's)
`bullet_hit_person` opens with `IF RANGE_TEST` flags 0x61, node 1 `camera`, range 16900 (130 squared): within it
`closeup_bloodfx`, else `far_bloodfx`. `FUN_0025de90` (D:L107850-107942) builds two points -- the first the context's
position (0x04) carried through the node at +8 (0x01, `FUN_00310980`), the second the context's position (0x20) through
the node at +9 (0x08), the fixed offsets at +0x0c / +0x18 under 0x02 / 0x10 -- and compares their squared distance by
the first bit set: 0x40 `<`, 0x80 `<=`, 0x100 `>`, 0x200 `>=`, 0x400 `==`, 0x800 `!=`, none never. 0x61 is the camera
against the hit, nearer than 130. The page tested only 0x100 (`>`) and 0x80 (as `<`), so 0x61 never held: **every body
hit at any distance drew the far blood**, which is authored to read from beyond 130:

| source | close (within 130) | far |
|---|---|---|
| `red_flash01/02` | 2 + 2, normal x 5, random +-6, scale 0.8-1.1 | 2 + 2, normal x 9, +-10, scale 1.8-2.1 |
| `red_streak01/02` | 5 + 5, normal x 15, +-8, size 0.10-0.25, scale 0.5-0.7 | 7 + 7, normal x 45, +-16, size 0.2-0.5, scale 1.5-1.7 |
| `dust_spurt_stay_rotate1/2` (one by a coin) | size 0.2-0.4 (to 4-8 units at its scale 20) | size 1.0-1.5 (to 20-30 units) |

The hostages showed it first because the playtest stood beside them; a player hit up close drew the same far set.

**Built.** `effects.ts` `rangeTestHolds` (the comparison) and `Effects.rangePoint` (the two points, through the page's
own node lookup `nodeMatrix`; a node the page does not hold leaves the point as it is, as a null node does at
D:L107880 / D:L107906). The offsets 0x02 / 0x10 are not decoded: no RANGE_TEST of any MP map's `CZANIM.ZAR` or
`MZANIM.ZAR` sets them -- the whole set on the disc is 0x109 (`shell_eject`, `shell_eject_60`, `shell_eject_shotgun`,
`shell_smoke_med`, `shell_smoke_big`: the camera against the caller, farther than 100, unchanged), 0x121 (`camera_shake`:
its node `player`, which the page does not hold, against the blast, farther than 120 or 230), 0x61 (`bullet_hit_person`)
and 0x49 (`raindrops01-04` on MP52, `raindrops_1-4` on MP61: the camera against the instance, nearer than 600). So the fix
also moves two others: MP52's and MP61's rain now take their near branch within 600 of their instance (they took the far
one always), and `camera_shake` now takes its small branch unless the blast is within 120 of the world origin (its
`player` unheld leaves that point at the origin; its motion's node
`camera_effects` is not held either, so nothing shows either way -- `RANGE_TEST`'s `player` is owed to whoever draws the
shake). 0x80 was `<` in the page and is `<=` in the original; no program sets it.

Tests: `packages/viewer/test/effects.test.ts` ("RANGE_TEST: 0x40 <, ...", the comparison),
`packages/viewer/test/confirmedBlood.test.ts` (with `SOCOM_DISC`: MP6's `bullet_hit_person` emits the close set's 15
particles with the camera 30 or 129 from the hit, the far set's 19 at 131 or 200). Evidence kinds apart: unit test,
dev-disc test, source inspection (the decomp, the disc's programs), a rendered headless browser run (the page's own
room, SwiftShader; before and after pictures kept out of git). Not measured: the original's blood on a capture.
