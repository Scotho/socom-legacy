# 349 -- Respawn instruction: the active Action binding

- Date: 2026-10-21.
- Plan: [confirmed respawn gap fixes](../plans/2026-10-21-respawn-fixes.md), RSP-3, simulation track; audit
  [356 F6](356-original-multiplayer-respawn-audit.md#f6-the-respawn-specific-dead-hud-remains-incomplete).
- Base: `82f62a54f938f30b43f8dd7e592214717315d8ff`.
- Confidence: disc mappings **reading**, fresh review **PASS (high)**, 2026-10-21. The Action gate and instruction text
  are inherited original-code readings from research 91 and 179; no decompilation export was available to re-read.
  No original-runtime capture or comparison was performed; this note establishes no proven claim.

This records the historical RSP-3 fallback. RSP-6 supersedes its message-window placement, plain pad labels,
once-per-death lifetime and age-only help gate: [research 351](351-respawn-help-presentation.md) uses the original
help widgets and current corpse expiry. [Research 352](352-r0004-respawn-code-check.md) freshly reads the selected
r0004 gates; [research 354](354-respawn-action-input.md) corrects the dead Action edge. The historical verification
below retains its original scope.

## 1. Which control respawns

`RUN/READERC.ZAR :: controller.rdr`, each `ControllerConfigs` entry's `Name` and `Mappings/Input/Control` for
`Mappings/Result = Action`, was re-read through the repository's `Zar.parse`, `parseRdr` and `controllerConfigsOf`.
The archive SHA256 is `1b7df1c9732d4d9be0c9ce49de342cd9b552f0d41269dc486be0075e62db9123`, agreeing with audit 356.
The reader finds all four configurations in this file:

| config | Action | Inventory | Fire |
|---|---|---|---|
| Default | X | R2 | R1 |
| Reverse | X | R2 | R1 |
| Goldeneye | Circle | R1 | X |
| Config4 | X | R2 | R1 |

The existing `CONTROLLER_CONFIGS_READING` transcription already has these mappings. The fix reads
`controllerConfigs.record().buttons.Action` when the instruction appears; it neither changes a mapping nor derives
the label from Inventory. `weaponSelect.renderLine` formats Inventory and cannot provide the respawn binding.

The link from respawn to Action is retained from [91 §4.1](91-the-round.md) and
[179 §9.5](179-c1-match-server.md): `FUN_00592560`, D:L451675-451700, tests result 0, whose active configuration
mapping is resolved by `FUN_002c64e0`, D:L166917-166931. The instruction's retained wording,
`Press the %c button to respawn.`, is recorded at `FUN_001f97b0`, D:L57008-57030. These function citations were not
freshly certified against an export in this task.

## 2. Page wiring and browser adaptations

`respawnPrompt` reads the current device and Action label. `NetPageDeps.respawnPrompt` is optional: a stand-in
without a device callback uses the active pad configuration. A callback is evaluated when the existing delayed
message is posted, so a preset or device change before its appearance is reflected.

Both pages provide it through their existing `matchNetDeps` page-specific dependencies:

- `/testroom` (`main.ts`): `promptDevice()`, the same source as the other match prompts.
- The normal menu-launched match (`matchMount.ts`): `promptDeviceOf(pads.count(), 'pad')`, its existing device rule.

Keyboard and touch are **browser adaptations**, with no original PS2 counterparts:

- The development keyboard keeps its existing `KeyX` Action binding (`main.ts`'s action lifecycle listeners and
  `TraversalPage.bindKeys`). It is labelled `[X]`, following the key-cap convention of
  `weaponSelect.renderLine`; selecting Goldeneye does not change this keyboard binding.
- The touch layer is an existing virtual pad (`matchTouch.ts` and `touch.ts`'s `attachWalkTouch`). Its Sony face
  buttons (`touchMarkup.ts`) feed the same active controller mapping through `padInput`: X in Default, Reverse
  and Config4, Circle in Goldeneye. There is no new touch `Action` or Inventory mapping.

## 3. Presentation left open

This fix retains the existing message-window fallback and writes plain `X` / `Circle` names for pad and touch.
The original special-font codes are already represented by `PAD_GLYPH` and `FONT_SPECIAL_01`; the generic message
renderer does not enable special-font glyph decoding. Adding glyph support or moving this instruction into the
help-line renderer would expand the presentation change beyond RSP-3. The controller explicitly retained plain
button names for this batch. The names are a fallback representation, not a claim about the original's rendering.

The existing five-second threshold (`RESPAWN_PROMPT_S`), once-per-death message, generic placement and message
lifetime remain unchanged. Exact original help layout, duration, fade and open-menu behavior await original footage
or a fresh source check. No new simulation value or unresolved presentation constant is introduced, so there is
no new placeholder-ledger entry. Respawn's standing enablement/default remains unchanged.

The developer's later video supplies a concrete lower-centre, two-line help reference with a Cross glyph at
3:47 ([research 356 section 6](356-original-multiplayer-respawn-audit.md)). Its build is unverified and its
scoreboard identifies LAN; exact timing and comparison with the selected r0004 setup remain open. This assessment
does not change this task's retained fallback or promote it to faithful original presentation.

## 4. Verification

- Unit and event-to-HUD tests: `packages/viewer/test/respawnPrompt.test.ts` exercises all four pad configurations,
  the actual keyboard and touch adaptations, a config/device change before appearance, no prompt before five
  seconds, one post per death, cleared death scheduling after a spawn, a fresh schedule on later deaths, and no
  respawn instruction in classic. Its fake socket follows `netRules.test.ts`; no browser or room is started.
- Original-disc transcription check: `tools/test/controllerPresetsDisc.test.ts`, filtered to
  `controller.rdr holds`, re-reads every mapping in this one controller file. With no copied disc it skips;
  filtered-out checks are not passes. The disc comes from `SOCOM_DISC` or the existing desktop-disc fallback.
- Source inspection: both page callbacks use their existing device rule. No rendered browser run, game run,
  capture comparison, full suite, typecheck or build was performed by this task.

The fresh reviewer independently re-read all four original-disc Action mappings and the archive hash, ran the
prompt/controller/page unit set (48 passed, 0 failed, 0 skipped) and the selected controller-disc check (1 passed,
4 filtered-out). Historical RED is author-reported and corroborated by the parent source. The original-code Action
gate/text remain **reading, pending review**; original-runtime evidence is still needed to settle the presentation.
