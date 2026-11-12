# 397 -- An online round ends with two of the projectile manager's calls, not the level's teardown (research 393 §6 step 3)

- Date: 2026-11-10. Research 393 §6 step 3, on the controller's queue. The owner ruled in the shadow seat on 2026-11-10
  that our own Horizon stack with two clients needs no window of his (MISSION OT.R103's restatement). Branch
  `agent/spc-round-start` (base mega cfbc7efb7).
- Track: **simulation**. This note is about what the game does when an online round ends. It changes no code and no
  constant. `ROUND_START_PROJECTILES_READING`'s premise is contradicted for online rounds, as measured (§4).
- Evidence kind: **a call trace of the original running**, plus **source inspection** of the decompilation.
  - The trace: PCSX2 with the PINE debugger patch (research 393 §5.1; the log's build `v2.8.2-1-ge0ae99a8e`, stock v2.8.2
    being run 1, which armed nothing) as both clients, r0004, on our local Horizon stack on the owner's second PC. A
    two-client classic match on Frostfire (MP2), client B hosting and client A joining, 6-minute rounds, nobody firing.
  - PC breakpoints on client A only, over PINE, each hit logged and stepped past, client A never left paused.
  - Frames of client A around a transition. Research 393 §6 step 1 is the build's control.
- Sources: the r0001 decompilation (`D:L<line>`), the r0001 ELF and the r0004 ELF (`game/overlays_r0004/socom2_game_r0004.elf`)
  read by their program headers.
- Second read (2026-11-10, a reader who did not write it; source inspection and ELF bytes, nothing run): **stands with
  corrections**, folded here (§6).

## 1. The question

Research 95 §8 reads that a round's reload empties the level's projectile manager through the level's teardown:
- the teardown is `FUN_001eb8c0` (D:L50567; D:L50597-50599 empties and frees the manager through `FUN_003ccbc0`);
- that is `ROUND_START_PROJECTILES_READING`'s premise.

Research 101's row (2026-11-09) noted against it that an online round's start is a re-place, not a reload
(`FUN_00223680`, D:L75913-75936). It named the nearer evidence, unread: `FUN_002aa910`'s projectile calls at the round's
end. At D:L151239 it calls `FUN_003cceb0` with the manager, the +4 field of the object `FUN_002b3580` returns, and 0xff;
at D:L151242 it calls `FUN_003ccc90` with the manager. Both sit under the online flag `DAT_0045a0c1` (D:L151233-151243).
The step asks the running game which of these runs.

## 2. Mapping the functions onto r0004

r0004 relocated part of this code, so r0001's addresses do not all hold. Each r0001 function was searched in the r0004
ELF by its first 16 words (8 where the 16 did not match), with `jal` targets and `lui` immediates masked; then the live
r0004 words were compared before arming. The search leaves the low halves of relocated addresses unmasked, so it is
strict: it gives false "not found", not false matches. The second read checked each match whole-function from the bytes.
- `FUN_003cceb0` -> r0004 **0x003ef050**: 16/16 words, 8/8 live; whole function 157/168 words identical, 168/168 with
  `jal`, `lui` and low halves masked; four callers in each build, paired one to one.
- `FUN_003ccc90` -> r0004 **0x003eee30**: 16/16 words, 8/8 live; whole function 64/64 identical; one caller in each
  build (r0001 0x2aaa08, r0004 0x2ac368).
- `FUN_003ccbc0` -> r0004 **0x003eed60**: unique on 8 words; 7/8 live, 8/8 with relocations allowed; whole function
  matches with low halves masked; r0004's teardown calls it at the same site, 0x1ebae4.
- `FUN_001eb8c0` stays at **0x001eb8c0**: 7/8 live words. The 16-word search misses it (its sixth word's low half
  moved); with low halves masked it is unique there, with one `jal` caller, 0x1ebe90, in both builds.
- `FUN_002aa910` -> r0004 **0x2ac270**. The 16-word search did not find it, because the low halves of its string
  addresses moved; with those masked it is unique (on 8, 16 and 24 words). It makes the same 18 calls in the same order,
  the `FUN_003cceb0` call at +0xe4 in both (r0001 0x2aa9f4, r0004 0x2ac354). Its tail differs in r0004 (from +0x1d4),
  after the projectile calls, and is unread. Five of its six callers moved by 0x1aa0; the joiner's (r0001 0x2aa714,
  r0004 0x2ac07c) moved by 0x1968, so r0004 also changed code in between, unread.
