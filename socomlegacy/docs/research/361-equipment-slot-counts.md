# 361 -- Independent equipment-slot ammunition

**Task:** MLS-EQ. **Confidence:** reading. The decompilation and disc records were independently re-read at
`bcf9a1dded4f6793f1863b3e35628a9c2c89b729`; fresh review PASS (high). The controller's
[plan Log](../plans/2026-10-23-native-settings-and-lobbies.md#log) holds the check record. This source reading
does not claim original-runtime capture or physical-controller evidence.

## 1. Slot rings, initialization and spending

The kit initializes ammunition separately for each kit slot. `FUN_00599f00` (`socom2_game.elf.decomp.c`
D:L455790-455827) walks the character kit entries and passes their slot, capacity and magazine count into
`FUN_005bdec0` (D:L474690-474711). That function addresses the slot's ten magazine entries using the slot index.
Matching equipment names do not share a counter.

The hand-grenade release spends the selected slot's current magazine: `FUN_005c1970` D:L477023-477042 reads
the selected slot at kit `+0x824`, its current-magazine index at `+0x684`, and decrements only that magazine.
The charge placement does the same in `FUN_005bc730` D:L474109-474126. The shared `MagazineRing` already
models these entries; `EquipmentSlots` gives each throwable/charge slot its own ring.

The death's pending hand-grenade drop also spends that selected ring, then launches at power zero:
`FUN_005b8920` D:L471751-471789 and D:L471832-471870. The existing death-drop lifecycle remains in place;
the room retains the validated slot beside its pending request so a duplicate cannot be charged instead.

The existing repository reader `readKitTable` over `RUN/ZWEAPON.ZAR`'s `zweapon.rdr` reads these
`Ammo_Capacity` / `NumMags` fields:

| InternalName | Ammo_Capacity | NumMags |
|---|---:|---:|
| M67 | 3 | 1 |
| HE | 3 | 1 |
| AN-M8 | 3 | 1 |
| Mark141 | 6 | 1 |
| C4 | 4 | 1 |
| Claymore | 4 | 1 |
| PMN Mine | 4 | 1 |

The focused reader test checks every hand throwable/charge record above, through that reader. It does not walk
map archives. Aggregate pouch totals remain derived sums for compatibility and never drive a selected slot's display.

## 2. Manual selection, empty slots, display and Action restoration

The quick menu reads the highlighted slot's current-magazine count through `FUN_005c38a0`
(D:L478028-478037) and capacity through `FUN_005c3cf0`, in `FUN_002193d0` D:L71411-71431. It counts that slot's
nonempty magazines through `FUN_005c4970` D:L478694-478711 and displays that count minus one at
D:L71432-71449. Thus two full M67 stacks show `3/3` individually, with no spare-magazine line.

Manual selection retains the slot number: `FUN_005c4b10` D:L478779-478850 stores the chosen index at
`+0x824` and compares slot identity, not item name. `FUN_005bdc30` D:L474606-474659 has no ammunition test
for hand grenades. The shoulder paths use that same gate at `FUN_00594cf0` D:L453288-453310. An empty manual
grenade slot therefore remains selectable and selected. Its next trigger is refused by `FUN_005bd530`
D:L474288-474298 and `FUN_005c0ae0` D:L476449-476467, which test the selected magazine rather than another
matching stack. Depleting a manually selected stack does not automatically select a duplicate or the rifle.

The release's restoration at `FUN_005c1970` D:L477135-477140 requires a prior-slot marker at `+0x828`.
`FUN_005c0020` D:L475979-475999 sets that marker for an Action shortcut and restores the prior slot on refusal;
ordinary manual selection does not set it. C4's Action plant retains this separate prior-slot return behavior.
Name-based selection in `FUN_005c8a20` D:L481350-481379 takes the first matching slot with ammunition, or retains
the last matching empty slot if none has ammunition. Manual duplicate-slot selection bypasses that name search.

## 3. Browser transport and compatibility adaptations

The room remains authoritative. Optional absolute kit-slot metadata on a throw or throw-start is checked against
the trusted kit's item name and that slot's remaining ammunition. A pending death-drop retains the validated slot.
Legacy requests without a slot consume the first matching eligible nonempty slot in kit order.

An additive reconnect snapshot carries each equipment slot's kind, ten magazine counts and current index, while
retaining the aggregate `pouch` field. Snapshot validation is atomic: slots are unique and limited to 2-4, each kind
must match the kit, every count is a nonnegative integer within the record's capacity, magazines beyond its carried
count are empty, the current index addresses a carried magazine, and the slot sums agree with the aggregate pouch.
Missing/extra slots, contradictory totals or malformed counts do not mutate state.

A legacy resume's aggregate cannot recover which duplicate was spent. Its deterministic compatibility rule fills
the first matching slot and magazine, then the next, up to the supplied total and the trusted capacities. Missing or
invalid totals supply zero. This reconstruction never creates ammunition beyond the supplied aggregate. A stale
refusal refunds the exact predicted slot from the page's bounded sequence journal; a name-only legacy refusal
refunds the first matching magazine with room, never beyond capacity.

The launcher pickup rule already reads each candidate slot's ring (`FUN_005bae60`, research 323 §1.6). Threading the
same per-slot state into its existing shared predicate lets a spent duplicate qualify independently; it does not
change the existing five-slot launcher/round accommodation rule or any pickup reach, motion or equipment-limit gate.

## 4. Verification and remaining evidence

`viewer/test/equipmentSlots.test.ts` covers independent duplicate counts, selected-slot exhaustion, wind-up
switching, refused use, exact refunds, spawn reset, exact and legacy resume, malformed snapshot rejection and the
disc reader fields. `viewer/test/matchThrow.test.ts` covers the quick-menu count, selection and shoulder binding.
The task's final handoff and controller plan Log hold the exact RED/GREEN commands and complete check record.

These are transcription/unit and reader checks, independently source-reviewed. Original-runtime capture comparison
and physical-controller validation remain owed. No new placeholder or reading constant is introduced by this task.

## 5. Reload with an item up (GRENADE-RELOAD, 2026-11-09)

**Task:** GRENADE-RELOAD (`agent/bug-grenade-reload`; a player's report, Discord 2026-11-09: "when you reload with nades
it does the gun animation"). **Confidence:** reading (GRENADE-RELOAD's review PASS WITH FINDINGS, per the merge fc1682e4f). Evidence kind: source inspection of the
decompilation (`socom2_game.elf.decomp.c`, re-read for this task) and §1's reader-checked table; no capture.

- **The press.** `FUN_00594cf0` D:L453459-453463: on R's first frame (`FUN_002c64e0(6) == 1`) with no action lock
  (`FUN_005a7ab0`) it calls `FUN_005c32b0(-1.0, kit, 0)`. Nothing there asks what is in the hand.
- **The timer.** `FUN_005c32b0` D:L477656-477679 sets the kit timer `kit+0x820` from the hand's record's `+0x5c`
  (ReloadDelay, `FUN_003d2c40` D:L325487-325490); the record is `FUN_005c3780`'s (D:L477826-477833), `kit+0xe4[kit+0x824]`,
  the slot in the hand -- with a grenade up, the grenade's.
- **The reload.** At the timer's end `FUN_005c0fd0` (D:L476550-476561) calls `FUN_005c2a90` (D:L477379), which reloads
  the slot at `kit+0x824` (redirected only by `FUN_005bd7e0`, D:L477413, a launcher round's slot). It walks that slot's
  ten magazines from the current one + 1 (D:L477462-477476) and only on a magazine with rounds plays the clip
  (`FUN_005a82e0`, D:L477479) and moves the current magazine. Every hand throwable and charge has `NumMags` 1 (§1), so
  the walk finds nothing: no clip, no magazine change, no sound. The online refill branch (D:L477490-477500) passes only
  class 4 or a primary (`FUN_003d1d10`), so nothing there either. The firearm is never touched.
- **The port before.** `Fire.reload` (`packages/viewer/src/fire.ts`) never asked the hand: R with a grenade up moved the
  firearm's magazine, told the room (`reloadPress`) and started the rifle's reload clip (`play.weaponEvent`).
- **The fix.** `FireSource.itemUp` (wired by `matchFirearm.ts` to `FirearmHands.itemUp`, a throwable, a charge or the
  Detonator up) and `Fire.reload` refuses on it (`RELOAD_ITEM_UP_READING`). Every binding of R reaches that one sink
  (the keyboard's R through `Fire`'s own key, the pad's R3, the touch RELOAD). Tests: `viewer/test/fire.test.ts` and
  `viewer/test/matchFirearm.test.ts`, "GRENADE-RELOAD".
- **The item's timer, read (the fold, 2026-11-09).** The press still arms the kit timer with the hand's record's
  ReloadDelay. No throwable's, charge's or Detonator's record in `RUN/ZWEAPON.ZAR`'s `zweapon.rdr` carries the key
  (through `readKitTable` / `arsenalOf`; checked over every record: the eight that carry it are the Spas 12, the
  JACKHAMMER, the 870, the LAW HEAT, the RPG and three turrets), so each takes the parser's default, 0.01 s
  (`FUN_003cda30`, `firearms.ts` `RELOAD_DELAY_DEFAULT`). While it runs the throw's tick `FUN_005c1970` is skipped
  (`FUN_005c0fd0` D:L476550-476566); a 0.01 s timer is shorter than a kit frame, so it ends in the first kit frame
  after the press and that one frame's tick is skipped: a throw pressed in it starts at most one frame later -- below what a player can see, left unbuilt
  (`ITEM_RELOAD_TIMER_READING`, a reading). Test: `viewer/test/fire.test.ts`, "GRENADE-RELOAD fold".
- **The kit's bit 2, read.** `FUN_005c2a90` returns 1 and sets kit byte 0 bit 2 (D:L477513) whenever the slot holds
  rounds, a find or not -- so for a throwable or charge slot with rounds, not for an empty one or the Detonator.
  Its one reader is `FUN_005bc2c0` (D:L473760-473769: test and clear), called only by the HUD's frame `FUN_001f7ff0`
  (D:L56731-56743), which on it rebuilds the weapon box (`FUN_00237760` on `CHUD+0x1a700`, D:L85127-; research 87
  §1.1) and refreshes seven HUD elements -- from the same slot's counts, unchanged since no magazine moved. A redraw of
  the same values: nothing a player sees, not built (`RELOAD_DIRTY_BIT_READING`, note only).
- **The Detonator, read.** Its record (id 193, class 0xbe, the gear range) has `NumMags` 0 and `Ammo_Capacity` 0
  (through `readKitTable`): its slot's ten magazines are empty, so `FUN_005c2a90` takes the second branch
  (D:L477515-477546), whose online refill passes only class 4 or a primary (D:L477517-477524) -- nothing, no bit.
  Was: "not read; by inference the same".
- **R with the launcher up, read (the fold).** The press is the same. At the timer's end `FUN_005c2a90` takes the
  hand's slot, the launcher's (D:L477411), and `FUN_005bd7e0` (D:L474371-474397) answers 1 in a round mode: the
  carrier `FUN_005c67d0` finds back from the slot's round (D:L479665-479709) is a launcher (`FUN_003c5d80`
  D:L317277-317298, class 0x91) and the slot's mode `kit+0x6fc` is over 3 -- the round's id, as the LAW and the RPG-7
  come up (research 94 §C4.2). So the slot becomes the first holding the mode's round with rounds (D:L477414-477444).
  The LAW HEAT's and the RPG round's records carry `NumMags` 1 (through `readKitTable`), so the walk (D:L477462-477476)
  finds nothing: no clip (D:L477479), no magazine change; the online refill (D:L477490-477500, D:L477517-477524) passes
  only class 4 or a primary, not a rocket round (class 0xb9). The RPG-7's own `NumMags` 2 is its launcher slot's ring,
  never reached by R. The port before ran the firearm's reload; now `FireSource.launcherUp` (wired by `matchFirearm.ts`
  to `FirearmHands.launcherUp`) and `Fire.reload` refuses on it (`RELOAD_LAUNCHER_UP_READING`). Tests:
  `viewer/test/fire.test.ts` and `viewer/test/matchFirearm.test.ts`, "GRENADE-RELOAD fold".
- **Not built, named: the launcher's timer.** The timer that press arms is `FUN_005c32b0`'s record, `FUN_005c3780` ->
  `FUN_005c6600` redirected to the round's (D:L479603-479660): the LAW HEAT's and the RPG's ReloadDelay, 1 s (the
  key carried, through `readKitTable`). While it runs no fire tick runs (D:L476550-476566), and the action lock
  answers (`FUN_005a7ab0` D:L462522-462523 through `FUN_005c2400`; research 251 §12.3), so R with a launcher up holds the rocket's trigger off for 1 s --
  visible, and unbuilt: `LAUNCHER_RELOAD_TIMER_READING`, [LATER 786](../LATER.md). A mode under 4 with the launcher
  up (no round mode, so the launcher's own slot) is not reached under the kit's rules read here [reading].
- **The room.** The room's `reload` (`packages/match/src/room.ts`) has no hand test and never learns a grenade is up;
  with the page sending no reload this is parity, a forged client aside (not changed here).

## 6. Readings (GRENADE-RELOAD)

| name | value | evidence that settles it | in code |
|---|---|---|---|
| `RELOAD_ITEM_UP_READING` | `'nothing moves'`: R with a throwable, a charge or the Detonator up is refused (§5) | a capture of R with an M67 up: the firearm's magazine and the body's clip | viewer `fire.ts` |
| `ITEM_RELOAD_TIMER_READING` | read: the item's ReloadDelay is the parser's default 0.01 s (no throwable, charge or Detonator record carries the key, `readKitTable` over every record); it skips one `FUN_005c1970` frame (D:L476550-476566), a throw pressed in it at most one frame later -- invisible, left unbuilt (§5) | a capture of R then R1 with an M67 up (`kit+0x820` and the throw's start per frame) would measure it | *note only*; the value's test: viewer `fire.test.ts` |
| `RELOAD_LAUNCHER_UP_READING` | `'nothing moves'`: R with the LAW or the RPG-7 up is refused -- redirected to the round's slot (`FUN_005bd7e0`, D:L477413-477444), one magazine, no clip (§5) | a capture of R with an RPG-7 up: the firearm's magazine and the body's clip | viewer `fire.ts` |
| `LAUNCHER_RELOAD_TIMER_READING` | gap: R with a launcher up arms `kit+0x820` with the round's ReloadDelay, 1 s, holding the rocket's trigger off; not built (§5, LATER 786) | read (this note); a capture of R then R1 with an RPG-7 up would measure it | *note only* |
| `RELOAD_DIRTY_BIT_READING` | read: kit byte 0 bit 2 (D:L477513) is the HUD weapon box's redraw flag (`FUN_005bc2c0` D:L473760-473769, from `FUN_001f7ff0` D:L56731-56743); redrawn from unchanged counts, nothing visible; not built (§5) | a capture of the HUD through R with an M67 up | *note only* |
