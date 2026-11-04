# 226 -- Voice in the page: the codec, the capture's resampling, the client, the talk input (SVC-21)

Written 2026-10-08 14:28Z for SVC-21 (`agent/online-svc21`, from `agent/online` 303fc67c7), sprint 20 (voice) wave 1,
on the owner's OT.R24 (the codec, `docs/plans/2026-10-02-online-path-target.md:240-246`) and the plan's W20.R3
(`docs/plans/2026-10-08-web-sprint-20-voice.md`). The code: `packages/viewer/src/voice/voiceCodec.ts` (new) and
`captureWorklet.ts` (new). The test: `packages/viewer/test/voiceCodec.test.ts` (new; the WebCodecs constructors are
fakes, node has none). No game or emulator was run, no browser was opened and no server was contacted. The original's
format is research 170 §6.1 (R170.12); its lines were re-read at the review of 2026-10-08 and the cites below are
that re-read's (the capture format set at `FUN_003102e0` D:L211845-211849, handed to the record format by `FUN_0030fef0` D:L211691-211694; the four 160-sample
frames at `FUN_0030f990` D:L211490-211498; playback at `FUN_0030f7e0` D:L211393-211449). The codec is not
the original's: it is the owner's ruling, a labelled browser adaptation. §3 is SVC-20b-page's (wave 2, written
2026-10-08); §4-§5 are SVC-22b's (wave 3, written 2026-10-08). §1's encoder design was rewritten by CLOSE-FIX-2
(2026-10-08 21:07Z, `agent/online-closefix2`, from `agent/online` 1b3e24546) on the browser window's observation below;
§3's talk watchdog went from 100 to 1 000 ms by CLOSE-FIX-3 (2026-10-08, `agent/online-closefix3`, from `agent/online`
ecf644a0d) on the same window's run. VOICE-2 (2026-10-09, `agent/online-voice2`, from `agent/online` 42914b658; the owner's
OT.R44 after his solo playtest) doubled the bitrate (§1), added the owner's playback gain (§3, §6), measured the lobby's
chop through the relay and the playback with a unit-level harness and fixed the backlog it found (§3.1). VOICE-LATE
(2026-10-11, `agent/online-voicelate`, from `agent/online` 022044f39; the owner's live playtest: the audio late, choppy and
unmarked) put the playback on the page's one audio unlock, the talker's mark on what the page plays, bounded the decode
chain and counted the drops on both sides (§3.2, §6). VOICE-LATE-3 (2026-10-12, `agent/online-vl3`, from `agent/online`
62df9bb38; the owner's two-account test: nearly every frame dropped, nothing heard) counted the relay's frames per
talker, posted the page's counters to the server's log, and moved the backlog bound back before the decode (§3.3, §6). VOICE-LATE-4 row 1
(2026-10-12, `agent/online-vl4`, at bf4062b3d; the owner's retest: every frame played, seconds late) added the field
instrument's five readings to the posted report (§3.4, §6). VOICE-LATE-4 row 2 (2026-10-12, `agent/online-vl4b`, from
`agent/online` 9a3eeb51d; the mechanism reproduced headless by the Online seat) moved the listener's decode into a
dedicated Worker (§3.5, §6). VOICE-LATE-4 row 3 (2026-10-12, `agent/online-vl4c`, from `agent/online` 8e0cd43cb; the
owner's word: a warning on a throttled player's client) added the throttle warning and the worker's open time-out (§3.6,
§6).

## 1. The codec

**What the original carried** (research 170 §6.1, a reading; the lines re-read at the review of 2026-10-08): the
headset's capture, 1 channel, 16-bit, 8 000 Hz (`+0x10bc` 1, `+0x10c4` 0x10, `+0x10cc` 8000 set at `FUN_003102e0` D:L211845-211849, handed to the record format by `FUN_0030fef0` D:L211691-211694), encoded once 0x500 bytes (640 samples, 80 ms) are in, as four SASE frames of 160 samples each
(`FUN_0030f990` D:L211490-211498), 8 bytes a frame, 32 bytes a message, 3 200 bit/s; the codec's voice activity flag
computed and ignored (push-to-talk gates); playback 160 samples per 8-byte frame (`FUN_0030f7e0` D:L211393-211449).

