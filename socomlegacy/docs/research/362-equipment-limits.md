# 362 -- Created-game equipment restrictions

**Task:** MLS-LIMIT, the native Settings/equipment/lobbies plan, 2026-10-23.
**Track:** simulation. **Confidence:** reading. Independent source review PASS (high) at
`16add3e4ee2c3e67bb80122331a064c887027d1e`; the
[plan Log](../plans/2026-10-23-native-settings-and-lobbies.md#log) holds the review and checks. No original-runtime capture.

## 1. Evidence

- GameStats byte 5 is `EQlimit`: `FUN_002f7c40`, `socom2_game.elf.decomp.c` D:L196715-196735, re-read in the
  desktop evidence package. Research 192 §3.10 and research 95 §3.5 were pointers, not substitutes for the source.
- The original `RUN/UIZANIM.ZAR` was read through `FsAssetSource`, `Zar.parse`, `parseAnimSets` and `decodeUiSet`.
  The source programs are `dlgGameLobby.rdr/SetMPWeaponValves` and `SetMPCharWeaponValves`; not the shortened
  equipment-dialog script set. Item names were resolved through `RUN/ZWEAPON.ZAR/zweapon.rdr` using `arsenalOf`.
- `dlg_equipment_mp.rdr/UiEquipSwitch` reruns both mode programs on restricted ARMORY entry; `returnto_Defaults`
  reruns the forced kit (and first chooses default equipment for mode 4). `dlgGameLobby.rdr/FromBriefing` applies
  restricted defaults instead of a stored profile when `IDFromBriefing == 0`. The lobby's `SwapClanSides` applies
  the same programs after the session master's swap. Existing source index: `tools/test/onlineDialogs.pinned.json`,
  these named animations; the new transcription tests read the original archive directly.

## 2. What the scripts settle

`SetMPWeaponValves` rewrites exact names, rather than applying a blanket item-class prohibition.
`equipmentLimitValves` preserves every unmentioned map valve, including `Enable_c4`, its lock bits,
`Enable_red_smoke` and the F2000 round valves. All four modes enable smoke, flash and 2X with value 9, and disable
the script's named explosives and launcher rounds. Pistol mode enables its SEAL pistol names with 1 and Terrorist
pistol names with 8. Shotgun mode enables SPAS/JACK/870 with 9 but leaves the pistol valves unchanged; its forced
secondary is `FULL_SLOT`. Sniper mode rewrites the six named sniper valves to 9 and the named pistols to 0.
Thermal is explicitly disabled only in modes 1 and 2. No Bombs preserves ordinary firearm valves, except the five
named launcher/combined-weapon valves it disables. The unit test compares every rewritten or item-mapped valve
against execution of the decoded original program, seeded with distinguishable map values.

`SetMPCharWeaponValves` rewrites all four characters on each side. Item ids below are resolved from the original
item table, not chosen for balance. `FULL_SLOT` is 254 (research 94 §A1).

| EQlimit | SEAL primary / secondary / eq1 / eq2 / eq3 | Terrorist kit |
|---|---|---|
| 1 Pistols | 254 / 16 / 123 / 122 / C4-or-254 | 254 / 4 / 123 / 122 / C4-or-254 |
| 2 Shotguns | 81 / 254 / 194 / 122 / C4-or-254 | 83 / 254 / 194 / 122 / C4-or-254 |
| 3 Snipers | 103 / 254 / 194 / 122 / C4-or-254 | 101 / 254 / 123 / 122 / C4-or-254 |
| 4 No Bombs | primary and secondary kept / 194 / 123 / C4-or-122 | same |

C4 is chosen when the unmodified `Enable_c4` is greater than 9 for SEALs, or greater than 17 for Terrorists. The
tests execute the source's Choose commands for all eight characters at both thresholds and map lock values.
Stored profiles are not loaded under a restriction. Reopening ARMORY reruns the mode rewrite as the native entry
does: modes 1-3 force their firearms, while No Bombs preserves the current manual primary/secondary and resets
only the mode-owned equipment. The page reconstructs its picks against the source kit so that preserved firearms
survive the next room request too. `OnMPWeaponBtnTriangle` re-enters `Ui_MP_SEAL_EquipStart` / `Ui_MP_MERC_EquipStart` on the committed
column; both rerun `SetMPWeaponValves` and `SetMPCharWeaponValves`, so Triangle -> Yes resets every character's
restricted kit, not just the selected column. `returnto_Defaults` (Circle) also reruns both mode programs for every
character without clearing the unrestricted saved profile. In No Bombs mode the shared rewrite retains each type's
primary and secondary; Circle first calls `ChooseDefaultEquipment` only for the selected type, while Triangle does
not. Recomputed picks retain any preserved No Bombs firearm choices. These resets update the currently committed
type's live kit; cursor movement on character select commits another type only when Cross is pressed.

`FULL_SLOT` (254) and `EQUIP_NONE` (255) are explicitly unusable at `FUN_005bdc30` D:L474642-474648. The original
fire tick also refuses a missing selected item record at `FUN_005c0ae0` D:L476369-476372. The previous browser
record fallback could fire a baked rifle from a forced FULL_SLOT primary. `firearmSlotPresent` gates only explicit
absent markers in the shared page and room paths, and suppresses their held models. Missing fixture tables still
use their existing fallback for actual weapon ids. No EQlimit class-wide firing prohibition was introduced.

The initial selected hand is source-derived too: `FUN_005c0250` D:L476054-476105 tests an absent primary record or
id 254, then chooses slot 1 when its record exists and is not id 254. With any other existing primary record it
chooses slot 0 (D:L476108-476156). A real id-255 EQUIP_NONE record is **not** an absent pointer in this branch;
when both slots are absent/FULL_SLOT, there is no selection call and the constructor's 0 stands. The source path is
`FUN_005c8190` D:L480942 (initial flag bit 0), `FUN_005dfc80` D:L494226-494228 (kit update), then
`FUN_005c1660` D:L476707-476745 (dispatch to `FUN_005c0250`). `initialFirearmSlot` follows that branch. The page's
kit, fire record and outgoing mover commands and the room's mover/held weapon/cone all start on that same slot.

## 3. Authority and browser transport

The existing central/host placement field `weaponRestriction` remains the trusted GameStats value. Both the local
bridge and split match process pass it as `RoomOptions.eqLimit`; existing unrestricted room callers default to 0.
The room applies the shared mode kit before spawning or replaying manual picks, applies the exact rewritten valves
to `applyPicks`, and refuses stored profiles itself. A forged request cannot select a different limit.

Optional `welcome.eqLimit` and `gameLobby.eqLimit` carry that held value under the current protocol. Missing or
invalid enum metadata means 0 for compatibility with older servers. This is browser transport, not a claim about
the original wire. A trusted staging world-report update resets incompatible next-kit choices; after launch the
room's restriction is fixed. The staging update policy is the controller's scoped browser adaptation, not an
in-match mode-change feature. Reconnect/late-join welcomes, ordinary round resets, supported respawns and host
migration reuse the same room value. A newly constructed room receives the created game's same placement value.

The client sets its loadout mode before seat/pick resend, and both match mounts use it for ARMORY and dead WEAPON
EXCHANGE. The native lobby ARMORY already receives `EQlimit` from the joined game's native UI valves. The mode
helper is shared, so there is no map-specific weapon exception. No firing or world-pickup ban is added.

## 4. Verification and remaining evidence

- RED: a synthetic SEAL's M4A1 request was accepted in an EQlimit-1 room. Focused room regression was then green.
- Synthetic unit coverage: forced/default and stored/manual kits, both teams, allowed shotgun alternatives,
  forged rifle/locked-secondary refusals, reconnect and ordinary round reset, metadata/default compatibility,
  split-host staging updates/migration and immutable launched state; logical ARMORY context, entry reset and client
  bases. The existing central account-loadout flow covers actual GameStats-to-welcome-to-spawn on Frostfire.
- Dev-disc transcription: one shared UI archive and weapon table, all four modes, all eight characters and C4
  thresholds. This is source comparison, not a rendered-browser test or original-runtime parity proof.
- Fresh review correction: the shotgun edit -> Triangle -> Yes -> reselect sequence and all-column Triangle/Circle
  regressions cover both teams and all four restricted modes. No Bombs tests distinguish its preserved firearm
  choices from Circle's selected-type defaults; unrestricted behavior remains held by the existing state tests.
- Rendered two-client checks, physical-controller validation and full integration gates are the controller's
  assembled-head checks. General map rotation is not introduced here: the existing game bridge refuses replacement
  of a live room's map (`REPORT_MAP_CHANGE_PLACEHOLDER`).

## 5. Placeholders

No new placeholder or guessed gameplay value. Original-runtime comparison would raise these independently
source-reviewed readings.
