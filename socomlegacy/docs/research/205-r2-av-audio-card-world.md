# 205 -- R2-AV -- audio, movies, card, services, world (round 2; the static reads OWED-CAPTURES still listed)

- Research date: 2026-10-04 (research wave 1, round 2 and the close; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/R2-AV-audio-card-world.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/LEDGER-ALL.tsv`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V7 (claims 8-9) has landed and is folded in as §8; both confirmed.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WT`; the archive's absolute root is dropped; references to the other reports are links to their notes; the claims research 206 §1 overrides are named under this header. The substance is verbatim.

Agent R2-AV, research wave 2026-10-04, round 2. Read-only; no build, no game run, no server. Scope: OWED-CAPTURES ([206](206-verification-overrides-and-the-waves-close.md) §4)
"Static reads still owed", subsection "Audio, movies, card, services (C7 ([186](186-c7-audio-movie.md)), C8 ([187](187-c8-card-online-services.md)), C9 ([188](188-c9-world-render-platform.md)))", plus every C7 voice row carried
from research 170 with no new work (`ledger-C7.tsv` rows 55-78). The `FUN_00339de0` frustum read is R2-UI's ([204](204-r2-ui-frontend.md)) and is
not here. Per OT.R27 the voice rows are answered for what a player sees and hears (who hears whom, the talk buttons,
the marks, the timers), not the transport.

Starting points read first: `C7-audio-movie.md` §3.2, §3.3, §3.5, §4, §5; `C8-card-online-services.md` §3-4, §32,
U11-U12, Q3; `C9-world-render-platform.md` L5, U7, U14; `V4-verify-ui-audio-card.md` (C7-C9 sections); research 170,
121 §6, 122 §12, 81 §12. Sources: the r0001 decompilation (`D:L<n>`), the r0001 ELF (`.text`, `.data`), the disc's
`READERC.ZAR` (`controller.rdr`, `character.rdr`, the dialogs), `UIZANIM/EXTZANIM/MPZANIM.ZAR`, `SOUNDRDR.ZAR`,
`RUN/IRX/MCMAN.IRX`, all 34 map `.ZDB`s, `989SND.IRX.decomp.c`, Ziemas' 989snd, reCOM, Harry62's GameObject layout.
Decompiled text is cited, not copied.

**Reproducibility.** Scripts and outputs are in `scratch/R2-AV/` (its `README.md` lists them). `check_claims.py`
re-checks 85 load-bearing operands and lines (ELF instructions and words, decomp line regexes, MCMAN.IRX
instructions, a 989SND decomp line): **85/85 PASS** (`check_claims.out`). `write_ledger.py` writes
`ledger-R2-AV.tsv`.

## Corrections of 2026-10-08 (SVC-20c's review)

Written 2026-10-08 by SVC-20c of web sprint 20 (research 225 §5, §5.1), from its review's second pass, which read the
player actor's vtable in the ELF; the original text stays where it stands with a bracketed correction at the place it is
contradicted. Nobody ran the game: the row is a source reading.

| # | 205 said | now | source, grade | the re-read |
|---|---|---|---|---|
| C1 | in a respawn game a dying player keeps his TEAM/OFFENSE/DEFENSE channel, "and with it his talk flag", until he respawns | he keeps the **channel**, not the **flag**: every online death of the local player clears the talk flag, respawn or not -- the player actor's vtable +0x58 (0x6691f8) is `FUN_00547af0`, whose branch (controller +0x2c true, +0x34 false) calls `FUN_0030e6e0(voice, 0)` with no respawn test. His hold ends; a dead player talks again only after a new press | SVC-20c's review, F5 (the ELF's vtable and the decompilation); research 225 §5 | holds: D:L413088-413093 (online, `DAT_0045a0c1` set: `FUN_0030e6e0(DAT_0045b718, 0)` at D:L413093) |

## 0. Summary

47 rows: **RESOLVED 30, PARTIAL 9, NOT-A-GAP 6, UNRESOLVED 2.** Grades: PROVEN 7, STRONG 30, BELIEVED 10. Of C7's 21
voice rows that were UNRESOLVED: 15 are now RESOLVED, 3 PARTIAL (the count, the indicator look, the modulation) and 3
NOT-A-GAP (the talk stance; the wire framing and the record-gain steer under OT.R27 and OT.R24).

| item | status | grade | one-line answer |
|---|---|---|---|
| VOICE_OFFENSE_DEFENSE_NUMBER_READING | RESOLVED | PROVEN | TEAM sends 0, **OFFENSE 2, DEFENSE 1** (the menu row arguments); the HUD icons agree |
| VOICE_ROUND_TALK_BUTTON_READING | RESOLVED | PROVEN | Default/Reverse/Config4: CIRCLE (TeamCommand) and L2 (SwapWeapon2). Goldeneye: SQUARE, and L2 has no talk |
| VOICE_LOBBY_BUTTON_EDGE_READING | RESOLVED | PROVEN | CIRCLE pressed -> VCButton(1T); released -> VCButton(0T); held -> the icon follows `can_talk` |
| VOICE_LATE_JOINER_READING | RESOLVED | PROVEN | game `+0xcc` is the `late_joiner` valve, set when the client joins a game that has started |
| VOICE_SIDE_BIT_READING | RESOLVED | STRONG | The Terrorist side gets +4 (channels 4-7) and SEALs 0-3; it follows the side swap |
| VOICE_SPECTATOR_CHANNEL_READING | RESOLVED | STRONG | 10, never 14: a spectator's team word is exactly 0x10000 |
| VOICE_DEAD_CHANNEL_READING | RESOLVED | STRONG | +0xe1 bit 4 = alive (cleared by OnDeath); 0x22 = death (controller OnDeath); 0x23 = respawn |
| VOICE_CHANNEL_MAP_READING | RESOLVED | STRONG | R170's map confirmed. **Correction: in respawn games the dead keep their living channel** |
| VOICE_DEAD_TALK_READING | RESOLVED | STRONG | Yes, the dead can talk: the command menu still ticks when dead, and the talk routes have no alive test online |
| VOICE_TALK_STANCE_READING | NOT-A-GAP | STRONG | No stance exists: "state 5" is the command menu's own state byte; the soldier is untouched |
| VOICE_FLOOR_HOLD / RETRY / CUTOFF_LOCKOUT | RESOLVED | STRONG | 10 s / 15 s / 1 s / 10 s confirmed. **New: a hold that keeps the talk flag set resumes on its own after 20 s** (10 s on, 10 s off) |
| VOICE_TALK_LOCKOUT (new) | RESOLVED | STRONG | After a round talk ends, CIRCLE and the command menu are dead for **1.3 s** (L2: 1.0 s). A tap under 0.3 s opens the command menu |
| VOICE_WHO_IS_TALKING_MARKER_PLACEHOLDER | RESOLVED | STRONG | A HUD marker (type 9) draws `hud_talk.tif` at the speaker; hidden beyond 900 units |
| VOICE_ROW_MARK_READING | RESOLVED | STRONG | No per-row voice mark: the lobby rows are plain names (`"%s"`) |
| VOICE_TALK_SOUND_READING | RESOLVED | STRONG | No sound on press, busy or release |
| VOICE_MODULATION_PLACEHOLDER | PARTIAL | STRONG | Default ON. Applies the character's VoiceFont (pitch offset + spectral factor) to the talker's encoder; off in the game lobby |
| VOICE_MOD_LOBBY_OFF (new) | RESOLVED | STRONG | Voice in the game lobby is never modulated |
| VOICE_INDICATOR_LOOK_PLACEHOLDER | PARTIAL | STRONG | The lobby icon's logic is decoded (talk shows only while recording); the motion needs a capture |
| VOICE_CHANNEL_COUNT_READING | PARTIAL | BELIEVED | A u16 the DME library returns for the channel; what it counts is not readable |
| VOICE_WIRE_FRAMING / RECORD_GAIN_STEER / TALK_KEY / CODEC / MIC_NOTICE | NOT-A-GAP | -- | Transport (OT.R27), codec (OT.R24) or owner's calls |
| BED_FADE_SECONDS_PLACEHOLDER | RESOLVED | PROVEN | No fade: a new slot record's +4 is -0.1, so a bed stop is a key-off (the tone's release). Upgrades C7 |
| landingHurts | RESOLVED | STRONG | CHRSND_DAMAGE plays only if the landing hurts and the player lives; a lethal landing plays CHRSND_DEATH |
| emitter clamp at 127 | RESOLVED | STRONG | Confirmed: FixVol clamps the whole product at 127 before the square law |
| HQ duck: lines and release | RESOLVED | STRONG | 24 HQ lines, all campaign (M51, M72), none in MP. Released 0.01 s after the last HQ stream, then a 5 s return |
| PLAYER_INDOORS writer | RESOLVED | STRONG | Comes from the SEAL's own floor object (+0xa bit 7), not the camera's. Also names H1 ([189](189-h1-hostage-ai-animation.md)) U6's bit |
| FALLSOUND | RESOLVED | STRONG | A SOILS key, played by zAnim `BODY_FALL_ON_MATERIAL_SOUND` on the body's floor; default `.FALL_GROUND` |
| KEYBOARD_SOUND_TRIGGERS_READING | RESOLVED | STRONG | Open ScaleUp, close ScaleDown, move Navigation, type KeyPress (Negative at the limit), Enter KeyPressEnter |
| EXIT_STATE_GROUPS_READING | PARTIAL | STRONG | SP_COMMON is registered at every campaign map load; when it is cleared was not traced |
| BOOT_POPUP_METAL_READING | PARTIAL | BELIEVED | **Correction:** do_onstart's popups do not fire on a normal boot. The card check's popups do (depends on the card state) |
| .GUN_EMPTY | PARTIAL | BELIEVED | Kit handle +0x88c; plays on a dry pull while the dry count is under 2 |
| LFO grain | PARTIAL | BELIEVED | Ziemas `iop/LFO.c` is fully transcribed; not checked against the disc's IRX |
| Gaussian interpolation; activation-1 scripts | UNRESOLVED | -- | Hardware outside the corpus; not attempted |
| MOVIE_SKIP_CARRY_READING | PARTIAL | STRONG | Every binding to the extras' movies fires on the press, and the movie state does not flush the pad. A carried release skips the movie if CROSS is still held |
| C7 §1.3 persona GetTextInput | RESOLVED | STRONG | Already answered by C8 Q3 / research 119 (14 characters, 31 bytes) |
| MC_DAMAGED_RESULT / GETINFO_PLACEHOLDER | RESOLVED | STRONG | mcman answers -5 only for a PS1 card; no script branches on `memcard_error_code` 6. The console analogue is -2 |
| GetDir dates (C8 U11) | RESOLVED | PROVEN | Two times: _Create from dirent +8, _Modify from dirent +0x18 |
| FILTER_ID_READING (C8 §32) | RESOLVED | STRONG | The client clears FilterID 10, then FilterID 1: ids are field numbers. Keep `'field'` |
| REMOTE_STEP_STICK_READING (C9 L5) | PARTIAL | STRONG | Only SetThrottle (vtable +0x20) writes them, from the shared tick's pad sticks; the network class's pad source is unread |
| scroll dT unit and band flags (C9 U7) | RESOLVED | STRONG | dT is in seconds. Band +0x16: 1 automatic, 2 manual. +0x19 bit 0: zero speed |
| SKIN_TOP4_INFLUENCES (C9 U14) | RESOLVED | PROVEN | Measured: droppedMax 0.1513; 105 of 560 models lose weight |

---

## 1. Voice (research 170's rows, OT.R27: what a player sees and hears)

Research 170 §10 is the prior search for every row here. Its own "what would settle it" was a two-instance recomp
run, S8. This section settles what the code alone can settle; the S8 rows that remain are listed at the end.

### 1.1 VOICE_OFFENSE_DEFENSE_NUMBER_READING -- RESOLVED, PROVEN
- **What it stands for:** which ACTIVE CHANNEL row of the command menu sends 1 and which sends 2. Research 170's
  current reading is the menu order: 1 OFFENSE, 2 DEFENSE.
- **What I did:** disassembled the menu builder `FUN_002344e0` (0x234c10-0x234d00, `radio_rows.py`). Each row is built
  by `FUN_002306e0(menu, label, callback, a3, ...)`, which stores a3 at row +0x68 (D:L82100). The menu calls the
  callback with that value (D:L83851).
- **Answer:**
  - TEAM (0x3e61b0): `FUN_0022f950` with **0**.
  - OFFENSE (0x3e61e0): with **2** (`addiu a3,zero,2` at 0x234cb8).
  - DEFENSE (0x3e6210): with **1** (0x234ce0).

  `FUN_0022f950` passes the value through to `FUN_002c2c20` and remembers it in the player's +0xc4. The HUD's icons
  (1 defense, 2 offense, research 170 §3.1) therefore agree with the menu. Research 170's reading is reversed.
- **Implementation:** the voice channel map: `OFFENSE = 2`, `DEFENSE = 1`. Test: choosing OFFENSE puts a SEAL on
  channel 2 and a Terrorist on channel 6.

### 1.2 VOICE_SIDE_BIT_READING -- RESOLVED, STRONG
- **What it stands for:** which side's channels get +4.
- **What I did:** read `FUN_002c2c20` (D:L164449-164456). The +4 applies when the player's slot team word equals
  `DAT_004412d8 ? 0x40000001 : 0x80000100`. That is the same constant `FUN_002c30b0` tests, which research 91 and 94
  name "is a Terrorist". `FUN_002c3330` (D:L164835-164871) maps the opposite constant to `player_team` 0 (SEAL). The
  captures (V2: body +0xc8 = 0x40000001 on the SEAL, 0x80000100 on the Terrorist) agree for the unswapped case.
  `DAT_004412d8` is the side-swap byte: its writers are the "switch teams" path (`FUN_002bada0` toggles it,
  D:L160258) and the game-info decode (D:L163463-163466).
- A second gate was not in research 170: +4 also needs voice +0x4d == 0. The only store to a voice object's +0x4d is
  the constructor's `sb zero` (0x310338, `store_off.py 4d`), so the gate is always open.
- **Answer:** **the Terrorist side is on 4-7 and the SEALs on 0-3, counted by side, not by team word.** After a side
  swap the same players change channel blocks.
- **Implementation:** `channel = base + (side === 'TERRORIST' && base !== 9 ? 4 : 0)`. Test both sides with the swap
  on and off.

### 1.3 VOICE_SPECTATOR_CHANNEL_READING -- RESOLVED, STRONG
- **Answer:** a spectator is on **10, never 14**. His team word is set to exactly 0x10000 (`FUN_002c3330(0x10000)` at
  D:L159276, D:L159343, D:L166262), which never equals either side constant. So the OR of 4 at D:L211588 cannot apply,
  and research 170's guard ("refuse a channel above 11") is never exercised by the original.
- **Implementation:** keep the guard as defensive code; the test is a spectator on 10 in the lobby and in the round.

### 1.4 VOICE_DEAD_CHANNEL_READING and VOICE_CHANNEL_MAP_READING -- RESOLVED, STRONG (with a correction)

**What +0xe1 bit 4 is.** `FUN_0029e8b0` (D:L144772-144779) clears +0xe1 bit 4 and then calls the controller's vtable
+0x18. This is reCOM's `CEntity::OnDeath` (`ent_main.cpp:64-68`: `m_isAlive = false; m_control->OnDeath()`), and the
reCOM layout around it matches: `m_control` +0xc0, `m_team` +0xc8. The actor constructor sets the bit (D:L145030).
So the bit is "alive", as research 170 read it.

**Event 0x22 is death.** The SEAL controller vtable (0x4062d0 and 0x6694b0) has +0x18 = `FUN_005979a0`, its OnDeath
(`check_claims`). Online it does one of two things (D:L454484-454492):
- if the game's respawn byte +0xdc is 0, **or** the player is a ghost (+0xd2): it clears the talk flag and sends unit
  event 0x22, which moves the player to the dead zone;
- otherwise (a respawn game): it only starts the body's fade (`FUN_00552780(0, 0.1, ...)`). **No channel change.**

`FUN_00543d50` (the ghost set-up, D:L410460-410463) also sends 0x22.

**Event 0x23 is respawn.** It is sent by controller vtable +0x5c (`FUN_00597f50`, D:L454598-454603, only when the
player is not a ghost). The respawn path calls that slot right after placing the body at its spawn point
(D:L455318-455323). The handler restores the remembered ACTIVE CHANNEL `+0xc4` (D:L497732-497737).

**Correction to research 170's map.** "The dead hear only their side's dead" holds only in games without respawn. In a
respawn game a dying player keeps his TEAM/OFFENSE/DEFENSE channel, and with it his talk flag, until he respawns
[2026-10-08, C1: the channel, not the flag -- every online death clears the talk flag, `FUN_00547af0` D:L413093]. A
player-visible difference: in a respawn game the dead and the living of a side still hear each other.

**Implementation:** the room's channel rule:

    onDeath: if (!respawnGame || ghost) channel = deadZone(side)
    onRespawn: channel = remembered

Test: a dying SEAL is on 3 in a no-respawn game and stays on 0 in a respawn game.

### 1.5 VOICE_LATE_JOINER_READING -- RESOLVED, PROVEN
- **What it stands for:** what game +0xcc is. Research 170 read it as "joined late"; M2 ([193](193-m2-mp-net-replication.md)) read 0 as "staging lobby".
- **What I did:** `FUN_002a7340` (D:L149278) writes +0xcc and mirrors it into the valve at game +0x2c. The game
  object's set-up binds +0x2c to the valve named **`late_joiner`** (0x3f10f8; D:L149565-149566). Harry62's GameObject
  also names +0x2c LateJoiner. At join (D:L159263-159282), a game whose state byte is below 2 sets 0, and any other
  sets **1**. The next round's transition clears it (D:L55711, D:L55716).
- **Answer:** +0xcc = late joiner. Its effects:
  - `VCButton` refuses the lobby talk press (research 170 §4.1);
  - the round start puts the player on the dead zone (D:L55848-55849);
  - `CheckForcedLaunch` hides the talker bar.

  M2's "staging lobby" reading is incorrect.
- **Implementation:** a member flag `lateJoiner` set when joining a game in progress and cleared at the next round's
  start. Test: a late joiner's lobby talk press does nothing, and his first round is on the dead zone.

### 1.6 VOICE_LOBBY_BUTTON_EDGE_READING -- RESOLVED, PROVEN
- **What I did:** read the raw binding records with `dump-dialogs.ts --dialog dlgGameLobby.rdr --tree`
  (`dlg_gamelobby_tree.out`). The states are those of `FUN_002d9ff0`: 1 pressed this frame (FALLING), 2 held (DOWN),
  3 released (RISING).
- **Answer:**
  - `CIRCLE STATE FALLING` -> `do_team_button_down` (`VCButton(1T)`): **the press**;
  - `CIRCLE STATE RISING` -> `do_team_button_up` (`VCButton(0T)`, then `ChatIconReset`): **the release**;
  - `CIRCLE STATE DOWN` -> `do_circle_button_down`, every held frame: the talk icon if `can_talk == 1`, else the
    no-talk icon.

  One binding fires per frame, first match. `SQUARE DOWN` is listed before `CIRCLE DOWN`, so holding SQUARE as well
  suspends the icon update.
- **Implementation:** the lobby talk key: press sets talk, release clears it, and each held frame sets the icon from
  "recording". Test: hold R (the page's CIRCLE) with the floor busy, and the no-talk icon shows.

### 1.7 VOICE_ROUND_TALK_BUTTON_READING -- RESOLVED, PROVEN
- **What I did:**
  - Read `controller.rdr` from the disc (`controller_rdr.ts`): four presets, Default, Reverse, Goldeneye and Config4.
  - Read the action-name table at 0x3f2be0. Its 13 entries are the action ids: 10 = `SwapWeapon2`, 11 =
    `TeamCommand`.
  - Read `FUN_002c6670`'s control-to-slot chain (D:L167017-167071): Circle 7, L1 12, L2 13, LeftStickTap 15, R1 10,
    R2 11, RightStickTap 14, Square 8, X 9, Select 1, Pause 0, anything else 0x10.
  - Read the parser (D:L167143-167150: preset+0x12+action = slot). Unbound actions are initialised to 0x10
    (D:L166610). `controller_slots.out` prints the table.
- **Answer:**

| preset | route A (TeamCommand, held > 0.3 s) | route B (SwapWeapon2, RUN AND TALK ON) |
|---|---|---|
| Default, Reverse, Config4 | CIRCLE (slot 7) | L2 (slot 13) |
| Goldeneye | SQUARE (slot 8) | **unbound: RUN AND TALK cannot talk** |

  RUN AND TALK (`DAT_0044d4f8`) is in .bss (0 = OFF) unless a profile sets it.
- **Implementation:** a gamepad preset table taken from `controller.rdr` for the talk actions. Test: Goldeneye L2
  never talks.

### 1.8 VOICE_DEAD_TALK_READING -- RESOLVED, STRONG
- **What I did:** checked whether the talk routes run while the player is dead.
  - The HUD tick `FUN_001f7ff0` calls the command menu's state machine `FUN_002360d0` every frame when the
    controller mode `ctrl+0x221` is 0 or 2 (D:L56689-56692), whatever the alive bit. `ctrl+0x221` is written only by
    `FUN_00597740`, whose callers are menu and UI modes, and by the controller constructor (`store_off.py 221`);
    death does not change it.
  - Online, route A (D:L84278-84281) and route B (D:L83895-83920) set the talk flag with no alive test. The alive
    tests at D:L84229 and D:L84290 are offline only.
  - The voice object refuses the flag only on channel 11 (D:L210788).
- **Answer:** **a dead player can talk** with the same buttons, on his side's dead zone (no-respawn games) or on his
  own channel (respawn games, §1.4). Owed for PROVEN: S8.2's "across a death".

### 1.9 VOICE_TALK_STANCE_READING -- NOT-A-GAP, STRONG
- **Answer:** there is no stance. `FUN_00236250` stores one byte (D:L84453). The "player state 5" is the command menu
  object's state (+0x750 of 0x413120; the menu's states are 0 slide-in, 1 open, 2/3 slide-out, 4 idle, 5 talking,
  6 offline hold).
  - Entering state 5 (D:L84278-84282) sets only that byte and the talk flag.
  - The draw for 5 (D:L82525-82528) keeps the panel's layout without sliding it in.
  - Leaving (D:L84429-84435, `FUN_00235300`) resets controller mode 0, which was never changed.

  The soldier moves, aims and is drawn as usual; others see nothing. Research 170's "talk stance" is a misreading of
  the menu state.
- **Implementation:** none. Remove `VOICE_TALK_STANCE_READING` from MATCH-05's acceptance.

### 1.10 Timers: VOICE_FLOOR_HOLD, VOICE_FLOOR_RETRY, VOICE_CUTOFF_LOCKOUT, and a new VOICE_TALK_LOCKOUT -- RESOLVED, STRONG
I re-read the voice tick `FUN_0030ec10` (D:L211001-211305) and the button routes.
- **Hold:** recording stops 10 000 ms after the grant. The operand is `FUN_00310080(voice, 10000)` (D:L158881); the
  check is D:L211217. The host frees an entry 15 000 ms after granting it (`+0x34 = +0x30 + 5000`, D:L211753), swept
  on the host clock (session +0x100). The client clock is session +0x104. Both are filled from the DME library each
  frame (`FUN_0030da00` D:L210274-210283) and are read as milliseconds (BELIEVED).
- **Retry:** the first request goes out on the first tick the talk flag is set, if the DME query `FUN_00623d00`
  answers non-zero (D:L211107-211126). After that the client re-asks every 1000 ms while it has no floor
  (D:L211181-211198). There is no queue and no refusal.
- **Cut-off (correction):** after the 10 s cap the client is in state 4 for 10 000 ms. State 4 is left **only on a
  tick with the talk flag set** (D:L211261-211263): releasing the button does not reset it (the not-talking branch
  D:L211039-211104 resets only states 2 and 3). A press at 5 s does nothing; a press at 11 s re-asks at once.
  - **A continuous hold that keeps the flag set resumes by itself at 20 s, if the floor is free.** This applies to:
    - the lobby's CIRCLE (`VCButton` has no cap);
    - the round's L2 route B, which at 10 s stops counting but does not clear the flag until release (D:L83904-83915).

    The talker then hears himself cut in a 10 s on / 10 s off cycle.
  - The round's CIRCLE route A clears the flag at 10 s (state 5's exit, D:L84420-84435), so it does not resume.
