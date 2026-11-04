# 257 -- The shared effects on the menu path: footprints, the fall message, the water

Written 2026-10-08 for seat C's wave 3 of web sprint PARITY-1 ([the plan](../plans/2026-10-08-web-sprint-parity.md), its
rows PAR-8, PAR-9 and PAR-10, rulings PAR.R3 and PAR.R6, the gates section's row P01) on `agent/parc3`, cut from
`agent/parity` at 30ba6d1b (wave 1 and seat C's wave 2 merged). The page-wiring audit's rows A.8, A.9 and A.10
(research 230, its anchors pinned to an older base and re-located here on 30ba6d1b) and research 250 s9 found three
things `/testroom`'s `main.ts` does that the menu-launched match (`matchMount.ts`) does not, or does differently: the
footprints on sand and snow, the fall-death message, and the water's splash and wading ripples. Each row writes the
shared part both pages are to call, in a non-HOT module (`packages/viewer/src/matchEffects.ts`, the shape of research
255's `matchRenderer.ts` and `mountCharShadow`), and hands the exact wiring hunks to wave 4's integrator (PAR.R3:
`main.ts` and `matchMount.ts` are not this seat's to write). No game, emulator, browser or server was run.

**Confidence.** What the original does is the decompilation's (`FUN_<addr>`, `D:L<line>` of
`socom2_game.elf.decomp.c`) and its notes' (research 86, 87, 89, 91, 180), at their levels (**reading**). That the
shared parts are `main.ts`'s own lines, and that the decompilation says what each section cites, is **reading, pending
review**: a reviewer re-reads each section against `main.ts` at 30ba6d1b and the cited lines. Nothing here is proven.

## 0. Answers

| # | finding | where |
|---|---|---|
| R257.1 | **The footprints are one part**, `mountEffects` (`./matchEffects`): `main.ts:893-904`'s print for the own body (`playEvent`) and, beside the step's sound, the others' (`footfall`, in `sound.remoteStep`'s place on `RemotePlayers`' hook). The others' print is new on both pages: `FUN_005a3570` calls the step's sound and the print side by side for every actor its gate passes, and the hook now carries the body's facing | s1, s4.1 |
| R257.2 | **The fall-death message already reaches the menu's match, once**: it is a kill line (`FUN_00547860`), the room decides the fall's death (`room.ts` `fallDamage`) and `NetPage` -- both pages' -- posts it. The defect was `/testroom`'s: `main.ts:892` posted it again off the page's own landing of the death class, so a fall death in a `/testroom` match showed two lines. `fallDeathLine` posts the landing's line only with no room live -- the match client not open (the free walk, or a socket the server or the network closed) -- and the menu page needs no line | s2, s4.2 |
| R257.3 | **The water is the traversal's on both pages**: `traversal.setEffects(firearm.effects)` (research 250 s9's line), so the fall's splash and the wading ripples come from `TraversalPage`'s keeper (research 86 s5.4); `/testroom`'s second keeper -- the `s2u:traversal` listener's `effects.splash` and the frame's `effects.waterFrame` -- retires in the hunk. **Not** `effects.waterFrame` on both pages as the brief has it: with the keeper handed effects it would play every ripple twice (`main.ts:611`'s own warning) | s3, s4.3 |
| R257.4 | **One reset**: `TraversalPage.clearRipples()` at both pages' round clear, and `setEffects` stops what the old effects ran -- the ripples loop until stopped; what the original's round turn does to them is unread (`RIPPLES_AT_ROUND_CLEAR_READING`) | s3.3, s6 |
| R257.5 | **The effects' stats report what runs, whoever keeps it**: `water.ripples` is the ripple runs alive, `water.splashes` the splash runs started -- the hooks' `effects().water` (and `e2e/effects.spec.ts`) read the traversal's keeper as they read the old one | s3.3 |

## 1. The footprints (PAR-8)

### 1.1 The original

`FUN_005a3570` (D:L460268-460378) is each actor's footfall: it runs in the actor update with no locality test
(`FUN_005506a0`, D:L417909), under the actor's `+0xe0` bit 2 (D:L460295) -- set on the viewer's own actor and on at most
three others within 500 units (`FUN_00552850`; `./remotePlayers` `FOOTFALL_CAP_READING`, research 179 s11.20, 219 s4).
On the left foot's step it calls the step's sound `FUN_005a39b0` and the footprint `FUN_005a3280` side by side, both
skipped prone (D:L460343-460346); on the right foot's, the sound, then the print unless prone (D:L460372-460375).
`FUN_005a3280` (D:L460188-460212) prints `decals.rdr`'s `FOOTSTEP_DECALS` for the ground's material through
`FUN_003139e0`, oriented by the actor's node (`+0x28`) -- research 89's footfalls: SAND `stamp_footprint01.tif`, SNOW
`stamp_footprint_snow.tif`, 3.5 across, along the SEAL's forward, in the temporary pool (`Effects.footfall`,
`FOOTPRINT_SIZE`, `MAX_FOOTPRINTS`: existing readings, unchanged).

So a print goes wherever a step is heard: the own body's and the three nearest others'.

### 1.2 The pages as they were (30ba6d1b)

- `/testroom`: `main.ts:893-904` prints the own body's footfall (`play.onEvent`: the floor under the foot's point by
  `probeFloor`, its polygon's normal turned up, its material, the forward from the snapshot's yaw, prone passed on);
  `main.ts:790` hands `RemotePlayers` `sound.remoteStep` -- the others' steps are heard and never printed.
- The menu's match: `matchMount.ts:268` hands `RemotePlayers` `sound.remoteStep` and `matchMount.ts:328` the own body's
  events to `sound.playEvent` alone -- no print at all. Its round clear (`matchMount.ts:504`,
  `firearm.effects.clearFootprints()`) wiped a pool nothing filled.

