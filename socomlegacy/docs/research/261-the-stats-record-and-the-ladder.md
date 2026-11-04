# 261 -- The stats record and the ladder: what a match's end adds to the career record (SVC-12a)

- Date: 2026-10-09 (web sprint 10, wave 1; the plan `../plans/2026-10-09-web-sprint-10-the-services.md`, W10.R1).
- Status: **reading, reviewed 2026-10-09.** Every value below is transcribed from the retail decompilation
  (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never pasted) and, where the decompiled text leaves a
  width or a precision open, from the ELF's instructions read by address (`game/disc/socom2_game.elf`, disassembled
  0x225070-0x2253a0); unit-tested against the transcription (`packages/match/test/accountStats.test.ts`); re-read
  by a reviewer who did not write it at each task's review (SVC-12a to SVC-14, 2026-10-09; the sprint's Log), and
  nothing here is measured on the original running.
- Stands on research [155](155-the-stats-record-the-ladder-and-the-ranks.md) (§1.1 the record, R155.1-R155.2; §1.2 the
  match block; §1.3 when it posts), [216](216-the-round-screens-from-readerx.md) (§2, the room's counters; §5 their
  readings), [214](214-demolition-as-built.md) §5 (the objectives' counters) and [111](111-ui-text.md) §1.4 (the EE's
  float rounding), and does not restate them.
- Code: `packages/match/src/stats/accountStats.ts` -- `AccountStatsRecord`, `RECORD_LAYOUT`, `MatchOutcome`,
  `MatchBlock`, `applyMatch`, `uploadsAfter`, `roundsOf`, `secondsOfClock`, `matchHitPercent`, `YOUR_STATS_ORDER`.
  Pure: no store, no socket, no clock. Section 4 is SVC-12b's (`packages/central/src/stats/accountStatsCodec.ts`,
  2026-10-09); section 5 SVC-12c's (`packages/central/src/stats/accountStatsStore.ts`, `stats/matchEndStats.ts` --
  retired 2026-10-10 into SVC-07's `stats/results.ts`, §5's dated line -- the room's `onRoundOver`, 2026-10-09); section 8 SVC-13a's (`packages/match/src/stats/rating.ts`, 2026-10-09); section 9
  SVC-13's (`packages/central/src/ladder.ts`, the lobby's three ladder paths, 2026-10-09); section 10 SVC-14's (the rank
  gate in `packages/central/src/lobby.ts`'s two joins, `LadderService.tier`, 2026-10-09); section 11 SVC-12e's (the one
  decoder: `accountStatsCodec.ts` for every reader, `packages/central/src/statsRecord.ts` PLAYER INFO's layer over it,
  2026-10-11, reading pending review).

## 1. The arithmetic (`FUN_00225070`, D:L76584-76658)

The fold runs once, at the match's end, for the local player only: `FUN_00223970` calls it in the exit state's enter
when net +0x113 is 6 (the game over, D:L76078), after YOUR STATS is printed, with respawn off and `ComeFromLan` 0
(D:L76080-76082; §3). It copies the session's record out (`FUN_002f98f0`, D:L76613), adds the match block (actor +0x544)
to it and copies it back with a post (`FUN_002f96f0(.., 1)`, D:L76655). Research 155 §1.1's table, re-read line by line
on 2026-10-09:

| record field | what the match adds | lines | re-read |
|---|---|---|---|
| (guard) | nothing unless a local player exists, is no spectator (`FUN_002c2fd0`) and is on a side (`FUN_002c31d0` SEAL or `FUN_002c30b0` Terrorist) | D:L76609-76611 | as 155 |
| +0x1c kills, int32 | += block +0x0c, loaded as an unsigned short | D:L76614; ELF 0x2250dc `lhu` | as 155; the int32 wraps |
| +0x2a deaths, +0x2c suicides, +0x2e bombs planted, +0x30 bombs defused | += block +0x12, +0x14, +0x38, +0x36 | D:L76615-76618 | as 155; **16-bit sums, unsigned** (below) |
| +0x26 VIPs rescued | ESCORT (game +0x111 = 3) as a SEAL: += block +0x1c | D:L76619-76620, D:L76627-76628 | as 155 |
| +0x28 VIPs killed | ESCORT as a Terrorist: += block +0x18 | D:L76621-76625 | as 155 |
| +0x24 hostages rescued | any other type, **either side**: += block +0x1c | D:L76631-76632 | as 155 ("any type but ESCORT"); the side is not tested |
| +0x32 head shots | += block +0x00 | D:L76634 | as 155 |
| +0x20 bits 22-31 bonus objectives | **replaced** by block +0x34's low 10 bits | D:L76635-76636; ELF 0x2251d4-0x2251e8 (`lhu`, `andi 0x3ff`, `sll 6`) | as 155; the 10-bit cut made explicit |
| +0x01 bits 0-6 hit percentage | `(int)((old x games + pct) / (games + 1) + 0.5) & 0x7f`, `games` the 22-bit count before this match, `pct = (int)(ratio x 100.0 + 0.5)`, `ratio` = +0x588 = hits +0x04 / shots +0x08 (0.0 with no shot, `FUN_00223970` D:L76064-76070); bit 7 kept | D:L76637-76641; ELF 0x2251ec-0x2252bc | as 155's `round(...)`, made exact: single precision (`mul.s`, `add.s`, `div.s`, two roundings, no `madd.s`), the sum an unsigned 32-bit (`mult` then `addu`, the `bltz` path converting it unsigned), truncation (`cvt.w.s`), the result **masked to 7 bits** |
| +0x10 seconds played, int32 | += `(uint)(game +0xf0 x 0.001)`, the clock total in ms converted unsigned to single, times 0.001f (0x3a83126f), truncated; at 2^31 and above the high bit is restored after subtracting 2^31 | D:L76642-76649; ELF 0x2252c4-0x225340 | as 155's "/ 1000", made exact |
| +0x14 rounds won, int32 | += my side's round wins: game +0x120 (SEALs, `mp_score00`) or +0x124 (Terrorists, `mp_score08`), research 91 §18 | D:L76650; `FUN_00223970` D:L76009-76011, D:L76073-76076 | as 155 |
| +0x18 rounds lost, int32 | += rounds played (+0x11c) - my wins - the drawn rounds (+0x11c - (+0x120 + +0x124)) | D:L76651; `FUN_00223970` D:L76013, D:L76077 | as 155 |
| +0x20 bits 0-21 games | := (games + 1) in 22 bits: at 2^22 - 1 it **wraps to 0** (`dsll32`/`dsrl32` by 10 on both sides of the add), no saturation; the hit percentage of that match is still divided by 2^22 | D:L76652-76654; ELF 0x225374-0x225398 | 155 said "+ 1"; the wrap is new |
| everything else | untouched: the rating (+0x04, each round's end, SVC-13a), the position, the minutes, the team and leader bits, gender, the strings | -- | as 155 |

**The differences found (2026-10-09):**
- **The 16-bit fields are unsigned.** Research 155 §1.1 calls +0x24..+0x32 `int16`; the fold loads both sides `lhu`
  (ELF 0x2250ec-0x2250f8, 0x225108-0x22512c) and PLAYER INFO loads them `lhu` too before printing them (ELF 0x2f0aa4-0x2f0d14; D:L192076-192121). The
  module holds them 0..65535, wrapping. The sum is the same bits either way; only a reader's sign differs.
- **The hit percentage's width.** The mean is masked to 7 bits (D:L76641): a match whose hits exceed its shots (a
  percentage above 127) wraps (300 -> 44). Whether the original's hit counter can exceed its shot counter is
  `HIT_COUNT_READING`'s question (research 216 §5); the room's cannot (a shell counts one shot and at most one hit).
- **The games count wraps** at 2^22 (above). Unreachable in practice (4 194 304 matches); transcribed as it is.
- **"Score" is not in the fold.** The brief listed "kills, deaths, score"; the record's SCORE: caption is the rating
  (+0x04), which the fold does not touch. The match score (block +0x3c) is printed by YOUR STATS and fed to the rating
  (`FUN_002253c0`, SVC-13a); the record keeps no sum of it.
- **A writer of the bonus objectives, found (narrowing `BONUS_OBJECTIVE_COUNT_PLACEHOLDER`).** At every round's end the
  exit state calls `FUN_00224d10(actor, &primary, &bonus)` (D:L76026) and adds its two outputs into the round block's
  +0x32 and +0x34 (actor +0x5be, +0x5c0; D:L76028-76029) before the round block is summed into the match block
  (D:L76055-76056). `FUN_00224d10` returns as `bonus` the local player's round block **+0x3a** (actor +0x5c6,
  D:L76575; +0x3a is also summed on its own into the match's +0x3a at D:L76059). So the match's +0x34 is, at least,
  the sum over the rounds of round +0x3a; who writes round +0x3a, and whether anything else writes round +0x34, is
  not read. Research 155 §8's "no writer of +0x34 is found" is narrowed, not settled.
- Research 155 cites the ESCORT Terrorist's short at D:L76622-76625 and the SEAL's at D:L76619-76629: the SEAL's own
  add is D:L76627-76628; both stand.

