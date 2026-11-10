# 282 -- The spectator's HUD (PAR-48, issue #138)

- Date: 2026-10-11. PARITY-2's row PAR-48 ([brief](../plans/briefs/2026-10-11-par48-spectator-hud.md)). Base
  `d93b622ba` on `agent/par48`.
- Builds on the playtest lane's reading, research 276 §7 (the branch reading: `origin/agent/playtest@8c5b03c78`,
  the web project's `docs/research/276-the-replay-viewer-to-release.md`, reviewed PASS WITH FINDINGS). That note is not
  on `main` yet; what is taken from it is re-read here at the source.
- Status throughout: **reading, pending review** (§7: re-read at the source by a fresh reviewer 2026-10-12, PASS WITH FINDINGS, both folded in). The decompilation (`$SOCOM_PC_ROOT/game/analysis/
  socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`) was re-read at every line cited. The ELF's words and
  strings were read off `$SOCOM_PC_ROOT/game/disc/socom2_game.elf` through the repository's ELF reader
  (`tools/elfImage.ts`, `ElfImage.u32` / `cstr`) by a throwaway script outside the tree. Nothing here was measured
  running: no capture of a spectator's console exists.
- The code: `packages/viewer/src/hud.ts` (`HudSpectatorView`, `Hud.setSpectator`, `spectatorHudView`,
  `SPECTATOR_INFO_LAYOUT`, `SPECTATOR_HELP`), wired on both pages (`main.ts`, `matchMount.ts`). The tests:
  `packages/viewer/test/hud.test.ts` ("the spectator's HUD").

## 1. Who draws what: the dispatch

`FUN_001f7ff0` (the HUD's frame, D:L56517) picks one path by the local player's alive bit and the camera's viewed actor
(`DAT_00415ff0 + 0xbc`, D:L56540), D:L56564-56600:

| seat | path | what it draws, beyond the frame's common lines |
|---|---|---|
| alive, viewing himself | `FUN_001f7a90` | the walker's HUD (the page's, unchanged) |
| alive, viewing another | `FUN_001f9f20` | as the dead viewing another |
| dead, offline | `FUN_001f93c0` | not this task's |
| dead online, not a spectator, own body | `FUN_001f97b0` | the walker's HUD (`FUN_001f7a90` at D:L57112), then hides the small window and the subtitles (D:L57113-57114), **the compass** (`FUN_00212260`, D:L57115) and the spectator panel unless the local seat is a spectator (D:L57116-57118); the dead's help lines (D:L56996-57107) |
| dead online, not a spectator, another body | `FUN_001f9f20` | the hide-all `FUN_001f77c0` (D:L57174), then shows the teammates' name tags `+0x17580` (`CMPTeammateNames`, research [329](329-the-name-tags-over-heads.md) §1.1; was: "the voice element `+0x17580`" -- the voice element is the info box's `+0x390`), the info box `+0x17b70`, the main window and `0x437540`'s object (D:L57176-57179), the weapon box (`FUN_00237e50`, D:L57180), the panel only for a spectator seat (D:L57181-57183); the dead's help lines (D:L57149-57173) |
| **a spectator** (`FUN_002c2fd0`, D:L56589) | **`FUN_001f9160`** (D:L56863-56896) | writes the spectator's four help lines (D:L56869-56872), the hide-all (D:L56873), then shows the teammates' name tags `+0x17580` (research 329 §1.1; was: "the voice element"), the info box, the panel `CSpectatorInfo` (`+0x18280`), the main window and `0x437540`'s object (D:L56875-56879), and the six help lines centred (D:L56881-56895) |

`FUN_002c2fa0` (D:L164597-164604) is `FUN_002f6d00(0x44f370)`, the test `FUN_002c2fd0` (D:L164609) makes for the local
actor: "the local seat is a spectator". So the panel is a spectator's only (D:L56581-56583, D:L57116, D:L57181).

**The hide-all `FUN_001f77c0`** (D:L56312-56361), online: the prompts `+0x174d0` (D:L56325), the scope's `+0x165a0`
(D:L56326), the reticle's root `+0x11df0` (D:L56327), the stance word `+0x11ca0` (D:L56328), three more of the HUD's
children (D:L56332-56334), the ZOOM line `+0x744` (D:L56338), the weapon box (`FUN_00237de0`, D:L56340), the
teammates' name tags `+0x17580` (D:L56341; was "the voice element" -- NU-9's review, F2, 2026-10-15: research 329; the port's `START_MENU_HIDES` dropped `'voice'`, taken from the old mapping, with PAR-97, 2026-10-16), the info box (D:L56346, outside state 3) and the panel (D:L56348), the three message windows
(D:L56354-56356) and **the compass ring and the marks' parent** (`FUN_00212260`, D:L56359; D:L68360-68369). The round
timer and the number are hidden there offline only (D:L56320-56324).