### 1.3 The part

`mountEffects({ effects, walk, sound })` (`./matchEffects`):

| call | the source | the part |
|---|---|---|
| the own body's print | `main.ts:893-904` line for line | `playEvent(e)`, through `footprintAt` |
| the others' step and print | `main.ts:790` / `matchMount.ts:268` (`sound.remoteStep`), plus `FUN_005a3570`'s print beside it | `footfall(id, step, feet, yaw)`: `sound.remoteStep(...)` once, then the print at `step.at` along `yaw`, prone (`step.stance === 2`) passed on |
| the print | `main.ts:898-903` | `footprintAt(effects, grid, at, yaw, prone)` |

The others' facing: `RemoteStepHook` (`./remotePlayers`) gains a fourth argument, the body's yaw (degrees, the
replicated mover's `BodyState.yaw` through `snapshotOf`), passed by `RemotePlayers` with each step; optional in the
type, so a caller of the sound alone (`test/matchSound.test.ts`) is unchanged, and a step without one is heard and not
printed. `remotePlayers.ts` is not on PAR.R3's HOT list; the change is additive (the hook's existing tests pass
unchanged).

The round's clear needs no new line: both pages already wipe the pool at a round's start (`matchMount.ts:504`
`roundClear`; `main.ts:361` `clearDecals` through the ARMORY's glue) -- CMPExitState `FUN_00223970` L76084 ->
`FUN_0031c880` -> `FUN_003bf050(0x4b5030)` L219059 (`Effects.clearFootprints`' own citation).

**Tests** (`test/matchEffects.test.ts`): the own body's print (floor height, material, normal up, forward), its gates
(the foot's point else the feet, prone passed on, not walking / no grid / off the floor: none), the others' step heard
once and printed along the facing, the crawl's right foot heard with prone passed, no facing no print; on the game's
data (`RUN/MP2.ZDB`, fixture) a real `Effects` leaves two decals on sand, none on metal, none after `clearFootprints`.
`test/remoteFootsteps.test.ts`: the hook gets the body's yaw.

## 2. The fall-death message (PAR-9)

### 2.1 The original

"%s falls to their death" (0x65c440) is one of the kill lines: `FUN_00547860` posts it when the death's cause is 0xfd
(D:L412879-412880; research 91 s10, research 87 s14: colour 0, the main message window). The fall's death is
`FUN_005ac1f0`'s (D:L464866-464960, research 151): every part loses `max x f` and, the actor dead, its killer is set to
itself and the cause to 0xfd (D:L464955-464959). The message is the death's, once, never the landing's.

### 2.2 The pages as they were (30ba6d1b)

- **Both pages, in a match**: the room is every player's console (`room.ts` `fallDamage`, 2021-2049): a landing that
  kills sends `kill` with `how: 'fall'` (cause `DEATH_CAUSE.FALL`), and `NetPage` posts
  `killLine('fall', ...)` -- "<victim> falls to their death" (`netPage.ts:1239`, `killLine` at 348-349). `NetPage` is the
  match's on both pages (`matchMount.ts:524`, its deps through `matchNetDeps`), so the menu's match already showed it, once,
  for its own fall and for another's.
- **`/testroom` beside it**: `main.ts:892` posts the same text off the page's own landing of the death class
  (`play.onEvent`, `e.kind === 'land' && e.cls === 3`) -- research 87 s14's line for the viewer's lone SEAL, written
  before the room told anyone of a fall's death (`room.ts`'s note: "until 2026-10-03 the room applied the damage and
  told no one"). Class 3 is the contact speed at or over the death speed (`landingClass`, `mover.ts:863`), the same 237.5
  units a second at which `fallDamageFraction` (`net/damage.ts:165`) is 1 and `applyFall` empties every part: in a match
  every such landing is also the room's fall death, so the line came twice. A knock's landing (x 1.2) or a wounded
  SEAL's lighter fall that kills is the room's line alone, as it should be.
- **No room** (`/testroom`'s `&nomatch` free walk, `main.ts`'s `net` null): no death is decided; the landing's line is
  the only one, and the SEAL walks on (research 87 s14).

The audit's premise that the menu match shows nothing is not borne out (its probe was written against `main.ts`'s line);
the row's acceptance -- "both paths show the existing fall-death message exactly once" -- needed `/testroom`'s second
line gone.

### 2.3 The part

`fallDeathLine({ hud, net })` (`./matchEffects`): `main.ts:892`'s listener, its text through `killLine('fall', ...)`
(one string for both posters), posting only while no room is live -- `net()?.client.state` is not `'open'`
(`NetClient.state`, `net/client.ts:189-195`; `NetPage.client`, `netPage.ts:464`). A `NetPage` is not a live room: a socket
the server or the network closed sets the client `'closed'` (`net/client.ts:243-246`) and gives the walk back unlocked
(`NetClient.release`, `net/client.ts:316-319`) while `/testroom`'s `net` stays set and retries (`main.ts:1758`) -- a
free walk again, which no room hears, so the landing's line is the only one (the PAR-9 review's finding: the first
cut keyed on `net !== null` and posted nothing there); so is a client still connecting or refused. `/testroom` mounts it
with `net: () => net` (s4.2); the menu page has no room-less walk worth a line (its walk starts with the match it was launched into) and
mounts nothing: its line is `NetPage`'s, unchanged. `DEFAULT_PLAYER`'s import stays in `main.ts` after s4.2 (unused;
`tsc` has no `noUnusedLocals`): removing it would edit the line research 255 s5.1's hunk keeps as context, so the
integrator drops it after both.

**Tests** (`test/matchEffects.test.ts`, no data; `NetPage` on a fake socket as `test/netPageRound.test.ts` drives it):
a fall death in a match posts one line (the RED: two, the landing's and the room's); the menu's line is the room's, once
for its own fall and once for another's; with no room the landing of the death class posts the line once, with the
HUD's name or `DEFAULT_PLAYER`, and nothing for any other landing or event; a room that was live and then closed (the
`NetPage` kept, its socket closed: the client `'closed'`) posts the line once.

