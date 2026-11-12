# 366 -- The parity harness's port side: the scenario, the s2t trace and the comparator (the no-disc slice)

- Date: 2026-10-24. The note the parity harness plan asks for at its first task (`plans/2026-10-11-web-parity-harness.md`,
  section 0a: "the harness's note takes the next free number at its first task"; section 3.5's table). 271, the number
  the plan named on 2026-10-11, went to the clans; the merge controller reserved 366.
- Track: the harness is a tool, so its code is the product track (OT.R53, the plan's section 3.5). What it compares are
  claims about the original, and those keep the simulation track's levels: nothing here moves a registry entry.
- Status: **built and unit-tested on the port side only.** No recomp or PCSX2 trace exists yet (PH-1, PH-4), so no
  line has been compared against the original, and **nothing here is proven**. The schema's offsets and `D:L` cites
  are **transcribed from the plan, pending re-read at the source** (PH-2): they are not readings until a reviewer
  re-reads each at the decompilation.
- Sources: Fuse's #443 (`origin/cursor/parity-harness-slice-b843`, 14b428277), taken over on `agent/fuse-443` (OT.R69);
  the plan's sections 2.1-2.5 and PH.R1-R12; the port at `origin/main` c9a4b6074.

## 0. The port side: the no-disc slice (#443)

Sections 1-6 are the plan's: PH-1's run proof, PH-2's inventory, then a section a scenario (PH-8, PH-9, PH-10, PH-12), each written as its task runs.

### 0.1 What the slice is

- `tools/harness/scenario.ts` -- the scenario file of the plan's section 2.1: the map and the spawn (a teleport; a
  `walk-from-slot` spawn is refused until the slot-8 savestate exists, H278), a pad script by game frame (PH.R3),
  named events whose first frame later keyframes may name, the outcomes, the stop rule and the field set.
- `tools/harness/trace.ts` -- the `s2t` trace of section 2.2: a header line (the side `port` / `recomp` / `console`,
  the scenario, the field set, the revision, the map's hash, the build, the environment, the reference's label and
  standing) and one JSON line a game frame; the press-edge and place-edge finders; the manifest of section 2.3.
- `tools/harness/schema.ts` -- the first field set, `frostfire-box`: 36 fields, 30 of them scored, each with its
  recomp read, its port read, its tolerance and its evidence (section 2.4's refusals: a field with no evidence, no
  tolerance or no read on either side is refused). `matrix.y` stays unscored (U6, the `+0x404` question); r0004's
  column is not filled in (section 3.2).
- `packages/viewer/src/harness/portTrace.ts` -- the port's read-only sample of `Walker.state`, `Traversal.state()`,
  the hold and the grenade page per frame. Only the tools import it: it is not in the page's bundle.
- `tools/harness/port-trace.ts` -- the headless recorder: it steps the same `Walker` and `Traversal` the page steps,
  two mover ticks a game frame (`dt` 1/30; the original's frame is 525/15734 s, U1), on a synthetic floor, a synthetic
  crate or a map from the fixtures, and writes `port.s2t`, `inputs.txt` and `manifest.json` under
  `socomlegacy/logs/harness/<scenario>/<stamp>/` (git-ignored, section 2.3). Its writer refuses a path under
  `SOCOM_PC_ROOT` (`prove-results.ts` `outputRefusal`, PH.R2). The header's map hash is the sha256 of the map file the
  recorder read (`sha256:<hex>`); a synthetic world has none (null).
- `tools/harness/compare.ts` -- the comparator of section 2.4: the header check (exit 2 on a different scenario or
  field set), the press-edge alignment and its offset, a line per field per frame (`equal` within tolerance,
  `differs`, `skipped` with why, `masked`, `unknown`), the outcome rows, the fall band widened by `|dt_a - dt_b| x |v|`
  and said on the line, a summary per field (its counts, the largest error and its frame), coverage as counts, and
  exit 1 when a scored line differs.

### 0.2 Why it builds its own pieces (PH.R11, reuse before building)

- **The world.** `packages/viewer/test/parity/world.ts` holds synthetic-polygon helpers for the parity tests, not a
  map: the recorder needs a real map's ground (`loadMap`, `groundGrid`, `groundPolygons`) to play the plan's scenarios,
  so it opens one from the fixtures and builds its own synthetic floor and crate beside them.
- **The pad script.** `.s2r` commands record a page's commands, not the pad: PH.R3 aligns two traces on the recorded
  press edge of a pad word by game frame, which both sides can be fed (the recomp by its pad file, the port by the
  recorder). So the scenario carries its own pad script, and `inputs.txt` writes it one line a frame
  (`frame b lx ly rx ry`); that it matches the recomp's pad file is PH-4's to check.
- **The writer's refusal** reuses `prove-results.ts`; nothing else in the tools wrote `s2t` or compared two traces.

### 0.3 What it measured (port side only)

- Unit tests (`tools/test/harnessSchema`, `harnessTrace`, `harnessCompare`): the schema's refusals; the trace's
  round trip and refusals; the press edge on the frame the scenario names; on the synthetic crate, `action.current`
  climb on the frame before the place; the comparator on synthetic pairs (an equal pair, one frame of alignment, a torn
  frame masked, a differing outcome with exit 1, a path under `SOCOM_PC_ROOT` refused, the widened fall band said on
  the line); the header's map hash.
- **The first port-side record**: the Frostfire box (`frostfire-box.json`, section 2.1's specimen) recorded on MP2
  from the committed fixtures, 2026-10-24: 600 frames, `action.current` none 567, climb 18, place 15 -- the climb
  happens in the headless world. The trace is kept at `agent-mail/evidence/ph3-frostfire-box/` (`socomlegacy/logs/` is
  git-ignored): `port.s2t` sha256 `1edc525523a406acfe1a8b9f0cb0c7fd800463b156f3714526186dfc1d25fff5`, recorded at the
  port's commit `93c2d1ab5`, the map file's hash `sha256:d34e1119cf6c5b73dbab34a27efc0ddfe86049c21f338c641973a35003b03674`. A comparison of that trace with itself exits 0 with every line equal or masked: the report's shape,
  not a parity result.

### 0.4 What the report says, and what it never says (PH.R7-R9)

- Every report names its reference in words: an emulated Unzipped recompilation or a PCSX2 capture, "retail console:
  no" (PH.R7, PH.R8).
- **No single parity percentage** (PH.R9): the counts stay apart per field and per status, coverage is "N fields
  compared, of M scored, of K defined", and the per-scenario totals are counts, never divided.
- **Standing (PH.R8) is each line's field's** (PH-23, 2026-10-26). A field names the desktop's KNOWN section 1 row
  that measured its behaviour on PCSX2 or a console (`FieldDef.known`, by the row's key at the pinned commit), and
  `lineStanding` writes `validated (KNOWN section 1: <key>)` on its lines against a recomp reference, or
  `recomp-only` without one. A header that calls the whole reference validated lends nothing to a field with no row.
  A PCSX2 capture is `emulated-console`. The report's own standing stays the reference's.
  - **No field of `frostfire-box` claims a row today.** The KNOWN section 1 rows at `desktop@be557831` that touch
    these fields are "THE ACCEPTANCE TEST PASSED" (`KNOWN.md:54`: `+0x1044` to 0.0 and `+0xF7A` 1 -> 2 on the death
    row, -> 3 at +3.7 s), "The kill REPEATS on the block-pointer exe" (health), "Spawns are deterministic per
    map", "Mutual standing does not starve either side online" (MoveScale), "A clock round end is readable from
    the valves" (`KNOWN.md:59`: `+0x1044` and `+0xF7A` at the round end) and "The actor's facing lives in its own
    transform". Each artefact is a run of the recomp exe or a review script over one, not a PCSX2 or console
    measurement.

### 0.5 Open, in the plan's order

- PH-1 (the recomp run proof on this host; the owner's window, H277), PH-4 (the recomp's emitter), H278 (the slot-8
  savestate recaptured), then PH-8's first comparison of the Frostfire box against a reference trace.
- PH-2's other half: the per-revision offsets, the 30 functions' names, and the reads section 2 leaves open. Its
  re-read of every offset is section 2, pending review.

## 1. The run proof, prepared (PH-1's recipe; PH-4's converter, 2026-10-26)

**Not run.** The recomp run itself is the owner's window: it takes his keys, the desktop lock FREE, and no gate on
the host. Everything around it is built and unit-tested on a synthetic log (`tools/test/harnessRecomp.test.ts`), so
the run is one step between commands that already work. The section's measurements come only from that run, each with
its command.

**The steps, from `socomlegacy/` in a worktree with its modules linked:**
1. The environment, from the schema's re-read offsets. It replaces the plan's wave-1 string of section 3.1, which
   dumped `+0x87c` (the charge object's) on the actor:
   `eval "$(npx tsx tools/harness/recomp-trace.ts env --scenario tools/harness/scenarios/ph1-holds.json)"`
   (PH-1's holds: frame-numbered, no press; `frostfire-box.json` waits on port-side events, which the driver refuses).
   - The player's tick is `0x0057a330` (`FUN_0057a330`), traced on every call.
   - Its fields are dumped at its return. The two chained reads (`root.y`, `matrix.y`) dump their pointer word too.
   - The actor static and the guest clock are peeked, the pad's changes logged, the host pad off.
   - r0004 is refused: its tick address is not placed.
2. **The owner's run.** The plan's PH-1 command under that environment (`desktop@be557831:tools_py/parity/drive.py`,
   `--target ours`, and the
   section 3.1 pad file), its stdout and stderr in one log, `2>&1`, so the input rows interleave with the calls.
   The run's log is `PS2X_RUN_LOG` (desktop@be557831:docs/KNOBS.md:199, the scripts' own). The pad file is driven
   beside it: `npx tsx tools/harness/recomp-run.ts --log "$PS2X_RUN_LOG" --pad "$PS2X_SOCOM2_INPUT_FILE" --scenario
   tools/harness/scenarios/ph1-holds.json --timeout 600` (the default; exit 1 at the timeout, the pad left neutral
   whatever stops it, a rename the sampler refuses retried for 200 ms) writes each keyframe as the log reaches its frame (the player's tick calls counted) and leaves
   the pad neutral after the scenario's frames. It takes frame-numbered keyframes only: an event's (`prompt+0`) is the
   port's signal, which the log does not show.
3. The log into a trace:
   `npx tsx tools/harness/recomp-trace.ts convert --log "$PS2X_RUN_LOG" --scenario tools/harness/scenarios/ph1-holds.json`
   writes `recomp.s2t` under the git-ignored `logs/harness/` and refuses a path in `SOCOM_PC_ROOT`'s tree.
4. The port's trace (`npx tsx tools/harness/port-trace.ts --scenario ...`), then the comparison:
   `npx tsx tools/harness/compare.ts <port.s2t> <recomp.s2t> --scenario ...` (PH-7, PH-23).

**What the run records** (plan PH-1):
- the time to the HUD;
- the exe's RSS and GPU memory;
- the log's size and lines a second;
- whether the player's `[ret-dump]` rows come every frame and non-zero (the first rows of a run are pre-gameplay zeros);
- whether `[pc-sampler]`'s `vsync=` advances two a frame;
- the spread of `dt` (the converter reads it at `actor+0x2e0`, `FUN_0057a330` D:L439135: the `[call]` row's `f12` is
  printed to one decimal and is no argument of the tick);
- the converter's own count of frames and masked frames.

**What the converter cannot tell yet:**
- The pad is joined by log order: the input rows are stderr's.
- `action.current` and `stance.wished` are recorded as raw values (`motion:0x2a`, `stance:1`) until their mappings are
  read.
- `t_guest`, `feetY.climb`, `gravity.suspended`, `flags.2b`, the claymore fields, `floor.window`, `play.*` and
  `vel.world` are null. The guest clock is peeked only at the sampler's period, never per frame.
- A call with no `[ret]` row, an unwound call, and the first call after the actor pointer changes are masked frames.
- Each item above is section 2's "Owed".

## 2. The first field set, re-read at the source (PH-2, 2026-10-26)

**Level: reading, pending review.** Each recomp read of `frostfire-box` (`tools/harness/schema.ts`) was re-read at the
decompilation on the owner's host (`socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`), with
`recomp/socom2_names.csv` for names. It was a read-only pass by seat eb's agent, by source inspection only: nothing was
run, and nothing is measured. The desktop's notes (research 230, 25, 79, 50, 313) were used as pointers only.
The player actor is the pointer at `0x408c58` throughout. A fresh reviewer re-reads these lines at the source before
any of them counts as a reading. A capture or a trace of the recomp would raise each to proven (PH-1, PH-4, PH-8).

**Confirmed** (the source supports the meaning; the row's wording made exact):
- `frame`: `FUN_0057a330` (D:L438655), the tick whose name is a callgraph match. Its dt is read from `actor+0x2e0`
  (D:L439135). The frame index itself is the harness's count.
- `t_guest`: `FUN_002aa490` D:L151067 advances `+0xe0` of its object, and `0x4364e0 + 0xe0` is the clock. That the
  call at D:L151261 passes `0x4364e0` is not proven; a trace of the call settles it.
- `pos.x/y/z`: `actor+0x1c..+0x24`, a point at feet level. `FUN_0054e8f0` D:L416877-416880 adds the root height to y;
  `FUN_00584240` D:L443762 and `FUN_005a21b0` D:L459729 tie it to the altitude. No writer was found by name.
- `vel.local`: `actor+0x2c..+0x34`, the body-frame velocity. `FUN_0057a330` D:L439134-439138 sets it to the root
  delta over dt; D:L438971/438978 set x and z from the stick; D:L438988-438990 zero it.
- `action.current`: `actor+0x534`, the top play's motion-type id. `FUN_0057d5e0` D:L440391-440393 writes it from the
  play record's `+0x22` through the anim set at `+0x528`; `FUN_00577e40` D:L437404-437409 tests it. The
  climb / place / none enum is the harness's mapping.
- `action.depth`: `actor+0x1c8` is the TOP INDEX into the play array at `*(actor+0x1c0)`, -1 when empty
  (`FUN_00555170` D:L419950-419954; pops while it is >= 1, D:L437905). The row now reads the index plus one.
- `gravity.suspended`: `FUN_005af930` (D:L466729), whose branch at D:L466782-466787 skips the gravity step
  `FUN_0059b440` when any of six motions (0x2e, 0x2a, 0x23, 0x2d and two `DAT_` ids) is current or the state
  `+0x174` is 4. D:L466754 (`+0x1061` bit 3) also exits early. The source has no vy condition; the port's column
  dropped its `vy == 0`.
- `flags.0x200`: the `!= 4` gate is `FUN_005be9a0` D:L475305; the plan's D:L475310 reads `+0x105e`. `FUN_005448a0`
  D:L410938-410941 keeps the old value at `+0x201` and a changed flag at `+0x202`. "View mode" is not proven.
- `flags.2b`: the top play's `+0x2b` (`FUN_0057d540` D:L440343, `FUN_0057a330` D:L439151; written at push by
  `FUN_0028dc90` D:L135204). The floor record's `+0x2b` (`FUN_0059b440` D:L456563-456565) is another object.
- `claymore.placed`: a registry count by the owner's id (`actor+4`) through `FUN_003cc1f0`, required below 4
  (`FUN_005be9a0` D:L475307-475308); the object's `+0x818` counts placements (D:L475328). Not an actor field.
- `stance.wished`: `actor+0x374`, a byte 0/1/2 that `FUN_00552d60` (D:L418865) retries at D:L418875-418906; its
  callee `FUN_00552ec0` (D:L418914) resets it to `+0x174` on refusal (D:L418991, D:L419011). The value-to-stance
  names are unread.
- `health`: `actor+0x1044`, a float 0..1 (1.0 in `FUN_00553ea0` D:L419759; <= 0 gates `FUN_005af930` D:L466816).
- `moveScale`: `actor+0x1368` scales `+0x23c..+0x244` (`FUN_00551ec0` D:L418621-418623), clamped to [0,1] by
  `FUN_00553dc0` D:L419379-419384, 1.0 at construction (D:L419814).
- `root.y`: `*(actor+0x2e8)+4` is the root's height over the position, added to `+0x20` at D:L416880 and
  `FUN_005aca70` D:L465173. The row now reads `+0x20` plus it, so both columns are absolute.
- `floor.window`: `FUN_005b0420` (D:L467030) passes 1.0 at D:L467055, used at D:L470233. A second path
  (`FUN_0054edf0` to `FUN_005b4f30`, D:L417178-417179, D:L469708) passes a computed value, so "1.0 walking" holds on
  that path only.

**Differs** (the source gives another meaning; the row says what it is):
- `matrix.y` (**U6, settled**): `actor+0x400..+0x41c` is a copy of the floor hit record SealProcessAltitude chose. Its
  layout is the hit point (`+0x400/+0x404/+0x408`), a surface pointer (`+0x40c`), the normal (`+0x410..+0x418`) and
  the owner (`+0x41c`). Its main writer is `FUN_005b0420`: on a hit it copies the record in (D:L467127-467141); on a
  miss it resets x and z and keeps y (D:L467062-467077). `FUN_00546cf0` (D:L412498-412507), `FUN_00546e40`
  (D:L412541-412550), `FUN_00579220` (D:L438155-438168) and `FUN_005794d0` also write it, each consistent with a
  floor hit. `FUN_0059b440` lands on it (D:L456509-456559). So `+0x404`
  is the last floor hit's y, not a matrix. The body node's matrix is `*(actor+0x28)`, whose translation
  `FUN_003157d0` D:L215068-215070 writes at `+0x30..+0x38`; `matrix.y` now reads `*(*(actor+0x28)+0x34)`. It stays
  recorded and masked, because the port has no node matrix.
- `feetY.climb`: `actor+0x2e4` is the body's altitude on every tick, not a climb-only "last feet y". `FUN_0059b440`
  D:L456496-456498 lowers it by the fall speed and clamps it on landing (D:L456513-456523). The suspended branch pins
  it to the floor hit at `FUN_005af930` D:L466784 (the plan cited D:L466781, a brace). The climb-only sample is the
  harness's.
- `flags.e1bit4`: not airborne. It is set in `FUN_0029ee10` D:L145030, from a parameter at construction
  (`FUN_003a9930` D:L300741), and cleared in `FUN_0029e8b0` D:L144775 at the seal's teardown (`FUN_00547af0`
  D:L413024); `FUN_0057d540` D:L440342 requires it to start an action. It has many readers and reads as an active
  flag; its meaning is unread. The fall flag is `+0x105e` bit
  5 (set D:L456275/456282, cleared D:L456528). The port had written its `inAir` here; it now writes no reading, and
  the line is masked.
- `claymore.timer`: `+0x87c` belongs to the charge object (its owner, the actor, at `+0x830`); `FUN_005be9a0`
  D:L475324-475327 writes 1.3 there.
- `floor.y`: `FUN_005b5d40` (D:L470165) returns a pointer to the chosen 32-byte hit, or 0 (D:L470298). It picks the
  highest hit at or below the probe plus the window, else the lowest (D:L470233-470240). The y is that record's `+4`,
  copied to `actor+0x404`.
- `alive`: `actor+0xF7A` is a life-state byte, not a boolean. Its setter is `FUN_00544210` D:L410551-410556 (2 or 3
  back to 1 is a revival), and the death paths set 3 (D:L410529-410530, D:L412701-412702). It stays recorded, not
  scored.

**Not found** (recorded and masked until read):
- `vel.world`: (corrected 2026-11-10, LATER 833: the decompiler prints the offset as decimal 100 -- `FUN_0054d9a0`
  writes `+0x64` from the clip's velocity at D:L416515-416528, and the move copies it to `+0x38` at D:L413963-413965;
  research 217 section 2.8) ~~there is no float use of `actor+0x64..+0x6c` in the seal code~~. The word is `+0x38..+0x40`,
  which is copied into the carry `+0x1350..+0x1358` (`FUN_005af930` D:L466972-466974); research 50 maps SOCOM 1's
  world velocity there.
- `play.phase`: the plan names no offset (research 230 points to `play+0x1c`, unread).
- `play.steer`: `play+0x78` is the play's active marker. It is tested and cleared (D:L439017, D:L439026) and set to
  the play's own address by `FUN_00578990` (D:L437864, at D:L437941). The steer is among the vectors at `+0x6c`, `+0x7c` and `+0x8c`, and which one
  is unread.

**Owed beyond this pass:**
- the mappings four scored, exact fields carry unread: `action.current` (motion id to climb / place / none: research
  313's names, not re-read), `action.depth` (whether a base play is always present, so a climb reads 2),
  `gravity.suspended` (whether the port's ladder is one of the six motions) and `stance.wished` (the byte's values to
  stance names). Each is scored on the port's mapping until read;
- a field of its own for the floor hit's y (`actor+0x404`);
- the airborne bit `+0x105e` bit 5 as a scored field once the port's `inAir` is mapped to it;
- r0004's offsets beyond the desktop's established five (below).

**Per revision** (2026-10-26, `tools/harness/schema.ts` `RECOMP_ADDRESSES`, `RECOMP_OFFSETS`, `recompOffset`):
the desktop's shape, name -> revision -> value. The r0004 column holds only what the desktop established: the
actor pointer `0x00435618`, the guest clock `0x00442fd0`, the position triple (`+0x1c`), `root_node` (`+0x2e8`)
and `move_scale` (`+0x136c`) (`desktop@be557831:tools_py/parity/guest_addresses.py:57-62`, `:376-380`). Every
other offset is null. The desktop leaves health and alive out on purpose, as the online ladder's r0001 offsets with
no r0004 value established (`:443-447`); the other fields are absent from its table. An unknown field or
revision is refused, never answered with another column's number.

## 3. The thirty unnamed functions, names proposed (PH-2, 2026-10-26)

**Level: reading, pending review. These are proposals, not names.** The 30 `FUN_*` of plan section 1.2 ("What the
name list holds for the first scenarios") were each read in the decompilation on the owner's host, by seat eb's
read-only agent. None of the 30 has a row in `recomp/socom2_names.csv`.

**Where the names come from** (the `source` column).
- 14 names are a SOCOM 1 demo method's, named by its mangled symbol (`SCUS_972.05` under
  `$SOCOM_PC_ROOT/game/demo_scus_972_05`, research 44's source, read in place). Each was checked by reading the
  SOCOM II body. That is a vocabulary match plus a reading of the body, not a fingerprint match: it applies to SOCOM II
  only as far as the body read shows.
- 13 are **descriptive**: no demo symbol fits, and the name says what the body was read to do. A descriptive name's
  grade covers the behaviour read, and none is graded above medium-high.
- A name enters the desktop's sidecar only through its own proposals file and pass (PH-5, plan section 3.2:
  `decomp-read`), never from this note.

**The facts behind the class column.**
- The `CBody` sub-object sits at `actor+0x170`, and its blend stack at its `+0x50` is `actor+0x1c0`. `CBody_dtor`
  (`0x28bb00`) calls `FUN_0028b6d0` (D:L133715) at D:L133843, whose loop (D:L133755-133756) pops the stack empty through `FUN_0028da00`.
- The kit (`CZKit`) is at `actor+0x5e0`, with its owner at kit `+0x830`.

| address | D:L | proposed name | source | what the body does (decisive D:L) | confidence |
|---|---|---|---|---|---|
| `0x0057d540` | 440333-440356 | `CZSealBody_PerformAction` | `PerformAction__10CZSealBodyF8AnimType10SEAL_STATE` | with `+0xe1` bit 4 set and the top blend's state not 8, pushes the motion unless it is current (D:L440342-440350); the same two arguments | medium |
| `0x00588bc0` | 446055-446420 | `CZSealBody_PushBlend` | `PushBlend__10CZSealBodyF8AnimTypeib` | resolves the motion through the anim set, pops up to 12 blends for some motions (D:L446108), pushes through `CBody_PushBlend` (D:L446292), stores `+0x534` (D:L446299); the demo's takes 3 arguments, this 4 | high |
| `0x00589aa0` | 446479-446728 | `CZSealBody_PopBlend` | `PopBlend__10CZSealBodyFv` | pops through `CBody_PopBlend` (D:L446515), resets `+0x534` to the new top's motion or -1 (D:L446518/446525), runs the ended motion's end action | high |
| `0x005af930` | 466731-467017 | `CZSealBody_ProcessFall` | descriptive | pins the altitude to the floor hit during the climb motions (D:L466784); else the jump timers, gravity (D:L466809), fall damage, the fall and landing motions (D:L466864, D:L466876) | medium |
| `0x0028c250` | 134149-134181 | `CZBodyAnimBlend_GetVelocity` | `GetVelocity__15CZBodyAnimBlendFP6CPnt3D` | the blend's weighted root delta between keys (D:L134167-134172); `Tick_0` writes it to `actor+0x2c` (D:L438876) | high |
| `0x0028c4f0` | 134225-134278 | `CZBodyAnimBlend_Propagate` | `Propagate__15CZBodyAnimBlendFfb` | advances the phase `+0x1c` by dt, rate and weight over length; wraps when looping (D:L134268), else clamps | high |
| `0x0028da00` | 135025-135114 | `CBody_PopBlend` | `PopBlend__5CBodyFv` | returns the top blend's anims to the pool, pops (D:L135093), re-arms the next (D:L135104) | high |
| `0x0028dc90` | 135119-135225 | `CBody_PushBlend` | `PushBlend__5CBodyFiiib` | takes a blend and an anim from the pools (D:L135152), sets id, state and loop, pushes onto `+0x50` (D:L135214); the demo's takes 4 arguments, this `this` and 3 | high |
| `0x005be9a0` | 475213-475685 | `CZKit_HandleFireWeapon` | `HandleFireWeapon__5CZKitFiff` | dispatches on the item's type (D:L475261): devices and throwables start a body action, guns fire (D:L475604); the same arguments | high |
| `0x005c0ae0` | 476358-476505 | `CZKit_WillFireWeapon` | `WillFireWeapon__5CZKitFv` | 1 only when the trigger, burst, body gate, refire delay and ammo all allow (D:L476380-476446) | medium-high |
| `0x005a7de0` | 462594-462739 | `CZSealBody_CanFire` | `CanFire__10CZSealBodyFv` | the state `+0x174` in {0,1,2,3,6} (D:L462611), not dying, reloading, changing weapon or carrying; strictly, every anim past its no-fire phase (D:L462704); the demo's takes none, this 2 | medium-high |
| `0x0059b440` | 456469-456568 | `CZSealBody_ApplyGravity` | descriptive | the fall speed and altitude by dt (D:L456497-456498), the landing on the floor hit, and a fall re-armed under the `+0x1061` gate (D:L456557) | medium-high |
| `0x0059ad30` | 456263-456325 | `CZSealBody_CheckFloorContact` | descriptive | airborne above the floor plus a threshold, a probe ahead for a ledge (D:L456291/456308), the altitude snapped up (D:L456318) | medium |
| `0x005b3340` | 468761-468954 | `CZSealBody_HomingTickOneShot` | descriptive | `Tick_0` calls it for a non-looping blend with a target, `HomingTick` for a looping one (D:L439018-439022); a yaw rate and a root velocity that arrive by the anim's end | medium |
| `0x00585cd0` | 444513-444628 | `CZSealBody_PoseOnTurret` | descriptive | from `Tick_0` while the turret motion plays (D:L438897): the turret's yaw to the blend's phase, the seat offset to `+0xf54` | medium |
| `0x005463c0` | 412095-412318 | `CZSealBody_MountTurret` | descriptive | the eligibility gates, the turret's weapon into the kit (D:L412217), the turret at `+0xeb8` (D:L412315) | medium-high |
| `0x005bc5d0` | 473877-473906 | `CZKit_SetItemWithAmmo` | descriptive | the slot's weapon (D:L473887), the round count split into magazines of its capacity (D:L473895) | medium |
| `0x0054aa30` | 414520-416191 | `CZSealBody_QueueWallProbes` | descriptive | segments between body parts queued as world intersects (D:L415264-415272), by stance and motion; no direct caller found ("body-segment probes" is stricter) | medium |
| `0x0057e1b0` | 440778-440865 | `CZSealBody_Jump` | `Jump__10CZSealBodyFv` | not airborne, the cooldown, the roof clear (D:L440800); a running jump at speed squared >= 225 (D:L440812-440820), else a standing one (D:L440843) | high |
| `0x0057f150` | 441246-441288 | -- (held) | -- | a ray 20 units up from a body part, 1 when clear or the hit's material class is 1 (D:L441271-441276); the receiver's class is unproven | -- |
| `0x00583350` | 443326-443366 | `CZSealBody_StickToBlendWeights` | descriptive | one axis dead-zoned, the magnitude clamped to 1, the angle split into two weights (D:L443336, D:L443350) | medium |
| `0x00586c10` | 444957-445041 | `CZSealBody_SmoothXZThrottles` | `SmoothXZThrottles__10CZSealBodyFRfRf` | both throttles rate-limited against last frame's `+0x248/+0x24c` by dt (D:L444985-445015) | high |
| `0x00586f00` | 445046-445086 | `CZSealBody_IsStopped` | `IsStopped__10CZSealBodyFfff` | "stopped" from the three stick values, its thresholds by airborne, turning or neither (D:L445057-445075) | high |
| `0x0057e770` | 440932-441091 | `CZSealBody_ApplyFling` | descriptive | consumes the blast record `FUN_0057ed10` stores (D:L441115): falloff (D:L440987), the knockdown motion (D:L441047), the launch capped (D:L441055-441059) | medium |
| `0x002da930` | 179484-179865 | `CPad_Tick` | `Tick__4CPadFf` | `scePad2GetState`/`Read` (D:L179513-179517), the sticks normalised (D:L179557), the dead zone and curves; the same arguments | high |
| `0x00584b00` | 443977-444017 | `CZSealBody_CanDive` | descriptive | the stance executor's choice of a dive (D:L418888): no blocker (D:L443995), speed squared >= 900 (D:L443998) | medium |
| `0x005857e0` | 444334-444360 | -- (held) | -- | the anim set holds types 0x12 and 0x54 (D:L444344-444349) and `+0xf88` <= 8.5 (D:L444354); the stance gate's target 1 (D:L418973). The demo's `CanCrouch` fits only if stance 1 is crouch, unread | -- |
| `0x00552ec0` | 418916-419016 | `CZSealBody_CanChangeStance` | descriptive | the top blend interruptible (D:L418928), then per target stance the clearance tests and gates (D:L418937-418973) | medium-high |
| `0x005b0840` | 467169-467292 | `CZSealBody_QueueFloorIntersect` | descriptive | a downward intersect appended to a global batch, its index at `+0x2cc` (D:L467199, D:L467275-467277), read back through `SealProcessAltitude` (D:L467055) | medium |
| `0x005a2690` | 459820-460068 | -- (held) | (`WeaponHitAnim__10CZSealBodyF8AnimType10SEAL_STATEb` would fit) | the hit or (state 8) death reaction, at most 3 twitches (D:L459965), from the damage path (D:L461389/461405); the demo's takes 3 arguments, this 2 | -- |

**Unsure, for the reviewer:**
- the four argument-count mismatches with the demo, each needing a re-read before any `hand` row:
  - `CZSealBody_PushBlend`: the demo's 3, this 4;
  - `CBody_PushBlend`: the demo's 4, this `this` and 3;
  - `CZSealBody_CanFire`: the demo's none, this 2;
  - the held `0x005a2690` against `WeaponHitAnim`: the demo's 3, this 2;
- the three held addresses;
- the inferences not verified here: blend `+0x2b`'s value 8 as the dying state, the turret seat offset's units, and
  `+0xe1` bit 4's role (section 2).
