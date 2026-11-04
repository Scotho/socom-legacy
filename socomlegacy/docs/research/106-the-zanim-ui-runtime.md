# 106 -- The zAnim UI runtime: the player's frame, its scheduler, the control flow, the command ticks, and what the disc's scripts use (web sprint 7, PLAT-07)

Written 2026-10-02 for PLAT-07 (the block is `../roadmap/01-platform.md` "PLAT-07"). Read-only research. Sources: the
retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; every address
retail); for the three command ticks the decompiler folds into a neighbour (`zAnimWaitTick` 0x25ec50, FAIL's 0x25dce0,
DEBUG's 0x25cc70, `ui::UI_APP_COMMAND`'s 0x274590, QUAD_ALIGN's 0x2679e0), their disassembly as the PC project's
recompiler prints it beside each instruction (`recomp/output/*_0x<addr>.cpp`, read, not copied); the disc's
`RUN/UIZANIM.ZAR`, `RUN/EXTZANIM.ZAR` and `RUN/MPZANIM.ZAR` read with `@s2u/archive` (`Zar`) and `@s2u/scene`
(`parseAnimSets`) by probes outside the repository. Names, counts and short constants only: no disc bytes, no
decompiled text. It stands on research 95 §1 (the command encodings), 104 (the valve store) and 105 (the dialog's
nodes). The code is `packages/ui/src/zanimRuntime.ts`; the CI tests `packages/ui/test/zanimRuntime.test.ts` (synthetic
sets, each test naming its function and lines), the dev-disc test `packages/ui/test/zanimRuntimeDisc.test.ts`.

## 0. Answers

| # | finding | section |
|---|---|---|
| R106.1 | **Condition precedence: there is none.** `FUN_0025e960` reads a condition strictly left to right: each operand combines with the value so far through the operator before it (`a OR b AND c` is `(a OR b) AND c`); NOT inverts the next operand or bracketed group; `(` recurses; `)` returns. Every operand runs -- nothing short-circuits, so a bound function in a condition is always called. Sprint 5's `CONDITION_PRECEDENCE_READING` (NOT > AND > OR) is contradicted | §3 |
| R106.2 | **The in-frame order.** One scheduler list, by priority (3 on all 1,716 animations of the three archives), a new instance after every equal one, walked once a frame; each instance's sequences in file order, each with the whole frame's time. A called animation runs **later in the same frame, after its caller's step** (and after every instance ahead of it), never inside the caller's tick: sprint 5's `CALL_ANIMATION_AT_ONCE_READING` is contradicted. A blocking caller sees the callee's end on the frame after | §2, §5 |
| R106.3 | **Yields:** END_WHILE (jumps to its WHILE and is "not done") and LOOP (restarts its sequence next frame) end the sequence's frame -- `LOOP_YIELD_READING` holds, now read. A command that is not done (a WAIT, a motion, a VALVE test or a `ui::UI_COMMAND` answering false, FAIL) holds its sequence; it is ticked again next frame | §2, §4 |
| R106.4 | **A call of a running animation starts nothing.** The definition is its own first instance; a start takes the first instance of its chain that is not alive, else a new copy only where the flags allow one -- none of the disc's animations do. Sprint 5's `ZANIM_RECALL_READING` ("starts it over") is contradicted | §5 |
| R106.5 | **Activation 1 vs 2 and CALL_SEQUENCE.** A sequence whose word's byte +4 >> 1 is 1 (0x102) starts with its animation; any other (0x104) idles until CALL_SEQUENCE starts the first sequence of that name not running. Started from a sequence later in the list it runs that same frame; earlier, the next. An animation whose flags & 7 are 1 (17 on the disc, `menu_fade_up` among them) starts by itself when its set is activated | §2, §5 |
| R106.6 | **Fade timing: `UIanim.rdr`'s `menu_fade_up`**, an auto-start animation: `MENUFADER`'s opacity from 1 at -2/3 a second (rate x dt each frame), snapped to 0 when 1.5 s are up. No `ui::UI_COMMAND` of the three archives names a MENUFADER function (the probe counted none): the roadmap's "MENUFADER 26" is not a command count; MENUFADER is the fade's node | §4, §6 |
| R106.7 | **Activation guards:** 14 UIZANIM animations carry an activation sequence (`Anim_Params` +0x12), each `IF <cond> FAIL ENDIF` (FAIL is never done): run once with 1.0 s at the start, it refuses the start when its condition holds | §5 |
| R106.8 | **The disc's inventory** (§4): set 0 commands {1, 2, 3, 4, 5, 11, 14, 15, 17, 22, 25, 30, 39, 40, 43, 44, 45, 46, 47, 48, 50, 51, 52, 61}, condition tokens {7, 10, 43, 61} and set 1's `ui::UI_COMMAND`; no `ui::UI_APP_COMMAND` anywhere. The runtime implements every one, and each flag the disc sets; the dev-disc test fails on any other | §4 |
| R106.9 | **Valves come from the store** (research 104): a name a VALVE command or a motion reads is found or made at TEMP on first use, per instance (`FUN_0026eb30`), and every op goes through `ValveStore.apply` -- not through sprint 5's per-context map | §4 |

**The proven level** is PLAT-32's: script-trace goldens for the main menu, the options and the ARMORY. Everything here
is the reading level.

## 1. Where the player lives

The zAnim context is the global block at 0x414bb0: +0x38 the current instance (`DAT_00414be8`), +0x3c the current
sequence state (`DAT_00414bec`), +0x30 the command table. The commands are registered by `FUN_0025bc20`
(D:L106865-106924) through `FUN_0026a8e0` (D:L115268-115305: a name, then a begin, a tick and an end function); set 0
numbers them from 1 in registration order, which matches `@s2u/scene`'s `ZANIM_COMMAND_NAMES`. An instance is its
`Anim_Params` block followed by the player's fields: +2 paused, +3 state, +4 the flags word, +8 its clock, +0xc the
priority (an f32), +0x10/+0x12/+0x14/+0x16 the four sequence offsets reCOM names damage, activation, execution and
cleanup. A sequence state is the 28-byte head: +2 LOOP's count, +4 a pause bit and the activation, +5 the state, +6 the
command phase, +7 the IF depth, +8 the pc, +0xc the size, +0x10 the time its commands consumed, +0x14 the current
command's, +0x18 LOOP's clock.

## 2. The frame

- **The scheduler** (`FUN_0034e6b0` D:L248794-248846): an instance joins a list ordered by priority, before the first
  entry of a greater one -- after every equal one. All 1,716 animations of the three archives carry priority 3, so the
  list is in start order. `FUN_0034e070` (D:L248531-248567) walks it once a frame by its links, so an entry added during
  the walk is reached in the same walk; a killed entry (`FUN_0034e560` D:L248728-248742, set by a stop) is dropped
  without a call; an instance whose tick reports it finished is dropped.
- **An instance's tick** (`FUN_00270220` D:L118623-118662): a paused instance does nothing. Its execution guard
  (+0x14) must finish in one 1.0-s step (`FUN_0026d870` D:L117101-117127), else nothing runs this frame. A just-started
  instance is set up (`FUN_0026ae20` D:L115457-115509: its clock zeroed, every sequence of activation 1 started, the
  others idle). Then its sequences are stepped in file order while it is neither done nor paused, each judged running
  or not right after its own step (D:L118642-118646) -- so a sequence started behind the walk does not keep the
  instance alive. Its clock advances by the frame; with no sequence running it ends (`FUN_0026ff20(5)`, D:L118651-118654:
  the cleanup sequence +0x16, once).
- **A sequence's step** (`FUN_00269da0` D:L114845-114910): state 2 (started) zeroes LOOP's count and clock and the IF
  depth; 2 and 3 (restarted) zero the consumed time and put the pc at the first command (+0x1c), its begin due. Then
  commands run while time is left: **with none left only a timeless command runs** (header bit 17, D:L114886-114892 --
  the disc's VALVE, WAIT, both motions, QUAD_ALIGN and DEBUG are not timeless); a command not done ends the step; a
  done one moves the pc past it; past the last the sequence is done.
- **A command** (`FUN_0026a6e0` D:L115182-115213): begun when due (its consumed time zeroed), then ticked in the same
  call with the frame's time left by reference; what the tick takes off is the time it consumed. A command with no tick
  is done.

## 3. The condition (`FUN_0025e960`, D:L108302-108424)

A condition is the run of commands an IF, ELSEIF or WHILE carries from its +8 to its end: VALVE tests, bound functions
(`ui::UI_COMMAND`), NODE_ACTIVE and RANDOM_WEIGHT, and EXPRESSION tokens (+4: 1 NOT, 2 AND, 3 OR, 4 `(`, 5 `)`). The
evaluator walks them as commands, with the pc:

- an operand -- a command, run as any command is (D:L108380, D:L108389) -- or a bracketed group (D:L108325-108327)
  combines with the value so far through the pending operator: 3 OR, 2 AND (D:L108339-108351, D:L108398-108409); 1
  "not the operand", which no token reaches (byte 1 is NOT); 0 or any other byte gives false (D:L108335-108337,
  D:L108394-108396). The first operand is the value. **No precedence; no short circuit.**
- NOT sets a flag that inverts the next operand (D:L108329-108332, D:L108369-108372, D:L108383-108386).
- `)` returns the value at once (D:L108366-108368); the caller steps past it.
- **The end:** an operand after a value with no operator pending -- the command after the IF -- puts the pc back on the
  last token and returns (D:L108375-108379). The step then moves past that token. So two operands with no operator
  between them inside one IF run the second as a statement when the condition is true (tested; no condition of the
  three menu archives has one; the maps' one, MP64's `bugs_flying`, is research 89 §18).
- **The effects' IF is this one** (LATER 310, 2026-10-22; reading, pending review): the maps' and the common effect
  animations run through the same command table (`FUN_0025bc20` D:L106866), dispatcher (`FUN_0026a6e0` D:L115192) and
  instance tick (`FUN_00270220` D:L118642), so their `IF` is `FUN_0025e7a0` and its condition `FUN_0025e960`
  (D:L108218). The viewer's effect runner folds it through `evaluateCondition` since LATER 310; the sweep of every
  map's conditions, and the edge's count on the maps' archives, are research 89 §18.

**IF** (`FUN_0025e7a0` D:L108214-108282): the depth +1; the condition from +8; true leaves the pc on the last token; false
walks command by command to the ELSE, ELSEIF or ENDIF whose +4 depth is the current depth (an ENDIF there takes the depth
back down), and at an ELSEIF tests its condition in turn. **ELSEIF and ELSE** reached from a branch that ran
(`FUN_0025e6d0` D:L108171-108197) walk on to their ENDIF. **ENDIF** (`FUN_0025e6a0` D:L108154-108155): depth -1. The
depth is a byte (`FUN_002681c0` D:L113710-113721): a step outside 0..255 leaves it and flags the instance.

**WHILE** (`FUN_0025e630` D:L108138-108145): +4 bit 0 forever; else a false condition puts the pc at its +6, which is
**its END_WHILE's offset from the sequence's head** (all 412 WHILEs of the three archives; the probe), and the step
moves past it. **END_WHILE** (`FUN_0025e600` D:L108126-108127) puts the pc at its +6 -- its WHILE's offset (all 412) --
and is not done: the sequence's frame ends there. **BREAK** (`FUN_0025e520` D:L108085-108117) walks on to the next
END_WHILE of any depth, taking the IF depth down at each ENDIF of the current depth it passes; the step moves past it.

## 4. The commands, and what the disc uses

Counted over every sequence of the three archives (UIZANIM 95 sets, 92 with animations, 1,525 animations, 1,935
sequences, 26,418 commands; EXTZANIM 95 / 2 / 61 / 88 / 691; MPZANIM 95 / 4 / 130 / 174 / 1,128):

| cmd | name | uses (UI / EXT / MP) | tick (begin) | what it does |
|---|---|---|---|---|
| 1 | QUAD_ALIGN | 872 / 0 / 0 | 0x2679e0 | done (`return 1`, its disassembly) |
| 2-5 | IF ELSEIF ELSE ENDIF | 2,195 / 1,851 / 761 / 2,195 in UI | §3 | §3 |
| 7 | NODE_ACTIVE (token only) | 18 / 0 / 0 | `FUN_0025e230` D:L107965-107984 | +6 the node; +4 1 true if the node's +0x5c bit 0 is set, 2 if clear; no node false |
| 10 | RANDOM_WEIGHT (token only) | 7 / 0 / 0 | `FUN_0025dcf0` D:L107783-107792 | rand x 4.656613e-10 (2^-31 as an f32) <= the f32 at +4 |
| 11 | FAIL | 16 / 0 / 0 | 0x25dce0 | never done (`return 0`); false as a token. All 16 are the guards' (§5) |
| 14 | LOOP | 56 / 6 / 13 | `FUN_0025ede0` D:L108458-108472 | count +1, clock += dt + the consumed time; flag 1: done when the count equals +8 (-1 never: all 75 are `1, -1`); flag 2: done when 0 <= +8 <= the clock; else the sequence restarts next frame |
| 15 | WAIT | 576 / 29 / 60 | 0x25ec50 (`FUN_0025ed50` D:L108436-108448) | flag 8: not done while dt + the base <= +8 (the base the command's consumed time; flag 2 the sequence's, 4 the instance's clock), else done with the rest of dt passed on; flag 0x10 counts ticks against +8 (+0xc with 8); flag 0x20 draws +8 at random. **All 665 carry flags 9** |
| 17 | OBJECT_ACTIVE_STATE | 4,420 / 94 / 159 | `FUN_00263aa0` D:L111360-111369 | +6 the node shown (+4 == 1) or hidden |
| 22 | OBJECT_MOTION_FROM_TO | 1,068 / 0 / 0 | `FUN_0025f9b0` D:L108905-109030 (`FUN_0025fe70` D:L109092-109340) | below |
| 25 | OBJECT_OPACITY_FROM_TO | 247 / 23 / 18 | `FUN_0025f880` D:L108814-108831 (`FUN_0025f960` D:L108842-108845) | begin: opacity = +8; tick: done when +0x14 < dt + consumed -- opacity = +0xc and the rest of dt passed on -- else opacity += +0x10 x dt |
| 30 | SOUND | 373 / 14 / 12 | `FUN_002659c0` D:L112317-112510 | the host's; always done (its one `return 1`, D:L112510) |
| 39, 40, 44 | WHILE, END_WHILE, BREAK | 372, 372, 280 in UI | §3 | §3 |
| 43 | EXPRESSION (token only) | 1,817 / 34 / 62 | none (D:L106907) | §3 |
| 45 | CALL_ANIMATION | 1,163 / 15 / 33 | `FUN_0025d550` D:L107473-107481 (`FUN_0025d5c0` D:L107571-107779) | §5. All 1,211 are 20 bytes with +0xc, +0xe and +0x10 zero and flags 0, 0x200, 1 or 0x201 |
| 46 | STOP_ANIMATION | 376 / 29 / 31 | `FUN_0025d490` D:L107444-107461 | §5 |
| 47, 48 | PAUSE / RESUME_ANIMATION | 2 / 2 in UI | `FUN_0025d3d0` D:L107411-107431, `FUN_0025d330` D:L107384-107399 | §5 |
| 50, 51 | CALL / STOP_SEQUENCE | 260 / 26 in UI (50: 33 EXT, 58 MP) | `FUN_0025d270` D:L107349-107351, `FUN_0025d230` D:L107336-107338 | §5 |
| 52 | DEBUG | 12 / 0 / 0 | 0x25cc70 | done (`return 1`) |
| 61 | VALVE | 3,245 / 54 / 61 (+4,732 tokens) | `FUN_00353fd0` via 0x353d00 | research 104; flags 2 (by name) on 3,180, 0x1a (an operand valve by name) on 180; none reads the context's input valves |
| set 1: 1 | `ui::UI_COMMAND` | 5,678 / 165 / 287 (+579 tokens) | `FUN_002745a0` D:L121344-121431 | the host's (PLAT-08); its answer is the truth and, as a statement, whether it is done |
| set 1: 2 | `ui::UI_APP_COMMAND` | 0 | 0x274590 | done (`return 1`) |

**The motion, as the disc uses it** (all flags seen: 0x300 with a scale block 626, 0xa with a position block 290, 0x61
134, 0x8 with a position block 12, 0x40 6; every position block's flag byte 0): the begin places the node at "from" --
where the node is (flag 2 clear: "from" stored over, D:L109109-109115) or the stored one -- and, unless "from" was
stored, sets the rate to (to - from) / time (D:L109231-109256), so 0xa moves at its stored rate; a scale with 0x100
starts at the stored "from" at the stored rate (D:L109310-109339); a rotation's "from" is the node's orientation unless
0x20 sets the node to the stored one (D:L109291-109302). The tick: done when +0x34 < dt + consumed -- the scale, the
rotation (flag 1: to x from, `FUN_003070c0`) and the position (flag 1: from + to) set to their ends -- else the position
+= rate x dt (only with flag 8 or 0x10, D:L108981), the rotation slerped at (dt + consumed) / time (`FUN_00306ae0`
D:L205927-205998: a normalised lerp above a 4-dot of 0.95, the sine weights below it, not normalised), the scale +=
rate x dt. The runtime also models flags 0x80 (to = another node's orientation), 0x400 ("to" from three valves) and
0x2000 (no final position) and position-block bit 2 (the time from a speed); it refuses flags 0x4 and 0x10 (the
caller's arguments), 0x800 and 0x1000 (curves) and position-block bits 0 and 1 (node world positions) -- none on the
disc.

## 5. Starting, calling, stopping

- **A start** (`FUN_002734b0` D:L120717-120801) is refused at once unless its set is active: it opens with the set's
  byte +1 (D:L120734-120737), which the set's activation sets before it starts anything (D:L116324-116325) and its
  deactivation clears. A start before the activation, or a CALL_ANIMATION that resolves into a set not active, starts
  nothing (and a blocking call is then not held: its slot has no instance). Then the instance is `FUN_00270ef0` (D:L119142-119216): a disabled one
  (+0x34 bit 0, the flags' bit 19 at the set's activation) starts nothing; else the first of the definition's chain
  that is not alive; if all are, a new copy when flag 0x80 is set and the count is under (flags & 0x7ffff) >> 13 -- no
  animation on the disc sets 0x80 (flags 0x21 on 17, 0x22 on the rest). So **a start of a running animation starts
  nothing**. The instance is set started (2), its activation guard (+0x12) stepped once with 1.0 s: still running, the
  start is refused (the instance ends). Then it joins the scheduler.
- **The activation guards** on the disc: 14 UIZANIM animations (`add_a_mission`, the `OnNetError` /
  `OnMultiplayerDisconnectFromOptions` / `OnDNASError*` handlers, `CountDown`, `exit_lobby`,
  `goto_eq_mp_set_return_valve`, `OnExit`), each a 0x104 sequence of `IF <cond> FAIL ENDIF` (two of them twice; `CountDown`'s followed by a VALVE): the
  condition true, FAIL holds the guard and the start is refused.
- **A set's activation** (`FUN_0026c600` D:L116312-116388, once per set): every animation whose flags & 7 are 1 and
  which is idle or done starts (`FUN_002713f0` D:L119314-119338). On the disc: `UIanim.rdr`'s `menu_fade_up` (in all
  three archives), `uianimXP.rdr`'s `led`, `dlgCreateGame`'s `missionsel_popup_onstart`, five `playerinfo_onstart`, and
  `menu_fade_up` in `dlgExitState`, `dlgMultiplayerRound`, `dlgMultiplayerFinal`, `dlgMultiplayerFinalReally`. When the
  menu activates a set is PLAT-10's. The disabled bit (+0x34 bit 0, from byte +6 bit 3) is taken for every instance of
  the +100 chain, copies included (D:L116340-116344), and every instance of the chain is offered the start
  (D:L116369-116371). For each instance `FUN_002713f0` first runs `FUN_00271650` (D:L119419-119457): it clears the
  instance's resolved node references, then calls `FUN_0026f210` (D:L118051-118115), which re-resolves every reference
  left empty through `FUN_0026f4e0` (D:L118099-118112) -- and, when the flags carry bit 12 (byte +5 bit 4,
  D:L118066), first gives the instance a node of its own: allocated (`FUN_00180e10(0xc0)`, `FUN_00316e30`), named
  through the format at 0x3ed460 and registered in the instance's reference slot (D:L118082-118097). On a set's first
  activation `FUN_0026f120` (D:L118009) registers the references with the set. The runtime resolves a node by name at
  each command and keeps none, so the clearing and re-resolving are modelled as nothing. Activation bits 3
  (`FUN_002740e0` D:L121133, a node attachment), flags bit 11 (`FUN_00271250` / `FUN_00271390`, D:L116360-116366)
  and flags bit 12 (the own node) are not modelled and are refused (`activationUnsupported`), atomically: every set an
  `activate` call reaches is checked before any is activated. The disc has none of the three: flags 0x21 on 17
  animations, 0x22 on 1,699, bit 12 on none (the dev-disc test holds `zanimUnsupported` empty on every set).
- **A set's deactivation** (`FUN_0026c2e0` D:L116142-116181): every instance of every animation, copies included, is
  stopped (`FUN_002707c0(inst, 0)`), its node and sound state reset (`FUN_0026fbf0(inst, 1)`, not modelled) and its
  objects released (`FUN_0026fe90`, not modelled); then byte +1 is cleared, so the next activation runs again. The
  runtime's `deactivate`; when a menu leaves is PLAT-10's.
- **CALL_ANIMATION** (begin `FUN_0025d5c0`): the caller's call slot for (+7 the name, +6) (`FUN_0026e650`
  D:L117597-117647) -- made on first use, its definition looked up by name (`FUN_0026a250` D:L115013-115072: `set::name`,
  else one set first, then the others; `FUN_0026c8f0` D:L116531-116544 case-insensitively) -- and the start's instance
  kept in the slot (D:L107763-107770), or none. The callee is in the scheduler's tail: it runs in this frame's walk after
  every instance ahead of it. A name no set defines does nothing. The tick (`FUN_0025d550`): with flag 0x200, not done
  while the slot's instance is alive -- the caller is stepped before the callee each frame, so it sees the end on the
  frame after.
  *2026-10-23, MLS-PASS: flag 1's string input inheritance is now modelled, reviewed reading (source/code PASS at
  `864603c5f`)
  ([research 363](363-native-ui-call-inputs.md) §§1-2). `FUN_0025d5c0` D:L107577-107592 copies the caller instance's
  inputs and uses `FUN_00272bb0` / `FUN_00272c30` when any are present (D:L107763-107770); parameterized starts
  replace the callee's input list before its guard (D:L120405-120414, D:L120615-120620), while a plain
  `FUN_002734b0` start does not replace it. The current instance is saved/restored around ticks and guards
  (`FUN_00270220` D:L118623-118662; `FUN_0026d870` D:L117109-117124). Other argument-producing CALL flags and
  argument blocks remain unsupported and refused.*
- **STOP_ANIMATION** (`FUN_0025d490` D:L107444-107461): the slot named by +4 (`FUN_0026e4c0` D:L117548-117593); if it
  holds an instance, that one is stopped if alive and the slot emptied; else the slot's definition -- the animation's
  first instance -- is stopped if alive. So a script stops an animation it never called. A stop (`FUN_002707c0`
  D:L118829-118895) kills its scheduler entry and ends it (the cleanup sequence once); flag +5 bit 0 also stops its
  sounds (not modelled).
- **ui::UI_COMMAND** (`FUN_002745a0` D:L121344-121431): with a node (+4), the command goes first to the node's object's
  handler (vtable +100, D:L121370-121385), which answers through a pointer when it takes it; with no object, or not
  taken, it falls back to the global table at 0x3dd4d0 keyed on `names[+6]` (`FUN_00198b80`; 0xE8 when the name is
  absent), the key cached in byte +10 (D:L121387-121429); nothing taking it, the answer is 1. The runtime hands the
  host the node, +6, `names[+6]` and the bytes; both halves are PLAT-08's.
- **PAUSE / RESUME_ANIMATION**: +4 0 pauses the instance itself (its step stops at once, D:L114893-114895); otherwise
  the slot's instance or definition, as STOP. RESUME has no "itself".
- **CALL_SEQUENCE** (`FUN_00269b00` D:L114714-114760): the first sequence of that name (`strcmp`) not running is
  started: one whose state (+5) is 2, 3 or 4 is skipped, so a second call while the first runs leaves it alone -- no
  restart (re-read 2026-10-19 for LATER 138: BREACH's `breach_success` calls `failure` again after `start`'s or `defuse`'s
  call; research 89's "restarts" corrected). **STOP_SEQUENCE** (`FUN_00269930` D:L114646-114696): the first running one is done.

## 6. The fade, `SwitchMenu`, and what is the menu's

`UIanim.rdr` (in every archive) holds 19 animations; `menu_fade_up` is one OBJECT_OPACITY_FROM_TO on `MENUFADER`: 1 to 0
at -0.6666667 a second, 1.5 s. Under `FUN_0025f880` the opacity is 1 - 2/3 t until 1.5 s are up, then 0 exactly (the
dev-disc test runs it). `goto_menu` / `goto_menu_silent` / `switch_menu` stop an animation and start a 0x104 sequence
holding `ui::SWITCHMENU` -- the switch, not a fade-down, is what they script.

`SwitchMenu` (`FUN_0027e720` D:L126554-126640) is a bound function (PLAT-08's, PLAT-10's to run): its argument `INPUT_STRING`
takes the caller's argument; `PREVIOUS_SCREEN` queues a type-5 record naming the history's top (`DAT_00415700`, depth
`DAT_004156fc`) and pops it; a target equal (`strcasecmp`) to the history's top is the same back; any other queues a
type-2 record with the name through the format at 0x3eebc8 (not in the strings list; not read). It sets no timing; the
menu's tick rate is PLAT-12's.

## 7. Corrections to earlier notes and to sprint 5's runner

Research 95 §1.4 and `viewer/src/uiScript.ts` are not edited here (the ARMORY's runner is PLAT-34's to fold).

| where | what it says | what the decompilation shows |
|---|---|---|
| R95 §8 `CONDITION_PRECEDENCE_READING` | NOT, then AND, then OR | no precedence: left to right (§3). The ARMORY's mixed conditions all bracket, so its truth is unchanged |
| R95 §8 `CALL_ANIMATION_AT_ONCE_READING` | the callee runs at once inside its caller's tick | it runs later in the same frame, after the caller's step (§2, §5). What `UiEquipSwitch` shows in that frame may differ: PLAT-34 checks it |
| R95 §8 `ZANIM_RECALL_READING` | a call of a running animation starts it over | it starts nothing (§5) |
| R95 §8 `LOOP_YIELD_READING` | a WHILE's pass back and a LOOP yield | confirmed (§3, §4) |
| R95 §1.4 "END_WHILE jumps back by its u16 +6" | a relative jump | +6 is the WHILE's offset from the sequence's head; a WHILE's +6 is its END_WHILE's (§3) |
| R95 §1.4 "A name no set defines is a no-op" | -- | holds; the lookup is case-insensitive, `set::name` or one set first then the rest (§5) |
| `uiScript.ts` `stop` | stops every instance of a name | stops the slot's instance, else the definition (§5) |
| `uiScript.ts` WAIT / opacity | interpolates the opacity by t / time | adds rate x dt, snaps to "to" at the end (§4) |
| `uiScript.ts` a statement VALVE test, a `UiHost.command` answering false | done | not done: the sequence waits on it (§2) |
| roadmap PLAT-07 "MENUFADER 26" | among the command counts | no bound function of that name is called; `MENUFADER` is `menu_fade_up`'s node (§6). What the 26 counted was not found |

## 8. What is settled, what is not, what would settle it

- **Settled at the reading level**: §2-§6, each test of `zanimRuntime.test.ts` transcribed from the lines it names; the
  disc's inventory and the WHILE jumps by probe, the inventory held by the dev-disc test.
- **Not settled**:
  - The "current set" the call lookup searches first (`ctx+0x34`, not traced): `CALL_SET_SEARCH_READING`.
  - How the menu binds a `Node_Ref_List` name to its object: read 2026-11-02 (task Cz2blD4S; reading, pending review)
    -- `FUN_0026f4e0` (D:L118182-118230) resolves through `FUN_00269230` (D:L114366-114413) to the menu object's vtable
    +0x24, `FUN_00315d00` (D:L215255-215290): `strlen` (`FUN_00199288`), then `strcmp` (`FUN_00198f18`
    D:L15765-15861), a level's children before each child's subtree -- exact, so `dlgLadderLobby`'s `Medal_Blue` and
    `medal_blue` are two nodes (research 269 §4.2), and a name no node spells exactly reaches none of the dialog's
    (`NODE_NAME_MATCH_READING` = `exact`). Three steps of the resolve are not traced and not modelled (research 183
    §18): a reference's parent index (`FUN_0026f4e0`'s byte 0, a search within the parent's subtree); the menus at
    +0x6ba0 (`FUN_00269230`, an exact search of each); and, for modes 0 and 2 after the exact searches fail, the
    case-insensitive search of the global list at 0x45c3c0 (`FUN_0031fd10` -> `FUN_00320f10` -> `FUN_00312120`,
    D:L221082-221088, D:L221750-221773, D:L213012-213038, `strcasecmp` `FUN_00198b80` D:L15551-15607 -- the list
    `FUN_00321390` searches for textures by name, e.g. D:L57282), not the dialog's nodes. No disc reference needs them
    (`nodeNameCaseDisc.test.ts`: none reaches a node only by folding, models included): `NODE_NAME_MATCH_READING`.
  - What a dialog's node holds before a script: `DIALOG_NODE_STATE_READING`; whether NODE_ACTIVE's +0x5c bit is what
    OBJECT_ACTIVE_STATE's vtable +0x38 writes: `NODE_ACTIVE_FLAG_READING`.
  - `FUN_003070c0`'s w term: `QUAT_PRODUCT_READING`.
  - `FUN_00197740`'s generator and seed (the runtime takes a `random` source; RANDOM_WEIGHT and a random WAIT throw
    without one): `ZANIM_RAND_SOURCE` below.
  - Not modelled: an instance's attached sounds in "alive" (`FUN_00270e40`), the node resets at an instance's end
    (`FUN_0026fd20`, `FUN_0026fbf0`, `FUN_0026fa80`), the end callback (+0x1c), CALL_ANIMATION's other argument-producing
    flags and argument blocks (flag 1's string-input inheritance added 2026-10-23, [research 363](363-native-ui-call-inputs.md)), a
    sequence's own pause bit (no command sets it), the deactivation's node resets and releases (§5); refused rather
    than dropped: activation bits 3, the flags bit 11 path and the flags bit 12 own node of a set's activation (§5,
    none on the disc). A command's bytes are copied per definition (the original writes some -- a motion's "from" and rate, a
    WAIT's counter -- in place; every such field is rewritten at the command's begin before it is read, so the copy
    changes nothing the disc's scripts can see).
- **What settles it**: PLAT-32's script trace (the runtime emits its own: one event per command run, start, refusal,
  end and stop); a read of `FUN_00269230` and of the UI objects' vtable +0x38.

## 9. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `CALL_SET_SEARCH_READING` (`packages/ui/src/zanimRuntime.ts`) | the set a called name is looked up in first | `FUN_0026a250` (D:L115027-115032) takes `(ctx+0x34 - base) / 0x34`, not traced; the caller's set, then the others in load order | reading |
| `QUAT_PRODUCT_READING` (`packages/ui/src/zanimRuntime.ts`) | `FUN_003070c0`'s product | the vector part as the decompilation shows (D:L206157-206161); w = to.w from.w - to.from, the decompilation subtracting an uninitialised word besides (D:L206162-206163) | reading |
| `NODE_NAME_MATCH_READING` (`packages/ui/src/zanimRuntime.ts`) | a `Node_Ref_List` name to the dialog's node | the node spelled exactly, no folding (`FUN_00315d00` D:L215255-215290, `strcmp`); not traced: the parent index, the menus at +0x6ba0, the global 0x45c3c0 list's `strcasecmp` search (`FUN_00320f10`); 2026-11-02, was case-insensitive first-wins, which drew PLAYER RANKING's five medals at once (research 269 §4.2) | reading, pending review |
| `DIALOG_NODE_STATE_READING` (`packages/ui/src/zanimRuntime.ts`) | a node before any script | (XPOS, YPOS, 0), the record's OPACITY, active, scale 1, no rotation; where `CGameMenu_LoadFromDesign` (D:L263400) stores them not read | reading |
| `NODE_ACTIVE_FLAG_READING` (`packages/ui/src/zanimRuntime.ts`) | NODE_ACTIVE's +0x5c bit 0 and OBJECT_ACTIVE_STATE's vtable +0x38 | taken as one `active` flag; the vtable's body not read | reading |
| `ZANIM_RAND_SOURCE` | `FUN_00197740`'s sequence | not modelled: the caller supplies `random`; the original's generator and seed are not read | *note only* |
