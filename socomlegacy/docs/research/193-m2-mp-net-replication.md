# 193 -- M2 -- How the original replicates a MATCH between players, and where the port differs

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/M2-mp-net-replication.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V3 (`research-wave-2026-10-04/V3-verify-modes-net.md`) has landed and is folded in as §12.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

**Correction (V3): online and LAN send rates are swapped in this report; online is 100 ms (V3).** See §12; the wave's override list, which wins over this report, is research 206 §1.

**Overridden in part (research 206 §1):** follow state in field 0x74; rescue scored by "Action Points" -- the follow state is in the AI word (+0x10); rescue scoring comes from the state switch to 0x11; field 0x74 (the unit) is applied on receive (V3 #11, V5).

**Overridden in part (research 206 §1):** game +0xcc = "staging lobby" -- it is the `late_joiner` setting (R2-AV, research 205; V7 #9).

Agent M2-mp-net-replication, research wave 2026-10-04. Read-only. Scripts and outputs: `scratch/M2/` (its `README.md`
says what each prints). `D:L<n>` = line in `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001).
`$PORT` = the `agent/online` snapshot named in the brief. No decompiled text is quoted; constants, offsets and line
numbers only.

**The one-paragraph answer.** The original has no game server. Horizon's DME relays the consoles' records, and each
console owns the objects it creates. The game runs on Medius's "DME" net-object library: a game registers object
*types* (field lists, each field with a send policy) and *messages*. Each console owns and sends its objects. The DME
library throttles each field by its own interval and change test, then sends field updates (class 0 id 3) or whole
objects (id 4, also to late joiners). The game has 7 object types: Seal, Persona, Blather, Grenade, Game, Bomb and
Platform. It also has 24 application messages (class 2): Hit, Anim, Push Blend, Action Anim, Action Points, AI Orders,
E3 Index, Reject, Message, Chat, Wep PU, Wep Ammo PU, PU May I, PU OK, ClimbAsk, ClimbOK, Names, Voter, Spec Vote,
Team Switch, All Switch, Bomb, Alert and Game Signal. The voice adds 2 more: Radio and Channel Status.

Who decides what:
- Bullets: the shooter's console decides and broadcasts the damage.
- Part health, death, killer and kill/score counts: the victim's own console decides and replicates them through its
  SealObject.
- The DME session's host owns:
  - the round (GameObject),
  - the MP bomb (a state machine fed by requests),
  - team switches and ladder use,
  - every NPC, hostages included (host-created SealObjects, with clients' orders forwarded to the host).
- A new host takes all of these over.

Online, a player's position is sent only when it changes, and each axis at most every 200 ms. Health and score bytes
go every 50 ms. Remote bodies are eased toward the last value received by `exp(-50·dt)` and snap when more than about
31.6 units off. The port replaces all of this with an authoritative server at a 60 Hz tick and 30 Hz snapshots. That is
a deliberate design, and it makes most of the above DIFFERENT-BY-DESIGN. What the port lacks entirely: everything the
host arbitrates for objects other than players, meaning **hostages/NPC AI, the MP bomb, turrets, pickups, ladder
exclusivity, in-match chat/quick-chat, team switch, the spectator-eject vote**.

## 0. Matrix

Port status: IMPLEMENTED / PARTIAL / DIFFERENT-BY-DESIGN (DBD) / SOURCED-NOT-IMPLEMENTED (SNI) / UNSOURCED.
Grades as in the brief.

| # | behaviour (original) | original, in one line | grade | port | port status |
|---|---|---|---|---|---|
| 1 | Topology | consoles talk through Horizon's DME relay (TCP records + aux-UDP) plus SCE-RT peer UDP. There is no game server. Each object is owned by the console that made it. | STRONG | WebSocket to one authoritative room (`room.ts`) | DBD |
| 2 | Wire header | `[u8 class][u8 id] payload`. Class 0 is the DME library, class 2 the game (`FUN_00615660` D:L523444-523446, `FUN_006157e0` D:L523489-523491; captures `00 04`, `00 0f`, `02 19`). | PROVEN | own JSON/binary protocol (`protocol.ts` v9) | DBD |
| 3 | DME class-0 ids 0..24 | ServerVersion 0, Ping 1, PacketFragment 2, FieldUpdate 3, ObjectUpdate 4, DataStreamEnd 5, AcceptClient 9, DeleteNetObject 10, Request/Grant/ReleaseOwnership 11/12/13, DataStreamUpdate 14, ClientUpdate 15, ClientConnect 16, ClientLeaves 18, RequestServers 19, ServerResponse 20, ArbitrateJoin 21, UpdateClientStatus 22, SMMigrateOrder 23, StreamMediaClientInfo 24 | PROVEN (§2) | n/a | DBD |
| 4 | Game message ids (class 2) | 0..23 in the order of §3, then voice Radio 24 and Channel Status 25 | STRONG (order) | n/a | DBD |
| 5 | Net object types | Seal 0 (0x90 B), Persona 1 (0x4c), Blather 2 (0x1cc), Grenade 3 (0x24), Game 4 (0x5c), Bomb 5 (0x14), Platform 6 (0x1c). Type byte at record +3, owner client at +2. | PROVEN (decomp + capture) | bodies in the snapshot, the rest in events | DBD/PARTIAL |
| 6 | Field send policy | per field: interval in ms (`rt_time_get_msecs`) and a mode (1 = any change, 2 = above a threshold, 5 = a callback), table chosen by the `ComeFromLan` valve | STRONG | none (fixed 30 Hz snapshot) | DBD |
| 7 | Position rate | X/Y/Z each sent on change, at most every 100 ms (LAN) or 200 ms (online) | STRONG | 30 Hz snapshot of `feet` | DBD (port smoother) |
| 8 | Health/score/state rate | part health and score shorts every 200 ms online and 100 ms LAN; life byte, fire counter and kill fields every 50 ms online and every pass on LAN | STRONG | events + snapshot | DBD |
| 9 | Remote smoothing | snap if the squared 3-D error is above 1000 (about 31.6 units). Snap the height (+0.25) if `|dy|` > 5. Otherwise lerp toward the target by `exp(-50·dt)`, the factor recomputed only when host time changes; with no stick input, t = 1 (jump to the target). Rotation is a slerp by `min(1, 2·exp(-50·dt))`. | STRONG | 100 ms interpolation buffer (`INTERP_DELAY_MS`, `client.ts:73`) | DBD |
| 10 | Remote animation | remote body driven by the owner's replicated stick (three s8/127) through a `CRemoteCtrl` | STRONG | replicated animator state (`BodyState`) | DBD |
| 11 | Bullet hits | the shooter resolves and broadcasts `Hit` (8 B: attacker id, victim id, part, damage 0-255, piercing·20, type 4 bits + 1 flag bit). Every console applies it. | STRONG | server cone and ≤200 ms rewind (`shotCone.ts`, `MAX_REWIND_MS`) | DBD (known: port research 91 §15) |
| 12 | Part health sync | the victim's owner replicates 6 part ratios ·255 (SealState 0x82-0x87) | PROVEN (writer + reader) | server `hurt` event, `health[]`; to the seat's side and the spectators, the six bytes in the `health` event (NU-3c, 2026-10-15: research 321 §4.2.1) | DBD |
| 13 | Death | the owner's SealState: state word (0x10) bit 6, life byte 0x88 (body+0xf7a, set to 3 on the death path), killer id 0x76 and cause 0x89. Every console posts the kill line from these. | STRONG (0x76/0x89/0x10), BELIEVED (0x88 meaning) | server `kill` event | DBD |
| 14 | Kills/deaths/score | each console counts its own and replicates 6 shorts (round/match deaths, kills, score: SealState 0x68-0x72) | PROVEN (offsets = port research 91 §8) | server counts, `score` event | DBD |
| 15 | Round state | host-owned GameObject. Its state nibble is the 0x113 byte (3 = in play). It also carries the clock in seconds, the winner, friendly-fire, locked, EQ limit and swap-sides flags, and a 24-entry per-slot table. | STRONG | server `roundStart`/`roundOver`/`countdown` | IMPLEMENTED (equivalent) |
| 16 | Host | the DME session host (`FUN_0030d560` -> `FUN_00622f40`); `DAT_0045a0c0` = "I am host" | STRONG | n/a (dedicated server) | DBD |
| 17 | Host migration | the new host creates GameObject and Persona, recreates the bomb, takes AI bodies over (flag 0x20000 -> `FUN_0056f210`) and replays pending joins (`FUN_002bc080` D:L160958-161048) | STRONG | n/a: server never leaves | DBD (port strictly better) |
| 18 | Late join | each owner sends a full ObjectUpdate of every object it owns to each new client (`+0x29` flag, `FUN_0061ba10` D:L527428-527492). The joiner is a ghost until the next round. | STRONG | welcome + snapshot; classic ghost seat | IMPLEMENTED |
| 19 | Disconnect | `ClientLeaves` (0x12, captured). The leave clears the slot. Mid-game, if the valid client count minus pending joins is below 3, `dlgNetAbandoned` runs (D:L161128-161140). | STRONG (record), BELIEVED (the "<3" reading) | `left`; classic abandons when a side is empty | PARTIAL |
| 20 | Spectating | a dead player cycles through living teammates only; a spectator cycles through all players; NPCs (0x20000) excluded (`FUN_00546fa0`/`FUN_00547170`, dispatch D:L412734-412751) | STRONG (rule), BELIEVED (Harry: d-pad left/right) | Space cycles living (`SPECTATOR_PAD_PLACEHOLDER`) | PARTIAL |
| 21 | Vote to remove | `Voter` goes to the target's console, which keeps the count | STRONG (port research 91 §17) | server vote | IMPLEMENTED (server-side) |
| 22 | Spectator-eject vote | `Spec Vote` broadcast; the host decides above 0.6×players and sends `Reject` | STRONG (port research 91 §1.1) | not found | SNI |
| 23 | Team switch | `Team Switch` (4 B) goes to the host, which arbitrates; `All Switch` swaps the sides | STRONG | not found in room/protocol | SNI |
| 24 | In-match chat/quick-chat | `Chat` (team/all), `Message` (6 B broadcast), BlatherObject (460-byte quick-chat set, `_60757_ImGoingLeft_MSG`…) | STRONG (registration, capture) | no client chat event | SNI |
| 25 | Weapon/ammo pickup | `PU May I` (24 B) goes to the owner of the body; `PU OK` is broadcast, then `Wep PU` (24 B) / `Wep Ammo PU` (52 B) | STRONG (wire), BELIEVED (flow) | none | SNI |
| 26 | Ladder exclusivity | `ClimbAsk` (6 B) goes to the host; `ClimbOK` (4 B) goes to the asker's console | STRONG (wire), BELIEVED (purpose from names) | none | SNI |
| 27 | MP bomb | `Bomb` request (pos, requester, state) goes to the host. The host runs the state machine 1 ground / 2 carried / 3 planted / 4 defused (`FUN_002c1f10` D:L164008-164043); BombObject is replicated. | STRONG | only C4 on targets (`c4Plant`) | SNI |
| 28 | Hostages / NPC AI | host-created SealObjects (`FUN_002b7a90` D:L158514-158556). A client's order 4/5 on a remote AI goes to the host as `AI Orders`. The host applies it (`FUN_00590ac0`) and replicates the result. | STRONG | none (`hostage` 0 hits) | SNI |
| 29 | Grenades | the thrower owns a KProjectileObject. Other consoles fire their own projectile from it (`FUN_005bd030`) and are corrected when pos is off by more than 5.0 or the second vec3 by more than 0.1. | STRONG | server flies it, `grenade` event | DBD |
| 30 | Turrets | PlatformState "TurretObject" (two f32 at 0.05 threshold, 4 shorts) | PROVEN (capture: 4 on MP51) | none | SNI |
| 31 | Doors / action points | `Action Anim` (10 B) broadcast; the host awards an action point once (`Action Points`, 4 B) | BELIEVED (doors = action points) | server `DoorSet` in snapshot | DBD |
| 32 | Clock | SCE-RT 1 Hz clock-sync ping (research 18 §3.1). Host time is at `CZNetwork+0x100`. GameState carries the clock in seconds. | STRONG | `ping`/`pong` + tick | IMPLEMENTED (equivalent) |
| 33 | Net tick | receive pump in a thread every HSYNC/20 s = 50 ms, or 1 s while the poll reports an error (`FUN_002ce930` D:L171841-171859); send pass once per game frame | STRONG | 60 Hz server loop | DBD |
| 34 | Join admission | the host answers a joiner with `Game Signal` (20 B) codes: too many players/spectators, closed clan… (D:L161282-161492) | STRONG | lobby/room refusals | PARTIAL (other agents) |
| 35 | Idle kick | none in the original | STRONG (port research 91 §17.2) | 4 min (owner ruling W3.R13) | DBD (ruled) |
| 36 | Reliability flag | online fields with flag 0x40 or 0x50 map to rt flags 4 / 4\|2 (`FUN_0061d478`). LAN fields and positions carry 0. Full objects always go with 0x50. | STRONG (code), BELIEVED (what rt 2/4 mean) | WebSocket (all reliable) | DBD |
| 37 | Bandwidth setting | `FUN_00623330(0x2000,0x8000)` online, `(0x8000,0x8000)` LAN | PROVEN (values), UNRESOLVED (units/consumer) | none | UNSOURCED meaning |
| 38 | `NetTickSleepTime` (Harry r0004 0x475afc) | an r0001 candidate is `DAT_0044d698` = HSYNC/20, set at D:L171848 | BELIEVED (address match) | n/a | -- |

## 1. Sources and method

- The decomp (r0001) and the r0001 ELF read directly (`scratch/M2/elfread.py`, `disasm.py`, `scan_refs.py`).
- Harry62's `user_labels.csv`, moved to r0001 with `match_r0001_r0004.csv` (`map_net_labels.py` -> `net_labels_r0001.txt`).
  His data labels named the r0001 variables by slot. His 21 `var_PacketType*` words at r0004 0x686248.. sit at r0001
  0x686a08.., a constant 0x7c0 apart.
- The Horizon server source: `research/horizon-server/RT.Common/Types.cs:513-537` names the message classes and seven
  class-0 ids. It relays application records unread; nothing in it is SOCOM-specific (grep: no hit for `socom`).
- Three existing DME captures: `logs/parity/s4_pcsx2/slice-DME.log` (two PCSX2 consoles, MP51 Vigilance) and
  `logs/parity/s11_r0004_cross{1,2}/server-side.log` (a join and its walk-back), decoded by `dme_app_records.py` and
  `net_schema.py`. Research 18 §3 (the SCE-RT peer layer, desktop) and KNOWN rows 63-64 (the DME TCP profile).
- reCOM `zNetwork/znet.h` and `zNetGame.cpp` (SOCOM 1): used only where SOCOM II agrees. One case: `m_pos_smooth = 50.0f`,
  matched by r0001 below.

There is no packet capture of the aux-UDP or peer channel's content on record. KNOWN row 166 says the
`PS2X_SOCOM2_NET_TRACE_ALL` capture was "never run". So every rate below is read from code, not measured.

## 2. The DME layer (class 0): the object library

### 2.1 Message registration and ids
`FUN_0061fbc8` (D:L530340-530364) registers 25 class-0 slots with `FUN_00624418(&idVar, 0, handler)`. The ids are given
in registration order per class: `FUN_0063c8a0` D:L552209-552218 writes the class's count to `*out`, then increments it.
`msg_table.py` rebuilds the table. Three independent lines agree on every id that can be checked:

1. Harry's 21 names by slot.
2. Harry's handler labels: AcceptClientPacketHandler = `FUN_0061e128` (id 9), "DeleteNetObject Receive" =
   `FUN_0061e6a8` (id 10), ClientConnectsPacketHandler = `FUN_0061dc90` (id 16), ArbitrateJoinPacketHandler = r0001
   0x61f410 (id 21).
3. Horizon's `MediusDmeMessageIds`: ServerVersion 0, Ping 1, PacketFragment 2, ClientConnects 0x10,
   RequestServers 0x13, ServerResponse 0x14 and UpdateClientStatus 0x16, all equal.

The captures then use exactly these ids: 0x04 records carry object class names, 0x0f carries persona names, 0x18 carries
peer IP:port pairs (a private LAN address, masked on import), and 0x12 comes once at the end of the cross runs, when the joiner walked
back. **PROVEN.**

### 2.2 Object types and fields
- `FUN_00620e98(&typeIdx, name, size)` -> `FUN_00624180` (D:L533173-533226) registers a type. There are at most 16 types,
  0x228 bytes each.
- Before it, `FUN_00620db0(&fieldId, offset, elemSize, type, count, policy16)` -> `FUN_00623f30` (D:L533057-533126) adds
  fields. The limits: at most 0x40 fields a type and 0x400 in all, and an object's serialized size must stay below
  0x1db bytes.
- Each field record is 0x20 bytes: +0 offset, +4 element size, +8 count, +0xc type, +0x10 interval (ms), +0x14 mode,
  +0x18 threshold (float) or callback, +0x1c flag byte.
- The change test `FUN_0061acf0` (D:L526926-527141) switches on the type: 0 s8, 1 u8, 2 s16, 3 u16, 4 s32, 5 u32,
  6 f32, 7 f64, 8-11 integer vectors, 12/13 f32 vec2/vec3 distance, 14/15 f64 vectors.
  - Mode 1 means any change.
  - Any other mode compares against the +0x18 threshold.
  - `FUN_0061b2a0` (D:L527174-527183) calls the +0x18 callback only for mode 5.

The registration order, read from `FUN_002b8660` D:L159026-159032 and confirmed by the type byte at record +3 in the
captures (Seal 0, Persona 1, Blather 2, Game 4, Platform 6 all seen), with the size and first decomp line of each:

| idx | type name (ELF) | instance name | size | registered at |
|---|---|---|---|---|
| 0 | SealState | SealObject | 0x90 | `FUN_002bf2c0` D:L162638-162712 |
| 1 | PersonaState | PersonaObject | 0x4c | `FUN_002c5a10` D:L166429-166453 |
| 2 | BlatherState | BlatherObject | 0x1cc | `FUN_002c2b20` D:L164379-164381 |
| 3 | GrenadeState | KProjectileObject | 0x24 | `FUN_002c1850` D:L163786-163794 |
| 4 | GameState | GameObject | 0x5c | `FUN_002c1120` D:L163563-163593 |
| 5 | BombState | BombObject | 0x14 | `FUN_002c26e0` D:L164253-164261 |
| 6 | PlatformState | TurretObject | 0x1c | `FUN_002c7f30` D:L168079-168091 |

The game has **no HostageState, no DoorState and no AI-state type.** Hostages and other NPCs are SealObjects (§8).

### 2.3 The send policies (the rates)
- Each field's policy is one of 18 16-byte records at 0x440ce0-0x440df0. They are built by the static initializer at
  0x400400 (`disasm_400400.txt`) through `FUN_0030e3f0` and `FUN_0030e3d0`. Both store `{ms, mode, float-or-callback,
  flag}`.
- The selectors `FUN_002bd020`..`FUN_002bd1e0` (D:L161500-161650) return the LAN record when the valve `ComeFromLan`
  (0x3f6328, `FUN_003045b0` D:L204495) is 0, and the ONLINE record otherwise. This report reads valve ≠ 0 as online.
  That direction is BELIEVED from the naming and from the online records being the slower ones. The full per-field list
  is in `net_schema.txt`.
- Sending:
  - `FUN_0061a488` (D:L526642-526706) puts a field on the wire when its mode is not 0, the field's
    `lastSent + interval < now`, and the change test passes. The field goes out as `[u8 fieldIndex][bytes]` and its
    flag is ORed into the record's send flags.
  - The clock is `DAT_00676698`, advanced from `rt_time_get_msecs` (`FUN_0061bee8` D:L527618-527619;
    `FUN_0063cf38` named `rt_time_get_msecs` at 0.95).
  - An incremental record is `FieldUpdate` (class 0 id 3, `FUN_0061a6d8` D:L526711-526752).
  - A whole object is `ObjectUpdate` (id 4) with flags 0x50 (`FUN_0061a800` D:L526875-526880).
  - The captures show that an ObjectUpdate carries the fields in registration order, packed. §4.1 checks this byte for
    byte.

The rates that matter for play:

| what | LAN | ONLINE | source |
|---|---|---|---|
| Seal X, Y, Z (f32 each, separate fields) | ≥100 ms, any change | ≥200 ms, any change | policy 0xcf0/0xd70 |
| Seal heading u16 (0x64), stick s8 ×3, pose bytes | ≥100 ms | ≥200 ms | 0xd10/0xd90 |
| Seal part health ×6, weapon, state word | ≥100 ms | ≥200 ms, flag 0x40 | 0xd10/0xda0 |
| Seal score shorts, killer id, cause | every pass | ≥50 ms | 0xd20/0xdb0 |
| Seal life byte (0x88), fire counter (0x8b), loadout | every pass | ≥50 ms, flag 0x50 | 0xd20/0xdc0 |
| GameState (most fields) | every pass | ≥50 ms, flag 0x50 | 0xd20/0xdc0 |
| Grenade / Bomb position (vec3 distance > 5.0) | ≥50 ms | ≥100 ms | 0xd30/0xdd0 |
| Grenade second vec3 (distance > 0.1) | ≥50 ms | ≥100 ms | 0xd40/0xde0 |
| Turret two floats (> 0.05) | ≥50 ms | ≥100 ms | 0xd00/0xd80 |

Notes on the policies:
- The position policy is `{100 or 200, mode 2, FUN_002bd270, 0}`. Mode 2 is a threshold compare, so the 4-byte
  callback pointer is read as a float threshold of about 4e-39. Position is therefore sent on any change, and
  `FUN_002bd270`, a "|Δ| > 4.0" test (D:L161677-161712) whose only references are these two policy records, is never
  called. (`scan_refs.py 2bd270 2bd274` finds only 0x40043c and 0x400538.) This is STRONG as a code read. That the
  authors meant mode 5 is an inference.
- The 48-byte loadout field (0x441100) is registered twice (D:L162708-162710) and is serialized twice. The capture shows
  both copies (`net_schema.txt`, 0 trailing bytes).
- `FUN_00623330` sets two limits, 0x2000/0x8000 online and 0x8000/0x8000 on LAN (D:L210323-210329). They are stored at
  `DAT_006511c4`/`c8` (`FUN_00614290`). The consumer was not traced, so the units are UNRESOLVED.

### 2.4 Ownership, late join, the pump
- Ownership:
  - `FUN_0061ba10` (D:L527428-527492) sends an object if its owner (+4) is the local client, or if the owner is -1 and
    +8 is the local client.
  - Creation passes a mode: `FUN_0030d670(net,&id,1,mode,...)`. Players' seals, grenades, the GameObject and the bomb
    use mode 2 (owned). NPC seals use mode 3 (`FUN_002bdda0` D:L162091-162104, seal +0xfc8 = -1).
  - That mode 3 gives owner -1 with the creator at +8 is BELIEVED.
- Late join, in the same function: for each client whose +0x29 byte is 1 (newly accepted), the owner sends a full
  `ObjectUpdate` to that client alone, then clears the byte. **STRONG.**
- Object refresh: if the object's full-refresh period (+0x28/+0x2c) has run out, it is re-broadcast whole.
- The pump:
  - `FUN_0061bee8` (D:L527595-527681) sends.
  - The receive pump `FUN_0061beb8` runs on a thread, `FUN_002ce930` (D:L171841-171859), that sleeps
    `DAT_0049e2d4/20` HSYNC ticks between passes. `DAT_0049e2d4` is HSYNC per second (`FUN_0034f130` D:L249232-249244;
    NTSC 0x4675d900 = 15734.25 at D:L305383). After a poll that returns non-zero it sleeps one full second.
  - The send pass comes from `CZNetwork::Update` (`FUN_0030da00`, called each app tick by `FUN_002ce9e0`
    D:L171875). On LAN it calls the DME update directly; online it calls `FUN_003006d0`, not traced.
  - Harry's `NetTickSleepTime` (r0004 0x475afc) matches this `DAT_0044d698` by role; the address was not confirmed
    (BELIEVED).
- Fragmentation: a message of 0x1ff bytes or more is fragmented (`PacketFragment`, 0x1ea bytes a piece) and forced to
  flags 0x50 (`FUN_006158f8` D:L523535-523551).

## 3. The game's messages (class 2)

`FUN_002b8660` (D:L159024-159162) registers them through `FUN_0030cff0` -> `FUN_006210d0` -> `FUN_00624440`
(class 2, D:L533294-533298). Each has a name string. The field declarations around each registration (`FUN_00620bd8`,
`FUN_00620c60`) document the layout, but they compile to no-ops (`FUN_00623ef8`/`FUN_00623f00` return 0,
D:L533022-533035). The sizes below are the length arguments of the send sites (`msg_table.py`, "send sites").
The send call is `FUN_0030cef0(net, flags=0x40, conn, target, id, len, data, now)`. Target -1 is a broadcast; `now` = 0
queues the message for the CZNetwork flush, 1 sends it at once.

| id | name | handler | len | goes to | what it carries / does (citation) |
|---|---|---|---|---|---|
| 0 | Hit | `FUN_002bbbd0` | 8 | all | u16 attacker, u16 victim, u8 part, u8 damage 0-255, u8 piercing·20, u8 low 4 bits type + bit 4 flag. Sent by `FUN_002bbda0` (D:L160860-160890, clamps via `FUN_002bd220` with tables at 0x3de728: 0..255, 0..255, 0..15). Applied by `FUN_005a1b80`/`FUN_005a1b70` only while game state 0x113 = 3 (D:L160819-160850). |
| 1 | Anim | `FUN_002bb7f0` | var | all | D:L160698 |
| 2 | Push Blend | `FUN_002bba80` | 8 | all | u16 actor, u16 anim, u16, u8, u8 -> `FUN_005880e0` (D:L160760-160797) |
| 3 | Action Anim | `FUN_002bb310` | 10 | all or one | u16 actor, u16 action point, u16 anim&0xff, u16, u16 flag (D:L160600-160645) |
| 4 | Action Points | `FUN_002bb770` | 4 | all | the host awards an action point once (`FUN_00545530`, +0x3f bit 1) (D:L160561, 160656-160671) |
| 5 | AI Orders | `FUN_002bb8e0` | 8 | **host** | u16 issuer, u16 AI, u8 order, u8 x, u8 z (order 4) -> `FUN_00590ac0` on the host (D:L160705-160750) |
| 6 | E3 Index | `FUN_002baf30` | 8 | one | D:L160318 |
| 7 | Reject | `FUN_002b9d80` | 4 | all | the spectator eject (port research 91 §1.1) |
| 8 | Message | `FUN_002bac40` | 6 | all | D:L160248 |
| 9 | Chat | `FUN_002ba9d0` | var | one/all | D:L160109 |
| 10 | Wep PU | `FUN_002ba4e0` | 24 | all | D:L160052 |
| 11 | Wep Ammo PU | `FUN_002ba370` | 52 | all | D:L159972 |
| 12 | PU May I | `FUN_002ba260` | 24 | the body's owner (+0xfc8) | D:L159862-159893 |
| 13 | PU OK | `FUN_002ba1a0` | 8 | all | D:L159835 |
| 14 | ClimbAsk | `FUN_002b9f10` | 6 | **host** | D:L159720-159736 |
| 15 | ClimbOK | `FUN_002b9e20` | 4 | the seal's owner | D:L159676 |
| 16 | Names | `FUN_002b9b20` | var | one, now | D:L159538 |
| 17 | Voter | `FUN_002ba040` | 4 | the target's owner | port research 91 §17 |
| 18 | Spec Vote | `FUN_002b9bd0` | 4 | all, now | port research 91 §1.1 |
| 19 | Team Switch | `FUN_002bae70` | 4 | **host** | `FUN_002badd0` D:L160262-160280 |
| 20 | All Switch | `FUN_002badc0` | 4 | -- | `FUN_002bada0` |
| 21 | Bomb | `FUN_002b9a00` | 16 | **host** | f32 x,y,z, u16 requester, u8 state (`FUN_002b9910` D:L159447-159497) |
| 22 | Alert | `FUN_002b98b0` | 12 | all | {1, votes before, votes after} (port research 91 §17) |
| 23 | Game Signal | `FUN_002b9150` | 20 | one | the host's join answers (D:L161282-161492, inside `FUN_002bc620`) |
| 24 | Radio (voice) | `0x30e8e0` | 3 | one | D:L211066-211253 |
| 25 | Channel Status (voice) | `0x30eb70` | 24 | all | D:L210887 |

**Ids, cross-checked:**
- Ids are given in registration order (§2.1). The game's 24 come first, at D:L159040-159161.
- The capture `s4_pcsx2/slice-DME.log:18` holds one class-2 record, `02 19`: id 25, 24 bytes, a broadcast. That matches
  Channel Status, the 26th registration (len 0x18, target -1, D:L210887).
- So the game's 24 take 0-23 and the voice's two take 24-25. CZNetwork's own two class-2 registrations
  (`FUN_0030cb90`, D:L209617/209637) would shift every id by 2 if they came first, and the capture rules that out for
  this session.
- STRONG for the order; the 0-23 ids rest on that one capture.

Harry's r0004 list (`PacketTypeHit`..`PacketTypeGameSignal` at 0x47598c, 17 names, 4 bytes apart) names a subset of
these same variables (Hit, ActionAnim, PushBlendAnim, ZAnim=Anim, AiOrders, …, NewBombState=Bomb, GameSignal). Two of
his names, `Ready` and `ChatText`, have no r0001 string of that spelling. Ready is not in the r0001 list at all and is
UNRESOLVED; his ChatText = r0001 "Chat".

## 4. What each object carries

### 4.1 SealObject (players and NPCs), 0x90 bytes, 188 on the wire
The writer is `FUN_002bd640` (D:L161921-162073) and the reader `FUN_002be150` (D:L162249-162460).

| off | wire order | content (writer source -> reader action) | grade |
|---|---|---|---|
| 0x00/04/08 | 1-3 | position body+0x1c/20/24 (f32) -> remote controller target +0x1fc..0x204 | PROVEN |
| 0x64 | 4 | heading = atan2·10430.06 (u16, 65536 per turn) -> ×9.58767e-05 into a rotation at ctrl+0x210 | PROVEN |
| 0x68-0x72 | 5-10 | round deaths +0x59e, round kills +0x598, round score +0x5c8, match deaths +0x556, match kills +0x550, match score +0x580 -> written back raw | PROVEN (offsets equal port research 91 §8) |
| 0x7a/7b/7c | 11-13 | controller axes +8/+0x10/+0xc ·127 (s8) -> ctrl vtable+0x20(axis 0/2/1) | STRONG (stick) |
| 0x7e | 14 | body+0xf74 & 0xef (`FUN_005e0010`) -> `FUN_005dfe30` | BELIEVED (pose bits) |
| 0x7f/0x80 | 15-16 | body+0x374/+0x375 -> same | PROVEN (copy), meaning unread |
| 0x81 | 17 | ctrl+0x170 bit 2 | -- |
| 0x82-0x87 | 18-23 | 6 part health ratios ·255 -> `FUN_005a5790(part 0,3,5,4,2,1)` | PROVEN |
| 0x88 | 24 | body+0xf7a -> `FUN_00544210`. 0xf7a is set to 3 on the death/spectate path (D:L412701-412703). | BELIEVED (life state) |
| 0x76 | 25 | killer id body+0xfbc -> `FUN_00547aa0` (kill line) | STRONG |
| 0x89 | 26 | cause body+0xfc0 clamped (0x3de788) -> `FUN_00547a90` | STRONG |
| 0x8a | 27 | inventory byte (`FUN_005c3790`) -> `FUN_005c37b0` | BELIEVED |
| 0x66 | 28 | weapon in hand id (`FUN_005c89d0`, 0xff none) -> select/give it | PROVEN (capture: 0x36/0x39 = first loadout entry) |
| 0x74 | 29 | team/leader id: 0x11, or own id+0x20, or leader's | BELIEVED |
| 0x0c | 30 | body+200 state word (team bits 0x40000001 SEAL / 0x80000100 terr, 0x20000 NPC) -> `FUN_0029ed10` | STRONG (port research 91 §7 names these words) |
| 0x10 | 31 | controller state (vtable+0x6c) -> vtable+0x70. Bit 6 of its top byte with health > 0 kills the body (`FUN_005477a0`, vtable+0x90(8)); on the host it also calls `FUN_002b4440`. | STRONG |
| 0x7d | 32 | a float ·128 (body+0x228, from +0x1450) -> ctrl[0x8a] | -- |
| 0x8b | 33 | fire counter body+0x220 (incremented per shot by `FUN_002bbf10`, wraps after 200) -> the reader adds the difference, clamped 1..10, to shots to replay locally (ctrl[0x89]) | STRONG |
| 0x78 | 34 | body+0xc (u16) | -- |
| 0x14 | 35 | 32-byte name (`mp51_seal1`) | PROVEN (capture) |
| 0x34 | 36-37 | 48-byte loadout (8 × 6 bytes: `ff <id>` …), sent twice | PROVEN (capture), layout BELIEVED |

Check (`net_schema.py`): applying this order to the two captured records gives the right values. The SEAL is at
(539.76, 159.53, 1456.11), weapon 0x36, name `mp51_seal1`, state 0x40000001. The terrorist is at (1129.76, 65.05,
96.11), weapon 0x39, `mp51_terror1`, 0x80000100. The terrorist record has exactly 0 bytes left over.

### 4.2 GameObject (host), 0x5c bytes
The host's writer is `FUN_002c00f0` (D:L163017-163140; the packing at D:L163060-163137). Fields: @0 5 bytes copied from a string; @8 a valve
short; @0xc the clock, ms·0.001 = seconds; @0x10 an int; @0x14 0x47 or 0x817; @0x16 a short.

@0x18 is a bit byte:
- bit 0 = +0xd8 bit 0
- bits 1-2 = +0x112
- **bits 3-6 = game state +0x113**
- bit 7 = +0xd4

@0x19 is another bit byte:
- bits 0-2 = +0x111
- bit 5 = `mp_friendly_fire`
- bit 6 = `mp_locked_game`
- bit 7 = a valve

@0x1a is a short of valve nibbles: `EQlimit` and the side-swap flag (`DAT_004412d8`). Then @0x1c.. one byte each:
`mp_winner` at 0x1e; @0x3f/0x3e from `FUN_002f82e0`; @0x42 the 24-byte per-slot table `DAT_00441580`, which a leave
clears (`FUN_002bc530` D:L161121). Grade: STRONG as a layout, and the semantic names are the code's valve strings.

### 4.3 The others
- **PersonaObject:** 32-byte name @0xe, 16-byte clan @0x2e, a u32 @0 (see `net_schema.txt`). Captured with names
  `socomc`/`socome`.
- **BlatherObject:** one 460-byte blob, the player's quick-chat set (`_60757_ImGoingLeft_MSG`, … `_60761_ImGoingHostages_MSG`
  captured).
- **GrenadeObject (KProjectileObject, owner = thrower):** pos vec3 (> 5.0), a second vec3 (> 0.1), thrower u16 @0x18,
  state u8 @0x1a. Create (`FUN_002c17b0` D:L163740-163770) fires a local projectile from the thrower's kit
  (`FUN_005bd030` = Harry `FireGrenade__5CZKit`). Update (`FUN_002c16a0` D:L163703-163735) corrects pos, the second vec3
  and state. That the second vec3 is the velocity is BELIEVED.
- **BombObject (host):** pos vec3 (> 5.0), state u8 @0x10, two u16 @0xc/@0xe.
- **TurretObject (PlatformState, host-created for map platforms, `FUN_002b7a90`):** two f32 (> 0.05), one s32, three u16.

## 5. The host model: who decides what

| decision | who | evidence |
|---|---|---|
| a bullet hit and its damage | the shooter's console (broadcasts Hit) | §3 id 0; port research 91 §15 |
| explosion/fall damage | the victim's console | port research 91 §15 |
| part health, death, killer, cause, own score | the body's owner, replicated in its SealObject | §4.1 |
| round state, clock, winner, game flags, slot table | host (GameObject) | §4.2 |
| join admission, team placement | host (`FUN_002bc620`, Game Signal) | D:L161149-161492 |
| team switch | host (Team Switch to host) | D:L160262-160280 |
| MP bomb pickup/drop/plant/defuse | host state machine, first request wins | `FUN_002c1f10` D:L164008-164043 |
| ladder use | host (ClimbAsk -> ClimbOK) | D:L159720-159736 |
| NPC/hostage AI and their orders | host (AI Orders to host; host-created SealObjects) | §8 |
| action-point (objective) award | host, once a point | D:L160561-160580 |
| spectator eject | host (> 0.6 × players) | port research 91 §1.1 |
| vote to remove | the target's own console | port research 91 §17 |
| pickup from a body | the body's owner (PU May I -> PU OK) | D:L159891 |

**Becoming host and migration:**
- `FUN_002b83e0` (D:L158838-158885) sets `DAT_0045a0c0` = (host id == my id).
- On the DME's host-change event (type 2 in `FUN_002bbfa0` D:L160929-160951), `FUN_002bc080` (D:L160958-161048) makes
  the new host:
  - create the GameObject and init it (`FUN_002c05e0`, `FUN_002c00f0`) and its Persona if missing;
  - recreate the bomb on a bomb map (`FUN_002a72a0` -> `FUN_002c2260`);
  - take over every AI body with flag 0x20000 (`FUN_0056f210`);
  - reset the platforms' net state (`FUN_005ed7b0`);
  - replay the pending join requests (`DAT_00440ec0[24]`);
  - and, on a bomb map, call `CreateBombHere` (`FUN_002c1bf0`) at a stored position (game +0x104) when the game's
    +0x110 flag is set (D:L161035-161037). That this is the bomb's last carried position is BELIEVED.
- **STRONG.** The port has a server that never leaves, so it needs none of this.

## 6. Disconnects, abandon, spectators, late join
- **A leave** (`ClientLeaves`, then the game's `FUN_002bc530` D:L161109-161146) clears the slot's pending join and its
  per-slot byte.
  - In the staging lobby (`+0xcc` = 0) it re-inits the GameObject.
  - In a game it compares `zNetGetValidGameClientCount()` (`FUN_0030d510` -> `FUN_00623090`) minus the pending joins
    against 3. Below 3, the game runs `dlgNetAbandoned.rdr` (0x3f2780). Whether that count includes a server/host slot is
    not established, so the "fewer than 3" reading is BELIEVED.
  - The port abandons a classic round when a side is left empty (`room.ts:905-930`, citing the same function). That is
    a reasonable reading, not identical. Owed: one capture of a 2v1 round where one player leaves.
- **Spectating:** dead players cycle through living teammates only. A spectator (`FUN_002c2fd0` true) cycles through
  every living player. NPCs are skipped. The prev/next functions are `FUN_00546fa0` and `FUN_00547170`, dispatched by
  body+0xfce/+0xfcd at D:L412734-412751. Harry labels them "dpad left spectate" and "dpad right spectate" (r0004
  0x54bc34, 0x54bdec). This is a lead for `SPECTATOR_PAD_PLACEHOLDER`: the rule is STRONG; which pad bits set
  +0xfcd/+0xfce is still owed.
- **Late join:** §2.4. The joiner gets every object whole, and the ghost rule is in port research 91 §7.

## 7. Port comparison notes (only where status is not obvious from the matrix)
- **Position rate and smoothing (#7, #9).**
  - The port's 30 Hz snapshot with a 100 ms buffer is much smoother than the original online (≤5 Hz position per axis,
    exponential chase, snap above ~31.6 units).
  - If the owner wants the original's *feel* for remote players, the testable constants are: `POS_SNAP_SQ = 1000`,
    `HEIGHT_SNAP = 5.0` (+0.25 lift), `POS_SMOOTH = 50.0` (`FUN_005e6400` D:L497399-497461; 50.0 at `FUN_002a75f0`
    0x2a76ec/0x2a7764, `lui 0x4248`; reCOM `m_pos_smooth = 50.0f`), `ONLINE_POS_INTERVAL_MS = 200`,
    `LAN_POS_INTERVAL_MS = 100`.
  - Recommendation: keep the port's model (DBD) and record these as the original's numbers in a research note. Do not
    port them blindly: an exponential chase at 5 Hz under a 30 Hz snapshot would look worse, not truer.
- **Hits (#11).** The port's server cone with rewind is a ruling (port research 91 §15). The observable difference is
  that the original never "un-hits" a shot the shooter saw land, even at high latency. The port refuses rewinds past
  200 ms.
- **Score/kill line (#13-14).** The port's server-side counting matches the totals. The original's kill line comes from
  the victim's own SealObject (killer 0x76, cause 0x89), so it appears on other consoles up to 50 ms (online) after the
  victim's console decides.

## 8. Non-player networked objects: bombs, hostages, doors, grenades (the general mechanism, for H3)
1. **No object type of its own.** A hostage is a CZSealBody. The game replicates it as a **SealObject**, exactly like a
   player: position, heading, part health, life byte, killer/cause. No hostage-specific net type exists (§2.2's seven
   types).
2. **The host creates it.** `FUN_002b7a90` (D:L158514-158556) walks the world's entity list
   once at round setup.
   - Kind 2 (seal bodies) whose controller's vtable+0x30 returns true become a SealObject through `FUN_002bdda0(body, 0)`
     (mode 3: no owning client, `+0xfc8` = -1). This happens only when `DAT_0045a0c1` (online) and `DAT_0045a0c0`
     (host) are both set.
   - Kind 3 entities become PlatformState (turrets) through `FUN_002c7bf0`.
   - Players' own seals are made with `FUN_002bdda0(body, 1)` (mode 2, `+0xfc8` = my client index;
     `FUN_002b7d60` D:L158605-158611).
   - Grade STRONG. That vtable+0x30 is the "networked NPC" test is BELIEVED.
3. **The host runs the AI.** On the other consoles the NPC is driven by a `CRemoteCtrl` (the same remote-body path as a
   remote player, §4.1: target position, heading, stick).
   - A non-host player's order to it goes through the CRemoteCtrl slot `FUN_005e6a00` (D:L497528-497537). For orders 4
     and 5 only, that slot forwards to the host with `FUN_002bb970`, "AI Orders", target = host id (D:L160726-160750).
   - The host's handler (`FUN_002bb8e0` D:L160705-160720, only in game state 3) applies it with `FUN_00590ac0`
     (D:L450680-450700) through the AI controller's vtable+0x84. It marks the body (+0x105d bit 1).
   - `FUN_005e69a0` answers the local "can I order this?" (order 5 -> `FUN_00591770`, 4 -> `FUN_00591ab0`).
   - Which of 4/5 is "follow" and which is "stay" is H3's to settle (BELIEVED here). Order 4 is the one also used with
     a position (`FUN_002bb970` packs x/z bytes when order == 4).
4. **Hostage control is local bookkeeping on the host.** `ControlHostageAction`/`TryControlHostage` (Harry r0004
   0x604710/0x604810 = r0001 `FUN_005fcf10`/`FUN_005fd010`, exact match, D:L509476-509527) set hostage +0x5d4 = leader
   and leader +0x520 (= Harry's `NumberOfHostagesControlled`) ±1. They send nothing. The follow state therefore reaches
   the others only through the hostage's replicated movement, and BELIEVED, its SealObject 0x74 leader field.
5. **Death and scoring of NPCs** go through the same SealObject fields (life byte, killer id). The penalty for killing an
   escortee (flag 0x20000) is counted by the killer's console (port research 91 §8). Extraction/rescue scoring is an
   "Action Points" award by the host (§3 id 4), once per action point.
6. **Host migration hands NPCs over.** The new host takes every 0x20000 body under local AI (`FUN_0056f210` in
   `FUN_002bc080`). Hostages survive a host leaving.
7. **Bombs:** a host-owned BombObject plus a request message to the host, with the state machine in §5.
8. **Grenades:** thrower-owned; every console simulates its own copy, corrected by distance thresholds (§4.3).
9. **Doors:** not a net object. The actor's console broadcasts `Action Anim` (actor, action point, anim) and the host
   awards the point once. That doors are action points is BELIEVED (port research 92 puts doors in `actions.rdr`).

**For the port (server-authoritative):** run hostage AI on the server; it is the "host". A client's follow/stop becomes
a reliable client event (the analogue of AI Orders) checked by the server; the hostage's body goes out in the snapshot
like any other body. None of this exists today (`$PORT/packages/server/src`, `viewer/src/net`: 0 hits for
hostage/escort). The first test to write is server-side: a "follow" order from a SEAL within range moves the hostage
toward that SEAL in the room's tick, and a non-SEAL's order is refused. The range constant is
`HOSTAGE_ORDER_RANGE_SQUARED` (H3).

*Built since (HX-1, and the orders' gates at HX-4a): `packages/central/test/roomHostageOrders.test.ts` and
`packages/match/test/hostageOrders.test.ts`. The range is `ORDER_RANGE_CELLS_READING` (20 cells), and a non-SEAL's
order is not refused: either side may order (`ORDER_SIDE_READING` 'none', `hostageOrders.test.ts` "the offer is the
original's local test ...").*

## 9. Owed evidence (captures that would settle what code could not)
1. **Positions on the wire online.** A two-console round on our hosted server with the aux-UDP and peer content traced
   (`PS2X_SOCOM2_NET_TRACE=1`, `PS2X_SOCOM2_NET_TRACE_ALL=1`; KNOWN row 166, never run). Count the class-0 id 3
   FieldUpdate records per second from a walking player. Expect ≤5 per axis per second online. Check that each field is
   prefixed with its index byte (§2.3).
2. **The `ComeFromLan` direction.** Peek the valve (`FUN_003045b0` reads `*(DAT_00450058)+4`) in a hosted-server round
   and in a LAN round.
3. **The abandon threshold.** A 2v1 round where one player leaves. Does `dlgNetAbandoned` fire, and what does
   `FUN_0030d510` return before and after?
4. **The hostage follow/stop on the wire.** On Desert Glory (MP6), a non-host SEAL orders a hostage. Expect one class-2
   record with id 5 (AI Orders) to the host. Its byte 4 is the order code.
5. **NetTickSleepTime in r0004.** Find the r0004 function that matches `FUN_002ce930` and check that it loads 0x475afc
   (its access is gp-relative; `scan_refs.py` found no absolute reference).

## 10. Sourced but not implemented (multiplayer)
- Hostage/NPC replication and order forwarding (§8).
- The MP bomb state machine.
- Turrets.
- Weapon and ammo pickups.
- Ladder exclusivity.
- In-match chat and quick-chat (Blather).
- Team switch in a game.
- The spectator-eject vote.
- Spectating rules: teammates only when dead, everyone when spectating.
- The original's remote-motion constants (record only; §7).
- The `Alert` and `Names` messages.

## 11. Leads for other workstreams
- **H3 (hostages):** §8 in full. Next to read:
  - `FUN_00591770`/`FUN_00591ab0` (orders 5/4 on a remote AI);
  - `FUN_00590bc0` (D:L450747..), the order switch;
  - the vtable+0x84 implementation for the hostage controller;
  - the SealObject 0x74 leader field.
- **`SPECTATOR_PAD_PLACEHOLDER` (ONL-21):** §6 gives the functions and the rule. Trace who sets body+0xfcd/+0xfce from
  the pad.
- **Demolition (bomb maps):** the bomb state machine (`FUN_002c1f10`) and the bomb timer: `DAT_004413a0` = 0x1e (30)
  at bomb creation unless the bomb was planted (`FUN_002c2260` D:L164119-164132).
- **Round state:** the GameObject bit layout (§4.2) shows which valves are mirrored to every console: friendly fire,
  locked, EQ limit, winner, side swap.

## 12. Verification (V3, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V3-verify-modes-net.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V3/`). V3 verified M1 and M2 and ruled the H3-M2 disputes. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V3, research wave 2026-10-04. Read-only. Scripts and outputs: `scratch/V3/` (its `README.md` says what each
prints). `D:L<n>` = a line of `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001). Where I could,
I re-derived each claim by a route other than the author's: my own ELF reads and emulation, my own decoding of the raw
script words, the per-map scripts instead of `missionlist.rdr`, the dialog's own script instead of the note's label.

### 12.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| 6 | 24 game message types in order 0-23 (+2 voice), incl. AI Orders; 7 object types; no hostage/door type | **CONFIRMED** | My own registration-order dump matches M2's id table. `FUN_00620e98` is called exactly 7 times in the whole decomp. The 0-23 numbering still rests on one capture (`02 19` = 26 bytes, the Channel Status size), as M2 says. |
| 7 | Player object 37 fields / 188 B; position on change, ≤200 ms online / 100 ms LAN; health/score/life 50 ms; >4.0 check dead | **CONFIRMED-WITH-CORRECTION** | 37/188 and the dead check are right. **The LAN/ONLINE direction is swapped.** `ComeFromLan` ≠ 0 means LAN, so online is 100 ms for position (and heading, sticks, part health, state words) and every send pass for score, life, killer, cause and fire counter. LAN is 200 ms / 50 ms. Part health never went at 50 ms in either reading. |
| 8 | Remote ease exp(-50·dt); snap > ~31.6 units or 5 in height | **CONFIRMED** | Read in `FUN_005e6400` (D:L497399-497461): 1000.0 squared error, 5.0 on \|dy\|, `expf` (`FUN_001b38f8`→`__ieee754_expf`) of minus the game's +0x118, which the init stores as 50.0 (0x2a76ec/0x2a7764). |
| 9 | Shooter decides hits; victim's console its death; host the round/bomb/switch/ladders/AI/join; host migration; late-join ghost | **CONFIRMED** | The Hit handler applies real damage only where the victim's controller is not `IsRemote` (vtable +0x34). ClimbAsk, Team Switch, Bomb and AI Orders are all sent to `FUN_0030d560` (the session master). The migration calls are in `FUN_002bc080`. |
| 10 | Abandoned when fewer than 3 remain after a leave (BELIEVED); what the player sees | **UNVERIFIABLE** (threshold), **settled** (the screen) | Static code cannot settle whether the leaver is still counted. The screen is settled: popup **UIMnLOC #528** "All players left the game before you were able to join. Please try again.", then back to World of SOCOM. **The port's "ABANDONED" text is not the original's.** |
| 11 | Hostages = host-created Seal objects; non-host orders 4/5 forwarded as AI Orders; follow/stop bookkeeping host-local | **CONFIRMED-WITH-CORRECTION** | The three statements are right. M2's corollaries are wrong. The follow state *is* replicated, in the AI word (SealObject +0x10), not through field 0x74, which a receiver never applies. The rescue score comes from the AI-state 0x11 change, not from an "Action Points" award. |

### 12.2 Disputes (H3 vs M2), ruled

| point | ruling | evidence |
|---|---|---|
| (a) Send rates: which policy set is online | **H3 is right.** Online: 100 ms for position, heading, sticks, health and the state words; every pass for score, life, killer and cause. LAN: 200 ms / 50 ms. | `FUN_003045b0` returns `ComeFromLan` (0x3f6328) ≠ 0 (D:L204495-204507). Four independent consumers, each choosing the LAN branch on ≠ 0: `FUN_0022ea70` (D:L80988) picks `dlgReturnFromNTGUI2LAN.rdr` when ≠ 0 and `dlgReturnFromNTGUI2.rdr` when 0; zNetUpdate (D:L210242-210252) runs the Medius-wrapped update `FUN_003006d0` → `FUN_00647a20`/`FUN_00647ac0` and the lobby `0x44f370` when 0, and the bare DME update `FUN_006236c0` when ≠ 0; `FUN_00274d60` (D:L121606-121611) goes back to the Medius lobby when 0; D:L56828 runs `FUN_002c6c70` only when online and the valve is 0. The selectors return 0x440cf0..0x440d50 when the valve is 0 (D:L161500-161650), and my emulation of the 0x400400 initializer (`policies.txt`) gives those records 100/50/100/0/50/50/2000 ms. So the 100 ms set is the online set. |
| (b) How follow reaches other consoles | **H3 is right.** | The CSealCtrlAi vtable +0x6c (ELF word 0x66945c = 0x56f6c0) writes SealObject +0x10. In it, state 9 packs the leader id (`*(ai+0x5d4)+4`) and state 0x11 packs the rescuer id into bits 8-23 (D:L432885-432900). The CRemoteCtrl vtable +0x70 (0x669600 = 0x56f4c0) reads it. Field 0x74 (static 0x4410d8) appears in the reader `FUN_002be150` only as a counter increment (D:L162399-162401). M2's own matrix row 13/§4.1 "0x10 controller state (vtable+0x6c) -> vtable+0x70" is the right field with the content unread. |
| (c) Rescue scoring path | **H3 is right; I find no Action Points award for hostages.** | `FUN_00545480` (+1 stat +0x1c, +3 score) has exactly two callers: `FUN_0056f4c0` D:L432848 (a remote console on the AI word turning 0x11) and `FUN_0056f970` D:L432985 (the host's AI tick). `FUN_00545530` (the action-point award) has exactly three callers, D:L160566/160645/160668, all on action-point records (`FUN_002b4d80`). M1 already had this right (§2.5); M2 §8.5 is wrong. |
| (d) Orders 4/5 | **H3 is right (PROVEN).** 4 = FOLLOW, 5 = HOLDPOS. | The command-name switch at D:L449904-449908 (`s_CMD_FOLLOW_0065e300`, `s_CMD_HOLDPOS_0065e348`). The same `char` command flows through the forwarder `FUN_005e6a00` (D:L497528-497537, only 4 and 5). |
| Message statics r0001 0x440e00..0x440eb8 | **Correct, with one caution.** | 24 statics 8 bytes apart. The run-time ids follow *registration* order, not static-address order (`msgnames.txt`: Reject's static is 0x440e90 but its id is 7). H3's list order (…Bomb, Game Signal, Alert) is the address order. The ids are M2's: Bomb 21, **Alert 22, Game Signal 23** (D:L159148/159153/159161). |

Side note, not adjudicated: M2 and H3 label the Hit record's +4 and +7 bytes differently (M2: part / type; H3: cause /
part). The sender `FUN_002bbda0` (D:L160852-160891) packs +4 from its 7th argument and +7 bits 0-3 from its 5th
(clamped 0..15). Settling which one is the body part needs `FUN_005a1b80`'s parameter use, which I did not read.

### 12.3 Claim 6: Message and object types -- CONFIRMED

- `msgnames.txt`: 24 registrations in `FUN_002b8660` (D:L159040-159161), all inside one `DAT_0045a0c2 == 0` guard.
  They are Hit … Bomb (21), Alert (22), Game Signal (23); AI Orders is 5.
- The voice pair is registered at D:L211806/211809.
- CZNetwork's own two (`FUN_0030cb90` D:L209617/209637, called from D:L204434) go through the same
  `FUN_006210d0`. That function registers only once the DME is up (`DAT_006511ff`/`DAT_00651204`). I could not order
  them statically against the game's 24.
- The single class-2 record in `s4_pcsx2/slice-DME.log` is `02 19` with 24 payload bytes, consistent only with
  Channel Status = 25. STRONG, as graded.
- `objtypes.txt`: `FUN_00620e98` has exactly 7 call sites: SealState 0x90, GameState 0x5c, GrenadeState 0x24,
  BombState 0x14, BlatherState 0x1cc, PersonaState 0x4c and PlatformState 0x1c. There is no hostage or door type.

### 12.4 Claim 7: The player object and its rates -- CONFIRMED-WITH-CORRECTION

- `sealfields.txt`: 37 `FUN_00620db0` calls; Σ elem×count = 188.
- **The dead check:** `refs_2bd270.txt` finds no jal to `FUN_002bd270`, no literal of its address, and exactly two
  lui 0x2c + addiu 0xd270 pairs, at 0x40043c and 0x400538 (the two policy constructors).
  - `FUN_0061b2a0` calls the +0x18 callback only for mode 5 (D:L527166-527175).
  - Mode 2 reads +0x18 as a float threshold (the 0x2bd270 bits, about 4e-39).
  - So position goes out on any change, and the check is dead. CONFIRMED.
- **Correction (rates):** see Dispute (a). The corrected values:

| field | ONLINE | LAN |
|---|---|---|
| position X/Y/Z | ≥100 ms | ≥200 ms |
| heading, sticks, pose | ≥100 ms | ≥200 ms |
| part health, weapon, state words | ≥100 ms (flag 0x40) | ≥200 ms |
| score shorts, killer, cause | every pass | ≥50 ms |
| life, fire counter, loadout | every pass (flag 0x50) | ≥50 ms |
| GameState (most fields) | every pass | ≥50 ms |
| grenade / bomb vec3 | ≥50 ms | ≥100 ms |

  - The grenade/bomb row is records 0x440d30/0x440d40 against 0x440dd0/0x440de0.
  - M2's matrix rows 7, 8 and 29, its §2.3 table and its §7 constants (`ONLINE_POS_INTERVAL_MS` should be 100,
    `LAN_POS_INTERVAL_MS` 200) are swapped. Online position is up to 10 Hz per axis, not 5 Hz.
  - Owed capture: M2 §9.1/9.2.

### 12.5 Claim 8: Remote smoothing -- CONFIRMED

- `FUN_005e6400` is the CRemoteCtrl PreTick (vtable 0x669590 +0x0c).
- The ease factor is `expf(-dt · game[+0x118])`. It is recomputed only when the value of `FUN_0030d550(0x45a0c0)`
  changes. The game init stores 0x42480000 (50.0) at +0x118 (my disassembly, 0x2a76ec/0x2a7764).
- It snaps if the squared error is above 1000.0.
- Beyond 5.0 on \|Δy\| it re-places the body at y + 0.25 and then still eases.
- The factor is 1 when stick x is 0 and stick z is 0.
- The rotation factor is clamp(2·factor, 0, 1). STRONG as graded.

### 12.6 Claim 9: Authority -- CONFIRMED

- **Hits:** the Hit handler (D:L160819-160850) runs only in game state 3. It calls `FUN_005a1b80` with the real damage
  only when the victim's controller vtable +0x34 returns false. That slot is CRemoteCtrl `IsRemote` (r0001 0x5e6260
  at 0x6695c4; the demo's `IsRemote__11CRemoteCtrlCFv` at the same slot). Otherwise it calls `FUN_005a1b70` = the same
  function with zero damage. So the victim's owner (the host, for an NPC) applies the damage and decides the death.
- **Host-directed messages:** ClimbAsk (D:L159734), Team Switch (D:L160276), Bomb (D:L159489) and AI Orders
  (D:L160748) all target `FUN_0030d560(0x45a0c0)`.
- **Migration:** `FUN_002bc080` calls `FUN_002c05e0` (GameObject), `FUN_002a72a0` (bomb map), `FUN_0056f210` for
  bodies with 0x20000, `FUN_005ed7b0` (platforms) and `FUN_002c1bf0(game+0x104)`.
- **Ghost:** UIMnLOC 352-353, port research 91 L177/L255/L339.

### 12.7 Claim 10: The abandon -- threshold UNVERIFIABLE statically; the screen settled

- **The test:**
  - `FUN_002bc530` (D:L161109-161146) is the leave callback, registered with `FUN_002bc620` (join) through
    `FUN_0030d1b0` / `FUN_0030d380` (D:L158901/158930).
  - It runs only in a game (game +0xcc ≠ 0). It counts pending joins in `DAT_00440ec0[24]` and opens
    `dlgNetAbandoned.rdr` (0x3f2780) when `zNetGetValidGameClientCount() - pending < 3`.
  - The count (`FUN_00615160`) is the number of DME client entries whose byte +0x28 is 1.
- **What I could add:**
  - Own console counted: the local console's own entry gets +0x28 = 1 when it joins (`FUN_00617060`, D:L524486-524493,
    with world +0x400 = own index). So the count includes self. BELIEVED (the entry is fetched by that index).
  - Spectators: they are DME clients, so they are counted too. BELIEVED.
  - Leaver: in the DME's ClientLeaves path (class-0 id 18 → `FUN_0061de18` → `FUN_00612e48`) the leaver's entry gets
    state +0x14 = 2. Its +0x28 is not cleared before the app callback `DAT_0067c5bc` fires; the entry is released
    afterwards by `FUN_00612880`.
- **Why it stays open:** I could not prove that `DAT_0067c5bc` is the path to `FUN_002bc530`, or that the call is
  synchronous. So two readings remain: "fewer than 3 consoles remain" or "fewer than 2 remain besides the leaver".
  Owed: M2 §9.3's 2v1 capture, plus a PEEK of `FUN_0030d510`'s result before and after the leave.
- **A second trigger** (port research 91 L254): `FUN_002c4500` D:L165673-165676. The host opens the same dialog
  (0x3f2a50) when both team counts (`DAT_00441448`/`DAT_00441450`) are 0, the state is 2..5 and spectators remain.
- **What the player sees (settled, PROVEN from the disc):** `UI/READERC.ZAR` `dlgNetAbandoned.rdr`
  (`dlgNetAbandoned.txt`, `.tree.json`; the port's own pinned listing `tools/test/onlineDialogs.pinned.json` L12408-12450
  agrees):
  1. ONSTART `onstart_handler` = `DisconnectFromGameServer`.
  2. ONSTART `displayNews` = `POPUPDIALOG`, **`POPUP #528`**, then `exit_lobby` → `ReturnToWorldOfSOCOM` (blocking).
     The library edges go to `dlgWorldOfSOCOM.rdr` online and `dlgLANBriefingRoom.rdr` on LAN.
  3. UIMnLOC 528 `_528_AllPlayersLeft_MSG` = "All players left the game before you were able to join. Please try
     again." (`scratch/M1/uimnloc.ts 526-530`).
  - The player is disconnected from the game and returned to the online lobby. The round does not simply end.
- **Contradiction with the port:**
  - The port posts "ABANDONED" in-round (`packages/viewer/src/netPage.ts` L937-945; research 91 L642, L913-916).
  - No such caption exists in that dialog.
  - The port's trigger (a side left empty) also differs from both original triggers (M2 already flagged the trigger).

### 12.8 Claim 11: Hostages on the net -- CONFIRMED-WITH-CORRECTION

- **Creation:** `FUN_002b7a90` (D:L158514-158556). A kind-2 body whose controller vtable +0x30 is true becomes a
  SealObject through `FUN_002bdda0(body, 0)`, only when `DAT_0045a0c1` and `DAT_0045a0c0` are both set. CSealCtrlAi
  +0x30 (0x669420) = 0x575c40 (H3: `li v0,1`).
- **Forwarding:** `FUN_005e6a00` forwards only commands 4 and 5 to `FUN_002bb970` (AI Orders → session master).
- **Bookkeeping:** `ControlHostageAction`/`TryControlHostage` send nothing. CONFIRMED.
- **Correction:** M2 §8.4 and §8.5 conclusions are wrong; see Disputes (b) and (c).
  - The follow and rescue state replicates in the AI word.
  - Every console credits its own player's rescue from that word.

### 12.9 Port notes checked

| note | contradiction? |
|---|---|
| 91 L642, L913-916; `netPage.ts` L945 | **Yes.** "ABANDONED" is not the original's text. The original shows UIMnLOC 528 and leaves to World of SOCOM (claim 10). |
| 91 L29 | **Imprecise.** FF is "game-info bit 0" only in the world report's RulesSet; the in-game GameState has it at bit 0x20 of byte @0x19 (claim 3). |
| 91 L169, L726, L738 | No: the game types, the 15 s `mission_timer` and the 99 draw agree with claims 1-2 for SUPPRESSION. |
| 101 | No contradiction found; A38 (no abandon dialog) is consistent with claim 10's finding. |
| 124 | Nothing on these claims beyond the per-map cues M1 cites; no contradiction found. |
| 154 | Only the `rulesSet` field name in the game-list API; consistent with claim 3. |
| desktop research 18 L797 | Agrees with Dispute (a): "The `ComeFromLan` bypass … is false for a Medius match". |

### 12.10 Corrections to carry (items 1-4 and 6 of the verifier's list, for M2 and the port)

1. M2: swap LAN and ONLINE throughout matrix rows 7, 8 and 29, §2.3, and §7. Online position is ≤10 Hz per axis.
2. M2 §8.4: follow travels in SealObject +0x10 (the AI word, bits 8-23 = the leader id). §8.5: rescue scoring is the
   AI state 0x11 path (`FUN_00545480`), not Action Points.
3. M2 §8.3: orders 4 = FOLLOW, 5 = HOLDPOS (PROVEN, D:L449904-449908).
4. M2 §6 / matrix 19: add the screen (UIMnLOC 528, then back to World of SOCOM) and the second trigger
   (`FUN_002c4500`).
6. Port: the `abandoned` page text (netPage.ts L945) should become the original's popup and exit, when ONL-22 lands.