**The frame's common lines** after the path: the timer's text is written (`FUN_001f6b60`, D:L56604) and, online, the
number (D:L56605-56613); with the SPECTATOR HUD option on (`DAT_003dc3e0`, 1 in the ELF's data) the info box, the timer
and the number are shown each frame (D:L56803-56806); with the scoreboard up (`FUN_0022cbf0`, D:L79959-79971: online,
`DAT_0040f608`), or the option off, D:L56808-56827 hide the weapon box, **the info box (D:L56811)**, the compass, the
panel, the prompts, the reticle, the six help lines, the timer, its box `+0x4ec0`, and **the number (D:L56826)** --
for every seat. SELECT (pad bit 0xc) hides the panel for a spectator (D:L56760-56763).

The compass's own show `FUN_002122a0` (D:L68371-68392) refuses unless the viewed actor is the local one, alive
(`+0xe1` bit 4) and at view state 1 or less (`+0x200`); so a dead player's own body has no compass.

## 2. `CSpectatorInfo`: the panel (`FUN_00242bb0` D:L90372-90440; its frame `FUN_002425e0` D:L90217-90330)

The ELF's words, read through `ElfImage`, in the 640x448 frame:

| what | value | source |
|---|---|---|
| the title bar | `newweapnbkrnd.tif` (the pointer `PTR_s_newweapnbkrnd_tif_003dcf10` = 0x3e6e20) over x0 10, y0 410, x1 174, y1 438 (`FUN_003646d0` stores x0, y0, x1 - x0, y1 - y0: D:L261748-261761) | `DAT_003dcf18/20/28/30` = 10, 410, 164, 28; D:L90396-90398 |
| its alpha | 72 | `DAT_003dcf38`, the `+0x34` setter, D:L90400 |
| the title | "SPECTATOR INFO" (0x3e6ed8) until the first frame writes it, at the pen (20, 430), scale 0.9 | `DAT_003dcf40/48/50` = 0.9, 20, 430; D:L90404-90407 |
| the stats panel | the same bitmap over (10, 326)-(174, 410), alpha 64 | `DAT_003dcf58/60/68/70/78` = 10, 326, 164, 84, 64; D:L90411-90414 |
| the four labels | "Kill Count :", "Deaths :", "Headshots :", "Score :" (0x3e6e88, 0x3e6ea0, 0x3e6eb0, 0x3e6ec0) at the pen (20, 346 + 18i), scale 0.9 | `DAT_003dcf80/88/90/98` = 0.9, 18, 20, 346; D:L90420-90423, D:L90309-90321 |
| the four values | "000" (0x3e6ef8) at init, then `"%d"` (0x3e6e98) of the sums; right-aligned to x 160 (`+0x6a` set, D:L90434; `FUN_00362900` moves such a text left by its width, D:L260689-260690), scale 0.9 | `DAT_003dcfa0` = 160; D:L90427-90435 |
| the values' y | `DAT_00414920` + 18i: **`.bss`**, no bytes in the file (`ElfImage.offsetOf` null) | `SPECTATOR_INFO_VALUE_Y_PLACEHOLDER` |
| the colours | `0x414900` / `0x414910` at init (D:L90399, D:L90413), then `0x414928` (a SEAL), `0x414938` (a Terrorist), `0x414948` (an escortee), `0x414958` (none) each frame (D:L90237-90304): all **`.bss`** | `SPECTATOR_INFO_RGB_PLACEHOLDER` |
| FREE CAMERA's bar | (100, 100, 100), `FUN_00364930(0x42c80000 x 3)` (D:L90328) | read |

Each frame (`FUN_002425e0`), by the camera's viewed actor (`FUN_001fcd70`):
- **the spectator's own object** (free and scenic): the stats panel hidden (D:L90238); the title is the camera's
  `+0x114` string when it has one (the scenic view's `Desc`, research 276 §7) (D:L90239-90256), else "FREE CAMERA"
  (0x3e6ec8) over the (100, 100, 100) bar (D:L90326-90328). The string is the scenic view's only: `FUN_00295260`
  (called only from `FUN_0029b0c0` D:L142660 with the camera's `+0xf4` block) zeroes the `+0x114` word at the top
  of every camera tick whenever the mode byte is not scenic (D:L139467-139472), so after scenic -> free (mode 0,
  D:L139482-139483) the title is FREE CAMERA again within a frame -- as `spectatorHudView`'s scenic-only title. (A
  reading that the free camera kept the last scenic name, from the writes at `FUN_002ab260` and the init's clear
  alone, was raised and retracted on this re-read, 2026-10-11, by the playtest lane's fresh reviewer.);
- **another actor**: the title is its name (`+0x14`, " " 0x3e6e78 without one), `"[%s] %s"` (0x3e6e80) with a clan
  tag of two characters or more (D:L90258-90272); a SEAL (`FUN_002c31d0`) or a Terrorist (`FUN_002c30b0`) shows the
  stats (D:L90297-90305), anyone else hides them (D:L90277-90294);
- the values (D:L90308-90325): kills `+0x550` + `+0x598`, deaths `+0x556` + `+0x59e`, headshots `+0x544` + `+0x58c`,
  score `+0x580` + `+0x5c8` -- the match block plus the round block (research 91 §8).

The page draws the stats from the room's score rows (`NetPage.rows`: kills, deaths, score -- the room's own tally, which
the scoreboard draws); the rows carry no headshots (`SPECTATOR_HEADSHOTS_PLACEHOLDER`). A followed body with no row (a
hostage) has its stats hidden, as an escortee's are.

## 3. The help lines (the spectator's)

| what | value | source |
|---|---|---|
| text | "You are a spectator.  Use the directional" / "buttons to cycle through active players" / "and fixed views.  \xa6 Use the Free-Motion" / "Camera.  \xac Jump to visible players." (0x3e30f0, 0x3e3120, 0x3e3150, 0x3e3180; the bytes 0xa6 and 0xac are `PAD_GLYPH.CROSS` and `.TRIANGLE`, `packages/scene/src/uiFont.ts`) | D:L56869-56872 |
| place | centred (`+0x69`, D:L56883; `FUN_00362900` D:L260684-260688) on x 324, at y 380 + 18i | `DAT_003dc3b8/c0/c8` = 324, 380, 18; D:L56884-56885 |
| scale | 0.9 (`0x3f666666`) | the HUD's init, D:L57298-57299 |
| colour | (100, 100, 20): the text's `+0x48/+0x4c/+0x50` (the timer's colour words sit at the same offsets, D:L57394-57396) | D:L57301-57303 |
| alpha and timing | 100 (`0x42c80000`) to 10.0 s, then `(1 - (t - 10) / 0.5) x 100` to 0, the clock then parked at -1 (D:L56541-56562); the clock is zeroed at the HUD's init (D:L57498), at each round start (`FUN_001fb420`, D:L57663), and at the local body's death (D:L56631-56645, the dead's lines) | `SPECTATOR_HELP.hold`, `.fade` |
| hidden | with the scoreboard up (D:L56817-56823), with the command menu open (D:L56617-56622), at control state 3 (D:L56887-56892) | |

The pad glyphs are drawn from `font_special_01.tif` in their own colour with no shadow (`./hudFont`, as WEAPON
EXCHANGE's lines are); the line's shadow is `min(alpha, 96)` (`FUN_003625e0`, as `./weaponSelect` reads it).
Lines 5 and 6 are shown (D:L56891) but this path never writes them: `SPECTATOR_HELP_TAIL_PLACEHOLDER`.

The page's help clock starts when the HUD becomes a spectator's (the page's nearest moment to the spectator's HUD init)
and at `startRound`.

## 4. The info box for a viewed body (`FUN_00238500` D:L85542-85580)

- The bar is the viewed actor's (`FUN_00241cc0(+0x20, viewed)`, D:L85555-85556): its fill the viewed actor's overall
  health `+0x1044` (D:L89957), which a console that does not own the body makes from its six part bytes (research 321
  §4.2.1). **LATER 119 (2026-10-19; reading, pending review):** the room's `health` event (NU-3c) already carries those
  bytes to the seat's side and to the spectators (`TEAM_HEALTH_RECIPIENTS_ADAPTATION`: never to the other side's seats),
  so the page draws the followed body's bar from `NetClient.healthOf` on a spectator's follow and on a dead player's
  watched teammate (`SPECTATOR_FOLLOWED_HEALTH_READING`); a body the room never sent and a replay (`ReplayClient
  .healthOf`) draw none. Not drawn (the fresh review's F2): the bar's loss flash -- `FUN_00241cc0`'s third part (`+0x130`,
  the trail `+0x1c0`/`+0x1c4`, D:L90009-90035), shown as the fill drops and reset when the viewed actor changes (the
  `+0x1c8` compare, D:L89961-89972) -- the page draws the fill and the lost part only, as for the walker's own bar and the
  reticle's (research 321 §4 part 4). *(Was: "No snapshot carries another body's health ... the followed body's bar is not
  drawn (`SPECTATOR_FOLLOWED_HEALTH_PLACEHOLDER`)" -- written before NU-3c.)*
- In free and scenic the viewed actor is the spectator's own object, whose bar and name the original draws
  (`SPECTATOR_OWN_INFO_PLACEHOLDER`). **Read for LATER 119** (reading, pending review; not built): online
  (`DAT_0045a0c1`), `FUN_002c2fd0(viewed)` answers for a watcher -- the actor's slot record flagged 0x10000 (research
  159: a watcher's slot), the local actor's through `FUN_002f6d00(0x44f370)` -- and `FUN_00241cc0` then forces the fill
  to 0 and takes the colour `0x4148f0` for the `0x4148d0` it uses otherwise (D:L89959-89978, D:L89990-89991): the
  spectator's own object shows an **empty bar** in that colour. H242 (2) shows it.
- The name is the viewed actor's `+0x14`, `"[%s] %s"` (0x3e6718) with a clan tag of one character or more
  (D:L85558-85569). When its width is over `DAT_003dcc70` - 4 (134 - 4 = 130), it is cut to its first nine characters
  and a "-" (D:L85571-85576). The page draws this cut (`INFO_NAME_CUT`); a walker's name is empty on the page, so
  only a followed name meets it.
- **Found in passing, for the HUD's seat** (not changed here): the name's text is set up with `+0x330` =
  `DAT_003dcc58` = 0.8 (D:L85612, D:L85646) and placed at (555, 409) (`DAT_003dcc48/50`); `HUD_LAYOUT.info.name` has
  scale 0.9 and y 411, measured on the Vigilance frames. Whether `+0x330` (the text's `+0x40`) is the scale is not
  read.
- The voice element of `HUD_LAYOUT.voice` is the info box's `+0x390` child (`FUN_00238f50`, D:L85656). D:L56811 hides
  the info box under the scoreboard, and the info box's hide `FUN_00238420` (the table 0x405b40 + 0x18, read off the
  ELF) calls the element's own hide (D:L85523): AD-7 (2026-10-16, note 227 §2.8) put `voice` in `SCOREBOARD_HIDES` and
  retired `VOICE_HUD_SCOREBOARD_READING` (note 227 §3). (Was: "that a hidden parent hides its child is inferred, so this
  is evidence toward `VOICE_HUD_SCOREBOARD_READING`, left as it is.")

## 5. What the page does now

`Hud.setSpectator(view: HudSpectatorView | null)` -- one idempotent set-state; `null` is the walker's HUD, unchanged.
The view's `path` names the original's path:

| path | drawn | hidden | cites |
|---|---|---|---|
| `'spectator'` (the default) | the round timer and its box, the followed body's name and bar (LATER 119: its health from the room's bytes, `healthOf`), the panel, the four help lines, the main window and the round start's fader, the voice element; the scoreboard on SELECT | the weapon box, the compass and its marks, the prompts and the hold bar, the stance word, the ZOOM and scope lines (the number at (587, 433) drawn since HUD-ALIVE's review fold, 2026-11-09: §6; was hidden) | §1, §2, §3 |
| `'teammate'` | as a spectator, less the panel; the watching help lines (§8; was: none); the weapon box's panel and the teammate's held item's icon (§9; was: not drawn, `DEAD_WATCH_WEAPON_BOX_PLACEHOLDER`) | as a spectator, less the box's panel and icon: its rounds, MAGS and fire-mode row stay hidden (`TEAMMATE_HIDES`) | `FUN_001f9f20`; `FUN_00237e50` |
| `'own'` | the walker's HUD; the dead's help lines (§8; was: WEAPON EXCHANGE's overlay) | the compass and its marks | D:L57115; a ghost on its own object too (§7) |

A view is drawn whether or not the walker's HUD is on (`setVisible`): a replay's watcher has no walker.
`spectatorHudView(page, walk)` turns a page's `NetPage` state into the view, for both pages (and the replay's
watcher, which builds a watching `NetPage`): a spectator's follow target, its name (`nameOf`) and its row's tally; on a
scenic view, the view's `Desc` as the title (the HUD reads them through `NetPage.scenicViews()` -- PF-31: the pages never name them -- the list `./matchNet` gives
`NetPage`'s camera, so the title and the camera index the same views); a benched player's watched teammate; a dead
player on his own body.

**The walker's scoreboard** (D:L56808-56827) now hides the info box (`bar`, `name`, `box`) and the number (`range`)
with the rest (`SCOREBOARD_HIDES`), and the panel and the help lines. The Modern board's clearance list
(`SCOREBOARD_KEEPS_BOTTOM`) is what is left: the stance word and the ZOOM line. So the Modern presentation's board (a
browser adaptation, the owner's ruling of 2026-09-29: "a bit smaller" to clear the bottom HUD) shrinks less: 16:9 0.8957
to 0.9268; 16:10, 4:3 and a phone upright 0.8911 to 0.9187; 21:9 (1) and a phone sideways (0.9602) unchanged
(`test/scoreboard.test.ts`). The PS2 presentation's board is unchanged.

**Not done here, and why:**
- The followed body's bar: no health on the wire (§4). A room change carrying each body's overall health to a
  spectator settles it. *(2026-10-19, LATER 119: drawn -- the bytes were already on the wire since NU-3c; §4.)*
- A dead player watching a teammate: the teammate's weapon box (`FUN_00237e50`, D:L57180; its update reads the viewed
  actor's kit, `FUN_00237760` D:L85148-85156) needs the remote body's kit, private to `remotePlayers.ts`, which this
  task may not touch. *(2026-10-18, LATER 117: drawn, §9 -- the room's bodies carry the held item; no `remotePlayers.ts`
  read was needed.)*
- The dead's own help lines (`FUN_001f97b0`, `FUN_001f9f20`, research 91 §12): not drawn on either page today, and not
  in this task's set. *(2026-10-18, LATER 118: drawn on the HUD on both paths, §8.)*
- The reticle on a dead player's own body (`FUN_001f7a90` D:L56394-56397 shows it): `matchFirearm.ts`'s
  `reticleShown` hides it while dead; not this task's file.
- The clan tag forms (`"[%s] %s"`): the page's names (`NetPage.nameOf`) carry no tag. *(2026-10-15, AD-13: every seat's tag,
  a spectator's own included, is on the page's board now -- the room's `seatClans`, `NetClient.clans`, research 275 §5
  item 5 -- so the info box's "[tag] name" is a drawing away; not drawn here.)*
- The command menu's and state 3's hides of the help lines: the page has no control state for a spectator.
  *(2026-10-18, LATER 118: the Chat menu's, control state 2, is the page's `model.commandMenu` -- hidden for every seat,
  §8; state 3's stays undone.)*

## 6. Placeholders and readings

| name | value now | what settles it | status |
|---|---|---|---|
| `SPECTATOR_INFO_RGB_PLACEHOLDER` | the HUD's panel colour (1, 1, 1) for the title bar and the stats panel; FREE CAMERA's (100, 100, 100) is read | the `.bss` colours at 0x414900-0x414960 (§2): a memory read of the running original, or a capture of the panel following each side | open |
| `SPECTATOR_INFO_TEXT_RGB_PLACEHOLDER` | the HUD's string colour (`HUD_COLOURS.text`) for the title, labels and values | the panel's texts take no colour in `FUN_00242bb0`; what the `+0x7c` set-up leaves is unread. A capture of the panel | open |
| `SPECTATOR_INFO_VALUE_Y_PLACEHOLDER` | the labels' baselines, 346 + 18i | `DAT_00414920` is `.bss` (§2); as the colours | open |
| `SPECTATOR_HEADSHOTS_PLACEHOLDER` | null: the label drawn, the value empty | the room's score rows carry no headshots (`net/protocol.ts` `ScoreRow`); the original's is `+0x544` + `+0x58c` (D:L90318-90319). An additive field on the rows | open |
| `SPECTATOR_FOLLOWED_HEALTH_PLACEHOLDER` | was: null, the followed body's bar not drawn | §4: retired by LATER 119 (2026-10-19) for `SPECTATOR_FOLLOWED_HEALTH_READING` | retired |
| `SPECTATOR_FOLLOWED_HEALTH_READING` | the followed body's bar from the room's six part bytes (`NetClient.healthOf`, `partHealthOf`), on a spectator's follow and a dead player's watched teammate; none for a body the room never sent or a replay | §4: H242 (1), a capture of a spectator following a wounded player, settles it at proven; the bytes' cadence is research 321 §4.2.1's | reading, pending review |
| `SPECTATOR_OWN_INFO_PLACEHOLDER` | the info box's name and bar not drawn in free and scenic | §4: the spectator's own object's name and bar (his tag held on the page's board since AD-13, 2026-10-15: `NetClient.clans`); LATER 119's read: online the bar is forced empty in the colour `0x4148f0` for a watcher (`FUN_002c2fd0`, D:L89959-89991); a capture of a lobby spectator in the free camera | open |
| `SPECTATOR_INFO_NUMBER_PLACEHOLDER` | was: the number at (587, 433) not drawn for a spectator or a dead player watching | settled by HUD-ALIVE's review fold (F3, 2026-11-09; reading: the fold re-reviewed PASS WITH FINDINGS, per the merge cb57fe15c): `FUN_001f7ff0` writes the number online each frame with no test of the seat (D:L56605-56613), the hide-all hides it offline only (D:L56320-56324), and the SPECTATOR HUD option shows it each frame (D:L56803-56806), the board or the option off hiding it (D:L56826) -- so every seat sees the connected consoles' count (research 87 §1.12; `hud.ts` `infoNumberText`, the 'range' element out of `SPECTATOR_HIDES`); the constant removed | retired |
| `SPECTATOR_HELP_TAIL_PLACEHOLDER` | help lines 5 and 6 not drawn | §3: shown but never written on this path; a capture of a lobby spectator's first ten seconds | open |
| `DEAD_WATCH_WEAPON_BOX_PLACEHOLDER` | was: a dead player watching a teammate, the weapon box not drawn | §9: the panel and the teammate's held icon drawn from the room's bodies (LATER 117, 2026-10-18) | retired |
| `DEAD_WATCH_HELD_ICON_READING` | "the snapshot's held item, each frame": the watched body's `BodyState.weapon`, its `IconTextureName`; a dead watched teammate keeps the room's last item | §9: the original redraws the icon on the viewed kit's change mark -- a remote copy's receipt of it not traced, nor the death's drop's effect on the slot shown; a capture of a dead player watching a living teammate who swaps, then a dead one | open |
| `DEAD_HELP_GHOST_CLOCK_READING` | `'first dead view'`: a ghost's help clock starts as its first dead view, own or teammate, replaces the walker's or a spectator's view (`Hud.setSpectator`; a promoted spectator's too, F1) | §8: the original zeroes the clock at the HUD's init, a round start and the camera's edge onto the dead local body (D:L56631-56645, D:L56754); no write at a ghost's seating was found, so a late joiner's lines run from its HUD init -- a promoted spectator following a living player meets the original's own edge on 'own'. The page has no such moment and takes the ghost's first dead view, as §3 takes the spectator's arrival. A capture of a late joiner's first seconds | open |
| `SPECTATOR_HUD_OPTION_READING` | (*note only*) the SPECTATOR HUD option is on: the spectator set is drawn | research 276 §7: the byte is 1 in the ELF's data (0x3dc3e0, re-read here through `ElfImage`), set to 1 again at the HUD's teardown (D:L57799); the page offers no such option | *note only* |

