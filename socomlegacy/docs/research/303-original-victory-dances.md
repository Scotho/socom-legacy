# 303 — Original victory dances

Chris's branch `chris/original-gameplay-audio` (a83aab84; the dances' runtime commit f8923511, documented in fec014c9
and 464c4ba6), based on his settings commit `144702d68949b9bf1f82ec16bed94848ca474414`. This is a supported subset,
not a claim that every original actor state is reproduced.

**Onto main (2026-10-07, `agent/gameplay-audio` from main 50a98582).** The merge controller's rework to main's
conventions changes these facts of the note, each marked where it stands (§8 lists them): the dance is **inside the
action part** (`packages/viewer/src/matchActions.ts`, ONE-WIRE) that `/testroom` mounts now and the menu-launched
ONLINE match mounts when its `actions` capability is turned on (ACT, `agent/menu-actions`); the page's half is
`VictoryPage` (`packages/viewer/src/victory.ts`); the others' dances reach both pages now (`netPage.ts` ->
`remotePlayers.ts`); the room's start carries the dancer's last command run (`seq`, additive), so the page's mover
stands where the room's does under NET-LOOK's look gate (§7); a missing emblem falls back to `action_x.tif` as the
original's does (§3); the decompilation's lines are cited where the functions have heads in it. The tester
package and its pages are not on main (H124); the playtest checklist is §9. With main 5091553d (2026-10-08, the all-map integration)
ACT's mount is on main: `matchMount.ts` lends the action part `play` and `firearm` as `main.ts` does, so the
menu-launched match has the request and its own dance too.

## 1. Sources and confidence

