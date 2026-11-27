# 434 -- What sets the controller's +0x171 bit 7, which gates the AI-map correction (WM-HOSTAGE task 1)

- Date: 2026-11-15. Author: the wm-hostage lane seat's reader (one reader), filed by the wm-hostage lane seat, Shadow PC 3.
- Track: **simulation**. Level: **reading, pending review** for every code and byte line (one reader); the rig's values
  are relayed from the original running (r0004, MP71; through the main controller, not harness-scored).
- What it changes: since 2026-11-15 the port's gate (s9a: `match/src/hostageFollow.ts`, the bit and its writers). It is the reading the main controller ruled (2026-11-15, research 434 claimed)
  before gating the port's AI-map correction (`match/src/hostageFollow.ts` move(), the port of the gate at
  D:L413920-413922), the cause of a following hostage held in Fish Hook's doorway (the R1 case).
- Revised after review 1 (FAIL; record `agent/wm-hostage-records` `review-records/research-434-review-1.md`).

Draft, 2026-11-15. One reader (this author).
- **Build.** r0001, `D:\s2u\socom_pc\game\disc\socom2_game.elf` (4,835,072 bytes). `D:L` lines are its decompilation.
  The r0004 served ELF (`D:\s2u\socom_pc\game\r0004\served\socom2_game_served.elf`, 5,016,064 bytes) was scanned for
  the same patterns (s6).
- **Machine code** is cited "r1 0x<addr>" / "r4 0x<addr>".
- **Levels:**
  - **reading**: one reader, so "reading, pending review";
  - **measured (rig, ...)**: the rig's records, as relayed or as read here from the rig's files;
  - **unread**.
- **Scripts.** Small standard-library decoders (read-only), in the author's scratch directory outside git; named
  below by file name only.
- **Prior work.** This note re-derives research 404 s13.1-s13.2 and s14 independently from the bytes, and agrees
  with them where they overlap. It adds the complete store table and the slot-call census, and it corrects the brief's
  premise on the two zeroings (s3).

## 1. The answer in short

- **There is no inline setter.** Bit 7 of `+0x171` is written by exactly three small leaf functions. None is in the
  decompilation's function list. Each is the `+0xb4` slot of its class's vtable [reading]:
  - r1 0x557ee0, `CSealCtrlAi` (vtable 0x6693f0, type record 0x65c6d0): the hostage's controller;
  - r1 0x592030, shared by `CSealCtrl` (0x6694b0), `CRemoteCtrl` (0x669590) and `CSealCtrlSquirm` (0x6699f0);
  - r1 0x2b3c70, `CSealCtrlCopy` (0x4062d0, type record 0x3f1f08).
  - The names come from the type records' strings (r1 0x65c6d0, 0x65c6a0, 0x662748, 0x662ee8, 0x3f1f08). Earlier
    revisions called the last class "type-4"; that label is dropped.
- **Each writes bit 7 := the low bit of its argument.** 0x557ee0 forces 0 while movement state `+0x3f4` is 7.
- **Slot `+0xb4` is called from exactly 16 sites** (s4). The value at each site decides the bit:
  - 1 at the AI reset;
  - 1 on leaving or suspending follow;
  - 0 on entering or resuming follow;
  - the follow tick's own value, written only on ticks where the top goal is follow (`+0x30` == 9). That value is 0
    in a network game: its one 1-branch needs the multiplayer byte clear. When another goal is on top, the tick takes
    `FUN_0056d090`, which writes nothing to the bit, except 0 through `FUN_0056cbf0`'s state-7 entry. That entry
    fires in two cases: `FUN_0054f6e0` is non-zero, or the saved `+0x3f5` already holds 7 (s4);
  - 1 when an obstacle record matures;
  - movement state 7: on entry the bit is saved into `+0x448` bit 0x80000 and cleared. On exit the saved value is
    passed back, **but for the hostage's controller the restore never sets the bit**. `+0x3f4` is still 7 at that call,
    and the AI class's setter forces 0 then (s4). The restore takes effect only for classes whose slot is 0x592030 or
    0x2b3c70;
  - 0 at teardown;
  - 0 or 1 around vehicle use (which is which is inferred, s4).
- **The rig's shut door fits the suspend/resume pair.** The bit is set for about 1.2 s before the open, while
  CAiSAction sits above CAiSFollow, and the follow goal is back on top after the open. [the fit is a reading; the bit
  is measured (rig, Q24 retry)]
- **`DAT_0066b000` is never stored.** It lies in the zero-filled part of the data segment, and the code holds exactly
  four loads of it and no store, no address-taken pointer and no data word pointing at it. It is 0 in the shipped game.
  r0004's image of it, r4 0x66a980, is the same. [reading]
- **`+0x172` bit 0** is set by the initialiser and cleared or set only by `FUN_005b7ba0`, the cell locate (s5).
  [reading]

## 2. The gate

- **The function** is `FUN_005483d0` (D:L413291; 0x5483d0, 5,592 bytes), the body's per-tick move: collision and
  placement. It is called each tick from `FUN_005506a0` (D:L417825). `param_2`/s5 is the body, and `piVar15[0x30]`
  is body `+0xc0`, the controller. [reading]
