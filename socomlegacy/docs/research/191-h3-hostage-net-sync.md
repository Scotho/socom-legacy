# 191 -- H3 -- How the original replicates hostages in an online match (and what the port must do)

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/H3-hostage-net-sync.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V2 (`research-wave-2026-10-04/V2-verify-hostage.md`) has landed and is folded in as §12; V3 (`research-wave-2026-10-04/V3-verify-modes-net.md`) has landed and is folded in as §13.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

**Overridden in part (research 206 §1):** field 0x74 (the unit) is not applied on a receiving console (§0, §3) -- it **is** applied on receive (H4, V5: research 199 §5 and §12.6).

Agent H3-hostage-net-sync, research wave 2026-10-04. Read-only. Sources: the r0001 decomp
(`socom2_game.elf.decomp.c`, cited `D:L<line>`), the r0001 ELF (`game/overlays/socom2_game.elf`), the SOCOM 1 demo
(SCUS_972.05, which has symbols; supporting evidence), Harry62's function labels, reCOM `zNetwork`, desktop research 18,
port research 91/107/115, the capture `D:/socom_archive/run_[AB]_20260917_023948.log`. Scripts are in
`scratch/H3/` (see its `README.md`). This builds on **[193](193-m2-mp-net-replication.md)** (the general net layer); where I agree
with M2 I cite it and do not repeat it, and §0.2 lists three places where I read the code differently.

## 11. Summary

| item | status | grade | one-line answer |
|---|---|---|---|
| Q1 Who simulates hostage AI | RESOLVED | STRONG | The **session master (host)** runs the hostage's AI (`CSealCtrlAi`). Every other console draws it through a `CRemoteCtrl` (no AI). |
| Q1 Authority on take-control | RESOLVED | STRONG | Authority never moves. A SEAL's FOLLOW (cmd 4) / HOLDPOS (cmd 5) is forwarded to the host as `AI Orders`; the host's AI calls `TryControlHostage`. |
| Q1 Leader dies | RESOLVED | STRONG | On the host, the dying body's handler releases every hostage it leads (`ControlHostageAction(ai,0)`). |
| Q1 Leader disconnects | PARTIAL | BELIEVED | The leader's SealObject is deleted (lifespan 2); on the host the body's id is invalidated and it leaves its unit. Whether that clears the hostage's leader is not read. |
| Q1 Host disconnects | RESOLVED | STRONG | Hostage objects (lifespan 3) pass to the new session master; it rebuilds each hostage as local AI and resumes "follow" / "rescued" from the replicated state word. |
| Q2 Net object | RESOLVED | PROVEN | No hostage type. A hostage is a **SealObject** (struct "SealState", 0x90 bytes) created by the host with lifespan 3. |
| Q2 Which word carries hostage state | RESOLVED | PROVEN | The **AIState word** (struct +0x10, u32): AI state id + leader/rescuer entity id + anim blend + 2 flags. No "packet type" carries hostage state; Harry's `PacketType*` words are SOCOM 1 demo addresses. |
| Q2 Rates | RESOLVED | STRONG | Per field: ≥100 ms online (≥200 ms LAN), on any change; position too (its 4-unit callback is dead code). Remote chase `t = expf(-50·dt)`, snap at √1000 units. |
| Q2 TCP vs UDP | UNRESOLVED | -- | Chosen by connection index, not by message; the index's value in a round is not read. Owed capture in §8. |
| Q3 Hit on a hostage | RESOLVED | STRONG | The **shooter's** console detects the hit and broadcasts `Hit`; only the console where the hostage is local (the host) applies damage. |
| Q3 Kill attribution / announce | RESOLVED | STRONG | Killer id and cause replicate in the hostage's SealObject; every console then counts `mp_hostages_by_seals/_turds`, plays CMD_MP_HOSTAGE_KILLED (0x44) locally; only the killer's console changes its score. |
| Q3 Rescue | RESOLVED | STRONG | The host's hostage AI, each tick, tests "has a leader and stands in a type-1 zone" -> AI state 0x11 with the rescuer's id; replicated in the AIState word; each console credits its own player only. |
| Q3 Round end | RESOLVED | STRONG | Every console runs MP6's `objectives` script. Only the host copies its `mp_winner`/scores into the GameObject and ends the round for all (`FUN_002a9b30` D:L150629-150669). So the host's 15/17 s timing rules (§2.6). |
| Rescued hostage killed again | PARTIAL | PROVEN / UNRESOLVED | The kill counters do not check the `rescued` state, so a double count is possible if the body can still be hit; whether it can is H1's (§2.7). |
| Q4 Late join | RESOLVED | STRONG | The library sends every object whole to a newly accepted client; the hostage arrives in its current state. |
| Q4 Spectator | PARTIAL | BELIEVED | A spectator receives the same objects; a console whose persona flag 0x10000 is set cannot send AI orders. |
| Q5 Port mapping | PLAN | -- | Server = the original's host. Server runs hostage AI, takes a reliable `hostageOrder` event, sends hostage bodies in the snapshot plus a reliable hostage-state event. §7. |

## 0. Address caution and relation to M2

### 0.1 Harry's data labels are SOCOM 1 demo addresses
The r0004 labels `PacketTypeHit`..`PacketTypeGameSignal` (0x47598c..0x4759cc), `m_NetStructIndex*Object` and the
`m_*FieldID` statics (0x4759d4..0x475aec), `HOSTAGE_ORDER_RANGE_SQUARED$2655` and `hostage_ignore$2777` are exactly the
**demo's** symbol addresses (`scratch/H3/demo_net_symbols.txt`: `PacketTypeHit 0x47598c`, ...
`m_NetStructIndexSealObject__11CZSealState 0x4759d4`). No r0004 code references 0x470000-0x480000 by lui+imm
(`r0004_netstatic_refs.txt` is empty; one stray hit elsewhere). C1 confirmed the same. **Do not read values there.**
The SOCOM II equivalents are:

- Seal field-id statics: r0001 0x441010 (struct index), 0x441018..0x441130 (36 fields). Written by `FUN_002bf2c0`
  (zNetRegisterSeal), D:L162636-162712.
- Message-type statics: r0001 0x440e00..0x440eb8, registered by `FUN_002b8660` (DMERegister) D:L159040-159161. There
  are 24 of them (`msgtypes.py`): Hit, Anim, Push Blend, Action Anim, Action Points, AI Orders, E3 Index, Reject,
  Message, Chat, Wep PU, Wep Ammo PU, PU May I, PU OK, ClimbAsk, ClimbOK, Names, Voter, Spec Vote, Team Switch,
  All Switch, Bomb, Game Signal, Alert. **None is hostage-specific.**
- The id values in those statics are assigned at run time (`FUN_0030cff0` -> `FUN_006210d0`), so no fixed number can be
  read from the ELF. The port does not need them.

Harry's **function** labels hold. `ControlHostageAction` r0004 0x604710 = r0001 `FUN_005fcf10` and `TryControlHostage`
0x604810 = `FUN_005fd010` (`match_r0001_r0004.csv`, "exact").

### 0.2 Where this report reads the code differently from M2

1. **Which policy set is ONLINE.** M2 §2.3 calls the records chosen when `ComeFromLan` ≠ 0 "online" (BELIEVED), which
   makes online positions ≥200 ms.
   - I read the opposite: `ComeFromLan` ≠ 0 means LAN.
   - (a) The only data that names the valve, `EXTZANIM.ZAR`, lists it as `ReturnToBriefingRoom` /
     `ComeFromLan` / `dlgLANBriefingRoom.rdr` / `dlgMPBriefingRoom.rdr` (`comefromlan.txt`). A non-zero valve sends the
     player back to the LAN briefing room.
   - (b) `zNetUpdate` `FUN_0030da00` takes the Medius-capable branch `FUN_003006d0` when the valve is 0 (D:L210242-210250,
     D:L201969-201981). It takes the bare DME update `FUN_006236c0` when it is non-zero (D:L210252).
   - So **online = records 0x440cf0..0x440d50: 100 ms for positions, heading, sticks, health and the AI word; 0 ms (every
     pass) for life, killer and cause**. LAN = 200 ms / 50 ms. Grade STRONG (two lines). M2's §7 constants
     `ONLINE_POS_INTERVAL_MS = 200` / `LAN_POS_INTERVAL_MS = 100` should be swapped. M2's owed peek (§9.2) would settle it.
