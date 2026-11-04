# 275 -- the clan tag carried into a round: the published player state's tag, the room's score rows (CLAN-TAG-ROUND)

- Date: 2026-10-13 (web sprint 18, the clans' half, checkpoint 6; the plan `../plans/2026-10-13-web-sprint-18-the-clans-pages.md`,
  the row CLAN-TAG-ROUND; the brief `../plans/briefs/2026-10-13-s18c-clan-tag-round.md`).
- Status: **reading, reviewed** (CLAN-TAG-ROUND, 2026-10-13, by a fresh reviewer -- PASS WITH FINDINGS; merged at 49ac1b28f after its fresh review, the clans' plan's Log). Every value of the original below is read from the retail decompilation
  (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never pasted) and the ELF's strings
  (`socom2_game.elf.strings.txt`, `S:0x<addr>`). Unit-tested against that reading, and the room's rows through a
  lobby-created game on the fixtures' MP72 (§4); nothing here is measured on the original running -- ONL-32's capture of
  an online round with SELECT held and a clan member seated is the proven level.
- Stands on research [269](269-the-players-pages-and-the-medals.md) (§5.2: the board's "[clan]" rows, `FUN_0022a290`
  D:L79042-79053, the one-space seed, the colour, `CLAN_TAG_OVERRUN_READING`), [272](272-clan-roster.md) (§3 GetMyClans:
  the tag at the stats' +15 into `Clan_Description`; §6 the leader's tag post and the coloured name `FUN_002e7e70`),
  [155](155-the-stats-record-the-ladder-and-the-ranks.md) (§2.3: each console publishes its own player state, the medal at
  +0x42), [91](91-the-round.md) (§7 the 24 lobby records, §13 the tag's 16 bytes at +0x2e), [227](227-voice-ui.md) (§3
  `TALKER_CLAN_PARKED_READING`) and [264](264-the-results-path-and-the-ladders-guards.md) (§2 SEAT-TOLD, the pattern the
  bridge follows), and does not restate them.
- Code: the server's `packages/central/src/clans.ts` (`seatClanTag`, `SEAT_CLAN_TAG_CHARS`, `CLAN_TAG_AT_SEAT_READING`);
  the bridge's seat (`packages/central/src/bridge.ts`: the `clanTag` option, read at a seat's `seated`, wired in
  `createServices`) and the room's rows (`packages/match/src/room.ts`: `tellClan`, `scoreEvent`); the protocol's
  `ScoreRow.clan` (`packages/viewer/src/net/protocol.ts`, additive); the round's speaker line
  (`packages/viewer/src/hudVoice.ts`: `voiceHudFrame`'s `clanOf` from the rows). The page's `score` handling
  (`netPage.ts`) and the board (`scoreboard.ts`, ONL-19's) are unchanged: the page hands the rows on whole. AD-13 (§5 item
  5): the room's `seatClans` (`room.ts` `tellClan`, `tellClans`; `protocol.ts`), the page's board (`net/seatClans.ts`,
  `NetClient.clans`), the game lobby's feed (`gameLobbyHost.ts`) and lists and bar (`@s2u/ui` `gameLobbyCommands.ts`
  `seatClans`), the speaker line's `VoiceHudSources.clanOf` (the two mounts).

## 1. Where the original's board gets each player's tag

### 1.1 The record: each console's published player state

- **The board's lookup** is `FUN_002c3ac0` (D:L165206-165222), called with the player's slot, its +0xfc8 (D:L79042): the
  slot's record in `DAT_004414c4[slot * 2]` (24 slots, a slot outside 0-23 none, D:L165212-165216) gives its +0x2e; no
  record gives "" (`DAT_003f2a30`, D:L165218-165219).
