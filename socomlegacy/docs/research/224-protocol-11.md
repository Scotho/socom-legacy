# 224 -- Protocol 11: the slimmed snapshot, the frame type, the facing reconciled (NET-WIRE)

Written 2026-10-07 for NET-WIRE (`agent/net-wire`, from `agent/online` 81dda3e0), on the owner's OT.R38 / H118 ("Slim
now, spectators 30 Hz", no interest filter) and the merge controller's collected requirements of 2026-10-07 (sprints 31
and 33, the equip-anim fix, NET-LOOK's design call). The code: `packages/viewer/src/net/protocol.ts`, `codec.ts`,
`codecV10.ts` (new), `client.ts`; `packages/viewer/src/walk.ts`, `actionWiring.ts`; `packages/match/src/room.ts`,
`replay/format.ts`. The base gained main 2e392bc8 (PR #57: the equip-anim fix's hold bits 11-15) by a merge before the bump. The tests: `packages/viewer/test/netCodec.test.ts`, `netCodecV10.test.ts` (new, with
`test/fixtures/snapshot-v10.hex`), `feetRange.test.ts` (new), `netClient.test.ts`, `facingReconcile.test.ts` (new);
`packages/central/test/roomWire.test.ts` (new), `replayFormat.test.ts`, `roomNetHardening.test.ts`, `room.test.ts`,
`roomWorld.test.ts`, `roomBomb.test.ts`, `roomExtraction.test.ts`, `roundStats.test.ts`, `roomFacing.test.ts` (new). No game or emulator was run; no
server but the tests' own was contacted. Nothing here is the game's: the wire is the web's design (the game has no
server, research 91 §15), and every value below is a wire step or a page policy, named as such.

## 1. The requirements and their sources

| # | requirement | source | where it landed |
|---|---|---|---|
| 1 | a frame-type byte at the head of every binary frame: the snapshot 0, the voice 1 (reserved), refused cleanly | the merge controller's list item 2 (sprint 20's relay builds on it) | `Frame` (§2.1) |
| 2a | a body's feet i16 relative to the map's bounds, sub-unit precision on every map | research 223 MEDIUM-5; OT.R38 / H118; list item 1 | `FEET_STEP`, the frame's origin (§2.2) |
| 2b | the environment only when its revision changed (the welcome keeps it whole; `epochNewer` guards the boundary) | as 2a | `Room.envSent`, the sections byte (§2.3) |
| 2c | spectators keep the full 30 Hz | OT.R38 / H118 | unchanged, now held by a test (§2.4) |
| 3 | `facing` (yaw, pitch) in the own state, reconciled as the position; the look cover to zero | NET-LOOK's design call (research 223 §8; list item 8) | §4 |
| 4 | `BodyState.flags` widened, the bits' meanings kept | the equip-anim fix 4ab31f33 (bit 15 `HoldSerial`); list item 9 | a u32 (§2.5) |
| 5 | hostage bodies keep ids from 240; `welcome.hostages` kept; the result's stats optional | sprint 31 HX-4a / HX-5; list items 4 and 7 | unchanged, held by tests (§2.7) |
| 6 | protocol 10's decoder frozen beside 11's, a committed v10 fixture; the replay picks its decoder by the header; live play strict | sprint 33 PT-01b; list item 3 | `decodeSnapshotV10`, `REPLAY_PROTOCOLS` (§5) |
| 7 | every literal, the size budgets, research 209/210's tables updated; this note | the task's brief | §3, §6 |

Not done here: OT.R41 / OT.R42 (list item 10: rulings for the merge controller to record, not a wire change). The taunt
fields (list item 5) landed on main with PR #59 before this branch's last merge (54fcf7d0): additive JSON events, kept as
they are (§2.6).