2. **How "follow" reaches the other consoles.** M2 §8.4 says it is BELIEVED to travel only through movement and the
   SealObject field 0x74.
   - It travels in the **AIState word (struct +0x10)**: state 9 (`follow`) with the leader's entity id in bits 8-23.
     Proof: the writer `FUN_0056f6c0` D:L432892-432900, the remote decode `FUN_0056f4c0`, and the host-migration
     rebuild `FUN_0056f210` D:L432775-432782, which turns state 9 + id back into a FOLLOW order.
   - Field 0x74 is **not applied** on a receiving console: its branch only bumps a counter (D:L162399-162401).
3. **How a rescue is scored.** M2 §8.5 says extraction/rescue scoring is an "Action Points" award by the host.
   - For a hostage, the code I read credits the rescue through the **AI state 0x11 transition**: on the host,
     `FUN_0056f970` D:L432969-432990 -> `FUN_00545480`; on every other console, `FUN_0056f4c0` D:L432842-432849 ->
     `FUN_00545480`.
   - `FUN_00545480` adds +1 to stats +0x1c (hostages rescued) and +3 to +0x3c (score), and only for the local player
     (D:L411560-411571).
   - I did not find an Action Points award for hostages. If M2 has one, both may exist (for VIP/escort). Flagged for
     review.
4. **Orders 4 and 5** (M2: BELIEVED). They are named by the command-name table `FUN_0058ef80`: 4 = `CMD_FOLLOW`
   (D:L449904-449905), 5 = `CMD_HOLDPOS` (D:L449907-449908). Grade PROVEN.

## 1. Who simulates the hostage

| step | evidence | grade |
|---|---|---|
| `DAT_0045a0c0` is the session-master (host) byte, `DAT_0045a0c1` the network byte | Port research 107 (`IsSessionMaster` = both set), research 115. Join routine `FUN_002b83e0`: sets 0x45a0c0 = 1 iff my client index == the session master's (`0x2b84a0`-`0x2b84d4`, ELF disassembly). Capture `run_A/B_20260917_023948.log` (Desert Glory, A created the game): A's word @45a0c0 reads 0x01010101, B's 0x01010100 (byte 0x45a0c0 = 1 on A only) | PROVEN |
| Only the host makes the hostages net objects | `FUN_002b7a90` D:L158522-158556 walks the entity list. A kind-2 body whose controller's vtable+0x30 (`IsAi`) is true -> `FUN_002bdda0(body,0)`, only when both bytes are set. Runs once after the local player is network-created (`DAT_0044ce50`, set by `CZSealBody_NetworkPlayerCreate` D:L410581; called from `FUN_001f5e70` D:L55681/55690) | STRONG |
| vtable+0x30 is `IsAi`, true for the AI controller | CSealCtrlAi vtable r0001 0x6693f0 (`findvt.py`), slot +0x30 = 0x575c40 = `jr ra; li v0,1`. Remote/player controllers share base 0x5499d0. Demo `__vt__11CSealCtrlAi` +0x30 `IsAi__11CSealCtrlAiCFv` (`demovt.py`) | STRONG |
| Hostage object = SealObject, lifespan 3 | `FUN_002bdda0` D:L162081-162113: `zNetCreateObject(&id, 1, isPlayer?2:3, ...)`, `+0xfc8 = -1` for AI, `+0xfdc = localTime+10000`, struct cleared to 0x90 bytes, struct+0x8c = body. Demo `CreateLocalSeal` has the same arguments (ownership 1, lifespan 2/3; `demodis.py 0x204b80`) | PROVEN |
| Other consoles: a remote body, `CRemoteCtrl`, no AI | Creation callback `FUN_002bf070` D:L162545-162618: if struct+0x78 (unit index) ≠ 0, it is a mission entity: index into the mission table (`DAT_00437cf4`, stride 0x160), set `<name>_valve_alive` = 1, then `FUN_00599690`. That builds the body with controller vtable 0x669590 = `CRemoteCtrl` (D:L455432-455437), **entity id = the net object index** (D:L455453), `+0xfc8 = -1`, `+0xc` = unit index | PROVEN |
| Entity ids agree across consoles | `GetEntityById` `FUN_0029e4e0` compares entity +4 (D:L144697). The net code writes body+4 = object index on the owner (D:L158550, D:L158585) and on the receiver (D:L455453). So the ids inside the AI word and the messages are object indices on every console | STRONG |
| Objects arriving before the map is loaded are queued | `FUN_002bf070` D:L162565-162569 queues while `DAT_00437cec` == 0. `FUN_002bee10` D:L162474-162482 replays the queue | PROVEN |

**Answer:** hostages are host-simulated. Every other console renders a remote body that is moved toward the host's last
sent position (§5). Clients run no hostage AI. That clients do **not** also spawn the hostages themselves from the map
is BELIEVED: the creation callback does not look for an existing body. Owed check in §8.

## 2. Sequence (as the original does it)

`H` = host console (session master, owns the hostage's AI). `S` = the SEAL's console (not host). `O` = any other console.
Line numbers are in the step tables (§2.1-2.7).

```mermaid
sequenceDiagram
  participant S as SEAL console (client)
  participant H as Host (hostage AI)
  participant O as Other consoles
  Note over H: round setup: FUN_002b7a90 -> CreateLocalSeal(hostage,0) lifespan 3
  H-->>S: ObjectUpdate (whole SealObject, flags 0x50)
  H-->>O: ObjectUpdate
  Note over S,O: FUN_002bf070 -> FUN_00599690: remote body, CRemoteCtrl, id = obj index
  S->>S: player orders FOLLOW: FUN_00590ac0(hostage, me, 4) -> CRemoteCtrl slot FUN_005e6a00
  S->>H: AI Orders {issuer u16, hostage u16, cmd 4} to session master
  H->>H: FUN_002bb8e0 -> FUN_00590ac0 -> CSealCtrlAi::OnCommand FUN_0058fbe0 case 4
  H->>H: TryControlHostage FUN_005fd010 -> ControlHostageAction: ai+0x5d4 = leader, leader+0x520 += 1
  H-->>S: Message {issuer, -1, 0x2b CMD_MP_ESCORTEE_FOLLOWING}
  H-->>O: Message (same)
  loop every tick, fields at most every 100 ms online
    H->>H: CSealCtrlAi Tick -> UpdateLocalSeal FUN_002bd640 (AI word = state 9 | leader id << 8)
    H-->>S: FieldUpdate (pos, heading, sticks, AI word...)
    H-->>O: FieldUpdate
    Note over S,O: FUN_002be150: target pos/rot, SetThrottle, SetAiNetState FUN_0056f4c0
  end
  S->>S: shot lands on hostage (shooter decides): FUN_005a5a80 -> FUN_005a1ff0
  S-->>H: Hit {shooter, hostage, cause, dmg, force, part|flag} broadcast
  S-->>O: Hit
  H->>H: FUN_002bbbd0: hostage local -> full damage FUN_005a1b80
  O->>O: hostage remote -> reaction only FUN_005a1b70
  H-->>O: FieldUpdate: health x6, life 0x88, killer 0x76, cause 0x89
  Note over S,O,H: each console: FUN_00547aa0/a90 -> by_seals/by_turds valve +1, radio 0x44 local, killer's own score
  H->>H: CSealCtrlAi PostTick FUN_0056f970: leader set and in type-1 zone -> state 0x11, rescuer = leader
  H-->>O: FieldUpdate AI word = 0x11 | rescuer << 8
  Note over O: FUN_0056f4c0 sees 0x11 -> FUN_00545480(rescuer) (own player only)
```

### 2.1 Take control (follow)

| # | where | what | source | grade |
|---|---|---|---|---|
| 1 | S | A command on a body goes to `FUN_00590ac0(target, issuer, cmd, data, flag)`. It calls the target controller's vtable+0x84 (D:L450687-450698) | decomp | PROVEN |
| 2 | S | The hostage's controller on S is a CRemoteCtrl. vtable 0x669590 +0x84 = `FUN_005e6a00`: for cmd 4 or 5 only it calls `FUN_002bb970(issuer id, own body id, cmd, 0)` (D:L497530-497537) | decomp + `vt.py` | PROVEN |
| 3 | S | `FUN_002bb970` = NetSendAiOrders. It skips if not online, or if the issuer's persona flag 0x10000 is set (`FUN_002c2fd0` D:L164611-164644). It packs 8 bytes and sends to `zNetGetGameSessionMasterClientIndex` (`FUN_0030d560`, identical in body to the demo's, `demodis.py 0x321710`) with type static 0x440e28 "AI Orders", flags 0x40, queued (D:L160726-160750; disasm 0x2bb970-0x2bba54) | decomp + ELF | PROVEN |
| 4 | H | `AI Orders` handler `FUN_002bb8e0`: only in game state 3 (`DAT_00437ce8+0x113`). Resolves both bodies by object index (`FUN_002bd4d0`, the SealObject name check vs "SealObject" @0x3f27d0) and calls `FUN_00590ac0(hostage, issuer, cmd, 0, 0)` (D:L160713-160720) | decomp | PROVEN |
| 5 | H | Hostage controller = CSealCtrlAi. vtable +0x84 = `FUN_0058fbe0` (0x669474). Case 4 (D:L450346-450410): if the body has flag 0x20000 or 0x40000 (hostage/escortee) it joins the leader's unit (`FUN_005ee160`), plays AI sound 0x37, and online issues `FUN_005e7f20(issuer, 0x2b)` = CMD_MP_ESCORTEE_FOLLOWING. Then it pushes AI state 9 and calls `TryControlHostage` | decomp | PROVEN (code); the gameplay meaning of each test is H1's |
| 6 | H | `TryControlHostage` `FUN_005fd010` -> `ControlHostageAction` `FUN_005fcf10` (D:L509476-509527). Old leader +0x520 −1. New leader taken only if ≠ own body and leader+0xe1 bit 4 is set. ai+0x5d4 = leader, leader+0x520 +1, ai+0x5d8 = leader+4 (its id) | decomp | PROVEN |
| 7 | H -> all | `FUN_005e7f20(body, 0x2b, 0)` sends `Message` {u16 issuer id, s16 −1 = everyone, u16 0x2b} (`FUN_002bad40`, static 0x440e38, 6 bytes, D:L160238-160249) and plays it locally. Receivers (`FUN_002bac40` D:L160200-160228) play it for target −1 / −2 (SEALs) / −3 (terrorists) / their own id | decomp | PROVEN |
| 8 | H -> all | The follow state rides the AIState word (§3.2): state 9, bits 8-23 = leader id. Remote `CRemoteCtrl::SetAiNetState` `FUN_0056f4c0` stores it at ctrl+0x110 | decomp | PROVEN |

