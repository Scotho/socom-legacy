# 375 -- r0004's VOICE MODULATION: OFF at boot, `VoiceMask` read back, re-applied at the online round reset (R4B-02, G18)

- Date: 2026-11-01. Task R4B-02 of the [r0004 plan](../plans/r0004-option-b.md), under the owner's ruling OT.R97
  (MISSION: r0004 is the specification for gameplay and front-end behaviour). Branch `agent/r4b-02`.
- Track: simulation. It changes what the game does: the START menu's VOICE MODULATION at boot, what an options store
  does to it, and when the talker's encoder is told it.
- Status: **reading, pending review** (R4B.R3). Nothing here is measured running. The r0004 addresses are transcribed
  from the r0004 investigation's cluster note, which disassembled the r0004 overlay (capstone) and spot-checked the
  served ELF at the toggle and the store; this note's author re-read the voice tick's two hold-off sites (§5) in
  `game/overlays_r0004/socom2_game_r0004.elf` only. A reviewer who did not write it re-reads every cited r0004 address in
  the PINE dump and in the pristine served decrypt `game/r0004/served/*.bin` (R4B.R4) before it counts as a reading.
  dot's adversarial review corroborated r0001's 0x3df1a8 = 1 and the r0004 `VoiceMask` lookup and store at
  0x27cc68-0x27cdc4; the initial zero, the round behaviour, the channel and the timing were not independently proved
  (`agent-mail/evidence/r0004-dot/r0004-consolidated-adversarial.md`, G18).
- Sources: `C:/Projects/agent-mail/evidence/r0004-investigation/cluster-voice-mod-default-off.md` (sections 1-3, 5),
  `cluster-voice-codec-rebuild.md` (section 5, the voice wrappers), REPORT.md row G18 and its corrections at its foot.
  r0001 is cited `FUN_<addr>` / `D:L<line>` of `game/analysis/socom2_game.elf.decomp.c`. No decompiled or disassembled
  text is pasted.

## 1. What r0004 does, and what r0001 did

