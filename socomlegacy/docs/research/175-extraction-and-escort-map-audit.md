# 175 — Extraction and Escort: seven retail maps, NPC lifecycle, and environment

Filed 2026-10-04 from the old-layout checkout (`$WT`, the clone's pre-restructure web project), where it was the uncommitted note 100 (WT-100 in the research wave of 2026-10-04, [178](178-the-research-wave-of-2026-10-04.md)); renumbered 175, the cross-references to its sibling notes 171-177 and its plans renumbered with it. Status: reading, pending review.

Research date: 2026-10-04. This is an implementation feasibility audit, not a claim that these modes run in the browser. It covers **every retail Extraction and Escort map**: Desert Glory, Blood Lake, Death Trap, Fish Hook, The Mixer, Foxhunt, and Guidance. The three HDD maps are outside this evidence set: the owner has confirmed their archives are unavailable. No HDD behavior is inferred from similarly named assets.

The important finding is that these modes require an authoritative NPC subsystem, not just extra victory conditions. All seven maps instantiate three objective characters. Escort has a staging/countdown/final-extraction sequence; Extraction separately counts rescue, death, and SEAL penalties. Death Trap's switches move physical gates, and Guidance's radio calls a damaging airstrike that also removes a ladder and a wall. All of those states must survive a late join and reset between rounds.

## 1. Evidence and reproduction

Source order follows `MISSION.md` and `CONTRIBUTING.md`: the main SOCOM Unzipped project/recomp, the local retail disc and ELF decompilation, then reCOM declarations as corroboration. Existing research [75](75-aimaps-mps.md), [77](77-motion-format.md), [91](91-the-round.md), [92](92-doors.md), [171](171-crossroads-demolition-and-bridges.md), and the shared environmental/turret audit are companion material. The function address is the durable decompilation anchor when generated line numbers shift.

Primary files used:

- `RUN/READERC.ZAR/missionlist.rdr`: named online map/mode association, rather than an inference from a mission description or asset library.
- Each map's `READERM.ZAR/vehicles.rdr`, `chartype.rdr`, `actions.rdr`, `mission.rdr`; `AIMAPS.MPS`; `MZANIM.ZAR/Anim_Sets/mission/Animation_List`; and realized `MP*_GEO.ZED` scene hierarchy/collision owners.
- `C:/projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`, abbreviated **D** below, and `game/disc/socom2_game.elf`. Runtime-function addresses identify primary executable evidence. The sibling strings/functions indexes aided discovery.
- `C:/projects/socom_pc/research/recom/src/gamez/zAI/zai.h` and `ai_main.cpp`: state names/class shapes only where bodies are absent. `CAiStateFollow`, `CAiStateRescued`, and `CAiStateHostage` are empty declarations; their presence does not provide a portable implementation.

The read-only [probe](../../tools/probe-npc-maps.ts) accepts a locally extracted RUN directory. Run from `socomlegacy/`:

```text
npx tsx tools/probe-npc-maps.ts --section global --record missionlist.rdr
npx tsx tools/probe-npc-maps.ts --section reader --record vehicles.rdr
npx tsx tools/probe-npc-maps.ts --section ai
npx tsx tools/probe-npc-maps.ts --section bindings
npx tsx tools/probe-npc-maps.ts --maps MP82 --section commands --animation objectives --sequence SEALcheck
npx tsx tools/probe-npc-maps.ts --maps MP11 --section commands --animation gate_openclose1
```

`commands` prints decoded operations and undecoded words to local stdout for inspection; do not commit those extracted command streams. `bindings` preserves animation ordinal as well as set/name: MP6 repeats `beer1` through `beer9` **within the same mission set**. A name-only dictionary silently loses records. Static node searches can return multiple prototype instances; candidate matches are not proof that a callback affects every candidate. This tool is neither the full script VM nor a runtime oracle.

Confidence labels used below: **P** = direct archive or executable evidence; **M** = measured with the existing parsers; **I** = interpretation connecting those facts; **O** = unresolved behavior requiring a smaller RE or console/emulator experiment. Proposed architecture and tests are explicitly proposals.

Archive identity (SHA-256, local retail files; no asset contents included):

| Map | SHA-256 |
| --- | --- |
| MP6 | `2686421be41e15a39c9e0304f9c6f8250dcc3c9039745945b8e017d2951d5c77` |
| MP10 | `81d9cbb1181434a6701a9027098f5be090de81f239834b220429d8c9f2a2a518` |
| MP11 | `049d0bc5df171e9c692b00bd8bf3ce39fb9ff46f4e3169409ec5beaef3dce2ac` |
| MP71 | `535820361cadd9c827eb97d3f8e123bc67ecfe9e2c72f45f5df03e65bc2485a8` |
| MP52 | `29e01cbccc0c21810982dc40004196d9444c3c45ffa8ea16c77354684cd34fd2` |
| MP53 | `1345c2c32ebbbda42aeb1db2895d0fd2b83715b52a8f0d3387d077724ee4d0a6` |
| MP82 | `35577e7c8e7be08bc88d418f6f4acf7462778c330b7f760ff00bae9c8b7464d1` |

## 2. Objective characters and shared executable behavior

### 2.1 Three actual entities per map

`vehicles.rdr` contains three enabled NPC definitions plus a disabled player prototype. This is stronger evidence than merely finding NPC models in a library. Extraction names them `Hostage`, `Hostage2`, `Hostage3`, team-mask bits 17, 30, 31 (`0xc0020000`); Escort names them `VIP1`, `VIP2`, `VIP3`, bits 17, 30 (`0x40020000`). All use `hostageStart`, `hostage2Start`, `hostage3Start`, respectively. The team-mask reader is `FUN_00533370`, D400347–400447. Those mask bits are actor traits, not three additional player teams. **P**.

| Map | Mode | Character types | Resolved body family |
| --- | --- | --- | --- |
| MP6 Desert Glory | Extraction | `mp_fem1`, `mp_fem2`, `mp_fem3` | `thai_biologist01`, `thai_biologist02`, `thai_wife` |
| MP10 Blood Lake | Extraction | `mp_pow1`, `mp_pow2`, `mp_pow3` | `con_pow01`, `con_pow02`, `con_pow01` |
| MP11 Death Trap | Extraction | same POW types | same POW bodies |
| MP71 Fish Hook | Extraction | `mp_algerian_h1`, `mp_algerian_h2`, `mp_algerian_h3` | `alg_UN01`, `alg_UN02`, `alg_UNworker` |
| MP52 The Mixer | Escort | same Algerian types | same UN bodies |
| MP53 Foxhunt | Escort | same Algerian types | same UN bodies |
| MP82 Guidance | Escort | `mp_vip1`, `mp_vip2`, `mp_vip3` | `rus_escort01`, `rus_escort03`, `rus_escort03` |

The facing field is 0 except MP71's first hostage and MP53's first VIP, which store 6. HP-FACING (2026-11-04) re-read the loader path: `FUN_002b28d0` D:L155825-155826 passes heading 6 through `FUN_00518ea0` D:L386398-386441 with the extra half-turn, giving browser yaw 90; heading 0 gives yaw 0 (research 237 section 1.3, reading, independently reviewed 2026-11-04 under HP-FACING). This is semantic facing, not a comparison of the original rendered body. MP6/10/71 `Hostage_start1..3` call `ai::SETANIMSET` with `No_weapon anim set` and a STANCE payload `(2,1)`. MP11's corresponding starts have zero commands. A common initialization layer therefore matters; copying only MP6's script would miss this difference.

### 2.2 AI command and region semantics

`FUN_005de320` registers AI command set 2 in order (D493398–493473): command 11 is `INSTATE`, 15 is `MAP`, and 22 is `INREGION`. This was checked against executable strings, not guessed from payload shape.

- `ai::INREGION`, `FUN_005ced60`, D484771–484943, looks up the encoded region location and resolves the named actor. It compares the actor's packed AI-cell **submap** and a half-open cell rectangle: `0 <= dx < width`, `0 <= dz < height`. It does **not** check alive state itself. An XZ rectangle spanning every floor is an incorrect implementation.
- `ai::MAP`, `FUN_005d6770`, D489061–489134, subtype 2 changes a region kind. Its parser `FUN_005d69f0`, D489137–489258, names kind 1 `EXTRACT_ZONE` and kind 5 `HUD_VISIBLE` (0 default, 2 safe house, 3 worm hole, 4 router, 6 guard). `FUN_00529c00`, D394802–394833, updates the per-kind lists as well as the stored low five bits. `FUN_0052a200`, D395043–395103, finds a containing region of a requested kind.
- `ai::INSTATE`, `FUN_005d8840`, D490174–490292, reads local AI or the remote controller's packed state. `FUN_00575490`, D435875–435975, names state 9 FOLLOW, 17 RESCUED, 18 SUSPENDED, and 23 HOSTAGE.

Thus an Escort zone is initially a visible destination that does **not** automatically extract an NPC. The mission later changes its kind. Rendering a rescue marker and extracting an NPC are separate operations. **P**.

### 2.3 Following, rescue, death, and network identity

| Behavior | Executable anchor | What is established / what remains |
| --- | --- | --- |
| Follow state | factory `FUN_005f6550`, D505896–506186; vtable `0x6699a0`; tick `FUN_005fb1c0`, D508490–509124 | Leader, formation offset, path construction and pursuit are real AI state. Calls into `FUN_005fd790`, `FUN_0052bdf0`, `FUN_00526540` rule out a faithful straight-line follower. Exact path-cell costs and stop/catch-up thresholds remain O. |
| Leader assignment | `FUN_005fcf10`, D509474–509517 | Adjusts old/new leader follower counts, stores current leader at AI+0x5d4, and retains last rescuer actor at +0x5d8. Clearing current leader does not erase stored rescue credit. |
| Leader death cleanup | `FUN_00547af0`, D413009–413048 | Iterates following actors and clears a follower's leader if its resolved chain leads to the dead actor. Disconnect and controller destruction still need their corresponding path checked. |
| Rescue eligibility | `FUN_0056f970`, D432926–433028, especially 432965–432985 | Valid saved rescuer + hostage actor trait + membership in a kind-1 region causes state 17, stores region and rescuer ID, and awards rescue credit. Mission counters alone do not perform this transition. |
| Rescue scoring | `FUN_00545480`, D411552–411575 | Local SEAL rescuer gets rescue stat +1 and score +3. Replicated application must award once. |
| NPC kill scoring | `FUN_00545390`, D411516–411548; death path `FUN_0059ee20`, D458117–458145 | Hostage-trait victim updates `mp_hostages_by_seals` or `mp_hostages_by_terrs`; NPC kill stat +1, score -2, except an Escort Terrorist receives +3. This is separate from normal player kill credit. |
| Rescued appearance | enter `FUN_005594b0`, D422293–422326; tick `FUN_00559070`, D422157–422279 | Online rescued state clears its icon, enters phase 2 and fades body alpha at 0.75/s. If alpha starts at 1 the fade lasts about 1.333s. Campaign phases are not evidence for an online helicopter boarding route. |
| NPC replication | pack `FUN_0056f6c0`, D432859–432924; apply `FUN_0056f4c0`, D432808–432856 | State byte, leader/rescuer ID, quantized fade and flags are serialized. Applying the rescued transition associates its credit with a specific actor. |
| Controller reconstruction | `FUN_0056f210`, D432722–432789 | Preserves follow leader or rescued state/credit when rebuilding the controller. Useful lifecycle evidence, not a ready-made WebSocket format. |
| Idle hostage | vtable `0x669ab0`, tick `FUN_00601910`, D511762–511912 | Hostage/cower reactions and timed behavior exist. The full threat-response and voice policy is still O. |

NPC controls must retain stable entity identity separate from a reusable player seat. The source preserves both current leader and credited rescuer; a single `followingPlayerId` cannot represent the lifecycle correctly. The exact contextual recruit/stop picker, distance, team eligibility, maximum followers and lost-leader policy remain bounded RE work before parity is claimed.

## 3. Extraction mission state machine

All four Extraction `objectives` animations contain 20 sequences and 316 commands. MP6, MP10, and MP11 share sequence offsets; MP71's additional rescue region lengthens the three rescue predicates. Exact entry anchors in the animation's `Seq_Data`:

| Sequence | MP6 / MP10 / MP11 | MP71 |
| --- | ---: | ---: |
| `reset`, `game_over`, `start`, `mission_timer` | 0, 132, 368, 3308 | same |
| `HostKill1..3` | 3396, 3588, 3780 | same |
| `SealKill1..3` | 3972, 4164, 4356 | same |
| `Rescue1..3` | 4548, 4764, 4980 | 4548, 4792, 5036 |
| `Lead1..3` | 5196, 5332, 5468 | 5280, 5416, 5552 |
| `SEALcheck` | 5604 | 5688 |
| `abort`, `success`, `failure` | 5896, 5992, 6084 | 5980, 6076, 6168 |

The script facts are:

1. Each `RescueN` tests its named hostage's region, increments `rescuecount` and `freecount` once, then stops. Each `LeadN` waits for state 9 and posts its escorting message once.
2. Each `HostKillN` waits for the cumulative Terrorist hostage-kill count to reach N, posts its message, waits **2 seconds**, increments both `rescuecount` and `killcount`, and stops. Each `SealKillN` uses the SEAL kill count, waits **2 seconds**, then increments `mp_penalty` and `killcount`.
3. `SEALcheck` sets `rescuecheck = 1` when `freecount == 3`, or `freecount == 2 && killcount == 1`, or `freecount == 1 && killcount == 2`, or `killcount == 3`. This is an explicit **all three resolved** gate in the script. It is not a direct “two bodies enter the zone” victory test.
4. The `start` watcher checks team elimination, then `rescuecount >= 2 && rescuecheck == 1` for a SEAL win, then `mp_hostages_by_seals >= 2` for a Terrorist win. The branch order is part of the evidence and must be tested when multiple conditions become true together. Do not pre-collapse the counts into a single `rescued >= 2` rule.
5. `mission_timer` waits 15 seconds, watches `mp_timer`, then calls `abort`: winner 99, round increment, game-over, then `mission_timeout` after a one-second wait. This is a draw timeout. `success` and `failure` have a 20-second hold before round increment/game-over and a further one-second wait before the mission result valve.

`start` waits 5 seconds, then the local-SEAL presentation branch adds 2 seconds, then a further 10-second wait precedes the loop. That is a script-local 17-second path on the SEAL branch and 15 seconds on the other branches. **Do not silently transplant Suppression's one global 15-second grace or claim the local presentation delay is the original network authority.** Resolve host/remote observation with a runtime trace before choosing a single server evaluation deadline.

**Penalty engine path resolved:** `mp_penalty` is allocated at game+0x40 (`FUN_002a76d0`, D149589–149594). Host network update D150711–150719 compares its ushort value against game+0xc0; an increase calls `FUN_002a6960(game, 0x3c)`. That function, D148928–148958, subtracts 60 seconds from floored remaining seconds, or leaves **1000ms** when the penalty exceeds a still-positive remainder. The script's “one minute deducted” message is therefore backed by executable behavior. If multiple increments occur before one host poll, this code appears to subtract once and advance last-seen to the new count; reproduce that race before deliberately preserving or changing it.

Two predicate caveats remain material. MP6/10/11 encode `(INREGION) OR ()`; MP71 encodes two real regions. The recursive IF evaluator `FUN_0025e960`, D108286–108424, returns `unaff_s1` on a closing parenthesis, including an empty expression. Treating the empty arm as a literal false is not established by the decompiler; instruction-level or runtime confirmation is required. Also `INREGION` itself has no alive check: an NPC dying in a rescue rectangle could be counted by more than one watcher. These are small, precisely bounded oracle tests, not permission to replace the explicit script with a remembered rule.

## 4. Escort mission state machine

All three Escort maps instantiate three VIPs and carry independent staging, extraction, death and timer watchers. The relevant offsets are:

| Sequence | MP52 | MP53 | MP82 |
| --- | ---: | ---: | ---: |
| `reset`, `start` | 0, 408 | 0, 408 | 0, 388 |
| `Rescue1..3` | 3728, 3940, 4152 | 3760, 3972, 4184 | 3660, 3836, 4012 |
| `EndRescue1..3` | 4364, 4676, 4988 | 4396, 4708, 5020 | 4188, 4448, 4708 |
| `SEALcheck` | 5300 | 5332 | 4968 |
| `hostages_rescued`, `VIPcheck` | 6208, 6644 | 6240, 6676 | 5620, 6056 |
| `mission_timer`, `escort_success` | 6964, 7060 | 6996, 7140 | 6376, 6472 |
| `success`, `failure` | 7408, 7500 | 7440, 7532 | 6820, 6912 |

The flow established by the streams:

1. `reset` restores the staging region(s) to kind 5 (`HUD_VISIBLE`). Each `RescueN` waits until its VIP enters `Safety` or `Safety2` (Guidance: `Safety`), posts a message and increments `rescuecount`. It then waits while that VIP's alive valve is 1; when the VIP dies, it decrements the count. **Leaving the rectangle does not decrement this staging latch.**
2. `SEALcheck` begins extraction when `rescuecount == 3`, or `rescuecount == 2 && killcount == 1`. On Mixer/Foxhunt it selects a helicopter animation based on which staging region contains a VIP; the first matching branch has priority if VIPs occupy both. Guidance uses its single staging region. **The choice is the animation's only** (corrected 2026-10-18, PR #331's review; reading, pending review): the IF / ELSEIF (MP52 @5360/@5488, MP53 @5392/@5520) holds nothing but the CALL_ANIMATION (MP52 @5468 `chopper_rescue2` for Safety, @5596 `chopper_rescue1` for Safety2); the promotions in item 3 come after its ENDIF and run whichever branch was taken.
3. It stops `VIPcheck`, executes command 81 with a 30-second payload on Mixer/Foxhunt or 20 seconds on Guidance, waits that duration, changes **both** Safety and Safety2 to kind 1 (`EXTRACT_ZONE`) on all three maps -- two `ai::MAP` naming each zone by its corner cell (MP52 @5656/@5676, MP53 @5688/@5708, MP82 @5196/@5216; the `rescuecount == 2` branch repeats them, MP52 @6072/@6092, MP53 @6104/@6124, MP82 @5484/@5504) -- starts all three `EndRescueN` sequences and stops itself. The WAIT establishes the gameplay delay independently of command 81's remaining UI/helper semantics. (This item said "the relevant regions" until 2026-10-18; a port read it as the latched zones alone.)
4. `EndRescueN` requires its VIP alive **and presently in the region**: Safety OR Safety2 on Mixer/Foxhunt (MP52 EndRescue1 @4400, MP53 @4432), **Safety only on Guidance** (@4224), though Guidance promoted both. `INREGION` is positional (`FUN_005ced60` D:L484773-484944, actor mode D:L484861-484903): the cell's sub-map and rectangle, not the zone's kind. It increments `truecount`, stops the `start` watcher (MP52 @4528, MP53 @4560, MP82 @4300), posts the extracted message, waits 2 seconds, increments `rescuecheck`, and calls `hostages_rescued`. With `start` stopped, neither elimination nor `killcount >= 3` can award the round any more.
5. `hostages_rescued` wins for SEALs when `truecount >= 1 && rescuecheck >= 1`. Consequently the final success watcher can complete after **one** living VIP extracts, provided the earlier staging gate was met. A late second casualty during the countdown is a required oracle test; it must not be “fixed” by assuming an enduring two-VIP minimum.
6. Both teams' kill watchers increment `killcount` after a two-second message delay. Escort does not increment Extraction's `mp_penalty`. `VIPcheck` watches for two killed VIPs and posts extraction-aborted/keep-the-last-VIP-alive messages. It does not itself directly award a Terrorist win. The `start` watcher awards Terrorists when `killcount >= 3`, or when SEALs are eliminated; Terrorist elimination awards SEALs.
7. **Escort round timeout awards SEALs**, not a draw. `mission_timer` waits 5 seconds, waits for `mp_timer == 0`, sets winner 0 and stops `start`. Foxhunt additionally stops kill watchers here; Mixer/Guidance stop them through `escort_success`. `escort_success` supplies messaging, score and delays; ordinary success/failure sequences then hold 20 seconds, increment round/game-over, and wait one second for the mission result valve.

