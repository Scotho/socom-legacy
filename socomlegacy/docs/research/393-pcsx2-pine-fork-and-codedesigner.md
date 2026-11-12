# 393 -- A validation tool, not the game: the PCSX2 fork's PINE additions adopted in part, CodeDesignerPS2 rejected

- Date: 2026-11-09. The owner's request of 2026-11-09: evaluate FatalityDevelopment's CodeDesignerPS2 and its PCSX2
  fork against the emulator parity harness's (EPH, `socomlegacy/tools/eph/`) open needs. Branch `agent/spc-codedesigner`
  (base `origin/agent/mega` 157d1c164).
- Track: **product** (OT.R53). This note is about a validation instrument and its guardrails. **It makes no claim about
  the game**, changes nothing the game does, names no constant (no `*_READING` or `*_PLACEHOLDER` is introduced, so
  research 101 takes no row and the placeholder ledger is unchanged) and adds no code.
- Evidence kind: **source inspection** of two third-party repositories at pinned commits, plus `gh api` metadata
  (compare, releases, licence, upstream PCSX2's `PINE.cpp` and `SaveState.h`), plus the limits our own harness met in
  its live runs of 2026-11-08/09 (named in §4, not re-run here). Nothing from either project was built, run, installed
  or executed, and no server either project names was contacted. Each statement below is marked **verified** (read in
  the source), **metadata** (from `gh api`) or **inferred** (reasoning, not checked by running anything).
- Sources: the evaluation report of 2026-11-09 (host-local evidence, `spc-cd/SPC-CD-mapping.md`, not in git). Its
  citations were spot-checked for this note at the two pins below; one is corrected (§2, the batch read's byte loop).
  - `FatalityDevelopment/CodeDesignerPS2@b554e0307` (GPL-3.0).
  - `FatalityDevelopment/pcsx2@9ab76ca59` (GPL-3.0), a fork of `PCSX2/pcsx2`.
  - Upstream for comparison: `PCSX2/pcsx2@v2.8.2` (`fd9d310cc`), the build the harness pins.
- Status: **the decision is made** (the controller, on the owner's word, 2026-11-09): **adopt part** (§5). Any fact
  about the game that the adopted tool later yields is filed through `derive-from-desktop` at its own level, in its own
  note, and is not claimed here (§6).

## 0. The answer

| What | Verdict | Why, in one line |
|---|---|---|
| The fork's PINE additions (opcodes 0x10-0x46) | **adopted**, rebased onto official PCSX2 v2.8.2, built from source on the owner's second PC, kept host-local outside every repository tree, never shipped | breakpoints, memory watches, pad input over the socket, frame advance and paused batch reads remove four of the harness's five limits; the patch stays out of the emulation core (§2) |
| The fork's tree as it is | not used | its core is v2.7.245+3, about 500 commits older than the v2.8.2 the harness pins (§2.2) |
| CodeDesignerPS2 | **rejected** | .NET 8 + SQL Server LocalDB + VS Code; it calls out by default; its repository holds a SOCOM II savestate, disc packs and private keys (§3) |
| CodeDesigner's r0004 labels and packet catalogue | leads only | third-party names are neither the original nor the desktop; never cited, never copied (§3, §5) |
| Audio | not covered by either tool | the fork has mute and mute state only (§2.1, §7) |

## 1. What was evaluated and why

The owner asked on 2026-11-09 whether CodeDesignerPS2 and its PCSX2 fork could close the gaps the harness met in its
live runs that night (§4.1) and settle named readings that are owed a trace or a capture (§4.2). The evaluation was
read-only: two shallow-to-full clones outside every repository tree, the compare against upstream from `gh api`, and a
read of every file the conclusions rest on.

**The fork against upstream (metadata).** Default branch `master`, parent `PCSX2/pcsx2`, last push 2026-10-25,
GPL-3.0. Against `PCSX2:master` it is 53 commits ahead and 836 behind; the merge base is `06616ec98` (2026-04-11),
v2.7.245 plus 3 commits. Neither repository has published a release. The diff since the merge base touches only
`pcsx2/PINE.cpp` (+1681 -10), new `pcsx2/DEV9/NetCapture.{cpp,h}` with hooks in `DEV9/net.{cpp,h}`, new
`pcsx2/GSStreamServer.{cpp,h}` with a tap in `GS/Renderers/Common/GSRenderer.cpp` (+17) and its start/stop in
`VMManager.cpp` (+12 -1), the build files, the README and `docs/pine-debugger-extension.md`. No change touches the
R5900 or IOP cores, the recompilers, the timing, SPU2 or the savestate format.

## 2. What the fork adds to PINE

**Baseline (metadata).** Official PINE stops at `MsgStatus = 0xF` at v2.8.2 and at today's `master`
(`PCSX2/pcsx2@v2.8.2:pcsx2/PINE.cpp:161-162`). Our client uses 0x0-0xB and 0xF (`socomlegacy/tools/eph/pine.ts:25-28`).
The fork's opcode table is `FatalityDevelopment/pcsx2@9ab76ca59:pcsx2/PINE.cpp:185-239` and its dispatcher, which
accepts several commands per message as upstream does, `:673-716` (verified). Line numbers in the table are the
handler's `case` in `FatalityDevelopment/pcsx2@9ab76ca59:pcsx2/PINE.cpp` (verified at the pin).

| Opcode | What (verified) | File:line at the fork sha | What `tools/eph` would use it for |
|---|---|---|---|
| 0x10 GetProgramCounter | EE PC and the paused flag, read on the CPU thread | `pcsx2/PINE.cpp:1050` | the only way to learn a breakpoint or watch hit: poll until paused = 1 (there is no push) |
| 0x11 / 0x12 Pause / Resume | `VMManager::SetPaused`, synchronous | `pcsx2/PINE.cpp:1069`, `:1079` | a paused VM makes every later read consistent |
| 0x13 Step | `intCpu.Step()`, the interpreter, on the CPU thread | `pcsx2/PINE.cpp:1089` (the call `:1098`) | avoided: the interpreter stepped under the recompiler (inferred risk); 0x1E instead |
| 0x14 / 0x15 / 0x16 / 0x28 Set / clear / clear-all / list breakpoints | `CBreakPoints::AddBreakPoint(BREAKPOINT_EE, addr)`, unconditional | `pcsx2/PINE.cpp:1113-1157`, `:1562` | "which code path ran" becomes a hit at `FUN_<addr>` |
| 0x17 / 0x18 / 0x19 Registers | all GPRs, PC, HI, LO; any one as u128; set one | `pcsx2/PINE.cpp:1158-1216` | read only: a function's arguments at a breakpoint |
| 0x1A / 0x1B / 0x1C Threads, modules | EE threads, IOP threads, IOP modules; must be paused | `pcsx2/PINE.cpp:1217-1305` | occasionally |
| 0x1D GetStack | the EE call stack; must be paused | `pcsx2/PINE.cpp:1306` | the caller chain of a watch or breakpoint hit |
| 0x1E / 0x1F / 0x20 Step into / over / out | a temporary breakpoint, then resume (the Qt debugger's method) | `pcsx2/PINE.cpp:1346-1437` | occasionally |
| 0x21, 0x29-0x2D Symbols, disassembly, functions, globals, locals | PCSX2's own symbol map | `pcsx2/PINE.cpp:1438-1851` | little: our names come from the desktop's Ghidra export |
| 0x22 / 0x23 Save / load state by path | -- | `pcsx2/PINE.cpp:1463`, `:1484` | states by path instead of slot |
| 0x24 Reset | cold boot | `pcsx2/PINE.cpp:1510` | rarely |
| 0x25 FrameAdvance N | `VMManager::FrameAdvance(n)` posted to the CPU thread, fire and forget | `pcsx2/PINE.cpp:1520` (the post `:1532`) | the lockstep loop: pause, set pad, advance 1, poll paused, read |
| 0x26 / 0x27 FPS / limiter | Nominal, Turbo, Slomo, Unlimited | `pcsx2/PINE.cpp:1535`, `:1547` | Unlimited for faster lockstep runs |
| 0x2E / 0x2F / 0x30 / 0x31 Memory watches | `CBreakPoints::AddMemCheck(cpu, start, end, cond, MEMCHECK_BREAK)`; a hit pauses the VM | `pcsx2/PINE.cpp:1852-1964` (the call `:1876`) | "who writes `body+0x208`" (§6) |
| 0x32 SaveSnapshot | `GSQueueSnapshot` on the GS thread; PCSX2 picks the path; fire and forget | `pcsx2/PINE.cpp:1965` (the call `:1972`) | a lossless still of the exact frame without a screen grab; the client must find the newest file |
| 0x33 PadGetState | buttons, 4 analog bytes, 16 pressures | `pcsx2/PINE.cpp:1975` | check the injected state |
| 0x34 PadSetButton | pad, button, value f32 0..1 through `Pad::SetControllerState` | `pcsx2/PINE.cpp:2013` (the call `:2031`) | an analog pressure such as Triangle at 0.2 without a macro key |
| 0x35 PadSetAnalog | raw stick bytes | `pcsx2/PINE.cpp:2034` | exact partial pushes |
| 0x36 PadSetState | every pressure and both sticks in one message | `pcsx2/PINE.cpp:2060` | replaces `keys.ts` and the window focus |
| 0x37 PadGetType | -- | `pcsx2/PINE.cpp:2098` | -- |
| 0x38-0x3F DEV9 status, capture, drain, inject RX/TX, dissect, filter, stats | packets at the network adapter (`pcsx2/DEV9/NetCapture.cpp`) | `pcsx2/PINE.cpp:2120-2340` | the original client's wire, once a session exists on a server of ours (§5, §7) |
| 0x40 / 0x41 / 0x42 GS stream port, status, ping | MJPEG 640x480 at q80 on a loopback socket of its own, with a `frame_idx` (`pcsx2/GSStreamServer.h:9-27`, `pcsx2/GSStreamServer.cpp:302`) | `pcsx2/PINE.cpp:2341-2385` | a live view and lossy indexed video; no use for pixel scoring |
| 0x43 / 0x44 Read / write memory batch | up to 1024 items of up to 256 B, EE or IOP | `pcsx2/PINE.cpp:814-928` | fewer round trips; atomic only when paused (below) |
| 0x45 / 0x46 Set muted / get audio state | `SPU2::SetOutputMuted` | `pcsx2/PINE.cpp:2386` (the call `:2409`) | none: no audio capture |

A breakpoint or watch hit pausing the VM is upstream code, unchanged
(`FatalityDevelopment/pcsx2@9ab76ca59:pcsx2/x86/ix86-32/iR5900.cpp:1521-1522`, `:1552-1553`;
`pcsx2/Interpreter.cpp:82-83`; verified).

### 2.1 Limits

- **No audio** (verified). The only audio opcodes are 0x45 and 0x46, mute and mute state. Nothing streams or dumps
  audio, though the fork's README, as shipped in CodeDesigner, says "sound" over PINE
  (`FatalityDevelopment/CodeDesignerPS2@b554e0307:README.md:38`).
- **The batched read is atomic only when paused** (verified). `MsgReadMemBatch` copies each item byte by byte with
  `memRead8` / `iopMemRead8` on the PINE thread while the EE runs
  (`FatalityDevelopment/pcsx2@9ab76ca59:pcsx2/PINE.cpp:858-861`; the report cited `:850-855`, the item's status
  bookkeeping just above the loop). A consistent per-frame multi-read is 0x11 or 0x25, then 0x43, then resume or
  advance again.
- **The base is v2.7.245** (metadata): v2.7.245+3, about 500 commits older than v2.8.2. GS, the recompilers and the
  game fixes differ between them (inferred; the cores were not diffed). A result scored on the fork's own tree would
  need re-baselining against v2.8.2; hence the rebase (§5).
- **The same savestate version, 0x9A59** (verified): `g_SaveVersion = (0x9A59 << 16) | 0x0000` at
  `FatalityDevelopment/pcsx2@9ab76ca59:pcsx2/SaveState.h:29` and the same line at v2.8.2, so states should load both
  ways (inferred from the version, not tried).
- **The pad state is written from the PINE thread**, not posted to the CPU thread (`Pad::SetControllerState`, verified
  at `:2031`): harmless in a pause/advance loop, racy in a free run, and host bindings on the same pad could overwrite
  it (inferred; a clean run binds nothing to Pad1 or uses Pad2).
- **Fire and forget**: 0x24, 0x25 and 0x32 return before they act (verified); the client polls for the result.
- **Passive while unused** (inferred from upstream's design): the GS tap does nothing without a subscriber
  (`GSRenderer.cpp:847`), DEV9 capture is off until 0x39, and breakpoints and memchecks make the recompiler emit checks
  without changing what the guest computes. With stream and capture off the behaviour should be upstream's -- which
  §6 step 1 tests rather than assumes.

## 3. What CodeDesignerPS2 is and why it is rejected

**What it is** (verified, `FatalityDevelopment/CodeDesignerPS2@b554e0307`). A .NET 8 suite (`net8.0`; the installer
`net8.0-windows`) with a VS Code extension: an R5900 assembler and disassembler; a "Bridge" (a JSON-lines socket on
loopback :8765 and a C# PINE client for every fork opcode, `CodeDesigner.Ps2.Bridge/SocketServer.cs:571`,
`PineClient.cs:20-120`); a call tracer that single-steps over PINE and logs every JAL/JALR
(`CodeDesigner.Ps2.Bridge/Services/WatchpointTraceService.cs:20-60`); a patch language; a C# PS2 emulator that its own
documentation says cannot run commercial games (`docs/emulator.md:122`); a static recompiler; an MCP server of 242
tools; SOCOM II asset readers; a replacement SOCOM II online stack (DNS intercept, DNAS, Medius servers, patch HTTP;
`CodeDesigner.Ps2.Multiplayer/Servers/DnasServer.cs:24`, `DnsServer.cs:133`, `PatchHttpServer.cs:11`); a packet
dissector and SOCOM II message catalogue (`CodeDesigner.Ps2.Multiplayer/Protocol/PacketDissector.cs:19`,
`GameMessageCatalog.cs:6-25`); and 529 third-party labels for r0004
(`CodeDesigner.Ps2.CdsLanguage/StdLib/snapshots/SOCOM II - U.S. Navy SEALs/labels/SOCOM2_r0004.json`).

**Why it is rejected** (each verified at the pin unless marked):

1. **Its stack.** The .NET 8 SDK, SQL Server LocalDB (the Bridge reads its settings from the database at start,
   `CodeDesigner.Ps2.Bridge/Program.cs:672-690`), Node 20 and VS Code. Our harness is TypeScript and already has a
   PINE client; the fork's wire is documented in `PINE.cpp`, so `pine.ts` is extended instead. GPL means nothing of
   its C# is copied.
2. **It calls out.**
   - Discord rich presence starts by default with a built-in application ID (`CodeDesigner.Ps2.Bridge/Program.cs:632-656`).
   - A Discord bot posts when a token is set (`DiscordBot/DatabaseAiActivityProvider.cs:15-23`).
   - Public-IP lookups through api.ipify.org and ifconfig.me (`CodeDesigner.Ps2.Multiplayer/Config/ServerIpResolver.cs:15-16`).
   - GitHub fetches: PCSX2's compatibility list and cover art (`CodeDesigner.Ps2.Bridge/Services/CompatService.cs:26-33`)
     and DNAS replay data (`CodeDesigner.Ps2.Multiplayer/Dnas/Server/DnasRepRepository.cs:35`).
   - A ROM downloader in the VS Code extension (`client/vscode/src/providers/compatBrowser/vimm.ts:137-168`).
   Each is a connection to a server that is not ours (R293).
3. **Its repository holds what must never come near ours** (RS.R8, AGENTS.md "What never goes in git"): a SOCOM II
   PCSX2 savestate with its extracted EE and IOP RAM (`.../snapshots/SOCOM II - U.S. Navy SEALs/2026-05-18/test_snap.p2s`
   and `test_snap.p2s.extracted/`), disc packs (`Mods/SOCOM2/packs/MP53.ZDB`, `Mods/SOCOM2/splash/UIBF_TXR.ZED`) and
   private keys (PEM key files under `CodeDesigner.Ps2.Multiplayer/Certificates/` and two DNAS key files beside them; their contents
   were not opened).
4. **Its online stack** answers Sony's DNAS authentication handshake from replayed proofs. Running it is legally and
   policy sensitive and is the owner's to decide, not an agent's; this decision does not run it (§5).
5. **What is kept of it: leads only.** The r0004 labels and the packet catalogue may be read as leads; each lead is
   re-read at `FUN_<addr>` / `D:L<line>` or at the desktop's evidence before any use, and is **never cited as
   evidence** and never copied. The call tracer's idea (single-step and log every call up to an end PC) is a method our
   harness may reimplement in its own code.
6. Maturity (metadata): 3 stars, no releases, commits mostly by coding agents.

## 4. The match against our open needs

### 4.1 The harness's limits met in tonight's runs

| Limit (our own) | Where it shows | The fork's offer | Fit |
|---|---|---|---|
| No breakpoints: the code path is inferred from per-frame state | -- | 0x14-0x16, 0x28; 0x10 poll; 0x1D stack | fits |
| Pad input only as synthetic key events to a focused window; an R2 tap too short to register | `tools/eph/keys.ts` | 0x34 / 0x36 with 0x25: hold for exactly N guest frames, no focus | fits |
| The light Triangle through a `[Pad1]` macro key at pressure 0.2 | `tools/eph/padIni.ts:9-12` | 0x34 with value 0.2, or 0x36 pressures | fits |
| Video by screen grab (`ffmpeg -f gdigrab`) | `tools/eph/run.ts:327-329`, `tools/eph/probe.ts:217`, `:224` | 0x32 lossless stills; 0x40 MJPEG with `frame_idx` | partly: stills yes; side by side with the page still needs a recording; no audio |
| Multi-word reads tear across a frame | `tools/eph/sampler.ts:10`, `:705-710` | 0x11 / 0x25 then 0x43 | fits in lockstep; a free-running 0x43 still tears (§2.1) |
| LATER 667: the pack is Windows-only | -- | pad over PINE (PINE is a Unix socket on Linux) | partly: removes the input half only |
| LATER 669: pause skew between the clients | -- | 0x11 | partly: PCSX2's side only |

A free improvement on stock v2.8.2 (verified in the upstream dispatcher): upstream PINE already accepts several
commands in one message, and `pine.ts` sends one per message (its batched reads were not ported, `tools/eph/pine.ts:14`). Packing the sampler's reads
into one message shortens the torn window without the fork; it does not close it.

### 4.2 Named readings it could settle (from research 101's rows)

| Name | Owed (research 101) | How the adopted tool would settle it | Fit |
|---|---|---|---|
| `C4_REACH_READING` | a `body+0x208` write breakpoint; research 181: "`body+0x208`'s writer is not found statically" | a write watch (0x2E) on `[actor+0x208, actor+0x20C)` pauses at the writer; 0x10 and 0x1D name the function; then a read at the source and a value comparison against research 202 §2.1's 19.9 u and PF-13's 32 u | fits |
| `ROUND_START_PROJECTILES_READING` | a trace (whether the round's reload runs the teardown); research 179: "link untraced"; research 283 §9's note on the online round's re-place | breakpoints (0x14) on the teardown and on `FUN_002aa910`'s projectile calls, a round started, the caller read from 0x1D | fits |
| `PEEK_HOLD_CONTINUES_READING` | a capture (R pressed mid-peek, crouched) | the chord held over exact frames (0x36 with 0x25), each frame read paused (0x43) | fits |
| `PEEK_STANCE_ENDS_PEEK_READING` | a capture (a prone press with the d-pad held, research 180 §1.12); research 391 §2.1 adds an r0004 trace of the crouch press's path | the same lockstep chord, plus breakpoints on the call chain research 391 §2.1 names | fits |

The report lists further rows that fit or fit partly (`LOOK_JUMP_READING`, `PEEK_CUTS_ACTION_READING`,
`STEP_PROBE_LIFT_READING`, the inventory alpha rows, the zAnim call-order rows, still-image rows) and rows that do not
(`RELEASE_MIX_READING` and the loop placeholders: audio; `FOURTH_UNLOCK_READING`: a forged save is not evidence). Those
are leads for later tasks, not this note's plan.

## 5. The adoption plan and its guardrails

The decision (the controller, on the owner's word, 2026-11-09), recorded, not reopened:

1. **Adopt part: the fork's PINE additions only** (0x10-0x46), as a patch series **rebased onto official PCSX2
   v2.8.2** (`PCSX2/pcsx2@v2.8.2`, `fd9d310cc`) -- the emulator the harness already pins. The report's cherry-pick
   order (the fork's commits): `82858162e`, `cf7606bd4`, `a228a82de`, `d4fc9b1da`, `f5ac0a835` (debugger);
   `c3035c5ba` (watches); `9f996b7e3` (snapshot); `3d41a9b84` (socket fix); `55eaffb09` (pad); `87e022022` (batch).
   The DEV9 (`b649cc059`, `818505e21`) and GS stream (`a9128b47c`...`c1e15029e`) commits are left out the first time.
   The run's record carries the built tree's sha and the cherry-picked list.
2. **Built from source on the owner's second PC**, as a heavy run under that host's rules (AGENTS.md, "Layout and local
   directories", 5); the build's dependency script downloads Qt 6.11.0 and SDL3 from third-party servers at build time;
   that download is **owed the owner's word** under SPC.R7 (the evaluation report, `spc-cd/SPC-CD-mapping.md:243`,
   `:294`), so the build **waits for it** (the controller's review of this note, 2026-11-09); building from source is
   approved, the dependency fetch is not yet.
3. **Kept host-local, outside every repository tree.** Neither the source, the build nor the fork's clone sits under
   any repository checkout.
4. **Never shipped.** Not in the parity pack: giving a patched PCSX2 to a tester is a GPL distribution that must offer
   its corresponding source. Filed for the owner as HUMAN_TASKS H435 (§7); until he rules, the build is for validation
   on our own hosts only.
5. **Our side is a wrapper and recipe of ours, on a branch, for review**: the build recipe and the `pine.ts`
   extension (the ops the validation needs, each cited `FatalityDevelopment/pcsx2@<sha>:pcsx2/PINE.cpp:<line>`),
   test-first against fakes, product track. **No GPL code ever enters `packages/`** or anywhere else in our tree; our
   client is written from the documented wire, not copied.
6. **CodeDesignerPS2 is rejected** (§3): not built, not run, its clone kept outside every tree, nothing of it copied
   in; its savestate, disc packs and keys never near ours; its labels and catalogue leads only.
7. **Servers ours only.** A two-console wire capture runs only against our own servers (local, or ours) -- never a
   third party's, and not CodeDesigner's DNAS stack without the owner's word.

### 5.1 The build as it stands (the owner's second PC, 2026-11-09)

**The owner's word on item 2** (relayed by the controller and the machinery seat, ~14:35Z): the build, its Qt/SDL3
fetch included, is allowed **on the owner's second PC only**; shipping it only with its source and only with a release
on his word (H435 stands for that). The dependency script ran under that word, 2026-11-09 ~17:22-18:24Z: 35 archives
fetched, every one checked against the script's SHA-256 before use, 0 mismatches.

**What is in.** Official PCSX2 v2.8.2 (`fd9d310cc`) plus one patch of the fork's PINE layer, host-local, outside every
repository tree. `pcsx2/PINE.cpp` is `FatalityDevelopment/pcsx2@55eaffb09:pcsx2/PINE.cpp`, three-way merged with
upstream's own changes between the fork's base (`06616ec98`) and v2.8.2: `vtlb_ramRead` / `vtlb_ramWrite` in the read
and write ops, `Memory.h` -> `vtlb.h`, upstream's `AcceptClient`. The opcodes served: the debugger 0x10-0x2D, the
watches 0x2E-0x31, the snapshot 0x32, the pad 0x33-0x37, with the fork's socket fix. The fork's
`docs/pine-debugger-extension.md` comes with it, as of `55eaffb09`.

**What is left out.** The DEV9 bridge, the GS stream server, the batched read (`87e022022`) and the audio mute. So the
build has no opcode above 0x37. The rows of §4.1 and §4.2 that name 0x43 (the batched read, in lockstep a consistent per-frame read) wait for a later build; until then a frame is read paused (0x11 or 0x25), one op at a time.

**Two adaptations of the fork, both visible on the wire.**
- *No stack top.* The fork adds a stack top to PCSX2's `BiosThread`, in a commit outside this series; v2.8.2's class
  has none, and its `MipsStackWalk::Walk` takes five arguments. So the two stack walks (`MsgStepOut`, `MsgGetStack`;
  `55eaffb09:pcsx2/PINE.cpp:1169`, `:1262`) call upstream's five-argument walk, as upstream's own `DebugInterface`
  does. The thread lists (`:1082`, `:1110`) keep the fork's 22-byte record with `stack_top` sent as 0.
- *The watch list's cpu byte* (found live, not changed). `MsgListWatches` writes the watch's `BreakPointCpu`
  (`55eaffb09:pcsx2/PINE.cpp:1790`, `static_cast<u8>(w.cpu)`): 1 for the EE, 2 for the IOP, where the fork's document
  says 0 / 1. An EE watch added with cpu 0 lists with 1. Our client maps it back and keeps the raw byte.

**Proven running** (rendered emulator runs on the retail image, not the r0004 rig; a smoke, not a validation of any game
fact). The standard ops answer: version `PCSX2 v2.8.2-1-ge0ae99a8e`, a read, the frame rate 59.94. So do pause / pc /
registers / the 5 EE threads / step / frame advance. A write watch on the stack paused the EE at its writer within
100 ms of resume, and clearing an unknown breakpoint answers `IPC_FAIL`.

**Our side** (item 5): `tools/eph/pineDebug.ts` on `agent/spc-pine-debug` (cf074f962, for review). It covers the ops
§6 needs: 0x10-0x17, 0x1A, 0x25, 0x2E-0x31, written from the document's layouts and tested against fakes. The pad ops
(0x33-0x37) are not in it yet: §6 step 1's PINE-input leg adds them.

## 6. The validation order

Each step is a live run of the original under the patched build; each finding about the game is filed through the
`derive-from-desktop` procedure at its level, in its own note, and read by a fresh reader who did not write it before
it is promoted.

1. **Control: re-run the `PRONE_GATE_READING` case on the patched build; it must change nothing.** The case behind its
   proven 8.0 (ac's M51 fence capture, 2026-11-03, r0004, research 101's row): first with the existing key path, then
   with input over PINE (0x36 with 0x25 lockstep). The refused / taken bracket must match the proven result exactly. A
   difference stops the plan: the patch, not the game, would be the cause.
   **The key-path leg: no difference** (capture comparison, PCSX2 r0004, the owner's second PC, 2026-11-09 ~19:58-20:25Z).
   It used ac's own probe script (`segment-body/cases/prone-gate.txt`, the full Triangle at 500 ms) on the same
   teleported states, slots 12-17, carried with the rig. `tools/eph/probe.ts` ran 3 trials a distance, against the
   patched build (`D:/s2u/eph-run-pine/pcsx2`).
   - **The bracket matches.** Refused at 7.00 / 7.50 / 7.75 u (posture 0, action 1, no stand2prone); taken at 8.00 /
     8.25 / 8.50 u (action 25, then posture 2, action 26). The feet before the press and after the drop equal the
     2026-11-03 capture to 0.001 u in every trial (11.520 / 11.786 / 12.036), bar one trial below.
   - **The one difference is not the patch.** On 8.00 u the first trial after a boot ends the drop at 11.479 u (0.041
     short), in both runs on the patched build. The stock rig build, run the same day on the same state, does the same:
     its trial 1 reads 11.479, its trials 2-3 read 11.520. ac's 2026-11-03 trial 1 read 11.520, so first-trial timing
     differs between hosts; ac's note already records trial 1's stick arriving late after a boot.
   - **Owed:** the PINE-input leg (0x36 with 0x25 in lockstep). Our client has no pad ops yet.
   Evidence: the second PC's bucket upload for 2026-11-09, `v1-prone-gate/` (`RESULT.txt`, each case's `probe.csv` / `probe.json`
   and frames, the comparison script).
2. **`C4_REACH_READING` by a write watch on `body+0x208`'s writer** (research 181). On r0004 slot 5, read
   `player_actor` (the sampler's address), watch `[actor+0x208, actor+0x20C)` for writes, play the C4 placement over
   PINE pad input, and at each pause record the PC, the registers and the stack. The writer's PC is mapped to
   `FUN_<addr>` / `D:L<line>` and read at the source (a reading, pending review); the written value compared value for
   value with the running original, within a stated tolerance, is what could be proven.
3. **`ROUND_START_PROJECTILES_READING` by breakpoint**: on the teardown and on the round-end projectile calls (research
   101's row), a round started, the hit or its absence recorded with the caller chain.
   **Owed: a state where an online round starts** (checked 2026-11-09).
   - Research 101's row: an online round's start is a re-place, not a level reload (`FUN_00223680`, D:L75913-75936),
     so the deciding sites are `FUN_002aa910`'s round-end projectile calls (D:L151239, D:L151242). Only an online
     round runs them.
   - The rig's r0004 states are single-player missions: slot 5 (M51's start) and slot 18 (a mission with the squad
     following, by its frame). On them a breakpoint could show only the level's teardown on a mission restart or
     exit (`FUN_001eb8c0`). That is the reading's own premise, not the online case, so it was not run.
   - The online route (ac's prep, `online/prep-sb2/RUNBOOK-turns.md`: Horizon, DNAS, two PCSX2s) is an owner-window
     run. No multiplayer state was built here.
   - Step 2's value (C4 within 19.9 u) needs a demolition state too (research 394 §4).

## 7. Open

- **Audio.** Neither tool captures it (§2.1). `RELEASE_MIX_READING` and the loop placeholders need another route (a host
  loopback recording or a recomp dump).
- **Two-console capture needs a person at client B**, and a session on a server of ours (§5.7). The DEV9 opcodes are
  left out of the first build.
- **The owner's ruling on shipping**: whether the patched build may ever go to testers in the parity pack, with its
  corresponding source offered under the GPL. Until then it is host-local only. A `HUMAN_TASKS.md` row is owed for it
  (not filed by this note's task, which edits this note only).
