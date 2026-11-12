# 137 -- Movie audio and A/V sync: the track's layout, the original's audio path, the sync rule and the page (PLAT-20)

Written 2026-10-02 for task PLAT-20 (the block is `../roadmap/01-platform.md` "PLAT-20"), on the opener's road (the
owner, 2026-10-02: "proceed agentically through creating the entire game opener zipper text -> trailer -> menu").
Sources: the retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:Lnnn` = its line);
for `FUN_0030a3b0`'s arguments, which the decompiler lost, the instructions of the recomp's generated listing of the
same ELF (`recomp/output/sub_0030A3B0_0x30a3b0.cpp`, the disassembly comments; read, nothing copied); the disc's movies
(`SOCOM_DISC`, `SOCOM_ISO`) read through `@s2u/archive` and PLAT-18's demuxer (research 109); PC research 32 §7, §7.1
(`docs/research/32-audio-path.md`) and the PC project's movie-audio level row (`docs/HAZARDS.md`); web research 121 (the
player). Names, addresses, sizes, counts and hashes of decoded samples only: no decompiled text, no disc bytes.

The code: `packages/sound/src/moviePcm.ts` (the track's decode, R3: the sound goes through the sound package),
`packages/fmv/src/movieAudio.ts` (the original's audio path transcribed, and the sync rule),
`packages/viewer/src/movieSound.ts` (the page: the track read and scheduled on an output), connected in
`packages/viewer/src/movieRealtime.ts` (the `sound` option). Tests: `packages/sound/test/moviePcm.test.ts`,
`packages/fmv/test/movieAudio.test.ts`, `packages/viewer/test/movieSound.test.ts`,
`packages/viewer/test/movieRealtime.test.ts` (CI) and `tools/test/movieAudioDisc.test.ts` (dev disc).

Every finding here is at the **reading** level (transcribed from the decompilation or read off the disc's data through
the repository's readers), **pending review**. The proven level is PLAT-36's (a `PS2X_AUDIO_DUMP` and audio trace)
and the acceptance's cross-correlation of the page's output, both owed (§7).

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R137.1 | **The trailer's sound decoded whole**: INTRO_2's track is 5,979,392 frames a channel at 48000 Hz (124.571 s), every byte in whole 1 KB groups; the SHA-256 of its left channel's samples is `7fc02dfd...7d580cef` and of its right's `aa767a20...0fa0b6213` (the full values in the dev-disc test). SONY448 528,640 frames, MENULOOP 5,951,744 | the acceptance's decode-and-compare is pinned on the dev disc, read from the image as the page reads it | §2 |
| R137.2 | **The two channels are laid out in blocks of 0x200 bytes, channel 0's then channel 1's** -- not sample-interleaved. At a block's edge the step between two words is 1.8x (SONY448), 7.9x (INTRO_2) and 8.6x (MENULOOP) the step inside a block, and each channel decoded as blocks is 1.7-1.9x smoother than decoded as alternate samples; the same holds on all 69 PSS files | settles research 109's open unknown; contradicts PC research 32 §7's "sample-interleaved" (§6) | §2 |
| R137.3 | **The sound starts on the tick that presents picture 0.** The create's priming (`FUN_0030b4d0`) demuxes until a callback refuses a packet; on 68 of the 69 movies, the three opener movies among them, the 48 KB staging ring refuses first, holding 48,765-48,822 PCM bytes -- more than the 24 KB ring, which the first picture's move (`FUN_0030b1d0` D:L208747) fills whole and starts (D:L208748-208751) | `MovieSound.picture(0)` starts the sound; one campaign movie (`M51/M51IG07.PSS`) starts later (§7) | §3 |
| R137.4 | **The pictures do not pace the sound, nor the sound the pictures**: once started, the ring plays at 48000 Hz from the SPU's clock; each presented picture refills it (whole kilobytes, 1 KB clear of the play position); nothing compares the two with a PTS (research 121 §9). At the movie's end the NODATA tick stops it (D:L208752-208760); after the track's last moved byte and before that stop the ring replays its last 24 KB | the page's rule: frame = (time since picture 0) x 48000, the ring's last 6144 frames looped after the track | §4 |
| R137.5 | **On the opener's three movies, where the track and the pictures end**: SONY448's pictures end first (the stop at 10.344 s cuts the last 0.67 s of an 11.013 s track); INTRO_2's track ends 3.42 s before its pictures (127.995 s) and the ring's tail, near silence (RMS under 4 of 32768, about -78 dBFS), loops until the stop; MENULOOP's ends 0.53 s before (its tail is digital silence) | nothing audible is invented or lost against the original on the three | §4 |
| R137.6 | **Before the first gesture** a browser runs no audio: the page plays the pictures without sound and the sound joins at the frame it would be on (`MOVIE_SOUND_GESTURE_ADAPTATION`, a labelled browser adaptation), the time since picture 0 taken from the page's clock, as a suspended `AudioContext`'s clock stands still; the sound is placed by the output time *heard* at picture 0, its output latency included (`MOVIE_SOUND_LATENCY_ADAPTATION`) | the owner's ear and the choice: HUMAN_TASKS H74 | §5 |

## 1. What the block asks, and what is here

The block's goal is the movie's PCM played in sync with its pictures at the original's level. Built: the decode (the
sound package), the original's audio path as a byte-count model with its start rule and the priming, the sync rule, and
the page's player (schedule from picture 0, the gesture join, the ring's tail, the stop, the underrun count) with the
reader that feeds it. The front end has used the movie player since MOVIE-WIRE (§5).
The 0x366 volume mapping and live Dialog control are now read and connected (§9).
A PS2 ADPCM path is not built (no disc track is ADPCM, research 109 R109.4).

## 2. The track (`moviePcm.ts`)

The track behind the 40-byte `SShd`/`SSbd` header (research 109 §2) is 16-bit little-endian PCM, 48000 Hz, two
channels, interleave 0x200 on all 69. The game copies it verbatim: the audio callback `FUN_0030aca0` (D:L208513-208551)
`memcpy`s each payload past its 4-byte substream header into the staging ring, and the move (`FUN_0030a3b0` through
`FUN_00309f60`, D:L207980-208130) DMAs the staging ring's bytes to the sound ring unchanged. So the ring holds the disc's
layout, and the disc decides it.

**The layout, measured** (`tools/test/movieAudioDisc.test.ts`, the layout meter; a scratch scan first, 2026-10-02): for
each whole 1024-byte group of the track, the mean absolute step between consecutive 16-bit words at word 255 -> 256 (a
block's edge) against the other 510 steps, and each hypothesis's per-channel smoothness (the mean absolute first
difference of each channel as decoded):

| track | edge step | inner step | ratio | smoothness, as alternate samples | as blocks | ratio |
|---|---|---|---|---|---|---|
| SONY448 | 131.1 | 73.8 | 1.78 | 128.6 | 73.8 | 1.74 |
| INTRO_2 | 3226.8 | 411.1 | 7.85 | 763.0 | 411.1 | 1.86 |
| MENULOOP | 4263.7 | 495.3 | 8.61 | 935.8 | 495.4 | 1.89 |

A channel change at every block's edge and smoother channels as blocks: the layout is **blocks of 0x200 bytes a
channel, channel 0 then channel 1** (`MOVIE_PCM_LAYOUT_READING`). Under `PSS_ALL=1` the same two inequalities hold on all
69 files. Which channel is the left is not read (the header names none); channel 0 is played as the left.

**The decode**: `MoviePcmDecoder` takes the PCM bytes packet by packet (odd lengths: the payloads are 4073, 4059 or
4044 bytes, research 109 §1) and gives the frames of each whole group; a last group under 1 KB would be dropped, as the
move never moves it (§3) -- none of the 69 tracks has one. **The digests** (R137.1; each channel's samples as 16-bit
little-endian, in order, SHA-256):

| track | frames | seconds | left | right |
|---|---|---|---|---|
| SONY448 | 528,640 | 11.013 | `49450eaf577270d13b1861022bb086e43d2c38c7338f81df7d6081582f971c71` | `689b915e3c6d01252df547c59d893a6ab8acb5b9253ec66cb5c01660947cc82f` |
| INTRO_2 | 5,979,392 | 124.571 | `7fc02dfdcbc43c54d9d1ead1a31fd055d32e36d01a2c6f9b82c07ac27d580cef` | `aa767a20b3619c593707b036f180c4ee0262392196ae09070efb89a0fa0b6213` |
| MENULOOP | 5,951,744 | 123.995 | `7d57ad84c619c889b96f2c1617a891382a66c83109a7df1ad8899b544c9838d2` | `6ac6149806ac2775acd5bece7e0a53ff400b49164e49f7a963868ee8fb9f6585` |

Read from the image (`SOCOM_ISO`, `IsoAssetSource`, as the page reads it) and from the tree alike.

## 3. The original's audio path (`movieAudio.ts`)

The state at 0x451d40, opened by `FUN_0030a7c0` (D:L208340-208365) through `FUN_0030b700`, reset by `FUN_0030a6e0`
(D:L208293-208309):

- **The buffers** (`FUN_00309b40`, D:L207855-207978): the video ring 0x30000 (D:L207962), the staging ring 0xc000
  (D:L207972), the sound ring's size 0x6000 (D:L207974), which the open hands to 989snd's PCM stream open
  (`FUN_0033f1e0(0x6000, 0, 0x366, 0, 2, 2)`, D:L208361; the name is PC research 32 §7's).
- **The callback** `FUN_0030aca0`: the fourth substream byte's flag (D:L208527-208531, research 109 §1; zero on the
  disc); the room (`FUN_0030a620`, D:L208259-208291) -- the header's rest plus the whole staging ring in state 0, the
  staging ring's free space after; a packet that does not fit whole is refused (returns 0); one that fits is copied and
  counted (`FUN_0030a590`, D:L208234-208257: the first 0x28 bytes as header, across packets, then state 1).
- **The move**, once per presented picture (`FUN_0030b1d0` D:L208747 -> `FUN_0030a3b0`, D:L208174-208223): in state 1
  the room is the ring's size less what was moved; in state 2 it is `FUN_0030a2d0`'s (D:L208133-208170) free space from
  the write position to the play position (`FUN_0033f170`, the PCM stream position, masked to 24 bits, less the ring's
  address), nothing when the play position is within 0x400 ahead, else that distance less 0x400, rounded down to whole
  kilobytes. The source is the staging fill rounded down to whole kilobytes (the listing, 0x30a498-0x30a4c4); nothing
  moves unless both reach 0x400 (0x30a4e0-0x30a4f8); the move is the smaller (`FUN_00309f60` cuts the source to the
  room, D:L208022-208031).
- **The start**: after the move, if not started and the bytes moved reach the ring's size (`FUN_0030a570`,
  D:L208225-208231), `FUN_0030a730` (D:L208311-208325) starts the ring whole and sets state 2 (D:L208748-208751).
- **The priming** (`FUN_0030b4d0`, D:L208765-208817): the stream is read 16 KB at a time and demuxed until a demux call
  consumes nothing (D:L208802-208814), i.e. until the first packet a callback refuses. The video callback
  (`FUN_0030add0`, D:L208554-208593) takes a packet that fits the video ring's free space, which starts at its size less
  0x10 (the write pointer starts at base + 0x10, D:L208795); nothing reads the video ring before the first picture is
  asked for.

On the disc (`primeMovieAudio` over the demuxed packets; `tools/test/movieAudioDisc.test.ts`):

| movie | packets primed | video bytes | PCM staged | stopped by |
|---|---|---|---|---|
| SONY448 | 25 | 52,970 | 48,765 | the staging ring |
| INTRO_2 | 39 | 109,949 | 48,822 | the staging ring |
| MENULOOP | 53 | 166,985 | 48,808 | the staging ring |

Between the priming and the first move only the picture's own demux runs, which adds; so the first presented picture's
move is the ring's whole 0x6000 and the ring starts on that tick (R137.3). Under `PSS_ALL=1`: 68 of 69 alike; the 69th,
`RUN/MOVIES/M51/M51IG07.PSS` (a campaign movie), primes 16,252 PCM bytes before the video ring refuses, so its start
comes on a later tick, which the per-tick demux decides (§7).

**A healthy run never runs the ring dry** (`movieAudio.test.ts`): at a picture every 1001/30000 s the ring plays
6406.4 bytes a picture and the move refills up to 23 KB, so 3000 ticks show no underrun; a stall of the pictures over
about 117 ms (the ring less the 1 KB guard and the move's rounding) would let the play position pass the last moved
byte, and the ring would replay stale bytes -- the console's behaviour under a stall, not a case the page reproduces
(§4).

## 4. The sync rule (`movieAudioTimeline`, `movieAudioFrameAt`)

- **Start**: the sound's frame 0 with the frame that shows picture 0. The start is issued in the same call that uploads
  picture 0 (the upload D:L208733-208746, the start D:L208747-208751); the IOP's and the SPU's own delay are not read:
  `MOVIE_AUDIO_START_LATENCY_READING` = 0. On the disc the first audio packet's PTS equals the first video packet's
  (SONY448 3808, INTRO_2 3728, MENULOOP 4797, of 90 kHz), so the mux means the two to start together; the original's
  rule gives that without reading a PTS.
- **Then free-running**: frame = (seconds since picture 0) x 48000. The pictures go one a tick of the game's frame
  (1001/30000 s on NTSC, research 121 §9), the sound at the SPU's rate; a late or stalled tick moves the pictures, never
  the sound. So SONY448 and MENULOOP, coded at 30 pictures a second and shown at 29.97, show each picture 0.1 % later
  than its PTS against the sound: at MENULOOP's last picture the sound is 124 ms ahead of the picture's own timestamp --
  as on the console. INTRO_2 is coded at 29.97 and stays in step.
- **The tail**: only whole kilobytes are moved, so the track's frames are its whole kilobytes / 4; after them the ring
  holds the last 0x6000 bytes moved, in order, and plays them round and round (989snd plays the ring in a loop, PC
  research 32 §7) until the stop: 6144 frames looped. A track whose whole kilobytes never reach 0x6000 never starts.
- **The stop**: at the movie's end, the NODATA tick (`FUN_0030b1d0` D:L208752-208760: `FUN_0030a6e0` stops the PCM
  stream, `FUN_0033f1d0`), or the close (`FUN_0030b120`, D:L208645-208657). A restart (`FUN_00309560`, unreached on the
  disc, research 121 §5) stops it and the create's priming starts it again with picture 0.

**The page holds the healthy console**: the whole track is decoded ahead (§5), so the sound never waits on the
pictures; a late tick of the page (`MOVIE_PICTURE_LATE_READING`, research 120 §11) slows the pictures as a stalled
console frame does, and the sound runs on, as the SPU does. What the page does not reproduce is a console stall over
117 ms running the ring dry (which the original's decoder speed never causes on the opener, PC research 32 §7.1).

## 5. The page (`movieSound.ts`)

- `readMovieSound(source, path, sound)` reads the movie's file a second time, beside the picture worker (the worker
  demuxes the video only, `decodeStream.ts`), through PLAT-18's demuxer, `SShdSplitter` and `MoviePcmDecoder`, and
  hands the track to the sound in pieces of about a second, then its timeline; it judges the priming on the first 256
  packets (`primeMovieAudio`).
- `MovieSound` schedules each piece at picture 0's time plus its first frame over 48000 on the output's clock; a part
  already past is skipped; a piece that comes after its time with the output running is an **underrun** (counted, with
  the seconds lost); after the track's frames the ring's last 6144 frames loop; `stop()` at the end or the close; a
  second picture 0 restarts it from frame 0.
- **Before the first gesture** (R137.6; a browser fact, not the original's): an `AudioContext` does not run until a
  user activation. `MOVIE_SOUND_GESTURE_ADAPTATION` = `'join-in-sync-at-gesture'`: the pictures play without their sound
  until the output runs, then the sound joins at the frame it would be on (`movieAudioFrameAt`), never from its start;
  the silent seconds are counted (`mutedSeconds`), not as underruns. **Two clocks**: a suspended context renders
  nothing, so its `currentTime` stands still (at 0 for one that never ran) and resumes from there; the time since
  picture 0 is therefore taken from the page's clock (`performance.now`, the pictures' own), which runs before the
  gesture: `MovieSound` keeps picture 0's page time, and when the output runs it places the sound's frame 0 at
  `heardAt(picture 0's page time)` on the output's clock (`MovieSoundOut.pageTime`, `heardAt`). Tested on an output
  whose clock stands still while suspended and on a stand-in `AudioContext` (a gesture 5 s after picture 0 joins 5 s
  in; `movieSound.test.ts`). Each time the output starts running again the sound is placed afresh. The block and the
  owner's defaults name no choice, so the brief's default is built and put to the owner (HUMAN_TASKS H74), the other
  choice being an opener that waits for a gesture before its first picture.
- **The output's latency** (`MOVIE_SOUND_LATENCY_ADAPTATION` = `'lead-by-output-latency'`, a labelled browser
  adaptation): a sample scheduled at a context time is heard its latency later (`baseLatency` plus `outputLatency`:
  tens of ms wired, over 150 ms on Bluetooth). `heardAt` maps a page time to the context time being *heard* then --
  through `getOutputTimestamp` (the sample at the output and the `performance.now` it was there), else, before the
  context has rendered (both 0), `currentTime` less the two latencies -- so frame 0 is heard with picture 0, and the
  sound's first latency's worth, already due when the output can take it, is not played (counted in `mutedSeconds`).
  The pictures' own display latency (the compositor's frame or two) is not measured: owed to the capture (§7).
