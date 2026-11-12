# 394 -- C4's reach word: its writer caught running by a write watch (research 393 §6 step 2)

- Date: 2026-11-09. The machinery seat's and the controller's go (research 393 §6, step 2). Branch `agent/spc-c4-reach`
  (base `origin/agent/mega` d02006d95).
- Track: **simulation**. This note is about where the game writes a value it decides on. It changes no code and no
  constant. `C4_REACH_READING` stays a reading, and its row in research 101 moves on (§4).
- Evidence kind: **a memory trace of the original running**, plus **source inspection** of the decompilation.
  - The trace: PCSX2 v2.8.2 with the PINE debugger patch (research 393 §5.1), on the owner's second PC, on r0004 slot 5
    (M51's start). It used our client, `tools/eph/pineDebug.ts` (`agent/spc-pine-debug`, merged to mega).
  - Its control: research 393 §6 step 1. The patched build left the proven prone gate unchanged in all 18 trials.
- Sources: the decompilation of the r0001 game ELF, `socom2_game.elf.decomp.c` (cited `D:L<line>`), and that ELF's
  bytes. Research 202 §2.1 and research 181 §4 are the earlier readings this note tests.

## 1. The question

C4 can be set when `body+0x208 < 396`. The gate reads it at D:L452032, D:L452386 and D:L475402 (research 202 §2.1).
`FUN_00215c10` makes its own copy of that test, for the HUD, at D:L70075. Research 181 §4 could not find
that word's writer statically and owed a write breakpoint. Research 202 §2.1 then read two stores in `FUN_00215c10`,
the HUD's per-frame tick for the local body:
- 0x215c8c stores 100000.0 (D:L69982, `piVar18[0x82]`, and 0x82 x 4 = 0x208);
- 0x215f08 stores `|v|^2` (D:L70063), where `v` is the aimed point minus `skel_root`, and the default is 100000.0
  (D:L70032).

The step asks the running game which instructions write the word.

## 2. The run (2026-11-09T20:18Z)

- Boot `-state 5`, then pause. The local actor is `*(0x00435618)`, the r0004 `playerActor` address in
  `tools/eph/sampler.ts`, which read 0x014c5d00. At rest: `+0x208` = 0x47c35000 (100000.0), feet at
  (938.23, -145.55, 858.24).
- Add a write watch on [actor+0x208, actor+0x20c) (opcode 0x2E, EE, write), then resume. At each pause: read the pc, the
  word, the registers and the nine code words around the pc. Step one instruction, read the word again, resume.
- 12 pauses in 0.6 s, alternating between two pcs, every frame:
  - **0x00215c8c**: the instruction is `sw v0, 0x208(s4)`, with `v0` = 0x47c35000 set by the `ori` just before it.
  - **0x00215f04**: a `jal`, whose delay slot 0x00215f08 is `swc1 $f0, 0x208(s4)`. The watch pauses at the branch, and
    the store runs in its slot.
  - At both, `$s4` = 0x014c5d00, the actor. So the body these stores write, research 202 §2.1's, is the sampler's
    local actor. Research 181 defines its body as `*(0x440c38)`, a different global from the sampler's (r0001
    0x408c58). This run did not read `*(0x440c38)`, so whether 181's body is the same object is **not measured**.
  - Every write was 100000.0. The soldier aimed at nothing that takes the held item, so `fVar21` kept its default.
- **The two sites are the r0001 code.** I read the r0004 words at pc-16..pc+16 live and compared them with the r0001
  ELF's bytes at the same addresses. They are equal word for word at 0x215c8c. At 0x215f04 they are equal except two
  relocated address words:
  - the `jal` target (r0001 0x005bdb00, r0004 0x005c46b0);
  - a `lui` (0x0041 / 0x0044).
  So `FUN_00215c10` sits at the same address on both builds.
- **The range compared, by the fresh review** (2026-11-09; the r0004 image against the r0001 ELF), across the whole
  function 0x215c10-0x216770:
  - 0x215c10-0x21627c is identical bar relocated address words. That span holds both stores and the 396 `lui` at
    0x215f58.
  - 0x216280 to about 0x216458 really differs on r0004: an inserted indirect call, and the branches around it shifted.
  - The code re-aligns at 0x21645c.
  - So the decompilation's lines apply to these two sites and to the 396 test, **not to the whole function**.

Evidence (host-local, not in git): the second PC's bucket upload for 2026-11-09, `v2-c4-reach/`. It holds `watch.log`,
`hits.json`, the run script `watch.mts` and the word comparison `elfwords.py`.

## 3. What this settles, and what it does not

- **Proven, measured running:** `FUN_00215c10`'s two stores write `body+0x208` every frame for the local body: at
  0x215c8c (D:L69982), and in 0x215f04's delay slot at 0x215f08 (D:L70063). With nothing acceptable aimed at, both
  write 100000.0. No other instruction wrote the word in the 0.6 s watched.
  - Not a complete list of writers. The body's constructor also stores 100000.0 there once: the static init at
    0x5542f8 (`FUN_00553ea0`, D:L419564; research 181 §4, research 202 §2.1). It ran before the state was saved, so a
    watch started on a loaded state cannot see it.
  - Limit: one state at rest with nothing aimed. A writer that runs only in some other state (a C4 target aimed at, a
    round's start) is not excluded by this run.
- **Not settled:** the value below 396 and its 19.9 u reach.
  - Research 202 §2.1's reading stands: the squared distance from `skel_root` to the aim ray's hit, written only when
    the struck object accepts the held item.
  - It needs a write with C4 held and a C4 target aimed at, inside and outside 19.9 u, compared with the distance read
    off the same frame. M51's start offers no such target, so it is owed: a state on a demolition map with C4 in the kit
    (§4).

## 4. The ledger

- `C4_REACH_READING` (viewer `equipment.ts`): **a reading still**. The writer is now proven (§3), but the value the
  constant stands for is not measured. Research 101's row changes its "owed": the writer is no longer owed, and what
  is owed is the value. That is a watch on the same word from a state with C4 in reach, held at a demolition target at
  19.8 u and 20.0 u, with the word compared to `|hit - skel_root|^2` on the same frame.
- No constant is added or renamed. The placeholder ledger is unchanged.
