# 91 -- The round: damage, death, respawn, teams, score, names (web sprint 3, M1)

Written 2026-09-29 for web sprint 3 (spec `socomlegacy/docs/specs/2026-09-29-web-sprint-3-multiplayer-design.md`, ruling W3.R1: the server-authoritative respawn round, every value cited). Read-only research. Sources: the SOCOM II decompilation `analysis/socom2_game.elf.decomp.c` (cited `FUN_x Lnnn`, `Lnnn` = its line; strings by address, e.g. `0x65c480`), reCOM (`recom/`) where the decompilation is silent, the disc's `READERC.ZAR` tables (`character.rdr`, `damanim.rdr`, `dynamics.rdr`, `cheats.rdr`, `HudCLOC`/`UIMnLOC`, `global_valves.rdr`), `RUN/ZWEAPON.ZAR/zweapon.rdr`, each map's `READERM.ZAR/chartype.rdr`, `missionlist.rdr`, and the console frames `parity/s4_pcsx2/`. This merges two notes (91a: damage, health, death, respawn; 91b: teams, score, kill lines, scoreboard, names, kits). Handoff paths are given relative to the handoff root. `DAT_` values that live in `.data` could not be read (no ELF available to either note); each is a placeholder in §16. Units: 1 unit = 0.1 m (`DAT_003dfe10` = 10, research 85 §1). Not repeated here: research 87 §8 (round-start banner timing), §12 (scoreboard geometry), §14 (message window).

**Overridden in part (research 206 §1):** friendly fire is "game-info bit 0" -- true of the lobby's RulesSet only; in-game it is bit 0x20 of byte 0x19 (V3; research 179, 192).

Vocabulary. **Part** = the 6-slot hit location, 0 HEAD, 1 RARM, 2 LARM, 3 BODY, 4 RLEG, 5 LLEG (the order `FUN_005a4840` L460950 loads `HEAD/RARM/LARM/BODY/RLEG/LLEG_DEATH_ANIMATIONS` into). **Local/remote**: controller vtable `+0x34` true = the actor is driven from another console. `DAT_0045a0c1` != 0 = online; `DAT_0045a0c0` = host. **Game** = `DAT_00437ce8` (the MP game object, `FUN_002a76d0` L149485). **Player** = a character (`+0x14` name, `+200` team flags, `+0xe1` bit 4 alive, `+0xfc8` player slot 0..23). Actor part fields: `+0xffc..+0x1010` health[6], `+0x1014..+0x1028` max[6], `+0x102c..+0x1040` armour[6], `+0x1044` overall health 0..1, `+0xfb0` death cause, `+0xfb4` death time. **Round stats** = the block at character `+0x58c`; **match stats** = `+0x544` (the round block is added into it at round end, `FUN_00223970` L76010-76062). Team ids 0 = SEALs, 8 = Terrorists (`aiteam_00`/`aiteam_08`, `mp_score00`/`mp_score08`). `FUN_002c31d0(p)` = is a SEAL, `FUN_002c30b0(p)` = is a Terrorist, `FUN_002c2fd0(p)` = is a spectator.

## 0. The answers in one table

| rule | value | citation |
|---|---|---|
| health per part (MP) | head 8, body 50, each arm 30, each leg 30 (all MP kits inherit `mp_seal`/`mp_terror`) | `character.rdr`; `FUN_0053ddb0` L406804 |
| armour per part (MP) | head 0, body 25, each limb 25 | `character.rdr`; `FUN_0053ddb0` L406826-406833 |
| bullet damage | (ammo `ImpactDamage` + weapon `Damage_Modifier`) x 14, after falloff | `FUN_003c7600` L318738-318740, L318767; `FUN_003c5950`; loaders `FUN_003d45a0` L322675, `FUN_003d2060` L322476 |
| falloff | full to `Effective_Range` x10, linear to 0 at `Maximum_Range` x10; beyond it the round is ignored | L318752-318760 (`FUN_003d27e0`, `FUN_003d27f0`); `FUN_003c8920` L319410 |
| armour step | `eff = max(0, dmg - A x (10-P)/10)`; `A = max(0, A - (dmg-eff)/4)`; `H = max(0, H - eff)` | `FUN_003c7400` L318568-318590 |
| hit location | the skeleton node the round's collision hit (§1.3); hands, feet, scapulas: no damage; ~~one hit per actor per round~~ (amended 2026-11-10, research 398, research 217 §3.6b: one record a bone box the round enters, each limb record damaged, the first head or trunk hit remembering the round and sparing the rest of that body) | `FUN_005abbc0` L464672-464803; `FUN_005ab850` L464597; `FUN_003c8920` L319390-319405 (the effects' guard only) |
| headshot | head node hit: part 0, death cause 3 | L464739-464743 |
| limb rules | limbs never kill; a hit on a zeroed limb goes to BODY as `dmg x DAT_006508a8` (placeholder); a body hit caps each limb at `limb max x body/bodyMax` | `FUN_005a5830` L461469-461547 |
| explosion damage | `(Explosion_Damage + Dmg_Mod) x falloff x 14` per fragment, random part; M67 140 to 75 units, 0 at 150 | `FUN_005a0e70` L459235-459256; `FUN_005a18b0` L459394-459460; zweapon.rdr |
| fall damage | every part `-= max x f`, `f = clamp((v-170.7)/(237.5-170.7))`; 62-unit fall starts it, 120 kills | `FUN_005ac1f0` L464864-464960; `FUN_0059ba80` L456671-456682; dynamics.rdr |
| death condition | head <= 0 or body <= 0 (or not alive) | `FUN_005a54d0` L461376-461380 |
| respawn availability | SUPPRESSION (game type 5) and host option `mp_allow_respawn`; no respawn game type | `FUN_002a7560` L149405-149431, caller L55619-55620 |
| respawn delay | selected r0004: both help and accepted Action require elapsed strictly greater than 5.0 s and model alpha zero; the nominal full-alpha fade is 10 s | research 352 sections 2-4, native `FUN_001f97b0` / `FUN_00597d90`; the earlier r0001 locations are retained in section 4.1 |
| respawn fade-in | alpha 0 -> 1 at 4/s (0.25 s); no banner or countdown | `FUN_00599b60` L455695 |
| respawn point choice | key 1/3 record in the slot's block whose nearest enemy is farthest (max-min squared distance) | `FUN_002b7ee0` L158655-158718; `FUN_002b8100` L158720 |
| round-start slots | key 0/2 record: non-respawn game = record `+0xfc8`; respawn game = random in the slot's block (`count/24` records) | `FUN_00598b90(a,0)` L75931; L158760-158787 |
| loadout on respawn | fresh full kit: the type's `default_weapons`, ammo `Ammo_Capacity` x `NumMags`; kit re-choosable while dead; stats kept | `FUN_00599f00` L455760-455800; `FUN_00599b60` L455604-455700; `FUN_00598b90` L455100-455230 |
| spawn protection | none | cheats.rdr; strings |
| friendly fire | host flag game-info bit 0 `mp_friendly_fire` -> `DAT_0044cdb8`; enforcement not found; create-game default "Friendly Fire is disabled." | L150754-150761, L163354-163369; frame `A_49_creategame` |
| team assignment | joiner: Terrorists if Terrorists < SEALs, or SEALs = 8, or both empty; else SEALs (ties to SEALs); host: SEALs | `FUN_002bc620` L161359-161395; `FUN_002c5450` L166238-166262; frame `A_55` |
| team size | 8 a team (slots 0-7); 16 players + 8 spectators (24 lobby records) | `FUN_002c4500` L165660; `FUN_002c4290` L165534, L165551; `FUN_002bc620` L161329-161334 |
| score, kills and penalties | enemy kill +2 (kills +1); suicide or fall -2 (suicides +1); team kill -2 (team kills +1); victim: deaths +1, 0 score; hostage/escortee kill -2 (in ESCORT a Terrorist +3) | `FUN_00545290` L411473-411512; `FUN_00545c90` L411872; `FUN_00545c10` L411850; `FUN_00545d10` L411894; `FUN_00545390` L411516-411547 |
| score, round bonuses | round win +5 to each player on the winning side; alive at round end +1 | `FUN_00545b10` L411806; `FUN_00223970` L76146-76160; `FUN_00545b90` L411828; L76162-76165 |
| defaults, players | 16 | frame `A_49_creategame`; `FUN_002bc620` L161328-161332 |
| defaults, rounds | 11 on the create-game screen (9 if the valve is 0 at load) | `A_49`; `FUN_001f5e70` L55628-55631 |
| defaults, round time | 6 minutes (choices 4-10; 300 s if 0 at load); seconds = menu x 60, clock ms x 1000 | `A_49`; UIMnLOC 273-279; L55621-55626; `FUN_002f83b0` L197274; `FUN_002a6c50` L149156 |
| defaults, FF / respawn | FF "disabled"; Respawn "disabled"; spectators YES, no password | `A_49`; UIMnLOC 249-250 |
| match win | first team to `mp_half_rounds` = (`mp_max_rounds` + 1) >> 1 (6 of 11); tiebreaker round past the last; no score or kill limit | `FUN_002a6c50` L149073-149082; `FUN_001fb420` L57633-57648 |
| kill lines | "%s fragged %s with %s" (enemy and team kills), "%s commits suicide with %s", "%s falls to their death"; weapon = ZWEAPON `DisplayName` | `FUN_00547860` L412879-412891; `FUN_003d19a0` L324284 |
| scoreboard sort | score (`+0x580` + `+0x5c8`) descending, ties keep join order; <= 8 rows a team | `FUN_00229d00` L78910-78941; `FUN_0022de60` L80575-80620 |
| scoreboard dimming | dead rows both colours x 0.6 (`0x3f19999a`) | `FUN_0022a290` L79022-79024 |
| name length | 30 characters kept in game; clan tag 15; lobby field 32 bytes | `FUN_005442c0` L410582-410590; L166266-166293 |
| name charset | printable ASCII plus an accented page on the on-screen keyboard | frame `A_37_namekbd` |
| name default | `"Player%d"` (network index), create path `"Player"` | L166268-166271; L410582-410585; L159304-159309 |
| name duplicates | resolved by the server ("already logged in" UIMnLOC 543, "questionable content" 544, game names "already in use" 294) | UIMnLOC |
| spectator modes | ~~0 follow a player, 1 free~~ 0 free, 1 follow a player (2026-10-08, research 244 §3), 2 the map's scenic views; jump to visible player | `FUN_00295260` L139448; `FUN_002964f0` D:L140442, `FUN_00297410` D:L140957-140960 |

> Superseded by research 244 §3 (2026-10-08): the spectator camera's state byte is the camera's +0xf4 (`FUN_0029b0c0` D:L142660) and reads **0 free** (`FUN_002964f0` D:L140442), **1 follow** (`FUN_00297410` D:L140957-140960), **2 scenic**; `FUN_002956e0` sets 0 for the local object and 1 for another actor (D:L139698-139704); X goes scenic -> free -> scenic and follow -> free -> follow, free the hub (`FUN_00295260` D:L139480-139530). The labels "0 follow, 1 free" here are kept as the record; the code is `packages/viewer/src/spectatorView.ts` (PT-19b). A reading (the decompilation, not measured running).

## 1. Damage and hit zones

### 1.1 Bullet damage (`FUN_003c7600` "GetDamage" L318650-318830, `FUN_003c7400` L318568)

| value | meaning | citation |
|---|---|---|
| `ammo+0xc` + `weapon+0x64` | base = `ImpactDamage` + `Damage_Modifier` (additive; absent = 0) | `FUN_003c7600` L318738-318740 (`FUN_003d4530`, `FUN_003d2050`) |
| `weapon+0x40` / `+0x3c` | `Effective_Range` / `Maximum_Range` x10: full to E, `x (1 - (d-E)/(M-E))` to M | L318752-318760 |
| beyond `Maximum_Range` | the round is ignored (projectile `+0x94`) | research 85 §1; `FUN_003c8920` L319410 |
| x 14 | every damage multiplied by 14 (`FUN_003c5950`) after falloff | L318767; inverse `FUN_003c5930` (/14) |
| `ammo+0x14` `Piercing` | armour bypass, 0..10 | `FUN_003c7400` L318568-318590 |
| `ammo+0x10` `Stun` | loaded, reader not traced | loader L322680-322684 |
| penetration | passing a material sets the round's remaining range to `(R + R x P x 0.1) x material+0x24` if smaller; damage not scaled | `FUN_003c8920` L319506-319516 |
| shotgun class (IDs 81-90) | pellets `FUN_005a1620` L459317: 8 if within `DAT_006508b8` (SP) / `DAT_006508c0` (MP) sq-distance, else 4 within `DAT_006508c8` (MP), plus 1/2/4/5/6/7 at 5/10/35/35/10/5 %, thinned by range; each pellet full `ImpactDamage x14` to a random part | `FUN_005abbc0` L464704-464737 (MP: the blast to BODY, L464735); `FUN_005a1b80` L459540-459570 |

Weapon class codes (`FUN_003d1a60` L324329): ID 4-30 pistol, 31-50 SMG, 51-80 rifle, 81-90 shotgun (`'Q'`), 91-100 MG, 101-120 sniper, 121-140 grenade (`'y'`), 151-170 placed explosives, 171-184 launcher rounds, 201-204 armour.

### 1.2 Per-weapon numbers (zweapon.rdr; x14 within `Effective_Range`; vs the MP character)

Shots columns assume full damage, each shot on the same part; "limb" = shots to zero one limb (not a kill).

| weapon (ID) | ammo | Impact | Dmg_Mod | Pierce | dmg/shot | head (8/0) | body (50/25) | limb (30/25) | E / M units |
|---|---|---|---|---|---|---|---|---|---|
| M4A1 (54) | 5.56x45 | 2.3 | +0.3 | 3 | 36.4 | 1 | 3 | 2 | 6000 / 10000 |
| M4A1 SD (62) | 5.56x45 | 2.3 | +0.15 | 3 | 34.3 | 1 | 3 | 2 | 5500 / 8000 |
| Mark 23 (15) | 45 ACP | 3 | 0 | 4 | 42.0 | 1 | 2 | 2 | 500 / 1250 |
| 226 / P228 / M9 / Model 18 | 9x19P | 1.5 | 0 | 2.1 | 21.0 | 1 | 6 | 5 | 450 / 950 |
| F57 (4) | 5.7x28 | 1.4 | 0 | 3.5 | 19.6 | 1 | 6 | 5 | 500 / 1250 |
| DE .50 (7) | 50 AE | 6.4 | 0 | 5 | 89.6 | 1 | 1 | 1 | 600 / 1750 |
| SR-1 Gyurza (13) | 9x21 | 2.2 | 0 | 8.5 | 30.8 | 1 | 2 | 2 | 500 / 1500 |
| HK5 (31) | 9x19P | 1.5 | 0 | 2.1 | 21.0 | 1 | 6 | 5 | 1500 / 3000 |
| MP5K (38) | 9x19P | 1.5 | 0 | 2.1 | 21.0 | 1 | 6 | 5 | 250 / 1000 |
| F90 (34) | 5.7x28 | 1.4 | 0 | 3.5 | 19.6 | 1 | 6 | 5 | 1500 / 3000 |
| Steyr Aug (68) | 5.56x45 | 2.3 | 0 | 3 | 32.2 | 1 | 3 | 2 | 1500 / 3000 |
| 552 (57) | 5.56x45 | 2.3 | 0 | 3 | 32.2 | 1 | 3 | 2 | 6000 / 10000 |
| 552SD (67) | 5.56x45 | 2.3 | -0.2 | 3 | 29.4 | 1 | 4 | 3 | 6000 / 10000 |
| AK-47 (58) | 7.62x39 | 2.3 | 0 | 6 | 32.2 | 1 | 3 | 2 | 6000 / 10000 |
| AK-105 (65) | 5.45x39 | 2.7 | 0 | 4 | 37.8 | 1 | 3 | 2 | 6000 / 10000 |
| SA-80 A2 (64) | 5.56x45 | 2.3 | 0 | 3 | 32.2 | 1 | 3 | 2 | 5000 / 12000 |
| Groza (66) | 7.62x39 | 2.3 | -0.3 | 6 | 28.0 | 1 | 3 | 2 | 6000 / 10000 |
| M63A (92) | 5.56x45 | 2.3 | -0.4 | 3 | 26.6 | 1 | 4 | 3 | 4000 / 8000 |
| SR-25 (106) | 7.62x51 | 2.3 | +0.4 | 8 | 37.8 | 1 | 2 | 1 | 12000 / 17000 |
| M82A1A (101) | .50 Cal | 9 | 0 | 7 | 126.0 | 1 | 1 | 1 | 18000 / 24000 |
| 870 (84) / Spas 12 (81) | 12 Gauge | 2.5 | 0 | 6 | 35.0 / pellet | 1 | 2 | 2 | 410/840, 400/850 |

The kits are in §14; no kit sets `ammo_count`/`mag_count`, so the weapon record's `Ammo_Capacity` x `NumMags` apply (§4.3).

### 1.3 Hit location (`FUN_005abbc0` L464672-464803, nodes bound in `FUN_00553ea0` L419606-419652)

| collision node (actor offset, bone) | part | citation |
|---|---|---|
| `+0x308`, `+0x30c` (bone names at 0x65c500, 0x65c508: short strings, [inferred] `head`, `neck`) | 0 HEAD (cause becomes 3 "headshot") | L464739-464743 |
| `+0x320` rbicep, `+0x324` rforearm | 1 RARM | L464749-464752 |
| `+0x328` lbicep, `+0x32c` lforearm | 2 LARM | L464744-464748 |
| `+0x310` spinehi, `+0x2fc` spinelo, `+0x304` (0x65c4f8, [inferred] `hips`) | 3 BODY | L464753-464757 |
| `+0x318` rthigh, `+0x31c` rcalf | 4 RLEG | L464763-464766 |
| `+0x314` lthigh, `+0x340` lcalf | 5 LLEG | L464759-464762 |
| hands, feet, scapulas, shoulder weights | none (no damage) | no branch |

The round's hit polygon must carry the flesh material (`DAT_003e14f8`); its owner is walked up to the actor, and `projectile+0x78` remembers it so a round hits an actor once (`FUN_003c8920` L319390-319405).

**Amended 2026-11-10 (BONE-BOXES; research 398, a reading re-read by a fresh reviewer; research 217 §3.6b, reading,
pending review).** `+0x78` gates only the impact's effects -- the same-body flag skips `FUN_003d0ba0`, the noise and the
scene programs -- never the handler or the range cut (research 398 s2, s12.1). The hit volumes are the bones' boxes,
one a bone (`FUN_0058b960` D:L447559-447593), a record for each box the round's line enters from outside; every record
cuts the range and reaches the victim's handler; the damage guard is the victim's memory of the round (`+0x1048`,
`FUN_005ab850` D:L464597), armed by a head or trunk hit only (`FUN_005abbc0` D:L464741-464757). So a limb then the
trunk is two hits, the trunk then a limb one, two bones of one limb two, the head then anything one. "A round hits an
actor once" above is that guard misread; the port builds research 398's rule (`match/src/bodyWalk.ts`).

**Each side its own body (2026-09-30, the owner's play test of e373be70).** The game hits the actor's own skeleton
nodes, so a Terrorist is hit on the Terrorist model's bones. The room had built one set of capsules from the SEAL's
skeleton for every player, and the page put the SEAL's body on its own player whatever its side. Now the server reads
both sides' index-0 characters (`simSkeletonFromBytes` with `navyseals` / `terrorists`, `chartype.rdr` through
`character.rdr`; MP2: `seal_A_scuba` and `al_gman01`, §14) and `Room` picks a player's capsules by `p.team` -- a side
whose skeleton did not read takes the SEAL's; the in-page loopback builds the same two from the page's bodies
(`teamBody.ts` `hitBodiesOfPage`); and the page's own body follows its side (`teamBody.ts` `bodyForTeam` /
`OwnBody`, rebuilt on the room's `welcome` / `promoted` and at each spawn). Web sprint 5 S2 takes the same by
character type: each side's four ARMORY types' skeletons (`simSkeletonsFromBytes`), a player hit on its body's type's
(`Room.volumesOf`); the types' parts' boxes differ, so their capsules do (research 95 §6). Without a choice a player is
SEAL 1 / TERRORIST 1 (research 95 R95.5, which answers `DEFAULT_CHARTYPE_PLACEHOLDER`).

**The nodes as posed: the lean (LEAN-HIT, 2026-11-08; reading, pending review).** The nodes `FUN_005abbc0` meets are
the actor's live skeleton's, so a SEAL holding a peek is hit on the lean clip `FUN_0057d810` (D:L440437-440510) holds
on its last key, not on his stance's idle. The room's and the page's capsules now pose the held peek's lean set
(`bodyVolumes`' `peek`, the room's rewind history carrying it); the clip's rise is judged at the held key
(`LEAN_HIT_POSE_READING`). Research 217 §3.6.

### 1.4 Part damage bookkeeping (`FUN_005a5830` L461469-461547)

| rule | citation |
|---|---|
| head/arm/leg with health > 0: armour step on that part | L461478-461486 |
| arm/leg already at 0: the hit goes to BODY as `dmg x DAT_006508a8` with piercing `DAT_006508b0` (placeholders); head at 0: nothing | L461487-461490 |
| BODY hit: armour step on body, then each limb's health capped at `limb max x body/bodyMax` (head not capped) | L461492-461526 |
| all parts clamp at 0 | L461528-461545 |

**2026-11-11: the BODY-hit limb cap is PROVEN** (shadow's capture of the original, PCSX2 r0004, PINE; the gate-runner
`shadow/out/2026-11-11/belly-shot/SPREAD-EVIDENCE.txt`). The rule of the third row -- after a BODY hit each limb's
health is capped at `limb max x body/bodyMax`, the head uncapped (`FUN_005a5830` L461492-461526; the port's viewer
`net/damage.ts` `applyHit`, its BODY branch) -- measured: A, a terrorist with its default rifle (SIG 552-style, a single
projectile, one press a round), fires at B, a standing SEAL with its default rifle in hand, 54.1-59.0 u away. Clean:
16 rounds on fresh lives with NO health write (files `seal-front-yawcol2-*`, `seal-front-belly-col-*`,
`seal-front-belly-p-3`/`-2.7`/`-3.3-*`, `seal-front-vscale-*`, about 10:50-11:00Z). The cleanest chain, one fresh life,
no writes (`seal-front-belly-col-*`), as head/rarm/larm/body/rleg/lleg: 8/30/30/50/30/30 -> r0 8/21.3/15.5/35.5/21.3/21.3
-> r1 8/5.0/0.0/8.3/5.0/5.0 -> r2 8/0/0/0/0/0. After each BODY hit the uninjured limbs sit at the body's fraction of
their maximum (35.5/50 = 21.3/30; 8.3/50 = 5.0/30): the cap. The other clean lives' pairs agree (body/limb 17.6/10.5,
the pitch -3.0 and -2.7 lives). Not counted as clean: 108 rounds whose health was RESTORED by a PINE write before the
round (`seal-front-fine-fp-*`, the left side, and `seal-FRONT-fine-fp-*`, the third-person front). Levels kept apart:
the cap is proven; the rest of this section stays a reading -- `larm` took its own damage in the same rounds (it was on
the line), consistent with research 398's limb-then-trunk but not measured here as a rule; the head never changed, as
the table's "head not capped" reads; the damage amounts themselves are not scored here.

## 2. Health and armour

| value | meaning | citation |
|---|---|---|
| head 8 / body 50 / larm 30 / rarm 30 / lleg 30 / rleg 30 | MP part health (`mp_seal`, `mp_terror`; all MP kits inherit) | `character.rdr`; `FUN_0053ddb0` L406804 |
| armour head 0 / body 25 / limbs 25 | MP part armour | `character.rdr`; `FUN_0053ddb0` L406826-406833 |
| (SP for contrast) `basic_seal` 25/140/20/20/25/25, armour 0/35/10 | single-player SEAL | `character.rdr` |
| item 201 `Kevlar Armor` body armour >= 30; item 202 `Kevlar Armor with inserts` >= 60 | kit armour; no MP kit carries either | `FUN_005a0cd0` L459014; `FUN_005a0da0` L459041; `FUN_005c7840` L480330-480381 |
| `+0x1044 = (3 head + rarm + larm + body + rleg + lleg) / (3 headMax + ...)` | overall health 0..1 (the HUD bar) | `FUN_005a56d0` L461416-461437; `FUN_00241cc0` L89955 |
| reset on (re)spawn: parts = character values, health 1.0 | | `FUN_00553ea0` L419759-419762 |
| wounded groans every 0-3 s when health < 1 | single player only (`DAT_0045a0c1 == 0`) | `FUN_005a33b0` L460231 |
| flinch clip on any non-lethal loss (by part x stance, random; MP skips three long clips) | `*_FLINCH_ANIMATIONS`, damanim.rdr | `FUN_005a0270` L458712; `FUN_005a54d0` L461395-461410 |
| limp / leg slow-down | none: no reader of leg health affects movement; no limp clip or string in S2 (reCOM `zseal.h:722` `m_limp` is SOCOM 1) | searched `0x100c`/`0x1010`, `limp` |
| healing, bleed-out | none found; only mission scripts set health | `FUN_005d4770` L488010 |
| `strength` 4, `recovery_factor` 2 | loaded into the character type (`+0x2f4`, `+0x2f8`), readers not traced | `FUN_0053ce00` L406404-406405 |

## 3. Death