- **The two clocks' drift**: the pictures run on the page's clock and the sound on the output's; `MovieSoundStats.drift`
  measures how far the sound's has run ahead since frame 0 was placed (through a fresh `getOutputTimestamp`). It is
  **not corrected**: the original's ring runs free of the pictures and corrects nothing (§4). How large it grows over
  INTRO_2's 128 s in a browser is owed to the capture (§7).
- **A track still reading at picture 0**: a piece scheduled before the track's timeline came is cut to the moved frames
  when it comes, and a track that never fills the ring falls silent (`finish`); no opener movie has such a track.
- **The output**: `webAudioMovieOut(ctx, destination, gain)` -- a gain (`MOVIE_AUDIO_GAIN_READING`, section 9) into a
  destination node, a buffer source a piece, started at its time and offset. The page's own output
  (`packages/viewer/src/audio.ts`, `GameAudio`'s `WebAudioOut`) does not expose its `AudioContext`; giving the movie
  sound that context (so the existing unlock and the master volume apply) is one getter in that hot file, owed to the
  front end's wiring, which also swaps the black picture source for the worker (§1).
- **Connected**: `playMovieInRealTime`'s `sound` option (`movieRealtime.ts`): `picture(index)` after each picture
  presented, `stop()` at event 3.

**2026-10-03, MOVIE-WIRE: the line is connected in the front end** (`agent/movie-wire`, cut from `agent/online` at
fd557433; `viewer/src/frontEndMovies.ts`). The front end's session gets PLAT-19c's worker source wrapped in
`SoundedMovieSource`, which tells PLAT-20's sound what the movie host does: at each open (the dialog background's or
the movie state's) `MovieSoundFeed` makes a fresh `MovieSound` and starts `readMovieSound` on the same served tree, by
the disc's path (upper case, as the worker opens it), aborting the read and stopping the sound of the movie before;
each picture handed out is `picture(index)` (picture 0 starts the sound, and again at `MPEG_LOOPING`'s restart);
the end is `stop()`; the close stops it and lets the read go. The output is `webAudioMovieOut` over the `AudioContext`
of the front end's own `GameAudio` (`WebAudioOut`), into its master gain, so the page's unlock (the first gesture,
`unlockOn`) and its master volume apply: `MOVIE_SOUND_GESTURE_ADAPTATION` and `MOVIE_SOUND_LATENCY_ADAPTATION` as
built, the owner's default in H74. `WebAudioOut` keeps its context and gain private and `audio.ts` is a hot file this
task did not claim, so `webAudioOutContext` reads the two fields by name -- a stand-in for the getter this section
asks of `audio.ts`, still owed there. Without the front end's sound files (`pageUiSounds`' missing list) the audio is
never prepared and the movies play silent. The output's "now running" reaches the open movie's sound only.
**Measured** (the rendered run `viewer/e2e/openerMovies.spec.ts`, 2026-10-03, headless Chromium, whose context ran
without a gesture): SONY448's track 528,640 frames read whole, 12 voices, 0 underruns, frame 0 placed 0.050 s before
the output could take it (`mutedSeconds`: the latency's share), drift -0.04 ms; INTRO_2's 5,979,392 frames read whole,
124 voices after about 9 s, 1 underrun (8.7 ms lost: a piece read after its time), 0.045 s muted, drift -0.05 ms. Not
heard (headless); the cross-correlation and the level of §7 are still owed, as is the owner's ear (H74).

## 6. What the sources contradict

- **The layout**: PC research 32 §7 measured the PC project's ring dump as "sample-interleaved stereo 16-bit -- even/odd
  sample correlation 0.97, adjacent 512-byte blocks 0.00 -- not the 512-byte L/R blocks"; §7.1 of the same note says
  "512-byte blocks, left then right". The ring holds the disc's bytes unchanged (§2), and the disc's bytes are blocks
  (R137.2). A high even/odd correlation is what blocks give (two neighbouring samples of one channel). The PC project's
  mixer plays the ring sample-interleaved (§7, "Host side"); if so it plays every movie's sound with each channel's
  neighbouring samples split across left and right and the channels swapped every 256 frames -- a drift for the PC
  project to check (not this repository's to change), and a likely part of its "scratchy" title music.
- **The callback's type**: research 109 §4 already notes PC research 09 calling the type-2 callback "ADPCM"; the data is
  PCM.

## 7. Unknowns, and what is owed

- **The level**: the original mapping is now read (section 9, `MOVIE_AUDIO_GAIN_READING`), replacing
  `MOVIE_AUDIO_GAIN_PLACEHOLDER`; the console output comparison remains owed. The PC
  project's row: the movie audio "~20 dB under the console", mostly its capture session's volume, then a median -3.9 dB
  on the title ring. Settled by PLAT-36's `PS2X_AUDIO_TRACE` and the block's +-1 dB check against a recomp
  `PS2X_AUDIO_DUMP` and a PCSX2 loopback.
- **The start's delay** (`MOVIE_AUDIO_START_LATENCY_READING`): the RPC to the IOP and the SPU's start; a capture of the
  original with its sound, or PLAT-36's trace.
- **M51IG07's start tick** (note only; not an opener movie, and no constant stands for it): its priming stops on the
  video ring with 16,252 PCM bytes, so its ring fills on a later picture, which depends on the per-tick demux -- the
  time-budgeted loop `FUN_00309780` (D:L207733-207761) and the picture's own reads -- not modelled. The page starts it
  with picture 0, as the others; a `PS2X_MPEG_TRACE` run of that mission's movie settles it.
- **Which channel is the left**: the header names none; channel 0 is played left. A capture of the original's sound
  settles it.
- **The browser's clocks** (§5): the two clocks' drift over a whole movie (measured by `MovieSoundStats.drift`, not
  corrected), how far `getOutputTimestamp` and the latencies a browser reports match what is heard, and the pictures'
  display latency -- none exercised in a browser here; the page output's capture below settles them.
- **The front end's wiring** -- *connected 2026-10-03 by MOVIE-WIRE (§5's dated paragraph); the getter in `audio.ts`
  is still owed (a read of the private fields stands in). What was written:* nothing in `packages/viewer/src` builds a `MovieSound` for the opener yet (the front end's
  movie host plays the black stand-in, `frontEnd.ts`); it needs the worker's picture source there, `readMovieSound` and
  `webAudioMovieOut` over the page's own context -- a getter on `WebAudioOut`'s `AudioContext` in `audio.ts` (a hot file,
  to be claimed) so that the existing unlock and the master volume apply.
- **Owed by the acceptance**: the cross-correlation of the page's output against the disc PCM in 4 s windows across
  INTRO_2 and MENULOOP (>= 0.99, the offset advancing 1:1, 0 underruns; `tools_py/parity/audio_corr.py`) -- a browser
  capture of the page's output, not made here (no browser run, and the front end does not play the movies yet); the
  level against the recomp's dump and PCSX2 within +-1 dB (PLAT-36); the owner's ear (HUMAN_TASKS H74).

## 8. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `MOVIE_PCM_LAYOUT_READING` | how a track's two channels are laid out | the disc's bytes, three tracks by default and all 69 under `PSS_ALL=1` (§2); the game copies them unchanged. Reading: blocks of 0x200 bytes a channel, channel 0 then 1 | in code since 2026-10-02: `packages/sound/src/moviePcm.ts` |
| `MOVIE_AUDIO_GAIN_PLACEHOLDER` | retired unity movie gain | replaced by the source reading below, 2026-11-07 | retired |
| `MOVIE_AUDIO_GAIN_READING` | movie PCM before the shared listening master | section 9: corrected IRX full-master BVOL 23258; port voice normalization gives 23258 / (2 * 32766) | reading (PR #718; re-read at the source 2026-11-09, §9.1; the fresh review PASS WITH FINDINGS, high, `agent-mail/evidence/bugs-2026-11-09/REVIEW-chris-audio-46cb8ea1f.md`), `packages/fmv/src/movieAudio.ts`; console capture still owed |
| `MOVIE_AUDIO_START_LATENCY_READING` | the seconds from the frame showing picture 0 to the sound's first sample | the start in the same call as picture 0's upload (D:L208733-208751); the IOP's and the SPU's delay not read. Reading: 0 | in code since 2026-10-02: `packages/fmv/src/movieAudio.ts` |

## 9. Live movie volume, 2026-11-07 (reading)

The main menu's MENULOOP soundtrack is movie PCM, not a MUS_ stream. The movie open
`FUN_0033f1e0(..., 0x366, 0, 2, 2)` (D:L208361) puts it in group 2. The Dialog tuner
sets groups 2 and 6 (EE calls at 0x389e10 and 0x389e50; research 233 section 1), while
Music sets group 1. The front end now applies Dialog before the first scheduled PCM
and refreshes the same output gain each frame, including while Home Settings is open.
Muted queued samples remain intact so raising the slider restores ongoing playback.

A fresh reading of the disc's `989SND.IRX` corrects research 186's movie pan coefficient:
PCM open stores its fifth argument at 0xa600 into group global 0x1c3e0. PCM start reads
it at 0xaa50 and applies `snd_AdjustVolToGroup` (0x19b7c); a group change refreshes it
through 0xae2c. PCM's pan function 0x198c8 indexes the fixed table 0x1c8d0, whose center
entry 90 is (16383,16383). The voice table's 11584 coefficient does not apply here.
At the open's volume, vol7 = floor(0x366 * 127 / 1024) = 107 and base = 107 * 258 = 27606.
With the option master `trunc(f32(value * 1024))`, scaled = trunc(base * master / 1024)
and BVOL = trunc(scaled squared / 32766); full-master BVOL is 23258. Mode 2 writes
BVOL unshifted. `movieDialogGain` uses BVOL / 23258 relative to `MOVIE_AUDIO_GAIN_READING`.

The hardware scaling is independently checked in official PCSX2 at commit
`695e26713be06daf8b9d05978602946b82008716`:
[BVOL register](https://github.com/PCSX2/pcsx2/blob/695e26713be06daf8b9d05978602946b82008716/pcsx2/SPU2/spu2sys.cpp#L1270),
[voice register doubling](https://github.com/PCSX2/pcsx2/blob/695e26713be06daf8b9d05978602946b82008716/pcsx2/SPU2/ADSR.cpp#L110),
[Q15 mixing](https://github.com/PCSX2/pcsx2/blob/695e26713be06daf8b9d05978602946b82008716/pcsx2/SPU2/Mixer.cpp#L155).
PCM BVOL enters Q15 mixing directly; a fixed voice register enters doubled. The port
normalizes voice registers by 32766, so matching that convention gives PCM gain
23258 / (2 * 32766), about 0.35491, before the same listening master. This replaces
unity, reducing the overly loud movie soundtrack by about 9 dB without changing the
saved slider defaults. The divisor is not 32767: that is the maximum positive Q15
coefficient, not the mixer divisor. This is a source reading; console output capture
and absolute calibration remain owed. No claim of the old 0.1774 level is retained.

Evidence: direct original EE/IRX source reading independently re-read by the settings
audit reviewer; transcription tests and rendered browser output checks are recorded
in the in-game-settings plan. No physical controller or console-audio comparison.

### 9.1 The citations, re-read at the source (2026-11-09)

PR #718's merge into `agent/chris-audio` (the v0.4.17 head) re-read every step above at the source, by a seat that
did not write it; the controller's fresh review followed (PASS WITH FINDINGS, high, `agent-mail/evidence/bugs-2026-11-09/REVIEW-chris-audio-46cb8ea1f.md`; the merge da26c3e2b), so the level is **reading**. `I:L`
is a line of the IRX's decompilation (`C:/Projects/socom_pc/game/analysis/989SND.IRX.decomp.c`), `D:L` the EE's as
above. Names and numbers only; no decompiled text.

| step | source | what it says |
|---|---|---|
| the open's arguments | `FUN_0033f1e0(.., 0, 0x366, 0, 2, 2)` D:L208361 (RPC 0x3b, `FUN_0033f1e0` D:L239929) | volume 0x366, pan 0, group 2, mode 2 |
| the 7-bit volume and the group | IRX `FUN_0000a318` (the PCM open) I:L6610, I:L6612 | vol7 = 0x366 x 0x7f >> 10 = 107; the group global (0x1c3e0) = the fifth argument, 2 |
| the start | IRX `FUN_0000a9ac` I:L6772, I:L6826-6829 | the pan stage on (vol7, pan), then mode 2 (not 3) writes `FUN_00019b7c`'s value to both BVOL registers (register OR 0xf80 and OR 0x1080) unshifted; mode 3's voice pair is written `>> 1` |
| a group change | IRX `FUN_0000ae2c` (from I:L6841) | re-applies `FUN_00019b7c` at the stored group to a sounding PCM: a Dialog change re-levels the movie live |
| the pan stage | IRX `FUN_000198c8` I:L15182 | vol7 x 0x102 = 27606, times the fixed table at 0x1c8d0, over 0x3fff |
| the pan table | the disc's `RUN/IRX/SOUND/989SND.IRX`, its one load segment at file offset 0xa0, entry 90 (pan 0) at 0x1c8d0 + 90 x 4 | (16383, 16383): 27606 unchanged; entries 0, 45, 135 read (16383, 0), (16383, 8190), (8190, 16383) -- a linear table, not the voice table's 11584 centre |
| the group stage | IRX `FUN_00019b7c` I:L15274-15300 | clamp at 0x7ffe, times the group's modifier >> 10, then square over 0x7ffe: at the full Dialog master 27606^2 / 32766 = 23258. The modifier (I:L15287) is the group's volume (0x1cdf4) times its duck factor (0x1ce74) >> 16, so 23258 holds only while group 2's duck factor is 0x10000 -- the next row |
| the duck stage | IRX `FUN_00019e30` I:L15365-15468 (run every fourth tick, I:L9408-9409); setter `FUN_0001a0a0` I:L15473-15524; the disc's `989SND.IRX` (load segment at file offset 0xa0, file size 0x1cf04, memory size 0x243e4) | the factors are reset to 0x10000 (I:L15400) and lowered only by the four duck entries at 0x24384 (stride 0x18; I:L15404-15446), each lowering the groups of its mask while its trigger group sounds. The one writer of the entries is `FUN_0001a0a0`, whose one caller is `FUN_000015d4` (I:L1258-1268), entry 0x60 of the RPC table 0x1b070 (the disc's bytes at 0xa0 + 0x1b070 + 0x60 x 4 hold 0x15d4; dispatched by `FUN_00001730` I:L1322-1328 and, batched, `FUN_00001634` I:L1287-1317 as entry 0x4d). The ELF binds that server once (`FUN_001a6aa8(.., 0x123456, ..)` D:L241052) and sends to it only through `FUN_0033fca0` (D:L240355; commands 0, 1, 0xa, 0xc, 0x2a, 0x35, 0x36, 0x3b-0x3e, 0x40, 0x4c) and the batch `FUN_0033f8b0` (D:L240252; commands 6, 8, 9, 0xb, 0xe, 0x10-0x19, 0x1b, 0x1e, 0x21, 0x22, 0x2c, 0x34, 0x38, 0x4c, 0x4e, 0x50, 100, 0x67), every call's command a literal: never 0x60. A scan of the desktop's extracted overlay `ftscore.bin` (source inspection, not a repository reader) finds its 34 calls of the two senders set a0 to the same set, none 0x60. The entries sit in the module's zero-filled tail (0x24384 is past the file size), so all four keep mask 0 and lower nothing: **no duck ever acts, on group 2 or any group, during a movie or otherwise**, and the initial factors on the disc are 0x10000 for all 15 groups (0xa0 + 0x1ce74). Reading (the fresh review, REVIEW-chris-audio-46cb8ea1f.md) |
| the master | `GROUP_MASTER_READING` (`@s2u/sound` `musicStream.ts`; research 233 §1): DIALOG_VOLUME is the master of groups 2 and 6, `trunc(f32(value x 1024))` (`streamGroupMaster`), under group 16's 0x400 | `movieDialogGain` = trunc(trunc(27606 x master / 1024)^2 / 32766) / 23258 |
| the port's scale | `@s2u/sound` `render.ts` `voiceLevel` (the voice's register, `>> 1`) over 0x7ffe (`musicStream.ts` `pairGains`); PCSX2's voice register doubled, BVOL not (the links above); the IRX's own evidence beside it: the same start `FUN_0000a9ac` writes one group-stage value `FUN_00019b7c` to mode 3's voice pair `>> 1` (I:L6790-6795; the second voice's right I:L6814-6815) and to mode 2's BVOL pair unshifted (I:L6826-6829) -- the library halving a voice register where it does not halve BVOL is what an SPU that doubles the voice register and not BVOL asks for, so both modes sound at one level (an inference from the code, not a measurement); the console capture below is what would prove the factor 2 | a voice's port gain is half its SPU amplitude, so BVOL's is BVOL / (2 x 32766): `MOVIE_AUDIO_GAIN_READING` 0.35491, -9.0 dB under unity |

What would settle it as proven: a console capture of the title ring (MENULOOP) at the default Dialog master, its RMS
over a matched segment against the page's output at the same master, within +-1 dB (§7's check).