Only the locally supplied US SOCOM II ISO and the
[original US manual](https://www.videogamemanual.com/PS2/SOCOM-%20U.S.%20Navy%20SEALs%20II%20%28USA%29.pdf)
establish original behavior. Printed page 20 / PDF page 22 describes Special Actions:
Cross executes; hold Cross and press Left/Right to select among actions, then release Cross.
It does not identify victory-specific eligibility or variants. Printed pages 29–30 describe
the separate Chat/taunts system. The supplied photo identifies the green emblem and caption;
it is not an imported asset or proof of timing, eligibility, or sound.

The whole-disc scan read 349 files (47 outside RUN), indexed 2,311 archives and found
415 occurrences of victory/dance/celebration/special-action/taunt search terms, with zero
scan errors. No new victory-specific asset outside RUN was identified. This search does
not prove that every relevant instruction or indirect reference has been decoded.

Native addresses refer to the locally decoded original game ELF, SHA256
`06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872` -- the same executable the decompilation
(`$SOCOM_PC_ROOT/game/analysis/socom2_game.elf.decomp.c`, cited `D:L`) was made from (the controller hashed
`overlays/socom2_game.elf`, 2026-10-07). An address inside a function the decompilation splits differently is cited
as the address alone. No native listings, disc files, manual pages, or user pictures are committed or distributed.

Asset/table transcriptions are **reading** after independent rereading of all seven motion rows, the GLOBAL weights,
and character animation-set inheritance. The independent source reader reread the contextual predicate, input
rotation, caption, NoFire and flinch-stack paths below: **reading**, with the stated gaps. The merge controller
reread at the source the action record, the emblem's fallback, the range, the proximity pick, the predicate, the
start and the weighted pick (`D:L` below): those are **reading**; the caption's x, scale and colour are **reading,
pending review** (`VICTORY_CAPTION_READING`, §10). No console capture comparison was made; no new **proven** claim
is made. Browser rendering and physical playtesting are separate evidence.

## 2. Disc paths and mappings

| Disc/archive path | Finding |
|---|---|
| `RUN/MP*.ZDB :: RUN\MP\MP*\MOTION_S.ZAR` | All seven clips in each of the 22 multiplayer maps |
| `RUN/READERC.ZAR :: motion.rdr :: animations/victory_*` | Playback, non-looping, NoFire, NoPitchtwist, max_velocity, callbacks |
| `RUN/READERC.ZAR :: animset.rdr :: GLOBAL/anim_set_anims/victory_dance/modes/default` | Variant order and weights |
| `RUN/READERC.ZAR :: animset.rdr :: Seal anim set, Guard anim set` | Both include GLOBAL; no separate team-specific dance list found |
| `RUN/READERC.ZAR :: character.rdr` | Character-to-animation-set evidence; exhaustive individual character inheritance review still owed |
| `RUN/MP*.ZDB :: RUN\COMMON\HUD_TXR.ZED :: textures/action_victory_dance.tif/texdat` | 64×64 original emblem, paired with `HUD_PAL.ZED` by the existing texture reader (pinned: `test/golden/hudBitmaps.json`, MP2) |
| `RUN/MP*.ZDB :: RUN\COMMON\FONT_TXR.ZED`, `FONT_PAL.ZED`; `READERC.ZAR :: fonts.rdr/font_text_01` | Existing original HUD font/metrics |
| Original game ELF, string `0x003e4ef0` | `VICTORY DANCE`, the caption of action 0x15's record at `0x0040d460` (`FUN_0021ded0` D:L73772-73781) |

| Clip | Weight | `playback` seconds | Frames |
|---|---:|---:|---:|
| `victory_macarena` | .142 | 6.6 | 205 |
| `victory_chicken` | .143 | 5.9 | 190 |
| `victory_break` | .143 | 2.8 | 95 |
| `victory_funky` | .143 | 2.5 | 85 |
| `victory_face` | .143 | 4.6 | 149 |
| `victory_backflip` | .143 | 4.8 | 155 |
| `victory_rodeo` | .143 | 4.7 | 153 |

All have 26 tracks, `MULTIPLAYER()`, `NoFire()`, `NoPitchtwist()`, `looped(0)`,
`max_velocity(-0.1)`, no `NoInterrupt` field and no `zanim_callback`. Runtime reads the
current map's pack; raw archive bytes differ between maps and are not claimed identical.
Missing data disables the action without substituting another motion. The emblem is the HUD's to draw: a map
without it draws `action_x.tif`, as the original falls back (§3). No dance-specific sound has been established.
None is added; ordinary game ambience remains. `test/victoryDisc.test.ts` reads all 22 maps off the ISO.

## 3. Original code readings

- **The action and its emblem.** `FUN_0021ded0` (D:L73439+) loads `action_victory_dance.tif` (0x3e4db0, D:L73563)
  and, when the map's library lacks it, uses `action_x.tif` (0x3e4bf0, D:L73548) in its place (D:L73569-73570);
  it lays action 0x15's record at `0x0040d460` (D:L73772-73773) with the caption `VICTORY DANCE` (D:L73781).
  `FUN_0021fd58` tests mask `0x200000` and adds its record; `FUN_0021f850` (D:L74042+) appends the bits in a fixed
  order, `0x200000` after C4's `0x40000`, `0x20000` and `0x8` (D:L74205), before the hostage orders' `0x4000`/`0x8000`
  and the drop's `0x40` -- so the port's list has it after C4 and before the pickup, the escortee and the drop: AD-6
  (2026-10-16; reading, pending review; research 214 s4) read the turret's bits (`0x80000` / `0x100000`, the list's
  first two) and the pickups' (`0x10` / `0x20`, after `0x200000`), so the turret comes first and the victory point before
  the pickup. Was: after C4, the pickup and the turret, whose bits were unread (`PICKUP_CONTEXT_ORDER_READING`,
  `TURRET_ACTION_BIT_READING`, both retired). It is separate from taunts.
