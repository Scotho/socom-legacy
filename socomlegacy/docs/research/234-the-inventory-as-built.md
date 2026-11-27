# 234 -- The inventory as built (web sprint 30, PF-34)

- Date: 2026-10-06 (web sprint 30, wave 1). PF-34: a classic death leaves the body's weapons and one bundle of its remaining
  rounds on the ground (each slot's ten magazines summed to one count, no magazine boundary kept, D:L472600-472607,
  D:L472624 *(corrected 2026-11-23, NC-3 r1)*), drawn on every page and in a joiner's welcome; a living player walking within 20
  units takes compatible ammunition into its ring's magazines under the cap, part-spent ones topped up too (NC-3 r93), and with the Action button on a weapon of the same family swaps
  his slot for it, his old weapon and its magazines dropping where he stands; the room resolves every claim once; no
  round is created anywhere; the air clears them with the round.
- Status: **reading, pending review.** The original's side is read from the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c` r0001) through research 194 s2 (W2-A A01), every line re-read at the decomp for this note;
  research 194 is itself "reading, pending review -- not adopted" (its L6). The room as the one arbiter, the ids, the
  envelope and the transfer's shape are the port's. Nothing here is a capture: the pickup object, the bundle's look, a
  weapon on the ground, an exchange and two simultaneous requests are capture B's (owner list 5).
