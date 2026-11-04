# 155 -- The stats record, the ladder and the ranks: what a match adds, where a rank shows, the plan for our server (OT-12)

Written 2026-10-04 for OT-12, the planning task of the online-path plan's OT.R18
(`../plans/2026-10-02-online-path-target.md`; the owner, 2026-10-04: "Full online features need to be planned, so we
need to start considering how a match adds back to the global leaderboard + add player ranks that show across their
online profile and in the games leaderboard section recreating the original functionality but modernized for our
server"). **Planning and derivation only: no product code and no test of behaviour is written here, and nothing of it
is built until the owner has read it** (HUMAN_TASKS H86). Sources: the retail decompilation
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` its line, `FUN_<addr>` its functions; cited,
never pasted); the retail ELF's strings by address (`S:0x...`) and, in one place named below, its instructions
(`game/disc/socom2_game.elf`, disassembled by address); the disc's dialogs through `tools/dump-dialogs.ts --dialog
<name> --tree` and its captions through `@s2u/scene`'s `parseLocTable` over `RUN/LOCALE/STATES/UIMNLOC.ZAR` and
`UIMPXLOC.ZAR` (decoded data, RS.R8); the archived PCSX2 session `$SOCOM_PC_ROOT/logs/parity/s4_pcsx2/` -- its Medius
log slice `slice-Medius.log` and its frames -- and the recomp's
`logs/parity/s13_v7_paused_peer_20260925_193109/A_hold32.png`; our Horizon's sources read as files (`MLS.cs:n` and
`Constants.cs` as the services segment cites them, `Server.Database/DbController.cs`; a file newer than the
`ref/desktop` pin is named as the live checkout's, HEAD `4db792fc`); the match server's sources
(`packages/match/src/room.ts`, `serviceStore.ts`, `accounts.ts`). No server was contacted. It stands on research 91
(the round: §8 the scoring, §9, §18 the exit state and its screens), 97 (the Medius map: §2.2, §3), 128 (the online
dialogs) and 131-133 (the store, the accounts, the texts), and does not restate them.

Confidence: **reading, pending review** for every transcription below -- none is unit-tested yet (the tests are the
build's, §5); none had been re-read by a reviewer when it was written. Three values are also seen in a trace of the original running
(§2.1: the ratings 1000, 997 and 1003 of the s4 slice, beside the frame of the round they belong to): evidence toward
the proven level, not the proven level -- no test holds it. What the original's **server** did is unobservable
(segment 06's preamble) and is never stated here as a fact. A reviewer re-read the cited lines on 2026-10-04 (pass
with findings, none blocking; corrected in place); what it could not verify is listed in §9.
§1.1's record -- every offset, width, bit field and PLAYER INFO format -- is a **reading (reviewed 2026-10-10)**: the
codec `packages/central/src/statsRecord.ts` holds it in a transcription unit test, and MU-12's re-review re-read it at
the source and the instructions (pass with findings).

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R155.1 | **The stats record is versioned.** Its first byte is `'E'` (0x45) in this client; `FUN_002f9ac0` (D:L197994-198225) copies an `'E'` record whole (0xe4 bytes), upgrades the older forms `'D'`, `'C'`, `'B'`, `'A'` and a text form `'N'`/`'Q'` step by step, and turns **anything else** -- a new account's 256 zero bytes -- into the default record: `'E'`, **rating 1000**, the gender bit, the rest zero (D:L198207-198222). The session's own start value 99 (V9, D:L182642) lasts only until the login's own-stats read | the server's record for a new account; V9 brought to it | §1.1 |
| R155.2 | **Every field of the record, with its label** (the table of §1.1). Each counter's label is held twice over: PLAYER INFO prints the record's fields under their captions (`FUN_002f0020` D:L191932-192135), and the final screen's YOUR STATS prints the match block in the order of its own captions (`FUN_00225a00` D:L76886-76930 against `dlgMultiplayerFinalReally`'s 2116-2121); the two agree on HEAD SHOTS and BONUS OBJECTIVES | SVC-12b's "which actor counter is which label", at the reading level | §1.1, §1.2 |
| R155.3 | **Two moments, not one.** The **rating** moves at **every round's end**, when the exit state is left (`FUN_002232a0` D:L75798-75805); the **career counters** are folded **once, at the match's end** (net state 6: `FUN_00223970` D:L76078-76082 -> `FUN_00225070` D:L76580-76658). Both run only with respawn off (game +0xdc) and outside a **LAN** game: the test is the valve `ComeFromLan` (`FUN_003045b0` D:L204493-204508, S:0x3f6328) -- not "a ladder game", as V12 and research 91 §9 read it | the flow of §4; V12 corrected | §1.3 |
| R155.4 | **The messages.** A stats post is the pair `AccountUpdateStats` (Lobby 0x11, the 256-byte record) then `UpdateLadderStats` (Lobby 0xce, type 0, stat 0 = the rating), from one function (`FUN_002faa80` D:L198411-198443) reached from five places: a round's end, a match's end, the login's own-stats read of a record that is not `'E'`, every 300 s while in the lobby, and two clan callbacks. `PlayerReport` (Lobby 0x01) carries the same record while in a game, when it changed or every 300 s. **Nothing is sent on leaving a game or on a disconnect** | SVC-02's rows for these, with their moments | §1.3 |
| R155.5 | **The rating is the client's arithmetic: an Elo form over the two teams.** `FUN_002253c0` (D:L76661-76768) builds a calculator from every seated, non-ghost player's published rating and match score and from the rounds; `FUN_00239d40` (D:L86199-86280) gives each player `new = max(200, R + K x (share - E))` with `K = 3 x players`, `E = 1 / (1 + 10^((opponents' mean - own team's mean) / 400))`, and `share` the player's part of his side's part of `players / 2` points, split by match score. SVC-13's unknown "how the rating changes after a match" is answered: it is the client's, and it is per round | SVC-13a's unit tests | §2.1 |
| R155.6 | **The trace agrees, value for value.** In the s4 session two players at the default 1000 end round 1 on the clock, a draw (`A_rend050.png`: SEALS DRAW, TERRORISTS DRAW, score 1 each); the slice then shows the SEAL's client post **997** and the Terrorist's **1003** (`slice-Medius.log` lines 262-274, the world still `WorldActive`, the career counters zero). The formula gives exactly that: K = 6, E = 0.5, and **a round with no winner is scored as a Terrorist win** (the winner flag is "the last round's winner is 0", D:L76699-76704) | a golden for SVC-13a; a quirk kept (the parity rule) | §2.1 |
| R155.7 | **The edges of the rating.** A player who joined a game in progress has his change **halved** (`FUN_002c2dc0` D:L164486-164513; the mark set at D:L163205-163210); a ghost of the round is left out (actor +0xfd2, D:L76148, D:L76717); a spectator, and a round with a side empty, change nothing; a result of 0 or less is not applied (D:L75801); the floor is 200 | SVC-13a | §2.1 |
| R155.8 | **Position and total are the server's word; rank, medal and gate are the client's computation.** The client asks its position with `LadderPosition_ExtraInfo` (Lobby 0xf1: account, stat index 0, sort order 1) and reads `position` and `total` (`FUN_002eb010` D:L188994-189051); from them it computes the medal of merit 0-5 (`FUN_002eaee0`, V8) and the restriction tier 0-4 (`FUN_002eae20`, V8) into the valves `LadderMedalOfMerit` and `LadderRankRestriction` | what SVC-13 must answer, and nothing more | §2.2, §2.3 |
| R155.9 | **Five ranks; the medals are their icons.** PLAYER RANKING's own legend ("RANK INSIGNIA", `dlgLadderLobby.rdr`) reads ADMIRAL -- TOP 10 PLAYERS, CAPTAIN -- TOP 5%, LT. COMMANDER -- NEXT 5-30%, LIEUTENANT -- NEXT 30-85%, ENSIGN -- LOWEST 15%, beside `Medal_Black`, `Medal_Gold`, `Medal_Silver`, `Medal_Bronze`, `Medal_Blue`; every medal column's TEXTURES list is `null, Medal_Blue, Medal_Bronze, Medal_Silver, Medal_Gold, Medal_Black` -- its index the medal value 0-5; and V8's thresholds are those percentages exactly. In the frames the five are a gold bar, two silver bars, a gold leaf, an eagle and a star | SVC-13's "which image each medal tier draws" answered; its cite of UIMnLOC 869-873 corrected (those are the campaign's) | §2.3 |
| R155.10 | **The ranking page.** `GetLadderInfo` sends `LadderList_ExtraInfo0` (Lobby 0xef; stat index 0, sort order 1) twice: "TheBest", 10 rows from 1 (THE PODIUM), and "TheRest", 14 rows from `max(1, my position - 2)`, paged by 14 with L1/L2. A row is position, ladder stat (the rating -- *corrected 2026-10-12, ONL-30a: the console reads that word as the row's account key, research 269 §2.4 item 2*), name, the 256-byte record (its clan tag is drawn) and an online state; the page's rows are rating, name, position, medal (computed from the row's position), tag, sorted by position | ONL-30's "the sort key" answered: the server's order by rating, descending | §2.2 |
| R155.11 | **Where a rank shows**: beside the persona's own name at the foot of sixteen online dialogs (`ActivateMedalOfMerit` at ONSTART on fifteen; `DisplayMedalOfMerit` on the ladder's refresh on SOCOM II ONLINE), in PLAYER RANKING's list and legend, on PLAYER INFO, in the clan roster, beside each player in the game lobby's two team lists (each player publishes his medal and rating in his player state, `FUN_002c5360` D:L166181-166213), and as the four rank icons of a room, of a game's details and of CREATE GAME's RANK RESTRICTIONS. **Not** on the briefing room's PLAYER LIST, the in-round scoreboard or the round and final screens. The "star" of the archived lobby frames is the Admiral's medal: a ladder of fewer than 12 gives it to everyone | the screens' tasks | §3 |
| R155.12 | **Our Horizon is no evidence of the ladder**: it stores the record (`MLS.cs:500-537`), acknowledges and drops the ladder post and answers the ranking page empty (the live checkout's `Medius150Replies.cs`; at the pin both were unhandled, research 97 R97.3), and its simulated position is a constant (`DbController.cs:1071-1079`: index 1 of 1). What Sony's server did with a post -- whether it checked one -- is unobservable | nothing of our service is copied from it | §1.4 |
| R155.13 | **The plan for our server**: the match server reports each round's and each match's result itself, from the room's own events; the services compute the rating and the counters with the original's arithmetic and write record and ladder entry in one atomic change that carries each account's high-water mark (match, round) and last audit entry, so a result is applied once and in order, queued off the rooms' ticks; the ranking is an in-memory order over the store. The record, the arithmetic, the ranks, the icons and the pages stay the original's; who computes, and when it is written, change | SVC-07, SVC-12c, SVC-13 brought to it; six new blocks | §4 |
| R155.14 | **The build order**: three sprints after the match's start -- (A) a match adds to the record, (B) the ladder and the ranks show, (C) gates, limits and the proven level -- 19, 14 and 10 points, six new blocks (SVC-12d, SVC-13a, SVC-15a, SVC-23a, ONL-30a, ONL-34) | for the controller to carry into SPRINTS.md | §5 |
| R155.15 | **Twelve owner's calls**, each with its options, a recommendation and the default the build takes meanwhile | HUMAN_TASKS H86 | §6 |

## 1. What the original records

### 1.1 The record (R155.1, R155.2)

The record lives at 0x66a750 for the session. `FUN_002f98f0` (D:L197917-197992) copies it out, `FUN_002f96f0`
(D:L197836-197914) copies one in and, when asked, posts it; `FUN_002fab80` (D:L198446-198559) builds the 256-byte form
that is sent, filling the fields the session owns (below: "at each build"). The record proper is 0xe4 bytes; the
message's field is 256 (`ACCOUNTSTATS_MAXLEN`, `Constants.cs:12`). "Per match" says what the match's end adds
(`FUN_00225070`), from the local player's match block (actor +0x544, §1.2).

| offset | size | field (its caption on PLAYER INFO) | when it changes | cite |
|---|---|---|---|---|
| +0x00 | 1 | the version, `'E'` | never | `FUN_002f9ac0` D:L198086-198092 |
| +0x01 bits 0-6 | 7 bits | hit percentage, a running mean over the games (HIT PERCENTAGE: `%d %%`) | per match: `round((old x games + round(ratio x 100)) / (games + 1))`, `games` the count before this match, `ratio` the match block's hits over shots (+0x588) | D:L76637-76641; D:L192116-192117 |
| +0x01 bit 7 | 1 bit | the byte `DAT_0045a0c3` (not read; set on both players of the s4 slice) | at each build | D:L198524 |
| +0x02 bits 5-6 | 2 bits | the team in the current game: 0 SEAL, 1 Terrorist, 2 neither | before each `PlayerReport`; cleared at the session's start | `FUN_002ef7f0` D:L191440-191452; D:L182643 |
| +0x02 bit 7 | 1 bit | "I lead my clan" (the account is its clan's leader) -- the name's "(Leader)" | at each build | D:L198542-198547; D:L191962-191968 |
| +0x03 bits 0-1 | 2 bits | gender: bit 0 is the valve `PLAYERGENDER` | the default record | D:L198213-198214 |
| +0x04 | int32 | **the rating** (SCORE:) -- 1000 in a new record | **every round's end** (§2.1) | D:L75801-75804; D:L191978-191979; D:L198210 |
| +0x08 | int32 | the ladder position as this client last heard it (LADDER POSITION:) | at each build, from the last position answer | D:L198555; D:L189010, D:L189136; D:L191973-191974 |
| +0x0c | int32 | minutes since the login (ONLINE: `%d min.`) | at each build | D:L198525-198532; D:L192022-192023 |
| +0x10 | int32 | seconds played (TOTAL PLAYING TIME: `h : mm`) | per match: += the game's clock total (game +0xf0, ms) / 1000 | D:L76642-76649; D:L192130-192131 |
| +0x14 | int32 | rounds won (ROUNDS WON:) | per match: += my side's round wins | D:L76650; D:L76073-76077; D:L191988-191989 |
| +0x18 | int32 | rounds lost (ROUNDS LOST:) | per match: += rounds played - my side's wins - drawn rounds | D:L76651; D:L76013, D:L76077; D:L191993-191994 |
| +0x1c | int32 | kills (KILLS:) | per match: += block +0x0c | D:L76614; D:L192071-192072 |
| +0x20 bits 0-21 | 22 bits | games (TOTAL # OF GAMES:) | per match: + 1 | D:L76652-76654; D:L191983-191984 |
| +0x20 bits 22-31 | 10 bits | bonus objectives (BONUS OBJECTIVES:) | per match: **replaced** by block +0x34 (not added: ELF 0x2251d4-0x2251e8 inserts the match's count over the old one) | D:L76635-76636; D:L192111-192112 |
| +0x24 | uint16 (shown unsigned, `lhu`; corrected 2026-10-09 from int16, research 261 §1) | hostages rescued (HOSTAGES RESCUED:) | per match, any type but ESCORT: += block +0x1c | D:L76631-76633; D:L192096-192097 |
| +0x26 | uint16 (shown unsigned, `lhu`; corrected 2026-10-09 from int16, research 261 §1) | VIPs rescued (VIPs RESCUED:) | per match, ESCORT as a SEAL: += block +0x1c | D:L76619-76629; D:L192101-192102 |
| +0x28 | uint16 (shown unsigned, `lhu`; corrected 2026-10-09 from int16, research 261 §1) | VIPs killed (VIPs KILLED:) | per match, ESCORT as a Terrorist: += block +0x18 | D:L76622-76625; D:L192106-192107 |
| +0x2a | uint16 (shown unsigned, `lhu`; corrected 2026-10-09 from int16, research 261 §1) | deaths (DEATHS:) | per match: += block +0x12 | D:L76615; D:L192076-192077 |
| +0x2c | uint16 (shown unsigned, `lhu`; corrected 2026-10-09 from int16, research 261 §1) | suicides (SUICIDES:) | per match: += block +0x14 | D:L76616; D:L192081-192082 |
| +0x2e | uint16 (shown unsigned, `lhu`; corrected 2026-10-09 from int16, research 261 §1) | bombs planted (BOMBS PLANTED:) | per match: += block +0x38 | D:L76617; D:L192086-192087 |
| +0x30 | uint16 (shown unsigned, `lhu`; corrected 2026-10-09 from int16, research 261 §1) | bombs defused (BOMBS DEFUSED:) | per match: += block +0x36 | D:L76618; D:L192091-192092 |
| +0x32 | uint16 (shown unsigned, `lhu`; corrected 2026-10-09 from int16, research 261 §1) | head shots (HEAD SHOTS:) | per match: += block +0x00 | D:L76634; D:L192121-192122 |
| +0x34 | 12 | the clan tag (`Clan_Description`; drawn `[tag]`) | at each build, from the UI variable | D:L198534-198541 |
| +0x40 | 32 | the clan's name | at each build | D:L198533 |
| +0x60 | 63 | the hometown (`PLAYERHOMETOWN`; HOMETOWN:) | at each build, from the UI variable | D:L198548-198554 |
| +0x9f | 66 | the description (`PlayerDescription`; DESCRIPTION:) | the session's ("Description Not Set" at its start) | D:L182644; D:L198401-198402 |

- **The versions** (R155.1). `'D'`, `'C'`, `'B'` and `'A'` are binary forms of 0xd0 bytes and more, each rewritten as
  the next and parsed again (D:L198093-198194); `'N'` or `'Q'` is a text form whose rating is ten decimal digits at +1
  (D:L198195-198206). This client writes `'E'` only. A record of any other first byte -- the 256 zero bytes a new
  account holds (research 131 §2; our Horizon's create, `MAS.cs:405`) -- parses to the default: `'E'`, rating 1000,
  the gender bit. The login's own-stats read then **posts** that default (`FUN_002fa8f0` D:L198403-198405: "the stored
  record's first byte is not `'E'`"), which is how an account entered the ladder: at 1000, at its first login.
- **The types** are the round's (research 91 §11): +0x111 is 1 BREACH, 2 DEMOLITION, 3 ESCORT, 4 EXTRACTION, 5
  SUPPRESSION (S:0x3e5828-0x3e5850).
- **Not read**: +0x02 bits 0-4 and +0x03 bits 2-7 (carried untouched); what `DAT_0045a0c3` is (SVC-12b's unknown,
  kept).
- **What a server could compute and the original left to the client: all of it.** Of the record's fields the server's
  only word is the position the client copies into +0x08 (§2.2).

### 1.2 The match block and the round block

Each player's actor holds two blocks of counters of one layout: the round's at +0x58c and the match's at +0x544. At
every round's end the exit state adds the local player's round block into its match block (D:L76030-76063) and resets
the round block when the state is left (D:L75817). Research 91 §8 names the writers; the counters the record
takes, by block offset:

| block | counter | writer | points (research 91 §8) |
|---|---|---|---|
| +0x00 | head shots | `FUN_005459c0` D:L411756-411773, from the hit paths at D:L459580 and D:L459676 (which hits count is not read) | -- |
| +0x04, +0x08, +0x44 | hits, shots, the ratio hits / shots | `FUN_005458a0` D:L411722-411753 | -- |
| +0x06 | hits on a teammate | the same | -- |
| +0x0c | kills | `FUN_00545290` D:L411473-411513 | +2 |
| +0x12 | deaths | `FUN_00545d10` D:L411894 | 0 |
| +0x14 | suicides | `FUN_00545c90` D:L411872-411891 | -2 |
| +0x16 | team kills (YOUR STATS' FRIENDLY KILLS; not in the record) | `FUN_00545c10` D:L411850-411869 | -2 |
| +0x18 | escortees killed | `FUN_00545390` D:L411516-411549 | -2; +3 to a Terrorist in ESCORT |
| +0x1c | escortees brought out (a SEAL's) | `FUN_00545480` D:L411552-411573 | +3 |
| +0x32 | primary objectives (YOUR STATS; not in the record) | `FUN_00545650`, `FUN_00545750`, `FUN_00545800` D:L411620-411719 | -- |
| +0x34 | bonus objectives | not read | -- |
| +0x36 | bombs defused | `FUN_00545650` D:L411620-411652 | +2 |
| +0x38 | bombs planted | `FUN_005455d0` D:L411598-411617 | +2 |
| +0x3c | the score | every writer above; `FUN_00545b10` (+5 a round won), `FUN_00545b90` (+1 alive) | -- |
| +0x3e, +0x42 | rounds won, rounds alive at the end | `FUN_00545b10`, `FUN_00545b90` | +5, +1 |

The final screen's YOUR STATS (`PlayerLbContents`, `FUN_00225a00`) prints nine numbers of the match block in this
order: +0x3c, +0x0c, +0x12, the ratio x 100, +0x00, +0x32, +0x34, +0x16, +0x14 -- under the captions SCORE, KILLS,
DEATHS (2106-2108), HIT %, HEAD SHOTS, PRIMARY OBJECTIVES, BONUS OBJECTIVES, FRIENDLY KILLS, SUICIDES (2116-2121). The
recomp's `A_hold32.png` shows the page after six rounds won without a kill: SCORE 36 (6 x (5 + 1)), PRIMARY
OBJECTIVES 6, the rest 0.

### 1.3 What the client sends, and when (R155.3, R155.4)

| message (research 97 §2.2) | carries | sent when | cite |
|---|---|---|---|
| `AccountUpdateStats`, Lobby 0x11, 0x126 bytes, then `UpdateLadderStats`, Lobby 0xce, 0x58 bytes: type 0 at +0x18, the rating at +0x1c | the record as built; the rating as ladder stat 0 | (1) **a round's end**, when the exit state is left and the rating it computed is above 0; (2) **the match's end**, after the career fold; (3) the login's own-stats read, when the stored record is not `'E'`; (4) every 300 s in lobby state 0xb (the first 120 s after entering it); (5) the clan list's and the clan quit's callbacks | `FUN_002faa80` D:L198411-198443; (1) D:L75798-75805; (2) D:L76655; (3) D:L198403-198405; (4) `FUN_002ee540` D:L190777-190797; (5) D:L187799, D:L187892 |
| `PlayerInfo`, Lobby 0x31, with my own account id | reads the stored record back | on entering lobby state 0xb | `FUN_002fa870` D:L198346-198364; D:L190793-190796 |
| `PlayerReport`, Lobby 0x01, 0x118 bytes: session key, world id, the record | the record, with the team bits | in a game, when the record differs from the last one sent (position and minutes aside) or 300 s have passed | `FUN_002ef7f0` D:L191414-191492 |
| `UpdateLadderStats`, type 1 | the clan's value: the mean of the first eight roster entries' +0x1cc after a sort, 0 under eight members | the clan pages (research 97 R97.6) | `FUN_002e7f50` D:L187285-187326 |

- **The conditions** of (1) and (2) are the same two: game +0xdc is 0 (respawn off; the respawn reader is research 91
  §4.2's) and the valve `ComeFromLan` is 0. (2) also needs net state 6 (the game is over, research 91 §18.3), a local
  player who is no spectator and is on a side (D:L76609-76611). (1) has **no** test of the game being over: it runs at
  the end of every round.
- **A leave or a disconnect sends nothing.** No call of `FUN_002faa80` or `FUN_002f96f0` is on a leave path: a player
  who leaves before the round's end is simply absent from every calculator (§2.1) and keeps what earlier rounds gave
  him; a player who leaves before the match's end never folds its kills, deaths, rounds or game into his record.
- **The slice** (`slice-Medius.log`, the session's Medius log from READY on): 18 `WorldReport0`, one `PlayerReport` a
  player (lines 114, 176: rating 1000, position 2, minutes 12 and 10), then at the round's end one stats post a
  player (lines 262-274), the game still `WorldActive`. The desktop's own notes saw a `PlayerReport` "at each round
  boundary" of another run (`desktop@be557831:docs/research/18-online-round-start.md:1294-1297`): the record changes
  there because the rating does.
- **No `EndGameReport`** is in the slice, and no label for one is among V3's; whether the host sends one when a game
  closes is not read.

### 1.4 What our Horizon does with them (R155.12)

- `AccountUpdateStats`: stored as the account's `MediusStats` (`MLS.cs:500-537`; `DbController.cs:1379-1399`); in
  simulated mode the document is saved on the next tick when a file and a key are configured
  (`DbController.cs:62-67`, `:118-125`) -- V20's "stats are not persisted" is the README's older word, not the code's.
  `PlayerInfo` returns it (`MLS.cs:1399-1437`).
- `UpdateLadderStats` (0xce) and `LadderList_ExtraInfo0` (0xef): no handler at the pin (research 97 R97.3; the slice
  logs 0xce unhandled). The live checkout answers 0xce with success and keeps nothing, and 0xef with one empty
  end-of-list row (`Server.Medius/Medius/Medius150Replies.cs:42-57`, wired at `MLS.cs:3373-3392` there).
- `LadderPosition_ExtraInfo` (0xf1): `MLS.cs:1238-1274` answers position `Index + 1` and the total; the simulated
  branch returns `Index = 1`, `TotalRankedAccounts = 1` for everyone (`DbController.cs:1071-1079`). So on our Horizon
  every client hears "position 2 of 1" -- which is why every archived frame shows the Admiral's star (§3).
- `PlayerReport` and `EndGameReport`: the record and the result are dropped (`MLS.cs:2914-2946`).
- Its real ladder is the wide form's (LobbyExt 0x0b, 100 ints; `MLS.cs:908-1158`), which this client cannot send
  (research 97 R97.2). Its order, where it has one, is the stat descending, then the account id
  (`horizon-server-database-middleware`'s `StatsController.cs:240-263`).

None of this is evidence of Sony's server; it is why nothing of our service is copied from Horizon's.

## 2. The ladder

### 2.1 The rating (R155.5, R155.6, R155.7)

**When.** `FUN_002232a0` (D:L75773-75878) is the exit state's leave -- the state every round ends in (research 91
§18.2.4). With respawn off and `ComeFromLan` 0 it calls `FUN_002253c0`, and when the result is above 0 it writes the
result into the record's +0x04 and posts (D:L75798-75805). The round's bonuses (+5 a round won, +1 alive) and the fold
of the round block are already in the match block by then (D:L76148-76165, then D:L76030-76063).

**Who is in it** (`FUN_002253c0` D:L76661-76768). No result (0, no change) for a local spectator (D:L76690-76691) or
when either side has no player in the calculator (D:L76747). The calculator holds:

- two sides: id 0, the SEALs, with the SEALs' round wins (game +0x120) and the winner flag "game +0x128 is 0"; id 8,
  the Terrorists, with theirs (game +0x124) and the opposite flag (D:L76699-76704). Game +0x128 is the **last round's**
  winner -- 0 SEALs, 8 Terrorists, another value none (research 91 §9) -- so **whenever the SEALs did not win the
  round, the Terrorists carry the flag, a drawn round included**;
- the rounds played so far (game +0x11c, counted when each round's result is read, D:L150648-150649; D:L76700);
- every player of the list who is on a side and was **not a ghost of this round** (actor +0xfd2, the exit state's
  copy of the ghost flag +0xfd1, D:L76148; D:L76717), with his **published rating** (his player state's +8,
  `FUN_002c3500` D:L164888-164910, which each client refreshes from its own record, `FUN_002c5360` D:L166208-166209)
  and his **match score** (+0x580) floored at 0 (D:L76734-76739).

**The arithmetic** (`FUN_00239d40` D:L86199-86280 and its helpers), with `N` the players in it and, per side, `n` its
players, `S` the sum of their scores (`FUN_00239b20` D:L86124-86137) and `M` the mean of their ratings
(`FUN_00239a70` D:L86105-86121):

1. the pot is `N / 2`;
2. the factor `f` is read off the rounds played: 11 -> 0.05, 9 -> 0.07, 7 -> 0.10, 5 -> 0.16, 3 -> 0.35, any other
   count 0.05 (D:L86234-86252);
3. the losing side's part is `L = f x pot x (its round wins)`; the winning side's is `W = pot - L` (D:L86253-86254);
4. a player's **share** (`FUN_00239980` D:L86075-86102): 0 for everyone of a side whose `S` is under 1; on the losing
   side `L x score / S`; on the winning side `0.5 + (W - n x 0.5) x score / S`;
5. `K = 3 x N` (D:L86266);
6. a side's expectation is `E = 1 / (1 + 10^((M of the other side - M) / 400))` (`FUN_002397f0` D:L86040-86044);
7. each player's new rating is `R + K x (share - E)`, floored at 200 (D:L86049-86059);
8. the local player takes his own, rounded (`int(new + 0.5)`, D:L86179-86196, D:L76754); **if he joined a game in
   progress it is `old + trunc((that - old) x 0.5)`**, `old` the record's rating (D:L76756-76759).

- **The join in progress.** The test is the player state's +0x43 not being -1 (`FUN_002c2dc0` D:L164486-164513). It is
  set once, when the joining client applies the game's state: to the rounds played then if game +0xcd is set, else to
  -1 (`FUN_002c06a0` D:L163205-163210; the setter `FUN_002c2d50` D:L164464-164483); +0xcd is set on a client whose
  game +0xcc is set as it connects (D:L55713-55717; +0xcc's own setter is at D:L149278, its callers not read). That
  the pair means "the match had begun when I joined" is the reading of those lines, not a measurement (§9).
- **The team branch is dead.** The calculator has a second mode (its byte +8) that moves one rating a side with K 50,
  the sides starting at 1118.0 and 982.0 (D:L76703-76704, D:L86256-86270, D:L86062-86069); the constructor clears the
  byte and nothing sets it (`FUN_0023a2c0` D:L86390-86403; D:L76702).
- **Not read**: `FUN_001b3620`, called twice with the sums of the shares (D:L86263, D:L86276), its result unused.

**The trace** (R155.6). Session s4 (PCSX2, two consoles on our Horizon, 2026-09-12; `baseline.txt`): both records are
new -- each `PlayerReport` carries `'E'` and rating 1000 (slice lines 114, 176). Round 1 runs out on the clock:
`A_rend050.png` reads ROUND COMPLETE, SEALS DRAW, TERRORISTS DRAW, each player SCORE 1 (the +1 for being alive), KILLS
0, DEATHS 0. The next stats posts are 997 from the SEAL's client and 1003 from the Terrorist's (lines 262, 270; the
0xce bodies carry the same at byte 28, lines 264, 272; the record's team bits name the sides). By the steps above: N =
2, pot 1, one round played so f = 0.05, the Terrorists flagged (the round has no winner), the SEALs' part 0.05 x 1 x 0
= 0 and the Terrorists' 1; the Terrorist's share 0.5 + (1 - 0.5) x 1 / 1 = 1, the SEAL's 0; K = 6; E = 0.5 each;
1000 + 6 x 0.5 = **1003** and 1000 - 6 x 0.5 = **997**. The same posts show the career counters still zero and the
world active: a round's end, not the match's.

**What it does in play** (worked from the steps; not measured): eight a side, all at 1000, K = 48. Round 1: the
winners' part is the whole pot, a winner of the mean score gains 24 and each loser loses 24. At 5-5 the eleventh
round gives the losers 0.05 x 8 x 5 = 2 of the pot's 8: a mean winner +12, a mean loser -12. In a one-on-one K is 6
(K = 3N, N = 2) and a lone player's share stays between 0 and 1, so a round moves him by less than 6: exactly 3
between equal ratings (E = 0.5, the s4 round); against a player 400 below (E = 0.91), a win is worth 1 and a loss costs
5. Uneven sides move more, because a lone winner's share is his side's whole part: one player beating three, all at
1000, round 1, has N = 4, K = 12, pot 2, share 0.5 + (2 - 0.5) x 1 = 2, and gains 12 x (2 - 0.5) = **18**; each of the
three loses 12 x 0.5 = 6. The ratings a round uses are the ones the last round left, so a match's rounds compound.

*2026-10-09 (SVC-13a, web sprint 10):* transcribed as `packages/match/src/stats/rating.ts` and re-read at the
instructions -- research 261 §8: the expectation's power, add and divide in double (`RATING_EXPECTATION_SOFTFLOAT_READING`),
two orders changed (step 3's `L = f x (pot x wins)`, not `(f x pot) x wins`; step 4's winner's share `score x (W - n x
0.5) / S + 0.5`, in that order), the rounding's reading deciding an ordinary round (`RATING_ROUNDING_READING`), and "the
ratings the last round left" an inference (`RATING_PUBLISHED_REFRESH_READING`). The "Not read: `FUN_001b3620`" above
is closed: an absolute value (D:L32990-32996), its results unused.

### 2.2 Position, total and the ranking page (R155.8, R155.10)

- **My position**: `LadderPosition_ExtraInfo` (Lobby 0xf1, 0x24 bytes): my account id at +0x18, stat index 0 at
  +0x1c, sort order 1 at +0x20 (`FUN_002eafb0` D:L188973-188992; `FUN_002eb2c0` D:L189094-189114, sent only in lobby
  state 0xb). The answer's +0x1c is the position and +0x20 the total (`FUN_002eb010` D:L189008-189011; `FUN_002eb340`
  D:L189134-189137): kept as the UI variable `LadderRanking`, the globals the tier functions read, and the two valves
  (D:L189020-189045). A failed answer leaves them as they were.
- **The total alone**: `GetTotalRankings` (Lobby 0xd8), tagged `PlayerTotal` or `ClanTotal` (`FUN_002eb1b0`
  D:L189054-189091; `TotalClans` is the clan pages' variable).
- **The list**: `LadderList_ExtraInfo0` (Lobby 0xef, 0x28 bytes): stat index 0 at +0x18, sort order 1 at +0x1c, the
  start at +0x20, the page size at +0x24; tagged "TheBest" for the podium (`FUN_002eb610` D:L189217-189240) and
  "TheRest" for the page (`FUN_002eb510` D:L189183-189214: 7 x 2 rows, one request at a time, a start above 0 and
  below the total). The page opens at `max(1, my position - 2)` (D:L189146-189151); L1 and L2 page by 14 (research 97
  §2.2).
- **A row of the answer** (`FUN_002ebe50` D:L189547-189607): position at +0x1c, ladder stat at +0x20, the name at
  +0x24, the 256-byte record at +0x44, an online state at +0x144, the end-of-list byte at +0x1d0 -- the layout of the
  live Horizon checkout's `MediusLadderList_ExtraInfoResponse0`, the form without an account id. The client keeps a
  row once per position and sorts by position (`FUN_002ec260`).
- **The rows drawn.** THE PODIUM (`LADDER_LEADERS`, `FUN_002eb7a0` D:L189313-189358): position, name, `[tag]`. The
  page (`LADDER_RANKING`, `FUN_002eb900` D:L189361-189455): a key cell (*corrected 2026-10-12, ONL-30a; research 269
  §2.4 item 2: the reply's +0x20, which `GetPlayerInfo` parses with `strtol` into PlayerInfo's account id,
  `FUN_002efe50` D:L191699 -- an account key, not the rating; drawn off the screen at -600, so no column draws a
  rating*), the name, the position, the
  medal (`FUN_002eaee0` of the row's position against **my** cached total), the tag; my own row tinted (91, 72, 36).
  The tag is the row's record's +0x34.
- **So the sort key is the server's**: the client asks for stat 0 in order 1 (descending, `MediusSortOrder`) and draws
  what comes, by position. Stat 0 is the rating (the post's first int). How Sony's server ordered equal ratings, and
  which accounts it counted in the total, are unobservable; the client's own behaviour puts every account that ever
  logged in on the ladder at 1000 (§1.1).
- **The clan's**: `ClanLadderList` (Lobby 0xd2) and its position request, the same shape (research 97 §2.2); the tier
  is V7's (`FUN_002ead80` D:L188867-188895), the value posted is §1.3's mean.

*2026-10-09 (SVC-13, web sprint 10):* the three answers are built and re-read at the pin and the decompilation --
research 261 §9 (`packages/central/src/ladder.ts`): `MLS.cs:1238-1274` holds for 0xf1 at the pin; 0xd8 is handled there
too (`MLS.cs:1160-1236`, by ladder type) and 0xef is not (the pin's list handler is LobbyExt 0x0f's); this client sends
0xd8 only as `ClanTotal` (`FUN_002eab80` D:L188820-188823), the player's total coming with 0xf1; §8's two ladder
rows are replaced by that file's `LADDER_TIE_ORDER_OWNER` and `LADDER_ENTRY_PLACEHOLDER` -- call 5 settled as (b) by
OT.R33: from the first counted round, the lower id first (research 261 §6, §9.3).

### 2.3 The ranks, the medals and the gate (R155.8, R155.9)

`p = position x 1000 / (total - 10)`, an integer division.

| medal | rank (the legend's caption) | the legend's band | the rule (`FUN_002eaee0` D:L188934-188970) | image | in the frames |
|---|---|---|---|---|---|
| 5 | ADMIRAL | TOP 10 PLAYERS | position under 11 -- or any position while the total is 1 to 11 | `Medal_Black.tif` | a white five-point star |
| 4 | CAPTAIN | TOP 5% | p under 51 | `Medal_Gold.tif` | a spread eagle |
| 3 | LT. COMMANDER | NEXT 5-30% | p under 301 | `Medal_Silver.tif` | a gold leaf |
| 2 | LIEUTENANT | NEXT 30-85% | p under 851 | `Medal_Bronze.tif` | two silver bars |
| 1 | ENSIGN | LOWEST 15% | otherwise | `Medal_Blue.tif` | a gold bar |
| 0 | none | -- | the total is 0 (no answer yet) | `null.tif` | nothing |

- **The names and the bands** are `dlgLadderLobby.rdr`'s own TEXT widgets (`rank_desc_text` "RANK INSIGNIA";
  `admiral_text` .. `ensign_text`; `adm_text_desc` .. `ensign_text_desc`), literal captions, each beside its image
  (`medal_black` .. `medal_blue`, 12 x 12). They are **not** UIMnLOC 869-873: those five (ENSIGN, LIEUTENANT,
  COMMANDER, CAPTAIN, ADMIRAL) are named only by the campaign's `dlgCareerStats` and `dlgSelectRank`
  (`tools/dump-dialogs.ts --msg-users 869 873`), and UILdLOC 2001-2005 are the offline game-complete ratings (research
  125 §3).
- **The index is the value.** Every medal column on the disc is an IMAGE column whose TEXTURES are `null.tif`,
  `Medal_Blue.tif`, `Medal_Bronze.tif`, `Medal_Silver.tif`, `Medal_Gold.tif`, `Medal_Black.tif` in that order, and an
  IMAGE cell draws `TEXTURES[value % count]` (research 147 R147.6).
- **What each looks like** is read off frames, by eye, not scored: CREATE GAME's `Rank_Blue`, `Rank_Bronze`,
  `Rank_Silver`, `Rank_Gold` stand at x 185, 205, 225, 245 and `A_49_creategame.png` shows a gold bar, two silver
  bars, a gold leaf and an eagle in that order; the star is the fifth, the one a ladder under 12 gives everyone
  (`A_45_lobby2.png`, `A_54_gamelobby2.png`).
- **The gate's tier** (`FUN_002eae20` D:L188898-188931) is the same rule without the top-ten rung: 4 while the total
  is 1 to 11, else 4, 3, 2, 1 by `p` -- so a top-ten player's tier is whatever `p` gives him (all ten are tier 4 only
  on a ladder of 207 or more: position 10 needs `10000 / (total - 10)` under 51). *(Corrected 2026-10-04, on review:
  it read 226, which is the first Captain **medal**'s ladder.)* Four tiers, four icons. `GameRejectsRank` is local: the game's rank bits against my tier (`FUN_002f8bc0`
  D:L197404-197429; SVC-14a reads the bits).
- **Each player publishes his own**: his player state carries his medal at +0x42 and his rating at +8
  (`FUN_002c5360` D:L166200-166209). One name is special-cased: a player called `oop9` publishes medal 4 whatever his
  position (D:L166202-166205, S:0x3f2a88).
- **Small ladders.** By the rule: 1-11 ranked, all Admirals; 12-22, ten Admirals and the rest Ensigns; the first
  Lieutenant needs 23 ranked, the first Lt. Commander 47, the first Captain 226. At 100: 10 / 0 / 17 / 49 / 24
  (Admiral to Ensign); at 250: 10 / 2 / 60 / 132 / 46; at 1,000: 10 / 40 / 247 / 545 / 158. These are the
  **medals**; the gate's **tiers** split earlier, having no top-ten rung: on a ladder of 12, position 1 is tier 2 and
  the rest tier 1; on 14, position 1 is tier 3, positions 2-3 tier 2, the rest tier 1; the first tier 4 needs 30
  ranked (position 1: `1000 / 20` = 50). So from 12 ranked a medal does not tell a player which gated games admit him.

## 3. Where a rank and the stats show (R155.11)

Read from each dialog's record (`tools/dump-dialogs.ts --dialog <name> --tree`, 2026-10-04) and the function that
fills it. "Owner" is the roadmap task whose screen it is; a new block of §5 is marked *new*.

| where | dialog | what is drawn | filled by | owner |
|---|---|---|---|---|
| the foot of the online screens: the persona's name with his medal | of the disc's 103 dialogs, sixteen carry `playername` (WRAPPEDTEXT, `PLAYER_NAME_AND_TAG`: `[tag] name`, D:L187272-187279) with the five medal images as its children (16 x 16). Fifteen of them run `ActivateMedalOfMerit` (UIanim.rdr) at ONSTART; the sixteenth, `dlgWorldOfSOCOM` (the SOCOM II ONLINE menu), does not -- it binds `DisplayMedalOfMerit` (its own set) on `ON_LADDER_REFRESH` only, so its medal is drawn when the ladder's answer arrives, by ops not yet decoded *(corrected 2026-10-04, on review: it listed it among the fifteen)*. The sixteen: `dlgWorldOfSOCOM`, `dlgMPBriefingRoom`, `dlgCreateGame`, `dlgFriendList`, `dlgIgnoreList`, `dlgCreateClan`, `dlgManageRoster`, `dlgManageRosterLeader`, `dlgInvitedPlayers`, `dlgRespondToInvites`, `dlgLadderLobby`, `dlgClanLadderLobby`, `dlgOnlineFilters`, `dlgOnlineOptions`, `dlgSetSOP`, `dlgSetTaunts` (not `dlgGameLobby`) | my medal, by the valve `LadderMedalOfMerit` | the position answer (§2.2) | ONL-34 *new* |
| SOCOM II ONLINE, the PLAYER RANKING and CLAN RANKING rows | `dlgWorldOfSOCOM`: `LadderTop10` (`LADDER_LEADERS`) under 765 "TOP TEN SOCOM II ONLINE PLAYERS", `ClanLadderTop10` under 766; `DisplayMedalOfMerit` on `ON_LADDER_REFRESH` | the podium's rows: position, name, tag | `GetLadderInfo` | ONL-09 (the rows), ONL-30a *new* (the lists) |
| PLAYER RANKING | `dlgLadderLobby` (396; 151 THE PODIUM; 398 PLAYER; "RANK"; 395 the scroll line) | `LadderTop10`; `LadderList` (`LADDER_RANKING`): rating, name, position, medal 16 x 16, tag; the RANK INSIGNIA legend | §2.2 | ONL-30a *new* |
| PLAYER INFO (863 PLAYER STATS), a page inside `dlgLadderLobby`, `dlgMPBriefingRoom`, `dlgFriendList`, `dlgManageRoster`, `dlgManageRosterLeader` | `playerinfo_list1` (`PLAYER_INFO_VAR1`, its third column the medal at 28 x 28), `playerinfo_list2` (`PLAYER_INFO_VAR2`), `playerinfo_description`; R1 text chat, SQUARE ignore | list 1: the medal (from the position -- the record's own +0x08, or the ladder row's when opened from the ladder -- against my total), name and "(Leader)", LADDER POSITION, SCORE, TOTAL # OF GAMES, ROUNDS WON, ROUNDS LOST, HOMETOWN, then ONLINE / BRIEFING ROOM / GAME or "NOT CURRENTLY LOGGED IN"; list 2: KILLS .. HEAD SHOTS, TOTAL PLAYING TIME; the description | `GetPlayerInfo` -> `PlayerInfo` (Lobby 0x31) -> `FUN_002f0020` D:L191722-192146 | SVC-15a *new*, ONL-30a *new* |
| CLAN RANKING | `dlgClanLadderLobby` (148) | the clan podium and list, a medal column (V7's tier) | `GetLadderInfo(CLAN)` | ONL-30 (parked with the clans) |
| the clan roster | `dlgManageRoster`, `dlgManageRosterLeader`: `RosterList` (`CLAN_ROSTER`) under 464 RANK, 465 MEDAL, 466 MEMBER, 467 POSITION; 462 "Clan Rating:" | a medal a member | the roster's records | ONL-27 (parked) |
| the briefing rooms list | `dlgWorldOfSOCOM`: `ROOMLIST` (`ROOMLISTVAR`) under 767-769: name, players, four medal columns 16 x 16 | ELIGIBLE RANKS, from `room_rank_bits` | SVC-14a | ONL-11 |
| the briefing room: GAME DETAILS | `dlgMPBriefingRoom`: `Rank_Blue` .. `Rank_Gold` (11 x 11) in `GameInfoWindow` | the game's eligible ranks | `game_info_rank_restrictions` | ONL-12, SVC-14 |
| the briefing room: PLAYER LIST | `PLAYERLIST` (`ROOMPLAYERLISTVAR`): four text columns, no image; CROSS opens PLAYER INFO | no rank | -- | ONL-12, SVC-15a *new* |
| CREATE GAME | `dlgCreateGame`: the RANK RESTRICTIONS row (237; help 287), `Rank_Blue` .. `Rank_Gold` (16 x 16) | the ranks the game admits | `mp_rank_restrictions` | ONL-13, SVC-14 |
| the game lobby: SEALS and TERRORISTS | `dlgGameLobby`: `B_SEALLIST`, `B_REDLIST`: name, **a medal column 12 x 12**, the ready dot, the tag; `Rank_Blue` .. `Rank_Gold` (20 x 20) in `GameInfoWindow` | each player's published medal; the game's eligible ranks | `FUN_002c5010` D:L166061-166178 from each player state's +0x42 | ONL-16a (the lists), ONL-34 *new* (the live value) |
| the in-round scoreboard | drawn in code | name, score, kills, deaths (research 87 §12, 91 §11); no medal texture is named by the ELF | -- | ONL-19 |
| the round and final screens | `dlgMultiplayerRound`, `dlgMultiplayerFinal`, `dlgMultiplayerFinalReally` | name or `[tag] name`, SCORE, KILLS, DEATHS; MVP; YOUR STATS (§1.2); rounds; TIME PLAYED. No medal, no rating (`A_rend050.png`, `A_hold32.png`) | `FUN_00224210`, `FUN_002256f0`, `FUN_00225a00` | ONL-20 |
| a join refused by rank | 525 "You do not meet the rank requirements for this game. ..." | -- | `GameRejectsRank` | ONL-12, SVC-14 |

- **The star explained.** N6 has the persona's name "behind a star" and N13 a star on each lobby row: both are
  `Medal_Black`, value 5. Our Horizon answers "position 2 of 1" to everyone (§1.4), the rule gives 5 to any ladder
  under 12, and the frames taken after a disconnect, with no answer, show no star (the captures' inventory,
  `s13_v7_paused_peer_20260925_193109/B_hold06`-`B_hold25`).
- **PLAYER INFO's presence lines** (ONLINE, BRIEFING ROOM, GAME, or "NOT CURRENTLY LOGGED IN"; D:L192014-192058)
  come from the list the page was opened from, not from the lookup. The request is tagged by its origin with one of
  **four** tags (`FUN_002efe50` D:L191702-191715): `LADDER` (S:0x3f4c38), `FRIEND` (S:0x3f4c30), `CLAN` (S:0x3f4c28)
  or `BRIEFING` (S:0x3f4c18, also the fallback) -- V11 read three of them as buttons. The answer's handler reads the
  tag back: from the ladder, the row's own online state, and the row's position in place of the record's
  (D:L191791-191823); from CLAN, an entry looked up through `FUN_002e9460` in the list at 0x44f740 (D:L191825-191857;
  that list is not identified here); from FRIENDS, my friends list's entry
  (D:L191859-191890); otherwise the player's entry among my briefing room's players (D:L191891-191929). *(Corrected
  2026-10-04, on review: it listed three tags.)* So the ranking page tells where any listed player is: each of its
  rows carries that player's online state (§2.2).
- **No archived frame exists** of PLAYER RANKING, CLAN RANKING, PLAYER INFO, the PLAYER LIST opened, or the in-round
  scoreboard (the inventory of `logs/parity`, 2026-10-04): every layout above is a reading of the dialog's record,
  owed a capture (ONL-32).

## 4. What our server must do (R155.13)

"Modernized for our server" is read as: **the same record, the same arithmetic, the same ranks and pages -- computed
and written by the match server instead of posted by each console.** The round is already the server's in SOCOM Legacy
(`room.ts` runs the rules once for every page); the record follows it there. Everything in this section is a plan:
none of it exists.

### 4.1 The flow

```
room.ts   a round ends, not the last   --RoundResult------------>  the results queue (SVC-07): journaled, FIFO,
room.ts   the match ends               --MatchResult, then the       drained off the tick, one change at a time
                                         last round's RoundResult->    |- the career fold   (SVC-12a, a pure function: §1.1)
                                                                       |- the rating        (SVC-13a, a pure function: §2.1)
                                                                       '- ONE store change: each seat's record, ladder entry,
                                                                          mark and last audit entry (§4.2) -- then the ladder's
                                                                          order is stale, the audit line is appended, and the
                                                                          room is told each seat's new rating and medal
a page    my position | the podium | a page of the ladder | a player's info   -->  SVC-13, SVC-15a (reads only)
```

- **The order at the match's end is the original's: the fold, then the last round's rating.** The exit state's enter
  folds the career counters when the game is over (`FUN_00223970` D:L76078-76082, after it has added the round block
  into the match block, D:L76030-76063); the last round's rating is computed when the state is left (`FUN_002232a0`
  D:L75798-75805). The fields are disjoint -- the fold writes the counters, the rating writes +0x04, and both read the
  match block as it stands after the round's fold -- so either order gives the same values; the plan keeps the
  original's order anyway, and SVC-13a's and SVC-07's tests pin the last round explicitly: the match's final round
  moves the rating exactly once, after the fold, and the match's end neither drops it nor applies it twice. *(Added
  2026-10-04, on review: the diagram showed round then match.)*

- **The room is the witness.** It already decides every kill, death, round and match (`Room.endRound`,
  `packages/match/src/room.ts`: the winner, the sides' wins, the +1 and +5, `matchOver`) and already holds each
  seat's kills, deaths and score. The services live in the same process (R6, shape (c)), so the hand-over is a
  function call: there is no message between them to forge, lose or replay.
- **A page never reports a result.** The console's posts of §1.3 are not operations a page can use to move a rating
  or a counter. What a player owns in his record -- the hometown, the description, the gender (ONLINE OPTIONS, OPT-15)
  -- is a separate operation that can write those fields only; the tag and the clan's name are the clan service's.
  This is the one deliberate departure from the original (SVC-07's standing owner call; §6 call 1): on the console
  each client computed and posted its own rating, and nothing in the client shows a server checking it.
- **Which rooms report**: a game made through the game list (SVC-06, SVC-07a) whose every seat is an account. The
  rooms a page joins directly by map (the entry OT.R9 keeps; guests) never report.
- **When**: at the same two moments as the original (R155.3) -- the rating at each round's end, the counters once at
  the match's end -- and under the same two conditions, restated for us: respawn off; an online game (we have no LAN
  game).

### 4.2 The result, applied once

- **`RoundResult`** carries what `FUN_002253c0` read (§2.1): the match's id, the rounds played, each side's round
  wins, the last round's winner (a side, or none), and for each seat on a side: the account, the side, the match
  score, whether it was a ghost of this round, whether it joined the game in progress. **`MatchResult`** carries, for
  each seat there at the end, the match block's counters of §1.2, the game type, the seconds played and the rounds
  won, lost and drawn.
- **A match's id** is the room's id, the match's serial in that room and its start time: unique for the server's
  life and across restarts.
- **Once only: a per-account high-water mark.** The store's change is all or nothing (research 131 R131.3). Each
  account gains one field, `lastResult`: the mark of the last result applied to it -- the match's id and the round,
  or the match's id and "end" for the fold, ordered by the match's start time, then its serial, then the round, "end"
  above every round. A result's change sets the mark on every account it touches, in the same write; a result is
  refused whole, changing nothing, if any of its accounts already holds a mark at or above it. So a result handed over
  twice is harmless, a crash leaves a result wholly applied or not at all, and a result arriving out of order is
  refused rather than applied over a later one. The mark is bounded -- one field an account, never a list of every
  result, which would grow without end in a document rewritten whole (§4.4). It needs the results applied in order,
  which the queue below guarantees. A restart ends every room (rooms are memory): the rounds already applied stay, the
  cut match's fold never happens -- what the console's game left behind when its host vanished.
- **The schema change is a migration.** `lastResult` and the last audit entry (below) are new fields of the account,
  and the store refuses a file of another version (`SERVICE_STORE_VERSION`, `serviceStore.ts:19-20`, "never migrated
  silently"); the live data file is on the hosted box. So SVC-07's first step is a version 2 of the schema with an
  explicit, tested migration of a version 1 file (each account `lastResult: null`, no audit entry), a backup taken
  before it (research 131's backup), and a test that a version 1 file opened by the new code is migrated once and a
  version 2 file is untouched.
- **The write is queued off the tick.** `ServiceStore.commit` is synchronous: it clones the whole document, validates
  it whole, re-reads and hashes the file to detect a stale store, serialises it and writes it with two fsyncs (the
  file, the directory; `serviceStore.ts:639-654`, `writeAtomic` `:194-205`). A result lands at every round's end of
  every room while the other rooms tick at 60 Hz (`TICK_HZ`, `packages/viewer/src/net/protocol.ts:70`), so the room must never call it inside its tick. The
  requirement (SVC-12d hands over, SVC-07 applies): the room only enqueues a result, an O(1) step; one queue for the
  server, first in first out, drained by one worker outside every tick (after the tick's work, one change at a time).
  The queue is journaled -- each result appended to a pending file as it is enqueued, the line dropped from the
  journal's head once applied -- and replayed in order when the server opens, so a result is not lost to a crash or a
  restart between the round's end and its commit; the mark makes the replay safe. Or, if measurements show it
  cheaper, the store itself changes before sprint A (research 131 §7's embedded database behind the same methods);
  either way the acceptance is the same: a room test that a commit made deliberately slow (a stub store that sleeps)
  does not lengthen any room's tick, and a server test that a result enqueued, then the process killed before its
  commit, is applied exactly once at the next open.
- **A commit that throws.** The plan states what the worker does with each of the store's failures, so that no result
  is silently lost: `stale` (the file changed under the store) -- reopen the store and retry the same result; an I/O
  failure (a full disk, a permission) -- keep the result at the queue's head and retry with a growing delay, later
  results waiting behind it (so the marks stay in order), and tell the operator; `format` (the change breaks the
  document: a bug) -- move the result to a dead-letter file beside the journal, tell the operator, and go on. A retry
  is safe because of the mark: a result that was in fact written before the failure was reported is refused as
  already applied. Tests: each of the three, with a stub store that throws it once.
- **The audit ledger**: one line a result and account in an append-only file beside the store, which the game never reads;
  moderation does (a match voided, §4.5), and it answers "what happened to my rating". How long it is kept is SVC-04's
  retention call. **It must not drift from the store**: the line is outside the store's atomic change, so a crash
  between the commit and the append would leave an applied result with no line, and the void works from the ledger.
  The plan closes it this way: each account also holds, inside the same change as its mark, its **last audit
  entry** (the entry of the result that set the mark, below); the line is appended after the commit; and when the
  server opens, every account whose last audit entry's mark is not the ledger's last line for it has that line
  appended from the stored entry. One entry an account keeps the document bounded. Test: a crash injected between the
  commit and the append, then an open: the ledger holds the line exactly once.
- **What a line holds**, so that a void is defined (§4.5): the result's mark, the account's own part of the result's
  input (its seat of the `RoundResult` with the sides' values, or of the `MatchResult`) and everything needed to put
  its record back -- for a round, the
  rating before and after; for a fold, every counter's value **before** and the amount added, and for the two fields
  that are not sums their before-values: the bonus objectives (**replaced** by the fold, §1.1) and the hit percentage
  (a **running mean**, recomputed from the games count) -- and the games count before.
- **What a void can and cannot restore.** A void takes a named match's results out, newest first. If no later result
  touched any of its accounts, it restores them exactly: each rating, counter, bonus-objectives field and hit
  percentage to its before-value. If later results did, it can restore exactly only what is a sum -- the counters, by
  subtracting the match's amounts -- and it **cannot** give back "the ladder as if the match never happened": the
  later rounds' expectations were computed from ratings that included the voided changes, a later fold has replaced
  the bonus objectives, and a later hit percentage averaged over the voided match's value with a rounding that cannot
  be undone. For those the void subtracts the match's own rating changes, keeps the later bonus objectives, and leaves
  the hit percentage as it stands -- each noted in the void's own audit line. A full recomputation (replaying every
  later result from the ledger's inputs, which moves other players' ratings too) is possible from what a line holds,
  and is the owner's to ask for (§6 call 12).

### 4.3 A leave, a disconnect, a late joiner

The original (§1.3, §2.1): a player gone before a round's end is in no calculator -- no loss for that round, the
earlier rounds' changes kept -- and a player gone before the match's end never folds its counters; a player who
joins a running game is a ghost until the next round (left out), and from then on his changes are halved. Reproduced
exactly, quitting a lost round costs nothing. The room can do better without changing the arithmetic: it knows who
held a seat when the round began, and `Room.takeOver` already hands a returning player his seat and row. Which of the
two the ladder follows is the owner's (§6 call 7); the late joiner's half and the ghost's exclusion are kept as read.

### 4.4 The store

- **Today** (research 131): an account holds `stats`, exactly 256 bytes (256 zero bytes at creation), and `ladder`,
  15 ints or null; `setAccountStats` and `setLadder` each make one atomic change of the whole document; backup and
  restore exist. The store is opened by the match server since ONL-04.
- **It needs**: (1) one method that applies a result -- several accounts' records and ladder entries, their marks
  and their last audit entries, in one change; (2) the record's codec (SVC-12c): read a record (a blob that is not
  `'E'` is the default of R155.1), write one; (3) on each account, two new fields -- `lastResult` (the high-water mark)
  and the last audit entry (§4.2) -- under a schema version 2 with its migration; (4) beside the store, two
  append-only files, the results journal and the audit ledger (§4.2); nothing else on disk. *(Corrected 2026-10-04, on
  review: it read "nothing else on disk" while §4.2 wrote a mark beside the records.)* **The ladder's order is not stored**: it is an array in memory of the ranked
  accounts by rating, descending, rebuilt when a result made it stale. A position is an index, the total its length,
  a page a slice. At 10,000 accounts a rebuild sorts 10,000 pairs -- a few milliseconds.
- **The record's two live fields** -- the position (+0x08) and the minutes (+0x0c) -- are filled when a record is
  served (from the order and the session), never stored stale. On the console they were whatever that player's own
  client last wrote.
- **The order of equal ratings and who is ranked** are Sony's server's, unobservable. The stand-ins are named (§8):
  the lower account id first; an account ranked from its first login at 1000, as the client's own behaviour had it
  (§1.1) -- the second is the owner's call 5.
- **Scale.** The document is rewritten whole per change (research 131 §7): with results, one change a round a room.
  An account was estimated here at about 0.6 KB of JSON; its mark adds some 60 bytes and its last audit entry -- a
  fold's before-values and amounts, about forty numbers with their keys -- about 1 KB more, so an account is about
  1.6 KB and 5,000 accounts about 8 MB a write (estimates, not measured). Research 131 §7 moves the store to an
  embedded database behind the same methods "past a few megabytes": with the results' fields that comes at some
  2,000 accounts rather than 5,000 -- and the queue of §4.2 keeps that write off the rooms' ticks either way. The marks and entries are bounded (one
  each an account), so the size grows with the accounts, not with the matches played. *(Corrected 2026-10-04, on
  review: it kept the 0.6 KB of an account without the results' fields.)*
- **The lobby's medal and rating** (the player state's +0x42 and +8, §2.3) come from the server's record when a seat
  joins and after each round, not from the page.

### 4.5 Abuse limits

What the original did, all of it in the client (R155.3, R155.5, R155.7): respawn and LAN games change nothing; K is 3
a player, so a one-on-one moves a rating by less than 6 a round (3 between equal ratings), while uneven sides move
more -- one player beating three at equal ratings gains 18 (§2.1); the expectation makes beating a much weaker friend worth 1; the
floor is 200; a late joiner gets half. **And no more**: the counters have no guard (two friends in a password game
can trade kills for the KILLS line, which is not the ladder's key); a loss can be dodged by leaving; and each console
posted its own record, so a modified client could post any rating. The last is closed by §4.1. For the rest the
options are the owner's (§6 calls 2, 3, 7), each a rule the results operation applies before it computes -- a
password game not counted, a minimum of players a side, a minimum round length -- plus two that change no rule: the
audit ledger notes when both sides' seats share an address (noted, not refused: a household is legitimate), and the
operator can void a match, taking its own changes back out (SVC-23a) -- exactly only while no later result has touched
its players (§4.2, "What a void can and cannot restore"); who may void, and on what evidence, is §6 call 12. The `oop9` medal (§2.3) is cosmetic and kept
with the port of the player state unless the owner says otherwise.

*([2026-10-05, OT.R22] What these limits do not stop, and where the round, the result's path, the accounts and the
services are otherwise weak, is web research 169 -- its §5 for boosting and collusion; the owner's row is H89.)*

### 4.6 What a profile shows

The original (§3): PLAYER INFO shows anyone who can name or select a player his record's numbers, his hometown and
his description; and where he is -- to a friend, to a roommate, and to anyone reading the ranking page, whose rows
carry each player's online state. There is no page outside the game. For a public web game three things are new
questions: the hometown and the description are free text typed by players (the original's text check is
`NetCensorText`, on the clan tag; our rules are H85's and SVC-23's); a stranger can see where a ranked player is; and
a ladder page on the web site would be a new, public surface (the site is the owner's). §6 call 9.

### 4.7 Seasons

The client has none: no season, reset or decay in its strings or its code; the rating lives in the record until a
round changes it. Whether Sony reset its ladders is unobservable. (The r0004 patch renames PLAYER INFO's `SCORE:` to
`RATING:`, `desktop@be557831:docs/research/43-what-changed-in-r0004.md:61`; SOCOM Legacy presents r0001, OT.R17.) One
practical point: the ladder will hold test matches before the first release opens. §6 call 6.

### 4.8 What stays, what changes

| stays exactly as the original | changes behind it |
|---|---|
| the record: its 0xe4 bytes, version `'E'`, every field and width (§1.1); the default, rating 1000 | who writes it: the match server, not the page |
| the rating's arithmetic, per round: K = 3 a player, the shares, the factor table, the floor, the half, the draw quirk (§2.1) | where it runs: once, in the services, on the room's values -- not once a console on its own view |
| the career fold at the match's end, bonus objectives replaced, the hit percentage's running mean (§1.1) | it is applied once and in order, under a per-account mark, queued off the rooms' ticks; the console's periodic re-posts are not needed |
| position, total, the ranking page's requests and rows (§2.2) | the order is the services' memory; ties and who is ranked are named stand-ins |
| the five ranks, their names, bands and images; the gate's four tiers; the page computing them from position and total (§2.3) | nothing -- unless the owner re-scales (§6 call 4) |
| every screen of §3, from its dialog record | the lobby's medal and rating come from the server's record |
| a leave costs nothing; no minimum; password games count; no season (§1.3, §4.5, §4.7) | only by the owner's calls (§6) |

## 5. The build order (R155.14)

Sizes are the roadmap's (S 1, M 3, L 7 points). "Stands" means the block is right as written; "brought" that its
text now carries a dated line pointing here; *new* blocks are written in the segments under "Proposed (OT.R18)" and
are **not in the graph** -- the README's map, SPRINTS.md and the graph test's count are the controller's to bring
when the owner has read this (below). All of it is after the match's start (sprint 17) and is assigned to no seat
(OT.R7).

| order | task | what | size | stands on | against the roadmap |
|---|---|---|---|---|---|
| A1 | SVC-12a | the career fold as a pure function and its unit tests, from §1.1's table | M | -- | stands; its upload rule corrected (LAN, not ladder) |
| A2 | SVC-13a | the rating as a pure function and its unit tests, from §2.1; the s4 round as its first golden | M | -- | *new* (sliced from SVC-13) |
| A3 | SVC-12d | the room counts what the record needs and hands over `RoundResult` and `MatchResult` -- enqueued, never committed inside its tick (§4.2); at the match's end the fold, then the last round | M | SVC-07a, SVC-12a, SVC-13a | *new* |
| A4 | SVC-12c | the record's codec and the record as the server writes it | M | SVC-04, SVC-12a | brought: the server writes it; no client post |
| A5 | SVC-07 | the results operation: the schema's version 2 and its migration first; the journaled queue off the tick and its worker, with what it does on `stale`, an I/O failure and `format`; the per-account mark; the one change with each account's last audit entry; the audit ledger and its reconciliation at open (§4.2) | L (M of it left after SVC-07a; the queue and the migration may make it L again -- the controller's to size) | SVC-07a, SVC-12c, SVC-12d, SVC-13a | brought |
| B1 | SVC-13 | position, total, the podium and the page; the tier functions' tests | L | SVC-12c, SVC-13a | brought: the rating is known; the order is ours |
| B2 | SVC-15a | PLAYER INFO's lookup: the record served, the status; no friends | S | SVC-12c, SVC-13 | *new* (sliced from SVC-15) |
| B3 | ONL-30a | PLAYER RANKING, PLAYER INFO, the menu's top ten | M | SVC-13, SVC-15a, ONL-09 | *new* (sliced from ONL-30) |
| B4 | ONL-34 | the medal: beside the name on sixteen dialogs (first, the decode of `ActivateMedalOfMerit` and of SOCOM II ONLINE's `DisplayMedalOfMerit`), in the game lobby's lists; the two valves | M | SVC-13, ONL-09, ONL-16a | *new* |
| C1 | SVC-14 | the gate: a game or room refuses a rank outside its bits (525) | M | SVC-13, SVC-14a | stands; call 10 |
| C2 | SVC-23a | the ladder's limits as ruled, and the void of a match as §4.2 defines it | M | SVC-07, SVC-13 | *new* (sliced from SVC-23); calls 2, 3, 7, 11, 12 |
| C3 | SVC-12b | the record against a live one: the proven level | M | SVC-12a, PLAT-36 | stands; its mapping is now a reading (§1.1) |
| C4 | ONL-19 | the scoreboard's online fields | S | SVC-06, SVC-08 | stands; it shows no rank |

ONL-20 (sprint 23) stands and needs nothing of the ladder: its YOUR STATS is §1.2's nine numbers. The clan's ladder
-- SVC-11's stats half, ONL-30's CLAN RANKING, ONL-27's roster medals -- stays with the clans (sprints 10, 18; call
8).

**The proposed cut, for the controller to carry into SPRINTS.md** (the sprint numbers are the controller's):

- **Sprint A -- a match adds to the record** (A1-A5; 5 tasks, 19 points; after sprints 8 and 17). *Done means:* two
  accounts play a two-player game on the local server; after round 1 both records' ratings have moved as SVC-13a
  computes -- a first round lost on the clock gives 1003 and 997, the s4 values; after the match both records show
  the game, the rounds, the kills and the deaths as SVC-12a computes from the room's own log, the last round's rating
  applied once, after the fold; handing the same results over a second time, or out of order, changes nothing; a
  result whose commit is made slow or made to fail lengthens no room's tick and is applied once when the store
  recovers or the server restarts; a respawn game changes nothing.
- **Sprint B -- the ladder and the ranks show** (B1-B4; 4 tasks, 14 points; after A and sprint 16). *Done means:*
  after that match PLAYER RANKING shows both players in order with their SCORE and medal on either page, the SOCOM II
  ONLINE menu's top ten lists them, PLAYER INFO shows the record's fields, and each player's medal stands beside his
  name on the online screens and beside both names in the game lobby.
- **Sprint C -- gates, limits, the proven level** (C1-C4; 4 tasks, 10 points; after B; each item waits on its call
  or its window). *Done means:* a game restricted to Lieutenants refuses an Ensign with 525; a match the ruled limits
  exclude leaves both records unchanged and says why in the audit ledger; the operator voids a match no later result
  has touched and its players' records and the ladder are as they were before it, and voids one a later result has
  touched and gets exactly §4.2's partial restore, each part named in the void's audit line; a recomp record read after a local match equals SVC-12a's output for the same events.

**Promoting the six new blocks** (when the owner has answered H86): each `####` heading under "Proposed" becomes a
`###` block in its segment's Tasks; each parent's Dependencies gains its slice (SVC-13 -> SVC-13a, SVC-07 -> SVC-12d,
SVC-15 -> SVC-15a, SVC-23 -> SVC-23a, ONL-30 -> ONL-30a); the README's segment table, totals and layer map, the
capability matrix, SPRINTS.md's sprints and the graph test's count of active tasks (160 today) follow.

## 6. The owner's calls (R155.15)

*2026-10-04, answered (OT.R33):* the owner -- "it is to use it's best judgement were not derivable from main gmae. All
games count that are > 4 people when the match started. No less. Banned account is excluded from leaderboard entirely.
People who quit still have their match and history recorded when the server writes it at the end." So call 2 and call
3: a game counts when more than four players were in it at the match's start (read as five or more), whatever its
room; call 7: option (b), no penalty; call 11: a banned account off the ladder and out of its total; calls 1, 4, 5, 6,
8, 9, 10 and 12: this note's recommendation in each row stands as the build's rule.

Each is a row of H86 by its short name. "Default" is what the build takes until the call is ruled: the original's
behaviour wherever it is known (HUMAN_TASKS, the convention) -- with three exceptions. Call 1's default is OT.R18's own
reading (the match server reports). Calls 8 and 10 default to **parked**, not to the original: the original has a clan
ladder and gates games by rank, and both are parked by standing rulings -- the clans with OT.R6 (the CLAN RANKING row
drawn and inert, OT.R8), the gate with SVC-14's OT.R6 parking. Call 8 is therefore the confirmation of a standing
ruling, not a new decision; call 10 asks when the parked gate comes back. Calls 11 and 12 concern what the original's
server did, which is unobservable; their defaults are "nothing removed, nothing voided" until the owner says.

| # | call | the question and the options | recommended | default meanwhile |
|---|---|---|---|---|
| 1 | LADDER-AUTHORITY | Who reports a result: (a) the match server, from the room's own events; (b) each page, as each console did | (a): a browser page cannot be trusted with its own rating | (a); (b) is not built |
| 2 | LADDER-COUNTS | Which games move the rating and the record: (a) every online game with respawn off, public or password (the original); (b) public games only; (c) only games in rooms marked ranked | (b) for the first release | (a) |
| 3 | LADDER-MINIMUM | The smallest game that counts: (a) none -- one a side counts (the original): K = 3 a player keeps a one-on-one's round under 6 points (3 between equal ratings), but a lopsided game is not small -- one player beating three at equal ratings gains 18 a round (§2.1); (b) two a side; (c) four a side; (d) a minimum per side and sides of equal size; and whether a round under some seconds counts | (b), no time rule: it removes the one-on-one a pair of friends can farm, and with it the largest lone-winner swings | (a) |
| 4 | RANK-SCALE | The ranks' bands: (a) the original's rule exactly -- under 12 ranked all are Admirals, the first Lt. Commander needs 47 ranked, the first Captain 226 (§2.3); (b) re-scaled for a small population (bands by share alone, the Admirals a share too) | (a) now; look again when the ladder passes 250 | (a) |
| 5 | LADDER-ENTRY | Who is on the ladder: (a) every account from its first login, at 1000 (what the console client did); (b) an account from its first counted round. And equal ratings: the lower account id first, or the one who reached the rating first | (b), the lower id first: with (a) the first ten to register are the first Admirals | (a), the lower id first |
| 6 | SEASONS | (a) none (the original shows none); (b) one wipe when the first release opens to the public; (c) seasons of some months, each reset to 1000 | (a) and (b) | (a); nothing is wiped without your word |
| 7 | QUIT-COST | A leave or a dropped connection during a round: (a) the original -- the leaver is in no calculation: no loss for that round, earlier rounds kept, the match's kills and game never recorded; (b) the seat is scored in that round as it stood when it left, its counters folded at the match's end as of the leave, and a return within the round takes the seat back; (c) (b) and a penalty | (b) | (a) |
| 8 | CLAN-LADDER | **The confirmation of a standing ruling, not a new decision.** CLAN RANKING and the clan's rating: (a) in with the players' ladder (the original has it); (b) parked with the clans, as OT.R6 already parks them (a clan has a value only from eight members, §1.3) | (b): confirm the ruling | parked (OT.R6); the row drawn and inert (OT.R8) -- the ruling's, not the original's |
| 9 | PROFILE-PRIVACY | What a profile shows: (a) as the original -- record, hometown and description to anyone logged in, and where a player is to friends, roommates and anyone reading the ladder; (b) whereabouts to friends and roommates only; (c) hometown and description off until the name rules are ruled (H85). And whether the web site gets a ladder page (new; the site is yours) | (b); the texts under H85's rules; no web page for the first release | (a); the texts under H85's default; no web page |
| 10 | RANK-RESTRICTIONS | The gate on rooms and games (SVC-14): (a) with the ladder (sprint C), rooms as OC-4 ruled; (b) parked -- the row and the icons drawn, the choice kept and listed, nothing refused | (a) in sprint C, after the ladder shows: the gate judges by `FUN_002eae20`'s tier, which has no top-ten rung (§2.3), so from 12 ranked the tiers already differ from the medals -- on a ladder of 14, position 1 is tier 3, positions 2-3 tier 2, the rest tier 1, and an Admiral there would be refused by a Captain-only game. A player should see his medal and the ranking page before a gate he cannot read from his medal refuses him | (b), by SVC-14's OT.R6 parking (not the original, which gates) |
| 11 | LADDER-BANNED | Whether a banned account, or one whose results were voided, stays on the ladder and in its total. The total moves every medal (`p` divides by it, §2.3), so the choice moves other players' ranks. (a) it stays ranked and counted, its rating as it stands (nothing in the client removes anyone; what Sony's server did is unobservable); (b) hidden from the podium and the page while banned, still counted in the total; (c) out of the order and the total while banned, its rating kept and its place restored if the ban is lifted; (d) as (c), and an account whose results were voided starts again at 1000 | (c): a banned player should not hold a place or an Admiral's medal, and keeping the total honest keeps everyone else's medal right; a void alone removes no one (its results are taken out, §4.2) | (a): no ban exists until SVC-23 builds one, and nothing is removed without your word |
| 12 | VOID-AUTHORITY | Who may void a match, and on what evidence (SVC-23a; the original has no void -- a console's post was final as far as the client shows). Who: (a) you only; (b) you and the moderators you name (no moderator role exists yet; it would be SVC-23's, beside its reporting path); (c) a rule, automatically (say, both sides from one address). Evidence: the audit ledger's lines (the shared-address note, a result's counts), a player's report with the match named, a recording or a capture. And what a void restores when later results touched the players (§4.2): (i) the partial restore -- the match's own changes subtracted, nothing recomputed; (ii) a full recomputation of every later result, which moves other players' ratings too | (b) on the ledger's evidence plus a named report, each void recorded with who, why and the evidence in its own audit line; no automatic void; (i) | no void is performed: the tool is built and tested (SVC-23a), and used only on your word, each time |

