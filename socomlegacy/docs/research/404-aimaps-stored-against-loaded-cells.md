# 404 -- AIMAPS cells: the stored first word and the word the original keeps after load (LATER 933's landing)

- Date: 2026-11-12. Task XS-CELLS (the main controller's brief: test whether the load-time cell rewrite explains
  LATER 933, HOSTAGE-LANDING-PIN). Branch `agent/xs-cells` (base `agent/v0420` f2d9c9c87).
- **Brought to `main` by the hub's split (2026-11-12).** Written as one note of 5,185 lines on `agent/xs-cells`
  (41f1aa4fdb9f); split here into four along the lane's own cut lists: this note (LATER 933's landing), research 417
  (LATER 957), research 418 (LATER 958) and research 419 (LATER 956). The text of every section is the lane's,
  unchanged but for the cross-note references and the dated sections added after the lane closed (section 34 here).
  **Review on the hub: PASS WITH FINDINGS** (2026-11-12; two reviewers on the hub who did not write it, one on
  sections 0 to 23, high confidence, one on this head and sections 24 and 26 to 34, medium-high; six MEDIUM and
  sixteen LOW between them, each folded or recorded in the section at this note's end). Neither found anything wrong
  at the source in a claim a fix would be built on; the mediums are places where the head and some conclusions were
  not brought up to date with later measurements, or say more than their own open items allow. With this review the
  note's claims count as **readings**, at the level each states; its measured rows are the rig's, checked against the
  hub's record of them.
- **Corrections to this head, from the hub's review (2026-11-12; the bullets below are kept as the lane wrote them).**
  (1) Wherever this head (departure 9; "Two online-only insertions") and s27.3 say the trail is emptied "when his body
  enters a new walkable cell" during a jump, the MEASURED trigger is one frame after the jump begins, in the cell he
  jumped from, and the trail stays empty through the air, the landing and standing (the rig's scenario D, n = 1:
  research 417 s25.10). s27.3's what-if modelled the old trigger, so its conclusion is unproven under the measured
  one. (2) "PENDING the rig's hit-or-no-hit at r4 0x602f4c ... not yet known whether that arm runs" is stale: the
  fallback arm DID run at an order with a trail of 2 (s31.5, measured), there was no hit at r4 0x602f4c while the gate
  held (s32.4), and it ran after a jump (scenario D). (3) "The second reader of r4 0x594dd0 is pending", "a blind
  second queued" on the trail's enable, and the STATUS's "path-by-path comparison is still being written" are stale:
  each is in and agrees (research 417 s20.11; s26.9; s15.3a). (4) Departure 7 as restated ("a CSealCtrl or CRemoteCtrl
  leader, whose trail is on at build and never switched off") is shown for CSealCtrl only: CRemoteCtrl's slot `+0x2c`
  returns 0 in the r0001 bytes, so its "never off" rests on s26.3's reading of its tick, which s26.8 leaves
  undetermined. (5) The gate (s24, s32.4): "the same in both builds and in the port" holds for its rule, the threshold
  and the count; the ARMING is not covered by it -- the port re-arms on a leader change (departure 6) and whether the
  original's order to a new leader makes a new goal is not determined (s24.1).
- Track: **simulation** (a reading only). No reader and no consumer is changed by this note.
- **STATUS (2026-11-12, after s15): positions stand; the bit's values stand.** The two r0004 traces' positions, and
  their `+0x171` bit-7 values as the FOLLOWING hostage's controller's (the rig took the controller from the body,
  s15.2), are measurements (n = 1 each). **The bit's mechanism is unexplained.** There have been three readings of
  `FUN_005fae70`. Two are overturned (s13, s14.2). The third is in the s14 banner: the single 1-path, with its
  network-flag clause. It was one reviewer's, and a blind second reader now agrees on the 1-path; their path-by-path
  comparison is still being written. It is still code, not measurement, and the five reads of s15.6 are its test. The
  rig's a0 and that reading's "a0 = this" are both correct: the a0 was read one instruction before the delay slot that
  sets it (s15.3, reconciled by this author and by the reviewer from both builds' machine code). **No statement about
  the bit in this note is to be used for a fix until a trace with a settled handle agrees with it.** Nothing is built
  on it. s16-s19 rest on positions only.
- **The port's three named departures (s17.3) are departures by reading only.** **None is yet shown to cause the pin
  or the missing wait.** Each, with its lines:
  1. the re-located target point (`hostageFollow.ts:472`, `:478`, against D:L508688-508692);
  2. the unrun slot-`+0x2c` branches (`hostageFollow.ts:158`, against D:L508752-508775 and D:L508963-509045);
  3. the correction on every move (`hostageFollow.ts:591-599`, against D:L413920-413934).

  In s18, the `trailcell` what-if (1) changed nothing, and no what-if made the port wait at the foot.

  **Added 2026-11-12: a fourth and a fifth.** Like the three, each is a departure BY READING, not yet shown to cause
  the pin or the missing wait; neither has been run.
  4. **The online step on the fallback arm is missing** (research 417 s20.7). It is of a different kind from the other
     three: "a
     departure from the build players run, not from r0001" (redotcom-19's words). The port's fallback target
     (`hostageFollow.ts:473-478`) transcribes r0001's arm (D:L508699-508719). It has nothing that stands for r4
     0x594dd0 (research 417 s20), which online re-derives the target CELL from the leader's cell.
     **Its scope** (the main controller's ruling on research 389 s3, 2026-11-12): it "applies wherever the port
     answers the network byte as 1: by the main controller's default of 2026-11-12, a match in a room; not a page
     walking alone (LATER 957; research 389 section 3)". The ruling in full is in research 417 s20.7.
  5. **The leader's recorded cell** (s21.6). The port takes the leader's RAW located cell (`there`,
     `hostageFollow.ts:316`). It saves that cell on arrival (`:489`) and tests the release against it (`:482`). The
     original uses the leader's recorded cell `+0xe8`, the last WALKABLE cell (D:L471318). That cell is copied to the
     goal's `+0xc0` (D:L508620) and saved to `+0xc8` with `+0xc4` = 1 (D:L508960-508961). `FUN_005fc7d0` compares the
     two (D:L509240-509255). So a leader who walks across non-walkable cells moves the port's cell and not the
     original's.

  **Added 2026-11-12, later: a sixth, a seventh and an eighth, at the start gate** (s24.4). Each is a departure BY
  READING, effect not run; both sides' lines are in s24.4.
  6. **The gate re-armed on a leader change.** The port: `hostageFollow.ts:310` -> `stop()` -> `:247`
     (`started = false`). The original: a leader change sets 0 INIT only (D:L509996-509999); `+0x76` is set by goal
     event 0 alone (D:L510077).
  7. **The trail deleted with the last follower.** The port: `packages/match/src/extraction.ts:748` and `:642`. The
     original never switches a human-class leader's trail off (D:L509375-509400). This one DEPENDS on the ruling "the
     room stands where the leader's console stands", and on the 26 words in the body's cell update (research 417 s25),
     the
     function that owns that trail.
  8. **The first entry one cell early.** The port: `extraction.ts:746` adds the leader's current cell on the first
     frame. The original: the first entry is the first cell that differs from `+0xe8` (D:L471284-471309).

  **Added 2026-11-12, later: a ninth, from r0004** (research 417 s25.6).
  9. **The trail never emptied on a jump.** The port's leader trail is written at `extraction.ts:737-748` (the add
     at `:746`) and by `FollowTrail.add` (`hostageFollow.ts:133-140`); neither has any term for the leader's jump or
     landing. r0004 online empties the locally driven human's trail when his body enters a new walkable cell while
     his current action is a jump's launch, fall, landing or hard landing. In redotcom-19's words, it is "of a
     different weight from the others: it would act on every Extraction map, on any follow, whenever the leader
     jumps". The 26 words were read by one reader and then by a second, independent one, who agrees (research 417
     s25); still a
     reading; effect not run (a what-if is running).
     **2026-11-12, later: the what-if has run (s27.3).** In #798's scenario the trail reset with the r0004 step
     shortens the hold a little and changes #798's verdict in no row the port fails.

  **Added 2026-11-12, later: a tenth, the refused request** (s27.2). A departure BY READING; the runs of s27 never
  reach it.
  10. **A request to a non-walkable target.** The port: `register` refuses it (`hostagePath.ts:496`). The follow tick
     has already emptied the route (`hostageFollow.ts:494`), so the empty answer sends it to COVERING (8) (`:504`),
     and it returns to INIT (0) after the wait (`:485`). The original: a non-walkable target leaves the route object
     untouched (r1 0x5625a0, s23.2 (a)), so an older finished route is taken and walked in FOLLOW (3); only with no
     such route does WAIT (2) go to COVERING (8).

  **Restated 2026-11-12, later (s26.6): departures 7 and 8 by the leader's class.** A locally driven human's trail
  is on from the body's build (one reader until the second is in). So 7 ("the trail deleted with the last follower")
  is a departure for a CSealCtrl or CRemoteCtrl leader, whose trail is on at build and never switched off, and
  matches the original for an AI or CSealCtrlCopy leader. 8 ("the first entry one cell early") becomes: with the
  trail on from the build, the leader's cell is normally already the original's entry 0; the port lacks the older
  entries.
- **The r0004-only step is the specification online** (2026-11-12, the main controller's ruling under MISSION OT.R97).
  OT.R97 makes r0004 the original that the parity rule follows for gameplay, wherever r0004 and r0001 differ in what a
  player meets in a round. Online play is r0004's. So the step that r4 0x594dd0 adds to the follow goal's update
  (research 417 s20)
  is not a curiosity beside the specification: online, it IS the specification. The port's fallback target
  (`hostageFollow.ts:473-478`) is a transcription of r0001's arm (`FUN_005fb1c0` D:L508699-508719; research 417
  s20.7), and it
  lacks the step wherever that arm runs. In the main controller's words, this raises LATER 933 from "a pin on one
  staircase" to "the follow target online was transcribed from the wrong build on one arm". That is **PENDING the
  rig's hit-or-no-hit at r4 0x602f4c** (s15.6, step 3a): it is not yet known whether that arm runs in the traced
  follow at all. The sentences above stand as written: three readings of the tick; the port's departures by reading;
  nothing built until a trace agrees.
- **Two online-only insertions in r0004 sit on hostage following's two inputs** (2026-11-12, redotcom-19's words):
  "the
  follow goal's fallback target (r4 0x00594dd0, read twice) and the body's per-tick cell and trail update (26 words at
  r4 0x5be350-0x5be3b4, read twice)" (research 417 s20, research 417 s20.8, research 417 s25; the range corrected
  2026-11-12 from "-0x5be3b8", which is the
  first word after the insertion). The first wording here said that this insertion was unread. **Corrected
  2026-11-12: the insertion is read, by two readers independent of each other (research 417 s25); still a reading.**
  Online, it empties the locally driven human's trail when his body enters a new walkable cell while his current
  action is a jump's launch, fall, landing or hard landing. Every statement in s16-s19 and s21 about what the trail
  holds, when it is appended, and what the leader's recorded cell is, is now **[I1] except as research 417 s25 reads
  the r0004
  twin; the append's twin r4 0x525010 (300 words, 293 identical, 7 relocated) is unchanged**. The dated lines at the
  head of those sections keep their first wording and point here.
- **A human leader's trail is on from the body's build** (2026-11-12, later; one reader, a blind second queued; s26).
  The body build ends by calling the controller's slot `+0x40`, which for CSealCtrl, CRemoteCtrl and CSealCtrlCopy
  enables the trail with capacity 75, in both builds. Every placement of the body empties the entries and keeps the
  enable. So s24.3's premise "the trail is empty at the first follow of the session" does not hold for a CSealCtrl
  leader; s24.3-s24.7 are restated in s26.5-s26.7.
- **A third r0004-only step, known ground: R4B-11** (2026-11-12, later). The map loader `FUN_002ac410`'s twin calls
  r4-only code, r4 0x5294b0, with the map's name and the navigation manager, right after the AI maps load (r4
  0x2ae130-0x2ae13c; research 417 s20.8). It is the r0004 plan's open row R4B-11 (`plans/r0004-option-b.md:92`), not
  built;
  review16 read it independently (research 417 s20.12). MP71's walkable data in r0004 differs from the disc's by six
  cells of the
  first sub-map set to type 0; none is on the flight or the landing.
- **The standing of the 26 words** (the deciding seat's wording, 2026-11-12, later): COUNTED by the r0004
  investigation's sweep (the hub's evidence, outside git: +26 in `FUN_005b7ba0`, unread there); READ here, twice,
  independently (research 417 s25). Where this note says another reader "finds" them (research 417 s20.8), read
  "counted there, read here".
  Likewise `FUN_00594cf0`'s r0004 changes: counted there (+49), read here once (s26.2).
- **What is new to the project's records** (the deciding seat's list, the only one this note uses for what it adds):
  the 8-word insertion in the follow goal's update and r4 0x594dd0 behind it (research 417 s20); what the 26 words DO
  (research 417 s25); the
  binder (research 418 s22.10); the walker's type-4 and type-7 bodies and the type-1 tail (research 418 s22.4); the
  unrecovered function with
  the trail's enable (research 419 s22.12, s26); and the count of 26 lost jump tables, which is the deciding seat's
  count from the
  decompilation's warning text.
- **How an address or a subject is searched here, from now on** (the deciding seat's rule): an address with and
  without leading zeros and "0x", over `socomlegacy/docs` whole (plans too, not only research), and a subject by more
  than one word. The first search for the loader's call ("005294b0", "fix-up") missed the plan's "0x5294b0" and
  "nav-map edits".
- **The seam** (2026-11-12, later; s28): by one reading the original's route extension builds the same off-link pair
  the port does, and its walker steers it the same way; the port's pin is then in what follows the route -- the
  correction on the landing cell (s12.3) -- pending the rig's third scenario.
  **Later, 2026-11-12: read twice, the two readers agreeing (s28.8):** the route's shape is excluded as the cause of
  the port's pin by two readers.
- **The rule of the simulation track for this row** (the main controller's, quoted): "nothing built on an r0001
  reading of hostage following merges until its functions are shown identical in r0004 or read there; every function a
  933 fix relies on carries its row of the comparison table in the fix's report." The rows found so far are in
  research 417 s20.8.
- **The decompilation's text of `FUN_00567900` omits three case bodies** (research 418 s22, added 2026-11-12). Every
  port line
  transcribed from that function's dispatch on the marker type was transcribed from an incomplete text. The table
  itself was already found from the bytes by research 200 s3.1 and 334 s14.
- **r0004's goal update is NOT r0001's code** (2026-11-12; the reviewer's `review3/recipe.md` STEP 4.6, verified
  here [V4]). The image of `FUN_005fb1c0` at r4 0x6029a0 INSERTS eight words at r4 0x602f34-0x602f50:
  - r4 0x602f34 `jal 0x57a470`, the network flag;
  - offline, a skip (r4 0x602f3c);
  - online, r4 0x602f4c `jal 0x594dd0` with the arguments G+0xa4 (the leader's position), G+0xf8 (the target
    position),
    G+0x104 (the target cell) and 1.

  This sits on the fallback arm, the one taken when the trail gave no usable cell (the skip past it is at r4
  0x602e48), right after r0001's code has filled `+0xf8` and `+0x104`. r4 0x594dd0 has one caller, has no match in
  r0001, and is NOT READ. **Read 2026-11-12 by one reader, from the r0004 bytes; a second reader is pending (research
  417 s20).** It
  can rewrite the target CELL `+0x104`, never the position `+0xf8`. The sentence below now holds for the cell only.
  **So no r0001 reading of the follow TARGET on that arm carries to r0004 until r4 0x594dd0 is
  read.** The traces are r0004 online; the decompilation is r0001. The s14.1 assumption ("everything below assumes
  they
  match r0001") is false for `FUN_005fb1c0`.
- Status: **reading**. A reviewer who did not write this re-read it (s9). The rewrite and the correction's inputs are
  transcribed from the decompilation, and the cell words come from the disc through the repository's own reader.
  Nothing here was measured running: no capture and no trace of the original was taken. s8 is a port-code inspection,
  not a reading of the original. s10 and s11 were re-read by a second fresh review (2026-11-12); they hold, with the
  corrections folded
  (s13.6). **s13 is reading, re-read by that reviewer, not measured**: it settles the correction's enable bit, partly
  from the ELF's machine code. **s12 (a port run under node) and s13.5 are reading, pending review.** s13 was
  corrected on 2026-11-12 by a trace
  of the original (r0004, n = 1, relayed). **s14 combines that trace, a fresh re-read and port runs; its readings are
  pending review.**
- Review: re-read at the source on 2026-11-12 by a fresh reviewer who did not write it (Fable seat; evidence and its
  re-derivation scripts in `evidence/forge-stim/xs/cells/review/`, scratch outside git). Verdict PASS WITH FINDINGS;
  the verdict holds. Findings 1-8 are folded below: the line range of `FUN_00517470`; the correction's full gate (s2);
  the locate (s2a); the column-217 caveat (s2, s5); the callers of the rewrite (s1); the next readings (s6); the
  soil-13 lead (s4); and what the re-check rests on (s7). Each fold was re-checked at the source by this note's
  author before it was written.
- **The evidence folders** (2026-11-12, later): The machine-code listing files in these folders (address, word and
  mnemonic text of SOCOM II's two executables, written by the readers) live on the stim machine only: they are
  excluded
  from the lane's upload from 2026-11-12 and will not outlive that machine unless the owner says to keep them; the
  citations in this note (FUN_<addr>, D:L<line>, r1/r4 addresses) do not depend on them.
- Sources: the decompilation of the r0001 game ELF, `socom2_game.elf.decomp.c` ("D:"). This note's author re-read
  D:L385098-385262 (`FUN_005169b0`), D:L385268-385285 (`FUN_00516f10`), D:L385416-385525 (`FUN_005173e0`,
  `FUN_00517470`),
  D:L385598-385757 (`FUN_00517850`), D:L385760-385822 (`FUN_00517eb0`, `FUN_005180b0`), D:L387593-387637
  (`FUN_0051afe0`),
  D:L382430-382448 (`FUN_00510d10`), D:L398765-398790 (`FUN_005306f0`), D:L399022-399045 (`FUN_00530d10`),
  D:L399102-399125 (`FUN_00530f40`), D:L413918-413940 (the correction's call site) and D:L471270-471330
  (`FUN_005b7ba0`).
  The disc was SOCOM II US, the `RUN/*.ZDB` packs, read through `parseAiMaps` (`packages/scene/src/aimaps.ts`) at
  `agent/v0420` 520347f87; that tree's hostage code and `aimaps.ts` are byte-identical to f2d9c9c87
  (`git diff 520347f87 f2d9c9c87` over `packages/match/src` and `packages/scene/src/aimaps.ts` is empty). Related
  notes:
  research 75 (the file layout and the cell word), research 333 to 335 (the hostage planner, the location, the
  correction). No decompiled text is pasted.
- **The two builds' ELFs, and how this note cites code in them** (2026-11-12, the main controller's ruling: no new
  form; the form of research 385, 391 and 392).
  - **r0004** is the served ELF, `game/r0004/served/socom2_game_served.elf` under the desktop tree: 5,016,064 bytes,
    sha256 `ce5e7717444dfffb4abb5ef2695d9af7d7ef0f814aa744bbe1ae182ee3d200ec`. **No decompilation exists for r0004, so
    there is no D:L for r0004 code.**
  - **r0001** is the retail ELF, `game/disc/socom2_game.elf` under the desktop tree: 4,835,072 bytes, sha256
    `06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872`. Every D:L in this note is a line of its
    decompilation.
  - **r0004 code** is cited as "r4 0x<addr>", or as a range "r4 0x<a>-0x<b>", and never "r4:<addr>". An instruction is
    cited by its address and its 32-bit word. A callee that is the image of an r0001 function is cited as "r4
    0x<addr>,
    `FUN_<r1 addr>`'s twin (N words, M identical, K relocated)", and only then by that function's D:L. "Relocated"
    means the word differs only in a jal target, or in a lui immediate or 16-bit offset that forms a global's address.
  - **r0001 machine code** is "r0001 0x<addr>" in s13-s20, and "r1 0x<addr>" in research 418 s22, as the main
    controller ruled for
    that section.
  - Addresses are written without leading zeros: r4 0x00594dd0 is r4 0x594dd0. A list that follows "r4" in one clause
    keeps its prefix.
  - (Added 2026-11-12, later, the main controller's words, verbatim:) "the same number can name different functions in
    the two builds; an address without its build is not a citation". Wherever both builds appear in one section, every
    address carries its build. The case met here: r1 `FUN_00517050` (D:L385318; called by `FUN_0052c320` at
    D:L396307-396308) is the cross-sub-map conversion, while r4 0x517050 is `FUN_00516f10`'s twin (research 417
    s20.13). A
    coincidence of addresses. A second, in research 417 s20.8's table: r1 `FUN_005fd3e0` (its twin is r4 0x604be0)
    against
    r4 0x5fd3e0, `FUN_005f5c00`'s twin.
  - s14-s19 and the recipe (s15.6) were swept into this form on 2026-11-12. Where the sweep changed only the form of a
    citation, it says nothing new.
- **Marks** (note-local; s1-s12 cite the decompilation and the disc only):
  - **[V4]**: bytes read in the r0004 ELF, by this note's author unless the mark names another reader;
  - **[V1]**: bytes read in the r0001 ELF;
  - **[D]**: read in the r0001 decompilation only;
  - **[I1]**: inferred from r0001, not checked in r0004;
  - **[INF]**: an inference that rests on no line of either build;
  - **[RIG]**: the rig's measurement, relayed.
- **The follow goal's states by the goal's own names** (2026-11-12, redotcom-19's ruling, "so the rig's numbers and
  the
  note's words cannot drift apart"). The names come from the goal's name function, r1 0x5fdec0, the word at vtable
  `+0x18` (r1 0x6699b8 in vtable r1 0x6699a0). It loads the state `+0x34` (r1 0x5fdec0 `lw v0,52(a0)`, 0x8c820034).
  States of 9 or more give UNKNOWN (r1 0x5fdec4 `sltiu at,v0,9`). Otherwise it jumps through the nine words at r1
  0x662e70 to one string of r1 0x662e08-0x662e68 [V1, this author, t22 `r1.5fdec0.dis.txt`]:
  - 0 INIT;
  - 1 UNKNOWN;
  - 2 WAIT;
  - 3 FOLLOW;
  - 4 HIDE PLAN;
  - 5 HIDE WAIT;
  - 6 HIDE FOLLOW;
  - 7 HIDE;
  - 8 COVERING.

  No function at r1 0x5fdec0 was found in the decompilation's text, so the names have no D:L. Sections 20-22, and the
  recipe from step 3a on, write a state as its name with its number, for example "HIDE (7)". The earlier sections keep
  their own words, and they are not rewritten. Their "arrived-stand" (s16.2 E) is HIDE (7), and their "retry wait"
  (s16.2 F) is COVERING (8).
- **The standing account of LATER 933** (2026-11-12, redotcom-19's words, and no stronger): "a STANDING leader
  upstairs holds the follower on the flight in the original (measured, n = 1) and the port matches it to 1.27 units
  [s31.1-s31.3, s31.5]; a WALKING leader does not hold it in the original (measured, n = 1: it crosses without a stop,
  about 14 s late after about 11 s below) [s32.1] and DOES in the port (node, the same scenario: pinned on #0 (218,71)
  from 10.67 s on) [s32.2]; the correction, which the port runs on every move and the original gates on a bit that was
  clear on the flight and the seam in both crossings measured [s15.1, s32.1], is the standing lead for the pin, shown
  in kind
  by one what-if of the port (node, the same scenario): with the correction off on the flight and the seam the port's
  follower crosses (z 661.8 at 10.90 s, on sub-map 1 from 11.10 s) where as it is it never does -- consistent with the
  correction being what pins the port; the bit's rule is still an inference [s12.3, s32.1, s32.7]; the wander and its
  end are not explained"
  [s32.3].
  **2026-11-12, later (s33):** the REFERENCE a fix is scored against is the rig's repeat: "the gate opens at 8 cells,
  then straight up and across about 1.5 s behind a walking leader, no stop". "About 14 s late after about 11 s"
  below was the odd case (a trail of 2 at the order), NOT the reference.

## Index (2026-11-12; for whoever reviews and lands this note without the sessions behind it)

One line per section and sub-section, derived from the section's own text and its dated banners. **Standing**:
STANDS, CORRECTED IN s<n> (the text stands with a dated correction there), SUPERSEDED BY s<n>, or WITHDRAWN.
**Level**: "measured, n = <count>" (a trace of the original, relayed); "read twice" (a second reader, a reviewer or this
author re-read it at the source); "one reader"; "inference"; "what-if under node" (a port run or what-if under node,
never the original). Where a section mixes levels, the lowest is given and it says "mixed". **Build**: r0001 (the
decompilation and the retail ELF), r0004 (the served ELF), both, the port, or the disc (the data both builds read).

**Where each section lives (the hub's split, 2026-11-12).** The four notes were written as ONE on the multi-title lane
(`agent/xs-cells` 41f1aa4fdb9f, documents only) and keep that note's section numbers, so a reference "s25.6" means the
same section whichever note cites it: sections 20 and 25 are research 417 (r0004's two online-only steps; LATER 957);
section 22 is research 418 (the door markers and the walker's marker bodies; LATER 958), except 22.9 and 22.12, which
are research 419 (what the decompiled text omits; LATER 956); every other section, 0 to 33, is research 404 (LATER
933's landing). A reference to a section that lives in another of the four is written "research <n> s<m>"; a range
such as "s13-s20" is left as it was written.

| s | subject | standing | level | build |
|---|---|---|---|---|
| 0 | the answer: the load-time rewrite is not LATER 933's cause | STANDS | read twice | r0001; the disc; the port |
| 1 | the rewrite the original applies after reading a sub-map | STANDS | read twice | r0001 |
| 2 | MP71's landing: cell words, the link, the correction's gate | CORRECTED IN s11.4, s13.6, research 417 s20.13 (the clearer of `+0x172`; the tolerance constants 0x650918 and 0x650920 are 0; a branch on `+0x1061` bit 3 can skip the gate) | mixed: read twice | r0001; the disc; the port |
| 2a | the locate of a body on the landing | STANDS | read twice | r0001; the port |
| 3 | the census over all 34 AIMAPS | STANDS | read twice | the disc |
| 3b | Fish Hook's four flagged cells | STANDS | read twice | the disc |
| 4 | the port's consumers of a cell's first word (the bit-5 and soil-13 leads) | STANDS | read twice | r0001; the port |
| 5 | the node datum: stored against rewritten words | STANDS | what-if under node | the port |
| 6 | what the rewrite leaves for LATER 933 | CORRECTED IN s13, s14, s15 (the bit's values and frames are the trace's) | mixed: read twice | r0001 |
| 6.1 | next readings for LATER 933 | CORRECTED IN s10.1 (the follow target is first a trail cell) | read twice | r0001; the port |
| 7 | what was not measured, and how to re-check | CORRECTED IN s12.1, s13.6 (the port's pin reproduced in a run; 0x650918 and 0x650920 read: 0) | read twice | r0001; the disc |
| 8 | port-side trace at the landing (a port-code inspection) | CORRECTED IN s10.2, s12.1 (the re-leg read: no link inserted; the port's pin reproduced in a run) | one reader | the port |
| 9 | the first review and its folded findings | STANDS | read twice | r0001 |
| 10 | T14: a cross-sub-map trail point, original against port | CORRECTED IN s28.5 (departures in the splice and the append, none causing the hold) | read twice | r0001; the port |
| 10.1 | the follow target and the trail | CORRECTED IN s13.6, s32 (the recorder's feed needs body `+0x105e` bit 0; the walk-back search tests six entries, depth 5 inclusive) | read twice | r0001; the port |
| 10.2 | the splice and the re-leg | CORRECTED IN s13.6, s28.1, s28.5, s28.8 (mask 8 is bit 3; departures in the splice; the splice's four preconditions) | read twice | r0001 |
| 10.3 | the cell distance to a point on another sub-map | CORRECTED IN s11.3, s13.6, s28.5 (the conversion read through; 0x64fd78 and 0x64fd80 are 0; one of seven departures) | read twice | r0001; the port |
| 10.4 | the port's spliced seam pair (`extend.mts`) | CORRECTED IN s28.1, s28.5 (the original's spliced pair carries no link flag) | what-if under node | the port |
| 10.5 | what remained unread | SUPERSEDED BY s11 (the readings were taken up there) | read twice | r0001 |
| 11 | T15: the four readings left by s10.5 | STANDS | read twice | r0001; the port |
| 11.1 | the obstacle response; the route-scan distance departure | CORRECTED IN s12.2, s12.3, s13.3 (in the port run the record matures and recovery fires; the sub-map-0 distance alone does not free the pin; a higher type replaces a lower one) | mixed: what-if under node | r0001; the port |
| 11.2 | per-leg smoothing and re-assembly | STANDS | read twice | r0001; the port |
| 11.3 | `FUN_00567900`'s distance across sub-maps; the route head's advance | CORRECTED IN s28 (the planar-distance and distance-0 pops) | read twice | r0001 |
| 11.4 | the held body's gate bits | CORRECTED IN s13, s14 (the bit's writers; its values by phase) | read twice | r0001; the port |
| 11.5 | next readings | CORRECTED IN s12, s13 (items 1-3 settled) | read twice | r0001 |
| 12 | T16: the port's real follower at the pin | STANDS | what-if under node | the port |
| 12.1 | the port reproduces the pin | STANDS | what-if under node | the port |
| 12.2 | recovery fires but does not free the follower | STANDS | what-if under node | the port |
| 12.3 | the three what-ifs: the correction alone decides the pin | CORRECTED IN s15.1, s32.7 (the bit is clear at the landing, yet the original climbs column 217, not (i)'s column 218; with a walking leader, consistent with the correction being what pins the port; the bit's rule is still an inference) | what-if under node | the port |
| 12.4 | MP6's cross-sub-map stairs | STANDS | what-if under node | the port |
| 12.5 | what the run does and does not show | CORRECTED IN s15.1, s32.7 (the bit was clear through the landing, measured once; with a walking leader, consistent with the correction being what pins the port; the bit's rule is still an inference) | what-if under node | the port |
| 13 | the correction's enable bit for a following hostage | CORRECTED IN s14 (claims (b) and (c) contradicted by the trace) | read twice | r0001 |
| 13.1 | the bit and its writers | CORRECTED IN s14.2, the s14 banner (the 1-write is state 3's "need not move" branch, behind the network flag; the writers list stands) | read twice | r0001 |
| 13.2 | what the bit means | CORRECTED IN s15.2 (one more functional reader of the bit: the walker's type-4 body) | read twice | r0001 |
| 13.3 | `+0x32c` bit 0 | STANDS | read twice | r0001; the port |
| 13.4 | the conclusion (route-steered follower never corrected) | SUPERSEDED BY s14 (the conclusion is contradicted by the trace) | read twice | r0001 |
| 13.5 | the port run with s13's condition | SUPERSEDED BY s14 (its condition) | what-if under node | the port |
| 13.6 | the review's small corrections and the constants | STANDS | read twice | r0001 |
| 13.7 | how it was missed; the recipe and the LATER text | WITHDRAWN (the recipe's handle, s15.3/s15.6; the row text, s14.5, itself superseded by s15.7) | mixed: one reader | r0001; r0004 |
| 14 | the bit by phase: the r0004 trace against a re-read | CORRECTED IN the s14 banner, s15 (the third reading; a0 at the follow call) | mixed: one reader | both |
| 14.1 | builds; "everything assumes they match r0001" | CORRECTED IN s19, research 417 s20, the STATUS (`FUN_005fb1c0` differs; r4 0x594dd0 read) | one reader | both |
| 14.2 | a fresh re-read of `FUN_005fae70` | CORRECTED IN the s14 banner (the missed network-flag condition) | one reader | r0001 |
| 14.3 | the per-phase table | CORRECTED IN the s14 banner, s15.3 (the steering rows online; a0) | mixed: one reader | both |
| 14.3b | which machine: the slot `+0x2c` lead | SUPERSEDED BY the s14 banner, s15 (the network-flag condition; the bit clear at the landing) | inference | r0001 |
| 14.4 | the port run with the bit as the trace has it | CORRECTED IN the s14 banner (`mech` contradicts state 5) | what-if under node | the port |
| 14.5 | known and unknown; LATER row text | SUPERSEDED BY s15.7 (the LATER row text) | mixed: inference | both |
| 14.6 | the idle 0x08/0x88 datum and two mappings onto the room | CORRECTED IN s15 (candidate B dropped) | mixed: inference | both |
| 15 | the two-console trace, the rig's handle, a0 at the follow call | STANDS | mixed: one reader | both |
| 15.1 | the trace, as relayed | STANDS | measured, n = 1 | r0004 |
| 15.2 | which object's byte was watched; the type-4 body's read | STANDS | mixed: measured, n = 1; one reader | r0004; r0001 |
| 15.3 | a0 at the follow call | STANDS | read twice | both |
| 15.3a | the tick's six paths | CORRECTED IN s30 (a remote human is CRemoteCtrl r4 0x668f10, not r4 0x432b60) | read twice | both |
| 15.4 | what s15 settles (positions only) | STANDS | measured, n = 1 | r0004 |
| 15.5 | what the next trace should discriminate | STANDS | one reader | r0004 |
| 15.6 | the rig recipe and its additions | CORRECTED IN s30, s32 (reads 2, 4, 5 and the two pointers measured; step 3a's breakpoint run: no hit while the gate held) | mixed: one reader; measured, n = 1 (s30) | r0004 |
| 15.7 | text for the LATER 933 row | CORRECTED IN s23.5, s31, s32, s33 (what remains is named there, not in s16-s17; the original stands on the flight, measured once; with a walking leader it crosses, measured once; the reference is s33's repeat) | measured, n = 1 | r0004 |
| 16 | reading 1: the foot wait | CORRECTED IN research 417 s20, research 417 s25, s26 (the fallback arm; the trail [I1]; the trail on from the build) | one reader | r0001 |
| 16.1 | the constants and the target | CORRECTED IN research 417 s20, s23.3 (the fallback arm's cell; "slot 0") | one reader | r0001 |
| 16.2 | every branch that stands the follower | CORRECTED IN research 419 s22.9, s23, s31 (WAIT's compare is unsigned; branch B's arming; arrival can hold a follower at the foot when the recorded cell freezes, run A) | one reader | r0001 |
| 16.3 | the two named candidates | STANDS | one reader | r0001 |
| 16.4 | what the reading cannot produce | CORRECTED IN s23.5, s31 (what remains; an arrived stand at the foot measured once, run A) | one reader | r0001 |
| 17 | reading 2: plan or splice, column 217 | CORRECTED IN research 417 s20, research 417 s25, s26 (the fallback arm; the trail [I1]; the trail on from the build) | one reader | r0001; the port |
| 17.1 | when the decision plans and when it extends | CORRECTED IN s28.1, s28.8 (the splice's four preconditions) | one reader | r0001 |
| 17.2 | after a wait: plan or carry on (prediction P) | CORRECTED IN s23.3 ("slot 0" unsettled) | mixed: inference | r0001 |
| 17.3 | the port against the original: departures 1-3 | CORRECTED IN s19.1, s23.1 (a soil-0 stand appends nothing; branch B's byte read by BL) | one reader | r0001; the port |
| 18 | the node what-ifs against the trace's measure | CORRECTED IN research 417 s25 (the trail [I1]) | what-if under node | the port |
| 18.1 | the harness, scenario and measure | STANDS | what-if under node | the port |
| 18.2 | results | STANDS | what-if under node | the port |
| 18.3 | what each what-if meets, part by part | CORRECTED IN s23.3 (prediction P rests on "slot 0"; the port results stand) | what-if under node | the port |
| 18.4 | what this shows and does not | CORRECTED IN s19.1 (a soil-0 stand appends nothing) | what-if under node | the port |
| 19 | four candidates for an un-plannable target | CORRECTED IN research 417 s20, s21.3, s23.5, research 417 s25 (K4 read; K1-K3 narrowed; the trail [I1]) | mixed: inference | both |
| 19.1 | the lines the candidates rest on | CORRECTED IN s23.2, s23.3 ("cost limit" is the body's flags word; "slot 0" unsettled) | one reader | r0001 |
| 19.2 | the candidates K1-K4 | CORRECTED IN research 417 s20, s21.3, s23.3, s23.5 (K4 read; K1-K3 narrowed; "slot 0" unsettled) and s23.2 (a) (K3's signature: a stale finished route gives 0, 2, 3; the hub's review) | inference | both |
| 19.3 | what they share | CORRECTED IN research 417 s20 (r4 0x594dd0 read: it rewrites `+0x104` only) | inference | both |
| 21 | MP71's cell classes; where the trail leaves the target | CORRECTED IN research 417 s25 (the trail [I1]) | mixed: one reader | the disc; the port |
| 21.1 | the reader | STANDS | one reader | the port |
| 21.2 | the classes on the way | CORRECTED IN s21.8 (bit 21) | one reader | the disc |
| 21.3 | where the trail's newest entries leave the target | CORRECTED IN s23.3, s29, s31 ("slot 0" unsettled; the column premise does not hold for the second trace; the recorded cell froze at the foot, measured, run A) | what-if under node | the port |
| 21.4 | the port's trail writer and its requests from the foot | STANDS | what-if under node | the port; r0001 |
| 21.5 | MP71's links and markers | CORRECTED IN research 418 s22.10, s30 (the markers' ids are rewritten at load, read and now measured) | one reader | the disc |
| 21.6 | the leader's recorded cell: departure 5 | STANDS | one reader | r0001; the port |
| 21.7 | what the agent verified and what it took | CORRECTED IN s23.3 ("slot 0" unsettled) | one reader | the disc; the port |
| 21.8 | the heights, bit 21 corrected, the port's locate | STANDS | mixed: what-if under node | the disc; the port |
| 23 | the standing branches, three readings compared | STANDS | mixed: one reader | r0001 |
| 23.1 | the union table | STANDS | one reader | r0001 |
| 23.2 | the three disagreements, settled | STANDS | mixed: one reader ((c)) | r0001 |
| 23.3 | not settled | STANDS | one reader | r0001 |
| 23.4 | the constants | STANDS | read twice | r0001 |
| 23.5 | with the disc facts applied | CORRECTED IN research 417 s25.6, s26.4, s29, s31 (the trail can be emptied online; the fallback-arm exclusion holds under the stated trail; the column premise does not hold for the second trace; the fallback arm ran at an order and an arrived stand at the foot occurred, measured) | inference | r0001; the disc |
| 24 | the start gate | CORRECTED IN s26 (the trail on from the build) | mixed: inference | both; the port |
| 24.1 | when `+0x76` is set and cleared | STANDS | read twice; measured, n = 1 (the byte set at a new goal's order and holding under a short trail, s32; the 8.0 on entries, s33) | r0001; r0004 (measured) |
| 24.2 | how the 8.0 is counted | STANDS | read twice; measured, n = 1 (the hold under a short trail, s32; the 8.0 on entries, s33) | r0001; r0004 (measured) |
| 24.3 | the gated tick, and the trail at the order | CORRECTED IN s26.5 (the premise does not hold for a CSealCtrl leader) | mixed: inference | r0001 |
| 24.4 | r0004, and the port: departures 6-8 | CORRECTED IN s26.6 (departures 2 and 3 by the leader's class) | mixed: one reader | both; the port |
| 24.5 | the predictions for the two orders | CORRECTED IN s23.3, s26.5, s31, s32 ("slot 0" unsettled; the predictions assume an empty trail; the gate was not holding at 0.42 s with a long trail; it held all run with a short one, measured) | inference | r0001 |
| 24.6 | the hub's record | STANDS | mixed: one reader | r0004 |
| 24.7 | the port's what-ifs and the arm log | CORRECTED IN s26.7, s31 (the what-if rows restated; the original's fallback arm ran at an order) | what-if under node | the port |
| 26 | the trail's enable: on from the body's build | CORRECTED IN s26.9 (the blind second read is in, and agrees); BUILT IN s35 (the port, 2026-11-13) | mixed: one reader | both |
| 26.1 | the call at the end of the build | STANDS | read twice | both |
| 26.2 | what the enable does; placements; the 0.6 s placement | STANDS | mixed: one reader | both |
| 26.3 | the switch-off, by class | STANDS | mixed: one reader | both |
| 26.4 | what a follow order finds in the trail | STANDS | one reader | both |
| 26.5 | s24.3-s24.5 restated | STANDS | mixed: inference | both |
| 26.6 | the port's gate departures by the leader's class | STANDS | one reader | both; the port |
| 26.7 | s24.7's what-if rows restated | STANDS | mixed: inference | the port |
| 26.8 | not determined | CORRECTED IN s26.9 (the blind second read is in) | one reader | both |
| 26.9 | the blind second read (review20) | STANDS | mixed: one reader (its additions) | both |
| 27 | the port's requests in #798's scenario; the jump what-ifs | STANDS | what-if under node | the port |
| 27.1 | the request log | CORRECTED IN s28 (the original's extension builds the same pair, read twice) | what-if under node | the port |
| 27.2 | the refused request: departure 10 | STANDS | one reader | r0001; the port |
| 27.3 | the jump what-ifs | CORRECTED IN research 417 s25.10 and by the hub's review (the what-if modelled a trigger that is not the measured one; its conclusion is unproven under the measured one) | what-if under node | the port |
| 28 | the route extension at a sub-map seam | STANDS | read twice | both (r0004 by the comparison table's rows) |
| 28.1 | the original's extension | CORRECTED IN s28.8 (a fourth precondition: the trail's own flag bit 2) | read twice | r0001 |
| 28.2 | the original's walker at an off-link node | STANDS | read twice | r0001 |
| 28.3 | the comparison rows | STANDS | one reader | r0004 |
| 28.4 | the port | STANDS | mixed: what-if under node | the port |
| 28.5 | seven departures by reading | CORRECTED IN s28.8 (the trail walk's four preconditions; the trail's flag bit 2 is not among departure 4's terms) | one reader | r0001; the port |
| 28.6 | the conclusion | STANDS | mixed: inference | both; the port |
| 28.7 | not determined | CORRECTED IN s28.8 (the trail flag's writer, `FUN_00525210`) | one reader | both |
| 28.8 | the second reader; the node's disc read | STANDS | mixed: one reader | r0001; the disc |
| 29 | the second trace's measured column, and the derivation t30 | CORRECTED IN s31, s31.7, s32 (the #0 (219,84) target failed; the trail at the order held the spawn cell in the rig's runs; the port's hold is probably the trail's life; the gate is armed at an order, measured) | measured (the x); a derivation on the port's locate (the freeze) | both |
| 30 | the rig's memory reads before any follow | STANDS | measured, n = 1 (the rig, 2026-11-12) | r0004 |
| 31 | the rig's follow 1: two runs on the original, against the prediction and the port | STANDS | measured, n = 1 (the rig's rows); derivations and port runs (the comparison) | both |
| 31.1 | the rig's rows | STANDS | measured, n = 1 (the rig, 2026-11-12) | r0004 |
| 31.2 | the prediction, line by line | STANDS | mixed: what-if under node (the prediction is a derivation) | both; the port |
| 31.3 | run B's stop and the 18.75 radius | STANDS | mixed: inference (consistent with, n = 1) | both; the port |
| 31.4 | the start gate: a measured departure of the port | CORRECTED IN s31.7, s32 (the port still holds a follower at the order; the gate is armed at an order and holds under a short trail, measured in follow 2: resolved) | mixed: measured, n = 1; not determined (a new or a reused goal) | both; the port |
| 31.5 | the original's two stops beside the port's | STANDS | mixed: what-if under node | r0004; the port |
| 31.6 | what it says about #798 | CORRECTED IN s32 (scenario C compared: the original crosses without a stop, the port pins) | measured, n = 1 | r0004; the port |
| 31.7 | the trail on before the order; run B's agreement and first stand | STANDS | a what-if under node (the trail-on row); measured, n = 1 (the rig's values it is compared with) | both |
| 32 | the rig's scenario C and follow 2 | STANDS | mixed: measured, n = 1 (the rig's rows); readings, inferences and port runs | both; the port |
| 32.1 | scenario C, as measured | CORRECTED IN s33 (the reference a fix is scored against is the repeat: the gate at 8 cells, then straight up and across about 1.5 s behind, no stop; the 14 s lag and wander were the odd case) | measured, n = 1 (the rig, 2026-11-12) | r0004 |
| 32.2 | the port in scenario C | STANDS | what-if under node | the port |
| 32.3 | the wander: three candidates | CORRECTED IN s33 (the wander was one run's, with a trail of 2 at the order, and did not recur with an empty trail; the candidates stay for that odd case; the cap at 18.18 against 19.9 recorded as measured, not as an explanation) | inference | both |
| 32.4 | follow 2, as measured: the gate armed | STANDS as measured; its capitalised conclusion limited by the hub's review to the gate's rule (the arming on a leader change is not covered) | measured, n = 1 (the rig, 2026-11-12) | r0004 |
| 32.5 | the walk back, the sum that never released, the row for the port | STANDS | mixed: one reader (the recipe's read-now steps); measured, n = 1 (the counts) | both; the port |
| 32.6 | reading a leader's trail array on the rig | CORRECTED IN s33 (its self-checks measured, n = 1, and its length rule measured on entries, n = 1; nothing else measured) | mixed: one reader (read now); its self-checks and its length rule measured, n = 1 (s33) | r0004 |
| 32.7 | with the correction off: the port in scenario C | STANDS | a what-if under node | both |
| 33 | the rig's scenario C repeat: the reference | STANDS | measured, n = 1 (the rig's rows); port rows from node logs; one reader (the array's order); an inference (the third point) | both |
| 33.1 | the gate's 8.0, confirmed on entries | STANDS | measured, n = 1 (the rig, 2026-11-12) | r0004 |
| 33.2 | the port against the reference | STANDS | mixed: what-if under node (port rows from node logs) | both; the port |
| 33.3 | the route's third point | STANDS | mixed: inference ((b)); one reader ((a)) | r0001; r0004 |
| 33.4 | the wander's limit | STANDS | measured, n = 1 | r0004 |
| 34 | after the lane closed: two measurements, and a remark for research 399's owner | STANDS | measured, n = 1 and n = 2 (the rig's rows, relayed); one reader (the remark) | r0004; r0001 |
| 35 | readings: the leader's trail's life built in the port (LATER 960); each function's r0004 standing | STANDS | mixed: read twice (s24, s26) and one reader (match.json's rows, the jumptable scan) | both; the port |

**The lane's four cut lists, as it wrote them before the split (kept for the record; "Do not split it here" was its
instruction to itself).** The split above follows them by top-level section: a section that appears in more than one
list lives in one note and is cited from the others.

**Four lists: the cut lines along which this note may be split when it is brought to main.** Do not split it here. A
section may appear in more than one list.
1. **LATER 933's landing pin:** 0, 1, 2, 2a, 3b, 5, 6, 6.1, 7, 8, 10, 10.1, 10.2, 10.3, 10.4, 10.5, 11, 11.1, 11.2, 11.3,
   11.4, 11.5, 12, 12.1, 12.2, 12.3, 12.4, 12.5, 13, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 14, 14.1, 14.2, 14.3,
   14.3b, 14.4, 14.5, 14.6, 15, 15.1, 15.2, 15.3, 15.3a, 15.4, 15.5, 15.6, 15.7, 16, 16.1, 16.2, 16.3, 16.4, 17,
   17.1, 17.2, 17.3, 18, 18.1, 18.2, 18.3, 18.4, 19, 19.1, 19.2, 19.3, 20.7, 20.12, 20.13, 21, 21.1, 21.2, 21.3, 21.4,
   21.5, 21.6, 21.7, 21.8, 22.6, 23, 23.1, 23.2, 23.3, 23.4, 23.5, 24, 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7,
   25.6, 26, 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8, 26.9, 27, 27.1, 27.2, 27.3, 28, 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7, 28.8, 29, 30, 31, 31.1, 31.2, 31.3, 31.4, 31.5, 31.6, 31.7, 32, 32.1, 32.2, 32.3, 32.4, 32.5, 32.6, 32.7, 33, 33.1, 33.2, 33.3, 33.4.
2. **The r0004-only changes in hostage following (LATER 957):** 14.1, 15.3, 15.6, 19.2, 20, 20.1, 20.2, 20.3, 20.4,
   20.5, 20.6, 20.7, 20.8, 20.9, 20.10, 20.11, 20.12, 20.13, 23.5, 24.4, 25, 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 25.8,
   25.9, 26.2, 27.3, 31, 31.4, 31.5, 32, 32.4.
3. **The door markers' binding and the walker's marker bodies (LATER 958):** 15.2, 20.8, 21.5, 22, 22.1, 22.2, 22.3,
   22.4, 22.5, 22.6, 22.7, 22.8, 22.10, 22.11, 23.1, 30.
4. **The decompiled text's omissions (LATER 956):** 13.7, 22, 22.1, 22.2, 22.5, 22.9, 22.10, 22.12, 23, 25.7, 26.1.

**In none of the four:** 3 -- the census over all the AIMAPS packs, a separate lead with no LATER row; 4 -- the
port's consumers against the rewrite, separate leads with no LATER row; 9 -- the first review, a process record.

## 0. The answer

**For LATER 933, the load-time rewrite is NOT THE CAUSE.** It changes none of the cell words that the AI-map correction
reads at the Fish Hook landing. On MP71 it changes 4 words of 40,384: bit 5 under the four start points, the nearest
105 units from the landing and 42 units below it. The port's correction and its plan across the landing give the same
output on the stored words as on the rewritten words (s5).

Over all 34 AIMAPS of the disc (1,646,684 stored cells), the rewrite changes exactly one thing: bit 5, on 555 cells.
554 of those cells sit under a named point (the start points); the other one is MP81 sub-map 0 cell (49,43). The disc
has no soil-13 cell, no bit-26 cell, no stray name, action or link bit, no named cell without bit 6, and no top nibble
other than 8 (s3). Bit 5 is therefore the only stored-versus-loaded difference that matters to any consumer of the
port, and s4 says where it matters. It does not matter at the landing.

## 1. The rewrite the original applies after reading a sub-map [read]

- **When.** `FUN_0051afe0` (D:L387593-387637) reads a sub-map's version word (accepted values 0x13-0x17; every sub-map on
  the disc carries 0x17, which the port calls `flags`). It dispatches to that version's reader. On success it sets the
  height scale `+0xe8` (D:L387628) and calls `FUN_00517850` (D:L387629). So the rewrite runs after every version's read.
  The two calls that follow, `FUN_0052f4a0` and `FUN_0052eee0` (D:L387630-387631), work on the zone table (`+0x118`)
  and the `+0x144`/`+0x148` records. This author's skim of them (D:L397836-397957, D:L398084-398199) found no write
  through the cell array, and the review states they write no cell.
- **Again, after the whole file.** `FUN_00510d10` (D:L382430-382448) runs `FUN_00517850` once more over every loaded
  sub-map. It is called:
  - at D:L395413, inside the link-graph build `FUN_0052a8c0` (D:L395318), which the AIMAPS load calls at its end
    (D:L395634). So the full rewrite runs again after all the sub-maps and their tables are in;
  - at D:L397474, in `FUN_0052e780` (D:L397469), which a load calls at its start (D:L395601) and which is also called at
    D:L151629;
  - at D:L151959.
- **Named points first** (`FUN_00517850` D:L385636-385669). For each 24-byte name record, the record's sub-map field is
  set to the sub-map's own index (D:L385639-385641), and the record's byte +0x13 is zeroed (`FUN_00530ff0`, D:L385638).
  If the record's cell is stored (z below the row count and x inside
  that row's span, D:L385642-385653), bit 6 is set on that cell's first word (D:L385663-385665). The marker and link
  tables are walked, but no cell word is written there (D:L385670-385703). The zone records' sub-map field is set
  (D:L385704-385712).
- **Then every stored cell** (D:L385713-385756; the bounds come from `FUN_005173e0` D:L385418-385426, which spans the
  whole grid). Each cell goes through `FUN_00517eb0`:
  - byte 3 keeps its low nibble and takes 8 as its top nibble (D:L385770). The halfwords +4 and +6 are set to 0xFFFF
    (D:L385771-385772); the file already stores -1 there, research 75 s4. Bit 26 is cleared (D:L385773);
  - if bit 7 is set and the marker table has a record at the cell, that record's byte +8 loses bit 4 and its byte +6
    loses bits 4-6 (D:L385775-385780);
  - soil 13 becomes soil 1 (D:L385781-385783);
  - bit 5 is cleared (D:L385784);
  - bit 6 is kept only if the name table has the cell (`FUN_00530f40`, D:L385786-385788). Bit 7 is kept only if the
    marker table has the cell (`FUN_00530d10`, D:L385790-385792). Bit 8 is kept only if the link table has the cell as
    its first loc (`FUN_005306f0`, D:L385794-385796).
- **The lookups** (D:L398765-398790, D:L399022-399045, D:L399102-399125) walk the sub-map's own table. They return the
  first record whose x (loc bits 6-18) and z (bits 19-31) equal the cell's. The sub-map bits are not compared.
- **`FUN_005180b0`** (D:L385803-385822) is the same rewrite without the byte-3 step, the +4/+6 step and the bit 6-8
  steps. `FUN_00517470` (D:L385433-385504) runs it over every cell. Its caller is `FUN_0052e720` (D:L397454, the call
  at D:L397462), which is called at D:L151856.

So, at runtime, bit 5 is never the file's: the original clears it at load. The port reads the occupancy bit through
`HostageObstacles` (`FUN_00529a90`, D:L394775-394796, called from `FUN_005b7ba0` D:L471326-471327 on the body's cell).
The scratch model of the rewrite is `rewrite.mts` (s7). It is a model for counting, not a port.

## 2. LATER 933's landing on Fish Hook (MP71) [data]

**2026-11-12 -- CORRECTED IN s11.4, s13.6, research 417 s20.13:** the clearer of `+0x172`; the tolerance constants 0x650918 and 0x650920 are 0; a branch on `+0x1061` bit 3 can skip the gate.

**Convention.** A cell is (x, z): x is the column, bits 6-18 of a loc. z is the grid row, bits 19-31 (the reader's
`AiLoc`, research 75 s4). The index is `aiCellIndex(sub, x, z)` = `rows[z].first + x - rows[z].x0`. The centre is
min + (i + 0.5) x 10. The height is `aiCellY`. This is the indexing `HostagePathPlanner.word` uses
(`hostagePath.ts:182-187`), and its `DIR[0]` = (0, -1) is z - 1. The row's "north" neighbour (218,70) of (218,71) is
therefore `DIR[0]`.

MP71 has three sub-maps: #0 (min x -40.42, z -53.19, 290x247 cells), #1 `tophost` (min 2009.58, 205.54, 576.81, 35x35;
y 205.54-222.00) and #2 `topboat`. Every sub-map has version 0x17.

| cell | stored word | soil | b5 | b6 | b7 | b8 | b21 | b26 | alt -> y | after the rewrite |
|---|---|---|---|---|---|---|---|---|---|---|
| #0 (218,70) | 0x81e3e200 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 497 -> 178.78 | unchanged |
| #0 (219,71) | 0x8ac50a00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 645 -> 220.63 | unchanged |
| #0 (218,71) | 0x8ac50a07 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 645 -> 220.63 | unchanged |
| #0 (217,71) | 0x8ae50b07 | 7 | 0 | 0 | 0 | 1 | 1 | 0 | 645 -> 220.63 | unchanged |
| #1 (12,7) | 0x81c7fe01 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1023 -> 221.98 | unchanged |
| #1 (13,7) | 0x81c7fe01 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1023 -> 221.98 | unchanged |
| #1 (12,8) | 0x82c00101 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 -> 205.54 | unchanged |
| #1 (13,8) | not stored | | | | | | | | | |

The whole block #0 x 215-221, z 68-73 (the stair column 217-218 at z 72-73, y 213.84 and 207.05) is unchanged by the
rewrite. `landing.out.txt` lists every word.

- **The sub-maps over world x 2139-2145, z 656-662** (the row's band, which spans column 217 below x 2139.58 and
  column 218 above it) are #0 (cells 217-218 x 70-71) and #1 `tophost` (cells 12-13 x 7-8).
  Sub-map 0's row 71 starts at z 656.81, and tophost's row 7 ends there. `locateAiCell` places (2143, 220.8, 656.8) on
  #1 (13,7) and (2143, 220.8, 659) on #0 (218,71). The east column's step north from #0 (218,71) meets a soil-0 cell
  of the ground floor (y 178.78, 42 below), and tophost stores no (13,8) above it.
- **The only link at the landing** is #0 (217,71) <-> #1 (12,8), word 0x8 (direction 8). It is stored at both ends.
  No other link lies within 6 cells of (217,71).
- **The column-217 caveat.** World x 2139.0-2139.58 is column 217, the link cell. The correction is skipped there
  (bit 8, D:L385150). A body held at x 2139.0-2139.58 is therefore **not** held by this correction; only the east
  column (x 2139.58-2149.58, column 218) is.
- **What the correction sees.** The original's correction is `FUN_005169b0`, reached through `FUN_00516f10`
  (D:L385268-385285). It is called at D:L413925 with the body's located cell `+0xe4` (piVar15 + 0x39). Its gate, in full
  (D:L413920-413934):
  - it runs only when `DAT_0066b000` is non-zero, or when `+0xc0 -> +0x171` bit 7 is set and `+0x172` bit 0 is clear
    (D:L413920-413922);
  - `FUN_005b7ba0` sets `+0x172` bit 0 in two cases. The first is when the locate fails (D:L471279-471281). The second
    is when the located cell is not traversable and is more than one cell from `+0xe8` on either axis
    (D:L471288-471306). The "one cell" tolerance rests on two data constants, 0x650918 and 0x650920, whose values cannot
    be read from the decompilation;
  - `+0xe8` is written only when the cell changed or `+0x1061` bit 6 is set (D:L471307-471318);
  - when the correction returns a push, the push is not applied if the body's obstacle record (the `+0x38` virtual's
    result) has `+0x32c` bit 0 set. When that bit is clear, the obstacle is reported through `FUN_00558030` and the
    push is applied, capped at `DAT_0064fd20` (D:L413926-413940).

  It skips a cell with bit 8 (D:L385150). For each of the two cardinal neighbours in the move's quadrant, on the same
  sub-map (D:L385197-385230), it pushes back only for soils in mask 0x701, that is soil 0, 8, 9 or 10
  (D:L385232-385234). None of these inputs is a bit the rewrite changes at these cells: soil is not 13, and bits 8 and
  21 are as stored. Bit 5 is not read here.

  The port's `correctMotionWithContact` (`hostagePath.ts:330-352`) reads the same cell bits, and
  `hostageFollow.ts:591-599` passes it the located cell under the one-cell test. The port models the two bit conditions
  (`+0x171` bit 7 / `+0x172` bit 0, and `+0x32c` bit 0) as one obstacle-type test, `type === 1`
  (`hostageFollow.ts:592-595`, `hostageAvoidance.ts:52`), where the original tests bits. That modelling is not checked
  here.

## 2a. The locate: which cell a body on the landing is given [read]

`FUN_005b7ba0` takes the body's cell from `FUN_0052dc70` (D:L471278; D:L397225-397428). That routine walks the sub-maps
in file order: they are appended at load with `+0xe4` = their index (D:L395617-395622). On the first sub-map, when the
cell's bit 21 is clear, it returns that cell at once (D:L397295-397314, D:L397418). On that path there is no memory of
the previous sub-map, no preference for a higher grid, and no y test. #0 (218,71) has bit 21 clear, so
(2143, 220.8, 659) gives #0 (218,71) in the original, as it does in `locateAiCell` (`hostagePath.ts:146-165`). The
stacked branch's band constants (0x64f958-0x64f978) are unread. They matter only for bit-21 cells: row 70 and the link
cell (217,71).

**Verdict: NOT THE CAUSE.** The words that hold a body on the east column at z ~661.8 are the same in the original's
memory as in our stored grid. The fault lies elsewhere: in how the original keeps a follower off #0 (218,71) heading
north, or moves it onto the column-217 link. That is the row's own list of functions to read (s6).

## 3. The census over all 34 AIMAPS [data]

Counted per stored cell: (a) soil 13; (b) bit 5; (c) bit 26; (d) bit 6, 7 or 8 set with no name, marker or link record
at that (x, z); (e) a named stored cell lacking bit 6; (f) a top nibble other than 8; (n) any word the rewrite changes.
22 multiplayer packs, 12 campaign packs and `RAW/APACHE00` (no AIMAPS.MPS) were examined. Eight campaign packs are
refused by the repo's `parseAiMaps`: M51, M52, M53, M62, M72 and M73 for a non-empty seventh table, M81 likewise, and
M83 at its trailer. Those eight were read with another agent's scratch parser copy, which reads the tail tables as
`FUN_0051a490` does. Their cell grids precede the tail tables, but their name, marker and link tables come from that
copy, so their (d) and (e) counts rest on it.

**Totals:** cells 1,646,684; a 0; **b 555**; c 0; d 0 (all three bits); e 0; f 0; **n 555**. Of the 555 bit-5 cells,
43 are on the multiplayer maps and 512 on the campaign maps. A second count over the 365 marker records
(`markers.out.txt`) finds that the rewrite clears none of them: +8 bit 4 is set on none, word bits 20-22 are set on
none, and every marker's cell has bit 7.

Bit 5 per map (every count is on sub-map 0 unless noted; all other columns are 0):

| map | b5 | map | b5 | map | b5 |
|---|---|---|---|---|---|
| MP1 | 1 | MP6 | 4 | MP8 | 1 (#1) |
| MP2 | 1 | MP61 | 1 | MP81 | 1 (unnamed (49,43)) |
| MP5 | 1 | MP62 | 1 | MP82 | 4 |
| MP7 | 1 | MP64 | 1 | MP83 | 1 |
| MP9 | 1 | MP71 | 4 | M51 | 37 |
| MP10 | 4 | MP72 | 1 | M52 | 40 |
| MP11 | 4 (#0 1, #2 3) | MP73 | 1 | M53 | 41 |
| MP12 | 1 | M61 | 49 | M62 | 53 |
| MP51 | 1 | M63 | 42 | M71 | 34 |
| MP52 | 4 | M72 | 40 | M73 | 41 |
| MP53 | 4 | M81 | 39 | M82 | 51 |
| | | M83 | 45 | | |

The campaign counts are spread over many sub-maps; `census.out.txt` gives them per sub-map. On the multiplayer maps
the bit-5 cells are `startPlayer` (or `StartPlayer`) and, on hostage maps, `hostageStart`, `hostage2Start` and
`hostage3Start`. Each also carries bit 6, matching research 75's marker 3 ("under a start point"). One cell is the
exception: MP81 #0 (49,43), word 0x82277221, soil 1, at (1274.6, 246.0, 1050.2), with no record of any table on it.
M81 #1 has two named points (GP11 (4,3), GP11_b (3,7)) on cells the grid does not store, which the rewrite cannot
flag (D:L385642-385653).

This confirms, by an independent script, the lead census another agent left (same totals, same 555, the same MP81
exception).

## 3b. Fish Hook's flagged cells [data]

All four are on sub-map 0. Distance is to (2142, 221, 660).

| name | cell | stored -> loaded | world (x, y, z) | xz distance | 3-D distance |
|---|---|---|---|---|---|
| startPlayer | (196,93) | 0x80c2ae61 -> 0x80c2ae41 | (1924.6, 135.2, 881.8) | 310.6 | 322.2 |
| hostageStart | (215,81) | 0x81e3e261 -> 0x81e3e241 | (2114.6, 178.8, 761.8) | 105.4 | 113.6 |
| hostage3Start | (213,83) | 0x81e3e261 -> 0x81e3e241 | (2094.6, 178.8, 781.8) | 130.7 | 137.4 |
| hostage2Start | (216,84) | 0x81e3e261 -> 0x81e3e241 | (2124.6, 178.8, 791.8) | 133.0 | 139.5 |

None is on or beside the landing. All four are on the ground floor, 42 or more units below it.

## 4. The port's consumers of a cell's first word, against the original after its rewrite [read, source]

| consumer (file:line) | bits read | the original's reader, after the rewrite | differs on the disc? |
|---|---|---|---|
| `locateAiCell` `hostagePath.ts:146-165` | soil (0/8/9/10 invalid, 10 skipped when stacked), bit 21 of sub-map 0, alt | `FUN_0052dc70` D:L397225-397428 (research 335) | no: soil, bit 21 and alt are never rewritten on the disc |
| `traversable` `hostagePath.ts:188-191`; `width` :287-298; `recoveryRays` :263-283 | soil | `FUN_0052a090`-family soil tests (research 333, 335) | no |
| `correctMotionWithContact` `hostagePath.ts:330-352` | bit 8 (skip), the neighbours' soil (0/8/9/10) | `FUN_005169b0` D:L385150, D:L385232-385234 | no |
| `lineTravel` `hostagePath.ts:386-401` (incl. :396) | soil 3/11/13; **bit 5** as blocking (non-travel lines: the planner's smoothing) | the smoothing's line callback (research 333 s4) reads the live word, whose bit 5 is runtime occupancy only | **yes, on the 555 cells**: a smoothed line through a start-point cell is refused until an actor's move overwrites the overlay bit (below) |
| `baseCost`/`basicStepCost` `hostagePath.ts:67-84`, used at :473-476 | soil 3/6/11/13, **bit 5** (cost 2.5) | `FUN_00512930`/`FUN_00513080` D:L383248/383455 on the live word | **yes, on the 555 cells**: cost 2.5 instead of 1 |
| `action`/`directions`/`flag` `hostagePath.ts:360-373, :582` | bit 7, then the marker's word and `flags` bit 4 (`invalid`) | marker lookup `FUN_00530d10`; the rewrite clears +8 bit 4 at bit-7 cells (D:L385778) | no: no stored marker has +8 bit 4 (s3) |
| `gated` `hostagePath.ts:413-416` | bit 7 / soil 6 | as above | no |
| `HostageObstacles.word` `hostageObstacles.ts:16-21` | overlays soil (13 after a collision) and bit 5 on the AUTHORED word; with no overlay entry the authored bit 5 passes through | the original's live word: bit 5 cleared at load (D:L385784), set and cleared by `FUN_00529a90` D:L394775-394796 | **yes, on the 555 cells until an actor has entered and left the cell**: `moveActor` writes `false` on leaving (:41-45). A hostage leaves its own start cell, so those three cells are cleared once it moves; `startPlayer` and MP81 (49,43) keep the stored bit until some registered actor passes |
| `markCollision` `hostageObstacles.ts:23-26` | bit 8, soil | `FUN_00556ee0` D:L420963-420972 | no |
| `HostageRouteProbe.visit` `hostageAvoidance.ts:147-151` | bit 8, **bit 5** (an actor), soil 0/6/8/9/10, bit 7 | `FUN_00537e50` probe caller D:L430346 (research 334) on the live word | **yes, as for the overlay**: a probe crossing a start-point cell sees an "actor" |
| `aiCellY` (`aimaps.ts:123-125`) via `escortees.ts:137`, `simMap.ts:200-203`, `forge/hostages.ts:46-48`, `forge/extractionZones.ts:60-62`, the planner's `point` | alt (bits 9-18) | `FUN_00516940` D:L385086-385095 | no |
| `aiCellMarker` (`aimaps.ts:113-115`); `packs/content/map.ts:198` (a producer: authored forge grids set bit 6 under named points) | bits 5-7 | not read at runtime by the original's game code that this note read | display and producer only |

Fish Hook's four bit-5 cells lie 105-311 units from the landing. None of the bit-5 differences reaches LATER 933.
The "yes" rows are a separate stored-versus-loaded divergence, the lead the controller named. It is **unmeasured**:
no run here shows a hostage or route affected by it. Settling it would take a port test that plans or smooths through
a start-point cell before any actor has entered it, compared with the word with bit 5 cleared. The fix would be one
change in the reader or the overlay, never per map.

**A second lead (unmeasured): soil 13 after a reset.** Soil 13 becomes 1 unconditionally on every pass of the rewrite
(D:L385781-385783). That includes the passes after the whole file and at a reset (s1). A cell that a collision marked
13 at runtime (`FUN_00556ee0`, D:L420963-420972) therefore comes back as soil 1 after such a pass. The port's overlay
(`HostageObstacles.clear`) restores the authored soil instead. The two agree only where the authored soil is 1. The
other soils `markCollision` converts (2, 4, 5, 12) would read 1 in the original after a reset and their authored
value in the port. No run here measures it.

## 5. The node datum [data, port run]

`datum.mts` builds `HostagePathPlanner` on MP71 twice. The first build uses the stored words. The second uses a copy
whose every cell was passed through `rewrite.mts` (4 words changed). On each it calls `correctMotionWithContact` with
the raw cell #0 (218,71) and the proposals below, then `plan` from #0 (218,73) (the stairs) to #1 (8,17) (the row's
target).

| proposal | stored -> feet, obstacle | rewritten -> feet, obstacle |
|---|---|---|
| (2143, 220.8, 658) | (2143, 220.8, 661.809), (218,70) | identical |
| (2143, 220.8, 656) | (2143, 220.8, 661.000), (218,70) | identical |
| (2144.6, 220.8, 655.5) | (2144.583, 220.8, 660.500), (218,70) | identical |
| (2140, 220.8, 657) | (2140, 220.8, 661.809), (218,70) | identical |
| (2139, 220.8, 657) with the raw cell #0 (217,71) | unchanged (bit 8 skips it), no obstacle | identical |

The plan is the same on both: #0 (218,73), (217,72), (217,71) link, #1 (12,8) link, (11,7), (8,10), (8,17), cost 335.
The planned route uses column 217. The pin is a body on column 218 at the same z: the correction returns it to
z 661.809, which is the row's 661.8, against the soil-0 neighbour (218,70). This is a run of the port only. It shows
the stored/rewritten equality and the push-back value, not the original's behaviour.

## 6. What this leaves for LATER 933 [read, partial]

**2026-11-12 -- CORRECTED IN s13, s14, s15:** the bit's values and frames are the trace's.

- **Corrected again 2026-11-12 (s15):** the banner below overstates. The trace measured the bit, not the correction:
  whether the correction runs in the frames where the bit is set was not reached. The second trace (s15) has the bit
  clear in every frame at this landing.
- **Corrected 2026-11-12 by the r0004 trace (s14):** the bit is set in about a quarter of steering frames, so the
  original does run the correction for a route-steered follower in some frames. The s13 re-file below is superseded
  as worded.
- **Re-filed by s13 (superseded, s14): the proviso below does NOT hold for a follower under route steering.** For such a follower, the
  follow tick clears `+0x171` bit 7, so the original does not run the correction (s13). The text below stands only for a
  body whose bit is set, such as one standing in position or one whose obstacle record has just matured.
- **The original holds such a body too, under conditions.** `FUN_005b7ba0` (D:L471278-471318) locates the body on
  #0 (218,71) (s2a). That cell is traversable (soil 7), so `+0x172` bit 0 is not set by the not-traversable test, and
  `+0xe8` follows the cell when it changes. **A body standing on #0 (218,71) and moving north is held by the
  original as well**, provided that: `+0x171` bit 7 is set or `DAT_0066b000` is non-zero; the locate succeeds; and the
  obstacle record's `+0x32c` bit 0 is clear when the push is applied (s2). It is also limited to column 218: a body
  at x 2139.0-2139.58 is on the link cell, which the correction skips. The difference must therefore be upstream:
  whether the original's follower is ever steered north from column 218, or is steered onto the (217,71) link point
  first.
- `FUN_00567900` (D:L429574-429592, D:L429692-429719) is called on the follower's link-point passing branches. Those
  branches take the trail's cell or fall back to the body's `+0xe8` (`FUN_00524d00`, then `FUN_0056c080`). This note did
  not read them beyond establishing that they choose a target cell, not a cell word.

### 6.1 Next readings for LATER 933

**2026-11-12 -- CORRECTED IN s10.1:** the follow target is first a trail cell.

These are from the review; this author re-read the lines named.
- **The follow state machine around D:L508700-508933.** Corrected in s10.1: the follow target is first a trail cell
  from `FUN_005fd790` (D:L508688-508692). The locate of a point offset from the leader (D:L508699-508719) is only the
  fallback when that fails. The trail
  append `FUN_0052bdf0` (D:L395986-396162) is called once there (D:L508929-508931). When it fails and the term
  `iVar16` is at most `DAT_00650cf0`, the state drops to 0, a replan (D:L508929-508933).
- **What `FUN_0052bdf0` refuses** (re-read by this author, D:L396040-396162). The direct append of the goal after the
  route's end is tried only when the end and the goal are on the same sub-map (D:L396077-396089); otherwise that test
  fails. The corridor splice that follows appends each trail point through `FUN_00526f20`. That routine does **not**
  refuse a point on another sub-map: when the point's sub-map differs from the last stop's, it opens a new stop and
  counts a new leg (`FUN_00526f20` D:L393306, the branch D:L393351-393358). This narrows the review's wording, "refuses a cell on
  another sub-map", to the direct append. `FUN_00526540` (D:L396162) re-legs the stop without any link search (s10.2).
- **The port's `extend`** (`hostagePath.ts:586-616`) has the same shape: a cross-map direct append fails
  (`canTravel` refuses on `from.map !== to.map`), then the corridor splice appends trail points of any sub-map, smoothed
  per same-map run. s8 traces what the port's follower does with that.
- **The obstacle reported through `FUN_00558030`** (D:L413932): how the follower responds to the contact the
  correction reports is not read (s10.5).

## 7. What was not measured, and how to re-check each claim

**2026-11-12 -- CORRECTED IN s12.1, s13.6:** the port's pin reproduced in a run; 0x650918 and 0x650920 read: 0.

**Not measured:** any run of the original. Nothing confirms in RDRAM that MP71's in-memory words at (218,70), (219,71),
(218,71) and (217,71) equal the stored ones; an RDRAM read of sub-map 0's cell array after load would settle that.
Also not measured: the bit-5 divergence's effect on any route (s4); the soil-13 lead (s4); the eight refused campaign
packs through the repo's own reader; the port-side trace (s8), which was not run; the values of the constants
0x650918, 0x650920 and 0x64f958-0x64f978.

**What the re-check rests on.** Every [data] claim rests on scratch scripts that are **outside git**: this author's,
under `evidence/forge-stim/xs/cells/` on the controller's host, and the reviewer's re-derivation, under
`evidence/forge-stim/xs/cells/review/`. Neither set is a test in the repository. Nothing here holds the census or the
landing words as a dev-disc test. Until such a test exists, re-running these scripts is the only check. The [read]
claims rest on the decompilation's line numbers. Run the scripts from an installed `agent/v0420` tree's `redotcom`
(`npx tsx <script>`), with `SOCOM_DISC` set to the disc tree.
- s1: read D:L385598-385822 and D:L387593-387637. Compare the steps listed with `rewrite.mts`.
- s2: `landing.mts` (output `landing.out.txt`): the words, the covering sub-maps, the links, `locateAiCell` and the named
  points. The correction's gate and inputs are at D:L413918-413940, D:L385140-385234 and D:L471288-471318.
- s3, s3b: `census.mts` (`census.out.txt`) and `markers.mts` (`markers.out.txt`).
- s4: grep `packages/*/src` for `& 31`, `& 32`, `& 128`, `& 256`, `aiCellIndex`, `aiCellY` and `locateAiCell`
  (the lines cited).
- s2a: read D:L471278-471281, D:L397225-397428 and D:L395617-395622.
- s5: `datum.mts` (`datum.out.txt`).
- s6.1: read D:L508700-508719, D:L508925-508936 and D:L396040-396162, plus D:L393306-393365 (`FUN_00526f20`).
- s8: read `hostageFollow.ts:118-150` and `:455-560`, and `hostagePath.ts:586-616`.

## 8. Port-side trace at the landing (a port-code inspection, NOT a reading of the original) [source]

**2026-11-12 -- CORRECTED IN s10.2, s12.1:** the re-leg read: no link inserted; the port's pin reproduced in a run.

This was not run. It is read from `packages/match/src/hostageFollow.ts` at f2d9c9c87.
- The trail (`FollowTrail.add`, :133-140) records the leader's located cells newest first. A leader walking up the
  east column is located on #0 (218,72), then #0 (218,71), then #1 (13,7) once z falls below 656.81 (s2, s2a). The
  trail therefore holds #0 (218,71) followed by #1 (13,7), with no link between them.
- The follower's goal is a trail point (`trail.points[depth]`, :462-472) and its target is that point's locate
  (:478). In the stale-end branch (:520-523), `extend` (`hostagePath.ts:586-616`) is handed the route, the follower's
  cell and the target, with the trail as the corridor. The direct append fails across sub-maps. The splice then
  copies the trail points between the route's end and the target, which can put #0 (218,71) directly before #1 (13,7).
  Smoothing is per same-map run, so nothing inserts the (217,71)-(12,8) link.
- The steering loop (:527 onward) then aims from #0 (218,71) at #1 (13,7)'s centre (2144.58, 221.98, 651.81), which is due
  north on column 218. `correctMotionWithContact` pushes the body back to z 661.809 (s5). The point is never reached
  (d is about 10, above the point radius), so the route head never advances.
- With the leader standing still, the target stops changing. Once the route's end equals the target, the stale-end
  branch is not taken (:520), and the shortcut replan needs the same sub-map (:518). Nothing replans. How the leader's
  death releases it (the row's "released in the tick the leader died") is not traced here.
- A fresh plan (state 0, `register`, :490-497) instead routes through the link: s5's plan goes (217,72), (217,71),
  then the link.

This is a candidate mechanism **in the port**, consistent with the recorded pin. It is unverified: no run was made,
and which branch put the follower's route into that shape in the owner's replay is not established. Whether the
original avoids it depends on the unread `FUN_00526540` re-leg (s6.1).

## 9. Review

Re-read at the source on 2026-11-12 by a fresh reviewer who did not write it (Fable seat), who re-derived the cells
with its own scripts. The verdict was PASS WITH FINDINGS, and the verdict (NOT THE CAUSE) holds. The corrections are
folded:
1. the range of `FUN_00517470`;
2. the correction's full gate (s2);
3. the conditions on "held by the original as well", and the locate (s2a, s6);
4. the column-217 caveat, and the datum moved to x 2140 (s2, s5);
5. the rewrite's callers (s1);
6. the next readings (s6.1), with the port-side trace (s8) added;
7. the soil-13 lead (s4);
8. what the re-check rests on (s7).

On finding 6, this author's re-read narrows "`FUN_0052bdf0` refuses a cell on another sub-map" to its direct append
(s6.1).

## 10. T14: what the original's follower does at a cross-sub-map trail point, against the port [read, source; reading, pending review]

**2026-11-12 -- CORRECTED IN s28.5:** departures in the splice and the append, none causing the hold.

Date 2026-11-12, at the main controller's request. This author read every line cited here at the source. Nothing in
this section has yet been re-read by a reviewer who did not write it.

**The answer in brief.** On every line read, the original handles a trail point on another sub-map the same way the
port does. No departure was found in the target, the trail recorder, the trail match, the splice or the re-leg. The
original does not search the link table when it splices a cross-sub-map trail point into the route. It re-legs the
route and leaves the two cells as adjacent stops (s10.2), and the port's `extend` gives the same shape (s10.4). One
difference was found, in how the follower measures its distance to a route point on another sub-map (s10.3). As far
as it was read, that difference does not free a body held on #0 (218,71).

### 10.1 The follow target and the trail

**2026-11-12 -- CORRECTED IN s13.6, s32:** the recorder's feed needs body `+0x105e` bit 0; the walk-back search tests six entries, depth 5 inclusive.

- **The target.** `FUN_005fb1c0` (D:L508490) first asks `FUN_005fd790` (D:L509804) for a target cell (D:L508688).
  That routine steps from a trail cell sideways. It keeps a candidate only when the trail's match `FUN_00524760`
  accepts it and its soil is traversable (D:L509862-509871). The cell goes to `+0x104`, and its world point to `+0xf8`
  through `FUN_0052d480` (D:L508689). Only when that fails is the target the locate of a point offset from the leader
  (D:L508699-508719). The port's version is `hostageFollow.ts:462-478`: `trail.points[depth]` with lateral steps, else
  the leader's position with offsets, then `locate`. This is the same structure.
- **The recorder.** `FUN_00524d50` (D:L392372-392483) puts the given cell at the head of the trail. If the cell is
  already among the newest `param_3` entries, comparing x and z only, it drops the entries before it
  (D:L392407-392426, D:L392462-392467). It stores a width from `FUN_005396c0` with 5 (D:L392469-392475). It neither
  tests nor inserts a link. `FUN_005b7ba0` feeds it the leader's located cell (D:L471307-471325). The feed runs only when body
  `+0x105e` bit 0 is set (D:L471319). It runs on a cell change, and also without one when `+0x1061` bit 6 is set
  (D:L471307-471318) (correction from the review, s13.6).
  So the original's leader trail can hold #0 (218,71) followed directly by #1 (13,7), as the port's `FollowTrail.add`
  does (`hostageFollow.ts:133-140`). The locate gives #1 (13,7) for z < 656.81 in both (s2a).
- **The match.** `FUN_00524760` (D:L392151-392200) accepts a trail cell that is on the same sub-map and within that
  entry's width (D:L392172-392187). It returns the index counted from the oldest entry (D:L392189). The port's `match`
  (`hostagePath.ts:599`) counts newest first and walks in the matching direction; it applies the same test.

### 10.2 The splice and the re-leg

**2026-11-12 -- CORRECTED IN s13.6, s28.1, s28.5, s28.8:** mask 8 is bit 3; departures in the splice; the splice's four preconditions.

- `FUN_0052bdf0`'s direct append needs the same sub-map (D:L396077-396089). Its corridor splice walks the trail from
  the end's match to the goal's match. Only when the trail is enabled (`+0x1c` mask 8, that is bit 3) and both cells match (D:L396096-396099), it
  appends each trail cell through `FUN_00526f20` (D:L396123), and a failed append aborts the splice (D:L396124-396127).
  The goal is then appended the same way (D:L396131-396147).
- `FUN_00526f20` (D:L393306) appends the cell to the route points `+0xa0`. When the cell's sub-map differs from the
  last stop's, it pushes the cell twice onto the stop list `+0x34`, adds a sub-map entry to `+0x40` and counts a leg
  in `+0x28` (D:L393351-393358). It writes the new point's width byte as 0. There is no link lookup.
- **`FUN_00526540`** (D:L393114-393166), called after the splice (D:L396162) and after a fresh plan's answer
  (D:L508832), clears the stop list. It walks the route points from the end. At each change of sub-map between
  neighbouring points it pushes the pair, the last point of one sub-map and the first point of the next, as two stops
  and counts a leg (D:L393143-393157). **It does not search the link table or the map graph, and it inserts no cell.**
  With its third argument set, it calls `FUN_00526380` (D:L393018-393050). That routine smooths each leg through
  `FUN_00525810` (D:L393037-393042), which was not read, and re-assembles the path (`FUN_00527ce0`, not read).
- So, between #0 and #1, the original's follower is steered to the cells the spliced trail holds: #0 (218,71), then
  #1 (13,7). That holds unless `FUN_00525810` or `FUN_00527ce0` adds a link, and neither was read. Links enter a route
  only through a fresh plan's registration over the link graph (`FUN_005623b0`, D:L508815; research 333), which the
  port does in `register` (`hostagePath.ts:495-506`).

### 10.3 The one difference found: cell distance to a point on another sub-map

**2026-11-12 -- CORRECTED IN s11.3, s13.6, s28.5:** the conversion read through; 0x64fd78 and 0x64fd80 are 0; one of seven departures.

`FUN_00567900` measures the body's distance to the route's head with `FUN_0052c320` (D:L429513; D:L396231-396334).
On the same sub-map that is the x + z cell difference (D:L396258-396273). On different sub-maps it converts both cells
into the first sub-map's grid through `FUN_00517050` (D:L385312) and takes the x + z difference there
(D:L396303-396330). If the conversion fails it takes a value from the two sub-maps' `+0x70` fields
(D:L396308-396312). If a sub-map is missing it returns 10000 (D:L396303-396305).

That distance gates two things:
- the branch for a point not yet reached (`if` non-zero, D:L429568);
- the passing test `iVar8 < 2` (D:L429708).

The port passes the raw x + z difference across sub-maps instead: `xyCells(here, next)` (`hostageFollow.ts:540`, into
`passedRoutePoint`, `hostageSteering.ts:26-28`). For #0 (218,71) against #1 (13,7), the port gets 269. The original
gets 1, if `FUN_00517050` maps #1 (13,7) to #0 (218,70) through its centre (2144.58, 651.81); the routine's body was not
read past D:L385345.

As far as read, this does not free the pin. Passing also needs the facing dot to change sign (int index 0x183, byte offset `+0x60c`, positive; the
current dot negative, D:L429706-429707). A body held at z 661.8 short of a head at z 651.81 never passes it. The
not-reached branch (D:L429568-429580) compares the raw x/z deltas against the constants 0x64fd78 and 0x64fd80 (unread).
When they are exceeded it runs the probe `FUN_0056a130` (D:L429595). That probe needs the head on the body's own
sub-map (D:L430322), as the port's does (`hostageFollow.ts:544`). Its obstacle report goes through `FUN_00558030`
(D:L429624).

### 10.4 The port, and a port-only datum

**2026-11-12 -- CORRECTED IN s28.1, s28.5:** the original's spliced pair carries no link flag.

`extend.mts` (output `extend.out.txt`) builds the port's planner on MP71. It gives it a leader trail up column 218
across the seam, newest first: #1 (13,6), (13,7), #0 (218,71), (218,72), (218,73), with widths from `width`. It then
calls `extend` and a fresh `plan`:
- `extend` on the route #0 (218,73), (218,72) to #1 (13,6) gives #0 (218,73), (218,72), **(218,71) L, #1 (13,7) L**,
  (13,6);
- `extend` on #0 (218,72), (218,71) gives #0 (218,72), **(218,71) L, #1 (13,7) L**, (13,6);
- a fresh `plan` from #0 (218,71) to #1 (13,6) gives #0 (218,71), (217,71) L, #1 (12,8) L, (13,7), (13,6).

The port's spliced route thus holds the seam pair, flagged as a link (`flag`, `hostagePath.ts:579-584`) although no
link joins those cells. By s10.2 the original's spliced route has the same pair. The departure the brief asked for (the
original inserting the link pair where the port does not) is **not** shown by the lines read. No "expected original"
variant was run, because there was nothing different to apply.

### 10.5 What remains unread for LATER 933

**2026-11-12 -- SUPERSEDED BY s11:** the readings were taken up there.

- `FUN_00525810` (the per-leg smoothing, D:L393039) and `FUN_00527ce0` (D:L393043): whether either adds a link or drops
  a seam pair.
- `FUN_00517050`'s conversion past D:L385345, and the `+0x70` fallback: the exact cross-sub-map distance.
- The branch taken when `FUN_0052c320` returns 0, the counterpart of `if (iVar8 != 0)` at D:L429568, and the rest of
  `FUN_00567900`'s handling of a seam pair, D:L429640-429962. This includes the special-point jump table at
  D:L429545-429552, taken for a head whose cell has bit 7 set (an action cell) when more than one point remains
  (D:L429515).
- `FUN_00558030` (D:L421550), the obstacle response, from both the correction (D:L413932) and the probe (D:L429624):
  whether a follower held against a soil-0 neighbour replans, and through what.
- The values of 0x64fd78, 0x64fd80 and `DAT_00650cf0`.

(Taken up in s11, whose s11.5 now holds the next readings.) The next step was to read `FUN_00558030` and `FUN_00525810`/`FUN_00527ce0`. If neither breaks the seam pair, the
difference is in what the original's body does on #0 (218,71) under the gate's bits (s2; the port's `type === 1`
model), not in the route.

## 11. T15: the four readings left by s10.5 [read, source; reading, pending review]

Date 2026-11-12, at the main controller's request. This author read every line cited here at the source. Nothing in
this section has yet been re-read by a reviewer who did not write it. Each item gets one verdict: DEPARTURE, SAME or
UNREAD.

### 11.1 The obstacle response (`FUN_00558030`, `FUN_00556370`) -- SAME in structure; DEPARTURE in the route-scan distance; effect at the pin not run

**2026-11-12 -- CORRECTED IN s12.2, s12.3, s13.3:** in the port run the record matures and recovery fires; the sub-map-0 distance alone does not free the pin; a higher type replaces a lower one.

**What the original does.**
- `FUN_00558030` (D:L421550-421640) is the setter of the type-2 ("AI-map") obstacle record. It takes the record's
  claim through `FUN_00557f60(..., 2)` (D:L421568). It then refreshes or re-seeds the record's cell: it re-seeds when the
  cell moved by at least `DAT_006504b0` or the record has aged past `DAT_006504a8` (D:L421581-421615). A probe report
  (`param_5` set) while the record already holds a probe clears it (D:L421617-421623). It returns whether the record is type 2 with a zero count
  (D:L421635-421639). It plans nothing.
- The reader is `FUN_00556370`, the per-tick response. When the record has matured and the state byte stored in the record at claim time
  (`FUN_00557f60` D:L421516, D:L421538) is 3 or 6, it scans the route from its head (D:L420873-420877). The distance used is `FUN_0052c320` between the record's
  cell (`+0xcf`, at piVar21 + 0xcf) and each route point (D:L420875). The scan stops at the first point farther than
  `DAT_00650508` (D:L420876). The points before it are popped (`FUN_00524d00`, D:L420893-420896), and the recovery
  state is entered through `FUN_00604390` with that point as its target (D:L420897-420905).
- The recovery itself (`FUN_00603950`, research 334) issues a fresh request through the link graph.

**The port** has both pieces:
- `HostageObstacle.ai` (`hostageAvoidance.ts:66-74`) for `FUN_00558030`;
- `tick` (`:76-92`) and the recovery block (`hostageFollow.ts:377-445`, with `recoveryTarget`/`recoverySuffix`,
  `hostageAvoidance.ts:95-112`) for `FUN_00556370` and `FUN_00603950`.

The correction's report reaches it (`hostageFollow.ts:597`, `this.obstacle.ai(result.obstacle, dt)`). So a held
follower does replan in both, once the record matures.

**The departure.** The port's scan measures with the raw cell distance (`cells`, `hostageAvoidance.ts:16`), not with
`FUN_0052c320`'s sub-map-0-grid conversion. `recovery.mts` (output `recovery.out.txt`) ran both metrics on the pin's
spliced route #0 (218,71), #1 (13,7) ... (13,3), with the obstacle at #0 (218,70):
- **The port** picks #1 (13,7), the seam point itself: raw distance 268.
- **The original's metric** gives (13,7) distance 0 (it converts to #0 (218,70)), (13,6) 1, (13,5) 2 and (13,4) 3,
  so it picks #1 (13,3) (distance 4).
- **Both plans** from #0 (218,71) go through the link: (217,71) L, (12,8) L, then on to the target.

So the metric changes the recovery target, but both targets lead off the pin through the link. This does not explain
the pin. It does **not** show whether the port's record matures and its recovery fires at the pin at all. That was not
run, and the port's `ai` returns early while a higher-type record (a hull contact, type 4) is held
(`hostageAvoidance.ts:67`). The original's precedence among record types, inside `FUN_00557f60`, was not read.

### 11.2 Per-leg smoothing and re-assembly (`FUN_00525810`, `FUN_00527ce0`) -- SAME

- `FUN_00525810` (D:L392681-392813) takes one leg's index range (`FUN_005279e0`, D:L392713). It smooths it on that
  leg's sub-map with the line test `FUN_00537e50` (D:L392794), stopping at action cells (`FUN_00516920`/`FUN_00525c60`,
  D:L392732-392783).
- `FUN_00527ce0` (D:L393775-393819) re-assembles the points (`FUN_00528530` with the invalid-loc sentinel 0x65aed0,
  D:L393810; `FUN_00528c80`, D:L393814).

Neither looks up a link, crosses a leg, or drops a seam pair. The port's counterpart is the per-same-map-run `smooth`
in `extend` (`hostagePath.ts:609-615`).

### 11.3 `FUN_00567900`'s distance to a point on another sub-map -- the "1" is confirmed; no small-distance skip found in the lines read; the rest UNREAD (CORRECTED 2026-11-12, s28)

**2026-11-12 -- CORRECTED IN s28:** the planar-distance and distance-0 pops.

> **CORRECTED 2026-11-12, later (s28).** Two sentences below are WRONG: that the head is advanced "only on the
> passing test", and that "no arrival radius on the distance alone was found". Both pops are in the text and in the
> bytes [D; V1, this author]:
> - **the planar-distance pop**: D:L429705 tests `DAT_006501b8 <= fVar25` (the planar distance to the point); when
>   the distance is below it, the else-arm pops the point at D:L429897-429903. r1 0x568bb0 `lui at,0x65`, 0x568bb4
>   `lwc1 $f0,440(at)` (r1 0x6501b8, which holds 0x40a00000 = 5.0), 0x568bb8 `c.lt.s $f21,$f0`, 0x568bbc `bc1f
>   0x568c18`, then the pop r1 0x568bd4 `jal 0x524d00`;
> - **the distance-0 pop**: when `FUN_0052c320` returns 0, D:L429568's `if (iVar8 != 0)` is false and D:L429907-429913
>   pop the point; r1 0x568434 `beqz v0,0x5684c0` (0x10400022).
>
> Research 200 s3.1 and research 334 (about line 148) already had them. The sentences are kept as written.

- `FUN_00517050` (D:L385312-385413), read in full:
  - with the same sub-map, it returns the cell as it is (D:L385337-385340);
  - otherwise it takes the cell's centre, plus the action offset where the cell has bit 7 (D:L385346-385367). If that
    point lies inside the target sub-map's x/z bounds, it returns the floor of (point - min) x scale in the target's
    grid, which must be inside its cell counts (D:L385370-385402).

  #1 (13,7) has bit 7 clear. Its centre (2144.58, 651.81) gives #0 (218,70), so `FUN_0052c320` gives 1 against
  #0 (218,71) (`recovery.out.txt` prints the conversions). The `+0x70` fallback (D:L396308-396312) applies only when a
  conversion fails, which it does not here.
- Correction from the review (s13.6): the passing test is not the only advance. D:L429692-429702 holds a second one,
  gated on the point's width byte and a 5.0 lateral limit. The port models it (`hostageFollow.ts:539`). It cannot fire
  for spliced points, whose width is 0.
- In the lines read (D:L429513-429719), the route head is advanced only on the passing test. That test needs a
  previous positive facing dot and a negative current one, plus a cell distance below 2 or a travelable next point
  (D:L429706-429709). With the original's distance of 1, the second condition holds where the port's 269 fails it. The
  facing flip is still required, and a body held at z 661.8 short of a head at z 651.81 never flips. No arrival radius
  on the distance alone was found. The `iVar8 == 0` counterpart of D:L429568, and D:L429640-429962, remain unread.

### 11.4 The held body's gate bits -- `+0x172` bit 0 SAME; `+0x171` bit 7 and `+0x32c` bit 0 UNREAD

**2026-11-12 -- CORRECTED IN s13, s14:** the bit's writers; its values by phase.

- **`+0x172` bit 0.** The initialiser `FUN_00598280` sets it, so the gate starts shut (D:L454750). `FUN_005b7ba0`
  sets it on a failed locate (D:L471280) or on a non-traversable cell beyond one cell (D:L471306). It clears it on every
  traversable locate (D:L471333). That last write is a correction to s2, which listed only the setters. The port
  recomputes the one-cell test each move (`hostageFollow.ts:593`). For a body on traversable cells, as on the landing,
  both leave the gate open: SAME.
- **Corrected 2026-11-12 (s14):** the writers listed in s13 stand. s13's values for steering ("always 0") and for
  standing in position ("1") are contradicted by the r0004 trace; s14 re-reads them.
- **`+0x171` bit 7: settled by the review, s13 (values superseded, s14).** It has three virtual setters that the decompilation's text does not list,
  reached through vtable slot `+0xb4`. In the follow state, the follow tick clears it while steering. The paragraph
  below is kept as written; its "no setter" was a text search only.
- (As first written) **`+0x171` bit 7.** The initialiser clears it (D:L454749). No setter was found by text search over the decompilation
  for writes to `+0x171` (`+0x170` word writes included). Who sets it for a hostage following a player is UNREAD. If
  it stays clear and `DAT_0066b000` is zero, the original does not run the correction at all (D:L413920-413922), and
  a body on #0 (218,71) would not be pushed back. The port runs the correction whenever the obstacle type is not 1
  (`hostageFollow.ts:595`, `hostageAvoidance.ts:52`). **This is the open question most able to end the hunt.** An RDRAM
  read of a following hostage's `+0xc0 -> +0x171` (and `DAT_0066b000`) on the original would settle it.
- **`+0x32c` bit 0** on the obstacle record: settled by the review (s13.3). It is the record's type byte at `+0x324` being
  1, so the port's `type === 1` models it.

### 11.5 Next readings

**2026-11-12 -- CORRECTED IN s12, s13:** items 1-3 settled.

1. Settled in s13 (by reading, not by measurement): who sets `+0x171` bit 7, and `DAT_0066b000`.
2. A port run of the follower at the pin, to see whether its type-2 record matures and its recovery fires, or a type-4
   hull record shadows it (`hostageAvoidance.ts:67`).
3. Settled in s13.3: `FUN_00557f60`'s precedence (a higher type replaces a lower one, never the reverse).
4. `FUN_00567900` D:L429640-429962, and the `iVar8 == 0` branch.
5. The values of `DAT_006504a8`, `DAT_006504b0`, `DAT_00650508` (the port reads 3), 0x64fd78, 0x64fd80 and
   `DAT_00650cf0`.

Item 2 is done in s12: the port pins, its recovery fires and re-enters the pinned column, and the correction alone
decides it.

## 12. T16: the port's real follower at the pin, run under node [data, port run; reading, pending review]

Date 2026-11-12, at the main controller's request. **This is a port run under node, headless.** It is not a rendered
browser run and not the original. No repository code was changed: the what-ifs patch only a planner instance, or a
scratch copy of `hostageFollow.ts`, inside the scratch script.

**The harness** is `pinrun.mts`, with `patched/hostageFollow.sub0.ts`. Its outputs are `pinrun.base.out.txt`,
`pinrun.nocorr.out.txt`, `pinrun.sub0.out.txt`, `pinrun.both.out.txt`, `pinrun.MP6a.out.txt` and
`pinrun.MP6b.out.txt`, all scratch under `evidence/forge-stim/xs/cells/`, outside git. It is built as
`packages/match/test/hostageTraversal.test.ts` builds its case, from the disc's MP71 pack, `MOTION_P.ZAR` and
`READERC.ZAR`:
- `simMapFromBytes`, a `HostagePathPlanner` over `HostageObstacles`, and the real `HostageFollow` with the clips;
- a scripted leader that is a real `Walker`. It is sampled into `FollowTrail` by the steps of
  `test/helpers/hostageLeaderSample.ts`, and both bodies are bound to occupancy as the test binds them;
- `follower.step` at 30 Hz for 20 s.

The leader walks MP71's east column from the ground floor, #0 (218,82), up the stairs (218,78)…(218,71), onto
tophost (13,7), (13,6), then west to (8,6), and stands there. The follower starts behind it at #0 (218,85). The brief's
start at (218,73) would have put the follower ahead of the leader's climb, so the trail would not hold the stair.

**Adaptations** (test-harness choices, not game behaviour):
- The leader waits while more than 150 units ahead of the follower. The dev-disc test uses 100. 150 lets the trail
  pass `FOLLOW_RULES_READING.trailStart` (8 cells) before the leader stops; with 100 the follower never started.
- A leader waypoint counts as reached at 2 units.

### 12.1 (a) Does the port reproduce the pin? Yes

By t ≈ 6 s the follower stands at (2144.6, 220.8, 661.8) on #0 (218,71), with route [#1 (13,7) L, #1 (13,6)]. Every
frame the correction pushes the proposed z (about 661.27) back to 661.81, reporting obstacle #0 (218,70). The
follower stays held, at (2141.5-2144.6, 220.8, 661.8), through t = 20 s while the leader stands on tophost (8,6). This
matches the row's (2139-2144.6, 220.8, 661.8).

### 12.2 (b) Recovery fires, but does not free the follower

The type-2 (map) record matures. Recovery enters at t = 8.20, 14.97 and 19.47 s. Each time it targets #1 (13,7) and
replans through the link: [#0 (218,71), (218,72) or (217,71) L, #1 (12,8) L, #1 (13,7) L, #1 (13,6)]. The follower walks
to the link cell (217,71) (at t = 12 s it is at (2138.3, 218.8, 664.7)). Then:
- the link point #1 (12,8) has the same x/z as (217,71) and is consumed at once;
- the next point is #1 (13,7), whose centre is (2144.58, 651.81), up and to the east;
- heading for it, the body crosses x 2139.58 into column 218 while z is still at least 656.81, so it is located on
  #0 (218,71) again, and the correction holds it at z 661.81 (t = 13 s onwards).

Nothing blocks the recovery; in this run no wall-contact record (type 4) shadows it at the pin. What fails is that the
route after the link aims diagonally at a cell whose straight line from the link cell re-enters the east column below
the seam.

### 12.3 (c) The three what-ifs

**2026-11-12 -- CORRECTED IN s15.1, s32.7:** the bit is clear at the landing, yet the original climbs column 217, not (i)'s column 218; with a walking leader, consistent with the correction being what pins the port; the bit's rule is still an inference.

| variant | leaves the pin? | route | reaches the leader? |
|---|---|---|---|
| (i) `nocorr`: the correction returns the proposal (the original if `+0x171` bit 7 is clear for hostages, s11.4) | **yes**, at t ≈ 6.0: located on #1 (13,7) at (2144.6, 222.0, 656.3) | the spliced route straight up column 218, no link: [#1 (13,7) L, #1 (13,6)], then [#1 (13,6), (10,6), (10,5)] | **yes**: arrives in follow state 7 (idle by the leader) at t ≈ 10 on #1 (12,6), 35 units from the leader on (8,6), its formation spot |
| (ii) `sub0`: the route-point distance in sub-map 0's grid (s10.3/s11.1) in the passing test and the recovery scan | **no** | the recovery target becomes #1 (13,6) instead of (13,7); the same link detour, the same re-entry into column 218 | no |
| (iii) `both` | **yes**, as in (i) | as in (i) | yes, as in (i) |

So, among these, only the correction decides the pin: with it off, the follower climbs column 218 and crosses the
seam directly. The sub-map-0 distance alone changes nothing that matters here.

### 12.4 (d) Another map's cross-sub-map stair: MP6 (`links.mts`, `stairs.mts` chose the routes)

- **MP6 #0 (114,44) → #5 (4,12)** (`pinrun.MP6b.out.txt`). The leader walks the link column itself:
  #0 (124,44), (114,44), #5 (4,12), (3,11), (4,6). The follower crosses at t ≈ 8 and arrives (state 7) by t ≈ 12. No pin.
- **MP6 #0 (88,50) → #1 (14,13)** (`pinrun.MP6a.out.txt`). The follower crosses the seam at the link (t ≈ 14). It is
  then held from t ≈ 16 on #1 (16,11)/(16,12), with a **type-4 (wall-contact) record** on #1 (17,11) whose weight grows
  to 7.2. Recovery enters once (t = 18.63, target #1 (15,9)). It does not reach the leader on #1 (14,7) within 20 s.
  This is a **different hold**: a physical wall contact on the upper floor, not the AI-map correction at a seam. It is
  not analysed here.

On these two MP6 stairs, the leader's trail crosses at the link cell, where the correction is skipped (bit 8, s2), and
no seam pin occurs. MP71's pin needs a trail that crosses the seam off the link column, onto a cell whose
same-sub-map neighbour across the seam is a wall (soil 0) and whose cell above is not stored. The east column at
(218,71) is such a place. Whether other maps have such seams was not surveyed.

### 12.5 What this run does and does not show

**2026-11-12 -- CORRECTED IN s15.1, s32.7:** the bit was clear through the landing, measured once; with a walking leader, consistent with the correction being what pins the port; the bit's rule is still an inference.

- **It shows:** the port's own pin at the row's coordinates; that recovery fires and replans through the link but
  re-enters the pinned column; and that removing the correction alone frees the follower.
- **It does not show** what the original does. Whether the original runs the correction for a following hostage at
  all (`+0x171` bit 7) is the reviewer's open reading (s11.4, s11.5 item 1). If the original's bit is clear for hostages,
  (i) is the original's behaviour and the port's correction gate is the departure. If it is set, the original must
  differ elsewhere, and the recovery's diagonal aim after the link (s12.2) is the next candidate.
- The leader script and the 150-unit wait are harness adaptations.
- The MP6a wall hold is unexplained.
- A browser run and the original were not run.

**Re-check:** host lock `check`, then from an installed `agent/v0420` tree's `redotcom`:
`npx tsx <scratch>/pinrun.mts <base|nocorr|sub0|both> MP71 '<leader cells JSON>' '<follower cell JSON>'`, with the
cells as above (`[[0,218,82],[0,218,78],[0,218,76],[0,218,74],[0,218,72],[0,218,71],[1,13,7],[1,13,6],[1,11,6],[1,8,6]]`,
`[0,218,85]`). For MP6, use the cells in s12.4.

## 13. The correction's enable bit for a following hostage [read, source and machine code; reading -- re-read by a reviewer 2026-11-12; not measured]

**2026-11-12 -- CORRECTED IN s14:** claims (b) and (c) contradicted by the trace.

> **Correction, 2026-11-12, after a trace of the original (s14).** The bit's per-phase values are now a TRACE of the original (proven for n = 1, said as n = 1); the mechanism for 933's pin is still a reading, and the first reading of it was wrong in two of three parts.
>
> Of s13's three claims:
> - (a) the follow goal clears the bit on entering follow: **confirmed** by the trace;
> - (b) the bit is cleared at the end of every route-steering follow tick, so a steering follower never has the
>   correction: **contradicted as worded**. The bit is set in 55 of 179 steering frames;
> - (c) the bit is set when standing in position: **the opposite of what was measured**. It is clear there, in
>   242 of 242 frames.
>
> s14 re-reads the code and finds where s13 went wrong. The proposed fix in s13.7 is **withdrawn**. The RED in
> `hostageTraversal.test.ts`, which LATER 933 asks for, stays wanted.

Date 2026-11-12. **Source of the finding:** the Fable reviewer's second review (scripts and outputs in
`evidence/forge-stim/xs/cells/review2/`: `elfscan.py`, `vt.py`, `dat66b000.py`, `constants.out.txt`, `vtables.out.txt`,
scratch outside git). This note's author then re-read every decompilation line cited below at the source.

**Two kinds of evidence are kept apart here:**
- claims cited `D:L<line>` rest on the decompilation's text;
- claims cited by a bare address (0x557ee0, 0x592030, 0x2b3c70, the vtable 0x6693f0, 0x549750, 0x5497b0, the static
  data values) rest on the **ELF's machine code and data** (the r0001 game ELF), as the reviewer's scripts read them.
  This author read those scripts' outputs, not the disassembly itself.

Nothing in this section is measured on the original running.

### 13.1 The bit and its writers

**2026-11-12 -- CORRECTED IN s14.2, the s14 banner:** the 1-write is state 3's "need not move" branch, behind the network flag; the writers list stands.

- `+0x170`, `+0x171` and `+0x172` of the body's controller (body `+0xc0`) are three separate bytes of one-bit fields.
  The base initialiser is `FUN_00598280`, and the AI controller class is built by `FUN_00574080` with vtable 0x6693f0
  (machine code).
- `+0x171` bit 7 is cleared by the initialiser (D:L454749).
- It is also written by three small virtual setters that the decompilation's text never lists. All three are reached
  only through vtable slot `+0xb4` (machine code; `vtables.out.txt`, `elfscan.out.txt`):
  - 0x557ee0, the AI controller's: writes the bit from its argument, forcing 0 when movement state `+0x3f4` is 7;
  - 0x592030, the base's, shared by two other classes;
  - 0x2b3c70, the type-4 controller's.
- The calls to slot `+0xb4` in the decompilation, each re-read at its line:
  - `FUN_00573130` D:L434856, the AI reset: 1;
  - `FUN_005fdf80`, the follow goal's signal handler:
    - D:L510064 and D:L510111 (signals 0 and 3, entering or re-entering follow, which sets state 6): 0;
    - D:L510089 and D:L510099 (signals 1 and 2, leaving follow): 1;
  - **`FUN_005fae70` D:L508484, at the end of every state-6 follow tick**, with the value `uVar10`:
    - `uVar10` starts at 0 (D:L508408);
    - it becomes 1 only on the branch where `FUN_005fd150` says the follower need not move and `FUN_005fdad0`
      returns true, that is, standing in position (D:L508443-508451);
    - the route-follower branch calls `FUN_00567900` (D:L508454) and leaves it 0, as does every other branch;
  - `FUN_00556370` D:L420662, D:L420688 and D:L420745, when a type 2, 4 or 1 record matures: 1;
  - `FUN_0056cbf0` D:L431705 and D:L431737, around state 7;
  - `FUN_005714b0` D:L433982, teardown: 0;
  - `FUN_0060ee80` D:L518610, `FUN_0060f470` D:L518769 and `FUN_0060f5e0` D:L518816, another AI state class.
- **Order in the tick.** `FUN_005fae70` is the state-6 case of the AI tick `FUN_0056de10` (D:L432582), and runs after
  `FUN_00556370` (D:L432512).

### 13.2 What the bit means

**2026-11-12 -- CORRECTED IN s15.2:** one more functional reader of the bit: the walker's type-4 body.

The only functional reader is the gate (0x549750 in machine code; D:L413920-413922 in the decompilation). The other
readers save and restore the bit around state 7. So the bit means "apply the AI-map correction to this body". The
correction's call path is unique: `FUN_005169b0` is reached only from `FUN_00516f10`, which is reached only from
0x5497b0 (D:L413925).

`DAT_0066b000` has four loads (D:L413920, D:L414127, D:L414241, D:L415028) and no store anywhere by direct addressing.
It is zero-initialised (machine code; `dat66b000.out.txt`). It is a development toggle, off in the shipped game.

### 13.3 `+0x32c` bit 0

This is the obstacle record's type byte at `+0x324` being 1. `FUN_00557f60` (D:L421502-421547) sets the type: a
higher type replaces a lower one (D:L421530-421541), never the reverse. So the port's `type === 1`
(`hostageAvoidance.ts:52`) models it correctly. This also answers s11.5 item 3.

### 13.4 The conclusion (superseded 2026-11-12, s14: (b) and (c) are contradicted by the trace)

**2026-11-12 -- SUPERSEDED BY s14:** the conclusion is contradicted by the trace.

**For a hostage being steered along its route in the follow state, the original does not run the AI-map
correction.** The follow tick clears the bit at its end whenever it ran the route follower (D:L508454, D:L508484).

The exceptions are:
- standing in position (D:L508443-508451);
- from the tick an obstacle record matures (D:L420662/420688/420745) until the follow tick next runs. The recovery
  state, in which the follow tick does not run, keeps the bit set;
- a non-zero `DAT_0066b000`, which never happens in the shipped game.

The port runs the correction on every move, with no term for the bit (`hostageFollow.ts:593-597`), and reports a
type-2 obstacle from it. **This is a simulation-track departure, and LIKELY the cause of LATER 933.** It is not proven
until measured (s13.7).

In the port run (s12), turning the correction off alone frees the follower. The run with the original's condition as
read here (variant `exact`, s13.5) frees it too.

### 13.5 The port run with the original's condition (`pinrun.mts exact`, `pinrun.exact.out.txt`)

**2026-11-12 -- SUPERSEDED BY s14:** its condition.

**The condition.** The correction runs only when one of these holds:
- the follower is in recovery (the state a matured record starts; the follow tick does not run in it);
- it is not route-steering (follow state other than 3);
- it is moving to a direct target.

Otherwise it is skipped.

**The result.** On the MP71 case of s12 the follower:
- climbs column 218 and is located on tophost #1 (13,7) at t ≈ 6.0 (2144.6, 222.0, 656.3);
- follows the spliced route (13,6), (10,6), (10,5);
- arrives in follow state 7 at t ≈ 10 on #1 (12,6), its formation spot 35 units from the leader on (8,6);
- stays there to t = 20 s.

There is no pin and no recovery. This is a port run under node, not the original.

### 13.6 The review's small corrections, folded into s10-s11

- **The recorder's feed** needs body `+0x105e` bit 0 (D:L471319). It also fires without a cell change when `+0x1061`
  bit 6 is set.
- **The trail-enabled test** at D:L396096 is mask 8 of `+0x1c` (bit 3), not "bit 8".
- **`FUN_00526f20`** also writes the new point's width byte as 0.
- **Route advance.** The passing test is not the only advance: D:L429692-429702 holds a width-gated one with a 5.0
  lateral limit, which the port models (`hostageFollow.ts:539`) and which cannot fire for width-0 spliced points.
  "`+0x183`" is int index 0x183, byte offset `+0x60c`.
- **The state tested by `FUN_00556370`** is the state byte stored in the record at claim time.
- **Static data values** (machine code; `constants.out.txt`):

  | constant | value |
  |---|---|
  | `DAT_00650508` | 3 |
  | `DAT_006504a8` | 2 |
  | `DAT_006504b0` | 2 |
  | 0x64fd78, 0x64fd80 | 0 |
  | `DAT_00650cf0` | 7 |
  | 0x650918, 0x650920 | 0 |
  | `DAT_00650928` | 5 |

### 13.7 How it was missed, and how to measure it

**2026-11-12 -- WITHDRAWN:** the recipe's handle, s15.3/s15.6; the row text, s14.5, itself superseded by s15.7.

**How it was missed** (a record of fact, not of blame):
- Research 334 (lines 170-178) read the gate and the setter 0x557ee0 with its reset call (D:L434856), but not the
  follow goal's calls (D:L510064-510111) or the follow tick's (D:L508484).
- `hostageFollow.ts:50` cites `FUN_005fdf80` D:L510065-510069, the lines right after the clearing call at D:L510064.
- The setters are absent from the decompilation's function list, so a text search for writes to `+0x171` (s11.4)
  found only the initialiser.

> **Corrected 2026-11-12 (s15.3).** The recipe below is wrong in its handle. At the follow call (r0001 0x5fb0e4,
> r4 0x6028c4), a1 is not an argument: the jal's delay slot (r0001 0x5fb0e8, r4 0x6028c8, `daddu a0,s1,zero`)
> sets a0 from s1, the tick's own first argument. A breakpoint on the jal fires before that slot runs, so a0 there
> still holds an earlier value. The rig did not use this recipe for the bit: it took the controller from the body
> (s15.2), so no measurement was spoiled. The recipe that replaces it is s15.6.
> **Why "take a1" was wrong.** The reason is different from the a0 read's, and adds to it. The a0 read was right
> about the register and early by one instruction: the delay slot had not run. "Take a1" was wrong about the
> register. It mapped the decompilation's `FUN_00567900(param_1, param_2)` onto (a0, a1). In fact `param_1` is the
> float in f12 (r0001 0x5fb0e0, `mov.s f12,f20`, shown as `op11 4600a306`), and `param_2` is a0, set in the delay slot.
> Nothing on the paths to the jal writes a1 for this call. What a1 holds there is left over from earlier in the tick:
> for example 4 from r0001 0x5fb094 `addiu a1,zero,4`, or 0 from 0x5fb0c0 `daddu a1,zero,zero`, both on the
> `FUN_005fd150` path; on the other paths, whatever the last call left. So the a1 handle failed for a different reason
> from the a0 read: the wrong register, not a register read before its delay slot. Had the recipe said a0, it would
> still have needed the delay-slot rule (s15.6). This rests on the instructions above, re-read in r0001, and in r0004
> at 0x602874 and 0x6028a0 [V4].

**Measurement recipe** (PCSX2 with the US disc, a hostage following a player up Fish Hook's east column):
- break once at 0x005fb0e4 (the route-follower call inside the follow tick) and take `a1` as the follower's
  controller C;
- watch byte C+0x171, mask 0x80, across the climb; it should read 0 while the hostage steers along the route;
- read byte 0x0066b000; it should be 0;
- or set a breakpoint at 0x005497b0 with the condition `s5 == [C+4]`. It must not fire while the hostage
  route-steers.

**Text for LATER 933, WITHDRAWN 2026-11-12** (replaced by s14.5; kept here as superseded) (not written to LATER.md: this host's leak check refuses that file; for the controller to
carry):
> research 404 s13: in the follow state the original clears the AI-map correction's enable bit (`+0x171` bit 7) at
> the end of every route-steering follow tick (`FUN_005fae70` D:L508484 via vtable `+0xb4`, setter 0x557ee0), so a
> route-steered follower is never pushed back by `FUN_005169b0`. The port runs the correction on every move
> (`hostageFollow.ts:593-597`). A port run with the original's condition leaves the pin and reaches the leader (s13.5).
> Fix: gate the follower's correction by the bit's state as read (off while route-steering; on while standing in
> position and in recovery), for every map. Measure first by the recipe in s13.7.

## 14. The bit by phase: the r0004 trace against a fresh re-read [trace (n = 1, relayed); read, source; port run; reading, pending review]

**2026-11-12 -- CORRECTED IN the s14 banner, s15:** the third reading; a0 at the follow call.

Date 2026-11-12.

**The measurement** is relayed from the Forge seat; its record is on the hub, not on this host. The Shadow PC's rig
traced the original running: build r0004, two clients on MP71, one hostage, n = 1 follow.
- The r0004 addresses were found by pattern match: the follow call at r4 0x6028c4, the correction call at r4 0x54e4c0,
  and the global at r4 0x66a980, which read 0 in every sample.
- `+0x172` bit 0 was clear throughout.
- `+0x171` bit 7 by phase:

  | phase | bit 7 set |
  |---|---|
  | idle | 90 of 90 |
  | entering follow | cleared within about 0.2 s |
  | steering behind a walking leader | 55 of 179 moving frames (41 set in every sample of the frame) |
  | catching up | 22 of 154 |
  | standing in position near the stopped leader | 0 of 242, with 0 correction hits in 400 pauses |

- Not reached: whether the correction actually runs in the open steering frames.
- Observed and not explained: at the follow call, a0 is the leader's controller (40 of 40). (Explained 2026-11-12,
  s15.3: a register read one instruction before the delay slot that sets a0. It shows the path of those 40 hits only.)

> **Correction, 2026-11-12: the third reading of `FUN_005fae70` (one reviewer's, awaiting a second reader).** A
> Fable reviewer re-read s14 at the source and it FAILS. Its scripts are in `evidence/forge-stim/xs/cells/review3/`
> (scratch outside git). The text of s14 below is kept as written, and is superseded where these points say so.
> - **The missed condition (s14.2a).** The one place the tick writes the bit as 1 (D:L508449; 0x5fb12c) also needs
>   `FUN_005750a0() == 0` (D:L508425; 0x5fb01c-0x5fb024), `DAT_0066b038 == 0` and a term on the follower body's
>   `+0xc8` mask 0x20000 or `FUN_005e0010(leader) == 1` (D:L508425-508427). This author re-read the machine code.
>   `FUN_005750a0` is `lui at,0x46; jr ra; lbu v0,-0x5f3f(at)`, so it returns the byte `DAT_0045a0c1` (r0001
>   0x5750a0-0x5750a8). In r0004 it is r4 0x57a470, `FUN_005750a0`'s twin (4 words, 3 identical, 1 relocated), reading byte r4 0x45d481 [V4]. That byte is the game's multiplayer flag [I1]:
>   roadmap/07-match.md T3, research 389 and 391, and the desktop's research 18 (L449, L533). **As a prediction:** in
>   a network game that branch cannot run on any console, and the tick writes 0 on every follow tick. **Its test is one
>   read:** byte r4 0x45d481 on each console during a follow (s15.6, read 4).
> - **What would remain of the set frames** is an INFERENCE, not measured. `FUN_00556370` writes the bit as 1 when a
>   record matures; a type-1 record writes it every tick once older than `DAT_006504f0` = 0.1 s (D:L420744-420745).
>   When `FUN_00556370` returns non-zero, the AI tick replaces the state for that frame (D:L432512-432545). The follow
>   tick is then skipped, and the bit stays set.
> - **The states (correcting s14.2 "standing states 4, 5, 7 and 8").** States 7 and 8 write `+0x7c` = 1 every time
>   (D:L509071). State 4 writes it only when the leader's slot `+0x2c` answers non-zero: otherwise the case breaks at
>   D:L508968, before D:L509034. State 5 is the direct move to a formation cell (D:L509039-509043). It writes `+0x7c`
>   = 1 on one of three branches (D:L509056); its contact branch writes 0 (D:L509060), and its exit to state 7 leaves
>   0 (D:L509063-509066). State 8 is a 2.5 s retry wait, entered from state 2 on a failed route (D:L508826-508829).
>   `FUN_005fd150` also has a precondition on the follower body's short `+0x174` (`FUN_00569530`, D:L509592). Its
>   radius is halved when the leader's `+0xf74 & 0xef` is 2 (D:L509609-509612). This author re-read each line.
> - **Consequences.** s14.2's and s14.3's steering and catching-up rows ("1 on ticks where the follower need not
>   move") cannot occur online if the prediction holds. s14.3b's "which machine" conclusion and both candidate
>   mappings of s14.6 lose their basis: under the code as read, both consoles write 0 on every follow tick. The
>   well-posed open question left is the idle split, 0x08 against 0x88 (s14.6). The ruling on our room (s14.6) rests on
>   the TRACE, that is, on where the simulation lives, and not on this mechanism.
> - **Builds.** The reviewer compared r0001's `FUN_005fae70` (0x5fae70-0x5fb1a0) with r4 0x602650, word for word
>   (`cmp.py`, `cmp.fae70.out.txt`). Of 204 words, 191 are identical. The 13 that differ are 11 relocated jal targets
>   and the global's lbu pair (r0001 `DAT_0066b038`, r4 0x66a9b8) [V4, the reviewer's]. The r0004 file is the owner's served build,
>   `game/r0004/served/socom2_game_served.elf` under the desktop tree.
> - **a0 at the follow call.** s14.3's "a0 is `param_1` and a1 is the controller `param_2`" (below) is wrong.
>   `param_1` rides in f12 and `param_2` in a0, set in the call's delay slot (s13.7's correction). The third reading's
>   "a0 = the tick's own this" holds from the delay slot on. s15.3 gives the full account against the rig's
>   measurement.
> - **`mech`** (s14.4): its "on while it moves to a direct target" contradicts state 5 writing 0 on every tick.
> - **The LATER-row text in s14.5** repeats the withdrawn mechanism. It is superseded by the text in s15.7.

### 14.1 Builds

**2026-11-12 -- CORRECTED IN s19, research 417 s20, the STATUS:** `FUN_005fb1c0` differs; r4 0x594dd0 read.

Every `D:L` citation in this note is from the decompilation of `socom2_game.elf`, the r0001 game ELF. On this host
that file is 4,835,072 bytes, under the desktop tree's `game/disc/`. The desktop's KNOWN.md describes r0004 as a
real rebuild produced from PSRewired's patch capsule (rulings R248 and R251). Its served ELF on this host is
`game/r0004/served/socom2_game_served.elf`, 5,016,064 bytes.

Code moved between the builds: the follow call is r0001 0x5fb0e4 and r4 0x6028c4, and the correction call
is r0001 0x5497b0 and r4 0x54e4c0.

Only one function was compared across the builds. `setter_r0004.py` (standard library only) found the AI controller's
setter body, r0001 0x557ee0-0x557f2c (20 words), word for word at r4 0x55d200. That setter writes bit 7 from
the low bit of its argument, and writes 0 when movement state `+0x3f4` is 7. This was disassembled by this author with
the reviewer's standard-library `review2/mips.py`; it is not negated. The follow tick, the decision function and
`FUN_005fd150`/`FUN_005fdad0` were **not** compared in r0004. There is no r0004 decompilation on this host, so this
author cannot read r0004's versions of them. **Everything below assumes they match r0001.**
**Corrected 2026-11-12 (STATUS; s19):** false for the decision function. r4 0x6029a0, the image of `FUN_005fb1c0`,
inserts an online-only call to r0004-only code, r4 0x594dd0, on the target's fallback arm (r4 0x602f34-0x602f50)
[V4]. The follow tick itself matches word for word apart from relocations (s14 banner).

### 14.2 A fresh re-read of `FUN_005fae70` (D:L508381-508486)

**2026-11-12 -- CORRECTED IN the s14 banner:** the missed network-flag condition.

**The value.** The value passed at the end, through slot `+0xb4` (D:L508484), is `uVar10`. It is set to 0 at
D:L508408, and its only other assignment is to 1 at D:L508449. That assignment is reached only when all of these hold:
1. the follow goal's byte `+0x7c` is 0 (D:L508410);
2. its byte `+0x7d` is non-zero (D:L508411);
3. `cVar3` is 0. It defaults to 1 (D:L508417) and becomes `FUN_005fd150`'s result only when the leader-side
   conditions at D:L508418-508427 hold (D:L508428);
4. `FUN_005fdad0` returns true (D:L508444-508449).

**`FUN_005fd150`** (D:L509566-509657) returns true by default (D:L509590). It returns false only when both hold:
- the distance argument (the goal's `+0xf4`) is within `fVar7` x 1.25, or its fourth argument is 0
  (D:L509617). `fVar7` is 100 or 40 (D:L509605-509607, constants in s13.6);
- the slot query `FUN_005fd460` fails, or `FUN_005fe1f0` is non-zero (D:L509638-509650).

A true result is followed by the route follower `FUN_00567900` (D:L508454). So true means "move along the route",
and false means "need not move this tick".

**`FUN_005fdad0`** (D:L509902-509973) returns true at once when the goal's `+0x6c` bit 1 (mask 2) is already set
(D:L509916). Otherwise it tries a facing action, and on success sets that bit and returns true (D:L509966-509970).
The bit is cleared when the route follower runs (D:L508455) and in follow states 5, 7 and 8 (D:L509063, D:L509073).

**Who sets `+0x7c` and `+0x7d`.** The decision function `FUN_005fb1c0` clears both bytes each time it runs
(D:L508576-508577). It then sets `+0x7d` = 1 in route-following state 3 (D:L508949), and `+0x7c` = 1 in states 4, 5,
7 and 8 (D:L509034, D:L509056, D:L509071). In state 5, `+0x7c` is 0 when a contact is held (D:L509060). Whether
`FUN_005fb1c0` runs every frame was not read.

**Where s13 went wrong.** s13 read only the inner branch: "need not move" (`FUN_005fd150` false) plus
`FUN_005fdad0` true, which it called "standing in position". It missed the `+0x7c` test at D:L508410:
- in the standing states 4, 5, 7 and 8, `+0x7c` is 1, so the tick takes the outer branch (D:L508459-508482), which
  never assigns `uVar10`. **The bit is written 0 while standing.**
- the "need not move" branch belongs to state 3, route following. **There the bit is written 1 on ticks when the
  follower momentarily need not move, and 0 on ticks when it steers along the route.**

### 14.3 The per-phase table

**2026-11-12 -- CORRECTED IN the s14 banner, s15.3:** the steering rows online; a0.

| phase | value the code predicts (r0001 reading) | the line(s) that set it | the trace (r0004, n = 1) | verdict |
|---|---|---|---|---|
| idle (not following) | 1 | AI reset D:L434856; leaving follow D:L510089, D:L510099 | set 90/90 | MATCH |
| entering follow | 0 | `FUN_005fdf80` D:L510064, D:L510111 | cleared within about 0.2 s | MATCH |
| steering behind a walking leader (state 3, `+0x7d` = 1) | 0 on ticks that steer (D:L508454); 1 on ticks where the follower need not move and the facing flag holds (D:L508443-508451); also 1 from a record maturing (D:L420662, D:L420688, D:L420745) until the next follow tick | D:L508484 with `uVar10` | set 55/179 | MATCH in kind (intermittent); **GAP in rate**: about a quarter cannot be derived from the reading |
| catching up (state 3, far from the leader) | mostly 0: beyond `fVar7` x 1.25 with `+0x6c` mask 4 clear, `FUN_005fd150` is true (D:L509617, D:L509653), so the follower steers; 1 only on near or matured-record ticks | as above | set 22/154 | MATCH in kind; GAP in rate |
| standing in position (states 4, 5, 7, 8) | 0: `+0x7c` = 1 (D:L509034, D:L509056, D:L509071), outer branch, `uVar10` stays 0 (D:L508408, D:L508484) | D:L508484 | clear 242/242 | MATCH |
| planning (states 0, 2; not a traced phase) | 0: `+0x7c` = `+0x7d` = 0, branch D:L508412 | D:L508484 | not separated in the trace | -- |

**Where the reading cannot produce the trace:**
- **The rates.** Which steering ticks see `FUN_005fd150` false depends on `FUN_005fd460`'s slot and on
  `FUN_005fe1f0`, which were not read. How often a record matures behind a walking leader is unmeasured.
- **Whether the open frames run the correction.** The trace did not reach this (s14 header).
- **The trace's a0.** At the r0001 call `FUN_00567900(param_1, param_2)` (D:L508454), a0 is `param_1` and a1 is the
  controller `param_2` (D:L508409). The trace's "a0 is the leader's controller" may be this argument order. That is
  not verified.
  **Corrected 2026-11-12 (s15.3):** this is not argument order. The jal's delay slot sets a0 from s1, the
  follower's controller. A breakpoint on the jal reads the a0 left by the leader-controller test at r0001 0x5fafe8.

### 14.3b Which machine: an OPEN READING (the 1-branch needs the leader to be a controller whose slot +0x2c answers 1)

**2026-11-12 -- SUPERSEDED BY the s14 banner, s15:** the network-flag condition; the bit clear at the landing.

> **Superseded 2026-11-12 (s14 banner; s15).** This section's conclusion lost its basis with the network-flag
> condition. The leader-controller lead (`FUN_005fae70` D:L508418-508427) is now only about the frames where the bit
> IS set on the upper floor (s15.1). It is not the cause at the landing, where the bit is clear throughout.

This lead was relayed from another author's reading. This author verified it at the source. **It is an open
reading, not the mechanism.** It is settled by a trace of the same follow on a second console, which the fault owner
has requested. No change to `hostageFollow.ts` is drafted or proposed on it.

**What is read:**
- The test in front of the only 1-write (D:L508418-508427) asks the LEADER's controller (goal `+0x58`, then `+0xc0`)
  through vtable slot `+0x2c`.
- When that answers 0, `cVar3` keeps its default 1 (D:L508417). The tick then always takes the route follower
  (D:L508454), and `uVar10` stays 0.
- Slot `+0x2c` by class, machine code disassembled with `review2/mips.py` (standard library):
  - base class (vtable 0x6694b0) and the "type3" class: 0x5431f0, returns 1;
  - AI class (0x6693f0): 0x575c30, returns 0 (as research 334 s9 also reads);
  - "type4" class (0x4062d0): 0x2b3bd0, returns 0;
  - the 0x260 class (0x669590): 0x5e6250, returns 0.

**What is inference:**
- Research 334 s1 reads this kind of branch as requiring a host-local human controller. That the base class is
  the console's own player, and the 0-returning classes are AI and remote players, is that note's reading. It was
  not re-derived here.
- Who simulates a following hostage in the original's multiplayer (the host? the leader's console?) was not read.

| phase | the leader's own console (the leader's controller answers 1) | another client's console, or a host with no local leader (answers 0, inference) | the trace (taken on the leader's console) |
|---|---|---|---|
| idle | 1 | 1 (the writers do not depend on +0x2c) | set 90/90 |
| entering follow | 0 | 0 | cleared |
| steering | 0 or 1 per tick (the "need not move" ticks; s14.2) | **0 on every follow tick**; 1 only from a record maturing until the next follow tick | set 55/179 |
| catching up | mostly 0 | 0, as above | set 22/154 |
| standing | 0 | 0 | clear 242/242 |

So: (i) the trace's steering and catching-up values are those of the leader's console only. (ii) On a machine where
the leader is not the local human, which is our match server's situation (a dedicated room, research 334 s1), the
reading predicts the correction **closed in every route-steering frame**, apart from the frames after a record
matures. (iii) The "55 of 179" is consistent with this 1-branch firing intermittently on the leader's console. Which
term flips from tick to tick (`FUN_005fd150`'s distance test against `fVar7` x 1.25 while the leader walks away and
the follower catches up, or `FUN_005fdad0`'s flag) was not read.

**The measurement that would settle it:** the same byte, C+0x171 mask 0x80 for the following hostage, read on a
NON-leader client's console and on the host, across the same follow.

**Corrections list (to be fixed with the next change to that file, not fixed by this note):**
`packages/match/src/hostageFollow.ts:50` cites `FUN_005fdf80` D:L510065-510069.
The clearing call that precedes those lines is at D:L510064.

### 14.4 The port run with the bit as the trace has it (`pinrun.mts trace` and `mech`)

**2026-11-12 -- CORRECTED IN the s14 banner:** `mech` contradicts state 5.

**Variant `trace`.** The correction runs or is skipped per tick, as the trace's phases have it:
- before follow starts: on;
- the first 0.2 s (6 ticks) after it starts: off;
- follow state 4 or 7: off;
- otherwise on with probability 55/179 while the leader moves faster than 5 u/s, and 22/154 while the leader is
  stopped. The pinned follower behind a stopped leader is in this "catching up" phase.

One draw per tick, from a fixed-seed LCG.

**Variant `mech`.** The correction is on only while a matured record holds the follower in recovery, or while it
moves to a direct target; off otherwise. This is the one mechanism of s14.2 that the port can express. The port has
no analogue of the "need not move" tick.

**The case** is that of s12: leader cells
`[[0,218,82],[0,218,78],[0,218,76],[0,218,74],[0,218,72],[0,218,71],[1,13,7],[1,13,6],[1,11,6],[1,8,6]]`, follower
starting at `[0,218,85]`, 20 s.

**Outputs:** `pinrun.trace.out.txt` (seed 12345), `pinrun.trace.seed1..6.out.txt` and `pinrun.mech.out.txt`. The
diagnostic line now prints the counts: correction calls skipped and run, the final follow state and the gap to the
leader.

| variant | correction calls run / skipped | leaves the pin? | way | reaches the leader? |
|---|---|---|---|---|
| `trace`, seed 12345 | 37 / 172 | **yes**. Briefly held at t ≈ 6 (2144.6, 221.1, 661.3) with a type-2 record on (218,70); on tophost #1 (13,6) by t ≈ 8 (2140.8, 222.0, 643.5) | straight up column 218 across the seam, no link | yes: follow state 7 on #1 (12,6) at t ≈ 10, 34.9 from the leader (its formation spot) |
| `trace`, seeds 1-6 | 31-40 / 154-168 | **yes, all six**. First sample on tophost #1 (13,7) at t = 6.0-6.5 (z 650.4-656.4) | column 218, no link | yes, all six: state 7 on #1 (12,6), 34.9 from the leader |
| `mech` | 0 / 194 | **yes**, on #1 (13,7) at t ≈ 6.0 (2144.6, 222.0, 656.3) | column 218, no link | yes: state 7 on #1 (12,6) at t ≈ 10, 34.9 |
| (s12) `base`, the port as it is: correction on every move | every move | no: held at (2141.5-2144.6, 220.8, 661.8) to t = 20 | -- | no |

**The answer for this harness.** With the correction gated as the trace has it, the port's follower leaves the pin
at the landing. It goes straight up the east column (218) onto tophost (13,7) and does not use the link. It then
reaches the leader in follow state 7, in all seven runs.

The reason is plain from the counts. A pin needs the correction every tick: the body moves about 1.2 u a tick, and
the seam is 5 units from the held z. An open gate in only about a quarter of ticks cannot hold it. This is a port run
under node, not the original, and the stochastic gate is a model of the trace's rate, not its mechanism.

### 14.5 What is now known and unknown about LATER 933

**2026-11-12 -- SUPERSEDED BY s15.7:** the LATER row text.

- **Known (trace, n = 1, r0004):** the bit's values by phase, as in the table above.
- **Known (port run):** the port pins because it applies the correction on every move. With the bit gated at the
  trace's rates, the pin does not form.
- **Reading, matching the trace in kind:** the bit is cleared while standing (the `+0x7c` branch) and set only on
  "need not move" ticks, or after a record matures, while route following.
- **Unknown:**
  - which machine simulates the hostage in the original's multiplayer, and the bit there (s14.3b);
  - the rate mechanism (`FUN_005fd460`, `FUN_005fe1f0`);
  - whether the correction runs in the open frames;
  - whether r0004's follow-tick code equals r0001's;
  - the stair-by-stair trace of position and bit, which is running on the rig.

**Text for the LATER 933 row, SUPERSEDED 2026-11-12 by s15.7** (it repeats the withdrawn mechanism) (replaces the
withdrawn one in s13.7; for the controller to carry, not written to LATER.md):
> research 404 s14: the r0004 trace (n = 1) shows the original's AI-map correction enable bit (`+0x171` bit 7) for a
> following hostage set while idle, cleared on entering follow, set in about a quarter of steering frames and in
> 22/154 catching-up frames, and clear while standing in position. The port applies the correction on every move
> (`hostageFollow.ts:593-597`). On a machine where the leader is not the local human (as in a dedicated room), the
> reading (s14.3b, partly inference) predicts the bit clear in every route-steering frame. A port run with the bit gated at the trace's phase rates leaves the Fish Hook landing
> pin up column 218 and reaches the leader (s14.4). Mechanism as read (r0001, `FUN_005fae70` D:L508408-508484):
> written 0 while standing (`+0x7c` set) and on steering ticks; 1 on "need not move" ticks in state 3, and after a
> record matures. The rate is unexplained, and the fix is not yet specified. Keep the RED in
> `hostageTraversal.test.ts`. Await the rig's stair trace before proposing a gate.

### 14.6 One more datum, and two candidate mappings onto our dedicated room, written before the two-console trace

**2026-11-12 -- CORRECTED IN s15:** candidate B dropped.

> **Corrected 2026-11-12 by the two-console trace (s15), and the ruling given with it.** Candidate B ("the room is a
> console with no local human controller") is DROPPED. It is refuted by this line of the trace: "On the other console:
> bit 7 never set (0 of ~800 frames; its copies read 0x08 even idle). Positions agree frame for frame at the median
> (0.00), p90 7.5 units, max 31.4: a lagging copy of the leader console's simulation." No console other than the
> leader's simulates the follower, so B has no original counterpart. **Our room stands where the leader's console
> stands (the follower's authority), measured once.** That rests on where the trace shows the simulation lives, not on
> the bit's mechanism, whose reading is now in question (s14 banner). The candidates below are kept as written.

**The datum** is a trace of the original: r0004, one run (the Shadow PC's option A), relayed by the main controller
through the Forge seat. This author has not seen the record; it is cited as that one run.
- On the **host's** console, which was not the leader's, all three hostages' copies read `+0x171` = 0x08: bit 7 clear,
  even while idle.
- On the **leader's** console the idle hostages read 0x88, and the follower "lives" on the leader's console.

So the bit differs by console, which fits the open reading of s14.3b.

**What the code as read says about the two idle values (an open reading, not a conclusion):**
- The base initialiser `FUN_00598280` (D:L454670-454834) clears `+0x171` bit 7 (D:L454749), clears bit 1
  (D:L454767, D:L454783), sets bit 3 (D:L454782) and clears bit 6 (D:L454827). If the byte starts at 0, the
  initialiser alone leaves it at **0x08**: the host's value.
- The AI reset `FUN_00573130` (D:L434682; its slot `+0xb4` call at D:L434856) sets bit 7, giving **0x88**: the
  leader's value.
- The two readings are therefore consistent with the reset having run on the leader's console and not on the host's.
  Why it would not run on a non-authority console is not read:
  - Is a remote copy's controller a different class? The setter differs by class (0x557ee0 for the AI controller,
    0x592030 for the base and two others, 0x2b3c70 for type-4; s13.1).
  - Or is the reset simply not called for a copy?
  Which class a remote hostage copy's controller is was not read.

**Two candidate mappings of the original's consoles onto our dedicated room.** Our room has no host-local human, but
it is the hostage's authority, as the leader's console is in the original.

**Candidate A, "the room is the authority's console":** the room stands where the leader's console stands, the
console that owns and simulates the follower. The bit in the room then follows the leader's-console values: set when
idle; cleared on entering follow; set on some steering ticks (the "need not move" ticks, and after a record matures);
clear while standing.
- **Confirms A:** on the leader's console, the follower's bit and position per frame show the s14.3 pattern again,
  with bit-7 frames during steering; and the frames where the bit is set coincide with the follower pausing or
  standing off on the "need not move" condition (`FUN_005fd150` false, D:L508428-508449). On the host's console the
  copy's bit stays 0x08 throughout, and its position is a copy of the leader-console body's.
- **Refutes A:** on the leader's console the bit never sets during steering; or the set frames do not coincide with
  any "need not move" condition. Either would mean the gate-open frames come from something this reading does not
  have.

**Candidate B, "the room is a console with no local human controller":** the room stands where a console that is
not the leader's stands. No controller there answers 1 at slot `+0x2c` (s14.3b), so the 1-branch at
D:L508443-508451 cannot fire. The bit in the room then stays clear in every route-steering frame, apart from the
frames after a record matures.
- **Confirms B:** on a non-leader console that runs the follower's AI itself (if the trace shows any console other
  than the leader's simulating the follower), the bit is 0 in every steering frame except shortly after an obstacle
  record matures.
- **Refutes B:** that console shows bit-7 frames during steering that no maturing record explains.

If the trace shows that only the leader's console ever simulates a follower, B has no original counterpart to
measure. It is then a design choice for the room, not a reading.

**A third mapping is possible:** the original may simulate a following hostage on whichever console owns the
**leader** (that is what "lives on the leader's console" suggests), so the authority moves with the leader. Our room
is a single fixed authority. The room would then stand where the leader's console stands for whichever player
leads, which is A with the leader's controller modelled as a local human. Or it could stand nowhere exact, because
the original has no dedicated authority at all. Either way, the trace has to show, per console, which one advances
the follower's position: the console whose position changes first, and the other copy following it.

**What each candidate means for our port's RED (the MP71 pin), without proposing a change:**
- **Under A,** the follower's correction runs only in the leader-console pattern. The node run with the trace's rates
  (s14.4) left the pin in all seven runs, so under A the RED should go green once the room's gate matches that
  pattern.
- **Under B,** the correction is closed in every route-steering frame. The `mech` run, open only after a record
  matures (s14.4), also left the pin. Under B the RED should also go green.
- **Under the third mapping,** the outcome depends on the leader-controller model, and is the same as A for one
  human leader.

So in the port runs both candidates leave the pin. They differ in what the follower does on the correction's other
uses (walls beside the route, s4), which this note did not test.

**No mechanism is asserted and no change to `hostageFollow.ts` is drafted until the two-console trace is in.**

## 15. The two-console trace, the rig's handle, and a0 at the follow call [trace (r0004, n = 1, relayed); machine code, read by this author, pending review]

Date 2026-11-12. **The level of each part.** s15.1 and s15.2 are a trace of the original running: build r0004, MP71,
one crossing, one hostage, reads only. They are relayed word for word from the fault's owner; this author has not
seen the record, and it is cited as that one run. s15.3 is this author's reading of the machine code of both builds,
pending review; the reviewer is reading the same question in parallel. **Nothing in s15-s18 is explained by the bit.**
Where an explanation would need the bit, the sentence says so and stops.

**Marks on every claim about r0004, here and in the s14 banner** (the reviewer's marks, kept through s14-s18):
- **[V4]**: read in the bytes of the r0004 served ELF, by this author unless it says "the reviewer's";
- **[I1]**: inferred from r0001, not checked in r0004;
- **[RIG]**: the rig's measurement, relayed.

### 15.1 The trace, as relayed

> - On the leader's console (the follower's simulation lives there):
>   * the leader ran up; the follower first STOPPED AT THE FOOT (2150.9, 179, 794.5) and stood 30 s, bit 7 clear,
>     while the leader stood at the top (y 222, z 631.9). It climbed only when the leader walked back along the upper
>     floor.
>   * it went up the flight in COLUMN 217 (x ~2134.5, z 689.8 -> 665.5, y 201.7 -> 218.2), then turned north-east and
>     crossed z 661.8 -> 651.8 between x 2137.0 and 2144.7 (y 220.8 -> 222.0), moving every frame (0.4-0.5 units),
>     with NO stop at the seam, to (2150.2, 222, 645.5).
>   * bit 7: CLEAR in every sample of every frame from z 690 to z 641 (0 of ~1,000 samples); the global 0 throughout.
>     So the original's follower passes the landing with the correction's gate SHUT.
>   * back-steps: none over the seam; one 0.1-unit sideways nudge at z 665.5 and two on the upper floor, all in CLEAR
>     frames. In the steering frames where the bit WAS set (2 + 8 frames, all on the upper floor at z 643-650 after
>     the crossing; 15 in the following stop) no back-step.
> - On the other console: bit 7 never set (0 of ~800 frames; its copies read 0x08 even idle). Positions agree frame
>   for frame at the median (0.00), p90 7.5 units, max 31.4: a lagging copy of the leader console's simulation.
> - What it settles (n = 1): at THIS landing the original does not correct the follower and the follower does not
>   need it; and its PATH is not the port's -- it climbs column 217 (the link column) and crosses diagonally, where
>   the port's follower heads north on column 218 at the next trail point and is pushed back at z 661.8.
> - What it does not settle: why the bit is set in some steering frames off the stairs; whether the port's fault is
>   the correction running there, the route (no link inserted between the trail points), or both. The node what-if
>   showed "correction off" frees the pin; it did not show the follower then taking the original's path.
> - Observed and new: the original's follower WAITED AT THE FOOT of the stairs for 30 s while the leader stood at the
>   top. The original has its own hold on this staircase -- at the foot, not on the landing. A fix must not "improve"
>   that away: the port's follower should stop where the original's stops.

**Where these positions sit on the grid** (this author, from s2's grid): the first stop (2150.9, 179, 794.5) is
sub-map 0 cell (219,84), on the ground floor 10 cells south of the flight's first stair (z ~690). It lies 26 units
east of `hostage2Start` (216,84) (s3b). The leader's stand (y 222, z 631.9) is tophost row 5. Tophost (13,5) has its
centre at z 631.81. The follower's climb x ~2134.5 is column 217's centre (2134.58). The crossing ends on tophost
(14,5). The 3-D distance from the first stop to a leader on tophost (13,5) is about 168 units.

### 15.2 Which object's byte the traces watched: the following hostage's controller (the rig's answer, measured)

Relayed from the rig's records:
- The watched controller C was taken from the BODY, never from a register. Bodies were found by their shared first
  word (0x668b20). C = [E+0xc0], and [C+4] == E was checked on every body (trace A: E 0x1a94340 / C 0x1a8dd60;
  trace B: E 0x1928d50 / C 0x18ca260).
- E was identified by position over time: three hostages at their research-175 starts, one walking behind the
  leader, and the HUD naming "Hostage3".

**So both traces' bit values are the following hostage's controller's, and they stand.** The wrong a1 recipe of
s13.7 stays corrected there, but it did not spoil a measurement.

**Who reads the bit: one more reader, added 2026-11-12 (research 418 s22).** The type-4 body of `FUN_00567900`'s marker dispatch
reads the bit. The decompilation's text omits that body. It reads the bit when it enters movement state 7, the climb's
entry. The reads:
- r1 0x567e30 `lbu v0,369(s4)` (0x92820171), on the walker's own controller s4. That is the follower's controller C
  when the follow tick runs the walker (s15.3).
- r1 0x567e34-0x567e38 take bit 7.
- When the bit is set, r1 0x567e44-0x567e48 OR 0x80000 into the flags in s3.
- r1 0x567ec8 `sw s3,1096(s4)` stores those flags at C+0x448.
- r1 0x567ed4 `jal 0x56cbf0` (0x0c15b2fc) is `FUN_0056cbf0`(C, 7), with a1 = 7 set at r1 0x567ebc.

[V1, this author, t22]. So the bit is read beside s13.1's writers and s13.2's save and restore around state 7. It is
read here only on a route point whose cell is a type-4 marker. MP71 has no such marker (s21.5). r0004's twin of this
body is pending the narrow table. **Filled 2026-11-12 (research 417 s20.8):** the type-4 body r0001 0x567ce8-0x567ee0 is r4
0x56d028-0x56d220, relocations only (10).

### 15.3 a0 at the follow call: the rig's reading and the third reading both hold

**The rig's reading (measured, one run) [RIG]:**
- at r4 0x006028c4, a0 = 0x1a81450 in 40 of 40 hits, and [a0+4] = 0x1a88860, which is our player's body
  (= *(0x435618)), whose +0xc0 is 0x1a81450: so a0 is the PLAYER's controller;
- the first hit's s1 = 0x1a8dd60, the follower's C;
- the address is right: 17 of 17 words match at exactly one r4 address. The jal lands on the unique image of
  `FUN_00567900` (r4 0x56cc40), and the live word is 0x0c15b310 on both consoles. The reviewer's pattern search agrees
  [V4, the reviewer's: `pat.out.txt`]: with the jal targets masked, the 17-word windows at r0001 0x5fb0e4 match once,
  at r4 0x6028c4.

In what follows, every r0004 address, instruction and slot body is [V4] (this author's disassembly with
`review2/mips.py`), except the single caller r4 0x573ff4, which is [V4, the reviewer's xref].

**The third reading** (s14 banner) says a0 at that call is the tick's own `this`, the follower's AI controller. As
worded, the two contradict each other.

**This author's machine-code reading** (r0001 by `review2/mips.py` and the reviewer's `fae70.dis.txt`; r0004 by
`r4.followtick.dis.txt` and this author's own disassembly of the routines named; scratch outside git):

1. **`this` is s1, and nothing else writes s1.** The tick's first argument is copied into s1 at entry: r0001 0x5fae90
   and r4 0x602670, `daddu s1,a0,zero`. No later instruction of the tick writes s1. (In the decompilation this
   argument is `param_2`; `param_1` is the float in f12.) The tick has one caller in each build: r0001 0x56eca4
   inside the AI tick `FUN_0056de10`, and r4 0x573ff4. At r0001 0x56eca0 the caller passes its own s0, the AI
   controller it is ticking, so the follow tick runs from the follower's own AI tick.
2. **The call takes a0 in its delay slot.** r0001 0x5fb0e4 is `jal 0x567900` and 0x5fb0e8 is `daddu a0,s1,zero`;
   r4 0x6028c4 is `jal 0x56cc40` and 0x6028c8 is `daddu a0,s1,zero`. Once the slot runs, a0 = this = the
   follower's controller: the third reading.
3. **A breakpoint on the jal fires before its delay slot runs.** So the a0 the rig read is the value left by the
   instructions before the jal. On the paths that reach the jal (r0001 0x5fb0d8, r4 0x6028b8), that value is:
   - **after the leader test exits early.** r0001 0x5fafe8 / r4 0x6027c8 is `lw a0,0xc0(s4)`, where s4 is the
     goal's `+0x58` leader body (0x5fafd8) and a0 is the leader's controller. Then comes the slot-`+0x2c` call
     (0x5faff4-0x5faffc). Three branches then go straight to the route-follower call with a0 still holding the
     leader's controller:
     - (E1) the slot answered 0 (r0001 0x5fb014, r4 0x6027f4);
     - (E2) the network flag is non-zero (r0001 `jal 0x5750a0` at 0x5fb01c, then `bne` at 0x5fb024; r4 0x6027fc,
       0x602804);
     - (E3) `DAT_0066b038` is non-zero (r0001 0x5fb02c-0x5fb034; r4 0x66a9b8 at 0x60280c-0x602814).

     None of the routines in between writes a0. Every slot-`+0x2c` body is a two-instruction leaf: r4 0x547c40
     `jr ra; addiu v0,zero,1` (vtables 0x668e30 and 0x669370); 0x57b010 `jr ra; daddu v0,zero,zero` (vtable
     0x668d70, the AI class, whose `+0xb4` is r4 0x55d200, the AI setter's twin, s14.1); 0x5eda20 and 0x2b55e0
     both return 0 (vtables 0x668f10 and 0x432b60). The flag getter is the leaf `lui at,0x46; jr ra; lbu
     v0,-0x5f3f(at)` (r0001 0x5750a0) / `lbu v0,-0x2b7f(at)` (r4 0x57a470).
   - **after the `+0xc8` test:** a0 is the leader's BODY, from the delay slot `daddu a0,s4,zero` of `jal 0x5e0010`
     (r0001 0x5fb050-0x5fb054; r4 0x602830-0x602834). This path is excluded: the rig read [a0+4] = the player's
     body, so a0 was a controller, not a body.
   - **after `FUN_005fd150`:** a0 = (result == 0). The call's result is turned into a mask at r0001 0x5fb098 `xori
     a0,v0,0x1` and 0x5fb0a0 `andi a0,a0,0xff` (r4 0x602878, 0x602880) [V4]. That is the last write of a0 before
     the jal on this path. A tick reaches the jal from here only when the result is non-zero, so a0 = 0 there.
     Excluded.
   - **with no leader** (s4 = 0, `beq s4,zero` at r0001 0x5fafe0 / r4 0x6027c0): the last write is the goal's
     type byte, `lbu a0,0x30(v0)` at r4 0x602688, so a0 = 9. Excluded.
   - **with a leader whose controller pointer is null** (`beq a0,zero` at r4 0x6027cc): a0 = 0. Excluded.

**The rig's observation and both readings are all correct.** The earlier line "a0 is the leader's controller at the
follow call" was a register read one instruction too early, a property of where the breakpoint sat. At the hit, a0
still holds what r4 0x6027c8 loaded (the leader's controller). From the delay slot on, a0 = s1 = `this` = the
follower's controller, which is the third reading. The first hit's s1 measures `this` directly. This author verified
each instruction cited in this paragraph and the paths above in both ELFs: `review2/mips.py` over r0001, and r4
0x602670, 0x602678-0x6026ac, 0x6027b0-0x6027cc, 0x602870-0x602884 and 0x6028b8-0x6028cc.

**One line for the truth table: what a0 at the hit shows about the PATH.** a0 = the leader's controller at the hit
(40 of 40) is evidence of which path the 40 hits took. They reached the `+0x2c` load on the leader's controller
(r4 0x6027c8) and left by one of the three exits: E1 at 0x6027f4, E2 at 0x602804, E3 at 0x602814 [V4]. So
`FUN_005fd150` was called on none of the 40 hits. That holds for the 40 hits only. A tick on the 1-path or its
sibling (M4, M5 in s15.3a) calls `FUN_005fd150`, gets 0, and never reaches r4 0x6028c4, so the breakpoint cannot
see it. Every other path that reaches the jal leaves a0 as something else [V4]: the leader's body (the `+0xc8` exit),
9 (no leader), or 0. **An a0 of 0 at the hit would be ambiguous**: it could be a null leader controller, or
`FUN_005fd150` returning non-zero. That is what the network-flag reading predicts, not a proof of which exit.
The read does not say WHICH of the three exits was taken, and this note does not draw that until the five reads
(s15.6) are back.

**2026-11-12, the reviewer's withdrawal, on its own line.** In `review3/recipe.md` s1, the reviewer withdrew "the
trace contradicts the code" [V4]. The review had read the call's argument (a0 after the delay slot at r4 0x6028c8
`daddu a0,s1,zero`), not the register at the hit. At the hit a0 still holds r4 0x6027c8 `lw a0,0xc0(s4)`, and s1
holds r4 0x602670 `daddu s1,a0,zero` (r0001 0x5fafe8 and 0x5fae90).

This agrees with the reviewer's account (`review3/recipe.md`), written in parallel, and with the blind second
reader's (`review4/FUN_005fae70_compare_and_r0004.txt`, Task 2). The second reader lists the same a0 values per
branch [V4, the second reader's], and also finds the tick's r0004 image word for word: 210 words, 197 identical, the
13 others relocated jals and the moved global. The reviewer counted 204 and 191 over a shorter range; the 13
differences are the same.

### 15.3a The tick's six paths (the second reader's M0-M5, checked by this author against D:L508399-508484)

**2026-11-12 -- CORRECTED IN s30:** a remote human is CRemoteCtrl r4 0x668f10, not r4 0x432b60.

Source: `review4/FUN_005fae70_second_reading.txt`, the blind second reading. This author re-read every decompilation
line below at the source. The machine-code addresses are r0001 and are the second reader's [V1, the second reader's];
this author checked 0x5fafd8-0x5fb0e8 and 0x5fb12c. The reviewer's nine-path table P0-P8 is not on disk (the second
reader looked for it too), so these are mapped by condition, not by its numbering. obj = the tick's object (s1); st =
the follow goal from `FUN_005f6010(obj)`; tgt = st `+0x58`, the leader's body.

**The gate G** (D:L508418-508427; r0001 0x5fafe0-0x5fb064). All five must hold:
- G1: tgt != 0;
- G2: tgt `+0xc0` != 0, and its slot `+0x2c` answers non-zero;
- G3: `FUN_005750a0() == 0`, that is, byte `DAT_0045a0c1` == 0;
- G4: byte `DAT_0066b038` == 0;
- G5: obj's body `+0xc8` & 0x20000 == 0, or `FUN_005e0010(tgt)` == 1.

If G holds, c = `FUN_005fd150(...)`, and goal `+0x6c` bit 2 is cleared when c != 0 and set when c == 0
(D:L508428-508440). If G fails, c keeps its default 1 (D:L508417).

| path | condition | what the tick does | setter argument |
|---|---|---|---|
| M0 | no type-9 goal (D:L508399-508404) | `FUN_0056d090(obj)` | not called by the tick (`FUN_0056cbf0` inside it calls slot `+0xb4` itself: D:L431705, D:L431737) |
| M1 | `+0x7c` != 0 (D:L508410, D:L508459-508482) | slot `+0x88`(dt, obj, flag) | 0 |
| M2 | `+0x7c` == 0, `+0x7d` == 0 (D:L508411-508412) | slot `+0x88`(dt, obj, 0) | 0 |
| M3 | `+0x7c` == 0, `+0x7d` != 0, c != 0: G fails at any clause, or G holds and `FUN_005fd150` != 0 (D:L508453-508455) | `FUN_00567900`(dt, obj); `+0x6c` &= ~2 | 0 |
| M4 | as M3 but G holds, `FUN_005fd150` == 0, and `FUN_005fdad0` != 0 (D:L508443-508450) | slot `+0x88`(dt, obj, 0) | **1, the only path** (s0 = 1 in the delay slot at 0x5fb12c) |
| M5 | as M4 but `FUN_005fdad0` == 0 (D:L508445-508446) | `FUN_00567840(obj, 0)` | 0 |

The setter is the virtual call through slot `+0xb4` at D:L508484, with the argument in s0. Its three bodies are found
only in machine code (s13.1). The AI class's body (r0001 0x557ee0; r4 0x55d200, word for word [V4, the second
reader's]) forces the argument to 0 when `+0x3f4` == 7. It stores only on change (the second reader's addition).
When `FUN_00556370` returns non-zero, the AI tick's switch value is forced to 4, so the follow tick is not run that
tick (D:L432512-432545; r4 0x573dac-0x573dd4 [V4, the second reader's]).

**Which class each body gets** (the second reader's s2.E). The factory `FUN_002b3a00` (D:L156361-156411; its r0004 image
r4 0x2b5410 [V4, the second reader's]) is called from one place, `FUN_002b28d0` (D:L155829-155837) [D, not
machine-checked].
- param_3 == 0: the AI class (0x7c0 bytes; vtable r4 0x668d70).
- param_3 != 0, with a byte `DAT_00440c30` != 0: type 3 (r4 0x669370).
- otherwise, the first such body gets the base class (r4 0x668e30), and the factory stores it in `DAT_00440c38`;
  every later one gets type 4 (r4 0x432b60).
  **Measured 2026-11-12 (s30): the other player's copy is CRemoteCtrl, r4 0x668f10, not r4 0x432b60.**

That param_3 != 0 means a human player, and that the first such body is the console's own player, is the second
reader's [INF]. It fits the slot `+0x2c` answers. The reviewer corrects its own reading here: what the factory stores
in `DAT_00440c38` is the return of `FUN_005999e0` (unread), not the controller. So **"the base class is the console's
own player" is an inference wherever s14-s18 use it.** This author has not read `FUN_002b28d0` or `FUN_005999e0`.

**The comparison's extent.** Nine against six, compared path by path: the reviewer's P0-P8 (`review3/nine-paths.md`,
written before it read review4) against the second reader's M0-M5 (`review4/`). No condition and no setter argument
differs. P0 = M0; P1-P3 = M1; P4 = M2; P5 + P6 = M3; P7 = M4, the single 1; P8 = M5. The five gate terms are the same
five, at the same instructions. The reviewer splits finer by what is called on the way: P3 calls `FUN_005fd150` in
the outer arm (r0001 0x5faf98 / r4 0x602778) and never writes goal `+0x6c`. P5 and P6 differ in what a stop at
r4 0x6028c4 sees.

The accepted limits:
- **X1:** on M0 the tick does not call the setter, but `FUN_0056cbf0` inside `FUN_0056d090` may call it with 0
  (D:L431737) [D].
- **X4:** on M4 the argument is 1, but the stored bit is undetermined: the AI body forces 0 when `+0x3f4` is 7, and
  whether slot `+0x88` or `FUN_005fdad0` can make it 7 first was not read by either.
- **D3:** an a0 of 0 at the hit is ambiguous (s15.3).
- **D4:** "`FUN_005fd150` not called" holds for the 40 hits only (s15.3). The 40 hits exclude P6 on those ticks, and
  say nothing about P3, P7 or P8.

This author checked the conditions against D:L508399-508484 and the instructions named in s15.3. The table is still
code, not measurement.

The second reader's hit-or-no-hit breakpoint at r4 0x602860 is now step 3 of the recipe (s15.6).

**The candidates the controller named, against the machine code:**
- "The tick is run from the LEADER's side, the follower held in s1": refuted. s1 is the tick's own first argument
  (point 1), and the caller passes the controller it ticks.
- "`this` at 0x5fb0e8 is a field loaded from the first argument": refuted. 0x5fb0e8 is a register copy, not a load.
- "The call site is reached from more than one caller": one caller per build (point 1). The reviewer's xref; this
  author did not re-run it.
- **"The breakpoint reads a0 before the delay slot" (this author's):** supported by points 2 and 3.

**What the vtable words would show** (r4 addresses throughout; word 0 of each controller). With the delay slot read, the
words are a confirmation of the classes, no longer the only way to settle a0:

| controller | E1 (slot `+0x2c` answered 0) | E2 or E3 (slot answered 1, then a flag) |
|---|---|---|
| the player's C (the rig's a0) | a vtable whose `+0x2c` returns 0: 0x668d70, 0x668f10 or 0x432b60 | 0x668e30 or 0x669370 (`+0x2c` returns 1; that the local player is the base class is [INF], s15.3a); then byte 0x45d481 non-zero (E2) or byte 0x66a9b8 non-zero (E3) |
| the follower's C (s1) | 0x668d70, the AI class, in both cases | as E1 |
| an idle hostage's C, leader's console | 0x668d70 if it is the same class (its idle 0x88 fits the AI reset, s14.6) | as E1 |
| an idle hostage's C, other console | open: the 0x08 / 0x88 split (s14.6) is the question this word answers | as E1 |

**A prediction with one read as its test:** if the player's C is 0x668e30 or 0x669370 and byte 0x45d481 is non-zero
on the leader's console, the route-follower call was reached through E2. That is the network-flag exit the third
reading predicts. This would be the first measured support for that reading. It is not support for any statement
about the bit (STATUS).

### 15.4 What s15 settles and what it does not (positions only)

- **Settled, n = 1:** where the follower stood (the foot, (219,84), 30 s while the leader stood on tophost row 5);
  when it climbed (only after the leader walked on the upper floor); by which column (217); and how it crossed
  (diagonally north-east, moving every frame, no stop). The bit's values as measured (s15.2).
- **Not settled:** the cause of the foot wait (s16); the cause of the choice of column 217 (s17); anything about the
  bit's mechanism.

### 15.5 What the next trace should discriminate (the reviewer's list, with the rig's open questions)

1. The network-flag byte (r4 0x45d481) on each console during a follow.
2. Whether the one 1-assignment of the tick (r0001 D:L508449 / 0x5fb12c) ever executes online.
3. At `FUN_00556370`'s three setter sites (D:L420662, D:L420688, D:L420745): the record type, the return value, and
   whether the follow tick ran in that frame.
4. a0 at the follow call, identified by its vtable word and [a0+4]. Per s15.3, read it from s1 at r4 0x6028c4, or
   from a0 at r4 0x6028cc (after the delay slot).
5. Per frame: the controller's `+0x3f4`, and the follow goal's `+0x34` (the state byte), `+0x7c`, `+0x7d` and `+0x6c`.
6. Word 0 of the player's C, of the follower's C and of an idle hostage's C, on each console (s15.3's table).

### 15.6 The rig recipe: five reads per console, before any follow (r0004; the reviewer's `review3/recipe.md` s2, checked here)

**2026-11-12 -- CORRECTED IN s30, s32:** reads 2, 4, 5 and the two pointers measured; step 3a's breakpoint run: no hit while the gate held.

**The rule for every recipe in this note, from now on.** A value read at a jal or a branch must say whether it is
set in the delay slot. When it is, the breakpoint goes on the callee's first instruction, or the read uses the
register the value is saved in.

**Build:** the r0004 served ELF, `game/r0004/served/socom2_game_served.elf` under the desktop tree (5,016,064 bytes).

**Finding the objects** (the rig's method, measured): a body E has first word r4 0x668b20. Its controller is
C = [E+0xc0]; check [C+4] == E. The player's body is E = [0x435618]. (The code also uses [C+4] as the body: r4
0x6027bc `lw s2,0x4(s1)`.) Neither 0x668b20 nor 0x435618 is verified in the ELF here: both are the rig's.

**The reads** (the reviewer's four, then a fifth):
1. **Word 0 of the follower's C** (the hostage that will follow). Expected: r4 0x668d70, the AI class.
2. **Word 0 of the player's C** (E = [0x435618]). Expected: r4 0x668e30 on the console that owns the player. [INF:
   that the base class is the console's own player rests on the factory, whose stored value is `FUN_005999e0`'s
   unread return; s15.3a.]
3. **Word 0 of an idle hostage's C.** Expected: r4 0x668d70 where that console runs its AI. No expectation can be
   derived for the other console.
4. **Byte r4 0x45d481.** Expected: 1 on both consoles in an online game. **Measured 2026-11-12: 1 on both consoles
   (s30).** It is read by r4 0x57a470 `lui at,0x46`,
   0x57a474 `jr ra`, 0x57a478 `lbu v0,-0x2b7f(at)` (0x460000 - 0x2b7f = 0x45d481), the image of r0001 `FUN_005750a0`
   (0x5750a0-0x5750a8, byte 0x45a0c1). The tick uses it at r4 0x6027fc `jal 0x57a470` and r4 0x602804
   `bne v0,zero,0x6028b8`. That the byte is the multiplayer flag rests on r0001 sources (roadmap/07-match.md T3;
   research 389 and 391; the desktop's research 18).

**How the expected vtables were found** (`review3/vt4.py`, `r4.vt.out.txt`; this author re-read the slot bodies,
s15.3). Each class is found by the one function its slot `+0xb4` holds: the data word equal to that function's
address, minus 0xb4.
- The AI class, r4 0x668d70: the AI setter (r0001 0x557ee0) is at r4 0x55d200, held at 0x668e24. Its `+0x2c` is
  0x57b010, which returns 0.
- The base classes, r4 0x668e30, 0x668f10 and 0x669370: the base setter (r0001 0x592030) is at r4 0x597860. Their
  `+0x2c` slots are 0x547c40 (returns 1), 0x5eda20 (returns 0) and 0x547c40 (returns 1).
- The type-4 class, r4 0x432b60: its `+0x2c` is r4 0x2b55e0, which returns 0.
- Which class is which kind of actor rests on r0001's factory `FUN_002b3a00` (D:L156363-156411), as the reviewer
  reads it; this author did not read it.

**What the reads decide** (the reviewer's, checked against s15.3):
- 1 = 0x668d70 and 2 = 0x668e30: the 40 hits' exit was not E1 (the 40 hits only; ticks on M4 or M5 never reach the
  hit, s15.3). With 4 = 1 it was E2, the network test. E3 (byte 0x66a9b8) is the one alternative left; read 5
  decides it.
- 2 = a vtable whose `+0x2c` returns 0 (0x668f10, 0x432b60, 0x668d70): the 40 hits' exit was E1 (the 40 hits only).
  The network flag is then not shown to matter.
- 1 not 0x668d70: the derivation of the classes, or the follower's class, is wrong. Stop and report the word.
- 3 differing between the two consoles: the idle 0x08 against 0x88 is a class difference. Equal words mean the same
  class with the reset not run on one console.
- 4 = 0 on a console: the third reading's network clause is refuted for that console.

**The fifth read** (redotcom-19's; the reviewer's `review3/recipe.md` s2.5). By the reviewer's scan
[V4, the reviewer's], r4 0x66a9b8 has three loads (r4 0x568624, 0x602724, 0x602810) and no store by direct
addressing in either build, and it lies in zero-initialised memory. A write through a computed pointer is not excluded:

5. **Byte r4 0x66a9b8, on each console.** Expected: 0. It is the image of r0001 `DAT_0066b038` [V4, this author: r4
   0x60280c `lui at,0x67`, 0x602810 `lbu v0,-0x5648(at)` (0x670000 - 0x5648 = 0x66a9b8), 0x602814
   `bne v0,zero,0x6028b8`, the E3 exit]. It is a different byte from the 0x66a980 global that the first trace read.
   That one is the image of the correction's `DAT_0066b000`, at the same 0x680 offset [I1].

**Step 3 of the recipe: a hit-or-no-hit breakpoint** (the second reader's, accepted by redotcom-19; the reviewer is
writing its text into `review3/recipe.md`). Set it at r4 0x602860, `jal 0x604950`, the call to `FUN_005fd150`'s
image [V4, the second reader's; r4 0x602860 is the image of r0001 0x5fb080 `jal 0x5fd150`, this author]. Arm it
during a short follow. Read no register there. Disarm it at the first hit, noting the frame, and never leave it to
pause repeatedly. If it never hits during a follow, G never held on any tick of that follow, so M4, the only 1-path,
did not run there.

The full text is the reviewer's `review3/recipe.md`, "STEP 3"; this note takes it as written there. Its points,
checked here where marked:
- **Confirm the live word first:** r4 0x602860 holds `jal 0x604950` = 0x0c181254 [V4, this author: the
  instruction]. Its delay slot, r4 0x602864 `xori a2,v0,0x1`, makes the fourth argument, so a2 is stale at the stop.
  Nothing is read there.
- **Every jal to r4 0x604950** [V4, the reviewer's xref]:
  - r4 0x602860, the route arm (P6, P7, P8): this breakpoint;
  - r4 0x602778, the outer arm (P3; behind the same network test and byte): not covered;
  - r4 0x604c3c, inside the image of `FUN_005fd3e0` (D:L509662-509681), called from the AI tick for other goal types:
    not covered. A hit there says nothing about the follow tick.
- **One hit:** on that tick all five gate terms held on that console. The network-flag clause is then refuted for
  that console, and the path to the 1 is open on any tick where the call returns 0.
- **No hit during a follow in which the bit was seen set:** the set frames did not come from the tick writing 1.
- **What no hit does not prove:** that the arm is closed for good (it covers that follow only); which term closed it
  (reads 2, 4 and 5 say that); anything about r4 0x602778 or 0x604c3c; that the tick ran at all (the 40 hits at r4 0x6028c4
  in the same follow are needed for that); that RAM holds this instruction (hence the live-word check).

**Step 3a: a second hit-or-no-hit breakpoint, at r4 0x602f4c** (added 2026-11-12; redotcom-19's, written in the
form of step 3). It asks whether the online step of research 417 s20 runs during the wait at the foot.
- **Confirm the live word first.** r4 0x602f4c holds 0x0c165374, `jal 0x594dd0` [V4, this author, t22]. Its delay
  slot, r4 0x602f50, holds 0x24070001, `addiu a3,zero,1`. So a3 is stale at the stop. **Nothing is read there.**
- **It is the only call to r4 0x594dd0.** There is no other jal, no j, and no data word equal to the address in the
  file [V4, t22 `xref.594dd0.txt`].
- **What reaching it needs.** The fallback arm must have run: r4 0x602e48 `bne s6,zero,0x602f58` (0x16c00043) not
  taken, so `+0x78` = 0 (step 4.7). The network flag must also be non-zero: r4 0x602f34 `jal 0x57a470` (0x0c15e91c),
  then r4 0x602f3c `beq v0,zero,0x602f58` (0x10400006) not taken [V4].
- **The handling.** Arm it during the wait at the foot (s15.1), on the leader's console. Disarm it at the first hit
  and note the frame. Never leave it to pause repeatedly.
- **One hit:** on that tick, on that console, the trail gave no usable cell, the fallback arm ran online, and r4
  0x594dd0 was handed `+0x104`. The hit does not show whether the cell was rewritten. Read `+0x104` and `+0xf8` at the
  next pause (step 4), and compare `+0x104` with the cell under `+0xf8` (s2's grid). A difference is r4 0x594dd0's
  rewrite. With a hit, s16-s19's r0001 reading of the target on that arm does not carry to the traced follow, and
  departure 4 (STATUS) bears on it.
- **No hit through the wait:** on that console the fallback arm did not run online on any tick of the wait. The
  target came from the trail (r4 0x604f90, `FUN_005fd790`'s twin, research 417 s20.8), and r4 0x594dd0 does not bear on the wait.
  Departure 4 then stays a departure by reading for the cases where the trail has no entry at the slot's depth.
- **What no hit does not prove:**
  - that the arm never runs elsewhere: in other follows, on other maps, or at a follow's start before the trail has
    three entries;
  - that the goal update ran at all. `+0x34` changing, or the hits at r4 0x6028c4, show that;
  - that RAM holds this instruction. That is why the live word is checked first;
  - which of the two conditions closed it. `+0x78` (step 4.7) and read 4 (the flag) say that.

**Two pointers, optional, one word each per console** (the reviewer's; not verified by this author):
- r4 0x44d648, the image of r0001 `DAT_00440c38`. The controller factory stores there, for a type-0 controller
  only, the return of `FUN_005999e0`, which is unread. Whether that is a body or a controller is not read. The rig can
  tell from word 0: 0x668b20 for a body [RIG], 0x668e30 for a base-class controller.
- r4 0x435618: one store, by a one-instruction setter at 0x1f1870, whose callers are unread. That it holds the
  player's body is [RIG] only.

Whether the two hold the same pointer is not determined from the code.

**The reviewer's erratum to its s1** (folded in s15.3): a0 = 0 at the hit is ambiguous (D3), and "`FUN_005fd150`
not called" holds for the 40 hits only (D4).

**Step 4: the follow goal's handle, and the fields to sample** (memory reads only; the reviewer's `review3/recipe.md`
STEP 4, taken as written there; the points below are the ones this note uses). Inside the decision function, r0001 =
r4 - 0x77e0 up to r4 0x602f30, and r4 - 0x7800 from r4 0x602f54 on, because of the 8-word insertion (STATUS)
[V4, checked here].
- **From the follower's controller C to the goal G:**
  - r4 0x5fd7f0 `lw v0,0x41c(a0)` (r0001 `FUN_005f6010`, D:L505723-505738).
  - If WORD [C+0x41c] is 0, G is the static fallback r4 0x66b3c0 (type 0: no goal).
  - Otherwise G = [[C+0x424]+8] (r4 0x5fd818-0x5fd81c) [V4, the reviewer's].
- **Confirm it is the follow goal:**
  - G != r4 0x66b3c0;
  - BYTE [G+0x30] == 9 (r4 0x602688-0x602690 [V4]);
  - WORD [G+0] == r4 0x669320, the r0004 type-9 goal vtable [V4, the reviewer's; its factory store is not checked];
  - WORD [G+0x58] is the leader's body.
- **The fields:**
  - `[G+0x34]` is a WORD, the follow state; the code uses its low byte (written at r4 0x603ba0-0x603bc0);
  - `[G+0x7c]` and `[G+0x7d]` are BYTES, zeroed at the update's entry and set later in the same run;
  - `[G+0x104]` is a WORD cell;
  - the target position is three floats at G+0xf8, G+0xfc, G+0x100;
  - `[C+0x3f4]` is a BYTE on the controller: 6 is the state in which the AI tick runs the follow tick.
  - **`[G+0x76]`, a BYTE, the start gate** (r0001 D:L508645-508660). **ACCEPTED 2026-11-12 by redotcom-19.** Its r0004
    instruction is to come from the three-way comparison.
- **The cell encoding** (one word, not a pointer): bits 0-5 are the sub-map (w & 0x3f; r4 0x603518-0x603520
  `lbu`, `andi 0x3f` [V4]; D:L508898). Bits 6-18 are x, the column ((w >> 6) & 0x1fff; D:L508844-508849). Bits 19-31
  are z, the row (w >> 19; D:L508855-508856). That x is the column and z the row is this note's convention (s2), not a
  line of code.
- **A sample is a snapshot.** Read with the game paused between frames. Within one run of the decision function,
  `+0x7c`/`+0x7d` are zeroed and then set, `+0x104` can be written two or three times, and `+0x34` is written once, at
  the end. How often the decision function runs is not read.
- **Two reads this note offers** (not among redotcom-19's): the goal's `+0x78` (which target arm ran, s19 K4), and
  the controller's `+0x4ec` (the route's state byte, s19).
  **ACCEPTED 2026-11-12 by redotcom-19, as step 4.7 below.**

**Step 4.7: the target arm and the route state, at the same snapshots** (the reviewer's `review3/recipe.md` 4.7, taken
as written there; memory reads only). Inside the goal update, r0001 = r4 - 0x77e0 before the insertion and r4 - 0x7800
after it.
1. **BYTE [G+0x78]: which target arm the last goal update took** (D:L508693-508698). The only code in the goal update
   that touches it [V4, the reviewer's; r4 0x602e44 and 0x602e48 also this author's, t22]:
   - r4 0x602e00 `lbu a0,0x78(s4)` (r0001 0x5fb620), the read;
   - r4 0x602e24 `sb v0,0x78(s4)`, with v0 = 1 (r0001 0x5fb644);
   - r4 0x602e44 `sb zero,0x78(s4)`, word 0xa2800078 (r0001 0x5fb664);
   - r4 0x602e48 `bne s6,zero,0x602f58`, word 0x16c00043 (r0001 0x5fb668). The same s6 then skips the fallback arm.

   After this code the byte equals s6. s6 is 1 only when `FUN_005fd790` returned non-zero and `FUN_0052d480` returned
   non-zero for `+0x104` (D:L508689-508691); its preset is 0 (D:L508661). So:
   - **1**: the trail gave the cell at `+0x104` and its position at `+0xf8`, and the fallback arm was skipped;
   - **0**: the fallback arm ran. `+0xf8` was computed from the leader (D:L508700-508718), and `+0x104` from it
     (D:L508719). Online in r0004, r4 0x594dd0 then ran after it (research 417 s20).

   The early returns before this code (D:L508579-508660) leave the previous value. The other writer is signal 0 of
   `FUN_005fdf80` (D:L510072) [I1: its r4 image was not located].
2. **The follower's route state, on the controller C.** The route starts at C+0x46c (r4 0x602c28 `addiu s0,s3,1132`;
   D:L508644) [V4, the reviewer's].
   - **BYTE [C+0x4ec]** (route `+0x80`), the route state. It is read at r4 0x603360 and r4 0x603408 (D:L508825,
     D:L508840). The values the code assigns [D; I1 for r0004, whose writers' bodies were not compared]:
     - 0, cleared;
     - 1, a search started on the route;
     - 2, set during the search;
     - 4, finished with code 0;
     - 5, finished with a non-zero code;
     - 3 is never assigned, only tested.

     In WAIT (2), a value of 1-3 keeps WAIT (2). A 4 with a non-zero point count goes to FOLLOW (3), and anything
     else goes to COVERING (8) (D:L508825-508834).
   - **BYTE [C+0x4ed]** (route `+0x81`): the result code beside 4 or 5. It is 0 with 4. With 5 it is 2, 3, 4 or 6
     (D:L382664-382791). The goal update does not read it.
   - **WORD [C+0x508]** (route `+0x9c`), the number of route points: r4 0x603374 and r4 0x6033f0 (D:L508826,
     D:L508839).
   - **WORD [C+0x50c]** (route `+0xa0`), a pointer to the points. Each point is 8 bytes, and its first word is a cell
     in the encoding above: r4 0x60341c (D:L508843).

   **What they decide** (s19.2):
   - a request that fails shows K1 or K2: the state byte goes 1 or 2, then 5;
   - no request shows K3: no pending state at all;
   - `+0x78` = 0 through the wait makes K4 possible, and step 3a then tests it.

With reads 1, 2, 4 and 5, the exit the 40 hits took is decided (the 40 hits only; s15.3). E1 is excluded when 2
is a vtable whose `+0x2c` returns 1. Then 4 = 1 with 5 = 0 leaves E2; 4 = 0 with 5 non-zero leaves E3.

**The marks on this recipe:** the instructions are [V4]; the vtables are [V4, the reviewer's], with the slot bodies
re-read by this author; the object handles 0x668b20 and 0x435618 are [RIG]; "multiplayer flag" is [I1].

**Additions, 2026-11-12, later (each accepted by redotcom-19).** Memory reads at the step-4 snapshots, on the
r0004 served ELF. E is a body, C = [E+0xc0] its controller, G the follow goal.
- **The body's vtable, verified.** "First word r4 0x668b20" is CZSealBody's vtable: its type-info record r4 0x65c2e8
  names "CZSealBody", and its slot `+0x48` (r4 0x668b68) holds r4 0x5be100, the body's cell update (research 417 s25.8) [V4, this
  author]. r4 0x435618 stays the rig's.
- **BYTE [G+0x76], the start gate** (s24). Read by r4 0x00602c1c `lbu v0,118(s4)` (0x92820076, s4 = G) and again at r4
  0x00602c58; cleared at r4 0x00602c50 `sb zero,118(s4)`; set at r4 0x006058a8 `sb a0,118(s2)` [V4, this author].
  1: the gate holds (the tick stands, no request); 0: open. With it, [G+0x34] (s24.5: INIT (0) through a gated stand).
- **BYTE [G+0x30], the top goal's type**: 9 FOLLOW; 0xb the action (CAiSAction) when a type-1 push was granted
  (research 418 s22.11). The type byte at goal+0x30 is the one the walker tests against 0xb at D:L429530 [D; I1].
- **The door object by name, in r0004** (review12's reading; not checked here except the state word): the object list
  has its count at r4 0x0044d668, its sentinel at r4 0x0044d66c and its first node at r4 0x0044d670; a node's next is
  at +4 and its object at +8. The object's id is the u16 at object+0x40 (research 418 s22.10). Its name: [object+0x18] -> first
  word -> a string. Its state word: the u16 at [object+0x18]+4, the word the walker's type-1 body tests, r4 0x56d24c
  `lw v0,24(s3)`, r4 0x56d250 `lhu v0,4(v0)`, r4 0x56d254 `bne v0,zero,0x56d600` [V4, this author]. What its values
  mean is [INF] (research 418 s22.11 (c)).
- **The marker record, live** (review12's reading; the settling read of research 418 s22.10; redotcom-19 asks that it go FIRST in
  the rig's next MP71 slot): the manager r4 0x00669b30 (the navigation object, research 417 s20.2); its first list node at +8; a
  node's sub-map object at node+8; the marker array's pointer at object+0x100 and its count at object+0xfc; 40-byte
  records. The record for #0 (223,83) is the one with `word0 & 0x0007ffc0 == 0x000037c0` and `(u16 at +2) >> 3 ==
  83`. Read the u32 at +4 of each of the six: the file has 0x008ffff4 for #0 (223,83); the readers expect 0x00800044.
- **WORD [E_leader+0x4d0], the leader's trail count** (ACCEPTED 2026-11-12; first offered by the first reader). The
  word at body+0x434+0x9c. Its reset: r4 0x5275d0, `FUN_00527310`'s twin, through r4 0x5153b0 (`jr ra` with `sw
  zero,4(a0)`, a0 = obj+0x98) at r4 0x52760c (s25.3) [V4, this author]. The append's twin r4 0x525010 reads it (r4
  0x52503c `lw v1,156(s2)`) [V4, this author] and increments it [the readers']. A drop to 0 while the leader walks is
  research 417 s25's clear.
- **SHORT [E_leader+0x534], the leader's current action id** (ACCEPTED 2026-11-12). Read by r4 0x57d220,
  `FUN_00577e40`'s twin, at r4 0x57d234 `lh v0,1332(a0)` (0x84820534) [V4, this author]. 8 "Jump launch", 9 "Jump
  fall", 10 "Jump land", 11 "Jump land hard" (research 369 s13). Sample it with the step-4 snapshots, from the order to
  the leader reaching the top: an 8-11 there (a jump on the flight, or a LANDING after the placement) is research 417 s25's
  condition.

### 15.7 Text for the LATER 933 row (replaces s14.5's; positions only; for the controller to carry, not written to LATER.md)

**2026-11-12 -- CORRECTED IN s23.5, s31, s32, s33:** what remains is named there, not in s16-s17; the original stands on the flight, measured once; with a walking leader it crosses, measured once; the reference is s33's repeat.

> research 404 s15-s18: a trace of the original (r0004, MP71, n = 1) shows the following hostage WAIT at the foot of
> the east stairs ((2150.9, 179, 794.5), sub-map 0 (219,84)) for 30 s while the leader stood on the upper floor. It
> climbed only after the leader walked on, went up column 217 (the link column), and crossed z 661.8 -> 651.8
> diagonally without a stop. On that console its controller's `+0x171` bit 7 was clear throughout the climb. The
> port's follower does not take that path (s18). The cause of the foot wait and of column 217 is read in s16-s17;
> what the reading cannot produce is named there. No mechanism of the bit is asserted (STATUS). Keep the RED in
> `hostageTraversal.test.ts`, and add the trace's three-part measure (s18) as its target. No fix until s16-s18 are
> reviewed.
> (2026-11-12, later, s31:) in the original a follower stands on the flight about a cell and a half short of the top
> while its leader stands still upstairs (measured, n = 1). (2026-11-12, later, s32:) measured, n = 1: with a leader
> who keeps walking the original crosses the landing without a stop (the rig's scenario C); the port pins there (#798).
> (2026-11-12, later, s33:) the reference a fix is scored against: the gate opens at 8 cells, then straight up and
> across about 1.5 s behind a walking leader, no stop; the earlier 14 s lag after 11 s of wandering was the odd case.

## 16. Reading 1: what the follow decision does when the leader stands on another sub-map (the foot wait) [read, source; reading, pending review]

**2026-11-12 -- CORRECTED IN research 417 s20, research 417 s25, s26:** the fallback arm; the trail [I1]; the trail on from the build.

> **[I1] for the trail, 2026-11-12.** Every statement in this section about what the trail holds, when it is
> appended, and what the leader's recorded cell (`+0xe8`) is, is [I1]. r0004's twin of `FUN_005b7ba0` (r4 0x5be100), the
> body's per-tick cell and trail update, holds 26 online-only words at r4 0x5be350-0x5be3b8, and they are unread
> (research 417 s20.8).
>
> **Later, 2026-11-12: read twice (research 417 s25).** The words are r4 0x5be350-0x5be3b4. This section's trail statements are
> now [I1] except as research 417 s25 reads the r0004 twin; the append's twin r4 0x525010 (300 words, 293 identical, 7 relocated) is
> unchanged.

> **Banner, 2026-11-12 (after this section was written):** this section reads r0001. r0004's decision function is
> not r0001's code: it inserts an online-only call to r0004-only code, r4 0x594dd0, on the target's fallback arm (D:L508699-508719's
> r0004 image, at r4 0x602f34-0x602f50) [V4] (STATUS). Until r4 0x594dd0 is read, nothing here about the follow target on
> that arm (16.1's fallback point and its locate) carries to r0004 online, where the traces
> were taken. The trail-cell arm (`FUN_005fd790`) is not affected by the insertion.
> **2026-11-12, later:** r4 0x594dd0 is now read by one reader (research 417 s20). It rewrites only the target CELL on that arm,
> never the point. 16.1's fallback point carries; its locate carries only where research 417 s20 writes nothing.

**One author's reading, not re-read by a second reader, checked against one trace.** Date 2026-11-12. Every
decompilation line cited was re-read at the source by this author for this section; sections 10-14's attributions
were not inherited. The source is r0001 throughout. The r0004 follow tick matches r0001 word for word apart from
relocated calls [V4, s14 banner], but the decision function `FUN_005fb1c0` was not compared in r0004 [I1]. Nothing
here is explained by the bit. The constants are r0001 data, read with the reviewer's `review2/dat.py` (standard
library) [machine code].

### 16.1 The constants and the target

**2026-11-12 -- CORRECTED IN research 417 s20, s23.3:** the fallback arm's cell; "slot 0".

- **The target cell** is the leader's trail entry `+0x5c` back from the newest, stepped up to `+0x60` cells sideways
  (`FUN_005fd790` D:L509804-509897, called at D:L508688). The trail is the leader's, at leader `+0x434` (D:L508641).
  The newest entry is index 0, because `FUN_00524d50` inserts at the front (D:L392454-392460). Each sideways step must
  match the trail (`FUN_00524760`: same sub-map, x + z within the entry's width, D:L392166-392191) and be traversable
  (D:L509862-509871).
- **The slot.** An individual follow gets slot 0 (`FUN_005fd050` D:L450399; research 334 s1). Slot 0 is depth 2,
  side 2 (`FUN_005eb910` D:L500124-500125, D:L500161-500163). Depth is clamped to 1-100 (`FUN_00519290` with
  0x650c90 = 1 and 0x650c98 = 100, D:L508687).
- **The target point** is that cell's point (`FUN_0052d480`, D:L508689). Only when `FUN_005fd790` fails is a point
  built from the leader's position, velocity x 0.65 (`DAT_00650c30`) and the rotated slot offset, and then located
  (D:L508699-508719). **The original does not re-locate the trail cell.**
- **Near the target** (`lVar17`): the 3-D distance from the follower to the target point (`+0x114`, D:L508721-508732)
  is at most `DAT_00650ca0` (1.25) x `+0x68`. `+0x68` is `DAT_00650c28` = 15 (D:L510065), so the limit is 18.75
  units (D:L508735-508738).
- **Raw x + z.** The decision's other cell distances ignore the sub-map bits: route point to target, follower to
  route point, and follower to target (D:L508843-508895); also the idle restart (`FUN_005fc7d0` D:L509240-509255).
  The sub-map-0-grid distance `FUN_0052c320` is not called anywhere in `FUN_005fb1c0`.
- Data constants (r0001): `DAT_00650cb0` 100, `DAT_00650cc8` 600, `DAT_00650cd0` 0.1, `DAT_00650cd8` 3,
  `DAT_00650ce0` 10, `DAT_00650ce8` 15, `DAT_00650cf0` 7, `DAT_00650cf8` 4.5, `DAT_00650c88` 8.0, `DAT_00650d28` 3,
  `DAT_00650d30` 3.0.

### 16.2 Every branch that stands the follower, and whether it can hold it at (219,84) with the leader standing on tophost

**2026-11-12 -- CORRECTED IN research 419 s22.9, s23, s31:** WAIT's compare is unsigned; branch B's arming; arrival can hold a follower at the foot when the recorded cell freezes, run A.

The follower moves only when the tick takes M3, the route follower (s15.3a). It stands on M1 or M2, or on the tick's
own hold M4/M5. Which of these the tick takes is set by the decision function: the state byte, `+0x7c` and `+0x7d`.
In the trace's scenario, the follower at the foot (219,84) is about 168 units (3-D) from a leader on tophost row 5.
Its target is a trail cell two entries behind the leader, so 130 units or more from the foot.

| branch | lines | what it does | can it hold the follower at the foot, leader standing? |
|---|---|---|---|
| A. no leader, or the leader's `+0xe1` bit 4 clear | `FUN_005fdd40` D:L509991-510036; return D:L508579-508583 | drops the leader (`FUN_005fcf10` D:L509486-509514) | no: it ends the follow, so the follower would not then climb behind the same leader |
| B. the body's controller `+0x10c` object, byte `+9` non-zero | D:L508586-508605 | queued action calls (`FUN_005e7580`, `FUN_00600f70`, `FUN_005e7390`); returns with `+0x7c` = `+0x7d` = 0 (M2) | **not determined**: what that byte is was not read |
| C. the start hold `+0x76` | D:L508645-508660; set only at follow start, signal 0, D:L510077 | stands until the leader's trail length is at least 8 (`DAT_00650c88`; `FUN_00527e70` sums same-sub-map segments, D:L393837-393857) | only if the follow (re)started at the foot. The relayed record does not say. A leader walking on tophost lengthens the trail, which would fit "climbed when the leader walked" |
| D. far leader | D:L508752-508775 | needs the leader's slot `+0x2c` to answer non-zero, the follower body's `+0xc8` mask 0x20000, and a target farther than 100. It returns (stands) only when the leader is farther than 600 | no: 168 < 600 |
| E. arrived: state 0 -> 4 -> 7, or 3 -> 4 | D:L508818-508822, D:L508934-508937, D:L508959-508962 | stands in state 7. `FUN_005fc7d0` (D:L509239-509258) keeps it standing, while it is not near its target, until the leader's cell moves more than `+0xc4` (1) raw cells from the cell saved on arrival (D:L508960-508961). Then state 0 | **not at the foot**: arrival needs 18.75 units from the target, and the foot is 130 or more. Its shape, standing while the leader stands and going when he moves, is the trace's |
| F. failed route: state 2 -> 8 | D:L508825-508830; wait D:L509076-509081 | when the request ends without a route, stands 2.5 s (`+0x80` = 0x40200000), then state 0 and a new request | only if every request from (219,84) to the target fails. Then it stands wherever the failure found it, and goes once a request succeeds |
| G. the tick's hold M4/M5 | D:L508418-508451, `FUN_005fd150` D:L509566-509657, `FUN_005fe1f0` D:L510118-510256 | stands when the line from the follower to its next route point meets a triangle in front of the leader: 20 behind to 100 ahead, half-width 100 x tan 40 degrees (`DAT_0066ba50` = `FUN_001b3808(0x3f32b8c2)`, a tanf by its shape, D:L33075-33092). It applies within 125 units (100 x 1.25), or at any distance once it has held before (goal `+0x6c` bit 2, D:L508431-508440) | behind G3, the network flag (D:L508425). Online it cannot run, if the third reading's prediction holds (s14 banner; s15.6 read 4). Offline, its distance gate is 125 and not 168 (s18: the node model stops at about 125) |

`FUN_00560a60` > 1 leads to `FUN_0056d890` (D:L508798-508801), and `FUN_005fc590` sets a stance (D:L509144-509210).
Neither stands the follower, as far as read; their callees were not read.

### 16.3 The two named candidates

- **"The direct append needs the same sub-map"** (`FUN_0052bdf0` D:L396077-396095). When it fails, the trail splice
  is tried (D:L396096-396151). If that fails too, the decision drops to state 0 when the follower is within 7 raw
  cells of its route's end (D:L508929-508933); otherwise the old route goes on. **No branch of it stands the
  follower.** It predicts no wait at the foot, and nothing that waits for the leader to move.
- **"The distance in sub-map 0's grid"** (`FUN_0052c320`). It is used by the route follower's passing test
  (D:L429513, D:L429708) and by the recovery scan (D:L420875), not by the follow decision (s16.1). **It stands
  nobody.** It predicts no wait.

Neither candidate predicts a wait at the foot, or a climb when the leader moves.

### 16.4 What the reading cannot produce: the finding

**2026-11-12 -- CORRECTED IN s23.5, s31:** what remains; an arrived stand at the foot measured once, run A.

In the lines read, no branch puts the original's follower into a standing state at (219,84), 168 units from a leader
standing on tophost, and then releases it when the leader walks on, on a network game's console:
- the branch with exactly that release (E, state 7) cannot be entered at the foot;
- the only distance-free waits are C (only after a follow start) and F (only if every request fails);
- B is unread;
- G is predicted dead online, and is distance-gated at 125 even offline.

**The gap is the finding.** What would close it: the follow goal's state byte (`+0x34`), `+0x7c`, `+0x7d` and its
target cell (`+0x104`), per frame through the wait (s15.5 item 5). If the state reads 8 and 2 in turn, it is F, a
failing request. If it reads 7, the arrival happened somewhere the reading does not expect. If the byte at
[[body+0xc0]+0x10c]+9 is non-zero, it is B.

## 17. Reading 2: plan or splice: what makes the original's follower take column 217 [read, source; port source; reading, pending review]

**2026-11-12 -- CORRECTED IN research 417 s20, research 417 s25, s26:** the fallback arm; the trail [I1]; the trail on from the build.

> **[I1] for the trail, 2026-11-12.** Every statement in this section about what the trail holds, when it is
> appended, and what the leader's recorded cell (`+0xe8`) is, is [I1]. r0004's twin of `FUN_005b7ba0` (r4 0x5be100), the
> body's per-tick cell and trail update, holds 26 online-only words at r4 0x5be350-0x5be3b8, and they are unread
> (research 417 s20.8).
>
> **Later, 2026-11-12: read twice (research 417 s25).** The words are r4 0x5be350-0x5be3b4. This section's trail statements are
> now [I1] except as research 417 s25 reads the r0004 twin; the append's twin r4 0x525010 (300 words, 293 identical, 7 relocated) is
> unchanged.

> **Banner, 2026-11-12 (after this section was written):** this section reads r0001. r0004's decision function
> inserts an online-only call to r0004-only code, r4 0x594dd0, handed the target position and cell on the fallback arm
> (r4 0x602f34-0x602f50) [V4] (STATUS). Until it is read, the targets that prediction P plans to (17.2) are
> r0001's for that arm, not necessarily r0004's online.

**One author's reading, not re-read by a second reader, checked against one trace.** Date 2026-11-12. The source is
r0001; the port is this worktree. Nothing here is explained by the bit.

### 17.1 When the follow decision plans, and when it extends the trail

**2026-11-12 -- CORRECTED IN s23.2 (a) (the hub's review):** "`FUN_005623b0` empties the route and registers a
request" is not so for an untraversable target: there it skips both (D:L426851-426858; r1 0x5625a0), the route is not
emptied, and `FUN_005107b0` leaves a finished route alone.

**2026-11-12 -- CORRECTED IN s28.1, s28.8:** the splice's four preconditions.

- **A fresh plan is issued only in state 0** (D:L508803-508817). It goes through `FUN_005623b0` (D:L508815), which
  empties the route and registers a request from the follower's cell `+0xe8` to the target cell `+0x104` through
  `FUN_0052c5b0` (D:L426851-426871). That request is the planner over the link graph (research 333), so it crosses
  sub-maps only through a link. Before it, `FUN_00527300` attaches the leader's trail to the route as a corridor when
  the follower's own cell matches the trail (D:L508805-508813). The corridor limits only the smoothing (research 333
  s2; `hostagePath.ts:397`). State 2 waits for the answer: a route gives state 3, after a re-leg (`FUN_00526540`,
  D:L508832); no route gives state 8 (D:L508824-508835).
- **State 0 is entered:**
  - at the start of a follow;
  - from 4-7, when the leader's cell moves (`FUN_005fc7d0` D:L509255-509257; the states passed in, D:L508789-508791);
  - from 8, after 2.5 s (D:L509076-509081);
  - from 3, when the route is empty and the follower is not near its target (D:L508951-508952);
  - from 3, on the shortcut: the same sub-map, a travel line, and x + z + 3 below the route's length
    (D:L508898-508921);
  - from 3, when the extension fails within 7 raw cells of the route's end (D:L508929-508933).
- **In state 3 the route is EXTENDED, not re-planned.** This happens on every tick where the route's end is not the
  target, and either the follower is within 10 raw cells of the end or the end is 15 or more raw cells from the target
  (D:L508924-508926). The extension is `FUN_0052bdf0` (D:L508929-508930). It tries the direct append first (same
  sub-map and a travel line, D:L396077-396095, D:L396153-396158). Failing that, it tries the trail splice
  (D:L396096-396151), which needs the follower's own cell on the trail (route `+0x1c` mask 8, D:L508776-508787) and
  both the end and the goal on the trail. The splice copies the leader's cells as they are, and opens a new leg at a
  change of sub-map with no link (`FUN_00526f20` D:L393351-393358, s10.2).

### 17.2 After a wait: plan, or carry on along the route

**2026-11-12 -- CORRECTED IN s23.2 (a) (the hub's review):** not every stand "ends through state 0, and so through a
fresh plan": with an older finished route still there, WAIT (2) goes to FOLLOW (3).

**2026-11-12 -- CORRECTED IN s23.3:** "slot 0" unsettled.

Every standing branch of s16.2 that can end in a climb ends through state 0, and so through a fresh plan:
- E: 7 -> 0 when the leader moves;
- F: 8 -> 0 after 2.5 s;
- C: the start hold returns before the state machine, so the state is still 0 when it lets go.

The exceptions keep the state: B returns before the state machine, so a state-3 route would carry on; G is the
tick's hold inside state 3, so the route carries on.

**The prediction the port can be checked against** (the owner's note 2). Take the leader's trail at the moment the
follower starts to climb:
- **P, a fresh plan** (after E, F or C): the follower steers along a plan from its cell, (219,84), to the trail
  target cell. If the target cell is on tophost, the only way across is the link (217,71) <-> (12,8) (s2). The plan
  goes up column 217 to (217,71) L, then (12,8) L, then across tophost to the target (s5's plan has this shape). For a
  target east of column 12, such as (13,7), (13,6) or (14,7), the last leg runs north-east. **Column 217, whichever
  column the leader ran up.** If instead the target cell is on sub-map 0 (the landing (218,71), say, when the trail's
  third entry is still there), the plan stays on sub-map 0 and ends on the landing. A later extension onto tophost is
  then a splice: column 218.
- **S, the route carried on** (after B or G): the follower takes whatever its state-3 route holds. If that route was
  extended by the splice, it holds the leader's cells: **column 218 if the leader ran up 218**, and column 217 if he
  ran up 217.
- **The trace** (column 217, then north-east to (14,5)) fits P with a tophost target, for any leader column. It fits
  S only if the leader ran up 217, which is not recorded. The s16 branches that can produce a 30-s stand followed by
  a climb are C, E and F, and all three end in P. So the reading's best prediction is P, with a tophost target. Let
  the node run (s18) choose.

### 17.3 The port, against the original

**2026-11-12 -- CORRECTED IN s19.1, s23.1:** a soil-0 stand appends nothing; branch B's byte read by BL.

**What the port's `HostageFollow` itself does when the leader stands on another sub-map.** It stands only in these
cases:
- before it starts, while `trail.length` < 8 (`hostageFollow.ts:311-314`, the counterpart of branch C);
- with no location (`:324`);
- while yielding (`:367-376`);
- in recovery;
- in sub 2 while a request is pending (`:499-501`);
- in sub 7 after arriving (`:482`, `:488-489`, `:510`, branch E);
- in sub 8 after a failed request (`:483-487`, `:504`, branch F).

It has no branch B, D or G. The class says so: "no host-local CSealCtrl exists, so its rear-probe/turn (sub 5) and
WAIT_UP gates never run" (`hostageFollow.ts:158`; research 334 s1). **So the port waits at the foot only if it
arrives there or its request fails.** The leader-wait logic of the dev-disc test (`MAX_LEAD`) belongs to the test,
not to the game.

**Plans and extensions.**
- The port plans in sub 0 (`:490-497`) and extends in sub 3 (`:520-524`, `hostagePath.ts:586-616`), with the same
  thresholds as D:L508924-508933. The shortcut (`:518`) matches D:L508898-508921.
- On a failed extension within 7 cells, the port drops to sub 0 (`:523`), as the original does.

**The departures, with file:line on both sides.**
1. **The target is re-located.** The original's target is the trail cell itself (D:L508688-508692). It locates a
   point only on the fallback (D:L508719). The port turns the trail cell into a point and locates that point again on
   every tick (`hostageFollow.ts:472`, `:478`, `this.planner.locate(this.goal, there.map)`). Its locate walks the
   sub-maps in file order (s2a), so a trail cell's point over the landing can come back as a cell of another sub-map.
   In s18 this what-if (`trailcell`) changed nothing in the runs made. The trail's third entry there was already a
   sub-map-0 cell, because the leader stood on a soil-0 cell that neither the port's trail nor its target takes.
2. **The leader-local branches are not run** (`hostageFollow.ts:158`, research 334 s1, lines 43-45). In the original,
   D (D:L508752-508775) and state 4's rear probe into state 5 (D:L508963-509045) have no network-flag clause. They
   run wherever the leader's controller answers 1 at slot `+0x2c`. Under the ruling that our room stands where the
   leader's console stands (s14.6, measured once), these are departures to re-examine. As read, neither stands a
   follower 168 units from a standing leader (s16.2). G does have the network clause (s14 banner).
3. **The correction runs on every move** (`hostageFollow.ts:591-599`). That is s13-s14's subject, and it is not
   re-argued here. As positions only: the port's runs that pin show the correction pushing on #0 (218,71) (s18), and
   the trace's follower made no stop there.

**Unread here:**
- the request's search limits and failure cases in the original (`FUN_0052c5b0` and research 333's queue), which
  decide branch F;
- branch B's byte;
- `FUN_00560a60`, `FUN_0056d890` and `FUN_005fc590`'s callees;
- whether the original's leader trail records a leader standing on a soil-0 cell. `FUN_005b7ba0` feeds the recorder
  the leader's `+0xe8`, which follows traversable cells (s2, s11.4). That suggests not, but it was not traced for
  this case.

## 18. The node what-ifs against the trace's three-part measure [data, port run under node; reading, pending review]

**2026-11-12 -- CORRECTED IN research 417 s25:** the trail [I1].

> **[I1] for the trail, 2026-11-12.** Every statement in this section about what the trail holds, when it is
> appended, and what the leader's recorded cell (`+0xe8`) is, is [I1]. r0004's twin of `FUN_005b7ba0` (r4 0x5be100), the
> body's per-tick cell and trail update, holds 26 online-only words at r4 0x5be350-0x5be3b8, and they are unread
> (research 417 s20.8).
>
> **Later, 2026-11-12: read twice (research 417 s25).** The words are r4 0x5be350-0x5be3b4. This section's trail statements are
> now [I1] except as research 417 s25 reads the r0004 twin; the append's twin r4 0x525010 (300 words, 293 identical, 7 relocated) is
> unchanged.

**One author's reading, not re-read by a second reader, checked against one trace.** Date 2026-11-12. These are port
runs under node, headless. They are not a rendered browser run and not the original. No repository code was changed:
each what-if lives in a scratch script or a scratch copy of `hostageFollow.ts`. Nothing here is explained by the bit.

### 18.1 The harness, the scenario and the measure

**The harness** is `footrun.mts`, with `footrun2.mts` for the imposed wait, the scratch copy
`patched/hostageFollow.hold.ts`, and the survey `topcells.mts` (`topcells.out.txt`). Outputs are in `t18/` (64 runs),
all scratch under `evidence/forge-stim/xs/cells/`, outside git. The case is built as s12 builds it: MP71 from the
disc, the real `HostageFollow` and `Walker`, the leader sampled into `FollowTrail`, and occupancy, at 30 Hz for 75 s.

**The scenario, derived from s15's positions:**
- The follower starts at #0 (219,86), two cells south of the trace's first stop, (219,84).
- The leader starts beside it at #0 (219,83) and RUNS (forward 1) up a column, onto tophost row 5. It stands there
  30 s, then walks west along row 5 at forward 0.45, and stops.
- **Column (not recorded in the trace):** 218 or 217.
- **Facing while standing (not recorded):** N, as it ran, or S, back down the stairs.
- **The cell it stands on.** The trace's x is not recorded. Tophost row 5 is soil 0 at x 11-14 and soil 1 at x 6-10
  (`topcells.out.txt`). Two cells were used:
  - (13,5), the cell under the crossing's line: soil 0, so the port's trail does not record it;
  - (10,5): soil 1, traversable.

**Adaptations** (harness choices, not game behaviour): the leader does not wait for the follower. A waypoint counts
as reached at 2 units.

**The measure** (the fault owner's; scored by the script, three results apart):
- **(a) the wait:** the longest stretch while the leader stands in which the follower is still (under 2 u/s) within
  15 units of (2150.9, 794.5), with y under 190. YES at 25 s or more.
- **(b) the climb:** the stair frames (z 689.8-665.5, y 190-219). YES only if the climb begins after the leader moved
  AND at least 90% of the frames are in column 217 (x 2129.58-2139.58).
- **(c) the crossing:** the first crossing, from the first frame at z 661.8 or less (y over 215) to the first frame
  below z 651.8. YES only if it crosses, with no run of more than 1 frame moving under 0.05 u, and no correction push
  on #0 (218,*) in it.

**The what-ifs:**

| what-if | what it changes | from |
|---|---|---|
| `base` | nothing: the port as it is | -- |
| `hold` | the tick's hold G of s16.2, modelled with the leader as the local human and the network flag 0 (offline). The follower stands when, within 125 u or after a previous hold, its line to its next route point meets the leader's triangle | s16.2 G; predicted dead online |
| `nocorr` | the correction returns the proposal | s12 (i) |
| `trailcell` | the target is the trail cell itself, not re-located | s17.3 departure 1 |
| `holdnocorr`, `all` | hold + nocorr; trailcell + hold + nocorr | -- |
| `foot`, `footnocorr`, `footall` | **an IMPOSED wait, not a reading.** When the follower first comes within 15 u of the trace's stop while the leader stands, it is put in the port's own standing state (sub 7, the leader's cell saved), as branch E would. The port's own release (`hostageFollow.ts:482`, its `FUN_005fc7d0` counterpart) then ends it. This tests what the port does AFTER a wait, that is, prediction P of s17.2 | s17.2 P |

### 18.2 Results

Each cell gives (a) / (b) / (c). Facing N and S give the same results except for `hold` and the what-ifs that include
it, where the S row is given.

| what-if | stand (13,5), leader up 218 | stand (13,5), leader up 217 | stand (10,5), leader up 218 | stand (10,5), leader up 217 |
|---|---|---|---|---|
| `base` | NO, climbs at t 5.6 and stands on the stairs (217-218,73) y 210 in sub 7 / NO, climbed before the leader moved; after the move a plan to #0 (218,71), then column 218 / NO, pinned on #0 (218,71), 772-804 pushes | NO / NO, climbed before the move / YES | NO, climbs at t 4.8 to the landing / NO, column 218 before the move / NO, pinned, 1,333 pushes | NO, climbs at t 5.0 and stands at the top (2134.5, 222, 657.5) / NO, before the move / NO, it stands 26 s inside the band (a formation stand, no push) |
| `hold`, facing S | NO, it stands 29 s at (2144.6, 179, 749.5), 125 u from the leader, 45 u north of the trace's stop / NO, column 218 after the move / NO, pinned, 722 pushes | NO, stands at z 749.5 / NO, 21% in column 217 / YES | NO, stands at z 744.9 / NO, column 218 / NO, pinned, 749 pushes | NO, stands at z 745.2 / **YES**, 93% in column 217, after the move / NO, a 3-frame stop |
| `hold`, facing N | as `base` | as `base` | as `base` | as `base` |
| `nocorr` | NO / NO, before the move / YES | NO / NO / YES | NO / NO / NO, a 3-frame stop (S) or a formation stand in the band (N) | NO / NO / NO, a formation stand in the band |
| `trailcell` | identical to `base` | identical | identical | identical |
| `holdnocorr`, `all`, facing S | NO, stands at z 749 / NO, column 218 / YES | NO / NO, 26% in 217 / YES | NO, stands at z 744.8 / NO, column 218 / NO, a 3-frame stop | NO, stands at z 745.1 / **YES**, 100% in 217 / NO, a 4-frame stop |
| `foot` (imposed) | imposed, 30 s at (2148.9, 179, 806.5) / NO: the fresh plan targets #0 (218,71), so column 218 / NO, pinned, 677 pushes | imposed, 30 s at (2144.6, 179, 783.7) / YES, 100% / YES | **imposed, 30 s at (2144.3, 179, 799.4) / YES, 100% in 217 / YES, no stop, no push** | NO, not imposed: the follower was past the stop before the leader stood / NO / NO |
| `footnocorr`, `footall` | imposed / NO, column 218 / YES | imposed / YES / YES | **imposed / YES / YES** | NO, not imposed / NO / NO |

The fresh request that ends each imposed wait (the `requests` lines in the outputs) is the decisive datum:
- stand (10,5), leader up 218: #0 (218,85) -> #1 (10,4), answered #0 (218,85), (217,84), (217,71) L, #1 (12,8) L,
  (10,5), (10,4). That is a tophost target: column 217 through the link, then across tophost.
- stand (13,5), leader up 218: #0 (218,85) -> #0 (218,71), answered on sub-map 0 to the landing, then spliced onto
  tophost at the seam pair: column 218, and the pin (with the correction on).

### 18.3 What each what-if meets, part by part (the owner's note 3: a candidate that meets two of three fails the third)

**2026-11-12 -- CORRECTED IN s23.3:** prediction P rests on "slot 0"; the port results stand.

| what-if | (a) waits at the foot while the leader stands | (b) climbs by 217 after the leader moves | (c) crosses without a stop |
|---|---|---|---|
| `base` | **NO** in all eight runs. It climbs while the leader stands | NO | YES only with the leader up 217 and stand (13,5) |
| `hold` (offline model) | **NO**. It stands 29 s, but at z 745-750 (125 u from the leader), 45-50 u north of the trace's stop, and only facing S | YES in one of eight (stand (10,5), leader up 217, S) | YES with the leader up 217 and stand (13,5) |
| `nocorr` | **NO** | NO | YES with stand (13,5); NO with stand (10,5) (formation stands or 3-frame stops in the band) |
| `trailcell` | **NO** | NO | as `base` |
| `all` | **NO** (as `hold`) | YES in one of eight | as `holdnocorr` |
| `foot` / `footnocorr` / `footall` (IMPOSED, not a reading) | imposed, 30 s, in six of eight runs; not imposed in two | YES when the leader's standing cell is recorded (stand (10,5), leader up 218) or the leader ran up 217; NO with stand (13,5) and the leader up 218 | YES in the same runs as (b), even with the correction on; NO (pinned) with stand (13,5), leader up 218, correction on |

**No what-if derived from a reading meets (a).** Each fails the measure. "Leaves the pin" alone is not counted.

**The imposed wait meets (b) and (c), and (a) only because it is imposed.** With the leader standing on a recorded
tophost cell, the port's own release after the wait issues a fresh plan to a tophost target. That plan climbs column
217 through the link and crosses diagonally, with the correction running and no push. That is prediction P of s17.2,
seen in the port. It is the trace's path. When the leader's standing cell is soil 0 (not recorded), the trail's
third entry is the landing, #0 (218,71). The fresh plan then ends on sub-map 0, and the follower is spliced up column
218 into the pin. That is P's sub-map-0 case.

### 18.4 What this shows and what it does not

**2026-11-12 -- CORRECTED IN s19.1:** a soil-0 stand appends nothing.

**It shows, for the port under node:**
- the port's follower does not wait at the foot in this scenario. It climbs while the leader stands, to a formation
  spot on the stairs or at the top;
- given a wait that ends through state 0, the port's own fresh plan takes the trace's path whenever the trail
  target is on tophost;
- the column the port takes after a wait is decided by where the trail target cell is (tophost or the landing), not
  by the correction. Which cell that is depends on whether the leader's standing cell is recorded.

**It does not show:**
- what the original does: these are port runs;
- why the original waited at the foot (s16.4). The imposed wait is not a mechanism;
- the trace leader's x, column and facing, none of which are recorded;
- whether the original's trail records a leader on a soil-0 cell (s17.3, unread);
- whether the 3-frame stops in some `hold` runs are a link-point artefact of the port. They count as stops by the
  measure.

**No change to `hostageFollow.ts` is drafted or proposed here.** These runs only describe what each what-if did.

**Re-check:** read the host lock (`check`), then from an installed `agent/v0420` tree's `redotcom`:
`npx tsx <scratch>/footrun.mts <base|hold|nocorr|holdnocorr|trailcell|all> <218|217> <N|S> - <13|10>` and
`npx tsx <scratch>/footrun2.mts <foot|footnocorr|footall> <218|217> <N|S> - <13|10>`, with `SOCOM_DISC` set to the
disc tree.

## 19. Why a standing leader's target would be un-plannable from the foot and a walking leader's plannable: four candidates [read, source and r0004 machine code; reading, pending review; NOT measured]

**2026-11-12 -- CORRECTED IN research 417 s20, s21.3, s23.5, research 417 s25:** K4 read; K1-K3 narrowed; the trail [I1].

> **[I1] for the trail, 2026-11-12.** Every statement in this section about what the trail holds, when it is
> appended, and what the leader's recorded cell (`+0xe8`) is, is [I1]. r0004's twin of `FUN_005b7ba0` (r4 0x5be100), the
> body's per-tick cell and trail update, holds 26 online-only words at r4 0x5be350-0x5be3b8, and they are unread
> (research 417 s20.8).
>
> **Later, 2026-11-12: read twice (research 417 s25).** The words are r4 0x5be350-0x5be3b4. This section's trail statements are
> now [I1] except as research 417 s25 reads the r0004 twin; the append's twin r4 0x525010 (300 words, 293 identical, 7 relocated) is
> unchanged.

**One author's reading, not re-read by a second reader, checked against one trace. Candidates, not findings.** Date
2026-11-12, written before the rig's reads come back. The source is r0001 [I1 for r0004]. Nothing here is explained by
the bit.

**The question** (redotcom-19's, from s18's result). The wait ends when the leader MOVES, and a fresh plan to an
upper-floor target then goes by 217 (s18.3). So what in the code makes a standing leader's trail cell an unreachable
or un-plannable target from the foot, and a walking leader's a reachable one?

**The test common to all three: the target cell during the wait.** Read it as the follow goal's `+0x104`.

### 19.1 The lines the candidates rest on (re-read for this section)

**2026-11-12 -- CORRECTED IN s23.2, s23.3:** "cost limit" is the body's flags word; "slot 0" unsettled.

- **The trail append happens only on a traversable cell.**
  - `FUN_005b7ba0` locates the body (`FUN_0052dc70`, D:L471278) and writes the raw cell `+0xe4` (D:L471283).
  - When that cell is not traversable (`FUN_0052a090` false, D:L471288-471293), it only sets or clears `+0x172`
    bit 0 (D:L471294-471306). It writes no `+0xe8` and appends nothing to the trail.
  - The trail append (`FUN_00524d50` into body `+0x434`, D:L471324) lies only on the traversable branch, after a
    cell change or with `+0x1061` bit 6 (D:L471309-471325).
  - **So a leader standing on a soil-0 cell contributes no trail cell.** The trail's newest entry stays the last
    traversable cell he crossed.
- **Where the trace's leader stood.** Tophost row 5 is soil 0 at x 11-14 (world x 2119.58-2159.58) and soil 1 at
  x 6-10. Rows 6 and 7 are soil 1 at x 6-14 (`topcells.out.txt`, s18.1). The trace's stand (y 222, z 631.9) is on row
  5; its x is not recorded. From the seam (z 656.81) to row 5, a leader going straight north crosses two traversable
  tophost rows, 7 and 6. **If he stood at x >= 2119.58, the trail's three newest entries are:**
  - leader up 218: #1 (13,6), #1 (13,7), #0 (218,71);
  - leader up 217: #1 (12,6) or (13,6), #1 (12,7), #0 (217,71). (The locate of a body on (217,71), a bit-21 cell, is
    the stacked branch D:L397295-397316, whose band constants are unread, s2a.)

  So the depth-2 target (`FUN_005fd790` reads index 2, D:L509831-509833; slot 0 has depth 2, s16.1) is **the last
  sub-map-0 cell at the top of the stairs**. The sideways steps can then move it only along trail cells that are
  traversable (D:L509853-509890). Once he walks onto traversable cells (row 5 at x <= 10, or row 6), each new cell is
  appended, and index 2 moves onto tophost. In s18 the port's trail did exactly this. While the leader stood on
  (13,5), the port's request went to #0 (218,71). After his walk to (10,5), it went to #1 (10,4) (s18.2).
- **A request is made only for a traversable target** (`FUN_005623b0` D:L426851-426858). An untraversable target
  makes no request: `lVar12` stays 0. The decision ignores that return and enters state 2 anyway (D:L508815-508816).
- **The request's failure cases** (`FUN_0052c5b0` -> `FUN_0052c5c0`, D:L396337-396555, read here as far as the
  decompilation goes). It returns false at once when:
  - the start cell is not traversable (D:L396392-396400);
  - any stop is not traversable (D:L396403-396416);
  - on a same-sub-map leg, that sub-map's search object is missing (D:L396429-396440);
  - on a cross-sub-map leg, there is no link graph (D:L396446-396448), or `FUN_002d14a0` finds no graph path, first
    with the cost limit read from `param_5` `+0x24` and then with 0 (D:L396500-396506).

  The graph's costs from the endpoints are written only for link nodes on the endpoint's own sub-map, as raw x + z
  (D:L396454-396497). A same-sub-map leg is only queued (`FUN_00510c80`, D:L396442). Its search runs later, and can
  fail later, through the route's state byte. `FUN_002d14a0`, `FUN_00510c80` and the leg search's own limits were not
  read for this section.
- **State 2 -> 8.** State 2 waits while the route's state byte (controller `+0x4ec`, the route's `+0x80`) is 1-3
  (pending). Otherwise, with no points or a state other than 4, it goes to state 8 (D:L508824-508830). State 8 stands
  2.5 s, then returns to 0 and a new request (D:L509069-509081). State 0 is entered again only from there, so the
  cycle is 0 -> 2 -> 8 -> 0, for as long as the requests fail.

### 19.2 The candidates, and what the rig's samples would show for each

**2026-11-12 -- K3's SIGNATURE IS CORRECTED BY s23.2 (a) (the hub's review):** "`+0x34` cycling 0, 2, 8 with state 2
lasting one tick" is the case with no older route; with a stale finished route the cycle is 0, 2, 3. A trace showing
0, 2, 3 is not evidence against K3.

**2026-11-12 -- CORRECTED IN research 417 s20, s21.3, s23.3, s23.5:** K4 read; K1-K3 narrowed; "slot 0" unsettled.

Rig samples per frame across the wait and as the climb begins: the goal's `+0x34` (state), `+0x7c`, `+0x7d` and
`+0x104` (target cell); the follower controller's `+0x3f4`; the leader's x and cell while standing, and where he
walks. One addition would separate K1/K2 from K3 directly: the follower controller's `+0x4ec`, the route state byte.
That read is offered, and is not among redotcom-19's.

**K1. The standing leader's target is the landing on sub-map 0, and the original's same-map request to it fails.**
- **It rests on:** the soil-0 stand adding no trail cell (D:L471293-471325), so the target is the last sub-map-0 cell
  (above); the queued same-map leg (D:L396429-396443) failing later; then 2 -> 8 -> 0 (D:L508824-508830,
  D:L509069-509081).
- **The release:** the walk onto traversable tophost cells moves the target onto tophost. That is a cross-map
  request through the graph, which succeeds, and the climb takes column 217 by the link (s17.2 P).
- **The weak link: why would the same-map leg from (219,84) to (218,71) or (217,71) fail?** It is not read. The
  port's same request succeeds: s18, `#0 (218,85) -> #0 (218,71)`, answered. The port then climbed and stood near the
  top of the stairs. **If the rig confirms K1, the port's leg search departs from the original's there, and that is a
  new lead.**
- **The rig would show:**
  - the leader standing on a soil-0 cell, row 5 at x 2119.58-2159.58, his raw cell (`+0xe4`) on it, and his `+0xe8`
    an older traversable cell;
  - `+0x104` during the wait: a sub-map-0 cell at the top of the stairs, (218,71), (217,71) or a traversable
    neighbour on the trail;
  - `+0x34` cycling 0 -> 2 -> 8, about 2.5 s in 8 each time, with state 2 lasting while a search is pending (more than
    one tick if the leg is queued);
  - `+0x7c` 1 in 8 and 0 in 0 and 2; `+0x7d` 0 throughout the wait; the follower's `+0x3f4` 6;
  - at the release: the leader stepping onto row 5 at x <= 10, or onto row 6; `+0x104` jumping to a tophost cell;
    then 0 -> 2 -> 3 and the climb by 217.

**K2. The target is a tophost cell, and the cross-sub-map request fails while the leader stands.**
- **It rests on:** the graph search failing (D:L396500-396506), or a queued leg failing; then the same 2 -> 8 cycle.
- **The release:** the walk changes the target to one whose request succeeds.
- **The weak link: why one tophost target fails and another succeeds** is not read. The graph's endpoint costs
  depend only on raw x + z to the link nodes on the same sub-map (D:L396454-396497); `FUN_002d14a0` and its limit are
  unread.
- **The rig would show:**
  - `+0x104` a TOPHOST cell during the wait, for example (13,6), (13,7), (12,7) or (14,6);
  - `+0x34` cycling 0 -> 2 -> 8 as in K1;
  - the leader on any cell, traversable or not;
  - at the release: `+0x104` changing to another tophost cell, and the cycle ending in 3.

**K3. No request is made: the target cell is not traversable.**
- **It rests on:** `FUN_005623b0` skipping the request (D:L426851-426858), then 2 -> 8 at once (D:L508824-508830).
  The target could be untraversable only through the fallback: `FUN_005fd790` fails when the trail holds fewer than
  three entries or has no capacity (D:L509826-509833). The point is then built from the leader's position, velocity
  and slot offset, and located (D:L508699-508719). That locate keeps a first-sub-map cell with bit 21 clear whatever
  its soil, and treats stacked cells by soil and a y band (D:L397295-397316). So it can return a soil-0 cell.
- **The release:** the leader's walk moves the fallback point onto a traversable cell.
- **The weak link:** the trail should hold far more than three entries after a 16-cell run. Its dedupe truncates only
  the newest entries, down to a repeated cell (D:L392407-392467). So K3 needs something unread to have emptied or
  shortened the leader's trail.
- **The rig would show:**
  - `+0x104` an untraversable cell (soil 0, 8, 9 or 10), or the invalid-loc sentinel;
  - `+0x34` cycling 0 -> 2 -> 8 with state 2 lasting one tick only, because no search is pending;
  - at the release: `+0x104` becoming traversable.

**K4. r0004-only code rewrites the target on the fallback arm, online** (added 2026-11-12, after STEP 4.6 of
`review3/recipe.md`; verified here [V4]).
- **It rests on these instructions.** r0004's decision function inserts, at r4 0x602f34-0x602f50:
  - r4 0x602f34 `jal 0x57a470` (the network flag);
  - r4 0x602f3c `beq v0,zero,0x602f58` (offline: skip);
  - the arguments a0 = G+0xa4 (the leader's position), a1 = G+0xf8 (the target position) and a2 = G+0x104 (the target
    cell);
  - r4 0x602f4c `jal 0x594dd0`, with a3 = 1 in its delay slot.

  This comes right after the r0001 code that locates the fallback point into `+0x104` (r4 0x602f2c `jal 0x530d90`,
  the image of `FUN_0052dc70`, D:L508719). It runs only on the arm where the trail gave no usable cell: r4 0x602e48
  `bne s6,zero,0x602f58` skips it otherwise. r4 0x594dd0 has this one caller and no match in r0001. **What it does
  is NOT READ, and nothing is guessed here.** (Read 2026-11-12 by one reader, research 417 s20: it can rewrite `+0x104` only, never
  `+0xf8`. So K4's second bullet below can show only a cell difference, never a position difference.)
- **Its relation to the others.** K4 matters only if the fallback arm runs during the wait, that is, if
  `FUN_005fd790` gives no usable trail cell. That is K3's precondition, unexplained by the r0001 lines (above). If the
  arm runs online, the target the request is given is whatever r4 0x594dd0 leaves in `+0x104`. It can then be plannable or
  not in ways no r0001 line predicts.
- **The rig would show:**
  - the goal's `+0x78` = 0 during the wait. It is cleared when the trail gives no target (D:L508693-508698; r4
    0x602e44 `sb zero,0x78(s4)` [V4]) and is 1 while the trail gives one. This read is offered, not among redotcom-19's;
    it tells which arm ran;
  - `+0xf8`, `+0xfc`, `+0x100` (the target position) and `+0x104` (the target cell) differing from what r0001 would
    compute on that arm. That is the leader's position combined with 0.65 times his velocity (`FUN_00309180`,
    `FUN_00309240`, D:L508700-508703; the port reads it as minus), plus the slot offset (2, 2) turned by his facing
    `+0xb0` (D:L508712-508718), and its locate. If they differ, r4 0x594dd0 rewrote them;
  - `+0x34` and the rest as K1-K3, according to whether the rewritten target is plannable;
  - at the release: `+0x78` going to 1 (the trail giving a cell again as the leader walks onto traversable cells),
    or r4 0x594dd0's output changing.

**None of the four** if `+0x34` reads 3 or 7 through the wait, or `+0x7c` and `+0x7d` do not follow the 0/2/8
pattern. The wait then comes from a branch these candidates do not cover: s16.2's B (the `+0x10c` object's byte
`+9`, being read by a second reader) or something unread.

### 19.3 What the candidates share, and what they do not settle

**2026-11-12 -- CORRECTED IN research 417 s20:** r4 0x594dd0 read: it rewrites `+0x104` only.

- **K1-K3 share:** a stand in place through the 2 -> 8 -> 0 retry. The follower stands where its last route ended,
  which fits "first STOPPED AT THE FOOT". The release is a successful fresh request once the target changes, which
  fits the climb by 217 (s17.2 P; s18.3). The port already has the retry (`hostageFollow.ts:483-487`, `:504`), so
  in the port the difference would lie in the request's outcome, not the state machine.
- **K4** works differently: it changes the target itself, online, in r0004 only, on the fallback arm. It needs that
  arm to run (K3's precondition), and what r4 0x594dd0 does is not read.
- **They do not settle:** why the original's request fails (K1, K2), why the trail is short (K3), or what r0004
  r4 0x594dd0 does (K4). The leader's x
  and facing in the trace. Whether the original's locate puts a leader standing on tophost (13,5) on tophost or on
  sub-map 0's (218,68), which has bit 21 and soil 0 (`under.mts`, `under.out.txt`, scratch; the band constants are
  unread). Either way the cell is untraversable, so the trail gains nothing (D:L471293).

No change to `hostageFollow.ts` is drafted or proposed.

## 21. MP71's cell classes on the way, and where the frozen trail leaves the target [data: the disc through the repository's reader; port runs under node; one agent's read, 2026-11-12; not reviewed]

**2026-11-12 -- CORRECTED IN research 417 s25:** the trail [I1].

> **[I1] for the trail, 2026-11-12.** Every statement in this section about what the trail holds, when it is
> appended, and what the leader's recorded cell (`+0xe8`) is, is [I1]. r0004's twin of `FUN_005b7ba0` (r4 0x5be100), the
> body's per-tick cell and trail update, holds 26 online-only words at r4 0x5be350-0x5be3b8, and they are unread
> (research 417 s20.8).
>
> **Later, 2026-11-12: read twice (research 417 s25).** The words are r4 0x5be350-0x5be3b4. This section's trail statements are
> now [I1] except as research 417 s25 reads the r0004 twin; the append's twin r4 0x525010 (300 words, 293 identical, 7 relocated) is
> unchanged.

Date 2026-11-12. **The source.** One agent's scripts and outputs: `evidence/forge-stim/xs/cells/t20/`, scratch
outside git. `cells.mts` writes `cells.out.txt`, and `target.mts` writes `target.out.txt`. They import the port from
the canonical clone at `main` c6a72241d. Their header says that `aimaps.ts`, `hostagePath.ts`, `hostageFollow.ts`,
`simMap.ts` and the archive reader there are byte-identical to `agent/xs-cells` dacda9c1d, and that only
`match/src/room.ts` differs.

**The level.** These are a disc read and port runs under node. They are not the original. The agent's own report is
not on this host. s21.7 rebuilds, from the scripts, the outputs and this author's checks, what was verified at the
source and what was taken from this note.

### 21.1 The reader

`aiMapsFromZdb` (`packages/scene/src/aimaps.ts`) reads `RUN/MP71.ZDB`. Each cell is reported with:
- its class, byte 0 & 0x1f;
- whether it is walkable, by the port's counterpart of `FUN_0052a090`;
- its bits 7 (marker), 8 (link) and 21.

### 21.2 The classes on the way

**2026-11-12 -- CORRECTED IN s21.8:** bit 21.

| where | cells | class | walkable | notes |
|---|---|---|---|---|
| the foot | #0 (216-220, 84-88) | 1 | yes | the trace's stop (2150.9, 179, 794.5) locates to #0 (219,84); bit 21 set |
| the flight, lower | columns 217 and 218, rows 78-84 | 1 | yes | bit 21 set |
| the flight | columns 217 and 218, rows 72-76 | 7 | yes | bit 21 clear |
| the flight, row 77 | (217,77), (218,77) | 7 | yes | bit 21 set (as on rows 78-88 and on (217,71): see the correction below) |
| the landing | (218,71) | 7 | yes | bit 21 clear (s21.8, added 2026-11-12) |
| the link column's head | (217,71) | 7 | yes | bits 8 (link) and 21 |
| beside the flight | column 216 rows 71-77; column 219 rows 71-83; row 70 at columns 216-219 | 0 | no | |
| tophost, the link cell | #1 (12,8) | 1 | yes | bit 8 |
| tophost | #1 (12-14, 6-7) | 1 | yes | |
| tophost row 5 | #1 (11-14, 5) | 0 | **no** | where the trace's leader stood (s15.1) |
| tophost row 5 | #1 (8-10, 5) | 1 | yes | |

**Correction, 2026-11-12: bit 21 is not peculiar to row 77.** It is also set on the foot's class-1 rows 78-88 (W =
0x81e3e201) and on (217,71). The table's first form put it on row 77 alone.
**Completed 2026-11-12, later (s21.8):** set on rows 78-84 (85-88 by the t20 read), row 77 and (217,71); CLEAR on
rows 72-76 and on (218,71).

**Row 77's height field, a fact of the data** (not interpreted here). The record of #0 (217,77) and (218,77) is W =
0x82e55c07: class 7, bit 21 set, and height field (bits 9-18) 686. Against it:
- row 76 is 524 and row 75 is 548, about 24 per row;
- row 74 is 572;
- the top of the flight, (217,71) and (218,71), is 645;
- the foot's rows 78-88 are 497.

The 686 comes from the disc; nothing here explains it.

**Who reads bit 21: one reader's reading, with its lines** (review10, `evidence/forge-stim/xs/cells/review10/
bit21-leg-search.md`; not re-read by this author). Bit 21 has exactly two readers:
- the locator `FUN_0052dc70` (D:L397295-397297), where it is the stacked-sub-map height choice;
- a line-walk callback, `FUN_0058f960` (D:L450216-450222).

The leg search never reads it. So the search crosses row 77, in the same-sub-map plan and in the cross-map plan alike,
and s19's K1 has no reason that comes from row 77. The same reader finds r0004's twins of both readers, and of the
search functions, with no real change.

### 21.3 Where the trail's newest entries leave the target

**2026-11-12 -- CORRECTED IN s23.3, s29, s31:** "slot 0" unsettled; the column premise does not hold for the second trace; the recorded cell froze at the foot, measured, run A.

**The method.** The leader's way runs from the foot, up column 217 or 218, onto tophost, to #1 (13,5). It is sampled
every 0.5 u through the port's locate. A cell is appended to the port's `FollowTrail` only when it is walkable, as the
original's writer does (s21.4). The trail's newest entries, with the leader standing on #1 (13,5), newest first:
- leader up 217: #1 (12,6), #1 (12,7), #0 (217,71), #0 (217,72), ...;
- leader up 218: #1 (13,6), #1 (13,7), #0 (218,71), #0 (218,72), ....

**The targets.** Index 2 (slot 0's depth, s16.1) is #0 (217,71) or #0 (218,71). After the sideways steps, for each
facing, the target is one of #0 (218,71), #0 (217,71), #0 (217,73) or #0 (218,73). Every one of them is 116.30-140.02
units (3-D) from the trace's stop.

**What follows.** No target lies within the arrival radius of 18.75 of the foot. So the trail gives no HIDE (7) at the
foot. **redotcom-19's "trail frozen at the foot" candidate is DEAD**: the flight's cells are class 1 or 7, walkable,
and they are recorded.

### 21.4 The port's trail writer, and its requests from the foot

- **The port's trail writer has the walkable test.** It is `packages/match/src/extraction.ts:746`, `if
  (this.planner!.traversable(loc)) trail.add(...)`, citing `FUN_005b7ba0` D:L471291-471324.
- **A small gap.** The original appends to the trail only when the body's `+0x105e` bit 0 is set (D:L471319-471324,
  re-read by this author). The port does not model that bit.
- **The port answers every request from the foot.** From #0 (219,84), its planner answers all of these
  (`target.out.txt`):

  | to | cost | way |
  |---|---|---|
  | #0 (218,71) | 327 | |
  | #0 (217,71) | 329 | |
  | #0 (218,72) | 302 | |
  | #1 (13,6) | 381 | through the link |
  | #1 (12,7) | 354 | through the link |

  From #0 (218,85) and #0 (219,85) it answers the same requests too.
- **So in the port,** a failing request (s19's K1 and K2) does not arise from the foot. This is a port run, not the
  original.

### 21.5 MP71's links and markers

**2026-11-12 -- CORRECTED IN research 418 s22.10, s30:** the markers' ids are rewritten at load, read and now measured.

- **Links.** MP71's link table holds two links: #0 (217,71) <-> #1 (12,8), and #0 (252,42) <-> #2 (17,2). Each is a
  12-byte record {from, to, word}, with word 0x00000008. The records have no type field.
- **Markers.** MP71 holds six markers, all type 1 and state 0 (bits 20-22), all with id 0xffff: #0 (238,45), (251,65),
  (223,83) and (217,65); #1 (10,4) and (15,24).
- **None is on the flight.** The flight's cells have bit 7 clear (s21.2). So no marker dispatch happens on the stairs,
  and no type-7 hold comes from the disc's data there (research 418 s22.6).

### 21.6 The leader's recorded cell (departure 5, STATUS) [read, source; port source; a departure by reading, effect not run]

**The original's cell.**
- `FUN_005b7ba0` (D:L471247 on) writes the body's raw cell `+0xe4` every time. It writes `+0xe8` only on the walkable
  branch (D:L471318). The non-walkable branch only sets or clears `+0x172` bit 0 (D:L471293-471306). So `+0xe8` is
  the last WALKABLE cell.
- The goal copies the leader's `+0xe8` into its `+0xc0` (D:L508620).
- On entering HIDE (7) from HIDE PLAN (4), it saves `+0xc0` to `+0xc8` and sets `+0xc4` = 1 (D:L508960-508961).
- `FUN_005fc7d0` (D:L509214 on) compares `+0xc0` with `+0xc8`. It uses raw x and z only, with no sub-map bits
  (D:L509240-509255), against `+0xc4` (D:L509255).

All of these lines were re-read by this author.

**The port's cell.**
- It takes the leader's RAW located cell: `there = this.planner.locate(leader.feet)` (`hostageFollow.ts:316`).
- It saves that cell on arrival (`:489`, `this.arrivedLeader = { ...there }`).
- It tests the release against it (`:482`, `xyCells(there, this.arrivedLeader) > idleMove`).

**The difference.** A leader who walks across non-walkable cells moves the port's cell, and not the original's. On
MP71, a leader walking along tophost row 5 at x 11-14 (class 0) is an example:
- the port's `there` moves cell by cell, and its release can fire after one cell;
- the original's `+0xe8` stays on the last walkable cell, #1 (13,6) or (12,6), and its release waits for a walkable
  cell.

The effect has not been run.

### 21.7 What the agent verified at the source, and what it took from this note (rebuilt; see the head of s21)

**2026-11-12 -- CORRECTED IN s23.3:** "slot 0" unsettled.

- **Verified at the source:**
  - every class, bit and marker or link record above, read from the disc through the repository's reader;
  - where the trace's stop locates;
  - the trail and its targets, and the requests, all from the port's own code.
- **Checked by this author at the decompilation:** the D:L lines of s21.4 and s21.6.
- **Taken from this note:**
  - the trace's positions (s15.1);
  - the slot's depth 2 (s16.1);
  - the arrival radius 18.75 (s16.1);
  - that the original appends only walkable cells (s19.1).
- **Not checked:**
  - whether the original's trail dedupe (D:L392407-392467) matches the port's `FollowTrail` on this way;
  - the leader's actual column, facing and x in the trace (not recorded, s18.1).

### 21.8 The heights, bit 21 corrected, and the port's locate over every stair row (t24, 2026-11-12) [data: the disc through the repository's reader; the port's locate under node; one agent's run; not reviewed]

**The source.** `evidence/forge-stim/xs/cells/t24/walk.mts` and `walk.out.txt`, scratch outside git: the two sub-maps'
height fields read through the repository's reader, and the port's locate run over every stair row. **What this author
checked:** from the printed records, bit 21, the height field (bits 9-18) and the world height of each stair row's word,
recomputed by hand; the script was not re-run.

**Bit 21, corrected** (the correction line above, written at the last head, put bit 21 on "rows 78-88"; it is
completed here):
- **set** on rows 78-84 of columns 217 and 218 (W = 0x81e3e201; rows 85-88 rest on the t20 read), on row 77 (W =
  0x82e55c07) and on (217,71) (W = 0x8ae50b07);
- **CLEAR** on rows 72-76 (W = 0x88c41807 to 0x88c4da07) and on **(218,71)** (W = 0x8ac50a07). So the top of the flight differs by
  column: (217,71), the link cell, has bit 21; (218,71) does not.

**The heights.** The port's height model is origin + field x scale (`aimaps.ts` `aiCellY`):
- sub-map 0: origin 38.2305, scale 0.28279;
- sub-map 1, "tophost": origin 205.539, scale 0.016075.

The stair rows' world heights (both columns alike):

| rows | field | world height |
|---|---|---|
| 84-78 | 497 | 178.776 |
| **77** | **686** | **232.223** |
| 76 | 524 | 186.411 |
| 75 | 548 | 193.198 |
| 74 | 572 | 199.985 |
| 73 | 597 | 207.055 |
| 72 | 621 | 213.841 |
| 71 | 645 | 220.628 |

**Row 77 stands at 232.223: above the top of the flight (220.628) and above tophost's ceiling (222.0). A FACT OF THE
DATA, not interpreted.** Its raw record is 0x82e55c07 0x00000000 on both columns.

**Tophost under the stair** (columns 12-14 over the flight's x): (12,8) class 1 at 205.539, the link cell; rows 9-13
not stored; (12-14,14) class 0 at 221.984; (12-14, 15-21) class 1 at 221.984. (12-14,7) is class 1 at 221.984.

**The walk.** The port's locate (`locateAiCell`, research 335 s2) was run every quarter row up columns 217 and 218,
under two height models: (a) the body at the record height of the sub-map-0 cell under it; (b) a straight ramp from
178.776 at row 84.5 to 220.628 at row 71.5.
- **The port's locate returns a tophost cell on NO stair row, in either column, under either model.** Every sample
  locates to the sub-map-0 cell under it.
- The last-walkable sequence is every row in order, 84 to 71, **row 77 included**. Why, under model (b): at row 77 the
  sub-map-0 cell is 30-32 units above the body, but the tophost cell under it, (12,14) or (13,14), has dy2 of -19.9 to
  -21.5, not above -10, so it does not compete and the sub-map-0 cell is kept.
- **So the remark, relayed earlier, that the port's locate "briefly gives a non-walkable tophost cell" at row 77 is NOT
  reproduced; it is unconfirmed.** And review10's possibility (s21.2; "sub-map 1's cell under it ... replaces it")
  does not happen for a body on the steps under either model.

**Limits.** This is the PORT's locate, a reading per research 335 s2, run under node. Nothing here is compared against
the original running, and neither height model is a measured body height.

## 23. The standing branches, three readings compared [read, source and r0001 machine code; a fourth reader's comparison, checked here in part; reading, pending review; NOT measured]

> **Caution, at the head as its source puts it** (the blind reader's own, kept by the fourth reader): everything marked
> [D] rests on the decompiler's control flow, and this function family has shown that it can be wrong -- the walker's
> dropped jump table (research 418 s22), the binder's (research 418 s22.10), and the `byte - 1 < 3` compares that are unsigned in the machine
> code (research 419 s22.9).

Date 2026-11-12. **The source.** `evidence/forge-stim/xs/cells/cmp3/three-way.md` and its scripts (`d.py`, a
standard-library decoder), scratch outside git: a fourth reader, read-only, lined up three readings of the follow
logic's standing branches and settled each disagreement it could at the source. The three readings:
- **AU**, this note's author (s15-s19), who knew the outcome and the earlier readings;
- **OA**, the outcome-anchored reader (review5);
- **BL**, the blind reader (review6), shown neither the outcome nor the other readings.

**What this author checked** [V1, `t22/d4.py` over the r0001 ELF]: the instructions of s23.2 (a) and (b), the gate's
window and its set (s24.1), the WAIT compare (research 419 s22.9) and the constant 8.0. The rest is the fourth reader's.

### 23.1 The union table

States are the goal's own names with their numbers (the head). The fourth reader read the state jump table at r1
0x662de0: 0 -> r1 0x5fbac8, 2 -> r1 0x5fbb60, 3 -> r1 0x5fbbf0, 4 -> r1 0x5fbf90, 5 -> r1 0x5fc298, 7 and 8 -> r1
0x5fc328, 1 and 6 -> r1 0x5fc3a0, the exit. UNKNOWN (1) has no code, and HIDE FOLLOW (6) is never written.

| # | standing branch | result | at the source |
|---|---|---|---|
| 1 | the start gate, goal `+0x76` | AGREE | s24 |
| 2 | the group byte, `+9` of the object at controller `+0x10c` | AU has no reading; OA and BL agree on what it does; ONLY BL has its arming (`FUN_005e7690`, armed by `FUN_005ed140` event 0, at most 10 s) | [D] D:L500915-500934, D:L497962-497978, D:L498524-498561 support BL. Whether it applies is not settled by code |
| 3 | the far gate (> 600) | AGREE: not at the foot (168 < 600) | D:L508755-508775 |
| 4 | INIT (0), one tick; the request's result ignored | AGREE | D:L508804-508817 |
| 5 | WAIT (2) while a search is pending | AGREE on the branch; ONLY BL gives the 33 counts per service call (r1 0x64f8d8 = 33) | the compare is unsigned (research 419 s22.9) |
| 6 | WAIT (2) -> COVERING (8), 2.5 s, then INIT (0) | AGREE | D:L509076-509081 |
| 7 | FOLLOW (3) with the route not ready -> INIT (0) | AGREE | D:L508951-508957 |
| 8 | the walker's type-7 hold | ONLY OA and BL | research 418 s22.4 |
| 9 | the walker's type-1 request refused | ONLY OA and BL; they agree | research 418 s22.4, research 418 s22.11 |
| 10 | the walker's type 4, movement state 7 | ONLY OA and BL; neither read state 7 | `FUN_0056af50` unread by all |
| 11 | the walker's blocked and avoidance holds | OA and BL agree | D:L429610-429616, D:L429626-429636 |
| 11b | the next waypoint has no record | ONLY BL | D:L429498-429510 |
| 11c | the walker entered with the route byte 1-3 | OA and BL agree | D:L429478-429488 |
| 12 | HIDE PLAN (4), HIDE WAIT (5), HIDE (7): the arrived stand | AGREE on the code; DISAGREE on where it applies | the leave-stand set is exactly 4, 5, 6, 7 (r1 0x5fba14-0x5fba30, the fourth reader's); the map decides (s23.5) |
| 13 | HIDE WAIT (5) with a blockage | OA and BL agree | D:L509055-509061 |
| 14 | `FUN_00556370` forcing movement state 4 | AGREE that it replaces `FUN_005fae70` for the tick | the goal update still runs that tick (D:L432513) |
| 15 | the speed factor 0 | ONLY BL | D:L508938-508948; not beyond 67.5 units |
| 16 | the single-player check `FUN_005fd150` | AGREE: off in a network game | D:L508425, D:L508472 |
| 17 | no leader, or the leader's `+0xe1` bit 4 clear | AGREE: the follow ends | D:L508578-508584, D:L509991-510036 |
| 18 | the early exits of `FUN_0056de10` | ONLY OA | not re-read by the fourth reader |

The route request's failure cases (the fourth reader's B (v)): the sentinel target, the follower's own column and
row, a target whose sub-map is missing or whose cell is not walkable, the follower's own cell not walkable, no search
object, no link graph, no chain, every leg refused, a queued leg's search failing later (codes 2, 3, 4, 6), and the
time slice running out (code 5, not a failure). AU had the immediate returns only; OA and BL have the rest, BL alone
the old-route case below.

### 23.2 The three disagreements, settled at the source

- **(a) A NON-WALKABLE TARGET leaves the route object untouched.** So an older finished route is taken as the
  answer, and the goal goes to FOLLOW (3) on the old route. BL was right; AU and OA missed it. [V1, this author]: r1
  0x562578 `jal 0x52a180` (0x0c14a860) and r1 0x562588 `jal 0x52a090` (0x0c14a824); r1 0x5625a0 `beq v0,zero,0x562608`
  (0x10400019) skips every call on the route object (D:L426851-426858). INIT's own `FUN_005107b0` (D:L508814) acts only
  on a route whose byte is 2 or 1, or that is still queued (D:L382136-382171), so a finished route survives; WAIT (2)
  then reads byte 4 with a non-zero count (r1 0x5fbb74-0x5fbb94, the fourth reader's) and goes to FOLLOW (3) through
  `FUN_00526540`. It needs a route with entries left when INIT (0) is entered: from HIDE (7) on arrival with entries
  left (D:L508934-508937), or from FOLLOW's shortcut and failed-extension exits (D:L508919-508920,
  D:L508929-508932). **It is a way to walk an old route to a stale place**; it bears on the pin as much as on the wait.
- **(b) The "no cell" sentinel is 0xffffffff at run time.** BL wrote "(0,0)" and was wrong; OA wrote "run-time value
  not determined", correct as far as it went. [V1, this author]: the file word r1 0x65aed0 is 0; the static
  initialiser r1 0x668680-0x668708 stores to it three times (`sw a0,-20784(at)` at r1 0x6686d0 and r1 0x6686ec, and
  `sw v1,-20784(at)` at r1 0x668708, in the delay slot of `jr ra`), building id 0x3f, column 0x1fff and row 0x1fff;
  its address is the data word at r1 0x6690ec (0x00668680). review9 found the same construction in r0004 (research 417 s20.10).
  That the table holding r1 0x6690ec is walked at start-up was not read.
- **(c) Route `+0x24` is the body's flags word, not a cost limit.** AU wrote "cost limit" and was wrong. [D, the
  fourth reader's]: D:L434931-434932 writes the body's `+200` flags word there; D:L396476 stores it in the graph
  node's `+0x18`, the field `FUN_005b7ba0` ORs flags into (D:L471351-471353). What `FUN_002d14a0` and `FUN_002d1790`
  do with it is unread by all four.

### 23.3 Not settled

- **"Slot 0".** AU wrote that an individual follow gets slot 0 (`FUN_005fd050`, D:L450399). D:L450399 passes the byte
  `*(group + 8)`, not a literal 0, so "slot 0" holds only if that byte is 0. Its writers are unread.
- Whether a hostage's follow order always makes a new goal (`FUN_005f5f20`'s three conditions, D:L505670-505675).
- Why a same-sub-map search from the foot to the top of the stairs would fail in the original (the leg search's
  limits `+0x8c`, `+0x90`, and `FUN_005121c0`).
- Row 18, and movement state 7 (`FUN_0056af50`).

### 23.4 The constants

Re-read from the r0001 ELF's bytes by the fourth reader; 0x650c88 also by this author [V1]:

| symbol | value | the readers |
|---|---|---|
| `DAT_00650928` | 5 | all agree |
| `DAT_0065aed0` | 0 in the file; 0xffffffff after the static initialiser | BL "0, column 0, row 0" (wrong at run time); OA "not determined" |
| `DAT_00650c88` | 8.0 (0x41000000) | all three |
| `DAT_00650ca0` | 1.25 | all three |
| `DAT_00650c28` | 15.0 | all three |
| `DAT_00650cc8` | 600.0 | all three |
| `DAT_00650cb0` | 100.0 | all three |
| `DAT_00650cf0` | 7 | all three |
| `DAT_00650d30` | 3.0 | all three |
| `DAT_0064f8d8` | 33 | BL only |

Also equal in every reader that gives them: 0x650c30 0.65, 0x64fc60 10.0, 0x650c90 1, 0x650c98 100, 0x650ca8 150.0,
0x650cc0 10.0, 0x650cd0 0.1, 0x650cd8 3, 0x650ce0 10, 0x650ce8 15, 0x650cf8 4.5, 0x650d00 1.2, 0x650d08 0.25, 0x650d18
8, 0x650d20 5, 0x650d28 3. No two readers give different numbers for any constant; the one difference is the
sentinel's run-time value.

### 23.5 With the disc facts applied (s21): what is excluded, and what remains

**2026-11-12 -- CORRECTED IN research 417 s25.6, s26.4, s29, s31:** the trail can be emptied online; the fallback-arm exclusion holds under the stated trail; the column premise does not hold for the second trace; the fallback arm ran at an order and an arrived stand at the foot occurred, measured.

The scenario: the leader went up and stands on non-walkable upper-floor cells; the trail's newest entries are two
walkable upper-floor cells, then the top-of-stairs cell; the follower is at the foot, 116-140 units from the target.

**Excluded, and by what:**
- HIDE PLAN (4), HIDE WAIT (5), HIDE (7) (row 12): the target is 116-140 units away and arrival needs 18.75. A HIDE
  entered earlier does not last either: the stair cells are walkable, so the leader's recorded cell moved far more
  than `+0xc4` from `+0xc8`, and "not arrived" sends the goal to INIT (0).
- Rows 8, 9 and 10's type-4 entry: no marker on the stairs, none of type 7 or 4 on MP71.
- Every request failure but one: the target is a real, walkable cell on the follower's own sub-map; the follower's
  cell (219,84) is class 1; both ends of the leg are walkable. With the walkable target, the old-route case (a) is
  excluded too.
- Row 15 (beyond 67.5 units), row 3 (168 < 600), row 16 (the network flag).
- The fallback arm, and with it r4 0x594dd0: the trail gives a cell (three entries or more), so `+0x78` = 1 (under the
  stated trail; see research 417 s25.6, s26.4).

**Remaining:**
1. Row 1, the start gate: only if the trail's same-sub-map length is under 8.0 (s24).
2. Row 2, the group byte.
3. Rows 5-6, WAIT (2) and COVERING (8), through the one failure left: a queued same-sub-map search that ends without a
   path (code 2 after 200 resumes, 3 over the route's limits, 4 open list empty, 6 pools full), or one that stays
   pending. The port's planner answers this request from the foot (s21.4); that is the port's planner, not the
   original's search.
4. Rows 11 and 14 (a blocking body; not a map fact), row 11b, row 18, and row 10 through `FUN_0054f6e0`.
5. Anything r0004-only outside the fallback arm (not compared here; research 417 s25 is one such). **2026-11-12, later:** the map
   loader's per-map patch (R4B-11; research 417 s20.12) is another; on MP71 none of its six cells lies on the way.

**The run-time reads that separate them** (the fourth reader's table):

| read | row 1 | row 2 | rows 5-6 | rows 11, 14 | row 18 |
|---|---|---|---|---|---|
| goal `+0x76` | 1 | 0 | 0 | 0 | 0 |
| goal `+0x34` | INIT (0), never changing | frozen | cycling INIT (0) / WAIT (2) / COVERING (8) | FOLLOW (3) | frozen |
| goal `+0x80` | 0 | frozen | 2.5 counting down in COVERING (8) | - | frozen |
| goal `+0x78`, `+0x104`, `+0xf8` | not updated (the gate returns before the target) | not updated | `+0x78` = 1; `+0x104` the top-of-stairs cell on sub-map 0 | as rows 5-6 | not updated |
| controller `+0x4ec` / `+0x4ed` / `+0x508` | untouched | untouched | 1-3 while pending; 5 with the code, `+0x508` = 0, on failure | 4 and non-zero | untouched |
| `[ctl+0x10c]+9` | 0 | non-zero | 0 | 0 | - |
| controller `+0x32c` | - | - | - | 1 (row 11) | - |
| leader `+0xe4` / `+0xe8`, trail count | `+0xe4` != `+0xe8`; count small, length < 8.0 | any | `+0xe4` the non-walkable cell, `+0xe8` the last walkable; count >= 3 | any | any |

## 24. The start gate [read, source and both builds' machine code; port source; port runs under node; reading, pending review; NOT measured]

**2026-11-12 -- CORRECTED IN s26:** the trail on from the build.

Date 2026-11-12. **The source.** The fourth reader's section E (`cmp3/three-way.md`, s23). **What this author
checked:** every [V1] and [V4] instruction below, from the two ELFs' bytes (`t22/d4.py`); the D:L lines D:L509301,
D:L509398, D:L412460, D:L471284, D:L509996-509999 and D:L510077 opened; the port's lines on this branch. The rest is
the fourth reader's.

### 24.1 When `+0x76` is set, and when it is cleared [V1]

- **Set only on goal event 0.** The one setting store is r1 0x5fe0a8 `sb a0,118(s2)` (0xa2440076), with a0 = 1 from r1
  0x5fe058 `addiu a0,zero,1`, in `FUN_005fdf80`'s case 0 (D:L510077).
- **Cleared at r1 0x5fb470** `sb zero,118(s4)` (0xa2800076), when the length is not less than 8.0. The window: r1
  0x5fb43c `lbu v0,118(s4)`; r1 0x5fb454 `jal 0x527e70` with a1 = 1 (r1 0x5fb450); r1 0x5fb460 loads 8.0 from r1
  0x650c88 (0x41000000); the compare and branch at r1 0x5fb464-0x5fb468 skip the clear when the length is under 8.0.
  The fourth reader found only these two direct stores to `+0x76` in r1 0x5d0000-0x612000.
- **Events 2 and 3.** Event 3 (uncovered) sets `+0x34` to INIT (0) and does not touch `+0x76` (D:L510103-510112). A
  push over the top sends event 2 to the covered goal and event 0 to the new one (`FUN_005f7ee0`, D:L506852,
  D:L506860); a pop sends event 1 to the removed goal and event 3 to the uncovered one (`FUN_005f7c40`, D:L506750,
  D:L506771). A leader change (`FUN_005fdd40`) sets INIT (0) only (D:L509996-509999).
- **A follow order** (D:L450385-450393, in `FUN_0058fbe0`): `FUN_005f5f20(ctl, 0)`; then, if the top goal is already
  type 9, that goal is REUSED: no event 0, and the gate is not re-armed. Otherwise `FUN_005f5c00(ctl, 9, 0)` ->
  `FUN_005f7ee0` -> event 0 -> `+0x76` = 1. `FUN_005f5f20` clears the stack first when the body's `+0xe1` bit 4 is
  clear, or controller `+0x264` bit 1 is set, or the body's `+200` has 0x40000 (D:L505670-505675); which holds for a
  hostage is not determined. **So `+0x76` cannot be set again without a new goal**, and an interrupted-and-resumed
  follow (event 3) restarts at INIT (0) with the gate open.

### 24.2 How the 8.0 is counted

`FUN_00527e70`(trail, 1) (D:L393832-393859; the fourth reader's [V1] r1 0x527e70-0x527fb0):
- count 0 returns 0; the argument 1 forces a recount;
- sum = 0; previous = entry 0, the newest; for each entry from index 1 to the last, if the two entries' sub-map ids
  are equal, add sqrt(dcol^2 + drow^2); previous = this entry, always;
- so: the straight distance in cells between consecutive entries, **over the whole trail from index 0**; a change of
  sub-map **adds 0 and neither ends nor resets the count**;
- the capacity is 75 entries (`FUN_00546c40(leader, 1, 0x4b)`, D:L509301), the oldest dropped at capacity
  (D:L392450-392455);
- the gate opens when the length is not less than 8.0.

Examples (the fourth reader's): [#1 (13,6), #1 (13,7), #0 (218,71), (218,72) ... (218,84)] measures 1 + 0 + 13 = 14.0;
the leader stopped at row r on the flight, 84 - r. A diagonal step counts 1.414.

### 24.3 What the gated tick commands, and the trail at the order

**2026-11-12 -- CORRECTED IN s26.5:** the premise does not hold for a CSealCtrl leader.

- **The gated tick** (D:L508649-508660; r1 0x5fb48c-0x5fb51c, the fourth reader's): it copies the leader's stance,
  calls the controller's vtable `+0x88` with flag 0, stores 0 to goal `+0x28`, and returns. No target, no request, no
  state change. With flag 0, `FUN_00567350` (D:L429219-429277) writes the forward and side channels 0, and only a turn
  can be commanded (D:L429121). **It stands in place. It cannot walk the follower anywhere, not even on a direct move
  order still active.**
- **The trail at the order.**
  - It is switched on from the follow tick: `FUN_005fc970` -> `FUN_00546c40(leader, 1, 0x4b)` (D:L509298-509301),
    called at D:L508607, before the gate. `FUN_00546c40` acts only if body `+0x105e` bit 0 is clear (D:L412460).
  - It is switched off only by `FUN_005fcc40` (D:L509375-509400; the call with 0 at D:L509398): follower count below
    1 AND the leader's controller answering 0 at slot `+0x2c`. **For a human-class leader, whose controller answers 1
    at `+0x2c` (research 417 s25.4), it is never switched off.**
  - At switch-on nothing is appended: the append needs a cell that differs from `+0xe8` (D:L471284-471309). **The
    first entry is the first NEW walkable cell the leader enters.** Nine new cells in a line make 8.0.
  - So, on the text's two calls of the enable function (D:L509301 on, D:L509398 off), a human-class leader's trail is
    empty at the first follow of the session, and at any later order it still holds his last 75 cells. **That premise
    is [INF], pending one read** (added 2026-11-12, later): the second reader of research 417 s25 found a trail-enable call that
    the decompilation does not show, a tail jump from slot `+0x40` of the human and remote controllers' vtables
    (research 417 s25.7). Who calls that slot, and when, is unread; if it runs before the first follow, the trail is not empty
    then.
  - **2026-11-12, later: the premise DOES NOT HOLD for a CSealCtrl leader (one reader; s26.5).** The body build calls
    slot `+0x40`, so a locally driven human's trail is on from his body's build, and at a follow order it holds his
    cells since the later of his last placement and his last build (emptied again by a jump or landing online, research 417 s25).
    The sentences above are kept as written; s26.5 restates them.

### 24.4 r0004, and the port

**2026-11-12 -- CORRECTED IN s26.6:** departures 2 and 3 by the leader's class.

**r0004** [V4, this author]:
- the read of `[G+0x76]`: r4 0x00602c1c `lbu v0,118(s4)` (0x92820076), and again at r4 0x00602c58 (0x92820076);
- the clear: r4 0x00602c50 `sb zero,118(s4)` (0xa2800076);
- the set: r4 0x006058a8 `sb a0,118(s2)` (0xa2440076);
- the constant: r4 0x0064f408 = 8.0 (0x41000000), loaded at r4 0x00602c40;
- the length function: r4 0x00528130, `FUN_00527e70`'s twin (84 words, 84 identical, 0 relocated), called at r4
  0x00602c34 `jal 0x00528130` (0x0c14a04c) with a1 = 1 (r4 0x00602c30).

The fourth reader compared the window r1 0x5fb42c-0x5fb48c against r4 0x602c0c: 24 words, 22 identical, 2 relocated,
0 different; `FUN_005fdf80`'s image r4 0x605780: 156 words, 144 identical, 12 relocated, 0 different.

**The port's gate** (`packages/match/src/hostageFollow.ts` on this branch, re-read here):
- `:311-314`: `if (!this.started) { if (trail.length < FOLLOW_RULES_READING.trailStart) { this.stance =
  leader.stance; return; } this.started = true; }`, with `trailStart: 8` at `:52`. It returns before any locate or
  request, and `controlTick` (`:296-308`) then commands zero: it holds in place.
- The count, `FollowTrail.length` (`:141-148`): from index 1, `if (a.map === b.map) n += Math.hypot(...)`. **The same
  rule as the original**: a sub-map change adds 0 and the sum carries on. No departure in the count.
- Armed at construction (`:168`) and in `stop()` (`:247`).

**Three departures, by reading, effect not run** (the head's 6, 7 and 8):
1. **The gate re-armed on a leader change.** The port: `:310` -> `stop()` -> `:247` `started = false`. The original:
   a leader change sets INIT (0) only (D:L509996-509999); `+0x76` is set by event 0 alone (D:L510077).
2. **The trail deleted with the last follower.** The port: `extraction.ts:748` (every frame) and `:642` (a follow's
   end), so every new follow of a leader with no other follower starts from an empty trail. The original never
   switches a human-class leader's trail off (D:L509375-509400), so only the first follow starts empty (on the
   premise of s24.3). For a leader answering 0 at `+0x2c` the original also switches it off, so this is a departure
   only under the ruling that the room stands where the leader's console stands. **It also depends on the 26 words of
   research 417 s25**, which empty that trail online in the function that owns it.
3. **The first entry one cell early.** The port: `extraction.ts:746` adds the leader's current cell on the first
   frame. The original: the first cell that differs from `+0xe8` (D:L471284-471309; unless `+0x1061` bit 6 is set,
   whose writer is unread). The port's gate so opens one cell of leader travel earlier (8 cell changes against 9).

**Restated 2026-11-12, later (s26.6), by the leader's class.** 2 is a departure for a CSealCtrl or CRemoteCtrl
leader and matches the original for an AI or CSealCtrlCopy leader; 3 is restated there. One reader until the second
is in. The text above is kept as written.

### 24.5 The predictions for the two orders of events

**2026-11-12 -- CORRECTED IN s23.3, s26.5, s31, s32:** "slot 0" unsettled; the predictions assume an empty trail; the gate was not holding at 0.42 s with a long trail; it held all run with a short one, measured.

**A PREDICTION from one reading of the gate (the fourth reader's), resting on a likely, UNCONFIRMED reading of where
the traced follow began**: the trace does not state where the hostage stood when ordered. Both cases assume the first
follow of the session on a human-class leader, so an empty trail at the order (s24.3, [INF]).
- **The leader beside the hostage when ordered, then runs up and stands on row 5.** The count passes 8.0 at about row
  75, on the flight, four rows below the top. The gate opens then; the follower, still at (216,84), makes its first
  request to the cell two entries behind the leader and follows. **The gate does not hold the follower at the foot in
  this case.** It would still be shut only if the order was given with the leader already at row 78 or above.
- **The leader already upstairs when the order is given.** The gate sees 0 (no entries; a leader on a non-walkable
  cell appends nothing). The follower stands **where it was ordered**, with the leader's stance, for as long as the
  leader stands; no timer. To open it the leader must enter nine new walkable cells in a line, for example along
  upper-floor row 6 or 7. On opening, a fresh request to the trail cell two behind the leader, on the upper floor, so
  through the link #0 (217,71) <-> #1 (12,8): column 217, whichever way the leader went up.

**What the trace must show for the gate:** `[G+0x76]` = 1 and `[G+0x34]` = INIT (0) through the stand, and no request
(controller `+0x4ec` unchanged). If `+0x76` reads 0 during the stand, the gate is out whatever the positions.

**Restated 2026-11-12, later (s26.5).** Both cases above assume an empty trail at the order, which does not hold for a
CSealCtrl leader. The "leader already upstairs at the order" prediction holds only if his trail was empty or short at
the order. The text above is kept as written.

### 24.6 The hub's record (redotcom-19's statement; facts, no conclusion)

- The second trace had one placement of the leader before the order.
- The follow was ordered by the pad.
- "the leader ran up; the follower first STOPPED AT THE FOOT ... and stood 30 s ... while the leader stood at the
  top".
- MP71's hostages start at #0 (215,81), (216,84) and (213,83) (`t23/routes.out.txt`).
- The stop locates to #0 (219,84) (s21.2), three cells east of the (216,84) start.
- A gate-held follower cannot move (s24.3).

So, as the record stands, the gate does not fit unless the hostage was at (219,84) when ordered, or the order came
after the run up. **Three facts from the existing capture decide:** the follower's position at the order; the time
from the order to the leader reaching the top; and the follower's path from the order to its stop.

### 24.7 The port's what-ifs, and the arm log (F)

**2026-11-12 -- CORRECTED IN s26.7, s31:** the what-if rows restated; the original's fallback arm ran at an order.

**The label, for every line here:** what-ifs under node, modelling a room's match (the port answering the network byte
as 1); the step is one reading of r4 0x594dd0, with the unidentified-list clause modelled as always passing; not the
original, not a rendered browser run, and NOT a fix. Source: `evidence/forge-stim/xs/cells/t21/` (`STATUS.md`,
`out/`), scratch outside git.
- **"The leader already upstairs at the order".** The PORT AS IT IS waits at the hostage's start, (2124.6, 791.8) --
  not at the trace's stop -- (spot-checked here in `out/C.port.c1.217.s13.room.long.txt`: `started false`, trail 0
  points, through t = 29). It then climbs, 100% by column 217, and, with a long enough walk west by the leader, crosses
  without a stop.
- **"Ordered beside the leader, who runs up".** The port's gate opens at t 1.23 s, with the leader at (218,77), and
  the port then pins or stops.
- **The arm log.** In every staircase run, the port's follower took its target from the trail; the fallback arm was
  never reached. The r0004 step's output was byte-identical to the port's. On open ground the step ran 1,123 and 167
  times and changed the cell 0 times. So, in redotcom-19's words, "933's row and the 'wrong build on one arm' row
  become two rows".
- **Restated 2026-11-12, later (s26.7).** The "already upstairs" rows reproduce the trace's shape because the port's
  room starts the trail at the order. The rows "with a trail recorded from t = 0" (t21's `orig` trail) are the
  original's case for a leader who walked up after his last placement without jumping.

## 26. The trail's enable: on from the body's build for a locally driven human [machine code, both builds; one reader, a blind second queued; reading, pending review; NOT measured]

**2026-11-12 -- CORRECTED IN s26.9:** the blind second read is in, and agrees.

Date 2026-11-12, later. **The source.** One reader's listings and scans, `evidence/forge-stim/xs/cells/review14/`
(`listings_a.txt`, `calls_slot40.txt`, `refs.txt`, `refs2.txt`, `slots_1c_2c_34.txt`, `w105e.txt`, `w105e_b.txt` and the
`cmp_*.txt` comparisons), scratch outside git. **ONE READER; a blind second reader is queued.** The 0.6 s placement's
frequency (s26.2) is another reader's, `evidence/forge-stim/xs/cells/review17/` (`side_block.txt`,
`changes_594cf0_from_table.txt`, `scan420_*.txt`), also ONE READER. (2026-11-12, later: the blind second read of
s26 is in, and agrees: s26.9.)

**What this author checked** [V1, V4, with a standard-library decoder, `t28/v.py`]: the build's slot call in both
builds; slot `+0x40` of the five controller vtables in both builds; r1 0x597e80-0x597ea0 and r4 0x59d980-0x59d9a0; the
two enable calls in r1 0x5fc9a8-0x5fc9b8 and r1 0x5fccf8-0x5fcd0c; the placement's two calls of `FUN_00525200` (r1
0x546db4, r1 0x546f10) and its two words; the body vtable's words (r1 0x6691dc, 0x6691e0, 0x6691e8; r4 0x668b5c,
0x668b60, 0x668b68); the call of `FUN_005fcc40` in the local human's tick (r1 0x594e08, r4 0x59a7f8). At the
decompilation: D:L412455-412470, D:L453095-453106, D:L455541-455572, D:L455604, D:L455674, D:L455719, D:L455842,
D:L467141-467144, D:L471317-471325 and the switch-off D:L509364-509404, each opened. Not checked: the bodies of
`FUN_00525210`, `FUN_005e6aa0`, `FUN_005fef60` and `FUN_00573d20`, and which ticks run for a CRemoteCtrl body.

**2026-11-13 -- BUILT (LATER 960, s35):** the port's room now keeps every seated body's trail from its spawn, zeroes
its entries at each placement and never deletes it with the last follower (`LEADER_TRAIL_LIFE_READING`, match
`src/extraction.ts`); s26.6's first two rows are no longer departures for a locally driven leader. Still a reading.

### 26.1 The call at the end of the build

- **The build.** `FUN_00599f00` (its header D:L455715, the signature D:L455719), the body build; r4 0x59fa20, `FUN_00599f00`'s twin (338 words, 297
  identical, 41 relocated). It ends by calling the controller's slot `+0x40` (D:L455842): r1 0x59a28c `lw t9,0(fp)`,
  0x59a290 `lw t9,64(t9)`, 0x59a294 `jalr t9`, 0x59a298 `daddu a0,fp,zero` in the delay slot [V1]; r4
  0x59fdac-0x59fdb8, the same four words [V4].
- **Its two callers** [V1 for the call words; the reader's xref]: creation, `FUN_005999e0` (its header D:L455539, the
  signature D:L455541; the CALL of `FUN_00599f00` at D:L455570, r1 0x599a60; r4 0x59f560); and rebuild in place,
  `FUN_00599b60` (its header D:L455602; its body D:L455604-455711; the CALL at D:L455674, r1 0x599d54; r4 0x59f854).
  D:L455842 is the CALL through slot `+0x40` inside `FUN_00599f00`; no line cited here as a call is a header.
- **Slot `+0x40` by class** [V1; V4]:

  | class (r1 vtable / r4 vtable) | slot `+0x40` | reaches the enable? |
  |---|---|---|
  | CSealCtrl (r1 0x6694b0 / r4 0x668e30) | r1 0x597e80 / r4 0x59d980 | **yes** |
  | CRemoteCtrl (r1 0x669590 / r4 0x668f10) | r1 0x597e80 / r4 0x59d980 | **yes** |
  | CSealCtrlCopy (r1 0x4062d0 / r4 0x432b60) | r1 0x597e80 / r4 0x59d980 | **yes** |
  | CSealCtrlSquirm (r1 0x6699f0 / r4 0x669370) | r1 0x5fef60 (`FUN_005fef60`) / r4 0x606760 | no (the reader's: its calls go to r1 0x5c4b10, 0x5c37b0 and 0x197740 twice) |
  | CSealCtrlAi (r1 0x6693f0 / r4 0x668d70) | r1 0x573d20 (`FUN_00573d20`) / r4 0x5790e0 | no (the reader's: r1 0x1988d0, 0x3520d0, 0x3519f0) |

- **r1 0x597e80** [V1]: r1 0x597e8c `addiu a1,zero,1`, r1 0x597e98 `lw a0,4(a0)` (the controller's body), r1 0x597e9c
  `j 0x546c40` (0x08151b10), r1 0x597ea0 `addiu a2,zero,75` (0x2406004b) in the delay slot: a tail jump into
  `FUN_00546c40`(body, 1, 75). r4 0x59d980, its twin (9 words, 7 identical, 2 relocated), jumps to r4 0x54b7a0
  (0x08152de8). The decompilation has no function at r1 0x597e80 (research 419 s22.12).
- **Every jump to the enable** (the reader's scan of `jal` and `j`): three sites in each build. r1 0x597e9c (this
  one), r1 0x5fc9b4 in `FUN_005fc970` (on, 75: D:L509301) and r1 0x5fcd04 in `FUN_005fcc40` (off, 0, 0x32: D:L509398);
  r4 0x59d99c, 0x6041b4 and 0x604504.

### 26.2 What the enable does, and what empties the trail

- **A second enable does nothing** (D:L412460): `FUN_00546c40` acts on "on" only while body `+0x105e` bit 0 is clear.
  It then sets the bit and calls `FUN_00525210`(trail, 75), which, by the reader's listing, changes the store only
  when the capacity differs. **It never wipes the entries.**
- **The entries are zeroed at every placement of the body, and the enabled bit is kept.** `FUN_00525200` (D:L392488)
  is two words, r1 0x525200 `j 0x5153b0` with r1 0x525204 `addiu a0,a0,152` [V1]: it zeroes the count at trail
  `+0x9c` (r4 0x5153b0 is `jr ra` with `sw zero,4(a0)`, s15.6's addition). Its only callers (the reader's scan; the
  two call words [V1]) are r1 0x546db4 in `FUN_00546cf0` (D:L412512) and r1 0x546f10 in `FUN_00546e40` (D:L412556),
  slots `+0x40` and `+0x3c` of the body's vtable: the words r1 0x6691e0 and r1 0x6691dc, beside slot `+0x48` at r1
  0x6691e8, which holds `FUN_005b7ba0` [V1]; in r4, 0x668b60 holds r4 0x54b850 and 0x668b5c holds r4 0x54b9a0 [V4].
  The writers of `+0x105e` bit 0 are r1 0x546c80 and 0x546cb0 (the enable) and r1 0x554f34 (the reader's scan; the
  third is not read).
- **One placement in the local human's own tick** [D]: `FUN_00594cf0` at D:L453099-453103. When the network byte is
  non-zero and the clock minus body `+0x420` exceeds 0.6, it calls the body's vtable `+0x3c` with the body's position
  (`+0x400`-`+0x408`): a placement, so the trail's entries are zeroed (r1 0x546f10; r4 0x54ba70).
- **`FUN_00594cf0`'s r0004 changes: counted there (+49), read here once.** The r0004 investigation's sweep (the hub's
  evidence, outside git) counts +49 words in it, unread there; review17 read them once. Two counts, not a
  disagreement: the comparison table (research 417 s20.8, change 5) gives "19 runs, r4 span 1688 words against r1 1644", 44 more
  words by SPAN (the function's extent to the next function, padding included); the sweep's +49 is by its own
  counting. They were not reconciled word by word here.
- **How often the 0.6 s placement fires** (review17, ONE READER), in its words: "in ordinary online play the 0.6 s
  placement fires only when no floor-probe hit has been stamped into body+0x420 for more than 0.6 s of the game clock
  while the controller's tick still runs". So it is not periodic. The stamp is written by `FUN_005b0420` at D:L467143
  (`piVar3[0x108] = DAT_004365c0`, opened here) on every frame the body's floor probe hits, so in normal play it is
  about one frame old. By that reader the placement fires once, on the first controller tick after a stretch of more
  than 0.6 s with no probe (control off, a dead body), or on every tick while the probe keeps missing (no floor under
  the body). **In both builds it is behind the network byte** (r1 0x45a0c1 / r4 0x45d481; the second reader's point,
  s26.9), so it is an online placement, not one of r0004 only. **r0004 still places the body there under the same
  test**: the block lies in an unchanged run, the
  network byte at r4 0x59a898-0x59a8a0, the 0.6 test at r4 0x59a8a8-0x59a8c8 with 0x3f19999a, the call at r4
  0x59a8f4-0x59a8f8 (the reader's aligned listing, read here). The placement reaches the count reset unconditionally
  in both builds (r1 0x546f10; r4 0x54ba70). By the reader, the function's 19 changed runs lie elsewhere (a field
  shift, the freeze byte's read becoming a call to r4 0x32a220, a pad flush, a lean guard) and none touches the
  placement. It extends research 254 (lines 87-88, the only note that reads the 0.6 s test) and cites research
  385-392, 217, 230, 313 and 399.
- **The append needs only the enabled bit** (D:L471319-471324, re-read here): no follower, no follow goal.

### 26.3 The switch-off, by class

`FUN_005fcc40` (D:L509364-509404; r4 0x604440, `FUN_005fcc40`'s twin (60 words, 58 identical, 2 relocated)) switches
the trail off (D:L509398) only when the follower count `+0x520` is below 1 and the leader's controller answers 0 at
slot `+0x2c`, and then by slots `+0x34` and `+0x1c`. Its callers are the AI tick `FUN_0056de10` (r1 0x56e890) and the
local human's tick `FUN_00594cf0` (r1 0x594e08 [V1]). By class (the slot answers are the reader's
`slots_1c_2c_34.txt`; `+0x2c` checked in research 417 s25.4):
- **CSealCtrl:** on at build; slot `+0x2c` answers 1, so never off.
- **CRemoteCtrl:** on at build; by the reader, its tick never reaches the switch-off.
- **CSealCtrlCopy:** on at build; slots `+0x2c` and `+0x34` answer 0, so off on the first tick with no follower.
- **CSealCtrlAi and CSealCtrlSquirm:** not on at build; on only by a follow start (`FUN_005fc970`, D:L509301).

**What research 189 and 200 hold.** Research 189 (`189-h1-hostage-ai-animation.md` lines 158, 361 and 492-493) and
research 200 (`200-h5-ai-pathfinding.md` line 427) name only the follow-start enable (D:L509301) and the switch-off
(D:L509398). This section extends them; it does not re-derive their constants.

### 26.4 What a follow order finds in the trail

By this reading (one reader), at a follow order a CSealCtrl leader's trail holds his walkable cells since the later of
his last placement and his last build, up to 75. It is emptied again online by a jump or a landing (research 417 s25), and by the
0.6 s placement (s26.2). The gate (s24.2) opens on the first follow tick if those cells measure 8.0 or more.

### 26.5 s24.3-s24.5 restated (2026-11-12, later; the earlier text is kept in s24)

- **The premise "the trail is empty at the first follow of the session" DOES NOT HOLD for a CSealCtrl leader.** At a
  follow order his trail holds his cells since the later of his last placement and his last build (emptied again by
  a jump or a landing online, research 417 s25).
- **The gate.** It opens on the first follow tick if those cells measure 8.0 or more (s24.2).
- **So the "leader already upstairs at the order" prediction (s24.5) holds only if the leader's trail was empty or
  short at the order:** a recent placement with fewer than eight cells walked since; a jump or a landing (research 417 s25); or
  the 0.6 s placement (s26.2).
- **The trace fact that decides it:** how many new walkable cells the leader walked between ITS PLACEMENT AND THE
  ORDER, and between the order and its stand. redotcom-19 has asked the main controller for it from the existing
  capture.

### 26.6 The port's gate departures, by the leader's class (restating s24.4's 2 and 3; the head's 7 and 8)

| s24.4 | CSealCtrl or CRemoteCtrl leader | AI or CSealCtrlCopy leader |
|---|---|---|
| "the room creates the leader's trail at the first hostage's follow" | **a departure**: the original's is on from the build | matches the original (on at a follow start) |
| "deletes it with the last follower" (`extraction.ts:748`, `:642`) | **a departure**: never switched off | matches the original (off with no follower) |
| "adds the leader's current cell on the first frame" (`extraction.ts:746`) | with the trail on from the build, the leader's cell is normally already entry 0; **the port lacks the older entries** | as s24.4's 3 |

One reader until the second is in. Effect not run.

### 26.7 s24.7's what-if rows, restated

The "already upstairs" rows reproduce the trace's shape because the port's room starts the trail at the order. The
rows "with a trail recorded from t = 0" (t21's `orig` trail) are the original's case for a leader who walked up after
his last placement without jumping.

### 26.8 Not determined

**2026-11-12 -- CORRECTED IN s26.9:** the blind second read is in.

- the second, blind read of this section;
- `FUN_00525210`'s body beyond the reader's listing, and the third writer of `+0x105e` bit 0 (r1 0x554f34);
- which ticks a CRemoteCtrl body runs, on which console;
- whether the traced leader was placed, jumped or landed between his placement and the order (s26.5's trace fact).

### 26.9 The blind second read (review20) [machine code, both builds; read twice where both readers read; its additions one reader]

Date 2026-11-12, later. **The source.** `evidence/forge-stim/xs/cells/review20/` (its listings `r1_599f00.lst`,
`r1_5fc970.lst`, `r1_5fcc40.lst`, `r1_524d50.lst`, the scans `r1_bit105e.txt`, `r4_bit105e.txt`, `r1_vcall40.txt`,
`r4_vcall40.txt`, and its scripts), scratch outside git; a blind second reader of s26, its summary relayed by the
controller. **It AGREES with review14.** Not re-checked here beyond the instructions already checked in s26.

**Read twice (both readers):**
- the enabler r1 0x597e80 / r4 0x59d980 (9 words, 7 identical, 2 relocated), slot `+0x40` of CSealCtrl, CRemoteCtrl and
  CSealCtrlCopy: a tail jump to `FUN_00546c40`(body, 1, 75);
- the enable at creation (`FUN_005999e0`; its call of `FUN_00599f00` at D:L455570) and at rebuild (`FUN_00599b60`;
  its call at D:L455674), through `FUN_00599f00` (its header D:L455715; its slot `+0x40` call at D:L455842);
- the entries zeroed at every placement (`FUN_00525200` from the body's slots `+0x3c` and `+0x40`, D:L412556,
  D:L412512);
- CSealCtrl never disables;
- slot `+0x40` of CSealCtrlSquirm (r1 0x5fef60 / r4 0x606760) and of CSealCtrlAi (r1 0x573d20 / r4 0x5790e0), neither
  reaching `FUN_00546c40` (review20's `vtables.txt` gives all five classes' slot `+0x40`, checked here against s26.1);
- `FUN_00546c40` has exactly three references in each build (s26.1's three sites);
- the r4 26-word insertion of research 417 s25 (now read by three).

**The second reader's additions (one reader each):**
- `FUN_00546c40`'s twin r4 0x54b7a0 counted as 35 words, 33 identical, 2 relocated, by that reader's extent;
- the only run-time disabler is `FUN_005fcc40` (every byte store to body `+0x105e` evaluated: 72 in r1, 74 in r4). By
  class: Ai and Copy disable when body `+0x520` < 1;
- enabling does not wipe; disabling wipes but leaves the capacity, so a re-enable at the same capacity leaves the
  trail's flag bit 2 clear (in the classes that disable only);
- the human tick's conditional re-placement, r1 0x594ea8-0x594f0c, is gated on the byte r1 0x45a0c1 / r4 0x45d481
  being non-zero AND a 0.6 clock difference: so review17's 0.6 s placement (s26.2) is behind the network byte in both
  builds;
- the append does not test for followers.

**Its not-determined list:** not read; no further 933 read from this lane (the main controller's direction,
2026-11-12).

## 27. The port's route requests in #798's scenario, and the jump what-ifs [a log of the PORT's code under node; what-ifs on readings; NOT the original; NOT measured]

Date 2026-11-12, later. **The source.** `evidence/forge-stim/xs/cells/t25/` (`STATUS.md`, `out/held.txt`,
`out/survey.txt`, the per-run logs `out/<path>.<mode>.<jump>.txt`), scratch outside git. The runs import the port from
the worktree of `agent/xs-933-red` at 827f1b1d5; its `hostageFollow.ts` and `hostagePath.ts` are byte-identical to
this branch's (`diff -q`, this author), so the line numbers below hold here. The scenario is the MP71 case of
`hostageLandingPin.test.ts` (#798's RED): the leader a scripted `Walker` through cell centres, the follower one cell
behind, 30 Hz, 20 s (600 ticks). Five leader paths: `base` (up column 218 to tophost (8,6)), `col217`, `stop13`
(stands on #1 (13,5)), `stop10` and `west6`. **What this author checked:** the port lines cited, on this branch; the
logs' REQUESTS, EXTEND, ROUTE ASSIGNMENTS and RESULT lines; ticks 314-350 of `base.port.none.txt`.

### 27.1 The request log -- a log of the PORT's code under node in #798's scenario; not the original

**2026-11-12 -- CORRECTED IN s28:** the original's extension builds the same pair, read twice.

- `realmod` (the repository module unmodified) and `port` (a logging copy) give the same follower trace in all five
  paths.
- **The port's follower never requests a route to a non-walkable target, and never reaches the fallback arm**, in
  any of the five paths: target non-walkable on 0 ticks and the fallback arm on 0 ticks in every per-tick window
  (`held.txt`).
- **The log's facts on the pin**, stated without interpretation (`base`):
  - one follow request per run, at tick 51 (`hostageFollow.ts:495`): from #0 (218,83) to #0 (218,76), answered with 3
    nodes. The other requests are recoveries (`:436`/`:438`), at ticks 223, 426 and 561, each from #0 (218,71) to #1
    (13,7), answered through the link: [#0 (218,71), (218,72), (217,71) L, #1 (12,8) L, #1 (13,7)], then twice
    [#0 (218,71), (217,71) L, #1 (12,8) L, #1 (13,7)];
  - the extension (`:521-522`) at tick 91 (route end #0 (218,71), here #0 (218,78), target #1 (13,6)) produced
    [#0 (218,76), #0 (218,72), #0 (218,71) L, #1 (13,7) L, #1 (13,6)]. **#0 (218,71) is followed directly by #1 (13,7),
    a pair not in the link list**: MP71's only link at the landing is #0 (217,71) <-> #1 (12,8) (`survey.txt`);
  - the held ticks on #0 (218,71): 137-277, 309-316, 348-455 and 484-590 (the longest 141), with the route [#1 (13,7)
    L, #1 (13,6)];
  - after each recovery the follower goes through the link and returns onto (218,71). After the second: ticks 317-347
    on #0 (217,71); the link points consumed at ticks 318 and 320; standing at (2138.31, 218.73, 664.79) from tick 319
    to 335; then north-east toward #1 (13,7); at tick 348 it is at (2139.70, 222.00, 659.93) and located on #0
    (218,71); at tick 349 its z is 661.81;
  - no held ticks with the leader up column 217 (`col217`), or with the leader stopping on #1 (13,5) (`stop13`);
    `stop10` and `west6` hold as `base` does.
- "Whether the original's extension builds the same pair, and what its walker does with it, is being read
  (`FUN_0052bdf0`; one reader started)." **Answered 2026-11-12, later, by that one reader: s28.**

### 27.2 The refused request: departure 10, which these runs never reach

- **The port** (this branch): `register` returns null when any point is not walkable (`hostagePath.ts:496`). The follow
  tick has already cancelled the old request and emptied the route (`hostageFollow.ts:494`) before it registers
  (`:495`). An empty or refused answer sends it to COVERING (8) (`:504`), and the wait returns it to INIT (0) (`:485`).
- **The original:** a non-walkable target leaves the route object untouched (r1 0x5625a0, s23.2 (a)); an older
  finished route is then walked in FOLLOW (3); only with none does WAIT (2) go to COVERING (8).
- **A departure by reading, numbered 10 in the head.** The runs of s27.1 never request a non-walkable target, so they
  never reach it.

### 27.3 The jump what-ifs -- a what-if on readings; a room's match modelled; not a fix

**2026-11-12 -- THE TRIGGER MODELLED HERE IS NOT THE MEASURED ONE (the hub's review; research 417 s25.10):** these
what-ifs reset the trail "when the leader enters a new walkable cell during a jump's frames"; the rig's scenario D
shows the reset one frame after the jump begins, in the starting cell. "Changes #798's verdict in no row" is unproven
under the measured trigger.

**The label, for every line here** (t25's): the 26 words of research 417 s25 modelled as a trail reset when the leader enters a new
walkable cell during a jump's frames; r4 0x594dd0's step (research 417 s20) modelled on the fallback arm, with the unidentified-list
clause modelled as always passing; a room's match (the network byte 1); headless node, not a rendered browser run,
not the original, no capture. The jump is the port's own running jump; in two rows its carried velocity takes the
scripted leader off his waypoints, so his path differs by run. Measures: (b) and (c) as s18.1; #798's verdict is the
hold on #0 (218,71).

| the leader's jump | the port as it is (the jump alone) | the what-if (trail reset + the r0004 step) | #798's verdict |
|---|---|---|---|
| none | held 141 ticks; (b) NO, 0% in 217; (c) NO | identical: the same trace, a byte-identical log | held in both: unchanged |
| at row 74 | identical to none (held 141) | held 108 (runs 228-335, 366-473, 504-599); (b) YES, 100% in 217; (c) NO; fallback arm on 22 ticks | held in both: unchanged |
| on the landing, up 218 | held 141 | held 109; (b) YES, 100%; (c) NO; fallback arm 64 ticks, target non-walkable 9 | held in both: unchanged |
| on the landing, up 217 | held 0; (b) NO, 61%; (c) YES | held 0; (b) YES, 100%; (c) YES; fallback arm 61 ticks, target non-walkable 1 | not held in either |
| on the upper floor | held 140 | held 109; (b) YES, 100%; (c) NO; fallback arm 52 ticks, target non-walkable 31 | held in both: unchanged |

A jump at row 78 falls before the follow starts in this scenario (tick 25 against tick 51), and the what-if's leader
then ends on #0 (218,73); that row is not comparable and is left out.

**The conclusion, as the agent states it:** the trail reset plus the r0004 step shortens the hold a little and
changes #798's verdict in no row the port fails.

## 28. The route extension at a sub-map seam: the original and the port [read, r0001 source and machine code; port source; one node run of the port's planner; read twice (the second, blind, in s28.8); reading, pending review; NOT measured]

> **2026-11-12, later: read twice.** A blind second reader (review18) agrees with the first (s28.8): the route's
> shape is excluded as the cause of the port's pin by two readers.

Date 2026-11-12, later. **The source.** One reader, `evidence/forge-stim/xs/cells/review15/` (the listings
`r1.52bdf0.dis.txt`, `r1.526f20.dis.txt`, `r1.526540.dis.txt`, `r1.526380.dis.txt`, `r1.5267a0.dis.txt`,
`r1.524760.dis.txt`, `r1.527470.dis.txt`; `mc.out.txt`; `extend_stages.out.txt`), scratch outside git. The reader's
report text (its departures, its conclusion and its "not determined") is **relayed by the controller from the reader's
report; the listings are in review15**. Its scope, in its words: "r0001 decompilation and bytes for the original, the
main checkout for the port (c6a72241d), one node run of the port's planner on MP71; no run of the original exists for
this scenario." **What this author checked:** every port line cited, on this branch; at the decompilation
D:L392630-392635, D:L393172-393176, D:L393336-393344, D:L396048-396076, D:L396094-396099, D:L429554-429568,
D:L429694-429713, D:L429896-429913, D:L431290-431306 and D:L508927-508931, opened; in the bytes [V1] r1
0x568b90-0x568bd4 and r1 0x568434. The rest is the reader's.

**Its first line:** "the original's extension would build the node pair #0 (218,71) -> #1 (13,7) from this trail".

### 28.1 The original's extension

**2026-11-12 -- CORRECTED IN s28.8:** a fourth precondition: the trail's own flag bit 2.

- **`FUN_0052bdf0`** (D:L395986-396162; r1 0x52bdf0-0x52c30c) has five modes by the reader: an end equal to the goal;
  a one-node route overwritten with the goal (D:L396050-396075); the direct append on the same sub-map; the trail walk
  (D:L396096-396151; r1 0x52c110-0x52c2bc), which needs the trail attached (route `+0x10`) and enabled (`+0x1c` mask
  8) and both ends matched on the trail (D:L396097-396099); and failure.
- **`FUN_00526f20`** (D:L393306-393372) appends a trail cell on the other sub-map directly and opens a new leg
  (D:L393351-393358). Its callees (`mc.out.txt`) are vector and bounds helpers; **no link or graph routine is among
  them.** Its duplicate test compares x and z only, against the route's end (D:L393338-393343).
- **The re-leg `FUN_00526540`** (D:L393114-393166) inserts, drops, marks and refuses nothing; smoothing is per leg only
  (`FUN_00526380` -> `FUN_00525810`, s11.2).
- **The spliced pair carries NO link flag in the original.** The flag is the `| 2` at a change of sub-map in
  `FUN_00525520` (D:L392632-392634), and `FUN_00525520` is called only from `FUN_005267a0` (D:L393175; one `jal`, r1
  0x5267b8, by the reader's scan), at a plan's finalise. The spliced nodes keep flag byte 0.

### 28.2 The original's walker with a next node on another sub-map that is not a link

- **Distance.** `FUN_0052c320` (D:L396275-396330) measures cells through sub-map 0's grid by the centres' x and z
  (s10.3, s11.3).
- **Aim.** At the node's world x and z with y zeroed (D:L431299-431304, in `FUN_0056c080`).
- **The pops**, in the walker `FUN_00567900`:
  - reached by cell: distance 0 pops (D:L429568 false -> D:L429907-429913; r1 0x568434);
  - the width corridor (D:L429697), which cannot fire for spliced points (width 0);
  - planar d < 5.0 (D:L429705 -> D:L429897-429903; r1 0x6501b8 = 5.0; r1 0x568b90-0x568bd4);
  - the dot flip with a cell distance below 2 or `FUN_0052cc80` (D:L429706-429712);
  - the body's recorded cell `+0xe8` becoming the node's (D:L429908).
- **The throttle** (D:L429556-429567): 0 for the final node or flag bit 0, 0.35 for flag bit 1, otherwise the
  controller's `+0x1c4`.
- **For a body on #0 (218,71) with next node #1 (13,7):** #0 (218,71)'s centre is (2144.579, 661.809) and #1 (13,7)'s
  is (2144.579, 651.809): dx 0, dz -10.0. #1 (13,7) converts to #0 (218,70), cell distance 1. The walker steers due
  north and pops when the planar d falls below 5.0 (z below 656.81), when `+0xe8` becomes #1 (13,7), or on a dot flip.
  **"No walker line stands the body or refuses the pair."**

### 28.3 The comparison rows (the table's, research 417 s20.8)

- r4 0x52ef10, `FUN_0052bdf0`'s twin (328 words, 317 identical, 11 relocated);
- r4 0x56cc40, `FUN_00567900`'s twin (1804 words, 1651 identical, 153 relocated);
- r4 0x52f440, `FUN_0052c320`'s twin (164 words, 161 identical, 3 relocated);
- r4 0x524a20, `FUN_00524760`'s twin (72 words, 72 identical, 0 relocated);
- r4 0x526800, `FUN_00526540`'s twin (152 words, 147 identical, 5 relocated);
- r4 0x5271e0, `FUN_00526f20`'s twin (248 words, 245 identical, 3 relocated);
- r4 0x526640, `FUN_00526380`'s twin (52 words, 47 identical, 5 relocated);
- r4 0x525ad0, `FUN_00525810`'s twin (276 words, 263 identical, 13 relocated);
- r4 0x527730, `FUN_00527470`'s twin (16 words, 14 identical, 2 relocated).

All relocations only. The reader did not decode r0004.

### 28.4 The port

- **`extend`** (`hostagePath.ts:586-616`): the direct append fails across sub-maps (`:594`); the trail walk appends
  the trail's cells as they are, so the pair #0 (218,71) -> #1 (13,7) comes from `:603-605`; smoothing is per same-map
  run (`:609-614`); `flag` (`:615`) marks both seam nodes `link`. The reader's node run of the stages
  (`extend_stages.out.txt`) gives [#0 (218,76), #0 (218,72), #0 (218,71) L, #1 (13,7) L, #1 (13,6)], identical to the
  real `extend`, and "seam pair ... in the link list false".
- **No link validation on either side.**
- **Why the follower returns onto (218,71)** (ticks 317-349 of the log, s27.1): after the link the next node is #1
  (13,7), north-east of (217,71); heading for it the body crosses x 2139.58 into column 218 while z is still above
  656.81, so it is located on #0 (218,71) again (tick 348, z 659.93), and its z is 661.81 a tick later.

### 28.5 Seven departures by reading (the reader's; relayed; port lines verified on this branch)

**2026-11-12 -- CORRECTED IN s28.8:** the trail walk's four preconditions; the trail's flag bit 2 is not among departure 4's terms.

Each is marked as the reader marks it: **not consistent with causing the hold.**

| # | the original | the port | consistent with causing the hold? |
|---|---|---|---|
| 1 | spliced nodes carry flag byte 0; the link flag is written only at a plan (D:L392632-392634, D:L393175; one `jal` at r1 0x5267b8), so the seam pair is walked at follow throttle | `flag` at `hostagePath.ts:615` marks both seam nodes `link`; 0.35 at `hostageFollow.ts:566`, `hostageSteering.ts:58` | No: it changes speed, not whether the body passes |
| 2 | reached by cell: converted distance 0, or raw x/z equal (D:L429513, D:L429568-429581, D:L396275-396330) | `same()` with the map (`hostageFollow.ts:529`) | No: for #0 (218,71) against #1 (13,7) neither side pops. It does differ after the link: the original pops #1 (12,8) in the frame the body enters (217,71); the port two ticks later, by radius |
| 3 | the passing test uses the converted distance, 1 (D:L429708) | the raw distance, 269 (`hostageFollow.ts:540`, `hostageSteering.ts:26-28`); already s10.3 | No: the dot never flips for a body held short of the node |
| 4 | the trail walk needs the trail attached at the last INIT (0) request as well as bit 3 (D:L396097, D:L508805-508813) | only the current `trail.contains(here)` (`hostageFollow.ts:521`) | No: the port's follower was on the trail throughout |
| 5 | a one-node route overwritten with the goal returns 0, so a replan follows within 7 cells (D:L396050-396075; r1 0x52c018-0x52c03c) | returns [goal], no replan (`hostagePath.ts:591`) | No: the held route has 2 nodes |
| 6 | the extension is gated on not being near the target (D:L508929) | no such term (`hostageFollow.ts:520`) | No |
| 7 | the append's duplicate test is x/z only against the route end (D:L393338-393343) | `same()` with the map (`hostagePath.ts:605`, `:607`) | No |

"The same on both sides: the route `extend` builds, the absence of any link check, the aim point, the 5.0 radius, the
raw-distance gate, and the pop order after a recovery."

### 28.6 The conclusion, in the reader's words

"None of the extension's or walker's departures is consistent with being the cause of the hold. By reading, the
original builds the same pair and its walker steers the same 10 units north. The log's facts -- feet fixed at z
661.81, y 220.76, and the tick 348 -> 349 return from z 659.93 -- are consistent with the motion layer's AI-map
correction on a cell whose northern neighbour #0 (218,70) is class 0 (hostageFollow.ts:594-603). That is 404 s12.3's
finding and outside this read. Consistent with, not proved."

(On this branch the correction is `hostageFollow.ts:593-599`, and the glide that applies it `:603`.)

### 28.7 Not determined (the reader's)

**2026-11-12 -- CORRECTED IN s28.8:** the trail flag's writer, `FUN_00525210`.

- whether the original's body on #0 (218,71) can cross z 656.81 (the correction's enable bit and the locate); a
  per-frame read of a following hostage's body `+0x1c`, `+0xe8` and controller `+0x171` on that landing settles it;
- whether the original's leader trail holds #0 (218,71) directly before #1 (13,7) on r0004 online;
- whether the trail was attached (route `+0x10` non-zero) at the follower's last request;
- the writer of the trail's own flag (`+0x1c` mask 4);
- `FUN_0056a130`'s behaviour for a node on another sub-map, and `FUN_0054f6e0`'s body states;
- `FUN_005390b0`'s callback (it rests on research 333 s2);
- indirect calls to `FUN_00525520`, which a `jal` scan does not exclude;
- r0004, not decoded by the reader (the table's rows are cited).

### 28.8 The second reader (review18), and the disc read of the node (t29)

**The source.** `evidence/forge-stim/xs/cells/review18/` (its `mc_*.txt` listings and `callees_*.txt`), scratch outside
git; a blind second read of the off-link pair, its summary relayed by the controller. **It AGREES with s28.1-s28.6**, in
its words: "The trail walk appends #1 (13,7) then #1 (13,6) (the goal); at the change of sub-map it appends the cell
directly." **What this author checked:** D:L392522-392534 and D:L508922-508926 opened; `t29/cell.out.txt` read. The rest
is the reader's.

**The second reader's additions:**
- **The trail walk's four preconditions:** the route's flag bit 3; the route's trail pointer `+0x10`; `FUN_00524760`
  matching both the route's end and the goal; and the trail's own flag bit 2, set by `FUN_00525210` (D:L392531,
  within D:L392524-392532) when `FUN_00546c40` enables the trail (D:L412455-412468, s26.2). (The same lines set byte
  trail `+0x80` to 4, research 417 s25.3; review20 reads both stores there, with `+0x94` = n.)
- **The state-3 call's condition** (D:L508924-508931): not arrived, E != 0, and S <= 10 or E >= 15, on raw indices
  (E the end's distance to the target, S the follower's to the end).
- **An appended point's width and flag bytes are 0.**
- **No test refuses, clears or re-plans for an off-link next node on the common path.**
- **The walker's four pop sites** (as s28.2): distance 0; the width corridor; planar d < 5.0; the dot flip.
- **Not determined by it:** #1 (13,7)'s bit 7 and marker type; the full planner behind `FUN_005623b0`.

**The first of those, settled by a disc read** (`evidence/forge-stim/xs/cells/t29/cell.out.txt`, the disc through the
repository's reader; one agent's run): MP71 #1 (13,7)'s cell word is 0x81c7fe01, type 1, bit 7 clear, with no marker
record (s2's table has the same word). So the walker's marker dispatch does not run on that node, and there is no 0.75
shift. #0 (218,70) is type 0 (0x81e3e200).

## 29. The second trace's measured column, and the derivation t30 [measured (the x), relayed; a derivation on the port's locate (the freeze); what-ifs under node; NOT a reading of the original]

**2026-11-12 -- A NUMBER HERE IS NOT IN THE HUB'S RECORD (the hub's review):** "measured x 2150.98 to 2151.95 over 82
samples" does not appear in the hub's record of that trace, which gives the leader "up COLUMN 219 (x ~2149.6), rows 82
to 71" (0.02 from the 218|219 boundary this note gives) and has 2151.95 as the stand point at y 222; the record also
says its cells are by research 175's mapping, not the game's own. The consequence is limited: s31's run A measured the
freeze directly.

**2026-11-12 -- CORRECTED IN s31, s31.7, s32:** the #0 (219,84) target failed; the trail at the order held the spawn cell in the rig's runs; the port's hold is probably the trail's life; the gate is armed at an order, measured.

Date 2026-11-12, later. **The line** (redotcom-19's ruling, in its words): "the premise 'the leader climbed column 217
or 218' does not hold for the second trace (measured x 2150.98 to 2151.95 over 82 samples, column 219 by the same
origin: the 218|219 boundary is x 2149.579); the candidate is re-opened by a derivation on the PORT's locate (evidence
cells\t30), not by a reading of the original; the rig's two runs decide." s21.3 and s23.5 carry it at their heads.

**The trace's facts, as relayed** (measured, n = 1; the record is not on this host): the follow was ordered as s24.6
records; the leader climbed at x 2150.98-2151.95 (82 samples), column 219; the follower started at +4.70 s, stopped at
(2150.9, 179, 794.47) = #0 (219,84), and last moved at +11.81 s; the leader's stand was at x 2149.76.

**The derivation** (`evidence/forge-stim/xs/cells/t30/`, `STATUS.md`, `PREDICTION.md`, `step1b.out.txt`,
`step2.out.txt`, `out/`; scratch outside git; on the PORT's locate, research 335 s2's reading, over the disc's MP71
data):
- At x 2150.98-2151.95 the port's locate puts rows 83-71 on #0 (219,r), class 0, so the leader's recorded cell `+0xe8`
  and the trail freeze at #0 (218,83) (a derivation; s21.6's recorder as read).
- Only slot 0 with a north heading puts the target at the foot: #0 (219,84), 4.55 from the traced stop, within the
  arrival radius 18.75 (s16.1). "Slot 0" is unsettled (s23.3).
- **The port under node, four rows** (x 2151.95 and 2144.6, the port as it is and with the last-walkable cell): it
  never stops at the foot, because its START GATE holds it at its start (x 2151.95: the gate never opens, trail 3
  entries / 2.00) or it climbs column 218 (x 2144.6).
- The corrected-recorded-cell what-if (the last walkable cell, departure 5) changes nothing in any row.

**The gate not armed -- a what-if under node, two rows** (`t30/out/run.G-A.2151.95.txt`, `run.G-B.2151.95.txt`), on
s24.1's reading, whose precondition is not determined. **The harness-side condition:** in the harness only (`run.mts`)
the follower's `started` was set true and its leader id set before the first step. That skips the start gate at
`hostageFollow.ts:311-314` (the "trail under 8: return" test) and keeps the leader-change stop at `:310` from re-arming
it at `:247` (lines checked on this branch). No line of the port's follow code was changed. **Result:** BOTH rows wait
at the foot, tick for tick (G-B adds the last-walkable cell, and changes nothing). The port as it is stops at #0
(219,84), (2151.15, 179, 792.35), 2.13 from the traced stop, in HIDE (7), from 6.23 s to the run's end; its first
release is at 4.60 s (the trace: 4.70 s). This is consistent with the trace under ONE assumed condition, for the stop,
the stand and the first release; it is not, for the early shuffle at 0.20 s, the arrival time (6.23 s against 11.81 s)
or the later climb. **If the rig shows the gate not armed at a hostage's order, the traced wait and #798's pin are two
different things.**
- **`PREDICTION.md`** was written 2026-11-12T10:40:12Z, before the rig's follow runs, with what would falsify it.

**What this is:** the stop and the stand are consistent with the trace under one assumed condition (the gate not
armed). **Not consistent:** the early shuffle; the arrival time (6.23 s against 11.81 s); and nothing here bears on the
later climb by column 217.

## 30. The rig's memory reads before any follow (r0004, MP71, two consoles) [measured, n = 1 (the rig, 2026-11-12), relayed]

Date 2026-11-12, later. **The source:** the rig's reads on r0004, MP71, two consoles, memory reads before any follow,
relayed to this lane; the record is not on this host. Every address here is r4.

**(a) The door markers are bound.** The six records' u32 at `+4` after the load, identical on both consoles, beside the
disc's words (`t23/routes.out.txt`), in file order:

| marker | the disc | after the load | id | the bound door |
|---|---|---|---|---|
| #0 (238,45) | 0x408ffff2 | 0x40800012 | 1 | door_ft_3 |
| #0 (251,65) | 0x008ffff0 | 0x00800030 | 3 | door_ft_6 |
| #0 (223,83) | 0x008ffff4 | 0x00800044 | 4 | door_rg_1 |
| #0 (217,65) | 0x008ffff4 | 0x00800004 | 0 | door_ft_2 |
| #1 (10,4) | 0x008ffff4 | 0x00800024 | 2 | door_ft_5 |
| #1 (15,24) | 0x008ffff6 | 0x00800056 | 5 | door_rg_2 |

- Ids 1, 3, 4, 0, 2, 5: exactly the prediction of the binder's two blind reads (research 418 s22.10). In all six only bits 4-19
  changed (checked here word by word); bit 30 of the first is the file's own (its meaning is not read).
- The action list: 0 door_ft_2, 1 door_ft_3, 2 door_ft_5, 3 door_ft_6, 4 door_rg_1, 5 door_rg_2, 6-8 set_access1-3,
  9-11 set_plank1-3; every state 0.
- **So the binding is measured.** Research 334 s14's "no action answers a marker" (`FOLLOW_ACTION_BIND_PLACEHOLDER`)
  is contradicted by the original running. The constant and research 334 are not this branch's to change. What a
  follower does at a shut door is still a reading (research 418 s22.11).

**(b) The controllers' classes** (research 417 s25.4, s15.3a): the hostages' controllers are r4 0x668d70 on the leader's console
and r4 0x668f10 on the host's copies; the own player's is r4 0x668e30; the other player's copy is r4 0x668f10. So a
remote human is CRemoteCtrl, r4 0x668f10, NOT the r4 0x432b60 that the earlier inference had (s15.3a).

**(c) The bytes and pointers** (s15.6): byte r4 0x45d481 = 1 on both consoles (the network flag, as the readings
assumed); byte r4 0x66a9b8 = 0 and byte r4 0x66a980 = 0 on both; the words at r4 0x435618 and r4 0x44d648 hold the
SAME pointer, a body.

## 31. The rig's follow 1: two runs on the original, against the prediction and the port [measured, n = 1 (the rig's rows); derivations and port runs under node (the comparison)]

Date 2026-11-12, later. **The sources.** The rig's rows are RELAYED MEASUREMENTS: r0004, MP71, the leader's console,
n = 1 each; no pause but one snapshot about 0.42 s after the order; the rig never saw the prediction. Everything else
is ours, a derivation or a port run under node, from `evidence/forge-stim/xs/cells/t30/` (`COMPARISON.md`, written
2026-11-12T11:15:50Z; `PREDICTION.md`, 10:40:12Z, unchanged; `step6.out.txt`; `out/run.G-A.2144.6.txt`; `STATUS.md`),
scratch outside git. Cells are (sub-map, x, z). In both runs the leader stood 45 s at the top and then walked back down.

### 31.1 The rig's rows (measured, n = 1 each)

**Run A, the leader up column 219 (x about 2151.9).**
- Raw cell (0,218,84) -> (218,83) -> (219,83) ... (219,71) [t 5.52-7.84 s] -> (1,14,7), (1,14,6), (1,14,5).
- RECORDED cell (0,218,84) -> (0,218,83) at t 5.52, then FROZEN at (0,218,83) through the whole climb, jumping to
  (1,14,7) at t 8.07, then (1,14,6). During the stand: raw (1,14,5), recorded (1,14,6).
- Trail count 3 -> 4 at (218,83), 5 at (1,14,7), 6 at (1,14,6), 6 through the stand.
- The follower moved t 4.04-9.79 s to (2141.9, 179, 785.7) at the foot and stood all 45 s, bit 7 clear in every stand
  frame; it moved again only when the leader came back down (t 54.75).
- The goal right after the order: state 2; [G+0x76] = 0; [G+0x78] = 1; target cell (0,125,147) / (1214.58, 47.00,
  1421.81), the leader's spawn from before the placement; route state 2, 0 points; trail count 3.

**Run B, the leader up mid-218 (x 2144.6-2145.4).**
- Raw and recorded identical every frame, (218,84) ... (218,71) [t 4.50-6.95 s], then (1,13,7), (1,13,6); no freeze;
  trail count 2 -> 17.
- The follower walked to (2130.2, 179, 808.2) by t 5.65 and stood; at t 8.56 it climbed, to (2145.0, 210.9, 676.2) at
  t 14.31 -- on the flight, about row 73, below the landing -- and stood about 39 s to t 53.18, bit 7 clear in all 1,361
  stand frames, the leader standing at (2144.3-2145.4, 222, 641.4-642.4) on (1,13,6). It never crossed the seam, and
  followed the leader down afterwards.
- The goal right after the order: state 3; [G+0x76] = 0; [G+0x78] = 0 (the fallback arm); [G+0x7d] = 1; target
  (0,220,87) / (2159.71, 179.00, 817.01); route state 4, 2 points (0,220,87), (0,214,84); trail count 2.

### 31.2 The prediction, line by line (`COMPARISON.md` s1; our marks)

- **Held:** the recorded cell freezing at (0,218,83) while the raw cell walks column 219; its jump to (1,14,7), then
  (1,14,6); raw (1,14,5) and recorded (1,14,6) at the stand; trail[2] at run B's stand = #0 (218,71).
- **Held in kind:** the counts (one step fewer than predicted: (218,84) was already recorded); the stand at the foot
  until the leader's recorded cell moves (HIDE was not measured); run B's crossing cells (1,13,x) for the predicted
  (1,14,x).
- **FAILED:** the #0 (219,84) target. It assumed (217,84) was entry 2; at the order the real entry 2 was the spawn
  cell. "It climbs the flight; it does not stop at the foot" (run B) FAILED IN PART: the follower stood near the foot
  through the leader's climb, and then STOPPED ON THE FLIGHT, which the sentence did not say. The port's own node row
  for x 2144.6 DID show that stop: **the port's run predicted the original better than the reading's sentence did.**
- **The premise "the trail is emptied at the landing" FAILS for these runs:** the rig's placement was a memory write,
  not the game's placement call, and the trail at the order held the spawn cell. For the earlier trace (s29) it is not
  known; s29's port rows, which start the trail empty at the order, rest on that premise.

### 31.3 Run B's stop (a derivation, `step6.out.txt`)

The rig's stop is 17.38 from #0 (218,71)'s centre (dx 0.42, dy -9.73, dz 14.39): inside the 18.75 arrival radius.
With slot 0's sideways step, by the leader's heading: north and west leave #0 (218,71) (17.38); east gives #0 (218,73)
(6.81); south gives #0 (217,71) (20.26, outside). The port's row entered HIDE (7) 18.51 from its target. So "it stops
where it first comes within 18.75 of a target two trail entries behind a standing leader" holds in the port and fits
the rig under a north or west heading: **consistent with, n = 1**, for the 18.75 radius (s16.1); its level is not
raised. HIDE itself was not measured on the rig (bit 7 clear and the stand were).

### 31.4 The start gate: a measured departure of the port, and what is not determined

**2026-11-12 -- CORRECTED IN s31.7, s32:** the port still holds a follower at the order; the gate is armed at an order and holds under a short trail, measured in follow 2: resolved.

- **Measured:** [G+0x76] = 0 right after the order in both runs.
- **The limit** (`COMPARISON.md` s3): run A's trail at the order ran from the spawn cell to (218,84), length at least
  112.3, so by s24.1-s24.2 a NEW goal's gate would clear on its first tick: +0x76 = 0 there fits both a new and a
  reused goal. Run B's trail count was 2, its second entry not relayed.
- **So:** in neither run was the gate holding the follower at 0.42 s after the order (measured); the port holds a
  follower at a hostage's order while its own trail is under 8.0 (`hostageFollow.ts:311-314`). Whether the original's
  gate was never armed (goal reused, no event 0) or armed and cleared at once by a long trail is NOT DETERMINED by
  these two snapshots: run B's second trail entry, or both runs' trail lengths at the order, would settle it.
  redotcom-19 reads it as not armed, and the hub has a row for it.
- **The earlier trace (s29):** its follower moved at +4.70 s with a short trail IF the landing emptied it; that premise
  is itself in doubt now, for a placement by memory write.

### 31.5 The original's two stops beside the port's (`COMPARISON.md` s4; the gate-not-armed rows are what-ifs, under the harness-side condition of s29)

| run | row | stop | state | stop time | first move | to the original's stop |
|---|---|---|---|---|---|---|
| A | the original (measured) | (2141.9, 179, 785.7) #0 (218,83) | not measured | 9.79 | 4.04 | -- |
| A | the port as it is | never leaves its start (2095.63, 179, 781.75): the gate holds all run | -- | -- | -- | 46.44 |
| A | the port, gate not armed | (2151.15, 179, 792.35) #0 (219,84) | HIDE (7) from 6.23 | 6.23 | 0.20 | 11.39 |
| B | the original (measured) | (2145.0, 210.9, 676.2) #0 (218,72) | not measured | 14.31 | stood at (2130.2, 179, 808.2) by 5.65; climbed from 8.56 | -- |
| B | the port as it is | (2144.44, 210.28, 677.15) #0 (218,73) | HIDE (7) from 11.13 | 11.13 | 5.97 | 1.27 |
| B | the port, gate not armed | (2144.53, 210.31, 677.11) #0 (218,73) | HIDE (7) from 10.47 | 10.47 | 0.20 | 1.18 |
| A | the port, gate as it is, the trail fed before the order (added 2026-11-12, later; s31.7) | (2143.99, 179, 790.79) #0 (218,84) | HIDE (7) from 8.40-8.43 | 8.80 | 1.03 | 5.50 |

- The original's run-B first stand at (2130.2, 179, 808.2) is 30.80 from the fallback target (0,220,87): outside
  18.75, so arrival does not explain it. NOT DETERMINED.
- **The fallback arm DID run at an order with a trail of 2** (run B, [G+0x78] = 0, measured). So LATER 957's online
  step on that arm (research 417 s20) is not hypothetical.

### 31.6 What it does and does not say about #798

**2026-11-12 -- CORRECTED IN s32:** scenario C compared: the original crosses without a stop, the port pins.

It says: in the original a follower stands on the flight about a cell and a half short of the top while its leader
stands still upstairs (measured, n = 1); the port, in its own run, stops there too. It does not say anything about the
port's pin with a leader who keeps walking: that is not yet compared (scenario C). The line is carried into s15.7.

### 31.7 With the trail on before the order: a what-if, run B's agreement, and run B's first stand (2026-11-12, later) [a what-if under node (the trail-on row); measured, n = 1 (the rig's values it is compared with)]

**The source.** `evidence/forge-stim/xs/cells/t30/COMPARISON.md` s5 (appended 2026-11-12T11:26:37Z),
`out/run.T-A.2151.95.txt`, `grid84.out.txt`, `out/run.A.2144.6.txt`; scratch outside git.

**The port's trail life** (redotcom-19's reading of the port, checked here on this branch): in
`packages/match/src/extraction.ts` the leader's trail is created EMPTY (`new FollowTrail()` at `:742`, within
`:737-742`) only once a living hostage has that leader; `:746` adds his current cell; `:748` deletes it when no hostage
follows him. So the port's trail holds nothing from before the order, where the original's is on from the body's build
(s26, read twice) and, in the rig's run A, held everything back to the spawn cell (s31.2).

**The trail-on row -- a what-if under node, ONE assumed condition; the walk-in path is the harness's own, not the
rig's.** Run A's scenario, the port's start gate LEFT AS IT IS, the leader's trail fed before the order with his walk-in
(#0 (209,79) to #0 (209,84), then #0 (210,84) to #0 (217,84): 14 entries, length 13.00, newest #0 (217,84); row 84 from
the west is cut by class-0 cells at x 207-208, `grid84.out.txt`). Result: the gate opens on the first tick; FOLLOW at
0.03 s, first move 1.03 s (the original's: 4.04 s); HIDE (7) at #0 (214,84) from 2.30 s; released at 4.60 s when the
leader enters #0 (218,83); HIDE (7) from 8.40-8.43 s, settled at (2143.99, 179, 790.79) by 8.80 s (the original's stop:
9.79 s), its target #0 (218,83) = trail[2] throughout the stand; it stands to the run's end. **Its stop is 5.50 from the
rig's run-A stop** (2141.9, 179, 785.7), against 11.39 for the gate-skipped row and 46.44 for the port as it is (s31.5,
its seventh row); its stop cell is #0 (218,84), not #0 (218,83). **This is consistent with the trail's life being the
departure and the gate being fine**, and no stronger. **Not consistent:** the early first move, and the first HIDE at
#0 (214,84): the original stood until 4.04 s. "The port holds a follower at the order" stays true (s31.4); what this
row changes is its stated cause: probably the trail's life, not the gate's rule.

**Run B's agreement** (redotcom-19's words): the port as it is stopping 1.27 units from the original's stop on the
flight is the strongest agreement between port and original measured in this lane's work on 933. Its limits: one run;
the port's leader is kinematic on the relayed path; HIDE in the original was not measured, only the stand.

**Run B's first stand, NOT EXPLAINED.** The original stood at (2130.2, 179, 808.2), 30.80 from its fallback target
(0,220,87), through the leader's climb (5.65 to 8.56 s). The port as it is, in the same seconds (`out/run.A.2144.6.txt`):

| t (s) | the port | its state | from the original's stand |
|---|---|---|---|
| 5.65 | (2095.63, 179, 781.75) #0 (213,83) | still gate-held (trail 7.00) | 43.53 |
| 7.00 | (2126.04, 179, 772.45) #0 (216,82) | FOLLOW toward #0 (218,74) | 35.99 |
| 8.57 | (2144.58, 179.19, 722.65) #0 (218,77) | FOLLOW toward #0 (218,71) | 86.75 |

The port never stands near that position in those seconds: it does not explain the stand.

## 32. The rig's scenario C and follow 2: the walking leader, and the gate armed [measured, n = 1 (the rig's rows); readings, inferences and port runs under node, labelled]

Date 2026-11-12, later. **The sources.** The rig's values are RELAYED MEASUREMENTS: r0004, MP71, n = 1 each; the record
is not on this host. Ours, scratch outside git: `evidence/forge-stim/xs/cells/t30/WANDER.md` (2026-11-12T11:42:38Z) and
`out/run.C.2144.6.txt`; `evidence/forge-stim/xs/cells/t31/TRAIL-RECIPE.md` (11:41:48Z); `t30/COMPARISON.md` s5.

### 32.1 Scenario C, as measured (the rig's run C3; the players' case) [measured, n = 1]

**2026-11-12 -- CORRECTED IN s33:** the reference a fix is scored against is the repeat: the gate at 8 cells, then straight up and across about 1.5 s behind, no stop; the 14 s lag and wander were the odd case.

- **The leader** walked WITHOUT STOPPING up mid-218 and on along the upper floor; raw and recorded cells identical;
  crossed z 661.8 at t 8.30 and z 651.8 at t 8.50; trail count 2 -> 22 -> 75.
- **The follower** did not follow straight up. It shuffled near (2136-2145, 179, 814-819) through the leader's climb,
  walked east to (2160.1, 179, 797.6) by t 14.0, back west to (2146.7, 179, 788.8) by t 18.1, then at t 19.9 ran (about
  40 units a second) straight up COLUMN 218 and CROSSED z 661.8 at t 22.31 and z 651.8 at t 22.81 WITH NO STOP, turning
  west along the upper floor. Its only stop was on the upper floor near the standing leader.
- **Bit 7** was set in 52 of 120 and in 113 of 472 frames while it was on the ground floor, and CLEAR from z 782 up the
  flight and across the seam.

**What it settles, in redotcom-19's words:** with a leader who keeps walking the original's follower crosses the landing
without a stop, about 14 s late, after about 11 s of wandering below; #798's RED stands as a real departure of the port;
a fix is scored against "crosses, no stop on the flight or the landing", the lag and the wander KEPT as the original's.
The account is two-sided: a STANDING leader upstairs holds the follower (original and port agree to 1.27 units, s31); a
WALKING leader does not in the original and does in the port. The correction's bit is clear on the flight and the seam
here too, so the second crossing measured it that way. **redotcom-19's reading on the evidence** (not a proven
mechanism; consistent with s12.3 and s15.1): "the port running the correction on every move is, on the evidence now,
what pins it".

### 32.2 The port in scenario C [a what-if of the port under node, kinematic leader; not the original]

From `WANDER.md` s2. Code: c6a72241d; `hostageFollow.ts`, `hostagePath.ts` and `extraction.ts` there are byte-identical to
`agent/xs-933-red`'s (#798's RED). The leader's upstairs path and speed are the harness's own. The port does none of the
wander: the gate opens at 7.00 s (trail 9 entries, 8.00), its first move is at 7.20 s, up column 218 at once. It is
PINNED on #0 (218,71) (alternating with #0 (217,71)) from 10.67 s to the run's end at 40 s, at z 661.81-661.92 and y about
220.7, in FOLLOW (3): it reproduces #798's pin with a leader who never stops.

| t (s) | the original (measured) | the port | the port's state, target | distance |
|---|---|---|---|---|
| 9 | shuffling near (2136-2145, 179, 814-819) | (2141.91, 184.82, 714.42) #0 (218,76), on the flight | FOLLOW (3), trail[2] #1 (13,6) | 102.26 (to the middle of the shuffle) |
| 14 | (2160.1, 179, 797.6) #0 (220,85) | (2144.58, 220.76, 661.81) #0 (218,71) | FOLLOW (3), #1 (4,8) | 142.91 |
| 18 | (2146.7, 179, 788.8) at 18.1 s, #0 (218,84) | (2139.34, 220.72, 661.88) #0 (217,71) | FOLLOW (3), #1 (4,18) | 133.80 |
| 19.9 | starts the run up column 218 from about (2146.7, 179, 788.8) | (2141.01, 220.76, 661.81) #0 (218,71) | FOLLOW (3), #1 (4,25) | 133.80 (to the original's 18.1 s point) |
| 22.8 | crossing z 651.8 at 22.81 (x and y not relayed) | (2140.16, 220.70, 661.91) #0 (218,71) | FOLLOW (3), #1 (10,25) | at least 10.11 in z alone |

### 32.3 The wander: three candidates [readings of this note and inferences on them; no binary or decompilation read]

**2026-11-12 -- CORRECTED IN s33:** the wander was one run's, with a trail of 2 at the order, and did not recur with an empty trail; the candidates stay for that odd case; the cap at 18.18 against 19.9 recorded as measured, not as an explanation.

From `WANDER.md` s1 and s3. Ranked; no stronger than the readings bear.
- **K1 (first): an obstacle or contact response holds and pushes the follower on the ground floor.** `FUN_00556370`'s
  record matures, the AI tick's switch is forced to 4 and the follow tick is skipped that frame; recovery moves the
  follower by rays or direct targets until its re-entry limit or the record clears. Rests on: s15.3a (read twice: a
  non-zero `FUN_00556370` replaces the follow tick); the s14 banner (the bit-1 write by a maturing record: an inference);
  s11.1 (mixed). At t 9, 14, 18 the rig's samples would show: [G+0x34] FROZEN (3, the same route) through bit-7 frames;
  [G+0x76] 0; [G+0x78] 1; the target trail[2] upstairs, moving with the leader; route state 4 with an unchanged point
  list; bit 7 in clusters, the AI tick's switch 4 on those frames. The east walk is NOT predicted (which ray is unread).
  Refuted by: goal decisions (state, route) changing on bit-7 frames; bit-7 frames not clustered on the shuffle and the
  east and west legs.
- **K2: the order's stale fallback route is walked and extended, not re-planned.** At the order the route was (0,214,84)
  -> (0,220,87) (s31.1, run B, measured); state 3 extends rather than re-plans; the splice is refused (the follower's
  cell not on a 2-entry trail); the direct append is refused to an upstairs target. Rests on: s31.1 (measured); s17.1
  (one reader); s28.8 (read twice); s23.2 (a). The samples would show at t 9 and 14 [G+0x34] = 3 and a route whose LAST
  point is (0,220,87); at 18 a new route. Refuted by: a route at t 9 whose end is not (0,220,87); an INIT or WAIT before
  t 14. **Its own weak point:** by s17.1 and s28.8 a failed extension within 7 raw cells of the end sends INIT at once,
  and (217-218, 86-87) is within 7 of (220,87): read strictly, it predicts an EARLY re-plan, not an 11 s walk.
- **K3: failed requests, WAIT (2) -> COVERING (8) for 2.5 s -> INIT (0), cycling until one answers.** Rests on: s16.2 F
  (one reader); s23.1 rows 5-6 (agreed); research 419 s22.9 (read twice); s23.5 item 3 (inference). WHY the search would fail is not
  settled (s23.3). It gives stands of about 2.5 s, NOT the east and west walks. Refuted by: state 3 with a route at t 9,
  14 and 18.
- **The ranking:** K1 first, because bit 7 is the one measured covariate that switches exactly where the wander ends
  (its mechanism is an inference); K2 second, because the measured order route ends where the east walk went (two rows
  off), against its own early-re-plan reading; K3 third (stands, not walks). A combination is not excluded.
- **Ruled out by the readings, with the measured rows:** the start gate (s24.1-s24.2: the trail rose 2 -> 22 during the
  climb, so 8.0 is passed on the flight, about t 6, not t 19.9); HIDE (s16.2 E: with the leader gone from the foot the
  target is upstairs, more than 18.75 from any ground-floor point); the fallback arm (research 417 s20, s31.4: only while the count is
  under 3).
- **The 40 units a second, in kind:** the throttle is 1 whenever the target is more than 4.5 x 15 = 67.5 away (s16.1's
  constants; s23.1 row 15): with the target upstairs, any candidate's final run is at full speed. That explains the
  speed, not the moment.
- **NOT EXPLAINED:** the east walk and the walk back; the moment 19.9 s (and the 1.8 s stand at (218,84) before it); what
  sets bit 7 on the ground floor; why the port pins where the original crosses. **A coincidence to check, not a
  reading:** the trail reaches its 75 cap about t 19 at the leader's assumed pace (his upstairs speed is not relayed);
  by s17.1 the corridor limits only smoothing, so the cap has no read effect on the plan.
- **Run B's first stand (s31.7) is NOT joined to the wander here.**

### 32.4 Follow 2, as measured: the gate armed [measured, n = 1; six snapshot pauses]

**2026-11-12 -- THE CAPITALISED CONCLUSION BELOW IS LIMITED (the hub's review):** "the gate is the same in both builds
and in the port" holds for the gate's RULE, re-read in the bytes (r1 0x5fb43c-0x5fb470 against the r4 window at
0x602c0c: 24 words, 22 identical, 2 relocated; the length function's twin r4 0x528130, 84 of 84; the only arming store
at D:L510077 and the only clear at D:L508647). It does not cover the ARMING: the port re-arms on a leader change
(`hostageFollow.ts:310`, `stop()`, `:247`), the original's leader change sets INIT only (D:L509996-509999), and
whether an order to a new leader makes a new goal is not determined (s24.1).

- **The leader was placed** at (2151.08, 179, 793.79), recorded cell (0,219,84); THEN the order; then up column 219 to
  (2150.40, 222, 643.99), a 31 s stand, and back down.
- **The follower NEVER MOVED** from its start (2094.58, 179.0, 781.81) in 1,686 frames, even with the leader back at the
  foot.
- **Six snapshots across the stand, all identical:** goal type 9, follow on; [G+0x34] = 0 (INIT); [G+0x76] = 1 (THE START
  GATE ARMED); [G+0x78] = 0; [G+0x7c] = [G+0x7d] = 0; the target cell word 0x0100a707 (no real cell) and the target
  position zeroed; [C+0x3f4] = 6; route state [C+0x4ec] = 4 with 0 points.
- **The leader's recorded cell** stayed (0,219,84) through the climb, then (1,14,7), (1,14,6); its trail count was 2 at
  the order, 4 through the stand, and on the way down 4 -> 3 -> 2 -> 6.
- **The breakpoint at r4 0x602f4c** (all nine site words confirmed), armed for about 22 s of the wait: NO HIT.

**What it settles.** THE GATE IS REAL AND IT HOLDS: armed at this order (a short trail, after a placement) and never
released, because the trail never reached its length. With follow 1's run A (the gate byte 0 at 0.42 s, the trail back
to the spawn, the follower moved; s31), the two runs are what s31.4's caution allowed: THE GATE IS THE SAME IN BOTH BUILDS
AND IN THE PORT, AND WHAT DECIDES IS THE TRAIL IT MEASURES AT THE ORDER. "Does a hostage's order arm the gate" is
answered by measurement: it does (a goal at an order is gated), and s24's reading HOLDS. s31.4's "not determined" is
RESOLVED by this.

**Stated, not interpreted:** with the gate armed the goal sat in INIT with the target zeroed and [G+0x78] = 0, and the
fallback-arm call at r4 0x602f4c did NOT execute in about 22 s. So a gated goal does not reach that arm, which bounds when
LATER 957's step (research 417 s20) can run.

### 32.5 Three things, from the readings in hand

**(1) The count dropped on the way down (4 -> 3 -> 2, then rose to 6): the walk-back rule seen running (n = 1).** The
appender is `FUN_00524d50` (twin r4 0x525010, 299 words, 292 identical, 7 relocated by `TRAIL-RECIPE.md`'s count; research 417 s25.1
gives both counts). Its search is r4 0x525160-0x5251ec (D:L392409-392422) and its removal r4 0x525208-0x52524c
(D:L392462-392466): a new cell found at index k > 0 removes the k newest entries, and the matched entry becomes entry 0.
The rig's two drops are that path twice with k = 1 (by the reading; the entries were not read). **The correction**
(`TRAIL-RECIPE.md` step 4, read now by one reader at the r4 bytes): the search tests indices 0..depth INCLUSIVE, SIX
entries with depth 5 (r4 0x5251e4 `sltu at,a2,a0`, r4 0x5251e8 `beqz at,0x525180`; D:L392412 has `<=`), comparing x and z
only. s10.1's "among the newest `param_3` entries" reads one short of that; it carries a banner. **What it does, as a
consequence of the reading** (not measured beyond the counts): a leader who doubles back SHORTENS the trail, so the
gate's sum falls and the follower's target (trail[2]) moves back toward him.

**(2) The sum that never released** (by the reading: `TRAIL-RECIPE.md` step 5; s24.2: same-sub-map consecutive entries add
their cell distance, a sub-map change adds 0). At the stand the count was 4, newest first: (1,14,6), (1,14,7),
(0,219,84), and one more not relayed, X, the entry from before the placement (the count was 2 at the order: (0,219,84)
and X). Sum = 1.0 (the two sub-map-1 cells) + 0 (the sub-map change) + d((0,219,84), X) if X is on sub-map 0, else 0. So
the reading predicts the hold for any X within 7 cells of (219,84) or on another sub-map. **X is NOT relayed**; the rig
can now read it (the recipe: entry 3 at data + 24) and the game's own cached sum at [E+0x4b8]. Why 2 at the order after a
placement by memory write: the write does not call the game's placement, so the trail was not zeroed (as in follow 1,
s31.2); the two entries are the placed cell's append and what was there before -- by the reading; the entries were not
read.

**(3) The row for the port, as measured:** "the port holds a hostage at every first order until its leader walks eight
cells; the original only when the leader's trail at the order is short, which for a human who has walked anywhere since
his last placement it is not." s31.7's trail-on what-if (5.50 from the rig's run-A stop, against 11.39 gate-skipped and
46.44 as it is) is the what-if that shows it for the port. The hub's row is LATER 960, in its wording: "the original
holds a hostage at an order only when its leader's trail is short at that moment; the port holds it at EVERY first
order because it creates the leader's trail empty at the first follow".

### 32.6 Reading a leader's trail array on the rig (`t31/TRAIL-RECIPE.md`) [a reading; marks per field; nothing measured]

**2026-11-12 -- CORRECTED IN s33:** its self-checks measured, n = 1, and its length rule measured on entries, n = 1; nothing else measured.

From `TRAIL-RECIPE.md` (r4 = the served ELF; [R2] read twice, [R1] one reader, [RN] read now by its author at the r4
bytes). The trail is T = E+0x434 for a body E (r4 0x5be338 `addiu a0,s1,1076`) [R2].

| field | T+ | E+ | r4 site | mark |
|---|---|---|---|---|
| flags; bit 2 set by the enable | 0x1c | 0x450 | r4 0x5255d8 `ori a0,a0,0x4`, r4 0x5255dc `sw a0,28(s0)` | R2 (review18, review20); r4 words RN |
| state byte, 4 once enabled | 0x80 | 0x4b4 | r4 0x5255e0 `sb v1,128(s0)` | R2 (review20, research 417 s25.3); r4 RN |
| f32, the gate's sum | 0x84 | 0x4b8 | r4 0x52821c `swc1 f0,132(a0)`; also r4 0x5252f0 | RN |
| capacity (75) | 0x94 | 0x4c8 | r4 0x525030 `lw v1,148(a0)` | R2 |
| store: allocated entries | 0x98 | 0x4cc | r4 0x5290c0, r4 0x529288 | R1; stored value not traced |
| store: count | 0x9c | 0x4d0 | r4 0x52503c `lw v1,156(s2)` | R2 |
| store: pointer to the entries | 0xa0 | 0x4d4 | r4 0x525140 `lw v0,160(s2)` | R2 |
| append counter | 0xa4 | 0x4d8 | r4 0x525490-0x525498 | R2 |

- **The entry is 8 bytes:** word 0 the cell word, bit for bit (sub-map w & 0x3f, x (w >> 6) & 0x1fff, z w >> 19); +4 the
  width byte (from r4 0x53e110, `FUN_005396c0`'s twin, whose body is unread); +5 the flag byte (8 when E+0x1061 bit 6);
  +6 and +7 zero at insertion.
- **Linear, index 0 newest:** a new cell shifts every entry up one and writes entry 0; at capacity the oldest is
  overwritten. No head or tail index.
- **The read at the order:** count = u32 [E+0x4d0], data = u32 [E+0x4d4], taken at one stop; entry i at data + 8i.
- **The cached sum** is f32 [T+0x84] = [E+0x4b8]; read it only at the length function's return (r4 0x52826c), because the
  appender also writes that float.
- **Not determined there:** whether RAM equals the served ELF; the width function's body; the value stored at T+0x98;
  any other writer of the entries, T+0x84 or T+0xa4.

### 32.7 With the correction off: the port in scenario C (2026-11-12, later) [a what-if of the port under node, kinematic leader, the same scenario C path and timing; not the original]

**The source.** `evidence/forge-stim/xs/cells/t30/WANDER.md` s4 (2026-11-12T11:47:35Z), `out/run.C-nocorr.2144.6.txt`,
`out/run.C-nocorr-all.2144.6.txt`; scratch outside git.

**The switch** (harness-side only; the canonical clone at c6a72241d; no port line changed). The follower's move is
`hostageFollow.ts:583-609`; the correction is the `correct` closure at `:594-599`, applied at `:603` through `glideAi`
(the lines checked on this branch). In the harness the planner's `correctMotionWithContact` and `correctMotion` return
the proposed feet unchanged, which neutralises `:596-598`. Two forms, identical tick for tick: (a) off only while the
follower's located cell is on the flight (#0 columns 217 and 218, rows 71-77) or on sub-map 1; (b) off for the whole
run (54 ground-floor calls switched off, none of which would have moved the feet).

**The result.** It reaches the upper floor: z 661.8 at 10.90 s, z 651.8 at 11.30 s, first located on sub-map 1 at 11.10
s; on #0 (218,71) only from 10.67 to 11.07 s, passing. As it is, it never does: its lowest z is 660.98, and it is on #0
(218,71) / (217,71) in FOLLOW (3) from 10.67 s to the end.

| t (s) | 9 | 14 | 18 | 19.9 | 22.8 | the run's end |
|---|---|---|---|---|---|---|
| as it is | #0 (218,76) | #0 (218,71) | #0 (217,71) | #0 (218,71) | #0 (218,71) | (2142.48, 220.76, 661.81) |
| correction off | #0 (218,76) | #1 (6,6) | #1 (4,16) | #1 (4,21) | #1 (7,26) | (2153.06, 222.00, 821.78) #1 (14,24) |

**What else changes with it off:**
- off the walkable cells for 9 ticks (as it is: 0), on class-0 #1 (13,5) twice and #1 (12,5) seven times between 11.83
  and 12.1 s: a corner cut across row 5 past the seam;
- a NEW hold upstairs from 25.6 s at x 2153.04 on #1 (14,24), in FOLLOW (3), with a route to #1 (24,25). Row 24 is
  walkable on the AI map, so it is the walker's world collision; the correction would have moved the feet in 379 calls
  there; whether it would have freed it is not shown;
- two short HIDE (7) stands, at #1 (4,14) from 16.50 to 17.33 s and at #1 (7,26) from 21.73 to 22.53 s;
- on the flight, no new corner cut or floating (x 2137.74-2145.97, against 2137.74-2144.58 as it is).

Of the 476 calls where the correction would have moved the feet, 58 are on the flight and the rest on sub-map 1. Neither
row shows the original's ground-floor wander: both climb at 7.2 s.

**The sentence, fixed, no stronger:** consistent with the correction being what pins the port; the bit's rule is still an
inference. **It is not a fix:** the corner cut and the hold upstairs say why.

## 33. The rig's scenario C repeat with snapshots: the reference [measured, n = 1 (the rig's rows); port rows from node logs; one reader (the array's order); an inference (the third point)]

Date 2026-11-12, later. **The sources.** The rig's values are RELAYED MEASUREMENTS: r0004, MP71, n = 1, seven pauses of
about 0.1 s; the record is not on this host. Ours: `evidence/forge-stim/xs/cells/t30/REFERENCE.md` (2026-11-12T12:01:03Z)
and the existing node logs it reads (`out/run.C.2144.6.txt`, `out/run.C-nocorr.2144.6.txt`); `review18/` for item 3 (a);
scratch outside git.

**The rig's rows** (measured, n = 1):
- The trail recipe's self-checks (s32.6) ALL PASS on a standing player, static and dynamic.
- AT THE ORDER the leader's trail was EMPTY (this placement did empty it), gate length 0, goal state INIT (0),
  [G+0x76] = 1, no target, no route.
- THE FOLLOWER STOOD 6.03 s. Its first move was at order +6.29, with TEN entries (218,78) ... (218,87), GATE LENGTH 9.000
  (the first sample past 8), state FOLLOW (3), the gate byte 0, [G+0x78] = 1, target (0,218,80), route points
  (0,218,80), (0,218,81), (0,217,83).
- It ran straight up column 218. The leader crossed z 661.8 at +7.70; THE FOLLOWER crossed z 661.8 at +9.21 and z 651.8
  at +9.68: 1.5 s behind, NO STOP.
- The earlier run's 14 s lag and wander (s32.1) DID NOT RECUR. That run's trail was not empty at its order (count 2) and
  reached the 75 cap at t 18.18, against the follower's run at 19.9.

**In redotcom-19's words:** "the earlier run is the odd case and THIS RUN IS THE REFERENCE A FIX IS SCORED AGAINST: the
gate opens at 8 cells (it fits to one cell), then straight up and across behind a walking leader."

**A note for accuracy.** `agent/xs-933-red`'s test header (41ea552d6) quotes the 14 s / 11 s wording. That file is not
this branch's; its header predates this repeat and is for the hub to re-word.
2026-11-12: re-worded at 6547efacb on 2026-11-12, in the main sense of s33.

### 33.1 The gate's 8.0, confirmed on entries [measured, n = 1]

Not only on a byte: the gate length was 0 at the order with the gate byte 1, and 9.000 at the first sample past 8 with
the byte 0 and the follower moving. s24.1, s24.2 and s32.6's length rule take "measured, n = 1" for exactly that; no
other statement of theirs is raised.

### 33.2 The port against the reference [port rows from the existing node logs, a what-if of the port under node with a kinematic leader; no new run; the harness's clock is not the rig's]

All times are seconds after the order (`REFERENCE.md` s1):

| event | original (reference) | port as it is | port, correction off |
|---|---|---|---|
| leader starts walking | before +6.29 (on row 78 then, having walked rows 87 -> 78 since the placement); start time not relayed | 5.47 (from #0 (218,84), 50 u/s) | same |
| leader at +6.29 | row 78 (newest trail entry (218,78)) | (2144.60, 179, 750.08) #0 (218,80); enters row 78 at 6.57 | same |
| gate open | between 6.03 and 6.29; 10 entries, length 9.000 at the first sample past 8 | 7.00: 9 entries #0 (218,84)..(218,76), length 8.00, leader on #0 (218,76) | same |
| follower's first move | 6.29 | 7.20 | same |
| follower reaches row 71 | not relayed | 10.67, #0 (218,71) | 10.67 |
| leader crosses z 661.8 | 7.70 | 8.30 | same |
| follower crosses z 661.8 | 9.21 | never; pinned on #0 (218,71)/(217,71) from 10.67 to the end | 10.90 |
| follower crosses z 651.8 | 9.68 | never | 11.30 |
| lag behind its leader at z 661.8 | 1.51 | reaches the landing 2.34 after its leader crossed; never crosses | 2.57 |

- **Like for like, against each leader's own crossing:** the gate opens 1.67 to 1.41 s before it in the original and
  1.33 s before it in the port; the first move 1.41 s before in the original and 1.13 s before in the port.
- **The start row.** The reference's trail held rows 87 to 78 (its leader started further south than the harness's #0
  (218,84)), which accounts for the port's later first move; it is NOT shown that the port's gate itself departs.
- **The port's approach** from first move to the landing is about 0.55 to 0.8 s slower: NOT EXPLAINED.
- **The one line, as `REFERENCE.md` words it and no stronger:** the port tracks the reference in shape to the landing
  (the gate at 8.0 of trail, the first move about 1.1 to 1.4 s before the leader's crossing, straight up column 218),
  about half a second slow on the approach, and departs in kind only at the seam: it pins as it is, or lags 2.57 s
  against the original's 1.51 with the correction off -- "the pin is close to isolated to the seam, not exactly".

### 33.3 About the route's third point, (0,217,83)

**(a) The array's order [ONE READER: the blind second reader of the seam, `review18/`, its report relayed in part; these
lines of its report were not in the note before].** `FUN_00526f20` inserts the new cell at points[0] (its duplicate test
is against points[0]; r1 0x52708c-0x5270e0 and r1 0x5270e8-0x5271e4), so THE ARRAY IS END-FIRST: points[0] is the end
nearest the target, and the LAST index is the follower's next node. `FUN_00526540` walks the points from the last index
down to 0 (r1 0x526670-0x526700). In that reader's worked case the array read [0] the goal ... [4] the first node walked.
So the snapshot's (0,218,80), (0,218,81), (0,217,83) is TARGET-FIRST, and the follower walks (217,83), then (218,81),
then (218,80); the two measured snapshots fit that (run B's route (0,220,87), (0,214,84) also lists the target first,
s31.1). Level: one reader. **The read that would make it two:** which index the walker (`FUN_00567900` /
`FUN_0056c080`) treats as the next node; it is named here, not made.

**(b) What (217,83) is [AN INFERENCE, not a reading; `REFERENCE.md` s2].** It is not the follower's own cell (213,83);
it is not a trail cell, so not the splice's entry; no trail corridor was attached, because the start is not on the trail
(s17.1). So it is most likely a smoothed vertex of the fresh plan (s11.2), the corner where the leg turns into column
218. "Most likely": the plan's point order and its smoothing were not re-read for this.

### 33.4 The wander's limit

The lag and the wander of s32.1 were ONE run's (trail count 2 at the order, capped at 75 at t 18.18 before the follower
ran at 19.9), and did not recur with an empty trail. K1, K2 and K3 (s32.3) stay as candidates FOR THAT ODD CASE. The cap
coincidence (18.18 against 19.9) is recorded AS MEASURED, not as an explanation.

## 34. After the lane closed (2026-11-12): two measurements, and a remark for research 399's owner [measured, n as stated (the rig, relayed by the main controller); one reader's remark, checked in part on the hub]

These arrived after the note was closed on the lane. The rig's rows are the hub's record
(`agent-mail/evidence/v0420/fishhook-hostages/README.md`, "MEASURED: follow 3 (the one-shots) and SCENARIO D", outside
git); r0004, MP71.

- **The tick's 1-path did not run in follow 3 (n = 1).** Both one-shot breakpoints were armed after their live words
  matched (r4 0x00602860 = 0x0c181254; r4 0x006028c4 = 0x0c15b310). The follow call (r4 0x006028c4) hit once: the tick
  ran. The 1-path (r4 0x00602860) did not hit in about 28 s armed (the gathering, the climb, the upper floor, a 10 s
  stand). The reading "the 1-path is shut online" (s14, s15.3a) survives this follow; it is still one follow.
- **A standing leader upstairs holds the follower on the flight: n = 2 in the original.** In follow 3 the follower
  again stopped on the flight, 5 units below the seam, at (2145.38, 217.39, 666.75), and held about 10 s with bit 7
  clear while the leader stood close above. With follow 1's run B (s31) that is two runs. The reference for a
  WALKING leader is s33 and is unchanged.
- **The jump's trigger was measured in the same slot (scenario D), and it corrects this note's head and s27.3:**
  research 417 s25.10 holds the rows and the correction; the head's bullet "Corrections to this head" says where this
  note is affected.
- **A remark for research 399's owner, not a correction made here.** A reader of this lane held that research 399's
  line "airborne is bit 0x20 (D:L410535)" cites the wrong store, the mover's airborne bit being bit 0x20 of `+0x105e`.
  Read on the hub: D:L410535 does store bit 0x20, of `+0x1061`; bit 0x20 of `+0x105e` is set at D:L440908 (`FUN_0057e540`), among other places (D:L443012, D:L456275, D:L456282, D:L466806), and cleared at D:L456508 and D:L456528 (`FUN_0059b440`; the reader gave D:L456509 and D:L456525), among others (D:L419833, D:L456602, D:L466787); the list is not claimed complete.
  Which of the two bytes research 399 means at that line is its owner's to say; research 399 is not edited by this
  note, and its conclusion is not in question.

## 35. Readings: the leader's trail's life built in the port (LATER 960, 2026-11-13) [the port; reading, pending review]

[The port; r0004 standing by match.json and the readings of s24 and s26; NOT measured beyond the rig's two follows.]

Date 2026-11-13. **What was built** (`agent/hostage-trail-start`): the trail s26 reads, in the room. Every seated
body's trail is made at the body's first frame in the room's hostage step, its entries zeroed at each placement with
the rest kept (`FUN_00525200` D:L392488) -- a placement being any `Walker.place` (a spawn, a dead-at-load entry, a
teleport), told to the step by the body's placement stamp (`Walker.placement`, `HostageWorldBody.placement`) -- its
cells laid each game frame whether the body is led or not (`FUN_005b7ba0` D:L471319-471324), and never deleted with
the last follower or at a death; a departed seat's goes with its body. The heading stays the follow tick's
(`FUN_005fc970` D:L509297-509347; its timer is the leader body's `+0x510`), run for a led body only. The gate is
unchanged (s24.2, s24.4). The RED and the control are the rig's follows 1A and 2 (LATER 960's row), scored per V21.R2
against the leader's cells since his last placement: match `test/hostageTrailStart.test.ts`.

**V21.R2's gate on the reading.** Each function this rests on, against r0004
(`$SOCOM_PC_ROOT/game/r0004/match.json`, the desktop's r0001 -> r0004 function match: "how" and "tie"), and whether the
decompilation's text of it carries "Could not recover jumptable" (scanned over each function's lines; none does, and
r1 0x597e80 has no text at all):

| function (r1) | r4 | how shown in r0004 | jumptable warning |
|---|---|---|---|
| `FUN_005999e0`, creation (D:L455541-455603) | 0x59f4e0 | match.json: exact | none |
| `FUN_00599f00`, the build (D:L455719-455874; its slot `+0x40` call D:L455842) | 0x59fa20 | match.json: relinked-body, unique; the slot call's four words read in both builds (s26.1, read twice) | none |
| `FUN_00599b60`, rebuild in place (D:L455604-455718) | its call of the build at r4 0x59f854 | match.json: unresolved; the call of the build read in r4 by two readers (s26.1, s26.9) | none |
| r1 0x597e80, CSealCtrl's slot `+0x40` (no text: research 419 s22.12) | 0x59d980 | match.json: relinked-body, unique; read in both builds' bytes, 9 words, 7 identical, 2 relocated (s26.1, s26.9: read twice) | no text |
| `FUN_00546c40`, the enable (D:L412457-412475) | 0x54b7a0 | match.json: exact | none |
| `FUN_00525210`, the capacity (D:L392498-392539) | 0x5254d0 | match.json: exact | none |
| `FUN_00525200`, the placement's reset (D:L392488-392497) | 0x5254c0 | match.json: seed+delta; its two words read in both builds (s26.2) | none |
| `FUN_005153b0`, the count's zero (D:L384373-384382) | 0x5153b0 | match.json: seed+delta; `jr ra` / `sw zero,4(a0)` read in both (s26.2) | none |
| `FUN_00546cf0`, body slot `+0x40` (D:L412487-412528) | 0x54b850 | match.json: relinked-body, unique; the vtable words read (s26.2) | none |
| `FUN_00546e40`, body slot `+0x3c` (D:L412529-412572) | 0x54b9a0 | match.json: relinked-body, unique; the vtable words read (s26.2) | none |
| `FUN_005b7ba0`, the cell update and its append call (D:L471251-471388) | 0x5be100 | match.json: unresolved; READ in r4 by two readers, independent (research 417 s25): unchanged but the 26 online-only words after the append (LATER 957, not built here) | none |
| `FUN_00524d50`, the append (D:L392372-392487) | 0x525010 | match.json: exact | none |
| `FUN_00527e70`, the gate's length (D:L393821-393864) | 0x528130 | match.json: exact (84 words identical, s24.4) | none |
| `FUN_005fb1c0`, the follow tick and its gate (D:L508492-509126) | the gate's window at 0x602c0c | match.json: unresolved; the gate's window read in r4, 24 words, 22 identical, 2 relocated (s24.4, read twice) | none |
| `FUN_005fdf80`, the gate's set on event 0 (D:L510042-510119) | 0x605780 | match.json: relinked-body, unique | none |
| `FUN_005fc970`, the follow start's enable and the heading (D:L509285-509365) | 0x604170 | match.json: relinked-body, unique | none |
| `FUN_005fcc40`, the switch-off (D:L509366-509408) | 0x604440 | match.json: exact | none |
| `FUN_005fdd40`, the leader change (D:L509978-510041; INIT at D:L509996-509999; not built here) | 0x605540 | match.json: exact | none |
| `FUN_00594cf0`, the local human's tick (D:L453025-453742; the switch-off call and the 0.6 s placement) | the call at r4 0x59a7f8; the placement block r4 0x59a898-0x59a8f8 | match.json: unresolved; those two places read in r4 (s26.2, s26.9) | none |

The function lines are those the decompilation's text gives each function, scanned on the hub's copy (2026-11-13);
match.json's rows were read by this author, one reader.

**The readings and what they leave out**

| name | where | what it holds | status |
|---|---|---|---|
| `LEADER_TRAIL_LIFE_READING` | match `src/extraction.ts` | `'from the build, zeroed at each placement, never switched off for a human'`: the life above. What would settle it as proven: a capture of the original reading a human's trail count from the spawn through a follow (the rig's follow 1A is one, n = 1) | reading, pending review |
| the gate's re-arm on a leader change | match `src/hostageFollow.ts` (`control` -> `stop()`) | the port re-arms; the original sets INIT only (D:L509996-509999; s24.4, departure 6); not measured | note only: not built here |
| a remote human's trail (CRemoteCtrl) | -- | on at the build (s26.1), but which ticks run for a remote body is open (s26.8); the room treats every seated body alike | note only: open |
| the online jump's emptying | -- | research 417 s25 (LATER 957): not built here | note only: LATER 957 |
| the 0.6 s placement in the local human's tick | -- | s26.2: online, when the floor probe misses for 0.6 s; the room has no such placement yet | note only: not built here |
| the first entry at a placement | match `src/extraction.ts` (the frame's add) | the port adds the cell the body stands in on the first frame after a placement; the original appends a cell that differs from `+0xe8` (s24.4, departure 3), whose value at a placement is unread | note only: one cell, open |
| the heading timer at a build | `FollowTrail` | the leader body's `+0x510` (FUN_005fc970); whether a build clears it is unread; the port's is cleared only with a round's reset | note only: open |
| a CPU seat's trail (CSealCtrlAi) | match `src/extraction.ts` (every seated body) | the original's AI is not on at its build: on only at a follow start (`FUN_005fc970` D:L509301), off with no follower (`FUN_005fcc40`, s26.3); the room gives a CPU seat a human's trail. No effect today: a CPU seat gives no hostage orders | note only: open |
| which console's class the room stands for | -- | in the room most leaders stand where the original has a CRemoteCtrl (on the hostages' host console), while the rig measured the leader's own console (CSealCtrl); this build rests on the local human's case | note only: open |

**The cost** (a timing on the seat box, n = 1; product-track instrument `S2U_TRAIL_BENCH`): the extraction's step on MP71
with no hostage led, before (no trail work: the RED commit) and after (every body's: the build), mean / p99 per room
tick -- 2 seated bodies 6.2 / 13.7 us before, 6.0 / 19.6 us after; 16 bodies 6.2 / 19.6 us before, 13.5 / 35.0 us after.

**The gate against the first move** (the review's F2). The rig read the original's gate byte [G+0x76] as 0 at 0.42 s
after the order (a snapshot time: an upper bound on when it opened, not the moment); the reading (s24.1-s24.3) opens
it on the first follow tick once the trail measures 8.0. The test asserts the port's gate (`HostageFollow`'s start
flag) open within that 0.42 s and prints the moment it opened. The port's 0.733 s is a different measure: the first
displacement of the follower by more than 0.5 u, after the gate has opened, the route request has been queued and
answered (research 333 s4, a game frame's slice) and the body has started from rest. The original's first move was not
timed by the rig, so the 0.733 s is the port's own, reported, not scored.

## Review on the hub (2026-11-12)

Two fresh reviewers on the hub, neither of whom wrote this note or saw the sessions behind it, re-read it at the
sources on the hub, one on sections 0 to 23 and one on the head and sections 24 and 26 to 34. No test or tool was run:
every port run under node and every count over the disc's data in this note is NOT RE-RUN, and each was checked only
for being labelled as the port's or the disc's and never as the original's. **Verdicts: PASS WITH FINDINGS, high
confidence (sections 0 to 23); PASS WITH FINDINGS, medium-high confidence (the head, 24, 26 to 34).** The split itself
was checked against the lane's note at 41f1aa4fdb9f: sections 24 to 33 are identical but for the cross-note prefixes.

**What holds, re-read.** *The first answer:* the load-time rewrite is not LATER 933's cause (sections 0 to 5: about 60
of 64 line citations re-read, every cell word of the s2 and s3b tables decoded by hand, every centre, boundary and
height recomputed, all 23 port lines). *The reading of `FUN_005fae70` that stands* (s14, s15): one path writes 1 and
it sits behind the network flag -- in the decompilation (D:L508408, the only write of 1 at D:L508449, its gate at
D:L508418-508427, the setter at D:L508484) and in both builds' bytes (the follow tick's twin at r4 0x602650 matches
r0001 on 191 of 204 words, the 13 differences being 11 relocated calls and one global's address; the 17-word pattern
matches once, at r4 0x6028c4; every a0 path of s15.3 as described). *The gate* (s24): its rule in both builds' bytes,
the one arming store, the one clear. *The trail's enable* (s26): the build's slot call in both builds, the ten vtable
words, the nine-word enabler, an exhaustive scan finding three calls to the enable in each build, the placement calls,
the 0.6 s block. *The rig's rows* (s29 to s34): about 70 measured statements compared with the hub's record and 15
distances recomputed; all match but the two noted below. *The port's lines:* none has moved since the tree the note
was written on (no difference under `packages/match/src` or `scene/src/aimaps.ts`), and every one checked matches.
*The index:* every WITHDRAWN, SUPERSEDED or CORRECTED row has its dated banner at its section's head, and no STANDS
section carries one.

**Findings, the head and sections 24 to 34.**

- L1, MEDIUM, folded (the head's corrections bullet; banners at s27.3; a bullet in s34): the jump's trigger as stated
  in the head and modelled in s27.3 is not the measured one.
- L2, MEDIUM, folded (a banner at s32.4; the head's bullet): "the gate is the same and what decides is the trail"
  holds for the rule, not for the arming.
- L3, MEDIUM, folded (a banner at s29): s29's measured x range is not in the hub's record.
- L4, MEDIUM, folded (the head's bullet): "never switched off" is shown for CSealCtrl only; the same over-reach is in
  s24.3 and s26.6's table.
- L5, MEDIUM, folded (the head's bullet): three stale statements in the head.
- L6, LOW: s31.1 says run B's stop is "about row 73" and s31.5's table "#0 (218,72)"; by this note's own geometry z
  676.2 is row 72, so the table is right.
- L7, LOW: s33.2's table gives the port's leader crossing z 661.8 at 8.30; the note's own differences (1.33, 1.13,
  2.34, 2.57) imply 8.33. 8.30 is the ORIGINAL's leader in run C3 (s32.1): a copy slip; the node log was not re-run.
- L8, LOW: "the rig's placement was a memory write, not the game's placement call" (s31.2, s32.5) is an inference
  stated as fact; the record shows one placement that emptied the trail (the scenario C repeat) and one that did not
  (scenario D), which the note does not reconcile.
- L9, LOW, folded: s34's list of where bit 0x20 of `+0x105e` is set and cleared was not complete.
- L10, LOW, folded: s34's "the first trace's run" is follow 1's run B.
- L11, LOW: s24.4 gives `controlTick` as `:296-308` (it starts at `:295`); s24.3's "only a turn can be commanded
  (D:L429121)" cites a line in `FUN_00566dc0`, not the `FUN_00567350` named just before it.

**Findings, sections 0 to 23.**

- E1, MEDIUM, folded (banners at s17.1, s17.2, s19.2; index row 19.2): the old-route case of s23.2 (a) was not carried
  back to s17.1, s17.2 and K3's signature in s19.2.
- E2, LOW: s15.1 and s17.2 end the crossing on tophost (14,5); z 645.5 is row 6, so the cell is (14,6). The conclusion
  is unaffected.
- E3, LOW: s14.2 points to "constants in s13.6" for `fVar7`'s 100 and 40; neither s13.6's table nor s23.4's lists
  them. The values are right in the bytes (r1 0x650c50 and 0x650c58).
- E4, LOW: the heads of s10 and s11 still say "not yet re-read by a reviewer"; the index and the STATUS say they were,
  and they were.
- E5, LOW: s16.1's account of `FUN_00524760` leaves out the trail's own enable bit (D:L392167: bit 2 of trail
  `+0x1c`); s17.1 carries it through its pointer to s28.8.
- E6, LOW: s23.2 (c)'s write is at D:L434933, not D:L434931-434932, and is conditional on flags and 2.
- E7, LOW: s23.3's "`FUN_005f5f20`'s three conditions" are four (D:L505671-505673).
- E8, LOW: s2a's "they matter only for bit-21 cells: row 70 and the link cell" is true of the landing; s21.8 shows bit
  21 on rows 77 to 88 of both columns as well.
- E9, LOW: s1's "the full rewrite runs again after all the sub-maps": the call (D:L395413) is inside the per-link loop
  and runs once a link record; harmless, the rewrite being idempotent.
- E10, LOW: s3's table caption ("every count is on sub-map 0 unless noted") contradicts the paragraph under it.
- E11, LOW, folded (the head's bullet): the STATUS was stale on the path-by-path comparison.
- E12, for whoever works from s15.6 and s14.6: read 5's `[I1]` on r4 0x66a980 can be `[V4]` (the r0004 correction gate
  reads that byte itself: r4 0x54e450-0x54e454, then `+0x171` at r4 0x54e460), which also answers the hub record's
  caution on "gate shut"; and s14.6's "if the byte starts at 0" is not needed, the initialiser writing every bit of
  `+0x171` (the result is 0x08 whatever it held).

**Not checked, or not checkable from the hub.** The raw trace files and the rig's own handles (only "matches the hub's
record" was possible); the lane's scratch evidence (its comparison and review files); every node run and every count
over the disc; in s15, about twenty r0004 addresses and six line ranges listed by the reviewer; in s28, the nine r0004
twin rows of s28.3 and five line ranges; s26's two r0004 sites and the bodies of two slot callees; sections 6 to 12
and 18 were sampled at about one citation in three.
