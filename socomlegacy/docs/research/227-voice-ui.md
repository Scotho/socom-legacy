# 227 -- The voice UI: the game lobby (ONL-16b) and the round (MATCH-05)

Written 2026-10-08 16:31Z for ONL-16b (`agent/online-onl16b`, from `agent/online` 455b35790), sprint 20 (voice) wave 3,
on the plan's W20.R9, R11, R12 and constraints 2 and 8 (`docs/plans/2026-10-08-web-sprint-20-voice.md`) and research
170 §4.1, §5.1 with its corrections C9 and C11 (R2-AV §1.5, §1.6, §1.12, §1.15: research 205). The code:
`packages/ui/src/screens/gameLobbyCommands.ts` (`VCButton`, `CheckForcedLaunch`'s voice half, `GameLobbyVoicePort`),
`packages/viewer/src/gameLobbyHost.ts` (`GameLobbyVoice`, `LobbyTalk`, the socket's `voiceFloor` and voice frames, the
hand-off's `talk`). The tests: `packages/viewer/test/gameLobbyVoice.test.ts` (new; the voice client real, its
microphone, WebCodecs and WebAudio fakes, the match server a fake socket), `packages/ui/test/screens/gameLobbyScreen.test.ts`
(two tests over the disc's own `dlgGameLobby.rdr`, from the disc or the committed fixtures; its rigs `gameLobbyRig.ts`
gain a `voice` port and `worldOfSocomRig.ts` a held button). No game or emulator was run, no browser was opened
and no server was contacted. §2 is MATCH-05's (the round's voice UI, wave 4), written with its own sources. §4 is
V-E2E's (the two browser specs, wave 4, last), written 2026-10-08 18:20Z on `agent/online-ve2e` from 37e26c27d: the
specs are written and listed, not yet run (their run is the merge controller's browser window).

## 1. The game lobby

**The layout** (`dlgGameLobby.rdr`, read through `tools/dump-online-dialogs.ts --dialog dlgGameLobby.rdr` with the
disc tree at `SOCOM_PC_ROOT`, 2026-10-08): `IMAGE talk` (`action_ok_talk2.tif`), `IMAGE notalk`
(`action_no_talk2.tif`), `IMAGE Talker_back` (`backsolid.tif`), `WRAPPEDTEXT TalkerName` on the uiVar `PLAYERTACOVAR`,
`TEXT InfoTextCT` (`_338_VoiceChatAll_MSG`, "CIRCLE VOICE CHAT ALL"). Nothing is added to it: no image, no row mark,
no sound.

**The bindings**, their STATE fields re-read here from the layout's records through `parseRdr` (the dump prints the
trigger without its state): `BUTTON CIRCLE STATE FALLING -> do_team_button_down`, `BUTTON CIRCLE STATE RISING ->
do_team_button_up`, `BUTTON SQUARE STATE DOWN -> do_square_button_down`, `BUTTON CIRCLE STATE DOWN ->
do_circle_button_down`, in that file order -- R2-AV §1.6's reading (`VOICE_LOBBY_BUTTON_EDGE_READING`, resolved) holds.
The animations, as the disc has them: `do_team_button_down` is `VCButton(1T)`; `do_team_button_up` `VCButton(0T)` then
`CALL ChatIconReset` (HIDE talk, SHOW notalk); `do_circle_button_down` `IF can_talk == 1 CALL ChatIconAction` (SHOW talk,
HIDE notalk) `ELSE CALL ChatIconReset`. `Enable_SM_Launch` shows `InfoTextCT` and resets the icon at the entry;
`SetupLateJoiner` hides `InfoTextCT` (and `InfoTextCO`). The page runs all of them as they stand -- nothing of the
three is gated (the brief named them `GAME_LOBBY_GATED` rows; §1.4 says why they are not).

### 1.1 What the code does under the scripts

| the original | where read | the port | test |
|---|---|---|---|
| `VCButton` (row 75, 0x27e1c0): with the game held and its `+0xcc` clear, '1' sets the talk flag, '0' clears it; the second character (T / P) unread; 1 | ELF 0x27e1c0-0x27e2a0, disassembled (research 170 §4.1; the decompilation has no function there); `+0xcc` = the valve `late_joiner` (C11, R2-AV §1.5) | `GameLobbyCommands.VCButton` -> `GameLobbyVoicePort.button` -> `GameLobbyVoice`: CIRCLE held as the talk input's lobby phase reads it (`TalkInput`, SVC-22a: press talks, release stops, the 10 s cut and the 20 s ask again) | RED 3 (`gameLobbyVoice.test.ts`); the screen's `VCButton(1T)` / `(0T)` (`gameLobbyScreen.test.ts`) |
| `CheckForcedLaunch` (`FUN_0027cbf0`), each pass of `check_loop`'s wait: all of it under game `+0xcc == 0` | D:L125660 | `GameLobbyCommands.voiceBar`, under `talkable()` (the game held, `late_joiner` 0) | RED 4 |
| `FUN_0030e710`: `can_talk` = the voice object in its state 3 (recording), through the valve's watchers on a change | D:L125661; D:L210800-210822 | `can_talk` 1 while the talk input's flag is set and the room's floor entry names this page (`GameLobbyVoice.recording`) | RED 2; the screen's icon |
| `FUN_0030e790`: the listener's channel's entry held (not 0x100) by another than this console | D:L125662; D:L210826-210840 | the room's `voiceFloor` (the member's own channel's entry, W20.R6) against the welcome's id | RED 1 |
| free, or this console's own: `PLAYERTACOVAR` = " " (`S:0x3ef338`) | D:L125663-125665 | `TALKER_BAR_FREE` | RED 1 |
| another's: `S:0x3ef310`, bytes `23 43 80 40 20 5b 25 73 5d 20 23 43 80 80 80 25 73` (read off the ELF with `tools/elfImage.ts`) -- `#C` and the colour 0x80 0x40 0x20, "[%s] ", `#C` and the colour 0x80 0x80 0x80, "%s" -- of his clan and name, or `"%s"` (`S:0x3eebc8`) with no clan; a holder no slot names writes nothing | D:L125667-125680 (`FUN_002c3a70` the slot's name, `FUN_002c3ac0` its clan) | `talkerBarText`; the name from the room's seats; the clan the room's told tag (`seatClans`, `GameLobbyCommands.seatClans`; AD-13, 2026-10-15; was `TALKER_CLAN_PARKED_READING`, '') | RED 1 |
| `InitializeOnlineArmory` (`FUN_0027d8c0`): the talk flag cleared, then RADIO OFF | D:L126098 (`FUN_0030e6e0(voice, 0)`), D:L126099 (`FUN_0030e490`) | the flag cleared on the page (`GameLobbyVoice.armory`); RADIO OFF and the return's 9 carried to the room on the game socket (W20.R12): the menu's lobby seat never sets the room's `arming` (the front end's match has no `armory` capability), so `GameLobbyVoice` sends `voiceRadio {on: false}` once as the valve `GoneToArmory` goes 1 (after the flag's clear, as D:L126098 precedes D:L126099) and `{on: true}` once as it goes 0, on an open client, and the room takes exactly these two in its waiting phase -- 11, then 9 (research 225 §4.2; *corrected 2026-10-08, the close review's F2: this read "the room's on `arming` / `ready` ... the page sends no voice request for them", which never happened on the menu path*) | RED 5 (three rows); `roomVoice` "the close review's F2" |
| the player rows: `"%s"` names, no talk glyph (`FUN_002c4b50` D:L165914-165972) | C9, R2-AV §1.12 | `drawLists` unchanged by any talk state (OT.R32) | RED 6 |

Research 170 cites the bar's writer as D:L125644-125689 / D:L125653-125681; in the decompilation this was read in
(`socom2_game.elf.decomp.c` on the owner's host, 2026-10-08) the guard is D:L125660 and the bar D:L125661-125680. The
lines differ, the code is the same.

### 1.2 The page's half (`GameLobbyVoice`)

- **The edges into one talk input (W20.R9).** `VCButton`'s '1' and '0' set and clear CIRCLE; once a frame (the lobby's
  `frame`, `FrontEndSession`'s advance) the talk input's lobby phase runs over it (`phase: 'lobby'`, Default, RUN AND
  TALK off, `lateJoiner` from `late_joiner`), and its flag goes to the voice client's `pad` -- the microphone at the
  first press, `voiceTalk` on each edge once the capture runs (research 226 §3).
- **The floor.** The game socket's `voiceFloor` is kept for the bar and passed to the voice client (which sends up
  frames only while the entry names the page); a reconnect's new client has been told no entry yet.
- **The ARMORY.** `InitializeOnlineArmory` is wrapped: the flag is cleared first, then the records' row runs as
  before (`ArmoryProfileCommands`).
- **The hand-off: the single instance.** Of the brief's two designs -- the lobby's talk input handed to the match's
  taunts part, or the match's made early -- this takes the first: `LobbyTalk` holds the one `TalkInput`, built over
  menu hooks that forward to whoever adopts it, and `GameLobbyHandOff.talk` carries it (`adopt(deps)` binds the match's
  Chat menu and returns the instance). Why: the original's voice object is one across the lobby and the round, and the
  round's start clears its talk flag (`FUN_0030e6e0(voice, 0)`, D:L55845) but not its wait after a cut (state 4, C6),
  so a lobby talk cut at 10 s just before the launch still holds the round's first press off; the other design would
  need the match's parts built before the launch, which `./matchMount` is not. From the hand-off until the match gives
  the client back the lobby feeds the input nothing (the socket holds no client, so the lobby's `frame` returns before
  the input); once the socket takes it back (`adopt`) the lobby drives the same instance again. The match takes it on
  (the fix round): `./matchTaunts`' optional `talk` dep (`d.talk?.adopt(menuDeps) ?? new TalkInput(menuDeps)`) and
  `./matchMount`'s `talk: o.handOff.talk`; both sides read `performance.now() / 1000` (the lobby's `seconds`, the
  taunts part's `clock`), so the carried wait is on one clock.
- **The voice client** (`LOBBY_VOICE_CLIENT_ADAPTATION`): the lobby mounts its own over the game socket, at HEADSET
  VOLUME from the front end's uiVars (`tunersOfVars`), and disposes it at the hand-off, BACK and the seat's end.
- **The headset** (SVC-22b's `voice/headset.ts`, the review's F6; research 226 §5): the lobby's voice takes one, so the
  notice (`VOICE_MIC_NOTICE_PLACEHOLDER.ask`) shows once a page just before the first `getGameMicrophone()` call --
  usually the lobby's -- and the no-headset line with it; the pad the page reads going and the window's focus lost
  release a lobby talk (`headset.frame({ phase: 'lobby' })` into `padPresent` / `focused`); under DEV, R held
  (`headset.keys('lobby')`, H87 VOICE-KEY) is CIRCLE in the same talk input, on the lobby's screen only (not while
  `GoneToArmory` is 1); no modulation in the lobby (`VOICE_MOD_LOBBY_OFF_READING`). With no HUD message line in the
  lobby, the two lines go to its text panel `B_CHATLIST` (`LOBBY_VOICE_LINE_ADAPTATION`). The headset is let go
  with the lobby's voice client (the hand-off, BACK, the seat's end); the round's is the taunts part's own.

### 1.3 Evidence, by kind

- **Unit** (`gameLobbyVoice.test.ts`, 19): the bar's three forms, the clan form byte for byte against `S:0x3ef310`, and
  never the listener's own name; `can_talk` on a busy and on a granted floor and after the release; FALLING / RISING
  into `voiceTalk`, the held frames, the second character, the 10 s cut and the 20 s ask; the late joiner inert; the
  ARMORY; the side lists unchanged; the hand-off's one instance and the lobby's microphone stopped -- also at a final
  close and when a drop's retry finds no ticket; the match's taunts part on the hand-off's instance, a lobby cut's wait
  carried into the round (the review's F5: after the round's first frame, a re-press inside the wait does not talk
  until the wait ends, ~20 s; an instance whose lobby talk was never cut talks 0.3 s after the same re-press; with a
  second instance in the match, the probe talked 0.32 s after the re-press), the lobby feeding it nothing during the
  match and again after `adopt`; `matchMount` passing `handOff.talk`; the headset (F6): the notice once before the
  lobby's first microphone ask and on `B_CHATLIST`, a pad lost releasing a lobby talk, the DEV R key as CIRCLE (and not
  over the ARMORY).
