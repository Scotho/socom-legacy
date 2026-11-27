# 448 -- The activation-2 rule: a zAnim sequence nothing names never runs (Desert Glory's burn barrel)

- Date: 2026-11-18. Branch `agent/wm-effects-act2` (worktree `wt-wm-effects-act2`), base `origin/agent/next` cb2e8608d2
  (the claims commit). This is the weekend mega sprint's effects lane, at the main controller's word ('Weekend mega
  sprint controller handoff', 2026-11-18): GO on the root rule, for the next patch, not the 2026-11-19 release
  candidate. The source is the bugs intake after v0.4.23, item 5 (`agent-mail/handoffs/bugs-intake-v0423-2026-11-16.md`).
- Track: simulation (what the game draws and plays). Status: **reading, pending review**. Section 1 is transcribed from
  the r0001 decompilation (`socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`, never pasted) by the author;
  section 2 is the disc through the repository's readers. A fresh reviewer who re-reads both at the source is owed.
- Evidence kinds, kept apart: **(D)** source inspection of the decompilation; **(M)** the disc's data through the
  repository's readers (`tools/dump-effects.ts`, `tools/activation-census.ts`, run 2026-11-18 on PC 3 against
  `SOCOM_DISC`); **(U)** unit and fixture tests of the port (`viewer/test/effectRunner.test.ts`,
  `viewer/test/activationTwoFixture.test.ts`, `scene/test/activationGuards.test.ts`, the sound catalog's test);
  **(C)** the owner's capture of the original (the intake: the barrel's flame, no glow); **(O)** the original on the rig
  -- owed and mandatory (section 5); **(B)** a rendered browser run -- owed (section 5).
- New names: none. No placeholder is added or struck. The rule replaces research 89 §12's "activation rule" second
  sentence (corrected there).

## 0. The answer

1. **What the owner saw** (the intake, his words): "the burn barrel in our port has the wrong light coming out of it,
   looks strange. here's what the original looks like". His capture of the original shows Desert Glory's (MP6) burn
   barrel with its flame on top and **no glow** on the barrel or the ground.
2. **The light is data the original never runs** (D, M). MP6's ambient program `flame_in_barrel` holds a `LIGHT` (an
   orange lerped light, 0x44, reaching 30-38 units, flickering for ever) in its seventh sequence. That sequence's word is
   0x104, activation 2. The original starts an animation's activation-1 sequences only, and runs an activation-2
   sequence only when a start by name reaches it. Nothing names this one, so it never runs.
3. **The port ran it** (U). The effect runner started every activation-2 sequence that no `CALL_SEQUENCE` of its own
   program named (research 89 §12's rule, `effectRunner.ts` before this head). The rule had been read off
   `shell_eject`, whose 0x104 sequence is its `Anim_Params` activation guard, run by its offset (+0x12), not an
   uncalled sequence.
4. **The same rule, everywhere** (M, section 2): the port also ran the C4 blast's four extra sequences (a smoke column, a
   second light, two fire bursts), the smoke grenades' sparks and fire flash, Desert Glory's `mp6_battlesounds` `test`
   (a trail object, `testexplode`, flown at random), and others. Its world sound emitters looped crickets, frogs,
   chickens and a water leak that the original never starts. The crickets (MP73, M61) and the frogs (M62) were audible
   in the port; the water leak (MP51) and the chickens (M51) name sounds in no bank of their map and were silent
   (section 2). This head fixes the rule at its root, for every map and every consumer.

## 1. The original's sequence start (D)

- **The instance's start** (`FUN_0026ae20`, D:L115457-115509, called from the instance tick `FUN_00270220`
  D:L118623-118662 while the instance's state is 2): for each sequence of the animation whose state byte (+5) is not
  0, a sequence whose word byte +4 shifted right by one is 1 (activation 1, word 0x102) is put in state 2 (started).
  **Every other sequence is put in state 1.**
- **The step** (`FUN_00269da0`, D:L114845-114910): a sequence in state 2 or 3 is reset to its first command and set
  running (4). A sequence in state 4 runs its commands. **Any other state returns at once**: state 1 runs nothing.
- **Running** (`FUN_00269cc0`): states 2, 3 and 4 are running; 1 and 5 are not. The instance tick ends the animation
  when no sequence is running after its walk (D:L118642-118654). So **an animation whose only sequences are
  activation 2 and never started ends on its first tick.**
