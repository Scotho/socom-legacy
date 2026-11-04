# 346 -- The disc's encrypted overlays in the page: LATER 271's feasibility read

- Date: 2026-10-22 (03:49Z). LATER 271, on the owner's word in the merge controller's seat, 2026-10-22 ~03:00Z: "if
  decrypting the overlays is feasible, I approve" (HUMAN_TASKS H270, answered). Prompted by PR #431: the original's online
  talk cue is `FUN_0030ec10`'s table at 0x003df540 (research 170 §5.4, `VOICE_TALK_PCM_PLACEHOLDER`), which no file of the
  retail disc holds in the clear. The online seat (redotcom-e0); branch `agent/later-271` from `8c425a281` (B130's landing).
- Review: a fresh review of `ce2bfec41` returned FAIL on two claims about how the desktop runs the chain (F1, F2) and
  three smaller points (F3-F5); folded here with the text they corrected kept beside ("was: ...").
- Status: **a feasibility read** -- source inspection only. The desktop's tools and its decompilation were read; nothing
  was run (no desktop tool, no emulator, no game). No value here reaches the game; no constant is added. The decision (§4)
  is the merge controller's, 2026-10-22; the three questions only the owner can settle are H291, H292 and H293 (no A code until H293).
- Sources. The desktop at the `ref/desktop` pin, cited `desktop@be557831:<path>:<line>`. The DNAS overlay's decompilation
  `game/analysis/DNAS.dec.bin.decomp.c` (SHA256 `0D179C2851AD84089F62158CD789837371C668BC50F37FDF04B9C27637417C8C`), read
  by function, never pasted. The disc tree under `SOCOM_DISC`: file sizes and ELF program headers only, read by a scratch
  script that copied no bytes. Earlier notes, not restated: research 170 §5.4 (the talk cue), research 322 (the game ELF's
  load segment).

## 1. What the retail disc holds

The retail ELF is a loader; the game is two overlays it decrypts at run time
(`desktop@be557831:docs/DEVELOPING.md:17`). The game ELF the desktop decompiles, `socom2_game.elf`, is the desktop's own
build of loader plus decrypted overlays (`desktop@be557831:tools_py/disc_to_elf.py:1-40`), not a disc file.

| file on the disc | size | what it is |
|---|---|---|
| `SCUS_972.75` | 874,792 bytes | the boot ELF (`SYSTEM.CNF` `BOOT2`): the loader. Its segment at 0x1e7000 has file size 0, memory 0x2ce380 -- the place the first overlay is inflated into |
| `OVERLAY/REL/DNAS.BIN` | 667,136 bytes | DNAS (libdnas2), loaded at 0x4c5380: the decryptor, itself with ~130 self-encrypting code blocks |
| `RUN/RAW/APACHE00.ZDB` | 1,548,056 bytes | the code package: two entries, `ftscore` and `zsealetc` |

What decryption yields: `ftscore`, inflated to 0x1e7000 (2.2 MB; the built ELF's segment of file size 0x221480, which holds
0x003df540), and `zsealetc`, inflated to 0x4c5380 (1.7 MB) -- the game's whole code and data. (Correction to a first note
in the seat: the overlays are `APACHE00.ZDB`'s entries; `OVERLAY/REL` holds DNAS, the decryptor.)

## 2. The chain, as the desktop runs it

`desktop@be557831:tools_py/decrypt_apache.py:1-17` (the loader's disc path, `FUN_001c59c0` / `FUN_001c5da0` in
`SCUS_972.75`), `:309-353` (the steps), `desktop@be557831:tools_py/dnas_selfdecrypt.py:1-15`:

1. **DNAS's own blocks**, decrypted ahead of time, mostly in Python. About 130 protected functions start with
   `if (flag == 0) DECRYPT(start, size ^ key, key, flags)`; the cipher is a chain of up to 7 word-wise 32-bit transforms
   (xor, rotate, byte swap ...) selected by nibbles of a descriptor derived from the key; words in a per-block skip table
   (relocations) are left alone. Four copies of the decryptor sit in the overlay (`dnas_selfdecrypt.py:30`: 0x4ee9e8,
   0x52b9d0, 0x53a358, 0x5412a0). The desktop finds the blocks and their size, key and flags in Python (`find_blocks`,
   `:66`), mirrors the skip table's logic in Python (`skip_list`, `:86-87`, "Mirror FUN_00541378"), takes the four
   (key table, cipher core) pairs from the Ghidra decompilation (`discover_variants`, `:42-52`; recorded for r0001 in
   `disc_to_elf_expected.json`'s `dnas.variants`), and emulates only the cipher core. (~2 s.) (The review's F2; was: "The
   desktop runs each variant's core routine under emulation rather than re-implementing it.")
2. **The loader to `main`.** The boot ELF's startup runs to `main` (0x1c4cc0); DNAS is loaded at 0x4c5380 -- the
   already-decrypted `DNAS.dec.bin` of step 1, with DNAS's four runtime decryptors switched off (`decrypt_apache.py:103-123`,
   `load_overlay`, `noop_decryptor`), so the per-call decrypt and re-encrypt never runs; then, by r0001's addresses,
   `main`'s own first calls -- `sceSifInitRpc(0)`, `sceCdInit` -- and DNAS's init, 0x534830. The IOP is stood in for:
   `sceSifBindRpc`, `sceSifCallRpc` and `sceSifCheckStatRpc` (`:126-165`), and the CD drive's S-command server (SID
   0x80000593, `:227-234`), which answers with a made-up console ID, i.LINK ID and drive-controller values -- free for the
   disc package, where they "feed a hash the content does not verify" (`:169-172`).