- **New -- the button lockout** (`FUN_00236a50`, D:L84677-84690, the TCM's +0xdb4 timer):
  - When a CIRCLE talk ends (release or 10 s), `FUN_00235300` sets 0.3 s (D:L83944-83946) and the caller adds 1.0 s
    (D:L84432): **for 1.3 s CIRCLE does neither talk nor open the command menu** (D:L84215, D:L84222).
  - When an L2 talk is released: 1.0 s (D:L83910).
  - CIRCLE released before 0.3 s of hold opens the command menu instead (D:L84284-84299).
  - While an L2 talk is on, route A is blocked (`DAT_004130a0`, D:L84279).
- **Implementation:** the room's floor (SVC-20a) keeps 10/15/1/10. The client:
  - **lobby:** talk on press; at 10 s the room cuts, and if still held the client re-asks at 20 s;
  - **round:** CIRCLE held 0.3 s talks and stops at 10 s, then a 1.3 s lockout; L2 with RUN AND TALK, then a 1.0 s
    lockout.

  Tests: one per edge.

### 1.11 VOICE_WHO_IS_TALKING_MARKER_PLACEHOLDER -- RESOLVED, STRONG
- **What I did:** read the marker's creation, its frame update and the HUD layer that draws it.
  - `WhoIsTalking` is made by `FUN_002a28f0`, a 0x2c-byte record in the HUD marker list 0x436390, with its type field
    set to `0x90 >> 4` = **9** (D:L152143-152145).
  - Each frame `FUN_00211510` (D:L68061-68080) does two things. It hides the marker unless another client owns the
    listener's channel (`FUN_0030e790`) and that client's actor is known (`FUN_002bd420`). It copies the actor's
    position (+0x1c..+0x24) into the marker.
  - The marker layer's texture loader `FUN_002126f0` stores type 9's texture at +8+9x4 = +0x2c, and that texture is
    **`hud_talk.tif`** (0x2127f8-0x212804).
  - Online, types 1-8, 12 and 13 are always shown. Types 0, 9, 10 and 11 are hidden when the distance to the camera
    is over **900.0** (`DAT_003dc518`, D:L68138-68156).
  - Types 1-13 take their per-frame value from `DAT_0040c070`, which pulses between 64 and 128 at 250 a second
    (D:L68037-68051, D:L68125-68130). This is read as the marker's alpha (BELIEVED).
- **Answer:** a pulsing `hud_talk.tif` screen marker over the speaking teammate's position, within 900 units.
  [Corrected 2026-10-08, MATCH-05's review: the list 0x436390 is the compass's marks; type 9 (D:L152145) is drawn
  about the compass's centre (565, 90) by the marks' rule (D:L68207-68243), not projected over the speaker -- research
  227 §2.3.]
- **Implementation:** MATCH-05: a projected `hud_talk.tif` sprite at the channel owner's body, hidden over 900 units.
  [Corrected 2026-10-08: built as the compass mark, `packages/viewer/src/hudVoice.ts` `talkMark`.]
  Test: none shown when the listener is the owner.

### 1.12 VOICE_ROW_MARK_READING -- RESOLVED, STRONG
- **Answer:** none. The game lobby's three lists (SEALs, Terrorists, spectators) are built by `FUN_002c4b50` from each
  slot record's +0xe with the format 0x3f2a68 = `"%s"` (D:L165914, D:L165946, D:L165972). +0xe is `PLAYERNAMEVAR`,
  written at D:L166266-166279. No glyph is prefixed.
- **Implementation:** the rows carry no talk mark; the bar is the only lobby indicator.

### 1.13 VOICE_TALK_SOUND_READING -- RESOLVED, STRONG
- **Answer:** no sound.
  - The lobby's voice animations (`do_team_button_down/_up`, `do_circle_button_down`, `do_square_button_down`,
    `ChatIconAction/Reset`) hold no SOUND op (`lobby_voice_ops.out`).
  - Route A, route B and state 5 call no sound function (D:L83895-83921, D:L84278-84282, D:L84419-84435).
  - The voice tick's paths play nothing (research 170 §5.4, re-read).