## 3. The water: the splash and the wading ripples (PAR-10)

### 3.1 The original

`FUN_005b52b0` (D:L469808-469921) runs on the SEAL's ground probe over water (research 89, "Water"; research 86 s5): it
stores the water line over the feet (`actor+0xf88`), copies the water's point into the node the ripples ride
(`+0x1380`, D:L469858-469860), and by the speed class (`FUN_0058a820`) and the water line against the body's box: across
the body, the big ripple (`DAT_0044d520[class]`, kept in `+0x1370`), the small one stopped; up to 10 over the top, the
small one (`DAT_0044d530[class]`, `+0x136c`), the big one stopped; a new one only when none runs or the last has ended
(`FUN_00270e40`); out of both bands, neither started nor stopped. The fall's splash, `seal_fall_in_water`
(`DAT_0044d540`), plays once at the water's point on the first frame in the water in the air, in the big band's branch (D:L469898-469901; research 89 cites it as 469892-469896). The
ripples loop until stopped (research 89: `WHILE`/`END_WHILE`); the actor's `+0xe1` bit 4 clear -- dead (research 180 U8)
-- stops both (D:L469904-469913).

### 3.2 The pages as they were (30ba6d1b)

Two keepers of the same function were in the tree:

- **The traversal's** (`TraversalPage`, research 86 s5.4): `Traversal.water` computes the water line, the band against
  `BODY_TOP` and the pace (`ripple()`), and emits `waterLand`; `TraversalPage.effectsFrame()` keeps one ripple a size,
  following the SEAL, a new one only when the last ended, the other size stopped on a switch, nothing stopped out of the
  bands; `emit` plays `seal_fall_in_water` at the water's point on `waterLand` -- all through the effects handed to
  `setEffects`, which neither page ever called (research 250 s9). Both pages run `traversal.effectsFrame()` each frame
  (`main.ts:1613`, `matchMount.ts:659`): with no effects, nothing.
- **The effects' own** (`Effects.waterFrame` and `splash`, research 89): `/testroom` alone, its frame's block
  (`main.ts:1583-1589`) at the drawn feet with the stature's height, and its `s2u:traversal` window listener
  (`main.ts:905-909`) splashing on `waterLand`. `main.ts:611-612` says why the traversal's was left unwired: "so they do
  not play twice". This keeper stops both loops on leaving the water, against the original's "neither started nor
  stopped" (its own bracketed reading).

So the menu's match had no splash and no ripple; `/testroom` had both, through the second keeper.

### 3.3 The one path

