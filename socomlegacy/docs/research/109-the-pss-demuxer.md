# 109 -- The PSS demuxer: the disc's movies as program streams, their video and their PCM track (PLAT-18)

Written 2026-10-01 for task PLAT-18 (the block is `../roadmap/01-platform.md` "PLAT-18"). Sources: the retail
decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:Lnnn` = its line); the disc tree
(`SOCOM_DISC`, `game/disc/RUN/MOVIES/**.PSS`) and the image (`SOCOM_ISO`), read through `@s2u/archive`; ffmpeg and
ffprobe 8.1 (`8.1-full_build-www.gyan.dev`), one thread, stream copy only; the PC project's `logs/title_disc_audio.bin`
and its research 09 (`09-menu-movie-ipu.md`), 16 and 32 (`32-audio-path.md` §7, §7.1). No disc bytes are copied here
beyond short constants (start codes, the substream header, the header's tag words). The code is
`packages/fmv/src/pss.ts` (`PssDemuxer`, `demuxPss`, `demuxPssFile`, `SShdSplitter`, `parseSShd`), pinned by
`packages/fmv/test/pss.test.ts` (CI, a synthetic stream) and `packages/fmv/test/pssDisc.test.ts` (dev disc).

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R109.1 | **The demuxed video of all 69 PSS files is byte-equal to `ffmpeg -i X -map 0:v:0 -c copy -f mpeg2video`** (length and SHA-256 of the whole stream, and the picture start codes) | the block's first acceptance is met on every file, not only the three the brief names | §3 |
| R109.2 | **Every disc PSS is the same shape**: packs of exactly 16,384 bytes (the game's 0x4000 read), one system header, video PES 0xE0, audio in private stream 1 (0xBD), a few padding packets (0xBE), one program end code. 3,254,108,436 bytes, 198,615 packs, 619,594 video, 174,743 audio and 191 padding packets; no byte between units | the demuxer is general (it resynchronises and carries a unit across chunks), but on the disc nothing is ever carried between 16 KB reads | §1 |
| R109.3 | **The audio payload opens on `FF A0 00 00`, then the track**: the four bytes the game's audio callback skips (`FUN_0030aca0`, D:L208533-208534). The `FF` is why ffmpeg sees no audio: its PS reader takes the payload's first byte as the substream id | `PSS_SUBSTREAM_HEADER = 4`; the audio is ours to demux, as the block says (trac #4478) | §1 |
| R109.4 | **Every track is `SShd` type 1, 48000 Hz, 2 channels, interleave 0x200 -- PCM on all 69, no ADPCM** -- and the PCM behind the 40-byte header is exactly `SSbd`'s size on all 69 | settles the block's second unknown: PLAT-20 decodes PCM only | §2 |
| R109.5 | **The game reads none of the header's fields**: it counts the track's first 0x28 bytes as header and drops them (`FUN_0030a590`, D:L208242-208248); no `SShd`/`SSbd` tag is compared anywhere in the decompilation | `SShdSplitter` drops the same 40 bytes; parsing the fields is ours, for validation | §2 |
| R109.6 | **`title_disc_audio.bin` is SONY448's whole track (2,114,600 bytes, header included) followed by the first 2,417,318 bytes of INTRO_2's**, byte-equal to this demuxer's output | the PC method is reproduced; "a stream's payloads" in PC research 32 §7.1 is two streams back to back | §3 |
| R109.7 | **MENULOOP has 3732 pictures, not 3790** (ffprobe `-count_frames` 3732, the stream copy's picture start codes 3732, this demuxer 3732; ffprobe's duration 124.40 s = 3732 / 30) | contradicts PC research 09 L45 and the roadmap's B16, PLAT-18 and PLAT-19a lines; PLAT-18's block is corrected in place | §4 |

## 1. The layout, as read

Every one of the 69 files is an MPEG-2 program stream: the front end's 16 (the 15 of `RUN/MOVIES/COMMON/` and
`RUN/MOVIES/INTRO_2.PSS`), the campaign's four `RUN/MOVIES/*_AOP.PSS` and its 49 in the mission folders `M51`-`M83`:

- **Packs of 16,384 bytes.** Each file's size is its pack count times 16,384, plus 4 for the program end code
  (`00 00 01 B9`) at the very end -- 69 of 69. The original reads 0x4000 bytes per `sceCdStRead` and hands each read to
  `sceMpegDemuxPss` (`FUN_0030b4d0`'s priming loop, D:L208802; PC research 09 L22-25), so a read is one pack.
  `PSS_READ_CHUNK` is that size; at it, the demuxer's buffer never holds more than the read in hand (its high-water mark
  is 16,384 on every file).
- The pack header is MPEG-2's (14 bytes, no stuffing); the first pack carries the one system header (0xBB).
- **Video**: PES 0xE0, MPEG-2 headers, PTS (and DTS where the picture order needs it).
- **Audio**: PES 0xBD with an MPEG-2 header of 10 data bytes (a PTS and five 0xFF stuffing bytes) and a payload of
  `FF A0 00 00`, then the track's bytes. Of the 174,743 audio packets, every one but each track's last carries 4073
  (130,809 packets), 4059 (43,847) or 4044 (18) bytes of the track (PC research 32 §7.1 gives the 4073 / 4059); each
  track's last packet is shorter, one per track: 69 packets of 68 distinct lengths between 129 and 4043 (a scan of all 69 files, 2026-10-01). Every audio
  packet of every file has the same four bytes. The audio callback reads the fourth (`FUN_0030aca0`, D:L208527):
  once a packet with a non-zero fourth byte arrives, later packets whose fourth byte is zero are taken and not copied
  (D:L208529-208531; the flag `DAT_00451dc0` is cleared by the close `FUN_0030b120`, D:L208653, the per-frame
  `FUN_0030b1d0`'s end path, D:L208757, and the create `FUN_0030b4d0`, D:L208788). On the disc it is always zero, so every audio packet is copied. The player create registers the callback
  for stream 0 and, when it is given a non-zero audio stream number, for that stream too (D:L208784-208786); the disc's
  movies have one audio stream.
- **Padding** 0xBE: one to three packets a file. No private stream 2 (0xBF), no MPEG audio (0xC0-0xDF), no program
  stream map; the demuxer steps over all of them anyway (the CI stream has each).

ffmpeg's PS reader (as of 8.1) treats the first payload byte of a private-stream-1 packet as the substream id; here it
is 0xFF, which names no stream it knows, so it drops every audio packet: `ffprobe` lists one stream, the video, for
every file (the dev-disc test holds this for INTRO_2). FFmpeg's ticket the block cites (#4478) is this.

## 2. The track's header

The track -- the audio payloads concatenated, the four bytes skipped -- opens on a 40-byte header, little-endian:

| bytes | value on all 69 | meaning | source |
|---|---|---|---|
| 0-3 | `SShd` | tag | the disc |
| 4-7 | 24 | the size of what follows to byte 31 | the disc |
| 8-11 | 1 | type: 16-bit little-endian PCM | PC research 32 §7.1 (the ring dump matched against the disc PCM) |
| 12-15 | 48000 | sample rate | PC research 32 §7.1; `snd_PcmStreamStart`'s `freq 0` = 48 kHz (§7) |
| 16-19 | 2 | channels | PC research 32 §7.1 |
| 20-23 | 0x200 | interleave: bytes per channel block | PC research 32 §7.1 |
| 24-27, 28-31 | 0xFFFFFFFF, 0xFFFFFFFF | **not known** (`word24`, `word28`) | the disc only; the game never reads them (R109.5) |
| 32-35 | `SSbd` | tag | the disc |
| 36-39 | the PCM's length in bytes | the body that follows; equal to the PCM's length on all 69 | the disc |

The game does not parse it: the EE streamer's state 0 takes the first 0x28 bytes of the track as header, across
packets, and only then moves PCM to the sound ring (`FUN_0030a590`, D:L208242-208248); the rate and channels it plays
at come from its own open call (PC research 32 §7). `SShdSplitter` does the same 40-byte cut and parses the fields only
to check them; a track that does not open on `SShd` (size 24) and `SSbd` is refused.

Per channel, the samples are `SSbd size / 4`: SONY448 528,640 (11.01 s), INTRO_2 5,979,392 (124.57 s), MENULOOP
5,951,744 (124.00 s). Against the video -- SONY448 310 pictures at 30 fps (10.33 s), INTRO_2 3836 at 29.97 (128.0 s),
MENULOOP 3732 at 30 (124.4 s) -- the tracks are not the pictures' length; how the player ends and syncs is PLAT-20's
and PLAT-21's.

**How the 0x200 interleave lays the channels out is not settled by the sources.** PC research 32 §7.1 says 512-byte
blocks, left then right; §7 of the same note measured the 989snd ring (after the EE streamer) as sample-interleaved and
"not the 512-byte L/R blocks". The demuxer passes the bytes through either way; PLAT-20 owns the reading.

## 3. Method and results

Commands, from `redotcom` (ffmpeg on the PATH; the ffmpeg runs are the host's to schedule -- the PC project's lock
was FREE for all of these):

```sh
export SOCOM_DISC=C:/Projects/socom_pc/game/disc
export SOCOM_ISO="C:/Projects/socom_pc/game/SOCOM II - U.S. Navy SEALs (USA).iso"
export SOCOM_PC_ROOT=C:/Projects/socom_pc
npx vitest run packages/fmv/test/pss.test.ts packages/fmv/test/pssDisc.test.ts   # the three movies, ~30 s
PSS_ALL=1 npx vitest run packages/fmv/test/pssDisc.test.ts                       # all 69 against ffmpeg, ~100 s
```

- **The video against ffmpeg** (R109.1): for each file, this demuxer's 0xE0 payloads and ffmpeg's stream copy
  (`ffmpeg -nostdin -threads 1 -i X -map 0:v:0 -c copy -f mpeg2video -`) are digested as they arrive -- length,
  SHA-256, picture start codes -- and compared. 69 of 69 equal, whole files. Picture counts: SONY448 310, INTRO_2 3836,
  MENULOOP 3732; 108,111 over the 69.
- **The audio**: each track's header as §2, its PCM length equal to `SSbd`'s, and `FF A0 00 00` before every payload,
  on all 69: `pssDisc.test.ts` "every track" checks the three movies by default and all 69 under `PSS_ALL=1`. The CI
  tests cut the header across packets at 1, 20, 39 and 40 bytes.
- **The PC project's reference** (R109.6): `logs/title_disc_audio.bin` (4,531,918 bytes) is compared with SONY448's
  track followed by INTRO_2's, cut to its length: equal by SHA-256. The PC note calls it one stream's payloads; it is the
  logo movie's and then the intro's, as the stage plays them (PC research 32 §7.1 names both LBNs).
- **The image** (PLAT-03's path): SONY448 demuxed from `SOCOM_ISO` through `IsoAssetSource` by range gives what the tree
  gives, digest for digest.
- **CI** (`pss.test.ts`, no disc): a synthetic program stream with MPEG-2 and MPEG-1 packs, a system header, PES packets
  with PTS and DTS, PTS only and neither, MPEG-1 PES headers, PTS values using all 33 bits, padding, private stream 2,
  MPEG audio and private stream 1 with odd payloads; the same packets for the stream cut in two at every offset and fed
  1, 2, 3, 5, 13 bytes up to 16 KB at a time; the whole stream stepped over with no byte skipped (the MPEG-2 pack
  stuffing counted as the pack's); a stream ending inside a unit refused with its offset; bytes between units stepped over
  and counted, and a start code split across two chunks after junk still found; a PES header whose data length does not
  cover the PTS or DTS it flags refused with its offset; the buffer bounded by a packet plus a chunk over 2000 packs; `demuxPssFile` over a ranged
  source reads in 16 KB ranges, never the file whole.

## 4. What the sources contradict

- **MENULOOP's picture count**: PC research 09 L45 says 3790 pictures (~126 s); the disc has 3732 (R109.7). The
  roadmap repeats 3790 in `02-boot.md` (B16, and the loop seam "picture 3790 -> 0" under BOOT's acceptance) and in
  PLAT-19a; the PLAT-18 block is corrected in place, the others are left to their owners.
- **The interleave** (§2): PC research 32 §7.1 and §7 disagree; not this task's to settle.
- **The callback's stream type**: PC research 09 L22 calls the audio callback's registration type 2 "ADPCM"; the data
  it receives is PCM (type 1 in every header). The constant's name in Sony's library was not read here; the data
  settles what PLAT-20 decodes.
- **`title_disc_audio.bin`**: one stream in PC research 32 §7.1's words, two in the bytes (R109.6).

## 5. Unknowns

- The header words at bytes 24-31 (`word24`, `word28`): 0xFFFFFFFF everywhere, never read by the game. A loop point is
  a guess and is not used; nothing depends on them.
- The substream header's first three bytes (`FF A0 00`): constant, skipped by the game, not interpreted here.
- The channel layout inside a 0x200 block (§2): PLAT-20's. *(Settled 2026-10-02 by research 137 R137.2: blocks of
  0x200 bytes a channel, channel 0 then 1, measured on the disc's bytes; PC research 32 §7's "sample-interleaved" is
  contradicted.)*

## 6. Placeholders and readings

None. Every constant in `pss.ts` is read from the decompilation (`PSS_SUBSTREAM_HEADER`, `SSHD_HEADER_LENGTH`,
`PSS_READ_CHUNK`) or the MPEG systems layer; no stand-in value is named.