3. **Each ZDB entry**, the disc path: 0x539d00 parses and verifies the signed DNAS container (answering the payload
   length); 0x539d50 decrypts the body; 0x534848 and 0x535018 are the content layer; then zlib inflate. (A package off the
   memory card takes the last two steps only, `FUN_001c60b0`.) (~473 s for both entries.)

All of it is offline: the keys are in the disc's own files; no network call is made.

Cost as measured by the desktop (`disc_to_elf.py:20-30`, 2026-09-21, an NVMe machine): 2 s and 473 s -- the cost under
a different engine (Unicorn, which translates plain MIPS to native code as it runs, with only the R5900's own encodings
in Python hooks; DNAS pre-decrypted and its runtime decryptors switched off), **not a bound on A**: an interpreter in the
page may be slower on the plain code, and A pays DNAS's per-call decrypt and re-encrypt the desktop skips. A's own cost is
H292's. (The review's F1; was: "an upper bound for an interpreter of our own, not its cost".)

## 3. Two ways into the page

**A. An R5900 interpreter of our own, in the page, running the player's disc's own loader and DNAS code at run time.**
No transcription of DNAS's algorithms enters the repository: the interpreter is generic, and the code it runs comes from
the player's disc. But A as sized still puts in git the IOP stand-ins of §2 aimed at DNAS's interface (the SIF RPC calls,
the CD S-command server with a synthesized console identity). Its run-in-place step is **untested**: no cited source runs
DNAS's self-decrypting blocks in place under emulation (the desktop decrypts them first, §2 step 1); a console does, so it
is plausible, not shown. As sized it is **r0001-specific** (DNAS's entry points, `main`'s first calls and the startup's
skip at 0x1ac9d8, all by r0001's addresses), unless it runs the loader's own path end to end, which needs CD-read and SIF
stand-ins beyond §5's. Its cost is unmeasured (H292). (The review's F2; was: "No game logic enters the repository: the
interpreter is generic, and every instruction it runs comes from the player's disc.")

**B. A native port of the algorithms**, each transcribed as a reading, the keys read from the player's disc at run time.
Size, by a read of the callee tree from the five entry points in `DNAS.dec.bin.decomp.c` (0x534830, 0x539d00, 0x539d50,
0x534848, 0x535018), direct `FUN_` calls only -- **a floor** (15 calls through code pointers in the tree and any calls into
the loader not followed; two of the self-decryptors, `FUN_0053a358` and `FUN_005412a0`, counted in; the review's F4):
**127 functions, about 6,150 decompiled lines** -- the container's verify and decrypt (from
0x539d50) about 5,200, the content layer (0x534848, 0x535018) about 4,400, overlapping; the largest `FUN_00535018` (681
lines), `FUN_00537700` (568), `FUN_00538dd0` (379) -- read as size only, not for what each does. It would run in seconds,
but it puts a transcription of DNAS's protection logic in the repository.

## 4. The decision (the merge controller, 2026-10-22)

**A.** No transcription of DNAS's algorithms into git (the review's F2; was: "No DNAS logic transcribed into git" -- the
IOP stand-ins of §2 do sit in git); B only if A's measured cost forces the question back to the owner. **No A code is
written until the owner answers H293** (the merge controller, after the fresh review): A answers DNAS's S-command
interface with a synthesized console identity in committed stand-ins, which is not the same as reading the player's own
disc -- the legal side H270 left to him. Default meanwhile: nothing built; #431 keeps `.TCM_SELECT`. The owner's
two more questions: **H291** -- keep the decrypted overlays in the player's own browser storage across sessions (never
uploaded, clearable), as the disc access already keeps a player's extracted files in IndexedDB with a clear, or decrypt
every session; default meanwhile, decrypt each session. **H292** -- an instrumented desktop run of the chain, counting the
instructions A must interpret, on the desktop by its own seat or the owner; nothing from this repository runs the
desktop's tools.