## 7. A ghost's HUD (PAR-48b, 2026-10-12)

Status: **reading, pending review** (the decompilation re-read at every line cited; the ELF's strings read through
`tools/elfImage.ts`, `ElfImage.cstr`, by a throwaway script outside the tree). Nothing measured running. The row is
PARITY-2's PAR-48b ([brief](../plans/briefs/2026-10-12-par48b-ghost-hud.md)); the finding was the rendered spec's
(`e2e/spectatorHud.spec.ts`, 2026-10-12): a ghost of round 1 drew no view.

**Who a ghost is in the original.** The game's byte `DAT_00437ce8 + 0xd2` (research 91 §12: the late joiner's,
UIMnLOC 352-353): set in `FUN_001f5e70` (D:L55715-55728, D:L55727) for a seat that is not a spectator
(`FUN_002c2fa0` zero, D:L55725-55726), cleared at the round's reload in `FUN_002232a0` (D:L75846-75847), which then
calls `FUN_00543b90` on the local actor (D:L75848-75849): the body's `+0x9c` set to 1.0 (D:L410380, the body alpha
the respawn waits on, research 91 §4) and its event 0x1f posted (D:L410403). A ghost never respawns (`FUN_00592560`
D:L451699: the respawn requires the byte 0; D:L451681 is the branch for respawn off, a ghost or a spectator).