- `FUN_003d3930` (D:L50613) was searched and not found by the 16-word pattern; it is at r0004 0x3f5b80 with low halves
  masked. Its one caller is inside the teardown, so it was not armed.
- `FUN_00223680` stays at 0x223680. It is MPExitState's Tick (research 115 §8), a per-frame tick, so it was not armed.

## 3. The run (2026-11-10, 02:51-03:16Z)

- Breakpoints on client A at 0x3ef050, 0x3eee30, 0x3eed60 and 0x1eb8c0 for 20 minutes from 02:51:29.5Z, seconds into
  round 1 (the level's load is not in the window). Each hit: the pc, `ra`, `a0`-`a2`, `sp`; then clear, one instruction
  stepped, re-armed, resumed.
- **Hits, all at three round transitions 368.05 s and 368.00 s apart (02:57:26, 03:03:34, 03:09:42Z), the same at each:**
  - `FUN_003cceb0` (0x3ef050) with `ra` 0x2ac35c, `a0` 0x013d4710, `a1` 0x66, `a2` 0xff;
  - then within 0.1 s (60, 95 and 61 ms) `FUN_003ccc90` (0x3eee30) with `ra` 0x2ac370 and the same `a0`.
  - These are D:L151239 and D:L151242, called from `FUN_002aa910`'s r0004 counterpart (the two `ra` minus 8 are the two
    calls at 0x2ac354 and 0x2ac368). `a1` 0x66 is the +4 field of `FUN_002b3580`'s object on client A, an id, not a
    constant: `FUN_005998b0` (D:L455498-455518) passes the same field of an object it is removing, and `FUN_003cceb0`
    compares it with each entry's +0xac (D:L321671, D:L321694).
  - `FUN_003cceb0`'s other callers (D:L455518, D:L471692-471693) would have stopped at 0x3ef050 with another `ra`; none
    did.
- **Not hit in 20 minutes, across those three transitions:** `FUN_003ccbc0` (the manager's empty) and `FUN_001eb8c0`
  (the level's teardown). The breakpoint mechanism fired on the other two addresses in the same run; there is no
  positive control on these two (§4).
- **The transition is ROUND COMPLETE.** The frames are of client A at the next transition predicted from the 368.0 s
  period, 03:15:50Z, taken after the breakpoints were cleared (03:11:29Z), so no trapped hit has a frame of its own:
  - -2 s: the round clock at 00:00;
  - +1 s: ROUND COMPLETE (a draw), NEXT ROUND 10;
  - +8 s: STARTING ROUND 5 OF 11, the clock at 05:57 and the soldier back at his place.
  - So the calls run about 3 s after the clock's zero, as ROUND COMPLETE comes up (the 3.0 added at D:L150620 and
    D:L150631 fits), tied to it within about 2 s (the frames are 3-4 s apart). The next round follows about 8 s later
    with no level teardown.
- An earlier run (02:26-02:41Z) hit `FUN_003cceb0` with the same `ra` and second argument at its first round's end (`a0`
  was 0x013d4760 in that match; the third argument was not logged). It then left client A paused at that breakpoint,
  because the resume did not step past it, so it shows only that first hit.

Evidence (host-local, not in git): the second PC's bucket upload for 2026-11-10, `v3-round-start/`. It holds
`roundbp.log` (all three runs), the probe `roundbp.mts`, `findfn.py`, `caller.py`, the driver's phase logs, the
remapping record and the five frames. No golden holds the trace yet.

## 4. What this settles, and what it does not

- **Proven, measured running** (r0004, on the joining console of a two-player classic match on Frostfire on our own
  server, rounds 1 to 3, each ended by the clock, nothing in the air): as ROUND COMPLETE comes up, the game calls two of
  the projectile manager's functions from `FUN_002aa910`'s counterpart: `FUN_003cceb0` with the manager, the console's
  own id (0x66 on client A in this run) and 0xff; then `FUN_003ccc90` with the manager.
  - The level's teardown `FUN_001eb8c0` and the manager's empty `FUN_003ccbc0` do **not** run between those rounds.