- **The list's rotation.** `0x00595320` (inside the player update) reads logical Action; its release invokes
  `FUN_00592d50` (D:L451971+). While held, Left press writes rotation 3, Right press rotation 2 (`+0xedc`).
  `FUN_0021d9d0` (D:L73286+; D:L73332-73386 the rotation) rotates head→tail or tail→head, rebuilding when
  availability changes. Held directions are not auto-repeat here. On main this settles research 214's
  `ACTION_LIST_ROTATE_READING` (note only) as built: `ActionSelection` (`actionContext.ts`), driven by
  `matchActions.lanes`; the two side icons beside the head are still not drawn (§6).
- **The range.** `FUN_005940d0` (D:L452625-452691) reads the proximity list: an entry is kept only while its squared
  distance (`FUN_002a0a10` D:L145876+, full XYZ) is `<= DAT_00650680` (D:L452648), which the executable holds as
  900.0 -- 30 original units (`VICTORY_RANGE_SQUARED_READING`, read off the ELF by the controller). The dead branch
  takes the **first** dead actor of the list (`+0x168`, D:L452681-452685) that is not in state 6 (`+0xfb0`) and not
  removed (`+0xfd1`); it has no facing or LOS test. A live candidate earlier in the list (`+0x164`) leaves no later
  entry considered (D:L452650-452658).
- **The predicate.** `FUN_0057ddf0` (D:L440618-440660), used both by prompt setter `0x00593950` and execution
  `0x00593484`, requires opposite team masks (`+200`), excludes target mask `0x20000`, requires target type 2,
  excludes state 6, checks its object state, requires a living actor, a local controller and `FUN_00589900`.
  Shared action gate `FUN_005a7de0` (D:L462594+) admits raw stance IDs 0,1,2,3,6 before further gates.
- `FUN_00589900` (D:L446425+) excludes death-transition/special-motion states, falls/landings under a
  particular flag, and Slide. It does not establish a standing-only rule.
- **The start.** `FUN_0057dcc0` (D:L440577-440613) clears the prior action (`FUN_0058a4d0`), pushes a victory motion
  preserving current stance (`FUN_00588bc0(..., 0xd)`), picks the variant when none is given (`FUN_005e3da0`), then
  sends the chosen variant via native network event `0x22` (`FUN_002bbaf0`). Its fifth argument `0xd` suppresses
  generic network emission; **it is not actor state13**.
- **The pick.** `FUN_005e5970` (D:L497005-497040) adds the single-precision weights in order and returns the first
  whose sum is at least the draw (`rand() x 4.656613e-10`), the last one past them. The port uses the existing R5900
  float addition helper (`chooseVictory`).
- `FUN_00587c20` (D:L445514+) compares phase against NoInterrupt (absent→0); `FUN_00550ef0` (D:L418040+)
  movement/turn axes above .1 cut an interruptible action. Playback uses the existing one-shot phase rule
  `playback × ((frames−1)/frames)²`, not the raw playback value as a wall-clock timer.
- `0x005a8158` evaluates each leaf's NoFire. Dance NoFire=1 refuses firing during its
  forward phase; a trigger press does not itself cancel the dance in that path. On main the dance is a playing
  motion of the fire gate (`net/fireCapability.ts` `motionOf`), page and room.
- Accepted flinch path `0x005a2ee0` calls `FUN_0058a4d0` (D:L446753+) to clear the action stack before
  pushing the hit. `FUN_00589aa0` (D:L446479+) frees/pops the dance; ordinary accepted flinches do not
  resume it afterward. Damage does not always produce a flinch. Existing browser flinch
  limitations remain; this task does not claim the complete native damage gate is ported.
- **The caption.** The selected action's label (`FUN_00220350` D:L74387-74490) is set to the record's caption
  (`+0x90`) and placed by `FUN_003631a0` at `DAT_003dc678`, `DAT_003dc67c` (the latter 435.0 off the ELF).
  Chris read the label's set-up as x 306 (`0x003fe5c8`), scale .9 (`0x0021ee78`; the 0.9 and 306.0 at D:L73803),
  RGB 128/128/128 and active alpha 80 (`0x001fa3ac`, `0x0021eef0`, `0x002200f0`), centre alignment (`0x00220798`);
  `0x001fada8` supplies the HUD font, loaded as font_text_01 at `0x001fa4a8`. These are original 640×448
  coordinates (`VICTORY_CAPTION_READING`).