- **The record** is a player state object of 0x4c bytes (research 91 §7). The local console makes its own in
  `FUN_002c5450` (D:L166218-166312): a networked object (`FUN_0030d670(0x45a0c0, ...)`, D:L166230), cleared
  (D:L166236), filled -- the team word, the name at +0xe from `PLAYERNAMEVAR` (S:0x3f2aa0, D:L166268-166279), **the tag
  at +0x2e** (§1.3), the network index at +0x44 (D:L166294-166296) -- and set into its own slot of `DAT_004414c4`
  (D:L166299-166303). The other consoles' states reach the same table by their own index (`FUN_002c4500`
  D:L165621-165660, research 91 §7). So every console reads every player's tag **as that player's console published
  it** -- the same rule as the medal at +0x42 (`FUN_002c5360` D:L166196-166209, research 155 §2.3).

### 1.2 When it is set: once, when the state is made at the game's join

- `FUN_002c5450` has three callers, each under the game object's +0xcf flag, set to 1 at once (so once per game held):
  `FUN_002b7a20` (D:L158502-158506), `FUN_002bbfa0`'s event 5 (D:L160936-160940) and `FUN_002bc080` (D:L160981-160985).
- **Nothing rewrites +0x2e after.** `FUN_002c5360` (D:L166181-166213), run after each creation and again later, rewrites
  the state's +0x40 / +0x41 (the game's +0x114 / +0x115), +0x42 (the medal), +0 (the team word), +0x3e (the team slot)
  and +8 (the rating) -- never the tag. Of the decompiled text's writes at a record's +0x2e in the game-object range
  (D:L158000-167500), the two copies of `FUN_002c5450` (D:L166288, D:L166293) are the only ones on this record (the two at
  D:L164299 / D:L164316 copy 0x2e bytes elsewhere, a length, not this field).
- So a tag changed while the game is held -- the leader's new tag, a disband -- reaches no board of that game; the next
  game's state reads it again.

### 1.3 Its form: the bare tag, cut to 15

- **The source** is the UI variable `Clan_Description` (S:0x3f2ac0, D:L166281): its string when it holds one (type 3,
  D:L166283-166286) is copied 16 bytes into +0x2e (`FUN_00199800`, a bounded copy, D:L166288) and the byte at +0x3d -- the
  16th -- zeroed (D:L166289): **at most 15 characters**. A variable not held, not a string, or a null string gives the
  empty string (S:0x3f2a30, D:L166293).
