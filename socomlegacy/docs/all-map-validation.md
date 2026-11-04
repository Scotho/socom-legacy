# Testing the complete feature stack across every map

Work on `chris/all-map-validation`, based on pushed audio build `a83aab84`. Existing gameplay rules are unchanged. The shared Armory reader now includes the original UI JUNK
texture library (research 95 correction). Keep the previous playable packages.
See [the recorded baseline and failures](all-map-validation-results.md) before treating
any map as ready. The tools and checklist below are the repeatable validation workflow.

## Separate all-map easy-launch test

The completion package is named **SOCOM-All-Maps-Validation-v2-Easy-Launch-2026-10-08.zip**.
Extract it to obtain **SOCOM All Maps Validation v2 Test**. Keep the previous Victory
Dances, Gameplay Audio and first all-map packages intact. All22 maps have passing
results for the five bounded rendered scenarios; physical testing remains separate.
Read `ALL-MAP-RESULTS.md` and `TEST-RESULTS.txt` for the actual coverage.

1. Windows: open that extracted folder and double-click **HOST-WINDOWS.cmd**.
   The launcher checks `SOCOM_DISC`, OneDrive Desktop, and Desktop for RUN. It asks
   for the parent of RUN only if none validates; all packaged map files are required.
2. Mac: copy/extract the same ZIP and double-click **JOIN-MAC.command**, then enter
   the Windows host's local IP printed in its launcher. If macOS does not retain the
   executable bit, run `chmod +x JOIN-MAC.command` once from that folder.
3. Each player selects their own ISO in the automatically opened browser and connects
   their controller. The report overlay is enabled. Node.js 22.13 or newer is required;
   the scripts report a missing/old Node installation. No npm install or build is needed.
4. Use the browser settings panel's map selector to pick the same map on both computers.
   Save the report on each computer before moving to the next map. Close old test
   launchers first to free their ports; no launcher stops another running package.

The ZIP contains compiled code and review source, no original game assets. The host's
RUN is read locally; each browser reads its own ISO. Windows Bash execution of the Mac
script is automated launcher coverage, not a physical Mac/Finder/controller test.
The included source is for review; rebuilding this all-map snapshot requires a
repository checkout with Git metadata and development dependencies. This does not
affect the compiled launchers.

## Order of testing

1. **Discover and decode every multiplayer archive, including variants.** Read the
   local ISO's directory instead of assuming the three package maps are the whole game.
   Check both factions' four character mappings, kits/valves, Armory art and previews,
   Options/editor data, victory clips/icon and audio streams/banks. Report missing data
   and cross-map borrowed sounds. An asset being decoded is not proof of its trigger.
2. **Run server and shared-rule tests.** Every map gets the existing two-client real-hull
   lifecycle checks and legal Weapon Exchange choices from tested base/dependency kits; preserve the M14
   regression and invalid-choice tests. Run shared taunt/Options/dance/input tests once
   on this code revision, retaining their scope rather than multiplying their pass count.
3. **Rendered multiplayer, one map at a time.** Use real ISO loading and simulated pad
   input. Run Armory/full-kit WX, taunts/editor, Options/team communication, contextual
   victory and grenade audio as separate scenarios. A fixture that assumes an illegal
   kit or unavailable original voice fails; investigate it before changing the scenario.
   Never alter map rules, substitute sounds or relax assertions to turn the row green.
4. **Physical Windows/Mac LAN pass.** Both factions and relevant character variants;
   then swap host/listener roles. Check controller feel, visuals and actual sound. Keep
   the report from each computer. Original-running comparison is a separate parity bar.

## Repeatable commands

Developer commands below run from `socomlegacy/` with existing dependencies installed.
`SOCOM_ISO` names the local ISO; `SOCOM_DISC` names the parent of its extracted RUN.
`S2U_TEST_FIXTURES` should also name that parent for older fixture-based suites.
Do not commit disc files or generated screenshots. On Windows use `npm.cmd`/`npx.cmd`.