- All 176 map-named playable character definitions (88 SEAL, 88 terrorist) inherit Seal/Guard
  animation sets through GLOBAL/SOLDIER, with no victory-row override. The complete map
  character-type-to-definition chain is not claimed exhaustively validated.
- `0x005513c0`–`0x00551434`: axes at or below .1 do not restore locomotion. `0x0057a928`
  calls `FUN_0028c250` (D:L134149+) for current animation root velocity. `FUN_00289bb0` (D:L132696+) differences
  adjacent root keys and scales by frame-count/playback, using the final two keys at the end.
  All seven MP2 root tracks contain translations. The shared mover applies original
  X/Z keys through its existing yaw transform and collision path, not ordinary stick movement.
  The renderer already strips root X/Z, so this does not double displacement.
- Victory rows lack UseVelY (`0x00287d60`, gate `0x0057b510` / `0x0059b048`): animated root
  height stays in the pose, not an invented jump of the actor's feet. `max_velocity(-.1)` is
  not a zero-velocity clamp. Independent reread confirmed one-shot timing above.
- Jump is refused while the nonlooping dance remains on top (`0x0057e300`–`0x0057e30c`).
  Weapon swap is refused through the common NoFire gate (`0x005a8cd8`, `FUN_005a7de0`).
  Accepted stationary reload clears the stack (`0x005a86b4`, `FUN_0058a4d0`); a refused
  reload does not. Common actions/mounting are also gated while the dance is active.
- Accepted stance transitions discard the dance (`0x00581b68`, `0x00581728`, `0x00581e10`).
  The controller's acceptance gates during a dance remain unresolved; do not infer that
  every stance-button press is accepted or refused.

## 4. Supported subset and specific unresolved gaps

1. **Proximity ordering:** the original list is temporally maintained, conditionally sorted
   by distance (`FUN_002a1140`, `0x002a0d68`), with a disorder tolerance100. A preceding live
   interaction or friendly corpse can suppress victory (§3). The port does not invent nearest-enemy
   selection: mixed live/friendly nearby candidates return `unsupported-order`. Multiple enemy
   corpses alone have the same eligibility result regardless of their order.
2. **Actor gates:** living grounded actors without a current action, hold, traversal, turret, binoculars, swap or
   reload are the supported subset. Other native actor-state mappings remain unverified and return
   `unsupported-state`; this is a support boundary, not a claim the original forbids them.
3. **Corpse lifecycle:** original removal-byte event semantics are unresolved. The existing
   browser hides corpses after ten seconds (`BODY_FADE_S`); invisible/removed browser bodies are not offered.
   Ten seconds is not asserted to be the original victory availability timer.
4. **Round result:** no victory-specific round test was found in the predicate. This build
   preserves its existing result-screen gameplay lock and clears dances on resets. The result
   phase is unsupported, not established as an original restriction. No automatic winning dance.
5. **Presentation:** no original-running phase/blend/held-weapon comparison. Native caption
   fade-out (400 alpha units/second) and the full multiple-icon action strip are not yet restored.
   The existing HUD draws the selected icon; selection itself follows the original rotation. Only the VICTORY
   DANCE's caption is drawn: every record has one (`FUN_00220350`), the others' are not drawn yet.
6. **Stance and collision:** stance-button acceptance, every nearby context combination,
   and console-measured root collision/animation blending remain unverified. Existing
   accepted transitions clear playback; this is not full controller parity.
7. **Audio:** absence of motion callbacks is established; absence of every possible indirect
   sound is not. No invented music, vocal, effect or replacement audio is supplied.
