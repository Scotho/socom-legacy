# Weapon Exchange category audit

Direct input: locally supplied USA ISO, all 22 multiplayer map archives. These are the reachable choices under the current port rules applied to ISO records/valves, not proof of every original executable rule. Choices below are the union across maps; the runtime still filters each map/team/kit.

| Category | SEAL choices | Terrorist choices |
|---|---|---|
| SMGS | HK5 (31), HK5SD (33), HK5K (38) | F90 (34), 9mm Sub (37) |
| ASSAULT RIFLES | M16A2 (51), M16A2-M203 (52), M4A1 (54), M14 (60), M4A1-M203 (61), M4A1 SD (62), IW-80 A2 (64), AK-105 (65), RA-14 (66) | M16A2 (51), 552 (57), AK-47 (58), AKS-74 (59), M14 (60), 552SD (67), STG 77 (68) |
| SHOTGUNS | 12 GAUGE PUMP (84) | TA 12 GAUGE (81), M3 12 GAUGE (83) |
| MACHINE GUNS | M60E3 (91), M63A (92) | M60E3 (91), M63A (92) |
| SNIPER RIFLES | M40A1 (102), M87ELR (103), SR-25 SD (105), SR-25 (106) | M82A1A (101), M40A1 (102), SASR (104) |
| HEAVY WEAPONS | No selectable entries in the inspected tables | MGL (142), M79 (143) |
| PISTOLS | 226 (6), 9mm Pistol (8), M11 (12), SP-10 (13), Mark 23 (15), Mark 23SD (16) | F57 (4), M9 (5), 226 (6), DE .50 (7), Model 18 (14) |
| GRENADES | M67 (121), AN-M8 (122), Mark141 (123), HE (126) | M67 (121), AN-M8 (122), Mark141 (123), HE (126) |
| LAUNCHERS | AT-4 (145) | RPG-7 (146) |
| EXPLOSIVES | C4 (151), Claymore (153) | C4 (151), PMN Mine (158) |
| LAUNCHED | M203 HE (171), M203 SMOKE (173), M203 FRAG (175) | M203 HE (171), M203 SMOKE (173), M203 FRAG (175), M79 HE (176), M79 SMOKE (178), M79 FRAG (179) |
| MISSILE | No selectable entries in the inspected tables | RPG ROUND (186) |
| MISC EQUIP | 2X AMMO (194), THERMAL SCOPE (195) | 2X AMMO (194), THERMAL SCOPE (195) |

Every preview reachable on each inspected map decoded. The first two loadout slots are firearm slots; slots 3-5 each use the equipment category ring. A category with no legal choices is skipped. Heavy weapons, launcher rounds and rockets retain their dependencies.

Specific map differences: raw `mission.rdr` valves and native mode from `RUN/READERC.ZAR :: missionlist.rdr` (`NUMBER`, `NAME`, `TYPE`, `MULTIPLAYER`). These are map-specific restrictions; no blanket mode restriction is invented.

