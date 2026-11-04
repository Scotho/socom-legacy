# 170 -- Push-to-talk voice: the floor, the channels, the buttons and who is talking (OT-14)

Written 2026-10-05 for OT-14, the voice spec of the online-path plan's OT.R23
(`../plans/2026-10-02-online-path-target.md`; the owner, 2026-10-05, verbatim: "spec a new task: FULL lobby (all
players) and match (team only, split by dead and alive) push to talk voice comms as a task in the multiplayer sprint,
if one is not already. Look to the original game for parity in this feature. only one player was allowed to speak at a
time and there was UI to show who was talking in lobby (and perhaps in game). Derive what you can and placehold what
you cannot, stating and recording that planely as our conventions direct."). **Derivation and planning only: no
product code and no test of behaviour is written here.** OC-6 (HUMAN_TASKS H36) is answered by the same ruling --
browser-microphone voice now, without waiting for the desktop recompilation to send voice; its open halves (the codec
and its licence, the microphone notice's wording) and the calls this note leaves are HUMAN_TASKS H87.

**Overridden in part (research 206 §1):** OFFENSE = 1, DEFENSE = 2; a talk stance (state 5) -- OFFENSE sends 2, DEFENSE 1; "state 5" is the command menu's own state, not a stance (R2-AV, research 205 §1.1 and §1.9; W2-R, research 197; V7 #8). The corrections themselves, with this note's re-reads of the decompilation, are §"Corrections of 2026-10-04" rows C1 and C5 below.

Sources: the retail decompilation r0001 `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` its
line, `FUN_<addr>` its functions; cited, never pasted); the retail ELF `game/disc/socom2_game.elf`, its strings by
address (`S:0x...`, read off the image) and, where the decompilation has no function, its instructions disassembled
by address (one place: `VCButton`, §4.1); the US disc's dialogs through `tools/dump-online-dialogs.ts --dialog
dlgGameLobby.rdr` (and the whole online chapter, for every other voice widget: there is none, §5.1); the archived
frames `$SOCOM_PC_ROOT/logs/parity/s4_pcsx2/A_54_gamelobby2.png`, `s11_r0004_round1/A_17_game_lobby_ok.png`,
`A_hold01.png` and `B_hold01.png`, read by eye; the desktop project's notes as evidence at the `ref/desktop` pin --
`desktop@be557831:docs/KNOWN.md:171` (the row "Voice: the headset path"), `desktop@be557831:docs/research/39-headset-talk-button.md:89`
(the two talk routes), `:119` (the HUD), `desktop@be557831:docs/research/56-sase-codec.md:33` (the codec),
`:326` (the path end to end), `desktop@be557831:docs/research/66-chat-step-rounds.md:92` (the preset's talk slots
read live). It stands on web research 116 §1 (the pad's slot order, `packages/ui/src/input/padStates.ts`), 128 §4.9
and §4.11 (the briefing room and the game lobby), 159 (SVC-07a: a game is a match room, on `agent/bridge`) and 169
(security, on `agent/security-plan`), and does not restate them. **No server was contacted** (R293); no game was run.

Confidence: **reading, pending review** for every transcription below -- none is unit-tested yet (the tests are the
build's, §7) and no reviewer has re-read the cited lines. Nothing here is proven: no archived capture shows a player
talking, and the recomp has never sent voice (KNOWN, the row above). Four frames read by eye show the indicators idle
(§5): evidence of their place, not of their behaviour.

## Corrections of 2026-10-04 (the research waves)

Written 2026-10-04 against two later sources, and kept beside the original text, which stays where it stands with a
bracketed correction at each place a point is contradicted (so the first derivation can still be read). Sources and
their grades: **W2-R** (`197-w2-r-input-voice-integration.md`, findings W2-R-01 to -04; its own grades, a source
reading cross-checked by W2-A); **R2-AV** (the research wave's card `R2-AV-audio-card-world.md`, 85 cited reads re-checked
by its own author, one agent: graded "strong", "proven" where the card says so; not yet reviewed by a second agent).
Where this note cited `D:L` or `FUN_` evidence, the lines were **re-read in the decompilation on 2026-10-04**; the
last column says what that read found. Nobody ran the game: every row is still a source reading.

| # | 170 said | now | source, grade | the re-read |
|---|---|---|---|---|
| C1 | the menu's order is the numbering: 1 OFFENSE, 2 DEFENSE | **OFFENSE sends 2, DEFENSE 1** (TEAM 0); the HUD icons agree | W2-R-01 (closed at source level); R2-AV §1.1 proven | holds: `FUN_002344e0` registers OFFENSE with 2 and DEFENSE with 1 (D:L83791-83792); `FUN_0022f950` passes it to `FUN_002c2c20` and keeps it in `+0xc4` (D:L81576-81592) |
| C2 | one side is 4-7, which not read | **SEALs 0-3, Terrorists 4-7**, counted by side so that after the side swap the same players change blocks; a spectator is 10, never 14 (his team word is exactly 0x10000) | W2-R-01 (the predicate is the Terrorist one); R2-AV §1.2, §1.3 strong | `FUN_002c2c20`'s +4 test (D:L164449-164458) read; the equality with `FUN_002c30b0` and the SEAL value 0 of `FUN_002c3330` taken from both notes, not re-derived |
| C3 | a death moves the player to the dead zone; the dead hear only their side's dead | **only without respawn, or for a ghost**; in a respawn game a dying player keeps his TEAM / OFFENSE / DEFENSE channel (and his talk flag) until he returns, so the living and the dead of a side still hear each other | R2-AV §1.4 strong; **W2-R does not address it** | holds: the controller's OnDeath sends event 0x22 only when game `+0xdc` is 0 or the player is a ghost (`+0xd2`), else it only starts the body's fade (D:L454484-454492); 0x22 moves to 3, 0x23 restores `+0xc4` (D:L497716-497737). A late joiner is put on 3 at the round's start whatever the game (D:L55848-55849) |
| C4 | whether the dead can talk: not established (the setter needs "player state 4") | **they can**, with the same buttons; "player state 4/5" is the **command menu object's** state byte (`0x413120 +0x750`), not the actor's life or stance | W2-R-03 (the premise only, the dead-talk question left open); R2-AV §1.8 strong (yes) | the premise holds (`FUN_002351a0` tests `param_2+0x750`, the menu object, D:L83895-83896); the online talk setters carry no alive test (the alive tests at D:L84229-84231 and D:L84290 are under `DAT_0045a0c1 == 0`, offline); the menu's tick is outside the HUD tick's alive branch (D:L56689-56692). **Both readings kept** (see `VOICE_DEAD_TALK_READING`): W2-R-03 does not prove a dead actor reaches the tick, R2-AV reads that it does |
| C5 | CIRCLE held past 0.3 s puts the soldier in a talk stance | **no stance**: state 5 only sets the menu's byte and the talk flag; the soldier moves, aims and is drawn as usual. A tap under 0.3 s opens the command menu | R2-AV §1.9 strong; W2-R-03 agrees the number is no stance ID but leaves "may affect movement" open | holds at entry: D:L84278-84282 sets `+0x750 = 5` and the flag, nothing else. The exit passes `state == 5` as the third argument of `FUN_00597740` (D:L83941), which only guards a reset of the body's `+0xee0` when the mode changes to 0 -- and the mode is already 0, so it does nothing; how the menu panel is drawn in state 5 is not read |
| C6 | the round's cap 10 s, route B "refuses until release" | after a CIRCLE talk ends (release or 10 s) CIRCLE does neither talk nor open the menu for **1.3 s**; after an L2 talk for **1.0 s**; **a held lobby or L2 talk is cut at 10 s and resumes by itself at 20 s** if the floor is free (the flag is never cleared; route A clears it, so a CIRCLE talk does not resume) | R2-AV §1.10 strong | holds: route B at 10 s does nothing while held (D:L83904-83915: the release branch needs `cVar1 == 0`), the flag stays set, and state 4 is left only on a tick with the flag set (D:L211255-211263); the timer is `FUN_00236a50` (D:L84677-84690); the durations 1.0 and 0.3 are the operands the card read (`DAT_003dcb08`, `FUN_00235300`'s 0x3e99999a), not re-read as floats |
| C7 | the buttons: CIRCLE and L2 (the `Default` preset) | by preset: **Default, Reverse and Config4: CIRCLE and L2; Goldeneye: SQUARE, and no RUN AND TALK** (action 10 unbound) | R2-AV §1.7 proven; W2-R-02 (the same four presets from the disc: Goldeneye's TeamCommand on Square, SwapWeapon2 "unmapped in this data") | the disc table was not re-read here (no reader in this tree); two agents read it and agree |
| C8 | RUN AND TALK alone | **RUN AND TALK takes the configured SwapWeapon2 and suppresses its swap**, under every preset that binds it | W2-R-02 (cross-checked by W2-A) | `FUN_002351a0` reads action 10 (D:L83888-83925); `FUN_00594cf0` D:L453301-453310 is the swap's own test of the option, taken from W2-R |
| C9 | the indicator: the talk icon and arrow at the name tag, a `WhoIsTalking` object not read | adds: **a pulsing `hud_talk.tif` at the speaker, hidden past 900 units**; **no per-row talk mark in the game lobby** (rows are plain `"%s"` names); **online grant/release cues corrected 2026-10-21: direct headset PCM (section 5.4)** | R2-AV §1.11-§1.13 strong | `FUN_00211510` moves the marker to the channel owner's actor and hides it otherwise (D:L68061-68080); the distance test is at D:L68136-68158 (the 900.0 constant `DAT_003dc518` and the texture name are the card's). The lobby's bar and icon **stay** (R2-AV §1.12/§1.15 agree): `FUN_0027cbf0` still fills `[clan] name` (D:L125644-125689) |
| C10 | VOICE MODULATION: not read | **on by default**: the talker's character pitch offset and spectral factor (8 distinct blocks on the disc) set on his own encoder; **never in the game lobby** | R2-AV §1.14 strong, partial (the effect's sound not read) | the call sites: the lobby masks off (`FUN_0030e5a0(voice, 1)`, D:L125570) and the round start applies the option `DAT_003df1a8` (D:L55851-55854: argument `== 0`) -- read; the parameter source and the 8 blocks are the card's |
| C11 | game `+0xcc` read as "joined late" | it is the **late joiner** setting (the valve `late_joiner`): no lobby talk, the dead zone at the round's start, no talker bar | R2-AV §1.5 proven | the effects re-read (D:L55842-55849, D:L125653); the valve's name and the `VCButton` test not re-read |

**Where the two sources differ.** On no fact: W2-R-01 and R2-AV §1.1 agree on the numbers and W2-R-03 and R2-AV §1.9
on the menu state. They differ in reach: W2-R leaves the dead-talk question and "state 5 may affect movement" open,
R2-AV closes both ("strong"); W2-R reads the presets and the side predicate on its own, so R2-AV's "only the first
point independent" understates the overlap (C1, C2, C7 and C8 are in both). Nothing here is above a source reading
until a two-instance run (S8 of the card, owed) settles the open ones.

*2026-10-04, later:* the research wave's second agent (V7 #8, `V7-verify-round2-remaining.md`) confirms every R2-AV point behind C1-C11, the Goldeneye SQUARE talk button read live from the dumps included; the grade of those rows moves from "one agent" to "two agents". It adds: the game's respawn byte means allow-respawn AND game mode 5 (Harry62's label `BOOL_ForceGame` is wrong).

## The owner's four points against the original

Stated plainly, as the owner asked. "Confirmed" means the code of the original does it (a reading, §2-§5); where the
original is narrower or wider than the summary, the difference is listed beside it and reported to the owner (OT.R23:
"the original's own behaviour wins where it differs ... reported to the owner, not silently applied either way").

| the owner's point | against the original | the differences the original adds | where |
|---|---|---|---|
| **1. FULL lobby (all players)** | **CONFIRMED** for the **game lobby**: every player seated in it is on one channel (channel 9) and hears whoever holds that channel's floor (`FUN_0027c9f0` D:L125562; `FUN_002c2c20` D:L164422-164461; the receive check `FUN_0030f7e0` D:L211408) | (a) **spectators are on a channel of their own** (10): in the game lobby they hear spectators only, and the players do not hear them (`FUN_002c2c20` D:L164432-164435 with `FUN_002f6d00` D:L196203-196216, `JoinAsSpectator` `S:0x3f5730`); (b) **the briefing room has no voice**: voice exists only inside a game session, from the game lobby on (§1); (c) a **late joiner** waiting in the lobby cannot talk -- the CIRCLE caption is hidden and the press does nothing (§4.1); (d) a player in the **ARMORY** is switched off voice until he is back (§1) | §1, §3.2, §4.1 |
| **2. Match: team only, split by dead and alive** | **CONFIRMED**: a side's channels are its own (one side's are 0-3, the other's the same plus 4), and the dead are moved to their side's **dead zone** (channel 3, or 7), the HUD drawing `action_dead_zone.tif` for it [corrected 2026-10-04, C3: only in a game without respawn, and for a ghost; in a respawn game a dying player stays on his living channel until he returns, so there the living and the dead of a side hear each other]; a listener hears only a speaker on exactly his own channel, so **the dead hear only their own side's dead, the living never hear the dead, and the dead never hear the living** (`FUN_002c2c20`; `FUN_005e6e40` D:L497716-497737; `FUN_002393f0` D:L85892-85944 with `FUN_00239570` D:L85949-85984; `FUN_0030f7e0` D:L211408) | (a) the living of a side are further split by the radio's ACTIVE CHANNEL -- TEAM, OFFENSE, DEFENSE -- each with its own floor; (b) spectators have their own channel (10); (c) RADIO OFF takes a player off every channel (11); (d) a late joiner enters the round in the dead zone (§3); (e) [added 2026-10-04, C4] the dead may talk online | §3 |
| **3. Only one player was allowed to speak at a time** | **CONFIRMED, per channel**: the floor table has one entry per channel, owned by one client at a time; the game's host grants an entry only when it is free (`FUN_0030e8e0` D:L210896-210964) | the "one at a time" holds **on each channel, not across the game**: in a round the SEALs' TEAM channel, the Terrorists' TEAM channel, each side's OFFENSE and DEFENSE, each dead zone and the spectators' channel can each carry one speaker at once; in the lobby the players' channel and the spectators' each carry one. A hold lasts at most 10 s (§2.3) | §2 |
| **4. UI showing who was talking in the lobby (and perhaps in game)** | **CONFIRMED in both.** Lobby: the bar at the bottom left (`TalkerName`, UI variable `PLAYERTACOVAR`) shows the speaker's `[clan] name` beside the talk icon (`FUN_0027cbf0` D:L125653-125681). Round: the HUD's voice element shows the speaker's `[clan] name` and a channel-busy icon (`FUN_00238ac0` D:L85664-85722, `FUN_00239250` D:L85840-85887), and a talk icon with an arrow is drawn over the speaking teammate's name tag (`FUN_002269a0` D:L77348-77350, D:L77434-77443) | the speaker's own screen shows a "talking" icon, never his own name; a third in-round mark, a world object named `WhoIsTalking`, is moved to the speaker -- what it draws is not read [now read, C9: a pulsing `hud_talk.tif` within 900 units]; the game lobby's rows carry no talk mark of their own, the bar and its icon are the whole lobby indicator (C9) | §5 |

**What cannot be derived, and is a placeholder** (§10): how each indicator looks and moves on screen while someone
talks (no frame of a talker exists); the codec's sound in the browser (an owner's call: §6.2); and the network
library's framing of a voice packet. [2026-10-21: the former no-sound conclusion (C9) is corrected in section 5.4;
and there is no talk stance to look at (C5).]

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R170.1 | **Voice lives in the game session.** The voice object (`DAT_0045b718`, 0x10dc bytes, made at map load `FUN_002ad290` D:L152603-152609) is started when the client joins a game's DME session (`FUN_002b83e0` D:L158881-158882: `FUN_00310080(voice, 10000)`, channel 11) and stopped when it leaves (`FUN_002b8390` D:L158817-158819). The briefing room (`dlgMPBriefingRoom`) binds no voice button and has no voice widget | the lobby half is the **game lobby** (ONL-16a's screen), on the match server's game room (SVC-07a); no voice task touches the briefing room | §1 |
| R170.2 | **The floor is a table of 12 entries, one per channel**, each an owner (0x100 = free) and an expiry; the game's **host** (the session master, `DAT_0045a0c0`, set when the session's host index is mine, D:L158860-158874) grants type 1 only into a free entry, releases type 2 only if the owner matches, and broadcasts the whole table (message 0x40, 12 shorts) on every change (`FUN_0030e8e0`, `FUN_0030e7f0` D:L210846-210892) | the arbiter is the room on our match server (it is every game's host); one speaker per channel | §2.1 |
| R170.3 | **The timings**: a client re-asks every **1000 ms** while it holds the button without the floor (D:L211126, D:L211198); it records at most **10 000 ms** (`+0x30`, D:L211177) and then releases; the host expires an entry **15 000 ms** after granting it (`+0x34 = +0x30 + 5000`, `FUN_00310080` D:L211751-211753; the sweep D:L211271-211300); a client cut off (10 s, or the floor lost) waits a further **10 000 ms** before it can ask again (state 4, D:L211257-211265). The round's two talk buttons also stop at **10.0 s** of hold (`DAT_003dcb00`) [added 2026-10-04, C6: a held lobby or L2 talk resumes by itself at 20 s; CIRCLE is dead for 1.3 s after a round talk, 1.0 s after an L2 talk] | the 10 s cap of KNOWN is three caps, all derived; `VOICE_FLOOR_HOLD_READING`, `VOICE_FLOOR_RETRY_READING`, `VOICE_CUTOFF_LOCKOUT_READING` | §2.3 |
| R170.4 | **A second presser** gets no refusal message: his client keeps asking every second; his HUD shows `action_channel_busy.tif` (the "listen texture") while another holds his channel and for 1 s after; in the lobby he sees the speaker's name in the bar. Whoever asks first after the release gets the floor -- there is no queue | no "busy" message on the wire; the server ignores a request into a held entry | §2.2, §5 |
| R170.5 | **The channel map**: 0 TEAM, 1 and 2 the radio's other two settings (**1 DEFENSE, 2 OFFENSE** [corrected 2026-10-04, C1; the first reading here was 1 OFFENSE, 2 DEFENSE]), 3 the dead zone, each of those **plus 4 for the Terrorists** [corrected 2026-10-04, C2: SEALs 0-3, Terrorists 4-7, by side not by team word; the dead zone only without respawn, C3]; 9 the game lobby's players; 10 spectators (lobby and round); 11 radio off. Twelve channels, twelve floor entries (`FUN_002c2c20` D:L164422-164461; the HUD's icons `FUN_002393f0`) | `VOICE_CHANNEL_MAP_READING` and `VOICE_SIDE_BIT_READING`; the room computes each member's channel, never the client | §3 |
| R170.6 | **Hearing is exact channel equality**: a voice packet is played only if its sender's current channel equals the listener's, and only if the sender's slot is not muted (`FUN_0030f7e0` D:L211395-211449). **No distance enters**: `ProximityDistance` (`S:0x3fcd70`) is a projectile's parameter read with `Explosion_Radius` and `Blowback_End` (`FUN_003cedb0` D:L322714), not voice | in-round voice is not proximity-limited; SVC-20b's "proximity" unknown is retired | §3.3 |
| R170.7 | **The buttons**: in the game lobby CIRCLE, held -- `do_team_button_down` / `_up` call `VCButton(1T)` / `VCButton(0T)`, which sets and clears the talk flag (ELF 0x27e1c0-0x27e2a0). In the round, with the `Default` preset: **CIRCLE held past 0.3 s** (action 0x0b; a tap is the command menu) talks [corrected 2026-10-04, C5: there is no talk stance; "state 5" is the command menu's own state]; **L2 held** (action 0x0a) talks while moving when RUN AND TALK is ON, which takes the configured SwapWeapon2 and suppresses its swap [C8]; Goldeneye's talk button is SQUARE and it has no RUN AND TALK [C7] (`FUN_002359a0` D:L84278-84281, `FUN_002351a0` D:L83888-83925; the preset's slots read live by the desktop, the slot order of web research 116 §1) | `VOICE_ROUND_TALK_BUTTON_READING`; press-and-hold everywhere, never a toggle | §4 |
| R170.8 | **Who is talking, in the lobby**: the bottom-left icon (`notalk` `action_no_talk2.tif` / `talk` `action_ok_talk2.tif`) and the bar `TalkerName` (`PLAYERTACOVAR`), filled every pass of the lobby's wait loop by `CheckForcedLaunch` with `#C`-coloured `[clan] name` (`S:0x3ef310`) or the name alone, or a blank when no other player holds the floor | ONL-16b (proposed) draws them | §5.1 |
| R170.9 | **Who is talking, in the round**: the HUD's voice element (`FUN_00238f50` D:L85768-85835) -- the channel icon (`action_tune_team.tif`, `_offense`, `_defense`, `action_dead_zone.tif`, `action_tune_spectators.tif`; `action_no_talk2.tif` when the radio is off), a number beside it (`VOICE_CHANNEL_COUNT_READING`), the speaker's `[clan] name` (`S:0x3e6718`), and the talk / busy icon; over a speaking teammate's name tag the talk icon and `hud_arrow_off2.tif` (when `DISPLAY_MP_TEAM_NAMES` is on) | MATCH-05 (proposed) draws them | §5.2 |
| R170.10 | **Mute is per slot (24) and local**: the in-round command menu's TEAMMATES > a teammate > MUTE ON:OFF toggles it (`FUN_0022f4c0` D:L81402-81414, `FUN_0022f530` D:L81419-81439); a player on the listener's **ignore list is muted when he joins** the session (`FUN_002c5830` D:L166403-166406 with `FUN_003008e0` D:L202064-202086, the list `AddToIgnore` keeps, `FUN_00300c50` D:L202210-202243) | SVC-17's unknown "whether ignoring also mutes voice" is answered: yes, at the join; the lobby has no mute control | §5.3 |
| R170.11 | **No headset, no voice in either direction**: with the headset closed (`+0x38 == -1`) the tick asks for no floor and the receive path writes nothing (D:L211033-211036; `FUN_0030f6e0` D:L211357-211392) | in the browser the "headset" is the granted microphone; whether a player without one may still listen is an owner's call (H87) | §1, §6.4 |
| R170.12 | **The media**: capture 1 ch 16-bit 8000 Hz, playback 2 ch 8000 Hz (L = R), record gain 50 steered by the codec's level trend, playback volume `headset_controller` x 100 (0..100); 80 ms = 640 samples per read, encoded to 4 SASE frames of 8 bytes (32 bytes per 80 ms) | the browser path: `getUserMedia`, frames relayed by the match server's room under the floor and channel rules (recommended over peer to peer), the codec an owner's call with **8 kHz PCM as the default meanwhile** | §6 |
| R170.13 | **Placement**: originally proposed for sprint 17 after SVC-07a / ONL-16a; **superseded 2026-10-07** because sprint 17 closed before promotion. The full lobby + match slice (SVC-20a/b/c/21/22, ONL-16b, MATCH-05) is placed in **sprint 20**; the recomp reference remains proven-level evidence only | SPRINTS.md, OT.R23 / OT.R24; the source behaviour in this note is unchanged | §7 |

