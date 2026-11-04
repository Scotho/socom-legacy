# 322 -- The HUD before the first spawn: what the original draws of the kit from the level load to round 1, against the port (PAR-94)

- Date: 2026-10-14 (13:12Z). PARITY-2 ([plan](../plans/2026-10-08-web-sprint-parity-2.md)), row PAR-94 (the forge
  lane's FG-40, filed by the main merge controller): "before the first spawn the match's own `PlayerLoadout`
  (`matchMount.ts`) shows the default kit for the load's duration; whether the original shows anything of the kit ...
  before the first spawn is unread". Read alone in a host gap (OT.R54), the reads-only brief of 2026-10-14. The build,
  or NU.R3's pin, is a later brief from section 4. Branch `agent/par94-read` from `8b3bdbbea`.
- Review: a fresh review of `e2aa781cf` returned PASS WITH FINDINGS (high); F1-F4 and the two nits are folded here
  with the text they corrected kept beside ("was: ..."); status unchanged.
- Status throughout: **reading, pending review.** Source inspection only: the decompilation and the game ELF's bytes
  were read, and the port's code was read. No game, emulator, reader, test or browser was run (no node process at all).
  Where the port's behaviour is stated it is read off its source, not run. Nothing here is proven.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, re-hashed for this note). The ELF
  `game/disc/socom2_game.elf` (SHA256 `06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872`, read only,
  through scratch scripts; the load segment at 0x1e7000 holds 0x221480 bytes of the file): the bytes at 0x3dc3d0 (1,
  the HUD built), 0x3dc3e0 (1, the HUD shown), 0x3dc380 (the float -1.0, the ammo box's fade counter at rest), 0x3dcbd8
  (-1); 0x408e58, 0x408f08 and 0x4145e8 past the file's bytes (.bss, zero at load); the strings 0x3e66b8 `"%d/%d"`,
  0x3e66c0 `"%d MAG%c"`, 0x3e3520 `"STARTING ROUND %d OF %d"`. Earlier notes, not
  restated: [research 87](87-hud.md) (the HUD's elements and the fade, section 1), [research 91](91-the-round.md)
  sections 12 and 14 (the HUD tick's branches; the maps' type kits), [research 115](115-the-screen-and-state-manager.md)
  (the states: LoadState 0x4085ac, CoreState 0x4085d0), [research 125](125-the-loading-screen.md) sections 5 and 8 (the
  load state's 0.5 s and its network hold), [research 166](166-the-loading-screen-from-the-lobby-to-the-match.md)
  sections 2, 3 and 8 (the round's start with no countdown, the slow loader's barrier, `mountMatch`),
  [research 203](203-r2-mn-match-modes-net.md) section 11 (no level load between rounds). The disc's values: none read
  here; the kits named are research 91 section 14's transcription.
- The port's code at `8b3bdbbea`: `packages/viewer/src/lobbyMatch.ts`, `loadingJoin.ts`, `matchMount.ts`,
  `matchFirearm.ts`, `matchNet.ts`, `loadout.ts`, `hud.ts`, `netPage.ts`, `reticle.ts`, `armoryView.ts`,
  `armoryLayout.ts`, `main.ts`; `packages/match/src/room.ts`, `bridge.ts`.

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R322.1 | **The original draws no HUD on the loading screen.** The HUD object is made in CoreState's init, after the load (`FUN_001ec480` D:L50903-50914), and drawn only by CoreState's tick (`FUN_001ebed0` D:L50851-50881); the load state draws `dlgLoad` alone (research 115, 125) | the port matches: the front end's match is not mounted until the screen lifts | 1.1, 2.1 |
| R322.2 | **In the original there is no frame between the load and round 1.** Round 1's start runs inside CoreState's init (`FUN_002a7d40` D:L50946), before its first tick; online, no console leaves its loading screen until every launched player has loaded: the host on its barrier (`+0x112` = 2, `FUN_001f5e70` D:L55693-55694), a client on the same byte, which the host sends it straight after (D:L55694-55696; packed `FUN_002c00f0` D:L163083-163084, unpacked `FUN_002c0850` D:L163415-163416) -- about 0.5 s before the host's round start writes game state 3 (the review, F1; was: "a client not before the host has started round 1 (game state 3; `FUN_001f5e70` D:L55693-55707, research 166 R166.3)") | the "pre-spawn" interval the forge saw has no counterpart in the original: every frame of the HUD is a frame of round 1 | 1.1, 1.2 |
| R322.3 | **The player's actor exists on the HUD's first frame.** The load makes the local player (online `FUN_005442c0` D:L410569-410617 from D:L152167-152168) and hands it to the camera object (D:L49731-49732; that this sets the actor the HUD reads is `FIRST_FRAME_ACTOR_READING`); a load without one fails (D:L49734-49735, D:L50729-50730). The whole of the HUD's per-frame update is gated on the camera's actor (`FUN_001f7ff0` D:L56631) and runs before the draw (D:L50856, then D:L50862-50869) | nothing of the HUD is ever drawn from a state with no actor in a round's first frames | 1.3 |
| R322.4 | **The ammo box shows no kit for the first 1.0 s.** HUD init writes the fade counter 0 (D:L57489); each frame adds dt and sets the box's one factor -- 0 up to 1.0 s, (t - 1) x 2 to 1.5 s, 1 after, then the counter to -1 (D:L56767-56800); the factor scales the panel, the weapon icon, the rounds, the magazines and the fire-mode cells together (`FUN_00237d00` D:L85305-85322). Its content is the camera actor's own inventory (`FUN_00237760` D:L85148-85249) | from 1.0 s the box shows the kit the actor carries -- online the one chosen in the lobby's ARMORY before the load (research 125 section 8); never another | 1.4 |
| R322.5 | **Not faded, drawn from the first frame:** the reticle (its set by the weapon in hand, D:L56673-56688; shown on the living branch, D:L56564-56567 -> `FUN_001f7a90` D:L56396), the compass (D:L56693), the info box online (shown D:L56442, ticked D:L56758): the health, the round clock from the round's start (research 166 R166.2), the range. No radar in a multiplayer round (research 87 section 9); no item slots at rest | the reticle is the one part of the kit drawn on frame 1 | 1.4 |
| R322.6 | **The port's online match draws the default kit after its loading screen.** The screen lifts on the page's own load plus 0.5 s (`LoadingJoin`, the room's welcome standing in for the network byte); only then is `loaded` sent and the match mounted, which puts the type's default kit on the body (`loadouts.spawn(seat, { network: true })`, `matchMount.ts:634`) and draws the HUD at once while the room holds round 1 for every seat's `loaded` (at most `LOAD_BARRIER_TIMEOUT_PLACEHOLDER`, 90 s). The reticle and the body's kit show from the first drawn frame, the ammo box from 1.0 s, until the room's `spawn` names the ARMORY's kit | D1-D4: the root is the release's condition, not the HUD (B1) | 2.1, 3 |
| R322.7 | **The port's offline match (`/testroom`'s single-player room) draws the HUD under its ARMORY.** The walk starts under the loading screen with the kit `show` hangs (the SEAL's pending pick, else its type's default; `main.ts:1833-1835`); the room, and so the spawn, is made only when the ARMORY (W5.R1) is left; the ARMORY covers the 640x448 frame letterboxed while the HUD is drawn edge-anchored beneath it | D5: on a canvas wider than 640:448 the HUD's edge parts may show that kit beside the ARMORY (read, not run) | 2.2, 3 |
| R322.8 | **Found on the way: the original's ammo-box fade has two resets only** (the counter's own tick also writes it, D:L56769, D:L56799; PAR-94d's review) -- HUD init (D:L57489) and the tactical map's close (`FUN_001f7030` D:L56164, single player only, research 87 section 9). The round start's HUD reset `FUN_001fb420` (D:L57583-57664) writes no fade, and there is no level load between rounds (research 203 section 11). Research 87 section 1's "on a spawn ... fade in" reads, by these writers, as "on the match's first frame" | the port fades the box again at every round start (`Hud.startRound`); a difference for round 2 on, outside PAR-94 (D6, filed, not built here). *Built 2026-10-17 by PAR-94d (reading, pending review; the merge controller's ruling, ahead of the capture): a round's start no longer re-runs the fader or the box's fade -- D6, section 3* | 1.4, 3 |

## 1. The original, from the load to round 1's first frames

### 1.1 The load state: no HUD

The load state (LoadState 0x4085ac, research 115) builds `dlgLoad`, starts the map's load on its own thread
(`FUN_001ebba0(CoreState, 1)` -> `FUN_001ebca0` D:L50695-50712 -> `FUN_001ebda0` D:L50717-50738) and, when the load is
done, counts 0.5 s and switches to CoreState 0x4085d0 (`FUN_002cf410`, the state manager's op 2, D:L172289;
D:L55748-55755) (the review's nit; was: "pushes CoreState"). Online it starts that count only when the game object's
byte +0xd0 is set (D:L55748-55749). The test that sets it on either machine is `+0x112` = 2, or `+0xcc` clear and
game state `+0x113` = 3 (D:L55704-55707); a client also sets it on its `+0xcd` with `+0xcc` clear (D:L55684-55685).
The host writes `+0x112` = 2 once `FUN_002c4020` finds no launched non-spectator still loading (D:L55693-55694) and
sends the game object at once (`FUN_002c00f0`, D:L55696), which packs `+0x112` into the same byte as `+0x113`
(D:L163083-163084); a client unpacks it into its own `+0x112` (`FUN_002c0850` D:L163415-163416). So a client
releases on the host's barrier -- the first test -- about 0.5 s (the host's own count) before the host's round start
writes game state 3 (`FUN_002a7d40` D:L149762), whose test is then the second path, not the one taken. What `+0xcc` and
`+0xcd` stand for is research 125's open `LOAD_NET_HOLD_READING`; the barrier itself is research 166 R166.3's. So
every console's loading screen covers the whole wait for the slowest loader (the review, F1; was: "A client sets it
on game state 3 (`+0x113`, D:L55704-55707) -- which the host writes in its round start (`FUN_002a7d40` D:L149762) --
or on its `+0xcd` ...; the host on `+0x112` = 2 ... So every console's loading screen covers the whole wait for the
slowest loader, and a client's covers until the host has started round 1.").

*Flagged for research 166's next edit (not edited here):* R166.3 (`166-the-loading-screen-from-the-lobby-to-the-match.md`
lines 69-71, section 3) has a client's load complete "on game state 3"; by the reading above a client completes on the
host's `+0x112` = 2, sent after the barrier passes.

Nothing of the HUD exists meanwhile: the HUD object is allocated and initialised in CoreState's init
(`FUN_001ec480`: allocation D:L50903-50909, `FUN_001fa360` D:L50910-50914, under `DAT_003dc3d0`, which the ELF holds
as 1 and no line writes), and drawn only by CoreState's tick (D:L50851-50881).

The load thread makes the player's actor. `FUN_001ea720` (D:L49713-49737) loads the level (`FUN_002ac410`, which
online makes the local player, `FUN_005442c0` D:L152167-152168 -> `FUN_002b3590` D:L410612), hands the local player to
the camera object (`DAT_00415ff0`) through its vtable's +0xc (D:L49731-49732), and returns success only when a local
player exists (D:L49734-49735); a failure goes to `FUN_00192bf8(0)` (D:L50729-50730). That the vtable call is what
writes the camera's +0xbc -- the actor the HUD reads (`FUN_001fcd70` D:L58313-58317) -- is read from its place and
its argument, not traced into the vtable (`FIRST_FRAME_ACTOR_READING`, section 5). Offline the local player is made on
another path (not `FUN_005442c0`, which is online only); the same success test holds it.

### 1.2 CoreState's init: the HUD made, then round 1 started

`FUN_001ec480` in order: the HUD allocated and stored at the state's +0xb8 (D:L50903-50909) -- the pointer the tick
hands to the HUD's update and draw (D:L50856, D:L50862-50869); `FUN_001fa360` (D:L50912), the HUD's init, whose
last lines build the ammo box (`FUN_00237fc0` D:L57490, D:L85392-85459: the panel, the rounds' and magazines' strings,
the four fire-mode cells), write the fade counter `DAT_003dc380` = 0 (D:L57489) and the help lines' clock
(D:L57498); then round 1's start, `FUN_002a7d40(0x4364e0)` (D:L50946). That sets the mission RUNNING (+0x18 = 1,
D:L149683: the tick's HUD update runs on that, D:L50781-50797, research 114 section 1.4), and online calls the HUD's
round reset `FUN_001fb790` and round start `FUN_001fb420` (D:L149755-149758): the HUD's parts shown (`FUN_001f7a90`
D:L57597), the help lines hidden (D:L57599-57607), the ammo box's rounds and magazines strings cleared and its
fire-mode memory reset (`FUN_00237f60` D:L57658, D:L85379-85386), "STARTING ROUND %d OF %d" posted (D:L57632-57649).
No frame is drawn between the init and the first tick.

### 1.3 The HUD's frame: the update before the draw, gated on the actor

CoreState's tick (`FUN_001ebed0`) calls the HUD's update `FUN_001f7ff0` (D:L50856) before its three layers' draw
(D:L50862-50869) and the compass ring (D:L50870). In the update:

- **The actor gate.** Everything from the reticle to the fade sits inside "the camera's actor is not null"
  (`DAT_00415ff0` +0xbc, D:L56540, the block D:L56631-56846). Section 1.1 puts that actor in place before the first
  tick, so the gate is open on frame 1. The local player is `FUN_002b3580` (`DAT_00440c38`); the controller's mode
  byte +0x221 is `bVar1` (D:L56538).
- **The living branch.** With the local player's +0xe1 bit 4 set (alive: `FUN_00237e50` shows the ammo box offline on
  the same bit, D:L85354-85356; the dead branches are research 91 section 12's), the camera on him and `bVar1` 0, each
  frame calls `FUN_001f7a90` (D:L56564-56567), which shows the action prompts, the reticle and the stance word for the
  local viewer (D:L56394-56398), the ammo box (`FUN_00237e50` D:L56405), the compass (`FUN_002122a0` D:L56445) and,
  online, the info box (D:L56441-56443); and hides the help lines (D:L56568-56575).
- **The ammo box's content.** When the actor holds no weapon, or its inventory reports a change (`FUN_005bc2c0`),
  `FUN_00237760` refills the box from the camera actor's inventory (`FUN_001fcd70()` + 0x5e0): "%d/%d" rounds of
  capacity, "%d MAG%c" (hidden under 2 magazines), the fire-mode cells or none, the weapon's icon (D:L56719-56743,
  D:L85148-85249).
- **The reticle.** With the inventory's state (`FUN_005b8760`) 3, the reticle is given the actor's controller's
  +0x11c, or 0 when the camera actor's rounds (`FUN_005c3890`) are under 1 (D:L56673-56688; the sets are research
  321's), and the reticle's own update runs (`FUN_00216770` D:L56765).
- **The fade** (D:L56767-56800), section 1.4.
- **HUD off.** With `DAT_003dc3e0` clear (the ELF's 1 at rest; set to 1 at D:L57799 and toggled by the pause menu's
  "SPECTATOR HUD" item, D:L61848; the review's nit, was: "toggled only by the pause menu's ... item") or the scoreboard up, the ammo box, the info box, the compass, the prompts and the reticle are hidden
  (D:L56808-56827; research 87 section 12).

### 1.4 What each element shows, frame by frame (online; offline in 1.5)

t is the time since CoreState's first tick.

| element | frame 1 (t = dt) | 1.0 < t < 1.5 | t >= 1.5 | source |
|---|---|---|---|---|
| ammo box: panel, weapon icon, rounds "%d/%d", "%d MAGS", fire-mode cells | **alpha 0** (the factor 0) | the factor (t - 1) x 2 | 1, and the counter to -1: no fade again | D:L56767-56800; the factor scales all five, `FUN_00237d00` D:L85305-85322; the counter's writers D:L56164, D:L57489 only |
| its content | the camera actor's inventory, refreshed on a change | the same | the same | `FUN_00237760` D:L85148-85249 |
| reticle | drawn, the weapon's set | drawn | drawn | D:L56396, D:L56673-56688, D:L56765 |
| compass ring and marks | drawn, turned by the view | drawn | drawn | D:L56445, D:L56693, D:L50870 |
| info box (online): health bar, round clock, range | drawn: full health; the clock from the round's start (A_ready021's first frame 05:59) | drawn | drawn | D:L56442, D:L56758; research 166 R166.2 |
| stance word | only on a change (research 87 1.13) | | | |
| message window | "STARTING ROUND 1 OF n" posted at the init, fading in over 0.36 s | | | D:L57632-57649; research 87 section 8 |
| radar / tactical map | none in a multiplayer round | | | research 87 section 9 |
| item slots | none at rest: the R2 inventory is a menu (an item up is the ammo box's own icon and count) | | | research 87 1.2 |

Five more parts of the HUD (+0x3e0, +0x1f0, +0x6ac, +0x4e4, +0x57c) are written through their vtable's +0x34 on the
same frames (D:L56772-56776, D:L56782-56786, D:L56791-56795); the value each takes rides in a float register the
decompilation drops (it shows a 0 in every branch). So does the factor of the first branch's `FUN_00237d00` call
(D:L56771), read as 0 from the other two branches' (t - 1) x 2 and 1.0 and from research 87 section 1's "hidden for
1.0 s" (`HUD_FADE_REGISTERS_READING`, section 5).

*Flagged for their next edit (the review, F4):* research 87 section 1 (`87-hud.md` lines 34-35, "On a spawn the ammo
box and the team list **fade in**") and `hud.ts:270` (`SPAWN_FADE`'s doc, "The HUD fades in on a spawn") are
contradicted by R322.8: the fade's counter is written only at the HUD's init and the tactical map's close.
*2026-10-17, PAR-94c (issue #262; reading, pending review):* `SPAWN_FADE`'s doc corrected (the HUD's init); research 87
section 1 still owed at its next edit.

**The kit the box shows.** Online the kit is the one chosen in the game lobby's ARMORY, before the load (research 125
section 8, the capture `A_ready007`); with no saved loadout, the type's default (R95.5). Which moment of the load or of
the round start writes it into the actor's inventory was not traced (`PRESPAWN_KIT_SOURCE_READING`); it does not
change what is drawn: the box is at alpha 0 until 1.0 s, by which time round 1's start (section 1.2) is a second old.
The reticle is drawn from frame 1 off the weapon in hand, so it is the one part of the kit that frame 1's inventory
decides.

### 1.5 Offline

The same CoreState init and tick (section 1.2-1.3), with three differences that touch these frames: `FUN_002a7d40`
calls no `FUN_001fb420` offline (its call is under the network flag, D:L149755-149758), so the HUD's parts are shown
by the living branch's `FUN_001f7a90` on frame 1 (D:L56564-56567) and no round banner is posted; the single-player
team list fades with the ammo box (`FUN_00221970` D:L56777, D:L56787, D:L56796); the info box is hidden offline
(D:L57480-57483, D:L57620-57622). The kit is the mission's own selection before the load. The controller's mode byte
`bVar1` = 2 hides the help lines and the HUD's parts at +0x1758c and +0xc (D:L56614-56625); what sets 2 was not
traced -- a campaign question, not this row's.

## 2. The port, frame by frame

### 2.1 The online match (`LobbyMatch` and `mountMatch`)

| frame | what the code does | what a player sees |
|---|---|---|
| P0, the game lobby | the ARMORY is the lobby's (ONL-17, research 167); the room seats the page at its welcome | the lobby |
| P1, the hand-off | `LobbyMatch.start` covers with the loading panel (`pageLobbyMatchScreen`'s `cover`, then the map's `dlgLoad`), begins the map's load (`matchLoader.load`), and holds the input (`blocked`, `lobbyMatch.ts:162`); the match is not mounted: no HUD, no `PlayerLoadout` | the loading screen |
| P2, the release | `LoadingJoin.frame` releases 0.5 s (`LOAD_STATE_FADE_SECONDS`) after the lanes finish -- the assets in and the net lane `online`, which the lobby's welcome already made it (`lobbyMatch.ts:220-222`; `loadingJoin.ts:29-30`, `LOAD_NET_HOLD_READING`); the release sends `loaded` (`lobbyMatch.ts:186`, `loadingJoin.ts:107-110`), hides the screen and mounts the match (`begin`, `lobbyMatch.ts:246-251`) | the loading screen goes |
| P3, the mount (no frame yet) | the kept assets resolve at once: `place` (`matchMount.ts:594-663`) -- the HUD's bitmaps; the body reset to the side's default type (`:631`); the kit tables and the types back to SEAL 1 / TERRORIST 1 (`loadouts.setMap`, `:633`; `loadout.ts` `setMap`); **`loadouts.spawn(seat, { network: true })`** (`:634`): no kit given and `network`, so the type's `default_weapons` (`loadout.ts:369-375`; e.g. Frostfire's SEAL 1: M4A1 / Mark 23 / M67, HE, Double Ammo Load, research 91 section 14); `firearm.spawnKit(seat)` (`:636`): the primary in hand, every magazine full, its default fire mode; the walk on foot at the measured stand (`:642`, `:662`). Then `join` (`:667`): `NetPage` on the lobby's client, the hand-off's events replayed -- the lobby's welcome, which posts the waiting line when the welcome said `waiting` (`netPage.ts:1296`), else a round banner (`:1298` -> `startRound`) | -- |
| P4, the first drawn frame (the renderer is made asynchronously, `matchMount.ts:726`) | `hud.setVisible(walking)` turns the HUD on (`:877`), its clock `sinceOn` from 0 (`hud.ts:1405-1408`); `showReticle` (`:875`; `reticleShown`: walking, not dead); `feedHud` (`:883`): the default primary's icon, the magazine, the fire mode | the world from the measured stand (not the room's slot); the round's fader from black (1.5 s) and the banner (the replayed welcome's round, or `DEFAULT_ROUND`'s "STARTING ROUND 1 OF 11" and Vigilance's objective under a waiting line); the compass by the camera; the info box: a full health bar, the name, the timer at the model's 06:00 (`hud.ts:616`: no `roundStart` yet, so `NetPage` sets none), the range; **the reticle of the default primary; the own body with the default kit hung**; the ammo box at alpha 0 (`SPAWN_FADE` hold 1 s, `hud.ts:271`, `:1601-1603`, `:872`); no input |
| P5, 1.0-1.5 s after P4 | `timing().fade` (t - 1) x 2 | **the ammo box fades in with the default kit**: the primary's icon, "30/30"-style rounds, "n MAGS", its fire-mode cells |
| P6, until the room's round 1 | the room holds round 1 until every seated non-spectator's `loaded` (`room.ts` `firstRound`, `loaded`), at most `loadBarrierS` = `LOAD_BARRIER_TIMEOUT_PLACEHOLDER` 90 s (`bridge.ts:869`); the room spawns nobody over the hold (`room.ts` `start`, LOW-11) | **the default kit at full, the clock still at 06:00, for as long as the slowest seat loads**: about one trip of the socket when this page is the last, up to 90 s when a seat never reports (the forge's case) |
| P7, round 1 | `startRound` spawns every seat (`spawn`, kit and type) before it broadcasts `roundStart` (`room.ts` `startRound`); the page's `spawn` -> `respawned(kit, char)` -> `firearm.spawnKit(side, kit, char)` (`matchNet.ts:175`): the room's kit -- the lobby ARMORY's; `roundStart` -> `startRound` (`netPage.ts:1470-1485`, `:1228`): `sinceOn` 0 again (`hud.ts:1423-1434`); `blocked` lifts | the body moved to the room's slot and rebuilt with the chosen kit; the reticle's set and the box's content switch; **the ammo box hidden again for 1 s and fading in again**; the fader from black and the banner a second time; the clock from the room's round; input |

So the default kit is visible to the player: the reticle and the body's weapons from P4, the ammo box from 1.0 s after
P4, until P7. Whether it is seen at all depends on the barrier's wait: with this page the last loader the wait is one
trip of the socket plus the renderer's start, and the ammo box (which waits 1.0 s) may never show it; the reticle and
the body do for those frames.

### 2.2 The offline match (`/testroom`'s single-player room, `./net/loopback`)

The page's offline match runs the server's `Room` in the page (`SOLO_IS_NETWORK_READING`: the network branch of every
rule). `show` puts a SEAL's kit on the body -- with no server named, the side's pending pick, else its type's
default (`loadouts.spawn('seal', { network: !!NET.url })`, `loadout.ts:369-375`), then `hangKit`, `spawnKit('seal')`
(`main.ts:1833-1835`) -- and starts the walk as soon as its first draws are warm (`startInWalk`, `main.ts:1840`,
`:201-213`), under `/testroom`'s loading panel, whose frame draws the HUD whenever the walk is on
(`main.ts:1535-1557`). The panel lifts on the page's lanes (`main.ts:1569-1579`). Then, on a map's first entry, the
ARMORY opens (W5.R1, `armoryPart.seat()`) and the room is made -- and the player spawned with the chosen kit -- only
when it is left (`soloAfterArmory`, `main.ts:1722-1747`); with no ARMORY (`NO_ARMORY`, or a later entry of the same
map) the room is made at once inside `show`, under the panel.

- With the ARMORY: the ARMORY's quads are drawn after the HUD, over the 640x448 frame fitted whole and centred
  (`armoryView.ts:259-313`, `armoryFrame`, ARMORY_FRAME_FIT), its `BACKGROUND IMAGE` stretched over that frame when the
  dialog names one (`armoryLayout.ts:407-408`); the HUD in the native presentation is anchored to the canvas's edges
  (`hud.ts:826-827`). On a canvas wider than 640:448 the ammo box's left part and the right-hand info box and compass
  fall outside the ARMORY's frame. Read, not run: whether those margins show the HUD's default kit beside the ARMORY is
  a browser run's to see. The HUD's clock has run since the walk started, so the ammo box is at full when the panel
  lifts.
- Without it: the room's welcome and the player's spawn come under the panel, so the kit at the release is the room's.

### 2.3 The room

The server's room draws nothing. Over the launch's hold a seat has its kit as a value (`Player.loadout`, the lobby
ARMORY's picks or the type's) and no body in play: `start` spawns nobody while the hold stands (`room.ts`, LOW-11), and
round 1's `startRound` spawns every seat before it tells `roundStart`. Nothing in the room is drawn before or after.

## 3. The differences

| # | difference | the original | the port | on which frames |
|---|---|---|---|---|
| D1 (root) | **Where the barrier is waited.** | on the loading screen: every console's load state completes on the host's barrier (`+0x112` = 2, sent to the clients as it passes; section 1.1) (the review, F1; was: "waits for the host's barrier, a client's for round 1's start"); the core state, and so the HUD, begins with round 1 | after the loading screen: the screen lifts on the page's own load (the welcome stands in for the network byte, `LOAD_NET_HOLD_READING`), `loaded` is sent at the lift, and the match waits for round 1 mounted and drawn | P2-P6 |
| D2 | **The default kit drawn before the spawn.** | no kit is drawn before round 1: the first frame is round 1's, its reticle off the weapon in hand, the box at alpha 0 to 1.0 s | the type's `default_weapons` on the body and in the reticle from P4, in the ammo box from P5 | P4-P6 |
| D3 | **Two round starts.** *Half fixed 2026-10-17 by PAR-94c (issue #262; reading, pending review): the banner and the posted lines -- a show of the HUD restarts nothing (`FUN_001f7a90` D:L56366-56447 posts no line and resets no clock); the banner is drawn once a round has begun (`Hud.startRound`, at the page's `roundStart`), the original posting it only at a round's or a level's (re)start (`FUN_001fb420` D:L57632-57649, its post under the network flag; called by `FUN_002a7d40` D:L149755-149758 and directly by `FUN_001ecb10` D:L51046-51052; `FUN_002a7d40` from the level's init `FUN_001ec480` D:L50946 and an MP state D:L75935); posted lines keep their ages across a show. Still differs (D6): the fader and the box's fade, started at the HUD's init for a level (`FUN_001fa360` D:L57229, D:L57476, D:L57489; the port's `setBitmaps`), play at the waiting room's spawn and again at `roundStart`. Was: the whole round start played at the show (P4) and at `roundStart` (P7) -- since PAR-94 B2/B3 also in the launch countdown, dropping its line. 2026-10-17, PAR-94d (reading, pending review): the other half closed with D6 -- the fader and the box's fade play once a level, from the HUD's init (`setBitmaps`), not again at `roundStart`.* | one: the fader, the banner and the box's fade begin on the core's first frame | the banner at the room's `roundStart` (P7) only; the fader and the box's fade at the HUD's first show (P4) and again at `roundStart` (P7) | P4, P7 |
| D4 | **The clock and the place before the spawn.** | the round's clock from the first frame; the actor at its round-start place | the timer at the model's 06:00 until `roundStart`; the view from the measured stand until the room's spawn moves it | P4-P6 |
| D5 | **The offline ARMORY over a drawn HUD.** | no HUD exists while an equipment screen is up (the lobby's ARMORY is a menu state's; offline the mission's selection comes before the load) | the HUD (the kit `show` hung, at full) is drawn under the in-match ARMORY (W5.R1, a browser flow); outside its letterbox it may show (read, not run) | the ARMORY's whole time |
| D6 (found on the way; outside PAR-94) | **The fades at a round's start.** (Widened 2026-10-17, PAR-94c's review F2; was: "The box's fade at later rounds", each round from 2.) *Closed 2026-10-17 by PAR-94d (reading, pending review; `ROUND_TWO_FADE_READING`, section 5.1). The re-read: nothing at an online round's start re-runs the HUD's init or the fader or writes `DAT_003dc380`. Its writers are D:L56164 and D:L57489 only; `FUN_00228b80`'s one call is D:L57476, in `FUN_001fa360`, whose one call is D:L50912, in `FUN_001ec480` -- CoreState's Init (the ELF's vtable at 0x404f60: +0x10 `FUN_001ec480`, +0x14 the Tick 0x1ebed0, +0x1c the UnInit 0x1ebe30, +0x20 OnCover 0x1ecc00, +0x24 OnPop `FUN_001ecb10`; research 115 §8's slots). A round's start online is `CMPExitState`'s Tick `FUN_00223680` on game state 3 or 5: `FUN_002a7d40` (D:L75935; D:L149675-149769 calls none of the three) then the pop (D:L75936), which runs the resumed CoreState's OnPop, `FUN_001ecb10` with 0 -- no Init, and with 0 not even its own `FUN_002a7d40` (D:L51046-51053, the offline replay's argument 1). Round 1 is the level's init itself (D:L50912, then D:L50946). The tactical map's close was already the port's (`Hud.setTacMapOpen`). The port: `Hud.startRound` restarts the banner's schedule only (`roundFrom`); the fader and the box's fade run from `setBitmaps`.* | none: the box's counter's only writers are the HUD's init and the tactical map's close (R322.8), and the fader's start (`FUN_00228b80`) has one caller, the HUD's init (D:L57476) | `Hud.startRound` zeroes the clock and the box's fade at every `roundStart` (`hud.ts`, `startRound`), so the fader and the box's fade play again -- at round 1 after the waiting room's spawn already played them, and at every later round | round 1 (P7) and each round from 2 *PAR-94d (reading, pending review): built -- `Hud.startRound` restarts the banner only; the fades run from the level's init (`setBitmaps`) and the tactical map's close; a new match started in place (a round no later than the last begun on the level; the port's rooms do not reload, `room.ts` `startRound(st.matchOver)`) restarts them, standing in for the original's reload (D:L75915-75917, D:L128127-128128, D:L55753). `ROUND_TWO_FADE_READING`.* |
| D7 (PAR-94c's review F5; an edge) | **A spectator's banner after a map switch.** *Closed 2026-10-17 by PAR-94d (reading, pending review) in the HUD: the banner is drawn only once a round has begun, a spectator's view included (`Hud.step`; PAR-48's exception gone). The re-read: `FUN_001fb420` posts the banner under the network flag and the game object only (D:L57632-57649), testing no seat, and its callers run on every console online -- CoreState's Init through `FUN_002a7d40` (D:L50946, unconditional; the call D:L149755-149758 under the network flag) and `CMPExitState`, which a client pushes on the host's told game state alone (`FUN_002aa490` D:L151127-151134; the host D:L150670). So a spectator's console posts it at each round's start. The page's half -- `NetPage` starting a spectator's round at `roundStart`, and at a welcome into a round under way (phase `play`, `expired`, `decided` or `over`; none for the replay's watcher, whose welcome is a seek's) -- cleared by the online seat and written the same day (the plan's Log). A replay seek tells no skipped `roundStart` (the fold's welcome, score and seats' pairs only), so it posts no burst of banners; a banner posted before a seek stays for its 7.36 s across it (a replay adaptation's edge, named in the Log). Two wire edges, the online lane's (PAR-94d's review F2, F3): a late watcher can be shown an old round's number when the lobby heard a later round end with no `roundStart` handed on (the handed-on welcome's `round`; LATER 80 on the online lane); and a ghost seat welcomed into a running round gets no banner (`netPage.ts` welcome, `seatGhost`), where the level init's post covers a late player's console too (`FUN_002a7d40` D:L50946 -> `FUN_001fb420`) (LATER 81 on the online lane; *read 2026-10-17 by GHOST-BANNER, section 5.2, reading, pending review: the level init's post holds for the late ghost, beside its ghost lines; built the same day*). A replay's backward seek (PAR-94d's re-read N1): played through a round's start again, the watcher's fades replay -- the new-match test (`Hud.startRound`, the round no later than the last begun) reads the earlier round as a new match; a replay adaptation's edge, as the seek's banner above.* | the banner is posted at a round's start | a spectator's view draws the round start's banner from the HUD's own clock (PAR-48), which `setBitmaps` zeroes: on the test room's map switch a spectator or a replay's watcher sees the last round's "STARTING ROUND r OF n" for about 7 s (`hud.ts`, `step`'s banner line); match pages and first maps unaffected | a test-room map switch while spectating |

Where the port matches: no HUD on the loading screen (R322.1: the match is mounted only at the release); the
SPAWN_FADE's numbers (hold 1 s, ramp 0.5 s) and the five parts it scales (`hud.ts:872-890`); the reticle drawn from the
first frame and not faded (`reticleShown`); the ammo box's content the body's own inventory (`feedHud`); no radar, no
item slots at rest; no input before the round.

## 4. The build list

### 4.1 Rows (RED first; the page only)

| row | change | the test that shows it (RED first) |
|---|---|---|
| B1 (D1, D2, D3, D4) | **Hold the online loading screen until round 1.** **Ownership (the review, F3):** B1 touches `lobbyMatch.ts`, probably `loadingJoin.ts`, and `lobbyMatch.test.ts` -- the online lane's (ONL-18b, ONL-18c, ONL-20b); `LoadingJoin`'s "`loaded` once, at the release" is ONL-18b's design, shared with `/testroom`'s `main.ts`. B1 is the online seat's to build, or this lane's to claim only after telling that seat; B2-B4 are this lane's. `LobbyMatch` sends `loaded` when its own lanes are done (the assets in), not at the release, and its release waits, as the original's client does on the host's barrier (`+0x112` = 2, D:L55704; section 1.1), for the room's barrier to pass for this page -- which the room tells as round 1's `roundStart`, sent the moment its barrier passes (`room.ts` `loaded` -> `startRound`): a `roundStart` heard (or the hand-off's), **or a welcome whose `phase` says a round is under way** (`play`, `expired`, `decided`, `over`; `protocol.ts:751`) or that seats this page as a ghost -- the joiner into a running round, which the original lets through at once (its `+0x112` is still 2) and which would otherwise hold until the next round, `gameLobbyHost.ts:484` keeping only a `roundStart` heard on the lobby socket (the review, F2) -- then the 0.5 s (the review, F1; was: "as the original's client does on game state 3 (D:L55704-55707), for the room's round 1 for this page -- a `roundStart` heard (or the hand-off's) -- then the 0.5 s"). The match is then mounted with the round's `spawn` and `roundStart` among the replayed events, so `join` replaces the default kit inside the same task as `place`, before any frame is drawn, and the HUD's round start plays once. The room's ceiling (`LOAD_BARRIER_TIMEOUT_PLACEHOLDER`) still bounds the wait; a close for good still ends the load (`finalClose`) | `lobbyMatch.test.ts`, with the test's own clock and a fake client: the assets in, no `roundStart` -- RED: `loaded` sent and the screen hidden 0.5 s later, the match started; GREEN: `loaded` sent at once, the screen held, no match; then `roundStart` -- the screen hidden 0.5 s later and the match started with the round's events in its `events`. A second case: the room's `spawn` and `roundStart` before the assets -- the release 0.5 s after the assets. A third (the review, F2): a joiner whose hand-off's welcome says `phase: 'play'` (or a ghost seat) and carries no `roundStart` -- RED (B1's first two cases built alone): the screen held after the assets until a next `roundStart`; GREEN: the release 0.5 s after the assets. And a pin beside it (today's order already holds it, so it is no RED): `matchMount.test.ts`, a mount whose replayed events carry the seat's `spawn` with a kit -- `loadouts.loadout()` is the room's kit before the first frame callback runs |
| B2 (D2, guard) | **No kit drawn for a seat the room has not spawned.** In the frame, the HUD and the reticle take "spawned" as well as "walking" (the original's gate is the actor: D:L56631) -- `hud.setVisible(walking && spawned)`, `reticleShown({ ..., spawned })` -- where `spawned` is the page's own `spawn` heard this match (`NetPage`), so a late or never-sent round 1 draws no default kit. With B1 it is a guard; without B1 it is the whole fix of D2 but not of D1 | `reticle.test.ts`: `reticleShown` with `spawned: false` -- RED: true; GREEN: false. `matchMount.test.ts`: a mount with no `spawn` replayed -- RED: `hud.state().visible` true after a frame; GREEN: false; after a `spawn` event, true |
| B3 (D5) | **No HUD under the offline ARMORY.** `/testroom`'s frame draws the HUD and the reticle only when the ARMORY is closed and the single-player room has spawned the page (the same `spawned` as B2) | `reticle.test.ts`'s predicate as B2; the HUD's twin through the page's hook (`/testroom`, `grenadeSelfMp.spec`'s helpers): with the ARMORY open, `hud.state().visible` -- RED: true; GREEN: false. A browser run on a 16:9 canvas to see the margins before and after |
| B4 (D6; outside PAR-94) | **The box's fade once a match** -- only if the capture confirms R322.8: `Hud.startRound` keeps the box's clock (`fadeFrom`) unless it is the match's first round | `hud.test.ts`: a second `startRound` 10 s after the first -- RED: `timing().fade` 0; GREEN: 1. Filed for the controller: it changes round 2 on, which PAR-94 does not cover. *Built 2026-10-17 by PAR-94d ahead of the capture, on the merge controller's ruling (reading, pending review), and wider than proposed: `startRound` keeps the box's fade and the fader at every round, round 1 included (round 1's are the level init's, `setBitmaps`, already played at the waiting room's spawn); `hud.test.ts`'s PAR-94d cases* |

**Built (2026-10-15 18:36Z, PAR-94 B2 and B3, branch `agent/par94` from `e3334ccfb`; reading, pending review).** The
gate re-read at the source for the build: `FUN_001f7ff0` (D:L56517) reads the camera's actor (D:L56540) and runs the
reticle-to-fade block only under `iVar2 != 0` (D:L56631); the living branch's `FUN_001f7a90` (D:L56564-56567) further
needs the local player alive and the camera on him. The gate is the actor, as section 1.3 says. B1 (LOAD-HOLD) is the
online lane's and landed before; B4 is not built (R322.8 waits on its capture).

*[2026-10-15, VOICE-MATCH-RED (LATER 60; the online lane, 12bcc7ba5): **B1's regression, found and fixed.** Was: since LOAD-HOLD
(b151af927, `main` PR #206) round 1's `roundStart` and the room's `voiceFloor` (`room.ts` `voiceRoundStart`) arrive while
the loading screen is held, are kept by `LobbyMatch` and are replayed inside the `NetPage`'s constructor
(`netPage.ts`:669) **before `matchMount`'s `net` is set** -- the match voice's `sync` (`voiceClient.ts`:356-365) took the
set `net` for a new client at its next `pad` and dropped the floor, so round 1's voice channel stayed null until the next
floor change (`voiceMatch.spec` red from #206 to #223: passing at 31f826801, failing at e63a56238). Now the voice links the
lobby's client (`o.client`, the one the `NetPage` adopts) until `net` is set (`matchMount.ts`, as `side` reads it); the
review checked every other `net` consumer the replay reaches -- none keeps the null.]*

- **B2.** `reticleShown` (`reticle.ts`) takes `spawned` beside `walking`, which the one firearm's `showReticle`
  (`matchFirearm.ts`) passes; the front end match's frame draws `hud.setVisible(walking && spawned)` (`matchMount.ts`;
  was `hud.setVisible(walking)`). `spawned` is the mount's own flag, set by the deps' `respawned` -- which only
  `NetPage`'s `case 'spawn'` for the page's own seat calls (`netPage.ts:1398-1401`, through `matchNet.ts:182`), the
  hand-off's replayed events included -- and never cleared within the match: a dead seat keeps today's HUD (the
  reticle hidden while dead, as before). No existing read held it (`NetPage.gate().alive` is true before any spawn;
  `NetClient`'s `alive` and `lastSpawn` are private; the walk's lock is also a death's and a turret's), and neither
  `netPage.ts` nor `net/client.ts` changed. A ghost, a spectator and a dead seat still draw through the spectator view
  (`Hud.state()`: a view draws whether or not `setVisible` is on), unchanged.
- **B3.** `/testroom`'s frame (`main.ts`) draws the HUD and the reticle through `pageSpawned` (`reticle.ts`): the
  ARMORY shut and, where the page has a room (`net`, the offline single-player room's or a server's), that room's own
  `spawn` heard (`ownSpawned`, set by the same `respawned` hook, cleared with each new room); a page with no room (the
  test room's free walk, which no room ever spawns) draws as before.
- **Tests.** Unit (vitest): `reticle.test.ts` -- `reticleShown` with `spawned: false` (RED true, GREEN false), a dead
  and a respawned pin, `pageSpawned`'s table and the two frames' lines pinned; `matchMount.test.ts` -- a mount with no
  `spawn` replayed (RED: `hud.state().visible` and the reticle true after a frame; GREEN: false; after the room's
  `spawn`, true), the spawn among the replayed events (both from the first frame), and the dead and respawned pin.
  Browser: `e2e/armory.spec.ts`'s PAR-94 B3 case (the ARMORY open on a 16:9 canvas: `hud().visible` and
  `reticle().visible` false; DONE and the room's spawn: both true) is written and **not run** -- the merge controller's
  browser slot; the 16:9 margins' look before and after (C84's acceptance) is owed to that slot.
- **Found on the way (read, not run; for the online lane, not built here).** A late joiner into a running *respawn*
  room is spawned at its welcome on the game lobby's socket (`room.ts` `start` from the welcome: no ghost outside
  classic, no hold mid-match), before the hand-off; the hand-off carries the `welcome`, the `roundStart`, a `score` and
  a `roundOver` (`gameLobbyHost.ts` `GameLobbyHandOff`), not that `spawn`, so `NetPage` never hears it. Before B2 that
  seat already played its first life on the type's default kit (the room's kit never applied); with B2 its HUD and
  reticle also wait for its next spawn. The fix is upstream: the hand-off keeping the seat's own last `spawn` as it
  keeps the `roundStart` -- a change to `gameLobbyHost.ts`, the online lane's.
  *[2026-10-17, LATE-SPAWN-HANDOFF (LATER 56; the online lane, `agent/online-spawn`; reading, pending review): **built.**
  The hand-off keeps the seat's own last `spawn` heard in the lobby, to a late seat only (`GameLobbyHandOff.spawn`), and
  `LobbyMatch` replays it in the room's order: the room spawns every seat **before** a round's `roundStart` (`room.ts`
  `startRound`), so a spawn heard just before the handed-on `roundStart` is that round's own and goes before it; one heard
  after it (the welcome's `start`, an ARMORY's `ready`) goes after it. A spawn of a round the room has since ended
  (`roundOver`) is dropped at the next `roundStart`; another seat's is never kept. The brief's "a spawn then a new
  `roundStart`: dropped" was read against that order -- a spawn then a `roundStart` is the round's own start spawn, kept --
  and the stale case is a spawn, the round's end, then a new `roundStart`. The same defect reached classic **today**: a
  late ghost waiting in the lobby across a round's start is spawned by it (`startRound` spawns the ghosts too), and its
  match drew no HUD or reticle until the round after. On the way, the hand-off's "older round" (LATE-WATCH F1) is
  now the socket's order, not the round's number: a respawn match is one round (`net/rules.ts` `isMatchOver`), so the
  next match's `roundStart` names round 1 again after the last one's `roundOver` of round 1, and was dropped. No
  `*_READING` or `*_PLACEHOLDER` was added by the build: every order is the room's own code. Tests:
  `lateSpawnHandOff.test.ts` (real `flatRoom` rooms, respawn opened directly; `RESPAWN_RULES_ENABLED` gates only which
  rooms the server offers).]*
  *[2026-10-17, LATE-SPAWN-HANDOFF's review (PASS WITH FINDINGS), folded in on `agent/online-spawn` (reading, pending
  review): **F2** -- the kept spawn is dropped at the seat's own `kill` (`room.ts` `kill`) and `demoted` (the idle kick's
  `demote`), so a late seat killed or moved out while its console waits is handed on no living spawn; **row (b)** -- an
  `abandoned` heard in the lobby clears the kept `roundStart`, `roundOver`, `score` and spawn (`abandon` leaves the
  level); **F1** (LATER 80's part) -- any view of the game's lobby not launched, and the client's return from its match,
  set the handed-on welcome's round to 1 (`room.ts`: the constructor, `abandon`, `returnToLobby`). **Row (d)** -- when the
  original makes a late console's actor is unread: the room spawns a late respawn seat at its hello (`start`) and a
  waiting classic ghost at the next round's start (`startRound`) while its console is still in the game lobby, so its
  body stands, and can be hit, before that console loads. Named `LATE_SEAT_ACTOR_READING` (server `room.ts`; §4.3
  below; research 101 §4; LATER 85). The lobby body's health (a hurt seat reaching its match at full health) is
  LATER 83; the forge's own hand-off, LATER 84.]*
- **Not corrected here:** `hud.ts:270`'s "on a spawn" and research 87 section 1 (section 1.4's flag) -- B2 touched
  neither line. No `*_READING` or `*_PLACEHOLDER` was added or settled; section 5's candidates stay uncoded.

### 4.2 Pins where the port already matches (NU.R3)

| pin | holds | the test |
|---|---|---|
| N1 | no HUD on the loading screen: the match is not mounted while `LobbyMatch` is `loading` | `lobbyMatch.test.ts`: `start` with the assets pending -- the port's `start` not called, `blocked` true |
| N2 | the fade's numbers and parts: hidden 1.0 s, (t - 1) x 2 to 1.5 s, the panel, the icon, the rounds, the magazines and the fire-mode cells together | `hud.test.ts`: `timing().fade` at 0.99, 1.25 and 1.5 s after `setVisible(true)` -- 0, 0.5, 1; the five rects' alpha the one factor |
| N3 | the reticle unfaded from the first frame | `reticle.test.ts`: `reticleShown` walking, alive, no map, no scoreboard -- true at once |

### 4.3 Readings named by the builds

| name | stands for | in code | the evidence that settles it |
|---|---|---|---|
| `LATE_SEAT_ACTOR_READING` | when a late seat's body is made. LATER 85 and 266: no body until the console's own load; classic keeps a ghost until the next round, respawn enters dead with alpha zero and waits for fresh eligible Action. *Was:* respawn spawned at its hello, while still in the lobby | server `room.ts`; section 5.3 (LATER 85, 266; reading, pending review) | ONL-32's original-runtime capture of a late joiner into a running game raises both; the load-relative >5 s gate and absence of a corpse need the same comparison |

## 5. The unknowns, as candidate constants (for the ledger at the build; none added now)

| candidate | stands for | the evidence that settles it |
|---|---|---|
| `PRESPAWN_KIT_SOURCE_READING` | which moment writes the ARMORY's kit into the online actor's inventory -- its creation in the load (`FUN_005442c0`) or round 1's start -- so which weapon frame 1's reticle shows. A lead (the review): round 1's start online calls `FUN_00542fc0` (D:L149756), which only arms a deferred flag (`DAT_0044d4b0` = 1, D:L409920-409925) -- its reader is the place to look | a source read of `DAT_0044d4b0`'s reader; a capture from the ARMORY's confirm to the first spawn with a kit unlike the type's default (a SEAL 1 with the 870): frame 1's reticle set; a PINE read of the actor's inventory at the core state's first tick |
| `HUD_FADE_REGISTERS_READING` | the factor the first branch passes `FUN_00237d00` (D:L56771) and the five parts' values (+0x3e0, +0x1f0, +0x6ac, +0x4e4, +0x57c) in all three branches -- a float register the decompilation drops | the disassembly at 0x1f7ff0's fade (the float moves before each call); a capture of the first 1.5 s of a round (the ammo box absent to 1.0 s, half at 1.25 s) |
| `FIRST_FRAME_ACTOR_READING` | that the camera object's vtable +0xc, called with the local player at the load's end (D:L49731-49732), writes its +0xbc, so the HUD's actor gate (D:L56631) is open on the core state's first tick | a read of that vtable slot's function (the class of the object `DAT_00415ff0` points to); the capture below: the HUD's reticle and compass on the first frame after the loading screen |
| `FIRST_FRAME_ALIVE_READING` | that the local actor's +0xe1 bit 4 (alive) is set on the core state's first tick, so the living branch shows the HUD on frame 1 | the same capture: the reticle and the compass on the first frame after the loading screen |
| `ROUND_TWO_FADE_READING` | R322.8: no ammo-box fade at round 2's start. *2026-10-17: still a reading, now built (PAR-94d; section 5.1)* | a capture of a round 2's start (the box present on its first frame) |
| `CLIENT_ROUND_WAIT_READING` | that a client's load completion waits for the host's barrier (`+0x112` = 2, received through `FUN_002c0850` D:L163415-163416) and not its `+0xcd` path (D:L55684-55685 against D:L55704-55707), so that its screen covers the host's barrier (research 125's `LOAD_NET_HOLD_READING`, open) (the review, F1; was: "waits for game state 3 and not its `+0xcd` path") | a two-console capture with one slow loader: the fast console's loading screen held until the slow one is in, and the client's cut about 0.5 s before its first round frame's clock |
| `LATE_OBJECTIVE_LINES_PLACEHOLDER` (*note only*; GHOST-BANNER's review F1, 2026-10-17) | whether a late console's level load runs the map's `start` script, whose MESSAGE commands are the side's objective lines (research 192 section 3.1), so whether a late ghost -- and a late watcher, PAR-94d's path (D7), which set the same precedent -- sees them after the round's banner; not transcribed. The port schedules them as at a round's start (`roundBanner` -> `Hud.startRound`'s `objective`); no constant names it (`netPage.ts` is the gameplay lane's) | ONL-32's capture of a late JOIN GAME (the late console's first seconds: the objective lines or none), or a read of `FUN_002a7d40`'s script start (D:L149733-149742: `FUN_0026a100` / `FUN_0026c600` on two script names) |

One capture session settles the first six (the first with a source read beside it; `LATE_OBJECTIVE_LINES_PLACEHOLDER`
is ONL-32's): a two-console online game from the ARMORY's confirm (a non-default kit) through
both loading screens, round 1's first two seconds and round 2's start, each frame kept.

### 5.1 Readings built (PAR-94d, 2026-10-17)

| name | in code | stands for | the evidence that settles it |
|---|---|---|---|
| `ROUND_TWO_FADE_READING` | viewer `hud.ts` (`Hud.startRound`'s doc: the round's start keeps the fader and the ammo box's fade; `roundFrom`) | R322.8 and D6: a round's start online runs neither the fader's start nor the box's fade -- they are the HUD's init's, once a level; built on the merge controller's ruling ahead of the capture; reading, pending review | the capture of section 5: a round 2's start, the box present on its first frame (and the HUD's fader not run again -- a fade of the exit state's screens, if any, is not this row's); until then this row stays open |

### 5.2 The late ghost's banner (GHOST-BANNER, LATER 81, 2026-10-17)

Status: **reading, pending review** (source inspection of the decompilation at the SHA above, re-hashed for this row;
nothing run, nothing measured; the port's code read at `721534c59`). The question (PAR-94d's review F2): a seat
welcomed as a ghost into a running classic round gets no round banner on the port (`netPage.ts`'s welcome calls
`seatGhost()` and not `roundBanner`, pinned by `netRules.test.ts`'s "a ghost gets no banner at the join"), where D7's
reading has every console's level init post it.

**The answer: the late ghost sees the round's banner, and its ghost lines beside it.** The level init's reading holds.
The order is the ghost first, then the banner, then the lines:

1. **The ghost is made in the load state, before CoreState.** The load thread's `FUN_005442c0` makes the local player
   and arms `DAT_0044ce50` (D:L410581). The load state's tick `FUN_001f5e70`, once the load is done, takes a late
   client's `+0xcc` branch -- `+0xcc` cleared (`FUN_002a7340` D:L55716, which writes it, D:L149278), `+0xcd` set
   (D:L55717) and, for a seat that is no spectator, the ghost flag `+0xd2` set (D:L55727) -- and on a later tick, with
   `+0xcc` clear, calls `FUN_002b7a90` (D:L55680-55681), which with `DAT_0044ce50` set calls the actor's set-up
   `FUN_002b7d60` (D:L158523-158525): the ghost's actor put in the death state (`FUN_00543d50`, D:L158633-158638;
   research 314 section 4.3). The release byte `+0xd0` (D:L55704-55707, D:L55684-55685) starts the 0.5 s count, and only
   then does the state go to CoreState (`FUN_002cf410` D:L55753). Before that no HUD exists (section 1.1).
2. **CoreState's init posts the banner, no seat tested.** `FUN_001ec480` builds the HUD and its message window 0x4366a0
   (`FUN_002b6fc0` D:L57423, `FUN_001f6e10` D:L57426, inside `FUN_001fa360` D:L50912), then calls `FUN_002a7d40`
   unconditionally (D:L50946), whose network branch calls the HUD's round start `FUN_001fb420` (D:L149755-149758; agreed).
   That shows the HUD's parts, the message window among them (`FUN_001f7a90` D:L57597 -> D:L56423), and posts
   "STARTING ROUND %d OF %d" (or the tiebreaker line) to 0x4366a0 under the network flag and the game object alone
   (D:L57632-57649; agreed). The post `FUN_002b6530` refuses only a window not built (`+0x18` null) or with its bit
   `+0x4dc` & 4 clear (D:L157928); that bit is set in the window's constructor (`FUN_002b7610` D:L158377) and no line
   clears it. Nothing in the post, in `FUN_001fb420` or in `FUN_002a7d40` reads the seat's ghost flag `+0xd2`, the local
   actor's life or the camera.
3. **Nothing of the ghost's state hides or clears the window.** On every tick the HUD update `FUN_001f7ff0` takes the
   not-alive online branch for the ghost (D:L56564, D:L56589) and, the camera on its own actor (research 314 section 4.3
   item 3), the ghost's own view `FUN_001f97b0` (D:L56592). That writes the ghost's lines to the HUD's help lines
   (`+0x19d64`, six lines; D:L57049-57060; drawn at their own place, D:L57120-57124) -- not to the message window -- and,
   with the controller's mode byte not 3, calls `FUN_001f7a90` again (D:L57112), which shows 0x4366a0 (D:L56423), then
   hides only the other two windows 0x437060 and 0x436b80 (D:L57113-57114). Once the ghost cycles to a teammate,
   `FUN_001f9f20` hides the HUD (`FUN_001f77c0` D:L57174) and, the mode byte not 3, shows the window again
   (D:L57178). The window ticks each frame under the camera-actor gate (D:L56703), which the ghost's actor holds
   open. The window's hides are the tactical map's opening (`FUN_001f71c0` D:L56188,
   called from `FUN_0020a780` D:L64803-64868 and from `FUN_001f7a90` D:L56437-56438 on the map's `+0xdc`; single
   player only, research 87 section 9); the HUD hide `FUN_001f77c0` (D:L56354), called on the own view's mode
   byte 3 (D:L57108-57109; the menus at D:L61963 and D:L79402 set it, not the ghost's set-up), by the teammate view
   before its show (D:L57174, then D:L57178), by the spectator's view `FUN_001f9160` (D:L56873), by the offline dead
   view `FUN_001f93c0` (D:L56971) and by `FUN_00228ee0` for a living actor (D:L78451) -- none in an online ghost's
   own view (GHOST-BANNER's review F3; was: "mode byte 3" alone); and the death edge's (D:L56638), offline only; its
   clears are
   the HUD's teardown (D:L58245) and an exit state's (D:L76085). None of them runs in an online ghost's first frames.
4. **The lines start with the banner.** `FUN_001fb420` hides the help lines and restarts their clock (`+0x1a0e8`:
   -1 at D:L57607, 0 at D:L57663), so the ghost's lines show from its first tick for 10 s and fade over 0.5 s
   (D:L56541-56562), on the same frames as the banner's message.

**NU-11's pin rests on no read.** The "no banner" assertion came with the first online round banner (2026-09-29),
when the port posted the ghost's lines on its message window in the banner's place; it was kept when S1g moved the lines
to WEAPON EXCHANGE's prompt (2026-09-30) and when NU-11 (research 314 section 4.3) read the ghost's actor, the cycle and
its lines -- no note read the banner for a ghost. Corrected by the source (the parity rule, "when two implementations
disagree, the original decides").

**Built 2026-10-17 (GHOST-BANNER; reading, pending review), on the gameplay seat's clearance (redotcom-b4) and the
merge controller's ruling to correct the uncited pin.** `netPage.ts`'s welcome: the ghost branch also starts the round
(`roundBanner(ev.round ?? 1)`, the welcome's round -- LATER 80's corrected value), after `seatGhost()`, in the
source's order (the ghost, then the banner). `netRules.test.ts`'s pin corrected and retitled with its cite: a ghost
welcomed into round 3 gets "STARTING ROUND 3 OF 11" beside the ghost's prompt (RED on the earlier `netPage.ts`).

The gameplay seat's two conditions, named here:

1. **A ghost rejoin gets the banner too.** A played seat dropped mid-round and seated again as a ghost (the page's
   `seatedBefore` path, with `RECONNECT_GHOST_LINE_ADAPTATION`'s notice) now posts the round's banner beside that
   notice. The original has no rejoin in place -- the game has no reconnect, a departure is a leave
   (`KEPT_RECONNECT_READING`, research 95 and 179; `FUN_002bc530` D:L161130-161140; research 315 section 3.3) -- so
   a dropped console's way back is JOIN GAME, a late join that loads the level (research 314 sections 4.2-4.3),
   whose level init posts the banner as in items 1-2 above (GHOST-BANNER's review F4: the no-reconnect reading
   added). The page's
   in-place rejoin is OT.R59's adaptation; the banner it now shows is the late join's reading, the notice the
   adaptation's. Reading, pending review (by that equivalence; no capture of a rejoin). Pinned:
   `nu11GhostWalk.test.ts`, "a played seat dropped mid-match and seated again as a ghost" (RED on the earlier
   `netPage.ts`).
2. **The objective lines after the banner.** `roundBanner` also schedules the side's objective lines after it (the
   map's `objectives` script, PF-12, research 192 section 3.1), as PAR-94d's watcher case does (D7). Whether a late
   console's level load runs that script is not read: a placeholder, `LATE_OBJECTIVE_LINES_PLACEHOLDER` (*note only*;
   section 5's table, research 101 section 4), which covers PAR-94d's watcher path too. The port schedules them as at a
   round's start; no pin. (GHOST-BANNER's review F1; was: "not re-read ... Reading level".)

Left as it is: a spectator promoted to a ghost (`promoted`, protocol 5, PL-8, the port's line) -- its level init, and so
its banner, were its welcome's as a watcher. One name is added, note only: `LATE_OBJECTIVE_LINES_PLACEHOLDER`
(condition 2); every other step above is read.

### 5.3 When the original makes a late console's actor (LATER 85, 2026-10-21)

Status: **reading, pending review** (source inspection of the decompilation at the SHA above, re-hashed for this
section; nothing run, nothing measured; the port's code read at `f4aead7cc`). The question (LATE-SPAWN-HANDOFF's review,
row (d); `LATE_SEAT_ACTOR_READING`, section 4.3; LATER 85): the room spawns a late seat while its console is still in the
game lobby -- a respawn seat at its hello, a classic ghost at the next round's start -- so that body stands, and can be
hit, before its console loads. Does the original's late console have an actor before its load, or only at it?

**Answer: only at it, and dead.** No other console holds a late joiner's actor before that joiner's own load is done
(its own console makes its local actor in the load thread, `FUN_005442c0`, unpublished until the load ends); the
actor appears at the end of the load, about 0.5 s before the joiner's loading screen lifts, already dead.

1. **Another console makes a remote player's actor only from that player's `SealState` net object.** The class
   (`"SealState"`, 0x3f27f0; 0x90 bytes) is registered with four callbacks (`FUN_0030ce80` D:L162712; research 179 and
   191 name it). Its create callback `FUN_002bf070` (D:L162547-162618) makes the actor -- `FUN_00599690` (D:L162596),
   whose only caller this is -- and stores it at the object's +0x8c. A console whose `DAT_00437cec` is clear queues the
   create instead (D:L162565-162569) and drains the queue later (`FUN_002bd560` D:L161823-161836, `FUN_002bee10`
   D:L162474-162486). The update callback `FUN_002bee10` -> `FUN_002be150` creates a missing actor through the same
   `FUN_002bf070` (D:L162250-162253). No other path makes a remote player's actor. (`DAT_00437cec` has no write by
   name in the decompilation; that it is the console's level being up is read from its two drains, which run in the
   load state's tick after the load: D:L55682, D:L55691.)
2. **A console publishes its own `SealState` only after its own load.** The load thread makes the local player
   (`FUN_005442c0`, online, from D:L152167-152168; section 1.1), which sets `DAT_0044ce50` = 1 (D:L410581). The load
   state's tick (`FUN_001f5e70`), once the load is done (its +0xd), calls `FUN_002b7a90` -- a client only with the game
   object's +0xcc clear (D:L55680-55681), the host always (D:L55689-55690) -- which, once, on that flag
   (D:L158523-158525), runs `FUN_002b7d60`: online, the local player's net object made (`FUN_002bdda0(local, 1)`
   D:L158611; `zNetCreateObject`, D:L162081-162113). So the object step 1 keys on does not exist before the owner's
   load is done.
3. **A late joiner enters dead.** The game object's +0xcc is the late flag (`ABANDON_LATE_JOINER_READING`, research 315
   section 12.1). In the same tick the late console joins the game's session, clears +0xcc and sets +0xcd
   (D:L55716-55718), and, when it is no spectator (`FUN_002c2fa0`, `CheckIfSpectator`), sets the ghost flag +0xd2
   (D:L55722-55727; research 179 section 6.23). With +0xcc clear the next tick publishes the actor (step 2), and
   `FUN_002b7d60` puts it dead at once: `FUN_00543d50` (D:L158634-158647), which posts the actor's event 0x22 -- the
   death (D:L410460-410462; research 170). In a classic game it stays a ghost (the ghost flag kept: D:L158637-158638);
   in a respawn game (+0xdc) the ghost flag is cleared right after (D:L158640-158642), so it comes up by the respawn
   path; a spectator is put dead too (D:L158646-158647). The client's release (+0xd0) follows on its +0xcd with +0xcc
   clear (D:L55684-55685), then the 0.5 s count (section 1.1).

**What it settles.** `LATE_SEAT_ACTOR_READING`'s question: the original's late console has no actor anywhere -- nothing
drawn, nothing to hit -- until its own load is done, and its first actor is dead (a classic ghost until the next round's
start; respawn, dead until its respawn). The room's spawn while the console is in the game lobby has no counterpart.
LATER 83 (a hurt lobby body reaching its match at full health) then has no lobby body to hurt.

**What it does not settle.** When a respawn game's late joiner first comes up after that death: the respawn path's
own wait (the room's `respawnReady`, `RESPAWN_PRESS_S` from the death) is assumed to run from this death as from any;
not traced into the dead controller (`FUN_00592560`). *[Read 2026-10-22 for LATER 266 -- below: 5 s from its death at
load, with no fade wait.]* The respawn rules are off online (`RESPAWN_RULES_ENABLED`, the
owner's ruling of 2026-09-29), so no live room takes that path today. ONL-32's capture (a late joiner into a running
game: when its body first draws on another console) would raise all of this to proven.

**Built (2026-10-21, LATER 85; `agent/later-85`; reading, pending review -- unit test).** Classic alone (the merge
controller's choice; the respawn half is LATER 266, which folds LATER 83). The bridge passes its late flag to the room
(`GameSeat.late`: `SeatEntry.late`, +0xcc, known before the room seats the page; `bridge.ts` and `game.ts` `seatFor`;
`server.ts` into `Room.hello`'s `as.late`). A classic seat so marked has no body until its `loaded` (`awaitingLoad`):
`start` spawns nothing, a round's start passes it by, `loaded` clears it, and the game back in its lobby clears it (the
abandon, the return -- where every seat is spawned in the waiting room; +0xcc itself is kept there for a seat whose
READY started its load, research 315 section 12.1, LATER 64, which changes nothing here). The fresh review's fold (F1-F4):
a round's start that passes seats by names them (`roundStart.ghosts`, additive under protocol 11) and the page so named
stays a ghost (`NetPage`'s `seatGhost`) instead of clearing it -- the hand-off replays that start after the welcome; such
a seat is no player of the round (`playsRound` set only for a spawned seat, so `ghostOf` holds and no result is
credited); the late flag is kept per connection until its `loaded` (`lateMembers`), so a late spectator promoted before
its load awaits it too. The re-read's voice finding (folded on the merge controller's word): a round's start leaves a seat it
passed by on its late joiner's channel with its ghost flag (`voiceRoundStart`), and its `loaded` -- that console's level
start, +0xcc set -- asks the late joiner's channel with the ghost flag (`FUN_001f6660` D:L55848-55849,
`VOICE_LATE_JOINER_READING`; D:L55727), so a bodiless ghost never shares the living team's channel. The narrow re-read's two (same
class, folded on the merge controller's word): a waiting seat's lobby ARMORY return re-asks its last channel, never the
team's (`voiceRadio`); and a load finished over the launch's hold asks nothing until round 1 (`loaded`'s ask gated past the
waiting room). Whether the original's round 1 clears such a seat's ghost flag -- it loaded before the round, and the room
spawns it at round 1 -- is untraced: LATER 274 (`FUN_002232a0`'s callers). *[Read and built 2026-10-22, LATER 274 -- below: it does
not; such a seat is a ghost of round 1.]* Without an actor it is refused as a ghost is -- its
round, throw and mount ask dropped 'not alive' by the gates that exist. A respawn room keeps the spawn at the hello: the
page has no dead-at-load state (a seat held dead without a `killed` shows alive and gets no prompt, `netPage.ts`), and
the respawn rules are off online. Tests: `roomLateSeatLoad.test.ts`.

**LATER 274's read (2026-10-22; the online seat; reading, pending review -- source inspection, two vtable slots read off the
desktop's built ELF; the fresh review found it sound): a late console that loads over the launch's hold is a ghost of round
1, and comes up at round 2.**

1. It enters dead with its ghost flag set at its own load (step 3 above), the hold or not.
2. **Round 1 revives nothing.** Round 1 starts straight from the core state's init (`FUN_001ec480` -> `FUN_002a7d40`,
   D:L50946), whose per-entity reset calls each entity's vtable `+0x4c` (D:L149744-149746). For an actor that is
   `FUN_00553e60` (the actor's vtable 0x6691a0, set by its constructor `FUN_00553ea0`; its `+0x4c` slot holds 0x553e60):
   the kit's reset (`FUN_005c7840`) and the controller's vtable `+0x5c` -- for the human's controller (vtable 0x6694b0) the
   slot holds 0x597f50, `FUN_00597f50`, which withholds the return-to-life event 0x23 while the ghost flag is set
   (D:L454601-454602) and sets two state bytes. No revival in it.
3. **The revival is between rounds.** The round's exit clears the ghost flag of a non-spectator (`FUN_002232a0`
   D:L75846-75849 -> `FUN_00543b90`); then `FUN_00223680` (D:L75899) runs `FUN_00598b90(actor, 0)` on every actor not
   departed (D:L75925-75931: the departed test D:L75930, the call D:L75931; the full respawn, its start slot by
   `FUN_002b8100`) and starts the next round (`FUN_002a7d40`, D:L75935). Round 1 runs none of it. (The review's F2; was:
   the loop cited as `FUN_002232a0`'s, D:L75925-75928.)

**Built (2026-10-22, LATER 274; reading, pending review -- unit test).** A late seat that loads over the launch's hold is
marked a ghost of the next round (`ghostOfNextRound`, set in `loaded` only with the hold standing): round 1's start passes
it by as an awaiting seat (no body, named in `ghosts`, no `playsRound`, so no result), its voice asks the team's channel as
a ghost -- the dead step makes it the dead zone, as the original's level start asks 0 for a dead actor -- and the round
after spawns it. A late seat loaded in the waiting room without a hold (a takeover across a lobby return, the bridge's
late flag kept through a load, LATER 64) is no ghost of the next round; the abandon and the return clear the mark. Tests:
`roomLateSeatLoad.test.ts` (the hold case; its pin).

**LATER 266's read (2026-10-22; the online seat; reading, pending review -- source inspection, a vtable slot read off the
desktop's built ELF): a respawn game's late joiner can come up 5 s after its death at load, with no fade to wait for.**
(The fresh review's F1; was: "about 5 s after its own clock's zero" -- the at-load death does stamp `+0xfb4`.)

1. **The respawn press's gate.** The dead's controller `FUN_00592560` (D:L451644-451731) takes the respawn press
   (`FUN_002c64e0`, D:L451674-451677) only for a seat that is no ghost (+0xd2 clear), no spectator (`FUN_002c2fa0`), in a
   respawn game (+0xdc), more than 5.0 s past its death -- the game clock `DAT_004365c0` less the actor's `+0xfb4`
   (D:L451680, the test D:L451699-451700) -- and with its model's alpha (`+0x9c`) at 0, its fade done (D:L451701-451724;
   the request `+0xfcf`, D:L451724-451725). Research 91 §4.1's "from 5 s dead, once the body has faded" is that gate.
2. **The death's time.** `+0xfb4` is written by the actor's death alone (`FUN_00547af0` D:L413049: the clock) and
   cleared by `FUN_005998b0` (D:L455522); research 329 reads it "0 while alive". The clock is the mission object's
   `+0xe0` -- 0x4364e0 + 0xe0 is `DAT_004365c0`, to which `FUN_002aa490` adds a float (D:L151067; its caller `FUN_002aab00`, D:L151256-151261, reached by pointer) -- zeroed by
   `FUN_002ac060` (D:L151914, from the round-reset state `FUN_001f1bb0`, reached by pointer) and by `FUN_002ac410`
   (D:L152098, the level's load, D:L49730). Research 270's `ROUND_EPOCH_PLACEHOLDER` row, which measured it counting from
   0 at a round's start, is still open: research 91 §18.1 reads the same word as the round's length in ms. (The review's F3;
   was: research 270's row cited as settled.) The read below needs only that the death stamps this clock.
3. **The late joiner's death at load is a death, stamped, with no fade.** The at-load `FUN_00543d50` (step 3 above), for
   an actor with health (`+0x1044` non-zero) and bit 4 of `+0xe1` set, zeroes the health, sets `+0xfb0` = 6 and calls the
   actor's vtable `+0x58` (D:L410426-410430) -- the slot holds 0x547af0 (the actor's vtable 0x6691a0, read off the built
   ELF), `FUN_00547af0`, the death, which stamps `+0xfb4` with the clock (D:L413049) and clears bit 4. A fresh late
   joiner's actor meets both conditions: its constructor `FUN_00553ea0` sets the health to 1.0 (D:L419759) and its base
   `FUN_0029ee10` sets the bit (D:L145030), and nothing between its making and the at-load death touches either. Then
   `FUN_00543d50` zeroes the model's alpha (D:L410440), so the fade is already done. So its press counts **5 s after
   that death** -- the death at its load. The HUD's dead prompt reads the same clock less `+0xfb4` (D:L57009, D:L57063),
   so its "press to respawn" shows from then too. (The review's F1, found by reading the slot; was: "The late joiner's
   death writes no time ... `FUN_00543d50` never calls `FUN_00547af0` ... its `+0xfb4` is still 0 ... about 5 s after its
   own level start".)

So the room's `respawnReady` -- `max(RESPAWN_PRESS_S, RESPAWN_FADE_S)`, 10 s from a death -- is 5 s too long for a late
joiner dead at load: its wait is `RESPAWN_PRESS_S` from that death, the fade having no length. **The build waits for respawn's return** (the merge controller, 2026-10-22: `RESPAWN_RULES_ENABLED`
is off everywhere, and three hot-file hunks for a mode nobody plays only add merge risk), and is ready in LATER 266's row:
`awaitingLoad` for a respawn seat too (no spawn at its hello), a dead-at-load event on the wire (no body, no killer) that
`NetPage` takes as a death without a pose (its `dead`, the prompt, the press), and `respawnReady` on `RESPAWN_PRESS_S`
alone for a seat dead at load.

**Built (2026-10-23, VRJ-1 / LATER 266; `agent/respawn-vig-fix`; reading, pending review).** The original source export
was re-hashed to the SHA256 above and read directly at `FUN_001f5e70` D:L55678-55727 (the late flag and load gate),
`FUN_002b7d60` D:L158611-158647 (the late actor enters dead and respawn clears its ghost flag), `FUN_00543d50`
D:L410426-410462 (death and alpha zero), `FUN_00547af0` D:L413049 (the death stamps the clock), `FUN_00592560`
D:L451674-451725 (fresh press, strict >5 s and alpha zero), and `FUN_001f97b0` D:L56996-57040 (the help's same
gate). The vtable `+0x58` mapping to `FUN_00547af0` remains the inherited ELF read above; this implementation did not
re-derive that slot from the ELF. No original game or capture was run. Fresh source review and ONL-32's comparison
remain distinct obligations.

- `Room.hello` now keeps the bridge's late flag for respawn seats too. There is no spawn before `loaded`; the seat is
  refused by the existing not-alive gates while loading. `loaded` stamps `diedAt` and `deadAtLoad`, sends an additive
  `deadAtLoad` event to that player only, and never runs the ordinary kill/score/pose path. The room's round clock
  continues. A fresh Action is eligible strictly more than `RESPAWN_PRESS_S` after that death; `RESPAWN_FADE_S` still
  holds an ordinary death, including one after this first respawn.
- **VRJ-1 source-review correction (2026-10-23; reading, pending review): the invisible actor still has its original
  start transform.** `FUN_002b7d60` D:L158619-158628, read directly, selects key 0/2 through `FUN_002b8100` and applies
  its transform before the death at D:L158634-158642. At `loaded`, the room silently uses its existing original start
  picker and the same lift/floor-probe/facing convention as an ordinary start, without a `spawn` event, kit reset,
  corpse or score change. Before `loaded` there is no actor to count in another player's max-min search; after it,
  the actual dead actor counts at that transform (research 353 section 2: the r0004 actor scan has no alive test).
  The additive `deadAtLoad.at` and `yaw` carry the actual placed feet/facing to its page, including the initial-hold
  retell. A page that already reported its load on an earlier socket re-sends `loaded` at a welcome in any launched
  phase, under every rule and role (NET-RES.R8; the controller's RC0 ruling, 2026-10-24, a browser adaptation); the
  room publishes a fresh late respawn seat dead at load and changes nothing for a seat already placed
  (`roomRespawnLateJoin.test.ts`, the RC0 pin). `NetClient` applies `at` and `yaw` through the existing no-rebuild mover placement (`resume`) immediately before
  `setDead(true)` and retains them across the lobby idle walk's adoption. There is no synthetic spawn/resume event,
  no living-spawn counter increment and no respawn callback/refill. An older message without these additive fields
  keeps the page's existing placement. `respawnSpawn.test.ts` holds both max-min changes and the exact silent start;
  `lateSpawnHandOff.test.ts` checks direct delivery and buffered Room/GameSocketHost/NetPage adoption against a real
  mover's public feet, facing and spawn count. These are unit observations, not an original-runtime comparison.
- The load's alpha zero means no corpse on other consoles either: the existing join-envelope ghost view carries
  it as invisible, and the victory offer excludes it. Classic's actor/voice/round-ghost behavior stays in its existing
  branch. Respawn's load asks the late joiner's voice channel without retaining classic's ghost flag, as the source
  clears that flag after the death.
- A late respawn load completed over the launch hold stays dead at the first round start: round 1 revives no late
  actor (the LATER 274 read above), while ordinary launch seats still spawn. The round's UI reset is followed by the
  same dead event with its existing room-clock age in ticks, preserving the stamped wait. Nor does an Action revive it
  over the hold, however long the on-time seats load: `respawnReady` refuses a seat dead at load in the waiting room
  while the launch's hold stands, as round 1 starts from the level's init with no revival before it (`FUN_002a7d40`
  D:L50946; the takeover review's F1, 2026-10-24; reading, pending review). The first Action in round 1 past the
  strict 5 s respawns it. A later match's normal
  rebuild revives the loaded seat. The event's transport and local arrival timestamp are browser adaptations: replay
  through the loading screen does not restart the death clock, and no synthetic round start or gameplay timer is added.
- `NetClient` marks the walk dead and preserves that arrival through adoption. `NetPage` takes it as its dead help
  and Action state with no death pose, killer, kill line or corpse expiry wait. Its existing own-body hiding seam
  holds the alpha-zero body until spawn; this does not set classic's ghost prompt or block respawn input. A spawn
  clears the load-death flag, and the next ordinary death again requires actual own-corpse expiry.
- **A late joiner promoted after its load (RC4, 2026-10-24; the merge controller's rulings RC3, RC4, Q1 and Q2,
  logged for the owner in the [BOTS-LAND plan's Log](../plans/2026-10-24-bots-land.md), 2026-10-24T08:43Z; reading,
  pending review): the same reading.** A late joiner (one the bridge seated into a launched game) queued as a
  spectator whose page has already loaded is still a late joiner when it is promoted into a launched respawn game --
  by `RoomBots.seatQueued` (BTL.R8, `CPU_SEAT_REPLACED_AT_JOIN_ADAPTATION`) or by any leave, with or without bots. It
  enters as one promoted before its load does at its `loaded`: at its original start, dead at load with alpha zero and
  the clock stamped (`FUN_002b7d60` D:L158619-158642, `FUN_00543d50` D:L410440), told after its promotion; a fresh
  Action strictly past `RESPAWN_PRESS_S` revives it (`FUN_00592560` D:L451699-451724), and nothing revives it over the
  launch's hold (`FUN_002a7d40` D:L50946). Its entry asks the late joiner's voice channel once (`FUN_001f6660`
  D:L55848-55849, `VOICE_LATE_JOINER_READING`), whichever path got there, past the waiting room only. The mark that
  carries this, `joinedLate`, is the port's own (not the original's `+0xcc`, which the original clears at the late
  console's level start; the port's promotion queue, W3.R13, has no original): set at a join into a launched game,
  kept past `loaded` and across a takeover (the page's reload; the controller's ruling on the narrow check's 3), and
  cleared at the first dead-at-load entry, a leave, the lobby's return and a new match's rebuild. An on-time
  spectator's promotion and a classic promotion are unchanged. The CPU a placement removes leaves by the ordinary
  leave and credits nobody (RC5). No new constant. Unit evidence: `botLateHuman.test.ts`, not an original-runtime
  comparison.
- **Unit evidence:** `roomRespawnLateJoin.test.ts` (actual hello/loaded/command boundary, no lobby spawn, load-relative
  Action, ordinary fall death after respawn, initial hold, watchers, unchanged round clock); `roomLateSeatLoad.test.ts`
  (classic regressions and the unflagged respawn pin); `respawnPrompt.test.ts` and `respawnInput.test.ts` (real client
  event boundary, help, hidden body, strict minimum and fresh Action); `lateSpawnHandOff.test.ts` (real Room through
  GameSocketHost and LobbyMatch into the adopted NetPage). Browser evidence and the integration checks are the
  [VRJ plan's Log](../plans/2026-10-23-vigilance-respawn-and-late-join.md)'s, never original-runtime proof.

The 2026-10-22 paragraphs saying respawn is off and the build waits above are historical. OT.R71 offered respawn on
2026-10-22; this build replaces LATER 266's described hello spawn. No new reading or placeholder constant was added;
`LATE_SEAT_ACTOR_READING`'s existing row in section 4.3 is updated.

## 6. Evidence, apart

- **Source inspection** (the decompilation at the pinned bytes; the ELF's .data and strings): section 1. Reading,
  pending review.
- **Earlier notes** (87, 91, 114, 115, 125, 166, 203), cited, not re-derived; their levels are theirs.
- **The port's code**, read at `8b3bdbbea`: sections 2-4. No unit test, dev-disc test, browser run, capture or
  playtest was run for this note; the frame tables of section 2 are the code's order, not an observed run, and D5's
  margins are unconfirmed.
- **Captures**: none compared. `A_ready007` (the lobby's ARMORY) and `A_ready020`/`A_ready021` (the loading screen
  cut to round 1) are cited from research 125 and 166, not re-read.