## 7. What this note corrects

Each is corrected where it is written in the segments, with its cite, on this date; research 91 is not edited here.

| where | it read | the cite shows |
|---|---|---|
| segment 06, V9 | the rating "defaults to 99" | 99 is the session's start value only; the login's own-stats read replaces it, and a record that is not `'E'` becomes the default, rating 1000 (R155.1) |
| segment 06, V11 | the field list ends at HEAD SHOTS; "buttons BRIEFING, FRIEND, LADDER" | TOTAL PLAYING TIME follows (D:L192130-192131, S:0x3f4ec0); the three words are origin tags of the request, not buttons, and there is a fourth, `CLAN` (S:0x3f4c28; D:L191702-191715) |
| segment 06, V12; SVC-12a's acceptance; research 91 §9 and §18.3 (owed there) | "outside ladder games" | the valve is `ComeFromLan` (S:0x3f6328): outside LAN games |
| segment 06, V12 | +0x560 into one of three shorts by type; the slice's posts "at match end" | the ESCORT Terrorist's short takes +0x55c (D:L76622-76625); the slice's posts are a round's end (R155.6) |
| segment 06, V20 | "in simulated mode stats are not persisted" | the record is saved with the simulated document (`DbController.cs:1379-1395`, `:118-125`, `:62-67`); the live checkout also answers 0xce and 0xef (§1.4) |
| segment 06, SVC-13 | ranks "ENSIGN...ADMIRAL (UIMnLOC 869-873; UILdLOC 2001-2005)"; the rating "possibly the server's"; "how a ladder game differs" | the online ranks are `dlgLadderLobby`'s literal captions; 869-873 are the campaign's; the rating is the client's (R155.5); there is no ladder game |
| segment 05, ONL-30 | `dlgLadderLobby` (395-398, 151) | 397 PLAYER DESCRIPTION is `dlgOnlineOptions`'s; the sort key is answered (R155.10) |

