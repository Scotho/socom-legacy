# 354 -- retail + r0004 respawn: the dead controller's fresh Action press

- Date: 2026-10-21.
- Plan: [confirmed respawn gap fixes](../plans/2026-10-21-respawn-fixes.md), RSP-8, simulation track.
- Base: `132f1b5f1`.
- Confidence: **reading**, fresh independent source/implementation review **PASS (medium)**, 2026-10-21. The controller's source check of the selected
  working r0004 instruction image is recorded in research 352. Its conditions are static readings, not a measured
  original death-to-respawn trace. This task makes no proven claim.

## 1. The original dead Action path

Research 352 sections 1 and 3 record the original snapshot provenance, integrity checks and native instruction
ranges. The r0004 `FUN_00597d90` corresponds to the inherited r0001 `FUN_00592560`, D:L451675-451726; the local
decompilation export was unavailable for that original task, so its fresh native addresses were kept distinct from
inherited decompilation lines.

**R4B-00 retail + r0004 re-citation (2026-11-04; reading, pending review).** The export is now available and was
re-read: retail `FUN_00592560` D:L451675-451726 gives mapped state 1, the online/respawn/nonghost/nonspectator
and strict >5-s conditions, and the alpha-zero latch. The mode-0 guard is D:L451673-451674. These are the same
conditions in the r0004 ranges below, re-read in both `game/overlays_r0004/socom2_game_r0004.elf` and pristine
`game/r0004/served/zsealetc.bin`. The mapped-button reader is retail `FUN_002c64e0` D:L166917-166930 /
r0004 `0x2c81d0-0x2c820c`; the pad-state producer is retail `FUN_002d9ff0` D:L179130-179168 /
r0004 `0x2f7020-0x2f70d8`, also re-read in pristine `game/r0004/served/ftscore.bin` and the aggregate.
Retail's down sample turns 0 or release 3 into state 1 and then held 2, matching r0004's rising-edge interpretation.
The game record's ghost/respawn bytes move `+0xd2`/`+0xdc` to `+0xd6`/`+0xe0`; the gates do not change.
This is a new static cross-revision reading awaiting fresh review, not a repeat of the earlier acquisition,
unit tests or source-review verdict. It adds no post-spawn flush claim and does not close the partial-alpha gap.

| r0004 source | reading |
|---|---|
| `FUN_00597d90`, `0x597e08-0x597e24` | reads mapped result 0 only in controller mode 0 and requires input state 1 |
| `FUN_002c81d0`, `0x2c81d0-0x2c820c` | resolves result 0 through the active controller configuration |
| `FUN_002f7020`, `0x2f70b8-0x2f70c8` | a down sample changes rest 0 to fresh press 1, then held state 2 |
| `FUN_002f7020`, `0x2f7068-0x2f707c` | an up sample changes press/held to release 3, then rest 0 |
| `FUN_002f7020`, `0x2f70d0-0x2f70d8` | a down sample after release returns to fresh press 1 |
| `FUN_00597d90`, `0x597e28-0x597e68`, `0x597ef0-0x597f30` | requires online, respawn enabled, no ghost/spectator and elapsed strictly greater than five seconds |
| `FUN_00597d90`, `0x597f34-0x597f54`, `0x598064-0x59806c` | model alpha must equal zero before the respawn latch is set |

State 1 is thus the rising edge. Living Action's release path is a different controller path; its inherited source
is `FUN_00594cf0`, D:L453194-453243. The port previously used that release edge for the dead respawn seat too,
and `WalkMode.action()` could queue `Button.Action` while dead without consulting current local body expiry.
The unit RED reproduces those command bits directly. It does not establish the cause of any separately observed
browser observer transition or prove an automatic held-input respawn.

## 2. One page gate and one command bit

`NetPage.respawnInputActive()` identifies the actual own respawn-dead path independently of readiness. A missing
body or an early press cannot fall through to living Action. Classic remains outside this route, including its
existing waiting-room respawn adaptation.

The shared `respawnReady()` predicate keeps the original page/player/death, ghost/spectator, strict elapsed minimum
and current corpse-expiry gates. The help reads the same predicate. `pressRespawn()` additionally requires no
input-owning menu or loading hold. This separate input gate does not remove eligible help merely because a menu
blocks input. Both mounts supply their existing screen owners; the R2 inventory is included too.

