# 429 -- Friendly fire off and a teammate's grenade: the port's every blast path against the original (WM-16)

- Date: 2026-11-15. Branch `agent/wm-ffblast-ff` (worktree `wt-wm-ffblast-ff`), base `origin/agent/next` 8e78f9ecb7;
  the weekend mega sprint's WM-16 (plan `../plans/2026-11-14-weekend-mega.md`), the player's report in the owner's
  list: "you cant turn Friendly Fire off in rooms with grenades", and the owner's question after it, "is this true?".
- Track: simulation (a diagnosis; nothing is built). Status: the port's paths **source inspection at 8e78f9ecb7**;
  the original's gate a **reading** (research 219 s1.2, 179 s8.2; re-read at the bytes by 8f's second read,
  2026-11-15: r0001 `FUN_005ac670` 0x5ac6b8-0x5ac74c and its r0004 twin 0x5b2360, 0x5b23a8-0x5b2450). The gate is read
  at r0001 while Q23 and Q25 ran on r0004: r0004's twin holds the same gate (its switch byte 0x450148) plus a skip for
  a round with `+4` bit 4 (0x5b243c-0x5b2448, WM-SWITCH's) and a drop on `victim+0x105c` bit 3 (0x5b2600-0x5b261c,
  its meaning unread). **Proven** legs, each a binary outcome (killed or unharmed, by the counters and health the rig
  read; distances as the rig gives them, no tolerance beyond that): Q23 leg 1 (a teammate spared) n = 1, Q23 leg 2
  (the thrower's own M67) n = 1, Q25 cal2 (a PMN's layer) n = 2, Q25 V1 (a claymore's planter) n = 1. The second
  read's record: hub `reviews/research-429-second-read-d8606ca10.md`.
- Evidence kinds, kept apart: **(D)** source inspection of the port; **(O)** the original running: the rig's Q23
  (r0004, MP2, three clients; INTAKE sections 21 and 23; the order `handoffs/rig-q23-explosives-on-a-teammate-2026-11-15.md`,
  the result in the private bucket `gate-runner/shadow/out/2026-11-15/q10-hitreg/q23-explosives-teammate/`) and Q25 (r0004,
  MP71 Fish Hook, three consoles, match `match-q25b-20261115`; its record `rig-Q25-RECORD.md`, 12,683 bytes, sha256
  b7891a853531f0447759f22e978bf0e106a90b1107e7e6c989626f9712ce7f5f, hub `evidence/weekend-mega-2026-11-14/rig/`); **(R)** the port's own match recordings, read on the hub by a
  query that prints seat numbers only (WM.R19) -- evidence of what the PORT did, never of the original; **(U)** none
  new.
- New names: none. No `*_READING` or `*_PLACEHOLDER` is added or changed.

## 0. The answer

1. **Friendly fire can be turned off in a room with grenades, and with it off the port spares a teammate from a
   grenade as the original does.** One gate (`ffRefuses`) stands in front of every hit the room lays on a body, a
   blast's included, and every explosive a player throws, launches or sets reaches it with its live owner (s2).
   The original, measured: an M67 bursting 1.04 u from an enemy and 1.82 u from a teammate killed the enemy and left
   the teammate unharmed (Q23 leg 1, n = 1).
2. **What a player can still take for a teammate's blast with friendly fire off**, each the original's as read or
   measured: his **own** explosive (a suicide every time: an M67, Q23 leg 2, n = 1; a PMN its layer crouched 8.2 u
   from it, Q25 cal2, n = 2; a claymore its planter 27.6 u behind it, Q25 V1, n = 1); a grenade whose thrower has **left** the room
   (`DEPARTED_OWNER_FF_READING`, a reading, capture owed); a departed player's **charges**
   (`DEPARTED_CHARGES_READING`, a reading, open); the **planted bomb** (each victim his own: it spares no one,
   `MPBOMB_BLAST_OWNER_READING`); a scene program's round (a **switch's** blast, WM-SWITCH, proven by Q18). And a game
   whose host left friendly fire **on**: RESTORE DEFAULTS turns it on and the screen keeps it for the next game (s1).
3. **The recordings** (R; s3): of 680 recorded matches of the port (2026-10-21 to 2026-11-15), 3,184 blast kills on
   enemies, 75 suicides, no orphan and 5 teamkills by a blast, all in 3 matches: two of them also hold a bullet
   teamkill, so friendly fire was on there; the third is the same room as one of them: on. No match shows a teammate killed by a blast with friendly fire shown off. **Verdict: as the original, nothing
   to build.** The likeliest source of the report is a game with friendly fire on (s1, RESTORE DEFAULTS) or the
   player's own grenade.

## 1. The option's path (D)

The switch is one bit from CREATE GAME to the room, read at the room's make (research 219 s5, FRIENDLY-FIRE):

