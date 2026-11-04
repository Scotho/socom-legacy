# 250 -- The actions on the menu-launched match, as built (ACT-1..ACT-6)

- Date: 2026-10-07 (between web sprints 31 and 32, the gameplay track; plan
  [`../plans/2026-10-07-actions-on-the-menu-match.md`](../plans/2026-10-07-actions-on-the-menu-match.md), rulings
  ACT.R1-ACT.R6). ACT-1 opened this note: sections 0-2 and 9. Each later task adds its own section (3 ACT-2, 4 ACT-3,
  5 ACT-4, 6 ACT-5, 7 and 8 ACT-6).
- Status: **as built; no reading.** Nothing here reads the original anew. Every value is sprint 27's, 30's or 31's,
  already in the ledgers at the confidence its own note gives it (research 213, 214, 215, 216, 222, 239). What is new
  is a MOUNT: the front end's match (`packages/viewer/src/matchMount.ts`) mounts sprint 27's action part as `/testroom`
  (`main.ts`) does, plus its tests. No game, emulator or browser was run. No server was contacted except the tests' own fake socket.
- Sources: research [222](222-the-match-on-one-wiring.md) §2.5, §5, §7-§9 (the part, "not mounted", the shape of a
  part moved); [214](214-demolition-as-built.md) §1, §3, §4, §7 (the bomb's wire, its drawing, the context and its
  cancel rule, the lines `/testroom` gives the part) and its amendment of 2026-10-07 (the Satchel);
  [215](215-emplaced-weapons-as-built.md) §6-§7; [166](166-the-loading-screen-from-the-lobby-to-the-match.md) §8 (the
  match's world in the front end's page); [92](92-doors.md); [86](86-traversal.md).

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R250.1 | **Three flags, one mount** (ACT.R1). `mountActions` requires the door and traversal pages it picks among, so the front end's switch (`FRONT_END_CAPABILITIES`, `matchCore.ts:88-91`) turns `doors`, `actions` and `traversal` on together. `worldDrops`, `armory`, `exchange`, `touch`, `tacMap`, `shadow` and `hostages` stay off | `MATCH_MOUNT_PARTS_PLACEHOLDER` names the three in its mounted half; `test/matchCore.test.ts` pins the literal | §1 |
| R250.2 | **No new hook, no new wire** (ACT.R2). The part reaches the room through the lobby's client (`RoomEvents.follow`, `client.doors()`, the sends). `PART_DEPS` gains nothing | 0 lines in `main.ts`, `room.ts`, `protocol.ts`, `codec.ts`, `netPage.ts`, `hud.ts`; protocol 10 | §1 |
| R250.3 | **The room needed nothing.** It already takes `door`, `action`, `mount` and `bombAction` from any seated player, and it hands the bomb over by its proximity sweep | the playtest's "can't be picked up" was the PAGE's: the room did pick the bomb up, and the menu path drew none of it | §2 |
| R250.4 | **One line has no `main.ts` twin: the adoption's replay.** `/testroom`'s client is new, so its welcome comes after `acts.follow`. The lobby's client was welcomed in the lobby, so the mount replays the adopted events to the part (`matchMount.ts:424`), as `NetPage` replays them to itself | without it, a match mounted after its round began draws no bomb until the bomb next changes state (the late joiner's case, and any `bomb` frame heard while loading) | §2 |
| R250.5 | **The water's splash on the menu path is owed**, not built | `/testroom` sends it through a window event `main.ts` listens for; the shared path touches `main.ts` | §9 |

## 1. The mount as landed (ACT-1)

`matchMount.ts` at the ACT-1 commit; every line is `main.ts`'s, and each carries a comment naming its `main.ts` origin
(`main.ts` lines at base `1b5015f2`).