8. **The offer's frame, term by term** (LATER 171, 2026-10-19, folded on its fresh review; source inspection, reading,
   pending review). The offer is set each frame by `FUN_00593500` (D:L452225): it clears the mask `+0xed0` (D:L452239);
   returns, offering nothing, on `+0xee0` above 0 (D:L452241), the controller's `+0x221` (D:L452244), the online
   spectator (D:L452247-452251), the scope or the binoculars (`FUN_005b9990`, `FUN_005b90f0` -- the kit's view state 4,
   the binoculars, research 84 -- D:L452259-452262) and the bit/`+0xed8` test (D:L452266); and calls the controller's
   `vtbl[0x7c]` and `vtbl[0x80]` (D:L452294-452295) only past `FUN_005a7de0(actor, 1, 0)` (D:L452277). `vtbl[0x80]` is
   `FUN_005937c0` (the ELF's controller vtables at 0x004062d0, 0x006694b0, 0x00669590, LATER 167), which sets the dance's
   bit through `FUN_0057ddf0` (D:L452376-452378); the predicate asks the alive bit `+0xe1` 4 (D:L440639), the local
   controller (`+0xc0`'s `vtbl+0x34` answering 0, D:L440642) and `FUN_00589900`, whose refusals are the dead body's
   online bit, a top in stance 8, the knock-downs' falls under `+0x1060` 0x10 (never set, research 179) and `Slide`
   (D:L446465ff; research 230 s5.2.4). The gate refuses (D:L462611-462691): the state `+0x174` outside 0, 1, 2, 3, 6
   (research 86's names: stand, crouch, prone, peek, in air -- so hang, ladder, idle, dead and the carries are refused);
   a top entry pushed in stance 8 (`+0x2b`, the push's stance, D:L446292 -> D:L135204) -- a dead or remote actor's only:
   a living, locally controlled SEAL's knock family is pushed in stance 0 or 2 (`FUN_005807d0` D:L442090-442104, the
   falls; `FUN_005805b0` D:L442004-442020, the landings; prone cover D:L441012-441018), 8 only with `+0xe1` bit 4 clear
   or a remote controller, which the predicate refuses anyway (the stance-8 pushes D:L459715 and D:L466876 are the
   dead's); a throw or toss on top (D:L462617-462626); the reload lock `FUN_005a7ab0` (D:L462636: the kit's timer
   `kit+0x820`, which the after-shot sets too through `FUN_005c32b0`, D:L479320, D:L479342, and the reload and pump
   types on top or anywhere on the stack, `FUN_0058a470`; the names off the ELF from the initializer's string operands,
   D:L495203-495412); the swaps, the launcher's raise, the turret's and the moving lower (`FUN_005a7980`, D:L462638); the
   stab, CQB and restraint tops (D:L462641-462666); state 9; the get-ups (`FUN_00587f90`, D:L462679: `Get up forward`,
   `Get up backwards`); any overlay `+0x1e4`; `+0xeac` (the stab or restraint victim's link, research 179); and C4 held
   in a jump's or landing's clip (`FUN_00587f50`/`f10`, D:L462687-462691). The turret held offers its release alone
   (`FUN_005a8850`, D:L452334-452338). So the room's `ready` terms for the reload, the after-shot, the swap, the
   overlay, the mount, a throw's hold (the throw on top), the traversal's hang and ladder, the binoculars, the get-ups
   and the launcher's raise are the gate's (another hold -- the plant's, the defuse's -- and a climb are on none of its
   lists and stay refused as before, unread); the scope (the view state above 4) is refused too since LATER 182, from the
   command's `Button.Scope` (the page's view state 4 and up). Over the air, a plain jump or landing, a stance change, an ordinary
   flinch, a living SEAL's knock family and the pick-up's `Swap rifle` the offer reads as offered (the gate, the
   predicate and `FUN_00589900` pass), and the press's first step is read (`FUN_0057dcc0` D:L440586-440588:
   `FUN_0058a4d0` pops to the stance's base, then the dance's push links over it, as the flinch's does, research 230
   s5.2.4); unread is the dance's clip under a fall's cover and through a stance change -- the room keeps them refused,
   `VICTORY_OFFER_BUSY_PLACEHOLDER` (`'refused'`, §10), each action filed in `VICTORY_OFFER_ACTION_GATE`.

- **The offer's hold refusal and the pistol hand** (2026-10-26, LATER 220 head 7's review F1; reading, pending review; LATER
  509). The room's offer refuses every kit hold (`victoryStatus`' `!w.holding`), but the common gate's throw term holds only
  the rifle's throws and the four tosses (research 369 §1 term 4; the pistol's standing throw and peek tosses are not among its
  words), and the dance's own tests (`FUN_0057ddf0`, `FUN_00589900`) refuse nothing on a throw: with the pistol in hand,
  a standing throw or a lean's toss beside a corpse (the crouched and prone throws keep the rifle's types, term 4: research
  85 §8.1 item 3), the original offers the dance and the room says it is not ready. *Was* not changed: built
  2026-10-27 (LATER 509) -- the room's hold refusal reads the throw term for the hand (`Walker.throwOnTop`); a placing's hold
  stays refused (`VICTORY_PLACING_HOLD_READING`, unread).

