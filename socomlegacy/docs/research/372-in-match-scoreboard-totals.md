# 372 -- The held SELECT scoreboard shows the match's running totals (LATER 405)

- Date: 2026-10-28. Playtest intake 2026-10-23 item 5 (Discord, a player: "Scoreboard has running totals and not per
  round totals"); LATER 405; issue #503; Trello `ghRrWOLQ`. LATER 328 / issue #457 (research 360) checked three other
  scoring rules and did not check this one.
- Track: simulation. **No behaviour change.** The port already draws what the original draws.
- Status: **reading, pending review.** This note does not re-open the decompilation (that file is not on this host).
  It decides the report from the readings already transcribed in research 216 §8, research 87 §12 and research 91 §8
  and the round-reset row of §9. Nothing here is proven: no capture of SELECT held in a second round. A reviewer who
  did not write this note still has to re-read `FUN_0022a290` at the decompilation.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c`, as research 216 names it. The port at
  `44acba0a9`.

## 0. The decision

The in-match scoreboard (SELECT held, Tab on the keyboard) shows **KILLS, DEATH and SCORE as the running total of the
match**, this round included. It has no per-round column. The per-round figures are ROUND COMPLETE and FINAL ROUND.
The report expected the round's own numbers on the held board. That is the round-end lists, not this board. Ours
matches the original, so nothing in the game changes.

A board that showed only the round, which the original does not draw, would be a playtest preference. The parity rule
records one of those for the owner and does not apply it.

## 1. What the original draws

In a multiplayer round, SELECT held builds the scoreboard (`FUN_0022be20`, research 87 §12) and `FUN_0022a8b0` draws
it. A row's three numbers are the **sum of the match block and the round block** (`FUN_0022a290` D:L79060-79084;
research 87 §12; research 91 §8). The same sum sorts the rows (`FUN_00229d00`, research 91 §8).

| column | drawn value | fields |
|---|---|---|
| KILLS | match kills + this round's kills | `+0x550` + `+0x598` |
| DEATH | match deaths + this round's deaths | `+0x556` + `+0x59e` |
| SCORE | match score + this round's score | `+0x580` + `+0x5c8` |

The two blocks are one shape at two bases (research 216 §8):

- The **round block** is at `actor+0x58c`. A kill writes only this block (`FUN_00545290(actor+0x58c)`,
  D:L411473-411512: kills `+0xc` which is `+0x598`, score `+0x3c` which is `+0x5c8`, +2). A death writes `+0x12` (`+0x59e`).
- The **match block** is at `actor+0x544` (`+0x550`, `+0x556`, `+0x580`). It does not move on the kill. The round's
  exit folds the round block into it after the round's +5 and +1 have landed on the round block (`FUN_00223970`,
  D:L76030-76063; the score `+0x580` += `+0x5c8` at D:L76060), and the exit then clears the round block
  (`FUN_002232a0`, D:L75817).

During a round the sum is every completed round plus this round: the running match total. Round 1, with the match
block still zero, shows only this round, which is the same number either way. From round 2 the held board still shows
round 1.

The round-end screens are the other blocks (research 216 §8): ROUND COMPLETE and FINAL ROUND list the round block
(`RoundStatLbContents*`, the getter `0x225fe0` = `+0x58c`, that round's three with the +5 and +1). GAME COMPLETE lists
the match block after the fold.

## 2. What the port draws

The room keeps both blocks, and on a kill it steps them together (`room.ts` `kill`: `deaths` and `roundDeaths`;
`kills` and `roundKills`; `score` and `roundScore` by +2). The round-end +1 and +5 land on both (`endRound`). The next
round zeroes only the round block (`startRound`). So `kills`, `deaths` and `score` **are** the original's sum for the
whole time the held board is up: the match block in the original lags until the fold, and the port's running fields
do not, and the two drawings are the same numbers.

`scoreEvent` sends both. The in-match board is fed `kills`, `deaths` and `score` (`netPage.ts` the `score` case,
`hud.setScoreRows`; `scoreboard.ts` draws those three). It does not add `roundKills` on top. Adding them would count
this round twice. ROUND COMPLETE and FINAL ROUND substitute the round block; GAME COMPLETE keeps the running totals
(`netPage.ts` `roundScreen`).

Already pinned, and left as they are:

- `packages/viewer/test/scoreboard.test.ts` -- the layout writes the row's kills, deaths and score on the columns.
- `packages/viewer/test/netPageRound.test.ts` -- ROUND COMPLETE and FINAL ROUND list the round block; GAME COMPLETE
  and YOUR STATS keep the running totals.
- `packages/match/test/roundStats.test.ts` -- after two rounds the round block is the second round and the running
  totals carry both, bonuses included.

## 3. What would raise this to proven

A capture of SELECT held in round 2 of one match, the three columns still showing round 1's kills (LATER 405 named
H93's session A). Until that, the level stays a reading. Issue #503's own closing bar asked for that capture before
calling the reading proven; this note does not close the issue.