- **Dev-disc / fixtures** (`gameLobbyScreen.test.ts`, 2, over `dlgGameLobby.rdr` built from the disc's own records --
  the disc at `SOCOM_PC_ROOT`, or the committed `test-fixtures/`; both runs green): the idle lobby's no-talk icon, its caption and its blank bar (A_54's),
  the host's name in the bar, CIRCLE held on a busy floor (no talk icon), on a granted floor (the talk icon, the bar
  blank), the release's `ChatIconReset`, `VCButton(1T)` / `(0T)` dispatched by the scripts; the late joiner's hidden
  `InfoTextCT`, his inert `VCButton` and the unwritten bar.
- **Not done:** no rendered browser run, no capture. `VOICE_INDICATOR_LOOK_PLACEHOLDER` stays open: no frame of a
  talker exists, so the idle frames `A_54_gamelobby2.png` / `A_17_game_lobby_ok.png` are the only reference.

### 1.4 Against the brief

- **The three animations are not `GAME_LOBBY_GATED` rows.** A gated row's start is taken (`UiCommandHost.bindingStart`:
  the animation does not run), so gating them would stop the disc's own SHOW / HIDE of `talk` / `notalk` and its
  `ChatIconReset`, and the page would have to redraw them itself. The original's mechanism -- the `VCButton` row and
  the `can_talk` valve and `PLAYERTACOVAR` written by `CheckForcedLaunch` -- is filled instead, and the scripts run as
  the disc has them. *(The gate `LOBBY_TEXT_CHAT_GATE_READING` retired 2026-10-10 by ONL-23: the lobby's text chat runs, research 266 §1; the headset's lines join the chat's 21.)*
- **The icon is driven through `can_talk`, not a `voiceIcon` feed**, and the bar through `CheckForcedLaunch`, not a
  `voiceBar(text)` feed: both are written where and when the original writes them (each pass of the wait loop).
- **A finding, not changed:** the original runs the whole of `CheckForcedLaunch` under `+0xcc == 0` (D:L125660), the
  clocks included; the port's clocks (`mp_45_sec_clock`, `mp_x_sec_clock`) still run for a late joiner. ONL-16a's code,
  left as it stands for its owner.

## 2. The round (MATCH-05)

Written 2026-10-08 17:32Z for MATCH-05 (`agent/online-match05`, from `agent/online` 9183b9320), sprint 20 wave 4, on the
plan's W20.R4, R6, R9, R10, constraints 2, 3 and 8, OQ-2, OQ-3 and OQ-8, and research 170 §3.1, §5.2, §5.3 with its
corrections C1 and C9 (R2-AV §1.11-§1.13). The code: `packages/viewer/src/hudVoice.ts` (new, pure: the element's state,
the tag's rule, the mark), `hud.ts` (the element's place and draw, the mark on the compass, `setVoice` /
`setTalkMarks`), `hudAssets.ts` (the nine bitmaps), `matchChat.ts` (RADIO and TEAMMATES through `entries(root)`),
`voice/voiceClient.ts` (`radio`, `muted`, the state's `channel` and `talking`). The test:
`packages/viewer/test/hudVoice.test.ts` (new); the HUD's pin `test/golden/hudBitmaps.json` gains the nine bitmaps'
sizes and hashes. Sources: the decompilation (`socom2_game.elf.decomp.c` on the owner's host; `D:L` its lines, cited,
never pasted); the retail ELF `game/disc/socom2_game.elf` read by virtual address through its PT_LOAD map (the strings
`S:0x...` and the float constants `DAT_...`), and, where the decompilation has no function, two static initializers
disassembled by address (0x3ff680, the element's places in the BSS; 0x3fe940, the tag sprites' half widths); the
disc's `RUN/MP2.ZDB`, `MP6.ZDB`, `MP72.ZDB` (the fixtures) through `readHud`; the archived frames
`$SOCOM_PC_ROOT/logs/parity/s11_r0004_round1/A_hold01.png` and `B_hold01.png`, read by eye on 6x and 8x crops. No game
or emulator was run, no browser was opened, no server was contacted.

### 2.1 The HUD's voice element

| the original | where read | the port | test (RED) |
|---|---|---|---|
| The channel icon by the base `voice+0x2c`: 0 `action_tune_team.tif`, 1 `action_tune_defense.tif`, 2 `action_tune_offense.tif`, 3 `action_dead_zone.tif`, 10 `action_tune_spectators.tif`; radio off (`FUN_0030e540`: the channel is 11) `action_no_talk2.tif`; any other base no texture, hidden | `FUN_002393f0` D:L85892-85944 (the slots), `FUN_00239570` D:L85949-85984 (the slots' textures, S:0x3e67c0..0x3e6860 read off the ELF), `FUN_0030e540` D:L210691-210694 | `hudVoice.ts` `channelIcon` over the room's `voiceFloor.channel` (W20.R6): 0..7 read as `& 3` (the +4 side block is the room's, `FUN_0030fcd0` ORs it in after the base is kept); 9 and a channel not told yet draw none | 1 |
| Its place: 32x32 at (590, 361) | `FUN_003646d0` at D:L85937 with `DAT_003dcbe0/e8/f0/f8` = 590, 361, 32, 32 (ELF) | `HUD_LAYOUT.voice.icon`, anchored right | 1 |
| The number beside it: `"%d"` (S:0x3e6750) of `voice+0x5c` in 0..99, `"?"` (S:0x3e6758) outside; always shown. `voice+0x5c` is the member count of the page's own voice channel, the page included (AD-14, §2.11) | `FUN_00238ac0` D:L85707-85716; the count `FUN_0030ec10` D:L211004 -> `FUN_00623ae8` -> `FUN_006432c8` D:L556962-556990 (§2.11) | `voiceCountText` of `voiceCount`: the room's `voiceMembers` (`room.ts` `voiceMembersTell`, kept by `NetClient.voiceMembers`); before its first word the count as it stands -- 0 from the voice object's init (`FUN_00310080` D:L211754), the previous channel's after a change until the new one's word (`HudVoiceElement.members`; LATER 77). Was: the page's estimate (`VOICE_CHANNEL_COUNT_READING`, retired 2026-10-21); before AD-14 the estimate alone | 2 |
| Its place: HCENTERED (`+0x69`, research 111) on x 589, baseline 371, scale 0.8, alpha 128, on an untextured black box at alpha 50 over 582-598 x 359-375 | `FUN_00238d00` D:L85750-85761 (the box's colour, alpha and rect; the text's scale 0.8, alpha 128, `+0x2d1`); `DAT_003dcc10/18/20/28` = 359, 16, 16, 371 (ELF); the BSS `DAT_00414610` = 590 - 1, `DAT_004145f8` = 590 - 8, `DAT_00414600` = 582 + 16, `DAT_00414608` = 359 + 16 (the initializer at 0x3ff680) | `HUD_LAYOUT.voice.count` / `countBox`, `HUD_COLOURS.voiceBox` / `voiceCount` | 2 |
| The speaker's line: while another holds the listener's channel (`FUN_0030e790`: the entry held, not by this console), `"[%s] %s"` (S:0x3e6718) of his clan and name, his name alone without a clan; otherwise `" "` (S:0x3e6748), hidden; a holder no slot names returns before the line and the number are rewritten | `FUN_00238ac0` D:L85678-85706, `FUN_0030e790` D:L210826-210840 | `HudVoiceElement.tick`, `speakerText` (the clan the room's told tag, then the score row's: AD-13 and CLAN-TAG-ROUND, research 275 §2.3, §5; was none, `TALKER_CLAN_PARKED_READING`) | 3 |
| Its place: right-justified (`+0x6a`) to x 622, baseline 352, scale 0.9, the HUD's string colour | `FUN_00238d00` D:L85730-85736; `DAT_003dcc40` = 352; `DAT_00414618` = `DAT_003dcc30` 598 + `DAT_003dcc38` 24 (0x3ff680) | `HUD_LAYOUT.voice.name` | 3 |
| The talk icon `action_ok_talk2.tif` while the voice object records (state 3, `FUN_0030e710`); else the busy icon `action_channel_busy.tif` while the game's clock is at most a deadline set to now + 1.0 on every frame another holds; else none | `FUN_00239250` D:L85840-85887 (the deadline D:L85852; the textures S:0x3e6780, 0x3e6760, `FUN_00238f50` D:L85806-85808), `FUN_0030e710` D:L210800-210822 | `HudVoiceElement.tick`: recording is the talk flag with the floor the page's own (`VoiceState.talking`, `holder`); `VOICE_BUSY_HOLD_SECONDS` | 4 |
| Its place: 32x32 at (545, 361) | `FUN_003646d0` at D:L85879, `DAT_003dcc00/08` = 545, 361 (ELF) | `HUD_LAYOUT.voice.talk` | 4 |
| The two icon sprites (the channel icon `voice+0x20`, the talk / busy icon `voice+0xc0`): (128, 128, 128), alpha 0, then the target `+0x20` 64, the step `+0x1c` 2.0 and the step flag `+0x18` 1 (each sprite's own offsets); each call site steps its sprite's alpha by 2 toward 64 on every frame it has a texture, then shows it; the alpha is held while it is hidden and put back to 0 at each round's start (AD-7, §2.8) | `FUN_00238d00` D:L85737-85748, `FUN_00239570` D:L85958-85963, `FUN_00238f50` D:L85800-85805; `FUN_003642d0` D:L261617-261631; `FUN_002393f0` D:L85925-85939, `FUN_00239250` D:L85867-85881 | `hudVoice.ts` `VOICE_ICON_RAMP`, `voiceIconStep`; `hud.ts` `Hud.step` / `timing().voice` and the draw; no positional motion (`VOICE_INDICATOR_LOOK_PLACEHOLDER`, narrowed). Was: drawn at rest at 64 / 128 with no motion, the rate not read as one | 1, 11 |
| No voice widget on the round or final screens; SELECT's board and SPECTATOR HUD off hide it (the info box's hide `FUN_00238420` hides its `+0x390`, the voice element), the START menu's open does not | research 170 §5.2; `FUN_001f7ff0` D:L56808-56811, the table 0x405b40 + 0x18 = 0x238420 (read off the ELF), `FUN_00238420` D:L85519-85523 (AD-7, §2.8) | `ROUND_SCREEN_HIDES` and `SCOREBOARD_HIDES` take `voice`, `START_MENU_HIDES` does not (PAR-97). Was: the scoreboard did not hide it, its hide's reach not read (`VOICE_HUD_SCOREBOARD_READING`, retired, §3) | 9, 10 |

**Against the frames (by eye).** `A_hold01.png` and `B_hold01.png` (each player alone on his side, TEAM, idle) were
cropped at 6x and 8x with a 10-pixel grid over x 530-630, y 345-400: on both, the box at x 582-598, y 359-375; the
"1"'s ink at x 587-590, y 361-370 (the HCENTERED pen at 589, baseline 371); the TEAM icon over x 590-621, y 361-392,
dim (the scene shows through: the 64 / 128 at rest); nothing at (545, 361) and no line at y 352 (no talker). The
element's layout as built lands on those boxes (RED 1, 2: the rectangles from the HUD's pin sizes). No frame of a talker
exists: the talk and busy icons' and the line's look are the code's places, not compared (OQ-3).

### 2.2 The name tag's talk icon and arrow

`FUN_002269a0` (D:L77307-77460) draws up to eight team name tags: an actor with a player record, `FUN_00548050(actor)`
under 5.0, not the page's own actor, sharing the team word's bits, its flag 0x20000 clear and its record's `+0x5c` bit
0 set (D:L77375-77380), its pen inside x 0..600 and y `top`..448 - `top` (D:L77404-77405). On the tag of the actor whose
slot holds the listener's channel (D:L77348-77350, set only while `FUN_0030e790`) it places the arrow
`hud_arrow_off2.tif` (40, 96, 110) at alpha 64 over x - 16..x + 16, y from 10 above the tag to 42 above it (its y0
below its y1: drawn flipped), and the talk icon `action_ok_talk2.tif` (128, 128, 128) at alpha 64, 32x32, its bottom 7
into the arrow's top (D:L77434-77443; the sprites `FUN_00227340` D:L77544-77556; the half widths `DAT_0040dbd0/d8` =
0.5 x 32, the initializer at 0x3fe940; `DAT_003dc868/870/878/880` = 32, 32, 10, -7). `hudVoice.ts` `tagDrawn` and
`tagTalkSprites` hold the rule (RED 5).

**Not drawn at this head: the port has no name-tag drawer.** No source of the viewer draws `DISPLAY_MP_TEAM_NAMES`'
tags (grep: no `FUN_002269a0`, no tag drawer), so there is no drawn tag to put the two sprites on, and the original puts
them on no other place. The rule waits for the tags' own task (`MP_TEAM_NAME_TAGS_PLACEHOLDER`, §3; resolved 2026-10-15 by NU-9 (c), research 329: the tags and their sprites are drawn, this paragraph the state before); drawing the
sprites without a tag would be a widget the original does not have. `tagDrawn` holds every condition above, the
player record, `FUN_00315580(record, 2)` and the record's `+0x5c` bit 0 among them *(2026-10-08, MATCH-05's review)*.

### 2.3 The `WhoIsTalking` mark

It is a compass mark: `FUN_00211510` (D:L68061-68080) moves the map's `WhoIsTalking` marker (made at map load,
`FUN_002ac410` D:L152143-152149, its type set to 9 at D:L152145, `FUN_002a28f0` D:L146865-146909) to the holder's actor and shows it while another holds
the listener's channel and the actor is known, and hides it otherwise; the compass draws it as its mark of type 9 --
the bitmap slot `+0x2c` `hud_talk.tif` (S:0x3e4598, `FUN_002126f0` D:L68613; HUD2, 16x16 on the disc's three maps), the
colour row `+0x10c` (32, 62, 62) (D:L68703-68705) -- at the types 1-13 pulse `DAT_0040c070` (64..128 at 250 a second,
D:L68043-68050, `DAT_003dc4f0/f8`, `DAT_003dc500` re-read off the ELF: `OBJECTIVE_MARK_PULSE_READING`), and online cut
past 900 units (`DAT_003dc518` = 900.0, the jump table 0x3e44b0 sending types 0 and 9-11 to the test, research 190) by
the distance with the vector's height dropped (D:L68132-68137), and drawn about the compass's centre (565, 90)
(D:L68207-68243: within 200 units at radius distance x 0.005 x 65, beyond pinned at radius 64). The distance's other
end is the matrix `FUN_00211510` holds (`iVar16 + 0x30`), not read as the camera or the body: the port takes the
page's own feet, as its compass does. It is not a sprite projected over the speaker (research
205 §1.11's "screen marker over the speaking teammate's position" reads the list as screen markers; the list is the
compass's, the one `./hostageMarks` already draws from). `hudVoice.ts` `talkMark` places it, `hud.ts` draws it by the
compass marks' rule (`compassMarks`, the talk marks after the hostages'), `VOICE_TALK_MARK_READING` (§3; RED 6).