- **The test** (D:L413920-413922; r1 0x549740-0x549774) [reading]:
  - r1 0x549744 `lbu v0,-0x5000(at)` loads `DAT_0066b000`; non-zero branches straight to the correction (r1 0x549748);
  - r1 0x54974c `lw v1,0xc0(s5)` takes the controller;
  - r1 0x549750 `lbu v0,0x171(v1)` and the shift pair at r1 0x549754-0x549758 isolate bit 7; zero skips (r1 0x54975c);
  - r1 0x549764 `lbu v0,0x172(v1)` with `andi 0x1` (r1 0x549768); set skips (r1 0x549770).
- **The correction call** is r1 0x5497b0 `jal 0x516f10` (`FUN_00516f10`, D:L413925). It passes the AI-map root
  0x66a1b0, body `+0xe4`, and body `+0xf54` (the proposed move). [reading]

## 3. Every store to the bitfield bytes: the census

**What was scanned.** Every word of the two executable-flagged segments of r1 (0x100000 and 0x1e7000/0x4c5380; flags
5 and 7) was decoded for:
- `sb` with immediate 0x171;
- `sh`, `sw` or `sd` with immediate 0x170;
- `sd` at 0x168. An 8-byte store at 0x168 covers 0x168-0x16f only, so it cannot touch `+0x171`; it was listed and
  excluded.

Stack-relative stores (base `sp`) were excluded. For each `sb 0x171`, the instructions before it were decoded for the
AND mask and the OR value. (`stores.py`, `sb171.py`.)

| site (r1) | function | bit(s) written | value | can set bit 7? |
|---|---|---|---|---|
| 0x2b378c, 0x2b37a4 | unlisted, after `FUN_002b3650` (`CSealCtrlCopy`) | bit 3 (`and ~0x08`) | constant 0 (`andi v0,zero,1`) / 1 | no |
| **0x2b3c8c** | **unlisted leaf at 0x2b3c70** (`CSealCtrlCopy` slot `+0xb4`, vtable 0x4062d0 + 0xb4 = data word at 0x406384; no state-7 test) | **bit 7** (`and -129`, `sll 7`) | argument bit 0 | **yes** |
| **0x557f24** | **unlisted leaf at 0x557ee0** (`CSealCtrlAi` slot `+0xb4`, data word at 0x6694a4 = 0x6693f0 + 0xb4) | **bit 7** | argument bit 0, forced 0 when `+0x3f4` == 7 (r1 0x557ee0-0x557ef0); written only when it differs (r1 0x557ef8-0x557f08) | **yes** |
| 0x578ca4 / 0x5791a8 / 0x579d40 | `FUN_00578990`, `FUN_00578f90`, `FUN_00579a30` | bit 2 | arg / 1 / 1 | no |
| **0x59204c** | **unlisted leaf at 0x592030** (slot `+0xb4` of vtables 0x6694b0, 0x669590 and 0x6699f0: data words at 0x669564, 0x669644, 0x669aa4) | **bit 7** | argument bit 0 | **yes** |
| 0x5920bc | `FUN_005920a0` | bit 4 | arg | no |
| 0x592230 | `FUN_005920c0` | bit 5 | 0 | no |
| 0x592c04 / 0x592c24 / 0x592c90 | `FUN_00592bf0` / `FUN_00592c10` / `FUN_00592c70` | bit 0 | 0 / 0 / 1 | no |
| 0x595628 / 0x59567c / 0x5956c0 / 0x595700 / 0x595718 | `FUN_00594cf0` | bits 5, 4 | | no |
| 0x597ee0 / 0x597fd8 | unlisted after `FUN_00597c00`; `FUN_00597f50` | bit 3 | | no |
| 0x5984dc ... 0x5987f0 (10 sites) | `FUN_00598280`, the base initialiser | masks held in registers; the decompilation gives bits 7, 0, 1, 2 cleared, 3 set, 4, 5, 6 cleared (D:L454749-454827) | | no: bit 7 is only cleared (D:L454749) |
| 0x5995b4 | `FUN_005994a0` | bit 6 | 1 | no |

Word stores at `+0x170` in the AI range [reading]:
- r1 0x55341c (`FUN_005533e0`) and r1 0x553f04 (`FUN_00553ea0`) store a vtable pointer `&PTR_PTR_00669210` at
  `param_1[0x5c]`. That is an embedded sub-object at `+0x170` of a different class (D:L419080, D:L419422), not a
  controller.
- r1 0x505a74 (`FUN_005058a8`) writes a buffer pointer (D:L374600).
- The other non-stack word stores at 0x170 lie in 0x1b8000-0x3ab000 and were not traced. That they belong to other
  classes, and not to the AI controllers, is an assertion, not a reading. [unread]

**A correction to the brief's premise.** The "whole-byte zeroings" at D:L434773 and D:L435175 are not writes to
`+0x171`. In both lines the pointer is typed `int *` (`FUN_00573130(int *param_1)`, D:L434684; `puVar1` 4-byte in
`FUN_00574080`). So `param_1 + 0x171` is byte offset 0x5c4. The machine code confirms it: r1 0x573434 `sb
zero,0x5c4(s3)` and r1 0x574244 `sb zero,0x5c4(s0)`. Neither function has any store at 0x170 or 0x171 (`find_off.py`).
[reading]

