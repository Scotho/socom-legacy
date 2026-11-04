# 186 -- C7 -- audio and movie (research wave 2026-10-04)

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/C7-audio-movie.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V4 (`research-wave-2026-10-04/V4-verify-ui-audio-card.md`) has landed and is folded in as §7.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

**Overridden in part (research 206 §1):** two boot `.METAL` popups (with research 122) -- they never fire on a normal boot; the boot popups come from the card check (R2-AV, research 205 §2.9).

Agent C7-audio-movie. Read-only. Scripts and dumps are in `scratch/C7/` (its `README` says what each one prints). The
online lane's peer questions were answered first because another session was waiting on them. They were sent here
labelled "Extra scope for C8"; they are answered below and the coordinator may want to move them to C8's report. The
C7 ledger follows in section 2.

## 1. Peer questions (online lane, ruling OT.R27: player-visible behaviour only)

Evidence used: the r0001 decompilation (`D:L`), ELF reads (`scratch/C7/elf.py`, `find_word.py`, `fn_of.py`), the
disc's `UIMnLOC.rdr` read with the port's own `parseLocTable` (`scratch/C7/peer/loc.ts` -> `peer/loc.out`), the
dialogs dumped with the port's `tools/dump-dialogs.ts` (`--msg-users`, `--dialog`; outputs `peer/msg_users_*.txt`,
`peer/dialog_*.txt`), the UI programs decoded with the port's `decodeUiProgram` (`peer/uiprog.ts` ->
`peer/uiprog_*.out`), and horizon-server's `RT.Common/Types.cs` for Medius status codes. Every text below was read off
the disc. The "¦ CONTINUE." suffix is the popup's button label, written into the string the way the disc stores it.

### 1.1 Kicked from a game: what shows, and when

- **What exists in the original is a team vote-kick. No idle kick and no lag kick was found** (see the search record
  below). The round-end screen `dlgMultiplayerRound.rdr` (MPZANIM set) has the ONSTART animation `ExitOnStart`,
  decoded as follows (`peer/uiprog_round.out`):
  `IF HaveBeenBannedFromGame` -> `BanSelfFromGame`, `WAIT 0.5`, `GameStatePopCommand(dlgNetBanned.rdr)`; `ELSE`
  `WAIT 5`, then `ReplayMission` in a loop.
- `HaveBeenBannedFromGame` is binding 0x56 (the ELF's table at 0x3dda10: name 0x3edcf0, fn 0x278ea0, which jumps to
  `FUN_002c3550` at D:L164913-165086). It returns true when the number of player slots (of the 24 at `DAT_004414c0`)
  whose byte +0x48 is set is greater than half the number of slots on the local player's side. It is a majority
  vote, and the check runs only at that round-end screen. Which player action sets +0x48 was not traced (owed, see
  the end of this item). Grade: **STRONG** for the gate and the timing, **BELIEVED** that +0x48 is "a vote against
  me".
- `BanSelfFromGame` is binding 0x59 (name 0x3edd50, fn `FUN_00278d30` -> `FUN_002f95f0` D:L197784-197810). It sends a
  Medius request (`FUN_00649d88` -> `FUN_00621268(0x40, ...)`) carrying the word 0x78 (120). What 120 means (minutes
  or seconds of ban) was not read.
- **The screen is `dlgNetBanned.rdr`**, with three TEXT objects (`peer/dialog_dlgNetBanned.rdr.txt`):
  `_539_YouveBeenKicked_MSG` "YOU HAVE BEEN KICKED FROM THIS GAME" (320,150, scale 0.8);
  `_541_AbortingMissionNoDot_MSG` "ABORTING MISSION" (320,200, scale 0.6);
  `_540_ReturningSocomEll_MSG` "RETURNING TO SOCOM II ONLINE..." (320,236, scale 0.6). Background `multplay_back.tif`.
  Its ONSTART `onstart_handler` does `DisconnectFromGameServer`, `WAIT 4`, then calls `exit_lobby`, which calls
  `ReturnToWorldOfSOCOM` (SWITCHMENU dlgWorldOfSOCOM.rdr online, dlgLANBriefingRoom.rdr on LAN). TRIANGLE also exits.
  So #539, #541 and #540 are on screen **together for 4 s** (`peer/uiprog_banned.out`). The 4 s comes from that
  WAIT, read off the disc.
- **A second route to the same screen: spectators ejected by vote.** `FUN_002b9bd0` (D:L159575-159615) and
  `FUN_002b9d80` (D:L159617-159638) print "Spectators EJECTED from this game." (0x3f2650). If the local client is a
  spectator (`FUN_002c2fa0`), they push `dlgNetBanned.rdr` (`FUN_002a47b0(0x4364e0, 0x3f26a0)`). The vote line is
  `" %s voting for/against spectators: %d votes against."` (0x3f2620 / 0x3f25e0). In the game lobby the event
  `MP_EJECT_SPECTATOR` instead runs `spectator_rejected`, which shows a popup and returns to the briefing room.
- **Banned at join.** A JoinGame response with status -972 (`MediusPlayerBanned`, horizon `Types.cs:98`) raises
  `MP_BANNED_FROM_GAME` (`FUN_002edba0` D:L190405-190489: -0x3cc -> 0x3f4880). -978 raises `MP_INVALID_PASSWORD`, and
  any other failure raises `MP_MEDIUS_JOIN_GAME_FAILURE`.
- **Timers that are not kicks.** `dlgMultiplayerRound`'s `TimeoutMonitor` is `WAIT 90` then
  `GameStatePopCommand(dlgNetError.rdr)`. A client that sits 90 s on the round-end screen without moving on is sent
  to "NET ERROR" (`dlgNetError.rdr`: caption "NET ERROR", a popup, then REBOOT or exit). That is the nearest thing
  to a "lag" exit the scripts hold.
- **Search record for idle and lag kicks.** The ELF's strings were searched for kick, idle, afk, inactiv, lag, ping,
  latency, timeout and ban (`socom2_game.elf.strings.txt`). The only hits are those above, plus
  `CHRSND_PLAYER_IDLE` (a character sound), `MediusErrorSessionInactive` (a Medius status), "inactive" (0x65f9f0)
  and weapon "Kick" tuners. None is a kick timer. **Not held.** What would settle it is a two-console session with one
  player idle in a round for longer than a round, watching for `dlgNetBanned` or `dlgNetError`. Also owed: the
  writer of slot byte +0x48 (the vote), which means reading the round-end vote UI's binding.