| Archive | Native mode | Enable_c4 | Enable_LAW | Enable_Sig226 | Enable_ThermScope |
|---|---|---:|---:|---:|---:|
| RUN/MP1.ZDB | DEMOLITION | 0 | 0 | 8 | 9 |
| RUN/MP10.ZDB | EXTRACTION | 0 | 0 | 8 | 0 |
| RUN/MP11.ZDB | EXTRACTION | 1 | 1 | 8 | 9 |
| RUN/MP12.ZDB | DEMOLITION | 0 | 0 | 8 | 0 |
| RUN/MP2.ZDB | SUPPRESSION | 0 | 0 | 8 | 9 |
| RUN/MP5.ZDB | SUPPRESSION | 0 | 0 | 8 | 9 |
| RUN/MP51.ZDB | SUPPRESSION | 9 | 1 | 8 | 0 |
| RUN/MP52.ZDB | ESCORT | 0 | 0 | 8 | 9 |
| RUN/MP53.ZDB | ESCORT | 0 | 0 | 8 | 0 |
| RUN/MP6.ZDB | EXTRACTION | 1 | 0 | 8 | 0 |
| RUN/MP61.ZDB | BREACH | 16 | 0 | 8 | 9 |
| RUN/MP62.ZDB | BREACH | 16 | 0 | 9 | 9 |
| RUN/MP64.ZDB | SUPPRESSION | 0 | 0 | 8 | 9 |
| RUN/MP7.ZDB | DEMOLITION | 0 | 1 | 8 | 9 |
| RUN/MP71.ZDB | EXTRACTION | 1 | 0 | 8 | 0 |
| RUN/MP72.ZDB | DEMOLITION | 0 | 0 | 8 | 0 |
| RUN/MP73.ZDB | BREACH | 16 | 0 | 8 | 9 |
| RUN/MP8.ZDB | SUPPRESSION | 0 | 1 | 8 | 9 |
| RUN/MP81.ZDB | SUPPRESSION | absent | 1 | 8 | 0 |
| RUN/MP82.ZDB | ESCORT | 1 | 0 | 8 | 0 |
| RUN/MP83.ZDB | DEMOLITION | 9 | 0 | 8 | 9 |
| RUN/MP9.ZDB | DEMOLITION | 0 | 0 | 8 | 0 |

Current rule interpretation: bit 1 permits SEALs, bit 8 permits Terrorists, bit 16 locks an existing SEAL C4 slot. A lock is not permission to select another C4. This interpretation must be distinguished from the raw valve values above. The 226 exception is MP62; do not generalize it to every SEAL kit.

Launcher-host valves also vary by map. The union of choices above does not imply that Frostfire allows launchers.

| Archive | M16A2-M203 | M4A1-M203 | M79 | MGL | RPG-7 |
|---|---:|---:|---:|---:|---:|
| RUN/MP1.ZDB | 1 | 1 | 0 | 0 | 8 |
| RUN/MP10.ZDB | 1 | 1 | 8 | 8 | 0 |
| RUN/MP11.ZDB | 0 | 0 | 0 | 0 | 8 |
| RUN/MP12.ZDB | 1 | 1 | 0 | 0 | 8 |
| RUN/MP2.ZDB | 0 | 0 | 0 | 0 | 0 |
| RUN/MP5.ZDB | 1 | 1 | 0 | 0 | 8 |
| RUN/MP51.ZDB | 0 | 0 | 0 | 0 | 8 |
| RUN/MP52.ZDB | 1 | 1 | 0 | 0 | 0 |
| RUN/MP53.ZDB | 1 | 1 | 0 | 0 | 0 |
| RUN/MP6.ZDB | 0 | 0 | 0 | 0 | 0 |
| RUN/MP61.ZDB | 0 | 0 | 0 | 0 | 8 |
| RUN/MP62.ZDB | 0 | 0 | 0 | 0 | 0 |
| RUN/MP64.ZDB | 1 | 1 | 8 | 8 | 0 |
| RUN/MP7.ZDB | 0 | 0 | 8 | 8 | 0 |
| RUN/MP71.ZDB | 0 | 0 | 0 | 0 | 0 |
| RUN/MP72.ZDB | 1 | 1 | 0 | 0 | 8 |
| RUN/MP73.ZDB | 0 | 0 | 0 | 0 | 8 |
| RUN/MP8.ZDB | 0 | 0 | 8 | 8 | 0 |
| RUN/MP81.ZDB | 0 | 0 | 0 | 0 | 8 |
| RUN/MP82.ZDB | 1 | 1 | 0 | 0 | 0 |
| RUN/MP83.ZDB | 1 | 1 | 8 | 8 | 0 |
| RUN/MP9.ZDB | 0 | 0 | 0 | 0 | 0 |

Launched-ammunition group valves are rewritten by the carried primary (`menuValves`, original `FUN_00240e60` / `FUN_0023fef0`): M203 rifles and MGL expose the M203 group; M79 exposes its group. A raw ammunition valve alone is therefore not a complete availability rule.

Columns are the raw `mission.rdr` fields `Enable_M16203`, `Enable_m4Acarbine_203`, `Enable_m79`, `Enable_mglmk1`, `Enable_RPG`.

