# All-map validation baseline

2026-10-07, local branch `chris/all-map-validation`, based on audio build `a83aab84`.
This branch adds validation instruments, parameterizes existing scenarios and restores
an omitted original Armory texture library. It keeps existing gameplay rules unchanged and fixes browser connection cleanup. The
separate all-map candidate preserves the working packages. The earlier branch push
ended at `8e8080ef`. The completion record is `0ad09bd9`; the user authorized a
branch-only update for manager review on 2026-10-08. No merge is authorized.

## Latest checkpoint (2026-10-08 continuation)

Manager overview: [changes, current coverage and integration limits](all-map-manager-handoff.md).
Previous published checkpoint: `8e8080ef`. The manager-review update includes the
completion record `0ad09bd9` and the evidence below.

- Completed rendered matrix: **110/110** map/scenario cells passed across
  recorded revisions, each checked against its Playwright JSON with zero failures,
  skips or flaky cases. All22 maps have Armory/full-kit Exchange, taunts/editor,
  Options/communications, victory and grenade-audio passes. The
  [per-map matrix](all-map-browser-matrix.md) names each revision and duration;
  this is not a same-head sweep. Final20 cells on MP73/81/82/83 and eight
  corrected Exchange/taunt cases on MP62/64/71/72 passed at `3e1d0a11`.
  Earlier failures, diagnostic runs and interruptions remain separately recorded.
- MP5 corrected-driver Options118.727s and taunts122.742s passed at `f09d1a32`.
  Earlier failures remain below. No production menu timing or assertion was changed.
- MP7 core: Exchange307.222s/victory126.328s/audio105.089s at `0c99f8bc`.
  MP8 core: Exchange300.617s/victory124.535s/audio84.597s at `ca32d289`.
  These are explicit D3D11 automated runs, not physical listening/controller tests.
- Transition/recovery at `cd80d547`:2 passed/0 failed,170.654s, zero skipped/flaky.
  MP2->MP6->MP72 and automatic socket retry passed settings/custom-text, accepted
  kits, delivery, peer movement and input-safety checks. MP6 picker use is forced
  hidden-menu stress; MP72 uses the visible picker. Active vocal/dance interruption
  and changed-kit persistence are not claimed. Earlier setup/countdown failures
  remain separately recorded in the plan's Log and private artifacts.
- Reconnect-audio runtime fix `d3cd82a5`: pending round cues reset once per lost
  client. Focused RED16 passed/1 failed -> GREEN17 passed; related50 passed and
  independent17 passed in separate runs. No new original sound/timing was invented.
- Final data gate at `3e1d0a11`:7988 passed/0 failed/80 skipped; shared240,
  typecheck, build and428 guard tests passed. Overall RED retains the two
  already-shared history findingsH110; current tree scan zero hits. The final
  external-data-withheld profile passed7520/0 failed/355 skipped, plus240 shared,
  typecheck, build and428 guard tests; same RED history result. Its existing
  ignored map cache was retained, so it is not a cache-absent profile.
- Earlier full gates at `cd80d547`: data7814 passed/0 failed/115 skipped; no-data7346
  passed/0 failed/478 skipped. Each separately passed shared240, typecheck, build
  and428 guard tests. Overall RED for existing history privacy findingsH110;
  current-tree scans clean. Missing audit/scanner prerequisites remain explicit.
  Later fixture/package corrections are covered by their independent reviews,
  focused checks, rendered reruns and the new data-gate result above.
- Original breach-success group `^*PT_0024` restored for MP61/62/73; three ISO
  recordings now register through the existing group player, with original script
  timing/volume preserved. Independent ISO/source reading and focused dev-disc
  tests; no physical listening or rendered bomb-detonation sequence claimed.
- Original parity gaps remain on all22 inventory rows. Browser grenade coverage
  uses instrumented equipment selection/throw initiation, and tests selected
  character/team/item combinations. It does not establish every sound or voice.
  Release counts are exactly one on four clients and warning counts exactly one
  on the teammate. Effect counts establish playback on actor/teammate, not an
  exact-one effect guarantee. Panning, attenuation and audible output are not
  measured by these rendered tests.
