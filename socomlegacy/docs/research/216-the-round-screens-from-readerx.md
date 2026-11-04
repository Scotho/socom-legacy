# 216 -- The round screens from READERX (web sprint 26, PF-26)

- Date: 2026-10-04 (web sprint 26). PF-26: the three round-end screens drawn to SOCOM II's own layout, and the room's
  per-player match counters GAME COMPLETE's YOUR STATS reads.
- Status: **reading, pending review.** Every value below is a read of the disc's dialog source or of the decompilation
  (`D:L<n>` of `socom2_game.elf.decomp.c` r0001), as research 179 s10 gives it; nothing here is a capture. Research 179
  grades several of these PROVEN; under AGENTS.md a source read is a reading until reviewed (research 206).
- Sources: research [179](179-c1-match-server.md) s10 (Part D: the round and final screens) and s13.7 (V1 #8, the
  columns), the dumps `scratch/C1/D/compact_READERX_<dialog>.rdr.out` (research wave 2026-10-04); research
  [91](91-the-round.md) s1, s8, s13, s18; [192](192-m1-mp-modes-rules.md) s3.6 (objective scoring, not built here);
  [203](203-r2-mn-match-modes-net.md) s12 (two objects with one NAME); [206](206-verification-overrides-and-the-waves-close.md)
  s1 (no override touches these screens) and s4.4 (the owner's session S2).
- Code: `packages/viewer/src/roundScreens.ts` (the whole layout, PF.R19), `packages/match/src/room.ts` (the counters),
  `packages/viewer/src/net/protocol.ts` (`MatchStats`, `roundOver.stats`), `packages/viewer/src/netPage.ts` (the feed),
  `packages/viewer/src/hud.ts` (`Hud.addBitmaps`, PF.R22).

## 0. The answers

| question | answer | source |
|---|---|---|
| Where the layouts come from | `RUN/UI/READERX.ZAR`: `dlgMultiplayerRound.rdr`, `dlgMultiplayerFinal.rdr`, `dlgMultiplayerFinalReally.rdr` (READERC holds the same layouts); the game mounts READERX at the round's end | `FUN_00223970` 0x223f00 (D:L76089); 179 s10 |
| The columns | SCORE, KILLS, DEATHS (the port showed KILLS, DEATHS, SCORE) | column table 0x3e51c0, `FUN_003fe860`; 179 s10 s2, s13.7 |
| The background | `multplay_back.tif` over the frame, translucent `backsolid.tif` panels (RGB 0,72,88); no team bar; 16 static row strips | 179 s10 s3-s5 |
| The sort | score, kills, then the name in reverse `strcmp` order, highest first | `FUN_00225f30` D:L77014-77068; D:L76309 |
| The MVP | the highest total score over both sides, then kills, then the name | `FUN_002256f0` D:L76771-76885 |
| YOUR STATS | nine values for the local player at (250, 225 + 23k) | `FUN_00225a00` D:L76886-76933 |
| The timings | rows at 0.15 s then every 0.1 s; GAME COMPLETE's counters 3.5-4.0 s (SEAL ROUNDS) and 4.0-4.5 s (TERRORIST ROUNDS); `TimeoutMonitor` 90 s | 179 s10 s7, s11 |
| Which block each list reads (2026-10-23) | ROUND COMPLETE's and FINAL ROUND's lists the round block (`+0x58c`: that round's kills, deaths and score, its +5 / +1 bonuses in it); GAME COMPLETE's totals, MVP and YOUR STATS the match block (`+0x544`) | §8: the getters 0x225fe0 / 0x225f20 through the member pointers 0x3dc7b0..0x3dc7e0; `FUN_00223680` D:L75946-75949 |

## 1. The layouts as transcribed

Coordinates in the dialog's 640x448 frame; a TEXT's YPOS is its baseline (research 87 s3), a LISTBOX row `k` at `YPOS +
SPACING x k`, an IMAGE's place its top-left; CHILDOF adds the parent's place. COLOR on the 0..128 scale: white (128,
128,128) is the loader's default (`packages/ui/src/dialog.ts` `DEFAULT_COLOR`), gold (91,72,36).

ROUND COMPLETE: `TitleBar` (45,50) 1.75 gold; `NextMission` (380,50) 1.0, `CountDown` +130 at 1.2; `SealText` (20,70) /
`CharText` (20,270) 1.0; `DrawRoundS` (200,70) / `DrawRoundT` (200,273) 1.0 gold; headers HCENTERED at 368 / 470 / 578,
y 75 and 277, 0.9 (the SEAL KILLS header is the misnamed `Score_Text`); `RoundStatsSealsList` (365,94) and
`RoundStatsTerrList` (365,296), SPACING 20, SCALE 0.9, COLUMNS name -290, clan -345, numbers RIGHT_JUSTIFIED 8 / 110 /
217 (x 373 / 475 / 582); the local row's name and clan gold (`FUN_002b3580` D:L76322-76324).

FINAL ROUND: the same, with the title at (75,50) (`FINAL_TITLE_READING`), FINAL TOTALS beside the countdown, the
results at 0.9 with `DrawRoundT` at (200,270), and the lists at x 355: the seals' COLUMNS 18 / 120 / 227 (x 373 / 475 /
582), **the terrorists' 8 / 110 / 217 (x 363 / 465 / 572)**, the names at x 65 on both. The brief and 179 s5 name only
the seals' list; the dump (`compact_READERX_dlgMultiplayerFinal.rdr.out`) gives the terrorists' as above, and the port
draws it so.

GAME COMPLETE: `TitleBar` (55,60); no NextMission; headers gold at 368 / 475 / 578, y 55; `SealText` (20,85) and
`TerrText` (20,110) 0.9, their `DrawRound` CHILDOF +220 (WINNER on the side with more rounds, `CallRoundATie`);
`SealsTotals` (350,85), `TerrsTotals` (350,110), `MvpTotals` (350,155), COLUMNS 25 / 125 / 230 (x 375 / 475 / 580);
`MVPText1` (20,135) 1.0 gold, `MVPText` +20 at 0.9; YOUR STATS (s2); `RWS` (390,196), `RLS` (555,197), `RWT` / `RLT`
(390 / 555, 267) two-line gold captions, their COUNTER +35 (s3); `Time` (470,350) gold, `TimePlayed` +25; `RTGL` (20,430)
0.9. The panels are the dialog's CONTROLS in order (`Team_back`, the totals' and MVP's strips, the column backs and
their `*_Head_Top`, `Stat_back`, the YOUR STATS strips 300x20 at y 208 + 23k, `RoundsTime_back`, `YRWSBack`, `TimeBack`).

