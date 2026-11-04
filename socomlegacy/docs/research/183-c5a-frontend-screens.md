# 183 -- C5a -- the front end's screens (`ui/screens/*`): placeholders and readings, sourced

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/C5a-frontend-screens.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V4 (`research-wave-2026-10-04/V4-verify-ui-audio-card.md`) has landed and is folded in as §6.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

**Overridden in part (research 206 §1):** the `lanUp` hook is wrong in three places (U1) -- four sites: two in code (`personaCommands.ts:552`, `:615`), two in comments (V4 #8).

Agent C5a-frontend-screens, research wave 2026-10-04. Read-only. Every number below names its source and the script that
reproduces it (`scratch/C5a/`, run `sh run_all.sh`; outputs in `scratch/C5a/out/`). `D:L<n>` is a line of
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001). `$PORT` is the `agent/online` snapshot. No
decompiled text is pasted; addresses, offsets, constants and line numbers only.

**Inventory.** 57 ledger names (rows `C5a-` of `ledger_by_cluster.tsv`), 7 "note only" readings of the notes the screens
cite that no other cluster owns (115 §13, 128 §8), and 10 unnamed items the sweep and the notes' open sections turned up
(`out/inventory.txt`, `out/sweep.txt`, `out/noteonly.txt`). 74 rows in all.

**Counts.** RESOLVED 33, PARTIAL 7, UNRESOLVED 5, NOT-A-GAP 29.
(Grades among the resolved: PROVEN 11, STRONG 22.)

## 1. Summary table

