# 332 -- The bomb's blast on the players: base_explosion1's FIRE_WEAPON, read to the body (BOMB-DAMAGE, PARITY-2)

- Addendum 2026-10-30: section 7 records DBFX-1, its separate source review and rendered browser verification.
  The original section 1-6 status and evidence below describe the October 16 task.
- Addendum 2026-10-31: section 7.1 reconciles DBFX-1 with OBF-18 (the same bug fixed twice; DBFX-1's path kept),
  adds the camera's shake and OBF-18's AI-noise reading, and reads the online detonation gate (7.2; corrected after
  the independent review, 2026-10-31).
- Addendum 2026-11-02 (P20, the online-parity sweep's TB-7): section 5.1 builds the bomb's blast on the resting
  `Volitile` charges and the hostages; section 6's `MPBOMB_BLAST_CHARGES_HOSTAGES` retires and
  `MPBOMB_BLAST_HOSTAGE_OWNER_PLACEHOLDER` is new. Reading, pending review.
  Section 7 is the source of truth for the planted bomb's explosion on the page; research 214 points here.
- Date: 2026-10-16 (02:45Z). The owner's word, relayed by the merge controller: "red room bomb (and probably c4
  explosion) needs to deal damage, it did not", seen in an online match. "Red Room" is one of MP72 Crossroads' two
  bridges (research 171, 213: `BRIDGE_LABELS_READING`), so the bomb is MP72 DEMOLITION's. The
  [brief](../plans/briefs/2026-10-16-bomb-damage.md); branch `agent/bomb` from `bfc139b63`.
- Track: simulation. The read (§1-§4) came first and settled the question before anything was built: **the original's
  detonation hurts the players in its reach, online too**. The build is §5.
- Status: **reading, pending review.** Source inspection of the decompilation and the port; unit tests and a dev-disc
  (fixture) test for the build (§5). No game, emulator, capture or browser was run. Nothing here is proven: no capture
  of a detonation with a player beside the bomb exists (capture B item 9, research 213 §3). Nothing counts as a reading
  until a reviewer who did not write this note re-reads it at the source. A step marked *inference* is one interpretive
  step past the code.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, re-hashed for this note). The disc's data through
  the repository's readers (`readKitTable` over `RUN/ZWEAPON.ZAR`, held by the test of §5). The projectile class's
  method names are research 85 §5's (`CZProjectile`, matched to the demo's).

## 0. Answers (the brief's step 1)

1. **The bomb.** The detonation's `base_explosion1` (`FUN_002c1c30` D:L163919-163927) runs one `FIRE_WEAPON`
   (`FUN_0025ccb0` D:L107153-107326) at the bomb's node. It fires a **pool round** of MPBOMB / MPBOMB Ammo whose tick is
   `CZProjectile`'s `PostTick` (`FUN_003c9fb0`): the 0.001 s fuse runs out on its first frame on **every** machine and
   `HandleTimers` (`FUN_003c99a0`) detonates it online too. Its explosion meets the bodies in MPBOMB Ammo's radius as a
   grenade's does -- the same walk (`FUN_003c7dd0`), the same body handler (`FUN_005ab850` -> `FUN_005ac070` ->
   `FUN_005a0e70`): the line to the head, the falloff, the fragments on armour and health, the knock. The record is
   MPBOMB's (Explosion_Damage 50, Explosion_Radius 30 = 300 u, no Damage_Modifier); the FIRE_WEAPON floats are the
   round's two timers, not a damage scale (research 213 §2.2, kept). **The owner** of each console's round is that
   console's own SEAL, and each console hurts only its own SEAL: so at every hit the owner is the victim -- friendly
   fire spares no one, and a bomb death is the victim's own (a suicide: -2 and a suicide counted), never the planter's kill
   (`MPBOMB_BLAST_OWNER_READING`, §1.4).
2. **The bridges.** The same command on the same path: `seal_demo_site1` / `terrorist_demo_site1` fire the same MPBOMB
   round at `damage_point2` and, 0.1 s later, at `damage_point`, and `destroy_terrorist_base` one at its `healthy` node;
   each would hurt a player in its 300 u. Read this far and **not built** (§2): the host's fall-through is
   `viewer/src/worldState.ts`, outside this brief.
3. **C4 online.** A placed charge: its `Timer1` (6 s) counted by the placed-explosive tick from the plant, then the same
   explosion. The room's C4 already reaches the players through `blast()` -- it did before this task; a test now pins it
   at the fuse's end (§3).
4. **Today's code** (before §5): `bombBlast` reached the scene only (`sceneBlast`); `blast()`'s player loop was never
   called for the bomb (PF.R32). The page shows a blast from the room's events (`blast`: the ring and the knock; `hurt`;
   `kill`) whatever made it, so it needs no change (§4).

