# 241 -- The playtest room's instruments: the badge, Mark this moment and the telemetry (PT-05)

Written 2026-10-06 for web sprint 33's PT-05 (plan `docs/plans/2026-10-06-web-sprint-33-recording-and-the-room.md`;
spec `docs/specs/2026-10-06-playtest-and-replay-design.md` §4.3). The code: `packages/viewer/src/playtestSession.ts`
(new), the mount condition in `packages/viewer/src/playtestReport.ts` (`mountPlaytestOverlay`), the hook's
`playtest?()` in `packages/viewer/src/hook.ts`. The test: `packages/viewer/test/playtestSession.test.ts` (jsdom).
**Nothing here has an original**: every part is a playtest instrument, labelled `PLAYTEST_INSTRUMENT_ADAPTATION` in its
module header, and none of it changes a game value or behaviour (PT.R3). No game or emulator was run; no browser was
opened; no server was contacted (the test's socket is a fake). PT-06 (the video ring) and PT-09 (the hook and the e2e)
append their sections here.

## 1. The instruments

- **Where they mount.** `?devmode` loads the developer overlay (`./playtestReport`, a lazy chunk `main.ts` imports);
  its `mountPlaytestOverlay` mounts the instruments when the page's address also carries `playtest=<session socket
  url>` and the build is a development one (`import.meta.env.DEV`) -- W33.R2, so `main.ts` is not edited (PT.R5).
  Without `playtest=` the mount returns a no-op object and nothing is drawn, listened to or connected. The overlay
  imports `./playtestSession` statically: its own test holds that its source names no dynamic import and no network
  API, and the session's socket wrapper (`wsSocket`) lives in `./playtestSession`. The brief asked for a dynamic
  import there; that literal breaks the overlay's guard, so the import is static (the overlay is itself the lazy
  chunk, loaded only behind `?devmode`).
- **The session socket.** The first message the service sends is `{ type: 'session', id, segment, badge }`;
  `{ type: 'marked', observation, local }` renames a mark's client-side `local-<n>` to the service's observation id;
  `{ type: 'inactivity', closesInMinutes }` is the inactivity clock's grace warning (below). The service sends no
  `segment` message: the segment's rotation is the page's (research 240 §5).
- **The input heartbeat and the grace line** (the W33 close review; spec 4.3, 4.4; the clock is the service's, research
  242 §3). Human input -- a `keydown`, a `pointerdown` or `pointermove` on the document, a pad with any button pressed or
  a stick past 0.2 (read in the same poll as the chord) -- sends `{ type: 'input' }` to the service at most once every
  `INPUT_HEARTBEAT_S` (5 s), so a tester who plays without marking is never closed mid-play; the service's `input`
  handler resets the clock and reads no other field, so the message carries none. The service's grace warning shows a
  plain line under the badge (`<div id="playtest-inactivity">`: "No input for a while: this playtest closes in 2
  minutes unless you move or press a key", the minutes the message's); the next human input removes it and sends
  `input` at once, the throttle bypassed.
- **The badge** (`<div id="playtest-badge">`, top-left): the branch, `Created: <local time>` or `Created: unknown` when
  the service sent null, the short commit with `*` when dirty, all from the session message -- the page never invents a
  creation time. After a mark it adds "marked" for `MARKED_SHOWN_MS_PLACEHOLDER` (two seconds) and nothing else: the
  controller speaks, not the page.
- **Mark this moment**: the key `F8` (`MARK_KEY`, on `keydown`, not on a held key's repeat), the on-screen
  `<button id="playtest-mark">Mark this moment</button>`, and the pad chord `MARK_PAD_CHORD_PLACEHOLDER` (L3 and R3, the
  standard mapping's buttons 10 and 11, held 0.5 s; once per hold, again only after a release). The chord is polled
  from `navigator.getGamepads()` through the host's `pads()` on the page's animation frames; only those two buttons are
  read, and the round's own input is not touched.
- **The telemetry**: the hook's `stats()`, `net()` and `camera()`, each called in its own `try` so a hook without one
  (an older hook) or one that throws gives `null`; the effective address (`search`), the badge, the mark's source and
  the replay tick.
- **The hook**: `__viewer.playtest()` is assigned on the live hook object (`host.hook()`) at mount and again on each
  poll if the page replaced it; it returns the session id, the segment, the tick, the marks taken, the ring's seconds
  and the badge. The tick is null and the ring's seconds 0 until PT-03 (the recorder) and PT-06 (the ring) supply them.

## 2. A mark's order of operations (spec §4.3)

1. **The bookmark**: the mark is numbered `local-<n>`, stamped (`at`, ISO time), and takes the segment and replay tick
   of that moment; the marks count rises and the badge shows "marked". (The `.s2r` `mark` record is the recorder's,
   PT-03.)
2. **The frame**: grabbed inside the next animation frame (`host.frame`, the page's `requestAnimationFrame`), since the
   renderer draws into the default framebuffer each frame: `canvas.toBlob(..., 'image/png')`, or
   `toDataURL('image/png')` decoded to a Blob where `toBlob` is absent; null with no canvas or on a throw.
3. **The video ring's pin**: the ring is pinned at the bookmark's moment; its clip is sent after the mark's message
   once the after-window is recorded (or cut by a restart or the dispose) -- PT-06, §4.
4. **The telemetry** (§1), read after the frame.
5. **The bundle sent**: `{ type: 'mark', bundle }`, the frame as a `data:image/png;base64,...` string; the returned
   `MarkBundle` keeps the Blob, and its `observation` is the service's id when the `marked` reply has arrived.

The bundle goes out once the PNG's bytes are read, which a Blob gives only asynchronously: a mark's message is never in
the same task as the press.

## 3. Placeholders

| name | where | what would settle it |
|---|---|---|
| `MARK_PAD_CHORD_PLACEHOLDER` (`packages/viewer/src/playtestSession.ts`) | L3 + R3 (buttons 10, 11) held 0.5 s | an owner call (HUMAN_TASKS): every pad button has a meaning in the round, so which chord marks is his; no original |
| `MARKED_SHOWN_MS_PLACEHOLDER` (`packages/viewer/src/playtestSession.ts`) | 2000 ms of "marked" on the badge | an owner call if he wants it otherwise; the brief's two seconds, no original |
| `INPUT_HEARTBEAT_S` (`packages/viewer/src/playtestSession.ts`) | at most one `input` message every 5 s of human input; a stick counts past 0.2 (`PAD_STICK_INPUT`) | an owner call if he wants it otherwise: chosen values of the W33 close review, no original (plain constants, not ledger names; listed here so the choice is on record); 5 s is far under the 45-minute clock |
| `PLAYTEST_INSTRUMENT_ADAPTATION` (`packages/viewer/src/playtestSession.ts`) | the label: the mark, the badge and the telemetry are a browser adaptation with no original, `?devmode&playtest=` only | nothing: a label, not a value |
| `VIDEO_RING_SECONDS_PLACEHOLDER` (`packages/viewer/src/playtestVideo.ts`) | 90 s of video kept in the ring | an owner call (HUMAN_TASKS): the spec's chosen value, no original; a longer ring costs memory (WebM at the canvas's size), a shorter one loses a late mark's lead-in |
| `VIDEO_PIN_BEFORE_S` (`packages/viewer/src/playtestVideo.ts`) | a clip reaches 20 s before the mark | an owner call: a chosen value, no original (a plain constant, not a ledger name; listed here so the choice is on record) |
| `VIDEO_PIN_AFTER_S` (`packages/viewer/src/playtestVideo.ts`) | a clip runs 10 s after the mark | an owner call: a chosen value, no original (a plain constant, not a ledger name; listed here so the choice is on record) |

## 4. The video ring (PT-06)

Written 2026-10-06 for PT-06. The code: `packages/viewer/src/playtestVideo.ts` (new: `VideoRing`,
`makeCanvasRecorder`), its wiring in `packages/viewer/src/playtestSession.ts`. The tests:
`packages/viewer/test/playtestVideo.test.ts` (node: the ring with a fake recorder) and three cases added to
`packages/viewer/test/playtestSession.test.ts` (jsdom, a fake `MediaRecorder`). A playtest instrument with no original
(PLAYTEST_INSTRUMENT_ADAPTATION); it reads the canvas only. No browser was opened and no game was run: everything
below about real browsers is a reading of the specifications and the type declarations, not a run.

- **Capture.** `makeCanvasRecorder(canvas, audio)` calls `canvas.captureStream(30)` (a `MediaStream` whose one video
  track samples the canvas at up to 30 frames a second, a frame taken only when the canvas has changed) and records it
  with a `MediaRecorder`: `video/webm;codecs=vp9` when `MediaRecorder.isTypeSupported` says so, else
  `video/webm;codecs=vp8`, else plain `video/webm` (the browser's default codec). `start(1000)` asks for a
  `dataavailable` event every second; each becomes a `Chunk` whose `seconds` is the time since the previous one ended
  (or since `start`) and whose `at` is its end minus its seconds, on the ring's clock; its Blob is read to bytes (one at
  a time, in order) before the ring takes it, since the ring scans the bytes (below). A third, optional argument `now`
  (seconds) is this task's addition to the brief's signature: the session passes `host.now() / 1000` so the chunks and
  the marks share one clock (the host's clock is in ms, `performance.now`, which the ring's tests could not drive).
- **The ring.** Chunks are appended as they arrive; while the seconds held exceed `VIDEO_RING_SECONDS_PLACEHOLDER` the
  oldest is dropped. `held()` is the sum of the held chunks' seconds, and `__viewer.playtest().ringSeconds` reads it
  (0 where no ring runs).
- **The pin.** A chunk covers `[at, at + seconds)`. `pin(at)` takes the window `[at - VIDEO_PIN_BEFORE_S, at +
  VIDEO_PIN_AFTER_S]`: every held chunk overlapping it at once, then every arriving chunk overlapping it, and resolves
  `{ from, to, chunks, cut, bytes, why? }` when a chunk ending at or after `to` arrives (at once if one is already
  held). `bytes` is the playable clip and `from`/`to` its actual cut times (see "A clip's playability" below); `chunks`
  are the window's Chunk objects and only those -- the accounting, not a file. Two overlapping pins
  hold the **same** `Chunk` objects (review
  focus 2: one copy of the bytes in the page; each mark still uploads its own clip, so the service receives the
  overlap twice -- deduplicating uploads would be the service's, PT-07/PT-11). That is ruled, not a gap: W33.R5, one
  upload per pin this sprint (the bytes stay on localhost), the service deduplicating in sprint 34. A window that
  reaches back past what the ring has already dropped (the ring has evicted a chunk of this recording, and its oldest
  held chunk starts after the window's `from`) resolves `cut: true` even when its after-window was recorded: the clip is short at its
  start and says so. A window reaching back before the recording began, with nothing dropped (a mark in a segment's
  first 20 s), lacks nothing and is not cut.
- **Restart and the keyframe rule.** When the page rotates its segment (a map, mode or online change, research 240
  §5) the session calls `restart()`: the
  recorder is stopped (its handler detached first, so a late `dataavailable` of the old stream is ignored), every open
  pin resolves `cut: true` with its chunks so far and `to` = the restart's time (review focus 3: a clip closes at the
  boundary and says so), the ring, its cluster index and its init segment are emptied, and a fresh recorder starts its
  own stream. A recorder's first chunk after `start` is still flagged `keyframe`, but a chunk is not a unit of the file:
  see "A clip's playability" for what Chromium's chunks were measured to be. `stop()` (the dispose) does the same as a restart without the new recorder. A clip of a mark already
  sent, cut later by the dispose, is still sent (the socket outlives the mount); a dispose that lands while a mark is
  still being made (the frame grab or the PNG's encoding) sends nothing for it -- neither the mark nor a clip under a
  `local-<n>` the service never received -- and `mark()` resolves with `clip: 'stopped'`.
- **What a clip is on the wire.** After the mark's message, when the pin resolves: `{ type: 'clip', observation, from,
  to, mime, cut }` (the observation is the service's id if its `marked` reply has arrived, else `local-<n>`) and then
  the clip's `bytes` (the init segment and whole clusters), sent as one binary frame by `SessionSocket.sendBinary`. A
  clip with no bytes (no Cluster recorded yet) sends no `clip` message, only a console warning with its `why`: the
  service pairs a `clip` message with the socket's next binary frame, which would then be another's. It is optional:
  a socket without it gets no `clip` message at all (a message without its frame would pair with the next clip's
  bytes) and the mark's telemetry says `clip: 'unsent'`. `wsSocket` queues text and binary frames in one queue, so the
  order holds before the socket opens. The telemetry's `clip` is one of `pinned`, `unsupported` (no ring), `unsent`
  and `stopped` (`ClipState` in `playtestSession.ts`).
- **A clip's playability: the init segment plus whole clusters** (PT-06b). What a real recorder gives was measured in
  PT-09's e2e run of 2026-10-07 (headless Chromium 153; facts as the controller reported them to this task, recorded
  by PT-09 in §5): Chromium's **first** `dataavailable` chunk is **one byte** (`1a`); the second begins `45 df a3` --
  the EBML header is split across chunks -- and every later chunk starts one byte into an element, never on one; the
  keyframe Clusters fall every 4-5 s, not at each 1 s timeslice. So the first PT-06 fix ("the first chunk, then the
  window's chunks") never made a valid WebM once the window did not start at the recording's start: that run's 3 s
  mark passed, and a mark after 25 s gave a 4.95 MB file with no EBML header. The fix proven by hand in the same run --
  the stream's bytes before its first Cluster (145 bytes: EBML header, Segment, Info, Tracks) followed by the stream
  from a Cluster boundary inside the window -- loaded, seeked to 12.9 s with `readyState` 4 and played 3 s, with no
  re-encode. The ring now does that:
  - It keeps each recording's byte stream as its chunks with their byte offsets, and indexes the Clusters by scanning
    each arriving chunk for the Cluster's EBML ID `1F 43 B6 75`, with the previous chunk's last three bytes prepended
    (an ID may straddle two chunks). A Cluster's time is the `at` of the chunk its ID starts in: chunk-level, so within
    one timeslice (a second) of the truth -- good enough for a clip's edges, and said so in the code.
  - The **init segment** is the stream's bytes from its start to the first Cluster's offset: null until the first
    Cluster is seen, kept outside the ring's eviction, replaced on `restart()`.
  - A clip's `bytes` are the init segment, then the stream from the first Cluster starting in `[from, to]` (or, when
    none does, the last one starting before `from`, so the window is covered) to the end of the last chunk ending at or
    before `to`. The reported `from`/`to` are those cut times: a mark at 100 with Clusters every 4 s from 0 gives
    `[80, 110]`, one at 100.5 gives `[84, 110]`. Eviction drops whole chunks with their Clusters, never the bytes from
    an open pin's starting Cluster on.
  - **The new cut rule**: a clip is `cut: true` when a restart or stop closes it, when its window reaches back past
    chunks the ring has dropped, and when no file can be cut -- no Cluster seen yet in this recording, or none held in
    or before the window -- then with `bytes: null` and a `why`. A recorder that hands Blobs the ring cannot scan gives
    the same (`makeCanvasRecorder` reads every Blob to bytes, so this is for other `RecorderLike`s).

  The tests are pure (`test/playtestVideo.test.ts` (j)-(n), a synthetic stream shaped as measured: a one-byte first
  chunk, the header over chunks 0-2, a Cluster every fourth chunk, one straddling two chunks). That the result opens
  in a real player is **not** shown by them: PT-09's e2e is the check on the merged lane; if a clip still does not open
  (a Cluster that does not start on a keyframe, a timeline that does not start at 0 and a player refuses), a remux in
  the service is the fallback.
- **The browsers.** jsdom (v29.1.1 here): no `MediaRecorder` on `globalThis` -- verified by the session test's
  assertion -- and no `captureStream` on its canvas -- verified by a search of `node_modules/jsdom/lib` (neither name
  appears). There the session creates no ring, the mark's telemetry carries `clip: 'unsupported'`, and no `clip`
  message is sent (tested). Headless Chromium: it exposes `MediaRecorder` and `HTMLCanvasElement.captureStream`
  (read from the platform's documentation, not run here -- no Playwright in this task); whether its WebGL canvas yields
  frames headless, and whether vp9 is reported, is PT-09's e2e to observe. The ring starts only when the canvas exists
  at mount and both APIs exist; a throw while starting warns once and leaves `clip: 'unsupported'`.
- **Audio: null this sprint.** `makeCanvasRecorder` adds an `audio` stream's tracks when one is given; the session
  passes `null`. A reading of `packages/viewer/src/audio.ts` (grep for `destination` and `MediaStream`): `WebAudioOut`
  connects its master gain to `ctx.destination` (line 340, `prepare()`), and the file names no
  `createMediaStreamDestination` / `MediaStreamAudioDestinationNode`; the `AudioContext` and the master gain are
  private fields (`ctx`, `master`). So the page's graph exposes no stream to record today. The mix-in needs
  `WebAudioOut` to make a `MediaStreamAudioDestinationNode` on its context, connect `master` to it beside
  `ctx.destination`, and hand its `.stream` to the session (through the hook or the host, not `main.ts`, PT.R5) --
  a later task's.

## 5. What the e2e proved (PT-09)

Written 2026-10-07 for PT-09. The spec: `packages/viewer/e2e/playtestMark.spec.ts` (one test), with
`E2E_PLAYTEST_PORT` in `packages/viewer/e2e/ports.ts` (default 5308; W33.R4: Vite 5306, the Local port 5307, the
service 5308). A `SessionService` runs in the Playwright worker's process over a temp store (imported by relative path
to `packages/playtest/src/service.ts` and `session.ts`, and `packages/match/src/replay/format.ts`: Playwright's
TypeScript transform takes the cross-package sources as they are); the page is
`/testroom?mode=play&devmode&noarmory&map=MP2&playtest=ws://127.0.0.1:5308/session` (`&noarmory`: without it the
ARMORY holds the room, and the recording with it, until DONE). **Browser: Playwright 1.63.0's chromium 153.0.8010.12,
headless**, on the owner's Windows host, run under the host rule (the lock read FREE before each run). Installed Chrome
was not tried: MediaRecorder exists in headless chromium, so the channel run the brief kept for its absence was not
needed and `playwright.config.ts` is unchanged. Measured, per assertion (seven runs on 2026-10-07; the figures are the
committed spec's last run unless named):

- **The hook and the mark.** `__viewer.playtest()` named the service's session once the socket opened; F8 after
  `holdReleased` and `setMode('walk')` gave `marks === 1` and one observation `PT-<session>-1`. The ring held 25.15 s
  at the mark (the spec waits for more than 25 s); the telemetry's `clip` was `pinned`, `recording` `streaming`.
- **The frame.** `marks/<id>/frame.png` present, non-empty, opening with 89 50 4E 47 -- held in every run.
- **The telemetry.** `telemetry.json` parses; its `search` has `map=MP2`. The hook's `stats().map` is the display name
  `FROSTFIRE`, not the stem (the first run's failure was the spec's own wrong expectation; fixed to `FROSTFIRE`).
- **The mark record.** Closing the page closed the socket; the service closed segment 0 as `socket-closed` and gzipped
  it (no `.part` left). `segments/0.s2r` gunzips and decodes: header `map` `MP2`, `session.segment` 0, 3196 records
  (1050 snapshots), one `mark` record at tick 1454 = the observation's `tick`, its `local-1` named in the history.
- **The clip's bytes.** `clip.webm` kept, `video/webm;codecs=vp9`, `cut=false`. **Contiguous case** (an earlier run,
  the mark 17.6 s after the ring started, so the window `[-2.39, 27.61]` reached back past the stream's start): 2.91 MB,
  opening with the EBML magic 1A 45 DF A3. **The realistic case** (the mark more than 20 s in: window `[8.54, 38.54]`
  s): 4.95 MB and **no EBML header anywhere in the file**. That assertion failed: the spec was committed RED there
  (80ba883a), and turned GREEN unchanged once PT-06b cut clips at Cluster boundaries (below).
- **The clip plays.** Contiguous case: `loadedmetadata` arrived; `duration` was `Infinity` (a MediaRecorder WebM
  carries none), so the seek held instead: `currentTime = 1` -> `seeked`, `readyState` 4, 960x540. The realistic case:
  not reached before PT-06b (no header); after it, see "The e2e green on the cluster cut".

**Why the realistic clip has no header -- measured, against §4's reading.** A spy on `MediaRecorder` (an init script
in a debugging run, not committed) logged each `dataavailable` blob: the first comes 2 ms after `start` and is **one
byte, `1a`** (the EBML ID's first byte); the second begins `45 df a3 9f` (the rest of the header, the tracks and the
first frames); every later blob begins one byte into an element (e.g. `46 f8 a1 46 cd 81`: a BlockGroup's size, its
Block and track 1 -- the `a0` ID byte closed the previous blob). Clusters (`1F 43 B6 75`) fall about every 600 KB
(4-5 s), not at each 1 s timeslice. So §4's "the first chunk carries the header, each timeslice starts at a keyframe"
is false in Chromium 153: the ring's init chunk is the one byte `1a`, and "init chunk + the window's chunks" is not a
WebM file -- chunks are valid only as one unbroken run from the stream's start. **What fixes it (proven by hand in
the same debugging run; PT-06b implemented it, 4397cca7, §4):** the stream's bytes before its first Cluster (145 bytes, opening with the EBML magic), then
the clip's bytes from the first Cluster ID inside them (offset 570917 of 4.55 MB): that file loaded (duration
Infinity, 1280 wide), sought to 12.9 s with `readyState` 4, and played 3.0 s. A byte splice at Cluster boundaries, no
re-encode -- in the ring (keep the stream's prefix up to the first Cluster as the init bytes; start a clip at the first
Cluster inside its window) or in the service (the "remux" fallback of §4, which needs the header bytes sent once per
stream). The clip then starts at the window's first keyframe, up to ~5 s after the window's `from`. PT-06b took the
ring's side: the clip starts at the first Cluster **inside** the window (so it begins up to one cluster, ~5 s, after
the window's `from`), and only when no Cluster falls inside the window at the last Cluster before it, so the window is
still covered (§4; the review of 2026-10-07 corrected an earlier sentence here that said "at or before").