### 1.14 VOICE_MODULATION_PLACEHOLDER -- PARTIAL, STRONG (and VOICE_MOD_LOBBY_OFF, new)
- **What I did:** traced `FUN_0030e5a0` (D:L210728-210764), the option and the data behind it.
  - **Mask on** (argument 0): `FUN_00310630` sets three encoder parameters from voice +0x1084..+0x108c through the
    SASE `sase_enc_set_*` shims (desktop research 56 §2.2). It also sets whisper (+0x1098) unless +0x4f, and robot
    (+0x1090/+0x1094) unless +0x50.
  - **Mask off** (argument 1): the three "off" shims.
  - The parameters come from `ChangeCharacterType` (`FUN_002795e0`, D:L123889-123930; named through the UI command
    table, `uicmd_name.py`). It takes the selected character's record +0x388..+0x39c, which `FUN_0053ce00` reads from
    a **`VoiceFont`** block (D:L406407-406414): `SetPitchOffset` +0x388, `SetSpectralFactor` +0x38c,
    `SetSpectralLedge` +0x390, `SetRoboOffset` +0x394, `SetRoboSquash` +0x398, `SetWhisperFactor` +0x39c. Negative
    robot or whisper values switch those effects off (D:L123921-123928).
  - The defaults are 0, 0, 0, -1.0, -1.0, -1.0 (0x53d910-0x53d934).
  - On the disc (`voicefont.ts`): 176 `character.rdr` records carry VoiceFont, each with only the first three keys.
    There are 8 distinct blocks, for example (-25, 80, 0), (-50, 120, 0), (-20, 60, 0), (-12, 100, 0) and
    (-70, 100, 0). **Robot and whisper are never used.**