- **The only other start** (`FUN_00269b00`, D:L114701-114760): given a name, it walks the animation's sequences and
  puts the **first one of that name that is not running** in state 2. In the whole decompilation, the only writers of
  a sequence's state 2 by a literal store are `FUN_0026ae20` (activation 1) and `FUN_00269b00` (D:L114734, D:L115469; the
  other matches of the pattern, `FUN_002c9540` D:L168880-168900, are a configuration reader's own structure). The
  generic state setter `FUN_0026a040` (D:L114916-114937) writes a state passed to it: state 2 from `FUN_0026d870`
  (D:L117117), the `Anim_Params` offset path, which puts the sequence back to state 1 after its one step (D:L117121);
  state 3 from `FUN_0025ede0` (D:L108471), `LOOP`'s restart of the sequence already running (the review's finding 1).
- **Who calls `FUN_00269b00`**:
  - `CALL_SEQUENCE` (command 50): `FUN_0025d270` (D:L107342-107352), the name from the command's +4 in the running
    animation's table;
  - `OBJECT_MOTION` (command 21; its tick `FUN_00261370`, registered at D:L106885): at a bounce, the sequence named by
    the hit polygon's material entry (D:L110308-110320; `effectMotion.ts` `MotionMaterial.sequence`) -- and with no
    entry, or an entry whose sequence field is 0, the sequence the command's own byte +0x0a names (a local name index),
    when that byte is not 0 (D:L110311-110314). The decompilation drops the index argument; the r0001 image's
    instructions give it: the jal at 0x2620e4 passes the byte +0x0a (the default, guarded at D:L110312) and the jal at
    0x2620b4 the material's field `(u16 +2 >> 2) & 0xff` (the else, D:L110318) (atlas-waves' image read, cited by address;
    r0004's twin `FUN_00261ee0` the same branch, D4:L116747-116756). On the disc no material entry has a non-zero
    sequence field and only `common/drop_cigarette` sets +0x0a (4 = `bounce_sparks`, all 34 maps), so on retail data the
    default is the only bounce start (atlas-parity's check, `scratch/effect-0a/reading.md` in the atlas's local layer);
  - `FUN_00271950` (D:L119557-119572), the game's own start of a named sequence on an animation, called from
    `FUN_005f37c0` and `FUN_005f41f0` (D:L504441, D:L504675). Its names are the AI's: `on_respawn` (0x65ca90),
    `on_pullout` (0x65e528), `on_aware0-4` through `FUN_00575210`, and at D:L506862 a name a virtual call returns (not
    resolved here; it reaches only an AI object's own animation). None of these starts names an effect sequence section 2
    lists -- though two of those names are strings of the image: `NA` at 0x003e4870 (D:L70799, D:L70808) and `test` at
    0x0065ced0 (D:L436057), virtual addresses (0x2d3e70 / 0x48f5d0 are their file offsets) -- the strings and the
    offset-to-address step are atlas-waves' read of the r0001 image; the cited lines show only the address literals.
- **The `Anim_Params` offsets** (research 106 §1, §2): damage +0x10, activation +0x12, execution +0x14, cleanup +0x16
  name sequences the runtime runs by those offsets (`FUN_0026d870`), whatever their activation word. They are not this
  rule. The port keeps its own handling of them unchanged: the cleanup as PB-9b built it, the other three run from the
  start as before (`EffectProgram.guards`).
- **So**: an activation-2 sequence that is no `Anim_Params` offset and that no `CALL_SEQUENCE`, `OBJECT_MOTION`
  material or default or game start names **never runs**. `FUN_00269b00` has no reserved-name test (D:L114720-114751):
  a start naming `NA` takes the first `NA` that is not running, and in `flame_in_barrel` that is sequence 0 (its sound, done at once).

## 2. What the disc holds (M)

**MP6's `flame_in_barrel`** (`tools/dump-effects.ts MP6 flame_in_barrel --mission`): flags 33 (self-starting), root
`barrel_fire1` (world (1967.73, 8.00, 1786.68), the scene graph), `seqOffsets` [0, 0, 0, 0], every sequence named `NA`,
no `CALL_SEQUENCE`:
- sequences 0-4, word 0x102: the sound `~FIRE_SM` and four particle sources at `barrel_fire1` (`main_barrel_fire`,
  `barrel_fire_a_lapping1` on `fire_hardedge.tif`; `barrel_sparks`, `fire_smoker1` on `cloudpuff01.tif`);
- sequence 5, word 0x102: an empty `WHILE` for ever (it keeps the animation alive);
- sequence 6, word 0x104: a `LIGHT` at node 1, offset (0, 2, 0), rgb (127.5, 89.25, 0), opacity 28.8, blend 0x44,
  range key [0, 7, 30], then a `WHILE` for ever of the same light with nine range keys over 1.65 s (7-12 / 17-38).
  **Never started** (section 1).

**The sounds those emitters name** (the maps' `_AM` banks through `@s2u/sound`'s `renderLoopAtLeastOneVoice`, 40 s):
`~CRICKET_1/2/3` (MP73) render 18 / 90 / 29 voices, a chirp train with its fundamental at about 4.4 kHz (and 8 kHz), one
chirp every ~0.4 s, peak about 0.010 at full volume. `~FROG_01` (M62) renders its first voice at 15.1 s. A 5 s render
(`tools/dump-sounds.ts`' default) shows none: the loops' first voices can wait (`sound.test.ts`: "their first chirp can
wait 16.7 s"). `~WATER_LEAK` (MP51) and `~CHICK_COOP` (M51) are in no bank of their map (silent either way). So the
crickets and the frogs are the audible part of this head.

**The census** (`npx tsx tools/activation-census.ts --effects`, the 34 maps' `CZANIM.ZAR` and `MZANIM.ZAR` under
`SOCOM_DISC/RUN`): 6,170 activation-2 sequences: 2,781 named by their program's `CALL_SEQUENCE` or `OBJECT_MOTION` (named
by any sequence of the program, started or not: a static count; the code takes the fixed point, so a few of these are named
only by sequences that never start -- `smoke_grenade`'s `sparks_a_flyin2/3`), 613
`Anim_Params` offsets, 1 named but shadowed (M62's `objectives` `failure`), 2,775 uncalled by the tool's count -- which
does not read `OBJECT_MOTION`'s +0x0a default (section 1), so 34 of them, `drop_cigarette`'s `bounce_sparks` on each
map, are reached at a bounce: **2,741 uncalled** (re-run at this correction: the tool still prints 2,775; its
`bounce_whisps` was already counted as named, by `bounce_sparks`' `CALL_SEQUENCE`). Most uncalled sequences are
the campaign AI's `on_aware*` / `on_corpse` / `on_pullout`, which the game starts by name (section 1) and which no effect
runner of the port plays. Those the port played, and which this head stops:

| program (set) | sequence(s), uncalled | what the port drew or played | maps |
|---|---|---|---|
| `flame_in_barrel` (mission) | 6 `NA` | the barrel's orange flickering light (the owner's report) | MP6 |
| `c4` (common) | `c4_smoke2`, `c4fire_explode5`, `c4fire_explode`, `c4fire_explode2` | a smoke column, a second lerped light, two fire bursts on every C4 blast. The original's C4 is `CALL_ANIMATION he_grenade` + `c4_sound` (`.C4_EXP_1`) | all 34 |
| `smoke_grenade`, `red_smoke_grenade` (common) | `sparks_a_flyin` (and the `sparks_a_flyin2` / `sparks_a_flyin3` it chains to), `fire_flash` | three spark fly-ins, a second `!SMK_CANISTER` and a fire flash at the pop | all 34 |
| `SparkExplodeLarge` (common) | `White` | a white particle burst | all 34 |
| `chunk_gray_small_mf`, `flybits_claymore` (common) | `stop_trail` | a trail source | all 34 |
| `drop_cigarette` (common) | `bounce_sparks` -- **not uncalled in the original**: its bounce starts it through +0x0a (section 1); the port stopping it is a departure, inert while the port plays no smoking guard (atlas lead L259; L349 is the same finding from the -3 row) | a call of its own sequence | all 34 |
| `fire_large`, `fire_med`, `fire_smoke_30`, `fire_very_large` (common) | `SoundCall` (+ `fire_very_large` `SmokeShrinker`) | `~FIRE_SM` from the effect (the world emitters already skipped it: not self-starting); a smoke source | all 34 |
| `mp6_battlesounds` (mission) | `test` | random `CALL_ANIMATION testexplode` in a loop: a dummy node flown by `OBJECT_MOTION` with a particle trail (`testtrail`), no sound. The distant battle itself (`burst1-3`, `flash*`, `.EXP_DISTANT`) is called from its activation-1 sequences and stays | MP6 |
| `cricket_sound01`-`06` (mission) | `cricket` (the only sequence) | world emitters `~CRICKET_1/2/3` | MP73 (01-06), M61 (05) |
| `frog_sound01`-`03` (mission) | `frog` (the only sequence) | world emitters `~FROG_01/02` | M62 |
| `chicken_coop1`, `chicken_coop2` (mission) | `coopsound` (the only sequence) | world emitters `~CHICK_COOP`, `~ROOSTER` | M51 |
| `water_drain` (mission) | 2 `NA` | world emitter `~WATER_LEAK` | MP51 |
| `bar_part_fly` (mission; `bar_part_fly1-3` on M81) | `some_fire_chasers` | a particle source on a flying part when the bar is destroyed | MP6, M81 |
| `badhelo_anims` (mission) | `gunmover` | a forever `OBJECT_MOTION_FROM_TO` loop on the helicopter's gun | M62 |
| `m62tut01` (mission) | `VOline` | a sound (a voice line) | M62 |
| `tank1move` (mission) | `recoil` | a turn and a motion: the tank's recoil | M71 |
| `ambient_lab_fire`, `ambient_chopper_fire` (mission) | `goalways` | an empty forever `WHILE` that kept the animation alive: in the original it ends when its other sequences do | M81, M83 |
| `to_scope_lens_fx`, `to_starlight_scope_lens_fx` (mission) | `reset_iris_effect_dark/light` | none: the lens rows are read by name (`lensFx.ts`), not run | all 34 |
| `objectives` (mission) | `game_over2`, `Music2`, comments | none: the world skips `objectives` (`worldState.ts`), `roundCues` reads its sequences by name | MP2, MP5, MP51, MP64, MP8, MP81, M51, M52, M73 |

## 3. The port, before and after (U)

- **Before.** `EffectRun`'s constructor (`viewer/src/effectRunner.ts`) left a sequence of activation 2 waiting only when
  its own program's `CALL_SEQUENCE` named it; every other ran from the start. `@s2u/sound` `zanimSounds` /
  `zanimEmitters` took a self-starting animation's `~` loops from every sequence. The forge's disc ambients
  (`forge/forgeObjects.ts`) took their light, particles and loops from every sequence.
- **After.** One rule, `@s2u/scene` `sequencesReached` (beside `decodeEffectProgram`, which now carries
  `EffectProgram.guards`): a sequence is reached when it is activation 1, an `Anim_Params` guard (offsets +0x10/+0x12/
  +0x14), or named by its program's `CALL_SEQUENCE` or an `OBJECT_MOTION` material. The runner starts activation 1 and
  the guards (as before) and leaves every other sequence idle until a start by name: its program's own `CALL_SEQUENCE`
  (`EffectRun.callSequence`, which a host could call too; none does today). The sound catalog and the forge read only
  reached sequences.
- **Not changed.** `CALL_SEQUENCE`'s own reach: the original starts the first sequence of the name not running and
  leaves a running one alone; `EffectRun.callSequence` restarts every sequence of the name, running or not -- LATER 1195
  (claimed 2026-11-18; its row is entered at this head's merge). No host of the port calls `callSequence` today; the port
  never starts an `OBJECT_MOTION` material's sequence (the review found no activation-2 sequence on the disc named only by
  one: 0 of 30,604), nor the command's `+0x0a` default (section 1): `sequencesReached` leaves `drop_cigarette`'s
  `bounce_sparks` and `bounce_whisps` unreached -- a departure, inert while the port plays no smoking guard (atlas lead
  L259, atlas-parity's `docs/atlas/readings/l259-effect-motion-default-start.md`; L349 is the same finding from the -3 row).
  The guards' own timing (`FUN_0026d870`'s single 1.0 s step, research 106 §2) -- the port runs them as ordinary
  sequences from the start, as before.

## 4. Tests

- RED `9b6e048a00` (fails at the base): `effectRunner.test.ts` (an uncalled activation-2 sequence never runs; an
  animation of only uncalled ones ends at once; a host start still reaches one; a guard keeps its run), the existing
  "called sequence waits" test's uncalled `gate` no longer runs; `activationTwoFixture.test.ts` on MP6 (the barrel's
  light never begins; `c4` begins `he_grenade` and `.C4_EXP_1` only; `mp6_battlesounds`' `test` never calls
  `testexplode`); `scene/test/activationGuards.test.ts` (the decoded guards). The sound catalog's RED: MP51's
  `water_drain`, the crickets, frogs and chickens start no emitter; activation-1 and `CALL_SEQUENCE`-reached loops still do.
- The Frostfire effects pin (`scene/test/golden/effectsFrostfire.json`) carries `guards: [1]` on `shell_eject`,
  `shell_smoke_med` and `shell_smoke_big`.

## 5. Owed

- **(O) the original on PC 3's rig, mandatory** (the controller's ruling; `seats/from-wm-effects/REQUEST-act2-proven-rig.md`).
  Captured 2026-11-18 08:04-08:38Z by shadow-relay-3 (PCSX2 2.8.2's own GS capture, disc SCUS-97275, r0004; the rig's
  record `spc-logs/wm-effects-act2/LOG.md`, not in git; not scored by a harness):
  - MP6's burn barrel, 11.3 and 25.3 units from `barrel_fire1`, 5.6 s each: the flame and sparks, **no glow** on the
    barrel or the ground -- as the owner's capture, as section 1 reads (frames read by the author; the port's frames
    at the same poses: (B) below).
  - The C4 blast (MP6's `access1`): the flash and one fireball at the barricade, the corridor lit; the planter dies
    within 0.4 s and the death camera leaves the blast, so what follows the flash is **not seen**: a retake with the
    body kept alive is asked.
  - The smoke grenade (AN-M8): it landed out of view; the smoke rose from about 5 s. **The pop is not seen**: a
    retake is asked.
  - MP73's crickets (30 s by `dcrik02`, 26 s by `dcrik05`) and MP6's battle spot (30 s): **inconclusive**. A narrowband
    detector (4.4 kHz against 2.9 / 3.7 / 5.1 kHz, 20 ms frames, periodicity at 0.2-0.6 s) finds the port's rendered
    chirps (r 0.69-0.76 at 0.38-0.42 s) and nothing in the MP73 captures beyond MP6's cricket-free baseline (r 0.22-0.27
    against 0.33). But the port's own chirp mixed into MP6's capture at full render level is not found either (r 0.30):
    the rig's ambience and music mask it. The crickets' and frogs' removal rests on section 1 (reading, pending review).
  The level: for the barrel's light and the smoke grenade's pop (the retake below), the original's frames agree with the
  reading -- still a reading, the frames not scored by a harness; the C4's stays reading, pending review (the MP73
  comparison below is inconclusive), on section 1's strength.
