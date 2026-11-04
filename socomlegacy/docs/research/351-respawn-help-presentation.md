# 351 -- Respawn: the lower-centre help widgets

- Date: 2026-10-21.
- Plan: [confirmed respawn gap fixes](../plans/2026-10-21-respawn-fixes.md), RSP-6, simulation track.
- Base: `4e5c0afbd`; the implementation preserves the parent branch's respawn enablement and match mechanics.
- Confidence: **reading**, fresh independent source/implementation review **PASS (medium)**, 2026-10-21.
  Original-disc controller/font readings and loaded-r0004 instruction-image
  readings support this transcription. The supplied Frostfire footage is an unscored visual reference of an
  unidentified XLink/LAN build. No controlled original gameplay trace or capture comparison is claimed.

## 1. Sources and what they settle

The selected primary reference is the working original r0004 setup (the plan's RSP.R5). Research 352 records its
paused instruction image, integrity hashes, extraction method and bounded native addresses. No state, binary,
disassembly, screenshot or movie is added to git. The relevant fresh readings are:

| source | reading used here |
|---|---|
| `FUN_001f97b0`, r0004 `0x1f9ae0-0x1f9b3c` | the first death/Inventory instruction |
| `FUN_001f97b0`, r0004 `0x1f9b40-0x1f9bd8` | the respawn help requires a player with a model, model alpha exactly zero, no spectator flag, and elapsed strictly greater than five seconds |
| `FUN_001f97b0`, r0004 `0x1f9be0-0x1f9c68` | the Action instruction is the second help widget; its alpha is reasserted at 100 every eligible frame |
| `FUN_001f97b0`, r0004 `0x1f9c78-0x1f9c98` | the second widget is blank otherwise |
| `FUN_001f7ff0`, r0004 `0x1f807c-0x1f8218` | ordinary help holds ten seconds and fades over half a second; the independent Action alpha survives this fade |
| r0004 `0x1f8510-0x1f85d0`, `FUN_001fb420` at `0x1fb4e8` / `0x1fb770` | the viewed local alive-to-dead edge and round start reset the ordinary help clock |
| `RUN/READERC.ZAR :: controller.rdr`, every `ControllerConfigs` entry's `Mappings/Input/Control` and `Mappings/Result` | Default, Reverse and Config4: Action X, Inventory R2; Goldeneye: Action Circle, Inventory R1 |
| `RUN/READERC.ZAR :: fonts.rdr`, `font_special_01` | Cross byte 166, Circle 183, R1 189 and R2 190, already represented by `PAD_GLYPH` and `INVENTORY_GLYPH` |

The disc fields were freshly re-read by the controller through `Zar.parse`, `parseRdr` and `controllerConfigsOf`;
research 349 also records the controller archive hash and its earlier independent review. The decompilation export
is unavailable locally: inherited `FUN_001f97b0`, D:L56996-57046 and `FUN_00592560`, D:L451675-451726 remain distinct
from the fresh r0004 native-address readings. Their text is not pasted here.

The [supplied video](https://www.youtube.com/watch?v=pQEhRmFaodA&t=225s), inspected at 3:45-3:51, corroborates
two yellow lower-centre lines: death/Inventory, then Action with a Cross glyph. Research 356 section 6 records its
context and limits. It does not supply a minimum delay or prove this setup's patch version.

## 2. Presentation and shared state

The respawn dead path writes all six existing help widgets: `DEAD_PROMPT[0]` first, the eligible Action line second,
and four blanks. Before eligibility the second is blank too. Classic's teammate-cycle lines are absent from this
path. `NetPage.prompt()` exposes this state to both `spectatorHudView` and the shared WEAPON EXCHANGE part.
Both `/testroom` and the ordinary match already call those shared seams every frame; their delayed message-window
callbacks are removed. There is no once-per-death respawn message post.

The help renderer reuses `SPECTATOR_HELP`: centre x 324, first baseline 380, pitch 18, scale 0.9, RGB (100,100,20),
alpha 100, and the existing shadow capped at 96. These are the existing readings in research 282 sections 3 and 8
and research 91 section 12, not positions estimated from the video. Research 352 section 2 freshly confirms the
r0004 positions. Special-font decoding is enabled by this renderer, so pad instructions use the original glyphs.

The active controller record and device are resolved on every frame, including after readiness. The first line
uses Inventory R2/R1 and the second uses Action Cross/Circle. The first line retains the ordinary ten-second hold
and half-second fade. The ready second line keeps alpha 100 until it is no longer eligible or its dead view ends.
The existing Chat and scoreboard hides still apply; no browser menu is newly equated with original control
state 3. Classic, ghost and spectator help retain their existing strings, clock and hides.

A spawn clears the death state; a new round clears only the old help metadata while the real spawn still owns the
body/kit reset. A close or release clears the HUD's view. A subsequent death schedules fresh help on its new edge.

## 3. Eligibility substitution and remaining reading

The original readiness test is **elapsed greater than five seconds and model alpha exactly zero**, not a fixed
five-second instruction delay and not automatic respawn. Research 352 sections 3-4 independently locates the
fresh Action press, its separate controller-mode gate, the death-started fade, its approximately 0.1-per-second
rate, and the actor update's exact clamp to zero. Those input and gameplay rules are not changed by this UI task.

The browser does not expose the original model's partial alpha here. Its existing own-corpse presentation uses
`BODY_FADE_S = 10` / `corpseShownS(rules, 'own')` (research 317); partial alpha remains the existing
`BODY_FADE_PLACEHOLDER`. `Play.ownCorpseExpired()` is a read-only accessor of the exact `corpseGone` state already
used to hide that body. It requires a current `BodyView`; removing the body returns false, and the existing
respawn/frame reset clears the expiry. The accessor changes no timer, rendering rule or simulation value.

Both mounts supply this accessor to `NetPage` and already run `play.frame` before `spectatorHudView`. The ready
line therefore waits for the actual current browser corpse expiry as well as the strict greater-than-five
condition. There is no separately calculated body-age threshold and no second corpse clock. A non-rendering
stand-in may omit the dependency, in which case readiness stays false; no timing fallback is used. This remains
a substitution of the browser's existing hide state for the original's model-alpha-zero state, not a claim that
nominal ten seconds is the original's universal frame count. A future partial-alpha renderer should expose its
actual zero-alpha state through this seam.

Existing readings reused here are `BODY_FADE_S`, `RESPAWN_PROMPT_S` (the five-second minimum only),
`SPECTATOR_HELP` and its shared `helpAlpha`, `DEAD_PROMPT`, and the original font/controller glyph mappings.
No new timing constant or placeholder is introduced. To settle the remaining substitution, compare the selected
r0004 model alpha, help appearance and Action acceptance in a controlled death sequence; then hold the result
with a trace or capture-scored test. This note makes no proven claim and does not close the partial-alpha gap.

## 4. Browser adaptations and verification

Keyboard and touch remain explicit browser adaptations. The keyboard keeps Inventory `[I]` and Action `[X]`
regardless of the controller preset. Touch keeps Inventory `[INV]` and its virtual pad's Action X/Circle names;
its existing virtual-pad mappings are unchanged. The existing touch INV control now appears for a dead respawn
seat before readiness too, through the shared prompt seam. Its covered-screen hide and spawn clear are tested.

The focused unit tests cover real socket events through `NetPage`, shared help state and HUD rendering; all pad
presets; active preset/device changes; six widgets and blanks; rendered-corpse expiry and the strict minimum; the first
line's normal fade and second line's persistent alpha; native special-font glyphs, ink, placement and shadow;
Chat/scoreboard hides; spawn, new-round and close clear; later death; unchanged classic help; and touch INV.
An existing source-text migration check for the old prompt shape is replaced by a behavioral shared-state check.

Author's focused runs (`respawnPrompt`, `weaponSelect`, `hud`, `matchExchange`, `--maxWorkers=2`):

```text
RED
Test Files  2 failed | 2 passed (4)
     Tests  11 failed | 185 passed (196)

GREEN
Test Files  4 passed (4)
     Tests  197 passed (197)
```

Both runs selected all tests in those four files: zero skipped and zero filtered. No browser, game, build,
workspace typecheck, full suite or original-runtime comparison was run by this task. Source review and the
controller's serial integration checks remain separate acceptance work.

The follow-up targeted regression run added `netRules`, `matchMount` and `matchTouch`: seven files, 402 passed,
zero failed, skipped or filtered. The mounted-match tests use jsdom and report its unimplemented canvas context;
this remains a unit/mount test, not a rendered browser run.

The controller's correction couples readiness to `Play.ownCorpseExpired()` instead of a second page-age threshold.
Its additional tests fail before the correction and hold a visible corpse beyond ten seconds, expiry after that
wait, the separate strict greater-than-five minimum, the real renderer's hide/accessor agreement, absent-body
handling and spawn reset. The non-rendering stand-in's omitted reader also stays unready. Actual runs:

```text
RED (respawnPrompt and play)
Test Files  2 failed (2)
     Tests  3 failed | 45 passed | 1 skipped (49)

GREEN (the previous seven files plus play)
Test Files  8 passed (8)
     Tests  440 passed | 1 skipped (441)
```

Zero filtered. The skipped case is `play.test.ts`'s dressed-SEAL served-tree eye check: its served assets are absent.
The correction leaves the actual corpse timer and rendering untouched and adds no original-runtime evidence.

The fresh reviewer independently re-read the captured r0004 instructions and original controller/font data,
checked the parent implementation and corpse getter, and reran the final eight-file set: 440 passed, one skipped.
The skip is the served-tree eye case named above. The original RED outputs were not retained as files; their
chronology is author-reported and the parent behavior was independently probed. RSP-8's dead Action routing is
recorded separately in [research 354](354-respawn-action-input.md).