| # | item | status | grade | one-line answer |
|---|---|---|---|---|
| 1 | `NTGUI_RETURN_LAN_PLACEHOLDER` | RESOLVED | PROVEN | `FUN_003045b0` ignores its argument and answers "the valve `ComeFromLan` is non-zero" (Harry: "LAN CHECK"); the LAN return dialog when it is set |
| 2 | `LOBBY_DISCONNECT_READING` | RESOLVED | STRONG | the test is `ComeFromLan`, not "the lobby is up"; online: if lobby +0x7d, clear it, close the Medius connection, clear the lobby client (`FUN_002df8e0`); answer 1 |
| 3 | `LOBBY_CONNECT_PLACEHOLDER` | PARTIAL | STRONG | `MP_SUCCESS` is posted by the SessionBegin reply's callback `FUN_002ee910` (status 0), after lobby state 12 (queued by the connect callback 0x2e0440) sends SessionBegin; failure queues lobby state 10 |
| 4 | `LOBBY_LOGOUT_STUB_READING` | RESOLVED | STRONG | `FUN_002fa560` queues lobby state 0x12 when +0x7d is set; its handler sends SessionEnd; the reply clears the session key and queues state 0 (either status) |
| 5 | `IS_NETWORK_ON_PATH_READING` | RESOLVED | STRONG | `DAT_0045a0c1` is set 1 by `DMEInit`'s success (D:L122630), cleared by `UnInitNetwork` and the Medius teardowns: true on the path |
| 6 | `NET_CENSOR_TEXT_PLACEHOLDER` | RESOLVED | STRONG | MediusTextFilter (type 1, Replace) of the var's text; the reply's Text (+0x15) is written into the var, the status unread |
| 7 | `NET_WORKER_RESULT_READING` | RESOLVED | STRONG | InitNetwork's worker writes 1 when the network start reports (up, error, or cable out), 0 only when the IOP's network modules fail to load (with `MP_MEDIUS_ERROR`) |
| 8 | `NET_WORKER_TIME_PLACEHOLDER` | PARTIAL | BELIEVED | one PCSX2 run: InitNetwork 109.39 s -> interface up 114.78 s (5.4 s); LOCATING's MUIS TCP 122.93-123.77 s after a 6-s DNS retry; environment time, not a constant |
| 9 | `NETDEVICE_LIST_READING` | RESOLVED | STRONG | an array of up to 6 strings `"%s/%s"` (InterfaceControl codes 2 and 3: vendor/product); the port's value already matches |
| 10 | `NETCNF_IOP_PLACEHOLDER` | RESOLVED | STRONG | NetCnfInit loads netcnf/inet/inetctl/ppp/pppoe/smap/msifrpc/libnetb and eznetcnf once (flag 0x458088) and binds its RPC; NetCnfUninit unbinds; both rows answer 1 always |
| 11 | `NETCNF_DEFAULT_INDEX_READING` | RESOLVED | STRONG | `EZNETCNF.IRX` `getCombinationList` (symbols in the module): head +4 = the number in the first listed combination's name; +0 = 6 (`mc`) or 10 (`pfs`/other) |
| 12 | `NETCNF_CARD_CHANGED_READING` | NOT-A-GAP | -- | a card model choice (PLAT-26); the probe's semantics are already transcribed |
| 13 | `DME_INIT_RESULT_READING` | RESOLVED | PROVEN | `FUN_0030dbb0` returns the DME init's own result word; 0 takes the success branch |
| 14 | `MEDIUS_INIT_RESULT_READING` | RESOLVED | PROVEN | `FUN_00300840` returns `FUN_002f42e0(rc)` = (rc == 0): 1 is success |
| 15 | `DNAS_HOLD_SECONDS_PLACEHOLDER` | NOT-A-GAP | -- | the owner's pacing (OT.R20); the run on record bypassed DNAS |
| 16 | `LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER` | NOT-A-GAP | -- | the owner's pacing (OT.R20); the original's 1.3 s already measured |
| 17 | `DIALOG_NAME_MATCH_READING` | RESOLVED | STRONG | basename, `strcasecmp`, first member in order, over the open archives; no case collision on the disc, so the port's two passes give the same answer |
| 18 | `NODE_NAME_MATCH_READING` | RESOLVED | STRONG | the original's find-by-name is `strlen` + `strcmp` (case-sensitive), children first; no reference on the disc differs from its node only by case |
| 19 | `NODE_ACTIVE_FLAG_READING` | RESOLVED | PROVEN | `OBJECT_ACTIVE_STATE`'s vtable +0x38 writes exactly the node's +0x5c bit 0 that `NODE_ACTIVE` reads |
| 20 | `BINDING_SET_SEARCH_READING` | RESOLVED | STRONG | current set (`DAT_00414be4`, only written by the activation) first, then the others by index; no dialog's own sets share a name, so the port's order is exact on the disc |
| 21 | `LOADED_SETS_READING` | RESOLVED | STRONG | same reading, confirmed; `set::anim` names select a set directly (none on the disc's bindings) |
| 22 | `INPUT_STRING_ARGUMENT_READING` | RESOLVED | STRONG | the string input is the event's own argument when it carries one, else the binding's ARGUMENT, else none |
| 23 | `COMPARE_VALUES_UIVAR_ADD_READING` | RESOLVED | PROVEN | the fourth argument is 1 (set at 0x274e6c / 0x274eac): a missing var is made at longevity 1 (no value) |
| 24 | `COMPARE_AFTER_FORMATTING_READING` | PARTIAL | STRONG | one CompareValues on the disc sets +0x15: `dlgGameLobby.rdr` `OnlyModeText` (mission_title vs GAMENAMEVAR) |
| 25 | `PRUNE_ALL_SPACES_READING` | RESOLVED | PROVEN | whatever the stack byte below holds, the result is the empty string |
| 26 | `ACCT_NO_LOBBY_HOST_READING` | NOT-A-GAP | -- | unreachable on the path (LobbyConnect sets LOBBY_HOST first) |
| 27 | `ACCOUNT_NAME_READING` | RESOLVED | STRONG | 0x66a4f4 is PLAYERNAMEVAR's text as LobbyLogin copied it (D:L198299); before any login it is "zname_a" (D:L182648) |
| 28 | `GET_CLAN_STUB_READING` | NOT-A-GAP | -- | a transcribed stub owed to ONL-27; the request and reply layouts confirmed against Horizon |
| 29 | `ROOM_LIST_STUB_READING` | NOT-A-GAP | -- | a transcribed stub owed to ONL-11; the request is MediusChannelList_ExtraInfoRequest (PageID 1, PageSize 999) |
| 30 | `WORLD_LOBBY_STATE_READING` | NOT-A-GAP | -- | ONL-07's hook; the path reaches the menu in state 11 |
| 31 | `LOBBY_SESSION_UP_READING` | NOT-A-GAP | -- | ONL-07's hook |
| 32 | `LOBBY_STATE_PLACEHOLDER` | NOT-A-GAP | -- | ONL-07's/ONL-10's hook |
| 33 | `PARKED_ROW_GATE_READING` | NOT-A-GAP | -- | the owner's ruling OT.R8 |
| 34 | `LIST_ICO_BYTES_READING` | RESOLVED | PROVEN | `RUN/ICONS/LIST.ICO` is 50,234 B; `FUN_003a0a10` copies `LIST.ICO` (0x3fbc88) |
| 35 | `SAVE_GAME_DUMMY_BYTES_READING` | PARTIAL | STRONG | a dummy is the save manager's archive with only a `zSaveHeader` (module 0xc, text "This game is a dummy game."); 1,952 B is the recompiled original's output on f0; no constant in code |
| 36 | `SAVE_HEADER_TEXT_PLACEHOLDER` | RESOLVED | STRONG | the only saves the front end writes are dummies, whose header text (0x3eef00) is not counted: null and the real text count alike |
| 37 | `CONFIG_HEADER_CHECK_READING` | RESOLVED | PROVEN | the original's Load goes on when the header cannot be read (D:L238930), so "taken as matching" is its behaviour; SaveConfig writes module 0xe |
| 38 | `CONFIG_FILE_PLACEHOLDER` | NOT-A-GAP | -- | wiring (OPT-01/02/04a); its size is the f0 capture's |
| 39 | `MC_CHANGED_SLOT_UNWRITTEN_READING` | UNRESOLVED | BELIEVED | the word at sp+0x3c is never initialised in `FUN_0027b340`; only a trace says what the stack holds there |
| 40 | `MC_ISSUE_FAILURE_READING` | NOT-A-GAP | -- | a libmc model choice |
| 41 | `MISSION_MEMORY_PLACEHOLDER` | NOT-A-GAP | -- | the campaign is out of scope |
| 42 | `IOP_REBOOT_PLACEHOLDER` | NOT-A-GAP | -- | no IOP in a browser; the set mapping is transcribed already |
| 43 | `NETWORK_GUI_PLACEHOLDER` | NOT-A-GAP | -- | the owner's call (Sony's GUI has no counterpart) |
| 44 | `CORE_STATE_PLACEHOLDER` | NOT-A-GAP | -- | the round is not reached from the front-end entry (scope) |
| 45 | `MAP_LOAD_PLACEHOLDER` | NOT-A-GAP | -- | scope |
| 46 | `LOAD_STATE_SCRIPTS_PLACEHOLDER` | NOT-A-GAP | -- | scope (a map's `ldzanim.zar`) |
| 47 | `FRONT_END_ENTRY_READING` | NOT-A-GAP | -- | a browser adaptation named by the owner |
| 48 | `MENU_QUEUE_OVERFLOW_READING` | NOT-A-GAP | -- | undefined behaviour no disc script reaches (research 115 §1.1) |
| 49 | `MENU_HISTORY_OVERFLOW_READING` | PARTIAL | BELIEVED | undefined behaviour; whether a flow reaches 33 pushes without a pop or flush is not shown |
| 50 | `MENU_NAME_LENGTH_READING` | NOT-A-GAP | PROVEN | unreachable: the longest SWITCHMENU argument and dialog name on the disc are 31 characters |
| 51 | `DEFAULT_MENU_SCREEN_LENGTH_READING` | NOT-A-GAP | PROVEN | unreachable, as 50 |
| 52 | `MENU_SWITCH_REENTRY_READING` | NOT-A-GAP | -- | transcribed as read |
| 53 | `MENU_MISSING_DIALOG_READING` | NOT-A-GAP | -- | transcribed as read |
| 54 | `MENU_SOUND_PLAY_READING` (note only) | RESOLVED | STRONG | BACK: vtable +0xc = unplaced play, volume 1.0, the bank's own pan, a new handle, tag 0xff; `.METAL`: +0x1c forces the one-shot bit for the same play |
| 55 | `POPUP_FOCUS_READING` (note only) | RESOLVED | STRONG | the third argument gates the soft keyboard's pad events (`FUN_0038d8f0`), not the dialog's focus; the port already does this |
| 56 | `POPUP_COMPONENT_PLACEHOLDER` | NOT-A-GAP | -- | retired 2026-10-02 (the page connects PLAT-16) |
| 57 | `ZVID_SWAP_ARG_READING` (note only) | RESOLVED | STRONG | a 0 means "no flip": the display registers are not written, so the last shown frame stays (black only if 0x4a4510 is set) |
| 58 | `MENU_FADE_UP_AUTOSTART_READING` (note) | PARTIAL | BELIEVED | 8 animations on the disc have activation 1, all start-at-load by name; the instance bit's writer not found |
| 59 | `MENU_EVENT_RECORDS_READING` (note) | RESOLVED | STRONG | G holds 30 record slots (D:L264537); the most any dialog holds is 29 (`dlgGameLobby`); the unload's 10 only frees strings |
| 60 | `NETLOGIN_CHECKING_POPUP_READING` (note) | UNRESOLVED | -- | a timed capture is owed |
| 61 | `DNAS_LOGO_OVERLAP_READING` (note) | UNRESOLVED | -- | a timed capture is owed |
| 62 | `DNAS_FIRST_FRAME_READING` (note) | UNRESOLVED | -- | a timed capture is owed |
| 63 | `CLAN_ICON_INDEX_READING` (note) | RESOLVED | STRONG | the index is `atoi` of the first 3 characters of the GetMyClans reply's Stats (+0x68); the client writes 0 there; no `clan_icon_*.tif` on the disc |
| 64 | `MP_ROOMS_READER_READING` (note) | RESOLVED | STRONG | no ELF of ours (r0001, r0004, beta, boot) holds "mp_rooms" in any case; the archive lookup is by name only |
| U1 | `FUN_003045b0` read as "LAN lobby up" (`lanUp`) | RESOLVED | PROVEN | it is the `ComeFromLan` valve; three port sites read it wrongly |
| U2 | `NameIsVulgar`'s writer (research 153) | RESOLVED | STRONG | `dlgNetConnect.rdr` `OnFilterFailure` sets it, bound on `MP_FILTER_FAILURE`, posted by the account-name filter's reply `FUN_002eea70` |
| U3 | `UsagePolicyReturnScreen` (research 156 §3) | RESOLVED | PROVEN | `init_socom_online` sets 1, `OnBriefingRoomstart` sets 0, `ForceUsagePolicyReturn` tests 1 |
| U4 | the #614 popup across the switch (research 153) | UNRESOLVED | -- | needs ONL-07's connection and a capture |
| U5 | the card prompts owed to OPT-05b..g | NOT-A-GAP | -- | parked by OT.R8 |
| U6 | `DeleteMUISPersona`'s null compare | NOT-A-GAP | -- | unreachable from the list |
| U7 | `dlgWorldOfSOCOM`'s two `DescFieldMid` nodes | PARTIAL | BELIEVED | 11 animations aim at a name the dialog holds twice; the first made binds in both, as far as read |
| U8 | the agreement's arrival focus (research 156 §1.6) | NOT-A-GAP | -- | superseded by FOCUS-RING (research 116 §17) |
| U9 | `INPUT_STRING_NULL_READING`, `ONL_02_RETURN_FOCUS_READING` (C5b's names, defined in C5a files) | NOT-A-GAP | -- | owned by C5b; not researched here |
| U10 | default server names in `FUN_0030e290` | RESOLVED | PROVEN | `socom2-prod.pdonline.scea.com`:10075 and `socom2-prod.muis.pdonline.scea.com`:10071 |

---

## 2. The network screens (LOGIN, DNAS, SELECT UNIVERSE, the persona form, the world menu)

### 1. `NTGUI_RETURN_LAN_PLACEHOLDER` -- `$PORT/packages/ui/src/screens/launch.ts:51`

- **What it stands for**: which return dialog `SHUTDOWN` names (`dlgReturnFromNTGUI2.rdr` or `...LAN.rdr`).
- **Current value**: `false` (the WAN dialog).
- **Prior search**: research 115 §15: "`FUN_003045b0(0x44fe10)` (D:L80988) not read".
- **What I did**: read `FUN_003045b0` (D:L204495-204508) and its disassembly (`out/disasm.txt`, 0x3045b0-0x304604).
  It never reads `$a0`. It finds a valve by name once (`FUN_00351ef0(0x3f6328)`, cached in `DAT_00450058`), and answers
  "the valve's short at +4 is non-zero". 0x3f6328 is the string `ComeFromLan` (`out/strings.txt`). `FUN_00351ef0`
  (D:L250997-251016) walks the valve list at 0x49e804 and compares names with `strcmp`. Harry62 labels the r0004 twins
  `LAN CHECK` (0x321950) and `find variable` (0x36f520) (`out/harry.txt`).
- **Answer**: the LAN return dialog (0x3e5b60) when the valve `ComeFromLan` is non-zero, else the WAN one (0x3e5b80)
  (D:L80988-80994). **PROVEN** (operands read) plus Harry's label.
- **Implementation suggestion**: `launch.ts` takes the valve store and answers `valves.get('ComeFromLan') !== 0`;
  delete the constant. Test first: with `ComeFromLan` 1 (LAN's `go_to_LAN_play` sets it, research 138 R138.3) `SHUTDOWN`
  names `dlgReturnFromNTGUI2LAN.rdr`; with 0, `dlgReturnFromNTGUI2.rdr`.

### 2.1 U1. `FUN_003045b0` read as "the LAN lobby is up" across the port

The same function is the port's `lanUp` hook in three places: `personaCommands.ts:334-335` (the hook's doc), `:552`
(`NetCensorText`), `:615` (`LobbyConnect`), and `universeCommands.ts:99` (`LobbyDisconnect`). In each the original tests
`ComeFromLan` (§1). On the online path `do_multi_or_medius` sets `ComeFromLan` 0 (research 138 R138.3), so today's
answers do not change. They differ on the LAN path. **PROVEN.** Suggestion: replace `lanUp` with a read of the valve
`ComeFromLan` (one helper, `comeFromLan(valves)`); add one test per site with the valve at 1.

### 2. `LOBBY_DISCONNECT_READING` -- `universeCommands.ts:103`

- **Current**: "the page's lobby told; `FUN_002dfdd0` not followed".
- **What I did**: read `FUN_00274d60` (UILobbyDisconnect, D:L121601-121614), `FUN_002dfdd0` (D:L182490-182499),
  `FUN_00300680` (D:L201952-201964), `FUN_002df8e0` (D:L182243-182289) and `FUN_003043e0` (D:L204419-204425).
- **Answer**: when `ComeFromLan` is 0 (online): `FUN_002dfdd0(lobby 0x44f370)` -- **only if lobby +0x7d is set** (the
  session flag, research 156 R156.4) -- clears +0x7d, closes the Medius connection (`FUN_00300680`: when
  `DAT_0044fda0` is 1 it calls `FUN_006479b8`, which closes socket `DAT_0065618c` while the client state
  `DAT_00656188` is 1; then `DAT_0044fda0` = 0 and `DAT_003df308` = -1) and clears the lobby client (`FUN_002df8e0`:
  the room list 0x44f568 and the other lists and their done flags emptied, +0xb0..+0xe8 zeroed, `DAT_0066a5e8` = 0,
  the LAN object at `DAT_0044fe10` freed). When `ComeFromLan` is set: `FUN_002df8e0` and `DAT_0044fe10` = 0. The answer
  is 1 either way. **STRONG** (one interpretive step: `FUN_006479b8` is the Medius library's disconnect, read from its
  body, not named).
- **Implementation**: `LobbyDisconnect` calls `lobby.disconnect()` only when the session is up and `ComeFromLan` is 0,
  and `lobby.clear()` (the lists) in both branches; answer 1. Test: with the session down, nothing is sent and the
  answer is 1.

### 3. `LOBBY_CONNECT_PLACEHOLDER` -- `personaCommands.ts:188`

- **Prior search**: research 153 §8: where `MP_SUCCESS` is posted "was not found (the two sites are the clan's)".
- **What I did**: listed every `(*DAT_0044f3c8)` post with its string (`posts.py`, 80 posts, `out/posts.txt`). The ELF
  holds three `MP_SUCCESS` strings (0x3e27a8, the event table's; 0x3f41b0; 0x3f4a10). The post of 0x3f4a10 is in
  `FUN_002ee910` (D:L190902-190923), which is **not** a clan function: it is the reply callback of the request built by
  `FUN_002ee830` (D:L190876-190897; ours already names it `SessionBeginStateHandler`), whose message id is the string
  `SessionBegin` (0x3f4a00). The lobby's state table (`FUN_002ed460`, D:L190163-190217) registers `FUN_002ee830` for
  state 0xc. The connect's DME callback 0x2e0440 is `FUN_002efe20(0x44f370, 0xc)`: it queues state 12
  (`out/disasm.txt`).
- **Answer**: connect -> state 12 -> on the handler's phase 1, with no session key at 0x66a4d0, SessionBegin is sent
  (callback 0x2ee910) together with a 0x26-byte request (callback 0x2efe00, an empty function). The reply's status
  (+0x18) 0 copies the 17-byte session key from +0x1c into 0x66a4d0 and posts `MP_SUCCESS`; any other status queues
  lobby state 10. The layout matches Horizon's `MediusSessionBeginResponse` (MessageID, 3 pad bytes, StatusCode,
  SessionKey[17]: `research/horizon-server/RT.Models/Lobby/MediusSessionBeginResponse.cs`). **STRONG.**
- **Still open**: the connection itself (ONL-07's).
- **Implementation**: ONL-07's `PersonaLobby.connect` posts `MP_SUCCESS` when SessionBegin's reply has status 0 (not at
  the connect), keeps the key, and on failure enters state 10. Until then the placeholder's immediate post stands.
  Test: a SessionBegin reply with a failing status posts no `MP_SUCCESS`.

### 4. `LOBBY_LOGOUT_STUB_READING` -- `usagePolicyCommands.ts:98` (and the stand-in at `worldOfSocomCommands.ts:94`)

- **What I did**: read `FUN_002fa560` (D:L198272-198282), `FUN_002ee6e0` (D:L190825-190847) and `FUN_002ee7b0`
  (D:L190852-190871).
- **Answer**: the request is "queue lobby state 0x12" (`FUN_002efe20`, lobby +0x64 = 0x44f3d4, the state queue), and
  only while +0x7d is set. State 0x12's handler (registered at +0x48) sends **SessionEnd** (0x3f49f0) with the session
  key when one is held, else queues state 0 directly. SessionEnd's reply clears the key and queues state 0 whatever the
  status. So `LobbyLogout` answers 0 until the state byte (+0x60, `DAT_0044f3d0`) is back to 0. **STRONG.**
- **Implementation**: ONL-10's body: `logout()` sends SessionEnd and sets the state to 0 on the reply (success or
  failure). Test: the row answers 0 on the ticks between the request and the reply.

### 5. `IS_NETWORK_ON_PATH_READING` -- `personaCommands.ts:170`

- **What I did**: an absolute-store scan for 0x45a0c1 (`storescan.py`, `out/storescan.txt`): the only direct store is
  the static clear at 0x402820 (D:L328773). The byte is the DME object's (0x45a0c0) +1, written through
  `FUN_0030e3a0` (D:L210592-210597). Its callers: `DMEInit` `FUN_00276ce0` sets 1 on success (D:L122630); the MUIS
  connect `FUN_002fdf60` sets 1 (D:L200257); `UnInitNetwork` `FUN_0027e5c0` clears it (D:L126513); the Medius error
  teardowns `FUN_002f4090` (D:L194301) and `FUN_002f4240` (D:L194329) clear it.
- **Answer**: on the path, DNAS's `DMEInit` succeeded before the persona form, so the byte is 1. **STRONG.**
- **Implementation**: derive `network` from the DME-init row (set when `DMEInit` writes 1, cleared by
  `UnInitNetwork`) instead of a constant. Test: after `UnInitNetwork`, `NetCensorText` sends nothing.

### 6. `NET_CENSOR_TEXT_PLACEHOLDER` -- `personaCommands.ts:177`

- **What I did**: read `FUN_002776e0` (D:L122960-122979), `FUN_002f4df0` (D:L194742-194762), the reply dispatcher
  `FUN_002f4ea0` (D:L194767-194778) and the callback `FUN_002777c0` (D:L122984-122990).
- **Answer**: the row acts only when the network byte is set **and `ComeFromLan` is 0**. The argument `$1` (0x3eeb58)
  takes the running animation's string input. It sends a 0x6c-byte request: the session key at +0x15, the filter type
  **1** at +0x28 and the text (0x40) at +0x2c. That is Horizon's `MediusTextFilterRequest` with
  `MediusTextFilterReplace` = 1 (`RT.Common/Types.cs:246-249`). The reply's text at +0x15 (`MediusTextFilterResponse`:
  MessageID, Text[64], pad, StatusCode) is written into the variable by `CUIVariable_op_assign` (`FUN_003862a0`).
  **The status is not read.** The answer is 1 at once. **STRONG.**
- **Still open**: the filter's word list is the server's (SVC-23).
- **Implementation**: `lobby.censor(text, var)` sends TextFilter type 1 and assigns the reply text whatever the status.

### 7. `NET_WORKER_RESULT_READING` -- `dnasCommands.ts:146`

- **Prior**: GetServerList's worker was read (research 147 R147.2: phase 1 writes 1); InitNetwork's handler was not.
- **What I did**: the worker's vtable 0x4060b0 (`.data`: +8 = 0x276ee0, +0xc = 0x276f40). Its start posts two
  message records, at 0x3dd038 (handler 0x3a5cb0, an empty function) and 0x3dd4b8 (handler `FUN_00276f80`,
  D:L122727-122735). Phase 0 of that handler sets the default servers (`FUN_0030e290`) and posts 0x3dd4a8 (handler
  `FUN_00276ff0`, D:L122740-122775).
- **Answer**: `FUN_00276ff0`, phase 0: `FUN_0030dee0(0x45a0c0)` (the IOP network modules' load) returning 0 sets lobby
  state 2, posts `MP_MEDIUS_ERROR` (0x3ef870) with "Network Initialization Error: %s (%d)" over "Cannot Initialize
  Network", writes the valve **0** and ends. Phase 1: once `FUN_0030bf20()` answers non-zero, it writes the valve **1**
  and ends. `FUN_0030bf20` (D:L209093-209123) answers 1 for the network event "up" (3) and for "error" (5, posting
  `MP_MEDIUS_ERROR` with the event's text), and for the cable-out state (posting `MP_MEDIUS_ERROR` "The network cable is
  disconnected."). So the valve is 1 whenever the start has reported, even on those errors; their error comes as the
  event. **STRONG.**
- **Implementation**: `NET_WORKER_RESULT_READING` = 1 stays; rename it a reading of D:L122753-122758. Add the 0 branch
  (`NetJob` failure -> `MP_MEDIUS_ERROR` with that text, valve 0). Test: a failing job posts `MP_MEDIUS_ERROR` and the
  set's `IF success > 0` takes its else.

### 8. `NET_WORKER_TIME_PLACEHOLDER` -- `dnasCommands.ts:154`

- **What I did**: read the PCSX2 PSRewired run's log (`logs/parity/pcsx2_psrewired_url/emulog_url.txt`,
  `out/emulog_net.txt`).
- **Answer (one run)**: after `RebootIOP(MULTIPLAYER)`, InitNetwork's module loads run 109.39-109.83 s and the
  interface gets its address at **114.78 s** (`inetctl: [ 192.0.2.100 ]`): CONNECTING TO INTERNET stood about 5.4 s. The
  MUIS lookup starts at 116.90 s, is retried after a 6 s DNS time-out (122.91 s), and connects to TCP 10071 at 122.93 s,
  closing at 123.77 s. These are the emulated adaptor's and DNS's times, not the game's. **BELIEVED** as an
  observation; no constant to port.
- **Suggestion**: keep one poll; OT.R20's holds cover the pacing. If the owner wants the console's stand, 5.4 s for
  CONNECTING is the only observed figure.

### 9. `NETDEVICE_LIST_READING` -- `netLoginCommands.ts:68`

- **Prior**: the body 0x277970-0x277a8c "not decompiled".
- **What I did**: disassembled it (`eedis.py`, `out/disasm.txt`; EE `sq` decoded by hand).
- **Answer**: `FUN_0030bd40(buf, 6)` fills at most **6** interface records of 0x240 bytes (D:L209036-209067). It uses
  libinet's interface list (`FUN_00246558`) and three InterfaceControl reads per id (`FUN_002465e8`: code 8 into +4,
  code 2 into +8 (0x100 bytes), code 3 into +0x108 (0x100)). The name is resolved through `INPUT_STRING` (0x3ee898). The
  var comes from `CUIVarManager_Add(0x437e80, name, 0, 1)`. Each record becomes `sprintf("%s/%s", +8, +0x108)`
  (0x3eeba0) appended to an array, which is assigned to the var. The answer is 1. Codes 2 and 3 as vendor and product is
  the one interpretive step; it matches `DEV002.CNF`'s `vendor "SCE"` / `product "Ethernet (Network Adaptor)"`
  (research 136). **STRONG.**
- **Implementation**: none needed. `NET_ADAPTOR_NAME` (`viewer/src/netLoginHost.ts:29`) already gives vendor/product.
  Rename the constant a reading of 0x277970 and cap the list at 6.

### 10. `NETCNF_IOP_PLACEHOLDER` -- `netLoginCommands.ts:74`

- **What I did**: read `FUN_0030c6e0` (D:L209403-209419), `FUN_0030c430` (D:L209286-209367), `FUN_0030c6a0`
  (D:L209390-209398), `FUN_001e8530`/`FUN_001e85f8` (D:L48605-48644), and the rows `UINetCnfInit` 0x278040 and
  `UINetCnfUninit` 0x278020 (D:L123242-123257).
- **Answer**: `NetCnfInit` does the following once, guarded by the flag `DAT_00458088`:
  - loads `netcnf.irx` (with the icon arguments 0x3df4c0 or 0x3df460), `inet.irx`, `inetctl.irx -no_auto`, `ppp.irx`,
    `pppoe.irx`, `smap.irx` (result ignored), `msifrpc.irx` and `libnetb.irx -decode`, then starts the inet client
    (`zSysLoadIRX` = `FUN_0034f8b0`);
  - loads `run/irx/eznetcnf.irx` and binds its RPC (`eznetcnf`, id 0x75499128).

  `NetCnfUninit` unbinds and clears the flag. **Both rows answer 1 whatever happened.** The PCSX2 log shows the same
  load order (97.38-97.88 s). **STRONG.**
- **Implementation**: nothing for the page beyond an "already loaded" flag. Retire the placeholder as "no IOP: the
  rows answer 1 as the original's always do".

### 11. `NETCNF_DEFAULT_INDEX_READING` -- `netLoginCommands.ts:120`

- **Prior**: "the module not decompiled".
- **What I did**: `RUN/IRX/EZNETCNF.IRX` keeps its symbol table. `irx.py` lists it and disassembles `getCombinationList`
  (0x39c, 1,044 B), `getCombinationValue` and `netdbMap` (`out/eznetcnf.txt`).
- **Answer**: the 0x440-byte reply:
  - +0 = `netdbMap(device, 6, 10, 10)`: **6** for a path starting `mc`, **10** for `pfs`, 10 otherwise;
  - +8+4i = each listed combination's number, `strtol` of the first digit run in its user name;
  - entries of 0x68 at +0x30+(n-1)*0x68: flags, protocol type, key, two display names;
  - **+4 = the number of the first combination in sceNetCnfGetList's order** (0 when there is none).

  For the one `Combination1` that OT.R3 writes, that is 1. **STRONG** (machine code read; the only step is the list's
  order being the card index's order).
- **Implementation**: compute +4 as the first entry's parsed number, not a constant 1. Test: an index listing
  `Combination2` first gives 2.

### 12. `NETCNF_CARD_CHANGED_READING` -- NOT-A-GAP

The probe's semantics are transcribed. Whether the virtual card ever reports -1/-2 is PLAT-26's model.

### 2.2 13-14. `DME_INIT_RESULT_READING` (0), `MEDIUS_INIT_RESULT_READING` (1) -- RESOLVED, PROVEN

`FUN_0030dbb0` (D:L210291-210351) returns the DME init block's result word (`iStack_3c`, filled by
`FUN_006206a8`). It also sizes the DME buffers by `ComeFromLan` (0x2000/0x8000 or 0x8000/0x8000, D:L210323-210329).
`DMEInit` takes 0 as success (D:L122629-122636). `FUN_00300840` (D:L202027-202045) returns `FUN_002f42e0(rc)`, which is
`rc == 0` (D:L194349-194353), into the valve. The port's values are the success values. Retire both as readings of the
code.

### 2.3 15-16. `DNAS_HOLD_SECONDS_PLACEHOLDER`, `LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER` -- NOT-A-GAP (owner, OT.R20)

The figures are the owner's. §8's log adds the console-emulated CONNECTING stand (about 5.4 s) for reference.

---

## 3. The screen and state manager, the zAnim bridge

### 17. `DIALOG_NAME_MATCH_READING` -- `dialogArchive.ts:18`

- **What I did**: read `FUN_0032f630` (D:L230477-), `FUN_0032c040` (D:L228183-228231), `FUN_00258650`
  (D:L104746-104776) and `FUN_0025ae00` (D:L106247-106276). `js/zarnames.ts` checked every UI archive for case-only name
  collisions (`out/zar_case.txt`).
- **Answer**: the name is cut to its basename (after the last `/`, else `\`, by `strrchr` 0x1999c0). The archives open
  in the list at 0x488514 are searched in order, each in its current directory: the first member whose name matches
  under `strcasecmp` (0x198b80), skipping members whose +0x10 is -1. There is **no exact-match pass**. READERC (110
  keys), READERX (4) and DBUFFER (193) have no two names that differ only by case, so the port's "exact, then
  case-insensitive" returns the same member on the disc. **STRONG.**
- **Implementation**: one case-insensitive pass over the basename. Test: `data/common/zrdr/dialog/DLGMENU.RDR` finds
  `dlgMenu.rdr`.

### 18. `NODE_NAME_MATCH_READING` -- defined in `$PORT/packages/ui/src/zanimRuntime.ts:162` (ledgered here)

- **What I did**: followed `FUN_0026f4e0` (D:L118147-) and the type-4 resolve `FUN_00269230` (D:L114368-114413) to the
  menu objects' find-by-name. All nine node vtables I found by their constructors' +0x60 stores (0x406120, 0x406600,
  0x4067b0, 0x406800, 0x406850, 0x4068a0, 0x4068f0, 0x406940, 0x406990) have +0x24 = `FUN_00315d00`
  (`out/vtables.txt`). `js/nodecase.ts` replayed every dialog's references (`out/nodecase.txt`).
- **Answer**: `FUN_00315d00` (D:L215255-215290) compares `strlen`, then `strcmp`: **case-sensitive**. It searches the
  direct children (+0x70, count +0x6c) first, then each child's subtree in order. On the disc, over 107 dialogs, 12,060
  references: 6,131 match exactly, **0 match only case-insensitively**, and 5,929 name no node of that dialog. So the
  port's folding never changes a binding. **STRONG.**
- **Implementation**: switch to exact matching, to be faithful (no visible change). Test: the replay's fold-only count
  stays 0.

### 19. `NODE_ACTIVE_FLAG_READING` -- `zanimRuntime.ts:169` (ledgered here)

- **What I did**: `OBJECT_ACTIVE_STATE` (`FUN_00263aa0`, D:L111355-111370; disassembly: `$a1` = 1 for show, 0 for
  hide) calls the node's +0x60 vtable +0x38. In the nine vtables that is `FUN_001ec450` or `FUN_00312a70`, identical
  bodies (`out/vtables.txt`, `out/disasm.txt`): `+0x5c = (+0x5c & ~1) | (a1 & 1)`, returning the old bit.
  `NODE_ACTIVE` (`FUN_0025e230`, D:L107967-107984) reads the same object's +0x5c bit 0.
- **Answer**: one flag. **PROVEN** (for the classes found; a class with another +0x38 was not found).
- **Implementation**: none; retire the reading.

### 3.1 20-21. `BINDING_SET_SEARCH_READING`, `LOADED_SETS_READING` -- `screenScripts.ts:106`, `:131`

- **What I did**: read `FUN_0026a250` (D:L115001-) and `FUN_0026c600` (D:L116314-116386). The store scan finds one
  absolute writer of 0x414be4, at 0x26c654: the activation (D:L116330). `js/setdups.ts` checked every dialog's own
  libraries (`out/setdups.txt`).
- **Answer**: a name with `::` (0x3ed260) names its set. Otherwise the current set (ctx+0x34, the last activated) is
  searched first, then every other set in index order. No dialog of the disc defines one animation name in two of its
  own sets: the only duplicates are within one set (`OnInvOffAct` in `dlgControllerSelection.rdr`, `RespawnAct` in
  `dlgCreateGame.rdr`, `OnWatchBtnPress` in `dlgLANBriefingRoom.rdr`). No binding uses `::`. The port's index-0 walk
  therefore finds the same animation. **STRONG.**
- **Implementation**: none needed; optionally search the last-activated set first. Note the within-set duplicates for
  `FUN_0026c8f0`'s first-match.

### 22. `INPUT_STRING_ARGUMENT_READING` -- `screenScripts.ts:90`

- **What I did**: read the event dispatch `FUN_00367810` (D:L263359-263395) and `FUN_00272480` (D:L119979-120008).
- **Answer**: the string input (type 8) a started animation receives is chosen in this order:
  1. the **event's own argument** (`param_3`) when it is non-null;
  2. else the record's ARGUMENT (G+0x700);
  3. else none, started plainly (`FUN_002734b0`).

  Events posted with text: `MP_MEDIUS_ERROR` with the network error's text (D:L122765, D:L209107), the system messages,
  the keyboard's events. `FUN_00272480` answers the n-th type-8 input. **STRONG.**
- **Gap in the port**: `menuShell.ts:53`/`:266` and `input/dispatch.ts:53` fire `FUN_00367810(G, kind, 0)` only. An
  event with text (`OnNetError`'s `INPUT_STRING`) loses its text; the keyboard path already carries it.
- **Implementation**: give the event post an optional text, used before the binding's ARGUMENT. Test: `MP_MEDIUS_ERROR`
  with "The network cable is disconnected." reaches `OnNetError`'s `INPUT_STRING`.

### 23. `COMPARE_VALUES_UIVAR_ADD_READING` -- `personaCommands.ts:155`

- **What I did**: disassembled `UICompareValues` 0x274db0 (`out/disasm.txt`).
- **Answer**: before each `jal 0x3857c0`, `$a3` is set to **1** (0x274e6c, 0x274eac: the constant also used for the
  `== 1` test) and `$a2` to 0. So `CUIVarManager_Add` (D:L279411-279442) makes an absent variable with no value at
  longevity 1, or raises a held one to at least 1. The comparison then uses the name, because the new variable is no
  string. **PROVEN.** The port's "looked up, not made" compares the same way but does not create the variable.
- **Implementation**: `uiVars.add(name, none, 1)` when absent (the longevity the port's `NetGetInterfaceList` already
  uses). Test: after CompareValues on an unknown var, the var exists with longevity 1.

### 24. `COMPARE_AFTER_FORMATTING_READING` -- `personaCommands.ts:163`

- **What I did**: `js/cmpvals.ts` tallied all 114 CompareValues commands of the three zAnim archives (`out/cmpvals.txt`).
- **Answer**: exactly one sets byte +0x15: `UIZANIM.ZAR` `dlgGameLobby.rdr` `OnlyModeText`, comparing the vars
  `mission_title` and `GAMENAMEVAR` after their formatting. The mechanism is unchanged: a text object's set-string,
  `FUN_00363830` D:L261172-261246, with the `$~` cut and the parse. **STRONG** for the inventory.
- **Owed**: the caption parse in the game-lobby task (ONL-1x) that builds `dlgGameLobby`.

### 25. `PRUNE_ALL_SPACES_READING` -- `personaCommands.ts:147`

- **What I did**: disassembled `UIPruneUIVarSpaces` 0x278370 (`out/disasm.txt`). The buffer is at sp+0x20, `$ra` is
  saved at sp+0x10..0x17, and sp+0x18..0x1f is unwritten padding.
- **Answer**: walking back over a string of spaces stops at the first non-space byte at or below sp+0x1f. At the latest
  that is sp+0x17, the top byte of the saved `$ra`, which is 0 for an address below 4 GB. The `sb $zero, 1(a0)` then
  writes at sp+0x18..sp+0x20, never into `$ra`. Two cases follow:
  - if it lands on sp+0x20, the buffer is cut to "";
  - if it lands lower, the buffer is untouched and the leading-space skip (0x278480-0x2784a4) walks to the original
    terminator.

  Either way `CUIVariable_op_assign` gets "". **PROVEN.** Retire.

### 26. `ACCT_NO_LOBBY_HOST_READING` -- NOT-A-GAP

A null HOST is undefined behaviour no path reaches.

### 27. `ACCOUNT_NAME_READING` -- `worldOfSocomCommands.ts:278`

- **What I did**: listed the writers of 0x66a4f4 (D:L182648, D:L198299) and disassembled `UILobbyLogin` 0x27dd20.
- **Answer**: `FUN_002fa5a0(lobby, name, password)` is called with `$a1` = PLAYERNAMEVAR's text (0x3ee980) and `$a2` =
  PLAYERPASSWORD's (0x3ee990) (0x27dd80-0x27ddbc). It copies 0x20 bytes of the name to 0x66a4f4 and queues lobby state
  7. The connect (`FUN_002e0030`) first sets 0x66a4f4 to **"zname_a"** (0x3f39c8) and 0x66a514 to "zpass_a". The world
  menu is reached only past the login, so PLAYERNAMEVAR's text is right. The fallback should be "zname_a", not "".
  **STRONG.**
- **Implementation**: change the absent-name fallback to `zname_a`. Test: with no login, the foot shows `zname_a`.

### 3.2 28-33. The world menu's and the agreement's hooks -- NOT-A-GAP (owed to ONL-07/10/11/27, OT.R8)

`GET_CLAN_STUB_READING`, `ROOM_LIST_STUB_READING`, `WORLD_LOBBY_STATE_READING`, `LOBBY_SESSION_UP_READING`,
`LOBBY_STATE_PLACEHOLDER` and `PARKED_ROW_GATE_READING` transcribe the original's answer for the path's state. What I
add, for the owning tasks:

- **GetMyClans** (`FUN_002e8a90` -> `FUN_002e8bd0`): request 0x30 = MessageID, key, 2 pad, Start (+0x28) 1, PageSize
  (+0x2c) 999, which is Horizon's `MediusGetMyClansRequest`. Reply, success branch D:L187806-187830:
  - ClanID (+0x1c), ClanName (+0x24, 0x20), LeaderAccountID (+0x44) and Stats (+0x68, 0x100), as Horizon's
    `MediusGetMyClansResponse` lays them out;
  - the icon file `clan_icon_%.2d.tif` (0x3f4310) of `atoi(Stats[0..2])` (row 63).
- **RefreshRoomList** (`FUN_002e3aa0`): the 0x1a-byte request is Horizon's `MediusChannelList_ExtraInfoRequest`
  (MessageID, 1 pad, PageID u16 = 1, PageSize u16 = 999).
- **State 11** is the state whose handler is registered at +0x2c (`FUN_002ee540`, D:L190190-190192).

### 34. `LIST_ICO_BYTES_READING` -- RESOLVED, PROVEN

`RUN/ICONS/LIST.ICO` is 50,234 B (`out/sizes.txt`). `FUN_003a0a10` copies `LIST.ICO` (0x3fbc88) in 0x400-byte chunks
(D:L295597-295618). It is a disc read, no longer a reading.

### 35. `SAVE_GAME_DUMMY_BYTES_READING` -- PARTIAL, STRONG

- `UISaveConfig` `FUN_0027b000` (D:L124764-124786) creates `SaveGame0..6` when absent. It calls
  `FUN_003a1ea0(card, name, "This game is a dummy game.")` (0x3eef00), which leads to `CSaveManager::Save`
  `FUN_0033dff0(.., module 0xc, ..)` (D:L239142-).
- That function builds a secured archive (`root`, a `zSaveHeader` of 0x10c bytes: +0 0x10c, +4 the module, +8 the
  argument, +12 the text by "%s"; then `CSaveModuleList`).
- The file size follows from the archive writer, not a constant. 1,952 B is what the recompiled original wrote on the
  f0 card (`logs/parity/f0/mc0/BASCUS-97275SOCOMII/SaveGame0..6`).
- **Owed**: a PCSX2 card dump of a fresh SaveConfig to confirm the size outside the recompilation.

### 36. `SAVE_HEADER_TEXT_PLACEHOLDER` -- RESOLVED, STRONG

`GetNumSavedGames` (D:L126305-126343) counts `SaveGame0..9` whose header text starts with `m` and is not the dummy text.
The front end writes only dummies (§35), so returning null (not counted) and returning their real text count alike: 0.
The port already holds the rule (`menuCommands.ts:395-409`). Suggestion: `MenuCardIo.saveHeaderText` answers
`SAVE_HEADER_DUMMY_TEXT` for a dummy, and the placeholder retires.

### 37. `CONFIG_HEADER_CHECK_READING` -- RESOLVED, PROVEN

`CSaveManager::Load` loads when the header read fails, when the asked module is -1, or when the module matches
(D:L238929-238930). `FUN_0033d4a0` answers 0 when there is no `zSaveHeader` key (D:L238857-238861). A file with no
header loads, as the port does. SaveConfig writes module 0xe (D:L295987). Retire.

### 38. `CONFIG_FILE_PLACEHOLDER` -- NOT-A-GAP

Wiring owed to OPT-01/02/04a. 4,784 B is f0's (§35's source). Note for OPT-01: the card files are the save manager's
secured archives (flags non-zero: `BASCUS-97275SOCOMII` starts `96 00 00 18`), not plain data.

### 39. `MC_CHANGED_SLOT_UNWRITTEN_READING` -- UNRESOLVED (BELIEVED)

`FUN_0027b340` passes sp+0x3c to the probe (0x27b358) and loads it after (0x27b364) with no store of its own
(`out/disasm.txt`). On a tick where the probe writes nothing, the valve takes the low 16 bits of whatever the last frame
at that depth left there. The port's "left as it is" holds if that was the last poll's value. **Owed**: on PCSX2, break
at 0x27b364 for 20 consecutive idle ticks on `dlgNetPlayerName` and log `lw 0x3c($sp)` beside the valve
`mc_changed_slot`.

### 3.3 40-47. NOT-A-GAP

- `MC_ISSUE_FAILURE_READING`: a libmc model choice.
- `MISSION_MEMORY_PLACEHOLDER`, `CORE_STATE_PLACEHOLDER`, `MAP_LOAD_PLACEHOLDER`, `LOAD_STATE_SCRIPTS_PLACEHOLDER`: the
  campaign and the round are out of the front end's scope.
- `IOP_REBOOT_PLACEHOLDER`: no browser IOP. The set mapping (Singleplayer 2, Multiplayer 3, NetConfig 4, MainMenu 5;
  D:L122996-123031) is already in `IOP_MODULE_SET`.
- `NETWORK_GUI_PLACEHOLDER`, `FRONT_END_ENTRY_READING`: the owner's calls.

### 3.4 48-53. The menu queue's bounds -- NOT-A-GAP (and one PARTIAL)

- **48, `MENU_QUEUE_OVERFLOW_READING`**: undefined behaviour no disc script reaches (research 115 §1.1).
- **50-51, `MENU_NAME_LENGTH_READING` / `DEFAULT_MENU_SCREEN_LENGTH_READING`**: the cuts at 47 and 63 are never
  reached. The longest dialog member is `dlgControllerPresetsNewGame.rdr` (31). Every SWITCHMENU argument in the three
  zAnim archives is at most 31, and POPUPDIALOG, FLUSHMENUHISTORY and SETMENUSTATE take `NA` (`out/namelen.txt`,
  `out/argslen.txt`). **PROVEN unreachable.**
- **49, `MENU_HISTORY_OVERFLOW_READING`**: PARTIAL. **Owed**: a search of the dialog flow graph
  (`$PORT/tools/dialogInventory.ts`'s edges) for any cycle of 33 forward switches with no `PREVIOUS_SCREEN` or
  `FlushMenuHistory`, or a trace of M+0x824 in a long online session.
- **52-53, `MENU_SWITCH_REENTRY_READING` / `MENU_MISSING_DIALOG_READING`**: transcribed as read.

### 54. `MENU_SOUND_PLAY_READING` (note only) -- RESOLVED, STRONG

The menu sound object's vtable is 0x406ac0 (research 122 R122.4).

- **BACK** (MS+0x20, `FUN_001f4860` D:L54829-54849) calls +0xc (`FUN_00343550`, D:L242274-242286) with (0, 0xff). That
  is +0x18 (`FUN_00343140`) with volume 1.0, pan -1 (the bank's own), pitch 0, handle 0 (a new voice), and 0xff stored
  at the handle's +0x24.
- **`.METAL`** (`PopUpDialog`, D:L126897-126899) calls +0x1c (`FUN_00342aa0`, D:L242023-242035) with (1, 0, 0xff). That
  sets the one-shot bit (object +0x1c bit 2) for the call, plays through +0xc with (0, 0xff), and restores the bit.

The note row can retire. The meaning of 0xff is C7's.

### 55. `POPUP_FOCUS_READING` (note only) -- RESOLVED, STRONG

`FUN_0038d8f0` (D:L284051-284095) is the soft keyboard's tick (`DAT_0049ecd0`). Its third argument gates only the loop
over the keyboard's pad events (D:L284063-284069). A shown `POPUP` (+0x5c bit 0, D:L262357-262361) freezes the
keyboard's input, not "the dialog's focus". The port implements exactly that (`keyboard/softKeyboard.ts:564-567`). Fix
research 115 §13's wording and retire.

### 57. `ZVID_SWAP_ARG_READING` (note only) -- RESOLVED, STRONG

In the menu tick's tail (0x1f4808-0x1f4838, `out/disasm.txt`), while MS+0x10 > 0 it is decremented and
`FUN_003aff30(0, 1)` is called; otherwise `(1, 1)`. OnPop sets MS+0x10 = 2 (research 115 §7).

In `FUN_003aff30` (D:L304735-304835), the first argument 0 skips the flip:
- the display registers (DISPFB1/2, DISPLAY1/2, SMODE2, PMODE) are not written and the double-buffer index is not
  swapped, so the screen keeps the last shown frame;
- the timers and frame counters still advance;
- only when `DAT_004a4510` is set is PMODE set to 0x60, both read circuits off: a black output.
  `DAT_004a4510` is set by the core state's video set-up (D:L51151) and cleared by `FUN_003b1200` (D:L305291) and the
  round's countdown (D:L50814).

**Implementation**: after OnPop the page presents nothing for two ticks (the previous frame stands), or black when the
pop comes back from the round. Test: the two frames after OnPop equal the last frame before the push.

### 58. `MENU_FADE_UP_AUTOSTART_READING` (note) -- PARTIAL, BELIEVED

- `FUN_0026c600` (D:L116360) starts the instances whose byte +5 bit 3 is set.
- An instance's first 0x18 bytes are the raw `Anim_Params` (0x3ed3f8, copied by `FUN_0026d370` D:L116937). Byte +5
  bit 3 would be the u32 flags' bit 11 (`m_max_anim_copies` bit 0 in reCOM's `zanim.h:374-385`). That bit is 0 in all
  1,525 animations of `UIZANIM.ZAR` (`out/fadeflags.txt`), so the runtime sets it.
- Activation (`flags & 3`) is 1 in exactly 8 animations: `missionsel_popup_onstart`, five `playerinfo_onstart`, `led`
  and `menu_fade_up`. The rest are 2 (`out/act1.txt`). Every one is a start-at-load script by its name. The port's
  rule matches them.
- **Owed**: the writer of instance byte +5 bit 3. Searched: the `+ 5)` stores in D:L104000-121000; `FUN_0026ff20`,
  `FUN_0026d370`, `FUN_0026bc50`. Next: a write watch on an instance of `menu_fade_up` between `FUN_00268250` and
  `FUN_0026c600` on PCSX2.

### 59. `MENU_EVENT_RECORDS_READING` (note) -- RESOLVED, STRONG

- G's constructor makes **30** 0x10-byte records at +0x6f8 (`FUN_003698c0`, D:L264537).
- The build copies dialog+0x44's records with no bound (D:L263582-263610): byte +0 the used flag, the animation and
  argument strings duplicated, +0xc and +0xd (the event code).
- The unload frees the strings of the first 10 only and zeroes the count (D:L264391-264405). The next build frees the
  old strings slot by slot, so nothing leaks for long.
- The disc's maximum is 29 (`dlgGameLobby.rdr`; 28 dialogs exceed 10; none exceeds 30; `out/bindcount.txt`).

The port's EVENTS reading is right with a bound of 30. Retire.

### 3.5 60-62. `NETLOGIN_CHECKING_POPUP_READING`, `DNAS_LOGO_OVERLAP_READING`, `DNAS_FIRST_FRAME_READING` -- UNRESOLVED

No timed capture of these frames exists: `pcsx2_psrewired*/` holds single shots, and `s13_31_boot_shots` is the boot.
**Owed**, PCSX2 on the local Horizon with frame dumps at 59.94 Hz:
- (a) LOGIN's first 30 frames after `SWITCHMENU(dlgNetLogin.rdr)`: is #572/#573 ever drawn?
- (b) the DNAS screen from its build to the switch: is the first frame `_533`/`_446` or #448/#534?
- (c) `DNASLogo`'s opacity across `TurnOnLogo`/`TurnOffLogo` with the DNAS bypass pnach.

The dumps should also log RDRAM at `DAT_00414e40`+0x5c for the logo's node.

### 63. `CLAN_ICON_INDEX_READING` (note) -- RESOLVED, STRONG

In `FUN_002e8bd0`'s success branch, the reply's Stats (+0x68) is copied to 0x44f5e8. Its first 3 characters go through
`atoi` (`FUN_00191490`) and are formatted by `clan_icon_%.2d.tif` (D:L187819-187822). The Stats are the server's copy of
what the client wrote: `FUN_002e7b80`/`FUN_002e7d70` write 0 there (research 128). The disc holds no `clan_icon` file
(`find -iname '*clan*'` in `game/disc`: nothing). On our stack the index is always 0. Retire as answered.

### 64. `MP_ROOMS_READER_READING` (note) -- RESOLVED, STRONG

`mp_rooms` appears in no ELF of ours: r0001, r0004, beta 973.66, or `SCUS_972.75` (case-insensitive byte search,
`out/mp_rooms.txt`). No format string builds `mp_...rdr` (strings, `out/strings.txt` sweep). The dialog lookup is by name
only (§17). No client code reads the member. It is most likely a server-side table shipped on the disc.

### 3.6 U2-U10

- **U2, NameIsVulgar** (research 153 §unknowns): its one writer is `dlgNetConnect.rdr` `OnFilterFailure`
  (`NameIsVulgar = 1`). That animation is bound on `MP_FILTER_FAILURE` (code 37; `out/binds_dlgNetConnect.txt`). The
  post is `FUN_002eea70` (D:L190952-190981), the reply of lobby state 3's account-name filter (`FUN_002ee9b0`:
  TextFilter **type 0, PassFail**, on 0x66a4f4). A reply status (+0x58) below 0 posts `MP_FILTER_FAILURE` and queues
  state 6. Otherwise it sends **AccountRegistration** (0x3f4a40; then `AccountLoginAfterRegister` 0x3f4a60).
  `OnLoginRoomstart` on `dlgNetPlayerName` reads and clears it. **STRONG.** For ONL-07.
- **U3, UsagePolicyReturnScreen**: `dlgNetConnect` `init_socom_online` sets 1, `dlgMPBriefingRoom` `OnBriefingRoomstart`
  sets 0, and `dlgUsagePolicy` `ForceUsagePolicyReturn` tests == 1 (`out/vulgar.txt`). **PROVEN** (disc scripts).
- **U4, #614 across the switch**: owed to ONL-07's connection plus a capture (research 153).
- **U5, the card prompts owed to OPT-05b..g** (`cardCommands.ts:476-517`): parked by OT.R8.
- **U6, `DeleteMUISPersona`'s null compare** (`personaCommands.ts:478`): undefined behaviour; the list offers no place
  without a record.
- **U7, duplicated node names**: `dlgWorldOfSOCOM` holds `DescFieldMid` twice. Eleven of its animations aim at it
  (`out/nodecase.txt` DUP-REF; also `dlgCreateClan`, `dlgLANBriefingRoom`, `dlgRespondToInvites` `DescriptionText`,
  `dlgMPBriefingRoom` `bar_title`, `dlgDebriefing` `aimult`). The original takes the first direct child in creation
  order (§18); the port takes the first in `dialogNodeNames` order. They agree when both copies are top-level objects
  (BELIEVED). **Owed**: confirm both are OBJECTS entries, not subordinates.
- **U8**: the arrival focus is superseded (FOCUS-RING, research 116 §17).
- **U9**: `INPUT_STRING_NULL_READING` (`screenCommands.ts:48`) and `ONL_02_RETURN_FOCUS_READING`
  (`netLoginDesktopHook.ts:26`) sit in C5a files but are C5b's ledger rows.
- **U10, default servers** (`FUN_0030e290`, D:L210544-210553): InitNetwork's set-up writes
  `socom2-prod.pdonline.scea.com` port 0x275b (**10075**) and `socom2-prod.muis.pdonline.scea.com` port 0x2757
  (**10071**) into the DME object (+0x47/+0x88, +0x8c/+0xcc). The PCSX2 run resolves the MUIS name and connects to 10071
  (§8). **PROVEN.**

---

## 4. Sourced but not implemented (multiplayer-relevant)

1. **The lobby client's state table** (`FUN_002ed460`, D:L190163-190217). Each handler is registered by state, with
   phase bytes 1-4:

   | state | handler | what it is |
   |---|---|---|
   | 1 | 0x2ee6b0 | |
   | 2 | `FUN_002ee610` | |
   | 3 | `FUN_002ee9b0` | account-name filter |
   | 6 | 0x2ee6d0 | |
   | 7 | `FUN_002eede0` | login |
   | 10 | 0x2ee6c0 | |
   | 11 | `FUN_002ee540` | |
   | 12 | `FUN_002ee830` | SessionBegin |
   | 13 | `FUN_002edda0` | CreateNewGame |
   | 14 | 0x2ee6a0 | |
   | 15 | `FUN_002eda60` | JoinGame |
   | 16 | `FUN_002efa90` | LobbyServerConnect |
   | 17 | 0x2ef3c0 | |
   | 18 | `FUN_002ee6e0` | SessionEnd |
   | 19 | `FUN_002ee290` | |
   | 20 | `FUN_002ed740` | |

   ONL-07/10/12/16 can be built against this table.
2. **The Medius messages the front end sends**, laid out and matched to Horizon:
   - SessionBegin, then `MP_SUCCESS` (§3);
   - SessionEnd at logout (§4);
   - TextFilter, Replace for NetCensorText (§6) and PassFail for account registration (U2);
   - AccountRegistration, then AccountLoginAfterRegister (U2);
   - GetMyClans with Start 1 and PageSize 999 (§28);
   - ChannelList_ExtraInfo with PageID 1 and PageSize 999 (§28).
3. **The network start's error events**: `MP_MEDIUS_ERROR` with "Network Initialization Error: Cannot Initialize Network
   (0)" or "The network cable is disconnected." (§7). They need the event-argument path of §22.
4. **The default production hosts and ports** (U10): the client's DNS names a server must answer, or the patch must
   remap.
5. **DME buffer sizes by mode** (D:L210323-210329) and a 0x28e8 (10472) word at +4 of DME's init block (D:L210318): a
   lead for C1's DME transport, not interpreted here.

## 5. Leads for other workstreams

- **C5b**: research 115's `POPUP_FOCUS_READING` row describes the keyboard gate (§55). `INPUT_STRING_NULL_READING`
  sits in `screenCommands.ts:48`.
- **C6**: `NODE_NAME_MATCH_READING` and `NODE_ACTIVE_FLAG_READING` live in `zanimRuntime.ts` (§18-19); the runtime's
  find is case-sensitive.
- **C7**: the 0xff tag of the menu sound plays (§54).
- **C8**: the card's save files are secured ZARs with a `zSaveHeader` (§35, §38); GetMyClans' reply layout (§28).
- **C1**: DME init parameters (item 5 above). `ComeFromLan` decides the DME buffer sizes, LobbyDisconnect's branch and
  the NTGUI return.

## 6. Verification (V4, 2026-10-04)

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

### 6.1 Verdicts

| # | claim | report | verdict | one-line reason |
|---|---|---|---|---|
| 7 | `FUN_003045b0` ignores its argument and reads the valve `ComeFromLan` | C5a | CONFIRMED | disassembly 0x3045b0-0x304604 never reads `$a0` before overwriting it; the string at 0x3f6328 is `ComeFromLan`; the result is the short at +4 |
| 8 | the port's `lanUp` hook is wrong in three places | C5a | CONFIRMED-WITH-CORRECTION | true; the report lists 4 sites, of which 2 are code (`personaCommands.ts:552`, `:615`) and 2 are docs (`:334-335`, `universeCommands.ts:99`) |
| 9 | `LobbyDisconnect` branches on `ComeFromLan`: `FUN_002dfdd0` vs `FUN_003043e0`; it answers 1 | C5a | CONFIRMED | D:L121601-121614; `FUN_003043e0` = `FUN_002df8e0` + clear the pointer (D:L204419-204425) |
| 10 | CompareValues makes a missing var at longevity 1 | C5a | CONFIRMED | `addiu a3,zero,1` at 0x274e6c / 0x274eac before `jal 0x3857c0`; `FUN_003857c0` creates it, or raises longevity to `param_4` |
| 11 | `DAT_0045a0c1` (IsNetwork) is set 1 by DMEInit's success | C5a | CONFIRMED | D:L122630 `FUN_0030e3a0(0x45a0c0,1)` writes byte +1; no direct store exists (my store scan finds only zeros) |

### 6.2 Claim 7: `FUN_003045b0` reads `ComeFromLan` -- CONFIRMED

- My disassembly of 0x3045b0-0x304604 shows `$a0` is overwritten by `lui/addiu 0x3f6328` before any read. The
  argument 0x44fe10 that all 45 callers pass is dead.
- The valve pointer is cached in `DAT_00450058`, and the result is `lhu 4(v0) != 0`.
- The strings file gives 0x3f6328 = `ComeFromLan`.
- D:L80988-80994 picks `dlgReturnFromNTGUI2LAN.rdr` when the result is non-zero.

### 6.3 Claim 8: The `lanUp` sites -- CONFIRMED-WITH-CORRECTION

- The substance is right: every port site that calls `FUN_003045b0` "the LAN lobby is up" misnames a valve read.
- The count is loose. The code that calls the hook is `personaCommands.ts:552` (NetCensorText, matching D:L122967's
  `IsNetwork && !ComeFromLan`) and `:615` (LobbyConnect). `:334-335` is the hook's doc, and `universeCommands.ts:99`
  is only the LOBBY_DISCONNECT doc, which no code there calls.
- So: two code sites, two docs. The suggested `comeFromLan(valves)` helper and one test per code site stand.

### 6.4 Claim 9: LobbyDisconnect -- CONFIRMED

- `FUN_00274d60` (D:L121601-121614): if `ComeFromLan` is 0 it calls `FUN_002dfdd0(0x44f370)`; otherwise
  `FUN_003043e0(0x44fe10)`, which is `FUN_002df8e0(0x44f370)` plus `*p = 0` (D:L204419-204425). It returns 1.
- I did not re-follow the +0x7d / Medius-close chain inside `FUN_002dfdd0`; C5a grades it STRONG.

### 6.5 Claim 10: CompareValues creates the variable -- CONFIRMED

- 0x274e6c and 0x274eac: `addiu $a3,$zero,1` and `move $a2,$zero` before `jal 0x3857c0`, each gated by the command's
  byte +0x11 / +0x13 == 1.
- `FUN_003857c0` (D:L279411-279442) creates the variable when it is absent (`FUN_003859d0`) and raises its longevity
  to `param_4`.

### 6.6 Claim 11: `IS_NETWORK_ON_PATH_READING` -- CONFIRMED

- My store scan (`v_netflags.py`) finds no lui-based non-zero store to 0x45a0c1. The 1 comes through a struct base:
  D:L122630 `FUN_0030e3a0(0x45a0c0, 1)` writes `*(base + 1)`.
- `FUN_00402800` (D:L328767+) zeroes the block once as a static initializer. It has no callers and registers a
  destructor through `FUN_00182810`.

### 6.7 What an implementer should take from this (the verifier's list, for all seven reports)

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