### 1.2 A second login of an account that is already logged in

- **Confirmed: -997 -> `MP_PLAYER_LOGGED_IN` -> #543 on dlgNetConnect.** The AccountLogin response handler
  `FUN_002eefa0` (D:L191147-191284) does the following. If the status is not success (`FUN_002f42d0(0x3f4a80
  "AccountLogin", ...)` == 0):
  - -0x3e6 (-998, `MediusAccountNotFound`) moves to state 10, the registration path;
  - **-0x3e5 (-997, `MediusAccountLoggedIn`) calls the screen callback with "MP_PLAYER_LOGGED_IN" (0x3f4a90)**;
  - -0x3d2 (-978, `MediusInvalidPassword`) raises `MP_INVALID_PASSWORD`;
  - anything else raises `MP_MEDIUS_ERROR` with "Login Failure".

  The status values are confirmed in horizon-server `RT.Common/Types.cs:72-73, 92`.
- `dlgNetConnect.rdr` binds `SCREEN EVENT MP_PLAYER_LOGGED_IN -> OnPlayerLoggedIn`, which is POPUPDIALOG #543 and
  then `exit_connect_screen` (SWITCHMENU PREVIOUS_SCREEN). The text of #543 (`_543_AccountInfoAlready_MSG`) is "The
  account information you provided is already logged in to SOCOM II Online. Please use a different Player Name and
  Password or log out the other player account. ¦ CONTINUE." **PROVEN** (code operand + disc binding + disc text).
- For comparison, the wrong-password case is `MP_INVALID_PASSWORD -> OnInvalidPassword`, which shows #545 "The
  password supplied does not match the registered password for this player name. Verify that the player name and the
  password are input correctly and try again. ¦ CONTINUE."

### 1.3 A new persona's name is refused

- **The check is the server's profanity filter, not a client rule.** `FUN_002eea70` (D:L190950-190983) is the response
  handler of a text-filter call that runs before registration. If the result word at +0x58 is negative, it calls the
  screen callback with "MP_FILTER_FAILURE" (0x3f4a20) and sets state 6. Otherwise it builds the AccountRegistration
  request (`FUN_00648140`, the string "AccountRegistration" at 0x3f4a40). A second filter site, `FUN_002e7aa0`
  (D:L187137-187166, `MP_FILTER_FAILURE` at 0x3f4280), handles another name. It sits beside `MP_CLAN_FULL` (0x3f4268),
  so it is probably the clan-name check (BELIEVED).
- **On screen:** `dlgNetConnect.rdr` binds `MP_FILTER_FAILURE -> OnFilterFailure`, which is POPUPDIALOG #544 and then
  `exit_connect_screen`. The text of #544 (`_544_PlayerNameQuestable_MSG`) is "The Player Name you selected could not
  be registered due to questionable content in the name. Please select another name and try to login again. ¦
  CONTINUE." **PROVEN** (code + binding + text).
- **#304 is not a persona message.** `_304_MustValidName_MSG` is "You must enter a valid game name before game
  creation can occur. ¦ CONTINUE." It belongs to `dlgCreateGame.rdr` (game creation), per `msg_users_300_370.txt`.
- **Client-side name rules** (length, characters, reserved names) were **not found** in this pass. Only the name-entry
  dialog's text-input limits could hold them (its `GetTextInput` arguments and the keyboard's maximum length). Owed:
  `dump-dialogs --dialog` of the persona-creation dialog and a read of its `GetTextInput` op's extra bytes.

### 1.4 The host leaves before launch; a game ends because too few players remain

- **Host leaves in the game lobby (before launch): no message; the host role migrates.** `dlgGameLobby.rdr` has the
  ONSTART animation `Session_master_migration`. It runs `IsSessionMaster` twice, then `DisableButton(PlayerReady)`,
  `EnableButton(Lock)`, `EnableButton(PlayerReady)`, and calls `OnStartGameLock` and `Watch45SecClock`. The new
  session master gets the host's buttons, and no `locs` (no message id) is attached to it (`peer/dialog_dlgGameLobby.rdr.txt`
  line 62). The lobby's only network-loss message is `MP_MEDIUS_ERROR -> OnNetError`: POPUPDIALOG #365 "You have been
  disconnected from SOCOM Online.", then back to the briefing room. Grade: **STRONG** (the bindings); what the new
  host's screen looks like is owed to a capture.