## 1. The voice object and when it is on (R170.1, R170.11)

- **Made once, at map load** (`FUN_002ad290` D:L152603-152609: 0x10dc bytes, `FUN_003102e0` D:L211817-211871 sets
  the formats: record 1 ch / 16 bit / 8000 Hz, playback 2 ch / 16 bit / 8000 Hz, `+0x10bc..+0x10d8`).
- **Started with the game session.** When the client joins a game's DME session (`FUN_002b83e0` D:L158829-158890),
  it notes whether it is the session's host (`DAT_0045a0c0 = 1` when the host index equals its own, D:L158860-158874),
  then starts the voice object with a 10 000 ms cap and sets channel 11, radio off (`FUN_00310080` D:L211720-211790,
  `FUN_0030fd90` D:L211603-211626). The start opens the headset (`FUN_0030fef0` D:L211663-211716) and binds the
  script variable `can_talk` (`S:0x3f6988`) to "I am recording" (`FUN_0030e710` D:L210800-210824). The session's two
  voice messages are registered when the session's handlers are (`FUN_00310210` D:L211794-211813: the floor request
  `FUN_0030e8e0` as "Radio" `S:0x3f6998`, the table broadcast as "Channel Status" `S:0x3f69a0`). This agrees with
  KNOWN's "the headset opens when an online game session starts (not in the lobby)": the "lobby" there is the
  briefing room; the game lobby is inside the session.