- Rendered victory coverage uses `victory_funky` (85 frames), one selected
  character per team, and server-arranged spawn/kill state. Playback, completion,
  reset and held-input safety pass where recorded; every variant, natural context
  discovery, damage interruption and nearby-action arbitration are not covered.
  Rendered Options coverage checks drafts/applied values, persistence and one
  tactical/team-text flow. The music draft is cancelled; actual Sound/Dialog
  gains and camera response are not measured by that scenario.
- Previous packages remain unchanged. Separate v2 was freshly compiled from
  `3e1d0a11` and passed actual launcher/compiled-browser verification in an
  extracted path containing spaces. Windows automatic RUN detection, missing
  Node rejection, invalid-folder rejection, Mac host-IP prompt under Windows
  Bash, both local URLs/report redirects, all22 offered maps, original Options
  and tactical-audio smoke checks passed. The first smoke driver failed to close
  Armory; its reviewed correction uses the already-passing held-input sequence.
  The compiled package was unchanged for the passing rerun. No npm/build is
  needed after extraction. Physical PC/Mac, observed OS browser auto-opening and
  original-running comparison are not claimed.

### Independently checked original-data limitations

The final data gate's80 skips are49 capture/reference comparisons,12 card/persona
fixtures,7 ELF/decomp checks,8 FMV prerequisites/reference checks,1 explicitly
opt-in PSS_ALL scan, and3 traversal served-map path-resolution skips. The latter
maps exist in the prepared cache; the supplied legacy fixture variable redirects
that test's lookup to another path. Five of the ELF checks similarly use a
desktop/root game/disc resolver that ignores the supplied ISO/ELF variables.
These are unresolved test prerequisites/path mappings, not proof of absent ISO
assets. A focused traversal run with the correct served path passed45/45 with
zero skips, including the three Enowapi/Shadow Falls/Fish Hook cases. This is a
separate overlapping run; it does not rewrite the gate's80 skips or add45 to its
total. Private evidence:completion-traversal-correct-path-20261008.json/.log.

The earlier full data gate's 115 skips consisted of 49 capture/reference comparisons,
12 card/persona fixture checks, 7 ELF/decomp checks, 8 FMV prerequisite/reference
checks, one explicitly opt-in scan of all 69 PSS tracks, and 38 legacy served-tree
checks. Source predicates were inspected; an opt-in is not a missing prerequisite.
After safely preparing the ignored served tree from the verified ISO copy, the
15 legacy suites passed all 237 tests with zero skips, including those 38 cases.
The gate's original record is unchanged; overlapping totals are not added together.

The earlier no-data profile ran before that local preparation. Its 478 skips include
disc-backed scene, audio, UI, server and viewer checks plus the absent references.
Its total test count is 105 lower because three disc-generated suites collapse
without data; subtracting skip counts does not compare identical test sets.

These are independently reviewed disc/source **readings** (2026-10-08), not
original-running proof or physical character-variant tests. Sources are
`RUN/READERC.ZAR :: character.rdr/orders.rdr/missionlist.rdr`, each map's
`READERM.ZAR :: chartype.rdr`, `RUN/SOUNDRDR.ZAR :: sounds.rdr`, and
`RUN/SOUNDS/VAGSTORE.ZAR`. Existing research301/302 records the resolver rules.