| value | meaning | citation |
|---|---|---|
| head <= 0 or body <= 0 (or not alive) | death | `FUN_005a54d0` L461376-461380 |
| death -> health 0, cause at `+0xfb0`, vtable `+0x58` | `+0xfb4` = clock at death, alive bit cleared | `FUN_005477a0` L412821; `FUN_00547af0` L413049 |
| cause codes | 5 bullet (3 when part 0), 4 explosion, 7 fall, 6 ghost/cleanup, 2/0 scripts | `FUN_005a54d0`, `FUN_005a0e70` L459285, `FUN_005ac1f0` L464954 |
| death clip | `{HEAD,BODY}_DEATH_ANIMATIONS[STAND/CROUCH/PRONE]`, random in the list; limb parts have no list -> BODY list's first clip for the stance; pistol variants when holding a pistol | `FUN_005a0700` L458831, `FUN_005a0950` L458898; damanim.rdr |
| head lists | stand: Death stand head01-04; crouch: Death crouch head01, chest01; prone: Death prone chest01 | damanim.rdr |
| body lists | stand: Die, Death02, Death stand chest03, rarm01, larm01, larm02, Crawl death01/02; crouch: back01, chest01, chest02; prone: prone chest01 | damanim.rdr |
| no clip for causes 4 and 7 | fall and blast play their own landing/knock clips | `FUN_005a54d0` L461384 |
| death sound | cause 1/2/3 -> sound 0x3d, else 0x3c, cause 6 none | `FUN_005979a0` L454470-454478 |
| ragdoll | none (no string, no physics body) | strings |
| camera, round games (respawn off) | spectate: `FUN_005ef2f0(0x18)` message 0x22, "cycle through living teammates"; the dead spectate for the rest of the round | `FUN_005979a0` L454484-454489; `FUN_001f97b0` L57059 |
| camera, respawn game | no switch found; body fades 1 -> 0 at 0.1/s (10 s) | `FUN_005979a0` L454491; applier `FUN_00551ec0` L418494 |
| silenced-weapon kill flag | IDs 16, 33, 62, 67, 105 -> stealth kill stat | `FUN_003c5ac0`; `FUN_005a5a80` L461597 |
| death counted | deaths +1 whatever the cause, also with no killer found | `FUN_00545d10` L411894; L458147, L464655 |
| the death drops the move | the death state (8) replaces the ladder (5), the hang (4) and the peek (3): entering it calls the hang/ladder release `FUN_005a5da0`; the blast's death calls it before state 8. The room (`room.ts` `kill`) resets the moves, lets go the lean and action buttons, and a body released from a ladder or a ledge falls (M-4 of review 2) | `FUN_005af590` L466696-466699; `FUN_0057e770` L440992-440993; research 86 s8 |

## 4. Respawn (SUPPRESSION + RESPAWN only)

### 4.1 When

**2026-10-21 follow-up, selected r0004:** [research 352](352-r0004-respawn-code-check.md) independently re-reads
the loaded original instructions: both the help and accepted Action require elapsed strictly greater than five
seconds and model alpha zero; Action is a fresh press. The death fade starts without an Action press. These are
reviewed readings, with the priority/frame-delta qualifications and remaining partial-alpha substitution recorded
there and in [351](351-respawn-help-presentation.md). The older r0001 line references below retain their provenance.

Game types (every MP map has one fixed type, `missionlist.rdr` `TYPE`, game `+0x111`): 1 BREACH, 2 DEMOLITION, 3 ESCORT, 4 EXTRACTION, 5 SUPPRESSION (`FUN_002c9540` L168878-168906; names L184050-184060). There is no respawn game type; respawn is a create-game option (UIMnLOC 283 "Set respawn option for SUPPRESSION maps", 285). SUPPRESSION maps: Frostfire (2), Abandoned (5), Rat's Nest (8), Vigilance (51), Shadow Falls (64), Chain Reaction (81).

| value | meaning | citation |
|---|---|---|
| respawn on = `mp_allow_respawn` != 0 and game type == 5 | game `+0xdc` (the `Respawn` valve); game-info flags bit 0 FRIENDLY FIRE, bit 1 RESPAWN (L184080-184087, L191375-191383) | `FUN_002a7560` L149405-149431, caller L55619-55620 |
| strictly more than 5.0 s in selected r0004 (research 352) | minimum since death (`now - player+0xfb4`) for both help and accepted Action; zero alpha is required too | `FUN_00592560` L451680-451701; `FUN_001f97b0` L57080 |
| body alpha must be 0 (nominal fade 0.1/s from 1 -> 10 s) | both the help and accepted Action wait for zero alpha (selected r0004 re-read: research 352) | `FUN_00592560` L451724-451726; prompt `FUN_001f97b0` L57070-57080 |
| button: `FUN_002c64e0(0,pad) == 1`; pad result 0 = `Action` (X in Default config) | "Press the %c button to respawn." (0x3e3220; X 0x3e3310, alt 0x3e3330) | `FUN_00592560` L451675, L451656-451658; L57008-57030 |
| late joiner/ghost (`+0xd2`, bit 0x10000) never respawns | "You are a ghost..." | L451680; `FUN_002c2fd0` L164609 |
| `+0xfcf = 1` -> `FUN_00598b90(actor, 1)` | the respawn | `FUN_00547350` L412726 |
| fade in: alpha 0 -> 1 at 4/s (0.25 s) | new body | `FUN_00599b60` L455695 |
| `respawn_time`/`respawn_fade`/`respawn_range` | single-player mission AI (`ai_params`, reCOM defaults 5.0 / 0.75), not MP | `FUN_002aab20` L151333-151353; reCOM `src/gamez/zFTS/fts_mission.cpp:346-353` |
| respawn off | the dead spectate for the rest of the round; "select weapons for the next round" (HudCLOC 60488) | L454484-454487 |

### 4.2 Where (`FUN_002b8100` L158720, `FUN_002b7ee0` L158655, `FUN_0052fe60` L398400, `FUN_0052b5c0` L395740)

| value | meaning | citation |
|---|---|---|
| list key = record `flags >> 4`: 0 side-0 slot, 1 side-0 respawn ("twin"), 2 side-1 slot, 3 side-1 respawn | `AIMAPS.MPS` trailer list, grouped by key | `FUN_0052fe60` L398436 |
| side = 1 when `FUN_002c30b0(actor)` (team word 0x40000001, or 0x80000100 when `DAT_004412d8` is 0) | | `FUN_00598b90` L455229-455241; `FUN_002c30b0` L164662 |
| round start (`FUN_00598b90(a,0)`, L75931): key 0/2; non-respawn game: record = player slot `+0xfc8`; respawn game: random in the slot's block | block = `count/24` records from `slot x count/24` | L158760-158787 |
| respawn (`FUN_00598b90(a,1)`): key 1/3, in the slot's block, the record whose nearest enemy (team mask disjoint) is farthest | max-min squared distance over all actors | `FUN_002b7ee0` L158655-158718 |
| index >= count wraps (`index % count`) | | `FUN_0052b5c0` L395760 |
| facing = flags & 0xf: 0 (0,0,-1), 1 (.707,0,-.707), 2 (1,0,0) ... 7, then negated | 8 headings | L395768-395800 |
| y + 1.0 | lifted a unit above the cell | `FUN_002b8100` L158793 |
| the floor under it | the walking tick's own pick: the probe from the feet + 5.5 (`STEP_PROBE_LIFT_READING`, a reading: research 86 s6.5), the highest hit at or under that origin + 1, else the lowest (`FUN_005b0420` -> `FUN_005b5d40` L470230-470240; research 86 s6.3). The server (`room.ts` `spawn`) and the page (`walk.ts` `respawn`) place from the record's y + 1 + 5.5, so a top 6.25 over the record is stood on (until 2026-10-02 `PROBE_LIFT` 5 left it for the floor under); from the eye (+ 16.4) four Frostfire records stood the SEAL on an object 12 up (launch fix PL-2) | `room.test.ts`, `walk.test.ts`, `simMap.test.ts` |
| 96-record maps: 24 respawn records a side -> 1 per slot; Frostfire/Rat's Nest (hundreds of twins) -> ~10 per slot | from research 75 §5.5 counts | research 75 |