**What the HUD draws a ghost.** The frame's dispatch (`FUN_001f7ff0`, §1) tests the ghost byte nowhere in its alive
branch (D:L56564-56583) itself, but that branch calls `FUN_001f9f20` when the camera is on another actor (D:L56579), so
that function's ghost lines can also be reached by a seat that is alive; `FUN_001f97b0` has one caller only, the
not-alive online non-spectator path (D:L56592; the two paths D:L56589-56595):
- **on its own object, `FUN_001f97b0`** (the byte at D:L56996): "You are a ghost.  You will play the next" (0x3e31c0,
  D:L57049) / "round as a real player.  %c Select new" (0x3e31f0, D:L57056) and, with respawn off, "weapons. Use the
  £ and ¯ directional" (0x3e3280, D:L57059) / "buttons to cycle through living teammates." (0x3e32b0, D:L57060); then
  the same HUD as the dead's own body (the walker's HUD, the compass hidden: D:L57112-57118, §1);
- **on another body, `FUN_001f9f20`** (the byte at D:L57149): 0x3e31c0, "round as a real player.  Use the £ and"
  (0x3e33b0), "¯ directional buttons to cycle through" (0x3e33e0), "living teammates." (0x3e3410) (D:L57162-57165);
  then the hide-all and the watching set (D:L57174-57183, §1).