The screens are drawn in the HUD pass (PF.R19). The black backdrop under the frame and the flat `BACKSOLID_RGB` panels
when `multplay_back.tif` / `backsolid.tif` are not among the HUD's bitmaps are runtime fallbacks, not values (PF.R22):
`Hud.addBitmaps` takes UIMP's copies (`armoryData.ts` decodes them; 179 s10 s3: byte-identical to SPMP's). *Wired
(PF.R22's follow-up):* the page's `armoryData()` (`main.ts`) hands them over through `roundScreenBitmaps`
(`roundScreens.ts`) from the ARMORY's own decode, asked at every map's show -- no second decoder, no extra read (the
layout already names both; `armoryFromDisc` now wants them by name too); the HUD keeps them across maps.

## 2. YOUR STATS and the room's counters

`FUN_00225a00` prints, for the local player, total score +0x580, kills +0x550, deaths +0x556, the hit percentage
`(int)(+0x588 x 100 + 0.5)` (+0x588 = +0x548 / +0x54c, set at `FUN_00223970` D:L76064-76069), headshots +0x544, primary
objectives +0x576, bonus objectives +0x578, team kills +0x55a, suicides +0x558. The room keeps per player, as match
totals (zeroed with the match, carried by a takeover under `TAKEOVER_ROW_READING`): `shotsFired`, `shotsHit`,
`headshots`, `teamKills` (beside the team kill's -2, `FUN_00545c10` D:L411850), `suicides` (beside the suicide's or the
fall's -2, `FUN_00545c90` D:L411872, D:L464957-464959), and sends them on `roundOver.stats` by seat id (additive, the
protocol version kept at 9). Primary and bonus objectives are 0: no mode the room runs scores them yet (192 s3.6;
XR-05 / PF-14 own it). The page joins the seat's counters to its scoreboard row (`yourStatsOf`); an older room's
`roundOver` without them gives the row's three and zeros.

## 3. The timings

- The round lists reveal (`SEQUENCE_DELAY 0.15`, `SEQUENCE_INTERVAL 0.1`): no row before 0.15 s after the screen
  opens, then one more a side every 0.1 s (`revealedRows`). GAME COMPLETE's lists carry no sequence and show at once.
- GAME COMPLETE's four COUNTERs, StartTime/EndTime 3.5/4.0 (SEAL ROUNDS WON / LOST) and 4.0/4.5 (TERRORIST ROUNDS WON
  / LOST), by `C2DCounter`'s law (`packages/ui/src/widgets/counter.ts`, `FUN_0037b5c0` D:L274186-274245), transcribed in
  single precision rounded toward zero (`counterShown`): blank before the start, `(int)(target x (t - start) / (end -
  start))` until the end, the target from it.
