# 398 -- One bullet across several parts of one body: every limb bone entered is damaged, and the first head or trunk hit ends it

- Date: 2026-11-10. From the second-reader pass over the unconfirmed readings (the owner's word in the Fable seat on the
  Shadow PC, 2026-11-09: a whole-repository review of unconfirmed readings, confirmed where possible and ranked by
  concern). Branch `agent/fable-findings`. The port was read at `agent/mega` `a45cdde96`.
- Track: simulation. A finding only: nothing in the port is changed by this note.
- Status: **reading** -- re-read by a reviewer who did not write it (seat f7's fresh re-read, 2026-11-10, relayed by
  seat 99: PASS WITH FINDINGS, high on the decompilation, medium on the two ELF evidence kinds; the core holds; its
  four findings are section 13). Before that it was read at the source by two fresh readers who wrote none of the code
  (the room batch's reader, then a single-question deep read that tried to refute it), and the guard and its setters
  (section 4) a third time by the pass's controller. Nothing here is measured running: the capture of section 8 is
  owed and queued. The owner's ruling OT.R119 (2026-11-10, seat 99: "follow the source") has it built to the original,
  test-first, after the mega release.
- What it contradicts: `BODY_ONE_SURFACE_READING = 'per body'` (match `src/room.ts`), research 91 section 1.3's "one hit
  per actor per round", and research 219 row 307 / research 101 row 900's "walks each node polygon crossed".
- Evidence kinds, kept apart: **(D)** the r0001 decompilation `socom2_game.elf.decomp.c`, cited `FUN_<addr>` and
  `D:L<line>` (source inspection); **(E1)** the r0001 ELF's machine code for two routines the decompilation does not hold
  and the VU0 microprogram the box test runs; **(E4)** the r0004 ELF, each routine compared word for word with its r0001
  twin, r0004 addresses named. No capture. No decompiled or disassembled text is pasted.
- The records behind it (not exported publicly): `docs/plans/reviews/2026-11-10-fable-seat/second-reader/`
  (`R2-ROOM-1.md`, `DEEP-BODY-SURFACES.md`, `CAPTURE-SPEC-LIMB-TRUNK.md`).


## 0. The answer: contradicted

The port's `BODY_ONE_SURFACE_READING = 'per body'` (one damaging surface a body a round) is not what the original
does. The unread part -- the query -- does not rescue it: **the query returns one record for every bone box the line
enters, on every body, and the walk hands every one of them to the damage code, nearest first, in one update.**

**The original's rule (both builds), exactly:**

1. A bullet is one line from the muzzle, `Maximum_Range x 1.1` long, cast once and walked once; the round is dead after
   that update.
2. Every skeleton bone of a body carries **one box** (its node's bounding box, PERSON material). The line's query holds
   **at most one record a bone box: the point where the line enters it from outside** (none when the line starts inside
   it). So a body gives as many PERSON records as bone boxes the line enters -- not one a body, not one a polygon, not
   an entry and an exit.
3. The walk takes the records **nearest first** (each strictly farther than the last, inside the range left), the
   shooter's own skipped. For **each** PERSON record it calls the victim's weapon-hit handler and then cuts the range:
   `range <- min(range, (range + range x piercing x 0.1) x 0.97)`; it goes on unless that record now lies past the range.
4. The handler's damage, for each record: nothing if this round is the one the victim remembers (`+0x1048`); else by
   the record's bone --
   - `head`, `neck`: HEAD takes the damage, **the round is remembered**;
   - `spinehi`, `spinelo`, `hips`: BODY takes the damage, **the round is remembered**;
   - `rbicep`, `rforearm` (RARM), `lbicep`, `lforearm` (LARM), `rthigh`, `rcalf` (RLEG), `lthigh`, `lcalf` (LLEG):
     that limb takes the damage, **the round is not remembered**;
   - any other bone (hands, feet, toes, scapulas, shoulder weights, the root): nothing, not remembered.
5. The damage of each application is the **same number** for every record of that victim in the walk (it is computed
   from the round and the victim's position, not from the hit point and not from the range left): full, not reduced by
   the cut. Each application goes through its own part's armour step.

So: **limb bones before the trunk or head each damage, then the trunk or head damages once, and everything behind it on
that body is spared.** Forearm then chest: arm and body. Bicep and forearm of one arm: that arm twice. Thigh, other
thigh: both legs. Chest then arm: body only. Head then anything: head only.

---

## 1. The query

**Who builds the list.** The round owns a query record (`round+0x28`). Each update `FUN_003ca5a0` queues it in the
world's batch as a line from the round's position to its next position (`FUN_0031dd90` D:L219870-219900, called
D:L320425-320435) and names the shooter's node as the object to leave out (`FUN_0031dd60` D:L219854-219865). The batch
(`FUN_0031de30` D:L219905-219911 -> `FUN_002d3cf0` D:L175411-175731) walks the grid cells the lines cross and gives
each object in them, once, to `FUN_002d3030` -- the object's attached nodes first, then the object (D:L175686-175710).
The record: count at `+0x34`, capacity at `+0x38`, the hits at `+0x48`, 32 bytes each (`FUN_002dc6e0`
D:L180515-180534): the point, the polygon at `+0xc`, the normal at `+0x10`, the node at `+0x1c`. The rounds' records
are made with room for 40 or 128 hits (D:L321901, D:L321913; which pool a bullet takes I did not settle --
D:L319294-319298 releases a line round's to one pool and the others' to the other).

**What `FUN_002d3030` does with one node** (D:L174995-175406), for a line query:
- the node must be active and flagged as holding collision (D:L175073-175074); the query's left-out node and anything
  under it is skipped (D:L175078-175082 with the early exit D:L175102 and the clean-up D:L175396-175403) -- the shooter's
  own body never enters the list;
- the line is put in the node's frame (D:L175248) and refused when both ends lie outside one face of the node's own
  bounding box (`FUN_003124f0` D:L213172-213244) -- **but a node with bit 6 of `+0x5f` set is never refused by its own
  box** (D:L213184), and the actor's constructor sets that bit on the skeleton root and everything under it
  (`FUN_00314100` D:L214104-214161, called D:L419728) and gives the node above the root one fixed box, 24 x 20 x 28
  (D:L419730-419742). So a body is culled as a whole by that one box and never bone by bone;
- then **every collision polygon of the node is tried in list order** (D:L175291-175380): a polygon that is hit writes
  the next free record with the point, the normal, the polygon and **this node** (D:L175353-175371). After a hit the
  node's remaining polygons are skipped when bit 0 of the node's `+0x80` is set (D:L175276, D:L175372), and the node
  constructor sets that bit (`FUN_00316e30` D:L215827). So: **at most one record a node, the first polygon hit in list
  order** -- not the nearest, not every crossing;
- then the node's children, each the same way (D:L175383-175390).

There is no test anywhere in it of "this actor already has a record": the unit is the node.

**How a PERSON's parts are in it.** `FUN_0058b960` (D:L447559-447593, called from the actor's constructor D:L419726)
goes over the skeleton's bone list and, for every bone whose index is under the bone count less four (the count is 32
in both ELFs: r0001 word at 0x3de1e8, r0004 at 0x4093a8), gives the bone's node **one collision polygon of the box
class** pointing at that node's own bounding box (`FUN_0031aec0` D:L218167-218192; the class's table is at 0x406670)
and sets the node's polygons' material to the one named `PERSON` (`FUN_0031ae30` D:L218147-218162; the name at
0x65d1e8, read from the ELF). The indices: the root is 0, five weapon slots (`rifle`, `pistol`, `grenade`, `weapon`,
`rifle_out`) are 28-32, and every other bone name takes the next of 1-27 the first time it is met (`FUN_0058cc30`
D:L448354-448403, `FUN_0058cb30` D:L448317-448349). So the hit volumes are **the bones' boxes, one a bone**, the damage
bones and the others (hands, feet, toes, scapulas) alike.