The host's own player gives orders the same way. On H the hostage's controller is the AI, so step 4 happens directly with
no packet.

### 2.2 Stop (hold)
Cmd 5 (`CMD_HOLDPOS`) takes the same path through steps 1-4. On the host it reaches `FUN_0058fbe0`. Case 5 is H1's to
read (the AI side). For the wire, cmd 5 sends the same 8-byte `AI Orders` with byte 4 = 5 and no position bytes.

### 2.3 Hit and kill

| # | where | what | source | grade |
|---|---|---|---|---|
| 1 | shooter | `FUN_005a5a80` (projectile hits a body), online branch D:L461598-461646. If the shooter id is 0, or the shooter's controller is local (IsRemote false), call `FUN_005a1ff0` (send `Hit`). Apply local part damage `FUN_005a5830` **only if the victim is local**. If the shooter is remote, do nothing | decomp | PROVEN |
| 2 | shooter | `FUN_005a1ff0` D:L459641-459680 -> `FUN_002bbda0` SendHitMessage D:L160852-160891: 8 bytes, broadcast (target −1), static 0x440e00 "Hit", flags 0x40, queued. It also stamps the victim +0xfd8 = health, +0xfd4 = time | decomp | PROVEN |
| 3 | every console | `HitPacketHandler` `FUN_002bbbd0` D:L160807-160846 (game state 3, not while a valve at 0x43668c reads 1/2). If the victim's controller is **not remote** -> full apply `FUN_005a1b80(dmg, force·0.05, victim, part, victim, shooter, cause, flag)`. Otherwise `FUN_005a1b70` = the same with damage 0 (reaction only) | decomp | PROVEN |
| 4 | H | `FUN_005a1b80` D:L459490-459618, victim local: part damage, then `FUN_00547aa0(victim, shooter id, ...)` = set killer (D:L459606) and `FUN_00547a90` = set cause | decomp | PROVEN |
| 5 | H -> all | Health ×6, life byte, killer u16 and cause u8 go out in the hostage's SealObject (§3.1: struct 0x82-0x87, 0x88, 0x76, 0x89). Receivers: `FUN_005a5790` per part, `FUN_00544210` (life), `FUN_00547aa0`, `FUN_00547a90` (D:L162325-162359) | decomp | PROVEN |
| 6 | every console | `FUN_00547aa0` -> `FUN_0059ee20` D:L458059-458150: victim flag 0x20000 and online -> killer is terrorist (`FUN_002c30b0`) ? GameObject+0x3c valve `mp_hostages_by_turds` : SEAL (`FUN_002c31d0`) ? +0x38 `mp_hostages_by_seals`; valve +1 (D:L458118-458143). Then `FUN_00545390` changes the score only if the killer is the local player: −2, or +3 for a terrorist when game+0x111 == 3 (D:L411516-411547). Valve names: `FUN_002a6c50` D:L149084-149096; Harry's GameObject +0x38 "SealHostages" agrees | decomp + Harry | STRONG |
| 7 | every console | `FUN_00547860`/`FUN_00547a90` (D:L412863-412913, D:L412938-412990): online, killer ≠ 0xff and cause > 0. A hostage victim (0x20000) gets **no kill-feed line**, only `FUN_005e7f20(victim, 0x44, 0)` = CMD_MP_HOSTAGE_KILLED (0x44, name table D:L449869), played locally, not sent | decomp | PROVEN |
| 8 | remote | CRemoteCtrl OnDeath `FUN_005e6290` (vtable slot +0x18) sets `<entity>_valve_alive` = 0 (D:L497321-497327) for the local mission scripts | decomp | PROVEN |

The two calls in step 7 each fire when both killer and cause are already present. If one update carries both fields,
the radio command may be issued twice. The de-duplication inside `FUN_005e7960` is not read.

### 2.4 Rescue

| # | where | what | source | grade |
|---|---|---|---|---|
| 1 | H | CSealCtrlAi PostTick `FUN_0056f970` (vtable 0x6693f0+0x3c), D:L432969-432991. Body flag 0x20000, last leader id ai+0x5d8 valid, and `FUN_0052a200(0x66a1b0, 1, body+0xe4)` (a type-1 zone query, BELIEVED the rescue zone) -> push AI state 0x11 (`rescued`, name table D:L435935). Then state+0x58 = zone, state+0x5c = leader id, and `FUN_00545480(leader stats, leader)` | decomp | PROVEN (code); "type 1 = rescue zone" BELIEVED |
| 2 | H -> all | AI word = 0x11, bits 8-23 = state+0x5c (writer D:L432885-432890) | decomp | PROVEN |
| 3 | every console | `FUN_0056f4c0` D:L432842-432849: on a change to 0x11, look up the rescuer by id and call `FUN_00545480(rescuer+0x58c, rescuer)` | decomp + disasm 0x56f5f8-0x56f664 | PROVEN |
| 4 | every console | `FUN_00545480` D:L411554-411572: online, only if the rescuer is a SEAL. Only if the rescuer is the local player: stats +0x1c (hostages rescued) +1 and +0x3c (score) +3. Then `FUN_00544d60` | decomp | PROVEN |
| 5 | all | The rescuer's score reaches the others through its own SealObject u16 fields (§3.1, 0x6c = body+0x5c8 = stats+0x3c) | decomp | STRONG |

### 2.5 Leader dies / leader leaves / host leaves

- **Leader dies.** Body death handler `FUN_00547af0` (body vtable slot 0x6691f8; BELIEVED OnDeath), D:L413026-413046.
  It runs if the dying body leads hostages (+0x520 ≠ 0). For every body with an AI (`GetSealCtrlAi` non-null, so only on
  the host), if ai+0x42c bit 0x200 is set and its leader (`FUN_005fcd30`) is the dying body, it calls
  `ControlHostageAction(ai, 0)`. That clears the follow state (D:L509505-509515). The new AI word then replicates.
  Grade PROVEN (code); the meaning of 0x200 is UNRESOLVED.