- Sources: research [194](194-w2-a-combat-actor-gaps.md) s2 (A01) and s3 (A02's motion gate);
  [198](198-wave-2-review-and-implementation-plan.md) s4.1 WP5 and s4.4 ("Two players claim one drop; acceptance
  repeats"); [231](231-the-join-as-built.md) s1-s2 (the envelope, the stable ids); [218](218-the-permission-as-built.md)
  s1 (PF-17's `AimFrame.fire`); [84](84-accuracy-and-recoil.md) s18 (the ring); [179](179-c1-match-server.md) (`Wep PU`). Ruling
  PF.R54 (proposed by the sprint 30 dispatch, the controller's to adopt), PF.R59 (the held area), PF.R28
  (`FIRST_REQUEST_WINS_READING`), PF.R33 (additive JSON).
- **The death and respawn kit path may be revised** by an owner-sanctioned branch of Chris's changing the weapon swap on
  death (incoming, not yet pushed, per the main merge controller): PF-34 touches neither `weaponExchange*.ts` nor the
  respawn kit's selection (`Room.spawn`, `typeKit`, `next`, `PlayerLoadout.spawn`) -- its logic is in its own modules
  (`match/src/pickups.ts`, `match/src/worldDrops.ts`, `viewer/src/drops.ts`), and `room.ts` holds one field and five
  one-line calls, so a merge with that branch meets a seam, not an interleave. If that branch changes what a body
  carries at death, `dropsOf` reads whatever `loadout`/`records`/`mags` hold at `kill`.
- Code: `packages/viewer/src/net/protocol.ts` (`drop`, `taken`, `kit` events, the `pickup` client event, `DropWire`,
  `BundleEntryWire`, `JoinWire.drops?`); `packages/viewer/src/net/pickupRules.ts` (new: the rules both sides share);
  `packages/viewer/src/magazines.ts` (`MagazineRing.entries`, `MagazineRing.from`); `packages/match/src/pickups.ts`
  (new, pure: `dropsOf`, `claimWeapon`, `transferAmmo`, `pickupSlotOf`); `packages/match/src/worldDrops.ts` (new: the
  room's drops, their ids, the claims, the walks); `packages/match/src/room.ts` (`worldDrops` field; `kill`, `text`,
  `step`, `clearAir`, `joinWire`: one line each); `packages/match/src/joinState.ts` (`JoinView.drops`);
  `packages/viewer/src/drops.ts` (new: the page's drops and the prompt); `packages/viewer/src/fire.ts` (`takeWeapon`,
  `setRing`); `packages/viewer/src/loadout.ts` (`PlayerLoadout.take`); `packages/viewer/src/actionContext.ts` (the
  `pickup` context, its prompt and its 3 s hold); `packages/viewer/src/actionWiring.ts` (the optional `pickup` source and
  call); `packages/viewer/src/joinState.ts` (`JoinSinks.drops?`); `packages/viewer/src/takeKit.ts` (new, the review's:
  the `kit` on the page, one call: since wave 4 `MatchFirearm.takeKit`'s, s6). The tests: `match/test/pickups.test.ts`,
  `roomPickups.test.ts` (new); `viewer/test/drops.test.ts`, `takeKit.test.ts` (new), `magazines.test.ts`, `fire.test.ts`,
  `actionContext.test.ts`, `joinState.test.ts`, `loadout.test.ts`. No game or emulator was run; no server but the tests'
  own was contacted.

## 0. The answers

| question | answer | source |
|---|---|---|
| What a classic death lays | one bundle of every ring's ten entries summed, one count a slot (the rings cleared; *(corrected 2026-11-23, NC-3 r1)*), then a weapon per firearm slot, then the launcher only with its round; a slot with no firearm record (FULL_SLOT or EQUIP_NONE, or an item with no record) adds no entry -- in the original it holds no round (an entry needs the slot's ammunition set and a round in a magazine, D:L472603-472614); the port's holds the baked record's ring, filled at the spawn, so `firearmsCarried` gates it (2026-11-13: the equipment limit's forced kits reach it, research 362 s1) | `FUN_005a0040` D:L458646-458706, `FUN_005ba040` D:L472580-472672, `FUN_005bdc30` D:L474642-474648; `DROP_CONTENTS_READING`, `LAUNCHER_DROP_READING` |
| When | once, at the death's edge (the room's `kill`, one call a death) | `FUN_00547af0` D:L413052 -> `FUN_00547350` D:L412694-412696 |
| A respawn game | nothing | `FUN_002a7560` D:L149415-149433 sets game `+0xdc`; `FUN_005a0040` D:L458657-458659 returns; `DROP_RESPAWN_RULE_READING` |
| Who decides a claim | the original: the drop's owner (owner routed); the port: the room, one transaction | `FUN_0059f610` D:L458314-458332; `PICKUP_ROUTE_READING` |
| Two claims on one tick | the lower seat id; the other `'taken'` | `DROP_SAME_TICK_READING` (PF.R28) |
| A weapon claim's gates | alive, in a round, not mounted, the command fresh, the drop lying, within 20 u, under 32 u/s, the command may fire, not swapping, not with a rocket launcher in hand (fire class 4 *(corrected 2026-11-23, NC-3 r17)*) | `FUN_005a81d0` D:L462753-462767, `FUN_00593da0`; `PICKUP_*_READING` |
| What a claim changes | the same-family slot: its record, an empty ring; the old ring dropped as a bundle and the old weapon after it at the taker's feet (no bundle from a slot with no firearm record, `firearmsCarried`; no weapon from FULL_SLOT or EQUIP_NONE, which `FUN_005b8630` matches to no slot, D:L458178-458184; 2026-11-13); the live kit only | `FUN_0059f0c0` D:L458178-458190, `FUN_005bc410` D:L473823-473868 |
| A bundle | taken by walking within 20 u: each entry by its AMMUNITION into every slot of the taker whose weapon takes it, in slot order (2026-11-13: `PICKUP_AMMO_MATCH_READING`), its magazines below the weapon's `NumMags` (2X doubled, at most 10) topped up toward `Ammo_Capacity` from the entry's count, the part-spent ones too, the one in the weapon skipped when the record's own `NumMags` is 2 or more (2026-11-13: `PICKUP_POUR_READING`); the rest stays, offline or as owner -- a granted online entry is cleared whole (s4, NC-3 r52) | `FUN_00593da0` D:L452526-452533; `FUN_005ba3d0` D:L472718-472773 (r0004 `0x5c0d80-0x5c0d9c`, OT.R97) via `FUN_005bb000` D:L473174-473188, `PICKUP_MAGAZINE_CAP_READING`, `PICKUP_AMMO_MATCH_READING`, `PICKUP_POUR_READING`; `AMMO_TRANSFER_PLACEHOLDER` |
| A round created | a firearm from the ground arrives empty (a swap installs no magazine, D:L458188-458189) and a bundle moves what it holds; but a launcher (weapon class 4) taken from the ground gets its round item, 0xb9 (0xba for item 0x92), and one round poured (D:L458282-458291) *(corrected 2026-11-23, NC-3 r40)* | 194 s2 ("must not create ammunition"); the launcher's round D:L458282-458291 |
| How long a drop lies | the round: swept 3 s after the round's result (NU-4 D1, 2026-10-14; research 317 R317.8), the cleared air at the next round's start (was: "the round (the cleared air)") | `DROP_LIFETIME_READING` (was `DROP_LIFETIME_PLACEHOLDER`), `DROP_SWEEP_AT_RESULT_READING` |
| A joiner | `welcome.join.drops`, each the `drop` event's body | 231 s1; PF.R33 |
| The wire | additive JSON under protocol 10: `drop`, `taken`, `kit`, `pickup`, `join.drops`; no codec change | PF.R33 |

## 1. The entities and their ids

The original's pickup is a 0x20-byte object: `+0xc` its kind (8 a weapon, 9 an ammunition bundle, 11 the MP bomb),
`+4` its scene node, `+8` its record or bundle, `+0x10` the owning actor's id and `+0xe` a local u16 serial;
`FUN_00542b90` (D:L409779-409845) allocates the serial, `FUN_005416c0` (D:L408842-408845) packs owner << 16 | serial,
`FUN_00541cc0` (D:L409178-409181) extracts the owner, and the receiver's constructor `FUN_00542930` (D:L409720-409771)
restores the composite id. `FUN_00541700` (D:L408884-408919) announces kind 8 through `FUN_002ba660` and kind 9 through
`FUN_002ba3f0`; the replicated weapon node is `FUN_0059ec60`'s, the bundle's `FUN_0059e9e0`'s. That replication is the
packet research 94 left as `NET_PICKUP_MSG_TYPE_PLACEHOLDER` and research 179 resolved as `Wep PU`'s id word (no
constant to port).

As built: the room keeps its drops in `WorldDrops` (`match/src/worldDrops.ts`), each a `DropWire` -- `did`, `kind`
(`'weapon'` / `'ammo'`), `item` (a weapon's id) or `entries` (a bundle's), `at`, `yaw` (degrees, the walker's), `from`
(the dropper's id). `did` is a serial from 0 at each cleared air, never given twice within it -- `PROJECTILE_ID_READING`'s
rule for `pid` (PF.R15, 231 s2): the room is the one owner of every drop, so the original's owner-and-serial packing has
no work to do. A claim cannot reach a later round's drop of the same `did`: the claim names its command (`seq`), and a
command from before the round's spawn is past `FIRE_ARRIVAL_JITTER_TICKS` (`'stale'`); a `did` given this round and gone
is `'taken'`, one never given `'gone'`. Every page is told each drop (`drop`), its removal (`taken`) and a bundle's
residual (`drop` again under its `did`, which the page replaces).

## 2. The death's drops

### 2.1 The edge and the eligibility

`FUN_00547af0` sets the actor's `+0x1061 & 0x10` at the death (D:L413052); `FUN_00547350` tests it, calls
`FUN_005a0040` and clears it (D:L412694-412696): an edge, not a drop every corpse tick. The room's `kill` runs once a
death (every caller checks `alive`), so `WorldDrops.death` is called there, after the bomb's own drop: one line,
`if (this.opts.rules === 'classic' && this.inRound()) this.worldDrops.death(victim);`.

`FUN_005a0040` (D:L458646-458706) returns early for an actor with `+0xc8 & 2`, a remote controller (vtable `+0x34`),
and online for a network spectator (`FUN_002c2fd0`), `+0xfb0 == 6`, or **game `+0xdc` set** (D:L458657-458659) -- the
respawn option on game type 5 (`FUN_002a7560` D:L149415-149433): `DROP_RESPAWN_RULE_READING`. The weapon and ammo drops
(`FUN_0059f730`, `FUN_0059fd50`) also need the controller's vtable `+0x2c` (`CSealCtrl` 1; `CRemoteCtrl`, `CSealCtrlAi`
0): one console drops, not one per viewer -- in the port, the room. A classic room's waiting room (a side unseated)
plays as a respawn room (`CLASSIC_WAITING_PLACEHOLDER`) and drops nothing (`inRound` false); the raw class and mask
exclusions have no port counterpart (a spectator is never a seat).

### 2.2 The contents

`FUN_005a0040` looks up the primary (`FUN_005c7230`), the secondary (`FUN_005c71a0`) and online the launcher
(`FUN_005c7110`); it drops the bundle first (`FUN_0059fd50(actor, -1)`, D:L458686), then the primary (D:L458693) and the
secondary (D:L458702), and the launcher only when item 0xb9 (LAW HEAT) or 0xba (RPG round) is in the kit
(`FUN_005c86f0`, D:L458675-458677) and `FUN_005bdb20` answers for it (D:L458679-458683; the drop D:L458705-458706):
`LAUNCHER_DROP_READING`. Offline, a weapon drop is skipped when `FUN_005420b0(50.0, ...)` finds something (not online:
not built). An empty slot (`-1`) drops nothing.

As built (`dropsOf`): the bundle (when any firearm ring, or since R142 any throwable or charge ring, holds a round), the primary's and the secondary's weapon (an
`EMPTY_ITEM` slot none), then a rocket launcher in an equipment slot whose round (`rocketRoundOf`) has rounds in the kit
(`KitRounds`). The launcher is **not claimable** this sprint -- its family and refill are their own case (194 L76) -- so
it lies where it fell; it carries no rounds on the wire.

### 2.3 The bundle: the ten entries, cleared

`FUN_005ba040` (D:L472561+) walks the kit's slots; for each with a record (`+0xe4`) it reads the ring
`m_reloads[slot][10]` (`+0x1d4 + slot * 0x28`, D:L472600-472607), and when any entry is positive and the slot is not of the
MISSILE class 0xb9-0xbd (`GetIDType` 0xb9, `cVar3 != -0x47`, D:L472623; D:L324347; R142 below *(corrected 2026-11-23, NC-3 r27)*) passes the slot's weapon, its ammo item (`+0x15c`) and **the entries' sum** to
`FUN_003cfef0` (D:L472624: three parallel vectors), then zeroes all ten. "Not a fresh weapon plus NumMags full
magazines" (194 s2).

**The port keeps the sum, by ammunition (2026-11-13; 2026-11-13, finding 4b (seat 8a), re-read at the source by seat e4; reading, pending review).** A `BundleEntryWire` is `{ ammo, count, item? }`:
the slot's ammunition by name and its ten magazines summed (`FUN_005ba040` D:L472601-472606), with no record for a
firearm's or a pistol's slot (D:L472586-472589: `FUN_003d1d10`'s classes 0x1f, 0x33, 0x51, 0x5b, 0x8d, 0x65 and
`FUN_003d1ce0`'s 4 zero it), so `FUN_005bb000` (D:L473176-473188) matches it by ammunition (`FUN_003d2680`'s name
compare): `PICKUP_AMMO_MATCH_READING`. *Was* (to 2026-11-13): "the port keeps the split, not the sum" -- `{ item, rounds }`,
the weapon's id and its ring's non-empty slots in ring order (`MagazineRing.entries`), moved whole into empty magazines,
which needed the split. The total is the original's, round for round, either way; a capture of a pickup with a half-empty
ring (capture B) measures the taker's magazines. Which slots join the bundle: *was* (to R142) the
port's two firearm rings, the class predicates and a grenade launcher's rounds unread.

**R142 (LATER 1088, 2026-11-15; reading, pending review -- the reads R142-bundle-read and R142-slotcost-read of the
sprint hub and that read's fresh review; source inspection only).** `FUN_005ba040` (D:L472580-472626) bundles every kit
slot with a record (D:L472582), an ammo item at `+0x15c` (D:L472609) and a round in its ring (D:L472610-472622), and
leaves out the MISSILE class 0xb9-0xbd alone (D:L472623; `FUN_003d1a60` D:L324243, D:L324347) -- the RPG round as well
as the LAW HEAT. `FUN_003d1d10` / `FUN_003d1ce0` exclude no slot; they null the record of a firearm's entry
(D:L472585-472589). So a grenade or a charge slot with rounds joins the bundle WITH its record: the port's entry
`{ ammo, item, count }`, the record's ammunition (its first `AMMO_TYPES`, the port's `+0x15c`), the item, the ring's
sum. As built (`dropsOf` -> `takeEquipmentRings`, `DroppingBody.equipmentSlots`, `WorldDrops.death` passing the body's
`EquipmentSlots`): the firearm entries, then each throwable and charge ring with a round and an ammunition, in slot
order; every ring cleared (`EquipmentSlots.take`). Still unread (`BUNDLE_SLOTS_PLACEHOLDER`): which records carry an
ammo item -- so the grenade launchers' rounds (171-183, `KitRounds`) are not bundled. Not built: the body's equipment
record removed unless `FUN_003c5d80` holds (D:L472631-472636; the body is dead, nothing reads it). The rig of
2026-11-15 (a carrier's M4A1, Mark 23, M67 3/3, HE 3/3, 2X: capture, pending review) is `bundleEquipment.test.ts`'s
first golden.

**The reshape is room-private at protocol 15, so it took no bump (2026-11-13, the v0.4.21 close; seat cc, by reading).**
The entries' fields (`ammo`, `count`, `item`; was `item`, `rounds`) are read by one function, the room's own
`transferAmmo` (`match/src/pickups.ts`), on bundles the room made itself -- `dropsOf` at a death and `claimWeapon` at a
weapon swap (the replaced slot's bundle), both laid through `worldDrops.ts` `lay`, the one `lying.push`. Nothing feeds a bundle into a room: the client's `pickup` names a `did` alone, and no restore, takeover or
replay path builds a room's drops from outside. Every other holder passes the entries through unread: `worldDrops.wire`
and `joinWire` (a late page's `join.drops`) copy them; the page's `drops.ts` places a drop by `did`, `kind`, `item` (the
drop's own, not an entry's), `at` and `yaw`; the replay fold (`viewer/src/replay/fold.ts`) keeps the wire whole for its
join. Central, host, the Forge, the playtest segments and `tools/death-count.ts` read no `drop` event (a grep of
`packages/` and `tools/` for the wire's names and the event). So a v0.4.20 recording's old-shape bundle, replayed or
folded after the deploy, is laid on the page as before and never claimed, and a v0.4.20 room meets no v0.4.21 bundle in
a rolling deploy. The committed two-round fixture moved with it: its two `drop` events' entries, 6 x 30 = 180 of
5.56 x 45mm and 6 x 13 = 78 of 9x19P, the totals equal (`twoRoundsFixture.test.ts` holds the v0.4.18 copy to exactly that
difference).

The body's rings are cleared as the bundle is laid (`dropsOf` clears the rings it is given): the corpse keeps no round.

## 3. The claim

### 3.1 The request: owner routed, and the room

`FUN_0059f610` (D:L458314-458332): offline the pickup applies at once; online, when the pickup's owner (`+0x10`) is the
taker it applies the arbiter locally, else `FUN_002ba2c0` (D:L159878-159892) resolves that actor and sends the request to
its client (`+0xfc8`), `FUN_002ba260` (D:L159849-159853) resolving the owner from the composite id. **Owner routed**,
not host routed (194 s2's correction of 179). The accept (`FUN_0059e830` D:L457899-457930) validates the object and the
weapon's identity, builds the accepted-entry mask, broadcasts (`FUN_002ba1f0`) and applies (`FUN_0059dfb0`); the
receiver (`FUN_002ba1a0` D:L159813-159815) applies the same path.

The port's room is the one arbiter of every verb, and copying the owner-peer trust "is not justified" (194 L70); a
central serialisation of two competing requests is a web adaptation (194 L74). So the original's routing is the registry
claim's text (`PICKUP_ROUTE_READING`, `round.pickup.route`), and the port's wire is one `pickup { seq, did }` judged by
the room.

### 3.2 The gates

`FUN_005a81d0` (D:L462753-462767) offers a weapon only to an actor with `+0xe1` bit 4 set, the stance not 6, no move
holding the body (`FUN_00587f50`, `FUN_00587f10`), a squared 3D velocity at most `DAT_006508a0` (0x6508a0 = 32.0)
squared, `+0xeb8` clear, the item in hand not of fire class 4 -- `FUN_005b8760` gives 4 for the rocket launchers' type 0x91
(D:L462763-462764, D:L471620-471632, `FUN_003d1d90` D:L324422-324426; research 215: class 0x91 the rocket launchers),
not the binoculars *(corrected 2026-11-23, NC-3 r17)* -- not on a ladder (`FUN_0057df10`) -- and then
`FUN_005a7de0(actor, 1, 0)`, **the same test PF-17 reads as the fire's capability** (218 s1). The candidates are within
20 units (`FUN_005a9c70` / `FUN_005a9f40`, the final bound squared 400). The reticle's candidate (`FUN_005a9c70`, tried first, D:L452541-452543) is
searched within 20 u of the aimed point `+0x3c0` (D:L463660, D:L463693), the proximity one (`FUN_005a9f40`) around the
actor's position plus its `+0x14b0` vector (a fixed default while that is zero, D:L463752-463769); both are then held
to the 400 bound measured from that position plus `+0x14b0` (the add D:L463683; the bound D:L463703, D:L463719-463720,
D:L463779, D:L463783-463784) -- not from the feet
*(corrected 2026-11-23, NC-3 r73)*.

As built (`WorldDrops.judge`, in order; each refusal tallied `pickup: <why>`, INT.R5's report to the requester): the seat
alive (`'not alive'`), the round in play (`'over'`), not mounted (`'mounted'`), the command within
`FIRE_ARRIVAL_JITTER_TICKS` of the seat's latest and in the cone's frames (`'stale'`), the drop lying (`'taken'` /
`'gone'`), a weapon (`'kind'`: a bundle is walked over), the frame's feet within 20 u of the drop (`'reach'`,
`PICKUP_REACH_READING`; the original's measure is the actor plus `+0x14b0` and the aimed point, above: a port
departure, routed, NC-3 r73), its velocity under 32 u/s (`'speed'`, `PICKUP_SPEED_READING`), the frame may fire (`'nofire'`),
not swapping (`'swapping'`), not behind the binoculars (`'binoculars'`; the original's test is a rocket launcher in
hand, fire class 4, not the binoculars: a port departure, routed *(corrected 2026-11-23, NC-3 r17)*) -- `PICKUP_MOTION_GATE_READING`: PF-17's
`AimFrame.fire` stands for `FUN_005a7de0`, and the rest of `FUN_005a81d0`'s state map is A02's owed. One predicate,
shared with the fire: no second `alive && near` (194 L74). The family last (`'family'`, s3.3).

### 3.3 The same-family replacement

`FUN_0059f0c0` (D:L458155+) checks the pickup is a live kind-8 object, resolves the destination family from the weapon's
category (`FUN_005b8820` of `+0x7c`, D:L458179; the kit's slot of it, `FUN_005b8630`, D:L458186), and **first drops that
slot's ammunition and then its weapon** (`FUN_0059fd50(actor, slot)`, `FUN_0059f730(actor, slot, 1)`, D:L458188-458189);
it moves the world model onto the carried node and installs the record through `FUN_005bc410` (D:L473823-473868):
"changes current inventory state; it is not a saved loadout edit" (194 s2).

As built (`claimWeapon`, `PICKUP_FAMILY_READING`): a primary class into slot 0, a pistol into slot 1 (`slotKindOf`);
anything else -- the launcher, equipment -- refused `'family'`. The slot's old ring becomes a bundle and its old weapon a
weapon drop, both at the taker's feet with his yaw (laid in that order, each a `drop`); the taken weapon arrives with an
**empty ring** (`WEAPON_DROP_AMMO_READING`: the dropper's ring went into his bundle); `p.loadout`, `p.records` and
`p.mags[slot]` change, and the cone takes the record when the slot is the hand's. **The saved pick (`next`), the
character type and the weapon select are untouched**; the next spawn rebuilds the type's kit as before. Which firearm is
in the hand after the claim: the one that was (`PICKUP_HAND_PLACEHOLDER`). Every page gets `taken { did, by, kit }` (the
observers' `RemotePlayers.setKit`), the taker `kit { loadout, slot, rounds }` with both rings' ten slots.

### 3.4 Two claims, and a replayed accept (198 s4.4)

The tick's claims are kept (a seat's later claim in the tick replaces its earlier) and resolved in `WorldDrops.step`,
after the seats' commands ran, by the lower seat id (`DROP_SAME_TICK_READING`, PF.R28): the first takes the drop, the
next finds it gone and is refused `'taken'`. A claim sent again after its accept is refused `'taken'` and changes nothing
(`roomPickups.test.ts`, "two players claiming one drop on one tick ..."). The original's owner validates that the object
still exists on each request (`FUN_0059e830`), so its second request fails the same way; the order of two requests
reaching one owner is its socket's.

## 4. The bundle and the transfer

`FUN_00593da0` (D:L452522-452574) checks kind-9 bundles within 20 units every update (`FUN_00541f10(20.0, ..., 9)`,
D:L452526, D:L452533) and takes a found bundle only when it differs from the last one found (`DAT_0066b418`, D:L452528-452531), an update that
finds none clearing it (D:L452535-452537): a lone bundle is taken once (`FUN_00547570`, D:L452529), not on every update *(corrected 2026-11-23, NC-3 r42;
the port's walk-over runs every tick: a port departure, routed)*; the weapon prompt's candidates are searched
separately. The accepted ammunition is "transferred and removed, followed by empty-object cleanup" (`FUN_0059e830`,
194 s2); how the sum is cut into the taker's magazines -- capacity, a partly full magazine -- is `FUN_005bb000`
(D:L473158+) and `FUN_005ba770` (D:L472842+), **not read** in full. Online, the ask for a firearm entry (`FUN_005ba770`'s first
branch, D:L472855-472866) returns the room test of the FIRST slot whose record takes the ammunition only, so a full
first slot refuses the entry though a later one has room; only the granted take pours every slot (D:L473176-473188),
and the ask starts a 1 s hold (D:L473603) *(corrected 2026-11-23, NC-3 r44; the port fills every matching slot
with no such ask: a port departure, routed)*.

*The cap, read 2026-11-06 (a player report: "up to 9 magazines simply by walking over dead bodies"; reading, pending
review):* `FUN_005bb000`'s first branch (D:L473174-473188) walks the taker's kit slots and, for each whose record takes
the bundle's ammo (`FUN_003d2680`, D:L473181), hands the rounds still owed to `FUN_005ba3d0(kit, slot, rounds)`
(D:L473183), keeping what it returns; its other branch pours through the same `FUN_005ba3d0` (D:L473344, D:L473351), so the cap holds on every branch (the caller: `FUN_0059dfb0`'s kind-9 bundle, D:L457700-457795; review AMMO-1 F1). `FUN_005ba3d0` reads the record's `NumMags` (`FUN_003d2800`, D:L472718) and
`Ammo_Capacity` (`FUN_003d2810`, D:L472719), doubles `NumMags` when any kit item is the Double Ammo Load (`-0x3e`,
D:L472725) and the record's class is one of the six firearm classes (D:L472737-472740), caps it at 10
(D:L472744-472745), tops up each of the ring's first `NumMags` slots to `Ammo_Capacity` from the rounds given
(D:L472750-472758) and zeroes every slot past them (D:L472763). So no pickup carries a weapon past the magazines it
spawns with -- the ammo box's MAG (`FUN_005c49b0`, less one) never above `NumMags - 1`. The port held no cap: a seat
over several bodies filled all ten slots (the HUD's "9 MAG"). It now writes only slots below
`magazinesCarried(record.mags)` (`PICKUP_MAGAZINE_CAP_READING`; the room's records carry 2X already, `withDoubleAmmo`,
so no second doubling). The caps, read from the disc's `RUN/ZWEAPON.ZAR` through `readKitTable` (`NumMags`; the 2X
column through `withDoubleAmmo`), every firearm record the table holds:

| `NumMags` (2X) | records |
|---|---|
| 1 (2) | M40A1 |
| 2 (4) | M60E3, M63A, PKM |
| 3 (6) | M4A1, M4A1 SD, M4A1-M203, 552, 552SD, AK-47, AKS-74, M14, F2000, SA-80 A2, AK-105, OTs-14 Groza, Steyr Aug, HK5SD, F90, 9mm Sub, M82A1A, M87ELR, SR-25, SR-25 SD, Spas 12, Jackhammer, Model 18, Mark 23, Mark 23SD, F57, DE .50, M9 |
| 4 (8) | M16A2, M16A2-M203, HK5, Dragunov, 226, P228, SR-1 Gyurza |
| 5 (10) | 9mm Pistol, 870 |
| 6 (10) | MP5K |
| not doubled | MGL 2, M79 1 (grenade launchers: not a doubled class) |

The report's "max 6 with Double Ammo" holds for the M4A1 and the 3-magazine records; it is not one number for every
weapon. The pour is read (2026-11-13, `PICKUP_POUR_READING`): part-spent magazines under the cap are topped up, and the
one in the weapon too when the record's own `NumMags` is under 2. The remainder's fate is read
(`AMMO_TRANSFER_PLACEHOLDER`'s row): offline or as the owner it is written back (D:L473555); a granted remote entry is
cleared whole by the grant (D:L457700-457702) *(corrected 2026-11-23, NC-3 r52)*. Which records take which ammo is read
(2026-11-13, `PICKUP_AMMO_MATCH_READING`): by ammunition, every slot in order.

As built (`transferAmmo`, `PICKUP_AMMO_MATCH_READING`, `AMMO_TRANSFER_PLACEHOLDER`; 2026-11-13): after the claims, each
living seat (by id) over each bundle within 20 u (3D, the feet): a firearm entry feeds every firearm slot of the seat whose
record takes its ammunition, in slot order -- that ring's magazines below the record's `NumMags`
(`PICKUP_MAGAZINE_CAP_READING`, 2026-11-06), in order, each topped up toward its capacity from the count, part-spent
ones too, the last perhaps part-filled; each at or past the cap zeroed; the magazine in the weapon skipped when the
record's own `NumMags` (the kit table's, never 2X-doubled) is 2 or more (`PICKUP_POUR_READING`, 2026-11-13; *was*: empty
magazines only, the one in the weapon never) -- what is left flowing on; a slot with no firearm record takes nothing
(`firearmsCarried`);
what no slot takes stays. *Was* (to R142): an entry carrying a record (the equipment's) stayed too. *Was* (to
2026-11-13): an entry of the same weapon (record id) went whole into a free slot. When anything moved the seat is told
its `kit` (no `slot`; `filled`, each ring's slots the transfer wrote); a bundle with a residual is told again (`drop`, same `did`, the shorter list); an emptied one is
removed (`taken { did, by }`). No round is created, split or rounded: the rings gain what the bundle loses
(`roomPickups.test.ts`, "a bundle within 20 u is taken by walking ..."). The original applies no motion gate to the bundle
check (`FUN_005a81d0` gates only the weapon prompt); the port takes it from the living, in a round.

*The equipment entries (R142, LATER 1088, 2026-11-15; reading, pending review: `PICKUP_EQUIPMENT_TAKE_READING`).* A
body's bundle walked over in a networked match takes the ask and grant path (the review F4: the owner branch,
`FUN_005bb990` D:L473553, never applies to a living taker of a body's bundle). The ask: each equipment entry against the
taker's kit as it stands, no pour between (`FUN_005bb990` D:L473590-473605 -> `FUN_005ba770` D:L472842-473007) -- its
same-item slot has room (`FUN_005ba5b0` D:L472779-472837), or with no same-item slot the slot search finds one; a full
same-item slot is refused, no other slot sought (D:L473003 -> D:L472830). The grant: every entry whose item and
ammunition match an asked one with a count above zero, at most as many as asked (`FUN_0059e830` D:L457886-457933 ->
`FUN_0059e580` D:L457845-457846; `FUN_0059dfb0` D:L457694-457797). The take, each granted entry on the kit as the earlier
ones left it (`FUN_005bb000` D:L473191-473353): the same-item slot -- of the slots below the count holding the item, the
first with a round, else the last (D:L473212-473238) -- gets the pour, full or not; with none, the first of slots 2-4
past the count (answering the COUNT: the item is appended, the review F1, `FUN_005bae60` D:L473106-473107), or spent and
holding none of `PICKUP_SPENT_EXEMPT_IDS_READING`'s ten (was `LAUNCHER_SLOT_KEPT_READING`, renamed by R4P-103) (D:L473246-473276), or holding EQUIP_NONE (D:L473278-473279); a
SlotCost 2 item needs a second such slot (`PICKUP_SLOTCOST_SECOND_SLOT_PLACEHOLDER`); none, nothing taken. The found
slot gets the record (`FUN_005bc410` D:L473823-473842; `EquipmentSlots.install`, the loadout's item) and the pour
(`FUN_005ba3d0`: the item's own `NumMags` -- the arsenal's -- x `Ammo_Capacity`, at most ten magazines, never doubled:
the 2X doubles the six firearm classes only, D:L472725-472741; `EquipmentSlots.pour`). Then the entry is cleared WHOLE,
whatever fitted (`FUN_003cfc40` D:L323024-323047): what did not fit is lost; an entry not granted stays; the bundle goes
when no entry is left. The clear is not unconditional as decompiled (the build's fresh review, finding 1; the slot-cost
review's F4 called it so): the getter `FUN_003cfd70` (D:L323073-323102) and the clearer act only when the entry's index
is at most the number of entries with a non-zero count, `FUN_0059dfb0` clears in index order (D:L457700-457800) and
compacts only after the loop (`FUN_00541bb0` D:L409125-409131), so with three or more granted entries a later index can
fail the guard -- nothing poured, not cleared. The port clears every granted entry: a body with dry firearms and three
rings (M67, HE, AN-M8) walked over by a taker with a part-spent M67 and one free slot loses the AN-M8 in the port where
the original as decompiled leaves it on the ground. The original's firearm entries share that list, which the port
keeps out (`AMMO_TRANSFER_PLACEHOLDER`), so the gap is named, not built (`PICKUP_CLEAR_INDEX_GUARD_PLACEHOLDER`). Nor is
the missile gate (`FUN_005bb000` D:L473193-473210) built: the builder never bundles that class
(`BUNDLE_SLOTS_PLACEHOLDER`). No model is attached to the taker (`FUN_005c72c0` with the tag "grenade" instances nothing,
the review F2). A round slot overwritten (a spent M203 FRAG) leaves `KitRounds` with the rest kept. The room's state is
the taker's `loadout`, `equipmentSlots` and `rounds`; the `kit` event to the page carries the loadout as before -- the
page's equipment rings on the wire and the line a take posts (`PICKUP_TEXT_PLACEHOLDER`) are head B's. The firearm
entries keep the port's remainder (`AMMO_TRANSFER_PLACEHOLDER`). Held by `bundleEquipment.test.ts`: the rig's three walks
of 2026-11-15 (capture, pending review: the same-item top-up, the HE into a spent M203 FRAG slot, no slot for the HE)
and the rules (unit tests).

On the page, `Fire.takeWeapon(record, rounds)` sets the record in the hand and exactly the ring the room sent
(`MagazineRing.from`), forgetting the replaced weapon's stowed ring; `Fire.setRing(record, slots, replaced?, only?)` sets a
weapon's ring (in the hand or stowed) from the room's ten slots -- after a walk-over only the slots the transfer wrote
(the `kit`'s `filled`), and **never the magazine in the hand's weapon**: the page's falls as it fires, before the room
runs those commands, so restoring the room's value there would hand the shots in flight back (the review of 9e1a84d5,
"ghost shots"); since the pour (2026-11-13, `PICKUP_POUR_READING`) the room also sends the amount it poured into each
magazine (`kit`'s `added`) and the page adds that to its own count -- the magazine in the weapon among them for a
one-magazine weapon -- so shots or a reload in flight are kept; before it the transfer never filled that magazine, so the room's value
there is never newer than the page's (`fire.test.ts`, "a kit after a walk-over leaves the page's own magazine in the
weapon untouched (shots in flight are not refilled)"). `fire.ts`'s fill of a
first-drawn weapon (`setWeapon` -> `fillMags`) and `refill` stay a spawn's; a pickup never reaches them (`fire.test.ts`,
"takeWeapon sets the record and the exact ring given ...").

## 5. The page's drops and the prompt

`WorldDrops` (`viewer/src/drops.ts`, headless): `place(d)` asks its dep for the weapon's world model (`main.ts`: a clone
of the held model the kit table names) and lays it at `at` with the yaw (`DROP_PLACEMENT_PLACEHOLDER`); a bundle is kept
and, since AS-26 (2026-11-24), drawn as the original's box (`AMMO_BUNDLE_MODEL_READING`, research 214 §6; *was* drawn as
nothing, `AMMO_BUNDLE_MODEL_PLACEHOLDER`; it is taken by walking). The original's is a visible box:
`FUN_0059e9e0` loads the model named at 0x65f128, `fiftycal_box` (research 323), and adds it to the scene
(D:L457983-457999) -- a port departure, routed *(corrected 2026-11-23, NC-3 r92)*; a `did` placed again replaces (a residual, a rejoin's envelope); `remove(did)`, `reset()`. `prompt(feet,
forward)` / `promptAt(feet, yaw)` offer the nearest weapon within 20 u in front (`PICKUP_PROMPT_PICK_PLACEHOLDER`: the
original's tie-break and occlusion pass are not read).

The action context: `pickup` after `victory` and before `escortee` (AD-6, 2026-10-16; reading, pending review: the
candidates `FUN_00593da0` keeps, `+0x14c` and `+0x150`, set actions 4 and 5 -- 0x10 / 0x20, `FUN_00544c30` /
`FUN_00544c20`, `FUN_005937c0` D:L452427-452434 -- which `FUN_0021f850` appends after the victory dance's 0x200000 and
before 0x100, 0x200 and a hostage's 0x4000 / 0x8000, D:L74050-74293; research 214 s4; was: after `c4` and before
`turret`, `PICKUP_CONTEXT_ORDER_READING`, the candidate's bit unread -- retired), a one-shot fired on the release, the HUD's
`pickup` prompt (`action_pickup_item.tif`, research 87 s5; LkPaioX5 part 2 (c), 2026-11-02: two prompts, `pickup` action 4's `action_pickup_item1.tif` and `pickup2` action 5's `action_pickup_item2.tif`, each its own entry in the list). After a pickup is chosen `FUN_00592d50` sets the prompt's
hold `+0x23c` = 3.0 (D:L452160, D:L452169; the bomb's `+0x238` 4.0, D:L452154), and `FUN_00593da0` counts it down only
while a candidate is in reach, offering none meanwhile (D:L452547-452549, D:L452563-452565):
`ActionLifecycle.pickupHeld()` / `elapse(dt, inReach)` (`PICKUP_PROMPT_COOLDOWN_READING`). `PlayerLoadout.take(kit)`
changes the live kit and nothing the weapon select holds. `applyJoinState` hands the optional `drops` sink the
envelope's whole set (each `did` once, an empty set when none lie), and `WorldDrops.replaceAll` replaces the page's own
with it: a page that dropped its connection and rejoined in the same round no longer draws, or offers, a weapon taken
while it was away (the review's "stale drops on a rejoin"). `takeKit` (`viewer/src/takeKit.ts`) is the `kit` event on
the page over injected deps -- the live kit, `Fire.takeWeapon` for the hand's replaced slot, `Fire.setRing` with
`filled` otherwise, the replaced slot's fire mode and model -- so the one firearm (`matchFirearm.ts` `MatchFirearm.takeKit`, s6) calls it once;
`dropModels` (`drops.ts`) is `main.ts`'s model factory (a clone of the held model in the scene).

## 6. The wiring (LANDED: sprint 30 wave 4, on ONE-WIRE's shared modules)

**Status: every line below is LANDED**, once. The `netPage.ts` page side landed first (the commit `feat(web/net):
netPage -- the drop/taken/kit and placed/detonate cases`); the page wiring landed in sprint 30's wave 4 (the commit
`feat(web/viewer): sprint 30 wave 4 -- PF-34/36/37's hooks in PART_DEPS and the test room's deps; takeKit in
MatchFirearm`) on ONE-WIRE's modules (research 222), which replaced the twin wiring this section first owed
(`main.ts` plus a `matchMount.ts` / `matchFirearm.ts` copy, PF.R53): each line is written once, in the module that now
holds its neighbours, and a part the front end does not mount is its capabilities switch's (`./matchCore`
`FRONT_END_CAPABILITIES.worldDrops` false), never an empty stand-in. The switch's consequence (the review of 333e0ec2,
left as is): in a classic room the room still lays drops and its walk-over still moves a bundle's rounds into the front
end player's rings and tells `kit`, which the front end does not take -- its rings go stale against the room's, a reload
or a round the page may refuse that the room allows (`MATCH_MOUNT_PARTS_PLACEHOLDER` names the world drops not mounted). The earlier `git apply` hunks against the old
`main.ts`/`matchMount.ts` are retired (they no longer apply after ONE-WIRE). Line numbers are the wave 4 commit's.

| owed line | where it landed |
|---|---|
| `netPage.ts`: `DropWire`, the optional deps `drops?` and `kitChanged?(..., filled?)`, `joinSinks()`' `drops` (**a rejoin's set replaces the page's**), the `'drop'` / `'taken'` (with `remote.setKit`) / `'kit'` cases, the public `pickup(did)` | `netPage.ts` L62-64, L852-856, L980, L1157 (the page side's commit) |
| the deps `drops` and `kitChanged` -- one line in the part's list | `matchNet.ts` L66 `PART_DEPS.worldDrops: ['drops', 'kitChanged']`: owed by a page whose switch has the world drops on, refused at run time and in the typecheck (`PageDeps<C>`) from one that has them off; nothing in `PART_DEFAULTS` or the shared literal (both deps are optional in `NetPageDeps`) |
| `/testroom`'s two deps | `main.ts` L1944 `drops,` and L1945 `kitChanged: (l, s, r, f) => { firearm.takeKit(l, s, r, f); }`, in `connectNet`'s `matchNetDeps` call beside the throwables' |
| `kitTaker` (four lines) and the one `takeKit` call -- **was** `main.ts` after `spawnKit` plus a `matchFirearm.ts` twin | once, in the one firearm: `matchFirearm.ts` L440-443 `kitTaker` (after `spawnKit`, `d.view()` for `view`), L207 `MatchFirearm.takeKit` in the interface, L510 `takeKit: (l, s, r, f) => { fireModes[kitItem] = fireMode; takeRoomKit(kitTaker, l, s, r, f); }` -- the hand's mode stored with its firearm first, as `spawnKit`'s first line does (without it a claim into the other slot reverted a fire mode switched since the last swap: the wave 4 test below) |
| the import of `dropModels`, `WorldDrops`; `drops` after `scene.add(grenade.object)` | `main.ts` L87; L463 `const drops = new WorldDrops(dropModels(scene, () => loadouts.tables(), (m) => view?.held(m)?.clone() ?? null))` |
| `dropAhead` (the prompt's drop) | lent to the action part: `main.ts` L1049 `drops: { ahead: () => drops.promptAt(walk.feet(), walk.snapshot()?.yaw ?? 0) }` in the `mountActions` call; `matchActions.ts` L54 the optional dep, L139 `dropAhead` |
| the action sources' `drops: { prompt }` (null under the 3 s hold) | `matchActions.ts` L143 -- ONE-WIRE moved `pageSources` there (research 222 §2.5) |
| the fire table's `pickup` (`net.pickup(did)`) | `matchActions.ts` L150 `pickup: () => { const did = dropAhead(); return did !== null && (d.net()?.pickup(did) ?? false); }` -- beside `fireTable`'s other calls, moved there |
| `wiring.lifecycle.elapse(dt, dropAhead() !== null)` after `wiring.hold(dt)` | `matchActions.ts` L217, in `MatchActions.lanes` after its `wiring.hold(dt)` (ONE-WIRE moved `padFrame`'s Cross lines there) |
| the round hooks' `clearAir` also `drops.reset()` | `main.ts` L346 `clearAir: () => { grenade.clearAir(); drops.reset(); }` |
| a map left clears the drops (`WorldDrops.reset`'s own doc; the review of 333e0ec2) | `main.ts` L1916 `drops.reset();` in `connectNet` beside the old net's teardown (`net?.close()`, `acts.unlock()`, `acts.follow(null)`): offline no welcome's `replaceAll` follows, so without it the old map's models stayed and the prompt still offered them |
| ~~`matchMount.ts`: `drops: null` (asymmetric) and a mirrored `kitChanged`~~ | **not needed**: the front end's switch has the world drops off, so it hands neither and is refused both; it receives `kit` after a server walk-over in a classic room and drops it (its rings go stale against the room's -- the switch's consequence, above). A future front end with `worldDrops` on owes both by the typecheck, `kitChanged` then one line over its own `firearm.takeKit` |
| `MATCH_MOUNT_PARTS_PLACEHOLDER`'s list gains "the world drops" | already there since ONE-WIRE (`matchMount.ts` L64, L72; research 101 s4's row names no twin) |

**The tests.** The page's (landed with `netPage.ts`): `netPageRound.test.ts` "drop, taken and kit reach the deps: the
drop placed, the taker's kit set on the remote body, the page's own kit changed with the exact rings and the slots
filled; pickup(did) sends the client event with the last seq" and "a page built without drops or kitChanged ignores
drop, taken and kit (each dep optional); taken still sets the taker's kit"; `netPageJoin.test.ts` "a rejoin's welcome
replaces the page's drops: one taken while it was away is removed (replaceAll), none lying clears them". Wave 4's,
in place of the twin pins `matchMount.test.ts` owed: `matchNet.test.ts` "sprint 30 wave 4: PF-36's tagOwnProjectile
and detonateProjectile are the throwables', PF-34's drops and kitChanged the world drops' -- owed by /testroom and
handed on, refused from the front end", the typecheck's `@ts-expect-error` lines (the front end handing `kitChanged`;
`/testroom` without `drops` and `kitChanged`) and "sprint 30 wave 4: /testroom hands PF-36's two charge hooks and
PF-34's drops and kit; the front end none (its switch has both parts off)"; `matchFirearm.test.ts` "takeKit sets the
kit on the firearm's loadout and its rings: the hand's replaced weapon taken up with the room's exact ring, the other
ring set, the records the new kit's, no fill" and "a claim into the slot not in the hand keeps the hand's fire mode as
switched (stored with its firearm first, as spawnKit does)"; `matchActions.test.ts` "a weapon drop ahead is the pickup
context; the release claims it of the room (NetPage.pickup with its did)", "a chosen pickup holds the weapon prompt
(PICKUP_PROMPT_COOLDOWN_READING), run down by the frames only while a drop is in reach", "no drops (a page without the
world drops): never the pickup context, nothing claimed" and the `main.ts` text pin "PF-34: /testroom lends the action
part its drops ..."; `matchMount.test.ts` "PF-34 / PF-36: the front end mounts no throwables and no world drops (its
switch), so no hook of its own; /testroom hands all four".

**The kit and the magazine journal (the integration review's follow-up, `agent/kitjournal`).** NET-FIX2/3 gave `Fire`
a journal of the last 256 ring operations (research 223 s6, LOW-2: `log` keeps each round's and reload's ring and a copy
of it as it stood before; `unlog` takes a refused one out and replays the ring from that copy). `setRing` wrote the room's
kit into the live ring only, so a `stale` arriving after a `kit` -- a round fired at seq k on a bundle, the room's
walk-over and `kit` (with `filled`), then the round refused stale -- replayed from the pre-kit copy and erased the
transfer: the reviewer's probe went 104 -> 88 rounds where the room held 105, a stowed pistol lost its 20 transferred
rounds, and a stale reload lost 17. It never created a round, but the page could refuse a shot or a reload the room
allows. `setRing` now writes the same slots into every journal copy of that ring, skipping, for the hand's ring, each
copy's own magazine in the weapon as it skips the live one (the review of 4c062f27: a claim's kit over a reload in flight
otherwise wrote the room's lagging slot 0 into the copies logged before the reload, and a stale replayed to 29 where the
room had 28). A walk-over's `filled` is exact through `added`: the page adds each poured amount to its count, which commutes with
the page's operations in flight (viewer `fireCore.ts` `setRing`; s4). *Was*: exact because a filled slot was empty and
not the room's magazine in the weapon (`transferAmmo`'s `r === 0`), which no longer holds since the pour tops up
part-spent magazines too (D:L472750-472760; `PICKUP_POUR_READING`, 2026-11-13) *(corrected 2026-11-23, NC-3 r71, r93)*. A claim's kit carries no `filled` and is written whole (but the hand's magazine): it is the room's ring
as of the commands the room had run, so its other slots lag the page's operations still in flight -- in the live ring and
the copies alike, a stale or not (a reload in flight leaves slot 0 at the room's 30 where it will be 27):
`KIT_INFLIGHT_READING`, a known gap, owed a `filled`-like list for a claim (the slots the claim changed) or a kit
stamped with the last command the room ran. Pinned in `fire.test.ts` ("a kit after a walk-over reaches the journal's
saved ring copies ...", "a stale reload logged before the kit restores on top of the kit's slots", "a claim kit with a
reload in flight: a stale fire replays to the room's count, 28 not 29", "a stowed pistol's 20 transferred rounds survive
a stale ..."), the LOW-2 cases unchanged.

**The menu path (PARITY-1 wave 4, PAR-4, `agent/parw4`, 2026-10-08; H120).** The front end's switch has the world drops
on (`FRONT_END_CAPABILITIES.worldDrops`), so the table above's "not needed" row is overtaken: `matchMount.ts` builds the
same part `main.ts` does (`new WorldDrops(dropModels(scene, () => loadouts.tables(), (m) => view?.held(m)?.clone() ?? null))`),
hands the action part its `drops.ahead` (`promptAt`, the line after `win` as `main.ts`'s), hands `NetPage` the two hooks
`PART_DEPS.worldDrops` lists (`drops`, `kitChanged` -> `firearm.takeKit`), and resets the drops at a round's start
(`roundClear`, with the air: `DROP_LIFETIME_PLACEHOLDER`) and at the teardown (`main.ts`'s map left). The claim hold's
real-time count is PAR-24's (research 252). Pinned in `matchMount.test.ts` ("PAR-4: the world drops and the Cross pickup
on the menu-launched match": a death's drop ahead claimed by Cross, the room's `taken` and `kit` into the kit, a round's
start clearing what lies, the teardown) and the pins that held the front end's drops off, now held on: `matchNet.test.ts`
(owed from both pages, the typecheck's two `@ts-expect-error` lines now owed ones), `matchMount.test.ts` (both pages'
lines), `matchCore.test.ts` (the pinned switch). The browser run from the lobby is the gate's (PAR-27).

## 7. Readings and placeholders

| name | where | status |
|---|---|---|
| `DROP_RESPAWN_RULE_READING` | server `pickups.ts` (`room.ts` `kill`) | `'classic only'`: `FUN_005a0040` returns on game `+0xdc` (D:L458657-458659), set only by the respawn option on type 5 (`FUN_002a7560` D:L149415-149433); a classic waiting room drops nothing. Owed: capture B (a respawn-mode death) |
| `DROP_CONTENTS_READING` | server `pickups.ts` | `'weapons + one bundle of the ten entries, cleared'`: `FUN_005a0040` D:L458686-458702, `FUN_005ba040` D:L472580-472672 (the sum to `FUN_003cfef0` D:L472624; the port keeps the sum, by ammunition, since 2026-11-13: s2.3, `PICKUP_AMMO_MATCH_READING`; was the split). Owed: capture B (the pickup object's ten slots) |
| `LAUNCHER_DROP_READING` | server `pickups.ts` | `'with its round'`: the launcher only with 0xb9/0xba present (D:L458675-458683, the drop D:L458705-458706); not claimable this sprint (194 L76). Owed: the launcher's own case |
| `BUNDLE_SLOTS_PLACEHOLDER` | server `pickups.ts` (`worldDrops.ts` `death`) | `'the firearm rings and the throwable and charge rings'` (R142, 2026-11-15; the builder a reading, pending review, s2.3): every slot with a record, an ammo item and a round, the MISSILE class 0xb9-0xbd left out (`FUN_005ba040` D:L472580-472626, D:L472623); still unread: which records carry an ammo item, so the grenade launchers' rounds stay out. Not built for the same reason: the take's missile gate (`FUN_005bb000` D:L473193-473210), as no MISSILE-class entry is ever bundled (s4; the build's fresh review, finding 5). Owed: a dev-disc assertion over `ZWEAPON`'s `ammoId`. R4P-223 (2026-11-24; reading, pending review): r0004's builder FillAmmoPickupInstance `FUN_005c07c0` D4:L514110-514157 clears an item 0x97's (C4, 151) ring before the sum and the positive-entry test, so C4 never joins the stash (r0001's `FUN_005ba040` D:L472580-472631 adds it); the port drains the C4 ring and adds no entry; the claymore, satchel and PMN keep their path. Owed for it: a capture of the stash on both revisions. Was `'the two firearm rings'` (the predicates and a grenade launcher's rounds unread) |
| `PICKUP_FAMILY_READING` | server `pickups.ts` | `'same slot'`: `FUN_0059f0c0` D:L458179-458189 (`FUN_005b8820`, `FUN_005b8630`); the port's `slotKindOf`. Owed: all slot families (194 s2) |
| `WEAPON_DROP_AMMO_READING` | server `pickups.ts` | `'empty ring'`: the bundle drops first, the weapon after (D:L458686, D:L458188-458189); a launcher taken from the ground gets its round item and one round (D:L458282-458291 *(corrected 2026-11-23, NC-3 r40)*). Owed: capture B (an exchange to a different rifle) |
| `PICKUP_MAGAZINE_CAP_READING` | server `pickups.ts` | `'NumMags, 2X doubled, at most 10'` (2026-11-06; reading, pending review): a bundle fills only a ring's first `NumMags` slots -- `FUN_005bb000` D:L473174-473188 -> `FUN_005ba3d0` D:L472718-472763 (doubled with item `-0x3e` for the six firearm classes, D:L472725, D:L472737-472740; capped at 10, D:L472744-472745; the rest zeroed, D:L472763); the port: `magazinesCarried(record.mags)` on the 2X-applied record, the caps by weapon in s4. Owed: capture B (an ammo-only pickup by a seat already at its magazines) |
| `PICKUP_AMMO_MATCH_READING` | server `pickups.ts` | `'by ammunition, every slot in order'` (2026-11-13, finding 4b (seat 8a), re-read at the source by seat e4; reading, pending review): a firearm's bundle entry carries no record (`FUN_005ba040` D:L472586-472589) and is poured into every kit slot whose record's ammunition list holds its ammunition by name (`FUN_005bb000` D:L473176-473188; `FUN_003d2680` D:L325031-325048), in slot order, the remainder flowing on; one ammunition a record on the dev disc (a byte read of `RUN/ZWEAPON.ZAR`: 72 one, 14 none). Owed: capture B (a pickup off another side's body) |
| `PICKUP_POUR_READING` | server `pickups.ts` (viewer `fire.ts`) | `'topped up under the cap, the loaded one skipped from 2 magazines'` (2026-11-13, finding 4b (seat 8a), re-read at the source by seat e4 (r0004's at the cluster's diff of `005ba3d0`, 0x5c0d80-0x5c0d9c); reading, pending review): `FUN_005ba3d0` D:L472718-472773 -- magazines 0-9 in order, each under the cap topped up to `Ammo_Capacity` from the count, part-spent ones too, each past the cap zeroed (D:L472760-472763), the rest returned; r0004 skips the magazine in the weapon when the record's own `NumMags` is 2 or more (so a one-magazine weapon's is topped up). The room tells the page the amount each magazine changed by (`kit`'s `added`) and the page adds it to its own count (`Fire.setRing`), shots or a reload in flight kept. Owed: capture B (an ammo-only pickup into a part-spent ring) |
| `AMMO_TRANSFER_PLACEHOLDER` | server `pickups.ts` | `'the remainder stays on the ground'` (R142, 2026-11-15: a FIREARM entry's remainder only; an equipment entry follows the grant, cleared whole, `PICKUP_EQUIPMENT_TAKE_READING`; 2026-11-13: narrowed to the remainder -- the match is `PICKUP_AMMO_MATCH_READING`, the pour `PICKUP_POUR_READING`; was `'empty magazines under the cap, filled from the sum'`, before that `'whole entries into free slots'`): the walk's caller `FUN_005bb990` (D:L473501+) reads each entry i of the pickup's entry list (the object at the pickup's +8, D:L473530) with `FUN_003cfd70` (its weapon record, ammo item and count, from the list's three parallel vectors at +8, +0x14 and +0x20; D:L473552, D:L323073-323102), and -- when the network flag `DAT_0045a0c1` is clear, or the pickup's own +0x10 (D:L473545) is the actor's +0x830 record's +4 (D:L473553) -- pours it (`FUN_005bb000`, the remainder back through its fourth argument, D:L473554) and writes the entry back with `FUN_003cfe40(list, i, record, ammo, remainder)` (D:L473555): the setter twin of `FUN_003cfd70`, storing the three values at index i when i is at most the count of non-zero counts (D:L323104-323131) -- so offline the remainder stays in the bundle, as the port has it (2026-11-13, seat e4; reading, pending review); online the owner's grant clears each granted entry whole (`FUN_0059dfb0`, `FUN_003cfc40` D:L457702), so the remainder is lost there, where the port leaves it -- its own task, and the owner's to rule, as it reverses 194 L78's ask. Owed: that task, capture B |
| `PICKUP_EQUIPMENT_TAKE_READING` | server `pickups.ts` (`takeEquipment`; `worldDrops.ts` `walk`; viewer `equipmentSlots.ts` `room`, `pour`, `install`) | `'the same item first, else a spent unprotected slot 2-4; the granted entry cleared whole'` (R142, 2026-11-15; reading, pending review; s4): the ask `FUN_005ba770` D:L472842-473007, the grant `FUN_0059e580` D:L457845-457846, the take `FUN_005bb000` D:L473191-473353, the clear `FUN_003cfc40` D:L323024-323047 (as decompiled, only while the entry's index passes its guard: `PICKUP_CLEAR_INDEX_GUARD_PLACEHOLDER`). Owed: a fresh reviewer's re-read; the rig's walks (capture, pending review) |
| `PICKUP_CLEAR_INDEX_GUARD_PLACEHOLDER` | server `pickups.ts` (`takeEquipment`; `worldDrops.ts` `walk`) | `'every granted entry cleared'` (R142, the build's fresh review, finding 1; s4): the getter `FUN_003cfd70` D:L323073-323102 and the clearer `FUN_003cfc40` D:L323024-323047 act only when the index is at most the number of entries with a non-zero count; `FUN_0059dfb0` D:L457700-457800 clears in index order and compacts after the loop (`FUN_00541bb0` D:L409125-409131), so with three or more granted entries a later index can fail the guard (nothing poured, not cleared). The case: a body with dry firearms and M67, HE, AN-M8; a taker with a part-spent M67 and one free slot -- the port installs the HE and deletes the AN-M8, the original as decompiled leaves the AN-M8 on the ground. Not built: the original's firearm entries share the list, the port keeps them out (`AMMO_TRANSFER_PLACEHOLDER`). Owed: that ruling, then a rig sample of the case |
| `PICKUP_SLOTCOST_SECOND_SLOT_PLACEHOLDER` | server `pickups.ts` | `'a second slot 2-4 other than the first, left as it is'` (R142): `FUN_005bb000` D:L473286-473340 (SlotCost `+0x27c`, `FUN_003c5960` D:L322610-322614); whether the second may be the first (D:L473293 against D:L472952; the review F5) and that nothing is written into it are unread. Owed: 0x5bb338-0x5bb4c8 against 0x5ba9f8-0x5bab88, or a rig take of a Satchel bundle with one and two free slots |
| `PICKUP_EQUIPMENT_SLOT_PLACEHOLDER` | server `pickups.ts` | `'the five-slot kit, EQUIP_NONE a record'` (R142): past the count the search answers the count (the review F1); left: a count-4 kit whose slot 4 is neither spent-and-unprotected nor EQUIP_NONE finds none (D:L473245), and whether the original's empty slots hold 0xff records. Owed: the disassembly at 0x5bb2xx, a rig take by a kit with an empty slot |
| `PICKUP_EQUIPMENT_POUR_READING` | server `pickups.ts` (`takeEquipment`; viewer `equipmentSlots.ts` `room`, `pour`) | `"as a firearm's: the loaded one skipped from 2 magazines"` (R4P-219, 2026-11-24; reading -- r0004 cites CONFIRMED by atlas-parity 2026-11-24 -- was pending review; *was* `PICKUP_EQUIPMENT_POUR_PLACEHOLDER`, R142): r0004's pour `FUN_005c0c20` D4:L514322-514323 and its ask `FUN_005c0e40` D4:L514401-514403 (r0001's `FUN_005ba3d0` D:L472718-472773 and `FUN_005ba5b0` D:L472779-472837 have no skip) pass over the slot's current magazine (`+0x684`) when the record's own `NumMags` is 2 or more, with no class test, so an equipment slot's ring takes it as a firearm's; the port's ask (`room`'s `skipLoaded`) and its take agree. That `+0x684` is every slot's current-magazine word is inferred from the slot-generic index. No throwable or charge record has `NumMags` 2. Owed: a fresh reviewer's re-read at r0004 |
| `PICKUP_TEXT_PLACEHOLDER` | viewer `pickupLine.ts` (`pickupLines`, posted by `matchFirearm.ts` `takeKit` through `Hud.postSmallMessage`) | `'no take sound; the +0xc0 gate read as the room telling only the taker its kit'` (PICKUP-LINE correction 1, 2026-11-22: the string is `PICKUP_TEXT_READING`; *was* `'the taken entry's ammo name on the small window, not the window's latest line again; no sound'`, PICKUP-LINE 2026-11-20, and before that `'no line posted'` in server `pickups.ts`, R142): `FUN_005bb000` returns when nothing was taken (D:L473356-473358), plays the kit's `+0x888` sound for every character's take (D:L473359-473362), and posts on the small message window `0x437060`, colour 0, only when the character's `+0xc0` answers its virtual `+0x2c` (D:L473363-473374); the page posts from the room's `kit`, which only the taker's page is told. The sound is not played; the gate's vtable is unread. Owed: the `+0x888` object's set-up and vtable `+0x14`, the `+0xc0` object's vtable `+0x2c`; the rig's audio for a take |
| `PICKUP_TEXT_READING` | viewer `pickupLine.ts` (`ammoNameOf`, `pickupLines`; scene `arsenal.ts` `ammoDisplayNames`) | `"the ZAMMO record's DisplayName (ammo +4, FUN_003cedb0), the disc's bytes"` (PICKUP-LINE correction 1, 2026-11-22; reading, pending review): the post reads the ammo record's `+4` (`FUN_003d4550` D:L326665-326669), filled by the ammo loader `FUN_003cedb0` from `DisplayName` (D:L322655-322659, `FUN_003d4650` D:L326753-326765; its `InternalName`, key 0x3fc638, goes to `+0` by `FUN_003d46b0`, D:L322650-322654); 7 of the disc's 39 `ZAMMO` records differ from their `InternalName` (research 101 PF-34 lists them), the rig's "M67 Ammo" and "HE Grenade Ammo" the same in both. A record without `DisplayName` gets the loader's own default "NOT FOUND" (D:L322642-322643, the fallback D:L322655-322658; scene `AMMO_DISPLAY_NAME_DEFAULT_READING`, its own row, re-read 2026-11-22); `ammoDisplayNameOf`'s `InternalName` fallback is the port's own, for an arsenal with no name table (hand-built tests). Owed: a rig frame of a smoke or M79 take |
| `AMMO_DISPLAY_NAME_DEFAULT_READING` | scene `arsenal.ts` (`arsenalOf`, `ammoDisplayNames`) | `"NOT FOUND"` (PICKUP-LINE's re-read, 2026-11-22; reading, pending review): the ammo loader `FUN_003cedb0` copies its own default string "NOT FOUND" into a local (D:L322642-322643) and, when a `ZAMMO` record lacks the `DisplayName` key (0x3fc648), stores that default at the record's `+4` (D:L322655-322658); `arsenalOf` maps such a record to "NOT FOUND". Unreachable on the disc if all 39 records carry the key (scene `test/arsenal.test.ts`, 39 names read). `ammoDisplayNameOf`'s `InternalName` fallback is the port's own, for an arsenal with no name table (hand-built tests). Owed: a fresh reviewer's re-read |
| `PICKUP_TEXT_FIREARM_READING` | viewer `pickupLine.ts` | `'posted'` (PICKUP-LINE correction 6, 2026-11-22; reading, pending review; *was* `PICKUP_TEXT_FIREARM_PLACEHOLDER`): the post (D:L473359-473375) is `FUN_005bb000`'s common tail, which the firearm branch (D:L473174-473188) and the equipment branch (D:L473191-473353) both reach, the only earlier return being "nothing taken" (D:L473356-473358); a firearm entry's take posts its slot record's ammo by its `DisplayName` ("5.56 x 45mm"). Owed: the rig's HUD frames of a firearm-ammo take |
| `PICKUP_LINE_ENTRY_ORDER_PLACEHOLDER` | viewer `pickupLine.ts` (`pickupLines`) | `"firearm rings first, then equipment slots, from the taker's records (the kit wire has no entry order)"` (PICKUP-LINE item 4, 2026-11-22; a named departure, not built): the original posts one line per bundle entry in the bundle's order, from the entry's own ammo record (`FUN_005bb990` D:L473549-473607); the room's `kit` carries no entry order (match `worldDrops.ts` `tellKit`). Owed: a `kit` field listing the taken entries' ammo in order |
| `SMALL_MESSAGE_LAYOUT_READING` | viewer `hudLayout.ts` (`HUD_LAYOUT.smallMessage`, `SMALL_MESSAGES`) | `"the main window's rule on small_messages.rdr: x 2-142, y 0-99; lines from x 12 (left); baseline unsettled"` (PICKUP-LINE correction 2, 2026-11-22; reading, pending review; *was* `'... centred on x 72, left-anchored'`): `small_messages.rdr` (`RUN/READERC.ZAR`; the dev-disc test `test/pickupLine.test.ts`) is `messages.rdr` but for `left` 12, `maxlength` 120 and `fadetime` 5; the panel by the main window's measured rule (x 147-492, y 0-99: `left - XMargin` .. `left + maxlength + XMargin`, 0 .. `bottom + YMargin`), anchored on the left edge as the ammo box is; each line starts at x 12, the window's left, as `FUN_002b5830` places a line posted with the centred argument 0 in a non-centred window (D:L157609-157610; the take passes 0, D:L473374). Non-centred: the window loader sets its flag bit 0 only on the key "centered" (D:L158216-158219) and bit 1 only on "descends" (D:L158220-158226); neither key is in `small_messages.rdr` or `messages.rdr` (`subtitles.rdr` carries "centered"; the dev-disc test `test/pickupLine.test.ts`). The baseline keeps the main window's: not settled. Owed: a rig frame of a take's line |
| `SMALL_MESSAGE_REPEAT_RESET_PLACEHOLDER` | viewer `hudLayout.ts` (`Hud.postSmallMessage`) | `"no line added; the last post's lines left as they are (their reset not built)"` (PICKUP-LINE correction 5, 2026-11-22): the take's compare is case-insensitive with the window's newest line (D:L473369-473371); the window skips leading spaces and adds no line on the same bytes as its last post while it holds one (`FUN_002b6530` D:L157930-157969); the reset of that post's lines (a virtual call through the line class's vtable 0x406420) is not read and not built. Owed: that vtable's `+0x34`, or a rig take of one item twice inside 5 s |
| `DROP_PLACEMENT_PLACEHOLDER` | server `pickups.ts` (viewer `drops.ts`) | `"at the feet, the body's yaw"`: settling and rotation (`FUN_0059ec60`) not read. Owed: capture B (a death drop). *OBF-15 (2026-10-30; reading, pending review; no code changed):* `FUN_0059f730` places each dropped weapon at its own mount's world pose on the body, not at the feet: the mount by class (`+0x3a8`, `+0x398`, `+0x390`, D:L458398-458407), its origin through the skeleton, the actor's matrix and position (`FUN_002869d0`, `FUN_00306fd0`, `FUN_00309240`, D:L458413-458415); the weapon node is taken off the mount, given that position and rotation, and the mount cleared (D:L458419-458432); then it joins the world and becomes a kind-8 pickup (D:L458438-458441). This runs at the death edge, the actor's next update (`FUN_00547350` D:L412694-412696). The pose is replicated quantized (`FUN_00541700` -> `FUN_002ba660` D:L408904): its three angles at 10 bits over 2 pi (D:L160035-160051), rebuilt from the bins by the receiver (D:L159998-160001, D:L159990-160005 -> `FUN_0059ec60`), so off by up to about 0.35 degrees *(corrected 2026-11-23, NC-3 r85)*. The only per-tick pass over the pickups found is their lifetime (`FUN_00542290` D:L409486+, from D:L151164), and no settle to the ground was found. **So in the original as read, a death in the air leaves the weapon in the air**, at the weapon's height where the port's is at the feet. The reported floating rifle (Trello By6ENeJm) is the port's drop at the airborne feet; the original's, as read, floats too. Two port departures stay open and are not built: the height and rotation (the room has no skeleton), and the victim's own page, whose corpse keeps its rifle on the hand (`play.ts` `placeHeld`) where the original takes it off the mount. Settles: capture B with a death in a jump (does the dropped weapon stay where the hand was?). *OBF.R9 (the owner, 2026-10-30, "Drop it to the ground"; an owner-ruled departure from the original):* the room now lays a death's drops on the floor below the feet (`DROP_SETTLE_ADAPTATION`, `match/src/worldDrops.ts`, the walking tick's floor pick), and the victim's own page no longer draws a dropped weapon on its dead body (`Play.dropHeld`). The height and rotation from the hand stay unbuilt. This placeholder's value is unchanged, "at the feet", now the feet set down on the floor. *Known and open:* a classic player who rejoins while dead gets his own drops back from the welcome's set (viewer `drops.ts` `replaceAll`), which carries no "own" flag, so his corpse draws the rifle beside the drop on the floor -- the behaviour before OBF-15, on a rare path |
| `PICKUP_HAND_PLACEHOLDER` (retired 2026-10-14: re-filed as `PICKUP_HAND_READING`, research 323 H1) | server `pickups.ts` (`worldDrops.ts`) | `'the hand kept'`: whether `FUN_005bc410` selects the installed weapon is not read. Owed: capture B (an exchange). Was open; now read (`FUN_005bc410` D:L473823-473868 writes no `+0x824`; research 323 §1.3) |
| `DROP_LIFETIME_READING` (was `DROP_LIFETIME_PLACEHOLDER`, renamed by NU-4 D1, 2026-10-14) | server `worldDrops.ts` | `'round'`: no expiry online -- the 60 s timer laid and run offline only (research 317 R317.6: `FUN_00541700` D:L408887-408888, D:L408909-408910; `FUN_002aa490` D:L151163-151165); swept at the result (`DROP_SWEEP_AT_RESULT_READING`, research 317 §6) and cleared with the air (a round's start, the abandon). Was: "expiry not read (194 L78). Owed: capture B (a drop watched through a long round)". Owed: research 317's capture A (H224) |
| `DROP_OWNER_DEPARTURE_PLACEHOLDER` | server `worldDrops.ts` | `'stays'`: a departed dropper's drops stay claimable under his id; the original's routing to a departed owner not read (194 s2). Owed: capture B (a quitter's drops) |
| `PICKUP_REACH_READING` | viewer `net/pickupRules.ts` | 20 units, 3D from the feet (the port's; the original's measure is in s3.1: a departure, NC-3 r73) (`FUN_00541f10(20.0)` D:L452526, D:L452533; `FUN_005a9c70` / `FUN_005a9f40`, bound 400). The weapon candidates are held to that bound from the actor's position plus `+0x14b0`, not the feet; the reticle's is searched around the aimed point `+0x3c0` (D:L463660, D:L463693, D:L463673-463679, D:L463752-463769; s3.1 *(corrected 2026-11-23, NC-3 r73)*) |
| `PICKUP_SPEED_READING` | viewer `net/pickupRules.ts` | 32 u/s, squared 3D (`FUN_005a81d0` D:L462753-462767, ELF 0x6508a0) |
| `PICKUP_MOTION_GATE_READING` | viewer `net/pickupRules.ts` (`worldDrops.ts`) | `'fire capability'`: PF-17's `AimFrame.fire` for `FUN_005a7de0(actor, 1, 0)`, plus not swapping, not the binoculars, not mounted (the original's is a rocket launcher in hand, fire class 4, not the binoculars: a port departure, s3.1, NC-3 r17). Owed: A02's full state map |
| `PICKUP_ROUTE_READING` | viewer `net/pickupRules.ts` | `'owner routed (original); the room (port)'`: `FUN_0059f610` D:L458314-458332, `FUN_002ba2c0` D:L159878-159892; 194 L70, L74 |
| `DROP_SAME_TICK_READING` | viewer `net/pickupRules.ts` | `'lower seat id'` (= `FIRST_REQUEST_WINS_READING`, PF.R28). Owed: capture B (two simultaneous requests) |
| `PICKUP_PROMPT_COOLDOWN_READING` | viewer `net/pickupRules.ts` (`actionContext.ts`) | 3 s: `FUN_00592d50` `+0x23c` = 3.0 (D:L452160, D:L452169), counted down only with a candidate in reach (D:L452547-452549) |
| ~~`AMMO_BUNDLE_MODEL_PLACEHOLDER`~~ (retired 2026-11-24 by AS-26: now `AMMO_BUNDLE_MODEL_READING` `'fiftycal_box'`, research 214 §6) | viewer `drops.ts` | *was* `'unseen'`: the port's. `FUN_0059e9e0` loads `fiftycal_box` (0x65f128, research 323) into the scene (D:L457983-457999): the original's bundle is a visible box, so `'unseen'` is a departure *(corrected 2026-11-23, NC-3 r92)*. Owed: the build (routed), capture B (the bundle's look) |
| `PICKUP_PROMPT_PICK_PLACEHOLDER` | viewer `drops.ts` | `'nearest in reach'` (in front): the tie-break and the occlusion pass not read. Read in part 2026-11-02 (LkPaioX5 part 2 (c), research 87 §5 "The action list"; reading, pending review): `FUN_005a9c70` / `FUN_005a9f40` both take `FUN_00541d40`'s nearest weapon drop of each class within 20 (D:L409228-409259) -- the second class a drop whose `+0xd` bit 1 is set (action 5), the first every other (action 4) -- so the port offers each class's nearest as its own TAKE entry (`prompt`'s `cls`). Still the port's: the facing test (the original holds both candidates to 20 u of the actor's point plus its `+0x14b0` vector and searches the reticle's around the aimed point, s3.1, NC-3 r73; what `+0x14b0` is stays unread) and no occlusion pass. Owed: `+0x14b0`'s meaning; capture B (two weapons together) |
| `PICKUP_HOLD_PER_CLASS_READING` | viewer `drops.ts` (`actionContext.ts`, `matchActions.ts`) | `'once per candidate class'` (PAR-34, 2026-10-12; reading, pending review): `FUN_00593da0` runs `+0x23c` down in its first candidate's branch (D:L452547-452549) and again in its second's (D:L452563-452565); `FUN_00541d40` (D:L409206) gives the second output the weapon drops whose `+0xd` bit 1 is set -- for a corpse's weapons by `FUN_0059f730` (D:L458445; `FUN_0059ec60` D:L458047 for a replicated node), by `FUN_005b8820` class 2, the pistols, ids 4-30 and the first every other weapon, so beside a classic corpse's rifle and pistol (`FUN_005a0040` D:L458646-458706) the 3 s hold ends in 1.5 s. Candidates by the port's pick (`PICKUP_PROMPT_PICK_PLACEHOLDER`). Both pages' `drops` dep lends `candidates` (`main.ts`, `matchMount.ts`; PAR-34 efcd89bb7). Owed: capture B (a pickup beside a corpse's two weapons) |
| `PICKUP_CONTEXT_ORDER_READING` (retired 2026-10-16, AD-6) | was viewer `actionContext.ts` (removed) | settled by the read (reading, pending review; research 214 s4): the candidates `+0x14c` / `+0x150` set actions 4 / 5 (0x10 / 0x20, `FUN_005937c0` D:L452427-452434), after the victory dance's 0x200000 and before a hostage's 0x4000 / 0x8000 in `FUN_0021f850`'s order (D:L74050-74293); `ACTION_CONTEXT_BITS.pickup` [0x10, 0x20]. Was: `'after-c4'`: the candidate's bit among `FUN_0021f850`'s unidentified ones not read; owed: read; capture B (a weapon beside a door). Retired |
| `KIT_INFLIGHT_READING` | viewer `fire.ts` (`setRing`'s doc; *note only*, no constant) | `'filled exact; a claim kit lags in-flight operations'`: exact through `added`, each poured amount commuting with the page's operations in flight (viewer `fireCore.ts`; s4, s6); *was* argued from "a walk-over's `filled` slots were empty and not the magazine in the weapon", which no longer holds since the pour tops up part-spent ones too (D:L472750-472760) *(corrected 2026-11-23, NC-3 r71, r93)*; a claim's kit (no `filled`) writes the room's ring as of its last command run into every slot but the hand's magazine, lagging the page's operations in flight (s6). Owed: a claim's own changed-slot list, or a kit stamped with the room's last command |

## 8. Owed

- **Capture B** (owner list 5, an addition to "a weapon pickup"): the pickup object (its ten magazine slots), a death
  with a half-empty ring, an exchange to a different rifle, two simultaneous requests, an ammo-only pickup into a nearly
  full ring, a respawn-mode death, a quitter's drops, a bundle's look, a weapon on the ground beside a door.
- The reads: `FUN_005bb000` / `FUN_005ba770` (the redistribution past the cap read 2026-11-06 -- the top-up, the ammo
  match's fallback, the remainder; then `AMMO_TRANSFER_PLACEHOLDER`, the taker's magazines after a pickup),
  `FUN_005a9c70` / `FUN_005a9f40` (the prompt's tie-break), the slot predicates of `FUN_005ba040`, the
  launcher's claim and refill (194 L76), A02's state map for the motion gate.
- ~~The wiring of s6's held files and `matchMount.test.ts`'s pins~~ LANDED (wave 4, s6: once, in ONE-WIRE's modules); still owed: the gate's browser run (a classic death's drops on
  `twoPagesMatch.spec.ts`'s harness, a pickup).
- 198 s4.4's "Two players claim one drop; acceptance repeats": held by `roomPickups.test.ts` ("two players claiming one
  drop on one tick ..."); the original's side is capture B's.
- A lock running on the replaced slot at the claim is left as it was: a claim needs a command that may fire, so a reload
  clip's `NoFire` refuses it first; a bolt's or pump's after-shot timer alone is not cleared. If capture B shows the
  original clears it, `WorldDrops.take` clears it as `Room.aim`'s swap does.
