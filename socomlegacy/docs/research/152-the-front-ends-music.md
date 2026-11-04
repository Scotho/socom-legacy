# 152 -- The front end's music: which screens stream it, the play's words, its level and loop, the page (MENU-MUSIC)

Written 2026-10-03 for MENU-MUSIC, PLAT-22's front-end half (`../roadmap/01-platform.md` "PLAT-22", its 2026-10-02
correction; the online-path plan `../plans/2026-10-02-online-path-target.md`, OT.R8: the menu's music "owed, not
blocking", asked for by the owner on 2026-10-03). Sources: the disc's dialogs and zAnim sets (`RUN/UI/READERC.ZAR`,
`RUN/UIZANIM.ZAR`, `EXTZANIM.ZAR`, `MPZANIM.ZAR`) read with `tools/dump-dialogs.ts --dialog` and `@s2u/scene`'s
`decodeUiProgram` (every animation's ops scanned for a `SOUND` of a `MUS_` name and for `VagStreaming`, 2026-10-03;
decoded data, RS.R8); `RUN/SOUNDRDR.ZAR`'s `sounds.rdr` through `@s2u/sound`'s `UiSoundTable`; `RUN/SOUNDS/VAGSTORE.ZAR`
read by range; the retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its
line, `FUN_<addr>` its functions; cited, never pasted); the retail ELF's instructions where the decompiler drops a
call's stack words (`game/disc/socom2_game.elf`, disassembled by address); the 989snd reference
(`research/989snd-ziemas/iop/`, `stream.c`, `vol.c`, `sndhand.c`); the desktop's mixer
(`desktop@be557831:third_party/ps2recomp/ps2xRuntime/src/lib/snd989_mixer.cpp`, the submodule's pin, read in
`SOCOM_PC_ROOT`'s identical copy); the recomp's 989snd log of the online path (`$SOCOM_PC_ROOT/logs/parity/s17_a1_lobby_fix/run.log`,
2026-09-29: boot, main menu, ONLINE, LOGIN to SOCOM II ONLINE; lines 155-163, 248, 565, 633, 696, 1197-1200) and the
retail image's file table (`$SOCOM_PC_ROOT/tools_py/iso_lbn.py <image> list`). It stands on research 81 (the banks and
the ADPCM), 106-107 (the runtime and the command table), 122 (the UI sounds: the table, the `SOUND` command), 124 (the
round's streams: the VPK, the resolver), 128 (the online dialogs) and 138 (dlgMenu's commands), and does not restate
them.

