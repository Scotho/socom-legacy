# 203 -- R2-MN -- round 2: match, modes, net (the static reads owed by C1, M1 and M2)

- Research date: 2026-10-04 (research wave 1, round 2 and the close; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/R2-MN-match-modes-net.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/LEDGER-ALL.tsv`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V5 (create game, sort order, radio rows, C4 blocks, Medley) and V7 (claim 10) have landed and are folded in as §19 and §20; none wrong.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WT`; the archive's absolute root is dropped; references to the other reports are links to their notes; the claims research 206 §1 overrides are named under this header. The substance is verbatim.

Research agent R2-MN, research wave 2026-10-04, round 2. Read-only; nothing built or run; no server contacted; nothing
written outside `research-wave-2026-10-04/`. `D:L<n>` = a line of
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001); addresses r0001 unless marked r0004.
`$PORT` = the `agent/online` snapshot named in `BRIEF.md`. Scripts and outputs: `scratch/R2-MN/` (`README.md` there).
Ledger: `ledger-R2-MN.tsv` (28 rows: 22 RESOLVED, 4 PARTIAL, 2 UNRESOLVED). Grades per `BRIEF.md` rule 7 (PROVEN = a source reading, per wave-2's wording).

Scope: `OWED-CAPTURES.md` "Static reads still owed", the C1-owned bullets of "Match, combat, bodies" and all four
bullets of "Modes and net". C2 ([180](180-c2-movement-body-camera.md))/C3 bullets were left to R2-C2 ([201](201-r2-c2-movement.md))/R2-C3.

**One web read.** For the ban request's 120, the public Horizon fork `GitHubProUser67/horizon-server-public-extended`
was read through `gh api` (read-only; the file is copied to `scratch/R2-MN/web/`, commit in `web/SOURCE_SHA.txt`). It is
community lore: it only names a field whose position the game's code fixes. No other network use.

## 0. Summary

| item | status | grade | one-line answer |
|---|---|---|---|
| Create-game PLAYERS range (M1 ([192](192-m1-mp-modes-rules.md)) G19, W2 picker) | RESOLVED | PROVEN | 2, 4, ... 16 (+2, wraps to 2); default 16 |
| Create-game ROUND TIME range (M1 G15) | RESOLVED | PROVEN | 4..10 min (wraps to 4) = 240..600 s; default 6; respawn forces 20 min and disables the button |
| Create-game ROUND COUNT range (M1 G15) | RESOLVED | PROVEN | 3, 5, 7, 9, 11 (wraps to 3); default 11; respawn forces 1 and disables the button |
| Create-game other options | RESOLVED | PROVEN | SPECTATORS 0 <-> 8 online / 4 LAN; EQlimit 0..4; FF 0/1 (default 1); clan 0..4 |
| `mp_game_sort_order` (M1 G31) | RESOLVED | STRONG | the game list's sort key (ascending, ties by name); a created game is 127 |
| `mp_persistent` (M1 G31) | PARTIAL | STRONG code / BELIEVED meaning | gates a CreateGame-failure fallback (find by name and join) and a migrated host's Lock button |
| `mp_prog_timer1` | RESOLVED | STRONG | no reader anywhere (code or disc); nothing to port |
| TCM row table per mode (RADIO_MENU, M1 G27-G30) | RESOLVED | PROVEN | the full tree; DEFUSE BOMB only in BREACH/DEMOLITION, PROTECT only in ESCORT/EXTRACTION |
| TCM radio lines for 4 orders | PARTIAL | BELIEVED | CLEAR AREA, DEFUSE, PROTECT, POINT have no `multiplayer` row: no line or sound |
| Ban request's 120 (VOTE_BANSELF_REQUEST) | RESOLVED | STRONG layout / BELIEVED unit | `BanMinutes` = 120: the server bans the account from that world for 2 hours |
| `late_joiner`'s codes | RESOLVED | STRONG | the Game Signal carries the host's MP_MAJOR state: 0/1 lobby, 13 GAMELOBBY release, 14 GHOST, else late |
| FF team bit `+0x20000` | RESOLVED | STRONG | FIRETEAM bit 17 = ESCORTEE; players never carry it; FF off never shields a hostage or VIP |
| Kind-3 damage blocks / C4 targets | RESOLVED | PROVEN data / STRONG fields | `Anim_Health` = {node, health, armor, shield}; accepted when health > 0 and shield <= damage; per-map table |
| Anim-type names (FLINCH_GATE, FLINCH_STANCE) | RESOLVED | STRONG | states 8 Dead, 9 Carrying, 10 Carried, 5 ClimbLadder; kinds 1 Stand, 0x12 Crouch, 0x1a Prone, 0x11/0x13/0x19 the changes |
| REMOTE_KIT_APPLY's two shorts | RESOLVED | PROVEN | ammo_count and mag_count |
| Footfall list `+0xd8` sorted? | RESOLVED | STRONG | yes, ascending distance², lazily re-sorted: the gate takes the 3 nearest |
| `CMPExitState` -> game state (ROUND_START_PROJECTILES) | RESOLVED | STRONG | no reload between rounds; the round end retires every projectile online |
| TITLE_PLACEHOLDER duplicate NAME | PARTIAL | PROVEN load / BELIEVED draw | the loader keeps both `TitleBar`s; nothing hides one |
| STEP_PROBE_LIFT | PARTIAL | STRONG formula / UNRESOLVED value | origin = position + R x (posed node translation); the value needs the posed bone |
| SPINELO_RADIUS | UNRESOLVED | -- | not attempted (low priority) |
| GameStats bytes decode (M1 G21) | UNRESOLVED | -- | the Horizon logs print `System.Byte[]`: no byte is in our corpus |
| `SetMPMissionSeq(PLAYLISTVAR)` (M1 G21/G16) | RESOLVED | PROVEN | Medley expands to 29 maps in missionlist order, Random to one drawn map; clan games double each entry |
| r0004 twin of `FUN_002ce930` / 0x475afc (M2 ([193](193-m2-mp-net-replication.md)) §9.5) | RESOLVED | PROVEN | twin 0x2eb840 uses 0x450a60; 0x475afc is a SOCOM 1 demo symbol |
| `FUN_00623330` "bandwidth caps" | RESOLVED | STRONG | the DME's `NetSetBufferSize`: send buffer 8 KiB online / 32 KiB LAN, receive 32 KiB; not a rate |

---

## 1. The Create Game option ranges (M1 G15/G19/G20; OWED "dlgCreateGame cycle scripts"; W2 "picker ranges")

**Name.** `$PORT/packages/central/src/main.ts:72` (`ROUND_SECONDS` 360, `MAX_ROUNDS` 11 for every room); M1 G15/G19.

**What it stands for.** The values the CREATE GAME screen lets a host pick.

**Current value.** Fixed: 360 s, 11 rounds, 16 players, spectator guard 32.

**Prior search.** M1: "PLAYERS and ROUND COUNT ranges UNRESOLVED -- I did not decode the cycling scripts". C1 ([179](179-c1-match-server.md)) C had
already dumped the scripts (`scratch/C1/C/dlgCreateGame_ui.out`) and read the respawn values and "2..16".

**What I did.** Re-ran C1's decoder on `RUN/UIZANIM.ZAR` set `dlgCreateGame.rdr` (`ui_set_dump.ts` ->
`dlgCreateGame_ui.out`, byte-identical to C1's) and compacted it (`compact_ui.py` -> `dlgCreateGame_compact.out`).
Read each button's cycle anim, `refresh_cg_screen` (the valve -> caption and engine valve map), `SetDefaultStatus`
(RESTORE DEFAULTS) and `init_cg_screen`. Checked which anims the layout hooks (`../C1/C/createGame_rdr.out` L734, L883-897).

**Answer (PROVEN, disc scripts).**

| option | cycle (anim) | default | engine valve |
|---|---|---|---|
| PLAYERS (`MaxPlayersValve`) | += 2, > 16 -> 2: **2, 4, 6, 8, 10, 12, 14, 16** (`incr_num_players`) | 16 | caption only |
| ROUND TIME (`RTimeValve`) | **4 -> 5 -> ... -> 10 -> 4** (`SetRT_valve`) | 6 | `mp_max_round_time` = minutes x 60: 240..600 (UIMnLOC 273-279); 20 -> "20 minutes", 1200 |
| ROUND COUNT (`RCountValve`) | **3 -> 5 -> 7 -> 9 -> 11 -> 3** (`SetNR_valve`) | 11 | `mp_max_rounds` 3..11; 1 when respawn |
| SPECTATORS (`MaxSpectatorsValve`) | 0 <-> 8 online, 0 <-> 4 LAN (`SpectatorSet`); turning on asks the spectator password online | 8 / 4 | GameStats [4] |
| EQUIPMENT (`EQlimit`) | 0 -> 1 -> 2 -> 3 -> 4 -> 0 (`SetEQ_limit_valve`) | 0 | GameStats [5] |
| FRIENDLY FIRE | 0 <-> 1 (`set_FF_valve`; 257 / 258 captions) | **1** | `mp_friendly_fire` |
| CLAN AFFILIATION | 0..4 (`FiddleClanAffiliation`) | 0 | 4 = clan game (see §14) |
| RESPAWN | toggles; on: RTime 20, RCount 1, the two buttons disabled, `RemoveNonSuppressionMaps` (`set_respawn_valve`, `refresh_cg_screen`) | off | `mp_allow_respawn` |

The round time and count buttons are disabled while respawn is on (`refresh_cg_screen`: `DisableButton RoundTime_btn`,
`NumberRounds_btn`), so 20 min / 1 round is never cycled. Leaving the screen saves every valve to `*_saved`
(`create_game_exit`) and `init_cg_screen` restores them on return.

Cross-check with a capture: the s4 game's world report (`logs/parity/s4_pcsx2/slice-Medius.log` L14) carries
`MaxPlayers:24`, which `FUN_002edda0` (D:L190542-190563) builds as `MaxPlayersValve + MaxSpectatorsValve` = 16 + 8, and
`GenericField2:0000FDE8` = the 65000 at D:L190573. Its `GameName:test$~Channel 1` is `FUN_002f9410`'s
"<name>$~<room>" (D:L197738-197749).

**Implementation suggestion.** In `@s2u/server` (or the lobby service that creates games): `CREATE_GAME_OPTIONS =
{ players: [2,4,6,8,10,12,14,16], roundMinutes: [4,5,6,7,8,9,10], roundCounts: [3,5,7,9,11], spectators: { online: 8,
lan: 4 }, defaults: { players: 16, roundMinutes: 6, rounds: 11, friendlyFire: 1, eqLimit: 0 }, respawn: { minutes: 20,
rounds: 1 } }`, and the room's `roundSeconds`/`maxRounds` from the created game (M1's `RoomOptions`). Tests first:
`createGame.test.ts` "ROUND COUNT after 11 is 3", "ROUND TIME after 10 is 4", "PLAYERS after 16 is 2", "respawn
forces 1 round of 1200 s and refuses a round-time change". The world report's MaxPlayers = players + spectators.