- **Answer:**
  - VOICE MODULATION (the START menu, `DAT_003df1a8`, **default ON**, .data = 1, D:L61722-61746) applies the
    talker's character pitch offset and spectral factor to **his own encoder**. A listener hears whatever the
    talker's console encoded.
  - **The game lobby is never modulated**: `SetMenuState` calls `FUN_0030e5a0(voice, 1)` (D:L125570).
  - The round start applies the option for non-spectators (D:L55851-55854).
  - What -25 and 80 do acoustically is inside SASE's `EncSC.c` setters and was not read.
- **Implementation:** SVC-22. Keep the toggle with default ON, lobby unmodulated, round modulated. The effect (a
  pitch shift of the talker's own stream by a per-character offset) is the owner's call to approximate in the browser
  (an AudioWorklet pitch shift, labelled). Store the 8 VoiceFont triples by character.
- **Owed:** the SASE setters' units (`EncSC.c` 0x249608-0x249968, desktop research 56 §1), or a recorded sample.

### 1.15 VOICE_INDICATOR_LOOK_PLACEHOLDER -- PARTIAL, STRONG
- **Answer (logic):**
  - While CIRCLE is held, the lobby's talk icon shows only while recording (`can_talk` = voice state 3,
    `FUN_0030e710` D:L210800-210822).
  - Waiting for a busy floor shows the no-talk icon.
  - Release resets it (`lobby_voice_ops.out`).
  - The round HUD's elements are research 170 §5.2's; the marker is §1.11.
- **Owed:** the look on screen (S8.5).