The code: `packages/sound/src/musicStream.ts` (the play's words, the level, `VpkStreamReader`), `packages/sound/src/vag.ts`
(the carried history), `packages/sound/src/script.ts` (`MUS` found depth-first), `packages/ui/src/sounds/uiSoundCues.ts`
(the stream play's pan and name slot), `packages/viewer/src/menuMusic.ts` (the page's streamer),
`packages/viewer/src/uiSoundHost.ts` and `packages/viewer/src/frontEnd.ts` (the connecting lines; `frontEnd.ts` claimed
in HANDOFF §3). The tests: `packages/sound/test/musicStream.test.ts` (CI), `musicStreamDisc.test.ts` (dev disc),
`packages/ui/test/sounds/menuMusic.test.ts` (CI), `menuMusicDisc.test.ts` (dev disc: the screens' starts and exits over
the disc's scripts), `packages/viewer/test/menuMusic.test.ts` (CI, and a dev-disc session on SOCOM II ONLINE),
`packages/viewer/e2e/menuMusic.spec.ts` (a rendered browser run). Confidence: **reading, pending review** for every
transcription; R152.4's words also equal a line of the recomp's 989snd log (the original's code on the desktop's
runtime), which is evidence toward the proven level, not the proven level (PLAT-36 holds that: §8).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R152.1 | **The main menu streams no music: its sound is MENULOOP's own track.** `MUS_MENU_THEME` is played in `dlgMenu.rdr`'s set only by `CallMusicPressDemo` (`VagStreaming(OFF)`, `RebootIOP`, `VagStreaming(ON)`, `SOUND MUS_MENU_THEME` 0x80), which none of dlgMenu's 38 bindings names and no animation of the three zAnim archives calls. The recomp's run on the online path logs no `snd_PlayVAGStreamByLoc` from the boot through the main menu, LOGIN, DNAS and SELECT UNIVERSE; its one stream starts when SOCOM II ONLINE opens. PLAT-22's unknown "`MUS_MENU_THEME` versus the MENULOOP PCM" is answered at the reading level: the PCM alone | `menuMusicDisc.test.ts`, `menuMusic.spec.ts` | §1 |
| R152.2 | **`MUS_ONLINE_MENU` is the online screens' and OPTIONS' music**: `dlgWorldOfSOCOM` `CallMusic` (ONSTART: unless `StartMusic` == 1, `VagStreaming(ON)` then `SOUND` 0x80), `dlgMPBriefingRoom` and `dlgLANBriefingRoom` `CallMusic` (when `StartMusic` == 0), `dlgOptions_Menu` `Call_Music` (ONSTART: unless `BeenPastOptions` == 1, `RebootIOP`, WAIT 0.25, ON, `SOUND`). LOGIN, DNAS and SELECT UNIVERSE play none (`dlgMPswitch`'s `StopStreaming` turns streaming off on the way in). `MUS_MENU_THEME` is the campaign's front end's (`dlgMissionSelection` `CallMusic`, `Common_AOP_Anim` `SetRankLevel`), off the path under R1 | `menuMusicDisc.test.ts` | §1 |
| R152.3 | **The names resolve by CRC-32 to SMUS's looped `MUS` entries**: `MUS_MENU_THEME` `MUUI0001` (SMUS #5), `MUS_ONLINE_MENU` `MUUI0003` (#6), both `LOOP` and `MUS` inside `ST` -- `MUUI0001.vpk` 4,552,704 bytes (2,253,664 a channel, 123.247 s a pass), `MUUI0003.vpk` 6,895,616 (3,446,240, 188.466 s); each 0x800 / 0xb000 / 32000 Hz / 2 channels, vol/pan (127, 270) and (127, 90). The map path's resolver (`parseStreamEntries`) looked for `MUS` at the entry's top level only and named the eight front-end entries `.VAG` (research 122 §13's drift): fixed, `MUS` found depth-first; SMUS has 211 of the class | `musicStreamDisc.test.ts` | §2 |
| R152.4 | **The play's eight words for `MUS_ONLINE_MENU` are `[sector, 0, 0x04000000, 0xffff0000, 1, 0, 0, 4]`** -- the volume word 0x400 (1.0), pan -1, group 1, queue 0, sub-group 0 and flags 4, the loop -- the last two read off the ELF (the decompiler drops them). With VAGSTORE at sector 0xee801 of the retail image, MUUI0003.vpk is sector 0x1303f8 + 0: the recomp's logged play when SOCOM II ONLINE opened, word for word | `musicStream.test.ts`, `musicStreamDisc.test.ts` | §3 |
| R152.5 | **The level is the music group's square law at `MUSIC_VOLUME`**: the group's master is `(int)(MUSIC_VOLUME x 1024)` (`FUN_0038a040` -> `FUN_003414d0`), 0x2f5 at the default 0.74 (the log's `SetMasterVolume [1, 0x2f5]`); a stereo VPK is the IRX's voice pair (left data hard left, right data hard right); each side's level is `voiceLevel(0x7ffe, 0x2f5)` = 8952 of 0x7ffe -- 0.2732 of a sample, against 0.49998 at a full master (-5.25 dB) | `musicStream.test.ts` | §4 |
| R152.6 | **The member is read a buffer (0xb000) at a time by range, each channel decoded with its ADPCM history carried; the result equals the whole member's decode, sample for sample, on both members; with flags 4 the read starts again at the data's top, the history carried** | `musicStreamDisc.test.ts` | §5 |
| R152.7 | **The screens' exits stop their music by their own scripts**: `StopAllSounds` and `VagStreaming(OFF)` (`Goto_Options`, `exit_lobby`, `OnMultiplayerDisconnect`, `Triangle_Back`, `BackOutToMainMenu`), `FadeAllSounds` then OFF (`check_then_save_and_leave`, `UiAttractMode`, `FadeMusic`). A switch that does neither keeps the stream (OPTIONS to AUDIO OPTIONS: the slider's preview). A new play in a name slot stops that slot's voice first (D:L112451-112455) | `menuMusicDisc.test.ts`, `menuMusic.test.ts` | §1, §6 |
| R152.8 | **A contradiction recorded, not settled**: KNOWN [lobby-music-once]'s pre-fix run played the lobby stream (MUUI0003) for 94.2 s (`start frame=6234240`, `done frame=10756800`, 48 kHz) where its data is 188.466 s at 32 kHz -- half. The decode here equals research 124's; the console's capture of SOCOM II ONLINE (PLAT-36) settles which is heard | -- | §5 |
| R152.9 | **The page plays it**: at `menuflow=dlgWorldOfSOCOM.rdr`, after a gesture, MUUI0003.VPK from the served tree's VAGSTORE by range, at 0.2732 a side, scheduled 2 s ahead, no underrun; moved 2 s before its end by the test instrument, it wraps and plays on. At `menuflow=dlgMenu.rdr` no stream starts and MENULOOP's track plays (5,951,744 frames) | `menuMusic.spec.ts` | §6 |

## 1. The scripts (R152.1, R152.2, R152.7)

Every animation of the three archives whose ops `SOUND` a `MUS_` name (scanned 2026-10-03): `dlgMenu.rdr`
`CallMusicPressDemo` (`MUS_MENU_THEME`), `dlgMissionSelection.rdr` `CallMusic` and `CallMusicOld` (`MUS_MENU_THEME`),
`Common_AOP_Anim.rdr` `SetRankLevel` (`MUS_MENU_THEME`), `Common_Brief_Anims.rdr` `CallMusic` (`MUS_ARMORY`),
`dlgWorldOfSOCOM.rdr`, `dlgMPBriefingRoom.rdr` and `dlgLANBriefingRoom.rdr` `CallMusic`, `dlgOptions_Menu.rdr`
`Call_Music` (`MUS_ONLINE_MENU`), `dlgNetUnlockableExtras.rdr` `PlayMusic` (`MUS_JUKE_*`), `dlgGameComplete.rdr`
`ReplayOptions` and EXTZANIM's `dlgExitState.rdr` `ExitOnStart` (`MUS_SUCCESS`, `MUS_FAILURE`). Every one of them
carries flags 0x80 (a new play, unplaced, volume 1.0, pan -1).

`dlgMenu`'s bindings (research 138 §1, 38 of them: five ONSTART, MEMCARD_ERROR, the six buttons' CROSS and four
directions, the list's CROSS and TRIANGLE) name `PulseArrows`, `UiStopAttract`, `SetMenuValve`, `has_memcard_changed`,
`CleanupMissionMemory`, `handle_memcard_error` and the buttons' own; none names `CallMusicPressDemo`, and no `CALL` /
start of an animation in any set names it. Its name ("press demo") suggests a leftover of a press build; that is a
guess and is not used. The menu's only sound beside the HUDUI cues is the background MPEG's track (PLAT-20, research
137: MENULOOP, 123.995 s a pass, looped by the ring). The recomp's log agrees (R152.1): at the boot (t 6.52 s,
`dlgIntroCinematic` `TurnOffVagStream`) `snd_StopAllVAGStreams`; the main menu (t ~19-29 s) plays none; ONLINE (29.09)
-> `dlgMPswitch` `StopStreaming` (`snd_StopAllVAGStreams`, 30.34); the login screens none; the EULA's CROSS (85.26) ->
`dlgWorldOfSOCOM` (86.52): `snd_InitVAGStreamingEx [4, 0xb000, 0, 1]` then the play of §3.

The `menuMusicDisc.test.ts` walk holds these orders over the disc's scripts: `dlgMenu` for 5 s: nothing;
`dlgWorldOfSOCOM`: `streaming true`, `stream MUS_ONLINE_MENU MUUI0003.VPK vol 1024 pan -1 loop true`, then
`Goto_Options`: `stopAll`, `streaming false`; `dlgOptions_Menu`: `RebootIOP`, 7+ ticks (WAIT 0.25), `streaming true`,
the stream, then `Triangle_Back` (nothing changed: no popup): `stopAll`, `streaming false`, and `dlgMenu` starting none.

## 2. The names and the cue (R152.3)

The menu init's table (`FUN_001f4860`, research 122 §1) holds SMUS; `MUS_MENU_THEME` and `MUS_ONLINE_MENU` hash
(`FUN_003a2370`) to SMUS entries whose `ST` holds `N1`, `LOOP` and `MUS`. `FUN_003435c0` (D:L242308-242554) finds `MUS`
depth-first (`FUN_0032f0d0`, D:L230210-230299) -- the class 2 at +0x1d -- and `LOOP` inside `ST` sets +0x1d bit 1
(D:L242468-242471, the key at ELF 0x3f77c0). `FUN_00342240` formats the member `"%s.VPK"` for class 2 (ELF 0x3f76e8,
D:L241827), `"%s.VAG"` else (0x3f76f0, D:L241830): `streamMember`.

The `SOUND` command (`FUN_002659c0`, D:L112317-112513) hands a 0x80 play to the object's play (vtable +0x18,
`FUN_00343140` D:L242173-242254) with the command's volume (1.0 without 0x10) and pan (-1 without 0x20), and keeps
the play's handle in the set's record of the name (`FUN_0026e7c0(DAT_00414be8, byte +6)`, D:L112350-112352); a new
play first stops the handle that record holds (D:L112451-112455). PLAT-23's stream play now carries the pan and that
slot (`streamNameSlot`, keyed by the animation and the name: `STREAM_NAME_SLOT_READING`, §7).

