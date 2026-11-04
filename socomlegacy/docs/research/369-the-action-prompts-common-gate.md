# 369 -- The action prompts' common gate (`FUN_005a7de0`), read

Written 2026-10-26 by the gameplay seat (bf), LATER 220's reading half (the main controller's dispatch: read first, the
port's shape per context before any build). **Confidence: reading, pending review -- source inspection of the
decompilation, nothing run, nothing captured. No port yet.** Sources: `socom2_game.elf.decomp.c` (cited `D:L<line>`), its
strings file (cited `S:<addr>`), and the disc ELF's file image (cited `ELF:<addr>`: the anim-type pointer table at
`ELF:0x661060`, read as research 368 §0 reads it, and one string the strings file does not hold). Where a field's meaning
is a guess it says so.

## 0. Vocabulary

- **The posture word `+0x174`**: 0 stand, 1 crouch, 2 prone, 8 dead or dying, 9 carrying, 10 carried (research 368 §0);
  3, 5 and 6 are further states this read does not name (5 is the command menu's, research 170 §C5).
- **The top clip**: `FUN_00555170(actor + 0x1c0)` returns the clip record on top of the actor's stack; its `+0x2c` is the
  clip's type (a word looked up by name at start-up, D:L495211-495414 -> `FUN_005e4f90(S:<addr>)`), its `+0x2b` the
  posture byte. `FUN_0058a470(actor, type)` (D:L446733-446748) is true when any clip on the stack has that type.
- **The animation type `+0x534`**: `FUN_00577e40(actor, id)` (D:L437398-437411) tests it, or the anim set's remap of it;
  the ids are the pointer table's at `ELF:0x661060`.
- **The second layer `+0x1e4`**: a clip record played beside the stack (its type at `+0x22`); the moving reloads and the
  moving swaps play there (below).
- **The pair link `+0xeac`**: the knife stab's, the restraint's and the carry's (research 368 §0).
- **The kit `+0x5e0`**: its timer `+0x820` (`FUN_005c2400` D:L477156-477159: true while above 0) is the reload's delay,
  a bolt's or a pump's timer and the placements' (research 215 s8.6, LATER 175, 219); its byte `+0x5e1` bit 0x10 is
  unread (a swap pending, as a guess: `FUN_005a7980` reads it beside the swap clips).

## 1. The gate, `FUN_005a7de0(actor, a, walk)` (D:L462594-462737)

It answers 1 (open) only when every term below passes; any one answers 0:

1. **The posture** is 0, 1, 2, 3 or 6 (D:L462611-462612); 8 (dying), 9 (carrying), 10 (carried) and the others shut it.
2. **`+0x1060` bit 0x20** is clear (D:L462613; meaning unread).
3. **The top clip's posture byte** is not 8 (D:L462616).
4. **No throw on top**: the top clip is not "Throw grenade", "Crouch throw grenade", "Prone throw grenade", "Toss
   grenade", "Pistol toss grenade", "Prone toss grenade", "Pistol prone toss grenade", "Peek right toss" or "Peek left
   toss" (D:L462620-462633; the words D:L495211-495237, S:0x660778, S:0x6617c0, S:0x661780, S:0x660788, S:0x660ef0,
   S:0x661800, S:0x661820, S:0x6615c0, S:0x6615e8). Only the top clip is asked (the same list is `FUN_005a7d10`,
   D:L462570-462588, there with the peek tosses only when its second argument is 0). With the pistol in hand
   (LATER 509 and its review's F1): `FUN_0058c820` swaps a one-shot to its pistol pair only where the Seal anim set holds
   the pistol type (D:L448176-448189; research 85 §8.1 item 3) -- the standing throw becomes "Pistol throw grenade"
   (S:0x660ed0) and the lean tosses the pistol's peek tosses (S:0x6615d0, S:0x661600), none of them here; the crouched and
   prone throws' pistol types have no record, so the rifle's "Crouch throw grenade" / "Prone throw grenade" stay on top,
   both here; the tosses are here either way (`Walker.throwOnTop`).
5. **No reload** -- `FUN_005a7ab0` (D:L462512-462556) answers 0 (D:L462636):
   - the kit's timer `+0x820` is not running (D:L462522; `FUN_005c2400`);
   - no clip on the stack, top or below, is a reload or a pump: "Rifle reload" (an inference: the first
     `FUN_0058a470(param_1)` call, D:L462532, shows no second argument -- passed in a register, taken to be the
     `DAT_003deb60` just compared -- the review's F5), "Pistol reload", "Rifle crouch reload",
     "Pistol crouch reload", "Rifle prone reload", "Pistol prone reload", "Rifle m203 reload", "Shotgun pump", "Shotgun
     crouch pump", "Shotgun prone pump", "Shotgun reload", "Shotgun crouch reload", "Shotgun prone reload"
     (D:L462527-462546; the words D:L495218-495238, D:L495399-495405);
   - the second layer is not "Moving rifle reload" or "Moving pistol reload" (D:L462548-462553).
6. **No swap** -- `FUN_005a7980(actor, a)` (D:L462473-462505) answers 0 (D:L462638):
   - with `a` non-zero, kit byte `+0x5e1` bit 0x10 is clear (D:L462482);
   - the animation type is none of 53 "Rifle -> Pistol", 54 "Crouch rifle -> Pistol", 55 "Prone rifle -> Pistol"
     (`ELF:0x661060` ids 0x35-0x37), "Rifle -> Launcher", "Pistol -> Launcher", "Stand -> Turret", "Pistol stand ->
     Turret" (D:L462484-462491; S:0x6624a0, S:0x6624c0, S:0x662530, S:0x662540);
   - the second layer is not "Moving rifle -> Pistol", `moving_rifle_to_launcher` or `moving_pistol_to_launcher`
     (D:L462492-462497; S:0x661900, S:0x6624e0, S:0x662500).
   - So the launcher's **raise clip** shuts the gate; the launcher **held up** (its set, research 215 §8.5) does not, by
     this gate (the turret's offer refuses it by its own `FUN_005b4340(actor, 10)`, LATER 205).
7. **No knife or restraint on top**: not "Stab" / "Pistol stab" (D:L462641-462642; `ELF:0x6609a0` "Stab", not in the
   strings file; S:0x6609a8), "Apply restraints" / "Pistol apply restraints" (D:L462653-462654; S:0x660890,
   S:0x660f70), "CQB attack" / "Pistol CQB attack" (D:L462665-462666; S:0x661d88, S:0x661da0).
8. **The posture is not 9** (D:L462675; already refused by 1, the read keeps it).
9. **Not getting up**: the animation is not "Get up forward" or "Get up backwards" (`FUN_00587f90` D:L445664-445677 on
   S:0x660768, S:0x661fd0; D:L462679).
10. **No second-layer record** (`+0x1e4 == 0`, D:L462681): the pointer non-zero shuts it -- whether its record plays
    (`+4`, which `FUN_005a7ab0` and `FUN_005a7980` ask) is not asked here (the review's F2).
11. **No pair** (`+0xeac == 0`, D:L462682): not stabbing, restraining or carrying (research 368).
12. **`+0x1060` bit 0x10** is clear (D:L462683; meaning unread).
13. **C4 in the air**: while jumping (anim 8 "Jump launch", 9 "Jump fall", `FUN_00587f50` D:L445646-445659) or landing
    (10 "Jump land", 11 "Jump land hard", `FUN_00587f10` D:L445628-445641), the gate shuts when the kit's current item
    is C4 (`FUN_003d1e10` = -0x69, 0x97; D:L462687-462693).
14. **`walk`** non-zero: the answer is `FUN_0058a8c0`'s over the running actions with the top clip's flag 0x20
    (D:L462695-462706); unread (research 215 §8.7's open 5).

## 2. Where it applies

**Every action prompt is built behind it.** `FUN_00593500` (D:L452225-452310) clears the mask (`+0xed0`), returns early
on the HUD timer, the controller's state, the network's busy test and the view modes 4+ (D:L452239-452265), and -- no
offer at all -- when the controller's byte `+0x170` has bit 0x4 clear and the actor's `+0xed8` is 0 (D:L452266-452268;
neither meaning read; a port carries it, the review's F3), sends the
carrying posture to its own action 9 (D:L452269-452276), then asks `FUN_005a7de0(actor, 1, 0)` (D:L452277):

- **Open**: the controller's two builders run -- by their slots beside the dispatcher `FUN_00592d50` in the controller's
  vtables (`ELF:0x406348-0x406350`, `ELF:0x669528-0x669530`; called at D:L452294-452295 by the offsets +0x7c and +0x80, the
  match of offset to slot inferred from that order, not cited) `FUN_00593d00`, the hostage's orders (0x4000, 0x8000; D:L452482-452500), and `FUN_005937c0`, every other
  context (D:L452313-452475): the turret's release (0x100000, D:L452334-452338) and mount (0x80000, D:L452472-452474),
  a door or a switch (0x2000), the bomb's plant and defuse (0x80), C4 (0x40000, D:L452383-452409), the victory dance
  (0x200000), a weapon's pickup (0x10, 0x20: `FUN_00544ca0(actor, 4 | 5, 1)` at D:L452427-452434 on the slot tests
  `FUN_00544c30` / `FUN_00544c20`, D:L411137-411154), the bomb's drop (0x40, D:L452457-452470) and the rest of
  `actionContext.ts`'s table (research 214 §4, AD-6). Then the climb (D:L452296-452303).
- **Shut**: while `+0x105e` bit 0x20 is set or the body is jumping or landing, only the climb's offer (0x4) is built,
  and the function returns (D:L452278-452290: `FUN_0059d980`, `FUN_0059da60`) -- so in the air a climb is still offered
  under the gate. Otherwise it falls to `LAB_00593780`: the ladder slide's (0x10000) in posture 5 (D:L452305-452307).
  Posture 5 always fails term 1, so the slide is offered only through a shut gate, and never with `+0x105e` bit 0x20 set
  or in the air (the review's F1; *was:* "either way").

**Asked again on the way:** C4's offer with `walk` 1 (D:L452383) and its press (`FUN_00592d50` D:L452029); the bomb's
drop (D:L452463), the plant (`FUN_00594350` D:L452724 -> `FUN_00594480` D:L452768; *was* listed as the drop's); the kit's fire gate (`FUN_005c0ae0` D:L476442), C4 through the Action
button (`FUN_005c0020` D:L475987, `a` = 0: the swap byte not asked), the slot switch (`FUN_005a8cb0` D:L463159), and three
contexts this read does not name: `FUN_00563bd0` D:L427668 (an object's flag 0x800000), `FUN_0059d830` D:L457365,
`FUN_005a81d0` D:L462767 (slow, unmounted, the hand not the launcher).

## 3. The port, per context (as built; LATER 220's table)

| context (bit) | the page | the room | what the gate adds |
|---|---|---|---|
| turret mount (0x80000) | `TurretPage.target`: `kitLocked(cmd)` = `Fire.reloadLocked` (LATER 175, 221), `launcherSet` (LATER 205) | `mountKitLocked` (reload, after-shot, the press window), the launcher set (LATER 205) | 4 a throw on top, 6 a swap clip, 7 the knife or restraint, 9 getting up, 10 the second layer, 11 a pair, 13 C4 in the air |
| turret release (0x100000) | `releaseOffered`: the reload (LATER 219) | `takeDismount`: the turret's timer (LATER 219) | as above, on the mounted body (most terms cannot hold mounted) |
| door, switch (0x2000) | `doorPage.target` and the switches': none | `useDoor`, the switch's action: none | all of 1-13 |
| bomb plant / defuse (0x80; `FUN_00594350` D:L452414-452417, which asks `FUN_00594480` for a type-4 object in game mode 2, D:L452724: its own gate ask D:L452768) | none; since 2026-10-26 (the second head) `actionInputs` offers neither under the gate | the hold counted from the held commands (`BombAuthority.command`): none; since 2026-10-26 a held command under the gate counts no hold (`BombActor.gateShut`) | all |
| C4 (0x40000) | none of the gate; since 2026-10-26 (the third head) `actionInputs` offers none under it | `placeCharge`: none of the gate; since 2026-10-26 judged on the command the press read (the one before the placing's start the room saw, else the plant's), refused by why: for an honest plant the verdict is banked on the placing's start once its command has run and its events settled (`placeStart.gate`, `bankPlaceGate`; the plant is decided about 66 commands later -- `C4_PLANT_SECONDS` 1.098 s at 60 a second -- past the cone's 64: head 3's review F1), on the command before with `n` = Infinity (the port's convention: the press has no arrival of its own, LATER 249's exception off, that frame's mask holding every lock armed on it), and read at the plant. The old path -- the start's command before, else the plant's own command at `decide` (`timed`, as LATER 501's rocket rounds) -- remains only for a start the room laid on a dropped command (`dropBacklog`: no bank, no eye, the cone refusing first) or no start seen: unreachable for an honest plant. The edge: a reload named on the command before the start arriving only after the start's command ran is not armed at the bank and never re-banked (an out-of-order arrival only). A plant arriving past `FIRE_ARRIVAL_JITTER_TICKS` now meets `decide`'s stale bound first and tallies 'stale', where judged at arrival it tallied 'c4 missed' (no start eye, the present head's line off the target): both are the network's refusals of a late or forged plant, the charge kept either way; the original has neither (its plant is the clip's callback in the frame, `LAB_005bfe40`, no wire) | all, and 14 (`walk` 1: unread, open 4) |
| weapon pickup (0x10, 0x20; D:L452427-452434) | none; since 2026-10-26 (the fourth head) `actionInputs` offers none under the gate | none; since 2026-10-26 the claim refused by why at its command (`decide`, as the door's) -- a label change too: a claim during a swap or a reload now tallies 'pickup: gate: swap' / 'pickup: reload' where it tallied the pickup's own 'swapping' / 'nofire' (`PICKUP_MOTION_GATE_READING`), the gate asked first as the original builds the offer behind it | all |
| hostage orders (0x4000, 0x8000; `FUN_00593d00` D:L452494, D:L452498) | none; since 2026-10-26 (the fifth head) `actionInputs` offers none under the gate | none; since 2026-10-26 an order refused by why at its command (`decide`), before the room's own tests | all |
| bomb drop (0x40; D:L452457-452470, its own ask D:L452463 -- *was* also cited to `FUN_00594480`'s D:L452768, the plant's) | none; since 2026-10-26 (the sixth head) `actionInputs` offers none under the gate | `bombAction`: none; since 2026-10-26 the drop refused by why at its command (`decide`, as the door's) -- a label order too: under a reload or a swap the gate's word now comes before `bombAction`'s 'no bomb' / 'not alive' and `manualDrop`'s 'not carrying', where the original tests carrying (D:L452459) before its gate (D:L452463); the same refusal, not a behaviour | all |
| victory dance (0x200000; D:L452376-452377) | the room's offer (`victoryOffer`); since 2026-10-26 (the seventh head) `actionInputs` offers none under the page's own gate, the room's word a round trip behind | `victoryStatus`: the gate's terms but one -- the holds, the overlays, the swap and the moving lower (`swapRefused`), the reload and its press window, the after-shot, the get-ups and the launcher's raise (`VICTORY_OFFER_ACTION_GATE` 'cited'); LATER 167, 171, 182 -- nothing changed; tied to the gate by a test (victory.test 'LATER 220'). Not exact for the pistol hand (head 7's review F1): its `!w.holding` refuses every hold, where term 4 holds only the rifle's throws and the four tosses, and the dance's own tests (`FUN_0057ddf0`, `FUN_00589900`) refuse nothing on a throw -- a pistol-hand standing throw or lean toss beside a corpse is offered the dance by the original, refused by the room: LATER 509 -- built 2026-10-27: the hold refusal reads the throw term for the hand (`Walker.throwOnTop`), a placing's hold kept refused (`VICTORY_PLACING_HOLD_READING`) | all |
| climb (0x4) | `climbOffered` on the walker: the ground's common gate (a throw on top, a reload's hold, the second layer, the swap; since 2026-10-26 the get-up, term 9) and `Walker.climbLock` (`FUN_005b4340(actor, 2)`: the reload lock, the sets; since 2026-10-26 the stick's moving lower, D:L469412 -> D:L462494-462495) | the same, the room's mover (its `climbLock` with the moving lower) | in the air offered past a shut gate (D:L452278-452290; pinned, traversal.test 'the ground and the air apart'); on the ground not offered under it -- inside its own offer, the picker taking the traversal as it comes (head 1's F3, settled by the last head); `+0x105e` bit 0x20's escape not modelled (`ACTION_GATE_FLAGS_READING`). The throw term is not exact for the pistol hand (its review's F2): `climbOffered` refuses every throw on top where term 4 holds only the rifle's throws and the four tosses -- a pistol standing throw or lean toss at a crate the original climbs, the port refuses, both sides: LATER 509 -- built 2026-10-27: `climbOffered` asks `Walker.throwOnTop` with the hand (`Walker.pistolHand`, set by the page and the room) |
| ladder slide (0x10000) | the traversal's input (`state().kind === 'ladder'`), never gated (pinned, actionWiring.test 'escapes') | -- | offered only through the shut gate (posture 5 fails term 1), never with `+0x105e` bit 0x20 or in the air (D:L452278-452307) |

**The bomb's hold under the gate** (LATER 220's second head and its review, F2 and F3; reading, pending review). The hold
is `FUN_00594cf0`'s (D:L453249-453287, the function from D:L453021): it runs while the controller's flag bit 4 is set,
which `FUN_0021f850` writes (D:L74307) only while the bomb's prompt heads the list `FUN_00593500` built past the gate
(D:L73390, D:L74302-74307); with the bit clear it resets the timer `+0x160` to 5.0 s and clears the target
(D:L453281-453287). So a shut gate **ends** the hold (the room's `BombActor.gateShut`, the page's `BombPage.tick`), and it
begins again from 0 once open. The port's convention against the original's frame, one reading (no constant): the port
judges the gate on the frame the command leaves, so it shuts the hold on the swap's own command K and reopens it one
command before the original, where the original's frame counts K -- its hold runs before the swap's press in the same
function (D:L453288 on) -- and the reach test already leads the same way.

## 4. Readings (named in the code)

Built 2026-10-26 (LATER 220's first head, `agent/later-220`; reading, pending review; its review's folds: the hand in term 4, the
lock on the ask's command, the moving lower): the shared predicate
(`viewer/src/net/actionGate.ts` `actionGateWhy`; the page's `WalkMode.actionGateShut`, the room's `actionGateShut` on the
ask's command from `AimFrame.gate`, `Walker.gateTop`), asked by the mount's grant and the door's and switch's offers and
asks; the other contexts follow, head by head.

| name | stands for | why a reading | status |
|---|---|---|---|
| `ACTION_GATE_FLAGS_READING` (`viewer/src/net/actionGate.ts`) | `"not asked: the flags' writers unread"` | terms 2 and 12 (`+0x1060` bits 0x20, 0x10), kit byte `+0x5e1` bit 0x10 the builder's early return (`+0x170` bit 0x4, `+0xed8`) and the climb's escape with `+0x105e` bit 0x20 (D:L452279): their writers unread | open 1 |
| `ACTION_GATE_SECOND_LAYER_READING` (`viewer/src/net/actionGate.ts`) | `"the moving reloads and the moving swap only"` | term 10 shuts on any record at `+0x1e4`; the port knows two | the list of what `+0x1e4` carries |
| `VICTORY_PLACING_HOLD_READING` (`match/src/room.ts`) | `"refused: as the port refused it"` | the dance's own tests ask no hold and the common gate's throw term holds no placing: the dance over a placing's clip is unread (LATER 509) | the dance's offer read with a placing on top (the placings' posture bytes, D:L462616; `FUN_00589900`'s other branches), or a capture of the prompt beside a corpse while placing |
| `ACTION_GATE_C4_AIR_READING` (`viewer/src/net/actionGate.ts`) | `"not asked"` | term 13: the hand's item not on the gate's frame | the hand's item on the frame |

## Open

1. `+0x1060` bits 0x20 and 0x10, kit byte `+0x5e1` bit 0x10: their writers.
2. The controller's slots +0x7c and +0x80: the vtable's base, to cite the two builders by offset.
3. Posture 3 and 6's meaning (the gate admits them).
4. `FUN_0058a8c0`'s walk (term 14).
5. The contexts of `FUN_00563bd0`, `FUN_0059d830` and `FUN_005a81d0`.
6. A capture: a door pressed during a rifle reload, a grenade's throw, a weapon swap and a get-up.