An accepted press calls `WalkMode.queueRespawnAction()`. It queues only the existing `Button.Action` bit on a dead
walker's next command. It runs no living context filter, traversal action or swap/stance deferral. Living
`WalkMode.action()` and its existing command, pose and timer behavior remain unchanged. There is no protocol,
server, release-flag or timing-value change.

The body-alpha substitution remains explicit from research 351 section 3: `Play.ownCorpseExpired()` reads the
actual current browser corpse-hide state, requiring a body, rather than a second age threshold. It does not expose
partial original model alpha. `BODY_FADE_PLACEHOLDER` and a controlled original-runtime comparison remain open.
No new timing constant or placeholder is introduced here; `RESPAWN_PROMPT_S` remains the five-second minimum only.

## 3. Shared input routing and browser adaptations

The shared `MatchActions` installs the page's active/press callbacks on `TraversalPage`, so pad and the touch
virtual pad use the same current Action lane. While the own respawn-dead route owns Action, it bypasses the living
`ActionLifecycle` press/hold/release and sends only a fresh rising edge to the page gate. Held frames and release
send no dead Action. A press made before readiness is spent; gaining readiness while held cannot queue a command.

The development keyboard is an explicit browser adaptation: nonrepeat fresh `KeyX` keydown uses the same page
gate. Repeats and keyup do not request respawn. The testroom's capture-phase living lifecycle listeners yield to
that route. The normal menu-launched match still attaches no X/Q/E development bindings (OT.R29); release builds
retain their existing keyboard gates.

Existing ownership through a menu, cancellation or loading remains a **browser consumed-input safeguard**,
consistent with research 214 and 300. Baselines flushed by those paths remain baselines; unlocking while physically
held does not manufacture a rising edge. Development keyboard ownership additionally stays with its dead key
until keyup, so the testroom's capture listener cannot start a live context from a repeated development keydown.
This keyboard handling is an explicit browser adaptation.

No new pad/touch release suppression is introduced after the actor becomes alive: the existing living release
path resumes. The original's exact post-spawn native input/rebuild flush remains unverified; this task does not
invent that behavior or label a new game rule as an adaptation. Classic and all living Action release, hold and
cancellation behavior stay on their existing route.

## 4. Verification and raw records

`respawnInput.test.ts` uses real `NetPage`, `TraversalPage`, `MatchActions` and `WalkMode` command collection over
a synthetic floor. Its body-expiry dependency is mutable so wall age and body readiness can be varied separately.
It covers early/held/released/fresh input, strict minimum, missing body, menus/loading and unblock-held behavior,
the help/input menu distinction, dead lifecycle bypass, retained living release after spawn, nonrepeat KeyX,
closed/ghost/spectator/classic refusal, classic waiting-room release and living release preservation.

Raw stdout and Vitest JSON were saved during the actual runs, under ignored `logs/respawn-input/`:

```text
RED: red.stdout.log / red.json
Test Files  1 failed | 3 passed (4)
     Tests  14 failed | 59 passed (73)

Additional key-ownership RED: red-key-ownership.stdout.log / red-key-ownership.json
Test Files  1 failed (1)
     Tests  1 failed | 15 passed (16)

GREEN: green.stdout.log / green.json
Test Files  4 passed (4)
     Tests  74 passed (74)
```

Zero skipped or filtered in these runs. `green-attempt1.stdout.log` / `.json` preserve the earlier 73-test green,
before the development capture-listener ownership regression was added. No historical RED was reconstructed.
These are unit/command-seam results, not a rendered browser run, physical playtest or original-runtime comparison.
The fresh reviewer re-read the original input/gate instructions and snapshot hash, inspected the saved RED
outputs, and independently ran the final seven-file set: 411 passed, zero failed, skipped or filtered; verdict
**PASS (medium)**. The controller's rendered checks remain separate acceptance work.

The final source-scoped correction retains the existing alive pad/touch release path and limits the additional
R2 inventory read to `pressRespawn()` alone. `green-dead-only.stdout.log` / `.json` record its seven-file targeted
regression run, including `walk`, `matchMount` and `matchTouch`: 411 passed, zero failed, skipped or filtered.
Earlier green files are preserved as history. No game, browser, build, workspace typecheck, full suite or all-map
data scan was run by this task; these additional tests remain unit/mount checks.