## 5. Browser adaptations

The room owns eligibility and the weighted choice. Reliable events carry a serial and clip name;
clients never choose a target, recipient or variant. Request validation (only `{ type, request }`, rising), the
request gap (`VICTORY_REQUEST_GAP_ADAPTATION`, 0.25 s: a request inside it is answered with the offer as it stood)
and input consumption until release (`VictoryActionInput`, the trigger's in `matchActions.trigger`) are browser
safeguards, not claimed PS2 mechanics. All connected clients see accepted playback; death, disconnect and reset
clear playback state. Diagnostics expose availability/support status and missing assets through the test hook
(`window.__viewer.victory()`), never a way to start a dance.

## 6. What is not built

The two side icons beside the list's head; the caption's fade-out; the other actions' captions; the stance
button's acceptance during a dance; the original's other actor states (`unsupported-state`); a mixed reach
(`unsupported-order`).

## 7. The network and the look gate (on main)

The request and the dance are additive JSON under protocol 11 (written under 10; NET-WIRE's frame-type byte, e04fcc4b, left the JSON events unchanged): `victory` (client: `{ request }`; server: `{ id, serial,
clip, elapsed, seq? }`) and `victoryOffer` (`{ status }`); no `BodyState` flag is taken (bit 15 is the last).
The room starts the dance on the dancer's mover between commands; `seq` is that mover's last command run. The
dancer's page, hearing it, runs the ticks it had already sent past `seq` (`WalkMode.syncVictoryMotion` ->
`Walker.advanceVictory`), so the two movers then step the same commands. The dance moves the body along its facing
and never turns it: NET-LOOK's gate (`net/lookGate.ts`) turns the facing on both movers alike, a turn past 0.1 of
`turn_maxrate` cuts the dance on both (`FUN_00550ef0`). `packages/viewer/test/victoryNet.test.ts` drives the page's
real `WalkMode` against the loopback room: a slow turn while it plays (0.05° a frame) leaves the facings within
1e-6° and the places within 0.01 u over 90 frames, and a turn past the cut ends it on both.

## 8. On main: what the rework changed (2026-10-07)

- **ONE-WIRE.** `/testroom`'s +80 lines of `main.ts` became `VictoryPage` (`victory.ts`) inside `mountActions`
  (`matchActions.ts`): the picker's `victory` input, the fire table's `victory`, the walk's action filter, the list's
  rotation in `lanes`, the trigger taken while the dance is asked or plays, a reload's stop. `main.ts` lends the part
  `play` and `firearm`; `installPlayClips` puts the map's clips on the bodies (`withVictoryClips`), as `matchMount.ts`
  does at its `place`. The menu match gets the action, the request and its own dance when ACT turns
  `FRONT_END_CAPABILITIES.actions` on (`agent/menu-actions`, ACT-1 mounts `mountActions` there); the others' dances it
  draws now.
- **The fire gate.** The dance is the top of the stack for `motionOf` (`net/fireCapability.ts`), its row's bare
  `NoFire` carried on the mover: no round on the page or in the room, through its whole forward phase.
- **The room.** `requestVictory`, `victoryStatus`, `tickVictories` documented; the request gap; pickups and hostage
  orders refused with the other common actions while dancing; the stop after an accepted flinch kept under PF-21's
  gate (`flinchRefusedOn`); `BODY_FADE_S` named for the ten seconds.
- **The HUD.** The emblem falls back to `action_x.tif` as `FUN_0021ded0` does; the caption is
  `VICTORY_CAPTION_READING`; the availability no longer waits on the emblem (the original offers the action with the
  fallback icon).
- **Not taken onto main.** The tester package and its tools (H124); the branch's playtest and test-result pages
  (their checklist is §9, their results the plan's Log).

## 9. Playtest checklist (on main)

Each machine reads its own disc; the game is played with a controller. How to run the page and a match server is
[`SETUP.md`](../SETUP.md); the browser spec is `packages/viewer/e2e/victory.spec.ts`. On `/testroom` now; on the
menu-launched ONLINE match once ACT lands.

1. Two players on opposing teams, in a round. Defeat the other and stand within 30 units (about three metres) of the
   body, nobody else near: the green emblem and **VICTORY DANCE** under it.
2. Tap and release Cross: the same one of the seven dances on both computers; it does not repeat while Cross is held.
3. Hold Fire through it: no round, no grenade, nothing from that press when it ends. Swapping is refused.
4. Move or turn: it stops, the walk returns. A reload replaces it; a refused reload does not.
5. Beside a door (or the bomb), hold Cross and press Left or Right: the head turns; release runs the chosen one.
6. Death, a disconnect and the next round leave nothing stuck.

Report what differs from the original; a difference is recorded for the owner, not assumed to be parity.

## 10. Readings and placeholders

| Name | What it stands for | Status |
|---|---|---|
| VICTORY_RANGE_SQUARED_READING | The proximity list's squared range, 900 (30 u): `FUN_005940d0` D:L452648, `DAT_00650680` read off the ELF | in code (`packages/viewer/src/victory.ts`); reading |
| VICTORY_CAPTION_READING | The caption's text, y 435 (`DAT_003dc67c`) and, per Chris's reading, x 306, scale 0.9, colour 128, alpha 80 | in code (`packages/viewer/src/hud.ts`); reading, pending review; settles: a capture of the prompt |
| VICTORY_ORDER_AMONG_UNREAD_BITS | Where 0x200000 sits against the pickup's and the turret's unread bits | note only; the port puts it after both (§3) |
| VICTORY_ACTOR_STATES | The original's actor states other than the supported subset (§4.2) | note only; `unsupported-state` |
| VICTORY_MIXED_REACH | The proximity list's order in a reach with a live actor or a friendly corpse (§4.1) | note only; `unsupported-order` |
| VICTORY_OFFER_BUSY_PLACEHOLDER | The offer over the air and the mover's actions the gate names no refusal over (§4.8; `VICTORY_OFFER_ACTION_GATE`'s 'uncited': the jump's, the stance changes, an ordinary flinch, a living SEAL's knock family, the pick-up's `Swap rifle`): `'refused'`, the room's rule; the offer reads as offered and the press's first step is read, the dance's clip under a fall's cover and through a stance change unread | in code (`packages/match/src/room.ts`, `victoryStatus`); placeholder; settles: a capture of the prompt and its press during a jump, a stance change, a flinch and a knock, each apart (LATER 171) |