1. CREATE GAME's FRIENDLY FIRE row writes `mp_friendly_fire` 0 / 1 (`set_FF_valve`, research 163 R163.1). The first
   arrival shows the valve as `global_valves.rdr` declares it, 0; **RESTORE DEFAULTS sets it 1**; TRIANGLE saves eleven
   valves to their `*_saved` twins and the next arrival restores them (163 R163.2; whether `mp_friendly_fire` is among
   them is unread, s1.1). So a host who once pressed RESTORE
   DEFAULTS, or once turned the row on, hosts with friendly fire on until he turns it off (s1.1).
2. CreateGame1 carries RulesSet 0 (`ui/src/screens/createGameCommands.ts` `request`); the game lobby's `created`
   packs bit 0 from the valve (`gameLobbyCommands.ts` `created`), and the host's world report sends it (`report`).
3. Central stores the report's RulesSet (`central/src/lobby.ts` `reportGame`); the first report that names a map makes
   the room (`central/src/bridge.ts` `worldReport` -> `open`, or a placed host's record, `placement.ts` `record` ->
   `match/src/game.ts` `roomOptions`) with `allowFriendlyFire = (rulesSet & 1) !== 0` (`bridge.ts` `roomOptions`). A
   map rotation re-reads it (`rotate`).
4. The room keeps it in `opts` and asks it only in `Room.refuses` and the hostage gate.
5. Other rooms: the FF lobby's RulesSet has bit 0 clear (`central/src/ffLobby.ts` `FF_LOBBY_RULES_SET_ADAPTATION`);
   an operator's lobby takes its own flag (`opLobby.ts` `opRulesSet`); the Forge its layout's setting, off by default
   (`creator-contracts/src/layout.ts` `DEFAULT_SETTINGS`).
6. The briefing room and GAME DETAILS say FRIENDLY FIRE when the bit is set (`briefingRoomCommands.ts`), so a player
   can read it before the launch.

### 1.1 Friendly fire left on from an earlier game: the original's own behaviour

