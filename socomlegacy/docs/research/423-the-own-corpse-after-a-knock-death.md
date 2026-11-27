# 423 -- The own corpse after a knock death: the knocked body falls, lands and stays down (LATER 1055)

- Date: 2026-11-15. Branch `agent/later-1055` (worktree `wt-later-1055`), base 078a2c73b7; LATER 1055, step 2 (the fix
  at the root), from the owner's report of a player's clip of a live v0.4.22 match (2026-11-14) and the RED file
  `packages/viewer/test/later1055DeadKnock.test.ts` (d4c69b5602 and before).
- Track: simulation. Status: **reading** (re-read at the source by the fresh review of 2026-11-15, `agent-mail/evidence/weekend-mega-2026-11-14/reviews/later-1055-review-6dea0f975.md`; section 1: the r0001 decompilation, `socom2_game.elf.decomp.c`,
  cited `FUN_<addr>` and `D:L<line>`, re-read by the author; a fresh reviewer's re-read at the source is owed).
  **Nothing here is measured on the original running.**
- Evidence kinds, kept apart: **(D)** source inspection of the decompilation; **(R)** the match's replay, decoded
  (section 3.2); **(C)** the owner's screen recording, read by eye (section 3.1); **(U)** unit tests of the port
  (synthetic, and one over the disc's fixture clips); **(O)** the original running -- none.
- New names: none. No `*_READING` or `*_PLACEHOLDER` is added or changed.

## 0. The answer

1. **The original knocks a dead actor too, and a knocked corpse stays down** (D; section 1): the blast's knock is laid
   whatever the alive bit says, a dead actor's state taken as 8; the knock's landing pushes its get-up only while alive,
   and dead it sets state 8 instead.
2. **The port's mover already holds that** (U; section 2.1): every get-up start is refused while `dead_`.
3. **The port's page could revive its own corpse** (U; section 2.2): a re-run of the page's kept commands
   (`WalkMode.rerunFrom`) lays back a mover state saved before the page heard its own kill, `dead_` false with it, and a
   living knocked body lands and gets up. Fixed at the root: a dead page lays its death back on the mover as each re-run
   starts. Which path the clip took is **not proven** (section 2.3).

## 1. The original (D, reading)

- **The blast's knock on a dead actor.** `FUN_0057e770` (D:L440932): after releasing the hang or ladder
  (`FUN_005a5da0`, D:L440993) and the cover pop (`FUN_0058a4d0`, D:L440997), it reads the actor's state byte and,
  when the alive bit (`+0xe1`, the bit the shift by `0x3b` tests) is clear, takes state 8 in its place
  (D:L440999-441002); the knock is laid either way. The port's room follows this already (`room.ts`'s `layKnock`
  before `kill`, KNOCK_LETHAL_IN_MOVE_READING, PF-19).
- **The knock's landing.** `FUN_00589aa0` (D:L446479), in the two landing branches (`DAT_003deee8` from D:L446663,
  `DAT_003deef0` from D:L446686): after popping the stack, while the alive bit is set (D:L446667, D:L446700) -- and the
  vtable test at `+0x34` of `piVar13[0x30]` answers 0 -- it pushes the get-up node with `FUN_00588bc0`
  (`DAT_003deef8` at D:L446673, `DAT_003def00` at D:L446706) and returns. With the alive bit clear it calls the
  actor's state setter (vtable `+0x90`) with 8 (D:L446682-446683, D:L446715-446716). No get-up is pushed for a dead
  actor on this path: the knocked corpse falls, lands and stays down.
- Which branch is `Land forward` and which `Land backwards` is the port's existing mapping (BLAST KNOCK, `mover.ts`);
  this note does not re-read it.

## 2. The port

### 2.1 The mover (U)

`Walker` (`packages/viewer/src/mover.ts`) refuses the get-up while `dead_` at every place one starts: the landing's
clock end in `runClocks` (`landDeath` and `landBackwards`, mover.ts:4370-4376) and the stick's cut of a landing in
`step60` (mover.ts:4427-4432); the `dead` setter puts a get-up already playing back to the landing's last key
(mover.ts:2789-2793). No other `start('getUp' | 'getUpBackwards', ..)` exists in the file. So a dead mover is already
as `FUN_00589aa0` dead: no change to `mover.ts` is made or needed.