### 1.16 VOICE_CHANNEL_COUNT_READING -- PARTIAL, BELIEVED
- **What I did:** read the library side of the HUD number.
  - The HUD number voice+0x5c is filled by `FUN_00623ae8` -> `FUN_006432c8` (D:L556960-556990).
  - That function runs a worker, `FUN_00644c90` (D:L558059-558095), over a DME list. The worker matches an item's
    first u16 against the channel's stored id and copies the item's second u16.
  - What that u16 counts is the library's own data and is not readable without the DME source. Horizon's Server.Dme
    has no channel model.
- **Owed:** S8.3, two players on one channel.

### 1.17 Rows that stay owner's calls or transport (NOT-A-GAP)
- `VOICE_WIRE_FRAMING_PLACEHOLDER` is transport and not player-visible under OT.R27; the room's own framing stands.
- `VOICE_RECORD_GAIN_STEER_READING` lives in the codec's level unit; the codec is replaced (OT.R24), so the browser's
  AGC is the labelled adaptation.
- `VOICE_TALK_KEY_PLACEHOLDER`, `VOICE_CODEC_PLACEHOLDER` and `VOICE_MIC_NOTICE_PLACEHOLDER` are the owner's calls
  (H87, OT.R24).

**S8 rows still owed after this pass:**
- S8.1 holds a talk past 10 s and confirms the 20 s auto-resume;
- S8.2 covers a death in a respawn game and one in a no-respawn game;
- S8.3 counts the channel;
- S8.5 captures the looks.

The rest of S8 is answered statically above.

---

## 2. Audio

### 2.1 BED_FADE_SECONDS_PLACEHOLDER (`$PORT/packages/viewer/src/audio.ts:58`) -- RESOLVED, PROVEN
- **Prior search:** C7 §3.2. The mechanism was STRONG; the slot record's initial +4 was BELIEVED to be 0.
- **What I did:** the slot record is created by `FUN_0026e7c0` (D:L117649-117697). After zeroing it, it writes
  **0xbdcccccd = -0.1** at +4 (0x26e86c-0x26e878). The instance copy (D:L117231-117242) keeps it. A play command
  writes +4 only for a positive fade offset, and every bed's offset is 0 (`scratch/C7/beds.out`).
  `FUN_0026fd20`'s test is "+4 > 0", so the StopSound branch runs.
- **Answer:** no fade. Stopping a bed keys it off, and the tail is the tone's ADSR release.
- **Implementation:** delete `BED_FADE_SECONDS_PLACEHOLDER`. A bed stop calls the rendered loop's release envelope.
  Test: the stop's level follows the tone's release rate.

### 2.2 `landingHurts` (`$PORT/packages/sound/src/rules.ts:156`) -- RESOLVED, STRONG
- **What I did:** the landing damage calls `FUN_005a54d0(actor, 3, 7)` (D:L464954).
  - When the actor survives, `FUN_005477a0` (D:L412828-412838) stores the new overall health +0x1044 and calls
    controller vtable +0x54 (`FUN_00597b00` in both SEAL controller vtables). That function plays character sound id
    **0x3b** at 1.0 (D:L454508).
  - The id table `FUN_0053c3a0` (`chrsnd_ids.py`; its switch takes id+1) names 0x3b **CHRSND_DAMAGE**, 0x3c
    CHRSND_DEATH and 0x3d CHRSND_DEATH_QUIET.
  - A lethal landing goes through the death path with cause 7. `FUN_005979a0` plays 0x3c for any cause other than
    1-3 or 6 (D:L454473-454480).
- **Answer:**
  - The hurt voice plays **only when the landing lowers the overall health and the player survives**.
  - A lethal fall plays CHRSND_DEATH instead.
  - Death causes 1-3 play DEATH_QUIET, and cause 6 plays nothing.
- **Implementation:** `landingHurts(cls)` becomes `cls >= 1 && healthAfter > 0`, and a lethal landing plays the
  character's `CHRSND_DEATH`. Test both.

### 2.3 The emitter clamp at 127 (`audio.ts:832`) -- RESOLVED, STRONG
- **Answer:** the reading holds.
  - The EE's positional volume is `int(command volume x linear RANGE gain x 1024)` (`FUN_00342670`
    D:L241931-241944), sent each frame by `FUN_00340110` (D:L244369).
  - The IRX's SetVolPan `FUN_00016898` stores `FixVol` = `FUN_0001661c`: v*0x7f>>10, **capped at 0x7f**
    (989SND.IRX.decomp L13424-13436).
  - The cap is therefore on the whole product, before the register's square law. A 3.0 fire is flat at 127 until its
    linear gain falls under 1/3.
- **Implementation:** `vol7 = min(127, floor(cmd * gain * 127))` before squaring. Test: a 3.0 emitter at gain 0.5
  equals one at gain 1/3.
- **Lead, not settled:** the positional play's start (`FUN_003428a0` D:L242072, D:L242135) multiplies by the entry's
  `+4` twice, while the per-frame update multiplies once. Worth a check by whoever ports the emitter start.

### 2.4 The HQ duck: which lines carry HQ, and what releases it (C7 §5) -- RESOLVED, STRONG
- **What I did:** read the stream-key parser and the duck's release path, and listed the disc's HQ entries.
  - `HQ` is parsed into stream entry +0x1c bit 4 (`FUN_003435c0` D:L242472-242474; key 0x3f77c8).
  - `hq_entries.ts` lists the disc's `sounds.rdr`: **24 HQ entries, all campaign**. M51_SVO has 14 (M51_070-080,
    134, 144, 145) and M72_SVO has 10 (M72_083-091, 114). None is in a multiplayer block.
  - The disc also has no `PRIORITY` or `PD` stream entries at all.
  - **Release:** when a stream instance is freed (`FUN_00347810` D:L244622-244627), if no other playing instance
    carries HQ (`FUN_00346270`), `FUN_00341010` clears the flag. It sets the duck's 1e9 hold to 0.01 s
    (D:L241115-241117). The sound tick then ramps the masters back linearly over **5 s** (`FUN_003410d0`,
    `+dt/5`, D:L241145).
- **Answer:** the duck (groups 0-5 to 0.6) starts on the first HQ stream, holds while any HQ stream plays, and
  returns over 5 s from 0.01 s after the last one ends.
- **Implementation:** not needed for multiplayer (no HQ line in any MP block). For the campaign: duck on an HQ play,
  release 5 s after the last HQ stream ends.

### 2.5 PLAYER_INDOORS' writer (research 81 §12) -- RESOLVED, STRONG
- **What I did:** read the bed script's test and the writer of the bit it tests.
  - The test (`PLAYER_INDOORS`, registered by `FUN_002b3930`; test at 0x2b3880) reads `DAT_00440c38` (the local
    player) +0x1060 bit 2.
  - Its only writer is the body's ground follow `FUN_0059b440` (D:L456534-456538; `bit_writers` hunt, store at
    0x59b838). On a valid ground hit it copies bit 7 of the hit object's +0xa into bit 2, when that object's +0xb bit 2
    is set.
  - `CAMERA_INDOORS` (0x2936b0) instead reads camera +0x128 -> +0x2b8.
- **Answer:** the outdoor/indoor bed follows **the SEAL's own floor surface's indoor flag**; the wind follows the
  camera's. The port drives both from the camera.
- **Implementation:** `setEnvironment` takes the player's floor polygon's indoor flag for the beds. Find the indoor
  flag's place in the port's collision data first, so that the flag behind +0xa bit 7 is named. This bit also answers
  H1 U6's "+0x1060 bit 2" name hunt: it is PLAYER_INDOORS.

### 2.6 FALLSOUND (research 81 §12) -- RESOLVED (mechanism), STRONG
- **Answer:** `FALLSOUND` is a **SOILS** key, soil record +0x18 (`FUN_002dde40` D:L181378-181381; it sits beside
  STEPSOUND, STEALTH_STEPSOUND, CRAWLSOUND and LANDSOUND).
  - It is played by the zAnim callback **`BODY_FALL_ON_MATERIAL_SOUND`** (`FUN_0059a8e0`, D:L456100-456145; the name
    is registered at 0x59ac90). The sound is the soil of the body's floor (+0x20c), defaulting to `.FALL_GROUND`, at
    volume 1.0 at the body's position, and unplaced for the local player.
  - So a body that falls in a motion (the death falls) sounds its floor.
