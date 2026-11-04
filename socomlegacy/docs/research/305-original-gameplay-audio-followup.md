# 305 -- The empty-fire click and the ladder slide's loop (PAR-89, from Chris's PR #90)

- Date: 2026-10-14 (04:50Z). PARITY-2 row PAR-89 ([plan](../plans/2026-10-08-web-sprint-parity-2.md),
  [brief](../plans/briefs/2026-10-14-par89-empty-click-and-slide-loop.md)), on `agent/par89` from the lane head
  `2bc89091b`. Simulation track.
- **Provenance.** This is **Chris's research**, from PR #90 (`origin/chris/gameplay-audio-manager-review`), his commit
  `14ece5c69` over `18e3cc215` (`git show 14ece5c69:socomlegacy/docs/research/305-original-gameplay-audio-followup.md`),
  re-filed by PARITY-2 PAR-89 as the lane's note on the owner's word (relayed by the merge controller redotcom-05,
  2026-10-14 ~04:00Z: "Yes, we want chris's sounds ... proceed however it would be best to bring them in"). Every claim
  below was re-cited at its source for this filing; where the re-read differs from Chris's text, both are kept (section
  6). Chris's two companion pages, `docs/gameplay-audio-followup-playtest.md` and `docs/gameplay-audio-followup-results.md`
  (at `14ece5c69`), are **cited here as Chris's evidence and not added** to the tree: this note takes what it needs from
  them (section 8), and the all-map-validation plan keeps the `gameplay-audio-*` pages off `main` (PARITY-2's PAR-89
  row).
- **Status throughout: reading, pending review.** Source inspection of the decompilation and the ELF's bytes, and the
  disc's banks and sound script through the repository's readers (a dev-disc test). Nothing here is proven: no capture
  or trace of the original was made or compared. **What moved from proven to reading: nothing** -- Chris's note already
  filed every finding as reading ("not original-running measurements"); his results page's browser runs are rendered
  runs of his port build, evidence of the port's delivery, not of the original (section 8).
- **PAR-93** (2026-10-14, the gameplay lane, [brief](../plans/briefs/2026-10-14-par93-dry-pull-reload.md); reading,
  pending review): `FUN_005c0fd0` re-read whole against research 312 section 4.1 (which read the same span for
  NET-REFILL): section 2.3 gains "PAR-93: the branch's gates, the unpressed path's set, every frame" and its two names
  are re-filed (section 7); `DRY_PULL_RETRY_READING` is new; the port's dry pull reloads at once offline too
  (`fire.ts` `pull`). What changed in the text is kept in section 6.
