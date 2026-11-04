# 270 -- The open issues' evidence sweep (2026-10-10)

A cloud session's sweep (branch `ccr-ef8214e9-7mkm9s`, base `main` 1864467b9) over twelve open GitHub issues and LATER
rows, asking one question of each: what do redotcom's notes and the desktop's documents already establish, what is not
established, and can work proceed now. **Nothing here is a new reading.** The host had no disc, no decompilation and no
captures; every `FUN_`/`D:L` below is quoted from the note that cites it, at the level that note gives, and the desktop
is cited at the `ref/desktop` pin, `desktop@be557831` (the files cited are the same there as at socom-unzipped's `main` 4ca3f4f4, which was searched). The number 270 is taken above the merge controller's
allocated ranges (250-269); it is renumbered at landing if another branch took it.

## 1. Answers

| item | established (where) | not established -- what would settle it | proceed now? |
|---|---|---|---|
| #120 the plant/defuse hold bar | built (PB-8): research 214 §3 "The hold bar", reading, pending review; `hud.ts`, `bombPage.ts` | the direction and placement readings (capture B items 7, 8); `HOLD_BAR_OTHER_ACTION_READING`; the hold counted in commands where the original counts frame time (research 252) | nothing to build; the owner's playtest on `main`, then capture B |
| #121 the plant zone marking | each DEMOLITION tent zone is one flat four-point collision quad with no visual (the batch-2 plan :42); no outline, tint or ring asset was found, per the batch-2 plan :42 (its search of the code and data; a negative search only) | whether the original draws a marking -- H164's capture (Crossroads, in and out of the zone, carrier and teammate, both teams); weaker: the tent models' and lighting's red on the disc | no (PB2.R4: nothing before the rule is read or captured) |
| #84 the satchel, plant clip, plant sound | built (PB-1): research 214 §3, §6; `bombPage.ts` | capture B item 7; `DEATH_DROP_CLIP_READING`; H163 (local start); **a gap no note addresses** (§2) | nothing further from the readings; the online lane's `dropWhy` wire |
| #81 the turret mount | research 215 §7.1, §7.3, §7.4 (reading, reviewed 2026-10-09): no seat node, no hide or re-hang of the held weapon, the hands from `seal_turret_poses`' keys | a node the clip has no track for (`FUN_0028c380`'s blend, or capture B 13); whether the seat record's matrix is the gun part's or the base's (re-read D:L412260-412316); the steer's vertical through a floor | partly: the release refused while the mount clip plays (`FUN_00545ee0` D:L411954-411966) -- taken by this branch |
| #96 the Frostfire box glitch | research 230 §3.3 and its addendum (reading, pending review): the place stacks over a climb, only the top play advances, gravity only while the current action climbs, the 1.0 floor window | where a finished one-shot pops (`play+0x64`, D:L438996-439005); the steer on resumption; `FUN_0054aa30` inside a hull; the exact crate -- H162 | no (PB-7(b) gated on H162); the fix is specified in research 230 |
| #80 MP6's X-braced scaffold | research 86 §3.1, §3.3, §3.6 (the climb table by `appflags`); research 217 §2.1-§2.6 (the walk's probes) | which polygons the owner hit (a screenshot only); whether the original stops there -- H159/H160, or a disc read of the brace hull | no (PB-3, H160) |
| LATER 13 the heartbeat | the SCE-RT per-app tick `FUN_00624dc0` pings a peer in state 2 unheard for 1500 ms and re-sends JOIN every 3 s (`desktop@be557831:docs/research/18-online-round-start.md:283,290-291`, the desktop's reading); in a round the DME TCP channel carries only `RT_MSG_CLIENT_ECHO` (same, :80-84) | the original's silence threshold for dropping a peer: the code that moves a peer out of state 2 (`FUN_00624dc0`'s callers, `rt_msg_client_idisconnect`'s), or a capture suspending one PCSX2 peer 10/20/30/60 s. | as a named server tolerance only -- taken by this branch |
| LATER 14 the spawn grace | the spawn record's facing, `flags & 0xf` to eight headings "then negated" (research 91 §4.2, D:L395768-395800; research 179 :2337's row 6 confirms the spawn index and the heights, not the facing); the direction convention fitted from capture rows (research 75 §11); the room already sets the facing at spawn (`room.ts` `wrapYaw(-slot.step*45)`) | research 91's "negated" against research 75 §11's fitted sign is unreconciled -- a reviewer's re-read of D:L395768-395800; a capture of the start facing | yes, as a server adaptation: refuse commands older than the spawn's `after` instead of 30 commands of free turn |
| LATER 19 the spectator | entry: free, remembered free, scenic index -1 (`FUN_00299150` D:L141664-141666; `FUN_00599b60` D:L455701 -> `FUN_0029b3c0` D:L142768); the scenic zoom's magnification reset (D:L139485-139498, D:L139687-139697) -- research 244 §3.1-§3.2 | the spectator object's placement (`FUN_00599b60`/`FUN_00543d50`); which of the initialiser's callers (D:L75869, D:L149685, D:L150568, D:L150604) runs at a turnover | no |
| #87 / LATER 21 CONTROLLER | `docs/roadmap/04-options-memory-card.md` O8-O11: the screen's rows and strings (UIMnLOC `_183`-`_216`), the four presets (`_154`-`_182`), `controller.rdr`'s four configs, `FUN_002c5d60` D:L125240-125255, `FUN_0027b960` D:L125113-125262; research 197 §2, 302; desktop `docs/research/11` :319-325, `18` :1162-1167 | which displayed page maps to which internal config (`FUN_002c5d60`'s tables, the `dlgControllerPresets*` handlers); presets pages 3-4 captured; the RECRUIT/SAILOR/SEAL tuner values; how a pad preset applies to keyboard and mouse (the owner's) | partly: the rows, strings and four button tables are read; the page-to-config binding waits on the read. The in-round START menu has no layout row (`07-match.md` T1/T2) -- whether "in game" means the round is the owner's to say. *2026-10-18: the page-to-config binding is read -- 1 Default, 2 Reverse, 3 Config4, 4 Goldeneye (research [344](344-controller-presets.md) R344.4), OPT-14 built on `agent/opt-14`; "in game" is H241.* |

## 2. A gap found: `BombPlace` against `Place claymore`

The map's action record for the bomb names the anim `BombPlace` (research 171 :47, research 173 :58, the `mapActions`
test), while PB-1 read the plant's clip from the code as `Place claymore` (`bombPage.ts` `PLANT_ANIM`, `FUN_005be9a0`
D:L475480-475481 with `DAT_003deb48`). No reviewed note says how the action dispatch uses the record's anim field. A read
of the dispatch's use of that field settles which clip plays; until then PB-1's reading stands as written.

