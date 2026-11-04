# 317 -- Bodies and dropped weapons on the ground (NU-4, PARITY-2)

- Date: 2026-10-13 (PARITY-2's next wave, the next-update checklist's row NU-4, folded into PARITY-2 by NU.R2; plan
  `docs/plans/2026-10-13-next-update-checklist.md` (on `main`, not on this branch), brief
  [`../plans/briefs/2026-10-13-nu4-bodies-and-drops-read.md`](../plans/briefs/2026-10-13-nu4-bodies-and-drops-read.md)).
  Branch `agent/nu4-read`, base 880cac1dc. **A read alone**: no build, no test written, no node process run (the host
  hold).
- Status: **reading, pending review.** Source inspection only: the decompilation and the game ELF's bytes. No game,
  emulator, capture or browser was run. Every value below is a reading until a reviewer who did not write this note
  re-reads it at the source; the clocks' "real time" rests on research 252 §1's reading of the update's argument.
  **The fresh review (2026-10-13): PASS WITH FINDINGS**; its six findings F1-F6 are folded in below, each re-read at
  the source before it was written, the earlier text kept beside the correction ("was: ..."). The status is
  unchanged: reading, pending review.
- **Built (NU-4, 2026-10-14; branch `agent/nu4`, brief
  [`../plans/briefs/2026-10-14-nu4-bodies-stay.md`](../plans/briefs/2026-10-14-nu4-bodies-stay.md)): rows B1, B2 and
  B4 of §5, and B3's read (§1.8).** The rule is one function, `corpseShownS(rules, whose, waiting)` (viewer
  `net/deaths.ts`), read by the page's others' bodies (`remotePlayers.ts`, told the welcome's rules by `netPage.ts`),
  the joiner's corpses (`joinState.ts`) and the room's victory offer (`room.ts` `victoryStatus`'s `present`); a remote
  corpse's weapons are hidden at its death (B1, the review's F4); a dead hostage keeps its clip (B4). Three readings of
  §6 are code now. B3's hide is **not built** (§1.8: it needs a file outside the brief); D1 waits for ONL-20b (§3.3).
  Unit tests only (vitest, single files); no browser, no capture, no game run. The build is reading, pending review.
- **Built (NU-4 D1, 2026-10-14; branch `agent/nu4d1`, brief
  [`../plans/briefs/2026-10-14-nu4-d1-drops-swept.md`](../plans/briefs/2026-10-14-nu4-d1-drops-swept.md)): row D1 of
  §5**, after ONL-20b (was: "D1 waits for ONL-20b", above). The room sweeps its drops once its result is
  `ENGINE_READ_S` old (`Room.step`, one line beside `worldDrops.step`, guarded by the result's identity, `sweptFor`;
  `WorldDrops.sweep` keeps the serial); the page empties its own at the same moment by its own reckoning of the screens
  (`NetPage.sweepDrops`, no wire change). `DROP_SWEEP_AT_RESULT_READING` is code and `DROP_LIFETIME_PLACEHOLDER` is
  re-filed as `DROP_LIFETIME_READING` (§6); capture C is HUMAN_TASKS H225 (numbered by the merge controller at
  checkpoint 10's landing, 2026-10-14; was: H-next, before that H226, a reserved number). Unit tests only (vitest,
  single files); no browser, no capture, no game run. Reading, pending review.
- **Built (PAR-91, 2026-10-14; branch `agent/par91`, brief
  [`../plans/briefs/2026-10-14-par91-own-body-hide.md`](../plans/briefs/2026-10-14-par91-own-body-hide.md)): row B3
  of §5** (was: "B3's hide is **not built**", above). The page's own dead body is hidden once its real seconds dead
  reach `corpseShownS(rules, 'own', waiting)` -- `BODY_FADE_S` in a respawn game and a classic waiting room, never in
  classic: `Play.frame`'s `ownCorpseS` (viewer `play.ts`), handed by both mounts (`main.ts`, `matchMount.ts`) from the
  room's rules and its waiting room. `OWN_BODY_FADE_READING` is applied (§6). Unit tests only (vitest, single files); no
  browser, no capture, no game run. Reading, pending review.
- Sources: `D:L<n>` is `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, the bytes research 230 and 251 pin). The ELF
  (`game/disc/socom2_game.elf`, read-only, by its program headers): the type names `CSealCtrl` (0x65c680),
  `CSealCtrlCopy` (0x3f1eb0), `CRemoteCtrl` (0x662720) and `CSealCtrlAi` (0x65c640); their vtables (0x6694b0, 0x4062d0,
  0x669590, 0x6693f0, each set by its constructor: D:L454660, D:L432798, D:L435063); leaf functions' instruction
  pairs (0x543d40, 0x5e6260, 0x5e6280; was: "0x5e6230", read as `CRemoteCtrl`'s +0x18 -- it is its +0x1c (the
  review, F1)); the body class `CZSealBody`'s vtable 0x6691a0 and its +0x50, 0x553e20, a function the decompilation
  lacks (the review, F2); the string 0x662750 (`%s_valve_alive`); three floats (0x3f3440, 0x64fc50, 0x64fc58). The disc's data: none needed, none read
  (no reader run). The port's lines are cited on two trees: **main** = `origin/main` 5313780b1 and **lane** = this
  branch's base 880cac1dc (PARITY-2), which differ in `packages/match/src/room.ts` (main carries the clans' seat tag,
  the lane PAR-82 and PAR-88).
- Evidence read first: research [252](252-timed-holds-in-real-time.md) (§1 the rule; §3's `remotePlayers.ts` row:
  PAR-34 group 5 put the corpse's fade on real seconds), [234](234-the-inventory-as-built.md) (§0-§2, §7: the death's
  drops and `DROP_LIFETIME_PLACEHOLDER`), [231](231-the-join-as-built.md) §4 (the joiner's corpses),
  [91](91-the-round.md) §4.1 and §18 (the respawn wait; the intermission and the round's reload),
  [179](179-c1-match-server.md) §11.11 (`BODY_FADE_PLACEHOLDER`), [303](303-original-victory-dances.md) §4 item 3 (the
  victory's corpse lifecycle), [237](237-extraction-as-built.md) (`DEAD_IN_FADE_READING`); research 309 (the online
  lane's match end, read only at 8dd1f9dbb on that lane's branch, not on this one: its §7.1 proposes ONL-20b).

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R317.1 | **A classic game's body never fades.** The death handler of the local controller (`CSealCtrl`'s slot +0x18, `FUN_005979a0`) starts the fade only online with the respawn option on (game `+0xdc` set, `+0xd2` clear, D:L454484-454491); otherwise it opens the spectate view (D:L454486-454488). The replicated alpha is written only in a respawn game (D:L451699-451723, D:L453147-453167). A remote's controller's death handler (`CRemoteCtrl`'s +0x18, `FUN_005e6290` D:L497312-497328) only clears the player's `%s_valve_alive` valve (0x662750): no fade, no alpha (was: "has no death handler (+0x18 returns at once, 0x5e6230)" -- 0x5e6230 is the +0x1c slot; the conclusion stands; the review, F1). So in a classic round every console draws the body whole until the round's reload re-places its actor (`FUN_00223680` D:L75925-75931) | the port hides every corpse at `BODY_FADE_S` 10 s on every page, whatever the rules (`remotePlayers.ts:644`, `joinState.ts:81`) and the room offers a victory over a corpse only for 10 s (`room.ts` main:1184): **the main NU-4 difference** | §1.1-§1.4 |
| R317.2 | **A respawn game's body fades on its own console**: alpha 1 to 0 at 0.1 a second of the actor update's dt (`FUN_00552780` D:L418720-418743 sets target and rate; `FUN_00551ec0` D:L418492-418505 steps it) -- **10.0 s of real time** | the port's `BODY_FADE_S` 10 is this, but it is applied to the others' bodies; *PAR-91 (2026-10-14):* applied to the page's own body, and no longer to the others' since NU-4 | §1.2 |
| R317.3 | **Another console sees a respawn game's body whole until its player presses past 5 s.** The body's alpha travels as 4 bits of the replicated state (`state+0x110`, written by `CSealCtrl`'s slot +0x70, 0x543d40; sent with the state every dead frame online, `FUN_002bd640` D:L451729 reading the controller's +0x6c, D:L161942; applied on receipt by `CRemoteCtrl`'s +0x70, `FUN_0056f4c0` D:L432808-432834, from the state receive `FUN_002be150` D:L162387; 15 steps, the node hidden at 15; was: "read by `CRemoteCtrl`'s update `FUN_005e6400`" -- a dead remote's actor tick calls the controller's +0x14, not that +0xc, D:L418511-418516; the review, F3). The dead controller changes it only on a frame its action button reads 1, more than 5 s after the death (strictly `5.0 < t`; `FUN_00592560` D:L451675-451676, D:L451680, D:L451699-451723); at alpha 0 it marks the respawn (`+0xfcf`, D:L451724-451725) and the next actor tick respawns it (`FUN_00547350` D:L412722-412726) | the port hides the others' bodies at 10 s, pressed or not; the original keeps one whole until the respawn press (at 10 s or later) -- a body left by a slow presser lies longer on the others' screens. *Reading, the least certain here* -- medium-high since the send and the receipt are traced (the review, F3); still open: the button's edge or hold, `FUN_001b3648`'s rounding; settled by a capture (§6) | §1.3 |
| R317.4 | **No count, no timer of its own: the body is its player's actor.** It goes with its player's respawn (`FUN_00598b90(actor, 1)`, rebuilt by `FUN_00599b60`, faded in 0 to 1 at 4 a second, D:L455695) or the round's reload (`FUN_00598b90(actor, 0)`, D:L75931), never on its own | the port's room already moves the body at both (`spawn`); only the page's timer differs | §1.5 |
| R317.5 | **A death drops nothing in a respawn game** (`FUN_005a0040` D:L458657-458662: game `+0xdc`) -- as built (`DROP_RESPAWN_RULE_READING`) | no row | §2.1 |
| R317.6 | **Online a drop has no lifetime.** The 60 s timer is laid only offline (`FUN_00541700` D:L408887-408888, D:L408909-408910; the allocators lay the never mark -1.0, D:L409758, D:L409834); the timer is run only offline (`FUN_002aa490` D:L151163-151165 calls `FUN_00542290`). A drop lies until it is taken (`FUN_0059f0c0` D:L458297) or swept with the round (R317.8); it vanishes, no fade (`FUN_00542470` D:L409549-409650) | the port's `DROP_LIFETIME_PLACEHOLDER` `'round'` is the original's online rule: re-filed as a reading (§6) | §2.2-§2.3 |
| R317.7 | **Offline** (no port consumer): a drop not near the player expires 60 s after it is laid, re-armed for another 60 s while the local player is within 300 units (`FUN_00542290` D:L409486-409520; 60.0 at 0x64fc58, 90000 = 300 squared at 0x64fc50); a weapon is not dropped where the same weapon already lies within 50 units (`FUN_005a0040` D:L458688-458702, `FUN_005420b0` D:L409404-409425) | note only: the port's matches are network games (`SOLO_IS_NETWORK_READING`); a campaign's drops would need them | §2.2 |
| R317.8 | **The round-end sweep is the result's, 3 s after the round's end state**: on the host when its 3.0 s wait ends (`FUN_002a9b30` D:L150617-150626, D:L150629-150668; the 4 at D:L150617 is the result kind its caller passes, not the mission's state: the review, F6), on a client when the host's game state +0x113 = 4 or 6 arrives (`FUN_002aa490` D:L151127-151131), `FUN_002aa910` clears every pickup and shuts the pickups off (`FUN_00542e50(0)` D:L151241, D:L409867-409914) and marks every projectile (`FUN_003ccc90` D:L151242, D:L321576-321608), then calls each object's +0x50, which for a body removes its owner's pickups and resets its controller (0x553e20; the review, F2); the bodies stay. The level's teardown clears the pickups again (`FUN_002ac0e0` D:L151965) and the mission's reset turns them on (`FUN_00542fc0` from `FUN_002a7d40` D:L149756) | the port sweeps at the next round's start (`clearAir`), after the screens. Under the round screens nothing drawn differs; the room's drops lie three-plus screens longer (claims refused `'over'`; a joiner told them). *Built by NU-4 D1 (2026-10-14):* the room and the page sweep at the result's 3 s; the round's start still clears the air | §3 |
| R317.9 | **The `room.ts` lines a NU-4 build touches lie off ONL-20b's match-end path** if the sweep (R317.8) is built in `tick` on `lastResult`, as proposed. Only the rejected option (c) of §3.3 would touch `clock`'s `'over'` branch (main:4821-4832, the `startRound(st.matchOver)` at main:4831); nothing touches `startRound`'s head (main:5089-5090) | the two seats need no sequencing for NU-4's rows B1-B3; row D1's option (a) touches `endRound` (main:5131-5163) and would; D1's option (b) needs a phase gate or a post-match RED case, or lands after ONL-20b (the review, F5) | §3.3 |

## 1. The body

### 1.1 Which death handler runs

At a death the actor's `FUN_00547af0` calls `FUN_0029e8b0` (D:L413024), which clears the body bit `+0xe1` bit 4 and
calls the actor's controller (`actor+0xc0`) at its vtable's +0x18 (D:L144778). That slot, read off the ELF:

| controller | vtable | +0x18 | what it does at a death |
|---|---|---|---|
| `CSealCtrl` (a console's own player) | 0x6694b0 | `FUN_005979a0` | the death voice through slot +0x24 (D:L454471-454480); then, **online only** (`DAT_0045a0c1`, D:L454484): with game `+0xdc` clear or `+0xd2` set, the spectate view (D:L454485-454488); else the fade, `FUN_00552780(0, 0.1, actor, 2)` (D:L454491) |
| `CSealCtrlCopy` | 0x4062d0 | `FUN_005979a0` | the same |
| `CRemoteCtrl` (another console's player) | 0x669590 | `FUN_005e6290` (D:L497312-497328) | clears the player's `%s_valve_alive` valve (the string 0x662750, formatted with the player's name and found by `FUN_00351ef0`); calls no `FUN_00552780` and writes no alpha: no fade starts on a remote at a death. *Was:* "0x5e6230: nothing, the leaf returns its argument" -- 0x5e6230 (`jr ra` with `move v0, a0`) is the vtable's +0x1c, the word read one slot off (the review, F1) |
| `CSealCtrlAi` (an AI: a hostage, a campaign enemy) | 0x6693f0 | `FUN_005714b0` (D:L433835-433984) | no fade: it calls no `FUN_00552780` (whose only callers are D:L454491 and D:L455695) and writes no alpha (§1.7) |

The vtable slot offsets are checked against calls of known slots: +0x24 is `FUN_005978a0` in both `CSealCtrl` and
`CRemoteCtrl` (the voice call at D:L454475-454480), and +0x34 is `CRemoteCtrl`'s 0x5e6260 (`jr ra` with `li v0, 1`):
`IsRemote`, as research 193 and 234 name it.

Game `+0xdc` is the respawn option on game type 5 (`FUN_002a7560`, research 91 §4.1, 234 §2.1); `+0xd2` a ghost's
game (a late joiner, research 91 §4.1).

### 1.2 The fade on the dying console (a respawn game)

`FUN_00552780` (D:L418720-418743) takes the request when its priority (2) is at least the actor's `+0x238`. It stores
the target alpha (0) at `+0x230` and the rate (0.1) at `+0x234`, turns the rate's sign toward the target, and sets
`+0x21c` bit 3. The actor's per-frame update `FUN_00551ec0` (D:L418465) then adds rate x its argument to the scene
node's alpha `+0x9c`, stopping on the target and clearing the bit (D:L418492-418505). The argument is the update's
frame time, as `FUN_00551ec0` counts its other timers down by it (D:L418483-418487): **the measured dt, real time**
(research 208 §0 and 252 §1; a reading by the update's role, the dispatch not traced). From 1, the body is at 0 after
**10.0 s of real time**.

### 1.3 What another console sees (the replicated alpha)

The alpha reaches another console only as 4 bits of the player's replicated state. `CSealCtrl`'s vtable +0x70
(0x543d40) is a leaf that stores its second argument at `state+0x110` (`jr ra` with `sw a1, 0x110(a0)`).
Two readers apply it on another console. `CRemoteCtrl`'s update (+0xc, `FUN_005e6400`) reads `state+0x110`
(D:L497411), sets the node visible unless the 4 bits are 15 and the alpha to 1 - n/15 (D:L497415-497416) -- but a
dead actor's tick calls the controller's +0x14, not +0xc (`FUN_00551ec0` D:L418511-418516), so for a dead remote it
may not run. **The receipt applies it**: the state receive `FUN_002be150` calls the controller's +0x70 with the
received word (D:L162387); `CRemoteCtrl`'s +0x70 is `FUN_0056f4c0` (D:L432808-432834), which stores it at +0x110
(D:L432832) and applies the same alpha and visibility at once. (Was: "`FUN_005e6400` reads `state+0x110` every
update", as the only reader; the review, F3.) The writers of that field through +0x70
in the actor code are five (D:L410400, D:L410459, D:L451723, D:L453167; D:L455295 is another object's), and two touch
a body:

- **The spawn's fade-in** (`FUN_00594cf0` D:L453147-453170): in a respawn game (`+0xdc` set, `+0xd2` clear) while
  `+0xfd3` is set (set at the spawn, D:L455672; cleared once alpha reaches 1, D:L453169), the alpha packed as
  (1 - alpha) x 15 through `FUN_001b3648`.
- **The dead wait** (`FUN_00592560`, `CSealCtrl`'s +0x14, D:L451642-451730; the actor update calls it while the actor
  is dead, D:L418510-418522): online, `t` = the game clock `DAT_004365c0` minus the death's time `+0xfb4` (set at the
  death, D:L413049; the clock is the mission's `+0xe0`, accumulated by the frame's dt, D:L151067: real time). Then:
  - From 5 s in a respawn game the prompt is laid every frame (`FUN_005b88c0` D:L451696-451697; research 91 §4.1).
  - Only when the action button reads 1 (`FUN_002c64e0(0, pad)` D:L451675-451676, the controller's `+0x221` clear), in
    a respawn game, not a ghost's, not a spectator (`FUN_002c2fa0`), and more than 5 s after the death (strictly
    `5.0 < t`, D:L451699-451700; was: "5 s or more", the review, F3), does it set the node visible by alpha != 0, pack
    the alpha, write it (D:L451701-451723), and at alpha 0 set `+0xfcf` (D:L451724-451725).
  - Every dead frame online it then sends the player's state (`FUN_002bd640(actor, 0)` D:L451729), which reads the
    controller's +0x6c, the stored +0x110 word (D:L161942): the last value written goes out every frame (the review,
    F3).

So on another console a respawn game's corpse keeps the last value written: whole (the fade-in's last write, alpha 1)
**until the dead player presses**. A press from 5 s to 10 s sends the alpha of that moment (1 - t/10, in fifteenths;
whether `FUN_001b3648` floors or rounds is not read). A press at 10 s or later sends 15 (hidden) and marks the respawn,
which the next actor tick takes: online, `+0xfcf` set and `FUN_00315580(node, 2)` answering 0 respawns it
(`FUN_00598b90(actor, 1)`, D:L412722-412726); answering otherwise only hides the node (D:L412728-412729; what
`FUN_00315580(.., 2)` tests is not read). The respawn rebuilds the actor at its respawn record and fades it in
(§1.5). **On this reading the others see a respawn game's body until its respawn, never faded on their screens unless
it was pressed early**; the dying console sees its own fade (§1.2).

*Not read whole:* whether `FUN_002c64e0` answers 1 on the press's edge or while held, and `FUN_001b3648`'s rounding.
*Was also open:* "the full state's send was not traced" -- traced by the review (F3): sent every dead frame
(D:L451729, D:L161942), applied on receipt (D:L162387, `FUN_0056f4c0`). This finding is now medium-high, still the
least certain of the note: `REMOTE_BODY_FADE_READING` (§6) names it; the capture settles it.

### 1.4 A classic game: no fade anywhere

With the respawn option off (`+0xdc` clear) `FUN_005979a0` takes the spectate branch (D:L454485-454488) and starts no
fade, and neither alpha writer of §1.3 runs (both test `+0xdc`). A classic body is drawn whole on every console from
the death until the round's reload re-places its actor. Research 91 §4.1's row "respawn off: the dead spectate for the
rest of the round" is the same branch. The same holds offline (`DAT_0045a0c1` clear): no fade, no spectate.

### 1.5 Removal: what decides it

- **No timer and no count of its own.** The body is the player's actor, one per player; nothing caps the bodies or
  removes one on a count.
- **A respawn game:** it leaves at its player's respawn (§1.3). `FUN_00598b90(actor, 1)` rebuilds it through
  `FUN_00599b60` at a respawn record (research 91 §4.2). Online, for a console's own player not spectating, the body is
  set to alpha 0 and faded in at 4 a second, 0.25 s (D:L455690-455695; a spectator's is hidden, D:L455697-455698).
- **The round's end and the next round:** the bodies are not touched at the result's sweep (§3). The round's reload
  (`FUN_00223680` states 3 and 5, D:L75913-75935) re-places every player not marked `+0xfd1` with `FUN_00598b90(p, 0)`
  (D:L75925-75931), which moves and rebuilds the body at a round-start slot.
- **The abandon** leaves the level (`FUN_002bc530`, research 91 §17.2): every body with it.
- **A player who leaves:** hidden almost at once on the other consoles (the review, F3; was: "the actor's removal
  at a departure is not read"). The departure `FUN_005998b0` (D:L455498-455538) sets the actor's `+0xfb4` to 0
  (D:L455522) and its id `+4` to -1 (`DAT_003effb0`, D:L455524). `CRemoteCtrl`'s +0x14, `FUN_005e6310`
  (D:L497333-497358), fades a body whose `+4` is -1 as 1 - age/2.0, the age (the game clock less `+0xfb4`) clamped to
  2.0 (D:L497347-497351), hidden at or under 0.001 (D:L497353-497355). With `+0xfb4` 0 the age is the whole clock, so
  the clamp's 2.0 is reached at once. The port drops a leaver's body with its seat (`leave`).

### 1.6 The clocks, in real time (research 252)

| clock | counts | real seconds |
|---|---|---|
| the body's fade, `+0x230`/`+0x234` | the actor update's dt (`FUN_00551ec0` D:L418495) | 10.0 (1 to 0 at 0.1 a second) |
| the respawn's 5 s | the game clock `DAT_004365c0` (mission `+0xe0`, += dt, D:L151067) less `+0xfb4` | 5.0 |
| the respawn's fade-in | the same update's dt | 0.25 (0 to 1 at 4 a second) |
| the result's sweep | mission `+0xe4` = `+0xe0` + 3.0 (D:L150620, D:L150631) | 3.0 after the end state |
| the offline drop's expiry | `FUN_00542290`'s argument, `FUN_002aa490`'s dt (D:L151164) | 60.0, re-armed while within 300 units |
| a departed player's body on the others' consoles | the game clock less `+0xfb4` (0 at the departure), clamped to 2.0 (`FUN_005e6310` D:L497349-497351) | about 0: hidden at once (the review, F3) |

### 1.7 A hostage's body (note)

`CSealCtrlAi`'s death handler (`FUN_005714b0`, D:L433835-433984) writes no alpha and asks no fade (§1.1). That fits
research 237's `DEAD_IN_FADE_READING` (a dead hostage kept at its frozen opacity). The port's page hides a dead
hostage at `BODY_FADE_S` too: the same `shown` test (`remotePlayers.ts:644`) and the hostages' hydration
(`netPage.ts:1295`). That is a difference, B4 (§4). The hostage's own lifecycle is research 237's; this note does not
read it further.

### 1.8 The port's body

- **The room** keeps the body: `kill` sets `diedAt` and the walker dead (lane `room.ts:4697-4715`), `corpse` ticks it
  each room tick (lane :2358-2362, called at :2245). `spawn` moves it at a respawn (`respawnReady`, lane :2872-2877:
  classic refuses outside the waiting room; respawn needs `Action` and `max(RESPAWN_PRESS_S, RESPAWN_FADE_S)` = 10 s,
  :247; the press at :2411) and at the round's start (`startRound`, lane :5115) and the abandon (lane :1992). The
  room's own test of a drawn corpse is `victoryStatus`'s `present` (main:1184, lane :1185): dead under `BODY_FADE_S`.
- **The page** hides each other body at `BODY_FADE_S` of its own real seconds from the death (`fadeAge`, PAR-34;
  `remotePlayers.ts:635`, `:644`), whatever the rules, a hostage's too. A joiner's corpse older than `BODY_FADE_S` is
  hidden at once (`joinState.ts:81`; the hostages' `netPage.ts:1295`). `BODY_FADE_S` is 10 (`net/deaths.ts:223`,
  citing D:L454491). The page knows the rules (`NetPage.rules`, from the welcome, `netPage.ts:1249`) but
  `RemotePlayers` is not told them. The skinned material has no opacity (`BODY_FADE_PLACEHOLDER`): a body is drawn
  whole, then hidden.
- **The page's own body** under the death camera -- read for B3 (NU-4, 2026-10-14; was: "whether the port draws and
  fades it was not read here"). **It is drawn, whole, in its death clip, until the respawn, under both rules.** Dead,
  the walk's view stays third person (`walk.ts:1176`, `view()`: `'scope'` only alive) and its snapshot carries the
  death clip (`walk.ts:1339`); the page's `Play` takes its kind from that view (`play.ts:466`) and shows the body in
  third person (`play.ts:617`, `bodyVisible`, `play.ts:40-42`) every frame the mounts run it (`main.ts:1501`,
  `matchMount.ts:837`); `deathCamera.ts` places the camera only and hides nothing. In the original it fades over 10 s in
  a respawn game and does not fade in a classic one (§1.2, §1.4): the classic case matches; the respawn case differs
  (drawn whole to the respawn, not hidden at 10 s). The rule is named (`corpseShownS(rules, 'own')`,
  `OWN_BODY_FADE_READING`), the hide is not built: the body's visibility is set in `play.ts` (`bodyFrame`) from the
  walk's view, and neither `walk.ts` nor `deathCamera.ts` (the brief's files) can hide it without a change to
  `play.ts` or the mounts, which the brief does not allow. Owed: that change, by a brief that allows it.
- **Built (PAR-91, 2026-10-14)** -- was: "the hide is not built ... Owed: that change", above. `Play.frame` (viewer
  `play.ts`) takes the own corpse's rule as `ownCorpseS` and the death from the walk (`WalkMode.isDead`); it counts
  the frame's real seconds while dead (PAR-34's clock, as `RemotePlayers`' `fadeAge`: 0 alive, `real` added each
  dead frame) and `bodyFrame` hides the body once they reach the rule, drawing it again the frame the walk is alive.
  Both mounts pass `corpseShownS(rules, 'own', net.waitingRoom())` with the room's rules (`NetPage`'s, the welcome's)
  at the one call (`main.ts:1501`, `matchMount.ts:837`); no match, `Infinity`. The rules are `NetPage.roomRules()`'s,
  a public reader of the welcome's rules added by the controller's fold-in the same day (it reads no clock; the
  live path's digest, `netPageClock.test.ts`, holds). Was: "The rules are read off `NetPage`'s private field by
  element access (`net['rules']`): `NetPage` has no reader of them and `netPage.ts` was outside the brief -- a
  reader there is owed at its next touch." The material has no opacity (`BODY_FADE_PLACEHOLDER`): drawn
  whole, then hidden at 10 s. **The offline match** is the loopback room opened under `offeredRules(RULES)`
  (`net/loopback.ts:152`), `RULES` the page's (`main.ts:811`): classic while `RESPAWN_RULES_ENABLED` is off
  (`net/protocol.ts:442`; the owner's ruling of 2026-09-29, `rules.ts` `resolveRules`), so offline the own corpse
  lies whole until the round's reload -- as the original offline, whose fade is laid only online
  (`DAT_0045a0c1`, `FUN_005979a0` D:L454484; §1.4). The solo room plays the network rules
  (`SOLO_IS_NETWORK_READING`), so with respawn on it would hide at 10 s as a respawn game does. **The room draws
  nothing**: this row is the page's alone (the room's `present`, B1/B2, counts the others' corpses only).

## 2. The dropped weapon

### 2.1 What a death drops, and when

Research 234 §2 holds it and this read does not move it. At the death's edge (`FUN_00547350` D:L412694-412696)
`FUN_005a0040` lays one ammunition bundle, then the primary, the secondary and online the launcher with its round
(D:L458646-458706). It lays nothing for a remote controller, a spectator, a `+0xfb0` 6 death, or **in a respawn game**
(game `+0xdc`, D:L458657-458662): `DROP_RESPAWN_RULE_READING`, as built (`room.ts` `kill`, lane :4715). A claim's
exchange drops the taker's old bundle and weapon at his feet (`FUN_0059f0c0` D:L458178-458190). Those lie under the
same rule as a death's.

### 2.2 How long it lies

A pickup is 0x20 bytes, and its first word is a countdown (`FUN_00542290` reads and writes it as a float). The
allocators lay it at -1.0 (0x3f3440), which the countdown skips: the receiver's constructor `FUN_00542930`
(D:L409758) and the local allocator `FUN_00542b90` (D:L409834). The announce, `FUN_00541700` (D:L408870-408919), then
sets it to **60.0 only offline**, for a weapon (D:L408887-408888) or a bundle (D:L408909-408910); online it sends the
replication instead (`FUN_002ba660`, `FUN_002ba3f0`). The mission tick runs the countdown only offline
(`FUN_002aa490` D:L151163-151165, `FUN_00542290(dt, local player + 0x1c)`); online it calls `FUN_005423e0`, which
times nothing (D:L409524-409546).

- **Online:** no lifetime. A drop lies until taken or swept (§2.3, §3), on every console alike.
- **Offline** (`FUN_00542290` D:L409486-409520): at 0 the drop is removed if the local player is more than 300 units
  away (squared distance over 90000.0, 0x64fc50), else re-armed at 60.0 (0x64fc58). So a drop vanishes on the first
  60 s mark the player is not near it. Also offline, a weapon is not dropped where the same weapon already lies
  within 50 units (`FUN_005420b0(50.0, ...)` D:L458688-458702; `FUN_005420b0` D:L409404-409425 matches a kind-8
  pickup's record `+0x7c`).

### 2.3 What removes it

- **A claim**: `FUN_0059f0c0` removes the taken weapon (D:L458297); a bundle walked empty goes in `FUN_00541bb0`
  (D:L409103-409130).
- **The sweep**: every pickup at the result and at the level's teardown (§3).
- **Not a count**: the allocator takes from a free pool or allocates anew (D:L409799-409814), with no cap.
- **Not a fade**: `FUN_00542470` (D:L409549-409650) detaches and frees the node at once.
- **An owner's pickups, at the result's sweep -- not at the owner's departure** (the review, F2). `FUN_005421f0`
  (D:L409464-409480) removes every pickup of one owner (`+0x10`). Its caller is missing from the decompilation: a
  `jal 0x5421f0` at ELF 0x553e30 (word 0x0c15087c, its delay slot loading the actor's id `+4`), inside 0x553e20, the
  `CZSealBody` vtable's +0x50 (vtable 0x6691a0, the word at 0x6691f0). `FUN_002aa910` calls +0x50 on every object in
  its list (D:L151245-151247), so at the result's sweep each body removes its owner's pickups -- redundant online after
  `FUN_00542e50(0)` (§3.1), and the per-owner sweep offline. The departure `FUN_005998b0` (D:L455498-455538) calls no
  +0x50, so a departed dropper's drops stay: `DROP_OWNER_DEPARTURE_PLACEHOLDER` `'stays'` holds, and stays a
  placeholder (the routing of a claim to a departed owner is not read). *Was:* "it has no caller in the decompilation,
  and no word of the ELF holds its address" -- true of a data word, but the call is a `jal`, which an address search
  does not find.

### 2.4 A respawn game

Nothing to lie: no death drop (§2.1), so no claim and no exchange drop either. The MP bomb is a pickup (kind 11)
and is swept with the rest (§3); its rules are research 214's.

### 2.5 The port's drops

The room's `WorldDrops` (`match/src/worldDrops.ts`) keeps them: laid at a classic death (`death`, :97-100), claimed
and walked over in `step` (:114-123; `live` = `Room.inRound()`, play, expired or decided, lane `room.ts:2731-2733`),
removed by a claim (`take`), and cleared with the air (`clear`, :87-91) at a round's start and the abandon
(`Room.clearAir`, lane :3957-3962, called at :5104 and :1989). The page lays and removes them on `drop` and `taken`
(`netPage.ts:1425-1426`) and resets them with the air on `newRound` and `abandoned` (`armoryGlue.ts:29-30` ->
`main.ts:354`; `matchMount.ts:671`). A joiner is told the lying set (`joinWire`, lane :5891). No expiry, no count, no
fade, the drops of a departed dropper kept: the original's online rule, bar the sweep's moment (§3).

## 3. The round-end sweep

### 3.1 The original

1. **The round's end state.** The round is decided and its messages play in the world (research 91 §18: elimination,
   about 20 s, + 1 s). Then the mission tick passes `FUN_002a9b30` a result kind, 2 to 5, from the result valves
   (`FUN_002aa490` D:L151137-151158). `FUN_002a9b30` sets `+0xe4` = the clock + 3.0 and, once the clock passes it,
   calls `FUN_002aa910`: on any console for kind 4 (D:L150617-150626); on the host for the others, after writing the
   result valves and the game state +0x113 = 6 (the game over) or 4 (D:L150629-150668, +0x113 at D:L150661-150666). A
   client whose replicated game state +0x113 turns 4 or 6 calls it too (`FUN_002aa490` D:L151127-151131). (Was: "the
   mission's state goes to 4 (the next round) or, on the host, another end state" -- the 4 is the caller's result
   kind, and +0x113 is written by the host at its sweep; the timing is unaffected; the review, F6.) This is research
   91's "+3 s (engine)", the port's `ENGINE_READ_S`.
2. **`FUN_002aa910` (D:L151201-151253), online:**
   - it clears every pickup (weapons, bundles, the bomb) and turns the pickups off (`FUN_00542e50(0)` D:L151241;
     D:L409881-409884, D:L409913);
   - it marks every projectile in the manager 0x4b5220 (`FUN_003ccc90` D:L151242: bit 2 of each entry's `+6`; what
     that bit does at the manager's next step is not read);
   - it calls each world object's vtable +0x50 (D:L151245-151247). A body's (`CZSealBody`, 0x553e20) removes its
     owner's pickups (`FUN_005421f0`, §2.3), then calls its controller's +0x60: `CSealCtrl`'s 0x597eb0 resets the
     controller's state (its `+0x171` bit 3, `+0x13c`-`+0x144`, the pad block's `+0xb4`/`+0xb5`, and four calls the
     review reads as pad, action and sound resets; their callees not re-read here); `CRemoteCtrl`'s 0x5e6280 is a bare
     return. Neither touches the body. (Was: "+0x50; not read"; the review, F2.)
   - Bodies are actors and stay.
3. **The round screen**, then the reload. `FUN_00223680` (D:L75913-75935) re-places every player (§1.5) and resets
   the mission (`FUN_002a7d40`, which turns the pickups on again online, D:L149756). The level's teardown
   `FUN_002ac0e0` clears the pickups once more (`FUN_00542e50(1)` D:L151965, the pool freed), and so does `FUN_002ab3f0`
   at D:L151578, called at the level's load (D:L49704).

So **drops go 3 s after the round's end state, as the round screen starts; bodies go at the reload**.

### 3.2 The port, against it

The room's `endRound` (main:5131-5163, lane :5137-5169) sets `'over'` for `ENGINE_READ_S` 3 + the screens (main:5155-5156),
and `clock`'s `'over'` branch (main:4821-4832) starts the next round at its end (`startRound(st.matchOver)`,
main:4831) or abandons. `startRound` (main:5089-5123) clears the air (main:5098: drops, projectiles, ids) and spawns
everyone (main:5109). So the port's drops lie through the 3 s read and the screens (5 s, or 10 + 10 s after a match's
last round) and go at the next round's start. The bodies go at the next round's start in both. Under the screens
nothing drawn differs: the round screen replaces the game (research 91 §18). The room's state differs, though: drops
still listed (a joiner told them, `joinWire`) and claims refused `'over'` rather than finding nothing. The projectiles
are cleared at the round's start in the port (`ROUND_START_PROJECTILES_READING`). Their marking at the result (2
above) is evidence for that reading's research (95 §8, 179), not a NU-4 row.

### 3.3 The exact `room.ts` lines a NU-4 build would touch, and ONL-20b's path

ONL-20b (research 309 §7.1) changes what happens **after the last round's screens**: no `startRound(true)`, the game's
lobby returned. Its lines are `clock`'s `'over'` branch (main:4821-4832, the call at main:4831, lane :4827-4838,
:4837) and `startRound`'s head (main:5089-5090: `startRound(newMatch)`, `if (newMatch) { resetMatch(); newMatchId();
... }`, lane :5095-5096). Their callers are `clock` (main:4735, lane :4741) from the room's tick. Their neighbours are
`endRound` (main:5131-5163: `matchOver`, the screens, the `'over'` state at main:5155-5156), `resetMatch`
(main:5069-5081) and `newMatchId` (main:5083-5087).

| `room.ts` (main / lane) | symbol | what a NU-4 build does there | on ONL-20b's path? |
|---|---|---|---|
| :32 / :32 | the `net/deaths` import (`BODY_FADE_S`) | imports the rules' corpse test instead (row B1) | no |
| :1166-1171, :1184 / :1167-1172, :1185 | `victoryStatus`'s doc and its `present:` | a corpse present by the rules: the whole round in classic, until the respawn in respawn (row B1/B2) | no |
| :2243 / :2243 | `tick`: `this.worldDrops.step(...)` | row D1, option (b): one line beside it, the sweep once `lastResult` is `ENGINE_READ_S` old, **with a phase gate** (the review, F5: see D1) | no (it reads `lastResult`, which `endRound` sets; it changes no match-end line) -- but it depends on ONL-20b's behaviour: `lastResult` is cleared only in `startRound` (main:5097, lane :5103) and the abandon (:1988), which ONL-20b skips after a match's last round |
| :247, :2411, :2870-2875 / :247, :2411, :2872-2877 | `RESPAWN_PRESS_S`/`RESPAWN_FADE_S`, the respawn press, `respawnReady` | **read, unchanged**: the original's gate (5 s, alpha 0 at 10 s, the press) is the port's | no |
| :2358-2362 / :2358-2362 | `corpse` | unchanged | no |
| :3952-3957 / :3957-3962 | `clearAir` (`worldDrops.clear()`) | unchanged; its doc's `DROP_LIFETIME_PLACEHOLDER` re-filed by name only if the constant is renamed (§6) | no |
| :4709 / :4715 | `kill`: `worldDrops.death` | unchanged (`DROP_RESPAWN_RULE_READING` agrees) | no |
| :5131-5163 / :5137-5169 | `endRound` | row D1 option (a) only: a sweep tick laid here -- **on ONL-20b's path** (the `'over'` state and the screens it builds); not proposed | yes, if (a) |
| :4821-4832 / :4827-4838 | `clock`'s `'over'` branch, `startRound(st.matchOver)` main:4831 | row D1 option (c) only: the sweep tested here -- **ONL-20b's own lines**; rejected | yes, if (c) |
| :5089-5090, :5098, :5109 / :5095-5096, :5104, :5115 | `startRound`'s head, its `clearAir`, its spawns | **not touched**: the level-start clear stays (the teardown's, D:L151965) | the head is ONL-20b's; NU-4 leaves it |
| :1984-1996 / :1984-1996 | `abandon` | unchanged | no |
| :5904 / :5891 | `joinWire`'s `drops` | unchanged (after a sweep it sends none) | no |

**So with rows B1-B3 and D1's option (b), NU-4 touches `room.ts` at :32, :1166-1171/:1184 and one line at :2243 (main
numbering), none on ONL-20b's path, and the seats need no order between them.** Row D1 can also be left unbuilt
(nothing drawn differs, §3.2), which leaves `room.ts` at :32 and :1166-1184 alone. The other files a build touches are
outside `room.ts` (§5).

## 4. The port, against the read

| # | the original | the port | where it shows | room / page |
|---|---|---|---|---|
| B1 | classic: a body whole on every console all round, gone at the reload (§1.4, §1.5) | hidden 10 s after the death on every page (`remotePlayers.ts:644`); a joiner's older corpse hidden at once (`joinState.ts:81`); the room's victory offer over a corpse ends at 10 s (main:1184) | every classic death, from 10 s to the round's end | page: the hide; room: `present` |
| B2 | respawn: on the others' consoles whole until the dead player's respawn press (at 10 s or later); a press from 5 s to 10 s sends a partial alpha (§1.3) | hidden at 10 s whether pressed or not | a respawn death whose player presses after 10 s: the body leaves the others' screens at 10 s, not at the press (the press is the room's: main:2411) | page: the hide; room: `present`; the partial alpha owed with `BODY_FADE_PLACEHOLDER` |
| B3 | respawn: the dying console's own body fades over 10 s; classic: no fade (§1.2, §1.4) | drawn whole in its death clip until the respawn, both rules (§1.8, read 2026-10-14; was: "the own body under the death camera: not read here") | the dead player's own view, in a respawn game, from 10 s to the respawn | page (`play.ts`; built by PAR-91, 2026-10-14: hidden at `BODY_FADE_S` real seconds in a respawn game and the classic waiting room, never in classic, §1.8; was: "not built, §1.8") |
| B4 | a hostage's body: no fade at the death (`FUN_005714b0`, §1.7; `DEAD_IN_FADE_READING`) | hidden at 10 s like a player's (`remotePlayers.ts:644`, `netPage.ts:1295`) | a hostage killed, on every page | page |
| D1 | drops swept 3 s after the round's end state, as the screen starts (§3.1) | swept at the next round's start (`clearAir`, main:5098); *built by NU-4 D1 (2026-10-14):* swept `ENGINE_READ_S` after the result, room and page | nothing drawn (under the screens); the room's set and a joiner's `join.drops` during the screens | room (and the page's reset with it) |
| -- | online: no drop lifetime, no count, no fade, an owner's departure keeps them (§2.2-§2.3) | the same | -- | -- (re-file `DROP_LIFETIME_PLACEHOLDER`, §6) |
| -- | a respawn game drops nothing (§2.4) | the same | -- | -- |

Every clock above is real time. The room counts ticks (`diedAt`, 60 a second); the page counts its frames' real
seconds (`fadeAge`, PAR-34).

## 5. The build list

Each row is RED first. Each is a simulation-track change (what the game draws), and every value is cited at its level.

- **B1 -- a classic body lies the whole round.**
  - The page: `RemotePlayers` is told the room's rules (from the welcome's `rules`, `netPage.ts:1249`; a setter or a
    dep). In classic the `shown` test (`remotePlayers.ts:644`) keeps a dead body until the seat is alive again (the
    next round's spawn) or a ghost. `joinState.ts:81` hands a classic joiner's corpse its clip at any age.
  - `net/deaths.ts`: `BODY_FADE_S` keeps its meaning (the respawn game's own fade); one function names the rule
    (`corpseShownS(rules)`: `Infinity` classic, per B2 respawn).
  - The room: `present` (main:1184) by the same function and `this.opts.rules`.
  - The classic waiting room plays as a respawn room (`CLASSIC_WAITING_PLACEHOLDER`) and takes the respawn rule.
  - **The corpse's hands** (the review, F4). At a remote's death `FUN_00547af0` hides the nodes at the actor's
    `+0x390`, `+0x398` and `+0x3a8` (D:L413122-413134, under `IsRemote`, D:L413120), the hand-held item models by
    their other uses (the kit's `+0x830` actor's `+0x390` and `+0x3a8`, D:L471493, D:L471734). With B1 keeping a
    classic corpse drawn all round, whatever the port draws in its hands -- the held weapon, possibly beside its own
    drop -- shows all round. Read what `RemotePlayers` draws in a dead body's hands, and hide it at the death as the
    original does. *RED case:* a classic corpse at 11 s draws no held weapon.
  - *RED:* `remoteDeath.test.ts` (a classic corpse still drawn at 11 s and at 60 s, hidden once alive; the respawn
    control hidden per B2); `joinState.test.ts` (a classic joiner's 30 s corpse in its clip); a room test for a
    classic corpse 20 s old offered to the victory (`central/test/victory.test.ts`'s room seam).
- **B2 -- a respawn game's body on the others' pages until its respawn.**
  - The page: no 10 s timer for the others' bodies. A dead body is shown until its seat is alive again (the respawn
    moves it) or a ghost. The partial alpha of an early press is not drawn: the material has no opacity
    (`BODY_FADE_PLACEHOLDER`), and the room would need to tell the press (a wire field, the online seat's terms). It is
    named, not built (`REMOTE_BODY_FADE_READING`, §6).
  - The room: `present` until the respawn.
  - *RED:* `remoteDeath.test.ts` (a respawn corpse drawn at 15 s while its seat is dead; hidden the frame its seat is
    alive); the PAR-34 group-5 case re-stated (the fade's real seconds now count only the own body's, B3).
  - Held until the capture of §6 if the review finds §1.3 weak; B1 does not wait for it.
- **B3 -- the own body.** Read the page's own dead body under the death camera (`deathCamera.ts`, `walk.ts`). If it is
  drawn: hidden after `BODY_FADE_S` real seconds in a respawn game (the PAR-34 clock), never in classic.
  *RED:* a mount or page test of the own corpse at 11 s, both rules.
  - **Built (PAR-91, 2026-10-14).** `Play.frame`'s `ownCorpseS`, the walk's `isDead` and the PAR-34 real seconds
    (§1.8). Tests: `viewer/test/play.test.ts` (respawn: drawn at 9.9 s, hidden at 10.1 s and at 40.1 s, drawn the
    respawn's frame, a second death counted afresh; 101 frames of 1/60 s drawn, one of 10.1 s hidden; classic: drawn
    at 11 s and 60 s; the classic waiting room: hidden at 10.1 s; a walk telling no death, or no rule, never hidden)
    and `viewer/test/matchMount.test.ts` (both mounts' one call, `corpseShownS(net.roomRules(), 'own',
    net.waitingRoom())`, and `NetPage.roomRules`; was: `corpseShownS(net['rules'], 'own', net.waitingRoom())`).
- **B4 -- a hostage's body keeps its opacity.** `remotePlayers.ts:644` and `netPage.ts:1295` exempt an escortee's
  corpse from the 10 s hide (`DEAD_IN_FADE_READING`: the room keeps it dead at its frozen opacity). *RED:*
  `remotePlayers.test.ts`, a dead escortee drawn at 11 s.
- **D1 -- the drops' sweep at the result (optional).**
  - The room, option (b): in `tick` beside main:2243, once `this.lastResult` is `ENGINE_READ_S` x `TICK_HZ` old, one
    `worldDrops.sweep()`. That clears `lying` and the claims and keeps the serial, so a `did` is still never given twice
    in the round. The page resets its drops at its screens' start (it reckons it from `roundOver` + `ENGINE_READ_S`,
    `netPage.ts:490`; a `NetPageDeps` hook) or on a room event.
  - Off ONL-20b's path, but not independent of it (the review, F5; was: "Off ONL-20b's path." alone). `lastResult`
    is cleared only in `startRound` (main:5097) and the abandon. ONL-20b skips `startRound` after a match's last
    round, so after ONL-20b a sweep keyed on `lastResult`'s age alone would fire every tick in the game's lobby. D1
    therefore needs a phase gate (the sweep once, in the `'over'` phase, e.g. a flag set by the sweep and cleared with
    `lastResult`) and a post-match RED case, or it lands after ONL-20b.
  - *RED:* `roomPickups.test.ts` (a classic death's drops gone 3 s after `roundOver`, the joiner's `join.drops` empty
    then; the sweep runs once, not again on later ticks, including after a match's last round).
  - Low value: nothing drawn differs. The controller may decline it and keep the round's-start sweep, the reading named.
  - **Built (NU-4 D1, 2026-10-14), option (b), after ONL-20b.** The room: `WorldDrops.sweep()` beside `clear()`
    (clears `lying` and the claims, keeps the serial) and one line in `Room.step` beside `worldDrops.step`: once
    `this.lastResult` is `ENGINE_READ_S` x `TICK_HZ` old and `sweptFor !== this.lastResult`, `sweptFor` is set and
    the drops swept. The phase gate the review asked (F5) is the result's identity: a new result is a new object, so
    each round's result sweeps once; `returnToLobby` and `abandon` clear `lastResult`, so the lobby a full game
    returns to never sweeps. No other `room.ts` line changed. The page: option (b) of the brief, its own reckoning --
    `NetPage.sweepDrops` (`deps.drops.replaceAll([])`) once a screens object, `ENGINE_READ_S` after the `roundOver`
    or a joiner's standing result, the moment its round screens start; the page sweeps one latency after the room,
    as the original's client sweeps on the host's state's arrival (`FUN_002aa490` D:L151127-151131). No wire change.
    Tests: `match/test/roomPickups.test.ts` (the sweep at 3 s, not one tick before; a joiner's `join.drops`; a claim
    after it; the serial kept; once through FINAL ROUND, GAME COMPLETE and the returned lobby; the next match again)
    and `viewer/test/netPageRound.test.ts` (the page's sweep at the same moment, once, a joiner's too). The
    remaining mentions of the old name `DROP_LIFETIME_PLACEHOLDER` in comments (`room.ts` `clearAir`, viewer
    `main.ts`, `matchMount.ts`, `drops.ts`) and the parity registry's `round.pickup.lifetime` are in files outside
    the brief: re-filed by name at their next touch.

**NU-5's overlap (named, not read):** who may claim a drop (`PICKUP_*_READING`, research 234 §3), the exchange's
replacement drop (§2.1, which lies under §2.2's rule), and a picked-up weapon at the carrier's death (it is the kit's;
`FUN_005a0040` drops whatever the slots hold) and at the next round (the kit rebuilt, research 91 §4.3). NU-4 changes
none of them; a NU-5 build that adds drops inherits §2.2-§3.

## 6. Readings and placeholders (candidates for the build; three built by NU-4, 2026-10-14, two by NU-4 D1 and one applied by PAR-91 the same day -- was: "none is code yet"; was: "... and two by NU-4 D1 the same day")

| name | where it would go | status |
|---|---|---|
| `CLASSIC_BODY_STAYS_READING` (built, NU-4, 2026-10-14; was: *note only*, candidate) | viewer `net/deaths.ts` (`corpseShownS`, read by `remotePlayers.ts`, `joinState.ts`; server `room.ts` `present`) | built: `corpseShownS('classic', ...)` is `Infinity`, the corpse until its seat is alive; `'the whole round'`: `FUN_005979a0` D:L454484-454491 (fade only with `+0xdc`), the alpha's two writers gated on `+0xdc` (D:L451699-451700, D:L453147), `CRemoteCtrl`'s +0x18 `FUN_005e6290` (D:L497312-497328: the alive valve cleared, no fade; was: "`CRemoteCtrl`'s empty +0x18 (0x5e6230)", the +0x1c slot, the review, F1); owed: capture A below |
| `REMOTE_BODY_FADE_READING` (built, NU-4, 2026-10-14; was: *note only*, candidate) | viewer `net/deaths.ts` (`corpseShownS`, read by `remotePlayers.ts`, `joinState.ts`; server `room.ts` `present`) | built: `corpseShownS('respawn', 'other')` is `Infinity`; the partial alpha of an early press not drawn (`BODY_FADE_PLACEHOLDER`: no opacity; the room tells no press); `'whole until the respawn'`: `state+0x110`'s writers (0x543d40; D:L451723, D:L453167), sent every dead frame (D:L451729, D:L161942), applied on receipt (`FUN_002be150` D:L162387 -> `FUN_0056f4c0` D:L432808-432834; was: "reader `FUN_005e6400` D:L497411-497416", the review, F3); the press gate D:L451675-451676, D:L451699-451700 (strictly `5.0 < t`); medium-high; open: the button's edge or hold; owed: capture B below |
| `BODY_ALPHA_PACK_READING` (*note only*; candidate) | -- | the 4 bits' rounding by `FUN_001b3648` (D:L451712, D:L453157) not read; matters only if a partial alpha is ever drawn (`BODY_FADE_PLACEHOLDER`) |
| `OWN_BODY_FADE_READING` (built as the rule, NU-4, 2026-10-14; applied, PAR-91, the same day; was: *note only*, candidate) | viewer `net/deaths.ts` (`corpseShownS(rules, 'own')`; the own corpse, B3), read by `play.ts` (`Play.frame`'s `ownCorpseS`, from `main.ts` and `matchMount.ts`) | `'10 s respawn, none classic'` (§1.2, §1.4); built: the own body hidden at `BODY_FADE_S` real seconds dead in a respawn game and the classic waiting room, drawn whole in classic (§1.8); owed: capture B (was: "the rule is code, its hide is not (§1.8: the own body is drawn whole until the respawn; the hide needs `play.ts`); owed: that hide, capture B"; earlier: "owed: the port's own-body drawing read", read 2026-10-14) |
| `DROP_SWEEP_AT_RESULT_READING` (built, NU-4 D1, 2026-10-14; was: *note only*, candidate) | server `worldDrops.ts` (`sweep`; `room.ts` `step`'s one line and `sweptFor`); viewer `netPage.ts` (`sweepDrops`) | built: `'3 s after the end state'`: `FUN_002a9b30` D:L150617-150668, `FUN_002aa910` D:L151241, the client's D:L151127-151131; the room once its result is `ENGINE_READ_S` old, the page `ENGINE_READ_S` after its `roundOver`; owed: capture C below (H225) |
| `OFFLINE_DROP_EXPIRY_READING` (*note only*; no consumer) | -- (a campaign's drops) | 60 s, re-armed within 300 units: `FUN_00542290` D:L409486-409520, 0x64fc58, 0x64fc50; `FUN_00541700` D:L408887-408888, D:L408909-408910 |
| `OFFLINE_DROP_DEDUP_READING` (*note only*; no consumer) | -- (a campaign's drops) | no weapon dropped where the same lies within 50 units: `FUN_005a0040` D:L458688-458702, `FUN_005420b0` D:L409404-409425 |
| `DROP_LIFETIME_READING` (built, NU-4 D1, 2026-10-14; was `DROP_LIFETIME_PLACEHOLDER`, renamed) | server `worldDrops.ts` | re-filed as a reading, `'round'`: no expiry online (§2.2: the 60 s laid and run offline only, D:L408887-408888, D:L151163-151165); the moment of the sweep is `DROP_SWEEP_AT_RESULT_READING`'s. Renamed with research 234 §7 and 101's PF-34 row (was: "proposed re-filed as a reading ... The rename is the build's"); owed: capture A (H224) |
| `DROP_OWNER_DEPARTURE_PLACEHOLDER` | server `worldDrops.ts` | unchanged (`'stays'`): `FUN_005421f0` (D:L409464-409480), which removes an owner's drops, is called from the body's +0x50 (0x553e30) at the result's sweep, not at the departure (`FUN_005998b0` D:L455498-455538 calls no +0x50); was: "nothing calls it" (the review, F2; §2.3) |

**The captures that settle them** (a row for `../HUMAN_TASKS.md` when the build files them, NU-4's row's rule; A and B
filed as H224 by the NU-4 build, 2026-10-14 (numbered H223 until its review, F1: H223 is taken on `main`); C filed as H225
by the NU-4 D1 build, 2026-10-14 -- was: "C goes with D1"):

- **A, a classic round on two consoles:** a death timed to the frame, filmed from the second console until the round
  screen. The body at 10 s, 30 s and the round's end; a weapon dropped and left, still there at the end (CLASSIC_BODY_STAYS,
  DROP_LIFETIME).
- **B, a respawn round on two consoles:** the dead player waits 20 s before pressing (the body on the second console at
  10 s and 15 s; gone at the press). Once, a press at 7 s (a partial alpha on the second console). The dying console's
  own body at 5 s and 10 s (REMOTE_BODY_FADE, BODY_ALPHA_PACK, OWN_BODY_FADE).
- **C, the end of a classic round with a drop lying:** the frame it goes, against the round screen's first frame
  (DROP_SWEEP_AT_RESULT).
