# 352 -- retail + r0004 respawn: instruction-image checks

- Date: 2026-10-21.
- Plan: [confirmed respawn gap fixes](../plans/2026-10-21-respawn-fixes.md), RSP-6/RSP-7; simulation evidence.
- Confidence: **reading**, fresh independent source review **PASS (medium)**, 2026-10-21.
  These are native instructions and data read from the selected original
  running setup's paused memory image. They are not a measured gameplay trace or a capture-scored comparison.
- Scope: help readiness, Action, the death fade and help lifetime. The selected working r0004 reference is used
  as configured; no emulator setting, patch selection, account or memory-card profile was changed.

## 1. Source and method

PCSX2 v2.8.2 booted the supplied setup through its normal UI. The title identifies `SOCOM 2 r0004`, 10:14:38,
Nov 3 2004. The controller paused it and used **System > Save State > Save To File** to create a separate local
research snapshot, without overwriting a save slot. Its ignored paths are:

- `logs/respawn-fixes/reference-r0004-readiness.p2s`: emulator-generated state.
- `logs/respawn-fixes/reference-r0004-title.png`: its stored `Screenshot.png`, showing the version title.
- `logs/respawn-fixes/reference-r0004-ee.bin`: decoded `eeMemory.bin`, 33,554,432 bytes.

The EE image's CRC32 `2fd8ec24` agrees with the snapshot ZIP directory; its SHA256 is
`40f1aab9259b77c11ea9b74e5bdc2f1a1295b201f5572825abeb88fbfa65ed36`. ZIP method 93 was decoded with the host's
existing Node 24 zstd reader; Capstone's installed distribution reports 5.0.9 and its module reports 5.0.7.
It reads bounded native instruction ranges. Function boundaries use the
pinned desktop's `desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3:recomp/socom2_ghidra_r0004.csv:1729` as a
locator, not as the source of the conditions below.

This is an independent route to the loaded reference: the earlier disc-to-ELF hash refusal remains recorded in the
plan. No expected hash was changed and no validation check was bypassed. Neither the state nor its decoded binary,
screenshots or disassembly is added to git. The local decompilation export was unavailable for that original task;
native r0004 addresses below distinguish that reading from inherited r0001 decompilation line references.

### R4B-00: retail + r0004 attribution (2026-11-04)

The original snapshot account above remains the historical acquisition record. The following shared rules were
re-read in retail's `socom2_game.elf.decomp.c` and at native r0004 addresses in both
`game/overlays_r0004/socom2_game_r0004.elf` and pristine `game/r0004/served/*.bin`. The new cross-revision
attribution is **reading, pending review**; it neither repeats the historical runtime acquisition nor establishes
original-runtime parity. The old source-review verdict remains its own record.

| shared rule | retail original | r0004 original |
|---|---|---|
| Ordinary dead help: respawn set, nonspectator, model alpha exactly zero, elapsed strictly >5 s; Action line and alpha 100 | `FUN_001f97b0`, D:L57004-57038 | `0x1f9b40-0x1f9c98` |
| Dead Action: mode 0, mapped state 1, online/respawn/nonghost/nonspectator, elapsed >5 s; latch only at alpha zero | `FUN_00592560`, D:L451673-451726 | `FUN_00597d90`, `0x597e08-0x597e68`, `0x597ef0-0x597f54`, `0x598064-0x59806c` |
| Respawn death requests target 0, rate bits `0x3dcccccd`, priority 2 | `FUN_005979a0`, D:L454484-454491 | `FUN_0059d4a0`, `0x59d568-0x59d5e8` |
| Fade request priority, target/rate stores and sign selection | `FUN_00552780`, D:L418720-418742 | `FUN_00557940`, `0x557950-0x5579fc` |
| Fade integration and target clamp, flag/priority cleared | `FUN_00551ec0`, D:L418492-418503 | `FUN_00557080`, `0x557134-0x5571b8` |