- **Too few players remain: `dlgNetAbandoned.rdr`, message #528.** Three code paths push it:
  1. `FUN_002bc530` (D:L161109-161146, the ClientLeaves handler; M2's lead). When the game object's +0xcc is set, it
     compares `FUN_0030d510` (the valid client count) minus pending joins against 3, and if the result is below 3 it
     pushes `dlgNetAbandoned.rdr` (0x3f2780). The meaning of +0xcc differs between readings: M2 reads 0 as "staging
     lobby", research 170 reads it as "joined late". The message text suits a joiner better.
  2. `FUN_002c4500` (D:L165605-165681, D:L165674-165676). When the console is the session master (`DAT_0045a0c0`,
     Harry62's label "session master" at r0004 0x45d480), both team counts `DAT_00441448 + DAT_00441450` are 0, the
     game state byte +0x113 is in 2..5 and `DAT_00441458` != 0, it pushes `dlgNetAbandoned.rdr` (0x3f2a50).
  3. `FUN_001f5e70` (D:L55583-55786, D:L55734-55745) chooses `dlgNetAbandoned.rdr` (0x3e2f70) as the next dialog for
     a client whose +0xcd is set when the state is 6 or 1, or when it is the session master. Otherwise it chooses
     `dlgNetError.rdr`.

  **What the player sees** (`peer/uiprog_abandoned.out`): `dlgNetAbandoned.rdr` has only the multiplayer background.
  Its ONSTART does `DisconnectFromGameServer`, and `displayNews` shows a POPUPDIALOG with **#528
  `_528_AllPlayersLeft_MSG`: "All players left the game before you were able to join. Please try again."**. It then
  calls `exit_lobby` -> `ReturnToWorldOfSOCOM`. Grade: **STRONG** for the screen and text, **BELIEVED** for the
  threshold of 3 (M2's caveat stands).
- **#529 "ABORTING MISSION."** is `dlgNetAbort.rdr`'s title. That dialog is reached **only by
  `MP_VERSION_NUMBER_ERROR`**, from `dlgGameLobby`, `dlgMPBriefingRoom` and `dlgLANBriefingRoom`. Its
  `LANorMPAbortCaption` writes #530 "RETURNING TO LAN BRIEFING ROOM" or #531 under it. It is not the too-few-players
  screen.
- **#352 / #353** ("This game has already started. Would you like to spectate the game in progress?" / "... appear as
  a ghost in the current game, and wait until the next round to join?") are join-a-started-game prompts of
  `dlgGameLobby.rdr` (`msg_users_300_370.txt`). They are not a leave or abandon message.

## 2. Summary (C7 scope)

There are 77 rows in `ledger-C7.tsv`: the 34 ledger names, 19 note-only gaps from notes 120, 122, 124, 137, 152 and
170, 8 unnamed items from the sweep (`scratch/C7/sweep.txt`), and 2 findings.

- **All rows:** 21 RESOLVED, 6 PARTIAL, 18 NOT-A-GAP, 32 UNRESOLVED.
- **The 34 ledger names:** 16 RESOLVED, 4 PARTIAL, 10 NOT-A-GAP, 4 UNRESOLVED.
- 24 of the UNRESOLVED rows are research 170's voice/PTT rows. They were not researched past that note (see §4).

| item | status | grade | one line |
|---|---|---|---|
| AUTOVOL_STEP_READING | RESOLVED | PROVEN | Integer steps: 127->0 over 360 ticks ends at tick 254 (1.058 s); over 480 at tick 381 (1.588 s) |
| BED_CAMERA_ABOVE_FEET_PLACEHOLDER | PARTIAL | STRONG | Reg 2 follows the listener's world y every frame; the value is floor(f*255)-128 (the port truncates) |
| BED_FADE_SECONDS_PLACEHOLDER | RESOLVED | BELIEVED (mechanism STRONG) | No fade: an immediate StopSound when the bed's animation stops; the tail is the tone's ADSR release |
| BLACK_SOURCE_UNKNOWN_COUNT_PLACEHOLDER | NOT-A-GAP | STRONG | A superseded test stand-in |
| DEFAULT_RANGE_PLACEHOLDER | RESOLVED | PROVEN | [160, 430] (constructor 0xa0 / 0x1ae) |
| HEADSET_ROUTE_READING | RESOLVED | STRONG | Queued (+0xb defaults to 1), then streamed through the speakers when no USB headset is present |
| LATE_STREAM_DATA_READING | NOT-A-GAP | BELIEVED | A browser-only case |
| LISTENING_GAIN_PLACEHOLDER | NOT-A-GAP | STRONG | An adaptation; the port's voice unit is 6.02 dB under the hardware |
| LONG_LOOP / LOOP / LOOP_FADE / MAX_RENDER | NOT-A-GAP | STRONG | Render adaptations; the console runs the grains live |
| MOVIE_ALPHA_READING | RESOLVED | STRONG | Opaque: SETTH 0/0 at sceIpuInit, CSC RGB32 |
| MOVIE_AUDIO_GAIN_PLACEHOLDER | RESOLVED | STRONG | BVOL 11627 = -9.0 dB of full; 0.1774 in the port's unit (now 1: +15 dB loud) |
| MOVIE_AUDIO_START_LATENCY_READING | UNRESOLVED | BELIEVED | Needs a capture with audio |
| MOVIE_CLOCK_CATCHUP / PICTURE_LATE | NOT-A-GAP | STRONG | Browser adaptations |
| MOVIE_END_LATENCY / HOLD / SKIP_CARRY | UNRESOLVED | BELIEVED | Need a run or capture (owed below) |
| MOVIE_PCM_LAYOUT_READING | RESOLVED | STRONG | 0x200-byte L/R blocks (disc + desktop correlation 0.99) |
| MOVIE_PICTURE_PERIOD_READING | PARTIAL | STRONG | 1001/30000 confirmed (0x3e1400 = 30); overruns owed |
| MOVIE_SETTLE_READING | RESOLVED | STRONG | At least 0.5 s of stream-CD idle (7867 H-blanks NTSC) |
| MUSIC_SLOT_HANDOVER_READING | RESOLVED | STRONG | The EE stops the faded sound at its 2.0 s timer; the next cue starts the frame after |
| SOUND_OFF_SWITCH_READING | RESOLVED | STRONG | Always 0: .bss, never stored |
| STOP_ON_EXIT_FLAG_READING | RESOLVED | STRONG | Stops the slot's sound when its animation instance stops (fade if the slot has seconds) |
| STREAM_LEVEL_READING | RESOLVED | STRONG | Line 0.24995 (group 2), music 0.27321 (group 1 at 0.74), port unit |
| STREAM_LOOP_HISTORY_READING | PARTIAL | BELIEVED | Carried (no key-on at the re-arm) |
| STREAM_NAME_SLOT_READING | RESOLVED | STRONG | Per animation instance: the port's key is the console's |
| STREAM_OFF_PLAY_READING | RESOLVED | STRONG | Not refused: the IRX still plays it (PRIORITY entries wait) |
| STREAM_VOLUME_SCALE_READING | RESOLVED | PROVEN | vol*0x7f>>10 |
| UI_GROUP_PICK_READING | RESOLVED | STRONG | A weighted random pick, the picked weight x DYNAMIC_WEIGHTS, renormalised |
| UI_SOUND_PLACE_READING | PARTIAL | BELIEVED | The 0xf9 node is the instance's +0x3c (0 at creation) -> unplaced |
| UNLOCK_RETRY_PLACEHOLDER | NOT-A-GAP | STRONG | A browser adaptation |
| GROUP_14_MASTER_READING (note) | RESOLVED | PROVEN | SOUND_VOLUME sets group 14 |
| VPK_LOOP_READING (note) | RESOLVED | STRONG | Re-arm at the data's top |
| reverbZones order (unnamed) | RESOLVED | STRONG | First match, depth-first |
| globalRegister2 rounding (finding) | RESOLVED | PROVEN | floor, not trunc |

## 3. The items

### 3.1 The 989snd model: fades, levels, streams

**AUTOVOL_STEP_READING** (`packages/sound/src/musicStream.ts:72`). This is FadeAllSounds' AutoVol stepping. The
current reading is "linear, truncated".
- *Prior search:* "`autovol.c` ... was not compared tick for tick."
- *What I did:* read Ziemas `iop/autovol.c:10-147` and `sndhand.c:578-596` (`snd_UpdateEffect`). Desktop research 36 Q5
  shows the IRX's `FUN_000038b4` (989SND.IRX.decomp L2579-2700) is the same logic, and I re-checked its integer
  divisions at L2640 and L2660. The schedule is simulated in `scratch/C7/autovol_sim.py`.
- *Answer:* when `|dv| < ticks`, the volume takes a ±1 step every `floor(ticks/|dv|)` ticks. Otherwise each tick does
  `cur = (32*cur + floor-div(32*dv/ticks)) >> 5`. FadeAllSounds (`(handle, 0, 0x168, 2)`, D:L244232) runs 127->0 in
  254 ticks (1.058 s): the volume is 97 / 67 / 7 at 0.25 / 0.5 / 1.0 s, against the reading's 105 / 84 / 42. The slot
  fade `FUN_00346dd0(2.0)` (480 ticks) reaches 0 at tick 381 (1.588 s). The target is
  `Original_Vol * vol >> 10`; vol 0 is not -4, so AutoVol never stops the sound. **PROVEN.**
- *Implementation:* in `streamFadeCurve`, replace `trunc(v0*(ticks-k)/ticks)` with the step schedule (port
  `autovol_sim.py`'s `autovol`). Test first: 127 over 360 ticks is 0 at tick 254 and 97 at tick 60.

**STREAM_VOLUME_SCALE_READING** (`musicStream.ts:58`). IRX `FUN_0000f7e0` stores `param_5 * 0x7f >> 10` into both
+0xc (Original) and +0x10 (Current) of the new handler. The play has no `min`; 989snd's `snd_FixVol` caps at 0x7f
later (desktop research 36 Q5). **PROVEN.** No code change is needed: the port's `min(127, ...)` is equivalent
wherever the cap applies.

**MUSIC_SLOT_HANDOVER_READING** (`viewer/src/audio.ts:80`). The question was "what ends a stream faded to 0".
- *Answer:* the EE does. `FUN_00346dd0` stores 2.0 (a float) at entry+0x20 and sends AutoVol(handle, 0, 480, 2)
  (D:L244289-244307). Each frame `FUN_00346ea0` (from the sound tick `FUN_00341a60` D:L241567) subtracts the frame dt.
  When the timer is no longer > 0 it calls `FUN_00340330` (StopSound) and frees the entry (D:L244358-244385).
  `FUN_003492b0` (D:L245541-245560) sees the slot's handle gone and starts the pending cue (`FUN_00349100`).
- The game runs at 30 Hz (coordinator's lead: dt 0.03337), so the stop lands on the first frame at or past 2.0 s,
  60 frames, and the new cue starts 0-1 frame later. The faded voice is silent from 1.588 s. **STRONG.**
- *Implementation:* keep 2 s as the handover. Make the fade's shape the AutoVol schedule above: silent at 1.588 s,
  then a hard stop at 2.0 s.

**STREAM_LEVEL_READING** (`viewer/src/audio.ts:72`; the ledger files it under `vpk.ts`). The level of a round stream.
- *What I did:* read the master-volume groups each system tuner sets, by disassembling the tuners' update functions
  (`scratch/C7/tuner_groups.py`): SOUND_VOLUME sets groups 0, 3, 4, 5 and 14; MUSIC_VOLUME sets 1; DIALOG_VOLUME sets 2
  and 6; HEADSET_CONTROLLER sets 7. A second, independent line: Harry62's live annotations at r0004 0x491190-0x4911c4
  are the duck table's saved masters. Its order is `FUN_003412f0`'s list 0,2,1,3,5,6, so they read g0 0x400, g2 0x3eb,
  g1 "0x2f5 or 0x333", g3 0x400, g5 0x400, g6 0x3eb, with the ducked copies at 0.35. DIALOG drives 2 and 6 together and
  SOUND drives 0, 3 and 5, as the tuners say. The data-twin mapping is r0001 0x48dd28 -> r0004 0x4910e8 (82/82
  referrers, `tools_py.data_via_twin`), so this table is r0001 0x48ddd0.
- Stream group by class (D:L241878-241890): MUS -> 1, HQ -> 6, any other ST (the `^PH_` lines) -> 2, else 0.
- *Answer* (`scratch/C7/movie_level.py`, port unit = register/0x7ffe as `voiceLevel` has it): a round line (class 3,
  mono, pan -1 -> 0, group 2 at DIALOG 1.0) is register 8190 -> **0.24995** a side. The round music (stereo VPK pair,
  group 1 at MUSIC 0.74) is 8952 -> **0.27321** a channel. **STRONG.**
- *Implementation:* route `GameAudio.playStream` / `playMusic` through `streamVoiceGains(0x400, -1, channels,
  master(group))`, the group taken from the entry's class, instead of the flat 0.25. Test first: a `^PH_0014` play is
  0.24995 a side, and `MUS_MP_SEAL_WIN_RUS` is 0.27321 L-only / R-only. At the defaults this moves the music +0.77 dB;
  it matters more once the options' sliders reach the round.

**STREAM_LOOP_HISTORY_READING** (`musicStream.ts:65`). The IRX's re-arm `FUN_0001446c` resets each stream's buffer
counters and flags and does not key the voice on. The SPU resets ADPCM history only at KEYON, so the history is
carried. **BELIEVED** (one line plus hardware behaviour). Owed: the capture of MUUI0003's wrap that research 152
already names.

**STREAM_OFF_PLAY_READING** (`viewer/src/menuMusic.ts:51`). The current reading is "refused". **Contradicted.**
- `VagStreaming(OFF)` (`FUN_00344f80` D:L243213-243235) sends `snd_StopAllVAGStreams` (0x34 -> IRX `FUN_000104d0`,
  which stops streams and closes nothing) and zeroes the EE's own count `DAT_0048dd98`.
- The IRX's streamer stays initialised. `DAT_0001cd30` is cleared only by `FUN_000160dc` (CloseVAGStreaming), which is
  reached from shutdown or a failed init. So `FUN_0000f7e0` accepts a later play.
- On the EE, `FUN_00343140` (D:L242225-242233) parks a play only if the entry carries `PRIORITY` (+0x1c bit 7, key
  0x3f7798) while the count is full (`DAT_0048dd98 <= DAT_0048dd80`). It keeps one pending play in
  `DAT_0048de28/30/38` and starts it from `FUN_00341a60` (D:L241569) once a channel frees. Without PRIORITY,
  `FUN_00342240` is called and the stream sounds.
- **STRONG.** Practically unreached: research 152 shows every front-end `MUS_` play follows `VagStreaming(ON)`.
  Suggestion: rename to `'plays'`; keep it untested unless a script plays one.

**SOUND_OFF_SWITCH_READING** (`sound/src/uiSounds.ts:60`).
- *What I did:* `elf.py xref 0x48dd28` finds 92 `lbu` and **no store**. `find_word.py 0048dd28` finds no pointer.
- The address is in .bss (segment 0x1e7000: file size 0x221480, memory size 0x2ce380), and crt0 zeroes
  0x1d5600..0x686f80 (0x180118-0x180144). gp is 0x1dd2f0 (0x180170), far from 0x48dd28.
- Harry62 has no label at its r0004 twin 0x4910e8.
- *Answer:* always 0 (sound on). **STRONG** (a base+offset store from an unrelated base cannot be excluded by a lui
  scan, but none was found in 0x48d000-0x48dd28 either).

**HEADSET_ROUTE_READING** (`uiSounds.ts:68`).
- The Headset object (`DAT_0049e158`, made by `FUN_0034bc60` -> `FUN_0034b910`) sets byte +0xb = 1 at construction
  (D:L247015), on reset `FUN_0034b8c0` (D:L246974) and on flush `FUN_0034a6f0` (D:L246450). It is cleared only by
  `FUN_0034aa70` (D:L246545), whose one caller is `FUN_00547af0` (D:L413090), offline only. That function takes the
  player's control away (the death path; BELIEVED).
- So offline, `FUN_0034b6c0` **queues** an HS line (20 slots).
- Its consumer is the Headset tick. `FUN_0034b3b0` runs it from the sound frame `FUN_00341a60` (D:L241600-241603,
  offline). State 2 (`FUN_0034bb80`: no USB device of class 0x10 with product 0x5622 found by `FUN_0034ba60`) runs
  `FUN_0034afd0`. That pops the cue and plays it through `FUN_00347960` + `FUN_00342240`: an ordinary VAGSTORE stream
  on the TV. With +0xb clear and no PD and no DEATH_DAMAGE, it is dropped instead (D:L246745-246748).
- With a USB headset present (state 1, `FUN_0034ad00`), the line goes to the 989DSTRM extension 0x12c4e67a.
- Online (`DAT_0045a0c1` = "is online", Harry62's r0004 0x45d481 annotation, 250 twinned referrers), the line is not
  queued and streams directly.
- **STRONG.** *Implementation:* play `SND_HST_*` as a stream (one at a time, queue order), not "never". Test first:
  a `headset` play reaches `music`/`stream`.

**UI_GROUP_PICK_READING** (`uiSounds.ts:75`).
- `FUN_00347f00` (D:L244831) loads the group: `DYNAMIC_WEIGHTS` -> +0x54 (default 0), then each `ENTRIES` member's
  name (looked up with `FUN_00344f30`; a member not found is skipped) and its `WEIGHT` (default 0).
- `FUN_00347d40` normalises: a sum of 0 gives 1/n each, otherwise each weight is divided by the sum.
- The play, `FUN_00348710` (vtable 0x406b50 +0xc, D:L245157), takes `u = rand() * 4.656613e-10` (`FUN_00197740` =
  `rand`). The first member whose cumulative weight exceeds u is picked; its weight is multiplied by DYNAMIC_WEIGHTS
  and the set is renormalised; then that member's own play (its vtable +0xc) runs with the same arguments.
- **STRONG.** With 0.05 a member just played becomes about 20x less likely.

**STOP_ON_EXIT_FLAG_READING** (`ui/src/sounds/uiSoundCues.ts:55`).
- Flag 0x200 sets the slot record's +2 (D:L112360-112362). The record's +4 is the float at the command's +0x12
  offset, when that offset is positive (D:L112356-112358).
- `FUN_0026fd20` (D:L118432-118480), called from the instance stop `FUN_0026ff20` (D:L118572), handles each slot that
  holds a handle. With +2 set: if +4 > 0, `FadeOut(+4)` then detach, otherwise StopSound and free. With +2 clear: free
  if the sound has ended, otherwise detach it to play out.
- **STRONG.** *Implementation:* when a dialog's animation stops (and so when the dialog exits), stop that animation's
  0x200 slot sounds. The front end's `MUS_SUCCESS` / `MUS_FAILURE` (0x280 on `dlgExitState`) would stop on exit.

**STREAM_NAME_SLOT_READING** (`uiSoundCues.ts:98`). `FUN_0026e7c0(DAT_00414be8, byte+6)` searches the **running
instance's** +0x50 records. `FUN_0026d940` builds each instance with its own copy of the definition's records (0x10
bytes each, count +0x39; handles and +2 zeroed; D:L117228-117242). So the console keys by (animation instance, name),
which is the port's key. The note's exception (CallMusic and CallMusicOld sharing a slot) does not hold: they are two
animations and so two instances. **STRONG.** Correct the comment; no code change.

**UI_SOUND_PLACE_READING** (`uiSoundCues.ts:62`). Node 0xf9 resolves to the instance's +0x3c, else to its node table
entry for byte +1 (`FUN_0026f4e0`). +0x3c is written 0 at instance creation (D:L117159). Nothing found attaches an
object to a UI instance, so a null node means the play is unplaced, which matches the logs' pan -1. **PARTIAL,
BELIEVED.** Owed: read a main-menu zAnim instance's +0x3c from RDRAM (any front-end dump).

### 3.2 The beds and the camera height

**BED_FADE_SECONDS_PLACEHOLDER** (`viewer/src/audio.ts:58`).
- `scratch/C7/beds.ts` decodes every flag-0x200 play-sound command in all MP*.ZDB files (339). Every bed
  (`outside_noise`, `inside_noise`, `snd_wind_*`) carries 0x280 or 0x290, and **all** have fade offset (+0x12) 0.
- So no command writes the slot's +4. It keeps the value copied from the animation definition's record when the
  instance is built (`FUN_0026d940` D:L117228-117242 copies the records, then clears +0xc and +2 only). The loader's
  value for +4 was not read, and is BELIEVED to be 0. With +4 at 0, stopping `outside_noise` with command 46 runs
  `FUN_0026fd20`'s StopSound branch: a key-off with **no fade**, so what is heard is the bank tone's ADSR release.
- **STRONG** for the mechanism and the data, **BELIEVED** for the initial +4 = 0 (owed: the definition record's +4
  from `parseAnimSets`' raw records). *Implementation:* delete the 0.5 s; on a bed stop, key the rendered loop off with
  its tone's release rate (`render.ts`'s Envelope already models release). Test first: stopping `~OUTDOOR_AMB` decays
  at the tone's release rate.

**BED_CAMERA_ABOVE_FEET_PLACEHOLDER** (`viewer/src/soundData.ts:556`).
- `FUN_00341a60` (disassembly 0x341e28-0x341eac) reads the listener `DAT_0048db48` (`m_listener` in Harry62's CSnd
  statics) at +0x34, its world y. It maps that through the mission's `elevation (max min)` (read by `FUN_002aab20`
  D:L151313-151326 into 0x4364e0+0xf4/+0xf8) with `FUN_002aca30`, then computes **floor**(f*255), adds -128.0 (the
  double 0xc060000000000000), converts with `dptoli`, clamps to [-128, 127] and sends it as global register 2 **every
  frame**.
- So the true value is the camera's live height. The port's 25 stands for the camera's offset over the feet, which is
  C2's value.
- **A rounding defect, PROVEN:** `render.ts`'s `globalRegister2` uses `Math.trunc(f*255 - 128)`. For f*255 < 128 and
  not an integer, the port is 1 higher than the code (example: f = 0.3 gives -51 against the code's -52).
  *Implementation:* `Math.floor(f*255) - 128`. Test first: (0.3) -> -52, (0.75) -> 63.
- PARTIAL for the placeholder itself: C2's camera height and a per-frame register update (rather than one render) are
  owed.

**DEFAULT_RANGE_PLACEHOLDER** (`audio.ts:52`). `FUN_00345620` (D:L243411-243425; `addiu v1, zero, 0xa0` at 0x34567c)
initialises every sound object with near 0xa0 (160) and far 0x1ae (430). The RANGE parse (D:L242497-242512) writes them
only when `RANGE` is present. **PROVEN.** *Implementation:* `[160, 430]`, with a test on a sound without RANGE.

### 3.3 The movies

**MOVIE_AUDIO_GAIN_PLACEHOLDER** (`fmv/src/movieAudio.ts:40`).
- The open `snd_PcmStreamOpen(0x6000, 0, 0x366, 0, 2, 2)` (D:L208361) maps to IRX `FUN_0000a318` (RPC 0x3B): vol7 =
  0x366*0x7f>>10 = 107, pan 0, **group 2**.
- The start, `FUN_0000a9ac` (mode 2), computes `FUN_000198c8(107, 0)` (107*258 through pan-table entry 90, 11584/16383)
  and then `FUN_00019b7c(.., 2)` (the square law at DIALOG's master). It writes the result **unshifted** to the core's
  BVOLL/BVOLR (`core|0xf80`, `core|0x1080`).
- BVOL's unity is 0x7fff: PCSX2 `spu2sys.cpp`, per desktop research 85 §1.1, against the voices' `reg<<1` (unity
  0x4000). The desktop measured its ring (which treats 0x3fff as half scale) at +0.47 dB against the console.
- *Answer* (`movie_level.py`): BVOL 11627 = **0.3548 of full, -9.0 dB**. In the port's unit (register/0x7ffe, which is
  half the true gain, into the x4 master) the movie should be **0.1774**. It is 1 now, so the movie plays **+15 dB**
  above the console relative to the SFX and streams, and probably clips.
- **STRONG.** Two lines: the IRX arithmetic, and the desktop's measured match of a ring whose gain is close to this
  (1.1 dB apart, within that measurement).
- *Implementation:* `MOVIE_AUDIO_GAIN = 11627 / 0x7fff / 2`, scaled by DIALOG_VOLUME² when the options slider exists.
  Test: the constant.

**MOVIE_SETTLE_READING** (`fmv/src/player.ts:92`).
- `FUN_001ed560` (D:L51243-51255) zeroes RCNT0 and loops `FUN_0033f550(1)`: RPC 0x36, "1 when no stream CD read is
  pending", per research 06. It exits only when the counter has advanced `DAT_0049e2d4 >> 1` past the last busy
  answer.
- RCNT0's mode is 0x83 (D:L249334), so it counts H-blanks. `DAT_0049e2d4` comes from `DAT_004a44f8`, which is
  15734.25 in NTSC (`FUN_003b14a0` mode 0, D:L305376-305383; 31468.5 in 480p).
- *Answer:* **at least 0.5 s** of continuous stream-idle before a pushed movie opens. **STRONG.**
- *Implementation:* 0.5. Test: a push opens no sooner than 15 frames at 30 Hz.

**MOVIE_ALPHA_READING** (`fmv/src/ipuCsc.ts:20`). sceIpuInit (`FUN_001a34b0`, exact fingerprint) issues `SETTH`
0x90000000, so TH0 = TH1 = 0 (D:L23263). The movie's CSC command is 0x700003ff (OFM = 0, RGB32; D:L36593). With zero
thresholds no pixel takes the transparent or half alpha. **STRONG.** The threshold semantics come from the IPU's
documented behaviour, which is outside the corpus. The answer stays 255 (GS 0x80).

**MOVIE_PICTURE_PERIOD_READING** (`player.ts:71`). The ELF holds 0x3e1400 = 30. The cap (D:L304746-304749) waits
VSyncs in 1/60 s steps while the elapsed time plus 1/60 is under 1/30. **PARTIAL/STRONG**; the busy-frame overrun is
owed to a capture.

**MOVIE_PCM_LAYOUT_READING** (`pss.ts`/`moviePcm.ts:29`). The disc measurement (R137.2) agrees with the desktop
runtime's block-layout ring, which correlates 0.99 with the console's output across INTRO_2 and the title loop
(desktop research 32 §7; `snd989_mixer.cpp` PcmRing's comment records the sample-interleaved first cut as wrong).
**STRONG.**

**Unresolved, with what is owed:**
- MOVIE_END_LATENCY_READING: a PS2X_MPEG_TRACE, or a 60 fps capture across SONY448's last picture and INTRO_2's first.
- MOVIE_HOLD_READING: the same capture, looking at the frames without a new picture.
- MOVIE_SKIP_CARRY_READING: the binding record's edge byte +0x704 for `dlgArtGal2` / `dlgPlayTutMovies`. This is C5b's
  input decode.
- MOVIE_AUDIO_START_LATENCY_READING: a capture with audio of SONY448's first picture.
- BLACK_SOURCE_UNKNOWN_COUNT_PLACEHOLDER, MOVIE_CLOCK_CATCHUP_READING and MOVIE_PICTURE_LATE_READING are browser
  stand-ins, NOT-A-GAP.

### 3.4 Adaptations (NOT-A-GAP)

`LISTENING_GAIN_PLACEHOLDER`, `LOOP_SECONDS_PLACEHOLDER`, `LOOP_FADE_SECONDS_PLACEHOLDER`,
`LONG_LOOP_SECONDS_PLACEHOLDER`, `MAX_RENDER_SECONDS_PLACEHOLDER`, `UNLOCK_RETRY_PLACEHOLDER`,
`LATE_STREAM_DATA_READING`, `MENU_MUSIC_LEAD_SECONDS_ADAPTATION` and `MENU_MUSIC_GESTURE_ADAPTATION` have no value in
the original. The console runs grains live, has no autoplay lock and streams from disc.

One fact for LISTENING_GAIN: the port's voice unit (`voiceLevel/0x7ffe`) is 6.02 dB under the hardware's gain. The
register is doubled by the SPU (desktop research 85 §1.1; psx-spx "Voice volume/2"; PCSX2 ADSR.cpp). So x4 is x2
relative to the console. The movie path is the one place where this matters (§3.3).

### 3.5 Note-only and unnamed

- **GROUP_14_MASTER_READING:** SOUND_VOLUME's tuner (`FUN_0038a0a0` D:L281976-282033) sets groups 0, 3, 4, 5 and **14**
  from one value. Default 1.0 -> 0x400. **PROVEN.**
- **VPK_LOOP_READING:** a LOOP play sets the stream's 0x400 from flags 4, and `FUN_0001107c`/`FUN_0001446c` re-arm at
  the data's top. There is no loop point. **STRONG** (research 152 §5, re-read).
- **Stream channels:** 6 at boot (D:L243249), 4 after `VagStreaming(ON)` (`FUN_003450f0` D:L243258-243272). A
  PRIORITY play past the count waits in one pending slot. **PARTIAL** (the round's slot logic is already modelled).
- **reverbZones' first-key order** (`soundData.ts:455`): `FUN_0032f0d0`/`FUN_0032f0e0` (D:L230210-230299, research
  122 §13) is a depth-first search that returns the first match. **STRONG**: the first entry wins.
- **SOUND_FALLBACKS / borrowMissing:** a deliberate port deviation; the console is silent for a name its loaded blocks
  lack (`FUN_00344f30`). Owed: the Rat's Nest capture research 81 §12 names.
- **UNRESOLVED, not researched this pass:** EXIT_STATE_GROUPS_READING, KEYBOARD_SOUND_TRIGGERS_READING,
  BOOT_POPUP_METAL_READING, MOVIE_FIRST_PICTURE_TICK_READING, M51IG07's start tick, `landingHurts`' voice call
  (owed: `FUN_005a54d0`'s CHRSND_DAMAGE play), and the emitter clamp at 127. Research 81 §12's open list (FALLSOUND,
  `.GUN_EMPTY`, the LFO grain, Gaussian interpolation, PLAYER_INDOORS' writer, the activation-1 scripts) also stands.

## 4. The voice / PTT rows (research 170 §10)

All 24 are carried in the ledger as research 170 left them. Three are owner's calls or already ruled (OT.R24, H87):
the talk key, the codec and the microphone notice. The other 21 are UNRESOLVED, with that note's owed evidence (a
two-instance recomp session). This pass applied no new lever to them; they are network rather than audio. The one
audio-relevant row, VOICE_TALK_SOUND_READING, stays "none": the lobby's voice animations play nothing, per that note.

## 5. Sourced but not implemented (multiplayer-relevant)

- **Group masters from the options.** SOUND_VOLUME drives groups 0, 3, 4, 5 and 14, MUSIC_VOLUME drives 1,
  DIALOG_VOLUME drives 2 and 6, and HEADSET_CONTROLLER drives 7. Each is `SetMasterVolume(g, v*1024)` with 989snd's
  square law. The port reads MUSIC_VOLUME for menu music only.
- **The HQ-stream duck.** The first play of an entry with HQ (+0x1c bit 4) ducks groups 0-5 to 0.6 indefinitely
  (`FUN_003412f0(1e9, 0.6, 0..5)`, D:L241891-241893) until the duck is released. Which lines carry HQ, and what releases the duck (`DAT_0048de20`),
  were not read in this pass. Not in the port.
- **The concussion duck** (`FUN_005a0e70`, 0.35 for 5 s then a 5 s return) is implemented in `ringingEars.ts`.
  Harry62's live `0.35` at r0004 0x4911d8 (r0001 `DAT_0048de18`) is an independent second line for it.
- **Headset lines offline:** SND_HST_* play as streams through the TV when no USB headset is present (§3.1).
- **The fade schedules** (§3.1): FadeAllSounds (a round's end) reaches silence at 1.06 s, not 1.5 s.

## 6. Leads for other workstreams

- **C2 (camera):** the listener's +0x34 is what the beds hear (global register 2 each frame). The camera's height over
  the feet is the port's missing input.
- **C3:** RING_VOLUME_READING's "which channel carries the ring" is answerable. `.RINGING_EARS` is a bank sound in
  group 0 (SOUND); the duck list 0,2,1,3,5,6 leaves out group 4 (a SOUND group) and 14 (the menus).
- **C5b:** MOVIE_SKIP_CARRY needs the binding edge byte +0x704.
- **C8 / online:** see §1. The vote-kick majority test is `FUN_002c3550`; `BanSelfFromGame`'s 120 is unexplained.
- **The desktop (PC) project:** its PCM ring's gain (0x7ffe*vol/0x400>>1, with no pan table and no square) is
  1.57 dB over the IRX's arithmetic. The IRX applies pan 0 (-3 dB) and the group square at group 2.

## 7. Verification (V4, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V4-verify-ui-audio-card.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V4/`). V4 verified C4, C5a, C5b, C6, C7, C8 and C9 (34 claims sampled). What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table). V4's tally over its 34 sampled claims: CONFIRMED 29, CONFIRMED-WITH-CORRECTION 5, WRONG 0, UNVERIFIABLE 0.

Verifier V4, research wave 2026-10-04. Read-only. Scripts and their saved outputs are in `scratch/V4/` (README there).
`D:L<n>` is a line of `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001). `$PORT` is the
`agent/online` snapshot named in the brief. No decompiled text is quoted.

**Method.** I sampled 34 claims, at least 4 from each report. I took every must-include claim, then the "the port is
wrong" claims and the PROVEN/STRONG rows an implementer would act on. Where I could, I re-derived each one by a
different route from the author's:
- I disassembled the ELF myself instead of trusting the decompiler.
- I read `.data` vtables to fix slot meanings.
- I scanned raw disc bytes instead of using the author's parser.
- I read the cells in the PCSX2 dumps.
- I re-ran the C5b unicorn script and decoded C8's netcnf files with my own key build.

I then checked each claim against `$PORT` to confirm that the port does what the report says.

**Result.** No claim in the sample is wrong. 29 are confirmed as written. 5 are confirmed with a correction:
- In two of them the stated value or answer is right but the reasoning or wording is not. For `CheckTeamStatus`
  (C5b) this matters for the implementation.
- In the other three a detail needs adding.

### 7.1 Verdicts

| # | claim | report | verdict | one-line reason |
|---|---|---|---|---|
| 23 | movie audio at -9.0 dB of full (gain 0.1774 in the port's unit) | C7 | CONFIRMED | IRX: mode 2 (not 3) takes the BVOL branch, written unshifted (voices `>> 1`); 0x366*0x7f>>10 = 107 -> BVOL 11627; the port's 1.0 goes into the same x4 master as the voices |
| 24 | FadeAllSounds reaches silence at tick 254 (1.058 s) | C7 | CONFIRMED | `FUN_003400d0(h, 0, 0x168, 2)` D:L244232; IRX `FUN_000038b4`: \|dv\| 127 < 360 -> a step every 360/127 = 2 ticks; Ziemas `snd_UpdateEffect` decrements, then calls |
| 25 | `DEFAULT_RANGE` = [160, 430] | C7 | CONFIRMED | 0x34567c `addiu v1,zero,0xa0`, 0x345688 `0x1ae`; the RANGE parse overwrites only when the key is present; the port already has `SOUND_DEFAULT_RANGE` [160,430] in `sound/uiSounds.ts:44` |
| 26 | `render.ts` `globalRegister2` must floor, not trunc | C7 | CONFIRMED | 0x341e48-0x341e74: mul 255.0 -> fptodp -> `jal 0x1b2de8` (fdlibm floor) -> dpadd -128.0 -> dptoli; the port `Math.trunc(f*255-128)` |

### 7.2 Claim 23: Movie audio -9.0 dB / 0.1774 -- CONFIRMED (STRONG as graded)

- The open passes the volume as 0x366 (`FUN_0033f1e0(param_4,0,0x366,0,2,2)`, D:L208361). The port's own comment calls
  the first argument 0x6000; it is a variable there.
- IRX `FUN_0000a318` stores the mode (param_6 = 2), vol7 = 0x366*0x7f>>10 = 107, and the group (param_5 = 2).
- `FUN_0000a9ac` takes the voice branch only for mode 3. Mode 2 writes `FUN_00019b7c(...)` **unshifted** to core|0xf80
  and core|0x1080. The voice branch writes `>> 1`.
- The arithmetic 107*0x102 -> pan 11584/16383 -> 19519 -> 19519^2/0x7ffe = 11627 reproduces.
- **Port routing.** `frontEndMovies.ts:197-200` sends the movie into the same `master` gain node (x4,
  `LISTENING_GAIN_PLACEHOLDER`) as the voices. So C7's "port unit = true gain / 2" comparison is apples to apples:
  0.1774, -15 dB from today's 1.
- **Remaining steps** (why STRONG, not PROVEN): BVOL unity 0x7fff comes from PCSX2's spu2 source, and the group-2
  master is assumed to be at its 0x400 default.

### 7.3 Claim 24: FadeAllSounds -- CONFIRMED

- D:L244232: `FUN_003400d0(h, 0, 0x168, 2)`.
- IRX `FUN_000038b4` (989SND L2579+): target 0; dv = -127; |dv| < 360, so the period is 360 / -127 = -2 in C, taken
  absolute as 2, with a ±1 step.
- The per-tick callback `FUN_00003b90` steps once per counter expiry and reloads the counter from +0x16. Ziemas'
  `snd_UpdateEffect` (sndhand.c) decrements, then calls at 0.
- So 127 steps x 2 = tick 254 = 1.0583 s at 240 Hz. The port's `streamFadeCurve` (musicStream.ts:175-183) is linear
  and truncated.

### 7.4 Claim 25: DEFAULT_RANGE [160, 430] -- CONFIRMED

- 0x34567c `addiu v1,zero,0xa0; sh 0xc` and 0x345688 `addiu v0,zero,0x1ae; sh 0xe`. The RANGE parse (D:L242497-242512)
  pre-fills from those fields and overwrites only when the key is found.
- **Implementation tip** C7 missed: `sound/src/uiSounds.ts:44` already exports `SOUND_DEFAULT_RANGE = [160, 430]` for
  the UI sounds. `viewer/src/audio.ts:52` `DEFAULT_RANGE_PLACEHOLDER = [30, 200]` should import it, not add a third
  copy.

### 7.5 Claim 26: `globalRegister2` floors -- CONFIRMED

- 0x341e48-0x341e74: `mul.s f*255.0` -> `jal 0x1a0720` (fptodp) -> `jal 0x1b2de8` -> dpadd with 0xc060000000000000
  (-128.0) -> `jal 0x1a1208` (dptoli) -> clamp to [-128, 127].
- 0x1b2de8 is `floor` in `socom2_names.csv` (fingerprint 0.85). Its body is fdlibm's floor (sign test, -1.0 constant
  0xbff0...).
- The port's `render.ts:563` uses `Math.trunc(f*255 - 128)`. f = 0.3 gives -51 against the game's -52.

### 7.6 What an implementer should take from this (the verifier's list, for all seven reports)

- Every sampled "the port is wrong" claim held. The changes the reports propose for the camera, popup focus, `atofF32`,
  `IsNetwork`, the alpha-0 depth write, the cursor colour, UIVAR typing, movie gain, fade stepping, the default range,
  register-2 flooring, netcnf `nic`, the persona key, MC handles, the zoom fog and the zoom LOD can be acted on.
- Two of those need the adjustments above:
  - `CheckTeamStatus`: implement the predicate `w437ce8 && (b45a0c0 || w441470)`, not "no game exists".
  - The cursor: grey means 128/255 on an untextured quad.
- Three small ones:
  - The menu tick is 29.97 Hz.
  - Reuse `SOUND_DEFAULT_RANGE`.
  - Use 457.0074, the game's float, as the focal.
