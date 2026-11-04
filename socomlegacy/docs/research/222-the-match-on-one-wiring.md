# 222 -- The match on one wiring: the parts both pages mount (ONE-WIRE)

Written 2026-10-06 for ONE-WIRE, on the owner's word ("one-wiring refactor"), the move research 166 §8 left owed:
`/testroom`'s match was wired in `packages/viewer/src/main.ts` (module-level state, 3,005 lines at `main` 82a31f62)
and the front end's match (ONL-18c/d) copied that wiring piece by piece into `matchMount.ts` and `matchFirearm.ts`,
each piece commented with its `main.ts` origin. The copies had drifted once already (sprint 28's PF-17/18/19 hooks
went into `main.ts` alone and the menu-launched match desynced until they were mirrored; research 218 §§1-3). This
note maps the modules that now carry the wiring once, says what moved, and lists every difference the two pages keep.
The code: `packages/viewer/src/matchCore.ts`, `matchFirearm.ts`, `matchNet.ts`, `matchLanes.ts`, `matchActions.ts`
(new or rewritten), `main.ts` (2,398 lines after), `matchMount.ts`. The tests: `test/matchCore.test.ts`,
`matchFirearm.test.ts`, `matchNet.test.ts`, `matchLanes.test.ts`, `matchActions.test.ts` (new), `matchMount.test.ts`,
`accuracy.test.ts`, `fire.test.ts`, `reticle.test.ts` (their source pins moved to the module that now holds the line).
No game or emulator was run; no server but the tests' own was contacted. Nothing here is a parity finding: every value
and behaviour is the one `main.ts` already had, at the confidence its own note gives it.

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R222.1 | **One firearm**: `main.ts`'s fire, bloom, view states, kit and swap, fire modes and round slots, `hangKit` and `spawnKit`, the trigger, `gunFrame`, the reticle's pass, the HUD's weapon box and the rounds' effects live in `./matchFirearm` `mountFirearm`, which both pages mount | the sprint 28 hooks (`fireRefused`, `flinching`, `reloadCut`) and the reload's NoFire-free `ready` are written once; nothing is left to mirror | §2.2 |
| R222.2 | **What else is in the hand plugs in**: the throwables, launcher and R2 inventory (since MATCH-THROW `./matchThrow`'s, R222.10) and `/testroom`'s turret as `FirearmHands`, the sound as `FirearmSound`; the front end passes both since MATCH-SOUND and MATCH-THROW, with no turret | the firearm's own lines and `/testroom`'s equipment lines meet at named points (the trigger's other owners, the zoom's hold, the fire-mode cell, the swap's gate, the spawn's equipment, the HUD's box) | §2.2 |
| R222.3 | **One `NetPage` deps builder** (`./matchNet` `matchNetDeps`) on a **capabilities switch** (`./matchCore` `MatchCapabilities`): `/testroom` every part, the front end the firearm, (since MATCH-SOUND, R222.9) the sound and (since MATCH-THROW, R222.10) the throwables, the launcher and the R2 inventory | the front end's asymmetries (no world drops, no ARMORY, no doors, no action part ...) are the switch's, pinned by `test/matchCore.test.ts`; a part's deps (`PART_DEPS`) are refused from a page whose switch has it off and owed by one that has it on | §2.3 |
| R222.4 | **One pad lane order** (`./matchLanes` `playerLanes`): the jump, the action, the shoulders, the zoom, the fire mode, the reload, the stance, in `FUN_00594cf0`'s order | `/testroom` gives its R2 binds and the action lifecycle, the front end its two firearm slots | §2.4 |
| R222.5 | **Sprint 27's action part** (`./matchActions` `mountActions`): the room's event relay, the switches, the turrets with their lock and trigger, the bomb and the action lifecycle | `/testroom` mounts it; the front end does not yet (no doors, traversal, throwables or world state there to pick from). *Since ACT (2026-10-08) the front end mounts it too, with the doors, the traversal, the turrets and the hostages: §10, research 250* | §2.5, §10 |
| R222.6 | **Four drifts removed**, the front end taking `main.ts`'s behaviour | the pad's pitch push in the fire's look, the tracer rule, the zoom's view tick, the `weapons()` of the spawned kit | §3 |
| R222.7 | **Thirteen differences kept**, each a front-end-only need or a part the front end does not mount | listed with their reasons | §4 |
| R222.9 | **One sound** (`./matchSound` `mountSound`, MATCH-SOUND): `main.ts`'s fall table, `WalkSounds`, the others' footfalls, `FirearmSound`, the ringing ears, the round's cues and `PART_DEPS.sound`'s hooks, mounted by both pages; the front end's on a `GameAudio` of its own over the menus' `AudioContext` (`new WebAudioOut(shared)`) | the front end's match sounds with no second gesture and leaves the menus' HUDUI and music slot untouched; the menus' music held across the match (`MATCH_RETURN_MUSIC_PLACEHOLDER`) | §7 |
| R222.10 | **One throwables part** (`./matchThrow` `mountThrowables`, MATCH-THROW): `main.ts`'s grenades and charges, launcher, flashbang wash, throw clip, equipment slots, R2 inventory and `PART_DEPS.throwables`' five hooks, mounted by both pages; the firearm takes its `hands` (`/testroom` adding its turret first) | the front end selects through R2 as `/testroom` does, throws, cooks, places and launches only through `NetPage.throwEvent`, gets a stale throw's item back, flies and draws the others' projectiles, and frees it all at its release and close | §8 |
| R222.8 | **The frame stays each page's**: the parts expose named steps (the firearm's `beforeMove` ... `feedHud`, the actions' `followNet`, `turretFrame`, `prompt`) that each page's frame calls in `main.ts`'s order; no common plugin runner | the two frames' PF-29 and PF-31 lines stay pinned as pairs (`test/matchMount.test.ts`) | §5 |

## 1. The module map

| module | what it holds | `/testroom` (`main.ts`) | the front end (`matchMount.ts`) |
|---|---|---|---|
| `matchCore.ts` | `MatchCapabilities` with `TESTROOM_CAPABILITIES` and `FRONT_END_CAPABILITIES`; `matchSide` (the net client's team, the lobby client's, a SEAL: ONL-18c's F1); `heldRefOf`, `sideLoadoutOf`, `setRemoteMap` (the others' kits on the map); `mapFog`, `liftFog` (the map's fog, the goggles' lens over it); `standOf` (the opening camera and the walk's feet); `feedCamera` (the camera's lanes, PF-31's Triangle gate) | all | all |
| `matchFirearm.ts` | `mountFirearm`: the firearm, its `FirearmHands` and `FirearmSound` plugs, its frame steps, its map steps (`clearMap`, `setWorld`, `setView`, `setEffects`), its `NetPage` hooks (`died`, `roundEffects`, `roundImpact`) | with hands and sound | bare |
| `matchNet.ts` | `matchNetDeps`: the shared `NetPageDeps` (the kit, the seat and type hooks, the spectator's views, the menus, the firearm's, the respawn, the side's body), the page's additions on them (`answered`, `respawned`, `died`), `PART_DEPS` (each switchable part's deps, listed once), the empty required ones where a part is off | with the sound's, the ARMORY's and the throwables' deps | with `game` (the lobby's client) |
| `matchLanes.ts` | `playerLanes`: the game lanes in the player update's order | its shoulders through the R2 inventory's binds; the action lanes | its two firearm slots |
| `matchSound.ts` (MATCH-SOUND, §7) | `mountSound`: the fall table, `WalkSounds`, the others' footfall hook, `FirearmSound`, `RingingEars`, `RoundAudioHost`, the sound's `NetPage` hooks, the frame's listener and beds, the map's data and loops; `MatchAudio` (the front end's own `GameAudio` and its release) | on `gameAudio` | on its own `GameAudio` over the menus' context |
| `matchThrow.ts` (MATCH-THROW, §8) | `mountThrowables`: `GrenadeThrower`, `RocketLauncher`, `ThrowPose`, `WhiteOut` and `InventoryMenu` with their listeners; the equipment slots at a spawn, the HUD box's icon and count, `takeSlot`, the inventory's kit, icons and words; the firearm's `hands`; `PART_DEPS.throwables`' hooks; the map's steps (`setMap`, `setMarks`), the frame's (`poseFrame`, `frame`) and `dispose` | with its turret in the hands, its toast and its scene health | bare hands, no toast, no scene health |
| `matchActions.ts` | `mountActions`: `RoomEvents`, `ActionPage`, `TurretPage`, `BombPage`, `ActionWiring`, the turret's trigger | mounted | not mounted |
| `padFlush.ts` (unchanged) | the R116.13 flush at the hold's release | its `padFrame` under `loadingJoin.blocked` | its `padFrame` under `LobbyMatch.blocked` |

None of them imports `./main` or reads page markup (OT.R12): `test/matchMount.test.ts` scans each and walks the whole
static import graph from `./matchMount`, which must not reach `main.ts`. `main.ts` wires `/testroom`'s markup (the
canvas, the panel, `#tw-weapons`, `#mp-name`) into them; `matchMount.ts` mounts them into the element it is given.

## 2. What moved

### 2.1 The core (commit 3d37ab25)

`main.ts`'s `matchSide`, `heldRef`, `sideLoadout`, the others' kit callback (`remote.setMap`'s), `refreshFog`'s lift,
`show`'s fog and stand, and `padFrame`'s four camera lines; the front end's copies of each went.

### 2.2 The firearm (c6461941)

`main.ts`'s gunplay (`kitRecs` through `spawnKit`, `trigger`, `gunFrame`, the effects' construction and lights,
`weaponFrame`, the four `fire.subscribe` hooks, the reticle's and the HUD's lines in the frame, `show`'s firearm lines,
the worker's `effects` answer) moved into `./matchFirearm`, the module the front end already mounted as a copy, which
became the one. `/testroom`'s equipment plugs in at the points its lines met the firearm's (`FirearmHands`):
`launcherUp` / `launcherRoundIcon` (the fire-mode cell, `FUN_00237b40`), `itemUp` (the zoom's `item` hold, the fire
mode held, the lens off, the reticle's scope mode and pip off, the fire-mode row off), `busy` (`FUN_005a8cb0`'s throw
gate), `takeable` (`FUN_00594cf0`'s fourth test), `putAway`, `spawned` (the equipment slots and the inventory's
shoulders at a spawn, `FUN_00599b60`), `trigger` (the turret's, the launcher's, a throwable's, the launcher's lowering:
first), `launched` (a round mode's round flown on the page), `icon` and `magazine` (the weapon box), `mounted` (the
rifle still on a turret). Its sound (`FirearmSound`): each round and reload, the effects' door, the goggles' cue,
another player's report. `main.ts` mounts the firearm after the grenade and the launcher are made (the plug reads
them at the mount's first `showFireMode`), with `play` moved up beside them.

### 2.3 The `NetPage` deps (92124f66, 12afd9db)

`connectNet`'s and the front end `join`'s literal `NetPageDeps` lost their shared lines to `matchNetDeps`. A page's
own deps ride beside them; one that would shadow a shared hook is refused (each hook lands in one place). The parts'
deps are `PART_DEPS`'s: `throwables` (`remoteGrenade`, `ownProjectiles`; since sprint 30's wave 4 also PF-36's
`tagOwnProjectile`, `detonateProjectile`), `worldDrops` (empty at ONE-WIRE; since wave 4 PF-34's `drops`, `kitChanged`), `sound`
(`reloadSound`, `deathVoice`, `hurtVoice`, `ring`, `roundAudio`, `objective`), `armory` (`armory`, `armoryOpen`,
`joined`, and its glue `newRound`, `abandoned`). A part on owes every one of its deps and a part off may hand none,
checked at run time on any switch and by the typecheck on the two pages' literal switches (`PageDeps<C>`: a missing
owed hook or a refused one fails `tsc`; the review's fix round). Sprint 30's hooks (PF-36's `tagOwnProjectile` and
`detonateProjectile`, PF-34's `drops` and `kitChanged`) landed in its wave 4 as one line each in their part's list there,
their code in the page that mounts the part (`/testroom`), the kit's take in the one firearm (`MatchFirearm.takeKit`)
and the pickup in the action part (`./matchActions`): research 234 §6, 235 §5, 236 §4.

### 2.4 The lanes (a0e09e8b)

`padFrame`'s game lanes and `playLanes` (`main.ts`), the firearm copy's `slotLanes` and the front end's lane lines
became `playerLanes`. What comes before the lanes stays each page's: the pad read, the hold's flush, R1, and
`/testroom`'s screens (WEAPON EXCHANGE, the ARMORY, the R2 inventory) that take the lanes as `menu`.

### 2.5 The action part (e39c74ee)

`main.ts`'s sprint 27 block moved whole into `mountActions`: `RoomEvents` and its listeners in the same order (the
switches', the turrets', the bomb's), `TurretPage` and its lock, `pageSources` and `ActionWiring`, the walk's action
filter, the blur's cancel, `BombPage` and the command observer, the turret's trigger, record and round. `main.ts` calls
its `lanes`, `prompt`, `trigger`, `followNet`, `turretFrame`, `follow`, `unlock` and its pages' frames.

## 3. The drift removed

Each is a line `main.ts` had and the front end's copy had lost; the front end takes `main.ts`'s.

1. **The pad's pitch push in the fire's look** (`Fire`'s `look().pitchPush`, the kick's push, `FlyCamera.pitchPush`).
2. **The tracer rule** (`Fire.setTracerRule(tracerRound)`: every fourth round of a tracer weapon; never the M4A1 SD's).
3. **The zoom's view tick** (`Zoom.markTick`, `Accuracy.markViewTick` once a walk tick): sprint 25's switch replay
   weighed a swap against it, and the copy never marked it.
4. **`weapons()` of the page's own kit**: the firearm's records as spawned (`main.ts`'s `kitRecs`) where the copy read
   `PlayerLoadout.records()` live; the two agree from a spawn to the next.

Non-functional, recorded: `main.ts` now resets the firearm's last FOV at a map (`setView`, the copy's line), which makes
one redundant identical `setFov`; the firearm's objects (the fire's, the effects', the reticle's) are made after the
grenade's and the launcher's, where the fire's were made before (three's draw sort is by render order, depth and id:
no draw order was found to depend on it).

## 4. The differences kept

| # | the front end | `/testroom` | why kept |
|---|---|---|---|
| 1 | its hold block: `fly.setInputSuspended(held)`, `firearm.held()`, the flush against no touch input, a first-frame flush | the hold block also lets the touch layer go, closes the R2 inventory, cancels the action's hold | front-end-only need (no touch layer, no inventory, no action part); the flush itself is `./padFlush` for both |
| 2 | R (a development build's reload key) bound through a target that drops events while held | the capture listener swallows every key under the hold | front-end-only need: the front end has no page-wide key capture |
| 3 | the right button steps the zoom unless held | unless held or the ARMORY is open | the ARMORY is not mounted |
| 4 | the walk entered at the world's placement | `startInWalk` under reCOM mode | Play mode and the fly camera are `/testroom`'s |
| 5 | a spawn always takes the room's kit (`network` true) | only with a server (`!!NET.url`) | the front end's match is always a room's |
| 6 | `menuOpen` the hold alone | the hold, WEAPON EXCHANGE, the ARMORY | neither screen is mounted |
| 7 | the reticle with no tactical map; the HUD feed with no climb and no action prompt | both | the tactical map, the traversal and the action part are not mounted |
| 8 | its frame: no traversal, doors, turrets, world step, throwables, flash, shadow, rehearsal or ARMORY (the sound since MATCH-SOUND, §7) | all | parts not mounted (§5) |
| 9 | no `effects.setBrighten` | the panel's brighten | the brighten is `/testroom`'s panel |
| 10 | its own development hook (`MATCH_WINDOW_HOOK`) | `window.__viewer` | each page's playtest instrument |
| 11 | its own world placement (`place`: one go, no reveal queues) | `show` with the reveal, the warm-ups and the status line | the loading screen already covered the decode (ONL-18c) |
| 12 | *(closed by MATCH-THROW's review round, §8: the round-start and abandon clear is the parts' own where the ARMORY is off -- `MatchNetParts.roundClear`: the marks, the footprints, the air, the scorches, the wash)* | `armoryRoundHooks.newRound` empties the marks, footprints, scorches and the air | the clear itself is the same; `/testroom`'s glue adds its ARMORY lines and leaves the wash running (unchanged) |
| 13 | *(closed by MATCH-SOUND, §7: the effects' sound door is `./matchSound`'s on both pages)* | | |
| 14 | *(closed by MATCH-GAPS, §9: the refusal posted on the HUD's message window as the original's -- 0x65f880, colour 2, `./matchMessages`)* | *(closed 2026-10-11, PARITY-2 PAR-36 (c): `refusalLine(hud)`, `main.ts`)* the HUD's message window, as the menu match's | both pages one part (`./matchMessages`) |
| 15 | *(closed by MATCH-GAPS, §9: the page's world built from the map by `./matchWorld` -- C4's targets the map's destructibles, the programs stepped, the room's world followed)* | the page's world state's destructibles (SUP-03), built in `main.ts`'s `show` | the same calls; `main.ts` adopts `buildPageWorld` after sprint 31's wave 4 (owed, §9) |
| 16 | the R2 inventory's overlay alone on the HUD layer | the tactical map's, WEAPON EXCHANGE's and the inventory's | neither the tactical map nor WEAPON EXCHANGE is mounted |
| 17 | the pouch refilled at a spawn (`grenade.refill`, its own `respawned` hook) with nothing else | the same, then WEAPON EXCHANGE reset over the kit | WEAPON EXCHANGE is not mounted |

## 5. Not done

- **A common plugin runner** (the reviewer's plan, step 4: deps hooks, pad lanes, frame, HUD pass and dispose of one
  shape). The parts' shapes differ -- the firearm has nine frame steps interleaved with `/testroom`'s other parts --
  and a runner would reorder `main.ts`'s frame; each part exposes its steps by name instead and each page calls them in
  `main.ts`'s order. Owed: a runner, once the front end mounts a second frame-stepping part.
- **Not mounted on the front end** (`MATCH_MOUNT_PARTS_PLACEHOLDER`, research 166 §6) since PARITY-1's wave 4
  (2026-10-08; the plan [`../plans/2026-10-08-web-sprint-parity.md`](../plans/2026-10-08-web-sprint-parity.md)): the
  PARITY-2 rows only -- the touch layer, WEAPON EXCHANGE's touch half with it (PAR-5; *mounted 2026-10-11, §11*); the compile warm-up and the staged reveal (PAR-11); `/testroom` starting the menu-match code (PAR-26).
  The exemptions are visible owner rows, never silent (PAR.R5; drafted in the plan's "What the sprint needs from the
  owner", numbered at its pull request): the playtest overlay and its report (PAR-14, a development instrument meanwhile),
  the tactical map (PAR-15: none in the original's multiplayer; `FRONT_END_CAPABILITIES.tacMap` off), the development
  keys, tools and hook reads (PAR-16), the viewer's chrome (PAR-17), the offline loopback (PAR-18); held by
  `test/build_keyboard.test.ts` ("PARITY-1's exemptions"), with `/testroom`'s teleport and playtest overlay still reached
  through `?devmode` on a built page held there as an expected failure for PAR-16's row; the chrome and the loopback by
  `test/parityExemptions.test.ts` (PAR-17: none of the shell's tools in the front end's match, the menus' OPTIONS its
  settings; PAR-18: the same parts mounted on both pages, the transport the only difference). Each part still owed is its
  switch turned on and its part handed (the firearm's `hands`, `matchNetDeps`' `PART_DEPS`). The round-start decal clear
  (§4, 12) is the parts' own since MATCH-THROW's review round (§8).
  *Mounted since this list was first written (2026-10-06):* the doors, the traversal and the action part (ACT-1), the
  turrets (ACT-2), the hold on Cross and its cancels (ACT-3), the HUD's prompts (ACT-4), the hostages' orders and marks
  (ACT-5; headless only until Desert Glory is listed, ACT.R6) -- §10 and research 250; and at PARITY-1's wave 4 WEAPON
  EXCHANGE and the dead's prompt (PAR-1, research 253), the round screens' bitmaps (PAR-3), the world drops and their
  Cross pickup (PAR-4, H120; research 234 s6), the character shadow (PAR-6), the adaptive pixel ratio and the viewport
  (PAR-12; research 255), the footprints, the fall message and the water (PAR-8, PAR-9, PAR-10; research 257); the
  effects' brightness needs none (PAR-13, a demonstrated no-op: research 255 s4); and at PARITY-2 the seat ARMORY's part,
  mounted and dormant (PAR-2, 2026-10-11: below). The list as first written: the
  hostages' orders and marks, the world drops, WEAPON EXCHANGE, the ARMORY, the doors, the action part, the traversal,
  the touch layer, the tactical map, the character shadow. The ACT audit's list (2026-10-08): WEAPON EXCHANGE; the seat
  ARMORY (or an owner exemption); the round screen's bitmaps; the world drops; the touch layer; the character shadow;
  the footprints; the fall message; the water; the compile warm-up and the staged reveal; the adaptive pixel ratio; the
  effects' brightness; the playtest overlay (or an exemption); exempting the tactical map, the dev keys, the viewer's
  chrome and the offline loopback.
- `/testroom`'s WEAPON EXCHANGE, ARMORY, doors and traversal stay `main.ts`'s module-level wiring; each is the next
  part to move when the front end mounts it (the throwables and the R2 inventory moved at MATCH-THROW, §8).
- **Found on the way**: `test/localDeath.test.ts` raised an unhandled `this.deps.remote.markGhost is not a function`
  (its fake lacked sprint 29's `markGhost`), unchanged from 82a31f62; `main` 03516095 fixed the fake and is merged here.
  `e2e/weapon.spec.ts:152` (the owner's rulings of 2026-09-29) fails at its line 189 (`Digit2` starts no swap after the
  scope's zoom out): the same on 82a31f62's sources, run the same way -- not this change's, not fixed here.

- **The seat ARMORY (PAR-2, 2026-10-11; the review's ruling by the main merge controller).** The seat ARMORY is
  `/testroom`'s stand-in for a lobby it lacks: the original has no in-match ARMORY -- its ARMORY is the lobby's, before
  the launch (research 95 §4.1 and §9, the owner's ruling there; research 167 R167.1; research 182 §4.5;
  `match/src/room.ts` `ARMORY_SEAT_READING`). Its wiring is one part both pages mount (`./matchArmory` `mountArmory`,
  written once from `main.ts`'s lines). On `/testroom` it is live, the labelled stand-in. On the menu-launched match it
  is **mounted and dormant**: the original's ARMORY there is the lobby's (`./lobbyArmory`), so the front end hands the
  part `playing: () => false` -- no hello of that page asks the room to hold a seat for it (neither the lobby's
  game-socket hello, `./gameLobbyHost`, nor the one `NetPage` sends when it reopens the socket after a drop), and a seat
  it is told of anyway spawns at once (`ready`); its development hook's `openArmory` opens nothing. Held by
  `test/matchArmory.test.ts` (the part's handling of a welcome or a promotion saying `armory`, on both pages' `NetPage`
  wiring with the part's switch on; the menu match's dormant adapter) and `test/matchMount.test.ts` (the lobby's and the
  reopened socket's hellos carry no `armory`). `FRONT_END_CAPABILITIES.armory` is on (the part is mounted: its deps are
  owed), and a page's `roundClear` runs ahead of the part's two round ends (`./matchNet`). Known, not fixed (the
  review's findings 2-4): the ARMORY data landing null before a seat's join leaves that seat waiting for data that does
  not come again (`wanted`, as `main.ts`'s `armoryWanted` was); the two loadout stores -- closed on the menu match since the
  storage fix (2026-10-11): its dormant part has no store, so only the lobby's ARMORY saves there, to the account's records
  (SVC-24); `/testroom`'s seat ARMORY still saves to the browser's (`s2u.armory.v1.*`); and on the menu match no 3D
  preview models and no `warm` of its passes (the lobby's read is `models: false`, `frontEnd.ts`; no warm-up handed) --
  moot while it is dormant.

## 5a. The browser run

2026-10-06, one worker, the page on 5370, the two-page spec's match server on 5371, the run's Local port 5372; the
served tree extracted with `--with-streams` into the worktree and deleted after: `twoPagesMatch.spec.ts` 1 passed (the
front end's match: both pages in round 1, A's rounds taken by the room, no hit -- as research 166 §8), `play.spec.ts`
1 passed, `weapon.spec.ts` 2 passed and 1 failed (above: the base's failure too), `armory.spec.ts` 6 passed,
`crossroads.spec.ts` 4 passed (the switches, the bomb, the turrets of the action part).

## 6. Placeholders and readings

| name | where | state |
|---|---|---|
| `MATCH_MOUNT_PARTS_PLACEHOLDER` (`packages/viewer/src/matchMount.ts`) | research 166 §6 | re-filed 2026-10-11 (PAR-5, §11): its text names the touch layer as mounted ("and since PAR-5 the touch layer (touch)"), the tactical map alone not yet; re-filed 2026-10-11 (PAR-2, §5): its text names the seat armory as mounted and dormant ("and since PAR-2 the seat armory (mounted, dormant: on this path the original ARMORY is the lobby one)"), touch and the tactical map not yet; re-filed 2026-10-06: the front end mounts the world, the walk, the bodies, the HUD, the match and the firearm with its effects -- one wiring with `/testroom`'s; since MATCH-SOUND (§7) the sound too, since MATCH-THROW (§8) the throwables, the launcher and the R2 inventory; the parts its switch has off are listed in it, and `test/matchMount.test.ts` pins the list to `FRONT_END_CAPABILITIES` |
| `MATCH_RETURN_MUSIC_PLACEHOLDER` (`packages/viewer/src/menuMusic.ts`) | §7 (MATCH-SOUND) | the menus' streams stopped when the match's loading screen comes up (the menu state left), no play taken during the match, and, on the lobby's return once its dialog has started and made no music call of its own, the streams held (a faded one aside) started again from their start, until the menus' next music call (a play, `StopAllSounds`, `FadeAllSounds`, `VagStreaming`), which stops them first (FE-SWEEP, 2026-10-06: a dialog whose own music comes after the settle through another slot is the only stream; the replayed stream is cut, not faded -- the original's handover here is not read either); any other return drops them; not read: whether the original's re-entered menu state plays `MUS_ONLINE_MENU` again (GAME LOBBY's scripts, `StartMusic`: research 152 R152.2) or stays silent; settled by a capture of a match's end into the lobby |

One constant added by MATCH-SOUND (`MATCH_RETURN_MUSIC_PLACEHOLDER`); none retired. MATCH-THROW (§8) added no constant and
retired none; the readings its moved lines carry stay their own notes' (85, 94, 212, 236). MATCH-GAPS (§9) added one,
`CLAYMORE_REFUSAL_SCALE_READING` (below); none retired.

| name | where | state |
|---|---|---|
| `CLAYMORE_REFUSAL_SCALE_READING` (`packages/viewer/src/matchMessages.ts`) | §9 (MATCH-GAPS) | settled at the source (PAR-96, 2026-10-16; reading, pending review; the name kept in code until a rename): the claymore's refusal at the message window's own scale (`MESSAGE_SCALE`, 0.9: a scale of 0). The decompiled call (`FUN_005be9a0` D:L475331, the PMN's D:L475363) drops `FUN_002b6530`'s float first argument; the disassembly before it sets `$f12` to 0.0 (`mtc1 $zero, $f12` at 0x5beb30, the PMN's 0x5bec44 -- the 0.0 the `+0x8` timer is compared with) and writes it no more up to the `jal 0x2b6530` (0x5beb5c, 0x5bec70); 0.0 takes the window's scale (D:L157983-157987). Was: "open: ... shows the window 0x4366a0, the text 0x65f880, colour 2, not centred, the window's fade, but not `FUN_002b6530`'s float scale (`$f12`); settled by the disassembly before that call or a capture of the refusal" |

## 7. The sound moved (MATCH-SOUND, 2026-10-06)

On the owner's word ("Yes, wire it now"): the menu-launched ONLINE match had no sound by design (R222.3's switch,
§4 row 13, research 166 §8). The investigation of 2026-10-06 found the cause and the plan; this is the plan done.
No game was run; every call is `main.ts`'s own, at its note's confidence.

- **The module** `packages/viewer/src/matchSound.ts` `mountSound`: `main.ts`'s `setFallTable` (SEAL tuning),
  `WalkSounds` (the walk's footfalls, landings, rounds and reloads; `Play.onEvent`), `RemotePlayers`' footfall hook,
  the firearm's `FirearmSound` (rounds, the effects' door through `soundFor`, the goggles' cues, another's report),
  `RingingEars`, `RoundAudioHost` (INT.R7), `PART_DEPS.sound`'s six hooks (`reloadSound`, `deathVoice`, `hurtVoice`,
  `ring`, `roundAudio`, `objective`), the frame's `setListener(camera.matrixWorld)` and `walkSounds.frame`, the map's
  `setData` (with `roundAudio.dataChanged`) and `setLoops`, and `dispose` (the ears, the cues, `setData(null)`).
  `/testroom` mounts it on `gameAudio` with the same calls (`main.ts` keeps its traversal's `land`, the throwables'
  and the scene programs' plays, and `setData(null)` at a map change).
- **The switch**: `FRONT_END_CAPABILITIES.sound` on (pinned in `test/matchCore.test.ts`); its hooks are owed on the
  front end (`test/matchNet.test.ts`, at run time and by the typecheck).
- **The output**: one `AudioContext`, the menus' -- running since the disc page's click (the owner's "no prompt") --
  with the match on an output of its own over it (`new WebAudioOut(shared)`, `packages/viewer/src/audio.ts`): its own
  master, reverb bus and music slot, so the match's data, gain, reverb and round music never touch the menus'.
  `frontEnd.ts` `frontEndMatchSound` makes a separate `GameAudio` on it at each match's start (the options' masters
  read as the menus' are, PF-32) and hands it to the mount (`MatchMountOptions.audio`), which releases it at the match's
  release and close (`setData(null)`, the output's `dispose`; the shared context stays open). A match mounted with no
  audio (the tests') is silent (`silentOut`).
- **The loader**: `matchLoader` asks `kind: 'sound'` on the map's path and archive beside the effects and answers it
  with the data and its loops (`soundLoops`); the loading screen holds for both, as `/testroom`'s loading lanes do.
- **The menus' music** stops when the match's loading screen comes up (the original's menu state is left); a faded
  stream is not kept. At the return the menus' plays are taken again at once; the return settles once the returning
  dialog has run `RETURN_SETTLE_FRAMES_ADAPTATION` (2) frames (`FrontEndSession`'s `lobbyMatch.settled`), and only then, on the
  lobby's return (the match's end) and only if the dialog made no music call of its own, are the held streams started
  again (`MenuMusic.settleHeld`); any other return (dlgNetError, an abandon) drops them. A mount that throws releases
  the match's output (`frontEndMatchSound.start`). The review's three findings, 2026-10-06. `MATCH_RETURN_MUSIC_PLACEHOLDER`, §6.
- **The dev hook**: `MATCH_WINDOW_HOOK`'s `audio()` gives the match's `GameAudio.stats()` (a playtest instrument).
- **Not done**: the front end's match still has no throwables, launcher, traversal or doors, so their sounds (the
  grenades', the slide's loop and landing, the doors') stay `/testroom`'s; the `.DINK` of the ARMORY's opening is the
  ARMORY's (not mounted). If the menus never ran their context (a controller alone, opened by URL), the match's stays
  suspended until the page's activation lets a resume through (`resumeIfAllowed`): accepted (no prompt).

The tests: `test/matchSound.test.ts` (the module, and neither page holding a copy), `test/audioShared.test.ts` (the
shared context), `test/frontEndMatchSound.test.ts` (the match's `GameAudio` on the menus' output, their slot and data
surviving it; the music's hold), `test/matchMount.test.ts` (the data and loops onto the match's audio, R1's rounds on
it, its release at the match's end, the loader's request), `test/matchNet.test.ts`, `test/matchCore.test.ts`.

The browser run (2026-10-06, one worker, the page on 5370, the spec's match server on 5371, Local 5372; the served tree
extracted with `--with-streams` into the worktree and deleted after): `twoPagesMatch.spec.ts` 1 passed -- page A's
match `GameAudio` `running` (no prompt), 10 banks, 71 sounds played (`.M4A1` x18 for A's rounds, the casings and
impacts, the ambience beds, the round's `MUS_MP_SEAL_IN...` cue), none dropped locked; `soloMatch.spec.ts` 1 passed;
`audio.spec.ts` failed at its line 25 (`unlocked` true before the click: the audio-unlock change of PR #37 runs the
context without a gesture) -- the same with `main.ts` at `main` 2988e28c, so not this change's, not fixed here.

After the review's fixes and the merge of `main` 64a36846 (which fixes `audio.spec.ts:25`), the same setup:
`twoPagesMatch.spec.ts` and `audio.spec.ts` 2 passed -- A's match `GameAudio` `running`, 10 banks, 69 sounds played,
none dropped locked.

## 8. The throwables moved (MATCH-THROW, 2026-10-06)

The next part the front end lacked (§5): the menu-launched match had a firearm and sound but nothing else in the hand
-- no grenade, flashbang, smoke, claymore, PMN or C4, no LAW or RPG-7, no launcher round flown on the page, the others'
grenades never drawn (`remoteGrenade` stood empty) and R2 opened nothing. No game was run; every line is `main.ts`'s
own, at its note's confidence (research 85 the grenades, 94 §C4 the launchers, 212 the R2 menu, 217 §4.2, 223 s6, 231,
235, 236).

- **The module** `packages/viewer/src/matchThrow.ts` `mountThrowables`: `main.ts`'s `GrenadeThrower` and its source,
  `RocketLauncher`, `stowRifle`, `ThrowPose` (its pose layer added at the mount, the only extra layer either page adds),
  the grenade's and the launcher's listeners (the equip's release, stow and zoom drop; the throw's clip and hold; the
  charge's place, the Detonator's, the launcher's raise and lower, its launch, the throw's, each to `NetPage.throwEvent`;
  the bounce through the effects; the flash's `WhiteOut` and the screen shake), the effect door
  (`setEffectPlayer`), `firearmReadyAt` (PF-21), `spawnEquipment`, `equipmentIcon`, `equipmentMagazine`,
  `equipmentName`, `inventoryKit` (PF-37's wading depth), `inventoryCurrent`, `takeSlot`, `slotIcon`, `slotInfo`,
  `kitChangeGate`, `InventoryMenu`, `selectEquipment`, the firearm's `hands` (§2.2's points; the page's other owner of
  the hand -- `/testroom`'s turret: `trigger`, `magazine`, `mounted` -- asked first, as `main.ts` asked `acts`), the
  five `PART_DEPS.throwables` hooks (`remoteGrenade`, `ownProjectiles`, `staleThrow`, `tagOwnProjectile`,
  `detonateProjectile`), the map's lines of `show` (`setMap`: the models, the bitmaps, C4's world, the clip stopped;
  `setMarks`: the scorches' shade and clip from `MatchFirearm.setWorld`), the frame's (`poseFrame`: the clip's
  callbacks after the gun's frame; `frame`: the grenades, the launcher, the wash, its glow returned for the renderer)
  and `dispose` (the listeners off, the effect door, the menu closed, the clip stopped, the launcher lowered, the wash
  neutral again -- it is the lit colours' page-wide scale --, `setMap(null, null)`: the air, the scorches, the pouch,
  the map's bitmaps and materials; off the scene). Its sounds are the match's audio's (`./matchSound`'s `GameAudio`:
  `onAnimCallback`, `play`), its effects the firearm's (`effects.play`); the firearm is read at a call (it is mounted
  after, taking the part's `hands`).
- **`/testroom`** mounts it where the grenade was made, with the same calls: its toast as the refusal (since PAR-36 (c), `refusalLine(hud)`), its world state
  as C4's targets, its turret in the hands, `...throws.netDeps()` in `connectNet`, `throws.setMap` / `setMarks` in
  `show`, `poseFrame` and `frame` in the frame (`created.setGlow(throws.frame(dt))`). Its names (`grenade`, `rocket`,
  `throwPose`, `whiteOut`, `inventory`, `takeSlot` ...) are destructured from the part, so the hook, the keys, the lanes,
  the ARMORY's glue (`clearAir`, `clearDecals`) and the warm-ups read them unchanged. `main.ts`: 2,381 lines to 2,085.
- **The switch**: `FRONT_END_CAPABILITIES.throwables`, `.launcher` and `.inventory` on (pinned in
  `test/matchCore.test.ts`); the throwables' five hooks are owed on the front end at run time and by the typecheck
  (`PageDeps<C>`, `test/matchNet.test.ts`). **The world drops stay off**: their pickup (the weapon prompt's drop, the
  action button) is the action part's (`./matchActions`, R222.5), which the front end does not mount; turning them on
  would put drops on the page that nothing can pick up.
- **The front end** (`./matchMount`): the part before the firearm, its `hands` to the firearm (no turret); the R2
  inventory on the pad as `main.ts`'s `padFrame` has it -- closed under the hold, read off the merged lanes' edges after
  R1, the game's lanes taking the input less the lanes it holds (`padGame`), `walk.holdForMenu` while open, its opening
  forgetting the stance press (`onOpened`), its overlay on the HUD; the shoulders take the slots its binds hold
  (`takeSlot`), so L1 / L2 are the primary and the sidearm until R2 rebinds them; the map's `setMap` / `setMarks`; the
  frame's `poseFrame` and `frame`, the glow handed to the renderer (`MatchRenderer.setGlow`, optional); the pouch
  refilled at a spawn (`respawned`); `dispose` at the release and the close, before the firearm's.
- **Differences kept**: §4 rows 14-17 (no toast for the claymore's refusal; no scene-health world, so C4 finds no
  target; the overlay alone; the respawn's refill alone). Rows 14 and 15 closed by MATCH-GAPS (§9).
- **The review round (2026-10-06, two findings).** (1) The round-start clear: on `/testroom` it rides the ARMORY's glue
  (`newRound`, `abandoned`: `./armoryGlue`), so the front end had none -- a grenade airborne at a round's end flew and
  burst in the next, a flashbang washing and shaking the screen after the respawn, while the room had cleared its own.
  Now the throwables part has its own (`roundStart`: `clearAir`, `clearScorches`, the wash stopped) and `./matchNet` runs
  the page's `MatchNetParts.roundClear` as `newRound` and `abandoned` wherever the ARMORY is off (it stays in
  `PART_DEPS.armory`; `/testroom`'s glue is unchanged and the hook is not run there); the front end's clear is the
  firearm's marks and footprints and the part's `roundStart` -- both decal pools (CMPExitState L76084), which also closes
  §4 row 12. (2) The warm-up: `/testroom`'s `warmWalk` compiled the throw's arc and the scorches ahead of the first throw
  (research 90 #23) and the front end did not; the part's `warm` hands them to the page's renderer (`prepare`), called by
  `/testroom`'s `warmWalk` and by the front end once a map and its renderer are in (`MatchRenderer.prepare`, optional).
  The walk's rehearsal (#21, `rehearseWalk`) stays `/testroom`'s: the front end has none for any part.

The tests: `test/matchThrow.test.ts` (new: the part on the scene and its pose layer once; the hands' order, the page's
owner first; the five hooks onto the grenade page; a throw to `NetPage.throwEvent`; `dispose`; both pages calling
`mountThrowables` with the same hooks and steps and neither making a thrower, launcher, clip, wash or menu of its own;
the hooks written once; no markup), `test/matchMount.test.ts` (+4: R2, Up, Up, Cross takes the M67 and R1 throws it,
every throw the room sees a `NetPage.throwEvent`; a stale throw's item back; another's grenade flown and on the drawn
scene; the teardown; the R2 test of sprint 25 now opens the menu; the PF-28, PF-34/36 and PF-37 source pins moved to
`matchThrow.ts`), `test/matchNet.test.ts` (the front end owing the throwables' hooks, at run time and by the
typecheck; the world drops still refused), `test/matchCore.test.ts` (the pin). `/testroom`'s own tests are the proof
its behaviour did not change.

The browser run (2026-10-06, after the merge of `main` f25e4ae3 -- WEAPON EXCHANGE's input ownership, PR #47; one
worker, the page on 5370, the two-page spec's match server on 5371, Local 5372, `grenadeSelfMp`'s server on 5373; the
served tree extracted with `--with-streams` into the worktree and deleted after): `twoPagesMatch.spec.ts` 1 passed --
A took the M67 up through R2 (R2, Up, Up, Cross on the pad) and threw it with R1: A heard the room's `placed` (PF-36's
pid for its own throw), B its `grenade`, and A's match played `.THROW_OBJECT`; `grenadeArc.spec.ts` 1 passed,
`grenadeSelfMp.spec.ts` 3 passed and `weaponExchange.spec.ts` 1 passed (`/testroom` unchanged).

## 9. The claymore's message line and C4's world (MATCH-GAPS, 2026-10-06)

The two throwable gaps MATCH-THROW left on the front end (§4 rows 14, 15). No game was run; the sources are research
87 §14 (the message window's posts), 85 (the claymore's refusal), 210 §8 (SUP-03, C4's targets) and 209 §10-§12
(MAP-02, MAP-03), re-read at the decompilation where cited.

- **The claymore's refusal (row 14).** The original posts it itself: the claymore's fire with four down
  (`FUN_005be9a0`, `FUN_003cc1f0(...) < 4` failing, D:L475330-475331) calls `FUN_002b6530` on the main message window
  0x4366a0 with the text 0x65f880 (`Unable To Deploy: Max Equipment Items Placed (4)`, `CLAYMORE_RULES.maxPlacedMessage`),
  colour 2 (64, 64, 96: `FUN_002b7530`'s table), not centred, the window's own fade; its 2 s timer (`+0x8`) gates the
  re-post. The wading refusal of the same fire (D:L475310-475320, PF-13) posts nothing (a bare return), so the refusal
  has one message. The page has that window: the `Hud`'s (`postMessage`: `messages.rdr`'s place, the 7 s fade, the
  newest at the bottom), where the room's kill lines and the round start already post. New module
  `packages/viewer/src/matchMessages.ts`: `MESSAGE_COLOURS` (the six colours), `CLAYMORE_REFUSAL_COLOUR` (2),
  `messageLine`, `refusalLine(hud)` -- the front end's match hands `refusalLine(hud)` as the throwables part's `refuse`.
  Kept, the `Hud`'s and not this task's: the window centres every line (the original's post is not centred) and draws
  its text at the HUD's alpha 80 (the window's table says 100); the scale is `CLAYMORE_REFUSAL_SCALE_READING` (§6), the
  window's own, read at the disassembly by PAR-96 (2026-10-16; was open).
- **C4's world (row 15).** New module `packages/viewer/src/matchWorld.ts` `buildPageWorld(map, hooks)`: `main.ts`'s
  `show` lines for `pageWorld`, as one function -- the map's ground's hull grid (`groundGrid`), a `WorldState` on the map's
  metadata (else `bareMeta`), its hooks (a node drawn or hidden through the view, a program's sound at its node's place, a
  common-set effect at its root, `DESTRUCTION_SOURCE` logged once a node with `GLASS_FRAGMENTS_PLACEHOLDER`) and zAnim's
  opening state (`applyInitial`); null for a map with no ground. The front end's match (`./matchMount`) builds it at
  `place`, stands the walk on its grid (`walk.setGround`'s third argument, as `/testroom`), hands it to the throwables
  part's `world` (C4's targets: `SceneHealth.c4TargetAt`), to its `NetPage` as `world` (protocol 10: the room's world
  followed, reset at a round's start) and steps it each frame after the net's (`main.ts`'s `pageWorld?.step(dt)`); its
  sounds play on the match's audio, its effects on the firearm's; it is let go at the release and the close.
- **Not done, and why.** The Action button that plants C4 (`plantC4`, M7) is the action part's (`./matchActions`, sprint
  27), which the front end does not mount (R222.5): with this world C4 settles on a destructible and plants when asked,
  but no button asks yet. `/testroom` is unchanged: its toast and its own `pageWorld` lines stay until sprint 31's wave 4
  (which holds `main.ts`) has landed; **owed**: `main.ts` to call `buildPageWorld` (its hooks: `view.setNodeActive`, the
  page's `audio.play`, `effects.play`, `console.info`) and `refusalLine(hud)` in place of its toast -- then one wiring. *(Since 2026-10-11, PARITY-2 PAR-36 (c): `/testroom` posts the refusal through `refusalLine(hud)` too.)* `buildPageWorld` stays owed.

- **The review round (2026-10-07, two findings).** (1) The room's world was not followed on the front end: its
  `NetPage` adopts the lobby's client (`NetPageDeps.game.adopt`), which `./gameLobbyHost` opened without a world, and the
  `world` dep reached only a client `NetPage` opens itself -- so a snapshot's environment and a round's reset never
  reached the match's world, and a barrier the room destroyed stayed drawn, solid and a C4 target. Now `NetClient.setWorld`
  hands a client its world after it was opened: the environment it last took is laid on at once, silently (the adopting
  page a joiner to it, `JOIN_SILENT_READING`), then every snapshot's and every new epoch's reset reach it; `NetPage`
  hands an adopted client its `world` dep, and its `release` takes it back (`setWorld(null)`: the lobby has none).
  (2) A world that would not build stopped the match: `place` threw before `join`. Now it is caught and logged, and the
  match joins without one (C4 then finds no target, as before).

The tests: `test/matchWorld.test.ts` (new: no world without ground; the world on the map's ground and its own grid with
the opening state; the bare metadata; the destructibles as C4's targets, the shield gate; a death's program through the
page's hooks; no markup, no `./main`; the six colours; the refusal posted in colour 2 at the window's scale and on the
HUD's banner), `test/matchMount.test.ts` (+4: the refusal on the front end's HUD as the original's post; C4 on the front
end -- the thrower's world the page's `WorldState`, the walk on its grid, stepped each frame, the barrier settled under
the reticle and the charge planted on it; the `NetPage` handed the same world; no ground, no world). The review round: `test/matchMount.test.ts` +3 (the room's barrier down
before the match laid on the match's world at the adoption, a snapshot's environment and a round's reset on it after,
C4 refused and then offered with them; released, the client lays nothing on the match's world; a world that throws is
logged and the match joins without one), `test/netClient.test.ts` +1 (`setWorld`: the last environment at once and
silently, the snapshots' after, a new epoch's reset, null lets it go). `/testroom`'s own
tests are the proof its behaviour did not change.

## 10. The actions part on the front end (ACT, 2026-10-07..08)

The menu-launched match mounts sprint 27's action part as `/testroom` does: `FRONT_END_CAPABILITIES` turns `actions`,
`doors` and `traversal` on together (ACT.R1), the turrets ride it (ACT-2), the hold on Cross and its cancels are
`/testroom`'s lane order (ACT.R3), and `hostages` is on as well (ACT-5, ACT.R5) -- with no new hook and no wire change
(ACT.R2). The record, the browser runs from the lobby on the three first-release maps and the readings are research
[250](250-the-actions-on-the-menu-launched-match.md) (§1-§6 the mount, §7-§8 ACT-6's runs and ACT-7's hold on room ticks,
ACT.R8); the plan is [`../plans/2026-10-07-actions-on-the-menu-match.md`](../plans/2026-10-07-actions-on-the-menu-match.md).
What the front end still lacks is §5's list; R222.5's "does not yet" is superseded by this section.
PARITY-1 (the plan [`../plans/2026-10-08-web-sprint-parity.md`](../plans/2026-10-08-web-sprint-parity.md)) mounted the
page gaps the ACT audit found: the effective-action life model and its page and room handoff (research 251), the timed
holds in real time (252), WEAPON EXCHANGE (253), DEFAULT fire-mode timing (254), the shadow, the pixel ratio, the round
screens and the brightness (255), the explosives' commit rules (256), the shared effects (257) and the world drops (234
s6); §5's list is now PARITY-2's rows and the recorded exemptions.

## 11. The touch layer on both pages (PAR-5, PARITY-2, 2026-10-11)

Written for PARITY-2's row PAR-5 (the brief `../plans/briefs/2026-10-11-par5-touch-layer.md`; the parent plan's PAR-5,
audit A.5) on `agent/par5`, cut from `agent/parity-2` at d35dfe544. Source inspection and unit tests only: no browser,
no game, no capture. Nothing here is a parity value -- the touch layer is a **browser adaptation** (the PS2 has no touch
screen), and every behaviour it carries is `/testroom`'s as it stood at d35dfe544.

### 11.1 The reading (d35dfe544)

- **Which defect applies: the second.** The menu-launched match has no touch controls at all -- not a conflicting second
  root. `FRONT_END_CAPABILITIES.touch` is false (`matchCore.ts:113`); `pageEntry.ts`'s `clearPage` (:175, called at
  :220) removes `/testroom`'s markup, the touch layer and the tip with it, from the front end's page before the front
  end loads; `mountMatch` builds no layer (its canvas fixed over the window at z-index 1000, `matchMount.ts:271-279`);
  its WEAPON EXCHANGE prompt is drawn for the pad alone (`device: () => 'pad'`, `matchMount.ts:439`, research 253 §4).
  On a real touch device (OT.R29: START's exemption) the menu match therefore could be started and not played.
- **The document-wide lookups** that would conflict the moment a second root existed: `touch.ts:204-205` (`#touch-up`,
  `#touch-down`), `:230-232` (each stick's zone, base and knob), `:284` (`#touch-stance`), `:312` (`#touch-fire`),
  `:355` (`#touch-walk`) -- each `document.getElementById`, so a second copy of the markup would be found never, the
  first copy's elements twice; `:215` (`document.body`'s `touch` class) and `:218` (a `touchstart` listener on the
  global, never taken off); `main.ts`'s `#tw-weapons` (`document.getElementById`) and the tip's `#mobile-tip`
  (`Ui.showTip`, `ui.ts:938-949`). No listener of the layer was ever removed: `/testroom` lives as long as its page, so
  none had to be.
- **Where each page mounts it.** `/testroom` (`main.ts`): the lanes and `holdTouch` (:1016-1040), the pad's connect
  letting the sticks go (:1047), `releaseTouch` (:1082-1087), the merge and the flush in `padFrame` (:1114, :1132,
  :1187-1188), `attachTouchControls` (:1192), WEAPON EXCHANGE's INV (:1198-1203), its canvas taps (:1214-1220),
  `showWeaponsButton` (:1222-1226, called at :1505), `attachWalkTouch` (:1228), the tip (:1236-1240), the hook's
  `touchButton` (:2095). The menu match: none (above). `frontEnd.ts:632` mounts the front end's own 640 x 448 canvas
  (z-index 1000, :639; `attachMenuInput` on that canvas alone, :647) -- the menus have no touch control of their own;
  the match is mounted into `doc.body` (`frontEnd.ts:759`), over that canvas.
- **The release boundary.** OT.R29 (the owner, 2026-10-04: "controller support only";
  `docs/plans/2026-10-03-startup-options.md:25-33`) puts the keyboard in a development build only (`keyboardTesting.ts`, `test/build_keyboard.test.ts`)
  and OT.R38 (H115) the mouse look; the touch layer is neither -- it is not gated on `import.meta.env.DEV` and ships in
  a release, the input of the real touch device START lets in (`touch.ts` `touchDevice`: a coarse pointer that cannot
  hover). The layer's own rule is `wantsTouchControls` (a coarse pointer) or a touch event seen, never a window's width
  (OT.R29's review: the width rule withdrawn "for the gate and for the test room's touch layer"). WEAPON EXCHANGE's
  canvas taps on `/testroom` take any pointer (a tap or a click, `main.ts:1214-1220`); on the menu match a mouse click
  is not a release input (OT.R38), so there they are a touch's or a pen's alone.

### 11.2 The design

One part, `packages/viewer/src/matchTouch.ts`, both pages mount, scoped to a root element they hand it:
- `touch.ts` finds every element under the root it is given (`attachTouchControls`'s and `attachWalkTouch`'s new last
  argument, `TouchScope` `{ root, signal, win }`; the root defaults to the page's body, `/testroom`'s and the existing
  tests' case; an `[id="..."]` selector: jsdom's engine answers `#id` through the document's `getElementById`), puts its
  `touch` class on that root, and adds every listener -- the hybrid's `touchstart` too -- under an `AbortSignal`, so a
  dispose takes them all off.
- `mountTouch(root, deps)`: the touch lanes (`main.ts`'s `touchInput`, `touchLane`, `holdTouch`, `touchReleased`,
  `releaseTouch`), the sticks and the buttons, WEAPON EXCHANGE's INV and its showing (`showWeaponsButton`), the pad's
  `pad-on` on the root, the frame's end, the hook's read and `dispose`. A page with no layer in its markup (the menu
  match) has it built under the root, the same markup as `index.html`'s (`TOUCH_LAYER_MARKUP`, pinned to it by
  `test/matchTouch.test.ts`), placed over the match's canvas (a stacking context at the canvas's z-index + 1); the menu
  match also sets the two classes the stylesheet reads that `/testroom`'s `Ui` and frame set there (`is-walking`,
  `is-taunts-open`).
- `exchangeTaps(canvas, exchange, { touchOnly, signal })`: WEAPON EXCHANGE's taps on the open menu
  (`main.ts:1214-1220`), at the same place in `/testroom`'s listener order; `touchOnly` on the menu match.
- `promptDeviceOf(pads, otherwise)`: the prompt's `%c` -- a pad when one is connected, the touch label on a touch
  screen, else the page's own (`/testroom` the key, the menu match the pad: a release has no key, OT.R29).
- `mountTip(deps)`: the phone's tip (`main.ts:1236-1240`, `./mobileTip`'s rule unchanged), shown by the page's
  `Ui.showTip` on `/testroom` and by the part's root-scoped `showTip` on the menu match.

### 11.3 What landed, and what is still owed

- **Both pages mount the part.** `/testroom`: `mountTouch(document.body, ...)` where `attachWalkTouch` was, its stance
  and RELOAD gates as before (repair 2), `exchangeTaps(canvas, exchangePart)` where its canvas listener was (after the
  ARMORY's), `mountTip(...)` over its `Ui.showTip`; `touchInput` destructured from the part, so `padFrame` reads it
  unchanged. The menu match: `mountTouch` on its root (the body it is mounted into) with `build`, the same gates, its
  `PadWatch` toggling `pad-on`, the lanes merged and flushed where `/testroom`'s are (the hold's
  `flushedPad(touch.input, pad)`, the Chat menu's `mergeInput(touch.input, pad)`, the frame's end), INV and the layer's
  classes each frame, the prompt's device `promptDeviceOf(pads.count(), 'pad')`, and all of it let go at the teardown.
  `FRONT_END_CAPABILITIES. touch` is on (OT.R43: the two matches equivalent; `test/parityExemptions.test.ts` owes the
  front end nothing now).
- **`/testroom` unchanged but for the scoping**: the same lanes, gates, order of the canvas's listeners and hook
  (`weaponSelect().touchButton`); the layer's class and lookups are its body's, as before; its listeners now carry an
  `AbortSignal` it never aborts.
- **Held by** `test/matchTouch.test.ts` (two roots in one document, each driving its own lanes, one disposed and the
  other working, no `document.getElementById` / `querySelector` / `querySelectorAll`; INV and the canvas's taps; the
  device rule; the built layer pinned to `index.html`'s markup and taken out with its classes; the tip; the wiring of
  both pages) and `test/matchMount.test.ts` ("PAR-5: the dead exchange on coarse input": a coarse pointer and no pad --
  the layer built over the canvas, dead, the prompt naming `[INV]`, INV shown, its press opening WEAPON EXCHANGE, a
  touch on the open menu its tap and a mouse click not, the layer and its listeners gone at the close). Reading, pending
  review; unit tests only.
- **Found, not changed (source inspection, for the rendered check):** while walking on a touch screen the two stick
  zones (`styles.css`: `body.touch.is-walking #stick-zone, #aim-zone`, fixed, z-index 4, each half of the window below
  the bar) lie over the canvas, so on `/testroom` a tap on the open WEAPON EXCHANGE menu may land on a zone and start a
  stick rather than reach the canvas's tap listener; the menu match now has the same stacking. Changing it would change
  `/testroom`'s behaviour, which this row keeps; the brief's rendered check on a coarse pointer settles whether the taps
  reach the menu. INV (a button above the zones) and the pad are unaffected. **Confirmed rendered 2026-10-11 (PAR-5's
  review F1) and fixed by PAR-5a: §11.4.**
- **Owed:** the rendered check on a coarse-pointer device or its emulation on both pages (the brief's acceptance, the
  main merge controller's browser slot): the layer's stacking over the menu match's canvas (a wrapper at z-index 1001),
  whether the front end's body still carries `no-served` (which hides `#touch`, `styles.css:70`) on a path without the
  setup page, the zones over the canvas above, and the tip's place over the match. The menu match's development hook
  still reads `weaponSelect()` without `touchButton` (its type, `MatchWindowHook`, unchanged).

### 11.4 WEAPON EXCHANGE's taps through the zones (PAR-5a, 2026-10-11) -- F1 fixed

Written for PARITY-2's row PAR-5a (the brief `../plans/briefs/2026-10-11-par5a-exchange-taps-on-touch.md`) on
`agent/par5a`, cut from `agent/parity-2` at 0d9ad65ae. A **browser adaptation** (OT.R29's real-touch reading): it
changes nothing the game decides, only which element a finger reaches. Unit tests only; the rendered case is written,
not run (the gameplay seat runs the browser).

- **The defect (PAR-5's review F1, §11.3).** Walking on a touch screen, `#stick-zone` and `#aim-zone` (fixed,
  z-index 4) cover the window below the top strip, so the top element at WEAPON EXCHANGE's rows is a zone and a tap
  starts a stick; `exchangeTaps` listens on the canvas under them and never hears it. A touch-only player could open
  the menu (INV) and not pick a row.
- **The choice: (a), the layer yields while the menu is open.** The part sets `is-exchange-open` on its root each frame
  from `exchange.isOpen()` (`mountTouch`'s `weaponsFrame`, which both pages already call every frame: `main.ts`'s frame,
  `matchMount.ts`'s frame; no page file changed), and `styles.css` reads it: `body.touch.is-exchange-open #stick-zone,
  body.touch.is-exchange-open #aim-zone { pointer-events: none; }`. The class is one of the part's root classes, taken
  off at `dispose`; its `is-` prefix is the state classes' rule (`test/chrome_classes.test.ts`, as `is-taunts-open`).
  Why (a) over (b) (a second capture listener on the touch root): it is the smaller change and keeps one listener for
  the menu's taps; and it is right on its own -- the open menu holds the pad's inputs (`setInputSuspended`
  while `exchange.isOpen()`, both pages' `padFrame`), so a stick started over it would drive nothing. INV and the walk's
  buttons (`#touch-walk`) are outside the zones and still take their presses (INV closes the menu, as R2 does). Both
  pages' roots are their bodies (`main.ts`'s `document.body`, the menu match's `doc.body`, §11.3), so the `body.`
  selector is the stylesheet's own convention for the layer's classes.
- **Held by** `test/matchTouch.test.ts` ("PAR-5a: the open menu takes the screen"): the class follows `isOpen()` frame
  by frame and goes at `dispose`; the stylesheet's one rule on it names the two zones and sets `pointer-events: none`
  (jsdom hit-tests nothing, so the class and the rule are pinned apart). The rendered case, `e2e/touch.spec.ts`
  ("WEAPON EXCHANGE on a phone (PAR-5a)"): an emulated phone (812x375, touch), `/testroom`'s offline match on Frostfire
  (`?map=MP2&mode=play&devmode&noarmory&kit=...`, the page's own loopback room), walking; the SEAL killed by its own
  grenade (`throwGrenade(4 / 60, true)`, as `e2e/weaponExchange.spec.ts`) -- the gate open (in the match, dead, the
  camera on self, no spectator); INV tapped through `Input.dispatchTouchEvent`; then the third row's bar centre
  (`LIST_LAYOUT.bar`, i = 2), placed on the canvas's box by `frameOfPoint` undone, hit-tested as the canvas and tapped:
  the picker opens on slot 2 and no stick starts. **Written, not run**: reading, pending review, and pending the
  gameplay seat's rendered run.
- **A stick held as the menu opens** (the review's F1, 2026-10-11): `touch.ts`'s `wire` lets go only on the zone's
  `pointerup` / `pointercancel`; the zone captured its pointer (`setPointerCapture`, and a touch's implicit capture), so a
  finger lifted after the zone turned `pointer-events: none` still ends the stick there (the Pointer Events rule; source
  reading). A second rendered case holds it: finger 2 drags the move stick, finger 1 taps INV, finger 2 lifts under the
  open menu -- the stick's base hidden; INV again, and nothing walks (`moveX` 0). Written, not run.
- **Not changed:** the other tops the rendered check found at some frame points -- `/testroom`'s panel (folded on a
  phone's first visit) and the phone's tip (dismissable, `TOUCH_TIP_MS`) -- are page chrome over the menu, not the
  touch zones; the brief names the zones alone. Whether a row under the open panel or the tip should take the tap is
  for the rendered run to report.