**Owed evidence.** None.

## 2. `mp_game_sort_order`, `mp_persistent`, `mp_prog_timer1` (M1 G31; C1 GAME_OBJECT_MISC_VALVES)

**Prior search.** C1: "`mp_persistent` sent as bit 7 ... `mp_prog_timer1` has no code reader by offset ... the last
two's meaning is not read". M1 G31: "written to the game state (bit 7) / GameStats byte 6; meaning not read".

**What I did.** Found every reference to the three names' ELF strings (strings file: 0x3f1188/0x3f4948/0x3f5b18
`mp_persistent`, 0x3f58f0 `mp_game_sort_order`, 0x3f1130 `mp_prog_timer1`): D:L149587, 149610, 190605, 196734, 197181,
197758-197764. Read each function; grepped every disc archive (`grep_valves_disc.py` -> `grep_valves_disc.out`), found
the member (`rdr_find.ts` -> `readerc_valves.out`: `RUN/READERC.ZAR global_valves.rdr`, all three declared 0,
`global_valves.out`), dumped the scripts that name them (`ui_dlgMPBriefingRoom/LANBriefingRoom/GameLobby.rdr.compact`).

**Answer -- `mp_game_sort_order` (STRONG: the code is unambiguous; the name agrees).**
- The game list is sorted before it is shown: `FUN_002e2ce0` (D:L184407) calls `FUN_002e4530` -> an introsort
  `FUN_002e4a90`/`FUN_002e5760` (D:L185566-185778, D:L185942-186009) with the comparator "record `+0x1a0` ascending,
  ties by the game name `+0x4c` with `FUN_00198b80` (case-insensitive compare)".
- Record `+0x1a0` is GameStats byte 6: the join path copies `+0x19e`, `+0x19f`, `+0x1a0` into `MaxSpectatorsValve`,
  `EQlimit`, `mp_game_sort_order` (`FUN_002f83b0` D:L197180-197260), matching M1's 'D' layout [4], [5], [6]
  (`FUN_002f7c40` D:L196728-196736).
