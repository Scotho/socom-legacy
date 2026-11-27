# 450 -- The original's AI sight test at short range (LATER 1122)

The bodies seat, 2026-11-20, for LATER 1122 ("opposing bots a few units apart investigate and search for ~1500 ticks
without engaging"; its step (2): "the original's sight test read"). Source inspection of the pinned decompilation
(`socom2_game.elf.decomp.c`, r0001) and of the ELF's own bytes for the controller tables, the small slot functions and the
constants (read only, by scratch scripts; nothing committed from them). Every value below is a **reading** (transcribed,
not measured running), **pending review** (the first fresh review FAILED the first draft on the cone's axis and five
smaller points; this text folds them). Research 321 s4.1.1 read the same machinery for the HUMAN's controller (the
reticle's mark); this note reads it for the AI's (`CSealCtrlAi`, table 0x6693f0 in r0001; research 404 names r0004's
0x668d70 as the class) and adds what differs.

## 1. The two controller tables, the slots that matter (the ELF's words)

| slot | human 0x6694b0 | AI 0x6693f0 | what it decides |
|---|---|---|---|
| +0x0c (update) | `FUN_00594cf0` | `FUN_0056de10` | the body's per-frame controller update |
| +0x24 | -- | 0x55ff60 | called by the AI walk's within-35 branch (s4) |
| +0x2c | 0x5431f0 -> 1 | 0x575c30 -> **0** | the side test in `FUN_005cc120`: 1 takes every body, 0 only a body whose team word shares no bit with the observer's (an ENEMY) |
| +0x30 | `FUN_005499d0` | 0x575c40 -> 1 | type-4 targets (taken only when 0) |
| +0x38 | 0x5431e0 -> 0 | 0x575bf0 -> **the controller itself** | the near test behind, and the target's snooze bits (s3) |
| +0xa8 (cone) | `FUN_005c9520` | **`FUN_005c9400`** | lays the cone |
| +0xac | `FUN_005ca170` | `FUN_005ca470` | the record's mark set / cleared |

(0x575bf0: `jr ra; daddu v0, a0, zero`; 0x575c30: `jr ra; daddu v0, zero, zero`; 0x575c40: `jr ra; addiu v0, zero, 1`.
Call sites by the ELF's `jal`s: `FUN_005cba20` only from the AI update (0x56e9ec), `FUN_005ca9f0` only from the human's
(0x594e2c), `FUN_005cc120` only from those two walks; `FUN_005c9400` appears only as the AI table's word.)

## 2. The AI's cone (`FUN_005c9400`, D:L481718-481767)

- **The eye and the axis.** `FUN_005a3070(actor, &pos, &look)` gives the head's point and a LOOK direction: the actor's
  `+0x11a0` vector turned into world space by the body's matrix (D:L460122-460141). The AI's axis is **0.5 x (look +
  (-row 2 of the body's matrix))** -- the look summed with the body's facing and halved (D:L481742-481750; `FUN_00309240`
  three `add.s`, `FUN_00309180` with 0.5, the ELF's words) -- stored at `+0x9c..+0xa4`. The HUMAN's cone
  (`FUN_005c9520`) uses the look alone (321 s4.1.1 point 3).
- **The reach and the width.** The reach `+0x80` = the controller's `+0xa8`; the RADIUS at the eye `+0x88` = **25** (so 50
  across)
  (the immediate 0x41c80000; the human's `DAT_00650a80` is also 25); its growth `+0x84` = the controller's `+0x68` x
  `+0xa8`, applied through `+0x8c` = 1 / reach (D:L481751-481755). So the radius at `a` along the axis is
  **25 + a x ctrl`+0x68`**. No magnification and no camera term (the human's has both).
- **The shape.** The axis is a unit vector only when the look and the body's facing agree. If the look has unit length
  (unread, below) and they differ by an angle t, it is their bisector with length cos(t/2): `along` is scaled down by that, and the take test's lateral distance,
  |d|^2 - along^2 (D:L483248-483251), is then larger than the true one -- the test is stricter than a circular cone's,
  and, if the body's -z row is level and shares the look's yaw, its tilt is half the look's pitch. It is one circular cone only when the look equals the facing. In every case
  there is **no separate vertical test**, and the computed lateral distance is at most |d|; so a target within 25 u of
  the eye with along > 0 is in the cone -- given the slope `+0x68` >= 0 and the reach `+0xa8` (and the camera's MID) at
  least 25, both unread (s6), the range test before it being origin to origin.
- The values of the AI controller's `+0x68` (the slope) and `+0xa8` (the reach), and what `+0x11a0` holds (unit length?
  pitch?), are written outside the functions read here: **unread** (s6).

## 3. The AI's walk and the take test

The AI's update calls the cone (D:L432466) and then, on its flag `ctrl+0x266` bit 3, its own walk **`FUN_005cba20`**
(D:L432501-432503). `FUN_005cba20` (D:L482974-483134) runs over the body's neighbour records (`+0xd4` count, `+0xd8` the
48-byte records). A record's `+0x10` is the distance SQUARED, body origin to body origin in 3-D, height included
(`+0x1c` against `+0x1c`, written by `FUN_002a0a10` D:L145913-145914, D:L145935-145936; research 321's ledger had it
unread): the 25 / 35 / 50 below and the 100 behind are measured origin to origin. For each record whose target is active
and is no team-mate (`(target+200 & self+200) == 0`, D:L483049) the walk calls the same take test as the human's,
`FUN_005cc120` (D:L483114); a refused record is decayed and unmarked (D:L483114-483124), as in 321 s4.1.1 point 3. The
take test (`FUN_005cc120`, D:L483169-483305), for the AI:

1. **Side**: slot +0x2c answers 0, so a target is taken only when it shares no team bit with the observer (D:L483196).
2. **Active and type** (D:L483200-483215): the target active (`+0xe1` bit 4); a type-2 body; a type 3 by its flags; a
   type 4 only when slot +0x30 answers 0 -- the AI's answers 1, so never.
3. **The target's snooze bits** (D:L483218-483225): a type-2 target whose own controller answers slot +0x38 and carries
   `+0x265` bit 0 or 1 is refused. An AI target's +0x38 answers itself, so between two AI bodies this applies (321
   s4.1.1 point 3 recorded it for the human's targets). What sets `+0x265` bits 0/1 on an AI is unread.
4. **Range**: the distance squared within the reach squared, capped by the camera's MID squared where a camera exists
   (D:L483226-483234).
5. **In the cone** (D:L483236-483254): along = axis . (target - eye); taken when **0 < along <= reach** and the lateral
   distance (as s2) is under **25 + along x ctrl`+0x68`**, compared squared -- so the 25 is a radius.
6. **Out of the cone but in front** (along > 0): taken when it moves across the ground faster than 50 a second
   (`DAT_006509e8` 2500 against its velocity's x/z squared, D:L483255-483261).
7. **Behind** (along <= 0): taken within **100** (`DAT_006509f0` 10000 against the distance squared) when slot +0x38
   answers a controller and that controller's `+0x264` bit 1 is set (D:L483263-483268). For the AI, +0x38 answers ITSELF:
   so an AI whose `+0x264` bit 1 is set takes an enemy behind it within 100. What sets and clears that bit is **unread**.
8. A taken target gets a sight query from the eye to the target's point (D:L483270-483296); the query's visibility and
   the rate it gives are 321 s4.1.1 point 2 (lighting, speed, stance, smoke; the materials met).

## 4. The AI walk's own short-range branches (D:L483066-483111)

- Any active type-2 body within **50** (`DAT_00650a08` 2500), of either team, sets the observer actor's `+0xe0` bits 6
  and 7 (D:L483067-483078; the slot +0x38 result computed there does not gate them) -- what reads them is unread.
- A marked enemy within **35** (`DAT_00650a10` 1225), on the controller's `+0x264` bit 1 and the actor's `+0xe1` bit 1,
  calls slot +0x24 (0x55ff60) with (1.0, 5, 1) (D:L483088-483092) -- unread.
- The within-**25** branch (`DAT_00650a00` 625, D:L483095-483111) starts goal type 0x0e on the target (the goal's `+0x58`
  the target, `+0x4a` bit 1), when the controller's `+0x430` bit 1 is set, `FUN_005a9500(self, target)` answers, and the
  top goal is not already 0x0e. It is reached ONLY (D:L483085-483088) for a type-2 target, the observer actor's `+0xe1`
  bit 1 clear, a record ALREADY MARKED (`+0x2c` & 0x200), its `+0x2c` bit 1 clear and the target's `+0x105c` bit 3
  clear: **an enemy the AI has already seen**. It is no near-range awareness without sight. `FUN_005a9500` and goal 0x0e
  are unread.

## 5. Against the port's bots (match `src/bots/matchBots.ts` `perceive`, :955-1030 at agent/later-1122-bots-fight; :909-936 when written)

The port (a) drops an enemy outside a 70-degree horizontal cone about the bot's yaw (skipped within 1 u, :985), (b) drops
it when the elevation to its chest differs from the bot's pitch by more than `fovVertical` / 2 = 24.5 degrees (:986),
(c) drops it behind geometry, (d) in smoke; (e) under a danger focus it keeps the enemy in `b.seen` (:990) but skips it as
the target (:991-992). Against the reading: **(a) and (b) are narrower than the original's at short range** -- the
original's cone has a 25-unit RADIUS at the eye, so a body within 25 u in front (along > 0) is in it at any bearing and
any height (given the conditions of s2), and it has no vertical test at all (its axis tilts by half the look's pitch); behind, the original's AI may take an
enemy within 100 on its `+0x264` bit 1; and between two AI bodies a target's snooze bits (`+0x265`) refuse it. That is
consistent with LATER 1122's scene (two pairs 1.7-20 u apart on a floor step at y 48-53, investigating ~1500 ticks
unengaged), but the scene's per-tick reason (the row's step (1)) is not recorded, so the match is **not shown**. The
port's bots are the port's own players (OT.R81); this reading is the source a fix to their cone would cite, with the axis
of s2 (the look and the facing averaged), not the facing alone.

## 6. Unknowns (the one built on is in s7's ledger)

The AI controller's `+0x68` (the cone's slope) and `+0xa8` (the reach); what the actor's `+0x11a0` look vector holds
(unit length, pitch); what sets `+0x264` bit 1 (the near test behind and the within-35 branch) and `+0x265` bits 0/1 (the
target's snooze); `FUN_005a9500` and goal 0x0e (the within-25 reaction on a seen enemy); slot +0x24 (0x55ff60); the
readers of the actor's `+0xe0` bits 6-7.

## 7. Readings (built 2026-11-24, LATER 1122, agent/later-1122-bots-fight)

The build: match `src/bots/matchBots.ts` `perceive` (its `nearCone`) takes an enemy within 25 u of the eye (3-D, eye to
`perceive`'s chest point) and in front of the axis of s2 (along > 0; the port's look its walker's yaw and pitch, its body
facing the yaw) past the port's 70-degree cone and 24.5-degree vertical cut; line of sight and smoke still apply. Beyond
25 u nothing changed: the port still cuts by the player's camera fov where the original takes a body whose LATERAL distance
is under 25 + along x `+0x68` (wider at any range, no vertical test) -- not built, the slope and the reach being unread (s6).
Behind (along <= 0) the bot still sees nothing: the original's take within 100 behind on `+0x264` bit 1 is not built (what
sets the bit is unread). The danger focus (the port's (e)) is kept: nothing read here bears on it, and it never drops an
enemy within the port's `immediateThreat` 40, so none within 25.

| name | source | holds | status |
|---|---|---|---|
| `AI_CONE_EYE_RADIUS_READING` | `FUN_005c9400` D:L481755 (`+0x88` = 0x41c80000 = 25.0); `FUN_005cc120` D:L483246-483252 (the lateral distance against it, squared) | match `src/bots/matchBots.ts` (`perceive`'s `nearCone`) | reading, pending review; taken as a sufficient case (within 25 u, along > 0) given the slope `+0x68` >= 0 and the reach `+0xa8` >= 25, both unread (s6) -- the port's half-ball within 25 u is inside the original's cone with a non-unit axis too (s2: the computed lateral distance is at most |d|). Inside 25 u the original still refuses or delays where the port does not: the target's snooze bits `+0x265` (D:L483222-483225, s3 point 3); the camera's MID cap on the range (D:L483229-483233, s3 point 4); the sight query's visibility rate after the take (D:L483270 on, s3 point 8) -- all unread or not built in the port; settled by a read of the AI controller's `+0x68`/`+0xa8` writers and of `+0x11a0`, or a capture of two AI bodies at short range |