**Answered 2026-10-11 (PARITY-2's PAR-40; reading, pending review): research 214 §8.** Both play: the record's
`BombPlace` is a map zAnim program started at the plant's commit (`FUN_002b44e0`, D:L451513), and the body clip is
`Place claymore`, the action type `DAT_003deb48` pushed in the held item 0x9a's branch (D:L451514 -> D:L475480-475481),
under that path's gates. `PLANT_ANIM` stays.

## 3. The desktop's documents

At socom-unzipped's `main` (4ca3f4f4, the newer of the two) the desktop's `docs/` hold nothing on the plant, the defuse, the satchel, the zone, the hold bar,
the turret mount, an interrupted climb or MP6's scaffold beyond `CZBombState`'s method names
(`desktop@be557831:docs/research/55-class-inventory.md:327`) and Frostfire's crate sizes (`desktop@be557831:docs/research/24-frostfire-walkability.md:54-62`; both files the same at the pin);
`recomp/socom2_names*.csv` names none of the functions in §1's climb and turret rows.

## 4. The ledger's open rows against the desktop's documents (2026-10-10, the second sweep)

The open rows of research 101 §4 -- by the two sweeps' filters, a row of kind "gap" whose constant is in the code and
whose status is not settled, retired, resolved or replaced (180 and 172 rows, L176-L1093) -- were searched for in the
desktop's documents at the pin (`docs/research`, `KNOWN.md`, `parity`, `archive`, `audits`, `recomp/socom2_names*.csv`),
by its `FUN_`/`DAT_` addresses, its field offsets and its topic words. **342 rows: nothing material.** The desktop's
notes are mostly the recompiler, the runtime and the online plumbing. **Ten rows are narrowed; none is settled**, and
none contradicts a value in the port's code. The desktop's words are its own readings, cited at its own tags; each
row stays at its level until its own source is re-read.

| row (101) | what the desktop says | judgement |
|---|---|---|
| `ROUND_EPOCH_PLACEHOLDER` (L482) | `DAT_004365c0` is mission object `0x4364e0+0xe0`, accumulated by `FUN_002aa490` and zeroed by `FUN_002ac060`, measured counting up from 0 at round start (0.000, 0.183, 0.383 s) on the desktop's runtime (`desktop@be557831:docs/research/21-frostfire-control-handover.md:186,426`, "[verified, bracketed]"); the HUD's clock is not run off it (`.../34-online-round-freeze-clut-serials.md:18-21`) | **two readings disagree**: research 91 §18.1 (`91-the-round.md:720`) reads the same word as the round's length in ms. The original's code decides: re-read `FUN_002aa490` (D:L151090-151109). The port's constant is a description, but its "the clock counts from the start" basis rests on 91's reading |
| `LOAD_NET_HOLD_READING` (L469) | the late join in `FUN_001f5e70` is gated on `ng+0xCC` (`late_joiner`); `+0xCD`, uninitialised, gates the loading screen's hand-off; `+0x112 = 1` from the constructor (`.../19-community-and-engine-resources.md:119-122,164,177-184`; "[verified] structure, [inference] semantics") | narrows; `+0xb0` and the net layer's time-out (`FUN_002b83e0`, `FUN_002c2fa0`) still open |
| `PRONE_EYE_TERMS_PLACEHOLDER` (L520) | `FUN_005c9520` copies `*(cam+0xb4)` row 3 to `CSealCtrl+0x90` and the third row to `+0x9c` (`.../17-ground-height.md:103`; the eye row measured at :80) | narrows: `+0x24` is then the third row's y (the look axis's vertical part, an inference); the sign, the axis convention and the floor normal still open |
| `NAME_ORDER_READING` (L281) | `strcmp` at `0x00198F18`; "newlib returns the byte difference [verified]"; every resolved consumer tests the sign or zero (`.../20-hle-liveness.md:161,511-513`) | narrows; signed or unsigned bytes over 0x7f not stated |
| `HEADSET_QUEUE_READING` (L834) | `FUN_0034afd0`'s interrupt path: the flag `+10` set by a type-1/2 cue (`FUN_0034aac0`) stops the playing line (`FUN_00347610`); about 2-3 frames plus the read between two queued streams (`.../36-989snd-decomp-audit.md:119-120,136-139`, a read-only audit) | narrows: the port's queue has no preemption; whether an `SND_HST_*` line takes the type-1/2 interrupt is open (a capture of two lines started together) |
| `SPECTATOR_ORDER_READING` (L1004) | `PLAYER_TEAMID_OFFSET = 0xC8`: `40000001` SEALS, `80000100` TERRORISTS, `00010000` SPECTATOR (`.../19-community-and-engine-resources.md:60-61`, a third-party live-memory tool, r0004) | outside corroboration only: holds if `FUN_002c2fd0`'s persona flag is the `+0xC8` team word, not re-read |
| `AIM_PICK_IGNORE_READING` (L997) | `FUN_002dde40`, the SOILS parser: VOLUMETRIC bit 0, LIQUID 1, UNDERWATER 2, PICKUP 4 "[verified]" (`.../23-frostfire-ground-probe.md:142-143`) | narrows: which SOILS materials carry PICKUP is a disc read; then the reader need not assume bit 4 clear. **2026-10-10, the key settled from the disc**: `READERC.ZAR/materials.rdr`'s SOILS (44 entries, through `soilsTable`) carries PICKUP on ITEM alone (penetration 1); the key-to-bit map stays the desktop's reading (SOCOM Legacy has not re-read `FUN_002dde40`). The port's `SurfaceMaterial` gains `pickup` and `aimPickBlocks` now blocks on `penetration >= 0.98 && pickup`, so ITEM blocks the pick and INVISIBLE_DI still passes (`packages/scene/test/projectile.test.ts`, `packages/match/test/hostageOrders.test.ts`); the constant's name and string are unchanged. Reading, pending review |
| `DEAD_CYCLE_RESPAWN_READING` (L802) | online, `ng+0xdc == 0 \|\| ng+0xd2 != 0` selects the spectator object (`FUN_005ef2f0(0x18)`), else `FUN_00552780` respawns (`.../21-frostfire-control-handover.md:169-170`, "[verified]") | an independent reading of the same rule; the respawn branch is still exercised only by the test |
| `DROP_RESPAWN_RULE_READING` (L860) | `ng+0xdc` is "respawn game": `FUN_002a7560` sets it to `mp_allow_respawn != 0 && ng+0x111 == 5` (same, :173-175, "[verified]") | corroborates the port's `+0xdc`; capture B still owed |
| `LEADER_RELEASE_READING` (L1007) | actor `vtbl[0x58]` (`FUN_00547af0`) has three callers: the online dead timer over 20 s (`FUN_00543f70`), health at or under 0 (`FUN_005477a0`), spawn-dead (`FUN_00543d50`) (same, :166-169, "[verified]") | narrows: supports the death attribution research 186 calls BELIEVED, and shows the call also runs on spawn-dead and the 20 s dead timer; C2 still owed |

