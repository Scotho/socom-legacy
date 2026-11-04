# 267 -- The proven-level harness (PROVE-1): a Medius transcript and a PEEK scored against the results' readings

- Date: 2026-10-11 (web sprint 22, wave 4; the plan `../plans/2026-10-10-web-sprint-22-the-results-and-the-lobbys-text.md`,
  W22.R7 and H-next g; the brief `../plans/briefs/2026-10-10-s22-w4-prove-1.md`; the roadmap block
  `../roadmap/06-online-services.md` "PROVE-1"). Revised 2026-10-11 on the fresh review's F1: the inputs sheet is
  checked field by field before any calculation, each input cited (§1's last paragraph, §5). Revised again 2026-10-11 on
  the second fresh review: the match block held to the original's 16-bit widths, the score signed (§5's table); a
  transcript record not 256 bytes or not version `'E'` not decoded (§1); a post the sheet places and the transcript
  lacks a counted difference, the completeness row (§1); the report's root check by path components (§5).
- Status: **the harness is tooling, reviewed 2026-10-11 (dot, through the merge controller: FAIL twice, then PASS
  WITH FINDINGS on 73ee112b7; the sprint's Log); the values its run on the s4 slice holds equal are proven at that
  slice's inputs only (§2).** The review's one non-blocking finding, N1, is built at the close (§1, §7). The proven level is the AGENTS.md one: measured against the
  original running -- here a log of the original client's own messages, scored by this harness field by field within a
  stated tolerance. Every other value of the results stays at the level its own note gives it (research 261, 264):
  nothing in this note raises a reading the slice does not touch.
- Stands on research [155](155-the-stats-record-the-ladder-and-the-ranks.md) (§1.3 the posts and the slice, R155.4,
  R155.6; §1.4 our Horizon's answers, R155.12; §2.1 the rating's inputs), [261](261-the-stats-record-and-the-ladder.md)
  (§1 the fold, §4 the record's bytes and the slice's four records, §6 the names it masks, §8 the rating, §9 the ladder)
  and [264](264-the-results-path-and-the-ladders-guards.md) (§2 the results applied; §2.9 what ONL-32 through this
  harness would prove), and does not restate them.
- Code: `tools/prove-results.ts` -- `proveResults`, `checkInputSheet` and `InputSheetRefusal`, `recordUnreadable`,
  `formatReport`, `writeReport`, `outputRefusal` and `insideDir`, `readPeekDump`, the inputs sheet's types (`InputSheet`, `SheetRound`, `SheetSeat`,
  `SheetMatch`, `SheetMatchSeat`, `Cites`) and the report's
  (`ProveReport`, `RatingPost`, `RecordPost`, `FieldLine`); the reader `tools/mediusLog.ts` (SVC-12b's) with two
  readers added, `readConnections` (each line's `[id: 0x...]`) and `readLadderPositionAnswers` (0xf1's answer as our
  Horizon logs it, `desktop@be557831 server/horizon-server/RT.Models/Lobby/MediusLadderPosition_ExtraInfoResponse.cs:54-60`);
  `packages/match/src/stats/rating.ts`'s `ratingsAfterRound(round, mode)` and `RatingRounding` (the other rounding's
  value, §1(a)). Test: `tools/test/proveResults.test.ts` -- the harness on synthetic transcripts (decoded values written
  in the test, no capture) and, as a dev-host test, on the s4 slice (skipped and said without `SOCOM_PC_ROOT`).

## 1. What each comparison proves, and at what tolerance

The original's side is a Medius transcript of the original's clients: our Horizon's MLS log at the recording level
(`dbug: Server.Medius.MLS` lines), the form of the s4 slice and of ONL-32's whole-match log to come. Our side is the
lane's pure functions fed the transcript's inputs -- SVC-13a's `ratingsAfterRound`, SVC-12a's `applyMatch`, SVC-12b's
codec, SVC-13's `rankLadder` -- the functions SVC-07's queue applies (research 264 §2), so a value equal here is the
value the room's replay writes. Each comparison is one step, from the session's own previous record in the transcript
(a `PlayerReport` or an earlier post), never from the harness's own earlier result: an error is named at the step that
makes it and does not compound.