- **Stopped with it**: `FUN_002b8390` D:L158815-158824 closes the headset (`FUN_0030fe40` D:L211630-211659).
- **Off in the ARMORY.** `goto_eq_mp_set_return_valve` (the lobby's ARMORY row) calls `InitializeOnlineArmory`
  (`FUN_0027d8c0` D:L126094-126102): the talk flag cleared and the radio off (channel 11). Back in the lobby, its wait
  loop `check_loop` runs `SETMENUSTATE` (`FUN_0027c9f0` D:L125560-125590), which puts the player on channel 9 again.
- **No headset, no voice.** With the headset closed the tick only counts (`DAT_0045c290`, D:L211033-211036) and asks
  for nothing; a received packet goes through `FUN_0030f5f0` to `FUN_0030f6e0`, which returns at once on a closed
  handle (D:L211357-211392). A player without a headset neither talks nor hears.

## 2. The floor (point a)

### 2.1 One owner per channel, granted by the game's host (R170.2)

> **For the room (the review, 2026-10-05):** the original's host records the grant against the network library's
> sender (`param_3`, D:L210941) but takes a release from the message's own client byte (D:L210913), and request
> type 3 sets an owner with no check (D:L210934). Our room must take the speaker's identity from the CONNECTION, never
> from a byte in the message, and must never accept request types 3 or 4 from a client -- otherwise a modified page
> could release or seize another player's floor. A server-side rule (SVC-20a / SVC-20c), not a change to what the
> original's players see.

The table is twelve pairs at `voice+0x70`, `{owner, expiry}`, indexed **by channel** (`FUN_0030e790` D:L210828-210842
reads entry `voice+0x24`, the current channel). A request is three bytes `{client, channel, type}`, sent to the
session's host -- or handled in place when the client is the host or no host is known (`FUN_0030d560` = -1)
(D:L211108-211126). The host's handler (`FUN_0030e8e0` D:L210896-210964):

| type | who sends it | the host does |
|---|---|---|
| 1 request | a client pressing talk (state 1 -> 2) | if this client is the host (`DAT_0045a0c0`) and the channel's entry is free (0x100): owner = the sender, expiry = now + `voice+0x34`; broadcast the table |
| 2 release | a client letting go, cut off, or finding itself owner when not talking | if the host and the owner matches: the entry freed; broadcast |
| 3 set | (no sender found in the code read) | owner and expiry written without a check |
| 4 clear | -- | the entry freed, no broadcast |

The host also sweeps every tick: an entry past its expiry is freed and the table broadcast (D:L211271-211300); at
each round's start the host clears all twelve and broadcasts (`FUN_0030e7f0`, called at D:L55846 in the round's
start `FUN_001f6660`, and at D:L161017). A client learns it holds the floor when the broadcast table names it on its
channel (D:L211131-211143) -- it starts recording only then (state 2 -> 3, D:L211144-211179).

**On our server.** Every game is a match room on our match server (web research 159 R159.7: the room carries the
match), so the room is the host: it keeps the table, answers type 1 and 2, sweeps the expiry, clears at a round's
start, and sends the table to the members. A client is never the arbiter (research 169's premise).

### 2.2 What a second presser sees and hears (R170.4)

Nothing is sent back to refuse him: the host simply does not grant into a held entry. His client stays in state 2 and
re-asks every 1000 ms while he holds the button (D:L211186-211199). Meanwhile his HUD draws the channel-busy icon
`action_channel_busy.tif` -- the voice element's "listen texture" (`S:0x3e67b0`, slot `+0x80`, loaded at D:L85806) --
while another client holds his channel and for one second after (`FUN_00239250` D:L85850-85853: `DAT_004145f0 = now +
1.0`); in the game lobby the bar shows the holder's name (§5.1). When the holder releases, the next re-ask wins: there
is no queue, so with two waiting the first to re-ask after the release takes it. No separate busy cue was found in
this path. See §5.4 for the online grant/release cues and the retirement of `VOICE_TALK_SOUND_READING`.

### 2.3 How long a hold may last, and what releases it (R170.3)

> **Corrected 2026-10-04 (C4):** the dead can talk online (R2-AV §1.8 strong); the states named below are the command
> menu object's, not the player's (W2-R-03). The two sources differ on how far that is proved -- see C4 and
> `VOICE_DEAD_TALK_READING`. The review's text, kept:
>
> **Not established (the review, 2026-10-05):** that a DEAD player can talk. The only places that set the talk flag
> are route B (`FUN_002351a0` D:L83920, which needs player state `+0x750 == 4`), route A (`FUN_002359a0` D:L84281,
> reached from state 4 at D:L84416) and the lobby-gated `VCButton`; whether that controller runs while the player is
> dead is unread. The HEARING side (the dead hear only their side's dead) is read; the talking side is
> `VOICE_DEAD_TALK_READING` (§10).

- **The client's cap**: recording stops when `now > start + voice+0x30` (10 000 ms, the value `FUN_002b83e0` passes,
  D:L158881; the check D:L211217): the floor is released (type 2) and the client enters **state 4**, which
  waits another `voice+0x30` before returning to idle (D:L211257-211265). The state-4 exit is reached only on the
  "talk held" branch, so the wait ends at the first press after the 10 s (`VOICE_CUTOFF_LOCKOUT_READING`).
- **The host's expiry**: `voice+0x34 = voice+0x30 + 5000` = 15 000 ms (`FUN_00310080` D:L211751-211753): a floor whose
  holder vanished (a crash, a lost packet) is freed 15 s after the grant.
- **The buttons' own caps**: both round routes stop at 10.0 s of hold (`DAT_003dcb00`, a float read off the ELF):
  route B stops counting but leaves the talk flag set until the button is released (D:L83904-83915), route A's menu
  state 5 leaves at 10 s and clears the flag (`FUN_002360d0` case 5, D:L84418-84433). [Corrected 2026-10-04, C5/C6: it is
  no stance; and a flag that stays set resumes by itself -- the voice object's 10 s wait ends at 20 s, so a held L2
  talk or lobby talk cycles 10 s on, 10 s off while the floor is free; route A's clear stops that.] After a CIRCLE talk
  ends, CIRCLE does neither talk nor open the menu for 1.3 s (0.3 s set by `FUN_00235300` plus 1.0 s by its caller);
  after an L2 talk, 1.0 s (D:L83910, `FUN_00236a50` D:L84677-84690). The lobby's `VCButton` has no cap of its own; the voice object's 10 s
  applies there, with its 10 s wait.
- **The release**: letting go clears the talk flag; the next tick releases the floor (type 2), stops recording, drains
  the buffer and returns to idle (D:L211039-211103) -- no wait.
- **A channel change** drops the talk: setting a channel clears the talk flag (`FUN_0030e490` D:L210662-210688,
  `FUN_0030fcd0` D:L211574-211599), so dying (the move to the dead zone), RADIO OFF and the ARMORY each end a hold.
- **Leaving** the session closes the object (§1); the host's expiry frees the entry if the leaver held it.
- **Death** moves the player to the dead zone (§3.1): his hold ends; on the dead zone he may talk again to his side's
  dead. [Corrected 2026-10-04, C3: only without respawn or for a ghost -- that branch clears the flag and sends event
  0x22 (D:L454484-454490); in a respawn game nothing changes his channel or his flag.]

## 3. The channels (point b)

> **Two guards for SVC-20a's pure function (the review, 2026-10-05):** the dead check in `FUN_002c2c20` runs BEFORE the
> base-9 exemption, so "every lobby player is on 9" assumes no live-flagged actor in the lobby; and the side bit is
> combined with OR, not added (`FUN_0030fcd0` D:L211588) -- the same as +4 for bases 0-3, but 14 for a spectator whose
> team word matched, outside the 12-entry table: the function must refuse a channel above 11. `FUN_002c5450` D:L166304
> also asks base 0 when the local player's record is made (callers D:L158503, 160937, 160982).

### 3.1 The map (R170.5)

`FUN_002c2c20` (D:L164422-164461) turns a requested base channel into the one the player is put on:

1. if the player's in-world actor exists and its `+0xe1` bit 4 is clear, the base becomes **3** [2026-10-04, C3: this
   test runs only when something asks `FUN_002c2c20` -- in a respawn game nothing does at a death, so the base stays] (the dead zone; bit 4
   read as "alive" -- the same test gates the command menu's items, `FUN_0022f810` D:L81513-81530, and the HUD draws
   `action_dead_zone.tif` for base 3: `VOICE_DEAD_CHANNEL_READING`);
2. if the player is a spectator (`JoinAsSpectator`, or `DAT_004413d8`; `FUN_002f6d00`), the base becomes **10**;
3. unless the base is 9, **4 is added** when the player's team word equals the side constant (0x40000001 or
   0x80000100, picked by `DAT_004412d8`; `VOICE_SIDE_BIT_READING`) -- one side's channels are 0-3, the other's 4-7 [2026-10-04, C2: SEALs 0-3, Terrorists 4-7];