**YOUR STATS** (`FUN_00225a00`, D:L76904-76925), printed just before the fold from the same block: +0x3c, +0x0c,
+0x12, the ratio x 100 (the same expression as the fold's `pct`), +0x00, +0x32, +0x34, +0x16, +0x14 (D:L76907, 76909,
76911, 76913, 76915, 76917, 76919, 76921, 76923), under SCORE, KILLS, DEATHS (loc 2106-2108), HIT %, HEAD SHOTS,
PRIMARY OBJECTIVES, BONUS OBJECTIVES, FRIENDLY KILLS, SUICIDES (2116-2121; the viewer's `ROUND_STRINGS`, research 216):
`YOUR_STATS_ORDER`. The module's `matchHitPercent` equals the viewer's `hitPct` over every hits <= shots <= 60 (a test).
Research 155 §1.2's sample page (SCORE 36, PRIMARY OBJECTIVES 6, the rest 0) is the **recomp's** frame
(`A_hold32.png`), not the original's: the test uses it as a worked example of the order, not as evidence.

## 2. The inputs: what the room has, and what it has not

`MatchOutcome` is what the fold reads: the game's state (side, spectator, game type, respawn, `ComeFromLan`, the clock
total, rounds played and each side's wins) and the local player's `MatchBlock`. Against the match server today
(`packages/match/src/room.ts`, `Player` and `MatchStats`, research 216 §2, 214 §5, 239 §4):

| input | block / game | the room | standing |
|---|---|---|---|
| kills, deaths | +0x0c, +0x12 | `Player.kills`, `deaths` (match totals) | kept |
| suicides, team kills | +0x14, +0x16 | `suicides`, `teamKills` | kept |
| hits, shots | +0x04, +0x08 | `shotsHit`, `shotsFired` | kept under `HIT_COUNT_READING` (PF.R20) |
| head shots | +0x00 | `headshots` | kept under `HEADSHOT_COUNT_READING` (PF.R21); the original's rule unread: **`HEAD_SHOT_COUNT_PLACEHOLDER`** |
| primary, bonus objectives | +0x32, +0x34 | `primaryObjs`, `bonusObjs` | kept under `OBJECTIVE_STAT_KIND_READING` (PF.R34); +0x34's writer unread: **`BONUS_OBJECTIVE_COUNT_PLACEHOLDER`** (0 where nothing counts one) |
| escortees brought out, killed | +0x1c, +0x18 | `hostagesRescued`, `escorteesKilled` (sent by an EXTRACTION room only) | kept for EXTRACTION; ESCORT's not counted yet |
| the match score | +0x3c | `Player.score` | kept (YOUR STATS only; not folded) |
| bombs planted, defused | +0x38, +0x36 | **none**: the plant and the defuse are scored (`scoreObjective`) but not counted per player | not kept |
| the clock total in ms | game +0xf0 | **none**: the room times each round (`state.startedAt`), not the match | not kept |
| rounds played, each side's wins | game +0x11c, +0x120, +0x124 | `round`, `wins.seal`, `wins.terrorist` | kept |
| side, spectator | the actor | `Player.team`; the watchers (SVC-07a) | kept |
| respawn | game +0xdc | `opts.rules` (`'respawn'` / `'classic'`) | kept |
| `ComeFromLan` | the valve | **none**: the room has no LAN flag | not kept: SVC-12c's caller decides |

The fold takes every one as given; filling the three "not kept" is SVC-12c's write (W10.R1), not this task's.

## 3. The upload rule

`uploadsAfter(outcome)` is `FUN_00223970`'s condition around the fold (D:L76080-76081): respawn off (game +0xdc 0)
**and** `ComeFromLan` 0. `FUN_003045b0` (D:L204495-204507) looks the valve up by name (S:0x3f6328, cached in
`DAT_00450058`) and answers "its value at +4 is not 0"; a valve not found answers false (not a LAN game). The game
over (net state 6) is the outcome's premise, not an input. Four cases, one test: off/off posts, every other does not.
The round's rating post has the same two conditions without the game-over test (D:L75798; research 155 R155.3,
SVC-13a's).

## 4. The record's bytes (SVC-12b)

*Added 2026-10-09 (web sprint 10, wave 2). Reading, reviewed 2026-10-09.* Code: `packages/central/src/stats/accountStatsCodec.ts`
-- `encodeAccountStats(record)` (256 bytes) and `decodeAccountStats(bytes, genderValve?)` over SVC-12a's `RECORD_LAYOUT`;
tests `packages/central/test/accountStatsCodec.test.ts` (the transcription) and the dev-host
`tools/test/accountStatsSlice.test.ts` (the s4 slice, through the reader `tools/mediusLog.ts`).

**The layout.** The 256-byte form is what `FUN_002fab80` (D:L198446-198559) builds from the session's record at
0x66a750 and what `AccountUpdateStats` and `PlayerReport` carry (research 155 §1.3); `FUN_002f9ac0` copies an `'E'` one
whole, 0xe4 bytes (D:L198088-198092); PLAYER INFO (`FUN_002f0020`) prints each field from a copy of it. Little-endian
(the EE; the slice's `E8-03-00-00` is 1000). Each row: the field, its writer into the bytes, its other writer, a reader:

| offset | width | field | the build writes it | its other writer | PLAYER INFO reads it |
|---|---|---|---|---|---|
| +0x00 | u8 | the version `'E'` | D:L198465 | the default D:L198209 | -- (the parser's test, D:L198088) |
| +0x01 bits 0-6 | 7 bits | hit percentage | D:L198466 | the fold D:L76637-76641 | D:L192116 (`& 0x7f`) |
| +0x01 bit 7 | 1 bit | `DAT_0045a0c3` (`STATS_BYTE1_BIT7_PLACEHOLDER`) | D:L198524 | the default clears it, D:L198212 | -- |
| +0x02 bits 0-4 | 5 bits | unread (`STATS_BYTE2_LOW_BITS_PLACEHOLDER`) | D:L198467 (copied) | -- | -- |
| +0x02 bits 5-6 | 2 bits | the team: 0 SEAL, 1 Terrorist, 2 neither | D:L198467 | `FUN_002ef7f0` D:L191440-191452; the default clears it, D:L198211 | -- |
| +0x02 bit 7 | 1 bit | the clan's leader | D:L198542-198547 | -- | D:L191962 |
| +0x03 bits 0-1 | 2 bits | gender (bit 0 `PLAYERGENDER`) | D:L198468 | the default D:L198213-198214 | -- |
| +0x03 bits 2-7 | 6 bits | unread (`STATS_BYTE3_HIGH_BITS_PLACEHOLDER`) | D:L198468 (copied) | -- | -- |
| +0x04 | int32 | the rating | D:L198469 | the default 1000, D:L198210; each round, D:L75801-75804 | D:L191978 |
| +0x08 | int32 | the ladder position | D:L198555 | -- | D:L191973 |
| +0x0c | u32 *(int32 until 2026-10-11, §11 (c))* | minutes online | D:L198525-198532 | -- | D:L192022 |
| +0x10 | u32 *(int32 until 2026-10-11, §11 (c))* | seconds played | D:L198472 | the fold D:L76642-76649 | D:L192130 |
| +0x14 | int32 | rounds won | D:L198473 | the fold D:L76650 | D:L191988 |
| +0x18 | int32 | rounds lost | D:L198474 | the fold D:L76651 | D:L191993 |
| +0x1c | int32 | kills | D:L198475 | the fold D:L76614 | D:L192071 |
| +0x20 bits 0-21 | 22 bits | games | D:L198476 (the word) | the fold D:L76652-76654 | D:L191983 (`& 0x3fffff`) |
| +0x20 bits 22-31 | 10 bits | bonus objectives | D:L198476 (the word) | the fold D:L76635-76636 | D:L192111 (`>> 6` of the high half) |
| +0x24 | u16 | hostages rescued | D:L198477 | the fold D:L76631-76632 | D:L192096 |
| +0x26 | u16 | VIPs rescued | D:L198478 | the fold D:L76627-76628 | D:L192101 |
| +0x28 | u16 | VIPs killed | D:L198479 | the fold D:L76621-76625 | D:L192106 |
| +0x2a | u16 | deaths | D:L198480 | the fold D:L76615 | D:L192076 |
| +0x2c | u16 | suicides | D:L198481 | the fold D:L76616 | D:L192081 |
| +0x2e | u16 | bombs planted | D:L198482 | the fold D:L76617 | D:L192086 |
| +0x30 | u16 | bombs defused | D:L198483 | the fold D:L76618 | D:L192091 |
| +0x32 | u16 | head shots | D:L198484 | the fold D:L76634 | D:L192121 |
| +0x34 | 12 | the clan tag | D:L198463-198492, then D:L198541 | -- | D:L191933 |
| +0x40 | 32 | the clan's name | D:L198493-198503, then D:L198533 | -- | D:L191968 |
| +0x60 | 63 | the hometown | D:L198504-198512, then D:L198548-198554 | -- | D:L192010 |
| +0x9f | 66 | the description | D:L198513-198523 | -- | D:L192063 |
| +0xe1..+0xff | 31 | not written (`STATS_WIRE_TAIL_PLACEHOLDER`) | -- | -- | -- |

- **The widths.** The eight shorts are unsigned (§1: `lhu` in the fold and in PLAYER INFO, ELF 0x2f0aa4-0x2f0d14); the
  int32 words are held signed, as `RECORD_LAYOUT` declares them -- the bits are the same either way (the build writes
  the minutes, and the fold the seconds, as unsigned conversions, D:L198525-198532, D:L76642-76649; only a reader's
  sign differs, past 2^31). A value past its width is cut to it, as the field stores it (the games' 2^22 wraps to 0,
  §1). *2026-10-11, SVC-12e: the minutes and the seconds are held unsigned since, `RECORD_LAYOUT`'s `u32`, as their
  writers' conversions and TOTAL PLAYING TIME's `divu` read them (§11 (c)); the other five words stay `int32`.*
- **The strings** are copied with `FUN_00199800`, a bounded copy that zero-fills the rest of the field and writes no NUL
  when the string fills it (D:L198533, D:L198541, D:L198550; the function at D:L16276). The codec writes one byte a
  character (code units 0x00-0xff; a larger one is refused with a `RangeError`) and reads up to the first NUL or the
  field's end. A byte above 0x7f read as a Latin-1 character is the port's representation of a byte, not a reading of
  the game's font.
- **The build writes +0x00..+0xe0 and nothing past** -- the description's 33 pairs end at +0xe0 -- though the record
  proper is 0xe4 bytes (research 155 §1.1). The slice's four records carry, past +0xe0, what reads as the caller's
  stack (non-zero bytes at +0xe1..+0xf2, lines 114, 176, 262, 270). The codec writes `STATS_WIRE_TAIL_PLACEHOLDER` (0)
  there and never reads them.
- **The version.** Any first byte but `'E'` decodes as the default record (rating 1000, the gender bit from the caller's
  `genderValve`), as `FUN_002f9ac0` turns any byte it does not know into it (D:L198207-198222); a new account's 256 zero
  bytes are the case that matters. The earlier forms the original upgrades (`'D'`..`'A'`, `'N'`, `'Q'`,
  D:L198093-198206) decode as the default too: `STATS_OLDER_VERSION_PLACEHOLDER`. That a stored blob of another first
  byte is served as the default is SVC-12c's rule, tested there. ~~A blob shorter than 256 bytes reads as if
  zero-filled.~~ *2026-10-11, SVC-12e: a blob of any length but 256 is refused (a `RangeError`), never zero-filled or
  cut (§11 (d)).*

**The wire, against the s4 slice** (`$SOCOM_PC_ROOT/logs/parity/s4_pcsx2/slice-Medius.log`; the dev-host test, run
with `SOCOM_PC_ROOT` on 2026-10-09). The slice holds four records, each 256 bytes:

| line | message | session | version | rating | position | minutes | team bits | +0x01 bit 7 |
|---|---|---|---|---|---|---|---|---|
| 114 | `MediusPlayerReport` | 25 | `'E'` | 1000 | 2 | 12 | 0 SEAL | 1 |
| 176 | `MediusPlayerReport` | 26 | `'E'` | 1000 | 2 | 10 | 1 Terrorist | 1 |
| 262 | `MediusAccountUpdateStatsRequest` | 25 | `'E'` | 997 | 2 | 16 | 0 SEAL | 1 |
| 270 | `MediusAccountUpdateStatsRequest` | 26 | `'E'` | 1003 | 2 | 12 | 1 Terrorist | 1 |

The codec decodes the four wire fields to exactly the log's numbers (research 155 §1.3, R155.6); every other field
is zero; each record re-encodes to the log's own bytes over +0x00..+0xe0; and the ladder post beside each stats post
(lines 264, 272, Lobby 206 = 0xce) carries the same rating, 997 and 1003, at its byte 28. What this shows is the
**layout of the fields that are non-zero** -- the version, +0x01 bit 7, +0x02's team bits, the rating, the position,
the minutes -- in a log of the original client's messages. It says nothing of the offsets of the counters, the bit
fields beside the team, or the strings, all zero or empty in the slice.

**What would prove the rest** (the proven level, not this task's):
- **PLAT-36's PEEK** (H147): a `PS2X_PEEK` of 0x66a750..+0x100 after a match on the local stack, equal to
  `applyMatch` over the same events and encoded by this codec: every counter's offset and width, the 22/10 split and
  the hit percentage's bits measured on the running original.
- **ONL-32's payload** (H27, H94): the `UpdateAccountStats` post of a whole match's end, decoded field by field --
  the record on the wire with non-zero counters, strings and the leader bit.
- Either would also read `DAT_0045a0c3` (set on both s4 consoles, its meaning unread) and the five and six unread
  bits of +0x02 and +0x03, if a run sets them.

## 5. The store and the write (SVC-12c)

*Added 2026-10-09 (web sprint 10, wave 3; W10.R1). Reading, reviewed 2026-10-09.* Code: `packages/central/src/stats/accountStatsStore.ts`
(`readAccountStats`, `writeAccountStats`, `serveAccountStats`), `packages/server/src/stats/matchEndStats.ts`
(`MatchEndStats`, `matchBlockOf`), the room's hook `RoomOptions.onRoundOver` (`RoundOverReport`, one call in `endRound`),
the bridge's writer per game (`GameBridge.open`, `roomOptions`; the store injected in `createServices`). Tests
`packages/central/test/accountStatsStore.test.ts`, `packages/server/test/matchEndStats.test.ts`.

**5.1 The read and its default.** The store keeps the record as the account's 256-byte blob (`WIDTHS.accountStats`,
`ACCOUNTSTATS_MAXLEN`); a new account's is 256 zero bytes (`ServiceStore.createAccount`). `readAccountStats` decodes it
through §4's codec: a first byte other than `'E'` is the default record -- `'E'`, rating 1000, everything else zero --
as the client's parser turns any record it does not know into it (`FUN_002f9ac0` D:L198207-198222). The zero blob is
that case; an older `'D'` blob is too (`STATS_OLDER_VERSION_PLACEHOLDER`, §4). The default's gender bit is the client's
valve `PLAYERGENDER` (D:L198213-198214), which the server does not hold: 0 (`STATS_DEFAULT_GENDER_PLACEHOLDER` since
2026-10-11, §11 (b)). `writeAccountStats` stores the codec's 256
bytes; the store refuses any other width. A record written is read back field for field and byte for byte (a test).

**5.2 Served, not stored: the position and the minutes.** +0x08 (LADDER POSITION) and +0x0c (ONLINE minutes) are the
session's, filled by the client at each build of the bytes (`FUN_002fab80` D:L198555, D:L198525-198532), not by the
fold. The OT.R18 note has the server fill them where a record is served: `serveAccountStats(record, { ladderPosition,
minutesOnline })` is that seam -- the position from SVC-13's ladder, the minutes from the session's login, passed by the
path that serves the record (SVC-07's PLAYER INFO, SVC-13's opcodes). Until then a served record carries what is stored
(`STATS_SERVED_FIELDS_PLACEHOLDER`; 0 for a record this server wrote).

**5.3 The write point and the hook.** The MP exit state's enter, `FUN_00223970`, runs at **every** round's end: it sums
the round block into the match block (D:L76030-76063), sets the hit ratio (D:L76064-76070), and only when the net state is
6, the game over (D:L76078), prints YOUR STATS and -- respawn off (game +0xdc, D:L76080) and `ComeFromLan` 0
(`FUN_003045b0`, D:L76081) -- folds the match (`FUN_00225070`, D:L76082). So the room calls one hook at every round's
end (`RoomOptions.onRoundOver`, in `endRound` after `roundOver` is sent and before the votes' kicks), with the rounds
played and each side's wins, `matchOver`, respawn, the game type, the round's clock and every seated player's counters
(`RoundOverReport`); the room imports no store. The bridge gives each game's room a writer (`MatchEndStats`) bound to the
store and to the game's seats (`LiveGame.seats`: the account seated under a room id now). The writer sums the clocks and,
on the report that is the game over and under the upload rule (§3), folds every reported seat that names an account
(`applyMatch` over `readAccountStats`, then `writeAccountStats`), then zeroes its sums, as +0xf0 is zeroed after the game
over (D:L76128-76133); it zeroes them too at a match's first round (`onRoundStart(1)`, where the room's `resetMatch`
zeroes its counters). A record the store refuses (an account gone) is logged and the next seat written; the room's step
never sees a throw.

- **Whose record.** Each console folds its own player's (D:L76609-76611). The room is every console: every seated player
  on a side -- the report's seats are the room's players, its seated non-spectators -- whose seat names an account. A
  spectator is in no report; a seat without an account (a guest's) writes nothing; the maps' rooms (`/testroom`'s, the
  `?mp` rooms) have no writer at all -- only a game's room, made by the bridge, does. A player gone before the game over
  is in no report: its console never reaches the game over either.
- **Never on a page's word.** No path takes a record, a counter or a rating from a page: the store's `setAccountStats` has
  no HTTP caller (`lobbyHttp.ts`, `accountHttp.ts` and `clans.ts` only read the blob); SVC-07's post (sprint 22) changes
  only hometown, description and gender (the OT.R18 note). No path was added.

**5.4 The three inputs the room lacked (§2), decided.**

| input | decided | source | level |
|---|---|---|---|
| the match's clock total (game +0xf0) | the sum of the rounds' clocks, each the room's ticks from its round's start to `endRound`, in ms (`roundMs`), an unsigned 32-bit sum | +0xf0 += the round's +0xe8 when the net state turns to 4 or 6 (`FUN_002a9b30` D:L150661-150669; `FUN_002aa490` D:L151127-151133); zeroed after the game over's fold (D:L76128-76133) and at the game's creation (`FUN_002ad290` D:L152597); +0xe8 = the clock's ms since +0xe4 while +0xf4 and +0xf5 are set (`FUN_002aa490` D:L151092-151100), +0xe4 the clock at the round's start plus a count of seconds (`FUN_002a6b90` D:L149005-149008) | `MATCH_CLOCK_TOTAL_READING`: a running total, read; when +0xf4 / +0xf5 stop the clock (D:L149009, `FUN_002c1c30` D:L163937) against the room's round end is not |
| bombs planted, defused, per player (block +0x38, +0x36) | counted from the room's bomb's `planted` and `defused` transitions (the ones PF-14b scores), to the account the actor's seat names at the event, summed over the match | the plant adds 1 to the planter's own round block +0x38 (`FUN_005455d0` D:L411611-411613, called with the actor's block, `FUN_002c1c30` D:L163947); the defuse 1 to the defuser's +0x36 (`FUN_00545650` D:L411642, D:L163934); round into match at D:L76057-76058 | `MATCH_BOMB_COUNTS_READING`: attributable per player, so counted -- outside the room, through its public bomb, so `room.ts` gains no counter |
| `ComeFromLan` | never set for the match server's rooms | the valve is the client's (`FUN_003045b0` D:L204495-204507; S:0x3f6328); our server runs no LAN game | `COME_FROM_LAN_ADAPTATION`: where the rule is decided (the server), not a stand-in for an unknown |

The others are the room's as §2 lists them: kills and deaths (`Player.kills`, `deaths`), the five PF-26 counters, PF-14's
two objectives, HX-5's two hostage counts (0 outside EXTRACTION), the score (unfolded), the rounds and wins, the side,
respawn (`opts.rules`), the game type (`SimMap.gameType`, 0 when the map has none: not ESCORT).

**5.5 The hand-computed case** (`matchEndStats.test.ts`): BREACH, 3 rounds (two to win), two clock ends -- the
Terrorists' rounds -- of 20 s each, each held 23 s after it (LATER 138, `BREACH_TIMEOUT_HOLD_READING`; re-derived
2026-10-19: the hold counted in the round's clock as an elimination's hold is, `MATCH_CLOCK_TOTAL_READING` -- 43 s a round,
reading, pending review). Alfa (Terrorist, from the default record): kills 3, deaths 1, 4 hits in 10 shots, 2
head shots, 2 bonus objectives, 1 plant -> hit percentage `(int)(0.4 x 100 + 0.5)` = 40 and `(0 x 0 + 40) / 1 + 0.5` ->
40; 86 s; rounds won 2, lost 0; games 1. Bravo (SEAL, a record of 3 games at 50 %): kills +1, deaths +3, a suicide, a
defuse, no shot -> `(50 x 3 + 0) / 4 + 0.5` = 38; 600 + 86 s; rounds lost 1 + 2; games 4; rating 1003 and hometown kept.
A third seat with no account and a spectator with one write nothing; under respawn nothing is written. The bridge's
wiring: a launched game on the fixtures' MP72 (DEMOLITION), a plant and a defuse through the room's own bomb and its own
`onRoundOver` handed a game over -- each account's record folded with its bomb count; then a round's clock and a plant,
the room's `onRoundStart(1)` (a new match) and a second game over -- only the new match's sums folded.

*(2026-10-10, SVC-07, W22.R2 as settled by the merge controller: **the writer is retired.** `stats/matchEndStats.ts`
(`MatchEndStats`, `matchBlockOf`) and its test file are gone; the record's one writer is the results queue's consumer,
`packages/central/src/stats/results.ts` (`ResultsWorker`, research 264 §2) -- the fold (`applyMatch`, §1) over the stored
record from SVC-12d's `RoomMatchResult` (the seat's match block, its own `playedMs` as game +0xf0, the room's one count
of the bombs), at the game over, under the upload rule and OT.R33's `countsForLadder`, in one store change with each
account's mark and audit entry (`ServiceStore.applyResult`), never inside the room's tick. §5.3's write point and
whose-record rules hold there; §5.4's three inputs moved with their names into `results.ts` (§6). §5.5's cases moved to
`packages/central/test/results.test.ts`, each still asserting the record's bytes (five accounts seated, OT.R33; the
seat without an account is SVC-12d's "hands over nothing" now). Reading, pending review.)*

**5.6 What ONL-32's post replay would prove.** The proven level of this section is ONL-32's `MediusAccountUpdateStatsRequest`
of a whole match's end (H27, H94) replayed against our service: the same match's counters through the room and this writer
leave the same 256 bytes as the original client posted -- the clock total's rule (the decided round's hold in or out), the
bomb counts' attribution and the fold's arithmetic over real counters at once; and PLAT-36's PEEK of 0x66a750 after a
match on the local stack (§4) the same without the network. Neither is done; this section is a reading.

## 6. Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `HEAD_SHOT_COUNT_PLACEHOLDER` (server `stats/accountStats.ts`) | `'a kill by a head hit'`: the block's +0x00 fed as given (the room's `headshots`) | which hits the match block's +0x00 counts: the hit paths at D:L459528-459680 and the writer `FUN_005459c0` D:L411756-411773 not traced to their condition | that read; or a GAME COMPLETE frame after a match with a known head hit that did not kill (research 216 §6) | open |
| `BONUS_OBJECTIVE_COUNT_PLACEHOLDER` (server `stats/accountStats.ts`) | `0` where nothing counts one; the room's `bonusObjs` (PF.R34) otherwise | the writer of the match block's +0x34: one is found -- each round's end adds round +0x3a into round +0x34 (`FUN_00224d10` D:L76575, D:L76026-76029; §1) -- but round +0x3a's own writer is not | a search of the writers of round block +0x3a (block-relative, in the `FUN_005452xx-00545dxx` family); a GAME COMPLETE frame after a plant (research 214 §5's capture B item 9) | open |
| `STATS_FOLD_ROUNDING_READING` (server `stats/accountStats.ts`) | `'chop'`: every single-precision step rounded toward zero | the EE FPU's rounding of `mul.s`, `add.s`, `div.s`, `cvt.s.w` in the fold (research 111 §1.4's reading, not measured here) | a record read back after a match of 1 hit in 200 shots on the local stack: hit percentage 0 under chop, 1 to nearest | open |
| `STATS_WIRE_TAIL_PLACEHOLDER` (server `stats/accountStatsCodec.ts`) | `0`: the byte written at +0xe1..+0xff | what the original leaves there: `FUN_002fab80` stops at +0xe0 (D:L198513-198523), so the bytes are the caller's buffer (the s4 slice's lines 114, 176, 262, 270 carry addresses there); no reader of the record reads them | nothing in the original defines them; zero unless a reader of +0xe1.. is found (a search of the record's readers past +0xe0) | open |
| `STATS_OLDER_VERSION_PLACEHOLDER` (server `stats/accountStatsCodec.ts`) | `'default'`: a first byte `'D'`, `'C'`, `'B'`, `'A'`, `'N'` or `'Q'` decodes as the default record | the original's upgrades of those forms (`FUN_002f9ac0` D:L198093-198206), not transcribed: our server writes `'E'` only -- *2026-10-11, SVC-12e: the one rule for the server's two decoders, the modern UI's refusal retired (§11 (a)); `STATS_OLDER_VERSIONS` names the six letters, so the account route can say its rows are this stand-in's* | their transcription, owed only if a record of an earlier client can reach our store | open |
| `STATS_BYTE1_BIT7_PLACEHOLDER` (server `stats/accountStatsCodec.ts`) | `'carried'`: +0x01 bit 7 kept as the record holds it (0 in the default) | the meaning of `DAT_0045a0c3`, which the build copies in (D:L198524); set on both s4 consoles | a read of `DAT_0045a0c3`'s writers; PLAT-36's PEEK or ONL-32's payload beside the setting it follows | open |
| `STATS_BYTE2_LOW_BITS_PLACEHOLDER` (server `stats/accountStatsCodec.ts`) | `'carried'`: +0x02 bits 0-4 kept (0 in the default) | the five low bits of +0x02: no writer or reader read (research 155 §1.1, §8) | a search of the stores to 0x66a752 (and its copies) for these bits; a run that sets them | open |
| `STATS_BYTE3_HIGH_BITS_PLACEHOLDER` (server `stats/accountStatsCodec.ts`) | `'carried'`: +0x03 bits 2-7 kept (0 in the default) | the six high bits of +0x03: no writer or reader read (research 155 §1.1, §8) | a search of the stores to 0x66a753 (and its copies) for these bits; a run that sets them | open |
| `STATS_DEFAULT_GENDER_PLACEHOLDER` (server `stats/accountStats.ts`; SVC-12e, §11 (b)) | `false`: the valve read as 0, so the default record's +0x03 bit 0 is clear | the default's gender bit where the server makes the default: the original sets it when the **local** console's valve `PLAYERGENDER` (S:0x3f5b40) is non-zero (D:L198213-198214), which a server has not, and which value is which sex is not read; both s4 consoles carried 0. One name since SVC-12e: MU-12a's (research 155 §8, `statsRecord.ts`, `0`) and the codec's unnamed `genderValve = false` were the same unknown | the valve's writer on ONLINE OPTIONS (OPT-15) and its two captions | open |
| `STATS_TEXT_ENCODING_READING` (server `stats/accountStatsCodec.ts`; folded from MU-12a's `statsRecord.ts` by SVC-12e, §11) | `'latin1'`: a byte is the character of its code (0x00-0xff); the encoder refuses a character above 0xff | the record's texts' character set past ASCII (the software keyboard's set, research 119); the codec carries every byte one for one (research 155 §8's row, moved) | the keyboard's glyph table against the font's | open |
| `STATS_SERVED_FIELDS_PLACEHOLDER` (server `stats/accountStatsStore.ts`) | `'as stored'`: a served record's +0x08 and +0x0c are the stored record's (0 for one this server wrote) | the ladder position and the minutes online a served record carries: the client fills both from its session at each build (`FUN_002fab80` D:L198555, D:L198525-198532), the server where it serves one (the OT.R18 note; `serveAccountStats`, §5.2) | SVC-13's ladder (the position) and the session's login time (the minutes), passed by the path that serves the record -- *2026-10-09: the ladder's rows fill the position (§9.1); PLAYER INFO's (SVC-07) and the minutes everywhere still as stored*; *2026-10-11, SVC-15a: PLAYER INFO's lookup fills both, the live position and the session's minutes (research 268 §1.2), and the modern route's rows read it; the ladder list's rows still carry the stored minutes* | open |
| `MATCH_CLOCK_TOTAL_READING` (server `stats/results.ts`; `stats/matchEndStats.ts` until SVC-07, 2026-10-10) | `'the sum of the rounds' clocks, start to end'`: each round's ticks from its start to `endRound`, in ms, summed over the match | game +0xf0, the fold's clock total: the rounds' +0xe8 summed (`FUN_002a9b30` D:L150661-150669, `FUN_002aa490` D:L151127-151133), zeroed after the game over (D:L76128-76133); +0xe8 the clock since +0xe4 while +0xf4 and +0xf5 are set (D:L151092-151100); when those stop it, against the room's round end, unread (§5.4) | a record's TOTAL PLAYING TIME after a match of known rounds on the local stack (PLAT-36's PEEK); ONL-32's post | open |
| `MATCH_BOMB_COUNTS_READING` (server `stats/results.ts`; `stats/matchEndStats.ts` until SVC-07, 2026-10-10) | `'the bomb's plant and defuse, to the actor's seat (the room's one count)'` -- *2026-10-10, SVC-07: one count, the room's (SVC-12d's `scoreObjective` on PF-14b's transitions, to the actor's seat, zeroed with the match); the writer's count by account retired with it (was `'the bomb's plant and defuse, to the actor's account'`)* | match block +0x38 / +0x36: the planter's and the defuser's own round blocks (`FUN_005455d0` D:L411611-411613; `FUN_00545650` D:L411642; `FUN_002c1c30` D:L163934, D:L163947), summed at D:L76057-76058; the room's transition stands for the original's net message (§5.4) | a record read back after a match with a plant and a defuse (PLAT-36's PEEK); ONL-32's post | open |
| `COME_FROM_LAN_ADAPTATION` (server `stats/results.ts`; `stats/matchEndStats.ts` until SVC-07, 2026-10-10) | `false`: the match server's rooms are never a LAN game | the valve `ComeFromLan` (`FUN_003045b0` D:L204495-204507), the client's: a labelled adaptation of where the upload rule is decided, no unknown (§5.4) | nothing to settle: our server runs no LAN game | adaptation |
| `RATING_ROUNDING_READING` (server `stats/rating.ts`) | `'chop'`: every single-precision step of the rating rounded toward zero | the EE FPU's rounding of the calculator's `add.s`, `sub.s`, `mul.s`, `div.s`, `cvt.s.w` (ELF 0x239df8-0x239f60, 0x2397f0-0x239b84, 0x225608-0x2256a8), research 111 §1.4's reading as `STATS_FOLD_ROUNDING_READING`; an ordinary round depends on it (§8.3) | one SEAL against two Terrorists at 1000, round 1, the Terrorists winning with match scores 3 and 6, played on the local stack: the score-3 Terrorist posts 1001 under chop, 1002 to nearest (ONL-32) | open |
| `RATING_EXPECTATION_SOFTFLOAT_READING` (server `stats/rating.ts`) | `'double, to nearest'`: `pow(10, d)`, `1 + x`, `1 / x` in IEEE double rounded to nearest, the result to single by `Math.fround` | the soft-float helpers `FUN_002397f0` calls (D:L86040-86044; `FUN_001a0720`, `FUN_001b3898` with 10.0, `FUN_001a0b58` and `FUN_001a0ea0` with 1.0, `FUN_001a12d8`; ELF 0x239834-0x23986c), read by shape and constants only (research 155 §9) | a round between unequal ratings posted by the original (ONL-32) -- one against one at 1400 and 1000, round 1, the 1400 side winning: 1401 and 999 -- or a call trace of the helpers; the s4 trace fixes only E = 0.5 at equal means | open |
| `RATING_SPECTATOR_OUT_PLACEHOLDER` (server `stats/rating.ts`) | `'out'`: a spectator is in neither side and gets no result | whether the original counts a spectator in a side: it tests the spectator flag for the local player only (`FUN_002c2fd0` D:L76690-76691, D:L164609-164645), and the sides take whoever the team tests put on one (`FUN_002c31d0` D:L164723-164767, `FUN_002c30b0` D:L164662-164706); whether a spectator's team word answers either test on the other consoles is not read. Our rooms seat no spectator on a side today (SVC-07a's watchers), so no rating the server computes now depends on it | a read of who writes a spectator's team word; or ONL-32's per-round posts from a round with a spectator seated, the players' posts against the function's | open |
| `RATING_PUBLISHED_REFRESH_READING` | the caller feeds each seat's stored rating -- the last round's result | which rating a player publishes for the next round's calculator: his player state's +8, refreshed from his record by `FUN_002c5360` (D:L166208-166209), which has sixteen calls, one at the game over (D:L76137); whether one runs between a round's post (D:L75804) and the next round's calculation is unread (§8.5) | a read of `FUN_002c5360`'s other fifteen calls (D:L55702, D:L55843, D:L125588, D:L125784, D:L158506, D:L160363, D:L160940, D:L160985, D:L161021, D:L162980, D:L163342, D:L163468, D:L165408, D:L166341, D:L166409); a two-round match's posts on the local stack (ONL-32) | *note only* (SVC-07's, where the round's input is built) |
| `LADDER_TIE_ORDER_OWNER` (server `ladder.ts`) | `'account id ascending'`: of equal ratings the lower account id first | the order of equal ratings: OT.R33 settles research 155 §6 call 5 on the note's recommendation, "(b), the lower id first" (`plans/2026-10-02-online-path-target.md`, OT.R33); Sony's server's order is unobservable (the client draws the rows by position, `FUN_002ec260`); also the order of Horizon's database middleware (research 155 §1.4) | nothing to settle: the owner's rule (named `LADDER_TIE_ORDER_PLACEHOLDER` until SVC-13's review) | the owner's rule (OT.R33, call 5) |
| `LADDER_ENTRY_PLACEHOLDER` (server `ladder.ts`) | `'a written record: its first byte E, the zero blob of an unplayed account off the board'` (`onLadder`) | who is on the board. The rule is the owner's (OT.R33, research 155 §6 call 5 (b)): an account is on the ladder from its first **counted** round, not from its registration at 1000 ("the first ten to register are the first Admirals"). As built, "counted" stands as "written": a record the match server wrote (`'E'`, `FUN_002f9ac0` D:L198209) is on the board; a new account's zero blob (read as the default record) is off it and out of the total. SVC-12c's writer folds every game over under the upload rule (§5.3), without `countsForLadder` and only at the match's end -- so a first game of four, or one left before its end, does not yet follow the rule (named `LADDER_ENTRY_READING`, "from creation", until SVC-13's review) | SVC-07 applying results round by round through `countsForLadder` (or a counted-round mark in the store) -- *2026-10-10, SVC-07: the queue now writes a record only for a counted result (`countsForLadder`, respawn off, round by round) and marks every account it applies to (`lastResult`); but OPT-15's owner-fields write of a never-played account's description stores an `'E'` record too, putting it on the board at 1000 (research 264 §2.7's finding, held by an `it.fails` case) -- so "written" is not yet "counted": the board's entry from `lastResult` is the fix, owed* | replaced 2026-10-10 by `LADDER_ENTRY_OWNER` (SVC-23a, research 264 §3.2: the board reads the one-way rated-once flag) |
| `LADDER_ENTRY_OWNER` (server `ladder.ts`; `serviceStore.ts` `AccountRecord.ratedOnce`, `stats/results.ts`) | `'from the first counted round'` (`onLadder`: the account's one-way rated-once flag) | who is on the board: the owner's rule (OT.R33, research 155 §6 call 5 (b)), built exactly -- the flag set inside the round's own change when the calculator rates the seat above 0 (a seat on a side, not a ghost, D:L76717; the only result written, D:L75801), never cleared by a result; a ghost of every round it sat, a seat with a fold only and a never-played account whose description OPT-15 wrote are off the board and out of the total (research 264 §3.2); the client's own behaviour ranks every account from its first login (`FUN_002faa80` D:L198403-198405) | nothing to settle: the owner's rule | the owner's rule (OT.R33, call 5) |
| `LADDER_BANNED_SOURCE_PLACEHOLDER` (server `ladder.ts`) | `'no account is banned: the store holds no ban until SVC-23's account ban'`: the seam `bannedAccounts()` answers none (since SVC-23a the board's default `banned` and the void's line read it, research 264 §3.1) | OT.R33's call 11 (a banned account off the board and out of the total) needs an account ban the store does not hold (the room's vote ban is a game's, by address) | SVC-23's account ban, the writer `bannedAccounts` reads | open |
| `LADDER_CLAN_TOTAL_PLACEHOLDER` (server `ladder.ts` until CLAN-BOARD-SERVER) | `0`: 0xd8's `ClanTotal` | the clan ladder's total (`TotalClans`, `FUN_002eb1b0` D:L189074-189086); the clan ladder is parked (research 155 §6 call 8, OT.R6, the CLAN RANKING row inert, OT.R8); 0 gives every clan V7's tier 0 (`FUN_002ead80` D:L188875-188879); our Horizon answers the active clans' count (`desktop@be557831 MLS.cs:1173-1201`) | the clan ladder's task, with the clans unparked | retired 2026-10-14 by CLAN-BOARD-SERVER: type 1 answers the clans' board's length (research 310 §6 item 2) |
| `LADDER_ONLINE_STATE_READING` (server `ladder.ts`) | `'the room service's seat; logged in in no room the menus' lobby; logged off Disconnected'` | a ranked row's online state (+0x144, `MediusPlayerOnlineState`, copied whole by `FUN_002ebfe0` D:L189620-189645): in a game InGameWorld, in a room InChatWorld, with the world's id and name (`roomPresence`); a logged-in player in no room the menus' lobby (`roomPresence`'s `loggedIn` over `AccountService.loginAt`: the three `MAIN_MENU_*_PLACEHOLDER`s below; 2026-10-16, CLAN-DOT, research 272 §12 -- the port's narrowing to Disconnected retired); offline, the empty state our Horizon's ladder list sends in every row (`MediusPlayerOnlineState` unfilled: Disconnected, world ids 0, names empty; `desktop@be557831 MLS.cs:1120-1123`); shown under PROFILE-PRIVACY | ONL-32's ranking page beside a player logged in in no room | reading: the room's and the game's states, the offline row Horizon's; the menus' the placeholders' |
| `MAIN_MENU_PRESENCE_PLACEHOLDER` (server `ladder.ts`; wired in `bridge.ts` for the ladder, the friends, the ignore list, the clan roster and PLAYER INFO) | `PLAYER_STATUS.InChatWorld` (2) | the status a logged-in account in no room and no game answers: the console on the menus sits in a lobby world the roster's builder (`FUN_002e6af0` D:L186670) and the friend list's (D:L202759-202762) draw MAIN MENU; the value a reimplementation's -- Horizon's session status, logged in and not in a game InChatWorld (`desktop@be557831 Server.Medius/Medius/Models/ClientObject.cs:300-309`, its roster `MLS.cs:1702`) (2026-10-16, CLAN-DOT, research 272 §12) | ONL-32's transcript of a roster or friend row for a member on the menus | placeholder: a reimplementation's figure |
| `MAIN_MENU_LOBBY_NAME_PLACEHOLDER` (server `ladder.ts`) | `'Medius'` | that account's lobby world's name: both builders test its first six characters against "Medius" (S:0x3f4020, S:0x3f6090) and draw MAIN MENU; Sony's name for the world is not on the disc (Horizon's default channel "Default", `Models/Channel.cs:27` at be557831, would not draw it) (2026-10-16, CLAN-DOT, research 272 §12) | ONL-32's transcript | placeholder |
| `MAIN_MENU_LOBBY_WORLD_ID_PLACEHOLDER` (server `ladder.ts`) | `-1` | that world's id (+0x144): Horizon's for a client in no channel (`MLS.cs:1706` at be557831, a reimplementation); no list draws it, PLAYER INFO copies it (D:L191830-191854) (2026-10-16, CLAN-DOT, research 272 §12) | ONL-32's transcript | placeholder |