**The box's test** (E1; r0001 0x2dcda0-0x2dd01c, the box class's slot `+0x14` at 0x406684; not in the decompilation).
It first refuses a line whose two ends lie outside the same face (0x2dcda0-0x2dcf44). Then it loads the box's two
corners and a mode word -- 0 when the node is two-sided (`+0x80` bit 1), 0xe0 otherwise (0x2dcf48-0x2dcfbc) -- and runs
the VU0 microprogram's entry 0x30 (0x2dcfdc), which is micro 83-277 of the program at r0001 0x3d7550 (the same program
research 281 s4.3 read for the hull's polygon). Read from those micro instructions: it tries the six faces in the order
+y, +z, +x, -z, -x, -y; with the mode word 0xe0 a face is tried **only when the line's start lies outside that face's
plane** (micro 84-98, 122-127, 151-157, 181-187, 211-217, 241-247); a tried face is a hit when the line's crossing of
its plane lies inside the face's rectangle (micro 100-121 and the five like it); the first hit ends the routine with
the crossing point, the face's outward normal and a flag (micro 274-277), and the EE routine returns "hit" on the flag
(0x2dcfec-0x2dd010). For a start outside a convex box the only such face is the one the line enters by; a start inside
the box hits nothing. A bone node is not two-sided: the constructor clears bit 1 (D:L215828) and the only writers that
set it are the particle node's and the node above the actor's skeleton root (D:L227611, D:L419731), neither a bone.
So: **one record a bone box, at its entry point** -- no exit record, no second record for the same limb.

