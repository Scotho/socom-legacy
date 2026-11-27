# 445 -- The hostage's danger scan and its flight (LATER 1170, X4: hostages do not flee C4 or grenades)

- Date: 2026-11-18 (draft 2). Branch `agent/later-1170-hostage-flee` (worktree `wt-later-1170-hostage-flee`), base the trunk
  `agent/next` a909613646; LATER 1170 and research 445 claimed through the merge seat (LATER-CLAIMS, 2026-11-18T04:20Z);
  the owner's question H478. The task is the main controller's (2026-11-18), from the Discord report X4
  (`agent-mail/evidence/bugs-2026-11-18/FINDING-X4.md`, the playtest investigator's read, UNREVIEWED).
- Track: simulation. Status: **reading, pending review.** Draft 1's fresh re-read at the source FAILED on three points
  (`agent-mail/evidence/weekend-mega-2026-11-14/reviews/research445-reread-draft1.md`, F1-F8); draft 2 folds every finding,
  and the hostages seat's reads (its research 447 at 69f24e3264, `agent/hostages-audit`; the inputs file
  `agent-mail/handoffs/stage2/later1170-445-inputs-hostages-seat.md`, with its two corrections). Owed before the build: a fresh
  re-read of draft 2 at the source.
- Evidence kinds, kept apart: **(D)** source inspection of the decompilation (`socom2_game.elf`, r0001; and r0004 where cited D4:L) at
  the lines cited, by this note's author; **(R)** confirmed at the source by draft 1's re-reader; **(A)** a research agent's read, not re-read by
  the author; **(H)** the hostages seat's read (re-read there at source where it says so); **(E)** data values read from the
  disc's ELF (`game/disc/socom2_game.elf`, the PT_LOAD segments). **r0004's ELF gives no values at these addresses (packed or
  laid out otherwise): r0004 is UNCHECKED.** Nothing here is measured running.
