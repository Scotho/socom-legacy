# 235 -- The explosives as built (web sprint 30, PF-35 / PF-36)

- Date: 2026-10-06 (web sprint 30). PF-35: a round's `IgnoreExplosionDI` (C4's) reaches the room's two blast
  consumers -- the player's queued blast ray and the scene destructible's line -- and nothing else (§1-§2). PF-36:
  `Volitile` -- damage on a resting claymore or PMN queues one detonation, a round's or a blast's, the chain a frame a
  link, its kills its owner's (§3-§5).
- Status: **reading, pending review.** Every value below is a read of the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c` r0001) as research 194 §7 A11 gives it (194 is itself "reading, pending review -- not
  adopted", its L6; its PROVEN/STRONG maps to reading, research 206), or of the disc's `RUN/ZWEAPON.ZAR` `zweapon.rdr`
  (the fixture). Nothing here is a capture: the original's boundary cases are capture B's (owner list 5; §7).
- Sources: research [194](194-w2-a-combat-actor-gaps.md) §7 A11 (the bit, its two consumers, the data inventory, the
  script producer, the acceptance) and §8 (`IGNORE_EXPLOSION_DI_READING`'s disposition); [94](94-the-arsenal.md)
  L1038, L1309-1310 (C4's record) and its readings table (`IGNORE_EXPLOSION_DI_READING`, note only until now);
  [209](209-the-mutable-world.md) §13-§14 (the scene's health, `SceneHealth.blastAt`, `SCENE_BLAST_REACH_PLACEHOLDER`,
  ruling PF.R11); [213](213-crossroads-as-built.md) §5 (XR-08's bases: `bombBlast`, MPBOMB's record);
  [198](198-wave-2-review-and-implementation-plan.md) §4.1 WP10, §4.4 (the acceptance row). Ruling PF.R55 (proposed by
  the sprint's dispatch, the controller's to adopt). PF-36: 194 §9 A21 (the field, the bind, the callback's gates, the
  two dispatches, the acceptance and the owed gates, L209) and 94 L1330-1331, L1339, L1544 (`VOLATILE_READING`, note only
  until now); 198 §4.1 WP11, §4.3 step 9; [231](231-the-join-as-built.md) §2 (the pids, the envelope); ruling PF.R56.
- Code: `packages/scene/src/projectile.ts` (`ThrowableRecord.ignoreExplosionDI`, `throwableRecord`'s line,
  `IGNORE_EXPLOSION_DI_READING`); `packages/match/src/room.ts` (`blast()`'s `seen`, `sceneBlast()`'s clear line, both
  JSDocs); `packages/viewer/src/sceneHealth.ts` (`SCENE_BLAST_REACH_PLACEHOLDER`'s JSDoc). The tests:
  `packages/scene/test/projectile.test.ts`, `packages/match/test/roomBlast.test.ts`, `roomBarriers.test.ts`,
  `roomJoin.test.ts`. PF-36: `projectile.ts` (`ThrowableRecord.volatile`, its parser line, `CLAYMORE.volatile`,
  `volatileQueues`, `raySphere` and the readings of §6), `room.ts` (`fire`'s charges, `blast`'s charges, `chargeHit`,
  `flyGrenades`'s queue, `placed` from `throwGrenade`/`placeCharge`), `viewer/src/net/protocol.ts` (`placed`,
  `detonate`), `viewer/src/grenade.ts` (`tagOwn`, `detonateRemote`, `OWN_PID_READING`); the tests `projectile.test.ts`,
  `match/test/roomVolatile.test.ts`, `viewer/test/grenade.test.ts`. No game or emulator was run; no server but the
  tests' own was contacted.

## 0. The answers

| question | answer | source |
|---|---|---|
| Which rounds carry it? | `C4 Ammo` (ID 18) alone of the disc's 39 `ZAMMO` rows, a bare field | the fixture's `zweapon.rdr`; 194 §7 (`ammo-flags.json`) |
| Where does it live? | ammo `+0x28 & 2` (`FUN_003d43c0`), copied to projectile byte `+5 & 2` at construction | `FUN_003cb1a0` D:L320755-320756 |
| What does it change? | the actor's queued blast ray is not vetoed by a blocking hit; the world target's material loop is skipped | `FUN_005a0e70` D:L459192-459193; `FUN_003c80e0` D:L319096-319143 |
| What does it not change? | the radius, the fragments, the friendly-fire gate, the health and shield rules, the cones, the direct hit, movement collision, penetration | 194 §7 A11 |
| Which rounds carry `Volitile`? (PF-36) | `Claymore Ammo` (17) and `PMN Ammo` (44) alone of the 39 rows, a bare field (ammo `+0x28 & 1`) | `FUN_003d4400` D:L326522-326525; the fixture; 194 §9 A21 |
| What does it do? | damage on the charge at rest -- a round's or a blast's, nonzero at GetDamage's 1.0 minimum, the charge not already going off -- queues its detonation | `FUN_003c69c0` L318206-318216; `FUN_003c7600` D:L318763-318767 (§3) |
| What does the port leave open? | the hit geometry (a 5-unit sphere), the queue-to-explosion timing (the next frame), the chain's credit (the charge's owner), the online sender gates | §4, §6, §7 |

## 1. `IgnoreExplosionDI` and its two consumers

**The field.** The projectile constructor `FUN_003cb1a0`, D:L320755-320756, copies `FUN_003d43c0(ammo)` -- the ammo's
`+0x28 & 2`, set by the loader for a bare `IgnoreExplosionDI` -- into the projectile's byte `+5`, mask 2 (194 §7 A11;
94 L1309-1310). It is the **round's** (`ZAMMO`), not the weapon's: the port reads it off the `AMMO_TYPES` round as
`throwableRecord` reads `AccelerationFactor` and `ProximityDistance`, a presence test as `HasBackblast`'s
(`ThrowableRecord.ignoreExplosionDI?: true`). On the fixture (`projectile.test.ts`, "IgnoreExplosionDI is read as a
bare field: ..."): the 39 `ZAMMO` rows, `C4 Ammo` (18) the one with the field; `C4`'s record carries it, the M67's,
the claymore's and the PMN's do not. A data inventory, not proof that only C4 can acquire the bit (§2's script
producer).

**Consumer 1, the actor's queued blast ray** (`FUN_005a0e70` D:L459192-459193). The queued body ray (`FUN_005ac070`
D:L464837-464858 queues it -- "a queued ray is not itself proof it was unobstructed") is vetoed by a blocking hit only
when `FUN_003c8310(projectile)` -- the getter of the same bit, D:L319159-319162 -- is false; the radius and fraction
checks continue afterwards (D:L459208-459224). The port: `room.ts` `blast()`'s `seen` (the line from the blast,
lifted by `sightFrom`, to the head, `FUN_005ac070`'s stand-in) is true for a flagged record:

```ts
const seen = record.ignoreExplosionDI === true || !segmentHit(this.map.grid, sightFrom(point, head), head);
```

`resolveBlast` (`viewer/src/net/blast.ts`, unchanged) refuses only `!seen` (and no damage, no flash); the combat
report's `'occluded'` miss reads `seen` and so is never told of a flagged blast. Held by `roomBlast.test.ts` ("a C4
going off behind a wall hurts the SEAL whose head the blast cannot see ...": the charge 10 short of a 60-high wall,
the SEAL's feet 18 behind it, his head's line meeting the wall about 10 up; hurt with the bit, and the M67 from the
same feet at the same SEAL occluded as before).

**Consumer 2, the world target** (`FUN_003c80e0` D:L319096-319143). With the bit the collision-material attenuation
loop is skipped and the target returns eligible; without it the materials at `+0x24` can veto or reduce the squared
reach. The caller `FUN_003c7dd0` D:L318978-318992 invokes the target's damage interface only after it passes. Since
AD-5 (2026-10-16, 209 §13) the port has the loop: `sceneHealth.ts` `blastLine` / `reachGate`, on the line from the blast
to the target's bounds midpoint, the radius squared times each other surface's material PENETRATION against the line's
length squared, the first surface per owner in surface order (`REACH_HITS_READING`); the room's `sceneBlast` takes it with the map's materials
as `blastAt`'s `clear`, and the flag skips it:

```ts
r.ignoreExplosionDI === true || blastLine(this.map.grid, sightFrom(point, to), to, target, r.explosionRadius, penetration)
```

The cones are `GetDamage`'s factor after x14 now (the claymore's 1/32, the backblast's 0: `blastAt`'s `cone`).
*Was* (PF-35 to AD-5): no material loop -- PF.R11's stand-in, a segment from the blast to the nearest point of the
target's bounds meeting nothing but the target, skipped by the flag after the cones (`reaches(to) &&
(r.ignoreExplosionDI === true || segmentHits(...).every((h) => under(h.owner.path, target)))`, the claymore's 1/32 taken
as no reach). Held by `roomBarriers.test.ts` ("a C4's blast reaches a destructible whose line from the blast is blocked
by another surface ..."): a 10-high METAL_THICK kerb (PENETRATION 0) between the charge and a shield-10 barrier; C4
opens it, an M67 at the same point (rating 10, eligible on the shield) does not, and without the kerb the same M67 does;
since AD-5 an M67 opens it through a WOOD_THIN kerb (0.25). `MATERIAL_ATTENUATION_PLACEHOLDER` (note only, §6):
resolved by AD-5 (*was*: the port had no per-material reduction to skip).

## 2. What does not change, and the script producer

**Unchanged** (194 §7 A11: "This does **not** turn off projectile movement collision, bullet penetration, friendly
fire, radius, target-health eligibility, C4 shielding ..."; "replacing every check with a global `seen || isC4`
shortcut is insufficient"): the explosion radius, the fragments' law and the knock (`resolveBlast`), the friendly-fire
gate (`ffRefuses`, PF-22), the scene's shield and health (`blastAt`, `c4TargetAt`), the backblast's and the claymore's
cones (`reaches`), the direct hit (`directHit`), the flight's collision (`stepGrenade`). The flag is read by name at
the two lines above and nowhere else. Held by `roomBlast.test.ts` ("the bit changes nothing else: ..."): a flagged C4
hurts no one outside its radius behind the wall, spares the planter's mate behind the wall with friendly fire off,
and in the open gives the same `blast` and `hurt` events and health, to the draw, as the unflagged record. This test
holds an invariance: it was green before the change as after.

**The page.** `viewer/src/grenade.ts`'s own blast look (`damageAt`, the ring on the local body) runs no sight test
(no `segmentHit` or `seen` in the file), so it carries nothing; `resolveBlast`'s signature is unchanged (PF-23's
parked branch edits `blast.ts`).

**The planted bomb.** `bombBlast` (XR-08, 213 §5) is a *scene* blast of MPBOMB's record (MPBOMB Ammo, 19): that round has
no `IgnoreExplosionDI` on the disc, so its line test stands for every destructible, the two demolition bases included:
`FUN_003c80e0` has no branch by target kind (D:L319096-319143). On MP12 the comm tower's `di3`, and after the tower's
death `di2`, refuses the SEAL base from a bomb planted behind the mast (213 §5, reading, pending review); the round is
still the planters', by the bomb's state 5. Player damage has since been built (research 332); this sentence's "no
player path" was PF.R32, retired 2026-10-16. *Was* (PR #405 as opened, never on `main`): a by-name exemption for the
two bases, `BASE_BLAST_LINE_PLACEHOLDER`, dropped 2026-10-22.

**The joiner.** A resting C4 rides the join envelope (PF-28, research 231 §2) as any charge: the flag is the record's,
which the room flies and the joiner's page reads from its own kit table, not the wire's -- nothing is added to
`JoinWire` (protocol 10; `roomJoin.test.ts`, "a joiner's envelope carries a resting C4 as any charge ..."). The
acceptance row's "reset/rejoin of a live flagged projectile" (194 §7; 198 §4.4).

**The script producer** (`EXPLOSION_SCRIPT_FLAG_READING`, note only). `FUN_003c82f0` sets the same bit, from
`FUN_0025ccb0` D:L107319: a script-created explosion (a FIRE_WEAPON command) can carry it -- "their flags should be
represented explicitly rather than inferred from an ammo label" (194 §7). The port's scene-run explosions (`bombBlast`,
the bridges' FIRE_WEAPON under PF.R32) carry no flag; owed: the writers of that call's argument.

## 3. `Volitile`'s callback and its gates

PF-36 (ruling PF.R56; research 194 §9 A21, with W2-B's cross-review folded in there). Every line below was re-read at
the decompilation (`socom2_game.elf.decomp.c` r0001) for this note; the grade stays **reading**.

**The field.** `FUN_003d4400` D:L326522-326525 reads ammo `+0x28 & 1`, the loader's bit for a bare `Volitile` (the
disc's spelling). Of the 39 `ZAMMO` rows only **`Claymore Ammo` (17)** and **`PMN Ammo` (44)** carry it -- the fixture's
`zweapon.rdr`, `projectile.test.ts` ("Volitile is read as a bare field: ..."); C4's, the M67's, the HE's, the AN-M8's
and the Mark141's rounds do not. The port reads it off the `AMMO_TYPES` round as PF-35's `IgnoreExplosionDI`, a presence
test (`ThrowableRecord.volatile?: true`, `throwableRecord`'s line after `IgnoreExplosionDI`'s); the baked `CLAYMORE`
transcription carries it, since it must equal the file's record.

**The bind.** `FUN_003caf60` L320625-320646 uses the bit to configure the model and bind the projectile at the model's
damage-interface field through `FUN_003158b0` (the node's `+0x94`, L215134); the bind's third argument is 0 -- "not a
demonstrated blanket recursive bind to every child" (194 §9). That is the projectile's bind; a scene destructible's
node is bound by `FUN_002740e0` D:L121213 with the third argument 1, which walks the node's subtree (D:L215135-215166;
213 §5). `FUN_003cb8a0` L320887-320891 constructs the interface with
the projectile as its owner: vtable 0x4083f0 (`CProjectileNodeEx`), whose `+8` hit callback `FUN_003d4b80` forwards to
`FUN_003c69c0` (L326966-326970).

**The callback** (`FUN_003c69c0`, D:L318195-318227; the target `param_1`, the incoming projectile `param_3`):

| gate | source | the port |
|---|---|---|
| `GetDamage(1.0, incoming, target+0x54)` nonzero | L318206-318207 | `volatileQueues(base)` on the base at the charge (below) |
| the target's state `+0x0a` not 5 or 6 (going off) | L318208-318214 | `VOLATILE_STATE_GATE_READING`: not `'detonated'`/`'removed'`, no `trigger`, not already queued |
| offline, or the target's `+4` bit 3 (the local owner; writers D:L474035-474037, L479350-479364) | L318214 | the room is the one authority (`VOLATILE_SENDER_GATE_READING`, note only) |
| state `+0x0a = 3`, stage `+8 = 2` | L318215-318216 | the room's queue (`Flying.queued`), `trigger` at the next frame |
| online, `002c1420` when `+4` has 0x08 and 0x04 and not 0x10 and subtype `+9` is not 1 or 2 (unsigned: 0 passes) | L318217-318221 | the `detonate` event to every page (the room's broadcast; `VOLATILE_SENDER_GATE_READING`) |

**GetDamage's 1.0** (`FUN_003c7600`, D:L318644-318830; the brief's transcription). The function first takes the
incoming's state: 5 or 6 (going off, D:L318701-318708) is the explosion branch -- `Explosion_Damage` (`FUN_003d4510`) +
the weapon's `Damage_Modifier`, by the distance over `Explosion_Radius`: 0 past it, linear from half of it
(D:L318708-318736); else the round's branch -- `ImpactDamage` (`FUN_003d4530`) + `Damage_Modifier`, full to
`Effective_Range` and linear to 0 at `Maximum_Range` (D:L318737-318762). Then **`if (base == 0.0 || base < param_1)
base = 0; else base = FUN_003c5950(base)`** (D:L318763-318767; `FUN_003c5950` L317012-317016 is `x 14.0`): the first
argument is a **minimum on the base before its x14**, not a test of any nonzero raw damage (194 §9: "keep its
returned-nonzero predicate rather than substituting final damage >= 1"). After it, a claymore's (type 0x99) damage is a
32nd outside its cone (D:L318770-318781) -- which leaves it nonzero -- and a backblast's (0x9f) is 0 offline and 0
outside its cone online (D:L318784-318828). So `VOLATILE_MIN_DAMAGE_READING = 1` and the port's predicate
`volatileQueues(base) = base !== 0 && base >= 1`, `base` the port's damage law at the charge over `DAMAGE_SCALE`:
`bulletDamage(record, distance) / 14` for a round (null past `Maximum_Range` is 0), `fragmentDamage(Explosion_Damage +
Damage_Modifier, Explosion_Radius, distance) / 14` for a blast. The M4A1 (2.3 + 0.3, full to 6000 units, 0 at 10000) queues
a claymore to about 8460 units, where its base falls to 1.0; a round whose base falls under 1.0 queues nothing (`roomVolatile.test.ts`, the zero-damage test, on
a 100-unit test rifle: 0.6 at ~88 units).

**A finding against the dispatch.** The dispatch's blast test read "one outside a claymore's cone does not". By
`FUN_003c7600` the claymore's 32nd follows the 1.0 minimum (D:L318770-318781 after D:L318763-318767): a PMN 100 units
behind a claymore takes 16 / 32 x 14 = 7, nonzero, and **is** queued. The port follows the source: the cone does not
bind a charge (the backblast's still does, `backblastReaches`), and the test's title says so ("one behind a claymore's
back still does ..."). Unlike `sceneBlast`'s PF.R11 stand-in, where "the claymore's 1/32 is taken as no reach" stays.

## 4. The port's dispatch and the chain

**The two dispatches.** Both the direct impact (`FUN_003c8920` D:L319417-319418) and the explosion's target walk
(`FUN_003c7dd0`, raw 0x3c7e74-0x3c7e8c, after `FUN_003c80e0`'s visibility; the decomp's `(**(code **)(*piVar2 + 8))()`
on node `+0x94` at its `+0x1c` target) call the interface with the incoming projectile. The room's two are:

- **A round** (`Room.fire`): once the round's walk is done (the bodies, the world, a scene destructible that takes it,
  MAP-06), each resting volatile charge whose sphere of **`CHARGE_HIT_RADIUS_PLACEHOLDER` = 5 units** (`raySphere`,
  `@s2u/scene`) the round enters **before where the walk stopped** -- the surface it stopped at, else the range spent --
  is struck, nearest first: `chargeHit(f, bulletDamage(record, distance) / 14, shooter)`. A muzzle inside the sphere
  strikes it only facing it (the direction's dot with centre minus muzzle at or over 0): a prone shooter at his charge
  firing away does not set it off. **The charge is no surface of the walk** (`CHARGE_ROUND_PASS_READING = 'passes
  untouched'`): it neither cuts the round's range (`penetrate`'s 0.97 for a body) nor stops it, so the round ends at
  the next real surface and the `shot` event's `to` names that surface, never the charge (the fix round of the review
  of d76fc4ac: as an extra surface of the walk at `BODY_PENETRATION`, a range cut short past the charge made it the
  path's `hit` -- a bodiless shot ending on the charge with no material). `roomVolatile.test.ts`: "a round that hits a
  charge continues to the wall behind it; ...". A charge is no body: not in `bodies`, no `shot.body`, no hit counted (`countShot`, PF.R20), no combat
  report. Where the charge is now -- a resting charge does not move, so the rewind does not apply.
- **A blast** (`Room.blast`), after the players' loop and before `sceneBlast`: each other resting volatile charge
  within `Explosion_Radius` of the point, the backblast's cone applied (`backblastReaches`), the line from the blast's
  lift (`sightFrom(point, charge)`) to the charge clear of the hull -- skipped for IgnoreExplosionDI, as the players'
  `seen` is (PF-35, §1) -- is `chargeHit(f2, fragmentDamage(...) / 14, owner)`. The distance is to the charge's centre
  (the bounds owed with the sphere). No friendly-fire gate: the callback has none, the charge is no body.

**`chargeHit`** (`room.ts`): `volatileQueues(base)`, the charge volatile, at rest, not triggered and not queued -- else
nothing; then `queued` and **`{ type: 'detonate', pid, by }`** to every page (`by` the shooter, or the blast's owner,
null for a departed one).

**The chain's timing** (`VOLATILE_CHAIN_TIMING_READING = 'next game frame'`). `flyGrenades` turns every `queued` into
`trigger` (`+0xc4`, the Detonator's and the proximity trip's queue: `FUN_003c8740` "the next tick detonates it") at the
**start** of each game frame, and `stepGrenade` explodes it in that frame. So a charge hit by a round goes off on the
next frame (`fire` is decided before `flyGrenades` in the room's step), and a chain moves **one frame a link whatever
the flying list's order** -- setting `trigger` inside `blast()` would let a later list entry go off in the same frame
and an earlier one a frame later. `chargeHit` only marks: the chain's blast runs from `flyGrenades`, never inside
`blast()` (no re-entrancy). The source's own state-3-to-explosion timing and chain order are owed (§7).

**The credit** (`VOLATILE_CREDIT_READING = 'charge owner'`). The queued charge's blast is its own `blast(f, point)`,
with its own `thrower(f)`: its kills are its owner's, as a Detonator's are; the shooter and the first blast's owner get
nothing; a departed owner's charge kills as `'orphan'` with his name (m-13 of review 2). The original's credit for a
chained detonation is unread.

**Once** (`VOLATILE_STATE_GATE_READING`). A charge queued, triggered (a Detonator, a proximity trip), detonated or
removed is refused: a round and a blast on the same frame, a Detonator plus a round, a proximity trip plus a blast each
give one `blast` (a spy on `Room.blast` in `roomVolatile.test.ts`). The queue is per flying entry: a new round's
`clearAir` takes it with the air.

**The page.** `GrenadeThrower.tagOwn(kind, from, pid)` names the page's own copy (the room's `grenade` broadcast skips
the thrower, so its copy has no pid until the room's **`{ type: 'placed', pid, kind, from }`** to the thrower alone,
sent by `throwGrenade` and `placeCharge` after the broadcast: `OWN_PID_READING`, a port rule); `detonateRemote(pid)`
sets a resting copy's `trigger`, so its next frame's step explodes it through `explode` -- the sound, the scorch, the
smoke and the explode listener (a live event, not a hydrate); an unknown pid is ignored. `joinState.ts` needs nothing:
a queued charge is a resting one for one frame; a joiner at that frame sees it detonated the next. `OWN_PID_READING`
also gives the owner's page a pid for its own projectiles, which PF-28's "a rejoin's own projectiles" gap (research 231
§2, `ownProjectiles`) could use -- not built on here.

## 5. The wiring (LANDED: sprint 30 wave 4, on ONE-WIRE's shared modules)

PF-35 owes none (no held file is touched). **PF-36's is LANDED**, once: the `netPage.ts` page side first (the commit
`feat(web/net): netPage -- the drop/taken/kit and placed/detonate cases`), the page wiring in sprint 30's wave 4 (the
commit `feat(web/viewer): sprint 30 wave 4 -- PF-34/36/37's hooks in PART_DEPS and the test room's deps; takeKit in
MatchFirearm`) on ONE-WIRE's modules (research 222). The twin this section first owed (`main.ts` plus a
`matchMount.ts` copy of empty stand-ins, PF.R53) is gone with ONE-WIRE: the two hooks are the throwables' part's,
listed once, and the front end's switch (`./matchCore` `FRONT_END_CAPABILITIES.throwables` false) refuses them -- no
stand-in, `NetPage`'s own `?.` skipping the dep it was not handed. The gap this section recorded (the owner's copy of a
claymore not going off, the others' copies ignoring `detonate`) is closed on `/testroom`. Line numbers are the wave 4
commit's.