Research 250 s9 names it: `traversal.setEffects(firearm.effects)` on both pages, `main.ts`'s listener retired. The keeper
is then the traversal's on both pages, the frame's `traversal.effectsFrame()` (already on both) runs it, and
`/testroom`'s second keeper retires with the listener: its frame block, the listener, `main.ts:611-612`'s comment, and
the imports only they used (`TRAVERSAL_EVENT`, `TraversalEvent`, the stature's three heights). The brief's "`effects.
waterFrame(dt)` on both pages' frame" is not followed: beside a keeper handed the same effects, it plays every ripple
twice (s0 R257.3).

Three changes outside the pages, for the one path to hold:

- **`TraversalPage.setEffects`** stops the ripples the old effects ran before it forgets them (a loop forgotten runs
  on unowned), and **`clearRipples()`** stops and forgets them at a round's clear -- both pages' (`matchMount.ts`'s
  `roundClear`, `main.ts`'s `clearDecals`), RIPPLES_AT_ROUND_CLEAR_READING (s6). A new map needs none: its
  `effects.setData` resets every run, and the keeper drops the finished handles.
- **The effects' stats** (`Effects.stats().water`): `ripples` is the names of the `RIPPLES` runs alive, `splashes` the
  `seal_fall_in_water` runs started -- whoever started them (they were set by `waterFrame` and `splash` alone, so the
  traversal's keeper would have read '' and 0 in the hooks' `effects().water` and `e2e/effects.spec.ts`).
- `Effects.waterFrame` and `splash` stay, uncalled by the pages once s4.3 lands, for their tests; their retirement is
  owed (s5).

What changes on `/testroom`, read against s3.1: the ripple's place is the mover's (`Traversal.water`'s `[x, line, z]`)
rather than the drawn feet; a loop runs on where the SEAL left the water (the original's "neither started nor
stopped") rather than stopping; the splash's velocity is `[0, 0, 0]` (the keeper's) rather than `[0, -1, 0]`
(`splash`'s). Each is the traversal's reading of research 86 s5.4, now the one both pages run.

**Tests** (no data, `test/traversalPage.test.ts`): a new effects object stops the old ripple; a round's clear stops and
forgets the running ripple and the next frame starts one afresh. On the game's data (`test/matchEffects.test.ts`,
`RUN/MP2.ZDB` fixture): the firearm's `Effects` handed to a traversal over a pool -- a fall in splashes once (in
`played` and `water.splashes`), the big ripple runs (in `water.ripples`, at the pace it began with), the round's clear
stops it. `test/effects.test.ts` (24) passes with the stats' change.

## 4. The hunks for wave 4's integrator

Each set applies from the repository's root (`git apply <file>`, the text between the fences, inside the tree --
research 255's trap: outside it `core.autocrlf` writes CRLF) on top of the sets before it, on 30ba6d1b's `main.ts`
(blob a74c0eba8, research 255 s5's base too) and `matchMount.ts` (blob 66599f526). Each was tried in this worktree
before its commit -- applied, then `tsc --noEmit -p packages/viewer` (no error) and one vitest file a run with
`--maxWorkers=1` -- and reverted: nothing of it is committed by this seat. Applied after research 255 s5 and the other
seats' hunks the context may shift (`git apply -3`, or by hand: every hunk here is a few lines).

### 4.1 PAR-8: the footprints on both pages

Tried: `tsc` clean; `matchMount.test.ts` 90 passed. `main.ts`'s own print is unchanged (the same lines, moved); the
others' print is new on both pages (s1.1). `probeFloor` and `polygonNormal` leave `main.ts`'s import (no other use).

```diff
diff --git a/socomlegacy/packages/viewer/src/main.ts b/socomlegacy/packages/viewer/src/main.ts
index a74c0eba8..ea92f84d1 100644
--- a/socomlegacy/packages/viewer/src/main.ts
+++ b/socomlegacy/packages/viewer/src/main.ts
@@ -4,7 +4,7 @@ import type { MapInfo } from '@s2u/archive';
 import { sortByPopularity } from './mapOrder';
 import { allowedMultiplayerMaps, emptyPickerStatus, parseMapAllowlist } from './multiplayerMaps';
 import {
-  aiCellOf, polygonNormal, probeFloor, probeGround, selectFloor, spawnsFor,
+  aiCellOf, probeGround, selectFloor, spawnsFor,
   type Loadout, type Side, type Spawns,
 } from '@s2u/scene';
 import { FlyCamera, type Pose } from './camera';
@@ -80,6 +80,7 @@ import type { TraversalEvent } from './traversal';
 import { CROUCH_HEIGHT, PRONE_HEIGHT, STANDING_HEIGHT } from './stature';
 import { gameAudio } from './audio';
 import { mountSound } from './matchSound';
+import { mountEffects } from './matchEffects';
 import { WEAPON_CLIPS } from './weaponPose';
 import { dropModels, WorldDrops } from './drops';
 import { HostagePage } from './hostagePage';
@@ -786,8 +787,11 @@ function askIndex(from: SourceRequest): void {
 
 // MULTIPLAYER (web sprint 3): the other players and the match -- the settings' Online (owner, 2026-09-29; `./online`), or
 // the URL's `&mp` / `&server=` over it. reCOM mode joins as a player, the map viewer as a watcher (`connectNet`).
-// The others' footfalls heard at the foot (`remoteFootfall`, FUN_005a3570/FUN_005a39b0; REMOTE_STEP_STICK_READING).
-const remote = new RemotePlayers(scene, sound.remoteStep);
+// PAR-8 (research 257 s1): the shared effects (`./matchEffects`) -- the footprints beside the steps, own and others'.
+const matchEffects = mountEffects({ effects, walk, sound });
+// The others' footfalls heard at the foot (`remoteFootfall`, FUN_005a3570/FUN_005a39b0; REMOTE_STEP_STICK_READING), and
+// since PAR-8 printed there (FUN_005a3280).
+const remote = new RemotePlayers(scene, matchEffects.footfall);
 /**
  * HX-4a (`./hostagePage`, research 239 s1, s3, s7; ruling HX.R8): the hostages' part -- FOLLOW! / HOLD POSITION on the
  * hostage under the crosshair, the room's own test on the page's ray (the others' capsules, the hull's surfaces, sub-map
@@ -890,18 +894,7 @@ play.onEvent(sound.playEvent);   // the body's footfalls, clip callbacks and lan
 // The message window's lines a lone SEAL can cause (research 87 §14): a landing of the death class is the game's fall
 // to death, "%s falls to their death" (0x65c440, `FUN_00547860`) -- the viewer's SEAL walks on.
 play.onEvent((e) => { if (e.kind === 'land' && e.cls === 3) hud.postMessage(`${hud.state().model.name || DEFAULT_PLAYER} falls to their death`); });
-play.onEvent((e) => {                             // EFFECTS: the footprint on sand and snow (`FUN_005a3280`)
-  if (e.kind !== 'footfall' || walk.mode() !== 'walk') return;
-  const snap = walk.snapshot(), grid = walk.grid();
-  const at = e.position ?? snap?.feet ?? null;
-  if (!snap || !grid || !at) return;
-  const floor = probeFloor(grid, at[0], at[1], at[2]);
-  if (!floor) return;
-  const n = polygonNormal(floor.poly.points) ?? [0, 1, 0];
-  const up: [number, number, number] = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
-  const yaw = (snap.yaw * Math.PI) / 180;
-  effects.footfall([at[0], floor.y, at[2]], floor.poly.material, up, [-Math.sin(yaw), 0, -Math.cos(yaw)], snap.stance === 'prone');
-});
+play.onEvent(matchEffects.playEvent);   // EFFECTS: the footprint on sand and snow (`FUN_005a3280`; `./matchEffects`, PAR-8)
 // EFFECTS: a fall into water (`s2u:traversal`'s `waterLand`): `seal_fall_in_water` at the water line over the feet.
 globalThis.addEventListener?.(TRAVERSAL_EVENT, ((e: CustomEvent<TraversalEvent>) => {
   const feet = walk.drawnFeet();
diff --git a/socomlegacy/packages/viewer/src/matchMount.ts b/socomlegacy/packages/viewer/src/matchMount.ts
index 66599f526..0fc1642c9 100644
--- a/socomlegacy/packages/viewer/src/matchMount.ts
+++ b/socomlegacy/packages/viewer/src/matchMount.ts
@@ -32,6 +32,7 @@ import { FRONT_END_CAPABILITIES, feedCamera, liftFog, mapFog, matchSide, setRemo
 import { matchNetDeps } from './matchNet';
 import { playerLanes, type LaneParts } from './matchLanes';
 import { mountSound, silentOut, type MatchAudio } from './matchSound';
+import { mountEffects } from './matchEffects';
 import { mountThrowables } from './matchThrow';
 import { mountTaunts, type TauntsState } from './matchTaunts';
 import { mountChat, type ChatState } from './matchChat';
@@ -265,7 +266,8 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
   const hud = new Hud();
   const scoreboardKeys = new ScoreboardKeys(() => walk.mode() === 'walk');
   scoreboardKeys.bindKey(win as unknown as EventTarget);
-  const remote = new RemotePlayers(scene, (id, step, feet) => { sound.remoteStep(id, step, feet); });   // the others' footfalls (`./matchSound`)
+  // The others' footfalls (`./matchSound`), and since PAR-8 their footprints (`./matchEffects`, research 257 s1).
+  const remote = new RemotePlayers(scene, (id, step, feet, yaw) => { matchEffects.footfall(id, step, feet, yaw); });
   // ACT-1: `./main`'s doors (`./doorPage`, research 92): the room's swings followed off the lobby's client, the leaf drawn by
   // the view and heard on the match's audio; the action on the door under the reticle asked of the room.
   const doors = new DoorPage({
@@ -348,6 +350,9 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
     hands: throws.hands({ trigger: (down) => acts.trigger(down), magazine: () => acts.hudAmmo(), mounted: () => acts.mounted() }),
     mountedMuzzle: (id) => acts.turrets.muzzleOf(id),   // ACT-2: `./main`'s MAP-10b -- a mounted body's rounds leave the turret's firepoint
   });
+  // PAR-8 (research 257 s1): `./main`'s shared effects -- the footprints on sand and snow beside the steps, own and others'.
+  const matchEffects = mountEffects({ effects: firearm.effects, walk, sound });
+  play.onEvent(matchEffects.playEvent);
   // ACT-1 (ruling ACT.R1, research 250 s1): sprint 27's action part (`./matchActions`, ONE-WIRE) -- `./main`'s `mountActions`
   // call with what this page lends it: the doors, the traversal, the throwables' C4, the others' bodies, and the bomb
   // drawn through the match's cues, HUD, bodies, effects and the throwables' world bomb (bomb-floor's Satchel). No `drops`
```

### 4.2 PAR-9: `/testroom`'s landing line only with no room live

On top of s4.1. Tried (corrected after the review, s4.1 and s4.2 applied): `tsc` clean; `matchMount.test.ts` 90 passed;
s4.3 checks clean on top. The menu page has no hunk (s2.3).

```diff
diff --git a/socomlegacy/packages/viewer/src/main.ts b/socomlegacy/packages/viewer/src/main.ts
--- a/socomlegacy/packages/viewer/src/main.ts
+++ b/socomlegacy/packages/viewer/src/main.ts
@@ -80,7 +80,7 @@
 import { CROUCH_HEIGHT, PRONE_HEIGHT, STANDING_HEIGHT } from './stature';
 import { gameAudio } from './audio';
 import { mountSound } from './matchSound';
-import { mountEffects } from './matchEffects';
+import { fallDeathLine, mountEffects } from './matchEffects';
 import { WEAPON_CLIPS } from './weaponPose';
 import { dropModels, WorldDrops } from './drops';
 import { HostagePage } from './hostagePage';
@@ -892,8 +892,9 @@
 // The firearm's own: the pose, the reload's hold, the room, the sound and the effects per round (`./matchFirearm`).
 play.onEvent(sound.playEvent);   // the body's footfalls, clip callbacks and landings, heard (`./matchSound`)
 // The message window's lines a lone SEAL can cause (research 87 §14): a landing of the death class is the game's fall
-// to death, "%s falls to their death" (0x65c440, `FUN_00547860`) -- the viewer's SEAL walks on.
-play.onEvent((e) => { if (e.kind === 'land' && e.cls === 3) hud.postMessage(`${hud.state().model.name || DEFAULT_PLAYER} falls to their death`); });
+// to death, "%s falls to their death" (0x65c440, `FUN_00547860`) -- the viewer's SEAL walks on. PAR-9 (research 257 s2):
+// only with no room live (the match client not open); in a match the room's kill line is the one (`NetPage`, both pages').
+play.onEvent(fallDeathLine({ hud, net: () => net }));
 play.onEvent(matchEffects.playEvent);   // EFFECTS: the footprint on sand and snow (`FUN_005a3280`; `./matchEffects`, PAR-8)
 // EFFECTS: a fall into water (`s2u:traversal`'s `waterLand`): `seal_fall_in_water` at the water line over the feet.
 globalThis.addEventListener?.(TRAVERSAL_EVENT, ((e: CustomEvent<TraversalEvent>) => {
```

### 4.3 PAR-10: the water on both pages, `/testroom`'s second keeper retired

On top of s4.1 and s4.2. Tried: `tsc` clean; `matchMount.test.ts` 90 passed with its traversal case turned (the
`setEffects` call once at the mount, with effects, where it pinned none: research 250 s9's owed line, now paid).
`e2e/effects.spec.ts`'s Enowapi case drops its hand-sent `s2u:traversal` event (nothing listens) and holds the splash
count to the runs; **not run** (no browser from this seat): the gate's (s5).

```diff
diff --git a/socomlegacy/packages/viewer/src/main.ts b/socomlegacy/packages/viewer/src/main.ts
--- a/socomlegacy/packages/viewer/src/main.ts
+++ b/socomlegacy/packages/viewer/src/main.ts
@@ -75,9 +75,7 @@
 import { PLAY_CLIPS } from './animator';
 import { TRAVERSAL_CLIPS } from './traversal';
 import { TURRET_CLIPS } from './net/emplacement';
-import { TRAVERSAL_EVENT, TraversalPage } from './traversalPage';
-import type { TraversalEvent } from './traversal';
-import { CROUCH_HEIGHT, PRONE_HEIGHT, STANDING_HEIGHT } from './stature';
+import { TraversalPage } from './traversalPage';
 import { gameAudio } from './audio';
 import { mountSound } from './matchSound';
 import { fallDeathLine, mountEffects } from './matchEffects';
@@ -359,7 +357,7 @@
  * gets the ARMORY and a change is taken (ARMORY_ABANDON_READING).
  */
 const roundHooks = armoryRoundHooks({
-  clearDecals: () => { fire.clearMarks(); effects.clearFootprints(); grenade.clearScorches(); },
+  clearDecals: () => { fire.clearMarks(); effects.clearFootprints(); grenade.clearScorches(); traversal.clearRipples(); },   // PAR-10: the ripples too
   clearAir: () => { grenade.clearAir(); drops.reset(); },   // PF-34: the drops go with the air (DROP_LIFETIME_PLACEHOLDER)
   send: armorySend,
   closeArmory: () => armory.close(),
@@ -498,6 +496,9 @@
   mountedMuzzle: (id) => acts.turrets.muzzleOf(id),   // MAP-10b: a mounted body's rounds leave the turret's firepoint
 });
 const { fire, zoom, accuracy, kit, reticle, effects, rangeFinder } = firearm;
+// PAR-10 (research 257 s3, research 250 s9): the water's splash and wading ripples are the traversal's own keeper's
+// (research 86 s5.4, `FUN_005b52b0`) on the firearm's effects -- both pages' one path; `traversal.effectsFrame()` each frame.
+traversal.setEffects(effects);
 const { setZoom, stepZoom, switchFireMode, showFireMode, selectFirearm, shoulderGate, kitFree, hangKit, spawnKit } = firearm;
 /**
  * TAUNTS (`./matchTaunts`, web research 301) and TACTICAL ORDERS and MESSAGES (`./matchChat`, research 302): the Chat
@@ -609,8 +610,6 @@
 function trigger(down: boolean): void {
   firearm.trigger(down);
 }
-// The water's ripples and a fall's splash are the effects' own (`effects.waterFrame`, `effects.splash` below): the
-// traversal's ripple keeper (research 86 section 5.4) is not wired, so they do not play twice.
 /**
  * The effects' pre-warm (research 90 item 16): their programs compiled and their bitmaps uploaded when the map's effect
  * data arrives, not in the frame of the first explosion. Set once the renderer is up.
@@ -896,11 +895,6 @@
 // only with no room live (the match client not open); in a match the room's kill line is the one (`NetPage`, both pages').
 play.onEvent(fallDeathLine({ hud, net: () => net }));
 play.onEvent(matchEffects.playEvent);   // EFFECTS: the footprint on sand and snow (`FUN_005a3280`; `./matchEffects`, PAR-8)
-// EFFECTS: a fall into water (`s2u:traversal`'s `waterLand`): `seal_fall_in_water` at the water line over the feet.
-globalThis.addEventListener?.(TRAVERSAL_EVENT, ((e: CustomEvent<TraversalEvent>) => {
-  const feet = walk.drawnFeet();
-  if (e.detail?.type === 'waterLand' && feet) effects.splash(feet, e.detail.depth);
-}) as EventListener);
 let wantedPlay = -1;
 /** EFFECTS: the map's effect data, asked of the source the map came from once it is shown (`./effectData`). */
 let wantedEffects = -1;
@@ -1574,13 +1568,6 @@
     firearm.fireFrame(dt, walking); // W2.5: the reload, the rate, a held trigger's rounds; MAP-10b: still while mounted
     acts.turretFrame(dt, walk.isDead());   // MAP-10b: the turret's trigger let go off it or dead; its rounds at its cadence
     effects.setBrighten(brightenOf(lighting));
-    // EFFECTS: the wading ripples (`FUN_005b52b0`) at the water under the SEAL, then the effect runs and the particles.
-    {
-      const snap = walking ? walk.snapshot() : null, feet = walking ? walk.drawnFeet() : null;
-      const depth = traversal.stats()?.depth ?? 0;
-      const height = snap?.stance === 'prone' ? PRONE_HEIGHT : snap?.stance === 'crouch' ? CROUCH_HEIGHT : STANDING_HEIGHT;
-      effects.waterFrame(snap && feet ? { feet, depth, height, velocity: [snap.vx, snap.vy, snap.vz], airborne: snap.airborne } : null);
-    }
     firearm.effectsFrame(dt, fly.camera);   // EFFECTS: the zAnim effect runs, the casings, the particles
     fly.camera.updateMatrixWorld();
     sound.frame(fly.camera);         // the game's listener is the camera (0x48dd40); the reverb, the beds
diff --git a/socomlegacy/packages/viewer/src/matchMount.ts b/socomlegacy/packages/viewer/src/matchMount.ts
--- a/socomlegacy/packages/viewer/src/matchMount.ts
+++ b/socomlegacy/packages/viewer/src/matchMount.ts
@@ -353,6 +353,7 @@
   // PAR-8 (research 257 s1): `./main`'s shared effects -- the footprints on sand and snow beside the steps, own and others'.
   const matchEffects = mountEffects({ effects: firearm.effects, walk, sound });
   play.onEvent(matchEffects.playEvent);
+  traversal.setEffects(firearm.effects);             // PAR-10 (research 257 s3, 250 s9): `./main`'s -- the water's splash and ripples
   // ACT-1 (ruling ACT.R1, research 250 s1): sprint 27's action part (`./matchActions`, ONE-WIRE) -- `./main`'s `mountActions`
   // call with what this page lends it: the doors, the traversal, the throwables' C4, the others' bodies, and the bomb
   // drawn through the match's cues, HUD, bodies, effects and the throwables' world bomb (bomb-floor's Satchel). No `drops`
@@ -506,7 +507,7 @@
       // A round's start (and an abandon) empties both decal pools and the air (CMPExitState L76084) and the wash: on
       // /testroom the ARMORY's glue does it; here, with no ARMORY, the parts' own (the MATCH-THROW review's finding 1).
       // ACT-5: and nothing offered from the round before (`hostages.reset()`: `./main`'s at `connectNet`; this page's round).
-      roundClear: () => { firearm.fire.clearMarks(); firearm.effects.clearFootprints(); throws.roundStart(); hostages.reset(); },
+      roundClear: () => { firearm.fire.clearMarks(); firearm.effects.clearFootprints(); traversal.clearRipples(); throws.roundStart(); hostages.reset(); },
     }, {
       respawned: () => { throws.grenade.refill(); },   // `./main`'s: the pouch too at a spawn (the page's spent rings do not outlive it)
       died: () => { acts.cancel('death'); },           // ACT-3: `./main`'s XR-06 (main.ts:1721) -- a death cancels the action button's hold
@@ -661,7 +662,7 @@
       traversal.hudFrame(hud);                         // ACT-4: `./main`'s research 86 -- the ladder slide's icon on a ladder
       acts.bomb.hudFrame();                            // ACT-1: `./main`'s XR-06 -- the bomb's compass marks and the fuse in the timer's place
       hostages.frame();                                // ACT-5: `./main`'s HX-4a line -- the hostage order offered afresh this frame
-      traversal.effectsFrame();                        // ACT-1: `./main`'s research 86 -- the water's ripples (no effects lent: research 250 s9)
+      traversal.effectsFrame();                        // ACT-1: `./main`'s research 86 -- the water's ripples (PAR-10: on the firearm's effects)
       firearm.feedHud(walking, {                       // ACT-4: `./main`'s -- the weapon box and the readouts, with the action slot's two feeds
         climb: traversal.hudClimb(),                   // research 86: the ledge's climb prompt
         nearby: acts.prompt(walking),                  // XR-06: the action context's prompt, in the picker's order (`./matchActions`)
diff --git a/socomlegacy/packages/viewer/test/matchMount.test.ts b/socomlegacy/packages/viewer/test/matchMount.test.ts
--- a/socomlegacy/packages/viewer/test/matchMount.test.ts
+++ b/socomlegacy/packages/viewer/test/matchMount.test.ts
@@ -1392,7 +1392,7 @@
     expect(t.w.live.has('blur')).toBe(false);
   });
 
-  it('the traversal: the clips reach it with the body\'s (setClips beside play.setClips), its input before the walk\'s frame and effectsFrame each frame with no effects, as /testroom\'s (the water\'s splash owed on the menu path); the HUD\'s climb and slide are ACT-4\'s', async () => {
+  it('the traversal: the clips reach it with the body\'s (setClips beside play.setClips), its input before the walk\'s frame and effectsFrame each frame on the firearm\'s effects, as /testroom\'s (PAR-10, research 257 s3); the HUD\'s climb and slide are ACT-4\'s', async () => {
     const clips = vi.spyOn(TraversalPage.prototype, 'setClips'), bodyClips = vi.spyOn(Play.prototype, 'setClips');
     const input = vi.spyOn(TraversalPage.prototype, 'input'), effects = vi.spyOn(TraversalPage.prototype, 'effectsFrame');
     const setEffects = vi.spyOn(TraversalPage.prototype, 'setEffects');
@@ -1405,7 +1405,8 @@
     expect(input).toHaveBeenCalledTimes(3);
     expect(effects).toHaveBeenCalledTimes(3);
     expect(input.mock.invocationCallOrder[0]!).toBeLessThan(walkFrame.mock.invocationCallOrder[0]!);
-    expect(setEffects).not.toHaveBeenCalled();                                           // research 250 s9: owed, as /testroom's
+    expect(setEffects).toHaveBeenCalledTimes(1);                                         // PAR-10: the firearm's effects, once at the mount
+    expect(setEffects.mock.calls[0]![0]).not.toBeNull();
     a.m.close();
   });
 });
diff --git a/socomlegacy/packages/viewer/e2e/effects.spec.ts b/socomlegacy/packages/viewer/e2e/effects.spec.ts
--- a/socomlegacy/packages/viewer/e2e/effects.spec.ts
+++ b/socomlegacy/packages/viewer/e2e/effects.spec.ts
@@ -233,17 +233,18 @@
   await page.evaluate(() => window.__viewer.setCamera({ x: 1791, y: 40, z: 804, yaw: 0, pitch: -20 }));
   await expect.poll(() => page.evaluate(() => window.__viewer.effects().water.ripples)).toMatch(/big_ripple_anim/);
   await page.waitForTimeout(500);
-  // A fall into the water is the traversal's `waterLand` on `s2u:traversal` (its detection is the traversal's, tested
-  // there): sent here as it sends it, standing where the SEAL stands in the river.
-  await page.evaluate(() => window.dispatchEvent(new CustomEvent('s2u:traversal', { detail: { type: 'waterLand', depth: 1.6 } })));
-  expect((await page.evaluate(() => window.__viewer.effects())).water.splashes).toBe(1);
+  // A fall into the water is the traversal's own splash since PAR-10 (research 257 s3: `TraversalPage` on the firearm's
+  // effects; its detection and play are tested in traversalPage.test.ts and matchEffects.test.ts): a hand-sent
+  // `s2u:traversal` event splashes nothing. A real fall into the river is the gate's browser run (research 257 s5).
   // At the feet it is under the body from the game's camera; the same splash 25 ahead on the river is the picture.
   expect(await page.evaluate(() => window.__viewer.playEffect('seal_fall_in_water', [1791, -14, 779]))).toBe(true);
   await page.waitForTimeout(300);
   await page.evaluate(() => window.__viewer.pauseEffects(true));
   await page.locator('#view').screenshot({ path: join(SCREENS, 'enowapi-splash.png') });
   await page.evaluate(() => window.__viewer.pauseEffects(false));
-  expect((await page.evaluate(() => window.__viewer.effects())).played['seal_fall_in_water']).toBe(2);
+  const splashed = await page.evaluate(() => window.__viewer.effects());
+  expect(splashed.played['seal_fall_in_water']).toBeGreaterThanOrEqual(1);
+  expect(splashed.water.splashes).toBe(splashed.played['seal_fall_in_water']);   // every splash's run counted (PAR-10)
 
   // The kit these pins were measured on: the M4A1 SD, the Mark 23, the M67 and the HE, no 2X (W2.R4's), by the
   // developer's `&kit=` (README; the default spawn is the map's type's kit since web sprint 4).
```

### 4.4 Landed (PARITY-1 wave 4, `agent/parw4`, 2026-10-08)

4.1-4.3 in order on top of research 255 s5 and the wave's earlier hunks. 4.1 by `git apply -3` (a clean three-way
merge: its import context had moved). 4.2 as written (`fallDeathLine({ hud, net: () => net })`, 734c326c's). 4.3 with two
hunks ported by hand, their lines unchanged: `main.ts`'s `waterFrame` block removed under PAR-24's
`acts.turretFrame(frameTime.real(), ...)` context, and `traversal.clearRipples()` put into `matchMount.ts`'s
`roundClear` at its place, ahead of PAR-4's `drops.reset()`. `main.ts`'s then-unused `DEFAULT_PLAYER` import dropped
(4.2 and research 255 s5.1 both in). The `matchMount.test.ts` traversal case turned with it; `e2e/effects.spec.ts`'s
Enowapi case is typechecked only (its browser run is the gate's).

## 5. Owed

- **The browser run** on both paths (PAR-27's gate, ACT.R7): on Desert Glory's sand (`e2e/effects.spec.ts`'s footprint
  case, `/testroom`) and from the lobby, the own body's prints and another player's.
- **PAR-9 in the browser** (PAR-27's run): a walk off a height in a `/testroom` match and in a menu-launched match on
  MP2, one "falls to their death" line on each, and one in `/testroom`'s `&nomatch` free walk.
- **PAR-10 in the browser** (PAR-27's run, `e2e/effects.spec.ts` with s4.3): the ripple on Enowapi's river on both
  paths, and a real fall into it splashing once (the spec's hand-sent event is gone; a drop from the bank, or a hook
  that places the SEAL in the air, is the gate's to write).
- **RIPPLES_AT_ROUND_CLEAR_READING** (s6): `FUN_0031c880`'s `FUN_003be800(0x4b5080)` and `FUN_00313620` read against the
  effect runs, or a capture of a round's turn with the SEAL wading.
- **The death's stop** (`FUN_005b52b0`'s `+0xe1` bit 4, D:L469904-469913): done 2026-10-10, pending review --
  `TraversalPage.effectsFrame` stops and forgets both ripples while the SEAL is dead in the water (`walk.isDead()`, the
  water over the feet) and starts none; a death out of the water stops nothing (the function runs only on a probe that
  met water). `test/traversalPage.test.ts`, "the water effects' resets". That a dead SEAL in the water starts no ripple
  (rather than one started and stopped in the same frame) is this note's reading of s3.1's "stops both", to be re-read
  at D:L469904-469913 by the review.
- **`Effects.waterFrame` and `splash` retired**: done 2026-10-10, pending review -- both removed from `effects.ts` with
  what only they used (`WaterState`, `RIPPLE_OVER`, the effects' own ripple handles and node); no source called them.
  `test/effects.test.ts`'s wading case moved onto the traversal's keeper (`test/traversalPage.test.ts`, "the keeper
  wades on the game's data": the big ripple across the body, its rings, the small one over the top, the fall's
  splash). Its "none out of it" half is not kept: it was the retired keeper's own bracketed reading, against s3.1's
  "out of both bands, neither started nor stopped".
- **A capture**: no capture of the original's prints has been scored (research 89's footfalls are a reading); whether
  a remote player's print is drawn on another console is `FUN_005a3570`'s reading here, not a measurement.
- **The corpus** (`docs/corpus/`) is rebuilt at the merge with this note in it, as the lane's merges do.

## 6. Placeholders and readings

| name | value | evidence that would settle it | status |
|---|---|---|---|
| `RIPPLES_AT_ROUND_CLEAR_READING` (`traversalPage.ts`) | `'stopped'`: a round's clear stops and forgets the wading ripples running | what CMPExitState's `FUN_0031c880` (D:L219040-219061: `FUN_003be800(0x4b5080)`, `FUN_00313620(.., 0)` per node) does to a running zAnim; or a capture of a round's turn with the SEAL wading | open (PAR-10) |

None other added and none retired. `FOOTFALL_CAP_READING` and `FOOTFALL_NEAREST_READING` (research 179 s11.20, 219
s4) now gate the others' prints as they gate their steps: their rows stay where they are.
