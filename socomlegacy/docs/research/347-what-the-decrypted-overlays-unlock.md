# 347 -- What the decrypted overlays unlock: research 101's ledger, row by row (LATER 272)

- Date: 2026-10-22. LATER 272, on the owner's word with H270 (2026-10-22 ~03:00Z): "Include a followup task for that which
  is a research dump that includes additional information that this unlocks for the project, anything we may have missed
  for paritry." The online seat (redotcom-e0); branch `agent/later-272` from `ce364f643` (research 346).
- Status: **a classification of the ledger** -- reading only. Research 101's open rows were each read and filed by what
  the game's decrypted code would settle for them; nothing was run, no value read, no constant changed. The filing is two
  readers' first pass over halves of the rows, spot-checked against the rows by the seat (§8); a row's category is a
  judgement, not a measurement.
- Review: a fresh review of `6ca96aa08` returned PASS WITH FINDINGS (a sample of 55 hand-filed rows held at ~95%, the
  84 set aside by script at ~93%); its findings are folded here with the text they corrected kept beside ("was: ...").
- Sources: [research 101](101-the-rounds-open-gaps.md) at `ce364f643` (the checklist); [research 346](346-the-discs-encrypted-overlays-in-the-page.md)
  (what decrypting the overlays takes, and H291-H293); [research 170](170-push-to-talk-voice.md) §5.4 (the talk cue).

## 0. The headline (for the owner, a minute)

The desktop already decompiles the decrypted code, so the overlays add **no new research information**: an unread row
whose source is the game's code is unread work today, overlays or not. What they add is for the page and for evidence:

| what | rows | what it needs |
|---|---|---|
| **A. Data embedded in the code that the page needs while running** | **1**, from §5's excluded names (none among the 794 open): the online talk cue (`VOICE_TALK_PCM_PLACEHOLDER`, #431) | the page reading the overlays: H291, H292, **H293** |
| **B. Proven evidence by running the original's own functions** on test inputs, value for value against the port -- a call trace of the original running, PROCESS's "proven" -- with no console | **449**, a lower bound (about 4 more among the 84 set aside unread, below): combat 128, round 90, ui 82, movement 50, camera 31, turrets 28, audio 23, net 5, other 12 | an R5900 interpreter of our own (research 346 §5's core) running the **desktop-built ELF** (already decrypted) in dev-disc tests on a host that has it -- **not** the page's overlay reader, so **not H293's synthesized identity**, and not the decryption H292 measures; its cost is its own per trace. A condition: the build must be the original's bytes, unpatched (§7) |
| **C. Values readable today** from the desktop-built ELF's initialised data, by a dev-disc test, no interpreter | **17** (constants, small tables, strings, vtable slots; four of them candidates with no address yet) | nothing new: a reader of the built ELF on the owner's host |
| D-partial: the full game's behaviour, its computational core traceable as B | 79 | B, for the core only |
| D: settled only by the original running in full (frames, audio, real timing, two consoles) | 57 | a capture, as today |
| E: the overlays cannot settle (the port's own design, owner calls, Sony's servers) | 69 | -- |
| N: on reading, not sourced in the code (disc data, scripts) | 39 | -- |
| set aside by the first scripted pass, unread: the page's own 56, disc data 28 | 84 | the review read them: ~93% hold; about 4 are B (`HOSTAGE_STEERING_READING`, `HOSTAGE_AVOIDANCE_READING`, `BLOWBACK_CONSUMER_READING`, ...), A22 D-partial, A15 D |

The table's filed rows sum to 794 (710 filed and 84 set aside). (The review's findings 1, 3, 4; was: B 446, C 20, E 68, N
40, A counted among the 794, the 84 not shown.)

