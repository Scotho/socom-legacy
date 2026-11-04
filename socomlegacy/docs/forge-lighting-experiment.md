# Forge lighting experiment -- 2026-10-25

Historical prototype record, a local browser adaptation requested in Chris's Codex seat: investigate a shared night-to-day
baseline because Forge's existing slider only dims a map's original lighting. The user accepted an
approximation retaining baked shadows and noted that Rat's Nest is mostly underground. This is not a
reading of original lighting or a new game rule. The user subsequently approved promotion into normal
Forge Settings; [the integration plan](plans/2026-10-25-forge-daynight.md) owns the current state and checks.

Base: origin/main `2e8b80433e0ba4130e330d65f36b100706185ab6`.
Prototype commits: `706928dc3`, `750266718`, on `agent/forge-daynight`.
Its former local preview was `/forge?devmode&lightingStudy` (development build only).

## Prototype controls (historical)

Open Rat's Nest, select **Try daylight**, move the study's **Night -> Day** slider, and use **Original**
or **Hold to compare** at the same viewpoint. The minus button folds the panel. Compare Desert Glory
as the daytime case. The ordinary Forge dimmer is unchanged; the study has its own controls.
Study settings are neither saved in the layout nor passed to a match. A refresh starts on Original.
**Left drag to look** is on by default in this study: drag with the left mouse button to turn the
camera, WASD to fly, Shift-drag to use the editor's selection. Turn the checkbox off for normal
selection. The helper never claims right-click or touch, or input during a match/walk/busy/suspended
camera. This follow-up was explicitly requested in the same seat on 2026-10-25.

## Method and limits

- Estimate a fixed map-wide surface baseline from texture-mean RGB times the decoded, appropriately lit
  vertex colours. Weight world triangles by surface area. Exclude unfogged, alternate, vertex-alpha,
  alpha-pass and named sky/shadow/glow/water surfaces. No source arrays are edited.
- This estimates surface colour, not measured screen brightness: UV correspondence, occlusion, props
  and the camera's composition are not part of the estimate. All-world area weighting can overweight
  an inaccessible surface. Rat's Nest's estimated median was 3.4%, Frostfire's 11.5%, Desert Glory's 13.4%.
- Map the baseline to a common target through a bounded rational curve. The study's chosen grayscale
  targets are 5.5% at night and 34% at day, with logarithmic interpolation. These are product choices
  for the experiment, not original values. Black stays black; highlight compression retains detail.
- Wrap the Forge materials' colour graphs, preserving alpha and leaving additive/destination lights
  and named shadow/glow carriers alone. The ordinary dimmer's gain is removed during preview.
- The outdoor follow-up found Crossroads' bright yellow haze survived the surface curve at night:
  its 6.1% surface baseline is already close to the 5.5% night target, even with a bright atmosphere.
  Sky/fog therefore use independent shared atmosphere endpoints, night RGB (0.012, 0.019, 0.035),
  day (0.47, 0.58, 0.70), with logarithmic interpolation. Named sky/cloud/horizon materials retain
  luminance detail (0.6 + 0.8*luminance) under that tint. Fog and clear colour use the endpoint colour;
  distances and altitude remain authored. These are experiment choices, not original values.
- No new sun, shadow bake, physical light transport, tint calibration or sky replacement. Original sky
  artwork and baked shadows remain. Mixed-map placed pieces share the base map's calibration.
  Sky shapes are retained under the new colour rather than replaced. This is a visibility/tonal
  experiment; full relighting and a persistent settings design are unbuilt.

## Verification and evidence

- Unit: initial RED was the missing baseline module; initial GREEN was 14 tests. Follow-up RED:
  two drag assertions failed against the no-op helper; the atmosphere test failed against a constant
  daytime atmosphere. Latest GREEN: `lightingExperiment.test.ts` (4), `lightingLook.test.ts` (3),
  existing `settings.test.ts` (11), **18 passed, 0 failed, 0 skipped**. Targeted run only.
- Static: viewer-only `tsc --noEmit -p socomlegacy/packages/viewer`, exit 0; `git diff --check`, clean.
- Rendered browser: Codex in-app browser, WebGPU, automated UI input. Rat's Nest Original, daylight
  and night at the same rotated spawn view; daylight also inspected facing the nearby wall. Desert
  Glory Original and night at its opening view. No console errors observed in either map's checks.
  The brighter Rat's Nest view exposes floor and rock texture; Desert Glory darkens while remaining
  readable. These are author observations for the user to judge, not parity proof.
- Follow-up rendered browser: same browser/backend, automated left-button drag rotates the Crossroads
  camera with no selection; keyboard flight works after release. Crossroads Original/day/night at a
  rooftop view, Blizzard day/night at its snowy opening view, Night Stalker day/night at its opening
  camp. Estimated baselines: Crossroads 6.1%, Blizzard 12.2%, Night Stalker 18.6%. Crossroads' atmosphere
  now becomes dark and cool at night; snow remains distinguishable on Blizzard; Night Stalker retains
  its cloud pattern in daylight. No console errors observed across these checks. No physical mouse
  playtest by the user is claimed.
- Local screenshots: `logs/forge-lighting/` (ignored): `rats-nest-original.png`, `rats-nest-day.png`,
  `rats-nest-night.png`, `desert-glory-original.png`, `desert-glory-night.png`.
  Follow-up pairs: `crossroads-day.png` / `crossroads-night.png`, `blizzard-day.png` /
  `blizzard-night.png`, `night-stalker-day.png` / `night-stalker-night.png`, plus `crossroads-original.png`.
- The prototype had no dev-disc transcription tests, physical playtest, capture comparison, full gate,
  build or production acceptance. Its checks above do not establish the integrated feature's result.
  The subsequent integration replaces these temporary controls, saves the choice and applies it in Play;
  its plan records fresh review and verification separately. The board card is
  [Turn Forge maps from night to day]((the private board)). Nothing deployed.