Respawn and ghost bytes move from retail game `+0xdc` / `+0xd2` to r0004 `+0xe0` / `+0xd6` in these readers;
the rules above remain shared. In particular, §2's ordinary branch really does set widget alpha 100 on each eligible
frame in both versions (retail D:L57036; r0004 `0x1f9c50-0x1f9c68`). The set-if-below-100 test at retail
D:L57088-57095 belongs to the other ghost-help branch and is not a correction to this ordinary branch.
The spawn picker and input producer have their retail counterparts in research 353/354. This attribution does not
claim equivalence of every neighbouring HUD operation: R4B-22 owns the changed TeamCommand close calls.

## 2. Readiness and the help widgets

`FUN_001f97b0`'s ordinary dead-body branch:

| native r0004 address | reading |
|---|---|
| `0x1f9b40-0x1f9b50` | reads respawn from the game at `*(0x4446f8)+0xe0` |
| `0x1f9b54-0x1f9b84` | elapsed is clock `0x442fd0` minus actor `+0xfb4`; model is actor `+0x28` |
| `0x1f9b7c-0x1f9bc4` | requires a nonnull model, model `+0x9c` alpha exactly zero, and a false spectator predicate |
| `0x1f9bc8-0x1f9bd8` | rejects elapsed less than or equal to 5.0 (`0x40a00000`), so the gate is strictly greater than 5.0 |
| `0x1f9be0-0x1f9c48` | writes the Action instruction to the second widget at HUD `+0x19df0`; Cross/Circle strings at `0x40e790` / `0x40e7b0` |
| `0x1f9c50-0x1f9c68` | reasserts that widget's alpha 100 (`0x42c80000`) on every eligible frame |
| `0x1f9c78-0x1f9c98` | otherwise writes the blank string at `0x40e630` |

The first widget is the death/Inventory instruction at `0x40e760`, written by `0x1f9ae0-0x1f9b3c`. Inventory
slot 11 selects the R2/Cross variant; the alternative selects R1/Circle. The disc's four controller presets, freshly
read in RSP-6, agree. Positions load from `0x407538`, `0x407540`, `0x407548`: centre 324, first baseline 380,
pitch 18. These match the port's existing help renderer; no new layout is estimated from video pixels.

## 3. Action is a fresh press, with a separate menu gate

The r0004 twin of r0001 `FUN_00592560` is `FUN_00597d90`:

- `0x597e08-0x597e24` samples mapped result 0 only when controller `+0x221` is zero, then requires input state
  exactly 1. A nonzero control/menu mode blocks the action; holding a previous press is insufficient.
- `FUN_002c81d0`, `0x2c81d0-0x2c820c`, resolves result 0 through the active controller configuration and returns
  the mapped input-state byte.
- `0x597e28-0x597e68` and `0x597ef0-0x597f30` require online, respawn enabled, no ghost flag, no spectator
  predicate, and elapsed strictly greater than five seconds.
- `0x597f34-0x597f54` checks model alpha exactly zero; `0x598064-0x59806c` sets actor `+0xfcf`'s respawn latch
  only in that case.

The spectator predicate `FUN_002c4c10` reaches `FUN_00313f10` and the `JoinAsSpectator` valve string at `0x4212f0`.
The help condition and the successful action thus share the elapsed/alpha gates. The player's additional voluntary
wait before pressing Action is not the minimum delay.

The input-state producer `FUN_002f7020` writes the mapped byte at pad `+1+buttonIndex`: a down sample changes rest
0 to state 1 (`0x2f70b8-0x2f70bc`), then 1 to held state 2 (`0x2f70c0-0x2f70c8`); an up sample changes 1 or 2
to release state 3 (`0x2f7068-0x2f7074`), then 3 to rest 0 (`0x2f7078-0x2f707c`). A down sample after state 3
returns to 1 (`0x2f70d0-0x2f70d8`). This directly identifies state 1 as the rising edge.

Clock units are separately corroborated by `FUN_001f21b0`: it reads `0x442fd0` at `0x1f2584` and formats the
`000:00:00` template at `0x4074f0`, extracting hour/minute/second digits using divisors 360000, 36000, 3600, 600,
60 and 10 (`0x1f25a8-0x1f273c`). The global clock's producer and the complete source of the actor/HUD frame-delta
arguments were not traced here; their seconds convention is an inherited reading, supported by these consumers.

## 4. Death starts the fade