| Case | Evidence and current handling |
|---|---|
| MP71/72/73, fourth SEAL, first vocal variant | `mp_seal6` and its base lack `CMD_MP_TAUNT1`. `PS_0148.vag` exists but does not establish a mapping. Selection posts `ORIGINAL TAUNT RECORD UNRESOLVED`; no substitute. Other variants remain separate. Native fallback is unresolved. |
| Defuse group `^PT_0263` | Group requests `^*PT_0263A/B`; B has a MULTI entry but no `PT_0263B.vag` member in VAGSTORE. Incomplete group is unavailable. Legal affected selections: MP1 terrorist characters2/4 and MP83 character2. Other affected maps disallow Defuse. |
| Protect `^PT_0242` | A/B VAGs exist, but requested alias/group is absent. Affected character4 on MP61/62/64 also lacks mode permission; mode notice takes priority. No invented A/B group. |
| Loading localization warning | `UILDLOC.ZAR` exists identically in all22 map archives, SHA256 `fc228d80d01932a5b756bdac881b58ea570f10f01c530a0659eb005880f9c6d2`. `withMenuArt` invokes `loadLocService` without map context. This is not missing Options artwork or a missing ISO file. |

Existing cross-map footstep/impact/casing borrowing is a real audio-parity gap.
Remote throw-pose effort/grunt timing, remaining traversal callbacks, moving voice
tracking and original mix comparison
remain unresolved. Supported feature checks do not close those broader differences.
Options dependencies, full C4 behavior and other explicitly unsupported systems
remain as described in research300-304; no new workaround is invented here.

Exchange/taunt death fixtures use checked dry original map coordinates while
preserving health, ammunition, kit, character, team and yaw. Shadow Falls may
require an original opposite-side coordinate as test ground, not a live spawn
rule. Earlier accepted throws reproduced water-geometry blast occlusion in the
port. These passes do not resolve original water-blast behavior or establish
coverage at every natural spawn. Locked C4 is retained and invalid selection is
rejected; full C4 gameplay is still unsupported. The position check normalizes
the observed mover and expected placement to exact network float32 precision.

### Earlier push checkpoint (historical)

- 03:28Z addendum: Abandoned taunts PASS182.656 s, Options FAIL413.981 s at the
  same communication-submenu depth assertion (expected1, received0); zero skipped/
  flaky. Cause remains unresolved. Abandoned victory is running. Earlier snapshots
  below are retained; repeated failure is not silently treated as a pass or retry.

- All 22 maps passed the recorded disc-backed server lifecycle simulation. Their
  unresolved asset/audio diagnostics are retained; none has a complete parity pass.
- Blizzard has passes for all five rendered feature scenarios after test-host and
  join-setup corrections. Abandoned's five earlier passes remain historical evidence.
- The next serial sweep is running from `4fb3fd81`, with test/runtime source clean,
  across the other 21 maps (including an Abandoned regression). Current incremental
  results live in `.local-history/all-map-independent-clients-20261008/summary.json`.
  Unfinished scenarios are not passes; see each case's log and JSON for failures.
- At 03:20Z, Frostfire results: exchange PASS363.749 s, taunts PASS150.528 s,
  Options FAIL334.503 s, victory PASS158.843 s, grenade audio PASS169.966 s; zero
  skipped/flaky. Options failed at the communication-submenu depth assertion
  (expected1, received0), after editing settings/messages. Cause unresolved; no
  claim that the earlier Armory setup failure recurred. Abandoned exchange rerun
  PASS391.564 s; taunts running, other cases queued. All failures are retained.
- Physical PC/Mac controller/listening checks, live map changes, broader per-character
  and per-weapon coverage, unresolved original evidence and the existing RED gate
  remain outstanding. The historical records below are not overwritten by reruns.

## What the first sweep establishes

All 22 multiplayer archives were discovered in the supplied ISO. All passed the
existing nine-check, two-client **in-memory server simulation** on their real hulls:
connection, teams, spawns, movement, gun damage, kills, grenade damage, death selection
and round reset. This does not establish rendered feature coverage or physical input.

Every map decoded its kit/valve data and victory clips/emblem without a reported gap.
Every map also has outstanding reader/audio diagnostics, so **none receives an overall
asset-ready pass**. The inventory intentionally exits nonzero for these gaps.