So the page's overlay reader (LATER 271, H291-H293) buys **one** row of runtime data today; the large gain -- B, 449 rows
raised from "reading" toward "proven" -- needs only the interpreter and the desktop's built ELF, and C's 17 need neither.
(The merge controller's framing of 2026-10-22 had B depend on H293; this pass finds B independent of it, because B's
traces can run the already-decrypted desktop build rather than decrypting the disc in the page.)

## 1. The ledger's count (research 101's headline, recounted)

Research 101 holds **1,221 rows**: §2's 44 gaps no constant names, §3's 12 rulings, §4's 750 named stand-ins and §5's 415
names excluded and why; **794 open** (§2 and §4). Its headline's "433 rows: 278 open" dates from 2026-10-05 and is
corrected there in this change (§4's own heading counts its rows as they were added). This note files §2's and §4's 794:
710 here, and the 56 the page's own and 28 disc data a first scripted pass set aside (§8); §5's names are excluded rows,
read only for embedded data (§2).

## 2. A: data embedded in the code, row by row

| row | what the page lacks | what the overlays give |
|---|---|---|
| `VOICE_TALK_PCM_PLACEHOLDER` (research 170 §5.4; HUMAN_TASKS H270, LATER 271) | the original's online talk cue: 2,000 bytes at 0x003df540 (`ftscore` offset 0x1f8540) that `FUN_0030ec10` expands into an 8 kHz stereo beep of 0.25 s, the grant forward and the release reversed; the page plays `.TCM_SELECT` instead (`VOICE_TALK_CUE_ADAPTATION`) | the bytes, read from the player's own disc at run time, expanded as the original does |

No other open row is runtime data the page cannot hold: the effects, sprites and sounds the ledger's gaps name (A1, A4,
A12, A14) are the disc's or need frames to check (D); §5's excluded names were searched for embedded data and hold none
but the talk cue (`VOICE_MODULATION_PLACEHOLDER` is a DSP effect's approximation, a B-like trace of the effect on test
audio, not data).

## 3. C: readable today from the desktop-built ELF (17)

A dev-disc test on a host with the desktop's build (`SOCOM_PC_ROOT`) can read these from the ELF's initialised data and
transcribe each as a reading -- no interpreter, no overlay reader, nothing of H291-H293. (A value the code writes at run
time sits in `.bss` and is not here: the spectator panel's colours, the empty reticle's colour -- those are B. The review
read the built ELF's program headers: `DAT_0044d5e4` and 0x66a1b0 lie past their segments' file-backed parts, `.bss`, so
`PERCEPTION_QUERY_PLACEHOLDER` and `TURRET_HOLD_PUSH_READING` are B, and `STREAM_LEVEL_READING`'s gains are the duck
table's masters held at run time, B too; was: all three C. The rows marked *candidate* give no address yet: a value read
there may prove to be an immediate in the code, not data.)

