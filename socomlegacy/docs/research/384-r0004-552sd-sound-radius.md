# 384 -- r0004's 552SD stored sound radius

[R4B-10a](../plans/r0004-option-b.md) under OT.R97. The storage rule is a **reading** (re-read by its fresh reviews, `agent-mail/evidence/r4b-w2/VERDICTS.md`, and the r0004 wave 2 lane batch review, `agent-mail/evidence/mega/REVIEW-R4B-AND-THREAT-BATCH.md`, PASS WITH FINDINGS (high), 2026-11-09).

## 1. Stored radius

`RUN/ZWEAPON.ZAR/zweapon.rdr` gives the `ZWEAPON` record with `InternalName` `552SD` a `Sound_Radius` of 40.
The r0001 parser `FUN_003cda30` (D:L322484-322488) scales the value by 10 when present. Its setter
`FUN_003d2a00` (D:L325315-325320) stores the radius and its square. The r0001 initializer
`FUN_003c4700` (D:L316257-316385) leaves that radius at 400, with a square of 160000.

The r0004 parser retains the scale. Its initializer visits the parsed records and compares each record's
`InternalName` with the exact string `552SD`. On a match it invokes the radius setter with 50, which stores
50 and 2500. Because this happens after parsing, the override still applies if the key is absent. For other
records the parser's value stands, with zero when the key is absent.

| Read | r4 ELF address | Pristine served `ftscore.bin` offset |
| --- | --- | --- |
| Record initializer, exact name check and override | `0x3e6850`, `0x3e6bc8`–`0x3e6bf4` | `0x1ff850`, `0x1ffbc8`–`0x1ffbf4` |
| Parser's radius step and scale | `0x3f09d8`–`0x3f0a14`, `0x40afe0` | `0x2099d8`–`0x209a14`, `0x223fe0` |
| Setter for radius and square | `0x3f4c50`–`0x3f4c5c` | `0x20dc50`–`0x20dc5c` |
| Internal-name read and lookup | `0x3efc40`, `0x3f4a90`, `0x3f4df0` | `0x208c40`, `0x20da90`, `0x20ddf0` |
| Exact match string, radius key and internal-name key | `0x4285e8`, `0x428b40`, `0x4286d8` | `0x2415e8`, `0x241b40`, `0x2416d8` |

The ELF is `game/overlays_r0004/socom2_game_r0004.elf` and the served file is
`game/r0004/served/ftscore.bin`. The bounded ranges were checked against both files, using the served
payload base `0x1e7000`. `D:L` references the r0001 decompilation at `game/analysis/socom2_game.elf.decomp.c`.

## 2. Port and evidence

`weaponRecord` exposes the initialized radius in world units. The three baked records use the same scaled
disc values as the reader: M4A1 100 → 1000, M4A1 SD 10 → 100 and Mark 23 60 → 600.
The new synthetic cases in `weapons.test.ts` cover the exact name, the post-parse override, the zero default,
ordinary radius scaling and scope controls. The new configured dev-disc cases read the archive for seven
weapons and skip when the configured source is unavailable.

### 2.1 Whole-table pin

`packages/scene/test/golden/weapon-records.json` transcribes the initialized radius for all 44 entries in
`readKitTable().records`, including the MGL and M79 carriers. A controller-supplied source inspection on
2026-11-07 re-read all 86 `ZWEAPON` records through `Zar.parse`, `parseRdr` and `rdrGet` at repository commit
`d2a06384d80ab11fb00fc7b1217790c59c3e354c`. That baseline predates this task's reader change: its missing
`WeaponRecord.soundRadius` field is not a result for the changed reader. The pin uses the raw tokens below,
the parser's scale of 10 and the exact post-parse override described above. This is a source transcription,
a **reading** (re-read by its fresh reviews, `agent-mail/evidence/r4b-w2/VERDICTS.md`, and the r0004 wave 2 lane batch review, `agent-mail/evidence/mega/REVIEW-R4B-AND-THREAT-BATCH.md`, PASS WITH FINDINGS (high), 2026-11-09). With the disc configured, the seven dev-disc cases and the whole-golden comparison ran:
`weapons.test.ts` 63 of 63 (the lane batch review's run, its F3).

The archive SHA256 is `496d80a9dbb12e288465fe2ee45744cc53a3450fa97bf912cfc98c5c54c74372`; member
`zweapon.rdr` SHA256 is `8f1027edc1e3d0d6a936e13f3bcc2f2ee785148d1acbe550776e3b844058d67b`.
Every one of the 86 records carries `Sound_Radius`; none is absent. The nine explicit zeroes belong to
records outside this 44-record pin. The M16A2 and SA-80 A2 contain three bare remark tokens after
`ImpactRadius`; `rdrGet` scans every index and reads both IDs and radii correctly. Converting their flat
lists by alternating pairs loses the later keys and is not a valid way to transcribe these records.

| ID | InternalName | Disc `Sound_Radius` | Initialized world units |
| --- | --- | --- | --- |
| 4 | F57 | 60 | 600 |
| 5 | M9 | 60 | 600 |
| 6 | 226 | 45 | 450 |
| 7 | DE .50 | 80 | 800 |
| 8 | 9mm Pistol | 4 | 40 |
| 12 | P228 | 50 | 500 |
| 13 | SR-1 Gyurza | 60 | 600 |
| 14 | Model 18 | 70 | 700 |
| 15 | Mark 23 | 60 | 600 |
| 16 | Mark 23SD | 4.5 | 45 |
| 31 | HK5 | 70 | 700 |
| 33 | HK5SD | 5 | 50 |
| 34 | F90 | 70 | 700 |
| 37 | 9mm Sub | 70 | 700 |
| 38 | MP5K | 70 | 700 |
| 51 | M16A2 | 60 | 600 |
| 52 | M16A2-M203 | 60 | 600 |
| 54 | M4A1 | 100 | 1000 |
| 57 | 552 | 65 | 650 |
| 58 | AK-47 | 100 | 1000 |
| 59 | AKS-74 | 155 | 1550 |
| 60 | M14 | 150 | 1500 |
| 61 | M4A1-M203 | 65 | 650 |
| 62 | M4A1 SD | 10 | 100 |
| 63 | F2000 | 65 | 650 |
| 64 | SA-80 A2 | 60 | 600 |
| 65 | AK-105 | 100 | 1000 |
| 66 | KBP OTs-14 Groza | 125 | 1250 |
| 67 | 552SD | 40 | 50 |
| 68 | Steyr Aug | 70 | 700 |
| 81 | Spas 12 | 65 | 650 |
| 83 | JACKHAMMER | 65 | 650 |
| 84 | 870 | 65 | 650 |
| 91 | M60E3 | 110 | 1100 |
| 92 | M63A | 500 | 5000 |
| 93 | .PKM | 500 | 5000 |
| 101 | M82A1A | 135 | 1350 |
| 102 | M40A1 | 170 | 1700 |
| 103 | M87ELR | 175 | 1750 |
| 104 | Dragunov | 160 | 1600 |
| 105 | SR-25 SD | 10 | 100 |
| 106 | SR-25 | 130 | 1300 |
| 142 | MGL | 3 | 30 |
| 143 | M79 | 3 | 30 |

## 3. Readings

| Name | Evidence | Still owed |
| --- | --- | --- |
| `SIG_552SD_SOUND_RADIUS_READING` | r0004 initializer override at `0x3e6bc8`–`0x3e6bf4`, with the store at `0x3f4c50` | An r0004 post-load memory trace of the stored radius and its square. Audible range and AI response each need their own comparison against the original running. |