## 1. The bomb, from the script command to the body

### 1.1 The command and its round

`FUN_002c1c30`, the bomb's state machine, at state 5 (D:L163919) scores the planter (`FUN_00545750`) and calls
`FUN_00272bb0(DAT_004413c0, 1, 3, DAT_0044d4a0, 0)` (D:L163926): `base_explosion1` with **one** context entry, type 3,
the bomb's node. Its `FIRE_WEAPON` (research 213 §2.2 for the layout: node byte 0xfa, `NODE_CALLER`) in
`FUN_0025ccb0`:

- The round from the pool `DAT_004b5220` (`FUN_003cbdf0`, D:L107202; the pool's stride 0xc4, D:L321067), reset
  (`FUN_003c6cc0`, D:L107205: `+4` bits 2 and 4 cleared, `+0x8c` / `+0x90` "never").
- The start at the node (D:L107229-107244).
- **The owner**: `FUN_002b3580()` (D:L107285) returns `DAT_00440c38`, the console's own SEAL (the actor whose controller
  answers `+0x2c` is made it, D:L455683-455685). A type-9 entry of the context would replace it (D:L107286-107297); the
  bomb's program has none (D:L163926). Its id goes as the fire's last argument (D:L107298-107311), which
  `SetProjectile` (`FUN_003cb1a0`) writes to the round's `+0xac` (D:L320745).
- Online: `+4` bit 2 cleared (D:L107302-107304), bit 3 cleared (D:L107305), the state 1 (D:L107306); after the fire the
  floats over `+0x8c` (0.001) and `+0x90` (0.01) (D:L107312-107316) and **bit 4 set** (`FUN_003c6ac0(round, 1)`,
  D:L107320-107322; `FUN_003c6ac0` writes bit 4 from its argument, D:L318232-318235).

### 1.2 The tick that counts the fuse (a correction to research 213 §2.2)

Research 213 §2.2 read `FUN_003c5310` as "the round's tick", whose fuse counts only with bit 2 or offline
(D:L316893-316895), and concluded that online the FIRE_WEAPON fuse "does not run on the console that fired it". That
tick is the **placed charge's**, not the pool round's:

- The pool's element is the base class: constructed by `FUN_003cb8a0` (vtable `0x4083d0`, D:L320887) in 0xc4-byte
  slots (D:L321067). `FUN_003c5310` reads `+0xc4`, `+0xc5`, `+0xc6`, `+0xc8`, `+0xcc` and `+0xd0`
  (D:L316834-316836, D:L316850-316852, D:L316897-316899) -- past the end of a 0xc4-byte slot. Those fields belong to the derived class
  (vtable `0x4083a0`), whose constructor `FUN_003c5830` calls the base's and then sets them (D:L316967-316975): the
  placed charge's (research 85 §5.2, "the placed-explosive tick 0x3c5310"; the room's `holdsFuse`).
- The pool round's tick is `CZProjectile`'s `PostTick` `FUN_003c9fb0` (research 85 §5, named by names.csv). It counts
  `+0x8c` down every frame with **no** online test (D:L320127-320129), then calls `HandleTimers` `FUN_003c99a0`
  (D:L320191).
- `HandleTimers` acts when offline, or with bit 2, **or with bit 4** (D:L319885-319886). With the fuse at or under 0
  and bit 0 clear it sets state 3 and grenade state 2 (D:L319900-319901).

So on every machine that runs `base_explosion1`, the MPBOMB round detonates on its first `PostTick`: online through bit
4, which FIRE_WEAPON sets for exactly this (D:L107322). Bit 4 also keeps the round off the network: neither
`PostTick`'s nor `FUN_003c7170`'s send (`FUN_002c1420`) runs with it set (D:L320192-320198, D:L318491-318495), and
`SetProjectile`'s registration needs bit 2 (D:L320763-320784). Each console's round is its own.

*(Corrected 2026-10-31, section 7: not "on its first `PostTick`". That `PostTick` counts the fuse out and its
`HandleTimers` sets state 3 (`FUN_003c99a0` D:L319900-319902); the next `PreTick` turns 3 into 4 (`FUN_003ca5a0`
D:L320411-320420), and the `PostTick` after it runs `HandleDetonateExplosion` (`FUN_003c9fb0` D:L320104-320106): the
explosion comes one game frame after the fuse runs out. The online gate's reading is section 7.2.)*

### 1.3 The explosion and the bodies

- State 3 -> 4: `PreTick` (`FUN_003ca5a0`) registers the sphere of the ammunition's radius (`FUN_003d4500`, ammo
  `+0x1c`) at the round (D:L320411-320420).
