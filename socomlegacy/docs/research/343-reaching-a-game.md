# 343 -- How a game was reached: from JOIN GAME to the game lobby's first frame (SA-2)

- Task: SA-2 of the server split (`../plans/2026-10-17-server-split.md`, SA-2; SA.R12, SA.R15; it feeds SA-6), the brief
  `../plans/briefs/2026-10-17-sa-2-reaching-a-game.md`. **Simulation track**, research only: no code and no test change
  with it.
- Date: 2026-10-17.
- Level: **reading, pending review** for every transcription below (the retail decompilation and our Horizon's
  sources); a fresh reviewer re-reads it at the source before it counts as a reading. **Nothing here is proven**: the
  captures cited agree with the readings by eye and are not scored by any harness (§8 says what would score them).
- Sources. The retail decompilation r0001 (`$SOCOM_PC_ROOT/game/analysis/socom2_game.elf.decomp.c`, `D:L<n>`,
  `FUN_<addr>`; cited, never pasted) and the ELF's strings (`socom2_game.elf.strings.txt`, `S:0x<addr>`). The disc's
  scripts as the repository's pinned dump holds them (`tools/test/onlineDialogs.pinned.json`, cited `P:L<n>`) and the
  captions' ids and names as the loc golden pins them (`packages/scene/test/golden/locTables.json`). Our Horizon as an
  emulator's reading of the messages, read with `git show` at the desktop pin
  (`desktop@be5578311:server/horizon-server/<path>:<line>`; below `H:<path>:<line>`, the path under
  `server/horizon-server/`). Three logs of the recompiled retail code against our Horizon (§1.3): their addresses,
  their access keys and their session keys are **not reproduced here** (personal data and keys), only field names,
  types, ids and counts.
