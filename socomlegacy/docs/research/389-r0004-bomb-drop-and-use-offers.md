# 389 -- r0004's bomb drop and use offers: the drop exclusive with the turret mount; one ground bomb, one MPBOMB (R4B-16, G8)

- Date: 2026-11-09. Task R4B-16 of the [r0004 plan](../plans/r0004-option-b.md), under the owner's ruling OT.R97
  (MISSION: r0004 is the specification for gameplay and front-end behaviour) and the owner's bar for this wave
  (2026-11-09T01:45Z: a sub-item goes in only at very high confidence that it is the original's and breaks nothing
  else; anything short of that is left out with its gap named). Branch `agent/r4b-16` from `agent/v0416-bundle`
  52138bf61.
- Track: simulation. It changes which action offers a bomb carrier is given beside a turret.
- Status: **reading** (R4B.R3; re-read by its fresh reviews, `agent-mail/evidence/r4b-w2/VERDICTS.md`, and the r0004 wave 2 lane batch review, `agent-mail/evidence/mega/REVIEW-R4B-AND-THREAT-BATCH.md`, PASS WITH FINDINGS (high), 2026-11-09). Nothing here is measured running. This note's author re-read every r4
  site cited below with capstone in `game/overlays_r0004/socom2_game_r0004.elf` (the PINE dump) **and** the served
  decrypt `game/r0004/served/socom2_game_served.elf`: no word differs over 0x599050-0x599500 (the offer builder's twin
  and its mount/drop tail), 0x599b40-0x599cd0 (the type-0 offer), 0x599cd0-0x599e70 (the new drop test),
  0x5a3530-0x5a3780 (the ground bomb's maker), 0x5c2a40-0x5c2d90 (the pickup) and 0x5496c0-0x5496d0 (the bit setter);
  the float at 0x41eb18 reads 65535.0 in both. None of these falls on the PINE dump's three contaminated words (0x1e70cc,
  0x2cc670/674). A reviewer who did not write this re-reads them before they count as readings (R4B.R4). dot
  corroborated the ground bomb's cleanup loop (the plan's row R4B-16).
- Sources: `C:/Projects/agent-mail/evidence/r0004-investigation/cluster-explosives-and-blast-occlusion.md` §5-§6 and
  REPORT.md row G8, read **with the corrections at the report's foot** (§3: item 4 of the cluster -- the charge 10 units
  below the floor -- refuted, r0001's own test; item 5 corrected: the `FUN_00588080` anim-state refusal is r0001's, and
  reading `+0x1062` as "on a ladder" is inference). r0001 is cited `FUN_<addr>` / `D:L<line>` of
  `game/analysis/socom2_game.elf.decomp.c`; r4/r1 pairs from the investigation's function map
  (`agent-mail/evidence/r0004-dot/function-map-v2.csv`). No decompiled or disassembled text is pasted.

## 1. The drop offered only when the turret mount is not -- ported (the page)

**r0001.** The offer builder `FUN_005937c0` returns at once, offering the turret's release (action 20) alone, when the
actor holds a turret (`FUN_005a8850`, D:L452334-452338). Otherwise, at its tail, it tests the demolition bomb's drop
inline (item 0x9a carried, `+0x244 <= 0`, not `FUN_00588080`, no stick, the common gate `FUN_005a7de0(a, 1, 0)`,
`FUN_005c0ad0 <= 0`, the pitch `+0x1450 < -0.25`; D:L452456-452469) and sets action 6 (bit 0x40, D:L452470), **then**
tests the turret's mount `FUN_005a88c0` and sets action 19 (bit 0x80000, D:L452472-452474). Both bits can be set on one
frame, so both are in the picker's list (the mount its head, the drop its tail: `./actionContext`
`ACTION_CONTEXT_ORDER`), and the d-pad can turn the list to the drop (research 303).