- State 4 -> 5: `FUN_003c8330` (`PostTick` D:L320104-320105): the effects, the hit list (`FUN_003c7af0`, D:L319251, with a
  radius over 0), state 5 (D:L319265).
- State 5: `PostTick` calls `FUN_003c7dd0` (D:L320094) until it has walked the list; each target's `+0x94` handler is
  called (D:L318992). On a SEAL that is `FUN_005ab850`, whose only caller is `CZSealBody::OnWeaponHit` (`FUN_005ac670`,
  research 219 §1), the friendly-fire gate's home.
- `FUN_005ab850` sends a round in state 5 or 6 (`FUN_003c6ed0`) with a radius over 0 to `FUN_005ac070`
  (D:L464601-464620). Online, `FUN_005ac070` returns at once for a SEAL whose controller is not this console's
  (D:L464826-464833): **each console hurts only its own SEAL.** Else, with damage over 0 at the body
  (`GetDamage` D:L464838) it queues the round (`+0x104c`, D:L464840) and the line to the head (D:L464841-464858).
- `FUN_005a0e70` runs it: the line's veto (D:L459192, unless the round's `IgnoreExplosionDI`), the factor `1 - d^2/r^2`
  (D:L459207-459224), the fragments (`FUN_005a18b0` D:L459236) each taking `GetDamage` (D:L459241) on armour and health
  (`FUN_005a5830` D:L459255), the push (`FUN_0057ed10` D:L459270-459281), and the death's credit to the round's owner
  (`+0xac`, D:L459286-459300: the owner's `+0xa0` handler and `FUN_00547aa0(victim, owner, ...)`).
- `GetDamage`'s explosion branch (states 5 / 6, D:L318700-318722): `Explosion_Damage` (ammo `+0x18`) plus the weapon's
  `Damage_Modifier`, full to half the radius, linear to 0 at the radius -- the port's `fragmentDamage`.

This is the grenade's path, step for step: the port's `blast()` / `resolveBlast` is its transcription (research 85
§7, 91 §5, 235 §1-§2). Nothing in it reads the item: the MPBOMB round takes it with its own record. One difference in
time, as for every blast in the port: the original's walk visits one target a frame (`FUN_003c7dd0` moves its index by
one a call, D:L318996-318999) and the explosion follows the detonation by two or three frames; the room deals the whole
blast on the detonation's tick.

### 1.4 The owner at the hit: `MPBOMB_BLAST_OWNER_READING`

Each console fires its own round, owned by its own SEAL (§1.1), and hurts only its own SEAL with it (§1.3). So the round
that hurts a player is always owned by that player. What follows, each from the code:

- **Friendly fire spares no one.** The gate (`FUN_005ac670`, research 219 §1; the room's `ffRefuses`) drops a hit only
  when the owner is not the victim (0x5ac6b8-0x5ac750). The owner is the victim: the planter's side is hurt with the
  switch off, the planter too.
- **A bomb death is the victim's own.** `FUN_005a0e70` credits the round's owner (D:L459286-459300): the victim, so the
  death is a suicide -- the room's `kill` with the killer the victim: -2 to his score and one to his suicides (research
  216 §2, `FUN_00545c90` D:L411872). The planter's detonation award (+2, `FUN_00545750`, D:L163922) is apart and
  unchanged.
- *Inference:* the death line reads as the victim's own death by MPBOMB. What the original prints and counts for it is
  capture B item 9's to prove (research 213 §3, item 9: the death line and the score as well as the health).

## 2. The bridges and the terrorist base (read only as far as the same answer reaches)

`seal_demo_site1` / `terrorist_demo_site1` fire MPBOMB / MPBOMB Ammo at `damage_point2` (offset 28) and, after `WAIT
0.1`, at `damage_point` (84); `destroy_terrorist_base` at its `healthy` node (offset 28); `destroy_seal_base` has none
(research 213 §2.1-§2.2, the disc's bytes). Each is the same `FUN_0025ccb0`, the same pool round, the same timers and
the same body path (§1). So each would hurt a player inside 300 u of its node, and the terrorist base's destruction
fires a second MPBOMB blast at the base (its `healthy` node) besides the bomb's. Two things differ and are not read:
the switch's program may carry a type-9 context (the presser), which would make **him** the owner on every console
(D:L107286-107297) -- whether it does is not traced (research 213 §2.2, "whether a switch's presser is that context") --
and the order of the base's blast against its swap (the program's `WAIT 0.15` comes after the FIRE_WEAPON).