So a ghost is drawn as the dead online player is: **`own`** on its own object, **`teammate`** on a teammate. That the
ghost's alive bit (`+0xe1` bit 4, D:L56564) is clear is read from this structure -- `FUN_001f97b0`, the own-object
ghost lines, is reached from the not-alive path only (D:L56592) -- not from a write of the bit (the review's finding 1;
`FUN_001f9f20` draws the teammate view whatever the bit). `FUN_002425e0` (§2), the brief's named path, is `CSpectatorInfo`'s frame:
its panel is shown for a spectator seat only (D:L57116-57118, D:L57181-57183), so its viewed-actor condition never
reaches a ghost, which is a player.

**What a ghost's camera views.** Both paths' lines tell the ghost to cycle the living teammates with the directional
buttons, and `FUN_005979a0` takes one branch for "respawn off, or a ghost" (D:L454484-454489, the bench): a ghost
cycles and is bound to a teammate as the dead are -- the port's `deadCycleRuns` (`seat.ghost`,
DEAD_CYCLE_RESPAWN_READING) already reads so. Where a ghost's camera stands when seated (its own object or a teammate)
is **not read**: no write of the camera's viewed actor (`DAT_00415ff0 + 0xbc`) for a ghost was found. The port's start
(its own object: `SpectatorView.bench` leaves `watching` null) is unchanged by this row; the HUD follows whichever body
is viewed. No value is introduced for it.