- **`Clan_Description` holds the bare tag**, not the coloured name: GetMyClans' success writes the C string at the stats'
  +15 (`FUN_002e8bd0`, 0x44f5f7, D:L187818; research 272 §3); the `#C`-coloured "[tag] name" is `PLAYER_NAME_AND_TAG`, a
  different variable (D:L187838-187844; the tag post's `FUN_002e7e70` D:L187272), which the state never reads.
- **Every write of `Clan_Description`** (the lobby's +0xf4 handle, `DAT_0044f464`, made at the lobby's start,
  `FUN_002e0450` D:L182785): GetMyClans' success the tag (D:L187818) and its no-clan reply "" (D:L187794); the create's
  callback `FUN_002e7b80` "" on success and on refusal (D:L187189, D:L187203); a quit's success "" (`FUN_002e8f70`
  D:L187888); the disband's success **" "** (S:0x3f3f18, `FUN_002e68e0` D:L186541); `FUN_002e7aa0`'s refusal branch " "
  (D:L187153; that callback's request not read here); and the leader's own keyboard on the variable (`clan_tag`'s
  `GetTextInput(Clan_Description)`, research 272 §6).

### 1.4 A player with no clan, and the board

- No clan: the variable "" (GetMyClans' no-clan reply, a quit, the create before its tag post), so the state's +0x2e is
  "", `FUN_002c3ac0` returns it, the board's length test fails (`FUN_00199288`, D:L79047) and the row keeps its one-space
  seed (research 269 §5.2). A tag drawn is "[" (S:0x3e57a0), the tag, "]" (S:0x3e57a8), at x 163 (D:L79047-79053).
- **One case reads otherwise**: after the leader's own disband the variable is " " (D:L186541), a non-empty string, so his
  console publishes " " in the next game it joins and every board draws "[ ]" on his row, until a GetMyClans writes ""
  (SOCOM II ONLINE's next build). The port draws no tag there (§3).

### 1.5 The same lookup's other readers

`FUN_002c3ac0` is called at nine places (eight in the first draft, the review's F1): the board (D:L79042, `FUN_0022a290`), the round's lists (`FUN_00224210`
D:L76312, "[%s]" S:0x3e53b8 / "" S:0x3e53c0; research 269 §5.2's finding), the final screens (`FUN_002256f0` D:L76816),
the name tags (`FUN_002269a0` D:L77395), the round's speaker line (`FUN_00238ac0` D:L85681, "[%s] %s" S:0x3e6718), the
game lobby's talker bar (D:L125670), the spectator HUD's info box (`FUN_00238500` D:L85560, "[%s] %s" S:0x3e6718;
research 282 §4 -- added at the review: the port's `hud.ts` draws the followed player's name alone), and `FUN_00215c10`
(D:L70191) and `FUN_002425e0` (D:L90262), not read here. The
game lobby's lists read +0x2e directly (`FUN_002c5010` D:L166107). One source for all: what the room's rows carry is what
each of them would draw.

## 2. The port

### 2.1 The server: the tag at the seat, on the room's score rows

- **The tag** is the server's, never the page's (OT.R26: no page names another's or its own): `seatClanTag(store,
  account)` (`clans.ts`) -- the account's standing clan (`clanId`, not disbanded), its stats' C string at +15 (`clanTag`,
  SVC-08's), cut to `SEAT_CLAN_TAG_CHARS` 15 (§1.3); no clan, a disbanded clan or an empty tag, "".
- **When**: the bridge reads it at each seat's `seated` (a game's seat: the hello's account, `bridge.ts`'s `seatFor`) --
  the original's "once, at the state's creation" (§1.2); a takeover or a rejoin seats again and reads again, as a new
  state is made. It hands it to the room (`Room.tellClan(seat, tag)`), as SEAT-TOLD's `tellSeats` hands the medals
  (research 264 §2): the room keeps it by seat (dropped with the seat) and, when it changes a player's row, sends every
  socket the score again.
- **The rows**: `scoreEvent` puts `clan` on a player's row when the seat's tag is non-empty, and no field otherwise.
- **The protocol**: `ScoreRow.clan?: string` is additive and optional, in a JSON text frame; a row with no tag is the
  older shape exactly, and an older page's spread carries the extra field without reading it. **No version bump**
  (COLLABORATION, "Protocol N"; `PROTOCOL_VERSION` stays 11), and nothing of PAR-74's hold field is touched.
- **`/testroom`'s map rooms**: our page's maps hello carries no ticket (`net/client.ts`: the ticket only with a game), so
  every seat there is a guest's and carries no tag -- the test room's guests: none. A ticketed maps' hello (HARD-SEAT's,
  which no page of ours sends) is told none either: the bridge's `mapSeat` is not given the room.

### 2.2 The page: the board and the round's lists

`NetPage`'s `score` hands the rows to the HUD whole (`{ ...r, self }`), so `ScoreRowInfo.clan` -- ONL-19's drawing,
unchanged -- draws "[tag]" at 163 in (128, 64, 32) and the seed's space for a row without; the round screens' rows are the
same rows (`roundScreen`'s `this.rows`), so the round's lists draw `"[%s]"` too (`FUN_00224210` D:L76312, the same
source, §1.5). No page code changed for either; `scoreboard.ts`'s doc says where the tag comes from now.

### 2.3 The round's speaker line

`FUN_00238ac0`'s line takes the holder's slot's tag from the same lookup (D:L85681): "[tag] name", the name alone with
none (D:L85686-85691). `voiceHudFrame` now reads it off the talker's score row (`clanOf`, `hudVoice.ts`), the rows the
mounts already hand it (`page.rows`, `main.ts` / `matchMount.ts`, unchanged). A talker with no row -- a spectator, whom
the rows never name (`SEAT_TOLD_PLAYERS_ONLY_READING`'s rule) -- takes none.

### 2.4 `TALKER_CLAN_PARKED_READING`, narrowed (retired 2026-10-15 by AD-13, §5)

Research 227 §3's reading said the speaker's line and the game lobby's bar both take no tag, the room's seats carrying
none. The round's line now takes the rows' tag (§2.3). **The game lobby's bar and its lists' tag column still take none**:
their seats are the bridge's `gameLobby` message (`GameLobbySeat`, `@s2u/ui` `gameLobbyCommands.ts`), a protocol field
outside this row's claim (its brief: `ScoreRow` and the score event only). The reading stays, narrowed to the lobby
(`gameLobbyCommands.ts`'s doc, research 227 §3's row, research 101 §5's row). *Retired 2026-10-15 by AD-13 (§5 item 5):
the room's `seatClans` carries each seat's tag to the lobby's bar and lists.*

## 3. Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `CLAN_TAG_AT_SEAT_READING` (server `clans.ts`) | `'the account\'s standing clan\'s tag as the server holds it when the seat is taken'` | the console's own `Clan_Description` copied into its published state's +0x2e when the state is made at the game's join (`FUN_002c5450` D:L166281-166293, §1). The two differ when the clan's tag changed after a member's last GetMyClans (his console holds the older tag until SOCOM II ONLINE's next build), and after a leader's disband in the same session (his " ", D:L186541, "[ ]" on the board; the port none, §1.4); *[2026-10-13, the clans' close]* and for a spectator: *[read 2026-10-15, SPECTATOR-CLAN-TAG, pending review]* the builder's one role test picks the team word only (D:L166237-166264) and the tag is written for a watcher as for a player (D:L166281-166293), so a talking clan-member spectator's speaker line is "[tag] name" on the other spectators' screens, round and lobby (`FUN_00238ac0` D:L85680-85690, `FUN_0027cbf0` D:L125668-125677), where the page drew his name alone (the score's `spectators` carry names only) until AD-13 told every seat's tag in the room's `seatClans` (§5 item 5, 2026-10-15; narrowed, the name kept, W40.R6) | ONL-32's transcript of a game joined by a member after his leader's tag change, by a leader after a disband, and by a clan member as a spectator; its capture of the board with SELECT held | reading |

`TALKER_CLAN_PARKED_READING` is research 227 §3's row, narrowed there (2026-10-13) to the game lobby's bar and retired there
(2026-10-15, AD-13: the lobby reads the room's `seatClans`). The names this
note leans on are listed where they live: `CLAN_TAG_OVERRUN_READING` (research 269 §5.6: a tag of 14 or 15 characters
now reaches the board when a stats record holds one -- the leader's keyboard caps it at 3, research 272 §6),
`SEAT_TOLD_PLAYERS_ONLY_READING` (research 264 §6).

## 4. The tests, and the runs (unit tests and the room over the fixtures; no browser, no capture)

- `packages/central/test/bridgeClanTag.test.ts` (new): `seatClanTag` -- a leader's and a member's tag, none for an account
  in no clan or no account, an unposted clan's empty tag, a disbanded clan's none, the cut at 15; over the fixtures' MP72
  (skips without them), a lobby-created game: the leader's and a member's rows carry the tag on every socket, a player
  without one carries no field, the tag read at the seat (the leader's later post not on the rows); a watcher's join
  makes no row and hears the players' tags.
- `packages/viewer/test/clanTagRound.test.ts` (new): the protocol's additive field (the version 11, the untagged row's
  older shape, a tagged row read for the older fields; the page hands the HUD the same rows but the tag); the page's board
  from a `score` over the page's own handling -- "[NSW]" at 163 and the untagged row's seed; the round's speaker line from
  the rows (tagged, untagged, a spectator talker).
- Run again for the changed sources read as text: `hudVoice.test.ts`, `voiceLate.test.ts`; the two ledgers.
- The runs and their counts: the task's report (RED, then GREEN, one file per run).

## 5. What is left

- ~~**The game lobby's tag** (`TALKER_CLAN_PARKED_READING`, narrowed): the bar's tag and the lists' tag column, from a
  `GameLobbySeat` field the bridge's `gameLobby` message carries -- a protocol change outside this row.~~ *Built
  2026-10-15 by AD-13 (item 5 below), from the room's `seatClans`, not a `GameLobbySeat` field; the reading retired.*
- **The name tags** (`FUN_002269a0` D:L77395) and the final screens' tag (`FUN_002256f0` D:L76816): the same source; not
  read here.
- **The spectator HUD's info box** (`FUN_00238500` D:L85560): the original draws "[tag] name" for the followed player
  (S:0x3e6718); the port's `hud.ts` draws the name alone -- reachable now the rows carry the tag (the review's F1); a
  later row's, with `FUN_00215c10` (D:L70191) and `FUN_002425e0` (D:L90262), still to read.
- **A spectator's own tag:** `FUN_002c5450` has no role test (D:L166218-166312), so a clan member watching as a
  spectator likely publishes his tag and his speaker line reads "[tag] name"; the port gives a spectator none (the
  room's rows are the players'; the review's F2) -- named in `CLAN_TAG_AT_SEAT_READING`. *Read 2026-10-15
  (SPECTATOR-CLAN-TAG, the clans' finish wave 5; the decompilation and the pinned scripts re-read at every line cited,
  by its author; source inspection, no test run, nothing measured running; reading, pending review): **a gap, on one
  surface the port draws** -- a talking spectator's speaker line on the other spectators' screens.*
  1. *The state is made for a watch, and the tag is in it.* `FUN_002c5450`'s one role test, `FUN_002f6d00`
     (D:L166238), sits in the host's branch (D:L166237-166264) and picks the team word only -- a spectator's 0x10000
     (D:L166260-166262); the tag's write (D:L166281-166293) follows it with no test. A watcher's console makes its state:
     WATCH GAME's `join_game` runs the same `aux_join_game` as JOIN GAME (P:L4549-4558) and its `do_join` calls
     `JoinGameServer` (P:L4687) = `FUN_0027e380`, whose one team test refuses a word of 0 (D:L126419-126421; its other
     refusal, `FUN_002b83e0` failing at D:L126415-126418, is the session's setup, no role test)
     -- a watcher's is 0x10000 from the host's side-3 reply (`FUN_002b9150` D:L159275-159276, D:L159342-159343) -- and
     calls `FUN_002b7a20` (D:L126422), the state's maker (D:L158502-158506); a late watcher's is made at the level's
     load (`FUN_001f5e70` D:L55724, before its spectator test D:L55725). The state goes into the watcher's own slot of
     `DAT_004414c4` (D:L166295-166303) with his team word (D:L166297). "No role test" is exact for the tag, not for the
     function.
  2. *Every reader a spectator's state reaches* (the nine `FUN_002c3ac0` callers of §1.5 and `FUN_002c5010`):
     - **The speaker line** (`FUN_00238ac0` D:L85680-85690) and **the game lobby's talker bar** (`FUN_0027cbf0`
       D:L125668-125677): the floor holder's slot (the voice object's +0x70 table), its name (`FUN_002c3a70`
       D:L165183-165201) and tag, no role test: "[%s] %s" (S:0x3e6718; the bar's `#C`-coloured one S:0x3ef310, research
       227 §1.1). **Shown**, on the
       screens of those listening on his channel and holding none of it (`FUN_0030e790`) -- the other spectators only,
       a spectator's channel being 10 (`VOICE_SPECTATOR_CHANNEL_READING`, research 225 §6); never on a player's, never on
       his own. The info box that carries the line is shown for a spectator (research 282 §1, `FUN_001f9160`).
     - **The info box's name** (`FUN_00238500` D:L85558-85568): the viewed actor's tag, no own test. In free and scenic
       the viewed actor is the spectator's own object (the panel's own branch, `FUN_002425e0` D:L90231-90236; research
       282 §4), so the original draws **his own "[tag] name" on his own screen**. The page draws no own name there at all
       (`SPECTATOR_OWN_INFO_PLACEHOLDER`, research 282 §4, §6): the tag rides that placeholder, not this gap.
     - **The panel's title** (`FUN_002425e0`): another actor's "[%s] %s" (D:L90258-90272); the own object's is FREE
       CAMERA or the scenic view's (D:L90236-90256). **None.**
     - **The scoreboard** (A35): the team rows leave spectators out (`FUN_0022de60` D:L80603-80605); the SPECTATORS
       slots take the name (+0x14) alone, no lookup (`FUN_0022cc10` D:L80036-80038). **None**; A35 unchanged.
     - **The round's lists** (`FUN_00224210` D:L76271-76288) and **the MVP** (`FUN_002256f0` D:L76800, D:L76843-76854):
       the walker's `FUN_001f1e40` passes non-spectators only (D:L53560-53574), then a side test on the slot's team word
       (`FUN_002c30b0` / `FUN_002c31d0`, D:L164685-164701, D:L164746-164762). **None.**
     - **The name tags** (`FUN_002269a0` D:L77376-77380): a spectator's actor is hidden and inactive from its spawn
       (`FUN_002b7d60` D:L158646-158647 -> `FUN_00543d50` D:L410440-410441), and 0x10000 shares no bit with a side's
       word (research 329 R329.2) -- the team mask excludes a player looking at a spectator (D:L77378), while for one
       spectator looking at another both masks are 0x10000 and the hidden, inactive body test alone excludes him
       (D:L77379; the review's low, 2026-10-15). **None.**
     - **Another spectator's info box**: the jump skips spectators (`FUN_00294f40` D:L139407) and the cycle walks the
       living non-spectators (research 314 R314.6), so no one follows him. **None.**
     - **The game lobby's lists** (`FUN_002c5010` D:L166105-166158): the tag column's value is set on the two sides'
       lists only (D:L166107-166151); the SPECTATORS list takes the name (+0xe) alone (D:L166153-166157). **None.**
     - **The reticle's name** (`FUN_00215c10` D:L70189-70198): a walker's aim; whether its aimed actor (`FUN_005aa690`
       D:L463998-464010) can be a spectator's hidden, inactive actor is not read -- nothing read suggests it.
  3. *The port.* The bridge already reads a watcher's tag at his seat (`bridge.ts` `seated` -> `room.tellClan`, every
     seat) and the room keeps it for any member (`room.ts` `tellClan`); but `scoreEvent` puts it on the players' rows
     only, and the score's `spectators` is names (`protocol.ts`), so the page holds no spectator's tag and the speaker
     line (`hudVoice.ts` `voiceHudFrame`'s `clanOf`, from `rows`) draws his name alone. The lobby's bar draws no tag for
     anyone (`TALKER_CLAN_PARKED_READING`, §2.4) -- a spectator's comes with that row's `GameLobbySeat` field.
  4. *The follow-up row* -- *superseded 2026-10-15 by AD-13's design (item 5; web sprint 40's row, the owner's word): not
     a field on the score event.* The row as first filed (3 points; built separately, after the seat clears its hot files): the score event gains an
     additive, optional `spectatorClans?: { id: number; clan: string }[]` -- the tagged watchers only, absent with none,
     no version bump, as `ScoreRow.clan` (`packages/viewer/src/net/protocol.ts`); `scoreEvent` fills it from `clans`
     over `lobby.spectators()`, and `tellClan` marks the score dirty for a spectator too, where it does for a player
     only today (`packages/match/src/room.ts`, **hot**); the page keeps it from each `score` and answers a member's
     tag from the rows, then from it (`packages/viewer/src/netPage.ts`, **hot**); `VoiceHudSources` takes that answer
     for `clanOf` (`packages/viewer/src/hudVoice.ts`), handed in by the two mounts (`packages/viewer/src/main.ts`,
     `packages/viewer/src/matchMount.ts`). Tests: server `bridgeClanTag.test.ts` (a tagged watcher on the field, an
     untagged one absent, the field absent with none), viewer `clanTagRound.test.ts` (its spectator talker's case
     flips to "[tag] name") and `hudVoice.test.ts`. Not in it: the lobby's bar (`TALKER_CLAN_PARKED_READING`'s row)
     and the own info box (`SPECTATOR_OWN_INFO_PLACEHOLDER`'s).
  5. *Built 2026-10-15: AD-13* (the clans' finish wave 6b, web sprint 40's row folded; C30, C49, C94; **reading, pending
     review** -- the source read is efbd122ab's, reviewed; the build's own review owed). **One additive transport for the
     account at its seat**, not a field on the score and no row made for a watcher: the room's `seatClans` (`protocol.ts`,
     protocol 11 kept) -- the whole set of the seats with a tag, players' and watchers' alike, told by `Room.tellClan` at
     every change to every connection and the recording, and to a seat alone at its own seat when its own changes nothing;
     a tagged seat's leave tells the set again (its id is the next seat's, `freeId`). **Its audience is every connection,
     the other side's included** (the gameplay seat's review item): the same tag `ScoreRow.clan` already carries to every
     page, and the original's state is public -- every console holds every slot's +0x2e (`FUN_002c5450`
     D:L166281-166293, read by `FUN_002c3ac0` D:L165206-165222; §1.1). **The recording carries it** (`broadcast`); the
     fold classes it transient. **Its order** (the merge controller's condition 1): `Room.hello` puts the connection in
     `conns` (`room.ts` :1617) and sends its welcome (:1646) in one call, and the bridge's `seated` -> `tellClan`
     (`bridge.ts` :500) runs only after `hello` returned (`server.ts` :1095), so no `seatClans` reaches a connection before
     its welcome. **A re-attach** (condition 2: a page's retry, a takeover of its seat) gets the current set at once: a
     takeover of a tagged seat tells the set again without the older id as it frees it (`release`, as `leave` does; the
     fresh review's F2, fixed 2026-10-15), and the bridge seats the new id, whose `tellClan` either tells the whole set
     again (a tagged seat) or sends it the set alone (an untagged one) -- **an empty set too** (the review's F1, fixed
     2026-10-15: a page keeps its last set through a drop, so a retry seated on a freed id that had a tag would otherwise
     draw that tag): every untagged joiner is told exactly one `seatClans` at its seat, to it alone, never recorded; an
     empty set clears the page's board, the lobby's lists and the speaker line's tag. The page keeps it (`net/seatClans.ts`
     `SeatClanBoard`, `NetClient.clans`; the replay's client too, transient in the fold: nothing in a replay draws it). Its
     readers: the round's speaker line (`VoiceHudSources.clanOf`, the told tag, then the row's: a tagged watcher's "[tag]
     name" on another spectator's line, `FUN_00238ac0` D:L85680-85690; never on a player's -- channel 10 is the
     spectators', `VOICE_SPECTATOR_CHANNEL_READING`); the game lobby's talker bar (`FUN_0027cbf0` D:L125668-125677,
     `talkerBarText`) and its side lists' clan cell, keyed `"[%s]"` (S:0x3f2a70; the ELF's `addiu a2,s2,46` at 0x2c50ec
     passes the state's +0x2e to the sprintf at 0x2c510c, D:L166111, an argument the decompilation drops) or "" (S:0x3f2a30)
     in (128, 64, 32) (D:L166093-166096; `GAME_LOBBY_CLAN_TAG_COLOR`), the SPECTATORS list the name alone
     (D:L166153-166157). `TALKER_CLAN_PARKED_READING` retired (research 227 §3); `CLAN_TAG_AT_SEAT_READING` narrowed (§3).
     Tests: server `seatClans.test.ts`; viewer `seatClans.test.ts`, `clanTagRound.test.ts`; ui `gameLobbyClanTag.test.ts`,
     `medalOfMerit.test.ts` (unit tests; no browser, nothing measured running). Left: the own info box's tag rides
     `SPECTATOR_OWN_INFO_PLACEHOLDER` (research 282 §6), now reachable from the board; the proven level is ONL-32's.
- **The proven level**: ONL-32's capture of an online round with SELECT held and a tagged member (the board's "[tag]",
  `CLAN_TAG_OVERRUN_READING`), and its transcripts that settle `CLAN_TAG_AT_SEAT_READING`.
