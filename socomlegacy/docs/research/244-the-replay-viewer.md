# 244 -- The replay viewer

Written 2026-10-08 for PT-18 of web sprint 35 (the plan `docs/plans/2026-10-08-web-sprint-35-the-replay-viewer-and-the-loop.md`;
the design `docs/specs/2026-10-06-playtest-and-replay-design.md` §4.8, and §4.1's "Seek" and "Versions"). This note
owns the replay mode of the test room: §1 the mode, the client seam and the clock; §2 the load, the segment route and
the refusals; §3 (PT-19) the spectator modes in the replay and the animation's clock. Later tasks append §4 (PT-20, the
embedded viewer and the timeline) and §5 (PT-23, the acceptance run); sprint 37 appends §7 (PTT-6, the seek's fold; PTT-7,
§7.3, the replay's untried paths rendered). The
format the mode reads is research 240's.

The code: `packages/viewer/src/replay/` -- `load.ts` (the fetch, the gunzip, the refusals), `clock.ts` (the replay's
clock), `replayClient.ts` (`ReplayClient`), `controls.ts` (the keys and the bar), `mount.ts` (the mode's factory, the
map rule, the frame loop); the seams: `NetPageDeps.client` and one branch in `NetPage.open()` (`packages/viewer/src/netPage.ts`),
the capability `replay` (`packages/viewer/src/matchCore.ts`) and its `PART_DEPS` line (`packages/viewer/src/matchNet.ts`),
the test room's branch in `packages/viewer/src/main.ts` (`show`); the service's route `packages/playtest/src/segmentsHttp.ts`
and its mount line in `packages/playtest/src/service.ts`. The tests: `packages/viewer/test/replayClock.test.ts`,
`replayLoad.test.ts`, `replayClient.test.ts`, `replayMode.test.ts` (jsdom), the fixture `replayFixture.ts`;
`packages/playtest/test/segmentsHttp.test.ts` (a real `SessionService` on port 0).

**Nothing here is a parity finding.** SOCOM II records no match and plays none back: the replay mode is a browser
adaptation with no original (`REPLAY_ADAPTATION`, the format's label, research 240 §3; PT.R3), behind
`import.meta.env.DEV` and `?devmode`, and it changes no game value or behaviour -- it draws what the recorded room sent
its spectators, through the page's own spectator path. The evidence is unit tests only (node, and jsdom for the page's
`NetPage` and the bar); no game, browser, dev server or match server was run for this note, and the mode has not yet been
seen rendered (PT-23's end-to-end run is where it is). PT-23 (§5, 2026-10-08) is the one rendered run: its evidence is
said there, apart from these.

## 1. The mode, the client seam, the clock

**The capability (W35.R5).** `MatchCapabilities.replay`: true in `TESTROOM_CAPABILITIES`, false in
`FRONT_END_CAPABILITIES` (spec 4.8: the front-end match is untouched). Its dep is `client` (`PART_DEPS.replay`), so
`matchNetDeps` refuses a factory from a page whose switch has the mode off (`client is the replay's, which this page does
not mount`) -- the front end can hand none, by the typecheck and at run time. A part that is on owes its deps
(`matchNetDeps`' rule since ONE-WIRE), so `/testroom` hands `client: null` in its deps: null is the page's own
`NetClient`, as an absent factory is; the replay branch alone replaces it. (The brief reads "the factory absent"; under
the switch's owed rule the test room's is present and null -- the same `NetPage` either way, held by the test "no
factory -- absent or null".) The front-end parts pin (`matchMount.test.ts`) skips the replay: it is no part of the
original's match that the front end has "not yet" mounted.

**The test room's branch.** `/testroom` chooses between a server's `NetPage` and the offline `LoopbackMatch` in
`main.ts`'s `show()` only; `matchMount.ts` is the front end's page and `matchNet.ts` builds deps, not pages, so no route
reached that choice without `main.ts`. The merge controller's window granted a seam there: one constant and one branch,
ahead of the two, taken only when the capability is on, the build is a development one, the address has `?devmode` and
`replay=`. It loads `./replay/mount` lazily and builds a watcher's `NetPage` (`watch` true; `world` the page's, as the
server branch hands it) whose client is the mode's factory's. Without `replay=` the branch is not taken and the page
builds what it built before (the deps' one added key, `client: null`, opens the same `NetClient`).

**The client seam (W35.R4).** `NetPageDeps.client?(opts, walk)`: `NetPage.open()` builds the `NetOptions` it always
built and hands them and the walk to the factory when there is one, else opens a `NetClient` on them. `ReplayClient` is
not a subclass of `NetClient`: it implements the class's whole public surface (`NetClientSurface`, a mapped type the
typecheck holds), and `asNetClient` hands it to `NetPage`'s `client` field (a class with private members admits no
structural twin; `NetPage` reads only public members). The members the page reads are live -- `on`, `bodies`, `doors`,
`env`, `serverTick`, `viewTick`, `id`, `role`, `team`, `state`, `close`, `closeCode`, `newEpoch`, `setWorld`,
`roundEpoch`, `gameType` (the header's, research 240 §6's string), `snapshotRate` (the recording's) -- and the rest inert:
`send` is a no-op, `rebind` and `reportLoaded` do nothing, `loadReported` is false, `lastSeq` 0, `combatReport` empty,
`corrections`, `rtt` and `queue` zero.

**A watcher.** The client opens on the loaded segment with a spectator's welcome -- `role: 'spectator'`, `team` null,
`queue` 0, the id `REPLAY_WATCHER_ID` (-1: no room's, so no recorded `spawn`, `kill`, `hurt` or `flinch` is taken as the
page's own), the roster of the last `players` record at or before the recording's first tick (its players with a side),
the header's `map`, `rules` and protocol, the first snapshot's environment -- so `NetPage` takes the path a spectator
already takes: the fly camera, the spectator's follow, no walk driven. A spectator's welcome draws no banner, so its
`round` (1) and `rounds` (`MAX_ROUNDS`, the create-game default until the recording's `roundStart` names its own) are
read by nothing.

**Playing.** `advance()` -- the mode's frame loop (`mount.ts`, once a frame) -- hands on every record the clock has
passed, in the file's order: an `event` to the page's listeners as the room broadcast it; a `players` record as the
roster, what differs from the roster before told to the page as the room's lobby would (`left`, `joined`, `renamed`; the
recording carries the room's own `joined`/`left` too, which the page takes twice without harm); a `snap`'s environment
on the page's world by `NetClient.takeEnv`'s rule (an older round's not laid, a revision no newer dropped, a later
round's resetting the world first; the joiner's first silently, `JOIN_SILENT_READING`); an `end` marks the recording
played out. A `mark` is PT-20's (the timeline); a `cmd` is never played (spec 4.1).

**The bodies on the replay's clock** (the plan's review focus 4). `bodies(now)` takes the clock's tick for `now` and
interpolates the two snapshots around it by `NetClient.bodies`' law (the feet, the yaw the short way round, the pitch;
the rest from the newer; a body missing from the newer gone) -- with no interpolation delay (`INTERP_DELAY_MS` is a
network's margin; every snapshot is in hand). `viewTick` and `serverTick` are that tick. Paused, the tick does not move,
so two frames give identical bodies; at any speed the tick only rises, so the snapshots' order holds (the test samples
120 frames at 4x).

**The clock** (`ReplayClock`, pure, the wall clock injected): the recording's own `tickHz` times the speed, rebased at
each change of play, speed or place, clamped to the recording's first and last tick. `play`, `pause`, `toggle`;
`speed(r)` for 0.25-4x (spec 4.8; any other refused), and `faster`/`slower` walking `REPLAY_SPEEDS_PLACEHOLDER`;
`step(+1)` the first snapshot after the tick, `step(-1)` the last before it, paused there; `seek(tick)`. The replay starts
playing at 1x on the first tick when the segment opens (a choice of this adaptation).

**Seek** (spec 4.1, `SEEK_SNAPSHOT_RULE_ADAPTATION`; the plan's review focus 1 and 2). To the snapshot at or before the
target (`seekIndex`) for the world: it is reset and that snapshot's environment laid silently, as a joiner's. The roster
is state, not a transient, so it becomes the last `players` record at or before the **target** tick -- not the
snapshot's: the room writes a `players` record at any tick and the snapshots fall on every other one, so a leave at 301
sought to 301 would otherwise keep the leaver for good, no `left` ever told (the review's F1, 2026-10-08; the plan's
review focus 1 words it as the snapshot's, which is the same tick only when the change falls on a snapshot). What
differs is told as above (a seek back across Bravo's leave tells `joined`; a leave or a join between the snapshot and the
target is in the roster restored: the tests "the roster is state" and "a join between the snapshot and the target").
Every record at or before the target is behind the playhead and no event of it is played -- the events between the
snapshot and the target are skipped, never replayed -- and play goes on from the target, so playing on from 350 hears
400 alone (the brief's case). A step on is play (what lies
between is heard); a step back is a seek; End seeks to the last tick, and Home to the round's first tick
(`seekStart`: the first `roundStart`, else the segment's first tick; since RE-6, research 249 §2 -- before it, the first tick).

**Closed by PTT-6 (§7, W37.R4), but for what §7.2 lists as owed.** As PT-18 left it:
**What a seek does not restore** (owed, not in PT-18's brief): the HUD's scoreboard keeps the last `score` it heard until
the next one; the round's clock keeps the last `roundStart`/`score` it heard; a body killed in the skipped span is drawn
by its snapshot's flags, not its death clip; ~~DEMOLITION's bomb, the turrets and the switches (`main.ts`'s
`acts.follow(net.client)`) do not follow the replay -- the branch hands them nothing~~ (wrong, corrected 2026-10-09 at
PTT-6's review, F1: `main.ts` calls `acts.followNet()` every frame, and `matchActions.ts` `followNet` follows
`net.client` whenever it changes -- the replay's client too -- so those pages have followed the replay since e39c74eeb;
§7). Each is a later task's to place (the timeline's seek in PT-20 needs the first two most).

**Closed by PT-19 (§3): the animation was on the wall's clock** (the review's F2, 2026-10-08; the merge controller's
window on `netPage.ts`, 2026-10-08T14:53Z). As PT-18 left it: pause and speed held the bodies' positions (they are
interpolated on the replay's tick) but not their animation: `NetPage.frame` hands `remote.frame` the frame's wall-clock `dt` (`packages/viewer/src/netPage.ts:1090`,
`this.deps.remote.frame(dt, this.client.bodies(), camera)`), and `RemotePlayers.frame` advances each body's gait, its
flinch and death clips and its fades by it. The replay needs that `dt` scaled by the replay's clock: 0 while paused, `dt`
times the speed while playing (the tick's own advance over the frame, divided by `tickHz`, is the same thing), and a
seek's or a step's jump not run as elapsed time. That line was outside PT-18's window; §3 gives the rule as built.

**Closed by W35.R8 (2026-10-08) and PT-19 (§3): Space over the spectator's ruling.** As PT-18 left it: PF.R51 kept
Space as the spectator's "next target" beside ArrowRight (`spectatorView.ts`, the owner's word); in the replay mode the
brief's Space play/pause takes it (the keys below, stopped on the capture phase), so the spectator's "next" is
ArrowRight alone there. W35.R8 settled it so: in the replay mode only, Space is play/pause and "next" stays on ArrowRight
and the pad; the live spectator's Space is unchanged (§3, with its test).

**The keys and the bar** (`controls.ts`, the brief's): Space play/pause, `,` and `.` one snapshot back and on, `[` and
`]` the speed table, Home and End. They are taken on the window's capture phase and stopped there. The spectator's own
keys (`spectatorView.ts`) read Space as "next player" on keyup; in the replay mode Space is the replay's and the
spectator keeps ArrowRight and the pad's Right for "next" (W35.R8, §3). The bar, fixed at the page's foot, says
"REPLAY", play or pause, the speed, the tick and the last tick, and "partial" for a live segment's prefix.

## 2. The load, the route, the refusals

**The address (W35.R2).** `?replay=` takes an absolute http(s) URL on `localhost` or `127.0.0.1` (`checkReplayUrl`),
never a path: a page has no file system, and a path on the dev server would mean copying evidence into the tree. Any
other host or scheme is refused in words before anything is fetched.

**The load (W35.R1).** `loadSegment(url)`: `fetch` (no cache); bytes that begin `1f 8b` are a closed segment's gzip
(research 240 §1) and go through the platform's `DecompressionStream('gzip')` (fed a `Response`'s body stream: the
browser's, Node 22's and jsdom's alike, so the tests run the page's path) -- and any other bytes are read as they are (a
live segment's flushed prefix); then `decodeRecords` with its default protocols. The segment says which it was
(`closed`). The mode keeps a load for the page's later room builds (a map's reload of the room) only once it has loaded
as a closed segment: a failed load, or a live prefix (which grows as the page records), is fetched again at the next
build (the review's N3; the test "the load is kept ... only when it is a closed segment").

**The protocols (PT.R10).** `decodeRecords` accepts the protocols this build holds a decoder for, `REPLAY_PROTOCOLS` --
10 (NET-WIRE's frozen `decodeSnapshotV10` and `decodeCommandsV10`, pinned by `test/netCodecV10.test.ts` and
`fixtures/snapshot-v10.hex`) and 11 (the live codec) -- and its `allowProtocols` only narrows that list: a protocol
without a decoder is refused whether listed or not. The page passes nothing, so it plays exactly the protocols a decoder
exists for, and refuses every other, never guessing.

**The refusals, in words.** Each becomes a `ReplayLoadError` whose message is a sentence for the player; the
`ReplayClient` built on a refused load makes the room `refused` with it, so `NetPage` posts it in the message window and
its status says it (`refused`, the reason) and it does not retry -- never a blank room (the plan's review focus 3):

| case | the sentence |
|---|---|
| another wire protocol | This recording was made with network protocol P; this build plays protocols 10 and 11. |
| another file format | This recording's file format is version F; this build reads version 1. |
| no header first | This file is not a replay recording (it has no header). |
| no bytes | The recording is empty. |
| a first record cut short | The recording holds no whole record yet. |
| a gzip that does not inflate | The recording is not a readable gzip file. |
| a corrupt record | This recording is damaged and cannot be played (the decoder's reason). |
| an HTTP error | The recording could not be fetched (HTTP n). |
| no answer | The recording could not be fetched (the session service did not answer). |
| an address off this computer | The replay address must be a web address on this computer (localhost or 127.0.0.1). |
| a map the page cannot open | This recording is of map M, which the page could not open. |

**A cut tail is no error** (review focus 3). `decodeRecords` reports a trailing partial record as `truncated`; the
client plays every whole record, its last tick the clock's end, and says partial (`partial()`: truncated, or whole with
no `end` record -- a segment whose socket closed, research 240 §5). The bar shows it.

**The map is the header's.** The page has loaded the address's `map=` (or the last map) by the time the segment arrives.
When the header names another, the mode reopens the page once with `map=` set to the header's stem, every other
parameter kept (`replayMapAddress`), and the room is refused meanwhile with "Opening the recording's map, M."; when the
address already names that map and the page still shows another, the room is refused with the sentence above -- no
reload loop.

**The route (W35.R2).** `GET /segments/<n>.s2r` on the session service (`mountSegments`, mounted ahead of the routes
already there, one line in `service.ts`):

- `<n>` is matched on the raw path as an exact non-negative index -- `0`, or a digit 1-9 then digits -- before anything
  is decoded or joined: `x`, `../`, an escape (`%30`, `..%2F`), a leading zero, `-1`, `1e3`, the `.part` name itself or
  more path after it is 404, as is an index with no file;
- the file is the session's `segments/<n>.s2r` (closed, gzip), else, while that segment is open, `segments/<n>.s2r.part`
  (its flushed prefix, plain; spec 4.8: the investigators may open "the live one's flushed prefix"), as it is on disk:
  `application/octet-stream`, no `content-encoding` (the page inflates it itself), `cache-control: no-store`;
- the peer and Origin rule is `/report`'s (`local.ts`: a loopback peer, and no Origin or this host's page), else 403 --
  a foreign Origin, `null` included; a method other than GET or HEAD is 405;
- `Access-Control-Allow-Origin` is sent for one origin, the session's own dev server's: the origin of the record's launch
  address (`SessionRecord.launch.url`, `http://localhost:<dev port>`, written by the CLI from `DEV_PORT`) -- the only
  place the service knows that port -- and only when the request's Origin is it (with `Vary: Origin`). Another page on
  this host is served (the `/report` rule) but gets no allowance, so its script cannot read the bytes; a launch address
  that is not this host's page allows none.

### 2.5 Placeholders

One named stand-in, a chosen value with no original (a browser adaptation has none); it is in research 101's excluded
names (§5) so the round's ledger places it. The other choices below carry no suffix because they stand for no value the
original holds; they are listed so the choice is on record.

| name | value | where | status |
|---|---|---|---|
| `REPLAY_SPEEDS_PLACEHOLDER` | the speeds `[` and `]` walk: 0.25, 0.5, 1, 2, 4 | `packages/viewer/src/replay/clock.ts` | a chosen table: the spec gives the range (0.25-4x), not its steps; doubling is this port's choice; an owner may change it |
| `REPLAY_WATCHER_ID` | -1, the replay watcher's id | `packages/viewer/src/replay/replayClient.ts` | a sentinel, no value: any id no room gives |
| (the start) | the replay plays at 1x from the first tick when it opens | `packages/viewer/src/replay/replayClient.ts` | a chosen behaviour of the adaptation |
| (the keys) | Space, `,` `.`, `[` `]`, Home, End | `packages/viewer/src/replay/controls.ts` | the brief's keys; Space displaces the spectator's "next" in this mode (W35.R8, §3) |
| (the animation's scale) | 0 at the recording's end while playing, as paused | `packages/viewer/src/replay/clock.ts` `dtScale` | a chosen behaviour of the adaptation (§3): the tick stands still there |

## 3. The spectator modes in the replay (PT-19)

Written 2026-10-08 for PT-19. The code: `packages/viewer/src/replay/clock.ts` (`dtScale`), `replay/replayClient.ts`
(`dtScale`), `replay/controls.ts` (its header, W35.R8), and the window's one line in `packages/viewer/src/netPage.ts`
(`NetPage.frame`) with its sentence on `NetPageDeps.client`. The test: `packages/viewer/test/replaySpectate.test.ts`
(jsdom).

**The host is the page's own.** The brief asked for a new `replay/spectate.ts`: a `SpectatorView` host over the replay's
bodies. The page already holds that host. `NetPage`'s constructor makes one `SpectatorView` for every page -- `bodies` the
client's, `seat` the client's role and id, `spectate` the deps', `views` the deps' `scenicViews` -- and in the replay mode
its client is the `ReplayClient`. So `bodies` are the recording's, interpolated on the replay's tick (§1). `seat` is a
spectator's with no body of its own (`role` 'spectator', `self` `REPLAY_WATCHER_ID`, which no body has). `spectate` is
`matchNet.ts`'s `deps.spectate`, the fly camera's `setPose`: the live spectator's. `views` is `matchNet.ts`'s
`scenicViews(p.map())`, the page's loaded map. That map is the segment's own, since the mode reopens the page on the
header's map (§2), and `loadMap.ts` reads its views through `scenicViewsOf` and `scenicViewsFromRdr`
(SCENIC_VIEWS_READING). The keys reach the view through `NetPage`'s keyup listener, and the pad through `main.ts`'s
`net.spectatorPad`. A second host under `replay/` would act twice on every key, pad edge and frame against the one fly
camera, so none was added. `replay/` holds no mode number, name or cycle order of its own: a correction to
`spectatorView.ts` applies to the replay unchanged.

**The readings reused, as they are** (`packages/viewer/src/spectatorView.ts`; `FUN_00295260` D:L139463-139590; research
91's spectator-modes row, `FUN_00295260` L139448; research 179 §9.6, research 232 §5):

- the three modes and X's toggle -- ~~their labels are under question (below)~~ corrected by PT-19b (below);
- the follow pose, `followPose` (`FOLLOW_BEHIND` 24.906, `FOLLOW_OVER` 25.709, `FOLLOW_PITCH` -9.167);
- the controls acting on the release (SPECTATOR_RELEASE_READING);
- Right and Left cycling in seat-id order (SPECTATOR_CYCLE_ORDER_READING, `nextFollow` and `previousFollow`);
- the Triangle jump (`jumpToVisible`, JUMP_TO_VISIBLE_READING, `FUN_00294f40`);
- the scenic step over the map's views (`scenicStep`, `FUN_002ab260`);
- SPECTATOR_START_READING and SPECTATOR_HOSTAGE_READING;
- a followed body that is gone -- dead, or out of the roster and the snapshots -- moving the follow on by `nextFollow`
  from a target no longer present (the first living body by id).

**Under question: the labels of the mode byte** (a reading relayed by the merge controller, pending review; owed below;
kept as the record -- corrected by PT-19b, below).
`spectatorView.ts` and research 91/232 label `FUN_00295260`'s state byte 0 follow, 1 free, 2 scenic. Four cites read it
as 0 free, 1 follow, 2 scenic:

- `FUN_002964f0` D:L140442: the camera is translated only when its +0xf4 is 0.
- `FUN_00297410` D:L140957-140960: the actor-orbit helper (`FUN_00294b40`, handed the address of +0xf4) runs only when
  +0xf4 is 1.
- `FUN_002956e0` D:L139698-139704: +0xf4 is set to 0 when the camera's actor is the local object, and to 1 (the actor
  kept at +0x10c) for another.
- `FUN_00295260` D:L139482-139528: X in state 1 binds the camera to the local object, and X in state 0 returning to a
  remembered 1 follows the actor at +0x18 through `FUN_002956e0`.

That `FUN_00295260`'s state block is the camera's +0xf4 is read from the offsets the two functions share: state +1 is
+0xf5, +0x10 is +0x104, +0x18 is +0x10c and +0x24 is +0x118. If the claim holds, X toggles scenic -> free -> scenic and
follow -> free -> follow, where `spectatorView.ts` toggles follow -> the remembered free or scenic -> follow. It is a
shared parity correction for both pages, with research 91 and 232 re-filed, and not PT-19's. The replay inherits
whatever `spectatorView.ts` does, and its tests compare the replay's view with a live `SpectatorView` over the same bodies
rather than restating a mode order.

**Corrected: the mode byte (PT-19b, 2026-10-08; a reading: re-read by PT-19's review, PT-19b's review and re-review, and the sprint 35 close review).** This is a parity correction to
the shared spectator, not to the replay: `packages/viewer/src/spectatorView.ts` is both pages'. PT-19's fresh review
re-read the four cites above and agreed (high); PT-19b's implementer re-read them at the source and agrees. The state
block is the camera's +0xf4 (`FUN_0029b0c0` D:L142660 hands `FUN_00295260` the camera's +0xf4): 0 free (`FUN_002964f0`
D:L140442; the zoom runs only in 2, D:L140512), 1 follow (`FUN_00297410` D:L140957-140960), 2 scenic. What changed:

- `SpectatorMode` reads 0 free, 1 follow, 2 scenic, and `remembered` (byte 1, the camera's +0xf5) may hold any of the
  three.
- X is `spectatorToggle` (`FUN_00295260` D:L139480-139530). From scenic it remembers scenic and goes free
  (D:L139482-139484). From follow it binds the camera to the local object, remembers follow and goes free
  (D:L139500-139508). From free it goes to the remembered mode (D:L139519): scenic stands the view at the index
  (`FUN_002ab260` step 0, D:L139520-139523), and follow binds the actor at +0x18 (`FUN_002956e0`, D:L139525-139527). A
  remembered free runs neither branch, so X from free then does nothing. So X goes scenic -> free -> scenic and
  follow -> free -> follow, with free the hub; the port had follow as the hub.
- The Triangle jump ends in `FUN_002956e0` (D:L139442). That function writes byte 1 from the mode it leaves -- 0 to 0,
  1 to 1, and 2 kept (D:L139680-139686) -- and enters follow for another actor (D:L139702-139704). In the port this is
  `bindRemembered`: a jump from free leaves remembered free, a jump from follow remembered follow, and a jump from
  scenic keeps it.
- `SPECTATOR_START_READING` re-read (the name kept). The camera's initialiser `FUN_00299150` writes +0xf4 = 0 and
  +0xf5 = +0xf4 (D:L141664-141665) and the scenic index -1 (+0x110, D:L141666). The constructor `FUN_0029b5d0` does the
  same (D:L142860-142862) and ends by binding the local object (D:L142875-142876), which leaves the mode and byte 1 at 0
  (D:L139681-139682, D:L139699-139700). So remembered free and index -1 are read. (The relayed "D:L141663-141664" for the
  two byte writes is D:L141664-141665; D:L141663 writes +0x148.) D:L76134-76135 and D:L152598-152599 write the game
  object, not the camera (dot's correction), so they are not the start. ~~The mode a spectator enters is open (§3.1), and
  the port keeps follow until it is read.~~ The mode is read in the fix round (below): free.
- **The fix round (2026-10-08; the review's F1-F3; a reading, re-read by PT-19b's re-review and the sprint 35 close review).** The start is free. The online set-up
  `FUN_00599b60` makes the object the local one (D:L455685) and, past every arm -- the spectator's, which skips the
  initialiser (D:L455693-455698), included -- calls the camera's vtable +0xc on it (D:L455701). That slot of
  `CAppCamera`'s vtable (`PTR_PTR_00406170`, D:L142824) is `FUN_0029b3c0`: on the disc ELF the word at 0x406170 is
  0x3efd50, whose first word names `CAppCamera`, and the word at 0x40617c is 0x0029b3c0 (read with a throwaway script,
  the ELF's program headers mapping the address; nothing of it in the tree). `FUN_0029b3c0` calls `FUN_002956e0` on the
  object (D:L142768), the local one, so the mode is 0, free (D:L139699-139700), and byte 1 stays 0 (D:L139681-139682).
  `SPECTATOR_START_READING` is `{ mode: 'free', remembered: 'free', scenic: -1 }`. With a remembered free, X from the
  start does nothing (D:L139519): the spectator leaves free by Right, Left, Triangle, Up or Down. The free camera's pose
  at entry -- where the spectator's object stands -- is `SPECTATOR_ENTRY_POSE_PLACEHOLDER` (§3.2): the port hands no pose,
  and the fly camera stays where the page has it. The same slot is the cycle's bind (D:L412618, D:L412675), so Right and
  Left write byte 1 as the jump does (`bindRemembered` in the cycle).
- Research 91's row (§0) and its §12 paragraph, and 232 §5.1-5.2 and §5.8's row, carry `> Superseded by research 244
  §3` lines or struck text; the old labels are kept as the record.

The tests: `spectatorView.test.ts`, PT-19b's block (the X table over all nine mode and remembered pairs, and the bind's
remembered; the start; follow -> free -> follow and scenic -> free -> scenic on the live view; the jump from free and from
scenic; the fix round's start and the cycle's bind), and `replaySpectate.test.ts`, the same cycle on the replay's own
`NetPage`. Two older assertions of `spectatorView.test.ts` expected follow after X from scenic and now expect free. Those
changes are corrections, not regressions. In the fix round, the assertions that took the first frame to follow the first
living body (`spectatorView.test.ts`'s Triangle and hostage rigs, the dead player's untouched mode, the map without
views; `replaySpectate.test.ts`'s opening, Triangle, leaving-body and W35.R8 tests; `netPageGame.test.ts`'s spectator
wiring) now open free and follow on Right: corrections to the old start, not regressions.

**W35.R8, the keys.** In the replay mode Space is play and pause (`controls.ts`). It is taken on the window's capture
phase and stopped there, so `NetPage`'s keyup listener never sees it. The spectator's "next" is ArrowRight and the pad's
Right (`leanRight`), which `SpectatorView.key` and `pad` already read; no binding was added. The live spectator is
unchanged: Space on keyup is still its "next" (PF.R51).

**The animation's clock (F2).** `NetPage.frame` hands `remote.frame` the frame's `dt` times the client's `dtScale()` when
the client has that member, and `dt` times 1 when it has not. `dt` times 1 is `dt` exactly, so a live page's number is
unchanged (the test). `ReplayClient.dtScale` is `ReplayClock.dtScale`:

- the speed while playing;
- 0 while paused;
- 0 at the recording's end while playing, because the tick stands still there (a choice, §2.5);
- 0 for the first frame after a seek or a step, because the jump is no elapsed time: no gait, flinch, death clip or fade
  runs across it;
- 0 before the segment opens and once it is closed.

The page reads it once a frame, and that read takes the jump. The bodies' positions were already on the replay's tick
(§1); their animation is now on it too.

**The evidence** (unit tests, jsdom; no browser, game, dev server or match server was run). `replaySpectate.test.ts`
plays a recording of three bodies on a watcher's `NetPage` through the factory:

- the replay opens free with no pose (the fix round); Right follows the first living body, and Right and Left cycle 5,
  9, 3, 9, 5, as a bare `SpectatorView` does over the same bodies;
- Triangle takes 5 for `spectatorView.test.ts`'s feet;
- Up and Down walk the views, and after every press of X, Triangle, Right, Up or Down the replay's view is in the live
  view's state, its camera at the live view's pose -- the modes compared, not restated;
- MP2's six views, read off its `mission.rdr`, are walked in file order (fixture-backed; skipped without
  `test-fixtures/`);
- a followed body that leaves the roster at tick 100 moves the follow on as the live view's does;
- Space plays and pauses with the bar mounted, and ArrowRight and the pad step the follow;
- the live page's Space still steps;
- `dtScale` at the clock and on the page: paused, two frames at the same phase; at 2x, twice the wall's `dt`; a seek's
  frame and a step's give 0;
- a page with no factory hands `remote.frame` the same `dt`.

### 3.1 Owed

- ~~**The mode byte's labels** (above): a shared parity correction to `spectatorView.ts` for both pages, research 91's row
  and 232 §5 re-filed, and `SPECTATOR_START_READING` re-read with it. It is its own task; PT-19 did not change
  `spectatorView.ts`.~~ Closed by PT-19b, 2026-10-08 (§3, "Corrected"): a reading.
- ~~**The mode a spectator enters, at its entry and after a round** (`SPECTATOR_START_READING`'s `mode`; PT-19b). The
  camera's initialiser gives free (D:L141664). But the online spectator's arm of the local object's set-up skips the
  initialiser (D:L455693-455698: `FUN_00543d50` instead of `FUN_00299150`), and whether any call binds a spectator's
  camera to another actor at its entry or at a round's start is unread; such a call (a `FUN_002956e0`) would enter
  follow. The port keeps follow of the first living player. Settled by those callers, or by a capture of a spectator
  joining and of a round turning over.~~ The entry read in the fix round (§3): free, by the set-up's bind of the local
  object (D:L455701 -> `FUN_0029b3c0` -> D:L142768). Still owed, two parts:
  - **The entry pose**: `SPECTATOR_ENTRY_POSE_PLACEHOLDER` (§3.2).
  - **The round's turnover**: which of the camera's binds and initialisations run when a round turns over, and so
    whether a spectator's mode is reset to free there. Read so far: D:L49732 (`FUN_001ea720`) and D:L151885
    (`FUN_002abd40`) bind the local object; D:L151957 (`FUN_002ac0e0`) passes 0, which `FUN_0029b3c0` ignores
    (D:L142748); the initialiser's callers are D:L75869, D:L149685, D:L150568 and D:L150604. Which of these functions a
    round's turnover runs is unread. The port does not reset the mode at a round (`SpectatorView.reset` clears the bench
    only). Settled by identifying those callers, or by a capture of a round turning over with a spectator.
- ~~**The cycle's bind** (`SPECTATOR_CYCLE_ORDER_READING`). Right and Left end in the camera's vtable +0xc
  (D:L412618, D:L412675). If that slot is `FUN_002956e0`'s, the cycle writes byte 1 as the jump does. The port's cycle
  leaves `remembered` alone. Unread: no dump of the camera's vtable (`PTR_PTR_00406170`, D:L142824) is in the analysis.~~
  Read in the fix round: the slot is `FUN_0029b3c0` (the disc ELF's word at 0x40617c), which calls `FUN_002956e0`
  (D:L142768); the cycle applies `bindRemembered` (a reading).
- **The magnification**: X from scenic and the bind from scenic reset the zoom's magnification to 1
  (D:L139485-139498, D:L139687-139697). The port has no scenic zoom (it runs in 2 only, D:L140512), so there is nothing
  to reset. This is owed with the zoom.
- ~~**Not seen rendered**: the spectator on a replay has not been seen in a browser; PT-23's run is where it is.~~ Seen
  rendered by PTT-7 (§7.3), 2026-10-09: X, Right, Up and Down on a replay, each on the camera.

### 3.2 Placeholders and readings (PT-19b)

The shared spectator's names that PT-19b re-read or added (`packages/viewer/src/spectatorView.ts`); the rest of that
file's names are research 232 §5.8's. Each is a row of research 101 §4 under PF-31's owner.

| name | value | source | status |
|---|---|---|---|
| `SPECTATOR_START_READING` | `{ mode: 'free', remembered: 'free', scenic: -1 }` | `FUN_00299150` D:L141664-141666; `FUN_00599b60` D:L455701 -> `FUN_0029b3c0` D:L142768 -> `FUN_002956e0` D:L139699-139700 | reading; owed: the round's turnover (§3.1) |
| `SPECTATOR_ENTRY_POSE_PLACEHOLDER` | `'the page camera as it stands'`: no pose handed at entry | `FUN_0029b3c0` D:L142748-142781 places the camera from the local spectator object, whose placement is unread | placeholder; settled by reading the spectator object's placement (`FUN_00599b60`, `FUN_00543d50`) or a capture of a spectator joining |
| `SPECTATOR_CYCLE_ORDER_READING` | `'actor list'` (seat ids stand in) | `FUN_00546fa0` D:L412590-412615; the bind D:L412618, D:L412675 -> `FUN_0029b3c0` | reading; the bind read in the fix round (`bindRemembered` in the cycle); owed: `FUN_00547170`'s walk by slot |

## 4. The embedded viewer and the timeline (PT-20)

Written 2026-10-08 for PT-20 (the plan's brief "PT-20"; spec 4.8, "Embedded in the report" and "Marks are shown on the
timeline"; W35.R3; the plan's review focus 5). The code: `packages/viewer/src/replay/embed.ts` (the seek message, the
seek), `replay/timeline.ts` (the bar and its arithmetic), their wiring in `replay/mount.ts`;
`packages/playtest/src/report/page.ts` (`replayFrameSrc`, the card's seek, the script's click and the replay section's
arrival; the font whitelist `dsFontNames`/`dsFont`), `report/http.ts` (`reportOrigin`; `GET /fonts/<name>`),
`segmentsHttp.ts` (`GET /segments`, `segmentListing`), `closeout.ts` (`CloseResources.kept`, `stopKept`) and `cli.ts`
(the dev server kept; `dispose` through `stopKept`). The tests: `packages/viewer/test/replayEmbed.test.ts`,
`replayTimeline.test.ts` (jsdom); `packages/playtest/test/reportPage.test.ts` (jsdom), `reportHttp.test.ts` and
`segmentsHttp.test.ts` (a real `SessionService` on port 0), `closeout.test.ts`. **No parity finding**: all of it is the
replay's or the report's adaptation (`REPLAY_ADAPTATION`, `PLAYTEST_INSTRUMENT_ADAPTATION`), changing no game value or
behaviour. The evidence here is unit tests only; no browser, game, dev server or match server was run by PT-20.
~~The embedded replay has not been seen rendered (PT-23).~~ Seen rendered by PT-23 (§4.2, §5): the iframe, the post
across the two origins and the timeline; the reopen across segments by PTT-7 (§7.3).

**The report's iframe.** `renderReport(record, 'live', { origin })` embeds the replay when, and only when, the page is
the live one, the record is closed, the service handed the report's own origin, the launch address's origin is this
host's page (`devOrigin`, the segment route's rule) and a segment is recorded:
`<dev origin>/testroom?devmode&replay=<report origin>/segments/<first>.s2r&embedder=<report origin>&map=<its map>`,
each value URI-encoded. The report's origin is `reportOrigin(Host, port)`: the Host the page was asked on when it is
`localhost` or `127.0.0.1` on the service's own port, else the service's own `http://127.0.0.1:<port>` -- so the
embedder the iframe names is the origin its messages come from. The test room's origin is the launch address's own
(the CLI writes `http://localhost:<dev port>`), not a `localhost` rebuilt from the port as the brief words it: the
segment route's CORS allowance names that exact origin (§2), and a `127.0.0.1` launch would otherwise fetch nothing.
`map=` is the segment's own (from the record), sparing the mode's reopen on the header's map (§2); the iframe carries no
`playtest=`, so the replay records nothing. Before closeout, without a known dev port or a report origin, there is no
iframe; the static page (the export's ZIP) never has one.

**The seek per observation.** A closed record's card with a tick has a button (`data-seek-segment`, `data-seek-tick`);
the page's script posts `{ type: 's2u-replay-seek', segment, tick }` to the iframe's window, `targetOrigin` the origin
of the iframe's own `src`, never `*`. Without the iframe (the static page, or no dev port) the card says the moment as a
plain line, "In the recording: segment n, tick t". The event stream's swap inserts the replay's section once when the
close arrives and never replaces it (a later event does not reload the replay). The old link `?replay=<n>&tick=<t>`
(research 247 §2, item 5) is gone.

**Nothing internal shown.** The iframe's `src` is the one place the page writes the two local servers' ports: an
attribute the browser needs and the player does not read. The report's forbidden-strings test is adjusted
deliberately for it: the visible text is scanned for `:53`, `C:/`, `wt-` and `agent/`, and the whole page with the
iframe's `src` removed; the live page before closeout and the static page are still scanned whole. `scrub` and its
tests are unchanged.

**The listener (`embed.ts`; review focus 5).** On a development build with `?devmode` only (the mode's own rule, held
again in `mountEmbed`): `embedder=` is taken only as an http(s) origin on `localhost` or `127.0.0.1`, written exactly
as an origin (no path, no user, no trailing slash); else no listener exists. A message is taken only when
`MessageEvent.origin` is that origin exactly and it is `{ type: 's2u-replay-seek', segment, tick }` with both
non-negative safe integers; any other is ignored. The seek (`replaySeeker`, the timeline's too): when
`<origin of the address playing>/segments/<segment>.s2r` is the address playing, the client seeks once open (§1's
seek); else the page reopens on that address with `tick=<tick>` (`seekAddress`: `replay=` and `tick=` set in place,
every other parameter kept; since RE-6, `map=` the target segment's from the listing, research 249 §2), since another
segment may be of another map and the room is built for one map; and a page
opened with `tick=` seeks there once its segment opens (`seekOnOpen`; a malformed `tick=` is no seek). A seek leaves
play or pause as it was.

**The timeline (`timeline.ts`).** One session clock: the segments end to end in index order, each as wide as its last
tick less its first (one at least), the boundaries between them drawn, each mark at its segment's place plus its tick
past the segment's first tick, the playhead at the tick playing, a click seeking to the segment and tick under it (a
boundary is the later segment's first tick). The arithmetic is pure and exact in ticks (`layoutTimeline`,
`positionOf`, `seekAt`, `boundariesOf`); the test lays two segments (0..500 and 100..400: the boundary at 62.5 %, the
marks at 15 % and 87.5 %, both ways). The segments and marks are the service's listing when the replay address is a
session segment's (`GET <its origin>/segments`); without one, the segment playing alone with its own `mark` records. The
bar sits above the replay's own (§1), drawn once a frame, taken away with it.

**`GET /segments`** (added to `segmentsHttp.ts`, PT-18's file, under the brief's allowance): read-only JSON
`{ segments: [{ index, map, closed, start, end }], marks: [{ segment, tick }] }` -- each segment the record holds whose
file is there (closed the gzip, else the open `.part`), its map the record's, its first and last tick read from the
file's records (null when it does not decode), and each observation with a tick. The peer, Origin and CORS rules are
`/segments/<n>.s2r`'s (§2): a loopback peer, no Origin or this host's page, else 403; GET or HEAD, else 405; the
allowance for the launch's origin only.

**Closeout keeps the dev server (W35.R3).** `CloseResources.kept` names the servers the closeout leaves running; the
CLI's is the dev server, and the closeout stops only the match server. Its history line says so: "the session's
servers were stopped (1); the dev server was kept running for the report's replay until dispose". `dispose` stops it
through `stopKept`, which names a server only when it was running (so twice is harmless); the closeout's order test
holds both. The owner row (informational) is the plan's, numbered at the PR.

**The fonts (research 247 §3, closed there).** `GET /fonts/<name>` serves `shared/fonts/<name>` as `font/woff2` for
exactly the names the design system's whitelisted CSS gives in `url('/fonts/<name>')` (`fonts.css`'s three), read from
the CSS, never a walk of the directory: the licences and any other file are 404, a name with `..` or a slash 403, and
`/ds/../x` stays 403.

### 4.1 Choices of this adaptation

No new named stand-in: none of these stands for a value the original holds. They are listed so the choice is on record.

| choice | value | where |
|---|---|---|
| (the first segment) | the iframe opens on the record's lowest segment index, at its first tick | `packages/playtest/src/report/page.ts` `replayFrameSrc` |
| (a seek across segments) | reopens the page on the other segment's address with `tick=` and (RE-6, research 249 §2) `map=` the listing's for that segment, waiting at most `REPLAY_LISTING_WAIT_MS_PLACEHOLDER` for it | `packages/viewer/src/replay/embed.ts` `replaySeeker` |
| (a seek's play state) | play or pause kept as it was | `packages/viewer/src/replay/embed.ts` |
| (a segment's width) | its last tick less its first, one tick at least | `packages/viewer/src/replay/timeline.ts` `layoutTimeline` |
| (the bar's look) | 12 px high, above the replay's bar; marks in the design system's gold | `packages/viewer/src/replay/timeline.ts` `mountTimeline` |

### 4.2 Owed

- ~~**Not seen rendered**: the iframe, the button's post across the two origins, the reopen across segments and the
  timeline have not been run in a browser; PT-23's acceptance run is where they are.~~ Seen rendered by PT-23 (§5),
  2026-10-08: the iframe, the post across the two origins and the timeline. ~~The reopen across segments is still owed
  (§5, "Not covered").~~ The reopen across segments seen rendered by PTT-7 (§7.3), 2026-10-09.
- ~~**What a seek does not restore** (§1's list) holds for the report's seek too: the scoreboard and the round's clock
  keep what they last heard.~~ Closed by PTT-6 (§7): the report's seek is the client's seek, and folds as it does.
- **The export's static page** still carries no fonts (research 247 §1): it falls back to the design system's fallback
  faces.

## 5. The acceptance run (PT-23)

Written 2026-10-08 for PT-23 (the plan's brief "PT-23"; spec §6, "the brief's end-to-end acceptance scenario", and
§4.5-4.8; W35.R3, W35.R7). The spec: `packages/viewer/e2e/playtestLoop.spec.ts`, in the form of `playtestMark.spec.ts`
(the `SessionService` in the test's process on `playtestPort()`, the page on the e2e's own Vite). **Evidence kind: a
rendered browser run** -- headless chromium 153 (ANGLE over SwiftShader) on the e2e's Vite, Playwright with one worker,
the service on 5308 and Vite on 5306 (W33.R4) -- kept apart from the packages' unit tests (§1-4). **No parity
finding**: the loop is the playtest instruments' and the replay's adaptation; the run plays the game only to make a
recording of it.

**What the spec holds**, in one test, in this order:

1. **Start.** A session record whose `launch.url` is the address `start` builds (`pageUrl`, `cli.ts` `laneUrl`) on the
   e2e's own Vite origin -- so the segment route's CORS allowance (W35.R2) and the report's iframe (§4) name it; the
   closeout's resources registered as `start` registers them (`makeCloseResources`, no match server offline, a dev
   server `kept`, W35.R3). The page opens `/testroom?devmode&mode=play&map=MP2&noarmory&playtest=...` offline, joins the
   session (the hook's `playtest().session`), walks (W held `WALK_S`, 1.5 s), stands (`STAND_S`, 1.5 s) and presses
   F8: one observation, with a tick.
2. **The player's words** through the `observe` verb (`POST /verb`, `by: player`): merged into the mark (spec 4.5's
   window), `source: both`, the words kept verbatim.
3. **The report** (`GET /report`, opened in the browser while the session is live) shows the card with the words and
   the frame, and no replay yet.
4. **Close** through the verb: the frozen record (`player`), the play page closed by the closeout, the segment closed
   `closed` (the page confirmed its flush), the history line "the dev server was kept running for the report's replay
   until dispose", the kept server's stop NOT called, and the e2e's Vite still answering (`/maps/index.json`). The
   summary has the player's words and none of: the two ports, `localhost`, `127.0.0.1`, `ws://`, `http://`,
   `.playtest`, the temp root, a drive path.
5. **Handoff**: the CLI (`cli.ts handoff --dir <session> --out <temp>`, a child process through tsx) refuses while the
   observation is undecided (exit 1, "the handoff is refused", the id, no file); `decide` (`none`, with its reason)
   through the verb; the CLI then writes the record under the temp directory -- never the repository's docs -- with the
   id, the words, "no action", and no port, address or path.
6. **The report's embedded replay.** The report page open since step 3 gains the replay's iframe at the close (its SSE
   swap), `src` exactly `<vite origin>/testroom?devmode&replay=<report origin>/segments/0.s2r&embedder=<report
   origin>&map=MP2`; the card's button carries the mark's tick. In the iframe (the e2e's Vite origin, cross-origin to
   the report): the replay opens (`__viewer.net().state` `open`, the load's hold released, the bar `REPLAY`); Space
   pauses it and Home seeks Home -- the round's first tick, `homeTick`, else the segment's first (RE-6, 249 §2; the replay's keys, the iframe focused); **the timeline** shows one mark and no
   boundary, the mark where the session clock puts it (`(tick - start) / (end - start)`, from the decoded segment's
   first and last tick, within 0.001 %); **the card's button** posts the seek across the two origins and the replay
   seeks in place, still paused: the bar reads `paused 1x tick <the mark's tick> / <end>` and the playhead stands on the
   mark; **`__viewer.net()`'s bodies** are the recording's at that tick -- the same ids, each foot within
   `LOOP_FEET_TOLERANCE_PLACEHOLDER` of the two decoded snapshots around the tick interpolated by the replay's law
   (`ReplayClient.bodies`) -- and the player's own body (the telemetry's `net.id`) is within `MARK_FEET_TOLERANCE` of
   the feet the mark's telemetry recorded and more than `LOOP_WALKED_MIN_PLACEHOLDER` from where it stood at Home
   (`homeTick`, 249 §2). No page error on the play page, the report or the replay.
7. **Dispose** through the verb: `stopped` is exactly "the dev server" (the stand-in, stopped once) and "the session
   service", which stops answering.

A second test, serial on the first's mark: **the focused retest's placement** (PT-22, W35.R7) rendered. A new session
service on the same port, its record's `retestOf` and `launch.url` as `start --retest` prepares them
(`retestOptions` on the observation and its telemetry, `retestPlace` on MP2 offline: `start: mark`), the page opened
with `&retest-at=` offline: the hook's `playtest().retest` reaches `placed` -- only after the room's first round, by
the page's own rule -- and the feet stand within the page's own reach of the mark's (`RETEST_PLACE_REACH`), and still
do two seconds later.

**The runs** (2026-10-08, `agent/playtest-pt23` on 2e7148dcc, each after the host lock read FREE): the first failed in
step 6 on the spec's own keys (a press on the iframe's `body` does not give the iframe the focus, so the replay played
on to its end) -- no missing part in the sprint's code; fixed by focusing the iframe element. The second, green: 2
passed, 0 failed, 0 skipped, 35.2 s. The tolerances were then tightened to the ones above (the player's own body from
5 units to the wire's step), and the third, the spec as committed, green: 2 passed, 0 failed, 0 skipped, 35.1 s.
`playtestMark.spec.ts` once beside it: 1 passed, 0 failed, 0 skipped. Measured in the third run: segment 0, 1225
records, ticks 0-780 at 60 Hz, the mark at tick 650; the walk moved the player 92.6 units; the replay's body at the
mark `[795.75, 100, 706.25]` against the telemetry's `[795.730, 100, 706.196]` (the wire's 1/8-unit step); the retest
placed the feet within 1e-4 units of the mark's.

**Not covered** (owed, each named; the first three seen rendered by PTT-7, §7.3, 2026-10-09):
- ~~**The reopen across segments** (§4: a seek to another segment reopens the page with `tick=`): the run records one
  segment; a second needs the map, the mode or online changed in the session (a second room's load). Owed to a later
  run.~~
- ~~**The spectator modes on the replay** (§3.1, "Not seen rendered"): the replay rendered in its entry view; no mode key
  was pressed. Still owed.~~
- ~~**A live segment's prefix** (§2, `.s2r.part` while open) was not played: the replay opens only after the close.~~
- ~~**The bar says "partial" for the closed segment.**~~ A defect, fixed by PT-23b (§5.2): the page did not close its
  recording at the closeout, so the segment lost its tail and its `end` record, and the bar said "partial".

### 5.2 PT-23b: the closeout closes the page's recording

Written 2026-10-08 (the PT-23 review's F1 and F2, a defect from sprint 34's PT-13). **The defect.** On the service's
`closing`, the page's `flush()` (`packages/viewer/src/playtestSession.ts`) stopped the video ring, waited for its clips
and answered `flushed`, but never closed the page's `FileRecorder`. That recorder sends its buffer only every
`flushEvery` snapshots (30, `packages/match/src/replay/recorder.ts`) and at `close`, so the segment lost its last
records -- up to 30 snapshots, 59 ticks at 60 Hz, with any mark made in them -- and its `end` record; the service then
closed the segment `closed` anyway (`closeout.ts` step 4, `segments.ts` `close`), and the replay's bar said "partial"
(`ReplayClient.partial()`: no `end` record). Both PT-23 runs' segments ended on a multiple of 60 (720, 780).

**The fix.** `flush()` first closes the recording (`recording.end('closed')`: `FileRecorder.close` -- the buffered
records and the `end`, flushed -- then `segmentEnd`, as the context's rotation and the dispose already do), before it
waits on any clip and so before `flushed`; nothing is recorded after it. The service closes the segment on that
`segmentEnd` (its owner's), and the closeout's own `closeOpen` finds none open. A page that does not answer still has its
segment closed by the closeout, `socket-closed`, as before.

**The evidence**, apart: a unit test, `packages/viewer/test/playtestSession.test.ts` "PT-23b: closing closes the
recording before flushed" -- a page room of 45 ticks (under 30 snapshots, nothing flushed yet) and a mark in it, then
`closing`: the tail's bytes, the mark record, the last snapshot, the `end` (`closed`) and `segmentEnd` all before
`flushed`; nothing recorded after; the dispose ends nothing a second time. RED before the fix (`expected 0 to be
greater than 0`: no byte of the segment had been sent), green after (37/37). A rendered browser run:
`playtestLoop.spec.ts` gains the decoded segment's last record `end` (`closed`), the record's `ticks` its last snapshot's,
and the bar without "partial"; green, 2 passed (37.4 s), its segment ending at tick 828; `playtestMark.spec.ts` once
beside it, 1 passed (that spec closes its page without a closeout, so its segment is `socket-closed`, unchanged).

### 5.1 Placeholders

Test tolerances of the spec, none a game value; the ledger (`tools/test/placeholderLedger.test.ts`) walks
`packages/<name>/src` and `tools/` only, so an e2e constant is listed here and not in research 101, its row marked
*note only* as the ledger reads a name no walked source holds (here: one the walk does not reach, not a gap with no
constant).

| name | value | where | status |
|---|---|---|---|
| `LOOP_FEET_TOLERANCE_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 0.01 units per axis | `packages/viewer/e2e/playtestLoop.spec.ts` | a chosen tolerance: the replay and the spec interpolate the same decoded snapshots by the same law, so they differ by rounding only; 0.01 units is a millimetre at `MetersPerUnit` 0.1 |
| `LOOP_WALKED_MIN_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 10 units, horizontally | `packages/viewer/e2e/playtestLoop.spec.ts` | a chosen threshold: how far the walk must move the body for a seek to be told from none; 1.5 s of W moved 91.5 and 92.6 units in the two green runs |
| `MARK_FEET_TOLERANCE` | (1/8 / 2) x sqrt 2 units, horizontally | `packages/viewer/e2e/playtestLoop.spec.ts` | derived, not chosen: the wire's `FEET_STEP` (protocol 11, `packages/viewer/src/net/codec.ts`), which the recorded snapshot carries, half a step per axis |
| `RETEST_PLACE_REACH` | 5 units, horizontally | `packages/viewer/e2e/playtestLoop.spec.ts` | restated, not new: the page's `RETEST_PLACE_PLACEHOLDER.reach` (`packages/viewer/src/playtestSession.ts`, research 243 §3) |
| `WALK_S`, `STAND_S` | 1.5 s each | `packages/viewer/e2e/playtestLoop.spec.ts` | the run's script, no value of the game |

## 7. The seek's fold (PTT-6, W37.R4)

Written 2026-10-09 for PTT-6 of web sprint 37 (the plan `docs/plans/2026-10-09-web-sprint-37-the-playtest-tooling.md`,
the brief "PTT-6" and review focus 6; ruling W37.R4, an addition to spec 4.1 "Seek"; LATER 18). The code:
`packages/viewer/src/replay/fold.ts` (the table, the fold, what is told) and its call in `replay/replayClient.ts`
(`seekTo`, `welcome`). The tests: `packages/viewer/test/replayFold.test.ts` (node: the table against the union, the bound)
and `replaySeekFold.test.ts` (jsdom: a `NetPage` and a `BombPage` on a `ReplayClient`). **No parity finding**: the fold is
the replay's adaptation (`REPLAY_ADAPTATION`; PT.R3), changing no game value or behaviour; it tells the page only what the
recorded room had told it. The evidence is unit tests only; no browser, game, dev server or match server was run.

**The rule.** A seek still lands on the snapshot at or before the target and skips the events behind it
(`SEEK_SNAPSHOT_RULE_ADAPTATION`, §1). W37.R4 adds the fold: the stateful events from the segment's start to the target
are read into the state they leave, and the page is told that state at the target; the transient ones (a tracer, a sound,
a grenade's arc) are still never replayed.

**The table** (`EVENT_CLASS`): every kind of `ServerEvent`'s union (`packages/viewer/src/net/protocol.ts`), stateful or
transient, in one record. Its type is `Record<ServerEvent['type'], EventClass>`, so the typecheck refuses a kind left out
or one the union lacks; `replayFold.test.ts` reads the union's text (each member's `type: '<kind>'`, and a member named by
its interface, `CombatReport`, by that interface's own) and fails the run the same way, since vitest does not typecheck.
- **Stateful**: `score`, `roundStart`, `roundTime`, `timeExpired`, `eliminated`, `roundOver`, `abandoned`, `countdown`
  (the scoreboard, the round's screens and clock, its phase); `kill` and `spawn` (a body's death, a body alive again with
  its kit and type); `bomb`; `turret`; `drop` and `taken` (the world drops, which the join envelope replaces whole, so
  they must be folded or a seek would clear them); `joined`, `left`, `renamed` (the roster, folded by the `players`
  records as §1 already did); `hostageState` (owed, §7.2).
- **Transient**: `shot`, `impact`, `grenade`, `detonate`, `placed`, `flinch`, `hurtVoice`, `reloadSound`, ~~`victory` (a
  dance: a clip)~~ (stateful since RE-1: a dance running at the target is told as the room's join tells it, 249 §1), `taunt`, `communication`, `chat`, and `action` -- a switch's presentation run (its sounds and effects;
  PF.R26: "no node or valve changed -- the state comes in the snapshot's `env`"), so **the switches' state is folded
  already**: the seek lays the snapshot's environment (§1), which every snapshot names since protocol 11. Every kind sent
  to one page (`welcome`, `refused`, `pong`, `queue`, `promoted`, `demoted`, `hurt`, `stale`, `blast`, `votes`, `kicked`,
  `loadout`, `kit`, `victoryOffer`, `voiceFloor`, `combat`) and the bridge's `gameLobby` is never in a recording -- the
  recorder takes the room's broadcasts (`packages/match/src/room.ts` `broadcast` -> `recorder.event`) -- and is
  transient so that a hand-made one is never folded.

**The fold's path.** `foldTo(records, target, tickHz)` is one pass from the first record to the last at or before the
target, in the file's order (the room's); each stateful event changes the state as the live page's handler changes what it
draws (`NetPage.event`, `BombPage`, `TurretPage`, the drops), in ticks: the clock's end tick from `roundStart`
(start + seconds), a `score`'s `timeLeft`, `roundTime`'s new total, `timeExpired` (zero), stopped by `roundOver` and
`abandoned`; the round's screens from `roundOver`, gone at the next `roundStart` or `abandoned`; a corpse per `kill`, gone
at that body's `spawn`; the drops cleared at `roundStart` and `abandoned` (the page's `newRound` and `abandoned` clear the
air, `main.ts` `roundHooks`). The same pass gives the index play goes on from, so the seek reads the records once.

**What the page is told** (`foldedJoin`): what a page joining the room at the target is told -- the room's own late-join
path, laid silently by the live page's own handlers (`JOIN_SILENT_READING`, PF-28's envelope): **a welcome** with the
fold's `round`, `rounds`, `startTick`, `phase`, `objective` (the bomb), the occupied `turrets`, the launch `countdown`
left, each player's `kit` and type, and the join envelope (`join`: the round end's result at its age, the corpses, the
drops); **then the room's `score`** (a joiner's is sent at once, `room.ts` `scoreDirty`) with its `timeLeft` at the
target. The welcome is the watcher's own (`REPLAY_WATCHER_ID`, a spectator's): `NetPage` takes a second welcome as it takes
a reconnect's, and for a spectator it touches no camera mode (`SpectatorView.reset` clears only a player's bench). It is
told only once a stateful event lies behind the old playhead or the new one (`firstStateful`); a segment without one --
PT-18's fixture -- is told nothing, as before.
- **The scoreboard**: the last `score` at or before the target, drawn by the page's `score` handler (review focus 6: a
  seek back across a score change draws the earlier one).
- **The round's clock**: the `score`'s `timeLeft` set to the fold's clock at the target, which the page counts down from.
  A stopped clock is told by the envelope's result, below; the `score` then carries `null` and leaves it stopped.
- **The round's screens**: the envelope's `result` is the round end's own, at its age (`RESULT_CLOCK_READING`: the screen
  and its seconds left are an existing observer's). With none standing, a result with no screen left is told: the page's
  one silent path that takes a screen down, and it stops the page's clock (`NetPage.joinSinks` `screens`); a running
  clock is then set again by the `score` after it.
- **A body's death -- the choice** (the brief's): **its death clip at its age**, the late joiner's corpse
  (`CORPSE_HYDRATE_READING`, `RemotePlayers.hydrateCorpse`): the pose at that point of the room's clip, held on its last
  key once played (the end pose, for an old death), hidden once `BODY_FADE_S` has run from the death. Not the snapshot's
  flags alone (which drew the body standing in its last stance) and not the clip restarted: the existing code makes this
  one sound, since the envelope is how a joiner already sees a corpse. A corpse is told only for a body the target's
  snapshot holds dead; no kill line, death voice or death camera is run. A body alive at the target clears its clip itself
  (`RemotePlayers.frame`: a dead-to-alive change).
- **The bomb**: the last `bomb` at or before the target as the welcome's `objective`, drawn silently (`BombPage`: the world
  bomb placed, the satchel, no blast, no cue); none before the first `bomb` event, which takes it away.
- **The turrets**: the occupied ones as the welcome's `turrets`, taken late by `TurretPage` (no sound, the hold).

**The bound.** A 30-minute segment at the room's 60 Hz with a snapshot every other tick (`SNAPSHOT_HZ` 30), eight bodies, a
`score` a second, a `shot` each 6 ticks, a kill and a spawn each 10 s and a turret change a minute is 74,197 records;
the fold to its last tick took 0.45-0.54 ms (the best of three, three runs, 2026-10-09, this host, under vitest). The test
holds it under **50 ms** (`REPLAY_FOLD_BOUND_MS_ADAPTATION`, a test's margin, not a game value): a hundredfold margin, so
a loaded host does not flake it, and still under three 60 Hz frames, so a seek stays a few frames' work at worst. Since a
margin can hide a second pass, the test also asserts the work: the records visited equal the records at or before the
target, and a seek to the middle visits half. No checkpoint is needed, so none is made (the brief allowed
`REPLAY_FOLD_CHECKPOINT_PLACEHOLDER` only if the bound needed one; it does not exist).

### 7.1 Placeholders

None. `REPLAY_FOLD_BOUND_MS_ADAPTATION` is a browser adaptation's test margin (the replay code's `*_ADAPTATION` label), no
value of the game and no stand-in for one; `EVENT_CLASS` and the fold's rules are the adaptation's own.

### 7.2 Owed

- ~~**The bomb, the turrets and the switches' presentations do not follow the replay in the test room** (`main.ts`'s
  replay branch never calls `acts.follow(net.client)`).~~ Wrong, corrected at the review (2026-10-09, F1): `main.ts`
  calls `acts.followNet()` every frame after `net.frame`, and `matchActions.ts` `followNet` follows `net.client` whenever
  it is not the one followed -- in the replay branch the `ReplayClient` -- so the bomb, turret, switch and dance pages
  follow the replay, and the fold reaches them (since e39c74eeb, ONE-WIRE; the mechanism's tests are `matchMount.test.ts`'s
  follow tests). Held for the replay by `matchActions.test.ts` "PTT-6 (research 244 §7): followNet follows the replay
  client too, ...": a seek past the plant draws the bomb planted through the part's own `BombPage`. Nothing owed.
- ~~**EXTRACTION's hostages** (`hostageState`, stateful): not folded. The welcome's silent path (`hostages`) needs each
  hostage's name, model and place, which no recorded event carries (they ride only the room's welcome, which is not
  recorded), and the live `hostageState` handler voices the YES and the Lead/Rescue lines. The re-told welcome also empties
  the page's hostage map until the next `hostageState`, and with it **the HUD's hostage compass marks**
  (`main.ts` `hud.setHostageMarks(net?.hostageMarks(...))`, from that map): a seek takes them off the compass until then.
  Owed with the replay of the hostages themselves (a replay's welcome has none today).~~ (done at RE-2, 249 §3)
- ~~**The page's round clock and screens run on the wall clock** (`performance.now()` in `NetPage`), not the replay's: a
  paused replay's timer counts on, and at 4x it counts at 1x. The fold sets them right at the seek; their running is
  `NetPage`'s (the online lane's file), not W37.R4's.~~ (done at RE-3, 249 §4)
- ~~**The timer's figure while the clock is stopped**: the page draws no timer then, so after a seek into a round end the
  HUD keeps the figure it drew before the seek, where the live page keeps the figure at the stop.~~ (done at RE-3,
  249 §4)
- **Projectiles**: ~~a grenade's arc is transient (W37.R4), so one flying at the old playhead flies on after a seek.~~
  (done at RE-4, 249 §5) ~~**A C4
  or a claymore placed in the skipped span** is not drawn at the target; the room's join path carries it -- the join
  envelope's `projectiles` (a resting charge's state, age and timers, `JoinProjectileWire`) -- so a later task can fold it
  through that field, given the charge's phase from its `grenade` event and its `detonate`.~~ (done at RE-1, 249 §1)
- ~~**A victory dance still running at the target** is not shown: `victory` is transient in the table (a clip), but the
  room's join path carries a running dance -- `packages/match/src/room.ts` `hello` sends a joiner a `victory` per dance
  playing with its `elapsed` (:1353-1355) -- so a later task can fold it the same way (the last start since its stop, its
  elapsed at the target).~~ (done at RE-1, 249 §1) ~~A seat seated as a ghost is not folded either (the envelope's
  `ghosts`: drawn as before, by its snapshot).~~ (done at RE-1, 249 §1)
- ~~**A seek into the owner's launch countdown** posts its line once, as a joiner's welcome does (`NetPage.countdown`).~~
  (done at RE-3, 249 §4: posted once on a seek into it, and not again on a seek within it)
- **Not seen rendered, but for the bomb**: PTT-7's run (§7.3, 2026-10-09) saw one part of the fold in a browser -- the
  bomb's compass mark at a seek forward and back, the owner's case (W37.R7 (a)). Still not seen rendered: the
  scoreboard and the round's clock at the target, a body's death clip at its age, and the turrets.

### 7.3 PTT-7, rendered

Written 2026-10-09 for PTT-7 of web sprint 37 (the plan's brief "PTT-7"; LATER 17; W37.R7 (a), the owner's case). The
spec: `packages/viewer/e2e/replayPaths.spec.ts`, in the form of `playtestLoop.spec.ts` (§5): the `SessionService` in the
test's process on `playtestPort()` over a temp store, the pages on the e2e's own Vite, the record's `launch.url` on that
Vite's origin (so the segment route's allowance and the report's iframe name it). **Evidence kind: a rendered browser
run** -- headless chromium (Playwright 1.63, ANGLE over SwiftShader), one worker, Vite on 5306, the session service on
5308 (W33.R4), the host lock FREE and over 8 GB free before each run -- kept apart from the unit tests of §1-§7. **No
parity finding**: the replay, the report and the session are the playtest instruments' and the replay's adaptations
(PT.R3); the run plays the game only to make a recording of it.

**The session the spec records** (one, serial): the test room offline on Crossroads (MP72, DEMOLITION: the offline room
has the bomb, PF-40 / XR-05; the map PB.R4 made playable) with `&playtest=`; mark A with the bomb on the ground; the
player stood on StartBomb by the dev hook's `teleport` (which stands the room's mover too), the room's automatic pickup
(the own body's Satchel, PB-1), a walk away with it and mark B; the map changed in the page's own panel (`#maps`, MP2),
which rotates the recording (segment 0 closed "context changed", segment 1 opened); a walk on Frostfire and mark C; the
close through the verb.

| case | what is asserted | result (three runs) |
|---|---|---|
| 1. two segments through a map change | while recording: segments 0 (MP72, `endedAt` set) and 1 (MP2, open, its `.s2r.part` on disk), the marks in segments 0, 0, 1; after the closeout: both closed and decoded, each header naming its segment and map, segment 1 ending in `end` (`closed`); segment 0's `bomb` events place the ground state before A and the pickup (state 2, the player's id) between A and B; in the report's replay the timeline lays the two segments: three marks, one boundary | passed, passed, passed |
| 4. a live segment's flushed prefix | a second page (its own context) opens `segments/1.s2r` while the first records it: open, the bar says "partial", the prefix ends before the live page's tick (900 against 1814; 900 against 1784; 840 against 1698), the segment still open; the player's body in it; sought to its start (Home), the tick rises through the prefix (58 and 55 distinct ticks read) to its end, still "partial" | passed, passed, passed (the replay from Home added after the first run, whose clock had played to the prefix's end while the page loaded) |
| 5. the owner's case (W37.R7 (a)) | in the report's replay of segment 0, paused: mark B's button (past the pickup) puts the compass's `ret_bomb` on the carrier's replayed body (within `PATHS_MARK_ON_BODY_PLACEHOLDER`, more than `PATHS_CARRIED_AWAY_PLACEHOLDER` from the ground place); mark A's button (back before it) puts it at the bomb's recorded ground place again, exactly; played from A through the pickup (to ticks 804, 806, 917), the mark on the carrier, then A's button: on the ground again. Close review pass 2 (2026-10-09) found the played step's check weak: paused some 60 ticks past the pickup, the carrier still stood on StartBomb, so a replay that never applied the carried event would have met "the mark on the body" too; the step now plays on to B's tick and asserts `onCarrier` (on the body AND more than `PATHS_CARRIED_AWAY_PLACEHOLDER` from the ground place), rendered at sprint 37's close (the gate's browser half on `72200cc27`, the sprint 37 plan's Log, 2026-10-09T23:54Z: `replayPaths` 6 passed, `playtestLoop` 2 passed). Since RE-6 (research 249 §2) the Home step is asserted: Home lands on the round's first tick and the compass shows the bomb on the ground there -- **not yet run** | passed, passed, passed (as first written); the tightened played step passed at sprint 37's close; RE-6's Home step not yet run |
| 2. the report's seek into the second segment | mark C's button (segment 1) reopens the iframe on `segments/1.s2r` with `tick=` the mark's and `embedder=` kept; it lands on `map=MP2` (by the map rule's second reopen then; by the seek's own address since RE-6); the first tick the bar shows once open is the mark's next (609 for 608, 633 for 632, 601 for 600: the seek on open, then play), never the segment's start; since the review's round, also no more than `PATHS_REOPEN_SLACK_TICKS_PLACEHOLDER` past the mark (passed at sprint 37's close); FROSTFIRE (MP2) on the status line; the playhead past the timeline's boundary. Since RE-6: the first reopened address already names `map=MP2` (**not yet run**) | passed, passed, passed; passed at sprint 37's close |
| 3. the spectator's modes on a replay | in the reopened replay (segment 1, paused at Home): X from the start does nothing (`SPECTATOR_START_READING`: free, free remembered); Right follows the player (the camera `FOLLOW_BEHIND` behind and `FOLLOW_OVER` over the replayed feet, within `PATHS_POSE_TOLERANCE_PLACEHOLDER`); X goes free -- the camera stays while End takes the body 91-93 units on; X follows again; Up stands the first scenic view (still over frames), Up the next, Down the first again; X from scenic goes free (the camera stays), Up from free stands the next view, and X from free returns to the remembered scenic view. The review found the scenic X's checks met by a no-op X (scenic and free both hold the camera still); its round tells them apart by a pose set on the camera (the dev hook's `setCamera`): scenic stands its view again over it, and after X from scenic the pose holds (free); X from free leaves it for the scenic view; and Up from free is pressed with a set pose holding (passed at sprint 37's close). Since RE-6, Home lands on the round's first tick (**not yet run**) | passed, passed, passed (as first written); the round's checks passed at sprint 37's close |

**The runs** (2026-10-09, `agent/playtest-ptt7` on `af67adce8`; the command
`npx playwright test packages/viewer/e2e/replayPaths.spec.ts --workers=1 --reporter=line` from `socomlegacy/` with
`E2E_PORT=5306 E2E_LOCAL_PORT=5307 E2E_PLAYTEST_PORT=5308` and the disc's variables): 6 passed in 1.5 min (9.0 GB free
before it), 6 passed in 1.7 min (8.9 GB), 6 passed in 1.7 min (8.5 GB). The first run's spec lacked the live prefix's
replay from Home and the Home probe below. The second run's spec had the committed assertions without the header's
status comment, and the third's had that comment in its first wording (reworded after the run), so neither file was
byte for byte the one committed at `83800d6e9`. The review's round then tightened cases 2 and 3 (above), and close
review pass 2 case 5's played step (above); those were rendered at sprint 37's close (the gate's browser half on `72200cc27`, the sprint 37 plan's Log, 2026-10-09T23:54Z: `replayPaths` 6 passed, `playtestLoop` 2 passed), so
nothing of sprint 37's spec is owed a run (corrected 2026-10-10 by RE-6, research 249 §2; this passage said "not yet
run" until then). RE-6's own spec edits (cases 2, 3 and 5, above; case 4's comment) are not yet run. No case was marked
`fixme`; no page error on the play page, the prefix page, the report or the replay.

**What was seen, beyond the assertions:**
- **The owner's case holds on this build.** W37.R7 (a) was seen on the batch head 095007e34, without PTT-6. With the
  fold (§7) the bomb's state reverts on a backward seek, by the report's seek and after playing through the pickup; the
  compass mark is the observable (below). Measured: the pickup at ticks 683, 686 and 850; the carrier's mark at B
  157-160 units from the ground place and on the body (`1279.75, 1287.375` against the body's `1279.75, 1287.375`).
- **Home lands before the bomb.** The segment's first tick is 0 and its first `bomb` event is at tick 1: the round's
  start, where `Room.startRound` resets the bomb (`packages/match/src/room.ts`, `this.bomb?.reset()`). Home from B shows
  an empty compass (`[]`, runs 2 and 3) rather than the bomb on the ground. The fold tells no bomb before the first
  `bomb` event (§7, "The bomb"), and `BombPage` draws no mark before a round is in play (its phase gate); at tick 0 no
  round has begun, so a live page there would draw none either. Recorded, not asserted. **Changed by RE-6** (research
  249 §2): Home lands on the round's first tick (the first `roundStart`, the reset's tick), where the compass shows the
  bomb; case 5 asserts it (not yet run). An explicit seek to tick 0 still shows the empty compass.
- **The live page's own compass right after the pickup** read `ret_base` (runs 1 and 3) or still `ret_bomb` at the
  ground place (run 2): the Satchel the spec waits on can show a frame before the HUD's marks follow. Not asserted.
- **A seek across a map change loaded two maps** (as seen on this build). The iframe's `src` names segment 0's map
  (`map=MP72`), so the reopen on segment 1 loaded Crossroads, was refused "Opening the recording's map, MP2." and
  reopened on MP2 (§2's map rule). Correct by §2 and §4.1; slow on a big map. **Changed by RE-6** (research 249 §2): the
  reopen names the target segment's map from the service's listing (`/segments`' `map`), so it loads MP2 once; the
  map rule stays for an address that names no map or a wrong one. Case 2 asserts it (not yet run).
- **The reopened address carries what the page wrote** (`mode=explore&map=MP2&view=modern&online=off&devmode&...`): the
  page writes its settings into the address, and `seekAddress` keeps every other parameter.

**The round: the session's link on the e2e's dev server** (2026-10-09, the merge controller's word after the runs; unit
tests and source inspection only, no browser run). PTT-1 (W37.R1, as amended) made `pageUrl`'s host `127.0.0.1`, and
the e2e's Vite (Playwright's `webServer`, `baseURL` `http://localhost:<port>`) binds as `localhost` resolves, `::1`
alone on the owner's host. So `playtestLoop.spec.ts`'s `expect(new URL(url).origin).toBe(vite.origin)` failed, and its
two `page.goto(url)` would have reached nothing. The fix is in the spec, not the config: `packages/viewer/e2e/sessionPage.ts`
`onE2eDevServer` opens the link's path and query on the e2e's origin, refusing another port or an origin outside
`devOrigins`. The spec asserts the meaning: the same port, the link's origin one of `devOrigins`. Binding the
`webServer` on `127.0.0.1` instead would have moved every other spec's `baseURL` and `storageState` origin. Held by
`packages/viewer/test/e2eSessionPage.test.ts`, which reads `playwright.config.ts`'s `baseURL` host. Checked and left
alone: `playtestMark.spec.ts` and this section's spec open a relative or Vite-origin address, never `pageUrl`'s; the
specs that start a match server (`HOST=127.0.0.1`, `ALLOWED_ORIGINS` the `baseURL`'s origin where set) are untouched by
sprint 37 (no change to `packages/central/src/main.ts`); the session socket's `LOCAL_ORIGIN` takes `localhost`; and
PTT-2's server mark needs a heartbeat naming a server, which an offline page does not send (`online().url` null). None of
this section's three runs' segments was marked. `playtestLoop.spec.ts` ran at sprint 37's close (the gate's browser half on `72200cc27`, the sprint 37 plan's Log, 2026-10-09T23:54Z: `replayPaths` 6 passed, `playtestLoop` 2 passed) (it
was owed then; corrected 2026-10-10 by RE-6).

**Not seen, still owed:**
- **The world bomb and the carrier's Satchel on the replay**: no hook reads the world bomb's model or a remote body's
  gear (`crossroads.spec.ts` owes the same for the other page's view), so the bomb on the ground and the satchel on the
  replayed carrier are not asserted; the compass mark is. Owed to a hook on `BombPage.state()` or the drawn bomb, with
  sprint 38's (a).
- **The HUD's picture on a spectator**: the spec reads `hud().model.extraMarks`, the model the HUD draws from, not the
  drawn compass (`hud.setVisible(walking)`; a replay's watcher does not walk).
- **The fold's other parts, rendered** (§7.2): the scoreboard and the round's clock at the target, a body's death clip
  at its age, and the turrets. The spec mounts no turret and kills no one, and it reads neither
  the scoreboard nor the clock. Owed to sprint 38's (a).
- **§7.2's residue** (the hostages and their compass marks, a running dance, a charge placed in the skipped span, the
  clocks on the wall's time): not exercised. Crossroads has no hostage and the spec places no charge. Owed as §7.2 says.
- **The match server's replays** (sprint 36): not opened; every segment here is a page's offline room.

**Taken up by RE-5 (sprint 38; research 249 §7).** The world bomb and the carrier's Satchel, the HUD's drawn compass,
the scoreboard, the round's clock, a death clip at its age, the turrets, the hostages' marks, a placed charge and the
air on a seek are asserted by `packages/viewer/e2e/replayEngine.spec.ts` through the dev hook's `devSeen()` read; a
rescue, a running dance and the drawn compass on a replay's watcher are settled `fixme` there with their reasons.
**Rendered green** (headless Chromium, four runs, 2026-10-10; research 249 §7.3). Of this section's owed items above,
these are still not seen:
- the three `fixme`s;
- the match server's replays: every RE-5 segment is a page's offline room;
- a player's blast death at its age: only its corpse's bookkeeping is held, because the blast's fall reaches its victim
  alone and is not recorded (249 §7.2).
  *(2026-10-11, RV-6, research 276 §5: the premise does not hold -- every recorded snapshot carries the corpse's action and its clock; a seek now tells a landed blast corpse in its landing at its age; the key 0 was the page's animator.)*

One more was found: the bomb's compass mark is in the HUD's model but never drawn, because
`ret_bomb.tif` was not loaded. PR #130 fixed it on main (research 239). The spec held it as an expected failure until
the lane's merge of main b155834d6 (2026-10-10); it is a plain assertion now (research 249 §7.2).
*(2026-10-11, RV-1, research 276 §9: the match server's replays, opened in the modern Replays viewer, seen rendered -- a hosted match on MP72 listed by account, the owner's bomb case both ways in the viewer's frame, the countdown's seek and RV-3's controls; 6 passed with the fixture-packed disc image, the owner's full image a finding for the launcher work.)* *(2026-10-12, the sprint 39 close: that finding was withdrawn at RV-1c -- the same red came with the fixture-packed image, a race of the spec's own -- research 276 §9, "Withdrawn, a spec race"; the spec now runs through the console launcher, 6 passed on 9c4aaa385.)*

### 7.4 Placeholders (PTT-7)

Test thresholds of the e2e, none a game value. They are outside the ledger's walk (`packages/<name>/src` and `tools/`), so
each row is *note only*, as §5.1's are. `START_BOMB` and the bomb's state numbers are restated in the spec from
`crossroads.spec.ts` and `packages/viewer/src/net/objective.ts` `BOMB_STATE` (not new); `FOLLOW_BEHIND` and `FOLLOW_OVER`
are imported from `packages/viewer/src/spectatorView.ts`.

| name | value | where | status |
|---|---|---|---|
| `PATHS_CARRIED_AWAY_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 30 units, horizontally | `packages/viewer/e2e/replayPaths.spec.ts` | a chosen threshold: the carrier's distance from the bomb's ground place at B, past the pickup's 20-unit reach (`pickupReach`), so a mark on the carrier is told from a mark on the ground; measured 157-160 units |
| `PATHS_MARK_ON_BODY_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 1 unit, horizontally | `packages/viewer/e2e/replayPaths.spec.ts` | a chosen tolerance: `BombPage` marks the drawn body (`RemotePlayers.feet`), the hook reads the client's body, and paused they are the same snapshot pair (measured 0); **retired 2026-11-02** (OT.R99, as amended: the carried bomb is marked on nobody's compass, so no mark rides the carrier; case 5 now reads the carry from `devSeen().bomb`, no `ret_bomb`, and the carrier's body past `PATHS_CARRIED_AWAY_PLACEHOLDER`; task DkA3Lwsa) |
| `PATHS_POSE_TOLERANCE_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 0.01 units per axis | `packages/viewer/e2e/replayPaths.spec.ts` | a chosen tolerance: the spectator's pose is the fly camera's own numbers, so only rounding separates them |
| `PATHS_REOPEN_SLACK_TICKS_PLACEHOLDER` (*note only*: the e2e's, outside the ledger's walk) | 60 ticks (1 s at 60 Hz) | `packages/viewer/e2e/replayPaths.spec.ts` | a chosen tolerance (the review's round): how far past the mark the reopened replay's first shown tick may lie, the seek on open then play until the bar's first frame and the spec's 50 ms read; measured 1 in each of the three runs (609, 633, 601 for 608, 632, 600), far under the 600-odd ticks play from the start would need |