| | the original's side | our side | tolerance | what an equal line proves |
|---|---|---|---|---|
| (a) | each round's rating post: the record's +0x04 in `AccountUpdateStats` (Lobby 0x11) and ladder stat 0 at +0x1c of the `UpdateLadderStats` (Lobby 0xce) the same client sent after it (`FUN_002faa80` D:L198411-198443, R155.4) | `ratingsAfterRound` over the round's seats: each seat's published rating and side from its last record before the round (the team bits, `FUN_002ef7f0` D:L191440-191452), its match score, the sides' round wins, the winner and the rounds played from the inputs sheet | exact under `RATING_ROUNDING_READING` (`'chop'`); the other mode's (`'nearest'`) value shown on the line where it differs. The 0xce's stat 0 exact against the same rating | the calculator's arithmetic for that round's configuration (research 261 §8): which rules it exercises depends on the round (§2) |
| (b) | each `AccountUpdateStats` payload, decoded by the codec, field by field | the session's previous record moved as the post's moment moves it: a round's end the rating only (D:L75798-75805; the counters stay, R155.3); the match's end `applyMatch` over the sheet's match block, clock, game type and rounds (`FUN_00225070` D:L76609-76655, the rating unmoved); the session's own fields carried (the version, the team, the gender, the leader, the strings); the position the last 0xf1 answer to the same connection, else carried (D:L189006-189019, D:L198555) | exact, every field (integers and strings) | the field's value at that step, at that offset and width -- an offset only where the value is not zero (a zero proves no place) |
| (c) | each 0xf1 answer (`LadderPosition_ExtraInfo`): position and total | `rankLadder` over the records the transcript shows before the answer | exact; the board is the transcript's own sessions | **nothing of the original**: the answer is the transcript's server's word (R155.12: Sony's server is unobservable). It checks the transcript's server against SVC-13 -- equal only when that server is ours, or one taught SVC-13's rules. A tie between the asker and another session is skipped: `LADDER_TIE_ORDER_OWNER` orders by account id, which the log does not give. What the original's client does with an answer is (b)'s `ladderPosition` line |
| (d) | a PEEK of the stats block 0x66a750..+0x100 for one session (PLAT-36) | the record (b) expects after that session's last post, encoded by the codec | exact, byte for byte, over the bits of the fields (b) compared; masked: the unread bits (§4), the tail, the fields the build fills from the session (`FUN_002fab80` D:L198524-198555: +0x01 bit 7, the position, the minutes, the clan's name and tag, the leader bit, the hometown -- the wire's are the session's, the memory record's own are not read) and any field (b) could not derive | each counter's offset and width in the running original's memory, the 22/10 split of +0x20, the hit percentage's 7 bits |

Every line names the field (`kills (+0x1c)`, `team (+0x02 bits 5-6)`, `byte +0x14 (roundsWon)`), both values and the
tolerance. A field the transcript cannot give is **skipped**, the line saying why; an unread bit is **masked**, the line
naming its placeholder. Nothing is guessed: a round's inputs, a match's counters and a post's moment come from the
inputs sheet or not at all.