**The port's three places.** `spectatorHudView` (`hud.ts`) gave `own` on `walk.isDead()` only -- the walk's `dead`
(`walk.ts` :847), the server's death, which a seat that never spawned never had. `NetPage.ghostSince` (`netPage.ts`
:537; set by `seatGhost` :1195-1198 at the welcome :1252 and the promotion :1502; cleared at a spawn :1333 and a round
:1434) is private. `SpectatorView.benched` (`spectatorView.ts` :301) is public and is the page's not-alive seat until
the next round: benched by `seatGhost` and by a classic death (`netPage.ts` :1317), reset at a spawn, a round and a
welcome (`unbench`). The page already reads it so for the pad (`NetPage.spectatorCamera`, :1153-1155).

**The fix** (PAR-48b): `SpectatorHudSource.spectator` carries `benched`, and a player's view is `own` when the walk is
dead **or** the seat is benched. `NetPage.spectator` is the `SpectatorView`, so both pages' one call,
`spectatorHudView(net, walk)` (`main.ts` :1484, `matchMount.ts` :798), takes it with no page line changed. A classic
dead player (benched, the walk dead) is unchanged; a respawn room's dead (not benched, the walk dead) is unchanged.
Tests: `test/hud.test.ts` ("PAR-48b: a ghost ...", the source's shape) and `test/netRules.test.ts` ("PAR-48b: a
ghost's HUD through the page ...": a real `NetPage` seated a ghost by the welcome and by a promotion, `own`; cycled to
a teammate, `teammate`; at the next round, none). The rendered case (`e2e/spectatorHud.spec.ts`, "the ghost: ...") is
un-fixme'd with its expectation as written (its first view `own` or `teammate`, then `teammate` naming BRAVO): written,
**not run**.

**Not done here.** The ghost's own help lines (above) are WEAPON EXCHANGE's prompt on the page (`promptLines`, S1g),
not the HUD's six lines (§5's "Not done"; *2026-10-18: the HUD's since LATER 118, §8*); a dead player reached by a real death in the rendered spec is owed (the
brief); where a ghost's camera starts (above) is open.

## 8. A dead player's help lines (LATER 118, 2026-10-18)