- Writers: CreateMPGame (`FUN_002f9410`, UI command 44) sets it to **0x7f (127)** just before creating
  (D:L197764-197769); JoinMPGame (`FUN_002f83b0`, UI command 45) copies the listed game's byte; the host reports its value
  in GameStats [6]. No disc script names it.
- So every game a player creates sorts after any listed game with a lower byte; among player games the order is by
  name. Lower values can only come from games our code did not create (server-side listings); none exist on our stack.

**Answer -- `mp_persistent` (STRONG for the code paths; BELIEVED for the meaning).**
- Writers: Create Game's `GameNameAct` runs on the screen's ONSTART (`createGame_rdr.out` L734) and sets 1; the
  briefing rooms' `OnBriefingRoomstart` set 0 unless `NoExitState == 1`; CreateMPGame (`FUN_002f9410` D:L197758-197762)
  sets 0 when it creates; clients take the host's value from GameState byte 0x19 bit 7 (`FUN_002c0850`
  D:L163387-163401; sent by `FUN_002a9ee0` D:L150770-150771 / `FUN_002c00f0` D:L163108-163109).
- Readers: (1) the CreateGame callback `FUN_002ee090` (D:L190603-190636): on failure, `mp_persistent == 0` shows
  `MP_GAME_NAME_EXISTS` (status -975 = Horizon `MediusGameNameExists`, `Types.cs` L95) or `MP_MEDIUS_JOIN_GAME_FAILURE`;
  `!= 0` instead sends `FindGameByName` (`FUN_00648fb8`, 0x6c bytes with the 64-byte name) and joins the world it returns
  (`FUN_002ee210` D:L190656-190664, state 0xf = LOBBY_STATE JOIN_GAME). (2) `dlgGameLobby` `Session_master_migration`:
  a console that becomes session master enables the **Lock** button only when `mp_persistent == 0`.
- The JoinMPGame path creates the listed game itself when its world id is negative (`FUN_002f83b0` D:L197357-197389:
  password off, MaxPlayers 16, spectators 8/4, state 0xd = CREATE_NEW_GAME) without touching `mp_persistent` -- the case
  the find-and-join fallback serves (two consoles instantiating the same listed game).
- Meaning (BELIEVED): "this game is a persistent listing": it is re-joined by name rather than refused, and a
  migrated host may not lock it. For games our players create it is always 0 (CreateMPGame clears it).