## 3. The play's words (R152.4)

`FUN_00343140` sends a streamed entry to `FUN_00342240(object, (int)(volume x 1024 x VOLUME x 1.0), pan, handle, 0)`
(D:L242232-242233). `FUN_00342240` (D:L241795-241906) finds the member in the stream table (`FUN_0034d480`,
D:L241832) and its place: the archive's first sector (`FUN_0034d470`, D:L241836) plus the offset `>> 11`, the low 11
bits apart (D:L241837-241839): `vagStreamLoc`. The group (D:L241878-241889): class 2 (`MUS`) 1, else +0x1c bit 4
(`HQ`) 6, else class 3 2, else 0. It calls `FUN_0033f580(loc1, loc2, off1, off2, vol, pan, group, 0)` (D:L241895),
which packs `snd_PlayVAGStreamByLoc` (fno 0x2c, D:L240110-240138): `{loc1, loc2, off1 | vol << 16, off2 | pan << 16,
vol_group, queue, sub_group, flags}` -- 989snd's own names (`stream.c`, `snd_PlayVAGStreamByLocEx`); the roadmap's
"parent, priority" for words 6-7 are those two.

The ninth and tenth arguments are stack words the decompiler does not show. The ELF's instructions (0x3425e0-0x34261c):
`sd zero, 0(sp)` -- the sub-group 0; `sd s4, 8(sp)` -- the flags. `s4` is built at 0x342548-0x34257c: 0, or-ed with 4
when +0x1d bit 1 (`LOOP`) is set, and with 2 when the fifth argument (`fp`, from `t0`) is non-zero and +0x1c bit 3
(`HS`) is clear. `FUN_00343140` passes 0, so the menus' plays carry 4 or 0. (The two words after, 0x346300 and the
handle, are `FUN_0033f580`'s eleventh and twelfth, the call's own.)