**r0004** (the builder's twin r4 0x599050). The head is unchanged: r4 0x5ae570 (= `FUN_005a8850`) at 0x599074, action
0x14 set through the setter r4 0x5496c0 at 0x599084-0x599088, return. The tail is reordered: the mount test r4 0x5ae5e0
(= `FUN_005a88c0`, the map's immediate-insensitive match) at 0x599488; non-zero sets action 0x13 (0x599498-0x5994a0) and
branches past the drop (0x5994a4 to 0x5994d0); only on zero is the drop's test called, now a function of its own,
r4 0x599cd0 (0x5994b0), whose non-zero sets action 6 (0x5994c0-0x5994c8). So **the drop is offered only when the mount
is not.** The drop's own terms in 0x599cd0 are r0001's (item 0x9a by r4 0x5cfe00 = `FUN_005c86f0`; `+0x244`; r4
0x58d6b0 = `FUN_00588080`; `+8`/`+0xc`; r4 0x5adae0 = `FUN_005a7de0`'s twin with (1, 0); r4 0x5c77e0 = `FUN_005c0ad0`;
`+0x1450 < -0.25`, `lui 0xbe80`) with the three refusals of §2 and §3 added.

**In the port:** `actionInputs` (viewer `actionWiring.ts`) builds the drop's context (`bombDrop`, bit 0x40) only when
the turret's mount context is not offered -- `TurretPage.prompt()` in reach (`pageSources`' `turret`, the port's
`FUN_005a88c0`: the turret in reach and facing, `canMount`; the kit's lock; the launcher's set; a traversal move). Both
are built past the prompts' common gate (LATER 220), so a shut gate offers neither, as before. The list loses the drop
beside an offered mount; nothing else changes (C4, a door, a pickup beside the drop keep it). Test:
`packages/viewer/test/r4bBombDropOffer.test.ts`.

**The room** keeps accepting a drop by its own terms (`BombAuthority.manualDrop`: carrying, no placement, the cooldown,
`canDrop` on the last command). It does not re-judge the mount's offer, and is not made to: the original's drop request
reaches the host's bomb state with no test of the offer (`FUN_0059dd30` D:L457558 -> `FUN_002c2090`; the host's
`FUN_002c1f10`, D:L164008-164043, calls only `FUN_002bd4d0` and `FUN_002c20c0`: research 214's
`DECIDED_HOLD_BOMB_READING`), so the offer is each console's own -- as the page's is here; and a room-side mount-offer
test would read the turret's occupant as the room knows it while the page reads it as last told, so a turret the page
still saw taken (an honest page offered the drop) could be judged free by the room and an honest drop refused. An
honest page never sends a drop beside an offered mount, so page and room agree on every drop a page sends; a modified
page could drop there, as a modified console could in the original. Recorded for the controller: the one-sided guard
class (`tools/test/refusalMirrors.test.ts`, P34) lists a page refusal the room trusts only by hand; this one is not
listed there (outside this task's files).

r0001's order (the drop inline, then the mount, both offered) is **r0001, superseded by r0004 (OT.R97)** (R4B.R6).

## 2. The drop refused while holding a turret -- already r0004's outcome in the port

r4 0x599cd0 refuses when the actor's `+0xeb8` is non-zero (0x599d08-0x599d0c), the turret-held word (`FUN_005a8850`
reads it, D:L462983). The builder's head already returns for a held turret (§1), so this refusal adds only where
`FUN_005a8850` answers 0 with `+0xeb8` set: online, while `+0x22c` is above `FUN_0030d550(0x45a0c0)`
(D:L462984-462991) -- a window whose clock `+0x22c` this note does not read.

