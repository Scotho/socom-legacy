# 233 -- The sound as built, III (web sprint 29, PF-32)

- Date: 2026-10-06 (web sprint 29). PF-32, four small rows under one task (ruling PF.R52): the audio options as
  989snd's group masters for the round's streams and bank one-shots (§1); the `SND_HST_*` headset lines streamed on the
  TV (§2); a `SOUND` 0x200 slot sound stopped or faded when its animation instance stops (§3); the weapon select's
  empty rows and its pulses carried across openings (§4).
- Status: **reading, pending review.** Every value below is a read of the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c` r0001), of the ELF's disassembly as research 186 gives it, or of 989snd's reference source
  (`research/989snd-ziemas/iop/*.c` in the PC project); nothing here is a capture. Research 186 and 181 grade these
  STRONG or PROVEN; under AGENTS.md a source read is a reading until reviewed (research 206).
- Sources: research [186](186-c7-audio-movie.md) s3.1 (STREAM_LEVEL, HEADSET_ROUTE, STOP_ON_EXIT, STREAM_NAME_SLOT)
  and s5; [181](181-c3-combat-hud-effects.md) s3.1 (EMPTY_SLOT_NAME) and s3.4 (PULSE_PHASE);
  [202](202-r2-c3-combat.md) s3.12 (the pulses' Init runs once); [122](122-the-ui-sounds.md) s3, s7, s12;
  [152](152-the-front-ends-music.md) s2, s7; [94](94-the-arsenal.md) (the weapon select's rows and pulses). Ruling
  PF.R52 (the controller, 2026-10-06).
- Code: `packages/sound/src/musicStream.ts` (`GROUP_MASTER_READING`, `TUNER_DEFAULTS`, `groupMasterOf`,
  `groupModifier`, `BANK_GROUP_READING`, `bankGroupOf`), `packages/sound/src/render.ts` (`RenderOptions.modifier`),
  `packages/viewer/src/audio.ts` (`GameAudio.setTuners` / `setTunerVars` / `getTuners`, `tunersOfVars`,
  `SOUND_TUNER_SOURCE_PLACEHOLDER`); `packages/sound/src/headsetQueue.ts` (`HeadsetQueue`, `HEADSET_QUEUE_READING`),
  `packages/sound/src/uiSounds.ts` (`HEADSET_ROUTE_READING`), `packages/viewer/src/uiSoundHost.ts`;
  `packages/ui/src/sounds/uiSoundCues.ts` (`STOP_ON_EXIT_FLAG_READING`, `uiSoundFadeSeconds`, `stopInstance`,
  `STREAM_NAME_SLOT_READING`), `packages/ui/src/zanimRuntime.ts` (`ZAnimHost.instanceStop`),
  `packages/ui/src/uiCommands.ts`, `packages/viewer/src/menuMusic.ts` (`stopSlot`, `fadeSlot`);
  `packages/viewer/src/weaponSelect.ts` (`EMPTY_SLOT_NAME_READING`, `PULSE_PHASE_READING`, `MenuPulses`),
  `packages/viewer/src/weaponExchange.ts`.

## 0. The answers

| question | answer | source |
|---|---|---|
| Which group each audio option masters | SOUND 0, 3, 4, 5, 14; MUSIC 1; DIALOG 2, 6; HEADSET 7; each `SetMasterVolume(g, trunc(v x 1024))` | the tuners' update functions (`tuner_groups.py`), `FUN_0038a040` -> `FUN_003414d0`; 186 s3.1, s5 |
| Where the master enters | before the square law: `(vol x m / 0x400)^2 / 0x7ffe`, halved | 989snd `vol.c` 434-455 (`snd_AdjustVolToGroup`) |
| A round line at DIALOG 0.5 | 2047 / 0x7ffe (0.0625), a quarter of the default's 8190 / 0x7ffe (0.24995); the music unmoved | the square law above; 186 s3.1 |
| A bank one-shot's group | its own sound's `VolGroup` (SFX2 +1): the walk's banks 0, 2, 3, 4, 5, 14; HUDUI's 2 and 14 | 989snd `blocksnd.c` 161, 520; `valloc.c` 304-306 |
| An `SND_HST_*` line offline | queued (20 records), streamed on the TV one at a time, in order | `FUN_0034b6c0` D:L246909-246944; `FUN_0034b910` D:L247006-247015; `FUN_0034afd0`; 186 s3.1 |
| Its level on the TV | its class's group, 2 (DIALOG's master), as any ST line -- not HEADSET's group 7 | `FUN_00342240` D:L241878-241890 |
| An `SND_HST_*` line online | streamed at once, not queued | `DAT_0045a0c1`, `FUN_00343140` D:L242200-242203 |
| A 0x200 slot sound at its instance's end | +4 > 0: FadeOut(+4), detached; else StopSound, freed; no 0x200: plays out | `FUN_0026fd20` D:L118432-118480, from `FUN_0026ff20` D:L118572 |
| The name slot's key | the animation instance and the name (CallMusic and CallMusicOld are two instances) | `FUN_0026d940` D:L117228-117242; 186 s3.1 |
| An empty slot's row; a two-slot item's second | `<NONE>` (EQUIP_NONE, 255) and `-------` (FULL_SLOT, 254); rows past the count blank | `FUN_003c4b40` D:L316433-316449; `FUN_0023e370` D:L88320-88339; 181 s3.1 |
| The pulses at an opening | carried from the last opening: none reset; each set once when the HUD is built | `FUN_00241a90` D:L89868-89880; `FUN_0023cd20` from `FUN_00240e60` D:L89595-89600; 202 s3.12 |

## 1. The masters by group

### 1.1 The map

The four audio options are uiVars `InitSystemTuners` (`FUN_0038a7a0`) makes with their defaults -- `SOUND_VOLUME` 1.0
(D:L282262), `MUSIC_VOLUME` 0.74 (f32 0x3f3d70a4, D:L282287), `DIALOG_VOLUME` 1.0 (D:L282433), `HEADSET_CONTROLLER`
0.75 (D:L282458) -- and each tuner's update function calls 989snd's `SetMasterVolume` on its groups with
`trunc(v x 1024)` (research 186 s3.1, read off the disassembly by `tuner_groups.py`; for MUSIC the call is
`FUN_003414d0(value, 1)` at 0x38a088, `FUN_003414d0` D:L241283-241287). Harry62's saved-masters table at r0004
0x491190 (r0001 0x48ddd0) is a second line for groups 0, 1, 2, 3, 5 and 6. `GROUP_MASTER_READING` is that map;
`streamGroupVolume` reads it, `groupMasterOf` gives the master word, `groupModifier` the voice stage's modifier. A
group no option sets keeps 0x400 (`FUN_00345170`).

The master enters 989snd's voice stage before the square law (`snd_AdjustVolToGroup`, vol.c 446-454:
`new_vol = vol x m_vol / 0x400`, then `new_vol^2 / 0x7ffe`), which the port's `voiceLevel(vol14, modifier)` already
is. So half a master is a quarter of the level: the round line's 23168 at DIALOG 0.5 is 11584, squared and halved
2047 (0.0625 of full scale against the default's 8190, 0.24995). `streamVoiceGains` applies it at the voice, so the
research 186 pins (0.24995, 0.27321) hold at the defaults and move with the option.

### 1.2 As built

- **The streams.** `GameAudio` keeps each stream's group (by class, `streamGroupOf`) and channels and computes
  `roundStreamGains(group, channels, tuners)` at each play, so an option change reaches the next line or cue.
- **The bank one-shots.** 989snd plays a bank sound in its own `SFX2.VolGroup` (blocksnd.c 161 and 520 take it into
  the handler and the voice; valloc.c 304-306 level the voice by it). `bankGroupOf(volGroup)` is that group, and
  `renderSound` takes the group's modifier (`RenderOptions.modifier`) into each voice's `voiceLevel`. On the disc's
  banks (the golden pins `walk-sounds.json`, `hudui.json`): 221 walk sounds in group 0, 27 in 2, 17 in 3 (the steps),
  1 in 4 (`.RINGING_EARS`), 7 in 5 (the beds and gusts), 4 in 14 (the heartbeats); HUDUI's 5 countdowns in 2 and its
  other 19 in 14. Group 2 holds, besides `.DOOR_KICK`, `.JUMP_TO_PRONE` and `.FOOTBOMB`, the shotguns' fire and reload
  sounds (`.JACK_HAM`, `.REM_870`, `.SPAS_12` and their `_M` / `_F` / `_RLD` in MP2's bank), `.SHOTGUN_COCK` and the
  shells, and the launchers' (`.AT_4`, `.RPG_7` -- the LAW fires `.RPG_7` too -- and their reloads, `.ROCKET_BY`): so
  the DIALOG slider lowers the shotguns and the rockets with the lines, as the original's own grouping does, once the
  masters reach a round (s1.3). 989snd keeps 15 groups (`vol.h` `VOL_NUM_GROUPS = 15`): a sound in a group at or past
  15 leaves `snd_AdjustVolToGroup` before the master and the square (vol.c 439-441; the IRX returns early for a group
  over 0xe), so `bankModifier` answers null and the voice is its volume halved (`groupStage`) whatever the options; no
  disc bank's sound sits there. `BANK_GROUP_READING` (SOUND's 0) stands in only for a negative `VolGroup` (a signed
  byte), which 989snd's test would let through to an undefined `gMasterVol` index; no disc bank has one.
- **`setTuners(t | () => t)`**: a value, or a source read at each play (the options move the masters the moment they
  change). `setTunerVars(() => vars)` reads the four off a `UiVarManager` (`tunersOfVars`: a `real` var's value, else
  the default, as `frontEnd.ts`'s `musicVolume` reads `MUSIC_VOLUME`). `restart`'s one render a name is kept per
  master. At `TUNER_DEFAULTS` nothing changes (the tests compare the samples).
- **Levelled since 2026-10-29 (`LOOP_MASTER_READING`, closed; reading, pending review):** the ambience's beds and
  emitters and the ladder slide, rendered once as loops at the 0x400 modifier (the worker's `setLoops`), play at
  `(m / 0x400)^2` of their render (`loopMasterGain`, `voiceLevel`'s square law), re-read each frame -- 989snd `vol.c` 125: `snd_SetMasterVolume` calls `snd_AdjustAllChannelsMasterVolume`, re-levelling the voices already sounding (read in the desktop's 989snd reference).
  Their one-shot layers (`play`) took it already. Found by the owner's playtest: "the background wooshing sound was
  not connected to the sound slider".

### 1.3 Which values reach a round (`SOUND_TUNER_SOURCE_PLACEHOLDER`)

The OPTIONS dialog's sliders write the session's uiVars. The front end's own `GameAudio` (`mountFrontEnd`'s `audio`,
which plays HUDUI) can follow them with one line (s6). *(Updated 2026-10-11, PARITY-2 PAR-36 (b).)* The menu match's
round audio reads the session's uiVars (`frontEnd.ts:598`, `game.setTunerVars`), and `/testroom`'s (`main.ts`) reads
the page card's `CUIVarManager` module restored over `InitSystemTuners`' defaults, as the session restores it
(`matchOptions.ts` `cardTunerVars`); a page with no card (`?map=` on a fresh browser) still starts at the defaults
(`SOUND_TUNER_SOURCE_PLACEHOLDER = 'defaults'`). Whether the pause menu's values reach a round as well stays the
owner's (H114; PF.R52, research 233 s6).

## 2. The headset lines on the TV

### 2.1 The queue and the drain

`FUN_00343140` (D:L242200-242203) hands an ST entry carrying `HS` -- the 12 `SND_HST_01..12` of `UIVOICE` -- while
`DAT_0045a0c1` ("is online") is 0 to the Headset object's `FUN_0034b6c0` (D:L246909-246944). That takes the line into
one of its records while byte +0xb is set, and refuses it when no record is free. The ctor `FUN_0034b910` allocates
0xf0 bytes (20 records of 12) and pushes 0x14 indices onto the free list (D:L247006-247011), and sets +0xb to 1
(D:L247015); reset (D:L246974) and flush (D:L246450) set it again. The drain is the Headset tick `FUN_0034b3b0`, run
from the sound frame (`FUN_00341a60` D:L241600-241603): with no USB headset (state 2, `FUN_0034bb80`), `FUN_0034afd0`
pops the oldest and plays it through `FUN_00347960` + `FUN_00342240`, an ordinary VAGSTORE stream on the TV; while a
line plays (state 1) the next waits for its handle to end (`FUN_00346d70`, D:L246712-246717); a play the stream refuses
frees the drain for the next (D:L246755-246761). Online the line is not queued: it streams directly.
`HEADSET_ROUTE_READING` is re-valued `'streamed'` (was `'not streamed'`, research 122 s3).

`HeadsetQueue` is that: 20 pending lines (`HEADSET_QUEUE_READING`), one started at a time, the next when the stream
output calls the line's `ended`; online every line starts at once. `uiSoundHost`'s output pushes each headset play
into it and starts a line as a `stream` play (no name slot, pan -1, the play's volume word); without a `stream` sink
the line is counted and dropped, as a voice stream is.

### 2.2 The group on the TV (against the brief)

The dispatch asked for "group 7's master". `FUN_00342240` picks the group from the entry's class and HQ bit alone
(D:L241878-241890: MUS 1, HQ 6, an ST line of class 3 2, else 0) -- it never reads `HS` -- so a headset line played on
the TV is in group 2, DIALOG's master; HEADSET_CONTROLLER's group 7 belongs to the USB headset's path (state 1,
`FUN_0034ad00`, the 989DSTRM extension 0x12c4e67a), which the page has none of. The test pins group 2
(`HEADSET_TV_GROUP_READING`, note only).

### 2.3 The death-path clear (`HEADSET_CLEAR_READING`, not built)

Byte +0xb is cleared only by `FUN_0034aa70` (D:L246545), whose one caller is `FUN_00547af0` (D:L413090), offline: the
function that takes the player's control away, read as the death path (BELIEVED, 186 s3.1). With +0xb clear a line
with neither `PD` nor `TYPE_DEATH_DAMAGE` is dropped (D:L246745-246748). Not built: the menus are the only place these
lines play in the port.

## 3. Stop on exit

### 3.1 The record

A `SOUND` command (`FUN_002659c0`) finds its name slot's record, `FUN_0026e7c0(DAT_00414be8, byte +6)`
(D:L112350-112352), unless flag 1 names a node instead; sets the record's +4 to the f32 at the command's own offset
`*(s16 *)(cmd + 0x12)` when that offset is positive (D:L112356-112358, `uiSoundFadeSeconds`); and with flag 0x200 sets
+2 to 1 (D:L112360-112362). A new play keeps its handle in +0xc (D:L112462, D:L112474).

### 3.2 The instance's end

`FUN_0026ff20` -- the instance's end with 5 (a stop, a set's deactivation, a run-out) and with 1 -- calls
`FUN_0026fd20` (D:L118572), which walks the instance's records (D:L118432-118480): a record holding a handle with +2
set is faded, `FUN_00346dd0(+4)` then `FUN_00346d30` (D:L118463-118464: AutoVol to 0 over `trunc(+4 x 240)` ticks,
D:L244289-244307, the timer stopping it at +4 s, `FUN_00346ea0`), when +4 > 0, else stopped and freed
(`FUN_00347610` + `FUN_00347810`, D:L118467-118468); one with +2 clear is freed when it has ended, else detached to
play out; every +2 is cleared. `STOP_ON_EXIT_FLAG_READING` is re-valued `'stop or fade(+4)'` (was `'no effect'`,
research 122 s7).

As built: the runtime's `end` calls `ZAnimHost.instanceStop(anim)` for an alive instance (a stop and a run-out alike;
`UiCommandHost` passes it through) before the instance's cleanup sequence runs, as `FUN_0026fd20` (D:L118572) comes
before `FUN_0026d870` (D:L118599): a sound the cleanup plays keeps playing. The order is latent on the disc -- none of
the menus' 399 `SOUND` commands sits in a cleanup sequence (the PF-32 review's count) -- and pinned by a synthetic
test. `UiSoundCues.stopInstance(anim)` walks its records (keyed as the slot, `streamNameSlot`) and calls the output's
`fade(slot, +4)` or `stop(slot)` for a marked slot holding a stream, `release(slot)` for an unmarked one (detached,
D:L118453-118460, the handle zeroed D:L118470: it plays on, and a restart of its animation finds no handle to stop,
D:L112451-112455), and clears the marks; `uiSoundHost` routes the three to `MenuMusic.fadeSlot` / `stopSlot` /
`releaseSlot` (the menus' `MUS_`
streams: EXTZANIM's `dlgExitState.rdr` `ExitOnStart` plays `MUS_SUCCESS` / `MUS_FAILURE` at 0x280, research 122 s7 and
152 s2). A bank one-shot holds no handle and a voice stream's sink is not the page's to stop: both play out. The
instance's start with 1 (`FUN_0026ff20(1)`) runs the same walk; the port's records hold no handle across a restart of
an alive instance, so it is not modelled.

### 3.3 The name slot

`DAT_00414be8` is the running instance, and `FUN_0026d940` builds each instance with its own copy of its definition's
records (0x10 bytes each, handles and +2 zeroed, D:L117228-117242): the console keys a slot by (instance, name), the
port's key. No animation on the disc allows a second copy (`FUN_00270ef0`, flag 0x80), so the animation's name names
its instance. `dlgMissionSelection.rdr`'s `CallMusic` and `CallMusicOld` are two animations, two instances, two slots:
research 152 s7's exception does not hold, and `STREAM_NAME_SLOT_READING`'s comment no longer claims it.

## 4. The weapon select's rows and pulses

### 4.1 The rows

`FUN_0023e370` (D:L88320-88339) clears the five rows with a null record, then for each of the character's slots up to
its count (`+0x2ec`) sets the row to `FUN_003c4b40(0x4b5210, id)` -- the loaded weapon list's record whose `+0x7c` is
the id (D:L316433-316449) -- through the same `+0x70` setter a weapon's row uses. `weapon_list.py` found 86 records in
that list, 254 and 255 among them, and `zweapon.rdr`'s `FULL_SLOT` (254) has DisplayName `-------`, `EQUIP_NONE` (255)
`<NONE>` (research 181 s3.1); the fixture's `RUN/ZWEAPON.ZAR` holds both, and `arsenalOf` keeps every record, so the
page's arsenal has them. `nameOf` takes the record's DisplayName; `EMPTY_SLOT_NAME_READING` (re-valued from `''`) is
the two DisplayNames, standing in for an arsenal without the records; a row past the kit's count is blank. That the
setter draws the DisplayName is inferred from its use for real items.

### 4.2 The pulses (against the brief's "picker reset at each opening")

Three accumulators, each 0 rising when the HUD is built: the slot bar's `+0x1538` / `+0x153c` and the card
highlight's `+0x1154` / `+0x1158`, set by the block's ctor `FUN_00241a90` (D:L89868-89880), and the arrows'
`+0xf28` / `+0xf2c` of the picker, set by `FUN_0023cd20` from the block's Init `FUN_00240e60` (D:L89595-89600).
Research 202 s3.12 read `FUN_00240e60`'s one caller, the HUD's Init `FUN_001fa360` (D:L57437-57440, online only), both
run once when the in-game HUD is made (`FUN_001ec480`): no opening resets any pulse. The dispatch's "the picker's
resets to 0 rising at each opening" read 181 s3.4's PARTIAL answer; 202 s3.12 settles it the other way, and the port
follows 202. Each advances only while its part shows (`FUN_00240600`): the bar in state 2 (D:L89400-89432), the
highlight while the slot list's body (+0x120) shows -- open and through the fade-out (D:L89439-89488) -- and the arrows
in state 3 (`FUN_0023d2b0` D:L87909-87923, from D:L89380-89382). `MenuPulses` keeps the three clocks;
`WeaponExchange` holds one for the match and feeds `weaponSelectLayout` its clocks (`LayoutOptions.pulses`; absent,
the pulses run from the opening as before). `PULSE_PHASE_READING` is re-valued `'persistent'` (was 0). Whether the HUD
is rebuilt between rounds of one match was not read (202 s3.12); the page's `WeaponExchange` lives for the match.

## 5. Readings and placeholders

| name | where | status |
|---|---|---|
| `GROUP_MASTER_READING` | sound `musicStream.ts` | `{ sound: [0,3,4,5,14], music: [1], dialog: [2,6], headset: [7] }` (s1.1; 186 s3.1, s5). Owed: a recomp log of `SetMasterVolume` while each slider moves |
| `BANK_GROUP_READING` | sound `musicStream.ts` | 0 (SOUND's), the group of a bank sound whose `VolGroup` is negative; a group at or past 989snd's 15 (`VOL_NUM_GROUPS`) takes no group stage at all; every disc bank's sound has its own group in 0-14 (s1.2) |
| `SOUND_TUNER_SOURCE_PLACEHOLDER` | viewer `audio.ts` | `'defaults'`: a page with no card and no session (`?map=` on a fresh browser); the menu match reads the session's uiVars and `/testroom` the card's (PAR-36 (b), s1.3); the pause menu's values are H114's |
| `HEADSET_QUEUE_READING` | sound `headsetQueue.ts` | `{ slots: 20, oneAtATime: true, online: 'direct' }` (s2.1). Owed: a capture of two `SND_HST_*` lines started together offline |
| `HEADSET_ROUTE_READING` | sound `uiSounds.ts` | re-valued `'streamed'` (s2.1; 186 s3.1); was `'not streamed'` (122 s3) |
| `STOP_ON_EXIT_FLAG_READING` | ui `sounds/uiSoundCues.ts` | re-valued `'stop or fade(+4)'` (s3.2; 186 s3.1); was `'no effect'` (122 s7) |
| `STREAM_NAME_SLOT_READING` | ui `sounds/uiSoundCues.ts` | `'animation and name'`, the console's key (s3.3; 186 s3.1); the CallMusicOld exception dropped |
| `EMPTY_SLOT_NAME_READING` | viewer `weaponSelect.ts` | re-valued `{ 255: '<NONE>', 254: '-------' }`, the records' DisplayNames standing in for an arsenal without them (s4.1; 181 s3.1); was `''` |
| `PULSE_PHASE_READING` | viewer `weaponSelect.ts` | re-valued `'persistent'` (s4.2; 202 s3.12); was 0. Owed: a breakpoint on 0x240e60 across a round restart |
| `HEADSET_CLEAR_READING` | *note only* | note only: `FUN_0034aa70`'s clear of +0xb on the death path (BELIEVED, s2.3); not built |
| `HEADSET_TV_GROUP_READING` | *note only* | note only: a headset line on the TV plays in its class's group 2 (DIALOG), not HEADSET's 7 (s2.2; `FUN_00342240` D:L241878-241890); the USB path's group not read |
| `LOOP_MASTER_READING` | *note only* | closed 2026-10-29 (reading, pending review): the beds, emitters and ladder slide levelled by `loopMasterGain` each frame (s1.2; 989snd `vol.c` 125) |

## 6. The wiring owed

Two lines in `packages/viewer/src/frontEnd.ts`, the online lane's hot file, not edited by PF-32 (the merge
controller's, wave 4). Both were typechecked against a scratch copy of the file at 046faf87 + PF-32. **Landed in wave 4
(2026-10-06, `agent/wave4c`)** as written; `frontEndWiring.test.ts` holds each ("PF-32: an animation instance's end
reaches the cues' stopInstance ...", "PF-32: the front end's GameAudio takes the session's option values ...").

1. After line 524 (`const musicVolume = ...`), one new line -- the front end's `GameAudio` follows the session's four
   options:

   ```ts
     audio.setTunerVars?.(() => session_?.uiVars);   // PF-32 (research 233 §1.3): the four option masters by group, read at each play
   ```

2. Line 270, the command host gains the instance's end (s3.2) -- replace

   ```ts
       this.host = new UiCommandHost({ node: this.parts.nodeCommand, sound: sounds ? (cmd) => { sounds.sound(cmd); } : undefined });
   ```

   with

   ```ts
       this.host = new UiCommandHost({ node: this.parts.nodeCommand, sound: sounds ? (cmd) => { sounds.sound(cmd); } : undefined, instanceStop: sounds ? (anim) => { sounds.stopInstance(anim); } : undefined });   // PF-32 (research 233 §3)
   ```

Until then the headless pins stand: `uiSoundCues.test.ts` and `zanimRuntime.test.ts` (s3), `audio.test.ts` (s1).
The round's own audio takes the stored tuners on both pages since PAR-36 (b) (s1.3); a page with no card stays on the defaults (`SOUND_TUNER_SOURCE_PLACEHOLDER`).

## 7. Owed

- A recomp log of `SetMasterVolume` while each audio slider moves (s1.1).
- A capture of two `SND_HST_*` lines started together offline (the queue's order and gap, s2.1).
- ~~The ambience loops through the masters~~ -- done 2026-10-29 (`LOOP_MASTER_READING`, s1.2; reading, pending review).
- A breakpoint on 0x240e60 across a round restart: whether the pulses reset between rounds (s4.2, 202 s3.12).