```
node --import tsx tools/map-validation.ts --out ../.local-history/all-maps-RUN-ID --server
npx vitest run packages/central/test/allMapsMultiplayer.test.ts packages/central/test/weaponExchangeDisc.test.ts packages/viewer/test/victoryDisc.test.ts packages/viewer/test/tauntData.test.ts packages/viewer/test/originalOptions.test.ts --maxWorkers=1
```

The inventory writes `matrix.json` and `matrix.md` after each map, refuses an existing
output directory and exits nonzero for data gaps or failures. `--maps MP2,MP72` selects
a subset and rejects unknown names. Its server pass uses the existing real-hull helper;
it first verifies the extracted map, READERC and ZWEAPON match the ISO. This is a
bounded cross-check, not a hash verification of the entire extracted tree.
The JSON retains the disc's case-sensitive valve keys; Windows PowerShell 5's
`ConvertFrom-Json` rejects keys that differ only in case. Use the Markdown report
or a case-preserving JSON reader rather than renaming original keys.

The matrix deliberately leaves rendered/physical cells `not-run`; it does not import
older successes. Keep the corresponding Playwright result alongside it, with map and
revision. An interrupted sweep's existing rows remain partial, with no completion time.

For rendered tests, use free private ports (`E2E_PORT=5397`, `E2E_LOCAL_PORT=8897`) and
`VITE_S2U_MULTIPLAYER=on`, `VITE_S2U_ROOMS=off`. All runs are serial per host.

```
# Set S2U_VALIDATION_MAP=MP72 (one map, validated against RUN), then:
npx playwright test packages/viewer/e2e/weaponExchangeOriginal.spec.ts packages/viewer/e2e/taunts.spec.ts packages/viewer/e2e/originalSettings.spec.ts packages/viewer/e2e/victory.spec.ts --workers=1

# Set S2U_TEST_MAPS=MP2,MP51,MP72 (or all discovered identifiers), then:
npx playwright test packages/viewer/e2e/gameplayAudio.spec.ts --workers=1

# Serial dispatcher: all discovered maps and all five scenarios by default.
node --import tsx tools/map-browser-validation.ts --out ../.local-history/browser-RUN-ID
# Bounded batch; follow with the next maps/features after reviewing failures:
node --import tsx tools/map-browser-validation.ts --out ../.local-history/browser-BATCH-ID --maps MP5,MP6 --features settings,victory,audio
```

The dispatcher writes a separate log, Playwright JSON and artifacts for each map and
scenario, plus an incremental `summary.json`. It refuses existing output directories,
does not retry or suppress failures, and requires zero skipped/flaky tests for a
scenario pass. Missing reports are failures; absent scenarios remain unexecuted. Ctrl+C
marks interruption and stops only its child process tree. No physical result is inferred.
It checks the configured desktop host lock before every scenario and refuses a held lock.

Defaults remain the original MP2 menu fixtures and three-map audio suite. The settings
test now resolves the exact character's Hold Fire voice group from the disc instead
of expecting Frostfire recordings on every map. All other gameplay assertions remain.
The WX scenario still exercises a specific M14/full-kit regression; a map forbidding
that kit must not be marked validated by that scenario. The server choice test
iterates legal replacements from selected base/dependency kits separately; it is
not every combined kit or character path. The original two-player taunt scenario
likewise requires an actual grenade in the equipped kit. Failed scenario setup is not
proof of a gameplay bug and never counts as coverage of the skipped actions.
Each scenario starts fresh browser contexts, one independent browser process per
client, with the same project renderer/launch options. This test-host adaptation
avoids sharing one SwiftShader process among the simulated computers; pages remain
active throughout gameplay, and readiness assertions/timeouts are unchanged. Passing separate maps does not test a
live map-to-map transition in one session; record that separately in the LAN checklist.

The default renderer remains SwiftShader. On a Windows test host with a working
Direct3D11 adapter, set `$env:S2U_E2E_RENDERER='d3d11'` before the dispatcher or
Playwright command to request hardware rendering. Unknown values and D3D11 on a
non-Windows host are rejected. The summary records `rendererRequest`; verify the
actual WebGL renderer separately and identify it in the report. Changing the test
renderer does not establish visual parity or physical controller coverage.