| what | `main.ts` | `matchMount.ts` |
|---|---|---|
| the traversal page | L215-218 `new TraversalPage(walk, { play, land })` (`bindKeys`, `keysOpen` keyboard-only: not mirrored, OT.R29) | L206-212, after `walk`; `play` / `land` on `sound.audio` (read at a call: `sound` is made at L257 below) |
| the doors page | L226-233 `new DoorPage({ grid, feet, aim, sound, move, net })` | L217-226, after `remote`; `sound` on `sound.audio`, `net` the open adopted client |
| the hands | L487 `throws.hands({ trigger, magazine, mounted })` -> `acts` | L278 the same three (`acts` declared after the firearm, read at a call, as `main.ts`'s L487 before L783) |
| the part | L783-797 `mountActions({ walk, fly, doors, traversal, grenade, remote, net, map, view, world, bombView: { roundAudio, hud, remotePlayers, effects, worldBomb }, win, drops, turret, hostages })` | L280-289 the same shape; no `drops` (the world drops are off, H120), no `turret` block (ACT-2's), no `hostages` (ACT-5's); `bombView.worldBomb` is `throws.grenade.worldBomb()`, bomb-floor's Satchel (`BOMB_MODEL_READING`) |
| the clips | L994 `traversal.setClips(message.data)` beside `play.setClips` | L362 beside `play.setClips(clips)` in `place()` |
| the map | L1881 `doors.setMap(map.doors, map.ground)` after `walk.setGround` | L383 after `walk.setGround` in `place()` |
| the follow | L1720/L1738 `acts.follow(net.client)` after `new NetPage` | L420 after `net = new NetPage(...)` in `join()`; L424 the adoption's replay (R250.4) |
| the frame | L1521 `traversal.input()`; L1530 `net?.frame(..., fire.triggerHeld() \|\| acts.triggerHeld())`; L1534 `acts.followNet()`; L1537 `doors.frame(dt)`; L1538 `acts.turrets.frame()`; L1539 `pageWorld?.step(dt)`; L1540 `firearm.fireFrame`; L1541 `acts.turretFrame(dt, walk.isDead())` | L487 `traversal.input()` before `walk.frame`; L496 the trigger's OR; L497 `acts.followNet()`; L498 `doors.frame(dt)`; L499 `acts.turrets.frame()`; then the world's step and `fireFrame`; L502 `acts.turretFrame(dt, walk.isDead())` |
| the HUD | L1571 `acts.bomb.hudFrame()`; L1573 `traversal.effectsFrame()` | L518 `acts.bomb.hudFrame()` (the first RED needs the marks, §2); L519 `traversal.effectsFrame()`. `traversal.hudFrame(hud)` and `feedHud`'s `climb` / `nearby` are ACT-4's |
| the teardown | L1667-1668 `acts.unlock(); acts.follow(null)` before a client closes | L556-558 `acts.unlock(); acts.follow(null); acts.dispose()` (the blur listener let go) |
| the hook | `__viewer` | L537 `hud: () => hud.state()` (`MatchWindowHook.hud`, L173); ACT-4 adds the rest |
| the switch | `TESTROOM_CAPABILITIES` | `matchCore.ts:90` `doors: true, actions: true, traversal: true`; the `actions` JSDoc L54-57, the switch's L83-86 |

No line is written twice: the part, its pages' tables and its lifecycle stay in `./matchActions` and its modules; the
front end makes no `RoomEvents`, `ActionPage`, `TurretPage`, `BombPage`, `ActionWiring` or `TurretTrigger` (pinned on
both pages, `test/matchActions.test.ts`). `walk.setActionFilter` is now set on the front end's walk (by the part): a
walk action no page takes goes to the traversal (the climb), as on `/testroom`. Cross reaching the part is ACT-3's lane
line (`lanes.action = acts.lanes`): until it lands, Cross on the menu path still reaches neither the part nor the walk's action.

The tests (`packages/viewer/test/matchMount.test.ts` unless named): the first RED (§2);
`it("the doors follow the room: the snapshot's door wire swings ...")` (Frostfire's `bdoor_4` off
`test/golden/doors.json` on a prop of its path: the leaf's matrix moves, `.DOOR_WOOD_OPEN` on the match's own audio);
`it("the door's action under the reticle sends the room a door event ...")`; `it("the turret: a turret event seating
this page locks the walk ...")`; `it("the switches and the bomb follow the lobby client from the join ...")`;
`it("the traversal: the clips reach it with the body's ...")`; the text pins `it("the follow lines: ...")` and
`it("the frame order mirrors main.ts: ...")`; `test/matchActions.test.ts` `it("matchMount.ts calls mountActions with the
same deps shape main.ts does ...")`; `test/matchCore.test.ts` the switch's literal; `test/matchThrow.test.ts`'s hands
pin flipped (both pages now hand the turret's three, where the front end handed `throws.hands()` bare). Mutations checked: the follow line
dropped turns the bomb test red at its first mark (`[]`, no `ret_bomb`): the frame's `followNet()` then follows the
client late and its reset wipes what the replay told the part, so the follow must come before the replay. The
trigger's OR dropped turns the turret test red (`NetPage.frame`'s trigger `false` while mounted).

## 2. The playtest's bomb on the menu path

The owner's playtest of 2026-10-06 found that "the bomb can't be picked up". The only written trace is research 214's
amendment (commit dcf5a6f0 on `agent/bomb-floor`, "the bomb ... underneath the floor"): C4's placed model, centred
on its origin, showed only a sliver above Crossroads' 47.500 floor at StartBomb's 47.334. bomb-floor redrew the world
bomb as the fittings' `Satchel`, standing on its origin.

On the MENU path the page had no `BombPage` at all, because `FRONT_END_CAPABILITIES.actions` was off and nothing
mounted the part. So there was no world bomb (`bombView.worldBomb` is the part's), no `ret_bomb` / `ret_base` on the
compass (`BombPage.hudFrame`), no "THE BOMB HAS BEEN PICKED UP" (the cues go through `bombView.roundAudio`), no Satchel
on the carrier's body and no `bomb` prompt at the tent. Meanwhile the room did all of its part: `BombAuthority.reset`
told every page the bomb at StartBomb, its proximity sweep handed the bomb to the first living player within 20 u, and
it told the pages so. A player saw none of it. That is "can't be picked up" as a player sees it.

The first RED, `it("the playtest's bomb: the welcome's objective (state 1 at StartBomb) draws the world bomb and marks
ret_bomb on the HUD; a bomb frame naming this seat the carrier marks ret_base at its side's site and takes the world
bomb away -- on the lane none of it (no BombPage on the front end)")`, runs on a synthetic DEMOLITION map (the two
tents' MPBOMB records, the Satchel's model as data). On the lane it failed: the HUD's `extraMarks` was `[]`. With the mount, the
welcome's objective draws the Satchel at StartBomb and marks `ret_bomb`; the carrier's frame marks `ret_base` at the
Terrorists' tent and hides the world bomb.

Writing it found R250.4. The lobby heard the welcome before the match was mounted. `acts.follow(net.client)`
subscribes from then on, so the objective in that welcome never reached the part. The mount replays the adopted events
to the part (`acts.roomEvents.emit`, `matchMount.ts:424`). Without that line the test stays red even with the part mounted.
The browser's proof on Crossroads (pickup, plant, defuse, detonation from the lobby) is ACT-6's.

## 3. The turret (ACT-2)

**What.** The menu-launched match's turret is `/testroom`'s as `agent/turret-feel` left it (research 215 §7, on main):
the turret anim set's clips asked of the worker, the mount's seat clip and hold on the bodies, `.GRAB_TURRET` and
`.RELEASE_TURRET` on the match's audio, the mounted body's hand choosing its mount clip, this page's own turret round
drawn from the firepoint, and another's round flashed there. ACT-1 had brought the lock, the trigger, the HUD's box
(`throws.hands`' three) and the frame's two turret lines; ACT-2 adds the five lines `main.ts` has and the front end
lacked, each commented with its origin, and the hook's two turret reads. Nothing in `main.ts`, `walk.ts`,
`remotePlayers.ts` or any ACT.R2 file changed: the seat's steer (`Walker.glide`) is the room's and the walk's, already shared.

| `main.ts` (this tree) | `matchMount.ts` | whose |
|---|---|---|
| L925 `askPlay`'s list `[..., ...BINOCULAR_CLIPS, ...TURRET_CLIPS]` (import L76) | L220 `MATCH_CLIPS` gains `...TURRET_CLIPS` (import L22) | ACT-2 |
| L494 `hands: throws.hands({ trigger, magazine, mounted })` | L338 | ACT-1 (pinned again with the turret's lines) |
| L496 `mountedMuzzle: (id) => acts.turrets.muzzleOf(id)` | L339, on `mountFirearm` | ACT-2 |
| L822-827 the `turret` dep: `sound` (`gameAudio.play(name, at, 'play', 1)`), `bodyFeet`, `clips`, `hand`, `round` | L352-357 on the `mountActions` call, `sound` on `sound.audio.play(name, at, 'play', 1)` (the match's own `GameAudio`); `hand` reads the lobby client's bodies (`net?.client`) as `main.ts` reads its own client's | ACT-2 |
| L830-831 `walk.setMountPose(...)`, `remote.setMountPose(...)` after the part | L360-361, after the part | ACT-2 |
| L2201-2202 `__viewer.turrets()`, `turretParts()` (`./turretHook`) | L696-697, the hook object's last two reads after ACT-4's `waiting`; `MatchWindowHook` L215-216 typed as `ViewerHook`'s members (`NonNullable`), so `e2e/menuMatch.ts`'s `ACT2_READS` match by construction | ACT-2 |

`map` stands where `main.ts` reads `loaded`, as in every mirrored line of the mount. The hook is a development
build's only (`MATCH_WINDOW_HOOK`), as ACT-4's reads are.

**The tests** (`packages/viewer/test/matchMount.test.ts`,
`describe("ACT-2: the turret on the menu-launched match (research 215 s7, turret-feel mirrored)")`). The synthetic map
stands on a floor and carries one Vigilance-shaped placement as data (`mp51_turret03`: PKM TURRET, 750 rounds, yaw
-70..70, pitch -45..45, reach 22, a firepoint matrix; research 215 §2-§3), its gun a drawn prop at the gun's path. No disc.
- `it("a turret event seating this page: the HUD's box reads the turret's rounds with no spare (TURRET_AMMO_HUD_READING:
  750/750/0 on a synthetic mp51_turret placement), R1 claims a turret round of the room (a fire event, weapon 0, the
  drawn round's muzzle and rolled line, the view's eye) at the record's cadence and never the rifle's")`. The arsenal's PKM record (id 205) sets a 0.1 s
  cadence: one claim at the press, none 0.096 s later, the second at 0.1 s; each drawn here through `turretRound`
  (`Fire.drawRound` with the PKM's id and the count from the mount); `Fire.pull` never called. RED before ACT-2 at the
  draw (`[]`): the box, the claims and the cadence were already ACT-1's. *(Retitled 2026-10-12 by PAR-55, research 215
  s8: the box is the kit's holding the turret's weapon -- 250/250 and 2 MAGS, its icon and its own fire mode.
  Retitled 2026-10-18 by TURRET-CONE, research 215 s8.2: the claim is the round the page draws, its muzzle and its line
  rolled on the turret's cone, the eye the view's; was "(a fire event, weapon 0, from the view's ray)".)*
- `it("the mount pose: the own body takes the turret's clip through walk.setMountPose and a mounted other through
  remote.setMountPose; the mount's sound plays on the match's audio at the placement")`. The own hand (`walk.hand()`
  stubbed to the pistol) picks `seal_p_stand2turret`; another with no body of its slot takes the rifle's
  `seal_stand2turret`; `.GRAB_TURRET` at the own feet and at the other's drawn feet, `.RELEASE_TURRET` at the release,
  all through the match's `GameAudio`; another's `shot` flashed at `TurretPage.muzzleOf`'s frame (`mountedMuzzle`).
  "At the placement" means at the seated body's feet, where `TurretPage` plays it (research 215 §7).
- `it("the hook (a development build): turrets() lists the placements with placementView's numbers and the held one;
  turretParts() the drawn parts under the roots")`. `turrets()` equals `placementView` of the placement plus the
  part's `TurretPage.stats()`, then `held` 0 and `turret_dismount` once seated; `turretParts()` lists the gun alone (the
  crate is not under the root) and equals `drawnTurretParts` over the drawn scene.
- `it("turret-feel's five main.ts lines are matchMount.ts's: TURRET_CLIPS in the clips list, mountedMuzzle, the turret
  dep's five, the two setMountPose")`. The same expressions on both pages, `main.ts`'s `gameAudio` and `loaded` against
  the mount's `sound.audio` and `map`; the hands' three (ACT-1's) and the hook's two reads pinned in the same test, the
  reads last after `waiting`.

RED before ACT-2: all four (the box and the cadence passed, the draw did not; `setMountPose` never called;
`h.turrets` undefined; the clips list without `TURRET_CLIPS`). The browser's proof on `mp51_turret03` from the lobby is
ACT-6's (`e2e/menuVigilance.spec.ts`, which reads `turrets()` and `turretParts()`).

## 4. The lanes and the cancels (ACT-3)

**What.** Cross on the menu-launched match's pad is the action button as the player update reads it (ruling ACT.R3;
the lifecycle and the cancel rule are research 214 §4's, `actionContext.ts` `ActionLifecycle` and `CancelCause`). The
press holds the context in reach, a held press at a plant site runs the room's hold (the commands' `ActionHeld`), the
release fires the one-shot context picked then, and a cancel is never a release. Every line is `main.ts`'s, each
commented with its origin (`main.ts` lines on this tree, after main `5eab5b16`); the part's lane itself
(`acts.lanes`: the press, the hold, the release, PF-34's `elapse`, `traversal.padLanes`) stays in `./matchActions`,
handed to `playerLanes` by both pages with one line written alike.

**The order as built** (`matchMount.ts` `padFrame`, L502-539), `/testroom`'s past its loading branch:

| step | `main.ts` | `matchMount.ts` |
|---|---|---|
| the loading hold's cancel | L1181 `if (acts.wiring.lifecycle.down()) cancelAction('loading')` in the `loadingJoin.blocked` branch | L510 `if (held && acts.wiring.lifecycle.down()) acts.cancel('loading')`, under `o.blocked()` |
| the pad watch, polled first | L1165/L1184 `pads.poll(navigator)` | L512 `pads.poll(nav)`, before `gamePad.poll(nav)` (the same `nav`) |
| the hold's flush, the camera, the trigger | `flushedPad`, `feedCamera`, `trigger(input.fire)` | unchanged (L516-525) |
| the R2 inventory's frame | `inventory.frame(padMerged, input, dt)` | L527 `throws.inventory.frame(padMerged, input, dt)` |
| the menu's cancel, before the lanes | L1229-1231 `over` / `menuOver`: `cancelAction(over); stanceButton.reset()` | L528-532: `'menu'` when the R2 inventory or the Chat menu opens (`chat.owns` is the front end's `menu`; no ARMORY, so no `'armory'`), with `stanceButton.reset()` |
| the lanes | L942 `action: (before, after, dt) => { acts.lanes(before, after, dt); }`; L1240 `playerLanes(...)` | L494 the same line in `lanes`; L535 `playerLanes(lanes, padGame, game, dt, { walking, menu: chat.owns })` |
| the frame's end | L1246 `acts.wiring.endFrame()` | L538 `acts.wiring.endFrame()` |

**The cancels** (214 §4's rule: blur, menu, armory, pad lost, death, touch; and the loading hold):

| cause | on the front end | how |
|---|---|---|
| `'blur'` | yes | the part's own (`matchActions.ts`: `win`'s `blur`; ACT-1) |
| `'menu'` | yes | the R2 inventory's or the Chat menu's opening (L530-531) |
| `'loading'` | yes | `LobbyMatch.blocked` with Cross down (L510) |
| `'padLost'` | yes | a `PadWatch` (`gamepad.ts`) beside the front end's `GamePad`: `cancel: () => { acts.cancel('padLost'); }` (L487), attached to the match's window (L489; its two listeners let go at the teardown, L625), polled first in `padFrame` |
| `'death'` | yes | `died: () => { acts.cancel('death'); }` in `matchNetDeps`' hooks (L445; `NetPage` calls it on the own `kill`) |
| `'armory'` | no | no ARMORY on the front end |
| `'touch'` | no | the touch layer is off on the front end (ACT.R1): no `'touch'` cancel path (§9) |

**No `ExchangeInput`: nothing to order.** `/testroom` owns WEAPON EXCHANGE's held buttons ahead of the trigger and the
lanes (research 300 §3); the front end has no WEAPON EXCHANGE (`FRONT_END_CAPABILITIES.exchange` off), so there is no
owned-button pass to place against sprint 30's pickup hold (pinned: `test/matchLanes.test.ts`, "the front end has no
WEAPON EXCHANGE").

**PF-34's `elapse` runs with no drops.** `acts.lanes` calls `wiring.lifecycle.elapse(dt, dropAhead() !== null)`; with
the world drops off (H120) `dropAhead()` is always null, so `inReach` is false and the pickup hold never counts. No
line is added for it.

**One mount line with no `main.ts` twin, said:** the watch's listeners are attached through a small target that
records them so the teardown can take them off (`PadWatch` has no detach, and `/testroom`'s lives as long as its page);
the match's window must hold no listener after a release (the mount's own test pins it).

The walk's filter (`walk.setActionFilter`, set by `mountActions`, ACT-1) is reached on the menu path for the first
time: a release no page takes runs the walk's own action (the climb, `Traversal.action`, `Button.Action` on the
command); a release a page took runs the page's alone.

The tests (`packages/viewer/test/matchMount.test.ts`, `describe("ACT-3: the hold on Cross (XR-06's lifecycle on the
menu-launched match)")`): `it("a Cross held into a plant site (the carrier at the site): the commands sent carry
Button.ActionHeld, the lifecycle holds bombPlant, the release fires nothing and sends no door/action event")`;
`it("Cross released on a door under the reticle fires the door's send once; the walk's filter is told a page took it
(no Button.Action on the command, no climb)")`; `it("Cross released with no page context runs the walk's own action
through the filter (walk.setActionFilter, set by mountActions): the climb, as /testroom's; a release with a page
context runs the page's and not the walk's")` (the ACT-1 review's); `it("the R2 inventory's open is a cancel ('menu'):
...")`; `it("the Chat menu's open is a cancel ('menu') too: ...")` (the ACT-3 review's: `playerLanes` skips the
action lane while the Chat menu owns the pad, so without `chat.owns` in `over` a plant's hold would have no end);
`it("the loading hold (LobbyMatch.blocked) cancels a hold ('loading'); a pad pulled mid-hold is a cancel
('padLost', PadWatch), ...; the own death cancels ('death', MatchNetHooks.died)")`; the text pin `it("the lane order:
triggerLane, the inventory's frame, then playerLanes' action lane ..., then endFrame -- main.ts's order, pinned by
text")`; and `test/matchLanes.test.ts` `it("the front end: the action lanes since ACT-3 (acts.lanes through
LaneParts.action), the same line main.ts has")` (retitled from "the front end: no action lanes"). Mutations checked:
the `'menu'` cancel dropped turns the R2 test red with a door sent (`['door']`); the watch's poll dropped turns the pad
test red the same way (the vanished lanes' release fires the door). The `chat.owns` half of `over` dropped turns the Chat menu test red (no `'menu'` cancel: the hold stays down).

## 5. The HUD and the hook (ACT-4)

**What.** Ruling ACT.R4: the front end's `Hud` draws the context's prompt, the climb, the ladder slide, the bomb's
marks and its fuse through the same lines `main.ts` has. The development hook reports what the menu-path specs read
(`e2e/menuMatch.ts` `ACT4_READS`). Each line is `main.ts`'s and carries a comment naming its origin. No `teleport` on a
served match. Nothing in `main.ts`, `hud.ts` or any other ACT.R2 file changed.

**The HUD lines** (`main.ts` lines at this commit; ACT-1 and ACT-5 had brought three of them forward):

| `main.ts` | `matchMount.ts` | whose |
|---|---|---|
| L1601 `traversal.hudFrame(hud)` | L576 | ACT-4 |
| L1602 `acts.bomb.hudFrame()` | L577 | ACT-1 (its first RED needed the marks) |
| L1603 `hostages.frame()` | L578 | ACT-5 |
| L1604 `traversal.effectsFrame()` | L579 | ACT-1 |
| L1605-1608 `firearm.feedHud(walking, { climb: traversal.hudClimb(), nearby: acts.prompt(walking) })` | L580-583, in place of the bare `feedHud(walking)` | ACT-4 |

The order is `main.ts`'s, after `hud.setVisible(walking)` and before `hud.setHostageMarks` and `hud.render`. A text pin
holds the order on both pages; until ACT-4, no pin held it.

**The `if (renderer)` gate: kept.** On the front end these lines sit inside `if (renderer) { ... }`, while in `main.ts`
they are not gated. They are still the same lines in the same place. `main.ts` runs them in its draw section, after
`render(scene, fly.camera)`, and `/testroom`'s renderer exists before its first frame. So "unconditional" there means
"every frame that draws". The front end's `if (renderer)` block is its draw section. The renderer is missing only
before the renderer module has loaded, or after it failed to load ("the match would not draw"). In those frames nothing
is drawn, so there is no HUD to feed. One divergence follows. While no renderer exists, `hostages.frame()` does not
mark the hostage order stale, so the lane's press would read the last offer. On the menu path that cannot be reached
(no lobby map has hostages, ACT.R6), and no player is looking at a match that does not draw. Moving the five lines out
of the gate would split `main.ts`'s order around `hud.setVisible`, for no frame anyone sees.

**The hook's reads** (`MatchWindowHook` L185-197; the object L611-626, after `aimAt`, so ACT-2's `turrets()` and
`turretParts()` go after `waiting`). Each read is typed as `./hook`'s `ViewerHook` member (a type import), so the specs'
`ActionReads = Pick<ViewerHook, ...>` matches by construction:

| read | `main.ts` (`__viewer`) | `matchMount.ts` |
|---|---|---|
| `hud()` | L2153 `hud.state()` | ACT-1's (L601) |
| `feet()` | L2068 `walk.feet()` | the same |
| `setCamera(pose)` | L2023 `walk.setCamera(pose, playOn && !FLY.toggle)` | `walk.setCamera(pose, true)`: the menu match is played on foot with no fly toggle |
| `pose()` | L2024 `fly.pose()` | the same |
| `floorUnder(x, z, y, from)` | L2069-2072 `selectFloor(probeGround(grid, x, z), from + STEP_PROBE_LIFT_READING, y)` | the same call (the walk's floor pick, `FUN_005b5d40`) |
| `doors()` | L2104 `doors.stats()` | the same |
| `traversal()` | L2096 `traversal.stats()` | the same |
| `worldStates()` / `worldActive(path)` | L2106-2107 on `pageWorld` | the same, on the page's world (`world?.world`, `./matchWorld`) |
| `alive()` | L2141 `weaponSelect().gate.alive` (`exchangeGate()` L437: `net.gate()`, or alive with no match) | `net ? net.gate().alive : true` |
| `waiting()` | L2101 `net().waiting` (`net.waitingRoom()`) | `net?.waitingRoom() ?? true` (no NetPage yet: still waiting, the default `crossroads.spec.ts` reads) |

**Not added: `bomb()`.** The dispatch names `bomb()` = `acts.bomb.state()`, and `ACT4_READS` lists it. `/testroom`'s
hook has no such line: `crossroads.spec.ts` reads the bomb from the room's `bomb` frames on the socket, and so do the
menu specs (`MenuPage.bombs`; none of them calls `bomb()`). The brief's rule for a read with no `/testroom` line is to
stop on that read and report it. It is reported to the controller. The hook test pins its absence
(`'bomb' in h` false). Until the controller's call, `missingReads(ACT4_READS)` in `menuMatch.ts` reports `bomb`.

**The tests** (`packages/viewer/test/matchMount.test.ts`):
`describe("ACT-4: the HUD's prompts on the menu-launched match")`:
- `it("a door under the reticle puts door in the HUD's action slot; on a ladder ladder_slide; at a plant site with the
  bomb carried bomb; the defuse's prompt is DEFUSE_PROMPT_ICON_READING; none off the walk or dead")`. It also checks a
  ledge in reach shows `climb` (the `climb` feed).
- `it("the bomb's marks and fuse reach the HUD through bomb.hudFrame once a frame: ret_bomb/ret_base in extraMarks, the
  fuse in defuseTimer while planted")`. This one was already green before ACT-4, because ACT-1 brought
  `acts.bomb.hudFrame()` forward. It pins that line once a frame, and the fuse given back at a decided bomb.
- `it("the hook (a development build): hud, feet, setCamera, pose, floorUnder, doors, traversal, worldStates,
  worldActive, alive, waiting -- present under DEV, gone at the teardown; the production build folds it away
  (build_keyboard.test.ts's scan covers MATCH_WINDOW_HOOK)")`. The dispatch's title also listed `bomb`. It was taken
  out because the read was not added.

`describe("ACT-4: the HUD lines are main.ts's (ACT.R4)")`:
- `it("the four HUD lines are main.ts's: traversal.hudFrame(hud), acts.bomb.hudFrame(), traversal.effectsFrame(),
  feedHud's climb and nearby")`
- `it("the HUD lines' order is main.ts's: traversal.hudFrame(hud), acts.bomb.hudFrame(), hostages.frame(),
  traversal.effectsFrame(), firearm.feedHud(...), after hud.setVisible")`

The synthetic DEMOLITION map stands on a floor and carries the two tents' MPBOMB records as data. The door under the
reticle (`DoorPage.target`) and the ladder or ledge (`TraversalPage.traversal`) are the pages' own answers, stubbed.
The picker, the HUD and the bomb's eligibility run for real. The turret's box on the HUD (`throws.hands`' `magazine`)
is ACT-1's line, and its proof on a placement is ACT-2's.

## 6. The hostages (ACT-5)

**What.** HX.R8's "sprint 32+ row" (the hostage plan L63): the front end's switch turns the `hostages` part on
(`FRONT_END_CAPABILITIES.hostages: true`, `packages/viewer/src/matchCore.ts`) and `matchMount.ts` mounts HX-4a's and
HX-5's lines exactly as `main.ts` has them (research 239 §7.1, §7.2), each commented with its `main.ts` origin. The
mount's `map` stands where `main.ts` reads `loaded`. Nothing new is shared: `HostagePage` (`./hostagePage`),
`pickSurfaces` (`./net/hostageOrder`), `aiCellOf` (`@s2u/scene`), `NetPage.hostages` / `hostageOrder` /
`hostageMarks` and `Hud.setHostageMarks` were all written once by HX-4a/HX-5; the escortee's YES already rode the sound
part (`sound.netDeps()`, `escorteeVoice`) on both pages.

**The lines** (`packages/viewer/src/matchMount.ts` as landed on `agent/act5`):

| line | what | `main.ts`'s |
|---|---|---|
| 2, 11, 19 | the imports: `aiCellOf`, `HostagePage`, `pickSurfaces` | L7, L84, L85 |
| 211-223 | `const hostages = new HostagePage({...})` after `remote`, with `HostagePageDeps`' members: `self`, `hostages`, `feet`, `aim`, `bodies`, `surfaces`, `cellOf`, `order` (eight; the dispatch and the test's title say "nine") | L763-775 |
| 387 (`matchMount.ts:577` on 2026-10-11) | `hostages.reset()` in `roundClear` (the front end's round start and abandon, the ARMORY being off) | none: see below |
| 393 | `hostageState: (ev) => hostages.state(ev)` after `...sound.netDeps()` in `matchNetDeps`' rest | L1694 |
| 493 | `hostages.frame()` after `hud.setVisible(walking)`, before `firearm.feedHud` | L1572 |
| 495 | `hud.setHostageMarks(net?.hostageMarks(map?.ai) ?? [])` the line before `hud.render` | L1578 |
| 538 | `hostages.reset()` at the teardown (the front end has no `connectNet`; its teardown is the room left) | L1670 |

**Where the reset is.** `main.ts` resets the part once, at `connectNet` (a map or room left), beside `drops.reset()`; its
round hooks (`armoryRoundHooks`' `clearAir`) reset the drops but not the hostages. The front end has no `connectNet`:
the teardown is the room left, so the reset is there (L538). The dispatch also asked for it in `roundClear` (L387): the
front end's round start and abandon (`matchNetDeps` runs `roundClear` as `newRound` and `abandoned` with the ARMORY
off). That is one line more than `/testroom` has. It changes nothing a player sees, because the page asks the offer again
every frame (`frame()` marks it stale), so a reset only drops a cached offer one frame early. It is kept so that nothing
offered in one round outlives the round start.

**Handed to the actions: owed at ACT-1's merge.** `main.ts` hands the page to `mountActions` (`hostages,` L796): the
action button's `escortee` context (the offer as its input, `fire()` as its press). `matchMount.ts` makes no
`mountActions` call on ACT-5's base: ACT-1 adds it in the same wave. The `hostages,` line in that call is the 3-line
rebase the merge controller makes at ACT-1's merge. The text pin accepts either state: no `mountActions({` in the file,
or one whose deps carry `hostages, // HX-4a`.

**The pins flipped.** `test/matchCore.test.ts` (the switch's literal: `hostages: true`); `test/matchNet.test.ts`
(`hostageState` owed from both pages; the typecheck's front-end line flipped from "refused" to "owed", and its success
line gains `hostageState`; the text pin now reads both pages' `hostageState` line after `...sound.netDeps()`);
`test/matchMount.test.ts` ("ACT-5: the hostages part on both pages (HX-4a, HX-5; ruling HX.R8 closed)": the
`matchMount.ts` text pin; the behaviour on the lobby's client in a welcome with a hostage: its `hostageState` reaches
the page's `HostagePage`, an escortee under the crosshair, alive and in range, is offered FOLLOW! with the `escortee`
prompt, and the fire sends `hostageOrder`; the `main.ts` pin kept). `MATCH_MOUNT_PARTS_PLACEHOLDER` names the hostages in
its mounted half: "(unreachable from the lobby until Desert Glory is listed: ACT.R6)".

**What is reachable: nothing from the lobby.** `lobby.ts` `FIRST_RELEASE_MAPS` is `['MP2', 'MP51', 'MP72']` and the
lobby refuses any other map when a game is created (`firstReleaseMaps.test.ts`). The owner's word of 2026-10-07 (ACT.R6:
"Only once tested and validated (hostages / dg). We're staying focused on the main three first.") keeps the list at those three. On Frostfire,
Vigilance and Crossroads the welcome carries no hostages, so the part offers nothing and draws no marks
(`NetPage.hostageMarks` is empty with no hostages). The proof on the front end is therefore headless (the two
`matchMount.test.ts` runs above); the part's browser proof stays `/testroom`'s specs. Owed: a browser run on MP6 from
the lobby (registry `hostage.orders.menu-path`), possible only once Desert Glory is listed, after capture C2 and the
validation the owner asked for.

## 7. The browser runs (ACT-6)

**The specs.** `packages/viewer/e2e/menuMatch.ts` (the helpers), `menuCrossroads.spec.ts` (four tests: pickup and plant,
defuse, detonation, the time-out), `menuFrostfire.spec.ts` (`bdoor_4`, the crate, the sniper ladder),
`menuVigilance.spec.ts` (`mp51_turret03`). Each is `/testroom`'s spec (`crossroads.spec.ts`, `doors.spec.ts`,
`traversal.spec.ts`, `turretMount.spec.ts`) moved onto the menu path:

- **The lobby walk** is `twoPagesMatch.spec.ts`'s, lifted whole: two pages from LOGIN (a new persona each run), CREATE
  GAME on page A with the map picked by its caption in `AVAILABLE_MISSIONS`, page B through JoinGame -> GAMELIST, B's
  SWITCH TEAMS until `terrorist`, READY on both, the countdown, the match. A (the session master) is the SEAL, B the
  Terrorist; the room launches only with both sides seated, so every spec is two pages.
- **The server** is the spec's own on `MENU_MATCH_PORT` (5351; the page 5352, the Local port 5353: this job's
  5350-5359), `MAPS=MP2,MP7,MP51,MP72` (the four since OT.R45), its data in a temporary directory, `SOCOM_DISC` the served tree.
- **The reads** are the front end's hook (`__frontEndMatch`, `MATCH_WINDOW_HOOK`): ACT-1's `hud()`, ACT-4's `feet`,
  `setCamera`, `pose`, `floorUnder`, `doors`, `traversal`, `worldStates`, `worldActive`, `alive`, `waiting`, and
  ACT-2's `turrets`/`turretParts` (no `bomb`: the controller's call, §9); the bomb's states and the round's results from the room's text frames each page's
  socket received (the lobby's adopted socket carries them: `bomb`, `roundStart`, `roundOver`), as `crossroads.spec.ts`.
- **The walk** is `crossroads.spec.ts`'s route walker (breadth first over the page's own floor pick on a 5 u grid, the
  stall-and-reroute) on the hook, driven by the fake pad's left stick (axes 0/1; OT.R29: no keyboard on the menu path)
  and Cross (button 0) tapped or held. No teleport (ACT.R5; the merge controller's call: WALK).
- **The look gate** (NET-LOOK, the merge controller's binding call of 2026-10-07): the steps are main's shared helper's
  (`e2e/turnWithinLaw.ts`: `steer` at `STEER_RATE` 110 deg/s, the pitch at `PITCH_PER_YAW` of it); `menuMatch.ts`'s
  `turnTo` is the helper's `turnTo` on the menu hook (the helper's own reads and writes `window.__viewer`, which the
  front end's page has not), with the stick at rest; the route turns standing past `MENU_WALK_TURN_STANDING_READING`
  and follows with `steer` while running; `settle()` waits `MENU_SETTLE_READING` after a turn before an action.
- **Vigilance's seat steer** (turret-feel's `Walker.glide`): after the mount the spec waits for the feet to stop
  (`turretMount.spec.ts`'s wait, lifted) before it checks the walk held.
- **Which page walks**: each Frostfire and Vigilance check drives the page that spawned nearest its site (`nearer`):
  Frostfire's spawn B (536, 143, 1254) is ~120 u from `bdoor_4`, spawn A (796, 100, 614) nearest the crate and the ladder;
  the crate is climbed before the ladder by the same page (the ladder ends on the 160 deck), and stepped off on the stick
  (turned back south, over the edge to the 100 floor): the route steps at most 6 u and will not take the 11.85 u drop
  itself -- the room charges a landing's fall (`fallDamage`), so a route of drops is not a walk. The door is walked by
  the page nearest it (B, the Terrorist, on these runs): the title and the registry say "the nearer page". The title
  keeps the dispatch's order otherwise (the registry's name).

**The RED against the lane** (`agent/act6` = `agent/menu-actions` 1b5015f2, before ACT-1..ACT-4), one spec file a run,
`--workers=1`, headless Chromium drawing through ANGLE over SwiftShader (`playwright.config.ts`):

| run | wall clock | lobby walk (both pages in the match) | result |
|---|---|---|---|
| `twoPagesMatch.spec.ts` (the environment's proof) | 16:46:31-16:53:22 | -- | 1 passed (5.0 m) |
| `menuCrossroads.spec.ts` | 17:04:16-17:12:12 | 143 s; 158 s (test 4's own pages) | test 1 RED at the hook; 2-3 not run (serial); test 4 failed on the harness (below) |
| `menuFrostfire.spec.ts` | 17:18:53-17:22:23 | 129 s | RED at the hook |
| `menuVigilance.spec.ts` | 17:23:40-17:29:39 | 170 s | RED at the hook |
| `menuCrossroads.spec.ts --grep "the time-out"` (round from `roundStart`) | 17:30:59-17:43:54 | 137 s | no `roundOver` in 420 s: the idle kick (below) |
| `menuCrossroads.spec.ts --grep "the time-out"` (the idle guard) | 17:50:38-17:59:55 | 134 s | the room's draw passed (`roundOver` round 1 winner null at 359.9 s of 360 on both pages, the bomb at state 1); RED at the hook |

Every RED fails at the same read, after the lobby walk reached the match on both pages: `expectActionReads` finds the
menu-launched match's hook without ACT-1's `hud()`, ACT-4's twelve reads (and, on Vigilance, ACT-2's `turrets` and
`turretParts`) -- the actions part is not mounted on the menu path (no `BombPage`, no `DoorPage`, no `TraversalPage`, no
`TurretPage`), so nothing of it can be drawn or read. On Crossroads the room's side was there before it: both pages'
sockets had the `bomb` frame at state 1 on StartBomb (the assertion before the hook's passed) -- the room hands the bomb
over by proximity on any page while the menu path draws none of it: the playtest's "the bomb can't be picked up".

**A harness finding (test 4).** The time-out first ran with the server's `ROUND_SECONDS=20`, as `crossroads.spec.ts` does,
and no `roundOver` came within 60 s: a lobby-launched game's room takes the round's minutes from CREATE GAME's own
`mp_max_round_time` (GameStats byte 2, `gameLobbyCommands.ts` `created`; `packages/central/src/bridge.ts` `roomOptions`
overrides the server's default with it), so `ROUND_SECONDS` never reaches it. The test now reads the round's length off
the room's `roundStart` (`seconds`) and waits it out: the dialog's default, 360 s. Walking CREATE GAME's time limit down
to its shortest is owed (it would shorten the run, not change what is asserted).

**A second harness finding (the idle kick).** Run so (17:30:59-17:43:54, the walk 137 s), still no `roundOver` in the
360 s + 60 s: the room's idle kick (W3.R13, 3-5 minutes, 4 by default; a stick, a button or a turn is input,
`room.ts` `ACTIVE_STICK`) applies to a lobby-launched game, and two pages standing still through a 6-minute round are
both closed at 4 minutes -- the game abandoned, no round result. `/testroom`'s time-out never met it (its server's
`ROUND_SECONDS=20`). The same kick would close the page that waits while the other walks in the GREEN runs (Frostfire's
second page; Crossroads' Terrorist through the SEAL's carry). The helpers now start an idle guard in each page once it
is in the match (`MENU_IDLE_NUDGE_READING`): a pad still for 50 s gets a look wiggle on the right stick, there and back
(`MENU_IDLE_NUDGE_PUSH_READING`). A pushed stick or a held button counts as activity (a walk's straight leg is not
stillness), and `turnTo`/`settle()` hold the guard off, so no wiggle lands in a walk or in the second before an action
(the review of 421f05e6).

**Not measured yet (the green run's, ACT-6 wave 3):** the holds' wall-clock on the menu path (the plant and defuse,
`MENU_HOLD_WALLCLOCK_READING`), the walks' stalls and times per map (each `MenuWalker.walkTo` logs its leg: from, to,
seconds, stalls), the reachability of `mp51_turret03` from spawn A and of the Frostfire sites under the room (the
dispatch's risk 1: unmeasured until the hook's reads exist). **Not read on the menu path** (no hook read for them in
ACT-4's list): the walk camera's target within the turret's reach (`turretMount.spec.ts` reads `__viewer.camera()`), the
body's clip (`__viewer.stats().anim`: the ladder's clip is read off `traversal().clip` instead), the satchel on the
carrier's body (owed in `crossroads.spec.ts` too).

**The GREEN round (ACT-6 wave 3, 2026-10-07; `agent/act6` c1f240c4 = the RED + ACT-1, ACT-3, ACT-4, ACT-5 and main
50a98582)**, seat C, one spec file a run, `--workers=1`, headless Chromium drawing through ANGLE over SwiftShader
(`playwright.config.ts`; the page measured 15 fps in the match during the plant's hold):

| run | wall clock | lobby walk | result |
|---|---|---|---|
| `menuFrostfire.spec.ts` | 21:57:38-22:02:27 | 144 s | **1 passed (4.6 m)** -- door, crate, step-off, ladder |
| `menuCrossroads.spec.ts` (all four) | 22:08:25-22:23:48 | 157 s (test 4's pages) | test 1 failed on the harness (the walk to StartBomb, below); 2-3 not run (serial); test 4 failed on the harness (the wall clock, below) |
| `menuCrossroads.spec.ts` (both fixes) | 22:41:36-22:55:25 | 135 s (test 4's pages) | **test 4 passed** (the room's clock 359.9 s of 360 on both pages, 363.3 s of wall clock; the round screen a draw); test 1 failed at the plant's hold (below); 2-3 not run |
| `menuCrossroads.spec.ts --grep "DEMOLITION from the lobby"` (the hold instrumented) | 23:04:59-23:15:51 | 215 s | test 1 failed at the plant's hold, with the evidence below; 2-3 not run |

- **The walks** (`MenuWalker`, each leg's line): Frostfire B spawn -> `bdoor_4` 11.1 s, back 5.5 s and 4.7 s; A spawn -> the
  crate 12.6 s; the crate's foot -> the ladder's foot 26.7 s (by the 63 floor); 0 stalls on every Frostfire leg. Crossroads
  A spawn -> StartBomb 30.2-32.0 s, 0 stalls; StartBomb -> the tent's south 29.7-32.4 s, 1 stall each run (at ~(896, 42,
  1453)); B spawn -> the Terrorist's wait 51-56 s, 4 stalls (around (660, 42, 1190)). The walker's step: a look every
  119-296 ms.
- **The step-off** (Frostfire's crate, the first run): turned south and walked off on the stick, the feet under 105 within
  the 10 s poll; the next leg started from (932, 100, 838).
- **The idle guard**: a still pad nudged at 50 s. Through test 4's 360 s round, 6 nudges a page at ~55 s intervals, and
  the game was not closed (the RED's 4-minute idle kick did not come). In tests 1-3, one nudge a page (the page waiting
  while the other walks). None landed in a walk or a hold (each nudge's wall clock is logged at `closeMenuPages`).
- **Harness finding 1 (the walk's last stretch).** The first run stopped 10 u from StartBomb with no stall: the walker
  broke within 4 u of its last cell's centre and the body coasted 3+ u past it once the stick was let go (the room
  had very likely handed over the bomb: its reach is 20 u). Fixed in the harness: the stick is written only when its
  push changes (each write waits two frames), the last `MENU_WALK_APPROACH_READING` (15 u) is walked at
  `MENU_WALK_APPROACH_PUSH_READING` (0.6), and the route's last point is the target itself when it is the target's cell.
  The next two runs stopped 3 u from StartBomb.
- **Harness finding 2 (the round's clock).** Test 4 measured 373.2 s of wall clock for the 360 s round: the server drops
  a stall of more than five ticks rather than replaying it (`server.ts` `loop`), so on this loaded host the room's
  seconds run behind the wall clock. The spec now measures the round in the room's ticks (`/metrics` `s2u_ticks_total`,
  read as each `roundStart` and `roundOver` frame is heard: 359.9 s) and keeps the wall clock as a lower bound.
- **Harness finding 3 (the plant's hold on the wall clock; diagnosed without a browser, then run green below).** At
  `terrorist_tent` the page's prompt read `bomb`. Cross was held on the fake pad for 15.1 s at a measured 15.0 fps, and
  no state 3 came. The page's reads at the failure were
  `{"action":"bomb","feet":[526,14.3,1527],"traversal":{"kind":"none","prompt":null},"alive":true}`. The page side
  is sound: a headless probe on the mount's fakes (`matchMount.test.ts`'s `crossArmed`, Cross held 400 frames at the
  site, with and without a prior Cross tap) sent 384 commands, all 384 with `Button.ActionHeld` consecutively, the
  lifecycle on `bombPlant`. The room counts the hold once a ROOM TICK however many of the player's commands that tick
  runs (`match/src/bomb.ts` `command`, L175-176: no banking), and it runs a player's whole queue in one tick while the
  credit lasts (`match/src/room.ts` `run`, L1913-1918, `CREDIT_MAX` 60). So a page's frame (one burst of commands)
  counts once, and the hold advances at the page's frame rate. At 15 fps the 300 ticks take ~20 s, plus the 2.25 s
  placement, past the harness's 15 s budget. `/testroom`'s 7-11 s (the three-maps plan's Log L694) is the same rule at
  that page's higher frame rate. The harness's `holdCross` now scales its budget by `TICK_HZ / holdCountRate(fps)`,
  the frame rate measured before the press. For the controller, a property of the room and not a fault: a player
  whose page draws under 60 fps plants and defuses slower on the wall clock, in proportion.

  > Superseded by ACT.R8 (2026-10-08, the owner's call via the merge controller; ACT-7): the frame-rate-bound hold is a
  > **defect**, not a property of the room -- a timed hold takes the original's real time (300 ticks, 5 s) on any honest
  > machine and never less for anyone. The room now counts elapsed room ticks while the hold is live (the ACT-7 part of
  > §8 below; `match/src/bomb.ts` `step`). The text above is kept as what was believed on 2026-10-07. The harness's
  > fps-scaled budget stays only as the fallback that sizes its wait; the specs bound the hold ABOVE in room ticks
  > (`holdRoomCeiling`, `MENU_HOLD_ROOM_TOLERANCE_READING`, §8).

**The GREEN round, after the GO (2026-10-08; `agent/act6` c4a103b8 = 73d4d0d5 + ACT-2 merged)**, the same seat and renderer:

| run | wall clock | lobby walk | result |
|---|---|---|---|
| `menuCrossroads.spec.ts --grep "DEMOLITION from the lobby"` (harness 73d4d0d5) | 00:42:11-00:51:47 | 130 s | **3 passed (8.2 m)** |
| `menuFrostfire.spec.ts` (harness 73d4d0d5) | 00:53:02-00:57:16 | 128 s | **1 passed (3.9 m)** |
| `menuVigilance.spec.ts` (harness 73d4d0d5) | ended 01:03:17 | 126 s | failed: the route ended at the 70 ground under the turret (finding 4) |
| `menuVigilance.spec.ts` (height bands) | ended 01:13:02 | -- | failed: stalls on the 160-170 level, the route falling back to the 80 ground |
| `menuVigilance.spec.ts` (bands, drops, the stand's floor) | ended 01:27:56 | -- | failed: the route reached the stand; the body stalled in MP51's house (finding 5) |
| `menuFrostfire.spec.ts` (the final harness) | 02:01:10-02:06:26 | 142 s | **1 passed (4.7 m)** |
| `menuCrossroads.spec.ts --grep "DEMOLITION from the lobby"` (the final harness) | 02:07:58-02:14:51 | 134 s | test 1 **passed**; test 2 failed, a race with the fuse (finding 6); test 3 not run (serial) |

- **The holds on the menu path, on the wall clock**, at the frame rate measured before each press: the plant 16.3 s at
  20.4 fps, 16.3 s at 16.5 fps and 17.2 s at 16.7 fps; the defuse 13.6 s at 19.1 fps -- ~300 / fps + the 2.25 s
  placement (finding 3); `/testroom`'s 7-11 s is the same rule at a faster page. The result delays were the script's:
  the Terrorists' win 24.0 s after the defuse, the SEALs' 25.0 s after the detonation (29.8 s after the plant).
- **The walks (Crossroads):** A spawn -> StartBomb 28.4-29.5 s, 0 stalls; StartBomb -> the tent's south 21.4-26.1 s,
  0-1 stalls; B spawn -> the Terrorist's wait 48.3-49.6 s, 4 stalls. **Frostfire:** every leg 0 stalls (B to `bdoor_4`
  6.9-9.4 s; A to the crate 10.4-10.7 s; the crate to the ladder 20.9-21.6 s). The walker's step: a look every 98-285 ms.
- **The idle guard:** 2-3 nudges a page in tests 1-3; none in Frostfire.
- **Finding 4 (two floors in a column).** `mp51_turret03` stands on a **136 terrace**: its origin's y of 148 is the
  gun's pivot, 12 u over the floor (a probe of MP51's floors with `/testroom`'s `floorUnder`). The route keyed a cell by
  (x, z) alone, so it took the 70 ground under the terrace first and never matched the stand at 148. Fixed in the
  harness: a node is a cell and its floor's height band (`MENU_WALK_BAND_READING`); the target is weighed by its height;
  the spec stands on the floor under the stand (136).
- **Finding 5 (drops, and MP51's house).** From spawn A the terrace is reached only off the 160 bank, by drops of 17 and
  22 u at (632.5, 1222.5) and (642.5, 1222.5). No landing under 62 u hurts (research 17's light speed,
  `net/damage.ts` `FALL_SPEEDS`), so the route now takes a drop up to `MENU_WALK_DROP_READING` (30). Every such route
  (also over a wider area, 300-1000 x 1000-1700) crosses **a house**: a 170 floor under a 208-217 roof at about x 570-640,
  z 1280-1355. Its walls are no floor, and the body stalls at (592, 167, 1362), (618, 170, 1311) and (610, 170, 1297).
  The stalls are the same three in the lobby run and in an offline run of the walker on `/testroom`
  (`?nomatch&devmode`, teleported to spawn A, `__frontEndMatch` aliased to `__viewer`). `crossroads.spec`'s reroute
  wedge seals the passage after 3-4 stalls; a lighter block (3 cells) never got in. **This harness does not reach the
  turret on foot:** it does not know where the house's doorways are (neither hook has a wall read). Owed, the controller's
  call: waypoints through the house's doors (an offline survey of its walls on `/testroom`), another spawn, or the
  dispatch's fallback (s11's dev teleport, not built).
- **Finding 6 (the defuse against the fuse, test 2 on the final harness).** The plant landed 17.2 s after the press. The
  Terrorist's walk and climb (4.1 s), turn, settle and frame measure followed; the defuse needs 300 room ticks (~17 s
  at 17.4 fps); the fuse is 30 s. The bomb detonated during the hold: the page's prompt went (`action: null`), and it
  had heard 7 `bomb` events and the `roundOver`. At 19.1 fps (00:42) the same test passed with 13.6 s. Counting the
  hold per room tick (finding 3) puts a slow page's defuse at the fuse's edge; ACT-7's ruling (the hold counted per
  `ActionHeld` command, 5 s at any frame rate) closes it. The harness does not move the Terrorist within reach during
  the plant: that would change what test 2 proves.

  > Superseded by ACT.R8 (2026-10-08): ACT-7 as merged does **not** count per `ActionHeld` command. Per-command counting
  > was its first fix (86c3009f), rejected: a flood sped it (planted after 120 ticks uncapped, 240 with the cap; the
  > ACT-7 part of §8 below). ACT.R8 counts elapsed room ticks while the player's held state is live (set by the latest
  > held command, live for `HOLD_LIVE_TICKS_PLACEHOLDER` ticks), 5 s at any frame rate. What closes finding 6 is that
  > rule; test 2's re-run on it is owed to the gate (the plan's Log, 2026-10-08 ~05:30, owed item 1).

**Vigilance on a reachable turret (2026-10-08, the merge controller's call under ACT.R5: the goal is Vigilance's turret,
the one reachable on foot):**

- **Finding 7 (the survey).** MP51 places four manual turrets, all PKM TURRET with 750 rounds, yaw -70..70, pitch
  -45..45, reach 22: `mp51_turret01` (id 0) at (1237.637, 89.061, 948.578), `mp51_turret02` (id 1) at (478.582, 97.313,
  792.475), `mp51_turret03` (id 2) at (687.607, 148.035, 1201.95), `mp51_turret04` (id 3) at (1355.478, -14.58, 459.676)
  (research 215 L123-L127). The stand is 12 u behind each on its line, on the floor under it: 75.5, 83.8, 135.6 and -28.1.
  The committed walker ran each spawn (A (540, 160, 1456), B (1130, 65, 96); `scene/src/spawns.ts`) to each stand on
  `/testroom` offline (`?nomatch&devmode`, teleported to the spawn, `__frontEndMatch` aliased to `__viewer`; 9.2 m):

  | pair | result |
  |---|---|
  | A -> turret01 | stalled 9 times at (991, 94, 1089) |
  | A -> turret02 | reached in 47 s, 1 stall |
  | A -> turret03 | stalled 9 times at (713, 84, 1197) |
  | A -> turret04 | reached in 49 s, 1 stall |
  | B -> turret01 | stopped at (1238, 11, 962): under the 75.5 stand (the walker's last check is horizontal only) |
  | B -> turret02 | reached in 29 s, 0 stalls |
  | B -> turret03 | stalled 9 times at (611, 170, 1323): the house |
  | B -> turret04 | reached in 20 s, 1 stall |

  The spec now takes **`mp51_turret02`**: the page nearer it is A (the SEAL, ~670 u), and A reaches it.
- **Finding 8 (the seat's settle at 16 fps).** The first run on turret02 (02:48:17-02:51:57; walk 37.4 s, 0 stalls;
  the mount, the prompt and the box 750/750/0 passed) failed "the walk held" with 2.57 u. The settle wait lifted from
  main's `turretMount.spec.ts` samples at once: `expect.poll`'s first call compares two reads ms apart, and at ~60 ms a
  frame both fall in one frame and read still while the seat steer (`Walker.glide`) runs on. The spec now waits 300 ms
  before each sample. Re-run (02:54:59-02:58:52, walk 38.4 s, 0 stalls): **1 passed (3.6 m)**. The feet moved
  0.75 u from the mount to the seat (478.77, 83.75, 782.62) -> (478.81, 83.75, 783.37), then 0.00 u under 600 ms of
  the stick pushed. Main's `turretMount.spec.ts` has the same immediate first sample (a faster page has hidden it so far).

## 8. Readings (ACT-6's walk; the spec's judgements, each said as such)

Held in `packages/viewer/e2e/menuMatch.ts`, outside the ledger's walk of `src/` and `tools/` (hence *note only*).

| name | value | why | status |
|---|---|---|---|
| `MENU_SETTLE_READING` | 1000 ms | NET-LOOK's "~1 s after a snap" before a fire or an action: the body's facing caught up with the look | *note only* (e2e) |
| `MENU_WALK_GRID_READING` | 5 u | `crossroads.spec.ts`'s `AREA.step`: a body is ~5 u across; the route's cells | *note only* (e2e) |
| `MENU_WALK_STALL_READING` | 1000 ms, two in a row | `crossroads.spec.ts`'s stall: under 3 u in a second re-pushes the stick, a second stall reroutes around the cells ahead | *note only* (e2e) |
| `MENU_WALK_TURN_STANDING_READING` | 45 deg | a swing past it is turned standing (the stick let go, `turnTo`), so the body does not run wide of a 5 u cell while the gate holds its turn | *note only* (e2e) |
| `MENU_IDLE_NUDGE_READING` | 50 s | a pad still this long gets a look wiggle (right stick, there and back), under the room's idle kick (W3.R13: 3-5 min, 4 by default) with room for the 5 s check; the waiting page and a whole round's clock are kept in the game | *note only* (e2e) |
| `MENU_IDLE_NUDGE_PUSH_READING` | 0.7 | the wiggle's right-stick push: ~1.1 deg of look a 60 Hz command, over the room's idle-clock threshold (a turn over 0.5 deg a command, `room.ts` `active`) and under NET-LOOK's gate (~128 deg/s = 2.13 deg a command); 0.6 gave ~0.475 deg, just under the threshold | *note only* (e2e) |
| `MENU_WALK_APPROACH_READING` | 15 u | within it of the route's end the stick is pushed less, so a full run does not pass a 4 u target between two of the walker's looks nor coast past it (the GREEN round's first Crossroads run: 7 u past StartBomb's cell) | *note only* (e2e) |
| `MENU_WALK_APPROACH_PUSH_READING` | 0.6 | the last stretch's push: through the move stick's 0.3 dead zone and rescale ~0.43 of the run's wish | *note only* (e2e) |
| `MENU_WALK_BAND_READING` | 24 u | the route's height band: a cell's floor in another band is another node (two floors in one column: MP51's 136 terrace over the 70 ground); over the 6 u step, under a storey | *note only* (e2e) |
| `MENU_WALK_DROP_READING` | 30 u | the route's longest step down: no landing under research 17's 62 u hurts (`FALL_SPEEDS`), with a margin; MP51's terrace is reached off the 160 bank by drops of 17 and 22 | *note only* (e2e) |
| `MENU_HOLD_WALLCLOCK_READING` | 7-11 s | the plant and defuse holds measured 7-11 s on the wall clock on `/testroom` (the three-maps plan's Log L694, before ACT.R8: the room then counted the ticks a page sent a held command); its upper bound and a margin size `holdCross`'s wait, scaled by the page's frame rate (`holdWaitMs`: the fallback only); the lower bounds stay the game's (5 + 2.25 - 0.5, 5 - 0.5) | *note only* (e2e) |
| `MENU_HOLD_ROOM_TOLERANCE_READING` | 1.5 s | the slack on a hold's room time (`e2e/holdBound.ts`), read off `/metrics` before the press and at the state frame: the fake pad's write, the first held command's frame (one page frame of wall time, 0.2 s at 5 fps; the 0.1 s dt clamp bounds simulation time, not latency), the socket, the 100 ms poll, the two reads, and one page hitch past the 250 ms live window; the plant must land within 5 + 2.25 + 1.5 s of the room's clock and the defuse within 5 + 1.5 s (`holdRoomCeiling`, ACT.R8), so a frame-counted hold fails on any page under ~46 fps (`test/menuHoldBound.test.ts`) | *note only* (e2e) |

Retired (ACT-6 GREEN, 2026-10-07): `MENU_LOOK_RATE_READING` (110 deg/s) -- the shared helper `e2e/turnWithinLaw.ts` owns the law (`STEER_RATE`), and the harness steps with its `steer`.

### The hold on room ticks (ACT-7, ACT.R8; 2026-10-08)

2026-10-08 (the owner's call via the merge controller): the hold counts per command, not per tick (ACT-6's Harness
finding 3, ACT-7, ruling ACT.R8 at the merge).

> Superseded by ACT.R8 as ruled on the shape, the same day (corrected 2026-10-08 at the review of ACT-6's harness
> commits): the sentence above is the first fix's, per command, which was rejected because a flood could speed it
> (below: 120 ticks uncapped, 240 capped). ACT.R8 counts **elapsed room ticks while the hold is live**, not commands
> and not page frames; the rest of this section describes that rule as built.

Before it `bomb.ts` counted a plant or defuse hold once a room tick on
which a command ran, and `Room.run` runs a page's batch in one tick, so a 15-fps page's 300-tick hold took about 20 s.

How a page sends commands: `main.ts:1554` clamps a frame's dt to 0.1 s. `Walker.advance` (`mover.ts:1674-1686`) runs
fixed 1/60 s ticks, up to `MAX_TICKS` 30 a call. Every tick sends one command (`walk.ts:412-449`, `ActionHeld` at
:442), through `net/client.ts` `tick`, which also resends the last 3 commands for redundancy. So a 15-fps page sends 4
commands a frame, 60 a second. Because of the clamp, a frame runs at most 6 ticks, so below 10 fps a page sends fewer
than 60 a second (5 fps: 30 a second, 6 every 12 ticks). Counting commands would slow such a page.

The merge controller then ruled on the shape, the same day and on the owner's authority: "a hold takes the original's
real time (300 ticks, 5 s) on any honest machine, and never less for anyone". It is built as follows:
- The hold advances one a room tick, at `step`, while the player's held state is live.
- The latest command run with `ActionHeld` while eligible sets that state.
- It stays live until `HOLD_LIVE_TICKS_PLACEHOLDER` ticks pass with no command run at all. Past that the hold pauses,
  and it resumes without a reset at the page's next held command.
- A command without the bit, a step out of reach or the death resets it as before.
- The command count no longer bounds the hold, and a flood cannot speed ticks up.

The window is 15 ticks (250 ms), the hold's own constant, ratified by the merge controller over the 8 first named. A
5-fps page sends a frame every 12 ticks, and 15 covers that gap plus some jitter (8 would pause it 4 ticks in 12). It
cannot speed a hold; it only decides how long a stalled page keeps holding. Past it the hold pauses and does not reset.

Measured (`roomBomb.test.ts`). Each of these pages plants on the hold's 300th tick (5 s):
- a 60-a-second page in batches of 4
- a 15-fps page sending one command a frame
- a 5-fps page sending 6 every 12 ticks

The other cases:
- A 20-tick stall counts its first 14 ticks and plants 6 ticks late.
- A flood (600 held commands at once after 10 s of nothing, then one a tick) plants on exactly the 300th tick.
- The defuse behaves the same as the plant.
- Earlier counters failed the flood. On an uncapped per-command counter it planted after 120 ticks. With a cap at the
  credit's burst (86c3009f) it planted after 240.
- The room queues the flood's excess (`QUEUE_MAX` 600) and does not drop it.

The PF-34 claim's 3 s hold is not this counter. It is the page's `ActionLifecycle.elapse(dt)` in seconds of frame
time (`actionContext.ts:168-170`, called from `matchActions.ts:237`).

Observation, not fixed here: the 0.1 s dt clamp also slows the claim hold below 10 fps (at 5 fps it takes 6 s).

The e2e harness's fps-scaled budget (`menuMatch.ts`) stays as a fallback: it sizes the wait only. Since the review of
ACT-6's harness commits (2026-10-08), `holdCross` also reads the room's ticks off `/metrics` before the press and at the
state frame, and `menuCrossroads.spec.ts` tests 1-3 bound the plant and the defuse ABOVE in them (`holdRoomCeiling`:
5 s, + 2.25 s for the plant, + the 1.5 s tolerance in the table above), so a regression to frame-counted holds fails
there.

## 9. Owed

- 2026-10-07: the water's splash on the menu path is owed, not built. `/testroom` never calls `traversal.setEffects`.
  The splash goes through the `s2u:traversal` window event (`main.ts`'s listener, `waterLand`), and the front end has
  no listener for it. `matchMount.ts` calls `traversal.effectsFrame()` with no effects, as `/testroom` does. The shared
  path is `setEffects(firearm.effects)` on both pages with `main.ts`'s listener retired. It touches `main.ts`, so it is
  the merge controller's later call. **Paid at PARITY-1 wave 4 (PAR-10, `agent/parw4`, 2026-10-08):** research 257
  s4.3 -- `traversal.setEffects` and `clearRipples` on both pages, the `s2u:traversal` listener and `waterFrame` retired.
- The world drops on the menu path (H120: a later one-line switch, `worldDrops: true` with `WorldDrops` on the scene and
  the two hooks); the part's PF-34 pickup prompt and hold stay dead there until then. **Paid at PARITY-1 wave 4 (PAR-4,
  `agent/parw4`, 2026-10-08):** the switch on, the part on the mount's scene, `drops.ahead` to the action part, the two
  hooks, the resets at a round's start and the teardown (research 234 s6's last paragraph).
- The turret's mount pose, sounds, hand and own round on the menu path landed with ACT-2 (§3); its browser run from the
  lobby is ACT-6's, on `mp51_turret02` (§7 finding 7; the plan's ACT.R9: `mp51_turret03` was not reached on foot, and
  whether a collision defect seals MP51's house is unproven either way).
- Cross reaching the part on the menu path and its cancels landed with ACT-3 (§4); the HUD's prompts and the hook's reads
  with ACT-4 (§5), except the hook's `bomb()`: `/testroom` has no line for it, and the controller's call (2026-10-07) is that it
  is not a hook read -- ACT-6's specs take the bomb from the room's `bomb` frames and drop `bomb` from their expected reads.
- The dev room teleport, if ever (the merge controller's fallback; WALK is the call); Desert Glory's listing (ACT.R6);
  a touch layer on the front end (no `'touch'` cancel there).
