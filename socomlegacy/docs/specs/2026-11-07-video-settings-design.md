# The video settings page -- design

> Written 2026-11-07T22:30Z (`date -u`) on `agent/misc-designs` from `main` at `964e9e47a`, by the controller's seat
> redotcom-a0 (Claude Fable 5.1). Evidence kinds, kept apart: source inspection and read-only git at `964e9e47a` and on
> `origin/agent/settings-sync` (#726), `origin/agent/webgpu-default` (WG-7), `origin/agent/xbox-memory`; the read-only
> recon of 2026-11-07; seat b6's investigations A and B of the same day
> (`agent-mail/evidence/investigations-2026-11-07/`); an external research brief of 2026-11-07 (web sources, each
> dated; summarised in §9, the brief filed beside this document's plan). The numbers quoted from the CPS plan are its
> measured cells; nothing was run for this document. The plan is written from it (`../plans/TEMPLATE.md`).

**The owner's words (Craig, 2026-11-07, in the seat, verbatim).** "A full review of our VIDEO SETTINGS in the launcher
and in the game, and a full concerted effort to centralize these into a coherent and well thought out video page
offering everything a modern game would expect (and that would not cause massive gameplay / competitive issues).
Resolution/Render Scale, detail levels, shadows, automatic options, render selections, updates when saved instead of
when refreshed, and everything i'm not thinking of. [...] how we can best do 'automatic', while still handling the
extra special case that is the xbox and its crash problem over 1gb ram." His answers the same evening: "a user agent
may be used if absolutely confident. shadows can be off on low. custom options, we should have a frame cap or vsync
option if those are possible and you are confident. We should look to industry standards for what people expect, and
pitch new features that we don't have that people will expect and that are feasible. For the renderer, there's no way
to drop that without a reload?"

**Standing words this builds on:** CPS.R7 (2026-11-02: "Start building out new video settings with sensible defaults
in the client itself, using your best judgement. some of the original unused ones can be hidden and the ui can be
adjusted as needed."; Balanced the default, "balanced is okay, just make sure there's an option to improve it",
H398); PLAT-38 (the roadmap's page, M, open); OT.R79 (VIDEO MODE shows the page's pictures); CX.R5 / H193 (no
internal-resolution, aspect, frame-rate or smoothing rows in the launcher -- **amended tonight by the frame cap
word**); the "no user-agent or controller-based detection" line of the Xbox plan (`../plans/2026-10-31-xbox-match-black.md:47`,
the seat's, **amended tonight: a user agent may be used if absolutely confident**); b6's rule of 2026-11-07 (every
original setting is the card's; a launcher-only value is a finding; a browser-only setting lives under "This browser"
with its own key); H422 (a) (the name tags' look a browser key).

**Track:** product (OT.R53): every row here is a browser adaptation with no original (the console drew one 640x448
frame on a television). The parity guard (§7) is what keeps it so: nothing here may change the information a player
receives, only the cost of drawing it.

## 1. Intent

One VIDEO description, drawn the same on the three surfaces a player meets -- the launcher's Options > Display, the
in-match overlay (the same launcher, OT.R60) and the original's VIDEO OPTIONS screen patched with the browser rows --
with an **Automatic** quality that picks a sensible start for the device and keeps the frame rate up by scaling the
render, a **Custom** mode for the player who wants the knobs, every live row applied the moment it is saved, and the
three rows that cannot apply live (renderer, antialias, power preference) applied **at the next match, never by a page
reload**. The Xbox is handled by Automatic: detected when the signals are certain, held under a memory budget, and
never offered what crashes it.

## 2. Goals, non-goals, anti-goals

**Goals**
- One schema for the browser video settings (the pattern #726 set for the card options): every row names its key,
  values, default, which surfaces draw it, whether it applies live or at the next match, and its effect on the frame.
  A test pins each surface to the schema.
- Automatic as the default for a new browser; Balanced stays what a Balanced-saved browser has (no migration changes a
  saved choice).
- Presets Performance / Balanced / Quality as today, plus Custom when any row deviates; Restore defaults returns to
  Automatic's result, not to constants.
- Render scale as a percentage with a resolution ceiling; shadows Off / Low / Medium / High where Medium is the
  original's 256 map (`charShadow.ts:61-62` `FUN_00320310`, the cited reading, unchanged and the default) and the
  other tiers scale it as an adaptation; antialias; texture filtering; frame cap; the performance overlay; the
  renderer; the device memory budget readout; colour-blind filters under Custom.
- Nothing needs a reload. "Next match" rows say so on the row and apply when the next match mounts; in the in-match
  overlay they are shown locked with the note.
- Xbox: certain detection, a safe class, HD packs refused, a memory readout where the browser gives one.
- Field numbers: the client error beacon gains a per-match performance report so the tiers are tuned from players'
  machines, anonymous as today.
- The test room's separate picture and shadows keys fold into the keeper (LATER 379's split kept for the picture
  only where PR #718 keeps it; the builder reads #718 at the plan's base).

**Non-goals**
- No change to the card's original VIDEO rows (BRIGHTNESS, TEAMMATE NAMES, HEAD BOB, SCREEN POSITION) beyond #726.
- No FXAA, bloom, sharpen, colour grade or supersampling in the game (CPS.R7: test-room experiments only, H135).
- No FOV, draw distance, fog, foliage, LOD or gamma rows (§7).
- No mid-match renderer swap (feasible in principle -- a new canvas, every texture and program rebuilt, a stall the
  size of a map load -- and not worth its bug class; the next-match apply is the industry's "takes effect on
  restart" done one better).
- No change to the GPU-drawn menus' switch (`uiGpuSwitch.ts`) or the HD menu budgets; they stay support switches.

**Anti-goals**
- A row whose Low or Off shows a player more or less of the world than another player's High (a competitive
  difference). Shadows Off is accepted by the owner's word tonight; §7 says why it passes.
- Automatic making a Balanced browser worse than today without a measured reason (CPS.R1: no change without its
  number).
- A detection that calls a PC an Xbox (the "absolutely confident" bar) or hides WebGPU from a machine that has it.
- A reload anywhere in the flow.

## 3. What exists (read at `964e9e47a`; "vs" = `packages/viewer/src`)

- **The keeper** `vs/videoSettings.ts`: one JSON value under `s2u.viewer.video` `{ renderScale, shadows }`, show FPS
  under `s2u.viewer.showFps`; `get/set/step/observe`, one page-wide listener set (live apply); `renderCapFor`
  (Quality = `pixelRatioCap`: device ratio at most 2, 1.5 on touch; Balanced = ratio at most 1 and at most 1440 px
  tall; Performance = 0.75 of Balanced, at most 1080 px). Read by the launcher rows (`console/adapters/options.ts:527-537`),
  the match (`matchMount.ts:886-889`), the test room (`main.ts:1863-1884`) and the native VIDEO rows
  (`packages/ui/src/screens/videoSettingsRows.ts`, HELP WINDOWS hidden).
- **The adaptive ratio** `vs/matchViewport.ts` `AdaptiveRatio`: smoothed frame time (EWMA 0.08 from 16.7 ms), a check
  every 200 ms, one 0.25 step at most every 2 s, down above 24 ms, up below 12 ms, floor 0.75, held while a map
  arrives or under the PS2 picture; the cap moves with the preset (`setCap`). Under Performance the cap equals the
  floor, so it never moves.
- **Other keys**: `s2u.viewer.picture` (Modern / PS2; `vs/picture.ts`; the test room's `s2u.viewer.look`, LATER 379),
  `s2u.viewer.detailDistance` (1.0-4.0x, PF.R60), `s2u.viewer.graphicsBackend` (`auto | webgl2 | xbox | webgpu`;
  Automatic = WebGL2 since #687, LATER 708; read at `createRenderer`, `renderer.ts:158`; "Reload the page to apply" in
  the row's text), antialias = `graphics !== 'xbox'` at context creation (`renderer.ts:162`), `s2u.uiGpu`, brightness
  (the card's tuner, a CSS filter, research 358), #726's `s2u.viewer.nameTags`. Registered in `pageStore.ts:31-80`.
- **The renderer's lifetime**: created per match mount (`matchMount.ts:1055` `pageRenderer(canvas)`), disposed at the
  mount's teardown (`:1383`); IP3's prepared mount creates one ahead of the attach (`:1887`). **So a renderer or
  antialias change can apply at the next match with no reload**; the reload text is conservative, not necessary.
- **The frame**: `requestAnimationFrame` (`matchMount.ts:1302-1304`); the frame's step clamped to 0.1 s; the mover
  steps on a fixed 60 Hz accumulator fed real time (`mover.ts:32`, `TICK_HZ` 60, research 179); timed rules read the
  frame's real seconds (`frameTime.ts`, PAR-24). **So skipping a draw changes no game behaviour**: the simulation and
  the holds count real time either way, as they do on any 30 fps machine today.
- **Detection today**: touch (`touch.ts:82-88`, `(pointer: coarse)`); `navigator.deviceMemory` read only by
  `lobbyPrepare.ts:46` (off under 4 GB); a WebGL probe for a software renderer (`softwareRenderer.ts`, the no-GPU
  notice CPS-4c); **no Xbox detection** -- the Xbox preset is saved only by the "Request Game Files (XBOX)" pick
  (`console/grammar.ts:318-322` → `selectXboxGraphics`). The Xbox preset: WebGL2, antialias off, the movie worker
  rested, the match loader released on return, lobby prepare off, loop sample arrays let go.
- **On branches**: #726 `optionsSchema.ts` + `optionsSchema.test.ts` (the card options' description, pinned to the
  disc's dialogs; the browser video rows outside it); WG-7 `agent/webgpu-default` 688628cb4 (Automatic asks WebGPU
  first, `isFallbackAdapter` refused, `graphicsDemotion.ts` demotes Automatic once to WebGL2 on a lost device or the
  first uncaptured error with a reload notice and a `gpudemoted` beacon; lands only on the host confirmation now
  running); #729 Mods (the HD picture removed; packs applied mid-match behind an overlay; the all-maps pack 1.58 GB);
  #718 (in-game sliders; the test room's strip on `s2u.viewer.look`); `agent/xbox-memory` (the findings, §3 below;
  PR #631 the open handoff).
- **Telemetry**: `frameSampler.ts` (a 3600-frame ring, long tasks), `perfLine.ts` (the copyable line: browser,
  renderer string, backend, ratio, buffer, refresh rate, the settings, p50/p95/p99), `graphicsLost.ts`,
  `clientErrorBeacon.ts` (live since 2026-11-07 14:32Z; backend and adapter string, **no user agent, no frame
  numbers**). Field data by backend or by class: none yet.
- **Measured** (CPS plan, the owner's 4070 SUPER unless said): 16 seats on Frostfire 103 fps (M4); Performance vs
  Balanced at 1280x720 7.63 vs 7.45 ms busy (the preset buys nothing at that size); **shadows off saves ~1.9 ms, the
  one large lever** (CPS `:350-357`); WebGL2 7.73 vs WebGPU 8.22 ms with more hitches on WebGL2; Retina Macs at
  Balanced draw ratio 1 on a ratio-2 screen (the tag glyphs pixel-doubled, the morning list 2026-11-01 `:810`); Xbox
  Series X 28-48 fps with the ratio at its 0.75 floor (960x479), antialias on vs off 34-36 vs 41 fps
  (`xbox-match-black.md:45`), ~18.8 ms a world pass, ~468 draws (`xbox-render-performance.md:54`).
- **The Xbox's memory** (`agent/xbox-memory`'s findings, 2026-11-01, desktop and physical kept apart): `edge://gpu`
  "Total Physical Memory (Gb): 1" on a Series X; Microsoft's UWP page: a foreground **app** gets 1 GB, a game 5 GB
  (Edge is an app); the browser's out-of-memory page is `SBOX_FATAL_MEMORY_EXCEEDED`; physical runs: the game area
  white after ~23 s, Edge closed after ~6 min, frozen at entry (three of three on v0.3.36); desktop estimate of the
  Xbox seat: a lobby ~640 MB, a match 1.1-1.4 GB steady, 1.5-1.6 GB at the load peak; the short-term set S1-S5 cut the
  load peak 29% and the match peak 24%; shaders and three's uniform re-specification refuted as the main cost; the GPU
  process's other ~250 MB at a match's start is open. **WebGPU on Xbox**: `GPUDevice.lost` DXGI_ERROR_DEVICE_REMOVED
  on the physical Series X (`xbox-match-black.md:41`); externally `requestAdapter()` resolves null on Xbox One and Dawn
  lists Xbox unsupported (WebView2Feedback #4150, open to 2026-11). The Series consoles' user agent still says
  "Xbox One" (external, 2026-09).
- **Rows**: PLAT-38 (open); LATER 286 (profiling incl. the Xbox's 1 GB), 295 (aliasing at small sizes), 357, 611,
  694 (the render-size cell that confirms Balanced), 699 (the shadow pass), 700 (GPU-box cells), 708 (the WebGPU
  flip), 709 (the black-world rig); H135, H193/H194, H381/H397, H398 (answered), H406; the settings-organisation spec
  (layout A, Craig's review open).

## 4. The design

### 4.1 One description: `videoSchema`
A description of every browser video row, in `vs/videoSettings.ts` beside the keeper (the browser rows are the
viewer's; the ui package's `videoSettingsRows.ts` already draws from the keeper, so it draws from the schema through
it). Per row: `key`, `kind` (choice | percent | toggle | readout | action), `values` with words, `default`, `surfaces`
(launcher, overlay, native), `apply` (`live | nextMatch`), `group`, `customOnly`, `effect` (the one-line "what it
costs" shown as the row's help). The pin test (`viewer/test/videoSchema.test.ts`, the pattern of #726's
`optionsSchema.test.ts`): the launcher's Display rows under "This browser" equal the schema's rows for `launcher`;
the native VIDEO patch's rows equal the schema's rows for `native` (through `videoSettingsLookup` on the fixture's
`dlgOptions_Video.rdr`, stepping each strip and reading the keeper after each press); the in-match overlay draws the
`nextMatch` rows locked; every `*_ADAPTATION` constant the schema names is in the ledger's reach.

### 4.2 The rows, grouped (the launcher's order; the native screen draws the `native` ones)

| group | row | values | default | apply | surfaces | notes |
|---|---|---|---|---|---|---|
| Quality | **Preset** | Automatic / Performance / Balanced / Quality / Custom | **Automatic** (new browsers); a saved Balanced stays Balanced | live | launcher, overlay | Custom appears when any row below deviates from the preset's values; Restore defaults → Automatic. The native screen has no Preset row: its RENDER SCALE strip shows the resolved preset, and a press there leaves Automatic for that preset (the launcher then reads Performance / Balanced / Quality) |
| Display | **Render scale** | 50-100% in steps of 5 | the preset's (Quality 100, Balanced 100 of ratio 1, Performance 75) | live | launcher, overlay; native as today's three-box strip | a percent of the preset's ratio cap; the adaptive ratio works under it (§4.4). The native strip keeps three boxes (`videoSettingsRows.ts:24-25` already widened the step to fit three; RETURN sits at 430 of 448, so no fourth row or box fits) |
| Display | **Resolution ceiling** | 720p / 1080p / 1440p / Native | the preset's (Performance 1080, Balanced 1440, Quality Native) | live | launcher, overlay | replaces the hidden height constants; a 4K display at Balanced still draws 2560x1440 (CPS.R7 (b)) |
| Display | **Frame cap** | Off / 30 / 60 / 120 | Off | live | launcher, overlay | draws skipped between cap intervals; the simulation steps real time as today (§3); the note "Vsync is the browser's and always on" |
| Display | **Fullscreen** | action | -- | immediate | launcher, START menu | as today |
| Display | **Performance overlay** | Off / FPS / FPS + frame time + ping | Off | live | launcher, overlay; native and START menu as SHOW FPS (Off / On = FPS) | extends `matchFps`'s readout |
| Detail | **Shadows** | Off / Low / Medium / High | the preset's (Performance **Off**, Balanced Medium, Quality Medium) | live | launcher, overlay; native as Off / On (On = the preset's tier) | **Medium = today's draw exactly**: the local player's render-map shadow at the original's 256 (`SHADOW_MAP_SIZE` stays the cited reading) and the world's drop-shadow decals. Low = the map at half (128, `SHADOW_MAP_SCALE_LOW_ADAPTATION` 0.5); High = the map at double (512, `SHADOW_MAP_SCALE_HIGH_ADAPTATION` 2) with soft edges (a PCF tap, `SHADOW_SOFT_TAPS_ADAPTATION`); Off skips the pass. The tiers scale the one shadow the original draws, as render scale scales its picture (the owner's ask 2026-11-07: "low/medium/high ... as an adaption"); none adds a shadow the original lacks. The saving is Off's (the pass's mesh draws, ~1.9 ms, CPS `:350-357`); Low saves little over Medium and is offered for the weakest GPUs; High is a look. The margin `(size-2)/size` (`charShadow.ts:130`) follows the size. The owner's "shadows can be off on low" is Performance's default |
| Detail | **Detail distance** | 1.0-4.0x | 2.0 (1.0 under PS2) | live | launcher, overlay | as today (PF.R60) |
| Detail | **Antialias** | On / Off | On (Xbox class: Off) | **next match** | launcher, overlay | the canvas's MSAA, fixed at context creation |
| Detail | **Texture filtering** | Original / Anisotropic | Original | live | launcher, overlay; Custom only | Modern picture only; the live switch is `updateWorldSampling` (`experimentalWorldSampling.ts`), today gated on the experiment's `enabled` which `picture.ts:36-40` turns on for the HD picture only -- the anisotropy part is decoupled from that gate first (the other experiment parts stay gated); a look, not information (§7) |
| Renderer | **Graphics** | Automatic / WebGL2 / WebGPU | Automatic | **next match** | launcher, overlay | the Xbox preset folds into Automatic's Xbox class (the "Request Game Files (XBOX)" pick still saves it); "Automatic chose: WebGL2" shown; WG-7's demotion and fallback refusal apply |
| Renderer | **Power preference** | Default / High performance / Low power | Default | **next match** | launcher, overlay; Custom only | the context's `powerPreference`; dual-GPU laptops |
| Picture | Video, Brightness, Name tags | as today | | live | | OT.R79, the card, H422 (a); unchanged |
| Picture | **Colour filter** | Off / Protanopia / Deuteranopia / Tritanopia | Off | live | launcher, overlay; Custom only | an accessibility adaptation with no original (the owner, 2026-11-07: "yes agreed"); a colour-matrix filter on the canvas by the brightness filter's mechanism (research 358), the HUD included; a look, not information (§7) |
| This device | **Device memory** | readout | -- | -- | launcher, overlay | `navigator.deviceMemory` and, where exposed, `performance.memory` as "about N MB of M"; the Xbox class shows the 1 GB budget; labelled an estimate |
| This device | **Detected** | readout | -- | -- | launcher | the class Automatic found (Xbox, Touch, Low memory, Software renderer, Standard, High) with "Not right?" → the Preset row |
| This device | Copy performance line | action | | | launcher | as today |

### 4.3 The apply model
- A live row applies on change, debounced one write 400 ms after the last step (#726's pattern), published to every
  keeper at once (today's semantics). A match hears a shadows Off/On change by `setShadows` as today and a tier
  change by the shadow map's resize (the render target disposed and remade at the new size; the builder tests
  shrinking, which one three.js report says can lose the shadow); a scale or ceiling
  change by `setCap`; a frame cap by the frame loop's gate (the gate skips `renderer.render`, `hud.render` and the
  shadow's frame only; the simulation, `net.frame` and the timed rules run every animation frame as today); filtering
  by `updateWorldSampling` and the textures' `needsUpdate`.
- A **next match** row saves at once and shows "applies when the next match starts"; the lobby's prepared mount
  (IP3) is dropped and re-prepared when one changes, so the prepared renderer does not carry the old choice; in the
  in-match overlay the row is drawn locked with the note. No reload button anywhere; the "Reload the page to apply"
  text goes.
- Any change under a preset other than Custom switches the Preset row to Custom; choosing a preset writes every row
  its values.

### 4.4 Automatic
1. **Device class**, computed once per page load from signals, each named in the perf line:
   - **Xbox**: the user agent matches `/\bXbox\b/` **and** the WebGL probe's renderer string names Direct3D11 (the
     Series X reads ANGLE D3D11, `xbox-memory-findings.md` "The device"). Both, or the class is Standard and the row
     "Detected: Standard" shows with the Xbox pick one press away. This is the "absolutely confident" bar: no PC, Mac
     or phone browser carries the Xbox token (Microsoft's own string is "Xbox; Xbox One" on every console), and the
     D3D11 string excludes a spoofed agent on anything but Windows. **A missing WebGPU adapter is not a signal**: the
     physical Series X granted an adapter and a device before losing it (`xbox-match-black.md:41`); the null-adapter
     report is Xbox One's (§9). `navigator.deviceMemory`'s value on Xbox Edge is unrecorded; the perf report (§4.5)
     carries it so the first Xbox players tell us, and an owner row asks the Xbox seat to read the agent string,
     `deviceMemory` and the renderer string once on a test page before the class ships (the default meanwhile: the
     two-signal bar above). **Widened 2026-11-10** (VS.R1, the owner's word): the renderer string naming the console's
     own kernel driver (`/\bSraKmd_/i`; the Series X reads "SraKmd_arden") is an Xbox on its own -- v0.4.18's beacons
     showed consoles whose agent carried no `Xbox` token.
   - **Software renderer**: `softwareRenderer.ts`'s probe (the notice stays).
   - **Touch**: `wantsTouchControls()`.
   - **Low memory**: `deviceMemory` under 4 on a non-Xbox.
   - **Standard**: everything else. **High**: a renderer string naming a discrete part on a desktop with `deviceMemory`
     8 (a table of vendor tokens, no benchmark download: detect-gpu's benchmark data stopped updating 2025-12).
2. **The class's start**: Xbox → WebGL2, antialias Off, ceiling 720p, render scale 75%, shadows Off (the 1.9 ms
   lever, CPS `:350-357`), HD packs and lobby prepare refused, the movie worker rested (the existing Xbox preset's
   set), frame cap 60. Software → Performance (shadows Off), ceiling 720p. Touch → Balanced (ratio at most 1, as a
   Balanced touch browser draws today; Quality's 1.5 touch cap is one step up), shadows On. Low memory → Performance.
   Standard → Balanced. High → Quality. The renderer under Automatic follows `DEFAULT_GRAPHICS_BACKEND_ADAPTATION` (WebGL2 today;
   WebGPU when LATER 708 flips on the owner's word) except the Xbox class, which never asks for WebGPU.
3. **The first-match probe** (Standard and High only): the first `PROBE_SECONDS_ADAPTATION` = 3 s of drawn frames
   after `firstDrawn` and the warm-ups (`warmThrows`, `warmEffects`, `warmShadow` done; the first frame after the
   loading hold skipped) give a smoothed frame time; above 20 ms the class's start drops one preset, below 10 ms at
   full scale it rises one; the result is saved as Automatic's resolved values (shown greyed on the rows) and the probe
   does not run again until "Restore defaults" or a renderer change.
4. **Dynamic render scale** replaces `AdaptiveRatio`'s constants with proper hysteresis, still a browser adaptation
   (**amended 2026-11-08 by the VS-3 review**: on a 60 Hz display a frame is never under a ±10% band -- vsync holds it
   at 16.7 ms -- so a climb defined as "under the band" never fires, and a faster EWMA with an 18.4 ms edge let one
   dropped frame every 30 s ratchet a Balanced page down for good; the first draft is struck): target 16.7 ms (or the
   frame cap's interval), an EWMA of 0.2; a **step down** of 5% of the cap only when the smoothed time has been above
   the **upper edge** -- 1.44 x the target, today's 24 ms at 16.7, scaling with the target -- for 8 consecutive frames
   (a hitch resets the count) and 2 s have passed since the last change, so a steady 20-22 ms page does not move, as
   today (CPS.R1 until VS-9 measures); a floor of 50% of the cap; a **panic drop** of two steps after 6 consecutive
   frames over 33 ms x target/16.7 (skips the 2 s gap, not the 8 frames); and a **climb** of one step when the
   smoothed time has been at or under the target for 4 s of frames and the ratio is under the cap (reachable at vsync
   and under a frame cap), with a back-off: a step down within 10 s of a climb doubles the next climb's wait (at most
   64 s), reset after a climb that holds 30 s; held as today while a map arrives or under the PS2 picture. Under a
   manual preset it runs under that preset's cap as today; under Automatic its floor is the class's. ~~a dead band of
   ±10%, at least 8 settled frames between steps, an improvement mode climbing one step every 4 s of frames under the
   band~~ **Amended 2026-11-11 by AQ-8** (the Automatic quality plan's D1 -- the plan is on `agent/auto-quality`,
   `docs/plans/2026-11-11-automatic-quality.md`; the controller's ruling for v0.4.19; still a browser adaptation): the panic's 33 ms was crossed by one missed
   refresh at 60 Hz (33.3 ms), so any page holding 30 to 40 fps fell to half the cap inside two seconds and stayed --
   in the field 93 of 98 bad matches ended at the floor, and on the bench a 16-seat room on an RTX A4500 with no
   throttle reached it in 69 s. **The rule, stated once: the panic is 6 consecutive frames over 2.5 x the frame time aimed
   at** -- between a frame of two refresh intervals (one refresh missed: not a panic) and a frame of three (a panic);
   41.75 ms at the default 16.7, 83.25 ms under a 30 fps cap's 33.3, and every panic figure in the code and its tests
   is that multiple (`panicShare`). And the trade has a **side test**: a descent from the cap to the floor with no
   climb is judged there once settled -- the frame time at the floor not at least 15 % under the frame time near the
   cap, and fewer pixels bought nothing (a place's frame time is the lowest median of the last eight frames read
   there: ~~near the cap at the steps down to 0.8 of it,~~ at the floor and at the cap's check over a 2 s window -- not a
   hitch's, not the burst's that set a panic off, not a burst's that falls on a check): the ratio
   returns to the cap in one change and no ordinary step down is taken. A verdict the cap then disproves (the cap
   slower than the floor was, by the same 15 %) is taken back once and the trade is not judged again that match.
   ~~A panic's step takes no reading (its frames are a stall's); a descent that reaches the floor with none has the
   cap read after the floor instead.~~ **Amended 2026-11-11 by AQ-8 fold 4:** the cap is read after the floor for
   every descent -- the ratio returns to the cap, and the cap slower than the floor by the 15 % keeps the trade for the
   match -- because a reference read on the way down is read when frames are slow: in the hub's rendered run of
   2026-11-11 (`agent-mail/evidence/v0419/aq-panic-hub-20261111T1416Z/rc2-cpu6.jsonl`, CPU throttled 6x) one read at a
   re-test's first ordinary step fell in a ~48 ms burst and kept a CPU-bound page (~38 ms at any ratio) at the floor.
   After such a verdict the trade is not lost for the match: once a minute has
   passed the next step down opens the test again from the cap, each further verdict doubling that wait (to 8
   minutes) -- a CPU-bound page looks at the floor ever more rarely, and a page whose load has turned to the pixels
   gets its trade back. A new match begins afresh; a cap raised by more than a step does too, keeping a descent on
   its way so that it is still judged.
5. **Xbox memory**: under the Xbox class the HD menu budgets and every pack are refused with a row note ("not on
   Xbox: the browser's 1 GB"), the lobby prepare stays off, and the beacon's perf report carries `performance.memory`
   where exposed so the first real Xbox numbers arrive from players.

### 4.5 Telemetry (the beacon, CEB.R1-R5's shape, anonymous)
At each match's end the page sends one `perf` report beside the error beacon: `class`, `preset`, the resolved rows,
`backend`, `adapter` (as today), `deviceMemory`, `hardwareConcurrency`, screen and buffer sizes, the match's p50/p95,
frames over 33 ms, the scale at the end, `performance.memory` where exposed, the match's seat count and map. No user
agent (as today), no name, no account. Central stores it in `client_errors`'s store as kind `perf` (or a `client_perf`
table, the builder's call under the stats design's V10) and `workflow/tools/client_errors.py --perf` reads it by class
and backend. The CPS board's hypotheses get their field column from it.

## 5. The industry pitch (what players expect, and what we do)

| expected on a modern page | here | feasible | do |
|---|---|---|---|
| display mode (fullscreen / windowed) | Fullscreen action exists | yes | keep |
| resolution | none | yes, as a ceiling (the browser owns the window) | **new: Resolution ceiling** |
| render scale / dynamic resolution | three presets; a 0.25-step adaptive ratio | yes | **new: percent + hysteresis** |
| frame cap / vsync | none; CX.R5 said no | cap yes (the sim steps real time); vsync is the browser's | **new: Frame cap**, vsync noted |
| FOV | none | no: parity (locked in CS2 and Valorant for the same reason) | never |
| brightness / gamma | the original's slider | gamma: no (information) | keep |
| quality preset + per-row overrides, "Custom" | presets only | yes | **new: Custom** |
| texture quality | none; HD packs through Mods | the original's textures are the spec; packs are a look | keep (Mods) |
| shadow quality | on / off | yes, as scales of the original's one shadow map (256 stays the cited reading and the default) | **new: Off / Low / Medium / High**; Performance defaults Off |
| colour-blind filters | none | yes: a canvas colour matrix, the brightness filter's mechanism | **new: Colour filter (Custom)** |
| anti-aliasing | MSAA tied to the Xbox preset | on/off at the next match | **new: Antialias row** |
| anisotropic filtering | test-room experiment | yes, live | **new: Texture filtering (Custom)** |
| upscalers (DLSS/FSR), motion blur, post effects | none | no (no original; CPS.R7) | never |
| HUD scale | the launcher's Interface size | the game HUD is the original's | keep (launcher only) |
| performance overlay (fps, frame time, ping graph) | SHOW FPS | yes | **new: Performance overlay** |
| memory / VRAM estimate bar | none | partial (`deviceMemory`, `performance.memory` on Chromium) | **new: Device memory readout**, an estimate |
| benchmark button | none | yes: the probe run on demand in the lobby | **later** (a product row after the probe exists) |
| reduce flashes / photosensitivity | none | the flash-bang's whiteout is the original's | never (parity) |
| "restore defaults", per-row impact hints | reset per row | yes | **new: Restore defaults → Automatic; `effect` help text** |
| apply / revert countdown | n/a | n/a: nothing here changes the display mode | not needed |

## 6. Tests the builder writes first
`viewer/test/videoSchema.test.ts` (4.1's pins); `videoSettings.test.ts` (the schema's defaults equal today's draw for a
Balanced browser; the percent and ceiling compose to today's caps exactly; Custom detection; Restore defaults;
migration: a stored `{renderScale, shadows}` reads as the same rows); `matchViewport.test.ts` (the hysteresis: dead
band, settled frames, panic drop, improvement mode, the hold; a Performance browser's floor); `frameCap.test.ts` (new:
draws skipped on a fake clock, the simulation's steps unchanged -- the fixed-step count over 10 s equal with the cap
Off and at 30); `deviceClass.test.ts` (new: the Xbox bar needs both signals -- the token alone or D3D11 alone is Standard; a PC
Edge user agent is Standard; a software renderer; touch; low memory); `graphicsBackend.test.ts` (Automatic's Xbox
class never asks for WebGPU; the next-match apply drops the prepared mount: `matchMount` test); `shadowTiers.test.ts`
(new: `SHADOW_MAP_SIZE` untouched; Medium equal to today's draw; Low and High resize the target by the scale and the
margin follows; a tier change disposes and remakes the map; Off skips the pass); `colourFilter.test.ts` (new: the
three matrices, Off is the identity, the HUD canvas included); `clientErrorBeacon.test.ts` (the perf report's shape, no user
agent); ui `videoSettingsRows.test.ts` (the native rows from the schema); options tests (the Display rows from the
schema, the overlay's locked rows); `placeholderLedger`, `conventions`. The frame identity gate (`frameHash`) at the
Balanced defaults before and after: the same pixels (CPS.R9 (e)). Acceptance beyond the units: the CPS live cell on the
owner's host at Automatic, Balanced and Performance (3 runs each, CPS.R1) and one rendered browser run of each surface;
an Xbox physical run through the player's seat when one is offered (H-row).

## 7. The parity guard (why each row passes)
Render scale, ceiling, frame cap, antialias, filtering, power preference and the renderer change the cost or the
smoothness of the same picture, never its content: the world drawn, its fog, its distances and its lights are the
original's values read from the disc and the decompilation, and none is a row. A colour filter remaps every pixel
the same way for the one player who chose it and hides nothing. Shadows: the port's character shadow is
a render map of **the local player only** -- the one node flagged at spawn, grenades, claymores and the other SEALs
cast none (`charShadow.ts:12-17`, research 82 round 4) -- projected down the shadow vector at the original's 256, and
the world's drop-shadow decals are static. Off therefore hides nothing of another player: no remote body casts a
shadow that could show around a corner. Off trades the player's own cue of depth, not information -- the owner's call
tonight stands on that reading, and a reviewer re-reads it at `charShadow.ts` and `world.ts` `setShadows` before the
row lands. The tiers sharpen or soften that same shadow; Low and High show the player their own shadow at another
resolution and nothing else. Detail distance (PF.R60) changes the detail texture's blend distance,
not geometry or visibility. The performance overlay and the readouts are instruments. Brightness is the original's own
slider and gains no range.

## 8. For the owner (answered 2026-11-07, in the seat)
0. **One hand on the Xbox** -- the Xbox seat reads, once, on a test page, the user agent string,
   `navigator.deviceMemory`, the WebGL renderer string and whether `requestAdapter()` answers: **"for later i
   suppose"** -- a HUMAN_TASKS row with the default (the two-signal bar of §4.4) and no date.
1. **Colour-blind filters** under Custom, Off by default: **"yes agreed"** -- the Colour filter row of §4.2.
2. **Shadow tiers**: his question "low/medium/high -- is that something that we could make as an adaption and would
   it be feasible?" -- yes, as §4.2's row: the original's map scaled, Medium the original and the default.
3. Nothing else open: the Xbox detection bar, Shadows Off, the frame cap, Custom rows and next-match apply follow his
   words tonight. The three amended lines (CX.R5's frame-rate row, the Xbox plan's detection line, PLAT-38's page) are
   recorded as rulings by the plan.

## 9. The external brief, in one paragraph (sources in the brief, each dated)
Microsoft documents 1 GB for a foreground store app on Xbox One and Series (the ceiling Edge lives under); WebGPU's
adapter request returns null on **Xbox One** (WebView2Feedback #4150) and Dawn lists Xbox unsupported, while our own
physical Series X granted an adapter and lost the device (`xbox-match-black.md:41`), so the adapter is no signal; the
Series consoles still say "Xbox One" in the user agent, so the token plus the D3D11 renderer string is the certain pair. Chromium still returns full ANGLE renderer
strings; Firefox buckets them and Safari answers "Apple GPU", so a GPU-name tier table is a hint, not a class, and the
probe decides. detect-gpu's benchmark data stopped updating in December 2025. Babylon's SceneOptimizer, Unity's HDRP
and Unreal's dynamic resolution all use a target frame time, a dead band, a settling count and a panic path, which
§4.4 copies. In three.js r0.18x the pixel ratio, size, shadow map size (with a dispose), anisotropy and tone mapping
(with a recompile) change live; the canvas antialias, power preference and the renderer class need a new context.
Competitive titles lock FOV and remove information-bearing shadows rather than offer them; the rule the sources agree
on is "scale fidelity, never information".

## 10. Left to the builder
The percent's exact composition with the device ratio on Retina (the Balanced cap is ratio 1; 100% of Balanced on a
ratio-2 screen stays ratio 1 -- LATER 295's aliasing and the Retina tag glyphs are the follow-ups, not this page's);
how the native RENDER SCALE strip shows a resolved Automatic preset (a greyed box or the box lit); the frame cap's gate
(timestamp arithmetic on the rAF clock, no `setTimeout`); where the class table of vendor tokens lives; the overlay's
ping source (the net client's rtt sample); the perf report's exact field names beside the error beacon's; the order
of the rows within the lane. Dependencies: #726 lands first (its schema pattern and store debounce), WG-7 before the
Graphics row's about text is final, #729 before the Xbox pack refusal has something to refuse, #718 before the test
room's keys fold.