| Archive | Map | Server lifecycle | Asset readiness |
|---|---|---|---|
| MP1 | Blizzard | passed | gaps |
| MP2 | Frostfire | passed | gaps |
| MP5 | Abandoned | passed | gaps |
| MP6 | Desert Glory | passed | gaps |
| MP7 | Night Stalker | passed | gaps |
| MP8 | Rat's Nest | passed | gaps |
| MP9 | Bitter Jungle | passed | gaps |
| MP10 | Blood Lake | passed | gaps |
| MP11 | Death Trap | passed | gaps |
| MP12 | The Ruins | passed | gaps |
| MP51 | Vigilance | passed | gaps |
| MP52 | The Mixer | passed | gaps |
| MP53 | Foxhunt | passed | gaps |
| MP61 | Sujo | passed | gaps |
| MP62 | Enowapi | passed | gaps |
| MP64 | Shadow Falls | passed | gaps |
| MP71 | Fish Hook | passed | gaps |
| MP72 | Crossroads | passed | gaps |
| MP73 | Sandstorm | passed | gaps |
| MP81 | Chain Reaction | passed | gaps |
| MP82 | Guidance | passed | gaps |
| MP83 | Requiem | passed | gaps |

## Findings to investigate, not silently repair

Continuation source checks (2026-10-08 UTC): the Armory diagnostic is now traced to
an omitted original UI library, not an absent texture. `RUN/UI/UI.ZED/assetlibs`
names `//ui/junkyard`; `RUN/UI/JUNK_TXR.ZED/textures/null_xmas.bmp/texdat` decodes
without a palette or diagnostic. See research 95's correction and its regression
test. The original failing test is retained privately as `armory-junk-red.log`.

The ISO also contains `UILDLOC.ZAR` inside **all 22** multiplayer ZDBs. Every copy
has SHA-256 `fc228d80d01932a5b756bdac881b58ea570f10f01c530a0659eb005880f9c6d2`.
The shared front-end reader calls `loadLocService` without a map; that function
explicitly emits “in a map archive; none given.” Classify this as omitted loading
screen context, not missing Options artwork. The inventory retains its raw warning.
These disc/source readings were independently reread on 2026-10-08; they are not
original-runtime proof.
Private metadata only: `.local-history/iso-gap-check.json`.

- Initial sweep, all maps: Armory reader reported `UI_TXR: no null_xmas.bmp`.
  The continuation resolved this through the original UI JUNK library. A fresh
  22-map inventory has zero Armory diagnostics; no replacement texture was added.
- Shared Options: reader reports `RUN/LOCALE/STATES/UILDLOC.ZAR (in a map archive;
  none given)`. The shared front-end read lacks map context; this does **not** establish
  that the ISO lacks that asset. Resolve the reader/context question before changing art.
- Existing sound loading reports missing registrations and cross-map borrowed bank
  sounds (8-35 audio diagnostics per map). These predate the validation changes. The
  inventory retains the names and bank paths; it does not approve substitutions or
  prove that each diagnostic has an exercised gameplay trigger.
- `^*PT_0263B` is missing from the decoded tactical stream set for terrorist character
  2 on MP1/MP2/MP81/MP82/MP83, and character 4 on MP1.
- `^PT_0242` is missing for terrorist character 4 on MP61/MP62/MP64.
- SEAL character 4's first vocal taunt has an unmapped original entry on MP71/MP72/MP73.
  An unmapped table entry is distinct from a file missing from the disc.

The named missing group/mapping and localization findings were independently
reread on 2026-10-08 (details above); they are **readings**, not measurements of the
original running. The broader unresolved audio inventory is not thereby proven. Existing
behavior evidence and unresolved parity questions remain in research 300-304.

## Evidence boundaries

Latest ISO/server inventory: `.local-history/all-maps-completion-inventory-20261008/`,
at `e02f7f77`, source unmodified:22 server lifecycle passes, zero decoder/server
failures, all22 maps retaining asset gaps. The Armory-library warning and the
three breach-group missing-stream warnings are resolved; no new diagnostics.
Exit1 correctly preserves the remaining parity gaps. This inventory deliberately
does not import browser results.