- `TimeoutMonitor` WAIT 90.0, then `GameStatePopCommand dlgNetError.rdr` on all three: the rule is `screenTimedOut`;
  the page's action is ONL-22's (PF.R23).
- CountDown, ExitOnStart: unchanged (the port's 10 / 20 every 0.5 s, the 5 / 10 s holds, already match; 179 s10 s11).

## 4. Not done here, and why

- **`MaintainDoneCounting` / `MpFinalOnOk`** (an OK press finishing the counters): the page has no OK press on these
  screens.
- *Done in PF-26's fix round:* **a launched round and a rocket** count one shot each (`launchRound` / `launchRocket`,
  their blasts none) and **a direct hit** on a living enemy counts the hit (`directHit`, once a flight); a ray `fire()`
  reports a miss beyond its reach counts no hit (the hit is counted after `bulletDamage` / `pelletDamage`).
- **Hidden rows** (`+0xfd2 != 0` out of the lists, the MVP and the totals): no flag on the wire; every row is shown
  (`GHOST_ROW_PLACEHOLDER`, research 179 s6.13, A1's).
- **The ReturnFlash dots** on the lobby line: the static 2128 string is drawn.
- *Done (PF.R22's follow-up):* **the bitmaps' wiring in `main.ts`** -- `armoryData()` -> `hud.addBitmaps(roundScreenBitmaps(...))`; test `roundScreens.test.ts` "PF.R22: the UIMP copies ..." (fixture).

## 5. Readings

| name | stands for | why a reading | status |
|---|---|---|---|
| `HIT_COUNT_READING` (`match/src/room.ts` `countShot`) | which event counts a shot (+0x54c, round +0x594) and a hit (+0x548, round +0x590) | 179 cites only the ratio's writer (D:L76064-76069), not the counters'. The controller's ruling PF.R20: a shot is one `fire` the room takes and resolves (a shotgun's shell once), a launched round once, a rocket once; a hit one whose ray met a living player's body the room did not refuse -- an enemy's, friendly fire being off (W3.R11), within reach -- once a shell, or a launched round's or rocket's direct hit on one, once a flight; a blast neither | open: the writers of round +0x590 / +0x594 (`FUN_005be9a0` / `FUN_005abbc0` neighbourhood), a static read |
| `HEADSHOT_COUNT_READING` (`match/src/room.ts` `kill`) | when +0x544 (round +0x58c) counts | a headshot is a head hit, part 0, death cause 3 (research 91 s1, L464739-464743), but the counter's writer was not traced; PF.R21: a kill whose fatal part is the head (a shotgun volley's last pellet names it, as the death clip does) | open: the writer of round +0x58c |
| `FINAL_TITLE_READING` (`viewer/src/roundScreens.ts`) | which of FINAL ROUND's two `TitleBar` objects is drawn | the dialog holds the CONTROLS caption (75,50) 1.75 and a `font_titlebar_01` GAME COMPLETE at (15,45) 0.95; no script names either and the loader keeps both (203 s12); PF.R24: the first only | open: a FINAL ROUND capture (the owner's session S2, research 206 s4.4) |
| `YOUR_STATS_ALIGN_READING` (`viewer/src/roundScreens.ts`) | where YOUR STATS' values stand | `YourTotals` has no COLUMNS; the values at the LISTBOX's pen, left-justified at x 250 (`packages/ui/src/widgets/listbox.ts`'s default) | open: a GAME COMPLETE capture |
| `ROUND_NAME_CUT_READING` (`viewer/src/roundScreens.ts`; NU-10, s7) | how a row too wide for its column is drawn | drawn whole at the list's SCALE over the next column, cut only at the frame: the list's scissor x 0..`DAT_004a44c4` (`FUN_00373850` D:L270012), the UI's after it `FUN_003b0fa0(0,0,0x280,0x1c0)` (D:L270042); no round list column carries MAXWIDTH, so the loader's 1000 (D:L276178-276183) -- `YourTotals`' default column 0 (D:L276086-276109) with its values drawn all the same -- but what reads a text column's +8 was not traced | open: a frame of a long name in a round list (reading, pending review) |
| `NAME_ORDER_READING` (`viewer/src/roundScreens.ts`) | the sort's and the MVP's name order | `strcmp` (`FUN_00198f18`) on byte names, matched by a code-unit comparison; the names are printable ASCII and an accented page (91 s13), whose code units are their Latin-1 bytes; `strcmp`'s signedness over 0x7f not read | open: equal scores and kills between names over 0x7f |
| `TITLE_PLACEHOLDER` | the screens' title | READERX `TitleBar` (179 s10 s1) | resolved, retired 2026-10-04 (PF-26): READERX |
| `COLUMN_ORDER_PLACEHOLDER` | the lists' three columns | the column table 0x3e51c0 (179 s10 s2, s13.7): `ROUND_LIST_COLUMNS` | resolved, retired 2026-10-04 (PF-26): READERX and the ELF |
| `PANEL_PLACEHOLDER` | the panel behind a screen | BACKGROUND `multplay_back.tif` and the `backsolid.tif` panels (179 s10 s3) | resolved, retired 2026-10-04 (PF-26): READERX |
| `TEAM_BAR_PLACEHOLDER` | the team bars | none in any dialog (179 s10 s4) | resolved, retired 2026-10-04 (PF-26): READERX |
| `STRIPE_PLACEHOLDER` | the odd rows' stripes | 16 static strips and the column strips (179 s10 s5) | resolved, retired 2026-10-04 (PF-26): READERX |
| `YOUR_STATS_PLACEHOLDER` | YOUR STATS | nine labelled rows, `FUN_00225a00` (179 s10 s6) | resolved, retired 2026-10-04 (PF-26): READERX |
| `BOTTOM_CAPTION_PLACEHOLDER` | the bottom captions | two-line literals and their COUNTERs (179 s10 s7) | resolved, retired 2026-10-04 (PF-26): READERX |

## 6. Owed

- A GAME COMPLETE frame of a match with known shots, hits, headshots, team kills and suicides: it settles
  `HIT_COUNT_READING`, `HEADSHOT_COUNT_READING` and `YOUR_STATS_ALIGN_READING` at once.
- A FINAL ROUND frame: `FINAL_TITLE_READING`.
- A round list with a name wider than its column: `ROUND_NAME_CUT_READING`.

## 7. The screens' width (NU-10, 2026-10-15)

*Added 2026-10-15 (NU-10, the next-update checklist; the owner's NU.R4: "The round-end screen does not resize it's width
to the screen's max width when cut off, it should"). Reading, pending review.*

- **The original.** The three dialogs are laid out on the 640x448 frame (`FUN_003b1200` D:L305276-305277 sets
  `DAT_004a44c4` x `DAT_004a44c8` to 0x280 x 0x1c0), which is the whole screen: `multplay_back.tif` is each dialog's
  BACKGROUND over that frame and the `backsolid.tif` panels span x 5..625 of it on all three (the disc's READERX
  members, read through `loadDialog`; `viewer/test/roundScreens.test.ts`, dev-disc, checks every panel's place, size and
  opacity against `READERX_LAYOUT`). Nothing is fitted or shrunk per screen: the frame is the screen, and the UI cuts
  what it draws at it (a list's scissor x 0..`DAT_004a44c4`, `FUN_00373850` D:L270012; the UI's
  `FUN_003b0fa0(0,0,0x280,0x1c0)` after it, D:L270042). A long name is drawn whole at the list's SCALE 0.9, over the
  SCORE column when it is wider than the gap; no round list column carries MAXWIDTH (`ROUND_NAME_CUT_READING`).
- **The page, before.** `roundScreenLayout` scaled the frame by the page frame's height / 448 and centred it across --
  the in-round HUD's rule (`hud.ts`, the native presentation). The match's canvas is the window (`matchMount.ts` `fit`),
  so a window narrower than 640:448 -- two windows side by side, 960 x 1040 -- put the dialog 1486 px wide in 960 px,
  cut 263 px off each side.
- **The fix (ROUND_SCREEN_FRAME_FIT, a browser adaptation).** The frame is fitted whole and centred -- scaled by the
  smaller of width / 640 and height / 448 -- as the front end's menus (`frontEnd.ts`, `object-fit: contain`) and the
  ARMORY (`armoryView.ts` `armoryFrame`, ARMORY_FRAME_FIT, research 95) are: `roundScreenFrame`, pinned equal to
  `armoryFrame` at eight window shapes. A narrow window now shows the whole dialog at its full width, letterboxed above
  and below by the black backdrop; a wide one is unchanged (scaled by height, centred). Every bitmap quad is cut at the
  dialog's frame, its texels kept at their scale, so a name too long for the frame stops at x 640 as the original's
  scissor stops it, not in the black bands. The game's values are unchanged; only where the page puts its frame.
- **What the owner's wish asks beyond the original.** None: the original's dialog always fills the screen's width, so
  fitting the whole frame to the window is what the original shows. A screen does not widen past the frame's 640:448 on a
  wide window (the original has no wider layout); that stays as it was.

## 8. Which block each list reads (2026-10-23, LATER 364)

Written after the owner's playtest of 2026-10-23 ("Scoreboard has running totals and not per round totals"). Status:
**reading, pending review** -- source inspection of the decompilation and of the ELF's own bytes (the member-pointer
table and two getters that the decompilation does not emit), no capture, nothing measured running.

- **Two blocks of one shape.** Each actor keeps a round block at `+0x58c` (kills `+0xc` = `+0x598`, deaths `+0x12` =
  `+0x59e`, score `+0x3c` = `+0x5c8`) and a match block at `+0x544` (`+0x550`, `+0x556`, `+0x580`). The kill credit
  writes the round block (`FUN_00545290(actor+0x58c, ..)` D:L411473-411512: `+0xc` += 1, `+0x3c` += 2). The held SELECT
  board draws the sum of both (`FUN_0022a290` D:L79060-79084; research 87 §12).
- **The exit state's three methods.** `CMPExitState` (the name 0x3e51f8; its method table at 0x405780 holds Enter
  `FUN_00223970`, Tick `FUN_00223680` and Exit `FUN_002232a0`):
  - *Enter* (D:L75961-76172): one loop over the player list (D:L76022-76171). Every pass that finds a player runs
    the round bonuses on that player's round block (D:L76144-76166): `FUN_00545b10(actor+0x58c, actor)` for a player of
    `mp_winner`'s side (`+0x3e` += 1 on every console, D:L411814; `+0x3c` += 5 only on the player's own console online,
    `FUN_002b3580`, D:L411815-411821) and `FUN_00545b90(actor+0x58c, actor)` for a living player (`+0x42` and `+0x3c`
    += 1, own console only, D:L411842-411843); each recomputes the team score (`FUN_00544d60`). The pass that finds the
    list's end (D:L76023) folds the local actor's round block (`FUN_002b3580`, D:L76015) into its match block
    (D:L76030-76063; the score `+0x580` += `+0x5c8` at D:L76060), takes its hit ratio (D:L76064-76070), fills the lists a
    first time (`FUN_00224670` D:L76072, the calls D:L76383-76386), mounts READERX (D:L76089) and returns. The MIPS has
    the same order: the loop's exit test at 0x223a54 branches to 0x223b30, past a body (0x223a60-0x223b24) that holds
    the three bonus calls (0x223a98, 0x223ac4, 0x223af4), and the fold begins at 0x223b30 (the score's `lh 0x5c8` /
    `sh 0x580` at 0x223d48-0x223d54). **So the bonuses are in the round block before it is folded, and the match total
    carries them.** The other actors' match blocks are written from their own consoles' records (`FUN_002be150`:
    deaths `+0x556` D:L162431, score `+0x580` D:L162439). *Corrected 2026-10-23 by PR #484's review: this section's
    first version read the bonuses as landing after the fold.*
  - *Tick*, in a net state other than 3 and 5 (D:L75940-75952): the team score again, then the lists a second time --
    `RoundStatLbContentsSeals` / `..Terrs` (0x3e5290 / 0x3e52b0) through the member pointers 0x3dc7b0 / 0x3dc7c0, whose
    function 0x225fe0 is `jr ra; addiu v0, a0, 0x58c` (the round block), and `GameStatLbContentsSeals` / `..Terrs`
    (0x3e52d0 / 0x3e52f0) through 0x3dc7d0 / 0x3dc7e0, whose function 0x225f20 is `addiu v0, a0, 0x544` (the match
    block); the three columns through the getters after them (0x225ff0 `lhu v0, 0x12(a0)` is the deaths' ...). Then the
    MVP (`FUN_002256f0`) and the dialog pushed (`FUN_003654c0`). This second fill, after the bonuses, is what the screen
    shows.
    *Corrected 2026-10-24 (PR #484's review F1):* GAME COMPLETE's dialog draws neither of these pairs' second:
    its totals are `GameSealsTotLbContents` / `GameTerrsTotLbContents` (strings 0x3e5380 / 0x3e53a0; research
    179 §10; reCOM's `dlgMultiplayerFinalReally.rdr`), filled by `FUN_00225bc0` via `FUN_002241c0`
    (D:L76208-76214), which sums the match block (`FUN_001828a0(actor + 0x544)`, D:L76987); the MVP is
    `FUN_002256f0`. Which dialog draws `GameStatLbContents*` (0x225f20), if any, is not read (only reCOM's s1
    copies were checked). The conclusion stands: GAME COMPLETE shows the match totals.
  - *Exit* (D:L75773-75878): every player's round block cleared (`FUN_00545200(actor+0x58c)` D:L75817), the team scores
    (`+0x7c`, `+0x80`; D:L75823-75834), UIMPX unloaded.
- **The sort** (`FUN_00224210(team, uivar, getter, which)` D:L76262-76345): `FUN_00225f30` for the round lists (`which` 0)
  and `FUN_00225e70` for the game lists (1), each on the block its getter returns -- `+0x3c`, then `+0xc`, then `strcmp`
  of the names (D:L77016-77068): the keys §0's sort row names, on the block each list reads.
- **So:** ROUND COMPLETE (`dlgMultiplayerRound.rdr`) and FINAL ROUND (`dlgMultiplayerFinal.rdr`, the same `RoundStat*`
  uivars) list that round's kills, deaths and score with its +5 and +1; GAME COMPLETE's SEAL / TERRORIST TOTALS, MVP and
  YOUR STATS read the match block (`FUN_00225a00` D:L76886-76933 as §2 has it).

**The port (LATER 364).** The room keeps the round block beside the match totals (`Player.roundKills`, `roundDeaths`,
`roundScore`; the winners' +5 on `roundScore` as on `score`; zeroed at each round's start as the Exit clears it) and
sends it on every score row (`ScoreRow.roundKills` .., additive, the version kept); the page lists it on ROUND COMPLETE
and FINAL ROUND and the match totals on GAME COMPLETE (`netPage.ts` `roundScreen`); against an older room's rows every
screen lists the totals, as before. Before this every screen listed the match totals. Tests: `roundStats.test.ts` (the
rows after two rounds of a classic match: the round block zeroed at the second round, both blocks with the bonuses),
`netPageRound.test.ts` (the three screens' rows, YOUR STATS on the totals, an older room's rows).

**Answered by the review (LATER 365, closed).** The first version of this section asked whether the round bonuses ever
reach the match block, having read them as added after the fold. They are added before it (the *Enter* bullet above), so
the match totals -- SELECT's sum in a later round, GAME COMPLETE's totals, YOUR STATS' score -- carry the +5 and +1, as
the port's `score` already does (research 91 §8). Nothing in the code changes for it.

**LATER 405 (2026-10-28).** The playtest of 2026-10-23 (intake item 5: the held board "has running totals and not per
round totals") asked whether SELECT should show the round alone. This section's sum is what the original draws, and
the port already shows it. No change. The decision is
[research 372](372-in-match-scoreboard-totals.md) (reading, pending review; a capture of round 2 would prove it).