**The inputs sheet is checked field by field before any calculation** (`checkInputSheet`; the schema in §5). The
pure functions do not check their inputs: `ratingsAfterRound` reads a missing win count as 0 (`| 0`) and a missing
winner as a Terrorist win (`winner !== 'seal'`, the original's own reading of a round with no winner, D:L76699-76704),
so a sheet with the winner, the rounds played and both win counts cut from the s4 round gave the same 997 / 1003 and
was reported equal (the fresh review's F1). Those are the server's readings of the original and stay; the harness is
what must not feed them an absent input. So, per input -- every field the calculator reads (the round's rounds
played, both sides' wins and the winner; each seat's score, side, rating and three flags) and every field the fold
reads (the match's game type, clock, rounds played and both wins; each seat's side, spectator flag and the eleven
match-block counters `applyMatch` reads):

- **absent, or present without its cite** -- a gap: every line that needs it is **skipped**, the line naming the field
  (`the inputs sheet's round 1 is incomplete -- rounds[0].winner is missing; ...`). A round's gap skips the rating of
  every seat of that round (each seat's result reads all of them); a match's gap skips the fold's counters of every
  seat, a match seat's gap that seat's only. The post is still placed by the sheet, so the record's fields a round
  does not move are still compared (§1(b)). Never a default: a seat's `joinedInProgress`, `ghost` and `spectator` are
  required like the rest, not taken as false.
- **present but of the wrong type or out of its range** (the field's width in the original: §5's table), a cite that is
  not a non-empty string, or the sides' wins above the rounds played -- the sheet is **refused** before any line is
  computed (`InputSheetRefusal`, the field's path named; the CLI exits 2). A malformed sheet is an error in its
  transcription, not an input the transcript lacks: skipping it would hide the error, scoring it would coerce it.
- **the sheet's shape** -- `source`, the `rounds` and `seats` arrays, the `match` object, each seat's `sessionKey`
  (where the seat is found in the transcript, not an input of the calculator) -- refused when absent or malformed: a
  round without its seats cannot be placed.

A seat's side and rating not given by the sheet are the transcript's (§6's second row), cited by the record's line;
each rating post of the report carries `cites`, every input's source by name.

**A record of the transcript is decoded only whole** (`recordUnreadable`). The record is the message's 256 bytes
(`ACCOUNTSTATS_MAXLEN`, `Constants.cs:12`; research 155 §1.1, §1.3), and its first byte is `'E'`: the client's build
copies the session record's first byte (`FUN_002fab80` D:L198465), which the parser leaves `'E'` in every branch
(`FUN_002f9ac0` D:L198088-198222). The codec reads a shorter blob as zero-filled and any other first byte as the
default record -- its own rule, unchanged -- so a truncated or mis-versioned record handed to it would fabricate zeros
or a 1000 rating and compare them (the second review's F2). The harness does not hand it one: a post of another length
or version has every field **skipped**, each line naming the line, the length or the version byte (its rating line, its
ladder stat 0 where no round gives the rating, likewise); an earlier record of that kind is no base -- the post's
fields are skipped naming it, a round seat's side and rating from it are a gap, the fold has nothing to fold; a 0xf1
answer whose board would hold it is skipped. The fields (b) expects of such a post are still computed, so a PEEK is
scored against them (the post's bytes are not needed for that).

**The completeness row.** A post the sheet places and the transcript does not hold is a **difference** -- counted in
the summary's `differs`, so the CLI exits 1 -- never a silent omission (the second review's F3): a round seat the
calculator rates above 0 with no post (the rating's line, its expected value, `actual` null, naming the session); a
fold seat with no post (`the fold's post (AccountUpdateStats)`: the sheet's match block says the session folded, and
`FUN_00225070` posts what it folds, `FUN_002f96f0(.., 1)` at D:L76655); and a `postLine` that names no post of its
session, whatever the seat (the sheet's locator is wrong). Skipped only where no post is expected: a round seat the
calculator gives no result (D:L75801), a fold seat that spectates or is on no side (the sheet's side, else the
session's last record's team bits) -- the fold and its post sit inside the test of a seat on a side that does not
spectate (D:L76609-76611). That test is read on the **validated** flags only (the review's N1, built at the close
2026-10-11): a fold seat's `spectator` missing or uncited, its sheet `side` uncited, or no side from the sheet or the
transcript leaves the eligibility unknown -- the row is **skipped**, the gap named, never a difference nor "no post
expected" on an unvalidated flag -- unless the test's other half, validated, settles it (a cited `spectator: true`; a
cited null side, or the transcript's record on no side). A `postLine` naming no post of its session stays a difference
whatever the eligibility.

## 2. What the s4 slice proves today

The slice (`$SOCOM_PC_ROOT/logs/parity/s4_pcsx2/slice-Medius.log`, research 155 :13, :38, :149; on the host only) holds
**one round's end, a draw, two players 1000 -> 997 / 1003**: the `PlayerReport`s at lines 114 (session 25, SEAL) and
176 (session 26, Terrorist), each player's stats post -- `AccountUpdateStats` at 262 and 270, `UpdateLadderStats` at 264
and 272 -- and nothing more: no match's end, no fold, no ladder answer, no PEEK. The round's own inputs are not in it:
research 155 R155.6 reads them off the session's frame `A_rend050.png` (round 1 drawn on the clock, SEALS DRAW,
TERRORISTS DRAW, match score 1 each), and the test's inputs sheet carries those decoded values with that cite. The run
(`tools/test/proveResults.test.ts`): 54 lines equal, 0 differ, 3 skipped, 8 masked.

**Proven on the slice** (exact; at these inputs only):

| value | slice lines | what it holds, and no more |
|---|---|---|
| the round's rating: SEAL 1000 -> 997, Terrorist 1000 -> 1003, against `ratingsAfterRound` | 262 (+0x04), 270 (+0x04); 264 and 272 (0xce +0x1c) | for one against one at equal ratings in round 1 with no round won: a round with no winner scored as a Terrorist win (D:L76699-76704), K = 3 x 2 (D:L86266), E = 0.5 at equal means, the losers' part f x pot x 0 = 0 and the lone winner's share 1, `R + K x (share - E)`, the local `(int)(x + 0.5)` at an integral value. The two roundings give the same posts here: `RATING_ROUNDING_READING` is not settled by it |
| the post's two carriers agree: ladder stat 0 = the record's +0x04 | 262/264, 270/272 | `FUN_002faa80` D:L198436-198440 for a round's post |
| a round's end leaves the career counters: the 15 counters of the posts equal the reports' | 114 -> 262, 176 -> 270 | R155.3 (the counters move only at the match's end) **at the value zero only**: every counter is zero in all four records, so no counter's offset, width or arithmetic is touched |
| the session's fields carried: the version `'E'`, the team bits (0 SEAL, 1 Terrorist), the gender, the leader bit, the four strings (empty), the position 2 | 114 -> 262, 176 -> 270 | that a round's post does not move them; the non-zero ones (the version, the team, the position) at their offsets (research 261 §4) -- the zero and empty ones prove no place |

**Readings still, pending the owner's captures** (ONL-32's whole-match transcript, PLAT-36's PEEK; H-next g):

- the rating past this configuration: the factor table (rounds 3-11), the shares split by score, the expectation at
  unequal means (`RATING_EXPECTATION_SOFTFLOAT_READING`), the rounding (`RATING_ROUNDING_READING`), the floor, the
  join-in-progress half (`JOIN_IN_PROGRESS_MARK_READING`), a ghost left out, a spectator (`RATING_SPECTATOR_OUT_PLACEHOLDER`),
  the published rating between rounds (`RATING_PUBLISHED_REFRESH_READING`) -- research 261 §8.6;
- the fold, every counter: `applyMatch`, `STATS_FOLD_ROUNDING_READING`, `MATCH_CLOCK_TOTAL_READING`,
  `MATCH_BOMB_COUNTS_READING`, `HEAD_SHOT_COUNT_PLACEHOLDER`, `BONUS_OBJECTIVE_COUNT_PLACEHOLDER`, and the order of the
  fold's post and the last round's (research 155 §4.1);
- the record's layout where the slice is zero: the counters' offsets and widths, +0x20's 22/10 split, the strings, the
  leader bit (research 261 §4's last list).

**Not derivable from this transcript** (the slice cannot touch them; the harness skips or masks each, the line saying so):

| value | why |
|---|---|
| the minutes online (+0x0c: 16 and 12 on the posts) | the session's clock since its login (D:L198525-198532); the log holds no clock |
| the ladder's position and total (0xf1) | no 0xf1 answer is in the slice; and any answer a transcript holds is its server's (our Horizon at the pin answers "position 2 of 1" to everyone, research 155 §1.4), never the original's (R155.12) |
| +0x01 bit 7 (1 on all four records), +0x02 bits 0-4, +0x03 bits 2-7, the tail +0xe1..+0xff | unread (§4): masked |
| the round's inputs themselves (the scores, the wins, the winner, the rounds played) | not in any Medius message; from the frame, R155.6 |
| a PEEK | none exists for the s4 session |

## 3. What ONL-32's whole-match transcript and PLAT-36's PEEK would add (H-next g; H26, H27, H94)

- **ONL-32's whole match on the local stack** (H27; H94's capture session B, two consoles on our own local Horizon):
  each round's posts per console scored by (a) -- the arithmetic past round 1, the compounding over the match, and
  with an unequal pair and an unequal-score round in it the expectation and the rounding at once (research 261 §8.3's
  deciding round: the score-3 Terrorist's 1001 under chop, 1002 to nearest; the harness's line shows both); a join in
  progress and a spectator settle their two names. The match's end: the fold's post scored by (b) against `applyMatch`
  over the match block the sheet gives (from the GAME COMPLETE frame's YOUR STATS, research 155 §1.2, and the round
  screens), every counter non-zero at its offset, and the order of the fold's post and the last round's. Its 0xf1
  answers are Horizon's (c) -- informative only.
- **PLAT-36's PEEK** (H26): the stats block after that match, scored by (d) against the record (b) expects after the
  session's last post: every counter's offset and width in the running original's memory, independent of the wire.
- Until then the s4 slice is the proven set (H-next g's default); the readings stay readings.

## 4. The masked bits

| bits | name (research 261 §6) | in the slice |
|---|---|---|
| +0x01 bit 7 | `STATS_BYTE1_BIT7_PLACEHOLDER` (`DAT_0045a0c3`, copied in at each build, D:L198524) | 1 on all four records |
| +0x02 bits 0-4 | `STATS_BYTE2_LOW_BITS_PLACEHOLDER` | 0 |
| +0x03 bits 2-7 | `STATS_BYTE3_HIGH_BITS_PLACEHOLDER` | 0 |
| +0xe1..+0xff | `STATS_WIRE_TAIL_PLACEHOLDER` (the build stops at +0xe0, D:L198446-198559) | the caller's buffer, non-zero |

Each is reported with its value and never scored: a run that sets one shows it on the line beside the setting it
follows, which is how a capture would settle it.

## 5. The harness's use

```
npx tsx tools/prove-results.ts <transcript.log> [--inputs <sheet.json>] [--peek <dump> --peek-session <key>] [--out <report.json>]
```

- **The inputs sheet** (JSON, `InputSheet`), checked as §1's last paragraph says. `source` (where the sheet was read --
  a frame, a capture; required), `rounds` and `match`. Each block's `cite` names, for each of its inputs, the source
  that input was read from (a frame and the note that reads it, a capture, a transcript line); an input without one is
  a gap. The fields, each with the range the check holds it to:

  | block | field | type and range | cite | read by, and its place in the original |
  |---|---|---|---|---|
  | round | `roundsPlayed` | integer 1..2^31-1 | required | `ratingsAfterRound`'s factor: game +0x11c, this round included (D:L150648-150649; D:L76700) |
  | round | `sealRoundWins`, `terroristRoundWins` | integer 0..2^31-1, their sum at most `roundsPlayed` | required | the parts: game +0x120 / +0x124 (D:L76703-76704) |
  | round | `winner` | `"seal"`, `"terrorist"` or `null` (none) | required | the winner flag: game +0x128 (D:L76699-76704; research 91 §9) |
  | round | `seats` | array, the game's list order (D:L76713-76746) | -- | the shape: refused when absent |
  | seat | `sessionKey` | integer 0..2^53-1 | -- | a locator: the transcript's session |
  | seat | `score` | integer -32768..32767 | required | the match score, actor +0x580, a signed short floored at 0 (D:L76734-76737) |
  | seat | `side` | `"seal"`, `"terrorist"` or `null`; optional | required when given | else the session's last record's team bits (`FUN_002ef7f0` D:L191440-191452), cited by its line |
  | seat | `rating` | integer -2^31..2^31-1 (the record's +0x04, int32); optional | required when given | else that record's +0x04, cited by its line (`FUN_002c3500` D:L164888-164910) |
  | seat | `joinedInProgress`, `ghost`, `spectator` | `true` / `false`; required, never defaulted | required | the half (`FUN_002c2dc0` D:L164486-164513), the ghost (D:L76148, D:L76717), the spectator (D:L76690-76691) |
  | seat | `postLine` | integer 1..; optional | -- | a locator: the seat's post, by default the session's next unclaimed post |
  | match | `gameType` | integer 0..255 | required | game +0x111 (`GAME_TYPE`) |
  | match | `clockMs` | integer 0..2^32-1 | required | game +0xf0 |
  | match | `roundsPlayed`, `sealRoundWins`, `terroristRoundWins` | integer 0..2^31-1, the wins' sum at most the rounds | required | `roundsOf` (`FUN_00223970` D:L76009-76013) |
  | match | `seats`; `beforeRound` | array; integer 1.., optional | -- | the shape; a locator: the round whose posts follow the fold's, by default the last |
  | match seat | `sessionKey`, `postLine` | as a round's seat | -- | locators |
  | match seat | `spectator` | `true` / `false`; required | required | `applyMatch`'s first test (`FUN_00225070` D:L76609-76611) |
  | match seat | `side` | as a round's seat | required when given | as a round's seat |
  | match seat | `block` | object: `kills`, `deaths`, `suicides`, `bombsPlanted`, `bombsDefused`, `escorteesBroughtOut`, `escorteesKilled`, `headShots`, `bonusObjectives`, `hits`, `shots` required; `teamKills`, `primaryObjectives`, `score` checked when given. Each counter an integer 0..65535 (unsigned 16-bit), the `score` -32768..32767 (signed 16-bit) | required, one cite for the block (one read: the GAME COMPLETE frame's YOUR STATS, research 155 §1.2) | `applyMatch` (`FUN_00225070` D:L76609-76655). The widths: each block field a half-word of the actor (+0x544..), summed as a short at each round's end (`FUN_00223970` D:L76030-76060); kills read `ushort` into the record's int32 (D:L76614), the hits and shots `ushort` (the ratio, D:L76064-76068), deaths, suicides, the bombs, the escortees and the head shots added into the record's unsigned shorts (D:L76615-76634; `lhu`, research 261 §1), the bonus objectives a short shifted into +0x20 (D:L76635), team kills and primaries shorts of the same sum (D:L76041, D:L76055); the score at actor +0x580 read as a signed short and floored at 0 (D:L76734-76737) |

  A seat's post is its session's next unclaimed post unless `postLine` names it; a seat the calculator gives no result
  (a ghost, an empty side) expects no post (D:L75801); a fold seat expects one by its validated `spectator` and side
  only, an unknown skipped with its gap (§1's completeness row). The s4 sheet is the test's `S4_SHEET`: its round's four fields
  cited to `A_rend050.png` (research 155 R155.6), each score to the same frame's SCORE 1, the three flags to research
  155 §2.1's account of the session (both records new at lines 114 and 176, round 1 the session's first, both players
  on a side of the frame) -- a reading of the session, not a separate field read; the sides and ratings to lines 114
  and 176.
- **The PEEK dump**: 256 raw bytes (the first 256 of a longer file) or the same as hex text.
- **The report**: the lines not equal in full on stdout, the equal ones counted per block, and the JSON
  (`ProveReport`: `schema`, `tool`, `transcript` -- the file's name, no directory --, `inputs`, `rounding`, `rating`,
  `records`, `ladder`, `peek`, `summary`) at `<transcript>.prove.json` or `--out`. The writer refuses a path in the
  desktop's tree (`SOCOM_PC_ROOT`, read-only ground truth) and a path in this repository that git does not ignore
  (`socomlegacy/logs/` is ignored); "in a tree" is read by path components (`insideDir`: the relative path's first
  component `..` exactly, or an absolute relative path on another drive, is outside -- a child named `..reports` is
  inside); the JSON holds decoded values only, never the log's bytes (RS.R8). The exit code is 1
  when a line differs, 2 on a refused path, a refused inputs sheet or a wrong command line.
- A run's report moves a reading to proven only for the lines it holds equal, at the inputs it was run on, and is
  filed in the reading's own note as such (the roadmap block's **Then**).

## 6. Placeholders and readings

No new `*_PLACEHOLDER` or `*_READING`: the names the harness masks or weighs are research 261 §6's and 264 §6's rows,
unchanged. The harness's own choices, none a value of the original:

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `RatingRounding` (server `stats/rating.ts`; `ratingsAfterRound`'s `mode`) | `'chop'` by default; `'nearest'` only for the report's other-mode value | the second hypothesis `RATING_ROUNDING_READING` names (research 261 §6, §8.3), computed so a post can be weighed against both; the server's callers take the reading | nothing: the reading's own row says what settles it | the harness's |
| the published rating and the side (`tools/prove-results.ts`) | the session's last record before the round's first post: +0x04 and the team bits | the calculator's inputs the transcript carries (`FUN_002c3500` D:L164888-164910; `FUN_002ef7f0` D:L191440-191452); a sheet's `rating` / `side` overrides | `RATING_PUBLISHED_REFRESH_READING`'s own settling (research 261 §6) | the harness's |
| the board of (c) (`tools/prove-results.ts`) | the transcript's own sessions, each at its last record before the answer | the server's board, which a transcript does not show | nothing of the original (R155.12) | the harness's |

## 7. What is left

- **The run on the owner's captures** (H-next g; H26, H27, H94): the windows are the owner's; the harness needs no
  change to read a longer log of the same form. A transcript in another form (ONL-32 at another recording level, a
  0xce our Horizon decodes) needs its reader in `tools/mediusLog.ts`, with a test.
- **The room's replay**: the harness feeds the pure functions the transcript's inputs; that `stats/results.ts`'s queue
  applies the same functions to the room's `RoomRoundResult` / `RoomMatchResult` is research 264 §2's, unit-tested
  there. Replaying a transcript through a live room (the room's own counters against the sheet's) is not built.
- **The match's counters** come from the sheet, read off the GAME COMPLETE frame; no Medius message carries the match
  block.
- ~~**Review**: the re-read of this note's cites and the harness's comparisons by a reviewer who did not write them.~~
  *(2026-10-11: done -- dot's review through the merge controller, PASS WITH FINDINGS on 73ee112b7 (the sprint's Log).)*
- *(2026-10-11, the sprint 22 close:)* **N1 built at the close** -- the missing fold post decided on the validated
  eligibility (`missingFoldPost` in `tools/prove-results.ts`; §1's completeness row, §5), the incomplete-eligibility
  cases in `tools/test/proveResults.test.ts` ("N1: ..."), synthetic, run without the disc.