Historical ISO/server inventory: `.local-history/all-maps-validation-final-20261007/`.
Completed at 23:08:46Z, head `a83aab84`, `sourceModified: true`: 22 maps, 22 with gaps,
zero decoder/server failures, 22 server lifecycle passes. Exit 1 correctly represents
the unresolved gaps. Browser/physical cells intentionally remain `not-run` in that
inventory; the separately executed browser pilot is recorded below.

## Rendered pilot: Abandoned (MP5)

Serial Chromium/SwiftShader run with simulated controllers and local ISO loading.
Each scenario asserted that the actual loaded audio archive was MP5. Three passed,
two failed; zero skipped/flaky. No retries or weakened assertions. Raw private evidence:
`.local-history/all-map-browser-pilot-20261007/`, with separate JSON/log/artifacts per
feature and a `summary.json`. The other 21 maps' rendered scenarios were not run here.

| Scenario | Result | Scope or failure |
|---|---|---|
| Armory/full-kit Weapon Exchange | failed | Second Armory setup expected M14 ID 60, received ID 33; subsequent exchange lifecycle not reached |
| Taunts/custom editor | passed | Two clients, original vocal/recipient checks, save/cancel/reload and input ownership |
| Options/teammate communication | passed | Three clients, actual controls/persistence and native character voice-group assertions |
| Victory dances | passed | Both teams, local/remote clips, NoFire, no held repeat and round reset |
| Grenade audio | failed | A teammate-warning assertion timed out after release-count checks; full eight-throw sequence not established |

The failed Armory capture reported about 5.9 display FPS under software rendering.
That supports investigating input/round-start timing, but does not establish the
cause or excuse the failure. Do not label it a proven M14 gameplay regression without
triage. The audio failure did not attach its completed-throw list or current item;
the exact active throw cannot be recovered reliably from that report. It is not a
passing audio test and does not prove an asset is absent.

After that failure, the audio scenario gained an always-attached progress record
(current team/item/stage, completed cases, client audio diagnostics). Assertions and
gameplay remain unchanged. This diagnostic addition was not browser-rerun in this
iteration; the final no-data gate checks the final source. No eight-throw completion
or specific recorded warning is claimed from the failed pilot.

## Repository checks

### Earlier continuation gates (historical, 2026-10-08 UTC)

Both full gates remain **RED**. With local disc data: 7,716 passed, 20 failed,
137 skipped. With external data paths cleared: 7,282 passed, 11 failed, 475 skipped.
Each also passed 240 shared tests, typecheck, build and 428 guard tests. Failure-name
comparison found no newly failing tests relative to the recorded baseline. Regenerating
the research corpus after the Armory note corrected two stale-index failures in the
later no-data run. These totals are separate runs, never additive.

Records: `logs/gate/2026-10-08T0102Z-c75ba8dc14c1.txt` and
`logs/gate/2026-10-08T0111Z-c75ba8dc14c1-no-data.txt`. Source was modified at head
`8493625d`; no browser run is included in these
gate counts. Whole-history leak scanning still reports two earlier personal-name
findings; current-tree scan has zero hits. Missing external scanners, unavailable
gitleaks and unauthenticated issue auditing are not passes.

Fresh inventory `.local-history/all-maps-post-fix-20261008/`: all 22 Armory reads
ready and all 22 server lifecycle checks passed; zero decoder/server failures.
All 22 retain overall asset-gap status for the documented audio/loading-context
diagnostics. All-map rendered playback and physical listening are separate checks.

### Continuation: Abandoned failures resolved

The original pilot above is retained. Subsequent runs at head `8493625d` with
explicitly modified source established:

- **Grenade audio passed**, 393.987 seconds, zero skipped/flaky. Four rendered
  Chromium clients, eight throws: M67, HE, AN-M8 and Mark141 on each team. Exact
  original character warning-group members, teammate-only delivery, release/effect
  callbacks and duplicate counts were checked. MP5's `PO_0044B` was valid original
  playback; the old assertion only recognized PS/PT prefixes. No audio runtime change.
  Evidence: `.local-history/map-fixes-mp5-green-attempt/MP5-audio/`.