Status: **reading, pending review**. The decompilation (`socom2_game.elf.decomp.c`) was re-read at every line cited; the
ELF's strings and the three placement words were read off `$SOCOM_PC_ROOT/game/disc/socom2_game.elf` through the
repository's ELF reader (`tools/elfImage.ts`, `ElfImage.cstr` / `u32`) by a throwaway script, deleted. Nothing measured
running. The row is LATER 118 (issue #138; PAR-48c's review F1); the code is `packages/viewer/src/hud.ts`
(`spectatorHudView`, `HudSpectatorView.help`, `Hud.setSpectator`, the help draw in `hudLayout`) and
`packages/viewer/src/weaponSelect.ts` (`deadHelpLines`, `DEAD_WATCH_PROMPT`, `GHOST_WATCH_PROMPT`, `HELP_BLANK`).

**The six widgets.** The HUD's text lines at `CHUD+0x19d58 + 0x98 i`, i 0..5. Each path writes all six every frame,
then places and shows them alike: centred (the text's `+0x69`), at x `DAT_003dc3b8` = 324, y `DAT_003dc3c0` +
i x `DAT_003dc3c8` = 380 + 18 i (the three words 0x43a20000, 0x43be0000, 0x41900000 read through `ElfImage.u32`), shown
(`+0x1c`), or hidden (`+0x18`) at control state 3 -- on his own body `FUN_001f97b0` D:L57120-57135, watching
`FUN_001f9f20` D:L57191-57205, the spectator `FUN_001f9160` D:L56881-56895. Scale 0.9 and colour (100, 100, 20) are the
HUD init's (D:L57299, D:L57301-57303).

**The texts** are the ELF's strings passed by address (not the loc tables: HudCLOC 60486 is only the init's text,
D:L57297; research 94 §B). `%c` is the Inventory glyph (0xbe when `FUN_002c6430(4)` is 11, else 0xbd; the page keeps R2,
`INVENTORY_GLYPH`); `£` / `¯` are 0xa3 / 0xaf, the d-pad's right and left (`DPAD_GLYPH`); 0x3e31b0 is a single space.

| state (respawn off) | lines 1..6 | cite |
|---|---|---|
| dead, own body | 0x3e32e0 "You have died.  %c Select new weapons." / 0x3e3350 "Use the £ and ¯ directional buttons" / 0x3e3380 "to cycle through living teammates" / 0x3e31b0 x 3 | D:L56997-57007, D:L57040-57046 |
| ghost, own body | 0x3e31c0 "You are a ghost.  You will play the next" / 0x3e31f0 "round as a real player.  %c Select new" / 0x3e3280 "weapons. Use the £ and ¯ directional" / 0x3e32b0 "buttons to cycle through living teammates." / 0x3e31b0 x 2 | D:L57049-57060, D:L57100-57106 |
| dead, watching a teammate | 0x3e3430 "You have died.  Use the £ and ¯" / 0x3e3450 "directional buttons to cycle through" / 0x3e3410 "living teammates." / 0x3e31b0 x 3 | D:L57150-57159 |
| ghost, watching a teammate | 0x3e31c0 / 0x3e33b0 "round as a real player.  Use the £ and" / 0x3e33e0 "¯ directional buttons to cycle through" / 0x3e3410 / 0x3e31b0 x 2 | D:L57162-57172 |

With respawn on (read, **not built**: `RESPAWN_RULES_ENABLED` is off by the owner's ruling of 2026-09-29), the dead's
line 2 is a space until 5 s dead with the body faded and the seat no spectator, then "Press the %c button to respawn."
(0x3e3310 / 0x3e3330), set to alpha 100 every frame so it outlives the fade (D:L57008-57038); the ghost's line 3 is
"weapons." (0x3e3270) or the respawn forms 0x3e3220 / 0x3e3240 (D:L57063-57098). The page keeps its respawn line in the
message window (`NetPage.frame`) and gives a respawn room's dead (not benched) no help lines.

**The clock** is one, `+0x1a0e8`: counted up by the frame's time; lines 1-4 at alpha 100 to 10 s, then
(1 - (t - 10) / 0.5) x 100, the clock parked at -1 at 0 (D:L56541-56562); lines 5-6 never faded. Zeroed at the HUD's init
(D:L57308 sets -1, D:L57498 0), at a round start (`FUN_001fb420` D:L57663), and at the **camera's** edge onto the dead
local body: `DAT_00408f08` is set every frame to the **viewed** actor's alive bit (D:L56754), and D:L56631-56645 zeroes the
clock when last frame's viewed actor was alive and this frame's is dead and is the local one (D:L56642). So the local
death seen on his own body is an edge, and so is the camera moving back onto his own dead body from a living teammate
(or from a spectator's view of a living player); moving on to a teammate is none (alive, not local), nor is coming back
from a dead watched teammate (dead to dead). The watching lines are lit only within 10.5 s of the last edge.
*(Corrected 2026-10-18 by LATER 118's fresh review, F1: this paragraph first read the edge as the local death alone.)*

**The hides, for every seat:** the Chat menu (control state 2, D:L56617-56622; NU-9 T3 reads the same lines for the
team tags), the scoreboard or the SPECTATOR HUD option off (D:L56817-56823), control state 3 (above). The hide-all
`FUN_001f77c0` does not touch them (D:L56312-56361).

**The page.** Was: the dead's own-body lines drawn by WEAPON EXCHANGE's overlay (`promptLines`, the element
`weaponSelect`, on the page's clock `NetPage.prompt().sinceDeath`) -- outside `Hud.state().rects`, not hidden by the
scoreboard or the Chat menu; the watching lines drawn nowhere. Now:
- `spectatorHudView(page, walk, views?, device)` gives a benched seat (classic's dead, a ghost) its six lines as
  `HudSpectatorView.help` (`deadHelpLines`; the ghost's by `SpectatorHudSource.ghost`, `NetPage.ghost`), the `%c` for
  the page's prompt device (`/testroom`'s `promptDevice()`; the front end's `promptDeviceOf(pads, 'pad')`, its line
  owed after LATER 129's reshape of `matchMount.ts`'s frame; absent, the pad's).
- `hudLayout` draws the help lines for every path from one block (`SPECTATOR_HELP`'s place, scale, colour and the
  shadow `min(alpha, 96)`), the spectator's four or the view's six, on `timing.help`, none while `model.commandMenu`.
- `Hud.setSpectator` zeroes the clock on the camera's edge: onto 'own' from a living body's view -- the walker's own
  (null), a spectator's view, a watched teammate the view does not mark `watchedDead`; never onto 'teammate' from
  'own', never onto 'own' from a dead or gone watched teammate. `spectatorHudView` marks `watchedDead` from the room's
  bodies (`SpectatorHudSource.client.bodies`, the page's public `NetPage.client`: the body's Alive flag clear, or the
  body gone -- a leaver's actor is killed, `FUN_005477a0(0, ...)` at D:L455521, then retired to state 8 at D:L455525,
  under `FUN_005998b0`). Onto 'teammate' from the walker's or a spectator's view (a
  ghost's or a promoted spectator's first dead view) it zeroes too, under `DEAD_HELP_GHOST_CLOCK_READING`.
  *(Corrected 2026-10-18, F1: was "as a dead path replaces the walker's null view; never on own <-> teammate".)*
- `./matchExchange`'s overlay draws the menu alone; its `prompt()` (the touch INV button's cue) and the hook's
  `state().prompt` read keep the lines' text.

**Not done.** The respawn-on lines (above); control state 3's hide (the page has no such state); a ghost whose walk a
drop gave back alive is drawn the dead's texts (`NetPage.ghost()` false while `ghostSince` holds).

## 9. A dead player's view of a teammate's weapon box (LATER 117, 2026-10-18)

Status: **reading, pending review**. The decompilation (`socom2_game.elf.decomp.c`) was re-read at every line cited; the
three widget tables and four strings were read off `$SOCOM_PC_ROOT/game/disc/socom2_game.elf` through the repository's
ELF reader (`tools/elfImage.ts`, `ElfImage.u32` / `cstr`) by a throwaway script, deleted. Nothing measured running. The row
is LATER 117 (issue #138; PAR-48c); the code is `packages/viewer/src/hud.ts` (`HudSpectatorView.weaponIcon`,
`spectatorHudView`'s fifth argument, `TEAMMATE_HIDES`, `HudView.icon`), `packages/viewer/src/loadout.ts` (`itemIcon`), the
two pages' one line each (`main.ts`, `matchMount.ts`), and the PAR-48c check (`e2e/spectatorHudSet.ts`'s `TEAMMATE_BOX`
and its `icon` comparison, asked by `e2e/spectatorHud.spec.ts`'s two teammate steps).

**What the original shows.** On the watching path `FUN_001f9f20` calls the box's show `FUN_00237e50` (D:L57180), outside
control state 3 (D:L57175). The show passes online for a seat that is not a spectator (D:L85354-85356) and shows the panel
`+0xc` (`newweapnbkrnd.tif`; D:L85358), the group `+0x270` (D:L85359), the fire-mode cells by the last update's state
(`FUN_00237b40`, D:L85360) and the MAGS text by its flag (D:L85361-85366); then, when the camera's viewed actor
(`FUN_001fcd70`) is not the local one (`FUN_002b3580`, `DAT_00440c38`), it hides the group `+0x270` again
(D:L85367-85371).
- The group's children (`FUN_00237fc0`, D:L85433-85456): "%d/%d" `+0x288` (0x3e66b8), "%d MAG%c" `+0x320` (0x3e66c0) and
  the four fire-mode cells `+0x3c0`. The group's class table (0x406ef0, set by `FUN_00365100`, read off the ELF): +0xc
  `FUN_00364e70`, the draw, which walks the children only while the widget's shown bit (`+0x14` bit 0x40) is set
  (D:L262111-262115); +0x18 `FUN_00364e50`, the hide (the bit cleared); +0x1c `FUN_00364e30`, the show (the bit set).
  So none of the three is drawn on a teammate.
- The icon `+0x1f0` is the panel's child (D:L85423-85425); the panel's draw `FUN_00359520` (D:L255103-255109; its table
  0x406c30 +0xc, read off the ELF) draws its own quads and then its children (`FUN_00364e70`). Neither the show nor the
  hide (`FUN_00237de0`) hides the icon on its own, so it is drawn with the panel.
- **Whose icon.** The update `FUN_00237760` reads the viewed actor's kit (`FUN_001fcd70()` + 0x5e0, D:L85148-85156) and
  puts the current item's bitmap (`FUN_005be050` D:L474764: the item's `+0xbc`) on `+0x1f0` (D:L85245-85249) -- the
  watched teammate's held item, the field the walker's box draws (research 94 §C9: the record's `IconTextureName`). The
  frame runs the update when the viewed kit is marked changed (`FUN_005bc2c0`, D:L56732-56734): the teammate cycle marks
  it as it moves the camera (`FUN_00546fa0` D:L412619, `FUN_00547170` D:L412676), and the kit marks it at its own
  changes -- the slot (`FUN_005c4b10` D:L478913), the fire mode (`FUN_005c4600` D:L478609, `FUN_005c37b0` D:L477869).
- The box shares the walker's fade (`FUN_00237d00`), the scoreboard's hide (D:L56810) and the hide-all's (D:L56340); the
  Chat menu does not hide it. A lobby spectator gets none (D:L85354; §5).

**The wire.** The room sends every page each body's held item, `BodyState.weapon` (protocol 7: the item id, 255 none),
in every snapshot -- the body list LATER 118 reads for liveness (`client.bodies()`). Another body's rounds, magazines and
fire mode are not on the wire; the original's character message carries rounds and magazines per kit entry (research 94
§A6, `FUN_0053ed50` D:L407397), but the watched box hides them (above), so no protocol change is owed.

**The page.** `spectatorHudView(page, walk, views, device, icon)` gives a `'teammate'` view the watched body's held item's
icon (`weaponIcon`) through `icon`, the page's `itemIcon(loadouts.tables(), id)` (both pages); none for 255, an id the
arsenal lacks, a body gone, or no resolver -- the panel alone (`FUN_005be050` gives no bitmap with no current item,
D:L85245-85249). `hudLayout` draws on `'teammate'` the panel and that icon at the walker's box's place, and hides the rest
of the box (`TEAMMATE_HIDES`: `SPECTATOR_HIDES` less `'panel'` and `'icon'`). `Hud.state().icon` is the bitmap the icon
draws on the last frame, so the PAR-48c check compares it with the watched teammate's own held icon (that teammate's
page's `Hud.state().model.weaponIcon`): a page drawing the dead player's own icon there is a finding. When the two hold
the same item the rendered comparison cannot tell them apart; the unit test's case holds two different ones.

**Not settled** (`DEAD_WATCH_HELD_ICON_READING`): the page takes the snapshot's item each frame where the original redraws
on the viewed kit's change mark -- whether the receipt of another console's character message marks a remote copy's
kit is not traced; and a dead watched teammate (LATER 69) keeps the room's last held item (`room.ts` `bodyOf`,
`p.held ?? p.loadout[slot]`) where whether the original's drop at death (`FUN_005a0040` D:L458646-458706,
`FUN_0059f730`) empties the slot the box shows is not traced. Control state 3's hide (D:L57175) is undone, as §8's.
