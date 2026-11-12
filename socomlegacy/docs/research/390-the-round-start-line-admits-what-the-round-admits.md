# 390 -- the round's start line admits what the round admits: a bullet-transparent wall no longer refuses a round (LEAN-WALLED, issue #752 defect 2)

- Date: 2026-11-09. Task LEAN-WALLED: defect 2 of issue #752 (LATER 775; the MP51 chimney head-glitch report), scoped
  in `agent-mail/handoffs/2026-11-08/mp51-headglitch-lean-hitbody-SCOPE.md` §8. Branch `agent/lean-walled` (from
  `agent/v0416-bundle` 52138bf61, which carries defect 1, LEAN-HIT).
- Track: simulation. It changes which rounds the room takes and where the page's round leaves from: a round whose
  muzzle stands past a wall the round's own flight passes over (an r0004 INVISIBLE_DI wall, a polygon without the
  round query class's side bit) is no longer refused `muzzle walled`, and the page fires it from its muzzle.
- Status: **reading** (its fresh review in the merge 6320949f6; the r0004 wave 2 lane batch review, `agent-mail/evidence/mega/REVIEW-R4B-AND-THREAT-BATCH.md`, PASS WITH FINDINGS (high), 2026-11-09). Nothing here is measured running. The r0001 sites are cited `FUN_<addr>` /
  `D:L<line>` of `game/analysis/socom2_game.elf.decomp.c`; "r4 0x..." is an r0004 address. This note's author re-read
  the r0004 sites below with capstone (a scratchpad disassembler over the ELF program headers) in
  `game/overlays_r0004/socom2_game_r0004.elf` (the PINE dump) **and** `game/r0004/served/socom2_game_served.elf` (the
  served decrypt): no instruction differs between the two over r4 0x3ebd00-0x3ec150, 0x2eff40-0x2f0bcc, 0x3eaab0-0x3eb0cc
  and 0x2f91c0-0x2f91f4. A reviewer who did not write this re-reads them before they count as readings (R4B.R4). No
  decompiled or disassembled text is pasted.
- Sources: issue #752 (its body's defect (2) and closing bar (2)); MISSION OT.R80 and LATER 366 (the start lines, a
  check the port added with no original); research 169 §7 measure 5 (b) (SVC-23b); research 84 §13 and LATER 413 (the
  round's walk and its query class); research 383 (R4B-09, MP51's r0004 walls).

## 1. What the start line is, and why it may follow the round

The start line (`packages/viewer/src/net/startLine.ts`, `startWalled`) is the port's, not the original's: the console
fires from the posed muzzle wherever it stands (OT.R80, "an intended divergence by the owner's ruling"; LATER 366).
The room refuses a round whose start a wall stands before (`room.ts` `startRefused`, `muzzle walled`), and the page asks
the same lines and sends a walled muzzle's round from the kept head (`fire.ts` `Fire.ray`). Its purpose, in OT.R80's
words: "a round cannot pass the wall the barrel poked through". Until this task it tested every polygon.

A round's flight cannot meet every polygon. Two filters stand between a polygon and the round, both read at r0001 and
unchanged in r0004:

1. **The query class** (`../src/round` `roundAdmits`, LATER 413): the round's segment is run through
   `FUN_002d3030` at class 0 (D:L175299-175312), which passes a polygon with surface-word bit 18 (the camera-only faces)
   and records, on the type-2 branch, only one with bit 1 (`SURFACE_SIDE`) set (D:L175350-175352). r0004: the function
   moved to r4 0x2eff40 with its 803 instructions in the same order; every operand that differs is a relocation (a
   global's address, a call's target, a branch to the same offset in the function), in both images -- the masks are
   r0001's.
2. **PENETRATION exactly 1** (`../src/accuracy` `penetrate`; `@s2u/scene` `ignoredBy`): `HandleIntersections`
   (`FUN_003c9b70`) takes the hit's material (`FUN_002dc1d0`, D:L320021), reads its +0x24 PENETRATION (D:L320028) and
   handles the hit only when it is not 1.0 (D:L320030); a 1.0 surface is passed over with no mark or impact. r0004:
   the function is at r4 0x3ebd00, four instructions longer; the load of +0x24 and the compare against 1.0 with the
   branch past the handling are r4 0x3ebf28-0x3ebf40, the same instructions as r0001's 0x3c9d98-0x3c9db0 (relocated
   branch target only), in both images. The four added instructions lie after the skip: one more value (0xb6) in a
   byte's compare list (r4 0x3ebfc8-0x3ebfd0, against r0001 0x3c9e30-0x3c9e38) and one `nop` (r4 0x3ebfec); what that
   list selects was not read for this task, and it does not touch the PENETRATION test. `FUN_003c8920` (the cut, r4 0x3eaab0) and `FUN_002dc1d0` (r4 0x2f91c0) differ from r0001 by
   relocations only, in both images.