- **Armory/full-kit Weapon Exchange passed**, 414.377 seconds, zero skipped/flaky.
  Two rendered Chromium clients plus two ordinary protocol teammate companions.
  Both teams confirmed M14 through Armory and exchanged all five slots after death;
  server acceptance, deferred equipment, next spawn, peer kit/model ID, local model,
  HUD name/icon, M14 and sidearm fire/reload cues, quantities/2X ammo, cancellation,
  edge-only browsing and held fire/throw prevention were checked.
  Evidence: `.local-history/map-fixes-mp5-active-round/`.
- The WX fixture now preselects the second client's SEAL M14 in the real offline
  Armory, preserves online acceptance, and waits for the real active round before
  death. Earlier captures crossed the first-round countdown (waiting-room players
  were already alive). Companions keep a faction alive while its tested player is
  dead; their normal look commands prevent idle timeout. No round rule or kit valve
  was bypassed. Every intervening failed setup remains in private logs.
- **Focused source/disc tests: 45 passed, 2 skipped.** Includes all 22 maps' grenade
  warning mappings for both teams and all four characters, original three-map
  grenade-effect decode checks, and the Armory/extraction regression. This is not
  rendered playback on all 22 maps. Launcher unit tests: **2 passed**.
- The UI texture correction passed an independent ISO reread (archive order,
  hash, direct-colour metadata); the extracted test archive hash also matches the ISO.
  No physical controller/listening or original-running visual comparison was performed.

The full gate records below describe the earlier baseline; the latest continuation
gates are recorded above without overwriting those failures.

### Expanded sweep and compiled candidate

The remaining 21-map, five-scenario rendered sweep started at 01:20Z on 2026-10-08.
Private incremental results: `.local-history/all-map-rendered-continuation-20261008/`.
At this checkpoint MP1/Blizzard Weapon Exchange **failed**: the second offline
client's loading hold did not release within 120 seconds. No exchange lifecycle was
reached. A disc/Armory state trace separately finds M14 legal/reachable on both teams;
this is not evidence of a prohibited weapon or a gameplay M14 regression. Additional
failure diagnostics now capture loading, shader warm-up and Armory state, without
changing readiness assertions. MP1 taunts subsequently passed in 256.343 seconds, zero skipped/flaky.
At 01:28Z MP1 settings was running. The remaining cases are running or not yet run;
the incremental report, not the offered map list, determines coverage.

The compiled all-map candidate passed smoke checks from an extracted path with
spaces: actual Windows CMD launcher, automatic OneDrive RUN detection, missing Node
report, invalid RUN refusal before startup, Mac command under Windows Bash and host
IP prompt, browser opening enabled, both local report-overlay redirects, all 22 map
choices, ISO/Armory load, original Options editor/styles and a played tactical cue.
Zero browser page errors. This smoke used Frostfire; it is not 22-map rendered parity.
Physical Mac/Finder, controllers and listening remain untested. Private evidence:
`.local-history/all-map-easy-launch-wrapper-result.json`.

The artifact-only leak scan passed with exact, individually verified exclusions for
unchanged upstream license contacts, bundled dependency WebAssembly, WebGL identifiers
and original UI identifiers in the research note. Global leak policy is unchanged;
this does not repair the whole-history gate findings. No original game media is
included. The source snapshot is for review; rebuilding requires a Git checkout.

With-data gate: **RED**. Typecheck and build passed; SOCOM Legacy had 7,693 passed,
20 failed and 137 skipped; shared had 240 passed; guard tests passed (428 tests).
The full record is in [the plan](plans/2026-10-08-all-map-validation.md). These are suite results,
not 7,693 original-game parity measurements. The gate did not run browser tests.

Within that run, existing focused suites passed: all-map server lifecycle 22 tests,
Weapon Exchange disc checks 66, original Options 7, taunt data 2, victory disc 1,
and the new selector/report tests 2. These counts are included above, not additive.