- **Owed:** which motion clips call it; that needs a sweep of the motion archives' zAnim callback commands.

### 2.7 KEYBOARD_SOUND_TRIGGERS_READING -- RESOLVED, STRONG
The six slots of `FUN_00395de0` by caller:

| event | slot | source |
|---|---|---|
| keyboard open | 0 ScaleUp | `oskOpen` `FUN_0038d770` |
| close | 1 ScaleDown | `FUN_0038b390` D:L282652 |
| cursor move | 2 Navigation | `FUN_0038c130` |
| a character | 3 KeyPress, or 5 Negative at the length limit | Harry62's `textlimit`, `FUN_00399ec0` |

Special keys, by case of `FUN_0038d200` (D:L283779-283799; names after the port's `SKB_FN`):
- 0 caps: KeyPress;
- 2 BackSpace: KeyPress (`FUN_00399c20`);
- 3 Clear: KeyPress (`FUN_00399b30`);
- 4 Enter: KeyPressEnter after the close's ScaleDown (D:L283140-283142), but on an empty or unchanged text the cancel
  path `FUN_0038c000`, ScaleDown then KeyPress;
- 5 Exit: ScaleDown then KeyPress.

Implementation: check `softKeyboard.ts`'s sounds against this table (Enter on unchanged text plays ScaleDown and
KeyPress, not KeyPressEnter).

### 2.8 EXIT_STATE_GROUPS_READING -- PARTIAL, STRONG
- **Answer:** `FUN_00344910` (D:L242941-243020, called at map load, D:L152106) registers **SP_COMMON** for every map
  whose stem's second letter is not 'p', plus the mission's nationality groups. An MP map registers **MP_COMMON and
  HOSTAGE** (D:L242950-242956). So at `dlgExitState` the grade groups are loaded if the mission's sound table is
  still in place.
- **Owed:** the table's clear relative to the exit screen. This is a single-player item.

### 2.9 BOOT_POPUP_METAL_READING -- PARTIAL, BELIEVED (with a correction)
- **What I did:** decoded `dlgIntroScreen`'s `do_onstart` and the card check it calls.
  - `do_onstart` (`intro_ops.out`) has two POPUPDIALOGs, but the first runs only when **no controller** is connected
    and the second only when **HDD_ENABLE == 1**. Neither runs on a normal boot, so research 122's candidates are not
    the boot's two `.METAL`.
  - The boot's popups come from `intro_onstart` (UIanim.rdr, `intro_onstart.out`), the card check:
    - an unformatted card -> AskToFormat ... #824 "Formatting..." then #825 "Copying system files...": two
      POPUPDIALOGs;
    - no space -> #823.
- **Owed:** the archived boots' card state, which decides which pair played.

### 2.10 .GUN_EMPTY -- PARTIAL, BELIEVED
- **Answer:** the kit binds `.GUN_EMPTY` to +0x88c at set-up (`FUN_005c7e00` D:L480569-480570). The fire path
  `FUN_005c0fd0` plays it unplaced when the trigger is pulled with no round, **only while the dry count +0x818 is under
  2** (D:L476616-476620); it may then start the reload.
- **Owed:** the exact trigger condition's variables (iVar8), which were not followed.

### 2.11 LFO grain; Gaussian interpolation; activation-1 scripts
- **LFO grain (PARTIAL, BELIEVED):** Ziemas `iop/LFO.c` (255 lines, no `UNIMPLEMENTED`) and `lfo_sine.inc` are a full
  transcription (`snd_DoOneLFO`, `snd_HandleLFOs`, `snd_CalcLFODepth`). It was not cross-checked against the disc's
  989SND.IRX here.
- **Gaussian interpolation (UNRESOLVED):** this is SPU2 hardware; its table is outside the corpus.
- **Activation-1 scripts (UNRESOLVED):** not attempted.

---

## 3. Movies

### 3.1 MOVIE_SKIP_CARRY_READING (`$PORT/packages/fmv/src/player.ts:100`) -- PARTIAL, STRONG
- **Prior search:** research 121 §6. The binding's edge byte (+0x704) for the bindings leading to the extras' movies
  was not read.
- **What I did:**
  - `dump-dialogs --tree` of `dlgNetUnlockableExtras` (`tree_extras.out`): every route to a movie dialog is a
    control binding `BUTTON CROSS` with **no STATE**. These are `ArtGallery2` -> `dlgArtGal2`, `TrainMovieList` ->
    `dlgPlayTutMovies`, `MovieList` -> `dlgMakeMusicMovie` and `Credits` -> `dlgCredits`. A binding without STATE
    takes the default 1 (pressed this frame; the slot default D:L278439-278463, the port's `BINDING_DEFAULT`).
  - The movie state's code (0x1ecf60-0x1ed2b8) reads the pad (`FUN_002d9e40`) and calls no flush (`FUN_002d9e00` /
    `FUN_002dba60`).
- **Answer:** the dialog switches on the press.
  - If CROSS is still down at the last pad read before the movie state starts, the movie's first read sees a release
    (state 3) and starts its 1.1 s skip fade.
  - If the button came up during the menu frames before the push, the release is consumed there and the movie plays.
  - Which happens depends on how many menu frames the switch takes against a tap's length. A blocking settle loop
    (`FUN_001ed560`, at least 0.5 s) precedes the first movie tick.
- **Implementation:** keep `'pressed-in-state'` as a labelled reading; record the press edge as PROVEN in its comment.
- **Owed:** a capture of a tap on `TrainMovieList`'s CROSS (does the tutorial play?).

---

## 4. Card and services

### 4.1 MC_DAMAGED_RESULT_PLACEHOLDER, MC_DAMAGED_GETINFO_PLACEHOLDER (`$PORT/packages/card/src/libmc.ts:67-70`) -- RESOLVED, STRONG
- **Prior search:** C8 §3-4. The type-2-with--5 case was not traced, nor was the card script's branch on
  `memcard_error_code == 6`.
- **What I did:**
  - Read MCMAN export #21 (0x9b4-0xbe4) in C8's disassembly. A slot whose cached type is 0 or 2 runs the PS2 probe
    0x3608. That probe answers 0 (same card), -1 (new card), -2 (unformatted; from 0x40ac), or under -9 (no card or I/O
    failure); **never -5**.
  - **-5 is produced only at 0xad0**, on the cached-PS1-card path (type byte 1) with PS1 access off.
  - `valve_tests.ts memcard_error_code` over all three UI archives: scripts test only `== 1` and `== 2`
    (dlgDebriefing, dlgDownloadPatch, dlgMenu, UIMemCardAnim). **No script branches on 6.**
- **Answer:** `memcard_error_code` 6 (type 2 with -5) is not a state a real PS2 card produces. If the port returns it,
  every script takes its "OK" branch and the later write fails. The console's own corrupt-card answer is -2 NoFormat
  with format 0 (C8).
- **Implementation:** the decision stays the controller's (C8's R7 reason for never reaching the format offer). With
  this read, `MC_DAMAGED_RESULT = NoFormat` (-2) and `GETINFO {type 2, format 0}` mirror the console. Keeping -5 leads
  the scripts into a silent OK path. Test whichever is chosen against `MainMenuOnLoad`.

### 4.2 GetDir's two dates (C8 U11) -- RESOLVED, PROVEN
- **Answer:** export #12 (0x14f8) -> 0x8020 fills each 0x40-byte table entry (0x8434-0x84a4) as follows:

| entry offset | from the dirent | content |
|---|---|---|
| +0 | +8..+0xf | _Create |
| +8 | +0x18..+0x1f | _Modify |
| +0x10 | +4 | file size (skipped for a directory, mode bit 0x20) |
| +0x14 / +0x16 | +0 / +2 | attributes |
| +0x18 | +0x20 | |
| +0x20 | | the name |

- **Implementation:** the simulated card keeps created and modified separately. Test: a rewritten file keeps its
  _Create.