- **So `ROUND_START_PROJECTILES_READING`'s premise ("the round's reload runs that teardown", research 95 §8) does not
  hold for an online round, as measured.** What runs at an online round's end, where the teardown does not, is these
  two calls. Whether they leave the air clear was not measured: nobody fired, so the manager held nothing.
- **What the two calls do is a reading** (D:L321649-321727, D:L321578-321608), not measured here: with 0xff the first
  removes the entries whose owner field (+0xac) is that id, of any kind, from the list and from the pool; the second
  removes none and sets bit 0x04 in the byte at +6 of every listed and every active pooled entry. The ledger's row for
  the constant already carries this read (`ledgers/2026-10-04/LEDGER-ALL.tsv`, `ROUND_START_PROJECTILES_READING`:
  "removes the local player's projectiles and flags every other one (+6 bit 0x4)").
- **Not settled:**
  - the host's console: by the reading the host reaches `FUN_002aa910` from `FUN_002a9b30` (D:L150629-150668, under
    `DAT_0045a0c0`), a joiner from `FUN_002aa490` (D:L151127-151131, round state 4 or 6); only the joiner's was run, and
    which of the counterpart's six callers ran was not recorded (`ra` is one level deep);
  - a round ended by a win; the last round and the match's end (state 6 takes the same branch, D:L151128);
  - a round with something in the air, and so whether the air is left clear;
  - an offline round (a mission or the replay's `ReplayMission`), where research 95's account may still hold;
  - a Demolition or respawn round;
  - what bit 0x04 at +6 does to an entry;
  - an emptying that does not pass through `FUN_003ccbc0`: it empties through `FUN_003cd150` (D:L321542), which has a
    second caller, `FUN_003d0350` (D:L323392-323403), reached from the teardown (D:L50600 -> `FUN_001ea6e0` ->
    D:L151625) and outside it from `FUN_001f1bb0` (D:L53472 -> `FUN_002ac0e0`, D:L151964). `FUN_003cd150` (r0004
    0x3ef2f0) and `FUN_003d0350` (r0004 0x3f2550) were not armed; the next trace arms 0x3ef2f0;
  - a positive control on the two unhit addresses: the teardown's breakpoint firing when the match is left.

## 5. The ledger

- `ROUND_START_PROJECTILES_READING` (viewer `armoryGlue.ts`, server `room.ts` `clearAir`): **a reading still, its
  premise contradicted for online rounds as measured.** The port's behaviour (the room clears its `flying` at
  `startRound`) may still match what the two calls do; that is the open part.
- **The timing, recorded, not applied:** the original's calls run as ROUND COMPLETE comes up; the port clears at the
  next round's start, about 8 s later.
- Research 101's row's "owed" moves on. The trace is no longer owed for the joiner's clock-ended round. What is owed:
  what bit 0x04 at +6 does (beyond the ledger's read), a trace with a grenade or a charge in the air at a round's end,
  the host's console, and 0x3ef2f0 armed.
- Sites that still state the contradicted premise, owed with the row: `room.ts` `clearAir`'s doc, `armoryGlue.ts`
  :17-18, `grenade.ts` :1108, and research 95 §8's row.
- No constant is added or renamed. The placeholder ledger is unchanged.

## 6. The second read

A reader who did not write the note re-read it at the source (2026-11-10; source inspection and ELF bytes, nothing run).
Verdict: **stands with corrections.** Both measured claims (the two calls, and the teardown not running) hold at proven
for the measured conditions; every armed r0004 address and the call site check out whole-function from the ELF. Folded
above: the claim narrowed to its conditions (§4); 0x66 recorded as the console's id, not a constant (§3, §4, research
101's row); "what clears the air" replaced by what runs, the air's state unmeasured (§4); `FUN_002aa910` found at
0x2ac270 (§2); the unarmed `FUN_003cd150` route and the missing positive control (§4); the timing (§3, §5); the call
expressions put in words, "frames of both clients" corrected to client A, the build named (header, §1). The reader's
report is host-local evidence beside the trace.
