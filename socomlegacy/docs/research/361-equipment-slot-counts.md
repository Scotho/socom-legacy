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