The Escort `start` intro has the same 5 + local-SEAL 2 + 10 second timing issue as Extraction. A server mode adapter must own objective/elimination/timeout arbitration, rather than bolting extraction onto Room's existing elimination branch. Preserve the distinct presentation timings without introducing client-owned winners. Exact simultaneous timeout/rescue/elimination order and the point where remaining damage becomes non-authoritative require runtime capture; the source has concurrent watchers rather than one clean high-level enum.

## 4a. The escort's end-of-round lines, as the page plays them (LATER 125, 2026-10-18)

Re-read off the disc's MP52, MP53 and MP82 `objectives` through `tools/probe-npc-maps.ts --section commands` (offsets
MP52's; MP53 and MP82 at §4's table's offsets). Reading, pending review.

- **`escort_success`** (MP52 @7088, MP53 @7140, MP82 @6472) waits for `mp_winner == 0`, so it runs on **every** SEAL
  win -- the Terrorists eliminated, an extraction, and the time-out (`mission_timer` @7036): "THE TERRORISTS FAILED TO
  ELIMINATE THE VIPS." 0.7, "SEALS VICTORIOUS!" 0.9, WAIT 2, the SEAL win music (MP52 and MP53 `MUS_MP_SEAL_WIN_ALB`,
  MP82 `_RUS`), WAIT 5, then `success` / `failure` by `player_team`.