The 20 failures span corpus (3), loader screens (1), network configuration (2),
placeholder-ledger documentation (1), unplaced dialogs (1), ISO source (1), sound
decoding parity (1), text disc (1), audio parity (1), HUD parity (1), impacts parity (1),
remote aim (1), remote death (4), and remote footsteps (1). Some require missing
extracted/decompilation prerequisites; others are assertion mismatches. They are not
resolved or suppressed here, and a clean-baseline rerun has not isolated every cause.

Leak-check tree scanning found no hits, but whole-history scanning found two existing
personal-name hits in old playtest/design documents. The full leak check failed;
history is unchanged. GitHub issues audit was not run (not logged in); gitleaks was
not run (binary absent); external sibling-project scanners were unavailable.

The first `--no-data` gate still had `S2U_TEST_FIXTURES` available (the gate removes
only three newer disc variables). It completed with 7,334 passed, 15 failed and 417
skipped, plus 240 shared passes. That is **not** a clean no-local-data profile. Its
record is retained; the corrected invocation clears both the legacy fixture and
parity variables. An attempted stop refused because the process had already ended;
no unrelated process was stopped.

Corrected external-data-withheld gate: **RED**. Typecheck/build/428 guard tests passed;
SOCOM Legacy had 7,285 passed, 13 failed and 468 skipped; shared had 240 passed, zero failed
or skipped. Normal repository fixtures remain available. The remaining test failures
are corpus (3), placeholder-ledger documentation (1), audio/HUD/impacts parity (3),
remote aim (1), remote death (4), and remote footsteps (1). Whole-history leak checking
again found the same two old hits; issues audit and gitleaks remained not run. This is
not a merge-ready green gate. No original-running comparison was applicable to the
test-instrument changes; physical playtesting and the remaining browser matrix are owed.

Initial baseline independent source/evidence review: **PASS WITH FINDINGS** for this validation scope,
not approval of unresolved gameplay/parity failures. Final preservation check: all four
preexisting unfinished-file hashes and both working ZIP hashes unchanged. No package
folder was modified; no push, merge or replacement package was performed in that
baseline. The continuation builds a separate all-map candidate, preserving those
working packages, and received another **PASS WITH FINDINGS** source review.

The first inventory attempt failed because Node's file Blob reported the supplied
image's size modulo 2^32. The tool now uses the existing disc-test range-reader approach.
The first completed report also misreported dirty source due to a Git working-directory
mistake; it is retained privately and superseded by the final run, not edited into a pass.

Physical Windows/Mac controllers, listening and original-running comparisons have not
been performed on this branch. Existing package playtests remain historical evidence.
POSIX dispatcher interruption cleanup was source-reviewed, not tested on a Mac.

Use [the testing guide](all-map-validation.md) for commands, per-map evidence and the
two-computer checklist. Run the remaining rendered scenarios in bounded serial batches;
do not infer results for unvisited maps from shared code or earlier three-map tests.

## Completion v2 candidate

Use `SOCOM-All-Maps-Validation-v2-Easy-Launch-2026-10-08.zip`, extracted as
`SOCOM All Maps Validation v2 Test`. Windows: `HOST-WINDOWS.cmd`. Mac:
`JOIN-MAC.command`, then the Windows host IP. The existing packages are retained.

The v2 compiled source is `3e1d0a11`; BUILD-INFO truthfully records dirty source
because unfinished documents and completion reports were present. Runtime/test
source was clean. The separate private extraction passed the real wrappers and
compiled-browser smoke test. The final Desktop archive uses identical compiled
runtime/launcher files; final reports are added afterward and all archive members
are hashed. No original game assets or developer node_modules are included.
The Mac command carries0755 mode. OS-default browser opening was enabled but
not physically observed; Windows Bash is not Mac/Finder or physical pad testing.
See the per-map matrix, manager handoff and physical checklist in this package.

## Earlier delivered candidate (preserved)