### 4.3 FILTER_ID_READING (`$PORT/packages/central/src/lobby.ts:132`) and C8 §32 -- RESOLVED, STRONG
- **What I did:** `GetRandomGame` (`FUN_002f83b0` D:L197146-197155, entered with "RANDOM") does three things in order:
  1. **clears FilterID 10** (`FUN_00649a00`, MediusClearGameListFilter, the id at +0x28 = 10);
  2. sets the PlayerCount filter (`FUN_002f8e50` D:L197544-197550: field 1, op 3, baseline 1) and asks for the game
     list (page 1, 999; D:L197579-197582);
  3. **clears FilterID 1** (D:L197615-197618).
- **Answer:** the client treats filter ids as the field numbers and clears the room filter (10) itself before
  AUTOPLAY. Whether a room was entered first no longer matters.
- **Implementation:** keep `FILTER_ID_READING = 'field'`; retire the `_READING` once the server answers a clear of a
  never-set id with success. Test: clear 10, set field 1 -> id 1, clear 1.

---

## 5. World and render

### 5.1 REMOTE_STEP_STICK_READING (`$PORT/packages/viewer/src/remotePlayers.ts:190`) -- PARTIAL, STRONG
- **What I did:**
  - Both SEAL controller vtables (0x6694b0 local; 0x4062d0, built by the factory `FUN_002b3a00` for type 4) have
    +0x20 = SetThrottle: `ctrl[axis*4+8] = value` (0x2a26e0 / 0x567340; reCOM `SetThrottle(f32, s32)`).
  - The only callers are in the shared player tick `FUN_00594cf0` (vtable +0xc in both):
    - `FUN_005966a0` writes +8/+0xc/+0x10 from the pad's sticks, after a dead zone and scale (D:L453852-453864);
    - the off-control paths zero them (D:L453126-453128, 453729-453731, 453870-453872).
  - The 0x4062d0 class answers vtable +0x2c "local" = 0 (0x2b3bd0) where the other answers 1 (0x5431f0).
  - The pad given to the tick is `DAT_0044f108` unless ctrl+0x114 is set (D:L451666-451669, D:L453094-453097).
  - `FUN_005a3570`'s gate (+0xe0 bit 2, D:L460295) sits where reCOM's bitfield has `m_animate_footsteps`. That is
    BELIEVED: reCOM's `m_isAlive` sits one bit off from SOCOM II's, so the order is not exact.
- **Answer:** a remote body's throttle is whatever its controller's pad sticks produce through the same tick. What
  pad a network-class controller has was not read, and neither are the replicated pad bytes.
- **Owed:** an RDRAM pair from an online round (a remote actor's `*(actor+0xc0)+8..+0x10` walking and standing),
  or the network class's ctrl+0x114 writer (candidates from `store_off.py 114`: 0x2b3200 in `FUN_002b2e50`).

### 5.2 The texture scroll's dT and band flags (C9 U7; `$PORT/packages/viewer/src/world.ts:233`) -- RESOLVED, STRONG
- **Answer:** dT is the state tick's `param_1`, the value it also hands the pad reader `FUN_002d9e40`
  (D:L50795-50801). The pad reader's flush passes 1/30 for one frame, so **dT is in seconds**. `SCROLL_TICKS_PER_SECOND = 1`
  is correct, and the comment "still an assumption" can go.
- **The band flags** (`FUN_003c0340` / `FUN_003c0460`, D:L313896-313972):
  - +0x16 = 1: an automatic band, scrolled each frame;
  - +0x16 = 2: a manual band, moved only by `FUN_003c0280` by its id +0x18;
  - +0x19 bit 0: set when |du| and |dv| are under 1e-5, and such bands are skipped;
  - +0x19 bits 1 and 2: passed to `FUN_003bfee0` (not read).
- **Implementation:** scroll only automatic bands with non-zero speed; leave manual bands static unless a script
  steps them.

### 5.3 SKIN_TOP4_INFLUENCES (C9 U14; `$PORT/packages/mesh/src/skin.ts:421`) -- RESOLVED, PROVEN (measured)
- **What I did:** `skin_dropped.ts` ran the port's own `topInfluences(sub, 4)` over every `CLIB_MDL.ZED` of all 34
  maps on the disc. 560 models decoded, 0 failures, 947,557 vertices.
- **Answer:**
  - **droppedMax = 0.1513** (seal_B_woodland, MP51-53, M51), with rus_specialist and seal_E_arctic close behind at
    0.1479.
  - 105 models lose weight, and there are 1,029 non-zero dropped weights, mean 0.120.
  - Influence counts per vertex: 1: 479,587; 2: 319,308; 3: 119,769; 4: 26,971; 5: 1,873; 6: 49.
- **Implementation:** a six-influence skinning node, or a second skin-index/weight pair, for the 105 models.
  Otherwise up to 15 % of a joint's pull is lost on a few hundred vertices. Test: a pinned vertex of seal_B_woodland
  matches the six-weight sum.

---

## 6. Sourced but not implemented (multiplayer-relevant)

- **Respawn games keep the dead on their living voice channel** (§1.4); no-respawn games and ghosts go to the dead
  zone.
- **The talk lockouts and the auto-resume** (§1.10): 1.3 s after a CIRCLE talk, 1.0 s after an L2 talk, 0.3 s
  tap-vs-talk, and the 10 s on / 10 s off cycle of a held lobby talk.
- **Side-relative voice channels** (Terrorists 4-7) that follow the side swap (§1.2); OFFENSE 2 / DEFENSE 1 (§1.1).
- **Controller presets for talk** (§1.7): Goldeneye talks on SQUARE and has no RUN AND TALK.
- **Late joiner = the `late_joiner` valve** (§1.5): no lobby talk, dead zone first round.
- **The `WhoIsTalking` marker** (`hud_talk.tif`, 900-unit range, pulsing) (§1.11).
- **VOICE MODULATION:** default ON, per-character pitch/spectral VoiceFont, never in the game lobby (§1.14).
- **Landing voice:** DAMAGE only when surviving; DEATH on a lethal fall (§2.2). **Death voice by cause:** 1-3 quiet,
  6 none (D:L454473-454480).
- **PLAYER_INDOORS from the SEAL's floor** (§2.5); FALLSOUND by soil (§2.6).
- **MP maps load the HOSTAGE sound group** with MP_COMMON (§2.8). This is relevant to the hostage workstream: the
  hostage cues are always loaded online.

## 7. Leads for other workstreams

- **H1 U6:** body +0x1060 bit 2 is **PLAYER_INDOORS**, written from the floor object's +0xa bit 7 (`FUN_0059b440`
  D:L456534-456538).
- **M2 / C1 ([179](179-c1-match-server.md)):** game +0xcc is the `late_joiner` valve (§1.5), not "staging lobby". Game +0xdc (respawn) also decides
  the death's voice channel and the body fade.
- **V2 owed #2 (are RESTRAINED/PANIC/HELPME audible):** `chrsnd_ids.out` is the id -> name table for any
  `vtable+0x24(vol, ctrl, id, -1)` play.
- **C9 L5 / M2 §6:** the SEAL controller class map (§5.1). The network class is factory type 4, vtable 0x4062d0, and
  its +0x2c answers "not local".
- **ONL-16b / MATCH-05 (the voice UI tasks):** research 170 §5's "talk stance" can be dropped (§1.9).
- **SVC-20a/20c:** the room's rules need: respawn exception, side by role, spectator 10, auto-resume on held talk.
- **The emitter start's double `+4`** (§2.3 lead) for whoever ports positional sound starts.
- **R2-UI / C5b ([184](184-c5b-frontend-dialogs-input-boot.md)):** the soft keyboard's Enter-on-unchanged-text plays ScaleDown + KeyPress (§2.7).

## 8. Verification (V7, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V7-verify-round2-remaining.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V7/`). V7 verified ten round-2 claims nobody had checked, in R2-C3 ([202](202-r2-c3-combat.md)), R2-UI, R2-AV and R2-MN ([203](203-r2-mn-match-modes-net.md)). What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V7, 2026-10-04. Read-only. Every script is under `scratch/V7/`, and its `README.md` says what each one prints.
`D:L<n>` is a line of `socom2_game.elf.decomp.c` (r0001). `$PORT` is the `agent/online` snapshot.

