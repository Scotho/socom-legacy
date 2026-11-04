# 325 -- The grenade-throw sounds and the verified voice callouts (NU-7, PARITY-2)

- Date: 2026-10-14 (18:37Z). The next-update checklist's row NU-7
  ([plan](../plans/2026-10-13-next-update-checklist.md), folded into
  [PARITY-2](../plans/2026-10-08-web-sprint-parity-2.md) by NU.R2; the checklist leads the lane by PTW.R9). **A read
  alone** ([brief](../plans/briefs/2026-10-14-nu7-throw-sounds-read.md)): the build is a later brief, from section 5.
  Branch `agent/nu7-read` from `a2e6b5ae6`.
- Review: a fresh review of `aefa52b20` returned PASS WITH FINDINGS (high). It confirmed the callout at the source
  (CSealCtrl's `+0x2c` answers 1, CRemoteCtrl's 0) and added evidence for "no pin path": the `.GREN_PIN_PULL1` hash
  0x8618bdb1 appears nowhere in the ELF. It traced G1's chain at the source (§1.4), and its F1-F4 are folded here,
  each re-read at the source, the text they corrected kept beside ("was: ..."). The status is unchanged.
- Build: NU-7 ([brief](../plans/briefs/2026-10-14-nu7-throw-sounds-build.md)), branch `agent/nu7` from `587e06325`,
  2026-10-14: §4's W1, G1 and T1, each RED first; §5's rows say what was built. Reading, pending review.
- Status throughout: **reading, pending review.** Source inspection only: the decompilation and the game ELF's bytes
  were read, the committed goldens and tests were read, and the port's code was read. No game, emulator, reader, test or
  browser was run (no node process at all). Where the port's behaviour is stated it is read off its source, not run.
  Nothing here is proven, and nothing counts as a reading until a reviewer who did not write this note re-reads it at
  the source. A step marked *inference* is one interpretive step past the code.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, re-hashed for this note). The ELF
  `game/disc/socom2_game.elf` (SHA256 `06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872`, read only, by
  its program headers, through scratch scripts): the strings 0x65df20 `CMD_MP_GRENADE_THROWN`, 0x65e030
  `CMD_MP_BOMB_PLANTED`, 0x65bc10 `CHRSND_GRENADE_ALERT`, 0x65bbb0 `CHRSND_GRENADE_I_GOT_IT`, 0x65bbd0
  `CHRSND_GRENADE_OH_HECK`; a scan of the whole file for `GREN_`, `PIN_PULL`, `THROW_OBJECT`, `PLACE_CHARGE`,
  `FireInTheHole` and `frag_out` (no hit for any of them); the controllers' vtable words CSealCtrl 0x6694b0 (+0x24
  0x5978a0, +0x2c 0x5431f0, +0x34 0x544200), CRemoteCtrl 0x669590 (+0x24 0x5978a0, +0x2c 0x5e6250 -- returns 0, +0x34
  0x5e6260 -- returns 1), CSealCtrlAi 0x6693f0 (+0xc 0x56de10, +0x24 0x55ff60), and the word 0x55ac20 at 0x669360. The
  disc's data: the committed goldens only -- `packages/scene/test/golden/throwables.json` and `arsenal-items.json`
  (`zweapon.rdr`), `packages/viewer/test/golden/motion-rdr.json` (`motion.rdr`, the callbacks),
  `packages/sound/test/golden/walk-sounds.json` (`MP2_am.bnk`, `MP2_fx.bnk` with their `sounds.rdr` entries),
  `packages/scene/test/golden/locTables.json` (the text keys); the assertions of the committed dev-disc tests named
  where used; and a plain byte count over the tracked fixtures (`socomlegacy/test-fixtures/RUN/`: `MP2.ZDB`, `MP6.ZDB`,
  `MP72.ZDB`, `READERC.ZAR`, `ZWEAPON.ZAR`, `MPZANIM.ZAR`, `UIZANIM.ZAR`, `SOUNDRDR.ZAR`, `MOTION_P.ZAR`) for a few
  names, said as such where used -- a byte count, not the repository's reader. The desktop: none read
  (`desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3` is the pin, unused). The port's lines are this branch's base
  `a2e6b5ae6`.
- Evidence read first, not restated: research [251](251-the-effective-action-life-model.md) §12.7 (PAR-77: the release
  and the grunt, the view's pick, R251.15), [304](304-original-gameplay-audio.md) §3, §4, §11 (the grenade sounds'
  inventory, the spoken warning, its four note-only names), [320](320-the-grenade-aim-reticle.md) §1, §5 (the
  throwables by id; the red smoke and the chem light in no multiplayer kit), [85](85-grenades.md) §2-§4, §9.3 (the
  power, the clips, the kit's timer, the Frostfire sounds), [179](179-c1-match-server.md) §6.14 (the `multiplayer`
  list and `FUN_005e7960`'s line), [302](302-original-options-and-communications.md) §3, §6 (the comm line's colour, the
  stream groups' weights), [230](230-gameplay-feel-parity-audit.md) §5.2.10-§5.2.11 (`network_log`: `Throw grenade`'s
  row carries it), [94](94-the-arsenal.md) (the item ids and valves).

## The owner's item (NU.R1)

From the checklist's NU.R1 (the owner, 2026-10-13, verbatim): "Add the correct grenade-throw sounds and any verified
voice callouts."