**Not built.** These blasts are the room's world's (`viewer/src/worldState.ts`: the host's `fireWeapon` falls through,
`BRIDGE_FIRE_WEAPON_READING`), outside this brief's files; the brief's rule ("build only if it is the same path") is met
by the read, the build is a later task's: LATER 63 (`docs/LATER.md`, filed by the merge controller 2026-10-16).
`BRIDGE_FIRE_WEAPON_READING` is narrowed (research 213 §6, 101): the floats are
the fuse and the second timer, and the round goes off online (§1.2); open are the owner of a switch's round and the
build.

## 3. C4 online

C4 (item 151, 0x97) is a placed charge: the derived class (§1.2). Its `Timer1` (6 s) is counted by the placed tick from
the plant (`FUN_003c5310` D:L316893-316901, on the console that owns it: bit 2) and at 0 sets `+0xc4`, which runs
`FUN_003c8740` -> state 3 (D:L316897-316905, D:L319273-319276); the explosion is §1.3's. The room (`placeCharge`,
`room.ts`): the charge laid at rest (`launchGrenade`, state `rest`), its fuse the record's `Timer1`; `flyGrenades` steps
it (`stepGrenade`: the fuse, `holdsFuse` false for C4) and its `explode` calls `blast()`, whose player loop hurts the
players in its reach. **It already did** before this task: `roomBlast.test.ts` "a C4 going off behind a wall hurts the
SEAL ..." (PF-35) and `roomEquipment.test.ts` "C4: ... gone off at its Timer1 (6 s) ..." hold it. A test now pins it at
the fuse's end (§5). If the owner saw C4 hurt no one online, the cause is not the room's blast path; nothing found here
explains it (a page-side or a rendered check is the merge controller's browser slot).

## 4. The port before this task

- `match/src/bomb.ts` `BombAuthority.detonate` emits `detonated` at state 5; `room.ts` listens twice: the planter's
  detonation award (`scoreObjective`) and `bombBlast(e.pos)`.
- `bombBlast` dealt the scene blast of MPBOMB's record (`sceneBlast`, PF.R11) and nothing else (PF.R32,
  `MPBOMB_PLAYER_BLAST_PLACEHOLDER = 'none'`).
- `blast()` (every projectile's) runs the player loop (`resolveBlast`, `net/blast.ts`), the hostages, the resting
  `Volitile` charges and the scene.
- The page: the victim's `blast` event (the ring, the knock laid by the room's `layKnock`), `hurt`, and the broadcast
  `kill` -- the same handling for any blast; the bomb's look (`base_explosion1`'s effects) is `bombPage.ts`'s. No page
  change is needed for the bomb's damage.

## 5. The build (BOMB-DAMAGE, 2026-10-16)

- `match/src/room.ts`: `blast()`'s player loop cut out as `blastPlayers(t, point, ownerOf, facing, name)`, unchanged
  for every projectile (`ownerOf` its live thrower at every victim); `bombBlast` calls it with MPBOMB's record and the
  victim as the owner (`MPBOMB_BLAST_OWNER_READING`), then the scene blast as before. Scoring stays the bomb
  transition's.
- `viewer/src/net/objective.ts`: `MPBOMB_PLAYER_BLAST_PLACEHOLDER` retired; `MPBOMB_BLAST_OWNER_READING = 'victim'`.
- Tests: `central/test/roomBomb.test.ts` "the detonation hurts the players in MPBOMB's reach ..." (MP72 fixture, the
  disc's kit table: the record 50 / 300 / no modifier; both players beside the bomb die on the detonation's tick, each
  death the victim's own, each told its blast; the planting side still wins) replaces "no player is hurt by the bomb's
  blast this sprint"; `match/test/roomBlast.test.ts` "a Terrorist 18 off in the open is untouched to just short of
  Timer1 and hurt at it" pins C4.
- **Not built:** the bridges' and the terrorist base's own FIRE_WEAPON blasts (§2; LATER 63). The timing of §1.3 (a
  frame or three, one target a frame) is the port's every blast's. *(Was, to 2026-11-02: also the bomb's blast on
  resting `Volitile` charges and on hostages -- built by P20, §5.1.)*

### 5.1 The charges and the hostages (P20, 2026-11-02)

**Reading, pending review.** The online-parity sweep's TB-7: the bomb's explosion walks its targets as every blast's
does, so it reaches the resting `Volitile` charges and the hostages as well as the players. Source inspection and unit
tests; no game, capture or browser was run.

- **The walk.** The MPBOMB round's explosion is `FUN_003c7dd0`'s target walk (§1.3, D:L318992), the same as a grenade's.
  It calls each target's interface once `FUN_003c80e0` finds the target visible (raw 0x3c7e74-0x3c7e8c, research 235
  §4). A resting charge's interface is `CProjectileNodeEx`'s hit callback `FUN_003c69c0` (D:L318195-318227, research 235
  §3). A hostage's is its body's `+0x94` handler, a SEAL body's (`FUN_005ab850` -> `FUN_005ac070` -> `FUN_005a0e70`,
  research 237 §2.3). Nothing in the walk reads the round's item.
