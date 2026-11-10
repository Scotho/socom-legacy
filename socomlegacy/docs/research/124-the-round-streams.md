# 124 -- The round's streams: the VPK and VAGp formats, a cue name to its VAGSTORE member, the intro, the result line and the win music map by map, and the one music slot (INT-AUDIO, an interim slice of PLAT-22)

Written 2026-10-02 for INT-AUDIO, the integration of the audio area of Chris's LAN "browser beta v5"
(chris/browser-beta-integration d578f347, `integrations/browser-beta-v5/`), an interim slice of PLAT-22
(`../roadmap/01-platform.md` "PLAT-22"). Sources: the retail decompilation
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line), the retail ELF on the disc (strings
by address), the dev disc (`SOCOM_DISC`: `RUN/SOUNDS/VAGSTORE.ZAR`, `RUN/SOUNDRDR.ZAR`, the 22 `RUN/MP*.ZDB`) read with the
repository's readers (`@s2u/archive`, `@s2u/scene` `parseAnimSets`/`decodeEffectProgram`, `@s2u/sound`) by probes outside
the tree (names, sizes, counts only), 989snd's reference `C:/Projects/socom_pc/research/989snd-ziemas` (`iop/types.h`),
the PC runtime's stream reader (`third_party/ps2recomp/ps2xRuntime/src/lib/snd989_mixer.cpp`), the PC project's KNOWN
([mission-music], the stereo-desync row) and research 32 §6, and web research 81, 91 and 122. No sample value, decoded
PCM or disc byte beyond a short constant is in this note or in the tests.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R124.1 | **A VPK is 989snd's `VPKFileHead`** -- magic `" KPV"`, the bytes of ONE channel, `data_offset`, `buff_size`, rate, channels, one (vol, group, pan) per channel -- **and its data starts at `data_offset` (0x800), in `buff_size` (0xb000) buffers, half each to a channel.** All 210 VPKs of the dev disc: 0x800, 0xb000, 32000 Hz, 2 channels, (127, 0, 270) / (127, 0, 90); every member's size is exactly `0x800 + ceil(size / 0x5800) x 0xb000` | `types.h` 498-506; disc | §1 |
| R124.2 | **A VAGp is Sony's 48-byte big-endian header and mono SPU ADPCM to the end flag.** 10,731 on the disc: 10,679 at 22,050 Hz version 32; the result lines `PH_0014` (17,296 data bytes, end flag at 17,264: 1.37 s) and `PH_0002` (13,472, 13,440: 1.07 s) | disc; `snd989_mixer.cpp` 2249-2255 | §2 |
| R124.3 | **A name streams through `sounds.rdr`, its file named by the entry's class**: `FUN_00342240` formats `N1` as `"%s.VPK"` for the `MUS` class, `"%s.VAG"` otherwise, finds it by the CRC-32 of the upper-cased name, and plays it in group 1 (music) or 2 (voice). A multiplayer map loads `HUDUI`, `SMUS`, `TCM_ECHO`, its own five, `MULTI` and `HOSTAGE`: `SMUS` holds the `MUS_*` cues, `MULTI` the `^PH_*` lines | D:L241797-241904, D:L242783-242818 | §3 |
| R124.4 | **Every multiplayer map's own `objectives` script names its round's cues**: the intro by `player_team` after a WAIT (3, 5, or 5 + 2), the result line both sides hear and the winner's music (with WAIT 2 between on 13 maps, none on 9), and on the six maps with a respawn mode `mission_timer2`'s TIME EXPIRED cue -- the SEALs' win music whoever leads. Chris's beta played MP2's alone; the page now reads every map's | 22 `MZANIM.ZAR` `objectives` | §5 |
| R124.5 | **The music is SOUND's one-voice slot** (flags 0x880 on every cue; the line is a plain 0x80): a cue while another sounds fades it over 2 s and starts when the slot frees (`MUSIC_SLOT_HANDOVER_READING`) | `FUN_00348dc0` D:L245383-245446 | §7 |
| R124.6 | **The levels are the disc's**: the lines and the music play at the command's 1.0 with no `VOLUME`, so they go out at one level (`STREAM_LEVEL_READING`). Chris's -2 dB on the line and 12 dB duck of the music are his playtest's preference with no original behind them; neither is ported (ruling INT.R7) | `sounds.rdr`; the scripts | §7 |

## 1. The VPK music stream (`packages/sound/src/vpk.ts`)