Where the notes overlap: 91b listed `RESPAWN_POINT_PLACEHOLDER` (the rebuild copies the body's own matrix, L455645; the placement not traced) as not found. 91a's is a cited function chain (`FUN_00598b90` -> `FUN_002b8100` -> `FUN_002b7ee0`), so it is the stronger evidence and resolves that placeholder. 91b's copy of the old matrix is the rebuild step, not the placement. Open: 91a's slot is the player slot `+0xfc8` (0..23); 91b found the lobby team slot `+0x3e` (0-7) with "no link to type found"; the link between the two slot numbers was not read.

### 4.3 What

| value | meaning | citation |
|---|---|---|
| actor rebuilt from the chosen character type (kit may be re-chosen while dead: "%c Select new weapons") | full part health, alive; stats (`+0x544..+0x5ce`) saved before and written back after | `FUN_00599b60` L455604-455700; `FUN_00598b90` L455100-455230, L454977-455170 |
| inventory = the type's `default_weapons`; `ammo_count x mag_count` when given, else the weapon's defaults (`FUN_005bde20`) | fresh full kit, grenades included; 91b's "two weapon-state values restored [inferred: the kit is kept]" is the same rebuild (`FUN_005c7840` L455675), and 91a's cited default-weapons path wins | `FUN_00599f00` L455760-455800 |
| spawn protection / invulnerability | none found (`NoDie` is a debug cheat; `MPRespawn` cheat also exists) | `cheats.rdr`; strings |
| `%s_valve_alive` = 1, camera effects node re-added | | L455330-455337 |
| a respawn's own start | none: no banner or countdown, only the 4/s fade-in | `FUN_00599b60` L455695 |

## 5. Explosives and falls

| value | meaning | citation |
|---|---|---|
| explosion reaches an actor only with LOS from the blast to the head node (or a penetrable blocker) | queued at `+0x104c` | `FUN_005ac070` L464806; `FUN_005a0e70` L459090-459150 |
| fragments: 8 within 30 units + 1/2/4/5/6/7 (5/10/35/35/10/5 %); -1 crouched, -3 prone (not shotguns); beyond 30: `x 900/d^2`, stochastic rounding | | `FUN_005a18b0` L459394-459460 |
| each fragment: `(Explosion_Damage + Dmg_Mod) x falloff x 14` at `Piercing`, random part (`DAT_006508d0/e0`) | falloff: full to r/2, linear to 0 at r (research 85 §7.1) | `FUN_005a0e70` L459235-459256; `FUN_003c7600` L318720-318735 |
| M67: 10 -> 140/fragment to 75 units, 0 at 150 (P 4) | one head or body fragment kills | zweapon.rdr; §1.1 |
| HE: 11 -> 154 to 50, 0 at 100 (P 1); Claymore 16 -> 224 to 125, 0 at 250, /32 outside its cone; C4 18 r 50; PMN 6.5 r 40; Satchel 20 r 280 | | zweapon.rdr; research 85 §9.7 |
| knock-down factor `1 - d^2/r^2`; push `FUN_0057ed10(dmg/14)`, applied by `FUN_0057e770`: up to `min(100, f (dmg/14) 120/90)` u/s from the blast, rising at least `50 f`, in `Fall forward` / `Fall backwards`; none prone | research 85 section 12 | L459178-459191, L459277; L440940-441092 |
| fall: speeds `m_landSpeed = g sqrt(2h/g)`, g 235, h 62/91/120 (`FALLING_DAMAGE_LIGHT/HEAVY/DEATH` 6.2/9.1/12 x10) = 170.7 / 206.8 / 237.5 | | `FUN_0059ba80` L456671-456682; dynamics.rdr |
| fall damage: `f = clamp((v-170.7)/(237.5-170.7))`, every part `-= max x f`; class 2 (>= 206.8) a hit clip, 3 death | victim-local | `FUN_005ac1f0` L464864-464960 |
| fall death posts "%s falls to their death" (cause 0xfd), counts a suicide (the killer is set to the local player) | -2 score | L464955-464959 |
| a blast knock's landing (`Fall forward` / `Fall backwards` on the ground) reaches the fall damage at its contact speed x 1.2 (2026-10-03, research 151 §2.6) | the room: `Landing.knocked`, `KNOCK_LANDING_SPEED_FACTOR` | `FUN_00580360` L441921-441929, from L466914 |
| the fall's reaction is `FUN_005a54d0(actor, 3, 7)`: part 3 BODY, cause 7, the health bar moves, no flinch; victim-local (`+0x34`). The room sends the victim's page `hurt` (part 3) and a combat report (2026-10-03, research 151 §3: before it the room lowered the health and told no one) | | L464928-464931, L464951; `FUN_005a54d0` L461394-461408 |

## 6. Hit feedback (victim)

| value | meaning | citation |
|---|---|---|
| health bar (488,396) 134x18, flashes on change | the only HUD damage cue | `CHealthBar` `FUN_00241cc0` L89935; research 87 §1.8 |
| damage-direction markers, red screen, blood on screen | none (no strings, no HUD element) | strings, `hud.rdr` |
| flinch clip by part and stance | | §2 |
| blast: `.RINGING_EARS` played from the banks and sound channels 0-3, 5 and 6 held at 0.35 volume for 5 s, then back to full over 5 s | local player, not shotguns | `FUN_005a0e70` gate L459194-459206, ring L459229-459235; `FUN_003412f0` L241197; fade `FUN_003410d0` L241137-241172 |
| landing jolt `FUN_00578150` +0.66 (class 2) / +0.33 (class 1) | | L464924-464929 |

## 7. Teams: assignment, balance, switching

SOCOM II has no in-round auto-balance: the host places each joiner once, on the lobby's rule, and a player may switch only to a team with a free slot.

| value | meaning | citation |
|---|---|---|
| 24 lobby records, `0x4c` bytes | `DAT_004414c4[i*2]`, i < 0x18; +0 team word, +0xe name, +0x2e clan tag, +0x3e team slot | `FUN_002c4500` L165621-165660; `FUN_002c5450` L166234 |
| team words `0x40000001` / `0x80000100` | SEALs / Terrorists while `DAT_004412d8` (sides swapped) is 0; swap when 1; `0x10000` bit = spectator | `FUN_002c4500` L165635-165655; lists `FUN_002c4b50` (first = `BSEALLISTVAR`) |
| 8 a team | "too big" at 9 or more (`mp_teams_too_big` = 1); switches and joins refuse at 8 | `FUN_002c4500` L165660; `FUN_002c4290` L165534, L165551 |
| team slot = lowest free 0..7 | `+0x3e` = first index with no teammate (`FUN_002c4810` terror / `FUN_002c4a20` SEAL, -1 when full) | L165718-165811, L165812-165900 |
| MaxPlayersValve default 16 | join refused ("Too many players", code 3) when SEALs + Terrorists >= it | `FUN_002bc620` L161329-161334; `FUN_002f83b0` L197194 |
| MaxSpectatorsValve default 8 | refused at it ("Too many spectators", code 2); 8, or 4 in a ladder game | L161397-161401; `FUN_002f83b0` L197370-197385; `FUN_002baf30` L160324 |
| host's own team | SEALs, unless the clan option is "Terrorist team" or the host spectates | `FUN_002c5450` L166238-166262; frame `A_55` (host socomp under SEALS) |
| joiner's team (no clan option) | Terrorists if Terrorists < SEALs, or SEALs = 8, or both empty; else SEALs (ties to SEALs); refused if the chosen side is full | `FUN_002bc620` L161359-161395; frame `A_55` (joiner socomq under TERRORISTS) |
| clan options | 1 "Terrorist team", 2 "SEAL team" (clan's members forced), 3 "Members only" (others refused, code 4 "Closed clan game"), 4 "Alternate teams" (swap each full game) | `FUN_002bc620` L161256-161299; UIMnLOC 264-272 |
| lobby SWITCH TEAMS | host toggles the record between teams if the other has < 8, re-slotting; no score or count condition | `FUN_002c4290` L165516-165570 (`FUN_002bae70` L160288) |
| "All Switch" | a registered network message whose handler (0x2badc0) returns 4 and does nothing, and which nothing sends -- not the swap (corrected 2026-10-14, research 309 R309.5); the swap's toggle of `DAT_004412d8` is `ClanGameSwapSides(FINISH)`'s, `FUN_002bada0` -> `FUN_002c0040`, reached only from that row | `FUN_0030cff0` L159141 (the registration); `FUN_002bada0` L160255 -> `FUN_002c0040` L162973; research 309 §4.2 |
| launch rule | "There must be players on both teams to launch": `mp_team_unbalance` = 1 while a team is empty (and neither too big) | `FUN_002c3cf0` L165325-165352; UIMnLOC 350, 356 |
| READY after 30 s | "The READY button will be available in 30 seconds" | UIMnLOC 350; `mp_prog_timer1` created at 30 (`FUN_002a76d0` L149587) [link inferred] |
| empty game | both teams empty mid-game with spectators left: `dlgNetAbandoned.rdr` | `FUN_002c4500` L165673-165676 |
| late joiner | "appear as a ghost ... wait until the next round" (game `+0xd2`); or spectate | UIMnLOC 352-353; `FUN_001f97b0` L57048 |

## 8. Scoring

Each client counts only its own local player's points (`param_2 == FUN_002b3580()` in every writer) and syncs them; deaths likewise. The scoreboard's SCORE = match `+0x580` + round `+0x5c8`; KILLS `+0x550` + `+0x598`; DEATHS `+0x556` + `+0x59e` (research 87 §12).

| event | stat | score | citation |
|---|---|---|---|
| kill of an enemy player | kills +1 (`+0x598`), `total_mp_kills` +1 | +2 (`+0x5c8`) | `FUN_00545290` L411473-411512, from `FUN_0059ee20` L458090 |
| suicide (killer == victim; a fall is one) | suicides (`+0x14`) +1 | -2 | `FUN_00545c90` L411872; L458084-458085; fall L464957-464959 |
| team kill (killer and victim share a `+200` team bit) | team kills (`+0x16` / `+0x5a2`) +1 | -2 | `FUN_00545c10` L411850; L458112-458113; via `FUN_0059ee20` L458059 |
| victim | deaths (`+0x12` / `+0x59e`) +1, whatever the cause | 0 | `FUN_00545d10` L411894; L458147, L464655 |
| kill of an escortee/hostage/VIP (victim `+200 & 0x20000`) | `+0x18` +1; `mp_hostages_by_seals`/`_turds` +1 | -2; in ESCORT a Terrorist +3 | `FUN_00545390` L411516-411547; L458117-458145 |
| team won the round (`mp_winner` = own team) | `+0x3e` +1 | +5 | `FUN_00545b10` L411806; `FUN_00223970` L76146-76160 |
| alive at the round's end | `+0x42` +1 | +1 | `FUN_00545b90` L411828; L76162-76165 |
| objective events (not suppression) | as listed | +3 (`FUN_00545480`, SEAL), +N (`FUN_00545530`), +2 (`FUN_005455d0`, `FUN_00545650`), +4/+2 (`FUN_00545750`, +4 in BREACH) | L411552-411700 |
| friendly hits counted | `stats+6` | -- | `FUN_005458a0` L411735 |
| no credit | a kill line and credit need the killer found as a player (`+0x10 == 2`); the victim's killer id `+0xfc4` is taken once | -- | `FUN_0059ee20` L458071-458076 |
| MP penalty | `mp_penalty` (0x3f1140) created and zeroed; script use not read | -- | L149589 |

Team score (`seals_team_score` / `terrs_team_score`, game `+0x74`/`+0x78`) = the sum of that team's players' round score `+0x5c8` plus game `+0x7c`/`+0x80`, which grow by 1 per live teammate of an objective scorer (`FUN_00544d60` L411238-411300; team pick L411264-411280); reset at mission start (L149718-149731) and at the MP exit (`FUN_002232a0` L75823-75834). It is not drawn on the scoreboard (the team line shows round wins).

## 9. Round and match

| setting | default / range | citation |
|---|---|---|
| create-game defaults | players 16; rounds 11 (9 if the valve is 0 at load); round time 6 minutes (choices 4-10, UIMnLOC 273-279; 300 s if 0 at load; seconds = menu x 60, clock ms x 1000); "Friendly Fire is disabled."; "Respawn is disabled." (UIMnLOC 249-250); spectators YES, no password | frame `A_49_creategame`; `FUN_002bc620` L161328-161332; `FUN_001f5e70` L55628-55631; L55621-55626; `FUN_002f83b0` L197274; `FUN_002a6c50` L149156 |
| score limit / kill limit | none exists: no valve in `global_valves.rdr`, no string ("limit", "frag", "kills to") | strings |
| match win | first team to `mp_half_rounds` = (`mp_max_rounds` + 1) >> 1 wins (6 of 11) [comparison itself not found] | `FUN_002a6c50` L149073-149082 |
| tie after the last round | "PLAYING TIEBREAKER ROUND" when (`mp_round_count` + 1) > `mp_max_rounds` | `FUN_001fb420` L57633-57648 |
| round result | valves `mp_score00`, `mp_score08` (round wins -> game `+0x120`/`+0x124`), `mp_winner` (0 SEALs, 8 Terrorists, 0x40 none -> `+0x128`); read 3.0 s after the round's end state; `mp_game_over` set -> state 6 else 4 (next round) | `FUN_002a9b30` L150629-150672; reset `FUN_002a72d0` L149250 |
| round-start banner | "STARTING ROUND %d OF %d" (%d = `mp_round_count` + 1, `mp_max_rounds`), scale 0.9 (`0x3f666666`, x 1.1429 in the window), centred, colour 0, the window's 7 s | `FUN_001fb420` L57633-57649 |
| help lines reset | the death/spectator lines' timer (`+0x1a0e8`) zeroed at round start | L57663 |
| lobby countdown | "GAME STARTS IN" n "SECONDS" (UIMnLOC 354-355); host may "Launch all players, ready or not" (359) | UIMnLOC |
| fade, second message | fade from black and "OBJECTIVE:" 5 s later | research 87 §8 (`A_ready021-034`) |

At match end (`FUN_00223970`, the MP exit state): stats folded into the match block, the three message windows cleared (L76084-76086); the stats upload `FUN_00225a00`/`FUN_00225070` runs only when respawn is off and not a ladder game (L76078-76082); in state 6 the timers reset and the lobby returns (L76134-76144). `A_rend050`'s "ROUND COMPLETE" screen (research 87 §12) is the round end, not in this capture. SUPPRESSION objective (mp51LOC 5100, research 87 §8): "ELIMINATE THE TERRORISTS" for the SEALs; what ends a SUPPRESSION round is a placeholder (§16).

## 10. Kill messages (the message window)

Posted by `FUN_00547860` (L412845, from `FUN_00547aa0` L412997) and `FUN_00547a90` (L412920, the cause set first), online only, into the main window `0x4366a0` at scale 0.9, colour 0 (128,128,128 a100), not centred (`FUN_002b6530(0,0x4366a0,text,0,0,0)` L412893, L412970). Victim `+0xfbc` = killer id (0xff: nothing posted), `+0xfc0` = cause (weapon id, or 0xfd = a fall; 0 or less: nothing posted).

| format (address) | when | arguments | citation |
|---|---|---|---|
| `"%s falls to their death"` (0x65c440) | cause 0xfd | the killer's name, i.e. the local player who fell | L412879-412880 |
| `"%s commits suicide with %s"` (0x65c460) | killer == victim, any weapon | victim name, weapon name | L412882-412885 |
| `"%s fragged %s with %s"` (0x65c480) | any other killer: enemy and team kills alike | killer, victim, weapon | L412887-412891 |
| (none) | escortee/VIP killed (`+200 & 0x20000`): auto comm 0x44 instead, which posts nothing either (PF-10: `KILL_AUTOCOMM_READING`) | -- | L412905-412913 |

- Weapon name = `FUN_003d19a0(id)` (L324284): 0xfd -> `"falling damage"` (0x3fd520); else the ZWEAPON record whose
  `+0x7c` id matches, its `DisplayName` (record `+8`, `FUN_003d2b30` in `FUN_003cda30` L322168); no match -> `"Unknown
  Weapon"` (0x3fc548, `FUN_003c4b90` L316452). DisplayName differs from the kit name for: Spas 12 "TA 12 GAUGE", 870
  "12 GAUGE PUMP", JACKHAMMER "M3 12 GAUGE", P228 "M11", SR-1 Gyurza "SP-10", F2000 "OICW", SA-80 A2 "IW-80 A2", KBP
  OTs-14 Groza "RA-14", Steyr Aug "STG 77", MP5K "HK5K", Dragunov "SASR", LAW "AT-4", Double Ammo Load "2X AMMO"; the
  rest print as named (M4A1, 552, M67, HE, AN-M8, Claymore, "PMN Mine", C4 ...).
- No headshot, grenade-specific or team-kill wording exists; no "killed" format string (research 87 §1.18).
- After the line, for a victim other than the local player: an automatic radio comm, 0x27 said by the killer when the
  victim is not on the local player's team, else 0x28 said by the victim (`FUN_005e7f20` L412898-412907). It posts
  nothing (web sprint 25 PF-10, a reading pending review): `FUN_005e7960` (D:L498028-498236) looks the comm up in the
  speaker's own character's `multiplayer` list, and no character of `character.rdr` lists 0x27, 0x28 or 0x44, so the
  line formats empty (0x662798) and neither a line nor a sound comes of it (`KILL_AUTOCOMM_READING`). The HudCLOC
  60555 "%s : Enemy Killed" / 60556 "%s : Man down" rows are `orders.rdr`'s table, which that lookup does not read.
- The dead player's own screen (offline only, `FUN_001f93c0` L56900-56976): "KILLED BY" (HudCLOC 60495) and the killer's
  name upper-cased, centred at y 25 and 25 + the line step. HudCLOC 60490-60494 ("YOU COMMITTED SUICIDE", "YOU WERE
  KILLED BY $1s WITH $2s" ...) have no reader by id (searched `0xec4a`-`0xec4e`).

## 11. Scoreboard (beyond research 87 §12)

| item | value | citation |
|---|---|---|
| rows per team | at most 8; excludes spectators, players with no name (`+0x14` = 0) and `+0xfd1` set [ghosts, inferred] | `FUN_0022de60` L80575-80620 |
| sort | score (`+0x580` + `+0x5c8`) descending, selection sort; ties keep list (join) order (strict `<`) | `FUN_00229d00` L78910-78941, L78929 |
| grouping | SEALs block on top (y0 104), TERRORISTS below (y0 267) | 87 §12; `FUN_0022cc10` L80018-80020 |
| dead rows | a player without `+0xe1` bit 4 has both colours x 0.6 (`0x3f19999a`), confirming 87's inference | `FUN_0022a290` L79022-79024 |
| spectator list | online: up to 8 spectator names, each cut with "-" to column width - 24 | `FUN_0022cc10` L80025-80062 |
| game details | type word by `+0x111`: 1 BREACH ... 5 SUPPRESSION (0x3e5828-0x3e5850) | L79741-79760 |
| rebuilt | every 1.0 s while SELECT is held (87 §12) | L79866 |
| console frame | none in the capture | -- |

## 12. Spectator and the help lines

**Selected r0004 supersession, 2026-10-21:** the ordinary own respawn-dead path uses the first widget for
Death/Inventory and the second for Action, with the other four blank. The second requires elapsed strictly more
than five seconds **and model alpha zero**; it reasserts alpha 100 every eligible frame after the shared help
update, so it survives the ordinary ten-second hold and half-second fade. This supersedes the general-lifetime
and respawn-on descriptions below for that selected path. The earlier r0001 citations are retained as provenance;
the fresh native branches and review are in [351](351-respawn-help-presentation.md) and
[352](352-r0004-respawn-code-check.md), sections 2 and 5. No original-runtime comparison is claimed.

The 6 help lines (x 324, baseline 380 + 18i, research 87 §1.18) are chosen by `FUN_001f7ff0` (L56515): local alive and viewing self: hidden; viewing someone else: `FUN_001f9f20`; dead offline: `FUN_001f93c0` (KILLED BY); dead online and not a spectator: viewing self `FUN_001f97b0`, else `FUN_001f9f20`; spectator: `FUN_001f9160` (L56563-56600). The earlier general lifetime reading is a 10.0 s hold, then a 0.5 s fade (L56544-56561); the selected r0004 respawn exception is above. `%c` is a pad glyph: 0xa6 = X (Default config), 0xb7 the Sure Shot alternative; 0xbd/0xbe the Inventory button (R2 in Default; HudCLOC 60488 says "R2"). Strings with a glyph inside are cut in the strings dump at the glyph; the leading text of those is unrecovered.

| state | lines (address) | citation |
|---|---|---|
| dead, respawn off | "You have died.  %c Select new weapons." (0x3e32e0); 0x3e3350 "...<glyph> directional buttons" + "to cycle through living teammates" (0x3e3380) | `FUN_001f97b0` L57000-57007 |
| dead, respawn on | selected r0004: line 1 Death/Inventory; line 2 after elapsed strictly greater than five seconds and zero model alpha, "Press the %c button to respawn.", reasserted alpha 100 beyond ordinary help fade | research 351/352 (native r0004); earlier r0001 string locations 0x3e3310 / 0x3e3330 and L57008-57030 retained as provenance |
| ghost (late joiner) | "You are a ghost.  You will play the next" / "round as a real player.  %c Select new" (0x3e31c0/0x3e31f0), then "weapons." or, respawn on and 5 s past, "Press the %c button to respawn." (0x3e3220; 0x3e3240 "weapons. Press the %c button to respawn." when the line fits) | L57047-57097 |
| viewing a teammate | "You have died.  Use the £ and ¯" (0x3e3430) / "directional buttons to cycle through" (0x3e3450) / "living teammates." (0x3e3410); ghost: 0x3e31c0 / "round as a real player.  Use the £ and" (0x3e33b0) / "¯ directional buttons to cycle through" (0x3e33e0) / 0x3e3410 (the leading texts read through `tools/elfImage.ts`, 2026-10-18, LATER 118: research 282 §8) | `FUN_001f9f20` L57146-57165 |
| spectator | "You are a spectator.  Use the directional" (0x3e30f0), "buttons to cycle through active players" (0x3e3120), 0x3e3150 "...<glyph> Use the Free-Motion", 0x3e3180 "...<glyph> Jump to visible players." | `FUN_001f9160` L56869-56872 |

> Superseded by research 244 §3 (2026-10-08): the spectator camera's state byte is the camera's +0xf4 (`FUN_0029b0c0` D:L142660) and reads **0 free** (`FUN_002964f0` D:L140442), **1 follow** (`FUN_00297410` D:L140957-140960), **2 scenic**; `FUN_002956e0` sets 0 for the local object and 1 for another actor (D:L139698-139704); X goes scenic -> free -> scenic and follow -> free -> follow, free the hub (`FUN_00295260` D:L139480-139530). The labels "0 follow, 1 free" here are kept as the record; the code is `packages/viewer/src/spectatorView.ts` (PT-19b). A reading (the decompilation, not measured running).

Spectator camera (`FUN_00295260` L139448): three modes in its byte 0: 0 follow a player, 1 free (the camera takes the local player, mode 6), 2 the map's scenic views (`FUN_002ab260` over `mission.rdr`'s `Scenic_Views`). Pad bytes +5 / +6 step the scenic view +1 / -1 (L139520, L139558); +10 toggles follow <-> free/scenic (L139477-139516); +7 "jump to visible player" = `FUN_00294f40` (L139348): the non-spectator nearest the view's centre line, preferring the nearer within 10 %. The dead (non-spectator) cycle only living teammates. Which physical buttons bytes +5/+6/+7/+10 are: `SPECTATOR_PAD_PLACEHOLDER`.

## 13. Player names

| value | meaning | citation |
|---|---|---|
| lobby name field | 32 bytes at record `+0xe` (`+0xe..+0x2d`) | `FUN_002c5450` L166266-166280 |
| in-game name | copied with a 0x1f limit into a 30-byte buffer, byte 30 zeroed: at most 30 characters kept | `FUN_005442c0` L410582-410590 |
| clan tag | 16 bytes at `+0x2e`, byte 15 zeroed: at most 15 characters; drawn "[clan]" on the scoreboard | L166284-166293; 87 §12 |
| blank / unset name | `PLAYERNAMEVAR` missing -> `"Player%d"` with the network index (0x3f2ab0, 0x65c310); the create path defaults to "Player" (0x3f25b8) | L166268-166271; L410582-410585; L159304-159309 |
| keyboard | on-screen: printable ASCII ``~!@#$%^&*()_+`1234567890-=[]\;',./qwerty..`` plus a TEAM key and an accented page (`äèî`) | frame `A_37_namekbd` |
| duplicates | resolved by the server: "already logged in" (UIMnLOC 543), "questionable content" (544), game names "already in use" (294) | UIMnLOC |
| entry-box length limit | not found (the screen's `.rdr` is in `READERX.ZAR`/`run/ui`, not in this disc subset); use 30 | `NAME_MAXLEN_PLACEHOLDER` |

*(Corrected 2026-10-01, PLAT-35, from the roadmap's "Corrections found on the way" 4: the 30 above is the **in-game
name** field, which redotcom's `net/lobby.ts` `NAME_MAX` cuts to; it is not the online persona's cap, which is **14**
characters -- the login keyboard's `MaxChars` for `_455_EnterPlayerName_MSG` (PC research 38, `kOskNameCap`). ONL-06
takes the 14.)*

## 14. Character types and default kits per map

Each map's `READERM.ZAR/chartype.rdr` lists four `navyseals` (Seal1-4), four `terrorists` (Terrorist1-4) and up to three `escortees`; `character.rdr` (READERC) resolves each through its base chain (`mpN_sealK : mp_sealK : mp_seal`, `mpN_terrorK : mp_terrorK_<region> : mp_terror`) to a `model_name` and `default_weapons` in slot order primary, secondary, then three equipment slots. Players pick SEAL 1-4 / TERRORIST 1-4 in the lobby ARMORY (UIMnLOC 6-14, 30-37) and may change the kit there; up to 8 players share 4 types. The type a player gets without choosing: SEAL 1 / TERRORIST 1 (research 95 R95.5, which answers `DEFAULT_CHARTYPE_PLACEHOLDER`; web sprint 5 S2 makes each type selectable, its own body, kit and hit volumes, research 95 §6). The name-to-type lookup is `FUN_0053b4b0` (L405168; `chartype.rdr` `navyseals`/`terrorists`/`escortees`). Weapons the map allows each side: `mission.rdr` `Valves` `Enable_<weapon>` 1 SEAL, 8 Terrorist, 9 both, 0 none. Kit patterns across maps: SEAL 1 M4A1 + Mark 23 + M67/HE/AN-M8 + Double Ammo Load or C4; SEAL 2 870 + Mark 23 (226 on MP7); SEAL 3 HK5 + Mark 23 (Groza + SR-1 on MP81-83); SEAL 4 SR-25 + Mark 23 + Claymore (MP5K/P228, M63A, SA-80/P228, AK-105/SR-1 on the 5x-8x maps). Terrorist 1 552 + M9 (M82A1A + Model 18 on MP62); 2 Spas 12 + DE .50 (F57/M9 variants) + PMN; 3 F90 + F57 (Model 18/DE .50); 4 M82A1A + Model 18 (Steyr Aug, AK-47 + DE .50, 552SD + DE .50 variants).

### MP1 Blizzard (DEMOLITION)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp1_seal1 (`seal_A_arc`) | M4A1 / Mark 23 / M67, HE, Double Ammo Load | mp1_terror1 (`al_arctic02`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp1_seal2 (`seal_E_arctic`) | 870 / Mark 23 / M67, AN-M8, Double Ammo Load | mp1_terror2 (`al_gman01`) | Spas 12 / DE .50 / M67, AN-M8, PMN Mine |
| 3 | mp1_seal3 (`seal_A_arc`) | HK5 / Mark 23 / M67, HE, Double Ammo Load | mp1_terror3 (`al_kola`) | F90 / F57 / M67, HE, PMN Mine |
| 4 | mp1_seal4 (`seal_A_arc`) | SR-25 / Mark 23 / M67, Claymore, AN-M8 | mp1_terror4 (`al_gman02`) | M82A1A / Model 18 / M67, PMN Mine, HE |
### MP2 Frostfire (SUPPRESSION)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp2_seal1 (`seal_A_scuba`) | M4A1 / Mark 23 / M67, HE, Double Ammo Load | mp2_terror1 (`al_gman01`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp2_seal2 (`seal_E_scuba`) | 870 / Mark 23 / M67, AN-M8, Double Ammo Load | mp2_terror2 (`al_gman02`) | Spas 12 / DE .50 / M67, AN-M8, PMN Mine |
| 3 | mp2_seal3 (`seal_D_scuba`) | HK5 / Mark 23 / M67, HE, Double Ammo Load | mp2_terror3 (`al_leader`) | F90 / F57 / M67, HE, PMN Mine |
| 4 | mp2_seal4 (`seal_C_scuba`) | SR-25 / Mark 23 / M67, Claymore, Double Ammo Load | mp2_terror4 (`al_captain`) | M82A1A / Model 18 / M67, PMN Mine, HE |
### MP5 Abandoned (SUPPRESSION)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp5_seal1 (`seal_A`) | M4A1 / Mark 23 / M67, HE, Double Ammo Load | mp5_terror1 (`thai_terrorist02`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp5_seal2 (`seal_E_jungle_flak`) | 870 / Mark 23 / M67, AN-M8, Double Ammo Load | mp5_terror2 (`thai_terrorist01`) | Spas 12 / DE .50 / M67, AN-M8, PMN Mine |
| 3 | mp5_seal3 (`seal_C`) | HK5 / Mark 23 / M67, HE, Double Ammo Load | mp5_terror3 (`thai_adv02`) | F90 / F57 / M67, HE, PMN Mine |
| 4 | mp5_seal4 (`seal_D`) | SR-25 / Mark 23 / M67, Claymore, Double Ammo Load | mp5_terror4 (`thai_leader`) | M82A1A / Model 18 / M67, PMN Mine, HE |
### MP6 Desert Glory (EXTRACTION) -- escortees: mp_fem1 (`thai_biologist01`), mp_fem2 (`thai_biologist02`), mp_fem3 (`thai_wife`)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp6_seal1 (`seal_A_des`) | M4A1 / Mark 23 / M67, HE, C4 | mp6_terror1 (`afg_taliban03_mp`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp6_seal2 (`seal_E_desert_flak`) | 870 / Mark 23 / Double Ammo Load, AN-M8, C4 | mp6_terror2 (`afg_ter02_mp`) | Spas 12 / DE .50 / M67, AN-M8, PMN Mine |
| 3 | mp6_seal3 (`seal_C_des_flak`) | HK5 / Mark 23 / M67, HE, C4 | mp6_terror3 (`afg_taliban04_mp`) | F90 / F57 / M67, HE, PMN Mine |
| 4 | mp6_seal4 (`seal_D_des`) | SR-25 / 226 / M67, Claymore, C4 | mp6_terror4 (`afg_taliban05_mp`) | M82A1A / Model 18 / M67, PMN Mine, HE |
### MP7 Night Stalker (DEMOLITION)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp7_seal1 (`seal_A_des`) | M4A1 / Mark 23 / M67, HE, Double Ammo Load | mp7_terror1 (`afg_taliban03_mp`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp7_seal2 (`seal_E_desert_flak`) | 870 / 226 / M67, AN-M8, Double Ammo Load | mp7_terror2 (`afg_ter02_mp`) | Spas 12 / DE .50 / M67, AN-M8, PMN Mine |
| 3 | mp7_seal3 (`seal_C_des_flak`) | HK5 / Mark 23 / M67, HE, Double Ammo Load | mp7_terror3 (`afg_taliban04_mp`) | F90 / F57 / M67, HE, PMN Mine |
| 4 | mp7_seal4 (`seal_D_des`) | SR-25 / Mark 23 / M67, Claymore, Double Ammo Load | mp7_terror4 (`afg_taliban05_mp`) | M82A1A / Model 18 / M67, PMN Mine, HE |
### MP8 Rat'S Nest (SUPPRESSION)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp8_seal1 (`seal_A_des`) | M4A1 / Mark 23 / M67, HE, Double Ammo Load | mp8_terror1 (`afg_taliban03_mp`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp8_seal2 (`seal_E_desert_flak`) | 870 / Mark 23 / M67, AN-M8, Double Ammo Load | mp8_terror2 (`afg_ter02_mp`) | Spas 12 / DE .50 / M67, AN-M8, PMN Mine |
| 3 | mp8_seal3 (`seal_C_des_flak`) | HK5 / Mark 23 / M67, HE, Double Ammo Load | mp8_terror3 (`afg_taliban04_mp`) | F90 / F57 / M67, HE, PMN Mine |
| 4 | mp8_seal4 (`seal_D_des`) | SR-25 / Mark 23 / M67, Claymore, Double Ammo Load | mp8_terror4 (`afg_taliban05_mp`) | M82A1A / Model 18 / M67, PMN Mine, HE |
### MP9 Bitter Jungle (DEMOLITION)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp9_seal1 (`seal_A`) | M4A1 / Mark 23 / M67, HE, Double Ammo Load | mp9_terror1 (`con_merc03`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp9_seal2 (`seal_E_jungle_flak`) | 870 / Mark 23 / M67, AN-M8, Double Ammo Load | mp9_terror2 (`con_cook`) | Spas 12 / DE .50 / M67, AN-M8, PMN Mine |
| 3 | mp9_seal3 (`seal_C`) | HK5 / Mark 23 / M67, HE, Double Ammo Load | mp9_terror3 (`con_leader`) | F90 / F57 / M67, HE, PMN Mine |
| 4 | mp9_seal4 (`seal_D`) | SR-25 / Mark 23 / M67, Claymore, Double Ammo Load | mp9_terror4 (`con_torturer_mp`) | M82A1A / Model 18 / M67, PMN Mine, HE |
### MP10 Blood Lake (EXTRACTION) -- escortees: mp_pow1 (`con_pow01`), mp_pow2 (`con_pow02`), mp_pow3 (`con_pow01`)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp10_seal1 (`seal_A`) | M4A1 / Mark 23 / M67, HE, Double Ammo Load | mp10_terror1 (`con_merc03`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp10_seal2 (`seal_E_jungle_flak`) | 870 / Mark 23 / M67, AN-M8, Double Ammo Load | mp10_terror2 (`con_cook`) | Spas 12 / DE .50 / M67, AN-M8, PMN Mine |
| 3 | mp10_seal3 (`seal_C`) | HK5 / Mark 23 / M67, HE, Double Ammo Load | mp10_terror3 (`con_leader`) | F90 / F57 / M67, HE, PMN Mine |
| 4 | mp10_seal4 (`seal_D`) | SR-25 / Mark 23 / M67, Claymore, Double Ammo Load | mp10_terror4 (`con_torturer_mp`) | M82A1A / Model 18 / M67, PMN Mine, HE |
### MP11 Death Trap (EXTRACTION) -- escortees: mp_pow1 (`con_pow01`), mp_pow2 (`con_pow02`), mp_pow3 (`con_pow01`)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp11_seal1 (`seal_A`) | M4A1 / Mark 23 / M67, HE, C4 | mp11_terror1 (`con_merc03`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp11_seal2 (`seal_E_jungle_flak`) | 870 / Mark 23 / HE, Double Ammo Load, C4 | mp11_terror2 (`con_cook`) | Spas 12 / DE .50 / M67, AN-M8, PMN Mine |
| 3 | mp11_seal3 (`seal_C`) | HK5 / Mark 23 / M67, HE, C4 | mp11_terror3 (`con_leader`) | F90 / F57 / M67, HE, PMN Mine |
| 4 | mp11_seal4 (`seal_D`) | SR-25 / Mark 23 / M67, Claymore, C4 | mp11_terror4 (`con_torturer_mp`) | M82A1A / Model 18 / M67, PMN Mine, HE |
### MP12 The Ruins (DEMOLITION)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp12_seal1 (`seal_A`) | M4A1 / Mark 23 / M67, HE, Double Ammo Load | mp12_terror1 (`thai_terrorist02`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp12_seal2 (`seal_E_jungle_flak`) | 870 / Mark 23 / M67, AN-M8, Double Ammo Load | mp12_terror2 (`thai_terrorist01`) | Spas 12 / DE .50 / M67, AN-M8, PMN Mine |
| 3 | mp12_seal3 (`seal_C`) | HK5 / Mark 23 / M67, HE, Double Ammo Load | mp12_terror3 (`thai_adv02`) | F90 / F57 / M67, HE, PMN Mine |
| 4 | mp12_seal4 (`seal_D`) | SR-25 / Mark 23 / M67, Claymore, Double Ammo Load | mp12_terror4 (`thai_leader`) | M82A1A / Model 18 / M67, PMN Mine, HE |
### MP51 Vigilance (SUPPRESSION)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp51_seal1 (`seal_B_woodland`) | M4A1 / Mark 23 / AN-M8, Double Ammo Load, C4 | mp51_terror1 (`alban_Castrioti`) | 552 / M9 / M67, Double Ammo Load, C4 |
| 2 | mp51_seal2 (`seal_E_woodland`) | 870 / Mark 23 / M67, Double Ammo Load, C4 | mp51_terror2 (`alban_foreman`) | Spas 12 / F57 / HE, PMN Mine, C4 |
| 3 | mp51_seal3 (`seal_C_woodland`) | HK5 / Mark 23 / HE, Double Ammo Load, C4 | mp51_terror3 (`alban_Rugova`) | F90 / Model 18 / M67, PMN Mine, C4 |
| 4 | mp51_seal4 (`SAS_01`) | MP5K / P228 / M67, Claymore, C4 | mp51_terror4 (`alban_Pius`) | Steyr Aug / Model 18 / M67, PMN Mine, C4 |
### MP52 The Mixer (ESCORT) -- escortees: mp_algerian_h1 (`alg_UN01`), mp_algerian_h2 (`alg_UN02`), mp_algerian_h3 (`alg_UNworker`)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp52_seal1 (`seal_B_woodland`) | M4A1 / Mark 23 / AN-M8, M67, Double Ammo Load | mp52_terror1 (`alban_Castrioti`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp52_seal2 (`seal_E_woodland`) | 870 / Mark 23 / M67, HE, Double Ammo Load | mp52_terror2 (`alban_foreman`) | Spas 12 / F57 / HE, PMN Mine, Double Ammo Load |
| 3 | mp52_seal3 (`seal_C_woodland`) | HK5 / Mark 23 / AN-M8, HE, Double Ammo Load | mp52_terror3 (`alban_Rugova`) | F90 / Model 18 / M67, PMN Mine, Double Ammo Load |
| 4 | mp52_seal4 (`SAS_01`) | MP5K / P228 / M67, Claymore, Double Ammo Load | mp52_terror4 (`alban_Pius`) | Steyr Aug / Model 18 / M67, PMN Mine, Double Ammo Load |
### MP53 Foxhunt (ESCORT) -- escortees: mp_algerian_h1 (`alg_UN01`), mp_algerian_h2 (`alg_UN02`), mp_algerian_h3 (`alg_UNworker`)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp53_seal1 (`seal_B_woodland_LO`) | M4A1 / Mark 23 / M67, AN-M8, Double Ammo Load | mp53_terror1 (`alban_Castrioti`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp53_seal2 (`seal_E_woodland_LO`) | 870 / Mark 23 / M67, HE, Double Ammo Load | mp53_terror2 (`alban_foreman`) | Spas 12 / F57 / M67, HE, PMN Mine |
| 3 | mp53_seal3 (`seal_C_woodland_LO`) | HK5 / Mark 23 / M67, HE, Double Ammo Load | mp53_terror3 (`alban_Rugova`) | F90 / Model 18 / M67, PMN Mine, HE |
| 4 | mp53_seal4 (`SAS_01`) | MP5K / P228 / M67, Claymore, Double Ammo Load | mp53_terror4 (`alban_Pius`) | Steyr Aug / Model 18 / M67, HE, PMN Mine |
### MP61 Sujo (BREACH)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp61_seal1 (`seal_A_tiger_jungle`) | M4A1 / Mark 23 / M67, AN-M8, C4 | mp61_terror1 (`braz_ter02`) | 552 / Model 18 / M67, PMN Mine, Double Ammo Load |
| 2 | mp61_seal2 (`seal_E_tiger_jungle`) | 870 / Mark 23 / M67, Double Ammo Load, C4 | mp61_terror2 (`braz_Lucimar`) | Spas 12 / M9 / M67, HE, Double Ammo Load |
| 3 | mp61_seal3 (`seal_C_tiger_jungle`) | HK5 / Mark 23 / M67, Double Ammo Load, C4 | mp61_terror3 (`braz_butcher`) | F90 / DE .50 / M67, HE, Double Ammo Load |
| 4 | mp61_seal4 (`seal_Marcela`) | M63A / Mark 23 / M67, HE, C4 | mp61_terror4 (`braz_leader`) | AK-47 / DE .50 / M67, PMN Mine, Double Ammo Load |
### MP62 Enowapi (BREACH)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp62_seal1 (`seal_A_tiger_jungle`) | M4A1 / Mark 23 / M67, AN-M8, C4 | mp62_terror1 (`braz_ter02`) | M82A1A / Model 18 / M67, PMN Mine, Double Ammo Load |
| 2 | mp62_seal2 (`seal_E_tiger_jungle`) | 870 / Mark 23 / M67, Double Ammo Load, C4 | mp62_terror2 (`braz_Lucimar`) | Spas 12 / M9 / M67, HE, Double Ammo Load |
| 3 | mp62_seal3 (`seal_C_tiger_jungle`) | HK5 / Mark 23 / M67, Double Ammo Load, C4 | mp62_terror3 (`braz_butcher`) | F90 / DE .50 / M67, HE, Double Ammo Load |
| 4 | mp62_seal4 (`seal_Marcela`) | M63A / Mark 23 / M67, Double Ammo Load, C4 | mp62_terror4 (`braz_leader`) | AK-47 / DE .50 / M67, PMN Mine, Double Ammo Load |
### MP64 Shadow Falls (SUPPRESSION)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp64_seal1 (`seal_A_tiger_jungle`) | M4A1 / Mark 23 / M67, AN-M8, Double Ammo Load | mp64_terror1 (`braz_ter02`) | 552 / Model 18 / M67, PMN Mine, Double Ammo Load |
| 2 | mp64_seal2 (`seal_E_tiger_jungle`) | 870 / Mark 23 / M67, AN-M8, Double Ammo Load | mp64_terror2 (`braz_Lucimar`) | Spas 12 / M9 / M67, HE, Double Ammo Load |
| 3 | mp64_seal3 (`seal_C_tiger_jungle`) | HK5 / Mark 23 / M67, HE, Double Ammo Load | mp64_terror3 (`braz_butcher`) | F90 / DE .50 / M67, HE, Double Ammo Load |
| 4 | mp64_seal4 (`seal_Marcela`) | M63A / Mark 23 / M67, HE, Double Ammo Load | mp64_terror4 (`braz_leader`) | AK-47 / DE .50 / M67, PMN Mine, Double Ammo Load |
### MP71 Fish Hook (EXTRACTION) -- escortees: mp_algerian_h1 (`alg_UN01`), mp_algerian_h2 (`alg_UN02`), mp_algerian_h3 (`alg_UNworker`)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp71_seal1 (`seal_A_des`) | M4A1 / Mark 23 / M67, AN-M8, C4 | mp71_terror1 (`alg_ter01`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp71_seal2 (`seal_E_desert_flak`) | 870 / Mark 23 / AN-M8, Double Ammo Load, C4 | mp71_terror2 (`alg_ter03`) | Spas 12 / DE .50 / M67, HE, Double Ammo Load |
| 3 | mp71_seal3 (`seal_D_des_flak`) | HK5 / Mark 23 / M67, HE, C4 | mp71_terror3 (`alg_ter02`) | F90 / F57 / M67, HE, Double Ammo Load |
| 4 | mp71_seal4 (`SAS_01`) | SA-80 A2 / P228 / M67, Claymore, C4 | mp71_terror4 (`alg_officer`) | 552SD / DE .50 / M67, PMN Mine, Double Ammo Load |
### MP72 Crossroads (DEMOLITION)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp72_seal1 (`seal_A_des`) | M4A1 / Mark 23 / M67, AN-M8, Double Ammo Load | mp72_terror1 (`alg_ter01`) | 552 / M9 / M67, HE, PMN Mine |
| 2 | mp72_seal2 (`seal_E_desert_flak`) | 870 / Mark 23 / AN-M8, Double Ammo Load, HE | mp72_terror2 (`alg_ter03`) | Spas 12 / DE .50 / M67, HE, Double Ammo Load |
| 3 | mp72_seal3 (`seal_D_des_flak`) | HK5 / Mark 23 / M67, HE, Double Ammo Load | mp72_terror3 (`alg_ter02`) | F90 / F57 / M67, HE, Double Ammo Load |
| 4 | mp72_seal4 (`SAS_01`) | SA-80 A2 / P228 / M67, Claymore, HE | mp72_terror4 (`alg_officer`) | 552SD / DE .50 / M67, PMN Mine, Double Ammo Load |
### MP73 Sandstorm (BREACH)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp73_seal1 (`seal_A_des`) | M4A1 / Mark 23 / M67, AN-M8, C4 | mp73_terror1 (`alg_ter01`) | 552 / M9 / M67, PMN Mine, Double Ammo Load |
| 2 | mp73_seal2 (`seal_E_desert_flak`) | 870 / Mark 23 / AN-M8, Double Ammo Load, C4 | mp73_terror2 (`alg_ter03`) | Spas 12 / DE .50 / M67, HE, Double Ammo Load |
| 3 | mp73_seal3 (`seal_D_des_flak`) | HK5 / Mark 23 / M67, HE, C4 | mp73_terror3 (`alg_ter02`) | F90 / F57 / M67, HE, Double Ammo Load |
| 4 | mp73_seal4 (`SAS_01`) | SA-80 A2 / P228 / M67, Claymore, C4 | mp73_terror4 (`alg_officer`) | 552SD / DE .50 / M67, PMN Mine, Double Ammo Load |
### MP81 Chain Reaction (SUPPRESSION)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp81_seal1 (`seal_A_scuba`) | M4A1 / Mark 23 / M67, AN-M8, Double Ammo Load | mp81_terror1 (`rus_snowter01`) | 552 / M9 / M67, HE, Double Ammo Load |
| 2 | mp81_seal2 (`seal_E_scuba`) | 870 / Mark 23 / M67, AN-M8, Double Ammo Load | mp81_terror2 (`rus_snowter03`) | Spas 12 / DE .50 / M67, HE, Double Ammo Load |
| 3 | mp81_seal3 (`Spetsnaz`) | KBP OTs-14 Groza / SR-1 Gyurza / M67, HE, Double Ammo Load | mp81_terror3 (`rus_ter01`) | F90 / F57 / M67, HE, Double Ammo Load |
| 4 | mp81_seal4 (`rus_specialist`) | AK-105 / SR-1 Gyurza / M67, Claymore, Double Ammo Load | mp81_terror4 (`rus_Valeska`) | Steyr Aug / Model 18 / M67, PMN Mine, Double Ammo Load |
### MP82 Guidance (ESCORT) -- escortees: mp_vip1 (`rus_escort01`), mp_vip2 (`rus_escort03`), mp_vip3 (`rus_escort03`)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp82_seal1 (`seal_A_arc`) | M4A1 / Mark 23 / M67, AN-M8, C4 | mp82_terror1 (`rus_snowter01`) | 552 / M9 / M67, PMN Mine, Double Ammo Load |
| 2 | mp82_seal2 (`seal_E_arctic`) | 870 / Mark 23 / M67, Double Ammo Load, C4 | mp82_terror2 (`rus_snowter03`) | Spas 12 / DE .50 / M67, HE, Double Ammo Load |
| 3 | mp82_seal3 (`Spetsnaz`) | KBP OTs-14 Groza / SR-1 Gyurza / M67, HE, C4 | mp82_terror3 (`rus_ter01`) | F90 / F57 / M67, HE, Double Ammo Load |
| 4 | mp82_seal4 (`rus_specialist`) | AK-105 / SR-1 Gyurza / M67, Claymore, C4 | mp82_terror4 (`rus_Valeska`) | Steyr Aug / Model 18 / M67, PMN Mine, Double Ammo Load |
### MP83 Requiem (DEMOLITION)
| slot | SEAL type (`model`) | SEAL kit: primary / secondary / equipment | Terrorist type (`model`) | Terrorist kit |
|---|---|---|---|---|
| 1 | mp83_seal1 (`seal_A_arc`) | M4A1 / Mark 23 / M67, AN-M8, C4 | mp83_terror1 (`rus_snowter01`) | 552 / M9 / M67, PMN Mine, C4 |
| 2 | mp83_seal2 (`seal_E_arctic`) | 870 / Mark 23 / M67, Double Ammo Load, C4 | mp83_terror2 (`rus_snowter03`) | Spas 12 / DE .50 / M67, Double Ammo Load, C4 |
| 3 | mp83_seal3 (`Spetsnaz`) | KBP OTs-14 Groza / SR-1 Gyurza / M67, HE, C4 | mp83_terror3 (`rus_ter01`) | F90 / F57 / M67, HE, C4 |
| 4 | mp83_seal4 (`rus_specialist`) | AK-105 / SR-1 Gyurza / M67, Claymore, C4 | mp83_terror4 (`rus_Valeska`) | Steyr Aug / Model 18 / M67, PMN Mine, C4 |

## 15. The original's network authority (who decided hits)

| function | role | mode |
|---|---|---|
| `FUN_005abbc0` | round hits actor -> part; in MP only for rounds flagged local (`proj+4` bit 2) | both; MP guard L464698 |
| `FUN_005a5a80` L461552 | MP: sends `FUN_005a1ff0` -> `FUN_002bbda0` msg 0x40 (dmg byte, piercing x20, shooter, victim, part 4 bits); applies locally only if victim is local | MP |
| `FUN_005a1b80` L459488 (from L160838) | receiver: applies the message's damage (pellets for shotguns) | MP |
| `FUN_002be150` L162326-162346 | receiver of part-health sync (6 bytes /255) | MP |
| `FUN_005ac070`, `FUN_005ac1f0` | explosion / fall damage, victim-local | both |
| `FUN_00592560`, `FUN_00598b90`, `FUN_00599b60`, `FUN_002b8100`, `FUN_002b7ee0`, `FUN_001f97b0` | MP death wait, respawn, spawn pick, prompt | MP respawn |
| `FUN_005994a0` L455401 | SP restart at a checkpoint | SP |
| `FUN_005a0950` TEAMMATE_* death lists, `FUN_005a33b0` groans | | SP |

Bullets are resolved on the shooter's console and sent as a damage message; explosions and falls on the victim's;
score and death counts on the local player's own console (§8). For the server: compute §1.1 once on the server, keep
`(part, damage, piercing)` as the message, apply §1.4 and §3 there, and broadcast part health; this replaces the
shooter/victim split above.

## 16. Placeholders

Neither note could read `.data` (no ELF). Deduplicated from both notes. A name marked *note only* is a gap in the
research that no code carries; the others are constants in the viewer or the server (`tools/test/placeholderLedger.test.ts`
holds the two lists in step).

| name | stands for / searched | status |
|---|---|---|
| `RESPAWN_POINT_PLACEHOLDER` (91b) | where a respawned player is placed; searched `FUN_00598b90`, `FUN_00599b60` (copies the old matrix), strings "respawn", "respawn_setup" (0x65b0e8, an AI script key), "on_respawn" (AI); `PlayerStart`/`spectator` readers not traced | resolved by 91a: `FUN_002b7ee0` farthest-from-nearest-enemy on flag-bit-4 `AIMAPS.MPS` records (§4.2) |
| `FRIENDLY_FIRE_DEFAULT_PLACEHOLDER` (91a) | host-menu default; searched writers of `0x3f2860`/`0x3f5940`/`0x3f6230`/`0x3f1220` (only copies from the settings struct, `FUN_002e34d0` L197221) | resolved by 91b: the create-game screen reads "Friendly Fire is disabled." (`A_49_creategame`) |
| `RESPAWN_OPTION_DEFAULT_PLACEHOLDER` (91a) | as above for respawn | resolved by 91b: "Respawn is disabled." (`A_49`, UIMnLOC 249-250) |
| `RESPAWN_WAIT_CAMERA_PLACEHOLDER` (91a) | camera during the respawn wait (no call in `FUN_005979a0`) | resolved 2026-09-29: the death camera, `FUN_00297a30` (141072-141290) set up by `FUN_002980d0` (141292-141376) when the player's actor reaches state 8 (`FUN_00297410` 140900-140913). Network game: mode 3 with a killer (`actor+0xfc4`), the orbit swinging the eye to the body's far side from the killer at `1.30875 x sin` rad/s (141213-141214), the eye eased to 20 up and pushed x 2.05 while under 56 across (141282-141286), the look blending to the killer over 1 s (141051-141066); mode 6 with none (suicide, fall), the orbit turning at 0.8725 rad/s (141217); the tilt clamped to [-1, -0.2] rad for the dead (141242-141252); reset by `FUN_00299150` (141652-141662). Viewer: `packages/viewer/src/deathCamera.ts` |
| `DEATH_ORBIT_EULER_READING` (2026-09-29) | `FUN_003083c0(m, (tilt, yaw, 0))`'s rotation order, not read | reading: the tilt about x, then the turn about y; with it the mode-3 formula's sign brings the eye to the killer's far side |
| `DEATH_STICK_TILT_READING` (2026-11-09, DEATHCAM-MANUAL) | what drives the death camera's state-7 tilt, controller `+0x14` (`FUN_00297a30` D:L141142, D:L141221; the takeover reads it too, `FUN_002980d0` D:L141611-141613): no writer found in the controller code (D:L449000-456000 searched; `FUN_005966a0` hands the pitch to `FUN_00594600` and keeps only the raw pitch axis at `+0x138`) | reading (DEATHCAM-MANUAL's review PASS WITH FINDINGS, high, per the merge 25899c6d0): `'pitch axis'` -- the look stick's pitch axis (`LookState.axis[1]`, up positive), tilting the orbit at 2 x the axis a second within the dead's clamp [-1, -0.2]; the other candidate is never written (the dead view only turns). Settled by a full cross-reference of the writes to controller `+0x14`; or a PCSX2 capture (one online game, the default controller config, 60 fps, the pad logged): dead at state 7, the right stick full up for 1 s, then full down for 1 s -- does the view tilt, which way, at what rate, stopping at the clamp (at most 0.8 rad, -0.2 to -1); a memory trace of `DAT_00416210` and controller `+0x14` across it settles it outright (viewer `deathCamera.ts`) |
| `DEATH_STICK_TURN_SIGN_READING` (2026-11-09, DEATHCAM-MANUAL) | the sense of the state-7 turn: `DAT_00416208 += +0x10 x 2 x dt` (D:L141220), `+0x10` the look's turn axis (`FUN_005966a0` D:L453858), the living turn `actor+0x48` (`FUN_00550ef0` D:L418340) | reading (DEATHCAM-MANUAL's review PASS WITH FINDINGS, high, per the merge 25899c6d0): `1` -- the port's left-positive look turn is `+0x10`'s sense, so a right push turns the view right as alive; full push 2 x 1.118 = 2.236 rad/s. Settled by a PCSX2 capture (as above): dead by one's own grenade, hands off (state 6 turns about 0.87 rad/s), then the right stick full right for exactly 1 s and released for 3 s -- expected about 2.24 rad (128 deg) in the stick's sense, then still, no spin resuming; record the direction; a memory trace of `DAT_00416208` and controller `+0x10` across it settles it outright (viewer `deathCamera.ts`) |
| `DEAD_LOOK_READING` (2026-09-29) | the dead's look: the dead's controller `FUN_00592560` (L451642-451730) reads the respawn press (and the cycle bytes) and runs no move or turn | reading: the dead body keeps its facing and the page's look does not turn it (`WalkMode.frame`); the room ticks the corpse with the stick at rest |
| `LIMB_SPILL_SCALE_PLACEHOLDER` / `LIMB_SPILL_PIERCING_PLACEHOLDER` (91a) | `DAT_006508a8` / `DAT_006508b0`, `.data`; read from `socom2_game.elf` at those addresses | resolved (section 20): 0.3 at piercing 10 |
| `FRAGMENT_PART_TABLE_PLACEHOLDER` (91a) | `DAT_006508e0` 6 thresholds, `DAT_006508d0` 6 parts; receiver's copy `DAT_00650900`/`DAT_006508f8`; `.data` | resolved (section 20): head 30 %, body 30 %, each limb 10 % |
| `SHOTGUN_PELLET_RANGE_SQ_PLACEHOLDER` (91a) | `DAT_006508b8` SP, `DAT_006508c0` MP 8 pellets, `DAT_006508c8` MP 4; `.data` | resolved (section 20): read, 2500, 6400, 22500; not used |
| `FRIENDLY_FIRE_ENFORCEMENT_PLACEHOLDER` (*note only*; 91a) | searched `DAT_0044cdb8`/`44cdb8`, team-mask tests (`+200 & +200`) in L455000-466000, `FUN_005abbc0`, `FUN_005a5a80`, `FUN_005a1b80`; reCOM has no friendly-fire code. Next: the net receive of msg 0x40 before `FUN_005a1b80` (L160800-160840) | open |
| `HEAD_NODE_NAMES_PLACEHOLDER` (*note only*; 91a) | strings at 0x65c4f8/0x65c500/0x65c508 under the strings dump's length cut; inferred `hips`, `head`, `neck` from research 78's skeleton | open (inferred) |
| `DEATH_SOUND_IDS_PLACEHOLDER` (*note only*; 91a) | 0x3c/0x3d not mapped to `CHRSND_*` names | resolved (research 179 §8.15; web sprint 25 PF-10, 2026-10-04, a reading pending review): 0x3c `CHRSND_DEATH`, 0x3d `CHRSND_DEATH_QUIET` (`FUN_0053c3a0` D:L405976-405979); the room's `kill` names the cause (`net/deaths.ts` `deathCause`), every page plays the victim character's slot at its body (`deathVoiceSlot`, `GameAudio.onDeath`). No multiplayer character names `CHRSND_DEATH_QUIET`, so a head shot is silent in a match (`FUN_0053b710`'s null slot, D:L405264-405266); and the six Algerian-cast maps' third terrorist (`mp_terror3_alg`, MP6/7/8/71/72/73) names `CHRSND_DEATH .DEATH`, which no bank holds and nothing in `sounds.rdr` files, nor its fallback `DEATH_SOUNDS`, so his death is silent too (`FUN_0053c200` D:L405734-405784; research 81 section 7, 2026-10-05, a reading). The voice gate (PF-10's fix round): every health drop that leaves a body alive plays its `CHRSND_DAMAGE` (`FUN_005a54d0` L461394-461396 -> `FUN_005477a0` L412828-412838 -> `FUN_00597b00`, 0x3b at 1.0), and 0x3b, 0x3c and 0x3d share `FUN_0053b710`'s gate (actor `+0x424` 3.0 s, D:L405268-405290, run down by `FUN_00551ec0` D:L418483-418487): the room keeps it per body (`VOICE_GATE_S`), tells every page the hurt voice (`hurtVoice`, the faller's own page too: the landing plays no voice, research 205 section 2.2) and withholds a death voice within 3 s of one (`voiced: false`). Owed, not traced: another console takes the death's cause from the replicated part, not the victim's -- `FUN_005a5790` passes 3 for the head, 5 for the body, 0 for any other part (D:L461453-461461) -- and arms its gate on those per-part updates; the per-field update order could give a remote page another slot or gate than the room's, which sends every page the victim's |
| `RESPAWN_BUTTON_PLACEHOLDER` (*note only*; 91a) | `FUN_002c64e0(0,pad)` state 1; glyphs 0xa6/0xb7 not decoded | partly: 91b maps pad result 0 to `Action` (X in Default config) |
| `NET_DAMAGE_CLAMP_PLACEHOLDER` (*note only*; 91a) | `FUN_002bd220` bounds `DAT_003de728..750` | open |
| `STUN_EFFECT_PLACEHOLDER`, `RECOVERY_FACTOR_PLACEHOLDER` (*note only*; 91a) | readers of ammo `+0x10` and char `+0x2f8` not traced | open |
| `DOUBLE_AMMO_LOAD_PLACEHOLDER` (*note only*; 91a) | item 194: effect on the kit's magazines not traced | open |
| `MP_PENALTY_PLACEHOLDER` (*note only*; 91a) | `mp_penalty` (0x3f1140) created and zeroed (L149589); game-script use not read | open |
| `SPECTATOR_PAD_PLACEHOLDER` (91b) | buttons behind pad bytes +5, +6, +7, +10; searched `FUN_00295260`, `controller.rdr` (no spectator mappings); help-string glyphs cut | retired 2026-10-06 (web sprint 29, PF-31): the slots read (research 232 s5, `SPECTATOR_RELEASE_READING`), the page's last use gone in wave 4 |
| `NAME_MAXLEN_PLACEHOLDER` (*note only*; 91b) | the name keyboard's own limit; searched UIMnLOC/`UIXLOC`/`UIMPXLOC`, "maxlength" (only `messages.rdr`'s); buffers give 30 (name) and 15 (clan) | open (use 30) |
| `DEFAULT_CHARTYPE_PLACEHOLDER` (91b) | the type a player gets without choosing; searched `FUN_0053b4b0`, `UiCharType` (registered from `mission.rdr` `UiVehicles` online by `FUN_002af8c0`, offline by `FUN_002afa10`: research 95 §6 -- "SP only" was wrong), team slot `+0x3e` (0-7, no link found) | resolved (research 95 R95.5: SEAL 1 / TERRORIST 1; retired in web sprint 5 S2 as `DEFAULT_ARMORY_TYPE`) |
| `MATCH_WIN_COMPARE_PLACEHOLDER` (91b) | the test "round wins >= `mp_half_rounds`" and who sets `mp_game_over`, `mp_score00/08`, `mp_winner`; searched refs of 0x3f0fd8/0x3f0fe8/0x3f0ff8/0x3f0f88 (only reads and resets), "= 8" valve writes, type-5 branches | resolved (section 18.2.2: the MP51 `objectives` script) |
| `SUPPRESSION_ROUND_END_PLACEHOLDER` (91b) | what ends a SUPPRESSION round (elimination, clock) and which side wins on time; `mp_45_sec_clock`, `mp_x_sec_clock` created only (L149578-149586) | resolved (section 18.2.2: the MP51 `objectives` script) |
| `AUTOCOMM_TEXT_PLACEHOLDER` (*note only*; 91b) | text of comms 0x27/0x28/0x44; searched `FUN_005e7f20`; HudCLOC 60555-60561 candidates | resolved (web sprint 25 PF-10, 2026-10-04, a reading pending review): `FUN_005e7960` (D:L498028-498236) takes the text and the sound from the speaker's own character's `multiplayer` list, and no character of `character.rdr` lists 0x27, 0x28 or 0x44 -- `orders.rdr`'s table (`_60555_EnemyKilled_MSG`, `SND_ENEMY_DEAD`) is not that list -- so nothing is posted or played: `KILL_AUTOCOMM_READING` |
| `KILL_AUTOCOMM_READING` (web sprint 25 PF-10: `netPage.ts`) | the auto-comm after a kill (section 10): 0x27 by the killer when the victim is not on the local team, else 0x28 by the victim (`FUN_00547860` D:L412893-412909), looked up in the speaker character's `multiplayer` list (`FUN_005e7960`; `FUN_0053bbd0`, the record's `+0x3a0`, copied from its base at D:L406773-406793); with no row the line is empty (0x662798) and its length 0 (`FUN_00199288`, D:L498217) posts nothing | open (a reading: no character lists 0x27 or 0x28, so the page posts the kill line alone; a console frame after a kill would prove it) |
| `GHOST_ROW_PLACEHOLDER` (*note only*; 91b) | that `+0xfd1` (rows hidden from the scoreboard) is the ghost flag; `FUN_0022de60` L80608; `FUN_00223970` L76148 copies `+0xfd1` to `+0xfd2` | open (91a's `+0xd2` bit 0x10000 ghost test is a related but different field) |
| `CONE_WINDOW_PLACEHOLDER` (launch review, OWNER-3: the server's cone, `net/shotCone.ts`) | the ticks of the server's own run of `Accuracy` a round's cone may be matched against (6, 100 ms): the page ticks its bloom by frames (`main.ts` `gunFrame`), the server by commands; no game source -- the game has no server | open (a server tolerance) |
| `CONE_SLACK_PX_PLACEHOLDER` (launch review, OWNER-3) | reticle pixels (`kit+0x84c`'s units) the page's cone may stand off the server's (2): frame- against tick-sampled turn and pitch rates. Since PF-02 (2026-10-04) the page's and the room's `Accuracy` step on separate 30 Hz game-frame accumulators and may be a frame apart, so the slack applied is `coneSlackPx` = this + one game frame of the knock's return, derived from the stance record: `ReticuleKnockReturn x 525/15734` (4.34 px on the M4A1 standing). It is the smallest simple bound over every honest case the PF-02 review and its fix found (worst 3.18 px, a round every 2 commands; at most 1.40 px at cadences the fire rate allows); the size's own frame step is left out for the room's strictness (research 169; the controller's ruling). Since MISSION R8 both kits run continuously and the page stands at most a part-tick past the room at a round (at most 0.39 px measured at 144 Hz page frames, research 208 section 9): the slack is kept as the bound. `shotCone.test.ts` 'the page's own frames at 144 and 30 Hz ...' | open (a server tolerance; the derived part is not a placeholder) |
| `CONE_SWAY_BOX_ADAPTATION` (P13, 2026-11-02, the online-parity sweep's AR-1: `net/shotCone.ts`; an adaptation, the room's trust) | a scoped round's claim is checked against the whole box of the sway's limits -- +-`SniperDistLimit` at the most exertion (`AimMover.sway`), magnification 1 (`coneBox`) -- never the sway's point the page's round leaves at (`FUN_005bd100` D:L474217-474226, research 84 §8 and §17). The room trusts the page inside the box: a forged page places scoped rounds anywhere in it, at least three times an honest round's reach at a 3x scope and up to about eight at a low exertion (3 / 0.36: the sway steps only while the exertion is over 0.2, `FUN_005b9280` D:L472139, so its limits never close below 0.36 of the box); honest play untouched. Dead state under it: the room's exertion, `enterView` at the scope's edge and the set-change raise move nothing the scoped check reads, and `CONE_SCOPE_LEVEL_READING` (AR-8) feeds no verdict. No game source -- the game has no server | open (an adaptation): LATER 640 -- the scoped claim against the sway's point over the window, plus or minus a named slack divided by `lookScaleOf`, bound by honest-round tests at 30, 60 and 144 page frames a second; with it the set-change raise, `enterRaises` and the scope's level settled |
| `ROOT_POSE_SLACK_PLACEHOLDER` (launch review, OWNER-3) | units the body's posed root (the clips', which the page's camera stands on, `FUN_0029a950` via `FUN_002869d0`) may stand off the stance's measured root the server has (4: the standing jump lifts it 3.6); the server poses no skeleton | open |
| `RESPAWN_BLOCK_PLACEHOLDER` (`room.ts` `pick`) | **Narrowed by RSP-5, 2026-10-21:** original nonempty respawn lists use the client block, dead enemy bodies and first-record tie/no-enemy rules; all eligible original starts have width one and consume no RNG. Fresh r0004 code/data/implementation reading and review: [research 353](353-r0004-respawn-spawn-picker.md). | open only for missing respawn-data fallback, custom starts below 24 records and native RNG-stream equivalence for larger custom starts; original DME allocation/runtime comparison remains unmeasured |
| `VOTE_BAN_SCOPE_PLACEHOLDER` (`room.ts` `banned`, `VOTE_BAN_MS`) | how long a removed player is refused: the original refuses a rejoin to "that game" (section 17); a dedicated room never ends | open (10 minutes, two of the original's matches); 2026-10-10 (SVC-23): kept on H-next d's default -- the original's account refused that game with -972 (`FUN_002edba0` D:L190430) on its own ban request (`FUN_002f95f0` D:L197800-197804), the lobby's `banFromGame` not yet called, and what settles it (the owner; ONL-32's rejoin transcript): web research 263 sections 5.3 and 6 |
| `DEATH_NAME_PLACEHOLDER` (`net/deaths.ts`) | four `damanim.rdr` names with no clip of their own name -- "Die", "Death02", "Crawl death01", "Crawl death02"; searched `MOTION_P.ZAR`'s keys | retired 2026-10-05 (web sprint 28, PF-21): `animset.rdr`'s `GLOBAL` names them -- Die `death_stand_chest01`, Death02 `_chest02`, Crawl death01 `death_stand_groin02`, Crawl death02 `death_stand_groin01`: the order read here had the crawls swapped (research 179 §11.2, research 217 §4) |
| `HIT_VOLUMES_PLACEHOLDER` (`net/hitVolumes.ts` `placeholderVolumes`) | the hit volumes without a skeleton: the game hits the skeleton node the round meets (`FUN_005abbc0`, section 1.3) | fallback only: hand-laid capsules on the stances' heights, used when a map's skeleton did not load; `skeletonVolumes` poses the SEAL's own skeleton otherwise |
| `SPINELO_RADIUS_PLACEHOLDER` (`net/hitVolumes.ts`) | `spinelo`'s capsule radius: its `nparams` bbox is empty (it moves no vertex most; research 78 section 3), so none is measured | retired 2026-11-10 (BONE-BOXES, research 217 §3.6b): the hit volume is the bone's box, `spinelo`'s an empty one nothing enters; was open (2.0, between the hips' 1.65 and `spinehi`'s 2.1) |
| `QUEUE_TEXT_PLACEHOLDER` (`netPage.ts` `queueLine`) | the words for a spectator's place in line: the game has no queue (its 17th joiner is refused, section 7) | open (the viewer's words, in the game's message style) |
| `BODY_FADE_PLACEHOLDER` (`remotePlayers.ts`) | a dead body's fade (alpha 0.1 a second, `FUN_00552780`): the skinned material has no opacity yet | open (drawn whole, hidden at 10 s, when the fade would end) |
| `RADIO_MENU_PLACEHOLDER` (`netPage.ts`) | the radio menu's own look (TEAMMATES > a player > "VOTE RETAIN:REMOVE", section 17) | deferred (sprint 3): K opens the page's list in the message window, with the game's words |
| `CLAYMORE_PLACEHOLDER` (retired in web sprint 4 M7: the room sets the claymore down on a `throw` of it and off by its Detonator's, `room.ts` `placeCharge`/`detonate`) | the claymore in a match (placed, not thrown) | was deferred (sprint 3) |
| `KIT_PLACEHOLDER` (`room.ts` `THROWN`) | the throwables a SEAL carries in a match: the viewer's kit at each record's `capacity`; per-map kits are deferred | retired (web sprint 4, M3/M4): each player's kit is its character type's `default_weapons` (`viewer/src/loadout.ts`, research 94 R94.7), its firearms' records keyed by item id; the throwables' fixed pouch is `POUCH_PLACEHOLDER` (research 94) until M7 |
| `THROW_SLACK_READING` (review 2, M-8: `room.ts` `throwLaunchAllowed`) | how far a throw event's velocity may stand from the nearest launch the game's throw makes from the named hand at the command's frame (`throwVelocity`, `CZKit_TickExplosives` 0x5c2134-0x5c22d8, over the power 0..1 and the aim's clamp 0..55 degrees; at most `ComputeMaxVel` 0x5976e0 for the stance's `max_distance`, 0x5c1970): the page lets go on the posed hand at its release, the look a tick from the command's; no game source -- the game has no server. The old `THROW_SPEED_MAX` (400 u/s, any direction) is retired: the bound is now the game's own `ComputeMaxVel` | open (a server tolerance: 0.1 of the stance's fastest throw, 24 u/s standing) |
| `STANCE_CHANGE_TICKS_PLACEHOLDER` (launch review, OWNER-3) | ticks after a posture change during which the posed root may be anywhere between the two stances' (60); the change clips' lengths are not read into the server | retired 2026-10-06 (web sprint 30, PF-37; research 236 s2, 179 L695-710): `stanceChangeTicks(from, to)`, the transition's clip in ticks -- 37 / 51 / 57 |
| `START_REACH_PLACEHOLDER` (SVC-23b, 2026-10-04: `room.ts`; research 169 §7 measure 5 (b), weak point 3) | units a round's muzzle, a thrown grenade's hand and a launched round's or rocket's muzzle may stand from the server's own head at the command (`shotCone.ts` `headPoint`: the scope's eye over the feet, the stance's or the move's root, the peek), plus the root's slack (`ROOT_POSE_SLACK_PLACEHOLDER`, a posture change's span); a set charge's point that far across from the feet; the line from the head to the start clear of walls. 16: the farthest start the page's tables put from that head, the prone throw's release point (`throwAnim`, 14.8 from the prone head), rounded up -- the rifle's muzzle about 9.3 (research 79 §2, §3.4), a charge under the hand about 8 (`grenade.ts` `placeCharge`). Replaced `MUZZLE_SLACK` (40 units from a fixed eye height, the body's middle alone wall-tested); no game source -- the game has no server | open (a server tolerance: the posed muzzle and hand minus the server's head, measured in the page over every clip and weapon, would settle it) |
| `CHARGE_HAND_HEIGHT_PLACEHOLDER` (SVC-23b, the re-review of 2026-10-04: `room.ts` `startRefused`) | units over the feet of the page's hand when it sets a charge down: its cast falls from there plus `PLACE_CAST_LIFT_READING` (`grenade.ts` `placeCharge`: the posed right hand, or the stand-in (2, 8, -8) in the actor frame). The room tests a charge's path from the head down to that height over the body, across at it, then down to the charge, so a charge is not set past cover the hand does not clear. 8: the page's stand-in; no game source for the server's side -- the game has no server | open (a server tolerance: the posed right hand's height through `Place claymore`, measured in the page, would settle it) |

## 17. The kicks: the vote to remove, and no idle kick (research 91c, 2026-09-29)


Written 2026-09-29. Read-only research for the owner's request "a full team vote to kick option pairing the original". Sources: `analysis/socom2_game.elf.decomp.c` (cited `FUN_x Lnnn`, `Lnnn` = its line; strings by address, e.g. `0x3f26c0`), `.strings.txt`, the disc's `RUN/READERC.ZAR` (`UIMnLOC`/`HudCLOC` entries cited by their `_NNN_` index, as research 91 does), reCOM (`recom/`, SOCOM 1 code and SOCOM 1 disc data) where the decompilation is silent, and the console frames `parity/s4_pcsx2/`. Paths are relative to the handoff root ``.

Vocabulary. **Lobby record** = one of the 24 per-slot records at `DAT_004414c4[slot*2]` (slot = `+0xfc8`); `+0x0` team word (`0x40000001` / `0x80000100`, which is SEALs depends on `DAT_004412d8`; spectators have bit `0x10000`), `+0x4` account id, `+0x48` "this slot voted to remove ME", `+0x49` "I voted to remove this slot", `+0x4a` "this slot voted to eject the spectators". `DAT_00441448`/`DAT_00441450` = the two team head counts, recomputed by `FUN_002c4500` L165605. Host = `DAT_0045a0c0`, online = `DAT_0045a0c1`. **TCM** = the in-game tactical command (radio) menu, `TCM.tif` (research 87).

### Verdict in one paragraph

SOCOM II has a **per-player, team-only, strict-majority vote to remove** ("VOTE RETAIN:REMOVE") and a separate **vote to eject all spectators** ("VOTE ALL", > 60% of players). Neither is a "full team" (unanimous) vote. Any team member, living or dead (*2026-10-17, AD-10, research 227 §2.9: no life test on the vote's path; was "Any living team member"*), opens the in-game TCM, TEAMMATES > PLAYER n > toggles his vote on one teammate; the vote is a standing toggle (no timer, no cooldown, no "vote started" prompt, no yes/no poll). Each vote is sent only to the target's console, which keeps the tally itself, prints "Voting: You have %d votes against you." and tests `votes > teamSize/2`. The removal itself ("YOU HAVE BEEN KICKED FROM THIS GAME", then back to SOCOM II Online) and the rejoin ban ("You have been banned from that game") are in the disc's data and the Medius error path, but the round-end step that applies the kick is script-side and only visible in SOCOM 1's copy of the same script (believed, not shown for SOCOM II). No host-only kick was found. No idle/AFK kick exists.

### 1. Vote-kick (players voting a player out)

| rule | value | citation |
|---|---|---|
| exists | yes, in-game only (TCM), online player mode | `FUN_00232bc0` L83283 (mode 1 menu, L83575-83640); mode chosen at L57441-57448 (0 SP, 1 online player, 2 online spectator = RADIO only) |
| who may vote | any online player who is not a spectator (spectator TCM has only RADIO; mode 2 L83641-83644) | L57441-57446 (`FUN_002c2fa0` = local is spectator -> mode 2) |
| who can be voted on | only **teammates**: PLAYER 1..8 enumerates other actors of type 2 whose team flags `+200` overlap the voter's, not flag `0x20000`, not spectators | `FUN_0022f5b0` L81442-81473; label = teammate name `+0x14`, `FUN_0022f6e0` L81475-81509 |
| how a vote is cast | toggle: local `+0x49` flipped, "Voter" packet (slot, 1 byte on/off) sent **only to the target's console** | `FUN_0022f3c0` L81354-81373; `FUN_002ba140` L159785-159800 (msg `DAT_00440e80`, name "Voter" `0x3f2420`, registered L159131) |
| toggle label | "VOTE REMOVE" (`0x3e5ce0`) when not yet voted, "VOTE RETAIN" (`0x3e5cd0`) when voted | `FUN_0022f440` L81375-81396 |
| menu entry text | "VOTE RETAIN:REMOVE" `0x3e6370`, help "Vote to Retain or Remove the selected player" `0x3e6390`; sibling "MUTE ON:OFF" `0x3e63c0` | L83616-83631; handlers L83803 |
| TCM category (data) | "Vote" / "Vote people on and off your team"; command "OFF/Back ON" `CMD_MP_VOTE_OFF` "Vote a player out of the game" (MP_ONLY) | `READERC.ZAR` command table; SOCOM 1 same in `recom/data/s1/common/zrdr/orders.rdr` L40, L225-227; id 0x25 `FUN_0058ed60` L449779-449788 |
| HUD texts for it | HudCLOC 60536 "ON", 60537 "OFF", 60538 "RESCIND VOTE AGAINST THIS PLAYER", 60539 "VOTE THIS PLAYER OUT" | `READERC.ZAR` HudCLOC (no decomp reference found) |
| who counts | the **target's** console: sets `record[voter].+0x48`, counts all set flags | `FUN_002ba040` L159747-159781 (`FUN_002c3a20` L165161, `FUN_002c3920` L165087) |
| message to the target | "Voting: You have %d votes against you." `0x3f26c0` *(the leading space dropped 2026-10-10: the ELF string has none, research 263 §5.2)*, in the message window | L159765-159766 |
| threshold | **strict majority of the target's own team, target included**: `votes > sameTeamCount / 2.0` (8-man team: 5; 6: 4; 4: 3; 3: 2; 2: never, since the one teammate is 1 vote, not > 1) | `FUN_002c3550` L164913-165085 (both team branches identical) |
| "full team" / unanimous | **no** -- strict majority only | same |
| after each vote | target broadcasts "Alert" {1, votesBefore, votesAfter}; receivers, when before == after, store the target's account id + code 2 in `DAT_0044fb48`/`DAT_0044fb50` (the stats-report block, cleared by `FUN_002fab80` L198556) -- purpose not proven | L159770-159780 (`DAT_00440eb8`); `FUN_002b98b0` L159438; `FUN_002f9690` L197811 |
| duration / expiry | none: the vote is a standing flag until the voter toggles it or leaves (a joining slot's `+0x48`/`+0x49` are cleared) | `FUN_002c5830` L166356-166377 |
| cooldown | none found | -- |
| "a vote has started" prompt, yes/no poll | none: no broadcast of a vote to the team, only the target is told | strings search (§4) |
| when the kick applies | **believed**: at the round-end screen, script `HaveBeenBannedFromGame` -> `BanSelfFromGame` -> `dlgNetBanned.rdr` (the victim removes himself); the pass test `FUN_002c3550` is the only no-argument bool of this shape. Its one visible call (L159767) discards the result, so the script table (in `.data`) is the likely caller. *(2026-10-10: read since -- SOCOM II's own ROUND COMPLETE and GAME COMPLETE run the test at their start, FINAL ROUND none: research 179 §6.2; the room follows it, research 263 §5.2.)* | reCOM (SOCOM 1 disc data) `recom/data/s1/common/dialog/dlgMultiplayerRound.rdr` L2209-2250 (`ExitOnStart`), `dlgMultiplayerFinalReally.rdr` L3036-3043; strings "HaveBeenBannedFromGame" `0x3edcf0`, "BanSelfFromGame" `0x3edd50` |
| kicked player's screen | UIMnLOC 539 "YOU HAVE BEEN KICKED FROM THIS GAME", 541 "ABORTING MISSION", 540 "RETURNING TO SOCOM II ONLINE..."; disconnects, waits 4 s, back to the lobby (TRIANGLE skips) | `READERC.ZAR` UIMnLOC; layout and script: SOCOM 1 `recom/data/s1/common/dialog/dlgNetBanned.rdr` (DisconnectFromGameServer, WAIT 4, SWITCHMENU dlgWorldOfSOCOM) |
| rejoin | refused by the server: JoinGame error -972 (`MediusPlayerBanned`) -> event "MP_BANNED_FROM_GAME" -> UIMnLOC 443 "You have been banned from that game. Please choose another. CONTINUE." (444 "BANNED") | `FUN_002edba0` L190405-190433; error names L194432-194433 (`0x3f5320`); `0x3f4880`, `0x3e2410` dialog events L50400, L54576 |
| other teams see | nothing specific (no kill-feed style line found for a kick) | -- |
| host direct kick | **none found**: no kick/remove entry in the game lobby (host frame shows ARMORY / SWITCH TEAMS / READY only), no host-only UI, no kick string | frames `A_54_gamelobby2.png` (host), `B_44_joined.png`; strings search |

### 1.1 Spectator eject vote ("VOTE ALL")

| rule | value | citation |
|---|---|---|
| menu | TCM SPECTATORS (`0x3e63e0` "Spectator controls") > "VOTE ALL ON:OFF" `0x3e6410` "Vote to Retain or Remove all players"; shown only while a spectator is present; labels "VOTE ALL REMOVE" `0x3e5cc0` / "VOTE ALL RETAIN" `0x3e5cb0` | L83632-83633; `FUN_0022f210` L81282-81310; handlers L83805 |
| cast | toggle `DAT_00412ff8`; "Spec Vote" (`0x3f2428`, `DAT_00440e88`) broadcast to all and applied locally | `FUN_0022f0f0` L81252-81280; `FUN_002b9b60` L159557-159570; registered L159135 |
| texts | " %s voting against spectators: %d votes against." `0x3f25e0`; " %s voting for spectators: %d votes against." `0x3f2620` | `FUN_002b9bd0` L159575-159596 |
| threshold (host decides) | votes > 0.6 x (SEALs + Terrorists) | `FUN_002c2e30` L164516-164544 |
| effect | host broadcasts "Reject" (`0x3f23b8`, `DAT_00440e90`); all print "Spectators EJECTED from this game." `0x3f2650`; `MaxSpectatorsValve` (`0x3f2680`) set to 0 (no new spectators; join then fails "Too many spectators" `0x3f24b0`); each spectator gets `dlgNetBanned.rdr` (`0x3f26a0`) | L159598-159612; `FUN_002b9d80` L159617-159635 |

### 2. Idle / inactivity kick

| item | value | citation |
|---|---|---|
| AFK / no-input kick | **none found** | strings and READERC search (§4) |
| "CHRSND_PLAYER_IDLE" `0x65bd20` | an idle chatter sound id, not a timer | strings |
| "inactive" `0x65f9f0` | animation/object flag name, `FUN_0032f0d0` lookup L485174 | -- |
| lobby ready auto-start | when >= 80% of players are ready (both teams non-empty) "MP_EIGHTY_READY" `0x3f2a40` fires; valves `mp_45_sec_clock` `0x3f1110` / `mp_x_sec_clock` `0x3f1120` (game `+0x30`/`+0x34`, L149578-149586); frame: "The READY button will be available in 30 seconds" | `FUN_002c40c0` L165503-165507; frame `A_53_gamelobby.png` |
| abandoned game | a player leaving with < 3 left, or host with only spectators left: `dlgNetAbandoned.rdr` ("ABANDONED") | `FUN_002bc530` L161130-161140; `FUN_002c4500` L165673-165677 |
| between-round screen timeout | SOCOM 1: 90 s on the round/final screen -> `dlgNetError.rdr` (network stall guard, not idle) | reCOM `dlgMultiplayerRound.rdr` L2277-2285 |
| network timeouts | UIMnLOC 440 "Timeout Failure"; DNAS -617; "MediusErrorSessionInactive" `0x668268` (server session) | READERC; strings |

### 3. The UI

| item | value | citation |
|---|---|---|
| where | in-game TCM (tactical command / radio menu), not the pause menu or the game lobby | `FUN_00232bc0` L83575-83644; builder `FUN_002344e0` L83717-83806 |
| online-player TCM tree | TACTICAL ORDERS, TAUNTS, RADIO (ACTIVE CHANNEL, RADIO ONOFF), **TEAMMATES** (Teammate controls) > PLAYER 1..8 (named) > VOTE RETAIN:REMOVE, MUTE ON:OFF; **SPECTATORS** > VOTE ALL ON:OFF; MESSAGES (CUSTOM MSG 1-5) | strings `0x3e5dd0`-`0x3e6550`; L83575-83639 |
| spectator TCM | RADIO only | L83641-83644 |
| gate | the TCM opens online for any actor (`FUN_002359a0` D:L84284-84298); each root by its own enable: TAUNTS and RADIO for a living actor or an online spectator, TACTICAL ORDERS and MESSAGES for a living actor, TEAMMATES and SPECTATORS by their rows -- the vote and VOTE ALL have no life test *(2026-10-17, AD-10, research 227 §2.9)*. Was: "TCM items need the player alive (`+0xe1` bit 4) and not a spectator", which misread `FUN_0022f810` (its spectator half enables) as the TCM's gate | `FUN_0022f810` D:L81519-81527 (NODEACTION ROOT, TAUNTS, RADIO: D:L83757, D:L83774, D:L83787); `FUN_002301e0` D:L81879-81883; the vote `FUN_0022f440` D:L81384-81396, `FUN_0022f3c0` D:L81363-81370, `FUN_002ba040` D:L159762-159767; VOTE ALL `FUN_0022f0f0` D:L81263-81277, `FUN_0022f210` D:L81293-81313; the send `FUN_0030cef0` untraced |
| feedback | right-side value text of the entry ("VOTE REMOVE"/"VOTE RETAIN"), target's message-window line | L81375-81396; L159765 |

### 4. Placeholders (not found)

- **The SOCOM II round-end kick script.** The SOCOM II dialog `.rdr` scripts are not in the handoff (only `READERC.ZAR`); the kick-at-round-end flow is from SOCOM 1's `dlgMultiplayerRound.rdr`. The UI command table that binds "HaveBeenBannedFromGame"/"BanSelfFromGame" to code is in `.data` (no ELF); grep of `0x3edcf0`/`0x3edd50` in the decomp: no hits.
- **What `BanSelfFromGame` sends** (a Medius ban-list call is implied by error -972 on rejoin; the request itself not found). Whether the ban lasts for the game's life: assumed.
- **Purpose of the "Alert" {1, before, after} broadcast** and `DAT_0044fb48/50` (account id, code 2): not traced.
- **HudCLOC 60536-60539** users: no decomp reference (`0xec78`-`0xec7b` grep empty); likely the SOCOM 1-style TCM command text.
- **Threshold when a team shrinks mid-vote**: recomputed from the live team count each vote (`FUN_002c3550`), not re-checked on leave.
- Searched: strings `kick`, `vote`, `Vote`, `VOTE`, `boot`, `ban`, `banned`, `remove`, `eject`, `expel`, `reject`, `majority`, `idle`, `inactive`, `timeout`, `timed`, `afk`, `away`, `heartbeat`, `abandon`, `seconds`, `ready` in `.strings.txt` and `READERC.ZAR`; decomp references of every hit; reCOM `src/` (`zseal.h` L672-675 has `m_vote_tally`, `m_voted_against`, `m_local_voted_against`, unused) and `data/s1`; frames A_44-A_55, B_41-B_44 (no pause-menu frame exists in `s4_pcsx2`).

### 5. For the recreation (owner's "full team vote")

The original is a strict team majority, target included, with no poll and no timer. "Full team" would be a deviation: unanimous = every other teammate (`votes == sameTeamCount - 1`). Pairing the original means: teammates-only, standing toggle per voter, tally shown to the target, pass at `votes > teamSize/2`, applied at round end, kicked player sees UIMnLOC 539/541/540 and is refused on rejoin with UIMnLOC 443. The spectator eject (> 60% of players, MaxSpectators -> 0) is a separate feature.

## 18. The round's flow and its screens (research 91d, 2026-09-29)


Read-only research, 2026-09-29. It builds on research 87 (§1 HUD, §8 round start, §12 scoreboard, §14 message window)
and 91 (§9 round and match) and does not repeat them.

**Sources**
- The decompilation `analysis/socom2_game.elf.decomp.c`, cited as `FUN_x Lnnn`.
- Strings, cited by address from `socom2_game.elf.strings.txt`.
- The disc's zAnim command archives:
  - `RUN/MPZANIM.ZAR`, the round-end and final screens' scripts. This file was not opened before (README l.490).
  - Each map's `MZANIM.ZAR` inside `MPxx.ZDB`, whose animation `objectives` is the round's game logic.
- The locale tables in `READERC.ZAR`: `UIMPXLOC.rdr`, `mp51LOC.rdr`.
- reCOM's SOCOM 1 dialog `.rdr` files, used only for layout, which the SOCOM II disc subset lacks.
- The console frames in `parity/s4_pcsx2/`.

**How the zAnim streams were read**
- The reader is `@s2u/scene` `parseAnimSets`, run with tsx from the scratchpad. The repo is unchanged.
- The command numbers follow `ZANIM_COMMAND_NAMES` (research 89): 2 IF, 3 ELSEIF, 4 ELSE, 5 ENDIF, 15 WAIT, 30 SOUND,
  39 WHILE, 40 END_WHILE, 43 EXPRESSION, 44 BREAK, 45 CALL_ANIMATION, 46 STOP_ANIMATION, 50 CALL_SEQUENCE,
  51 STOP_SEQUENCE, 55 MESSAGE, 61 VALVE.
- Set 1, command 1 is `ui::UI_COMMAND`. Its code `0xe9` sets a caption: node ref, name index, locale id.
- VALVE's operations: 1 `!=`, 2 `==`, 3 `>`, 4 `<`, 5 `>=`, 0xb set, 0xc add. The flag 0x200 marks a valve given by
  name, and 0x1a00 an operand that is itself a valve.
- A sequence word of 0x102 means it runs at start; 0x104 means it runs only when called.
- In the citations below, "MP51 `objectives`/`seq`" is the animation `objectives` in `MP51.ZDB:MZANIM.ZAR`. The same
  eleven sequences are in the `objectives` of MP2, MP5, MP8, MP64 and MP81, checked for `success2` and
  `mission_timer2`. Only their name indices and raw texts differ: MP2 says "TIME HAS EXPIRED" where MP51 uses locale
  5108.

---

### 1. The round clock

| item | value | citation |
|---|---|---|
| where | Info box, the timer line: pen (500, 433), scale 0.9, over the mirrored `newweapnbkrnd.tif` strip x 488-622, y 418-438 | research 87 §1.10-1.11; frame `A_ready259` / `B_ready259` ("02:07") |
| format | `"%02d:%02d"` (`0x3e3088`) = minutes, seconds: **MM:SS** with a leading zero ("05:59", "02:07") | `FUN_001f6b60` L56002; frames |
| font / colour | the HUD font `font_text_01` / `arialblack` (`0x3e3490`, `0x3e34b8`); the HUD text colour (128, 128, 128) at alpha 80 | research 87 §1, §3 |
| source | online: `FUN_002a6ad0(0x4364e0)` = net block `+0xec` (remaining ms) x 0.001, floored to whole seconds (L148973-148993); offline: the float `+0xe8` | L148980-148990 |
| when it counts | every tick, `FUN_002aa490` L151090-151109: elapsed = now - start (`+0xe4`), **remaining `+0xec` = round length `+0xe0` - elapsed**, floored at 0. *Disagreement (2026-10-11, research 270 §4): the desktop's runtime reads `+0xe0` (`DAT_004365c0`) as a counter from 0 at the round's start, not the length; a re-read of `FUN_002aa490` D:L151090-151109 settles it (ROUND_EPOCH_PLACEHOLDER, research 101 §5 L482).* The round length is `mp_max_round_time` x 60 x 1000 ms (research 91 §9). It counts from the round's start: on `A_ready021` the first in-round frame already reads 05:59 | L151100-151109; frames `A_ready021` (05:59), `A_ready259` (02:07) |
| redraw | only when the seconds change (`% 60` against `DAT_00408f88`) | L56000-56003 |
| visibility | shown or hidden through the box's vtable +0x18 / +0x1c by the local player's alive bit (`+0xe1` bit 4) and the online flag `DAT_0045a0c1` (L56004-56015); hidden while the scoreboard is up (research 87 §12). A negative clock offline draws string `0x3e3070` (under the dump's length cut) | L56004-56020 |
| at zero | the master zeroes the valve `mp_timer` (net `+0xf8`, created at 1: `FUN_002a6c50` L149063-149064). This is the event the map's script waits for (§2). **The clock stops at 00:00**, and the round goes on for the script's hold | L151110-151121 |
| warning (last 30/45 s) | **none.** `FUN_001f6b60` changes no colour and plays no sound; no string or sound id names a round-time warning. `mp_45_sec_clock` / `mp_x_sec_clock` are **lobby** clocks, not round clocks: the 45-second "force launch" wait and the 10-second launch countdown (SOCOM 1 `dlgGameLobby.rdr` `Watch45SecClock`, `CountDown`; SOCOM II `MPZANIM.ZAR` `return_to_gamelobby` sets `mp_x_sec_clock = 11`); created at `FUN_002a7560` L149578-149586 | this section |
| lobby countdown seen | the READY button turns to "NOT READY 5", then 4, then the screen fades to black | `A_ready006`, `A_ready007`, `A_ready008` |

### 2. The round's end in SUPPRESSION

### 2.1 What ends it: the map's `objectives` script (MP51 `MZANIM.ZAR`)

| case | trigger | what happens, in order | citation |
|---|---|---|---|
| RESPAWN on (`Respawn` == 1) | at start, the sequence `respawn` stops `start` and `mission_timer` and calls `start2` and `mission_timer2` | **Elimination does not end the round**: `start2` has no elimination loop | MP51 `objectives` seq `respawn` (offset 0) |
| respawn: time | `mission_timer2`: WAIT 5, then WHILE `mp_timer != 0` | 1. MESSAGE locale **5108 "TIME EXPIRED"** at scale 0.9 in the main message window, with the sound `MUS_MP_SEAL_WIN_ALB` (name 0x1e).<br>2. **WAIT 15 s** (the world keeps running).<br>3. CALL `success2` | seq `mission_timer2` (offset 2432) |
| respawn: result | `success2` | 1. `round_count` += 1.<br>2. **IF `seals_team_score` > `terrs_team_score`**: `mp_winner` = 0 and `mp_score00` = 1.<br>3. **ELSEIF <**: `mp_winner` = 8 and `mp_score08` = 1.<br>4. **ELSEIF ==**: `mp_winner` = 0x63 (99, draw).<br>5. Then **`mp_game_over` = 1 unconditionally**, WAIT 1 s, `mission_complete` = 1.<br>*[2026-10-15, sprint 40 AD-0 (the research reconciliation's C01 / C62): was "`mp_score00` += 1" and "`mp_score08` += 1". The two score steps at the sequence's offsets 2840 and 2896 are operation 11 with operand 1, an assignment, where `round_count`'s at 2784 is operation 12, the increment; the operations as `FUN_00353fd0` executes them, D:L252215-252238 (the reconciliation's chunk 01, re-read independently in its chunk 08)]* | seq `success2` (offset 2756) |
| respawn off: elimination | `start`, after WAIT 5 and WAIT 10: WHILE `mission_complete` == 0 AND `mission_failure` == 0, test `aiteam_08` == 0 (no living Terrorists) or `aiteam_00` == 0 (no living SEALs) | The side that eliminated the other: `mp_score00` or `mp_score08` += 1, `mp_winner` = 0 or 8.<br>Two messages: locale **5103 "ALL TERRORISTS ELIMINATED"** at 0.7 and **5104 "SEALS VICTORIOUS!"** at 0.9; or **5105 "ALL SEALS ELIMINATED"** at 0.7 and **5106 "TERRORISTS WIN!"** at 0.9.<br>Sound `^PH_0014` / `^PH_0002`, WAIT 2, music `MUS_MP_SEAL_WIN_ALB` / `MUS_MP_TERR_WIN_ALB`.<br>CALL `success` or `failure` by the local team: WAIT **20 s**, `round_count` += 1, CALL `game_over`, WAIT 1, `mission_complete` / `mission_failure` = 1 | seq `start` (offset 428), `success` (2664), `failure` (3004) |
| respawn off: time | `mission_timer`: WAIT 15, WHILE `mp_timer != 0`; then CALL `abort` | `round_count` += 1, `mp_winner` = 99, CALL `game_over`, `mission_timeout` = 1. **A draw: nobody scores.** No message is posted, and there is no hold | seq `mission_timer` (2344), `abort` (2580) |
| engine side | `mission_complete` / `failure` / `abort` / `timeout` valves (`0x3f18b0` / `0x3f18d0` / `0x3f18e0` / `0x3f18f0`, game `+0x1a4` .. `+0x1b0`) give states 2 / 3 / 4 / 5 | `FUN_002aa490` L151133-151158 (valves bound at L151844-151851). Online master (`FUN_002a9b30` L150612-150672): the state change arms a **3.0 s** timer (`+0xe4` = now + 3); then it copies `mp_score00` / `mp_score08` / `mp_winner` to net `+0x120` / `+0x124` / `+0x128`, increments `mp_round_count` (`+0x11c`), and sets net state `+0x113` = **6 if `mp_game_over`, else 4** | L150612-150672 |

Team score (`seals_team_score` / `terrs_team_score`) = the sum of that team's players' **round** score `+0x5c8` plus a
carried term (`FUN_00544d60` L411238-411306; research 91 §8). A player's score is +2 per enemy kill, -2 per suicide or
team kill (91 §8). **In SUPPRESSION with RESPAWN the team with more points after the 15-second hold that follows 00:00 wins; equal points is a DRAW.** *[2026-10-15, sprint 40 AD-0 (C01): was "at 00:00". `mission_timer2` WAITs 15 s after TIME EXPIRED before `success2` compares the scores (the table above); the winner is stored (`FUN_002a9b30` D:L150614-150672) before the survival bonuses are awarded (`FUN_00223970` D:L76149-76165) -- all six SUPPRESSION maps' `success2`, the reconciliation's chunk 08]*

### 2.2 The placeholders resolved

- **SUPPRESSION_ROUND_END_PLACEHOLDER: resolved.**
  - Respawn on: only the clock ends the round.
    - At 00:00 the post "TIME EXPIRED" appears and the round plays on for 15 s.
    - The winner is the side with the higher team score, compared strictly; equal scores are a draw (`mp_winner` 99).
    - The winner's round count is set to 1 (operation 11; the match ends after this round). *[2026-10-15, sprint 40 AD-0's review: was "goes up by 1".]*
  - Respawn off: elimination ends the round, and the side left alive wins it. A timeout is a draw.
  - Sources: MP51 `objectives` seqs `start2`, `mission_timer2`, `success2`, `start`, `abort`. The match-level
    consequences (a single round, at most one round won) are in §3.
- **MATCH_WIN_COMPARE_PLACEHOLDER: resolved.** MP51 `objectives` seq `game_over` (offset 100) and `game_over2`:
  1. `end_of_round_round_count` = `mp_round_count` + 1.
  2. **IF that count >= `mp_max_rounds`:**
     - IF `mp_score00 == mp_score08`: STOP this sequence. There is no game over, so a tiebreaker round is played.
     - ELSE `mp_game_over` = 1.
  3. **ELSEIF `mp_score00 >= mp_half_rounds` OR `mp_score08 >= mp_half_rounds`:** `mp_game_over` = 1.

  `game_over2` sets `mp_game_over` when `mp_round_count >= mp_max_rounds`. `mp_half_rounds` = (11 + 1) >> 1 = 6
  (`FUN_002a6c50` L149073). The final screen names the winner as **`mp_score00 > mp_score08`** → SEALs, the reverse
  → Terrorists, else nobody (MPZANIM `dlgMultiplayerFinalReally` `CallRoundATie`).
- **Consequence for the owner's mode (the finding that matters most):** with RESPAWN on, `success2` sets `mp_game_over`
  = 1 after the first round.
  - A SUPPRESSION + RESPAWN match on the original is **one timed round of 20 minutes**. Corrected 2026-10-21,
    research 348: CREATE GAME forces `mp_max_round_time = 1200` and `mp_max_rounds = 1` (disc reading); the old
    6-minute/4-10 choice belonged to respawn off.
  - "11 rounds, first to 6" applies only with respawn off.
  - The shared round-start banner formats `mp_max_rounds` (`FUN_001fb420`, research 87 §8, inherited executable
    reading pending fresh review), now supplied as 1 by the dormant port. Its original-runtime appearance still
    awaits a capture comparison; the former 11-round inference contradicted the disc setting.

### 2.3 The texts (exact) and their tables

| text | table / index | used by |
|---|---|---|
| "TIME EXPIRED" (MP2: "TIME HAS EXPIRED", raw) | `mp51LOC` 5108 | respawn time-out, main message window, scale 0.9 |
| "ALL TERRORISTS ELIMINATED" / "SEALS VICTORIOUS!" | `mp51LOC` 5103 / 5104 | respawn off, scales 0.7 / 0.9 |
| "ALL SEALS ELIMINATED" / "TERRORISTS WIN!" | `mp51LOC` 5105 / 5106 | respawn off, scales 0.7 / 0.9 |
| "FRAG AS MANY PEOPLE AS POSSIBLE" | `mp51LOC` 5107 | **unused** by MP51's script: `start2` posts "OBJECTIVE:" / "ELIMINATE THE TERRORISTS" or "ELIMINATE THE SEALS" as raw names 38-40 |
| "ROUND COMPLETE" | `UIMPXLOC` 2133 | round-end screen title |
| "NEXT ROUND" | `UIMPXLOC` 2132 | round-end screen, beside the countdown |
| "WINNER" / "LOSER" / "DRAW" | `UIMPXLOC` 2110 / 2109 / 2104 | the per-team result on the round screen (`DrawRoundS`, `DrawRoundT`) |
| "GO" | `UIMPXLOC` 2111 | end of the round screen's countdown |
| "SEALS" / "TERRORISTS" | `UIMPXLOC` 2101 / 2100 | team headers |
| "SCORE" / "KILLS" / "DEATHS" | `UIMPXLOC` 2106 / 2107 / 2108 | column headers [inferred: the round lists have 3 numeric columns, `FUN_00224210` L76333-76339; their stat offsets are `DAT_003dc7f0..` in `.data`] |
| "FINAL ROUND" / "FINAL TOTALS" / "GAME COMPLETE" | `UIMPXLOC` 2103 / 2102 / 2105 | final screens |
| "SEAL TOTALS" / "TERRORIST TOTALS" / "MVP" / "YOUR STATS" / "HIT %" / "HEAD SHOTS" / "FRIENDLY KILLS" / "SUICIDES" / "SEAL ROUNDS" / "TERRORIST ROUNDS" / "TIME PLAYED" / "PRIMARY OBJECTIVES" / "BONUS OBJECTIVES" | `UIMPXLOC` 2112-2124, 2118-2119 | `dlgMultiplayerFinalReally` |
| "RETURNING TO GAME LOBBY" (+ ". " steps) | `UIMPXLOC` 2125-2131 (SOCOM II shows 2128 "RETURNING TO GAME LOBBY. . .") | `ReturnFlash` (`RTGL` node) |

### 2.4 The round-end screen (`dlgMultiplayerRound.rdr`, scripts in `RUN/MPZANIM.ZAR`)

| item | value | citation |
|---|---|---|
| entered | the MP exit state `CMPExitState` (`FUN_00223970` L75961-76172). It adds each round stat (`+0x58c`..`+0x5ce`) into the match block (`+0x544`..`+0x586`) and scores round bonuses: **+5 to each player of `mp_winner`'s side, +1 to each living player** (L76146-76165). It empties both decal pools (L76084 `FUN_0031c880(DAT_0045c380)`, decomp 219040: `FUN_003bf050(0x4b5030)` temporary -- marks, footprints -- and `FUN_003bf050(0x4b5050)` permanent -- scorches, L219059-219060: at every round end, not only at teardown; the page clears on the next `roundStart` and on `abandoned`, `newRound`), clears the three message windows (L76085-76087), loads `readerx.zar` `run/ui` (`0x3e5270`/`0x3e5280`) and `run/mpzanim.zar` (`0x3e5340`), and sets menu `+0x920` = game over | L76060-76117 |
| automatic | **yes.** It is its own screen that replaces the game; it is not the SELECT scoreboard. Research 87 §12 names a console frame `A_rend050` "ROUND COMPLETE" that is not in this handoff | -- |
| content | per team, the round's players: a `LISTBOX` of rows "name" or "[clan] name" (`0x3e53b8`/`0x3e53c0`) and 3 numbers ("%d"). Players are sorted by `FUN_00226060` (`0x225f30`/`0x225e70`). The local player's row is coloured (91, 72, 36) (`0x42b60000`, `0x42900000`, `0x42100000`). Uivars `RoundStatLbContentsSeals` / `Terrs` (`0x3e5290`/`0x3e52b0`), `GameStatLbContents*`, `MvpName`/`MvpLbContents`, `PointsEarned`, `RoundsWonSeals`/`Terrs`/`RoundsWon`, `TimeInRound`/`TimeInGame` as `hh:mm:ss` from the net clock | `FUN_00223680` L75944-75950; `FUN_00224210` L76218-76357; `FUN_00224670` L76359-76466 |
| result caption | `CallRoundATie`. IF `mp_allow_respawn` == 1: `mp_winner` 0 → SEALs "WINNER", Terrorists "LOSER"; 8 → the reverse; 99 → both "DRAW". Then IF `mission_timeout` == 1 → both "DRAW"; ELSEIF winner 0 or 8 as above. (Ref 1 = `DrawRoundT`, ref 2 = `DrawRoundS`.) It also stops all sounds and turns VAG streaming OFF | MPZANIM set `dlgMultiplayerRound.rdr` anim `CallRoundATie` |
| hold | `CountDown`: "10", "9" .. "1" every 0.5 s, then "GO" = **5.0 s**. `ExitOnStart`: WAIT **5.0 s**, then `ReplayMission` (the next round). `TimeoutMonitor`: 90 s → `dlgNetError` | anims `CountDown`, `ExitOnStart`, `TimeoutMonitor` |
| intermission total (respawn off) | elimination → 20 s in the world (the messages and music play) → +1 s → +3 s (engine) → round screen 5 s → reload of the round (`FUN_00223680` state 3/5: every non-ghost player is put back at a round-start slot by `FUN_00598b90(p,0)`, and the team scores are reset by `FUN_002a7d40`). **About 29 s plus the load.** Time-out (draw): the script has no hold, so ~3 s + 5 s | scripts above; L75913-75929 |
| resets between rounds | positions (start slots; respawn games take a random slot in the block, 91 §4), a full default kit (91 §4.3), team scores, the clock (net `+0xe0..+0xf5` reset only at game over, L76135-76144; each round restarts the timer). **The held SELECT board's SCORE / KILLS / DEATHS are match totals**: match `+0x580` + round `+0x5c8` (87 §12); ROUND COMPLETE's lists are the round block alone, that round's three with its +5 / +1 bonuses, and GAME COMPLETE's the match block (research 216 §8, 2026-10-23). The team line shows rounds won (`+0x120`/`+0x124`) | L76060-76070, L75913-75929 |

### 3. The match's end

| step | what | citation |
|---|---|---|
| trigger | net state `+0x113` = 6 (`mp_game_over` set) → `CMPExitState` with `+0x920` = 1. When respawn is off and the game is not a ladder game, the stats are uploaded (`FUN_00225a00` / `FUN_00225070`) | `FUN_002a9b30` L150660-150664; L76078-76082 |
| screen 1: `dlgMultiplayerFinal.rdr` ("FINAL ROUND", the last round's per-team lists -- the round block, that round's kills, deaths and score with its bonuses; research 216 §8) | `CallRoundATie`: `mission_timeout` → both DRAW; else `mp_winner` 0 or 8 → WINNER / LOSER. `CountDown` "20" .. "1" every 0.5 s, "GO" = **10 s**, then `SWITCHMENU dlgMultiplayerFinalReally.rdr` | MPZANIM set `dlgMultiplayerFinal.rdr` |
| screen 2: `dlgMultiplayerFinalReally.rdr` ("GAME COMPLETE", "FINAL TOTALS": SEAL / TERRORIST TOTALS, MVP, YOUR STATS, SEAL / TERRORIST ROUNDS, TIME PLAYED) | `CallRoundATie`: `mp_score00 > mp_score08` → SEALs "WINNER", Terrorists " "; the reverse → the reverse; equal → both " ". `ReturnFlash` shows "RETURNING TO GAME LOBBY. . .". `ExitOnStart` runs `UpdateMpFinalStatsUiVars`, sets `IDFromBriefing` = 0 and **`ClanSwapSidesIndex` += 1**. Non-host players → `CloseAndSwitch dlgGameLobby.rdr` and watch the host; host → `call_gamelobby`: WAIT **10 s** → `return_to_gamelobby` (`player_ready_count` = 0, `mp_x_sec_clock` = 11, `CloseAndSwitch dlgGameLobby.rdr`). X (`MpFinalOnOk`) skips once `DoneCounting` is set (5 s), or finishes the counters. Timeout 90 s | MPZANIM set `dlgMultiplayerFinalReally.rdr` |
| after | back to the **game lobby** (the same room, everyone not ready, the 10-s launch clock idle at 11). The engine resets the net clock and the round block (L76134-76144). A dedicated server would relaunch the next map from here | L76134-76144 |

### 4. The round start as seen in frames (Vigilance, `parity/s4_pcsx2`, 1 frame/s)

| frame | shows |
|---|---|
| `A_ready000` | game lobby, READY (both players red) |
| `A_ready006` | both ready; the button reads **"NOT READY 5"**: the 5-second launch countdown. *(Corrected 2026-10-01, PLAT-35, the roadmap's correction 2: this said "both ready (green)"; the frame shows one green dot, beside the SEAL, and one red, beside the Terrorist (ONL-16).)* |
| `A_ready007` | "NOT READY 4", dimming |
| `A_ready008` | black (a 973-byte PNG) |
| `A_ready009` .. `A_ready020` | the **loading screen**, faded in over frame 9: the map name "VIGILANCE", the map picture with markers, "SUPPRESSION", the SEALs' and TERRORISTS' objective paragraphs, a spinning disc, and "(triangle) TO RETURN TO THE LOBBY." (`UILdLOC` 2000). About 12 s |
| `A_ready021` .. `A_ready034` | in the round, fading from black. The clock reads 05:59 on frame 21. "STARTING ROUND 1 OF 11" is posted, then "OBJECTIVE:" / "ELIMINATE THE TERRORISTS" 5 s later (research 87 §8). No countdown and no freeze: play starts at once |
| `s11_r0004_round1/A_19_ready` | the same banner on another map, clock 05:59 |
| `A_ready259`, `B_ready259` | clock 02:07 on both clients; **the capture ends before the round's end**. No round-end or final screen exists in the handoff |

The script side (MP51 seq `start` / `start2`): WAIT 5, then the objective pair by `player_team` (0 SEAL, 8 Terrorist,
0x10 spectator), with `MUS_MP_SEAL_INTRO_4` / `MUS_MP_TERR_INTRO_4`. The first message is the engine's (`FUN_001fb420`).

*(2026-10-02, INT-AUDIO-WIRE: the round's scripted audio is wired into the page -- the intro after the map's own WAIT
by the local side, the result line and the winner's music as the elimination branch plays them (MP51: WAIT 2 between),
`mission_timer2`'s SEAL music with no line; read off each map's script, not this section's MP51 alone. What is wired
and what is not: [research 124](124-the-round-streams.md) §12.)*

### 5. The tiebreaker round

- **When:** respawn off, all `mp_max_rounds` played, and `mp_score00 == mp_score08`. `game_over` then stops without
  setting `mp_game_over` (§2.2), so another round is played.
- **Presentation:**
  - The only difference is the start banner, "PLAYING TIEBREAKER ROUND" (`0x3e3540`), in place of
    "STARTING ROUND %d OF %d". It shows when `mp_round_count` + 1 > `mp_max_rounds` (`FUN_001fb420` L57633-57648;
    research 87 §8).
  - The round-end and final screens are the same.
- **After the tiebreaker:** `game_over2` / `game_over` end the match. The tiebreaker's winner leads by 1.
- **A drawn tiebreaker:** a timed-out tiebreaker leaves the scores tied, so the `IF ==` branch plays yet another one
  [inferred from the script].
- **Respawn on:** the match is a single round, so no tiebreaker exists. A draw ends the match with no "WINNER".

---

### UI assets

*(Corrected 2026-10-01, PLAT-35, the roadmap's correction 1: "not on the handoff disc" holds for the handoff's subset
only. On the full disc `dlgMultiplayerRound.rdr`, `dlgMultiplayerFinal.rdr` and `dlgMultiplayerFinalReally.rdr` are
members of `RUN/UI/READERX.ZAR` (and, in a longer form, of `RUN/UI/READERC.ZAR`: research 96 R96.2), and the splash
library is `RUN/COMMON/SPLA_TXR.ZED` / `SPLA_PAL.ZED` (ONL-20). The table is as it was written.)*

| screen | on the handoff disc | not on the handoff disc |
|---|---|---|
| HUD clock | the format string `0x3e3088` in the ELF; `newweapnbkrnd.tif` in `HUD2_TXR.ZED` (in every `MPxx.ZDB`); the font `font_text_01.tif` / `font_special_01.tif` in `FONT_TXR.ZED` (every ZDB) | -- |
| round messages ("TIME EXPIRED", "SEALS VICTORIOUS!" ...) | `READERC.ZAR` `mp51LOC.rdr` (and each map's `mpNNLOC`), also `RUN\LOCALE\STATES\MP51LOC.ZAR` in the ZDB; the scripts in `MPxx.ZDB:MZANIM.ZAR`; the window's layout in `READERC.ZAR/messages.rdr` | the sound banks behind `^PH_0014`, `^PH_0002`, `MUS_MP_*_WIN_*`, `MUS_MP_*_INTRO_4`: the music is streamed (VAG). `SOUNDS/BNKSTORE.ZAR` holds banks; the VAG store is not in the subset [check `@s2u/sound`'s catalog] |
| round-end screen | its scripts: `RUN/MPZANIM.ZAR` (set `dlgMultiplayerRound.rdr`); its texts: `READERC.ZAR/UIMPXLOC.rdr` 2100-2133 | **its layout `.rdr`** (`readerx.zar` `run/ui`, `0x3e5270`/`0x3e5280`: `READERX.ZAR`) and **its background / bitmaps**. SOCOM 1's used `MP_RoundComplete.tif` from `common/assetlib/spmp`; SOCOM II loads `common/assetlib/splash` (`0x3e5360`), whose `splash.rdr` (READERC) lists `winner.TIF` / `loser.TIF`. That texture library is not in any `MPxx.ZDB` (their UI members are only `WSMP`, `WSLC`, `EMnn`, `LPnn`, `OMnn`) |
| final screens | scripts: `MPZANIM.ZAR` sets `dlgMultiplayerFinal.rdr`, `dlgMultiplayerFinalReally.rdr`; texts: `UIMPXLOC` | layout `.rdr` (READERX) and background (SOCOM 1: `MP_Game_Complete.tif`) |
| loading screen | `LDZANIM.ZAR`, `UILDLOC.ZAR`, `LOAD_TXR.ZED` and the picture's bank `mission.rdr` `LoadingScreenAssets` names -- `OMnn_TXR.ZED` on MP1-MP12, `LPnn_TXR.ZED` on 51-83 (each ZDB; *corrected 2026-10-02, research 125 R125.2: it read "`LPnn_TXR.ZED`"*) | -- |
| game lobby (countdown) | texts in `UIMnLOC` | its `.rdr` (READERX / run/ui) |
| SOCOM 1 stand-ins for layout | `recom/data/s1/common/dialog/dlgMultiplayerRound.rdr`: panel "SEALS" at (27, 87) and "TERRORISTS" at (27, 270); "NEXT ROUND" at (380, 45) scale 0.8; the countdown +110 x at 1.2; the result words at (200, 90) / (200, 273), colour (255, 104, 51), scale 0.9; lists at x 129, y 112 / 295, row spacing 18, scale 0.75, colour 158 grey, rows appearing every 0.1 s after 0.15 s (`SEQUENCE_DELAY` / `INTERVAL`). A usable approximation, **not the SOCOM II layout** | -- |

### Placeholders

| name | what is missing | searched | next |
|---|---|---|---|
| `ROUND_SCREEN_LAYOUT_PLACEHOLDER` (*note only*) | SOCOM II positions, scales and background of `dlgMultiplayerRound` / `Final` / `FinalReally` | READERC, MPZANIM (scripts only), ZDB members, reCOM (SOCOM 1 only) | `READERX.ZAR` and the splash texture library from the full disc; or a console capture of the round's end |
| `ROUND_LIST_COLUMNS_PLACEHOLDER` (*note only*) | which 3 stats the round lists show (`DAT_003dc7f0`, `0x3dc800`, `0x3dc810`, `0x3dc820`; exit-time `0x3dc7b0..e0`) | `FUN_00224210` | read `.data` from the ELF; SCORE / KILLS / DEATHS are inferred from `UIMPXLOC` 2106-2108 |
| `CLOCK_NEG_STRING_PLACEHOLDER` (*note only*) | string `0x3e3070` drawn for a negative clock | strings dump (length cut) | the ELF |
| `CLOCK_VISIBILITY_PLACEHOLDER` (*note only*) | which of vtable +0x18 / +0x1c shows and which hides the timer box in `FUN_001f6b60` | L56004-56020 | the C2D vtable |
| `CLIENT_FINAL_EXIT_PLACEHOLDER` (*note only*) | whether non-host clients really leave `FinalReally` at once (`CloseAndSwitch` under `!IsSessionMaster`) or wait for the host | MPZANIM `ExitOnStart` | a two-client capture of a match end |
| `RESPAWN_BANNER_PLACEHOLDER` (*note only, retired 2026-10-21*) | the old 11-round respawn assumption is replaced by the disc's `mp_max_rounds = 1`; the shared banner consumes that setting (research 348) | CREATE GAME's `refresh_cg_screen`; inherited `FUN_001fb420` | reading for the setting; executable banner path awaits fresh re-read and a capture comparison |
| `MSG_COLOUR_WORD_PLACEHOLDER` (*note only*) | the MESSAGE command's second word `0x01c8c8c8` (read here as flag 1 + RGB 200, 200, 200) and its window (assumed the main one) | MZANIM streams | the MESSAGE tick in the decomp (command 55) |
| `TITLE_PLACEHOLDER` (`roundScreens.ts`) | the screens' title: SOCOM 1 had it in the background bitmap | `ROUND_SCREEN_LAYOUT_PLACEHOLDER`'s search | stands in at the team captions' x 27 (`dlgMultiplayerRound.rdr` L58), NEXT ROUND's baseline 45 (L96), scale 1 -- *retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr`* |
| `COLUMN_ORDER_PLACEHOLDER` (`roundScreens.ts`) | the round lists' three columns (`ROUND_LIST_COLUMNS_PLACEHOLDER`) | `FUN_00224210` L76333-76339 | KILLS, DEATHS, SCORE: the SELECT scoreboard's order (research 87 §12), SOCOM 1's first column KILLS -- *retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr`* |
| `PANEL_PLACEHOLDER` (`roundScreens.ts`) | the panel behind a screen | as the title's | the scoreboard's nine-slice stretched over the frame's margin (10..630, 20..432) -- *retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr`* |
| `TEAM_BAR_PLACEHOLDER` (`roundScreens.ts`) | the team bars under the captions | as the title's | the scoreboard's (25 high, 20 above the caption's baseline) -- *retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr`* |
| `STRIPE_PLACEHOLDER` (`roundScreens.ts`) | the odd rows' stripes | as the title's | the scoreboard's, across x 20..450 -- *retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerRound.rdr`* |
| `YOUR_STATS_PLACEHOLDER` (`roundScreens.ts`) | YOUR STATS (string 2115; SOCOM 1's final screen has none) | `dlgMultiplayerFinalReally.rdr` (SOCOM 1) | a fourth block in the bottom row, caption at y 327 (L768), numbers + 50 (L810), columns 60 apart (L1039) -- *retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerFinalReally.rdr`* |
| `BOTTOM_CAPTION_PLACEHOLDER` (`roundScreens.ts`) | the single-line SOCOM II captions SEAL ROUNDS / TERRORIST ROUNDS / TIME PLAYED | as YOUR STATS | on SOCOM 1's first caption line, y 327 -- *retired 2026-10-04 (PF-26, research 216): READERX `dlgMultiplayerFinalReally.rdr`* |

## 19. Classic mode as implemented (web sprint 3, 2026-09-29)

This section records what the match server and the page implement for respawn off, the create-game default ("Respawn
is disabled."). The owner's ruling of 2026-09-29 applies: every rule comes from the decompilation, the disc's scripts
or reCOM, and what cannot be sourced is a named placeholder.

The code is in these files:
- `packages/viewer/src/net/rules.ts`: the shared rules.
- `packages/match/src/room.ts`: the room. The `rules` option is `respawn` or `classic`.
- `packages/match/src/server.ts`: rooms keyed by map and rules (classic only while `RESPAWN_RULES_ENABLED` is off);
  `/rooms`.
- `packages/viewer/src/netPage.ts`: the page's side.
- `packages/viewer/src/rules.ts` and `shareUrl.ts`: the rules the page joins with -- classic while
  `RESPAWN_RULES_ENABLED` is off (the owner's ruling of 2026-09-29: "Remove the respawn option entirely for the time
  being. No mode selection."); the Rules setting is gone, and `rules=` is a retired link parameter, taken out of the
  address (`RETIRED_PARAMS`).

The wire is protocol 4:
- The hello carries `rules`.
- The welcome carries `rules`, `round`, `rounds` and `ghost`.
- The round start carries `rounds`.
- There is a new `eliminated` event.

Protocol 5 (the launch review, 2026-09-29): a `fire` carries the eye its aim left from and that aim (`eye`, `aim`),
which the room checks against its own run of the page's accuracy cone (OWNER-3, `packages/viewer/src/net/shotCone.ts`;
its tolerances in section 16); `promoted` carries `ghost` (a promotion into a classic round in play); an idler moved out
is sent `demoted` with its place in the queue. The room decides a round or a reload at its own command, once the
command after it has run, and counts the fire rate (the fastest enabled mode's wait, `FUN_005c09f0`) and the reload's
lock (the clip's length, `reloadClip.ts`) on the player's commands run, never on a number the client sends.

Protocol 6 (grenade harm, 2026-09-29; `PROTOCOL_VERSION` in `packages/viewer/src/net/protocol.ts`): the snapshot's
action codes gain the blast's four knock clips, `fallForward`, `fallBackwards`, `landBackwards` and `getUpBackwards`
(`net/blast.ts`, research 85 section 12), and the server sends the player a blast reached a `blast` event, `{ ring,
knock, after }`: `ring` the ringing ears (seconds at a volume, 5 s at 0.35) or null, `knock` the velocity and the fall
clip laid on its mover after command `after` -- the page lays the same on its prediction -- or null. Review 2 added
the room's own refusals (a swap during a reload lock, a round or reload during a swap's clip, a reload in the air --
research 84 section 18 -- and a throw not bound to the thrower's frame, section 16's `THROW_SLACK_READING`), which
change no message.

Protocol 7 (review 2 m-13 and review 3 B2, 2026-09-30): the `kill` event's `how` takes `'orphan'` with `killerName`
(a grenade whose thrower left before it went off: no suicide's -2, the thrower's name kept; m-13), and the room sends
`abandoned` when a classic round is abandoned with a side left empty (section 17.2; the port's stand-in -- the
original's `FUN_002bc530` D:L161109-161146 abandons only a late joiner below three, D:L161137-161141, research 315
§3.3; was: "`FUN_002bc530` L161130-161140"),
before the score that carries `timeLeft: null`. The page ends the round on it: the decals go (the original leaves the
level, whose teardown empties both pools, `FUN_0031af70` 218218-218219), the timer and the round screens with them,
and it posts "ABANDONED" (`dlgNetAbandoned`).

Protocol 8 (the sprint 4 merge, 2026-09-30): the launch branch's 7 above and web sprint 4's own 7 (M9, the arsenal:
the `loadout` request and its answer, the held item's id on a body, `BodyState.weapon`, the kit on a `spawn` and on
the welcome's players, the item a `shot` names, the weapon's `DisplayName` on a `kill`, section 10) took the same number
for different frames; merged, they are one wire at 8, so a page of either 7 is refused at the hello by either room.

Protocol 9 (web sprint 5 S2, 2026-09-30; research 95 §6): the character types. A player is one of its side's ARMORY
columns (0-3 within the side; SEAL 1 / TERRORIST 1 by default, R95.5), each its own body, kit and hit volumes. The hello
names the page's type for each side (`types`), since the side is the room's to give; a type the map's side does not offer
seats the default (`ARMORY_TYPE_FALLBACK_READING`). A `loadout` request may name the type its picks replay from
(`char`), refused `type` when the side does not offer it; the answer names the type held. A `spawn` and the welcome's
players name the type the body was rebuilt as (`char`), which the others draw; the snapshot carries none, since a type
changes only at a spawn. A living player's request is refused `alive` only in a round: waiting for the sides and between
rounds it is the ARMORY's, for the next spawn (`ARMORY_OUTSIDE_ROUND_READING`). In a round a player that has spawned in it
is refused a new type as `round` (dead or alive: WEAPON EXCHANGE changes the kit, never the type), a ghost seated in it
not. A spectator's request carries `types`, its ARMORY choice per side, unanswered: the room seats its promotion as it.
A protocol-8 page is refused at the hello.

Protocol 10 (web sprint 26 MAP-03, 2026-10-05; research 209 §11): the world on the wire. Every snapshot ends, after the
doors, with the room's environment -- u32 revision, u16 round epoch (the round serial), u16 count, then u16 instance id
and u8 state for each placed instance off its opening state -- always present (count 0 on a static map), so a 9 frame is
too short for a 10 page and a 10 frame has trailing bytes for a 9 one. The welcome carries the same (`env`), the round
`epoch`, the tick the round began (`startTick`, absent while no round has) and the map's `gameType`; `roundStart` names
its `epoch` and `startTick`; the client may send `loaded` (no room behaviour yet). A protocol-9 page is refused at the
hello ("protocol 9, this server speaks 10").

Protocol 11 (NET-WIRE, 2026-10-07; the owner's OT.R38 / H118; research 224): a frame-type byte heads every binary frame
(the snapshot 0, the voice 1 -- reserved for sprint 20's relay -- the commands 2; a type a peer does not take is dropped
without a throw). The snapshot carries a sections byte and the feet's origin (the room's map's bounds' centre), a body's
feet i16 at 1/8 unit from it, its flags a u32 (the hold code and its parity kept at bits 11-15), and the own state's
`facing` (yaw, pitch), which the page reconciles as it does the position (the look's cover is zero); the environment
rides only a snapshot whose revision or epoch changed for that connection (the welcome still carries it whole);
spectators keep 30 Hz. A protocol 10 `.s2r` still plays through the frozen decoders; a protocol-10 page is refused at the
hello ("protocol 10, this server speaks 11").

Protocol 12 (SEP-POP, 2026-10-31; OT.R93; research 80 section 6f): the command's stance byte carries the page's stance
mode in bit 3 of its low nibble (`Command.separate`), which the room's mover reads every tick to cut the stance clips by
the stick as the page's does in SEPARATE. The snapshot is unchanged; a protocol 11 `.s2r` still plays (its commands never
set the bit); a protocol-11 page is refused at the hello ("protocol 11, this server speaks 12"), as SA-49's grace gives
no old host to a release that changes the page's wire.

Protocol 13 (PLANT-AIM, 2026-11-02; research 214 section 2 "The plant's pick", research 217 section 1.3): the page names its plant pick -- the tent polygon its reticle strikes -- in an additive `bombAction` 'aim' field when it changes while carrying, and the room re-picks that node along the newest command's look from the eye and holds it each tick of the hold (`PLANT_PICK_FIREPOINT_READING`: the reach is 15 u from the posed firepoint, `+0x14b0`, D:L463874-463881). An older page is refused at the hello; the replay decoders still read 12. The fold's resend rule is `PLANT_AIM_RESEND_ADAPTATION` (a browser adaptation: the pick is re-sent past 4 u and 6 ticks).

Protocol 14 (ENEMY-RAISE ER-2, 2026-11-09; research 326 section 7, 321 section 7.7; reading -- ER-2's re-review PASS WITH FINDINGS (high), `agent-mail/evidence/mega/REVIEW-ER2-AND-ER-BATCH.md` Review 1): the owner's
raise state on the wire, the original's one field -- the owner packs its body's `FUN_005e0010` (`body+0xf74 & 0xef`, 1 up
or 2 down, D:L494306-494309) into the player record's byte +0x7e every frame (`FUN_002bd640` D:L161978) and each receiver
replays it on the copy (`FUN_002be150` D:L162310-162312). The page sends its own `WeaponRaise` state as the command's
`raised`, bit 7 of the last byte (the weapon narrowed to bits 4-6, its codes 0 and 1); the room relays it on the body's
`BodyFlag.Raised`, bit 16 of the u32, a bot's from its controller (`Player.raise`), never for a dead body; the copy runs
its own envelope from it. A protocol-13 page is refused at the hello ("protocol 13, this server speaks 14"); a 13 `.s2r`
plays on the live decoders (no 13 command set bit 7, no 13 room set bit 16), its copies on the old inference
(`REMOTE_HAND_RAISE_READING`).

Protocol 15 (PROTO-15, 2026-11-11; V19.R10, the main controller under the owner's authority, from v0.4.19's
version-skew review): no frame, field or event changed; the mover's rules did, protocols 12 and 13's class. The room runs
each page's commands through the page's own mover, and three of v0.4.19's mover changes make a 14 side and a 15 side
take different steps from the same commands: LADDER-CLIMB LC-1 (the ladder offered as CLIMB at its contact, mounted
only on the Action press; research 86 s2.3, s2.5), AIR-PROBE (the airborne floor probe once a game frame at the move's
end; research 399) and STEEP-LAUNCH (the steep floor's push a displacement, not a velocity; research 217 s2.8, LATER
833). Reconciliation carries the feet and the facing only, so a ladder one side mounted and the other did not is never
healed: a protocol-14 page is refused at the hello ("protocol 14, this server speaks 15"), and SA-49's grace gives no
v0.4.18 host to a release that changes the page's wire. A 14 `.s2r` plays on the live decoders (the bytes are 15's).
This paragraph changes no reading of the original: it records the port's version (a product-track record of the
simulation-track changes it names, each at its own level in its own note).

The owner's rulings of 2026-10-01 add, without a new version (both additive): the launch countdown's `countdown` event (`{ seconds }`, null when called off) and the welcome's and promotion's `countdown` (the seconds left); see the table's "launch countdown" row. The same play test found that the room's shape check took a `fire`'s `viewTick` for an integer while the page sends its interpolation clock, a fraction of a tick (`NetClient.viewTick`): every page's round was dropped unread. The check is now a finite number (`room.ts` `text`), which the rewind interpolates (`past`).

The `objectives` script was read again for this section from `MP51.ZDB:MZANIM.ZAR`, with `parseAnimSets` and
`decodeEffectProgram`, for the `start`, `mission_timer`, `abort`, `success`, `failure` and `game_over` sequences.

| rule | implemented | source |
|---|---|---|
| rooms | one classic room per map: while `RESPAWN_RULES_ENABLED` is off (the owner's ruling of 2026-09-29) a hello asking for respawn, a hello naming none and a server `RULES=respawn` all join classic, and `/rooms` lists classic rooms only; with the switch on (the respawn tests), one per map and rules, a hello without `rules` taking the server's `RULES` | the owner's brief; W3.R11; the ruling |
| launch | a classic room starts round 1 once both sides have a player; until then its players walk and respawn as in a respawn room | "There must be players on both teams to launch" `FUN_002c3cf0` L165325-165352, UIMnLOC 350/356; the walking room: `CLASSIC_WAITING_PLACEHOLDER` |
| launch countdown | **the owner's ruling of 2026-10-01** (`OWNER_LAUNCH_COUNTDOWN_S` = 10, `net/rules.ts`): once both sides have a player, a 10-second countdown runs before round 1 starts -- every page is told (`countdown` with the seconds, and the welcome's or promotion's `countdown` for a seat during it), and shows it in the HUD's clock and the message window as the lobby's "GAME STARTS IN 10 SECONDS"; a side emptied during it puts the room back to waiting (`countdown` null, the waiting line again). It is still the waiting room: no ghosts, the ARMORY's requests taken for the round's spawn, and the ARMORY may stay open through it (research 95 §8). The solo room starts at once; a respawn room, which plays from its first seat, has none (`Room.launchWaitS`, the clock and the welcome alike). Each page is told once: the seat that completes the sides by its welcome or promotion, the rest by the event | the owner's ruling; its shape is the lobby's own 10-second launch clock `mp_x_sec_clock` (section 18, `FUN_002a7560` L149578-149586) and its words "GAME STARTS IN" n "SECONDS" (UIMnLOC 354-355) |
| rounds | `mp_max_rounds` 11 (`MAX_ROUNDS`); the match goes to `mp_half_rounds` = (11 + 1) >> 1 = 6 | `FUN_002a6c50` L149073-149082; frame `A_49`; `FUN_001f5e70` L55628-55631 |
| match end | after a round: if rounds played >= 11, over unless level (level plays a tiebreaker); else over at 6 wins | MP51 `objectives` seq `game_over` (read this round: `end_of_round_round_count` >= `mp_max_rounds` -> IF `mp_score00` == `mp_score08` stop, ELSE `mp_game_over` = 1; ELSEIF either >= `mp_half_rounds`) |
| tiebreaker | another round while level after the last, again after a drawn tiebreaker; banner "PLAYING TIEBREAKER ROUND" | `game_over` above; `FUN_001fb420` L57633-57648 (0x3e3540 when `mp_max_rounds` < `mp_round_count` + 1) |
| elimination | from 15 s into the round, a side with no living player loses the round: `aiteam_08` == 0 is tested first (the SEALs win; also when both fell together), then `aiteam_00` == 0 | seq `start`: WAIT 5, WAIT 10, then the WHILE loop's IF chain |
| elimination's result | the winner's round win counted at once; "ALL TERRORISTS ELIMINATED" (0.7) / "SEALS VICTORIOUS!" (0.9), or "ALL SEALS ELIMINATED" / "TERRORISTS WIN!"; the result 23 s later; then the engine's 3 s and ROUND COMPLETE's 5 s | seq `start` (`mp_score0x` += 1, `mp_winner`, two MESSAGEs, WAIT 2); `success` / `failure` (WAIT 20, `round_count` += 1, `game_over`, WAIT 1); `mp51LOC` 5103-5106; `FUN_002a9b30` L150612-150672 |
| time-out | at 00:00, and not before 15 s, the round is a draw: no message, no hold, nobody gets the win | seq `mission_timer` (WAIT 15, WHILE `mp_timer` != 0) -> `abort` (`round_count` += 1, `mp_winner` = 99, `game_over`, `mission_timeout` = 1) |
| no respawn | the Action press does nothing while a classic round is on | `FUN_002a7560` L149405-149431 (respawn needs the option) |
| the dead | "You have died.  R2 Select new weapons." and the "cycle through living teammates" lines -- since web sprint 4 (M8) WEAPON EXCHANGE's prompt, drawn on the HUD as research 94 §B4 S1 reads it (`weaponSelect.ts` `promptLines`), no longer posted to the message window; Space follows each living teammate in turn (the page's fly camera behind the body, as the spectator's) | `FUN_001f97b0` L57000-57007 (0x3e32e0, 0x3e3350, 0x3e3380); `FUN_005979a0` L454484-454489; key: `SPECTATOR_PAD_PLACEHOLDER` |
| late joiners | a player seated mid-round is a ghost: not alive, not counted, placed at the next round; the page posts the ghost lines | UIMnLOC 352-353; `FUN_001f97b0` L57047-57062 (0x3e31c0, 0x3e31f0, 0x3e3280, 0x3e32b0) |
| between rounds | everyone, the ghosts too, is placed at a round-start slot of the side with a full kit; the team scores reset | `FUN_00223680` L75913-75931 (`FUN_00598b90(p,0)` for every non-ghost player; `FUN_002a7d40`) |
| start slot | the player slot's own record, not a random one | L158760-158787; the player slot is the client index, `list[clientIndex % count]` (research 179 section 9.2; `START_SLOT_LINK_PLACEHOLDER` retired in web sprint 25, PF-11) |
| magazines per round | restored: every round start rebuilds the kit at `Ammo_Capacity` x `NumMags` | `FUN_00598b90` -> `FUN_00599b60` (L455604, called at L455158) -> `FUN_00599f00` (L455719, called at L455674) (section 4.3); the kit: the character type's `default_weapons` or its weapon-select picks (web sprint 4, R94.3/R94.7; `KIT_PLACEHOLDER` retired) |
| scoring | kills +2, suicides and team kills -2 (section 8), +1 each alive at the round's end, +5 each on `mp_winner`'s side (none on a draw), the same as the respawn match | `FUN_00223970` L76146-76165: the bonus loop has no respawn test |
| screens | ROUND COMPLETE between rounds; FINAL ROUND and GAME COMPLETE after the match; WINNER / LOSER / DRAW as the respawn match | section 18.2.4-3; `CallRoundATie` |
| idle kick | the dead and the ghosts do not age toward W3.R13's idle kick while a classic round is on (they can only watch) | the owner's addition (W3.R13); the original has none |
| the banner | "STARTING ROUND r OF n" from the server's round/count; classic's default n is 11, respawn's is 1. Corrected 2026-10-21 (research 348): the previous respawn 11-round assumption contradicted CREATE GAME's `mp_max_rounds = 1` | disc setting: reading, independently re-read; inherited `FUN_001fb420` L57633-57648 reads `mp_max_rounds` and `mp_round_count` with no respawn flag (pending fresh executable review); no capture comparison |
| objective | "OBJECTIVE:" / "ELIMINATE THE TERRORISTS" for the SEALs, "ELIMINATE THE SEALS" for the Terrorists, on every map | seq `start` / `start2` (raw names 38-40); other game types' objectives: `OBJECTIVE_BY_MAP_PLACEHOLDER` |

### 19.1 Placeholders (named in the code)

- `CLASSIC_WAITING_PLACEHOLDER`: the room before both sides are seated, and after a side empties. The original never
  plays that state: it stays in its lobby, or -- for a late joiner below three -- abandons the game (`FUN_002bc530`
  D:L161137-161141, research 315 §3.3; was: "or abandons the game (`FUN_002bc530` L161130-161140)"). An abandoned
  round's waiting room starts clean, as the original's lobby does: the room sends `abandoned` and the page empties the
  decal pools on it (protocol 7, now 8).
  Since 2026-09-30 the welcome (and a promotion) says `waiting` while it lasts.
- `WAITING_LINE_READING` (`netPage.ts`, 2026-09-30): the line the page posts in that waiting room, in place of the
  round's banner and again after ABANDONED -- the original's lobby line for the same state, "There must be players on
  both teams to launch" (`FUN_002c3cf0` L165325-165352, UIMnLOC 350 / 356; section 7). A reading: the original shows it
  in the lobby, whose launch it refuses; the page has this room where the lobby would be.
- `START_SLOT_LINK_PLACEHOLDER` was retired in web sprint 25 (PF-11): `+0xfc8` is the console's DME client index, and
  the room gives each seat a lowest-free client index and starts it on `list[clientIndex % count]` (research 179
  section 9.2, V1 #6; owed: a two-console capture of `+0xfc8` against the start position).
- `HELP_GLYPH_LEAD_PLACEHOLDER` was retired in web sprint 4 (M8): the lines are research 94 §B4's (`promptLines`, the
  d-pad glyphs 0xa3 / 0xaf in place, `GLYPH_READING` / `PAD_GLYPH_PLACEHOLDER`), no longer the page's own words.
  The d-pad glyph reading is settled in research 95 §5.4 (0xa3 right, 0xaf left; `DPAD_GLYPH_DIRECTION_READING`).
- `OBJECTIVE_BY_MAP_PLACEHOLDER` was retired in web sprint 26 (PF-12): the rooms run each map's game type's rules
  (`missionlist.rdr` TYPE, `modeRules`) and the page posts the map's own `start` lines -- research 192 s1-s3 and 210 s1-s2.
- `RESPAWN_BANNER_PLACEHOLDER` was retired from the dormant code by RSP-2 (2026-10-21, research 348): its count comes
  from the original CREATE GAME setting, 1. The executable banner reader and original-runtime display remain
  unverified at the limits stated there. `SPECTATOR_PAD_PLACEHOLDER` was retired in web sprint 29
  (PF-31: the spectator's pad read, research 232 s5; the page's last use gone in wave 4).
- `KIT_PLACEHOLDER` was retired in web sprint 4 (M3/M4): the kit is the character type's (section 16's row).

## 20. The single-player match and the blast on the player (2026-09-29)

The owner, 2026-09-29: "should grenades be doing damage? they do not appear to be to myself, nor are they knocking me"
and "let's make offline tick rounds etc too". Offline, the page had no match: no health, no deaths, no rounds.

**The design** (`packages/viewer/src/net/loopback.ts`): offline, in reCOM mode, the page runs the match server's own
`Room` (`packages/match/src/room.ts` -- no socket, no Node in it; imported as it is, not moved) inside the page, behind
a socket that never leaves it (`LoopbackMatch.socket`), and joins it with the same `NetClient` and `NetPage` a match uses.
One implementation, online and off: the round's clock and banner ("STARTING ROUND 1 OF 11"), the round and match
screens, the game's damage (bullets, falls, blasts), deaths and death clips, the classic round's end and the next
round's fresh SEAL (with the respawn ruleset switched on, respawns: the press after the fade, at the respawn records --
`LoadedMap.respawns` carries the slots' twins, placed as the server places them), the scores and the scoreboard. The room is stepped at 60 Hz. With no C4 live, a slow frame is caught up at most five ticks a wake. While a C4 is live, a kept gap is replayed whole, up to one second of ticks; only a stall longer than a second is dropped (research 209 §18). The dedicated match server still catches up at most five steps a wake (research 223). Its
frames cross on a microtask. The room gets its own copy of the hull (its doors turn their polygons; the page's hull
follows the snapshots, as online) and the page's clips (`simClipsOfPlay`; a match made before the worker sent them is
made again when they come). The match is off with `&nomatch` (the old free walk), or with `&fly` together with
`?devmode` (Play opened in the developer's fly camera; a bare `&fly` is ignored and dropped, `flyAccess.ts`
`soloMatchOn`); `soloMatch.spec.ts` plays it on purpose, and every other e2e spec opens with one of the two
(`test/flyAccess.test.ts` scans them). A build with multiplayer off (`VITE_S2U_MULTIPLAYER=off`, the site's) keeps it:
it is single player and needs no network.

The room runs `solo` (`RoomOptions.solo`, the only change to the room besides the blast):

| rule | implemented | source |
|---|---|---|
| the player's side | the host's: the SEALs | `FUN_002c5450` L166238-166262 (section 7: "host: SEALs"); `Lobby.join(..., host)` |
| the idle kick | none | the owner's W3.R13 kick is the server's guard; a page alone takes no seat from anyone |
| classic's launch | round 1 starts with the one player | `SOLO_ROUND_PLACEHOLDER`: the game launches only with both sides seated (`FUN_002c3cf0` L165325-165352), so it has no one-player round |
| classic's elimination | a side with nobody on it is never eliminated: the round runs to its clock (a draw at 00:00, `mission_timer` -> `abort`); the lone SEAL dead eliminates the SEALs, the Terrorists win the round | the `objectives` script's tests (section 18.2) with `SOLO_ROUND_PLACEHOLDER`'s empty side (the script's `aiteam_08 == 0` would give the SEALs every round at 15 s) |
| the rules | classic, as online (`RESPAWN_RULES_ENABLED` off): no respawn; the lone SEAL's death ends the round for the Terrorists and the next round stands a fresh SEAL at its start slot. With the switch on (the loopback's respawn tests) the respawn match: one timed round, the press after 10 s, the respawn records | sections 4, 18, 19 |

**The blast on the player** (research 85 section 12 has the whole table): the thrower is not spared (`FUN_005ac070`
asks no thrower); a wall between the blast and the head stops all of it; each fragment strikes the head 30 %, the body
30 %, each limb 10 % (`.data` `DAT_006508e0` / `DAT_006508d0`, below); the knock (`FUN_0057e770`) lifts a standing or
crouched SEAL at least `f x 50` u/s upward (the push along the line capped at 100; `FUN_0057e770` L441052-441063,
research 85 section 12) in `Fall forward` / `Fall backwards`, then `Land ...` and `Get up ...` (a dead SEAL stays down,
the death camera on it); the ears ring (the mix at 0.35 held 5 s, then faded back over 5 s, `FUN_003410d0`
L241137-241172). Offline and online, through `resolveBlast` in the room.

### 20.1 Placeholders: one added, three resolved from `.data`

- `SOLO_ROUND_PLACEHOLDER` (`net/rules.ts`, the room's `solo`): classic's round 1 starts with the one player, and a
  side with nobody on it is never eliminated (the table above); the game launches only with both sides seated
  (`FUN_002c3cf0` L165325-165352), so it has no one-player round.
- `SOLO_IS_NETWORK_READING` (`net/loopback.ts`, 2026-09-30): the single-player match runs the network branch of every
  `DAT_0045a0c1` rule. With the flag clear the game's death camera is mode 2 (`FUN_002980d0` 141363-141369: `+0x168`
  1.0, `+0x14c` 2.5 s, `DAT_004365dc |= 1`, no orbit turn in `FUN_00297a30` 141143-141221, then the campaign's failure
  path 141400-141412); the page takes the network modes 3/6 (141370-141375; `deathCamera.ts` `newDeathCamera`). Also on
  that branch: no wounded groans (`FUN_005a33b0` L460231, single player only) and SELECT holding the scoreboard
  (research 87 section 9). The flag-clear path is the campaign, which has no one-player MP round
  (`SOLO_ROUND_PLACEHOLDER`), so there is no single-player rule to port. Test: `test/deathCamera.test.ts`.

Resolved (read from `game/disc/socom2_game.elf`, file offset = va - 0x4c5380 + 0x2f7a80):

| name (section 16) | value | now |
|---|---|---|
| `LIMB_SPILL_SCALE_PLACEHOLDER` / `LIMB_SPILL_PIERCING_PLACEHOLDER` | `DAT_006508a8` = 0x3e99999a (0.3), `DAT_006508b0` = 0x41200000 (10) | resolved: `LIMB_SPILL`, `LIMB_SPILL_PIERCING` in `net/damage.ts`: a hit on a spent limb is 0.3 of it on the body, through the armour |
| `FRAGMENT_PART_TABLE_PLACEHOLDER` | thresholds 0.3, 0.6, 0.7, 0.8, 0.9, 1.0; parts 00 03 02 01 05 04 (the receiver's copy at 0x6508f8 the same) | resolved: `FRAGMENT_ROLLS`, `FRAGMENT_PARTS`, `fragmentPart` |
| `SHOTGUN_PELLET_RANGE_SQ_PLACEHOLDER` | `DAT_006508b8` 2500, `DAT_006508c0` 6400, `DAT_006508c8` 22500 (squared: 50, 80, 150 units) | resolved: read only; no shotgun in the kits |

Tests: `test/loopback.test.ts` (the join as the host's SEAL, the commands in the room, a grenade at the feet killing the
player through the client, the respawn at a respawn record, classic alone, the close), `match/test/roomBlast.test.ts`
(the solo rules), with research 85 section 12's; `test/localDeath.test.ts` plays the solo classic round through the
page's own `NetPage` (the owner's respawn-off ruling of 2026-09-29): the lone SEAL's death at its own grenade, no
respawn on the press, "ALL SEALS ELIMINATED" / "TERRORISTS WIN!" at 15 s (never a SEAL win for the empty side), the
result 23 s later (Terrorists 1, the SEAL's row -2: the suicide, no bonus), ROUND COMPLETE with the SEALs LOSER, then
round 2 ("STARTING ROUND 2 OF 11") standing a fresh SEAL at its start slot; its respawn-ruleset twin forces the switch
on. E2E owed (no browser this round): `e2e/soloMatch.spec.ts`.

## 21. The flinch, seen by every console (2026-10-02, the owner: "Other players do not see a hit animation on somebody. just the player being hit.")

| value | meaning | citation |
|---|---|---|
| a hit that leaves the victim alive with its overall health (`+0x1044`) lower plays a flinch, unless the cause is a fall (7) or a blast (4) and only where the victim's controller is local (`+0x34` false) | the reaction runs on the victim's own console | `FUN_005a54d0` L461394-461408 |
| the clip: `damanim.rdr` `<PART>_FLINCH_ANIMATIONS[stance]` (table 0x44d230, `part x 0x24 + stance x 0xc`), random in the list | stand: HEAD and RARM `Flinch right arm`; LARM `Flinch left arm`, `Hit shoulder`; BODY `Flinch right arm`, `Flinch left arm`, `Hit stomach01`, `Hit01`; RLEG / LLEG `Flinch right leg` / `left leg`. Crouch `Crouch flinch`, prone `Prone flinch` for every part. Through `animset.rdr`: `seal_flinch_rarm/larm/rleg/lleg`, `seal_crouch_rflinch`, `seal_prone_rflinch`, `guard_hit_shoulder`, `guard_hit_stomach01`, `guard_hit01` (all in `MOTION_P.ZAR`); the `Pistol ...` names have no anim-set entry | `FUN_005a0270` L458712-458827, table read L458783-458785; damanim.rdr, animset.rdr |
| online, a draw of one of the three long hits is drawn again among the list's other clips | the three: `Hit stomach01`, `Hit shoulder`, `Hit01` (`DAT_003dedf0/f8`, `DAT_003dee00` = the anim types of the strings at ELF 0x661d60/70/80); this names the three of §2's row "MP skips three long clips" | L458795-458825; L495301-495303 |
| the clip is started as the actor's motion and, online and local, sent to every console: message kind 0xf with the motion's id | the others play the victim's flinch on their copy of it | `FUN_005a2690` L460025, L460048 -> `FUN_00588ab0` L446015 -> `FUN_002bbaf0` L160773 (`FUN_0030cef0`, to all); anim-set entries flagged `network_log` |
| `FUN_005a2690`'s own refusals (ladder, states 9/10, the long hits playing, `FUN_005a7980`, a 0x40 motion) | not all on the wire: the viewer plays a received flinch over the body's ground play only | `FLINCH_GATE_READING` (`packages/viewer/src/remotePlayers.ts`) |

The viewer (2026-10-02): the room draws the clip (`net/deaths.ts` `flinchClip`) for a non-lethal round, the shotgun's
volley included, and sends `flinch` to every page but the victim's (additive to protocol 9); the page plays it on the
victim's body (`RemotePlayers.flinch`). Before it no page played a flinch: the victim's page showed the health bar's
change only (`hurt`), the others nothing. The victim's own body still plays none (its view unchanged, by the brief;
superseded the same day by MATCH-FIX-2, below).
A launched round's direct hit on a body that leaves it alive flinches it too (`room.ts` `directHit`): under
`IMPACT_HIT_READING` (research 94) that hit is a bullet's, and bullets reach `FUN_005a54d0` as cause 5 (`FUN_005abbc0`
L464731); only the blast's own handler passes cause 4 (`FUN_005a0e70` L459285), which the gate skips. A hit wholly taken
by the part's armour (`MP_ARMOUR`) lowers no health and plays nothing (L461397).

**The victim's own body (MATCH-FIX-2, 2026-10-02; the controller's ruling under the 1:1 mission, the owner told).** The
read, for the local actor (the victim's own console, `+0x34` false):

| value | meaning | citation |
|---|---|---|
| one clip: `FUN_005a54d0` picks it once (`FUN_005a0270`) and hands it to `FUN_005a2690`, which starts that motion on the actor and then sends the same id | the victim plays what the others are sent: the room's one draw must reach the victim's page too | L461401-461405; `FUN_00588bc0(actor, motion, state, 0, 0xd)` L460019, `FUN_00588ab0(actor, 0xf, motion)` L460025 (twin L460042/L460048) |
| before the start, `FUN_0058a4d0(actor, 0)` pops the actor's motion stack (`+0x1c0`, count `+0x1c8`) down while its top is not a motion of kind 1, 0x12 or 0x1a; `FUN_00588bc0` then pushes the flinch | one motion stack, the flinch pushed over the base play; a second hit pops the first flinch and starts its own (no double play) | L460018; `FUN_0058a4d0` D:L446751-446780 |
| the started motion's `+0x28` gets bits 4 and 2 | their readers unread: whether the flinch holds the legs, the stick, the aim or the trigger is not in `FUN_005a54d0` / `FUN_005a2690`, which touch no controller or input | L460021-460024; `FLINCH_LAYER_PLACEHOLDER` |
| refused: the playing motion's `+0x2b` 8 or state 8; states 9 and 10; state 5 (the existing note's ladder); the three long hits playing; `FUN_005a7980(actor, 1)`; a 0x40 motion outside kinds 1/0x12/0x1a; `piVar8[0x3ae]` set | none while dead; none over a ladder | L459896 (9), L459925 (10), L460005-460017 |
| refused too (the review of MATCH-FIX-2, 2026-10-02; corrected by its second review): the whole gate runs only while `FUN_00588030(actor)` is 0 (it tests the motion kinds `DAT_003deed0`/`d8`; when it is not 0 the else branch only sets the playing motion's `+0x2b` to 8, for a death call or with bit 4 of `+0xe1` clear: no flinch); with bit 4 of the actor's `+0xe1` clear a non-death call is not refused but made a kind-8 call (`param_3` 8, the clip `FUN_005a0700(actor, 3)`), and with that bit clear in state 8 nothing runs; a non-death call returns early while the actor plays a motion of kind `DAT_003dee08`, `20` or `48`; any call returns while one of kind `DAT_003dee40` plays (a death call first pops `piVar8[0x3ab]`'s stack) or one of kind `DAT_003dee18`, `30` or `38`; the start also needs `piVar8[0x14a]` not `DAT_0044d400`/`410` and that bit 4 set (L460013) | nine motion kinds (seven, and `FUN_00588030`'s two) and two conditions more, what they are unread: the list is what is read, not a proof that it is all. A flinch is a non-death call on a live actor; bit 4 clear turns it into the death branch's play, not a flinch | L459887-459895, `FUN_00588030` D:L445700, else L460064-460066; L459908-459911, L459939-459955; L459912-459923; L459928-459938; L460010, L460013; `FLINCH_GATE_READING` |
| a death on a later hit: `FUN_005a54d0`'s dead branch calls `FUN_005a2690(actor, clip, 8)`, whose kind-8 branch (`param_3` 8) plays the death clip | the death ends the flinch | L461389; the branch L459978-460003 |
| the first-person eye: `FUN_0029ae50` places it on the body's node `+0x2e8` (research 84 "Where the first-person eye sits") | if that node is posed, the original's first-person view moves with the flinch; which node it is is unread (PLAT-36) | research 84 L397-408 |

The viewer: the room sends the `flinch` event to every page, the victim's included (`room.ts` `flinch`, one draw),
rather than a clip on `hurt`: a `hurt` also goes out for a hit the armour wholly takes (no flinch), and a page from
before it already drops a `flinch` naming its own id, so old pages and old rooms (no `flinch` to the victim) keep
working. The victim's page plays the clip on its own body through the walk as its death clip is played
(`walk.ts` `setFlinchPose`, `netPage.ts`): over the ground play only, dropped when played through, over a traversal
clip or a mover action, and ended by `setDeathPose` (a death, a spawn, a close or a drop); none while dead. The mover
keeps the stick, the look and the trigger (`FLINCH_LAYER_PLACEHOLDER`). In first person the body is not drawn and the
page's eye is `scopeEyeHeight`, not a node (the original's may move; PLAT-36), but the hidden body is posed all the
same (corrected on review, 2026-10-02): the muzzle the local round's leg starts from (`fire.ts`, and the accuracy
pip's `blockedMuzzle` in third person) and the posed root the third-person camera stands on (`walk.setPosedRoot`,
`FUN_0029a950`) follow the clip while it plays (`play.test.ts`). Cosmetic: the room's round takes no origin from the
page. The
health-drop gate is pinned (`room.test.ts`: a round of 14 at piercing 0 on the body's armour 25, no flinch for anyone).

### 21.1 Placeholders (2026-10-02)

- `FLINCH_GATE_READING` (`remotePlayers.ts`): `FUN_005a2690`'s refusals on the victim's own actor are not all on the
  wire; the page plays a received flinch over the body's ground play only (no traversal clip, no mover action, alive).
  The page's own body takes the same gate (`walk.ts` `setFlinchPose`, MATCH-FIX-2), not the game's own refusals
  (section 21's two "refused" rows, the second added on review: `FUN_00588030`, seven motion kinds, `piVar8[0x14a]`,
  the `+0xe1` bit).
- `FLINCH_LAYER_PLACEHOLDER` (`remotePlayers.ts`): the game starts the flinch through `FUN_00588bc0(actor, motion,
  state, 0, 0xd)` (`FUN_005a2690` L460019, L460042), pushed on the actor's one motion stack after `FUN_0058a4d0` pops
  it to the base play (L460018), its layering over the body's other play unread; the page draws the
  clip whole-body through the traversal seam (a body hit on the run is drawn standing in the flinch, its feet sliding)
  and from the `flinch` event's arrival, about one interpolation delay before the body is drawn at the hit's tick.
  MATCH-FIX-2: on the victim's own page too, from the event's arrival (a round trip after the hit, where the game's is
  at the hit); and whether the flinch takes the victim's control while it plays (the motion's `+0x28` bits 4 and 2,
  L460021-460024, their readers unread) is not read: the page leaves the stick, the look and the trigger alone. The
  whole-body clip poses the page's own body in the scope too (hidden): the muzzle and the posed root follow it in both
  views -- what the game's posed actor gives if its flinch is whole-body, the unread layering.
- `FLINCH_STANCE_READING` (`net/deaths.ts`): `FUN_005a0270` L458734-458780 picks the stance row from the actor's state
  (7/9/10 stand, 8 and the rest `FUN_0057dbb0`), a stance-change motion's phase (0x11/0x13/0x19) and the `+0x418`
  prone bit; the room reads the body's posture for all of it.

## 22. Chris's round fixes, ported (INT-NET-1, 2026-10-02)

The round's small fixes from Chris's browser-beta-v5 (`chris/browser-beta-integration` d578f347, the triage's areas
remote-players, netcode-combat, explosives-equipment and audio), each re-implemented on protocol 9 with his test
adapted and seen failing first on our tree.

### 22.1 The others' death clip kept across older alive snapshots

A page draws the others `INTERP_DELAY_MS` (100 ms, `net/client.ts`) behind the room, but the reliable `kill` event
(no tick) is acted on when it arrives: `RemotePlayers.died` sets the victim's death clip while the body is still drawn
from alive snapshots, and `frame` cleared the clip on every alive snapshot, so the body was drawn dead without its
death clip. The same timing is `FLINCH_LAYER_PLACEHOLDER`'s (section 21.1). The fix is
his: the clip is cleared only on a dead-to-alive change (a respawn); a kill that arrives before the body's first
snapshot is kept (ours already held it in `pendingDeaths`, and the first alive snapshot then cleared it too); a death
still ends a playing flinch (`died`, `stepFlinch`). No value of the original's is changed: it is the page's event
order. `viewer/test/remoteDeath.test.ts` (his two cases and the flinch's). Not changed: a kill whose body is never drawn
dead (a reset racing the snapshot) keeps its clip until the next `died`, which every death calls; the clip still starts
when the dead snapshot is drawn, not at the kill's tick (the event carries none).

### 22.2 The others hear a reload

The original: `FUN_005c2a90` (477379-477560) takes the next magazine, starts the reload's motion (`FUN_005a82e0`) and in
the same step plays the weapon's `ReloadSound` (`+0x98`) at the actor (`+0x1c`), volume 1.0 (477479-477487; the
refill branches' 477508, 477536; research 81 §5). It runs in the kit's frame `FUN_005c0fd0` (476549-476561, when the
`kit+0x820` timer runs out), which the actor update `FUN_005506a0` calls with no test of the controller's locality
(L417907; its one gate, the actor's `+0xf40` byte at L417822, is unread) -- so whichever console runs a reload on its
copy of an actor plays the sound there, at that actor. What is not traced is how a remote actor's kit
comes to run it: the pad's request (`FUN_00594cf0` L453459-453463, `FUN_005c32b0`) reads the local pad
(`DAT_0044f108`); the automatic reload (`FUN_005c5340` L479316-479341) runs in the fire path; and the reload's motion is
not sent as the flinch's is (`FUN_005a82e0` L462786-462946 starts it with `FUN_00588bc0` and calls no `FUN_00588ab0`;
section 21 for the flinch's send). So the reading: a console hears another player's reload where its copy of the
actor reloads; the trigger on a peer is unread. The bolt's and pump's after-shot sound (`FUN_005c3000`, `+0xa0`,
L477643-477646) is played the same way and is not sent.

Ours had the sound for the page's own reload only (`walkSounds.ts`, `audio.onReload`): the page sends `reload` up
and the room told no one. Ported from Chris (his `room.ts` `reloadSound`, `netPage.ts` `deps.reloadSound`), on
protocol 9 as an additive event: once the room takes the magazine (`room.ts` `reload`, after its gates), every page
but the reloader's is sent `{ type: 'reloadSound', id, weapon, at }` -- **`weapon` the item's id** (his carried the
record's name; ours names items by id since protocol 7, as the shot does) and `at` the room's feet. The page plays
the record's sound at the body as it draws it (`RemotePlayers.feet`), the room's feet while none is drawn; an id it
has no record of plays nothing (the shot's fallback to the side's rifle would be another weapon's sound). Tests:
`central/test/room.test.ts` (his case: one to each peer, none to the reloader, none for a refused reload) and
`viewer/test/netPageRound.test.ts`. `REMOTE_RELOAD_SOUND_READING` (`netPage.ts`).

**The others see a reload (REMOTE-RELOAD, 2026-11-09; reading: its review PASS WITH FINDINGS, medium, the folds re-checked PASS, high, `agent-mail/evidence/mega/REVIEWS-RECORDED-IN-SESSION-99.md`).** A tester's report (Discord,
2026-11-09 ~20:06Z: a teammate's reload not drawn after a mid-game join) led to a scope by source inspection that found
the port drew no reload on any remote body at any time: the `reloadSound` above played only the sound. Two pieces of
evidence say the original draws it. (1) `FUN_005c2a90` starts the reload's motion (`FUN_005a82e0`, D:L477479) and plays
the `ReloadSound` (D:L477484) in the one step, so a console that hears a reload on its copy of an actor also starts the
clip there. (2) The owner's observation of the original running (Craig, 2026-11-09 ~20:55Z, in the controller's seat,
verbatim: "the original does show reloads. confirm if needed for info." -- a playtest observation, not a capture),
which answers research 179's open question (`REMOTE_RELOAD_SOUND_READING`'s row: "a manual reload may have no sender")
in favour of a sender existing. **How** the original carries it is still unread: the copy's record replay
`FUN_002be150` (D:L162221-162480) calls none of the reload starters and the packed player record `FUN_002bd640`
(D:L161854ff) holds no field identified as reload state; the two-console capture (research 206, item 18: B's audio and
B's view of A's body through the reload, amended 2026-11-09) settles it.

The port: the room's `reloadSound` for the hand's reload now also carries the take its lock was set from (`room.ts`
`reload`: `posture`, `moving` = `reloadMoving` of the command's velocity, `family` = `reloadFamily`, `seconds` =
`reloadLockSeconds`), additive under protocol 14 (`net/protocol.ts`: an older page ignores the fields; an event
without them, an older room's, plays the sound alone). The page hands another body's to `RemotePlayers.reload`, which
starts that body's reload clip through `Play.remoteReload` (`WeaponPose.startReload`): the posture's still clip, or the
family's moving overlay (`seal_mv_reload` for the rifle) when the body moved at the take. The copy's play cuts a still
clip on its replicated stick as the page's own (`Play.frame`'s `reloadCut`, `FUN_00550ef0` D:L418182-418185: the
rifle's carried on as the overlay, the prone one ended), and the clip runs out on its own clock. A death on the copy
ends any clip (the body is gone); a flinch ends only a crouched or prone still clip (`Play.stopRemoteReload`,
`WeaponPose.stillHeld`), as the page's own: its flinch ends the still reload's hold (`fire.ts` `reloadEndOfBody`,
family 'reload'), which `walk.ts` `holdReload` makes crouched or prone only (`mover.ts` `reloadHold`), and the room
keeps the lock -- a standing still clip and the moving overlay play on (the review's F1, 2026-11-09; was: every flinch
ended it, under a cite of the knock's lines). A blast's knock is what clears the moving-reload overlay and pops the
stack (`FUN_0057e770` D:L440992-440998: `FUN_005a5da0` the overlay channel, `FUN_0058a4d0` the stack); the page's own
reload ends there (`reloadPopped`), another body's is not wired yet (LATER 811). A reload decided after a worded
turret take, whose clip the room cuts at the take (`mountKitLate`), is told with no take, the sound alone (the
review's F3). The page's own
id is unchanged (its reload drew itself). `REMOTE_RELOAD_MOTION_READING` (`netPage.ts`, 'room event at the take').
Tests: `viewer/test/remoteReload.test.ts` (the clip on the play), `viewer/test/remotePlayers.test.ts` (the entry),
`viewer/test/netPageRound.test.ts` (the routing), `central/test/roomRemoteReload.test.ts` (the room's fields equal
its lock's). Not built: a reload under way at a join or a replay seek is not caught up (the event is transient,
`replay/fold.ts`; the snapshot's still reload hold code is not read into a clip -- no catch-up built on a guess); a
turret's reload sends no take; the bolt's and pump's after-shot clip for another body is not sent (LATER 810).

### 22.3 The others' footfalls heard

The original: the footfall (`FUN_005a3570`, 460266-460378; research 81 §4) is called by the actor update
`FUN_005506a0` (L417909) with no test of the controller's locality, so a console sounds the others' steps as its own:
at the foot (`vtable+0x14`, `FUN_005a39b0` 460385-460434), the crawl prone (the left foot's call skipped), else the
step or the stealth step by the controller's stick. Two things are not read: the footfall's own gate on the actor's
`+0xe0` bit (460295), and what a remote actor's controller holds for the stick -- the page takes the replicated ground
motion's forward and right (`BodyState.groundForward/Right`), their larger magnitude as its own walk takes its stick
(`REMOTE_STEP_STICK_READING`).

Ours played the page's own body's footfalls only (`main.ts` `play.onEvent` -> `walkSounds.playEvent`); the others'
`Play`s had no listener. Ported from Chris (his `RemotePlayers` sound callback and `main.ts` call site): each
remote body's `Play` events are taken while it is alive, its footfalls turned into a step by `remoteFootfall`
(`remotePlayers.ts`, the rule in one place, not inline in `main.ts` as his was) and handed to the page, which plays
`GameAudio.onFootstep` with the floor's material under the body's feet. Clip callbacks (`jump_whoosh`) and landings of
the others are not played (as his): whether the original sounds them on another console is not read here.
`viewer/test/remoteFootsteps.test.ts` (new: the rule, a living body heard, a dead one not).

### 22.4 The claymore online: the ground under a charge, the Detonator's owner

Two of Chris's claymore fixes hold on our wire (web sprint 4 M7) and are ported; his own messages are not. The room
refuses a claymore or a PMN with no surface under it (one in mid-air), as the page places it (`FUN_005c2430`) but with
the original's ceiling at the hand, not his feet + 1; and the page's copy of another player's claymore goes off at its
owner's Detonator only (`CZKit_DetonateRemoteExplosives` +0xac). The cone's measuring point is left open
(`CLAYMORE_CONE_POINT_READING`). Research 85 §9.7.2 holds the read and its names.

### 22.5 A name that is no item (hardening)

Not the original's behaviour but the page's own robustness (Chris's `select()` refusal, the triage's challenge: port
it). `GrenadeThrower.select` looked the item up on plain objects, so `select('constructor')` found
`Object.prototype.constructor`, passed the slot gate, took it up as the item in the hand and threw from the hand
model's refresh, leaving the pouch broken. Records and counts are now read by own keys only (`gate`, `leftOf`, and
`launchRemote` for the wire's `grenade` kind): such a name is refused, the hand unchanged. His other half (C4 refused)
is not ours: C4 is a kit item here (research 94 §C5.1). `viewer/test/grenade.test.ts`.

### 22.9 Placeholders and readings (2026-10-02)

| name | what stands in | what would settle it |
|---|---|---|
| `REMOTE_RELOAD_SOUND_READING` (`viewer/src/netPage.ts`) | the room sends `reloadSound` when it takes a magazine; the other pages play the item's `ReloadSound` at the drawn body; the after-shot sound is not sent | the trigger of a remote actor's reload on a peer (`FUN_005c2a90`'s and `FUN_005c32b0`'s callers for a non-local controller) |
| `REMOTE_RELOAD_MOTION_READING` (`viewer/src/netPage.ts`; 2026-11-09, REMOTE-RELOAD) | the room's `reloadSound` at the take carries the posture, moving, family and seconds its lock was set from; the other pages start that body's reload clip (the still clip of the posture, or the moving overlay) -- that the original draws it is `FUN_005c2a90`'s one step (D:L477479, D:L477484) and the owner's observation of the original (2026-11-09, not a capture) | what the original's wire carries for another player's reload, and when the peer's clip starts: the two-console capture (research 206 item 18: B's audio and B's view of A's body) |
| `REMOTE_STEP_STICK_READING` (`viewer/src/remotePlayers.ts`) | another player's step or stealth step by its replicated ground motion's larger axis; every drawn, living body's footfall heard | what a remote actor's controller holds for `FUN_005a39b0`'s stick floats; `FUN_005a3570`'s `+0xe0` gate |

## 23. The blood on a hit, seen by every page (INT-NET-2, 2026-10-02)

Chris's physical playtests saw blood on a hit on both consoles; his browser-beta-v5 (`chris/browser-beta-integration`
d578f347: `effects.ts` `confirmedBlood`, `netPage.ts`, `test/confirmedBlood.test.ts`) plays `bullet_hit_person` from a
new server combat event once per event on every page, the shooter's included. Ours played nothing on a body: the room's
`shot` went out with `normal` and `material` null when a body stopped the round. The read (INT.R6: the original's route
first):

| value | meaning | citation |
|---|---|---|
| a round's hits are walked nearest first (`FUN_003c9b70`), each through `FUN_003c8920`: the struck polygon's material (`FUN_002dc1d0`), the node's damage handler (`vtable+8`), the mark (`FUN_003d0ba0`), then the impact `FUN_003d22e0(weapon, material)` played by `FUN_00272bb0` at the hit with the normal and the round's velocity | the blood is the material route: the struck node's material names the impact (research 89 §5) | D:L319383, D:L319418, D:L319421, D:L319497-319500 |
| a body's material is `PERSON`: `DAT_003e14f8` is looked up by that name (the string at 0x3fd328) at the effects' load | a body hit plays `bullet_hit_person` (red flashes and streaks) and `.BUL_INTO_BODY` (research 89 §5's row 13) | `FUN_003d03d0` D:L323423; D:L319391 |
| a second hit of the same body by one round (`PERSON`, the node walked up to its root, the round's `+0x78`) plays no mark and no impact | one blood a body a round | D:L319391-319405 |
| the impact has **no test of the damage**: the handler runs, then the mark and the impact whatever it did; their one gate is the repeat body and `DAT_003e1540` (1 on the disc) | a round the armour wholly takes bleeds; a team-mate struck with friendly fire off bleeds | D:L319412-319504 |
| a miss (the range spent, return 4 before the handler) plays nothing | no blood for a miss | D:L319410-319411 |
| online, the damage is applied only from rounds flagged local (`projectile+4` bit 2); `FUN_003c8920` has no such gate | every console walks the shooter's round on its own copy of the victim, and plays the impact there: the blood is not sent, the round is | `FUN_005abbc0` D:L464698; the flag carried onto a projectile `FUN_003d2d70` spawns, D:L325637-325638 |

How a remote player's round reaches a console (the message that starts its projectile there) is not traced; that it
is walked there is read from the local-only damage gate above.

**Built** (protocol 9, additive as the `flinch` was): the room's `shot` is our replicated round. When a body stops it
(`room.ts` `fire`), the shot goes out with the body's point (`to`), the normal back along the round, the PERSON byte
(13: `materialTable`'s two built-ins and the SOILS order) and `body`, the struck player's id -- to every other page;
the shooter's is sent the same as an `impact` event (its own walk met no body: the page converges on the body and stops
there unmarked, research 84 §19). The `impact` is its own type, not the shooter's own `shot` (the INT-NET-2 review's
finding 1): a protocol-9 page built before it draws a `shot` of its own id as another player's round -- a second
muzzle, tracer and report -- and ignores an unknown type, so the change stays additive with the version kept.
The others' pages, the victim's included (third person), play it as any round (`Effects.onRound`: `<HitAnimName>_<material>`,
`bullet_hit_person`); the shooter's plays the impact alone (`NetPageDeps.roundImpact`: no second muzzle, tracer or
report); a `shot` of the page's own id plays nothing. Once a shot event; none for a miss; the armour's whole take and a team-mate bleed (the read above, against
his `damageApplied > 0` gate, which is not taken); the deaths' own effects and the muzzle flash are untouched. His
256-entry seen-set is not needed: a shot event is one round. His combat event is not introduced (the next task).
*Since P12* (2026-11-02, research 219 s3.2; reading, pending review): the page no longer stops its own round at the
body -- it walks past every body at PERSON's 0.97, as the room does, the body unmarked and its blood still the room's
`impact` -- and the `shot` carries `through`, every other world surface the round struck (additive), each page playing
an impact at each (`SHOT_EVENT_THROUGH_READING`): this section's last row, read as every console walking the round.
*Since P12b* (2026-11-02, research 219 s3.2; reading, pending review): a `shot` whose `to` is the first body carries the
round's end beside it (`end`, additive; the walk's stop, else its range spent -- where the shooter's page draws its own
tracer), and the others' tracer runs to it, as every console walking the round to its end would draw it; the impact,
the body hit and the report stay `to`'s (`SHOT_EVENT_BODIES_READING`).
Tests: `central/test/room.test.ts` (every other page's shot, the shooter's impact and no own shot, the armour's take,
no body no PERSON),
`viewer/test/confirmedBlood.test.ts` (his file re-expressed on the shot: the page's routing, and -- with `SOCOM_DISC` --
one `bullet_hit_person` and one `.BUL_INTO_BODY` a body hit, none for a hull hit or a miss).

**Found, not changed** (for the owner and the next task):
- the room stops a round at the first body (`room.ts` `fire`: penetration 0, "flesh is not in the materials' table",
  §1.3), while `PERSON` is 0.97 in `materials.rdr` (research 84 §13: 1.26 of the range kept at piercing 3) and
  `FUN_003c8920` lets the round on past a body (return 2 while within range, D:L319514-319517) -- the original's round
  goes through a body to what is behind it (`BODY_PENETRATION_READING`);
- the room walks every world polygon at `PENETRATION` 0.5 (`roundPath(..., () => 0.5, ...)` in `fire`), where the page
  walks the material table (research 84 §13): a wall the page stops a round at, the room lets 0.65 of the range through.
  **Closed 2026-11-02 (PEN-MATERIAL, reading, pending review):** the room takes each struck polygon's own material
  (`surfaceMaterial`, byte 0 the map's DefaultMaterial; `FUN_003c8920`: `FUN_002dc1d0` D:L319383, `DAT_0044f358`
  D:L319388, +0x24 D:L319473-319476, the cut D:L319510-319516), as the page and `sceneBlast` do
  (`match/test/roomPenetration.test.ts`).

### 23.1 Placeholders and readings (2026-10-02)

| name | what stands in | what would settle it |
|---|---|---|
| `OWN_BLOOD_READING` (`viewer/src/netPage.ts`) | the shooter's page plays its round's blood when the room's `impact` returns (its own `shot` plays nothing), a round trip after the round; the original's console walks its own round at once | none to read: the room's authority (a capture would measure the original's frame) |
| `BODY_BLOOD_MARK_PLACEHOLDER` (*note only*) | the page draws no blood mark: `FUN_003d0ba0` is called for a body hit too (D:L319421) with the PERSON row of `BULLET_MARK_SMALL` (blood 2-3, research 89 §5), but where it lands (the body's nodes, the surface behind, nowhere) is unread -- neither Chris's work nor ours establishes a lasting blood decal | read `FUN_003d0ba0` on a character node; a capture of a hit SEAL and the wall behind |
| `BODY_PENETRATION_READING` (*note only*) | the room stops a round at the first body (penetration 0); `PERSON` is 0.97 and `FUN_003c8920` lets the round on | read the body's nodes' material in `FUN_003c9b70`'s walk (whether each bone's hit carries PERSON's 0.97) and the owner's call |
