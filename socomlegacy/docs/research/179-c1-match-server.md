# 179 -- C1-match-server -- the multiplayer match and server side: every placeholder and reading, sourced

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/C1-match-server.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V1 (`research-wave-2026-10-04/V1-verify-core-combat.md`) has landed and is folded in as §13.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

**Overridden in part (research 206 §1):** friendly fire is "game-info bit 0" (with research 91) -- true of the lobby's RulesSet only; in-game it is bit 0x20 of byte 0x19 (V3).

**Overridden in part (research 206 §1):** the friendly-fire default conflict -- both are true: a new setting starts at 0 ("disabled", capture A_49); RESTORE DEFAULTS sets 1 ("enabled"); the create-game script's default is on (V1 #5, R2-MN).

**Overridden in part (research 206 §1):** the hit packet's type 0x40 -- 0x40 is passed by every send; the hit's type is `DAT_00440e00` (V1 #7).

**Corrected in part (web sprint 25 PF-10, 2026-10-04; a reading, pending review):** §6.14's auto-comms -- 0x27, 0x28 and the VIP's 0x44 -- are never posted in a match -- `FUN_005e7960` (D:L498028-498236) looks the comm up in the speaker's own character's `multiplayer` list (`FUN_0053bbd0`, the record's `+0x3a0`), not in `orders.rdr`'s table, and no character of `character.rdr` lists 0x27, 0x28 or 0x44 (the lookup compares case-folded, `FUN_00198b80`), so the line formats empty (0x662798) and nothing is posted or played (`KILL_AUTOCOMM_READING`, `packages/viewer/src/netPage.ts`; the dev-disc test `packages/viewer/test/killAutoComm.test.ts`). §8.15's death voice stands, and no multiplayer character names `CHRSND_DEATH_QUIET`: a head shot is silent in a match (`packages/viewer/test/deathVoice.test.ts`); and it passes `FUN_0053b710`'s 3 s voice gate, which the hurt voice of every survived health drop closes (`FUN_00597b00`), so a death within 3 s of one is silent too (`VOICE_GATE_S`, `packages/central/test/room.test.ts`).

Research agent C1, research wave 2026-10-04. Read-only; nothing built or run; nothing written outside
`research-wave-2026-10-04/`. `$PORT` = the `agent/online` snapshot
(`$PORT`).
`D:L<n>` = a line of `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001); addresses r0001 unless
marked r0004. Grades per BRIEF.md rule 7. The work was done in six parts (A1 vote/ban/team/lobby, A2 server policies
and the wire, B damage, C spawn and round flow, D round screens, E bodies/equipment/doors); each part's sections
follow below in the brief's format, with their scripts under `scratch/C1/<part>/` (each with a `README.txt`). The
ledger is `ledger-C1.tsv` (132 rows); `scratch/C1/assemble.py` builds it from `scratch/C1/parts/*.tsv` and checks that
every one of the 72 C1 ledger names has a row (none missing).

**Inventory.** 72 ledger names (`ledger_by_cluster.tsv`) + 30 note-only gaps from research 91 §16/§17/§18/§23, 94, 151
+ 30 unnamed code comments from the sweep of the 47 files (`scratch/C1/sweep_unnamed.py` -> `sweep_unnamed.txt`;
`inv_names2.py` -> `inv_names2.txt` lists every source and note line naming each ledger name).

**Counts (132 rows):** RESOLVED 63, PARTIAL 22, UNRESOLVED 3, NOT-A-GAP 44. NOT-A-GAP is mostly the match
server's own tolerances and policies (the original is peer to peer with a session host and no referee), retired names,
and robustness comments.

## 1. The findings that matter most (multiplayer gameplay first)

1. **A respawn match is one 20-minute round** (C, PROVEN). The Create Game script (`UIZANIM.ZAR` set `dlgCreateGame.rdr`,
   anim `set_respawn_valve`) sets `RTimeValve` = 20 and `RCountValve` = 1 when respawn is switched on, which map to
   `mp_max_round_time` = 1200 and `mp_max_rounds` = 1 (`scratch/C1/C/dlgCreateGame_ui.out` L438-449, L826-852; re-read
   by me). The banner reads "STARTING ROUND 1 OF 1". Research 91 §18.2.2's "6 minutes, 4-10 selectable" for respawn
   was the classic default (RTime 6, RCount 11, L515-516) and is wrong for respawn; the owner's 2026-09-29 ruling on
   the respawn banner rested on it.
2. **Friendly fire off, enforced** (B, STRONG). One flag `DAT_0044cdb8` (written from `mp_friendly_fire` by
   `FUN_002c00f0`/`FUN_002c0850`), one reader: `CZSealBody::OnWeaponHit` (0x5ac670, absent from the decomp, read by
   disassembly) drops any hit whose projectile owner is another player sharing a team bit with the victim -- bullets,
   launched rounds and blasts, before damage, knock and blast queue; self-hits pass; the owner's team is read at the
   hit. Re-run by me: `B/ff_trace.py` reproduces `ff_trace.out` byte for byte.
3. **Spawn selection** (C, STRONG). The player slot `+0xfc8` is the console's DME client index; a classic round start
   takes AIMAPS record `clientIndex % count`; a respawn uses the block of `count/24` records from `clientIndex*(count/24)`
   and picks by the dead enemy bodies, the block's first with no enemy. The port searches the whole side. And the
   **slot height is in AIMAPS.MPS** (bits 9..18 of the cell word over the map's y range), matching four measured feet
   within 1.1 u -- `aimaps.ts`' estimates can go.
4. **Damage on the wire** (B). Online shotgun pellets apply the raw `ImpactDamage` (2.5, no x14, no falloff) --
   `SHOTGUN_MP_PELLET_DAMAGE_SCALE_READING` should be `'raw'` (STRONG; a large balance change for the owner to see);
   bullets **pass through bodies** (range kept x (1 + 0.1 x piercing) x PERSON 0.97; the room stops at the first body);
   the hit packet clamps damage to an integer 0..255 (PROVEN); the shotgun knocks back (`body+0x1314..0x1324`, radius
   100); the claymore cone is measured at the feet (the room is right, the page's +10 wrong).
5. **The vote kick and the ban** (A1). The kick test runs on the target's console at the start of every ROUND COMPLETE
   and GAME COMPLETE (READERX `dlgMultiplayerRound`/`Final` source), with the strict majority of the team as it is then
   (PROVEN); `BanSelfFromGame` sends `MediusBanPlayer` on the player's own account and the game's world id, with a field
   of 120 whose unit is unread -- the ban is the server's, per account and game (STRONG).
6. **`mp_penalty`** (A1, PROVEN): on the hostage maps (MP6, MP10, MP11, MP71) each SEAL hostage kill adds 1; the host
   cuts the round by 60 s per point, never below 1 s (`FUN_002a9ee0` D:L150716-150719).
7. **The round screens are on the disc** (D, PROVEN). `RUN/UI/READERX.ZAR` holds the SOCOM II `dlgMultiplayerRound`,
   `Final`, `FinalReally` (+ `dlgExitState`) layouts with their scripts in source form; every `roundScreens.ts`
   placeholder now has a value. The list columns are **SCORE, KILLS, DEATHS** (the port shows KILLS, DEATHS, SCORE).
8. **The ARMORY's profile re-validation** (A2, PROVEN): a stored type outside the side's four becomes type 1 / 5; a
   refused item is skipped, leaving the type's default in that slot only.
9. **Bodies** (E): two death clips are swapped (`Crawl death01` = `death_stand_groin02`, `02` = `groin01`; re-run by
   me); "Prone cover" exists (`guard_prone_cover`) and is networked; the launcher raise is 1.4155 s from the rifle /
   1.3776 s from the pistol (port 1.2388); a C4 plant needs the same target under the crosshair for 0.2 s, not a
   still SEAL; a blast does knock a climbing SEAL off.
10. **The original's in-game packet registry** (A2, PROVEN names and sizes, `FUN_002b8660` D:L158940-159171): 24
    packet types, of which the port has no counterpart for Message (radio/taunts), Spec Vote, Team Switch / All
    Switch, the dropped-weapon pick-up quartet, ClimbAsk/ClimbOK (a host-arbitrated climb), Bomb, Alert, Action Points,
    E3 Index.

## 2. The 30 Hz game frame (the coordinator's cross-cluster lead, checked)

Verified: `DAT_003e1400` = 30 (0x1e) in the r0001 ELF (`c1lib.elf1().word(0x3e1400)`); desktop `docs/KNOWN.md` L134
agrees ("The game targets 30 fps (two VBlanks) ... 33.4 ms budget"); desktop research 73 (`73-mission-frame-time.md`)
measures the recompilation's host cost (5,703 VBlanks in 190 s, 30.0 a second, its §"The sampler") and does not
disagree. Part C reached the same conclusion independently for `FLIGHT_TICK_READING` (the projectile steps once a
game frame with the frame's dt, so about 1/30 s, not 1/60; PARTIAL pending a per-frame grenade capture).
In C1's area: the room and the page step at `TICK_HZ` = 60 (`net/protocol.ts:70`) -- the port's own simulation rate,
whose per-tick integrations are C2's (mover) and C3's (grenades) to re-read; the C1 values sourced in seconds (clip
lengths, the 0.2 s C4 settle, the vote/round script WAITs, the death camera's rad/s, the body fade's 0.1/s) are
unaffected except that the game samples them on a 33.4 ms frame. `STANCE_CHANGE_TICKS` (A2) is stated in the port's
60 Hz ticks; at the game's rate the three transitions are 19 / 26 / 29 frames.

## 3. Reconciliations between parts
- **`+0xfd1` / `+0xfd2`.** A1: `+0xfd1` is a departed flag (not the ghost flag). D: the round lists and the MVP skip
  players with `+0xfd2` set. Research 91 §16 already read `FUN_00223970` L76148 copying `+0xfd1` to `+0xfd2`: the two
  agree -- departed players are left off the round screens; ghosts are listed.
- **Harry62's data labels at r0004 0x4759xx..0x476xxx** (`PacketType*`, `m_allow_friendly_fire`, `m_VotedOff`, ...) are
  the SOCOM 1 demo's symbol addresses (B, `thunk_check.out`); no lui/lo pair in either SOCOM II ELF forms an address
  in 0x462000..0x47f000 (A2's `map_data.py` and B's `range_scan.py` agree). The live packet-ID words are r0004
  0x44d820 + 8k = r0001 0x440e00 + 8k. Harry's function labels stay good.
- **The friendly-fire default** -- for whoever owns it (M1): the Create Game RESTORE DEFAULTS sets `mp_friendly_fire` = 1,
  which the same screen captions "enabled" (C), while capture frame `A_49` shows "Friendly Fire is disabled." (research
  91b). Unreconciled here; B's enforcement reads the flag's meaning (non-zero = FF allowed) from the gate.
- **Map/mode research cross-check.** C's per-map `objectives` table was checked against M1's report and the owner's
  untracked working-tree notes (WT-96 ([171](171-crossroads-demolition-and-bridges.md))/98/99/101); it agrees, and adds six maps they did not read.

## 4. Verification log (re-runs by me)
- `B/ff_trace.py` re-run: identical to `ff_trace.out`.
- `E/animset_index.py "Die|Death02|Crawl death"` re-run: the four rows of `death_names.out`; and `$PORT` `net/deaths.ts`
  L11/L24 read: the port maps `Crawl death01` to `groin01` (swapped).
- `D/read_columns.py` re-run: getters `+0x3c`, `+0xc`, `+0x12` for columns 0-2; READERX `Score_Text` at x 368 and
  `KILLS` at x 470 (`compact_READERX_dlgMultiplayerRound.rdr.out` L40, L50).
- C's respawn claim re-read in `C/dlgCreateGame_ui.out` (L438-463, L826-867).
- `DAT_003e1400` read from the ELF: 30.

## 5. Summary table (every row of `ledger-C1.tsv`)

| item | kind | status | grade | one-line answer |
|---|---|---|---|---|
| VOTE_ROUND_END_KICK (unnamed) | note-only | RESOLVED | PROVEN | ban test (FUN_002c3550) runs at ROUND COMPLETE and GAME COMPLETE start; banned: BanSelfFromGame, WAIT 0.5, dlgNetBanned |
| VOTE_BANSELF_REQUEST (unnamed) | note-only | RESOLVED | STRONG | MediusBanPlayer {own account 0x66a4f0, +0x2c=120, world 0x66a5f0, 0} |
| VOTE_BAN_SCOPE_PLACEHOLDER | PLACEHOLDER | PARTIAL | STRONG | server-side ban per (account, game world), world outlives a match; field 120 unit unread |
| VOTE_THRESHOLD_ON_SHRINK (unnamed) | note-only | RESOLVED | STRONG | threshold and tally computed live at the round screen's start; port matches |
| VOTE_ALERT_BROADCAST (unnamed) | note-only | UNRESOLVED | UNRESOLVED | no reader of 0x44fb48/0x44fb50 found |
| VOTE_HUDCLOC_60536_60539 (unnamed) | note-only | NOT-A-GAP | BELIEVED | texts with no SOCOM II reader; TCM uses ELF strings VOTE REMOVE/RETAIN |
| MP_PENALTY_PLACEHOLDER | note-only | RESOLVED | PROVEN | SEAL hostage kill -> mp_penalty+=1 (MP6/10/11/71); host cuts round length 60 s, floor 1 s |
| TEAM_UNBALANCE (unnamed) | note-only | RESOLVED | STRONG | mp_team_unbalance=1 when a side empty; launch refused, popup UIMnLOC 356 for 3 s; no auto-balance |
| TEAMS_TOO_BIG (unnamed) | note-only | RESOLVED | STRONG | side >= 9 sets mp_teams_too_big; gates clan side swap only |
| LATE_JOINER (unnamed) | note-only | RESOLVED | BELIEVED | set when a joiner gets game state >=2; lobby: 351 chat off, 352 spectate / 353 ghost, waits refreshing 5 s |
| GAME_OBJECT_MISC_VALVES (unnamed) | note-only | PARTIAL | STRONG | Harry GameObject = r0001 0x14c game object valve slots (22 named matches); mp_persistent/mp_prog_timer1 meaning unread |
| GHOST_ROW_PLACEHOLDER | note-only | PARTIAL | BELIEVED | +0xfd1 is a departed flag (SealState callback), not ghost; ghosts listed; sort +0x580 + +0x5c8 |
| AUTOCOMM_TEXT_PLACEHOLDER | note-only | RESOLVED | STRONG | 0x27 '%s : Enemy Killed', 0x28 '%s : Man down', 0x44 '%s : A VIP has been killed' + SND_* |
| NAME_MAXLEN_PLACEHOLDER | note-only | RESOLVED | STRONG | player name 14 chars / 31 bytes (room accepts 256) |
| RADIO_MENU_PLACEHOLDER | PLACEHOLDER | PARTIAL | STRONG | tree/texts sourced; orders.rdr layout keys unread by SOCOM II (SOCOM1 leftovers); look in code unread |
| QUEUE_TEXT_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP | STRONG | original has no queue: game size 2..16 + spectators, join refused past it |
| CLIENT_FINAL_EXIT_PLACEHOLDER | note-only | RESOLVED | STRONG | non-host CloseAndSwitch is a no-op; clients follow host, who leaves 10 s after GAME COMPLETE starts |
| CLASSIC_WAITING_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP | STRONG | original waits in its lobby (launch refused while a side empty); room state is the page's stand-in |
| WAITING_LINE_READING | READING | RESOLVED | STRONG | text = UIMnLOC 356 (3 s lobby popup on launch); 350 at host lobby entry |
| SOLO_ROUND_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP | STRONG | no one-sided launch in the original (mp_team_unbalance) |
| LOAD_NET_HOLD_READING | READING | RESOLVED | STRONG | +0xd0 = host barrier: host releases all when every non-spectator reports loaded |
| LOAD_NET_HOLD_CEILING_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP | STRONG | original has no load timer: DME join fail -> dlgNetError, game over/in lobby -> dlgNetAbandoned |
| loadingJoin.ts:69 FUN_002b83e0/FUN_002c2fa0 (unnamed) | comment | RESOLVED | STRONG | FUN_002b83e0 = DME join (sets host flag); FUN_002c2fa0 = is local player a spectator |
| multiplayer.ts:44 'not read' (unnamed) | comment | NOT-A-GAP | PROVEN | page code path, no game value |
| CONE_WINDOW_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP | - | server tolerance (6 ticks); original has no referee |
| CONE_SLACK_PX_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP | - | server tolerance (2 px) |
| ROOT_POSE_SLACK_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP | - | server tolerance (4 u) |
| STANCE_CHANGE_TICKS_PLACEHOLDER | PLACEHOLDER | PARTIAL | STRONG | transitions last 37/51/57 ticks (S->C, C->P, S->P); derive window per transition (max 57) |
| ROUND_SPEED_SLACK_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP | - | float tolerance 1% on MV x dir |
| THROW_SLACK_READING | READING | NOT-A-GAP | - | server tolerance 0.1 of ComputeMaxVel |
| CHARGE_GROUND_SLACK_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP | - | server tolerance 0.25 |
| KEPT_RECONNECT_READING | READING | NOT-A-GAP | - | game has no reconnect (60 s server policy) |
| TAKEOVER_ROW_READING | READING | NOT-A-GAP | - | game has no takeover |
| DEPARTED_CHARGES_READING | READING | PARTIAL | BELIEVED | owner +0xac never cleared on departure: charge stays, stale owner, no live Detonator matches; port agrees in effect |
| REPLACED_LINE_READING | READING | NOT-A-GAP | - | page's own line |
| KNOCK_REPLAY_PLACEHOLDER (retired 2026-10-22) | PLACEHOLDER | retired | - | was the page's reconciliation; the page now replays the knock from the kept command |
| SERVER_TEXTS_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP | - | owner content (H73) |
| SOLO_IS_NETWORK_READING | READING | NOT-A-GAP | - | page's single-player match |
| ARMORY_ABANDON_READING | READING | NOT-A-GAP | - | stand-in until the lobby (ONL-16/17) |
| ARMORY_OUTSIDE_ROUND_READING | READING | NOT-A-GAP | - | stand-in until the lobby |
| ARMORY_SEAT_READING | READING | NOT-A-GAP | - | stand-in until the lobby |
| ARMORY_SERVER_NAME_READING | READING | NOT-A-GAP | - | ruled 2026-10-01: match server's name for MEDIUS_LOBBY_NAME |
| ARMORY_TYPE_FALLBACK_READING | READING | RESOLVED | PROVEN | stored type outside 1-4/5-8 -> type 1/5; refused item (Enable_* &1) skipped, slot keeps type default |
| PICK_WIRE_READING | READING | NOT-A-GAP | STRONG | kit replicated in player's net object, applied at RemoteRespawn; port's spawn = same moment |
| NET_PICKUP_MSG_TYPE_PLACEHOLDER | note-only | RESOLVED | PROVEN | 0x440e48 = ID word of packet 'Wep PU' (r0004 0x44d868), set at registration; no constant to port |
| ROUND_START_PROJECTILES_READING | READING | PARTIAL | BELIEVED | round start FUN_00223680 is CMPExitState's method, no projectile clear in it; clear only at level load/teardown; link untraced |
| OWN_BLOOD_READING | READING | NOT-A-GAP | - | room's authority; original plays at once |
| REMOTE_RELOAD_SOUND_READING | READING | PARTIAL | BELIEVED | kit+0x820 set only by pad (local) and fire-step auto reload; manual reload not sent; port may over-play |
| FRIENDLY_FIRE_ENFORCEMENT_PLACEHOLDER | note-only | RESOLVED | STRONG | FF off: CZSealBody::OnWeaponHit (FUN_005ac670) drops a hit whose live owner shares a team bit with the victim (not self) before damage/knock/blast queue; covers bullets, launched rounds, blasts; departed owner bypasses |
| NET_DAMAGE_CLAMP_PLACEHOLDER | note-only | RESOLVED | PROVEN | hit packet 0x40: damage int clamp 0..255, piercing*20 int clamp 0..255 (0.05 steps), part 0..15; remote victim applies truncated integer |
| STUN_EFFECT_PLACEHOLDER | note-only | PARTIAL | BELIEVED | no reader of ammo+0x10 Stun found (4 searches); stun timers use fixed per-item values; likely unused data |
| RECOVERY_FACTOR_PLACEHOLDER | note-only | RESOLVED | STRONG | recovery_factor = per-second countdown rate of 7 stun timers body+0xfe0..0xff8; no player-visible effect beyond flashbang start |
| DOUBLE_AMMO_LOAD_PLACEHOLDER | note-only | NOT-A-GAP | STRONG | already resolved by research 94 A7 and built in viewer/src/loadout.ts; 101 row stale |
| SHOTGUN_MP_PELLET_DAMAGE_SCALE_READING | READING | RESOLVED | STRONG | raw: online receiver applies each pellet as the weapon's first ammo raw ImpactDamage (2.5), no x14/falloff/modifier; packet damage only gates >0 |
| IMPACT_HIT_READING | READING | RESOLVED | STRONG | handler traced: CSealEx::OnWeaponHit->FUN_005ac670->FUN_005ab850->FUN_005abbc0->FUN_005a5a80 GetDamage impact branch x14 on node part, cause 5 (room's reading correct); thrown grenade body contact does nothing |
| IMPACT_SIGHT_READING | READING | PARTIAL | BELIEVED | blast sight line starts at blast object +0x48 with no lift (FUN_005ac070); impact detonation converts projectile in place; +0x48 vs surface unread |
| BLOWBACK_CONSUMER_READING | READING | RESOLVED | STRONG | sole reader FUN_0057e770 (the knock): strength +0x1320, radius +0x1324=100; online set on victim console from packet damage x blowback falloff (d2 100..1600), source shooter; port builds no shotgun push |
| CLAYMORE_CONE_POINT_READING | READING | RESOLVED | STRONG | feet: GetDamage cone test at actor+0x1c (ground point); half-angle const 1.4726; radius Explosion_Radius x10; page's feet+10 wrong |
| BODY_PENETRATION_READING | note-only | RESOLVED | STRONG | bullets continue past a body: range'=min(range,(range+range*piercing*0.1)*PERSON pen 0.97); only launched rounds/rockets stop; room stops at first body (deviation) |
| KNOCK_LANDING_GATE_READING | note-only | RESOLVED | STRONG | body+0x105c bit 3 set only by CAiSRescued signal handler (online), never cleared: x1.2 knock landing always applies to players (port correct) |
| HEAD_NODE_NAMES_PLACEHOLDER | note-only | RESOLVED | PROVEN | 0x65c4f8 hips, 0x65c500 head, 0x65c508 neck; full node->part table read; port matches |
| DEATH_SOUND_IDS_PLACEHOLDER | note-only | RESOLVED | STRONG | 0x3c CHRSND_DEATH, 0x3d CHRSND_DEATH_QUIET (causes 1/2/3 incl headshot); cause 6 none; port plays no death voice |
| HIT_VOLUMES_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP | - | fallback only when a map's skeleton did not load |
| SPINELO_RADIUS_PLACEHOLDER | PLACEHOLDER | PARTIAL | BELIEVED | game has no capsules: part from struck polygon's node; spinelo (BODY, +0x2fc) likely owns no geometry; radius only fills a BODY gap |
| comment: whether the raw one is scaled (pelletDamage) | comment | RESOLVED | STRONG | not scaled (see SHOTGUN_MP_PELLET_DAMAGE_SCALE_READING) |
| comment: the handler itself not traced (directHit) | comment | RESOLVED | STRONG | handler traced: FUN_005ac670 (OnWeaponHit) -> FUN_005abbc0; FF gate in it |
| START_SLOT_LINK_PLACEHOLDER | PLACEHOLDER | RESOLVED | STRONG | +0xfc8 = the console's DME client index (FUN_0030d5a0, Harry "get client ID"); lobby table indexed by it; classic start record = clientIndex % count of the side's key list |
| RESPAWN_BLOCK_PLACEHOLDER | PLACEHOLDER | RESOLVED | PROVEN | block = count/24 records from clientIndex*(count/24); farthest-nearest-enemy incl. dead bodies; no enemy -> first of block; respawn round start random only within block (block 1 on all maps' key 0/2) |
| RESPAWN_BANNER_PLACEHOLDER | PLACEHOLDER | RESOLVED | PROVEN | respawn on -> mp_max_rounds 1 and mp_max_round_time 1200 s (buttons disabled): banner "STARTING ROUND 1 OF 1", one 20-minute round |
| RESPAWN_BUTTON_PLACEHOLDER | note-only | RESOLVED | STRONG | respawn = config Action (pad result 0) just pressed; prompt 0x3e3310 glyph 0xa6 (X) when Inventory slot is R2, else 0x3e3330 glyph 0xb7 (Circle) |
| SPECTATOR_PAD_PLACEHOLDER | PLACEHOLDER | RESOLVED | STRONG | on release: dpad Right/Left next/prev player (spectator all, dead teammates no escortees); Up/Down scenic views; ~~X free<->follow~~ (superseded below the table); Triangle jump to visible; no dead cycle in respawn unless ghost |
| DEAD_CYCLE_WHILE_MENU_READING | READING | NOT-A-GAP | PROVEN | verified: blocked while HUD mode +0x221 != 0 |
| OBJECTIVE_BY_MAP_PLACEHOLDER | PLACEHOLDER | RESOLVED | PROVEN | per-map objectives scripts decoded for all 22 maps: texts, guards (DEM 3+10, else 5+10; timer 5 ESC/BRE else 15), time-out (draw SUP/DEM/EXT, SEALs ESC, Terrorists BRE); agrees with M1/WT-98 ([173](173-demolition-map-audit.md))/99/101 |
| ROUND_CUE_CONDITIONS_READING | READING | RESOLVED | PROVEN | evaluator left-to-right no precedence, NOT prefix, parens; the elimination branches' EXPRESSION is the AND token; all-required is exact for every cue read |
| MSG_COLOUR_WORD_PLACEHOLDER | note-only | RESOLVED | PROVEN | MESSAGE tick never reads +8..+10 (c8c8c8); +0xb centred flag, +0xc scale, colour index 0, main window 0x4366a0 |
| CLOCK_NEG_STRING_PLACEHOLDER | note-only | RESOLVED | PROVEN | string 0x3e3070 is "" (blank) |
| CLOCK_VISIBILITY_PLACEHOLDER | note-only | RESOLVED | PROVEN | +0x1c show / +0x18 hide (bit 6 of +0x14); online always shown; offline hidden while viewed actor dead |
| STEP_PROBE_LIFT_READING | READING | UNRESOLVED | UNRESOLVED | no new capture; lever: the bone FUN_005b0840 reads posed per stance (C2), or W2.2c kerb capture |
| FLIGHT_TICK_READING | READING | PARTIAL | STRONG | flight steps once per game frame at its measured dt; game frame capped 30 Hz (DAT_003e1400=30, restored from DAT_003e13f8=30): nominal 1001/30000 s, not 1/60 |
| aimaps-slot-y | comment | RESOLVED | STRONG | slot y IS in AIMAPS.MPS: min_y + cellword bits 9..18 * (max_y-min_y)/1024; matches 4 measured feet within 1.1, camera rows +24-26 |
| mapActions-reach | comment | RESOLVED | PROVEN | action = node under the reticle (or 6 parents), valve!=99, type!=8; reticle hit point vs actor: ground-plane dist<range, /dy/<elevation unless -1 |
| TITLE_PLACEHOLDER | PLACEHOLDER | RESOLVED | PROVEN | TitleBar (45,50)/(75,50)/(55,60) scale 1.75 COLOR (91,72,36); FINAL ROUND has a 2nd TitleBar (15,45) font_titlebar_01 0.95 -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr` |
| COLUMN_ORDER_PLACEHOLDER | PLACEHOLDER | RESOLVED | PROVEN | SCORE, KILLS, DEATHS (round +0x5c8/+0x598/+0x59e; totals +0x580/+0x550/+0x556); clan [%s] column left of name -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr` |
| ROUND_LIST_COLUMNS_PLACEHOLDER | note-only | RESOLVED | PROVEN | 0x3dc7f0/800 -> round block player+0x58c, 0x3dc810/820 -> totals +0x544; columns getters +0x3c,+0xc,+0x12 |
| PANEL_PLACEHOLDER | PLACEHOLDER | RESOLVED | PROVEN | full-frame BACKGROUND multplay_back.tif (512x512) + backsolid.tif panels: Team_back (5,10) 300x230 a0.4, Team_back_Terr (5,240) 300x200 a0.4, column backs x315/420/525 100x180 a0.3 -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr` |
| TEAM_BAR_PLACEHOLDER | PLACEHOLDER | RESOLVED | PROVEN | no team bar exists; captions plain TEXT SEALS (20,70)/TERRORISTS (20,270) scale 1.0 over teal backsolid panels -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr` |
| STRIPE_PLACEHOLDER | PLACEHOLDER | RESOLVED | PROVEN | every row: 8 static strips/side 300x17 a0.8 at y80..220 / 280..420 + 100x17 a0.9 under each number column; backsolid = RGB (0,72,88) -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr` |
| YOUR_STATS_PLACEHOLDER | PLACEHOLDER | RESOLVED | PROVEN | left block: YOUR STATS (20,198); 9 labels (20,224+23k) SCORE..SUICIDES; values LISTBOX (250,225) spacing 23 = +0x580,+0x550,+0x556,hit%,+0x544,+0x576,+0x578,+0x55a,+0x558 -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerFinalReally.rdr` |
| BOTTOM_CAPTION_PLACEHOLDER | PLACEHOLDER | RESOLVED | PROVEN | two-line literal captions SEAL ROUNDS WON (390,196)/LOST (555,197), TERRORIST ROUNDS WON (390,267)/LOST (555,267), counters +35; TIME PLAYED (470,350) -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerFinalReally.rdr` |
| ROUND_SCREEN_LAYOUT_PLACEHOLDER | note-only | RESOLVED | PROVEN | all three SOCOM II layouts + scripts on the disc; game mounts readerx.zar at round end; splash lib is MPExitState's, unused by these dialogs |
| ROUND_SCREEN_LAYOUT (reCOM positions) | comment | RESOLVED | PROVEN | every entry differs: NextMission (380,50) 1.0, CountDown +130, lists x365 y94/296 spacing 20 scale 0.9, columns 8/110/217 RJ, name -290, clan -345 |
| ROUND_COLOURS.backdrop (bitmap missing) | comment | RESOLVED | PROVEN | the background is multplay_back.tif, not opaque black |
| round lists sort (sideRows ties by join order) | comment | RESOLVED | STRONG | score desc, then kills desc, then name by strcmp (reverse); rows with +0xfd2 set left out |
| MVP pick (first on a tie) | comment | RESOLVED | STRONG | highest total score +0x580, then total kills +0x550, then strcmp(name); both sides; hidden rows excluded; name '[%s] %s' |
| round screen timings (CountDown/ExitOnStart/TimeoutMonitor) | comment | NOT-A-GAP | PROVEN | 10..GO every 0.5 s (Final 20..GO then FinalReally), 5 s then ReplayMission, 90 s -> dlgNetError: port agrees |
| row reveal + rounds counters | comment | RESOLVED | PROVEN | not built: list SEQUENCE_DELAY 0.15 / SEQUENCE_INTERVAL 0.1; counters 3.5-4.0 s (SEAL) 4.0-4.5 s (TERR); MaintainDoneCounting 5 s; MpFinalOnOk |
| DEATH_NAME_PLACEHOLDER | PLACEHOLDER | RESOLVED | PROVEN | Die=chest01, Death02=chest02, Crawl death01=groin02, Crawl death02=groin01 (port swaps groin01/02) |
| DEATH_ORBIT_EULER_READING | READING | RESOLVED | PROVEN | Ry(yaw)*Rx(tilt)*v; port equal to 1.4e-14 |
| FLINCH_GATE_READING | READING | PARTIAL | STRONG | all refusals named (ladder,9/10,switch,restrained/turret,falling,stab/CQB/restraint,long hits,0x40); jump/climb/landing not refused |
| FLINCH_LAYER_PLACEHOLDER | PLACEHOLDER | PARTIAL | STRONG | 0xd only suppresses FUN_00588bc0's net send; one motion stack; bit4 blocks reload start, bit2 blocks stab/CQB/restrain |
| FLINCH_STANCE_READING | READING | RESOLVED | STRONG | state stance; first half of a stance change uses its origin; +0x1060 bit4 forces prone |
| KNOCK_IN_MOVE_PLACEHOLDER | PLACEHOLDER | PARTIAL | STRONG | no traversal gate in the game: knock ends stab/restraint, switch, turret, pops stack, then falls |
| KNOCK_SIDE_READING | READING | RESOLVED | STRONG | quaternion rotate; Fall backwards iff push has +local z (the back); port rule matches |
| PRONE_COVER_PLACEHOLDER | PLACEHOLDER | RESOLVED | PROVEN | Prone cover -> guard_prone_cover, 16 fr in MOTION_P.ZAR, playback 4.3, NoFire; net kind 0x22 code 0x10 |
| CORPSE_KNOCK_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP | PROVEN | retired; verified |
| BODY_FADE_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP | PROVEN | value sourced (alpha->0 at 0.1/s); gap is the port's material |
| REMOTE_KIT_APPLY_PLACEHOLDER | PLACEHOLDER | RESOLVED | STRONG | kit applied at RemoteRespawn (FUN_00598b90) from net object data+0x34; port 'spawn' matches |
| C4_STILL_READING | READING | PARTIAL | STRONG | FUN_005be990 = 0.2 s settle timer on the aimed C4 target, not SEAL speed; +0xe84==0 unidentified |
| C4_TARGET_READING | READING | PARTIAL | STRONG | crosshair-hit node with +0x94 destructible (hp>0, threshold<=dmg); map node set owed (kind-3 blocks) |
| LAUNCHER_RAISE_READING | READING | RESOLVED | STRONG | rifle 1.4155 s / pistol 1.3776 s (playback 1.5, 35/24 fr, NoFire); lower = same clip reversed |
| RELOAD_SECONDS_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP |  | fallback only (no MOTION_P.ZAR) |
| CLAYMORE_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP |  | retired; no constant |
| POUCH_PLACEHOLDER | PLACEHOLDER | NOT-A-GAP |  | retired; no constant |
| PICK_TIE_READING | READING | PARTIAL | STRONG | no tolerance: strict nearest opaque hit; action on node or 6 ancestors; nearer passable action wins |
| doors.ts:419 reticle surface test | comment | RESOLVED | STRONG | material bit0/bit1, pen>=0.98 w/o bit4, surface +10 bits2-3==1 (aim-ray rule) |
| remotePlayers.ts:95 kit apply | comment | RESOLVED | STRONG | see REMOTE_KIT_APPLY_PLACEHOLDER |
| remotePlayers.ts:137 flinch gate differs | comment | PARTIAL | STRONG | see FLINCH_GATE_READING |
| remotePlayers.ts:155-162 flinch layering | comment | PARTIAL | STRONG | see FLINCH_LAYER_PLACEHOLDER |
| remotePlayers.ts:186-188 footfall +0xe0 gate | comment | PARTIAL | STRONG | bit2 = self + up to 3 others (DAT_0064fc78=3) within 500 u |
| UNKNOWN_TYPE_SLOT (unnamed) | comment | NOT-A-GAP | - | a type that did not read is null: data robustness, no game value |
| SERVER_TYPES_UNREAD (unnamed) | comment | NOT-A-GAP | - | empty/null type list where data did not read: robustness |
| ITEM_UNKNOWN_WITHOUT_ARSENAL (unnamed) | comment | NOT-A-GAP | - | no ZWEAPON.ZAR -> items unknown, baked kit: test/robustness path |
| PROJECTILE_TEARDOWN_CALLS (unnamed) | comment | PARTIAL | BELIEVED | same as ROUND_START_PROJECTILES_READING |
| SIMMAP_MATERIAL_UNKNOWN (unnamed) | comment | NOT-A-GAP | - | hand-built map without materials reads UNKNOWN: robustness |
| SIMMAP_CHAR_FALLBACK (unnamed) | comment | NOT-A-GAP | - | character that does not read falls back to the side's first: robustness |
| PROTOCOL_UNKNOWN_TYPE (unnamed) | comment | NOT-A-GAP | - | an older page ignores an unknown event type: versioning |
| PICK_REFUSAL_UNKNOWN (unnamed) | comment | NOT-A-GAP | - | 'unknown' refusal for an id with no record: validation |
| SERVER_NAME_DEFAULT (unnamed) | comment | NOT-A-GAP | - | = ARMORY_SERVER_NAME_READING |
| PLAYERS_ONLINE_UNREADABLE (unnamed) | comment | NOT-A-GAP | - | an unreadable list shows unknown: robustness |
| DOOR_DIAGNOSTIC (unnamed) | comment | NOT-A-GAP | - | what does not read is a diagnostic: robustness |
| LOADING_ANSWERS (unnamed) | comment | NOT-A-GAP | - | worker answers even when parts do not read: robustness |
| RESPAWN_REPLAY_HOLD (unnamed) | comment | UNRESOLVED | - | the respawn replay's hold period: research 150 s5 owed (reload-while-running lane, not C1) |

> Superseded by research 244 §3 (2026-10-08): the spectator's state byte is 0 = free, 1 = follow, 2 = scenic; X goes follow or scenic -> free -> back, free the hub; a remembered free does nothing (FUN_00295260 D:L139480-139530).

## 6. Part A1 -- the vote, the ban, the teams, the lobby flow

Scripts: `scratch/C1/A1/` (README.txt).

Fork A1 of C1. Every claim below has a script under `scratch/C1/A1/` (index: `A1/README.txt`); `A1/show_reads.out`
prints every decomp range cited here in one go. `D:L` = line of `socom2_game.elf.decomp.c` (r0001). "READERX" =
`game/disc/RUN/UI/READERX.ZAR`, which holds the SOCOM II **source text** of `dlgMultiplayerRound.rdr`,
`dlgMultiplayerFinal.rdr`, `dlgMultiplayerFinalReally.rdr` and `dlgExitState.rdr` (`A1/readerx_keys.out`). Research 91
says these were not in the handoff; they are on the disc tree now, and they settle three of this part's items.

### 6.1 Summary

| item | status | grade | one-line answer |
|---|---|---|---|
| VOTE_ROUND_END_KICK (unnamed, R91 §17 §4) | RESOLVED | PROVEN | SOCOM II's own round screen and GAME COMPLETE screen run the ban test at their start; banned: `BanSelfFromGame`, 0.5 s, `dlgNetBanned` |
| VOTE_BANSELF_REQUEST (unnamed, R91 §17 §4) | RESOLVED | STRONG | `BanSelfFromGame` = `MediusBanPlayer` on the player's own account for the game's world id, field +0x2c = 120 (unit unread) |
| VOTE_BAN_SCOPE_PLACEHOLDER | PARTIAL | STRONG / UNRESOLVED | the ban is the server's, per game (Medius world) and per account; the request carries 120 whose unit is not in our corpus |
| VOTE_THRESHOLD_ON_SHRINK (unnamed, R91 §17 §4) | RESOLVED | STRONG | the test is computed when the round screen starts, from the team's records and flags present then |
| VOTE_ALERT_BROADCAST (unnamed, R91 §17 §4) | UNRESOLVED | UNRESOLVED | the store at 0x44fb48/0x44fb50 has no reader by address in r0001 |
| VOTE_HUDCLOC_60536_60539 (unnamed, R91 §17 §4) | NOT-A-GAP | BELIEVED | no SOCOM II code reads them; the TCM's vote labels are ELF strings 0x3e5cd0 / 0x3e5ce0 |
| MP_PENALTY_PLACEHOLDER (note only) | RESOLVED | PROVEN | each SEAL hostage kill (MP6, MP10, MP11, MP71 scripts) adds 1; the host then cuts the round length by 60 s (floor 1 s) |
| TEAM_UNBALANCE (unnamed, Harry `TeamUnbalance`) | RESOLVED | STRONG | `mp_team_unbalance` = a side has no player; the host's launch is refused with a 3 s popup "There must be players on both teams to launch." |
| TEAMS_TOO_BIG (unnamed, Harry `TeamsTooBig`) | RESOLVED | STRONG | set when a side has 9 or more; it gates only the clan games' side swap, not the launch |
| LATE_JOINER (unnamed, Harry `LateJoiner`) | RESOLVED | BELIEVED | set when a joiner is told the game is past the lobby; the lobby offers spectate (352) or ghost (353) and holds the joiner, chat off (351) |
| GAME_OBJECT_MISC_VALVES (unnamed, Harry) | PARTIAL | STRONG | Harry's GameObject is r0001's 0x14c game object's valve table (24 slots matched by name) |
| GHOST_ROW_PLACEHOLDER (note only) | PARTIAL | BELIEVED | `+0xfd1` is a departed flag, not the ghost flag; the list builder has no ghost test, so a ghost is listed |
| AUTOCOMM_TEXT_PLACEHOLDER (note only) | RESOLVED | STRONG | 0x27 "%s : Enemy Killed", 0x28 "%s : Man down", 0x44 "%s : A VIP has been killed", each with its `SND_*` |
| NAME_MAXLEN_PLACEHOLDER (note only) | RESOLVED | STRONG | the player name: 14 characters, 31 bytes (`CREATEPLAYERNAME`) |
| RADIO_MENU_PLACEHOLDER | PARTIAL | STRONG (tree) / UNRESOLVED (look) | `orders.rdr`'s layout keys are not read by SOCOM II; the look is in code (`FUN_00232bc0` / `FUN_002344e0`) and unread |
| QUEUE_TEXT_PLACEHOLDER | NOT-A-GAP | STRONG | the original seats at most 16 players (the create screen's 2..16) and refuses the next; the queue is the page's |
| CLIENT_FINAL_EXIT_PLACEHOLDER (note only) | RESOLVED | STRONG | non-host clients do not leave GAME COMPLETE by themselves: their `CloseAndSwitch` only names the lobby; the host leaves at 10 s and they follow |
| CLASSIC_WAITING_PLACEHOLDER | NOT-A-GAP | STRONG | the original waits in its game lobby (launch refused while a side is empty); the room's waiting state is the page's stand-in |
| WAITING_LINE_READING | RESOLVED | STRONG | the words are the original's for this state: UIMnLOC 356 (as a 3 s lobby popup); 350 at the host's first lobby entry |
| SOLO_ROUND_PLACEHOLDER | NOT-A-GAP | STRONG | confirmed: no one-sided launch in the original (`mp_team_unbalance`) |
| LOAD_NET_HOLD_READING | RESOLVED | STRONG | the byte +0xd0 is a host barrier: the host releases every loader once all non-spectator players report loaded |
| LOAD_NET_HOLD_CEILING_PLACEHOLDER | NOT-A-GAP | STRONG | the load state has no timer; a failed DME join goes to `dlgNetError`, a game already over or back in the lobby to `dlgNetAbandoned` |
| loadingJoin.ts:69 (comment) | RESOLVED | STRONG | `FUN_002b83e0` is the DME join (host flag set there); `FUN_002c2fa0` is "is the local player a spectator" |
| multiplayer.ts:44 (comment) | NOT-A-GAP | PROVEN | "not read" means the page does not read the address; no game value |

---

### 6.2 VOTE_ROUND_END_KICK (unnamed; research 91 §17 "§4 Placeholders (not found)", first bullet)

**What it stands for.** When a passed vote removes its target. Research 91 §17 inferred it from SOCOM 1's
`dlgMultiplayerRound.rdr` (believed, not shown for SOCOM II). The port applies passed votes in `room.ts` `endRound` ->
`applyVotes` (`$PORT/packages/match/src/room.ts:2340`, `:2380`).

**What I did.** Read READERX's three round dialogs as source (`A1/dump_rdr.ts` -> `A1/readerx_dialogs.out`) and the
compiled twin in `RUN/MPZANIM.ZAR` (`A1/dump_mpzanim.ts` -> `A1/dump_mpzanim_exit.out`, decoded `A1/mpzanim_exit.dec`);
the UI command table rows by name (`A1/uicmd_table.py` -> `A1/uicmd_table.out`).

**Answer (PROVEN).**
- `dlgMultiplayerRound.rdr` (ROUND COMPLETE): its `ANIMATIONS` start four on `ONSTART`: `CallRoundATie`, `ExitOnStart`,
  `CountDown`, `TimeoutMonitor`. `ExitOnStart`: disable the two round lists; **IF `HaveBeenBannedFromGame`**: the
  `LoadingAnim` object inactive, `BanSelfFromGame`, `WAIT 0.5`, `GameStatePopCommand dlgNetBanned.rdr`; **ELSE** `WAIT 5`,
  then `ReplayMission` in a `WHILE TRUE`.
- `dlgMultiplayerFinalReally.rdr` (GAME COMPLETE): `ONSTART` `CallRoundATie`, `ReturnFlash`, `ExitOnStart`,
  `MaintainDoneCounting`, `TimeoutMonitor`. Its `ExitOnStart` runs the same ban test after `UpdateMpFinalStatsUiVars`,
  `IDFromBriefing = 0`, `ClanSwapSidesIndex += 1`.
- `dlgMultiplayerFinal.rdr` (FINAL ROUND) has no `ExitOnStart`: no ban test there.
- The UI command table (r0001 `.data`): `HaveBeenBannedFromGame` row at 0x3dda14 -> 0x278ea0, a `j 0x2c3550`
  (`FUN_002c3550`, D:L164913-165088, the strict-majority test of research 91 §17); `BanSelfFromGame` row 0x3dda44 ->
  0x278d30 (`FUN_00278d30`, D:L123704-123709).
- So: the test runs on the **target's own console** at the **start** of every ROUND COMPLETE and GAME COMPLETE screen;
  a passed vote sends the ban request, waits 0.5 s and pushes `dlgNetBanned` (UIMnLOC 539 "YOU HAVE BEEN KICKED FROM THIS
  GAME", 541, 540; `A1/uimnloc_lobby.out`).

**Implementation suggestion.** The port's timing is already "at the round's end" (`endRound` -> `applyVotes`, before the
screens). To pair it exactly: apply at the moment the round-screen phase starts (the room's `roundOver` broadcast is
that moment in the port, so no change is needed), and **not** at the FINAL ROUND screen of a match end if the room
models the two screens separately -- apply at GAME COMPLETE's start. Test first: `central/test/room.test.ts` "a passed
vote removes its target when ROUND COMPLETE starts, and at GAME COMPLETE's start at a match end, never mid-round".
Change the comment at `room.ts:2379` from "inferred from SOCOM 1's script" to the READERX citation.

**Owed evidence.** None for the rule. A capture would only time the 0.5 s.

### 6.3 VOTE_BANSELF_REQUEST (unnamed; research 91 §17 §4, second bullet)

**What I did.** Read `FUN_00278d30` (D:L123704-123709: `FUN_002f95f0(0x44f370)`), `FUN_002f95f0` (D:L197786-197808)
and its disassembly (`A1/sc2_banself_dis.out`), `FUN_00649d88` (D:L561454-561472), the SOCOM 1 demo ELF's symbols
(`A1/demo_syms.py` -> `A1/demo_banself.out`), Horizon's message enum (`research/horizon-server/RT.Common/Types.cs`).

**Answer (STRONG: SOCOM II code + the SOCOM 1 demo's symbols, same shape).**
- SOCOM 1 demo symbols: `BanSelfFromGame__13CZOnlineLobbyFv` (0x32dc10) calls `MediusBanPlayer` (0x3b4f10) with
  `cbBanSelfFromGame__FiiiP23MediusBanPlayerResponse` (a no-op). SOCOM II's `FUN_002f95f0` is the same function
  instruction for instruction: a 0x38-byte request, MessageID (0x15) then SessionKey (0x11 bytes from 0x66a4d0), then
  **+0x28 = `DAT_0066a4f0`** (the player's own account id: reset to -1 with the session at D:L182647, formatted at
  D:L121955), **+0x2c = 0x78 (120)** (`addiu v0, zero, 0x78` at 0x2f9638), **+0x30 = `DAT_0066a5f0`** (the game's world id:
  the JoinGame request's world at D:L190375), **+0x34 = 0**; sent by `FUN_00649d88` (= `MediusBanPlayer`, 0x38 bytes,
  message class 0x40). Gated on the lobby object's connected byte (+0x7d). Its callback 0x2f9680 only prints
  "BanSelfFromGame" (0x3f5b30) with the status.
- Horizon names the lobby message `BanPlayer = 0x8A` / `BanPlayerResponse = 0x8B` (Types.cs L712-713) and the join
  refusal `MediusPlayerBanned = -972` (L98), which research 91 §17 ties to UIMnLOC 443.
- The meaning of field +0x2c (120) is not in our corpus: no `MediusBanPlayerRequest` model in Horizon, none in reCOM.

**Implementation suggestion.** The port's room is the server; it needs no request. Record in `room.ts` that the
original's ban is a server-side record keyed by (account, game world). See VOTE_BAN_SCOPE below for the duration.

**Owed evidence.** The Medius SDK's `MediusBanPlayerRequest` layout (field names of +0x28..+0x34), or a capture of
the 0x8A request reaching our own Horizon instance with its handler logging the fields.

### 6.4 VOTE_BAN_SCOPE_PLACEHOLDER (`$PORT/packages/match/src/room.ts:110-111`, `:2349`)

**What it stands for.** How long a removed player is refused (`VOTE_BAN_MS` = 10 min).

**Current value.** 10 minutes, keyed by address; "two of the original's matches" (the port's reasoning).

**Prior search.** 91 §17: "the rejoin ban ... Whether the ban lasts for the game's life: assumed".

**What I did.** As VOTE_BANSELF_REQUEST; and the flow after GAME COMPLETE (READERX `call_gamelobby`: `WAIT 10`,
`return_to_gamelobby` -> `CloseAndSwitch dlgGameLobby.rdr`): the match ends back in the **same game's** lobby, so the
Medius world -- the ban's key -- outlives a match.

**Answer.** STRONG: the ban is the server's, keyed by the banned player's own account and the game's world id
(+0x28/+0x30 of the request); the game client keeps no timer of its own (no code reads the ban back; the refusal is the
server's -972 on JoinGame). The world lives as long as the game (across its matches, since GAME COMPLETE returns to the
same lobby). UNRESOLVED: the request's +0x2c = 120 is very likely a duration, but its unit (minutes would be 2 h,
seconds 2 min) is not read anywhere in our corpus. Not "two matches" in any source.

**Implementation suggestion.** Two consistent choices for the owner: (a) bind the ban to the room's life for that
account (the session token, which the room already keys reconnects by, `KEPT_RECONNECT_READING`), cleared when the room
resets after it empties -- the closest to "that game"; (b) keep a time bound but name it `VOTE_BAN_SECONDS_READING = 120 x
<unit>` once the unit is known. Key it by session token as well as address (an address alone over-bans a shared NAT).
Test: `room.test.ts` "a removed player's token is refused 'You have been banned from that game' until the room resets".

**Owed evidence.** As VOTE_BANSELF_REQUEST: the SDK struct or a server-side capture of the request.

### 6.5 VOTE_THRESHOLD_ON_SHRINK (unnamed; research 91 §17 §4, fifth bullet)

**Answer (STRONG).** `FUN_002c3550` (D:L164913-165088) counts, at the moment it is called, the lobby records
(`DAT_004414c0`, 24 slots) whose team word equals the local side, and the records whose `+0x48` ("voted against me") is
set; it is called by `HaveBeenBannedFromGame` at the round screen's start (above) and once, result discarded, after each
received vote (D:L159767). A departed voter's record is gone from the slot table and a joining slot's flags are cleared
(`FUN_002c5830` L166356-166377, research 91), so the threshold and the tally are both the round-screen moment's. The
port's `votePasses` (`room.ts:2372`) computes the same from live players at `endRound`: it matches.

**Implementation suggestion.** None; add a test "a voter who leaves before the round's end no longer counts, and the
target's smaller team lowers the bar" to pin it.

### 6.6 VOTE_ALERT_BROADCAST (unnamed; research 91 §17 §4, third bullet)

**What I did.** `FUN_002ba040` (D:L159747-159782): after a received vote the target broadcasts `{1, votesBefore,
votesAfter}` (`DAT_00440eb8`); `FUN_002b98b0` (D:L159438-159450) on receipt, when before == after, stores the sender's
account id and 2 via `FUN_002f9690` (D:L197811-197824) into 0x44fb48 / 0x44fb50, guarded by `FUN_003045b0(0x44fe10)`;
`FUN_002fab80` clears both (D:L198556-198557). `A1/fb48_refs.py` (-> `fb48_refs.out`) walked every lui/lo reference to
0x44f900..0x44fb54: 0x44fb48 and 0x44fb50 are referenced only at those two writes and the clear (0x2f96bc, 0x2faf30).
No `+ 0x7d8)` access (the offset from the lobby object 0x44f370) is a reader either.

**Answer.** UNRESOLVED: no reader found. Before == after happens when a vote changed nothing (a repeated toggle), so it
may be a report of a no-op vote; this is a guess and is not used anywhere below. Gameplay impact: none known.

**Owed evidence.** A trace (PLAT-36's window) with a write/read watch on 0x44fb48 during a vote.

### 6.7 VOTE_HUDCLOC_60536_60539 (unnamed; research 91 §17 §4, fourth bullet)

**Answer (BELIEVED, NOT-A-GAP).** HudCLOC 60536 "ON", 60537 "OFF", 60538 "RESCIND VOTE AGAINST THIS PLAYER", 60539
"VOTE THIS PLAYER OUT" (`A1/hudcloc.out`) have no reference in the decomp (research 91's grep of 0xec78-0xec7b) and no
disc script names them (`A1/grep_disc_strings.py` with the ids -> no hit outside `HudCLOC`). SOCOM II's TCM labels its
vote with ELF strings ("VOTE REMOVE" 0x3e5ce0 / "VOTE RETAIN" 0x3e5cd0, `FUN_0022f440` L81375-81396, research 91). The
four are carried texts with no reader. Nothing to port.

### 6.8 MP_PENALTY_PLACEHOLDER (note only; research 91 §16)

**What it stands for.** The valve `mp_penalty` (0x3f1140), created and zeroed (D:L149589), "game-script use not read".

**What I did.** `A1/game_valves.py` (-> `game_valves.out`): the game object's slot +0x40 is `mp_penalty`, matching
Harry62's `GameObject +0x40 mp_penalty`. `A1/grep_valves_disc.py` (-> `grep_valves_disc.out`): named by MP6, MP10, MP11,
MP52, MP53, MP71, MP82's map scripts. `A1/dump_map_zanim.ts` + `zdecode.py` (-> `mp6_penalty.dec`, `pen_MP*.dec`,
`penalty_maps.out`). The engine side: `FUN_002a9ee0` D:L150711-150719 and `FUN_002a6960` D:L148930-148959.

**Answer (PROVEN).**
- The map script (`mission/objectives`): `reset` sets `mp_penalty = 0`; on MP6, MP10, MP11 and MP71 each of
  `SealKill1..3` waits for `mp_hostages_by_seals >= 1..3`, plays `^PH_0007`, posts "THE SEALS HAVE KILLED A HOSTAGE"
  (0.7), WAIT 2, "ONE MINUTE HAS BEEN DEDUCTED FROM THE MISSION TIMER" (0.7), then `mp_penalty += 1`, `killcount += 1`.
  (MP52, MP53, MP82, the VIP maps, only reset it.)
- The host (online, `DAT_0045a0c0`), each tick in `FUN_002a9ee0`: when the valve's value exceeds its last seen copy
  (game object `+0xc0`), it calls `FUN_002a6960(game, 0x3c)`, then stores the new value. `FUN_002a6960` (host only): the
  round length `+0xe0` (ms) becomes `(seconds - 60) x 1000` when it is over 60 s, else 1000 ms (1 s) when not 0. The
  clock (`FUN_002aa490`, research 91 §18.1) then shows remaining = length - elapsed. Several increments seen in one
  tick cost one minute.
- The round start zeroes the valve again (`FUN_002a6c50` D:L149098-149101).

**Implementation suggestion.** Not needed while every room runs SUPPRESSION (`OBJECTIVE_BY_MAP_PLACEHOLDER`). For the
hostage work: a room constant `PENALTY_SECONDS = 60` (`FUN_002a9ee0` L150717 operand 0x3c) and `PENALTY_FLOOR_MS =
1000` (L148948), applied to the round length (not the elapsed time) on each SEAL hostage kill; test first in
`roomHostage.test.ts`: "a SEAL kill of a hostage cuts the round's length by 60 s, never below 1 s, and posts the two
lines 2 s apart".

### 6.9 TEAM_UNBALANCE (unnamed; Harry62 `GameObject +0x54 TeamUnbalance`)

**What I did.** `game_valves.out` (+0x54 = `mp_team_unbalance`, default 0, D:L149641); `A1/gameobj_field_uses.py`
(-> `gameobj_field_uses.out`); `FUN_002c3cf0` D:L165314-165393; `FUN_002c4500` D:L165607-165679; the lobby's compiled
scripts in `RUN/UIZANIM.ZAR` (`A1/dump_zanim_needle.ts` -> `uizanim_valves.out`, decoded `uizanim_valves.dec`).

**Answer (STRONG).** `FUN_002c4500` recounts the 24 lobby records: side A, side B (`DAT_00441448`, `DAT_00441450`),
spectators (bit 0x10000) and others. `FUN_002c3cf0` sets `mp_team_unbalance = 1` when either side is empty -- unless the
game object's byte `+0xa8` is set or `mp_teams_too_big` is set -- and clears it when byte `+0xd8` is set. In the lobby
state (`+0x113 == 1`) the host launches only when `FUN_002c40c0` passes (research 91: 80 % ready) **and**
`mp_team_unbalance == 0` (D:L165379-165384). The lobby's `launch_10sec_anim` (dlgGameLobby): `.DINK`; IF
`mp_team_unbalance == 1`: a popup (locale 0x164 = 356, "There must be players on both teams to launch.") for 3 s; ELSE
lock the game, `ForceMediusStatusReport`, `ForceMPLaunch`, disable SWITCH TEAMS / ARMORY (weaponselect) / READY. There
is **no automatic team balancing** anywhere in these paths.

**Implementation suggestion.** The port's classic room already refuses to start with a side empty
(`CLASSIC_WAITING_PLACEHOLDER`); nothing to change for the room. For ONL-16's lobby: the launch button's refusal popup
(356, 3 s).

### 6.10 TEAMS_TOO_BIG (unnamed; Harry62 `GameObject +0x60 TeamsTooBig`)

**Answer (STRONG).** `FUN_002c4500` D:L165660-165673: `mp_teams_too_big = 1` when either side has **9 or more**
records, else 0. Its readers: `FUN_002c3cf0` (above: it suppresses the unbalance flag), `FUN_00559070` L422214-422250
(not read here), and the lobby script `Enable_SM_Launch`/`SwapClanSides`, which after a clan game's side swap
`WAIT 10` then waits `WHILE mp_teams_too_big == 1` before unlocking the game. So it guards the clan side swap; it does
not refuse a joiner (the per-game cap is the create screen's `MaxPlayersValve`, 2..16, `dlgCreateGame refresh_cg_screen`).

**Implementation suggestion.** None for the room (it caps sides itself). A lead for SVC-11 (clan games).

### 6.11 LATE_JOINER (unnamed; Harry62 `GameObject +0x2c LateJoiner`)

**Answer (BELIEVED: code and script read, the message codes' meaning not traced).** `late_joiner` (+0x2c) is written by
`FUN_002a7340` (D:L149273): to 1 in `FUN_002b9150` (D:L159280-159282) when a received game-state message's byte is 2 or
more (and not 0xe), to 0 when it is under 2 (D:L159264), at the load (D:L55711, D:L55716) and in `FUN_002bbfa0`
(D:L160946). In the lobby (`Enable_SM_Launch` -> `SetupLateJoiner`): caption 351 "Chat disabled for late joiners";
SWITCH TEAMS and Lock disabled; READY enabled; a popup 352 "This game has already started. Would you like to spectate
the game in progress?" for a spectator (`player_team == 16`), else 353 "... appear as a ghost in the current game, and
wait until the next round to join?"; on yes, `WHILE late_joiner == 1` the player list refreshes every 5 s; on no, the
lobby is left (`exit_lobby`). The port's ghost seat (research 91 §19 "late joiners") is the in-level half of this.

### 6.12 GAME_OBJECT_MISC_VALVES (unnamed; Harry62 GameObject)

**Answer (STRONG for the map).** `A1/game_valves.out`: the r0001 game object (0x14c bytes, allocated D:L152590,
pointer `DAT_00437ce8`, filled by `FUN_002a76d0` D:L149487-149674) is Harry62's `GameObject`; 22 of its valve slots carry
the names Harry gave (e.g. +0x34 `mp_x_sec_clock` = his `ForceClockTimer`, +0x50 `mp_prog_timer1` default 30, +0x58
`aiteam_00` = `SealsAliveCount`). `player_join_count` (+0x44) is set from a count in `FUN_002bc490` (D:L161094-161100);
`mp_persistent` (+0x4c) is sent as bit 7 of a status byte in `FUN_002a9ee0` (D:L150771) and `FUN_002c00f0`
(D:L163109) and used by the create/briefing/lobby scripts; `mp_prog_timer1` has no code reader by offset. PARTIAL: the
last two's meaning is not read. Harry's +0x64 `AllowRespawn` is not a slot of `FUN_002a76d0`.

### 6.13 GHOST_ROW_PLACEHOLDER (note only; research 91 §16)

**What it stands for.** "That `+0xfd1` (rows hidden from the scoreboard) is the ghost flag".

**What I did.** Every write of `+0xfd1` in the decomp; the list builder `FUN_0022de60` (Harry62: `SortPlayersByScore`)
D:L80577-80625 and its instructions (0x22df5c `lbu v0, 0xfd1(s3)`; `bnez` skips the row).

**Answer.** The hypothesis is refuted (STRONG): `+0xfd1` is written to 1 only in `FUN_002bef60` (D:L162533-162534),
which `FUN_0030ce80` registers as the fourth callback of the `SealState` net object (D:L162711-162712; the struct's name
string 0x3f27f0), and which also clears `+0xfcf` (Harry: `DoRespawn`) and removes the body (`FUN_005998b0`); it is
cleared by the round start / respawn rebuilds `FUN_00599b60` (D:L455671) and `FUN_00599f00` (D:L455841). It marks a
player whose net object went away (departed), not a ghost. The builder's filters are: not a spectator online
(`FUN_002c2fd0`), on the side asked (`FUN_002c30b0` / `FUN_002c31d0`), a name (+0x14), `+0xfd1 == 0`; at most 8 a side;
sorted by `+0x580` (total points) + `+0x5c8` (round points). With no ghost test there, a ghost's row is listed
(BELIEVED).

**Implementation suggestion.** Keep the ghost's row; drop a departed player's row at once (the port removes the player
on leave, which matches). Owed: a capture of the scoreboard with a ghost seated (ONL-19).

### 6.14 AUTOCOMM_TEXT_PLACEHOLDER (note only; research 91 §16)

**What I did.** `FUN_0058ed60` D:L449760-449885 (comm id -> command name); `orders.rdr` in `RUN/READERC.ZAR`
(`A1/dump_rdr.ts`, `A1/rdr_find.ts` -> `autocomm_rdr.out`, `orders_rdr.out`); `FUN_0053bbd0` D:L405451-405480 (reads
the `multiplayer` list, string 0x65b360, into the character record's `+0x3a0`); `FUN_005e7960` D:L498030-498239 (walks
`+0x3a4/+0x3a8` by id and formats the line with the speaker's name).

**Answer (STRONG).** 0x27 = `CMD_MP_ENEMY_DEAD` -> `SND_ENEMY_DEAD`, HudCLOC 60555 "%s : Enemy Killed"; 0x28 =
`CMD_MP_FRIEND_DEAD` -> `SND_FRIEND_DEAD`, 60556 "%s : Man down"; 0x44 = `CMD_MP_HOSTAGE_KILLED` ->
`SND_HOSTAGE_KILLED`, 60561 "%s : A VIP has been killed". The `%s` is the speaker's name (actor `+0x14`, D:L498075,
D:L498142). The whole `multiplayer` table (25 rows, `orders_rdr.out`) gives every MP auto-comm its sound and text.

**Implementation suggestion.** After a kill line, post the speaker's comm line in the message window and play the
`SND_*` (radio). Test: `netPageRound.test.ts` "a kill of an enemy posts '<killer> : Enemy Killed' on the killer's
side's pages, a team-mate's death '<victim> : Man down'". The routing (which pages hear it) is research 91 §10's
(0x27 said by the killer when the victim is not on the local team, else 0x28 by the victim).

### 6.15 NAME_MAXLEN_PLACEHOLDER (note only; research 91 §16)

**Answer (STRONG).** Research 119 §5 (SOCOM II's `GetTextInput` blocks, read from the disc's dialogs, and the PC
runtime's open-line log): the player-name keyboard `CREATEPLAYERNAME`, `_455_EnterPlayerName_MSG`, **MaxChars 14,
MaxBytes 31** (research 119 L193). The port's persona already uses `PERSONA_NAME_MAX = 14`
(`$PORT/packages/card/src/persona.ts:28`); the room accepts names up to 256 (`room.ts:215` `NAME_MAX`).

**Implementation suggestion.** `room.ts` `NAME_MAX` -> 14 characters and 31 UTF-8 bytes (refuse or cut), test
"a 15-character name is cut to 14".

### 6.16 RADIO_MENU_PLACEHOLDER (`$PORT/packages/viewer/src/netPage.ts:329`)

**Answer.** The tree and texts are sourced (research 91 §17.3: TACTICAL ORDERS, TAUNTS, RADIO, TEAMMATES > PLAYER n >
VOTE RETAIN:REMOVE / MUTE ON:OFF, SPECTATORS > VOTE ALL, MESSAGES). New: `orders.rdr`'s layout keys (`order_speed` 0.2,
`height` 24, `width` 140, `text_offset` 6,20, `text_size` 0.8, `.TCM_SLIDE`/`.TCM_SELECT`, `PTT_circle_down_time` 0.3)
are **not read by SOCOM II**: none of those key strings exists in the r0001 ELF (`A1` session: the only key it reads is
`multiplayer`, 0x65b360, by `FUN_0053bbd0`/`FUN_0053bef0`). So they are SOCOM 1 leftovers and must not be used. The
look is drawn by code (`FUN_00232bc0` D:L83285-83718, builder `FUN_002344e0`, `TCM.tif`), not read here. PARTIAL.

**Owed evidence.** A read of `FUN_002344e0`'s draw, or a capture of the open TCM (Circle) online.

### 6.17 QUEUE_TEXT_PLACEHOLDER (`$PORT/packages/viewer/src/netPage.ts:233`)

**Answer (NOT-A-GAP, STRONG).** The original has no queue: a game's size is the create screen's `MaxPlayersValve`
(`dlgCreateGame` `refresh_cg_screen` offers 2, 4 ... 16, `uizanim_valves.out`) plus `MaxSpectatorsValve`; a join past it
fails ("Too many spectators" 0x3f24b0 for spectators, research 91 §17.1). The page's line is its own; keep it.

### 6.18 CLIENT_FINAL_EXIT_PLACEHOLDER (note only; research 91 §18 Placeholders)

**What it stands for.** Whether non-host clients leave `FinalReally` at once or wait for the host.

**What I did.** READERX `dlgMultiplayerFinalReally.rdr` (source) and the commands' code: `CloseAndSwitch` =
`FUN_00281a70` D:L128101-128133, `ReplayMission` = `FUN_00280040` D:L127379-127395 (rows in `uicmd_table.out`).

**Answer (STRONG).** The script's `ExitOnStart` (not banned) calls, for a non-master, `CloseAndSwitch
dlgGameLobby.rdr` then `watch_for_switch_to_master`; for the master, `watch_for_switch_to_client`, which calls
`call_gamelobby` (`WAIT 10`, then `return_to_gamelobby`: stop `ExitOnStart`, `player_ready_count = 0`,
`mp_x_sec_clock = 11`, `CloseAndSwitch dlgGameLobby.rdr`). `FUN_00281a70` online and **not host** only copies the dialog
name into the menu state (D:L128114) and returns: the client stays on GAME COMPLETE. Online **host**: game state 5
(`FUN_002a7490`, D:L128124) or a pop to the menus, then `FUN_002c00f0` (the state report). So every client leaves when
the host does, 10 s after GAME COMPLETE starts (sooner through `MaintainDoneCounting` when `DoneCounting == 1`), into the
same game's lobby with the 11 s launch clock armed. `ReplayMission` has the same split (host: state 5 and report; client:
nothing), so ROUND COMPLETE's `WAIT 5` + `ReplayMission` loop also waits on the host. A master migration mid-screen is
handled by the two watch loops (1 s polls of `IsSessionMaster`). `TimeoutMonitor`: 90 s on any of the three screens,
then `dlgNetError.rdr`.

**Implementation suggestion.** The room is the host: GAME COMPLETE's hold is the host's 10 s (`room.ts:112` `GAME_COMPLETE_S = 10`, which
matches; `ROUND_COMPLETE_S = 5` matches ROUND COMPLETE's `WAIT 5`, `FINAL_ROUND_S = 10` FINAL ROUND's 20 half-second steps). Test: "the room returns the pages to the waiting state 10 s after
GAME COMPLETE starts". A page cut off for 90 s on a round screen shows the net error (ONL-22).

### 6.19 CLASSIC_WAITING_PLACEHOLDER (`room.ts:431`, `:908`, `:1454`, `:2205`; `net/protocol.ts:468`)

**Answer (NOT-A-GAP, STRONG).** The original never plays a round with a side empty: it waits in its game lobby (the
launch is refused while `mp_team_unbalance == 1`, TEAM_UNBALANCE above) and abandons a game whose sides empty
(`FUN_002c4500` D:L165674-165676 posts 0x3f2a50; research 91: `dlgNetAbandoned`). The room's walking waiting state is the
page's stand-in for a lobby it does not have (ONL-16). Keep it named.

### 6.20 WAITING_LINE_READING (`$PORT/packages/viewer/src/netPage.ts:262`)

**Answer (RESOLVED, STRONG).** The text is the original's for this state: UIMnLOC 356 "There must be players on both
teams to launch." (`uimnloc_lobby.out`), shown by `launch_10sec_anim` as a popup for 3 s when the host's launch meets an
empty side; UIMnLOC 350 ("The READY button will be available in 30 seconds. There must be players on both teams to
launch. ... CONTINUE.") is the host's popup on first entering the lobby (`Enable_SM_Launch`, locale 0x15e). Only the
placement (a message-window line in a walking room) is the page's.

### 6.21 SOLO_ROUND_PLACEHOLDER (`room.ts:63`, `net/loopback.ts:31`, `net/rules.ts:79`)

**Answer (NOT-A-GAP, STRONG).** Confirmed by TEAM_UNBALANCE: the original has no one-sided round to copy.

### 6.22 LOAD_NET_HOLD_READING (`$PORT/packages/viewer/src/loadingJoin.ts`; research 125 §7)

**What it stands for.** What the game object's byte `+0xd0` that the online load waits on means.

**What I did.** `FUN_001f5e70` D:L55676-55760; `FUN_002b83e0` D:L158829-158890; `FUN_002c4020` D:L165416-165441;
`FUN_002c2fa0` D:L164599-164606.

**Answer (STRONG).** A **host barrier**. Each loader sets its minor state `+0x115 = 2` (loaded, D:L55699-55702) and
reports it (`FUN_002c5360`); the lobby records carry each player's states at `+0x40/+0x41` (D:L165377-165378). The host
(D:L55689-55697), while `+0x112 == 1`, calls `FUN_002c4020`, which passes when no non-spectator record has `+0x40 == 2`
with `+0x41 != 2`; it then sets `+0x112 = 2` and reports (`FUN_002c00f0`). A client sets `+0xd0 = 1` when `+0x112 == 2`
arrives (or the game is already in play, `+0x113 == 3`, D:L55704-55708); `+0xd0` then lets the 0.5 s fade finish
(D:L55748-55752). Spectators (bit 0x10000) are not waited for.

**Implementation suggestion.** The round's clock should start only once every seated page reports loaded: a room
barrier (`loaded` up, `start` down), waiting for non-spectators only. Test: `room.test.ts` "round 1's clock starts when
the last seated player reports loaded; a spectator's load is not waited for". (ONL-18 / SVC-07a, as research 125 says.)

### 6.23 LOAD_NET_HOLD_CEILING_PLACEHOLDER (`loadingJoin.ts:74`) and loadingJoin.ts:69 (comment)

**Answer (NOT-A-GAP, STRONG).** The load state has no timer. `FUN_002b83e0` is the DME session join (`FUN_0030d060` with
callbacks 0x2bc490/0x2bc400; the host flag `DAT_0045a0c0` is set when the client's id equals the host's); a failed join
(return 0) aborts the load to `dlgNetError.rdr` (0x3e2f60, D:L55718-55721); a game found back in the lobby or over
(`+0x113` 1 or 6) aborts to `dlgNetAbandoned.rdr` (0x3e2f70, D:L55735-55745). `FUN_002c2fa0` is
`FUN_002f6d00(0x44f370)` (Harry62: `CheckIfSpectator`): not a spectator -> `+0xd2 = 1` (D:L55725-55727). The 20 s is the
page's own guard; keep it. Update the comment at `loadingJoin.ts:69` with these reads.

### 6.24 multiplayer.ts:44 (comment)

NOT-A-GAP: "the address and the remembered choice are not read at all" describes the page's own code path.

---

### 6.25 Sourced but not implemented (multiplayer)

- **The spectator eject vote** ("VOTE ALL", > 60 % of players, then no spectators: research 91 §17.1) -- the port has no
  equivalent (`grep eject|MaxSpectators` in `match/src/room.ts`: none).
- **The hostage maps' minute penalty** (MP_PENALTY above) and the hostage/VIP kill lines and sounds (`SealKill*`,
  `HostKill*` sequences).
- **The auto-comms** (AUTOCOMM above): the radio line and sound after a kill, a team-mate's death, a VIP's death; and the
  rest of the 25-row `multiplayer` table (`CMD_MP_GRENADE_THROWN` "Fire in the hole", `CMD_MP_UNDER_FIRE`, ...).
- **The round screens' 90 s net-error guard** (`TimeoutMonitor`: `WAIT 90` -> `dlgNetError.rdr` on all three screens).
- **The load barrier** (LOAD_NET_HOLD above).
- **The lobby's late-joiner choice** (352 spectate / 353 ghost, chat disabled 351) -- ONL-16.

### 6.26 Leads for other workstreams

- **Round screens (D):** READERX holds the SOCOM II layout of `dlgMultiplayerRound`, `dlgMultiplayerFinal`,
  `dlgMultiplayerFinalReally` as source (positions, fonts, `multplay_back.tif`, `backsolid.tif` panels, e.g. `Team_back`
  at (5, 20) opacity 0.4 size 300x150; `NextMission` at (380, 50); `CountDown` child +130 at scale 1.2; ROUND COMPLETE's
  `CountDown` is 10 -> 1 at 0.5 s steps then `_2111_GO_MSG`; FINAL ROUND's is 20 -> 1 then `SWITCHMENU
  dlgMultiplayerFinalReally.rdr`). `A1/readerx_dialogs.out`. This should retire most of the round-screen placeholders.
- **Scoreboard (ONL-19):** the list sort key is `+0x580` + `+0x5c8` (total + round points), 8 rows a side,
  `FUN_0022de60` D:L80613.
- **Hostage workstream:** `MP6/MP10/MP11/MP71` `objectives` scripts (`pen_MP*.dec`): `rescuecount`, `freecount`,
  `killcount`, `mp_hostages_by_seals/turds`, `Rescue1..3`, `Lead1..3`, `SEALcheck`, messages "A HOSTAGE HAS BEEN
  RESCUED", "A HOSTAGE IS BEING ESCORTED" -- `A1/mp6_penalty.dec` is a full decode of MP6's.
- **Clan games (SVC-11):** `SwapClanSides` (side swap each match via `ClanSwapSidesIndex`, wait 10 s and while
  `mp_teams_too_big`).
- `zdecode.py` decodes IF/VALVE/MESSAGE/UI commands with names: reusable for ROUND_CUE_CONDITIONS (the `2b 22 n` tokens:
  1 `!`, 4 `(`, 5 `)` as READERX's source text shows for `IF ["!", [IsSessionMaster]]`).

## 7. Part A2 -- server tolerances and policies, the ARMORY stand-ins, the wire

Scripts: `scratch/C1/A2/` (README.txt).

`$PORT` = the agent/online snapshot. The original is peer to peer with a
session host (`DAT_0045a0c0` host, `DAT_0045a0c1` online; research 91 §17); each console fires its own rounds and applies
damage only from rounds flagged local (`FUN_005abbc0` D:L464698, research 91 §23). The port has an authoritative match
server, so every check the server makes of a page has no counterpart in the original: such items are NOT-A-GAP, with
the original's analogous mechanism stated.

| item | status | grade | one-line answer |
|---|---|---|---|
| CONE_WINDOW_PLACEHOLDER | NOT-A-GAP | -- | server tolerance; the original's shooter alone runs its cone |
| CONE_SLACK_PX_PLACEHOLDER | NOT-A-GAP | -- | as above |
| ROOT_POSE_SLACK_PLACEHOLDER | NOT-A-GAP | -- | server tolerance; the 3.6 jump lift is the clips' own |
| STANCE_CHANGE_TICKS_PLACEHOLDER | PARTIAL | STRONG (the clip lengths) | the transitions last 37 / 51 / 57 ticks (stand-crouch / crouch-prone / stand-prone): the window can be sourced per transition; 60 is a safe upper bound |
| ROUND_SPEED_SLACK_PLACEHOLDER | NOT-A-GAP | -- | float tolerance on `MV x dir` |
| THROW_SLACK_READING | NOT-A-GAP | -- | server tolerance around `ComputeMaxVel` |
| CHARGE_GROUND_SLACK_PLACEHOLDER | NOT-A-GAP | -- | server tolerance; the console set its own charge |
| KEPT_RECONNECT_READING | NOT-A-GAP | -- | the game has no reconnect |
| TAKEOVER_ROW_READING | NOT-A-GAP | -- | the game has no takeover |
| DEPARTED_CHARGES_READING | PARTIAL | BELIEVED | the original never clears a charge's owner (+0xac) on a departure: the charge stays, counted against a stale owner, and no one's Detonator can fire it -- the port's "no one's, where they lie" matches in effect |
| REPLACED_LINE_READING | NOT-A-GAP | -- | the page's own line; no case in the game |
| KNOCK_REPLAY_PLACEHOLDER (retired 2026-10-22) | retired | -- | was the page's reconciliation; the knock is replayed from the kept command (`FUN_0057e770`) |
| SERVER_TEXTS_PLACEHOLDER | NOT-A-GAP | -- | the owner's content (HUMAN_TASKS H73), not a game value |
| SOLO_IS_NETWORK_READING | NOT-A-GAP | -- | the page's single-player match has no original |
| ARMORY_ABANDON_READING | NOT-A-GAP | -- | stand-in for the lobby (the original's abandon leaves to the lobby) |
| ARMORY_OUTSIDE_ROUND_READING | NOT-A-GAP | -- | stand-in for the lobby's ARMORY |
| ARMORY_SEAT_READING | NOT-A-GAP | -- | stand-in for the lobby's ARMORY |
| ARMORY_SERVER_NAME_READING | NOT-A-GAP | -- | ruled (the controller, 2026-10-01); `MEDIUS_LOBBY_NAME` has no match-server counterpart |
| ARMORY_TYPE_FALLBACK_READING | RESOLVED | PROVEN | the profile's re-validation script: a stored type outside 1-4 (SEAL) / 5-8 (Terrorist) becomes type 1 / 5; a stored item the map's `Enable_*` valve refuses is skipped (the type's default stays in that slot) |
| PICK_WIRE_READING | NOT-A-GAP | STRONG (the original's path) | the original reads the kit from the player's replicated net object at the remote body's respawn (`RemoteRespawn`); the port's `spawn` carries it at the same moment |
| NET_PICKUP_MSG_TYPE_PLACEHOLDER | RESOLVED (identity) / NOT-A-GAP (value) | PROVEN | the word is the 'Wep PU' packet's ID slot (r0001 0x440e48 = r0004 0x44d868), filled at run time by the packet registration; no constant to port |
| ROUND_START_PROJECTILES_READING | PARTIAL | BELIEVED | the round-start method (`FUN_00223680`) belongs to `CMPExitState` and re-places the players; the projectile manager's clear is in the level's load/teardown; that the next round passes through it is still read from research 91, not traced |
| OWN_BLOOD_READING | NOT-A-GAP | -- | the room's authority; the original's shooter plays its own round at once (capture would measure it) |
| REMOTE_RELOAD_SOUND_READING | PARTIAL | BELIEVED | the reload timer `kit+0x820` has three writers: the local pad (`FUN_00594cf0`) and the kit's fire step `FUN_005c5340` twice (the empty-magazine reload); a peer hears a reload only where its copy of the actor runs one -- an automatic reload in the replayed fire path is the candidate, a manual one is not sent |

#### STANCE_CHANGE_TICKS_PLACEHOLDER (`packages/viewer/src/net/shotCone.ts:53`)
- **What it stands for.** Ticks after a posture change during which the server lets the posed root stand anywhere
  between the two stances' heights (the page's camera stands on the clip's root; the server has only the stance's).
- **Current value.** 60.
- **Prior search.** Research 91 §16: "the change clips' lengths are not read into the server".
- **What I did.** `A2/stance_change_ticks.py` takes the three transitions from `mover.ts` `ACTION_CLIPS` (motion.rdr
  `playback` and MOTION_P.ZAR key counts, pinned against the disc by `viewer/test/movementTables.parity.test.ts`) through
  `FUN_0028c4f0`'s one-shot length, playback x ((n-1)/n)^2 (`locomotion.ts` `oneShotSeconds`).
- **Answer.** Stand -> Crouch 0.6027 s = 36.2 ticks (ceil 37); Crouch -> Prone 0.8463 s = 50.8 (51); Stand -> Prone
  0.9452 s = 56.7 (57). Grade STRONG for the lengths (disc data through a read formula); the tolerance itself stays the
  page's own. Getting up plays the same clip backwards (mover.ts L737), assumed the same length.
- **Implementation suggestion.** Keep the window a tolerance but derive it: `STANCE_CHANGE_TICKS = ceil(ACTION_SECONDS[t]
  x TICK_HZ)` for the transition `t` the server saw (`shotCone.ts` L252 knows both postures), i.e. 37 / 51 / 57; or keep
  one bound of 57. Test first: a shot 58 ticks after Stand -> Prone with the root at the midpoint is refused, at 56 taken.
- **Owed evidence.** None for the length; the backwards play's speed (getting up) is a mover reading.

#### DEPARTED_CHARGES_READING (`packages/match/src/room.ts:203`)
- **What it stands for.** What happens to a departed player's placed charges and rounds in flight.
- **Current value.** `'no one\'s, where they lie'`.
- **Prior search.** Research 95 L1092: the destructor's `FUN_003c7d50` clears another field (`+0x1c` of kind-5
  records), not the owner `+0xac`; "whether the game's charges stay counted against, or can be set off by, a departed
  body is unread".
- **What I did.** Read the destructor's tail (`D:L419170-419200`: `FUN_003ccd90` over 0x4b5220 only) and every write of
  a projectile's `+0xac` in the projectile code: set at the spawn (`FUN_003cb1a0` D:L320745, the owner argument), zeroed
  only at construction / free (D:L318342, D:L320811, D:L324995). `FUN_003cc1f0` (D:L321194-321216) counts per owner by
  pointer.
- **Answer.** No departure path clears `+0xac`: a departed player's charge stays in the level owned by a freed body
  pointer; it counts against no live player and no live Detonator matches it (`CZKit_DetonateRemoteExplosives`
  0x5c0130's owner test, research 95). BELIEVED (absence of a writer is a read, not a trace).
- **Implementation suggestion.** None: the port's policy agrees in effect. Record the read in research 95's row.
- **Owed evidence.** A two-console capture: a player sets a claymore and leaves; does the claymore stay drawn on the
  other console, and can anything set it off.

#### ARMORY_TYPE_FALLBACK_READING (`packages/match/src/room.ts:788`)
- **What it stands for.** The type a player gets when the stored/requested type is not one the side offers.
- **Current value.** The side's default (index 0 / 4: SEAL 1 / TERRORIST 1).
- **Prior search.** Research 95 §4.4 / L1021: "re-validates a stored profile's items against the map's valves
  (`EquipCharacterProfileSeal/Merc*`); the failure's handling not read".
- **What I did.** The two names are not UI commands in the ELF (`A2/equip_profile_cmd.py`: no string in the r0001 ELF;
  `ChangeCharacterType` is, row 0x3dda54 -> `UIChangeCharacterType` 0x2795e0). They are animations of the UI zAnim set
  `UICharacterProfile.rdr` in `RUN/UIZANIM.ZAR` (called from `dlgGameLobby.rdr`). Decoded with the port's
  `parseAnimSets` + `decodeUiProgram` (`A2/dump_ui_set.ts` -> `EquipCharacterProfileSeal.out`, `...Merc.out`).
- **Answer.** `EquipCharacterProfileSeal`: `MpCharSet` 1-4 -> `ChangeCharacterType(n)` and `UiCharSet` 1/2/4/8;
  **any other value -> `MpCharSet` = 1, `ChangeCharacterType(1)`**; then `...SealWeapons` and `...SealEquipment` choose
  each stored item only if it equals a known id **and** its `Enable_<item>` valve has bit 1 (`ChoosePrimary`,
  `ChooseSecondary`, `ChooseEquip1..3`); a refused item's `else` branch is empty, so that slot keeps what
  `ChangeCharacterType` gave. `EquipCharacterProfileMerc`: 5-8 likewise, else `MpCharSet` = 5, `ChangeCharacterType(5)`
  (and `UiCharSet` = 32, where type 5's own branch sets 16 -- a disc inconsistency, recorded not judged). PROVEN (the
  disc's script, decoded by the port's own reader).
- **Implementation suggestion.** The room's rule already matches for the type (default index 0 / 4). For the kit, the
  ARMORY's re-validation (`ARMORY_PROFILE_REVALIDATE_READING`, C4's) should keep the type and drop **only** the refused
  item to the type's default in that slot, not the whole kit. Test first: a stored profile with one disabled
  primary on a map keeps its secondary and equipment.
- **Owed evidence.** None for the rule; whether a map's side can lack one of the four types (the room's case) is the
  ARMORY's data, not this script.

#### PICK_WIRE_READING (`packages/viewer/src/net/protocol.ts:380`)
- **What it stands for.** How the confirmed kit reaches the other consoles.
- **Current value.** The page's `loadout` request; the room replays the picks and a `spawn` carries the kit.
- **Prior search.** Research 94 L640/L986: "the spawn/character message carries `character+0x540`'s weapons [not traced]".
- **What I did.** `FUN_00598b90` (D:L454979-455345; Harry: `RemoteRespawn__10CZSealBodyFb`): online and for a body whose
  controller does not answer local (D:L455070-455077), it takes `FUN_002bd3d0(body)` (D:L161729-161745: the net object
  found by the body's id `+4` through `FUN_00622818`, its data `+0x1c` + 0x34) and hands it to `FUN_0053ec60`
  (D:L407354-407382), which rebuilds the kit at `+0x2e8` from eight `{item id u16, u16, u16}` entries.
- **Answer.** The original replicates the kit as part of the player's shared net object and applies it at the remote
  body's respawn. STRONG (decomp + Harry's mangled name). The port's `spawn` carrying the kit is the same moment.
  NOT-A-GAP.
- **Implementation suggestion.** None. Feeds `REMOTE_KIT_APPLY_PLACEHOLDER` (part E): "which object" = the net object of
  `FUN_002bd3d0`, "when" = `RemoteRespawn`.

#### NET_PICKUP_MSG_TYPE_PLACEHOLDER (*note only*, research 94 L586)
- **What it stands for.** `DAT_00440e48`, the message type `SendWeaponPUMessage` passes to the sender.
- **What I did.** `A2/map_data.py`: r0001 `FUN_002ba660` loads 0x440e48 where its r0004 twin loads 0x44d868 (the same
  instruction offset +0x190); the whole block maps r0004 0x44d820 + 8k = r0001 0x440e00 + 8k (`packet_ids_map.out`).
  `A2/packet_registry.py`: `FUN_002b8660` (D:L158940-159171) registers each in-game packet with
  `FUN_0030cff0(0x45a0c0, &id_word, handler, name)`.
- **Answer.** 0x440e48 is the ID word of the packet registered as **'Wep PU'** (D:L159090, handler `FUN_002ba4e0`,
  22 bytes: 2 + 5 x 4), written at registration. PROVEN for the identity; the number itself is run-time and has no use
  in the port's protocol. (Harry's `PacketType*` statics at r0004 0x47598c.. are not referenced by any lui/lo pair in the
  r0004 ELF; the live words are 0x44d820.., which Harry annotates "damage packet ID", "taunt", "chat", "vote ID",
  "switch teams".)
- **Implementation suggestion.** Close the row as identified; the dropped-weapon pick-up itself is a feature gap (below).

#### ROUND_START_PROJECTILES_READING (`packages/match/src/room.ts:929`, `:2307`)
- **What I did.** `FUN_00223680` (Harry: "round start"; D:L75899-75965) has no direct caller: its only pointer is the
  word 0x405794, slot 3 of the vtable at 0x405788 whose type info (0x405780 -> 0x3e5218) names **`CMPExitState`**
  (string 0x3e51f8). It re-places every non-ghost player (`FUN_00598b90(p,0)` D:L75931) and calls no projectile clear;
  the manager 0x4b5220 is reset only by `FUN_001ea720` (D:L49727, called by `FUN_001ebba0` D:L50650 from the game state's
  entry D:L55654) and freed by `FUN_001eb8c0` (D:L50598, D:L50613).
- **Answer.** BELIEVED, as before: the next round empties the air only if the round-to-round path passes the game
  state's entry; that link (`CMPExitState` -> game state) is still untraced.
- **Owed evidence.** A recomp trace (PLAT-36) of a classic round's end with a grenade in the air: whether `FUN_001ea720`
  or `FUN_001eb8c0` runs before `FUN_00223680`.

#### REMOTE_RELOAD_SOUND_READING (`packages/viewer/src/netPage.ts:194`)
- **What I did.** The reload timer `kit+0x820` (whose expiry runs `FUN_005c2a90`, D:L476549-476560) is set only by
  `FUN_005c32b0` (D:L477655-477680), whose callers are the local pad's request (`FUN_00594cf0` D:L453463) and the kit's
  fire step `FUN_005c5340` (D:L479320, D:L479342: the empty-magazine reload). `FUN_005c2a90` is also run by the AI's
  `FUN_005fe880` (D:L510425).
- **Answer.** PARTIAL, BELIEVED: a peer can hear another player's automatic reload only if the peer runs that
  player's fire step on its copy (the replicated round's path, untraced); a manual reload has no sender (no packet in
  the registry below carries it). The port's "every page hears every reload" may be more than the original.
- **Owed evidence.** Two consoles: player A reloads by hand with a full magazine minus one; does B hear it?

#### The NOT-A-GAP rows, one line each
- CONE_WINDOW / CONE_SLACK_PX / ROOT_POSE_SLACK (`net/shotCone.ts:44`, `:46`, `:51`), ROUND_SPEED_SLACK (`room.ts:245`),
  THROW_SLACK (`room.ts:252`), CHARGE_GROUND_SLACK (`net/placing.ts:33`): the original has no referee; the shooter's /
  thrower's / placer's console decides alone (local-only damage, `FUN_005abbc0` D:L464698). Keep them named as server
  tolerances (research 101 already files them "the page's own", SVC-23).
- KEPT_RECONNECT (`room.ts:163`), TAKEOVER_ROW (`room.ts:185`), REPLACED_LINE (`netPage.ts:277`): a departure in the original is a leave (`FUN_002bc530` D:L161109-161146; research 315 §3.3); no reconnect and no
  takeover exist to copy. `KNOCK_REPLAY_PLACEHOLDER` was retired 2026-10-22: the page replays the knock from the command the room laid it after (`FUN_0057e770`, research 85 §12.1).
- SERVER_TEXTS (`server/serverTexts.ts:103`): owner content (H73).
- SOLO_IS_NETWORK (`net/loopback.ts:34`): the page's single-player match.
- ARMORY_ABANDON / ARMORY_OUTSIDE_ROUND / ARMORY_SEAT / ARMORY_SERVER_NAME: the lobby's ARMORY (ONL-16/17) replaces them;
  the lobby's own script is decodable now (`A2/dlgGameLobby_READERC.out`, the `UIZANIM.ZAR` set `dlgGameLobby.rdr`).
- OWN_BLOOD (`netPage.ts:204`): a consequence of the room's authority.

#### Sourced but not implemented (from this part)
**The original's in-game packet registry** (`A2/packet_registry.out`; `FUN_002b8660` D:L158940-159171; name strings read
from the ELF; sizes from the `FUN_00620c60` field declarations) against the port's protocol (`viewer/net/protocol.ts`):

| packet (slot) | bytes | handler (D:L) | port counterpart |
|---|---|---|---|
| Hit (0) | 8 | `HitPacketHandler` FUN_002bbbd0 (160807) | `fire`/`shot`/`hurt`/`kill` (server-side damage) |
| Action Anim (1) | 8 | FUN_002bb310 (160503) | snapshot action codes |
| Action Points (2) | 4 | FUN_002bb770 (160656) | none (unread) |
| Push Blend (3) | 8 | FUN_002bba80 (160756); sender `NetSendPushBlend` FUN_002bbaf0 | `flinch` (research 91 §21: the flinch goes out on this path) |
| Anim (4) | 8 | `ZAnimNetworkPacketHandler` FUN_002bb7f0 (160677) | `door` for doors only; other networked zAnims (map objects, destructibles) none |
| AI Orders (5) | 3 | FUN_002bb8e0 (160706) | none (no AI in MP rounds) |
| E3 Index (6) | 5 | FUN_002baf30 (160326) | none (unread) |
| Message (7) | 4 | FUN_002bac40 (160198); Harry "taunt packet" | none: radio messages / taunts (the TCM, SVC-19) |
| Chat (8) | 5 | FUN_002ba9d0 (160120) | `chat` |
| Wep PU (9) / Wep Ammo PU (10) / PU May I (11) / PU OK (12) | 22 / 17 / 7 / 8 | FUN_002ba4e0, FUN_002ba370, FUN_002ba260, FUN_002ba1a0 | **none: dropped weapons and their pick-up** (a host-arbitrated may-I / OK pair) |
| ClimbAsk (13) / ClimbOK (14) | 6 / 4 | FUN_002b9f10 (159690), FUN_002b9e20 (159641) | **none: a host-arbitrated climb.** Sender `FUN_002b9f60` (D:L159706-159744): a non-host sends ClimbAsk {u16 id, u8, u16} to the host (`FUN_0030d560`, Harry's "get host ID"); the host (or a host asking itself) runs `FUN_005b1350` and answers ClimbOK through `FUN_002b9e50` (D:L159653-159685) to the asker's `+0xfc8` client, whose handler runs `FUN_005b1130`. What `FUN_005b1350` decides (one climber per ladder/ledge?) is unread |
| Names (15) | 6 | FUN_002b9b20 (159546) | unread (the name suggests the roster; not compared) |
| Voter (16) | 3 | `VoterPacketHandler` FUN_002ba040 (159749) | `vote`/`votes` |
| Spec Vote (17) | 3 | FUN_002b9bd0 (159578; Harry `SpectatorVoteReceiver`) | **none: the vote to eject the spectators** |
| Reject (18) | 4 | FUN_002b9d80 (159619) | unread |
| Team Switch (19) / All Switch (20) | 4 / 4 | FUN_002bae70 (160290), FUN_002badc0 | **none: switching sides** |
| Bomb (21) | 15 | FUN_002b9a00 (159504) | none (DEMOLITION's bomb) |
| Game Signal (22) | 13 | FUN_002b9150 (159172) | partly `roundStart`/`roundOver`/... (unread) |
| Alert (23) | 12 | FUN_002b98b0 (159440) | none (research 91 §17's "Alert {1, before, after}") |

Each "none" is a candidate feature; the handler lines above are where to read each one's rule.

#### Leads for other workstreams
- Part E / C4: `REMOTE_KIT_APPLY_PLACEHOLDER` -- the object and moment above; `ARMORY_PROFILE_REVALIDATE_READING` -- the
  per-slot rule above.
- Part A1: the 'Alert' (slot 23, 12 bytes) and 'Spec Vote' (slot 17) handlers; the lobby script (`dlgGameLobby.rdr`
  in READERC and UIZANIM) names `mp_teams_too_big`, `mp_team_unbalance`, `late_joiner`, `Watch45SecClock`,
  `ForceLaunch` -- decodable with `A2/dump_ui_set.ts dlgGameLobby.rdr`.
- C3: `PLACE_REST_LIFT_READING` (placing.ts:23, `FUN_005bc730`) was not read here.

## 8. Part B -- the damage path

Scripts: `scratch/C1/B/` (README.txt).

`$PORT` = `$PORT`.
`D:L` = line of `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001). Scripts and their outputs are in
`scratch/C1/B/` (README.txt there). The ELF is `game/disc/socom2_game.elf` (r0001), read through `scratch/C1/c1lib.py`.

### 8.1 Summary

| item | status | grade | answer |
|---|---|---|---|
| FRIENDLY_FIRE_ENFORCEMENT_PLACEHOLDER (note only) | RESOLVED | STRONG | FF off = `CZSealBody::OnWeaponHit` (FUN_005ac670, missing from the decomp) drops a hit whose projectile owner is another player sharing a team bit with the victim, before any damage, knock or blast queue. One flag (`DAT_0044cdb8`), one reader. Covers bullets, launched rounds and blasts; self-hits always pass; blood still plays. |
| NET_DAMAGE_CLAMP_PLACEHOLDER (note only) | RESOLVED | PROVEN (values) / STRONG (use) | The hit packet (msg 0x40, 8 bytes, FUN_002bbda0) sends damage as an int clamped 0..255, piercing x20 as an int clamped 0..255 (0.05 steps, max 12.75), part clamped 0..15. A remote victim takes the truncated integer. |
| STUN_EFFECT_PLACEHOLDER (note only) | PARTIAL | BELIEVED | No reader of ammo `+0x10` (`Stun`) found by four searches. The game's stun system uses fixed per-item timers instead. It is most likely unused data. |
| RECOVERY_FACTOR_PLACEHOLDER (note only) | RESOLVED | STRONG | `recovery_factor` (character type `+0x2f8`, int) is the rate per second at which the seven stun timers `body+0xfe0..+0xff8` count down (FUN_005a50a0). A player sees no effect beyond the flashbang's own white-out. |
| DOUBLE_AMMO_LOAD_PLACEHOLDER (note only) | NOT-A-GAP | (STRONG, research 94 A7) | Already resolved by research 94 §A7 and built (`viewer/src/loadout.ts` `withDoubleAmmo`). The 101 ledger row is stale. |
| SHOTGUN_MP_PELLET_DAMAGE_SCALE_READING | RESOLVED | STRONG | **raw**, not scaled. Online, the victim's console applies each pellet as the weapon's first ammo's raw `ImpactDamage` (12 Gauge 2.5) with no x14, no falloff and no `Damage_Modifier`. The packet's damage only gates it (> 0). The port's `'scaled'` contradicts the code. |
| IMPACT_HIT_READING | RESOLVED | STRONG | The struck node's handler is `CSealEx::OnWeaponHit` -> FUN_005ac670 -> FUN_005ab850. A non-explosion projectile goes to FUN_005abbc0 -> FUN_005a5a80 -> GetDamage's impact branch, x14, on the node's part, cause 5. This is what the room does. |
| IMPACT_SIGHT_READING | PARTIAL | BELIEVED | The blast's sight line starts at the blast object's own `+0x48`, with no lift (FUN_005ac070 D:L464853). An impact detonation turns the projectile itself into the blast (kind 5) in place. Where `+0x48` sits against the struck surface is not read. |
| BLOWBACK_CONSUMER_READING | RESOLVED | STRONG | `body+0x1314..+0x1324` is read only by the knock, FUN_0057e770 (strength `+0x1320`, radius `+0x1324`). Online the victim's console sets it from the hit packet: received damage x the blowback falloff, radius 100, source the shooter. The shotgun knocks; the port builds no push. |
| CLAYMORE_CONE_POINT_READING | RESOLVED | STRONG | Feet: GetDamage's cone test (FUN_003c7280, half-angle constant 0x3fbc7edd = 1.4726 rad) gets the actor's `+0x1c`, the ground contact the mover holds. The room is right; the page's feet + 10 is wrong. |
| BODY_PENETRATION_READING (note only) | RESOLVED | STRONG | A bullet goes on past a body. Its remaining range becomes min(range, range x (1 + 0.1 x piercing) x PERSON's penetration). Only launched rounds and rockets stop. The room's stop at the first body is a deviation. |
| KNOCK_LANDING_GATE_READING (note only) + net/damage.ts:139 | RESOLVED | STRONG | The only writer of `body+0x105c` bit 3 is `CAiSRescued`'s signal handler (FUN_005594b0, online). Nothing clears it. On a player it is always clear, so the knock landing's x1.2 always applies (the port's behaviour). |
| HEAD_NODE_NAMES_PLACEHOLDER (note only) | RESOLVED | PROVEN | `hips` / `head` / `neck` at 0x65c4f8 / 0x65c500 / 0x65c508 (ELF strings). The whole node table and its part mapping are read. The port already matches. |
| DEATH_SOUND_IDS_PLACEHOLDER (note only) | RESOLVED | STRONG | 0x3c = `CHRSND_DEATH`, 0x3d = `CHRSND_DEATH_QUIET` (switch FUN_0053c3a0). A headshot (cause 3) plays the quiet one, other deaths `CHRSND_DEATH`, cause 6 none. The port plays no death voice. |
| HIT_VOLUMES_PLACEHOLDER | NOT-A-GAP | -- | Used only as a fallback when the skeleton does not load (`skeletonVolumes` otherwise). |
| SPINELO_RADIUS_PLACEHOLDER | PARTIAL | BELIEVED | The game has no capsules. The part comes from the struck polygon's node (node table read). `spinelo` moves no vertex most, so it probably owns no struck geometry. Either way the region is BODY, so the radius only fills a gap. |
| comment net/damage.ts:202 ("whether the raw one is scaled ... not traced") | RESOLVED | STRONG | Not scaled (see the shotgun item). |
| comment server/room.ts:1973 ("the handler itself not traced. Friendly fire off ...") | RESOLVED | STRONG | The handler is traced (see the impact and friendly-fire items). |

Counts: 13 RESOLVED (of which 2 are comment rows), 3 PARTIAL, 2 NOT-A-GAP, 0 UNRESOLVED.

**An important caution for every workstream.** Harry62's data labels in r0004 `0x4759xx..0x476xxx` (`PacketTypeHit`
0x47598c, `PacketTypeVoter` 0x4759bc, `m_VotedOff__14CZPersonaState` 0x475aac, `m_allow_friendly_fire__10CZSealBody`
0x475cb8, `m_NetStructIndexGameObject` 0x475a80, ...) are the **SOCOM 1 demo's ELF symbol addresses**
(`game/demo_scus_972_05/SCUS_972.05` symtab, exact matches, `thunk_check.out` / `ff_trace.out` (1)). Neither r0001 nor
r0004 code references the region `0x462000..0x47f000` at all (`range_scan.py`, a lui/lo scan over every segment). They
are names, not SOCOM II addresses. Function labels inside SOCOM II code (vote, ban, damage packet) remain good.

---

### 8.2 FRIENDLY_FIRE_ENFORCEMENT_PLACEHOLDER (note only; 91 §16; the port: `match/src/room.ts` L1562, L1983, L2031)

**What it stands for.** What friendly fire off actually does in the original.
**Current value.** The room refuses same-team hits: bullets (L1562), launched-round direct hits (L1983) and blasts
(L2031), sparing the thrower (owner) himself, the team "as it fired/threw".
**Prior search.** 91a searched `DAT_0044cdb8`, team-mask tests in L455000-466000, FUN_005abbc0, FUN_005a5a80,
FUN_005a1b80 and reCOM, and found nothing. The next step it named was the net receive.
**What I did.**
- Harry's `m_allow_friendly_fire__10CZSealBody` (0x475cb8) has no reference in r0004. The address is the SOCOM 1 demo's
  symbol (see the caution above). In the demo, `$gp`-relative accesses show the flag is written by
  `CZGameState::UpdateLocalGame` / `RemoteGameUpdateCallback` and read only by `CZSealBody::OnWeaponHit`.
- In r0001 the valve `mp_friendly_fire` (string 0x3f2860) sets `DAT_0044cdb8` (D:L150754-150761 FUN_002a9ee0, the
  host's game-state send, bit 0x20 of the packet byte). It is also set by D:L163092-163099 (FUN_002c00f0) and D:L163369
  (FUN_002c0850, the client side from the received byte `+0x19` bit 5).
- Every lui/lo access to 0x44cdb8 (`ff_trace.py` (2)): three writes and **one read**, at 0x5ac70c inside FUN_005ac670
  (0x5ac670..0x5aca04). The decomp does not contain this function (`func_lines` None); I read it by disassembly
  (`ff_trace.out` (3), `dis_5ac660.out`).
- Its identity: the only reference to FUN_005ac670 is the this-adjusting thunk at 0x5b8260 (`j 0x5ac670`), which sits in
  the vtable slot at 0x669578. `demo_symbol_matches.json` pairs that thunk exactly with
  `OnWeaponHit__7CSealExFPQ23zdb5CNodePQ23zdb15IntersectStructP12CZProjectile` (`thunk_check.out`).
  FUN_003c8920 calls the struck node's `+0x94` handler (vtable +8) at D:L319418, so this is the bullet and projectile
  hit entry on a SEAL.
- The call chain (jal scan, `ff_trace.out` (4)): FUN_005ac670 is the only caller of FUN_005ab850, and FUN_005ab850 is the
  only caller of both FUN_005abbc0 (the per-node direct hit) and FUN_005ac070 (the blast queue that FUN_005a0e70 then
  applies).
- r0004 twin at 0x5b2360 (between the exact twins of FUN_005ac660 and FUN_005aca10). It has the same gate on its flag
  0x450148, written by the twins of the two writers. It adds one more pass-through: the projectile's `+4` bit 4 set lets
  the hit through (`dis_r4_5b2360.out`).

**Answer.** In `CZSealBody::OnWeaponHit` (r0001 FUN_005ac670, 0x5ac670), in order:
1. Online, and the victim is a spectator (FUN_002c2fd0): the hit is dropped.
2. `victim+0xfb8` = `projectile+0xac` (the owner's player id; Harry's PlayerObject `+0xfb8` LastPlayerIndexToSendDamage).
3. **Online** and owner id != 0 and `DAT_0044cdb8 == 0` (friendly fire off) and the owner is found
   (FUN_0029e4e0(0x4362e0, id) with `+0x10 == 2`) and `(victim+0xc8 & owner+0xc8) != 0` (shares a team bit) and
   `(victim+0xc8 & 0x20000) == 0` and owner != victim: **return 0**. No damage, no blast queue, no knock (FUN_0057e770),
   no flinch, no death reaction. Instructions 0x5ac6b8-0x5ac750.

It therefore covers every projectile that reaches a SEAL through this handler: bullets, shotgun volleys, launched
rounds, and blasts (FUN_005ac070 is reachable only through it). It does not cover a fall (FUN_005ac1f0, its own path).
The thrower's own blast always passes (owner == victim).

Two more, independent of the switch (0x5ac840-0x5ac8fc): a hit from item 0x9f (the backblast) is dropped when the owner
is the victim or shares a team bit. Items 0x79 (M67) and 0x7e (HE) are dropped likewise when the vtable+0x38 object's
`+0x42c & 0x400` is set (that object is not identified). The blood is played by FUN_003c8920 regardless (91 §23), so a
teammate still bleeds.

Grade **STRONG**. The flag and its single reader are PROVEN by the instruction operands. "Covers blasts" rests on the
call graph (the only callers), and the identity rests on the demo-symbol thunk pair.

**Implementation suggestion.** The port is already right in kind. Three refinements:
- (a) The team is the owner's **at the hit**, looked up live by id. If the owner has left (lookup fails), the gate does
  not apply and the hit lands. The room's `f.team`, "as it threw", spares a departed thrower's team. Make a hit from an
  owner no longer in the room bypass friendly fire.
- (b) The backblast never hurts its firer's team or the firer, whatever the switch. Check that `backblastReaches` does
  the same.
- (c) Keep blood on a friendly hit (already the case per 91 §23).

Test first (`central/test/room.test.ts`): a grenade from a player who leaves before it explodes damages his former
teammate.

**Owed evidence.** A recomp trace on any MP map with `mp_friendly_fire` 0: a teammate's M4 hit, breakpoint at
0x5ac74c (taken) and at 0x5ab850 (not reached). The `+0x20000` team bit's meaning: a read of the team-word writers
(FUN_002c509c area, Harry "save player team var").

### 8.3 NET_DAMAGE_CLAMP_PLACEHOLDER (note only; 91 §16)

**What it stands for.** The bounds FUN_002bd220 applies to the hit packet (`DAT_003de728..750`).
**Prior search.** Not read (no ELF).
**What I did.** Read FUN_002bd220 (D:L161655-161672: an int clamp to [lo, hi]) and FUN_002bbda0 (D:L160852-160892, the
sender of message 0x40 with 8 bytes via FUN_0030cef0). Its only caller is FUN_005a1ff0, called by FUN_005a5a80,
called by FUN_005abbc0. On the receive side I read FUN_002bbbd0 (D:L160807-160847) -> FUN_005a1b80
(D:L459490-459620) -> FUN_005a5830. The words come from `net_clamp.py` -> `net_clamp.out`.
**Answer (PROVEN values).**

| field | source | clamp `.data` | wire |
|---|---|---|---|
| damage | `(int)GetDamage` (float, already x14) | 0x3de728 = 0, 0x3de730 = 255 | byte |
| piercing | `(int)(piercing x 20.0)` | 0x3de738 = 0, 0x3de740 = 255 | byte, received x 0.05 |
| part | part 0..5 (3 for a shotgun volley) | 0x3de748 = 0, 0x3de750 = 15 | low 4 bits |
| flag | `projectile+4` bit 2 | -- | bit 4 (counts as a shot hit in the stats, FUN_005458a0 / FUN_00544cf0) |

How it is used (STRONG): online, the shooter's console runs the hit. It sends the packet when the owner is found
(FUN_005a1ff0). It applies the float damage itself only when the victim's controller is local (FUN_005a5a80
D:L461619-461629, vtable+0x34). A remote victim's own console applies the packet's **integer** damage and **0.05-step**
piercing (FUN_005a1b80 -> FUN_005a5830). On the EE, `cvt.w.s` truncates toward zero.
**Implementation suggestion.** Every damage the room applies to a player should be quantized as the victim's console
would: `dmg = min(255, Math.trunc(dmg))`, `piercing = min(255, Math.trunc(piercing * 20)) / 20`, applied per hit before
`applyHit`. This applies to bullet and launched-round hits, which go through FUN_005a5a80. Blasts and falls are applied
on the victim's console from its own copy (FUN_005a0e70, FUN_005ac1f0) and stay float. Test first: an M4 hit at a
falloff distance giving 27.6 takes exactly 27. What moves with it: `net/damage.ts` `bulletDamage`'s callers in
`room.ts` `fire`/`directHit`, and the combat report's `rawDamage`.
**Owed evidence.** None for the values. For the use: a two-console recomp capture of one hit, reading the 8 payload
bytes at FUN_002bbda0's FUN_0030cef0 call.

### 8.4 STUN_EFFECT_PLACEHOLDER (note only; ammo `+0x10`)

**What I did.** The `Stun` field is real on the disc (`zweapon_rdr.py ammo` -> `zweapon_ammo.out`: 9x19P 1, .45 2,
5.56 3, 12 Gauge 4, M203 HE/FRAG 10, grenades 0). Its loader is D:L322679-322683 (string 0x3fccc0 "Stun", setter
FUN_003d4590 `+0x10`). Searches for a reader:
- (1) there is no getter of `+0x10` in the ammo accessor block D:L326600-326720 (getters exist for +0xc, +0x14, +0x18,
  +0x1c, +0x20);
- (2) a decomp grep for `+ 0x10) + 0x10)` finds two hits, both render;
- (3) `stun_scan.py` over every segment found every `lw`/`lwc1 0x10(rA)` whose `rA` was loaded from `0x10(rB)` or
  returned by FUN_003d1f00. All 17 hits are linked-list or render code (`stun_scan.out`);
- (4) the SOCOM 1 demo symbols have `SetStun__6CZAmmoFf` and no `GetStun`. reCOM's loader has the `SetStun` call
  commented out (`zwep_global.cpp` L77-79).

What the game's stun system does use instead: `HandleStunFromHit` (FUN_005a5250, D:L461250-461292) gives fixed timers
by item. Mark141 (123) gets slot 0 at 2.0. AN-M8 (122) / red smoke (127) get slot 3 at 2.0. 125 gets slot 1 at 3.0.
Any other item gets slot 4 at 5 x the blast fraction. `HandleStunDamage` (FUN_005a53d0) and the tick FUN_005a50a0
handle the rest (names from the demo symbols, `thunk_check.out`).
**Answer.** No consumer of ammo `Stun` found. BELIEVED unused (absence of evidence, four searches).
**Implementation suggestion.** None. Do not build an ammo-stun effect.
**Owed evidence.** A recomp memory watchpoint on one ammo record's `+0x10` during a round (any read would show).

### 8.5 RECOVERY_FACTOR_PLACEHOLDER (note only; char type `+0x2f8`)

**What I did.** `offset_scan.py 0x2f8` over every segment (`off_2f8.out`). The character-type field is loaded at
D:L406404-406405 (strings `strength` 0x65bfa0, `recovery_factor` 0x65bfb0, ints) and copied at D:L406728-406729. Its
one reader is through `body+0x540` (the type) at 0x5a5114 in FUN_005a50a0 (D:L461205-461245). The other `+0x2f8`
readers are `body+0x2f8` = the `lhand` node handle (`node_table.out`), a different struct.
**Answer (STRONG).** Every actor update (FUN_005506a0 D:L417908) calls FUN_005a50a0(dt, body). Each of the 7 stun timers
`body+0xfe0..+0xff8` (reCOM `m_stunval[7]`, flag `+0xfd0` = `m_stunned`) is reduced by `recovery_factor x dt`; when one
reaches 0 the stun bit `+0x1060 & 0x10` is cleared. With the 91 §14 value 2, the flashbang's 2.0 lasts 1 s. For a
player, the controller's `OnStunDamage` (vtable +0x50 = FUN_00597c00, D:L454530-454586) acts only on stun type 0
(Mark141). It plays `blindplayer0%d` (string 0x65e668, level 1..3 by facing and distance under 150 u) at the start.
The `+0x1060` bit 4 is never set anywhere (only cleared: D:L459713, 459802, 461214, 461229), so its five readers are
dead. **No player-visible effect of the recovery factor was found.**
**Implementation suggestion.** None for the match. (The flashbang white-out is C3's.)
**Owed evidence.** None needed for the match.

### 8.6 DOUBLE_AMMO_LOAD_PLACEHOLDER (note only)

**Answer.** NOT-A-GAP: research 94 §A7 (`FUN_005c75f0` L480207-480270, `FUN_005ba3d0` L472725-472745) resolved it and the
port builds it (`$PORT/packages/viewer/src/loadout.ts` L30, L60-73; `magazines.ts` L32-40). Retire the stale 101 row.

### 8.7 SHOTGUN_MP_PELLET_DAMAGE_SCALE_READING (`$PORT/packages/viewer/src/net/damage.ts` L198-209; room.ts L1598)

**Current value.** `'scaled'`: each pellet a full round's damage with falloff and x14.
**Prior search.** Research 94 §C2.1: the receiver uses FUN_003d4530; whether x14 applies was not traced.
**What I did.** Read FUN_005abbc0 (D:L464674-464803). Online, a class-'Q' projectile is sent once a victim with part 3
(D:L464735 -> FUN_005a5a80 -> FUN_005a1ff0 -> the packet above). On the victim's console FUN_005a1b80 (D:L459518-459571):
`uVar13` = FUN_003d1f00(FUN_003c4b40(0x4b5210, weapon id)), the weapon record's **first ammo**. If the packet damage
is > 0, n = FUN_005a1620 pellets each call FUN_005a5830(FUN_003d4530(ammo) = `ammo+0xc`, the raw `ImpactDamage` as
loaded at D:L322670-322674 with no scaling, FUN_003d4520 = piercing, victim, random part from the receiver tables
0x650900/0x6508f8). FUN_003c5950 (x14, D:L317014) and FUN_003c7600 (falloff) are not on this path.
**Answer.** **raw** -- STRONG (the code path is unambiguous; one interpretive step: FUN_003d1f00 = the weapon's first
ammo, from its list at `+0xc4`). Worked out with the port's MP part armour and health (`damage.ts` L15-17) and
FUN_003c7400 (D:L318570-318591):
- A body or limb pellet of 2.5 at piercing 6 against armour 25 takes no health. The armour drops by 0.625 a pellet.
- A head pellet (armour 0, 30 % of pellets) takes 2.5 of the head's 8.
- So an online shotgun kills by head pellets (four), or after many pellets have stripped the armour.

The packet's own damage (x14) is used only as the > 0 gate and for the knock (below). Offline the pellets are
GetDamage x14 (D:L464706-464732).
**Implementation suggestion.** Set `SHOTGUN_MP_PELLET_DAMAGE_SCALE_READING = 'raw'`. Better, rename it a sourced constant
(`pelletDamage` = the first ammo's `impactDamage`, piercing the ammo's). Gate the volley on `bulletDamage(...) > 0`
(range). The room, which plays the victim's console, applies n pellets of raw damage. Test first (`roomShotgun.test.ts`
or `room.test.ts`): a point-blank 870 volley on a full-armour SEAL lowers only head health. Owner note: this makes
online shotguns as weak as the original's. This is a feel change the owner should see before merge.
**Owed evidence.** A two-console capture of an 870 hit at 5 m reading the victim's `+0xffc..+0x1040` before and after.

### 8.8 IMPACT_HIT_READING (`$PORT/packages/match/src/room.ts` L1966-2006)

**Answer (STRONG).** The handler is traced: node `+0x94` vtable+8 -> thunk 0x5b8260 (`CSealEx::OnWeaponHit`) ->
FUN_005ac670 -> FUN_005ab850 (D:L464570-464669). A projectile whose kind (`+10`) is not 5/6 (FUN_003c6ed0 D:L318387,
"is an explosion") goes to FUN_005abbc0. So does an explosion with radius 0. The node is mapped to a part (table below);
FUN_005a5a80 applies GetDamage's impact branch (D:L318738-318761: ImpactDamage + Damage_Modifier, falloff, x14), cause 5.
Online it runs only on the console whose projectile is local (D:L464698).

The room's reading is right. Two details: a launched round's direct hit is gated by friendly fire (above). And a
**thrown grenade's body** (class 0x79, not yet an explosion) striking a SEAL is dropped outright (0x5ac758-0x5ac798:
no impact damage).
**Implementation suggestion.** Rename `IMPACT_HIT_READING` to a sourced constant citing FUN_005ac670 -> FUN_005abbc0.
Confirm the room never applies a thrown grenade's `ImpactDamage` (0.2) on contact.
**Owed evidence.** None.

### 8.9 IMPACT_SIGHT_READING (`room.ts` L2536-2541)

**What I did.** FUN_005ac070 (D:L464808-464861) queues the blast on the victim (`+0x104c`). Its ray (FUN_0031dd90) runs
from `projectile+0x48` to the body point FUN_002869d0(node `+0x308`, the head) with no offset. FUN_005a0e70
(D:L459127-459193) walks the ray's hits, skips the victim's own nodes (D:L459156-459165) and stops at a blocking
material (flags `+0x3c`). An impact detonation (FUN_003c8920 D:L319477-319485) turns the projectile itself to kind 3,
then 5 (FUN_003c8330 D:L319184), in place.
**Answer.** PARTIAL, BELIEVED: no lift is added at the queue. Whether the projectile's `+0x48` at detonation lies on the
surface, in front of it or behind it is decided by the intersection handling before HandleImpact (not read).
**Implementation suggestion.** Keep 0.1 named. Settle it by reading how `pfVar10` (the isect point, D:L319414-319416) is
written back into `+0x48` on impact.
**Owed evidence.** A recomp trace of an M203 HE hitting a wall: `projectile+0x48` vs the hit point at FUN_003c8920
entry.

### 8.10 BLOWBACK_CONSUMER_READING (room.ts L1599)

**What I did.** `offset_scan.py` for 0x1314..0x1324 over every segment (`blowback_offsets.out`): writers are
FUN_0057ed10, the body ctor/dtor and FUN_0057e770. The **only reader is FUN_0057e770** (lwc1 `+0x1320` at 0x57e790,
`+0x1320/+0x1324` at 0x57e834/838), the knock that research 85 §12 reads for blasts.
**Answer (STRONG).**
- `+0x1314..1c` = the push source, `+0x1320` = strength, `+0x1324` = radius.
- FUN_0057e770 knocks when the distance is under the radius (or the victim is dead), scaled 1 - d²/r² (D:L440972-440991).
- The shotgun sets strength = damage x FUN_003d4450(d², ammo) (D:L326569-326586: 1 under `+0x34`, linear to 0 at
  `+0x38`; 12 Gauge `Blowback_Falloff 1`, `Blowback_End 4`, stored as (x10)² = 100, 1600) and radius 100.0 (0x42c80000).
- Offline the shooter's console does it (D:L464778-464798) and OnWeaponHit then calls FUN_0057e770 (0x5ac9d0).
- Online the shooter's console zeroes it for a remote victim (FUN_0057ed10 D:L441118-441123). The **victim's console**
  sets it from the packet: received integer damage x falloff (D:L459582-459594), then calls FUN_0057e770 (D:L459613).
**Implementation suggestion.** On a shotgun volley that lands (> 0), the room should lay the blast's knock (`blastKnock`)
with source = the shooter's feet, strength = min(255, trunc(GetDamage x14)) x blowback falloff(d²), radius 100.
Test first: an 870 at 1 m knocks a standing SEAL; at 4 m it does not.
**Owed evidence.** A capture of an 870 point-blank hit: the victim's `+0x1320` / `+0x1324` on its console.

### 8.11 CLAYMORE_CONE_POINT_READING (room.ts / grenade.ts `damageAt`)

**Answer (STRONG).** GetDamage (D:L318646-318833) gives the claymore (0x99 = 153) a cone test FUN_003c7280 at its
`param_3`. Outside the cone the damage is /32 (D:L318770-318782). The half-angle constant is 0x3fbc7edd = 1.4726
(`cone_consts.out`). The damage callers pass `actor+0x1c` (D:L459241, 459270, 461587, 461612, 464712). `+0x1c..+0x24`
is the mover's ground point:
- socom_pc research 23 §1.1: the probe's miss branch pins the actor to its last ground point, and spawns sit 1-2.4
  above the ground;
- FUN_0057e770 adds a height (vtable+0x88 `+4`) to `+0x20` to reach the body (D:L440974-440978), so `+0x20` is not
  already the body's middle.

So the point is the feet. The radius is `Explosion_Radius` x `DAT_003dfe10` = 10 (loader D:L322698).
**Implementation suggestion.** The page's `grenade.ts` `damageAt` drops its +10: the cone is tested at the feet with
the record's radius, as the room does. Test: a page and a room on the same claymore agree for a crouched SEAL at the
cone's edge.
**Owed evidence.** None essential. Optional: an RDRAM read of a standing SEAL's `+0x20` vs the floor y under it.

### 8.12 BODY_PENETRATION_READING (note only; 91 §23.1)

**Answer (STRONG).** In FUN_003c8920 (D:L319342-319525), a hit on a body:
- the polygon's material is `PERSON` (`DAT_003e14f8`, D:L319391);
- the handler runs (D:L319418);
- then (D:L319473-319518) iVar1 = PERSON's material record, fVar14 = its `+0x24`.
- FUN_003c5d20 (D:L317260-317274) is true only for weapon classes 0xab (launched round) and 0xb9 (rocket). For every
  other class (bullets), range' = min(range, (range + range x piercing x 0.1) x pen) and the round **continues**
  (return 2) while within range'.
- Launched rounds and rockets stop (range 0, return 4) unless the material flag bit 1 is set.
- A second hit on the same body by one round is not re-damaged (`+0x78`, D:L319398).

With PERSON's penetration 0.97 (research 84 §13, read from `materials.rdr`), any piercing above 0.31 keeps the full
range: a body barely slows a bullet.
**Implementation suggestion.** The room's `fire` should walk on past a body and damage each further body once
(`roundPath` with PERSON's factor). It should also walk world polygons at their own materials' factors (91 §23 found
`PENETRATION` 0.5 for all; done 2026-11-02, PEN-MATERIAL: `surfaceMaterial` per struck polygon, byte 0 the map's
DefaultMaterial, `FUN_003c8920` D:L319383-319516). Owner call: this is a gameplay change (wallbang-through-bodies). Test first: two SEALs in
line; one M4 round damages both.
**Owed evidence.** None for the rule. PERSON's 0.97 is research 84's read.

### 8.13 KNOCK_LANDING_GATE_READING (note only; 151 §5) and net/damage.ts:139

**What I did.** Found every write to `+0x105c` (decomp grep). Bit 3 is set only at D:L422314, in FUN_005594b0, when
online and on signal 0. Nothing clears it (no `& 0xf7` without the `| 8`). FUN_005594b0 is slot +8 of the vtable at
0x669260, whose RTTI names `CAiSRescued` (0x65c750 -> "CAiSRescued", `thunk_check.out`), an AI state.
**Answer (STRONG).** On a player-controlled SEAL bit 3 is never set, so FUN_00580360's x1.2 knock landing (D:L441921)
always applies, as the port does. The bit belongs to a rescued AI (a hostage), where it suppresses the scaled landing.
**Implementation suggestion.** Close the reading as sourced. No code change. Hostage lead below.

### 8.14 HEAD_NODE_NAMES_PLACEHOLDER (note only)

**Answer (PROVEN).** 0x65c4f8 "hips", 0x65c500 "head", 0x65c508 "neck" (`head_nodes.out`), used at D:L419618-419623.
The full node table (body offsets, `node_table.py` from D:L419606-419655, parts from FUN_005abbc0 D:L464740-464766):
- **HEAD** = head `+0x308`, neck `+0x30c`
- **RARM** = rbicep `+0x320`, rforearm `+0x324`
- **LARM** = lbicep `+0x328`, lforearm `+0x32c`
- **BODY** = spinehi `+0x310`, spinelo `+0x2fc`, hips `+0x304`
- **RLEG** = rthigh `+0x318`, rcalf `+0x31c`
- **LLEG** = lthigh `+0x314`, lcalf `+0x340`
- **No damage**: skel_root, aimnodes, feet, hands, toes, scapulas and shoulder weights.

`hitVolumes.ts` `DAMAGE_BONES` already matches.

### 8.15 DEATH_SOUND_IDS_PLACEHOLDER (note only)

**Answer (STRONG).** FUN_0053c3a0 (D:L405789-406061) maps a sound id to its `CHRSND_*` name: 0x3c `CHRSND_DEATH`
(D:L405976), 0x3d `CHRSND_DEATH_QUIET` (D:L405979), 0x3b `CHRSND_DAMAGE`, 0x3a `CHRSND_PLAYER_DOWN`, 0x39
`CHRSND_TEAMMATE_DOWN` (`chrsnd.out`). FUN_005979a0 (D:L454473-454480) plays 0x3d for death causes 1/2/3 (3 =
headshot, 91 §1), 0x3c otherwise, and none for cause 6. The one step: the vtable+0x24 call's id is this enumeration.
**Implementation suggestion.** Sound lane (C7): on a `kill`, play the victim character's `CHRSND_DEATH_QUIET` for a
headshot and `CHRSND_DEATH` otherwise, from `character.rdr`'s `sounds` list (as `CHRSND_DAMAGE` is today,
`soundData.ts` L316).

### 8.16 HIT_VOLUMES_PLACEHOLDER — NOT-A-GAP (fallback only; `net/hitVolumes.ts` L20, L158-167).

### 8.17 SPINELO_RADIUS_PLACEHOLDER (`net/hitVolumes.ts` L33)

**Answer.** PARTIAL, BELIEVED. The game has no capsules. FUN_003c8920 takes the struck polygon's node, walked up its
parent chain (`+100`, D:L319391-319397). FUN_005abbc0 maps that node by the handle table. `spinelo` (`+0x2fc`) is a BODY
node, but per research 78 §3 it moves no vertex most, so it likely owns no struck geometry. The hips/spinehi polygons
take those hits as BODY. The 2.0 only fills a gap between two BODY volumes: no part changes.
**Owed evidence.** How the character's collision polygons are attributed to nodes (FUN_003c9b70's walk of a skinned
character). Low priority.

### 8.18 Sourced but not implemented (multiplayer)

1. **Integer hit damage online** (NET_DAMAGE_CLAMP): truncation and the 255 cap, with piercing in 0.05 steps.
2. **The shotgun online**: raw pellets on the victim plus the **blowback knock** (radius 100, the received damage x
   falloff).
3. **Bullets pass through bodies** (BODY_PENETRATION) and continue to hit further bodies.
4. **Friendly fire's live-team rule**: a departed owner's projectiles hurt anyone. Items 0x79/0x7e have an extra
   same-team gate (object `+0x42c & 0x400`, unidentified).
5. **Death voices**: `CHRSND_DEATH` / `CHRSND_DEATH_QUIET`.
6. A thrown grenade's body contact does nothing (verify the room).

### 8.19 Leads for other workstreams

- **All agents:** Harry's r0004 data labels at 0x4759xx-0x476xxx are SOCOM 1 demo symbol addresses (see the caution).
  `SCUS_972.05` carries a full symtab: use `demo_lib.py` here for names (`CZSealBody::HandleStunFromHit`, `TickStun`,
  `OnStunDamage`, `CZGameState::UpdateLocalGame`...).
- **Decomp gap:** FUN_005ac670 (`CZSealBody::OnWeaponHit`) is missing from `socom2_game.elf.decomp.c`, and other
  functions only referenced through thunks may be too. Read them by disassembly (`dis_5ac660.out`).
- **Hostage workstream:** `CAiSRescued` (vtable 0x669260, RTTI 0x65c750) is an AI state that, online on signal 0, calls
  FUN_00543480 and sets the AI body's `+0x105c` bit 3. A rescued hostage's knock landings are not scaled. Its methods
  are a start for the rescue flow.
- **C3 (flashbang):** the player's `OnStunDamage` = FUN_00597c00. Type 0 only, level 1-3 by facing and squared distance
  (6400 / 22500, 6.2e-5 slope), names `blindplayer0%d`.
- **r0004 vs r0001:** r0004's OnWeaponHit adds a friendly-fire bypass for projectiles with `+4` bit 4 (unidentified).

## 9. Part C -- spawn selection, round flow, objectives

Scripts: `scratch/C1/C/` (README.txt).

`$PORT` = the snapshot `.../scratchpad/online/redotcom`. `D:L` = `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`.
The ELF is r0001 `game/disc/socom2_game.elf`. Scripts and outputs are in `scratch/C1/C/` (see `README.txt`). Every disc read
uses the port's own parsers (`parseAnimSets`, `decodeUiOp`, `aiMapsFromZdb`, `parseRdr`), run read-only from the snapshot.

### 9.1 Summary

| item | status | grade | one-line answer |
|---|---|---|---|
| START_SLOT_LINK_PLACEHOLDER | RESOLVED | STRONG | `+0xfc8` is the console's DME client index (`FUN_0030d5a0`, Harry's "get client ID"); the lobby table is indexed by the same number; a classic round start takes slot record `clientIndex % count` of the side's list |
| RESPAWN_BLOCK_PLACEHOLDER | RESOLVED | PROVEN (code) / STRONG (client-index source) | block = `count/24` records from `clientIndex * (count/24)`; on every 96-record map the block is one record; no enemy -> the block's first record (not random); dead enemies are not filtered out; the respawn game's round start is random only within the block (never on the 22 maps: key 0/2 has 24-25 records) |
| RESPAWN_BANNER_PLACEHOLDER | RESOLVED | PROVEN | turning respawn on in Create Game sets `RCountValve` 1 -> `mp_max_rounds` 1 and `RTimeValve` 20 -> `mp_max_round_time` 1200 s, and greys out both buttons: the banner reads **"STARTING ROUND 1 OF 1"**, the round is **20 minutes** |
| RESPAWN_BUTTON_PLACEHOLDER (note only) | RESOLVED | STRONG | the config's `Action` (pad result 0), on its just-pressed state; prompt string 0x3e3310 (glyph 0xa6, X) when the Inventory slot is R2, else 0x3e3330 (0xb7, Circle) |
| SPECTATOR_PAD_PLACEHOLDER | RESOLVED | STRONG | all fire on **release** (pad state 3): d-pad Right/Left = next/previous followed player; Up/Down = next/previous fixed (scenic) view; ~~X = free camera <-> follow~~ (superseded below the table); Triangle = jump to the visible player nearest the view's centre |
| DEAD_CYCLE_WHILE_MENU_READING | NOT-A-GAP (verified) | PROVEN | `blocked` is right: the cycle acts only at HUD mode 0 (D:L412733) and is latched only when the mode is not 1 (D:L451683-451694) |
| OBJECTIVE_BY_MAP_PLACEHOLDER | RESOLVED (rules) | PROVEN (scripts) | a per-map table of all 22 `objectives` scripts below; agrees with M1 and WT-98 ([173](173-demolition-map-audit.md))/99/101 throughout; the port runs SUPPRESSION on all 22 |
| ROUND_CUE_CONDITIONS_READING | RESOLVED | PROVEN | `FUN_0025e960` evaluates the tokens left to right, without precedence, with NOT prefix and parentheses; the "unread EXPRESSION" in the elimination branches is the **AND** token (byte +4 = 2); every IF that `roundCues.ts` reads is `A AND B` -> `all-required` is exact |
| MSG_COLOUR_WORD_PLACEHOLDER (note only) | RESOLVED | PROVEN | the MESSAGE tick `FUN_00267760` never reads bytes +8..+10 (the `c8 c8 c8`); +0xb is the centred flag, +0xc the scale, +4 the raw text, +6 the locale id; colour index 0, always the main window 0x4366a0 |
| CLOCK_NEG_STRING_PLACEHOLDER (note only) | RESOLVED | PROVEN | the string at 0x3e3070 is empty (`""`): offline, a negative clock is blanked and its box hidden |
| CLOCK_VISIBILITY_PLACEHOLDER (note only) | RESOLVED | PROVEN | +0x1c shows (sets bit 6 of +0x14), +0x18 hides; **online the clock is always shown** at each seconds change; offline it is hidden while the viewed actor is dead |
| STEP_PROBE_LIFT_READING | UNRESOLVED | -- | no new capture; the lever is computing the probe origin from the bone `FUN_005b0840` reads in each stance's pose (C2's domain) |
| FLIGHT_TICK_READING | PARTIAL | STRONG | the projectile steps once per game frame with the frame's measured dt; the game frame is capped at 30 Hz (two fields: `DAT_003e1400` = 30, restored from `DAT_003e13f8` = 30), so the nominal step is about 1/30 s, not 1/60 |
| aimaps.ts slot y (comment, L311-365) | RESOLVED | STRONG | **the slot's height is in AIMAPS.MPS**: bits 9..18 of the cell's word x (max y - min y)/1024 + min y; it matches the four measured actor feet within 1.1 unit, and the camera rows sit 24-26 over it |
| mapActions.ts:63 (comment) | RESOLVED | PROVEN | the game's pick (`FUN_005aa240`) is the action under the **reticle** (a node or up to six parents), measured from the reticle's hit point to the actor: ground-plane distance < `range`, and `|dy| < elevation` unless that is -1; the valve at 99 or type 8 refuses it |

> Superseded by research 244 §3 (2026-10-08): the spectator's state byte is 0 = free, 1 = follow, 2 = scenic; X goes follow or scenic -> free -> back, free the hub; a remembered free does nothing (FUN_00295260 D:L139480-139530).

### 9.2 START_SLOT_LINK_PLACEHOLDER (`$PORT/packages/match/src/room.ts:1213`)

- **Stands for:** which record of the side's slot list a player's round start takes; the game uses the player slot
  `+0xfc8`, whose link to the lobby was untraced (research 91 §4.2).
- **Current value:** the player's place among its side's players, by id.
- **Prior search:** 91a found the slot `+0xfc8` (0..23); 91b found the lobby team slot `+0x3e` (0-7). The link was not read.
- **What I did:**
  - Read every writer of `+0xfc8` (grep `0xfc8) =`):
    - `FUN_002bdda0` D:L162081-162114: for the local player it stores `FUN_0030d5a0(0x45a0c0)`; for a body it is
      told about, it stores -1.
    - `FUN_00599690` D:L455452-455454: a remote body's copy takes the index the network message carries
      (caller `FUN_002bf070` D:L162596).
  - `FUN_0030d5a0` (D:L210033) wraps a DME call (`FUN_00622cc0`). Its r0004 twin 0x32aad0 is Harry's "get client ID";
    Harry's PlayerObject `+0xfc8` is "ClientID" (`objects.txt`). Harry's next label, "get host ID" (0x32aa90), is
    `FUN_0030d560`.
  - The lobby record is indexed by the same number. `FUN_002c5450` D:L166295-166302 stores `FUN_0030d5a0()` at
    record `+0x44` and files the record at `DAT_004414c4[that*2]`. `FUN_002c5830` D:L166379-166400 does the same for
    a remote joiner. Every reader indexes the table with `+0xfc8`: `FUN_002c2dc0`, `FUN_002c2fd0` and `FUN_002c30b0`
    at D:L164498, L164628 and L164685.
  - The pick, `FUN_002b8100` D:L158758-158790, has three branches:
    - Not a respawn game and not a spectator: record = `+0xfc8` (D:L158761-158763). `FUN_0052b5c0` wraps an index
      `>= count` to `index % count` (D:L395761-395763).
    - A spectator (`FUN_002c2fd0` = the team word's 0x10000 bit, D:L164611-164644; not the ghost test 91 named): the
      named locator "spectator" (0x3f2348, read from the ELF).
    - A respawn game: see RESPAWN_BLOCK.
  - The index's origin is DME's own. The horizon-server reimplementation (`research/horizon-server/Server.Dme/Models/World.cs`
    L57-72) gives a joiner the lowest free index from 0. That is a lead only: our room is the server, so it assigns the
    index itself.
- **Answer:** the slot is the console's DME client index (0..23 by the table bound). The record is
  `list[clientIndex % count]` of the side's key list (0 SEALs, 2 Terrorists; side by `FUN_002c30b0`, D:L455229-455241).
  Grade STRONG: the code is read exactly, and the index's semantics rest on Harry's label plus the lobby table.
- **Implementation suggestion:**
  - In `room.ts` give each seat a room-wide `clientIndex`: the lowest free in 0..23, kept for the seat's life and freed
    on leave. A takeover keeps it, since it is the same seat.
  - In `pick`, classic start: `ordered[clientIndex % ordered.length]`, with `ordered` in trailer order (`SpawnSlot.index`).
  - Test first (`roomSpawn.test.ts`):
    - Three players join SEAL, Terrorist, SEAL -> indexes 0, 1, 2.
    - The SEALs stand on slots 0 and 2, the Terrorist on the Terrorist list's slot 1.
    - A leave frees index 1, and the next joiner takes it.
- **Owed evidence:** a two-console capture of a classic round start. Read each PlayerObject's `+0xfc8` (r0004 layout,
  Harry) and its position, and check the position against `AIMAPS.MPS` key list record `+0xfc8`.

### 9.3 RESPAWN_BLOCK_PLACEHOLDER (`$PORT/packages/match/src/room.ts:1203`)

**Port status, 2026-10-21:** RSP-5 implements the original nonempty client blocks, dead-enemy and first-record
rules and width-one starts after fresh r0004 source/data review. [Research 353](353-r0004-respawn-spawn-picker.md)
owns that accepted reading and the narrowed missing/custom-data/RNG placeholder. An original-runtime comparison
remains open. The values below describe the wave's October 4 port snapshot, not the current implementation.

- **Stands for:** the respawn pick's candidate records.
- **Historical port value at the wave:** the whole side's twin records. With no enemy, one at random. A respawn game's round start takes a
  random slot of the whole side. Enemies are living players only.
- **Prior search:** 91 §4.2 read the block rule, but not the slot link.
- **What I did:**
  - Read `FUN_002b7ee0` D:L158657-158716. The block starts at `(count/24) * +0xfc8` and holds `count/24` records.
  - It scans the actor list `DAT_004362e8` for type 2 (`+0x10`) with a disjoint team mask (`+200`). There is **no
    alive test**.
  - It keeps the minimum squared 3D distance per record and takes the maximum over records, with a strict `>`.
  - With no enemy every record scores -1, so `iVar3` stays the block's first record (D:L158706-158711).
  - The respawn game's round start (D:L158776-158786): random `FUN_00197740()` (newlib `rand`, D:L14526) modulo
    `count/24`, plus the block start; no draw when `count/24 == 1`.
  - Counted the key lists on all 22 maps (`spawn_counts.out`), with the port's parser over the trailer list. The game
    reads that list via `FUN_0052fe60`, which needs it sorted by key; `spawn_sorted.out` shows it is, on every map.
- **Answer (counts PROVEN from the disc, rule PROVEN from code):**
  - **Key 0/2** (round start): 24 records a side (25 on side 0 of MP10 and MP51). `count/24` = 1, so a respawn game's
    round start is also `record[clientIndex]`, never random.
  - **Key 1/3** (respawn twins):
    - 24 on the 16 non-SUPPRESSION maps, so the block is 1 and the respawn record is the slot's twin.
    - SUPPRESSION blocks (side 0 / side 1): MP2 11 / 10, MP5 7 / 9, MP8 13 / 14, MP51 6 / 7, MP64 8 / 9, MP81 9 / 8.
  - Within a block: the record whose nearest enemy body, dead or alive, is farthest; ties go to the earlier record;
    with no enemy, the block's first record.
- **Implementation suggestion:**
  - `pick('respawn')` takes `list.slice(b*ci, b*ci + b)` with `b = Math.trunc(list.length / 24)`, as follows:
    - If `b == 0`, return `list[0]`. The game's loop does not run and returns index 0. This happens only on MP10
      side 0 and MP73 side 1, neither a SUPPRESSION map.
    - `enemies` = every other-team player with a body, alive or dead, including corpses in the room.
    - With no enemy, return `block[0]`.
  - `pick('start')` in a respawn room takes `list[(ci*b + (b > 1 ? rand % b : 0)) % count]`.
  - Tests:
    - Frostfire (block 11): a player at index 3 respawns only within twins 33..43.
    - With no enemies it takes twin 33.
    - A dead enemy body still repels.
- **Owed evidence:** none for the rule. The client index is START_SLOT_LINK's capture.

### 9.4 RESPAWN_BANNER_PLACEHOLDER (`$PORT/packages/viewer/src/net/rules.ts:55`)

- **Stands for:** what a respawn match's round banner reads.
- **Historical value:** "STARTING ROUND 1 OF 11", kept on the earlier reading that `FUN_001fb420` has no respawn
  test. **Corrected 2026-10-21, RSP-2 (research 348):** the dormant code consumes the original CREATE GAME count, 1;
  this named placeholder is retired. The disc field is independently re-read (reading); the shared executable
  banner reader remains inherited and pending fresh review, with original-runtime appearance awaiting comparison.
- **Prior search:** `FUN_001fb420` only.
- **What I did:**
  - Decoded the create-game dialog's scripts (`UIZANIM.ZAR` set `dlgCreateGame.rdr`) with the port's `decodeUiOp`
    (`ui_set_dump.ts` -> `dlgCreateGame_ui.out`).
    - Anim `set_respawn_valve`, turning respawn on: `RoundCountValveSave = RCountValve`,
      `RoundTimeValveSave = RTimeValve`, `RTimeValve = 20`, `RCountValve = 1`, then `RemoveNonSuppressionMaps`.
      Turning it off restores both saves.
    - Anim `refresh_cg_screen`:
      - `RCountValve == 1` -> `mp_max_rounds = 1`.
      - `RTimeValve == 20` -> the caption "20 minutes" and `mp_max_round_time = 1200`.
      - With `mp_allow_respawn == 1` it runs `DisableButton RoundTime_btn` and `DisableButton NumberRounds_btn`.
    - `SetNR_valve` cycles 3, 5, 7, 9, 11, so 1 is reachable only through respawn.
    - Defaults (`SetDefaultStatus`): respawn 0, `RTimeValve` 6, `RCountValve` 11, `MaxPlayersValve` 16.
  - `FUN_001fb420` (D:L57633-57648) reads the valves `mp_max_rounds` (0x3e34f8) and `mp_round_count` (0x3e3508). The
    strings were read from the ELF: 0x3e3520 "STARTING ROUND %d OF %d", 0x3e3540 "PLAYING TIEBREAKER ROUND".
  - The round length is `+0xe0 = mp_max_round_time x 1000` ms (`FUN_001f5e70` D:L55621-55627, `(t*124+t)*8`).
  - Harry's GameObject agrees with the valve block `FUN_002a76d0` D:L149650-149661: `+0x0 Rounds` = `mp_max_rounds`,
    `+0x4 HalfRounds`, `+0x8 RoundTime`, `+0x64 AllowRespawn` = `mp_allow_respawn`.
- **Answer (PROVEN):**
  - A respawn game is one round of 1200 s.
  - Its banner reads "STARTING ROUND 1 OF 1": `mp_round_count + 1` = 1, `mp_max_rounds` = 1, so the tiebreaker test
    `1 < 1` is false.
  - The game details show ROUND COUNT 1 (`FUN_002e24d0` D:L184192-184193).
  - Research 91 §2.2's "6 minutes default (4-10 selectable)" for a respawn match is wrong: the time is fixed at 20 minutes.
- **Implementation suggestion:**
  - In `net/rules.ts` add `RESPAWN_MAX_ROUNDS = 1` and `RESPAWN_ROUND_SECONDS = 1200`.
  - The room takes them when `rules === 'respawn'`, whatever `MAX_ROUNDS` / `ROUND_SECONDS` say.
  - `roundBanner(1, 1)` then gives "STARTING ROUND 1 OF 1".
  - Retire the placeholder. The owner's ruling of 2026-09-29 rested on the misreading, so it goes back to the owner.
  - Test: a respawn room's `roundStart` carries `rounds` 1 and a 1200 s clock.
- **Owed evidence:** none for the values. A capture would only confirm the screen.

### 9.5 RESPAWN_BUTTON_PLACEHOLDER (note only; research 91 §16)

- **Stands for:** the button that respawns, and the glyphs 0xa6 / 0xb7.
- **What I did:**
  - Read `FUN_00592560` D:L451675-451700: the respawn needs `FUN_002c64e0(0, pad) == 1`.
  - `FUN_002c64e0` (D:L166917-166931) maps the config's result 0 (`Action`) through `DAT_004415a8 + 0x12` to a pad
    slot, and returns that slot's state byte. 1 is "just pressed" (research 94).
  - Read the prompt's choice (D:L57008-57030): `FUN_002c6430(4)`, the Inventory slot; 11 (R2) gives 0x3e3310, else
    0x3e3330.
  - Dumped the raw bytes (`respawn_glyph.out`): 0x3e3310 carries glyph byte 0xa6 and 0x3e3330 carries 0xb7.
- **Answer (STRONG):**
  - The respawn button is `Action`: X on Default/Reverse/Config4, Circle on Goldeneye (`controller.rdr`, research 94).
  - It fires on the press, 5.0 s after death, once the body has faded (91 §4.1).
  - Glyph 0xa6 = X and 0xb7 = Circle, by the config pairing; the font atlas is not read.
- **Implementation suggestion:** none for the room. The page's respawn key maps to the Action button (X / the PC's
  action key) and fires on the press.

### 9.6 SPECTATOR_PAD_PLACEHOLDER (`$PORT/packages/viewer/src/netPage.ts:313`)

- **Stands for:** the buttons of the spectator camera and of the dead player's cycle.
- **Current value:** Space follows the next living player or teammate.
- **Prior search:** 91 read the bytes +5/+6/+7/+10; 94 named the slots (+5 Up, +6 Down, +7 Triangle, +10 X).
- **What I did:**
  - Read `FUN_00295260` D:L139463-139590. Every test is `== '\x03'` (**just released**), not "just pressed":
    - +7 (Triangle) -> `FUN_00294f40`, jump to the visible player.
    - +10 (X) ~~toggles the mode: from scenic (2) or free (1) to follow (0), remembering the mode; from follow, back to
      the remembered mode.~~
      > Superseded by research 244 §3 (2026-10-08): the spectator's state byte is 0 = free, 1 = follow, 2 = scenic; X goes follow or scenic -> free -> back, free the hub; a remembered free does nothing (FUN_00295260 D:L139480-139530).
    - +5 (Up) / +6 (Down) step the scenic view +1 / -1 and enter scenic mode.
  - Read the cycle latch (D:L451683-451694): +3 (Right) and +4 (Left) on release, while the HUD mode is not 1, set
    `+0xfcd` / `+0xfce`. It runs only when respawn is off, or the player is a ghost, or a spectator (D:L451681-451682).
  - The actor (D:L412733-412750) then calls `FUN_00547170` (next) or `FUN_00546fa0` (previous). Its argument is 0 for
    a spectator, meaning all living non-spectator players; for a dead player it is 1, meaning living teammates only,
    excluding escortees and hostages (`+200 & 0x20000`, D:L412604-412609).
  - Harry's labels on these functions agree: "dpad left spectate", "dpad right spectate", "spectate all players" (r0004
    0x54bc34, 0x54bdec, 0x54bc78).
  - The help strings (`respawn_glyph.out`): "...Use the directional buttons to cycle through active players and fixed
    views. <0xa6> Use the Free-Motion Camera. <0xac> Jump to visible players."
- **Answer (STRONG):** Right / Left = next / previous followed player; Up / Down = next / previous fixed view; X =
  Free-Motion camera, toggled with follow; Triangle = jump to the visible player. All fire on release, not on press.
  - A dead player's teammate cycle does not run in a respawn game unless the player is a ghost.
  - The slots are raw pad slots, not remapped by the controller config.
- **Implementation suggestion:**
  - In `netPage.ts`, keyboard and pad: ArrowRight/ArrowLeft (d-pad) -> next/previous target; ArrowUp/ArrowDown ->
    scenic views (`mission.rdr` `Scenic_Views`); the X key or pad X -> free/follow toggle; Triangle -> jump to the
    nearest visible player.
  - All act on keyup. Keep Space as a PC convenience only if the owner rules it.
  - Tests: `nextFollow` / `prevFollow` order is the actor list order; the dead player's list excludes escortees; keyup,
    not keydown.

### 9.7 DEAD_CYCLE_WHILE_MENU_READING (`$PORT/packages/viewer/src/netPage.ts:182`)

- Verified: D:L412733 requires `*(ctrl + 0x221) == 0` before acting on the latched bytes. The latch itself (D:L451683,
  L451689) is gated by `cVar1 != 1`. 94's "blocked" stands. NOT-A-GAP, PROVEN.

### 9.8 OBJECTIVE_BY_MAP_PLACEHOLDER (`$PORT/packages/viewer/src/net/rules.ts:98`)

- **Stands for:** the non-SUPPRESSION maps' objectives and round rules.
- **Current value:** every room runs SUPPRESSION ("ELIMINATE THE TERRORISTS/SEALS") on every map.
- **What I did:**
  - Decoded all 22 maps' `objectives` animations (`MPxx.ZDB:MZANIM.ZAR`) with the port's interface decoder, which
    keeps the IF and WHILE tokens. The effects decoder drops AND/OR; WT-99 ([174](174-breach-map-audit.md)) L64 notes the same limit.
  - Outputs: `objectives_all.out` (6,786 lines), `objectives_rules.out` (branches deduplicated over `player_team`),
    `objectives_table.out` (the per-map row) and `objectives_variants.out`.
- **Cross-check:** M1 ([192](192-m1-mp-modes-rules.md) §2.1, 16 maps read) and the owner's notes WT-98 ([173](173-demolition-map-audit.md)) (L166-170), WT-99 ([174](174-breach-map-audit.md)) (L52)
  and WT-101 ([176](176-suppression-map-audit.md)) (L39) agree on every row below. I add the six maps M1 did not read (MP5, 7, 8, 9, 12, 81); each matches
  its mode family. M1's mode-level table is not repeated here.

| map | type | `start` waits | `mission_timer` | time-out result | per-map specifics |
|---|---|---|---|---|---|
| MP1 Blizzard | DEM | 3 + 10 | WAIT 15 | `abort`: draw (99) | bomb seqs; "30 SECONDS" fuse text; RUS win music; INTRO_2 |
| MP2 Frostfire | SUP | 5 + 10 | 15 | draw | `respawn`/`start2`/`mission_timer2`/`success2`; INTRO_4, RUS |
| MP5 Abandoned | SUP | 5 + 10 | 15 | draw | as MP2; BRA |
| MP6 Desert Glory | EXT | 5 + 10 (SEAL +2 inside) | 15 | draw | HostKill/SealKill/Rescue/Lead x3, SEALcheck; `mp_penalty += 1` per SEAL hostage kill; INTRO_5, ALG |
| MP7 Night Stalker | DEM | 3 + 10 | 15 | draw | ALG |
| MP8 Rat's Nest | SUP | 5 + 10 | 15 | draw | ALG |
| MP9 Bitter Jungle | DEM | 3 + 10 | 15 | draw | BRA |
| MP10 Blood Lake | EXT | 5 + 10 | 15 | draw | as MP6; BRA |
| MP11 Death Trap | EXT | 5 + 10 | 15 | draw | as MP6; BRA |
| MP12 The Ruins | DEM | 3 + 10 | 15 | draw | BRA |
| MP51 Vigilance | SUP | 5 + 10 | 15 | draw | locale-keyed texts (5100-5106); ALB |
| MP52 The Mixer | ESC | 5 + 10 | WAIT 5 | `mp_winner = 0`: SEALs win (`escort_success`) | VIP kill/rescue x3, EndRescue, VIPcheck at 2 dead; VIP music; ALB |
| MP53 Foxhunt | ESC | 5 + 10 | 5 | SEALs win | as MP52, but its timer also stops HostKill/SealKill first |
| MP61 Sujo | BRE | 5 + 10 | 5 | `mp_winner = 8`: Terrorists (`breach_success`) | **6** "PERIMETER BREACHED" watchers (`music1-6` on `set_access1-6`); BREACH music; BRA |
| MP62 Enowapi | BRE | 5 + 10 | 5 | Terrorists | **3** watchers; BRA |
| MP64 Shadow Falls | SUP | 5 + 10 | 15 | draw | BRA |
| MP71 Fish Hook | EXT | 5 + 10 | 15 | draw | locale-keyed (7100-7103); ALG |
| MP72 Crossroads | DEM | 3 + 10 | 15 | draw | locale-keyed (7200-); WT-96 ([171](171-crossroads-demolition-and-bridges.md)) owns the bridges; ALG |
| MP73 Sandstorm | BRE | 5 + 10 | 5 | Terrorists | 3 watchers; locale-keyed; ALG |
| MP81 Chain Reaction | SUP | 5 + 10 | 15 | draw | RUS |
| MP82 Guidance | ESC | 5 + 10 | 5 | SEALs win | as MP52; RUS |
| MP83 Requiem | DEM | 3 + 10 | 15 | draw | locale-keyed; RUS |

- **Answer:** PROVEN from the disc's scripts. The respawn hook exists only on the six SUPPRESSION maps, consistent with
  `RemoveNonSuppressionMaps` (see RESPAWN_BANNER).
  - The engine side of the bomb, VIP, hostage and zone tests (`set 2` commands 11/22 in the IF tokens) is not decoded
    here: it is WT-96 ([171](171-crossroads-demolition-and-bridges.md))/98/99's and H1-H3's.
- **Implementation suggestion:**
  - Replace `objectiveOf(team)` with the map's own `start` / `start2` posting, read off the disc as `roundCues.ts`
    already reads its cues: the MESSAGE texts per `player_team`, scale 0.9 / 0.7, centred.
  - Give `Room` a per-type `roundOutcome`: the time-out winner (draw / SEALs / Terrorists), the elimination guard
    (13 s for DEM, else 15 s) and the timer guard (5 s on ESC/BRE, else 15 s), as the table above. The object modes
    (bomb, VIP, hostage) stay M1/WT/H items.
  - A first, testable slice:
    - ESC and BRE time-outs score SEALs and Terrorists respectively.
    - DEM's elimination is watched from 13 s.
    - Pin each map's objective text with a disc test that reads `objectives` and compares it with a table.

### 9.9 ROUND_CUE_CONDITIONS_READING (`$PORT/packages/viewer/src/roundCues.ts:49`)

- **Stands for:** how an IF's conditions combine, and the "unread EXPRESSION" in the elimination branches.
- **Current value:** `all-required`; a non-valve condition is taken as true.
- **What I did:**
  - Read the evaluator `FUN_0025e960` (D:L108288-108425; research 95 §1.4 names the EXPRESSION codes 1 NOT, 2 AND,
    3 OR, 4 `(`, 5 `)`).
  - It walks operands left to right, applying the pending operator (2 AND: `prev && cur`; 3 OR: `prev || cur`) with no
    precedence (D:L108394-108416).
  - NOT is a prefix flag (D:L108369-108371, L108383-108386); `(` recurses (D:L108325-108327) and `)` returns
    (D:L108366-108368).
  - An operand that follows an operand with no operator between ends the condition and rewinds (D:L108375-108379).
  - Decoded every IF/ELSEIF/WHILE condition on the 22 maps (`objectives_all.out`).
  - The elimination branches read `aiteam_0x == 0 AND player_team == N`: the "EXPRESSION" is the AND token
    (`decodeUiOp` reads byte +4 = 2).
  - The only ORs are in `game_over` (`mp_score00 >= half OR mp_score08 >= half`) and in the zone tests (`set 2 cmd 22`).
    Neither is a cue `roundCues.ts` reads.
- **Answer (PROVEN):** for every condition `roundCues.ts` evaluates, "all required" equals the game's left-to-right AND.
  The EXPRESSION is an operator, not an operand.
- **Implementation suggestion:**
  - Switch `roundCues.ts` to `decodeUiOp`'s token list, or to the effects decoder extended to decode command 43.
  - Evaluate it with a 15-line port of `FUN_0025e960`: left to right, NOT, parentheses, and an early stop at two
    adjacent operands.
  - Retire the reading.
  - Test: MP2's elimination branches give the same cues as today; the `game_over` OR evaluates as written.

### 9.10 MSG_COLOUR_WORD_PLACEHOLDER (note only; research 91 §18)

- **What I did:**
  - The zAnim command table `FUN_0025bc20` registers "MESSAGE" (0x3ed088) with the tick `FUN_00267760`
    (D:L106919, D:L113362-113378).
  - The tick reads +4 (u16 raw-text name index) and +6 (i16 locale id; non-zero -> `FUN_00361b40`), byte +0xb and
    f32 +0xc. It calls `FUN_002b6530(scale, 0x4366a0, text, 0, +0xb, 0)`.
  - In `FUN_002b6530` the 4th argument is the colour index into the BSS table `DAT_00440c70` (D:L157995-157999) and
    the 5th is the centring flag `+0x69` (D:L158003; consumer D:L260684-260689 halves the width).
  - Bytes +8..+0xa (`c8 c8 c8` on every MESSAGE of the 22 maps) are never read.
- **Answer (PROVEN):** a script MESSAGE always goes to the main message window, in colour index 0, centred when
  +0xb = 1 (it is 1 on every MP message decoded), at the scale in +0xc.
- **Implementation suggestion:** none if the page posts round messages centred in the window's default colour.
  Otherwise centre them; the `c8c8c8` bytes are not a colour.

### 9.11 CLOCK_NEG_STRING_PLACEHOLDER and CLOCK_VISIBILITY_PLACEHOLDER (note only; research 91 §18)

- **What I did (`clock_vt.out`):**
  - The clock text is a `C2DText`: the ctor `FUN_00363e70` sets vtable 0x406df0 (D:L261452).
  - Its +0x18 -> 0x363c10 = thunk to `FUN_00364e50`, which clears bit 6 of +0x14 (D:L262096-262100).
  - Its +0x1c -> 0x363c00 = thunk to `FUN_00364e30`, which sets bit 6 (D:L262086-262090).
  - Bit 6 is the visible flag: `FUN_001f6b00` draws "" when it is clear (D:L55977-55985, `FUN_00364e10`).
  - The box's vtable 0x406e80 (D:L57884) has the same pair.
  - String 0x3e3070 is the empty string (bytes at 0x3e3070 are 0).
  - `FUN_001f6b60` (D:L55992-56020), at each seconds change: shows the text when the camera has no target, or the
    target is alive (`+0xe1` bit 4), or online; offline also shows the box. Otherwise it hides both. Offline with a
    negative clock it writes "" and hides the box.
- **Answer (PROVEN):** +0x1c = show, +0x18 = hide.
  - Online the clock is shown regardless of the viewed player's state. Research 91 said it depended on the local
    player's alive bit; that holds only offline.
  - Hiding while the scoreboard is up is a separate path (research 87 §12).
  - The negative-clock string is "": a blank.
- **Implementation suggestion:** none online; the page already draws the clock always. Offline solo, hide the timer
  while the viewed body is dead.

### 9.12 STEP_PROBE_LIFT_READING (`$PORT/packages/viewer/src/mover.ts:246`)

- **Searched:** `logs/parity/` for a kerb or step capture. Only the campaign spawn images that research 23 used
  (`spawn_pcsx2.rdram`, `spawn_ours*.rdram`) exist, and they gave the 5.5 already.
- **Answer:** UNRESOLVED.
- **Owed evidence:** two routes. Either compute the origin from the bone translation `FUN_005b0840` reads (research 23
  §1.2), posed by each stance's idle and run clips in `MOTION_P.ZAR`, which is C2's lever; or run W2.2c's PCSX2 capture
  of a SEAL at a 6.25 kerb over a lower floor, reading actor `+0x1c` y before and after the step.

### 9.13 FLIGHT_TICK_READING (`$PORT/packages/viewer/src/grenade.ts:53`)

- **What I did:**
  - Research 85 §5.1: `PreTick` integrates with the frame's dt.
  - The game's frame ends in `FUN_003aff30` (D:L304735-304767). It waits fields while `elapsed + 1/60 <
    1/DAT_003e1400`, and measures dt from RCNT0 (`DAT_004a44a4`, `DAT_004a449c`).
  - The MP game states call it: `FUN_001f5e70` D:L55775 and `FUN_00223680` D:L75954.
  - `DAT_003e1400` = 30 in the ELF. Loading uncaps it (`FUN_003b17d0(-1)`, D:L50752, L51260) and `FUN_001ec480`
    restores it from `DAT_003e13f8` = 30 (D:L50954; the ELF word is 30).
  - KNOWN (socom_pc `docs/KNOWN.md` L134) reads the mission as "The game targets 30 fps (two VBlanks)".
- **Answer (STRONG, two lines of evidence):** the flight steps once per game frame, nominally 1/30 s (1001/30000), and
  longer when a frame slips. It is not 1/60.
  - Semi-implicit Euler then sags `g t dt / 2` lower: twice the 60 Hz figure.
  - Research 85 §8's "0.8 units a second into the flight at 60 Hz" becomes about 1.6 at the game's rate.
- **Implementation suggestion:**
  - Set `FLIGHT_TICK_READING = 1001 / 30000` (keep the name as a reading) in `grenade.ts` and the room's flight. Both
    must move together: the page and the room must agree.
  - Re-baseline `grenade.test.ts`'s arc fixture.
  - Flag the same question for every per-frame integration (the throw power's `f = dt x rate`, research 85 §2) to C2/C3.
- **Owed evidence:** a capture of a grenade's per-frame positions (projectile `+0x54` per frame) on PCSX2. The steps
  would be about 1/30 s of travel.

### 9.14 Unnamed: `scene/aimaps.ts` slot y (`$PORT/packages/scene/src/aimaps.ts:311-365`)

- **The comment:** "The y, which the file does not hold (75 §4)"; the y is estimated from measured spawns or a probe.
- **What I did:**
  - Read the record-position routine `FUN_0052d480` (D:L396884-396948). x and z are the cell's centre.
  - **y = `FUN_00516940(submap, cell)`** (D:L385086-385095) = `sub+4` + `sub+0xe8` x bits 9..18 of the cell's first
    word.
  - The in-memory sub-map is the file header from +4. That puts `sub+4` at min y, `sub+0x20` at cell size x and
    `sub+0x1c` at cells z, which `FUN_00511f80` confirms.
  - `sub+0xe8` is set at load to `(max y - min y) x 0.000976563` (1/1024; `FUN_0051afe0` D:L387628).
  - `FUN_00511f80` (D:L382880-382919) finds the cell through the same row table the port's `aiCellIndex` uses.
  - A cell flagged in bit 7 of its first byte with a marker record also gets a horizontal push (D:L396933-396943).
    That is x and z only, and not quantified here.
  - Computed it for all 4,591 records (`slot_y.ts`): every one has a cell.
- **Results (`slot_y.out`):**

  | measured position (KNOWN §1 actor feet) | cell y |
  |---|---|
  | Frostfire A (796, **100**, 614) | 100.00 |
  | Frostfire B **143** | 141.93 (+1 lift = 142.93) |
  | Vigilance A **160** | 158.53 |
  | Vigilance B **65** | 64.05 |

  The 18 other maps' camera rows sit 24.2-25.7 over the nearest slot's cell y (Death Trap B 21, at 28 units off).
- **Answer (STRONG):** the slot's height is in `AIMAPS.MPS`, quantised to (max y - min y)/1024. It agrees with the
  measured feet to within 1.1 units, the spawn's +1 lift (D:L158793) and floor pick included.
- **Implementation suggestion:**
  - In `placeSpawnSlots`, start from `y = sub.min[1] + ((cells[i] >>> 9) & 0x3ff) * (sub.max[1] - sub.min[1]) * 0.000976563`.
    Keep `slotFloor`'s probe below that origin (+1, then the walk's pick).
  - Retire the estimate and the "range" fixes (Sujo #12-14 and the 67 off-floor slots).
  - Correct research 75 §4/§9's "no record carries a height".
  - Test: Frostfire slot A's cell y = 100.00 and Vigilance B's = 64.05 (±0.01).

### 9.15 Unnamed: `viewer/mapActions.ts:63` ("the game's own test ... was not traced")

- **What I did:** read `FUN_005aa240` (D:L463832-463903), the pick for every action type (door, switch, defuse, MP
  bomb, breach, satchel, take item: research 92's table).
  - The candidate is the node under the reticle, `actor+0x3fc` else `+0x3dc`, or a parent up to six levels
    (`FUN_005aa470`). It is refused if its valve reads 99 or its type is 8.
  - Distance runs from the reticle's hit point (`+0x3e0` or `+0x3c0`) to `actor+0x1c` plus the vector at `+0x14b0`.
    That vector is unread; when zero, `DAT_003f64c0` = (0, 0, 0) is used (`action_pick.out`).
  - The test is `dx^2 + dz^2 < range^2`, and when `elevation != -1`, `dy^2 < elevation^2`.
  - The doors already port this (research 92 `pickDoor`). `actionInReach` (the HUD's prompt for the other types, e.g.
    MPBOMB) uses a 3D distance from the node's origin with no reticle.
- **Answer (PROVEN):** reticle-based, ground-plane range plus an elevation band, measured from the reticle's hit
  point. It is neither the node origin nor 3D.
- **Implementation suggestion:** make `actionInReach` take the reticle's hit node and point, like `pickDoor`. Test: an
  MPBOMB site behind the player is not offered; one under the reticle within range and the elevation band is offered.

### 9.16 Sourced but not implemented

- **Respawn match = 1 round x 20 minutes**, round and time buttons disabled, non-SUPPRESSION maps removed from the play
  list (`dlgCreateGame.rdr` `set_respawn_valve`, `refresh_cg_screen`). **Implemented 2026-10-21, RSP-1/RSP-2**:
  the dormant room defaults to 1 / 1200 s, its banner consumes the same count, and the original menu script now
  filters and restores its playlist. Disc fields independently re-read; executable-only semantics remain pending
  fresh review. Research 357 and 348; release gate remains off.
- **The spawn records' heights are in AIMAPS.MPS** (above): the port estimates them.
- **The respawn pick counts dead enemies' bodies, and with no enemy takes the block's first record**; the port draws
  at random and filters the living.
- **The classic start slot is the client index**: the port uses the side's id order.
- **Spectator controls**: Left/Right cycle, Up/Down fixed views, X free camera, Triangle jump. All fire on release.
  The port has Space only.
- **The dead player cannot cycle teammates in a respawn game** (D:L451681).
- **Per-map objective scripts**: time-out winners, guards, objective texts and per-map messages (table above); the port
  plays SUPPRESSION everywhere.
- **The mp_penalty script use**: Extraction's `SealKill1-3` post "THE SEALS HAVE KILLED A HOSTAGE / ONE MINUTE HAS BEEN
  DEDUCTED FROM THE MISSION TIMER" and `mp_penalty += 1` (`objectives_rules.out` MP6). Its engine consumer is M1's
  G11.
- **The game frame runs at 30 Hz**: per-frame integrations (the grenade flight) step at 1/30.

### 9.17 Leads for other workstreams

- **C2 (movement):** the probe origin is a bone's translation; compute it per stance from the clips (STEP_PROBE_LIFT).
  Also check every dt-integrated quantity against the 30 Hz game frame (`FUN_003aff30`; KNOWN L134).
- **C1-A (vote / lobby):** the lobby table is indexed by DME client index (`FUN_002c5450`, `FUN_002c5830`). Vote records
  `+0x48/+0x49` use the same index (`FUN_002c3920` D:L165089).
- **Friendly fire (fork B / M1 G12-G13):** the create-game script maps `mp_friendly_fire` 0 -> UIMnLOC 257
  (`_257_FriendlyFireDisabled_MSG`) and 1 -> 258 (`_258_FriendlyFireEnabled_MSG`) (`refresh_cg_screen`).
  `SetDefaultStatus` (the RESTORE DEFAULTS button) sets `mp_friendly_fire = 1`, which is "enabled". `init_cg_screen` does
  not set the valve, and frame `A_49` shows "disabled". So the screen's first value comes from the valve's creation,
  while RESTORE DEFAULTS turns friendly fire **on**. That is worth one check by whoever owns the FF option.
- **H1-H3 (hostage):** the `objectives` zone and escort tests are `set 2` commands 11 and 22 (`Lead*`, `Rescue*`),
  undecoded by both decoders. Their raw bytes are in `objectives_all.out`.
- **ONL (lobby):** the create-game cycles (rounds 3-11 odd; time 4-10; players 2-16 even) are all in
  `dlgCreateGame_ui.out`. M1 G15/G19 left the ranges undecoded.

## 10. Part D -- the round and final screens

Scripts: `scratch/C1/D/` (README.txt).

Fork C1-D of C1-match-server, 2026-10-04. Scripts and outputs: `scratch/C1/D/` (see `D/README.txt`). `$PORT` is the
`agent/online` snapshot. Every layout value below comes from the disc's own SOCOM II dialogs, which the port's
round screens never read.

**The main finding.** The SOCOM II round and final screens are on the disc. `RUN/UI/READERX.ZAR` holds
`dlgMultiplayerRound.rdr`, `dlgMultiplayerFinal.rdr` and `dlgMultiplayerFinalReally.rdr`, laid out and scripted.
`RUN/UI/READERC.ZAR` holds the same three layouts byte-identical, without the scripts' source. Research 96 R96.2
listed both copies, but research 91 §18 and `roundScreens.ts` still say these layouts are missing.

The game mounts READERX at the round's end: `FUN_00223970` passes `'readerx.zar'` 0x3e5270 and `'run/ui'` 0x3e5280 to
`FUN_0032c1e0` at 0x223f00 (D:L76089; `D/read_mounts.out`). The background `multplay_back.tif` and the panel bitmap
`backsolid.tif` are in `RUN/COMMON/SPMP_TXR.ZED`, the screens' `LIBRARY common/assetlib/spmp`. Their pixels and
`backsolid`'s colour are byte-identical to the copies in `UI/UIMP_TXR.ZED`, which the port's online front end
already draws (`D/cmp_uimp.out`).

Every `*_PLACEHOLDER` in `roundScreens.ts` is replaced by disc data, and so is the hand-placed `ROUND_SCREEN_LAYOUT`.
That layout is SOCOM 1's, read from reCOM.

**File offsets used as sources.** These are the member's offset in the archive file. The layouts are identical in
both copies.

| dialog | READERX.ZAR offset | READERX size | READERC.ZAR offset | READERC size |
|---|---|---|---|---|
| `dlgMultiplayerRound.rdr` | 0xe750 | 18,032 | 0x68480 | 15,080 |
| `dlgMultiplayerFinal.rdr` | 0x5690 | 17,872 | 0x60a50 | 15,120 |
| `dlgMultiplayerFinalReally.rdr` | 0x9c60 | 19,176 | 0x64560 | 16,160 |

The decoded files: one line per widget in `D/compact_READERX_<dialog>.rdr.out`; the full trees, scripts included, in
`D/READERX_<dialog>.rdr.out`.

### 10.1 Summary

| item | status | grade | one-line answer |
|---|---|---|---|
| `TITLE_PLACEHOLDER` | RESOLVED | PROVEN | `TitleBar` at (45,50) on ROUND COMPLETE, (75,50) on FINAL ROUND, (55,60) on GAME COMPLETE; scale 1.75, COLOR (91,72,36) -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr` |
| `COLUMN_ORDER_PLACEHOLDER` | RESOLVED | PROVEN | **SCORE, KILLS, DEATHS** (the port shows KILLS, DEATHS, SCORE) -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr` |
| `ROUND_LIST_COLUMNS_PLACEHOLDER` (note only) | RESOLVED | PROVEN | the column table 0x3e51c0 (filled from .data 0x3dc750/60/70) reads +0x3c (score), +0xc (kills), +0x12 (deaths) of the round block +0x58c or the totals block +0x544 |
| `PANEL_PLACEHOLDER` | RESOLVED | PROVEN | no nine-slice: a full-frame BACKGROUND `multplay_back.tif` (512x512), then translucent `backsolid.tif` panels -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr` |
| `TEAM_BAR_PLACEHOLDER` | RESOLVED | PROVEN | there is no team bar under the captions; the panels and the per-row strips stand in its place -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr` |
| `STRIPE_PLACEHOLDER` | RESOLVED | PROVEN | every row has a strip, not only odd rows: 8 per side, 300x17 at opacity 0.8, plus 100x17 strips under each number column; static, drawn whatever the player count -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr` |
| `YOUR_STATS_PLACEHOLDER` | RESOLVED | PROVEN | a left-hand block of 9 labelled rows (SCORE .. SUICIDES) with values from `FUN_00225a00`; not a fourth block in a bottom row -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerFinalReally.rdr` |
| `BOTTOM_CAPTION_PLACEHOLDER` | RESOLVED | PROVEN | two-line captions ("SEAL ROUNDS" / "WON" ..) at x 390 / 555, y 196-267; TIME PLAYED at (470,350) -- retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerFinalReally.rdr` |
| `ROUND_SCREEN_LAYOUT_PLACEHOLDER` (note only) | RESOLVED | PROVEN | layouts, background and scripts are on the disc (READERX, SPMP_TXR.ZED); no `winner.TIF` / `loser.TIF` is used |
| `ROUND_SCREEN_LAYOUT` (comment: the reCOM positions, not a named stand-in) | RESOLVED | PROVEN | every position in the table is SOCOM 1's and differs from SOCOM II's (examples in §10) |
| `ROUND_COLOURS.backdrop` (comment: "background bitmap missing") | RESOLVED | PROVEN | the bitmap is `multplay_back.tif` (SPMP / UIMP) |
| the lists' order (comment: `sideRows`, ties in join order) | RESOLVED | STRONG | sorted by score, then kills, then name (`strcmp`), highest first; hidden (`+0xfd2`) players are left out |
| the MVP pick (comment: "first on a tie") | RESOLVED | STRONG | the highest total score, then total kills, then name (`strcmp`); both sides; hidden players left out |
| the screens' timings (CountDown, ExitOnStart, TimeoutMonitor) | NOT-A-GAP | PROVEN | READERX's source agrees with research 91 §18's MPZANIM read: 10..1 every 0.5 s then GO; 5 s; 90 s to `dlgNetError` |
| row reveal (`SEQUENCE_DELAY` / `SEQUENCE_INTERVAL`) and the round counters | RESOLVED (sourced, not built) | PROVEN | the lists reveal at 0.15 s then one row every 0.1 s; the GAME COMPLETE counters count up over 3.5-4.0 s (SEAL) and 4.0-4.5 s (TERRORIST) |
| `CLIENT_FINAL_EXIT_PLACEHOLDER` (A1 owns) | PARTIAL (evidence only) | BELIEVED | READERX's `ExitOnStart`: a non-master calls `CloseAndSwitch dlgGameLobby.rdr` at once; the master waits 10 s (`call_gamelobby`) |

Coordinates are in the dialog's own 640x448 frame. COLOR triples are on the dialog engine's 0..128 scale: the lists'
`NORMAL_COLOR` (128,128,128) is full white. The port's dialog compositor (`packages/ui`) already applies that scale,
CHILDOF offsets, YPOS and opacity.

---

### 1. `TITLE_PLACEHOLDER`

**Where.** `$PORT/packages/viewer/src/roundScreens.ts:74`, `{ x: 27, y: 45, scale: 1 }`, used at L107 / L205.

**What it stands for.** The screen's title (ROUND COMPLETE / FINAL ROUND / GAME COMPLETE). In SOCOM 1 the title was
part of the background bitmap.

**Current value.** (27, 45), scale 1, the caption colour.

**Prior search.** Research 91 §18 placeholder table: the layout "searched READERC, MPZANIM (scripts only), ZDB members,
reCOM"; next step "READERX.ZAR and the splash texture library from the full disc".

**What I did.** Parsed `RUN/UI/READERX.ZAR` and `READERC.ZAR` with a Python port of the port's own `zar.ts` / `rdr.ts`
(`D/zarrdr.py`, `D/dump_dialogs.py`, `D/compact.py`).

**Answer (PROVEN).** The title is a TEXT object named `TitleBar`. All three use the dialog FONT `font_text_01`.

| screen | `TitleBar` | caption | source |
|---|---|---|---|
| ROUND COMPLETE | (45,50), SCALE 1.75, COLOR (91,72,36) | `_2133_RoundComplete_MSG` | `dlgMultiplayerRound.rdr` OBJECTS |
| FINAL ROUND | (75,50), SCALE 1.75, COLOR (91,72,36) | `_2103_FinalRound_MSG` | `dlgMultiplayerFinal.rdr` CONTROLS |
| FINAL ROUND (a second object) | `TitleBar` at (15,45), FONT `font_titlebar_01`, SCALE 0.95, COLOR (83,72,36) | `_2105_GameComplete_MSG` | as above |
| GAME COMPLETE | (55,60), SCALE 1.75, COLOR (91,72,36) | `_2105_GameComplete_MSG` | `dlgMultiplayerFinalReally.rdr` |

**Implementation suggestion.** Do not move the constant. Retire the hand layout and build the three screens from
these dialogs with `@s2u/ui`'s dialog runtime (§10). If the hand layout is kept as an interim, set these values:
- `TITLE_PLACEHOLDER` becomes a per-screen title: `{ roundComplete: {x:45,y:50}, finalRound: {x:75,y:50},
  gameComplete: {x:55,y:60} }`, scale 1.75, colour (91,72,36)/128.
- Test first: `roundScreens.test.ts` asserts the title text's x, y and scale per kind.

**Owed evidence.** On FINAL ROUND, whether both `TitleBar` objects are drawn (they overlap) or a script hides one. No
FINAL ROUND animation names either object. Settled by a capture of a FINAL ROUND screen, or by reading how the dialog
loader treats two objects with one NAME.

### 2. `COLUMN_ORDER_PLACEHOLDER`, with `ROUND_LIST_COLUMNS_PLACEHOLDER` (note only)

**Where.** `roundScreens.ts:80`, `['kills', 'deaths', 'score']`. It drives the headers and numbers at L189-L231.

**What it stands for.** Which three stats the round lists, the totals and the MVP row show, in which order.

**Current value.** KILLS, DEATHS, SCORE: the SELECT scoreboard's order, with SOCOM 1's first column.

**Prior search.** Research 91 §18: the order is read by `FUN_00224210` L76333-76339 through `DAT_003dc7f0`, 0x3dc800,
0x3dc810 and 0x3dc820. The note said "read `.data` from the ELF".

**What I did.**
1. Read the .data at 0x3dc7a0..0x3dc83c (`D/read_round_list_data.out`). Each caller's argument is a Metrowerks
   pointer-to-member `{0, -1, func}`. 0x3dc7f0 and 0x3dc800 point to `0x225fe0`, a getter returning `player+0x58c`
   (the round stats block). 0x3dc810 and 0x3dc820 point to `0x225f20`, returning `player+0x544` (the totals block).
   Disassembly: `D/dis_small.out`.
2. Disassembled `FUN_00224210`'s number loop at 0x2245a8-0x2245dc. For i = 0..2 it calls the pointer-to-member at
   `0x3e51c0 + 12*i` through `__ptmf_scall` (`FUN_001828a0`) on that block, then prints `"%d"` (0x3e3850).
3. The column table 0x3e51c0 is all zero in the file. The static initialiser `FUN_003fe860` (0x3fe8b8-0x3fe924) fills
   it from .data 0x3dc750, 0x3dc760 and 0x3dc770 (`D/static_init_3fe860.out`).
4. Read and disassembled those three entries (`D/read_columns.out`):

| column | getter | reads |
|---|---|---|
| 0 | `0x226010` | `lh +0x3c` |
| 1 | `0x226000` | `lhu +0xc` |
| 2 | `0x225ff0` | `lhu +0x12` |

**Cross-checks.**
- In the round block (+0x58c) the three offsets are `+0x5c8`, `+0x598` and `+0x59e`. Harry62's `PlayerObject` has
  `+0x5c8 Round Points` and `+0x598 Round total Kills`.
- Harry labels r0004 `0x226010` `LoadPlayerScore` and r0004 `0x225ff0` "RoundEndTotals: deaths". Both are exact
  matches to these r0001 getters (`harry_map.txt`).
- Harry's "load round deaths" sites read `+0x12` (r0001 0x22a78c) and `+0x59e` (0x598ca0); his "load score" site
  reads `+0x5c8` (0x22a5d0) (`D/deaths_offsets.out`).
- A suicide's -2 is applied to `block+0x3c` (0x545cdc-0x545ce8), which fits a signed score.
- The dialogs' headers agree. In every list dialog, SCORE is centred at x 368 over the 100-wide backing at x 315,
  KILLS at 470 (or 475) over x 420, and DEATHS at 578 over x 525. The lists' right-justified number columns land at
  373 / 475 / 582 on ROUND COMPLETE (LISTBOX XPOS 365 + POSITION 8 / 110 / 217).

**Answer (PROVEN).** The columns are **SCORE, KILLS, DEATHS**, left to right:
- round lists: round score `+0x5c8`, round kills `+0x598`, round deaths `+0x59e`;
- totals and MVP: `+0x580`, `+0x550` and `+0x556`.

Each row is built in this order (`FUN_00224210`): the name (`+0x14`) in column 0 at POSITION -290, then the clan
`"[%s]"` (0x3e53b8, empty `""` without a clan) in column 1 at POSITION -345, then the three numbers. So the clan tag
stands at x 20, left of the name at x 75. The local player's row (`FUN_002b3580`) has its name and clan in COLOR
(91,72,36): floats 0x42b60000 / 0x42900000 / 0x42100000 (D:L76322-76324).

**Implementation suggestion.**
- Set `COLUMN_ORDER_PLACEHOLDER` to `['score', 'kills', 'deaths']` and rename it `ROUND_LIST_COLUMNS` (a source, not a
  placeholder). The headers and numbers in all three screens follow it.
- Test first: a `roundScreens.test.ts` case whose headers read SCORE, KILLS, DEATHS by increasing x, and a row whose
  numbers come out in that order.
- What moves with it: the clan column, and the self row coloured on its name and clan only.

### 3. `PANEL_PLACEHOLDER`

**Where.** `roundScreens.ts:85`, `{ x0: 10, x1: 630, y0: 20, y1: 432 }`: the scoreboard's nine-slice stretched over
the frame (L302-L313).

**Prior search.** As the title's (91 §18).

**Answer (PROVEN).** Every screen has `BACKGROUND {TYPE IMAGE, FILENAME multplay_back.tif}` from `LIBRARY
common/assetlib/spmp`, which is `RUN/COMMON/SPMP_TXR.ZED` (`D/list_spmp.out`). The bitmap is 512x512 PSMT8 with
TEX0.CBP 4 (`D/backsolid_colour.out`). The port's dialog compositor draws a BACKGROUND over the whole UI frame
(`packages/ui/src/compositor/dialogScreen.ts:140`).

Over the background sit translucent `backsolid.tif` IMAGEs. `backsolid.tif` is 16x16 and every texel is index 0 of CLUT
`texpal_3`: PSMCT16 `0xad20`, which is RGB (0,72,88), a dark teal. The panels:

| screen | panel | position, size | opacity |
|---|---|---|---|
| ROUND COMPLETE / FINAL ROUND | `Team_back` | (5,10), 300x230 | 0.4 |
| | `Team_back_Terr` | (5,240), 300x200 | 0.4 |
| | column backings (Score / Kills / Deaths) | x 315 / 420 / 525, y 60 and y 260, 100x180 | 0.3 |
| GAME COMPLETE | `Team_back` | (5,20), 300x150 | 0.4 |
| | `Stat_back` | (5,180), 300x233 | 0.4 |
| | `RoundsTime_back` | (315,180), 310x233 | 0.4 |
| | column backings | x 315 / 420 / 525, y 20, 100x150 | 0.3 |
| | header tops `*_Head_Top` | 100x40 | 0.75 |

**Implementation suggestion.** Replace the black backdrop and the nine-slice with the BACKGROUND and the panel IMAGEs.
- The port already decodes both bitmaps from `UI/UIMP_TXR.ZED` for the online front end (research 144, 153, 158), and
  they are pixel- and colour-identical to SPMP's (`D/cmp_uimp.out`). No new file needs serving if the screens use
  UIMP's copy. To be literal, add `RUN/COMMON/SPMP_TXR.ZED` / `SPMP_PAL.ZED` to `archive/src/frontEndFiles.ts`.
- Test first: the screen's quads include a full-frame `multplay_back.tif` and a `backsolid.tif` quad at (5,10)-(305,240)
  with alpha 0.4.

### 4. `TEAM_BAR_PLACEHOLDER`

**Where.** `roundScreens.ts:90`: a 25-high bar 20 above each team caption (L212, L235, L303).

**Answer (PROVEN).** No dialog has a bar under the team captions.
- ROUND COMPLETE / FINAL ROUND: the captions are plain TEXT at scale 1.0. `SealText` "SEALS" is at (20,70) and
  `CharText` "TERRORISTS" at (20,270). The side's panel and its row strips (§5) carry the colour.
- GAME COMPLETE: the totals rows have 20-high strips at opacity 0.8, children of `Team_back` at +50 (seal) and +75
  (terr), and an MVP strip at +120 at opacity 1.0, each repeated under the three column backings.
- The side's colour is not a team colour: every strip is `backsolid.tif`, the same teal for both sides.

**Implementation suggestion.**
- Delete `TEAM_BAR_PLACEHOLDER` and its two `bars.push` sites.
- Move the captions to (20,70) / (20,270), scale 1.0.
- Move the results (`DrawRoundS` / `DrawRoundT`) to (200,70) / (200,273), scale 1.0 on ROUND COMPLETE and 0.9 on FINAL
  ROUND (whose `DrawRoundT` is at (200,270)), COLOR (91,72,36).
- Test: no quad in the team colours (32,32,64) / (64,32,32) is left.

### 5. `STRIPE_PLACEHOLDER`

**Where.** `roundScreens.ts:92`: stripes on odd rows only, x 20..450 (L220, L315).

**Answer (PROVEN).** Every row slot has a strip, and the strips are static controls drawn whether or not a player fills
the row.

| screen | strips | geometry | opacity |
|---|---|---|---|
| ROUND COMPLETE / FINAL ROUND | `Team_back_Seal1..8` | 300x17 at y 80, 100, .., 220 | 0.8 |
| | `Team_back_Terr1..8` | 300x17 at y 280..420 | 0.8 |
| | under each number column (x 315, 420, 525) | 100x17 at the same y | 0.9 |
| GAME COMPLETE | YOUR STATS rows | 300x20 at y 208 + 23k (k = 0..8) | 0.6 |
| | YOUR STATS header back | 300x23 at y 180 | 0.7 |

The y values are the parent's position plus the child's offset (CHILDOF). Four Kills strips (Seal1-4) carry no OPACITY
(the loader's default 1, `packages/ui/src/dialog.ts:573`).

The lists sit on the strips:
- ROUND COMPLETE: `RoundStatsSealsList` LISTBOX (365,94) and `RoundStatsTerrList` (365,296), SPACING 20, SCALE 0.9,
  NORMAL_COLOR (128,128,128).
- FINAL ROUND: the seal list is at (355,94) with POSITION 18 / 120 / 227 (`D/compact_READERX_dlgMultiplayerFinal.rdr.out`).

**Implementation suggestion.**
- Delete `STRIPE_PLACEHOLDER` and the odd-row `stripes`. Draw the 16 strips per screen from the dialog.
- Move the rows from `{x:129, name:-104, columns:[190,250,310], scale:0.75, pitch:18}` and `listY` 112 / 295 to the
  LISTBOX: x 365, name at -290, clan at -345, columns 8 / 110 / 217 right-justified, scale 0.9, spacing 20, rows at y
  94 / 296. FINAL ROUND's seal list is at x 355 with columns 18 / 120 / 227.

### 6. `YOUR_STATS_PLACEHOLDER`

**Where.** `roundScreens.ts:98`: a fourth bottom block with three numbers (L265-L269).

**Prior search.** "SOCOM 1's final screen has none".

**Answer (PROVEN).** In `dlgMultiplayerFinalReally.rdr`, YOUR STATS is a left-hand block of nine labelled rows:
- the caption `YourStats` `_2115_YourStats_MSG` at (20,198), scale 1.0, COLOR (91,72,36);
- the labels at (20, 224 + 23k), scale 0.9: SCORE, KILLS, DEATHS (COLOR 128,128,128), then `_2116_HitPct`,
  `_2117_HeadShots`, `_2118_PrimaryObjs`, `_2119_BonusObjs`, `_2120_FriendlyKills`, `_2121_SUICIDES`;
- the values in LISTBOX `YourTotals` at (250,225), SPACING 23, SCALE 0.9, UIVAR `PlayerLbContents`, with no COLUMNS
  (one column).

`PlayerLbContents` is filled by `FUN_00225a00` (D:L76886-76933; Harry r0004 0x225a00 "scoreboard?", exact match). It is
called from `FUN_00223970` only when the net state `+0x113 == 6`, the game over (D:L76079-76080). It prints with `"%d"`,
for the local player (`FUN_002b3580`), in this order:

| row | offset | Harry's name for it |
|---|---|---|
| 1 | `+0x580` | total score |
| 2 | `+0x550` | Total Kills |
| 3 | `+0x556` | total deaths |
| 4 | `(int)(+0x588 * 100 + 0.5)` | hit percentage; `+0x588` = `+0x548 / +0x54c`, set at D:L76064-76069 |
| 5 | `+0x544` | headshots (the totals block's first field) |
| 6 | `+0x576` | Total Primary Objectives |
| 7 | `+0x578` | Total Bonus Objectives |
| 8 | `+0x55a` | Team Kills |
| 9 | `+0x558` | Total Suicides |

**Implementation suggestion.**
- Replace the block with the nine rows: `you` becomes `{score, kills, deaths, hitPct, headshots, primaryObjs, bonusObjs,
  friendlyKills, suicides}`. The room's scoreboard row must carry shots hit and fired, headshots, team kills and
  suicides per player per match. Objectives are 0 in SUPPRESSION.
- Test first: GAME COMPLETE's `yourStats` texts are nine values at x 250, y 225 + 23k.
- What moves with it: the room's per-player match totals (`room.ts` scoring; research 91 §8).

### 7. `BOTTOM_CAPTION_PLACEHOLDER`

**Where.** `roundScreens.ts:103`, `{ y: 327 }`, with `final.time` / `final.rounds` at L138-L144.

**Prior search.** "its second line ("ROUNDS WON", "PLAYED", + 15) has no SOCOM II counterpart".

**Answer (PROVEN).** SOCOM II's captions are two-line. They are literal strings in the dialog, not `UIMPXLOC` ids. The
COLOR is (91,72,36), HCENTERED, scale 0.9.

| caption | position | counter (COUNTER, CHILDOF the caption, +35, scale 0.9) |
|---|---|---|
| `RWS` "SEAL ROUNDS" / `SWON` "WON" (+16) | (390,196) | `RoundsWonSeals`, StartTime 3.5, EndTime 4.0 |
| `RLS` "SEAL ROUNDS" / `SLOST` "LOST" (+16) | (555,197) | ValVar `RoundsWonTerrs`, 3.5-4.0 |
| `RWT` "TERRORIST ROUNDS" / `TWON` "WON" | (390,267) | `RoundsWonTerrs`, 4.0-4.5 |
| `RLT` "TERRORIST ROUNDS" / `TLOST` "LOST" | (555,267) | ValVar `RoundsWonSeals`, 4.0-4.5 |

TIME PLAYED: `Time` `_2124_TimePlayed_MSG` at (470,350), HCENTERED, 0.9, COLOR (91,72,36). `TimePlayed` is CHILDOF +25,
UIVAR `TimeInGame` (hh:mm:ss as `FUN_00224670` writes it; the port's `timePlayedText` matches).

Backings: `YRWSBack` strips (310x55 at 0.7 and 310x36 at 0.9, at +0 and +70 in `RoundsTime_back`) and `TimeBack`
(310x60 at +150, 0.8).

The lobby line `RTGL` is at (20,430), scale 0.9. The port has it at (340,423), scale 1.

**Implementation suggestion.** Replace `BOTTOM_CAPTION_PLACEHOLDER`, `final.time`, `final.rounds` and `final.lobby`
with these four blocks, the counters animated over their Start/End times (`@s2u/ui` `widgets/counter.ts` exists), and
TIME PLAYED at (470,350/375). Test first: the four captions' texts and positions.

### 8. `ROUND_SCREEN_LAYOUT_PLACEHOLDER` (note only)

**What it stands for.** The SOCOM II positions, scales and background of the three screens.

**Answer (PROVEN).** Sections 1-7 and §10 give all three layouts.
- The game mounts READERX at the round's end (`FUN_00223970` 0x223f00, `D/read_mounts.out`), and READERC's copies are
  layout-identical (`D/compact.py`; the indentation-stripped diff is empty).
- The background is `multplay_back.tif` from SPMP (UIMP's copy is identical).
- 91 §18's `common/assetlib/splash` (0x3e5360) is the `MPExitState` object's library (`FUN_00224110`, D:L76175+). None
  of the three dialogs names it, and `SPLA_TXR.ZED` holds only `LittleBlack.tif`, `backsolid.tif` and `db_back.tif`.
  The `winner.TIF` / `loser.TIF` that `splash.rdr` lists are not used by these screens (`D/list_spmp.out`).

**Implementation suggestion.** §10.

### 9. The lists' sort and the MVP (comments in `roundScreens.ts:184-187`, L246-L247)

**The lists' order (STRONG).**
- `FUN_00224210` collects the side's players whose `+0xfd2` byte is 0. Those whose byte is set are left out: the
  scoreboard's hidden rows (research 91 `GHOST_ROW_PLACEHOLDER`).
- It sorts them with `FUN_00226060` and comparator `FUN_00225f30` (round lists, via pointer-to-member 0x3dc780:
  `+0x58c`) or `FUN_00225e70` (totals, 0x3dc790: `+0x544`) (`D/read_sort.out`).
- The comparator is "less" by score `+0x3c`, then kills `+0xc`, then `strcmp(name_a, name_b) < 0` (`FUN_00198f18` =
  `strcmp`, `D/read_mvp.out`; D:L77014-77068).
- The rows are added from the end of the sorted array (D:L76309), so the order is score, then kills, then names in
  reverse `strcmp` order, highest first.
- The port sorts by score and keeps join order on a tie.
- Interpretive step: `FUN_00226060` is taken to be an ascending sort by this comparator; its body was not proven.

**The MVP (STRONG).** `FUN_002256f0` (D:L76771-76885) walks every player of either side with `+0xfd2 == 0`. It keeps
the candidate with the higher total score `+0x580`; on a tie the higher total kills `+0x550`; on a tie `strcmp(best,
cand) < 0` takes the candidate. `MvpName` is printed as `"[%s] %s"` with a clan or `"%s"` without (0x3e5438 /
0x3e5440). `MvpLbContents` holds the MVP's SCORE / KILLS / DEATHS totals.

**Team totals (NOT-A-GAP).** `FUN_00225bc0` (D:L76935+) sums each column over the side's non-hidden players, as the
port does. The average branch is for the hit-percentage pointer-to-member 0x3dc7a0, which is not one of the columns.

**Implementation suggestion.**
- `sideRows`: sort by `(score, kills, name)` descending, the names compared by code unit.
- The MVP: the same key over both sides.
- Leave out rows flagged hidden.
- Test: two equal scores ordered by kills, then by name.

### 10. The whole `ROUND_SCREEN_LAYOUT` (comment kind: SOCOM 1 positions in a constant not named a placeholder)

**Where.** `roundScreens.ts:106-148`.

**Answer (PROVEN).** Every entry differs from SOCOM II's. The main ones:

| element | SOCOM II | the port |
|---|---|---|
| `NextMission` (`_2132_NextRound_MSG` / `_2102_FinalTotals_MSG`) | (380,50), scale 1.0 | (380,45), scale 0.8 |
| `CountDown` | CHILDOF +130 on both screens, scale 1.2 | +110 / +125 |
| captions | (20,70) / (20,270), scale 1.0 | (27,87) / (27,270) |
| results | (200,70) / (200,273), scale 1.0, gold | (200,90) / (200,273), scale 0.9 |
| column headers | centred at 368 / 470 / 578, y 75 (seal) and 277 (terr), scale 0.9 | right-justified at 319 / 379 / 439, scale 0.65 |
| lists | see §5 | |
| GAME COMPLETE headers | y 55, gold, centred 368 / 475 / 578 | |
| GAME COMPLETE totals | `SealText` "SEAL TOTALS" (20,85) 0.9 with `DrawRoundS` +220; `TerrText` (20,110) | |
| MVP | `MVPText1` (20,135) 1.0 gold, with `MVPText` +20 0.9 (UIVAR `MvpName`) | |
| totals lists | `SealsTotals` (350,85) SPACING 25, `TerrsTotals` (350,110), `MvpTotals` (350,155); columns 25 / 125 / 230 right-justified (x 375 / 475 / 580) | |

**Implementation suggestion (preferred).** Retire the hand layout. Load the three dialogs through the port's existing
dialog loader and compositor (`@s2u/ui` `dialog.ts`, `compositor/dialogScreen.ts`). They already handle TEXT, IMAGE,
LISTBOX (with `SEQUENCE_DELAY` / `SEQUENCE_INTERVAL`), COUNTER, CHILDOF, OPACITY and BACKGROUND (research 105, 112,
117). Feed the UI vars from the room's score event:
- `RoundStatLbContentsSeals/Terrs`: rows of name, `[clan]`, score, kills, deaths;
- `GameSealsTotLbContents` / `GameTerrsTotLbContents`;
- `MvpName` and `MvpLbContents`;
- `PlayerLbContents`;
- `RoundsWonSeals` / `RoundsWonTerrs`;
- `TimeInGame`.

Run the sets' scripts from MPZANIM, as research 91 §18 read them, or as the READERX source gives them. Tests, golden
first:
- the ROUND COMPLETE dialog builds from READERX with the column order of §2;
- the list's row 0 sits at y 94;
- the CountDown text after 1.0 s is "8".

What moves with it: `roundScreens.ts` shrinks to the UI-var feed, and `ROUND_STRINGS` is used only for the literals
the scripts set. Owner's call: whether the HUD pass or the UI compositor draws these screens in the match page.

### 11. The screens' timings (NOT-A-GAP) and the row reveal (sourced, not built)

READERX's `ANIMATION_DEFINITIONS` (the source form; `D/READERX_dlgMultiplayer*.rdr.out`) agrees with research 91
§18's read of MPZANIM's compiled sets:

| animation | dialog | what it does |
|---|---|---|
| `CountDown` | Round | "10" .. "1" every 0.5 s, then `_2111_GO_MSG` |
| `CountDown` | Final | "20" .. "1" every 0.5 s, then GO and `SWITCHMENU dlgMultiplayerFinalReally.rdr` |
| `ExitOnStart` | Round | WAIT 5.0, then `ReplayMission` in a loop, unless `HaveBeenBannedFromGame` |
| `TimeoutMonitor` | all three | WAIT 90.0, then `GameStatePopCommand dlgNetError.rdr` |
| `MaintainDoneCounting` | FinalReally | `DoneCounting` 0, WAIT 5, then 1 |
| `MpFinalOnOk` | FinalReally | after `DoneCounting`, the OK press returns to the lobby; before it, the press finishes the counters |

The port's 5 s and 10 s holds and its countdown match.

Not built: the lists' `SEQUENCE_DELAY 0.15` / `SEQUENCE_INTERVAL 0.1` reveal (rows appear one by one), the GAME
COMPLETE count-ups, and `MpFinalOnOk`.

`CallRoundATie`: on ROUND COMPLETE, under `mp_allow_respawn == 1`, the winner words are set by `mp_winner` (0, 8, 99);
then `mission_timeout == 1` gives DRAW on both. The port's rule is the same.

### 12. `CLIENT_FINAL_EXIT_PLACEHOLDER` (evidence only; fork A1 owns the row)

READERX's `dlgMultiplayerFinalReally` `ExitOnStart` runs these steps:
1. `UpdateMpFinalStatsUiVars`.
2. `IDFromBriefing = 0`, `ClanSwapSidesIndex += 1`.
3. If `HaveBeenBannedFromGame`: `BanSelfFromGame`, WAIT 0.5, `GameStatePopCommand dlgNetBanned.rdr`.
4. Else, if not `IsSessionMaster`: `CloseAndSwitch dlgGameLobby.rdr` at once, then the sequence
   `watch_for_switch_to_master` polls each second.
5. Else (the master): `watch_for_switch_to_client` calls `call_gamelobby`. That is WAIT 10, then
   `return_to_gamelobby`: stop `ExitOnStart`, `player_ready_count = 0`, `mp_x_sec_clock = 11`, `CloseAndSwitch
   dlgGameLobby.rdr`.

So the script sends clients to the lobby at once and holds the master 10 s, unless a press after 5 s
(`MpFinalOnOk`) returns sooner. BELIEVED: what `CloseAndSwitch` does on the screen (immediate, or after a close
animation) is the engine's and not read. Owed: a two-client capture at a match's end, as 91 §18 says.

---

### 10.2 Sourced but not implemented

- **The vote-kick at round end, SOCOM II's own.** Both `ExitOnStart`s in READERX source (ROUND COMPLETE and GAME
  COMPLETE) test `HaveBeenBannedFromGame`, then `BanSelfFromGame`, WAIT 0.5 and pop `dlgNetBanned.rdr`. Research 91
  §17 rates this "believed, from SOCOM 1's copy". It is now shown in SOCOM II's own dialog source, so the kick applies
  on the round screen before `ReplayMission`.
- **The end-of-game lobby return.** After the match, `return_to_gamelobby` sets `player_ready_count = 0` and
  `mp_x_sec_clock = 11` (the lobby's 10-second relaunch clock). `ClanSwapSidesIndex += 1`: clan matches swap sides
  each game.
- **YOUR STATS' match counters.** Hit %, headshots, friendly kills and suicides (§6) need per-player counters the room
  does not keep.
- **The row reveal and the counters' count-up** (§11).
- **The 90-second round-screen timeout** to `dlgNetError` (a stall guard).

### 10.3 Leads for other workstreams

- **A1 (vote/ban, `GHOST_ROW`, `CLIENT_FINAL_EXIT`).**
  - §12 and the first bullet above.
  - The lists' and the MVP's `+0xfd2 == 0` filter (`FUN_00224210`, `FUN_002256f0`, `FUN_00225bc0`) is the round
    screens' use of the hidden-row byte that `GHOST_ROW_PLACEHOLDER` asks about.
- **The kick dialogs.** `dlgNetBanned.rdr` (1,664 B) and `dlgNetAbandoned.rdr` (1,112 B) are in READERC; compact dumps
  in `D/compact_READERC_dlgNetBanned.rdr.out` and `_dlgNetAbandoned.rdr.out`.
- **ONL-22, leaving and network errors.** `dlgNetError.rdr` (READERC 0x71000, 2,024 B) is the 90 s timeout's target.
- **ONL-16, the game lobby.** `dlgGameLobby.rdr` (READERC 0x318b0, 20,728 B) is decoded in
  `D/compact_READERC_dlgGameLobby.rdr.out`. It is the screen `WAITING_LINE_READING` and `CLASSIC_WAITING_PLACEHOLDER`
  stand in for.
- **The match scoring.** `FUN_00223970` D:L76030-76069 adds each round block into the totals block field by field at
  round end. That is the mapping from round stats (+0x58c..) to match stats (+0x544..), and it also sets the hit ratio
  `+0x588`.

## 11. Part E -- bodies, death and flinch clips, the knock, equipment, doors

Scripts: `scratch/C1/E/` (README.txt).

Fork E of C1-match-server, 2026-10-04. Read-only. Decomp = `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`
(`D:L<line>`), ELF = `game/disc/socom2_game.elf` (r0001). Disc scripts dumped with the port's own readers (`Zar`,
`parseRdr`, `parseMotionClip` from `$WT/packages`, read only). Scripts and outputs:
`scratch/C1/E/` (README.txt). `$PORT` = the `agent/online` snapshot.

### 11.1 Summary

| item | status | grade | one-line answer |
|---|---|---|---|
| DEATH_NAME_PLACEHOLDER | RESOLVED | PROVEN | `animset.rdr` GLOBAL: Die=`death_stand_chest01`, Death02=`death_stand_chest02`, **Crawl death01=`death_stand_groin02`, Crawl death02=`death_stand_groin01`** -- the port has the two groin clips swapped |
| DEATH_ORBIT_EULER_READING | RESOLVED | PROVEN | `FUN_003083c0` + the VU0 multiply = Ry(yaw)·Rx(tilt)·v; the port's `turnY(tiltX(v))` equals it to 1.4e-14 |
| FLINCH_GATE_READING | PARTIAL | STRONG | every refusal now named (ladder state 5, states 9/10, a weapon/launcher/turret switch, Restrained/turret anim sets, on a turret, falling, Stab/CQB/restraint/Stabbed/long head deaths playing, the 3 long hits, motion bit 0x40); the port's gate still differs (see table) |
| FLINCH_LAYER_PLACEHOLDER | PARTIAL | STRONG | `0xd` is not a layer: a non-zero 5th argument of `FUN_00588bc0` only suppresses its generic net send; the flinch is the top of the one motion stack; its bit 0x4 blocks a reload start, bit 0x2 blocks stab/CQB/restrain -- no stick/look/fire reader found |
| FLINCH_STANCE_READING | RESOLVED | STRONG | the row is the state's stance, but during the first half of a stance-change motion (0x11/0x13/0x19) the change's origin stance; +0x1060 bit 4 forces prone |
| KNOCK_IN_MOVE_PLACEHOLDER | PARTIAL | STRONG | the game has **no** traversal gate on the knock; it cancels a stab/restraint, finishes a weapon switch, leaves a turret, pops the motion stack, then falls -- the port's skip is a deviation |
| KNOCK_SIDE_READING | RESOLVED | STRONG | `FUN_00306fd0` is a quaternion rotate (VU0 microprogram decoded); Fall backwards iff the push (root - blast) has a positive component along the body's local +z, i.e. its back (model faces -z): the port's rule is the game's |
| PRONE_COVER_PLACEHOLDER | RESOLVED | PROVEN | the clip exists: "Prone cover" -> `guard_prone_cover` (GLOBAL set, included by the Seal anim set), 16 frames in `MOTION_P.ZAR`, `motion.rdr` playback 4.3, NoFire/NoInterrupt |
| CORPSE_KNOCK_PLACEHOLDER | NOT-A-GAP | PROVEN | retirement verified (L440981 "inside the radius or dead") |
| BODY_FADE_PLACEHOLDER | NOT-A-GAP | PROVEN | the value is sourced (alpha to 0 at 0.1/s, D:L454491); the gap is the port's skinned material, not the original |
| REMOTE_KIT_APPLY_PLACEHOLDER | RESOLVED | STRONG | the received kit is applied at the remote SEAL's (re)spawn, `RemoteRespawn` = r0001 `FUN_00598b90` (D:L455070-455081), from its net object's data +0x34 -- the port's `'spawn'` is the game's |
| C4_STILL_READING | PARTIAL | STRONG | `FUN_005be990` is not the SEAL's speed: it is a 0.2 s settle timer on the **aimed C4 target** (same target, not moved); the plant also needs body `+0xe84 == 0.0` (writer not found) |
| C4_TARGET_READING | PARTIAL | STRONG | the target is the object the crosshair pick hits (`body+0x3dc`, `FUN_005aa6e0`) whose `+0x94` destructible accepts (hp `+0x1c` > 0, threshold `+0x10` <= damage); which map nodes carry one is owed (kind-3 zAnim damage blocks) |
| LAUNCHER_RAISE_READING | RESOLVED | STRONG | raise = `seal_rifle2launcher` (35 fr) / `seal_pistol2launcher` (24 fr), `motion.rdr` playback 1.5, **NoFire**: 1.4155 s / 1.3776 s by the port's own one-shot formula (now 1.2388 s); lower = the same clip reversed |
| RELOAD_SECONDS_PLACEHOLDER | NOT-A-GAP | -- | fallback only (a server without `MOTION_P.ZAR`); no original counterpart |
| CLAYMORE_PLACEHOLDER | NOT-A-GAP | -- | retired (no constant in the snapshot; `room.ts` `placeCharge`) |
| POUCH_PLACEHOLDER | NOT-A-GAP | -- | retired (`pouchOf`, `equipment.ts` L100) |
| PICK_TIE_READING | PARTIAL | STRONG | the game's pick has no tolerance: strict nearest (squared distance `<`); an exact tie goes to the earlier hit of the ray query's list; the door is found on the hit node or up to 6 ancestors, and a nearer passable-surface action wins |
| doors.ts:419 (comment) | RESOLVED | STRONG | the reticle pick's surface test is the material's: VOLUMETRIC (bit0), LIQUID (bit1), penetration >= 0.98 without PICKUP (bit4), and a surface whose `+10` bits 2-3 == 1 -- not the movement's skip bit |
| remotePlayers.ts L95 / L137 / L155-162 (comments) | -- | -- | the same items as REMOTE_KIT_APPLY / FLINCH_GATE / FLINCH_LAYER above |
| remotePlayers.ts L186-188 (comment: footfall `+0xe0` gate) | PARTIAL | STRONG | bit 2 of `+0xe0` = the viewer's own actor plus at most 3 others (`DAT_0064fc78` = 3) within 500 units, set by `FUN_00552850` (the name `REMOTE_STEP_STICK_READING` is C9's) |

---

### 11.2 DEATH_NAME_PLACEHOLDER
**Name**: `$PORT/packages/viewer/src/net/deaths.ts` L9-11 (the comment; the lists L22-27).
**What it stands for**: which motion clips `damanim.rdr`'s names "Die", "Death02", "Crawl death01", "Crawl death02" play.
**Current value**: read "by the lists' order": Die=`death_stand_chest01`, Death02=`_chest02`, Crawl death01=`death_stand_groin01`, Crawl death02=`_groin02`.
**Prior search**: `MOTION_P.ZAR`'s keys only (research 91 §16).
**What I did**: dumped `RUN/READERC.ZAR/animset.rdr` and `damanim.rdr` (`E/dump_rdr.ts` -> `animset.out`, `damanim.out`), indexed the anim sets (`E/animset_index.py` -> `death_names.out`). The death call resolves an anim type name through the actor's anim set; the Seal anim set includes `GLOBAL` and `SOLDIER` (animset.out L1458-1460).
**Answer** (PROVEN, disc data): `GLOBAL` maps Die -> `death_stand_chest01`, Death02 -> `death_stand_chest02`, **Crawl death01 -> `death_stand_groin02`**, **Crawl death02 -> `death_stand_groin01`**, all `network_log` (animset.out L7-34). In `damanim.rdr` BODY_DEATH_ANIMATIONS STAND, Crawl death01 is the 7th entry and Crawl death02 the 8th, so the port's list has positions 7 and 8 swapped. The uniform draw's distribution is unchanged; a seeded draw and any capture comparison are not.
**Implementation suggestion**: `deaths.ts` `BODY.stand` ends `'death_stand_groin02', 'death_stand_groin01'`; retire the name. Test first: a fixture test that builds each damanim list through `animset.rdr` (GLOBAL+SOLDIER+Seal) and expects `BODY`/`HEAD` to equal it entry for entry (with `SOCOM_DISC`).
**Owed evidence**: none.

### 11.3 DEATH_ORBIT_EULER_READING
**Name**: `$PORT/packages/viewer/src/deathCamera.ts` L25, L77.
**What it stands for**: the rotation order of `FUN_003083c0(m, (tilt, yaw, 0))` used by the death camera.
**Current value**: tilt about x, then turn about y (`orbit = turnY(tiltX(v))`).
**Prior search**: "not read" (research 91 §16).
**What I did**: read `FUN_003083c0` D:L206855-206884 (`FUN_001b3720` = sinf, `FUN_001b3548` = cosf, `socom2_names.csv`, exact fingerprint); disassembled the use in `FUN_00297a30` (`E/orbit_dis.py` -> `orbit_dis.out`): `$a0 = $s2` is the matrix, rows loaded `LQC2 vf4..vf6, 0/0x10/0x20($s2)`, then `VMULAx`, `VMADDAy`, `VMADDz` -- out = v.x·row0 + v.y·row1 + v.z·row2 (row-vector product). `E/orbit_check.py` builds the matrix exactly as the decomp writes it and compares with the port's formulas over 10,000 random cases.
**Answer** (PROVEN): the game's orbit is Ry(yaw)·Rx(tilt)·v with the same signs as the port: max |game − port| = 1.4e-14 (`orbit_check.out`).
**Implementation suggestion**: rename to a sourced constant/comment (cite D:L206875-206883, 0x297fcc-0x297fd4); add `orbit_check`'s matrix as a unit test of `orbit`.
**Owed evidence**: none.

### 11.4 FLINCH_GATE_READING
**Name**: `$PORT/packages/viewer/src/remotePlayers.ts` L130-139 (and the comment L137); `walk.ts` L265.
**What it stands for**: which states refuse a flinch; the port plays one over "ground play only".
**Current value**: `'ground play only'`.
**Prior search**: research 91 §21 rows "refused" (kinds named only by address).
**What I did**: read `FUN_005a2690` D:L459884-460050, the anim-type table init D:L495250-495414 (names via `FUN_005e4f90(string)`, strings read from the ELF), `FUN_005a7980` D:L462473-462507, `FUN_00588030` D:L445700-445713, the anim-set statics D:L496070-496091.
**Answer** (STRONG -- each gate is read; whether it is the whole list is one step): no flinch (D:L459887-460017) when the actor is
- falling: `FUN_00588030` = "Fall forward"/"Fall backwards" playing (then only the motion's `+0x2b` set to 8);
- in state 9 (unless a death call), state 10, state 5 (ladder, research 91), state 8;
- playing "Stab" (`DAT_003dee08`), "CQB attack" (`dee20`), "Apply restraints" (`dee48`), "Receive restraints" (`dee40`), "Stabbed" (`dee18`), "Death stand head01" (`dee30`), "Death stand head03" (`dee38`);
- playing one of the three long hits ("Hit stomach01", "Hit shoulder", "Hit01");
- in a weapon switch (`FUN_005a7980(actor,1)`: motions 0x35/0x36/0x37 = the stand/crouch/prone swaps, "Rifle -> Launcher", "Pistol -> Launcher", "Stand -> Turret", "Pistol stand -> Turret", or a pending switch object `+0x1e4`);
- in the "Restrained anim set" (`DAT_0044d400`) or "turret anim set" (`DAT_0044d410`) (`+0x528`), or holding a turret (`+0xeb8`);
- the playing motion flagged 0x40 (outside motion kinds 1/0x12/0x1a);
- the alive bit (`+0xe1` bit 4) clear.
It does **not** refuse a jump, a climb or a landing: the flinch pops the motion stack down to its base kind (1/0x12/0x1a, `FUN_0058a4d0` D:L446753-446781) and pushes itself. The port refuses over traversal clips, mover actions (landing, knock, stance change, swap) -- the knock and the swap agree with the game, the landing/climb/jump/stance change do not.
**Implementation suggestion**: replace `'ground play only'` with an explicit predicate in `remotePlayers.ts`/`walk.ts`: refuse on ladder, knock fall, swap/launcher raise, (no stab/restrain in the port); allow over jump/climb/landing/stance change. Test: a hit during a jump plays the flinch; during `Fall forward` it does not.
**Owed evidence**: what states 9/10 and motion kinds 1/0x12/0x1a are by name (the anim-type index table; `FUN_005e4f90`'s list).

### 11.5 FLINCH_LAYER_PLACEHOLDER
**Name**: `remotePlayers.ts` L153-164 (+ comments L155-162, `netPage.ts` L878, `walk.ts` L265-268).
**What it stands for**: what `FUN_00588bc0(actor, motion, state, 0, 0xd)`'s `0xd` and the motion's `+0x28` bits 4/2 do (layering, control loss).
**Current value**: `'whole body, from the event'`.
**Prior search**: research 91 §21.1 ("readers unread").
**What I did**: read `FUN_00588bc0` D:L446055-446420; searched the readers of motion `+0x28` (`FUN_005551a0(..+0x28, 2|4)` and `& 4`): D:L437463, L463377, L463495, L469500, L514669; identified the callers (`FUN_005b4340(actor,3)` is called by the reload start `FUN_005a82e0` D:L462816; `FUN_005a9500` calls `FUN_005b4340(actor,7)` with the CQB/stab kinds; `FUN_005a90b0` the restraint kinds).
**Answer** (STRONG): (1) the 5th argument is not a layer: its only use is D:L446413-446414 -- when it is 0, `FUN_00588bc0` itself sends the started motion (`FUN_002bbaf0(id, motion, state, reverse, 0)`); a non-zero value (0xd) suppresses that, and `FUN_005a2690` sends its own kind 0xf message (L460025). The 4th argument is the reverse flag (`FUN_0028c160`, L446300-446302). (2) The flinch is pushed on the actor's single motion stack (`FUN_0028dc90(+0x170, ...)`, L446292) after the pop to base -- one whole-body motion, no separate layer. (3) Bit 0x4 of the started motion refuses a **reload start** (`FUN_005b4340(actor,3)` D:L469500, reached from `FUN_005a82e0` D:L462816); bit 0x2 refuses a stab/CQB (`FUN_005a9500` D:L463495), a restraint (`FUN_005a90b0` D:L463377) and an AI step (`FUN_006078a0` D:L514669). No reader of either bit in the walk, look or trigger path was found by these patterns.
**Implementation suggestion**: keep whole-body; add to the room and page: a reload request while the flinch clip plays is refused (bit 0x4). Test: room refuses `reload` within the flinch's playback after a non-lethal hit.
**Owed evidence**: whether the motion blend keeps the legs' locomotion under the top motion (a trace of a running SEAL hit, PLAT-36: the posed root's track vs `seal_flinch_*`).

### 11.6 FLINCH_STANCE_READING
**Name**: `$PORT/packages/viewer/src/net/deaths.ts` L82-89.
**What it stands for**: which stance row of `<PART>_FLINCH_ANIMATIONS` the game uses.
**Current value**: `'the posture'`.
**Prior search**: research 91 §21.1 (rule read, its difference "unread").
**What I did**: read `FUN_005a0270` D:L458733-458785.
**Answer** (STRONG): row = `FUN_0058a720(actor,0)`'s stance (0/1/2 as is; 7, 9, 10 -> 0; 8 -> `FUN_0057dbb0` (and the actor's vtable +0x90 call); others -> `FUN_0057dbb0`); while motion 0x11, 0x13 or 0x19 plays and is in the first half of its play (phase < 0.5, or > 0.5 when its `+0x28` bit 0x20 reverses it), the row is the transition's origin: 0x11 stand(0)/crouch(1), 0x13 crouch(1)/prone(2), 0x19 stand(0)/prone(2) (L458746-458775); the `+0x1060` bit 4 forces prone (L458777). Interpretive step: 0x11/0x13/0x19 are the stand-crouch, crouch-prone, stand-prone changes (inferred from the rows they yield).
**Implementation suggestion**: the room's `flinchClip` stance = the previous posture while the body's stance change is under half done (the mover knows the change's start and length), else the posture. Test: a hit 0.1 s into stand->crouch draws from the stand row.
**Owed evidence**: the anim-type names of 0x11/0x13/0x19.

### 11.7 KNOCK_IN_MOVE_PLACEHOLDER
**Name**: `$PORT/packages/viewer/src/net/blast.ts` L137-141 (`applyKnock`).
**What it stands for**: the knock on a SEAL on a ladder or a hang.
**Current value**: none while a traversal move holds the mover.
**Prior search**: research 85 §12.1 ("the game drops the SEAL out of the state first", citing `FUN_0057ee00`/`FUN_005a5da0`).
**What I did**: read the callers of `FUN_0057e770` (D:L459311 at the end of the blast `FUN_005a0e70`, local controller only; D:L459613; D:L302887 in `FUN_003acc10`), and `FUN_0057ee00` D:L441131-441189, `FUN_005a5da0` D:L461653-461756, `FUN_00545ee0` D:L411941-412032, `FUN_005807d0` D:L442059-442135, with the anim-type names (D:L495252-495414).
**Answer** (STRONG): there is no state gate: `FUN_0057e770` knocks any SEAL inside the radius or dead, prone aside. The prior note's functions are not a ladder drop: `FUN_0057ee00` releases the victim of a "Stab"/"Apply restraints" in progress (+0xeac) into a fall; `FUN_005a5da0` completes a pending weapon/launcher switch; `FUN_00545ee0(actor,1)` leaves a turret (sound ".RELEASE_TURRET", 0x65c3f0); `FUN_0058a4d0(actor,0)` pops the motion stack to its base; `FUN_0059d750` releases `+0x1062`; `FUN_005807d0` also leaves the turret anim set and plays the fall in the actor's current state (or 8 dead). So the game knocks a SEAL off whatever it was doing, the ladder included; the port skips the knock there.
**Implementation suggestion**: `applyKnock` should end the traversal move (as the swap is ended) and lay the knock. Test: a grenade at a ladder knocks the climber (velocity, fall clip).
**Owed evidence**: what state the fall leaves a laddered actor in (`+0x174` 5 kept?) -- a recomp trace of a blast beside a ladder.

### 11.8 KNOCK_SIDE_READING
**Name**: `$PORT/packages/viewer/src/net/blast.ts` L89-91, L112-113.
**What it stands for**: which fall clip a knock plays.
**Current value**: `along = -sin(yaw)·ux - cos(yaw)·uz`; `fallBackwards` when `along < 0`.
**Prior search**: research 85 §12.1 ("a VU0 matrix routine ... read as pushed against the facing").
**What I did**: decoded the VU0 microprogram `FUN_00306fd0` calls (`VCALLMS` imm 0xa, byte 0x50) from the PCSX2 capture `C:/Projects/socom_pc/logs/parity/pcsx2_vu0MicroMem.bin` (`E/vu0_decode.py` -> `vu0_0xa.out`, `vu0_0x12.out`: a branch to idx 0x12, then MUL/MR32/ADD/SUB code computing `v(2w²-1) + 2q(q·v) + 2w(q×v)`); disassembled the call site (`E/knock_side_dis.py` -> `knock_side_dis.out`: the quaternion is (-q.x, -q.y, -q.z, q.w) of actor `+0x50..+0x5c`, the vector is `root - blast` from `FUN_00309200` (D:L207498-207505, a-b), the tested float is output z at sp+0x68; z > 0 -> `FUN_005807d0(actor,1)`); `FUN_005807d0`'s 1 = "Fall backwards" (`DAT_003deed8`, string 0x661f88), 0 = "Fall forward" (`DAT_003deed0`, 0x660758).
**Answer** (STRONG): `FUN_00306fd0(q, v, out, n)` rotates by a unit quaternion; the game rotates the push into the body's frame and plays Fall backwards iff its local z is positive. The port's body frame faces −z (`hitVolumes.ts` L18; the mover's forward is (−sin, −cos), `mover.ts` L1474-1475), so local +z is the back: pushed toward its back (the blast in front) -> Fall backwards -- the port's rule. The remaining step: that the game's model also faces −z in its own actor frame (the port's `actorToWorld` frame was read from the game).
**Implementation suggestion**: retire the name; cite the microprogram decode. Test exists (`netBlast.test.ts` sides).
**Owed evidence**: none needed for the rule; a capture would confirm the model axis.

### 11.9 PRONE_COVER_PLACEHOLDER
**Name**: `$PORT/packages/viewer/src/net/blast.ts` L80.
**What it stands for**: the clip for "Prone cover" (`DAT_003dece0`, string 0x661a38) the game plays when a blast reaches a living prone SEAL (D:L441018).
**Current value**: nothing plays ("a clip the SEAL's pack does not hold").
**Prior search**: research 85 §12.1.
**What I did**: `animset_index.py` -> `animset_knock.out`; `motion_clips.ts` -> `motion_clips.out`; `clip_seconds.py` -> `clip_seconds.out`.
**Answer** (PROVEN): `GLOBAL` maps "Prone cover" -> `guard_prone_cover` (network_log); the Seal anim set includes GLOBAL; `MOTION_P.ZAR` holds `guard_prone_cover` (16 frames); `motion.rdr`: NoPitchtwist, NoInterrupt, NoFire, Normalize, playback 4.3 (3.78 s by the port's `oneShotSeconds`). The game pushes it in the actor's state with motion bit 0x2 (D:L441018-441020) and online sends it to the others as kind 0x22 with code 0x10 (D:L441027).
**Implementation suggestion**: add `proneCover: 'guard_prone_cover'` to the clips the room/page request; on a prone survivor's blast send it in the snapshot action codes (as the falls). Test: `netBlast.test.ts` prone case returns the cover clip, not null.
**Owed evidence**: none.

### 11.10 CORPSE_KNOCK_PLACEHOLDER (retired) -- NOT-A-GAP
`blast.ts` L86. Verified: D:L440981 knocks inside the radius *or* with the alive bit clear; D:L441001/441013-441015 as the note says. No constant remains.

### 11.11 BODY_FADE_PLACEHOLDER -- NOT-A-GAP (for sourcing)
`remotePlayers.ts` L73. The value is sourced: `FUN_005979a0` D:L454491 calls `FUN_00552780(0, 0.1, actor, 2)` (target alpha 0 at rate 0x3dcccccd = 0.1/s, `consts.out`; `FUN_00552780` D:L418720-418743 stores target/rate at `+0x230/+0x234`), online, in the branch where the game object's `+0xdc` is set and `+0xd2` clear (else the spectate path). The gap is the port's skinned material lacking opacity -- a rendering task, nothing to source.

### 11.12 REMOTE_KIT_APPLY_PLACEHOLDER
**Name**: `remotePlayers.ts` L94-100 (+ comment L95).
**What it stands for**: when another console's body takes up a received kit.
**Current value**: `'spawn'`.
**Prior search**: research 94 §A6 ("callers L455079 and L455445 not traced").
**What I did**: read D:L455070-455081 (in `FUN_00598b90`), `FUN_002bd3d0` D:L161729-161745, `FUN_0053ec60` D:L407354-407382, `FUN_00599690` D:L455422-455450; mapped `FUN_00598b90` to r0004 with the return set (`c1lib.r1_to_r4(0x598b90)` -> 0x59e690, Harry's `RemoteRespawn__10CZSealBodyFb`, relinked-body).
**Answer** (STRONG: decomp + Harry's name): online, at `RemoteRespawn` (`FUN_00598b90`), for an actor whose controller's vtable +0x2c answers 0 and whose `+0xc8` lacks 0x10000000/0x20000, the character's item list (`+0x540` -> `+0x2e8`) is rebuilt from up to 8 (id, short, short) records at the SEAL's network object data +0x34 (`FUN_002bd3d0`: the net object looked up by the actor's id `+4`), and `character+0x300` = 1. `FUN_00599690` does the same for a newly made body. So the kit is taken up at the (re)spawn: the port's choice is the game's.
**Implementation suggestion**: rename to a sourced constant (no value change). Test exists.
**Owed evidence**: none for the moment; the record's two extra shorts (ammo counts?) are unread.

### 11.13 C4_STILL_READING
**Name**: `$PORT/packages/viewer/src/equipment.ts` L144-149, L164 (also `room.ts` L1740).
**What it stands for**: "the kit still" before a C4 plant (`FUN_005be990(kit) == 0`, `+0xe84 == 0`).
**Current value**: SEAL speed <= `CLAYMORE_RULES.maxSpeed` 3.2 u/s.
**Prior search**: research 94 L1547 ("`FUN_005be990` not read").
**What I did**: read `FUN_005be990` D:L475204-475208 (returns kit `+0x8a4`), every access of `+0x8a4` (`E/find_imm_stores.py 0x8a4 all`), `FUN_005be6f0` D:L475097-475199 (called each kit frame from `FUN_005c0fd0` D:L476548), the Action path `FUN_00592d50` D:L452025-452045, the HUD's `FUN_00215c10` D:L70073-70080, `FUN_005be9a0` D:L475379-475406; scanned the ELF for `+0xe84` accesses (`E/e84.out`: one load, D:L475403).
**Answer** (STRONG for the timer; `+0xe84` UNRESOLVED): kit `+0x8a4` is a settle timer: reset to 0.2 s (0x3e4ccccd, `consts.out`) when the body's aimed object (`+0x3dc`) has no `+0x94` interface accepting the kit's `+0x8a0`, or is not last frame's, or its node-transformed position moved since last frame; otherwise it counts down by dt to 0. So the plant needs the same C4 target under the crosshair, unmoving, for 0.2 s -- **nothing about the SEAL's speed**. The Action path (D:L452030-452039) tests only that, `body+0x208 < 396` and the pick; the placing `FUN_005be9a0` (D:L475402-475405) adds `body+0xe84 == 0.0`, a float with no immediate-offset writer in the ELF.
**Implementation suggestion**: `c4Plant` gate = the same target held 0.2 s; keep a body-stillness test only as a named reading of `+0xe84`. Test: a target newly under the reticle is refused for 0.2 s.
**Owed evidence**: `+0xe84`'s meaning: an RDRAM read of the local body at `+0xe84` standing vs walking (a PCSX2 dump in a round; the actor at `PlayerObject +0x0` per Harry).
**Ported** 2026-10-05 (web sprint 26 PF-13; research 210 s9): the settle (`C4_AIM_SETTLE_S`, `C4Settle`); `C4_STILL_READING` retired; `+0xe84` note-only (`C4_BODY_STILL_READING`, research 210 s9.1).

### 11.14 C4_TARGET_READING
**Name**: `equipment.ts` L137-138 (`c4Targets`), `grenade.ts` L486, `simMap.ts` L41, `main.ts` L2231.
**What it stands for**: which map objects take C4.
**Current value**: `actions.rdr`'s type-less actions at their range (default 32 u).
**Prior search**: research 94 §C5.1 (accepting object = `FUN_002740e0`'s destructible, kind-3 block not decoded).
**What I did**: read the crosshair pick `FUN_005aa6e0` D:L464097-464290 (writes `+0x3c0..+0x3dc` = the nearest opaque hit, `+0x3dc` its node); disassembled the destructible's `+0x10` handler 0x2739b0 (vtable 0x406090 slot 4; `E/c4_accept_dis.out`).
**Answer** (STRONG for the rule): a C4 target is the node the **crosshair ray** hits (range max(item range, 600) capped by the camera's `+0xec`, D:L464097-464109), whose `+0x94` object accepts: `+0x1c` (hit points) > 0 and `+0x10` (threshold) <= the damage argument (0x2739b0-0x2739ec). Not a sphere around an `actions.rdr` record. Which nodes of each map carry such an object is the undecoded kind-3 zAnim damage block (`FUN_002713f0` D:L119312-119335).
**Implementation suggestion**: plant on the reticle's hit node when that node (or the record standing for it) is a destructible with hp > 0 and threshold <= C4's `Explosion_Damage`; until the blocks are decoded keep the `actions.rdr` list as the node set but require the reticle on it.
**Owed evidence**: decode kind-3 blocks in each `MPxx.ZDB:MZANIM.ZAR` (pure analysis) -> the node names, hp, threshold.

### 11.15 LAUNCHER_RAISE_READING
**Name**: `equipment.ts` L75-80; `room.ts` L401, L1880-1897; `main.ts` L506-513; `rocket.ts` L144.
**What it stands for**: how long the LAW/RPG-7 takes to come up (and the firearm back).
**Current value**: `ACTION_SECONDS.swapStand` = 1.32·(31/32)² = 1.2388 s (`mover.ts` L566, `locomotion.ts` L207-210).
**Prior search**: research 94 L1549 ("a clip for the launcher's category not traced").
**What I did**: read `FUN_005a64c0` D:L461852-462044, `FUN_005a6d30` (raise) D:L462097-462133, `FUN_005a6b70` (lower) D:L462045-462092, `FUN_00588bc0` D:L446304-446365; names from D:L495408-495411 (0x6624a0 "Rifle -> Launcher", 0x6624c0 "Pistol -> Launcher", 0x6624e0/0x662500 the moving ones); animset (`animset_knock.out`), `motion.rdr`/`MOTION_P.ZAR` (`clip_seconds.out`).
**Answer** (STRONG): raise = `FUN_005a6d30`: the launcher anim set (`DAT_0044d408`), then "Rifle -> Launcher" (`seal_rifle2launcher`, 35 frames) from the rifle or "Pistol -> Launcher" (`seal_pistol2launcher`, 24 frames) from the pistol, state 1, `+0xf79` = 4. Lower = `FUN_005a6b70`: in the launcher set the same clip **reversed** (4th argument 1); otherwise the moving variant. `motion.rdr`: all four clips `playback 1.5`, `NoFire`, `NoInterrupt` (moving ones `BlendOverlay`). By the port's own one-shot formula: **1.4155 s from the rifle, 1.3776 s from the pistol**, both ways. The item hand-off callbacks sit at phase 0.27 (rifle) / 0.13 (pistol) (`consts.out`). One step: that NoFire holds fire for the whole clip.
**Implementation suggestion**: `LAUNCHER_RAISE_SECONDS = { rifle: oneShotSeconds(1.5, 35), pistol: oneShotSeconds(1.5, 24) }`, chosen by the item the launcher replaced; the room's `heldReadyAt`/`firearmReadyAt` use it. Test: from the rifle, fire refused at 1.40 s, allowed at 1.42 s.
**Owed evidence**: none for the length; a trace of `NoFire`'s reader would raise it to PROVEN.

### 11.16 RELOAD_SECONDS_PLACEHOLDER -- NOT-A-GAP
`reloadClip.ts` L98, L162: used only when the clips/table are missing (a server without `MOTION_P.ZAR`); the reload length is otherwise the clip's. No original counterpart.

### 11.17 CLAYMORE_PLACEHOLDER, POUCH_PLACEHOLDER -- NOT-A-GAP (retired)
No constant in the snapshot (`grep`); `room.ts` L1746 `placeCharge`, `equipment.ts` L100 `pouchOf`. Only comments name them.

### 11.18 PICK_TIE_READING
**Name**: `$PORT/packages/viewer/src/doors.ts` L414, L435-437.
**What it stands for**: the tie rule when a door leaf and its frame's wall meet the view at the same distance.
**Current value**: a hit within 0.05 unit of the first goes to the door.
**Prior search**: research 92 §7 ("`FUN_005aa240`'s tie rule is not traced").
**What I did**: read `FUN_005aa240` D:L463832-463902, `FUN_005aa470` D:L463908-463950, `FUN_005aa6e0` D:L464097-464290; resolved the RTTI words at 0x65c638/0x65c220 (type names "CNodeAction", "zdb::CNodeEx": `FUN_001821d0` is a dynamic cast).
**Answer** (STRONG): the pick (`FUN_005aa6e0`) walks the ray query's hits (`FUN_0031e160`) and keeps the nearest *opaque* hit by squared distance with a strict `<` (D:L464165): no tolerance; an exact tie keeps the hit earlier in the query's list. A non-opaque hit whose node casts to `CNodeAction` (directly or through up to 6 ancestors, `FUN_005aa470`) and is nearer than the opaque one is kept as a second record (`+0x3e0..+0x3fc`), and `FUN_005aa240` takes that record first, else the opaque hit's node and its ancestors. Then the action's range on x/z and elevation on y from the feet (L463895-463898) -- as the port has.
**Implementation suggestion**: drop the 0.05 tolerance; take the first hit, but look for the door on its node and its ancestors (a leaf hit through the frame's node path), and let a passable surface's door win when nearer. Test: Frostfire `wdoor_2` -- the pick still finds the door (via the node path) with the tolerance at 0.
**Owed evidence**: the hit-list order of `FUN_0031e160` for two hits at equal distance (only matters if the leaf and wall are separate nodes with no ancestry) -- a recomp trace at `wdoor_2`.

### 11.19 doors.ts:419 comment ("the reticle pick's own surface test is not traced")
**Answer** (STRONG): `FUN_005aa6e0` D:L464139-464160: a hit is skipped as opaque when its material (`FUN_002dc1d0` -> table `DAT_0044f358`) has `+0x3c` bit 0 or bit 1, or `+0x24` (penetration) >= 0.98 with bit 4 clear, or its surface (`hit+0xc`) has byte `+10` bits 2-3 == 1. This is the AIM ray rule (VOLUMETRIC, LIQUID, >= 0.98 non-PICKUP: research 84's `AIM_RAY_READING`), not the movement's skip bit 18 the port uses. Suggestion: `pickDoor` filters with the material rule (`SOILS` flags) instead of `SURFACE_SKIP`.

### 11.20 remotePlayers.ts L186-188 (the footfall gate `+0xe0`)
**Answer** (STRONG, the gate; PARTIAL overall): `FUN_005a3570` sounds a step only with `+0xe0` bit 2 (D:L460295). `FUN_00552850` (D:L418748-418861) sets it, per viewer: on the viewer's own actor always (L418860), and on other actors of its list (`+0xd8`, distance² at entry +0x10) within 500 units (250000.0, strict) up to `DAT_0064fc78` = 3 of them (`consts.out`), when the actor is not a remote player's flagged one (`+0x265` bits 0/1). The name `REMOTE_STEP_STICK_READING` is C9's; the port hears every drawn living body. Owed: whether the `+0xd8` list is distance-sorted (then "the 3 nearest").

---

### 11.21 Sourced but not implemented

- `guard_prone_cover` for a prone SEAL a blast reaches (above), sent to others as kind 0x22 code 0x10.
- A flinch blocks a reload start (motion bit 0x4, D:L469500).
- The launcher raise/lower: 1.4155 / 1.3776 s, reversed clip on the way down, NoFire.
- C4: the 0.2 s target-settle timer and the crosshair-hit target (not a range sphere).
- The knock ends a ladder/turret/stab/restraint/switch (no traversal skip).
- The footfall cap: 3 others within 500 units.
- Death clip order: groin02/groin01 swapped in the port.

### 11.22 Leads for other workstreams

- C3 / `AIM_RAY_READING`: the ray length and pass rule read in full at D:L464097-464160 (above).
- C3 / HUD: the C4 prompt (`FUN_00215c10` D:L70073-70080) shows under the same gate (`+0x208 < 396`, the 0.2 s timer).
- C2: `FUN_003acc10` D:L302875-302890 knocks actors with a 100000-strength push (`FUN_0057ed10`) and caps fall speed at -50 -- an unidentified pusher (a vehicle or moving object?).
- Anyone using `motion.rdr`: `playback` of the death clips is long (`death_stand_groin01` 7.44, `groin02` 8.1, `chest01` 3.8) -- the port's comment already relies on it.
- VU0: the PCSX2 dump `logs/parity/pcsx2_vu0MicroMem.bin` holds the game's microprograms; `E/vu0_decode.py` decodes any `vcallms` entry (0xa is the quaternion rotate).

## 12. The robustness and cross-lane comment rows (`scratch/C1/parts/misc.tsv`)

- `packages/match/src/room.ts:38` -- UNKNOWN_TYPE_SLOT (unnamed): NOT-A-GAP. a type that did not read is null: data robustness, no game value.
- `packages/match/src/server.ts:133` -- SERVER_TYPES_UNREAD (unnamed): NOT-A-GAP. empty/null type list where data did not read: robustness.
- `packages/match/src/room.ts:1331` -- ITEM_UNKNOWN_WITHOUT_ARSENAL (unnamed): NOT-A-GAP. no ZWEAPON.ZAR -> items unknown, baked kit: test/robustness path.
- `packages/match/src/room.ts:1655` -- PROJECTILE_TEARDOWN_CALLS (unnamed): PARTIAL. same as ROUND_START_PROJECTILES_READING.
- `packages/viewer/src/simMap.ts:48` -- SIMMAP_MATERIAL_UNKNOWN (unnamed): NOT-A-GAP. hand-built map without materials reads UNKNOWN: robustness.
- `packages/viewer/src/simMap.ts:255` -- SIMMAP_CHAR_FALLBACK (unnamed): NOT-A-GAP. character that does not read falls back to the side's first: robustness.
- `packages/viewer/src/net/protocol.ts:553` -- PROTOCOL_UNKNOWN_TYPE (unnamed): NOT-A-GAP. an older page ignores an unknown event type: versioning.
- `packages/viewer/src/net/protocol.ts:635` -- PICK_REFUSAL_UNKNOWN (unnamed): NOT-A-GAP. 'unknown' refusal for an id with no record: validation.
- `packages/viewer/src/net/protocol.ts:673` -- SERVER_NAME_DEFAULT (unnamed): NOT-A-GAP. = ARMORY_SERVER_NAME_READING.
- `packages/viewer/src/playersOnline.ts:53` -- PLAYERS_ONLINE_UNREADABLE (unnamed): NOT-A-GAP. an unreadable list shows unknown: robustness.
- `packages/viewer/src/doors.ts:72` -- DOOR_DIAGNOSTIC (unnamed): NOT-A-GAP. what does not read is a diagnostic: robustness.
- `packages/viewer/src/loadingJoin.ts:15` -- LOADING_ANSWERS (unnamed): NOT-A-GAP. worker answers even when parts do not read: robustness.
- `packages/viewer/src/net/moverSim.ts:32` -- RESPAWN_REPLAY_HOLD (unnamed): UNRESOLVED. the respawn replay's hold period: research 150 s5 owed (reload-while-running lane, not C1).

## 13. Verification (V1, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V1-verify-core-combat.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V1/`). V1 verified C1, C2 and C3. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V1, 2026-10-04. Read-only. Every claim was re-derived from the primary sources: the r0001 decomp
(`socom2_game.elf.decomp.c`, `D:L<line>`), the r0001 ELF (`game/disc/socom2_game.elf`), the r0004 ELF
(`game/overlays_r0004/socom2_game_r0004.elf`), the disc (`game/disc/RUN/`), the RDRAM dumps (`logs/parity/`) and the
SOCOM 1 demo's `.symtab`. Where I could, I used a second route: my own ELF reader, disassembly instead of the decomp,
and the RDRAM dumps instead of the parser. Scripts and outputs are in `scratch/V1/` (see its README).

**Which ELF the decomp is.** The disc ELF and `game/overlays/socom2_game.elf` are byte-identical (md5 a6259bee...).
The decomp's `FUN_003aff30` matches the disc ELF instruction for instruction (`vdis.py 3aff30`). Every RDRAM dump in
`logs/parity/` carries the same code bytes at 0x3aff30 (`rd_frame.out`: "code_r0001" for all 25 dumps). So the decomp
addresses, the ELF and the dumps all share one address space: r0001.

### 13.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| 1 | 30 Hz game frame (`DAT_003e1400` = 30, dt 0.03337) | **CONFIRMED** | The cap is 30 in the ELF and in all 25 dumps. The main loop runs one Tick a frame with the measured dt. No 60 Hz game-logic subsystem was found. A new corroboration: the pad reset primes the look ramp with a literal 1/30 s. One evidence correction: `frostA/B` are recomp dumps, not PCSX2. |
| 4 | respawn = 1 round of 1200 s (Create Game script) | **CONFIRMED** | The decoded script holds, and the same strings sit in the READERC copy. The game code's own fallbacks (300 s, 9 rounds) apply only to a zero valve. |
| 5 | FF off = one flag read only in `OnWeaponHit`; self hits count; the 1-vs-"disabled" conflict | **CONFIRMED-WITH-CORRECTION** (conflict **resolved**) | There is one read at 0x5ac70c and three write instructions. C1 counts the D:L150754 writes separately, but they are the same instructions: `FUN_002a9ee0` is an 8-byte thunk into `FUN_002c00f0`. The gate is online-only. On the conflict: a new valve is created at 0, the screen's init never sets FF, and there is no saved copy. So a first visit shows "disabled" (A_49), and RESTORE DEFAULTS turns it **on**. Both observations are true. |
| 6 | spawn: classic `index % count`; respawn block `count/24` at `index*(count/24)`, by enemy bodies; heights in AIMAPS.MPS | **CONFIRMED** | `FUN_002b8100` / `FUN_002b7ee0` / `FUN_0052b5c0` read exactly as stated. There is no alive test (corpses count). With no enemy, the block's first record is taken. The slot y is bits 9..18 of the cell word. C1's `slot_y.ts` re-runs identically. |
| 7 | shotgun online = raw 2.5 per pellet; hit packet int 0..255; bullets continue through bodies | **CONFIRMED-WITH-CORRECTION** | All three hold, checked by disassembly as well. A naming fix: 0x40 is not the hit's message type, since every `zNetSendApplicationMessage` call passes it. The hit's type word is `DAT_00440e00` (= Harry's `PacketTypeHit` slot in r0004 at 0x44d820). |
| 8 | round-screen columns SCORE, KILLS, DEATHS (READERX) | **CONFIRMED** | The headers sit at x 368 / 470 / 578, and the column getters are `+0x3c` / `+0xc` / `+0x12`. `+0x3c` is the score (a -2 penalty writes it at 0x545ce0). |
| 11 | Harry's 0x4759xx-0x476xxx data labels are SOCOM 1 demo symbols SOCOM II never references | **CONFIRMED** | 1,509 of the 1,517 labels in 0x462000..0x47f000 are exact (address, name) pairs of the demo's `.symtab`. Neither SOCOM II ELF references the range: 0 lui/lo pairs, 0 data words, and `$gp` (0x1dd2f0) cannot reach it. |

### 13.2 Claim 1: The 30 Hz game frame

**Independent route.**
- **The frame end.** I disassembled `FUN_003aff30` (zVid_Swap) myself. At 0x3aff58-0x3aff9c it loads `DAT_003e1400`
  via `lui 0x3e; lw 0x1400`. It skips the wait when the cap is -1, then adds 1/60 (0x3c888889) until
  `elapsed + 1/60 >= 1/cap`. This matches D:L304746-304749.
- **The main loop.** `FUN_001e7040` (D:L47873-47875) calls the core state's vtable `+0x1c` with `DAT_004a449c` forever:
  one Tick per swap, with no sub-step.
- **Every writer of the cap.** `FUN_003b17d0` maps 60 to -1, and `DAT_003e1400` is written only there (D:L305440).
  Its callers:
  - D:L50752 / L51260: -1, the loading uncap.
  - D:L51134: restores the saved value.
  - D:L50954 and D:L207717: `DAT_003e13f8`.
  - D:L207813: 0x1e (movie).

  Nothing sets 60 for a match.
- **.data and the dumps** (`elfv.py`, `rd_frame.out`):
  - The ELF holds `0x3e13f8` = 30 and `0x3e1400` = 30.
  - All 25 dumps read cap 30 and default 30.
  - The three PCSX2 dumps (`spawn`, `postload`, `title`) read dt 0.03336723. Times the H-blank rate 15734
    (`DAT_0049e2d4`, also read from the dump), that is exactly 525 = two NTSC fields.
  - **Correction to C2 §0's table:** `frostA_probe600` / `frostB_probe600` are recompiler dumps
    (`PS2X_RDRAM_DUMP_AT`, socom_pc research 21 L644), not PCSX2. They read dt 0.03330367, the recomp's own 524/15734.
    They are still 30 fps, so the conclusion stands.
  - Recomp dumps under load read 15 or 20 fps (dt 0.0666 / 0.0500), and one reads 60 (`s4rand_ours`, dt 0.01665). These
    are host artefacts of the recompiler, not the console.
- **A second, independent line I found.** The pad reset `FUN_002dba60` primes the look ramp `FUN_002da930` with a
  **literal dt of 1/30**: `lui 0x3d08; ori 0x8889; mtc1 $f12` at 0x2dbae8 and 0x2dbb18 (`dis_padreset_1_30.out`;
  0x3d088889 = 0.0333333). A movie-path caller does the same (`FUN_002d9e40(0x3d088889)`, D:L208635). The authors wrote
  the frame as 1/30 s in code.

**Could any subsystem still tick per vblank?** I looked for:
- **Interrupt handlers.** `AddIntcHandler` registers only library work:
  - `vblank_e_handler` 0x1bf600 (USB keyboard, names CSV).
  - VIF/DMA plumbing 0x33c010 and 0x3515a0.
  - An empty `jr ra` stub 0x631388 for all causes.

  None runs game logic.
- **Threads.** There are six `CreateThread` sites. The one long-lived loop besides the main loop is `FUN_002ce930`
  (D:L171840). It sleeps `zSysSleep(DAT_0049e2d4 / 20)` (50 ms, an alarm on the H-blank clock) and pumps the network
  through `FUN_0030d9b0(0x45a0c0)`. So the **net receive pump is time-based, about 20 Hz, on its own thread**: neither
  60 Hz nor frame-locked. This agrees with M2's per-field send intervals in ms. The others are loaders, the audio/IOP
  helpers and `FUN_003b1dd0` (sleeps on a semaphore).
- **Fixed-step constants.** The decomp contains no 1/60 (0.016666) except in the swap wait itself (D:L304747).

**The port's research.** None of it measured a game-frame timing that contradicts 30 Hz:
- Research 88 §5: "A jump, a turn and a camera in motion, timed. None exists on the console." The 60 Hz is "research
  71's reading, not a measurement".
- Research 110 R110.1 and 116 R116.14 had already ruled 30 Hz (29.97) for the front end from the same cap.
- Desktop KNOWN row 134 reads "the game targets 30 fps (two VBlanks)".
- Measured speeds in units per second are dt-scaled, so they do not move with the frame.

**Verdict: CONFIRMED.**

### 13.3 Claim 4: C1: respawn = 1 round of 1200 s

- **The decode.** C1's decode (`C/dlgCreateGame_ui.out` L438-463, L826-867) reads exactly as reported:
  - `set_respawn_valve` saves RCount/RTime and sets `RTimeValve` 20 and `RCountValve` 1.
  - `refresh_cg_screen` maps RTime 20 to "20 minutes" and `mp_max_round_time` 1200, and RCount 1 to
    `mp_max_rounds` 1.
- **The raw strings.** By a different route (raw strings, `uizanim_pool.out`), the pool holds `set_respawn_valve`,
  `RoundCountValveSave`, `RCountValve`, `RoundTimeValveSave`, `RTimeValve`, `RemoveNonSuppressionMaps`, `20 minutes`,
  `mp_max_round_time` and `mp_max_rounds`. "20 minutes" is the only literal time caption: the others are UIMnLOC
  messages (loc 273-279).
- **The second copy.** `UI/READERC.ZAR` carries the same string set at 0x1addd..0x1b33c, so there is no second,
  different create-game script.
- **The game side.** `FUN_001f5e70` D:L55621-55627: the round length is `RoundTime x 1000` ms. The code substitutes 300 s
  / 9 rounds only when the valve is 0.
- **What I could not do.** I did not decode the op bytes independently of the port's decoder: the raw stream is not
  self-describing. A capture of a respawn game's details screen would be the external check. None exists.

**Verdict: CONFIRMED.**

### 13.4 Claim 5: C1: friendly fire

- **The flag's references.** `xref.py` (my own lui/lo scanner, window 40) over the whole r0001 ELF finds every
  reference to 0x44cdb8 (`xref_ff_flag.out`):
  - `sb` at 0x2c0440, 0x2c044c (`FUN_002c00f0`) and 0x2c0c24 (`FUN_002c0850`): three writes.
  - `lbu` at **0x5ac70c**: **the only read**.
- **The writes are not five.** C1 lists D:L150754-150761 (`FUN_002a9ee0`) as another writer. `FUN_002a9ee0` is 8 bytes
  (`functions.txt` L3333), `j 0x2c00f0; move a0,a1`: Ghidra inlined the thunk's target. Those are the same two
  instructions, not extra writers. The decomp's line count overstates the writers; C1's "three writes" in the scan is
  right.
- **The gate**, disassembled (`dis_5ac660.out`, 0x5ac6b8-0x5ac750):
  - It requires `DAT_0045a0c1` (online), owner id `victim+0xfb8 = proj+0xac` != 0, flag == 0, the owner found with
    `+0x10 == 2`, and `(victim+0xc8 & owner+0xc8) != 0`.
  - It also requires `victim+0xc8 & 0x20000 == 0` and `owner != victim`.
  - When all hold it returns 0. **A self hit passes.** Confirmed.
- **The handler's identity.** The vtable word at 0x669578 = 0x5b8260 (`elfv.py`). `demo_symbol_matches.json` pairs
  0x5b8260 with `OnWeaponHit__7CSealExF...`. Confirmed.
- **Resolving the default conflict.**
  1. The screen's init (`init_cg_screen`, C1's decode L643-686) restores eleven valves from `*_saved` copies, or in its
     else branch resets them. **`mp_friendly_fire` is in neither list**, and the string pool has no
     `mp_friendly_fire_saved` (`uizanim_pool.out`).
  2. Every code reader goes through `FUN_00351ff0(name, 1)` (find or create; D:L184201, 191376, 191505, 197221,
     204116). A missing valve is created by `FUN_00352230` → `FUN_00352ea0(obj, name, **0**, flags)`, which stores the
     third argument as the valve's short value (`piVar2[1] & 0xffff0000 | param_3`).
  3. The disc's valve file sets it to 0: `RUN/READERC.ZAR` `global_valves.rdr`, its `valves` row `mp_friendly_fire`,
     value 0, no type word (read through `readGlobalValves`, 2026-10-18, FRIENDLY-FIRE; research 163 s1 says the
     same). Either way the first read is 0. *(Was, to 2026-10-18: "The disc has no valve file setting it: only
     UIZANIM and the two READERC copies contain the string.")*

  So **the first time the Create Game screen shows, FF is 0, captioned "disabled"** (`_257_FriendlyFireDisabled_MSG`),
  which is exactly capture A_49. **RESTORE DEFAULTS** (`SetDefaultStatus`) sets it to **1, "enabled"**. The FF button
  toggles it. The value then persists for the session, since init never touches it.

  Both observations are correct and do not conflict. The port should start FF **off** on a fresh session, and make
  RESTORE DEFAULTS turn it **on**.

  Residual (BELIEVED): I did not check whether a memory-card profile saves and restores the valve. A card load that
  creates it non-zero would change the first-visit value. A capture of a fresh boot's Create Game screen with a card
  inserted settles it. *(2026-10-18, FRIENDLY-FIRE, reading: the row carries no type word, so it is not one of the 65
  PERSIST valves the card's save writes (`FUN_00352a90` D:L251470-251480; `viewer/src/originalOptions.ts`): no card
  restores it. The capture would make it proven.)*

**Verdict: CONFIRMED-WITH-CORRECTION** (writer count; the conflict resolved as above).

### 13.5 Claim 6: C1: spawn selection

Read D:L158657-158790 and D:L395740-395765 myself.

- **Classic** (`DAT_00437ce8 == 0 || +0xdc == 0`, not a spectator): `FUN_0052b5c0(..., +0xfc8, ...)` takes the record
  `index` and wraps `index % count` when `index >= count` (D:L395761-395763). Confirmed.
- **Respawn round start** (key 0/2): `block = count/24`; random `rand % block` only when `block != 1`; start =
  `block * +0xfc8`. Confirmed.
- **Respawn** (`FUN_002b7ee0`):
  - The block is `[block*idx, block*idx + block)`.
  - For each record it takes the min squared distance to any actor of type 2 with a **disjoint** team mask, with no
    alive test.
  - It keeps the record with the strictly larger min; with no enemy, the block's first. Confirmed.

  "Chosen by enemy corpses" is precisely "by every enemy body, living or dead".
- **The respawn flag**, by a different route:
  - Harry's r0004 annotation "check if respawn enabled" at 0x1f9b4c reads `lbu 0xe0(*(0x4446f8))`, disassembled in
    the r0004 ELF.
  - The r0001 twin region (`FUN_001f97b0`, D:L57004/57058) reads `*(DAT_00437ce8)+0xdc`, the same byte
    `FUN_002b8100` tests.
  - Same object, a 4-byte layout shift.
- **Heights.** `FUN_00516940` (D:L385087-385092): `y = sub+4 + sub+0xe8 * ((cell << 45) >> 54)`, bits 9..18.
  `FUN_0051afe0` (D:L387628) sets `sub+0xe8 = (max y - min y) x 1/1024`. C1's `slot_y.ts` re-ran byte-identical
  (`slot_y.rerun.out`): MP2 100.00 / 141.93 and MP51 158.53 / 64.05 against measured feet 100 / 143 / 160 / 65.

**Verdict: CONFIRMED.**

### 13.6 Claim 7: C1: shotgun pellets, hit clamp, penetration

- **The clamp.**
  - `.data` (`elfv.py 3de728 11`): 0x3de728 = 0, 0x3de730 = 255, 0x3de738 = 0, 0x3de740 = 255, 0x3de748 = 0,
    0x3de750 = 15.
  - `FUN_002bd220` (D:L161657-161672) is an int clamp.
  - `FUN_002bbda0` (D:L160870-160887) does `(int)damage` → clamp → byte, `(int)(piercing*20)` → clamp → byte, and part
    → clamp → low 4 bits, then sends 8 bytes. PROVEN.
  - **Naming correction:** the `0x40` in `FUN_0030cef0(0x45a0c0, 0x40, ...)` is not the message type. All about 20
    `zNetSendApplicationMessage` sends pass 0x40 (D:L159432-160640). The hit's type is the word `DAT_00440e00`. Its r0004
    twin is 0x44d820 (`xref.py`: 2 refs each, at 0x2b8744/0x2bbeb4 in r0001 and 0x2ba294/0x2bdb64 in r0004).
- **Raw pellets.**
  - `FUN_005a1b80` (D:L459518-459571): for class 'Q', `ammo = FUN_003d1f00(weapon)` (the first entry of `+0xc4`).
  - When the packet damage is > 0, each pellet calls `FUN_005a5830(FUN_003d4530(ammo), FUN_003d4520(ammo), victim,
    part)`.
  - `FUN_003d4530` is `return +0xc`. Its setter `FUN_003d45a0` stores the loaded `ImpactDamage` (string 0x3fccb0)
    unscaled.
  - I disassembled `FUN_005a5830`: `$f12` (the damage) and `$f13` pass unchanged into `jal 0x3c7400`, with no x14 and
    no falloff.
  - The disc: 12 Gauge `ImpactDamage 2.5`, piercing 6.0 (C1's `zweapon_ammo.out` L13).

  Raw 2.5 confirmed, on the victim's console.
- **Penetration.**
  - `FUN_003c8920` D:L319494-319522: unless `FUN_003c5d20` (classes 0xab / 0xb9 only, D:L317260-317274), it sets
    `range' = min(range, (range + range x piercing x 0.1) x mat+0x24)` and returns 2 while in range.
  - The caller (D:L320039-320047) stops only on 0 or 4. A return of 2 keeps walking. A second hit on the same body is
    suppressed (`+0x78`). Confirmed.
  - PERSON's 0.97 is research 84's read; I did not re-derive it.

**Verdict: CONFIRMED-WITH-CORRECTION** (only the "message 0x40" label).

### 13.7 Claim 8: C1: round-screen columns

- **The getters.** The column table is copied from `.data` 0x3dc750 / 0x3dc760 / 0x3dc770 (`elfv.py`: PMFs to 0x226010,
  0x226000, 0x225ff0). Their bodies are `lh 0x3c`, `lhu 0xc` and `lhu 0x12` (C1's `read_columns.out`, consistent with
  my words).
- **+0x3c is the score.** It takes a `-2` at 0x545ce0 beside a `+1` to `+0x14` (`deaths_offsets.out`).
- **The headers on the disc.** In READERX's `dlgMultiplayerRound.rdr`, `_2106_SCORE_MSG` sits at x 368, `_2107_KILLS_MSG`
  at 470 and `_2108_DEATHS_MSG` at 578, on both panels. The raw string pool at 0xea5a.. lists Score, Kills, Deaths in
  that order.
- **A quirk worth knowing:** in the SEAL panel the KILLS header node is itself named `Score_Text`, a copy-paste in the
  original. The caption is what counts.

**Verdict: CONFIRMED.**

### 13.8 Claim 11: Harry62's 0x4759xx-0x476xxx data labels

- **They are the demo's symbols.** `demo_syms.out`: the SOCOM 1 demo `.symtab` has `PacketTypeHit` 0x47598c,
  `m_VotedOff__14CZPersonaState` 0x475aac, `m_allow_friendly_fire__10CZSealBody` 0x475cb8,
  `hostage_ignore$2777` 0x475d90, `HOSTAGE_ORDER_RANGE_SQUARED$2655` 0x475fb0 and `__data_end` 0x474b84. All are the
  exact addresses of Harry's labels.
- **Nearly the whole range.** `harry_vs_demo.out`: of Harry's 1,517 identifier or mangled labels in
  0x462000..0x47f000, **1,509** are exact (address, name) pairs of the demo `.symtab`. Overall it is 1,577 of 3,628,
  which is consistent with H1's 1,213-of-3,004 for identifiers only.
- **SOCOM II never references the range**, by three independent searches over both SOCOM II ELFs (r0001 disc, r0004
  overlay):
  - **(a) lui/lo.** Pairs forming an address in 0x462000..0x47f000 (window 40): **0** in each (`xref_harry_range.out`).
    The scanner is sanity-checked: it finds r0004's 0x4446f8 (166 refs) and 0x450148 (the r0004 FF flag, 1 read at
    0x5b23fc).
  - **(b) Data words.** Words equal to any of those label addresses: **0** in each.
  - **(c) $gp.** gp is set by `move $gp,$a0` with `a0 = 0x1dd2f0` (0x180148-0x180170, identical in r0004), so a
    `$gp`-relative access spans 0x1d52f0..0x1e52ef and cannot reach 0x47xxxx.
- **Where the live words are.** The packet-type words are r0001 0x440e00 and r0004 0x44d820 (two references each).

**Verdict: CONFIRMED.** Harry's function labels are unaffected.

### 13.9 Things to carry forward (items 3, 4, 7, 8 of the verifier's list)

3. **C1 FF:** one read and three write instructions (the `FUN_002a9ee0` lines are the inlined thunk). The default is
   resolved: **0 / disabled on first show; RESTORE DEFAULTS sets 1 / enabled**. Owed: a fresh-boot capture with a
   memory card, to rule out a profile restore.
4. **C1 hit packet:** the type is `DAT_00440e00` (PacketTypeHit), not 0x40.
7. **New, for M2/C1 networking:** the receive pump is a separate thread waking every `15734/20` H-blanks, about 50 ms
   (`FUN_002ce930`, D:L171840). The network is not frame-locked.
8. **New corroboration of 30 Hz:** the pad reset passes a literal 1/30 s dt to the look ramp (0x2dbae8, 0x2dbb18).