- **The header** is `VPKFileHead` (989snd `iop/types.h` 498-506), little-endian: +0 the type (the word `"VPK "`, bytes
  `20 4b 50 56`), +4 `size` (one channel's bytes), +8 `data_offset`, +0xc `buff_size`, +0x10 `sample_rate`, +0x14
  `num_channels`, +0x18 `vol_pan[]` (`VPKFileVolPanPair`: s8 vol, s8 group, s16 pan). On the dev disc all 210 read 0x800,
  0xb000, 32000, 2, and the pairs (127, 0, 270) and (127, 0, 90): the first channel hard left, the second hard right.
  Zeros fill 0x30-0x800.
- **The data**: KNOWN's stereo-desync row (2026-09-21) reads the IRX's `FUN_00013334`: word 3 must equal the game's
  0xb000 streaming buffer, and a channel's stride in it is word 3 >> 1. So buffer k holds the left channel's bytes
  `[k x 0x5800, (k+1) x 0x5800)` then the right's; the last buffer carries what is left of each at the same strides.
  Measured: every member's size equals `0x800 + ceil(size / 0x5800) x 0xb000` (MUMP0004: 688,576 bytes a channel,
  1,398,784 the member); the frames from 0x800 are well-formed ADPCM (the last two frames of each channel carry a header
  byte 0xc0, a filter the decoder reads as 0); no frame carries the end flag, so a channel decodes to `size / 16 x 28`
  samples (MUMP0004 37.66 s, MUMP0009 38.15 s, MUMP0019 18.43 s, MUMP0020 18.77 s).
- **The PC runtime disagrees, and the disc settles it.** `snd989_mixer.cpp` 2247 starts the data at `byteOffset +
  word 3` (0xb000). Read so, MUMP0004's left channel has 614 malformed frame headers and runs 10,688 bytes short, and the
  0xa800 offset is no whole buffer, so each channel's buffer starts 0x800 bytes inside the other's. Its L/R correlation
  stays high (0.47 against 0.51 from 0x800), which is why KNOWN's correlation check passed it. Recorded for the PC side
  (§11): the PC game may lose the first ~0.6 s of every music cue.
- **Our guards** (named, not the game's): `VPK_MAX_CHANNEL_BYTES_GUARD` 16 MiB (the disc's largest channel 3,909,696),
  `VPK_MAX_CHANNELS_GUARD` 2, `STREAM_RATE_GUARD` 8,000-48,000 Hz (the disc's streams: 16,000, 22,050, 32,000, 44,100).
  Chris's decoder had the same bounds unnamed (16 MB, 8-96 kHz, channels == 2); its interleave read is the same, and it
  is the better reading than the PC runtime's.

## 2. The VAGp voice stream (`packages/sound/src/vagStream.ts`)

- Sony's header, 48 bytes, big-endian: `"VAGp"`, the version at +4 (32 on all but 50 of the disc's 10,731: 24 read 0,
  25 read 4), the data's bytes at +12, the rate at +16, the name at +32 (`PH_0014`). The PC runtime reads the same
  (`snd989_mixer.cpp` 2249-2255; PC research 32 §6).
- Mono SPU ADPCM to the frame that carries the end flag (`decodeVag`): `PH_0014`'s at 17,264 of 17,296 bytes, so the
  whole line plays, (17,264 / 16 + 1) x 28 = 30,240 samples, 1.37 s; `PH_0002`'s at 13,440 of 13,472, 1.07 s.