**The ruling** (OT.R24, the owner, 2026-10-05): Opus narrowband, mono, 8 kHz audio as the original's capture, **6 000
bit/s to start**, tuned by ear; a labelled browser adaptation (the codec is not the original's). **OT.R44** (the owner,
2026-10-09T05:28Z, after his solo playtest of web sprint 20 on `main` 463abd4fd: "let's double the quality just
because"): **12 000 bit/s** (`VOICE_BITRATE_OWNER`, VOICE-2). W20.R3: through
WebCodecs `AudioEncoder` / `AudioDecoder`, 20 ms frames, voip; no new npm dependency (no WASM Opus); a browser without
WebCodecs Opus has no voice and says so (H-next d). A SASE port (research 170 §6.2 option (c)) stays the proven level
and is not pursued.

**The configuration, value by value:**

| field | value | source | level |
|---|---|---|---|
| `codec` | `'opus'` | OT.R24, W20.R3 | the owner's ruling (adaptation) |
| `sampleRate` | 8 000 (`VOICE_SAMPLE_RATE_READING`) | the original's capture rate, R170.12 (`FUN_003102e0` D:L211845-211849, handed to the record format by `FUN_0030fef0` D:L211691-211694) | reading, reviewed 2026-10-08 |
| `numberOfChannels` | 1 | the original's capture, R170.12 (the same lines) | reading, reviewed 2026-10-08 |
| `bitrate` | 12 000 (`VOICE_BITRATE_OWNER`; 6 000 until 2026-10-09) | OT.R24 ("6 kbit/s to start", tuned by ear), doubled by OT.R44 (2026-10-09) | the owner's value, not a placeholder |
| `opus.frameDuration` | 20 000 µs (`VOICE_PACKET_MS_READING` = 20) | the original's SASE frame, four of 160 samples per 80 ms (R170.12; `FUN_0030f990` D:L211490-211498) | reading, reviewed 2026-10-08 |
| `opus.application` | `'voip'` | W20.R3 | the plan's ruling (adaptation) |
| the block | 640 samples (`VOICE_FRAME_SAMPLES_READING`) = 4 packets of 160 | the original's 0x500 bytes in (R170.12; `FUN_0030f990` D:L211490-211498) | reading, reviewed 2026-10-08 |

`opus.application` is in WebCodecs' Opus registration; TypeScript's DOM library (5.9) does not yet carry it, so the
module widens `OpusEncoderConfig` locally. The decoder is configured `{ codec: 'opus', sampleRate: 8000,
numberOfChannels: 1 }` with no description (the packets are raw Opus).

**What it changes against the original, each labelled.** The codec (Opus for SASE: a different codec's colour, the
owner's call); the bitrate (12 000 bit/s for 3 200 -- 6 000, Opus's low end, research 170 §6.2's box, until OT.R44); a
packet's size (Opus at 12 000 bit/s over 20 ms is 240 bits of payload, 30 bytes, its table-of-contents byte within --
that is the arithmetic of the setting, **not** a measurement; a real packet's size varies with the speech).

**The wire at 12 000 bit/s (VOICE-2, 2026-10-09).** The wire is unchanged: four packets an 80 ms frame, `u8 1, u16
seq, u8 n, n x (u8 len, bytes)` (`net/voiceWire.ts`), 8 bytes of framing. At 30 bytes a packet nominal a frame is
**128 bytes**, half the relay's `VOICE_FRAME_BYTES_MAX_PLACEHOLDER` (256; research 225 §6) -- the harness's frames
(§3.1, 30-byte fakes) are exactly that. The only browser record of real sizes is 227 §4.6's at 6 000 bit/s: packets of
6-27 and 7-32 bytes, mean 14.9 and 15.0. Scaled by two: a mean of 30 (a 128-byte frame, a margin of 128) and a largest
packet of 64; four of those in one frame would be 264 bytes, 8 over the cap -- not seen (the record gives no frame's
total, and the largest packet was one of a frame's four), so the margin for the largest frame is **not measured**: the
e2e probe's `packetsPerFlush` and the specs' records were not re-run here (the seat's window; VOICE-2's host
conditions). What settles it: the window's next `voiceMatch` record at 12 000 bit/s with each frame's byte total logged
(`sendVoice`'s length on the talker's page, or the relay's `binary` sizes); a frame over 256 is a strike and a lost
80 ms. The cap is on the whole frame, its 8 bytes of framing included (`room.ts` `voiceFrame`, `bytes.byteLength >
VOICE_FRAME_BYTES_MAX_PLACEHOLDER`), so four packets have 248 bytes, 62 each: 12 000 bit/s puts the record's scaled
peak (64) over the cap, and the window's per-frame byte totals decide whether a relay task raises it (research 225 §6;
the relay is not changed here).
The 80 ms cadence and the four-per-frame shape are the original's (R170.12, W20.R2).

**The module** (`voiceCodec.ts`):
- `isVoiceSupported(wc)` is true only when `AudioEncoder`, `AudioDecoder`, `AudioData` and `EncodedAudioChunk` exist
  and both `isConfigSupported` calls answer `supported: true`; false, never a throw, otherwise. The brief's `WebCodecs`
  type named three constructors; the decoder takes nothing but an `EncodedAudioChunk`, so the type carries the fourth.
- `createVoiceCodec(wc)` is null without WebCodecs; it opens and configures the encoder and the decoder once.
- `encodeFrame(block)` takes exactly 640 samples (any other length: null, nothing encoded), builds one `AudioData`
  (`f32`, 8 000 Hz, mono, its timestamp the samples fed to this encoder so far x 1e6 / 8000, so the encoder sees one
  stream) and feeds it to the encoder, which **runs on across the talk -- no flush per frame** (CLOSE-FIX-2). The
  encoder's packets are queued as they come; the call gives the oldest **four**, and a surplus waits for the next
  call; while fewer than four wait it gives **null** (the first call of a talk always: in a browser a block's packets
  come as the encoder's tasks, after its call returns). Never three, never five: the wire's four-per-frame shape and
  the relay's refusal of any other count stand (SVC-21's review F3, kept). This grouping is
  `VOICE_PACKET_GROUPING_ADAPTATION` (§6), a browser adaptation: the original encoded each 80 ms read as four SASE
  frames of one continuous stream (`FUN_0030f990` D:L211490-211498, research 170 §6.1); what the page adapts to is
  Chromium's packetisation, below. Calls run one at a time. A WebCodecs error closes the codec (the standard's rule):
  the next call drops that encoder and every packet it held, opens a fresh one (timestamps from 0) and feeds its block.
- `endTalk()` -- the talk's end, called by the voice client at the release, at the watchdog's end and when the floor
  entry stops naming the page (§3) -- flushes the encoder once (only when a block was fed since the last flush) and
  drops everything queued: the partial group and the flush's own packets. No padding is ever sent, and the next talk
  starts on an empty queue.
- `decodeFrame(packets)` gives 640 samples always: each of the four slots is its packet decoded and flushed on its
  own, so a garbled packet costs only its 20 ms; a missing, empty or garbled packet is 160 samples of silence (a page
  policy: what the original's decoder played for a frame that never came is not read, `VOICE_LOSS_PLACEHOLDER`, §6).
  Where the decoder puts out another rate than 8 000 Hz (an Opus decoder may decode at 48 kHz whatever it is asked),
  the packet's first channel is brought to 8 kHz by linear interpolation (the same adaptation as §2's). A conversion
  the browser refuses (`copyTo` throwing) is that slot's silence, every output closed (review F4). Every packet is
  sent as a `key` chunk (an Opus packet decodes on its own).
- `close()` closes both and drops the queued packets (no flush: nothing queued would be sent); later, `encodeFrame`
  gives null, `endTalk` does nothing and `decodeFrame` gives silence.

**The per-flush question, closed (CLOSE-FIX-2, a rendered-browser observation, 2026-10-08).** SVC-21 flushed the
encoder once per 80 ms frame and needed exactly four packets back. In the browser window's run of
`voiceMatch.spec.ts` (Chromium 153.0.8010.12, the full build, `--use-fake-device-for-media-stream` with a 440 Hz tone;
the brief `plans/briefs/2026-10-08-s20-close-fix-2.md`), the spec's probe encoded one 640-sample 8 kHz frame with
`VOICE_ENCODER_CONFIG` and flushed: **five** packets came out. In the lobby, with CIRCLE held two seconds, the talk
flag, the floor and `can_talk` were all set and `sent` stayed 0: every frame was dropped as "not four". So the encoder
now runs continuously and the codec groups by four (above); a flush happens once, at the talk's end, and its packets
are dropped. Not established by that run: how many packets Chromium puts out for the **first** block fed without a
flush (four, or three with the encoder's look-ahead held) -- the queue takes either, the unit tests cover both (fakes
with and without a look-ahead) -- and whether Firefox or Safari packetise the same way (H-next a). The per-packet
decoder flush stays: each packet is decoded on its own, so a garbled one costs only its 20 ms.

**What the grouping costs.** Latency: a block's packets come after its own call, so they go up with the next block's
-- one 80 ms frame later than a flush per frame would have sent them, plus a frame more if the encoder holds a
look-ahead (the first block's packets then complete only with the second's). The talk's end drops what is queued:
the last block's packets (80 ms of speech) with no look-ahead, up to two blocks' (160 ms) with one -- the unit test's
fake with an 80-sample look-ahead holds seven packets and the flush's two at the release -- and more if the browser's
outputs lag further. A backlog was never worked off (the fix's review, 2026-10-08, low): a call that finds fewer than four queued -- a main-thread pause delivering two blocks before the earlier block's outputs -- returned nothing, and every later call took four as four arrived, so that 80 ms of delay stayed for the rest of the talk (a larger stall raising it again), and the talk's end dropped the backlog with the tail. [VOICE-2, 2026-10-09: measured (§3.1) as the cause of gaps between the listener's slots; each call now hands out every complete four queued, so a stall's delay is worked off at the next block. Nothing is dropped to do it -- dropping to the newest four stays a choice not made.] All three are measured in no browser yet; the sound is the owner's ear (H-next a).

**Owed, kept apart from the unit tests:**
- **Which sample rate a browser takes.** The configuration asks for 8 000 Hz; whether Chromium, Firefox and Safari
  accept 8 000 Hz input for Opus is not known from this tree. `isVoiceSupported` asks the browser itself; the check
  across the three is H-next a's (with OQ-11's first-press check). Built: **8 000 Hz** (no browser was opened, so no
  refusal was seen; the brief's fallback, 48 000 Hz input upsampled in the collector at the same bitrate, is not built).
  The same check counted the packets one flush of a 640-sample frame emits: five in Chromium 153 [closed 2026-10-08,
  CLOSE-FIX-2, above; Firefox and Safari not yet seen].
- **The packet sizes at 6 000 bit/s** (a rendered-browser observation): owed to SVC-20b-page's spec. The relay's frame
  cap is SVC-20b-relay's (wave 2) and takes its value from that observation (the plan's constraint 4). [Taken at 6 000
  in 227 §4.6's record (packets 6-32 bytes, mean 15); at 12 000 owed -- "The wire at 12 000 bit/s" above.]
- **The sound**: not measured (H-next a, "tuned by ear"). VOICE MODULATION is applied before the encode by SVC-22
  (research 170 §6.4): this codec only carries what it is given.

Confidence: the configuration is a **reading** of OT.R24 and R170.12, its R170.12 lines reviewed 2026-10-08; the sound is not measured.

## 2. The capture's resampling

The original's headset delivered 8 kHz itself, its gain steered by the codec's level trend (research 170 §6.1,
`VOICE_RECORD_GAIN_STEER_READING`, listed in 170 §10). In the page, `VOICE_RESAMPLE_ADAPTATION` (a browser
adaptation, no original):

- The capture `AudioContext` is opened at 8 000 Hz (`sampleRate` in its options; the voice client's, §3), so the
  AudioWorklet receives 8 kHz mono. The worklet (`captureWorklet.ts`, thin, registered as `s2u-voice-capture`) feeds
  each 128-sample quantum of its first input's first channel to `collectBlocks(sampleRate)` and posts every 640-sample
  block, its buffer transferred. The node is made with one channel, explicit, so the browser downmixes.
- `collectBlocks(inputRate)` gathers 640-sample blocks and keeps the remainder. Where the browser refuses an 8 kHz
  context and gives another rate, it resamples as it streams by **linear interpolation**: output sample k is the input
  at k x inputRate / 8 000 (48 kHz: six in, one out). Linear interpolation filters nothing above 4 kHz, so that path
  aliases where an 8 kHz context (the browser's own resampler) does not; it is the fallback, labelled, not the default.
- Whether each browser connects a microphone into an 8 000 Hz context is not known from this tree: owed to H-next a.
  Firefox is reported to refuse `createMediaStreamSource` when the context's rate differs from the microphone's
  (unverified here); if so, the context at the microphone's rate and the 48 kHz resampling path are Firefox's normal
  path, not a fallback -- H-next a checks that case by name.
- The record gain steer is the browser's automatic gain (W20.R14: the setup page's capture constraints, taken as they
  are): nothing here. W20.R14's difference from research 170 §6.4 (noise suppression on, not off,
  `VOICE_CAPTURE_CONSTRAINTS_ADAPTATION`) belongs to the voice client that takes the microphone and is written with §3.
- The worklet is loaded by the voice client through `audioWorklet.addModule` (SVC-20b-page); it is never imported by
  the page, since it registers itself on load.

## 3. The voice client and playback

Written 2026-10-08 15:50Z for SVC-20b-page (`agent/online-page`, from `agent/online` 91ce0ec4f), sprint 20 wave 2, on
the relay's events as merged (SVC-20b-relay, research 225 §4). The code: `packages/viewer/src/voice/voiceClient.ts`
(new, the part), `voice/voicePlayback.ts` (new, the jitter buffer and the gain), `net/client.ts` (the `Frame.Voice`
branch: `onVoice`, and `sendVoice`), `netPage.ts` (the `voiceFrame?` hook, fed from `onVoice`), `matchCore.ts` (the
`voice` capability, on in both sets), `matchNet.ts` (`PART_DEPS.voice`), `matchTaunts.ts` (the talk input's menu),
`matchMount.ts` and `main.ts` (the mount), `hook.ts` (`voice()`). The tests: `test/voiceClient.test.ts` (new) and
`test/netClient.test.ts` (the drop case rewritten), with `matchCore`, `matchNet` and `matchMount` pinned -- unit tests
over fakes of WebAudio, WebCodecs and the microphone. No game ran, no browser was opened, no server was contacted.

**One part, both matches (constraint 1, PF).** `mountVoice` is mounted once by `/testroom` (`main.ts`, beside the
taunts) and once by the front end's match (`matchMount.ts`), on the same deps: the page's `NetPage` and the match
audio's tuner source (`GameAudio.getTuners`). Its hooks `voiceFloor` and `voiceFrame` are `PART_DEPS.voice`, owed from
both pages by the `voice` switch, on in `TESTROOM_CAPABILITIES` and `FRONT_END_CAPABILITIES`.

**The talk flag (W20.R9: one state machine).** The taunts part (`matchTaunts.ts`) holds the talk input
(`voice/talkInput.ts`, SVC-22a) and draws, reads and resets its `menu` where it used its own `TauntMenu`; its `pad`
feeds `TalkInput.frame` once a frame and hands back `talk`, which the page passes to the voice part's `pad`. The options
it passes: the round, the Default preset, RUN AND TALK off (OQ-6: no options row), the menu's gate as before (a living
match player, no other screen, the map's data in), the talk's own gate -- in a match with no other screen over it, the
dead and the spectators included (`VOICE_DEAD_TALK_READING`, research 170 C4's strong reading; the room puts them on
their own channel, constraint 3) -- and the pad present and the window focused always: the two browser releases of
SVC-22a are not wired to the page's pad and focus here (SVC-22b's headset UX). [Wired 2026-10-08 by SVC-22b: §4.]

**The microphone (constraint 6; W20.R14, W20.R15).** Opened only through `getGameMicrophone()` and only at the first
rising edge of the talk flag, never at the mount and never on a pad without talk; a second press reuses the stream. Its
constraints are the setup page's, taken as they are (echo cancellation, noise suppression and automatic gain on,
`gameMicrophone.ts:16`): research 170 §6.4's "noise suppression off" is the difference, recorded as
`VOICE_CAPTURE_CONSTRAINTS_ADAPTATION` (§6) and not applied. A null answer (the setup page's switch off, a refusal, a
`NotAllowedError` for want of a user activation) is the no-headset state for the session (R170.11): no `voiceTalk`, no
frame up, the room's frames dropped, `state().headset` false, and nothing retries. A microphone permission the browser
already answers `denied` at the mount (`navigator.permissions.query({name: 'microphone'})`, which opens nothing; the
review's F5) is the same state from the start. Otherwise, before the first press the page counts as having a headset
unless the setup page's switch is off (`gameMicrophoneOn()`, a stored preference, which opens nothing), and so plays the
room's voice -- `VOICE_LISTEN_BEFORE_PRESS_ADAPTATION` (§6): the original knew its headset at load, and H87
VOICE-LISTEN-ONLY's default is "no, as the original"; routed to the owner there. The track is stopped at `dispose` (the match's release and close in `matchMount.ts`; on `/testroom`, at
the match's end in `connectNet` -- a map change, Online toggled, the room made again -- which mounts a fresh client for
the next match: the close review's F4, 2026-10-08; until then `/testroom` kept it for the page's life), and a
microphone that answers after `dispose` is stopped at once.

**The capture.** An `AudioContext` at 8 000 Hz (`VOICE_SAMPLE_RATE_READING`; where the browser refuses that rate, or
will not join the microphone's source to it -- Firefox's reported refusal, §2 -- a second context at the browser's own
rate, which the worklet's collector resamples, `VOICE_RESAMPLE_ADAPTATION`; the review's F7), resumed when it comes up
suspended (the talk waits until it runs), the worklet module loaded by URL (`./captureWorklet?worker&url`,
Vite's bundled worker URL; not a static import, since the module registers itself on load), the microphone's source
into an `AudioWorkletNode` of one channel, explicit, connected to the context's destination so the graph pulls it (the
processor writes no output: silent). A capture that will not open is the no-headset state too, its track stopped. The
codec is asked of the browser first (`isVoiceSupported`), before the microphone (the close review's F3, 2026-10-08):
without WebCodecs Opus there is no voice either way (W20.R3, H-next d) -- the microphone is never opened (no notice, no
prompt), the press is the no-headset state and says the headset's no-headset line once (H139): nothing sent, nothing
played.

**The floor and the frames up (constraint 4; W20.R2, W20.R6).** `voiceTalk {on: true}` goes once at the flag's rising
edge -- at the first press, once the capture is up, if the flag is still set, so a page with no headset never takes a
floor -- and `{on: false}` once at the falling edge (and at `dispose`, if an `on` went). A worklet block becomes one up
frame (`encodeVoiceUp`: four packets and a u16 `seq` from 0, rising by one a frame sent, wrapping at
65 536) **only while** the flag is set and the floor entry for the page's channel (`voiceFloor`) names the page's own
member id; otherwise the block is not even encoded. [CLOSE-FIX-2, 2026-10-08: the four are the next four the codec's
running encoder has put out -- one block behind, §1 -- and the talk's end (the release, the watchdog's, the entry no
longer naming the page) ends the codec's run, `endTalk`, its tail never sent.] A new client (a reconnect, another match) forgets the old room's
entry and talk. Both pages let the talk go under the loading hold (`voice.pad(false)`), and a block that finds no `pad`
call in the last `VOICE_TALK_WATCHDOG_ADAPTATION` (1 000 ms; 100 ms until CLOSE-FIX-3) ends the talk as a release would
(§6): a hidden tab stops the page's frames while the capture runs on (the review's F4). [CLOSE-FIX-3, 2026-10-08 (the
brief `plans/briefs/2026-10-08-s20-close-fix-3.md`), a rendered-browser observation: the browser window's run of
`voiceTestroom.spec.ts` on `agent/online` ecf644a0d (Chromium 153, three pages each in its own headless browser, all on
MP2 under SwiftShader) saw the talker's floor entry go to `null` while CIRCLE was still held -- 14 frames sent, 9 heard
on his side -- with no console or page error; the same run with the watchdog at 1 000 ms passed both talks. A frame of
the talker's page had taken longer than 100 ms under that load, and the watchdog had ended a talk still held. The value
is now one second: a hitch keeps the talk; a hidden tab's talk still ends within a second of its last frame, inside the
server's 10 s cap (W20.R5). The frame time itself was not measured; 1 000 ms is the diagnostic's value, not a bound.]

**Playback (W20.R10; R170.6, R170.12).** A room's frame (`NetClient.onVoice` -> `NetPage` `voiceFrame`) is dropped
before the decode when the page has no headset or the speaker is muted locally (the mute is the listener's: the
original skips a muted speaker's frames at playback, `FUN_0030f7e0` D:L211411-211415, and the room is told nothing);
otherwise decoded (SVC-21: four packets to 640 samples, a lost packet silence) and handed to the jitter buffer, then
played through one gain node on a playback `AudioContext` of its own, outside the 989snd mix, mono (L = R). The gain is
the tuner's `HEADSET_CONTROLLER` (`TUNER_VARS.headset`, default `HEADSET_VOLUME_DEFAULT` 0.75) clamped to 0..1 -- the
original's `headset_controller` x 100 clamped to 0..100 (`FUN_0030fef0` D:L211697-211704) over 100. The original reads
it once, when the headset is opened (`FUN_0030fef0`'s calls, D:L211032 and D:L211786), and truncates it to a whole
percent (the store at D:L211701); the page reads it each frame, unrounded, so it follows the OPTIONS slider -- that
follow is W20.R10's, not the original's (the review's F6). `state().speaker` is the last played frame's speaker while the floor entry names him,
null once it does not (the HUD's own rule is MATCH-05's).

**The jitter buffer (`VOICE_JITTER_MS_PLACEHOLDER`, ours).** The original decoded each message straight into the
headset (research 170 §6.1); the relay's TCP socket delivers in bursts, so the page holds a small delay, 160 ms (two
frames), untuned. A run starts at its first frame: that frame's slot begins the delay after it came, and each later
frame's slot is 80 ms per `seq` from it, so frames play in `seq` order whatever order they arrive in; a `seq` that never
comes is its slot's silence (nothing plays there: SVC-21's loss rule, `VOICE_LOSS_PLACEHOLDER`); a frame whose slot
has begun is late and dropped, and so is one whose slot lies more than `VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER` frames past
the window (a jumping `seq`: the close review's F5, 2026-10-08). A run starts again on another speaker; at any frame once everything scheduled has played
(a pause in the talk, the network fallen behind, or a new page given a departed member's id -- the server hands out
the lowest free id -- whose `seq` starts again at 0: TCP keeps one speaker's frames in order, W20.R1); and when the floor
entry's holder changes (the review's F1: it read "on a newer `seq`" until then, which dropped a reused id's frames).

**Owed, kept apart from the unit tests.**
- **The browser observation SVC-21 owed** -- the Opus packet sizes at 6 000 bit/s and the packets one flush of a
  640-sample frame emits, in Chromium on the dev page: not taken here (no dev server was started); owed to V-E2E.
  [The flush's count was taken 2026-10-08 -- five in Chromium 153, §1, CLOSE-FIX-2; the sizes stay owed.] The
  relay's frame cap (`VOICE_FRAME_BYTES_MAX_PLACEHOLDER`, research 225 §6) waits on it.
- **The worklet's URL in a build**: `?worker&url` is Vite's form for a bundled worker's URL; no build ran here, so the
  built page's capture is unverified until the gate's build and V-E2E's spec.
- **The three browsers** (H-next a): the 8 000 Hz capture context, the first press without a click, the sound.
- **The browser releases** (pad lost, focus lost) wired into the talk input: SVC-22b. [Done 2026-10-08, §4; the rendered check stays V-E2E's.]

**The owner's gain (VOICE-2, 2026-10-09; OT.R44).** The gain node's value is `headsetGain(HEADSET_CONTROLLER) x
VOICE_PLAYBACK_GAIN_OWNER` (1.5), at the node's making and each frame (`voicePlayback.ts`): the original's rule above
stays the base, and the owner's +50% ("in game it sounded far too low compared to other audio levels. Can it be bumped
up just a bit") is his choice, labelled, not the original's. At the default 0.75 the gain is 1.125 (above unity: a
sample near full scale may clip in the WebAudio graph -- by ear, H137). One `VoicePlayback` serves the game lobby's
client and the round's, so the lobby hears the same level (the original's one voice object, `DAT_0045b718`); the
ruling named the match, and a lobby-only level would be a second setting no one asked for. Unit-tested
(`test/voicePlayback.test.ts`: h at 0, 0.75 and 1, a tuner change, the clamp before the gain).

Confidence: the gain's and the mute's cites are a **reading, pending review** (`FUN_0030fef0` D:L211697-211704 and
`FUN_0030f7e0` D:L211411-211415, as the brief gives them; looked at here in the decompilation: the value x 100 clamped
at D:L211699-211701, the per-speaker byte read at D:L211414-211415); the jitter delay is a **placeholder**; the rest is
the plan's rulings and the browser's (adaptations), unit-tested over fakes.

### 3.1 The lobby's chop, measured (VOICE-2, 2026-10-09)

Written 2026-10-09 (06:39Z) for VOICE-2 on the owner's finding (OT.R44; H137's solo result, a **physical playtest**:
one machine, two windows, two accounts, one headset): "the audio was very choppy in the lobby and didn't come in as one
sequence", where the round's was whole. **Kind of evidence: unit-level simulation** (`packages/central/test/
voiceChopHarness.test.ts`), not a browser run and not a capture; the stalls below are the harness's labelled inputs,
not measurements of a page.

**The harness.** One talk of 6 s (75 blocks of 80 ms) from member 1 to member 3 through the real code: the talker's
voice client (`mountVoice`) and codec over WebCodecs fakes (four 30-byte packets a block, put out as a task 2 ms
after `encode`, as Chromium's are), the room (`Room`: its floor, its bucket, its size cap, `binary`, the server's
`sendLossy` over a socket at backlog 0), and the listener's voice client, its decode and its jitter buffer
(`VoiceJitter.place` on a playback clock that is the simulation's). Simulated time: each page one main thread (a task
posted inside a stall runs at the stall's end, in posting order -- the worklet's port messages, the encoder's
callbacks, the socket's messages), the worklet's blocks every 80 ms from the audio thread whatever the page does, 5 ms
a socket hop, the room stepping at 60 Hz. The lobby: the room waiting for its launch, both seats on 9. The match:
launched, both SEALs on 0. Reported: frames sent, struck (the cap, the bucket), skipped (the backlog bound), relayed;
the relay's spacing toward the listener; frames scheduled and dropped by the jitter buffer; **holes** (a gap between
one scheduled slot's end and the next one's start) and runs; the largest frame; the most a frame left after its block.

**The numbers** (each the harness's printout, every column from the same harness file: a column for an earlier commit is
its printout with the three voice sources -- `voiceCodec.ts`, `voiceClient.ts`, `voicePlayback.ts` -- put back to that
commit's and its assertions made soft for that run: "before" `agent/online` 42914b658; "first fix" VOICE-2's 22cd9c3ba;
"burst cap" 7e2c5902f; "now" the time-based rule. Each cell: frames sent / relayed / scheduled, then the jitter
buffer's drops, the holes (their total), the largest lag of a frame sent behind its block. 74 frames is the whole
talk; a stall that covers the talk's end at 6 s loses the blocks run after the release with the tail. "Interleaved":
the encoder's outputs run ahead of the port messages a stall queued, so the backlog comes out over several calls.)

| case | before (42914b658) | first fix (22cd9c3ba) | burst cap (7e2c5902f) | now |
|---|---|---|---|---|
| lobby, steady (and interleaved) | 74 / 74 / 74, spacing 80-80 ms, 0 struck, 0 skipped, 0 dropped, **0 holes**, lag 80 ms, frame 128 B | the same | the same | the same |
| match, steady | the same as the lobby, number for number | the same | the same | the same |
| the talker stalled 100 ms once a second | 73 / 73 / 73, 0 dropped, **1 hole (180 ms)**, lag 260 ms | 74 / 74 / 74, 0 dropped, **0 holes**, lag 180 ms | the same | the same |
| the talker stalled 150 ms a second | 73 / 73 / 73, 0, **1 hole (190 ms)**, lag 310 ms | 74 / 74 / 74, 0, **0 holes**, lag 230 ms | the same | the same |
| the talker stalled 200 ms a second | 72 / 72 / 72, 0, **2 holes (360 ms)**, lag 440 ms | 74 / 74 / 74, 0, 1 hole (200 ms), lag 280 ms | the same | the same |
| the talker stalled 300 ms a second | 71 / 71 / 71, 0, **2 holes (500 ms)**, lag 620 ms | 74 / 74 / 74, 0, 1 hole (300 ms), lag 380 ms | the same | 65 / 65 / 65, 0, **6 holes (960 ms)**, lag 320 ms; 9 discarded |
| the talker stalled once, 500 ms (at 2 s) | 68 / 68 / 68, 0 dropped, 1 hole (480 ms), lag 560 ms | 74 / 74 / 66, **8 dropped**, 2 holes (640 ms) | 69 / 69 / 69, 0, 1 hole (480 ms); 5 discarded | 70 / 70 / 70, **0 dropped**, 1 hole (560 ms), lag 320 ms; 4 discarded |
| the talker stalled once, 700 ms (at 2 s) | 66 / 66 / 66, 0, 1 hole (680 ms), lag 760 ms | 74 / 74 / 63, **11 dropped**, 2 holes (880 ms) | 67 / 67 / 67, 0, 1 hole (680 ms); 7 discarded | 68 / 68 / 68, **0 dropped**, 1 hole (720 ms), lag 320 ms; 6 discarded |
| once, 500 ms, interleaved | (not run) | (not run) | 74 / 74 / 66, **8 dropped**, 2 holes (640 ms) -- the cap never fired | 71 / 71 / 71, **0 dropped**, 1 hole (480 ms), lag 320 ms; 3 discarded |
| once, 700 ms, interleaved | (not run) | (not run) | 74 / 74 / 63, **11 dropped**, 2 holes (880 ms) | 68 / 68 / 68, **0 dropped**, 1 hole (680 ms), lag 280 ms; 6 discarded |
| the talker stalled 500 ms a second | 68 / 68 / 37, **31 dropped**, 6 holes (3 340 ms), lag 1 060 ms | 69 / 69 / 31, **38 dropped**, 6 holes (3 500 ms) | 46 / 46 / 46, 0, 6 holes (2 300 ms) | 49 / 49 / 49, **0 dropped**, 5 holes (1 760 ms), lag 320 ms |
| the talker stalled 700 ms a second | 66 / 66 / 35, **31 dropped**, 6 holes (3 700 ms), lag 1 420 ms | 69 / 69 / 31, **38 dropped**, 6 holes (3 700 ms) | 34 / 34 / 34, 0, 6 holes (3 460 ms) | 37 / 37 / 37, **0 dropped**, 5 holes (2 720 ms), lag 320 ms |
| the listener stalled 140 ms a second | 74 / 74 / 74, 0 holes | the same | the same | the same |
| the listener stalled 260 ms a second | 74 / 74 / 74, 1 hole (250 ms) | the same | the same | the same |
| the listener's decode flush a 2 ms task: idle; 60 fps busy 12 of 16.7 ms; 30 fps busy 30 of 33.3 ms | 74 / 74 / 74, 0 holes, each | the same | the same | the same |

**What it says.**
- **No chop below the page.** At a steady cadence the relay passes every frame of the lobby's talk 80 ms apart with
  nothing struck (the 128-byte frame is half the cap; the bucket's 25 a second is twice the 12.5), nothing skipped and
  nothing dropped at the listener: one run, no hole -- the lobby's numbers are the match's, frame for frame. The relay
  (`room.ts` `voiceFrame`, `limits.ts`) is not the cause, and is not changed.
- **The cause found: the talker's codec carried a stall's backlog** (`voiceCodec.ts` `encodeNow`, as built by
  CLOSE-FIX-2: four packets a call, the CLOSE-FIX-2 review's low). A stall of the talker's page long enough to run two
  worklet blocks back to back (80 ms or more) makes the second call find its predecessor's packets not yet in (they
  come as a task after both blocks), so it sends nothing, and from then on every frame goes one block later for the
  rest of the talk -- a larger stall later raises it again. The listener's run was anchored on the talk's first frame,
  so the carried delay eats its 160 ms window (`VOICE_JITTER_MS_PLACEHOLDER`); the next stall's frames then come after
  their slots, the buffer drains, and a new run starts 160 ms after the late frame: a hole of 180-250 ms in the talk,
  and the talk's end drops the carried frames with the tail (73, 72, 71 sent of 74). That is "not one sequence": runs
  of voice with holes between them.
- **The fix** (`voiceCodec.ts`, `voiceClient.ts`): each block's call hands out every complete four queued, oldest
  first, and the client sends each as its own frame in `seq` order -- so a stall's backlog goes at the next block and the
  frames' delay falls back to one block. A stall under the window (100 and 150 ms) is absorbed: one sequence. RED
  `voiceChopHarness.test.ts` "RED (VOICE-2)" (1 hole of 190 ms; 0 after) and `voiceCodec.test.ts` "VOICE-2 RED 8".
- **Its cost, and its bound** (the reviews of 22cd9c3ba, low 1, and of 7e2c5902f, medium and lows 2-4, 2026-10-09).
  Sent whole, the backlog a long stall leaves overran the listener. From a steady talk a stall of the talker's page of
  160 ms or more drains the listener's buffer (it holds the 160 ms window; the 200 ms row's one hole); the next frame
  then starts a new run, and the backlog behind it, in `seq` after it, has slots 160 + 80 j ms ahead -- past
  `VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER`'s bound (160 + 4 x 80 = 480 ms) once the run's first frame is more than 400 ms
  old, which a stall of about 400 ms or more makes it -- dropped, and every steady frame after it with the same lead,
  until the run drained: one 500 ms stall dropped 8 frames, one of 700 ms 11, the newest speech, where the base gave
  one hole and none dropped (the first fix's column). 7e2c5902f capped a burst by the frames one call of the codec
  handed out (more than 4: keep the newest 2) -- but a browser may run the encoder's output callbacks between the port
  messages a stall queued, handing the backlog out over several calls of four or fewer, and the cap never fired (the
  interleaved rows: 8 and 11 dropped again). **The rule now is time, not the call** (`voiceClient.ts` `block`): each
  block's capture time is estimated on the capture context's clock -- the worklet puts out a block every 80 ms of it,
  so a block was captured no later than it came and no later than 80 ms after the one before, the lower of the two; a
  stall delivers its blocks late and together, each still 80 ms after the last, and a suspended context stops that
  clock with the worklet -- the codec hands the time back with the frame its block starts (`VoiceFrameOut.capturedAt`),
  and a frame older than `VOICE_STALE_FRAME_MS_ADAPTATION` (320 ms: the window and two frames) when it would be sent is
  not sent, its `seq` spent. A discarded frame is always older than every frame sent after it, so the `seq`s skipped lie
  before the first frame sent after the stall: a listener the stall drained starts its new run on that frame (a run
  starts on any frame once drained, whatever its `seq`), and one it did not drain hears silence in the skipped slots
  with every later frame still in its own slot. RED "RED (the review of 7e2c5902f, medium)" (interleaved, 8 and 11
  dropped on 7e2c5902f); now none dropped and one hole in every row of single stalls, interleaved or not, and none
  dropped in any row.
- **The latency a stall leaves** (the review of 7e2c5902f, low 4). The listener's run plays its first frame 160 ms after
  it comes, so its delay behind the talker is that frame's age plus 160 for the rest of the run: 240 ms steady. Sent
  whole (the first fix), a 300-400 ms stall's backlog started the run on a frame up to 400 ms old: up to 560 ms behind
  for the rest of the talk. The time rule bounds it: no frame older than 320 ms is sent, so a run is at most 480 ms
  behind the talker (320 + 160). Two numbers are kept apart here (the review of 3bb1a9ff9, low 2): that lag, and the
  drop bound, a slot at most 480 ms **ahead** of a frame's arrival (`VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER`). A run
  started on a frame of age A puts each steady frame after it (about 80 ms old) A + 80 ms ahead of its slot, so the
  ceiling is A at most 400; 320 keeps 80 ms of margin under it for a capture clock read a render quantum late. Its
  price is the row of 300 ms stalls every second: each stall now discards its oldest frames and leaves a hole (6
  holes, 960 ms, 9 frames not sent) where the first fix's whole backlogs gave one hole and then ran up to 380 ms later
  behind. Discarding only what the listener could not play would need the talker to model the listener's run (its
  anchor, its drain) across the network's jitter; not built.
- **For the owner's ear (H137; the review of 3bb1a9ff9).** A threshold of about 384-400 ms instead of 320 would bring
  the 300-ms-every-second row back to one hole, at the cost of about 540 ms of lag behind the talker after such a stall
  and about 20 ms (one quantum) of margin under the drop bound for the capture clock's jitter. Which the ear prefers --
  a hole a stall and less lag, or fewer holes and more -- is his call (`VOICE_STALE_FRAME_MS_ADAPTATION`, §6).
- **The estimate's reset** (the review of 3bb1a9ff9, low 1). The capture-time estimate only moves earlier; a quantum
  the worklet skips (no input channel, `captureWorklet.ts`) leaves it 16 ms early for good, and some 15 of them would
  make every frame look older than 320 ms -- nothing sent, the floor held. It starts again at each talk's press, so the
  error is bounded to one talk (`voiceClient.test.ts`: 20 blocks 96 ms apart stop a talk, the next talk sends).
- **What it is not.** Not a wider jitter buffer (refused by OT.R44; `VOICE_JITTER_MS_PLACEHOLDER` stays 160 ms). A
  stall longer than the window is still a hole (200 ms: 1 for six stalls; a listener's own stall past the window,
  260 ms: 1) -- the window is the bound, not the cause. **Audio is discarded** after a stall that leaves frames older than
  320 ms when they would be sent: the stall's speech older than that (4 frames for one 500 ms stall, 6 for 700 ms; 74
  less 65, 49 and 37 sent when a 300, 500 or 700 ms stall comes every second, the last stall's cut by the talk's end
  among them) -- the port's adaptation
  `VOICE_STALE_FRAME_MS_ADAPTATION`, its cost heard as the stall's hole, in exchange for the newest speech played rather
  than dropped at the listener and the latency bounded. A stall under about 240 ms discards nothing.
- **What the harness cannot reach.** Why the lobby's page stalls where the round's does not, if it does: the harness
  shows the mechanism and its threshold (two blocks back to back on the talker's page, or a run of decode flushes
  held past 80 ms a frame on the listener's), not the lobby page's own stalls. Nor the other page-side candidates the
  brief listed, each read in the code and found not to cut a held lobby talk: the capture context's resume (`open()`
  waits for it once, the talk then goes); the lobby's ARMORY / radio (`voiceRadio` only on `GoneToArmory`'s edges, not
  during a talk on the lobby's screen); the 1.0 s re-press window (`VOICE_TALK_LOCKOUT_MS_READING`: only a release and
  a re-press, and the lobby's CIRCLE is the pad state's FALLING / RISING, `nextPadState` -- held, it stays DOWN, a menu
  state's flush gives a second FALLING, never a RISING; the DEV R key is held in `headset.ts`'s `down` set until its
  keyup); the playback's restart (`run.at`) only on a drained buffer, which steady frames never reach.
- **Owed, the seat's browser window** (one page a browser, the lobby then a round, a talk of 8 s): on the talker's
  page, each worklet block's arrival time in `voiceClient.ts` `block` and the frames each `encodeFrame` hands out (a
  call with 0 then one with 2 or more is a stall worked off), and the `longtask` entries (`PerformanceObserver`, type
  `longtask`) in both phases; on the listener's page, each `voiceFrame`'s arrival, its decode's end and `place`'s
  answer (a slot, or null and why) in `voicePlayback.ts`, and the run restarts. The lobby against the round on the same
  host settles whether the lobby's page stalls more, and whether the per-packet decode flush (four round trips a frame,
  §1) falls behind there; 227 §4.6's lobby record already shows a listener scheduling 19 of 34 frames the relay
  delivered (host load, three scenes) against 11 of 11 in the round.

### 3.1.1 The browser window's measurement (the Online seat, 2026-10-09 13:53-14:02Z; the merge controller's window)

**The instrument** (`packages/viewer/e2e/voiceLobbyStall.spec.ts`, the lane's, no page code touched -- a spec's own adaptation): Playwright
times and sizes every WebSocket frame on each seat (the voice frames by their first byte, `Frame.Voice`), observes each page's
long tasks (`PerformanceObserver` `longtask`; the ones of 80 ms and more counted apart), and samples the voice clients' `sent` /
`heard` every 200 ms through the existing hooks, while a talker holds CIRCLE 8 s. What it cannot see without page code: the codec's
groups per call and `place`'s restarts -- the arrival spacing, the bursts (two frames 20 ms or less apart) and the holes (a gap over
200 ms) stand in for them. Chromium 153's full build, a browser per seat, SwiftShader; the data environment; 11.2 GB free at the
lowest; the lock FREE; one file per invocation on the lane's ports.

| run | talker: frames, spacing ms (min / med / max), bursts, long tasks (n, total ms, >=80 ms) | listener: frames, spacing, bursts, holes, long tasks | bytes a frame | counters sent / heard |
|---|---|---|---|---|
| **the game lobby**, A->B hold 1 (8.7 s) | 102, 54 / 75 / 114, 0, none | 102, 28 / 72 / 145, 0, 0, none | 65-121 (mean 90) | 97 / 97 |
| the game lobby, A->B hold 2 | 101, 53 / 74 / 110, 0, none | 101, 25 / 70 / 139, 0, 0, none | 62-129 (mean 88) | 97 / 97 |
| the game lobby, B->A | 102, 56 / 74 / 110, 0, none | 102, 24 / 73 / 140, 0, 0, none | 68-122 (mean 90) | 99 / 99 |
| **the `/testroom` round** (the control; three pages on MP2), p2->p3 hold 1 | 95, 0 / 80 / 179, **9**, **71, 4 969 ms, 13** (max 143) | 95, 0 / 76 / 269, 11, **2 (269, 201 ms)**, 20, 1 140 ms, 1 | 84-141 (mean 110) | **91 / 70** |
| the round, hold 2 | 96, 0 / 82 / 189, 6, 74, 4 976 ms, 12 (max 115) | 96, 0 / 76 / 194, 13, 0, 13, 765 ms, 1 | 98-144 (mean 120) | 93 / 64 |

**What it says.** On this host the game lobby does not chop: every frame 80 ms apart on both seats, no burst, no hole, no long task,
every frame heard. The round, where three software-rendered scenes share the host, is where the talker's main thread stalls (about
five seconds of long tasks in an 8.5 s hold, a dozen of them past a block's 80 ms): its frames go up in bursts (the encoder's backlog
handed out, as the stale-frame rule allows for a short stall), the listener sees holes of 201-269 ms, and `heard` falls 21-29 short of
`sent` though every WebSocket frame arrived (95/95, 96/96) -- the client's drop bound and the playback window after the bursts, as
§3.1's harness predicts for stalls of a few hundred milliseconds. The bytes: 62-144 a frame at 12 kbit/s, under the relay's 248 B
payload cap in every one of 591 frames (H149's cap question: no frame near it in this record). **The owner's lobby chop is not
reproduced here.** His setup differs in one way a headless seat cannot copy: two windows on one machine, one of them in the
background -- Chromium throttles a background window's main thread (`requestAnimationFrame` stops, timers align to a second), which
is a stall of the talker's or the listener's page by the hundreds of milliseconds this section's rule is built for. **The
measurement his next playtest should make (H149, H137):** both windows visible side by side against one in the background, and the
page's long tasks read in each (the spec's observer works on any Chromium with DevTools; a `?devmode` page could log them); if the
background window is the stall, the fix is the page's, not the relay's (a worker-side capture path, or the talk ended on
`visibilitychange` as the pad reader already stops on a blur, `controllerSetup.ts:71-73`). The run's logs: `stall-lobby`, `stall-round`
in the seat's scratch; `originalSettings.spec.ts` ran green in the same window (4.1 min).

**The one measurement for the owner's next playtest (the merge controller's ask, 2026-10-09), in steps:** (1) open the two
windows **side by side, neither overlapping the other, both visible** -- Chromium throttles an occluded or minimised window's main
thread (`requestAnimationFrame` stops, timers align to one second), not a visible one; (2) make the same lobby holds as the solo
playtest (one window talking, the other listening) and listen for the chop; (3) then overlap the listening window (or minimise it)
and hold again; (4) in each window read the page's long tasks from DevTools (Performance, the Main track's red long-task marks; or
the Console on a `?devmode` page once a one-line logger is added) and note the longest one and how many. If the chop comes only in
step 3 and the long tasks with it, the hypothesis is settled: the occluded window's throttling stalls the page by the hundreds of
milliseconds this section's rule is built for, and the fix is the page's (below). If the chop is there in step 2 too, with no long
task, the cause is elsewhere (the headset's own capture, the network between the two windows) and the next measurement is the
WebSocket frames' timing in DevTools' Network panel, which this spec took on the headless seats.

**The mitigation if it is confirmed -- a design, not code (for the owner's reading):** take the capture, the encode and the send off
the page's main thread. The `AudioWorklet` already runs off it (the capture blocks arrive by its port); today the main thread takes
each block, runs the modulation stage, feeds the Opus encoder and sends the frame on the game socket -- every step a main-thread
task that a throttled window delays. In the design the worklet's port hands the blocks to a dedicated `Worker` that owns the voice
path end to end: the encoder (WebCodecs' `AudioEncoder` works in a worker), the grouping by four, the stale-frame rule on its own
clock, and a second WebSocket of its own to the relay for the voice frames (or the worklet's port straight to the worker, the
worker's socket authenticated by the same ticket) -- a worker's timers and sockets are not throttled with the window. What the
original's floor and the relay need from it is unchanged: the floor's ask, grant, release and the 10 s cut stay the main thread's
(the pad press, `voiceTalk`, the floor events, the UI), so the worker sends only while the main thread has told it the floor is
held (a `start` / `stop` message with the grant's `seq` base; the watchdog's release becomes a `stop`); the relay sees one voice
stream per seat as now (the second socket announces itself as the seat's voice carrier with the session token, the relay binds
it to the seat and keeps the bucket and the floor check per seat), four packets per 80 ms frame, `seq` in order, nothing new on
the wire's shape. The listener's side needs the same move in mirror (decode and `place` in a worker feeding the playback context)
only if the listening window is the throttled one -- step 3 says which. Cost: a worker bundle and a second socket per seat on the
relay; the floor's semantics untouched; a browser adaptation throughout, labelled, the original having no main thread to stall.

### 3.2 The voice late, choppy and unmarked (VOICE-LATE, 2026-10-11)

Written 2026-10-11 for VOICE-LATE (`agent/online-voicelate`, from `agent/online` 022044f39; sprint 18, the plan's row
and its brief `plans/briefs/2026-10-11-s18-voice-late.md`), on the owner's live playtest of 2026-10-10/11 (two accounts
on his host): the voice icons came promptly and right, the **audio** up to 10 s late, in small split chunks, choppy --
and, his answer, the listening window was visible during the presses and the sound came later "with no tell of who said
it, or what, or when". No game was run, no browser opened and no server contacted; the evidence below is unit tests
(fakes), and the browser repro is written for the merge controller's window, not run.

**Why the icons were prompt and the audio was not: two paths.** The talker's mark rides the floor event, the room's
reliable JSON `voiceFloor` (`Room.voiceTell`, `packages/match/src/room.ts:5407-5415` at 022044f39), told the moment the
floor changes. The audio rides the lossy binary `Frame.Voice` (`Room.voiceFrame`, `room.ts:5196-5216` at 022044f39):
each frame through the sender's bucket, the lossy send, the listener's decode chain, and the playback's jitter buffer on
the listener's audio context. A mark on time says nothing of the audio behind it.

**What the code held, read at 022044f39:**

- **(A) A playback context outside the page's unlock.** The playback made its own `AudioContext` at the first frame
  played (`voice/voiceClient.ts:160` `new AudioContext`, through `voice/voicePlayback.ts:189-199`) and asked a
  `resume()` it did not await. A frame comes off a WebSocket message: no user activation, and a pad press is none
  either (research 306 notes the same for File System Access). Where the page had no activation, or the browser held
  the new context suspended, its clock stood still: `place` gave slots on a stopped clock, every frame past the window
  was dropped as too far ahead (`VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER`), and whatever had been scheduled burst out
  together when something resumed the context -- seconds late, in chunks. The game's own audio has the page's one
  mechanism for this (`audio.ts` `GameAudio.unlockOn`, `WebAudioOut.unlock`, `resumeIfAllowed` and `pageActivation`),
  and voice's context was not on it.
- **(B) The mark lit by the floor alone.** The HUD's voice element, the compass mark and the lobby's bar named the
  floor's holder (`hudVoice.ts`, `gameLobbyHost.ts`), so late audio, played after the floor had gone, had no name.
- **(1) An unbounded decode chain.** `voiceCodec.ts:308-340` chained every frame behind the previous with no bound and
  decoded each of a frame's four packets with its own decode and flush: four awaits a frame, so a busy page's queue grew
  and was played late, frame by frame.
- **(3) Drops uncounted.** The relay's lossy drops -- the 16 KiB `bufferedAmount` skip (`server.ts:709-711`,
  `limits.ts` `VOICE_BACKLOG_SKIP_PLACEHOLDER`), the socket's binary budget (`server.ts` `RATE.binary`), the sender's
  bucket (`room.ts` `VOICE_FRAMES_PER_S_PLACEHOLDER`) -- and the page's own were counted nowhere, so a playtest could
  not tell a drop from lateness.

**The original, read.** 8 kHz, four 160-sample SASE frames per 80 ms in 32-byte messages, decoded straight into the
headset with no jitter buffer (research 170 §6.1). Its receive path `FUN_0030f7e0` (D:L211393-211441) takes a message
only on the listener's channel (the test at D:L211408), skips a muted sender's (D:L211411-211415), decodes it at once and
stores the sender in the voice object (`voice+8`, D:L211441). Its talker indicators read the **floor entry**: the HUD's
element names the holder through `FUN_0030e790` (D:L210828-210840: the listener's channel's entry held, by another than
this console) in `FUN_00238ac0` (D:L85678-85696) and holds the busy icon from it in `FUN_00239250` (D:L85850-85852); the
lobby's bar is `FUN_0027cbf0`'s (research 170 §5.1). No reader of `voice+8` was found in the voice object's functions.
So in the original the holder named and the voice heard were one: the audio was never behind the floor. **The brief
names `FUN_002425e0` as "the headset HUD"; read, it is not** (D:L90217-90331: a panel that writes a player's name with
his clan, `FUN_002c3ac0`, and four counts from his record's `+0x544`..`+0x5c8`; no voice object, no floor) -- the cites
above are the voice HUD's, as research 170 §5.2 gives them.

**The fix.**

- **(A) One mechanism: voice plays on the game's output.** The page's one output is the one `GameAudio.unlockOn`
  unlocks (the front end's menus, `uiSoundHost.ts`; `/testroom`'s, `main.ts`); `unlockOn` now records it and
  `audio.ts` `pageAudioOutput()` hands the page's voice its context (`AudioOut.context`, `WebAudioOut.context`) and its
  `resumeIfAllowed`. The playback (`voicePlayback.ts` `VoiceOutput`, not owned) puts its gain node on that context and
  never closes it; the disc page's click (or the launcher's START) that unlocks the game unlocks voice, every later
  pointer, key or touch resumes both, and a frame that finds the context suspended asks `resumeIfAllowed` -- the resume
  a pad's frame may ask once `pageActivation()` is true, with its own back-off. **Why sharing rather than registering a
  second context with the same path:** one context is one state -- what the game's sound proves running is what voice
  plays on, nothing has to be kept in step, and the gain node stays outside the game's 989snd mix as the original's
  headset was (the destination, not the master: research 170 §6.4); a second context registered with the unlock would
  have needed the unlock, the pad's ask and the statechange followed twice, a second mechanism in all but name. A test's
  injected context (`MatchVoiceDeps.audioContext`) is still the playback's own (owned, closed at `dispose`). The capture's
  8 kHz context stays its own (it is opened at the first talk press and awaits its resume before the talk goes: F7).
- **(2) A run starts only on a running clock.** `VoicePlayback.play` schedules nothing while the context's `state` is not
  'running' (a context that does not say counts as running): the frame is counted `suspended`, the jitter run is reset,
  the page's resume is asked, and the next frame that finds it running starts a fresh run the labelled delay after now
  -- never the burst of frames placed on the stopped clock.
- **The suspended mark** (a browser adaptation; the original shows nothing): a context that ran under the playback and
  is found suspended at a frame later -- a device change, a discarded tab -- is shown in the speaker's place, the round's
  element's name line (`hudVoice.ts`) and the lobby's bar (`gameLobbyHost.ts` `GameLobbyVoice.notice`, `@s2u/ui`
  `GameLobbyVoicePort.notice`), as `VOICE_SUSPENDED_MARK_PLACEHOLDER` (§6; the wording the owner's, a muted headset mark
  or the Legend's line), cleared at the next frame played. A page that never had an activation shows no mark: its
  frames are counted `suspended`, and asking for the gesture is the launcher's step, the disc-access lane's (its own
  words) -- the two are the owner's two choices, kept apart.
- **(B) The mark follows what the page plays.** `VoicePlayback.playing()` is the speaker whose scheduled frames span the
  context's clock now (not while a frame is only scheduled, not once the run has played out); `VoiceState.playing`
  carries it, and `hudVoice.ts` `heardTalker(holder, playing, self)` names the talker -- the voice playing, else the
  floor's holder, never the page itself -- for the element's line and busy icon, the compass mark, and the lobby's bar
  (`GameLobbyVoice.holder`). The floor event is the early hint; wherever the two agree (the original's case, its audio
  never behind its floor) the original's rule is unchanged; a talk whose audio outlasts its floor keeps its name until it
  has played. The name tag's icon and arrow (`tagTalkSprites`) still take the holder (their callers are the HUD's, not
  this task's).
- **(1) The decode chain bounded before the decode, one flush a frame.** `VoiceCodec.decodeFrame(packets, keep)` asks
  `keep` when the frame's turn comes; the client refuses a frame whose turn comes more than
  `VOICE_STALE_FRAME_MS_ADAPTATION` (320 ms) after it arrived -- the talker's own bound (§3.1), applied up front -- and
  counts it `backlog`, undecoded. A frame's present packets go to the decoder together and are flushed once
  (`decodeTogether`); a failure there (a garbled packet's error closes the decoder and the flush rejects, or not one
  output a packet) decodes the frame again packet by packet, so a garbled packet still costs only its own 20 ms.
- **(3) The drops counted on both sides.** The page: `VoiceState.drops` -- `stale` (the talker's frames not sent),
  `backlog`, `suspended`, `late`, `ahead` -- and the dev log's line `voice: {drops, heard, sent, frameMsMax}` at most
  once a `VOICE_LOG_PERIOD_MS` (1 000 ms, the server's own drop line's period) and only when a count moved, with the
  page's longest gap between frames over the window as its probe (`console.info` in a development build;
  `MatchVoiceDeps.log`). The server: three limit counters on /metrics (`limits.ts` `LIMITS`) -- `voice_skip` (the lossy
  send's answer, counted by the room, `Room.takeVoiceDrops`; `Conn.sendLossy` now answers 'sent' or 'skipped'),
  `voice_bucket` (`Room.takeVoiceDrops`), `voice_rate` (a voice frame among the binary frames past the socket's rate,
  also in `frame_rate`) -- and a `voice` log line once a second when any moved or the loop ran a whole tick late, with the
  probe: `loopLagMs` (the tick timer's lateness) and `stepMsMax` (the tick's longest step). Every counter is a playtest
  instrument, with no original.
- **(6) The repro.** `e2e/voiceLobbyStall.spec.ts` test 3: `/testroom`, three pages, the listener driven by the pad
  only (no key, click or touch), first before any activation and then after one click; it reads the listener's
  per-frame trace (`VoiceState.trace`, a development build's: arrival, decode end, the context's clock and state at
  `place`, the slot, the outcome; `VOICE_TRACE_FRAMES`, three 10 s talks at 12.5 frames a second), its drops and the heard
  talker, and asserts what the fix guarantees whatever the browser's policy: no frame played on a context that was not
  running; after one click the pad-only listener hears and the talker is named while his voice plays. Its run is the
  merge controller's browser window; until then it is written, not evidence.

**What holds it:** `packages/viewer/test/voiceLate.test.ts` (A1-A4, B1-B4, 1a-1c, 3a-3b) and
`packages/central/test/voiceLate.test.ts` (the skip under and over the backlog, the bucket's count, the three counters on
/metrics, `voice_rate` and the `voice` line with the probe) -- unit tests on fakes. The jitter delay is unchanged:
`VOICE_JITTER_MS_PLACEHOLDER` (160 ms) stays a placeholder; no new game number was added.

**The fix round (the review of VOICE-LATE, 2026-10-11).** (1) `uiSoundHost.ts` `pageUiSounds` reached `unlockOn` only once
the menus' sound files were read, so a front end whose files would not load left voice with no output (every frame
`suspended`, none played, no mark): `unlockOn` now runs at the call, before any read, and the page's output is recorded
and prepared at page start whatever the files do. (2) `VoicePlayback.suspended()` is the mark only while the context is
still not running -- a gesture's resume clears it with no voice frame. (3) `playing()` keeps one run across a hole of one
lost frame (`VOICE_PLAYING_GAP_MS_ADAPTATION`, 80 ms, the frame's own length; §6). (4) `heardTalker` is labelled a browser
adaptation with its two departures (§6). (5) `VoiceState.drops` is one frozen snapshot, rebuilt only when a count moves.
(6) The e2e's test 3 launches its pages with Chromium's `--autoplay-policy=document-user-activation-required` (a test
instrument, never a production flag): the browser window's first run found headless Chromium active and its context
running before any click, so (A) was never reproduced there; under the flag the listener's frames before its click must
all be `suspended`, and after one click it must hear and name the talker.

**Not settled here:** whether the owner's chop was (A) -- a context held suspended -- or a busy page's backlog (1), or
the relay (3): the counters and the browser window's run say which; and the owner's wording for the mark.

### 3.2.1 Silent while spoken, bits after the release (VOICE-LATE-2, 2026-10-12)

Written 2026-10-12 for VOICE-LATE-2 (`agent/online-vl2`, from `agent/online` 9238e24ab; sprint 18's row and its brief
`plans/briefs/2026-10-12-s18-voice-late-2.md`), on the owner's H137 test of main 2d5618c23 (two accounts on his host):
in the pre-match lobby the talker's mark showed open and nothing was heard while he spoke; after the release, short
choppy bits of part of the message. No game was run, no browser opened and no server contacted: the evidence below is
unit tests on fakes (fake timers), and the browser's own decoder timing is not measured here.

**The cause, as found -- the listener's decode below real time.** The path up and through the room is per frame
(the seat's source reading in the plan's row: the worklet's block, four packets out at the next block, sent at once;
the room relays each frame on arrival), and the talker's mark rides the floor event (§3.2), so the mark was prompt
whatever the audio did. The listener's decode, after VOICE-LATE, was a chain: each frame waited for the frame before it
to finish, then gave its present packets to the decoder and awaited one `flush()` (`voiceCodec.ts` `decodeNow` /
`decodeTogether` at 9238e24ab); a batch that failed -- an error, or not one output a packet -- dropped the decoder and
decoded the frame again packet by packet, each with its own flush (`decodePacket`): four flushes more. A WebCodecs
flush resolves on the page's main thread and holds the decoder's queue behind it, so on a busy page each frame cost a
main-thread round trip, serialised; past 80 ms a frame, the chain fell behind the talk. VOICE-LATE's own GREEN measured
arrival-to-decoded at a mean of 83 ms, over the 80 ms frame. Behind real time, `keep` dropped the frames whose turn came
over `VOICE_STALE_FRAME_MS_ADAPTATION` (320 ms) after they came, and the jitter buffer drained and started a new run on
each frame that came through late: the talk heard as single frames, behind the speech -- the bits after the release.

**Measured (unit, `test/voiceLate2.test.ts`; the decoder a model, not a browser):** a 2 s talk (25 frames at 12.5 a
second) through `voiceFrame` into playback, the decoder's outputs a task 2 ms after each `decode`, its `flush()`
settling in 100 ms. On the code at 9238e24ab: arrival-to-decoded 100, 120, ... 420 ms, growing by 20 ms a frame (min
100, median 320, max 420), two frames dropped as backlog, the runs restarting; with a decoder whose flush also gives
one more output (so the batch fails every frame and the fallback runs), 5 of 25 frames decoded at all, 500-820 ms after
they came. That is the owner's report in miniature: nothing heard on time, a few late frames.

**The fix (`VOICE_DECODE_PIPELINE_ADAPTATION`, §6).** The decode is pipelined: each packet goes to one running decoder
as its frame arrives; the decoder's outputs are taken in the order they come from its callback (one a packet, the
oldest packet still owed -- the decoder's own timestamps are not trusted, a decoder may count them from its outputs),
each placed in its frame's slot by the packet's own timestamp; a frame goes to playback once each of its packets has
its output. No flush a frame: a flush only at the end of the room's talk (`VoiceCodec.drainDecode`, the client's
`voiceFloor` when another's floor is let go) or to recover a decoder that holds a packet's output past the jitter
window (`VoiceDecodeRecover`, found at a frame's arrival, on the client's clock at `VOICE_JITTER_MS_PLACEHOLDER`: a
decode that slow has missed its slot whatever comes); after a flush, a packet given before it with no output is
silence. A garbled packet still costs only its own 20 ms: a decoder's error (WebCodecs closes it) is the oldest packet
still owed, silence in its slot, and what the decoder still owed goes, in order, to a fresh one; a throw inside
`decode` costs that packet the same way. `keep` stays (`VOICE_STALE_FRAME_MS_ADAPTATION`), asked at the arrival and
again when the frame's outputs are in: a frame gone stale in the decoder is counted `backlog` and not played. Nothing new
without a source: the recover age is the jitter window's placeholder, the frame and packet spans the readings.

**Two behaviours the fix changes or leaves open (the review of VOICE-LATE-2, L1 and L3).**

- **The order matching's known limit (L1, open).** Outputs are matched to packets by order alone. A decoder that drops
  an output silently -- no error, no output for one packet -- shifts every later output one packet early: each frame
  then takes the next frame's first packet's audio into its last slot, and completes one packet late. The recover flush
  does not fire on it (the oldest packet owed waits about one frame, 80 ms, under the jitter window's 160 ms), so the
  shift lasts until the talk's end, where `drainDecode` settles the packet owed and the next talk starts even. It is
  bounded (one 20 ms packet's displacement, for the rest of one talk) and uncounted: no drop counter sees it. It sits
  beside the open question above, whether the three browsers' decoders put out one output a packet without a flush
  (H-next a); a decoder that does is not affected.
- **A stale frame is now decoded, then refused (L3).** VOICE-LATE's `keep` was asked when a frame's turn in the chain
  came, so a frame gone stale behind the others was never given to the decoder. Pipelined, every frame's packets go to
  the decoder on arrival (`keep` is still asked then, but a frame is never stale at its own arrival); a frame whose
  outputs come in more than `VOICE_STALE_FRAME_MS_ADAPTATION` after it arrived is refused at that point, counted
  `backlog` and not played. The decode work is spent on it; what is played, and the count, are as before
  (`test/voiceLate.test.ts` 1c now holds this: 40 packets decoded, 10 frames `backlog`).

**After the fix, the same RED:** arrival-to-decoded 2 ms every frame (min, median and max 2: the model decoder's own
output delay), 25 of 25 frames decoded and played in one run at 80 ms spacing, the first 162 ms after it came (the
jitter window and the decode), no flush during the talk, in both variants. A decoder that held every output until a
flush (none is known; the recover path's test) loses no frame: arrival-to-decoded at most 260 ms (the jitter window's
age, then one flush), a flush every few frames, never a flush a frame.

**The instrument (`VOICE_COUNTERS_ADAPTATION`, §6).** For the owner's next two-account test, the voice client's counters
on screen: `drops()` by why (`stale`, `backlog`, `suspended`, `late`, `ahead`), `heard`, `sent`, and arrival-to-decoded
(min / median / max over the frames decoded in the last `VOICE_LOG_PERIOD_MS`), in a fixed text box at the page's
bottom left, one per mounted voice client -- the game lobby's (the pre-match lobby, the defect's screen) and the
round's -- made at the client's first voice event (a floor entry held, a room frame, a talk press: a page that never
talks, a spec's `/testroom`, never draws it over its frames) and removed at the client's `dispose`
(`voice/voiceCounters.ts`). The same arrival-to-decoded figures go on the dev log's
`voice:` line (`arrivalToDecodedMs`). A development build's only: attached under a literal `import.meta.env.DEV` (a
`vite build` folds it away) and, for the page's panel, `?devmode` in the page's address (`source.ts` `devMode`), as the
page's other dev overlays (`playtestReport.ts`). **The page's playtest log:** the playtest overlay's saved report
(`playtestReport.ts`, `?devmode`, mounted from `main.ts`) is the nearest thing; it reads `/testroom`'s hook, not the game
lobby's voice client, and its tracker's field list is the playtest lane's -- the counters were not written into it (the
brief's "if one exists": the dev log's line and the panel carry them).

**The chop harness after the fix** (`packages/central/test/voiceChopHarness.test.ts`, the real client, codec and room
over fakes; its decoder now puts each packet's output out as a task, `decodeTaskMs` after its decode, on the listener's
page): every case still green; the listener stalled 260 ms a second now schedules 74 of 74 frames, one hole of 250 ms
in two runs; the 2 ms output task under a 60 fps and a 30 fps busy listener, 74 of 74 in one run.

**What holds it:** `packages/viewer/test/voiceLate2.test.ts` (the RED above, the flush-only recover, the codec alone)
and `packages/viewer/test/voiceCounters.test.ts` (the instrument, absent outside DEV under `vi.stubEnv`); the codec's
and the client's tests now model a browser's decoder (outputs as tasks after `decode`; until now the fakes held them
until `flush()`, the shape of the code that flushed every frame), and VOICE-LATE's 1a and 1c assert the pipeline (no
flush; stale frames counted `backlog` at their decode's end). **Not settled here:** the browser's own decoder timing
(the rendered run comes after the desktop window), and whether Chromium's, Firefox's and Safari's decoders put out one
output a packet without a flush, as the model does (H-next a).

*(L3 above is superseded by §3.3: since VOICE-LATE-3 `keep` is asked before the decode only, and a frame the decoder
hands back late is judged by the jitter buffer.)*

### 3.3 Dropped, and nothing heard (VOICE-LATE-3, 2026-10-12)

Written 2026-10-12 for VOICE-LATE-3 (`agent/online-vl3`, from `agent/online` 62df9bb38; sprint 18's row and its brief
`plans/briefs/2026-10-12-s18-voice-late-3.md`), on the owner's two-account test of 2026-10-12 14:25-15:04Z (main
c63ad9230 + `agent/online` 7ddf02994; H137's retest): in the pre-match lobby "the vast majority were dropped and no audio
made it through". No game was run, no browser opened and no server started: the evidence below is unit tests on fakes
(fake timers, loopback sockets). His host's own numbers are the instrument's next reading, not this note's.

**What the test left.** The server's 33 `voice` lines all read bucket 0, skipped 0, rate 0, loop lag 17-99 ms. That line
counted drops only (§3.2 (3)): nothing on the frames received or relayed, and one of the relay's own drops -- a frame
from a page that does not hold its channel's floor entry (`Room.voiceFrame`'s holder test) -- was counted nowhere. The
page's `?devmode` counters (§3.2.1) were on his screens and nothing kept them. His answer (relayed by the merge
controller): the drop that rose on the listener was "backlog, I think, but could have been stale", and he heard nothing.

**(1) The instrument** (playtest instruments with no original; none changes what the room relays or the page plays).

- *The relay's counts.* `Room.voiceCounts()` (`packages/match/src/room.ts`, `VoiceTalkerCounts`): each talker's frames
  by member id, from the room's start -- `received`, and of them `bad` (malformed, no voice seat, or past
  `VOICE_FRAME_BYTES_MAX_PLACEHOLDER`), `bucket`, `floor` (the holder test, now counted), `relayed`; and the sends the
  relayed ones made, `sends` (one a listener reached) and `skipped` (§3.2's lossy skip). VOICE-LATE's `takeVoiceDrops`
  is unchanged.
- *The server's `voice` line* (`server.ts` `voiceLine`, once a second) gains `rooms`: each room whose talkers' frames
  moved since the last line, by its name (a map's room its key, `MP2/classic`; a game's `game/<MAP>/<game id>`, its
  replays' key) and each moved talker's differences; the line is written when a talker's frames moved, not only on a
  drop or a late loop. One line, from `packages/central/test/voiceLate3.test.ts` (two pages seated in `MP2/classic`,
  five frames from the floor's holder):
  `{"level":"info","msg":"voice","bucket":0,"skipped":0,"rate":0,"loopLagMs":14,"stepMsMax":1.309,"rooms":[{"room":"MP2/classic","talkers":[{"id":1,"received":5,"bad":0,"bucket":0,"floor":0,"relayed":5,"sends":5,"skipped":0}]}]}`.
- *The page's counters, posted* (`VOICE_REPORT_ADAPTATION`, §6; `packages/viewer/src/voice/voiceReport.ts`). A voice
  client made in a development build (a literal `import.meta.env.DEV`, which `vite build` folds away with the module's
  page half) on a page with `?devmode` starts a reporter at its first voice event (as the panel) and posts one report
  every `VOICE_REPORT_PERIOD_MS` (5 000 ms) and one at its `dispose`, to `POST /dev/voice-report` on the server its match
  socket names (`MatchVoiceDeps.reportTo`: the game lobby's pinned socket, `gameLobbyHost.ts` `connectGameLobby`, and the
  round's, `matchMount.ts`; `/testroom`'s `main.ts` mount passes none, so posts nothing). The post is a `no-cors` text
  body (no preflight; the answer is not read). Its timer is the page's `setInterval`, not the frame loop: a window the
  browser hides or occludes stops its `requestAnimationFrame`, and the panel and the dev log's line, which run at the
  client's `pad`, stop with it. The body's fixed shape (`parseVoiceReport`): the panel's numbers (`sent`, `heard`, the
  five drops, arrival-to-decoded min / median / max over the report's window) and what the code cannot settle alone --
  the playback context's state, the capture context's rate, the codec's state (`none`, `asking`, `ready`,
  `unsupported`), the headset, the talk flag, the floor's holder, and whether the page was visible and focused. One, as
  the voice client's page posts it (`packages/viewer/test/voiceLate3.test.ts`, three frames heard, the page hidden):
  `{"kind":"s2u-dev-voice-report","id":3,"windowMs":5000,"sent":0,"heard":3,"drops":{"stale":0,"backlog":0,"suspended":0,"late":0,"ahead":0},"arrivalToDecodedMs":{"n":3,"min":2,"median":2,"max":2},"context":"running","captureRate":null,"codec":"ready","headset":true,"talking":false,"holder":7,"visible":false,"focused":false}`.
- *The server's side* (`ServerOptions.voiceReport`, `VOICE_REPORT=1`, off for a match as `COMBAT_REPORT` is). Off, the
  path is a 404. On: a POST of at most `VOICE_REPORT_BODY_MAX_BYTES` (2 048) in the fixed shape, from an
  `allowedOrigins` page when the list is set, naming a member id seated from the request's own address, at most one a
  session per `VOICE_REPORT_MIN_INTERVAL_MS` (1 000), is logged as one `voice report` line -- the room's name, the id,
  the page's report, and the relay's numbers for the same window (each talker's `voiceCounts` differences since that
  session's last report; the room's from its start at the first, `windowMs` null) -- and answered 204; anything else is
  refused (405, 403, 413, 400, 409, 429) and logs nothing. One, from the server test:
  `{"level":"info","msg":"voice report","room":"MP2/classic","id":2,"page":{"id":2,"windowMs":5000,"sent":0,"heard":12,"drops":{"stale":0,"backlog":9,"suspended":0,"late":1,"ahead":0},"arrivalToDecodedMs":{"n":12,"min":40,"median":290,"max":410},"context":"running","captureRate":null,"codec":"ready","headset":true,"talking":false,"holder":1,"visible":false,"focused":false},"server":{"windowMs":null,"talkers":[{"id":1,"received":3,"bad":0,"bucket":0,"floor":0,"relayed":3,"sends":3,"skipped":0}]}}`
  (the page's numbers there are the test's own).
- *Outside the swept sets, and why.* `resultsNegative.test.ts` sweeps the services' routes (the data directory's
  handlers, which read a ticket and touch records); this route is the match server's own, like `/metrics`, mounted only
  under the flag, reads no ticket and writes no record. `deployEnv.test.ts` reads the server's `req.url === '/x'`
  routes for the deploy's public surface; this one is absent from a deploy (the flag unset). *Corrected at the merge (the review's F4):* a Caddy
  deploy proxies every path but `/metrics` (`deploy/Caddyfile:16`), so `VOICE_REPORT=1` on a deployed server would make
  the route public -- the flag is for a LAN playtest only (`deploy/env.example` says so). Its own tests hold every refusal.
- *The release pin* (the owner: the counters "must be turned off for a release"): `packages/viewer/test/build_keyboard.test.ts`
  holds, on the sources, that the voice client makes the panel and the reporter only under the literal gate and names
  their page halves nowhere else, and that the two markers (`s2u-dev-voice-counters`, `s2u-dev-voice-report`) and the
  report's route are written only in those halves; and, on a build of this tree, that neither marker nor the route is in
  `dist/viewer/assets/*.js` (skipped without a build).

**(2) The read: what differs between the rendered run and the owner's host, each candidate with what settles it.**

- *(a) The backlog bound, measured after the decode -- read; fixed.* Since VOICE-LATE-2 the listener's `keep` was asked
  twice: at the frame's arrival (where, the decode pipelined, a frame is never stale -- only one that waited for the
  codec's first ask can be) and again when its outputs came, so `backlog` became "the decoder's outputs came more than
  `VOICE_STALE_FRAME_MS_ADAPTATION` (320 ms) after the frame arrived". That measures the decoder's own output time
  against a bound the rendered run's decoder came within 5 ms of (the plan's Log, 2026-10-12 12:55Z: arrival-to-decoded
  max 315, median 64, p90 142; a model decoder's is 2 ms, so the browser's holds its outputs for a while -- a median near
  one 80 ms frame fits a decoder that puts a packet's output out at its next input, a reading of the numbers, not
  measured). A decoder whose outputs come a little later drops every frame and plays none: the owner's report. **The
  RED** (`voiceLate3.test.ts`, a decoder whose every output comes 330 ms after its `decode`, a 2 s talk at 12.5 frames a
  second): 25 of 25 frames `backlog`, none played. A constant lateness like that is what the jitter buffer absorbs (one
  run, its slots 80 ms apart), and the bound turned it into silence. The original decodes each message on its arrival and
  drops nothing (research 170 §6.1; `FUN_0030f7e0` D:L211393-211441).
- *(b) The background window's clock -- read; nothing to fix on the listener's audio path.* What drives each step of
  the listener's path: the frame's arrival is the socket's `message` event (`net/client.ts` `receive`, :390-398 at
  62df9bb38: straight to the voice listeners, no queue, no timer); the decode, WebCodecs' output callbacks (tasks); the
  recover test and `keep`, `performance.now()` at the frame's arrival; the playback's slots and its `late` / `ahead`
  tests, the context's `currentTime` (the audio clock), and `source.start` on it. On the frame loop (`pad`, the game's
  `requestAnimationFrame`): only the gain's follow of HEADSET VOLUME (`VoicePlayback.frame`; `voice/voiceClient.ts`
  :494 at 62df9bb38, as the lines below), the panel's text (:493) and the dev log's line (:491); on a timer, only the network injector (`?lag=` / `?loss=`, `net/client.ts`
  `delayed`) and now the report. So a hidden or occluded listener still plays *once its voice client is mounted* -- *corrected at the merge (the
  review's F1):* the lobby's voice client is mounted on the front end's frame loop (`gameLobbyHost.ts:330`,
  `GameLobbyVoice.frame` from `frontEnd.ts:512`), and until then a room's voice frame is dropped silently
  (`gameLobbyHost.ts:316`) and no report is posted (a listener mounted, or re-mounted after a reconnect, while its window
  is occluded hears nothing until a frame runs); what stops with its frames is the panel
  -- an occluded window's panel shows its last frame's numbers, which the report does not. The talker's path: the
  worklet's port messages to `block` (:330), the encoder's outputs, the send: no timer or frame, but the talk watchdog
  (:335: a block 1 s after the last `pad` ends the talk), so a talker whose window stops its frames is cut within a
  second. *Settled by:* the report's `visible` / `focused` beside each window's drops and the talker's `sent`.
- *(c) One pad, two windows -- not read here.* Whether the browser gives the pad's state to the unfocused window too is
  the browser's (not read in this tree). If both pages read the press, both send their talk; the floor goes to the
  first, and a frame from the other is dropped at the relay's holder test. *Settled by:* the voice line's `floor` per
  talker and the listener's report's `talking`.
- *(d) The capture path -- read.* AudioWorklet only (`voiceClient.ts` `captureOn`, :357; no ScriptProcessor fallback: a
  browser without it opens no capture, the no-headset state); an 8 000 Hz context asked, the device's rate where the
  browser refuses it, resampled linearly (`VOICE_RESAMPLE_ADAPTATION`). The constraints are the setup page's
  (`gameMicrophone.ts:23`: echo cancellation, noise suppression and automatic gain on;
  `VOICE_CAPTURE_CONSTRAINTS_ADAPTATION`). With two windows on one device, the browser's echo cancellation may take the
  listening window's playback out of the talker's microphone -- the talker does not hear himself back, which is not the
  defect: it drops no frame. *Settled by:* the report's `captureRate` and the talker's `sent` against the line's
  `received`.
- *(e) The shared output -- read (§3.2 (A)).* Each window plays on its own page output; a window never clicked or keyed
  (a pad only) keeps its context suspended, and its frames are counted `suspended`, not `backlog`. *Settled by:* the
  report's `context`.
- *(f) The codec's first ask -- read; not built.* A frame that arrives while the codec is first asked
  (`isVoiceSupported`) waits for it, and is the one `backlog` left after (a): the head of a page's first talk. Asking the
  codec at the floor event instead would win the floor-to-frame lead only. *Settled by:* the report's `codec` and a first
  window's `backlog`.
- *(g) The headset state -- read.* A listener whose headset is off (the setup page's switch, a denied microphone)
  drops every room frame before the decode, counted nowhere (`voiceFrame`'s first test, :426). *Settled by:* the
  report's `headset`.
- *(h) The relay.* Whether the talker's frames reached the server and went on to the listener. *Settled by:* the voice
  line's `received`, `relayed`, `sends`, `skipped` per talker, beside the talker's `sent` and the listener's `heard`.

**The fix ((a); `voice/voiceCodec.ts` `decodeFrame`, `voice/voiceClient.ts` `voiceFrame`).** `keep` is asked before the
decode only -- where VOICE-LATE put the bound, against a queue before the decoder -- and a frame the decoder hands back,
however late, goes to the playback, whose jitter buffer judges it on the audio clock as it judges every frame: past its
slot, `late`; past the window's bound, `ahead` (`VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER`). The recover flush
(`VoiceDecodeRecover`) still bounds a decoder that holds its outputs. **After the fix, the same RED:** 25 of 25 played in
one run 80 ms apart, the first 490 ms after it came (the decoder's 330 and the window's 160), none dropped; a decoder
that keeps up (2 ms) is unchanged. VOICE-LATE's test 1c (ten frames whose outputs a 400 ms stall held) now plays five and
drops five `ahead`, none scheduled past the window's bound (it counted ten `backlog` before). **What it costs:** a frame
decoded late starts its run that late, and a run started on one late frame drops the prompt frames after it as `ahead`
until it has played out -- bounded by the window, where before the late frame was dropped alone. No number changed;
`VOICE_JITTER_MS_PLACEHOLDER` stays a placeholder.

**What holds it:** `packages/central/test/voiceLate3.test.ts` (the counts, the line, the route and its refusals),
`packages/viewer/test/voiceLate3.test.ts` (the RED above; the report's URL, shape, timer and gate),
`packages/viewer/test/voiceLate.test.ts` 1c, `packages/viewer/test/build_keyboard.test.ts` (the release pin) -- unit tests
only. **Not settled here:** the owner's host -- whether its decoder's outputs come later than 320 ms (the report's
arrival-to-decoded), and every candidate above; the proof is his retest with `VOICE_REPORT=1` on the match server and
`?devmode` on both windows (`docs/SETUP.md`, the two-window playtest).

### 3.4 Late by seconds, every frame played (VOICE-LATE-4 row 1, 2026-10-12)

Written 2026-10-12 for VOICE-LATE-4 row 1 (`agent/online-vl4`, from the seat's test 4 commits and the brief merged in at
bf4062b3d; sprint 18's row and its brief `plans/briefs/2026-10-12-s18-voice-late-4.md`). No game was run, no browser
opened and no server started: the evidence below is unit tests on fakes (fake timers, fake decoders, fake navigators and
frame loops, loopback sockets). The measurement is the owner's next run with the instrument, not this note's.

**The evidence (the row's).** *The owner's retest* (2026-10-12 18:18-18:20Z, his two windows, his Chrome, `agent/online`
71fb962ce): nothing dropped (heard 171 = sent 171), but the listener finished about 3.5 frames a second while 12.5
arrived -- arrival-to-decoded median 1.2-6.3 s, its minimum never under about 200 ms, the lag growing across a press --
about 250 ms a frame, serially; its 5 s report timer on time (`windowMs` about 5 000), so the page's timers ran. *This
host* (Chrome 154.0.8037.98; the seat's test 4, `voiceLobbyStall.spec.ts` with `VOICE_HEADED`): headless, headed side by
side, and headed without Playwright's background switches -- the wrapped `AudioDecoder` 0.1-0.2 ms a packet,
arrival-to-decoded 0.3-0.4 ms a frame, the main thread's lag 3-9 ms, no long task; the decoder alone and the page's
`voiceCodec` under a 75 %-busy main thread about 0 ms. **Not reproduced**: his environment differs, and VOICE-LATE-3's
report could not say where (arrival-to-decoded is the whole path).

**(1) The instrument: five readings more in the report** (`VOICE_REPORT_ADAPTATION`, §6: a playtest instrument with no
original, a development build's with `?devmode` only, the server's with `VOICE_REPORT=1`; none changes what the page
plays or the room relays). Each is over the report's window (`VOICE_REPORT_PERIOD_MS`, 5 000 ms):

1. *The user agent* (`agent`): `navigator.userAgent`, and `navigator.userAgentData`'s `brands` and `platform` where the
   browser has them (Chromium's; null elsewhere), read at each report by the reporter (`voiceReport.ts`
   `voiceReportAgent`) -- printable ASCII (another character, a quote or a backslash made `?`), the string at most
   `VOICE_REPORT_AGENT_MAX_CHARS` (512), at most `VOICE_REPORT_BRANDS_MAX` (8) brands of 64 and 32 characters, the
   platform 64. It names the browser, its channel and version, and the platform the owner's two windows ran.
2. *The decoder's own per-packet time* (`decoderMs`, min / median / max / n), timed **inside `voiceCodec`**: each
   packet's last `decode()` call against its output's callback (the owed packet the output is taken for, VOICE-LATE-2's
   in-order rule), on the voice client's clock (`voiceCodec.ts` `VoiceDecodeTimingClock`, `TimedDecode`; the outputs of
   the last `VOICE_DECODE_TIMES_MAX`, 4 096, kept). Beside it the packets the decoder **owes** at the report
   (`decodeOwed`, `owed.length`), the most it owed at one of the window's outputs (`decodeOwedMax`; one more than the
   brief asks: the count at the report alone is 0 between two talks), and the running decoder's `decodeQueueSize` (the
   decode requests WebCodecs has not yet handed to the codec; null where the decoder does not say). The codec keeps
   them only when the voice client hands it the timing clock -- under a literal `import.meta.env.DEV`, and only while
   the page's reporter runs (so `?devmode`) -- and every use of its timing state is under a literal
   `import.meta.env.DEV` of its own.
3. *The main thread's lag* (`lagMs`, min / median / max / n): the reporter's own timer asked every
   `VOICE_REPORT_LAG_TICK_MS` (20 ms), again each time it runs, from the reporter's start to its stop; each run's
   lateness past 20 ms on the client's clock. A hidden page's timers run at most once a second (Chromium's throttling),
   which reads as about 980 ms a tick: the report's `visible` says which.
4. *The drawn frames' spacing* (`frameMs`, median / p90 / max / n): the reporter's own `requestAnimationFrame` loop
   (development only, stopped with it), the intervals between the frames' times -- its own, so it reads the same on
   every page that mounts a voice client, whichever frame loop feeds that client's `pad`. A window the browser does not
   draw (hidden, occluded) has none in the window, and its first frame after says how long it was not drawn.
5. *The window and the two rates*: `view` (`innerWidth`, `innerHeight`, `devicePixelRatio`) at the report, and the
   playback context's `sampleRate` (`playbackRate`, `voicePlayback.ts` `contextRate`) beside the capture's
   (`captureRate`, VOICE-LATE-3's).

The body's fixed shape (`parseVoiceReport`) has the nine fields more -- `playbackRate`, `decoderMs`, `decodeOwed`,
`decodeOwedMax`, `decodeQueueSize`, `lagMs`, `frameMs`, `view`, `agent` -- each null where the page has none, each
bounded and type-checked (the rates above 0 and at most 384 kHz, the times at most an hour, the counts whole, the window's
sides whole and at most 100 000 and its ratio above 0 and at most 64, the agent's strings as above); VOICE-LATE-3's shape
without them is refused. `VOICE_REPORT_BODY_MAX_BYTES` is 4 096 (2 048 until VOICE-LATE-4): the largest body the bounds
allow is about 2 430 bytes (`voiceLate4.test.ts`). The server's `voice report` line carries the page's report whole, so
it carries the new fields with no change to `server.ts`. One report, as the voice client's page posts it
(`packages/viewer/test/voiceLate4.test.ts`, a fake decoder whose every output comes 4 000 ms after its `decode`, a 2 s
talk, the first report at 5 s): `{"kind":"s2u-dev-voice-report","id":3,"windowMs":5000,"sent":0,"heard":13,"drops":{"stale":0,"backlog":0,"suspended":0,"late":0,"ahead":0},"arrivalToDecodedMs":{"n":13,"min":4000,"median":4000,"max":4000},"context":"running","captureRate":null,"codec":"ready","headset":true,"talking":false,"holder":7,"visible":true,"focused":true,"playbackRate":48000,"decoderMs":{"n":52,"min":4000,"median":4000,"max":4000},"decodeOwed":48,"decodeOwedMax":100,"decodeQueueSize":null,"lagMs":{"n":249,"min":0,"median":0,"max":0},"frameMs":null,"view":{"width":960,"height":1040,"dpr":1},"agent":{"ua":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.8037.98 Safari/537.36","brands":[{"brand":"Chromium","version":"154"},{"brand":"Google Chrome","version":"154"},{"brand":"Not.A/Brand","version":"99"}],"platform":"Windows"}}`
-- the 4 s decoder read as 4 s. One line, from the server test (`packages/central/test/voiceLate4.test.ts`; the page's
numbers there are the test's own): `{"level":"info","msg":"voice report","room":"MP2/classic","id":1,"page":{"id":1,"windowMs":5000,"sent":0,"heard":18,"drops":{"stale":0,"backlog":0,"suspended":0,"late":0,"ahead":0},"arrivalToDecodedMs":{"n":18,"min":4000,"median":4010,"max":4020},"context":"running","captureRate":8000,"codec":"ready","headset":true,"talking":false,"holder":1,"visible":true,"focused":true,"playbackRate":48000,"decoderMs":{"n":72,"min":4000,"median":4000,"max":4000},"decodeOwed":28,"decodeOwedMax":100,"decodeQueueSize":0,"lagMs":{"n":250,"min":0,"median":1.2,"max":8.4},"frameMs":{"n":300,"median":16.7,"p90":17.2,"max":33.4},"view":{"width":960,"height":1040,"dpr":1},"agent":{"ua":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.8037.98 Safari/537.36","brands":[{"brand":"Chromium","version":"154"},{"brand":"Google Chrome","version":"154"},{"brand":"Not.A/Brand","version":"99"}],"platform":"Windows"}},"server":{"windowMs":null,"talkers":[]}}`.

*The release pin* (`build_keyboard.test.ts`): on the sources, the voice client hands the codec its timing clock only
under the literal gate, every use of the codec's timing state is under a literal `import.meta.env.DEV`, `TimedDecode`
is written only in `voiceCodec.ts`, and the reporter's new reads (`VOICE_REPORT_LAG_TICK_MS`, `voiceReportAgent`,
`voiceReportView`, `pageFrames`) only in `voiceReport.ts`, whose page half a build drops. No new string marker, so the
built bundle's check is unchanged (skipped without a build, as before).

**(2) How the next report settles "the decoder's media thread or the page after it".** The listener's path, each step
and its clock (§3.3 (b)): the frame's arrival (the socket's `message` event) and the packets' `decode()` calls at once;
the decoder's work (WebCodecs': off the main thread); each output's callback (a task on the main thread); the frame
handed to the playback when its four are in. `decoderMs` is the decoder's work **plus** the wait of its output callback
for the main thread; `lagMs` is that wait alone (a 20 ms timer on the same thread); arrival-to-decoded is the whole.

- *`decoderMs` near arrival-to-decoded, `lagMs` small (tens of ms at most), `decodeOwed` / `decodeOwedMax` climbing
  across a press* (at 3.5 frames out of 12.5 in, about 36 packets a second more owed): **the decoder** -- its media
  thread, or the browser's codec process behind it, puts out about 3.5 frames' outputs a second. A `decodeQueueSize`
  above 0 says the requests wait before the codec takes them. The agent names the browser that does it.
- *`decoderMs` near arrival-to-decoded and `lagMs` of the same size*: **the main thread** -- the outputs are ready and
  their callbacks wait for it; `frameMs` and `view` (a large window at a high pixel ratio) say whether the page's own
  drawing is what holds it, `visible` / `focused` whether it is the browser's throttling of a background window.
- *`decoderMs` small, arrival-to-decoded large*: **the page after the decoder** (or before its `decode()` call) -- the
  time is spent in the voice client's own steps, not WebCodecs'; read next with the dev log's trace.
- *`playbackRate` and `captureRate`*: the two rates the page runs, named, so a capture or playback context at an
  unexpected rate (a resampling path, §2) is seen, not assumed.

**The 8 kHz capture's intent, as read.** The page's capture is opened at 8 000 Hz on purpose: `VOICE_SAMPLE_RATE_READING`
is the original's capture rate (R170.12; `FUN_003102e0` D:L211845-211849, handed to the record format by `FUN_0030fef0`
D:L211691-211694; §1), and the voice client asks its capture `AudioContext` for it first (`voiceClient.ts` `openCapture`),
falling back to the browser's own rate, resampled linearly, only where the browser refuses it
(`VOICE_RESAMPLE_ADAPTATION`, §2). The encoder and the decoder are configured at 8 000 Hz too (§1). The playback context is
not the capture's: it is the page's one shared output (VOICE-LATE's (A), §3.2; `../audio` `pageAudioOutput`, made with no
rate asked, so at the device's -- typically 44 100 or 48 000 Hz), and the playback's buffers are made at 8 000 Hz
(`voicePlayback.ts` `play`'s `createBuffer`), which WebAudio resamples to it. So `captureRate` 8 000 and a `playbackRate`
at the device's rate are both the intent; a `captureRate` of 44 100 or 48 000 is the fallback path, not a fault by itself.

**What holds it:** `packages/viewer/test/voiceLate4.test.ts` (the agent, the decoder's time from a fake decoder `d` ms late
and a 4 s one, the owed count and the queue size, the lag from a fake clock, the frames' spacing, the window and the two
rates, the parser's bounds and the body's size, the 4 s decoder through the voice client and posted),
`packages/central/test/voiceLate4.test.ts` (the line carrying them; a field past its bound refused; a body past 2 048
taken), `packages/viewer/test/voiceLate3.test.ts` (VOICE-LATE-3's read with the new fields), and
`packages/viewer/test/build_keyboard.test.ts` (the release pin) -- unit tests only. **Not settled here:** where the owner's
250 ms a frame goes -- the next run's report says it (row 2). `/testroom` still posts no report (its mount is in the
viewer's `main.ts`, a hot file; §3.3).

### 3.5 The decode in a Worker: a slow rendered frame no longer holds the decoder's outputs (VOICE-LATE-4 row 2, 2026-10-12)

Written 2026-10-12 for VOICE-LATE-4 row 2 (`agent/online-vl4b`, from `agent/online` 9a3eeb51d, row 1 merged; sprint 18's
row VOICE-LATE-4b and its brief `plans/briefs/2026-10-12-s18-voice-late-4b-worker.md`). No game was run, no browser
opened and no server started for this section's code: its evidence is unit tests on fakes (fake timers, fake decoders,
an in-process fake worker, a modelled main thread). The browser numbers below are the Online seat's headless probes,
quoted from the brief, not re-run here.

**The mechanism (the seat's probes, headless, 2026-10-12).** The page's own `voiceCodec`, bundled into a probe page, on
Edge 155.0.4283.45 and Chrome 154.0.8037.98, frames of four real Opus packets fed every 80 ms by a timer. With the page's
`requestAnimationFrame` frame taking **52 ms**, the decoder's outputs reached the page about **one per rendered frame**
while the timers and the arrivals ran on: ~4.5 frames a second finished against 12.5 arriving, arrival-to-decoded growing
to 4.2-4.3 s (its minimum 210 ms with the recover flush on), nothing dropped -- the owner's signature (§3.4: every frame
played, 1.2-6.3 s late, ~3.5 a second, a ~200 ms floor). With a **100 ms** frame: 2-3 a second, growing to 8.9 s. The
same load as a `setInterval` busy-wait did **not** do it (~0 ms): the decoder's output callbacks are held behind the
page's rendered frames, not behind its timers -- which is why §3.4's runs on this host (no long frame) and VOICE-LATE-2's
75 %-busy timer did not reproduce it. **The fix, measured the same way:** the `AudioDecoder` in a dedicated Worker, its
outputs on the worker's own loop, one message back a finished frame -- 76 of 76 frames, latency median 52 ms (one
rendered frame) at 52 ms frames and 100 ms at 100 ms frames, no growth. The probes are the seat's scratchpad
(`decprobe/probe2.mjs`, the page's codec under the rendered load; `probe3.mjs`, the decode on the page against the
decode in a worker), not part of the tree. A rendered frame of 52 ms on the owner's host is not shown by these probes:
his report's `frameMs` (§3.4) is the reading that would.

**The unit model of it** (`packages/viewer/test/voiceDecodeWorker.test.ts`): the page's main thread a task queue run one
task per 52 ms "rendered frame", the decoder's outputs (2 ms after each `decode`) and the worker's replies its tasks, the
arrivals a timer every 80 ms, a 6 s talk (75 frames), the recover flush on. The decode on the page (the fallback's path,
and the code before this row): the first frame 208 ms after it came, the median 5 256 ms, the last 9 992 ms -- four
outputs a frame through one task a rendered frame, a frame every 208 ms against one every 80 ms; nothing dropped, every
frame its own samples. The decode in the worker, the same scheduler: 75 of 75, 4-52 ms, no growth, no decoder on the
page, no recover flush. The model is a model: it shows the code's behaviour under that scheduler, not the browser's.

**The fix** (`VOICE_DECODE_WORKER_ADAPTATION`, §6; `voice/voiceCodec.ts`, `voice/voiceDecodeWorker.ts` (new),
`voice/voiceClient.ts`). The voice client makes a dedicated module worker (`pageDecodeWorker`: `new Worker(new
URL('./voiceDecodeWorker.ts', import.meta.url), { type: 'module' })`, as `worker.ts`, `movieWorker.ts` and
`discCopyWorker.ts` are made) and hands it to the codec; the codec makes none itself, because the worker and the
capture's worklet import `voiceCodec.ts` and Vite refuses a worker that imports the module that makes it ("Circular
worker imports detected", Vite 7.3.6). The worker's entry runs `serveVoiceDecode` on its own scope: the same pipelined
decode as VOICE-LATE-2's (§3.2.1; the class `DecodeOnPage`, now one class for both threads) -- the decoder, the owed
matching (the n-th output is the oldest packet owed), the recover flush on the worker's own clock at the page's
jitter-window age, the talk's-end drain -- with its scope's WebCodecs. The messages (`VoiceDecodeCommand`,
`VoiceDecodeReply`, typed):

| page to worker | worker to page |
|---|---|
| `open {recoverAfterMs}` once, first (the recover age; null: none) | `frame {id, pcm, timing}`: a frame finished, its 640 samples transferred (the worker's copy detached), the instrument's readings since the last reply (null outside a development build) |
| `frame {id, packets, timed}`: one frame's four packets (a lost one null; each copied into its own buffer and the copy transferred), its id (from 1, never reused) | `drained {id, timing}`: the drain of that id done, after every frame it settled |
| `drain {id}`: the talk's end (`drainDecode`); none is posted when no frame is outstanding | `unable`: the worker cannot decode (no `AudioDecoder` or `EncodedAudioChunk` in its scope, `VOICE_DECODER_CONFIG` refused by `isConfigSupported`, or the decoder not made); it answers nothing else |
| `close`: the decoder closed, nothing answered after | |

A frame comes back by its id alone, so a reply out of order or one never sent cannot shift another frame (inside the
worker the order matching of §3.2.1 stays, with its known limit L1). A frame posted before the worker's configuration
check is done waits for it in the worker, in order: no frame waits for a reply before it is posted. The encoder, the
capture, `keep` (asked on the page before the decode, §3.3), the wire, the playback and the jitter window
(`VOICE_JITTER_MS_PLACEHOLDER`) are unchanged; every counter keeps its meaning.

**The fallback.** No `Worker` on the page, a factory that gives none or throws (a page that may not start one), a voice
client given its own `webCodecs` (a test's fakes: they decode on the page, as before) -- the decode is on the page from
the start, exactly as before this row. A worker that answers `unable` or fires `error` (its module failed to load, or
it died) is terminated, and every frame and drain the page asked of it and has not had answered is handed, in order, to
a decode on the page made then; every later frame goes there. No time-out is set for a worker that never answers (none
known; a module that fails to load fires `error`) -- since row 3, one is: `VOICE_DECODE_WORKER_OPEN_MS_PLACEHOLDER`, §3.6.

**Row 1's instrument through the worker.** `decoderMs` is measured in the worker: each packet's last `decode()` call to
its output's callback, on the worker's clock (`performance.now()` there), handed back with the frame that finishes after
it, and counted in the page's report window at that reply's arrival on the page's clock. On the page it was the
decoder's work plus the main thread's wait for its callback; in the worker it is the decoder's work plus the worker's
own loop's wait, so the main thread's share now shows in arrival-to-decoded beside it (each frame's reply waits for the
page's next task). `decodeOwedMax` is the deepest owed count at an output, as before; `decodeOwed` at the read is the
worker's owed count at its last reply plus the packets posted since (an upper bound: some may have their outputs
already; a decoder that answers nothing reads every packet posted since its last answer); `decodeQueueSize` is the
worker's decoder's at its last reply (null before the first). Whether the worker times at all follows the page's timing
clock (`timed` in each frame), and in a release build no reading is made on either side (the literal
`import.meta.env.DEV` gates; `build_keyboard.test.ts`'s pin on `this.timed` holds in `voiceCodec.ts`). Row 1's review F3
(the "last `decode()`" timing unpinned) is pinned here, on the page and in the worker: a decoder that fails on a frame's
first packet at 30 ms, its other three given at 30 ms to a fresh decoder whose outputs come 10 ms later, reads 10, 10,
10 -- not 40.

**Which thread decoded (`decodeOn`; the review's F1).** The report gains one field, a development build's as the rest:
`decodeOn` -- `'worker'` while the voice client's codec posts its frames to the worker, `'page'` after a fallback (`unable`,
the worker's `error`, a factory or a post that throws) or when the codec had no worker from the start, null before the
codec exists (`VoiceCodec.decodeOn`, `voiceClient.ts` `reportRead`, `voiceReport.ts` `VoiceReportRead.decodeOn`, in
`parseVoiceReport`'s exact keys: one of the two words or null, anything else refused). **Read `decoderMs` only with
`decodeOn`:** on `'page'` it is the decoder's work plus the main thread's wait for its callback (§3.4), on `'worker'` the
decoder's work plus the worker's loop's wait -- the same number means different things on the two threads. The worker's
`open` goes through the same guarded post as every other command (the review's F3): a port that throws at once moves the
decode to the page and the codec is kept, where before it nulled the codec.

**What it costs.** The frame's samples wait for the page's next task -- on a page whose rendered frame takes 52 ms, at
most one rendered frame (the model's 52 ms; the probes' median 52 ms); before, they waited one rendered frame per
packet output, serially. A message each way a frame (four packets of about 30 bytes, copied once and moved; 2 560 bytes
of samples moved back). One worker a voice client, made with its codec (the first voice event) and terminated at its
`close`.

**The open half.** The owner confirmed Windows' Efficiency mode (EcoQoS) on his Startup-boost-launched Edge's process
tree (the plan's VOICE-LATE-4 candidates, 2026-10-12). If his cause is a process-wide throttle rather than long rendered
frames, the worker is a thread of the same renderer process and may share it. His next report says which: a small
`decoderMs` with a small arrival-to-decoded -- fixed; a large `decoderMs` (now the worker's decoder's own time) -- the
throttle reaches the decoder itself, which no page code moves (row 3, VOICE-LATE-4c, warns the player); a small
`decoderMs` with a large arrival-to-decoded -- the replies wait on the page's main thread, read with `lagMs` and `frameMs`.
The seat's own `voiceLobbyStall.spec.ts` test 4 (`VOICE_HEADED` only) wraps the page's `window.AudioDecoder`; with the
decode in the worker that wrapper sees no decode, so its counts read empty until the spec is re-pointed (the seat's
spec; not edited here).

**What holds it:** `packages/viewer/test/voiceDecodeWorker.test.ts` (the starved-page model on the page and in the
worker; the 4 s decoder in the worker read as 4 s, through the codec and through the voice client's posted report; the
worker's matching, transfer, identity across a lost output and out of order, recover, drain, close and `keep`; the
instrument and F3 on both threads; the fallback for each of its causes, a port that throws at `open` among them;
`decodeOn` on each thread, through the voice client's read and its posted report, and in the parser; the voice client's
wiring and the Vite rule, on the sources) and `packages/central/test/voiceLate4.test.ts` (the server's line carries
`decodeOn`) -- unit tests only. The voice tests before this row run on the page (they pass WebCodecs fakes); three of
them carry the report's new `decodeOn` key (voiceLate3's read, voiceLate4's largest body, the server's voiceLate4). **Settled since by a rendered run** (the seat's, 2026-10-12, headless Edge 155, test 4 with the listener's drawn frame
made 52 ms): the page decode 28 of 99 then 0, growing to 8.6 s; the worker 99 / 99, 72-90 ms flat -- Vite builds the
worker and the page loads it. **Not settled:** the owner's retest with `?devmode` and `VOICE_REPORT=1`.

### 3.6 A warning on a throttled player's client, and the worker's open time-out (VOICE-LATE-4 row 3, 2026-10-12)

Written 2026-10-12 for VOICE-LATE-4 row 3 (`agent/online-vl4c`, from `agent/online` 8e0cd43cb; sprint 18's row
VOICE-LATE-4c and its brief `plans/briefs/2026-10-12-s18-voice-late-4c-warning.md`). No game was run, no browser opened
and no server started: this section's evidence for its code is unit tests on fakes (fake timers, fake decoders, an
in-process fake worker, a fake game socket). The browser numbers are quoted from §3.4, §3.5 and the plan's Log, not re-run
here. The owner's word (2026-10-12, verbatim): "note that for after and that we must account for it with a warning if we
notice it on a players client with instructions if there is really nothing we can do".

**The chain, and what each link rests on.**

1. *Edge's Startup boost launched the owner's listener* -- his report: `msedge.exe --no-startup-window /prefetch:5` (the
   plan's VOICE-LATE-4 candidates table). The owner's observation, not measured here.
2. *Windows' Efficiency mode (EcoQoS) was on for that process tree* -- the owner: "efficiency mode was on in task
   manager". His observation; how EcoQoS reaches the page's decoder is not measured.
3. *A page held behind its rendered frames gets its decoder's outputs about one per rendered frame* -- measured on this
   host (the Online seat's headless probes, Edge 155 and Chrome 154, §3.5): a 52 ms rendered frame gave ~4.5 frames a
   second finished against 12.5 arriving, growing to 4 s; the same load as a timer did not. That EcoQoS produces such
   frames (or throttles the decoder some other way) is the working account, not a measurement: the owner's row-1 report
   (`decoderMs` with `decodeOn`, `frameMs`, `lagMs`; §3.4, §3.5) is what would show it.

**What was measured** (each quoted from where it was recorded). *The owner's two runs* (his windows, 2026-10-12, §3.4):
nothing dropped, every frame decoded seconds late -- arrival-to-decoded median 1.2-6.3 s across a press (the brief gives
1 200-16 000 ms over both), ~3.5 frames a second finished. *This host's pair* (the seat's rendered run, headless Edge 155,
the listener's drawn frame made 52 ms; the plan's Log, checkpoint 1): the page decode 28 of 99 frames then 0, growing to
8.6 s; the worker 99 of 99, 72-90 ms flat. *This host otherwise* (§3.4): 0.3-0.4 ms a frame headless and headed.

**The detection** (`voice/voiceThrottle.ts` `VoiceThrottleWatch`, `VOICE_THROTTLE_WARNING_ADAPTATION`, §6). The voice
client (`voice/voiceClient.ts` `voiceFrame`) hands the watch each room frame's arrival-to-decoded -- its arrival (the
`voiceFrame` call, on the client's clock) to its samples coming back from the codec, on whichever thread decoded -- for
every frame that comes back decoded (a frame `keep` refuses, a muted speaker's and the page's own are not counted) and
that was asked on a **settled** decode path and came back on the same one (the review's F1, below). The watch keeps the last `VOICE_THROTTLE_FRAMES_PLACEHOLDER` (25) frames in a ring made once, each only as whether its lag
exceeded `VOICE_THROTTLE_LAG_MS_PLACEHOLDER` (500 ms), with their count: the window is odd, so its median exceeds the bound
exactly when more than half of it does (13 of 25) -- one comparison and a few integer writes a frame, no allocation. The
path reads throttled at the first frame at which the full window says so; the watch then counts nothing more. It runs in
**every build** -- a player's feature: it is made outside the development gate, and row 1's report fields
(`VOICE_REPORT_ADAPTATION`, the codec's timing) stay under the literal `import.meta.env.DEV` exactly as they were (the pin
in `build_keyboard.test.ts`, unchanged). The voice client's `VoiceState` gains `throttled` (every build's).

*The path's own start is not a throttle* (the fresh review's F1, medium). `keep` is asked when a frame is handed to the
codec, so the frames a worker holds while its `open` is unanswered pass it; a silent worker's are decoded on the page
3 s later (the open time-out, below), and a first talk of 13 frames or more then filled the window with frames ~3 s
late -- "Efficiency mode" told for a hung worker; a live worker whose first answer took more than ~1.5 s did the same.
The codec now says when its path is settled (`VoiceCodec.decodePath`: 'page', or 'worker' once the worker has answered
its `open` -- `ready`, or any frame or drain after it -- and null before), and the voice client reads it at the frame's
ask and again at its return: a frame asked before the path settled, or asked on the worker and handed back by the page
(re-routed by the time-out, `unable` or `error`), is not counted. Not counting those frames was chosen over resetting the
watch at the move: the re-routed frames come back *after* the move, so a reset there would still take them, and a worker
slow to open never moves at all; the rule "asked on a settled path, back on the same" covers the time-out, every
fallback and the slow open alike, and costs one read a frame. Frames asked after the path settles count as before -- a
throttle that slows the settled path still warns (the test: after a silent worker's time-out, a talk 4 s late on the page
warns once).

**The bounds' reasons.** 500 ms: well above a working path -- the jitter window 160 ms (`VOICE_JITTER_MS_PLACEHOLDER`),
the worker under a 52 ms rendered frame 72-90 ms, this host 0.3-0.4 ms -- and well below the throttled runs (1 200 ms and
up; the page decode under the 52 ms frame 8.6 s); a frame that late has missed its slot by more than four frames. 25
frames: two seconds of talk at the original's 12.5 a second (R170.12); a talk heard late throughout warns at its 25th
counted frame (about 7 s into the owner's, at his ~3.5 a second); one slow frame never warns, nor a stall of a settled
decode under about 1.5 s (it makes at most twelve of the 25 late: 500 ms and twelve 80 ms frames) -- a worker's open, its
time-out and a fallback's re-routed frames are not counted at all (F1, above), so they never warn whatever their length.
Both are stated stand-ins for the owner (§6).

**The warning** (`VOICE_THROTTLE_NOTICE_PLACEHOLDER`, §6; `voice/headset.ts` `throttled`). The voice client asks its
headset's `throttled` once; the headset says the warning's lines once a page, in order (its page record, as the
microphone notice's: a warning said in the game lobby is not said again in the round, nor after a remount). The words,
the page's own and the owner's to settle, upper case in the form of the headset's other lines:

1. `VOICE: HEARD LATE -- WINDOWS EFFICIENCY MODE MAY BE SLOWING THIS BROWSER`
2. `TO FIX: TASK MANAGER, DETAILS, EACH OF THE BROWSER'S ROWS: EFFICIENCY MODE OFF`
3. `EDGE: SETTINGS, SYSTEM AND PERFORMANCE: STARTUP BOOST AND BACKGROUND APPS OFF, RESTART IT`
4. `OR PLAY IN ANOTHER BROWSER`

Line 2's toggle is Task Manager's own Efficiency mode command, which Windows 11 has from 22H2 on; an older Windows has
none (and EcoQoS is Windows 11's). Line 3 (the fresh review's F2, low): Edge's "Continue running background extensions
and apps when Microsoft Edge is closed" (Settings, System and performance; on by default) keeps msedge.exe running after
its windows close, so "quit and restart" with it on restarts nothing -- the line turns it off with Startup boost (the
first wording, `... STARTUP BOOST OFF, THEN QUIT AND RESTART EDGE`, replaced). Neither menu name is checked here on the
owner's Edge or Windows build.

*Where it shows* -- chosen here: the headset's line, the place the page's other voice lines already go. In the game
lobby that is B_CHATLIST (`LOBBY_VOICE_LINE_ADAPTATION`: one line each among the chat's 21, scrolled off by later chat),
not the talker bar's notice (`GameLobbyVoice.notice`, `VOICE_SUSPENDED_MARK_PLACEHOLDER`): the bar is one line in the
talker's place, which four lines of instructions would overrun and which would hide who is talking, and it has no
dismissal; the bar is left to the talker and the suspended mark. In a round the same headset (the taunts part's,
`matchTaunts.ts`) posts each line on the HUD's message window (`Hud.postMessage`: in over 0.36 s, out after 7 s, eight
lines at most), so a round warns too, with no change to a hot file. Shown once; it changes nothing the game or the voice
does (every frame decoded and played as before: the 4 s test hears all 40).

*Two notes from the fresh review, left as they are.* F3: the round's HUD message window does not wrap, and line 3 (89
characters) may run past its width -- as the headset's microphone notice (92) already does; it follows that precedent
until a rendered run of the round's HUD says otherwise. F4: the round's test (`voiceLate4c.test.ts`, "once a page")
hands the taunts part a headset of its own, so it shows the taunts part's `headset` posting the lines on the HUD it is
given, not the part's own default headset (`mountHeadset({ line: hud.postMessage })`, the page's module record) -- that
path is the same function with the page's record, read at the source, not exercised by a test.

**What it cannot see.** A throttle that slows the worker too but keeps the median under 500 ms (a path at 300-400 ms is
late but not warned); a throttle that delays the frames' arrival as much as their decode (the socket's message waits on
the same main thread, so arrival-to-decoded does not grow); a page that hears no voice (nothing to measure). Nor can it
tell Efficiency mode from another cause of the same lateness -- an overloaded machine, a long stall of the decode, a
browser's own throttling of a background window -- which is why line 1 says "may". No browser API names Efficiency mode.

**The worker's open time-out** (row 2's review F2; `VOICE_DECODE_WORKER_OPEN_MS_PLACEHOLDER`, §6; `voice/voiceCodec.ts`).
The worker now answers its `open`: `ready` once its configuration check has passed and its decoder is made, before any
frame reply (`serveVoiceDecode`), or `unable` as before. The page's end (`DecodeInWorker`) sets a time-out at its `open`
and clears it at the worker's first reply of any kind; a worker that has answered nothing within 3 000 ms is terminated
and every frame and drain asked of it goes, in order, to a decode on the page -- the same fallback as `unable` and
`error`, `decodeOn` reading 'page'. A live worker, however slow its decoder (the 4 s decoder in it), answers `ready` within
milliseconds and is kept. 3 000 ms: far past a live worker's first answer (the rendered run's first frames came back
within 72-90 ms of arriving, the worker's load included), short of a third of the room's 10 s talk (W20.R5). The `ready`
costs the page one message: on the starved-page model (§3.5) the first frame waits two rendered frames (104 ms) and the
second 76 ms, the rest one, as before (`voiceDecodeWorker.test.ts`'s bound for the first two frames widened to say so).

**What holds it:** `packages/viewer/test/voiceLate4c.test.ts` -- the watch (4 s late warns once, at the window's fill;
72-90 ms never; one 9 s frame never; twelve of 25 never, thirteen yes; the bound itself is not over it; the window
against a sorted-median reference over 40 drifting runs; no allocation a frame, on the source), through the voice client
in a development and a release build (once, `throttled` set, all 40 frames heard; the next talk adds nothing; 72-90 ms and
a 9 s spike never), the game lobby (the four lines once in B_CHATLIST, the bar's notice null; not again on the next talk,
nor after the chat has pushed them off), the page record (a second headset says nothing; the round's lines through the
taunts part's headset), the words (the instructions present, at most 92 characters, printable ASCII), and the time-out
(a silent worker terminated at 3 000 ms, not at 2 999, its frames decoded on the page in order; a worker that answers kept
with a 4 s decoder; `ready` before the frames, `unable` alone; a close clears it), and F1 (a silent worker with a first
talk of 40 frames warns nothing, a later talk 4 s late on the page warns once; a live worker whose open takes 2 s and a
first talk of 40 frames warns nothing; `decodePath` null before the open's answer, then the thread) -- unit tests only. **Not settled
here:** whether the owner's throttle reaches the worker (his retest), the words and the bounds (the owner's, §6), and how
the four lines draw in the lobby's panel and on the HUD (a rendered run: the disc font's glyphs for the apostrophe, the
comma and the colon in these lines, and the HUD window's width for an 89-character line (F3), are not checked here).

## 4. The talk input

Written 2026-10-08 16:24Z for SVC-22b (`agent/online-svc22b`, from `agent/online` 455b35790), sprint 20 wave 3, from
SVC-22a's module as merged (`packages/viewer/src/voice/talkInput.ts`, 3a187d8fd; its tests `test/talkInput.test.ts`).
Its readings are listed in research 170 §10 (SVC-22a's rows) and research 101 §5; this section adds no constant.

**One state machine (W20.R9).** `TalkInput` owns the round's Chat menu (`tauntMenu.ts`), whose TeamCommand button
follows the preset, and turns the pad's held set into one talk flag a frame, by three routes, each read through the
selected preset (research 170 §4, C5-C8; research 197 §2's table, `VOICE_ROUND_TALK_BUTTON_READING`):
- **route A, TeamCommand held past 0.3 s** (the round; `FUN_002359a0` D:L84196-84303): a tap opens the menu, a hold
  talks; the talk ends at the release or at route A's cap (`VOICE_TALK_CAP_READING`, 10 s from the press) and the
  TeamCommand timer then runs 1.3 s (`VOICE_TALK_LOCKOUT_READING`);
- **route B, SwapWeapon2 with RUN AND TALK ON** (the round; D:L83895-83920): talks while held, its swap suppressed
  (C8); 1.0 s after it;
- **the lobby's CIRCLE** (`dlgGameLobby`'s `VCButton`, research 170 §4.1): press on, release off, inert for a late
  joiner (`VOICE_LATE_JOINER_READING`, C11).
The set flag is cycled as the original's voice object cycles it: cut at 10 s, a 10 s wait that outlasts a release, a
held lobby or route-B talk back at 20 s (`VOICE_PAGE_RECORD_CAP_READING`, `VOICE_PAGE_CUTOFF_WAIT_READING`, C6).

**Its inputs a frame** (`TalkOptions`): the phase, the preset and RUN AND TALK (the page has neither options row,
OQ-6: Default and OFF, W20.R9), the menu's gate and the talk's own (`VOICE_DEAD_TALK_READING`: the taunts part lets the
dead and the spectators talk in a match, §3), the late joiner, and two browser inputs, `padPresent` and `focused`.

**The two releases, wired (SVC-22b).** A browser adaptation with no original (research 197 §2's acceptance: the
console's pad does not vanish and its game has no window): with `padPresent` or `focused` false the talk input releases
the talk that frame, as a release would (its lockout included), closes the menu, and ignores every button seen held
until it is let go -- nothing resumes without a new press (SVC-22a's RED 9). Until this task the taunts part passed
both as `true`; it now passes the headset's (`voice/headset.ts`, §5):
- `padPresent` is false for the one talk-input frame after **the pad the page reads** goes -- the pad
  `PadWatch.poll` (`gamepad.ts`) chooses, as the page's own `PadWatch` chooses it (the first with the standard
  mapping): gone from the poll of `navigator.getGamepads()` (Firefox lists a gone pad with `connected` false and fires
  nothing), replaced by another, or named by a `gamepaddisconnected` on the window. Another pad going ends nothing
  (the review's F5: with two pads, pulling the unused one ended a talk on the other). It is an edge, not a state: a
  page with no pad at all (the DEV keyboard) has lost none, and a pad that comes back is simply read again.
- `focused` is false at the next frame after the window's `blur` or the document hidden (`visibilitychange`), and
  from then until the `focus` and the document shown -- the same sources the page already consumes elsewhere
  (`matchActions.ts`'s `blur` for XR-06's cancel, `controllerSetup.ts`'s `visibilitychange`).
- **Each loss is kept until a frame has reported it** (the review's F1). Both pages run their frames on
  `requestAnimationFrame`, which stops while the tab is hidden, so the blur, the hide, the show and the focus all
  come before the next frame; read as the state at that frame, the focus would never have been lost. Kept as an edge
  (as the pad's), it is reported once at that frame: the talk ends there, and CIRCLE still held is ignored until let
  go, so the return does not re-send `voiceTalk {on: true}` without a new press (the voice client's watchdog has ended
  the talk while hidden, §3).
The voice client's `pad(talk)` (§3) sees `talk` false that frame and sends `voiceTalk {on: false}`. Its own watchdog
(`VOICE_TALK_WATCHDOG_ADAPTATION`, 1 000 ms, §3 and §6) stays for the case where the page stops calling `pad` at all;
it no longer ends a talk on one slow frame (CLOSE-FIX-3, 2026-10-08).

**The DEV key** (constraint 8; OT.R29; H87 VOICE-KEY): V held in the round is CIRCLE in the same held set the pad
fills (`matchTaunts.ts` merges `headset.keys('round')` into it), so it taps the menu and holds the talk exactly as the
pad's CIRCLE does (route A); R in the menus is `headset.keys('lobby')`, for the game lobby's feed (ONL-16b's, research
227) -- the menus' own CIRCLE key (`MENU_KEYS_READING`). §5 has the gate.

Tests: `test/talkInput.test.ts` (SVC-22a: the routes, the lockouts, the cap, the cycle, RED 9 over fakes of the two
inputs) and `test/headset.test.ts` RED 3 (SVC-22b: the releases through their real sources -- a `PadWatch` over a fake
pad list and its event, a window's `blur` / `focus`, a document's `visibilitychange` -- into the taunts part's `pad`)
and RED 5 (the DEV key through the same part) -- unit tests over fakes; no browser was opened.

## 5. The headset UX

Written 2026-10-08 16:24Z for SVC-22b (`agent/online-svc22b`, from `agent/online` 455b35790), sprint 20 wave 3, on the
plan's W20.R9, W20.R14, W20.R15 and constraints 2, 6 and 8, research 170 §6.4 and §10, its corrections C9 and C10,
H87's recorded defaults and OT.R29. The code: `packages/viewer/src/voice/headset.ts` (new: `mountHeadset`),
`voice/modulation.ts` (new: the stage), `voice/voiceClient.ts` (an optional `headset` dep -- the ask, the no-headset press and capture failure, the stage with its talk-start flag -- additive),
`matchTaunts.ts` (makes the headset, feeds the releases and the DEV key to the talk input, exposes `headset`),
`main.ts` and `matchMount.ts` (one argument each: `headset: taunts.headset` on the voice mount), `keyboardTesting.ts`
(the `s2u-kb-voice` site). The tests: `test/headset.test.ts` (new, RED 1-5), `test/keyboardGate.test.ts` (the scan
reads `voice/`; the site listed), `test/build_keyboard.test.ts` (the site's marker absent from a build),
`test/matchTaunts.test.ts` (both pages pass the headset). No game ran, no browser was opened, no server was contacted,
no build was made.

**One headset for both matches (constraint 1, PF).** The taunts part makes it (`mountHeadset`) in both pages, as it
holds the talk input in both, and both pages hand it to the voice client in the same one argument. Its listeners go
with the part's `dispose` (the front end's match's end).

**The notice (`VOICE_MIC_NOTICE_PLACEHOLDER.ask`; research 170 §6.4; H87 VOICE-MIC-NOTICE).** One line of the page's
own, drawn **once a page** -- not again on a later press, nor after the match is disposed and another mounted (the
page's record lives as long as the module) -- immediately before the first `getGameMicrophone()` call: the voice client
asks for the microphone through `headset.microphone(ask)`, which says the line and then asks. Never at load: the voice
client asks only at the first talk press (constraint 6). The browser's own prompt follows; its words are the browser's.
The line is a **stated placeholder**: its wording is the owner's (H87 VOICE-MIC-NOTICE, *default* "a stated placeholder
line"); the stand-in follows the row's recommendation -- what is sent, only while talk is held, only to one's channel,
never stored -- as `VOICE: YOUR MICROPHONE IS SENT ONLY WHILE YOU HOLD TALK, ONLY TO YOUR CHANNEL, NEVER STORED`.

**The no-headset state (R170.11; H87 VOICE-LISTEN-ONLY, default no).** The voice client decides it (§3: the setup
page's switch off, a refusal or a `null` answer, a capture that would not open, a permission already `denied` at the
mount); the headset makes it visible **once a page**, with the notice's second form
(`VOICE_MIC_NOTICE_PLACEHOLDER.noHeadset`, `VOICE: NO HEADSET -- THE MICROPHONE IS OFF OR REFUSED, NO VOICE THIS GAME`,
the owner's wording too): after a `null` answer to the ask, at the same press when the capture will not open (the review's F7), or at a talk press that finds no headset (the switch off:
then `getGameMicrophone()` is never called, so no notice either). Nothing is retried: the voice client asks once a
session (W20.R15) and never on a timer; a later press in the same session neither asks nor says it again. A new
session (a remount) asks again on its first press, without a line. H87 VOICE-LISTEN-ONLY's default ("no, as the
original") is the voice client's: received frames are dropped with no headset; `VOICE_LISTEN_BEFORE_PRESS_ADAPTATION`
(§6) stays routed to H87.

**Where the lines are drawn (constraint 2).** On the HUD's message window (`hud.ts` `Hud.postMessage`: one of its slots, in over 0.36 s, out 7 s later), through the taunts
part's `hud` -- the one line both matches have: `/testroom`'s status line (`ui.setStatus`, `main.ts`) is the page's
chrome outside the game's screen, and the front end's match (`matchMount.ts`) has no status line at all. It is a line
on a line the original draws, not a dialog it does not; the message line's style is its default one (no colour of its
own). Whether the original drew anything with no headset is OQ-12 (a PCSX2 capture).

**The releases' sources** (§4): `PadWatch` (`gamepad.ts`: `gamepaddisconnected` and the poll) for `padPresent`; the
window's `blur` / `focus` and the document's `visibilitychange` for `focused` (`VOICE_RELEASE_ADAPTATION`, §6). A
labelled browser adaptation (no original); the talk input's own behaviour on them is SVC-22a's.

**VOICE MODULATION (C10; `VOICE_MODULATION_PLACEHOLDER`, `VOICE_MOD_LOBBY_OFF_READING`).** What the original does, read:
the START menu's option (`DAT_003df1a8`, the `VoiceMask` valve, .data = 1: **on by default**) is applied at the round's
start for a player who is not a spectator -- `FUN_0030e5a0(voice, DAT_003df1a8 == 0)` only when `FUN_002c2fa0()` is 0,
D:L55851-55854 (`FUN_002c2fa0` is "the local player is a spectator", research 179's resolved row) -- and the game lobby
masks it off, `FUN_0030e5a0(voice, 1)` at D:L125570; the mask sets the character's `VoiceFont` parameters on his own
encoder (`FUN_0030e5a0` D:L210728-210767, through `FUN_00310630`), so a listener hears what the talker sent (research
205 §1.14; the call sites looked at here at those lines). What the numbers do to the sound is inside SASE's setters
and is **not read** (OQ-4).
A third call site sets the mask: the START menu's VOICE MODULATION toggle, `FUN_002041e0` case 4,
`FUN_0030e5a0(voice, DAT_003df1a8 == 0)` at D:L61746 -- with **no spectator test** (looked at here). So "never for a
spectator" is the round start's rule only; a future options row that toggles it mid-round inherits the toggle's rule,
not this one (the page has no such row, OQ-6).
The page's stage (`voice/modulation.ts`): a shifter per talker (`createModulator(font)`), applied by the voice client
to each capture block before the encoder, through `headset.modulate` -- in a round for a player who is not a spectator
(the taunts part's frame: `phase: 'round'` and the gate's `spectator`), the block as it is otherwise (the lobby, a
spectator, and before any frame). The shift: the two-tap delay-line pitch shifter -- the input written into a history
of one window (320 samples, 40 ms), two read taps half a window apart sliding through it at
2^(sign(pitchOffset) x 2 / 12) samples a sample, linearly interpolated, each faded in and out by sin² (the two gains
sum to 1) so the tap whose delay wraps round the window is silent as it wraps: a pitch shift by the font's offset
sign, 2 semitones, the spectral factor unused, the voice delayed by up to 40 ms. **The history and the taps' phase
carry from block to block** (the review's F2): the first build shifted each 80 ms block on its own, which read about
570 of a block's 640 samples at -2 semitones and jumped at every join -- on a steady 200 Hz sine the join was 7.1
times the largest step inside a block (0.991 against 0.139, measured on be25e2eac), a click 12.5 times a second;
carried over, a block's edge is no different from its middle (`test/headset.test.ts` 4d: on a 200 Hz sine no join
exceeds the in-block steps, and the zero crossings move by the ratio within 3 %). The shifter starts from silence at
each talk's first block (the voice client's `fresh`) and when it comes back on, so no tail of an earlier talk is
sent. The font is a stand-in: every talker gets (-25, 80), the first
block research 205 §1.14 lists off the disc, until the 8 blocks are read by character (`character.rdr`'s `VoiceFont`,
176 records; this tree has no reader for it). All of it is the placeholder's, the owner's call (H87, the modulation
approximation: *default* "a labelled pitch shift, off if you say so"). No options row turns it off (OQ-6): it is on.

**The DEV talk keys (constraint 8; OT.R29; H87 VOICE-KEY; `VOICE_TALK_KEY_PLACEHOLDER`).** V (`KeyV`) held in the
round, R (`KeyR`) in the menus, as CIRCLE (§4). Attached only under a literal `import.meta.env.DEV` with the site's
marker (`keyboardSite('s2u-kb-voice')`, `keyboardTesting.ts` `KEYBOARD_SITES`), on the window's capture phase (ahead
of the front end's document listeners, `menuInput.ts`); a modified key (Ctrl, Meta, Alt) is not taken, and every key
is let go on `blur` and when the document is hidden. A `vite build` folds the gate away: `test/keyboardGate.test.ts`
holds the listeners under the gate (its scan now reads `voice/`) and `test/build_keyboard.test.ts` greps a built bundle
for the marker -- that file reads `dist/viewer` and skips without a build; the build is the controller's at the gate,
and none was made here. RED 5 holds that a release build (`DEV` false) attaches no key listener.
One overlap, for the owner: in the round, `spectatorView.ts` already takes V as its toggle (`KeyV: 'toggle'`, X's
alias for Cross; DEV-only), so a spectator's V both toggles the view and talks -- and so does the V of a dead player
whose cycle runs, in a round without respawn or as a ghost (`deadCycleRuns`, `spectatorView.ts`). The overlap is
between two DEV-only keyboard aliases only: on the pad the view's toggle is Cross and the talk is CIRCLE, apart.
Research 170 §4.3 read V as unused in the round's keyboard map (`controlsList.ts`). H87 VOICE-KEY's default is kept;
the overlap is the owner's to weigh (a sentence in H87's row).

**No sound (`VOICE_TALK_SOUND_READING`, C9).** Nothing here plays a sound on a press, a busy floor or a release; RED 3c
holds that the taunts part's audio is not called by a talk's start or release.

**H87's defaults, each named with the row that settles it** (`docs/HUMAN_TASKS.md`, H87):

| H87 call | the default built | where |
|---|---|---|
| VOICE-MIC-NOTICE | a stated placeholder line, three forms (`VOICE_MIC_NOTICE_PLACEHOLDER`; `noCodec` LATER 23's) | `voice/headset.ts`; the HUD's message line |
| VOICE-LISTEN-ONLY | no, as the original: no headset, no voice either way (the voice client, §3); the pre-press listening stays `VOICE_LISTEN_BEFORE_PRESS_ADAPTATION`, routed there | `voice/voiceClient.ts` |
| VOICE-KEY | V held in the round, R in the menus, DEV-only (OT.R29) (`VOICE_TALK_KEY_PLACEHOLDER`) | `voice/headset.ts` |
| the modulation approximation | a labelled pitch shift (a two-tap delay-line shifter, 40 ms window, carried across blocks), 2 semitones by the offset's sign, a stand-in font, on in a round, off in the lobby and for a spectator at the round's start (`VOICE_MODULATION_PLACEHOLDER`) | `voice/modulation.ts` |

**Owed, kept apart from the unit tests.** The rendered check (V-E2E; H-next a): the notice on the HUD's message line
before the browser's prompt in Chromium, Firefox and Safari; the modulation by ear; a pad pulled and a tab switched
while talking; and that a build holds no `s2u-kb-voice` (the gate's build and `build_keyboard.test.ts`).

Confidence: the call sites of VOICE MODULATION (D:L55851-55854, D:L61746, D:L125570, D:L210728-210767) and `FUN_002c2fa0`'s
role are a **reading, pending review** (looked at here in the decompilation; research 205 §1.14 and research 179); the
lines, the keys, the shift and the font are **placeholders**; the releases are browser adaptations; all of it is
unit-tested over fakes.

## 6. Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `VOICE_SAMPLE_RATE_READING` | 8 000 Hz | the original's capture rate, 1 channel 16-bit (R170.12; set at `FUN_003102e0` D:L211845-211849, handed to the record format by `FUN_0030fef0` D:L211691-211694; `voiceCodec.ts`) | a recomp trace of the capture's format | reading, reviewed 2026-10-08 |
| `VOICE_PACKET_MS_READING` | 20 ms | the original's SASE frame, four of 160 samples per 80 ms (R170.12; `FUN_0030f990` D:L211490-211498), taken as the Opus frame duration | the same trace | reading, reviewed 2026-10-08 |
| `VOICE_FRAME_SAMPLES_READING` | 640 samples | the original's 0x500 bytes in before an encode, 80 ms at 8 kHz (R170.12; `FUN_0030f990` D:L211490-211498) | the same trace | reading, reviewed 2026-10-08 |
| `VOICE_BITRATE_OWNER` | 12 000 bit/s (6 000 until 2026-10-09) | the owner's value (OT.R24, 6 000 "to start"; doubled by OT.R44, 2026-10-09), not an unread one; the original ran 3 200 bit/s | the owner's ear (H137) | the owner's value |
| `VOICE_PLAYBACK_GAIN_OWNER` | x 1.5 over HEADSET VOLUME's gain | the owner's choice (OT.R44, 2026-10-09: the match's voice "far too low compared to other audio levels ... bumped up just a bit"), not the original's: the base stays `headset_controller` x 100 clamped to 0..100 (`FUN_0030fef0` D:L211697-211704; W20.R10); one playback for the lobby and the round (`voice/voicePlayback.ts`, §3) | the owner's ear (H137) | the owner's value |
| `VOICE_STALE_FRAME_MS_ADAPTATION` | 320 ms (the jitter window and two 80 ms frames) | no original (the original sent each message as it was read, research 170 §6.1): a frame of the talker's own older than this, by the capture context's clock, when it would be sent is not sent and its `seq` is spent (`voice/voicePlayback.ts`, applied in `voice/voiceClient.ts` `block`, the time handed through `voiceCodec.ts` `VoiceFrameOut.capturedAt`; the reviews of 22cd9c3ba and 7e2c5902f, §3.1). Replaces 7e2c5902f's `VOICE_BURST_KEEP_ADAPTATION` (a cap per codec call, which a backlog handed out over several calls passed). **Its costs:** the discarded audio, the stall's speech older than 320 ms (4 frames for one 500 ms stall), heard as the stall's hole, and a hole a stall over about 240 ms (300 ms every second: 6 holes, 9 frames); in exchange none of the newest speech dropped (8 frames without it) and the listener at most 480 ms behind after a stall (560 sent whole) | with `VOICE_JITTER_MS_PLACEHOLDER`: the owner's ear (H137), and the browser window's stall measurement (§3.1) | adaptation |
| `VOICE_PACKET_GROUPING_ADAPTATION` | `'continuous-fifo'`: one encoder fed across a talk, its packets queued and handed out four a frame -- every complete four at each block (VOICE-2, 2026-10-09: a stall's backlog worked off, §3.1) -- a partial four kept; one flush at the talk's end, its tail dropped | no original: the original encoded each 80 ms read as four SASE frames of one continuous stream (`FUN_0030f990` D:L211490-211498, research 170 §6.1); the wire keeps four a frame (`VOICE_PACKETS_PER_FRAME_READING`, W20.R2). The page's adaptation to Chromium 153's packetisation (five packets for one flushed frame, observed 2026-10-08, §1; `voiceCodec.ts`, CLOSE-FIX-2) | none needed for Chromium (observed); Firefox's and Safari's packetisation and the latency by ear (H-next a) | adaptation |
| `VOICE_RESAMPLE_ADAPTATION` | linear interpolation to 8 kHz | the console headset's native 8 kHz (no original: a browser adaptation, §2) | the three-browser check of an 8 000 Hz capture context (H-next a) | adaptation |
| `VOICE_JITTER_MS_PLACEHOLDER` | 160 ms (two 80 ms frames) | ours, no original: the original decoded each message straight into the headset (research 170 §6.1); the playback's delay before a run's first frame, its slots 80 ms per `seq` (`voice/voicePlayback.ts`, §3) | the owner's ear on real headsets over the relay, with TCP's head-of-line jitter judged (H-next a; W20.R1) | placeholder |
| `VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER` | 4 frames (320 ms) past the jitter window | ours, no original (the original had no buffer, research 170 §6.1): the farthest past the window a frame's slot may fall; a frame whose `seq` puts it further is dropped, never scheduled -- a floor holder's jumping `seq` (a u16 delta up to 32 767 frames, ~43 minutes) schedules nothing ahead (`voice/voicePlayback.ts` `VoiceJitter.place`; the close review's F5, 2026-10-08) | with `VOICE_JITTER_MS_PLACEHOLDER`: the owner's ear over the relay (H-next a), and a slow listener's burst after a stall observed in V-E2E's browser window | placeholder |
| `VOICE_SUSPENDED_MARK_PLACEHOLDER` | `'VOICE PAUSED'`, in the speaker's place: the round's voice element's name line and the lobby's bar | no original (the console's headset had no audio context to lose; its voice HUD shows nothing of it): the page's word that its audio context, which ran, was found suspended at a voice frame -- a device change, a discarded tab -- so the frame is not played and the page says so rather than drop it silently (VOICE-LATE, §3.2; `hudVoice.ts`, shown through `voiceClient.ts` `VoiceState.suspended` and `gameLobbyHost.ts` `GameLobbyVoice.notice`). Not the launcher's audio gesture step for a page never activated, which is the disc-access lane's and its own words | the owner's wording and form (a muted headset mark or the Legend's line) | placeholder |
| `heardTalker` | the talker named: the voice the page is playing now, else the floor entry's holder, never the page itself | no original rule for it: the original named the floor's holder frame by frame (`FUN_00238ac0` D:L85678-85696, `FUN_00239250` D:L85850-85852 through `FUN_0030e790` D:L210828-210840; the lobby's bar, research 170 §5.1), and its holder was the voice heard (`FUN_0030f7e0` decoded on arrival, D:L211405-211441). Two departures, both only while a talk's tail plays behind the jitter window: the old talker's name stays up after the floor is released, until his voice has played; and a new holder's name waits until that tail has played (`hudVoice.ts`, the HUD's line, busy icon and compass mark; `gameLobbyHost.ts` `GameLobbyVoice.holder`, the lobby's bar; VOICE-LATE, §3.2) | the owner's ear in a playtest of two talkers in turn (H-next a); none needed where the jitter window is empty | adaptation |
| `VOICE_PLAYING_GAP_MS_ADAPTATION` | 80 ms (one frame: 640 samples at 8 kHz, R170.12) | no original (the original named the floor's holder, which a lost message did not change): the widest hole between one speaker's scheduled frames that `VoicePlayback.playing` still counts as one run, so one lost `seq` does not flicker the name, the compass mark and the lobby's bar off (`voice/voicePlayback.ts`; VOICE-LATE's fix round, §3.2); two lost frames in a row still end the run | with `VOICE_LOSS_PLACEHOLDER`: a playtest over a lossy link (H-next a) | adaptation |
| `VOICE_CAPTURE_CONSTRAINTS_ADAPTATION` | the setup page's constraints (echo cancellation, noise suppression, automatic gain on) | research 170 §6.4's "noise suppression off" for the original's headset path; W20.R14 keeps the setup page's (`gameMicrophone.ts:16`) -- named in `voice/voiceClient.ts`'s doc, no constant | the owner's ear (H-next a); W20.R14 stands until he says otherwise | adaptation (not applied) |
| `VOICE_LISTEN_BEFORE_PRESS_ADAPTATION` | the room's voice played before the first talk press when the setup page's switch is on and the microphone permission is not already denied | the original's headset, known at load: no headset, no voice either way (R170.11); the page cannot know without opening the microphone, which it does only at the first press (constraint 6) -- named in `voice/voiceClient.ts`'s doc, no constant | the owner's call: H87 VOICE-LISTEN-ONLY, whose default is "no, as the original" (routed there, 2026-10-08) | adaptation (routed to H87) |
| `VOICE_TALK_WATCHDOG_ADAPTATION` | 1 000 ms (100 ms until CLOSE-FIX-3, 2026-10-08) | no original: the console polled its pad every frame; the page's frames stop in a hidden tab while the capture runs on, so a block with no `pad` call in this time ends the talk (`voice/voiceClient.ts`, §3). One second because at 100 ms a frame of the talker's page that hitched under load (three scenes on a software renderer, the browser window's run of 2026-10-08) ended a talk still held, and the diagnostic at 1 000 ms passed (§3; `plans/briefs/2026-10-08-s20-close-fix-3.md`); a hidden tab's talk still ends within a second, inside the server's 10 s cap (W20.R5) | none needed (a browser safeguard); a rendered check that a hidden tab lets the floor go (V-E2E) | adaptation |
| `VOICE_MIC_NOTICE_PLACEHOLDER` | three stated stand-in lines: `ask` (before the browser's prompt), `noHeadset` (the no-headset state) and `noCodec` (a browser without WebCodecs Opus, H140; LATER 23), §5 | the page's words around the microphone (no original: the console asked no permission); research 170 §10's row | the owner's wording (H87 VOICE-MIC-NOTICE) | placeholder, in code (`voice/headset.ts`) |
| `VOICE_TALK_KEY_PLACEHOLDER` | `KeyV` in the round, `KeyR` in the menus, as CIRCLE, DEV-only | the page's keyboard talk key (no original: the console has no keyboard; OT.R29); research 170 §10's row | the owner's call (H87 VOICE-KEY) | placeholder, in code (`voice/headset.ts`) |
| `VOICE_MODULATION_PLACEHOLDER` | a pitch shift of 2 semitones by the sign of the font's pitch offset (a two-tap delay-line shifter, a 320-sample window, its state carried across blocks), the spectral factor unused; the font (-25, 80) for every talker | what VOICE MODULATION's `VoiceFont` does to the sound (`FUN_0030e5a0` D:L210728-210767, unread inside SASE) and the talker's character's own font (8 blocks on the disc, research 205 §1.14); research 170 §10's row | the SASE setters' units (`EncSC.c`) or a recorded sample; the 8 blocks read by character through a reader of `character.rdr`; the owner's ear (H87; H-next a) | placeholder, in code (`voice/modulation.ts`) |
| `VOICE_MOD_LOBBY_OFF_READING` | the stage bypassed outside a round and for a spectator | the lobby's mask off (`FUN_0030e5a0(voice, 1)`, D:L125570) and the round start's spectator test (D:L55851-55854); the third call site, the START menu's toggle (`FUN_002041e0` D:L61746), has no spectator test -- so "never for a spectator" holds for the round start only, and a future options row inherits the toggle's rule; research 170 §10's row | a run (none needed beyond it) | reading, named in `voice/modulation.ts` and `voice/headset.ts` |
| `VOICE_TALK_SOUND_READING` | none | a sound on a press, a busy floor or a release (C9); research 170 §10's row | a capture with audio | reading, named in `voice/headset.ts` (the module adds none) |
| `VOICE_RELEASE_ADAPTATION` | the pad's loss (one frame) and the window's focus lost (until back) release the talk | no original (research 197 §2's acceptance): the console's pad does not vanish; named in `voice/headset.ts`'s doc, no constant | none needed (a browser safeguard); a rendered check that a pulled pad and a switched tab end the talk (V-E2E) | adaptation |
| `VOICE_DECODE_PIPELINE_ADAPTATION` | `'decode-on-arrival'`: each packet to one running decoder on its frame's arrival, the outputs taken in order from the decoder's callback (the oldest packet still owed), placed by the packet's own timestamp, a frame to playback once its packets' outputs are in; a flush only at the end of the room's talk (`drainDecode`) or to recover a decoder holding an output past `VOICE_JITTER_MS_PLACEHOLDER` (`VoiceDecodeRecover`); a decoder's error costs the oldest packet owed, the rest to a fresh decoder | no original for the WebCodecs shape: the original decoded each message at once on its arrival (`FUN_0030f7e0` D:L211393-211441, research 170 §6.1), which this restores (`voice/voiceCodec.ts`; VOICE-LATE-2, §3.2.1). Replaces VOICE-LATE's one batch and one flush a frame, serialised, measured below real time on a slow flush (§3.2.1) | a rendered run of the owner's two-account test with the counters on screen; the three browsers' decoders putting out one output a packet without a flush (H-next a) | adaptation |
| `VOICE_DECODE_WORKER_ADAPTATION` | `'dedicated-worker'`: the listener's decode -- the decoder, its owed matching, the recover flush on the worker's clock, the talk's-end drain (`VOICE_DECODE_PIPELINE_ADAPTATION`) -- in a dedicated module worker (`voice/voiceDecodeWorker.ts`, made by `voice/voiceClient.ts` `pageDecodeWorker`; `voice/voiceCodec.ts` `serveVoiceDecode`, `DecodeInWorker`), one reply a finished frame by its id with its 640 samples transferred and row 1's readings with it; the encoder on the page; the decode on the page where the page has no `Worker`, a test passes its own WebCodecs, or the worker answers `unable` or fails (the frames not yet answered handed to it in order), or (since VOICE-LATE-4 row 3, §3.6) answers nothing within `VOICE_DECODE_WORKER_OPEN_MS_PLACEHOLDER` of its `open`, which a live worker answers `ready` | no original: the console decoded each message as it arrived, in the network library's receive callback (`FUN_0030f7e0` D:L211393-211441, research 170 §6.1; which thread ran it is not read); the adaptation is to the browser, which runs a page's decoder outputs as main-thread tasks that a 52 ms rendered frame held to about one per frame (the Online seat's headless probes, Edge 155 and Chrome 154, §3.5); nothing played changes (VOICE-LATE-4 row 2, §3.5; held by `test/voiceDecodeWorker.test.ts`) | the seat's rendered probe of this code, and the owner's retest with `?devmode` (the report's `decoderMs` beside arrival-to-decoded): whether the worker escapes his Edge's Efficiency mode (EcoQoS) or shares it | adaptation |
| `VOICE_DECODE_WORKER_OPEN_MS_PLACEHOLDER` | 3 000 ms from the page's `open` to the worker's first reply (`ready`, `unable` or any other) | no original (the console had no worker): how long the page waits for a decode worker that loaded to answer before it terminates it and decodes on the page, as `unable` and `error` do (`voice/voiceCodec.ts` `DecodeInWorker`; the worker's `ready` from `serveVoiceDecode`; row 2's review F2, VOICE-LATE-4 row 3, §3.6). Far past a live worker's first answer (the rendered run's first frames back within 72-90 ms, its load included, §3.5), short of a third of the room's 10 s talk (W20.R5) | a rendered measurement of a worker's open on the slowest browser and link a player uses (H-next a); none needed while no worker is seen to hang | placeholder |
| `VOICE_THROTTLE_WARNING_ADAPTATION` | each room frame's arrival-to-decoded (its `voiceFrame` arrival to its samples back from the codec, the client's clock) in a fixed window of the last `VOICE_THROTTLE_FRAMES_PLACEHOLDER` decoded frames; throttled when the window's median exceeds `VOICE_THROTTLE_LAG_MS_PLACEHOLDER`, the headset's warning then asked once and said once a page (the lobby's B_CHATLIST, the round's HUD message window); in every build | no original (the console decoded each message on arrival, `FUN_0030f7e0` D:L211393-211441, research 170 §6.1, on a machine nothing throttled, and said nothing of it): a browser adaptation for the owner's word of 2026-10-12, a player's warning with the instructions for the one cause measured (Windows' Efficiency mode on his Startup-boost-launched Edge, §3.4-§3.6); it changes nothing played (`voice/voiceThrottle.ts` `VoiceThrottleWatch`, `voice/voiceClient.ts`, `voice/headset.ts` `throttled`; held by `test/voiceLate4c.test.ts`). It cannot see a throttle under the bound, or one that delays the arrival as much as the decode, nor tell Efficiency mode from another cause (§3.6) | the owner's retest under Efficiency mode (the warning shown, and gone with the mode off); none needed for its form beyond his word on the words | adaptation |
| `VOICE_THROTTLE_LAG_MS_PLACEHOLDER` | 500 ms, the median arrival-to-decoded over the window | ours, no original: well above a working path (the jitter window 160 ms, `VOICE_JITTER_MS_PLACEHOLDER`; the worker under a 52 ms rendered frame 72-90 ms; this host 0.3-0.4 ms) and well below the throttled runs (the owner's 1 200 ms and up; the page decode under the 52 ms frame 8.6 s), §3.6 (`voice/voiceThrottle.ts`) | the owner's call (the warning's sensitivity), with his retest's arrival-to-decoded under and out of Efficiency mode | placeholder |
| `VOICE_THROTTLE_FRAMES_PLACEHOLDER` | 25 decoded frames (2 s of talk at 12.5 a second, R170.12), odd so the median is one frame's | ours, no original: the window the median is taken over -- a talk late throughout warns at its 25th counted frame; one slow frame, or a stall of a settled decode under about 1.5 s (at most twelve of 25 late), never; frames asked before the decode path settled or re-routed by a fallback are not counted (the review's F1, `VoiceCodec.decodePath`; §3.6; `voice/voiceThrottle.ts`, `voice/voiceClient.ts`) | the owner's call, with the same retest | placeholder |
| `VOICE_THROTTLE_NOTICE_PLACEHOLDER` | four lines: `VOICE: HEARD LATE -- WINDOWS EFFICIENCY MODE MAY BE SLOWING THIS BROWSER`; `TO FIX: TASK MANAGER, DETAILS, EACH OF THE BROWSER'S ROWS: EFFICIENCY MODE OFF`; `EDGE: SETTINGS, SYSTEM AND PERFORMANCE: STARTUP BOOST AND BACKGROUND APPS OFF, RESTART IT`; `OR PLAY IN ANOTHER BROWSER` | the page's words for the throttle warning (no original: the console had no such line), in the form of `VOICE_MIC_NOTICE_PLACEHOLDER`'s (line 3 since the review's F2: Edge's background apps off too, so the restart is one; line 2's toggle Windows 11 22H2's and later's); one line each of the lobby's B_CHATLIST and of the round's HUD message window (§3.6; `voice/voiceThrottle.ts`, said by `voice/headset.ts`) | the owner's wording (a HUMAN_TASKS row, the seat's); a rendered run of the lines in the lobby's panel and on the HUD (the disc font's glyphs, the window's width) | placeholder |
| `VOICE_COUNTERS_ADAPTATION` | the voice client's counters on screen -- `drops()` by why (stale, backlog, suspended, late, ahead), `heard`, `sent`, arrival-to-decoded min / median / max (ms) over the frames decoded in the last `VOICE_LOG_PERIOD_MS` -- in a fixed text box at the page's bottom left, one per mounted voice client (the game lobby's, the round's), made at its first voice event, and the same arrival-to-decoded figures on the dev log's `voice:` line | no original (the console's voice had no buffer to drop from and showed no counter, research 170 §6.1): a browser adaptation, a playtest instrument for the owner's two-account test (VOICE-LATE-2, §3.2), a read of the client's state that changes nothing the game does; attached only under a literal `import.meta.env.DEV` (folded away by `vite build`, OT.R29's shape) and, for the page's panel, `?devmode` (`voice/voiceCounters.ts`, `voice/voiceClient.ts` `countersPanel`; held by `test/voiceCounters.test.ts`) | none needed (an instrument); its own removal once the owner's voice test passes is his call | adaptation |
| `VOICE_REPORT_ADAPTATION` | the voice client's counters posted to the match server -- the panel's numbers, the playback context's state, the capture's rate, the codec's state, the headset, the talk flag, the floor's holder, the page's visibility and focus, and since VOICE-LATE-4 row 1 (§3.4) the user agent, the decoder's own per-packet time and the packets it owes, the main thread's lag (a `VOICE_REPORT_LAG_TICK_MS` timer's lateness), the drawn frames' spacing, the window and the playback context's rate, and since VOICE-LATE-4 row 2 (§3.5) where the decode ran (`decodeOn`), in `parseVoiceReport`'s fixed shape -- every `VOICE_REPORT_PERIOD_MS` (5 000 ms) on the page's timer and at the client's `dispose`, to `POST /dev/voice-report` on the server its match socket names; the server (`VOICE_REPORT=1`) logs each as a `voice report` line with the session's room and the relay's `voiceCounts` for the same window, at most `VOICE_REPORT_BODY_MAX_BYTES` (4 096; 2 048 until VOICE-LATE-4) and one a session per `VOICE_REPORT_MIN_INTERVAL_MS` (1 000), refusing anything else | no original (the console had no counter to keep, research 170 §6.1): a browser adaptation, a playtest instrument for the owner's voice test (VOICE-LATE-3, §3.3), a read that changes nothing the game does; attached only under a literal `import.meta.env.DEV` and `?devmode` (`voice/voiceReport.ts`, `voice/voiceClient.ts` `report`), the server's only with its flag (`server.ts` `ServerOptions.voiceReport`); the decoder's timing kept inside the codec only under a literal `import.meta.env.DEV` (`voice/voiceCodec.ts` `VoiceDecodeTimingClock`); its bounds are the instrument's own, no game value; held by `test/voiceLate3.test.ts` and `test/voiceLate4.test.ts` (viewer and server) and `test/build_keyboard.test.ts` | none needed (an instrument); its removal once the owner's voice test passes is his call | adaptation |
| `VOICE_LOSS_PLACEHOLDER` | silence, 160 samples a packet | what the original played for a voice frame that never came (unread: SASE's decoder and the DME library's gap handling) | a read of the playback path, `FUN_0030f7e0` D:L211393-211449, for a missing frame, or a two-instance run with a frame dropped | placeholder (the page's policy, named in `decodeFrame`'s comment; no constant holds a value) |