Cases (i), (i') and (iii) of `later1055DeadKnock.test.ts` hold it on the page's path as a live match drives it (the
knock replayed from the room's command, the kill with no clip, `setDeathPose(null)`): the mover falls, lands on a flat
floor and holds `landBackwards` at its last key, dead every tick, and the drawn skeleton root lies under half its
standing height once the landing is held (iii, over the disc's fixture clips). These rule out two hypotheses on a flat
floor: **(a)** the mover never landing, held at the end of the fall in the air; **(b)** the animator drawing the held
landing standing.

Case (iv) holds that the room's own snapshot of the page's own seat -- dead, airborne, its stance field `stand`
throughout (section 3.2) -- never reaches the page's drawing: the room's per-recipient pass drops the seat's own body
and sends `own` null while it is dead, so nothing of it is drawn or reconciled on the page.

### 2.2 The mechanism: a re-run after the death (U)

`WalkMode` keeps, per command it sends, the mover's whole state (`Walker.saveState`); a re-run (`rerunFrom`, the
knock's `replayKnock`, the dance's `replayVictory`, the refused take's `mountUntake`) lays one back with
`Walker.restoreState` and runs the commands since through `MoverSim`. `restoreState` copies every field but the
`KEPT_SHARED` ones (mover.ts:2150), and `dead_` is not shared, so a state kept before the page heard its kill comes back
alive. The page runs ahead of the room: every command between the room's kill and the page's hearing of it was kept
alive. A re-run from one of them after the death revives the body, and the living knocked body lands and starts
`getUpBackwards` (mover.ts:4375): the corpse stands.

Case (ii') is that mechanism alone (a re-run from a command after the knock's and before the page heard the kill, run
after the death): RED at 078a2c73b7, "tick 4: the mover dead (state 8): expected false to be true".

**The fix** (`packages/viewer/src/walk.ts`, `rerunFrom`, right after `w.restoreState(at.walker)`): when the page is dead
(`WalkMode.dead`, the net client's `kill`), the death is laid back on the mover (`w.dead = true`) before any command
runs. The room's order makes this exact for a knock death: it lays the knock and kills at the same command
(`room.ts`'s blast handling, `blast` sent then `kill`), and a re-run reaches back only past the knock's command
(`canReplay`'s `knockedAfter`), so every command it runs the room ran on a dead body. For another death (no knock),
the kill's command is not told to the page; laying the death from the re-run's start is the nearest the page can do,
and every re-run after the death begins after a command the room ran no later than its kill's tick. The kept states
the re-run saves again carry `dead_` true, so a later re-run from them stays dead too.

**The fix's limits (the fresh review, 2026-11-15; latent, no caller reaches them today).** For a death with no knock
the page lays `dead_` from the re-run's start, while the room killed the body at a later command: the commands between
would run dead on the page and alive in the room (a dead mover refuses stance changes and `popStand` and turns a landing
into `landDeath`) -- the re-run is not exact there, only the nearest the page can do. For a fall death the line uses the
plain `dead` setter, not `diedOfFall`: a kept state saved mid-`landHard` is not turned into `landDeath`, so a re-run
after a fall death would still end the hard landing standing (as before the fix; not a regression). Both stay open.

### 2.3 What is not proven

The investigation found no re-run reachable after the death on today's callers: `canReplay` refuses one from before the
knock's command (walk.ts `knockedAfter`); the net page's push re-run is guarded by `!this.dead`; a dance re-run needs a
dance; `mountUntake` finds nothing once the kill's `setDeathPose(null)` has cleared the kept take (case (ii) holds it).
So the mechanism of 2.2 is a latent root, closed for every caller present and future, and **the clip's exact path is
not proven**. If the clip's path is another, the fix does not reach it; a rendered look at the replay from the victim's
page, or a trace of the victim's page, would settle it.

## 3. The evidence

### 3.1 The clip (C)

The owner's screen recording of a live v0.4.22 match (15.8 s, 30 fps), a Demolition round, kept in the local evidence
folder `agent-mail/evidence/dead-standing-2026-11-14/` (players' names stay there; nothing of it is in the tree). Read
by eye: the kill line for an M67 at about 11.2 s; the body stands upright where it died for about 1.8 s, one arm to the
head; for about a second, with the camera turned, it is drawn leaning back with the arms flung out; then upright again
for as long as the clip runs. No death fall is shown. Whether the recording is the victim's own page or another page's
view of him is not known from the clip.

### 3.2 The replay's decode (R)

The match's replay was decoded by one process on the hub, 2026-11-15 03:05:33Z to 03:05:54Z, under the owner's leave
on recordings, ruling WM.R19 (given before 03:03Z, verbatim: "You may review any and all match recordings necessary to
address bug fixes or anomalies without my apporval."). Seat numbers only; the output stays in the evidence folder. All
five M67 kills of round 5, cause 4, no death clip:

- From the tick after the kill the victim's body is dead and airborne, in `fallBackwards` (one kill) or `fallForward`
  (four), its clock advancing.
- It lands on the ground: the first landed snapshot is 18 to 29 ticks after the kill (the decode samples every other
  tick; the kill near tick 37423 lands at +23 in `landBackwards`, the others in `landDeath`); the landing runs out and
  is held at its last key to the end of the window (+249). No get-up appears in any of the five.
- The dead body's stance field stays `stand` throughout -- the room's stance byte is not the drawn pose; a remote page
  draws the action, and the page's own seat never receives it (2.1, case (iv)).

So the room is right; the standing corpse is the victim's page alone.

## 4. Unmeasured

- **Which console lays the local actor's knock online** in the original -- the local client from the host's message, or
  the host's state copied down -- and so whether the local corpse is ever simulated apart from the host's.
- **Whether the original's local client ever corrects its own corpse toward the host's** (the port's page draws its own
  body from its own mover alone; the room's own-seat body is not sent while dead).
- Neither needs a named constant in the code today: the fix follows the reading of section 1 on the page's own mover.
  What would settle them: a two-console capture of a blast death of the local player, the host's and the victim's
  screens and the victim's actor state traced through the fall and the landing.