| owed line | where it landed |
|---|---|
| `NetPageDeps.tagOwnProjectile?(kind, from, pid)` and `detonateProjectile?(pid)` | `netPage.ts` L66, L68 (the page side's commit) |
| the event switch's `case 'placed'` and `case 'detonate'` | `netPage.ts` L1158-1159 (the page side's commit) |
| the two hooks owned by the part -- one line | `matchNet.ts` L64 `PART_DEPS.throwables: ['remoteGrenade', 'ownProjectiles', 'tagOwnProjectile', 'detonateProjectile']`: owed by a page whose switch has the throwables on, refused at run time and in the typecheck (`PageDeps<C>`) from one that has them off; nothing in `PART_DEFAULTS` or the shared literal |
| `main.ts`'s deps after `ownProjectiles` | `main.ts` L1940 `tagOwnProjectile: (kind, from, pid) => grenade.tagOwn(kind, from, pid),` and L1941 `detonateProjectile: (pid) => grenade.detonateRemote(pid),`, in `connectNet`'s `matchNetDeps` call |
| ~~`matchMount.ts`: `tagOwnProjectile: () => {}`, `detonateProjectile: () => {}` (asymmetric)~~ | **not needed**: the front end's switch has the throwables off; it hands neither and is refused both (a late joiner's projectiles go through `remoteGrenade`'s empty default, as before; there is no separate late-join capability) |
| ~~`matchMount.test.ts`'s pins of the twin~~ | in ONE-WIRE's shape (below) |