| `RANK_REFUSED_STATUS_PLACEHOLDER` (server `lobby.ts`) | `LOBBY_STATUS.Fail` (-966): the status of a join the services refuse by rank | the original sends no such join -- its client refuses first, with #525 (a game) or #50 (a room), and no `MediusCallbackStatus` names a rank (`desktop@be557831 RT.Common/Types.cs:92-137`); Fail is our Horizon's for a join refused for its player (`MLS.cs:2852-2859`), which the console's readers draw as their generic failure (#441; "Cannot join room...") (§10.3) | nothing of the original's server; the owner's word if the server's refusal is to reach the page as #525 / #50; ONL-34's page check shows the original's texts before any request | open |
| `RANK_TIER_UNRANKED_READING` (server `lobby.ts`, `ladder.ts`) | `0`: the tier of an account off the board, and of every player when a room service has no ladder | `FUN_002eae20`'s answer for a console never given its position: the cached position and total keep their load value 0 on a NoResult (D:L189007; 0x44f7f8 and 0x44f800 in the ELF's zero-filled data), and a total of 0 gives 0 (D:L188906, D:L188910-188912); tier 0 asks bit 31, refused by every restricted room and game (§10.2) | PLAT-36's PEEK of `LadderRankRestriction` on a console whose position request was answered NoResult; ONL-32's run of a never-ranked persona against a restricted game | reading |
| `RANK_GATE_ON_SERVER_ADAPTATION` (server `lobby.ts`) | the original's rule judged by the services from the stored position (`RoomServiceOptions.rankTier`) | where the gate runs: the original's client alone (`CanJoinRoom`, `GameRejectsRank`), before any request; neither Medius server judges a rank (`MLS.cs:3136-3198`, `:2834-2872`) -- a labelled adaptation of where the check runs, no unknown (§10.4). *2026-10-14, WATCH-JOIN W8: its scope stated -- where the gate runs is the adaptation; whom it judges is the original's, a player's join (join type 0) only (`JoinAsSpectator == 0 AND GameRejectsRank`, research 314 §3.2); a watcher was judged too until then* | nothing to settle: W10.R3 | adaptation |