So a polygon the round's query does not admit, or whose material's PENETRATION is 1, is not a wall to a round: the
round's flight goes through it as if it were not there, on the console and in the port (`roundPath`). A barrel past
such a face passes nothing the round could not pass, and OT.R80's purpose does not reach it. Issue #752 states the
consequence: since v0.4.10 (R4B-09) MP51 carries eleven INVISIBLE_DI walls (byte 3, PENETRATION 1 in `materials.rdr`'s
SOILS) at roof height, so the every-polygon line could refuse an honest round as `muzzle walled` that the flight would
have passed. Its closing bar (2) asks exactly this: "the room's start line admits what `roundAdmits` admits
(penetration below 1) and nothing else".

## 2. What changed -- ported

- `startLine.ts`: `roundStartAdmits(penetrationOf)` -- `roundAdmits(poly)` and, with a material table,
  `penetrationOf(poly.material) !== 1` (the walk's own test; the SOILS table holds no value above 1, so it is the
  issue's "below 1"). With no table (`null`: the page before its effects load) it is `roundAdmits` alone, as the page's
  flight then stops at every admitted polygon (`Fire.setMaterials`' null). `startWalled` takes an optional `admits`;
  its default stays every polygon.
- `room.ts` `fireAt`: the start asks `startRefused(frame, from, false, admits)` with the round's admits over the room's
  own material lookup (byte 0 the map's `DefaultMaterial`, as `fireAt`'s `roundPath` takes it, PEN-MATERIAL).
- `fire.ts` `Fire.ray`: the page's start check asks the same admits over its own `penetrationOf`. The page's table
  and the room's index the same list (the engine's two built-ins, then the SOILS records: `@s2u/sound` `parseSoils`,
  `@s2u/scene` `materialTable`); where the page has none, its test is stricter than the room's (it walls more, sends
  from the head, and the room takes the head), never looser, so no honest page round is refused by the change.

What did not change: the head's own line (`startLines`' `headEye`, every polygon -- where the body's head may stand,
kept on its side of any wall the body cannot pass); the reach; the placed charge's path; a throw's, a launcher round's
(`launchRound`) and a rocket's start, which keep every polygon (§3).

Held by `packages/viewer/test/startLineRoundAdmits.test.ts` (unit: the predicate and `startWalled` over INVISIBLE_DI,
STONE, a side-bit-less face, and STONE behind INVISIBLE_DI), `packages/central/test/room.test.ts` ("LEAN-WALLED": BL-3's
geometry with the wall INVISIBLE_DI -- the round past it taken, a grenade from the same point still `hand walled`) and
`packages/viewer/test/startLineMp51Disc.test.ts` (dev-disc: MP51 patched, the eleven INVISIBLE_DI walls each met by an
every-polygon line and by no round start line; a body on either side of the root's wall r4 0x2d6ee0 walled for every
polygon, not for the round).

## 3. Not ported

- **The two heads made one (the issue's second clause).** Nothing to port for the round: the start lines on both
  sides already stand on the move's root, not the posed one -- the room's `startBody` / the cone's frame and the
  page's `walk.ts` `startBody` ("the stance's root, not the posed one, as the room's") -- and LATER 366's record says
  so ("the root gap is gone for a round"). The stance-root / posed-root gap `room.ts`'s `startRefused` comment still
  names as owed is the page's camera eye (`walk.ts` `follow`, `ROOT_POSE_SLACK_PLACEHOLDER`) against the start lines'
  head, not the page's start check against the room's. Which root the original stands a start check on cannot be
  read: the original has no start check (OT.R80). The shooter-side hit test the issue points at (`FUN_005abbc0`,
  D:L464672-464803, research 91) is the target's body, defect 1's (LEAN-HIT), not the shooter's start. What would
  close the remaining camera-eye gap: a reading of the posed root's height per stance off the clips (or a capture of
  the console's camera root), then the room's history carrying it; a task of its own, not this one.
- **A throw, a launcher's round and a rocket.** Their start keeps every polygon. Their flights are not the round's
  walk: a grenade and a launched round fly through the projectile step (`@s2u/scene` `projectile.ts`), whose own query
  class and whose treatment of an INVISIBLE_DI wall were not re-read for this task (the port's projectile step
  already skips a PENETRATION-1 hit, `ignoredBy` at `projectile.ts` L480, used at L1121 -- where the next task
  starts: that skip re-read at the source, with the projectile's query class), so admitting the round's set for them
  could let a throw start past a wall its flight stops at. What would close it:
  the projectile's segment query (`FUN_0031dd90` / `FUN_002d3cf0` at the projectile's class) and `FUN_003c9b70`'s
  per-class branches read for each throwable and launched class, then the same admits per flight. No live evidence
  asks for it (LATER 366 kept their refusal for the same reason).
- **The page's and the room's tables proved equal on the disc.** The argument above (same order, the page never
  looser) is source inspection; no test compares `effects.materialName` against `surfaceMaterial` over a map's bytes.

No constant is named by this task: nothing it needed was unread.