**The tests.** The page's (landed with `netPage.ts`): `netPageRound.test.ts` "placed and detonate reach the deps
(tagOwnProjectile, detonateProjectile); an older room sends neither and nothing changes", beside "a page built without
tagOwnProjectile or detonateProjectile ignores placed and detonate (each dep optional)". Wave 4's: `matchNet.test.ts`
"sprint 30 wave 4: PF-36's tagOwnProjectile and detonateProjectile are the throwables', PF-34's drops and kitChanged
the world drops' -- owed by /testroom and handed on, refused from the front end", its typecheck line (the front end
handing `detonateProjectile` is an error) and "sprint 30 wave 4: /testroom hands PF-36's two charge hooks and PF-34's
drops and kit; the front end none (its switch has both parts off)" (the two `main.ts` lines as text);
`matchMount.test.ts` "PF-34 / PF-36: the front end mounts no throwables and no world drops (its switch), so no hook of
its own; /testroom hands all four". PF-28's pin (`matchMount.ts` names no `ownProjectiles`) still holds. The dep is
`tagOwnProjectile`, not `ownProjectile` (the dispatch's name): one letter from PF-28's `ownProjectiles` was a trap (the
review of d76fc4ac).

## 6. Readings and placeholders

| name | where | status |
|---|---|---|
| `IGNORE_EXPLOSION_DI_READING` | scene `projectile.ts` (`room.ts` `blast`, `sceneBlast`) | `'both blast consumers'`: `FUN_005a0e70` D:L459192-459193's veto and `FUN_003c80e0` D:L319096-319143's material loop, nothing else (§1-§2; was research 94's *note only* row). Owed: capture B (C4 on a barrier with a SEAL behind it: projectile `+5`, the queued ray's hits and the damage recorded) |
| `EXPLOSION_SCRIPT_FLAG_READING` (*note only*) | -- | a FIRE_WEAPON's explosion may set the bit through `FUN_003c82f0` (caller `FUN_0025ccb0` D:L107319); the port's scene-run explosions carry none. Owed: read (the writers of the call's argument) |
| `MATERIAL_ATTENUATION_PLACEHOLDER` (*note only*; named in viewer `sceneHealth.ts`'s doc) | -- | resolved 2026-10-16 (AD-5, 209 §13-§14): the collision-material loop of `FUN_003c80e0` is read (D:L319096-319143; the target node and its `+0x94` object's nodes skipped, D:L319104-319108) and built as `blastLine` / `reachGate`, which the room's `sceneBlast` takes; the flag skips it. *Was*: the port did not have it, `SCENE_BLAST_REACH_PLACEHOLDER`'s clear line stood in for it |
| `VOLATILE_READING` | scene `projectile.ts` (`room.ts` `fire`, `blast`, `chargeHit`) | `'damage queues a detonation'`: ammo `+0x28 & 1` (`FUN_003d4400` D:L326522-326525; Claymore Ammo 17, PMN Ammo 44), the interface bound (`FUN_003caf60` L320625-320646), its callback `FUN_003c69c0` reached by a round and a blast (§3-§4; was research 94's *note only* row, resolved there). Owed: capture B (a claymore shot, a PMN in a blast) |
| `VOLATILE_MIN_DAMAGE_READING` | scene `projectile.ts` (`volatileQueues`; `room.ts` `chargeHit`) | `1`: GetDamage's minimum on the base before its x14 (`FUN_003c7600` D:L318763-318767; §3); the base by the port's `bulletDamage` / `fragmentDamage` over 14. Owed: the incoming point the original measures from (the projectile node's) |
| `VOLATILE_STATE_GATE_READING` | scene `projectile.ts` (`room.ts` `chargeHit`) | `'not detonated, not triggered'`: states 5/6 refused (L318208-318214) as `'detonated'`, `'removed'`, `trigger` or the room's queue. Owed: capture B (a simultaneous fuse, hit and Detonator) |
| `VOLATILE_CHAIN_TIMING_READING` | scene `projectile.ts` (`room.ts` `flyGrenades`) | `'next game frame'`: the queue becomes `trigger` (`+0xc4`) at the next frame's start, whatever the list's order (§4). Owed: the source's state-3-to-explosion timing and chain order (194 §9 L209; 198 §4.1 WP11) |
| `VOLATILE_CREDIT_READING` | scene `projectile.ts` (`room.ts` `blast`) | `'charge owner'`: the chained blast is the charge's own, its owner's kills; the shooter nothing; a departed owner's 'orphan' (§4). Owed: read or capture B (the original's credit for a chained detonation) |
| `VOLATILE_SENDER_GATE_READING` (*note only*; named in server `room.ts` `chargeHit`'s doc) | -- | the online local-owner gate (`+4` bit 3, L318214) and the sender gates (`FUN_002c1420` on `+4` 0x08 and 0x04 set, 0x10 clear, subtype `+9` not 1 or 2, L318217-318221): the room is the one authority and tells every page (§3). Owed: capture B (online replication of a chained detonation) |
| `CHARGE_HIT_RADIUS_PLACEHOLDER` | scene `projectile.ts` (`room.ts` `fire`) | `5` units: the sphere about a resting charge a round must enter; a muzzle inside it strikes only facing the charge (§4). Owed: the claymore's and the PMN's model bounds and the original's collision surfaces that reach the interface ("geometry reach owed"; capture B) |
| `CHARGE_ROUND_PASS_READING` | scene `projectile.ts` (`room.ts` `fire`) | `'passes untouched'`: the charge is no surface of the round's walk -- no range cut, no stop; the round ends at the next real surface (`shot.to`), no hit counted (§4). Owed: read (whether `FUN_003c8920` stops at, or is slowed by, the charge's node) |
| `OWN_PID_READING` | viewer `grenade.ts` (`tagOwn`; `room.ts` `throwGrenade`, `placeCharge`) | `'placed event'`: the room tells the thrower or placer alone its pid; the page tags its own copy by kind and launch point -- a port rule, no original counterpart (§4); the wiring owed (§5) |

## 7. Owed

- Capture B (owner list 5, an addition): a C4 on a Vigilance barrier with a SEAL behind it and a wall-adjacent target
  -- the body's `+5` byte, the queued ray's hits and the damage recorded (194 §7's runtime certification).
- The blast ray's hit record (`FUN_0031dd90` D:L319056): which surfaces it holds, one per model or node
  (`REACH_HITS_READING`, 209 §14). *Was*: the material loop's order and exclusions, owed until the port grew the loop
  (AD-5 read them: `blastLine`, 209 §13).
- The script producer's writers (`EXPLOSION_SCRIPT_FLAG_READING`).
- PF-36, capture B (owner list 5, additions): a claymore left by a quitter and shot by another (the owner departure);
  two claymores side by side, one shot (the chain's order and its frame gap); a PMN in a grenade's blast; a fuse, a
  round and a Detonator on the same frame -- each recording the target's state `+0x0a` and stage `+8`, its `+4` owner
  flags and the hit callback (194 §9's original sequence). They settle `VOLATILE_CHAIN_TIMING_READING`,
  `VOLATILE_CREDIT_READING`, `VOLATILE_STATE_GATE_READING` and `VOLATILE_SENDER_GATE_READING`.
- PF-36, the geometry reach (`CHARGE_HIT_RADIUS_PLACEHOLDER`): the claymore's and the PMN's model bounds and which of
  their collision surfaces reach the interface (`FUN_003caf60`'s bind, third argument 0: not every child) -- a disc
  read of the models the fixture lacks; and whether a round stops at the charge (`CHARGE_ROUND_PASS_READING`).
- ~~PF-36, the wiring (§5)~~ LANDED in wave 4, once, in ONE-WIRE's modules (§5); still owed: the gate's browser run of
  a claymore shot in the room going off on its owner's page and the others'.

**The regression (sprint 30's browser gate, `remoteCombat.spec.ts:422`, 2026-10-06).** Test 3 failed twice, the same
way: on ALPHA's page BRAVO's claymore went off when CHARLIE fired his Detonator. **Root cause: not an ownership fault but
PF-36's chain** -- the spec sets the two SEALs' claymores down 20-40 units apart (CHARLIE stands in BRAVO's clear view,
`meet()`), each facing away from the other; CHARLIE's Detonator sets off his own only (`Room.detonate`, by owner, held),
and its blast meets BRAVO's charge inside its 250 with the line clear: behind the claymore's back the damage is a 32nd,
which follows GetDamage's 1.0 minimum (§3, D:L318763-318781) and stays nonzero, so the room queues BRAVO's charge and
tells every page `detonate`, by CHARLIE (§4) -- exactly ruling PF.R56's "two claymores side by side chain". The spec
was written before PF-36, when no blast reached a charge; the dispatch's own reading ("outside a claymore's cone does
not") would have kept it green, the source's does not (§3's finding). Neither the room nor the page was at fault: a
`pid` is the room's one serial per round across every owner (PF-28), `tagOwn` touches only the page's own pid-less
copies (`!remote`), and the Detonator path never calls `chargeHit`; NET-FIX2/3's stale give-back and backlog replay
touch neither (a charge and the Detonator are not timed requests: never `stale`, never replayed). **What the unit tests
missed:** a third player -- every PF-36 room test had one owner's charges or a shot, never another seat's Detonator with
its own claymore going off beside them. Now held: `roomVolatile.test.ts` "three seats: CHARLIE's Detonator sets off his
own claymore only ..." (the owner scope, his charge beyond the chain's reach) and "three seats, the gate's layout: ..."
(the chain reproduced, by CHARLIE); `grenade.test.ts` "a detonate for one pid fires only that copy; tagOwn never tags
another owner's copy ...". The spec's test 3 now holds what is true under PF.R56: BRAVO and CHARLIE each lay one
claymore (the review's finding: BRAVO's second placement never landed because his FIRST claymore, set off about 5 u in front of him, killed him -- the port's `resolveBlast` with the 1/32 rear-arc record kills an unarmoured SEAL just behind his claymore in ~90% of draws (12-13 fragments x 7 against an 8 HP head) and `matchFirearm` drops a dead SEAL's trigger, while `selectEquipment` and the `ready` poll have no alive check; the pouch holds four claymores, so it was never a count. Whether the original's 1/32 leaves the placer dead that often is a parity question for capture B), CHARLIE's Detonator sets off his own on every
page (the others' through `launchRemote`'s owner test) and its blast sets off BRAVO's by the room's chain (`detonate`
by CHARLIE on every socket, once; each claymore one blast on every page); another player's Detonator alone leaving a
charge is held by the unit tests above. For the controller: if the owner rules the claymore's back is no reach for a
charge (the dispatch's reading), that is a one-line change in `Room.blast` (`claymoreCone` before `chargeHit`) and
§3's finding retracted -- not made here.