`FUN_0059d4a0` is the death callback at local-controller vtable slot `0x432b78`; the neighbouring dead-update slot
points to `FUN_00597d90`, independently connecting these paths.

- `0x59d568-0x59d58c`: online, respawn enabled and not a ghost.
- `0x59d5d0-0x59d5e8`: immediately calls `FUN_00557940` with target zero, rate bits `0x3dcccccd` (approximately
  0.1 per second) and priority 2. There is no Action read in this callback.
- `0x557950-0x557958`: rejects a request below the actor's current fade priority. The death callback requests its
  fade immediately, but does not guarantee replacement of an active fade whose priority exceeds 2.
- `0x557960-0x55796c`: stores target at actor `+0x230`, rate at `+0x234`, priority at `+0x238`.
- `0x557970-0x5579fc`: makes the rate negative when current alpha exceeds the target, and sets actor `+0x21c`
  bit 3 to activate it.
- `FUN_00557080`, `0x557134-0x55714c`: integrates model alpha with rate times frame delta.
- `0x557174-0x5571b8`: on reaching/passing the descending target, clamps alpha exactly to zero and clears the
  active flag and priority.

The nominal duration from alpha one to zero is ten seconds; the actual crossing depends on initial alpha,
accepted fade priority and accumulated frame deltas. This is not a newly measured universal frame count. The port
currently hides its own corpse at `BODY_FADE_S` (ten seconds), and retains `BODY_FADE_PLACEHOLDER` for partial alpha.
RSP-6 reads that existing renderer expiry through `Play.ownCorpseExpired`, guarded by current body presence; it
does not run a second body timer in the page. That visible-body boundary is still a substitution for the original
model-alpha state. This evidence does not resolve the existing partial-alpha rendering gap.

## 5. Help lifetime and reset

`FUN_001f7ff0` holds the shared help alpha for ten seconds (`0x1f807c-0x1f80a4`) and fades it over half a second
(`0x1f80c0-0x1f8108`). It parks the clock at minus one only when computed fade alpha is strictly below zero
(`0x1f80f0`): exact zero at the nominal 10.5-second boundary is stored without that branch, and the next fade pass
is gated by the first widget's alpha being positive. Its shared update affects the first four widgets
(`0x1f8110-0x1f8218`). The eligible respawn branch subsequently restores only the second widget's alpha to 100;
it therefore survives the ordinary help fade.

The viewed-body alive-to-dead edge resets the clock when the dead viewed actor is local (`0x1f8510-0x1f85d0`),
and `0x1f8b40-0x1f8b60` remembers the alive flag. `FUN_001fb420` sets the transient minus-one state at `0x1fb4e8`
and the final round-start zero at `0x1fb770`. The own-help function hides its widgets for control state 3
(`0x1f9d58`, `0x1f9e9c-0x1f9ed8`); shared state-2/Chat hiding is at `0x1f8428-0x1f8498`. This does not establish
that a particular browser menu equals original control state 3.

## 6. Verification limits and follow-up

The source reader independently checked the native image after the controller produced it. A separate fresh
reviewer re-read its integrity, instruction ranges, clock consumer, priority branch and help boundary; verdict
**PASS (medium)** after the priority and exact-zero lifetime qualifications above. The UI and input implementation
reviews also re-read their source ranges; their unit results are in research 351 and 354. These hold displayed
lines, existing glyphs, hide rules, boundary/reset, independent lifetime and accepted Action commands. They are not
an original gameplay run.
No controlled death-to-respawn match or frame-scored comparison has yet been performed in this follow-up. Local
LAN inspection and any later spawn-picker reading are recorded separately; no release flag is enabled here.

## 7. Local LAN inspection

The controller used the existing LAN connection setting and a disposable player name, explicitly declined saving
the profile, and selected Vigilance and The Mixer in CREATE LAN GAME's playlist. No match was created. The next
playlist action required Square, whose supplied configuration had only an SDL controller binding, so this UI run
stopped there without changing bindings or emulator settings. PCSX2 was paused before browser verification.
No community server was joined. The title/settings observations and static code reading do not establish a
controlled original death-to-respawn measurement or a capture-scored help comparison.