- **The room.** `blast()`'s hostage loop and its charge loop are lifted out unchanged as
  `blastHostages(t, point, facing, thrower, name)` and `blastCharges(t, point, facing, ownerOf, self)` (`match/src/room.ts`). `blast()` calls them as
  before, and `bombBlast` calls them after `blastPlayers` and before `sceneBlast`, with no cone (`facing` none), as for
  the players.
- **A charge.** It takes GetDamage's explosion base at its centre, at the 1.0 minimum (`FUN_003c7600` D:L318708-318736,
  D:L318763-318767). The line from the blast's lift must be clear (MPBOMB has no `IgnoreExplosionDI`). The charge is
  then queued and goes off on the next game frame (`VOLATILE_CHAIN_TIMING_READING`). Its own blast is its owner's
  (`VOLATILE_CREDIT_READING`). The charge's hit callback runs only on the console that owns the charge (`+4` bit 3,
  L318214). On that console the bomb's round is owned by that console's own SEAL (§1.1, `MPBOMB_BLAST_OWNER_READING`),
  so `detonate`'s `by` is the charge's owner. Past 300 u the base is 0 and nothing is queued. C4 is not among the
  charges: `C4 Ammo` has no `Volitile` (`VOLATILE_READING`, research 235 §6: Claymore Ammo 17 and PMN Ammo 44 alone). A
  resting C4 in the bomb's reach is left to its own fuse, as it is under any blast.
- **A hostage.** It takes the fragments on its own table, through the line to the head, and is knocked (LATER 354).
  The gate never refuses an escortee (`HOSTAGE_FF_READING`), and the rescued bit still does (`RESCUED_HIT_READING`).
  How many fragments reach it is `fragmentCount`'s law: the whole count to 30 u, then scaled by 900 / d^2. So a
  hostage well inside the 300 u is likely to take none.
- **The hostage's owner** is not settled in the room (`MPBOMB_BLAST_HOSTAGE_OWNER_PLACEHOLDER`, §6). In the original
  the hit is applied where the hostage is local, on the host, and the round there is the host's own SEAL's. That SEAL is
  credited with the death (`FUN_005a0e70` D:L459286-459300), and the death is counted by his side (`FUN_0059ee20`
  D:L458123-458127). The room is the host (HX.R2) and has no SEAL of its own, so it deals the blast with no owner: a
  hostage the bomb kills is no one's kill and counts in no valve (`WORLD_KILL_UNCOUNTED_READING`).
- **The kill feed.** That kill goes out as `{ killer: null, how: 'orphan', weapon: 'MPBOMB', victimKind: 'hostage' }`
  with no `killerName` (the review's fold, 2026-11-02; it was `killerName: ''`). No page posts a line for it: a
  hostage's death posts none in the original (`FUN_00547860` D:L412863-412909, the escortee branch;
  `HOSTAGE_KILL_LINE_READING`), and the page's `kill` case returns before `killLine` (`viewer/src/netPage.ts`). With no
  killer side it also plays no SealKill / HostKill cue.
- **Reachable today?** No disc map holds both a bomb and hostages (DEMOLITION and BREACH have no escortees; EXTRACTION
  and ESCORT have no bomb), so the hostage half runs only in a synthetic room. The charge half runs on every DEMOLITION
  and BREACH map.
- Tests: `central/test/roomBomb.test.ts`, "P20: the bomb's blast reaches the resting charges and the hostages", on the
  flat floor with the fixture's kit table (`ZWEAPON.ZAR`, read for MPBOMB's and the claymore's records). A claymore 100
  u from the planted bomb is queued on the detonation's tick, every page is told `detonate` with the charge's owner as
  `by`, and it goes off on the next game frame; one 400 u off stays at rest. A hostage 25 u off is hurt and one 425 u
  off is untouched. A hostage the bomb kills is told with no killer and no `killerName`, and costs no SEAL's minute.
  The bomb's hostage half is dealt through `bombBlast` directly, since no room holds both.

## 6. Readings and placeholders