**In the port:** a seat holding a turret is offered the turret alone (`actionInputs`: `mounted()` -> `{ turret: true }`),
where `mounted()` is `TurretPage.mounted()` -- set by the page's own take (`takeOwn`, on the room's reservation word;
A1, LATER 525) -- or its predicted release on its way (LATER 104); the room refuses a mounted seat's drop at its command (`room.ts` `decide`, `mountedAt`
-> 'mounted'). So in every phase the port models a turret as held, no drop is offered or taken. Nothing is changed; the
pin is the last case of `r4bBombDropOffer.test.ts`. Gap: whether the original's `+0xeb8` stays set in a phase the port
counts as free (after the release's end, before `+0xeb8` is cleared) is unread -- settled by `+0x22c`'s and
`+0xeb8`'s writers traced, or a PCSX2 r0004 write watch on both across a mount and a release.

## 3. Not ported: the online refusals on +0x1062 and FUN_0054f6e0; the +0x1334 lock waits on R4B-14

r4 0x599cd0, after the pitch-independent terms, reads the online byte `0x45d481` (= r0001 `DAT_0045a0c1`, the
cluster's §0 pairing) at 0x599d90-0x599d94 and, online:
- refuses while `actor+0x1334 > 0` (0x599da0-0x599dac) -- **out of this task** (the brief): G5's ClimbAsk timeout,
  R4B-14, which the port does not model yet; it lands with that row.
- converts the half-word `actor+0x1062` to a float (0x599dc0-0x599dec) and refuses unless it equals 65535.0 (0x41eb18,
  both images; 0x599df0-0x599dfc);
- else calls r4 0x554630 (= `FUN_0054f6e0`, the map's immediate-insensitive match) with (actor, 1, 1, 1) at 0x599e0c
  and refuses on non-zero (0x599e14-0x599e20).

**Not ported, and why** (the owner's bar):
- `+0x1062`: what it holds is not read. The REPORT's correction calls "on a ladder" an inference; the brief calls it the
  climb/ladder occupant field. No port state is known to equal "`+0x1062` != 0xFFFF". Settles: `+0x1062`'s writers
  traced in r0001 and r0004 (the ladder reservation's path, `FUN_005b2620` -> `FUN_005b1130` / `FUN_005b1570`, research
  86 §2.3, is the first place to look), or a PCSX2 r0004 read of `+0x1062` through a mount, a climb, a dismount and a
  slide.
- `FUN_0054f6e0(actor, 1, 1, 1)` (D:L417318): true in state 5 (`+0x174`), with the stack's top record's `+0x2b` 5, or
  with "Climb off ladder" (0x2e), "Ladderslide", "Ladderslide land" or "Ladder -> slide" on the stack. The port's
  traversal kinds are not the original's states, and the mapping is not certain for every kind: the foot's mount
  (`FUN_0057f880`) and the head's (`FUN_0057f690`) push their clips with 5 as `FUN_00588bc0`'s third argument, the
  foot's dismount pushes "Stand -> Ladder" reversed with 0 (`FUN_00584240`, D:L443773), the head's "180" with 0
  (`FUN_005b1c80`, D:L468245) -- which reads as true for `ladderMount`, `ladderMountTop`, `ladder`, `ladderOffTop`,
  `ladderSlide`, `ladderSlideLand` and false for `ladderOffBottom` and `turn180` **only if** that third argument is the
  state `+0x174` takes and the top record's `+0x2b`; `FUN_00588bc0` was not read far enough to say so. Settles:
  `FUN_00588bc0`'s use of its third argument read through to `+0x174` and the record's `+0x2b`, and the port's kinds
  checked clip by clip against it (each one a case in a test).
- "Online": which of the port's matches answer `DAT_0045a0c1` (a room's match always; the test room's offline walk, the
  Forge's, a LAN game) is a ruling the port has not made for any reader of the byte.
- `BOMB_DROP_LADDER_R0004_READING` (*note only*) names the two, for the row that ports them.

## 4. Not ported: the type-0 use offer refused on a ladder and in the climb lock

r0001's `FUN_00594350` (D:L452694-452736) answers 1 for an action object of type 0 (the final else, D:L452730-452732).
r0004's twin r4 0x599b40 adds the case at its head (`beqz` on the type byte `+0x24`, 0x599b74, to 0x599c50): r4 0x554630
(`FUN_0054f6e0`) with (actor, 1, 1, 1) at 0x599c5c, non-zero answers 0 -- **on every console, online or not**
(0x599c64-0x599c70); then, online (`0x45d481`, 0x599c78-0x599c80), `actor+0x1334 > 0` answers 0 (0x599c88-0x599c98);
else 1. Types 4 (the bomb's plant through r4 0x599e70, `FUN_00594480`), 5 and 6 (C4, item 0x98) are r0001's.

**Not ported, and why:** the ladder half needs `FUN_0054f6e0`'s port (§3's gap), and the climb lock is R4B-14's. Beyond
that, which of the port's contexts are type-0 action objects -- the cluster says the caller turns a type-0 answer into
bit 13 (0x2000), which the port's `door` and `switch` share -- is the cluster's reading, not re-read here; and the room's
door and switch handlers (`room.ts` `useDoor`, `useAction`) would need the same refusal at the ask's command, where the
room reads its present mover, not the command's (`decide`'s `mountedAt` is the only per-command history kept). Settles:
§3's `FUN_00588bc0` read, the caller of `FUN_00594350` / r4 0x599b40 read to the bit it sets for type 0, and a per-command
traversal record in the room (or a ruling that the page's offer suffices, as §1's does). `TYPE0_USE_LADDER_R0004_READING`
(*note only*) names it.

## 5. One ground bomb -- already r0004's outcome in the port (pinned)

r0001's ground-bomb maker `FUN_0059dab0` (D:L457474-457529: the "Satchel" model, "MPFootBomb", registered as kind 0xb by
`FUN_00542b90`) makes a new one without looking for an old one. r0004's twin r4 0x5a3530 first loops (0x5a3598-0x5a35c0):
r4 0x5466b0 (= `FUN_00541c60`, D:L409157: the first registration whose kind byte `+0xc` is 0xb) and, while one is found,
r4 0x546ec0 (= `FUN_00542470`, the unregister) on it, then looks again -- and only then makes the new one. So at most one
ground bomb is registered on a console.

**In the port:** the room's `BombAuthority` (match `bomb.ts`) is the one bomb a round: one state, one place, one
carrier. A drop (`dropAt`) is reached only from the carried state (`manualDrop`'s 'not carrying', `dropped`'s carrier
test, `step`'s gone carrier), and moves that one record to the ground; there is no second record to remove. Nothing is
changed. Pinned: `packages/central/test/r4bOneGroundBomb.test.ts` (a drop moves the one bomb; a second drop, a death or a
leave of a non-carrier leaves it where it lies; one `dropped` event).

## 6. A pickup never gives a second MPBOMB -- already r0004's outcome in the port (pinned)

r0001's pickup `FUN_005bbf10` (D:L473626+) gives MPBOMB when it finds the kind-0xb registration (`FUN_00541c60`), with
no test of the kit; otherwise only `FUN_0059df60`. r0004's twin r4 0x5c2a40 unregisters a found registration
(0x5c2a5c-0x5c2a6c), scans the kit's `+0x82c` slots at `+0xe4` for an item whose `+0x7c` is 0x9a (0x5c2a78-0x5c2ac0) and
skips the give when one is there (0x5c2ad0); otherwise it gives MPBOMB (r4 0x3e6cc0 with 0x9a, 0x5c2ae4-0x5c2ae8)
whether or not a registration was found. So no kit holds two MPBOMBs, and a pickup is not lost when this console's
registry lacks the ground bomb.

**In the port:** the bomb is not a kit item; it is the room's one record, and a pickup (`BombAuthority.step` ->
`pickup`) takes it only from the ground, to the lowest-id living player in reach. While carried no other pickup runs,
so no second carrier and no second bomb. The "lost pickup" half is moot: there is no per-console registry to disagree
with the room. Nothing is changed. Pinned: `r4bOneGroundBomb.test.ts` (two players in reach: one pickup, by the lower
id, and none more while it is carried).

## 7. Re-filed (R4B.R6)

- §1's r0001 order (the drop tested inline, then the mount; both offered on one frame, `FUN_005937c0`
  D:L452456-452474): r0001, superseded by r0004 (OT.R97). No constant named it; `./actionContext`'s doc (the picker's
  order, `FUN_00592d50`) is unchanged, the order itself being r0004's too.