- **Our guard**: `VAGP_MAX_DATA_BYTES_GUARD` 4 MiB (the disc's longest line 2,705,152), and the rate guard above.
  Chris's 4 MB and 8-48 kHz, named.

## 3. A name to its member (`packages/sound/src/script.ts`)

- **The entry.** `sounds.rdr`'s `SETS` entries that stream are `ST (N1 <stem> [LOOP ()])`; `FUN_003435c0`
  (D:L242323-242560) sets the class at +0x1d bits 2-4: `STREAMING_EFX` 1, `MUS` 2, any other `ST` 3, and keeps `N1` at
  +0x20 (`N2` at +0x24: no entry on the disc has one). The round's: `SMUS` `MUS_MP_SEAL_INTRO_4` = `ST (N1 MUMP0004) MUS`,
  `MUS_MP_TERR_INTRO_4` MUMP0009, `MUS_MP_SEAL_WIN_RUS` MUMP0019, `MUS_MP_TERR_WIN_RUS` MUMP0020, `MUS_MP_SEAL_WIN_ALB`
  MUMP0013; `MULTI` `^PH_0014` = `ST (N1 PH_0014)`, `^PH_0002` PH_0002. None carries `VOLUME` or `LOOP`. `SMUS` has 212 entries (research 122 R122.8); `LOOP` sits under `ST` on 9 of them (2
  `MUS`) and beside it on 12 (research 122's count) -- `FUN_003435c0` reads it under `ST` -- which is PLAT-22's
  (`VPK_LOOP_READING`).
- **The file.** `FUN_00342240` (D:L241826-241832) formats `N1` as `"%s.VPK"` (ELF 0x3f76e8) for class 2, else
  `"%s.VAG"` (0x3f76f0) (`N2` the lower-case `"%s.vpk"` / `"%s.vag"`, 0x3f76f8 / 0x3f7700), and looks it up with
  `FUN_0034d480` -> `FUN_0034d940` (D:L248268-248292) by the CRC-32 of that name (`FUN_003a2370`) in a table whose
  names `FUN_0034d5d0` hashed after `FUN_003443c0` (D:L242761) upper-cased them (`FUN_0019afd0`, D:L17306, `toupper`).
  The archive spells its members `MUMP0004.vpk`, `PH_0014.vag`: a reader matches without case (`readSoundStreams`).
- **The play.** `FUN_0033f580(loc1, loc2, off1, off2, vol, pan, group, 0)` -- `snd_PlayVAGStreamByLoc` -- with group 1 for
  class 2 (KNOWN [mission-music]: the music is group 1), 6 when +0x1c bit 4 is set, 2 for class 3, else 0
  (D:L241878-241895).
- **The gate on a voice.** A class-3 entry (the result lines) plays only while `DAT_003dffa8` (set by the sound system's
  first frame, `FUN_00341a60` D:L241514-241518; cleared by `FUN_00341a30` D:L241492-241498) or the online flag
  `DAT_0045a0c1` (research 91 §1) is set, or it carries `PD` (D:L241822-241824). In an online round both hold.
- **The blocks.** The map's load `FUN_00344450` (D:L242783-242818) puts `HUDUI`, `SMUS`, `TCM_ECHO`, then `%s_vc`,
  `_fx`, `_am`, `_svo`, `_smu` (strings 0x3f7880-0x3f78a0), then for a map whose name's second letter is `p`, `MULTI` and
  `HOSTAGE` in the one table (`missionSoundBlocks`). A name none of them holds plays nothing (`FUN_00344f30`).
- **Ours** (Chris's mapping, our resolver -- the triage's best of both): Chris read four `MUS` names out of `SMUS` by the
  same hash, on MP2 only, and mapped the two lines by a fixed table (`'^PH_0014' -> 'PH_0014.vag'`) with the extension
  guessed; ours resolves any name through the blocks the map loads, and the extension comes from the class.

## 4. How the page reads them (`packages/viewer/src/soundData.ts`)

- In the worker: the cue names of the map's script (§5), resolved (§3), VAGSTORE's head and 311,621-byte index read once,
  then each member by range (`readSoundStreams`) -- Frostfire's six are 4,229,264 bytes of the 576,593,920 -- and decoded
  whole. Chris read the index again for every name. A source that reads only whole files is refused with a line in
  `missing`: `readZarMembers`' fallback would read all 577 MB. The page's sources (the ISO, the served tree) read by
  range; the dev tree's directory source does not, and its tests name that line.
- VAGSTORE stays a front-end class copied only by `tools/extract-maps.ts --with-streams` (`frontEndFiles.ts`), not a
  common archive: Chris's copy-always is not taken. A served tree without it, or a page whose data has no streams,
  plays the round silent and says why in `missing`. **A deployment that wants the round's cues must serve VAGSTORE.**
- Decoded whole, the six cues are about 29 MB of float a map (the four stems 2,066,352 bytes of ADPCM a channel); the
  buffers cross to the page in the worker's transfer list (`soundTransferables`), each channel once.

## 5. The round's cues, map by map (`packages/viewer/src/roundCues.ts`)

The animation `objectives` of each `MP*.ZDB`'s `MZANIM.ZAR`, decoded with `decodeEffectProgram` (research 91 §2.1's
command numbers): the sequence `start` -- its opening up to its `WHILE` (the intro), and inside the loop the branches on
`aiteam_08 == 0` (the SEALs win) / `aiteam_00 == 0` (the Terrorists win) by `player_team` (0 SEAL, 8 Terrorist, 16
spectator) -- then `start2` (the respawn room's intro, where `respawn` runs it) and `mission_timer2` after its clock loop.
Every SOUND below carries flags 0x880 (`MUS_*`) or 0x80 (`^PH_*`). The page reads these at run time; the table is the
dev disc's, read 2026-10-02 (pinned by `viewer/test/roundCues.test.ts` on `SOCOM_DISC`).

| map | the script's other sequences | intro: wait; SEAL / Terrorist / spectator | SEALs win | Terrorists win | TIME EXPIRED (`mission_timer2`) |
|---|---|---|---|---|---|
| MP1 | bomb (`defuse`, `bomb_timer`) | 3; `SEAL_INTRO_2` / `TERR_INTRO_2` / `TERR_INTRO_2` | `^PH_0014`, 2, `SEAL_WIN_RUS` | `^PH_0002`, 2, `TERR_WIN_RUS` | none |
| MP2 | respawn | 5; `SEAL_INTRO_4` / `TERR_INTRO_4` / `SEAL_INTRO_4` | `^PH_0014`, `SEAL_WIN_RUS` | `^PH_0002`, `TERR_WIN_RUS` | `SEAL_WIN_RUS` |
| MP5 | respawn | 5; `INTRO_4` as MP2 | `^PH_0014`, `SEAL_WIN_BRA` | `^PH_0002`, `TERR_WIN_BRA` | `SEAL_WIN_BRA` |
| MP6 | hostages (`Rescue*`) | 5 (+2 the SEALs'); `SEAL_INTRO_5` / `TERR_INTRO_5` / `SEAL_INTRO_4` | `^PH_0014`, 2, `SEAL_WIN_ALG` | `^PH_0002`, 2, `TERR_WIN_ALG` | none |
| MP7 | bomb | 3; `INTRO_2` as MP1 | `^PH_0014`, 2, `SEAL_WIN_ALG` | `^PH_0002`, 2, `TERR_WIN_ALG` | none |
| MP8 | respawn | 5; `INTRO_4` as MP2 | `^PH_0014`, 2, `SEAL_WIN_ALG` | `^PH_0002`, 2, `TERR_WIN_ALG` | `SEAL_WIN_ALG` |
| MP9 | bomb | 3; `INTRO_2` as MP1 | `^PH_0014`, 2, `SEAL_WIN_BRA` | `^PH_0002`, 2, `TERR_WIN_BRA` | none |
| MP10 | hostages | as MP6 | `^PH_0014`, 2, `SEAL_WIN_BRA` | `^PH_0002`, 2, `TERR_WIN_BRA` | none |
| MP11 | hostages | as MP6 | `^PH_0014`, 2, `SEAL_WIN_BRA` | `^PH_0002`, 2, `TERR_WIN_BRA` | none |
| MP12 | bomb | 3; `INTRO_2` as MP1 | `^PH_0014`, 2, `SEAL_WIN_BRA` | `^PH_0002`, 2, `TERR_WIN_BRA` | none |
| MP51 | respawn | 5; `INTRO_4` as MP2 | `^PH_0014`, 2, `SEAL_WIN_ALB` | `^PH_0002`, 2, `TERR_WIN_ALB` | `SEAL_WIN_ALB` |
| MP52 | VIP (`escort_success`) | 5 (+2 the SEALs'); `SEAL_INTRO_3` / `TERR_INTRO_3` / `SEAL_INTRO_3` | `^PH_0014` (no music) | `^PH_0002`, `TERR_WIN_ALB` | none |
| MP53 | VIP | as MP52 | `^PH_0014` (no music) | `^PH_0002`, `TERR_WIN_ALB` | none |
| MP61 | breach (`breach_success`) | 5; `SEAL_INTRO_1` / `TERR_INTRO_1` / `TERR_INTRO_1` | `^PH_0014`, `SEAL_WIN_BRA` | `TERR_WIN_BRA` (no line) | none |
| MP62 | breach | as MP61 | `^PH_0014`, `SEAL_WIN_BRA` | `TERR_WIN_BRA` (no line) | none |
| MP64 | respawn | 5; `INTRO_4` as MP2 | `^PH_0014`, `SEAL_WIN_BRA` | `^PH_0002`, `TERR_WIN_BRA` | `SEAL_WIN_BRA` |
| MP71 | hostages | as MP6 | `^PH_0014`, 2, `SEAL_WIN_ALG` | `^PH_0002`, 2, `TERR_WIN_ALG` | none |
| MP72 | bomb | 3; `INTRO_2` as MP1 | `^PH_0014`, 2, `SEAL_WIN_ALG` | `^PH_0002`, 2, `TERR_WIN_ALG` | none |
| MP73 | breach | as MP61 | `^PH_0014`, `SEAL_WIN_ALG` | `TERR_WIN_ALG` (no line) | none |
| MP81 | respawn | 5; `INTRO_4` as MP2 | `^PH_0014`, 2, `SEAL_WIN_RUS` | `^PH_0002`, 2, `TERR_WIN_RUS` | `SEAL_WIN_RUS` |
| MP82 | VIP | as MP52 | `^PH_0014` (no music) | `^PH_0002`, `TERR_WIN_RUS` | none |
| MP83 | bomb | 3; `INTRO_2` as MP1 | `^PH_0014`, 2, `SEAL_WIN_RUS` | `^PH_0002`, 2, `TERR_WIN_RUS` | none |

(`MUS_MP_` dropped from the names; a number between two cues is a WAIT in seconds.) Every map has a branch for each
`player_team` (0, 8, 16) on each side's win, and on every map the three play the same cues: the line both sides hear. Chris's beta had
MP2's row only, which matches the disc (WAIT 5, `INTRO_4`, the spectator the SEALs', the line and the music at once).

- **Classic's time-out** (`mission_timer` -> `abort`) and the respawn room's result (`success2`) play nothing: a draw
  has no cue, and no line is spoken for a points winner -- Chris's `roundOver` trigger would have spoken one (the
  triage's challenge). `mission_timer2`'s cue is the SEALs' music on every map whoever leads; the page does not "fix" it.
- **The rooms** run SUPPRESSION's rules on every map (`OBJECTIVE_BY_MAP_PLACEHOLDER`, `net/rules.ts`), so a bomb, VIP,
  hostage or breach map's objective cues (`MUS_BOMB_PLANTED`, `^PH_0003`, `^PH_0050` ...) never fire; its elimination
  branches and its intro do, as its own script has them.
  Corrected (2026-10-04, PF-12): the rooms run each map's game type's watches and time-out (`modeRules`), and the page
  posts the map's own objective lines; the bomb, VIP and hostage objectives themselves are still not built (research 210).
- **The intro's clock** is the script's WAIT from the room's `roundStart`; the HUD posts "OBJECTIVE:" at 5.36 s (the
  Vigilance frames, `hud.ts` `ROUND_START`), the posting time of the same WAIT 5. A map's own wait differs (3 s on the bomb
  maps, 7 s for the SEALs on the hostage and VIP maps), which the HUD's fixed 5.36 does not follow.

## 6. `RoundAudio` (`packages/viewer/src/roundAudio.ts`, `roundAudioHost.ts`)

A pure module: events in -- `roundStart(team, respawn)`, `eliminated(winner, team)`, `timeExpired()`, `roundOver()`,
`reset()`, `setCues(cues)` (a map change) -- and calls out to a music player and a voice player passed in; the clock is
the caller's. Once a round: the first of `eliminated` / `timeExpired` / `roundOver` decides it. A new round, a reset and
a map change stop the slot and drop what is pending (the round is a new mission load). `RoundAudioHost` binds it to the
page's `GameAudio`. From Chris's `roundAudio.ts`: the once-a-round result, no cue for a draw, the bounded retry of a play
the locked page refused (`UNLOCK_RETRY_PLACEHOLDER`, now for the music too, which his dropped); his MP2-only music
names and his `roundOver` trigger are replaced by the script's (§5). The retry is the lock's only: `GameAudio`'s plays
say why one did not sound (`StreamPlay`), and an unknown name, the mute or an output without the slot is tried once, so
the stats count one drop a cue. The sound data can reach the page after the room's `roundStart` (the VAGSTORE reads and
the decode in the worker): the first cues of a map whose round has begun and is not decided schedule that round's intro
from its start; a step whose moment has passed when the data comes is not played late, one still to come plays at its
moment, and a result decided before the data is not played at all (`LATE_STREAM_DATA_READING`, §12; until 2026-10-02 a
cue up to the retry window late still played). The intro sounds at most once a round on the
module's own record (taken by the output, refused for good or let go): cues that go and come back in a round (data nulled
then set again) bring back an intro not yet heard, never one already played -- the guarantee does not rest on the page
nulling the data only on a map load (the review of 8d91abaa, finding 1).