| name | value | evidence | what settles it | status |
|---|---|---|---|---|
| `MPBOMB_BLAST_OWNER_READING` (viewer `net/objective.ts`; server `room.ts` `bombBlast`) | `'victim'`: the bomb's blast is owned at each hit by its victim -- friendly fire spares no one, a death is his own (suicide) | §1.1, §1.4: `FUN_002b3580` D:L107285, the type-3-only context D:L163926, `FUN_005ac070` D:L464826-464833, `FUN_005a0e70` D:L459286-459300 | capture B item 9 (a defender and the planter beside the bomb: their health, the death lines, the scores) | open; in code since BOMB-DAMAGE |
| `MPBOMB_PLAYER_BLAST_PLACEHOLDER` (retired) | was `'none'`: the detonation hurt no player (PF.R32, 2026-10-05) | overturned by the owner's word (2026-10-16) and §1's read | -- | retired 2026-10-16 (BOMB-DAMAGE): the read settles it, `MPBOMB_BLAST_OWNER_READING` |
| `MPBOMB_BLAST_CHARGES_HOSTAGES` (*note only*; the review's F4) | the bomb's blast walk (`FUN_003c7dd0`, §5) reaches resting `Volitile` charges and hostages as well as players; the room's `bombBlast` dealt players and the scene only, so a claymore or PMN resting within 300 u of the bomb went off in the original and was left by the room (no DEMOLITION map has hostages). *Corrected 2026-11-02: the row said "a claymore or C4"; C4 Ammo has no `Volitile` (`VOLATILE_READING`, research 235 §6)* | §5, §5.1, read | built: `roomBomb.test.ts`'s P20 cases | retired 2026-11-02 (P20): built (`bombBlast` -> `blastHostages`, `blastCharges`; §5.1); its one open part is `MPBOMB_BLAST_HOSTAGE_OWNER_PLACEHOLDER` |
| `MPBOMB_BLAST_HOSTAGE_OWNER_PLACEHOLDER` (server `room.ts`, `bombBlast`) | `'none'`: the bomb's blast at a hostage has no owner -- the gate as for a departed thrower's, a death no one's kill, counted in no valve (`WORLD_KILL_UNCOUNTED_READING`) | §5.1: the original's owner there is the host's own SEAL (the hit applied where the hostage is local, research 237 §2.3; `FUN_002b3580` D:L107285; the credit `FUN_005a0e70` D:L459286-459300; the side's count `FUN_0059ee20` D:L458123-458127); the room is the host (HX.R2) and has no SEAL of its own | which seat the room takes as the host for a world blast, and a capture of a hostage killed by a detonation (none exists; no disc map holds a bomb and hostages both) | placeholder (P20, 2026-11-02) |
| `BRIDGE_FIRE_WEAPON_READING` (cross-reference; the row is research 213 §6's) | the bridges' and the terrorist base's FIRE_WEAPON fall through the room's world | §2: the same path as the bomb's, read; the build outside this brief | the build (a later brief), and capture B item 3 | open; narrowed 2026-10-16 |
| `SCRIPT_ROUND_INITIAL_PHASE_READING` (viewer `effects.ts`) | `stepGrenade`: a full PreTick then PostTick step, including the first frame after FIRE_WEAPON | section 7: integration and timer code read; the animation command's relative phase in the original pool is untraced | trace the animation/pool call order or capture an MPBOMB's first ticks, including its point and timers | placeholder: initial scheduling not yet read; shared step selected for DBFX-1 |
| the script round's online detonation (*note only*; section 7.2) | the page runs every script round's timer, online or not | section 7.2: `PostTick` decrements the fuse with no online test (`FUN_003c9fb0` D:L320127-320131); `HandleTimers` detonates online only with bit 2 or bit 4 (`FUN_003c99a0` D:L319885-319886); FIRE_WEAPON sets bit 4 after the fire and the timer overrides (`FUN_0025ccb0` D:L107321-107322, `FUN_003c6ac0` D:L318232-318235), which the earlier call's unshown argument (D:L107307-107309) cannot undo | an online capture of a detonation on a console that did not plant (for proven) | reading, pending review (corrected 2026-10-31 after the independent review); *note only*: no constant stands in; the initial phase is `SCRIPT_ROUND_INITIAL_PHASE_READING` |


## 7. The missing visual round (DBFX-1, 2026-10-30)

**Reading, independently reviewed (DBFX-1); initial scheduling remains the named placeholder in section 6.** Trello [#275]((the private board)) reported Night Stalker's
planted bomb ending without its explosion. At base `f7de2d462` a dev-disc regression drove BombPage's live 3 -> 5
through the real Effects runner: all six Demolition maps failed because the authored `satchel` program never ran.
This is executed code/data evidence, not an original-console capture.

The full Demolition census (research 173): MP1 Blizzard, MP7 Night Stalker, MP9 Bitter Jungle, MP12 The Ruins,
MP72 Crossroads and MP83 Requiem. Each `MZANIM.ZAR/base_explosion1` decodes to exactly one FIRE_WEAPON: MPBOMB,
MPBOMB Ammo, node 0xfa (`NODE_CALLER`), timers 0.001 and 0.01. The shared `RUN/ZWEAPON.ZAR/zweapon.rdr` record
names `DefaultSpecialAnimName=satchel`, `SpecialMaterialAnimName=satchel`, `Muzzle_Velocity=0`, `ModelName=NONE`,
Timer1 0.1 and gravity 98 (the record reader's original default); its ammunition is MPBOMB Ammo (19). These are runtime reads, never a hard-coded alternative explosion.
The `satchel` program plays `.MK138_SAT_CHRG`, calls LAW_sparks twice, he_sparks_quick twice and dust_explode_long,
then HE_light_flash_large after 0.2 seconds. The existing effects runner already implements those called programs.

Sources re-read from the supplied decompilation, SHA256
`B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`:

- `FUN_0025ccb0` D:L107197-107244 resolves both records; flags at +4 add the local offset (+0x14) and the context's
  type-5 position, then transform by the node at +8. D:L107312-107316 overrides timers unless -1.
- `FUN_003c9fb0` D:L320104-320129: state 4 runs the explosion; otherwise the fuse is counted. Its timer handler
  `FUN_003c99a0` changes to state 3, then `FUN_003ca5a0` D:L320411-320420 changes 3 to 4 in the next PreTick.
  The visual pool counts GAME_FRAME_DT, then emits on the next game frame after fuse expiry. Phase alignment to an
  original rendered frame is not measured. The removal timer cannot cancel a queued explosion: the original processes
  state 4 before the state-6 removal check (D:L320104-320115).
- `FUN_003cb1a0` D:L320728-320744 starts a normal projectile. Zero muzzle speed does not mean stationary:
  `FUN_003ca5a0` D:L320297-320379 applies its gravity and integrates the flight. The visual pool reuses
  `launchGrenade`/`stepGrenade` for gravity, collision and timers, then holds the emitted explosion event until the
  next game frame. The shared projectile step's existing collision confidence applies; `SCRIPT_ROUND_INITIAL_PHASE_READING` names the chosen full first step. The phase of the
  animation command relative to the original's initial PreTick/PostTick is not measured by this task.
- `FUN_003c8330` D:L319216-319246 takes the world column with allowance 0.5, selecting the material variant only
  when the surface lies above explosion y - 10. `FUN_002d4c20` D:L175857-175892 chooses the highest surface at or
  below y + allowance. Missing surface or missing material animation falls back to DefaultSpecialAnimName.
- `FUN_002c1c30` D:L163926 supplies the bomb node (type 3). BombPage had supplied only a position (type 5); it now
  supplies a matrix at that position as NODE_CALLER too. The unflagged command does not add the position twice.

The shared Effects runner now accepts zero-muzzle model-less script weapon records, queues their visual round
independently of the one-command parent, and plays the disc-selected explosion at the simulated round's position.
The launch position snapshots the caller node; the round subsequently follows the existing projectile simulation.
Reset/map change clears the queue; pause stops its clock. The shared opcode reader also retains the command's
optional local-offset and context-position fields. Unknown records and unsupported nonzero-muzzle/modelled scripted rounds
remain unimplemented, with no substitute effect. Scene-controller FIRE_WEAPON (the bridges; section 2) remains in
WorldState's existing deferred path. No damage, scene-health write, score, wire message, fuse or round-result rule
is added here; the room already applies the bomb's blast (section 5).

Tests: `viewer/test/demolitionBlast.test.ts` holds the six-archive census through BombPage and Effects, particles,
sound, position and duplicate-state behavior, plus queue lifetime, default-fuse gravity, reset, pause, record refusal and material fallback.
`viewer/e2e/demolitionBlast.spec.ts` uses the existing escort harness to position two live players, pick up and begin
placement in a real Night Stalker room, then waits out its actual fuse and inspects both rendered pages. Harness
positioning and the picture's effect pause are test instruments, not a physical playtest or a console comparison.
The plan's Log records actual runs. An original detonation capture at both sites remains the evidence needed for proven.

### 7.1 One fix, not two: OBF-18 reconciled, and the camera's shake (2026-10-31)

**Reading, pending review.** OBF-18 (the overnight bug-fix sprint, commits `26a70a855`, `16b719295`; research 214
section 3 as it stood) fixed the same report by handing the command to the throwables (`GrenadeThrower.fireRound`),
whose round went off on its first game frame -- one frame early, against section 7's reading -- and cited "its first
`PostTick`" (section 1.2's sentence, corrected there). B190 carried both; a merge left two `fireWeapon` cases in
`Effects.begin`, the second dead. DBFX-1's path is kept and OBF-18's is removed (`Effects.setWeaponFire` and its
case, `GrenadeThrower.fireRound`, `matchThrow`'s `firedRecord`). Two things only OBF-18 had are kept:

- **The camera's shake.** `HandleDetonateExplosion` (`FUN_003c8330`) tests the round's record's item id (`+0x7c`; the
  weapon list is searched by it, `FUN_003c4b40` D:L316433-316449) against twelve items (0xb6, 0xb2, 0xb1, 0xae, 0xad,
  0xac, 0x9f, 0x80, 0x7f, 0x7b, 0x7d, 0x7a: D:L319186-319191) and, for any other, sets the camera's pending blast point
  `DAT_004b51c8` and its flag `DAT_004b51d8` (D:L319192-319195), which the camera's shake by the distance reads (research
  83, `FUN_00550ef0`: within 100, 200, 600 u). MPBOMB (154, 0x9a) is not on the list, so the bomb shakes the camera.
  The page: `Effects.setBlastPoint` hands a script round's point, when it is not on the list
  (`CAMERA_BLAST_EXEMPT_ITEMS`), to the throwables, which shake by `explosionShake` of the distance from the SEAL's
  feet (`matchThrow` `blastPointShake`) -- the grenades' own rule and measure (`GrenadeThrower`'s `distanceToPlayer`).
  No new value: the presets and the distances are research 83's.
- **No AI noise.** The same function raises an AI sound event only when the record's `+0x30` is over 1
  (D:L319197-319209); OBF-18 read `+0x30` as `Sound_Radius`, MPBOMB's 1 on the disc (`readKitTable` over
  `RUN/ZWEAPON.ZAR`), so the bomb raises none and the page adds none.