- **LATER 179 + 48** (2026-10-20, the gameplay seat, `agent/l179`; reading, pending review): the port runs the dry
  branch once a page frame (`Fire.dryFrame`), both paths, so the click and the reload are asked again each frame a
  reload is refused, and the unpressed path clicks; `DRY_PULL_RETRY_READING` and `GUN_EMPTY_UNPRESSED_READING` retired,
  `DRY_CLICK_FRAME_READING` new, `GUN_EMPTY_PULL_READING` re-filed (section 2.3, "LATER 179 + 48"; section 7).
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (SHA256 `b9e86376...1aaa42d4`, re-hashed for
  this note). The ELF `game/disc/socom2_game.elf` (SHA256 `06b83684...15798872`, Chris's pin, re-hashed) read only, by
  its program headers, for strings, vtables and instruction words. The disc's `RUN/SOUNDS/BNKSTORE.ZAR` and
  `RUN/SOUNDRDR.ZAR` through `Zar`, `parseBankFile`, `renderSound` and `soundScriptFromArchive`
  (`packages/viewer/test/gameplayAudioFollowupDisc.test.ts`). The desktop is not cited.
- Built on: [research 81](81-sounds.md) section 3 (`RANGE`, the square law, the pan), [research 122](122-the-ui-sounds.md)
  R122.4 (the sound object's vtable 0x406ac0: +0xc the unplaced play, +0x14 the placed), [research 80](80-the-jump.md)
  (line 50: `DAT_003def50` is "Ladderslide"), [research 86](86-traversal.md) section 7.5 (the traversal's sounds; its
  slide line is corrected here, section 6), [research 186](186-c7-audio-movie.md) and
  [research 205](205-r2-av-audio-card-world.md) section 2.1 (StopSound: the voices keyed off, heard through the tone's
  release), [research 304](304-original-gameplay-audio.md) (the gameplay audio audit that listed both as gaps, :123,
  :130).

## 0. Answers

| # | finding | port | section |
|---|---|---|---|
| 1 | A dry trigger's press plays `.GUN_EMPTY` (ELF 0x65f8f8) through the **unplaced** play: no place, the bank's own pan, full volume | `WalkSounds.fireEvent` on `dry`: `audio.play('.GUN_EMPTY', null)` | 2.1, 2.2 |
| 2 | Every one of the 22 multiplayer maps holds its own `.GUN_EMPTY` in `<map>_fx.bnk` (index 15), filed `ONESHOT` | no borrowing, no stand-in | 2.5 |
| 3 | One click per press when no magazine holds rounds (the limit 1); with one to take, the reload at once, and the click and the reload asked again each frame a refused reload's trigger stays down (PAR-93; was: "what the limit is beyond that is unread") | `GUN_EMPTY_PULL_READING`, `DRY_CLICK_FRAME_READING` (LATER 48; was `DRY_PULL_RETRY_READING`) | 2.3 |
| 3b | A second path clicks with no press: online, a refill weapon (research 312 section 3: a pistol; in a respawn game a primary but the MGL and the M79), every frame its magazine is empty and the timer still, with the reload asked at once (PAR-93; was: "by the weapon's type ... its conditions unread"); built by LATER 48 (`Fire.dryFrame`; was: "the click not built") | `GUN_EMPTY_PULL_READING`, `DRY_CLICK_FRAME_READING` (was `GUN_EMPTY_UNPRESSED_READING`) | 2.3 |
| 4 | Whether another console hears a remote player's click is unread; the port plays the page's own only and sends none | `GUN_EMPTY_REMOTE_READING` | 2.4 |
| 5 | `~LADDER_SLIDE` (ELF 0x65f558) is **one local placed handle held while the top action is "Ladderslide"** -- started once at the actor's place, moved with it each frame, stopped and released when the action ends; not one pass at the slide's start | `GameAudio.setLadderSlide`, driven by `TraversalPage.soundFrame` | 3.1, 3.2 |
| 6 | "Ladder -> slide" and "Ladderslide land" are other actions: no loop through either | the slide clip alone | 3.3 |
| 7 | The block runs for a local controller only: no remote player's slide is heard | no remote slide | 3.3 |
| 8 | Its gains follow each frame: `RANGE (80 100)`, squared, and the azimuth's pan; no Doppler | as the emitters' | 3.4 |
| 9 | Its stop is StopSound: keyed off, heard through the tone's release | the loop handle's `release` | 3.4 |
| 10 | 12 of the 22 maps hold it, in `<map>_am.bnk` (20 banks on the disc with the campaign's); the other ten are silent | no stand-in | 3.5 |
| 11 | The block's other gates (actor +0x5e1 bit 7, `FUN_005c3780`) and a death's path are not carried | `LADDER_SLIDE_LOOP_GATE_READING` | 3.3 |

## 1. Room and page

Both sounds are **the page's alone**. The room plays no sound and sends none: no new message, no protocol change, nothing
in `packages/server`. Both pages wire them: `main.ts` (the local page) and `matchMount.ts` (the menu-launched match's
second `TraversalPage`), each with `soundFrame()` beside the frame's other traversal calls; `WalkSounds.fireEvent` is
the one path both pages' firearms sound through (`matchSound.ts` `firearm.fireEvent`).

## 2. The empty click

### 2.1 The name and the handle

`FUN_005c7e00` (the kit's set-up) looks `.GUN_EMPTY` up by name (`FUN_00344f30(0x65f8f8)`) into the kit's +0x88c,
D:L480569-480570; the ELF's string at 0x65f8f8 is `.GUN_EMPTY` (re-read off the bytes). Its neighbours are
`.M4A1_RLD` (0x65f8e8 -> +0x888), `~LSR_DES_LOCK` (0x65f908 -> +0x890) and `~LSR_DES_MISS` (0x65f918 -> +0x894),
D:L480566-480574.

### 2.2 The play

`FUN_005c0fd0` (the kit's frame) plays the +0x88c handle through vtable **+0xc** with `(handle, 0, 0xff)`,
D:L476617-476620. Vtable 0x406ac0's +0xc is `FUN_00343550` (the unplaced play; the ELF's words at 0x406ac0:
`003455d0 00343550 00343500 00342b20 ...` from +0x8), +0x14 `FUN_00342b20` (the placed one) -- research 122 R122.4,
re-read here. Unplaced: no position and no `RANGE` gain; the pan is -1, which 989snd takes as the sound's own (`PAN_RESET`
in the port), at volume 1.0 (1024). Chris's ELF checks (the count load 0x5c13ac, the comparison with 2 at 0x5c13b0, the
dispatch 0x5c13c4/0x5c13c8) were re-read off the bytes: `8e620818 28410002 ... 8f39000c 0320f809` -- the load of +0x818,
`slti 2`, and the jump through +0xc.

### 2.3 The pull (GUN_EMPTY_PULL_READING)

The click sits in `FUN_005c0fd0`'s branch for a kit that may not fire (`FUN_005c0ae0` answering 0, D:L476569). Its
condition at D:L476616 is `(bVar11 && trigger state 1 or 2) || bVar6`: two paths.

**The pressed path** (`bVar11` and a press):

- the trigger is pressed: the controller's +0x118 state is 1 or 2 (D:L476592, D:L476616); `FUN_00597790`
  (D:L454354-454383) steps it 0 -> 2 on a press, 2 -> 1 held, 1/2 -> 3 on the release, 3 -> 0 at rest and 3 -> 2
  on a new press (D:L454362-454366);
- the pull's count (kit +0x818) is under the pull's limit (`FUN_005c0940`, D:L476283-476310, read at D:L476572 and
  compared at D:L476591), and under 2 for the click itself (D:L476618);
- then a reload starts when `FUN_005bdb00` answers non-zero (D:L476621-476622); otherwise the count rises
  (D:L476630-476631);
- the count is cleared at the release and at rest (`FUN_005c0ae0`, states 0 and 3: D:L476381-476382,
  D:L476399-476400).

When `FUN_005bdb00` answers 0 the limit is 1 (D:L476290-476292): one click a pull, the count raised to 1 by it and
cleared at the release -- which is what the port does (`Fire.pull` sends `dry` on the press's edge; one click per
press; since LATER 48, `Fire.dryFrame` each frame, below). What `FUN_005bdb00` (`FUN_005bda70`) answers, and so whether a dry pull's limit is ever above 1 (the fire
mode's 3 or 10000, D:L476294-476305), is unread: `GUN_EMPTY_PULL_READING`. Chris read the same lines as "+0x818 is the
current pull's count, including live shots, not an independent two-click counter" (kept, section 6).

**The unpressed path** (`bVar6`, D:L476596-476615; review F1 of 2026-10-14) needs no press. It is set when all of
these hold: `DAT_0045a0c1` is set (the network flag, reCOM's `theNetwork.m_bNetwork`, research 114); the weapon's
+0x7c is neither -0x72 nor -0x71 (D:L476597, D:L476601); and `FUN_003d1e10` answers 4 for the weapon (D:L476605-476606),
or `DAT_00437ce8`+0xdc is set and `FUN_003d1db0` answers non-zero (D:L476607-476610). It then clicks under the same
count test (D:L476618), runs `FUN_005c2a90` (D:L476622) and, when `FUN_005c0ae0` answers, `FUN_005be9a0`
(D:L476623-476628). What those weapon classes are, and when an online kit meets them, is unread; the port has no
such path: `GUN_EMPTY_UNPRESSED_READING` (until LATER 48, below: `Fire.dryFrame` builds it, the name retired).

**The complete original dry-fire state machine is not claimed** (Chris's disclaimer, kept): the port wires the dry
event `Fire.pull` already sends, and changes no ammunition, reload, fire-mode or input rule.

**PAR-93: the branch's gates, the unpressed path's set, every frame** (2026-10-14; reading, pending review; research
312 section 4.1 corrected with it).

- *The gates before both paths.* `FUN_005c0fd0` runs each actor frame (`FUN_005506a0` D:L417907). Its dry branch is
  reached only while the kit's timer is still (`kit+0x820` == 0, D:L476549-476563: a reload's `ReloadDelay` or a
  bolt's or pump's lock running shuts it) and `FUN_005c1970` answers (D:L476565-476568). `FUN_005c1970`
  (D:L476815-477151) reads no trigger: it answers 1 for any item in the hand (D:L477144, and straight for a controller
  whose vtable `+0x34` answers, D:L477147-477149) but on an explosive's or a placed item's release frame
  (D:L476883-477021) and with an empty hand (D:L476878-476879). `FUN_005c0ae0` answers 0 at rest and at the release
  (trigger states 0 and 3, D:L476380-476416), so the branch runs with the trigger up as well as on a refused press.
- *(a) The unpressed path needs no press* -- this section's reading stands; research 312 section 4.1's "when the fire is
  asked (`FUN_005c1970`, D:L476566)" was the one to correct. Its conditions, unread here at PAR-89, are research 312
  section 3's: `+0x7c` is the item's id byte (-0x72 = 0x8e = 142, the MGL; -0x71 = 0x8f = 143, the M79), `FUN_003d1e10`
  answering 4 is the pistol class, and `DAT_00437ce8`+0xdc with `FUN_003d1db0` is a respawn game's primary class: the
  network refill's set (`./net/netRefill` `netRefills`).
- *(b) Every frame, until a reload lands.* The count (`kit+0x818`, which a firearm's round raises too, `FUN_005be9a0`
  D:L475514-475517) rises only where no reload is asked (D:L476630-476631). `FUN_005bdb00` -> `FUN_005bda70`
  (D:L474519-474538) answers when any of the slot's ten magazines holds rounds. So with one to take, the pressed path
  asks the click (while the count is under 2, D:L476618) and `FUN_005c2a90` (D:L476622) every frame the trigger stays
  down until the reload lands (the magazine then holds rounds, D:L476575); the unpressed path does so every frame
  whatever the trigger. With none to take and no refill, the limit is 1 (D:L476290-476292): one click a press. The
  port asked once a press (`Fire.pull`'s edge: `DRY_PULL_RETRY_READING`) until LATER 48 (below). Whether a second play
  of the same `+0x88c` handle restarts the click (`FUN_00343550`) is not followed (`DRY_CLICK_FRAME_READING`).
- *(c) The reload's start is immediate*, offline as online: `FUN_005c2a90` is called in the same frame
  (D:L476621-476622), not through `FUN_005c32b0` (D:L477653-477680), which arms the record's `ReloadDelay` for R and
  the automatic reload only; `FUN_005c2a90`'s own gates (research 312 section 2.1) are the only wait. The port waited
  `ReloadDelay` offline (a frame for most records, 0.5 s for the Spas 12 and the JACKHAMMER, 1 s for the 870); since
  PAR-93 `Fire.pull` begins the reload at once (`fire.test.ts` "PAR-93").
- *(d) Room and page.* The room has no dry door: it starts a reload at the command the page's `reloadStart` names,
  with no delay of its own (`room.ts` `reload`); the page's dry reload now starts on the pull's command and the room's
  lock and still clip on the same one (`roomReloadDelay.test.ts` "PAR-93"). No room change.

**LATER 179 + 48: the dry branch each frame** (2026-10-20, the gameplay seat; reading, pending review; research 312
section 4.1 and research 94 section C1.1 with it).

- *The port runs the branch once a page frame* (`Fire.dryFrame`, viewer `fire.ts`): at the press (`pull`) and from
  `update` on each frame no round left, with the gates above -- the timer still (`reloadPending`, `afterShotPending`),
  an item in the hand (the walk's aim), the magazine in the weapon empty, the item a firearm (not `LOCK_EXEMPT`'s ten
  ids, D:L476579-476589). The pressed path: the trigger held with the pull's count under `FUN_005c0940`'s limit (1 when
  no magazine of the slot holds rounds, else the fire mode's); the unpressed path: online, a refill weapon
  (`netRefills`). The click while the count is under 2 (D:L476617-476620); `FUN_005c2a90` at once on the pressed path
  with a magazine to take, or on the unpressed path (D:L476621-476622); with nothing to take the count rises
  (D:L476630-476631).
- *A refused reload is asked again each frame* until its gates pass (in the air, mid-swap, the flinch, the
  binoculars), with the click while the count is under 2 -- each such frame a new one-shot play of `.GUN_EMPTY`. The
  page's frame is not the kit's: the reload lands on the first frame of either whose gates pass, but the clicks a held
  refused trigger plays are counted at the page's frame rate (`DRY_CLICK_FRAME_READING`, section 7).
- *The last round arms nothing* for an unmounted firearm of one projectile (`FUN_005c5340` D:L479296-479300, research 94
  section C1.1; LATER 179): its empty magazine reloads from this branch -- the trigger still held, on the next frame
  (with the click only when the emptying round was the pull's first, the count then 1); else at the next press; online
  a refill weapon with no press. Was: the page armed `ReloadDelay` at every firearm's last round.
- `GUN_EMPTY_PULL_READING` re-filed, `GUN_EMPTY_UNPRESSED_READING` and `DRY_PULL_RETRY_READING` retired (section 7).

### 2.4 Who hears it (GUN_EMPTY_REMOTE_READING)

`FUN_005c0fd0` runs per kit and reads the kit's controller's trigger state (D:L476592) without a local test around the
click; the same file's `FUN_005c0ae0` does test the controller's vtable +0x2c before it stops the kit's +0x89c handle
(D:L476386-476396). How a remote player's controller (`CRemoteCtrl`, vtable 0x669590) comes by a trigger state is not
read, so whether another console clicks for a remote player's dry pull is unread. The port plays the page's own click
and sends nothing (`NetPage.fireEvent` sends rounds and reloads only): `GUN_EMPTY_REMOTE_READING`. Chris's text: "The
original unplaced call does not by itself establish every original recipient" (kept).

### 2.5 The disc

Every one of the 22 multiplayer maps (`selectValidationMaps` over the disc's `RUN/MP*.ZDB`) holds `.GUN_EMPTY` in its
own `<map>_fx.bnk`, at index 15 on all 22, and renders a sound from it (voices and a peak above 0); `sounds.rdr` files
it `ONESHOT`, `RANGE (20 200)` in every `<map>_FX` set (the range is not applied to an unplaced play). The campaign's
`_fx` banks hold it too (`M99_fx.bnk` at index 67). No map borrows it.

## 3. The ladder slide's loop

### 3.1 The name and the handle

`FUN_005a49f0` looks `~LADDER_SLIDE` up by name (`FUN_00344f30(0x65f558)`) into `DAT_0044ce20` at the map's load and
clears the instance `DAT_0044ce28`, D:L461031-461032 (again in its twin, D:L461091-461092). `FUN_00344f30`
(D:L243197-243210) is the lookup -- the name's hash to a handle -- not a play.

### 3.2 The hold

In `FUN_00550ef0` (the actor's frame), D:L418407-418422:

- while the actor's **top action is "Ladderslide"** (`FUN_00577e40(actor, DAT_003def50)`, D:L418407: the action at
  actor +0x534, D:L437398-437411; `DAT_003def50` is "Ladderslide", research 80):
  - with no instance, one is started: `DAT_0044ce20`'s vtable **+0x14** (the placed play) at volume 1.0
    (`0x3f800000`) at the actor's place (actor +0x1c), D:L418415-418418;
  - with one, its place is moved to the actor's: `FUN_00347420` (D:L244477-244486 writes the handle's +0x10..+0x18),
    D:L418422;
- otherwise a running instance is stopped (`FUN_00347610`, D:L244547-244560) and released (`FUN_00347810`,
  D:L244597-244637), D:L418408-418413;
- and the same stop and release when the block's actor flag is clear (D:L418432-418435).

One global instance: one slide sounds at a time, the local player's.

### 3.3 Which frames hold it (LADDER_SLIDE_LOOP_GATE_READING)

- **The action.** `FUN_0057f3e0` (the slide's start) pushes `DAT_003def50` ("Ladderslide") and then `DAT_003def40`
  ("Ladder -> slide") over it, D:L441368-441369, so "Ladder -> slide" plays first and the loop starts with
  "Ladderslide"; `FUN_0057f310` (the landing) pushes `DAT_003def60` ("Ladderslide land"), D:L441338, which ends the
  loop. The port's `TRAVERSAL_CLIP.slide` (`seal_ladderslide`) is that action's clip; `toSlide` and `slideLand` are not.
- **The local controller.** The block runs only when the actor's controller answers its vtable +0x2c (D:L418346):
  `CSealCtrl` (vtable 0x6694b0) +0x2c is 0x5431f0, `jr ra; li v0,1` (`03e00008 24020001`); `CRemoteCtrl` (vtable
  0x669590) +0x2c is 0x5e6250, `jr ra; move v0,zero` (`03e00008 0000102d`), read off the ELF's bytes (Chris's reviewer
  read the same; the dispatch at 0x551a6c/0x551a70 and the zero branch at 0x551a7c: `8f39002c 0320f809 ... 104000d4`).
  So no remote player's slide is heard, on any console.
- **Not carried.** The block also needs `FUN_005c3780(actor + 0x5e0)` to answer non-zero (D:L418342) and the actor's
  +0x5e1 bit 7 (D:L418390); their writers are unread. Whether `FUN_00550ef0` runs for a dead actor is unread. The port
  holds the loop while the walk is on, the SEAL alive and the slide clip drawn: `LADDER_SLIDE_LOOP_GATE_READING`.

### 3.4 The gains, and the stop

A placed handle's gains are recomputed each frame from the place it holds: `FUN_00346ea0` re-runs `FUN_00342670` (the
`RANGE` gain and the pan) on the handle's +0x10 and sends the result, D:L244355-244369. Its Doppler step
(D:L244356-244367) runs only for a sound whose object carries +0x1d bit 0, which `FUN_003435c0` sets for the script's
`DOPPLER` key (0x3f7760, D:L242401-242403); `~LADDER_SLIDE` has none (2.5's test). The port: `RANGE (80 100)` by the
script, the gain squared (989snd's law) times the azimuth's pan pair, every frame from the listener -- the emitters'
arithmetic (research 81 section 10).

The stop, `FUN_00347610`, is 989snd's StopSound (`FUN_00340330`, research 186): the voices keyed off, heard through
their tone's release, as a bed's stop is (research 205 section 2.1). The port releases the loop through the bank
sound's release (`soundRelease`, as the beds' `releaseOf`) and lets the tail finish: a new slide's play
(D:L418415-418418) does not touch the old voice, so the port frees each released loop once its release has run
(review F2 of 2026-10-14; it cut the tail at the next slide before), and a teardown ends it at once. The loop's render length and its fade are research 81's named placeholders (`./loopLength`), not new here.

### 3.5 The disc

`~LADDER_SLIDE` is in the `_am.bnk` of 12 of the 22 maps -- MP2, MP5, MP8, MP10, MP61, MP62, MP64, MP71, MP72, MP73,
MP81, MP82 -- and in none of the other ten maps' own banks; 20 banks on the disc hold it (those 12 and the campaign's
M51, M52, M61, M62, M63, M71, M81, M83). `MP2_am.bnk` holds it at index 68. Every `<map>_AM` set that lists it files it
held (not `ONESHOT`), `RANGE (80 100)`, no `DOPPLER`. The ten maps without it have no slide sound: no stand-in, no
borrowing (a borrowed bank lends only the names it was borrowed for, and this is not one). Which maps have a ladder at
all is not this note's (asset availability, not reachability).

Chris's render comparison (fixed random 0.5; identical `.GUN_EMPTY` output on all 22, five decoded-output groups of
`~LADDER_SLIDE`: MP2/5/8/10/61/73/82; MP62/72; MP64; MP71; MP81) is kept as his source inspection; it was not re-run
for this filing and nothing in the port rests on it.

### 3.6 The port

`TraversalPage.soundFrame` (each frame, both pages) hands `GameAudio.setLadderSlide` the drawn feet while the slide
clip plays and null otherwise; `setLadderSlide` starts one loop, moves it, and lets it go; `stopTransient` and a new
map's `setData` end it. The traversal's `ladderSlide` event no longer plays a one-pass `~LADDER_SLIDE`. The worker
renders the loop with the beds (`ambienceLoops`), so a page made without `inline` plays it; before the render arrives
the page plays nothing for it. `AudioStats.ladderSlide` is a browser diagnostic (whether the loop is held).

## 4. Not in this row

From Chris's "Deferred after rereading", kept as his and not built: the pin-pull `.GREN_PIN_PULL1` (on every map's
banks, no original trigger established); the remote throw grunts (`throw_whoosh` -> `.MALE_GRUNT` locally;
`FUN_005e6400`, D:L497367-497495, does not settle a remote pre-release callback); `borrowMissing`, `SOUND_NAME_FIXES`
and `SOUND_FALLBACKS` as separately identified deviations; the missing `.GREN_ASPHALT`, `PT_0263B.VAG` and the
unresolved `^PT_0242`, left unfilled.

## 5. The tests

- `packages/viewer/test/audio.test.ts`, "the empty click and the ladder slide's loop": the dry click unplaced
  (`PAN_RESET`, 1024), once per dry event, no round or reload; the slide one placed loop (started once, moved, its gains
  from range and pan, silent past 100 but held), stopped on null, `stopTransient` and `setData`; released through its
  tone's release, the tail ended by the next slide or a teardown; a map without it gets no loop and no play; the
  worker's render, and nothing on the page's thread before it.
- `packages/viewer/test/traversalPage.test.ts`: the real slide down the test ladder sounds the loop on the slide clip
  alone, following the feet, none on "Ladder -> slide", let go at the end; the clip gate (ladder, `toSlide`, `slideLand`
  none), a death, the walk's end and no mover each let it go; the page lends no one-pass play.
- `packages/viewer/test/gameplayAudioFollowupDisc.test.ts` (dev-disc): section 2.5's and 3.5's counts.
- `packages/viewer/e2e/gameplayAudioFollowup.spec.ts`, `gameplayAudioSlide.spec.ts`: Chris's two browser specs, brought
  over as written; **not run** at PAR-89 (no browser in its slot).

## 6. Against earlier text (history kept; those notes are not edited by this row)

- **Research 86 section 7.5** and `traversalPage.ts`'s header (until this row) said the slide's `~LADDER_SLIDE` is
  sent "at its start (`FUN_00344f30`, decomp 461031; the audio plays one pass of it)". `FUN_00344f30` at D:L461031 is
  the handle's lookup at the map's load (3.1); the play is `FUN_00550ef0`'s, held for the action (3.2). The header is
  corrected here; research 86 is re-filed when it is next edited.
- **Research 304** (:123, :130) lists the empty click as "asset identified; trigger still required" and the slide as
  "existing one-pass handling ... a gap": both are this row's.
- **PAR-93 (2026-10-14), this note's own text.** Section 0 row 3 read "what the limit is beyond that is unread" and
  row 3b "online, by the weapon's type; not built, its conditions unread"; section 2.3's unpressed path read "the
  weapon's +0x7c is neither -0x72 nor -0x71" as weapon types and "What those weapon classes are, and when an online kit
  meets them, is unread". The +0x7c bytes are the MGL's and the M79's ids and the classes the network refill's set
  (research 312 section 3); `FUN_005bda70` is read; the path runs every frame (2.3, "PAR-93"). The pressed path's one
  click a pull holds only where no reload is asked. Section 7's two rows are re-filed with the old text kept in them.
- **Chris's text, where this filing reads differently:** his "+0x818 is the current pull's count, including live shots,
  not an independent two-click counter" -- this filing reads the dry branch's count as raised only when no reload follows
  and its limit as 1 when `FUN_005bdb00` answers 0 (2.3); both stand, the limit's other values unread. His port stopped
  the slide's loop at once; this filing gives the stop its tone's release (3.4). His citation of `FUN_00550ef0`
  D:L418342-418435 is kept (3.2, 3.3 narrow it).

## 7. Placeholders and readings

| name | where | reading | settles |
|---|---|---|---|
| `GUN_EMPTY_PULL_READING` | viewer `walkSounds.ts` | 1: one click per press of a dry trigger with no magazine to take -- `Fire.dryFrame` sends `dry` on each frame of the dry branch that asks it, `(bVar11 && pressed) || bVar6` (D:L476616), while the count (kit +0x818) is under 2 (D:L476618): the pull's limit 1 when no magazine of the slot holds rounds (`FUN_005c0940` D:L476283-476310, `FUN_005bdb00` -> `FUN_005bda70` D:L474519-474538), the count raised when no reload follows (D:L476630-476631) and cleared at rest and the release (D:L476381-476382, D:L476399-476400). With a magazine to take, the click and the reload at once; refused, both asked again each frame (`DRY_CLICK_FRAME_READING`); online a refill weapon's with no press (`bVar6`, D:L476596-476615). Re-filed 2026-10-20 (LATER 48; reading, pending review); was: "one click per press ... on the pressed path ... a refused reload's held trigger re-asks the click every frame while the count is under 2 (`DRY_PULL_RETRY_READING`) ...; the unpressed path is `GUN_EMPTY_UNPRESSED_READING`" | a capture of a held dry trigger in each fire mode, in the air and on the ground |
| `GUN_EMPTY_UNPRESSED_READING` (retired) | viewer `walkSounds.ts` | `'not built'`: `FUN_005c0fd0`'s `bVar6` path (D:L476596-476615) clicks with no press online (`DAT_0045a0c1`) -- PAR-93: for a network refill weapon (+0x7c the item's id, not 142 the MGL or 143 the M79; class 4, a pistol; or in a respawn game a primary class: research 312 section 3), every frame its magazine is empty, the kit's timer still (D:L476549-476563) and `FUN_005c1970` answering (no trigger read, D:L476815-477151), while the count is under 2 (D:L476618), then `FUN_005c2a90` and, when `FUN_005c0ae0` answers, `FUN_005be9a0` (D:L476621-476628); the port asks the reload on the press only (NET-REFILL's dry door) and plays no unpressed click; was: "for a weapon whose +0x7c is neither -0x72 nor -0x71 ... the weapon types at +0x7c" unread | a capture of an online pistol run dry in the air and landing with the trigger up: the click's frames and the reload's (ONL-32); retired 2026-10-20 (LATER 48: the unpressed path built in `Fire.dryFrame`, its click under `GUN_EMPTY_PULL_READING` and its cadence `DRY_CLICK_FRAME_READING`) |
| `DRY_PULL_RETRY_READING` (retired) | viewer `fire.ts` (`pull`) | `'the press only'` (PAR-93): the port asks the dry click and the reload once a press; the original re-asks both every frame until a reload lands -- the pressed path while the trigger stays down, the unpressed path whatever the trigger (2.3, "PAR-93" (b)); not built: the online lane's LATER 48 | a capture of a dry pull refused in the air (offline, a rifle with a magazine left; online, a pistol run dry) and the landing frame; retired 2026-10-20 (LATER 48: the branch runs each page frame, `Fire.dryFrame`; replaced by `DRY_CLICK_FRAME_READING`) |
| `DRY_CLICK_FRAME_READING` | viewer `fire.ts` (`Fire.dryFrame`) | `'each page frame'` (LATER 48, 2026-10-20): the dry branch runs once a `Fire.update`, the page's frame, where `FUN_005c0fd0` runs once a kit frame (`FUN_005506a0` D:L417907). The reload lands on the first frame of either whose gates pass; only the click's count differs: while a reload is refused (in the air, mid-swap, the flinch, the binoculars) and the count is under 2 (D:L476618, not raised on the reload's path, D:L476621-476631), each frame plays `.GUN_EMPTY` again -- a new one-shot play of the kit's `+0x88c` handle (vtable `+0xc`, `FUN_00343550`; research 122 R122.4) -- at the page's frame rate, not the game's; what 989snd makes of a one-shot played every frame (its voices, a steal) is not followed | a capture of the click's cadence with a dry trigger held through a jump (offline) and a pistol fired dry in the air online; or reading 989snd's replay of a one-shot handle already playing (`FUN_00343550` on) |
| `GUN_EMPTY_REMOTE_READING` | viewer `walkSounds.ts` | `'local'`: the page's own click only, none sent; how `CRemoteCtrl` comes by a trigger state (+0x118) is unread | reading `CRemoteCtrl`'s writer of +0x118, or a two-console capture of a dry pull |
| `LADDER_SLIDE_LOOP_GATE_READING` | viewer `traversalPage.ts` | `'walking, alive, the slide clip'`: the top action "Ladderslide"; `FUN_005c3780(actor + 0x5e0)` (D:L418342), actor +0x5e1 bit 7 (D:L418390) and a dead actor's path not carried | reading those writers and the death's path through `FUN_00550ef0`, or a capture of a slide ended by a death |

## 8. Evidence, apart

- **Unit tests** (vitest, this build): `audio.test.ts`, `traversalPage.test.ts`, with the RED and GREEN runs in
  PAR-89's report (the plan's Log).
- **Dev-disc test** (this build): `gameplayAudioFollowupDisc.test.ts` on `SOCOM_DISC`.
- **Source inspection** (this filing): the decompilation's lines and the ELF's bytes cited above.
- **Not run for this build:** a browser, the two e2e specs, the typecheck, the gate, a physical listening test, a
  capture of the original.
- **Chris's evidence** (`14ece5c69:socomlegacy/docs/gameplay-audio-followup-results.md`, his branch, not this build): a
  focused unit and dev-disc run (126 passed); two-client rendered Chromium runs, 3 passed (MP2, MP51, MP72: two clicks
  per actor over two pulls, none on the other client); a rendered local slide, 1 passed (one worker-prepared loop,
  stopped at the landing); a review PASS WITH FINDINGS of his source reading. His playtest page
  (`14ece5c69:socomlegacy/docs/gameplay-audio-followup-playtest.md`) is a listening checklist, not run. No original-game
  comparison was made by him or here.