- **Leader leaves.**
  - The DME library's `NetClientLeaves` `FUN_00612e48` D:L521556-521665 (called from the ClientLeaves handler
    `FUN_0061de18`) deletes the objects the leaver owned whose lifespan is not 3/4. The player's SealObject has
    lifespan 2.
  - The game's deletion callback `FUN_002bef60` -> `FUN_005998b0` D:L455500-455535 invalidates the body's id, calls
    vtable+0x90(8), and on the host removes it from its unit (`FUN_005ed7b0(unit, body, 1, 0)`).
  - **Whether this clears the hostage's ai+0x5d4/0x5d8** is not read (UNRESOLVED, §8).
- **Host leaves.**
  - `NetClientLeaves`: for objects whose lifespan byte (+2) is 3 or 4, the owner (+8) becomes the session master, and a
    private owner equal to the leaver is cleared (D:L521600-521617).
  - A new session master is elected when the leaver was the master: the lowest positive +0x24 among clients in
    state 4 (`FUN_00613158` D:L521688-521725).
  - In the game, `FUN_002bc080` D:L160958-161048 (event type 2 through `FUN_002bbfa0`): the console that is now master
    sets 0x45a0c0 = 1, creates the GameObject (`FUN_002c05e0`), and **for every remote body with flag 0x20000 calls
    `FUN_0056f210`** (D:L160999-161008).
  - `FUN_0056f210` (D:L432724-432788) swaps the CRemoteCtrl for a new CSealCtrlAi. It restores state 0x11 with the
    rescuer, or reissues CMD_FOLLOW from the leader whose id is in the last AI word, or keeps the leader id at +0x5d8.
  - So hostages keep following across a host change. Grade STRONG (M2 §8.6 agrees).

### 2.6 Who runs the objectives script and who decides the round (H2's open questions)

| question | answer | source | grade |
|---|---|---|---|
| Who runs MP6's `objectives` script? | **Every console runs its own copy**, on its own valves. The intro branch and the 15 s / 17 s watch start follow that console's own `player_team` (H2 §C1). | H2 §C; the script's per-team branches | STRONG |
| Whose result counts? | **The host's.** `FUN_002aa490` (D:L151130-151158) turns the local `mission_complete/failure/abort/timeout` valves into end states on every console. Only when `DAT_0045a0c0` is set does `FUN_002a9b30` (D:L150629-150669) wait 3.0 s and then: copy the host's `mp_score00` / `mp_score08` / `mp_winner` valves (names read from the ELF at 0x3f0fd8/0x3f0fe8/0x3f0ff8) into the net game object +0x120/+0x124/+0x128; increment the round count (+0x11c); set the net state +0x113 to 6 (game over) or 4; and push the GameObject (`FUN_002c00f0`). Clients take the result from the replicated GameObject (M2 matrix row 15). | decomp | STRONG |
| Does the 15 s / 17 s watch start depend on the host's team? | Yes for the outcome: the decision that is broadcast is the host's script's. The host is on the SEALs by default (research 91 §7, `FUN_002c5450` L166238-166262), so the 17 s start normally rules. A client's own script can post its lines at its own time. | as above | STRONG (logic); timing owed by H2's U7 capture |
| Can a client's script see the hostage's state? | Yes. `ai::INSTATE(Hostage, 9)` on a client asks the remote body's controller for its state. CRemoteCtrl's slot +0xa4 is `FUN_005e6a50` (vtable 0x669590 + 0xa4), which returns byte 0 of the replicated AI word (D:L497542-497556). On the host the same slot is CSealCtrlAi's current state (0x574800). `INREGION` tests the remote body's interpolated position. The `mp_hostages_by_*` valves are counted on every console (§2.3 step 6). | decomp + `vt.py` | STRONG |
| `aiteam_00/08` on clients | H2: counted by `FUN_002b23a0` on the host or offline. How a client's script sees them was not traced here. Harry's GameObject lists "SealsAliveCount" (+0x58) and "TerrAliveCount" (+0x5c) valves, a lead. | lead | UNRESOLVED |

### 2.7 Can a rescued hostage be killed and counted twice?
- **The kill counters do not exclude rescued hostages.**
  - `FUN_0059ee20` (D:L458072-458145) checks only flag 0x20000 and the killer's side before adding to
    `mp_hostages_by_seals`/`_turds`. It does not check AI state 0x11.
  - So if a rescued hostage can still take damage, its death is counted as a kill too. The script would then count that
    hostage in `freecount` (`Rescue1/2/3`) **and** in `killcount` (`SealKill*`/`HostKill*`).
  - The rescue itself is counted once per hostage, because each `Rescue` sequence stops after it fires (H2 §C).
  - Grade PROVEN for the counting code.
- **Whether a rescued hostage can still be hit** (does the `rescued` state 0x11 / `CAiSRescued` remove, hide or protect
  the body?) is not read here. It is H1's (the AI state); UNRESOLVED.
- **Narrowed from the damage side (after H1 U1).** H1 found that the MP rescue sets body +0x105c bit 3
  (`FUN_005594b0`, CAiSRescued vtable 0x669260 slot +0x08). None of the damage functions on the hit path tests that bit:
  - `HitPacketHandler` `FUN_002bbbd0` (D:L160807-160846): tests the game state and IsRemote only;
  - `FUN_005a1b80` (D:L459490-459618): tests +0xe1 bit 4 and the cause class;
  - `FUN_005a5830` (part damage, D:L461469-461546): no +0x105c read;
  - `FUN_005a5a80` (the projectile-hit dispatch): tests +0xe1 and IsRemote.
  - So **once a Hit reaches the host, a rescued hostage takes damage and its kill counts** (STRONG; `FUN_003c7400`,
    the armour step, is not read).
  - +0x105c is **not replicated**: the SealObject carries +0x105d bits only, through the AI word bit 28 and
    `FUN_00590ac0`'s +0x105d bit 1. So only the host's body has the bit.
  - What is still open is the **hit test** on the shooter's console: whether the projectile-vs-body intersect skips a
    rescued body (H1 notes the body tick `FUN_00580360` is skipped while the bit is set, but only on the host). Owed: the
    intersect routine that feeds `FUN_005a5a80`, or H1's U1 capture done from a **client** shooter as well as the host.
- For the port, until H1 settles it: a server-side guard "a hostage in state 0x11 takes no damage" would be an
  ADAPTATION and must be marked so.

### 2.8 H1's functions, where each runs, and what carries its effect to the other consoles

"Host only" means the code runs on the console whose hostage controller is a `CSealCtrlAi`. Online that is only the
session master, because the hostage objects are host-created (§1). Every other console holds a `CRemoteCtrl`, whose
vtable slots are different functions.

