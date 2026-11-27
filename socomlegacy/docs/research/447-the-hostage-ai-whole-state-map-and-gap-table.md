# 447 -- The hostage AI whole: every state it can hold online, how it reacts, and the gap table against the port

- Date: 2026-11-18. Seat: the hostages seat, on the main controller's brief
  (`agent-mail/handoffs/stage2/BRIEF-hostages-audit.md`; the owner, in the main controller's window: "it may be worth
  investigating hostages with a full decompilation of behaviours").
- Track: **simulation**, reading only: this note changes no code.
- Level: **reading, pending review** for every code line. The note draws on five read-only readers' passes over r0001's
  decompilation (`socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`) and, where Ghidra dropped code, r0001's
  ELF (cited `ELF 0x<addr>`). The seat re-read every line marked **[S]** at the source; the rest is one reader's read.
  Nothing here is measured on the original running unless a row says "measured", and those rows are relayed from earlier
  notes, not re-measured. r0004 is not checked, except where an earlier note already did.
- The port's side: `origin/agent/next` at e7bc50190e. The hostage files are identical to f8cca03e91, where the port
  reader read them. Paths are short: `match/` = `socomlegacy/packages/match/src/`, `viewer/` = `socomlegacy/packages/viewer/src/`.
- Builds on (and does not redo): [189](189-h1-hostage-ai-animation.md), [199](199-h4-hostage-closures.md),
  [207](207-hostage-mode-desert-glory.md), [238](238-the-hostage-as-built-the-body-and-the-ai.md),
  [333](333-hostage-follow-pathing.md), [334](334-hostage-follow-motion.md), 417, 418, 433, 434, 435; research 428
  (doors; on `agent/bodies-958`) and research 445 (the danger scan and CAiSGrenade; coreA's draft for LATER 1170, not yet
  landed). The X4 and X11 findings (`agent-mail/evidence/bugs-2026-11-18/`) are folded in.

## 0. The answer in short

- **"The event mask is 0 online, so a hostage reacts to nothing" is wrong as a statement of behaviour.** The mask is 0
  online and the AI event system is dead for every AI online (s3.1, which stands). But five paths reach a hostage without
  events: the danger scan's flight (0x1b, LATER 1170), a **look at a grenade before running** (0x19, under its own gate; how often it fires is unread; new), the
  **shot reaction** (0x13 ShotAt from a hit counter, new), the **knock of a living hostage** by a blast, and the
  **stunned** state (0x1c) from smoke or a flashbang (reachability partly unread). The leader-death HOLD is already in 199.
- The states a hostage can hold online: 0x17 CAiSHostage, 9 CAiSFollow, 0x11 CAiSRescued, 2 CAiSHold, 0x1b CAiSGrenade,
  0x19 CAiSEvent, 0x13 CAiSShotAt, 0xb CAiSAction and 0x10 PathRecover (both while following), 3 Avoid (334 s12), and
  0x1c stunned (undetermined), and 0x18 CAiSPlan inside 0x1b's own nested stack (s2.3). 0x12 is undetermined (the
  movie player's path only). Every other id in s2.3 is unreachable, each with its gate. s2.3 has no row for the ids 0,
  5 and 0xd, for which `FUN_005f7470` holds mask cases (D:L506482-506483, D:L506497-506498, D:L506521-506522); that does not show they
  occur. *(corrected 2026-11-23, NC-3 r2, r3)*
- The port has 0x17, 9, 0x11 and 2. Of the rest, 0x1b and 0x19 are LATER 1170's (coreA). 0xb (the door) is LATER 958's
  (the bodies seat, `agent/bodies-958`). 0x13, 0x1c, the flinch, CAiSHold's Tick and the idle look are LATER 1185-1189
  (s5).
- The voices: online on Desert Glory only YES is audible on the original (the female DAMAGE and DEATH names resolve to
  nothing on MP6, 238 s1.4). The port plays YES and nothing else, which matches **on MP6**. Other hostage maps' banks are
  unread.

## 1. The controller's frame (the tick, the post-tick, the driver)

| # | what | the original | level |
|---|---|---|---|
| 1.1 | the scan's enable | ctrl `+0x266` bit 3 is **set at every AI init** (`FUN_00573130` D:L434744 **[S]**, before the online hostage branch). It is cleared each frame state 6 CAiSSurrender's Tick runs (`FUN_006078a0` D:L514651 **[S]**), set to NOT(group word bit 0) for a group's members (`FUN_0060cbd0` D:L517195 **[S]**), and set by the group teardown (`FUN_0060ce40` D:L517290 **[S]**) and by `FUN_0060e280` (D:L518092 **[S]**). So an online hostage scans unless an MP map's AI group names it (members are added by name, ~D:L490894-490908; the disc's group records are unread), or state 6 runs (no hostage pusher found, s2.3). This settles research 445's re-read F2 (sent to coreA). | reading |
| 1.2 | the danger scan | `FUN_0056de10` (D:L432501-432503) -> `FUN_005cba20` -> `FUN_005cb870` -> `FUN_005cac00`. Its internals are research 445's. | reading (445) |
| 1.3 | the flight 0x1b | `FUN_005cac00` pushes 0x1b at D:L482741 **[S]**, after `FUN_005f5cb0(ctrl, 0x13)` (D:L482740 **[S]**). The masks of [0x17], [9, 0x17] and [0x11] all admit it. | reading |
| 1.4 | **a look before a flight, 0x19, under its own gate** | Right after the 0x1b push (whether or not that push succeeded), `FUN_005cac00` may push **0x19 CAiSEvent with flag 2** (D:L482750 **[S]**), which skips the allowed-next mask (`FUN_005f5cd0` D:L505621-505623 **[S]**; not every hostage state's mask lacks bit 25 -- HOLD 2 `0x3ffffffa` (D:L506489), FOLLOW 9 `0x1ffffdfe` (D:L506510), 0xb `0x1ffff7fe` (D:L506516) and 0x10 `0x1ffe48c6` (D:L506531) hold it, while 0x17 `0x190f4bc0` (D:L506552) and 0x11 `0x190c48c6` (D:L506534) lack it, so a stack over either still refuses 0x19 without flag 2, *(corrected 2026-11-23, NC-3 r13)*; CAiSGrenade's CanPush returns 1). **The gate** (`bVar8`, D:L482615-482621 **[S]**): this AI's bit is already set in the object's per-AI mask (obj `+0x18`: marked on an earlier pass), **and** `FUN_005416b0(obj, side)` is false -- it tests obj `+0x1c` AND the side value ctrl `+0x10c`->`+0x58` (D:L408833-408836 **[S]**) -- with ctrl `+0x264` bit 1 clear, the object of kind 1 or 2, and 0x1b not present (`+0x42c` bit 27). `FUN_005cb870` hands over only kinds 1, 4 and 5 (D:L482954 **[S]**), so: a thrown grenade, never C4 or a satchel. **On the pass that first marks the object there is never a 0x19.** **The mark** (D:L482718-482720 **[S]**) is made before the range test, on any first pass that keeps `bVar5` (set at D:L482640 **[S]**). That pass sets the side's seen bits only when the hostage SEES the object: the thrower is itself, or carries neighbour flag 0x200, or own `+0x264` bit 1 (D:L482671-482676 **[S]**), or (the object is in its view cone, or within `DAT_00650a28`) and its visibility is above `DAT_00650a30` (D:L482678-482706 **[S]**); each calls `FUN_00541650` (D:L482674, D:L482703 **[S]**). **So, on this AI's own first pass, the object is marked WITHOUT seen bits in exactly two cases** (D:L482641-482716 **[S]**): (i) the thrower does not resolve (`FUN_0029e4e0` returns 0 at D:L482641: the whole block is skipped and `bVar5` stays true); (ii) the thrower is in the hostage's `+0xd0` list (not self: self is always seen), is not seen, shares a team bit with the hostage (`bVar4` false), is a kind-2 entity (else `cVar9` is 0, D:L482648-482650), and `cVar9` is set (the thrower's AI controller's `+0x264` bit 1, or, for a body with no AI controller, its controller's slot `+0x2c`, D:L482657-482669 **[S]**; a thrower that resolves but is neither self nor in the hostage's `+0xd0` list leaves the object unmarked, D:L482714-482715). **And seen bits may not close the gate**: `FUN_00541650` sets bits 0-1 for side values 2, 4 and 8 alike (D:L408819-408823 **[S]**), so with a side value of 0, 4 or 8 the test at D:L482617 never hits from this AI's own writes, and every pass after the mark qualifies. The seen word obj `+0x1c` is SHARED: every AI's pass writes it with its own side, so another AI's seen bits can close the gate for this hostage (a side-2 AI's write of 3 closes it for a side-1 or side-2 hostage), and only an AI whose side value carries bits 2 or 3 could open the 4/8 case's test. A pass that qualifies within the radius R pushes 0x1b and 0x19 together, the look first. If the qualifying mark was made outside R (R from the object record's `FUN_003d4500`, D:L482723-482731, against the scan's reach of 200, `DAT_00650a18`), the player sees the look on the hostage's first flight. **How often a hostage looks first is not determined**: it rests on the hostage's side value, how often a thrower fails to resolve, and `cVar9` for a team-sharing thrower, all unread (s6). (Corrected three times after re-reads 1-3; s8.) | reading |
| 1.5 | the event consumer | The tick's reduced branch (D:L432416) and the scan driver (D:L483035) call `FUN_005faae0`, the only consumer of AI events. Its two event queries find nothing online (s3.1), but it still turns a **remembered event** into a head look whatever the mask (D:L508303-508310): the path ShotAt's refusal uses (s2.2). | reading |
| 1.6 | the idle look | In idle mode `FUN_00567690` (D:L429283-429338) turns the head every 10 + U(0, 5) s: with the look priority below 1 and no 0xb on top, it stores, through `FUN_00600ed0` (SetLookDirW, D:L511380-511404), a direction made from the map index the AI-map query `FUN_00559580` returns (D:L429322-429323). *(corrected 2026-11-23, NC-3 r28)* No note had this. The look is the AI's look system, recorded on the controller. | reading |
| 1.7 | the target look | Every frame the tick looks with priority 7 at the target in ctrl `+0x67c`, while that target is held (its `+0x200` flag) or under 2 s since it was seen, else at the point in `+0x6d4` (D:L432486-432497 **[S]**); the 2 is a time, not a distance *(corrected 2026-11-23, NC-3 r29)*. What fills `+0x67c` for a hostage is unread (`FUN_00565110`, `FUN_0060a460`). | reading; the fill unread |
| 1.8 | no goal | With no movement goal, `FUN_00567350` zeroes the analog inputs each frame. | reading |
| 1.9 | the post-tick and driver | The post-tick's only stack move is the rescue's Replace by 0x11 (`FUN_0056f970` D:L432975). The driver `FUN_005f8030` only pops -- a top its own Tick finished in the same frame (s11, LATER 1205). While a state's own nested stack is not empty, that state's Tick does not run (D:L506892-506913). | reading |
| 1.10 | the event masks | Online, `FUN_00572d70` zeroes the controller's `+0x65c` (D:L434611-434613). `DAT_0066b170` is **not** zeroed: it is a static mask built once. `FUN_00572d70` builds and subtracts the masks with no online test, and the online flag zeroes the result last (D:L434596-434613), so its effect is offline only *(corrected 2026-11-23, NC-3 r34)*. 189 s0 #16 has this wrong. | reading |

## 2. The states

### 2.1 Already read (kept)

0x17 CAiSHostage (sub-states 0-6, the timers, the watch: 238 s2.2-2.3), 9 CAiSFollow (334, 417, 435), 0x11 CAiSRescued
(238 s2.6), the stack's moves and masks (238 s2.4), the orders (189 s3, s14.6). One correction to 238 s2.4: **push flag 2
skips the allowed-next mask** (`FUN_005f5cd0` D:L505621-505623 **[S]**). Three pushes use it: 0x19 (D:L482750),
2 (D:L430025, D:L517345) and 0xc (D:L512465).

### 2.2 Newly read

- **0x19 CAiSEvent on the grenade path** (vtable 0x669c90; Tick `FUN_00604ce0` D:L513280-513530; OnSignal `FUN_00605a80`
  D:L513740-513761).
  - Fields at the push (D:L482750-482784): the object's position; a wait of 0.75 (`DAT_00650a38`) + f(1 + U), where
    f = (1.2 - ctrl `+0xe4`) x 1.5 x d^2 / R^2 and R = 200 or the object's range; a 0.75 s look.
  - Signal 0 sets AI mode 4 and two aborts: a live target, or the hit counter `+0x718` > 1.0.
  - Sub-state 0 says cue 0x46 at 1.0; its name is unread, and it is silent if the hostage's record lacks it. It then
    waits.
  - Sub-state 1 looks at the grenade for 0.75 s (`FUN_00601330(ctrl, 5, pos)`).
  - Sub-states 8 and 9 reset the look and **pop it** (`FUN_005f5ca0`, D:L513518 **[S]**). 0x1b then resumes and
    the run starts.
  - It never pushes a Plan (0x18): that needs flags 1 or 2, which this path never sets.
  - In plain words: **from a C4 charge or a satchel a hostage never looks first.** From a grenade, on the pass that
    first marks it, it runs at once if the grenade is within R. On a later pass that meets s1.4's gate (the grenade marked
    without the side's seen bits, or a side value whose seen bits never test true) it stands and looks for about
    0.75 + f(1 + U) + 0.75 s, then runs. How often that happens is not determined (s6).
- **0x13 CAiSShotAt** (vtable 0x669e70; OnSignal `FUN_006093f0` D:L515327-515359; Tick `FUN_006089f0` D:L515083-515284).
  - **The trigger is not an event.**
  - The body's projectile handler (ELF 0x5ac670; Ghidra decompiled 12 bytes of it as `FUN_005ac660`) calls controller
    slot `+0x4c`, which is `FUN_00572330` (D:L434250-434403).
  - For a hostage (`ctrl+0x26c == 4`, set at the online spawn D:L434912) it adds `DAT_0064fdd8` = 2.5 to `+0x718` for
    a shooter of any side, provided the shooter resolves to a kind-2 entity (D:L434270-434273 **[S]**) and only for the
    first hit in a frame (the `+0x40c` stamp, D:L434284 **[S]**). Weapon types 0x79-0x80 and C4, satchel and claymore (`+0x7c` 0x97/0x98/0x99) are excluded
    (~D:L434335-434361 **[S]**).
  - The controller update `FUN_0056fd00` (called from the body update, D:L418091) pushes 0x13 when `+0x718` >
    `DAT_0064fde8` = 1.5, so **one hit is enough**, and 0x13 must not already be on top (D:L433253-433287 **[S]**).
  - On success it says CHRSND 0xd UNDER_FIRE at 0.15 (silent: no slot). On refusal it calls the alert setter `FUN_00561110(-1, ctrl, 3,
    shooterPos)`, which is conditional (D:L426215-426253): it does nothing while ctrl `+0x265` bits 0 and 7 are both
    set, forces level 0 unless the body is alive, and with -1 and a level above 1 defers the level on a table delay
    (returning if that level is already pending) instead of raising it at once -- unless the controller's `+0x264`
    bit 1 is set, which raises it at once (D:L426244) *(corrected 2026-11-23, NC-3 r52)*; it may store a remembered event that becomes a 3 s head look at the shooter
    (`FUN_005fad00`, `FUN_005faae0` D:L508303-508310).
  - Admitted by CAiSHostage's CanPush only in sub-states 5 and 6, which is where an unled hostage sits about 7 s
    after spawn: sub-state 3 waits 2 s, then sub-state 2 waits 5 s (D:L511836-511837, D:L511824) *(corrected 2026-11-23, NC-3 r53)*. Admitted always while following, and on a rescued stack.
  - Entry saves the stance and, while the alert is below 2, plays a random "startled01".."startled05"
    (`FUN_00571010(ctrl, FUN_00609530(0), 2, 0xb)`; the names via `FUN_005e4f90` D:L495370-495374).
  - With `+0x26c == 4` the Tick's sub-state 0 raises the alert to 2 and goes to 5 (D:L515130-515133 **[S]**). The state
    clears its live bit, so it lasts **one or two frames**. The two readers differ on whether it is one or two. *Settled
    (s10, s11, LATER 1185/1205; PC 2's capture, s10): on top across ONE frame boundary -- pushed after the frame's driver,
    ticked and popped in the next.*
  - Exit restores the stance after 0.25-0.5 s and zeroes `+0x718`.
  - The startle does **not** play on a hostage: "startled01-05" are in the Guard anim set only and absent from the
    multiplayer motion archive (s9.2).
- **Near misses** feed the same counter: controller slot `+0x44` = `FUN_005729f0` (D:L434460-434570), 2.0 x (1 - d / r)
  inside the controller's `+0xf8`. The broadcaster that calls it (ELF 0x5a4f80, which walks every actor) is registered for weapon
  event bit 1 once, at game and level setup, on a global list (`FUN_005a49f0` -> `FUN_003c6510`, D:L460995,
  D:L461055; called at D:L151864, D:L152176) and dispatched at each projectile step
  (`FUN_003c63d0`, D:L320062), so a close miss can push ShotAt *(corrected 2026-11-23, NC-3 r60)*.
- **Alert contagion between hostages**: `FUN_005cba20`'s neighbour loop calls `FUN_00560b20` (D:L426035-426160) for every
  living AI neighbour sharing a team bit, so a hostage at alert 2 or more raises a nearby hostage's alert. What the alert
  level changes for a hostage beyond the startle gate is unread.
- **2 CAiSHold** (the port's `HOLD_STATE_TICK_READING`, LATER 1187; was `HOLD_STATE_TICK_PLACEHOLDER`; Tick `FUN_006060c0` D:L513892-514090 **[S]** the entry,
  vtable 0x669d30; OnSignal `FUN_00607650` D:L514551-514600).
  - Signal 4 resets its fields. Signal 0 runs ClearRoute (`FUN_005628f0`), `FUN_0056dca0(ctrl, 0)` and
    `FUN_005b3890(body, 1)` (both unread), and clears `+0x172` bit 1.
  - Suspend (signal 2) calls `FUN_00563050(-1, ctrl, 2, 1)` (D:L514573-514574): when the stance `+0x278` or the
    pending stance `+0x279` is prone (2), it queues crouch (1) after 0.25 + U(0, 0.95) s (D:L427273-427280) *(corrected 2026-11-23, NC-3 r63)*.
  - The Tick's sub-state 0 sets AI mode IDLE. Sub-state 7 sets up one look and may pick a stance after a 2.5 s delay.
  - With the flags HOLD's Replace gives it online, nothing ends it. In 199 s1's replay the next rescue's Replace takes
    it.
- **2 by the vehicle dodge**: `FUN_00569550` pushes Hold with flags 3 (mask skipped; D:L430025) for 5 s when an object of
  type 4 moves within 5. The tick reader found its counter `DAT_0066afe8` filled only under `+0x26c == 1` (not a
  hostage's 4), so it is **probably unreachable**. Not confirmed.
- **0x1c stunned** (vtable 0x669ce0, Tick `FUN_00605c60` D:L513768-513862). `FUN_00571b10` (controller slot `+0x50`) pushes
  it for smoke (0x7a and 0x7d: "Cough stagger", `.COUGH`) and a close flashbang (0x7b: "Flashbang cower"), and ends a
  running 0x1b first (D:L434064-434172, D:L434140-434148). Bit 28 is in every hostage mask. The entry points are the
  smoke test `FUN_005b5050` (called from `FUN_005b5d40`; whether it runs for AI bodies is unread) and the blast path.
  Research 332 s7.1 says a flashbang sets no blast point. Its anim globals are -1 in the ELF image. **Reachability is
  undetermined.**
- **0xb CAiSAction while following** (the door). Two pushes, both from the walker `FUN_00567900`:
  - **The open**: the marker-type dispatch at the steered-to cell (bit 7). Type 1 pushes 0xb aimed with wanted
    state 1. It is in the machine code only (research 418 s22: the decompiled text drops the case bodies; the bodies
    seat re-read the bytes at r1 0x567ee8: no distance gate).
  - **The shut-behind**: D:L429523-429540, aimed with wanted state 0 (`FUN_005f0180`, D:L429533). It does not fire on
    r0004 (measured, X11).
  - CAiSAction ends at sub-state 8 or 9 by clearing its live bit (D:L502666-502675).
  - Research 428 and LATER 958 hold the rest.
- **0x10 PathRecover while following**: D:L420831, D:L429597. CAiSHostage's CanPush refuses it, CAiSFollow admits it
  (334 s6-7).

### 2.3 Unreachable online, with the gate

| id | class | why not, for a hostage online |
|---|---|---|
| 0x18 | CAiSPlan | pushed only into a state's own nested stack (D:L502866, 502926, 502989, 512584); **reachable** online through 0x1b: the grenade tick `FUN_0055ac20` tries a plan with flags 0xc, then 4, into its own nested stack (`FUN_005f0830`, D:L423275-423296, D:L423313-423320) *(corrected 2026-11-23, NC-3 r75)* |
| 1, the script pushes | -- | MP6's `Hostage_start` holds only SETANIMSET and STANCE |
| 6, 0xf, 0x1d | CAiSSurrender, CAiSFlee, -- | gated on ctrl `+0x264` bit 7, whose only writer `FUN_00561e20` (D:L426589) is called once, inside CAiSSurrender's own OnSignal (ELF 0x6081ac, the re-read's finding 3): circular, so no outside path sets it; **not an online test** as the draft said. Unreachable by that reading, pending its own re-read |
| 7 | -- | needs ctrl `+0x26e == 2`, which only a script command writes |
| 8, 0xa | -- | their commands never reach a hostage online |
| 0xe | pursue | needs a neighbour sharing no team bit (none online: 0xC0020000 shares a bit with both sides) and CanAttack (0 for 0x17) |
| 0xc, 0x14, 0x15, 0x1a | the attack states | CanAttack is 0 for 0x17 and 0x11; on a lone [2] stack they also need a weapon (unread; a hostage carries none, inferred) |
| 4, 0x16, 3 by the tick | -- | refused by the 0x17 and 0x11 masks (3 Avoid is reached through follow, 334 s12) |
| 9 by the stack update | -- | needs `+0x660`, set only for `+0x26c == 1` |
| 0x19 by the event handler | -- | the event mask is 0 online |
| 0x12 | Suspended | not from the AI budget manager `FUN_005cccd0` online: its block runs only when the online byte is 0 (D:L483634), with the suspend and wake inside it (D:L483871, D:L483886) *(corrected 2026-11-23, NC-3 r83)*; from the movie player: **undetermined** |

## 3. Reactions

### 3.1 The event system online (stands)

`FUN_00572d70` sets `+0x65c` to 0 last online (D:L434611-434613). The events' only consumer is `FUN_005faae0`
(D:L508243-508315). Its two queries pass `+0x65c` to the iterator `FUN_0050ea50`, which drops every event whose type bit
is not in the mask (D:L380952). So no AI state receives a gunfire, impact, explosion, cry or presence event online. The
posters (types 3, 4, 6, 7, 8, 9) are listed in the reactions reader's pass; none matters online.

### 3.2 Being hurt (no online test and no mask on any of these)

- **The flinch.** The part-damage applier `FUN_005a54d0`'s non-fatal branch (D:L461394-461408 **[S]**) plays a flinch
  (`FUN_005a0270`, `FUN_005a2690`) unless the controller is remote (slot `+0x34`) or the cause is 7 (fall) or 4 (blast).
  So **the host flinches its hostage** on a bullet hit. Whether the flinch reaches a client's screen is unread.
- **DAMAGE**: `FUN_00571ab0` (D:L433989-433997) says CHRSND 0x3b through the AI voice path `FUN_0055ff60`, with a global
  per-id cooldown (DAMAGE 1.25 s, DEATH 1.5 s; D:L435569-435580) and a per-body 3 s gate (research 91). Silent on MP6.
- **DEATH**: `FUN_005714b0` (D:L433896-433911) says 0x3d DEATH_QUIET for causes 1, 2 and 3, 0x3c DEATH otherwise, and
  nothing for 6 and 7. A client's remote controller plays no death voice (`FUN_005e6290`). Silent on MP6.
- **The blast knock of a survivor.** `FUN_0057e770` knocks a body within the knock radius **whether alive or dead**
  (D:L440981: the radius test or dead). 238 s1.5 says only the dead are thrown; this corrects it. The blast's effect
  callback `FUN_00571b10` with index 4 scales several controller fields (D:L434065-434073) and pushes nothing. Its
  branch that would lengthen a running 0x1c on top (D:L434117-434135) is not reached in the ordinary case: the whole
  body sits in a block entered only when 0x1c is not on top (D:L434032-434049, closing at D:L434170; s12). Between that
  test and the branch, the group teardown (`FUN_0060d280` D:L434047 -> `FUN_0060ce40` D:L517409) changes the stack
  with a HOLD 2 stack call under flags 3 (D:L517282), and HOLD also reaches a stack past the mask from the group add
  (`FUN_0060d020`, D:L517345) and the vehicle dodge (D:L430025); so the branch may be reached when a grouped AI's
  teardown leaves a running 0x1c on top. That call's direction, 0x1c's CanPush (vtable 0x669ce0) and whether an
  online hostage is grouped (s1.1) are unread *(corrected 2026-11-23, NC-3 r90;
  the -3 row's 'raises the duration' is that branch, reached at most past the teardown)*.

### 3.3 Bodies, the leader, range

- Dead bodies: no reaction (the watch and the scan take only the living).
- The leader dies: released (`FUN_00547af0` D:L413031-413046; `FUN_005fdd40`). UnitTick's HOLD says YES (199 s12.6).
- Leader out of range: WAIT_UP beyond 100 and a stop beyond 600 (`FUN_005fb1c0` D:L508751-508775) fire only for a
  **locally driven human** leader (the host's own player). A dedicated room has none.
- `FUN_005cba20`'s INTIMIDATE (CHRSND 5, D:L483092) and its pursue push need a neighbour with no shared team bit, which
  cannot happen online.

### 3.4 The voices (hostage-reachable CHRSND ids; the table is `FUN_0053c3a0` D:L405787-406060)

mp_fem1-3 define only DEATH `.FEMALE_DEATH`, DAMAGE `.FEMALE_DAMAGE` and YES `^CO_0343` (199 s8). MP6's banks hold
neither female name (238 s1.4).

| id | name | trigger online | audible on MP6 |
|---|---|---|---|
| 0x37 | YES | FOLLOW (D:L450379), HOLD (D:L450537, including the leader-death HOLD) | yes |
| 0x3b | DAMAGE | a non-fatal hit (s3.2) | no (null) |
| 0x3c / 0x3d | DEATH / DEATH_QUIET | death by cause (s3.2) | no |
| 0x0d | UNDER_FIRE | 0x13 pushed | no (no slot) |
| 0x46 | ? | 0x19 sub-state 0 | unread (likely no slot) |
| 0x4b | RESTRAINED | sub-state 3 at spawn | no |
| 0x48 / 0x49 | PANIC / HELPME | the watch's tests, never true online (238 s2.3) | no |
| 0x31 | WAIT_UP | a local-human leader beyond 100 | no |
| 0x33 / 0x35 | GRENADE_ALERT / OH_HECK | the scan (D:L482711); 0x1b with no flee point (D:L423330) | no |
| 0x34 | GRENADE_I_GOT_IT | 0x1b's kick | never for a hostage (s4) |

### 3.5 Online and offline (the census)

No online test at all in `FUN_00601910` (CAiSHostage), the tick, the scan, ShotAt, or the damage
and death paths; the follow functions hold one: `FUN_005fae70`, called from the tick, tests the online byte twice
before a steering call (D:L508425, D:L508472) *(corrected 2026-11-23, NC-3 r96)*. Where online-ness changes behaviour, the test reads `DAT_0045a0c1` (`FUN_005750a0`):

| function | what offline does that online does not (or the reverse) |
|---|---|
| `FUN_00572d70` | offline a hostage hears event types outside `DAT_0066b170`; online it hears none |
| `FUN_00573130` (D:L434906) | offline: restrainable bit; online: `+0x26c = 4`, sub-state 3, unit 0x11 |
| `FUN_00555900` (D:L420223) | sub-state 3 needs the restrainable bit offline, an escortee online |
| `FUN_0058fbe0` (D:L450368, 450380) | FOLLOW: offline a unit 0x11/0x12 test, online the issuer-unit test |
| `FUN_005594b0` / `FUN_00559070` | online CAiSRescued goes straight to sub-state 2; offline it self-pops (238) |
| `FUN_0055ac20` CAiSGrenade (D:L423153, 423384, 423422) | the kick is offline only **and** needs the AI's own team to lack 0x20000, so **a hostage never kicks, even offline**. This corrects X4's "online only runs". The +1 s on the fuse is offline only. |
| `FUN_0056fd00` (D:L433174) | the alert and surrender block is offline only |
| `FUN_005a0e70` (D:L459260) | online, the knock impulse is skipped only for a remote controller (the host's hostage is local) |
| `FUN_0057e770` (D:L441021) | online, a prone knock sends net message 0x22 |

## 4. The gap table

Ranked by what a player notices. "Ours" is at `origin/agent/next` e7bc50190e.

| # | behaviour | the original (cited) | ours | match? | level | what a player sees |
|---|---|---|---|---|---|---|
| G1 | flight from a thrown grenade or a planted C4 or satchel | 0x1b by the danger scan (s1.2-1.3; 445) | none (`match/hostageAi.ts:28` has no 0x1b; `onEvent` never called, `:496-498`) | **no** | reading (445, re-read FAIL on draft 1, draft 2 owed) | hostages stand and die by a charge. **LATER 1170 (coreA), in flight.** |
| G2 | the look at a grenade before a flight (conditional) | 0x19 pushed over 0x1b, flag 2, under s1.4's gate: the grenade marked on an earlier pass and the side's seen test false (s1.4, s2.2) | none | **no** | reading; how often unread | when the gate holds, a hostage stands and looks at a grenade for about 1.5-3 s before running; how often it holds is not determined. **Folded into LATER 1170** (sent to coreA, with every correction). |
| G3 | a following hostage opens a shut door | the type-1 marker dispatch pushes 0xb (s2.2; 418; 428); measured on r0004, MP71, n = 6, relayed (X11) | `followActionDispatch` and `markerAction` not called (`match/hostageFollow.ts:107-121`); `FOLLOW_ACTION_BIND_PLACEHOLDER` `:98` | **no** | reading + measured (relayed) | a hostage stops at a shut door and the route is lost. **LATER 958 (the bodies seat, `agent/bodies-958`)**; its MP71 dev-disc test is red at 14.1 u against the rig's 6.6-10.6 u. |
| G4 | the shot reaction | 0x13 from the hit counter (s2.2): alert 2, on top across one frame boundary (s10); refused: the alert setter asked for 3 (conditional, possibly deferred, s2.2) and a 3 s head look (host only, s9.4). The startle clips do NOT play on a hostage (s9.2) | none (no 0x13 push; `HOSTAGE_EVENTS_READING` `match/hostageAi.ts:108` says the push never comes) | **no** | reading | small: a following hostage pauses one or two frames when shot; no gesture. **LATER 1185.** |
| G5 | the flinch on a non-fatal hit | `FUN_005a54d0` D:L461394-461408 on the host, not for a blast or a fall; **sent to every client** as a Push Blend (code 0xf) and replayed there (s9.1) | none (`match/room.ts` ~:6770: no hurt, no flinch) | **no** | reading | **every player sees a shot hostage flinch in the original, and not in the port.** **LATER 1186** (the most visible of 1185-1189). |
| G6 | the blast knock of a living hostage | `FUN_0057e770` D:L440981: alive or dead within the knock radius (s3.2) | `blastHostages` lays a knock on the body (`match/room.ts:9227-9255`) | likely yes | reading; the knock radius and the living case not compared value for value | none expected; the review compares the radius |
| G7 | the stunned state | 0x1c: **never from smoke** ("Cough stagger" resolves for no body); **from a close flashbang, yes** (within 70, or 70-100 with the blast BEHIND the head's look direction (s12; NC-3 r117), and within the blast's own radius (unread), not occluded; "Flashbang cower" and its crouched and prone variants, on the disc) (s9.3) | none | **no** (flash) | reading; two links inferred (s9.3) | a hostage near a flashbang cowers (40- and 55-frame clips; the actual duration unread). **LATER 1188** (build the flash case only). **Built (LATER 1188, s12).** |
| G8 | CAiSHold's Tick | `FUN_006060c0` (s2.2) | `HOLD_STATE_TICK_READING` (LATER 1187; was `HOLD_STATE_TICK_PLACEHOLDER`) in match `hostageAi.ts` | **no** (the placeholder is now read) | reading | little: in the replay the state lives a frame. **LATER 1187.** |
| G9 | the idle and watch looks | idle look every 10 + U(0, 5) s (`FUN_00567690`, s1.6); the watch look (238 s2.3); the target look `+0x67c` (s1.7). **The wire carries no head look**: only the host's own player sees them (s9.4) | the watch look recorded on the AI only (`HOSTAGE_WATCH_LOOK_PLACEHOLDER` `match/hostageAi.ts:92`); no idle look | **yes for a dedicated room** (no player sees a host-only look) | reading | none. **LATER 1189 closes as matching** (s9.4). |
| G10 | voices | only YES audible on MP6 (s3.4) | YES played by the page (`viewer/netPage.ts:1811-1822`); the female DAMAGE, DEATH and YES loaded but unused (`viewer/soundData.ts:132-135`) | yes on MP6 | reading | none on MP6. Other hostage maps' banks are unread (s6). |
| G11 | event reactions (gunfire heard, explosions heard, bodies) | none online (s3.1) | none (`onEvent` a no-op, never called) | yes | reading | none. The placeholder's text is corrected with LATER 1185. |
| G12 | orders: the offer, range, aim, team, FOLLOW, HOLD, YES | 189 s3, s14.6 (`FUN_00591dc0`, `FUN_0058fbe0`) | `viewer/net/hostageOrder.ts:257-271`, `match/hostageOrders.ts:172-196` | yes | reading | none. The FOLLOW radio line is unplayed (`RADIO_CHATTER_PLACEHOLDER`, existing). |
| G13 | follow: trail, start gate, formation, heading, arrival, throttle, stance, release | 334, 417, 435; LATER 960 (the trail's life) | `match/hostageFollow.ts:172-253, 432-437, 583-646`; `match/extraction.ts:788-817` | yes, as built | reading; the heading latch measured (435) | the open rows stand: LATER 933, 957, 1126 |
| G14 | leader out of range: WAIT_UP, the 600 stop | local-human leader only (s3.3) | not built (`FOLLOW_STEERING_PLACEHOLDER`) | yes for a dedicated room | reading | none |
| G15 | rescue and extraction: zone, credit, fade, re-order | `FUN_0056f970` D:L432965-432985; `FUN_005594b0`; r0004 refuses a re-order (377) | `match/extraction.ts:846-900`; `RESCUED_REORDER_READING` | yes | reading | none |
| G16 | nav: AIMAPS bits and holes | LATER 946 (bit 5 cleared at load, `FUN_00517eb0`); LATER 1054 (MP6 (103, 6)); LATER 1125 (`mp6_door`) | `match/hostagePath.ts:188-191` | **no** (946); unread (1054, 1125) | reading | the existing rows stand |
| G17 | the start cower | `Hostage_start` (238 s2.6) | not built (`COWER_START_READING` `match/hostageAi.ts:140`) | unknown | reading; the visible effect owed (238 s7) | possibly the pose at round start; the existing placeholder holds it |

## 5. The LATER rows this note opens (numbers claimed in agent-mail `LATER-CLAIMS.md`, 2026-11-18T06:25Z)

- **1185 -- the shot reaction (0x13 ShotAt).** s2.2. Port the hit counter (`+0x718`, 2.5 a hit by a kind-2 shooter, the first hit in a frame only, excluding grenades,
  C4, satchel and claymore; pushed above 1.5) and the state (startle while alert < 2, alert 2, the stance restored after
  0.25-0.5 s; refused: the alert setter asked for 3, conditional and possibly deferred, and a 3 s look), with CanPush as built. Correct `HOSTAGE_EVENTS_READING`'s text and
  research 189 s2 and s12 and 238 s2.3. First settle whether "startled01-05" resolve for the No_weapon set: if not, the
  visible effect is a one- or two-frame pause of a follower only. Owed: a capture (shoot a watching hostage on MP6 and
  record +0x42c bit 19 and the clip). The near-miss trigger is read (ELF 0x5a4f80, registered and dispatched per
  projectile step, s2.2, NC-3 r60); the alert level's other effects are a named unknown.
- **1186 -- the flinch on a non-fatal hit.** s3.2. The host flinches its hostage (not for a blast or a fall). Owed:
  whether the flinch reaches a client in the original (and so who sees it in a dedicated room, possibly an owner
  question in the manner of H478).
- **1187 -- CAiSHold's Tick read.** s2.2. Retire `HOLD_STATE_TICK_PLACEHOLDER` for the reading (AI mode IDLE; sub-state 7's
  look and stance after 2.5 s); `FUN_0056dca0` and `FUN_005b3890` unread.
- **1188 -- the stunned state 0x1c.** s2.2. Settle reachability first: whether `FUN_005b5d40` runs the smoke test for AI
  bodies, whether a flashbang reaches a hostage (332 s7.1), whether the anim globals resolve at run time, and whether
  `.COUGH` is in MP6's banks. Build only if reachable.
- **1189 -- the idle and watch looks.** s1.6, s1.7. The idle look (`FUN_00567690`) is absent from the port, and the watch
  look is recorded but not drawn. Owed: whether the original's wire carries a hostage's head turn to clients; if not, the
  only viewer is the host's own player, whom a dedicated room does not have, and the row closes as matching.

## 6. Unread, named

- The MP maps' AI group records: does any name a hostage (s1.1)?
- 0x19's gate (s1.4): a hostage's side value (ctrl `+0x10c`->`+0x58`; with 0, 4 or 8 the seen test never hits from its own writes; the seen word is shared by every AI), how
  often a grenade's thrower fails to resolve, `cVar9` for a team-sharing thrower, and a grenade's R (`FUN_003d4500`'s
  argument is not visible in the decompiled call): together they decide how often a hostage looks first.
- What fills ctrl `+0x67c` for a hostage (s1.7).
- Cue 0x46's name and slot (s2.2).
- ~~"startled01-05", "Cough stagger" and "Flashbang cower" in the No_weapon set~~: settled in s9.2 and s9.3.
- A hostage's `+0xf8` (s2.2). *(ELF 0x5a4f80's caller is read: s2.2, NC-3 r60.)*
- What the alert level changes for a hostage and how it decays.
- ~~Whether the flinch and the head look reach a client~~: settled in s9.1 and s9.4. Whether Push Blend is sent
  reliably (flags 0x40) is unread: a client could miss a flinch.
- The hostage voice names in the banks of every hostage map other than MP6.
- The vehicle dodge's reachability (s2.2) and 0x12 from the movie player (the AI budget is offline only, s2.3).
- r0004 for every new reading in this note.
- Unread callees: `FUN_005ab850`, `FUN_003472a0`, `FUN_005612f0`, `FUN_00561b90`, `FUN_005ed7b0`, `FUN_00558640`,
  `FUN_003d4500`, `FUN_005807d0`, `FUN_0056dca0`, `FUN_005b3890`, `FUN_00559580`, `FUN_00565110`, `FUN_0060a460`.

## 7. Corrections to earlier notes (re-filed when each is next edited)

- 189 s0 #16 and s2: `DAT_0066b170` is not zeroed online (only `+0x65c` is). "Hostages react to no AI events" holds for
  events, not for behaviour (s0).
- 189 s12, 238 s2.3: the ShotAt push does come, from the hit counter (s2.2).
- 238 s1.5: a living hostage within the knock radius is thrown too (s3.2).
- 238 s2.4: push flag 2 skips the mask (s2.1).
- 207 line 170, 238 line 243: "hostages do not react to explosions" (X4's list) -- the flight (445) and the knock.
- X4: the kick is never for a hostage, not "offline only".


## 9. The four follow-up readings (2026-11-18, on the main controller's order; one reader each, spot-checked by the seat)

Reading, pending review. The disc rows were read through the repository's readers (`animset.rdr` and `motion.rdr` in
`READERC.ZAR`, and `MOTION_P.ZAR`) on the worktree; the code through the decompilation and, where marked, the ELF.

### 9.1 LATER 1186: the original's clients see the host's hostage flinch

- Host: the flinch `FUN_005a2690` (D:L459820) plays the clip and calls `FUN_00588ab0(body, 0xf, anim)` (D:L460025
  **[S]**), which sends a Push Blend to every console through `FUN_002bbaf0` (D:L446015-446029 **[S]**). The send needs
  the clip type's `network_log` keyword (loader D:L496507-496511); all nine flinch and hit types carry it in GLOBAL
  (`animset.rdr`).
- Client: the message handler (`FUN_002bba80` -> `FUN_005880e0` case 0xf -> `FUN_005a2390`, D:L459737-459761) replays
  the clip. It is gated on the body being alive, motion `+0x2b` != 8, state `+0x174` != 8 and `+0xeb8` == 0. The
  client's own `FUN_005a54d0` never flinches: the Hit message's path zeroes the damage (ELF), and the part-health path
  stops at the remote slot `+0x34`. So there is no double flinch.
- So **every player sees a shot hostage flinch.** Unread: what `+0x2b` == 8 and `+0x174` == 8 mean for a hostage, and
  whether Push Blend (flags 0x40) is sent reliably. No owner question: the original shows the flinch to everyone, so the
  port's room sends it to everyone.

### 9.2 LATER 1185: the startle clips do not play on a hostage

- The name lookup `FUN_005e4f90` (D:L496551-496568) is global. It covers 137 built-in names (ELF table 0x661060) plus
  every `type_name` in `animset.rdr`, so "startled01-05" get ids (from the Guard set). The PLAY is per set:
  `FUN_00588bc0` asks the body's set through `FUN_005e3d90` (D:L446078-446081) and plays nothing without an entry.
- `animset.rdr`: the No_weapon anim set includes only GLOBAL, and "startled01-05" are in the Guard anim set only
  (`guard_startled01-05`). `MOTION_P.ZAR` holds no `guard_startled*` clip, and `motion.rdr` flags them SINGLEPLAYER.
- So 0x13 on a hostage shows **no gesture**. What remains visible is a follower's one- or two-frame pause, plus the
  look of a refused push, which only the host sees (s9.4).

### 9.3 LATER 1188: a close flashbang can stun a hostage; smoke never does

- Smoke: `FUN_00571b10` takes the "Cough stagger" id (`DAT_003def88`, D:L434064) and pushes nothing when it is -1
  (D:L434116 **[S]**). The name is in neither the built-in list nor `animset.rdr` (s9.2's dump), so it is -1 for every
  body: **unreachable**. The push is skipped on -1 for every slot, not only slots 1 and 3 as s2.2 first said.
- Flash, in order:
  - A flashbang hitting the hostage queues a blast (`FUN_005ac070`). Its online early return tests a controller slot
    that returns 0 for both controller classes (ELF 0x544200).
  - Friendly fire never drops a hostage, because of team bit 0x20000 (research 179 s8.2, not re-read).
  - The body tick applies the blast (`FUN_005a0e70`, D:L417906), and `FUN_005a5250` hands slot 0 and the point to
    `FUN_00571b10` (ELF).
  - Upstream, `FUN_005a0e70` skips the body when the material loop finds the line blocked and `FUN_003c8310` (GetFlag9, the
    override) is false (D:L459183-459192) *(corrected 2026-11-23, NC-3 r115)* or its falloff is
    0 or less, i.e. outside the blast's own radius (`FUN_003d4500`, D:L459211-459227; the flashbang's radius is
    **unread**), before it calls `FUN_005a5250` (D:L459228).
  - `FUN_00571b10` then pushes 0x1c within `DAT_00650008` (70), or within `DAT_00650010` (100) with the blast behind the head's look direction (s12; the rig bore it out)
    (D:L434092 **[S]**: distance and the head's look direction only *(corrected 2026-11-23, NC-3 r117)*). So the reach is the smaller of these and the blast radius.
  - The clip goes by stance: "Flashbang cower" standing, "Crouch flashbang cower" crouched, "Prone cover" prone. All are
    in GLOBAL and on the disc (`guard_flashbang_cower` 40 frames, the crouch pair 55 frames). `motion.rdr` gives them a
    `playback` field (5.2, 5.1, 4.3) whose meaning is unread, so how long a hostage cowers is not settled.
  - Research 332 s7.1's "no blast point" is the camera-shake point, not this path.
- **Reachable**, with two links inferred: that the blast walk reaches the hostage's hit handler (research 179, 85), and
  whether the host detonates a client's flashbang (research 332 s7.2).

### 9.4 LATER 1189: the wire carries no head look

- The look lives in the controller (`+0x24`-`+0x60`, `FUN_00601330` / `FUN_00600d40`) and is applied through
  `FUN_00600550` -> `FUN_005ae640` -> body `+0x1190`. `FUN_00600550` runs only from CSealCtrlAi's Tick (D:L433101) and
  from a local controller's slot. CRemoteCtrl never runs it.
- The body writer `FUN_002bd640` (D:L161921-162073) sends no look field (field 0x7d is the weapon's pitch). No message
  carries a look, and the "Head looks" clip types have no `network_log`.
- So only the host's own player sees a hostage's head turn. A dedicated room has no such player, so this is
  **matching**, and LATER 1189 closes.

## 10. Readings and placeholders of LATER 1185 and 1187 (as built, 2026-11-18, `agent/later-1185-shotat-r2`)

Added by coreA for the build of s2.2's 0x13 and CAiSHold rows; reading, pending review.
The author re-read `FUN_00572330` (D:L434250-434403), `FUN_0056fd00` (D:L433253-433287) and `FUN_006089f0` (D:L515083-515284)
at the source: for a hostage 0x13's sub 0 raises the alert to 2 and goes to sub 5, which clears the live bit the same tick
(D:L515130-515133, D:L515277-515279) -- its Tick returns done and the driver pops it IN THAT FRAME (s11, LATER 1205): the
state holds the stack for one tick, and the state below is not ticked that frame (settling the one-or-two-frames question
of s2.2); a refused push zeroes the counter (no retry each frame). *Corrected 2026-11-18 (the 1185 review's F1): first
written "pops it the next frame".*
0x13's entry saves the stance held (`+0x278` into its `+0x5a`, D:L515345); its exit asks it again after 0.25 + U(0, 0.25) s
(`FUN_00563100`, D:L515338-515340), overwriting a pending request, and zeroes the counter (D:L515342) -- the review's F2.
The first review's F3: the frame stamp is written for any hit (D:L434400), so an uncounted hit spends its frame.
**The order (the r2 review's F1):** the push (`FUN_0056fd00`, ctrl `+0x10` from the entity tick `FUN_00550ef0` D:L418091)
is a frame task at priority 4.6 (D:L50925 -> D:L145104), after the AI driver's pre-tick at 1.0 (D:L50922 -> D:L145123 ->
D:L418526 -> D:L432513). So 0x13 pushed in frame F stands on top across the boundary and is ticked and popped by frame
F+1's driver (in the capture below, F is the hit frame H: on top at H+1's read, gone at H+2's); the port calls `controllerUpdate` after the step. The 0x13-pop branch of the danger scan's push (s1.3) is
not reached by that: the scan pushes flight only after `FUN_005f5cd0(., 0x1b, 0)` passes (D:L482954-482955), which
tests the AND of every stacked mask that `FUN_005f7470` builds (D:L505623, D:L506572), and 0x13's mask `0x31040800` lacks bit 27 (D:L506540), so a standing 0x13 blocks the flight
push for the frame it stands *(corrected 2026-11-23, NC-3 r125)*.

**(C) PC 2's capture (LATER 1185; r0004, MP6, 2026-11-18; a memory-read capture of the original, every frame from H-12 to
H+45, hand-scored, n = 6: A watching x2, B following shot ~0.1 s after the order x2, C following shot ~6.5 s after x2;
`agent-mail` `evidence/later1185-shot/`, sha256 24fc737e...c67c5f):**
- H (the hit frame): `+0x718` set, `+0x40c` = H, the part damage applied, the stack unchanged;
- H+1: 0x13 (class 0x006697f0, id 19) on top; H+2: popped, `+0x718` = 0. All six hostages lived.
- watching: 0x17's time `+0x38` holds one frame at H+2 -- one frame's dt (0.0334 s) lost, as s11 has it;
- following: the follow state (9) RESTARTS on the pop, at sub-state 0 with `+0x38` 0 (the resume, `FUN_005fdf80` case 3).
  **The port does not restart it** (an open item, also under 0x1b; not built here);
- `+0x718` at H: 2.5 for the watching hostage, **3.48-4.39 for a follower** -- more than one hit's 2.5; what adds the rest
  is unread (an open item; the push's threshold 1.5 is passed either way);
- the stance: every trial's hostage stood (`+0x278` 0), so the restore had nothing to show; the ask `+0x279` went 255 -> 0
  at H+2 with its delay `+0x280` at 0.31-0.46 s (within 0.25 + U(0, 0.25), the exit's FUN_00563100);
- a round that did no part damage still set the counter and pushed 0x13 (one trial kept apart as invalid);
- `+0x718` eases between H and H+1 (2.5 -> 2.4875; 3.5251 -> 3.4986, about 0.5 % a frame): `FUN_0056fd00` itself eases it
  toward `+0x71c` through `FUN_005551c0` when `+0x720` is 1, snapping within 0.005 (D:L433440-433446). **Read, not built**:
  no effect as built (the push is the next frame's, and the exit or a refusal zeroes the counter); a lead for the
  follower's 3.48-4.39.
The rescue post-tick (`FUN_0056f970`, ctrl `+0x3c`) is called from the actor's slot `+0x20` (`FUN_005506a0`, D:L417905),
run by the frame task at priority 6.0 (`FUN_0029f1a0`, D:L50929, D:L145053-145062): after the push, as the port's
`controllerUpdate` then `rescueTest` (the r2 re-review; the body's vtable per research 230).

| Name | Value | Basis | Level |
|---|---|---|---|
| `HOSTAGE_SHOT_COUNTER_READING` | `{ hit: 2.5, push: 1.5 }`; the first hit in a frame stamps `+0x40c` whether it counts or not (D:L434400) | `FUN_00572330` (`DAT_0064fdd8`), `FUN_0056fd00` (`DAT_0064fde8`), the disc ELF | reading, pending review |
| `HOSTAGE_SHOT_EXCLUDED_READING` | 0x79-0x80, 0x97, 0x98, 0x99 | `FUN_00572330`'s switch on the record's `+0x7c` (~D:L434335-434361) | reading, pending review |
| `HOLD_STATE_TICK_READING` | `'AI mode idle'` | `FUN_006060c0` (D:L513892-514090); was `HOLD_STATE_TICK_PLACEHOLDER` | reading, pending review |
| `HOSTAGE_ALERT_PLACEHOLDER` | kept, read by nothing | the alert level's effects on a hostage unread | placeholder |
| `HOSTAGE_SHOT_LOOK_PLACEHOLDER` | not built | the refused push's 3 s look (`FUN_005fad00`); the wire has no head look (s9.4) | placeholder |
| `HOSTAGE_NEAR_MISS_PLACEHOLDER` | not built | `FUN_005729f0`'s broadcaster (ELF 0x5a4f80) is registered for weapon event bit 1 once at game and level setup (`FUN_005a49f0`, D:L460995, D:L461055) and dispatched at each projectile step (D:L320062), so a close miss can push ShotAt (NC-3 r60) | placeholder |

## 11. The driver's same-frame pop (LATER 1205, as built 2026-11-18, `agent/later-1205-ai-driver-pop`)

Added by coreA for LATER 1205; reading, pending review. It corrects s1.9's "the driver only pops" in one respect: WHEN.

- **The driver** `FUN_005f8030` (D:L506872-506930), once a frame on the stack `ctrl+0x41c`, on the top state:
  - its live bit (`+0x4a` bit 1) clear: the result is 1, and no Tick runs;
  - live: its own nested stack is driven first (s1.9); with none, its Tick (vtable `+0x10`) runs and the RETURN is the result;
  - result 0: the stack's time (`+0x18`) and the state's time (`+0x38`) take dt (D:L506919);
  - result non-zero: the top is popped in the same call (`FUN_005f7c40`), and the state below is not ticked until the next frame.
- **The Ticks' return.** Every hostage Tick returns `!(+0x4a bit 1)`, stored at `+0x28`. Ghidra types several of them
  `void`; the machine code returns the stored value. State 9 also has three early paths that store and return a literal
  0 while the bit is set (D:L508603-508604, D:L508658-508659, D:L508772-508773): the same value.
  - 0x17 `FUN_00601910` (0x601e08-0x601e40);
  - 9 `FUN_005fb1c0` (typed to return it: D:L508580-508583, D:L509119-509121);
  - 0x11 `FUN_00559070`;
  - 2 `FUN_006060c0`;
  - 0x1b `FUN_0055ac20`;
  - 0x13 `FUN_006089f0` (0x609138-0x609154).
- **Which Ticks clear their own live bit:**
  - 0x17: never; `FUN_00601910` holds no clear of `+0x4a` bit 1.
  - 9: when `FUN_005fdd40` returns 0 (D:L508578-508583). Its condition is unread; the port ends 9 only by the leader's release, an external clear.
  - 0x11: in a case gated on `DAT_0045a0c1 == 0` and bit 0 of `+0x5c` of the node `CEntity::GetNode` (`FUN_0029ed20`) returns, not the state's own (D:L422192-422211) *(corrected 2026-11-23, NC-3 r136)*. The port's online 0x11 stays in sub-state 2 and never ends.
  - 2: when `+0x2c` bit 2 is set and the stack's clock, ctrl `+0x434` (the stack at `+0x41c`, its time `+0x18`, advanced by the driver each frame, D:L506919), has reached the deadline `+4` (D:L514072-514075); sub-state 0 made `+4` that deadline by adding the clock to it (D:L513922-513923). Nothing is read from the body, and the roles are the reverse of a limit *(corrected 2026-11-23, NC-3 r137)*. Not built: the port's 2 has no Tick (1185/1187 give it the AI mode only).
  - 0x1b: at its end (D:L423058-423061), built (LATER 1170); and in sub-state 9 (D:L423518-423519), not built (the port
    has no sub-state 9).
  - **0x1b's end timer, frame by frame (the review's finding 4; an open reading, not built here):** the original sets `+4` on
    its first gone-frame WITHOUT subtracting dt (D:L423028-423049), subtracts from the next frame, and clears the bit on
    `< 0` (D:L423052-423059). The port subtracts on the starting frame and ends on `<= 0`, so with the same-frame pop its
    flight is about two frames shorter than the original's for the same timer (`HOSTAGE_FLEE_END_PLACEHOLDER`, whose value
    is unread). For the next 1170 fold (the hostage rows' owner, coreA).
  - 0x13: in sub-state 5 (LATER 1185, on top of this).
- **As built.** `HostageAi.step`: after the tick, a top that is no longer live is popped at once, with no time added. A
  top cleared from outside (`releaseFollow`) is popped at the next step without a tick, as before.
  `HostageAi.ticked` names the state whose Tick ran: the room skips its own physics step when that state was 9 or 0x1b,
  which step the body in their Tick (the review's finding 1: on a flight's last frame the body was stepped twice).
- **Its effect today:** 1170's flight ends one frame sooner. 0x17 then ticks on the next frame, not two frames later.
- **Its tests:** match `test/hostageAiPop.test.ts`: 0x1b's same-frame pop with no time added; the external clear; a live top ticked and timed.

## 12. The flashbang cower, 0x1c (LATER 1188, as built 2026-11-18, `agent/later-1188-flash-cower`)

Added by coreA; reading, pending review. With the rig's capture (C: PC 3, r0004, MP6, 2026-11-18, hand-scored;
`agent-mail` `evidence/later1188-cower/` unpacked, unpacked-2, unpacked-3).

- **The test** (`FUN_00571b10` D:L434002-434172; machine code 0x571c14-0x571d8c): from `FUN_005a0e70` (D:L459194-459228,
  the blast walk's hit handler, past the line and inside the item's radius) through `FUN_005a5250` (D:L461250-461294)
  to ctrl vtable +0x50. `d` = |head - point| and `f` = dot(head - point, look), the head node and the head's look
  direction: body `+0x11a0` turned by the body's matrix (`FUN_005a3070` D:L460103-460150, D:L460122-460146; used at
  D:L434055-434058), not the body's facing *(corrected 2026-11-23, NC-3 r117)*; cower when `d` < 70 (ELF 0x650008), or `d` < 100 (0x650010) and `f` > 0 -- the
  blast behind the head's look direction (D:L434092).
  - (C) behind at 87.9-92.5 u: all six cowered; 97-102 u: none. The FRONT band (70-100 u, the head looking at the blast) was not
    reached by the rig: the body turns back to its idle facing within about 0.8 s. The port tests it from the code alone.
- **For a flashbang (cause 0)** (D:L434063-434168; with 0x1c already on top the function returns before any draw,
  D:L434032-434043): the clip by stance -- standing or crouched a coin between two
  (U <= 0.5 the first; which run-time global holds which clip is unread, the rig saw anim 167 and 168 standing), prone
  `Prone cover` (`DAT_003dece0`, s9.3) (D:L434093-434111); a running 0x1b's live bit cleared (D:L434137-434150); 0x1c pushed through the gate
  (`FUN_005f5c00`, refused over a running 0x1c) with `+4` the duration (max(old, 2.0) from `FUN_005a5250`), `+0x58` the
  cause, `+0x5c` the clip and the wait flag (`+0x2c` bit 0) (D:L434151-434168); the cue -- slot 0x48 of the actor's sound table (`FUN_0053b8f0(FUN_00599810(actor), 0x48)`, D:L434113-434114) into
  `+100` (D:L434113-434114, D:L434163), played once on a 0.15 + U(0, 0.25) s timer (D:L513820-513851), `+0x70` starts
  at 0 (the 0x1c constructor's `FUN_005ea550(0, +0x68)`, D:L506172, D:L499501-499512) and counts down
  (D:L513823-513828), so the first cue fires on the first live Tick, for every 0x1c (each push builds a fresh state), provided the
  no-timer sentinel `DAT_0065a858` is not 0.0 (its value unread here) *(corrected 2026-11-23, NC-3 r149)* -- is `HOSTAGE_COWER_CUE_PLACEHOLDER`, not built. The cause-0
  branch's other writes (ctrl `+0xa8`, `+0x700`, `+0x6f4`, `+0x70c`, `+0x404`) are not built (their readers unread).
- **0x1c's mask** `0x21042000` (`FUN_005f7470` case 0x1c, D:L506566-506567).
- **Its Tick** (`FUN_00605c60` D:L513770-513870) and OnSignal (`FUN_00605f90` D:L513864-513889): OnSignal(0) draws a delay U(0, 0.75) s
  (`+0x60`) and sets the AI mode 2 (not built); sub 0 waits it out, then the clip starts the next tick (`FUN_00571150`):
  sub 2 while it plays (`FUN_005712f0`), sub 3 after; sub 3 ends it unless the wait flag holds it while the stack's time
  is under `+4` -- by the clip's end it is not. A suspend or a resume (2, 3) ends it. So the life is the delay and the
  clip: the clips run `playback x ((n - 1) / n)^2` (`FUN_0028c4f0`): 4.94 / 4.56 s standing, 4.92 / 4.53 crouched (40
  and 55 keys), 3.78 prone. (C) 0x1c lived 4.8-5.45 s (n = 6, mean about 5.1), `+4` 2.0, `+0x58` 0, anim 167 / 168:
  within delay + clip (4.56-5.69 standing). This settles s9.3's "playback whose meaning is unread": the one-shot's run.
- **As built:** the room's `blastHostages` calls `Extraction.flashCower` for a Mark141 past the gate and the line: the
  item's radius (150) from the feet, then `cowerTest` from the head (`HOSTAGE_COWER_HEAD_PLACEHOLDER`: the head node's height unread; the SEAL
  body's head eye height stands in, 15.884 standing, 9.904 crouched; the rig's controller eye `ctrl+0x90` read 17.46) and the body's facing (the original uses the head's look direction, s9 and NC-3 r117: a port departure, routed to the hostage files' owner); passed, `HostageAi.cower` (0x1c, its
  Tick as above). The body carries the playing clip as its action: four cower codes APPENDED to `ACTION_CODES` (no byte
  moves; a page that predates them reads them as no action, `viewer/test/actionCodeUnknown.test.ts`), prone
  `proneCover`; the page plays them as reactions (`SEAL_ANIMS`, `MOTION_CLIPS`: GLOBAL, which the hostage's set includes).

- **An open contradiction (the review's F8; for its own row):** the capture's watching hostage STOOD (`ctrl+0x278` 0
  throughout the watch; anim 167 / 168, the standing clips), where the port's watching hostage crouches (0x17's watch,
  research 238): the evidence this task rests on disagrees with the port's watch stance, which predates it.

### 12.1 Readings of LATER 1188 (reading, pending review)

| Name | Value | Basis | Level |
|---|---|---|---|
| `HOSTAGE_COWER_READING` | `{ near: 70, behind: 100, duration: 2.0, delay: 0.75 }` | `FUN_00571b10` (ELF 0x650008, 0x650010), `FUN_005a5250`, `FUN_00605f90` | reading |
| `HOSTAGE_COWER_CLIPS_READING` | the clips by stance and their playback and keys | `FUN_00571b10` D:L434093-434111; `motion.rdr`, `MOTION_P.ZAR` | reading |
| `HOSTAGE_COWER_HEAD_PLACEHOLDER` | `'feet + scopeEyeHeight(posture)'` | the head node (actor `+0x308`, `FUN_005a3070`) unread, stood in by the SEAL body's head eye height; settled by a rig read of that point standing and crouched. The facing too (SHOTS-1208 r117, research 445 s5.10): the original's is the world head look (the CLook direction `+0x11a0` through the body node `+0x28`'s rotation), the port passes the bare body facing -- a named departure until a hostage head-look rotator is built (its rest direction unread) | placeholder |
| `HOSTAGE_COWER_CUE_PLACEHOLDER` | not built | slot 0x48 of the actor's sound table (`FUN_0053b8f0`) on 0x1c's timer (D:L434113-434114, D:L513820-513851); the first fires on the first live Tick (`+0x70` starts 0, D:L506172), provided the no-timer sentinel `DAT_0065a858` is not 0.0 (s12; NC-3 r149) | placeholder |


## 8. Review

- **Re-read 1 (2026-11-18, a fresh `reviewer`, read-only): FAIL**, one blocking finding. Record:
  `agent-mail/evidence/weekend-mega-2026-11-14/reviews/research447-reread.md`. Confirmed at source: the `+0x266` bit 3
  stores; the 0x13 chain (2.5 a hit, the exclusions, the push above 1.5, CanPush in sub-states 5 and 6, startled01-05,
  the exit); CAiSEvent's timeline and pop; CAiSHold's Tick; flag 2 skipping the mask; the flinch gate; the knock of a
  living body; the kick's own-team gate; `DAT_0066b170` not zeroed; four rows of s2.3; 13 rows of the gap table.
  - F1 (blocking): 0x19 only on a re-notice (s1.4, s2.2, G2). Fixed, and re-read at source by the seat; the correction
    was sent to coreA for LATER 1170 the same hour.
  - F2: `FUN_005faae0` still runs the remembered-event look online (s1.5). Fixed.
  - F3: the gate of 6, 0xf and 0x1d is circular, not an online test (s2.3). Fixed.
  - F4: 0x13's two extra gates (a kind-2 shooter, first hit in a frame). Fixed in s2.2 and LATER 1185.
  - F5: line numbers. Fixed: D:L434403, D:L514551-514600, D:L513518, D:L434912, D:L440981, D:L515130-515133,
    `hostageAi.ts:28`.
  - F6: the target look's fallback point `+0x6d4` (s1.7). Fixed.
  - F7 (for research 445): a thrower missing from the hostage's body `+0xd0` list makes the first pass return unmarked.
    Sent to coreA.
- **Re-read 2 (2026-11-18, a fresh `reviewer`): FAIL**, one blocking finding; same record, "## Re-read 2". F1 (blocking):
  the "re-notice" wording was not the gate's condition (an earlier flight that saw the grenade has set the side's seen
  bits; the out-of-radius route was dropped; a mark can be made unseen). Fixed in s0, s1.4, s2.2 and G2, which now state
  the gate and its routes and leave the frequency unread (s6). F2-F3: line numbers (D:L482615-482621, D:L505621-505623).
  F4: s5's 1185 bullet carries the two gates. One point the seat reads differently: re-read 2's route "the thrower does
  not resolve" (D:L482641) -- the seat reads the `else` at D:L482712-482714 as leaving the object unmarked in that case,
  so the note does not list it; for the next reader.
- **Re-read 3 (2026-11-18, a fresh `reviewer`): FAIL**, four blocking findings; its text is in the same record under
  "## Re-read 3" (pasted by the seat; the reviewer's contract is read-only). F1: a mark outside R is not a route by
  itself (a seen mark closes the gate wherever it is made). F2: the unresolved thrower IS a route; the seat's reading of
  the `else` was wrong (it belongs to D:L482647's `if`). F3: no frequency words. F4: `FUN_005416b0` is read
  (D:L408833-408836). F5: R comes from the object record, not obj `+0x10`. F6: kinds tested at D:L482954; `cVar9`'s
  `+0x2c` fallback. The seat then read D:L482608-482760 whole itself and rewrote s1.4 from it: two unseen-mark cases
  ((i) the thrower unresolved, (ii) unseen with a team-sharing thrower and `cVar9`) and the side values 4 and 8.
- **Re-read 4 (2026-11-18, a fresh `reviewer`): PASS WITH FINDINGS** (1-5, non-blocking; every s1.4 citation holds;
  no missing unseen-mark case on this AI's own pass; no frequency claimed). Fixed: side value 0 behaves as 4 and 8;
  the seen word is shared across AIs; case (ii) is a listed, non-self, kind-2 thrower; (cone or near) and visibility;
  the 0x19 push does not depend on the 0x1b push succeeding. Text in the record under "## Re-read 4".
- **Re-read 5 of the follow-up (2026-11-18, a fresh `reviewer`): PASS WITH FINDINGS** (1-3, non-blocking; the 435
  merge, 435 s4.3 and s9.1-s9.4 confirmed at the source). Fixed: the occlusion test is upstream in `FUN_005a0e70`
  (D:L459192), not at D:L434092; the blast's own radius also bounds the stun (unread); the cower clips' duration is in
  frames, their `playback` field unread.
