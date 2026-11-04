# 374 -- r0004's M60E3: the weapon parser's one special-cased record (R4B-01, G11)

- Date: 2026-11-01. Task R4B-01 of the [r0004 plan](../plans/r0004-option-b.md), under the owner's ruling OT.R97
  (MISSION: r0004 is the specification for gameplay and front-end behaviour). Branch `agent/r4b-01`.
- Track: simulation. It changes what the game does: the M60E3's standing reticle and its configured fire interval.
- Status: **reading, pending review** (R4B.R3). Nothing here is measured running. The values are transcribed from the
  r0004 investigation's deep read, which disassembled the r0004 parser; this note's author did not re-open the r0004
  image. A reviewer who did not write it re-reads every cited r0004 address in `game/overlays_r0004/socom2_game_r0004.elf`
  and in the pristine served decrypt `game/r0004/served/*.bin` (R4B.R4) before it counts as a reading.
- Sources: `C:/Projects/agent-mail/evidence/r0004-investigation/cluster-m60e3-moving-accuracy.md` (sections 0-1, 4),
  its REPORT.md row G11 and dot's F6 (REPORT.md, at its foot; `agent-mail/evidence/r0004-dot/workflow-report-review-dot-0925.md`).
  r0001's counterpart is `FUN_003cda30` (the `CZFTSWeapon` builder, research 84 section 1, D:L322125). `D:L<n>` is a
  line of `game/analysis/socom2_game.elf.decomp.c`. No decompiled or disassembled text is pasted.

## 1. What r0004 does

r0004's ZWEAPON record parser, r4 `0x3efbd0`, is the twin of r0001's `FUN_003cda30`. It sets a flag when the record's
`InternalName` compares equal with `"M60E3"` (`strcmp` at r4 0x3efc80, the string at 0x4286e8 -- the one instruction in
the r0004 image that addresses it). With the flag set:

| field (weapon) | stance | r0001 (the disc's value, used as read) | r0004 (forced) | r4 site | the word |
|---|---|---|---|---|---|
| `TargetDilateUponMovement` (stance +0x24) | STANCE_STAND only | 6 | **15** | 0x3f0030-0x3f004c | `lui 0x4170` (0x41700000) |
| `TargetMin` (stance +0x34) | STANCE_STAND only | 8 | **10** | 0x3f00d8-0x3f00f4 | `lui 0x4120` (0x41200000) |
| `TargetMax` (stance +0x38) | STANCE_STAND only | 35 | **55** | 0x3f0120-0x3f013c | `lui 0x425c` (0x425c0000) |
| `FireWait` (weapon +0x50) | the weapon's own | 0.14 | **0.16** | 0x3f054c-0x3f057c | `lui 0x3e23; ori 0xd70a` (0x3e23d70a) |

- The three stance values are replaced only in stance 0 (the stance index tested is zero) and only after the key has
  been read: the value just read is replaced before its setter stores it. Crouch and prone start as a copy of the
  stand (research 84 section 3, the parser's inheritance), so a stance that does not restate a key would inherit the
  forced value; the disc's M60E3 restates all three in both (6/6/30 with Mult 13 crouched, 6/4/25 with Mult 63 prone), so
  crouched and prone are unchanged.
- `FireWait` is overwritten after it is read without checking the key's result, then stored at +0x50 (`swc1` at
  0x3f057c).
- `RUN/ZWEAPON.ZAR` is the same file in both revisions (md5 `c0bb90c5...`, the cluster note's section 0; F4 bounds "every
  file identical" to the inspected two-overlay package): the values are r0004's code, not data.
- r0001's parser names `"M60E3"` only in a leftover debug print (D:L322173-322174) that changes nothing.

## 2. The port

`packages/scene/src/weapons.ts`: `R0004_M60E3_NAME`, `R0004_M60E3_STAND` (15 / 10 / 55) and `M60E3_FIRE_WAIT_READING`
(0.16). `weaponStances` takes the record's `InternalName` and, for the M60E3, puts the forced value in place of each of
the three stand keys it reads, inside the stand pass (so the inheritance is r0004's); `weaponRecord` stores 0.16 over the
read `FireWait`. The derived `roundsPerMinute` follows (375, from 429). Every other record is read as before.

- **r0001, superseded by r0004 (OT.R97)** (R4B.R6): the M60E3's standing 6 / 8 / 35 and `FireWait` 0.14 -- the disc's
  record, research 94 section C11's row and research 84's -- stay recorded as r0001's; those notes are not edited here.
- 0.16 is held as the shortest decimal of the f32 0x3e23d70a, the form the repository's reader gives every disc float
  (`@s2u/archive`'s `f32Text`); `weapons.test.ts` checks the f32 bits of all four values against the words above.
- Not changed: `@s2u/scene`'s `arsenalOf` reads `FireWait` straight from the record for the `ArsenalItem` view, so the
  M60E3's `ArsenalItem.fireWait` (and `arsenal-items.json`) stays 0.14. Nothing fires the M60E3 off that view (it is the
  launched rounds' and the Detonator's rate); `arsenal.ts` is outside R4B-01's files and is R4B-06's. The original has
  one +0x50; the follow-up is to read the view through the same step.
- Tests: `scene/test/weapons.test.ts` (the step on a hand-built record, the stand-pass inheritance, a key not read, every
  other `InternalName` untouched; off the disc: the record is r0001's, the reader gives r0004's, every other record keeps
  its file values); `scene/test/golden/weapon-records.json` (the pinned M60E3 is r0004's, `_source` says so);
  `scene/test/weaponTable.parity.test.ts` (research 94's row kept as r0001's 0.14, the pin as r0004's 0.16);
  `viewer/test/fire.test.ts` (the class tests' M60E3 stand-in carries 0.16).

## 3. Readings

| Name | Status and evidence needed |
|---|---|
| `M60E3_FIRE_WAIT_READING` | scene `weapons.ts`: the M60E3's `FireWait` 0.16 (0x3e23d70a, r4 0x3f054c-0x3f057c), reading, pending review, as a configured interval only. What it does to the observed rate is unmeasured (dot's F6): the fire timer counts down once a game frame and carries nothing over (r0001 `FUN_005c0fd0`, D:L476644-476646, the x 0.8 in `FUN_005c09f0` -- research 84 section 6; unchanged in r0004 but for field offsets), and automatic fire waits `FireWait x 0.8` -- 0.112 s against 0.128 s -- which at NTSC's game frame (525/15734 s) may both come to four frames, so r0004's cadence may equal r0001's (the cluster note's section 2.5, arithmetic, not a run). Open: settled by a PCSX2 `--build r0004` frame-count capture -- weapon +0x50 read live over PINE (`game/r0004/pine/`) and the shots of an automatic burst counted frame by frame against r0001's. |

The three stance values (`R0004_M60E3_STAND`) are not stand-ins: they are the transcription, at the same "reading,
pending review"; the same capture (the record's stand +0x24 / +0x34 / +0x38 read live) and a standing reticle capture
moving would take them to proven.