## 7. The levels and the slot (`packages/viewer/src/audio.ts`)

- **The slot.** SOUND's flag 0x800 hands the play to `FUN_00348dc0` (D:L245383-245446) at priority 3; with the slot
  taken it fades the voice there -- `FUN_00346dd0(2.0, handle)`, AutoVol to 0 over 2.0 x 240 ticks (D:L244289-244307)
  -- and keeps the new cue pending; `FUN_003492b0` (D:L245541-245560) starts it once the slot's sound has stopped.
  `GameAudio.playMusic` models it: a cue while another sounds fades that one over `MUSIC_SLOT_HANDOVER_READING` and starts
  at its end; a free slot starts at once. On MP2 an elimination after the intro's 37.7 s needs no handover; one before
  it waits 2 s for the intro to fade -- which Chris's immediate replace did not. The line is not in the slot (flag 0x80).
  A cue while one waits on the handover overwrites the pending one (DAT_0048e0b0, D:L245424-245444, priority 3 on 3)
  and starts no second fade (`FUN_00346da0`): the replaced cue never sounds and the new one takes its start
  (`WebAudioOut` stops the waiting node before its start). A stop (a new round, a map change) stops the fading sound too.
- **The level** (`STREAM_LEVEL_READING`): the decoded PCM at full scale, the master's `LISTENING_GAIN_PLACEHOLDER` lift
  taken back out, the user's volume and mute applied. The lines and the music carry no `VOLUME` and play at the command's
  1.0, so on the disc they go at one level. **Chris's preferences, recorded and not ported (ruling INT.R7):** his
  `announcementGain.ts` (-2 dB on the line, "a user-requested browser mix adjustment") and his `duckMusic` (the music at
  0.25, -12 dB, for the line's length, then 50 ms back) -- a playtester heard the line too loud. Neither has an original
  behind it: the scripts play the line and the music back to back with no volume command. His line went through the
  master's x4 lift less 2 dB while his music was taken back to unity: the line some 10 dB over his music, which may be
  what the playtest heard. The console's relative mix -- 989snd's stream vol and pan, the VPK pairs, the groups' masters,
  the SPU voice's scale -- is PLAT-36's to measure (`PS2X_AUDIO_DUMP`, `tools_py/parity/audio_envelope.py`).

## 8. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `STREAM_LEVEL_READING` (`viewer/src/audio.ts`) (retired) | a stream's gain into the master | was the decoded PCM at full scale, unlifted (0.25), one level for all; now each stream at its group's level, `roundStreamGains` (`@s2u/sound`): a line (group 2, DIALOG 1.0, mono) 0.24995 a side, the music (group 1, MUSIC 0.74, stereo VPK) 0.27321 a channel -- research 186 §3.1 STREAM_LEVEL (STRONG; the tuners' groups disassembled, Harry62's saved masters). The pan table is 989SND.IRX's table 1 at 0x1c600 (`FUN_00019578`; floored, entry 90 = 11584), so the line is 8190 / 0x7ffe exactly | retired 2026-10-04 (PF-08) |
| `MUSIC_SLOT_HANDOVER_READING` (`viewer/src/audio.ts`) (retired) | when a slot cue starts after the one it replaces | was: the 2 s fade read, the stop not traced (§7). Settled by research 186 §3.1 (STRONG): the EE's timer stops the faded sound at 2.0 s (`FUN_00346ea0` -> StopSound, D:L244358-244385) and `FUN_003492b0` starts the pending cue; the fade is 989snd's AutoVol over 480 ticks, silent at 381 (1.588 s). Now `MUSIC_SLOT_HANDOVER_SECONDS` (2) with the stepped fade | retired 2026-10-04 (PF-09) |
| `UNLOCK_RETRY_PLACEHOLDER` (`viewer/src/roundAudio.ts`) | a cue the locked page refused: tried every 0.25 s for 5 s; a cue later than 5 s is not played | a browser adaptation (the autoplay rules); the console has no lock; Chris's values; only the lock is retried (§6) | open |
| `LATE_STREAM_DATA_READING` (`viewer/src/roundAudio.ts`) | a cue whose stream data reached the page after its moment | the console has no such case (the blocks load with the mission, a stream reads from the disc as it plays: §3), so no note establishes it; the conservative choice: not played late, a step still to come plays at its moment (§12). Settles it: the console's own start latency of the intro after the round's start (a PS2X audio dump or a capture, PLAT-36) | open |
| `ROUND_CUE_CONDITIONS_READING` (`viewer/src/roundCues.ts`) | an `IF`'s conditions all required, the elimination branches' `EXPRESSION` (command 43) true | the operators after the conditions are not decoded; the room decides the elimination (§5) | resolved, retired in web sprint 26 (PF-12): the operators are decoded and the conditions evaluated as `FUN_0025e960` does (`evaluateCondition`; research 179 s9.9, 210 s2); the 22 maps' cues are unchanged |
| `VPK_LOOP_READING` | a `LOOP` music cue's loop | `LOOP` under `ST` on 9 `SMUS` entries, beside it on 12 (§3); the loop point in a VPK is not read; none of the round's cues loops | *note only*: PLAT-22 |

The guards of §1-§2 (`VPK_MAX_CHANNEL_BYTES_GUARD`, `VPK_MAX_CHANNELS_GUARD`, `STREAM_RATE_GUARD`,
`VAGP_MAX_DATA_BYTES_GUARD`) are ours: bounds a header must keep to be decoded, not values the game uses.

## 9. The wiring (the controller's, at the merge)

*(Done 2026-10-02 by INT-AUDIO-WIRE, as written below with two differences: the page's frame runs the host, not
`main.ts`'s loop, and the late-data rule changed: §12.)* `netPage.ts` and `main.ts` are other streams'; INT-AUDIO adds
no line to them. What the merge adds:

- `main.ts`: `import { RoundAudioHost } from './roundAudioHost';` and, beside `const audio = gameAudio;`,
  `const roundAudio = new RoundAudioHost(audio);`; in the frame loop beside `audio.setListener(...)`, `roundAudio.frame();`;
  in the NetPage deps, `roundAudio`.
- `netPage.ts`: a dep `roundAudio?: Pick<RoundAudioHost, 'roundStart' | 'eliminated' | 'timeExpired' | 'roundOver' | 'reset'>`;
  in `event()`: `roundStart` -> `this.deps.roundAudio?.roundStart(this.client.role === 'player' ? this.client.team : null, this.rules === 'respawn')`;
  `eliminated` -> `this.deps.roundAudio?.eliminated(ev.winner, this.client.role === 'player' ? this.client.team : null)`;
  `timeExpired` -> `this.deps.roundAudio?.timeExpired()`; `roundOver` -> `this.deps.roundAudio?.roundOver()`;
  `abandoned` -> `this.deps.roundAudio?.reset()`; and in `close()`, `this.deps.roundAudio?.reset()`.
- Owed with the wiring (the plan's S4/S5 rows): NetPage tests -- `eliminated` / `roundOver` once a round, the intro once
  a round and cancelled by an elimination, a spectator given the SEALs' intro.

## 10. What is interim against PLAT-22

Done here: the VPK and VAGp decode (whole), a name to its member through `sounds.rdr` for any block, the round's cues
from every map's script, one music slot with its 2 s handover, a voice stream. Still PLAT-22's: ranged streaming (a
cue read and decoded as it plays, not 29 MB at the map's load), the stream voice's vol, pan and group
(`snd_PlayVAGStreamByLoc`'s arguments, the VPK pairs), looping (`VPK_LOOP_READING`), AutoVol fades beyond the slot's
handover (the game's `[handle, 0, 0x168|0x1e0, 2]` endings, KNOWN), `snd_StopVAGStream` on the level's end with a fade,
the front end's music (`MUS_MENU_THEME`, `MUS_ONLINE_MENU`: the same resolver serves them), and the proven level
(PLAT-36). The roadmap's PLAT-22 block said `MUS_` names are not in `sounds.rdr` and resolve in code: they are there by
hash (`SMUS`, R122.8; §3).

## 11. Not settled, and for later

- **For the PC side:** `snd989_mixer.cpp` 2247 starts a VPK's data at word 3 (0xb000) where the disc puts it at word 2
  (0x800) (§1): every music cue on the PC build may skip its first buffer and splice 0x800 bytes of the other channel into
  each buffer.
- **The server's hold** after an elimination, `ELIMINATED_HOLD_S` = 2 + 20 + 1 (`net/rules.ts`), is MP51's; MP2, MP5,
  MP64 and the breach and VIP maps have no WAIT 2 before the music (§5).
- What ends a slot sound faded to 0 (`MUSIC_SLOT_HANDOVER_READING`); +0x1c bit 4's key (group 6); the operators of an
  `IF` (`ROUND_CUE_CONDITIONS_READING`).
  Corrected (2026-10-04, PF-12): the operators are decoded and evaluated as `FUN_0025e960` does; the reading is retired
  (research 210 §2).
- `mapIndex.ts`'s note on VAGSTORE said nothing the walk plays is in it; the round's cues are, now (corrected there).
- **For the merge's ruling:** the plan's S5 row and the triage fire the intro from the HUD's objective-post clock (a
  fixed 5.36 s); this note schedules it from the script's own WAIT at `roundStart` (3, 5 or 7 s, §5), so on MP1, MP7,
  MP9, MP12, MP72 and MP83 the music comes 2.36 s before the text. The script is the source; the HUD's clock is ours.
- The slot's `WebAudioOut` models one pending cue (the last); `GameAudio`'s own `starts` / `ends` follow it.

## 12. Wired into the round (INT-AUDIO-WIRE, 2026-10-02)

**What is wired.** `main.ts` builds one `RoundAudioHost` on the page's `GameAudio` beside `const audio = gameAudio;` and
hands it to every match page's deps (`roundAudio`; the server's room and the offline loopback room alike). `NetPage`
passes the room's events to it as they arrive -- `roundStart` (the local side, null for a spectator, and whether the
room respawns), `eliminated` (the winner and the local side), `timeExpired`, `roundOver` -- resets it on `abandoned`
and on its close, and runs its `frame` once a page frame (Chris's beta ran his from the page's frame too). Pinned by
`viewer/test/netPageRoundAudio.test.ts` (no game data): the result on each outcome on Frostfire (the line and the
music at once) and Vigilance (the line, WAIT 2, the music), once a round, silent on a draw and on a respawn room's points
result, TIME EXPIRED's SEAL music with no line, nothing for a spectator who joins after the elimination (the room sends
`eliminated` once, to the pages there), the intro 5 s after the round's start by the local side (a spectator the
SEALs') and cancelled by an elimination before it is due, `start2`'s intro in a respawn room and `start`'s in a classic
one (cues that differ by hand: no dev-disc map's two differ), the late-data rule, and no cue with the audio off (no host,
or `GameAudio` muted: each cue tried once and counted as dropped).

**The intro's clock.** The plan's S5 row and the brief name the HUD's objective-post clock; the cue is scheduled from
the room's `roundStart` by the map's own WAIT (§5, §11): the script is the source. On the WAIT 5 maps the HUD posts at
5.36 s and the music starts at 5 s; on the bomb maps (WAIT 3) and the SEALs' side of the hostage and VIP maps (WAIT 5 +
2) the HUD's fixed 5.36 s does not follow the script, the music does.

**`LATE_STREAM_DATA_READING`.** The page's sound data can come after the room's `roundStart` (the VAGSTORE reads and
the decode in the worker; `RoundAudioHost` takes the map's cues up as `GameAudio` takes them: `main.ts` calls its
`dataChanged` when `setData` returns). The console has no late case: the map's load registers its sound blocks before its script runs (§3), and a
stream is read from the disc as it plays, so no note establishes what a late cue would do. The conservative choice is
taken: an intro step whose moment (the round's start plus the script's WAIT) has passed when the data is taken up is let
go, not played late; a step still to come plays at its moment; a result asked for before the data is not played when it
comes (the round is decided without it). The lock's retry (`UNLOCK_RETRY_PLACEHOLDER`) is unchanged for a cue that was
due with its data in. The moment is compared with the data's arrival (until the review's finding 3 of 2026-10-02 it was the
next frame's clock, so data landing within a frame before the moment missed it); the step then plays at the next frame. What would settle a tolerance: the console's own start latency of the intro after the round's
start (a PS2X audio dump or a capture of a round's start, PLAT-36). Its row: research 101 §4 (PLAT-22).

**What is not wired, or not settled.**
- **A page seated mid-round** (a welcome into a round in play, a promotion) gets no intro: no `roundStart` reaches it,
  and whether the original's late joiner runs `start` / `start2` from its own load is not read.
- **The levels** stay the disc's (§7, INT.R7): Chris's -2 dB and 12 dB duck are not applied (H48).
- **The ear.** No browser run with sound has been made of the wired round; that the cues sound right in a real round is
  the owner's to hear (HUMAN_TASKS H68).
- **The room's hold** after an elimination is still MP51's on every map (§11); the cue follows the map's script.
- PLAT-22's remainder (§10) is unchanged.

**In every view (AMB-1, 2026-11-07; the owner's word: "make sure the music is considered as well").** The match's
music is the `objectives` script's cues alone (R124.4, §5; reading): its branches test `player_team` and the sides'
`aiteam_*` counts, never the local player's life or the camera; no note records a death sting or a duck of the slot
on a death. The port matches: `RoundAudio` is fed by the room's events with `NetPage.localTeam()` (the seat's
role and side, the same alive, dead, benched or a ghost; null for a spectator) and runs its `frame` from `NetPage.frame`
in every view; the slot stops only at a round's start, a reset (a close, the level left, a round screen's first frame,
OBF-31's `ROUND_SCREENS_STOP_ALL_READING`), a map change; nothing in the spectator's cycle, the walk's mode or the
camera touches it. The blast's duck (research 202, `BLAST_DUCK_GROUPS`, group 1 the music's among them) is the room's
`blast` event's, not a death's. Pinned per view by `viewer/test/ambienceViews.test.ts` (the slot keeps its cue through
every view, a cue played while a teammate is watched sounds). No capture of the original's music while dead exists.