**Method.** Each claim is re-derived by a route the author did not use, where one existed:
- V7's own ELF reader (`elf.py`, pyelftools) and disassembler, instead of the authors' `elfutil.py`;
- the console's own state in the PCSX2 RDRAM dumps, read directly. No replay or simulation stands in for it;
- V7's own Python `.rdr` reader;
- the raw zAnim bytes, decoded by hand against the handler's field reads.

Where the only route was the author's own (a decomp read), V7 re-read the code and says so.

### 8.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| 8 | Voice: OFFENSE 2 / DEFENSE 1; SEALs 0-3, Terrorists 4-7 (follows swap), spectators 10; respawn death keeps channel; no alive check; 1.3 s / 1.0 s, 0.3 s tap, 10 s cut / 20 s resume; Goldeneye SQUARE and no RUN AND TALK; `hud_talk.tif` hidden past 900 u; modulation on by default, off in the lobby | **CONFIRMED** | Every sub-claim re-read, with constants from the ELF (`voice_consts.out`). The presets were read **live from RDRAM**, and the marker's jump table was decoded. One detail added: the "respawn" byte game+0xdc is `AllowRespawn && game mode == 5` (mirrored into the `Respawn` valve). Harry62's label for it, "BOOL_ForceGame", is wrong. |
| 9 | game +0xcc = `late_joiner`; PLAYER_INDOORS from the SEAL's own floor; HQ duck lines campaign-only | **CONFIRMED** | The +0x2c valve is named `late_joiner` (0x3f10f8), with +0xcc cleared beside it. The only data writer of body+0x1060 bit 2 is the ground follow; every other store is the constructor's. V7's own `.rdr` reader reproduces 24 HQ entries, all in M51_SVO / M72_SVO. |

Tally: 10 claims. CONFIRMED 6, CONFIRMED-WITH-CORRECTION 4, WRONG 0, UNVERIFIABLE 0.

### 8.2 Claim 8: Voice (R2-AV §1)

Every sub-claim was re-read in the decomp or the disassembly. Constants come from V7's ELF read (`voice_consts.out`).

| sub-claim | V7's evidence | result |
|---|---|---|
| OFFENSE 2 / DEFENSE 1 | disassembly 0x234c10..: row 0x3e61e0 "OFFENSE" `addiu a3,zero,2` (0x234cb8); 0x3e6210 "DEFENSE" `addiu a3,zero,1` (0x234ce0); TEAM `move a3,zero` (0x234c90) | confirmed |
| Terrorists +4, follows swap | `FUN_002c2c20` D:L164447-164456: +4 when the slot's team word == (swap ? 0x40000001 : 0x80000100) and voice+0x4d == 0, never on channel 9. `FUN_002c3330` D:L164835-164871 maps that same word to player_team 8 and the other to 0, with the same swap byte | confirmed |
| spectators 10 | channel forced to 10 (D:L164437-164439); team word 0x10000 never equals a side word | confirmed |
| respawn death keeps channel | OnDeath D:L454484-454492: event 0x22 (channel 3, -> 7 for Terrorists) only if game+0xdc == 0 or ghost +0xd2; else only the fade. 0x23 restores +0xc4 (D:L497732-497737). **+0xdc** is written only by `FUN_002a7560` (D:L149407-149433) = AllowRespawn valve (+0x64) != 0 && mode byte +0x111 == 5, mirrored into the valve named `Respawn` (0x3f1038). Harry62's `+0xdc BOOL_ForceGame` is a misnomer | confirmed (detail added) |
| no alive check on talk | route B D:L83895-83920 (online, RUN AND TALK, menu state 4) and state-5 entry D:L84278-84281 test no alive bit; the +0xe1 bit-4 tests at D:L84229/84290 are under `DAT_0045a0c1 == 0` (offline) | confirmed |
| 1.3 s / 1.0 s / 0.3 s | state-5 exit (D:L84419-84435): `FUN_00235300` sets 0.3 (0x3e99999a), then `FUN_00236a50(1.0)` adds, giving 1.3; route B release adds `DAT_003dcb08` = 1.0; state 5 needs hold > `DAT_003dcaf8` = 0.3, and an earlier release opens the command menu | confirmed |
| 10 s cut / 20 s resume | route B cap `DAT_003dcb00` = 10.0; the voice tick's cut path sets state 4 until now + +0x30; state 4 -> 1 only in the talk-flag-set branch (the not-talking branch resets only 2 and 3), so a held flag re-asks at 20 s | confirmed |
| Goldeneye SQUARE, no RUN AND TALK | **read live** from the parsed presets (vector 0x4415c8; slot = rec+0x12+action) in spawn/menu/title (`presets_rdram.out`): presets 1, 2 and 4 have TeamCommand = Circle and SwapWeapon2 = L2; preset 3 has TeamCommand = **Square** and SwapWeapon2 **unbound**. File order is Default, Reverse, Goldeneye, Config4 (`controller_raw.out`) | confirmed |
| `hud_talk.tif` hidden past 900 u | 0x3e4598 = "hud_talk.tif", stored at +0x2c (type 9). Online jump table 0x3e44b0 (`marker_jt.out`): types 1-8, 12, 13 go to 0x211ac0 (always shown); 0, 9, 10, 11 go to the test `DAT_003dc518 < d`, with 0x3dc518 = 900.0 | confirmed |
| modulation on by default, off in lobby | `DAT_003df1a8` = 1 in .data; the lobby (D:L125567-125570) sets channel 9 and `FUN_0030e5a0(voice, 1)` (off); the round start (D:L55852-55854) applies `DAT_003df1a8 == 0` for non-spectators | confirmed |

**Port.** No voice implementation exists in `$PORT/packages`; only research 170 describes it. There is no port
behaviour to check here.

### 8.3 Claim 9: late_joiner, PLAYER_INDOORS, HQ duck (R2-AV §1.5, §2.4, §2.5)

**late_joiner.** In the game object set-up (D:L149563-149573), `param_1[0xb]` (+0x2c) = valve 0x3f10f8
"`late_joiner`", and `param_1 + 0x33` (+0xcc) is cleared beside it. Harry62's GameObject names +0x2c `LateJoiner`.
CONFIRMED.

**PLAYER_INDOORS.**
- The test at 0x2b3880 reads `*(0x440c38)` +0x1060 bit 2 (the shifts `dsll32 0x1d` / `dsrl32 0x1f`).
- V7 scanned every store to +0x1060 and classified its mask (`scan_1060_bits.out`):
  - bit 2 is written from data only at 0x59b838 in `FUN_0059b440`, from the ground hit object's +0xa bit 7 when its
    +0xb bit 2 is set (D:L456534-456538);
  - the other bit-2 stores are in `FUN_00553ea0`, a constructor (it calls the base constructor `FUN_0029ee10` and
    returns `this`).
- CONFIRMED.

**HQ campaign-only.**
- The parser `FUN_003435c0` looks HQ up on the `ST` node (key "ST" at 0x3f7780, then "HQ" at 0x3f77c8 on that node),
  setting entry +0x1c bit 4.
- V7 wrote its own `.rdr` reader (`hq_rdr.py`) and walked RUN/SOUNDRDR.ZAR `sounds.rdr`. It finds 10,963 ST entries,
  with HS 4170, VQ 5470 and **HQ 24**: M51_SVO 070-080, 134, 144, 145 and M72_SVO 083-091, 114. PRIORITY: 0.
- No `GROUPS` entry lists M51_SVO or M72_SVO; the only MP group is MP_COMMON.
- This reproduces R2-AV's count with an independent reader. CONFIRMED.

### 8.4 For SPRINT-OPTIONS / the README (item 5 of the verifier's list)

- **Harry62.** game+0xdc is "respawn active" (AllowRespawn && mode 5), not "ForceGame". Worth a line in research 84's
  disagreements.