- **(B) the port, head against base** (PC 3, `pw-run.sh`, 2026-11-18 08:56-08:59Z; a throwaway spec, headed Chrome, the page
  on WebGL2 by its status line; free camera at the rig's poses; head f825511a72, base cb2e8608d2; frames in
  `spc-logs/wm-effects-act2-port/`, not in git; read by the author):
  - the barrel from 25.3 units: at the base, a yellow-orange glow on the ground round the barrel's foot and its side;
    at the head none -- the head matches the original's frames;
  - the C4 at access1 from 40 units, about 1 s in: at the base a denser cloud and more burning bursts than at the head,
    which shows `he_grenade`'s alone;
  - the smoke grenade: the spec's pose put the barrel between the camera and the pop (the author's error), so the port's
    pop is not seen; the original's pop (the rig's retake `smoke-4`) shows grey puffs only, no sparks and no flash.
- **(O) retakes** (2026-11-18 ~08:55Z): the smoke grenade's pop seen in the open (`smoke-4`): grey puffs only -- as
  section 1 reads. The C4 with the planter alive: not achieved on MP6 (the planter dies at 30 units, part healths held
  or not); on Sandstorm (MP73, 2026-11-18 10:04-10:05Z, two takes): access2's charge (the prompt at 839.53, 52.4,
  1683.2 facing +z), the body written 50 units back to (840.0, 63.8, 1634.0) facing it, alive; the camera on the breach
  ~8 s. Seen: at the flash the whole scene lit warm, then a large orange-yellow fireball of puffs to ~0.4 s, grey from
  ~0.6 s, a grey cloud to the take's end.
- **(B) the C4 on MP73, head against base** (PC 3, `pw-run.sh`, 2026-11-18 ~10:55-11:00Z; WebGL2; free camera behind
  the rig's body pose; one blast per time, frozen by `pauseEffects` at 0.1-6.2 s, the actual times recorded -- some
  froze late on a hitch: frames `spc-logs/wm-effects-act2-port/c4-mp73-{head,base}/`, not in git; read by the author):
  both draw `he_grenade`'s flash on the barricade, its burning debris and its grey smoke; the base alone draws a round
  bright spot projected on the barricade at 0.19-0.34 s (`c4fire_explode5`'s lerped light); no extra fire burst is
  distinguishable at these times. **Inconclusive against the original**: the original's large fireball covers where
  that spot would fall, so its frames neither show nor exclude it. **A separate finding, outside this head**: the
  original's fireball is far larger than either port tree draws at this pose -- neither `he_grenade` alone nor the base's
  extras account for it (filed for the controller's ruling).
- A fresh review that re-reads section 1 at the source and re-runs the census.