The row (NU-7, verbatim): "**The grenade-throw sounds and the verified voice callouts.** PAR-77's throw sound (landed,
checkpoint 7) checked against the original's sound table for every throwable; the callouts the original plays at a
throw ("Frag out!" and its kin) only where the disc's sound table and the code (`FUN_` cited) prove them -- none
invented (the parity rule, clause 2); the page plays, the room's throw event carries what the page needs."

## 0. Answers

| # | finding | the port | section |
|---|---|---|---|
| R325.1 | **A hand grenade's throw has two sounds and no third: the release and the standing throw's grunt.** The release is the record's `FireAnimName` zAnim (`.THROW_OBJECT`) played once, on the frame the kit's timer reaches 0 (`FUN_005c1970` D:L476884-476896 -> D:L477133 `FUN_005c5340`, the pick D:L479430, the play D:L479473-479478), in third person only; the grunt is `motion.rdr`'s `throw_whoosh` callback (`.MALE_GRUNT`) at phase 0.45 of `seal_throwgrenade` / `seal_p_throwgrenade` alone. Re-read here; research 251 §12.7 stands | the thrower's page: the same (PAR-77) | §1 |
| R325.2 | **No pin sound and no hold sound has a code path.** The ELF names no `GREN_` or `PIN_PULL` string, so code cannot ask `.GREN_PIN_PULL1` by name; no throw or placing clip carries a callback but `throw_whoosh`; the three tracked maps' zAnims and the other tracked archives hold no `GREN_PIN` bytes; the wind-up (`FUN_00594cf0` D:L453480-453525) writes the power and the arm state and plays nothing. The bank entry exists (`MP2_fx.bnk` index 0) with no trigger found | the port plays none: agrees. Not built (`GRENADE_PIN_PULL_READING`, *note only*) | §1.2 |
| R325.3 | **A placed charge's sound is its record's `FireAnimName` at the placing, in third person only**: `FUN_005bc730` (D:L474051-474060), reached from the kit's timer for the claymore, the PMN, the satchel and the bomb (0x98-0x9a, 0x9e: D:L476888, D:L477010) and for C4 (0x97: D:L476891, D:L476985). The claymore's and C4's name `c4_start` (`.PLACE_CHARGE`). No placing speaks a callout | the same (PAR-77) | §1.3 |
| R325.4 | **One callout has a code path: the teammates' "Fire in the hole" (`CMD_MP_GRENADE_THROWN`, command 0x26).** `FUN_005c5340` (D:L479232-479247), online only (`DAT_0045a0c1`), for the six hand grenades 0x79 M67, 0x7a AN-M8, 0x7b Mark141, 0x7e HE, 0x7f red smoke, 0x80 chem light; on a console whose controller for the thrower is not the local player's (`+0x2c` false) and whose local player's affiliation mask meets the thrower's (`+200`); `FUN_005e7f20` -> `FUN_005e7960` plays the thrower's character's row from its own `multiplayer` list, placed at the thrower at volume 1.0 (D:L498204-498211), **and posts the row's text with the thrower's name in the message window, colour 3** (D:L498142, D:L498217-498230). The thrower hears nothing of his own; the enemy nothing | the page plays the voice (research 304, `matchSound.ts:119-128`) and, built by NU-7 W1, posts the line (`GRENADE_WARNING_LINE_READING`; was: "**it posts no line** (W1)") | §2.1 |
| R325.5 | **No other line plays at a throw.** "Frag out" is no string in the ELF; the three `CHRSND_GRENADE_*` slots' plays are AI controllers' reactions to a grenade nearby (`FUN_0055ac20` D:L423173, D:L423330; `FUN_005cac00` D:L482711 under CSealCtrlAi's tick), never the thrower's; command 0x45 (`CMD_MP_BOMB_PLANTED`) is the bomb's, not a throwable's (D:L479233-479234) | none built, none to build | §2.2 |
| R325.6 | **Another console hears a throw's release and its grunt from its own copy of the body.** The copy's kit runs no timer (CRemoteCtrl `+0x34` answers 1, D:L476871-476877); the wire's throw reaches `FUN_005c5340` for the copy (`FUN_005e6400` D:L497481-497495, or `FUN_002c17b0` -> `FUN_005bd030` D:L163766, D:L474170-474178), which plays the release and, being a remote controller, the warning. `Throw grenade`'s anim-set row carries `network_log` (research 230 §5.2.11), so the throw's push goes out as a Push Blend, the copy pushes the same clip (`FUN_002bba80` -> `FUN_005880e0` case 0 -> `FUN_00588bc0`) and the copy's body update runs the callback driver with no controller test (§1.4; the review's trace). (Was: "so the copy plays the throw clip and its callback (*inference*: the copy's clip fires its callbacks as the thrower's does)".) | the release and the warning: the same; the grunt: built by NU-7 G1 (`REMOTE_THROW_GRUNT_READING`; was: "**the grunt: none** (`remotePlayers.ts:704` drops the pose's callbacks) (G1)") | §1.4, §3 |
| R325.7 | **The room carries what the page needs**: the thrower's id, the item's kind, the release point (`room.ts:4090`, `:4190`, `:4259`), and the body's hold for the clip | no change to the room or the wire | §3.1 |

## 1. The throw's sounds, per throwable

### 1.1 The table

The ids and records are `arsenal-items.json` and `throwables.json` (the goldens). The bank entries are
`walk-sounds.json` (`MP2_am.bnk`, `MP2_fx.bnk`; other maps' banks are the same names at research 304 §3's indices).
`.MALE_GRUNT` is `MPn_vc.bnk`'s, which no golden holds: research 304 §3 (index 2) and research 251 §12.7 (RANGE 50-150)
read it.

| item (id) | the pin | the hold | the release (third person) | first person, night vision | the grunt | the placing | the warning (§2.1) |
|---|---|---|---|---|---|---|---|
| M67 (121, 0x79) | none found (§1.2) | none | `frag_start` -> `.THROW_OBJECT` (`MP2_am` 1, vol 32, RANGE 40-160, its name with a trailing blank) | none (`frag_start_zoom` is in no archive: research 251 §12.7) | the standing throw alone: `throw_whoosh` -> `.MALE_GRUNT` | -- | yes |
| HE (126, 0x7e) | none found | none | `HE_start` -> `.THROW_OBJECT` | none | the same | -- | yes |
| AN-M8 (122, 0x7a) | none found | none | `smoke_grenade_start` -> `.THROW_OBJECT` | none | the same | -- | yes |
| Mark141 (123, 0x7b) | none found | none | `flashbang_start` -> `.THROW_OBJECT` | none | the same | -- | yes |
| RED SMOKE GRENADE (127, 0x7f), BLUE CHEM LIGHT (128, 0x80) | -- | -- | not read: their `FireAnimName` is in no golden (`RED_CHEM_RELEASE_READING`, §5) | -- | the same clips | -- | yes, if thrown; but in no multiplayer kit (research 320 §5) |
| Claymore (153, 0x99) | -- | -- | -- | -- | -- (`seal_place_claymore` carries no callback) | `c4_start` -> `.PLACE_CHARGE` (`MP2_fx` 18, vol 66, RANGE 20-200); none past third person | no |
| PMN Mine (158, 0x9e) | -- | -- | -- | -- | -- | its `FireAnimName` through the same pick; the name is in no golden (`PMN_PLACE_SOUND_READING`, §5) | no |
| C4 (151, 0x97) | -- | -- | -- | -- | -- (`Put on wall`'s clip) | `c4_start` -> `.PLACE_CHARGE`; none past third person | no |
| Satchel (152, 0x98) | -- | -- | -- | -- | -- | never in a multiplayer kit: `Enable_satchel` = 0 on all 22 maps (research 94, its rows at lines 216 and 1444); it is a placing (§1.3, R325.3). (Was: "never in the hand: `FUN_005bdc30` refuses its slot (`equipment.ts` `slotSelectable`, D:L474604-474660 as cited there)" -- that refusal, D:L474643-474646, covers C4 (0x97) and the bomb (0x9a) too, both placed: the review's F3.) | no |
| "Thermite" | no such item: the 86 records of `zweapon.rdr` hold none, no string in the tracked `ZWEAPON.ZAR` reads `thermite` (byte count), and the valve 124 `Enable_phos` (by its name a phosphorus grenade's) has no record behind it (research 94, `arsenal.ts`) | | | | | | |

The names `frag_start`, `HE_start`, `smoke_grenade_start`, `flashbang_start` are `throwables.json`'s; that each plays
`.THROW_OBJECT`, and `c4_start` `.PLACE_CHARGE`, is asserted by the committed dev-disc tests `throwSound.test.ts`
(the four and `c4_start`, MP7) and `gameplayAudioDisc.test.ts` (`frag_start`, `HE_start`), whose last runs PAR-77's
review recorded (research 251 §12.7; not run here). `bombPage.test.ts` asserts the claymore's and C4's `c4_start` and
MPBOMB's `NOT FOUND`. The callbacks are `motion-rdr.json`'s: `throw_whoosh@0.45` on `seal_throwgrenade` and
`seal_p_throwgrenade`; none on `seal_tossgrenade`, `seal_p_tossgrenade`, `seal_crouch_throwgrenade`,
`seal_prone_throwgrenade`, `seal_prone_tossgrenade`, the four lean tosses, `seal_returnthrow`, `seal_kickgrenade`,
`seal_place_claymore` or `seal_p_place_claymore`.

### 1.2 What chooses each sound, and on which frame

- **The release: the item's record, chosen by code at the release.**
  - The kit's timer `+0x87c` counts down each frame on a body whose controller answers 0 at `+0x34` -- the local
    player's, not a copy (`FUN_005c1970`, D:L476871-476877, D:L476884). At 0
    it sorts the item (D:L476887-476896): 0x98-0x9a and 0x9e are set on the ground, 0x97 (C4) on a target, any other
    is thrown. A throw runs the launch and `FUN_005c5340` (D:L477023, D:L477133). So the release sounds once a throw,
    on the frame the timer runs out (0.71 s into the standing throw: research 251 §12.7), never at the press.
  - `FUN_005c5340` takes the slot's record (D:L479219-479221) and, for a hand grenade's class, picks its zAnim by the
    body's view: `FUN_003d22b0(record, 0 < body+0x200)` (D:L479430) -- the record's `+0x84` (the `FireAnimName`'s
    handle) in third person, `+0x88` (`<name>_zoom`) past it. It plays it on the body's item node through
    `FUN_00272bb0` while `DAT_003e1538` is set (D:L479473-479478). Research 251 §12.7 read the handles' load and found
    no throwable's `_zoom` zAnim on the disc: none is heard in first person or night vision.
- **The grunt: the clip's event track.** `throw_whoosh` fires as the clip's phase crosses 0.45 (research 85 §3, research
  251 §12.7), 0.69 s into the standing throw, one frame before its release fraction. A knock that pops the clip first
  takes it with it.
- **The pin and the hold: nothing found.** What was searched:
  - The ELF, every byte: no string holds `GREN_` or `PIN_PULL`, so no code asks the pin's sound by its name, whole or
    formatted (research 85 §9.3 left "a computed name" open; no fragment exists to compute it from). Nor by its hash:
    the bank entry's hash 0x8618bdb1 (`walk-sounds.json`, -2045198927) appears nowhere in the ELF (the review's
    search, 2026-10-14).
  - Every data route that names a sound: the clips' callbacks (`motion-rdr.json`, above: none on a throw or placing
    clip but `throw_whoosh`); the zAnims (a byte count over the tracked `MP2.ZDB`, `MP6.ZDB` and `MP72.ZDB`, whose zAnim
    names are plain bytes there -- `.THROW_OBJECT` and `.PLACE_CHARGE` each count 1 in each -- finds `GREN_PIN` 0
    times; over `MPZANIM.ZAR`, `UIZANIM.ZAR`, `READERC.ZAR`, `ZWEAPON.ZAR`, `SOUNDRDR.ZAR`, `MOTION_P.ZAR` 0 times);
    research 304 §2's whole-disc term scan found no reference outside the bank.
  - The wind-up in the code: the player controller's update (`FUN_00594cf0` D:L453480-453525) raises the power toward
    the pressure, asks the arm state of `FUN_005dfe30` (D:L494235-494275: a state word and a timer, no sound) and lets
    go below the threshold; no sound call is on that path.
  - So `.GREN_PIN_PULL1` (`MP2_fx.bnk` index 0, vol 77, RANGE 120-160) is a bank entry no code path is found to play.
    **Named, not built** (`GRENADE_PIN_PULL_READING`, §5; it re-files research 304's `GRENADE_PIN_PULL_TRIGGER`).

### 1.3 The placings

- `FUN_005bc730` (D:L473933) is the placing. It picks the slot record's zAnim by the same view test (D:L474051-474053)
  and plays it at the body (D:L474054-474060). Online, the bomb (0x9a) leaves early through a message to the host
  (`FUN_002c2090`, D:L473980-473984).
- No `FUN_005e7f20` call is in `FUN_005bc730` (a search of its lines): **no placing speaks**.

### 1.4 Who hears them

- **The release** is a positional zAnim at the body's item node (D:L479452-479478), heard within its sound's RANGE
  (`.THROW_OBJECT` 40-160 on MP2). Every console plays it for the body:
  - the thrower's own, from the kit's timer (above);
  - another's, from its copy: the copy's kit runs no timer, since the explosive branch of `FUN_005c1970` runs only for a
    controller whose `+0x34` answers 0 (D:L476871-476877), and CRemoteCtrl's answers 1 (0x5e6260). The wire's throw
    reaches `FUN_005c5340` for the copy instead: the remote controller's tick fires a pending count through
    `FUN_005c6510` (D:L497481-497495, D:L479552-479555), and a network handler `FUN_002c17b0` calls `FUN_005bd030`
    (D:L163766), which sends C4 to `FUN_005bc730` and any other item to `FUN_005c5340` (D:L474170-474178). Which of the
    two carries a throw is not settled here (`THROW_REMOTE_ROUTE_READING`, §5); both run the same release and warning.
    The copy picks by its own `+0x200`, which no wire field is read to carry (`THROW_RELEASE_REMOTE_VIEW_READING`,
    research 251 §7).
- **The grunt** is the clip's, positioned at the body. On another console it is the copy's clip (traced by the review,
  re-read here at the source; reading, pending review):
  - *The send.* The release request's push (`FUN_005802b0` -> `FUN_00588bc0`, D:L441900) goes out online, for a
    controller answering 0 at `+0x34`, as a Push Blend of kind 0 (`FUN_002bbaf0`, D:L446408-446416 ->
    D:L160789-160796), and only when the type's anim-set row has bit 0 set -- `network_log`, which `Throw grenade`'s
    row carries (research 230 §5.2.11, the control of PAR-84's read: that bit is research 230's reading).
  - *The receipt.* `FUN_002bba80` (D:L160762-160766) hands it to `FUN_005880e0`, whose case 0 calls `FUN_00588bc0`
    on the copy (D:L445755-445756): the copy pushes `seal_throwgrenade` itself. The decompiler does not recover that
    call's arguments at D:L445756 (named in `REMOTE_THROW_GRUNT_READING`).
  - *The callback.* The copy's body update `FUN_00550ef0` (CZSealBody's vtable, 0x6691b8) calls `FUN_0057a330`
    (D:L418454), which calls the callback driver `FUN_0028c9e0` (D:L439009); the driver (D:L134377-134450) tests no
    controller. So `throw_whoosh` fires on the copy's own phase.
  - `REMOTE_THROW_GRUNT_READING` (§5) names it. (Was: "so the original sends the push as a Push Blend and the copy
    plays `seal_throwgrenade`; its callback fires on the copy's own phase (*inference*: the callback driver
    `FUN_0028c9e0` is not read per controller; research 85 §3 reads it for the body).")

## 2. The callouts

### 2.1 The teammates' warning: command 0x26

- **The call.** `FUN_005c5340` (D:L479229-479249), before the release's zAnim:
  - only while `DAT_0045a0c1` is set (D:L479232) -- the network byte, set by `DMEInit`'s success (research 183, its
    row 11; research 107): never offline;
  - for the record's item `+0x7c` (D:L479229) in 0x79, 0x7e, 0x7f, 0x80, 0x7a, 0x7b (D:L479236-479237): the M67, HE,
    red smoke, chem light, AN-M8 and Mark141 -- the smoke and the flash included, no charge, no launcher round;
  - when the thrower's controller's `+0x2c` answers 0 (D:L479238-479243): a remote controller (CRemoteCtrl 0x5e6250
    answers 0; CSealCtrl's 0x5431f0 answers 1, research 304 §4), so **never on the thrower's own console**;
  - when the local player's actor (`FUN_002b3580`, `DAT_00440c38`, D:L156213-156216) has an affiliation bit in common
    with the thrower's (`+200`, D:L479244-479245): **teammates, not the enemy**;
  - then `FUN_005e7f20(thrower, 0x26, 0)` (D:L479246). For any command but 0x2b it calls `FUN_005e7960` alone
    (D:L498240-498253): **nothing goes on the wire**; each console decides for itself from its own copy.
- **The line.** `FUN_005e7960` (D:L498030-498236), for a command outside 0x31-0x3a:
  - It walks the thrower's character's own `multiplayer` list (`FUN_00599810` of the controller's character, `+0x3a4` /
    `+0x3a8`; D:L498084-498125) for the row whose id is 0x26 (D:L498090), the first such; `FUN_0058ed60` names 0x26
    `CMD_MP_GRENADE_THROWN` (D:L449790-449791) for the reader's list (research 179 §6.14).
  - The row's sound (the in-memory row's `+8`) resolves by name through the loaded banks and streams
    (`FUN_00344f30`, D:L498117) and is cached on the row (`+0x10`).
  - The row's text (`+4`) is localized and formatted with the thrower's name (the actor's `+0x14`, D:L498075;
    `FUN_001988d0`, D:L498142).
  - The sound plays (D:L498198-498214): the thrower's controller answering 0 at `+0x2c`, as it does here, **placed at
    the thrower's position** (`+0x1c`) at volume 1.0 through the sound's `+0x14`; else unplaced through `+0xc`.
  - The line posts (D:L498217-498230) when it is not empty: `FUN_002b6530` into the main message window 0x4366a0, in
    colour 3 (any command under 0x36), the same post as a tactical command's (research 302 §3, the port's
    `matchChat.ts:156`). Scale 0: the window's own (D:L498230's first argument is `FUN_002b6530`'s float `param_1`, and
    0.0 there takes the window's scale, any other value times 1.1429: D:L157983-157987; NU-7's review, F1). (Was: "Its
    float scale is not shown by the decompiled call (as `CLAYMORE_REFUSAL_SCALE_READING`'s).")
  - No timer, count or random draw is read in `FUN_005e7960`: no cooldown, no chance. A row's sound that names a stream
    group picks a member by the group's weights (research 302 §6, research 304 §4).
- **The lines on the disc.** Every team character of the 22 maps lists `CMD_MP_GRENADE_THROWN` (the committed dev-disc
  test `killAutoComm.test.ts`, "no team character of the 22 maps lists CMD_MP_ENEMY_DEAD ..."; its assertion read, not
  run). The text key is `_60592_sFireInTheHole_MSG` (`locTables.json`, HudCLOC 60592); its English text is in no
  golden (research 179 §6.25 quotes it "Fire in the hole"). The streams per map and side (research 304 §4's table, its
  reading of MP2, MP51 and MP72): SEAL slots `^PS_0016`, `^PS_0094`, `^PS_0042`, and the fourth by map (`^PS_0068`,
  `^PS_0120`, `^PS_0146`); the Terrorists' four by map (`^PT_0450`, `^*PT_0278A`, `^PT_0477`, `^PT_0477` on MP2, and
  so on). The bank or stream entry is the row's, not a fixed one: **which recording plays is chosen by the thrower's
  side and character**, not by the item.
- **What is proven and what is not.** The path is cited end to end in the code; the rows exist on the disc through the
  repository's reader (the dev-disc test). The level is **reading** (pending review), not proven: no capture of a
  teammate's throw has been compared. Settles: capture NU7-2 (§5).

### 2.2 What else was searched, and found not to be a throw's callout

- **"Frag out"**: no ELF string reads `frag_out`, `Frag out`, `rag out`, `ire in` or `FireInTheHole` (the scan above,
  with `FRAG` and `Frag`, whose hits are below; the text key lives in the locale tables, not the code). The ELF's
  `Frag grenade` (0x65d3e0) and `Frag grenade (launcher)` (0x65d450) are item names.
- **`CHRSND_GRENADE_ALERT`, `_I_GOT_IT`, `_OH_HECK`** are character sound slots 0x33, 0x34, 0x35
  (`FUN_0053c3a0`, D:L405948-405956). Their plays pass the slot to a controller's `+0x24`, `FUN_005978a0` (D:L454436-
  454456, the 3 s voice gate `FUN_0053b710`):
  - 0x33 from `FUN_005cac00` (D:L482711), reached only from CSealCtrlAi's tick (`FUN_0056de10`, its vtable's `+0xc` at
    0x6693fc; D:L432502 -> `FUN_005cba20` D:L483037 -> `FUN_005cb870` D:L482964): an AI soldier alerted by a grenade
    near it;
  - 0x34 and 0x35 from `FUN_0055ac20` (D:L423173, D:L423330), whose one reference is the word at 0x669360, a vtable slot
    between `CAiSRescued`'s (0x669260) and CSealCtrlAi's (0x6693f0): **CAiSGrenade**'s, by its type-info name (ELF
    0x65cf58 `CAiSGrenade`; the review's F4). (Was: "an AI state's reaction (its class not named here)".)
  - None is on a player's throw. They are not this row's and are not built.
