# 234 -- The inventory as built (web sprint 30, PF-34)

- Date: 2026-10-06 (web sprint 30, wave 1). PF-34: a classic death leaves the body's weapons and one bundle of its exact
  remaining magazines on the ground, drawn on every page and in a joiner's welcome; a living player walking within 20
  units takes compatible magazines into free ring slots, and with the Action button on a weapon of the same family swaps
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
| What a classic death lays | one bundle of every firearm ring's exact entries (the rings cleared), then a weapon per firearm slot, then the launcher only with its round | `FUN_005a0040` D:L458646-458706, `FUN_005ba040` D:L472580-472672; `DROP_CONTENTS_READING`, `LAUNCHER_DROP_READING` |
| When | once, at the death's edge (the room's `kill`, one call a death) | `FUN_00547af0` D:L413052 -> `FUN_00547350` D:L412694-412696 |
| A respawn game | nothing | `FUN_002a7560` D:L149415-149433 sets game `+0xdc`; `FUN_005a0040` D:L458657-458659 returns; `DROP_RESPAWN_RULE_READING` |
| Who decides a claim | the original: the drop's owner (owner routed); the port: the room, one transaction | `FUN_0059f610` D:L458314-458332; `PICKUP_ROUTE_READING` |
| Two claims on one tick | the lower seat id; the other `'taken'` | `DROP_SAME_TICK_READING` (PF.R28) |
| A weapon claim's gates | alive, in a round, not mounted, the command fresh, the drop lying, within 20 u, under 32 u/s, the command may fire, not swapping, not behind the binoculars | `FUN_005a81d0` D:L462753-462767, `FUN_00593da0`; `PICKUP_*_READING` |
| What a claim changes | the same-family slot: its record, an empty ring; the old ring dropped as a bundle and the old weapon after it at the taker's feet; the live kit only | `FUN_0059f0c0` D:L458178-458190, `FUN_005bc410` D:L473823-473868 |
| A bundle | taken by walking within 20 u: whole entries into free ring slots; the rest stays | `FUN_00593da0` D:L452526-452533; `AMMO_TRANSFER_PLACEHOLDER` |
| A round created | never: a weapon from the ground arrives empty, a bundle moves what it holds | 194 s2 ("must not create ammunition") |
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

As built (`dropsOf`): the bundle (when any firearm ring holds a round), the primary's and the secondary's weapon (an
`EMPTY_ITEM` slot none), then a rocket launcher in an equipment slot whose round (`rocketRoundOf`) has rounds in the kit
(`KitRounds`). The launcher is **not claimable** this sprint -- its family and refill are their own case (194 L76) -- so
it lies where it fell; it carries no rounds on the wire.

### 2.3 The bundle: the ten entries, cleared

`FUN_005ba040` (D:L472561+) walks the kit's slots; for each with a record (`+0xe4`) it reads the ring
`m_reloads[slot][10]` (`+0x1d4 + slot * 0x28`, D:L472600-472607), and when any entry is positive and the slot is not the
LAW HEAT (`cVar3 != -0x47`, D:L472623) passes the slot's weapon, its ammo item (`+0x15c`) and **the entries' sum** to
`FUN_003cfef0` (D:L472624: three parallel vectors), then zeroes all ten. "Not a fresh weapon plus NumMags full
magazines" (194 s2).

**The port keeps the split, not the sum.** A `BundleEntryWire` is `{ item, rounds }`: the weapon's id and its ring's
non-empty slots in ring order (`MagazineRing.entries`). The original's sum is cut into magazines on the taker's side by
`FUN_005bb000` / `FUN_005ba770`, which are not read; the port moves whole magazines instead (`AMMO_TRANSFER_PLACEHOLDER`,
s4), which needs the split. The total is the original's, round for round; a capture of a pickup with a half-empty ring
(capture B) says whether the taker's magazines come out as the dropper's or re-packed. Which slots join the bundle: the
port's two firearm rings (`BUNDLE_SLOTS_PLACEHOLDER`); the class predicates (`FUN_003d1d10`, `FUN_003d1ce0`) that zero
the record for some slots, and whether a grenade launcher's rounds join, are not read.

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
squared, `+0xeb8` clear, the kit's view state not 4 (the binoculars), not on a ladder (`FUN_0057df10`) -- and then
`FUN_005a7de0(actor, 1, 0)`, **the same test PF-17 reads as the fire's capability** (218 s1). The candidates are within
20 units (`FUN_005a9c70` / `FUN_005a9f40`, the final bound squared 400).