- It corrects research 189 (s2, row #16, s12), 207 and 238 (section 8): their "hostages react to nothing online" holds of the
  AI **event** mask, not of this scan, which never reads it.

## 1. The scan runs every AI tick, outside the event mask (D, R, H)

- A hostage is a `CSealCtrlAi` whose stack starts in 0x17 `CAiSHostage` (research 189 #1). That class's tick `FUN_0056de10`
  calls `FUN_005cba20` when controller byte `+0x266` bit 3 is set (D:L432501-432503). **The bit (H, re-read at source by the
  hostages seat):** set at every AI init (`FUN_00573130` D:L434744, before the online hostage branch); cleared only by state 6
  `CAiSSurrender`'s Tick (`FUN_006078a0` D:L514651) and by membership of an AI group whose word has bit 0 set (`FUN_0060cbd0`
  D:L517195: NOT(group bit 0)); **set again** by the group teardown `FUN_0060ce40` (D:L517290) and, for exactly the groups with
  bit 0, by `FUN_0060e280` (D:L518092) -- so a group's clear is not permanent (draft 2's re-read, M1). Whether an MP map's AI groups name a hostage is unread
  (the disc's group records, members added by name about D:L490894-490908): `HOSTAGE_DANGER_SCAN_ENABLED_READING`.
- Online `FUN_00572d70` zeroes only the event mask `+0x65c` (D:L434611-434613). `FUN_005cba20`'s event consumer `FUN_005faae0`
  (D:L483035) is dead online for that reason (H: the mask test D:L380964-380966); the scan below never goes through it.
- `FUN_005cba20` calls the scan `FUN_005cb870` (D:L483037). The scan walks the world objects within `DAT_00650a18` of the actor
  (`FUN_00541f10` D:L409345, the list at 0x44d470) and for an object of type 1, 4 or 5 -- when the 0x1b push gate admits
  (`FUN_005f5cd0(ctrl, 0x1b, 0)`) and the entity's fuse `+0x8c` is at most `DAT_00650a20` -- asks `FUN_005cac00`; it stops at
  the first object that answers true (D:L482938-482967). With `+0x42c` bit 0x400 (state 10 on the stack) an object whose owner
  (the world object's `+0x10`) shares the actor's `+200` bits is skipped (D:L482961-482963): not a hostage's case. (E)
  `DAT_00650a18` = 200.0, `DAT_00650a20` = 16.0.

## 2. What counts, and its fuse (A, R)

- Thrown items register through `FUN_005c5340` (D:L479412-479421): **type 1 = 0x79 M67 and 0x7e HE only**; type 2 the smokes,
  the chem light and others; type 3 the Mark141 flashbang. Placed items through `FUN_005bc730` (D:L474072-474088): **type 4 =
  0x97 C4, type 5 = 0x98 satchel**; 6 the claymore and PMN; 7 the bomb and the rest. The scan takes the two frags, C4 and the
  satchel; a flashbang or a smoke never sends a hostage running.
- The fuse `+0x8c` is the seconds left: `Timer1` at creation (`FUN_003cb1a0` D:L320736-320737), counted down by the frame time
  unless 9999999.0 (in flight D:L320127-320128; placed only offline or locally owned, D:L316893-316895). C4's `Timer1` is 6 s
  (research 94 s C5): a planted C4 qualifies at once. **The satchel's** is `DAT_00437d44` unless that is negative
  (9999999.0) (D:L324721-324725): a runtime global outside the ELF's file-backed segments, its writer not found --
  `HOSTAGE_SATCHEL_FUSE_PLACEHOLDER`. A remote copy's placed fuse does not run down online: it stays at its `Timer1`.

## 3. The decision `FUN_005cac00` (D:L482578-482790; D, R)

The third argument is the **entity** (the world object's `+8`); `+0xac` is its thrower or planter. The object carries a
per-actor **mark** (`+0x18`, a bit indexed by the actor's `+8`) and per-side **seen** bits (`+0x1c`; the actor's side value
`ctrl+0x10c -> +0x58`).

1. **Already marked** (D:L482614-482637): the side's seen bit tested (`FUN_005416b0` D:L408833, D:L482617).
   - **Seen** (bit set) or ctrl `+0x264` bit 1: the actor re-pushes 0x1b whenever it is not in 0x1b already (`+0x42c` bit 27
     clear), with no other test but the flee radius (D:L482739).
   - **Not seen** and `+0x264` bit 1 clear: only kinds 1 and 2 react (kind 1 in practice: the scan passes 1, 4, 5) -- and a
     reacting frag sets `bVar8`, the 0x19 push below; **kinds 4 and 5 (C4, satchel) answer 0: no re-push.**
2. **First time:** the planter (`FUN_0029e4e0` on `+0xac`) must be the actor itself or in the actor's neighbour list `+0xd0`
   (`FUN_002a0190`), else **no reaction, and no mark** (H: the scan returns without marking). A planter not found at all: the
   tests are skipped and it reacts (D:L482641); a thrower that resolves but is neither the actor nor listed leaves the object
   unmarked (D:L482714-482716).
3. **Seen** (`bVar6`), any of: the planter is the actor; its neighbour entry has flag 0x200; ctrl `+0x264` bit 1; or -- the
   entity in the actor's view cone, or within `sqrt(DAT_00650a28)` of the actor's feet -- **and** the visibility
   `FUN_00538d10(18.0, 0x66a1b0, actor+0xe8, entity+0x48, 0)` above `DAT_00650a30` (D:L482671-482705). A seen pass sets the
   side's seen bits (`FUN_00541650` D:L482674, D:L482703) -- for side values 2, 4 and 8 it sets bits 0|1 alike
   (D:L408819-408823), so for a side of 0, 4 or 8 a later `& side` test (`FUN_005416b0` D:L408833-408836) never reads as
   seen (R; H). The test is (cone OR near) AND visibility (D:L482700-482701). (E) 2500.0 (50 u), 0.25.
4. **Else** it reacts only when the planter shares a `+200` bit with the actor **and** its controller answers `cVar9`
   (`+0x264` bit 1 of an AI controller, else vtable `+0x2c`: 1 for `CSealCtrl`, the local human; 0 for an AI or a remote
   controller -- research 189 :153, "BELIEVED") (D:L482646-482670, D:L482707-482709). Marked, not seen.
5. **Reacting** (D:L482718-482749): the mark is set **before** the radius test; unless already in 0x1b, within the **flee
   radius** of the object's node it pops a top 0x13 (`FUN_005f5cb0` -> `FUN_005f7990` D:L506622-506634), pushes 0x1b and hands
   it the object (`FUN_0055cca0` D:L423925-423927). With `bVar8` (rule 1, a frag marked but not seen), right after: 0x19
   `CAiSEvent` pushed with flags 2, past the masks (D:L482750-482784; section 5).
6. **The flee radius** (A, R): the entity's `+0x10` is its first ammunition record; `FUN_003d4500` (D:L326623) returns that
   record's `+0x1c`, the **explosion radius** (`Explosion_Radius` x 10). No ammunition record: 200; ctrl `+0x264` bit 1 floors it
   at 200 (D:L482722-482732). The M67 (150), the HE (100), C4 and the satchel (their disc records) each send a hostage running
   from inside their own blast radius only, never past the scan's 200. A frag first met **between its radius and 200** is
   marked and seen with no flight; met again inside the radius it re-pushes (rule 1, seen).

**The neighbour list** (D; R's correction F4): `FUN_002a0a10` (D:L145876-145991), run by `FUN_002a0450`
(D:L145714-145832) for every actor with `+0xe1` bit 2, copies into `+0xd0` the members of the world list `DAT_00436338` (count
`DAT_00436330`) but itself, with no range or perception filter. It does not run every tick: a pending removal queue
(`DAT_00436370`, `FUN_002a0310` D:L145822) or else a pending add queue (`DAT_00436350`, new actors joining through
`FUN_002a0200` D:L145803) takes the whole call, and the refresh runs only when both are empty (D:L145743-145768); every
actor's slot `+0x48` is called in all three cases.
**Membership follows `+0xe1` bit 3** (`FUN_002a0f70` D:L146049-146071), which several paths clear (e.g. D:L432655, D:L433955,
D:L431821; not all read): a planter dropped from it is found by `FUN_0029e4e0` yet is no neighbour -- no reaction. Flag
0x200's setter is not found.

**The view cone** (A; the 65 deg at D:L434858 and the record x 1.3 at D:L434866 confirmed, R): `FUN_005c9400` (vtable
0x669498, D:L481720-481765): origin the eye (`FUN_005a3070`), axis half the eye direction plus the body's negated forward row,
length ctrl `+0xa8`, radius at depth d `25 + d * ctrl+0x68`; `+0x68` from the field of view (45 deg at construction D:L435177,
65 deg at `FUN_00573130`, then the actor's AI record's `[0x3c]` deg x 1.3), `+0xa8` the sight range (1000 at construction, or the
record's `[0x3b]` x a difficulty factor, D:L451618-451637). **The hostage's AI record's values are not read.** `FUN_00538d10`
(D:L403740) is a line of sight over the AI navigation: the eye at the actor's nav point + 18, walked to the target's height in
0.2 steps, returning 1 - the occlusion (1.0 with no nav point, 0.0 when the walk fails).

**Ctrl `+0x264` bit 1 on a hostage is clear** (draft 2's re-read, L3): `FUN_00573130` sets it only when the body's team word
has bit 2 (D:L434791-434804), and the hostage mask 0xC0020000 lacks it. Were it set, a hostage would see every object and every
flee radius would be floored at 200 (sections 3.3, 3.6).

### 3.7 The visibility, the AI navigation walk (LATER 1245; 2026-11-19; reading, pending review)

- The seen test's visibility is `FUN_00538d10(18.0, map, the hostage's cell, the object's +0x48, 0)` (the call
  D:L482700): the eye 18 over the hostage's cell (`FUN_0052d480`); a walk over the AI NAVIGATION grid toward the object
  (`FUN_005352d0` D:L401979-402107: every 0.2 cell, the occluder at each new cell and once more at the end point)
  accumulating occlusion; visibility = 1 - clamp(occlusion, 0, 1) (0x64fa28 0, 0x64fa30 1), 0 for a failed walk.
- The occluders: `LAB_005390d0` (machine code 0x5390d0-0x539234) -- a cell of kind 0, 8 or 10 whole; a bit-7 cell's marker
  of type 1 or 7 whole, as loaded (`HOSTAGE_VISIBILITY_RECORD_PLACEHOLDER`: its run-time bits unread); then `FUN_00539240` (D:L403883-403932) -- a floor above
  the line (`lerp(eye, target, t)`) whole unless the cell is kind 10 or flagged (byte 3 bit 1); past 30 u, kinds 12 / 4 /
  5 add 0.35 / 0.5 / 0.85 within 15 / 18 / 20 u of their floor (`HOSTAGE_DANGER_VISIBILITY_READING`).
- **(C) PC 1's capture, MP6, r0004, 2026-11-19 (hand-scored; `agent-mail` `evidence/weekend-mega-2026-11-14/mp6-breach-c4/`,
  sha256 1237726f...0aba; the owner's player report):** a hostage inside the room flees a C4 planted outside the breach
  wall (`worldmodel/access1`) when within 50 u, whoever plants (T7 remote 30.3 u; T8 / T10 / T11 host 41-47 u); at
  51.6 u nothing (T9). The charge's point (1641.7, ~62.6, 1263.0) lies in the OPEN navigation cell (93, 13), the wall's
  blocked row (93, 14) beyond it: the walk sees it. The host's charge also marks the far hostages (rule 4, the local
  human); a remote's only the near one. The seen word stays 0: `FUN_00541650` writes bits for side values 2, 4, 8 only.
  A remote charge's Timer1 reads frozen at 6.0 on the host (it passes the scan's fuse gate of 16).
- The walk starts at the hostage's last traversable cell (`+0xe8`); off the grid the visibility keeps its initial 1.0
  (D:L403754-403756).
- The port before LATER 1245 used the collision hull, which the wall blocks: no notice, no flight. H478 (flee only when
  noticed) stands: the original's hostages DID notice; the port's noticing was wrong.

## 4. The push gate for 0x1b (A; R, the CanPush slot disassembled)

`FUN_005f5cd0` (D:L505609-505654) admits 0x1b when ctrl `+0x265` bits 0 and 1 are clear, actor `+0xe1` bit 0x10 is set,
`+0x428` bit 27 is set, the top state is not 0x1b, `+0x430` bit 2 is clear, and the top state's CanPushAiState (vtable `+0x1c`)
answers 1. `CAiSHostage`'s (0x601ec0, disassembled from the ELF) refuses only 0x10, and 0x13 outside its sub-states 5 and 6; 9's
and 0x11's are the base `return 1` (0x555390, A). Bit 27 is in 0x17's, 9's and 0x11's masks and their AND: **0x1b is admitted on
[0x17], [0x17, 9] and [0x11]**, given the bits above (not read for a hostage). 0x1b's own allowed-next mask is 0x310468c2
(`FUN_005f7470`'s case 0x1b, D:L506563-506564, D): no 9 (follow) and no 2 (hold) while it runs. 0x19 comes only through flags 2,
past the masks (section 3.5).

## 5. The flight, `CAiSGrenade` (0x1b), tick `FUN_0055ac20` (D:L422914-423520; A, R)

- **Every tick:** the blast radius R (section 3.6) and the distance; the flee depth `n = int(R * k * 0.1)`, `k` = 1.2 for a
  thrower sharing the actor's `+200` bits, else `skill * 1.2 + (1 - skill) * 0.5` (`skill` ctrl `+0xe4`) (D:L423072-423092). A
  hostage's mask shares a bit with both sides (`HOSTAGE_TEAM_MASK`, research 238 :240), so `k` = 1.2 for any player's charge.
  `FUN_0055cdc0` predicts a landing point (`+0x70`).
- **Sub-state 0:** with no prediction, to 3; else the look at the landing point, and the throw-back (sub-states 2, 4, 5) only
  offline (`DAT_0045a0c1 == 0`, D:L423153), only for 0x79, and only for an actor whose team lacks 0x20000 (H: D:L423150-423154):
  **a hostage never throws back.**
- **Sub-state 3, the run** (D:L423219-423335): the direction away from the landing point, flattened (with none, actor - object
  less the object's velocity component). `FUN_00559580` (D:L422344) walks the AI navigation from the actor's cell in the 8
  compass directions to depth `n + 2` (`DAT_00650468` = 2) and takes the best of the octant facing away and its neighbours (d,
  d-1, d+1, ...), each by its **own** depth: the frags (flag 0x30000) its first 3 candidates (0x20000), C4 and the satchel
  (0x10000) all 8 (D:L423256-423267, D:L422375-422423). The summing branch is taken only without 0x10000, which `CAiSGrenade`
  never passes (D:L422375, D:L422387-422388; the build's review F1, which corrected draft 2 here). The walk's cells stop at
  the dynamic obstacle list too (`FUN_00535a40`, 0x66a0c0, D:L402265-402274), not built here. Accepted when the cell is valid and its depth
  >= `n - 2`: `FUN_005f0830(..., 0xc)` pushes the move child 0x18 at throttle `+0x12c` = 1.0 (D:L423275-423282). Else the
  fallback `FUN_0053a160` (D:L404384, `DAT_00650470` = 10: the COVER search, read and built by LATER 1226 below), then
  **the walk's own cell at any depth if valid** (D:L423305-423327; R's F6), then the callout 0x35. Depths are
  navigation cells.
- **Sub-states 6, 7, 8:** 7 inside R, 8 outside (D:L423488-423494); each sets ctrl `+0x279` (2 or 1) **at once**, a random
  0.25-1.2 s going to `+0x280` (D:L423505-423515; R's F7). **Their meaning, read (LATER 1224, coreA, 2026-11-18; reading,
  pending review; with Q24c's capture):**
  - The first tick runs in the push frame (the scan, then the driver: D:L432502, D:L432513). Sub 0 asks a prone hostage
    (`+0x278` or `+0x279` = 2) to stand (`+0x279` = 0, 0.25 + U(0, 0.95) s, D:L423103-423107, D:L423116-423120); a
    hostage goes on to 3 (6 directly needs ctrl `+0x264` bit 1). The switch falls through to 3 the same tick
    (D:L423215-423219), and **case 3 sets 6 unconditionally** and runs only by pushing the move child 0x18
    (`FUN_005f0830`); with no cell from any of its three searches, callout 0x35 and no child (D:L423219-423335).
  - While the child runs, the driver does not tick 0x1b (D:L506892-506913, research 447 s1.9): **sub 6 holds through the
    run.** With no child -- no cell, or the run over -- case 6 picks 8 when `R <= distance` (the distance from the feet
    to the object's `+0x48`, D:L423067-423070; R `FUN_003d4500`, D:L423073-423077), else 7 (D:L423488-423494); 7 asks
    prone (2), 8 crouch (1), each with 0.25 + U(0, 0.95) s, whenever `+0x279` is not already that (D:L423504-423517). 6,
    7 and 8 never go back to 3 for a hostage (the 6 -> 3 path needs `+0x264` bit 1).
  - **(C) Q24c, PC 1, r0004, MP71 (2026-11-18; a memory-read capture of the original, hand-scored, n = 1 each;
    `agent-mail` `evidence/weekend-mega-2026-11-14/rig/Q24c-PC1/`, sha256 6e12b7ed...877fdb):** M1, an M67 at rest 34 u
    from a following hostage: 6 at the push row, 7 every frame after, `+0x279` 2 with `+0x280` cycling about every
    1.17 s, 4.4 u of drift, killed by the burst -- every search failed. M2, the round at rest 138 u west: 6 held 2.63 s
    while the hostage ran about 125 u WEST (the nested count `G+8` 1), then 7 from the frame it stopped, `+0x279` 2,
    killed at the burst.
  - **The run's direction (an open reading):** M2's run went TOWARD the threat (the thrower west of the hostage, the
    round thrown west). The 8-way walk goes away from the object; a run toward it fits the second search, `FUN_0053a160`
    (then unread; since read as the cover search, LATER 1226 below), which the port did not build then
    (`HOSTAGE_FLEE_FALLBACK_PLACEHOLDER`). The port's search at M1's and M2's spot (`hostageFleeMp71.devdisc.test.ts`,
    from the rest points; the original searched from its prediction mid-flight) finds no cell at depth n - 2 and
    answers its last resort, one cell (about 11 u) east, where the original held (M1) or ran west (M2).
  - **The second search, built (LATER 1226, 2026-11-19; reading, pending review; checked against the `l1226-dir`
    capture):** `FUN_0053a160` (D:L404384-404460) is not a best-first search toward the threat but COVER. A
    breadth-first flood from the hostage's cell (`FUN_00536c80` D:L402793-403000; queue at the end, pop at the front),
    at most (2 x depth)^2 = 400 pops for depth 10 (`DAT_00650470`, D:L423290); each popped cell's eight neighbours in a
    fixed order (0x64f910 / 0x64f914, indexed by the loop counter: (0,-1), (1,-1), (1,0), (1,1), (0,1), (-1,1), (-1,0),
    (-1,-1) -- the step's direction, the same numbering as `FUN_00518b60`'s octants). The callback 0x53a5e0: an open
    neighbour (a kind other than 0, 8, 9, 10; not bit 7; no object of the list 0x66a0b8 over it) is visited and queued;
    a blocker (kind 0, 8 or 10) is ACCEPTED when the octant from its centre toward the predicted landing
    (`FUN_00518900`, `FUN_00518b60`) equals the step's own direction -- the blocker lies between the popped cell and the
    threat -- and the answer is the popped cell; anything else is rejected and not marked, so offered again beside
    another cell; the start cell is never marked. Case 3's order (D:L423268-423340): the walk at `n - 2`; then this
    search; then the walk's own cell at any depth (D:L423305-423315); else the hostage holds. **Against the capture**
    (`l1226-dir`, PC 1, r0004, MP71, the predicted landing G+0x70 recorded per trial): at all nine runs the port's walk
    finds no cell at n - 2, and the cover cell lies within 35 degrees of the original's run at eight; the ninth, E2's
    east hostage, ran south-west where E1's ran south-east from the same spawn and nearly the same landing -- a
    deterministic search answers one (the port's matches E1); why E2 differs is unread. Before 1226 the port took the
    walk's own cell, straight along x, against most runs. Q24c is not a pin, its predicted landings not recorded: from the
    rest points the port now answers M2 one cell north-east (the original ran 125 u west) and M1 about 142 u
    south-west (the original held); `hostageFleeMp71.devdisc.test.ts` keeps the no-landing path only. Read since (the patches lane, #881): the list 0x66a0b8 is empty
    on every map with hostages but the campaign's M71 (`HOSTAGE_COVER_OBJECTS_READING`, s7). Unread and named: the move kind 4 the search pushes against the walk's 0xc
    (`HOSTAGE_COVER_MOVE_KIND_PLACEHOLDER`). Read 2026-11-23 (the patches lane; reading, pending review), both builds:
    **the visited bits** -- the flood sets bit 2 of a cell's byte +3 on each neighbour the callback accepts and skips one
    that holds it (D:L402939-402943), then walks the region it grew clearing the bit with `FUN_00518180`
    (D:L402960-402995, D:L385825-385832; r0004 `FUN_0053b6d0` D4:L442492-442542, `FUN_005182c0` D4:L422830-422837): no
    bit outlives a search, each search a fresh flood (`HOSTAGE_COVER_VISITED_READING`, the port's value unchanged);
    **a bit-7 blocker's centre** -- `FUN_00518900` (D:L386177-386185; r0004 `FUN_00518bc0` D4:L423200-423253) moves the
    centre, when the cell has bit 7 (`FUN_00516920`) and its marker record's direction nibble (`FUN_00530d10`,
    `FUN_00516910`) is not 8, by 0.75 along that compass direction (`FUN_00519130`, the diagonals 0.70710677 per axis):
    `DAT_0065b030` = 0.75 in r0001's ELF, `DAT_0065b090` = 0.75 in r0004's served ELF; research 333 s5's endpoint move,
    the same (`HOSTAGE_COVER_MARKER_CENTRE_READING`; the port took the plain centre before). Pinned rule by rule on synthetic grids by `hostageCover.test.ts`.
  - **As built (LATER 1224):** the port's 0x1b keeps a sub-state: 6 at the first tick (a prone hostage asked to stand),
    held while the room's run moves (`moving`, the move child), then 7 or 8 by the room's `inside` (the distance to the
    object against its radius) with the prone or crouch ask; case 3's own stand ask (D:L423221-423225) draws a second
    time for a hostage still prone. The callout 0x35 is not built.
  - **Two differences left (the 1224 review's F3, F4):** (i) M1's `+0x279` cycles 255 -> 2 under 7 (about every 1.17 s):
    the stance system writes 255 once it applies (`FUN_00562b70` D:L427136), the post-tick re-derives `+0x278` from the
    body's `+0x174` (`FUN_005fc910` D:L432947, D:L509269-509280) and `FUN_00562c80` can refuse prone for crouch
    (D:L427121-427126) -- so the original's body did not settle prone over 2.3 s, where the port's goes prone ~0.7 s after
    the ask and stays (its stance model re-asks only on a change; LATER 1227). (ii) While the move child runs, 0x1b's Tick
    does not run, the object-gone path included, so the end timer waits for the child to end; the port's room stops the
    run when the object goes, so its child ends that frame -- what the original's child 0x18 does once the object is gone
    is unread (`HOSTAGE_FLEE_MOVE_PLACEHOLDER`).
- **The end:** not the move's arrival. Once the object is gone (its handle no longer matches) or its thrower is not found, a timer
  runs -- 1.0 to 1.8 + f in sub-state 8, else 2.1 to 2.9 + 1.5 f, `f = 2 (1 - skill)` (0 with `+0x264` bit 1) -- and at its end
  the state ends (D:L423024-423061); the stack's next state resumes (a follow resumes). The port's run stops while the object is gone or its thrower unresolved (the
  parent returns before its sub-state switch, D:L423027-423062; whether the move child 0x18 moves on is unread:
  `HOSTAGE_FLEE_MOVE_PLACEHOLDER`).
- **0x19 `CAiSEvent`** (H: one reader's read, the push and the pop spot-checked by the hostages seat), when pushed by rule 3.1's
  `bVar8`: `+0x5c` the object's position, `+0x88` = 0.75 (`DAT_00650a38`) + f(1 + U), f = (1.2 - ctrl+0xe4) x 1.5 x d^2 / R^2
  (0.2 with `+0x264` bit 1), `+0x74` = 0.75; OnSignal `FUN_00605a80` (D:L513740-513761): AI mode 4, flags |= 0x30; Tick
  `FUN_00604ce0` (D:L513280-513530): cue 0x46 at 1.0 (name unread), a wait of `+0x88`, a 0.75 s look at the object
  (`FUN_00601330(ctrl, 5, pos)`), 0.75 s, the look reset and a pop of itself (`FUN_005f5ca0`, D:L513505-513513); an abort (a live
  target, or `+0x718` > 1.0) to its end at any frame after the first. **It is not the normal path:** a first notice that sees the
  frag pushes 0x1b alone and the hostage runs at once; the look comes first only for a frag **marked but not seen** -- and a
  seen pass sets the side's seen bits wherever it is made, so an object is marked unseen in exactly two cases (H, the hostages
  seat's third read of D:L482608-482760): (i) the thrower does not resolve (`FUN_0029e4e0` == 0, D:L482641: the tests skipped,
  marked at D:L482718-482720); (ii) test 4 -- a listed thrower other than the actor (the actor itself is always seen), unseen,
  sharing a team bit, of kind 2 (else `cVar9` is 0, D:L482648-482650), its controller answering `cVar9` (D:L482657-482669) -- for
  this AI's own pass: `obj+0x1c` is shared, every AI's seen pass ORs in its own side, so another AI's (a side-2 AI writes 3) can
  close this hostage's gate (H, research 447 re-read 4, dfe4685311). The 0x19 push (D:L482750) depends on `bVar8` (and the flee
  radius, D:L482739), not on the 0x1b push succeeding. Plus a side value of 0, 4 or 8, for which the seen bits never test true (`FUN_005416b0` is `(obj+0x1c & side) != 0`, D:L408833-408836; `FUN_00541650` sets
  bits 0-1 for 2, 4 and 8 alike): every pass after the mark then qualifies. Outside R decides only WHEN an unseen mark's look
  shows (its first visible flight). A thrower that resolves but is neither self nor listed leaves the object unmarked
  (D:L482714-482715). How often any case arises: unread (the hostage's side value; whether a room's thrower resolves).
- A blast does not raise ShotAt: the hit counter (`+0x718 += 2.5`, `FUN_00572330` ~D:L434361) excludes weapon types 0x79-0x80 and
  0x97-0x99 (H).

### 5.9 Door use during the flight (LATER 1208; 2026-11-20, the hostages audit seat; reading, pending review)

- **(D) The run walks the walker.** The move child's tick `FUN_005f1160` (the slot +0x10 of vtable 0x6696d0) takes its route
  through `FUN_00562790` (D:L503231, D:L503263): the route object at the controller's `+0x46c`, then movement state 3
  (`FUN_0056cbf0`(actor, 3), D:L426931 on); the tick's own `+0x2c & 4` branch sets 3 again (D:L503284; the argument the text
  drops is `a1 = 3` at 0x5f12f0, the review's read of the machine code). The controller tick `FUN_0056de10` runs the walker
  `FUN_00567900` in movement state 3 (D:L432565-432567): the same walker a follower reaches in movement state 6 (`FUN_0056cbf0`
  turns 3 into 6 under the follow goal) through `FUN_005fae70` (D:L508454), whose type-1 body pushes `CAiSAction` (0xb) at a
  route point on a shut door's bound marker cell (research 428 s3); the push does not read the movement state (D:L429532-429553).
- **(D, E) The push is admitted over 0x1b.** The gate `FUN_005f5cd0` (D:L505609-505654) takes the top goal's allowed-next mask
  (`+0x428`; 0x1b's 0x310468c2 has bit 11, section 4), refuses only the same type, and asks the top goal's CanPush (vtable
  `+0x1c`): 0x1b's vtable 0x669350 holds 0x555390 there, the base `return 1` the follow goal's also holds (read from the ELF's
  bytes). Its run-time bits are the follower's, `HOSTAGE_DOOR_PUSH_GATE_READING`.
- **(C) Measured:** PC 1's Q24c M2 (r0004, MP71, 2026-11-18; `agent-mail` `evidence/weekend-mega-2026-11-14/rig/Q24c-PC1/`) read
  the hostage's `+0x3f4` = 3 on every row of its 125 u run under 0x1b (1558.78-1561.38), 1 at the push and once stopped. Neither
  Q24c trial put door_rg_1 on the run's line, and the door goal was never pushed in either: the door use under a flight is a
  reading, not yet seen running. The capture that would show it is queued for the next Shadow session (L1208 in
  `NEXT-SHADOW-SESSION-QUEUE.md`).
- **The build (OT.R97; the LATER 1208 delta review, 2026-11-22, a masked word match of r0004's ELF by its reviewer;
  reading, pending review).** The citations above are r0001's names and lines; r0004 is the same logic at moved addresses
  (every differing word a relocated address or call target): `FUN_005f1160` = r0004 0x5f8940 (its calls of the route
  0x567ad0 at 0x5f8a54 and 0x5f8bac = r0001 D:L503231, D:L503263); `FUN_00562790` = 0x567ad0 (it calls 0x528290 with
  the controller + 0x46c, then 0x571f30 with 3); `FUN_005fae70` = 0x602650 (its walker call at 0x6028c4 = r0001
  D:L508454, a line inside the function, not its head); `FUN_00567900` = 0x56cc40; `FUN_0056cbf0` = 0x571f30;
  `FUN_00527fd0` = 0x528290; the walker's valve test the port cites as r0001 0x567f0c-0x567f14 is r0004
  0x56d24c-0x56d254, word for word.
- **(C) The deciding captures, 2026-11-22: NOT DECIDED (row 13 of the sprint skipped for v0.4.30).** r0004, hand-scored,
  unreviewed; `agent-mail` `D:/s2u-records/L1208b-PC1/` (sha 4945e242..., three consoles, 13 trials) and
  `D:/s2u-records/L1208c-PC3/` (sha 28ca7efb..., two consoles; the hostage PLACED by a set-up position write, a method
  change named in its summary). No trial counted (a following hostage at rest 4-10 u north of door_rg_1 with the predicted
  landing on the door line). Uncounted: every flee that ran (L1208b T3, T4) went AWAY from the door with no door goal --
  consistent with the earlier L1208, not a refutation (the door was not on the run's line). Seen, uncounted, under the
  FOLLOW (not 0x1b): with its leader standing at (2194.5, 824.0), a follower routed THROUGH door_rg_1 -- the door goal
  0x00668fe0 / +0x30 11 pushed over the follow at (2190.99, 795.53), the door opened, the follower crossed z 786.2 -- as
  L1208's T5 saw; this is the follow's door use (research 428 s3), which the port already builds. What would still decide
  the flight's: a fleeing hostage whose run crosses the shut door's cell -- the follow itself opens the door from that
  side, so a park north of it with the leader north is not reachable; a park SOUTH of the door (the leader south, the
  landing south, the run north through the door) is the next geometry to try.
- **Unread:** what 0x1b does when 0xb is pushed over it and when it resumes (its signal slot; whether it re-plans), named
  `HOSTAGE_FLIGHT_DOOR_HOLD_PLACEHOLDER`. This partly reads `HOSTAGE_FLEE_MOVE_PLACEHOLDER`: the run is the walker's route steering
  in movement state 3; the rest of 0x18's tick stays unread.
- **The port** (`match/src/hostageFollow.ts` `run`): the follower's type-1 dispatch on the flight's route and the same door
  action (`doorTick`), the run held under it; on its completion the run goes on along its route and the follow's state is left
  as it was. `test/hostageFlightDoor.devdisc.test.ts` (MP71 door_rg_1).

### 5.10 SHOTS-1208: six departures the follow and the flight carried (2026-11-24, seat-shots' implementer; reading, pending review)

Read at r0001 by the author seat from the decompilation (D:L below), and held at r0004 by a non-author key job
(seat-kill, 2026-11-23: each r0004 twin compared word for word with capstone, its callees paired by site; `agent-mail`
`planning/mega-2026-11-21/pilot/kill/keyjob-shots1208-r0004.md`, outside git), except r11, which postdates the key job and
is r0001 only. No capture or trace of the original backs any row: each is a reading, pending its review. The pins:
`match/test/hostageShots1208.test.ts` (each test asserts it reached its path); `match/test/hostageShotAt.test.ts`'s
F3 test changes with r125.

| Lead | Port site | The original | Fold | Level |
|---|---|---|---|---|
| r108 | `hostageFollow.ts` `control`, sub 0 / 2 | `FUN_005623b0` D:L426850-426871 re-plans (cancel, empty, request) only when the target cell's soil passes (`FUN_0052a180` / `FUN_0052a090`); `FUN_005fb1c0` case 2 D:L508825-508835 waits 2.5 s only with no answer path (`+0x508` 0) or a request not done (`+0x4ec` != 4), else lays the answer again (`FUN_00526540`) and walks at once; r0004 0x5676f0, 0x6029a0 | an untraversable target leaves the old request (`ticket`, kept after its answer as the last request's state) and the route; sub 2 walks on along the REMAINING route (+0x508 is the live route's remaining count: `FUN_00524d00` pops a node by decrementing it; `FUN_00526540` D:L393116-393163 rebuilds only the sub-map list), or waits 2.5 s when none remains or the last request is not done (review 1 F1: the first fold re-walked the whole old answer) | reading, pending review |
| r58 | `hostageSteering.ts` `step` | `FUN_00567900` D:L429556-429559: the last point's throttle is zeroed only while `+0x3f4` is not 6; an action point zeroes it in any state (D:L429560-429566); `FUN_0056cbf0` forces 6 while follow is on top (D:L431676-431687); r0004 0x56cc40, 0x571f30 | `step` takes `movementState` and `action`; the follower passes 6, the flight's run 3 (Q24c M2, s5.9), and a yielding follower `HOSTAGE_YIELD_MOVEMENT_STATE_READING` (4; review 1 F2): under a yield (AI state 3 above follow, D:L420802) the follow tick with a top not 9 restores the previous state (`FUN_0056d090`, D:L508399-508404), the force to 6 needs follow on top, and the yield tick sets 4 (`FUN_00601f80` D:L511960, D:L511979); 6 again only on follow's resume (D:L510104) | reading, pending review |
| r152 | `hostageFollow.ts` `stop` / `enter` | `FUN_005fdf80` writes `+0x76` only on event 0, the enter (D:L510077); suspend, resume and exit leave it; the follow tick clears it (r1 0x5fb470 / r4 0x602c50); r0004 0x605780 | `stop` no longer re-arms the gate; `enter` does, called on state 9's signal 0 (`extraction.ts`) | reading, pending review |
| r125 | `hostageAi.ts` `flee`; `extraction.ts` `scanDanger` | the scan pushes 0x1b only through `FUN_005f5cd0(ctrl, 0x1b, 0)` (D:L482954-482955), bit 27 of `+0x428`, the AND of the stacked states' masks (`FUN_005f7470` D:L506410-506590, the key job's carried link confirmed in both builds, r0004 0x5fec50); 0x13's mask 0x31040800 lacks it (D:L506540) | `HostageAi.canFlee` (the whole can-push test) gates `flee` and the scan's `inFlight` | reading, pending review |
| r117 | `extraction.ts` `flashCower` | `FUN_005a3070` D:L460103-460148: the world head LOOK -- the CLook direction `+0x11a0` (body space; stored D:L465562 in `FUN_005ad920`, D:L465599 in `FUN_005ad9d0`) through the rotation of `+0x28`, the BODY's scene node; r0004 0x5a8be0 | **NOT folded**: the room models no hostage head-look rotator to compose (the watch records only its target, `HOSTAGE_WATCH_LOOK_PLACEHOLDER`); the body facing stays, under `HOSTAGE_COWER_HEAD_PLACEHOLDER` (research 447), whose doc now says so. Settles: the hostage's look rotator built (its requests, speed and rest direction; the rest direction unread) | placeholder (the departure named) |
| r11 | `hostageFollow.ts` `control`, the fallback goal | `FUN_005fb1c0` D:L508700-508703: the leader's velocity (`+0x38`) scaled by `DAT_00650c30` (0x3f266666 = +0.65, from the r0001 ELF's bytes) on three axes (`FUN_00309180` D:L207463-207469) and ADDED to his position (`+0xa4`; `FUN_00309240` D:L207510-207515), then the slot offset with y 0 (D:L508712-508718); `+0xa4` / `+0x38` carried from research 334 r11 | goal = feet + 0.65 x velocity on x, y and z, then the slot offset (the port subtracted, on x and z only) | reading, pending review -- r0001 read; 0.65 not re-read at r0004 |

## 6. Online (A; R's F5; D)

The network handler `FUN_002c17b0` (D:L163757-163767) runs the sending actor's kit through `FUN_005bd030` (D:L474173-474179),
which sends 0x97 (C4) to the place path `FUN_005bc730` and the thrown items to `FUN_005c5340`: **a remote player's frag and C4
are in the host's list**, under the remote owner, and the host runs every hostage's AI (research 191 s1). **A remote player's
satchel is not:** 0x98 goes to `FUN_005c5340`, which registers types 1-3 only; `FUN_005bc730`'s other callers sit in the
item-use tick `FUN_005c1970` (D:L476985, D:L477010), and both are on its local branch only: the tick asks the kit's controller
(`kit+0x830 -> +0xc0`, its vtable `+0x34`, D:L476875) and in the remote controller's case returns 1 (D:L477147-477149) before
either call. The slot is `CRemoteCtrl::IsRemote` (`0x5e6260`, returns 1; the local SEAL, AI and Squirm controllers share
`0x544200`, returning 0: research 181, the vtables read in the ELF). r0004 the same: `FUN_005c8860`, the gate D4:L518716, the
remote return D4:L519150-519151, the place path `FUN_005c32e0` (= `FUN_005bc730`) at D4:L518828 and D4:L518853 on the local
branch; the slot's two bodies map to `FUN_005eda30` (`IsRemote`, returns 1, D4:L539524) and `FUN_00548c10` (returns 0,
D4:L450916), r0004's vtables themselves not re-read. So a remote satchel never reaches the host's list --
`HOSTAGE_DANGER_REMOTE_SATCHEL_READING` (reading, pending review).

## 7. Readings and placeholders: the port

The port's room is the session master (research 191 s1; `match/src/extraction.ts`). Every player is a remote controller to it.
Its hostages get the scan each game frame over the room's live projectiles: a frag (`M67`, `HE`) in flight or at rest, a placed C4,
fuse at most 16 s, within 200 u; the flight on the hostage AI's navigation (`hostagePath.ts`, the disc's own AI maps).

| Name | Value | Basis | Level |
|---|---|---|---|
| `HOSTAGE_DANGER_SCAN_READING` | `{ range: 200, fuse: 16, near: 50, visible: 0.25 }` | sections 1, 3 (E) | reading |
| `HOSTAGE_DANGER_SCAN_ENABLED_READING` | on | section 1: set at init; no MP map's group read naming a hostage | reading (the groups unread) |
| `HOSTAGE_DANGER_KINDS_READING` | frag (0x79, 0x7e), C4 (0x97); the satchel by its placeholders | section 2 | reading |
| `HOSTAGE_SATCHEL_FUSE_PLACEHOLDER` | none: a satchel never qualifies | `DAT_00437d44` unread | placeholder |
| `HOSTAGE_DANGER_REMOTE_SATCHEL_READING` | not in the host's list | section 6: the net path registers no 0x98, and the item-use tick returns at its remote gate before its place path (r0001 D:L476875, D:L477147-477149; r0004 D4:L518716, D4:L519150-519151) | reading, pending review |
| `HOSTAGE_DANGER_NEIGHBOUR_READING` | every live seated player and hostage | section 3: the list 0x436330's members; what clears `+0xe1` bit 3 not all read | reading (the main controller's ruling, 2026-11-18, corrected by R's F4) |
| `HOSTAGE_DANGER_REMOTE_PLANTER_READING` | `'notice only'` | section 3 test 4: no local human in the room | reading (ruled, way (A)); H478 |
| `HOSTAGE_DANGER_SIDE_PLACEHOLDER` | seen bits that read back as seen | the hostage's side value (`ctrl+0x10c -> +0x58`) unread; sides 0, 4 and 8 never read back as seen; the bits are shared by every AI (section 3.3, section 5) | placeholder |
| `HOSTAGE_NOTICED_FLAG_PLACEHOLDER` | never set | flag 0x200's setter not found | placeholder |
| `HOSTAGE_SIGHT_PLACEHOLDER` | fov 65 deg, range 1000 | `FUN_00573130`'s 1.134 rad and the constructor's range; the hostage's AI record unread | placeholder |
| `HOSTAGE_DANGER_VISIBILITY_READING` | the eye 18 over the cell; the cover past 30 u: kinds 12 / 4 / 5 add 0.35 / 0.5 / 0.85 within 15 / 18 / 20 u | `FUN_00538d10` (D:L403738-403775) walking the AI navigation (`FUN_005352d0` D:L401979-402107; the occluders `LAB_005390d0`, machine code 0x5390d0-0x539234, and `FUN_00539240` D:L403883-403932; the ELF's 0x64f9e0-0x64fa30) -- LATER 1245, s3.7; was `HOSTAGE_DANGER_VISIBILITY_PLACEHOLDER` (the collision hull) | reading, pending review |
| `HOSTAGE_VISIBILITY_RECORD_PLACEHOLDER` | type 1 or 7 occludes, as loaded | a bit-7 cell's marker (`FUN_00530d10`) of type 1 or 7 with +8 bit 4 and +6 bits 4-6 clear occludes whole; the load clears those bits on every marker (D:L385775-385780; research 404), so the port occludes every type-1 / 7 marker cell; who sets them at run time (a door opening?) unread | placeholder |
| `HOSTAGE_FLEE_RADIUS_READING` | the item's `explosionRadius` (200 with none) | section 3.6 | reading |
| `HOSTAGE_FLEE_POINT_READING` | the 8-direction depth walk, `n = int(R * 1.2 * 0.1)`, to `n + 2`, accepted at `n - 2`, else the walk's cell at any depth | section 5 | reading, pending review |
| `HOSTAGE_FLEE_FALLBACK_PLACEHOLDER` | the walk's own cell at any depth, after the cover search | case 3's third attempt (D:L423305-423315); why the original's failed at Q24c M1 (it held) unread | placeholder |
| `HOSTAGE_COVER_SEARCH_READING` | depth 10, 400 pops, the neighbour order 0x64f910, blockers 0 / 8 / 10, crossed kinds not 0 / 8 / 9 / 10 | section 5 (LATER 1226) | reading, pending review |
| `HOSTAGE_COVER_OBJECTS_READING` | none | the callback's `FUN_0053a500` (`CAiOverlayList::Contains`) over the list 0x66a0b8 (a bit-5 cell under an object's footprint): the AI overlay list -- r0001 0x66a0b8, its first node +8 0x66a0c0; r0004 0x669a38, the same layout -- is written only by `AddOverlay` (`FUN_00510530`), whose one caller is `CVehicle::Init` (`FUN_003adab0` D:L303286; r0004 `FUN_003cfc00` D4:L328877), and `ClearOverlays` (`FUN_005104e0`); `CVehicle`s are built by two paths over `ai_vehicles.rdr`'s `VEHICLE` definitions -- `ScanForVehicleDefinitionHookups` (`FUN_003ad910`), a scene node whose name starts with a definition's (D:L303489-303490), and `CVehicle::Spawn` (`FUN_003ae030`, D:L156070-156072) -> `ScanForVehicleByName` (`FUN_003ad760`) for each record of the map's own `vehicles.rdr` with a `vehicle` key (kind 2, D:L400427-400437), its node matched by the record's `name` (D:L303067), any name; research 335 s5; no map with hostages but M71 has one by either path (`hostageOverlayScope.devdisc.test.ts`, every map on the disc, campaign maps included). **Scope: the disc's own maps with hostages but the campaign's M71** -- the disc's 13 maps with hostages are MP6, MP10, MP11, MP52, MP53, MP71, MP82 and the campaign's M51, M52, M61, M71, M73, M83; on M71 a scene node `tank1` builds a `CVehicle` (path 1), so the original's list holds the tank's footprint there and this value does not hold -- a KNOWN DEPARTURE (LATER 1445) (the vehicle producer is unported, research 335 s5); a new map with hostages, or a new vehicle on one, fails that test. Outside the scope: a forge layout placing hostages on a base with a vehicle -- MP2 (its `tank1`) is reachable today; the campaign's bases are not (no multiplayer mission entry, so no extraction room; their AIMAPS refused, so no planner), so neither is M71's departure. | reading, pending review (D) |
| `HOSTAGE_COVER_VISITED_READING` | a fresh flood each search | section 5: `FUN_00536c80` sets bit 2 of +3 on an accepted neighbour (D:L402939-402943) and clears it over the grown region (`FUN_00518180`, D:L402960-402995); r0004 `FUN_0053b6d0` D4:L442492-442542 -- was `HOSTAGE_COVER_VISITED_PLACEHOLDER` (2026-11-23) | reading, pending review |
| `HOSTAGE_COVER_MOVE_KIND_PLACEHOLDER` | the walk's run | the cover search pushes move kind 4 (D:L423292), the walk 0xc (D:L423276): the difference unread | placeholder |
| `HOSTAGE_COVER_MARKER_CENTRE_READING` | `{ scale: 0.75, none: 8 }`: a bit-7 blocker's centre moved 0.75 along its marker record's direction nibble unless it is 8 | section 5: `FUN_00518900` D:L386177-386185 (r0004 `FUN_00518bc0` D4:L423200-423253); `DAT_0065b030` = 0.75 (r0001 ELF), `DAT_0065b090` = 0.75 (r0004 served ELF) -- was `HOSTAGE_COVER_MARKER_CENTRE_PLACEHOLDER` (`'the plain centre'`, 2026-11-23) | reading, pending review |
| `HOSTAGE_FLEE_END_PLACEHOLDER` | 2.5 s after the object is gone or its thrower no longer resolves (sub-state 8's 1.0-1.8 + f not built) | the ranges of section 5; `f` from the unread skill | placeholder |
| `HOSTAGE_FLEE_POSTURE_READING` | `{ inside: 2, outside: 1, stand: 0, base: 0.25, spread: 0.95 }`: 7 prone, 8 crouch, sub 0 a prone hostage to stand, each after 0.25 + U(0, 0.95) s | D:L423103-423107, D:L423488-423517 (s5; LATER 1224); Q24c M1 and M2 (C); was `HOSTAGE_FLEE_POSTURE_PLACEHOLDER` | reading, pending review |
| `HOSTAGE_EVENT_LOOK_PLACEHOLDER` | not built | the 0x19 look (section 5) reached only through rule 3.1 (marked, not seen) -- in the room only for a departed thrower's frag; the cue's name, skill and how often the gate opens unread | placeholder |
| `HOSTAGE_FLEE_LANDING_PLACEHOLDER` | away from the object where it stands | `FUN_0055cdc0`'s landing prediction (and the velocity component removed without one, D:L423227-423242) unread | placeholder |
| `HOSTAGE_FLEE_WALK_OBSTACLES_READING` | the soil alone | the walk's stop at a cell in the overlay list (`FUN_00535a40`, `CountMapTravelDir`, 0x66a0c0) never fires: the same list as `HOSTAGE_COVER_OBJECTS_READING`'s, empty on the maps with hostages but M71. **Scope: the disc's own maps with hostages but the campaign's M71** (KNOWN DEPARTURE (LATER 1445)), as `HOSTAGE_COVER_OBJECTS_READING`'s | reading, pending review (D) |
| `HOSTAGE_FLEE_MOVE_PLACEHOLDER` | the planner's route to the cell at throttle 1, on the follower's normal route steering | the move child 0x18's tick is unread | placeholder |
| `HOSTAGE_FLIGHT_DOOR_HOLD_PLACEHOLDER` | the run held under the door goal (0x1b told it still moves, its sub-state unchanged); on the goal's end the run goes on along its route, the follow untouched | section 5.9: 0x1b's suspend and resume under a pushed 0xb unread; the port's 0x1b frame still runs under the hold, so the object's loss during it drops the door goal at once, where the original's 0xb would finish first | placeholder |
| `HOSTAGE_YIELD_MOVEMENT_STATE_READING` | 4 | section 5.10 r58: the walker's movement state under a yield -- not 6 (the force to 6 needs follow on top, D:L431676-431687; `FUN_0056d090` restores the previous state, D:L508399-508404), and the yield tick `FUN_00601f80` sets 4 (D:L511960, D:L511979); which yield sub-state the port's `yielding` stands for is not tracked. In state 4 the dispatcher takes its case 4 (D:L432578-432581), which does not call `FUN_00567900`: whether the route is walked under a yield at all is UNREAD; the port's walk while yielding is its earlier model, and 4 keeps that model braking at the last point (the conservative outcome; SHOTS-1208 review 2 F1). Settles: a read of the yield's movement case 4 and whether it steps the route | reading, pending review |
| `HOSTAGE_DANGER_GATE_BITS_PLACEHOLDER` | admitting | ctrl `+0x265`, `+0x430` bit 2, actor `+0xe1` bit 0x10 on a hostage unread; a hidden (rescued, faded) hostage takes no push | placeholder |

**(B), recorded for the owner (H478):** a room that treats every player as the host's local human -- any same-side charge within
the flee radius sends a hostage running, noticed or not. Not built.

**What would prove it:** a capture of the original on MP6 (r0004 rig): a hostage watched while C4 is planted and an M67 is thrown
near it, once by the host and once by a remote client, the frag once from inside its radius and once from beyond it; record state
0x1b (and 0x19) pushed (`+0x42c` bits 27, 25) and the position over time. It settles test 4 for the host's charge, the look's
reach, the flee distance and the end timer.

## 8. Corrections to earlier notes

- Research 189 s2 (:165), row #16 (:53) and s12 (:319); research 207 (:170); research 238 (:243): each said that online a hostage
  reacts to no gunfire, blast or death. True of the AI event mask (`FUN_00572d70`); **wrong of explosives**: the danger scan of
  section 1 runs outside it, and a hostage runs from a frag or C4 (this note).