## What to record for every map

Record archive ID (variants separately), name/mode, build commit and dirty-source state,
team/character, test command, passed/failed/skipped/not-run, failure step, and evidence
files. Name whether each result is source inspection, disc decode, in-memory server,
rendered browser, physical controller/listening, or original-running comparison.
Run targeted regression after a fix, then the affected map family and the three known
package maps. Run the full repository gate before proposing a merge; do not call a
focused validation run the full gate.
For the no-data gate, also clear `S2U_TEST_FIXTURES`, `SOCOM_PARITY_ARCHIVE` and
`SOCOM_EXCHANGE_ELF` in
that process before `bash workflow/gate.sh --no-data` from the repository root.
The current gate itself removes only `SOCOM_DISC`, `SOCOM_ISO` and `SOCOM_PC_ROOT`;
leaving the legacy fixture variable set still enables some disc-backed tests.
Permitted repository test fixtures remain available in this profile; it withholds
configured external disc/capture paths, not the repository's fixtures.
It also does not hide an existing ignored `public/maps` cache. Record that cache
as present if prepared; use a separate clean checkout without that cache when
reproducing the recorded cache-absent profile. Preserve existing local data.

## Physical two-computer checklist

The older easy-launch packages offer only MP2/MP51/MP72. The separate candidate
above offers all 22. Developers can alternatively use two checkouts of this revision
with existing dependencies. From `socomlegacy/`:

```
# Windows host; SOCOM_DISC is already set to the RUN parent:
node --import tsx tools/lan-playtest.ts host --build --maps MP5 --map MP5 --port 8897 --site-port 5397
# Mac joiner; replace HOST_IP with the Windows computer's LAN address:
node --import tsx tools/lan-playtest.ts join --build --address HOST_IP --maps MP5 --map MP5 --port 8897 --site-port 5398
```

Use free ports, the same map list on both seats, and each computer's own supplied ISO.
The developer launcher builds its separate LAN site and opens the browser; add
`&devmode=1` to the generated play URL for the report overlay. These are developer
commands; use the packaged launchers for no-build testing. Keep the
working easy-launch folders intact. Change the map identifier for subsequent batches.

For each archive/variant, enter these results into the map's row:

- **Join/Armory:** ISO loads, both players join, each team's character and legal kit
  preview/model/name agree. Cancel and DONE do not fire or throw.
- **Combat:** move, shoot, reload, take damage and die; peer sees the correct animation.
- **Weapon Exchange:** open after death, change primary, sidearm and each editable
  equipment slot, cancel/confirm, wait for the actual next spawn. Preserve mandatory
  C4 on Sujo/Enowapi/Sandstorm and check that locked-slot changes are refused;
  full C4 gameplay remains unsupported. Check quantities, 2X ammo,
  duplicate restrictions, model/HUD/audio and persistence. Test M14 where legal and
  refusal where restricted; held menu inputs must not leak into combat.
- **Chat/Options:** Circle tap/hold, focus, back/close, repeat, recorded taunt and custom
  text delivery, editor save/cancel/reload. Test teammate message recipients separately.
  Change Sound/Dialog/Music independently, invert pitch/head bob, and save/cancel.
- **Victory:** eligible defeated-enemy context, selection among nearby actions, local
  and remote clip, end/interruption/death/round reset and held-input safety.
- **Audio:** both teams throw frag/HE/smoke/flash where supported. Listen nearby and
  at distance, from each side of the event; verify no doubled release/explosion.
  A teammate warning requires a teammate; two opposing players alone cannot verify
  that recipient case. Add clients as needed. Test footsteps, reload/empty fire,
  damage/death, available doors/ladders/claymores, ambience and round cues.
- **Transitions:** death, next round, reconnect and next map; no stale audio, stuck
  menus or animation states. Save reports from both computers and note physical pads.

Unknown original behavior in research 300-304 remains unknown even if a browser test
passes. No substituted game assets or synthetic audio are part of this procedure.