The branch merged main twice: 2e392bc8 (PR #57, the equip-anim fix's hold bits) before the bump, and 54fcf7d0 (PR #61:
NET-LOOK's final head and the taunts) after the facing commit; neither brought the look's cover back.

## 2. The layout (protocol 11)

`PROTOCOL_VERSION` = 11, with its history line. A hello of any other version is refused by name ("protocol 10, this
server speaks 11"), as before.

### 2.1 The frame type

The first byte of every binary frame is its type (`Frame`): **the snapshot 0, the voice 1, the commands 2**. Protocol
10's kinds were the commands 1 and the snapshot 2; the voice takes 1 as the brief asked, so the commands moved to 2 (a
protocol 10 command frame reads as a voice frame to an 11 peer: the hello's version refuses the pair first). The voice
is RESERVED: nothing sends it; sprint 20's relay builds on the byte. **For sprint 20:** `Room.binary` returns on a frame that is not a
command frame before it marks the connection heard (`heard`, the idle clock), so the voice relay, when it takes the voice
type, must count a voice frame as a sign of life there (a talking watcher or a mounted player otherwise idles out). A peer drops a frame of a type it does not take --
the room anything but a command frame (the voice, a snapshot, an unknown type, an empty frame; `Room.binary` returns
true: no strike), the page anything but a snapshot -- before it is read, and throws nothing (`roomWire.test.ts`,
`netClient.test.ts`).

### 2.2 The snapshot

| bytes | field | note |
|---|---|---|
| 1 | `u8` frame type, 0 | |
| 4 | `u32` tick | |
| 1 | `u8` sections | bit 0 the own state, bit 1 the environment; any other bit refused (a frame of another version) |
| 6 | `i16` x3 the feet's origin | whole units: the room's map's hull's bounds' centre (`feetOriginOf`); a frame built without one, the bodies' own bounds' centre |
| 36 | the own state, when bit 0 | `u32` ack, `f32` x y z, `f32` vx vy vz, **`f32` yaw, pitch** (the facing, §4) |
| 1 | `u8` body count | |
| 52 a body | the body | `u8` id, **`i16` x3 the feet** (at `FEET_STEP` from the origin), `u16` yaw, `i16` pitch, `i16` x3 the speed, **`u32` flags**, then protocol 10's tail unchanged (`u8` packed, item, jumps; `i8` stick x2, class; the action, the overlay, the turn, the traversal, the peek) |
| 1 + 2 a door | the doors | unchanged (protocol 2) |
| 8 + 3 an instance | the environment, when bit 1 | unchanged layout (research 209 §11) |

No trailing byte. **The feet.** `FEET_STEP` = 1/8 unit: an i16 reaches `FEET_RANGE` = 4095.875 units from the origin, and
a foot comes back within 1/16 of a unit (the step's half; the codec test bounds every body there). The widest hull on the
disc is M51's, 6,009 units across x (MP53's 4,400 across z the widest of the 22 multiplayer maps); every hull's farthest
point from its bounds' centre is at most 3,005 units (M51), so every map lies inside the range with more than 1,000 units
to spare (`feetRange.test.ts`, over all 34 map archives on the disc, and over the extracted fixtures without it). Past
the range a foot is clamped to the edge, never wrapped. The origin rides the frame (6 bytes) rather than the welcome, so
each frame reads alone: the replay recorder (whose header the playtest page writes before it holds a map), a snapshot
the latency injector delivers before its welcome, and every test helper decode without a context. **The room's authority
is unchanged**: its own positions are float64 and its hits, rewinds and moves never read the wire's feet.

### 2.3 The environment only when it changed

The room keeps, per connection, the environment it was last sent -- the welcome's (which carries it whole, as before),
then a snapshot's -- by its revision and round epoch (`Room.envSent`). A snapshot names the environment (bit 1) only to
a connection whose pair differs: once after each change of the world (`Grid.revision`) and once after each round's start
(the epoch, with the reset's revision), never again until the next. The transport is a WebSocket -- ordered and
reliable -- so what was sent is what the page holds. The latency injector (`Simulate`, the tests' and the playtest
matrix's) is not: its *loss* can drop the one snapshot that named a change, which the page then lacks until the next
change (a test instrument's limit, not the transport's), and its *jitter* alone (a per-message delay) can reorder two
snapshots, so back-to-back revisions may arrive newest first. The page guards the reordering (NET-WIRE's review,
2026-10-07): within its round's epoch it drops a named environment whose revision is not newer than the one it holds
(`revisionNewer`, serial arithmetic on the u32), so a revision 7 arriving after an 8 leaves the 8; and `NetClient.env()`
names only an environment the page took -- one of an older round (`epochNewer`) or a stale revision is refused and not
named. The joiner's silent environment (JOIN_SILENT_READING) is the first one its socket takes -- normally the welcome's:
the room names no environment the welcome already gave, and a repeat of the held revision is dropped, so every environment
named after it is a later change and plays its effects. *The independent review (2026-10-08, finding 2):* the injector's
jitter alone can also land a snapshot sent after the welcome before it; a welcome then must not roll the newer environment
back (the room never names it again). A client is one socket, so the page keeps the newest environment that socket took
by (epoch, revision) (`envNewer`): a welcome no newer than it keeps it and its round, the welcome's other contents apply,
and the overtaking snapshot's environment, being the socket's first, was laid silently. A real WebSocket delivers the
welcome first; this guards the instrument (`netClient.test.ts`, the reviewer's `env-welcome` probe ported). The recorder's snapshot
always carries it (`RoomRecorder.snapshot`), so a replay seeks to any snapshot with its world.

### 2.4 Spectators at 30 Hz

Unchanged: `Room.snapshots` sends every connection, a spectator's and a watcher's included, a snapshot every second tick
(`SNAPSHOT_HZ` 30); no interest filter (OT.R38 / H118). Held by `roomWire.test.ts` (30 snapshots in 60 ticks, a player's
and a watcher's alike).

### 2.5 The flags

`BodyState.flags` is a u32 on the wire. The bits keep their meanings: 0-10 `BodyFlag` (airborne ... binoculars), 11-14 the
kit's hold code and 15 the hold's start parity (`BODY_HOLD_SHIFT`, `BodyFlag.HoldSerial`: the equip-anim fix 4ab31f33,
merged from main 2e392bc8; `netCodec.test.ts` reads every hold code and the parity back by name), 16-31 free. A split (a
u16 and a byte) would have cost one byte less a body; the u32 keeps every bit where it was and leaves 16 free.

### 2.6 The v11 wire, as built

| frame or event | direction | v11 | change in 11 |
|---|---|---|---|
| `Frame.Snapshot` (type 0) | room -> page | §2.2's layout | slimmed: type byte 0 (was kind 2), sections byte, the origin, i16 feet, u32 flags, own `facing`, the environment only when named |
| `Frame.Voice` (type 1) | either | reserved, nothing sends it | new; dropped by both peers today |
| `Frame.Commands` (type 2) | page -> room | u8 type, f32 view tick, u8 count, 15 bytes a command (u32 seq, i8 stick x2, u16 yaw, i16 pitch, i16 turn, u16 buttons, u8 stance / weapon) | the type byte only (was kind 1) |
| `hello` | page -> room | `version: 11`, the rest as 10 | the version; another is refused by name |
| `welcome` | room -> page | protocol 10's fields: `env` (whole), `epoch`, `startTick?`, `gameType?`, `phase`, `join` (with `result.stats[id].hostagesRescued?` / `.escorteesKilled?`), `objective?`, `hostages?`, `turrets?` | none |
| `roundStart` | room -> page | `epoch`, `startTick` with protocol 10's fields | none |
| `roundOver` | room -> page | `stats[id]` with the optional `hostagesRescued?`, `escorteesKilled?` (EXTRACTION rooms only) | none: still optional |
| `hostageOrder` (page -> room), `hostageState`, `kill.victimKind?`, `eliminated.reason?`, `roundTime` | as named | sprint 31's additive JSON | none |
| `taunt` (page -> room) | page -> room | `{ type: 'taunt', kind: 'vocal' }` or `{ type: 'taunt', kind: 'custom', slot, text }`, with `request` (PR #59) | none: additive JSON, kept |
| `taunt` (room -> page) | room -> page | `sender`, `name`, `team`, `char`, `request`, `vocal` (null for a custom one), `text` (null for a vocal one), `at` (the sender's feet, float JSON) | none: additive JSON, kept -- its `at` is not slimmed (an event, not a snapshot) |
| `communication` (page -> room) | page -> room | `{ type: 'communication', ...CommunicationRequest }` (Chris's team communications, PR #63, `communications.ts`) | none: additive JSON, kept |
| `communication` (room -> page) | room -> page | `sender`, `name`, `team`, `char`, `request`, `command` (null or a number), `text` (null or a string), `at` (float JSON) | none: additive JSON, kept -- its `at` not slimmed (an event) |
| every other JSON event | either | as protocol 10 and its additive fields | none |

### 2.7 What did not change

A body's id is a u8 and no range is reserved: the room's hostages ride the body list from `HOSTAGE_ID_BASE` 240 (HX-1;
`roomWire.test.ts`, `roomExtraction.test.ts`, the codec test's ids 239-255). `welcome.hostages` is as it was. The result's
optional stats (`roundOver.stats[id].hostagesRescued?`, `.escorteesKilled?`, and the same inside the welcome's
`JoinWire.result.stats`) stay optional JSON fields: the binary slimming touches no event. The welcome, the round start and
every JSON event keep protocol 10's fields; protocol 11 added none to them.

## 3. The measurements

Bytes a snapshot, the room's own frames (`roomWire.test.ts`: a classic EXTRACTION room on the flat test floor, every seat
spawned and walking, its three hostages among the bodies, no door, the environment unchanged since the welcome):

| room | recipient | bodies | protocol 10 | protocol 11 | saved |
|---|---|---|---|---|---|
| 16 seats + 3 hostages | a player | 18 | 1052 | 986 | 66 (6.3 %) |
| 16 seats + 3 hostages | a spectator | 19 | 1080 | 1002 | 78 (7.2 %) |
| 24 seats + 3 hostages (bodies cloned: the room seats 16, `TEAM_SIZE` 8 a side) | a player | 26 | 1500 | 1402 | 98 (6.5 %) |
| 24 seats + 3 hostages | a spectator | 27 | 1528 | 1418 | 110 (7.2 %) |
| the codec budget: 15 bodies and one's own, no door | a player | 15 | 884 | 830 | 54 |
| the same on Frostfire (three doors) | a player | 15 | 890 | 836 | 54 |

A snapshot that names the environment costs 8 bytes more and 3 an instance (protocol 10 paid them in every frame). Per
body: 56 -> 52 (the feet 12 -> 6, the flags 2 -> 4); per frame: the head 6 -> 12 (the origin), the own state 28 -> 36 (the
facing), the environment 8 -> 0 unless named. At 30 Hz a 16-seat player's stream is 29.6 KB/s (31.6 before), a 24-seat
spectator's 42.5 KB/s (45.8). The protocol 10 figures were measured on the same room with protocol 10's codec before the
bump (2026-10-07), and agree with its layout (6 + 28 + 1 + 56 n + 1 + 8).

## 4. The facing, reconciled (NET-LOOK's design call closed)

Research 223 §8's call (the merge controller on the owner's authority, 2026-10-07): the facing goes into the own state,
the page reconciles it as it does its position, and the look's cover goes to zero. Done:

- **The room** sends `OwnState.facing` -- its mover's yaw and pitch after the acked command, after the look gate
  (`LookGate.step`), float32 like the position.
- **The cover is zero.** `LOOK_COVER_MAX_TICKS_PLACEHOLDER`, `Room.lookCover` and `Player.ranAtTick` are gone: the room
  covers no tick it ran no command for (a dropped backlog, commands lost past the gap wait, a mounted drop), so a skipped
  number, a lag switch or a stall earns the next command its own tick and the bank (`LOOK_SLACK_TICKS_PLACEHOLDER`) and
  no more. `LookGate.cover` stays in the shared gate, unused by the room.
- **The page** keeps, beside each sent command's predicted feet, its predicted facing (the walk's gated yaw and pitch
  after the tick: the tap's third argument). At a snapshot its own state's facing is compared with the prediction at the
  acked command: the yaw by the short way round, the pitch plainly. An error under `FACING_FLOOR_DEG` (0.001 degree: the
  float32's noise on a yaw near 360 is 3e-5) is no correction. Otherwise **the later commands are replayed**: the room's
  facing is laid on the mover and every later command's look is run again through the same look gate from it -- the gate
  as it stood after the acked command, each command's own look, the weapon's look context, the held move and the
  stance's limits, as the walk recorded them when it took the step (`LookLog`, `NetWalk.reconcileFacing`:
  `WalkMode.reconcileFacing`, `MoverSim.replayLook`) -- and the later predictions take the replayed facings. Counted in
  `corrections.facing`, the largest in `corrections.largestFacing`. **Not smoothed**: the gate's next step starts from
  the facing. The camera (the player's view) is not moved. A walk that keeps no record (a test's) is replayed by the
  client's own shadow of the gate (the open context, stepped from each tick's reported facing) and its mover turned to
  where the replay ends (`nudgeFacing`). The first form's uniform offset (the error laid on every later prediction and
  on the walk) remains only as the last resort, when neither record holds the acked command's step: the first command
  of each life (the shadow steps from the facing reported after the tick before, so that command has none), at most
  once per life since the offset makes that command's prediction the room's -- or a shadow-replayed page dead since
  the ack, whose newest command carries no facing.
  Open ([LATER](../LATER.md) 16, the landing review's F3): the replay chains each step from the gate's own output,
  while the walk steps from the mover's facing after the tick, where a move that holds the yaw (a ladder, the 180) lays
  its own; a correction landing during such a move costs a further correction per snapshot until the move ends.
  **2026-10-09 (web sprint 37 PTT-8, LATER 16): closed.** The replay now starts each step where the mover stood after
  the tick before, as the walk does: `LookLog.record` keeps the facing each step started from (`WalkMode.frame`'s
  `tickRef`, `walk.ts:879`) and `WalkMode.reconcileFacing` hands the facing after the newest tick, while alive
  (`walk.ts:629`); a tick whose mover's facing differs from the gate's output as recorded (a move that laid its own yaw:
  a ladder, the 180, their first tick) gives that facing as the next step's start and as the command's replayed facing,
  every other tick the replayed output (`lookGate.ts` `LookLog.replay`, :268-289). Held by `facingReplayMove.test.ts` (a
  real `WalkMode` and `NetClient`: one correction on a ladder and on the 180, where the chained replay took 16 and 25;
  one for a correction from life landing after the death; the live walk and gate byte-equal to b0d2f4180) and
  `lookGate.test.ts` (a replay step after the 180's turn). A `MoverSim` page's record
  (`moverSim.ts` `prepare`) and the client's shadow (`client.ts` `shadowStep`) keep no facing and chain as before.
  Two windows read as a laid yaw, each bounded to one correction: a last-resort `nudgeFacing` between ticks (it moves
  `tickRef`, so a later replay across that tick keeps the nudged facing), and the death -- dead ticks record no step but
  move `tickRef` to the body's quantised look -- closed by passing no facing while dead (the review's F1, 2026-10-09).
- *Why a replay (the independent review of 2026-10-08, finding 1, Craig's Codex agent).* The first form laid one offset
  -- the error at the acked command -- on every later prediction. The gate slews the mover toward each command's
  ABSOLUTE look, so an offset is not what the commands give once the player stops or reverses a turn: over a delayed
  ordered link after 20 lost command frames the page corrected for ever (3 ticks one way, stopped: 53 corrections after
  2 s, 173 after 6 s; the yaw corrections cycling +4.27, +4.27, -6.41, -2.14 degrees). Replayed, every case settles:
  `roomFacingDelay.test.ts` (the reviewer's probe ported, its page walk as written) -- 0, 3, 6 and 9 ticks one way, the
  turn continued, stopped or reversed: 1 to 3 corrections, then none over the last 4 s, stopped movers on the same yaw;
  the same with a walk replaying from its own record: 1 or 2, never the offset.

The lag-switch probes of NET-LOOK, re-run as tests (`roomNetHardening.test.ts`, `roomFacing.test.ts`, `roomFacingDelay.test.ts`, `facingReconcile.test.ts`).
The loop test also caught a page that predicted on the raw look rather than the wire's quantised one (73 corrections in
240 ticks): the page must predict on `quantiseCommand`'s command, as `WalkMode` does.


| probe | NET-LOOK (cover 15) | protocol 11 (cover 0) |
|---|---|---|
| one command 59 numbers past the last, facing +125 degrees (after a steady minute, 59 Hz or 50 Hz for 60 s, a 1 s silence, a 30-tick stall) | at most 20 ticks of turn (1 + 15 + the bank 4), 42.7 degrees | at most 5 ticks (1 + the bank), 10.7 degrees: **a skip earns nothing** |
| 13 commands lost past the gap wait while turning at 40% | never held (covered) | held (1 to 3 `look: turn` drops), then the room faces the page's look again on the 60% of the stick spare |
| a 9 s stall while turning at 40% | held about 1 s at the full stick | as before (the drop covered nothing already) |
| a 200 ms stall, the commands sent late | never held | never held (no tick unrun: no cover needed) |
| an honest stall at the full stick (20 command frames lost: 17 commands, 36 degrees; a page on the shared `MoverSim` through `NetClient`) | the room covered 15 ticks and the bank | the room holds the turn and lags (no spare to catch up on); the snapshot's facing corrects the page once -- its walk and its later predictions -- and no error comes back in the next 120 ticks; the two face alike command for command |

## 5. The replays (.s2r)

`decodeSnapshotV10` (`codecV10.ts`) is protocol 10's snapshot decoder frozen -- its own reader and dequantisers, a copy
of the code as it stood before the bump -- exported beside the live one, with `decodeCommandsV10` (a protocol 10
recording's `cmd` records hold protocol 10's command frames, whose kind byte 1 is protocol 11's voice; their layout after
it is unchanged). The fixture (`viewer/test/fixtures/snapshot-v10.hex`): 166 bytes written by protocol 10's own
`encodeSnapshot` before the bump -- an own state, a body with every packed field set, a hostage (id 240), two doors and an
environment of two instances -- decoded value for value (`netCodecV10.test.ts`). `decodeRecords` picks the decoders by the
recording's header `protocol` (`REPLAY_PROTOCOLS` = [10, 11]); a recording of any other protocol is refused by name
("unsupported replay protocol 12 (this build decodes 10, 11)"), and `allowProtocols` narrows the list but never widens it
past a decoder (`replayFormat.test.ts`: a protocol 10 file -- header, the fixture's snapshot, protocol 10's command frame,
end -- plays through the frozen pair). A protocol 11 `snap` record is the live frame with the environment always named
and the origin the bodies' own bounds' centre. Live play stays strict: the room refuses a hello of any other version.

## 6. Placeholders

| name | value | where | what settles it | status |
|---|---|---|---|---|
| `LOOK_COVER_MAX_TICKS_PLACEHOLDER` | was 15 ticks: the look's cover over ticks with no command | server `room.ts` | the facing reconciled (§4) | retired 2026-10-07 (NET-WIRE: the cover is zero; research 223 §8's design call closed) |

No new placeholder or reading: `FEET_STEP`, `FEET_RANGE` and `FACING_FLOOR_DEG` are wire steps and a page policy, with no
original to read.