## Quantities and implementation status

Disc quantities are `Ammo_Capacity * NumMags` in `RUN/ZWEAPON.ZAR :: zweapon.rdr`, per equipment slot:

| Item | Per slot | Current use path and limits |
|---|---:|---|
| M67 / AN-M8 / HE | 3 | Frag / smoke / HE throw paths implemented; smoke is not silently replaced with a frag. |
| Mark141 | 6 | Flashbang throw path implemented. |
| Claymore / PMN Mine | 4 | Placement implemented; Claymore remote detonation and PMN trigger paths are separate. Their team valves remain enforced. |
| C4 | 4 | **Partial verification:** target-specific planting and server target checks exist. It is not a freely throwable grenade. Placement reach and full original behavior are not established by this menu audit; no all-map physical C4 test is claimed. |
| 2X AMMO | One equipment slot | Passive firearm ammunition modifier. Current code doubles magazine count up to ten, not magazine capacity; it does not double grenade quantities. |
| THERMAL SCOPE | One equipment slot | Passive scope/lens path exists; requires a sniper. Full visual parity is not established by menu selection tests. |
| AT-4 / RPG-7 | Two equipment slots | Launcher plus dependent round; current code supplies the round slot. This is not two independently replaceable ordinary slots. |
| M203 / M79 rounds | ISO record quantity | Only the matching carried primary exposes these choices. They act as launcher fire modes, not thrown grenades. |

The current rules allow duplicate M67, smoke, flash and HE slots; their quantities add. Two M67 slots give six,
including with 2X carried. They reject duplicate 2X, thermal scope, Claymore, PMN and rocket launchers. A second RPG
round has its own dependency rule. These are checked as implementation behavior, and are not inferred from the
manual's abbreviated instructions.

No category implementation is missing from the menu's category rings. A populated category does **not** certify
every associated gameplay effect. Unsupported or inaccessible records are kept distinct:

- Satchel is the objective bomb path, not a selectable generic explosive in these inspected tables. It is not
  offered as a working substitute for C4.
- The Detonator is an automatic control for placed Claymores, not a freely selectable replacement equipment item.
- LAW HEAT is a dependent round; the empty SEAL MISSILE category does not mean the AT-4 has no ammunition.
- Designator, standalone M203 as a primary, empty firearm overrides, disabled F2000 and red-smoke records are not
  supported picker choices. Developer overrides must not be used to make them appear supported.

## Reference comparison

The supplied screenshot is visible and was compared directly with the browser capture. Both show five loadout
rows, a category header and three vertically stacked weapon cards over the game world, translucent blue panels,
cyan selection bars, the original HUD font and icon previews. Differences remain: the browser headings are yellow
where the screenshot shows white; the horizontal coverage/proportions differ, and height-based scaling can clip
the browser's left heading at 960x700. The browser capture uses M14/rifles and a round-end state; the reference uses
HK5SD/SMGs and a start-round/respawn prompt, so it is not a matched-state pixel comparison.

The reference includes 9mm Sub among HK5 variants. The ISO's inspected default valves permit 9mm Sub for
Terrorists, not SEALs. The screenshot does not establish its team, custom restrictions, mode or version well enough
to override those tables. No screenshot pixels are imported as artwork and no substitute assets are used.

The user-specified US manual (*SOCOM II: U.S. Navy SEALs* instruction manual, SCUS-97275, Sony Computer
Entertainment America, 2003, printed page 22 / PDF page 24) was opened as a local PDF and visually inspected. It documents changing weapons/items after death before the next
round: R2, Up/Down, X, Left/Right, X. It calls this an armory screen; that wording does not make the in-match screen
the port's separate pregame ARMORY. It does not establish survivor access, cancellation, duplicate rules, 2X counts,
or every input inside the category picker. The subsequent direct ISO executable check confirmed Up/Down items
and Left/Right categories (`FUN_0023d1b0` through `FUN_0023d060`); the manual's shorthand does not justify remapping
them. See research 300 section 6 for the inspected addresses and decoded-output hashes.