**The e2e green on the cluster cut (2026-10-07, after merging `agent/playtest` ccf6b13b and `agent/playtest-pt06b`
4397cca7; the lane took both in the merge b16883a4).**
The spec unchanged (the mark after more than 25 s in the ring), the lock FREE before each run, chromium 153.0.8010.12
headless; two runs, both GREEN:

| run | ring at the mark | clip kept (ring s) | bytes | header | metadata | seek "to 1 s" | seek into the window | played |
|---|---|---|---|---|---|---|---|---|
| 1 | 26.40 s | 14.09-39.54, cut=false | 3 732 942 | 1A 45 DF A3 | duration Infinity, 960x540 | landed 10.743 s, readyState 4 | 11.243 s, readyState 4, 960x540 | 1.004 s |
| 2 | 25.53 s | 11.84-37.29, cut=false | 4 230 246 | 1A 45 DF A3 | duration Infinity, 960x540 | landed 10.684 s, readyState 4 | 11.184 s, readyState 4, 960x540 | 1.005 s |

The duration is Infinity (a MediaRecorder WebM states none), so of the brief's two checks the seek held. The seek "to
1 s" lands at the clip's first media time (10.74 s and 10.68 s: the media timeline keeps the stream's own times, and the
clip begins at its first Cluster's), clamped there by the element; the buffered range began at that time
(`[10.743, 12.991]`, `[10.684, 12.914]`). The clip's `from` in the record (14.09, 11.84) is now the cut's start on the
ring's clock, no longer the window's `from`. Frame, telemetry and mark record held as before (marks at ticks 1478 and
1468; 3171 and 3189 records, 1050 snapshots each). The spec's comments were reworded to the green result in 58b58297.

**A known weakness of the cut (the review of 2026-10-07).** The Cluster index is a plain byte scan for `1F 43 B6 75`: the
same four bytes inside a frame's payload would be indexed as a Cluster (about 1 in 4.3e9 per byte, so roughly one false
hit per nine hours at the measured ~130 KB/s, and ~1e-4 per clip, since only a hit between the window's start and the
first real Cluster is used); a clip cut there would not decode. Acceptable for a playtest instrument this sprint; sprint
34 adds the cheap check that the Cluster's first child is the Timecode element (`E7`) right after the size field (a
longer carry than three bytes). Also sprint 34's: the spec's in-window seek lands half a second into the clip's first
buffered range, i.e. the clip's start, not the mark's seconds; a seek near the clip's end would test the mark's seconds.

**Unproven.** That the cut clip plays in another player (VLC, a non-Chromium browser) -- only Chromium's `<video>`
was asked; that headed Chrome or another Chromium version splits blobs the same way; vp8 (the run reported vp9); a clip
cut by a restart (a segment boundary) -- not exercised; the audio (null this sprint, §4).