**Limits of the census.** It finds stores with a literal 0x171/0x170 displacement. It would miss:
- a store through a pointer already advanced into the controller (e.g. `sb x,0x71(base+0x100)`);
- a block copy (`memcpy`) of a whole controller;
- a computed function pointer to the setters other than the vtable words;
- the store forms not decoded: `sq` (16 bytes), `swl`/`swr`/`sdl`/`sdr`. The review found three `sq ...,0x170(base)`
  at r1 0x184494, 0x1ac560 and 0x1ac7a0, in early library code; they are very unlikely to touch a controller, but they
  were not traced.

The data-word scan found the three setters only in the five vtable slots listed. No such advanced-pointer or block
copy was found or searched for exhaustively. [unread]

## 4. The 16 calls through slot `+0xb4`

**Machine code** (`vcall.py`: `lw rX,0xb4(rY)` followed within 7 words by `jalr rX`) finds exactly 16 sites in r1.
These are the decompilation's 16 `+ 0xb4))(` lines one for one. [reading]

| site (r1) | function, line | value | when |
|---|---|---|---|
| 0x4efd48 | `FUN_004efc60` D:L359948 | (one argument, a different object `iVar15`, returns a value) | not a controller call; excluded |
| 0x5565bc / 0x5568ec / 0x5569dc | `FUN_00556370` D:L420662, D:L420688, D:L420745 | 1 | an obstacle record of type 2, 4 or 1 matures (type 1 once older than `DAT_006504f0`) |
| 0x56cdc4 | `FUN_0056cbf0` D:L431705 | the saved `+0x448` bit 0x80000 | leaving movement state 7: restore. **No effect for the AI class**: `+0x3f4` is still 7 here, so 0x557ee0 writes 0 (see below) |
| 0x56d048 | `FUN_0056cbf0` D:L431737 | 0 | entering movement state 7, after saving the bit into `+0x448` bit 0x80000 (D:L431728-431733) |
| 0x571a70 | `FUN_005714b0` D:L433982 | 0 | teardown |
| 0x5737d0 | `FUN_00573130` D:L434856 | 1 | AI reset |
| 0x5fb170 | `FUN_005fae70` D:L508484 | `uVar10` | end of a state-6 tick, only when the top goal is follow (`+0x30` == 9) |
| 0x5fe010 | `FUN_005fdf80` D:L510064 | 0 | follow goal signal 0 (enter: movement state 6) |
| 0x5fe104 | `FUN_005fdf80` D:L510089 | 1 | signal 1 (saves the controller's `[0x175]` into goal `+0x58`) |
| 0x5fe160 | `FUN_005fdf80` D:L510099 | 1 | signal 2 (movement state 1, goal `+0x58` = 0) |
| 0x5fe1c8 | `FUN_005fdf80` D:L510111 | 0 | signal 3 (re-enter: movement state 6) |
| 0x60f390 / 0x60f518 / 0x60f674 | `FUN_0060ee80` D:L518610 (1), `FUN_0060f470` D:L518769 (0), `FUN_0060f5e0` D:L518816 (1) | | **CAiSUseVehicle**: vtable at 0x669f60, type record 0x663750 naming it. Two sites write 1 and one writes 0. "0 when it takes the vehicle, 1 when it leaves" is an inference from the surrounding calls, not read [inferred] |

**Class names** come from the type records' strings [reading]:
- 0x662dc8 is `CAiSFollow`, vtable 0x6699a0: signal handler 0x5fdf80, decision 0x5fb1c0;
- 0x6628b0 is `CAiSAction`, vtable 0x669660;
- 0x663750 is `CAiSUseVehicle`.

`CAiSAction`'s vtable methods are not among the 16 callers.

**The signal meanings** (0 enter, 1 suspend, 2 exit, 3 resume) are inferred from the handler bodies:
- 0 and 3 both enter movement state 6;
- 1 releases the leader link (`FUN_005fcf10(…,0)`, D:L510094) and saves the controller's `[0x175]` into goal
  `+0x58`; it writes 1;
- 2 writes 1, calls `FUN_0056cbf0(param_3,1)` and zeroes goal `+0x58`.

The goal-stack dispatcher was not read. [reading of the handlers; the dispatcher unread]

**The follow tick's value** (D:L508408-508456; re-read here) [reading]:
- `uVar10` starts at 0 (D:L508408). Its only 1 is at D:L508449.
- That 1 needs all of these:
  - goal `+0x7c` == 0 and `+0x7d` != 0;
  - the leader's controller slot `+0x2c` answers non-zero;
  - `FUN_005750a0()` == 0;
  - `DAT_0066b038` == 0;
  - the body's `+0xc8` mask 0x20000 term;
  - `FUN_005fd150` false ("need not move");
  - `FUN_005fdad0` true (D:L508418-508449).
- `FUN_005750a0` is r1 0x5750a0 `lui at,0x46` / `jr ra` / `lbu v0,-0x5f3f(at)`: it returns the byte 0x45a0c1, which
  research 404 s14 identifies as the multiplayer flag.
- **The write is conditional on the top goal.** The tick first takes `FUN_005f6010()`. If that returns no goal, or
  one whose `+0x30` is not 9 (follow), the tick calls `FUN_0056d090` and returns without the slot call (D:L508399-508404).
- **`FUN_0056d090` (D:L431777-431784) is `FUN_0056cbf0(param_1, +0x3f5)`**, then `+0x3f5` = 1. It writes nothing to
  the bit, except 0 through `FUN_0056cbf0`'s state-7 entry, which fires in **two cases**:
  - `FUN_0054f6e0(body,1,1,1)` is non-zero, which makes the new state 7 (D:L431689-431696);
  - or the saved `+0x3f5` already holds 7, because the last move into state 6 came from 7. `FUN_0056cbf0` stores the
    old state into `+0x3f5` at r1 0x56d060 `sb s2,0x3f5(s4)`.
  In either case the entry saves the bit and writes 0 (D:L431737), and the suspend's 1 is lost. It can only write 0. It also moves `+0x3f4` to the value saved in
  `+0x3f5`, so the state-6 tick stops after that frame. [reading; the fold review's finding A, re-read here]
- So in a network game the follow tick writes 0 on every tick on which follow is the top goal. On other ticks it
  writes nothing, except a 0 through the state-7 entry just described. This is what lets a bit set by a suspend
  survive while another goal is on top, unless that entry fires.

**The state-7 restore, at the bytes** [reading; the review's finding 1, re-read here]:
- `FUN_0056cbf0` reads `+0x3f4` once at entry: r1 0x56cc20 `lb s2,0x3f4(a0)`.
- Its only store of `+0x3f4` is r1 0x56d058 `sb s3,0x3f4(s4)`, after both slot-`+0xb4` calls (the restore's `jalr` at
  r1 0x56cdcc, and the clear's `jalr` at r1 0x56d04c). The decompilation agrees: the restore is at D:L431705, and the
  state is written at the end. `FUN_0054f6e0`, called between them, does not touch `+0x3f4`.
- So when the restore call runs on leaving state 7, `+0x3f4` is still 7. The AI class's setter 0x557ee0 then forces 0
  (r1 0x557ee0-0x557ef0), and the saved `+0x448` bit 0x80000 is thrown away.
- The hostage's controller is that AI class (CSealCtrlAi, vtable r1 0x6693f0 / r4 0x668d70; research 404). For it,
  entering and leaving state 7 both end with the bit clear.
- The restore takes effect only for classes whose slot is 0x592030 or 0x2b3c70, which do not test `+0x3f4`.

## 5. `DAT_0066b000` and `+0x172` bit 0

**`DAT_0066b000`** [reading]:
- It lies at 0x66b000. The last loadable segment (vaddr 0x4c5380) has file size to 0x66a000 and memory size to
  0x686f80, so the address is in the zero-filled part (`val.py`).
- References (`absref.py`, `near.py`): four loads, `lbu v0,-0x5000(at)` after `lui at,0x67`:
  - r1 0x549744 (`FUN_005483d0`, the gate);
  - r1 0x549d6c (`FUN_00549c30`, D:L414127);
  - r1 0x54a074 (`FUN_00549f30`, D:L414241);
  - r1 0x54ac64 (`FUN_0054aa30`, D:L415028).
- No store, no `lui`/`addiu` forming its address, and no data word equal to 0x66b000.
- The nearest address-taken neighbour is `&DAT_0066afd8` (r1 0x574cc0), a scalar passed to the clamp
  `FUN_00519290`. Its initialiser writes 0x66aff0, 0x66aff8, 0x66b008 and 0x66afe0, not 0x66b000 (D:L435555-435558).
- It reads as a development toggle left at 0. "Never written" is strong, not certain: gp-relative and split-address
  store forms were not scanned. It is in BSS in both builds (r4 0x66a980).
- r0004: four loads of r4 0x66a980 (r4 0x54e454, 0x54ea24, 0x54ed4c, 0x54f934), no store, zero-filled. The rig read
  0 there in every sample (research 404 s14), and again in every row of both runs of match-q27 (G-1, on the host: 9,829 and 5,177
  rows, from before any order to the end; relayed 2026-11-15, s10). [reading; measured (rig, research 404 s14; G-1)]

**`+0x172` bit 0** (`sb172.py`; the decompilation's `0x172)` lines) [reading]:
- **Set by the base initialiser** `FUN_00598280` (D:L454750; r1 0x59850c, with the masks -2 and 1 held in registers). (r1 0x598800 is D:L454828, the
  `& 0xfb` with v1 = -5, not this write.) The gate therefore starts shut.
- **Written only by `FUN_005b7ba0` otherwise** (the body's cell locate):
  - set on a failed locate (D:L471280; r1 0x5b7f0c, `daddiu a0,zero,1`);
  - set to "not walkable" on a non-traversable cell (D:L471306; r1 0x5b7ef0, `xori 1`);
  - cleared on every traversable locate (D:L471333; r1 0x5b7e50).
- Every other `sb 0x172` writes bits 1 or 2:
  - `FUN_005627e0`, `FUN_0056af50`, `FUN_0056cbf0`, `FUN_00573130`, `FUN_00594b70`, `FUN_00604490`, `FUN_00607650`;
  - the `& 0xfd | 2` and `& 0xfb` lines at D:L426972, D:L430842, D:L431706, D:L434756, D:L452976, D:L454751,
    D:L454828, D:L513031-513038, D:L514567-514590.
- So for a body on traversable cells the second half of the gate is open, and bit 7 alone decides.

## 6. r0004

The same scans of the served r0004 ELF (no r0004 function list, so the names are r1's and only the addresses count)
[reading]:
- Exactly three bit-7 setters: r4 0x55d200 (begins `lbu a2,0x3f4(a0)`, the AI one), r4 0x597860 and r4 0x2b5680.
  Each sits in a vtable slot: data words at r4 0x668e24; 0x668ee4, 0x668fc4 and 0x669424; and 0x432c14.
- Exactly 16 slot-`+0xb4` call sites: r4 0x55b8dc..., 0x602950 (the follow tick), 0x605810-0x6059c8 (the follow signal
  handler) and 0x616b90-0x616e74.

The structure is unchanged.

## 7. Against the rig

- **Shut door** (Q24 retry, r0004 MP71; `D:\s2u\seats\rig-Q24-retry-result-shut-door.md`). The goal stack is 3 with
  CAiSAction on top (vtable word r4 0x668fe0, which is r1 0x669660 relocated, `CAiSAction`) as the follower goes to
  the door. Bit 7 is set for the 1.2 s up to the open. After the open the stack is 2 and follow is on top again.
  [measured (rig, Q24 retry, two runs caught)]
  - **The fit.** CAiSAction pushed over CAiSFollow sends the follow goal signal 1 or 2, which writes 1 (D:L510089 /
    D:L510099). Its pop sends signal 3, which writes 0 (D:L510111). While the follow goal is not on top, the state-6
    tick (D:L432582) still runs, but it does not write the bit: with a top goal other than follow it takes
    `FUN_0056d090` and skips the slot call (s4). The exception is a 0 through the state-7 entry, in either of its two cases
    (s4); the rig's 1.2 s of set frames show it did not fire there.
  - This requires the dispatcher to send 1/2 on a push and 3 on a resume, which is unread. [reading of the writers;
    the push/resume mapping inferred]
- **Open doorway walk** (`D:\s2u\seats\rig-Q24-R1-R2-walk-east.csv`, column F_171). Tallied here (re-counted after the review): 965 lines including the header, so 964 data rows:
  - 952 read 0x08 and 12 read 0x88. (The relay's 963/951 is one row short.) The brief's "0x08 throughout" is not exact.
  - R1 rows 27, 51, 52, 59, 60, 61, 63, 69 and 84 (t_ms 47534-49647: around the leader's first move and the follower's
    start) and R2 rows 734-736 (t_ms 54657-54724) read 0x88.
  - [measured (rig, the CSV; read here)]
  - **What the two values mean.** The 0x08 is bit 3, set by the initialiser `FUN_00598280` (D:L454782). Bit 3 is
    never written at run time on `CSealCtrlAi`: its other writers are the base class's slots `+0x5c/+0x60`, which
    `CSealCtrlAi` overrides with `FUN_00573bd0` / `FUN_00573b80`, and they are never called directly. So 0x88 means
    bit 7 set and nothing more. [reading, from 8f's second read]
  - Online the follow tick writes 0 on every tick where follow is the top goal (s4), so these isolated set frames must
    come from another writer:
    - a maturing record (D:L420662/420688/420745; when `FUN_00556370` returns non-zero the AI tick replaces that
      frame's state, D:L432512-432545, so the follow tick does not clear it that frame);
    - a follow suspend or exit (D:L510089/510099; another goal pushed over follow);
    - **the AI reset** (`FUN_00573130`, D:L434856, writes 1), which earlier revisions left out of this list;
    - Not the state-7 restore: for the hostage's AI controller it always writes 0 (s4).
    - Whether a set frame is seen at all also depends on the order within a frame of the gate's reader and the AI
      tick's writers (s9, `AI_CORRECTION_FRAME_ORDER_PLACEHOLDER`).
  - Which one it is per frame is unread. They are consistent with the writer list. They are NOT explained by the
    follow tick's 1-branch, which is dead online.
- **Research 404's ~¼ of steering frames set** (r0004, leader's console) falls under the same remark. Its rate is not
  derived from the reading; which writer produces it is open.
- **Non-host consoles read 0x08 even idle** (Q24 retry step 0; research 404 s14.6). This is consistent with the
  initialiser leaving 0x08 (bits 3 set, 7 clear) and the AI reset (D:L434856, the 1) not running on a non-authority
  copy. A non-authority console's copy controller is presumably `CSealCtrlCopy`, whose setter 0x2b3c70 has no state-7
  test. Why the reset does not run there is unread.

## 8. What the port should gate on, and what it must not approximate

**Gate on** a per-controller bit with exactly the writers above, applied where the original applies them. The port
runs the follower on the authority, the leader's console in the original (research 404 s14.6). [simulation track;
reading, pending review]
- **Initial:** clear (D:L454749), then **set by the AI reset** (D:L434856).
- **Follow:**
  - enter or resume: **clear** (D:L510064, D:L510111);
  - suspend or exit: **set** (D:L510089, D:L510099);
  - a state-6 tick with follow as the top goal ends with **clear** online (D:L508484 with `uVar10` = 0; the 1-branch
    needs the offline flag, D:L508425). A tick with another goal on top writes **nothing**, except **clear** through
    `FUN_0056d090` → `FUN_0056cbf0`'s state-7 entry, when `FUN_0054f6e0(body,1,1,1)` is non-zero or the saved
    `+0x3f5` is 7 (D:L508399-508404, D:L431777-431784, D:L431689-431696, D:L431737; r1 0x56d060). Both cases write
    only 0.
- **The general rule for the hostage's AI controller: every write while movement state `+0x3f4` is 7 stores 0** (the
  setter 0x557ee0, r1 0x557ee0-0x557ef0). That covers a record maturing (`FUN_00556370` runs every AI tick in any
  state), a follow suspend or exit (signal 2 writes 1 before it changes state), the AI reset, and the restore. In
  state 7, none of the "set" writers below sets the bit.
- **Obstacle records:** **set** when a type 2, 4 or 1 record matures (D:L420662/420688/420745). It holds until the
  next writer. Whether the body's move in the same frame sees it depends on the frame order, which is unread
  (`AI_CORRECTION_FRAME_ORDER_PLACEHOLDER`). **Interim order, named as a ledger constant under that placeholder:**
  - `'ai-tick-then-move'`: in each frame the controller's AI tick (its slot-`+0xb4` writers) runs before the body's
    move (the gate's reader), so the move sees the bit as written that frame.
  - Why this order: the move consumes the proposal (body `+0xf54`) built from the controller's commands of the same
    frame. A controller thinking after the move would make every command take effect a frame late. Of the two orders
    it is the one under which the controller's tick and the body's move form a single frame's step.
  - This is a reason, not a reading. The constant is a placeholder until the frame loop is read or the rig's
    breakpoint order is logged (s9).
  - **The order changes only the timing.** Under either order, one set event (a record's 1, then the next follow
    tick's 0) gives exactly ONE corrected move; the other order only shifts it by a frame. Tests must therefore pin
    nothing that depends only on the interim order: the count of corrected moves per set event, not the frame they
    fall in.
  - **The entry points:**
    - the body's move is `CZSealBody` vtable slot `+0x20` (`FUN_005506a0`, data word r1 0x6691c0);
    - the AI tick is `CSealCtrlAi` slot `+0xc` (`FUN_0056de10`, data word r1 0x6693fc).
    - The frame loop calling both is unread: ten call lines through controller slot `+0xc`, at D:L139953-142772, are
      untraced.
  - **Inside the AI tick**, `FUN_00556370` (the records) runs **before** the state switch (D:L432519). A non-zero
    return replaces the follow tick with case 4 for that frame. Whether that coincides with its 1-writes is untraced.
- **Movement state 7** (the hostage's AI controller): on entry **clear**, and on exit **clear** as well. The restore
  call passes the saved value, but `+0x3f4` is still 7 then and the AI setter forces 0 (r1 0x56cc20, 0x56cdcc,
  0x56d058; r1 0x557ee0-0x557ef0). **Do not restore a saved 1 on leaving state 7 for the hostage.** (Only classes whose
  slot is 0x592030 or 0x2b3c70 restore it.)
- **Vehicle use:** two writes of 1 and one of 0 (CAiSUseVehicle); which is boarding and which leaving is inferred.
  Not on a hostage's path as far as read.
- **Teardown:** clear (D:L433982). That is the value written; what teardown means for the gate is not read.
- **The AI reset:** set (D:L434856). **Measured on the host since** (the door match's record, r0004, MP71, relayed by the
  main controller 2026-11-15; hub `evidence/weekend-mega-2026-11-14/rig/q26-hostage-door-read/RECORD.md`; not
  harness-scored): EVERY IDLE hostage controller's +0x171 reads 0x88 on the HOST, before any order and for the whole of
  every run of that match -- bit 7 SET on an idle hostage, so the correction RUNS for an idle hostage; the AI reset
  writing 1 (FUN_00573130) fits; the follow tick's 0 then clears it while following online. For the port's gate: the
  bit's initial value is SET at spawn, cleared by the follow tick, set again by a follow suspend or exit. When exactly the
  reset runs (its callers) stays untraced. [was `AI_RESET_TIMING_PLACEHOLDER`; its idle-state question settled by that
  measurement]
- **Not covered:** s8 has no rule for a hostage that is halted, rescued or dead. Those states are unread. The port
  keeps today's behaviour for them under a named placeholder, `AI_CORRECTION_UNCOVERED_STATES_PLACEHOLDER`, until
  they are read.
- **The correction** runs only when the bit is set and `+0x172` bit 0 is clear (`DAT_0066b000` is 0).

**Must not approximate:**
- by a probability or rate per phase (research 404 s14.4's `trace` variant);
- by "not obstacle type 1";
- by "always on";
- by a timer standing in for the 1.2 s at a door. The 1.2 s is the span the action goal is on top.

**What it closed (2026-11-19):** LATER 933, the follower held on Fish Hook's landing. With `hostageFollow.ts` set back to
before this gate the landing RED fails (held 138 ticks); with the gate it passes (research 404 s36).

## 9. Named unknowns, and what settles each

- `AI_CORRECTION_ENABLE_READING` (the writer list, s4/s8). Settled by a rig log on the leader's console, per frame,
  for a following hostage:
  - controller `+0x171`, `+0x172`, `+0x3f4` (movement state) and `+0x448`;
  - the goal stack count and top vtable;
  - the obstacle-record state at controller `[0xc9..0xd1]` (`+0x324..+0x344`: type `+0x32c` and age);
  - a breakpoint count on r4 0x54e4c0 (the correction call).
  - The prediction: every 0→1 edge coincides with an AI reset, a follow suspend or exit, or a record maturing; never
    with a state-7 exit. Every 1→0 edge coincides with a follow tick (follow on top), a follow enter or resume, or a
    state-7 entry or exit.
- `AI_CORRECTION_FRAME_ORDER_PLACEHOLDER`: the order within a frame of the gate's reader (`FUN_005483d0`, called from
  `FUN_005506a0`) and the bit's writers (the AI tick `FUN_0056de10` and its callees). Both are reached through virtual
  calls, and neither the caller order nor the frame loop was read. It decides whether an obstacle record's 1, or the
  follow tick's 0, is what the move in that frame sees. Settled by reading the frame loop that calls both, or by a rig
  log of breakpoint hits on r4 0x54e4c0 (the correction call) against the slot-`+0xb4` call sites, in frame order.
  Until then the port runs the interim order `'ai-tick-then-move'` (s8), held as this placeholder's ledger constant.
- `GOAL_SIGNAL_MAP_PLACEHOLDER`: which goal-stack operation sends signals 0-3 (push, pop, suspend, resume). Settled
  by reading the goal-stack dispatcher (the callers of the goal vtable's signal slot), or by the same log around the
  door's push and pop.
- `AI_CORRECTION_ENABLE_SET_FRAMES_PLACEHOLDER`: which writer sets the bit in the 12 isolated frames of the walk-east
  CSV and in research 404's steering frames. Settled by the same log, with the record state beside the bit.
- `AI_RESET_ON_REMOTE_COPY_PLACEHOLDER`: why a non-authority console's hostage copy reads 0x08 idle. Not needed while
  the port's room is the authority. Its copy controller is presumably `CSealCtrlCopy` (setter 0x2b3c70, no state-7
  test).
- `AI_RESET_TIMING_PLACEHOLDER` (resolved for the idle state, 2026-11-15): the host's idle hostage controllers read
  +0x171 = 0x88 (bit 7 set) before any order and through every run of the door match (one match, every run, relayed),
  and before the order in match-q27 (G-1, a second match, relayed): the port starts the bit SET at spawn. Still untraced: `FUN_00573130`'s callers (when the reset runs).
- `AI_CORRECTION_UNCOVERED_STATES_PLACEHOLDER`: the bit for a hostage halted, rescued or dead. Settled by reading those
  states' paths through the 16 call sites, or by the same per-frame log.
- The census's blind spots (s3, "Limits") stay open unless a reviewer extends the scan to advanced-pointer stores and
  block copies.

### 9a. Placeholders and readings the port holds

What the port does since `agent/wm-hostage-gate` (match `src/hostageFollow.ts`; reading, pending review): the
follower keeps the bit per hostage and its move asks the AI-map correction only with the bit set (and, as before, a
valid cell and no type-1 record). Its writers, as s8 lists them: set at spawn; set in `stop()` (the room's end of follow,
signals 1 and 2); clear at the first follow tick under a leader (enter or resume); clear at each follow tick with
follow on top, that is with neither the port's state 16 (`recovery`) nor its state 3 (`yielding`) above it; set when a
record of type 2 or 4 matures (`HostageObstacleRecord.tick`'s event) or a type-1 actor ages past `actorDelay`; every
write through `correctionEnableWrite`, which stores 0 in movement state 7, and no restore. The unit test is match
`test/hostageCorrectionGate.test.ts`.

Central `test/hostageFollow.test.ts`'s "records persistent physical AI correction and replans the retained route after
its original timeout" is retired (the main controller's ruling, 2026-11-15; reading, pending review): it pinned a
correction holding the body every frame of plain follow, which the original does not do (each follow tick on top
writes 0, D:L508484). What replaces it is match `test/hostageCorrectionGate.test.ts`, which pins a type-2 record's
maturing (D:L420662) -> SET -> one corrected move before the next follow tick clears it. In the same file the
perturbation test now seeds the existing offset and perturbation instead of making them with a corrected move, and the
occupied-probe test's release frame asks no correction (the type-1 record dropped, D:L420724-420742, before its 1,
D:L420745).

| name | what the port does | status |
|---|---|---|
| `AI_CORRECTION_ENABLE_READING` | the writer list above (s4, s8), in match `src/hostageFollow.ts`. Gaps: the port's follower has no movement state 7 (`actionMode7` has no writer); a type 2 maturing out of reach is cleared inside `HostageObstacleRecord.tick` with no event, so its 1 (D:L420662, before the reach test) is not written; no follow suspend/resume is written for the port's state 16 or state 3 above follow (which goal operation sends which signal is unread, s9) -- so recovery's phase-1 exit moves in the same tick with the bit a maturing record left (`hostageFollow.ts` `this.recovery = null; this.moveDirect(...)`), where the original's resume would write 0 if the inferred signal map holds (`GOAL_SIGNAL_MAP_PLACEHOLDER`); the CAiSAction push at a door and its pop (the follow goal's signals, D:L510089/510099 and D:L510111) have no hook in the port's follower; teardown's 0 and the vehicle writes are not on the port's path | reading, pending review |
| `AI_CORRECTION_FRAME_ORDER_PLACEHOLDER` | `'ai-tick-then-move'` (s8): the move reads the bit as the controller tick left it; `'move-then-ai'` reads the value before that tick. Settled as s9 says | placeholder |
| `AI_CORRECTION_UNCOVERED_STATES_PLACEHOLDER` | `'ungated'`: a dead body's move corrects as before the gate. A halted or rescued hostage is not moved through the follower (the room steps only follow) | placeholder |

## 10. Review

- **Review 1: FAIL** (a fresh reviewer, read-only; record on `agent/wm-hostage-records`,
  `review-records/research-434-review-1.md`). One blocking finding and eight non-blocking ones. The rest of the note
  held at the source: the gate, the three setters, the store census, the 16 call sites, `DAT_0066b000`, the two
  zeroings at `+0x5c4`, `+0x172` bit 0, and r0004.
- **Folded in this revision** (the author re-read findings 1 and 3 at the bytes and the decompilation before folding;
  the rest folded as the review states them):
  1. BLOCKING. The state-7 restore never sets the bit on the hostage's AI controller. `+0x3f4` is read at r1 0x56cc20
     and stored only at r1 0x56d058, after the restore at r1 0x56cdcc, so 0x557ee0 forces 0. Fixed in s1, s4, s7, s8
     and s9: the restore takes effect only for slots 0x592030 and 0x2b3c70.
  2. The order within a frame of the reader and the writers: now `AI_CORRECTION_FRAME_ORDER_PLACEHOLDER` (s8, s9).
  3. The follow tick writes only when the top goal is follow (`+0x30` == 9), otherwise `FUN_0056d090` and no write
     (s1, s4, s7, s8).
  4. Signal 1, not 2, calls `FUN_005fcf10(…,0)`; signal 2 writes 1, calls `FUN_0056cbf0(param_3,1)` and zeroes goal
     `+0x58` (s4).
  5. The initialiser's `+0x172` bit-0 write is r1 0x59850c; r1 0x598800 is D:L454828 (s5).
  6. The CSV: 964 data rows, 952 read 0x08 and 12 read 0x88 (s7).
  7. s3's table: 0x2b378c writes constant 0; 0x592230 writes 0; 0x592c04 and 0x592c24 write 0.
  8. s3's limits now name `sq` and `swl`/`swr`/`sdl`/`sdr` (three `sq ...,0x170` sites in early library code), and
     the untraced `sw 0x170` sites' class is marked an assertion.
  9. The vehicle-use mapping is tagged as inferred (s4, s8).
- **Fold re-read of review 1: FOLD PASS WITH FINDINGS** (the same reviewer; record on `agent/wm-hostage-records`,
  `review-records/research-434-review-1-fold.md`). All nine findings were folded correctly, and two new non-blocking
  ones were raised. Both are folded here; the author re-read A at D:L431777-431784 and D:L431689-431696 before folding:
  - A. `FUN_0056d090` is `FUN_0056cbf0(param_1, +0x3f5)`. It can clear the bit through the state-7 entry when
    `FUN_0054f6e0` is non-zero; it can only write 0, and it moves `+0x3f4` to `+0x3f5`'s value (s1, s4, s7, s8).
  - B. s8 now states the general rule (every write while movement state is 7 stores 0, for the hostage's AI
    controller). "The port must not assume an order" is replaced by the interim order `'ai-tick-then-move'`, a ledger
    constant under `AI_CORRECTION_FRAME_ORDER_PLACEHOLDER` with its reason (s8, s9).
- **8f's second read: SOUND WITH CORRECTIONS** (medium-high; at `c22c5b3764`; the hub's
  `reviews/research-434-second-read-c22c5b376.md`). Every bit-7 path agrees at the bytes in r0001 and r0004 (the gate
  r4 0x54e450-0x54e484; the setter r4 0x55d200 byte-identical). Folded here; the author re-read r1 0x56d060 and the
  type records before folding:
  1. `FUN_0056d090`'s clear through the state-7 entry fires in two cases: `FUN_0054f6e0` non-zero, or the saved
     `+0x3f5` already 7 (r1 0x56d060). Both write only 0 (s1, s4, s7, s8).
  2. The classes are named from their type records: `CSealCtrlAi`, `CSealCtrl`, `CRemoteCtrl`, `CSealCtrlSquirm` and
     `CSealCtrlCopy`, whose setter has no state-7 test. "type-4" is dropped (s1, s3, s7, s9).
  3. The CSV's 0x08 is bit 3, from the initialiser and never written at run time on `CSealCtrlAi`, so 0x88 is bit 7
     alone. The AI reset is added to the writer candidates (s7).
  4. Either frame order gives one corrected move per set event, shifted by a frame, so tests pin nothing that depends
     only on the interim order. The entry points are named, and the frame loop is unread (s8, s9).
  5. Notes:
     - the record pass runs before the state switch;
     - no rule yet for a hostage halted, rescued or dead (named placeholder);
     - teardown's 0 is a value without a meaning read;
     - when the AI reset runs on the authority is unread (named placeholder);
     - "`DAT_0066b000` never written" is strong, not certain.
     (s5, s8, s9)
- The note remains reading, pending review of this fold.
- **The door match's idle read** (2026-11-15, relayed by the main controller): the host's idle hostage +0x171 = 0x88
  throughout every run -- folded into s8 (the AI reset) and s9 (`AI_RESET_TIMING_PLACEHOLDER`, resolved for the idle state).
- **The rig's G-1 (match-q27, r0004, MP71), folded** (relayed by shadow-relay-1 at 11:08Z, 2026-11-15, file
  `RELAY1-q27-F2-second-follower-G1-global-1108Z`). Supporting measurement, not harness-scored. The u32 at r4 0x66a980
  (`DAT_0066b000`'s image) read 0 on the host in every row of both runs, 9,829 and 5,177 rows, from before any order to the end.
  Each hostage controller's +0x171 read 0x88 before the order, as in the door match. Folded into s5 and s9
  (`AI_RESET_TIMING_PLACEHOLDER`). "Never written" stays strong, not certain: a run that reads 0 does not show the
  absence of a store.