The recomp's log line 1200, when SOCOM II ONLINE opened: `snd_PlayVAGStreamByLoc (fno 0x2c) [0x001303f8, 0x00000000,
0x04000000, 0xffff0000, 0x00000001, 0x00000000, 0x00000000, 0x00000004]`, and the runtime's own line beside it,
`sector 1303f8+0 looping playing`. `iso_lbn.py` puts `/RUN/SOUNDS/VAGSTORE.ZAR` at sector 0xee801 of the retail
image; 0x1303f8 - 0xee801 = 269,303 sectors = 551,532,544 bytes, which is MUUI0003.vpk's offset in the archive
exactly. `vagStreamPlayWords` over the disc's member gives those eight words (`musicStreamDisc.test.ts`). MUUI0001
would be sector 0x12fb49 + 0; no line of that run names it.

## 4. The level (R152.5)

- **The music group's master.** `InitSystemTuners` (`FUN_0038a7a0`, D:L282238-282473; research 104 R104.10) binds
  `MUSIC_VOLUME` to a tuner whose update (vtable 0x408030 +0xc = `FUN_0038a040`, no decompiled block: `jal 0x3414d0`
  with `a0 = 1` at 0x38a088) is `FUN_003414d0(value, 1)` = `SetMasterVolume(1, (int)(value x 1024))`
  (D:L241281-241290); the default 0.74 (f32 0x3f3d70a4) gives 0x2f5, the log's `snd_SetMasterVolume [1, 0x2f5]`
  (lines 160, 202, 644). Group 16, under every group, is 0x400 (`FUN_00345170`, D:L243288).
- **The pair.** 989snd's stream engine is signatures only in the reference; the desktop read the IRX's stream start
  (`FUN_000152fc`, `FUN_00016898`): a stereo VPK plays as a voice pair, the left data at pan 270 + the play's and the
  right at the same volumes swapped (desktop `snd989_mixer.cpp` 181-196). With pan -1 (= 0) the left data is hard left
  and the right hard right.
- **The square law.** `snd_AdjustVolToGroup` (`vol.c` 434-455): the 14-bit volume times the group's master over 0x400,
  squared over 0x7ffe, then the SPU's half scale -- `./render`'s `voiceLevel`, the arithmetic the menus' bank sounds
  already take. At the play's 0x400 (7-bit 127: `STREAM_VOLUME_SCALE_READING`) and 0x2f5: 32766 x 757 / 1024 = 24222,
  squared / 32766 = 17905, halved 8952; over 0x7ffe, 0.27321 a sample (`streamVoiceGains`). Half the master is a
  quarter of the level (the test holds it).
- **The fade.** `FadeAllSounds` (`FUN_00277910` -> `FUN_00346c30`, D:L244210-244241) sends `SL_AUTOVOL_A` to 0 over
  0x168 = 360 ticks (1.5 s at 240 Hz, `delta_from` 2: a plain ramp; D:L244232) to every handle play. The handle's
  7-bit volume steps 1 every 2 ticks, silent at tick 254 (1.058 s; research 186 §3.1, `autoVolSteps`; was read as a
  linear ramp, `AUTOVOL_STEP_READING`, retired); the level falls by the square (`streamFadeCurve`); the stream
  plays on at 0 until `VagStreaming(OFF)` or `StopAllSounds`.

What the console's mix makes of 0.2732 against MENULOOP's track and the HUDUI cues is the page's (`WebAudioOut`'s
master, `LISTENING_GAIN_PLACEHOLDER`) as for every sound of it; the relative level is PLAT-36's to measure.

## 5. The data and the loop (R152.6, R152.8)

`VpkStreamReader` reads the header (0x20 bytes), then buffer *k* at `data_offset + k x buff_size`, each channel's
`buff_size / 2` share (the last buffer short, research 124 §1), decoding each share with `decodeVag` and that
channel's history (`VagHistory`, carried across buffers as one SPU voice plays its channel). Over both members on the
dev disc the 101 and 153 buffers decode to the same samples as `decodeVpk` of the member whole -- 0 differing
(`musicStreamDisc.test.ts`); no read is longer than 0xb000. With the loop the read after the last buffer is buffer 0
again, the history carried (`STREAM_LOOP_HISTORY_READING`; KNOWN [lobby-music-once]: the IRX's `FUN_0000f7e0` sets the
stream's 0x400 from flags 4, `FUN_0001107c` re-arms it at its data's top through `FUN_0001446c`).

Not met: the block's "sample-exact against the Python VPK decoder" -- no Python VPK decoder is in
`$SOCOM_PC_ROOT/tools_py` on this host (searched 2026-10-03: `tools_py` names VPK only in its music-state poller); the
comparison is with research 124's `decodeVpk` (reading).

R152.8: the 94.2 s of KNOWN [lobby-music-once] (the run of 2026-09-29 13:39Z, before the loop fix) against 188.466 s
here is a factor of 2.000. Settled by the review (2026-10-03): the desktop's reader. `snd989_mixer.cpp:2235`
(desktop be557831) takes `dataSize` from the VPK header's word 4, the PER-CHANNEL byte count (the file proves it:
MUUI0003 is 0x800 + 153 x 0xb000 = 6,895,616 bytes = the header + 2 x 3,446,240 + padding; a total-bytes reading
would leave half the file unused), yet its lines 467-480 count BOTH channels' consumption against it
(`remaining = dataSize - consumed`, `perChannel = remaining / channels`), so that runtime ended the stream at half
the data: (10,756,800 - 6,234,240) / 48,000 = 94.22 s against 188.466 / 2 = 94.23 s. The IRX and the data are not
the cause; the page's reader (a per-channel stride, `channelBytes` a channel, 0 samples differing from `decodeVpk`)
is the right one. The header itself, read off `RUN/SOUNDS/VAGSTORE.ZAR` at byte 551,532,544 (2026-10-04): `' KPV'`,
0x3495e0 (3,446,240, the per-channel bytes), 0x800, 0xb000, 0x7d00 (32,000 Hz), 2 channels, 0x10e007f and 0x5a007f
(the volume and pan pairs); 3,446,240 / 16 x 28 = 6,030,920 samples at 32 kHz = 188.47 s. For the desktop seat: since its loop fix the lobby music wraps mid-track at 94 s (sent to that
session 2026-10-03). The ear on the console (PLAT-36) still confirms the length.

## 6. The page (R152.9)

`packages/viewer/src/menuMusic.ts`'s `MenuMusic`, made by `mountFrontEnd` over the front end's own `WebAudioOut` and
the page's `AssetSource`, and handed to PLAT-23's host (`pageUiSounds(..., { music })`): a `MUS` stream play goes to
it, `VagStreaming` turns its plays on and off (OFF stops every stream; a play while off is refused:
`STREAM_OFF_PLAY_READING`), `StopAllSounds` stops every stream, `FadeAllSounds` fades each. It reads VAGSTORE's index
once (the head, then the string table and key tree), then the member a buffer at a time through `readRange` (the served
tree's `HttpAssetSource`, the visitor's image's `IsoAssetSource`) or, where a source has only `stream`, over that extent;
a source with neither is refused, never read whole. Each decoded buffer is mixed through the pair and scheduled on the
output's clock back to back, `MENU_MUSIC_LEAD_SECONDS_ADAPTATION` (2 s) ahead, the lead read before the first piece.
`MUSIC_VOLUME` is read from the session's UI variables at each play (0.74 when the session holds none: the front end does
not run `InitSystemTuners` yet). The window hook `__frontEnd.music` gives its stats and `skip(seconds)`, a test
instrument that moves each stream's read near its end (its history zeroed; not the original's).

Two browser adaptations, labelled in the code: the lead (the IRX double-buffers into SPU memory; the page schedules
ahead), and the gesture (`MENU_MUSIC_GESTURE_ADAPTATION`: a stream played before the page's first gesture waits and
starts from its top when the output runs; the console's would have been playing since the screen opened -- HUMAN_TASKS
H74's default for the movies is the model).

The rendered run (`menuMusic.spec.ts`, Chromium headless, E2E_PORT 5410, the served tree a copy of `wt-online`'s,
2026-10-03): at `menuflow=dlgWorldOfSOCOM.rdr` after a key and a click, `MUS_ONLINE_MENU`, `MUUI0003.VPK`, playing from
output time 0.11 s, gains (0.27321, 0) / (0, 0.27321), words `[269303, 0, 0x04000000, 0xffff0000, 1, 0, 0, 4]` (the
sector counted from VAGSTORE's first: the served tree has no disc sectors), 2 buffers (2.464 s) then 4 (4.928 s) 3 s
later, 0 underruns; after `skip(2)`, 1 wrap, 11 buffers, 13.52 s scheduled, still playing, no error. At
`menuflow=dlgMenu.rdr`: no stream play (`plays` 0, `streams` []), `streamingOn` false; MENULOOP's track read whole
(5,951,744 frames), started 0.27 s, 123 voices. The first run, before the lead was read ahead, logged 1 underrun at the
start (a gap): fixed, and held by a unit test. That the stream is heard as the console's is the owner's ear: a rendered
run measures what was scheduled, not what is heard.

## 7. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `STREAM_VOLUME_SCALE_READING` (`packages/sound/src/musicStream.ts`) | `min(127, 127 x vol >> 10)` | the play's volume word to the handle's 7-bit volume, as the desktop reads the IRX's stream start (`snd989_mixer.cpp` 2273); `stream.c` is signatures only; at the menus' 0x400 it is 127 either way | the IRX's `snd_PlayVAGStreamByLocEx` read, or a capture at another volume (PLAT-36) |
| `STREAM_LOOP_HISTORY_READING` (`packages/sound/src/musicStream.ts`) | carried | the ADPCM history at the loop's wrap, from KNOWN [lobby-music-once]'s reading of the IRX's re-arm | a capture of the wrap (PLAT-36: `PS2X_AUDIO_DUMP` on the console's side) |
| `AUTOVOL_STEP_READING` (`packages/sound/src/musicStream.ts`) (retired) | was linear, truncated; now 989snd's steps (`autoVolSteps`) | `FadeAllSounds`' AutoVol stepping of the 7-bit volume | settled by research 186 §3.1 (a reading, pending review; V4 #24): `autovol.c` compared tick for tick -- a change under the ticks steps 1 every trunc(ticks / \|dv\|) ticks, so 127 -> 0 over 360 ticks is silent at tick 254 (1.058 s), not 1.5 s -- retired 2026-10-04 (PF-09) |
| `STREAM_NAME_SLOT_READING` (`packages/ui/src/sounds/uiSoundCues.ts`) | the animation and the name | the slot is the set's record of the name (D:L112350-112352); the runtime's command names its animation, not its set | the runtime handing the set (PLAT-07's). One case on the disc where the two keys differ: `dlgMissionSelection.rdr`'s set has `CallMusic` and `CallMusicOld`, both playing `MUS_MENU_THEME` -- the console's record of the name makes the second play stop the first, keyed by animation and name the page would run both; nothing calls `CallMusicOld` and the screen is the campaign's (R1), so no path reaches it (the review, 2026-10-03) |
| `STREAM_OFF_PLAY_READING` (`packages/viewer/src/menuMusic.ts`) | refused | a play after `VagStreaming(OFF)` has no stream channel (`FUN_00344f80` D:L243213-243235 tears the streamer down, `DAT_0048dd98` 0); 989snd's answer not in the reference | the IRX's play read with no channel, or the recomp's log of such a play |

## 8. Settled, not settled, owed

Owed from the review (2026-10-03): the disc test `packages/sound/test/musicStreamDisc.test.ts` asserts the wrap's
index, flag and passes only; the ADPCM history carried across the wrap is held by the synthetic test alone
(`musicStream.test.ts` 220-232) -- a disc-side assertion of the carry at MUUI0003's wrap is owed.

- Settled at the reading level: which screens stream which music and when (R152.1, R152.2: the main menu none); the
  names to their members (R152.3); the play's eight words (R152.4, also equal to the recomp's logged line); the
  level's arithmetic (R152.5); the ranged decode (R152.6); the exits' stops (R152.7).
- Not settled: R152.8's factor of 2 in the PC runtime's old pass; the readings of §7; the IRX's limit of two stereo
  streams (`snd_InitVAGStreamingEx(4, ...)`: four channels) and `PRIORITY`'s queue (`FUN_00343140` D:L242225-242231),
  neither modelled -- no front-end screen plays two music streams at once.
- Owed to PLAT-22's proven level (PLAT-36): the recomp's 989snd stream log per screen held by a test against these
  words (the main menu none, SOCOM II ONLINE and OPTIONS `MUUI0003`), and the envelope of the console's capture
  (`tools_py/parity/audio_envelope.py`) against the page's; the owner's ear is the acceptance until then (a
  HUMAN_TASKS row is the controller's to write). Owed elsewhere: the live update of the music group's master when the
  AUDIO OPTIONS slider moves `MUSIC_VOLUME` (the tuner's watcher; the page reads the variable at each play), and
  `InitSystemTuners` on the page (the front end's `StartEngine`); UIVOICE's voice streams and the headset queue (the
  audio options' task); the campaign's `MUS_MENU_THEME` and `MUS_ARMORY` screens (parked, R1); the review that
  re-reads every cited line.
