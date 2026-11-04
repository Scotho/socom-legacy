# 327 -- The names over the health bars, online (NU-9, PARITY-2)

- Date: 2026-10-15 (00:59Z). The next-update checklist's row NU-9 (the owner's second batch, NU.R4; split to the
  gameplay lane by NU.R5; the checklist is on `agent/nu-batch-2`). **A read alone**
  ([brief](../plans/briefs/2026-10-15-nu9-health-bar-names-read.md)): the build is a later brief, from section 5.
  Branch `agent/nu9-read` from `a434f180a`.
- Review: a fresh review of `db804e9bb` returned **FAIL (high)** on one blocking claim (F1: "one bar online" -- the
  reticle's target draws a second named bar online) and four lows (F2-F5); it confirmed at the source the 0.8 scale,
  the (555, 409) pen, N1 and N2, and decoded `A_ready091.png` itself. F1-F5 are folded here (2026-10-15 01:13Z), each
  re-read at the source by this note's author, the text they corrected kept beside ("was: ..."). The status is
  unchanged.
- Re-review: a narrow re-review of `5090612ee` returned **PASS WITH FINDINGS (high)**: F1-F5 resolved; three last items
  folded here (2026-10-15 01:18Z) -- §2's summary reworded, a "was" added in §3.2, and the spectator panel's title tag
  (build row N3, §4.2, §5) -- each with a "was" beside. The status is unchanged.
- Build (2026-10-15, `agent/nu9` from `be772ae59`; [brief](../plans/briefs/2026-10-15-nu9-names-build.md)): **N1, N2 and
  N3 built** as §5 writes them, each RED first. N1: `ownHudName` beside `spectatorHudView` and `Hud.setPlayerName(name,
  tag)`, the name and the tag kept apart in `HudModel` (`name`, `tag`; 327 F4); the info box formats "[tag] name", the
  scoreboard's fallback row reads the bare name; **the pages' once-a-frame set (`main.ts`, `matchMount.ts`) waits on the
  controller's word** (hot files: hunks reported). N2: `HUD_LAYOUT.info.name` (555, 409) at 0.8, centred; the W4 cut
  cases re-pinned with nine W's (F3). N3: `spectatorTitleName` (`SPECTATOR_TITLE_TAG_MIN` 2) for `CSpectatorInfo`'s title;
  `taggedName` keeps the info box's one-or-more. Not done here: research 87 §1.9's "was" (outside the brief's files).
  Status of the build: reading, pending review.
- Status throughout: **reading, pending review.** Source inspection, and one capture frame of the original inspected:
  the decompilation and the game ELF's bytes were read, the port's code was read, the committed font transcription was
  read, and one PCSX2 frame of the original was measured by a scratch script. No game, emulator, reader, test or
  browser was run (no node process at all). Where the port's behaviour is stated it is read off its source, not run.
  Nothing here is proven: the frame is not a capture scored by the harness. Nothing counts as a reading until a
  reviewer who did not write this note re-reads it at the source. A step marked *inference* is one interpretive step
  past the code.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, re-hashed for this note). The ELF
  `game/disc/socom2_game.elf` (SHA256 `06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872`, read only, by
  its program headers, through scratch scripts): the floats `DAT_003dcc48` 555.0, `DAT_003dcc50` 409.0, `DAT_003dcc58`
  0.8, `DAT_003dcc60` 488.0, `DAT_003dcc68` 396.0, `DAT_003dcc70` 134.0, `DAT_003dcc78` 18.0, `DAT_003dcca0` 418.0; the
  strings 0x3e6718 `[%s] %s`, 0x3e6720 (two blanks), 0x3e6730 `newweapnbkrnd.tif`; the info box's vtable 0x405b40
  (+0x18 0x238420, +0x1c 0x238490, +0x38 0x238500); `DAT_00408e40..4c` are BSS (research 87 §1: the static
  initializer's (128, 128, 128) at alpha 80). The disc's data: none needed -- `READERC.ZAR/hud.rdr` holds no layout
  for the info box (research 87, its sources), and no committed golden holds one; the font is `hudFont.ts`'s
  transcription of `fonts.rdr`'s `font_text_01` (checked against the archive by `test/hudFont.test.ts`, not run here).
  The capture: `$SOCOM_PC_ROOT/logs/parity/s4_pcsx2/A_ready091.png` (Vigilance, a SEAL in a multiplayer round, 640x480;
  not in the repository), read by a plain PNG decode. The desktop: none read
  (`desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3` is the pin, unused). The port's lines are this branch's base
  `a434f180a`.
- Evidence read first, not restated: research [87](87-hud.md) §1 (rows 1.8-1.10, 1.19: the info box, the team list),
  [282](282-the-spectator-hud.md) §4 (the info box for a viewed body; its "found in passing" on the name's 0.8),
  [322](322-the-hud-before-the-first-spawn.md) §1.4-§1.5 (the info box online from frame 1; hidden offline),
  [275](275-the-clan-tag-in-a-round.md) §1.5, §2 (the tag's lookup, the rows' `clan`),
  [314](314-watch-game-spectating.md) §5.2 (SPECTATOR-VIEW W4, `taggedName`), [227](227-voice-ui.md) §2.2, §3 (the
  name tags; `TEAMMATE_ROW_ORDER_READING`, `VOICE_ROW_MARK_READING`), [266](266-the-chat-panels.md) §3.6 (TEAMMATE
  NAMES), [179](179-c1-match-server.md) and [269](269-the-players-pages-and-the-medals.md) §5.2 (the scoreboard's name
  is the actor's `+0x14`).

## The owner's item (NU.R4)

From the checklist's NU.R4 (the owner, 2026-10-15, verbatim, its first sentence): "First thing I noticed is that player
names in online matches aren't showing over their health bars in the bottom left UI."

The row (NU-9, verbatim): "**Player names over the health bars, online.** In an online match the bottom-left HUD's
health bars carry no player names; the original draws the name over each bar (read the HUD's name draw: which bars,
whose names, the font and the colour by side; research 266 and the HUD notes). Page only unless the room's roster lacks
a name."

**Where the bars are.** In an online round the original draws **two** named health bars (the review's F1): the
info box's, at the **bottom right** (x 488-622 of the 640-wide frame; the port anchors it right as well,
`hud.ts:30-33`, `:852`), always, with the viewed actor's name; and, beside the reticle, a 60x5 bar of a **teammate
under the reticle**, 15 pixels above his name (`FUN_00215c10`, research 321 §4.2, R321.5; §4.1 here). The bottom left holds the
ammo box, which has no bar, and -- for a spectator only -- `CSpectatorInfo`'s title panel at (10, 410), 164x28, with
the followed player's name, no health bar (§4.2; the review's F2). This note reads the info box's bar, which every
living player has; the teammate's bar is the **alternative reading** of the owner's "player names ... over their health
bars", owed to NU-3b (research 321's C4; §4.1). N1 and N2 stand either way. (Was: "the original draws **one** health
bar, the info box's ... Read here as the bar the owner means, the only one an online HUD has. If he meant another
place, this note does not answer it".)

## 0. Answers

| # | finding | the port | section |
|---|---|---|---|
| R327.1 | **The info box draws one bar and one name: the viewed actor's.** (Was: "Online the original draws one bar and one name": the reticle's target draws a second, a teammate's, §4.1; the review's F1.) The info box's per-frame draw `FUN_00238500` (the vtable 0x405b40's +0x38, called each frame online, D:L56757-56758) takes the viewed actor (`FUN_001fcd70`, the camera's `+0xbc`, D:L85555), fills the bar from it (`FUN_00241cc0`, D:L85556) and writes its name (`+0x14`, D:L85562) on the bar -- "[%s] %s" (0x3e6718) with the actor's seat's clan tag when it has one character or more, the name alone otherwise (D:L85558-85569), cut to nine characters and "-" past 130 (D:L85571-85576). For a living player that actor is his own: **his own name, on his own bar** | **no name for the walker**: `HudModel.name` is '' and nothing in either page sets it (`setPlayerName` is called only by the test hook's `patch`, `hud.ts:1527`, `:1600`) | §1, §3 |
| R327.2 | **The capture shows it**: `A_ready091` (a multiplayer round, the walker's own HUD; the info box is up, which only the online byte allows a walker, §2) has the walker's own name centred on the green bar, ink x 535-575, y 402.3-411.6 of 448 (research 87 §1.9 measured the same box) | -- | §1.3 |
| R327.3 | **The name's text: the HUD's font at scale 0.8, centred, pen (555, 409), the HUD's string colour; no colour by side or state.** Set up at the box's init (`FUN_002388a0` D:L85645-85653; again at the round's `FUN_00238710` D:L85612-85619): the font the HUD's `+0x498` (`FONT_TEXT_01`), `+0x40` 0.8 (`DAT_003dcc58`; the scale: the measure multiplies the advance by it, `FUN_00362b70` D:L260748, D:L260794), `+0x69` 1 (centred), colour `DAT_00408e40..4c`, pen `DAT_003dcc48/50` = (555, 409). The draw writes the text only; it touches no colour, scale or place by team, life or seat (D:L85555-85578). The frame agrees with 0.8, not 0.9 (§1.3) | **scale 0.9 at (555, 411)**, measured (`hud.ts:113`); the cut measured at 0.9 (`infoBoxName`, `hud.ts:755-757`); the colour, the font and the centring the same | §1.2, §3 |
| R327.4 | **When it changes: every frame, with the viewed actor.** A death leaves the camera on the player's own body, so his own name stays; watching a teammate shows the teammate's; a spectator the followed player's (or his own object's in the free and scenic cameras); a late joiner's from frame 1 (the box is shown online from the first frame, research 322 R322.5); a rename or a new tag on the next frame. A disconnect changes the name only by changing the viewed actor | the followed name (spectator, a dead player watching a teammate) is drawn since PAR-48 and W4; the own name on no path | §1.4 |
| R327.5 | **Offline the info box is hidden and the names are the team list's**: the fire team's four rows, each name right-aligned to x 510 over a 65x14 bar at x 450 (`FUN_00221070` D:L74805-74838, `FUN_002216d0` D:L74918-74924; research 87 §1.19). Both are gated on the online byte `DAT_0045a0c1`: the team list is set up and put on the HUD's draw list only offline (D:L57374-57381, D:L57609-57614) and ticked only offline (D:L56663-56665); the info box is hidden offline at both inits (D:L57480-57483, D:L57620-57623), shown and drawn each frame online (D:L56441-56443, D:L56757-56758); offline it is shown for a dead player viewing another body (`FUN_001f9f20` D:L57177) and its frame runs only while the player's alive bit is set and the viewed actor is another (D:L56831-56844; was: "drawn offline only while the viewed actor is not the player under an unread flag", the review's F5) | the port has no single-player campaign; its online match is the online path | §2 |
| R327.6 | **The room lacks no name.** The panel needs the viewed actor's name and seat tag: the walker's own (the room's `welcome.name`, `room.ts:1630-1631`; its `clan` on the score rows sent to the joiner right after the welcome, `room.ts:1652`, `:5734-5739`), a followed player's (`welcome.players`, `joined`, `renamed`: `NetPage.nameOf`, `netPage.ts:1269-1271`, `:1295-1298`, `:1357-1358`). An online room has no bots | page only | §3.1 |
| R327.7 | **One rule with SPECTATOR-VIEW's `taggedName`**: the walker's name comes out of the same `FUN_00238500` line as the followed player's, so "[tag] name" applies to it unchanged | the build reuses `taggedName` and `infoBoxName` | §3.3 |
| R327.8 | **The other named bar is the reticle's target's** (the review's F1): a teammate under the reticle, online, gets his name and a 60x5 bar of his health beside the reticle (`FUN_00215c10` D:L70162-70170, D:L70189-70218; research 321 R321.5) -- owed to NU-3b (C4), the alternative reading of the owner's item (§4.1). **Not the voice UI's rows, not the name tags.** `TEAMMATE_ROW_ORDER_READING` and `VOICE_ROW_MARK_READING` are the Chat menu's TEAMMATES rows (`matchChat.ts`, research 227 §3); the teammates' name tags over their heads in the world (`FUN_002269a0`, TEAMMATE NAMES) are `MP_TEAM_NAME_TAGS_PLACEHOLDER`'s task (research 227 §2.2, 266 §3.6, LATER 25) -- a different, still missing, part | the target's name and bar: none (`reticleClass.test.ts:190`, an `it.todo`, NU-3b); the rest not this row | §4 |

**NU.R3: the port does not match.** Three differences, all the page's (§3.2): the walker's own name is never drawn
(N1), the name's text is 0.9 at y 411 where the original's is 0.8 at y 409 (N2), and a spectator's panel title drops
the followed player's clan tag (N3, the re-review). (Was: "Two differences, both the page's ... (N1), and ... (N2).")

## 1. What the original draws online

### 1.1 The bar and its name

The HUD (`CHUD`) builds the info box at `+0x17b70` once (`FUN_002388a0`, called D:L57478 with the HUD's font) and
again at each round's start (`FUN_00238710`, D:L57618, inside `FUN_001fb420`). Its children: the bar (`+0x20`,
`CHealthBar`, 134x18 at (488, 396): `DAT_003dcc70/78`, `DAT_003dcc60/68`, D:L85642-85643), the box under the timer line
(`+0x270`, `newweapnbkrnd.tif`, from y 418, `DAT_003dcca0`), the name (`+0x2f0`, a text object) and the voice element
(`+0x390`, research 227 §2).

Each frame online the HUD's tick calls the box's +0x38 (D:L56757-56758), which is `FUN_00238500` (the vtable 0x405b40's
word at +0x38 is 0x238500, read off the ELF). It:

1. takes the viewed actor, the camera's `+0xbc` (`FUN_001fcd70` D:L58311-58316), and updates the bar from it
   (D:L85555-85557);
2. looks up the actor's seat's clan record (`FUN_002c3ac0` on the actor's `+0xfc8`, D:L85559-85561; research 275
   §1.5) and reads the actor's name at `+0x14` (D:L85562) -- the field the scoreboard's rows draw as the player's name
   (research 179's `COLUMN_ORDER_PLACEHOLDER` section, research 269 §5.2);
3. writes "[tag] name" through 0x3e6718 when the tag's length is one or more, the name alone otherwise
   (D:L85563-85569), and measures it (`FUN_00362b70`, D:L85570);
4. past `DAT_003dcc70` - 4 = 130 wide, writes the first nine characters and "-" instead (D:L85571-85576);
5. ticks the voice element (D:L85578).

There is one viewed actor, so the info box holds one bar and one name (the reticle's target's bar is a second, §4.1;
was: "so one bar and one name", the review's F1). For a living player in his own body the viewed actor is his own
(the spectator HUD's dispatch, research 282 §1, sends any other view down other paths), so **the walker sees his own
name on his own bar**.

### 1.2 The name's text

Set at both inits (`FUN_002388a0` D:L85645-85654, `FUN_00238710` D:L85612-85620):

| property | value | source |
|---|---|---|
| font | the HUD's `+0x498`, `font_text_01` (the page's `FONT_TEXT_01`) | `FUN_00362b20` D:L85645 (the init's font argument, D:L57478) |
| scale | **0.8** | `+0x330` (the text's `+0x40`) = `DAT_003dcc58` 0.8 (D:L85646, D:L85612). `+0x40` is the scale: `FUN_00362b70` multiplies each glyph's advance by it (D:L260748, D:L260794), and `FUN_003631c0` is its setter (D:L260974); its default is 1.0 (`FUN_00363e70` D:L261467), as is `+0x78`, the other factor (D:L261468) |
| alignment | centred | `+0x359` (the text's `+0x69`) = 1 (D:L85647; `hud.ts` names `+0x69` HCENTERED for the voice number) |
| pen | (555, 409) | `FUN_003631a0` with `DAT_003dcc48/50` (D:L85653, D:L85619; `FUN_003631a0` D:L260958-260964 stores them as the text's x, y). 555 = 488 + 134 / 2: centred on the bar |
| colour | `DAT_00408e40..4c`, the HUD's string colour, (128, 128, 128) at alpha 80 | D:L85648-85651 (research 87 §1) |
| first text | two blanks (0x3e6720) | D:L85652 |

The per-frame draw changes the string alone (D:L85566-85576); no line of it reads the actor's team, life or seat role
for a colour, a scale or a place. **No colour by side or state.** (The bar's own colours are `CHealthBar`'s, research
87 §1.8 -- not this row's.)

### 1.3 The frame

`A_ready091.png` (640x480; a 448-line position is y x 448 / 480) shows the walker's own name -- six lower-case letters,
the name research 87's sources quote -- centred in white on the green bar, the timer and the number in the
box below. Measured by a scratch PNG decode (pixels whose least channel is 150 or more; the same box at 120):

| string | known scale | ink x | ink width | pen travel at 0.8 / 0.9 (`FUN_00363c20`'s rule over `hudFont.ts`'s glyphs) |
|---|---|---|---|---|
| the name | ? | 535-575 | 41 | **43** / 49 |
| the timer "04:49" | 0.9 (`CHUD`'s init) | 502-536 | 35 | 34 / **38** |
| the ammo "30/30" | 0.9 | 17-52 | 36 | 34 / **39** |
| the number "2m" | 0.9 | 589-604 | 16 | 16 / **19** |

On the same frame each 0.9 string's ink is its 0.9 travel less about three pixels; the name's 41 is 0.8's 43 less two,
and 0.9's 49 would ink about 46. The ink's start agrees too: a 43-wide line centred on 555 starts its pen at 533.5, its
ink at about 535.5 (the timer's pen 500 inks from 502). Vertically the name's ink runs y 402.3-411.6 of 448: its last
letter has a descender, so its letters' foot sits above 411.6, as a pen at 409 puts it (the timer's pen 433 inks to
431.2-432.1, digits with no descender). **The frame agrees with the code's 0.8 at (555, 409).** This is a frame
inspected, not a capture scored by the harness: it corroborates the reading; it does not make it proven.

### 1.4 When it changes

The name is rewritten every frame from the viewed actor (§1.1), so it follows whatever the camera follows:

- **Alive:** the player's own name and tag.
- **Dead, on his own body** (the death camera, `FUN_001f97b0`; research 282 §1): the viewed actor is still his own, so
  his own name stays over his (emptied) bar.
- **Dead, watching a teammate** (`FUN_001f9f20`): the teammate's name and bar.
- **A spectator** (`FUN_001f9160`): the followed player's; in the free and scenic cameras the spectator's own object's
  (research 282 §4; the port's `SPECTATOR_OWN_INFO_PLACEHOLDER`).
- **A late joiner:** the box is shown and drawn from frame 1 online (research 322 R322.5), so his name is on it before
  his first spawn (*inference*: the viewed actor before the first spawn is his own object; research 322 §1 reads the
  HUD's frame 1, not this field).
- **A rename, a tag published mid-round:** the next frame (the draw reads `+0x14` and the seat's record each frame).
- **A disconnect:** only through the viewed actor -- a followed player who leaves is no longer followed (research 248's
  cycle); the walker's own name does not change.

## 2. Offline against online

- **Offline the info box is hidden** at both inits (D:L57480-57483 after `FUN_002388a0`; D:L57620-57623 after
  `FUN_00238710`), and the online tick that draws it (D:L56757-56759) does not run. Offline it is shown by `FUN_001f9f20` (D:L57177), the
  path of a dead player viewing another body; the tick's offline branch, while the player's alive bit (`+0xe1` bit 4,
  research 282 §1, D:L56564) is set and the control state is 0, hides the box when the viewed actor is the player
  himself and runs its frame (+0x38) when it is another (D:L56831-56844) -- it shows nothing. When an offline player is
  both alive and viewing another body, so that the frame runs, is not read (`INFO_NAME_OFFLINE_DRAW_READING`, §6).
  (Was: "One offline path draws it: the tick's offline branch shows the box when the local player's `+0xe1` bit 4 is
  set, ... What sets that bit is not read" -- the bit is the alive bit, and the branch does not show the box: the
  review's F5.)
- **Offline the names over bars are the team list's** (`CTeamNames` at `+0x165a0`, research 87 §1.19): set up and put
  on the HUD's draw list only offline (`FUN_00221070` D:L57374-57378, D:L57609-57611; `FUN_001f6e10` D:L57377), hidden
  online at both inits (D:L57379-57381, D:L57612-57614) and ticked only offline (D:L56663-56665). `FUN_00221070` lays
  four rows, each a 65x14 bar at x 450 (D:L74805-74814), and fills them from the two fire teams' first two members
  (`FUN_005ef2f0(2)`, `(3)`, D:L74825-74838); `FUN_002216d0` writes each member's name right-aligned to x 510 -- over his
  bar -- in the HUD's string colour (D:L74903-74924). The bots of the campaign's fire team carry names there; nothing of
  it runs online. (The living branch's show of the team list, D:L56411-56417, sets a visible bit online on an object no
  draw list holds; *inference*: drawn nowhere.)
- **So the name draw is gated on the online byte `DAT_0045a0c1`**: online the info box's name, the viewed actor's,
  over its bar, and a teammate's name under the reticle with his 60x5 bar above it (D:L70165-70166, §4.1); offline the
  fire team's names over their own bars, the reticle's teammate shown the blank (D:L70162-70163), and the info box only
  in the unread case above. (Was: "online one name, the viewed actor's, over the info box's bar; offline the fire
  team's names over their own bars, and the info box only in the unread case above" -- it left out the reticle's
  target, §4.1: the re-review.)

The port has no single-player campaign and no team list (research 87 §1.19: "not drawn"); its matches are the online
path, so the online rule is the one to build.

## 3. The port against the read

### 3.1 The room

| the original needs | the room gives | difference |
|---|---|---|
| the walker's own name (`+0x14`) | `welcome.name`, the member's name (`room.ts:1630-1631`); `renamed` (`room.ts:2000`, `:2188`) | none |
| the walker's own seat tag | the score rows' `clan` (`room.ts:5734-5739`), sent to a joiner right after his welcome (`room.ts:1652`) | none |
| a followed player's name and tag | `welcome.players`, `joined` (`room.ts:1998`, `:2015`, `:5173`, `:5193`), the rows' `clan` | none |
| a bot's name | an online room seats no bots | none |
| a spectator's own name and tag (free, scenic) | his name is the welcome's; a spectator has no row, so no tag (`CLAN_TAG_AT_SEAT_READING`, research 275 §5) | not this row (`SPECTATOR_OWN_INFO_PLACEHOLDER`) |

**The room's roster lacks no name the panel needs.** The page already holds them: `NetPage.nameOf(id)` (the welcome
sets the walker's own id's name, `netPage.ts:1295`), `NetPage.rows` (`netPage.ts:537`, `:1562`).

### 3.2 The page

| # | the original | the page | difference |
|---|---|---|---|
| -- | the info box's one bar, the viewed actor's (§1.1; the reticle's target's bar is §4.1's; was: "one bar, the viewed actor's (§1.1)", the review's F1) | one bar, `HUD_LAYOUT.info.bar` (`hud.ts:111`), the walker's `model.health` or the followed body's (`hud.ts:948-960`) | none for the name (a followed body's bar was `SPECTATOR_FOLLOWED_HEALTH_PLACEHOLDER`'s; *2026-10-19, LATER 119:* drawn from the room's part bytes, `SPECTATOR_FOLLOWED_HEALTH_READING`, research 282 §4) |
| N1 | the **walker's own name** on his bar, "[tag] name" with his seat's tag (§1.1, §1.4), from frame 1 online, through his death on his own body | `infoName` is `model.name` for the walker and the 'own' path (`hud.ts:961`); `model.name` is '' (`hud.ts:622`) and only the test hook's `patch` sets it (`hud.ts:1600` -> `:1527`); neither page calls `setPlayerName` (`main.ts`, `matchMount.ts`: no line; the HUD's doc says it, `hud.ts:555`) | **the walker's name is missing** -- the owner's item |
| N2 | the name at scale 0.8, pen (555, 409), centred (§1.2), the frame agreeing (§1.3); the cut measured at that scale (D:L85570-85571) | `HUD_LAYOUT.info.name` = (555, 411), scale 0.9, centred, "measured on the Vigilance frames" (`hud.ts:112-113`; research 87 §1.9); `infoBoxName` measures at the spot's 0.9 (`hud.ts:755-757`) | **the name 2 px low and about 12% wide**; a name between 130 px at 0.9 and 130 px at 0.8 is cut where the original's is not. Applies to the followed names too |
| -- | the HUD's string colour, no colour by side or state (§1.2) | `text()`'s default, `HUD_COLOURS.text` (`hud.ts:229`, `:868`) | none |
| -- | "[tag] name", one character or more (D:L85563-85567) | `taggedName` (`hud.ts:766-768`) for a followed body | none (N1 reuses it) |
| -- | the cut: past 130, nine characters and "-" (D:L85571-85576) | `infoBoxName`, `INFO_NAME_CUT` (`hud.ts:751-757`) | none but N2's scale |
| -- | the box hidden under the scoreboard (D:L56811) | `SCOREBOARD_HIDES` holds 'name' (`hud.ts:455-461`) | none |
| N3 | a spectator's `CSpectatorInfo` title: the followed player's "[tag] name" when the tag is two characters or more, the name alone otherwise (`FUN_002425e0` D:L90266-90270, 0x3e6e80; §4.2) | `spectatorInfoText`'s title is `view.followed.name` alone (`hud.ts:745`), the tag ignored | **a followed clan member's panel title lacks his "[NSW]"** (the re-review) |
| -- | a spectator's free and scenic cameras: his own object's name | none drawn (`SPECTATOR_OWN_INFO_PLACEHOLDER`, `hud.ts:685`) | not this row (research 282's) |

Found in passing, not this row's: the port's `/testroom` free walk with no room live draws the info box's bar, where
the original hides the box offline (§2); the test room's walk is the port's own instrument.

### 3.3 The overlap: SPECTATOR-VIEW's `taggedName`

`FUN_00238500` is one function for every viewed actor: the walker's own name and a followed player's are written by
the same lines (D:L85558-85576). So the walker's name takes the same rule -- `taggedName(tag, name)`, then
`infoBoxName` -- with his own row's `clan`. Nothing new is needed of the rule; N1 feeds it the walker's own name and
tag. N2's scale changes `infoBoxName`'s measure for both.

## 4. The other names, and what is not this row

### 4.1 The reticle's target: the alternative reading (research 321 §4.2, NU-3b)

The review's F1, re-read at the source. Each frame the reticle's pass `FUN_00215c10` names the actor under the
reticle: for a teammate, online, his name (`+0x14`; offline, and online with the HUD's flag `+0x17b64` set, the blank
0x3e4840 instead: D:L70162-70170); with his seat's clan tag through "[%s] %s" (0x3e4848) when the tag is two
characters or more and the name is not the blank (D:L70189-70198, the length test D:L70193-70194 -- two or more,
unlike the info box's one or more, D:L85563; `taggedName`, as it stands, is the info box's rule, so the reticle's
name, NU-3b's, needs the two-character rule, as N3's panel title does); the
text at scale 0.7, made at the init (D:L70816-70818), placed at `(cx + W/2, cy - H/2)` beside the reticle's upper right
(D:L70201-70212); and, for a teammate (or the flagged kind), a `CHealthBar` 60x5 (D:L70822-70823: 0x42700000,
0x40a00000) 15 pixels above the name, filled with the target's health (`FUN_00241cc0(bar, target, 1)`,
D:L70213-70218). This is a second named health bar online, over the teammate the player aims at -- **the alternative
reading of the owner's "player names ... over their health bars"**. Research 321 reads it (R321.5, §4.2) and its build
row C4 is NU-3b's; the port draws neither the name nor the bar (`reticleClass.test.ts:190`, an `it.todo`). N1 and N2
stand either way: the info box's own name is missing too. The controller may put both readings to the owner.

### 4.2 The bottom left: `CSpectatorInfo` (the review's F2)

For a spectator only (online, the panel is hidden from a non-spectator: D:L56581-56583; research 282 §1), the bottom
left holds `CSpectatorInfo` (`FUN_00242bb0` D:L90396-90414): `newweapnbkrnd.tif` over a title panel at (10, 410),
164x28 (`DAT_003dcf18..30`, read off the ELF: 10, 410, 164, 28), its title at (20, 430), with the followed player's
"[tag] name" (D:L90258-90272; a tag of two characters or more, "[%s] %s" 0x3e6e80), over the stats panel. A name panel,
no health bar. The port draws the panel (PAR-48, `SPECTATOR_INFO_LAYOUT`, `hud.ts:700-711`), but its title is the
followed player's name alone (`spectatorInfoText`, `hud.ts:745`): a tag of two characters or more is dropped (N3, the
re-review). (Was: "The port draws it (PAR-48, ...)".)

### 4.3 Not this row

- **The Chat menu's TEAMMATES rows** (`TEAMMATE_ROW_ORDER_READING`, `VOICE_ROW_MARK_READING`; `matchChat.ts`, research
  227 §3): a menu's list of teammates, no health bars; not the same rows.
- **The teammates' name tags in the world** (`FUN_002269a0` D:L77307-77460, up to eight, shown with TEAMMATE NAMES;
  research 227 §2.2, 266 §3.6): the port draws none (`MP_TEAM_NAME_TAGS_PLACEHOLDER`, LATER 25). A different part, still
  missing; if the owner's "player names" meant names over the other players in the world, it is that task, not this
  one.
- **The owner's question:** the info box's bar is at the bottom right in both the original and the port; the bottom
  left has no health bar (the ammo box; a spectator's `CSpectatorInfo`, §4.2); the other named bar is the reticle's
  teammate's (§4.1). The controller asks him which he saw missing, or builds both (N1-N2 here, C4 in NU-3b). (Was:
  "the bar is at the bottom right in both the original and the port (the preamble); if he meant another place, the
  controller asks him".)

## 5. The build list

Each row is RED first, on the simulation track (what the HUD draws). The room changes in none: all are the page's,
from what the page already holds (§3.1).

- **N1 -- the walker's own name on his bar (page).** A pure function beside `spectatorHudView` in `hud.ts` gives the
  walker's info-box name from the page: `taggedName(<own row's clan>, page.nameOf(page.client.id))`, '' with no page
  (the free walk of `/testroom`); both pages set it once a frame beside `hud.setSpectator` (`main.ts:1536`,
  `matchMount.ts:877`), as PAR-48 feeds the view (the two page files need the controller's word, as NU-7's W1 did).
  `hudPass` draws it on the walker's and the 'own' paths unchanged (`hud.ts:961`). **The name and the tag are kept
  apart** (the review's F4): the HUD's model holds the walker's name and his tag separately, and only the info box
  formats them (`taggedName`, then `infoBoxName`); the scoreboard's single-row fallback reads `model.name`
  (`hud.ts:1198`) and, before the first `score` event (and after `setScoreRows(null)`, `netPage.ts:850`, `:879`), must
  show the name alone, never "[NSW] BRAVO" in its name column.
  - *RED:* `hud.test.ts`: the walker's HUD fed a page whose own id's name is "BRAVO" draws a 'name' element equal to
    the HUD's draw of "BRAVO"; with its row's `clan` "NSW", of "[NSW] BRAVO"; a long name cut by `infoBoxName`; the
    'own' path (dead on his own body, a ghost) the same name; a spectator's free camera none
    (`SPECTATOR_OWN_INFO_PLACEHOLDER` stands); no page none. A rename (`renamed`) shows on the next frame. A late
    joiner, welcomed and not spawned, draws his name (research 322 R322.5). The scoreboard with no rows and a tagged
    walker draws "BRAVO", not "[NSW] BRAVO", in its one row (the review's F4). `matchMount.test.ts` through the real
    page: the welcome's name on the HUD's model.
  - Research 87 §1.9's row and `hud.ts:555`'s doc ("the viewer's SEAL has none") get a "was" pointing here.
- **N2 -- the name's text at the code's place (page).** `HUD_LAYOUT.info.name` = (555, 409), scale 0.8, centred
  (`FUN_002388a0` D:L85646-85653, `DAT_003dcc48/50/58`); `infoBoxName` measures at it, so the cut falls past 130 at 0.8
  (D:L85570-85571). Its doc cites the code and the frame (§1.3); the "measured" note becomes a "was".
  - *RED:* `hud.test.ts`: the spot is (555, 409, 0.8, centre); eleven "W"s (pen travel 132 at 0.9, cut today; 110
    at 0.8) are not cut; twenty still are. The W4 cases (`hud.test.ts:703-706`) pin that the cut measures the
    **tagged** string; at 0.8 "[NSW] WWWWWWWW" travels 121 and is no longer cut, so flipping their expectation would lose
    that point. They are re-pinned with nine "W"s: "[NSW] WWWWWWWWW" travels 131 at 0.8 (cut to "[NSW] WWW-") against
    "WWWWWWWWW" at 90 (whole). Thirteen "W"s travel exactly 130 at 0.8, the edge (D:L85571's test is "over"): not used.
    (Travels by `FUN_00363c20`'s rule over `hudFont.ts`'s glyphs, a scratch computation.) (Was: "The W4 cases move:
    "[NSW] WWWWWWWW" travels 142 at 0.9 ... and 121 at 0.8, so it is drawn whole; they are re-pinned with the
    original's scale" -- the review's F3.)
- **N3 -- the spectator panel's title tag (page).** `spectatorInfoText` (`hud.ts:745`) titles the panel
  "[tag] name" through "[%s] %s" when the followed body's `tag` is two characters or more, the name alone otherwise
  (`FUN_002425e0` D:L90266-90270, 0x3e6e80); the empty name's " " stays (D:L90263-90265). A two-character rule beside
  `taggedName` (which keeps the info box's one-or-more, D:L85563), shared with NU-3b's reticle name (D:L70193-70194).
  - *RED:* `hud.test.ts`: a followed player "BRAVO" with tag "NSW" titles the panel "[NSW] BRAVO"; with tag "X",
    "BRAVO"; with no tag, "BRAVO"; the info box's name keeps "[X] BRAVO" for the one-character tag (D:L85563).
- **Pinned, no behaviour change (with N1):** the name's colour is the HUD's string colour on every path; the scoreboard
  hides it (exists, `hud.test.ts:665-668`); the walker's name is not drawn offline with no room live.
- **Not built here:** the reticle's target name and 60x5 bar (research 321 C4, NU-3b's; §4.1); the offline draw rule (`INFO_NAME_OFFLINE_DRAW_READING`: no campaign); the spectator's own object's
  name (`SPECTATOR_OWN_INFO_PLACEHOLDER`, research 282's); the name tags (`MP_TEAM_NAME_TAGS_PLACEHOLDER`'s task).

## 6. Readings and placeholders (candidates for the build)

| name | where it would go | status |
|---|---|---|
| `INFO_NAME_OFFLINE_DRAW_READING` (*note only*; candidate, none: the port has no campaign) | -- | offline the info box is shown by `FUN_001f9f20` (D:L57177, a dead player viewing another body) and its frame (+0x38) runs only while the player's alive bit (`+0xe1` bit 4, research 282 §1, D:L56564) is set, the control state 0 and the viewed actor another (D:L56831-56844), which hides it when the viewed actor is the player; when an offline player is alive and viewing another body is not read; settles: a read of the offline view's changes of the viewed actor, or a capture of a single-player mission's HUD on a teammate's view. (Was: "drawn only while the local player's `+0xe1` bit 4 is set ...; what sets the bit is not read" -- the bit is the alive bit and the branch shows nothing: the review's F5.) |

No value either build row needs is open: N1's names are the room's, N2's values are the ELF's. The capture that would
take them to proven:

- **NU9-1**: a two-team online match on two consoles, each console's own HUD recorded: the walker's name on his bar
  alive, dead on his own body and watching a teammate; a clan member's "[tag] name"; a name long enough to be cut; a
  late joiner's first frame; scored by the harness at the info box (the ink's box against the port's quads at 0.8 and
  (555, 409)).