## 8. The ledger

No constant is added to the code. Two names are the note's own (research 101, group R4B-16):

| name | what it holds | settled by |
|---|---|---|
| `BOMB_DROP_LADDER_R0004_READING` (*note only*) | `'not ported'`: r4 0x599cd0's online refusals on `actor+0x1062` != 0xFFFF (0x599dc0-0x599dfc) and on r4 0x554630 = `FUN_0054f6e0`(a, 1, 1, 1) (0x599e0c-0x599e20); the field unread, the state map to the port's traversal kinds unsettled, "online" unruled (§3) | `+0x1062`'s writers traced; `FUN_00588bc0`'s third argument read to `+0x174` / `+0x2b`; a ruling on the online byte in the port's matches; or a PCSX2 r0004 drop asked on a ladder |
| `TYPE0_USE_LADDER_R0004_READING` (*note only*) | `'not ported'`: r4 0x599b40's type-0 case answers 0 on r4 0x554630 (0x599c5c-0x599c70, every console) and, online, on `actor+0x1334 > 0` (0x599c78-0x599c98) (§4) | §3's read; the type-0 caller's bit read; the room's per-command traversal record or a ruling; R4B-14 for the lock |

The `+0x1334` refusals of §3 and §4 wait on R4B-14 (G5), which names the lock.

## 9. Evidence kinds, apart

- **Source inspection**: the r4 sites above in both r0004 images (capstone), the r0001 decompilation's lines, the port's
  sources.
- **Unit tests**: `packages/viewer/test/r4bBombDropOffer.test.ts` (5 cases; RED on the exclusion before the change),
  `packages/central/test/r4bOneGroundBomb.test.ts` (2 cases; pins of the port's existing behaviour, green before and
  after).
- **Not done**: no dev-disc test, no browser run, no physical playtest, no capture (a PCSX2 `--build r0004` run of a bomb
  drop beside a turret is the plan's "to proven").