## 8. Placeholders and readings

This note wrote no code; the rows a later task added name its file (MU-12a, 2026-10-10 UTC: the last two; both moved
to research 261 §6 by SVC-12e's one decoder, 2026-10-11, 261 §11). The
stand-ins the build will need are named here so that the task that writes one finds its row; each is *note only* until
then.

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `LADDER_TIE_ORDER_PLACEHOLDER` | the lower account id first | the order of equal ratings on Sony's server | unobservable; the owner's call 5 | *note only*; replaced 2026-10-09 by `LADDER_TIE_ORDER_OWNER` (research 261 §6) |
| `LADDER_ENTRY_READING` | from the first login, at 1000 | which accounts the server counted in the ladder: the client posts its default record at its first login (R155.1) | unobservable beyond the client's behaviour; the owner's call 5 | *note only*; replaced 2026-10-09 by `LADDER_ENTRY_PLACEHOLDER`: call 5 settled as (b), from the first counted round (research 261 §6) |
| `JOIN_IN_PROGRESS_READING` | the room's "joined after the match began" | the player state's +0x43 not being -1 (game +0xcd at the join, §2.1) | a two-console run on the local stack: join a started game, read +0x43 and the next round's post | *note only* |
| `HEAD_SHOT_COUNT_PLACEHOLDER` | a kill by a head hit | which hits the block's +0x00 counts: the hit paths at D:L459528-459680 are not read | that read (SVC-12a) | *note only* |
| `BONUS_OBJECTIVE_COUNT_PLACEHOLDER` | 0 | the writer of the block's +0x34 is not found | a search of the block's +0x34 writers (SVC-12a) | *note only* |
| `RESULT_AUDIT_RETENTION_PLACEHOLDER` | kept whole | how long the audit ledger is kept | SVC-04's retention call (the owner's) | *note only* |
| `STATS_DEFAULT_GENDER_PLACEHOLDER` | 0 | the default record's +0x03 bit 0 when a server substitutes the default: the original takes the **local** console's valve `PLAYERGENDER` (S:0x3f5b40, D:L198213-198214), which a server has not, and which value is which sex is not read (`packages/central/src/statsRecord.ts`, MU-12a; both s4 consoles carried 0) | the valve's writer on ONLINE OPTIONS (OPT-15) and its two captions | *moved 2026-10-11 (SVC-12e): one name with the codec's default, `false` in `stats/accountStats.ts`; its row is research 261 §6's (§11 (b)), this one history* |
| `STATS_TEXT_ENCODING_READING` | latin1 (a byte is the character of its code) | the record's texts' character set past ASCII (the software keyboard's set, research 119); the codec carries every byte one for one and refuses a character above 0xff (`statsRecord.ts`, MU-12a) | the keyboard's glyph table against the font's | *moved 2026-10-11 (SVC-12e): folded into the one codec, `stats/accountStatsCodec.ts`, the same rule; its row is research 261 §6's (§11), this one history* |

Not a constant, so no row: a text that fills its field leaves no NUL (`FUN_00199800` is a bounded copy), and PLAYER
INFO's `%s` (S:0x3f4c58) then reads on into the next field -- a full 63-byte hometown runs into the description, a
full tag into the clan's name. Whether any input can fill a field (the software keyboard's and the valves' limits) is
not read; the keyboard's per-field maximum would settle it. The codec stops each text at its field's end
(`statsRecord.ts`, MU-12a; MU-12's review, 2026-10-10 UTC). The eight counters at +0x24..+0x32 are shown unsigned
(PLAYER INFO's `lhu` at ELF 0x2f0aa4..0x2f0d14), corrected in §1.1 (first by SVC-12a, research 261 §1, 2026-10-09). The fold's `(float)` of the hit sum (a `cvt.s.w`,
D:L76637-76641) is chopped in the codec on the same `EE_FPU_ROUNDING_READING` (research 111 §1.4); its direction is
unmeasured and only bites for a sum of 2^24 or more (some 132,000 games).

*2026-10-09 (SVC-12a, web sprint 10):* `HEAD_SHOT_COUNT_PLACEHOLDER` and `BONUS_OBJECTIVE_COUNT_PLACEHOLDER` are now
constants of `packages/match/src/stats/accountStats.ts`, inputs of the fold still unread at the source (the bonus
objectives narrowed: round +0x3a is summed into +0x34, `FUN_00224d10` D:L76575); their rows, the fold's re-read of
§1.1 (the 16-bit fields unsigned; the hit percentage masked to 7 bits; the games count wrapping at 2^22) and the new
`STATS_FOLD_ROUNDING_READING` are research 261 §1 and §6.

## 9. Settled, not settled, owed

The evidence, by kind: source inspection (the decompilation, the ELF's strings, one disassembly, Horizon's files);
the disc's data through the repository's readers (the dialogs, the captions); frames read by eye (`A_rend050.png`,
`A_47_rooms.png`, the inventory of `logs/parity`); a log read (the s4 slice). No unit test, no browser run, no
playtest, no capture scored: nothing here is above a reading.

- **Settled at the reading level**: the record's layout and versions (R155.1, R155.2); when the rating and the
  counters move and under what conditions (R155.3); the messages and their moments (R155.4); the rating's arithmetic
  and its edges (R155.5, R155.7), with one round of a real session agreeing (R155.6); what the server is asked and
  what the client computes (R155.8, R155.10); the ranks, their names, bands and images (R155.9); every place a rank
  shows (R155.11).
- **Not settled, and what would settle each**:
  - Sony's server: the order of equal ratings, which accounts it counted, whether it checked a post, whether it ever
    reset a ladder -- unobservable; the owner's memory of the original, or a period source (the manual, a strategy
    guide), could inform calls 5 and 6.
  - `DAT_0045a0c3` (the record's +0x01 bit 7), +0x02's low five bits and +0x03's high six -- a read of their writers,
    or SVC-12b's PEEK of 0x66a750.
  - That game +0xcd means "the match had begun when I joined" -- a two-console run joining a started game.
  - Which hits count a head shot; what writes the bonus objectives; what `FUN_001b3620` does with the shares' sums --
    decomp reads, SVC-12a's and SVC-13a's.
  - The clan roster entry's +0x1cc (the clan's value) and what `UpdateClanStats` sends -- SVC-11's.
  - `ActivateMedalOfMerit`'s and `DisplayMedalOfMerit`'s ops, and which value `ROOMLISTVAR` puts in each of its four
    medal columns -- the screens' decodes (SVC-14a; ONL-34, whose first step is the two sets' decode, since its
    acceptance tests the medal on SOCOM II ONLINE, the one screen drawn by `DisplayMedalOfMerit`).
  - Whether the host sends `EndGameReport`, and a whole match on the wire (every round's post, the fold's) -- a
    Medius log of one full match on the local stack: the proven level for §2.1 past round 1.
  - Every frame of PLAYER RANKING, PLAYER INFO, CLAN RANKING, the PLAYER LIST and the scoreboard -- ONL-32's window;
    the ranking page needs a server that answers 0xef with rows, which our Horizon does not (§1.4).
- **What the review could not verify** (the re-read of 2026-10-04; each stays as written above, at the level stated):
  - The soft-float helpers `FUN_002397f0` calls for the expectation are read as a power, an add and a divide by their
    shape and their constants only, not traced through. The archived trace fixes E = 0.5 at equal ratings (R155.6);
    nothing measures an unequal pair, so `10^(d / 400)` is unconfirmed off the diagonal -- a unit test cannot settle
    it; a round between unequal ratings on the local stack (or a call trace of the helpers) would.
  - Whether the exit state's leave (`FUN_002232a0`) still runs, with the round's counters intact, after the game has
    reached net state 6 -- i.e. that the last round's rating is computed after the fold (§4.1) and not skipped -- a
    read of the state machine's exit from state 6, or the full-match Medius log above.
  - The receiver of the other players' match scores: the sender is read (`FUN_002bd640`, called in the exit state's enter at
    D:L76071, before the fold), the code that stores what arrives as the +0x580 the calculator reads is not.
  - The meaning of game +0xcd ("joined in progress"), as above.
  - Not opened by the review: the fill functions of `ROOMLISTVAR`'s four medal columns and of CREATE GAME's rank
    icons; the frames `A_45_lobby2.png`, `A_49_creategame.png` and `A_54_gamelobby2.png` (read by eye here, §2.3);
    the Horizon middleware's `StatsController.cs` (§1.4's order of equal stats).
- **Owed**: the reviewer's re-read of the cited lines is done (2026-10-04, pass with findings, corrected in this note;
  what it could not verify is listed just above); research 91 §9 and
  §18.3's "not a ladder game" corrected where written; the controller's carry of §5 into SPRINTS.md and the promotion
  of the six blocks; the owner's answers (H86).