## 7. What is left

- **SVC-12b** *(done 2026-10-09, §4: the codec, its tests, the four wire fields against the s4 slice)*. Left from it:
  the `'D'`..`'A'`, `'N'`/`'Q'` upgrades (`STATS_OLDER_VERSION_PLACEHOLDER`); `DAT_0045a0c3`'s meaning and the unread
  bits of +0x02 and +0x03 (§6); the proven level of the layout, PLAT-36's PEEK and ONL-32's payload (§4's last list).
- **SVC-12c** *(done 2026-10-09, §5: the store's read and write, the default for a non-`'E'` first byte, the served
  seam, the room's hook and the writer at the game over, the three inputs decided)*. Left from it: the position and
  the minutes filled where a record is served (`STATS_SERVED_FIELDS_PLACEHOLDER`: SVC-13, SVC-07); the clock's stop
  against the room's round end (`MATCH_CLOCK_TOTAL_READING`); the proven level, ONL-32's post replayed (§5.6).
  **`serveAccountStats` has no caller yet**, owed to SVC-07 and SVC-13: the one path that serves a record today, the clan
  roster (`clans.ts`, `ClanService`'s member rows, written before this task), sends the stored blob raw -- so a new
  account's zero blob goes out as stored, not as the default record `readAccountStats` reads (§5.1), and no position
  or minutes are filled. The serving paths are to go through `readAccountStats` and `serveAccountStats`.
- **SVC-13a** *(done 2026-10-09, §8: the rating at a round's end as a pure function, its tests, the goldens)*. Left from
  it: nobody calls `ratingsAfterRound` yet -- SVC-07 builds each round's `RoundResult` from the room (research 155 §4.2,
  SVC-12d's hand-over) and applies the result once, SVC-13 orders the ladder by it; the join in progress is the caller's
  flag (`JOIN_IN_PROGRESS_READING`, research 155 §8; game +0xcd, SVC-12d's); the published rating between rounds
  (`RATING_PUBLISHED_REFRESH_READING`); the rounding, the expectation's soft-float and the spectator's side (§6); the
  proven level, ONL-32's per-round posts (§8.6).
- **SVC-13** *(done 2026-10-09, §9: the medal and the tier as the client computes them, the board from the stored
  records, the three answers on the lobby's endpoint)*. Left from it: the ban's source (`LADDER_BANNED_SOURCE_PLACEHOLDER`,
  SVC-23's account ban; the seam `bannedAccounts` since SVC-23a); the clan ladder (`LADDER_CLAN_TOTAL_PLACEHOLDER`, parked); OT.R33's game minimum `countsForLadder` has no
  caller yet -- SVC-07 applies it where a round's or a match's result is applied (the rating's `ratingsAfterRound` has
  none either); the clan roster's ladder fields are still Horizon's stand-ins (`ROSTER_LADDER_READING`, `clans.ts`), and
  the roster still serves the raw blob (§7, SVC-12c's line) -- both now able to read `LadderService.standing`; PLAYER
  INFO's position (SVC-07) and the minutes (`STATS_SERVED_FIELDS_PLACEHOLDER`); the proven level, §9.6.
- **SVC-14** *(done 2026-10-09, §10: the rank gate on the services' two joins, the tier from the stored position,
  `ROOM_RANK_NOT_ENFORCED_READING` retired)*. Left from it: the page's own check (ONL-34: the page's tier, then #50 /
  #525 before a request); the status (`RANK_REFUSED_STATUS_PLACEHOLDER`); the proven level, ONL-32's run with a
  restricted game (§10.5).
- **SVC-12e** *(done 2026-10-11, §11: one decoder, the five differences decided at the source; reading, pending
  review)*. Left from it: the live ladder position on PLAYER INFO (§11 (e), SVC-15a's); the older forms' upgrades
  (`STATS_OLDER_VERSION_PLACEHOLDER`, as before); the default's gender bit (`STATS_DEFAULT_GENDER_PLACEHOLDER`).
- **The proven level**: a record read back from the original after a whole match on the local stack (research 155 §9).
- ~~**Review**: the re-read of every cite above by a reviewer who did not write it.~~ *(done 2026-10-09: each task's
  review re-read its cites -- SVC-12a, SVC-12b, SVC-12c, SVC-13a, SVC-13, SVC-14; the sprint's Log)*

## 8. The rating at a round's end (SVC-13a)

*Added 2026-10-09 (web sprint 10, wave 3; W10.R2: the ladder's rating is the client's Elo as read). Reading, reviewed
2026-10-09.* Code: `packages/match/src/stats/rating.ts` -- `ratingsAfterRound`, `roundFactor`, `expectation`,
`localRating`, `RoundResult`, `RatingSeat`, `SeatRating`; pure, no caller yet. Tests `packages/match/test/rating.test.ts`.
It stands on research 155 §2.1 (R155.5-R155.7) and re-reads it line by line and, where the decompiled text leaves a
precision or an order open, instruction by instruction (the ELF disassembled 0x2253c0-0x2256ec, 0x2397f0-0x239b84,
0x239d40-0x23a020, 0x2c2dc0-0x2c2e24; cited by address, no bytes quoted).

**8.1 When, and the inputs.** The exit state's leave (`FUN_002232a0`) calls `FUN_002253c0` when respawn is off (game
+0xdc) and `ComeFromLan` is 0, and writes a result above 0 into the record's +0x04 and posts it (D:L75798-75805) -- at
every round's end, the game over's round included, without the game-over test (§3). Deciding that is the caller's; the
function computes the round. What `FUN_002253c0` (D:L76661-76768) reads, and the `RoundResult` field that carries it:

| the original reads | where | `RoundResult` / `RatingSeat` |
|---|---|---|
| the rounds played, game +0x11c | D:L76700 (counted at D:L150648-150649) | `roundsPlayed` |
| the SEALs' and the Terrorists' round wins, game +0x120 / +0x124 | D:L76703-76704 | `sealRoundWins`, `terroristRoundWins` |
| the last round's winner, game +0x128: the SEALs' flag "is 0", the Terrorists' its opposite | D:L76699, D:L76701-76704 | `winner` (`'seal'`, `'terrorist'`, null) |
| every player of the list, in its order | D:L76713-76746 | `seats` |
| on a side: the SEAL test, else the Terrorist test | D:L76719-76721 | `side` |
| not a ghost of the round (actor +0xfd2, copied from +0xfd1 at D:L76148) | D:L76717 | `ghost` |
| the published rating, `FUN_002c3500` (the player state's +8), `cvt.s.w` | D:L76738-76739; D:L164888-164910; ELF 0x225580 | `rating` |
| the match score, actor +0x580, `lh` and floored at 0 | D:L76734-76737; ELF 0x225558-0x225564 | `score` |
| the local player a spectator: no result | D:L76690-76691 | `spectator` (`RATING_SPECTATOR_OUT_PLACEHOLDER`) |
| the join in progress: the player state's +0x43, a signed byte (`lb`), not -1 | D:L76756; `FUN_002c2dc0` D:L164486-164513; ELF 0x2c2e04, 0x225634-0x225638 | `joinedInProgress` (`JOIN_IN_PROGRESS_READING`, research 155 §8) |
| the record's rating, for the half | D:L76758-76759 (`FUN_002f98f0`'s copy, +0x04) | `rating` (one value on our server) |

**8.2 The steps** (`ratingsAfterRound`, each with its cite):

1. The sides: the SEALs (id 0) and the Terrorists (id 8), each with its round wins and its flag (`FUN_0023a170`
   D:L86334-86363: +0xc the id, +0x14 the wins, +0x18 the flag); the player entries (`FUN_0023a030` D:L86287-86329:
   +8 the score, +0xc the rating, +0x10 the share, +0x14 the new rating) appended to the side whose id matches.
2. No result for anyone unless each side holds a player (D:L76747) -- a side emptied by its ghosts included.
3. The winner is the side whose flag is set, read from the Terrorists' (`FUN_00239d40` D:L86222-86223; ELF
   0x239d98-0x239db0): **a round with no winner is a Terrorist win**, since the SEALs' flag is "game +0x128 is 0".
4. Each side's sum of scores `S`, an integer (`FUN_00239b20` D:L86124-86137), and mean rating `M`, the ratings summed in
   the list's order in single precision and divided by the count (`FUN_00239a70` D:L86105-86121; ELF 0x239aa8-0x239b10).
5. The pot `0.5 x N` (D:L86232; ELF 0x239e10-0x239e20).
6. The factor `f` by the rounds played: 11, 9, 7, 5, 3 -> 0.05, 0.07, 0.10, 0.16, 0.35, any other 0.05 (D:L86234-86252),
   single-precision constants (ELF 0x239e78-0x239ef8).
7. The losing side's part `L = f x (pot x its wins)` -- the ELF multiplies the pot by the wins first (0x239f0c-0x239f18);
   the decompiled text reads `(f x pot) x wins` (D:L86253) -- and the winning side's `W = pot - L` (D:L86254).
8. The shares (`FUN_00239980` D:L86075-86102; ELF 0x239980-0x239a6c), the winners' first (D:L86261-86262): 0 for every
   player of a side whose `S` is under 1 (D:L86089-86090); a loser's `(L x score) / S` (D:L86093); a winner's
   `0.5 + (score x (W - n x 0.5)) / S` (D:L86096-86097), `n` the side's players.
9. `FUN_001b3620` on the shares' sum less the pot (D:L86263): a fabs (D:L32990-32996, the sign bit cleared), its result
   unused -- an assertion's remains; no stand-in.
10. `K = 3 x N` (D:L86266; ELF 0x239f80-0x239f88).
11. Each side's expectation `E = 1 / (1 + 10^((other M - own M) / 400))`: the difference and the division by 400.0 in
    single precision (ELF 0x239824-0x239828), the power, the add and the divide in double by the soft-float helpers, the
    result converted to single (D:L86040-86044; `RATING_EXPECTATION_SOFTFLOAT_READING`); the winners' against the
    losers' mean first, then the losers' against the winners' (D:L86271-86274).
12. Each player's new rating `R + K x (share - E)` in single precision, and 200 if it is below 200 (D:L86051-86056; ELF
    0x239900-0x239930, `c.olt.s` against 200.0); the sum of the changes handed to `FUN_001b3620` again (D:L86058,
    D:L86275-86276), unused.
13. The local result: the player's own entry found in either side (`FUN_00239ca0` D:L86179-86196), `(int)(new + 0.5)`
    in single precision (D:L76754; ELF 0x225608-0x225620); for a join in progress `old + (int)((float)(that - old) x
    0.5)`, `old` the record's rating converted unsigned to single and back (D:L76756-76759; ELF 0x225640-0x2256a8) --
    the half truncated toward zero (a loss of 1 halves to 0, a loss of 3 to -1). A seat out of the calculator returns 0.
14. Applied only above 0 (D:L75801).

The team mode (the calculator's byte +8: one rating a side, K 50, the sides from 1118.0 and 982.0) is dead -- cleared by
the constructor (`FUN_0023a2c0` D:L86400) and by the caller (D:L76702), set by nothing (research 155 §2.1) -- and is not
transcribed.

**8.3 What the re-read adds to research 155 §2.1.**
- **The precision of the expectation.** 155 read `FUN_002397f0` as one formula; the instructions split it: the
  difference and the division by 400 in single, the rest in double through the soft-float helpers, then to single.
- **The order of two products.** `L` is `f x (pot x wins)` in the ELF (step 7), and a winner's share
  `(score x (W - n x 0.5)) / S + 0.5` (step 8; 155 wrote `0.5 + (W - n x 0.5) x score / S`). The same arithmetic; the
  single-precision roundings follow the instructions.
- **An ordinary round depends on the rounding.** With every step rounded toward zero (`RATING_ROUNDING_READING`, the
  fold's reading), one SEAL against two Terrorists at 1000, round 1, the Terrorists winning with match scores 3 and 6,
  gives the score-3 Terrorist 1001.4999 -> 1001; rounded to nearest it would be 1001.5 -> 1002. So the reading is not
  academic: the first such round of ONL-32's capture can settle it.
- **The join test reads a signed byte** (`lb`, ELF 0x2c2e04) against -1 (ELF 0x225634-0x225638): 155's "not -1" holds
  (an unsigned load would have halved every change).
- **The floor's test** is `new < 200 -> 200` (`c.olt.s`), the decompiled text's `200 <= new -> new`: the same but for a
  NaN, which no input reaches.
- **`FUN_001b3620` is read** (step 9): 155 §2.1's "not read" is closed -- a fabs whose results are unused.
- **The spectator** is tested for the local player only (D:L76690); the sides take whoever the team tests put on one.
  The function leaves a spectator out of both (`RATING_SPECTATOR_OUT_PLACEHOLDER`, a placeholder: a spectator's team
  word is not read; our rooms seat no spectator on a side today).

**8.4 The goldens and the worked cases** (`rating.test.ts`):
- **R155.6, the s4 session** (`$SOCOM_PC_ROOT/logs/parity/s4_pcsx2/slice-Medius.log` lines 262 and 270, the stats posts;
  264 and 272, the ladder posts' byte 28 -- read by hand for this note, as research 155 read them; no test of this task
  reads the log, §4's `accountStatsSlice.test.ts` holds the records' 997 and 1003): two at 1000, round 1 run out on the
  clock (no winner), score 1 each -> the SEAL 997, the Terrorist 1003. The function: the Terrorists flagged (step 3), `L`
  0, the shares 0 and 1, K 6, E 0.5 -> 997.0 and 1003.0. The one value of this section seen on the original running.
- **The uneven game** (research 155 §2.1): one beating three at 1000, round 1 -> the share 2, K 12: +18, and -6 each.
- **400 apart** (155 §2.1): one against one at 1400 and 1000: the 1400 side winning posts 1401 and 999, losing 1395 and
  1005 -- under `RATING_EXPECTATION_SOFTFLOAT_READING`.
- **A match's last round, pinned**: BREACH, the SEALs' third win in round 5 (f 0.16), match scores 18 and 12 -> 1001
  and 999; the record after the career fold and the rating equals the record after the rating and the fold (the fields
  are disjoint, research 155 §4.1; the original folds first, D:L76078-76082, then rates, D:L75798-75805); the fold never
  moves the rating; the same round handed twice gives the same ratings (applying it once is SVC-07's).
- Every factor key and another count; the shares on both sides with a side whose scores sum under 1 (the winners' too:
  a winning side with no score loses); the floor; the rounding (1001.5 -> 1002, 998.5 -> 999, the 1-against-2 round of
  §8.3) and the half truncated; the no-winner round against the same round won by the SEALs; a ghost and two spectators
  left out; a side empty.

**8.5 The unknowns, at their level.**
- `RATING_ROUNDING_READING`, `RATING_EXPECTATION_SOFTFLOAT_READING` (§6): readings; `RATING_SPECTATOR_OUT_PLACEHOLDER`
  (§6): a placeholder -- who writes a spectator's team word is not read. Each with what would settle it.
- **The join in progress**: the flag is the caller's; what sets +0x43 (game +0xcd at the join, research 155 §2.1) is
  `JOIN_IN_PROGRESS_READING` (155 §8) and SVC-12d's.
- **The published rating between rounds** (`RATING_PUBLISHED_REFRESH_READING`, *note only*): the calculator reads each
  player's published rating; the refresh from the record (`FUN_002c5360`) is called at the game over (D:L76137) and from
  fifteen other places not read here. If none runs between a round's post and the next round's calculation, the next
  round would use a stale rating -- research 155 §2.1's "the ratings a round uses are the ones the last round left" is
  an inference. The function takes the ratings as given; SVC-07 feeds the stored ones.
- **The other players' match scores**: the sender is read (`FUN_002bd640`, D:L76071), the receiver that stores +0x580 is
  not (research 155 §9); the function takes the room's scores, which are the room's own.
- **That the last round is rated after the game over** (that `FUN_002232a0` runs after net state 6): research 155 §9.

**8.6 What ONL-32's per-round posts would prove.** A whole match on the local stack with its Medius log: each round's
`MediusAccountUpdateStatsRequest` and ladder post per console, against `ratingsAfterRound` over the same round's sides,
wins, winner and scores -- the arithmetic past round 1, the compounding over a match, the last round after the fold,
and, with an unequal pair and an unequal-score round in it, the expectation's helpers and the rounding at once; a join
in progress and a spectator in it would settle `JOIN_IN_PROGRESS_READING` and `RATING_SPECTATOR_OUT_PLACEHOLDER`. That is
the proven level of this section; nothing here is above a reading.

## 9. The ladder (SVC-13)

*Added 2026-10-09 (web sprint 10, wave 3; W10.R2 the rating the client's Elo as read; W10.R3 SVC-14 judges a join by
`tierOf`). Reading, reviewed 2026-10-09.* Code: `packages/central/src/ladder.ts` -- `medalOf`, `tierOf`, `rankLadder`,
`LadderService` (`board`, `standing`, `position`, `totalRankings`, `list`), `roomPresence`, `countsForLadder`; the
store's read `ServiceStore.accountsStats`; the lobby endpoint's three paths `LOBBY_LADDER_PATHS` (`lobbyHttp.ts`),
mounted in `createServices` (`bridge.ts`). Tests `packages/central/test/ladder.test.ts`. It stands on research 155
§2.2-§2.3 (R155.8-R155.10) and re-reads them at the decompilation, at the ELF where a width is open (0x2eae20-0x2eafac
disassembled; cited by address, no bytes quoted) and at our Horizon's pin (`git show be5578311:...`, cited
`desktop@be557831 MLS.cs:<n>`; the working copy, 20 lines longer, is not cited).

**9.1 The three answers.** What the server is asked is small (the OT.R18 note): rank, medal and gate are the page's
own computation from a position and a total (R155.8). Each answer is a path of the lobby's endpoint, its Origin,
method, content type and session checked as the lobby's other services' (`lobbyHttp.ts`); a body no console sends is
400.

| request | what the console sends | what it reads | our answer | our Horizon at the pin |
|---|---|---|---|---|
| `LadderPosition_ExtraInfo`, Lobby 0xf1, 0x24 bytes (`/lobby/ladder-position`) | its own account id at +0x18, stat index 0 at +0x1c, sort order 1 at +0x20 (`FUN_002eafb0` D:L188984-188989; `FUN_002eb2c0` D:L189105-189111, in lobby state 0xb only; the sender `FUN_0064b1b8` D:L562055-562059, length 0x24) | on Success (`FUN_002f42d0` D:L194340-194344: the status is 0) the position +0x1c and the total +0x20, into the globals the two functions read and the valve `LadderRanking` (`FUN_002eb010` D:L189006-189019; `FUN_002eb340` D:L189129-189145), then the medal and the tier into `LadderMedalOfMerit` and `LadderRankRestriction` (D:L189020-189045; D:L189152-189177) | Success with the board's position and length; off the board (banned, no such account) NoResult, position and total 0 | `MLS.cs:1238-1274`: Success with `Index + 1` and `TotalRankedAccounts` (:1256-1262), else NoResult (:1264-1271) -- research 155 §1's numbers hold at the pin |
| `GetTotalRankings`, Lobby 0xd8, 0x1c bytes (`/lobby/total-rankings`) | the tag at +0, the ladder type at +0x18 (`FUN_002eab80` D:L188820-188823; the sender `FUN_0064aee8` D:L561945-561949, length 0x1c) | by the tag (`FUN_002eb1b0` D:L189066-189086): `PlayerTotal` the total the two functions read, `ClanTotal` `TotalClans` | type 0 the board's length; type 1 the clans' board's length (CLAN-BOARD-SERVER, research 310 §6 item 2; `LADDER_CLAN_TOTAL_PLACEHOLDER`'s 0 until then); another type 400 | `MLS.cs:1160-1236`: by type, the active clans' (:1173-1201) or accounts' (:1203-1233) count, DBError on a failure; no default branch |
| `LadderList_ExtraInfo0`, Lobby 0xef, 0x28 bytes (`/lobby/ladder-list`) | stat index 0 at +0x18, sort order 1 at +0x1c, the start at +0x20, the page size at +0x24 (`FUN_002eb510` D:L189195-189211, "TheRest", `7 << 1` rows; `FUN_002eb610` D:L189229-189237, "TheBest"; the sender `FUN_0064b128` D:L562033-562037, length 0x28) | the rows of a Success answer by tag, one kept per position (`FUN_002eb6a0` D:L189253-189270; `FUN_002ebe50` D:L189565-189603), drawn on the row whose +0x1d0 ends the list; a non-Success answer keeps nothing (D:L189253-189256) | the board's rows from the start, at most the page size, the last ending the list; none, one NoResult row ending it | **no handler**: the pin's `MediusLadderList_ExtraInfoRequest` handler (`MLS.cs:1089-1158`) is LobbyExt 0x0f's (`RT.Common/Types.cs:846`), not Lobby 0xef's (`:813`) -- research 97 R97.3 holds; the empty-list form is that handler's (:1137-1145) |

- **The pages the client asks** (`FUN_002784d0` D:L123418-123490, the ranking page's commands): on entering, its
  position (0xf1) and "TheBest", 10 rows from 1 (D:L123420-123421); the position's answer opens "TheRest" at
  `max(1, position - 2)` with 14 rows (D:L189146-189151), or at 1 when the position fails (D:L189130-189131); L1 and L2
  page by 14 from the last start (D:L123440-123452), a request going out only for a start above 0 and below the total,
  one at a time (D:L189195-189196, D:L189210).
- **A row** (R155.10; `FUN_002ebe50`): the position +0x1c, the ladder stat (the rating) +0x20, the name +0x24, the
  256-byte record +0x44 -- parsed by `FUN_002f9ac0` (D:L189580), its clan tag drawn as `[%s]` (D:L189593-189594,
  `S:0x3f4748`) -- and the online state +0x144, copied whole (`FUN_002ebfe0` D:L189620-189645;
  `LADDER_ONLINE_STATE_READING`). Our row carries the same fields by name (`LadderRow`), the record as SVC-12b's 256
  bytes in hex: the stored record as `readAccountStats` decodes it, served with its position filled
  (`serveAccountStats`, §5.2), the minutes as stored. Every row is an account rated once (`LADDER_ENTRY_OWNER`; a written record, `LADDER_ENTRY_PLACEHOLDER`, until SVC-23a).
- **A finding against research 155 §2.2**: this client sends 0xd8 once, tagged `ClanTotal` with type 1, from the clan
  pages (`FUN_002eab80` D:L188820-188823; `FUN_0064aee8`'s one caller). The `PlayerTotal` branch of the answer
  (D:L189068-189071) is reached by no request found: the player's total comes with 0xf1. The endpoint answers both
  types, as the answer's handler reads both.
- The strings by address (the ELF's, read for this note): `S:0x3f46c8` `PlayerTotal`, `S:0x3f4608` `ClanTotal`,
  `S:0x3f4730` `TheBest`, `S:0x3f4728` `TheRest`, `S:0x3f4710` `GetLadderPosition`, `S:0x3f4660` `GetLadderRanking`,
  `S:0x3f46e0` `GetTotalRankings`, `S:0x3f4738` `GetLadderInfo`, `S:0x3f4690` `LadderMedalOfMerit`, `S:0x3f46b0`
  `LadderRankRestriction`.

**9.2 The two functions** (V8), transcribed exactly and exported for SVC-14 (W10.R3):

- `medalOf(position, total)` -- `FUN_002eaee0` D:L188934-188970: 0 while the total is 0 or below (D:L188942,
  D:L188946-188947); 5 for any position while the total is 1 to 11 (D:L188948); from 12, 5 for a position under 11
  (D:L188953-188954), else by `p = position x 1000 / (total - 10)` (D:L188952): under 51 4, under 301 3, under 851 2,
  else 1 (D:L188956-188966).
- `tierOf(position, total)` -- `FUN_002eae20` D:L188898-188931: the same without the top-ten rung: 0, then 4 while the
  total is 1 to 11 (D:L188910-188912), else by `p` (D:L188916-188927).
- **The widths, at the ELF**: the total compared signed (`slti` against 12 and `blez`: 0x2eae40, 0x2eaec0; 0x2eaf00,
  0x2eaf98); `x 1000` by shifts and adds in 32 bits (0x2eae50-0x2eae60; 0x2eaf14-0x2eaf24), so the product wraps past
  2^31, transcribed with `Math.imul` (a position of 2,147,484 on a ladder of 2,200,000 is a Captain by the wrap, an
  Ensign without it: a test); a signed `div` (0x2eae64; 0x2eaf28), truncated toward zero; the thresholds `slti` 0x33,
  0x12d, 0x353. The `-1` position (the function's own cached one, D:L188907-188908, D:L188943-188944) is the caller's
  here: the position is always given.
- **The boundaries held by tests**: positions 10/11, totals 11/12, per mille 50/51, 300/301, 850/851, line for line;
  research 155 §2.3's ladder of 14 (tiers 3, 2, 2, then 1; medals 5 for the top ten, then 1), its small-ladder counts at
  100, 250 and 1,000 ranked, the first tier 4 at 30 ranked, and all ten of the top ten tier 4 from 207.
- The clan's V7 (`FUN_002ead80` D:L188867-188895) is not transcribed: the clan ladder is parked (research 155 §6 call 8).

**9.3 The board's rules, at their level.**

| rule | as built | source | level |
|---|---|---|---|
| the rating | the stored record's +0x04 (`readAccountStats`); the ladder's stat 0 is the same field, posted first in `UpdateLadderStats` (`FUN_002faa80` D:L198436-198440). The store's `ladder` (the last 0xce post per account, `serviceStore.ts`) has no writer on our server -- no page posts a rating (OT.R18) -- so the board does not read it, and no `setLadder` call or table was added | W10.R2; §5 | reading |
| who is ranked | every account with a written record (`onLadder`: the stored record's first byte `'E'`), at its rating; an account registered and never played -- its zero blob, which `readAccountStats` reads as the default record's 1000 (`FUN_002f9ac0` D:L198207-198222) -- is off the board and out of the total. V9's 99 (D:L182642) is the session's start value, never a board's | the owner's rule, OT.R33 settling research 155 §6 call 5 as (b): from the first counted round. The client's own behaviour differs -- it posts at its first login (D:L198403-198405) and every 300 s in the lobby (`FUN_002ee540` D:L190777-190797), ranking every account from its first login at 1000 | the owner's rule; "counted" stood in by "written", `LADDER_ENTRY_PLACEHOLDER` (until SVC-07 applies `countsForLadder`) -- *2026-10-10, SVC-23a: built exactly, `LADDER_ENTRY_OWNER`: the board reads each account's one-way rated-once flag, set when a counted round rates it above 0 as a non-ghost; a fold-only seat, a ghost and a described never-played account are off it (research 264 §3.2)* |
| the order | rating descending, ties `LADDER_TIE_ORDER_OWNER` (§9.4) | the request's stat 0 and sort order 1 (D:L188985-188987, D:L189205-189206); the server's order unobservable; the tie OT.R33's call 5 | reading; the tie the owner's rule |
| the banned | off the board and out of the total: the positions close up, every other medal recomputed from the smaller total | OT.R33 (research 155 §6 call 11); the `banned` seam, empty until SVC-23a/b (`LADDER_BANNED_SOURCE_PLACEHOLDER`) | the owner's rule; its source a placeholder |
| the quitter | stays on the board at his stored rating: nothing on the board depends on a leave. "Recorded" is the result writer's (OT.R33 call 7: the match recorded at the end, no penalty): SVC-12c's writer folds only the seats present at the game over (§5.3); a leaver's fold under call 7 is SVC-07's / SVC-12d's | OT.R33; research 155 §4.3 | the owner's rule; owed to SVC-07 |
| the game minimum | `countsForLadder(playersAtStart)`: five or more at the match's start (`LADDER_MIN_PLAYERS_AT_START`, H168 (H-next a)). **A gate on a game's results, not on the board**: W10.R2 and OT.R33 say "a game counts"; the brief's "the board empty below five" reads the rule onto the board, which neither the ruling nor the client supports (the client gives the Admiral's medal for a total of 1 to 11, D:L188946-188948, and shows an empty page only for a non-Success answer, D:L189253-189256) -- so the board answers whatever its size, and the gate waits for its caller, where a result is applied (SVC-07) | OT.R33; W10.R2 | the owner's rule; no caller yet |
| fresh | the order computed at each ask from the store (research 155 §4.4's "never stored stale"); a new rating moves the next answer -- *2026-10-10, SVC-07: kept in memory against the store's revision and rebuilt when stale (`markStale` after each result applied; research 264 §2.7); the answers the same* | -- | built |

**9.4 Ties.** The client cannot show the server's tie order: it keeps one row a position and sorts by position
(`FUN_002ec260`), drawing what it is sent. `LADDER_TIE_ORDER_OWNER` -- the lower account id first -- is the owner's
rule: OT.R33 settles research 155 §6 call 5 on its recommendation, "(b), the lower id first"; it is also the order of
Horizon's database middleware (research 155 §1.4). Two accounts at equal ratings hold distinct positions, so their
medals can differ across a band's edge. No run of the original can show Sony's order.

**9.5 What is not answered.** The clan ladder (`ClanLadderList` 0xd2, its position request, the clan rating's post 0xce
type 1): parked; 0xd8's clan total 0. *Since CLAN-BOARD-SERVER (2026-10-14; research 310 §6 item 2): 0xd2, 0xd4 and 0xd8's
type 1 answered from the clans' board; the type-1 post still not taken.* Another stat index or sort order (the console asks only stat 0 in order 1): 400,
a body no console sends. A start past the total answers the NoResult row, which the console never asks (it sends a
start below the total only, D:L189195).

**9.6 What the console beside a seeded local Horizon would prove** (the roadmap block's acceptance; ONL-32 the
transcript compare). The same seeded ladder served to the console by a Horizon taught the three answers (0xef's handler
added) and by SOCOM Legacy: the console's PLAYER RANKING page, THE PODIUM and the medal column, the medal beside the persona
and the gate's tier read back (PLAT-36's PEEK of `LadderMedalOfMerit`, `LadderRankRestriction`) for positions across
the bands -- proving the two functions' transcription and the rows' fields as the page consumes them, the paging by 14,
and the screens of an empty and a failed answer. The server's tie order and its entry rule stay unobservable either
way. Nothing here is above a reading.

## 10. The rank gate (SVC-14)

*Added 2026-10-09 (web sprint 10, wave 4; W10.R3: the gate enforced where SVC-14a drew it, the tier `FUN_002eae20`'s,
no top-ten rung; `ROOM_RANK_NOT_ENFORCED_READING` retired, research 161 §7). Reading, reviewed 2026-10-09.* Code:
`packages/central/src/lobby.ts` -- `rankAdmitsRoom`, `rankAdmitsGame`, `RoomServiceOptions.rankTier`, the checks in
`RoomService.joinChannel` and `joinGame`, `RANK_GATE_ON_SERVER_ADAPTATION`, `RANK_REFUSAL_MESSAGES`,
`RANK_REFUSED_STATUS_PLACEHOLDER`, `RANK_TIER_UNRANKED_READING`; `packages/central/src/ladder.ts` `LadderService.tier`;
mounted in `createServices` (`bridge.ts`), so `/lobby/join-channel` and `/lobby/join-game` judge it. Tests
`packages/central/test/rankGate.test.ts`, and `lobby.test.ts`'s SVC-14a block. It stands on research 161 §4 (the bits,
SVC-14a), 155 §2.3 (the tiers), 165 §1 (`aux_join_game`, R165.1-R165.3) and §9 above, and re-reads the cited lines at
the decompilation, the ELF's load segments by address, and our Horizon at the pin (`git show be5578311:...`).

**10.1 The rule** -- the same for a room and a game but for the bits' width:

| | the original's check | the bits | admitted when | ours |
|---|---|---|---|---|
| a room | `CanJoinRoom` (`FUN_0027d690` D:L126002-126020 -> `FUN_002e34e0` D:L184681-184712), in `join_room`'s IF (research 161 §5) | GenericField1's low four bits (the room record's +0x34, D:L184707) | the four are 0, or bit `tier - 1` is set (D:L184708-184711); a room not found answers 0 | `rankAdmitsRoom` |
| a game | `GameRejectsRank` (`FUN_002f8bc0` D:L197406-197429), in `aux_join_game` (research 165 R165.1) | GameStats byte 7: the list record's +0x1a1 (D:L184664-184665), its 'D' record kept at +0x19a (`FUN_002f7d90`; `gameStatsD`), the byte the join copies into `mp_rank_restrictions` (D:L197287) | the byte is 0, or bit `tier - 1` is set (`FUN_002e3490` D:L184663-184668); a game the console does not find (`FUN_002e4470`, `FUN_002e4570`, D:L197421-197422) is not rejected | `rankAdmitsGame` |

- **The shift's count is masked to five bits** (`& 0x1f`, D:L184709, D:L184665): tiers 1-4 ask bits 0-3 (ENSIGN,
  LIEUTENANT, LT. COMMANDER, CAPTAIN: `ROOM_RANK_BITS`), and tier 0 asks bit 31, which no room's four bits and no byte
  hold -- so tier 0 is refused by every restricted room and game and admitted by an open one.
- **The widths differ.** A room masks its four bits, so its high half (the list's order, `FUN_002e3f80`) restricts
  nothing; a game tests its byte whole, so a byte of high bits alone refuses every tier (and draws no icon:
  `gameRankIcons`, D:L184465-184492).

**10.2 The tier at the edges.** `FUN_002eae20` asked with the -1 position (both callers: D:L184706, D:L197423) reads
the console's own cached position and total (D:L188907-188910). By the total: 0 or below, tier 0 (D:L188906,
D:L188910-188912); 1 to 11, tier 4 for every position (D:L188910-188912); from 12, `tierOf`'s bands (§9.2) -- on a
ladder of 14, position 1 tier 3, 2-3 tier 2, the rest tier 1; the first tier 4 at 30 ranked (research 155 §2.3).

- **Off the board** (`RANK_TIER_UNRANKED_READING`, 0). The cache changes only on a Success answer to the console's
  position request (D:L189007-189011, D:L189134-189137) and on 0xd9's `PlayerTotal`, which no request reaches
  (D:L189068-189071; §9.1). An account off our board -- never rated (`LADDER_ENTRY_OWNER`), or banned -- is
  answered NoResult (§9.1; our Horizon the same, `desktop@be557831 MLS.cs:1264-1271`), on which the console keeps what
  it had (D:L189007). What it had, never answered, is the load value: 0x44f7f8 (the position) and 0x44f800 (the total)
  lie in the zero-filled tail of the ELF's third load segment (virtual 0x1e7000, its file bytes ending at 0x408480,
  its memory at 0x4b5380; read off the program headers by address), and the static initializer beside them
  (`FUN_00401fa0` D:L328576-328606) writes their neighbours, not them. So the console computes tier 0, and the server
  judges an account off the board as tier 0.
- **What that means here.** The original's client posts its record at its first login (D:L198403-198405), so every
  account was on Sony's board from its first session at 1000 and tier 0 was a moment's state. Under OT.R33's entry
  rule (call 5 (b); `LADDER_ENTRY_OWNER` since SVC-23a) an account is off the board until its first counted round:
  until then every restricted room and game refuses it. The rule is the owner's and the tier the original's; the
  consequence is the owner's question, H175 (H-next i) of the sprint's plan (`../plans/2026-10-09-web-sprint-10-the-services.md`;
  the default as built), not changed here.
- A console answered once and dropped from the board since keeps its last tier (D:L189007); the server judges by the
  board as it stands. Our Horizon's rooms carry 0 (OC-4, OT.R17): no room on the path is restricted; a game is
  restricted by its host's CREATE GAME rank row (GameStats byte 7, ONL-13).

**10.3 The code and the text (V14).** In the original a rank refusal is the client's text, shown before any request
goes out: `aux_join_game` shows **#525** ("You do not meet the rank requirements for this game. ...", research 155 §3)
when `GameRejectsRank` answers 1; `join_room` shows **#50** in the JOINING strip for 2.5 s when `CanJoinRoom` answers 0
-- the same text as for a room not found (research 161 §5). Re-read at the disc for this section
(`tools/dump-dialogs.ts`, 2026-10-09): #525 is named by `dlgMPBriefingRoom.rdr` alone (`--msg-users 525 525`), and
`aux_join_game` runs `ClanGameClosed`, a popup, `GameRejectsRank`, a popup, then `GameHasPassword` /
`GameHasSpectatorPassword` (`--dialog dlgMPBriefingRoom.rdr`); #50 is research 161 §5's reading of `join_room`,
not re-read here (`--msg-users` lists no dialog for it, and `join_room`'s binding lists no message id): where #50 is
drawn is still to settle. **525 is a UIMnLOC message id, not a status**
(`RANK_REFUSAL_MESSAGES`): no `MediusCallbackStatus` names a rank (`desktop@be557831 RT.Common/Types.cs:92-137`), and
neither reply reader maps any status to #525 or #50 -- JoinGame's (`FUN_002edba0` D:L190421-190438) raises
MP_INVALID_PASSWORD for -978 (S:0x3f4860), MP_BANNED_FROM_GAME for -972 (S:0x3f4880) and MP_MEDIUS_JOIN_GAME_FAILURE
(#441, S:0x3f48a0) for anything else (research 165 R165.3); JoinChannel's (`FUN_002ee3a0` D:L190717-190724) raises
MP_MEDIUS_JOIN_ROOM_FAILURE (S:0x3f4760) with "Cannot join room. It may be full. Please try another." (S:0x3f49a0) for
any failure. **What Horizon would send**: nothing -- it admits; JoinChannel refuses a missing channel and a wrong
password only (`MLS.cs:3136-3198`); JoinGame a banned account in the handler (`MLS.cs:2834-2872`), then a game not found,
a wrong password and a full game in the manager (`desktop@be557831 Server.Medius/Medius/MediusManager.cs:319-342`) -- none
by rank. **What the port answers**:
MediusFail (`RANK_REFUSED_STATUS_PLACEHOLDER`) -- no status of the original exists to copy; Fail is the status our
Horizon answers a join it refuses for its player (the banned account, `MLS.cs:2852-2859`); the console's readers draw it
as their generic failure (#441; the room's "Cannot join room..."); the password limiter does not count it (`triedJoin`
counts InvalidPassword only). The original's #525 and #50 come from the client's own check, which stays the reading:
the page shows them only when it computes a tier (it asks no ladder position yet: `PLAYER_TIER_PARKED_READING`, the ui
package's, research 165 §6 -- ONL-34's to wire).

**10.4 Where it runs.** The original checks on the client only; the port checks on the server, with the original's
rule over the stored position (`RANK_GATE_ON_SERVER_ADAPTATION`; `LadderService.tier` is `tierOf` at `standing`, else
0), so a page cannot talk its way past a gate (the OT.R18 note's principle). The order of the refusals follows the
console, which asks the rank before it sends: a room -- not found, the rank, the password, full; a game -- not found
(or pending), the rank, banned, the password, full. The host is not judged: his join follows his own create, with no
`GameRejectsRank` (research 165 R165.10; cbCreateGame's state 0xf, D:L190637-190641). A watcher is judged as a player
is (`aux_join_game` asks `GameRejectsRank` before either password check, the player's or the watcher's: §10.3).
*Corrected 2026-10-14 (WATCH-JOIN W8; research 314 §3.2): a watcher is not judged -- `aux_join_game`'s rank test is
`IF JoinAsSpectator == 0 AND GameRejectsRank` (`dlgMPBriefingRoom.rdr`; `tools/test/onlineDialogs.pinned.json` line
4571, research 314's P:L4571), so the original asks it for a player's join only; the sentence before misread the line.
The services' gate now judges join type 0 only (`joinGame`); where it runs stays the adaptation
(`RANK_GATE_ON_SERVER_ADAPTATION`), whom it judges is the original's.* A refused
join leaves the player where he was (no seat taken, the room he was in kept).

**10.5 Owed.** The proven level: ONL-32's run with a restricted game (a game whose CREATE GAME rank row admits one
tier, joined by a persona of another tier on the local stack -- the console's #525, and the transcript's absent
JoinGame). The page's own check (its tier from its position request; then `CanJoinRoom` and `GameRejectsRank` refuse
with #50 and #525 before a request goes out): ONL-34. Which rooms the original's server marked (OC-4: the default
names, every room 0). The ui package's typecheck after the constant's removal (`tsc -b packages/ui`, the host's rule
on 2026-10-09).

## 11. One decoder (SVC-12e)

*Added 2026-10-11 (web sprint 18, wave 1; W18.R2; the brief
[`../plans/briefs/2026-10-11-s18-w1-svc-12e-stats-one.md`](../plans/briefs/2026-10-11-s18-w1-svc-12e-stats-one.md)).
Reading, pending review.* Code: `packages/central/src/stats/accountStatsCodec.ts` (the one decoder, §4's, and
`STATS_OLDER_VERSIONS`, `STATS_TEXT_ENCODING_READING`), `packages/match/src/stats/accountStats.ts` (`RECORD_LAYOUT`'s
`u32`, `STATS_DEFAULT_GENDER_PLACEHOLDER`), `packages/central/src/statsRecord.ts` (PLAYER INFO's layer: `playerInfoLines`,
`formatHitPercent`, `formatOnlineMinutes`, `formatPlayingTime`, over `AccountStatsRecord`), `packages/central/src/modernHttp.ts`
(the account route, through both). Tests: `packages/central/test/accountStatsCodec.test.ts` ("SVC-12e: ..."),
`statsRecord.test.ts`, `modernHttp.test.ts`, `accountStats.test.ts`, `ladder.test.ts`.

Two modules decoded the 256-byte record: §4's codec (read by the store, the results queue, the void, the ladder and the
owner-fields path) and the modern UI tree's MU-12a `statsRecord.ts` (`StatsRecord`, `decodeStatsRecord`,
`encodeStatsRecord`, `defaultStatsRecord`, `DecodeError`; read by `modernHttp.ts`). They differed on five points. Each is
decided here at the source; the codec stays (W18.R2's settled default), `statsRecord.ts` keeps PLAYER INFO's formats
and loses its own decode.

**(a) The older version letters -- the codec's rule: the default.** The parser has no failure branch: every one of its
seven ends in a record, given a place to write it (`FUN_002f9ac0` D:L198088-198222). `'E'` is copied whole (D:L198088-198092); `'D'` (D:L198093),
`'C'` (D:L198125), `'B'` (D:L198155), `'A'` (D:L198165) and `'N'` / `'Q'` (D:L198195) each build the next form from the
old one and parse it again (D:L198123, D:L198153, D:L198163, D:L198193, D:L198205), so an older record reaches `'E'`
carrying its own values; any other first byte becomes the default (D:L198207-198222). A refusal
(`unsupported-version`) has no counterpart in the original; the default is what the parser gives every byte it does
not upgrade. Neither module transcribed the upgrades, so the six still decode as the default
(`STATS_OLDER_VERSION_PLACEHOLDER`, §6). The codec names the six (`STATS_OLDER_VERSIONS`), and the account route's
`unreadable: true` follows from it: one of the six gives the default record's rows with the page's labelled note (a
browser adaptation: the rows are the stand-in's, not the record's), any other byte the default's rows alone. What a
page sees is unchanged (MU-12a's route gave the same rows and the same note for these six).

**(b) The gender default -- one name: `STATS_DEFAULT_GENDER_PLACEHOLDER`.** The codec's `defaultAccountStats(genderValve
= false)` (an unnamed literal) and MU-12a's `STATS_DEFAULT_GENDER_PLACEHOLDER = 0` stood for one unknown: the default
record's +0x03 bit 0, which the original sets when the local console's valve `PLAYERGENDER` (S:0x3f5b40) is non-zero
(D:L198213-198214). One name now, `STATS_DEFAULT_GENDER_PLACEHOLDER` (`false`: the valve read as 0, the bit clear) in
`stats/accountStats.ts`, the default of `defaultAccountStats` and `decodeAccountStats`; a caller that holds the valve
passes it. Its row is §6's; research 155 §8's row is marked moved, research 101's names the new file. The unnamed
literal is gone from the code.

**(c) +0x0c and +0x10 -- unsigned words (`u32`), MU-12a's kind.** The writers both convert to unsigned. The build's
minutes are the session's elapsed time over 60.0 in single precision, converted by the compiler's float-to-unsigned
sequence (a test against 2^31, the high bit or-ed back in past it) and stored as an unsigned word (`FUN_002fab80`
D:L198525-198532); the fold's seconds are the clock total times 0.001 through the same sequence (`FUN_00225070`
D:L76642-76648), added into the word (D:L76649). The readers: ONLINE prints +0x0c with `%d` (S:0x3f4d38, D:L192022) --
the format prints the bits signed; TOTAL PLAYING TIME divides +0x10 unsigned -- the hours by a `multu` with the
reciprocal 0x91a2b3c5 and a shift of 11 (ELF 0x2f0d90-0x2f0dc4), the remainder by the `divu` at 0x2f0dc0, the minutes
by a `multu` with 0x88888889 and a shift of 5 (0x2f0dd0-0x2f0de4), disassembled from `game/disc/socom2_game.elf` by
address for this section; the decompiler's `(int)` cast on the remainder (D:L192130) is not the instruction. So
`RECORD_LAYOUT` holds both as `u32` (0..2^32 - 1; the other five words stay `int32`) and `applyMatch`'s seconds sum is
an unsigned word. The bytes are the same either way; what changes is the number the services hold past 2^31 (0x80000000
seconds is 2147483648, not -2147483648) -- some 68 years of play, or 4,000 years online. The layer prints as the
original does whichever way a number is held: `formatOnlineMinutes` signed (0x80000000 -> `-2147483648 min.`,
0xffffffff -> `-1 min.`), `formatPlayingTime` unsigned (0x80000000 -> `596523 : 14`, 0xffffffff -> `1193046 : 28`); a test
at each, directly and through a decoded record.

**(d) The 256-byte check -- refused, MU-12a's rule.** The message's field is `ACCOUNTSTATS_MAXLEN` 256
(`desktop@be557831:server/horizon-server/RT.Common/Constants.cs:12`, read by `git show` at the pin); the build fills its
caller's 256-byte buffer (+0x00..+0xe0, §4) and the parser reads the record from a pointer with no length
(D:L198086-198092): no record of another length exists in the original, and zero-filling a short one (the codec's rule
until now) invented bytes. `decodeAccountStats` refuses any length but 256 with a `RangeError`. The store can hold
another length only by corruption, and each of its paths refuses one first: the write (`serviceStore.ts`'s `blob()`, a
`width` `StoreError`, for `setAccountStats`, `applyResult` and `applyVoid`), the load (`validateData`'s `isBlob`, a
`corrupt` `StoreError` when the database is opened) and the schema (the accounts table's `CHECK (length(stats) = 256)`).
The proven-level harness already refused one before decoding (research 267 §1). The account route's answer for such a
blob changes from the default rows marked unreadable to the route's fault (a 500); only a store that broke all three
checks could reach it.

**(e) The stored against the live ladder position -- SVC-15a's, not this task's.** The account route shows the stored
+0x08, the poster's last-heard position (`DAT_0044f7f8`, written at each build, D:L198555); the original's PLAYER INFO
opened from the ladder shows the row's position (research 155 §3), and SVC-15a fills +0x08 from the ladder's order.
`modernHttp.ts` is left as it is, its comment saying so, and a test pins the stored value.

**The retired names.** Of `statsRecord.ts`: `StatsRecord`, `decodeStatsRecord`, `encodeStatsRecord`,
`defaultStatsRecord`, `DecodeError`; the constants `STATS_BLOB_BYTES` (the codec's `ACCOUNT_STATS_BYTES`),
`STATS_RECORD_VERSION` (`RECORD_VERSION_E`), `STATS_DEFAULT_RATING` (`DEFAULT_RATING`), `STATS_WRITTEN_BYTES`
(`BUILD_BYTES`), `STATS_TEXT_WIDTHS` (`RECORD_LAYOUT`'s sizes) and `STATS_RECORD_BYTES` (0xe4, the parser's copy,
D:L198088-198092, which no code of ours used); its field names, mapped to the codec's -- `flag45a0c3` to `byte01Bit7`,
`rawBits.b02lo` / `b03hi` to `byte02Low5` / `byte03High6`, `genderBits` to `gender`, the booleans `clanLeader` to the
bit's 0 / 1 -- and `isDefault`, which nothing read. `medalOf` and `rankTierOf` give way to `ladder.ts`'s `medalOf` and
`tierOf`: MU-12a's sixteen medal and twelve tier vectors agree with them and moved to `ladder.test.ts` (and a sweep for
this task, not kept, compared the two over every position 0 to the total + 2 of every total -3 to 1,200: 724,206 cases,
and four more at the product's 32-bit wrap and beyond, none differing). `foldHitPercent` gives way to `applyMatch`: its five vectors agree and moved to `accountStats.test.ts`
(the sweep compared old percentages 0-127, games 0-40, 1,000, 100,000 and 4,194,302, every hits <= shots <= 40: 4,849,152
cases, none differing). `ladderOf` had no reader and went, with its two vectors (the s4 slice's ladder posts, lines 264
and 272, `[rating, 0 x 14]`; `FUN_002faa80` D:L198436-198438): the post is the client's, and no path of our server
builds one. `STATS_DEFAULT_GENDER_PLACEHOLDER` moved (b); `STATS_TEXT_ENCODING_READING` was folded into the codec, whose
strings follow the same rule (§6). The server no longer names `EE_FPU_ROUNDING_READING` (the fold's own
`STATS_FOLD_ROUNDING_READING` stands, §6; research 101's row says so).

**Superseded.** The modern UI's research brief
[`../plans/briefs/modern-ui-research-stats-blob.md`](../plans/briefs/modern-ui-research-stats-blob.md) is history and is
not edited: on these five points this section supersedes it -- its refusal of the older versions (its vector 2) by (a),
its U3 by (b), its unsigned +0x0c / +0x10 by (c) (agreeing), its width refusal by (d) (agreeing), its PLAYER INFO
position by (e).

**What would prove it** (the proven level, not this task's): as §4's -- PLAT-36's PEEK and ONL-32's payload (H185) for
the layout; a PLAYER INFO frame of a record whose +0x10 is past 2^31 for (c) is not to be had in practice.
