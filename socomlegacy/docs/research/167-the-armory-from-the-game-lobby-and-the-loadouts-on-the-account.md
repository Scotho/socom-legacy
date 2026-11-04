# 167 -- The ARMORY from the GAME LOBBY, and the loadouts on the account (ONL-17, SVC-24; PLAT-34 not folded)

Written 2026-10-05 for ONL-17 (`../roadmap/05-online-front-end.md` "ONL-17") and SVC-24
(`../roadmap/06-online-services.md` "SVC-24"), wave 5 of sprints 16 and 17 on the online path's plan
(`../plans/2026-10-02-online-path-target.md`, OT.R27, OT.R32, OT.R36; the waves table's `armory` row). Sources: the
retail decompilation `socom2_game.elf.decomp.c` under `SOCOM_PC_ROOT` (`D:L<n>` its line, `FUN_<addr>` its functions;
cited, never pasted); the disc's `dlgGameLobby.rdr` and `dlg_equipment_mp.rdr` sets (`tools/dump-online-dialogs.ts
--dialog ...`, and the `CharacterProfile` modes read off each command's byte +0x10 through `@s2u/scene`'s
`decodeUiProgram`). **No server was contacted** (R293); no game was run; no browser was run (the host was another
session's). It stands on research 95 (the ARMORY's scripts and states), 182 (its UI parity and the per-item
revalidation), 204 §2 (`SaveCharacterProfile`, the file service), 165 (the game lobby), 159 (the bridge), 157 (the
bearer, `sessionLost`) and 169 (the flood limits), and does not restate them.

The code: `packages/ui/src/screens/gameLobbyCommands.ts` (the ARMORY's gate lifted; `missionName()`),
`packages/ui/src/screens/armoryProfileCommands.ts` (`CharacterProfile`'s eight modes and `InitializeOnlineArmory`),
`packages/viewer/src/gameLobbyHost.ts` (`sessionLoadouts`, the transport's `GET` / `PUT`, the mount),
`packages/central/src/loadoutHttp.ts` (the endpoint), `loadoutStore.ts` (the seam), `serviceStore.ts` (the records on
the account), `room.ts` (`Room.storedProfile`), `bridge.ts` (the launch's read, the mount). The tests:
`packages/ui/test/screens/gameLobbyScreen.test.ts` (the walk on the disc's records: in, back, READY, the pull-out,
`FromBriefing`), `packages/ui/test/screens/armoryProfileCommands.test.ts`, `packages/viewer/test/gameLobbyHost.test.ts`,
`packages/central/test/loadouts.test.ts`. Confidence: **reading, pending review** for every transcription; nothing is
measured against the original running (§7).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R167.1 | **The original forbids the ARMORY while READY; it never un-readies.** weaponselect's CROSS runs `goto_eq_mp_set_return_valve`, whose second sequence FAILs on `mp_minor_game_state` 2 or `mp_major_game_state` not 1; `CycleReadyButton` also disables the button while READY | `dlgGameLobby.rdr` set: `goto_eq_mp_set_return_valve`, `CycleReadyButton` | §1 |
| R167.2 | **The way back keeps the seat.** `returnto_lobby` (TRIANGLE), `OnEquipDoneBtnPress` (DONE) and `force_new_db` switch to `dlgGameLobby.rdr` with no disconnect; `check_loop` skips `AdvanceMPMission` once (`GoneToArmory`), `Enable_SM_Launch` gives no second `ArmButtonClock` (`ComeFromBriefing` 1) and re-enables the button unless `TakenBack` | the two sets | §1 |
| R167.3 | **The pull-out needs nothing new**: `UiBackToLobby` polls `CheckForcedLaunch`, which the lobby's rows already answer from the bridge's countdown; #47, 5 s, the lobby | `dlg_equipment_mp.rdr` `UiBackToLobby`; research 95 R95.7 | §1 |
| R167.4 | **`CharacterProfile`'s modes** (the byte at +0x10): 0 load into `MpCharSet`, `primsel` .. `equip3sel`; 1 store from them; 2 exists; 3 upload; 4 its wait; 5 download; 6 its wait; 7 clear valid. On the disc: the lobby calls 2 and 0, `StoringLoadout` 1, `SaveCharacterProfile` 3 and 4, `returnto_Defaults` 7, `dlgNetConnect` 5 and 6 | `FUN_00275770` D:L121919-122131; the valve names S:0x3ee9f8 .. S:0x3eea38 (D:L121977-121982) | §2 |
| R167.5 | **The record**: per account, per mission (8 bytes, case-insensitive), one per side -- `{MpCharSet u8, five u16 UI indices, valid u8}`; 0x80 missions at most; a spectator has none | `FUN_002fb470` D:L198753-198795, `FUN_002fb610` D:L198800-198905 | §2 |
| R167.6 | **A failed save shows nothing in the original**: mode 4 waits only for the request queue, the script's 3 s cap stops it, the record stays in the console's database | `FUN_0033e7f0`; `SaveCharacterProfile`, `StoringLoadout` | §3 |
| R167.7 | **The match learns the kit server side, with no protocol change**: the bridge passes no kit from the lobby (the game hello names none), so at the launch the bridge reads each seat's stored record for the game's map and side and the room re-chooses it item by item (`readProfile`) | `bridge.ts` `storedLoadouts`; `Room.storedProfile` | §4 |

## 1. In and out of the ARMORY (R167.1 - R167.3)

The gate that held weaponselect's CROSS (research 165 §6) is lifted; nothing replaces it. CROSS runs the disc's
animation whole: `team_monitor`, `GoneToArmory` 1, `NoTriangle` 1, `ComeFromBriefing` 1, .DINK, `InitializeOnlineArmory`
(0x27d8c0, D:L126092-126102: the voice object only, research 95's `ARMORY_INIT_VOICE_READING`), then
`SWITCHMENU(INPUT_STRING)` -- `dlg_equipment_mp.rdr`. Its sequence 2 FAILs while READY or outside the lobby's major state
1, so the original forbids the trip rather than un-readying; the test sets each valve in turn and sees no row run. Back:
`returnto_lobby` `SWITCHMENU(dlgGameLobby.rdr)`; the game socket and its seat are the session's (`GameLobbyCommands`
lives across dialogs), so nothing closes, no `/lobby/leave-game` goes, the seat's READY is as it was (not READY) and
the lobby's ONSTART runs as the disc has it for a return. The launch count reaching the ARMORY pulls it out through
`UiBackToLobby` over the existing `CheckForcedLaunch`.

## 2. The records: the page's copy and the account's (R167.4, R167.5)

`ArmoryProfileCommands` holds the page's copy of the console's account database: the account's records by mission,
filled by mode 5 (the login's `DownloadCharacterProfile`, as `dlgNetConnect` calls it) and asked again at
`InitializeOnlineArmory` (`LOADOUT_REFRESH_AT_ARMORY_ADAPTATION`, the brief's "load when the ARMORY opens"). Modes 0, 1,
2 and 7 act on the copy as the original acts on its database; mode 3 sends the record mode 1 or 7 last touched (a `PUT`
of one side of one mission, `LOADOUT_HTTP_ADAPTATION`); modes 4 and 6 answer 1 once their request is settled. The
mission is the game's (`LOADOUT_MISSION_READING`); the side `player_team` 0 / 8.

The server (SVC-24, OT.R36): `GET /lobby/loadout` answers every record of the bearer's account, `PUT` keeps one side's
record of one mission. The account is the bearer's (`bearerIdentify`), never a field of the body. A record is kept only
when the mission is a map the server offers, the side is the SEALs or the terrorists, `MpCharSet` is one of that side's
four and every item is a UI index `FUN_003d3230` (D:L325704-325934, `ITEM_OF_UI`) lists -- the client's revalidation's
first test; the map's own test (the `Enable_` valves, the slot rules) is the room's at the launch (§4). The body is
bounded (`LOADOUT_BODY_MAX_BYTES`, 256: 413 past it); the path sits behind the match server's door, so the per-address
request rate and the declared body bound of research 169 measure 8 hold for it. The records live on the account record
in SVC-04's store, behind the `LoadoutStore` seam (get / put per account and side, delete with the account), so a
change of storage touches one module; a full table (0x80 missions) is 409. They survive a restart as the accounts do:
since OT.R37 in the SQLite store's `loadouts` table, a row per account, mission and side, cascading with the account
(research 220 §2, R220.6); an ONL-17 `services.json` is imported with them.

## 3. A failed save (R167.6)

`LOADOUT_SAVE_FAILURE_SILENT_READING`: the original has no failure dialog for the upload, so a refused or failed `PUT`
ends mode 4 as a settled one does; the record stays in the page's copy for the session and the next store sends it
again. A 401 is the session's end: `sessionLoadouts` tells `sessionLost` (research 157) and rejects.

## 4. How the match learns the kit (R167.7)

Not from the page, and with no new field: the game socket's hello names no kit (research 165 §7), and sprint 26's
protocol bump carries nothing for ONL-17. `STORED_LOADOUT_AT_LAUNCH_ADAPTATION` (`bridge.ts`): when the game lobby's
launch is acted on (the countdown's start or the all-READY launch -- SWITCH TEAMS and the ARMORY are closed then), the
bridge reads each seat's stored record for the game's map and side from the `LoadoutStore` and hands it to
`Room.storedProfile`, which re-chooses it as the viewer's `readProfile` does (the column, then each item only where the
map's `Enable_` valve has the side's bit and the slot takes it) and sets the seat's next type and kit as a `loadout`
request would. Only for a game of no weapon restriction (EQlimit 0, as `FromBriefing` loads a record only then); an
invalid record, another side's column, or a round under way change nothing (SEAL 1 / TERRORIST 1, R95.5). A page's own
later `loadout` request still goes through the room's rules as before. Since 2026-10-16 (ARMORY-SAVE, §7) the lobby's
ARMORY sends its choice as that request, and a seat's own lobby choice stands over the record at the launch
(`Player.lobbyChoice`, the console's `IDFromBriefing`).

## 5. The offline ARMORY

Untouched: the match page's ARMORY (`packages/viewer/src/armory.ts`) keeps its browser store `s2u.armory.v1` and OPT-20's
card file remains the offline game's (OT.R36).

## 6. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `LOADOUT_MISSION_READING` (`packages/ui/src/screens/armoryProfileCommands.ts`) | the game lobby's mission, upper-cased | the record's key is 0x414e00, which `UISetMission` (0x27eb50, D:L126655-126680) writes; which writer runs between the lobby's entry and the ARMORY is not traced | that writer traced, or a capture of the ARMORY's stored record |
| `LOADOUT_SAVE_FAILURE_SILENT_READING` (`armoryProfileCommands.ts`) | no dialog; mode 4 ends; the record kept in the page's copy | `FUN_0033e7f0` waits for the queue only; `SaveCharacterProfile`'s 3 s cap | a capture of a failed upload on the original |
| `CHARACTER_PROFILE_BUSY_READING` (`armoryProfileCommands.ts`) | never busy | modes 0, 1, 2, 7 act only while `FUN_003045b0(0x44fe10)` answers 0 (D:L122002, D:L122027, D:L122040, D:L122051); the object is not read | `FUN_003045b0` and 0x44fe10 read |
| `LOBBY_CHOICE_ABANDON_READING` (`packages/viewer/src/lobbyArmory.ts`; the room's `Player.lobbyChoice`) | the lobby ARMORY's choice gone with the match's load, an abandoned match's too | the console's `IDFromBriefing` is a TEMP valve (research 309 §2.3: not in `global_valves.rdr`), which the map's load drops (`FUN_002abd40` D:L151842 -> `FUN_00351cb0`), so the lobby an abandoned match falls back to re-arms from the record as after GAME COMPLETE (P:L14608); the abandon's own way back is not walked (2026-10-16, ARMORY-SAVE; §7) | a capture of a lobby choice across an abandoned match |

Adaptations, named and not ledger suffixes: `LOADOUT_REFRESH_AT_ARMORY_ADAPTATION` (`armoryProfileCommands.ts`),
`LOADOUT_HTTP_ADAPTATION` (`packages/central/src/loadoutHttp.ts`), `STORED_LOADOUT_AT_LAUNCH_ADAPTATION`
(`packages/central/src/bridge.ts`). Retired: research 165's `ARMORY_FROM_LOBBY_GATE_READING`. Reused: research 95's
`ARMORY_INIT_VOICE_READING`. Note only: which of the record's two side blocks (+0x114, +0x122) is the SEALs' --
`FUN_002c31a0` and `FUN_002c3080` test the team word against two values swapped by `DAT_004412d8`; the port keys the
sides by name, so nothing depends on it.

## 7. Unknowns, what is not done

- **2026-10-16: ARMORY-SAVE -- why the lobby ARMORY "isn't saving selections", and the fix (the owner: "match the
  original"). Reading, pending review.** The owner's report was the online GAME LOBBY's ARMORY. *The cause*: a choice
  made in the shared ARMORY and left with DONE (no STORE LOADOUT) never left the page -- `LobbyArmory.choose` wrote only
  the lobby's valves and the session's own map, which nothing on the match path read; the game lobby's hand-off carries
  no kit (`GameLobbyHandOff`); and the match learnt only the account's stored record, read at the launch
  (`STORED_LOADOUT_AT_LAUNCH_ADAPTATION`, §4), which `Room.storedProfile` laid over any type and kit the seat had asked
  for. So the match played the stored record, or the type's own kit without one. The STORE LOADOUT path itself kept a
  selection: the `PUT`, its key (the mission upper-cased on both sides), the store's restart, the ARMORY's next entry and
  a re-login's download all hold it (`packages/viewer/test/armorySave.test.ts`'s control). A second difference: the
  ARMORY entered again laid the stored record over the session's committed choice (`openArmory`).
  *The original* (the disc's scripts, `tools/test/onlineDialogs.pinned.json`, P:L its lines): a character committed in
  the ARMORY sets `IDFromBriefing` 1 (`OnMp{Seal,Terr}BtnPress` seq 0, research 95 §3.2); the lobby's ONSTART
  `FromBriefing`, which runs again at the way back, loads the record (or the side's default type) only under
  `IDFromBriefing == 0` (P:L7561-7585); `IDFromBriefing` is zeroed at the BRIEFING ROOM's start (P:L4293) and at GAME
  COMPLETE (P:L14608) and, a TEMP valve, dropped at the map's load (research 309 §2.3); `switch_teams_anim` always
  re-arms from the record for the new side (P:L7596-7615); the ARMORY's own entry only captions the stored column CUSTOM
  (`UiEquipSwitch`: `CharacterProfile` 2, no mode 0; research 95 §3.1). So the console's kit is the ARMORY's choice from
  its commit until the side changes or a match loads, and STORE LOADOUT alone keeps it on the account.
  *The port*: the lobby ARMORY sends each change as the seat's `loadout` request on the game socket (debounced, flushed
  at the screen's close and the pull-out; sent again on a reconnect's welcome on the same side; forgotten at a change of
  side and the hand-off: `GameSocketHost.loadout`); the room marks a seat's own choice taken while not launched
  (`Player.lobbyChoice`, the console's `IDFromBriefing`), which `storedProfile` leaves alone at the launch, a takeover
  and a rejoin inside the reconnect window carry (`KeptRecord`: a leave keeps a record for the mark alone, the same
  console reloading -- the window's expiry drops it as any kept record), a new seat (SWITCH TEAMS, a swap, a promotion)
  starts without, and the match's load clears (`firstRound`); the page forgets its session's choices when the front end leaves the lobby and its ARMORY and when the
  seat's side changes, and while it holds one the ARMORY opens on it, the stored column captioned CUSTOM only
  (`openArmory`'s `chosen`). The game socket forgets the choice whenever a game is left (BACK, another game opened:
  `GameSocketHost.drop`), as the BRIEFING ROOM's start zeroes `IDFromBriefing` (P:L4293); only the same game's
  reconnect sends it again. One more way the mark is set: opening the ARMORY on a valid stored record commits that
  column and hands the page a change (`openArmory`'s `live`, existing), which now reaches the room as a `loadout` and
  marks `lobbyChoice` without a CROSS -- the kit is the record's own, so the launch plays the same kit either way. The
  abandoned match's case is `LOBBY_CHOICE_ABANDON_READING` (§6). Tests:
  `packages/viewer/test/armorySave.test.ts`, `packages/central/test/loadouts.test.ts` (the lobby choice over the record
  end to end on the MP2 fixture; the takeover, SWITCH TEAMS and the promotion on the room),
  `packages/viewer/test/gameLobbyHost.test.ts` (the game socket's send). The 2026-10-07 entry's "still open" below is
  closed by this one.
- **2026-10-07: the shared ARMORY.** The owner's playtest of 2026-10-06 found the lobby's ARMORY drawing no images (its
  `WSMP` / `WSLC` / `EMnn` banks, its `UIVAR`s and its selection rows were the generic runtime's gaps below). The lobby's
  `dlg_equipment_mp.rdr` is now hosted by the test room's screen (`packages/viewer/src/lobbyArmory.ts`): the dialog stays
  built for `UiBackToLobby` and the errors, the shared screen draws and takes the pad, its choices reach `MpCharSet`,
  `primsel` .. `equip3sel`, and Square / Circle call modes 1 and 3 / 7 and 3 of the rows of §2
  (`ArmoryProfileCommands.mode`). Still open then: a choice not stored did not reach the match (R167.7 read the stored
  record only) -- closed 2026-10-16 (ARMORY-SAVE, above). The paragraph below describes the generic runtime's dialog, which the page no longer shows.
- **PLAT-34's fold is not done.** The ARMORY reached from the lobby is `dlg_equipment_mp.rdr` on the generic runtime:
  its layout, its scripts and the two profile rows are live; its selection rows (`Choose*`, `ChangeCharacterType`,
  `UpdateSelItemValves`, `DoAllSelChars*`) still answer the table's stand-ins, so the screen opens and returns but a
  choice made in it does not reach the valves mode 1 stores. The bespoke ARMORY (`armoryState.ts`) is the match page's.
- **No capture compared**: `orig-armory-*.png` and the recomp's (ONL-32) are not run; no browser on this host.
- **No save from the ARMORY over the machine**: the SQUARE store on `EquipWeaponBtn` needs the fold to reach the row;
  modes 1 / 3 / 4 / 7 are unit-tested on the rows (`armoryProfileCommands.test.ts`).
- **The login's download** (`DownloadCharacterProfile`, modes 5 and 6 on `dlgNetConnect`) reaches these rows because
  `connectGameLobby` registers them in the session's one command host at the session's start; that path is not walked
  by a test here (the connect screen's rig mounts its own rows).