## 5. A's work list, sized

From the desktop's harness (`desktop@be557831:tools_py/ee_unicorn.py:1-8`, 818 lines over Unicorn's MIPS64), which names
what Unicorn lacks and it emulates:

1. **The core**: the R5900's MIPS III and the parts of MIPS IV it has (Unicorn's base, here ours), 64-bit GPRs with their
   upper 64 bits (128-bit registers), HI/LO and the pipeline-1 HI1/LO1, SA; branch delay slots; **self-modifying code** --
   DNAS decrypts and re-encrypts its blocks in place at each call, so instructions are decoded at fetch, never from a
   cache that a write does not invalidate (the review's F2).
2. **The R5900's own encodings**: three-operand MULT, the MMI group (`_mmi`, `_mmi_sub`), LQ/SQ, the pipeline-1 MULT/DIV,
   EI/DI, CACHE, PREF; the FPU's single-precision subset with its accumulator (`_fpu`), as far as the chain uses it.
3. **Memory**: 32 MB of RAM with its uncached mirrors (0x20000000, 0x30000000), the scratchpad (0x70000000), dummy
   hardware and GS register windows.
4. **The kernel and the IOP, high level**: the syscalls the chain reaches -- the semaphore and thread calls, GetThreadId,
   ReferThreadStatus, FlushCache (`ee_unicorn.py:281-316`), SetupThread (0x3c) and SetupHeap (0x3d)
   (`decrypt_apache.py:285-287`); the stubs for `sceSifInitRpc` and `sceCdInit`; the SIF RPC stand-ins (`sceSifBindRpc`,
   `sceSifCallRpc`, `sceSifCheckStatRpc`, `:126-165`) and the CD drive's S-command server (SID 0x80000593) answering a
   synthesized console identity (`:169-234`); the startup's kernel-patch search skipped (0x1ac9d8, `:287`). (The review's
   F2 and F3; was: these items without the SIF RPC and S-command stand-ins, and SetupThread, SetupHeap and the skip cited
   to `ee_unicorn.py`.)
5. **Loading**: the boot ELF's segments, `.reginfo`'s gp, DNAS at 0x4c5380, the ZDB's two entries.
6. **The output**: zlib inflate (the browser's `DecompressionStream`), each overlay held in memory for the session (H291).
7. **The evidence it is right**: the overlays' digests and sizes as the desktop records them
   (`desktop@be557831:tools_py/disc_to_elf_expected.json`: facts about the disc, not its content), checked by a dev-disc
   test; the interpreter's instructions unit-tested against the R5900 manual's definitions.

8. **The revision**: r0001's addresses (the desktop's), or the loader's own path end to end with CD reads stood in --
   the first is the smaller build, the second the general one.

Where it runs: a worker, so the page stays live; what it costs per session waits on H292.

## 6. What it unlocks

The two overlays are the source of every reading the desktop's decompilation makes: once the page can read them, a value
it now names as a placeholder because it lives in the game's code rather than its data -- an embedded table, a sound, a
constant -- can be read from the player's own disc. LATER 272 lists them, research 101's ledger as its checklist. The
first is #431's: the talk cue's 2,000 bytes at 0x003df540 (`ftscore` offset 0x1f8540 from its base 0x1e7000), forward on
the grant and reversed on the release.

## 7. Evidence, apart

- **Source inspection**: the desktop's `disc_to_elf.py`, `decrypt_apache.py`, `dnas_selfdecrypt.py`, `ee_unicorn.py` and
  `DEVELOPING.md` at `be557831`; `DNAS.dec.bin.decomp.c`'s callee tree from the five entry points (a scratch script
  counting functions and lines, nothing copied).
- **The disc**: three files' sizes; the program headers of `SCUS_972.75` and the built `socom2_game.elf` (research 170
  §5.4's figures).
- **Not run**: any desktop tool, any emulator, the game; no test, no browser. Nothing measured: A's cost is H292's.