- Stands on research [154](154-the-briefing-rooms-and-the-game-list.md) (§2 the JoinGame pair),
  [159](159-the-bridge-to-the-match-start.md) (§1 the hello's ticket, §4 the API),
  [165](165-the-game-lobby-to-the-launch.md) (R165.1 the join's script, R165.3 the refusals, R165.10 the creator),
  [193](193-m2-mp-net-replication.md) (§2.1 the DME's class-0 ids), [308](308-clan-games-joining.md) (§3.2, §4 the
  host's admission) and [314](314-watch-game-spectating.md) (R314.2, R314.4 a watch), and does not
  restate them. No server was contacted, no game was run, no tool was run (the worktree has no modules).

## 0. Answers

| # | finding | section |
|---|---|---|
| R343.1 | **A game was reached in two hops, and admitted twice.** Hop 1: Medius' JoinGame to the lobby server, which checks the password, the seats and a ban and answers a **connection info** (the game server's addresses, its world id, its RSA key, the session key and a per-join **access key**). Hop 2: the client connects to the address that answer names (the DME), presents the world id, the application id, the session key and the access key, joins the DME session under its account name, and is then **admitted a second time by the host console** (the session master): its side, the spectator slots and the clan rule, answered in a Game Signal. Only then does the script switch to `dlgGameLobby.rdr` | §1-§3 |
| R343.2 | **The request carries four things the client fills**: the session key, the game's world id, the join type (1 when watching) and the password of that type; GameHostType 0, the RSA key and the address list are left zero (the library fills the addresses only for host type 2, peer to peer, which SOCOM II never sends) | §1.1 |
| R343.3 | **The answer's status is read three ways**: -978 MP_INVALID_PASSWORD, -972 MP_BANNED_FROM_GAME, anything else MP_MEDIUS_JOIN_GAME_FAILURE (#441); the lobby goes to state 11. Success copies the connection info whole (+0x20..+0xbb) and queues state 17; GameHostType (+0x1c) is **not read** | §2.1 |
| R343.4 | **Every field of the connection info goes into the connect**: the type picks the transport (1, 3, 4 client-server; 2 peer to peer; else an error), the first address and port are dialled, a NAT-service second address takes a NAT step, the world id and the RSA key go into the connect, the session key and the access key are appended to it | §2.2, §3.1 |
| R343.5 | **The game server the client dials is the address the lobby server names, not the host console's**: the client asks for host type 0 (ClientServer) at the create and the join; our Horizon answers ClientServerTCPAuxUDP with its own DME's address. The host console's role is the session master's: who is admitted, on which side, and the round | §2.3, §3.3 |
| R343.6 | **Nothing from the join's answer is shown to the player** but a failure's caption. The game list's PING column is the world report's GenericField2, which SOCOM II sets to 65000 at the lobby's init and never writes again in the decompilation; no host name is carried anywhere on this path | §4.1 |
| R343.7 | **The waits**: the briefing room's `monitor_timeout` (30 s, #440) runs from the join's start through the connect; `join_after_a_while` (33.3 s) bounds the wait for the session to count the console; `do_join` calls `JoinGameServer` once (0: #427). The network library has its own 30 000 ms wait on the connect's state. A failed connect is #425 | §3.4 |
| R343.8 | **The mapping**: the door `wss://<host>/g/<gameId>` stands for the first address, its port and the DME world id; the game token stands for the access key and the session key, and for what the connect carried beside them (the watch flag, the clan-member claim); the type, the NAT-service address and the RSA key are not carried (one transport, no NAT, TLS) | §4, §5 |
| R343.9 | **The creator's door cannot ride on its own JoinGame answer** if placement waits for the map (SA-6): on the original the creator's JoinGame answer already names the game server (our Horizon makes the DME world at the create). The port already holds the creator's socket until its world report settles (`HOST_REPORT_BEFORE_JOIN_ADAPTATION`), so the creator's door belongs on the report's answer -- an adaptation SA-6 labels | §5 |
| R343.10 | **The s4 slice holds no frame of this path**: both its slices start after the join (the host's world reports; the DME's object records), and PROVE-1 scores only the results' posts. The join's frames are in three recompiled-client logs (§1.3), none scored | §1.3, §3.5 |

## 1. The request

### 1.1 What the client sends

JoinGame is Lobby 0xf3, 0xc4 bytes (research 154 §2's row). State 15's sender `FUN_002eda60` (D:L190355-190402)
zeroes the whole message (D:L190372) and fills, in order:

| offset | field (Horizon's name, `H:RT.Models/Lobby/MediusJoinGameRequest.cs:15-23`) | what SOCOM II puts there | where |
|---|---|---|---|
| +0x00 | MessageID (21 bytes) | left zero by the sender's clear; the builder passes it, the session key and the password with their widths to `FUN_0064f3d8` (body not read) | D:L190372, D:L560709-560712 |
| +0x15 | SessionKey (17) | the lobby session's key the client keeps at 0x66a4d0 (the same copy every lobby request makes) | D:L190373 |
| +0x28 | MediusWorldID | `DAT_0066a5f0`, the game's id kept from the list or the create (research 154 §2) | D:L190375 |
| +0x2c | JoinType | 1 when `FUN_002f6d00` (D:L196203-196216) answers true, else 0: the `JoinAsSpectator` variable (S:0x3f5730) set, **or** the byte `DAT_004413d8` non-zero (D:L196215) -- a byte no named writer in the decompilation sets (`WATCH_BYTE_4413D8_PLACEHOLDER`, §7) | D:L190376-190377 |
| +0x30 | GamePassword (32) | `SpectatorGamePassword` when watching, else `PlayerGamePassword` (S:0x3f4810, S:0x3f4830), empty when the variable is | D:L190378-190396 |
| +0x50 | GameHostType | 0, written explicitly | D:L190374 |
| +0x54 | pubKey (RSA, 64 bytes) | zero | D:L190372 |
| +0x94 | AddressList (2 x 24 bytes) | zero | D:L190372 |

The builder `FUN_006488f8` (D:L560698-560741) sends the 0xc4 bytes as they are for any host type but 2; only for
host type 2 (peer to peer) does it run the library's NAT path and fill the address list before sending
(D:L560716-560731, D:L560733). SOCOM II's 0 never takes it. Its reply goes to `FUN_002edba0`.

### 1.2 What the lobby server does with it (Horizon, an emulator)

`H:Server.Medius/Medius/MLS.cs:2834-2873` refuses a banned account with MediusFail; `MediusManager.JoinGame`
(`H:Server.Medius/Medius/MediusManager.cs:316-358`) answers GameNotFound for no such game, InvalidPassword when the
game's password is set and differs, WorldIsFull at MaxPlayers, and otherwise asks the game's DME for a seat
(`MediusServerJoinGameRequest`: type ClientServerTCPAuxUDP, the DME world id, the session key, the server's key). What
Sony's own server checked is not observable (`ORIGINAL_CONNECT_INFO_PLACEHOLDER`, §7). The port's checks are research
154 §2's and 314's (the rank for a player only, the watcher's password), unchanged here.

### 1.3 What the logs show

Three logs carry the join, each our Horizon's own debug log, each from the desktop's static recompilation of the retail
code (a recomp capture in PROCESS's sense), none scored:

- `$SOCOM_PC_ROOT/logs/parity/s11_r0004_cross1/server-side.log` -- a cross-revision pair: its creator runs the r0004
  code, its **joiner runs r0001** (`game_A.log` / `game_B.log`, each one's build stamp line). The joiner's JoinGame is
  line 644, the lobby's answer line 656, its DME connect lines 666-674.
- `$SOCOM_PC_ROOT/logs/parity/s11_r0004_cross2/server-side.log` -- the same pair the other way: its **creator runs
  r0001**. The creator's CreateGame1 is line 238, its own JoinGame line 254, the answer line 266, its DME connect lines
  274-282.
- `$SOCOM_PC_ROOT/logs/dme_probe7.txt` -- the DME's side only, two r0001 clients of the recompilation (desktop research
  18 calls it the "ours-frozen" slice, `desktop@be5578311:docs/research/18-online-round-start.md:96-100`): the host's
  connect lines 18-30, the joiner's lines 56-64, the join exchange lines 68-102.

The r0001 JoinGame lines agree with §1.1 field for field: the session key, the world id, JoinAsPlayer, an empty
password, GameHostType ClientServer, a zero key, two empty addresses. The Medius-side lines of both cross logs are
the `dbug: Server.Medius.MLS` form PROVE-1's reader takes (research 267 §1).

### 1.4 What the page sends today

`/lobby/join-game` with `Authorization: Bearer <the login's ticket>` and `{ mediusWorldId, joinType, gamePassword }`
(research 159 §4; `packages/server/src/lobbyHttp.ts` the `join-game` case; `packages/viewer/src/gameLobbyHost.ts`
`joinGame`). MessageID is HTTP's own pairing; the session key is the bearer; host type, key and addresses are not sent.

## 2. The answer

### 2.1 The statuses and what the client does with them

The reader `FUN_002edba0` (D:L190407-190487) first asks whether the status is a success (`FUN_002f42d0` with the label
"JoinGame", S:0x3f4848, D:L190421): the client takes **0 alone** as success (`FUN_002f42d0` D:L194340-194344), where
Horizon's `IsSuccess` is any status >= 0 (`H:RT.Models/Lobby/MediusJoinGameResponse.cs:15`). On a failure it queues
the lobby's state 11 (D:L190423-190424) and posts one of three events: -978 MP_INVALID_PASSWORD (S:0x3f4860,
D:L190425-190429), -972 MP_BANNED_FROM_GAME (S:0x3f4880, D:L190430-190434), anything else
MP_MEDIUS_JOIN_GAME_FAILURE (S:0x3f48a0, D:L190435-190437). The BRIEFING ROOM's handlers draw them:
`join_game_failure_password` (its text 20), `banned_from_game` (#443, #444) and `join_game_failure` (#441
`_441_GameFull_MSG`), each then `halt_join` and back to the room (P:L4767-4785). So GameNotFound (-977), WorldIsFull
(-948) and any new refusal draw #441 alike (R165.3). On a success the reader copies the connection info and queues
state 17 (D:L190483-190484), which the script is waiting for (P:L4629-4641).

### 2.2 The connection fields and what the client does with each

The reply's layout is Horizon's (`H:RT.Models/Lobby/MediusJoinGameResponse.cs:17-39`; `NetConnectionInfo`
`H:RT.Models/Misc/NetConnectionInfo.cs:12-31`; `NetAddress` `H:RT.Models/Misc/NetAddress.cs:14-23`; the widths
`H:RT.Common/Constants.cs:50-55`); the client's reader agrees with it offset for offset (D:L190440-190482). Each field
is kept in the lobby's globals and copied whole into the connect's parameters by `FUN_002f7fa0` (D:L196880-196945):

| reply offset | field | kept at | what the client does with it |
|---|---|---|---|
| +0x18 | StatusCode | -- | §2.1 |
| +0x1c | GameHostType | not read | -- (the reader starts at +0x20) |
| +0x20 | ConnectInfo.Type | `DAT_0066a8f0` (D:L190440) | picks the transport: 1, 3, 4 the client-server connect, 2 the peer-to-peer one, any other an error 0x17 (`FUN_00617690` D:L524716-524729); 1 and 4 are TCP alone, 3 TCP with an auxiliary UDP channel (`FUN_00617788` D:L524843-524851) |
| +0x24 | AddressList[0]: type, address (16), port | `DAT_0066a8f4`.. (D:L190444-190449) | the address string and its port are what the connect dials (D:L524852-524853) |
| +0x3c | AddressList[1] | `DAT_0066a90c`.. (D:L190450-190455) | when its type is 3 (NAT service) the library runs a NAT step with it before connecting (D:L524810-524826) |
| +0x54 | WorldID (the game server's world) | `DAT_0066a924` (D:L190456) | the connect's world (D:L524854) |
| +0x58 | ServerKey (RSA, 64 bytes) | `DAT_0066a928` (D:L190457-190464) | handed to the connect (D:L524855) |
| +0x98 | SessionKey (17) | `DAT_0066a968` (D:L190465-190473) | appended to the connect with the access key, when both are non-empty (D:L524830-524837) |
| +0xa9 | AccessKey (17) | `DAT_0066a979` (D:L190474-190482) | as above |

These globals have no other online writer (the LAN path writes type 2, an External address of its own and world id 1:
D:L204185-204190, D:L204325-204331). The WorldID is the game server's, not Medius', and the two differ in both logs:
in cross1 the JoinGame's MediusWorldID is 2 and the answer's WorldID and the connect's world are 1 (lines 644, 656,
666); in cross2 the create's answer and the JoinGame carry MediusWorldID 3 and the answer's WorldID and the connect's
world are 2 (lines 252, 254, 266, 274).

### 2.3 What Horizon puts in it

`H:Server.Medius/Medius/MPS.cs:222-270`: on the DME's refusal a MediusFail; on its success GameHostType the game's,
type ClientServerTCPAuxUDP (3), the first address the DME's external address and port, the second the NAT service's,
WorldID the DME's world, ServerKey the DME's key (which its DME leaves empty: the answers in both cross logs carry a
zero key), the account's session key, and the DME's access key. The DME mints the access key at the seat: 12 random
bytes in base64, 16 characters (`H:Server.Dme/Models/ClientObject.cs:169-172`), and answers a repeat join of the same
session key with the same seat and key (`H:Server.Dme/Models/World.cs:397-409`). The logs' answers have this form.

### 2.4 What the page receives today

`{ status, gameHostType, mediusWorldId }` (`packages/server/src/lobby.ts` `JoinGameReply`): no connection info -- the
page reaches its game over the match server's own socket on the page's origin (research 154 §6, 159 §4; ui
`gameLobbyCommands.ts` `GAME_JOIN_NO_DME_ADAPTATION`).

## 3. The connect, to the game lobby's first frame

### 3.1 `ConnectToGameServer`: the connect

`ConnectToGameServer` (`FUN_0027e4c0` D:L126456-126477) first rebuilds the game object: `FUN_002a9f00`
(D:L150857-150862) calls its builder `FUN_002a76d0` (research 179), which re-reads the lobby's list variables
`BSEALLISTVAR`..`BCHATLISTVAR` (S:0x3f1040-0x3f1080, D:L149528-149539) -- the port reads it as the chat list's reset
(`packages/ui/src/screens/gameLobbyCommands.ts`, `ConnectToGameServer`) -- and, among its other writes, sets the
`late_joiner` valve to 0 (S:0x3f10f8, D:L149565-149571; research 315 W1). Then `FUN_002b85c0` (D:L158908-158935) clears
the 24 pending-join slots and calls `FUN_0030d380` (D:L209929-209980), which builds the connect's 0x128-byte
parameters, and **only when that connect succeeds** sets the local team word with `FUN_002c3330(0)` (D:L158930-158933):
0, unless the byte `DAT_00437dd4` is 1 or 2, when it sets a fixed side's word instead (D:L164822-164834) -- a byte no
named writer in the decompilation sets. The parameters:

1. the library's defaults (`FUN_00621778`, D:L209945), then the whole connection info at +8 (`FUN_002f7fa0`,
   D:L209946);
2. the voice channel's two formats (`FUN_0030fc70`, D:L209947; research 170 §6.1);
3. the two callbacks, a client's join request `FUN_002bc620` and a client's leave `FUN_002bc530` (D:L209948-209949);
4. a flags word the host reads as the join request's (research 308 §3.2's masks): online, mask 2 when the game has a
   clan id equal to the client's own (`FUN_002e9b30`, `FUN_002e9820`, D:L209950-209956); on LAN the password's hash
   instead (D:L209957-209965); mask 1 when `FUN_002f6d00` answers true, the same test as the join type's (§1.1:
   `JoinAsSpectator`, or `DAT_004413d8`) (D:L209966-209969);
5. the connect (`FUN_00621810` D:L209970 -> `FUN_00617690` D:L524697-524739), whose status and session handle it keeps
   (D:L209971-209979).

The client-server connect (`FUN_00617788`, D:L524744-524973) dials the first address and port, with the world id, the
key, and the session and access keys appended (§2.2), and a 15 000 handed to the library's RT connect (D:L524856; its
role not read). With no connect callback set in its parameters it then waits on the connection's state: connected
answers 0, a failure or **30 000 ms** without an answer answers 3 (D:L524919-524948). `ConnectToGameServer` answers 1
on success; on failure it queues state 11, clears the record and answers 0 (D:L126463-126468), and the script pops
#425 `_425_MpConnFailure_MSG` (P:L4653-4661).

### 3.2 On the wire (our Horizon's DME)

In each log the r0001 client opens a TCP connection to the address it was answered and sends
`RT_MSG_CLIENT_CONNECT_TCP_AUX_UDP` carrying the world id the answer named (its first field), the application id
10472 (0x28e8), a zero key, the session key and the access key (cross2 line 274, cross1 line 666;
`H:RT.Models/RT/RT_MSG_CLIENT_CONNECT_TCP_AUX_UDP.cs:17-45`). Horizon's DME finds the seat by the access key and
refuses the connection unless that seat's world is the one presented (`H:Server.Dme/TcpServer.cs:337-342`), then
answers `CONNECT_ACCEPT_TCP` (the client's index and the world's client count) and the auxiliary UDP address
(`H:Server.Dme/TcpServer.cs:371-382`); the client answers `CONNECT_READY_AUX_UDP` and the DME `CONNECT_COMPLETE`
(cross2 lines 276-282). The DME tells the lobby server (`MediusServerConnectNotification`, cross1 lines 676-678) and
the clients already in the world (`SERVER_CONNECT_NOTIFY`, line 680). No key exchange runs on this connection in
either log. Whether Sony's DME checked the same pair is not observable (§7).

### 3.3 `CheckJoinMP`, `JoinGameServer` and the host's admission

`CheckJoinMP` (`FUN_0027e2b0`, D:L126379-126404) writes `mp_join_game` 10 when two of the library's reads over the
session both answer 1 (`FUN_0030d510`, `FUN_0030cdd0`; D:L126387-126402); what they count is not decoded (research 159
§8's `ABANDON_BELOW_PLAYERS_READING` row on the same `FUN_0030d510`).

`JoinGameServer` (`FUN_0027e380`, D:L126409-126428), outside a late join (game `+0xcc`, the `late_joiner` setting,
research 206 §1), runs `FUN_002b83e0` (D:L158829-158890): it joins the DME session (`FUN_0030d060`,
D:L209796-209830, with the account's name cut to 11 characters -- a 12-byte bounded copy of `DAT_0066a4f4`, the
login's name, its last byte cleared, D:L209817-209819), takes the session master's role when its own client index
equals the session's master index (D:L158860-158879; research 159 §2) and, as master, replays the pending join
requests (D:L158865-158875). It then answers 0 while the console is neither the master nor holding a side (the local
team word `DAT_00441470` still 0, D:L126419-126421). The word is 0 from the connect until the host's signal sets it --
except when `DAT_00437dd4` is 1 or 2 (§3.1), when the connect itself set a fixed side's word and `JoinGameServer` does
not wait on the host for it.

The side comes from the host. On the session master the library calls `FUN_002bc620` (D:L161151-161498; its last
Game Signal send at D:L161492) with the
joiner's request (its client index and its flags word); a console that is not master keeps it in the pending slots
(D:L161236-161245). The master admits by the clan rule, the players' count against `MaxPlayersValve`, the sides' eight
and the spectators against `MaxSpectatorsValve`, and answers the joiner alone with a Game Signal (`FUN_0030cef0`, 0x14
bytes): a side (1 SEALs, 2 Terrorists, 3 a spectator), a slot and the clock -- or side 4 with a reason (research 308
§3.2, §4; 314 R314.4). The joiner's reader `FUN_002b9150` sets its team word from the side (D:L159263-159279) or, on
side 4, posts MP_EJECT_SPECTATOR (S:0x3f2530) with the reason's text (D:L159206-159230): `spectator_rejected`,
`DisconnectFromGameServer`, #527 `_527_SpectRejected_MSG`, the text in a popup, the BRIEFING ROOM (P:L4786-4795).

`do_join` calls `JoinGameServer` once: 1, then `WAIT 2` and `SWITCHMENU(dlgGameLobby.rdr)` -- **the game lobby's first
frame**; 0, `DisconnectFromGameServer` and #427 `_427_ServerFailureJoining_MSG` (P:L4686-4698).

In the same-revision log (`dme_probe7.txt`) the host and the joiner exchange single records after the connect notice:
class-0 id 0x18 both ways (the peers' addresses, research 193 §2.1; desktop research 18 reads the receiver validating
them, `desktop@be5578311:docs/research/18-online-round-start.md:221-226`), then 0x16 from the host and 0x15 from the
joiner (UpdateClientStatus, ArbitrateJoin), then the joiner's ClientUpdate (0x0f, its name) and its first objects
(0x04) (lines 68-102). Which of these records carries `FUN_002bc620`'s request and the Game Signal is not decoded here.

### 3.4 The waits and the errors, in order

| step | bound | on failure | where |
|---|---|---|---|
| JOIN GAME pressed | `monitor_timeout` starts: `WAIT 30` | #440 `_440_TimeoutFailure_MSG`, `abort_join` | P:L4614, P:L4708-4714 |
| JoinMPGame, JoinGame sent, its answer | inside the 30 s; `JoinMPGame` asked again each second in state 11 | the room's handlers (§2.1); #526 when a retry fails | P:L4618-4641 |
| `mp_join_game` 9, `WAIT 1`, `ConnectToGameServer` | inside the 30 s; the library's own 30 000 ms | #425 | P:L4642-4661; D:L524919-524948 |
| connected: `WAIT 5`, a sequence stopped, `join_after_a_while` started | 33.333 s | `do_join` runs anyway | P:L4645-4647, P:L4682-4685 |
| `CheckJoinMP` until `mp_join_game` leaves 9 | the 33.3 s | -- | P:L4648-4652 |
| `do_join`: `JoinGameServer` once | -- | #427 | P:L4686-4698 |
| the host's Game Signal side 4 | -- | #527 and the reason | P:L4786-4795 |

AUTOPLAY's `join_game` (`dlgWorldOfSOCOM.rdr`) runs the same steps without the captions (P:L3689-3743); CREATE GAME's
`create_game` runs them without `CheckJoinMP` (R165.10). Which sequence the `STOP_SEQUENCE` after `WAIT 5` stops is the
script engine's to say; research 165 R165.1 reads the two bounds as above.

### 3.5 The s4 slice and PROVE-1

`logs/parity/s4_pcsx2/slice-Medius.log` begins inside a running game: echoes, then the host's WorldReport0 (line 14,
WorldStaging, then WorldActive), the PlayerReports and the stats posts; no JoinGame, no answer, no connect.
`slice-DME.log` begins with echoes and then the match's own records (line 18 on). PROVE-1 (research 267) scores the
results' posts from the Medius slice only. Nothing of this note's path is in either.

### 3.6 What the port does in its place today

The page opens `pinnedMatchSocket` -- `wss://<the page's origin>/ws` (`packages/viewer/src/connectHost.ts`
`matchSocketUrl`) -- and says hello with `game` (the mediusWorldId) and `ticket` (the login's bearer)
(`packages/viewer/src/net/protocol.ts`, the hello's `game` and `ticket`). The server waits 10 s for the hello
(`HELLO_MS`, `packages/server/src/server.ts`), refuses with `refused` then 4003 (`not logged in`, `no such game`,
`no seat in that game`, `the game has no room yet`; `bridge.ts`), and otherwise seats the account -- the side by the
room and the game lobby's rules (the host's half of §3.3) -- and answers `welcome` and the first `gameLobby`, which
the page takes as `CheckJoinMP` and `JoinGameServer` passing (`GAME_JOIN_NO_DME_ADAPTATION`).

## 4. The mapping: each original field, and what our answer carries

| original field | role on the console | today | after the split (SA-6) |
|---|---|---|---|
| request MessageID | pairs the answer | HTTP's pairing | not carried: HTTP pairs |
| request SessionKey | the lobby session | the bearer on `/lobby/*` | the bearer, on central's origin only (SA.R5) |
| request MediusWorldID | the game | `mediusWorldId` | the same |
| request JoinType | player or watcher | `joinType` | the same; and into the game token as the seat's join type |
| request GamePassword | the password of that type | `gamePassword` | the same |
| request GameHostType, pubKey, AddressList | zero (§1.1) | not sent | not carried: SOCOM II sends nothing in them |
| answer StatusCode | §2.1 | `status` | the same codes; a new refusal (a game whose host is gone, say GameNotFound -977) draws #441 as every code but -978 and -972 does |
| answer GameHostType | unread by the client | `gameHostType` (the game's create value) | may stay, unread (`JOIN_ANSWER_HOST_TYPE_READING`) |
| ConnectInfo.Type | picks the transport | -- | not carried: one transport, a WebSocket over TLS (an adaptation) |
| AddressList[0] address and port | dialled | the page's own origin, `/ws` | **the door**: `wss://<host>/g/<gameId>`, the host's door (SA.R15) |
| AddressList[1] (NAT service) | a NAT step | -- | not carried: the browser has no NAT step; the door is inbound TLS or a tunnel (SA.R15) |
| ConnectInfo.WorldID | the connect's world, checked against the seat | the hello's `game` (= mediusWorldId) | the game's id, in the door's path and in the token: one id where the original had two |
| ConnectInfo.ServerKey | the connect's key | -- | not carried: TLS takes its place |
| ConnectInfo.SessionKey | appended to the connect | the hello's `ticket` (the login's bearer) | **the game token** (SA.R12): the login bearer never reaches a host |
| ConnectInfo.AccessKey | appended to the connect; the game server seats by it | -- | **the game token**: per join, per player, minted on the lobby's side, checked on the game's |
| the connect's flags: mask 1 (a watch: `JoinAsSpectator`, or the unread byte of `WATCH_BYTE_4413D8_PLACEHOLDER`) | read by the host | the seat's join type, from the room service | in the token (the join type) |
| the connect's flags: mask 2 (a clan member) | the joiner's own claim, read by the host | the account's clan in the server's store at the seat (`CLAN_SIDE_MEMBERSHIP_READING`) | in the token (SA.R12's clan facts): frozen at the join, as the console's claim was at its connect |
| the DME session's name (11 characters) | the joiner's name to the other consoles | the account's name, whole | the account's name in the token (`DME_SESSION_NAME_CUT_READING`) |
| the host's Game Signal: side, slot, clock; or a refusal | the second admission | the match server at the hello (`gameLobby`, `refused`) | the match server at the hello: **the side is the host's to decide, not the token's** (§6) |

### 4.1 What the player sees from these fields

Nothing of the answer's connection info is drawn. The game list's row is the list entry's (research 154 R154.8): its
PING column reads GenericField2 (<300, <600, else the red dot, D:L184438-184452), and the host's world report sends
`DAT_0066a838` there (`FUN_002ef590` D:L191395), which the lobby's init sets to 65000 (`FUN_002e0030` D:L182645) and no
other line of the decompilation writes -- so a SOCOM II host reports 65000 and the row draws the red dot, as B_43 shows
(research 154 §7's s4 game). What the original's server did with GenericField2 is not read. No host name: neither the
list entry nor the join's answer carries one (research 159 §2). So SA-6's answer feeds no drawn field; the PING column
stays the world report's, the list central keeps.

*GAME-PING (2026-11-01; product track, a browser adaptation, Craig's "go" relayed by 5d, OWNER-WORDS):* the page draws
the game list's PING -- the in-game list (`@s2u/ui` `BriefingRoomCommands`' `gamePing`, wired by viewer
`briefingRoomHost.ts`) and the console's rooms list (viewer `console/adapters/rooms.ts`) -- from the player's own round
trip to the game's room's host door (LATER 455's probe, viewer `gamePing.ts`), banded by the original's bounds above.
That door is an approximation: central's `roomPingDoor` (`placement.ts`) names the host a NEW game in the room would be
placed on, so a listed game running on another host is measured against that host, not its own (the list carries no
per-game host, and the wire is not changed for it).
This is ours, not the original's: the wire still carries GenericField2 = 65000 and the speed filter still reads it; a
game whose door does not answer draws no ping (`--`; the in-game image column, its no-ping icon 0), never the red dot;
a game whose room has no door named (an older server, a local game) keeps the original's band.

## 5. What SA-6's answer carries

- `status`: 0, or the original's codes as today; -978 and -972 are the only ones the client tells apart, every other
  is #441 (a host gone, a placement that failed: GameNotFound or Fail).
- `mediusWorldId`: the game's id, as today.
- `gameHostType`: optional; the client never reads it (`JOIN_ANSWER_HOST_TYPE_READING`).
- **the door** `wss://<host>/g/<gameId>`: in place of AddressList[0] and the world id.
- **the game token**: in place of the session key and the access key at the connect, carrying the join type (mask 1)
  and the clan claim (mask 2) the connect carried, and the account's name; its life covers the page's connect within
  the script's 30 s (`GAME_TOKEN_LIFETIME_PLACEHOLDER`).
- **Not** the connection type, the NAT-service address or the server's RSA key; **not** a side.
- **The creator** (R343.9): its own JoinGame precedes its first world report, and SA-6 places at the report that names
  a map. The port's page already waits on the report's settled status before `ConnectToGameServer`
  (`HOST_REPORT_BEFORE_JOIN_ADAPTATION`, `packages/ui/src/screens/gameLobbyCommands.ts`), so the creator's door and token
  ride on the report's answer -- the report has no reply on the console, so this is an adaptation, and SA-6 names it.
- A watch is joined the same way (join type 1); the page's door connect is bounded by the script's own
  `monitor_timeout` and, in the transport, by `DOOR_CONNECT_WAIT_MS_READING`.

## 6. What disagrees

- **SA.R12 names "the seat's side" in the game token.** On the console the side is the host's admission after the
  connect (`FUN_002bc620`: the clan rule, the balance, the eight a side; the Game Signal's side byte), never the lobby
  server's: Medius' JoinGame carries only the join type. If SA.R12's "side" is the join type (player or watcher), it
  holds; if it is SEALs or Terrorists, the token would decide what the original's host decided at the seat. SA-6 should
  carry the join type and leave the side to the match server at the hello, as today.
- **Research 97's "the console's match is DME peer-to-peer over UDP"** (its paragraph on the three shapes) is too
  short: the client asks for host type 0, ClientServer, at the create (+0xcc, research 154 §2) and the join (D:L190374),
  and connects to the game server the lobby names over TCP with an auxiliary UDP channel (type 3 in our Horizon's
  answers; `FUN_00617788` D:L524843-524851); the peers' own UDP channel rides beside it (research 193 row 1;
  `desktop@be5578311:docs/research/18-online-round-start.md:93-95`). The note is not edited here.
- **The cross logs' walk-back is the game-version word (O1), not the patch-level token (O2)** (R4B-00,
  2026-11-04; **reading, pending review**, supported by a recomp capture). The host writes GameObject's version
  `0x47` in retail (`FUN_002c00f0`, D:L163070-163072); the peer reader `FUN_002c0850`
  (D:L163320-163326) compares its `+0x14` word and posts `MP_VERSION_NUMBER_ERROR` on a mismatch. In r0004 the
  writer loads `0x49` at `0x2c1e3c` and the reader at `0x2c2620`, with the comparison/event at
  `0x2c2638-0x2c2658`; the mode-1/2 alternatives are `0x817` / `0x819`. These native ranges were re-read in both
  `game/overlays_r0004/socom2_game_r0004.elf` and pristine `game/r0004/served/ftscore.bin`. The scripts' event
  routing is research 315 §3.6/§11: `dlgNetAbort.rdr`, disconnect, wait 3 s, SOCOM II ONLINE.
  `VerifyPatchLevel` instead checks the universe list (`FUN_002766b0` D:L122431-122451 -> `FUN_002fd6e0`
  D:L199829-199850; r0004 `0x31aaf4-0x31ab00`, token at `0x421998`): research 153 R153.7's reading stands.
  The desktop's contrary attribution (`desktop@be5578311:docs/research/43-what-changed-in-r0004.md:44`, KNOWN:29)
  is deferred to LATER 617 for its owners. In cross1 the r0001 joiner exchanged the DME join records and left
  (class-0 0x12, ClientLeaves) seven seconds later (lines 666-752; `B/lobby_fail_join_enter.png`); that archived
  recompilation supports the code reading, but is not a measurement of the original running. A controlled original
  cross-revision trace remains owed. O1/O2's port constants remain r0001 until R4B-23.
- **Two of the port's comments, small.** `JoinGameReply`'s doc (`packages/server/src/lobby.ts`) says the reply keeps,
  of the connection info, "the world id": the reply's `mediusWorldId` is the request's game id, not the ConnectInfo's
  WorldID (+0x54), which differs from it in both logs (cross1 2 and 1, cross2 3 and 2).
  `GAME_JOIN_NO_DME_ADAPTATION`'s doc cites the copy as D:L190435-190478; it is D:L190440-190482 (D:L190435-190437 is
  the failure's third event). Neither is changed here.
- **Research 159**: nothing found wrong for this path.

## 7. Placeholders and readings

None of these is in code; each row is *note only* until SA-6 or SA-7 takes it.

| name | value | what it stands for | what would settle it | status |
|---|---|---|---|---|
| `DOOR_CONNECT_WAIT_MS_READING` | 30 000 | the transport's bound on the page's door connect: the network library's own wait on the connect's state (`FUN_00617788` D:L524919-524948), inside the script's `monitor_timeout` (P:L4708-4714) | a capture of a join whose game server never answers, timed from `ConnectToGameServer` to #440 or #425 | note only (proposed, SA-6's page half) |
| `GAME_TOKEN_LIFETIME_PLACEHOLDER` | at least the script's 30 s; no figure chosen | the life of the access key's stand-in: what Sony's game server took as an access key's life is unobservable; our Horizon drops a seat that never connects after `ClientTimeoutSeconds`, 25 s from the seat's making (`H:Server.Dme/Config/AppSettings.cs:42`; `IsConnectingGracePeriod` from `TimeCreated`, then `Timedout`, `H:Server.Dme/Models/ClientObject.cs:143-144`), a reimplementation's figure; the client connects within the 30 s of `monitor_timeout` | nothing of the original (its server is gone): SA-6's choice within the bound, recorded as a policy | note only (proposed, SA-6) |
| `JOIN_ANSWER_HOST_TYPE_READING` | the game's create value (0) | the answer's GameHostType (+0x1c), which the client does not read (`FUN_002edba0` reads from +0x20, D:L190440) | none needed: carried or not, the client is blind to it | note only |
| `ORIGINAL_CONNECT_INFO_PLACEHOLDER` | our Horizon's form (§2.3) | what Sony's lobby server put in the ConnectInfo (the type, the two addresses, the keys) and what its game server checked at the connect; the client accepts types 1-4 (D:L524716-524729) | not obtainable (the original servers are gone); a retail console's packet capture from 2003-2012, if one surfaces | note only |
| `WATCH_BYTE_4413D8_PLACEHOLDER` | read as 0 on this path | the second operand of `FUN_002f6d00` (D:L196215), `DAT_004413d8`: non-zero, it makes a join a watch -- JoinGame's join type 1 and the spectators' password (D:L190376-190395) and the connect's mask 1 (D:L209966-209969) -- whatever `JoinAsSpectator` says; the decompilation shows no writer of it by name, so when (if ever) it is set is not read | a store to 0x4413d8 found by disassembly (a writer the decompiler shows only through a pointer), or a PEEK of the byte across a JOIN GAME and a WATCH GAME | note only |
| `DME_SESSION_NAME_CUT_READING` | 11 characters | the name the joiner gives the DME session: the login's name in a 12-byte bounded copy, its last byte cleared (`FUN_0030d060` D:L209817-209819), against a persona name of up to 14 (research 153's keyboard); whether the game lobby's lists draw this cut or the persona object's whole name is not read | a capture of a game lobby with a 12- to 14-character name | note only |

## 8. What would raise each reading to proven

| reading | the evidence that would make it proven |
|---|---|
| §1.1 the request's fields; §2.2 the answer's offsets as the client reads them | a dev-host test that reads the r0001 clients' JoinGame and answer lines in `s11_r0004_cross1` (line 644, 656) and `s11_r0004_cross2` (254, 266) through `tools/mediusLog.ts` (a reader for the pair added beside PROVE-1's) and compares them field by field with the transcription: a recomp capture scored, PROCESS's proven. It proves the client's side only; the answers are our Horizon's |
| §2.2-§3.2 each ConnectInfo field's use | the same test over the DME lines: the connect's world equals the answer's WorldID (1 in cross1, 2 in cross2) and **differs** from the JoinGame's MediusWorldID (2 in cross1, 3 in cross2, the create's answer at cross2 line 252), its session and access keys the answer's, the application id 0x28e8 (cross1 644/656/666, cross2 252/254/266/274, `dme_probe7.txt` 18, 56) |
| §2.1 the three refusal events and their captions | a capture of a wrong password, a ban and a full game, each frame of JoiningAnim scored against #441 / #443-#444 / the password text |
| §3.3 the host's admission and the Game Signal | ONL-32's two-console transcript of a join, with a PEEK of the joiner's `DAT_00441470` before and after the signal; for the refusals, research 308 and 314's own rows |
| §3.4 the waits | a capture of a join whose game server never answers (a DME that drops the connect), timed to #440 / #425; one whose host never answers the join request, timed to #427 |
| §4.1 the PING column's 65000 | a PEEK of `DAT_0066a838` on a hosting console, and the list row it draws |
| `DME_SESSION_NAME_CUT_READING` | above |