### 2.4 The Chat menu's RADIO and TEAMMATES

The tree (`FUN_00232bc0`, its multiplayer branch D:L83575-83640, the spectator's D:L83641-83645) and its bindings
(`FUN_002344e0` D:L83787-83806), the labels and help lines read off the ELF:

- **RADIO** ("Use the radio") > **ACTIVE CHANNEL** ("Set the active radio channel") > TEAM ("Set radio channel to
  TEAM"), OFFENSE ("Set radio channel to OFFENSE ", the trailing space the ELF's), DEFENSE ("Set radio channel to
  DEFENSE"), bound to `FUN_0022f950` with 0, 2 and 1 (C1); then **RADIO ONOFF** ("Radio (On, Off)"), labelled RADIO OFF
  while the radio is on and RADIO ON while it is off (`FUN_0022f8f0` D:L81558-81571) and turning it the other way
  (`FUN_0022f880` D:L81534-81553). The rows ask the room through the voice client (`MatchVoice.radio`: `voiceRadio
  {active}` 0..2 only, as `FUN_0022f950` takes, or `{on}`, W20.R4); the room computes the channel and tells it back.
- **A spectator's tree** is RADIO > RADIO ONOFF alone: `entries(2)` gives that row, every other root none.
- **TEAMMATES** ("Teammate controls") > PLAYER 1..8 (D:L83608-83615): the n-th teammate of the side, the dead among
  them (`FUN_0022f5b0` D:L81444-81472: a type-2 actor, not the page, the team word shared, its 0x20000 bit -- the
  escortee's, research 190 -- clear, and `FUN_002c2fd0` 0, which is the spectator test, the team record's 0x10000,
  D:L164609-164643: no life test -- *(2026-10-08, MATCH-05's review)*; it read "living" until then), labelled with his
  name (`FUN_0022f6e0` D:L81475-81508), help "Player n" -- the page's rows in member-id order
  (`TEAMMATE_ROW_ORDER_READING`, §3) -- each with VOTE RETAIN:REMOVE (parked: the vote is `./netPage`'s K list,
  W3.R13) and **MUTE ON:OFF** ("Mute (On, Off)"), labelled MUTE ON while he is muted and MUTE OFF while not
  (`FUN_0022f530` D:L81429-81436, S:0x3e5cf0 / 0x3e5cf8), toggled by `FUN_0022f4c0` (D:L81402-81414): the listener's
  byte (research 170 §5.3), the voice client's `mute(id, on)`; nothing is sent. The seeding from the ignore list at a
  join (`FUN_002c5830`) stays deferred (OQ-8).
- No row carries a talk mark (`VOICE_ROW_MARK_READING`): the holder's TEAMMATES row is his plain name. No row plays a
  sound of its own (`VOICE_TALK_SOUND_READING`): the menu's `.TCM_SLIDE` / `.TCM_SELECT` are the menu's (RED 7-9).
- Without a voice client handed to it (`MatchChatDeps.voice`), the two roots stay parked as before.

### 2.5 The pages' wiring

Both pages (`main.ts`, `/testroom`; `matchMount.ts`, the front end's; claimed for this in HANDOFF §3, the window granted
by the Online seat) hand the Chat menu the voice client (`voice: () => voice` in `mountChat({...})`; the part is mounted
just below, the closure reads it at a root's opening) and, each frame just before `hud.setHostageMarks(...)`, run one
`voiceHudFrame(voiceEl, performance.now() / 1000, {...})` over `voice.state()`, the net page's `rows`, its client's id
and team (null for a spectator), the scoreboard's spectators (`Hud.spectatorCount`), its `nameOf`, the others' bodies
(`RemotePlayers.feet`) and the page's own (`walk.feet()`), feeding `hud.setVoice` and `hud.setTalkMarks`; with no net
page both are cleared. `voiceClient.test.ts`'s one-wiring test pins the lines in both pages.

**A spectator's RADIO (not opened at this head).** The original gives an online spectator the Chat menu with RADIO >
RADIO ON:OFF alone (`FUN_0022f810` enables the root for one, the tree's spectator branch D:L83641-83645). The port's
menu does not open for a spectator (`matchTaunts.ts`' gate), and letting it pass is not enough: the drawn root column
(`tauntLayout.ts`) and the menu's navigation (`tauntMenu.ts`) hold the five roots fixed -- a spectator would see and
could enter TAUNTS, whose rows are the menu's own and send -- and the spectator's camera reads the same Cross, d-pad
and Triangle (`spectatorView.ts`). A per-tree root list in the menu and its drawer, and the spectator view yielding
while it is open, are a task of their own; `entries(2)` already gives the spectator's row.

### 2.6 Evidence, by kind

- **Unit** (`hudVoice.test.ts`, 23): the icons by channel, the count's text and the labelled count, the line, the talk /
  busy with the hold on a fake clock, the tag's rule and sprites, the mark's cut, colour and pulse, the RADIO and
  TEAMMATES rows through the real Chat menu and taunts part with a fake voice client, the voice client's `radio` /
  `muted` / `channel` on fakes, no row mark, no sound, the round screen's hide.
- **Dev-disc / fixtures**: `hud.test.ts`'s disc block reads every bitmap the HUD names off `RUN/MP2.ZDB` (the nine new
  among them, no diagnostic); the libraries were listed on MP2, MP6 and MP72 (the eight icons in `HUD_TXR`,
  `hud_talk.tif` in `HUD2_TXR`, all three maps); `test/golden/hudBitmaps.json` gains their sizes and hashes from MP2
  (`hud.parity.test.ts` compares the pin whole).
- **The frames by eye** (§2.1): the idle element's place only.
- **Not done:** no rendered browser run, no capture of a talker; the name tags (§2.2); a spectator's menu (§2.5).

### 2.7 Against the brief

- **The tag's sprites are a rule without a drawer** (§2.2): the brief assumed a tag drawer to extend; none exists.
- **The mark is the compass's**, at the compass's shared pulse (`OBJECTIVE_MARK_PULSE_READING`, the same `DAT_0040c070`),
  not a world sprite (§2.3); the brief's "alpha 64-128, believed" is that pulse, re-read off the ELF.
- **TEAMMATES' rows include VOTE RETAIN:REMOVE, parked**: the tree has it before MUTE under every PLAYER node
  (D:L83616-83631); the brief named MUTE only.
- **A spectator's menu does not open at this head**: `matchTaunts.ts`'s gate takes living players only; the rows a
  spectator would see are `entries`' (RADIO ON:OFF), the menu's own root list (five roots, `tauntMenu.ts`) is unchanged. *(2026-10-17, AD-10, §2.9: the gate takes the dead too, each root by its own enable; a spectator's menu stays shut, AD-11's.)*
- **The brief's cite `FUN_00232c80`** (research 301 §4) for the spectator's root: this decompilation has no function
  there; the tree is built inside `FUN_00232bc0` (from D:L83283), the spectator's branch D:L83641-83645.
- **The wiring** (§2.5) was made in a second commit, once the window on `main.ts` and `matchMount.ts` was granted.

### 2.8 AD-7: the element under SELECT and SPECTATOR HUD off, and its icons' alpha (2026-10-16)

Written 2026-10-16 for AD-7 (web sprint 40, the PARITY-2 lane; `agent/ad7` from 609996346), on the reconciliation's
C87 and C93 (chunk 08's independent review). Reading, pending review; nothing here is proven: no capture of a talker, of
SELECT held online or of SPECTATOR HUD off exists. Sources: the decompilation (cited, never pasted) and the retail ELF
read by virtual address through the repository's reader (`tools/elfImage.ts` `ElfImage.u32`).

- **The hide (C87).** `FUN_001f7ff0`'s block D:L56808-56827 runs when SPECTATOR HUD is off (`DAT_003dc3e0` 0) or
  online with the board up (`FUN_0022cbf0`); D:L56811 calls `+0x17b7c`'s `+0x18`. `+0x17b7c` holds the info box's table
  0x405b40 (D:L57830, D:L58399), and its word at 0x405b58 (+0x18) is 0x238420 (read off the ELF here; +0x1c is
  0x238490, the show, and +0x38 0x238500, the update). `FUN_00238420` (D:L85519-85523) calls `FUN_00364e50` (the drawn bit's
  clear) and the `+0x18` of its four children -- `+0x270`, `+0x20`, `+0x2f0` and `+0x390`, the voice element
  (`FUN_00238f50` made at D:L85656). The hide reaches the element by an explicit call, not by inference from a parent
  (the element's table 0x405bb0, read off the ELF: `+0x18` 0x364e50); its icons and line are its children
  (`FUN_001feae0`: the line D:L85797, the channel icon D:L85981 in `FUN_00239570`, the talk / busy icon D:L85812, the
  number's box D:L85821, the number D:L85833) and its draw (`+0xc`, `FUN_00364e70`) walks them only
  while its bit is set. Online with SPECTATOR HUD on, D:L56803-56806 show the info box (its `+0x1c`, `FUN_00238490`
  D:L85537 shows `+0x390`) on every frame before the test, so the board's release draws it again the next frame. The
  port: `voice` into `SCOREBOARD_HIDES`, which `hudPass` applies for the board and for SPECTATOR HUD off and which
  `Hud.state()` drops from the rects under the board; `ROUND_SCREEN_HIDES` unchanged (it already took `voice`);
  `START_MENU_HIDES` unchanged (PAR-97: the hide-all skips the info box in control state 3). The Modern board's
  clearance (`SCOREBOARD_KEEPS_BOTTOM`) never counted the element, so its fit is unchanged.
- **The ramp (C93).** Each icon sprite is made at alpha 0 (its `+0x34`, `FUN_00364860` writes `+0x3c`, D:L261835),
  target 64, step 2.0, flag 1 (§2.1's row). `FUN_003642d0` (D:L261617-261631), only while the flag is set: next = alpha
  + step; a positive step gives the target when next passes it, else next, held at 128; the result through `+0x34`.
  Each call site steps its own sprite on every frame it has a texture and then shows it (D:L85871-85881,
  D:L85929-85939): so the first shown frame draws 2, the 32nd 64, and never more. The channel icon has a texture
  whenever its channel gives one (radio off's included), so it fades in once after each round start; the talk / busy
  icon while it shows (recording, or another's floor and its 1 s hold). The port: `hudVoice.ts` `VOICE_ICON_RAMP`
  {0, 2, 64} and `voiceIconStep`; `Hud` holds the two alphas (not the model), `Hud.step` steps each on a frame whose
  view gives it a texture, `Hud.timing().voice` carries them, `hudLayout` draws them (a pass with no HUD timing,
  `AT_REST`, draws the ramp's end 64 / 128). No positional motion is read, and none is drawn
  (`VOICE_INDICATOR_LOOK_PLACEHOLDER` keeps `motion: 'none'` only).
- **The reset (read).** The sprites' tables 0x405c20 (the talk / busy icon's update 0x239250 at +0x38) and 0x405c90 (the
  channel icon's, 0x2393f0), read off the ELF, give `+0x18` = 0x364e50 and `+0x1c` = 0x364e30: `FUN_00364e50`
  (D:L262099) and `FUN_00364e30` (D:L262089) touch only the `+0x14` bit 0x40; a texture swap (`FUN_003646d0`) sets no
  alpha. So a hidden icon keeps its alpha, and a talker who stops and starts again within a round is drawn at the alpha
  he left (64 once faded in), not from 0. The alpha goes back to 0 at each round's start: `FUN_001fb420` (the HUD's
  reset, D:L57618) -> `FUN_00238710` (D:L85621) -> `FUN_00238d00` (D:L85737-85748); the port's `Hud.startRound`. No
  `VOICE_ICON_RAMP_RESET_READING` is needed.
- **The cadence (read).** The steps run in the element's update: `FUN_001f7ff0` D:L56758 (online, a viewed actor
  present) -> the info box's update `FUN_00238500` D:L85578 -> the element's `FUN_00238ac0` D:L85718-85719 -> the
  icons' updates. `FUN_001f7ff0` is called once per call of the state tick `FUN_001ebed0` (D:L50856), the game's frame
  (`CCoreState_Tick`, research 180 §1.1; research 266 §3.9). So one step per game frame; the port steps 2 x dt / `GAME_FRAME_DT`
  at the page's rate on the HUD's clamped `dt` (MISSION R8: the per-second total the original's, the sub-frame
  stair-steps not reproduced). The update runs before the board's hide (D:L56758 before D:L56811), so the ramp goes on
  under the board, as the port's does.
- **Against the brief.** The brief read the call sites as stepping "only while a talker is present"; the channel icon's
  site steps whenever its channel has an icon, talker or not (D:L85925: the test is the game object and the texture),
  so the channel icon fades in after each round's start and the talk / busy icon on its first showing; the port follows
  the read. A case the port does not follow (`VOICE_UNNAMED_HOLDER_READING`, §3): when another holds the floor and no
  slot names him (`FUN_002c3a70`), `FUN_00238ac0` returns before the icons' updates (D:L85679-85684) **on every such
  frame**, so the icons stay as they were -- no step, no show, no hide -- and `FUN_00239250`'s busy deadline (D:L85852)
  is never set; the port's element (`HudVoiceElement.tick`) keeps the line but still gives the busy icon (and its 1 s
  tail), and the HUD steps its alpha, for as long as the holder is unnamed (a holder not yet seated on the page). The
  icon shown is MATCH-05's; AD-7 adds only its step. Not changed here: the element's view is shared with AD-14. (Was:
  "at most a frame per such case" -- AD-7's review, F1.)
- **Evidence, by kind.** Unit (`hudVoice.test.ts` RED 10, RED 11, and RED 1's moved pin); source inspection
  (the decompilation and the ELF's words, above). **Not done:** no rendered browser run, no capture of the fade or of
  the board's hide online; the 30 Hz stair-steps against a capture.

### 2.9 AD-10: the dead player's menu -- each root's enable, not a gate on the living (2026-10-17)

*2026-11-01, R4B-08 (OT.R97; research 379 §1, §5): this section reads r0001. Its VOTE and VOTE ALL rows for a dead
player following a teammate are **r0001, superseded by r0004**: r0004's enables (r4 0x2d1710, 0x2d15c0) disable both
unless the camera views the own body or the page is a spectator (`VOTE_ROWS_CAMERA_GATE_READING`). The no-life-test
reading stands for the living and for the dead on their own body.*

Written 2026-10-17 for AD-10 (web sprint 40, the online lane; `agent/online-ad10` from `agent/online` 67d0071cd), on the
reconciliation's C86 (chunk 07's read, chunk 14's independent review). Reading, pending review; nothing here is proven:
no capture of a dead player's or a spectator's menu exists. Sources: the decompilation (cited, never pasted), each line
below re-read at the source for this task, and the retail ELF's strings read by virtual address through the
repository's reader (`tools/elfImage.ts` `ElfImage.cstr`).

- **The opening, online.** `FUN_002359a0`'s TeamCommand release (state 3 with `+0xdcc`, D:L84284-84298) opens the menu
  (`FUN_00235440`) when the page's actor exists (`FUN_002b3580`, `DAT_00440c38`); its two refusals -- the actor dead
  (`+0xe1` bit 4 clear, D:L84290) and the actor not the viewed one (`FUN_001fcd70`, D:L84294) -- are offline's only
  (`DAT_0045a0c1` 0). The scripted opening (`DAT_004365dc` bit 2, D:L84222-84237) is apart: online it asks only that
  the actor be the viewed one (D:L84233). So online a dead player's tap opens the menu. The port: `matchTaunts.ts`'s
  gate drops `gate.alive` (it was a match, alive, not a spectator, no other screen).
- **The roots shown.** The opening evaluates every node's enable once (`FUN_00235440` D:L83998 -> `FUN_00231a30`
  D:L82546-82585): a node's callback, called with the page's actor and the node's argument (D:L82550-82555), sets its
  disabled flag `+0x738`; a node without one is enabled (D:L82546-82547); an enabled parent whose children are all
  disabled is disabled (D:L82568-82582); a disabled node is not drawn (`FUN_00230870` D:L82151). The roots' callbacks
  as `FUN_002344e0` binds them (`FUN_002306e0(tree, label, action, arg, enable, arg)`; the labels read off the ELF):

  | root (label) | its callback | bound at | enabled for |
  |---|---|---|---|
  | NODEACTION ROOT (S:0x3e5e10; its eight NODEACTION rows `FUN_0022ef10`, D:L83758-83765) | `FUN_0022f810` | D:L83757 | not in the port (below) |
  | TACTICAL ORDERS (S:0x3e5ef0) | `FUN_002301e0`, group 0x1f | D:L83766 | a living actor, the group present |
  | TAUNTS (S:0x3e6090) | `FUN_0022f810` | D:L83774 | a living actor, or an online spectator |
  | MESSAGES (S:0x3e6448) | `FUN_002301e0`, group 0x1f | D:L83781 | a living actor, the group present |
  | RADIO (S:0x3e5dd0) | `FUN_0022f810` | D:L83787 | a living actor, or an online spectator |
  | TEAMMATES (S:0x3e6240) | none | D:L83793 | by its rows: PLAYER 1..8, each `FUN_0022f6e0` (D:L81486-81507: the n-th teammate's actor, no life test) |
  | SPECTATORS (S:0x3e63e0) | none | D:L83794 | by its row: VOTE ALL ON:OFF, `FUN_0022f210` (D:L81293-81313: a spectator present) |

  `FUN_0022f810` (D:L81519-81527) enables for an actor alive, else, online, for the page a spectator (`FUN_002c2fa0`);
  `FUN_002301e0` (D:L81879-81883) when the group exists (`FUN_005ef2f0(0x1f)`, D:L502133-502147) and the actor is
  alive. So a dead player (online, not a spectator) is shown TEAMMATES while he has a teammate and SPECTATORS while a
  spectator is present, nothing else; a living player all of them. The port: `tauntMenu.ts` `rootEnabled` and its
  roots, the role from the page's gate (`matchTaunts.ts`, the menu's `role`); the group's existence online is not read
  (`CHAT_COMMAND_GROUP_READING`, §3). TEAMMATES' rows are the teammates with or without a voice client (`matchChat.ts`,
  since Chris's PR #254, vote-kick), so an empty TEAMMATES is not drawn, for the living too (built at AD-10's fold,
  after #254 landed; its two rigs and its no-teammate case in `matchChat.test.ts` follow the rule).
- **The cursor.** The opening puts the cursor on the first root that is enabled or carries no callback
  (`FUN_00235440` D:L83999 -> `FUN_00235560` D:L84027-84049; D:L84036-84038 take a node with no callback even when it is
  disabled): a living player's TACTICAL ORDERS, as before, a dead player's TEAMMATES. `FUN_00231690`'s open state
  (case 1, D:L82464-82470) closes the menu when the node the cursor is on (`FUN_00236b20` D:L84726-84766, the node at the
  cursor's depth) is disabled -- so a dead player with no teammate opens it and it closes at once, SPECTATORS drawn or
  not. The port: `openRoot`, and `settle` closing it the frame after (the original's after its opening, state 0, which
  the port does not draw), its reopening held off `CHAT_HOLD_SECONDS` as after any close.
- **The death.** `FUN_001f7ff0` keeps the viewed actor's life in `DAT_00408f08` each frame (D:L56754; the viewed actor
  `DAT_00415ff0 + 0xbc`, D:L56540) and, on the frame it goes from alive to dead (D:L56632), when that actor is the
  page's own (D:L56641-56642), calls `FUN_00235300(menu, 0)` (D:L56643): the close, the TeamCommand timer 0.3 s
  (D:L83944-83946). Once, at the edge; the dead may open the menu again. The port: `matchTaunts.ts` keeps the last
  frame's life and, on the edge's frame, hands the talk input `menuAllowed` false, so an open menu closes through the
  talk input's own close (`VOICE_TALK_LOCKOUT_READING.menuClose`); the frame after, the gate is open again. The
  original's call runs with the menu closed too (the timer, the state 3, a talk under way moved off its state 5): not
  built (`DEATH_CLOSE_IDLE_TIMER_READING`, §3).
- **The spectator (AD-11's).** `FUN_001fa360` chooses the tree by the page's role (D:L57441-57448: 2 for an online
  spectator) and branch 2 builds RADIO > RADIO ONOFF alone (`FUN_00232bc0` D:L83641-83645). `rootEnabled` answers
  `FUN_0022f810`'s spectator branch (TAUNTS and RADIO enabled), but the spectator's root list and the menu's opening
  for him are AD-11's (C47): until then `matchTaunts.ts` keeps a spectator's menu shut (§2.5). *(Built by AD-11,
  §2.10.)*
- **Not in the port: NODEACTION ROOT.** The player tree's first root (D:L83577-83585, the label from `mission.rdr`'s
  `tcm::nodeaction_root`, its eight rows `actions.rdr`'s `descriptor`) is drawn while one of its rows is enabled
  (`FUN_0022ef10` D:L81181-81211: an interaction node at hand); the port has no such root (an older gap, not AD-10's).
- **The vote, for the dead too (AD-10's fold).** TEAMMATES > PLAYER n > VOTE REMOVE / RETAIN (`FUN_00232bc0`
  D:L83607-83631) is bound to the toggle `FUN_0022f3c0` and the enable `FUN_0022f440` (D:L83803): the enable asks only
  that a teammate be selected (D:L81384-81396), the toggle flips the slot's `+0x49` and sends "Voter" (D:L81363-81370,
  `FUN_002ba140` D:L159796-159799, its lookup `FUN_002bd4d0` D:L161788-161815 an id's), and the target's console counts it
  (`FUN_002ba040` D:L159762-159767) -- no life test anywhere; VOTE ALL's handler `FUN_0022f0f0` (D:L81263-81277) has none
  either. The send `FUN_0030cef0` itself is untraced. So a dead player's VOTE row is active and his vote counts: the
  page's `NetPage.toggleVote` drops its alive test (the gameplay seat's cleared hunk) and the room's `vote` and
  `voteAll` theirs (`packages/match/src/room.ts`). Research 263 §5.2, 264 §4, 302 and 91 §17 corrected (they read
  `FUN_0022f810` as the vote's gate, its spectator half inverted). One consequence not read: `NetPage.gate().alive` was
  also the ghost's (a late joiner without a body); the page no longer refuses a ghost's vote, and whether a ghost's
  menu opens in the original (`FUN_002359a0` asks only that the page's actor exists) is not read. *(AD-10's review,
  F3:)* so a ghost's behaviour changed with AD-10: its Chat menu now opens online, on TEAMMATES (`matchTaunts.ts`'s gate
  no longer asks `alive`), and its vote is sent (`NetPage.toggleVote`) and counted (`room.ts` `vote`, a seat in
  `players`) -- LATER 73 holds the read that would settle it.
  *Read 2026-10-17 (DEAD-WATCH, LATER 73; reading, pending review; each line re-read at the source by its implementer,
  source inspection, no run): **the late joiner's page actor exists**, so the port stands.* (1) Online, every level load
  makes the console's own actor and sets the page actor before any spawn: the load `FUN_002ac410` (its one caller the
  level load `FUN_001ea720`, D:L49730) calls `FUN_005442c0` when online (D:L152167-152168), which raises the spawn flag
  `DAT_0044ce50` (D:L410581), makes the actor (its controller `FUN_00598280`, or `FUN_005ff0f0` while `DAT_00440c30` is set, D:L410596-410610;
  `FUN_005999e0` D:L410611) and sets `DAT_00440c38` (`FUN_002b3590`, D:L410612, D:L156225) -- no test of a late join, a
  ghost or the round in play; `FUN_001ea720` then binds the camera to it (D:L49731-49732). (2) The ghost is that actor:
  the level's spawn `FUN_002b7d60`, run once behind `DAT_0044ce50` (D:L158523-158524), takes the page actor
  (`FUN_002b3580`, D:L158610), places it and, for a ghost (`+0xd2`), puts it in the death state (`FUN_00543d50`,
  D:L158633-158641; research 314 §4.3 item 1) -- it never clears `DAT_00440c38`. (3) The page actor's other writers:
  `FUN_00599b60`'s set-up of a local actor (D:L455685), `FUN_002b3a00` for a type-0 controller (D:L156407, reached from
  the level objects' `FUN_002b28d0` only while no page actor is set, D:L155832-155834), and the clears -- the actor's own
  destruction (`FUN_005533e0` D:L419132-419133, that actor only), the level's unload (`FUN_001eb8c0`, `FUN_002b3590(0)`
  D:L50611) and the static initialiser (`FUN_00400330` D:L328217); no clear runs at a late seat. So `FUN_002359a0` finds the
  actor (D:L84284-84298, online the existence alone) and the ghost's menu opens, as a dead player's: its roots by their
  enables -- TEAMMATES by its rows (`FUN_0022f6e0`, no life test) and SPECTATORS while one is present, the rest refused
  to a dead actor (`FUN_0022f810`, `FUN_002301e0`) -- the ghost's actor dead as a killed one is: `FUN_00543d50` zeroes
  its health and makes the call a kill makes (the actor's vtable +0x58, D:L410426-410430; a kill's, `FUN_005477a0`
  D:L412835-412838) before the state 8 (D:L410437) -- and its VOTE rows and VOTE ALL carry no life test (above). The brief's other cites hold as context only: `+0xfd2` (D:L76148, `FUN_00223970`, copied from `+0xfd1`
  over the actor list at the round's reload) and `FUN_002253c0`'s walk of the same list (D:L76717) read the actors'
  list, not `DAT_00440c38`. Not measured: ONL-32's capture of a late JOIN GAME with the Chat menu opened is the proven
  level. LATER 73 is struck with this read.
  The untraced send (AD-10's review): `FUN_0030cef0` -> `FUN_00621458` (a lock, the send `FUN_00615d88`, the unlock)
  carries raw ids only, and the target's console counts; unread are `FUN_00615d88`'s internals, the dispatcher
  `FUN_006210d0`, and `FUN_002c2e30` on VOTE ALL's host path.
- **Read once, at the opening.** `FUN_00231a30`'s one caller is the opening (D:L83998), and the rows' labels are written
  by the same callbacks (RADIO ON / OFF, MUTE ON / OFF, VOTE ALL), so the original holds its roots and rows as they were
  when the menu opened; the port reads its roots live (SVC-23f's SPECTATORS rule closes the menu when the last
  spectator leaves while it is on it). *(AD-10's review, F1:)* that live close is extended to TEAMMATES, the other
  root with no enable (D:L83793): the last teammate gone while the cursor is on TEAMMATES, or in it, closes the menu
  (`tauntMenu.ts` `settle`) -- the port's existing SVC-23f behaviour, not the original's read-once, until the row on
  reading the roots once lands. Not changed here; a candidate row for the owner's LATER.
- **Corrections.** MATCH-05's review (the sprint 20 plan's Log, 2026-10-08 17:52Z) gave RADIO, TACTICAL ORDERS and
  MESSAGES all `FUN_0022f810`: TACTICAL ORDERS and MESSAGES carry `FUN_002301e0` (D:L83766, D:L83781: the group and a
  living actor, no spectator branch); RADIO and TAUNTS `FUN_0022f810` (D:L83787, D:L83774). `matchTaunts.ts`'s gate
  comment cited `FUN_00232c80` (research 301 §4), which this decompilation does not hold (§2.7); the comment now cites
  `FUN_00232bc0`'s branch 2.
- **Evidence, by kind.** Unit (`tauntMenu.test.ts`'s six AD-10 cases, `matchTaunts.test.ts`'s three roles and the
  death close, `matchChat.test.ts`'s dead voter and no-teammate cases, `netPageVoteLines.test.ts`'s dead voter,
  `room.test.ts`'s dead vote and dead VOTE ALL, `round.parity.test.ts`'s dead teammate's vote); source inspection (the decompilation and the ELF's strings). Not
  done: no rendered browser run, no capture of a dead player's menu.

### 2.10 AD-11: the spectator's RADIO menu, opened (2026-10-17)

Written 2026-10-17 for AD-11 (web sprint 40, the online lane; `agent/online-ad10` from `agent/online` e6caaa29d), on
the reconciliation's C47 (chunk 05). Reading, pending review; nothing here is proven: no capture of a spectator's menu
exists. Sources: the decompilation (cited, never pasted), each line re-read at the source for this task; the retail ELF
read by virtual address through `tools/elfImage.ts`.

- **The tree by role.** `FUN_001fa360` builds the command menu with tree 1 online, 2 when the page is a spectator
  (`FUN_002c2fa0`), then calls `FUN_00232bc0(0x413120, tree)` (D:L57441-57448); branch 2 makes RADIO (S:0x3e5dd0) >
  RADIO ONOFF (S:0x3e5de8) alone (D:L83641-83645). RADIO's enable is `FUN_0022f810` (D:L83787), whose spectator branch
  enables it for him (D:L81521-81522); RADIO ONOFF's label and toggle are `FUN_0022f8f0` / `FUN_0022f880` (D:L83788).
  The opening (`FUN_002359a0` D:L84284-84298, online asking only that the page's actor exists) puts the cursor on RADIO,
  the tree's one enabled root (`FUN_00235560` D:L84027-84049). The online spectator has a page actor, a ghosted one
  (research 314 §5.4 item 3): the local actor is written to `DAT_00440c38` and the spectator arm ghosts it
  (`FUN_00599b60` D:L455684-455698, `FUN_002c2fd0` -> `FUN_00543d50`); his spawn takes `FUN_002b3580()` with no null
  test and ghosts it (`FUN_002b7d60` D:L158610-158645); the spectator-only branches read its `+0xc0` directly
  (`FUN_00295260` D:L139466-139475, `FUN_002360d0` D:L84405-84413) -- so his tap opens the menu (AD-11's review, F2). The port: `tauntMenu.ts` `SPECTATOR_ROOT_ORDER` [RADIO]
  chosen by the role, `matchTaunts.ts`'s gate no longer refusing a spectator, `matchChat.ts`'s spectator rows (RADIO >
  RADIO ON / OFF, as MATCH-05 built them, §2.4) unchanged.
- **`DAT_00408e50`.** D:L57445-57446 force tree 1 while the byte `DAT_00408e50` is set; no line of the decompilation
  writes it (its one reference is that read), and the ELF holds it in no PT_LOAD file image (the BSS: zero at load). So
  a spectator gets tree 2; read as a dormant flag, and the port needs no constant for it.
- **The camera while it is open.** The menu holds the pad (`MatchTaunts.pad`'s `owns`): the input handed on is none
  (`ExchangeInput`), and a button it took stays held off after it closes (`matchTaunts.test.ts`, AD-11's case). Both
  pages feed that input to the camera -- `matchMount.ts` `exchange.input.frame(chat.input, menu)` then `feedCamera`
  (:830-831), `main.ts` `input = chat.input` then `exchangeInput.frame` and `feedCamera` (:1173-1185) -- and both hand
  `NetPage` a `menuOpen` holding `taunts.isOpen()` (`matchMount.ts:693`, `main.ts:1678`), under which
  `NetPage.spectatorPad` and the spectator's keys act on nothing (`DEAD_CYCLE_WHILE_MENU_READING`, `netPage.ts:609`,
  :628, :1262-1263; `SpectatorView.pad` zeroes the scenic sticks while blocked). Read in the source; no page change was
  needed (§2.5's "the spectator's camera reads the same buttons" is the state before PF-31's `menuOpen`). **The
  original's own** (AD-11's review, F1; reading): the opening sets the page actor's controller to mode 2
  (`FUN_00235440` D:L83993, through `FUN_00597740`); the spectator camera's buttons act only at mode 0 (`FUN_00295260`
  D:L139474-139475) and its scenic sticks likewise (`FUN_002964f0` D:L140399-140401); the close puts the mode back to 0
  (`FUN_00235300` D:L83941) and the same frame clears the pad's button states (`FUN_002dba60(param_3, 0)` D:L84338,
  D:L84360), so the release that closes the menu never reaches the camera. The port's block is the original's; only
  its "a button the menu took stays held off until let go" (`ExchangeInput`, `main.ts:1178`) is a browser safeguard,
  labelled there.
- **Corrections.** Research 301 §4's `FUN_00232c80` (no such function in this decompilation, §2.7) is `FUN_00232bc0`'s
  branch 2; LATER 25 cited `FUN_0027d8c0`, which is `InitializeOnlineArmory` (D:L126094-126102: the talk flag off, the
  radio off), not the menu -- the tree is `FUN_00232bc0` and its bindings `FUN_002344e0` (D:L83717-83806). Chunk 05's
  "`FUN_0022f810` is the individual taunt-enable predicate" reads it narrowly: it is the enable of three roots (§2.9).
- **Evidence, by kind.** Unit (`tauntMenu.test.ts`'s spectator tree, `matchTaunts.test.ts`'s three roles and the pad's
  ownership, `hudVoice.test.ts`'s spectator RADIO OFF / ON through the real menu); source inspection. Not done: no
  rendered browser run, no capture.

### 2.11 AD-14: the number beside the icon is the channel's membership (2026-10-17)

Written 2026-10-17 for AD-14 (web sprint 40, the online lane; `agent/online-ad14` from `agent/online` 4a0af28f6), on
the reconciliation's C92 (chunks 07 and 14) and research 170 §10's OQ-2. Reading, pending review; nothing here is
proven: no capture shows two players on one channel (the archived `s11_r0004_round1` A_hold01 / B_hold01 show 1, each
player alone on his side). Sources: the decompilation (cited, never pasted), each line re-read at the source for this
task.

- **What `voice+0x5c` holds.** The voice tick `FUN_0030ec10` (D:L210968-211305) returns at once while `voice+0x4c` is
  clear (D:L211001-211003), else asks the network library for its channel `voice+0x24` into `voice+0x54`
  (`FUN_00623ae8(DAT_0045a1b4, voice+0x24, voice+0x54)`, D:L211004). `FUN_00623ae8` (D:L532855-532878) takes the
  library's lock and calls `FUN_006432c8` (D:L556962-556990): it marks the search (`+0x208` = 1, the channel in
  `+0x210`, D:L556974-556976), walks the library's channels (`FUN_0062bfd0` D:L539432-539437 -> `FUN_00611b08`
  D:L520677-520700, the ring from the session's `+100`, each described by `FUN_00624b88` D:L533720-533731) with the
  callback `FUN_00644c90` (D:L558061-558095), which matches the channel id the library made for that voice channel
  (`+0xfc + 4 x channel`, D:L558076) against the description's first half-word (the channel record's `+0xc`,
  D:L533725) and keeps its second (`+0x214`, D:L558078) -- `FUN_0062a2e8(record + 0x50)` (D:L533728; D:L537979-537983:
  the collection's first word). That word is a count: `FUN_0062a218` (D:L537919-537945) adds a member keyed by its
  `+0x34` only when absent and adds 1, `FUN_0062a2f0` (D:L537988-538010) drops one and takes 1. On a match the answer
  is copied out (D:L556983-556985: the channel's handle and number to `voice+0x54` / `+0x58`, the count to `+0x5c`); on
  no match or an error nothing is written, so `+0x5c` keeps its last value. It is 0 from the voice object's start
  (`FUN_00310080` D:L211754).
- **Who is a member.** A member joins one channel at a time: the voice's channel set (`FUN_0030fcd0`
  D:L211574-211598; RADIO OFF's `FUN_0030e490` D:L210672-210681 the same with 11) asks `FUN_00623998`
  (D:L532799-532822) -> `FUN_00643168` (D:L556912-556933, the library's id for that voice channel) -> `FUN_0062bf30`
  (D:L539369-539374) -> `FUN_00611938` (D:L520607-520640), which leaves the channel it was on (`FUN_00611a40`
  D:L520645-520672, its own record dropped by `FUN_00626788` D:L535077-535099), sends its join (kind 9,
  D:L520626-520628) and adds its own record to the new channel (D:L520634 -> `FUN_00626658` D:L535027). So **the page
  counts itself**. Another
  member's record is added to his channel when the library learns of him (`FUN_00612010` D:L520948-520994, the add at
  D:L520991) and dropped at his departure (`FUN_00612138` D:L520999-521055). Radio off's **11 is a channel like the
  others**: everyone on it is counted -- the radio off, a seat in its ARMORY (`FUN_0027d8c0` D:L126099 calls
  `FUN_0030e490`), the session's start (`FUN_00310080` then `FUN_0030fd90(voice, 11)`, D:L158881-158882). The dead zone
  is the side's (3, the Terrorists' 7: the side bit, C2), so it counts that side's dead who were asked there; 10 counts
  the spectators on 10 (one whose radio is off is on 11).
- **When it is refreshed.** At every voice tick: `FUN_0030ec10` is called by `FUN_0030f990` (D:L211453-211549, the call
  D:L211472), the callback the voice object registers with its audio library (D:L211560); that callback's period is not
  read. The room tells the count on each change (below); the page draws it on its next frame.
- **The cites of chunks 07 and 14, re-read.** `FUN_0030ec10` D:L211004 -> `FUN_00623ae8` D:L532853-532877 ->
  `FUN_006432c8` D:L556960-556989; the enumeration `FUN_0062bfd0` / `FUN_00611b08` D:L539430-539436 / 520675-520699;
  the count `FUN_00624b88` D:L533718-533730 through `FUN_0062a2e8`; the callback `FUN_00644c90` D:L558059-558094 --
  **agreed**, each range within two lines of the function's (they open on its header comment, two lines above the
  signature where the ranges above open). Chunk 07's "the side/life approximation ... cannot distinguish TEAM/OFFENSE/DEFENSE/radio-off"
  -- agreed; one addition: on 11 the original counts every member on 11, not the page alone.
- **The port.** The room holds every member's channel (`VoiceSeat.channel`, research 225 §4), so it tells each member
  its own channel's count -- every member it holds on that channel, the member included -- as `voiceMembers {channel,
  members}` (`protocol.ts`, additive), a `send` to that member alone, after the `voiceFloor` that names the channel,
  whenever its channel or the count changed since it was last told (`room.ts` `voiceMembersTell`, from `voiceTell`,
  which every ask, talk, sweep and departure already calls; a resumed connection is told again, `voiceTold`). That
  covers a channel change, RADIO OFF / ON, a death into the dead zone and the respawn or round start out of it, an
  arrival (a spectator's included) and a departure. `NetClient.voiceMembers` keeps the last; the voice client reports
  it (`VoiceState.members`); `hudVoice.ts` `voiceCount` draws it when it names the channel the page is on, else --
  before the room's first word (an older server), or while a new channel's count is on its way -- the count as it
  stood: 0 from the voice object's init, then the last count told (LATER 77, 2026-10-21; was the page's estimate,
  `voiceChannelCount`, `VOICE_CHANNEL_COUNT_READING`, retired). A parked seat (OT.R59) keeps its channel and
  is counted, as it keeps its floor entry; the original's own timeout of a silent console is not read. W20.R6 holds:
  the page is told a number, never who is on its channel.
- **Evidence, by kind.** Unit: `packages/central/test/roomVoiceMembers.test.ts` (the lobby's 9, the launch, a channel
  change, RADIO OFF / ON, a classic death and the next round's start, a respawn game's death, re-pick and respawn, a
  spectator's arrival and RADIO OFF, a departure, a talk that changes nothing), `hudVoice.test.ts` RED 2 (the room's
  word, the estimate before it, the old 2/2/2 distinct per channel, the voice client's report), `netClient.test.ts`
  (the kept word, a malformed one refused); source inspection. Not done: no rendered browser run, no capture.

## 3. Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `TALKER_CLAN_PARKED_READING` | '' | the talker's clan tag in the lobby's bar (`FUN_002c3ac0`, D:L125670): the game lobby's seats (the bridge's `gameLobby` message, `GameLobbySeat`) carry none (`packages/ui/src/screens/gameLobbyCommands.ts`) | the `gameLobby` message's seats carrying the tag the room's score rows carry (research 275 §5) | **retired 2026-10-15 (AD-13, the clans' finish wave 6b; reading, pending review)**: the game lobby's bar and its side lists read each seat's tag from the room's `seatClans` (the bridge's read at each seat, `Room.tellClan`, `CLAN_TAG_AT_SEAT_READING`; `packages/ui/src/screens/gameLobbyCommands.ts` `seatClans`, the bar `talkerBarText(name, tag)` D:L125668-125677, the lists' keyed `"[%s]"` cell `GAME_LOBBY_CLAN_TAG_COLOR`, `FUN_002c5010` D:L166107-166151), and the round's line the same told tags first (`packages/viewer/src/hudVoice.ts` `VoiceHudSources.clanOf`); the constant removed. Was: reading, reviewed -- written with ONL-16b and MATCH-05 (2026-10-08), narrowed 2026-10-13 by CLAN-TAG-ROUND (research 275 §2.4) to the lobby's bar |
| `VOICE_LOBBY_BUTTON_EDGE_READING` | FALLING `do_team_button_down`, RISING `do_team_button_up`, DOWN `do_circle_button_down` | the binding records' kind (research 170 §10) | re-read here on the disc's layout (§1): the STATE fields as R2-AV §1.6 has them (named in `packages/viewer/src/gameLobbyHost.ts`, `packages/ui/src/screens/gameLobbyCommands.ts`) | resolved (R2-AV §1.6; re-read 2026-10-08) |
| `VOICE_ROW_MARK_READING` | none | a talk mark on the lobby's player rows (research 170 §10) | -- (C9: `"%s"` names) | resolved (C9); held by RED 6, and in the round by `hudVoice.test.ts` RED 9 (TEAMMATES' rows, `packages/viewer/src/matchChat.ts`) |
| `VOICE_INDICATOR_LOOK_PLACEHOLDER` | the lobby: the disc's two images, swapped by its own animations; the round: `{ motion: 'none' }`, no positional motion of the element's two icon sprites (§2.1) | how each indicator looks and moves while someone talks (research 170 §10, OQ-3): the lobby's icon; the round's sprites' motion other than their alpha, none read | a capture of the game lobby and a round with a talker (ONL-32's window) | placeholder, **narrowed 2026-10-16 by AD-7** (§2.8; reading, pending review): the round's icons' alpha is read now, `VOICE_ICON_RAMP` (0 by 2 a frame to 64, held while hidden, 0 at a round's start; `FUN_00238d00`, `FUN_003642d0`); the round's constant in `packages/viewer/src/hudVoice.ts`; the lobby's named in `gameLobbyCommands.ts`'s doc. Was: `{ iconAlpha: 64 / 128, motion: 'none' }`, the sprites at rest at a fixed 64 |
| `VOICE_LATE_JOINER_READING` | the late joiner's lobby CIRCLE inert, the bar unwritten, the caption hidden (the disc's `SetupLateJoiner`) | game `+0xcc` (C11) | research 170 §10's two-console run joining a started game | resolved (R2-AV §1.5); in code `voice/talkInput.ts`, used here through `late_joiner` |
| `VOICE_CHANNEL_COUNT_READING` | before the room's first `voiceMembers`: the page's own side's seated players in its own state, itself included (the living on 0..2, the dead on 3); the spectators on 10; itself alone on 11 | the page's estimate of the number beside the channel icon while the room has told none (an older server): `voice+0x5c`, read now as the member count of the page's own channel, the page included (§2.11), is told by the room (`voiceMembers`); the estimate knows no other's ACTIVE CHANNEL or RADIO, so it cannot tell TEAM / DEFENSE / OFFENSE apart and counts none of the others on 11 | none needed for the number (the room's word); the estimate goes with the last server that does not send `voiceMembers` | reading, pending review; **narrowed 2026-10-17 by AD-14** (§2.11): `voice+0x5c`'s source read (`FUN_0030ec10` D:L211004 -> `FUN_00623ae8` -> `FUN_006432c8` D:L556962-556990), the room's count drawn; the estimate stands before its first word, in `packages/viewer/src/hudVoice.ts`. *A held seat (OT.R59, the review's F1 / F2): the room counts a parked seat on its channel until its park ends (`roomVoiceMembers.test.ts` RED 8); the original's library drops a member at his departure (`FUN_00612138` D:L520999-521055), but its timeout of a console whose link went silent is not read -- note only; what would settle it: a two-console run with one link pulled, the other's number read until it drops.* Was: the whole number, its source "not established" **Retired 2026-10-21 by LATER 77** (the console / front-end seat, the merge controller's simulation-track call; reading, pending review): no estimate -- the HUD draws `voice+0x5c` as it stands, 0 from the voice object's init (`FUN_00310080` D:L211754), the room's `voiceMembers` once it names the page's channel, and after a channel change the previous count until the new channel's word (`FUN_006432c8` D:L556962-556990 writes nothing on a miss); `hudVoice.ts` `voiceCount(channel, members, last)`, `HudVoiceElement.members`; the constant and `voiceChannelCount` removed |
| `VOICE_TALK_MARK_READING` | type 9, `hud_talk.tif`, (32, 62, 62), hidden past 900 units in the ground plane | the `WhoIsTalking` compass mark (§2.3): its slot `+0x2c` (D:L68613), colour row `+0x10c` (D:L68703-68705), the cut `DAT_003dc518` and the distance's dropped height (D:L68132-68137) | a capture of a round with a talker at known distances | reading, pending review; in `packages/viewer/src/hudVoice.ts`, the colour in `hud.ts` `OBJECTIVE_MARK_RGB_READING` |
| `TEAMMATE_ROW_ORDER_READING` | member id | the order of TEAMMATES' PLAYER 1..8 rows: the n-th of the side's actors in the game's actor list (`FUN_0022f5b0`, `FUN_0022f6e0`), whose order is not read (research 302 §3) | a read of the actor list's insertion (`DAT_004362e8`), or a capture of the menu with three teammates | reading, pending review; in `packages/viewer/src/matchChat.ts` -- and the rows list seated teammates whether or not a body stands in the world (a late joiner, anyone before his first spawn), where the original walks the actor list and so lists only those with a body (the review's F6; `RemotePlayers.feet(id)` is null for such a member -- a filter on it would close the difference) |
| `VOICE_UNNAMED_HOLDER_READING` | the port gives the busy icon and steps it while another holds the floor unnamed | the original's early return (`FUN_00238ac0` D:L85679-85684: no slot names the holder, `FUN_002c3a70`), which holds the icons as they were and sets no busy deadline (§2.8) | a build that returns before the icons' updates while the holder is unnamed (with AD-14's membership), or a capture of a late joiner's first words | open, a known divergence *(2026-10-16, AD-7's review F1)*; named in `packages/viewer/src/hud.ts` (`Hud.step`'s comment) |
| `VOICE_HUD_SCOREBOARD_READING` | hidden: `SCOREBOARD_HIDES` takes `voice` | whether the scoreboard's hide (`FUN_001f7ff0`'s branch D:L56808-56828, the members it hides by `CHUD` offset) takes the voice element *(2026-10-08, MATCH-05's review)* | read: D:L56811's info box hide, the table 0x405b40 + 0x18 = `FUN_00238420` (the ELF), calls the voice element's own hide (D:L85523) | **retired 2026-10-16 by AD-7** (§2.8; reading, pending review): `voice` in `SCOREBOARD_HIDES` (SELECT's board and SPECTATOR HUD off), the name gone from `packages/viewer/src/hud.ts`. Was: reading, pending review -- not hidden, named beside `SCOREBOARD_HIDES` |
| `MP_TEAM_NAME_TAGS_PLACEHOLDER` | none: no tag is drawn | the team name tags (`FUN_002269a0` D:L77307-77460, `DISPLAY_MP_TEAM_NAMES` S:0x3e5540), whose drawn tags carry the talk icon and arrow (§2.2; `hudVoice.ts` `tagDrawn` / `tagTalkSprites` hold the rule) *(2026-10-08, MATCH-05's review)* | the name tags' own task: the drawer, its `FUN_00548050` metric, the option's valve | resolved 2026-10-15 by NU-9 (c): read as research [329](329-the-name-tags-over-heads.md), built as `teamTags` (`packages/viewer/src/hudTags.ts`), `teamTagLayout` and `Hud.setTeamTags` (`hud.ts`), the sprites drawn over the holder's tag (was: *note only*: owed; no constant stands in for it) |
| `LOBBY_VOICE_LINE_ADAPTATION` | the headset's two lines on the lobby's `B_CHATLIST` (BCHATLISTVAR), a line each, among the chat's 21 (ONL-23, 2026-10-10: appended to the panel's lines, no longer replacing them) | the HUD message line the round draws them on (research 226 §5); the lobby has none | the owner's placement (H87 VOICE-MIC-NOTICE) | adaptation |
| `LOBBY_VOICE_CLIENT_ADAPTATION` | the lobby's own voice client, disposed at the hand-off | the original's one voice object and headset across the lobby and the round (§1.2) | none needed (the page's wiring); one client across both, should the match's voice client take the lobby's on | adaptation |
| `CHAT_COMMAND_GROUP_READING` | 'present' | TACTICAL ORDERS' and MESSAGES' enable `FUN_002301e0` (D:L81879-81883) asks, besides a living actor, that the command group 0x1f exists (`FUN_005ef2f0` D:L502133-502147); who makes the group online is not read (§2.9) | a read of the group list's builder (`DAT_0044d5b8`, its groups by `+0x58`), or a capture of a living player's menu showing TACTICAL ORDERS | reading, pending review *(2026-10-17, AD-10)*; in `packages/viewer/src/tauntMenu.ts` |
| `DEATH_CLOSE_IDLE_TIMER_READING` | 'open menu only' | the death edge's `FUN_00235300(menu, 0)` (`FUN_001f7ff0` D:L56631-56644) runs with the menu closed too: the TeamCommand timer 0.3 s (D:L83944-83946), the menu's state 3 (D:L83947-83951), a talk under way moved off its state 5, whose effect on the talk flag is not read (§2.9) | a build of the talk input's close at the edge with the menu closed (`packages/viewer/src/voice/talkInput.ts`), with that read; or a capture of a death while talking | open, a known divergence *(2026-10-17, AD-10)*; in `packages/viewer/src/matchTaunts.ts` |

## 4. The browser specs (V-E2E)

The sprint's browser proof (SPRINTS.md's sprint 20 gate; the plan's "V-E2E -- the voice specs", constraint 1 PF), in
three files: `packages/viewer/e2e/voiceMatch.spec.ts` (the menu path on FROSTFIRE, MP2), `voiceTestroom.spec.ts`
(`/testroom`) and `voiceFixtures.ts` (what both share). Each spec starts its own match server (`MAPS=MP2`, a temporary
data directory, the run's page origin its one allowed origin) on its own port of the lane's e2e range, through
`e2ePort` as `twoPagesMatch.spec.ts` does: `VOICE_MATCH_PORT` 5379, `VOICE_TESTROOM_PORT` 5374 (the plan's host rules).
`e2e/ports.ts` registers no spec's port, so it is unchanged.

### 4.1 What the harness gives the browser

Browser adaptations of the specs' own, no original, changing nothing of the game:

- **The fake microphone**: Chromium's `--use-fake-device-for-media-stream` and `--use-file-for-fake-audio-capture=` the
  tone, in each spec's own `test.use({ launchOptions })` (never the shared `playwright.config.ts`; the config's three
  SwiftShader switches are repeated there, a spec's `launchOptions` replacing the config's whole); the microphone
  permission granted on every context the specs make; the setup page's "Use in game" on and the default device
  (`gameMicrophone.ts` `MIC_ENABLED_KEY`, `MIC_DEVICE_KEY`) set before the page's script. The page still opens the
  microphone only at its first talk press (constraint 6).
- **The tone**: 440 Hz at half scale, 8 000 Hz mono 16-bit, 5 s, written at run time (a `beforeAll`, never at import)
  to `e2e/fixtures/tone440.wav`, git-ignored by the root `.gitignore`.
- **The pad**: `e2e/startupDevices.ts`' two standard-mapping pads, the menu path's driver (`pad.spec.ts` exports none);
  CIRCLE is button 1 (`gamepad.ts` `PAD_BUTTON`, checked by type). The Chat menu's presses are `tapPad`s: a button
  held for exactly one of the page's frames in one round trip, so a CIRCLE tap stays inside the menu's 0.3 s
  (`CHAT_HOLD_SECONDS`) at SwiftShader's frame rates, where `pressPad`'s three round trips might not.
- **The first press** (`warmUp`): the page's first talk press asks the microphone and opens the capture, and the
  talk input's 10 s recording cut (C6) counts from the flag, so each match's first press (the lobby's, the round's: a
  new voice client after the hand-off) is made and let go first; the asserted hold then starts granted and every read
  is taken inside it (`heldMs` under 10 s, asserted).
- **The probe** (`probeVoiceBrowser`), logged as `VOICE_MATCH probe` / `VOICE_TESTROOM probe`: an audio track from
  `getUserMedia`, the fake device's level where an ungestured context runs, whether an `AudioContext` at 8 000 Hz is
  made, and whether the voice codec's own encoder and decoder configurations (`voiceCodec.ts`, Opus at 8 kHz, 6 000
  bit/s) are accepted -- Chromium's 8 kHz acceptance, owed by SVC-21 and SVC-20b-page (research 226).
- **C, a raw-socket member** (`voiceMatch` only; `voiceFixtures.ts` `RawMember`): an account made and logged in over the
  services' HTTP, seated in the game through the room service and the match socket's hello `{ game, ticket }` over `ws`
  (as `packages/central/test/hostHandover.test.ts`'s sockets are, here against the spec's own server); it answers the
  launch with `loaded`, talks as the page's client does on the wire (`voiceTalk`, then `encodeVoiceUp` frames), counts
  every `voiceFloor` entry and every voice frame down (`decodeVoiceDown`) by speaker, and in the round sends a command
  at once and then every 15 s turning its pitch 2 degrees, so the room's idle kick (W3.R13) does not empty the
  Terrorists' side.
- **The lobby's voice read**: `GameLobbyVoice.state()` (`gameLobbyHost.ts`, one public read added by this task, its
  unit test in `test/gameLobbyVoice.test.ts`): the lobby's voice client's own `VoiceState`, the same shape the match
  hook's `voice()` gives in a round.

### 4.2 `voiceMatch.spec.ts`: the menu path on MP2

One test, its steps `test.step`s. A is the game's host (a SEAL), B joins from the briefing room, C over the wire; A and B
are walked by their own scripts (`twoPagesMatch.spec.ts`'s walk, copied: that spec exports none).

| step | asserted | read through |
|---|---|---|
| 1. the lobby | the three seated; C on the lobby's channel 9 | the room's `gameLobby` and `voiceFloor` to C |
| 2. the lobby's talk | after A's first press (let go), A holds CIRCLE: A records (`can_talk` 1); B's lobby client plays A's frames, the tone above silence, and B's bar `PLAYERTACOVAR` names A, A's own does not; B presses too: B's talk flag set, `can_talk` 0, nothing sent, A still heard; C presses (`voiceTalk`, eight up frames): every entry C is told names A, none C, and C (on 9) receives A's frames; all inside A's hold, under 10 s; the floor free again at A's release and B's bar back to a space | `GameLobbyVoice` (`holder`, `recording`, `state()`), the front end's uiVar and valve, C's counts |
| 3. the sides | B to the SEALs by the lobby's own SWITCH TEAMS, C to the Terrorists (`switchTeams`); all READY; both pages in round 1, alive, out of the waiting room | the room's seats to C; the pages' lobby view; the match hook |
| 4. the round's routing | A and B on TEAM 0, C on 4 (TEAM with the side bit); after A's first press, A talks: B hears the tone from A (`speaker` A), B's HUD shows A's name with `action_channel_busy.tif`, A's HUD `action_ok_talk2.tif`, B's compass carries the `hud_talk.tif` mark (`hud().model.talkMarks`) when A is within its 900 units and none past them (the bodies' distance, read first, decides which is asserted); C receives no voice frame from the round's start | `MatchWindowHook.voice()`, `hud().model.voice` and `talkMarks`, `feet()`, C's counts |
| 5. mute | B, on the pad's Chat menu (CIRCLE tapped, TEAMMATES, A's row, MUTE OFF): A's `sent` rises by 15 frames while B plays none and the room still names A on B's channel; MUTE ON (after the row's 5 s, `TAUNT_DELAY_SECONDS`): B hears again | `taunts()` at each press; `voice()` |
| 6. RADIO OFF | A's RADIO > RADIO OFF: A on 11; his next press sends nothing, holds no floor, B hears nothing; RADIO ON (after the row's 5 s): A back on TEAM 0 | `voice()` |
| 7. A's death | A looks down (pitch -65) and throws frags at his own feet, up to six, until he dies; B, near, alive; A's channel 3, B's 0; A, dead, still holds the floor of 3 and sends, and B plays none of it | `alive()`, `hud().model` (the hand), `voice()` |

**MP2's rules, and the death's assertion.** A game made in CREATE GAME is a **classic** room: the bridge's
`roomOptions` (`packages/central/src/bridge.ts`) gives `rules: 'classic'`, and the room service refuses a respawn game
(`lobby.ts`, `RESPAWN_REFUSED_STATUS_PLACEHOLDER`). So step 7 asserts the classic death: `voiceDeath` (`room.ts`) asks
the dead zone for a classic room or a ghost (research 225 §5; `FUN_002c2c20` D:L164432-164436, the death's ask
D:L454485), and A is on 3 while B, alive, stays on 0. The positive half -- A holds 3's floor and sends -- makes B's
silence the routing's and not a press that sent nothing (the dead talk: `matchTaunts.ts`'s `talkAllowed` has no alive
test, `VOICE_DEAD_TALK_READING`'s strong reading). **The respawn routing cannot be pinned in any browser run**: the
server serves a hello's `respawn` as classic while `RESPAWN_RULES_ENABLED` is off (`main.ts`'s `RULES`, the owner's
ruling of 2026-09-29), and no menu-made game is respawn, so a respawn death (nothing asked, A keeps 0) rests on the
server's unit test (`roomVoiceRound.test.ts` RED 3).

**Why B survives A's frags.** Not by distance -- the M67's radius is 150 units (research 85, `Explosion_Radius` x10) and
A throws where he stands -- but by the friendly-fire gate: a CREATE GAME room has friendly fire off (the bridge's
`roomOptions` sets no `allowFriendlyFire`; `room.ts` `ffRefuses` refuses another of the thrower's side), while the
thrower himself is not spared.

**The frags.** One is not reliably lethal (the blast's fragments are random, `blast.ts`; `grenadeSelfMp.spec.ts`
accepts "hurt or killed", `remoteCombat.spec.ts` allows six), so up to six are thrown. Each try reads the hand off the
HUD's weapon box (`fireModeRow` false while a throwable is up): a throwable still up is thrown with R1 alone, since the
R2 inventory's highlight starts on the slot in the hand (`inventoryMenu.ts`) and its Up, Up would move off it; from any
other item the inventory takes the frag up first (R2, Up, Up, CROSS: `twoPagesMatch.spec.ts`'s). Each try's hand is in
the record (`frags`). **The pitch's sign**: negative is down -- the match hook's `aimAt` (`matchMount.ts`) sets
`atan2(dy, horizontal)` with `dy` the target's height less the eye's -- and -65 is inside the walking camera's -70..60
(`camera.ts` `setPitchLimits`); the first draft's -80 was outside it.

### 4.3 `voiceTestroom.spec.ts`: `/testroom`

Three `/testroom` pages on the spec's server (`?mode=play&mp&server=...&map=MP2&devmode&noarmory`). The room seats them
(`net/lobby.ts` `assignTeam`: p1 the Terrorists, p2 and p3 the SEALs). The pages open one after another, and the
classic room's 10 s launch countdown (`OWNER_LAUNCH_COUNTDOWN_S`, `rules.ts`) starts once p2 completes both sides, so
a p3 whose load outlasts it is seated after round 1 began: a ghost of round 1, the late joiner on the dead zone 3
(`room.ts` `voiceEnter`, `VOICE_LATE_JOINER_READING`) -- the race `remoteCombat.spec.ts` names. **So each page is not on
its side's channel as soon as round 1 is in play.** The spec takes the race as it comes: a page not alive or on 3 in
round 1 is asserted on 3 (the late joiner), the lone side's page ends round 1 with its own frags (its side eliminated),
and round 2 seats all three alive; only then is each page asserted on its side's channel (0, or 4 for the
Terrorists). One of the pair holds CIRCLE: his side's other page plays his frames, the tone above silence, his id the
speaker; the page on the other side plays none and its channel's entry is not his; then the other of the pair talks
back. The same part and the same hook as the menu path (`hook.voice()`, PF). The capture context's resume on a pad
press is observed, not assumed: the press is made on the pad alone first, and only if nothing is sent in 6 s is the
page given a click on its status line (a user activation) and the press made again; the log line says which.

### 4.4 What the specs skip on

- **No MP2 in the served tree** (`public/maps/index.json` and `RUN/MP2.ZDB`, extracted from the disc): both specs,
  said (`NO_MP2`). The match server reads `SOCOM_DISC`, else the same tree.
- **The fake-audio flags refused** (no audio track from `getUserMedia`) or **Opus at 8 kHz refused** by this Chromium
  (W20.R3, H-next d): the test, said with the probe's line (`probeSkip`).

A skip is reported as a skip, never as a pass.

### 4.5 Against the brief

- **The death comes last**, not before the mute: in a classic round the dead stay dead until the next round, so the
  steps that need A alive on B's channel (mute, RADIO) come first.
- **RADIO OFF is taken between two talks**, not under one: CIRCLE is both the talk and the Chat menu's key (W20.R9, one
  state machine), so a held talk cannot drive the menu; the assertion is that A's next press sends nothing on 11.
- **"Silent" is read on `heard`** (the frames played), not on `toneLevel`: the level is the last decoded block's RMS
  and is not reset when a talk ends (`voicePlayback.ts`), so it cannot fall to silence.
- **Mute with C on the other side**: the brief's "C on A's channel would still receive the frames" cannot hold with C a
  Terrorist; the spec asserts, as the brief's alternative says, B silent while A's `sent` rises, and C receiving no frame.
- **The lobby's level is the lobby client's own**: the match hook does not exist in the lobby, so B's `toneLevel` there
  is read through `GameLobbyVoice.state()` (added here: one public read, `gameLobbyHost.ts` claimed in HANDOFF §3);
  the lobby's busy icon is read as the state the disc's scripts draw it from (`can_talk` 0 with the talk flag set), not
  as pixels.
- **The HUD's talk-busy element and the `hud_talk.tif` mark** are read from the HUD's model (`hud().model.voice`,
  `talkMarks`), not from a frame -- the gate's "world talk indicators" (SPRINTS.md's sprint 20 gate) as drawn state.
- **`packages/viewer/test/flyAccess.test.ts`**: its list of the specs that play a match gains `voiceTestroom.spec.ts`
  (it joins its own server, as `grenadeSelfMp.spec.ts` does) -- a file the brief did not name, changed because the
  new spec made it red.
- **One number is the specs' own judgement**, not a game value: "above silence" is an RMS over 0.001 (-60 dBFS; the
  capture's noise suppression and gain, the setup page's constraints, W20.R14, may lower a steady tone). It is not a
  `*_READING` or `*_PLACEHOLDER` (the ledger walks `src/` and `tools/`). The first draft's 80 units between A and B
  before the frag is gone: B is spared by the friendly-fire gate, not by distance (§4.2).
- **The browser observations owed to 226** are taken at the run, not here, and written into 226 then: the packet sizes
  at 6 000 bit/s and the packets a frame (the per-flush count) as C received A's lobby frames (`RawMember.packets`, the
  `VOICE_MATCH record` line's `packetsFromA`), the worklet's URL in dev (the same line's `worklet`, from A's resource
  timing; the build's is the gate's), the capture context's resume on a pad press (`VOICE_TESTROOM`'s `activation`;
  the menu path's pages already hold a user activation from the walk's keys, so they cannot show it), and Chromium's
  8 kHz acceptance (the probe lines).

### 4.6 The record

*(The window's first finding, 2026-10-08 20:35Z: under Playwright's headless shell the probe found no track -- `getUserMedia` `NotSupportedError: Not supported` -- with WebCodecs Opus at 8 kHz accepted (encoder and decoder) and an 8 000 Hz context made; the full Chromium build in new headless answers `Fake Default Audio Input`, live (both 153.0.8010.12). The fixtures now launch the full build; HAZARDS browser and e2e. The second finding, 20:46Z: with the seats in one browser, A's 8 s CIRCLE hold set no talk flag -- the second seat's opening blurs the first and the game's pad reader stops on a blur (`controllerSetup.ts:71-73`); each seat now has a browser of its own, as two machines are.)*


**The runs** (the merge controller's browser window, 2026-10-08 20:35Z on; the lock FREE; from `wt-online/redotcom/` with the
data environment and `E2E_PORT=5370`, one file at a time, `--workers=1`; Chromium 153.0.8010.12, the full build, a browser per
page, SwiftShader): the table below, newest last; the stamps are the logs' server times. Before the first green, three page
findings fixed in the fixtures and the code and one page value the run alone could show: the headless shell's devices and the
pad reader's blur (the paragraph above), the encoder's fifth packet (CLOSE-FIX-2, 226 §1), the talk watchdog's 100 ms under a
loaded page (CLOSE-FIX-3, 226 §6). **What the checks below found, each number naming its run:** the click fallback was never
needed (every talk's `activation` in every run is "the pad press alone": the capture context ran before any gesture,
`contextState` running); the steady tone reached the listeners at 0.009-0.015 RMS in the match (B's `toneLevel`, the 0.001 bar:
0.009-0.012 on ecf644a0d, 0.010-0.015 on f8ff3825b) and 0.012-0.085 on `/testroom` (0.012 on the red run, 0.034 and 0.085 on the
green); the holds stayed under the cap (`heldMs` 963 lobby / 1 057 round on ecf644a0d, 1 004 / 768 on f8ff3825b; warm-ups 395 /
2 235 ms, then 264 / 2 543 ms); every CIRCLE tap opened its menu (the MUTE and RADIO rows both ways, the 5 s waited out); C's
socket stayed open with 6 floor entries seen in each run and A's lobby frames counted on the raw socket (38, then 34; 0 in the
round, the other side); the frags took one throw in each run (3 rounds in hand). A listener's page under three scenes receives
a fraction of the frames in a record's window (3 of 15 on the red `/testroom` run and its diagnostic, 5 and 3 on the green;
the diagnostic's server log showed no drop by the relay's bucket, the green run's was not read for it): host load, written as
such, never a pass.

**What the run's reader checks** (the static review of 663d13b32, owed to the run; each a line of the run's log):

- **The `/testroom` click fallback.** `voiceClient.ts`'s `open()` awaits the capture context's `resume()` inside the one
  first-press `open()` (`opening ??= open()`); a press after the click does not call `open()` again, so if the
  context stays suspended until a gesture and that pending `resume()` does not settle after the click, the run fails at
  "p sends" -- then that is a page finding for pad-only players (no gesture but the pad), not a spec fault.
- **The steady tone against Chromium's noise suppression** (the setup page's constraints, W20.R14): the levels B and
  the listeners log against the 0.001 RMS bar.
- **The 10 s recording cap**: `heldMs` in the lobby's and the round's records, and the warm-up's `lobbyWarmUp` /
  `roundWarmUp` (null: no frame went in 8 s).
- **CIRCLE taps within 0.3 s** at SwiftShader's frame rates (`tapPad`: one frame); a menu that does not open shows here.
- **The rows' 5 s** (`TAUNT_DELAY_SECONDS`) between MUTE OFF and MUTE ON and between RADIO OFF and RADIO ON: the spec
  waits it out with a second's margin (`chatMenu`'s `key`).
- **C's activity**: one command at once and then every 15 s; C's socket open (`closed` null) and its seat at the end.
- **The frags**: how many it took (`frags`), and what each try had in hand.

| run | host and lock | `voiceMatch` | `voiceTestroom` | probe | skipped | notes |
|---|---|---|---|---|---|---|
| 2026-10-08 21:13-21:16Z (the log's server times), `agent/online` ecf644a0d (CLOSE-FIX-2 in) | the owner's desktop, lock FREE, three browsers | **green**, 1 passed, 2.9 min: lobby A 38 frames of four packets (6-27 bytes, mean 14.9), B heard 37, speaker 1, bar `a1855`; round A 12 / B 12, B's HUD `action_channel_busy.tif`, C 0 frames; mute 20 sent / 0 heard, unmuted 8 heard; RADIO OFF 0 / 0; death A on channel 3, B heard 0 | (next row) | track live, `packetsPerFlush` 5, Opus 8 kHz both ways, context 8 kHz | none | no console or page errors; log `e2e-voiceMatch-8` in the seat's scratch |
| 2026-10-08 21:16Z, the same tree | the same | (above) | **red**, 1 failed, 23 s: p2 sent 14, p3 heard 9 with the tone and speaker 2, p1 heard 0 -- and p2's floor null a second into the hold (`:155`); the watchdog (226 §6); a diagnostic at 1 000 ms (21:18Z) passed both talks in 30 s (p2 15 sent / p3 3 heard; p3 28 / p2 3), not a record | the same, `packetsPerFlush` 5 | none | CLOSE-FIX-3; its re-run below |
| 2026-10-08 21:25-21:28Z, `agent/online` f8ff3825b (CLOSE-FIX-3 in) | the same | **green**, 1 passed, 3.0 min: lobby hold 19 frames; lobby A 34 frames of four packets (7-32 bytes, mean 15.0), B heard 19, speaker 1, bar `a20712`, C 6 floor entries and 34 frames on the raw socket; round A 11 / B 11, B's HUD busy mark, C 0; mute 22 / 0 then 10; RADIO OFF 0 / 0; death channel 3, B 0; warm-ups 264 / 2 543 ms, holds 1 004 / 768 ms | (next row) | the same, `packetsPerFlush` 5 | none | no console or page errors; `e2e-voiceMatch-9` |
| 2026-10-08 21:28-21:29Z, the same tree | the same | (above) | **green at 5 and 3 frames heard**, 1 passed, 34 s: p2 (SEAL, channel 0) sent 27, held the floor, p3 heard 5 with the tone (0.034 RMS) and speaker 2, p1 (Terrorist, channel 4) heard 0; then p3 sent 29, p2 heard 3 (0.085), p1 0; both on the pad press alone | the same | none | the listeners' few frames are the host's load (three scenes; whether the relay's bucket dropped any was not read in this run), not the spec's proof -- it proves the floor, the side and the tone; `e2e-voiceTestroom-3` |