**The order they are handled in.** Not the list's order. `FUN_003c9b70` (D:L319922-320065) repeatedly picks, out of
the whole list, the record nearest to the line's start that is strictly farther than the one handled last and nearer
than the range left (D:L319966-320014; the test D:L319990-319995), skipping a record whose node has the shooter's node
among its ancestors (D:L319997-320008). With no such record it ends the walk (D:L320015-320018). A record whose
material's penetration is exactly 1.0 is passed without a call (D:L320021-320030); any other goes to the impact
routine `FUN_003c8920` (D:L320039) -- or, for the thrown and launched classes, to the bounce routine (D:L320031-320043).
The walk stops on the results 0, 1 and 4 and goes on otherwise (D:L320044-320055).

## 2. Does the round go on after a PERSON hit

Yes. In `FUN_003c8920` (D:L319342-319525), for a bullet:
- a record already past the range returns "stop" at once (D:L319410-319412);
- the struck node's handler is called on every call (D:L319417-319418); the same-body test (`round+0x78`,
  D:L319391-319407) only skips the impact effect, the noise and the two scene programs (D:L319420-319438,
  D:L319499-319505), as the earlier reader said;
- the end (D:L319506-319522): for a weapon that is not one of the two launcher classes (`FUN_003c5d20`
  D:L317260-317274) the range becomes `(range + range x piercing x 0.1) x penetration` when that is smaller
  (D:L319508-319513; the piercing is the ammunition's `+0x14`, `FUN_003d4520` D:L326638-326642; the penetration the
  material's `+0x24`, D:L319473-319476), and the result is "go on" unless the record's squared distance exceeds the
  new range squared (D:L319514-319517). The two launcher classes stop there (D:L319519-319521).

There is no flesh case: PERSON is a material like any other, its penetration 0.97 in the port's table
(`packages/scene/src/projectile.ts:434`, from `materials.rdr`; **the port's disc reading, not re-read by me**). So a
body stops a bullet only in the last 3 % of its range at piercing 0, and never from a piercing of 0.31 up. The cut runs
once for **every PERSON record** -- every bone box entered, the non-damaging bones' too.

**One frame.** The range starts at the weapon's maximum (D:L320679-320682). A weapon that is not one of six thrown or
launched classes makes a "line" round (`FUN_003d1e20` D:L324470-324485; the type set D:L320757-320759), whose next
position is its position plus its direction times the maximum range x 1.1 (D:L320383-320399). The update
`FUN_003c9fb0` runs the walk once (D:L320162) and then marks a line round dead (D:L320181-320183). So the limb record
and the trunk record are handled **in the same call of the walk, in the same update** -- the victim's once-an-update
clear of `+0x1048` (point 4) cannot fall between them.

## 3. The damage at each crossing

**The route, each record.** The handler is the listener the actor hangs on every node under its top node
(`FUN_003158b0` D:L215114-215160, D:L455755-455756; the listener's table 0x669570, D:L419460-419461). Its slot `+8` is
a three-instruction thunk (r0001 0x5b8260) that takes the actor out of the listener and jumps to the handler at
0x5ac670 with the hit record and the round (E1). The handler (E1, 0x5ac670-0x5aca04) has **no once-a-round test**: an
online gate on a routine I did not identify (the call at 0x5ac6a0), the friendly-fire gate (0x5ac6c8-0x5ac74c), a gate
on one weapon class with `FUN_003c6ed0` (0x5ac758-0x5ac794), the living test (0x5ac7a0-0x5ac7c4), and two gates by the
weapon's class byte against the shooter's team (0x5ac820-0x5ac8f8) -- none of them reads the victim's memory of the
round; then it copies the record to `actor+0x10e0..+0x10fc` (0x5ac914-0x5ac958) and calls `FUN_005ab850` (0x5ac964).
One call in it I did not follow: the actor's controller object's slot `+0x4c`, given the record and the round
(0x5ac7cc-0x5ac7e0); its result is not used by the handler.

`FUN_005ab850` (D:L464570-464669): returns at once when the round is the remembered one (D:L464597); arms the memory
itself only for an exploding round (below); finds the bone whose node is the record's node (D:L464604-464614) and, for
a bullet, calls `FUN_005abbc0` once with that bone (D:L464615-464617); then runs the reaction and death test
`FUN_005a54d0` (D:L464625-464646).

`FUN_005abbc0` (D:L464674-464803), online only for the shooter's own round (D:L464698): the branch by bone
(D:L464740-464766) calls `FUN_005a5a80(actor, part, round)` and, **for the head pair and the trunk three only**, stores
the round in `+0x1048` after it (D:L464741-464743, D:L464755-464757). The bone names behind the offsets, read from the
ELF: `+0x308` `head`, `+0x30c` `neck`; `+0x310` `spinehi`, `+0x2fc` `spinelo`, `+0x304` `hips`; `+0x320` `rbicep`,
`+0x324` `rforearm`; `+0x328` `lbicep`, `+0x32c` `lforearm`; `+0x318` `rthigh`, `+0x31c` `rcalf`; `+0x314` `lthigh`,
`+0x340` `lcalf` (the lookups D:L419606-419655, strings at 0x65c4c0-0x65c5b0).

**The number.** `FUN_005a5a80` (D:L461552-461648) takes the damage from `FUN_003c7600(0, round, actor+0x1c)` and the
piercing from the ammunition (D:L461587-461589 offline; D:L461612-461628 online, where it also sends the hit packet).
`FUN_003c7600` for a round that is not exploding (D:L318737-318768): the ammunition's and the weapon's damage summed,
full to the effective range and falling in a line to nothing at the maximum range, **by the distance between the
round's own scene node and the position it is given -- the victim's `+0x1c`** -- then x 14 (`FUN_003c5950`
D:L317014-317018). It reads neither the hit record nor `round+0x94`. Nothing in the walk moves the round's node between
two records. So **the limb's application and the trunk's are the same number**, each full; there are no per-part
multipliers. (Where the round's node sits I did not read; the port takes the struck distance instead -- an existing
reading, "in passing" 5.)

**The part.** `FUN_005a5830` (D:L461469-461547): a living head, arm or leg takes the armour step on its own health and
armour (`FUN_003c7400` D:L318570-318591: the armour takes `armour x (10 - piercing) / 10` off, loses a quarter of what
it took, the rest comes off the health); an arm or leg already at 0 passes 0.3 of the damage to the body at piercing 10
(D:L461488-461490; the words at 0x6508a8 and 0x6508b0); a body hit takes the step and then caps each limb at its
maximum x body / body maximum (D:L461492-461525). The port's `applyHit` already does all of this.

**Limb then trunk, one round, in sequence.**
1. Record 1 (say `rforearm`): handler -> `FUN_005ab850` (memory is not this round) -> `FUN_005abbc0` -> RARM takes D
   through its armour; memory untouched. Back in the impact routine: the range is cut; "go on".
2. Record 2 (`spinehi`): handler -> `FUN_005ab850` (memory still not this round) -> `FUN_005abbc0` -> BODY takes the
   same D through its armour, the limbs are capped, **the round is remembered**. Range cut again; "go on".
3. Any later record on that body (the other arm, `hips`, a leg): the handler runs, `FUN_005ab850` returns at
   D:L464597; nothing. The range is still cut.

**Online.** The victim's console applies each hit packet as it comes (`FUN_002bbbd0` D:L160807-160847 ->
`FUN_005a1b80` D:L459541-459581 -> `FUN_005a5830`); the packet carries the two actors, the weapon, the damage, the
piercing and the part and no round, and nothing on that path reads `+0x1048`. The shooter's console sends one packet
for each call of `FUN_005a5a80` (`FUN_005a1ff0` D:L459651-459659). So there is no second guard on the receiving side:
two calls, two packets, two applications.

## 4. Every setter and clearer of `victim+0x1048`; what `FUN_003c6ed0` tests

A scan of every load and store with the 16-bit offset 0x1048 in the code of both ELFs (`deep_scan_off.py`; a store
through a computed address would not show):

| what | r0001 | r0004 | decompilation |
|---|---|---|---|
| cleared in the constructor | 0x554afc | 0x559e24 | D:L419774 |
| cleared once an update, when not 0 | 0x550f90 / 0x550f9c | 0x5560f0 / 0x5560fc | `FUN_00550ef0` D:L418081-418082 (after the early return at D:L418074, on bit 6 of `+0x105c`) |
| tested, return when it is this round | 0x5ab8a0 | 0x5b1530 | `FUN_005ab850` D:L464597 |
| set for an exploding round | 0x5ab8e4 | 0x5b1574 | D:L464600-464602 |
| tested (the two guards at the top of the part routine) | 0x5abc20, 0x5abc68 | 0x5b18b0, 0x5b18f8 | `FUN_005abbc0` D:L464701, D:L464704-464705 |
| set after a class-'Q' hit | 0x5abdbc | 0x5b1a4c | D:L464737 |
| set after a head or neck hit | 0x5abdf0 | 0x5b1a80 | D:L464743 |
| set after a trunk hit | 0x5abea8 | 0x5b1b38 | D:L464757 |
| read by the AI's reaction | 0x57274c | 0x577b0c | D:L434384 |

The two other hits of the scan in r0001 (0x2be444, 0x60b8c4) are loads from fixed data addresses, not this field. No
store follows any of the four limb calls in either build.

**`FUN_003c6ed0`** (D:L318387-318399) answers whether the round's state byte (`+10`) is 5 or 6 -- the states of a round
that is going off. With the ammunition's `+0x18` above 0 (`FUN_003d4510` D:L326629-326633) that is the test at
D:L464600-464601: **an exploding round is remembered by every body it reaches, whatever the bone** -- not a
multi-pellet volley, as the earlier reader took it. The volley's guard is the class-'Q' branch of `FUN_005abbc0`
(D:L464703-464738: a 'Q' round does nothing to a body whose remembered round is also a 'Q' round's).

Rounds are pooled objects (D:L321046-321092), so a later round can have a dead one's address; the once-an-update clear
is what keeps the memory from sparing a body from it.

## 5. The reverse order: trunk first, then a limb behind it

The trunk record stores the round (D:L464757). The limb record behind it reaches `FUN_005ab850`, which returns at
D:L464597 before any bone is looked up. **The limb is skipped: no damage, no packet.** The impact routine still cuts
the range for that record and goes on. The same after a head or neck record. Between two limb records nothing is ever
stored, so the second limb bone is damaged whichever limb it belongs to.

## 6. r0004

Twins found by their opening words and compared word for word with data addresses and stack offsets masked:

| r0001 | r0004 | result |
|---|---|---|
| `FUN_002d3030` 0x2d3030-0x2d3cf0 | 0x2eff40-0x2f0c00 | 815 of 816 words equal, the one a data address |
| the box test 0x2dcda0-0x2dd020 | 0x2f9d90-0x2fa010 | 160 of 160 (mode word compared at r4 0x2f9f48, 0xe0 at 0x2f9f9c, the micro call at 0x2f9fcc) |
| the VU0 microprogram, 0x3d7550, its first 400 slots | 0x4026f0 | byte for byte equal |
| `FUN_0031aec0` 0x31aec0-0x31af70 | 0x3384d0-0x338580 | 44 of 44 |
| `FUN_0058b960` 0x58b960-0x58bab0 | 0x590f60-0x5910b0 | 83 of 84, the one the address of `PERSON` (r4 0x65d228) |
| `FUN_00316e30` (node constructor) | 0x3343d0 | equal but one data address; the two flag writes at r4 0x334468, 0x334478 |
| `FUN_003c8920` 0x3c8920-0x3c8f50 | 0x3eaab0-0x3eb0e0 | 394 of 396, the two data addresses |
| `FUN_003c9b70` 0x3c9b70-0x3c9fb0 | 0x3ebd00 on | equal but two data addresses and **one inserted test** (r4 0x3ebfc8-0x3ebfd0: one more weapon class, 0xb6, sent to the bounce routine); the same insertion in the update's twin (r4 0x3ec474) |
| `FUN_003c9fb0` 0x3c9fb0-0x3ca5a0 | 0x3ec150-0x3ec740 | equal but data addresses and that insertion |
| `FUN_003c7600` 0x3c7600-0x3c7ad0 | 0x3e9780-0x3e9c50 | 306 of 308, data addresses |
| `FUN_003c7400` | 0x3e9580 | 36 of 36 |
| `FUN_005ab850` 0x5ab850-0x5abbc0 | 0x5b14e0-0x5b1850 | 218 of 220, data addresses |
| `FUN_005abbc0` 0x5abbc0-0x5ac070 | 0x5b1850-0x5b1d00 | 297 of 300, data addresses |
| `FUN_005a5830` 0x5a5830-0x5a5a80 | 0x5ab3a0-0x5ab5f0 | 147 of 148, a data address |
| the handler 0x5ac670-0x5aca04 (thunk 0x5b8260) | 0x5b2360-0x5b2724 (thunk 0x5be830, listener table 0x668ef0) | equal but data addresses and **two inserted gates**, below |

The guard's loads and stores in r0004 are the table of point 4: tested at r4 0x5b1530, stored at r4 0x5b1574 (the
exploding round), 0x5b1a4c ('Q'), 0x5b1a80 (head), 0x5b1b38 (trunk), cleared at r4 0x5560fc -- the earlier reader's
three stores confirmed, and no store after the limb calls. **r0004 is r0001 for this question.**

The two gates r0004 adds to the handler, neither a once-a-round guard: the friendly-fire return is not taken when bit 4
of the round's flag byte `+4` is set (r4 0x5b243c-0x5b2448); and on the path that is not the 0x9f contact class, an
actor with bit 3 of `+0x105c` set takes nothing (r4 0x5b2600-0x5b2618). What sets either bit I did not read.

## 7. Verdict: CONTRADICTED

**What the port does** (`room.ts:5837-5852`, `room.ts:5819-5829`): one PERSON surface a body, at the nearest capsule
the ray enters (`rayBody`), the range cut once, and a `damaged` set that lets each body take one hit a round.

**What to build instead:** one surface for **each damage bone's volume the ray enters**, at its entry, the range cut at
each; in the walk's order, a body's memory of the round set by a HEAD or BODY hit only, and a hit refused only when
that memory holds this round.

**The failing tests an implementer can write** (a fresh SEAL: health `[8, 30, 30, 50, 30, 30]`, armour
`[0, 25, 25, 25, 25, 25]`; one single round, not a volley; D the round's quantised damage, P its piercing; the worked
numbers are for D = 40, P = 2, where the armour step lets 20 through and takes 5 off the armour):

- **A. Arm, then trunk.** A ray that enters the victim's RARM volume and then its BODY volume (the shooter level with
  the upper arm at the victim's right side, or in front of a SEAL whose forearm lies before the chest).
  Expected: **two applied hits, in order RARM then BODY, each D.** RARM 30 -> 10, its armour 25 -> 20; BODY 50 -> 30, its
  armour 25 -> 20; the body's cap then holds every limb to 30 x 30 / 50 = 18 (RARM stays 10, the other three limbs 18).
  The range cut twice. The port today: RARM 10 only; BODY 50; one cut.
- **B. Trunk, then arm** (the same line from the other side). Expected: **one applied hit, BODY, D**; the arm behind
  takes nothing. The range still cut twice.
- **C. Two bones of one limb** (a ray along the arm through `rforearm` and `rbicep`, the trunk missed). Expected: **two
  applied hits, both RARM**: 30 -> 10 (armour 20), then the armour takes 16, 24 through: 10 -> 0 (armour 16).
- **D. Head, then trunk** (a steep ray). Expected: one applied hit, HEAD.
- **E. Both thighs, side on.** Expected: two applied hits, RLEG and LLEG in the ray's order, each D.

The damage of each application is the port's own `bulletDamage` / `quantiseHit` number; in the original it is one
number for all of a victim's records in a walk ("in passing" 5).

**What makes it reachable**: every link above -- a box a bone, a record a box, every record handled nearest first in
one update, the round going on at 0.97, the memory armed by head and trunk only -- is read in the code of both builds.

**What only a capture can add** (it would raise this from a reading to proven; it is not needed to choose between the
two rules): two consoles, r0004, one single shot through an arm into the trunk of a standing enemy. Measure the
victim's six part healths (`actor+0xffc..+0x1010`) and armours (`+0x102c..+0x1040`) before and after, and count the
hit packets (message 0x40) the shot sends. Expected: the arm and the body both down, two packets. The same shot from
the trunk's side: the body only, one packet.

---

## 8. The capture that would settle it

Asked by the owner in the Fable seat, 2026-11-10 ("work with the shadow pc to schedule that as soon as it's not doing
release work"), and queued on the shadow PC's two-console r0004 rig (local Horizon, two PCSX2 clients) as the first run
after the mega release's own. The whole spec is `docs/plans/reviews/2026-11-10-fable-seat/second-reader/CAPTURE-SPEC-LIMB-TRUNK.md`.
In short: two consoles on opposite teams, a single-round firearm fired in single shots from well inside its effective
range at a standing enemy at full health and armour; before and after every shot the victim's six part healths and six
armours on both consoles and the round it remembers, with hit counts at the guard's test (r4 0x5b1530), the head store
(r4 0x5b1a80), the trunk store (r4 0x5b1b38) and the part routine (r4 0x5ab3a0). The health, armour and memory offsets
in this note are r0001's and are confirmed on r0004 through the part routine's twin before they are trusted.

| shot | the line | this note's reading expects | the port's `'per body'` expects |
|---|---|---|---|
| 0a | control: the chest only | 1 application, BODY | the same |
| 0b | control: one arm only | 1 application, that arm | the same |
| 1 | an arm, then the trunk (from the side, through the upper arm at the chest) | 2 applications, the arm then BODY, each the full damage | 1 application, the arm |
| 2 | the trunk, then the far arm | 1 application, BODY | 1 application, BODY |
| 3 | the head, then the trunk | 1 application, HEAD | 1 application, HEAD |
| 4 | both thighs, side on | 2 applications, the near leg then the far leg | 1 application, the near leg |
| 5 | two bones of one arm (optional) | 2 applications, the same arm twice | 1 application |
| 6 | point blank, the muzzle inside a limb's box (added by f7's re-read) | no record for that limb (a line that starts inside a box enters nothing, section 1); whatever lies behind it is hit as usual | 1 application, the nearest part |
| 7 | a hand only (added by f7's re-read) | no damage: a hand's box is a record and cuts the range, but its bone is not a damage bone (section 0, rule 4) | says nothing by itself: the port has no hand volume |

Shot 1 decides; shot 2 shows the order matters. Open on the rig when this was written: placing the two actors exactly
(their r0004 position and yaw offsets), and counting the hit packets (a count at the shooter's send routine,
`FUN_005a1ff0` at r0001, stands in for a wire capture).

**The rig's ruling (the main controller, redotcom-2f, 2026-11-11, relayed by seat 65; under the owner's delegation of
2026-11-09, resting on the owner's word quoted at the top of this section).** The shadow seat asked whether the rig
may place the two actors by writing their position and yaw (the patched PINE build, 0850db1ec, has memory writes and
the breakpoints the hit counts need; GR-1's tool reads only). The controller's words, verbatim:

> yes, the LIMB-TRUNK rig may WRITE the two actors' position and yaw with PINE. Conditions:
> 1. Our own local Medius only. Craig's standing word allows our server and two clients with no permission (H437 / OT.R103). Any PSRewired or other non-ours server is his to approve, so not on one.
> 2. Setup only: write before each shot, never during the shot or its resolution.
> 3. Every write logged with address, value, the tick or time, and the actor.
> 4. Record and file it as a SET-UP capture of the original. It proves what the hit path does from that state (which functions run, the part argument, the counts), not that a natural player reaches the pose.
> 5. At least one pose cross-checked with pad placement, counting only shots whose before/after healths show both parts crossed.
> 6. Count only clean shots under the break-and-resume, and report desyncs.

So the capture, when it runs, is a **set-up capture**: its record names every write, and what it shows is the hit
path's behaviour from the written pose, not that play reaches it.

## 9. The attempts to refute it, and why each failed

1. *The query keeps one record an actor, or only the nearest.* No: `FUN_002d3030` writes per node and never looks at
   which actor a node belongs to (D:L175291-175390); the only "first hit only" rule is per node (D:L175276, D:L175372).
   The bones are separate nodes, each with its own box (D:L447567-447578).
2. *A body's parts are one mesh on one node, so the first-hit rule leaves one record a body.* No: the damage code itself
   tells bones apart by the record's node (D:L464604-464614), and the boxes are put on each bone's node (D:L447573-447575).
3. *A box gives an entry and an exit, so a limb would be damaged twice by itself and the rule would be absurd.* No: the
   box routine returns one hit, and in the bones' one-sided mode only a face the line starts outside of -- the entry
   (E1 0x2dcf48-0x2dcfbc; micro 84-98 and its five likes).
4. *The round is consumed by the first body record.* No: the impact routine's end cuts the range and returns "go on"
   for any weapon but the two launcher classes (D:L319506-319521); PERSON's 0.97 is neither the 1.0 that would skip the
   call nor a value that ends the range.
5. *The handler has its own once-a-round test.* No: read whole in both builds (r0001 0x5ac670-0x5aca04, r4
   0x5b2360-0x5b2724); r0004's two extra gates are on the round's flag and the actor's state.
6. *The victim's update clears or arms something between the two records.* No: both are handled inside one call of the
   walk (D:L319966-320058).
7. *Online the victim's console drops the second packet.* No: its path reads no round and no memory
   (D:L160807-160847, D:L459541-459581).
8. *The second application is weakened by the cut.* No: the damage reads neither the range left nor the hit point
   (D:L318737-318768).
9. *Some other writer arms `+0x1048` on a limb hit.* No: the scan of both ELFs finds the stores of point 4 and no other.

## 10. Confidence, and the strongest reasons I could be wrong

**High** that the code does what is written above, in both builds. **Medium-high** that a player meets it: that needs
the disc's data to put a limb's box in front of a trunk's box on a line, which the code does not show.

- **The boxes' sizes are data I did not read.** A bone's box is its node's `bbox` from the model file (the port's
  research 78 s3 reads them as each part's mesh extent, `spinelo`'s empty). If the limb boxes were empty there would be
  no limb records at all -- but then no limb could ever be hit, and the game has limb damage.
- **Which bones are among the first 27 names** `FUN_0058cb30` meets I did not establish (it is the order the first
  skeleton's nodes are met). A damage bone past them would have no bone object, so no box and no damage. The thirteen
  damage bones are looked up by name and used as bones (D:L419606-419655), which presumes they are.
- **The scene walk reaching the bones** rests on node flags I did not trace up the chain (the "holds collision" bit on
  each ancestor, D:L175073-175074; `FUN_00313d60` D:L214007-214008 sets it on the node the polygon is added to).
- **Model-file collision polygons on a bone** (`di`, loaded by `FUN_00311330` D:L212519-212538) would sit before the
  box in the node's list; the per-node first-hit rule still leaves one record a bone, but its point could be another.
- **A full list.** A record holds 40 or 128 hits; world polygons met first in grid order could fill it before a body's
  bones are reached. Not followed.
- The VU0 micro reading is mine, from the instruction encoding as I know it; it agrees with research 281 s4.3's entry
  table (0x10 -> 288, 0x20 -> 336, 0x70 -> 279, 0x80 -> 364) and its reading of the flag delay. Note for whoever reads it
  next: the program is two VIF packets, the second header sits at file slot 256 (r0001 0x3d7d50), so micro addresses
  from 256 up are one slot later in the file.

## 11. Not read

- The bones' boxes on the disc; the order bone names are indexed in.
- Where a line round's scene node sits when `FUN_003c7600` measures from it.
- What sets bit 3 of `actor+0x105c` and bit 4 of the round's `+4` (the two r0004-only gates).
- The controller's slot `+0x4c` the handler calls with the record and the round, and the routine at 0x2c2fd0 behind
  the handler's first gate.
- `materials.rdr` itself (PERSON's 0.97 is taken from the port's table).
- Which query pool a bullet takes (40 or 128 hits).

## 12. Noticed in passing

1. `room.ts:5819` cites `+0x78` (D:L319398) as the source of "damaged once a round"; research 91 s1.3 line 111 and its
   table line 18 say "one hit per actor per round" on the same citation. `+0x78` gates only the effects; the damage
   guard is `+0x1048` (D:L464597), armed by head and trunk only.
2. Research 219 row 307 and research 101 row 900 say the original "walks each node polygon crossed". It is one record a
   bone node (one box, its entry), and the range cut is once a record -- so once for every bone box entered, the
   non-damaging bones' included (hands, feet, toes, scapulas, shoulder weights), which the port has no volumes for.
   Invisible from a piercing of 0.31 up.
3. `hitVolumes.ts` makes each damage bone a capsule fitted to its box. The original's volume **is the box**, in the
   bone node's frame, entered from outside only; and it narrows `spinehi`'s: the fourth float of its box (the maximum's
   first component) is held to 3.01 (D:L447580-447591). A separate reading from this one.
4. The earlier reader's "class-'Q' volley" for D:L464600-464602 is the exploding-round case (point 4); the 'Q' guard is
   D:L464703-464738, which the port's `shotgunGuard` already carries.
5. The original's bullet damage falls off by the distance from the round's node to the **victim's position**
   (D:L318741-318761), one number for every part; the port's `bulletHit` uses each surface's struck distance
   (`room.ts:6221`). Where the node sits is not read, so this is a question, not a finding.
6. r0004 sends one more weapon class (0xb6) to the bounce routine (r4 0x3ebfc8, r4 0x3ec474). Not a bullet's.

## 13. The fresh re-read's findings (seat f7, 2026-11-10; relayed by seat 99)

A reviewer who wrote none of this re-read the note at the source: PASS WITH FINDINGS -- high confidence on the
decompilation, medium on the two ELF evidence kinds (E1, E4); the core of sections 0-7 holds. Its four findings, each
as relayed and cited by that reviewer; they are added here and were not re-read again by this note's authors:

1. **An exploding round leaves the walk at its first record.** In the impact routine the exit for a round that goes
   off is D:L319477-319485: the range becomes 0 and the result is 4, one of the results that stops the walk
   (section 1). So the several-records rule of section 0 is a bullet's, not an exploding round's.
2. **The hand-off to the bounce routine.** D:L319439-319471 hands the record to `FUN_003c8f50` when the weapon's
   `+0x68` says so. Which firearms have that set is **unread**: for one that does, a body record goes to the bounce
   routine and not through the range cut of section 2. Until it is read, section 0's rule is stated for firearms
   without it.
3. **Equal distances give one record.** The walk's test for "strictly farther than the one handled last" is a strict
   less-than at D:L319990, so two records at exactly the same distance are handled once, not twice. A test that puts
   two boxes' entry points at one distance must expect one application.
4. **The aim nodes are among the no-damage bones.** Beside the hands, feet, toes, scapulas, shoulder weights and the
   root (section 0, rule 4), the skeleton's aim nodes carry boxes and take no damage.

And one wording point: the nearest-first walk is `FUN_003c9b70` D:L319966-320014 (section 1, "The order they are
handled in"); `FUN_0031dd90` only queues the round's line with the world's batch.

The builder (seat f7, after the mega release) moves the room's and the page's hit volumes to the original's oriented
bone boxes with this rule, so "in passing" 3 of section 12 is built with it and not left as a separate reading.