`SOCOM-All-Maps-Validation-Easy-Launch-2026-10-08.zip` and extracted
`SOCOM All Maps Validation Test` were created separately on the local Desktop.
ZIP SHA-256: `14102ffb6b93085bd62144e66534f4e32b83a8d89cc518f1eb341b85769f3a21`.
Manifest hashes verified all828 files; all35 compiled runtime files match the smoke-tested
extraction. Final artifact scan zero hits; Mac command mode0755. Reviewed source
commit `b0756aaa`; build metadata preserves the earlier dirty compilation stamp.
Open the extracted folder and run `HOST-WINDOWS.cmd`; Mac joiners run
`JOIN-MAC.command` from their copy. Read its checklist and limitations before testing.
The expanded rendered sweep remains incomplete at delivery. No push or merge.

## Loading triage continuation (2026-10-08 UTC)

The first expanded sweep was stopped after MP1 completed: taunts passed; Weapon
Exchange, Options, victory and audio failed during loading, before their feature
checks. MP2 exchange was interrupted, not passed. Remaining maps were not run.
The private summary retains completed failures plus an explicit interruption record.

A diagnostic MP1 rerun captured second-client world shader preparation finishing
at158.369 seconds, with no missing loading assets and zero pending links at capture.
The120-second readiness assertion failed; it was not lengthened or bypassed. Default
headless Chromium also uses SwiftShader on this host. Pausing offline pages was an
incomplete experiment, not an adopted fix. Two independent active browser processes
loaded MP1 in22.357 and55.348 seconds with the same rendering options.

The five feature scenarios now use independent browser processes to represent the
clients' separate computers. This is a test-host adaptation: no runtime/gameplay
change, no page freezing, no relaxed assertions or timeouts. Four browser-lifetime
unit tests and workspace typecheck pass. Independent source review passed; the
five-scenario MP1 rerun is recorded separately under
`.local-history/blizzard-independent-clients-20261008/` and is incomplete until its
individual records finish. Physical testing remains separate. Existing Desktop
packages remain unchanged because this correction affects only test execution.

The independent-client MP1 batch completed with four passes and one failure:

| Scenario | Result | Duration (seconds) |
|---|---|---|
| Weapon Exchange | passed | 422.444 |
| Taunts | passed | 210.229 |
| Options | failed during Armory setup | 198.241 |
| Victory dances | passed | 208.407 |
| Grenade audio | passed | 269.822 |

Each case had one expected pass or one unexpected failure, with zero skipped/flaky.
The batch exit was 1. Both teams' full-kit/M14 next-spawn, model/HUD/audio,
quantities, peer synchronization and held-input assertions completed in exchange,
using two rendered browser processes plus two protocol companions. Audio exercised
all eight team/item combinations of M67, HE, AN-M8 and Mark 141 with four rendered
clients, including release, team-only warnings, effects and duplicate checks. These
are automated instrumentation checks, not physical listening or original-game comparisons.

The initial Options failure did not identify which client's Armory closed. A separate
diagnostic rerun (214.135 seconds, failed) showed the third client joining after the
round had started, then failing the alive prerequisite. The fixture had processed
each client's offline and online Armory consecutively. It now finishes all offline
menus first, then joins and confirms all three clients concurrently. Existing Armory
assertions, game timers and gameplay rules are unchanged; a new check also requires
every client to be connected and no longer waiting for a spawn. Team roles still
come from actual server assignments. Independent source review passed. The focused
rerun at `.local-history/blizzard-settings-concurrent-join-20261008/` **passed** in
402.042 seconds: one expected, zero failed/skipped/flaky, exit 0. Save/cancel,
local-only settings, persistence after reload, original team vocals, teammate text
delivery and input safety completed. All earlier failures remain in their reports.

Blizzard now has a completed pass for each of the five existing feature scenarios,
across the batch and focused correction. This is bounded scenario coverage, not every
weapon/character combination or complete audio parity. The remaining maps still need
the updated rendered sweep; Abandoned's earlier passes are historical. Physical
PC/Mac, live map changes and original-running comparisons remain untested here.