4. the channel is set in the voice object and in the network library (`FUN_0030fcd0`), the base kept at `voice+0x2c`.

Who asks for which base:

| base | asked by | cite |
|---|---|---|
| 9 | the game lobby, on entry and after every return (`SETMENUSTATE`) | `FUN_0027c9f0` D:L125562 |
| 0 | the round's start (a player who did not join late), then the floor cleared | `FUN_001f6660` D:L55842-55846 |
| 3 | the round's start for a late joiner (game `+0xcc` set; `VOICE_LATE_JOINER_READING`) | D:L55848-55849 |
| 0, 1, 2 | the radio's ACTIVE CHANNEL (TEAM, then the other two), kept in the player's `+0xc4` | `FUN_0022f950` D:L81578-81592; `FUN_005e6e40` D:L497716-497726 |
| 3 | the player's event 0x22 (his death; C3: sent only without respawn or for a ghost) | D:L497729-497730 |
| `+0xc4` | the event 0x23 (read as a return to life): the remembered choice, unless game `+0xd2` keeps him at 3 | D:L497732-497737 |
| 0 or 10 | RADIO ON (10 for a spectator) | `FUN_0022f880` D:L81534-81553 |
| 11 | RADIO OFF, the ARMORY, the session's start | `FUN_0030e490`; `FUN_0027d8c0`; D:L158882 |

The HUD's channel icon follows the base (`FUN_002393f0` D:L85892-85944): 0 `action_tune_team.tif`, 1
`action_tune_defense.tif`, 2 `action_tune_offense.tif`, 3 `action_dead_zone.tif`, 10 `action_tune_spectators.tif`,
radio off `action_no_talk2.tif` (the textures `S:0x3e67c0`-`0x3e6860`, loaded by `FUN_00239570` D:L85949-85984). The
command menu's strings list TEAM, OFFENSE, DEFENSE in that order (`S:0x3e61c0`, `0x3e61f0`, `0x3e6220`), while the
icon draws DEFENSE for 1 and OFFENSE for 2. [Read 2026-10-04, C1: the menu's rows send TEAM 0, OFFENSE 2, DEFENSE 1,
so the menu and the icons agree; the first draft's guess (1 OFFENSE) was wrong.]

### 3.2 Who hears whom (R170.6)

| the listener | hears | does not hear |
|---|---|---|
| a game-lobby player (9) | the lobby's other players | spectators (10) |
| a game-lobby spectator (10) | spectators | the players (9) |
| a living player on TEAM (0, or 4) | his side's living on TEAM | the other side; his side on OFFENSE or DEFENSE; the dead; spectators |
| a living player on OFFENSE or DEFENSE | his side's living on the same setting | everyone else |
| a dead player (3, or 7; **only without respawn** -- in a respawn game he stays on his living channel, C3) | his side's dead | the living (either side); the other side's dead; spectators |
| a spectator in the round (10) | spectators | every player, living or dead |
| radio off (11) | nobody | everybody (and he cannot talk: `FUN_0030e6e0` refuses the talk flag on 11, D:L210785-210796) |

The owner's "split by dead and alive" is the original's rule **without respawn**, and stricter than "the dead hear the
living": they do not. With respawn the split does not exist (C3). A spectator in the lobby is not part of the "full lobby" (point 1's difference (a)).

### 3.3 No proximity, and the side's sub-channels (R170.6)

The receive check (`FUN_0030f7e0` D:L211395-211449) asks the network library for the sender's current channel and
compares it with the listener's (D:L211408), then the sender's slot mute (D:L211411-211415); it has no position, no
distance and no team test beyond the channel. `ProximityDistance` is a projectile parameter (§0, R170.6). The valve
`mp_radio_channel_valve` (V17) is the command menu's; its users were not re-read here beyond `FUN_0022f950`.

## 4. The input (point c)

### 4.1 The game lobby: CIRCLE, held

`dlgGameLobby` binds CIRCLE three times (`tools/dump-online-dialogs.ts --dialog dlgGameLobby.rdr`): `do_team_button_down`
(`VCButton(1T)`), `do_team_button_up` (`VCButton(0T)`, then `ChatIconReset`) and `do_circle_button_down` (the talk
icon if `can_talk` is 1, else the no-talk icon). The binding kind of each (press or release) is not printed by the dump;
the names read as press and release (`VOICE_LOBBY_BUTTON_EDGE_READING`; [proven 2026-10-04, R2-AV §1.6: CIRCLE FALLING is `do_team_button_down`, RISING is `_up`, and DOWN runs `do_circle_button_down` every held frame, so the icon follows `can_talk`]). Two more animations, `do_opponent_button_down`
/ `_up` (`VCButton(1P)` / `(0P)`), are bound to nothing. The decompilation has no function at `VCButton`'s address;
its instructions (ELF 0x27e1c0-0x27e2a0, disassembled): when the game state `DAT_00437ce8` exists and its `+0xcc` is
clear, the argument's first character `'1'` sets the talk flag (if not already set) and `'0'` clears it; **the second
character (T or P) is not read**, so "team" and "opponent" are one button -- the channel decides who hears. `+0xcc`
also guards `CheckForcedLaunch`'s name bar (D:L125653) and puts a player on the dead zone at the round's start
(D:L55842-55849): read as the late-joiner state [confirmed 2026-10-04, C11: the `late_joiner` valve], and `SetupLateJoiner` hides the `InfoTextCT` caption ("CIRCLE VOICE CHAT
ALL", `_338_VoiceChatAll_MSG`) for it (`VOICE_LATE_JOINER_READING`).

### 4.2 The round: CIRCLE held past 0.3 s, or L2 with RUN AND TALK

Both routes read the pad through the loaded controller preset's action table (`FUN_002c64e0` D:L166917-166931: the
slot at `preset+0x12+action`, then the pad object's state byte at `+1+slot`; 0x10 = unbound). The desktop read the
`Default` preset live: action 0x0a -> slot 0x0d, action 0x0b -> slot 0x07
(`desktop@be557831:docs/research/66-chat-step-rounds.md:92`). The pad object is the one the menus read
(`DAT_0044f108`), whose slot order is web research 116 §1's (`PAD_SLOTS`: 7 CIRCLE, 13 TRIGGER_L2). So, with the
`Default` preset:

- **Route A, CIRCLE** (action 0x0b, `FUN_002359a0` D:L84196-84303): online, held past `DAT_003dcaf8` = 0.3 s, it puts
  the command menu object in state 5 and sets the talk flag (D:L84278-84281); in state 5 it is cleared at 10 s
  or on release (`FUN_002360d0` D:L84418-84433). [Corrected 2026-10-04, C5: state 5 is the menu's "talking" state, not a
  stance of the soldier; and C6: for 1.3 s after it ends CIRCLE does neither talk nor open the menu.] Offline the same hold leads elsewhere, after its own
  timer (D:L84268-84276); a tap ends in `FUN_00235440` in either (the release branch, D:L84284-84300), read as the
  command menu -- web research 101 A41 calls CIRCLE the TeamCommand button; not re-read here. [Whether a stance stops the soldier: none exists, C5.]
- **Route B, L2** (action 0x0a, `FUN_002351a0` D:L83888-83925): only with the START menu's **RUN AND TALK: ON**
  (`DAT_0044d4f8`, `S:0x3e3c20`; segment 07's T2), online, in the ordinary state 4: held, it talks without the stance,
  up to 10 s.

Both are press-and-hold. Another preset binds other buttons (the table is the preset's: `VOICE_ROUND_TALK_BUTTON_READING`).
[Read 2026-10-04, C7: from the disc's `controller.rdr`, Default, Reverse and Config4 are CIRCLE (action 11, TeamCommand)
and L2 (action 10, SwapWeapon2); Goldeneye is SQUARE and its action 10 is unbound, so RUN AND TALK cannot talk there.
RUN AND TALK is off until a profile sets it (`DAT_0044d4f8` is in .bss). C8: with it ON, action 10 talks and its weapon
swap is suppressed; with it OFF, action 10 swaps and nothing talks. The page's talk input must resolve through the
selected preset and arbitrate the two, never bind L2 or CIRCLE alone.]

### 4.3 The page's keys: a browser adaptation, labelled

The original has no keyboard in a round. In the menus the page's CIRCLE is **R** (`menuInput.ts`, PLAT-11's
`MENU_KEYS_READING`), so the lobby's hold-to-talk is R held, with nothing new. In the round R reloads and the page has no
CIRCLE key; the talk key is an owner's call (H87, `VOICE_TALK_KEY_PLACEHOLDER`; *default*: **V held**, unused in the
round's keyboard map, `controlsList.ts`), and a gamepad keeps the original's talk buttons by preset (C7). Touch: a held
on-screen button beside the existing controls, labelled as the page's. None of these changes what the game does with
the talk flag.

## 5. The UI (point d)

### 5.1 The game lobby (R170.8)

The layout (`dlgGameLobby.rdr`): `IMAGE talk` (`action_ok_talk2.tif`), `IMAGE notalk` (`action_no_talk2.tif`), `IMAGE
Talker_back` (`backsolid.tif`), `WRAPPEDTEXT TalkerName` on `PLAYERTACOVAR`, and the caption `InfoTextCT`. In
`A_54_gamelobby2.png` and `A_17_game_lobby_ok.png` they are the box at the bottom left (the no-talk icon) and the empty
bar beside it, with "CIRCLE VOICE CHAT ALL" at the bottom right -- nobody talking. The bar is written by
`CheckForcedLaunch` (`FUN_0027cbf0` D:L125644-125789), which the wait loop `check_loop` calls until the match starts:
when another client holds the listener's channel, the holder's name (`FUN_002c3a70`) and clan (`FUN_002c3ac0`) go in
as `#C`-coloured `[clan] name` (`S:0x3ef310`) or the name (`S:0x3eebc8`); otherwise a single space (`S:0x3ef338`).
The icon is set by the press animations (§4.1) and reset on release. The player rows carry the ready dot and the star
(segment 05's N13) and no voice mark: no per-row talk widget exists in the layout (`VOICE_ROW_MARK_READING`: the row
strings' glyphs not decoded [resolved 2026-10-04, C9: the three lists are built with the format `"%s"` from the slots'
`PLAYERNAMEVAR` (`FUN_002c4b50` D:L165914-165972), no glyph is prefixed]). The bar and the icon are therefore the
game lobby's only talk indicator, and the icon shows "talking" only while the player records (R2-AV §1.15).

### 5.2 The round (R170.9)

> **The name-tag icon's limits (the review, 2026-10-05):** `FUN_002269a0` draws tags only for actors that pass
> `FUN_00548050 < 5.0` (D:L77376-77380), share the team mask and lack flag 0x20000 (D:L77404-77405), and are on screen;
> the talk icon and arrow (D:L77434-77443) attach only to a tag that was drawn -- a speaking teammate out of that range
> or off screen gets no arrow. MATCH-05's acceptance holds within those limits.

- **The HUD's voice element** (made by `FUN_00238f50` D:L85768-85835, ticked by `FUN_00238ac0` D:L85664-85722):
  the channel icon (§3.1); a number from `voice+0x5c` (`%d`, `?` outside 0..99), which the tick fills from the network
  library's per-channel query (`FUN_00623ae8`, D:L211004) -- both frames of `s11_r0004_round1` show **1** beside the
  TEAM icon with each player alone on his side, read as the channel's member count, not established
  (`VOICE_CHANNEL_COUNT_READING`); the speaker's `[clan] name` (`S:0x3e6718`) while another holds the channel, hidden
  otherwise; the talk icon `action_ok_talk2.tif` while the player records, the busy icon `action_channel_busy.tif` while
  another holds and 1 s after (`FUN_00239250`).
- **Over the speaker's name tag**: the team name tags (`FUN_002269a0` D:L77307-77460, up to 8, shown with
  `DISPLAY_MP_TEAM_NAMES` `S:0x3e5540`) draw the talk icon and the arrow `hud_arrow_off2.tif` above the tag of the
  player who holds the listener's channel (D:L77348-77350, D:L77434-77443; the sprites loaded by `FUN_00227340`
  D:L77547-77556).
