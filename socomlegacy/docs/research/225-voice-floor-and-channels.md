# 225 -- The voice floor and the channel function on the room (SVC-20a)

Written 2026-10-08 for SVC-20a of web sprint 20 (`agent/online-svc20a`, from `agent/online` 303fc67c7), on the plan
`../plans/2026-10-08-web-sprint-20-voice.md` (constraints 3, 4 and 7; rulings W20.R4, W20.R5, W20.R6) and its brief
`../plans/briefs/2026-10-08-s20-w1-svc-20a.md`. It transcribes research 170 §2 (the floor), §3 (the channels) and its
corrections C1-C3 into the room's pure state. Its author re-read nothing in the decompilation: every `FUN_` / `D:L`
below is research 170's cite carried with its rule, or -- marked *(review)* -- a line the fresh review of 2026-10-08
re-read at the source and gave in its findings F1-F5, carried as given. The code: `packages/match/src/voiceFloor.ts`
(new). The tests: `packages/match/test/voiceFloor.test.ts` (new, 39 rows, one per rule, each named by its cite, on
the test's own clock). No game or emulator was run; no server was contacted (R293); nothing of the disc was read.

Confidence: **reading, pending review** for every rule below -- transcribed from research 170 (itself a reading, its
cited lines re-read 2026-10-04 for C1-C3) and from the review's re-reads, unit-tested against the transcription, and
never measured against the original running (the two-instance run of research 170 §11 is owed). The first review
(2026-10-08) re-read the cited lines and found two rules wrong (F1, F2) and three smaller points (F3-F5); this text is
the fix round's, and its second review is to come.

## 1. The floor table (research 170 §2.1-§2.3)

The room is the original's game host (170 §2.1, "On our server"; research 159 R159.7). `VoiceFloor` keeps the host's
table and, unlike the original, each member's talk flag (the want) and current channel, because the page only says
talk on and talk off (constraint 4).

| rule | the original | ours | test |
|---|---|---|---|
| twelve entries, one per channel 0-11, each `{owner, expiry}`, free = 0x100 | `voice+0x70`, read by channel (`FUN_0030e790` D:L210828-210842; R170.2) | `holder(c)` is the entry (frozen) or `null` | `FUN_0030e8e0 / FUN_0030e790` |
| type 1, request: granted only into a free entry, owner the sender, expiry now + `voice+0x34` | `FUN_0030e8e0` D:L210896-210964 | `talkOn(member, channel, now)` asks at once; the owner is the room's member id, never a byte of a message (170 §2.1's review box) | `FUN_0030e8e0 type 1` |
| a request into a held entry is simply not granted, no refusal; the client re-asks every 1 000 ms while held, once the time has strictly passed | R170.3, R170.4; D:L211126, D:L211198, D:L211186-211199; `due < now` D:L211182 *(review, F4)* | the want is kept on the server; `sweep(now)` re-asks each wanting member once `VOICE_FLOOR_RETRY_READING` has strictly passed since its last ask, on the server's clock (OT.R27: the original's rule, our clock). A repeated `talkOn` while the same want is on asks nothing (a modified page cannot re-ask faster) | `R170.3/R170.4`; `a repeated talk on` |
| no queue: the first to re-ask after a release wins | §2.2 | the due retries are tried earliest first; a fresh press asks at once and may win before a waiter's retry -- but not the releasing member's own press inside `VOICE_TALK_LOCKOUT_MS_READING` (the row below; *added 2026-10-08, the close review's F1: this read "a fresh press after a release ... may win", which let a modified page keep a floor by cycling off / on*); equal times go in the order the wants were made (ours: the original's two clients never share a clock) | `no queue`; `the tie` |
| the talk input's lockout after a talk's end | the TeamCommand timer `+0xdb4`: route B's end sets 1.0 s (`DAT_003dcb08`, `FUN_00236a50` at D:L83910), route A's 0.3 s plus that 1.0 s (D:L84677-84690); while it runs no talk starts (research 170 C6; the page's `VOICE_TALK_LOCKOUT_READING`). The game lobby's CIRCLE has none (`LOBBY_TALK_BUTTON`) | W20.R5 on the server (the close review's F1, 2026-10-08): a member's own `talkOn` inside `VOICE_TALK_LOCKOUT_MS_READING` (1 000 ms, the smaller route's) of its flag's end -- its `talkOff`, or a `setChannel(m, c, now)` that ended a want or a hold (RADIO OFF and back, the lobby ARMORY's OFF and its return) -- asks nothing: its want is kept, due at the window's end, and the sweep grants it once that has strictly passed if the entry is free; a waiter's 1 s retry, due no later, wins first. An honest round page never meets it; an honest lobby page re-pressing inside 1.0 s of its release waits until then (ours, a hardening, OT.R26). `drop` forgets it | `the close review's F1 ...` (six rows); `FUN_0030e8e0 type 2` |
| one channel, one hold a member | the voice object has one channel, `voice+0x24` (170 §2.1) | a holder's `talkOn` on another channel releases its entry and asks there | `one hold a member` |
| type 2, release: frees the entry only when the owner matches | D:L210913 (the original takes the message's client byte) | `talkOff(member, now)` frees only the member's own entry (the connection's identity) and clears its want | `FUN_0030e8e0 type 2` |
| types 3 (set unchecked, D:L210934) and 4 (clear) | §2.1's table | not in the API: only `talkOn` sets an owner; only `talkOff`, `sweep`, `clearAll`, `drop` and `setChannel` free one; the entry handed out is frozen | `types 3 and 4` |
| the sweep: an entry past its expiry freed every tick | D:L211271-211300 | `sweep(now)` frees past the cap (below) or the expiry, then re-tries the due wants; returns the channels whose entry changed (freed or granted), ascending, for the relay to tell (W20.R6) | `the sweep (D:L211271-211300)` |
| the times: recording cap `voice+0x30` = 10 000 ms, host expiry `voice+0x34 = +0x30 + 5000` = 15 000 ms | D:L158881, D:L211217; `FUN_00310080` D:L211751-211753 | `VOICE_FLOOR_HOLD_READING` `{recordMs, expiryMs}` | `FUN_00310080 D:L211751-211753` |
| the round's start clears all twelve | `FUN_0030e7f0` D:L210844-210892, called at D:L55846; before it, each non-late joiner's talk flag is cleared, `FUN_0030e6e0(voice, 0)` at D:L55845 *(review, F3)*, after his base-0 set | `clearAll()` frees the table only; the flags are the caller's: SVC-20c calls `talkOff` for each non-late joiner there (§5) | `FUN_0030e7f0` |
| a leaver's hold | §2.3 "Leaving": the object closes, the host's expiry frees the entry | `drop(member)` frees it **at once** and forgets the member's want, hold-off and channel (OT.R27: our room knows the connection closed; nothing the other players see changes but an earlier free) | `"Leaving"` (two rows) |
| the honest page's caps on the server | R170.3: the client's cap (D:L211217) and state 4 (D:L211257-211265; its exit strictly past, D:L211262 *(review, F4)*); C6's 20 s resume (D:L211255-211263) | W20.R5: the sweep cuts a hold when `now > grant + recordMs` (from the grant, not the expiry) and holds the owner off `VOICE_CUTOFF_LOCKOUT_READING` from that sweep; no grant to it until that has strictly passed, by a press or a retry; a want still on then is re-tried -- the 20 s resume; others may take the floor in between. The hold-off survives `setChannel` and `clearAll` (it is the voice object's state 4, not the flag) | `W20.R5 ...` (three rows) |
| a channel change ends a hold | `FUN_0030fcd0` D:L211574-211599 clears the talk flag only when the new channel differs from the current one, or the library's query fails (D:L211589-211590 *(review, F1)*) | `setChannel(member, c)` releases the member's entry and clears its want only when `c` differs from the member's current channel (the last set, or the last `talkOn`'s); a set to the same channel changes nothing -- a talker on TEAM who re-picks TEAM keeps his hold. A member with no channel yet counts as a change; the failed query has no counterpart | `FUN_0030fcd0 ...` (two rows) |
| RADIO OFF ends a hold every time | `FUN_0030e490` D:L210662-210688 clears the flag at every call (D:L210683 *(review, F1)*) | `setChannel(member, 11)` always clears | `FUN_0030e490 D:L210683` |
| no talk on 11 | `FUN_0030e6e0` D:L210785-210796 refuses the flag on 11 | `talkOn(member, 11, now)` asks nothing and keeps no want | `FUN_0030e6e0` |

**The expiry is the backstop, not the first to fire.** With W20.R5's cut at 10 000 ms after the grant, an entry is
always freed by the cut before its 15 000 ms expiry; the expiry is kept on the entry and in the sweep as the original's
field (170 §2.3: "a floor whose holder vanished"), and a sweep later than both frees it with the cut's hold-off.

## 2. The channel function (research 170 §3.1, C1-C3)

`channelOf(ask)` is `FUN_002c2c20` (D:L164422-164461; `VOICE_CHANNEL_MAP_READING`) taken literally: one ask, its input
the base asked and the member as the function reads him at that moment -- `{base, actorDead, spectator, team}`. Which
base is asked, and when, is not in it: those are the callers' rules (§5). In order:

1. a base no caller asks (anything but 0, 1, 2, 3, 9, 10 and 11) is refused with a `RangeError`;
2. **11**, radio off, is returned as it is: `FUN_0030e490` sets 11 directly (D:L210680), not through `FUN_002c2c20`
   (also the ARMORY, `FUN_0027d8c0` D:L126094-126102, and the session's start, D:L158882);
3. a member whose in-world actor exists and is dead (`+0xe1` bit 4 clear) has his base replaced by **3**, at every
   ask, whatever base was asked and whatever the game (D:L164432-164435 *(review, F2/F5)*;
   `VOICE_DEAD_CHANNEL_READING`). There is no respawn test here: C3's condition decides whether a death asks at all
   (§5). The test runs before the base-9 exemption (170 §3's review box), so a dead actor asking 9 is put on 3 (or 7);
   the game lobby has no in-world actor, so its caller passes `actorDead: false`;
4. a spectator has his base replaced by **10**, after the dead step, whatever was asked (D:L164437-164440 *(review,
   F5)*; `FUN_002f6d00` D:L196203-196216; `VOICE_SPECTATOR_CHANNEL_READING`);
5. unless the base is now **9** (the game lobby's, asked by `FUN_0027c9f0` at D:L125568 *(review, F5)*), the
   Terrorists' team word ORs **4** (C2, D:L164449-164458; OR as `FUN_0030fcd0` D:L211588; `VOICE_SIDE_BIT_READING`):
   SEALs 0-3, Terrorists 4-7. A spectator's team word is exactly 0x10000 (C2), so he takes no bit;
6. a result above 11 is refused with a `RangeError` (170 §3's review box, `:202-206`): 10 ORed with the side bit is
   14 -- a spectator flag on a Terrorist team word, or a living Terrorist asking 10. The test walks every input and
   finds exactly 0-7, 9, 10 and 11, and the thirteen 14s refused.

**An unread guard.** The side bit has a second condition, `voice+0x4d == 0` (D:L164454 *(review, F5)*), a byte only
ever zeroed at the voice object's start (D:L211836 *(review)*); the file's other `+0x4d` writes are not attributed (*review, F12*). It is read as always
passing, so the code has no input for it; what would ever set it is not read.

The base the radio asks is the ACTIVE CHANNEL -- 0 TEAM, 1 DEFENSE, 2 OFFENSE (C1, `FUN_002344e0` D:L83791-83792,
`FUN_0022f950` D:L81576-81592; `VOICE_OFFENSE_DEFENSE_NUMBER_READING`) -- validated 0..2 as `FUN_0022f950` does
(W20.R4): the page's request is checked by the room before it asks (SVC-20b-relay / SVC-20c); `channelOf` refuses only
what no caller asks.

## 3. Who hears whom (research 170 §3.2, R170.6)

`hears(listener, speaker)` takes two channels: exact equality (`FUN_0030f7e0` D:L211395-211449, the compare at
D:L211408), and false on 11 (nothing is relayed on radio off; `FUN_0030e6e0` D:L210785-210796). No distance enters
(R170.6). The slot mute (D:L211411-211415) is not here: OQ-8, SVC-20c.

The test walks every row of 170 §3.2's table as sequences of asks: the lobby's players and its spectators (9 asked);
a living player on TEAM after the round's start asks 0, and on OFFENSE or DEFENSE after the radio asks 2 or 1; a
classic death, whose 0x22 asks 3 (his side's dead only, not heard by the living); the respawn case (C3: the death
asks nothing, so the SEAL keeps his living channel and his side's living still hear him -- but a radio re-pick while
dead asks, and the dead step puts him on 3); a ghost, whose death asks 3 and whose 0x23 asks 3 again while game
`+0xd2` is set (D:L497737 *(review, F10)*), so he stays on 3; a spectator in the round (RADIO ON asks 10); radio off, which hears nobody and is
heard by nobody, not even another on 11.

## 4. The relay (SVC-20b-relay)

Written 2026-10-08 for SVC-20b-relay of web sprint 20 (`agent/online-relay`, from `agent/online` 7c9ee7c31), on the
brief `../plans/briefs/2026-10-08-s20-w2-svc-20b-relay.md` (the plan's constraints 3, 4, 5 and 7; rulings W20.R1, R2,
R4-R8, R13). The room is the original's game host (170 §2.1, "On our server"): it keeps one `VoiceFloor` (§1), each
member's channel (§2), and relays a frame only from the holder of its channel's entry to that channel's other members.
The code: `packages/match/src/room.ts` (the section "the voice relay"; `binary`'s voice branch; the `voiceTalk` and
`voiceRadio` cases of `text`; the asks in `hello`, `broadcastChanges`, `ready`, `abandon` and `startRound`; the floor's
`drop` in `drop`; the sweep in `step`), `server.ts` (the connection's `sendLossy`), `limits.ts` (`sendLossy`,
`VOICE_BACKLOG_SKIP_PLACEHOLDER`), `packages/viewer/src/net/protocol.ts` (the three events) and `packages/viewer/src/netPage.ts`
(the `voiceFloor` hook, for SVC-20b-page). The tests: `packages/central/test/roomVoice.test.ts` (new, the brief's RED 1-10),
`roomWire.test.ts`'s rewritten drop case; `roomJoin.test.ts` and `replayRecorder.test.ts` now expect the joiner's
`voiceFloor` among its per-member sends. No game or emulator was run, no server contacted (R293), nothing of the disc read.

Confidence: every original rule below is §1-§3's and §5's reading carried, cited where it was read (**reading, pending
review**); the relay's caps, its lossy send and its wire are ours (OT.R27), named placeholders (§6). Nothing is measured
against the original running.

### 4.1 A frame's path (`Room.binary`, `voiceFrame`)

| step | the rule | source | test |
|---|---|---|---|
| 1 | the connection is heard (the watcher's clock, `idle`); a seated player's `lastActive` is not touched | W20.R8 (research 224 §2.1); W20.R13 | RED 5 |
| 2 | a frame `decodeVoiceUp` refuses, or a non-member's, is dropped: no strike (`true`) | V-WIRE's decoder | RED 4; `roomWire` |
| 3 | over `VOICE_FRAME_BYTES_MAX_PLACEHOLDER` bytes, or with no token in the connection's bucket (`VOICE_FRAMES_PER_S_PLACEHOLDER` a second, `VOICE_FRAMES_BURST_PLACEHOLDER` at most), is a strike (`false`; the server strikes on it, `server.ts:753`); the socket's own caps stay (4096 B, 120 binary frames a second, `server.ts:160-162`) | constraint 4 | RED 4 |
| 4 | a sender that does not hold its own channel's entry (`holder(channel).owner`) is dropped, no strike -- on 11 nobody ever holds | constraint 4; `FUN_0030e6e0` D:L210785-210796 (§1) | RED 2, 4, 8 |
| 5 | the room's frame is encoded once, its speaker the connection's id (never a byte of the page's), and sent to every member whose channel hears the sender's (`hears`: equal, never 11), the sender aside, through the connection's lossy send (`Conn.sendLossy`; a connection without one -- the page's loopback, a fake -- takes `send`) | W20.R2, R170.6 (§3); constraint 3 | RED 1, 7, 9 |
| 6 | nothing else: no `broadcast`, no `opts.recorder` method, nothing kept past the call | constraint 5 | RED 6 |

The order is the brief's: a malformed frame is a drop before the caps, so a page flooding malformed frames meets only
the socket's 120 a second and 4096 bytes. A frame without the floor is counted by the bucket (the caps come first).

### 4.2 The page's requests (`text`)

- `voiceTalk {on}`: `talkOn` / `talkOff` (§1) on the member's own channel -- the only floor requests (constraint 4).
- `voiceRadio {on: false}`: RADIO OFF, the member on 11 and its flag cleared (`FUN_0030e490` D:L210680, D:L210683).
  `{on: true}`: RADIO ON asks 0, 10 for a spectator (`FUN_0022f880` D:L81543). `{active}`: the ACTIVE CHANNEL asks 0, 1
  or 2, validated 0..2 as `FUN_0022f950` does (D:L81576-81592; W20.R4), and is remembered (`+0xc4`, `VoiceSeat.active`,
  for SVC-20c's return to life) only when the base the channel function reached is still 0..2 -- not a dead actor's 3
  nor a spectator's 10 (`FUN_0022f950` D:L81585-81588; the base `voice+0x2c` as `FUN_0030fcd0` stores it, D:L211584;
  the review's F2, 2026-10-08; the test "F2 of the review"). Anything else -- `active` 3, -1, 1.5 or '1', both fields,
  neither -- is dropped.
- **In the game lobby** (the room's `waiting` phase, the launch's load hold included) `voiceRadio` is dropped: the
  radio's rows are the round's HUD and are not drawn in the lobby (the brief's reading of the ask table, §5; the lobby's
  ARMORY and its return are the lobby's own asks, §4.3). From a seat in its ARMORY it is dropped too (ours: the seat sits
  on 11 until it leaves the screen, and its return asks; the original's ARMORY is the lobby's, where the radio is not).
  *Narrowed 2026-10-08 (the close review's F2):* the menu's lobby seat never sets `Player.arming` (the game socket
  carries no `armory`), so the lobby's ARMORY reaches the room as the page's two `voiceRadio`s, sent by `GameLobbyVoice`
  as the valve `GoneToArmory` goes 1 and 0 (note 227 §1), and in the waiting phase the room takes exactly these
  (`Room.voiceLobbyArmory`): `{on: false}` from a seat not off -- its entry: `FUN_0027d8c0` clears the flag (D:L126098)
  and sets RADIO OFF (`FUN_0030e490`, D:L126099), the seat on 11 and a held talk ended -- and `{on: true}` from that 11
  only -- its return: the lobby's `FUN_0027c9f0` asks 9 (D:L125568). Every other `voiceRadio` there is still dropped.

### 4.3 The asks this wave makes

| event | the room's ask | cite | test |
|---|---|---|---|
| a member's entry (its hello) in the game lobby | 9 (a spectator 10, by `channelOf`'s spectator step) | `FUN_0027c9f0` D:L125568 | RED 1 |
| a member's entry past the lobby (a dedicated respawn room -- `/testroom`'s, which has no lobby --, a launched game's in-progress joiner) | `VOICE_JOIN_IN_PLAY_BASE_PLACEHOLDER`, 0 (a spectator 10) | the round's start's base for a member who did not join late (§5); the late joiner's 3 is SVC-20c's | RED 10 |
| a promotion or a demotion (ours: W3.R13's queue) | as an entry | -- | -- |
| a seat in its ARMORY (`Player.arming`: its first seat, a promotion's) | 11 | `FUN_0027d8c0` D:L126094-126102 | RED 10 |
| back from the ARMORY (`ready`) | the remembered base again (in the lobby 9) | `FUN_0027c9f0` D:L125568 | RED 10 |
| the menu lobby's ARMORY (the page's `voiceRadio {on: false}` at `GoneToArmory` 1, `{on: true}` at 0; the waiting phase only; the close review's F2, 2026-10-08) | 11, a held talk ended; back, 9 | `FUN_0027d8c0` D:L126098-126099; `FUN_0027c9f0` D:L125568 | `roomVoice` "the close review's F2"; `gameLobbyVoice` RED 5 |
| the lobby's return (`abandon`: the room waits for both sides again) | 9 | `FUN_0027c9f0` D:L125568 | -- |
| the launch and every round's start (`startRound`) | every member asks 0 (a spectator 10), then every talk flag is cleared (`talkOff`, even on the channel he had), then the table (`clearAll`); each member told its entry once | `FUN_001f6660` D:L55842-55846; D:L55845; `FUN_0030e7f0` D:L210844-210892 called at D:L55846 | RED 9 |
| the radio | §4.2 | §5 | RED 8 |
| a leave (or a takeover's older connection) | `drop`: its entry freed at once, its channel's members told; no `setChannel` | 170 §2.3, "Leaving" (§1) | RED 3 |

A launch with a load barrier (`loadBarrierS`) leaves every member on 9 through the hold; round 1's start asks. Each ask
reads the member as `FUN_002c2c20` reads him at that moment: in a round, a seat whose body lies dead and has not
respawned (`Player.alive` false, `diedAt` set) is a dead actor, so an ask while dead meets the dead step (D:L164432-164435;
§5's "any later ask while the actor is dead") -- RED 9's radio re-pick puts a dead SEAL on 3; the game lobby has no actor
(`actorDead` false); a ghost seated late has never died this round, so it is no dead actor (which base a late joiner
asks is SVC-20c's, with OQ-7). Which room flag stands for the actor's `+0xe1` bit 4 is this task's reading of our room,
for SVC-20c's review with OQ-7.

**Not in this wave (SVC-20c's, §5):** the death's ask (event 0x22 without respawn or for a ghost), the return to life
(0x23 and game `+0xd2`), the side swap's re-ask, the late joiner's 3 at the round's start.

**The interim, stated:** a death asks nothing here, so a dead player stays on his living channel -- his side's living
still hear him, and he them (RED 9, "this wave a dead A keeps 0 and B still hears him"). That is what research 170 C3
reads for a respawn room's death (§5: with respawn nothing is asked); in a classic room the original's death asks 3, so
until SVC-20c a classic room's dead are heard by their side's living. And the other way (the review's F1): in a respawn
room a dead player who re-picks his radio is put on 3 by the dead step (RED 9's last rows) and, respawning alive, stays
on 3 -- hearing and heard by his side's dead only -- until his next ask, because the return to life's ask (event 0x23,
§5) is SVC-20c's. Listed for SVC-20c's tests in §5.

*(Superseded by SVC-20c, 2026-10-08: the death, the return to life and the late joiner now ask as §5's rows read, the
room's flags as §5.1 reads them, a round's start after the launch asks each seat's remembered `+0xc4`, not 0, and
clears no floor (§5, §5.1, SVC-20c's review F1, F6), and every death clears the talk flag, a respawn room's too (F5); `roomVoice.test.ts`'s RED 9 pins the rule -- a dead A in a classic room is on 3 and B
no longer hears him, in a respawn room A keeps 0 -- and `roomVoiceRound.test.ts` the rest.)*

### 4.4 The floor's sends (W20.R6)

`voiceFloor {channel, holder}` -- the member's own channel and its entry's holder (the room's id, or null) -- goes to a
member as a `send` when it moves channel or its channel's entry changes: after each request, ask, leave, round start
and each tick's `sweep` (the 10 s cut, the hold-off, the 15 s expiry, the 1 s re-ask; §1), the changes of one operation
collected and each member told once. A new member is told its entry after its welcome and its score. Never a broadcast,
so never recorded (constraint 5); a member on 11 is told `{11, null}` once, on its move.

### 4.5 The caps and the lossy send

- **The frame's size**, `VOICE_FRAME_BYTES_MAX_PLACEHOLDER` = 256 bytes: the honest page's frame is about 70 bytes
  (V-WIRE's RED 4: 68 up at four 15-byte packets); the Opus packet size at 6 000 bit/s is SVC-21's, not yet observed, so
  the cap has headroom (the brief's 256). Settled by SVC-20b-page's measured frame sizes.
- **The rate**, `VOICE_FRAMES_PER_S_PLACEHOLDER` = 25 a second into a bucket of `VOICE_FRAMES_BURST_PLACEHOLDER` = 25:
  twice the honest 12.5 (one frame each 80 ms, R170.12), and two seconds of frames at once after a line's stall; the
  bucket starts full at the entry. Settled by the page's measured cadence and a stalled line's burst (V-E2E).
- **The lossy send**, `VOICE_BACKLOG_SKIP_PLACEHOLDER` = 16 KiB: `limits.ts` `sendLossy` sends a voice frame unless the
  socket's `bufferedAmount` and the frame pass it, and then skips it -- never queued, never a close (`sendBounded`, which
  closes at `D9_SEND_BACKLOG_BYTES_PLACEHOLDER`'s 1 MiB, stays for everything else). 16 KiB is 0.4-0.55 s of a full
  room's snapshot stream (29.6-42.5 KB/s, research 224 §3), past which a frame would play that late. Settled by the
  page's jitter buffer (`VOICE_JITTER_MS_PLACEHOLDER`, SVC-20b-page) and a slow reader observed in V-E2E.
- **Their home.** The plan's constraint 4 and the brief put the two frame caps in `limits.ts` beside D9; they are in
  `room.ts`, beside the room's other server tolerances, because `limits.ts` imports `node:crypto` and the room is the
  page's own too (`packages/viewer/src/net/loopback.ts:1` imports it), so the room cannot import `limits.ts`. The backlog
  skip, read only by `server.ts`, is in `limits.ts`.
- **A follow-up, not this brief's (the review's F3):** a takeover (`Room.takeOver` -> `drop(old)`) forgets the old
  connection's floor state -- `VoiceFloor.drop` clears its 10 s hold-off (W20.R5) -- and the new id's bucket starts full,
  so a modified page that reconnects with its session token right after a cut can take the floor again at once. W20.R5's
  letter holds ("the same connection's next grant waits"); the original's host would grant such a client after the 15 s
  expiry at the latest. The fix carries the hold-off and the bucket across a takeover, keyed by the session token -- a
  `VoiceFloor` change (SVC-20a's module, closed to this brief). LATER 20.

## 5. The round (SVC-20c): the callers' event rules

What `channelOf` and `VoiceFloor` leave to their caller -- when a base is asked, which one, and what else the
original does at that moment. SVC-20c writes the room's half; the rules, as read:

| event | the original asks / does | cite | the room calls | test |
|---|---|---|---|---|
| the game lobby, on entry and after every return (`SETMENUSTATE`) | asks 9 | `FUN_0027c9f0` D:L125568 *(review, F5)* | `setChannel(m, channelOf({base: 9, actorDead: false, ...}))` | `roomVoice` RED 1, RED 10; `roomVoiceRound` RED 8 |
| the level's start (the launch; read as a new match's too, §5.1), a player who did not join late | asks 0; clears his talk flag (`FUN_0030e6e0(voice, 0)`, D:L55845 *(review, F3)*); the host clears the table; the level's 0x1f sets `+0xc4` to 0 | `FUN_001f6660` D:L55842-55846; `FUN_0030e7f0` D:L210844-210892; `FUN_002b7d60` D:L158626-158631, D:L497717-497719 *(SVC-20c's review, F1)* | `voiceRoundStart(true)`: `active` = 0, `setChannel(m, channelOf({base: 0, ...}))`, `talkOff(m, now)` (the flag is cleared even when 0 is the channel he had: the set alone would not, F1), then `clearAll()` | `roomVoice` RED 9; `roomVoiceRound` "F1 of the review" |
| a round's start after the launch (no level load between rounds, research 203 §11) | the actors' rebuild sends 0x23, which asks the remembered `+0xc4`; a ghost's flag is cleared between rounds with a 0x1f, which asks 0 and sets `+0xc4` to 0. Neither the talk flags nor the table are cleared: a hold ends only where an ask moves its holder (`FUN_0030fcd0` D:L211589-211590), and a held entry the original's host would free by its 15 s expiry (§1) | `FUN_00223680` -> `FUN_002a7d40` D:L75935 -> slot +0x4c D:L149744-149746 -> `FUN_00553e60` D:L419395 -> `FUN_00597f50` D:L454601-454602 -> D:L497733-497734; the ghost: `FUN_002232a0` D:L75846-75849 -> `FUN_00543b90` D:L410401-410403 -> D:L497717-497719 *(SVC-20c's review, F1, F3)* | `voiceRoundStart(false)`: a ghost's `active` = 0; `setChannel(m, channelOf({base: active, ...}))`; no `talkOff`, no `clearAll()` (`VOICE_ROUND_FLOOR_READING`, §5.1) | `roomVoiceRound` RED 4, "F1 of the review", RED 5, RED 7 |
| the round's start, a late joiner (game `+0xcc`) | asks 3, whatever the game -- at his own level start, the start of the round he joins (§5.1) | D:L55848-55849; `VOICE_LATE_JOINER_READING` | at his entry into a classic round in play (`voiceEnter`; `VOICE_LATE_JOINER_SEAT_READING`): `setChannel(m, channelOf({base: VOICE_LATE_JOINER_READING, ...}))` | `roomVoiceRound` RED 5 |
| the radio's ACTIVE CHANNEL | asks 0, 1 or 2 (validated 0..2), and keeps it in `+0xc4` | `FUN_0022f950` D:L81576-81592 | validate, remember, `setChannel(m, channelOf({base, ...}))` | `roomVoice` RED 8, "F2 of the review"; `roomVoiceRound` RED 1 |
| RADIO ON | asks **0** (10 for a spectator) -- not the remembered `+0xc4` | `FUN_0022f880` D:L81534-81553; the base 0 at D:L81543 *(review, F2)* | `setChannel(m, channelOf({base: 0 or 10, ...}))` | `roomVoice` RED 8; `roomVoiceRound` RED 4 (while dead) |
| RADIO OFF, the ARMORY | sets 11 directly; clears the flag every time | `FUN_0030e490` D:L210662-210688, D:L210680; `FUN_0027d8c0` D:L126094-126102 | `setChannel(m, 11)` | `roomVoice` RED 8, RED 10; `roomVoiceRound` RED 6 |
| a death | every online death of the player clears his talk flag, respawn or not (the actor's death `FUN_00547af0`, the player actor's vtable +0x58, D:L413092-413093 *(SVC-20c's review, F5; re-read)*). Then event 0x22 asks 3 **only when the game has no respawn (game `+0xdc` 0) or the player is a ghost**; otherwise no channel is asked: the channel is kept (C3), the hold is not. The 0x22 branch clears the flag again, `FUN_0030e6e0(voice, 0)` at D:L454486 *(review, F11)*, before it sends 0x22 | D:L413092-413093; D:L454484-454492, the test at D:L454485 *(review, F2)*; 0x22 D:L497729-497730 | `voiceDeath` at the end of `kill`, in a round: `talkOff(m, now)` always; then, without respawn (`VOICE_RESPAWN_RULE_READING`) or for a ghost (`VOICE_GHOST_FLAG_READING`), `setChannel(m, channelOf({base: 3, actorDead: true, ...}))`; with respawn no ask. On 11 too: `FUN_002c2c20` tests no radio state (D:L164422-164461 *(re-read)*) | `roomVoice` RED 9; `roomVoiceRound` RED 2, RED 3, RED 6 |
| a return to life | event 0x23 asks the remembered `+0xc4` -- **unless game `+0xd2` is set**, in which case it asks **3** (`FUN_002c2c20(3)` at D:L497737 *(review, F10)*), so the player stays on his side's dead zone and a side swap moves his block. `+0xd2` is a byte of the game object (`DAT_00437ce8`, D:L55835's `iVar3`), cleared at D:L55855 (and D:L75847); its setter is D:L55727 (§5.1; the review's other candidate, D:L115665, writes another object's `+0xd2`), not the player's. The sender sends no 0x23 while `+0xd2` is set (`FUN_00597f50` D:L454601 *(re-read)*), so its handler's 3 is not reached from it | D:L497732-497737, D:L497733-497737 *(review, F2)*; D:L55835, D:L55855 *(review, F2)*; `FUN_00597f50` D:L454598-454603 | `voiceRespawn` at the end of `spawn(p, 'respawn')`, in a round: when `+0xd2` is clear, `setChannel(m, channelOf({base: remembered, actorDead: false, ...}))`; else no call (the sender's test; the seat stays where the ghost's asks put it, 3) | `roomVoiceRound` RED 4 (the relay review's F1), RED 4b |
| any later ask while the actor is dead | the dead step puts him on 3 whatever was asked -- in a respawn game too, should he re-pick his radio while dead | D:L164432-164435 *(review, F2)* | nothing extra: `channelOf` does it from `actorDead` (`VOICE_DEAD_ACTOR_READING`) | `roomVoice` RED 9, "F2 of the review"; `roomVoiceRound` RED 4 |
| the side swap | the team word changes, so the next ask moves the blocks (C2) | D:L164449-164458 | the asks above, with the new `team`: the room's only side change is the game lobby's SWITCH TEAMS (`Room.switchTeam`, `FUN_002c4290`), on 9 (no block); the launch's start asks with the new side | `roomVoiceRound` RED 8 |

**OQ-7, open for SVC-20c:** which of the room's flags stand for the original's game `+0xdc` (respawn; V7 #8:
allow-respawn AND game mode 5), the ghost test of D:L454485, game `+0xd2` (the 0x23 hold on 3) and `+0xcc` (the late
joiner, C11) -- `opts.rules`, `seatsGhosts` -- is SVC-20c's reading, to be recorded here. The mute (OQ-8) is
deferred with SVC-17's ignore list. *(Answered as a reading by SVC-20c, 2026-10-08: §5.1.)*

**For SVC-20c's tests (SVC-20b-relay's review, F1):** in a respawn room, a dead player who re-picks his radio is on 3
(the dead step); on his respawn the return to life's ask (0x23: the remembered `+0xc4` while game `+0xd2` is clear) must
put him back on his living channel -- until SVC-20c wires it he stays on 3 (§4.3's interim). A test that kills, re-picks,
respawns and finds him on 0 (or `+0xc4`'s channel) belongs to `roomVoiceRound.test.ts`. *(Done: its RED 4.)*

### 5.1 What the room's flags stand for (SVC-20c; OQ-7)

Written 2026-10-08 for SVC-20c of web sprint 20 (`agent/online-svc20c`, from `agent/online` 455b35790), on the brief
`../plans/briefs/2026-10-08-s20-w3-svc-20c.md` (the plan's constraints 3 and 4; W20.R4, R6, R8, R13; OQ-7). The code:
`packages/match/src/room.ts` -- `voiceDeath` (the end of `kill`), `voiceRespawn` (the end of `spawn(p, 'respawn')`),
`voiceEnter`'s late joiner, `voiceRoundStart`'s clear of the ghost flag, `VoiceSeat.ghost`. The tests:
`packages/central/test/roomVoiceRound.test.ts` (new: RED 1-9 and 4b) and `roomVoice.test.ts`'s RED 9, rewritten to the
rule. This task's author re-read the lines marked *(re-read)* in the decompilation himself; every other cite is §5's. No
game or emulator was run, no server contacted (R293), nothing of the disc read.

Confidence: **reading, pending review** for each row -- the original's flag read at its source, the room's flag chosen
to stand for it; nothing measured against the original running (170 §10's two-instance run is owed).

| the original's | the room's | name | cite | a reviewer re-reads |
|---|---|---|---|---|
| no respawn: game `+0xdc` 0 (the respawn byte is "allow-respawn AND game mode 5", V7 #8, `170:64`) | `opts.rules === 'classic'`; a respawn room is a game with respawn. A menu game's room is always classic (`bridge.ts:446`); a dedicated room's rules are its own | `VOICE_RESPAWN_RULE_READING` | the death's test D:L454485 *(re-read)*; V7 #8 | that a respawn room stands for a mode-5 game with respawn allowed, and a classic room for every other |
| the ghost flag, game `+0xd2`: set at D:L55727 *(re-read)* in `FUN_001f5e70`, the level's frame once loaded, in the branch that finds `+0xcc` set (D:L55715), after the session's start (`FUN_002b83e0`, D:L55718) and only when `FUN_002c2fa0` -- `FUN_002f6d00(0x44f370)`, `JoinAsSpectator`'s query (D:L164599-164606 *(re-read)*) -- says no spectator; cleared at the next level start (D:L55855), in a respawn game right after the level's ghost set-up (D:L158642) and between rounds in the round's end state `FUN_002232a0` (D:L75846-75849 *(re-read)*), whose `FUN_00543b90` sends 0x1f (D:L410401-410403): it asks 0 and sets `+0xc4` to 0 (D:L497717-497719) *(SVC-20c's review, F3)*. The review's other candidate, D:L115665, writes `param_1[7] + 0xd2` among `+2`, `+0x36`, `+0x6a`, `+0x9e` (a table of 0x34-byte entries), not the game object | `VoiceSeat.ghost`: set at the entry of a seat the room makes a ghost (`seatsGhosts()`: a classic round in play -- a hello, a promotion, a takeover's new seat; the welcome's and the promotion's `ghost`, "You are a ghost.", `FUN_001f97b0` L57047-57097), cleared at the next round's start (`voiceRoundStart`), its ACTIVE CHANNEL forgotten and 0 asked (the 0x1f of the between-rounds clear) | `VOICE_GHOST_FLAG_READING` | the setter D:L55715-55728; the tests D:L454485 (a death asks 3), D:L454601 (no 0x23 sent), D:L497733-497737 (the handler's 3); the clears D:L55855, D:L158642, D:L75846-75849 | the between-rounds clear is the room's next round's start, not the round's end: no ask of the room falls between them for a ghost (a ghost has no body; a classic room has no respawn) |
| the late joiner, game `+0xcc`: set by `FUN_002a7340(game, 1)` when the join's reply finds the game in progress (`FUN_002b9150` D:L159282 *(re-read)*; an ordinary reply clears it, D:L159264); read at the level's start (`FUN_001f6660` D:L55842 *(re-read)*): set, it asks 3 (D:L55848-55849) and skips the 0, the flag's clear and the table's clear; cleared by the late joiner's first loaded frame (`FUN_001f5e70` D:L55716 *(re-read)*, the branch that sets `+0xd2`), also at D:L160946 and D:L150832 | a seat made in a classic round in play: its entry (`voiceEnter`) asks `VOICE_LATE_JOINER_READING`, 3, instead of `VOICE_JOIN_IN_PLAY_BASE_PLACEHOLDER` -- on our server his level start is his entry -- and the next round's start asks him 0, his `+0xcc` being clear by then and his ghost flag's clear between rounds sending a 0x1f (D:L75846-75849, D:L410401-410403; the review's F3). A respawn room's joiner is not mapped: the dedicated respawn room has no game lobby, so every seat of it joins its round in play; it keeps `VOICE_JOIN_IN_PLAY_BASE_PLACEHOLDER` | `VOICE_LATE_JOINER_SEAT_READING` | D:L159282, D:L55842-55849, D:L55716 | the order of the level's start (`FUN_001f6660`, which zeroes the state's `+0xd` at D:L55831) and the late branch of its frame (which needs `+0xd`, set once loaded at D:L55603 / D:L55658): read as start first, so the 3 is the late joiner's first ask and the next round's start asks 0 -- **the brief read "the next round's start asks 3, the round after 0"**. And what the late joiner is on after the frame's session start: `FUN_002b83e0` sets 11 directly (`FUN_0030fd90(voice, 11)`, D:L158882), after his start's 3 -- whether that set, the 3 before it (a set before the session exists) or the ghost set-up's 0x22 (`FUN_00543d50` D:L410460-410463, research 205) is the last word is not read; the room keeps 3 (170 §3.1, C11). Settled by 170 §10's two-console run joining a started game |
| a dead actor: the player's actor exists and its `+0xe1` bit 4 is clear (D:L164432-164435) | while the room is not waiting (`voiceAsk`): a body that died this round and has not respawned (`!p.alive && p.diedAt >= 0`), **or a ghost** (`VoiceSeat.ghost`; the review's F2) -- a ghost has not died this round (`diedAt` -1), so without this its RADIO ON or ACTIVE CHANNEL would move it off 3 to 0..2, where its side's living would hear it | `VOICE_DEAD_ACTOR_READING` | D:L164432-164435 (§2) | **unread:** whether the original's ghost actor (the ghost set-up `FUN_00543d50`, research 205) has its alive bit `+0xe1` bit 4 clear; ours reads it so, so a ghost stays on 3 whatever it asks (`roomVoiceRound` RED 5) |

**The round's start after the launch (the review's F1, 2026-10-08; fixed).** The first commit asked 0 at every round's
start and named the rebuild's 0x23 an open question. The review read the chain: there is no level load between rounds
(research 203 §11, strong), so `FUN_001f6660` -- LoadState's Init (research 115 §8.2) -- and its ask of 0, its flag clear
and its table clear (D:L55842-55846) are the level's, once. The round's restart `FUN_00223680` calls `FUN_002a7d40`
(D:L75935), which calls slot +0x4c of every listed object (D:L149744-149746); the player actor's vtable (0x6691a0, the
disc ELF) holds `FUN_00553e60` there, which calls the controller's slot +0x5c unconditionally (D:L419395) -- the 0x23
sender `FUN_00597f50`, sending while `+0xd2` is clear (D:L454601-454602) -- and the handler asks `+0xc4`
(D:L497733-497734). The only other 0x1f sender is the level's (`FUN_002b7d60`, from D:L158525 behind a one-shot flag;
its 0x1f D:L158626-158631 sets `+0xc4` to 0), so nothing resets `+0xc4` between rounds: a player who picked OFFENSE
starts the next round on OFFENSE. The room now asks each seat's remembered `active` at a round's start after the launch,
and 0 (with `active` forgotten) at the launch -- and at a new match's first round, read as a level start (the original
leaves the level at a match's end; that a new match reloads it is this note's reading, for the reviewer). This task's
author re-read D:L75935, D:L149744-149746, D:L419395, D:L158525 and D:L158626-158642; the vtable at 0x6691a0 is the
review's reading of the disc's ELF, carried. `roomVoiceRound` RED 4 and "F1 of the review".

**No per-round clear of the flags or the table (`VOICE_ROUND_FLOOR_READING`; the review's F6, 2026-10-08).** The table's
clear `FUN_0030e7f0` has exactly two call sites, and nothing points at it (the review's read of the ELF): 0x1f6814, the
level's start (D:L55846), and 0x2bc2f0, the host handover -- D:L161017 *(re-read)*, in `FUN_002bc080`, reached from
`FUN_002bbfa0`'s case 2 (D:L160949-160950) when this console becomes the session's host (`DAT_0045a0c0` set,
D:L160977). The talk flag's clears (`FUN_0030e6e0(voice, 0)`) are the level's start (D:L55845), the talk input
(D:L83913-84430), the ARMORY (D:L126098), a death (D:L413093, D:L454486) and a channel change (`FUN_0030fcd0`
D:L211589-211590); `FUN_002a9b30`'s state 4 (D:L150617-150618) is the abort valve (`+0x1ac`, D:L151146 / D:L151158;
online it leaves the game, D:L150625), not a round. So a round's start after the launch clears neither: a holder whose
channel the start's ask moves loses his hold (the channel change), and one whose channel does not move keeps it --
until the room's 10 s cut (W20.R5) or the 15 s expiry, as the original's host would free it. The first two commits of
this task cleared both at every round's start (the relay's rule, §4.3; named `VOICE_ROUND_FLOOR_CLEAR_PLACEHOLDER` at
2c03d2db2, which was an invented deviation of who is heard, not covered by OT.R27); the level's start keeps its clear.
`roomVoiceRound` RED 7, `roomVoice` RED 9.

**Another question this task found, not changed in code.**
- *The side swap.* `FUN_002c2c20` ORs 4 onto the team word `DAT_004412d8` picks (D:L164451-164453; 170:218, C2); the
  room has no such swap (`sideOf`: "while the sides are not swapped"), its only side change being the lobby's SWITCH
  TEAMS, so C2 holds for the room as the team word.

## 6. Placeholders and readings

Every name `voiceFloor.ts` holds; each is already a row of research 170 §10, listed again here where it is code
(research 101 §5 excludes each from the round's ledger). The values and their sources are 170's and the review's; the
status is this module's. After them, the relay's five (SVC-20b-relay, §4): ours under OT.R27 (no original: the DME
library's voice transport is unread, 170 §10), each a placeholder, research 101 §5 excluding each as the online
services' voice. Last, SVC-20c's five readings (§5.1): which of the room's flags stands for each of the original's, readings of
our room against the original's code, research 101 §5 excluding each as the online services' voice.

| name | value | where | what would settle it | status |
|---|---|---|---|---|
| `VOICE_FLOOR_HOLD_READING` | `{recordMs: 10 000, expiryMs: 15 000}` | in code, `voiceFloor.ts:19`; `voice+0x30` / `+0x34` (D:L158881, D:L211217, `FUN_00310080` D:L211751-211753) | 170 §10's two-instance run past 10 s | reading, pending review |
| `VOICE_FLOOR_RETRY_READING` | 1 000 ms, strictly past, on the server's clock | in code, `voiceFloor.ts:26`; D:L211126, D:L211198, D:L211182 | 170 §10's run with a second presser | reading, pending review |
| `VOICE_CUTOFF_LOCKOUT_READING` | 10 000 ms after the cut, strictly past; a want still on resumes then (C6) | in code, `voiceFloor.ts:33`; state 4, D:L211257-211265, D:L211262, D:L211255-211263 | 170 §10's run past the cap and a hold to 25 s | reading, pending review |
| `VOICE_TALK_LOCKOUT_MS_READING` | 1 000 ms from a member's own flag's end (its release, or a set that ended it) in which its own press does not ask: its want is due at the window's end, strictly past (the close review's F1, 2026-10-08) | in code, `voiceFloor.ts` (`talkOn`, `talkOff`, `setChannel`'s `now`); the talk input's TeamCommand timer, route B's 1.0 s (`DAT_003dcb08`, D:L83910), route A's 1.3 s (D:L84677-84690); the page's `VOICE_TALK_LOCKOUT_READING` (research 170 C6). On 9 the window is ours (the lobby's CIRCLE has none) | 170 §10's run of a re-press 0.5 s and 1.5 s after a talk with a second presser waiting; a reviewer's re-read of D:L83910 | reading, pending review |
| `VOICE_OFFENSE_DEFENSE_NUMBER_READING` | TEAM 0, DEFENSE 1, OFFENSE 2 | in code, `voiceFloor.ts:40`; `FUN_002344e0` D:L83791-83792, `FUN_0022f950` D:L81576-81592 | resolved at source level 2026-10-04 (170 §10, C1) | reading, pending review (resolved at source in 170) |
| `VOICE_DEAD_CHANNEL_READING` | 3, at every ask while the actor is dead; a death asks only without respawn or for a ghost | in code, `voiceFloor.ts:49`; D:L164432-164435; C3, D:L454484-454492, D:L497716-497737 | 170 §10's run across a death with and without respawn, and a radio re-pick while dead | reading, pending review |
| `VOICE_SIDE_BIT_READING` | OR 4 for the Terrorists' team word, not on 9; its guard `voice+0x4d == 0` read as always passing | in code, `voiceFloor.ts:57`; C2, `FUN_002c2c20` D:L164449-164458, D:L164454, `FUN_0030fcd0` D:L211588 | 170 §10's one-side runtime check; a read of every writer of `voice+0x4d` | reading, pending review |
| `VOICE_SPECTATOR_CHANNEL_READING` | 10 whatever is asked, never +4 | in code, `voiceFloor.ts:63`; C2, `FUN_002c2c20` D:L164437-164440 | 170 §10's run with a spectator | reading, pending review |
| `VOICE_LATE_JOINER_READING` | the round's start asks the dead zone, 3 | in code, `voiceFloor.ts:69`, asked by `room.ts` `voiceEnter` (SVC-20c, §5.1); D:L55848-55849 (C11) | 170 §10's two-console run joining a started game | reading, pending review |
| `VOICE_CHANNEL_MAP_READING` | 0 TEAM, 1 DEFENSE, 2 OFFENSE, 3 dead, OR 4 Terrorists, 9 lobby, 10 spectators, 11 off | in code, `voiceFloor.ts:77`; `FUN_002c2c20` D:L164422-164461 and its callers (170 §3.1, §5 here) | 170 §10's run reading `voice+0x24` / `+0x2c` in each state | reading, pending review |
| `VOICE_FRAME_BYTES_MAX_PLACEHOLDER` | 256 bytes a voice frame; one over it a strike | in code, `room.ts` (SVC-20b-relay; not `limits.ts`, §4.5); constraint 4 | SVC-20b-page's measured frame sizes at 6 000 bit/s (SVC-21's Opus packets). [VOICE-2, 2026-10-09: the page now runs at 12 000 bit/s (OT.R44). The cap is on the whole frame with its 8 bytes of framing (`room.ts` `voiceFrame`), so four packets have 248 bytes, 62 each, and 227 §4.6's largest packet at 6 000 (32 bytes) scaled to 12 000 is 64: the scaled peak is over the cap (a frame of four such, 264 bytes, a strike and a lost 80 ms); the nominal frame is 128. The browser window's per-frame byte totals at 12 000 decide whether a relay task raises it (research 226 §1).] | placeholder |
| `VOICE_FRAMES_PER_S_PLACEHOLDER` | 25 frames a second into the connection's bucket (twice the honest 12.5, R170.12); a frame with no token a strike | in code, `room.ts`; constraint 4 | the page's measured cadence; a stalled line's burst in V-E2E | placeholder |
| `VOICE_FRAMES_BURST_PLACEHOLDER` | 25 frames, the bucket's size (two seconds of the honest page's), full at the entry | in code, `room.ts`; constraint 4 | as the rate | placeholder |
| `VOICE_BACKLOG_SKIP_PLACEHOLDER` | 16 KiB unsent on a listener's socket, past which a voice frame toward it is skipped, never queued or closed | in code, `limits.ts` (read by `server.ts`'s `sendLossy`); W20.R7, constraint 7 | the page's jitter buffer (`VOICE_JITTER_MS_PLACEHOLDER`, SVC-20b-page) and a slow reader observed in V-E2E | placeholder |
| `VOICE_JOIN_IN_PLAY_BASE_PLACEHOLDER` | 0, the base a member asks when it joins past the game lobby (a spectator 10) -- since SVC-20c only a respawn room's joiner; a classic round in play's seat asks `VOICE_LATE_JOINER_READING` (§5.1) | in code, `room.ts`; §4.3, §5.1 | the mapping of a lobby-less respawn room's joiner onto the original's late joiner. The evidence (the review's F4): in a respawn game the level's spawn sends 0x1f (`+0xc4` = 0, D:L158626-158631), then for a ghost runs the ghost set-up `FUN_00543d50` (its 0x22 asks 3, D:L410460-410463) and clears `+0xd2` at once (D:L158639-158642) -- so the original's respawn joiner is on 3 until his first respawn, whose 0x23 asks `+0xc4` = 0, then on 0; this placeholder's 0 is the state after that respawn, not before it; 170 §10's two-console run joining a started respawn game | placeholder (narrowed by SVC-20c) |
| `VOICE_ROUND_FLOOR_READING` | a round's start after the launch clears no talk flag and not the floor table: only an ask that moves a holder ends his hold | in code, `room.ts` (`voiceRoundStart`'s doc); §5, §5.1; `FUN_0030e7f0`'s two call sites, D:L55846 (the level's start) and D:L161017 (the host handover); the flag's clears D:L55845, D:L83913-84430, D:L126098, D:L413093, D:L454486, D:L211589-211590 | 170 §10's run across a round's start with a held floor | reading, pending review -- and the two call sites of `FUN_0030e6e0` at 0x27e260 and 0x27e284, inside `FUN_0027dfe0`'s range in the front end, absent from the decompilation and unidentified (the review's F7): the talk flag's list of clears is complete only to those two |
| `VOICE_RESPAWN_RULE_READING` | the original's "no respawn" (game `+0xdc` 0) is the room's `opts.rules === 'classic'` | in code, `room.ts` (`voiceDeath`'s doc); §5.1; D:L454485, V7 #8 | 170 §10's run across a death in a mode-5 respawn game and in a classic one | reading, pending review |
| `VOICE_GHOST_FLAG_READING` | the original's game `+0xd2` is `VoiceSeat.ghost`: a seat made in a classic round in play, until the next round's start, which asks it 0 and forgets its ACTIVE CHANNEL | in code, `room.ts` (`VoiceSeat`'s doc); §5.1; set D:L55727, cleared D:L55855, D:L158642, D:L75846-75849 (with its 0x1f, D:L410401-410403) | a reviewer's re-read of D:L55715-55728; 170 §10's two-console run joining a started game | reading, pending review |
| `VOICE_LATE_JOINER_SEAT_READING` | the original's late joiner (game `+0xcc`) is a seat made in a classic round in play; his start's 3 is asked at his entry, and the next round's start asks 0 | in code, `room.ts` (`voiceEnter`'s doc, `VOICE_JOIN_IN_PLAY_BASE_PLACEHOLDER`'s); §5.1; D:L159282, D:L55842-55849, D:L55716 | a reviewer's re-read of the level start's order against the late branch (D:L55831, D:L55603, D:L55658, D:L55715-55728) and of the session start's 11 (D:L158882); 170 §10's two-console run | reading, pending review |
| `VOICE_DEAD_ACTOR_READING` | the original's dead actor (`+0xe1` bit 4 clear) is a seat whose body died this round and has not respawned (`!alive && diedAt >= 0`), or a ghost, not in the game lobby; whether the original's ghost actor has its alive bit is unread | in code, `room.ts` (`voiceAsk`'s doc); §4.3, §5.1; D:L164432-164435 | 170 §10's run reading `voice+0x2c` across a death, a respawn and a ghost | reading, pending review |

SVC-20a added no other name: the floor's size (twelve, `voiceFloor.ts`'s `FLOOR_ENTRIES`) is derived from the map's 11, and the
module chooses no value of its own. `voice+0x4d` (§2) is a guard read as always passing, not a value the code
stands in for, so it has no constant.