As built (`WorldDrops.judge`, in order; each refusal tallied `pickup: <why>`, INT.R5's report to the requester): the seat
alive (`'not alive'`), the round in play (`'over'`), not mounted (`'mounted'`), the command within
`FIRE_ARRIVAL_JITTER_TICKS` of the seat's latest and in the cone's frames (`'stale'`), the drop lying (`'taken'` /
`'gone'`), a weapon (`'kind'`: a bundle is walked over), the frame's feet within 20 u of the drop (`'reach'`,
`PICKUP_REACH_READING`), its velocity under 32 u/s (`'speed'`, `PICKUP_SPEED_READING`), the frame may fire (`'nofire'`),
not swapping (`'swapping'`), not behind the binoculars (`'binoculars'`) -- `PICKUP_MOTION_GATE_READING`: PF-17's
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
D:L452526, D:L452533) and takes each found (`FUN_00547570`, D:L452529); the weapon prompt's candidates are searched
separately. The accepted ammunition is "transferred and removed, followed by empty-object cleanup" (`FUN_0059e830`,
194 s2); how the sum is cut into the taker's magazines -- capacity, a partly full magazine -- is `FUN_005bb000`
(D:L473158+) and `FUN_005ba770` (D:L472842+), **not read**.

As built (`transferAmmo`, `AMMO_TRANSFER_PLACEHOLDER`): after the claims, each living seat (by id) over each bundle
within 20 u (3D, the feet): an entry of a weapon the seat carries (a firearm slot's record id) goes **whole** into the
first free slot of that ring -- 0 rounds, and not the magazine in the weapon, so a dry weapon is not loaded without its
reload -- in order; an entry with no free slot, or of a weapon not carried, stays. When anything moved the seat is told
its `kit` (no `slot`; `filled`, each ring's slots the transfer wrote); a bundle with a residual is told again (`drop`, same `did`, the shorter list); an emptied one is
removed (`taken { did, by }`). No round is created, split or rounded: the rings gain what the bundle loses
(`roomPickups.test.ts`, "a bundle within 20 u is taken by walking ..."). The original applies no motion gate to the bundle
check (`FUN_005a81d0` gates only the weapon prompt); the port takes it from the living, in a round.

On the page, `Fire.takeWeapon(record, rounds)` sets the record in the hand and exactly the ring the room sent
(`MagazineRing.from`), forgetting the replaced weapon's stowed ring; `Fire.setRing(record, slots, replaced?, only?)` sets a
weapon's ring (in the hand or stowed) from the room's ten slots -- after a walk-over only the slots the transfer wrote
(the `kit`'s `filled`), and **never the magazine in the hand's weapon**: the page's falls as it fires, before the room
runs those commands, so restoring the room's value there would hand the shots in flight back (the review of 9e1a84d5,
"ghost shots"); the transfer never fills that magazine (`AMMO_TRANSFER_PLACEHOLDER`: free slots only), so the room's value
there is never newer than the page's (`fire.test.ts`, "a kit after a walk-over leaves the page's own magazine in the
weapon untouched (shots in flight are not refilled)"). `fire.ts`'s fill of a
first-drawn weapon (`setWeapon` -> `fillMags`) and `refill` stay a spawn's; a pickup never reaches them (`fire.test.ts`,
"takeWeapon sets the record and the exact ring given ...").

## 5. The page's drops and the prompt

`WorldDrops` (`viewer/src/drops.ts`, headless): `place(d)` asks its dep for the weapon's world model (`main.ts`: a clone
of the held model the kit table names) and lays it at `at` with the yaw (`DROP_PLACEMENT_PLACEHOLDER`); a bundle is kept
but drawn as nothing (`AMMO_BUNDLE_MODEL_PLACEHOLDER`: which node `FUN_0059e9e0` builds is not read, and it is taken by
walking); a `did` placed again replaces (a residual, a rejoin's envelope); `remove(did)`, `reset()`. `prompt(feet,
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
room had 28). This is exact for a walk-over's `filled`: a filled slot was empty and not the room's magazine in the weapon
when the kit was sent (`match/src/pickups.ts` `transferAmmo`: `r === 0 && i !== state.current`), so no page operation in
flight touched it. A claim's kit carries no `filled` and is written whole (but the hand's magazine): it is the room's ring
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
| `DROP_CONTENTS_READING` | server `pickups.ts` | `'weapons + one bundle of the ten entries, cleared'`: `FUN_005a0040` D:L458686-458702, `FUN_005ba040` D:L472580-472672 (the sum to `FUN_003cfef0` D:L472624; the port keeps the split, s2.3). Owed: capture B (the pickup object's ten slots) |
| `LAUNCHER_DROP_READING` | server `pickups.ts` | `'with its round'`: the launcher only with 0xb9/0xba present (D:L458675-458683, the drop D:L458705-458706); not claimable this sprint (194 L76). Owed: the launcher's own case |
| `BUNDLE_SLOTS_PLACEHOLDER` | server `pickups.ts` | `'the two firearm rings'`: which kit slots join the bundle (`FUN_003d1d10` / `FUN_003d1ce0`, the LAW HEAT's `-0x47` at D:L472623; a grenade launcher's rounds) is not read. Owed: read; capture B |
| `PICKUP_FAMILY_READING` | server `pickups.ts` | `'same slot'`: `FUN_0059f0c0` D:L458179-458189 (`FUN_005b8820`, `FUN_005b8630`); the port's `slotKindOf`. Owed: all slot families (194 s2) |
| `WEAPON_DROP_AMMO_READING` | server `pickups.ts` | `'empty ring'`: the bundle drops first, the weapon after (D:L458686, D:L458188-458189). Owed: capture B (an exchange to a different rifle) |
| `AMMO_TRANSFER_PLACEHOLDER` | server `pickups.ts` | `'whole entries into free slots'`: `FUN_005bb000` / `FUN_005ba770` not read (194 L78: no full-mag transfer to fill the gap). Owed: read; capture B (an ammo-only pickup into a nearly full ring) |
| `DROP_PLACEMENT_PLACEHOLDER` | server `pickups.ts` (viewer `drops.ts`) | `"at the feet, the body's yaw"`: settling and rotation (`FUN_0059ec60`) not read. Owed: capture B (a death drop). *OBF-15 (2026-10-30; reading, pending review; no code changed):* `FUN_0059f730` places each dropped weapon at its own mount's world pose on the body, not at the feet: the mount by class (`+0x3a8`, `+0x398`, `+0x390`, D:L458398-458407), its origin through the skeleton, the actor's matrix and position (`FUN_002869d0`, `FUN_00306fd0`, `FUN_00309240`, D:L458413-458415); the weapon node is taken off the mount, given that position and rotation, and the mount cleared (D:L458419-458432); then it joins the world and becomes a kind-8 pickup (D:L458438-458441). This runs at the death edge, the actor's next update (`FUN_00547350` D:L412694-412696). The pose is replicated as it is (`FUN_00541700` -> `FUN_002ba660` D:L408904; the receiver decodes a position and three angles, D:L159990-160005 -> `FUN_0059ec60`). The only per-tick pass over the pickups found is their lifetime (`FUN_00542290` D:L409486+, from D:L151164), and no settle to the ground was found. **So in the original as read, a death in the air leaves the weapon in the air**, at the weapon's height where the port's is at the feet. The reported floating rifle (Trello By6ENeJm) is the port's drop at the airborne feet; the original's, as read, floats too. Two port departures stay open and are not built: the height and rotation (the room has no skeleton), and the victim's own page, whose corpse keeps its rifle on the hand (`play.ts` `placeHeld`) where the original takes it off the mount. Settles: capture B with a death in a jump (does the dropped weapon stay where the hand was?). *OBF.R9 (the owner, 2026-10-30, "Drop it to the ground"; an owner-ruled departure from the original):* the room now lays a death's drops on the floor below the feet (`DROP_SETTLE_ADAPTATION`, `match/src/worldDrops.ts`, the walking tick's floor pick), and the victim's own page no longer draws a dropped weapon on its dead body (`Play.dropHeld`). The height and rotation from the hand stay unbuilt. This placeholder's value is unchanged, "at the feet", now the feet set down on the floor. *Known and open:* a classic player who rejoins while dead gets his own drops back from the welcome's set (viewer `drops.ts` `replaceAll`), which carries no "own" flag, so his corpse draws the rifle beside the drop on the floor -- the behaviour before OBF-15, on a rare path |
| `PICKUP_HAND_PLACEHOLDER` (retired 2026-10-14: re-filed as `PICKUP_HAND_READING`, research 323 H1) | server `pickups.ts` (`worldDrops.ts`) | `'the hand kept'`: whether `FUN_005bc410` selects the installed weapon is not read. Owed: capture B (an exchange). Was open; now read (`FUN_005bc410` D:L473823-473868 writes no `+0x824`; research 323 §1.3) |
| `DROP_LIFETIME_READING` (was `DROP_LIFETIME_PLACEHOLDER`, renamed by NU-4 D1, 2026-10-14) | server `worldDrops.ts` | `'round'`: no expiry online -- the 60 s timer laid and run offline only (research 317 R317.6: `FUN_00541700` D:L408887-408888, D:L408909-408910; `FUN_002aa490` D:L151163-151165); swept at the result (`DROP_SWEEP_AT_RESULT_READING`, research 317 §6) and cleared with the air (a round's start, the abandon). Was: "expiry not read (194 L78). Owed: capture B (a drop watched through a long round)". Owed: research 317's capture A (H224) |
| `DROP_OWNER_DEPARTURE_PLACEHOLDER` | server `worldDrops.ts` | `'stays'`: a departed dropper's drops stay claimable under his id; the original's routing to a departed owner not read (194 s2). Owed: capture B (a quitter's drops) |
| `PICKUP_REACH_READING` | viewer `net/pickupRules.ts` | 20 units, 3D from the feet (`FUN_00541f10(20.0)` D:L452526, D:L452533; `FUN_005a9c70` / `FUN_005a9f40`, bound 400) |
| `PICKUP_SPEED_READING` | viewer `net/pickupRules.ts` | 32 u/s, squared 3D (`FUN_005a81d0` D:L462753-462767, ELF 0x6508a0) |
| `PICKUP_MOTION_GATE_READING` | viewer `net/pickupRules.ts` (`worldDrops.ts`) | `'fire capability'`: PF-17's `AimFrame.fire` for `FUN_005a7de0(actor, 1, 0)`, plus not swapping, not the binoculars, not mounted. Owed: A02's full state map |
| `PICKUP_ROUTE_READING` | viewer `net/pickupRules.ts` | `'owner routed (original); the room (port)'`: `FUN_0059f610` D:L458314-458332, `FUN_002ba2c0` D:L159878-159892; 194 L70, L74 |
| `DROP_SAME_TICK_READING` | viewer `net/pickupRules.ts` | `'lower seat id'` (= `FIRST_REQUEST_WINS_READING`, PF.R28). Owed: capture B (two simultaneous requests) |
| `PICKUP_PROMPT_COOLDOWN_READING` | viewer `net/pickupRules.ts` (`actionContext.ts`) | 3 s: `FUN_00592d50` `+0x23c` = 3.0 (D:L452160, D:L452169), counted down only with a candidate in reach (D:L452547-452549) |
| `AMMO_BUNDLE_MODEL_PLACEHOLDER` | viewer `drops.ts` | `'unseen'`: `FUN_0059e9e0`'s node not read. Owed: capture B (the bundle's look) |
| `PICKUP_PROMPT_PICK_PLACEHOLDER` | viewer `drops.ts` | `'nearest in reach'` (in front): the tie-break and the occlusion pass not read. Read in part 2026-11-02 (LkPaioX5 part 2 (c), research 87 §5 "The action list"; reading, pending review): `FUN_005a9c70` / `FUN_005a9f40` both take `FUN_00541d40`'s nearest weapon drop of each class within 20 (D:L409228-409259) -- the second class a drop whose `+0xd` bit 1 is set (action 5), the first every other (action 4) -- so the port offers each class's nearest as its own TAKE entry (`prompt`'s `cls`). Still the port's: the facing test (the original measures from the actor's point plus its `+0x14b0` vector, unread) and no occlusion pass. Owed: `+0x14b0` and `FUN_005a81d0` read; capture B (two weapons together) |
| `PICKUP_HOLD_PER_CLASS_READING` | viewer `drops.ts` (`actionContext.ts`, `matchActions.ts`) | `'once per candidate class'` (PAR-34, 2026-10-12; reading, pending review): `FUN_00593da0` runs `+0x23c` down in its first candidate's branch (D:L452547-452549) and again in its second's (D:L452563-452565); `FUN_00541d40` (D:L409206) gives the second output the weapon drops whose `+0xd` bit 1 is set -- for a corpse's weapons by `FUN_0059f730` (D:L458445; `FUN_0059ec60` D:L458047 for a replicated node), by `FUN_005b8820` class 2, the pistols, ids 4-30 and the first every other weapon, so beside a classic corpse's rifle and pistol (`FUN_005a0040` D:L458646-458706) the 3 s hold ends in 1.5 s. Candidates by the port's pick (`PICKUP_PROMPT_PICK_PLACEHOLDER`). Both pages' `drops` dep lends `candidates` (`main.ts`, `matchMount.ts`; PAR-34 efcd89bb7). Owed: capture B (a pickup beside a corpse's two weapons) |
| `PICKUP_CONTEXT_ORDER_READING` (retired 2026-10-16, AD-6) | was viewer `actionContext.ts` (removed) | settled by the read (reading, pending review; research 214 s4): the candidates `+0x14c` / `+0x150` set actions 4 / 5 (0x10 / 0x20, `FUN_005937c0` D:L452427-452434), after the victory dance's 0x200000 and before a hostage's 0x4000 / 0x8000 in `FUN_0021f850`'s order (D:L74050-74293); `ACTION_CONTEXT_BITS.pickup` [0x10, 0x20]. Was: `'after-c4'`: the candidate's bit among `FUN_0021f850`'s unidentified ones not read; owed: read; capture B (a weapon beside a door). Retired |
| `KIT_INFLIGHT_READING` | viewer `fire.ts` (`setRing`'s doc; *note only*, no constant) | `'filled exact; a claim kit lags in-flight operations'`: a walk-over's `filled` slots were empty and not the magazine in the weapon when the kit was sent (`match/src/pickups.ts` `transferAmmo`), so no in-flight operation touched them; a claim's kit (no `filled`) writes the room's ring as of its last command run into every slot but the hand's magazine, lagging the page's operations in flight (s6). Owed: a claim's own changed-slot list, or a kit stamped with the room's last command |

## 8. Owed

- **Capture B** (owner list 5, an addition to "a weapon pickup"): the pickup object (its ten magazine slots), a death
  with a half-empty ring, an exchange to a different rifle, two simultaneous requests, an ammo-only pickup into a nearly
  full ring, a respawn-mode death, a quitter's drops, a bundle's look, a weapon on the ground beside a door.
- The reads: `FUN_005bb000` / `FUN_005ba770` (the redistribution; then `AMMO_TRANSFER_PLACEHOLDER` and the bundle's split
  against its sum), `FUN_005a9c70` / `FUN_005a9f40` (the prompt's tie-break), the slot predicates of `FUN_005ba040`, the
  launcher's claim and refill (194 L76), A02's state map for the motion gate.
- ~~The wiring of s6's held files and `matchMount.test.ts`'s pins~~ LANDED (wave 4, s6: once, in ONE-WIRE's modules); still owed: the gate's browser run (a classic death's drops on
  `twoPagesMatch.spec.ts`'s harness, a pickup).
- 198 s4.4's "Two players claim one drop; acceptance repeats": held by `roomPickups.test.ts` ("two players claiming one
  drop on one tick ..."); the original's side is capture B's.
- A lock running on the replaced slot at the claim is left as it was: a claim needs a command that may fire, so a reload
  clip's `NoFire` refuses it first; a bolt's or pump's after-shot timer alone is not cleared. If capture B shows the
  original clears it, `WorldDrops.take` clears it as `Room.aim`'s swap does.