- The disc reads OBF-18 held stay in `viewer/test/bombBlastEffect.test.ts`: each Demolition map's `base_explosion1`,
  `satchel` in each `CZANIM.ZAR` and no `satchel_<material>`, `.MK138_SAT_CHRG` in each `<map>_fx.bnk`, MPBOMB's record
  (and its `Sound_Radius`), and the shake through the script round on MP7 and MP72. `satchel`'s own sequences (OBF-18's
  read): three `.MK138_SAT_CHRG` 0.05 s apart (volumes 1, 0.5, 1), then `satchel_explode`'s calls listed above.
- *Observed, outside this task:* the grenades' `explode` listener shakes for every thrown item, the list not applied;
  AN-M8 (122, 0x7a) and Mark141 (123, 0x7b) are on it, so in the original a smoke or a flashbang sets no blast point.
  Left for its own row (the controller's to file).

### 7.2 The online round's detonation (both fixes; corrected 2026-10-31 after the independent review)

**Reading, pending review.** Two things are apart: counting the fuse down, and letting the run-out fuse detonate.
- *Counting.* `PostTick` (`FUN_003c9fb0`) takes the frame off the fuse `+0x8c` and the second timer `+0x90` with no
  online test (D:L320127-320131).
- *Detonating.* `HandleTimers` (`FUN_003c99a0`) acts only offline, or with `+4` bit 2, or with bit 4 set
  (D:L319885-319886).
- *Bit 4.* Online (`DAT_0045a0c1` set), `FUN_0025ccb0` calls `FUN_003c6ac0(round)` before the fire with an argument the
  decompilation does not show (D:L107307-107309), fires through the weapon's vfunc `+0xc` (D:L107310-107311), overrides
  the timers (D:L107312-107316), and then calls `FUN_003c6ac0(round, 1)` (D:L107321-107322). `FUN_003c6ac0` writes
  bit 4 from its second argument's low bit (D:L318232-318235), so this last call sets bit 4.

The unknown first argument, and any write the fire (`SetProjectile` `FUN_003cb1a0`) makes to `+4`, come before that
last write and cannot undo it: on return from FIRE_WEAPON the round holds bit 4, and its `HandleTimers` lets it go off
online on every console that runs `base_explosion1`. This corrects this section as first written, which read the
first call's argument as leaving the detonation unsettled. The page runs every script round's timer, online or not
(OBF-18 did the same), which agrees with the reading. The round's initial command/pool phase stays the named
placeholder `SCRIPT_ROUND_INITIAL_PHASE_READING` (section 6). Not measured: the original's rendered phase and an online
capture of a detonation seen from a console that did not plant (what would make this proven).