- **`start`'s Terrorists-eliminated branch** (`aiteam_08 == 0`, MP52 @776/@904/@1032) posts "ALL TERRORISTS ELIMINATED"
  and `^PH_0014` alone and sets `mp_winner = 0` -- the "music-less SEAL win of the VIP maps" research 124 §5 tabulates:
  the music is `escort_success`'s.
- **An extraction:** `EndRescueN` -- one copy per VIP, its test `VIPN_valve_alive` and the zone -- at `truecount += 1`:
  "A VIP HAS BEEN EXTRACTED" + `^*PT_0051` (an MP_COMMON group, research 304 §8), WAIT 2, **its own** music
  `MUS_MP_VIP_RESC_N` (MP52 @4596 / @4908 / @5220, MP53 @4628 / @4940 / @5252, MP82 @4368 / @4628 / @4888),
  `rescuecheck += 1`, CALL `hostages_rescued` (@6236: `truecount >= 1 AND rescuecheck >= 1 AND player_team`):
  `^*PT_0055`, `mp_winner = 0` -- then `escort_success`. SEALcheck starts all three copies together after its WAIT
  (MP52 @5696-@5712), so several VIPs already in the zone each post the line and `^*PT_0051`.
- **Three VIP kills:** `start`'s `killcount >= 3` branch (MP52 @1984/@2208/@2432): "THE VIPS HAVE BEEN ELIMINATED.",
  "TERRORISTS WIN!", with streams that differ by map and team (MP52's SEAL console both lines then `^PH_0050`; MP53's
  `^PH_0002` between them then `^PH_0050`; MP82's `^PH_0002` between them), then the Terrorist win music.
- **The SEALs eliminated:** "ALL SEALS ELIMINATED" + `^PH_0002`, "TERRORISTS WIN!", the music -- the elimination's lines.
- **The kill one-shots:** `HostKillN` "THE TERRORISTS HAVE KILLED A VIP" + `^PH_0042` + **its own** music
  `MUS_MP_VIP_KILL_N`; `SealKillN` "THE SEALS HAVE KILLED A VIP" + `MUS_MP_VIP_KILL_N` (MP52 HostKill2 @2972, HostKill3
  @3164, SealKill2 @3484, SealKill3 @3644; MP53 @3004, @3196, @3516, @3676; MP82 @2904, @3096, @3416, @3576). The N-th of
  a side fires at that side's count `>= N` (`mp_hostages_by_turds` / `_by_seals`: MP52 HostKill2 @2900).
- **Who stops the kill one-shots:** `start`'s SEALs-eliminated branches on all three maps (MP52 @1368-@1408,
  @1640-@1680, @1912-@1952); `escort_success` on The Mixer and Guidance (MP52 @7120-@7160, MP82 @6532-@6572), not on
  Foxhunt, whose `mission_timer` does. *(Corrected 2026-10-18 by LATER 125's fresh review, F1 and F2: this section read
  copy 1's music for every copy and left the stops out.)*

**As built** (the page, `packages/viewer/src/roundCues.ts`; `ESCORT_LINES_READING`): on a script with `escort_success`
the cues' `decided` holds `rescue` (`hostages_rescued`'s for the team, then `escort_success`'s steps; EndRescue's own lines
are LATER 131's, below),
`hostageKills` (the `killcount >= 3` branch) and `elimination` -- the SEALs' win alone, `start`'s line then
`escort_success`'s -- with `stopsKills` (whether each deciding path stops the kill one-shots, read per map), and
`hostages` the two kill one-shots, each copy with its own steps, the page playing the copy its count of that side's kills
this round names (`ESCORT_KILL_COPY_FROM_JOIN_PLACEHOLDER`; escort's `RescueN` is the staging line, LATER 131's). `netPage` asks `decided('elimination')` on a SEAL elimination, which answers false on every
other map, so their pages post the elimination's two lines as before.

**The in-round lines (LATER 131, 2026-10-20; reading, pending review).** The room tells every page each line's moment, a
JSON `escort` (additive, the version kept), from `extraction.ts` `scriptEscort`: 'staged' at RescueN's latch (MP52
@3836-@3852: "A VIP IS IN THE EXTRACTION ZONE", no team test, no decision stops it), 'aborted' once at VIPcheck's
`killcount >= 2` while it runs (@6684-@6740), 'extracted' at EndRescueN's `truecount += 1` (@4512-@4536: "A VIP HAS BEEN
EXTRACTED", `^*PT_0051`, WAIT 2, `MUS_MP_VIP_RESC_N`). `vip` is the escortee record's name (`VIP1`..`VIP3`) and nothing
else. VIPcheck is stopped by SEALcheck at its gate, before its WAIT 30 (MP52 @5624 / @6040), and by every branch of
`start` (@824 ... @2632); neither `mission_timer` nor `escort_success` stops it, but the time-out stops the kill
one-shots before they add to `killcount` (MP53's `mission_timer` @7068-@7108, before its `mp_winner = 0` @7116; MP52's
`escort_success` @7120-@7160, MP82's @6532-@6572), so after it VIPcheck never reaches its lines: the room stops VIPcheck
at every decision (`ExtractionHost.decided`), and the page keeps the lines it had begun through the time-out alone.
The Terrorists' elimination win (the SEALs eliminated) stops SEALcheck (`start`'s branches, MP52 and MP53 @1248 / @1520
/ @1792, MP82 @1228 / @1492 / @1756), the only caller of EndRescue1-3 (after its WAIT 30, MP52 @5696-@5712): after it
the room starts no countdown and promotes nothing, so nothing is extracted in that hold. *(Corrected 2026-10-20 by LATER
131's fresh review, F1 and F2: the first build told 'aborted' in the time-out's hold, and the countdown promoted and
extracted inside the Terrorists' hold, a gap of the room's before LATER 131 made it heard.)* The room's `killcount`
follows the stops (`ESCORT_KILLS_STOPPED_READING`; its re-check's finding 1): after a decision whose path stops the kill
one-shots -- the Terrorists' elimination win on all three maps, every SEAL win on The Mixer and Guidance
(`escort_success`), the time-out on Foxhunt (`mission_timer`) -- a kill, or one still in its WAIT 2, adds nothing, so
SEALcheck's gate (`rescuecount == 2 AND killcount == 1`, MP52 @5728, MP82 @5268) cannot open in that hold: on Guidance a
VIP killed after the time-out no longer starts a 20 s countdown that promoted and extracted inside its 28 s hold. The page reads each line off the map's script (`ESCORT_IN_ROUND_LINES_READING`): RescueN's and EndRescueN's
first branch by the VIP its `<name>_valve_alive` names (MP52 Rescue1 @3868, EndRescue1 @4400), VIPcheck's branch after
its WHILE by `player_team` (MP52 @6716-@6948, MP53 @6748-@6980, MP82 @6128-@6360); the rescue's decision then plays
`hostages_rescued` and `escort_success` alone. A decision keeps RescueN's and EndRescueN's pending steps -- so
`MUS_MP_VIP_RESC_N` at EndRescue's WAIT 2, the moment the rescue is decided, still plays -- and VIPcheck's on the
time-out alone. This retires `ESCORT_EXTRACTED_AT_DECISION_PLACEHOLDER` (EndRescue1's copy posted at the decision, 2 s
late). Known limits: two VIP kills due in one tick (`killcount` 1 to 3) tell 'aborted' and decide `hostageKills` in that
tick, the page dropping VIPcheck's pending lines after the first (`ESCORT_VIPCHECK_FRAME_ORDER_READING`: the original's
order inside a frame, not read); a page that joins mid-round hears none of the lines before it, as with the other
one-shots. Tests: `escort.test.ts` "LATER 131: ..." (the sends, the stops, the room's host); `roundCues.parity.test.ts`
"LATER 131: ..." (the pin's lines on MP52, MP53, MP82; the keep rule); `netPageRound.test.ts` (the routing).

**The holds and the time-out (LATER 126, 127, 2026-10-19; reading, pending review).** On the host's console, a SEAL's
(`ELIMINATION_PERSPECTIVE_READING`), every SEAL win runs `escort_success` then `success`: 2 + 5 + 20 + 1 = 28 s to the
round's end state. The room holds it after the Terrorists' elimination (`ESCORT_ELIMINATION_HOLD_READING`; the room held
`eliminatedHoldS`' 21 s before) and after the time-out (`ESCORT_TIMEOUT_HOLD_READING`; the room ended the round at once
before): `mission_timer` at 00:00 sets `mp_winner = 0` (MP52 @7036, MP53 @7116, MP82 @6448; Foxhunt's first stops the six
kill one-shots, @7068-@7108). The room sends its own event, `timedOut` (an older page drops a type it does not know, so no
page reads the time-out as an elimination), and the page plays `decided.timeout` -- `escort_success`'s steps, its two
lines, WAIT 2, the SEAL win music, with `stopsKills.timeout` (`mission_timer`'s stops, then `escort_success`'s). The
Terrorists' elimination (`failure` at once, 21 s), the extraction's 28 s and the three kills' 21 s were right.

## 5. Navigation and per-map placement

Coordinates below are **XZ AI cell centers** in engine units, rounded to 0.001; they are not ground-resolved XYZ spawns. A location tuple is `(submap, xCell, zCell)`. Rectangles are `[minX,maxX) × [minZ,maxZ)`. All seven files contain **zero AI polyline records**: there is no authored fixed escort route to replay. Grid navigation, cross-submap links and collision-aware replanning are required. `AIMAPS.MPS` cell size is 10; `scene/src/aimaps.ts` parses the grids but does not implement their pathfinding/height semantics.

The parallel [Demolition audit](173-demolition-map-audit.md#newly-traced-ai-height-encoding-read-data) recovered a useful missing piece: `FUN_00516940` (D385086) reads `minY + ((maxY-minY)/1024) * ((cellWord >> 9) & 1023)`. `FUN_0051afe0` (D387628) establishes the height step; `FUN_0052d480` (D396924) can subsequently apply surface/slope correction. Applying that quantized-height formula to the three hostage start cells gives:

| Map | Hostage/VIP 1 Y | 2 Y | 3 Y |
| --- | ---: | ---: | ---: |
| MP6 | 49.992 | 49.992 | 49.992 |
| MP10 | 32.194 | 32.194 | 32.194 |
| MP11 | -139.999 | -139.999 | -139.999 |
| MP71 | 178.776 | 178.776 | 178.776 |
| MP52 | 14.312 | 19.224 | 14.312 |
| MP53 | 118.744 | 117.040 | 106.820 |
| MP82 | 29.982 | 29.982 | 29.982 |

These are measured pre-correction values, not captured native NPC spawn positions. The points' cell low byte is 0x61 in these samples, with the tested bit-7 correction flag clear; the runtime representation and actor placement adjustment still need confirmation. Use this source-derived height seed and the named submap in placement experiments, rather than picking the globally highest floor.

### 5.1 MP6 — Desert Glory (Extraction)

**P/M:** 9 submaps; base grid 167×128, 11,445 stored cells, 7 links. The additional maps include building-A floors, JailUpper/JailBasement, building-B/C, SEAL sanctuary, and roof. Three hostage starts:

| NPC | AI location | XZ |
| --- | --- | --- |
| Hostage | (0,104,5) | (1750.263,1179.719) |
| Hostage2 | (0,106,4) | (1770.263,1169.719) |
| Hostage3 | (0,106,11) | (1770.263,1239.719) |

`Safety`, kind 1: corner (0,6,76), 8×15 cells, X765.263–845.263 / Z1884.719–2034.719. Objective uses the shared Extraction sequences in §3.

**Environment, P/M:** `actions.rdr` has two placed actions. `access_action1` calls `destroy_access1`, valve `set_access1`, points 2, at XYZ (1641.658,58.750,1263.000). The healthy collision owner has one polygon; its `whats_left` subtree has 59. `cdoor1` calls `singleDoor_right`, range 30, at (1732.564,50.500,1218.419). `access2..6` and plank templates occur in the script library but their roots are unplaced; they are not additional doors or C4 targets.

MP6 has 67 MZ animation health records, covering a richer prop set than the action list reveals:

| Placed family | Count | Health / shield | Collision and behavior evidence |
| --- | ---: | --- | --- |
| C4 access wall | 1 | 1 / 17 | `access1/good_parts/di_good`; independently bound destruction callback |
| Crates (`crate_small`, `crate01..07`) | 8 | 1 / 9.9 | 5–13 collision polygons per instance, hit callbacks |
| Pallet stacks (`pal3x_1`, `pal5x_1/2`, `pal10x_1`) | 4 | 1 / 9 | 5 polygons each, hit callbacks |
| Fuel barrels | 2 | 150 / 150 | `barrel_fuel1/2` -> `barrel_good`, 12 polygons each; callback calls `50gallon_fuel_explosion`, fires `exploding_fuel`, swaps good/debris parts |
| Bottles (`beer1..9`) | 9 | paired 0 / 0 and 1 / 0 records | duplicate names, child `beer_di` and root health registrations; do not count as 18 bottles |
| Cups / plates | 6 / 4 | 1 / 0 | prototype child `tincup_hit` (7 polygons) / `plate_dis` (5); binding search context must be preserved |
| Outdoor lights | 9 | 1 / 0 | child `hit_dis`, 6 polygons each; light-off consequence needs callback binding as well as mesh swap |
| Ashtrays | 3 | 1 / 0 | unique roots, 10 polygons each |
| Tire pile / ordinary barrel | 1 / 1 | 1 / 9.9 | 42 / 9 polygons |
| Truck fuel tank | 1 | 80 / 0 | `truck_stop/.../gastank`, 8 polygons at (1900.851,11.146,1887.691); damage callback fires `exploding_fuel`, calls `truck_stop_hitme`, disables tank and launches wheel/exhaust parts |
| `secret` wooden panel | 1 | 1 / 0 | (1703.944,101.844,1392.667), 2 polygons; `hit_secret` swaps `parts_good/parts_bad`, hides `ditop`, throws four parts and plays wood debris |

Fuel-barrel shield 150 is incompatible with the C4 eligibility test using damage 18. Do not infer its triggering weapon from the fact its script fires an explosion; trace the damage threshold/channel and whether the available online ammunition can activate it at all. Likewise crates/lights are environmental damage targets, not automatic contextual actions. F-18/battle-sound/random-bomb sequences need reachable-call classification before an ambient visual is promoted to gameplay damage. The completed common/turret census (§6) adds no common health records or manual turret placements on MP6.

**Mission-specific door coupling:** the MP6 mission's `singleDoor_right` calls `okforhostages` in its open sequence at Seq_Data +404 and `not_okforhostages` in close at +724. These toggle `worldmodel/nohostagerescue` and `worldmodel/okhostagerescue`, two placed alternatives at (1789,50,1380), each with **nine stored collision polygons**. The additional `nohostage`/`okhostage` references are unplaced. `okforhostages` turns the first off and second on; the inverse helper reverses those states. This is a live door-linked geometry change, not just an unbound effect name. The geometry's exact route/NPC consequence still needs a before/after probe. Reusing the common door rotation alone would omit the authored helper calls. Reproduce callers with `--maps MP6 --section callers --animation forhostages`.

**Proposed map acceptance:** recruit all three NPCs through the jail/door routes, rescue on the correct submap, exercise the access wall without moving the wrong same-named prototype, damage one instance of each prop family, and reset every changed object. Toggle cdoor1 and measure the paired hostage-route geometry/collision, including NPC replanning. Independently test two rescued/third untouched, two rescued/third killed by each side, dead NPC in zone, and the two-SEAL-kill loss. Verify shared common bindings before labeling the environment complete.

### 5.2 MP10 — Blood Lake (Extraction)

**P/M:** 5 submaps: base (340×298, 33,103 stored cells, 4 links), three tower maps, and `shark`; each secondary map has one link. Starts (0,110,234), (0,114,234), (0,112,232) yield XZ (1071.199,2310.025), (1111.199,2310.025), (1091.199,2290.025). `Safety`, kind 1: (0,205,33), 24×19, X2016.199–2256.199 / Z295.025–485.025. Shared Extraction objective §3.

**Environment:** no `actions.rdr` record and no mission `Anim_Health` records were found. This is **not** a “no interactive environment” conclusion. The completed shared census (§6) resolves three mounted weapons: LMG, PKM and MGL. Turret interaction comes from `ai_turrets.rdr` and the scene walker, outside `actions.rdr`. `mp10copter` has seven sequences/25 commands; `chop_hover` and frog/cricket ambience are present. An ambient helicopter is not evidence of Escort's staging/countdown rule. Common CZANIM adds no health records.

**Proposed map acceptance:** follow three POWs from their camp to the rescue rectangle across real terrain, verify tower/submap boundaries and water/steep-slope rejection, and confirm NPC bullet/explosion exposure from the mounted turret. Compare two-hostage and death counter cases with MP6 so a map name cannot accidentally choose a different objective policy. Classify the copter's reachable calls and damage before declaring it presentation-only.

### 5.3 MP11 — Death Trap (Extraction)

**P/M:** 7 submaps. Base 425×249, 36,511 stored cells, 3 links; the hostage starts are **on submap 2**, whose vertical extent is approximately -140 to -100.51, not on the base surface above them. Starts (2,35,69), (2,33,66), (2,33,69) yield XZ (1195.848,784.239), (1175.848,754.239), (1175.848,784.239). `Safety`, kind 1, is back on submap 0 at (0,93,150), 15×13, X930.848–1080.848 / Z1559.239–1689.239. Cross-floor links, `runaround`, `connect_bunk` and `catwalks` therefore matter to actual rescue. Shared objective §3, with empty `Hostage_start` animations noted in §2.

**Environment:** two access gates and two independent lever controls:

| Action | XYZ | Binding |
| --- | --- | --- |
| `access_action1` | (1109.374,-90.419,441.174) | `destroy_access1`, `set_access1`, points 2 |
| `access_action2` | (1686.045,-10.423,248.225) | `destroy_access2`, `set_access2`, points 2 |
| `epanel_di1` | (1133.175,-94.944,419.905) | SWITCH, `gate_openclose1`, valve `gate1`, range 15 |
| `epanel_di2` | (1683.441,-14.931,284.783) | SWITCH, `gate_openclose2`, valve `gate2`, range 15 |

Each gate has health 1/shield 17 on its scoped `di_good`, 12 healthy polygons and 3 `whats_left` polygons. Gate 1's healthy owner is at (1109.811,-99.999,470.010); gate 2's at (1686.423,-20.000,277.063). `gate_openclose1/2` play the switch-body action, wait **0.24s**, play `SWITCH_SMALL`, animate the lever over **0.5s**, and call the appropriate open/close sequence only while `set_accessN == 0`. Sequence `gateopen` translates `gate_moveN` by **(-20,0,0) in parent coordinates over 3 seconds**; `gateclose` reverses it. Both placed parent X axes point approximately along world +Z, so opening slides about 20 units in world -Z; it is not a vertical lift. C4 destruction hides good collision/parts and enables remains. The destruction valve prevents later switch motion from resurrecting the intact gate. **P/M** from the named command streams and scene owners.

The shared [Breach audit](174-breach-map-audit.md#objective-and-gates) exposed a generic decoder offset error also applicable here. `OBJECT_MOTION_FROM_TO` at Seq_Data +576 (open) / +768 (close) points to a translation block at byte 56. That block starts with a flags word; vectors begin at block+4, +16 and +28, giving target (-20,0,0), rate (-6.666667,0,0) for opening. The existing generic decoder shifts these fields and misleadingly prints (0,-20,0). The NPC probe now emits the explicitly decoded `motionTranslation` alongside the generic operation; use the former for this claim. Native relative translation is traced at `FUN_0025fe70` / `FUN_0025f9b0` in research 174.

This is a moving collision obstacle, not just a binary hidden node. NPC navigation and player/projectile collision must follow intermediate gate poses. `mp11copter` has seven sequences/24 commands. The completed turret census (§6) resolves three PKM placements; common CZANIM adds no health records. The helicopter's reachable-call classification remains separate from turret interactivity.

**Proposed map acceptance:** all three NPCs begin below ground on submap 2 and reach the base rescue region through valid links. Two clients operate different levers, observe correct 3-second motion, and collide consistently mid-motion. A C4 blast during opening must settle in the destroyed state and disable later movement. Check NPC replanning when a gate closes, no trapping/teleporting through the bunker ceiling, late join halfway through gate motion, and complete round reset.

### 5.4 MP71 — Fish Hook (Extraction)

**P/M:** 3 submaps: base 290×247, 39,856 cells, 2 links; `tophost` and `topboat` each one link. Starts (0,215,81), (0,216,84), (0,213,83) yield (2114.579,761.809), (2124.579,791.809), (2094.579,781.809). Two kind-1 extraction rectangles:

| Region | Corner / size | X interval | Z interval |
| --- | --- | --- | --- |
| Safety | (0,134,168), 127×18 | 1299.579–2569.579 | 1626.809–1806.809 |
| Safety2 | (0,110,92), 24×94 | 1059.579–1299.579 | 866.809–1806.809 |

Both predicates occur in each `RescueN`, unlike the empty OR arm on the older Extraction maps. The rectangles meet at an edge but do not overlap under half-open membership; test both approaches.

**Environment:** six doors, all range 30: `door_ft_2/3/5/6` use `singleDoor_left`, `door_rg_1/2` use `singleDoor_right`. Their Y levels include 179 and 222; use the placed node, not a 2D proximity circle. Three C4 access actions (points 2, health 1/shield 17):

| Root | XYZ | Healthy / remains polygons |
| --- | --- | --- |
| access1 fence gate | (1937.500,151.561,1167.451) | 2 / 14 |
| access2 access point | (1707.307,149.028,824.467) | 7 / 0 |
| access3 front gate | (2280.000,191.500,840.000) | 4 / 14 |

Three additional typeless `plank_action1..3` call `destroy_plank1..3`; their placed roots have four healthy collision polygons each and no remains collision. Positions are (2349.746,218.567,874.611), (2065.543,184.735,1163.659), (2370.460,176.255,1174.632). **Their health and max-health are zero.** They fail the current-HP-positive C4 eligibility condition in `FUN_002739b0`; counting every typeless action as a C4 target would falsely add these three. The shared hit callback `FUN_00273a50` can nevertheless execute an HP-zero target's death action after a qualifying delivered hit (§6). This establishes a hit-trigger path; precise bullet/explosion delivery and remote replay still require validation.

Four `wframe/wglass` instances carry health 1/shield 0, two collision polygons each, at (2490.076,189.500,598), (2183,189.500,838), (2123,232.500,838), (2158,189.500,637). The `wframe`/`breakapane` callbacks are real mission breakable-glass evidence. The completed shared census resolves two PKM placements (§6), independently of the action list.

**Proposed map acceptance:** extract through each rectangle, cross their exact edge, and reject top-floor lookalikes. Break one window without breaking all four instances. Exercise all six doors, each of three access points, and prove the plank trigger before enabling it. Route followers through changed collision and onto the boat/hostage upper links only when valid. Late join must reproduce doors, glass, access state and NPC state together.

### 5.5 MP52 — The Mixer (Escort)

**P/M:** 10 submaps. Base 486×548, 79,661 stored cells, 12 links; secondary maps include pipes, roof, upper, level9, cages, `extr1` (6), `extr2` (7), `terrw`, stairs. Starts (0,220,270), (0,260,267), (0,237,283) yield (2199.812,2680.285), (2599.812,2650.285), (2369.812,2810.285).

| Region | Initial kind | Corner / size | X / Z intervals |
| --- | ---: | --- | --- |
| Safety | 5 | **(7,119,85)**, 27×24 | 3984.812–4254.812 / 2885.285–3125.285 |
| Safety2 | 5 | (0,335,74), 26×35 | 3344.812–3604.812 / 715.285–1065.285 |
| Safety3 | 1 | (0,437,300), 8×8 | 4364.812–4444.812 / 2975.285–3055.285 |
| Safety4 | 1 | (0,344,68), 5×2 | 3434.812–3484.812 / 655.285–675.285 |

Safety lies on `extr2` with Y range approximately 79.69–172.46. A VIP directly under it on the base must not stage. The objective uses §4's **30-second** wait; Safety selects `chopper_rescue2`, Safety2 selects `chopper_rescue1`. Existing kind-1 Safety3/4 are separate small regions and need a reachability/early-rescue test: the generic AI rescue transition sees kind 1 independently of the mission's staging predicates.

**Environment:** empty action list. Two mission health animations named `destroy_seal_base` and `destroy_terrorist_base` retain health 2/shield 21, but their base roots/targets do not resolve in the realized map: they are orphan Demolition-style scripts, not an active shared-bomb objective. `chopper_rescue1/2` call rotor/SoftImage flight programs. The shared census resolves two MGL and one PKM placement (§6). Rain and helicopter appearance are presentation unless a reachable callback says otherwise.

**Proposed map acceptance:** stage on each correct floor/region, split VIPs across regions and verify branch selection, move a staged VIP out before countdown completes, kill one before staging and another during countdown, and verify final live-in-region eligibility. Probe Safety3/4 without first completing staging. Exercise grenade and gun turret damage against both players and NPCs. No orphan base script may expose a bomb prompt.

### 5.6 MP53 — Foxhunt (Escort)

**P/M:** 3 submaps; base 520×627, 80,582 cells, 2 links; `floor1` has no links, `floor2` has two. Starts (0,347,494), (0,361,491), (0,370,482) yield (3454.010,4870.095), (3594.010,4840.095), (3684.010,4750.095).

| Region | Initial kind | Corner / size | X / Z intervals |
| --- | ---: | --- | --- |
| Safety | 5 | (0,83,268), 22×48 | 809.010–1029.010 / 2605.095–3085.095 |
| Safety2 | 5 | (0,172,120), 47×24 | 1699.010–2169.010 / 1125.095–1365.095 |
| Safety3 | 1 | (0,107,299), 5×4 | 1049.010–1099.010 / 2915.095–2955.095 |
| Safety4 | 1 | (0,176,127), 5×3 | 1739.010–1789.010 / 1195.095–1225.095 |

The objective uses the **30-second** Escort sequence (§4). Its timer branch explicitly stops the six NPC kill watchers; this differs in structure from Mixer even though both timeouts award SEALs. Empty actions and no mission health records do not establish an inert environment: the completed shared census resolves three PKM placements (§6). Common CZANIM adds no health records. Two eight-command helicopter rescue programs and river/waterfall effects are present.

**Proposed map acceptance:** both extraction approaches, split staging, moving back out, the small pre-existing kind-1 regions, and VIP death around the 30-second boundary. Validate follower pathfinding across slopes/river obstacles and correct mounted-turret NPC damage. Exercise timeout with a kill event on the same tick so the explicit watcher stops do not double-award the round.

### 5.7 MP82 — Guidance (Escort)

**P/M:** 5 submaps; base 325×346, 72,446 cells, 6 links; `floor3`, `floor10`, `bridge`, `bridge2`. Starts (0,100,301), (0,112,292), (0,110,297) yield (986.037,2915), (1106.037,2825), (1086.037,2875). Safety is kind 5, (0,29,6), 45×19, X271.037–721.037 / Z-40–150. Safety2 is already kind 1, (0,25,6), 4×4, X231.037–271.037 / Z-40–0. Escort `SEALcheck` waits **20 seconds**, then makes both regions kind 1. The small pre-existing extraction rectangle deserves the same early-entry test as Mixer/Foxhunt.

**Doors and access:** nine range-30 `door_ft1..9` actions use `singledoor_left` and `kick_Door_left`. Four access action records exist, but `access_action3` is unplaced and `destroy_access3` is absent. Count **three active access points**, not four:

| Root | XYZ | Healthy / remains polygons |
| --- | --- | --- |
| access1 | (431.407,-40,480) | 40 / 0 |
| access2 | (621.407,-40,160) | 40 / 0 |
| access4 | (440.043,-12.924,1445.649) | 20 / 0 |

Each is health 1/shield 17 and points 2. The paired destruction action and mission health registration must resolve to the same instance.

**Airstrike:** `radio_call`, SWITCH, range 30, team 0, bitmap `action_helo.tif`, at (907.632,139,1480.207), calls `airstrike_anim_1` with `airstrike1_valve`. `mission.rdr` supplies the text `CALL AIRSTRIKE`. This is an independent environmental action, not the VIP extraction helicopter.

| Time from animation start | Source operation | Gameplay implication |
| --- | --- | --- |
| 0 | `airstrike_anim_1` sets its context valve/hides the radio and calls `f18_airstrike_1`; that immediately calls `destroy_ladderhit` | One-use action must lock authoritatively before visual effects |
| +4s | F-18 becomes visible and follows its SoftImage path | Presentation timeline |
| +5s | inbound radio message | Presentation |
| +10s | jet flyby sound | Presentation |
| +18s | `destroy_ladderhit` calls `knockdown_everything`, calls impact effect, hides ladder | Four `FIRE_WEAPON` operations use `explosive_stuff`/`exploding_fuel` at `airstrike1..4`; shared damage and ladder collision/navigation change |
| +20s | second impact, command 87 targeting `set_access2`, then `destroy_access2` | Wall 2 is also removed by the airstrike; manual C4 and scripted destruction must converge idempotently |
| +22s | completion radio line | Presentation |

These times come from the parallel named sequences, not by adding unrelated WAITs across tracks. The jet is not the damage source: the four weapon calls are. The ladder has no health registration; it is removed by script. Exact blast-record falloff/placement, radio reuse via hide versus valve gating, destroyed-ladder occupancy, and same-tick C4/airstrike score ownership are remaining bounded work.

**Proposed map acceptance:** all nine doors, three actual C4 targets, rejection of orphan access3, SEAL-only one-use radio, simultaneous radio requests, and NPC/player damage at all four blast nodes. Join at +17/+19/+21 seconds, reproduce the correct ladder/wall state and future events without replaying past damage. Destroy wall2 manually before the strike and confirm no second credit/destruction. A VIP or player on the ladder must receive the evidenced fall/interrupt behavior, not remain attached to hidden collision. Separately verify the 20-second rescue deadline and initial Safety2 edge.

## 6. Environment binding rules shared across these maps

The breach/Crossroads audit established the 24-byte `Anim_Health` layout: u8 node reference at +0, float current/max HP at +4/+8, current/max armor at +0xc/+0x10, shield at +0x14. `FUN_002739b0` requires positive current HP and shield at most C4's `ExplosionDamage` 18 before contextual C4 placement. Consequently a typeless action, a health key, and a scene node are three different pieces of evidence; none alone proves a working C4 target.

The shared [Breach damage trace](174-breach-map-audit.md#3-destructible-damage-interfaces-now-decoded) resolves the HP-zero question at the callback level: `FUN_003c7490`, D318596–318640, performs shield and damage handling; `FUN_00273a50`, D120978–121059, checks resulting HP <= 0 without a general old-HP-positive requirement. A qualifying local hit can therefore trigger an initially-zero-HP pane/plank. Animation flag bit 3 interacts with projectile/controller authority and must not be mislabeled “explosive only.” Exact hit delivery and once-only network action/score remain runtime gates.

Preserve `(archive, set, animation ordinal, root instance, node ref)` identity. Search flags and instance ancestry matter when `di_good`, `barrel_good`, `wglass`, cups, lights and bottles repeat. Apply the callback's current collision state to movement, bullets, explosions, NPC pathfinding and rendering together. Do not mutate every owner sharing a short name. A destroyed gate can leave different collision rather than no collision; counts in this document are subtree measurements, not a proof that a capsule can pass.

All seven embedded `CZANIM.ZAR` members were also parsed: each has **288 animations and zero `Anim_Health` records**. This closes the missing-common-health census; it does not imply those common animations are unused. Mission callbacks call common effect/door/damage programs, and their instance context still matters.

The completed [mounted-weapon census](177-emplaced-weapons-audit.md#3-per-map-census-measured) resolves all three parts under **43 manual placements across the retail maps**, including these 17 NPC-map placements:

| NPC map | Resolved manual roots | Weapons |
| --- | --- | --- |
| MP6 | none | none |
| MP10 | `mp10_turret_lmg`, `_rmg`, `_mgl` | LMG, PKM, MGL |
| MP11 | `mp11_turret01..03` | three PKM |
| MP71 | `mp71_turret01..02` | two PKM |
| MP52 | `mp52gren_turret_1..2`, `mp52gun_turret_1` | two MGL, one PKM |
| MP53 | `mp53_turret1..3` | three PKM |
| MP82 | `mp82turret_1..3` | three PKM |

These placements are source-bound, not pending a name search. Mounting, occupancy, aiming, firing, damage and network behavior remain the shared runtime work in research 177. The map acceptance cases above include this census even where the mission action list is empty.

For a full environmental claim, combine this mission audit with the shared **common-program and turret census**. `READERC.ZAR/ai_turrets.rdr` has alternating turret name/config definitions. `FUN_003aaa90`, D301346–301412, loads them; `FUN_003a9780` around D300690 walks placed scene nodes and matches their names through `FUN_003aac40` before constructing a turret with `FUN_003aa350`. The lookup is a **case-sensitive first-prefix match**, not an exact-name comparison. This bypasses `actions.rdr`. A turret asset library inside a ZDB is not by itself a placed usable turret, and an empty action list is not negative turret evidence. The shared audit owns exact instance/weapon/aim/occupancy/reload details so this lane does not invent counts from a substring search.

## 7. Current implementation gaps and proposed integration

These are repository observations as of 2026-10-04, followed by proposals; they are not claims about the original executable's architecture.

| Existing seam | Current behavior | Proposed change / acceptance gate |
| --- | --- | --- |
| `packages/viewer/src/simMap.ts:22`, `:53` | SimMap retains player slots, hull, doors and loose C4 targets; parsed AI map is used for spawn slots and discarded | Retain read-only NPC definitions, full AI maps/regions/links, mission mode and validated environmental bindings. Per-room mutable region kinds and obstacle state live outside immutable parsed data. |
| `packages/scene/src/aimaps.ts:60` | Grid cells/links parse; cellsB and several flags are not semantically decoded | Decode height, traversability, link direction/permission and path cost before claiming NPC navigation. Validate against the seven map start-to-zone routes, especially MP11/MP52 levels. |
| `packages/viewer/src/loadMap.ts:367`, `:546` | Loads SEAL/Terrorist body types; `typeBodies` accepts only those teams | Load the three NPC types through the same character/skeleton/skin pipeline, including unarmed/hostage/follow/rescued motions. An NPC body is not a selectable player armory type. |
| `packages/match/src/room.ts:422`, `:1766`, `:1945`, `:2084` | Player records, player hit casts, Suppression result watcher, player round reset | Add stable NPC entities and a mode policy with explicit result reason/deadlines. NPC damage uses the shared hit-part/blast machinery with distinct scoring. Keep existing Suppression policy behavior intact. |
| `packages/match/src/server.ts:119` | `forkSimMap` provides room-local moving-door data around a shared parsed map | Extend cloning/isolation to mutable owners, gate transforms, navigation blockers and region-kind lists. Two rules rooms must not share destroyed geometry or extracted NPCs. |
| `packages/viewer/src/net/protocol.ts:44`, `:245` | Protocol 9 snapshots contain player bodies and optional doors | Add versioned NPC/objective/environment sections with bounded counts, stable IDs, revision and authoritative deadlines. Include them in initial welcome and snapshots, not only transient events. |
| `packages/viewer/src/traversal.ts:319`, `:465`; `walk.ts:276` | Action-held bit exists for traversal | Share a contextual action intent abstraction for follow/stop, switches and holds. Preserve press, hold, release and cancellation on controller and touch. Input parity is separate from launch-page controller support. |
| Renderer/effects and collision owners | Node activation and transforms can be represented; effect scripts are only partially interpreted | Replay cosmetics from stable event IDs; set current pose/visibility/collision from state snapshots. Moving gates need transformed collision and navigation during motion, not a visibility-only switch. |

Proposed server-owned state separates three concerns:

```text
NpcState: stable npcId, type, pose, AI submap/cell, health/alive,
          currentLeader, creditedRescuer, behavior, stagedLatch,
          extractionState, extractionTick, fade
ObjectiveState: mode, per-NPC outcome latches, side kill counts,
                rescue/free/true counts as evidenced, zone kinds,
                extractionSite/deadline, penalty sequence, result/reason
EnvironmentState: per-instance damage/activation, gate pose + timeline,
                  switch/radio consumption, scheduled strike events,
                  collision/navigation revision
```

The exact wire layout is not prescribed. Use generation-stamped player references or session identity where a player seat can be reused. Store current leader and rescue-credit owner independently. Snapshot late joins into the current state, then schedule only future effects; never replay an old strike's damage or rescue score. Apply a collision/navigation revision before replaying predicted player commands that use that revision. Round reset restores NPC spawn/state/health, region kinds, gates, doors, all props, consumed actions, pending blasts and timers as one new round generation.

Owner rulings remain in force: the launch countdown is the owner's 10-second rule, current MISSION R5 restores first-person view, the server/shared simulation remains DOM-free, and this task does not authorize campaign AI or campaign missions. NPC mode behavior must not silently replace the owner's existing solo-room or room-abandon behavior. The menu must not advertise fully playable Extraction/Escort before NPC movement and objective authority pass their gates.

## 8. Dependency order and meaningful tests

This is the proposed implementation DAG; environmental work can proceed alongside NPC navigation, but integration cannot skip either:

```text
source/oracle closure ──> immutable mode/NPC/environment descriptors
        │                         │
        ├─> scoped mutable collision + moving gates ─> nav obstacle revision
        └─> AI cell/height/link semantics ────────────> follower navigation
                                                     │
NPC models/motions + NPC damage/identity ──────────────┤
                                                     v
                                     Extraction / Escort mode policies
                                                     │
               snapshot/rejoin/reset + action inputs ─┤
                                                     v
                         seven-map multiplayer and mobile acceptance
```

1. **Evidence gate:** close the explicit §9 questions with small executable traces. Extract descriptors through existing parsers, validate all named references and report orphan scripts rather than silently accepting them. Pin authored values with small synthetic fixtures and local retail probes, not committed asset bytes.
2. **World-state gate:** prove one static destructible, one instanced pane, one mid-motion Death Trap gate and Guidance's multi-track airstrike across server movement, hits and client rendering. Add room isolation and revision-order tests now.
3. **NPC gate:** three separately identifiable unarmed NPCs spawn on the right floors, receive damage, follow/stop, replan around changed gates, detach from a dead/left leader and preserve rescuer credit. Run path tests over each real start-to-zone pair; an unobstructed flat synthetic map alone is insufficient.
4. **Mode gate:** implement Extraction and Escort as distinct deterministic policies with source-anchored delays/latches, timeout winners and score accounting. The Suppression regression fixture must retain launch, grace, timeout, respawn and match-screen behavior.
5. **Network/input gate:** two clients plus a spectator; late join during staging/gate/strike, reconnect before/after extraction, reordered or duplicated requests, and a fresh round. On gamepad and narrow touch layout, verify action context, cancellation, wrong-team rejection and switching from door to NPC intent without accidental activation.
6. **Map acceptance gate:** exercise the per-map cases in §5, then mark that map supported. Missing DLC archives remain explicitly pending.

High-value integration matrix:

| Test | Failure it catches |
| --- | --- |
| NPC under Mixer Safety on base, then same XZ on submap 7 | 2D-only region implementation |
| Extraction two free/one untouched; then each possible third outcome | Premature “rescue two” win and mishandled SEAL penalty |
| NPC dies inside region in same simulation step | Duplicate rescue/death counting; concurrent watcher arbitration |
| Penalty with 35s left, and two increments before host poll | Clamp-to-one-second behavior and unresolved coalescing race |
| Escort three stage, one exits; one dies before/after timer, final one enters | Confusing staging latch with current occupancy; wrong final quorum |
| Escort round clock expires while terrorists still live | Accidental Suppression draw |
| Early entry into Mixer/Foxhunt small kind-1 zone or Guidance Safety2 | Generic AI extraction preceding mission stage |
| Leader dies/disconnects/rejoins; seat reused by a different player | Stale follow pointer and incorrect rescue credit |
| Glass breaks in only one repeated instance | Short-name or prototype-global activation bug |
| Death Trap gate closes on route then is destroyed mid-motion | Stale swept collision, invalid nav path, destroyed gate resurrection |
| Guidance wall2 already destroyed when strike reaches +20s | Duplicate points, sounds or collision mutation |
| Rejoin at strike +19s and reset before +20s | Replayed past damage or stale scheduled event across round generation |
| Separate rooms on same parsed map change different gates | Shared mutation leaking through `forkSimMap` |
| Malformed NPC/objective snapshot counts or stale generation | Decoder overrun and accidental state transfer into next round |

Effort bands are conditional, not a promise: descriptor/policy work is modest **after** the source/oracle gate; the major work is NPC navigation/motion/damage/replication and mutable collision. Seven maps are not seven independent objective implementations, but each adds distinct route/environment validation. A “few switch scripts” estimate excludes the critical path. Estimate calendar duration only after the first NPC crosses Death Trap's linked submaps and Mixer's upper extraction region in the authoritative simulation.

## 9. Bounded unknown ledger

| Priority | Unknown | Smallest closure action |
| --- | --- | --- |
| Before Extraction winner implementation | Empty `(INREGION) OR ()` arm and local-team startup delay | Disassemble `FUN_0025e960` register flow and record host/remote watcher transitions on MP6; compare MP71's two-region expression |
| Before declaring objective parity | Same-tick NPC death/rescue/elimination/timeout and Escort one-survivor final success | Capture named valves/sequences around one forced event ordering per case |
| Before NPC controls | Recruit/stop reach, team, look/cone, max followers and lost-leader timeout | Trace the contextual action picker into FOLLOW state assignment, then controller/touch intent tests |
| Before navigation | Optional correction/actor placement after the newly decoded quantized cell height; walkability/cost, link permission, water/ladder/door policy | Trace path functions from `FUN_005fb1c0`; verify start/zone-connected components and ground heights per map |
| Before damage parity | NPC trait health/armor, dead-body region interaction, explosion scoring | Follow character inheritance and shared damage path; compare player/NPC kills and rescue credit |
| Before Fish Hook plank parity | Specific hit delivery and authority through the established HP0 callback/action path | Exercise each `plankaccessN` with source ammo locally/remotely; keep C4 placement absent because its positive-HP guard is already proved |
| Before Desert Glory environmental completion | Fuel threshold/channel, duplicate bottle registration, repeated child binding, door-linked hostage-route geometry and ambient blast reachability | Resolve the precise callback/call graph and original damage event per family; probe the two nine-polygon door alternatives |
| Before Guidance strike completion | Four blast transforms/ammo values, ladder occupancy, already-destroyed wall score | Bind `airstrike1..4`, resolve `exploding_fuel`, test source action 87 and mid-ladder interruption |
| Before full map gameplay completeness | Common callback context and mounted-weapon runtime (source census is closed: zero extra CZ health, 17 resolved manual placements) | Apply research 177's mount/fire/damage/network gates and the per-instance acceptance list |
| Before shipping reconnect | Original leader disconnect versus death, saved rescue-credit lifetime | Trace controller destruction and actor-ID reuse; define explicit web generation/session mapping |

No unresolved row justifies inventing gameplay, copying campaign behavior, or labeling a decorative asset an active mechanic. The corpus now gives specific functions, regions, script offsets and instances to close each gap.

## 10. Readings and placeholders

| name | in code | value and evidence | status |
| --- | --- | --- | --- |
| `ESCORT_ELIMINATION_HOLD_READING` | viewer `net/rules.ts` (read by match `room.ts`, the play arm's elimination) | §4a: `28` s, the SEALs' elimination on a SEAL host -- `start` @888 sets `mp_winner = 0`, `escort_success` WAIT 2 @7208 and WAIT 5 @7268, `success` WAIT 20 @7436 and WAIT 1 @7472 (MP52; MP53, MP82 at §4's offsets); `room.test.ts`; owed: a capture | reading, pending review (LATER 126) |
| `ESCORT_TIMEOUT_HOLD_READING` | viewer `net/rules.ts` (`timeoutHoldS`, read by match `room.ts`, the play arm's time-out) | §4a: `28` s, the time-out's SEAL win -- `mission_timer` @7036 sets `mp_winner = 0` (MP53 @7116, MP82 @6448), then `escort_success` and `success` as above; `room.test.ts`; owed: a capture | reading, pending review (LATER 127) |
| `ESCORT_LINES_READING` | viewer `roundCues.ts` (`escortDecided`, `escortKills`) | §4a: `escort_success` on every SEAL win; EndRescue then `hostages_rescued`; `start`'s `killcount >= 3` and Terrorists-eliminated branches; the kill one-shots -- read at run time off the disc's MP52, MP53, MP82; `roundCues.parity.test.ts` (the pin, re-derived from the disc) | reading, pending review |
| `ESCORT_EXTRACTED_AT_DECISION_PLACEHOLDER` | was viewer `roundCues.ts` | `2`: the extraction's first line and `^*PT_0051` posted at the room's `eliminated` `reason: 'rescue'`, 2 s after the original's `truecount`, with EndRescue1's copy; settled by the room's `escort` at the extraction naming the VIP | retired 2026-10-20 (LATER 131) |
| `ESCORT_IN_ROUND_LINES_READING` | viewer `roundCues.ts` (`escortCues`; played by `roundAudio.ts` `escort`) | §4: RescueN's and EndRescueN's first branch by the VIP its `<name>_valve_alive` names, VIPcheck's branch after its WHILE by `player_team` (MP52 @3836, @4536-@4596, @6716-@6948; MP53, MP82 at §4's offsets) -- read at run time; a decision keeps RescueN's and EndRescueN's pending steps and VIPcheck's on the time-out alone; `roundCues.parity.test.ts` (the pin), `escort.test.ts` (the room's moments) | reading, pending review (LATER 131) |
| `ESCORT_KILLS_STOPPED_READING` | match `extraction.ts` (`scriptEscort`) | §4: the decisions whose path stops HostKill1-3 / SealKill1-3 -- `start`'s SEALs-eliminated branches on all three maps (MP52 / MP53 @1368-@1952, MP82 @1348-@1916), `escort_success` on every SEAL win on MP52 (@7120-@7160) and MP82 (@6532-@6572), MP53's `mission_timer` at the time-out (@7068-@7108); after one, a kill adds nothing to `killcount`; `escort.test.ts` | reading, pending review (LATER 131) |
| `ESCORT_VIPCHECK_FRAME_ORDER_READING` | match `extraction.ts` (`scriptEscort`) | §4: two VIP kills due in one tick tell VIPcheck's 'aborted' and then decide `hostageKills` in that tick (its first line posted, the rest dropped), as the zAnim interpreter would if it steps the sequences in record order (`start` @408, the kill one-shots @2672-@3568, VIPcheck @6644); settled by the interpreter's per-frame walk, or a capture of two VIP kills inside one frame | reading, pending review (LATER 131) |
| `ESCORT_KILL_COPY_FROM_JOIN_PLACEHOLDER` | viewer `roundAudio.ts` | the N-th kill one-shot of a side plays copy N's music, counted from the round's start the page saw; a page that joined mid-round counts from its join (the welcome carries `alive`, not the killer's side), and a VIP killed by a player who has since left counts nothing on the page (no side for a departed killer) where the original's valve counts it, so that side's later kills play one copy low; settled by the welcome carrying the two counts and the room telling the killer's side with a hostage `kill` | open |