- **A world marker**: the game makes an object named `WhoIsTalking` at map load (`FUN_002ac410` D:L152143-152149,
  `FUN_002a28f0` D:L146865-146909) and, each frame, moves it to the holder's actor and shows it, or hides it
  (`FUN_00211510` D:L68061-68080). What it draws is not read (`VOICE_WHO_IS_TALKING_MARKER_PLACEHOLDER`). [Read 2026-10-04, C9: a HUD marker record of type 9
whose texture is `hud_talk.tif`, shown at the speaker's position while another client owns the listener's channel and
his actor is known, pulsing (alpha 64-128, believed) and hidden beyond 900 units online (`FUN_00211510`, D:L68061-68080,
D:L68136-68158). It is a second indicator beside the name tag's icon and arrow, not the same one.]
- No voice widget exists in the round or final screens (`dlgMultiplayerRound`, `dlgMultiplayerFinal*`) or the
  scoreboard (ONL-19's note: drawn in code from name, score, kills and deaths).

### 5.3 Mute (R170.10)

One byte per player slot (24) at `voice+0x10a4` (`FUN_0030e550` / `FUN_0030e580` D:L210699-210724); a muted sender's
packets are dropped by the receiver (D:L211411-211415) -- a local mute, nothing is sent. Where: the in-round command
menu, TEAMMATES > a teammate (a living teammate of the same side, `FUN_0022f5b0` D:L81444-81472 [corrected 2026-10-08,
MATCH-05's review: no life test -- the function's `FUN_002c2fd0` is the spectator test, the team record's 0x10000,
D:L164609-164643, so a dead teammate stays listed; research 227 §2.4]) > MUTE ON:OFF
(`FUN_0022f4c0`, `FUN_0022f530`; strings `S:0x3e5cf0`, `0x3e5cf8`). At a player's join the slot is set from the
listener's ignore list (`FUN_002c5830` D:L166403-166406); the team rule's handler clears it on another message
(`FUN_002bc620` D:L161230). The game lobby has no mute control.

### 5.4 Sounds

**Corrected 2026-10-21:** the earlier C9 / `VOICE_TALK_SOUND_READING` conclusion of no sound missed direct headset
PCM playback. The no-sound statements elsewhere in the historical summary above are superseded by this section.

The original online voice tick attempts a cue when the held request receives the local channel's floor:
`FUN_0030ec10` (D:L211145-L211162) expands bytes 0..1999 of the embedded table at `0x003df540` into the high byte
of signed 16-bit samples. Release (D:L211082-L211099), and loss/timeout (D:L211216-L211241), use bytes 2000..1 in
reverse. `FUN_0030f5f0` (D:L211310-L211352) duplicates samples into left/right, and `FUN_0030f6e0`
(D:L211357-L211390) writes them to the headset. `FUN_003102e0` (D:L211839, D:L211846-L211854) supplies the table
and output format: 8,000 Hz, 16-bit stereo, 2,000 frames / 0.25 seconds. These are conditional playback attempts,
not a recording of hardware output; no separate busy cue was found in this path. Source reading independently
re-read during the ISO investigation; matching the exported samples by ear to the remembered beep remains open.

**A separate offline cue:** held Circle calls `FUN_00235440` (D:L84268-L84276), which calls `FUN_00235560`, ending
in `FUN_00232890(menu+0xdb8,1)` (D:L83998-L84009, D:L84068). Selector 1 chooses the sound pointer at +0xc
(D:L83160-L83182); initialization loads the ELF string at `0x3e5dc0`, `.TCM_SELECT`, there (D:L83201-L83213).
This is HUDUI's command-menu selection sound in `RUN/SOUNDS/BNKSTORE.ZAR`, not the online PCM table. The same
initializer maps selector 0 to `.TCM_SLIDE`, and 2 to `.TCM_SELECT`. The cue precedes the pending recognition
request (`FUN_0023b110`, D:L86844-L86853); it signals menu entry, not successful capture. Independently re-read.

**Requested implementation, 2026-10-21:** after listening, Chris selected `.TCM_SELECT` as the mic sound and
requested a separate implementation branch/PR (#431). *Finished 2026-10-22 (the online seat, on the owner's word in the
merge controller's seat: "I'd like us to take over and finish each sequentually starting with https://github.com/Scotho/redotcom/pull/432, https://github.com/Scotho/redotcom/pull/431 (BENNYS), ... finish the original intent with our validation and standards applied"):* `VOICE_TALK_CUE_ADAPTATION` (was `VOICE_TALK_CUE_PLACEHOLDER`) uses
that disc sound for the online talk grant -- an adaptation on the owner's word, not the original's online sound. The
original's own cue cannot be played from a player's disc: the table at 0x003df540 lies in the segment based at
0x1e7000, which the retail loader `SCUS_972.75` carries with file size 0 (memory 0x2ce380) and fills at run time from
its encrypted overlays (the desktop decrypts them to build `socom2_game.elf`, where the address is file offset
0x2ceb40; `desktop@be557831:docs/DEVELOPING.md:17`: "the game is two Metrowerks overlays that the loader decrypts"), and the
page's disc access has no overlay decrypter -- `VOICE_TALK_PCM_PLACEHOLDER` (note only), HUMAN_TASKS H270. The original
release cue (the same bytes reversed) is not played.

The shared `voiceClient` calls a local cue callback once on the transition to held talk, a running capture, a sent
floor request, and a grant naming the local client. Permission waiting, a busy channel, a refused/disabled mic,
listening to others, and release do not play it. Repeated floor messages/frames do not retrigger; release, floor
loss, channel change, connection replacement and disposal reset the edge. A callback failure cannot interrupt
voice. The lobby and both match pages play the cue through their existing disc sound bank: no extracted audio
is checked in, no cue packet is sent, and no extra audio is mixed into the capture pipeline. Browser speakers can
still be picked up acoustically by a physical microphone. HEADSET VOLUME scales the cue in addition to the normal
SFX/master mix; no pitch, duration or movement changes. The Forge's separate voice UI is outside this wiring.

Validation is recorded in `docs/plans/2026-10-21-mic-tcm-select.md`. Original-console audio comparison remains
distinct from the automated client tests; since the finish of 2026-10-22 the choice is an adaptation on the owner's word
(`VOICE_TALK_CUE_ADAPTATION`), and the original's cue is `VOICE_TALK_PCM_PLACEHOLDER`'s (LATER 271).

## 6. The media (point e)

### 6.1 What the original carries (R170.12)

- **Capture**: 1 ch, 16-bit, 8000 Hz; read 0x500 bytes = 640 samples = **80 ms** at a time, encoded to 4 SASE frames
  of 8 bytes, 32 bytes per message, codec mode 1 (`FUN_0030f990` D:L211453-211550;
  `desktop@be557831:docs/research/56-sase-codec.md:326`). The codec's VAD is computed and ignored: push-to-talk gates.
- **Record gain**: starts at 50 (`+0x3c`, D:L211749), and every fifth 80-ms pass moves 5 up or down within 20..100 by
  the sign of the codec's level trend (`FUN_003103d0`, D:L211500-211521): the original's AGC
  (`VOICE_RECORD_GAIN_STEER_READING`: the trend is the codec's own arithmetic).
- **Playback**: decoded 160 samples per 8-byte frame, each sample written to L and R, to the headset (never 989snd);
  volume `headset_controller` x 100 clamped to 0..100 (`FUN_0030fef0` D:L211697-211704; the UI variable's default 0.75,
  web research 104 R104.10), else 60.
- **The wire**: the game hands the DME network library two callbacks and the formats (`FUN_0030fc70`
  D:L211554-211570); the library calls them and carries the payload in the game session. Its framing (headers,
  sequencing, which peers) is not read (`VOICE_WIRE_FRAMING_PLACEHOLDER`).

### 6.2 The codec: an owner's call, with a default (OC-6's second half)

> **Ruled 2026-10-05 (OT.R24):** the owner, "cut it tenfold, or more - low quality is actually more authentic.. can
> consider even lower to start actually." -- Opus narrowband, mono, 8 kHz audio, **6 kbit/s to start**
> (`VOICE_BITRATE_OWNER`, tuned by ear), a labelled browser adaptation; the table below is the choice as it stood.
> The original sent 3.2 kbit/s (4 SASE frames of 8 bytes per 80 ms, §6.1); Opus cannot go under 6 kbit/s, so a lower
> rate needs another codec (a SASE port, option (c); or a 2.4 kbit/s speech codec) -- the owner's, if 6 sounds too clean.

The owner's words answer "browser voice now" and not the codec. The options:

| option | sound | cost | licence |
|---|---|---|---|
| (a) **8 kHz 16-bit PCM**, the original's capture and playback format, uncompressed | the original's band, no codec colour | 1280 bytes per 80 ms (128 kbit/s) per talker; one talker per channel, at most 12 at once | none |
| (b) **Opus** in the browser (WebCodecs, or WebRTC's), narrowband 8 kHz, 20 ms frames | close in band, a different codec's colour | small (~8-16 kbit/s); browser-native | open (BSD) |
| (c) **SASE**: the recompiled 237 functions built to WASM | the original's, frame for frame (SVC-21's acceptance (1)) | L: the build and a frame-dump harness | the game's code shipped to every visitor: the owner's, and likely not ours to ship |

**Recommendation**: (b) Opus narrowband, labelled as a browser adaptation, with (c) kept as the proven level only if
the licence is ever cleared. **Default meanwhile**: (a) -- the transport, the floor and the UI are built and tested on
the original's own PCM format, so no codec is chosen in the owner's place, and the codec is one swap at the end
(`VOICE_CODEC_PLACEHOLDER`). The 4096-byte frame cap and the 120 binary frames a second of the socket (research 169
§2.1) fit (a) at 12.5 frames a second.

### 6.3 Who carries the audio: the match server's room (recommended)

| | relayed by the room (SVC-20b's proposal) | WebRTC peer to peer |
|---|---|---|
| floor and channels | enforced where they are decided: the room drops a frame from a client that does not hold the floor of its channel, and sends it only to members on that channel | each client must be trusted to send only to the right peers, or the server signals per pair and still cannot stop a frame |
| the dead and the living, the sides | the room knows who is dead and on which side (it runs the round) | a modified page sends to anyone it has a connection to |
| addresses | players see only the server | players learn each other's IP addresses |
| reach | the socket every player already has | needs STUN and, behind many NATs, a TURN server (a relay anyway) |
| latency | one more hop; TCP head-of-line on a lost packet | lowest when direct |

**Recommendation**: the room relays, over the match socket (binary frames of 80 ms, the original's cadence), the floor
and the channel map checked on every frame server-side. Latency: 80 ms of capture plus the network; acceptable for
push-to-talk (the original buffered 80 ms too). If jitter on TCP proves a problem, WebRTC **to the server** (a
media relay the room controls) is the later option, with the same server-side rules; never peer to peer.

### 6.4 The browser's part (labelled adaptations)

- **The microphone permission.** The browser's prompt is the browser's; its wording cannot be changed. The page asks
  for the microphone at the player's first talk press (never on load), after one line of its own explaining why
  (`VOICE_MIC_NOTICE_PLACEHOLDER`; the line's wording is the owner's, H87). A refusal is "no headset" (§1).
- **No microphone, listening.** The original: no headset, no voice either way. In a browser every player has an
  output. The owner's call (H87): *default* the original's -- voice in and out only once the microphone is granted;
  recommended: listening without a microphone allowed, labelled.
- **Echo, noise, gain.** The original's headset needed no echo cancellation. `getUserMedia` with `echoCancellation`
  on (a player on speakers would otherwise feed the room), `noiseSuppression` off, and `autoGainControl` on as the
  stand-in for the codec-driven gain steer (§6.1) -- all labelled; capture resampled to 8000 Hz mono.
- **Playback**: one output; voice mixed at HEADSET VOLUME (OPT-10's slider, `headset_controller`), outside the game's
  989snd mix as the original's was.
- **VOICE MODULATION** (`VoiceMask`, `FUN_0030e5a0` D:L210728-210767) changes the codec object's parameters; what it
  does to the sound is not read (`VOICE_MODULATION_PLACEHOLDER`, SVC-22's). [Read in part 2026-10-04, C10: the START menu's
VOICE MODULATION is **on by default**; it applies the talker's character `VoiceFont` -- pitch offset and spectral
factor, 8 distinct blocks on the disc, robot and whisper never used -- to his own encoder, so a listener hears what the
talker's console encoded; **never in the game lobby**. What the numbers do to the sound is inside the codec's setters
and is not read; in the browser an approximation is the owner's call, labelled (SVC-22).]

### 6.5 What voice exposes (research 169)

- **A microphone in the page**: the stream is opened only on a talk press and only frames under the player's own held
  button leave the page; the page must stop the track when the session ends, and never record or store audio. The
  server keeps no audio (a relay, not a recorder): *default*; any recording or moderation of voice is the owner's.
- **The relay as a load** (corrected by the review, 2026-10-05: the first figure was ten times too high and put
  players and spectators on one channel, which §3.1 rules out): PCM is 1280 B per 80 ms, 16 kB/s (128 kbit/s) a
  stream -- per client 128 kbit/s up while talking and down while listening; one lobby talker to 15 listeners is
  240 kB/s (about 1.9 Mbit/s) out of the server; since each listener hears at most one stream, a room sends at most
  members x 16 kB/s -- 256 kB/s (about 2 Mbit/s) for 16 players, 768 kB/s (about 6 Mbit/s) with 32 spectators added.
  A frame of 1280 B fits the 4096 B frame cap and 12.5 frames a second is far under 120. Workable for a few rooms;
  about ten times heavier than Opus narrowband (the codec call, H87); research 169's unbounded send backlog (§2.1, §6.7) grows faster with
  voice. A per-connection voice rate (12.5 frames a second, the floor held) is a server check.
- **Abuse**: a held floor blocks a channel for at most 15 s at a time (the host's expiry) and then 10 s off; the mute
  is local. Spam of floor requests is bounded by the socket's rate limit. Offensive speech has no filter in the
  original; any filter, report or ban for voice is the owner's (SVC-23).
- **What the channel rule closes and what it cannot**: the dead cannot tell the living through the game's voice (the
  room enforces it), but a voice call outside the game (research 169's "ghosting", A2) is not ours to stop.

## 7. Where it lives in the push (point f)

### 7.1 The tasks, re-cut and added

Re-cut in place in `../roadmap/06-online-services.md` (each with a dated line; sizes and the graph's dependency ids
kept, so SPRINTS.md and the README stay as they are until the controller places them):

| task | after OT-14 | size |
|---|---|---|
| **SVC-20a** | the floor table **and the channel map** as pure functions on the room's side, unit-tested against the cites of §2-§3; the room as the host | M |
| **SVC-20b** | the browser transport: the microphone (§6.4), the room's relay under SVC-20a's rules, playback; **the cannot-pass gate on the recomp's Q5 lifted** (OT.R23); first over the game lobby's channels (9, 10); the recomp's two-instance reference kept as the proven level, owed | L |
| **SVC-21** | the codec: the owner's call (§6.2), *default* PCM; (c) SASE the proven level if ever licensed | L (for (c); (a) or (b) is far smaller -- the controller re-sizes when the call is made) |
| **SVC-22** | the headset UX: the permission flow and its notice, the talk keys (§4.3) by preset (C7), RUN AND TALK taking SwapWeapon2 (C8), HEADSET VOLUME, VOICE MODULATION (default ON, round only, C10) | M |

Added, as proposed blocks (`####`, outside the graph until the controller places them in SPRINTS.md):

| task | file | what | size | depends on |
|---|---|---|---|---|
| **SVC-20c** | 06 | the round's voice on the room: the side bit, the dead zone and its events, spectators, the ACTIVE CHANNEL and RADIO ON/OFF, the late joiner, the floor cleared at a round's start, the mute slots seeded from the ignore list | M | SVC-20a, SVC-20b, SVC-07a |
| **ONL-16b** | 05 | the game lobby's voice UI: the talk / no-talk icon, the `TalkerName` bar, the caption and its late-joiner rule, CIRCLE held -> `VCButton` | S | ONL-16a, SVC-20b, SVC-22 |
| **MATCH-05** | 07 | the round's voice UI: the HUD element (channel icon, count, speaker, talk / busy), the name-tag icon and arrow, the `WhoIsTalking` marker, the command menu's RADIO and TEAMMATES > MUTE rows | M | SVC-20c, SVC-22 |

The owner's "lobby" task is SVC-20a + SVC-20b + SVC-22 + ONL-16b; his "match" task is SVC-20c + MATCH-05.

### 7.2 Proposed placement (SPRINTS.md is the controller's)

- **Sprint 17** (the OT.R16 push), two voice waves after the lobby (ONL-16a) and the bridge (SVC-07a, sprint 16):
  - **lobby voice**: SVC-20a (from sprint 22), SVC-20b and SVC-22 (from sprint 20), ONL-16b (new) -- 3 + 7 + 3 + 1
    = 14 points; the demonstration: two browsers in a game lobby, one holding R, the other hearing him and seeing his
    name in the bar; a third pressing meanwhile is not heard;
  - **match voice**: SVC-20c and MATCH-05 (new) -- 6 points; the demonstration: in the round a SEAL heard by SEALs
    only, a dead SEAL by the dead SEALs only, the HUD naming the speaker.
  The seat of the match half is a question: OT.R7 gives Craig's lane the work up to the match's start, and OT.R23
  puts match voice in the push -- H87 asks it.
- **Sprint 20** -- kept, renamed "Voice: the original's codec and the recomp's reference", holding **SVC-21** alone
  (conditional on the codec call) and the proven level of the voice tasks (the two-instance recomp run, once Q5
  sends voice). Its "cannot-pass" gate no longer holds the build back.
- **Sprint 22** loses SVC-20a; ONL-16 keeps its chat, its voice moved to ONL-16b (its Dependencies swap SVC-20a for
  ONL-16b when the controller promotes the slice).
- **Needs first**: SVC-07a's session and game room (the room is the host; the hello's `game` and `ticket` name the
  member), ONL-16a's lobby screen (ONL-16b draws in it), PLAT-11's input layer (the held key), OPT-10's headset slider
  (SVC-22; HEADSET VOLUME may stand at its default 0.75 until then).

## 8. The owner's calls (HUMAN_TASKS H87)

| call | the question | recommendation | *default meanwhile* |
|---|---|---|---|
| VOICE-CODEC | (a) PCM, (b) Opus narrowband, (c) SASE (licence) | (b), labelled; (c) only if licensed | (a) 8 kHz PCM |
| VOICE-MIC-NOTICE | the page's one line before the browser's prompt | short, plain: what is sent, when, to whom | `VOICE_MIC_NOTICE_PLACEHOLDER`, a stated placeholder line |
| VOICE-LISTEN-ONLY | may a player without a microphone hear voice | yes, labelled | no (the original: no headset, no voice) |
| VOICE-TRANSPORT | relay by the room, or WebRTC | the room relays (§6.3) | the room relays |
| VOICE-KEY | the round's keyboard talk key | V held | V held; R in the menus (CIRCLE) |
| VOICE-DIFFERENCES | the original's rules where they differ from the summary: spectators apart, one floor per channel, no voice in the briefing room or the ARMORY, late joiners silent in the lobby, the 10 s cap and its 10 s wait | keep the original's | the original's |
| VOICE-LOBBY-UI (added 2026-10-04) | the original's lobby has the bar and the icon but no mark on the player rows (C9); keep a talker UI beyond that? | the original's bar and icon only (OT.R27) | the original's bar and icon, plus a per-row mark marked as ours, until the owner says |
| VOICE-SEAT | who builds the match half (OT.R7 stops at the start) | with the lobby half, one lane | Craig's lane, as part of the push (OT.R23) |
| VOICE-MODERATION | recording, filtering, reporting voice | none beyond the original's mute | none |

## 9. What this note corrects

- `desktop@be557831:docs/research/39-headset-talk-button.md:119` calls the HUD's `+0x80` texture "no talk": its name
  is the **"listen texture"** (`S:0x3e67b0`) and the file is `action_channel_busy.tif` (D:L85806) -- the busy icon,
  drawn while another player holds the channel.
- The same note's KNOWN row (`desktop@be557831:docs/KNOWN.md:171`) leaves "which physical button slot 0x0d / 0x07 is"
  open: with the pad object's slot order (web research 116 §1) 0x07 is CIRCLE and 0x0d is L2 (§4.2), a reading.
- Segment 06's V16 reads "12 entries" without their key: the entries are **indexed by channel** (one floor per
  channel), and channel 11 is radio off (0xb).
- SVC-20b's unknown "proximity (`ProximityDistance`)": not voice (R170.6).
- SVC-17's unknown "whether ignoring also mutes voice": yes, at the join (R170.10).
- SVC-22's unknown "what the icon, bar, red dot and star mean": the icon and bar are the voice indicators (§5.1); the
  dot and the star are the rows' ready dot and star (segment 05's N13), not voice.

- Everything C1-C11 above, in the order of the research waves' findings; this note's first text is kept in place with
  a bracket at each point.

## 10. Placeholders and readings

No code was written with this note, so it added no constant. The stand-ins the build needs are named here so that the
task that writes one finds its row; each is *note only* until a task writes it, and its status cell then names the
file (sprint 20, from 2026-10-08: V-WIRE's two rows first).

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `VOICE_FLOOR_HOLD_READING` | 10 000 ms recording, 15 000 ms host expiry | `voice+0x30` / `+0x34` (D:L158881, D:L211751-211753) | a two-instance recomp run holding talk past 10 s on the local stack, with `PS2X_PEEK` of `+0x6c` and the table's expiries | *note only*; confirmed 2026-10-04 (R2-AV §1.10 strong, lines re-read); held talk resumes at 20 s, see `VOICE_CUTOFF_LOCKOUT_READING` |
| `VOICE_FLOOR_RETRY_READING` | 1000 ms | the re-ask while waiting (D:L211126, D:L211198) | the same run with a second presser, the request messages logged | *note only* |
| `VOICE_CUTOFF_LOCKOUT_READING` | 10 000 ms after a cut-off, ended by the next press; **corrected 2026-10-04: a hold that keeps the talk flag set re-asks by itself at 20 s if the floor is free** (the lobby, and the round's L2 route; route A clears the flag) | state 4 (D:L211257-211265, left only on a tick with the flag set, D:L211255-211263) | the same run past the cap, then a press at 5 s and at 11 s, and a hold to 25 s | *note only* (R2-AV §1.10 strong; the 20 s resume is a reading) |
| `VOICE_CHANNEL_MAP_READING` | 0 TEAM, 1 DEFENSE, 2 OFFENSE, 3 dead zone, +4 Terrorists, 9 lobby, 10 spectators, 11 off; the dead zone only without respawn or for a ghost (corrected 2026-10-04, C1-C3; was 1 OFFENSE, 2 DEFENSE and "one side" +4) | `FUN_002c2c20` and its callers (§3.1) | a two-instance run reading `voice+0x24` / `+0x2c` in the lobby, alive, dead (with and without respawn), spectating and radio off | *note only* (W2-R-01 and R2-AV §1.4 strong; lines re-read) |
| `VOICE_OFFENSE_DEFENSE_NUMBER_READING` | **OFFENSE sends 2, DEFENSE 1** (TEAM 0); was the menu's order, 1 OFFENSE, 2 DEFENSE | the command menu rows' payloads (`FUN_002344e0` D:L83791-83792, `FUN_0022f950`) | resolved at source level: W2-R-01 (closed) and R2-AV §1.1 (proven), the registrations re-read 2026-10-04 | *resolved 2026-10-04* (was a reading) |
| `VOICE_SIDE_BIT_READING` | **Terrorists +4 (4-7), SEALs 0-3**, by side, so the blocks swap with the side swap; was "the side whose team word equals the `DAT_004412d8`-picked constant" | which side is 4-7 (`FUN_002c2c20` D:L164449-164458 = `FUN_002c30b0`'s Terrorist test) | resolved by W2-R-01 and R2-AV §1.2 (strong); the one-side runtime check stays in the two-instance run | *resolved 2026-10-04* (strong, two sources) |
| `VOICE_DEAD_CHANNEL_READING` | actor `+0xe1` bit 4 clear = dead; event 0x22 = death (sent **only if the game has no respawn or the player is a ghost**), 0x23 = return to `+0xc4` | the dead-zone switch (§3.1; D:L454484-454492, D:L497716-497737 re-read 2026-10-04) | the run above across a death with and without respawn | *resolved 2026-10-04* as a reading (R2-AV §1.4 strong; W2-R silent); the respawn exception is the correction |
| `VOICE_SPECTATOR_CHANNEL_READING` | 10, never +4 or 14 (the spectator's team word is exactly 0x10000) | a spectator's team word not equal to either side constant | the run above with a spectator | *resolved 2026-10-04* (R2-AV §1.3 strong); the channel-above-11 guard stays as defensive code |
| `VOICE_LATE_JOINER_READING` | game `+0xcc` = the `late_joiner` valve, set when the client joins a game that has started and cleared at the next round: no lobby talk, the dead zone at the start, no talker bar | the meaning of `+0xcc` (D:L55842, D:L125653, ELF 0x27e1dc) | a two-console run joining a started game | in code, `voice/talkInput.ts` (SVC-22a: the lobby's CIRCLE inert); *resolved 2026-10-04* (R2-AV §1.5 proven; the effects re-read) |
| `VOICE_LOBBY_BUTTON_EDGE_READING` | CIRCLE FALLING = `do_team_button_down` (press), RISING = `_up` (release), DOWN = `do_circle_button_down` each held frame (the icon follows `can_talk`); was "`_down` on press, `_up` on release" | the binding records' kind | the dialog reader's binding states, read by R2-AV | *resolved 2026-10-04* (R2-AV §1.6 proven; not re-read here) |
| `VOICE_ROUND_TALK_BUTTON_READING` | CIRCLE (TeamCommand, held > 0.3 s) and L2 (SwapWeapon2, with RUN AND TALK) in Default, Reverse and Config4; **Goldeneye: SQUARE, no RUN AND TALK**; RUN AND TALK takes SwapWeapon2 and suppresses its swap; was the `Default` preset only | the preset's slots and the slot order (§4.2, C7, C8) | the disc's `controller.rdr` read by W2-R and R2-AV; a recomp round with each held | in code, `voice/talkInput.ts` (SVC-22a); *resolved 2026-10-04* (R2-AV §1.7 proven; W2-R-02 the same, cross-checked by W2-A; the table not re-read here) |
| `VOICE_DEAD_TALK_READING` | **the dead may talk online**, on their side's dead zone (no respawn) or on their own channel (respawn); two readings kept: R2-AV §1.8 (strong) says the talk routes and the menu tick run while dead, W2-R-03 (reading) corrects only the premise and leaves it open | whether the talk controller runs while the player is dead: no alive test online on routes A and B (D:L84278-84281, D:L83895-83920, re-read 2026-10-04), the tick outside the alive branch (D:L56689-56692); `ctrl+0x221` and the actor's reachability by a dead or spectating player not proved | a two-instance run: kill one of a pair, read command byte `0x413870`, the voice object's `+0x24` / `+0x2c` / `+0x4a` while he presses each route (the card's S8.2; W2-R §3's capture) | in code, `voice/talkInput.ts` (SVC-22a: named where the talk gate `talkAllowed` is, apart from the menu's; the caller decides); *note only* as to the answer |
| `VOICE_TALK_STANCE_READING` | **none: "state 5" is the command menu object's byte (`0x413120 +0x750`); entry sets only that byte and the talk flag**; was "player state 5, its look not read" | what route A's state does to movement and what others see (D:L84278-84282, D:L84418-84435, `FUN_00236250`) | W2-R-03 leaves "may affect movement" open; the exit's `FUN_00597740` argument was re-read and does nothing; a capture of a talker would close it | in code, `voice/talkInput.ts` (SVC-22a: named in the doc; no stance is modelled); *resolved 2026-10-04* (R2-AV §1.9 strong; W2-R-03 the premise) |
| `VOICE_TALK_KEY_PLACEHOLDER` | V held in the round; R (CIRCLE) in the menus | the page's keyboard talk key (no original) | the owner's call (H87) | in code, `voice/headset.ts` (SVC-22b, 2026-10-08: DEV-only, the `s2u-kb-voice` site; research 226 §5-§6) |
| `VOICE_CHANNEL_COUNT_READING` | a count the DME library returns for the channel (the channel collection's member count, W2-R-04); not the floor table, not the mute | the HUD's number, `voice+0x5c` from `FUN_00623ae8` (traced to `FUN_0062a2e8`, D:L537979-537982) | a run with two players on one channel (the frames show 1 alone); the membership lifecycle (local member, muted, stale query) | *note only* (W2-R-04 reading, R2-AV §1.16 believed); **narrowed 2026-10-17 by AD-14** (research 227 §2.11; reading, pending review): the channel's member collection's count, the page included, refreshed at each voice tick, kept on a failed query, 0 at the voice object's start; 11 a channel like the others; the room tells it (`voiceMembers`), the code's constant now the page's estimate before that word; **Retired 2026-10-21 by LATER 77** (the console / front-end seat, the merge controller's simulation-track call; reading, pending review): no estimate -- the HUD draws `voice+0x5c` as it stands, 0 from the voice object's init (`FUN_00310080` D:L211754), the room's `voiceMembers` once it names the page's channel, and after a channel change the previous count until the new channel's word (`FUN_006432c8` D:L556962-556990 writes nothing on a miss); `hudVoice.ts` `voiceCount(channel, members, last)`, `HudVoiceElement.members`; the constant and `voiceChannelCount` removed (research 227 §3) |
| `VOICE_WHO_IS_TALKING_MARKER_PLACEHOLDER` | a pulsing `hud_talk.tif` at the speaker, hidden past 900 units; was "not drawn" [corrected 2026-10-08, MATCH-05's review: a compass mark of type 9 (D:L152145), drawn about the compass's centre (565, 90) by the marks' rule (D:L68207-68243), not a sprite over the speaker; research 227 §2.3, `VOICE_TALK_MARK_READING`] | what the `WhoIsTalking` object shows (`FUN_00211510` D:L68061-68080, D:L68136-68158) | read by R2-AV §1.11 (the alpha pulse is believed); a capture of a talker | *resolved 2026-10-04* (R2-AV strong) |
| `VOICE_INDICATOR_LOOK_PLACEHOLDER` | the layouts' places, no motion; the lobby icon shows "talking" only while recording and "no talk" while waiting on a busy floor (R2-AV §1.15); the round's two icon sprites fade in from 0 by 2 a game frame to 64 (AD-7, 2026-10-16: `FUN_00238d00`, `FUN_003642d0`; research 227 §2.8, `VOICE_ICON_RAMP`; was drawn at a fixed 64 / 128) | how each indicator looks while someone talks, the round's icons' alpha aside | a capture of the game lobby and a round with a talker (ONL-32's window) | *note only* (the code's constant is research 227 §3's, narrowed 2026-10-16) |
| `VOICE_ROW_MARK_READING` | none: the rows are plain `"%s"` names (`FUN_002c4b50` D:L165914-165972); was "no per-row voice mark, glyphs not decoded" | the player rows' strings | read by R2-AV §1.12 | *resolved 2026-10-04* (strong); whether we add one is H87 VOICE-LOBBY-UI |
| `VOICE_TALK_SOUND_READING` | former no-sound conclusion | missed direct headset PCM | original voice tick and output path re-read in §5.4 | retired 2026-10-21; contradicted by the embedded online grant/release cues |
| `VOICE_TALK_CUE_ADAPTATION` (was `VOICE_TALK_CUE_PLACEHOLDER`) | `.TCM_SELECT` once when local online talk becomes ready | an adaptation on the owner's word (2026-10-22, #431's finish): Chris's chosen disc sound in place of the original's online cue; offline menu use is source-linked | -- (an adaptation; `VOICE_TALK_PCM_PLACEHOLDER` holds what the original plays) | `voice/voiceClient.ts`; §5.4 |
| `VOICE_TALK_PCM_PLACEHOLDER` | none: the page plays `VOICE_TALK_CUE_ADAPTATION` on the grant and nothing on the release, a loss or a timeout | the original's online talk cue: `FUN_0030ec10` (D:L211145-211162) expanding bytes 0..1999 of the table at 0x003df540 into the high byte of 16-bit samples, 8 kHz stereo, 0.25 s (`FUN_003102e0` D:L211839-211854), the grant forward and the release / loss / timeout reversed (D:L211082-211099, D:L211216-211241) -- in the loader's run-time segment (0x1e7000, file size 0 in `SCUS_972.75`), filled from the encrypted overlays; the desktop's built `socom2_game.elf` holds it at file offset 0x2ceb40 | the page reading the disc's overlays (LATER 271, on the owner's H270: DNAS self-decryption ported, feasibility first), then the bytes checked by a dev-disc test and the expansion by a transcription test; a capture with audio of a talk grant raises it to proven | *note only* (§5.4) |
| `VOICE_RECORD_GAIN_STEER_READING` | the browser's AGC | the codec-driven gain steer (§6.1) | SASE's level trend, only with the codec | *note only* |
| `VOICE_WIRE_FRAMING_PLACEHOLDER` | our relay's own framing | the DME library's voice packet | a Medius / DME log of a talker on the local stack | in code, `voiceWire.ts` (the layout W20.R2) |
| `VOICE_CODEC_PLACEHOLDER` (retired 2026-10-05) | was 8 kHz 16-bit PCM | the codec (§6.2) | ruled OT.R24: Opus narrowband, 6 kbit/s to start (`VOICE_BITRATE_OWNER`) | *note only* |
| `VOICE_MIC_NOTICE_PLACEHOLDER` | a stated placeholder line | the page's words before the browser's prompt | the owner's call (H87) | in code, `voice/headset.ts` (SVC-22b, 2026-10-08: two stand-in lines, the notice and the no-headset line; research 226 §5-§6) |
| `VOICE_MODULATION_PLACEHOLDER` | **on by default**; the talker's character pitch offset and spectral factor on his own encoder (8 distinct blocks on the disc; robot and whisper unused); never in the lobby; the browser's approximation is ours, labelled | what VOICE MODULATION does to the sound (`FUN_0030e5a0`, `DAT_003df1a8`; the call sites D:L125570, D:L55851-55854 re-read) | the codec setters' units (`EncSC.c`), or a recorded sample (SVC-22) | in code, `voice/modulation.ts` (SVC-22b, 2026-10-08: a labelled pitch shift and a stand-in font; research 226 §5-§6); R2-AV §1.14 partial, strong |
| `VOICE_TALK_LOCKOUT_READING` (added 2026-10-04) | CIRCLE does neither talk nor open the command menu for 1.3 s after a round talk (0.3 s + 1.0 s) and 1.0 s after an L2 talk; a tap under 0.3 s opens the menu | the TeamCommand timer `+0xdb4` (`FUN_00236a50` D:L84677-84690, `FUN_00235300`, D:L83910, D:L84432) | a recomp round pressing CIRCLE at 0.5 s and 1.5 s after a talk | in code, `voice/talkInput.ts` (SVC-22a, with the menu's 0.3 s close); reading, reviewed 2026-10-08 off the ELF (0x3dcb08 = 1.0; `FUN_00235300`'s 0x3e99999a = 0.3); R2-AV §1.10 strong; unread: how soon the menu is back in state 4 after a close (state 3 at D:L83951 until D:L82474-82495 sees the panel closed) -- a press in that gap counts its hold from the talk's end, the module assumes state 4 (the review's F9) |
| `VOICE_MOD_LOBBY_OFF_READING` (added 2026-10-04) | voice in the game lobby is never modulated (`SetMenuState` masks off) | the lobby's call `FUN_0030e5a0(voice, 1)` (D:L125570, re-read) | none needed beyond a run | *resolved 2026-10-04* (R2-AV §1.14 strong); the bypass named in `voice/headset.ts` (SVC-22b) |
| `VOICE_PACKETS_PER_FRAME_READING` (added 2026-10-08, V-WIRE) | 4 | the codec frames in one 80 ms voice message: the original reads 640 samples and encodes four 20 ms frames of 160 (`FUN_0030f990` D:L211453-211550, the loop at D:L211490-211498; §6.1); ours are four 20 ms Opus packets a frame, the decoders' cap on `n` | a DME capture of a talker | in code, `voiceWire.ts` |
| `VOICE_TALK_CAP_READING` (added 2026-10-08, SVC-22a) | 10 s: route A's talk ends 10 s after the TeamCommand press (so 9.7 s after it began) and its flag is cleared; route B's count stops at the same constant and leaves the flag set | `DAT_003dcb00` against the hold counter `+0xdc8` (`FUN_002360d0` case 5 D:L84418-84433; the counter cleared on every released frame D:L84213 and added each tick by `FUN_00236430` D:L84550) and route B's count `DAT_004130a8` (D:L83904-83915) | a recomp round holding CIRCLE 12 s with the talk flag logged | in code, `voice/talkInput.ts` (SVC-22a); reading, reviewed 2026-10-08 off the ELF (0x3dcb00 = 10.0, with 0x3dcaf8 = 0.3 and 0x3dcb08 = 1.0) |
| `VOICE_PAGE_RECORD_CAP_READING` (added 2026-10-08, SVC-22a) | 10 s | the page's voice object: a set talk flag's recording is cut 10 s after it began (`voice+0x30` = 10 000 ms, D:L158881, D:L211217); the client's own state machine, in seconds -- the server's floor holds the same original value in ms (`VOICE_FLOOR_HOLD_READING`, SVC-20a, W20.R5) | the run of `VOICE_FLOOR_HOLD_READING` | in code, `voice/talkInput.ts` (SVC-22a); a reading |
| `VOICE_PAGE_CUTOFF_WAIT_READING` (added 2026-10-08, SVC-22a) | 10 s | the page's voice object: the wait after a cut (its state 4, D:L211257-211265), which outlasts a release (D:L211075-211104) and ends on the first tick past it with the flag set, so a held talk resumes at 20 s and a press inside the wait is silent until it ends; the client's own state machine, in seconds -- the server holds the same original value in ms (`VOICE_CUTOFF_LOCKOUT_READING`, SVC-20a, W20.R5) | the run of `VOICE_CUTOFF_LOCKOUT_READING` | in code, `voice/talkInput.ts` (SVC-22a); a reading |

## 11. Settled, not settled, owed

The evidence, by kind: source inspection (the decompilation, the ELF's strings, one disassembly); the disc's dialogs
through the repository's reader; four frames read by eye; the desktop's notes as evidence. No unit test, no browser run,
no playtest, no capture scored: nothing here is above a reading, and every transcription is pending review.

- **Corrected 2026-10-04** (C1-C11 above): the radio numbers, the side blocks, the respawn exception, no stance, the
  lockouts and the 20 s resume, the buttons by preset, the marker and its range, no per-row mark, no sound, modulation
  default ON and never in the lobby, `+0xcc` the late joiner. Still open between the sources: whether a dead player's
  talk is reachable (R2-AV strong yes; W2-R-03 open) -- one two-instance run settles it (`VOICE_DEAD_TALK_READING`).
- **Settled at the reading level**: voice belongs to the game session (R170.1); the floor's table, its arbiter and its
  types (R170.2); the timings (R170.3); the second presser (R170.4); the channel map's structure (R170.5); hearing by
  exact channel, no proximity (R170.6); the lobby's button and `VCButton` (R170.7); the indicators' existence and
  sources (R170.8, R170.9); mute and the ignore list (R170.10); no headset, no voice (R170.11); the formats (R170.12).
- **Not settled, and what would settle each**: the ledger's rows above. The ones that need a run of the original are
  one two-instance recomp session on the local stack once the recomp sends voice (Q5) -- or, sooner, the recomp's
  voice object driven with the talk flag forced and the table peeked; the looks need ONL-32's window (a capture of
  the game lobby and a round with a talker); the presets need a read of `controller.rdr`.
- **Owed**: the reviewer's re-read of the cited lines; the owner's calls (H87); the controller's placement in
  SPRINTS.md and the README (the proposed blocks' promotion, ONL-16's and SVC-20a's dependencies, §7.2).