The page runs the disc's own CREATE GAME script (`dlgCreateGame.rdr`, research 163; held by `createGameRig.ts` against
the disc's set), so what follows is the original's, by research 163's reading (pending review there; not re-read at
the disc for this note). `init_cg_screen` sets every create-game valve on an arrival **but `mp_friendly_fire`**,
which keeps whatever it last held; RESTORE DEFAULTS writes it 1 among the defaults, a TRIANGLE return may save it to
`*_saved` for the next arrival (163 R163.2 names eleven valves saved but does not list them: whether
`mp_friendly_fire` is one is **unread**), and **joining a game writes it** from that game's RulesSet bit 0
(`gameLobbyCommands.ts` `enterGameLobby`, JoinMPGame `FUN_002f83b0` D:L197176-197300 as cited there). So on the original as in the port a host who pressed RESTORE DEFAULTS,
turned the row on once, or last **joined** a friendly-fire game, creates every later game with friendly fire on until he turns the row off; only a fresh
start clears it (the valve is not PERSIST, no memory card restores it, research 219 s5; the page's own reload is that
fresh start, its valves read 0 unseeded). This stays: it is the original's. What tells a player is already built and
is the original's too -- the row's own help line ("Friendly Fire is enabled.", #258), and the briefing room's game
details and GAME DETAILS listing FRIENDLY FIRE for such a game (`briefingRoomCommands.ts`, D:L184079-184082,
D:L184201-184205). No product-track change is proposed.

## 2. Every caller of the gate (D)

`ffRefuses` (`match/src/room.ts`; `FUN_005ac670` 0x5ac6b8-0x5ac750 by disassembly, research 179 s8.2, 219 s1.2) is
the only gate; only `room.ts` calls it. Re-derived at 8e78f9ecb7 (it agrees with the second review's section A,
2026-11-15):

| caller | owner passed | friendly fire off, a teammate |
|---|---|---|
| `bulletHit` (bullets, volleys) | the live shooter | refused |
| `directHit` (a launched round striking a body) | `Room.thrower(f)` | refused |
| `blastPlayers` from a projectile's `blast` (M67, HE, M203, rocket, claymore, PMN, C4, satchel, a chained charge) | `Room.thrower(f)`: the same player object still seated, else null | refused while the owner is seated |
| `blastPlayers` from `fireSceneRounds` (a scene program's `FIRE_WEAPON`) | the presser | passed (`localRound`, WM-SWITCH, proven by Q18) |
| `blastPlayers` from `bombBlast` (the planted bomb; a Forge script blast) | each victim himself (`MPBOMB_BLAST_OWNER_READING`) | lands: the bomb spares no one |
| `hostageRefuses` | the thrower | a hostage is never refused (`HOSTAGE_FF_READING`) |

- **The owner at the hit.** `Room.thrower` answers the projectile's owner only while that same player object is in
  `players`; a respawn and a death keep the object. The paths that remove it mid-fuse -- a leave or a held seat's end, a
  bot's seat taken by a person, a demotion to spectator (the idle kick) -- make the owner departed, and his blast lands
  on anyone (`DEPARTED_OWNER_FF_READING`). SWITCH TEAMS and the side swap re-seat a player as a new object only while the
  room waits (`switchTeam`, `swapSides`) -- but a throw is refused only once the phase is `over`, so a grenade thrown in
  the waiting room and still in the air at the switch loses its owner and lands on both sides as an orphan; the
  original looks the owner up live by id and would test his new side (219 s1.2). A pre-launch gap of the port, filed
  for the controller (s5), outside the report's rooms in play. A page that reconnects takes its projectiles back
  (`seat`'s `held.body`).
- **His own blast** passes the gate whatever the switch (`attacker !== victim`) and is booked a suicide (`kill`).
- **The backblast** (item 0x9f, spawned only by a weapon with HasBackblast, record `+0xd5`: LAW HEAT and RPG) is
  dropped on its firer and his side whatever the switch, at 0x5ac8b0-0x5ac8fc -- but only when the victim's controller
  (`victim+0xc0`), asked by its vtable `+0x38` method, returns an object; when it returns null the hit goes to damage
  (0x5ac820). The whole block also needs `victim+0xe1` bit 4 and `FUN_0029ed20(victim)+0x5c` bit 0, failing which
  there is no damage at all. The block tests an ITEM ID (the round record's `+0x7c`), not a child flag. The M67 (0x79)
  and HE (0x7e) have the same self-and-side drop at 0x5ac840-0x5ac8ac when that object's `+0x264` bit 1 and
  `+0x42c & 0x400` are set (unbuilt). In r0004 the backblast child carries `+4` bit 4 and passes the main gate, so
  this rule alone guards a teammate from it. The port refuses the backblast on its side always (`ffRefuses`): it
  spares **more** than the original wherever the controller's answer is null -- a named difference (s4.1). No other
  item has that rule: a claymore behind its planter reaches him (s2.1).
- **A hand grenade striking a body** before its burst (class 0x79-0x8c) is dropped by the original
  (0x5ac758-0x5ac79c): no contact damage. The port's flight casts against bodies only for a record with `impact` set
  (`flyFrame`; the M203's), and the hand grenades' records have `impact: false` (scene `projectile.ts`; they carry
  `impactDamage` 0.2, which `directHit` would take), so a hand grenade lays no contact damage there either.
- **C4's IgnoreExplosionDI** (round `+5` bit 1) skips the blast's solid-surface veto (`FUN_005a0e70`
  D:L459192-459193) and line 1's material shrink (`FUN_003c80e0` D:L319096), both AFTER the friendly-fire gate: C4
  through a wall hurts enemies and its planter, never a teammate with friendly fire off -- as the port.
- **The page** lays no blast damage of its own: only the room calls `resolveBlast`.

### 2.1 The claymore behind its planter (O and D)

Q25 V1 (n = 1): a SEAL's claymore fired by its detonator killed three hostages in front (18.1, 36 and 46 u) and its
planter 27.6 u behind it, booked a suicide (deaths +1, suicides +1; kills and team kills 0). The port, by reading: the
planter is the owner, so the gate passes; outside the cone `GetDamage` lays a 32nd (`FUN_003c7600`
D:L318769-318782; `claymoreCone`, scene `projectile.ts`), `Explosion_Damage` 16 / 32 x 14 = 7 a fragment, full to
125 u; within 30 u a standing body takes 9 to 15 fragments (`fragmentCount`, `FUN_005a18b0` D:L459428-459451); the
head holds 8 with no armour (`MP_HEALTH`, `MP_ARMOUR`) and takes 30 % of the fragments, so two head fragments kill:
at nine fragments about 80 % (1 - 0.7^9 - 9 x 0.3 x 0.7^8), more at more. **An observation beside the rig's n = 1,
not a difference.** The claymore's back side is not measured beyond this one fire (the record's limits).

## 3. The recordings (R)

A query over the repository's own replay reader (main's readers at d84cf7e893), run on the hub as one light process,
printed per file the header and every kill (seats as numbers, no names; WM.R19) -- a unit-level decode, not a box
record; its outputs are on the hub, `evidence/weekend-mega-2026-11-14/ffblast/run1-v0421plus.out.txt` and
`run2-replays-2026-10-30.out.txt`. Every build recorded carries the friendly-fire wire (b10e811e8c, 2026-10-18; its files moved by SA-3 9508bd2d29) and
the same gate (at 4a0f4f2153, read by `git show`, `ffRefuses` is today's less WM-SWITCH's `localRound`).

| run | files | blast kills on enemies | suicides by a blast | orphans | blast teamkills | bullet teamkills |
|---|---|---|---|---|---|---|
| 1: since v0.4.21 (protocol 16) | 9 (4 with play) | 72 | 9 | 0 | 0 | 0 |
| 2: the 2026-10-30 pull, 2026-10-21..30 (protocol 11) | 671 | 3,112 | 66 | 0 | 5 | 3 |

The five blast teamkills, each by a seated human with his own matching throw before it and no scene round:
- an MP2 classic match: an M67 and an HE grenade (one killer); the same file holds a bullet teamkill (M4A1): friendly
  fire was on;
- an MP72 classic match: a PMN; a bullet teamkill (M9) in the same file: on;
- an MP72 classic match of the same build, started 21 minutes before the last: an M67 by a SEAL and an HE grenade by a
  Terrorist, no bullet teamkill in its own file -- but its sidecar names the SAME room as the last (one room keeps one
  switch across its matches, s1): on.
So all five were in rooms with friendly fire on.
Of the other 677 files one more (an MP2 respawn match of 2026-10-23, commit 2532a62291) holds a bullet teamkill (an
M4A1) and no blast teamkill; 676 hold no teamkill of any kind.

**What a recording cannot tell** (match `src/replay/format.ts`): the room's friendly-fire setting (`ReplayHeader` has
none; central's match record has, `settings.friendlyFire`, not joined here); damage that did not kill (`hurt` and
`blast` are sent to the victim alone, never to the recorder); an M67's burst point (only its throw). So a teammate
wounded, not killed, by a blast with friendly fire off would not show; the gate that would allow it is the same gate
that refuses the kill (s2).

## 4. The causes, one line each

| cause | in the port | evidence | what would settle it |
|---|---|---|---|
| (1) his own grenade | HOLDS, as the original | `ffRefuses` `attacker !== victim`; `kill` 'suicide'; O: Q23 leg 2, Q25 cal2 x2, V1 | nothing |
| (2) friendly fire on in that game | NOT TOLD for the player's match | s1: RESTORE DEFAULTS and `*_saved`; R: s3 | the match's record (`settings.friendlyFire`) |
| (3) a departed thrower, a quitter's charges | HOLDS as readings | `DEPARTED_OWNER_FF_READING`, `DEPARTED_CHARGES_READING` | the captures in s5 |
| (4) a path past the gate or a wrong owner | DOES NOT HOLD for any player's explosive | s2 | nothing |
| (5) the unbuilt M67 / HE rule | cannot explain it: it spares more | 219 s1.2 item 4 | the flag's read |

### 4.1 Where the port spares more than the original (named differences)

- **Offline.** The original's gate runs only online (the online byte 0x45a0c1; the switch byte `DAT_0044cdb8` is read
  only when it is set): offline a teammate's hit lands. The port's test room (the page's solo loopback match) passes no
  `allowFriendlyFire`, so friendly fire is off there and `ffRefuses` refuses a teammate's hit; a Forge match takes its
  layout's setting (off by default, on if its author turns it on). LATER 1079.
- **The backblast** (s2): the port refuses it on the firer's side always; the original only when the victim's
  controller's vtable `+0x38` answers an object. LATER 1080.
Neither touches the report (a teammate hurt online with friendly fire off); both are filed, nothing is built.

## 5. Owed

- Q23 legs 3 (an HE grenade or the M203 on a teammate) and 4 (a placed charge), not run.
- A capture of a grenade whose thrower quits before the fuse (PF.R40, `DEPARTED_OWNER_FF_READING`).
- A two-console capture of a teammate's flashbang, friendly fire off (`FLASH_FRIENDLY_FIRE_READING`).
- The waiting room's SWITCH TEAMS with a grenade in the air (s2): the owner becomes departed in the port, the
  original tests his new side -- a pre-launch gap, filed as LATER 1077.
- The M67 / HE branch's flag: the object is the VICTIM's controller's (`victim+0xc0`, vtable `+0x38`), the test
  `+0x264` bit 1 AND `+0x42c & 0x400`; it drops the victim's own M67 / HE as well as a teammate's (research 219 s1.2
  item 4, `GRENADE_TEAM_FLAG_READING`). Owed: a PEEK of the victim's controller during a hit. It can only spare more.
- The rig legs 8f's second read proposes (queued by the controller): Q23 legs 3 and 4; an RPG fired with a teammate
  close behind on r0004 with a read of the victim's controller's `+0x38` result; a cooked grenade dropped at death
  beside a teammate; a grenade in flight across a waiting-room SWITCH TEAMS (LATER 1077).