**Answer -- `mp_prog_timer1` (STRONG).** Created with default 30 (`FUN_002a76d0` D:L149587), declared 0 in
`global_valves.rdr`, named by no other disc file, no code reads game object `+0x50` (C1's offset scan). A dead valve.

**Implementation suggestion.** Lobby list (ONL-12): sort games by `(gameStats[6], name.toLowerCase())`, write 127 in
GameStats [6] for every created game. Test: "two games 'b' and 'A' with byte 127 list as A, b; a byte-0 game lists
first". `mp_persistent`: nothing to build while all games are player-created (always 0); the Lock button is offered
to a migrated host. `mp_prog_timer1`: nothing.

**Owed evidence.** Whether Sony's server ever listed world-less "persistent" games (sort < 127): not observable on our
stack (an owner's call, like C8's ([187](187-c8-card-online-services.md)) server rules).

## 3. The TCM (radio menu) rows per mode (C1 RADIO_MENU_PLACEHOLDER; M1 G27-G30)

**Name.** `$PORT/packages/viewer/src/netPage.ts:329` (`RADIO_MENU_PLACEHOLDER`; the page shows only TEAMMATES > VOTE).

**Prior search.** C1: "the look is drawn by code (`FUN_00232bc0` / `FUN_002344e0`) and unread". M1 G30: "0x2e enabled
only in modes 1/2; 0x2f only in 3/4 ... which commands those are is not read (owed: the TCM row table)".

**What I did.** `tcm_tree.py` prints `FUN_002344e0` (D:L83719-83805) with every string operand read from the ELF
(`tcm_tree.out`); `cmd_names.py` resolves the comm ids through `FUN_0058ed60` (D:L449781-449880) and `FUN_0058ef80`
(D:L449886-449987); `orders_mp_rows.py` checks the `orders.rdr` `multiplayer` rows (C1's dump). Read the enable
functions `FUN_0022fa90`, `FUN_0022f810`, `FUN_002301e0` and the senders `FUN_0022fc00`, `FUN_0022f9c0`.

**Answer (PROVEN, `FUN_002344e0` D:L83757-83805; node add `FUN_002306e0(tree, label, action, arg, enable, arg)`).**

| branch | rows (command id) | enable |
|---|---|---|
| TACTICAL ORDERS | MP HOLD FIRE (6 `CMD_HOLDFIRE`), MP FIRE AT WILL (3 `CMD_FIREATWILL`), MP CLEAR AREA (0x17 `CMD_CLEARAREA`), MP COVER ME (0x2d), **MP DEFUSE BOMB (0x2e)**, **MP PROTECT (0x2f)**, MP POINT (0x30) | `FUN_0022fa90`: 0x2e disabled unless mode (game `+0x111`) is 1 BREACH or 2 DEMOLITION; 0x2f disabled unless 3 ESCORT or 4 EXTRACTION |
| TAUNTS | CHARACTER TAUNT (random `CMD_MP_TAUNT1..7` = 0x3b + rand%7), CUSTOM TAUNT 01-05 (0x36-0x3a, the player's text) | `FUN_0022f810` |
| MESSAGES | CUSTOM MSG 1-5 (0x31-0x35 `CMD_MP_SOP1..5`, the player's text) | -- |
| RADIO | RADIO ONOFF ("RADIO ON"/"RADIO OFF"); ACTIVE CHANNEL: TEAM, OFFENSE (2), DEFENSE (1) | `FUN_0022f810` |
| TEAMMATES | PLAYER 1-8 > VOTE RETAIN:REMOVE, MUTE ON:OFF | -- |
| SPECTATORS | VOTE ALL ON:OFF | -- |

So per mode: SUPPRESSION shows 5 tactical orders; BREACH and DEMOLITION add DEFUSE BOMB; ESCORT and EXTRACTION add
PROTECT. "Disabled" is the enable function's non-zero return; `FUN_0022f810` returns 0 (enabled) for a living
body or an online spectator, which fixes the polarity (BELIEVED on whether disabled rows are hidden or greyed).

Targets (STRONG code, BELIEVED meaning): orders and custom messages are sent with target -3 from a SEAL / -2 from a
terrorist, taunts the other way round (D:L81696-81721, D:L81604-81615) -- i.e. orders to one's own side, taunts to the
enemy. Each is sent with `FUN_002bad40` (the Message packet), played locally with `FUN_005e7f20`, then
`FUN_00232240(5.0, tcm)`.

Radio lines (BELIEVED): `orders.rdr`'s `multiplayer` table (25 rows, `orders_mp_rows.out`) has rows for HOLDFIRE,
FIREATWILL, COVER_ME and the taunts, **none for CLEARAREA, MP_DEFUSE, MP_PROTECT, MP_POINT**. `FUN_005e7960`
(D:L498084-498110) fills the line and sound only from a matching row, so those four post nothing (not traced to the
screen).

**Implementation suggestion.** `netPage.ts`: replace the vote-only list with the tree above, built from a static
`TCM_TREE` constant citing D:L83757-83805, with `enabled(row, mode)` = FUN_0022fa90's rule. Test first
(`tcmTree.test.ts`): "SUPPRESSION offers 5 tactical orders; DEMOLITION adds DEFUSE BOMB; EXTRACTION adds PROTECT";
"a taunt goes to the enemy side, an order to one's own". The visible look (TCM.tif, slide) remains C1's owed capture
(S3.21).

**Owed evidence.** The TCM's look (S3.21) and whether a disabled row is hidden or greyed.

## 4. The ban request's 120 (C1 VOTE_BANSELF_REQUEST, VOTE_BAN_SCOPE_PLACEHOLDER)

**Name.** `$PORT/packages/match/src/room.ts:110-111` (`VOTE_BAN_MS` = 10 min), `:2349`.

**Prior search.** C1: "field +0x2c = 120 (unit unread) ... no `MediusBanPlayerRequest` model in Horizon, none in reCOM".

**What I did.** Searched `research/` (only Horizon's enum), the SOCOM 1 demo's DWARF (`.debug` holds no Medius struct;
only the symbol names `MediusBanPlayer`, `PacketTypeBanPlayerRequest`, `MediusUniqueCallbackBanPlayerRequestHandler`),
then read the public extended Horizon fork's model with `gh api` (`scratch/R2-MN/web/MediusBanPlayerRequest.cs`).

**Answer.** The model's field order -- MessageID, SessionKey, `BanAccountID` (int), `BanMinutes` (int),
`MediusWorldID` (int), `AppType` -- is exactly the game's request: `FUN_002f95f0` writes +0x28 = own account id,
**+0x2c = 120** (`addiu v0, zero, 0x78` at 0x2f9638), +0x30 = world id, +0x34 = 0 (C1, re-read). Layout STRONG (code +
an independent model). Unit BELIEVED: the name is the emulator authors', not Sony's SDK -> **120 minutes (2 hours)**,
per account, per world.

**Implementation suggestion.** `room.ts`: `VOTE_BAN_MS = 120 * 60_000` renamed `VOTE_BAN_MINUTES_READING = 120`
(cite 0x2f9638 and the model), keyed by session token as C1 advised. Test: "a removed player's token is refused for
120 minutes, then admitted".

**Owed evidence.** To raise the unit to STRONG: S3.23 (our Horizon logging the 0x8A request) only shows the 120 again;
the unit needs Sony's SDK header or a ban observed to expire.

## 5. `late_joiner`'s message codes (C1 LATE_JOINER)

**Prior search.** C1: "set when a received game-state message's byte is 2 or more (and not 0xe) ... the message codes'
meaning not traced".

**What I did.** Read the receiver `FUN_002b9150` (D:L159172-159393, the "Game Signal" message, 20 bytes) and every
sender: `FUN_002b97f0` (D:L159398-159435), the host's join answers in `FUN_002bc620` (D:L161247-161492),
`SetMenuState` (UI command 29 = `FUN_0027c9f0`, D:L125560-125590). Named the values with the SOCOM 1 demo's DWARF enums
(`scratch/H1/demo_enums_all.txt`; copied lines in `demo_enums_used.out`).

**Answer (STRONG: code + the demo's enum names, consistent everywhere they meet).** The message: +8 u32 (elapsed
seconds or the clock), **+0xc the host's `mp_major_game_state`** (game `+0x114`), +0xd the seat (1 SEAL, 2
terrorist, 3 spectator, 4 refused), +0xe a slot or, when refused, the reason, +0xf the mode, +0x10 the side-swap flag.

| +0xc (MP_MAJOR_GAME_STATE) | receiver |
|---|---|
| 0 UNKNOWN, 1 MENUS | `late_joiner = 0`; seat taken (D:L159263-159278) |
| 13 GAMELOBBY | the release: a waiting joiner (`+0xcc`) in state 1 takes the mode and sends its objects 4, 5; `ON_FORCE_NEW_DB`. Sent by `SetMenuState` to every slot marked a late join (`0x441580` top bits = 1) when the host returns to the lobby (D:L125578-125586) |
| 14 GHOST | `game+0xd1 = 1` (no sender found) |
| 2 LOADING .. 6 GAMEOVER, 12 PLAY | **`late_joiner = 1`**, round clock, seat, player-list caption; the host marks the slot 0x40 (late) instead of 0x80 (D:L161460-161465) |

Refusals (+0xd = 4), +0xe: 0 "General Protection Fault", 1 "Password Error" (password hash mismatch, D:L161303), 2 "Too
many spectators", 3 "Too many players", 4 "Closed clan game" -> popup `MP_EJECT_SPECTATOR` with that text. The same enum
also names the `+0x113` replicated state (2 load, 3 in play, 4 round over, 5 new round, 6 game over: D:L55633,
D:L150662-150665, D:L127391), and LOBBY_STATE names the lobby machine's 0xb/0xd/0xf/0x11 (LOBBY_ACTIVE, CREATE_NEW_GAME,
JOIN_GAME, READY_TO_CONNECT -- `create_game` waits for `socom_online_state == 17`).

**Implementation suggestion.** The room's join answer (protocol) should carry the room phase as the original's
codes: lobby -> seat; in round/between rounds -> ghost seat with `lateJoiner`; release at the return to lobby. Test:
"a join during a round is seated as a ghost and released when GAME COMPLETE returns to the lobby". Refusal texts: the
five above.

## 6. The friendly-fire team bit `+0x20000` (C1 FRIENDLY_FIRE_ENFORCEMENT)

**What I did.** Mapped Harry's r0004 0x2c509c "save player team var" to r0001 0x2c342c (`c1lib.r4_to_r1`), inside
`FUN_002c3330` (D:L164816-164875); read it with `FUN_002c32c0`/`FUN_002c32e0`; the demo DWARF `FIRETEAM` enum.

**Answer (STRONG).** Player team words are SEAL `0x80000100`, terrorist `0x40000001` (swapped by the clan side-swap
flag `DAT_004412d8`) and spectator `0x10000`; `player_team` = 0 / 8 / 16. No player ever carries `0x20000`, which is
FIRETEAM bit 17 `FT_ESCORTEE` (ALLIES 31, ENEMIES 30). The FF gate's `(victim+0xc8 & 0x20000) == 0` therefore exempts
escortees: a hostage (MP6 `vehicles.rdr` team 17 30 31 = 0xC0020000, H1 ([189](189-h1-hostage-ai-animation.md))) shares a bit with both sides, so without the
exemption FF-off would make hostages and VIPs unhittable; with it, they are always hittable.

**Implementation suggestion.** Room: friendly-fire refusal applies only between player teams; a hostage/VIP body is
never protected by it. Test (with the hostage work): "FF off, a SEAL's bullet damages a hostage".

## 7. The C4 targets: the kind-3 damage blocks of every MP map (C1 C4_TARGET_READING)

**Name.** `$PORT/packages/viewer/src/equipment.ts:124-138` (`actions.rdr`'s type-less actions as the target set).

**Prior search.** C1: "which nodes of each map carry such an object is the undecoded kind-3 zAnim damage block
(`FUN_002713f0` D:L119312-119335)"; the port's parser keeps `Anim_Health` as a length only ("Not decoded",
`$PORT/packages/scene/src/zanim.ts`).

**What I did.** Read `FUN_002713f0` (builds a destructible when the anim's state is 1 or 5 and flags & 7 == 3),
`FUN_002740e0` (D:L121135-121218: the 0x24-byte object, vtable 0x406090), disassembled its accept slot 0x2739b0
(`dis_2739b0_destructible_accept.out`), matched the object with reCOM's `CZAnimEx` (`zAnim/zanim.h`: vtable, anim,
node, root, shield, armor, armor_max, health, health_max). `anim_health.ts` decodes every `Anim_Health` key of all 22
`MPxx.ZDB:MZANIM.ZAR`s (`anim_health.out`); `anim_health_summary.py` groups them (`anim_health_summary.out`).

**Answer.** Block (24 bytes): +0 u8 node reference (into the anim's node list; `FUN_0026f4e0`), **+4 f32 health**
(-> object [7] and [8]), +8 f32 (equals +4 on every block), **+0xc f32 armor** (-> [5], [6]; 0 everywhere), +0x10 f32
(0 everywhere), **+0x14 f32 shield** (-> [4]). Accept (0x2739b0, PROVEN by the operands): `health > 0` and
`shield <= damage`. Data PROVEN; the field naming STRONG (code + reCOM).

| map | live destructibles (health / shield: names) |
|---|---|
| MP1 | 1/10 outhouse1-2; 2/21 destroy_terrorist_base, destroy_seal_base; (snow_window01-03 health 0) |
| MP2 | 1/0 door_slab |
| MP6 | 1/0 x23 (tincups, plates, outdoor lights, ashtrays, hit_secret); 80/0 truck_stop_gas_hit; 1/9 pallets x4; 1/9.9 crates, tire_pile_hit, barrel_dest x10; **1/17 access1-6**; 150/150 destroy_fuel1-2; (plankaccess1-3 health 0; 18 beer anims not built, kind 1) |
| MP7 | 1/0 x5; 0.1/0 spinner_hit, dishnetwork_hit; 1/9 x11 (crates, guns); 2/21 bases |
| MP9 | 2/21 bases; 1/45 x19 (big_shack, ammo_depot, gcrate x8, bbox x9) |
| MP11, MP51, MP64, MP82 | 1/17 access1-6 (plankaccess health 0) |
| MP12 | 0.2/12 ant_base1, tower_hitme; 2/21 bases |
| MP52, MP72 | 2/21 bases |
| MP61, MP83 | 1/17 access1-6; 2/21 bases |
| MP62 | 0.1/0 drug bulbs x4; 1/17 access1-6; 2/21 bases |
| MP71 | 1/0 wframe; 1/17 access1-6 |
| MP73 | 1/0 kill_radio, wglass; 1/9 destroy_aagun; 1/17 kill_rtower, access1-6; 0.1/21 destroy_comm_wall; 2/21 bases |
| MP5, MP8, MP10, MP53, MP81 | none |

With ZWEAPON's explosion damage (`../C1/B/zweapon_ammo.out`: C4 18, Satchel 20, MPBOMB 50), a C4 (18) passes every
shield <= 18 (the access doors 17, crates, lights); the bases (21) need the bomb; MP9's depots (45) need the bomb; MP6's
fuel (150) nothing on file. That the damage argument of the accept call is the charge's explosion damage is BELIEVED
(the caller was not traced).

**Implementation suggestion.** `@s2u/scene` `zanim.ts`: decode `Anim_Health` to `{ node, health, armor, shield }`;
`equipment.ts` `c4Targets` = anims with state 1|5, flags&7 == 3, health > 0 and `shield <= C4 explosion damage`, at
their block node, picked by the crosshair ray (C1's rule) -- replacing the `actions.rdr` stand-in. Tests first: a
fixture over MP51 yields access1-6 (health 1, shield 17) and nothing else; "C4 (18) is refused on a base (21)".

**Owed evidence.** The damage value passed to `+0x10` by the C4 placement path (a trace or a read of the caller).

## 8. Anim-type and state names (C1 FLINCH_GATE_READING, FLINCH_STANCE_READING)

**What I did.** C2's static table (`../C2/nametable.py 661060 661160` -> `animtype_names_0_63.out`) and the demo DWARF
`SEAL_STATE` enum.

**Answer (STRONG: the r0001 table's names fit every use C1 read).** Motion kinds: 1 **Stand**, 0x12 **Crouch**, 0x1a
**Prone** (the base kinds the flinch pops to), 0x11 **Stand -> Crouch**, 0x13 **Crouch -> Prone**, 0x19 **Stand ->
Prone** (C1's inference confirmed), 0x35-0x37 **Rifle -> Pistol** stand/crouch/prone (the swap gate), 0x2f **Fall
forward**. States (actor `+0x174`, demo `SEAL_STATE`): 5 stateClimbLadder, 7 stateIdle, **8 stateDead, 9
stateCarrying, 10 stateCarried**. (The demo's `AnimType` enum is SOCOM 1's and is shifted from SOCOM II's table; use
the r0001 table.)

**Implementation suggestion.** In `remotePlayers.ts`/`walk.ts` the flinch refusal names these states: dead, carrying,
carried, ladder (no carry exists in the port); FLINCH_STANCE's transition rows as C1 wrote. Rename both readings to
sourced constants.

## 9. REMOTE_KIT_APPLY's two shorts (C1 Part E)

**Answer (PROVEN).** The local kit is built from `character.rdr` `default_weapons` entries -- keys `wep_name`,
`ammo_name`, `ammo_count`, `mag_count` (strings 0x65bf50-0x65bf90; `FUN_0053ce00` D:L406385-406397) -- into 12-byte
items {u8 weapon, u8 ammo, u32 ammo_count, u32 mag_count}; the net record packs each as {u16 = `FUN_003d1c70(weapon,
ammo)`, u16 ammo_count, u16 mag_count} (`FUN_0053ed50` D:L407399-407403) and the remote rebuilds it
(`FUN_0053ec60` D:L407368-407377). The two shorts are **ammo_count and mag_count**.

**Implementation suggestion.** The `spawn` kit should carry per-item ammo and magazine counts (the remote's reload
and pickups need them). Test: a remote body's kit after spawn holds the sender's counts.

## 10. Is the footfall list `+0xd8` distance-sorted? (C1 footfall gate)

**Answer (STRONG).** `FUN_002a0a10` (D:L145876-145995) fills each 0x30-byte entry with the vector to another actor and
its squared length (+0x10); when the list is rebuilt, or an entry inside `+0xcc` is found more than 100 u² (DAT_003de2f0
= 100.0) closer than its predecessor, it sorts the prefix with `FUN_002a12e0(..., 0x2a1140)`, whose comparator is
`a.d² < b.d²` (`dis_2a1140_cmp.out`) -- on the actor's scheduled turn (`FUN_002a0a10(actor, 0, turn)`, D:L145768). So
`FUN_00552850`'s "first 3 within 500" is the **3 nearest**, up to a 100 u² tolerance.

**Implementation suggestion.** The page sounds footsteps of the viewer plus the 3 nearest other living bodies within
500 u. Test: with 5 bodies at 100..500 u, only the 3 nearest step audibly.

## 11. `CMPExitState` -> game state (C1 ROUND_START_PROJECTILES_READING)

**Prior search.** C1: "the projectile manager's clear is in the level's load/teardown; that the next round passes
through it is still read from research 91, not traced".

**What I did.** Read `CMPExitState`'s round start `FUN_00223680` (D:L75914-75937), the state stack ops `FUN_002cf2f0`
(pop) / `FUN_002cf410` (push) (D:L172224-172297), every caller of the level loader `FUN_001ea720`, every reference to
the projectile manager 0x4b5220 (`../M2/scan_refs.py`), and `FUN_002aa910` (D:L151203-151253).

**Answer (STRONG).** Between rounds there is no level load: in states 3/5 `CMPExitState` re-places the players, resets
the round (`FUN_002a7d40`) and **pops itself** back to the running game state (`FUN_002cf2f0(0x4084c0, 0)`, D:L75936);
the loader `FUN_001ea720` runs only from the loading paths (`FUN_001ebba0`, `FUN_001ebda0`). The projectiles are
retired at the **round end** instead: online, `FUN_002aa910` (called by the round-over paths D:L150563-150668 and the
clock D:L151131) calls `FUN_003cceb0(manager, local player, -1)`, which frees the local player's projectiles of every
kind, and `FUN_003ccc90(manager)`, which flags every live projectile (`+6` bit 0x4). Nothing crosses into the next
round. That bit 0x4 means "retire" is BELIEVED.

**Implementation suggestion.** The room's `clearAir` at round start is equivalent (no projectile lives across the
screens). Retire the name; cite D:L151233-151243. Test exists.

## 12. Two dialog objects with one NAME (C1 TITLE_PLACEHOLDER)

**Answer.** The dialog loader `FUN_00381550` loads `CONTROLS` into `+0x4c` and `OBJECTS` into `+0x58`
(D:L277381-277382) through `FUN_00383360`, which appends every entry it can build, with no name check
(D:L278279-278337): both `TitleBar` controls of `dlgMultiplayerFinal.rdr` (`../C1/D/compact_READERX_dlgMultiplayerFinal.rdr.out`
L34, L38) exist. No script names either, so both are drawn (BELIEVED: the draw walk was not read): "FINAL ROUND" large
at (75,50) and "GAME COMPLETE" small at (15,45) in `font_titlebar_01`.

**Implementation suggestion.** FINAL ROUND draws both captions. Owed: S3.22 confirms.

## 13. STEP_PROBE_LIFT (C1) and SPINELO_RADIUS (C1)

**STEP_PROBE_LIFT (PARTIAL).** `FUN_005b0840` (D:L467198-467291): origin = actor `+0xf54..+0xf5c` (y raised to at least
`DAT_0066aab8`, a .bss value set at D:L417824) plus the 3x3 rotation of the actor matrix (`+0x28`) applied to the
translation `+0x30..+0x38` of the node that vtable `+0x88` returns (`+0xc`); in state 3 (statePeek) only the y is added.
The value is that node's posed height per stance: owed as before (posing `MOTION_P.ZAR`, or S2.6).
**SPINELO_RADIUS (UNRESOLVED).** Not attempted (low priority); C1's owed read of `FUN_003c9b70` stands.

## 14. GameStats bytes and `SetMPMissionSeq` (M1 G21, G16)

**GameStats (UNRESOLVED).** `slice-Medius.log` prints `GameStats:System.Byte[]` on all 18 world reports (L14..L256);
the s11 server logs do the same; no other capture holds them (`grep -rl GameStats logs/parity`). Owed: S5 with our
Horizon logging the 256 bytes as hex (a one-line change in our own server's `MediusWorldReport0.ToString`).

**`SetMPMissionSeq` (PROVEN; UI command 119, handler 0x278eb0, not decompiled: `dis_278eb0_SetMPMissionSeq.out`).**
- Reads `PLAYLISTVAR` element by element (up to 29 output bytes).
- `CreateClanAffiliation == 4` doubles every byte written (each map twice: a clan game plays each map with the sides
  swapped).
- 0xfe (Medley) restarts the output and fills it with `FUN_002c8db0(missions, previous, 1)` 29 times: the first present
  MP mission in `missionlist.rdr` order, then each next, wrapping -- with all 22 archives present (`FUN_002c94f0`): 51 VIGILANCE, 52, 53, 61, 62, 64, 71, 72, 73, 81,
  82, 83, 1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 51, 52, 53, 61, 62, 64, 71.
- 0xff (Random) writes one map drawn by `FUN_002c8840` (M1's bag) at creation.
- Any other byte is copied; a 0 ends the list; `FUN_002f8270`/`FUN_002f8230` store it and reset the index.
So the stored play list (GameStats [8..]) never holds 0xfe/0xff: M1's BELIEVED "Medley is stored expanded" is now
PROVEN, and the s4 game's first map VIGILANCE (B_43) and `GameLevel:51` agree with a Medley.

**Implementation suggestion.** `playList.ts`: `expand(list, missions, clan, rng)` per the rules above, applied at
creation; the rotation then only advances (M1 G16). Tests: [0xfe] -> 29 entries starting 51, 52, 53; clan [51, 2] ->
[51, 51, 2, 2]; [0xff] -> one present map.

## 15. NetTickSleepTime in r0004 (M2 §9.5)

**Answer (PROVEN).** `match_r0001_r0004.csv` pairs `FUN_002ce930` with r0004 0x2eb840 (relinked-body). Its code is
instruction for instruction the same (`dis_r1_2ce930.out`, `dis_r4_2eb840.out`): it stores HSYNC/20 at **0x450a60**
(r0001 0x44d698) and its run flag at 0x40a3b8 (r0001 0x3df1f0). Harry's 0x475afc is the SOCOM 1 demo's
`NetTickSleepTime` symbol (demo symtab, `demo_syms_net.out`; also `NetTickThreadRunState` 0x474e1c), and no r0004
instruction addresses it (`scan_refs.py 475af8 475b00` on the r0004 ELF: none). M2's BELIEVED becomes PROVEN.

## 16. `FUN_00623330(0x2000,0x8000)` / `(0x8000,0x8000)` (ledger-M2 `bandwidth_caps`)

**Answer (STRONG).** Not a bandwidth cap. `FUN_00623330` (guarded DME call) -> `FUN_00614290`, which is the SOCOM 1
demo's `NetSetBufferSize` (0x418b88) instruction for instruction (`cmp_netsetbuffersize.out`); its two globals are the
demo's `MesgLayerSendBufferSize` (0x43e1dc) and `MesgLayerReceiveBufferSize` (0x43e1e0). SOCOM II's are 0x6511c4 /
0x6511c8, read into the DME connect parameter blocks (`FUN_00616c98` D:L524317-524318, `FUN_00617788`
D:L524857-524858). So: message-layer **send buffer 8 KiB online / 32 KiB LAN, receive buffer 32 KiB**, in bytes.

**Implementation suggestion.** None for gameplay (the browser's WebSocket has its own buffers); M2's row becomes
NOT-A-GAP with this citation.

---

## 17. Sourced but not implemented (multiplayer)

- The Create Game screen's real option sets and defaults (§1), and per-room round time/count from the created game.
- The full TCM tree with per-mode tactical orders; taunts to the enemy side (§3).
- The game list's sort order (sort byte, then name) and 127 for created games (§2).
- A 120-minute account ban per world after a vote (§4).
- The late-join handshake states and the five refusal texts (§5).
- Hostages/VIPs are never FF-protected (§6).
- Map destructibles: per-map health/shield, C4 against shield <= 18, bases and MP9 depots need the bomb (§7).
- Remote kit ammo and magazine counts (§9); footstep audibility of the 3 nearest (§10).
- Medley/Random expansion at creation and clan-game doubling (§14).

## 18. Leads for other workstreams

- **ONL-12 lobby list:** `FUN_002e2ce0` (D:L184404-184480) builds each GAMELIST row from the sorted list: name, player
  and spectator counts (record `+0x20`, `+0x24`, GameStats [3]/[4]), a ping bucket (< 300 -> 1, < 600 -> 2, else 3; 0 when empty), password
  flag (+0x40 bit 0), +0x3c, rank restrictions (GameStats [7]); worth a full read for the list screen.
- **Hostage work (H2 ([190](190-h2-hostage-mode-rules-map.md))/H3):** the 0x20000 exemption (§6) and MP6's destructibles (§7: access1-6, crates, fuel).
- **C9 ([188](188-c9-world-render-platform.md))/world:** the 18 MP6 `beer*` and MP7 `ant_base`/`sealtable` anims carry health but are kind 1 (never built).
- **C8/services:** the demo DWARF `LOBBY_STATE` enum names the lobby machine's states (11, 13, 15, 17 used here).
- **Everyone:** `scratch/H1/demo_enums_all.txt` (SEAL_STATE, MP_MAJOR_GAME_STATE, FIRETEAM, LOBBY_STATE) and
  `scratch/R2-MN/ee_dis.py` (EE `lq`/`sq` aware) are reusable levers.

## 19. Verification (V5, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V5-verify-hostage-closures-round2.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V5/`). V5 verified H4 ([199](199-h4-hostage-closures.md)), round 2's R2-C2 and R2-MN, two R2-C3 ([202](202-r2-c3-combat.md)) items and the grenade-spin dispute between C3 ([181](181-c3-combat-hud-effects.md))/V1 and R2-C3. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V5, wave 2026-10-04. Read-only; no builds, runs, git writes or network. `D:L<n>` is a line of
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001). I used my own tools, not the authors' helpers.
- `scratch/V5/v5.py` reads `game/disc/socom2_game.elf` through pyelftools, disassembles with capstone and prints the
  decomp.
- The jal, word, lui and store scanners are mine.
- Second-route values come from the PCSX2 RDRAM dump `logs/parity/spawn_pcsx2.rdram` and from raw disc bytes.

Every script and output is in `scratch/V5/`; its `README.md` lists them.

### 19.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| R2-MN create game | PLAYERS 2..16 step 2; time 4-10; rounds 3..11 odd; respawn 20 × 1; spectators 0/8 (4 LAN); EQ 0-4; FF default 1 | **CONFIRMED** | The decoded cycle scripts say exactly this. The capture's MaxPlayers 24 = 16 + 8 matches `FUN_002edda0`. The decoder is C1's (not re-derived). |
| R2-MN sort order | Sort key; 127 for user games | **CONFIRMED** | 0x7f at D:L197764-197769. The comparator sorts on +0x1a0 ascending, ties by name (D:L185623-185647). +0x1a0 maps to the valve on join (D:L197180-197181). |
| R2-MN radio menu | Per-mode rows | **CONFIRMED** | Row labels re-read from the ELF (D:L83757-83805). `FUN_0022fa90` enables 0x2e only in modes 1/2 and 0x2f only in 3/4. |
| R2-MN C4 blocks | Doors 17 vs C4 18; bases 21; MP9 45; MP6 fuel 150/150 | **CONFIRMED** (one step BELIEVED, as stated) | Accept = health > 0 and shield ≤ damage (disassembly 0x2739b0). A raw byte census of every MP*.ZDB gives the same counts: 17 ×6, 21 ×2, MP9 45 ×19, MP6 150/150 ×2. The damage argument being the charge's damage stays BELIEVED, as R2-MN says. |
| R2-MN Medley | 29 maps from Vigilance (51) | **CONFIRMED** | Disassembly 0x279088-0x2790e4 loops while s0 < 0x1d through `FUN_002c8db0`. The RAM mission list is 51, 52, 53, 61, 62, 64, 71, 72, 73, 81, 82, 83, 1, 2, 5-12, so 22 + 7 = 29 starting at 51. |

### 19.2 R2-MN items

- **Create game (CONFIRMED).**
  - `dlgCreateGame_compact.out` L1091-1138, L505-560 and L438-465 show:
    - PLAYERS +2 wrapping > 16 → 2;
    - ROUND TIME 4→…→10→4 and ROUND COUNT 3→5→7→9→11→3;
    - the defaults 16 / 6 / 11, FF 1, EQ 0, spectators 8 (4 when ComeFromLan);
    - respawn: 20 and 1.
  - The capture's `MaxPlayers:24` (`s4_pcsx2/slice-Medius.log` L14) = 16 + 8 via `FUN_002edda0` (D:L190545-190563).
  - The scripts were read through C1/R2-MN's decoder; I re-read its output, not the binary.
- **Sort order (CONFIRMED)** — see the table.
  - The comparator is "ascending by byte, then name". Its second scan uses `!(a[j] < pivot)` rather than
    `pivot < a[j]`; that is still an ascending introsort.
- **Radio rows (CONFIRMED).** All 26 labels were resolved from the ELF (`v5.py s`); the tree is as R2-MN tabulates.
- **C4 blocks (CONFIRMED data).**
  - `animhealth_raw.py` (raw bytes, no zanim decoder) finds:
    - (1, 17) ×6 on MP11/51/61/62/64/71/82/83 (×7 on MP73, which also has kill_rtower);
    - (2, 21) ×2 on the bomb maps;
    - MP9 (1, 45) ×19;
    - MP6 (150, 150) ×2 and (80, 0) ×1.
  - The raw scan over-counts the common (1, 0) shape, as expected.
  - The accept predicate is exact in disassembly. C4's damage 18 comes from C1's ZWEAPON read; I did not re-read it.
- **Medley (CONFIRMED).**
  - Disassembly: 0xfe → s0 = 0, 29 calls of `FUN_002c8db0(0x441650, prev, 1)`; each id is stored once, or twice when
    `CreateClanAffiliation == 4`; then 0 and exit.
  - Note the clan case: two bytes per step against the same `s0 < 29` bound, so 15 maps / 30 bytes.
  - `FUN_002c8db0` (D:L168605-168660) returns the first present type-1 mission when `prev` is not found, else the next
    one, wrapping.
  - The RAM list (`out_missionlist.txt`) is 51, 52, 53, 61, 62, 64, 71, 72, 73, 81, 82, 83, 1, 2, 5, 6, 7, 8, 9, 10,
    11, 12, all type 1, which gives R2-MN's 29-map sequence.
  - The name VIGILANCE for 51 I take from R2-MN.

## 20. Verification (V7, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V7-verify-round2-remaining.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V7/`). V7 verified ten round-2 claims nobody had checked, in R2-C3, R2-UI ([204](204-r2-ui-frontend.md)), R2-AV ([205](205-r2-av-audio-card-world.md)) and R2-MN. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V7, 2026-10-04. Read-only. Every script is under `scratch/V7/`, and its `README.md` says what each one prints.
`D:L<n>` is a line of `socom2_game.elf.decomp.c` (r0001). `$PORT` is the `agent/online` snapshot.

**Method.** Each claim is re-derived by a route the author did not use, where one existed:
- V7's own ELF reader (`elf.py`, pyelftools) and disassembler, instead of the authors' `elfutil.py`;
- the console's own state in the PCSX2 RDRAM dumps, read directly. No replay or simulation stands in for it;
- V7's own Python `.rdr` reader;
- the raw zAnim bytes, decoded by hand against the handler's field reads.

Where the only route was the author's own (a decomp read), V7 re-read the code and says so.

### 20.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| 10 | Footstep list distance-sorted, so the 3 nearest within 500 u are heard; remote kit's two shorts = ammo and magazine counts | **CONFIRMED** | Comparator `a.d2 < b.d2`, limit 3 (0x64fc70/78), 250000 = 500^2. The resort range actor+0xcc is 5000^2 (constructor), so the whole 500 u band is kept in order within 100 u^2. The item layout is {+4 ammo_count, +8 mag_count}, packed as shorts. |

Tally: 10 claims. CONFIRMED 6, CONFIRMED-WITH-CORRECTION 4, WRONG 0, UNVERIFIABLE 0.

### 20.2 Claim 10: Footsteps of others; the remote kit's two shorts (R2-MN §9, §10)

**Footsteps.**
- `FUN_00552850` walks actor +0xd8 (0x30-byte entries, d^2 at +0x10).
- Bits 0x10/0x20 of +0xe0 are set for entries with d^2 < 250000.0 (= 500^2) while the count is below
  `DAT_0064fc70` = 3. Bit 4 has a second counter, also 3 (`DAT_0064fc78`).
- Only eligible entries count: actor type byte +0x10 == 2, plus the controller/flag tests.
- The list order: `FUN_002a0a10` (D:L145876-145995) sorts with comparator 0x2a1140, `a.d2 < b.d2` (`dis_2a1140.out`).
  - On a rebuild it sorts the whole list.
  - Otherwise it re-sorts the prefix inside actor +0xcc when an entry is more than `DAT_003de2f0` = 100.0 closer than
    its predecessor, and only on the actor's scheduled turn.
- V7 found the one store to actor +0xcc (`scan_cc.out`): the constructor `FUN_0029ee10` writes 0x4bbebc20 =
  25,000,000 = 5000^2. So the whole 500 u band is kept in order.

CONFIRMED, with two precisions: "the 3 nearest **eligible** bodies", and order within 100 u^2 between turns.

**Kit shorts.**
- `FUN_0053ce00` (D:L406385-406397) builds each 12-byte item: +0 `wep_name`, +1 `ammo_name`, +4 `ammo_count`
  (0x65bf80), +8 `mag_count` (0x65bf90).
- The pack `FUN_0053ed50` writes {u16 code, (short)+4, (short)+8}; the unpack `FUN_0053ec60` restores them to +4/+8.
- CONFIRMED: the shorts are ammo_count and mag_count, truncated to 16 bits.