| H1 function / effect | runs on | carried to the other consoles by | source |
|---|---|---|---|
| State factory `FUN_005f6550`; initial state 0x17 `CAiSHostage` | host only (the AI controller is built only there; remote bodies get vtable 0x669590, D:L455436) | AI word bits 0-7 = 0x17, field 0x10 of the SealObject | §3.2 |
| Order prompt (20-cell range, crosshair, team bit; FOLLOW only without a leader, HOLD only to the leader) | **the ordering player's console**: it tests its local copy of the hostage. The leader known there is the AI word's bits 8-23 (state 9). The `FUN_005e69a0` checks run on the CRemoteCtrl per M2 | -- (local UI) | H1; M2 §8.3 |
| Issuing FOLLOW (4) / HOLDPOS (5) | the ordering console -> host | **`AI Orders`** (static 0x440e28, 8 bytes, to the session master), unless the orderer *is* the host | §2.1 steps 2-4 |
| `CSealCtrlAi::OnCommand` `FUN_0058fbe0`, `TryControlHostage` `FUN_005fd010`, `ControlHostageAction` `FUN_005fcf10` (leader pointer +0x5d4, leader id +0x5d8, leader's count +0x520) | host only | leader id in **AI word bits 8-23** while in state 9 (and +0x5d8 in the other states). The leader's +0x520 count is **not replicated** (no field) | §3.2; D:L509476-509527 |
| "A hostage is being escorted" radio (CMD_MP_ESCORTEE_FOLLOWING 0x2b) | host issues it | **`Message`** (static 0x440e38) to all | §2.1 step 7 |
| `CAiSFollow` path (75-cell trail, A*, arrive 18.75, 1.2x leader speed, always standing) | host only | the result only: position (3 × f32), heading, sticks (s8 ×3), pose bytes 0x7e-0x80 in the SealObject at ≤10 Hz per field online | §3.1, §5 |
| Leader death -> release (`FUN_00547af0`, the follower's tick) | the release itself takes effect only on the host (only there does `GetSealCtrlAi` return an AI) | the new AI word (state leaves 9; bits 8-23 keep +0x5d8) | §2.5 |
| Rescue: zone kind 1 `FUN_0052a200` on a hostage ever led -> state 0x11, credit to the last leader | host only (`FUN_0056f970` = CSealCtrlAi PostTick) | AI word = 0x11 with the rescuer's id in bits 8-23. Each receiver credits its own player (`FUN_0056f4c0` -> `FUN_00545480`) | §2.4 |
| `CAiSRescued` enter `FUN_005594b0` (body +0x105c bit 3) | host only | **not replicated** | §2.7 |
| "Hostages ignore AI events online" | host only (the only AI) | -- | H1 |
| Hostage animation set / stance (`Cower`: SETANIMSET, STANCE) | the AI's console; the map's `Hostage_start` animations run per console (H2/H1) | pose bytes 0x7e/0x7f/0x80, AI word bits 24-29 (blend nibble, +0x105d bit 0, the bit-29 pose routine) | §3.1, §3.2 |
| Host leaves | new host | rebuilds the AI from the AI word (`FUN_0056f210`); H1 cites the same function | §2.5 |

## 3. What is sent (field tables)

### 3.1 The SealObject fields that matter for a hostage
Full list with policies: `scratch/H3/sealfields.tsv` (generated by `sealfields.py`). Writer: `FUN_002bd640` D:L161921-162073
(owner, every tick from CSealCtrlAi Tick `FUN_0056fd00` and PostMortemPreTick `FUN_0056ee80`, D:L432716/433518).
Reader: `FUN_002be150` D:L162249-162460.

The names below come from what r0001 does with each field. The SOCOM 1 demo's field statics follow a different order
after the sixteenth, so demo names are used only where the demo's struct offset and the r0001 meaning agree (demo list:
`demo_regseal.txt`). M2 §4.1 has the same table; it is repeated here for the hostage columns.

| off | type | content on the host (writer) | on a receiving console (reader) | online policy |
|---|---|---|---|---|
| 0x00/04/08 | f32 ×3 | position body+0x1c/20/24 | CRemoteCtrl target +0x1fc..+0x204 (D:L162256-162284) | 100 ms, any change |
| 0x64 | u16 | heading atan2(fwd)·10430.06 (65536/turn, D:L161968) | ·9.58767e-05 -> quat at ctrl+0x210 (D:L162286-162293) | 100 ms, any change |
| 0x7a/7b/7c | s8 | controller sticks +8/+0x10/+0xc ·127 | ctrl vtable+0x20 SetThrottle(axis 0/2/1) ·1/127 (D:L162295-162309) | 100 ms |
| 0x7d | s8 | body+0x228 ·128 | ctrl[0x8a] after a clamp (D:L162411-162415) | 100 ms |
| 0x7e | u8 | `FUN_005e0010(body)` (pose bits) | `FUN_005dfe30` (D:L162310) | 100 ms |
| 0x7f/0x80 | u8 | body+0x374/+0x375 | copied (D:L162314-162320) | 100 ms |
| 0x82-0x87 | u8 ×6 | part health cur/max ·255 | `FUN_005a5790(v/255, body, part 0,3,5,4,2,1)` | 100 ms |
| 0x88 | u8 | body+0xf7a life state | `FUN_00544210` SetLife (D:L162349) | every pass |
| 0x76 | u16 | killer id body+0xfbc | `FUN_00547aa0` (kill bookkeeping, §2.3) | every pass |
| 0x89 | u8 | cause body+0xfc0 | `FUN_00547a90` | every pass |
| 0x0c | u32 | body+200 flag word (0x20000 = hostage/escortee, research 91 §7) | `FUN_0029ed10` | 100 ms |
| **0x10** | **u32** | **AI word, controller vtable+0x6c** (§3.2) | **ctrl vtable+0x70 SetAiNetState** (D:L162386-162397) | 100 ms, any change |
| 0x78 | u16 | body+0xc (mission unit index) | used only at creation (selects the mission entity) | 100 ms |
| 0x14 | u8 ×32 | character type name | used at creation | 100 ms |
| 0x34 | u8 ×48 | kit (×2 registrations) | used at creation (skipped for 0x20000 bodies, D:L455441) | every pass |
| 0x74 | u16 | team/leader-ish short (D:L161944-161959) | **counter only, not applied** (D:L162399) | 100 ms |

The policies are decoded from the 0x400400 initializer (`sealfields.py`). Mode 1 = send on any change; mode 2 = send on
a change above a threshold.

- The interval clock is in milliseconds. `FUN_0063d2d8` (D:L552697) computes `sec·1000 + usec/1000`, and the library
  clock `DAT_00676698` advances by it (D:L527618-527619).
- A field is sent when `lastSent + interval < now` and its change test passes (`FUN_0061a488` D:L526669-526693,
  `FUN_0061acf0` D:L526957-527046).
- Position uses mode 2 with the callback pointer 0x2bd270 in the threshold slot. Read as a float that is 4.02e-39
  (`constants.txt`), so in effect any change is sent. The 4-unit test `FUN_002bd270` is never called; its only
  references are the two policy constructors (0x40043c, 0x400538). Grade STRONG; M2 agrees.

### 3.2 The AI word (struct +0x10) -- the hostage's replicated state

| bits | meaning | writer (host, `FUN_0056f6c0` D:L432863-432922) | reader (remote, `FUN_0056f4c0` D:L432812-432855; `CRemoteCtrl::PreTick` D:L497411-497416) |
|---|---|---|---|
| 0-7 | AI state id. SOCOM II table `FUN_00575490` D:L435860-435990: 9 `follow`, 0x11 `rescued`, 0x17 `hostage` (full list in that function) | controller vtable+0xa4 (CSealCtrlAi 0x574800) | stored at ctrl+0x110. A change to 0x11 credits the rescuer (§2.4) |
| 8-23 | state 0x11: rescuer id (rescued-state +0x5c). State 9: leader id (`*(ai+0x5d4)+4`). Otherwise: ai+0x5d8 (the last leader id) | as left | `GetEntityById` for 0x11 (D:L432843). Host migration uses it for 9 and other states (§2.5) |
| 24-27 | animation blend n: 15 = off, else round((1−a)·15) of anim +0x9c (D:L432905-432913) | | anim +0x9c = 1 − n/15; layer on iff n ≠ 15 (D:L432833-432834, D:L497415-497416) |
| 28 | body+0x105d bit 0 | | copied to body+0x105d bit 0 (D:L432851-432854) |
| 29 | body+0xe1 bit 4 and flag word & 0x20000 | | with body+0xe1 bit 4 -> `FUN_005434b0(body,4,0)`, else `FUN_00543480` (D:L432835-432841) |
| 30 | not set by the AI writer | | with health > 0: `FUN_005477a0`, vtable+0x90(8), and on the host `FUN_002b4440(client)` (D:L162390-162396) |

Grade: PROVEN as a code read. What bits 28/29 and the routines they drive mean (kneel/restrained pose?) is H1's.

### 3.3 The two messages a hostage interaction uses

| message (static) | bytes | layout | to | source |
|---|---|---|---|---|
| AI Orders (0x440e28) | 8 | +0 u16 issuer id, +2 u16 hostage id, +4 u8 cmd (4 FOLLOW / 5 HOLDPOS), +5/+6 low byte of int(pos.x)/int(pos.z), only for cmd 4 with a position (never from the CRemoteCtrl path, which passes none), +7 unused | session master | `FUN_002bb970` disasm 0x2bb9c8-0x2bba54. Note: the registered field descriptor lists only (u16, u8) (D:L159065-159067; disasm 0x2b8930-0x2b8978); the send size is 8 |
| Hit (0x440e00) | 8 | +0 u16 shooter id, +2 u16 victim id, +4 u8 cause, +5 u8 damage (clamped), +6 u8 force·20 (clamped), +7 bits 0-3 part, bit 4 flag | everyone (−1) | `FUN_002bbda0` D:L160852-160891; reader D:L160825-160843 |
| Message (0x440e38) | 6 | +0 u16 sender id, +2 s16 target (−1 all, −2 SEALs, −3 terrorists, else an id), +4 u16 command (0x2b for following) | everyone | `FUN_002bad40` D:L160238-160249 |

## 4. Rate, transport, reliability

- **Rate.** The owner refreshes the struct every tick. The library sends each changed field at most every 100 ms online
  (200 ms on LAN, §0.2.1). Life/killer/cause go every pass online (interval 0). Fields of one object are packed into
  one FieldUpdate (`FUN_0061a6d8` D:L526711-526752). Grade STRONG.
- **Application messages** (AI Orders, Hit, Message) are queued (`zNetSendApplicationMessage` `FUN_0030cef0`, bool 0 ->
  list +0x1248, D:L209730-209741) and flushed once per `zNetUpdate` (`FUN_0030d900` D:L210193-210197).
- **Transport.** `FUN_006158f8` D:L523502-523586: connection 0 or 0xffff -> `FUN_00615660` (RT send with flags from
  `FUN_0061d478`: 0x10 -> 2, 0x40 -> 4, 0x80 -> 1). Any other connection -> `FUN_006157e0` (`NetSendMessageByTCP` in our
  names). Which connection index the game uses in a round (`DAT_0045a1b4` for messages, `DAT_00651178` for objects) is
  **UNRESOLVED**.
  - In the RT queue `FUN_0063e928` D:L553673-553759, option 1 bypasses coalescing and option 4 starts the aggregation
    timer.
  - No retransmission was read. Reliability is therefore UNRESOLVED.
  - Research 18 measured that a *playing* PCSX2 pair carries the spawn ObjectUpdates (e.g. "SealObject") as DME TCP
    `APP_BROADCAST`, and nothing but echoes after that. So the in-round stream does not use DME TCP (STRONG,
    observation).

## 5. How a remote console draws the hostage
`CRemoteCtrl::PreTick` `FUN_005e6400` D:L497399-497461:

- If |target − body|² > 1000 (31.6 units), it teleports (vtable+0x3c).
- Else, if |Δy| > 5, it snaps height to target.y + 0.25.
- Else it moves the body by `lerp(t, body, target)`:
  - `t = expf(−dt · 50)`, recomputed when the net clock changes (D:L497406-497409). `expf` is `FUN_001af6f8`.
  - 50.0 is GameObject +0x118, set by `FUN_002a76d0` D:L149520 (reCOM `m_pos_smooth = 50.0f` agrees).
  - t = 1 (exact) when stick axes 0 and 1 are both 0.
  - At 60 Hz, t = 0.435 (`constants.txt`).
- Orientation: slerp toward ctrl+0x210 with `min(2t, 1)` (D:L497462-497467).
- Between updates the body walks under its own locomotion from the replicated sticks. The remote controller is built
  with +0x250 = 0.001 and +0x254 = 2.0 (D:L455437-455438; their use is not read).
- Animation comes from the replicated sticks, pose bytes and the AI word's blend nibble. **Which clip a remote shows for
  `hostage`/`rescued` states is H1's** (UNRESOLVED here).

Note the oddity as read: t falls as dt rises (a slow frame pulls less), and t is the weight of the *target*.

## 6. Late join and spectators
- **Late join.** `FUN_0061ba10` D:L527428-527492 (the library's per-pump object sender). For each object this console
  owns: never sent whole -> broadcast whole. Otherwise, for every client whose +0x29 byte is 1 (newly accepted), send it
  the whole object, then field deltas. The flags are cleared after. A late joiner therefore gets every hostage in its
  current state, including the AI word (state, leader, rescued). Grade STRONG; M2 agrees.
  - Objects that arrive before the joiner's map is loaded wait in the queue (§1).
  - On creation the remote sets `<entity>_valve_alive` = 1. A hostage that is already dead arrives with its life byte
    and health. Whether a dead hostage's object still exists for a late joiner (it is not deleted on death) is
    BELIEVED yes.
- **Spectator.** A spectating console gets the same objects. Its orders are blocked when its persona flag 0x10000 is set
  (`FUN_002c2fd0` in `FUN_002bb970`, and the same guard in `FUN_002bd640` D:L161921). That 0x10000 means "ghost /
  spectator" is BELIEVED. No hostage-specific spectator rule was found.

## 7. The port

### 7.1 What the port has
- One authoritative Node room per map (`$PORT/packages/match/src/room.ts`). It runs every player's mover from commands
  at 60 Hz and sends snapshots at 30 Hz (`protocol.ts` `TICK_HZ`, `SNAPSHOT_HZ`).
- Hits are decided server-side with a 200 ms rewind (`MAX_REWIND_MS`, `shotCone.ts`).
- Reliable events go as JSON text frames.
- No AI and no hostage exist: `room.ts`, `server.ts`, `viewer/src/net/*` and `remotePlayers.ts` have 0 hits for
  hostage/escort/npc.
- The rooms play SUPPRESSION's rules on every map (`rules.ts` `OBJECTIVE_BY_MAP_PLACEHOLDER`).

### 7.2 Mapping (SOURCED = the original; ADAPTATION = the port's choice, MISSION.md parity rule 5)

| original (sourced) | port (adaptation) | observable difference |
|---|---|---|
| Host runs hostage AI; others draw a CRemoteCtrl body | **Server runs the hostage AI** (H1's state machine) every tick. The room is the host | None for a client. The original's host had zero lag on hostages and everyone else ~100 ms+RTT; in the port everyone sees the server's |
| AI Orders {issuer, hostage, cmd 4/5} to the host; host applies through the AI's OnCommand | Client event `{type:'hostageOrder', hostage:id, cmd:4\|5}` (issuer = the sender). Server validates (alive, SEAL, within H1's prompt rule: 20 AI-map cells (compare at 0x591f94), crosshair, team bit; FOLLOW only with no leader, HOLD only from the leader, not spectator) and applies it like `FUN_0058fbe0` case 4/5 | Original: a client's order took one round trip to the host and was never refused by the network. The server should only refuse what the original's local test refused (`FUN_005e69a0`: 5 -> `FUN_00591770`, 4 -> `FUN_00591ab0`, per M2) |
| SealObject fields for the hostage (pos, heading, sticks, health, life, killer, cause, AI word) | The hostage is a `BodyState` in the snapshot (id, feet, yaw, flags, stance, action) plus a **reliable** `hostageState` event on change: `{id, aiState, leaderId, rescuerId, blend?}`, i.e. bits 0-23 of the AI word | The port's 30 Hz snapshot is smoother than the original's ≤10 Hz online chase. Keep it (M2 §7 gives the same recommendation for players) |
| CMD_MP_ESCORTEE_FOLLOWING 0x2b sent to all by the host when a follow starts | Server event `{type:'radio', from:issuer, cmd:0x2b}` to all | none |
| Hit: shooter decides; victim's owner applies damage | Server decides (existing W3 ruling). Hostages added as targets with their character's hit volumes | Same as for players (M2 §7 "Hits") |
| Killer/cause in the victim's object; each console counts `mp_hostages_by_*` and plays 0x44; killer's console scores −2 / +3 | Server counts, scores (research 91: −2; terrorist +3 when game+0x111 == 3) and sends `kill` with `victimKind:'hostage'`. The client plays 0x44 and shows no kill-feed line | The original shows no kill-feed line for a hostage (§2.3 step 7); the port must also send none |
| Rescue: host AI, leader set + type-1 zone -> state 0x11, rescuer = last leader; each console credits its own player (+1 rescued, +3 score) | Server tests the zone each tick, sets the state, credits the rescuer (+1 `hostagesRescued`, +3 score) and sends `hostageState` with rescuerId | none |
| Leader dies -> host releases followers | Server: on a body's death, release every hostage it leads | none |
| Host leaves -> hostages migrate | n/a (the server does not leave) | port is strictly better |
| Leader leaves | Server: on a player's removal, release its hostages (ADAPTATION until the original's path, §8 item 3, is read) | possibly none |
| Late join: whole objects | Welcome carries the hostages' bodies and current `hostageState` | none |

### 7.3 Proposed message set (all ADAPTATION; field meanings SOURCED as cited)
- Client -> server, reliable: `{type:'hostageOrder', hostage:number, cmd:4|5}` (cmd values = `CMD_FOLLOW` /
  `CMD_HOLDPOS`, D:L449904-449908).
- Server -> client:
  - Snapshot: the hostage's `BodyState` beside the players', with a distinct `id` space or `kind`.
  - Reliable: `{type:'hostageState', id, ai:number /* AI state id, table FUN_00575490 */, leader:number|null,
    rescuer:number|null}`.
  - `kill` gains `victimKind:'hostage'`.
  - `{type:'radio', from, cmd}` for 0x2b and 0x44.
  - The scoreboard gains `hostagesRescued` (stats +0x1c).
- First tests to write (server, `packages/server/test`):
  1. A SEAL within range sends `hostageOrder` cmd 4: the hostage's `leader` becomes the SEAL and its AI state 9, and a
     `radio 0x2b` is broadcast.
  2. Cmd 5 clears it (H1 for the exact state).
  3. A terrorist's order is refused (H1/H2 for the rule).
  4. The leader is killed -> the hostage is released.
  5. A hostage with a leader inside the rescue zone -> state 0x11, rescuer = leader, rescuer score +3.
  6. A hostage killed by a SEAL -> score −2, `mp_hostages_by_seals` +1, `kill.victimKind = 'hostage'`, no feed line.
  7. A late joiner's welcome carries every hostage with its state.

  *Built since (HX-1, and the orders' gates at HX-4a): `packages/central/test/roomHostageOrders.test.ts` (the orders in
  the room) and `packages/match/test/hostageOrders.test.ts` (the order, pure). Test 3 above does not hold: either side
  may order (`ORDER_SIDE_READING` 'none', `hostageOrders.test.ts` "the offer is the original's local test ...").*

## 8. UNRESOLVED and owed evidence

1. **Transport per message** (§4). Owed: a two-console hosted round on Desert Glory (MP6, a hostage map) with
   `PS2X_SOCOM2_NET_TRACE=1 PS2X_SOCOM2_NET_TRACE_ALL=1`. A non-host SEAL orders a hostage to follow, then shoots one.
   - Look for one class-2 record ("AI Orders") from the SEAL to the host: 8 bytes, byte 4 = 4.
   - Look for a "Hit" broadcast.
   - Look for the host's class-0 FieldUpdates for the hostage's object at ≤10/s per field.
   - Note on which socket (DME TCP, aux-UDP 50000/50001, or peer UDP) each one travels. Combine with M2 §9.1/§9.4.
   - Also peek `DAT_0045a1b4` and `DAT_00651178` in the round.
2. **`ComeFromLan` value online** (§0.2.1). Owed: peek `*(*(0x450058))+4` (the valve's short) in a hosted-server round:
   expected 0.
3. **Leader disconnect** (§2.5). Owed: read `FUN_005ed7b0` (unit removal, host) and the body vtable+0x90 handler for
   escortee release. Or a capture: the leader's console quits while a hostage follows; then peek the hostage's
   ai+0x5d4/0x5d8 on the host (the hostage body's controller is `*(body+0xc0)`).
4. **Do clients spawn mission hostages themselves?** Owed:
   - an RDRAM dump of the non-host console in an MP6 hostage round;
   - count the entity-list bodies (list head `DAT_004362e8`, kind byte +0x10 == 2) with flag word +200 & 0x20000;
   - check each one's controller vtable. Expected: only 0x669590 (CRemoteCtrl), and as many as the host's 0x6693f0.
5. **Meaning of AI-word bits 28/29 and of `FUN_005434b0`/`FUN_00543480`, and the remote's clip for state 0x17/0x11**
   (H1). Owed: the code read of those two functions, or an RDRAM capture of a remote hostage while kneeling and while
   following.
6. **The rescue zone query** `FUN_0052a200(0x66a1b0, 1, pos)`: that type 1 is the hostage extraction zone in MP6's data
   (H2's map data).
7. **The double CMD_MP_HOSTAGE_KILLED** (§2.3 note): read `FUN_005e7960` for de-duplication.

## 9. Sourced but not implemented (multiplayer)
- Hostage replication as a host-owned SealObject, the AI word, AI Orders forwarding, rescue/kill crediting: none in the
  port.
- The `Message` radio broadcast (targets −1/−2/−3/id), used for CMD_MP_ESCORTEE_FOLLOWING. M2 lists the others.
- Host-migration hand-over of AI (not needed for a server, recorded).
- The original's remote chase constants: snap² 1000, height snap 5 (+0.25), `expf(−50·dt)`, slerp `min(2t,1)`, field
  interval 100 ms online. Record only; see M2 §7.

## 10. Leads for other workstreams
- **H1:**
  - `FUN_0058fbe0` (CSealCtrlAi OnCommand) cases 4/5 (D:L450346-450410), the follow state object (+0x58 leader, +0x4a
    bits), `FUN_005fd050`, `FUN_0056f970` (the rescue test, the +0x36c timer that sets body+0x375 = 2), ai+0x42c bit
    0x200.
  - The AI state ids are in `FUN_00575490` (D:L435860-435990).
  - The remote-side state->animation path starts at ctrl+0x110.
- **H2:**
  - The game type byte game+0x111 == 3 that gives terrorists +3 (`FUN_00545390`).
  - The valves `mp_hostages_by_seals/_turds` (GameObject +0x38/+0x3c, zeroed at round start `FUN_002a6c50`).
  - `<entity>_valve_alive` (set 1 on remote creation, 0 on remote death), which the objectives scripts can read on every
    console.
  - The type-1 zone in `FUN_0052a200`.
- **M2:** §0.2 items 1-3.
- **Names for our csv (r0001):** `FUN_002bb970` NetSendAiOrders, `FUN_002bb8e0` AiOrdersPacketHandler, `FUN_002bbda0`
  SendHitMessage, `FUN_002bad40` SendMessageMessage, `FUN_002bac40` MessagePacketHandler, `FUN_002bdda0`
  CreateLocalSeal, `FUN_002bd640` UpdateLocalSeal, `FUN_002bf070` RemoteSealCreationCallback, `FUN_002bee10`
  RemoteSealUpdateCallback, `FUN_002be020` RemoteSealPostUpdateCallback, `FUN_002bef60` RemoteSealDeletionCallback,
  `FUN_0030d560` zNetGetGameSessionMasterClientIndex, `FUN_0030d5a0` zNetGetMyGameClientIndex, `FUN_0056f6c0`
  CSealCtrlAi::GetAiNetState, `FUN_0056f4c0` CRemoteCtrl::SetAiNetState, `FUN_0056f210` (remote -> local AI),
  `FUN_002bc080` (became session master), `FUN_00612e48` NetClientLeaves, `FUN_00613158` (elect session master),
  `FUN_0061ba10` SendClientNetObjectUpdates, `FUN_0061a800` NetSendObjectFullUpdate.
  - Pass: demo body-shape / call-site matches as cited above, most STRONG.

## 12. Verification (V2, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V2-verify-hostage.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V2/`). V2 verified H1, H2 and H3's implementation-critical claims. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V2, wave 2026-10-04. Read-only. My scripts and outputs are in `scratch/V2/` (see its `README.md`).

**Independence.** None of my scripts import the port's TypeScript parsers or H1/H2/H3's helpers. I wrote my own:
- a PT_LOAD ELF reader with capstone (`elf.py`);
- a binary `.rdr` decoder (`rdrbin.py`);
- a raw AIMAPS byte decoder (`aimaps_points.py`);
- a raw zAnim command-stream decoder for MP6's `objectives` (`zanim_raw.py`);
- a reader for the 2026-09-17 capture logs (`capture_0917.py`).

Decomp citations are r0001 `D:L<line>`.

**Which ELF the decomp matches.** `game/disc/socom2_game.elf` and `game/overlays/socom2_game.elf` are byte-identical (4,835,072 bytes, sha256 `06b83684719a78ad...`; the overlay's `repair.json` lists no repairs). The decomp's addresses match it:
- FUN_005f6550 and FUN_00601910 lie in the 0x4c5380 segment;
- the instruction at 0x591f94 is `sltiu v0,v0,0x14`, which is D:L451447's `< 0x14`;
- the vtable slots below point at the decomp's function addresses.

### 12.1 Verdicts

| # | claim (owner) | verdict | one-line reason |
|---|---|---|---|
| 25 | U1: can a rescued hostage still be killed? (H1/H3) | UNRESOLVED (narrowed) | The damage functions have no rescued test (agrees with H3). The 4 readers of body +0x105c bit 3 are a landing/fall handler, a sweep-contact damage and two zAnim/AI paths, not the bullet path. The bit is set only on the host. Hit-trace eligibility is unread. |
| H3-a | Only the host spawns and simulates hostages | CONFIRMED | `FUN_002b2e50` D:L156005 spawns map records only offline or on the session master (`DAT_0045a0c0`). This adds code support to H3's BELIEVED "clients do not spawn their own". |
| H3-b | Client FOLLOW/HOLD go to the host as an 8-byte AI Orders message; the host sends command 0x2b to all | CONFIRMED | `FUN_005e6a00` (only 4/5), `FUN_002bb970` (8 bytes, flags 0x40, to the session master; skipped for persona flag 0x10000), host `FUN_002bb8e0` (runs only while game +0x113 == 3, no re-check), `FUN_005e7f20` 0x2b -> `FUN_002bad40(id,-1,0x2b)`. |
| H3-c | The state word carries the AI state and the leader/rescuer id | CONFIRMED (content) / offset not re-derived | `FUN_0056f4c0` D:L432830-432848: low byte = state, bits 8-23 = rescuer on 0x11, byte 3 low nibble = blend, bit 5 = compass mark, bit 4 -> +0x105d bit 0. I did not re-derive that it sits at struct +0x10. |
| H3-d | Only the host applies hostage damage; each console counts kills | PARTLY CONFIRMED | Each console counts: `FUN_0059ee20`'s escortee branch is gated only on online and the game object (D:L458113-458139). Host-only damage application: not re-derived by me (UNVERIFIED). |
| H3-e | Rescue is the host's tick; each console credits its own player | CONFIRMED | Host: `FUN_0056f970`. Remote: `FUN_0056f4c0` -> `FUN_00545480`, whose +3 is local-gated. |
| H3-f | Only the host's objectives result ends the round | CONFIRMED | `FUN_002a9b30` host branch D:L150629-150669: after 3.0 s it copies the result valves and sets game +0x113 to 4 or 6. |
| H3-g | The 2026-09-17 Desert Glory capture holds the host byte | CONFIRMED; no hostage state in it | A's word at 0x45a0c0 = 0x01010101, B's = 0x01010100. The logs peek only fixed addresses: the local body, its CSealCtrl, ten script valves and globals. No hostage body is peeked, so no hostage state can be read. What it does give: §H3-g. |
| H3-h | U1: no rescued check in damage; +0x105c not replicated | CONFIRMED | No reader of bit 3 in `FUN_005a5a80`/`FUN_005a5830`. The bit is set only by `CAiSRescued::OnSignal(0)` online (`FUN_005594b0` D:L422314). Remote hostages run `CRemoteCtrl`, never CAiSRescued, so on clients the bit stays 0. |

### 12.2 Claim 25: U1: is a rescued hostage still killable?

- **Readers of body +0x105c bit 3.** A grep of every `0x105c` read finds exactly four bit-3 readers (`<<0x3c`):
  - `FUN_003acc10` D:L302841: a sweep-contact damage, `FUN_005ac620(1.0)` + `FUN_005a54d0(body,3,7)`; skipped if rescued;
  - `FUN_00580360` D:L441923: not "the body tick". It is called from two landing points (D:L418166 when velocity is zero, and D:L466914). It runs `FUN_005ac1f0(dt*1.2)` and, if the body is dead, selects the death animation `FUN_005a0950(...,3,2)`. Skipped if rescued;
  - `FUN_005cba20` D:L483087 (an AI perception branch);
  - `FUN_005d2f30` D:L487241 (a zAnim AI command: rescued -> `FUN_005a2690(body,x,0)`, else flags 8 + `FUN_005477a0` + `FUN_005a5430`).
- **The bullet path.** `FUN_005a5a80` and `FUN_005a5830` have none. I agree with H3.
- **Not replicated.** On clients the hostage runs `CRemoteCtrl` and never enters CAiSRescued, so the bit stays 0 there. (`FUN_0056f4c0` copies only byte-3 bit 4 into +0x105d bit 0.)
- **What remains.** Whether the shot trace selects a rescued body is unread. Owed, as H1/H3 wrote: on MP6, lead a hostage into Safety, shoot it from the host **and** from a client, and read body +0x1044, +0xe1 bit 4 and +0x105c.
- **Implementation.** Until then, keep the rescued hostage damageable. The code has no rescued guard in damage, and the kill counters (§9) would then count it.
- **Verdict.** UNRESOLVED (narrowed).

### 12.3 Claim H3-a: Host-only spawn and simulation

- **Gate.** `FUN_002b2e50` (the round-setup record spawner, called D:L149181/151860/152172) does its work only if `DAT_0045a0c1 == 0` (offline) or `DAT_0045a0c0 != 0` (host) (D:L156005).
- **No double spawn.** On the host it skips creation if any AI body already exists (vtable +0x30 check, D:L156021-156031).
- **Other paths.** `FUN_002b2d20` has no host gate, but it is only reached from this spawner and from zAnim/actor paths (D:L155525, 493182, 493201) that I did not audit.
- **Verdict.** CONFIRMED (STRONG).

### 12.4 Claim H3-b: AI Orders and 0x2b

- **The forward.** `FUN_005e6a00` forwards cmds 4 and 5 only. `FUN_002bb970` packs {issuer id u16, hostage id u16, cmd u8, (pos bytes for cmd 4 with a position)} and sends 8 bytes, flags 0x40, to `FUN_0030d560(0x45a0c0)`.
- **The host.** `FUN_002bb8e0` calls `FUN_00590ac0(hostage, issuer, cmd)` when game +0x113 == 3, **without** re-running CanAcceptCommand. The host trusts the client's offer test.
- **0x2b.** OnCommand case 4 online calls `FUN_005e7f20(issuer,0x2b,0)` -> `FUN_002bad40(id,-1,0x2b)` + local `FUN_005e7960`.
- **Verdict.** CONFIRMED.

### 12.5 Claim H3-g: What the 2026-09-17 capture holds (`out_capture_0917.txt`)

- **What is peeked.** Every `[peek]` line (about 2,990 per log) reads fixed addresses: 0x416054, 0x4365c0, 0x45a0c0, 0x3df1b0, 0x45a1c8, 0x408f10, 0x408c58, the local body (A 0x17c7ba0, B 0x187abc0, vtable 0x6691a0) with its ctrl (vtable 0x6694b0 = CSealCtrl), and ten valves at 0x694acc...
- **No hostage.** No hostage body or ctrl is peeked, so no hostage state is readable.
- **What it does establish:**
  - (a) the host byte: A = 1, B = 0;
  - (b) the SEAL/Terrorist team words at body +0xc8 (§2);
  - (c) the exact spawn cell centre and the +1.0 lift (§3);
  - (d) `aiteam_00` = `aiteam_08` = 1 on the host (§14);
  - (e) `player_team` 0 on A and 8 on B.
- **Open.** The valve named `mp_major_game` reads 4 on A and 5 on B. Its meaning is unresolved; do not read it as the game type.

## 13. Verification (V3, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V3-verify-modes-net.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V3/`). V3 verified M1 and M2 and ruled the H3-M2 disputes. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V3, research wave 2026-10-04. Read-only. Scripts and outputs: `scratch/V3/` (its `README.md` says what each
prints). `D:L<n>` = a line of `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001). Where I could,
I re-derived each claim by a route other than the author's: my own ELF reads and emulation, my own decoding of the raw
script words, the per-map scripts instead of `missionlist.rdr`, the dialog's own script instead of the note's label.

### 13.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| 11 | Hostages = host-created Seal objects; non-host orders 4/5 forwarded as AI Orders; follow/stop bookkeeping host-local | **CONFIRMED-WITH-CORRECTION** | The three statements are right. M2's corollaries are wrong. The follow state *is* replicated, in the AI word (SealObject +0x10), not through field 0x74, which a receiver never applies. The rescue score comes from the AI-state 0x11 change, not from an "Action Points" award. |

### 13.2 Disputes (H3 vs M2), ruled

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

### 13.3 Claim 11: Hostages on the net -- CONFIRMED-WITH-CORRECTION

- **Creation:** `FUN_002b7a90` (D:L158514-158556). A kind-2 body whose controller vtable +0x30 is true becomes a
  SealObject through `FUN_002bdda0(body, 0)`, only when `DAT_0045a0c1` and `DAT_0045a0c0` are both set. CSealCtrlAi
  +0x30 (0x669420) = 0x575c40 (H3: `li v0,1`).
- **Forwarding:** `FUN_005e6a00` forwards only commands 4 and 5 to `FUN_002bb970` (AI Orders → session master).
- **Bookkeeping:** `ControlHostageAction`/`TryControlHostage` send nothing. CONFIRMED.
- **Correction:** M2 §8.4 and §8.5 conclusions are wrong; see Disputes (b) and (c).
  - The follow and rescue state replicates in the AI word.
  - Every console credits its own player's rescue from that word.