- **The squad's frag orders and deploy reports.** The ELF's `FRAG` (0x65d7e8), `FRAG TWO` (0x65d760), `FRAG AND
  CLEAR` (0x65d7c8) are order names (`FUN_0058e360` D:L449314, `FUN_0058eb00` D:L449663). The deploy reports are the
  character slots 0x28-0x2f (`FUN_0053c3a0` D:L405916-405937): 0x28 `CHRSND_DEPLOY_GENERIC_COMPLETE`, 0x29
  `CHRSND_DEPLOY_BLUE_CHEM_COMPLETE`, 0x2a `CHRSND_DEPLOY_RED_SMOKE_COMPLETE`, 0x2b `CHRSND_DEPLOY_C4`, 0x2c
  `CHRSND_SATCHEL_PLACED`, 0x2d `CHRSND_DEPLOY_FRAG_COMPLETE`, 0x2e `CHRSND_DEPLOY_SMOKE_COMPLETE`, 0x2f
  `CHRSND_DEPLOY_FLASHBANG`. `FUN_00560280` (D:L425570-425599) maps the item to them when its slot argument is -1
  (D:L425573-425595): the Mark141 (0x7b) 0x2f, the AN-M8 (0x7a) 0x2e, the M67 (0x79) 0x2d, the satchel (0x98)
  0x2c, C4 (0x97) 0x2b, the red smoke (0x7f) 0x2a, the chem light (0x80) 0x29, any other (the HE among them) 0x28;
  then plays it through the controller's `+0x24`. Its one caller is `FUN_0055d120` (D:L424599), whose one reference
  is a vtable slot at 0x6693b0: **CAiSDeploy**'s, by its type-info name (ELF 0x65cf80 `CAiSDeploy`; the review's
  F4). The squad's report of a deployed item, not a player's throw; not built. (Was: "`CHRSND_SATCHEL_PLACED` (0x2c)
  and `CHRSND_DEPLOY_FRAG_COMPLETE` (0x2d) are character slots (D:L405927-405932). No call passes 0x2c or 0x2d as a
  literal; the AI's variable-slot play `FUN_00560280` (D:L425599) is called only from `FUN_0055d120` (D:L424599),
  whose one reference is a vtable slot at 0x6693b0 in the same AI-state range: the squad's, not a player's throw (the
  variable's values not traced).")
- **Command 0x45, `CMD_MP_BOMB_PLANTED`** (`FUN_0058ed60` D:L449871-449872): `FUN_005c5340` speaks it for item 0x9a,
  the bomb, online, with no controller or affiliation test (D:L479233-479234). Not a throwable's; research 304's
  `BOMB_PLANTED_COMMAND` (note only) stands, outside NU-7.
- **The Chat menu's commands** reach `FUN_005e7960` through `FUN_005e6e40` (D:L497680-497705) and the wire
  (`FUN_002bad40`, received by `FUN_002bac40` D:L160198-160232). A player can send a comm by hand; none is sent at a
  throw.

## 3. The port against the read

The port's tree is `a2e6b5ae6`. Rows marked "--" agree.

### 3.1 The room

| # | the original | the room | difference |
|---|---|---|---|
| -- | another console hears the throw from its copy, from the wire's throw (§1.4) | `grenade` to every page but the thrower's, with the thrower's `id`, the item's `kind`, `from`, `velocity`, `pid` (`room.ts:4090`, `:4190`, `:4259`) | none |
| -- | the warning is each console's own decision, nothing on the wire (§2.1) | nothing sent for it | none |
| -- | the copy plays the throw clip (the Push Blend, §1.4) | the body's hold carries the clip (`snap.hold`, `holdSerial`; PAR-85) | none |
| -- | the warning only online (`DAT_0045a0c1`) | every match is the room's; the menu-launched ONLINE match is online | none on the game's match; `/testroom` (the test room, a browser instrument) plays it too, unchanged |

### 3.2 The page

| # | the original | the page | difference |
|---|---|---|---|
| -- | the release once a throw, at the hand's opening, third person only (§1.2) | `grenade.ts` `letGo` emits `'throw'` once; `matchThrow.ts:226`, `:275` ask `releaseAnim(fireAnim)` (PAR-77) | none |
| -- | a placing's `FireAnimName`, third person only (§1.3) | `matchThrow.ts:228` | none |
| -- | no pin, no hold sound (§1.2) | `throwStart` and `equip` play nothing (`matchThrow.ts:204-218`) | none; pinned by NU-7 T1 (`throwSound.test.ts`: nothing before `throwStart`, nothing after it but the clip's grunt, then the release; `gameplayAudio.test.ts`: `GRENADE_WARNING_ITEMS` the six of D:L479236-479237), both passing on the code as it stood (was: "none (unpinned: T1)") |
| -- | the thrower's grunt at 0.45 of the standing throws (§1.2) | `ThrowPose.step`'s callbacks played at the drawn feet by `poseFrame` (`matchThrow.ts:545`) | none |
| -- | another's release from its copy, third person (§1.4) | `remoteRelease` -> `FireAnimName` at `from` (`matchThrow.ts:283`, `grenade.ts:1486`) | none (`THROW_RELEASE_REMOTE_VIEW_READING` stands) |
| -- | the warning: the six ids, teammates only, never the thrower, the thrower's character's row, placed at the thrower (§2.1) | `grenadeWarningFor` (`gameplayAudio.ts:8`, `:17-24`): the same six ids, the listener's side against the thrower's, the thrower's type's `CMD_MP_GRENADE_THROWN` row (`tauntData.ts:70`); `matchSound.ts:119-128` plays the stream at the thrower's feet; the thrower's page gets no `remoteRelease` | none for the voice |
| W1 | the warning **posts the row's text with the thrower's name**, colour 3, the main window (D:L498142, D:L498217-498230) | no line: `grenadeWarning` returns the sound's name and posts nothing; the row's `text` is read (`tauntData.ts:47`) and unused | **the teammates' "Fire in the hole" line is missing**. Built (NU-7 W1): `grenadeWarning` posts the row's text with the thrower's name through `matchChat.ts`'s `commandLine` / `commandText`, given `mountSound`'s `hud` and `nameOf`, which `main.ts` and `matchMount.ts` hand it (the HUD and `NetPage.nameOf`, the controller's word adding the two files; `matchMount.test.ts` posts the line through the real page). (Was: "which `main.ts` and `matchMount.ts`, outside NU-7's files, do not hand it yet (§5)".) |
| G1 | another console hears the thrower's grunt from the copy's clip (§1.4; was: "§1.4, *inference*") | `remotePlayers.ts:702-704` steps the remote `ThrowPose` and drops what `step` returns; no test steps the remote pose (`throwSound.test.ts:241` pins the release event's path, not the pose: the review's F1; was: "`throwSound.test.ts:241` pins the silence") (`GRENADE_REMOTE_GRUNT_TIMING`) | **another's standing throw has no grunt**. Built (NU-7 G1): `RemotePlayers.frame` keeps what the remote `ThrowPose.step` returns, at the body's drawn feet (none for the hold a body is first drawn with: a joiner's catch-up), and `matchSound.ts`'s `frame` plays them through `audio.onAnimCallback` (`takeThrowCallbacks`; no page file changed: `others` already hands the sound the bodies) |

Neither difference touches the room: both are the page's, from what the page already holds (the snapshot's hold,
`remoteRelease`'s `owner` and `id`, `NetPage.nameOf`).

## 4. The build list

Each row is RED first, on the simulation track; the room changes in none, so "room and page on the same command" is
the page alone (the room's event and body already carry what the page needs: §3.1).

- **W1 -- the warning's line (page).** `matchSound.ts` `grenadeWarning` (or a hook beside it) posts the row's `text`
  formatted with the thrower's name (`NetPage.nameOf(owner)`), in colour 3 at the window's scale, as
  `matchChat.ts:151` formats a tactical command's line with `%s` and `matchChat.ts:156` posts it (the same
  `FUN_002b6530` call in the original). The line posts **whenever the row's text is non-empty, whether or not the
  voice resolves**: in `FUN_005e7960` the post depends only on the formatted text (D:L498217-498218), and the sound
  plays separately whenever it resolves (D:L498202). No row: no text, no line. (Was: "posts, when the voice is
  found, the row's `text` with every `%s` replaced by the thrower's name ... Nothing posts where nothing plays (no
  row: no line, as `FUN_005e7960` posts an empty buffer nowhere)." -- the review's F2.)
  - *RED:* `gameplayAudio.test.ts` / a `matchSound` case with a stub HUD: a teammate's M67 (0x79) and AN-M8 (0x7a)
    post one line, the row's text formatted with the thrower's name (D:L498142), in colour 3; a row whose voice does
    not resolve still posts its line; an enemy's none; the thrower's own page none; a claymore (0x99) none; a
    character with no row none; a joiner's catch-up none. (Was: "post one line `<name> : ...` in colour 3", which
    assumed a format: the review's F2.)
  - A dev-disc assertion beside `killAutoComm.test.ts`: each team character's `CMD_MP_GRENADE_THROWN` text key
    resolves in `HudCLOC.rdr` (60592), and whether it carries `%s` (skipping without the disc; a skip is said).
  - `GRENADE_WARNING_LINE_READING` (§5) goes in code with the post.
- **G1 -- another's grunt (page).** `remotePlayers.ts` plays what the remote `ThrowPose.step` returns, through the
  match's `audio.onAnimCallback(name, the body's drawn feet)`, as the page plays its own (`poseFrame`,
  `matchThrow.ts:545`).
  - *RED first* (the review's F1): a **new** test that steps another body's `ThrowPose` (the remote pose's own
    `step`, as `remotePlayers.ts:702-704` drives it) and expects `throw_whoosh` -- `.MALE_GRUNT` -- once, at the
    clip's 0.45, on the standing throws (`seal_throwgrenade`, `seal_p_throwgrenade`) only: its toss, crouched and
    prone throws none; a knock before 0.45 none; a joiner's catch-up (a hydrated throw) none; a dead body none.
    `throwSound.test.ts:241` stays as it is: it tests the `remoteGrenade` event path (its lines 232-241), which
    fires at the release, about 0.71 s in, for every throw, and no grunt belongs there after G1 either. (Was:
    "`throwSound.test.ts:241`'s expectation inverted: another body's standing throw asks `throw_whoosh` once, at
    the clip's 0.45; ...".)
  - `REMOTE_THROW_GRUNT_READING` (§5) goes in code with it; research 304 §11's `GRENADE_REMOTE_GRUNT_TIMING` row gets
    a "was" pointing here.
- **T1 -- the rest pinned (no behaviour change).** A test that the page asks no sound between `throwStart` and the
  release (the pin and the hold), and that `GRENADE_WARNING_ITEMS` is exactly the six ids of D:L479236-479237.
- **Not built:** the pin (`GRENADE_PIN_PULL_READING`: no path); the AI's `CHRSND_GRENADE_*` (no player path); the
  bomb's 0x45 (research 304's); the red smoke's and the chem light's release names (in no multiplayer kit).

## 5. Readings and placeholders (candidates for the build)

| name | where it would go | status |
|---|---|---|
| `GRENADE_WARNING_LINE_READING` (built 2026-10-14, NU-7 W1; was: "*note only*; candidate, W1") | viewer `matchSound.ts` (`grenadeWarning`; the post and format shared from `matchChat.ts`, `commandLine`, `commandText`) | `{ window: 0x4366a0, colour: 3 }`: the row's text with the thrower's name, colour 3, the main window 0x4366a0, on each teammate's console (`FUN_005e7960` D:L498142, D:L498217-498230), posted when the text is not empty whether or not the voice resolves; scale 0: the window's own (D:L157983-157987), as the tactical line's (was: "its float scale not shown by the decompiled call (the window's own, as the tactical line's)"; NU-7's review, F1). The disc's text, through the repository's reader: every team character of the 22 maps names `_60592_sFireInTheHole_MSG`, which resolves to `%s : FIRE IN THE HOLE!` (the dev-disc test in `killAutoComm.test.ts`, run). Both pages pass `mountSound` the HUD and `NetPage.nameOf` (its names, else `Player<id>`, as the kill line's), the line posting through the real front-end match (`matchMount.test.ts`) and both mounts pinned (`matchSound.test.ts`). (Was: "Open: `mountSound` posts only with its `hud` and `nameOf`, which `main.ts` and `matchMount.ts` do not pass yet (outside NU-7's files; reported to the controller), so neither page shows the line until they do".) Settles: capture NU7-2 |
| `REMOTE_THROW_GRUNT_READING` (built 2026-10-14, NU-7 G1; was: "*note only*; candidate, G1") | viewer `remotePlayers.ts` (the remote pose's callbacks, `takeThrowCallbacks`), played by `matchSound.ts` `frame` | `'the body's own clip'`: `throw_whoosh` once at the clip's 0.45 on the two standing throws, none on the toss, crouched, prone and lean throws or the placing, none after a knock before 0.45, for a dead body or for the hold a body is first drawn with (a joiner's catch-up: `remoteThrowGrunt.test.ts`); the copy plays `seal_throwgrenade` from the Push Blend (`network_log`, research 230 §5.2.11's reading; D:L441900, D:L446408-446416, D:L160789-160796, D:L160762-160766, D:L445755-445756) and its `throw_whoosh` sounds on the copy's phase (`FUN_00550ef0` -> `FUN_0057a330` D:L418454 -> `FUN_0028c9e0` D:L439009, no controller test D:L134377-134450); open: the arguments of `FUN_00588bc0` at D:L445756 (not recovered by the decompiler) and the `network_log` bit (research 230's reading); was: "(*inference*: the callback driver per controller not read)"; settles: capture NU7-3 |
| `GRENADE_PIN_PULL_READING` (*note only*; candidate, none: nothing built) | -- | `.GREN_PIN_PULL1` has no code path found (§1.2: no ELF string, no clip callback, no zAnim bytes in the tracked maps, research 304's whole-disc scan); re-files research 304's `GRENADE_PIN_PULL_TRIGGER`; settles: capture NU7-1 (no pin heard at any step) |
| `THROW_REMOTE_ROUTE_READING` (*note only*; candidate, none: no build depends on it) | -- | which wire route reaches `FUN_005c5340` for another's throw: the remote tick's pending count (`FUN_005e6400` D:L497481-497495) or `FUN_002c17b0` -> `FUN_005bd030` (D:L163766, D:L474170-474178); both play the same release and warning; settles: the two handlers' message types read |
| `PMN_PLACE_SOUND_READING` (*note only*; candidate, none: the port plays the record's own name) | -- | the PMN's `FireAnimName` and its zAnim's sound are in no golden; the tracked `ZWEAPON.ZAR` holds the strings `c4_start`, `satchel_start`, `grenade_start` (a byte count, not the reader); settles: the reader over the tracked `ZWEAPON.ZAR` and a map's zAnims in a dev-disc test, or capture NU7-1 |
| `RED_CHEM_RELEASE_READING` (*note only*; candidate, none: in no multiplayer kit) | -- | the red smoke's and the chem light's `FireAnimName` and release sound are in no golden (the strings `red_smoke_grenade`, `blue_chem_light` are in the tracked `ZWEAPON.ZAR`, a byte count); settles: the reader, as above |

The captures that would settle them (the original running, the console's sound recorded):

- **NU7-1**: each of the M67, HE, AN-M8 and Mark141 thrown standing and tossed, crouched and prone, in third person and
  in first person, by a SEAL and by a Terrorist; a claymore, a PMN and C4 placed -- in an online game and, if a LAN game
  sets the network byte (unread), over LAN; and offline, in a single-player mission, where the byte is clear and no
  warning may sound; the thrower's console. Settles the pin (none heard), the hold (none), the
  release's view rule as measured, and the placings' names.
- **NU7-2**: the same throws heard on a teammate's console and on an enemy's: the warning's voice (each character
  slot), its line in the message window and its scale, and nothing on the enemy's.
- **NU7-3**: a teammate's standing throw and toss heard on another console: the grunt at the copy's clip, or none.