Not evidence, though named: research 43's `FUN_005B8920` is an **r0004** address, not the `FUN_005b8920`
`C4_FALLBACK_PLACEHOLDER` cites; `SetRotate__7CMatrixFPC6CPnt3D` (0x3083c0) and the other bare names give no values;
`snd_SetMasterVolume`'s 0..0x400 clamp (`.../06-989snd-rpc.md:117`) is consistent with `GROUP_MASTER_READING` but its
logged calls carry no values.

### 4.1 The rows a disc read settles, read from the repository's fixtures

The open rows that owe a **disc** read (not the decompilation, not a capture) were read where their file is in
`test-fixtures/` (`MANIFEST.json`), through the repository's own readers. A global file (one copy on the disc) held whole
settles the disc side; a per-map file is read on MP2, MP6 and MP72 only (partial). Every value agrees with the port. Not
written into research 101 (an open pull request changes it): for its owner to carry.

| row (101) | file, reader | found | level |
|---|---|---|---|
| `ABANDON_LINE_READING` (L824) | `RUN/LOCALE/STATES/UIMNLOC.ZAR`, `parseLocTable` | #528 "All players left the game before you were able to join. Please try again." -- the port's (`viewer/src/netPage.ts`) | global: the row's last owed item (the text from the table) settled |
| `NOFIRE_EQUIPMENT_CLASS_READING` (L718) | `RUN/ZWEAPON.ZAR/zweapon.rdr`, 86 records | class 0x79 (121-140): M67, AN-M8, Mark141, HE, RED SMOKE GRENADE, BLUE CHEM LIGHT; 0x97 (151-170): C4, Satchel, Claymore, MPBOMB, air_to_ground_missile, exploding_fuel, Satchel Explosion, PMN Mine, Backblast; no firearm in either | global for the membership; that the classes are ID ranges rests on `weaponCategory`'s decompilation reading |
| `SPECIAL_GLYPH_179_READING` (L299) | `RUN/READERC.ZAR/fonts.rdr` | 179 in `font_text_01` on texture 2: ul (75,50), lr (100,25), colour 150, scale 0.9 (research 95's table); no glyph covers the star (x 176-205, rows 3-31) | global: the disc side settled; the inverted rectangle's drawing owes the decompilation |
| `HOLSTER_TRACK_READING` (L212) | `RUN/MOTION_P.ZAR`, 334 clips | a `launcher` track in 7 clips only (`seal_launcher`, `_reload`, `_step`, `seal_(mv_)pistol2launcher`, `seal_(mv_)rifle2launcher`); none in idle, walk or run -- the port's (`play.ts`) | global for MOTION_P (the per-map `MOTION_S.ZAR` not read); the node's default matrix owes the decompilation |
| `FIREPOINT_203_READING` (L205) | each map's `WEAP_GEO.ZED`, `weaponLibrary` | no point named for the 203 on any model; `m4Acarbine_203`, `m16_M203`: firepoint, firepoint_shell, aimpoint, Gun_box -- the port's `'firepoint'` | partial (three maps) |
| `CHARGE_HIT_RADIUS_PLACEHOLDER` (L892) | each map's `WEAP_GEO.ZED`, the `nparams` boxes | claymore's farthest corner about 3.73, PMN about 1.33, c4 within 1.42 x 0.69 x 0.54; the port's 5 is above both | partial; drawing bounds, not collision: the collision surfaces and the capture still owed |
| `ENABLE_VALVE_DEFAULTS_READING` (L508) | `READERC.ZAR/global_valves.rdr`; each map's `READERM.ZAR/mission.rdr` | `EQlimit` 0, `mp_x_sec_clock` 0 (global); `Enable_empty`, `Enable_LasDes` in neither; `Enable_c4` 0 / 1 / 0 (MP2 / MP6 / MP72), `Enable_red_smoke` 0 | partial for the maps (research 182 §2.25 read all 22) |

Owed and not in the fixtures: `UI_BANK_PLACEHOLDER` (`SOUNDS/BNKSTORE.ZAR`), `HEAD_NODE_NAMES_PLACEHOLDER` and
`ROUND_LIST_COLUMNS_PLACEHOLDER`, `TURRET_VERTICAL_READING`, `TURRET_APPROACH_READING` (the ELF), and
`ROOM_SKIP_EFFECTS_READING`, `DEBRIS_NODE_READING` (all 22 maps' `MZANIM`s).

## 5. Placeholders

None: this note names no constant. The constants this branch adds are listed in their own notes.