| | r0001 (the disc) | r0004 |
|---|---|---|
| the flag | `DAT_003df1a8`, 1 in the ELF's .data | r4 0x450890, in the overlay's .bss: 0 at load (the toggle's code at the same r4 0x204770-0x20481c, its operands moved) |
| `UIStoreOptions` | `FUN_0027b960` (D:L125113 onward) never reads `VoiceMask` | r4 `FUN_0027cb40`: `VoiceMask` found or made (r4 0x27cc68-0x27cc74, `FUN_0036f620(key, 2)`), then flag = `VoiceMask != 0` (r4 0x27cdb0-0x27cdc4) |
| a fresh card | ON | OFF: `global_valves.rdr` (`RUN/READERC.ZAR`) holds `VoiceMask` at 0, PERSIST |
| the choice after a reboot | ON again (the card's `VoiceMask` is written, never read into the flag) | the card's: restored by the store |
| the START toggle | `FUN_002041e0` case 4 (D:L61722-61746): flip, write `VoiceMask` where held (`FUN_00351ef0`), `FUN_0030e5a0(voice, flag == 0)` | the same, relocated |
| round start, a player | D:L55851-55854: `FUN_0030e5a0(voice, flag == 0)` when `FUN_002c2fa0()` is 0 | the same |
| online round reset | `FUN_002a7d40`'s online branch (`DAT_0045a0c1`) calls `FUN_001fb790` / `FUN_001fb420` (D:L149755-149758); no mask | r4 `FUN_002a94f0`: after the same two calls, `FUN_0030e5a0(voice, flag == 0)` at r4 0x2a98c8-0x2a98e0 (setter r4 0x32bb20), **no spectator test** |

`global_valves.rdr`'s row is read through the repository's readers (`./originalOptions` `readGlobalValves`); the
dev-disc case in `viewer/test/startMenu.test.ts` holds `VoiceMask` 0, PERSIST, on the disc (one row).

## 2. The port

- `viewer/src/startMenu.ts`: `VOICE_MODULATION_INITIAL_READING` (false) is `createStartMenuPage`'s flag, so the page's
  own (`START_MENU_PAGE`) starts OFF. `storeVoiceModulation(page, value)` is r0004's store block: the flag set to
  `VoiceMask != 0`, a store with no `VoiceMask` taking `VOICE_MASK_VALVE_DEFAULT` (0, the table's row). The toggle is
  unchanged (it already writes `VoiceMask` find-only, D:L61722-61746), so the next store keeps the choice.
- Where the port runs `StoreOptions`: the front end's session binds its options store to the page
  (`FrontEndSession`'s `startMenuPage`, passed `START_MENU_PAGE` by the page's own front end -- the boot's store after
  the card's `CValveSaveManager` module is restored, and every later one), as OPT-14 binds the controller configs; a
  session without it (a development instrument's) writes nothing. `/testroom`, which runs no front end, stores at its
  card read (`./matchOptions` `pageCardPlayOptions` -> `storeCardVoiceModulation`), as it stores the controller config.
- `StartMenu.levelStart` (the review's P2) is the round-start mask site as the page's own level load runs it (r4
  0x1f6850, r0001 `FUN_001f6660` D:L55851-55854: the flag told for a player, nothing for a spectator): the front end's
  match calls it at its mount (`matchMount.ts`), `/testroom` at each map load (`main.ts` `load`). Without it a page
  whose level loaded with no room `roundStart` after it kept the headset's own initial mask, on (§3).
- `StartMenu.roundStart` (the room's round start, the port's round reset) now tells the encoder the flag a second time
  when `multiplayer` (the online test), with no spectator test: r4 0x2a98c8-0x2a98e0. A player is told twice the same
  value (the round start's, then the reset's); a spectator online is now told once, where r0001 told it nothing.
- **r0001, superseded by r0004 (OT.R97)** (R4B.R6): `DAT_003df1a8` = 1 (research 226 §5, research 205 §1.14) and its
  never-read `VoiceMask` stay recorded as r0001's; `startMenu.test.ts`'s ELF case still pins r0001's byte, labelled
  r0001's. Those notes are not edited here.
- Tests: `viewer/test/voiceModulationR0004.test.ts` (the initial flag and its label, the store's read-back and the
  table's default, the toggle surviving a reboot's store, `/testroom`'s card store, the round reset's apply);
  `viewer/test/bootValves.test.ts` (the front end session's boot store and later stores bind the page; a session
  without it does not); `viewer/test/startMenu.test.ts` (two pins moved to OFF citing OT.R97 / R4B-02; the dev-disc
  `global_valves.rdr` row).

## 3. What the re-apply does in the port, and what it does not

The port's lobby never masks the encoder through `setVoiceMask` (the headset modulates only in the round phase,
`VOICE_MOD_LOBBY_OFF_READING`), and the headset never modulates a spectator's blocks; so the reset's second call changes
what is heard only where the encoder's mask was left other than the flag. It is ported as the call the original makes,
on the port's one round-reset path.

The headset's own mask (`voice/headset.ts`) is on until it is first told. The first build of this task told it only at
the room's `roundStart` (`netPage.ts`'s `roundStart` event) and at the START toggle, and said a page joining mid-round
is a spectator until the next round. That was wrong (the review's P2): in a respawn game the room seats a late joiner
dead at his load and he respawns mid-round (RC4, `match/src/room.ts` `addPlayer` and `enterDeadAtLoad`), and a classic
ghost of the next round is loaded mid-round too (`room.ts`'s load path, LATER 274) -- neither page hears a `roundStart`
before it plays, so both were modulated while the menu read OFF. In r0004 his own level load runs the round-start site
(r4 0x1f6850, D:L55851-55854) after the game lobby masked him off (r4 0x27dc30, r0001 D:L125570), so the flag binds from
his first frame. `StartMenu.levelStart` is that site on both pages (§2); `voiceModulationR0004.test.ts` holds the late
joiner and the ghost (OFF unshifted, a card saved ON shifted) and a spectator told nothing.

## 4. The test room's store at a map change

`/testroom` keeps no valve registry, so its START toggle writes no `VoiceMask` (`localStartMenuOptions`' `writeValve`
is a no-op), and its card is read again at a map change (`pageCardPlayOptions`, the test room's next store): an unsaved
toggle there goes back to the card's value at the next map, as INVERT PITCH's START write does (`clear`, "the card
wins"). r0004 would keep it through the registry. This is the test room's existing store adaptation, not a new one;
the front end's match keeps the toggle through the session's registry, as r0004 does.

## 5. The cluster's two other voice changes: not ported

The port's voice is Opus over its own wire (OT.R24 / OT.R44), but it does keep both paths these touch: the room
relays by channel (`match/src/voiceFloor.ts` `hears()`, R170.6) and holds the floor (`VoiceFloor`, W20.R5). So
neither is moot by the codec; each is left as r0001's here for a reason of its own.

- **The receive callback's channel check, dropped in r0004.** r0001's `FUN_0030f7e0` (D:L211395-211449) plays a packet
  only if the network library's query `FUN_00623ba0` succeeds and the sender's channel equals the listener's
  (`voice+0x24`); r4 0x32CDA0 goes from "packet non-empty" to the slot's mute and the decode, the query and the
  comparison gone. What that changes depends on whether the server's DME library already routed by channel (rt_audio
  1.08.0009 -> 1.08.0012): if it did, nothing; if not, every channel's talker is heard. The cluster calls the effect an
  inference, not settled. In the port the room is the router and `hears()` is its routing; removing it would widen who
  hears whom on an unsettled reading, so it is not ported. A PCSX2 round on our own central would measure only our own
  router (the review's P3 b), so it cannot settle it: what can is a static read of the channel routing in the rt_audio /
  DME library linked into r0004 (1.08.0012) -- whether the server side or the library delivers a packet only to its
  channel's members -- or a capture of the period game against the original server. `VOICE_RECEIVE_CHANNEL_CHECK_R0004_READING` (§6).
- **The 950 ms hold in the voice tick.** r4 0x32C190 (r0001 `FUN_0030ec10`, D:L210968 onward): r4 0x32c860-0x32c970,
  reached (r4 0x32c2ac-0x32c2b0) when the byte at `+0x4a` is 0 (read here as the talk flag, an inference), finds the slot the talker holds, posts the release (type 2) and stores
  `now + 950` (`addiu 0x3b6`) at `voice+0x6c`; r4 0x32c2e4-0x32c2f4 then lets state 1 move to its ask (state 2) only
  once `now > +0x6c`. r0001 asks from state 1 at once (D:L211108-211126) and writes `+0x6c` only for the record cap at
  the grant (D:L211177) and the cut's hold-off (D:L211257, tested D:L211262). So r0004 holds a re-ask 950 ms after a release **on the found-slot path**. There the port's
  server-held `VOICE_TALK_LOCKOUT_MS_READING` = 1000 ms after a talk's end (the talk input's TeamCommand timer) is never
  shorter, and r0004's 950 ms adds nothing -- subsumed on that path only. **Open:** when the released slot is not found
  (r4 0x32c8a8 skips the post and the write), `+0x6c` keeps what the grant last stored -- the record cap (r4
  0x32c524-0x32c530) or the cut's hold-off (r4 0x32c814-0x32c820) -- and that still gates the next ask at
  0x32c2e4-0x32c2f4, a case the port's floor does not model as such. And `voiceFloor.ts`'s note that on the game lobby
  (channel 9) the 1000 ms window "is ours, a hardening (OT.R26)" may instead be r0004's own 950 ms, if the voice tick
  runs in the lobby -- not read here. Not ported; recorded.
  `VOICE_FLOOR_RELEASE_HOLD_R0004_READING` (§6). Which r0004 call reaches 0x32c860 (the talk let go, or also a lost
  floor) was read on these two ranges only.
- The codec itself (SASE) is moot: the port does not run it (OT.R24 / OT.R44; `cluster-voice-codec-rebuild.md` §6).

## 6. Readings

| Name | Status and evidence needed |
|---|---|
| `VOICE_MODULATION_INITIAL_READING` | viewer `startMenu.ts`: false -- the flag at r4 0x450890 is in the overlay's .bss (ftscore r0004: load 0x1e7000, `.data` to 0x434d88, `.bss` to 0x4b9208), so 0 at load; reading, pending review. Open: a PCSX2 `--build r0004` boot on a fresh card, 0x450890 read after the title and the START menu's row read `VOICE MODULATION: OFF`; and a card saved ON, rebooted, the row read `ON`. |
| `VOICE_RECEIVE_CHANNEL_CHECK_R0004_READING` (*note only*) | not ported: r4 0x32CDA0 drops r0001's `FUN_0030f7e0` channel equality (D:L211395-211449); the port's `hears()` keeps it. Open: a static read of the channel routing in r0004's linked rt_audio / DME 1.08.0012, or a capture of the period game against the original server (a PCSX2 round on our own central measures only our router). |
| `VOICE_FLOOR_RELEASE_HOLD_R0004_READING` (*note only*) | not ported: r4 0x32c964-0x32c970 holds a re-ask `now + 950` ms after a release, r4 0x32c2e4-0x32c2f4 the gate; subsumed by the port's server-held `VOICE_TALK_LOCKOUT_MS_READING` (1000 ms) on the found-slot path only. Open: the slot-not-found path (0x32c8a8 skips the write; the grant's cap 0x32c524-0x32c530 or the cut's 0x32c814-0x32c820 still gates the ask); whether the tick runs in the game lobby (then `voiceFloor.ts`'s lobby window may be r0004's 950 ms, not OT.R26's); the tick's state machine read whole and a PCSX2 r0004 trace of `voice+0x6c` across a release and a re-press. |

`VOICE_MASK_VALVE_DEFAULT` (0) is the disc's row, held by the dev-disc case, not a stand-in.