| system | rows |
|---|---|
| combat | `HEAD_NODE_NAMES_PLACEHOLDER` (strings at 0x65c4f8..), `SPINELO_RADIUS_PLACEHOLDER` (*candidate*), `NO_FIREARM_RECORD_PLACEHOLDER` (*candidate*), `CLAYMORE_COUNT_LIVE_READING` (a vtable slot, then its callers) |
| turrets | `TURRET_VERTICAL_READING` (`DAT_003e0828`), `TURRET_APPROACH_READING` (`DAT_003e0830`) |
| movement | `WALL_PROBE_ACTIONS_READING` (`DAT_003dec58`, `DAT_003decc0..d0`) |
| round | `HOLD_STATE_TICK_PLACEHOLDER` (vtable 0x669d30's Tick slot, then that function) |
| camera | `JUMP_TO_VISIBLE_READING` (`DAT_003f64c0`) |
| ui | `CLOCK_NEG_STRING_PLACEHOLDER`, `CLOCK_VISIBILITY_PLACEHOLDER`, `INVENTORY_ARROW_ALPHA_READING`, `ROUND_LIST_COLUMNS_PLACEHOLDER`, `TELETYPE_CURSOR_READING`, `AUTOCOMM_TEXT_PLACEHOLDER` (*candidate*), `DEFUSE_PROMPT_ICON_READING` |
| net | `NAME_MAXLEN_PLACEHOLDER` (*candidate*) |

## 4. B: proven by running the original's functions, by system (449, a lower bound)

Each is a computation in the game's code -- a function's result for given inputs -- that the port holds as a reading or a
placeholder. Running that function under the interpreter on staged inputs, and comparing value for value, settles a
placeholder or raises a reading to proven. Readings already settled from the source are counted: a trace still raises
them. The most play-important per system:

- **Combat (127).** `RELOAD_CUT_DELAY_READING` (a frame's tick order around a reload's push and cut), `RAISE_ENVELOPE_STEP_READING`
  (the raise envelope per frame from a fresh spawn's pull), `PERCEPTION_SEEN_RATE_PLACEHOLDER` and `PERCEPTION_SIGHT_PLACEHOLDER`
  (`FUN_0060aa20`, `FUN_0060b120` on staged light, speed, stance, smoke and surfaces), `AIM_RAY_READING` (the eye ray's
  reach and pass rule), `LOOK_JUMP_READING` (the accuracy's look jump), `SHOTGUN_MP_PELLET_DAMAGE_SCALE_READING`,
  `FLINCH_GATE_READING`, `NOFIRE_PHASE_READING`, `FRIENDLY_FIRE_ENFORCEMENT_PLACEHOLDER` (the `OnWeaponHit` gate),
  `FIRE_MODE_DOUBLE_TAP_S_READING`, `NET_REFILL_READING`.
- **Movement (50).** A5 (the walker's speed on a 45-degree crouch stick), `STEP_PROBE_LIFT_READING` (A7) with A6 (the
  steep-ground slide), `CROUCH_GATE_READING` and `PRONE_GATE_READING`, `PENDING_STANCE_RETRY_READING`, and the climb's
  `CLIMB_CUT_READING`, `CLIMB_OFFER_GATE_READING`, `CLIMB_STEER_READING`, `CLIMB_RESUME_STICK_READING`, `CLIMB_STEP_UP_STICK_READING`.
- **Round (90).** The scoring and objectives: `PRIMARY_OBJECTIVE_READING` (`FUN_00224d10` on team states), `RESCUE_TEST_READING`,
  `RESCUE_CREDIT_READING`, `HOSTAGE_KILL_SCORE_READING`, `PENALTY_MINUTE_READING`, `CLASSIC_BODY_STAYS_READING`; the hostages'
  path (`HOSTAGE_AI_COLLISION_READING`).
- **Turrets (27).** `TURRET_ROUND_LINE_READING` (the round's cone on the turret record), `TURRET_RELOAD_READING`,
  `TURRET_RETICLE_STANCE_READING`, `TURRET_DAMAGE_PLACEHOLDER` (HEALTH 30's consumer), `TURRET_TEAM_READING`, `TURRET_RATE_UNITS_READING`.
- **Camera (31).** The bob's sign (A29), the zoom's leave paths (A30, A31), `PRONE_EYE_TERMS_PLACEHOLDER`,
  `HEAD_EYE_WALL_BACK_PLACEHOLDER`, `SCOPE_EYE_READING`.
- **UI (82).** `HUD_ROUND_MODE_COUNT_READING`, `INVENTORY_THROWABLE_COUNT_READING`, `ARMORY_RULES_READING`
  (`CanCharactersSelectUIWeapon` on characters and weapons), `COMPASS_BASE_MARK_READING`; and the values the code writes at
  run time (`.bss`): the spectator panel's colours and baselines, the empty reticle's colour.
- **Audio (22).** `GUN_EMPTY_PULL_READING`, `DEATH_SOUND_IDS_PLACEHOLDER`, `FOOTFALL_CAP_READING`, `FOOTFALL_NEAREST_READING`,
  `GROUP_MASTER_READING`, `LOOP_MASTER_READING`.
- **Net (5) and other (12).** One console's code only: `KILL_SCORE_LOCAL_READING`, `REMOTE_LAUNCHER_ITEM_PLACEHOLDER`,
  `THROW_REMOTE_ROUTE_READING`; the victory dances' range and busy gates; the zanim archives' parent lookup.

A trace settles a row only as far as the interpreter is exact: rows whose values turn on the EE's single-precision
rounding or VU0 maths (`PIERCE_ROUNDING_READING`, `TURRET_RELOAD_READING`, `KNOCK_SIDE_READING`, the raise envelope) need
the interpreter to model them bit for bit, and its own tests to show it.

## 5. D-partial and D: the full game's behaviour (79 and 57)

D-partial rows hang on the renderer or on two consoles -- what a frame draws, a late joiner, another console's copy of a
player -- but their computational core can still be traced as B: camera 22, ui 16, net 12, round 11, combat 10, audio 6,
movement 2 (e.g. `MP_TEAM_TAG_CULL_READING`: the tag waits on the renderer's drawn flag, `FUN_00315580(node, 2)`, while
the rule around it traces). D rows are settled only by the original running in full -- frames, audio output, real
timing, hardware -- and stay with the captures (ONL-32's window and its kin).

## 6. E and N: what the overlays cannot settle (68 and 40)

E: the port's own design -- its adaptations, its key and touch bindings, the room's authority and validation, the lobby's
stand-ins -- the owner's calls, and Sony's servers. N, on reading, are sourced in the disc's data or scripts, not the code:
the missions' script WAITs, lines and zones (the escort and breach holds), `animset.rdr`, `mission.rdr`, `character.rdr`.
Two N filings are the weakest of the pass and may be code: `RESCUECHECK_READING` (SEALcheck read as mission script) and
`PERCEPTION_VETO_PLACEHOLDER` (its flag word's writer unfound).

## 7. What it means for the work

- **C** is the cheapest gain: 20 readings, a reader of the built ELF in dev-disc tests, nothing waiting on the owner.
- **B** is the large one: an R5900 interpreter of our own (research 346 §5 items 1-3: the core, the R5900's encodings,
  memory) running functions of the desktop's built ELF on staged inputs in dev-disc tests -- no DNAS, no IOP stand-ins,
  no synthesized identity, nothing decrypted in the page; a function's own calls out to the kernel or the IOP stubbed at
  the call. Its cost is its own per trace, not H292's (which measures the decryption B never runs). Combat, movement and
  the round's rules first. **A condition**: a trace is evidence of the original only on the original's bytes, unpatched.
  The desktop builds the ELF from the disc (`desktop@be557831:tools_py/disc_to_elf.py:1-40`) and also keeps a repair
  record beside it (`socom2_game.elf.repair.json`, its `overlay_repair.py`); a harness checks the build it runs against
  the overlays' recorded digests (`disc_to_elf_expected.json`) before a trace counts, and never runs a repaired image as
  the original. (The review's findings 2 and B's condition; was: "per-run cost H292's", no condition named.)
- **A** is the page's overlay reader (LATER 271): one row today, behind H291-H293.

## 8. Evidence, apart, and how the rows were filed

- **The filing**: a scripted first pass over research 101's §2 and §4 rows by their cells (code citations against disc
  readers, capture and page-own words) set 56 the page's own and 28 disc data aside, unread by the seat (the review read
  them: ~93% hold, the misfilings in §0's last row); the other 710 were read in full by two
  readers, a half each, against the categories of §0, each row with its system, its play impact and one line of what the
  overlays settle; the seat spot-checked a sample of each category against the rows. The counts are of that filing.
- **Source inspection**: research 101, 170, 346; the ledger's cited functions by name and line, not re-read here.
- **Not run**: no interpreter, no test, no reader of the built ELF; no value was read. Nothing here is measured.
