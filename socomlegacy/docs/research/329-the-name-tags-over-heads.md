# 329 -- The teammates' name tags over their heads, online (NU-9 (c), PARITY-2)

- Date: 2026-10-15 (01:30Z). The next-update checklist's row NU-9, its part (c) by the owner's answer NU.R6 ("please
  include a, b, and c together for that batch"). **A read alone**
  ([brief](../plans/briefs/2026-10-15-nu9c-overhead-tags-read.md)): the build is a later brief, from section 5. It
  reads the placeholder `MP_TEAM_NAME_TAGS_PLACEHOLDER` (research [227](227-voice-ui.md) §3, LATER 25). Branch
  `agent/nu9c-read` from `faa2ee886`.
- Review: a fresh review of `0910add05` returned **FAIL (high)** on one blocking finding (F1: TEAMMATE NAMES hides
  only the name texts; the talk sprites are the HUD's own and still drawn) and three lows (F2: the spectator's team
  word; F3: `FUN_00290370`'s callers; F4: `FUN_001f7560`'s show). It re-read the rest at the source, the `+0x17b64`
  link and T5 among them. F1-F4 are folded here (2026-10-15), each re-read at the source by this note's author, the
  text they corrected kept beside ("was: ..."). The status is unchanged.
- Re-review: a narrow re-review of `4071b36c3` returned **FAIL (high)**: F1-F4 resolved; one new blocking claim from
  the fold (N1: the HUD's own hide does not hide the talk sprites either) and one low (N2: `FUN_001f7560` is the
  scope's "normal" switch, not the tactical map's close). Both folded here (2026-10-15), re-read at the source, each
  with a "was" beside. The status is unchanged.
- Second re-review: a narrow re-review of `6298a7caf` returned **PASS WITH FINDINGS (high)**: N1 and N2 resolved, no
  other path hides the sprites; three lows (one function's two names, the capture's steps, a RED for the dead
  player's teammate view) folded here (2026-10-15), each with a "was" beside. The status is unchanged.
- Build (2026-10-15, `agent/nu9` from `be772ae59`; [brief](../plans/briefs/2026-10-15-nu9-names-build.md)): **T1, T2 and
  T3 built**, each RED first. T1: `teamTags` (`packages/viewer/src/hudTags.ts`: whose tag, the head 3 up projected, none
  behind the eye, the text and the alpha) and `teamTagLayout` (`hud.ts`: the bounds, the clamp, `FUN_00227130`'s push,
  eight drawn, the holder's sprites) -- the layout in the HUD because it needs the frame's own width (the PS2
  presentation draws a non-square camera into 640x448); `teamTagInput` builds the input from the page (the rows by
  member id, `RemotePlayers.teamOf`, `deathAge`, `headAt`; the talker as VOICE-LATE (B)'s `heardTalker` names him, as
  the HUD's other voice indicators do). T2: `RemotePlayers.headAt` and `deathAge` (PAR-34's `fadeAge`, null alive; the
  brief named `headAt` only: T1's fade needs the second). T3: `Hud.setTeamTags`, `setTeammateNames`, `setCommandMenu`;
  the valve, the Chat menu, the START menu's hide-all (D:L56341) and the tactical map hide the texts only; the sprites
  stay on every path; the scoreboard keeps both; a round screen and `startRound` clear them. **T4's page wiring
  (`main.ts`, `matchMount.ts`) waits on the controller's word** (hot files: hunks reported). §6's candidates are held
  by code (four readings and the adaptation; research 101 §4 NU-9). Status of the build: reading, pending review.
- Status: **reading, pending review.** Source inspection only: the decompilation and the game ELF's bytes were read,
  the port's code was read, one committed golden was read. No game, emulator, reader, test or browser was run (no node
  process at all); no capture of a tag exists on this host, so nothing here is proven. Where the port's behaviour is
  stated it is read off its source, not run. Nothing counts as a reading until a reviewer who did not write this note
  re-reads it at the source. A step marked *inference* is one interpretive step past the code.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, re-hashed for this note). The ELF
  `game/disc/socom2_game.elf` (SHA256 `06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872`, read only, by
  its program headers, through a scratch script): the strings 0x3e54f8 `[%s] %s`, 0x3e5500 `action_ok_talk2.tif`,
  0x3e5520 `hud_arrow_off2.tif`, 0x3e5540 `DISPLAY_MP_TEAM_NAMES`, 0x3e54b0 `CMPTeammateNames` (the class name the
  part's vtable's type record 0x3e54f0 points at), the skeleton node names 0x65c4c0.. (`skel_root`, `lfoot`, `rfoot`,
  `lhand`, `spinelo`, `rhand`, `hips`, **0x65c500 `head`**, `neck`, `spinehi`); the vtables 0x4057d0 (the part: +0x18
  0x364e50, +0x1c 0x226960, +0x38 0x2269a0), 0x406df0 (a text: +0x34 0x1f9150), 0x405230 (the letterbox: +0x38
  0x1fecc0); the floats `DAT_003dc868/870/878/880` = 32, 32, 10, -7; the words of `FUN_00315580` (0x315580-0x3155bc,
  decoded by hand: §1.2). The disc's data: only the committed golden `packages/viewer/test/golden/global-valves.json`
  (its `valves[152]`, `DISPLAY_MP_TEAM_NAMES` = 1, PERSIST); no reader was run. The desktop: none read
  (`desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3` is the pin, unused). The port's lines are this branch's base
  `faa2ee886`.
- Evidence read first, not restated: research [227](227-voice-ui.md) §2.2 (the tag's talk icon and arrow;
  `tagDrawn`), §2.3 (the `WhoIsTalking` compass mark), §3; [266](266-the-chat-panels.md) §3.6 (TEAMMATE NAMES);
  [321](321-the-weapon-crosshairs.md) §4.2 (the reticle's target name and bar); [327](327-the-health-bars-names.md)
  §3.1, §4.1, §4.3; [282](282-the-spectator-hud.md) §1 (the HUD's view dispatch);
  [276](276-the-replay-viewer-to-release.md) (the control-state byte `ctrl+0x221`);
  [317](317-bodies-and-drops-on-the-ground.md) (the death's time `+0xfb4`, the game clock);
  [170](170-push-to-talk-voice.md), [189](189-h1-hostage-ai-animation.md) and
  [190](190-h2-hostage-mode-rules-map.md) (the team words); [265](265-online-options-and-online-filters.md) §1 and
  [229](229-the-options-and-personas-json.md) (the TEAMMATE NAMES valve).

## The owner's item

NU.R4's first sentence (the owner, 2026-10-15, verbatim): "First thing I noticed is that player names in online matches
aren't showing over their health bars in the bottom left UI."

NU.R6 (the owner, 2026-10-15, verbatim): "please include a, b, and c together for that batch." -- his answer to NU-9's
question, whose (c) the checklist writes as "teammates' name tags over their heads in the world
(`MP_TEAM_NAME_TAGS_PLACEHOLDER`, LATER 25 -- read first as research 329, built room and page as the read says, LATER 25
struck at the landing)".

LATER 25 as it stands (`../LATER.md`): "**Voice's carried pieces**: a spectator's RADIO-only Chat menu and the dead
player's menu tree (the original's `FUN_0027d8c0` branches ONL-16b did not build: the chat menu shows the living
player's tree to everyone); a name-tag drawer for the round's talk mark (`MP_TEAM_NAME_TAGS_PLACEHOLDER`: the mark draws
beside no name until the tags exist); the late joiner's clocks (ONL-16a's: a joiner mid-round sees the round's clock
from its own join)".

**The answer, plainly: yes.** The original draws a name tag over the head of each **teammate** in the world, online
(and, under a test this note does not settle, offline), with the TEAMMATE NAMES option on -- which it is by default.
Enemies never get one; nor do the escortees, nor the player's own body. One part draws them: `CMPTeammateNames`, the
HUD's `+0x17580`, its frame `FUN_002269a0`. The port draws none. LATER 25's tag clause is therefore **not** struck as
read: it is a build (section 5), struck at its landing as NU.R6 says.

## 0. Answers

| # | finding | the port | section |
|---|---|---|---|
| R329.1 | **The drawer is `CMPTeammateNames`** at `CHUD+0x17580`: set up at the HUD's init (`FUN_00227340`, called D:L57287 with the HUD's font `+0x498`), its vtable 0x4057d0 (the type record names `CMPTeammateNames`), its frame (+0x38) `FUN_002269a0` (D:L77307-77460), ticked every frame the camera has a viewed actor (D:L56756, inside D:L56631's test; **outside** the online test of D:L56757). Eight text objects (D:L77536-77543), the talk icon and the arrow sprites (D:L77544-77557), the part on the HUD's draw list (D:L77560) | no drawer: no source of the viewer projects a name over a body (§4.2) | §1.1, §3 |
| R329.2 | **Whose: teammates only.** An actor in the game's actor list (`DAT_004362e8`) of type 2 with a scene node (`FUN_0029ed20` = the actor's `+0x28`), the node drawn this frame or the last (`FUN_00315580(node, 2)`, §1.2) and its `+0x5c` bit 0 set, not the local player's own actor (`FUN_002b3580`), its team word (`+0xc8`) sharing a bit with the local player's, the escortee bit 0x20000 clear, and **alive or dead under 5 s** (`FUN_00548050` < 5.0) (D:L77359-77380). SEAL 0x40000001 and Terrorist 0x80000100 share no bit, and a spectator's 0x10000 shares none with either (research 189; the spectator's word, §1.2): no enemy is tagged, and a spectator sees no tags -- unless `FUN_002c3330` gave his actor a side's word (`DAT_00437dd4` 1 or 2, D:L164822-164833, unread), when he sees that side's (the review's F2; was: "(research 189, 170): ... and a spectator sees no tags") | -- | §1.2 |
| R329.3 | **The anchor: the `head` node, 3 units up.** The point is the actor's skeleton node `+0x308` -- the node named `head` (0x65c500, `FUN_00553ea0` D:L419621) -- in world space (`FUN_005a3070` D:L460118-460121: `FUN_002869d0`, then the actor's matrix), raised 3.0 on y (D:L77381-77386), projected by the camera's view matrix (`FUN_00308580`, D:L77382-77387) to the 640x448 frame (x + 320 - 2048, y + 224 - 2048, D:L77402-77403); none behind the camera (w <= 0.0001, D:L77388) | -- | §1.3 |
| R329.4 | **No range and no line of sight in the drawer.** Its only gates are R329.2's and the frame's bounds: the tag's left edge (centre less half its width) strictly inside 0..600 and its baseline strictly inside top..448 - top, `top` the letterbox bars' height (D:L77404-77405; §1.3). What hides a far or walled-off teammate is only the renderer's not drawing his model (`FUN_00315580`); which bodies the renderer culls is not read (`MP_TEAM_TAG_CULL_READING`, §6) | -- | §1.2, §1.3 |
| R329.5 | **The text: "[tag] name" online, the HUD's font at 0.9, left-aligned at a pen centred over the head, colour the text's default (255, 255, 255), alpha 100 alive.** The name is the actor's `+0x14`; online, with the seat's clan tag (`FUN_002c3ac0(+0xfc8)`) of one character or more, "[%s] %s" (0x3e54f8) (D:L77389-77398) -- the info box's rule (research 327 §1.1), not the reticle's two-character one (321 §4.2). Scale 0.9 (`+0x58` = the text's `+0x40`, D:L77539); no centring flag set (the text's `+0x69` stays 0, `FUN_00363e70` D:L261477); no colour written (the default 255, 255, 255, D:L261473-261475); the alpha 100 through the text's `+0x34`, `FUN_001f9150`, which writes `+0x54` (D:L56853-56857; D:L77427-77429) | -- | §1.4 |
| R329.6 | **A dead teammate's tag fades out over 5 s**: alpha 100 - 20 x t, t the game clock's seconds since his death (`FUN_00548050` D:L413162-413174: the clock `DAT_004365c0` less `+0xfb4`, stamped at the death, `FUN_00547af0` D:L413049; 0 while alive), gone at 5 s (D:L77377, D:L77430-77433) | the page keeps the same clock per body (`RemotePlayers` `fadeAge`, `remotePlayers.ts:738`) | §1.5 |
| R329.7 | **Overlap: a tag that would overlap an earlier one moves down 5 px until clear.** Each tag's box (pen to pen + width, baseline to baseline + the font's line height), grown by 10 on every side, is tested against every earlier tag of the frame; on a hit the new one drops 5 and the test starts again (`FUN_00227130` D:L77463-77483; D:L77412-77426). Earlier is the actor list's order, at most eight tags (D:L77357-77358) | -- | §1.3 |
| R329.8 | **The talk mark is the tag's**: on the tag of the actor whose seat holds the listener's channel (another's hold only), the arrow and the talk icon above it (D:L77348-77350, D:L77434-77443), as research 227 §2.2 reads and `hudVoice.ts` `tagTalkSprites` already holds. The tag itself changes no colour for talking, dying or side. **The two sprites are the HUD's own draw list's, not the part's children (D:L77550, D:L77557), so TEAMMATE NAMES off does not hide them**: with the option off, a teammate in view holding the channel gets the arrow and the icon over his head and no name (the review's F1) | the rule exists, drawn nowhere (no tag) | §1.6 |
| R329.9 | **TEAMMATE NAMES is the part's switch, read once at the HUD's init.** `DISPLAY_MP_TEAM_NAMES` (0x3e5540) into `+0x5e4` (D:L77558-77559) only there; the part's "show" (vtable +0x1c) is `FUN_00226960`, which sets the part's draw bit with the flag on and clears it with the flag off (D:L77292-77301) -- which draws or hides **the eight texts only**, the part's children; the frame still runs, and the talk sprites, on the HUD's list, still show over the holder (R329.8; the review's F1; was: "TEAMMATE NAMES is the part's switch" read as hiding the whole tag, sprites included). Default 1, on (the golden `global-valves.json` `valves[152]`) | the valve exists on the options pages (OPT-11, OPT-15); nothing in a match reads it | §1.7, §1.8 |
| R329.10 | **When it is shown**: the living player's own view (`FUN_001f7a90` D:L56440, every mode), dead on his own body (`FUN_001f97b0` -> `FUN_001f7a90` D:L57112), dead or a ghost watching a teammate (`FUN_001f9f20` D:L57174-57176) and a spectator (`FUN_001f9160` D:L56873-56875) unless the in-game options menu is up (control state 3), and online by the scope's "normal" switch (`FUN_001f7560` D:L56290, the opposite of `FUN_001f7360`; research 87 §13, 276; the review's F4, the re-review's N2; was: "at the tactical map's close"); its texts hidden with the command menu (state 2, D:L56617-56623) and by the hide-all `FUN_001f77c0` (D:L56341) -- the talk sprites are hidden by neither (§1.6; the re-review's N1). **Not** hidden by the scoreboard or SPECTATOR HUD OFF (D:L56808-56827 does not name it) | -- | §1.7 |
| R329.11 | **The online gate**: the frame runs in both modes; online every eligible actor passes the per-actor test (D:L77355, D:L77367); offline an actor also needs its team word's bit 0x2 or 0x40000 (D:L77367-77375), and the name goes without a clan tag (D:L77394). Whether the campaign's fire team carries those bits is not read (`MP_TEAM_TAGS_OFFLINE_READING`, §6) | the port has no campaign | §2 |
| R329.12 | **The reticle's teammate name is the blank while TEAMMATE NAMES is on**: research 321 §4.2's "the HUD's flag `+0x17b64`" is this part's `+0x5e4` (0x17580 + 0x5e4). With the option on (the default) a teammate under the reticle gets the blank " " (0x3e4840) and his 60x5 bar; with it off, his name (D:L70160-70170, D:L70213-70218) | **a correction to NU-9 (b)'s build** (research 321 C4, NU-3b): "a teammate green with its name online" holds only with the option off | §4.3 |
| R329.13 | **The room lacks nothing.** The page holds every input: names (`nameOf`), the rows' `clan`, each body's team, alive and death age, the escortees, the voice holder (research 327 §3.1, 227 §2.5). The valve must reach the match pages (page plumbing, not the wire) | page only | §4.1 |

**NU.R3: the port does not match.** The tags are a build (section 5): page only, the room unchanged.

## 1. What the original draws

### 1.1 The part

`CHUD`'s init `FUN_001fa360` builds `CMPTeammateNames` at `+0x17580` with the HUD's font (D:L57287; the font is
`font_text_01`, research 327 §1.2). `FUN_00227340` (D:L77524-77562):

- **Eight text objects**, 0x98 apart from `+0x18`: each takes the font (`FUN_00362b20`), scale 0.9 (`+0x58` =
  0x3f666666, the text's `+0x40`, research 327 §1.2's scale field), and is linked as the part's child
  (`FUN_001feae0`) (D:L77536-77543).
- **The talk icon** `+0x4e0` (`action_ok_talk2.tif`, (128, 128, 128), alpha 64, 32x32) and **the arrow** `+0x560`
  (`hud_arrow_off2.tif`, (40, 96, 110), alpha 64, 32x32), hidden, on the HUD's draw list (D:L77544-77557; research
  227 §2.2).
- **The option**: `+0x5e4` = `DISPLAY_MP_TEAM_NAMES` != 0 (D:L77558-77559). **The margin** `+0x5e0` = 0 (D:L77534).
- **The part on the HUD's draw list** (`FUN_001f6e10(HUD, part, 1, 1)`, D:L77560).

Its vtable 0x4057d0 (read off the ELF): +0x18 `FUN_00364e50` (hide: the draw bit cleared), +0x1c `FUN_00226960` (show,
below), +0x38 `FUN_002269a0` (the frame); its type record 0x3e54f0 points at the name `CMPTeammateNames` (0x3e54b0).
The round's start resets the margin and the sprites (`FUN_00227240` D:L77506-77519, called online at D:L57626 in
`FUN_001fb420`); the round's reset clears the eight texts (`FUN_002271d0` D:L77486-77501, D:L57720 in `FUN_001fb790`).
Online the two run back to back, the reset then the start (`FUN_001fb790`, `FUN_001fb420`: D:L149757-149758).

Each frame the HUD's tick (`FUN_001f7ff0`), inside its test that the camera has a viewed actor (D:L56631), copies the
letterbox's bar height into the margin (`+0x17b60` = `+0x1a224`, D:L56755) and calls the frame (D:L56756) -- before
and outside the online test that follows (D:L56757).

### 1.2 Whose tag

`FUN_002269a0` walks the actor list from `DAT_004362e8` until its end or eight tags (D:L77357-77358). An actor gets a
tag when all of these hold (D:L77359-77380):

| test | the code | what it means |
|---|---|---|
| a type-2 actor | `+0x10` == 2 (D:L77360) | a character (research 227 §2.4's TEAMMATES rows take the same type) |
| a scene node | `FUN_0029ed20` = the actor's `+0x28` != 0 (D:L77365) | the node `FUN_005a3070` takes the actor's world matrix from (D:L460120, D:L460123); research 227's `TagCandidate.record` |
| **drawn this frame or the last** | `FUN_00315580(node, 2)` (D:L77376) | the node's `+0x98` equals the frame counter `DAT_004a4490`, or (with 2) the counter less one (D:L214885-214889; the words at 0x315580: `lwu v1, 0x98(a0)`, `ld a0, 0x4490(at)`, `beq`; then `addiu v0, zero, -1`, `pcpyld v0, zero, v0`, `daddu v0, a0, v0`, `bne` -- frame - 1). The renderer stamps `+0x98` with the counter when it draws a node's parts (`FUN_003374c0` D:L235478-235481); the counter steps once a frame at the flip (`FUN_003aff30` D:L304765) |
| the node shown | `+0x5c` bit 0 (D:L77379) | *inference*: the node's shown bit, inherited from its parent when attached (`FUN_00317060` D:L215911-215917, 1 with none) |
| alive, or dead under 5 s | `FUN_00548050(actor)` < 5.0 (D:L77377) | 0 while the alive bit (`+0xe1` bit 4) is set; else the game clock less the death's time (§1.5) |
| not the local player | `FUN_002b3580()` (`DAT_00440c38`) != the actor (D:L77354, D:L77377) | the local player's own actor (the HUD's tick compares it with the viewed actor for "own view", D:L56537-56567) -- not the viewed actor, so a dead player watching a teammate sees that teammate's tag too |
| **a teammate** | `actor+0xc8 & local+0xc8` != 0 (D:L77378) | the team words: SEAL 0x40000001, Terrorist 0x80000100 (`FUN_002c32c0`/`FUN_002c32e0`, research 189 row "player team masks"; the capture cross-check, research 190), a spectator's own actor 0x10000 (made at D:L410614, `FUN_0029ed10` writing `DAT_00441470` into `+0xc8`, D:L144915; `FUN_002c3330(0x10000)` sets it, D:L159276, D:L166262): the two sides share no bit, and a spectator none with either -- **unless** `FUN_002c3330` replaced it with a side's word, which it does when `DAT_00437dd4` is 1 or 2 (D:L164822-164833; that byte unread, research 309), and then that side's tags are drawn for him (the review's F2; was: "a spectator exactly 0x10000 (research 170 C2 and its spectator channel's row)") |
| not an escortee | `+0xc8 & 0x20000` == 0 (D:L77379) | the escortee bit (research 191 row 5; research 189 row 4: the hostages' team bits 17, 30, 31 overlap both sides' masks, so this test is what keeps them out) |
| offline only: bit 0x2 or 0x40000 | D:L77367-77375 (§2) | -- |

No line of the drawer measures a distance or casts a ray. **A far teammate, or one behind a wall, is tagged whenever
the renderer drew his model this frame or the last** (*inference*: the renderer culls by what it draws; which bodies it
leaves undrawn -- outside the view, past a draw range, behind the map's geometry -- is not read here:
`MP_TEAM_TAG_CULL_READING`, §6).

**The renderer's cull, read 2026-10-24** (the console / front-end seat 02, on #504; reading, pending review -- LATER 415): the tag's two node tests (D:L77376-77379) are `node+0x5c` bit 0 and `FUN_00315580(node, 2)`, the node (`actor+0x28`, `FUN_0029ed20`) stamped this frame or the last: `node+0x98` == `DAT_004a4490` or one less. `FUN_003374c0` writes that stamp when it draws any of the node's visuals (D:L235478-235481; a visual's own skip is a distance / level-of-detail test, `FUN_003b7b90` on `FUN_00290aa0`'s camera distance). Its caller, the scene walk `FUN_003389c0` (D:L236069-236074, D:L236164), draws a node only when: `+0x5c` bit 0 is set (an enable flag, set when a node is made or copied, `FUN_00317060` D:L215917, 1 by default -- nothing writes it per frame); `+0x5e` bit 7 is set; the ZONE gate passes -- `FUN_00290b80(camera, 1 << the node's zone index)`, the index bits 13-17 of its `+0x5c` word: true when `DAT_003de208` is 0, else when the camera's `+0x2a8` mask holds the bit; that mask is the region mask of the polygon under the camera's eye (`FUN_00295b00` D:L140037-140049: `FUN_0031dfd0` at the eye, `FUN_002dc1b0` = `*(poly+0xc)`, `FUN_00290c00`); its opacity (`+0x9c`) is at least 1/128; and the FRUSTUM passes (`FUN_00290c30`, the plane outcodes of `FUN_00294ac0`: wholly outside, culled). `DAT_003de208` is never assigned by name in the decompilation and the ELF holds it in bss, but a Frostfire match's RAM snapshot holds 1 (`logs/parity/frostA_probe600_vf0.rdram`, 0x3de208; its writer unlocated). **There is no line or hull test on the path**: a teammate behind a solid wall, in a region the camera's region sees and inside the frustum, is drawn (the depth buffer hides his pixels) and his tag is drawn through the wall; one in a region the camera's region does not see is not drawn and gets no tag. *LATER 415 (2026-10-26; reading, pending review), the gate read whole:* a region is the first word of a polygon's 12-byte params (`FUN_002dc1b0` returns `**(hit+0xc)`, 0xffffffff with none; `FUN_002dc1d0` reads the third word's material bits) -- `WorldPoly.region`, a mask of the zones seen from that floor (MP11: 16 distinct, MP62: 29, MP2: 0x0 and 0x22). The camera's `+0x2a8` is `+0x2a0` | 1 | `+0x2a4`: `+0x2a0` the region of the floor under the shown body, written by its ground probe (`FUN_005b5d40` D:L470276-470281 through `FUN_00290bd0` D:L137122-137130, nothing for 0), `+0x2a4` the floor at or below the eye (`FUN_00295b00` above; `FUN_002d4c20` D:L175859-175904 picks the highest column hit at or under the point), skipped when that floor is a SEAL's (`FUN_0059acd0`: a `CSealEx` node, the ELF's type descriptor 0x65c238) and every bit for a spectator (`FUN_002c2fd0`: the "JoinAsSpectator" variable, 0x3f5730). A body's zone index is `FUN_00550570`'s (D:L417757-417797; `CZSealBody`'s vtable slot at 0x6691c4, so every body): while its floor's region meets `+0x2a0` | 1 (`FUN_00290b30`), the top bit of `+0x2a0` | 1; else kept -- so a body met once keeps that zone after the two part, and one never met keeps 0, whose bit every mask holds. The eye's write sits inside its probe's hit branch (D:L140039-140040): with no floor at or below the eye nothing is written, a spectator's mask included. Beside `+0x5c` bit 0 the scene walk reads the node's `+0x5f` bit 7 as the zone test's enable (D:L236069-236072: a clear bit draws the node untested; set for a new node by `FUN_00317060` D:L215962-215966); a body's node holds both in every case read. The tag's drawn test passes for this frame or the last; the port's zone gate is this frame's. Built: `regionCull.ts` (`RegionCull`, `regionUnder`, reset at a new map and round), `hudTags.ts` (`zoneDrawn`), wired in `main.ts` and `matchMount.ts`; the readings `REGION_GATE_READING`, `REGION_ORDER_READING`, `REGION_FORCE_ALL_READING`, `REGION_EYE_BODY_READING` (§6; the last the port's known difference: its grid holds no body, so the eye over a SEAL's polygon takes the floor below where the original keeps `+0x2a4`; LATER 415's review, 2026-10-26). The bodies' own drawing under the same gate: LATER 489 -- built 2026-10-26 (reading, pending review): `RemotePlayers.applyZoneGate` takes a body its zone leaves undrawn off the render's layer 0 each frame after the gate's frame, every body stepped (a hostage's too); its group stays active for the aim, the order's pick, the muzzle and the head (no draw stamp is read on those paths; whether a shot's grid query skips a body outside the shooter's region mask -- `FUN_002d3030` D:L175094-175096 reads a query's `+0x44` mask -- *LATER 493 (2026-10-26; reading):* no: every query queued through `FUN_0031dd90` has its mask rewritten there to the call's last argument (D:L219893-219895, `FUN_002dc660(query, param_5)`), and every caller passes -1 -- all ones -- so the round's (`FUN_003ca5a0`: its kind-1 `+0xc0` mask written at D:L320431 and overwritten by the queue at D:L320432), the blast's lines (`FUN_003c7ee0` D:L319056, `FUN_005ac070` D:L464853), the body's own (`FUN_0054f410` D:L417265-417266) and `FUN_0060bc40`'s (D:L516715-516716) walk with every zone; the queue's second entry point, `FUN_0031dc90` (kind 4, D:L219804-219831), rewrites the mask the same way (D:L219825) and its callers pass -1 too (`FUN_003c5210` D:L316805, `FUN_003ca5a0` D:L320404, D:L320416); `FUN_002d3030` tests the zone bit only when `DAT_0044f070` is set and the query's `+0x44` lacks it (`FUN_002dc620` D:L175094-175096). Only the direct queries keep a region mask (the camera pass `FUN_0029bf70` D:L143519-143543; `FUN_005b0840` D:L467282, the body's own floor region on its query). So no shot skips a body by region, as the port's hit path reads none). A remote body has no character shadow (the `CRenderMap` goes to the local player alone, research 82 §6 round 4; the page's `markCasters` only on its own body). LATER 489's review (2026-10-26): the gate's frame and `applyZoneGate` run before the frame's render on both pages. The port's gap: no region masks (`poly+0xc` undecoded, no camera region, no node zone index), so the port gates on the frustum alone (LATER 415). #504 (Fuse's, 2026-10-24) proposed a camera-to-head hull test instead; it hides tags the original draws, so it is not the original's gate -- the owner's row H320.

*LATER 568 (2026-10-29; reading, pending review):* the camera's constructor `FUN_00293a80` (its vtable 0x406120 at `+0x60`, D:L138685) writes `+0x2a0` 0, `+0x2a4` 0 and `+0x2a8` 1 (D:L138755-138757), so a fresh camera's mask holds bit 0 -- the zone a body never met keeps; the port's camera starts and resets there (was: the masks 0, which drew no body while the viewer's floors were region 0 -- issue #596). The camera is built only on the map's load (`FUN_00318da0` -> `FUN_0031fd20` D:L217125, the camera at the world's `+0x128`, D:L221101-221108); nothing read rebuilds it or rewrites its masks at a round's start, so the original most likely keeps the last round's masks there, where the port resets them (`REGION_ROUND_RESET_READING`, §6, open)

### 1.3 Where

For each actor that passes (D:L77381-77426):

1. **The anchor.** `FUN_005a3070(actor, &p, dir)` (D:L77381): with `p` given it takes the node at the actor's `+0x308`
   through `FUN_002869d0(actor+0x170, node, 0, p, 0)` (the node's place, walked up its parents) and puts it in world
   space by the actor's matrix (`FUN_00308640(actor+0x28, p, 1)`) (D:L460118-460121). `+0x308` is the actor's
   `param_1[0xc2]`, set at the actor's set-up to the skeleton's node named **`head`** (`FUN_0028e7b0(..., 0x65c500)`,
   `FUN_00553ea0` D:L419621; 0x65c500 = `head`, read off the ELF). The tag's point is that, **3.0 up** (`p.y + 3.0`,
   w 1: D:L77383-77386). (The port's world is the original's units: research 227 §2.3's mark compares the original's
   900 against the page's feet.)
2. **The projection.** The camera's matrix (`FUN_001bfec0` from `*(DAT_0045c380+0x128)+0x3f0+0x20`, D:L77382) through
   `FUN_00308580` (D:L77387); **none when w <= 0.0001** (behind the eye, D:L77388); then x = X/w + 320 - 2048,
   y = Y/w + 224 - 2048 (D:L77402-77403): the 640x448 frame. The HUD's other projected mark, `FUN_00217550`, does the
   same (D:L70643-70660).
3. **The text and its width** (§1.4): set, then measured (`FUN_00362b70`, D:L77399-77400); `h` = half the width.
4. **The bounds** (D:L77404-77405): with `left` = x - h, the tag is drawn only when 0 < left < 600 and
   top < y < 448 - top (strict), `top` the margin (§1.1).
5. **The pen's x** (D:L77406-77411), literally: when x > 600, 600 - h; else when x - 2h >= 0 (that is, left >= h),
   `left`; else `h`. So a tag whose centre is past 600 is held with its centre at 600, and one whose left edge is under
   `h` is pushed right to `h`. (Transcribed as the decompiled text reads it; a reviewer re-reads the branch at the
   instructions if the second case looks wrong.)
6. **The overlap** (D:L77412-77426): against each earlier tag of this frame, `FUN_00227130` (D:L77463-77483) tests the
   box (pen - 10, y - 10) .. (pen + width + 10, y + lineH + 10) against that tag's drawn box (its place from the text's
   fixed-point fields `>> 4`, its width `+0x3c` and the font's line height, the font's `+0x24` less `+0x20`); on a hit
   y += 5 and the test starts again from the first. `lineH` is the font's fields, not mapped to `fonts.rdr`
   (`MP_TEAM_TAG_LINE_HEIGHT_READING`, §6).
7. **Placed** at (pen, y) (`FUN_003631a0`, D:L77445: its x, y, the baseline as research 327 §1.3 reads the same call)
   and shown (D:L77446). The unused texts are hidden (D:L77454-77458).

**The margin.** `+0x1a224` is the letterbox's bar height (`CHUD+0x1a100`, built by `FUN_001fef10` D:L59483ff: two
black bars; its frame `FUN_001fecc0`, vtable 0x405230 +0x38, D:L59421-59458, moves the height between 0 and 64 at 128
a second and lays the bars over 0..h and 448 - h..448). Online, the living player's own view closes it every frame
(`FUN_001fec60` D:L56568, state 2: the bars shrink to 0); it is opened by `FUN_001fec70`, called from the offline dead
path `FUN_001f93c0` (D:L56972), `FUN_00228ee0` (D:L78450) and `FUN_002ae970` (D:L153314). So in an online round's play
the margin is 0; when the other two callers run online is not read (`MP_TEAM_TAG_TOP_MARGIN_READING`, §6).

### 1.4 The text

| property | value | source |
|---|---|---|
| the name | the actor's `+0x14` (the scoreboard's name field, research 327 §1.1) when not empty | D:L77389-77393 (`FUN_00199288` the length, `FUN_00199060` the copy); an empty name leaves the buffer unwritten (D:L77391) -- the port has no empty names |
| the clan tag | online only: "[%s] %s" (0x3e54f8) of the seat's tag (`FUN_002c3ac0(+0xfc8)`, research 275) and the name, when the tag is **one** character or more | D:L77394-77398; the info box's rule (D:L85563, research 327), not the reticle's two-or-more (D:L70193-70194) |
| font | the HUD's `+0x498`, `font_text_01` | D:L57287, D:L77537 |
| scale | **0.9** | D:L77539 |
| alignment | left: the pen is the left edge; the centring is the pen's (§1.3 step 5) | the text's `+0x69`/`+0x6a` stay 0 (`FUN_00363e70` D:L261477-261478); nothing in the part sets them |
| colour | **(255, 255, 255)**, the text's default: no line of the part writes `+0x48..0x50` | `FUN_00363e70` D:L261473-261475 (compare the info box's name, which writes the HUD's (128, 128, 128) there, D:L85648-85651). How the font's draw takes 255 against the HUD's 128 is not read (`MP_TEAM_TAG_COLOUR_READING`, §6) |
| alpha | **100** alive; 100 - 20 t dead (§1.5) | the text's `+0x34` is `FUN_001f9150` (vtable 0x406df0), which writes `+0x54` (D:L56853-56857), the alpha (`FUN_00363e70` sets it 128, D:L261476; `FUN_00362b20` scales it by the font's `+0x30` at set-up, D:L260718-260720, overwritten each frame); D:L77427-77433 |
| place | baseline at the projected point, centred by the pen (§1.3) | D:L77445 |

No line reads the actor's side, life (but for the alpha) or talk state for a colour, a scale or a place.

### 1.5 The fade

`FUN_00548050(actor)` (D:L413162-413174) is 0 while the alive bit (`+0xe1` bit 4) is set, and else the game clock
`DAT_004365c0` less `actor+0xfb4`, which the death writes (`FUN_00547af0` D:L413049, the same function that clears the
alive bit through `FUN_0029e8b0` D:L144775; research 317 reads the clock as real time). So: alive, alpha 100; dead, a
tag at 100 - 20 t for t < 5 s (D:L77431-77432), none from 5 s (D:L77377) -- **a linear fade-out over five seconds**,
over the corpse's head node, as long as the corpse's model is drawn.

### 1.6 The talk mark

`iStack_f0` is the seat holding the listener's channel, set only online while another holds it (`FUN_0030e790`;
D:L77345-77350). On the tag of the actor whose seat (`+0xfc8`) is that one, the arrow and the talk icon are placed over
the tag's projected centre (not the pen) and shown (D:L77434-77443); both are hidden at the frame's start
(D:L77351-77352). Research 227 §2.2 reads the geometry; `hudVoice.ts` `tagTalkSprites` (`:236-243`) holds it. The tag's
own text, colour and alpha do not change for a talker. **The sprites are not the part's**: they are put straight on the
HUD's draw list (D:L77550, D:L77557), and nothing on their path tests `+0x5e4` (D:L77434-77443) -- the frame runs and
places the texts whatever the option (D:L56756, D:L77399-77446). So TEAMMATE NAMES off leaves the arrow and the icon
over a talking teammate in view, without his name (the review's F1).

### 1.7 When the part is shown

The part's show (+0x1c) is `FUN_00226960` (D:L77292-77301): **with `+0x5e4` on it sets the draw bit
(`FUN_00364e30`), with it off it clears it (`FUN_00364e50`)**; the part's draw (+0xc, `FUN_00364e70`) draws its
children -- the eight texts -- only with the bit set (research 266 §3.6). So TEAMMATE NAMES off means no name on any
path; the talk sprites, the HUD's own children (§1.6), are not the part's and still show over a talking teammate. The
table's "the part" is the texts'. **No path of the table hides the sprites**: the command menu's D:L56624 and the
hide-all's D:L56339 call the HUD object's own +0x18, which (the HUD built on the text class, `FUN_00363e70` D:L58332;
+0x18 `thunk_FUN_00364e50` at 0x363c10, D:L261318-261325) only clears HUD+0x14 bit 6, a bit neither the layer's draw
(D:L50862-50869 -> D:L57757, gated on HUD+0x1a6f5 bit 0, set at D:L57250 and never cleared) nor the sprite's own draw
(`FUN_00364a30` D:L261945) reads. The sprites are hidden only at each frame's start (D:L77351-77352) and the round's
start (`FUN_00227240` D:L77510, D:L77514, §1.1; was: "the round's reset"), and shown only by the frame
(D:L77442-77443), which runs at D:L56756 -- after the command menu's hide (D:L56617-56624) and `FUN_001f9f20`'s
per-frame hide-all (D:L57174) in the same tick. So with the command
menu open, or dead and watching a teammate, a talking teammate in view keeps the arrow and the icon over his tag's
place (the re-review's N1; was: "the sprites are hidden only with the HUD itself (the command menu's D:L56624, the
hide-all's D:L56339), the scoreboard hiding neither"; and before it, the review's F1: "So TEAMMATE NAMES off means
no tag on any path.")

| path | the part | source |
|---|---|---|
| alive, own view, no menu (control state 0) | shown | `FUN_001f7a90` D:L56440 (called D:L56567), every mode |
| dead online on his own body; a ghost on its own object | shown | `FUN_001f97b0` -> `FUN_001f7a90` D:L57112 (research 282 §1) |
| alive or dead, watching another body; a ghost watching | hidden, then shown unless control state 3 (the in-game options menu, research 276) | `FUN_001f9f20`: `FUN_001f77c0` D:L57174, show D:L57175-57176 |
| a spectator | hidden, then shown unless control state 3 -- and then draws nothing while his word is 0x10000, which shares no bit with a side's; a side's tags if `FUN_002c3330` gave him that side's word (§1.2; the review's F2; was: "draws nothing: no team word shares a bit with 0x10000") | `FUN_001f9160` D:L56873-56875 |
| the command menu up (control state 2, `FUN_00235440`, research 276) | texts hidden; the sprites stay (N1; was: "hidden") | D:L56617-56623 |
| the hide-all | texts hidden; the sprites stay (N1; was: "hidden") | `FUN_001f77c0` D:L56341 |
| the HUD's hide-all and fade-in of the tactical map (research 87 §9) | hidden / shown, each under an online test | `FUN_001f71c0` D:L56192-56195, `FUN_001f7030` D:L56160-56163 |
| the scope's "normal" switch, online (`FUN_001f7560`, the opposite of `FUN_001f7360`; its caller `FUN_001f0610` tests the zoom `DAT_003dc340` against 1.0 and 1.01, D:L52816-52830; others D:L53192, D:L56155, D:L56426, D:L57488, D:L57609) | shown (re-shown every frame in the own view anyway, D:L56440) | D:L56290 (the review's F4; the re-review's N2; was: "the tactical map's close, online") |
| the scoreboard up, or SPECTATOR HUD OFF | **not hidden** | D:L56808-56827 hides the info box, the compass, the panel, the prompts, the reticle, the help lines, the timer and the number, not `+0x17580` |

### 1.8 The option

`DISPLAY_MP_TEAM_NAMES` is the TEAMMATE NAMES strip's valve on OPTIONS > VIDEO (OPT-11) and ONLINE OPTIONS (OPT-15):
1 on, 0 off (research 229 §2-§3, 265 §1; `packages/ui/test/screens/onlineOptionsScreen.test.ts:189-199`). Its default
is **1** (`global-valves.json` `valves[152]`, PERSIST). The part reads it **once, at the HUD's set-up**
(`FUN_00351ff0(0x3e5540, 1)`, D:L77558-77559 -- no other line writes `+0x5e4`; the round's start, `FUN_00227240`,
does not); every show applies it (§1.7). So a change in the options takes effect from the next HUD set-up
(*inference*: the next map's load). This answers research 266 §3.6's open "when the flag is applied".
The port adds a third setting, **Original**, the valve at 2 (LATER 671, OT.R101, a browser adaptation): 1 draws the
tags smaller and fading with distance (`TEAMMATE_NAME_DISTANCE_ADAPTATION`, §6), 2 the original's tags exactly; the
original's own read is `!= 0`, so 2 is on there.
*Note (the v0.4.11 batch review's F4, 2026-11-07):* the original's VIDEO and ONLINE OPTIONS ON/OFF strip writes only 1
or 0 (`Enable_TeamNames` / `Disable_TeamNames`; `packages/viewer/test/optionToggles.ts:79-80`, `:100-101`), so pressing
it drops Original (2) to 1; how the strip displays a stored 2 is decided by `dlgOptions_Video.rdr`'s own script, not
by the port. A note only; no code changes with it.

## 2. Offline against online

- **The part is built, shown and ticked in both modes** (D:L57287; D:L56440 in `FUN_001f7a90`; the frame D:L56756,
  outside the online test D:L56757).
- **Offline an actor needs more** (D:L77355, D:L77367-77375): `bVar3` starts true and online is never cleared; offline
  it is recomputed per actor, true only when the actor's team word has bit 0x2 or 0x40000. Every other test of §1.2
  applies in both modes.
- **Offline no clan tag** (D:L77394) and **no talk mark** (D:L77348, D:L77434).
- **The campaign's fire team.** Whether its members' team words carry 0x2 or 0x40000 (and share a bit with the
  player's) is not read: the offline tags are `MP_TEAM_TAGS_OFFLINE_READING` (§6). The port has no campaign
  (research 327 §2), so the online rule is the one to build.
- **The reticle offline** shows a teammate the blank whatever the option (D:L70162-70163): §4.3.

## 3. The search

Made to know whether anything else draws a name over a body:

- **The ELF's strings** (a scratch scan of the file's bytes): `CMPTeammateNames`, `CTeamNames` (0x3e4f70: the offline
  team list, research 87 §1.19, over its own bars at the screen's right, not over heads), `DISPLAY_MP_TEAM_NAMES`,
  `TEAMMATES` / `Teammate controls` (the Chat menu, research 227 §2.4); no `NameTag`, `name_tag`, `ENEMY_NAMES`,
  `EnemyName`, `PlayerTag`.
- **The callers of the world-to-screen projection** `FUN_00308580` in the HUD's code: `FUN_002269a0` (D:L77387) and
  `FUN_00217550` (D:L70643, a quad around a point its argument's `+0x5ec` holds, under that argument's `+0x5e2` bit: no
  text). The next caller, D:L136781, is inside `FUN_00290370` (D:L136764), a camera projection helper, whose callers
  are the HUD's `FUN_00200c10` (D:L60423, a sprite quad, from `FUN_001ff8a0` D:L59978) and aim code (D:L464343,
  D:L464424): none draws text; the rest are the renderer's (the review's F3; was: "The others are the renderer's
  (D:L136781 onward).") The reticle's target name (`FUN_00215c10`, research 321 §4.2) is drawn
  beside the reticle, not over a body.
- **The HUD's draw list**: the part (D:L77560) and its two sprites (D:L77550, D:L77557); its texts are the part's
  children (D:L77541). The decompiled text references the format 0x3e54f8, the sprites' names and the option's string
  only in `FUN_002269a0` and `FUN_00227340` (D:L77397, D:L77547, D:L77554, D:L77558).

So **one drawer, teammates only**; no over-head name for an enemy, identified or not, and none for the followed body
in a spectate beyond what R329.2's teammate rule gives a dead player watching his own side.

## 4. The port against the read

### 4.1 The room and the wire

| the original needs | the page has | difference |
|---|---|---|
| each other body's name | `NetPage.nameOf(id)` (research 327 §3.1) | none |
| each seat's clan tag | the score rows' `clan` (research 327 §3.1; 275) | none |
| each body's side against the page's own | `RemotePlayers.setTeam` / `teamOf` (`remotePlayers.ts:615-624`, from `welcome` / `joined` / `promoted`); the page's own team, null for a spectator (research 227 §2.5) | none |
| alive, and the seconds since the death | the snapshot's `alive`; `fadeAge`, real seconds from the body's dead snapshot, 0 while alive (`remotePlayers.ts:738`) | none (the clock starts at the drawn death, about the interpolation delay after the room's `kill` event, `remotePlayers.ts:735-737`; the original stamps the remote's death as its actor applies it -- a timing nuance the capture settles, NU9C-1) |
| the escortee bit | `setEscortee` (a hostage's body, `remotePlayers.ts:645-649`) | none |
| the body drawn | `group.visible` (`remotePlayers.ts:750-751`; a ghost hidden, another seat's corpse shown until its seat is alive, NU-4) | none (the frustum is the page's camera's) |
| the `head` node's place | the body's bones by part name (`bodyView.ts:103-110`; `head` among `animator.ts:282`'s names) | no accessor yet (T2) |
| the voice holder | `voice.state().holder` through `voiceHudFrame` (research 227 §2.5) | none |
| TEAMMATE NAMES | the valve on the options pages; `MatchMountOptions.gameVars.valve(name)` reaches the front end's match (`matchMount.ts:217-218`) | not read by the match yet (T4); the test room has no session: the golden default 1 |

**No field is missing from the wire; the room changes in nothing.** The online seat's terms are not engaged.

### 4.2 The page

| # | the original | the page | difference |
|---|---|---|---|
| D1 | teammates' tags over their heads (§1) | **none**: no source of the viewer projects text over a body; `tagDrawn` / `tagTalkSprites` (`hudVoice.ts:198-243`) are a rule with no caller (research 227 §2.2); `MP_TEAM_NAME_TAGS_PLACEHOLDER` (227 §3) | **the tags are missing** -- the owner's (c) |
| D2 | the eligibility (§1.2) | `tagDrawn` holds it with `query` and `metric` marked "unread" (`hudVoice.ts:202`, `:208`) | read now: `query` is "drawn this frame or the last", `metric` the seconds dead; the docs get a "was" |
| D3 | the anchor: the `head` node + 3 up (§1.3) | none | T1, T2 |
| D4 | none behind the eye (w <= 0.0001) | `aimPoint` (`playerCamera.ts:321-325`) projects without a behind test | T1 tests it (a point behind the camera can land inside the frame through three's `project`) |
| D5 | the pen, the bounds, the clamp, the overlap push (§1.3) | none | T1 |
| D6 | the text: "[tag] name" one-or-more, 0.9, left at the pen, (255, 255, 255), alpha 100 / fading (§1.4, §1.5) | `taggedName` (`hud.ts:766`, the one-or-more rule) and `textWidth` (`hudFont.ts:142`) exist | T1, T3 |
| D7 | the talk sprites on the holder's tag (§1.6) | `tagTalkSprites` | wired by T1/T3 |
| D8 | TEAMMATE NAMES off: no names, the talk sprites still over a talking teammate in view; read at the HUD's set-up (§1.8; the review's F1; was: "TEAMMATE NAMES off: none") | the valve reaches no match | T4 |
| D9 | shown on the paths of §1.7; the texts hidden with the command menu and the hide-all, the talk sprites kept on every path; kept under the scoreboard (the re-review's N1; was: "hidden with the command menu") | -- | T3 |

**The frames.** The HUD's layout is the PS2's 640x448 frame; the native presentation scales it by the canvas
height / 448 and anchors elements to a side (`hud.ts:28-36`). A tag follows the 3D view, so it cannot be anchored:
its x comes from the camera across the whole canvas. The original's bounds (0..600) and clamp are the 640 frame's; how
they map to a frame wider than 640 has no original (`MP_TEAM_TAG_WIDE_FRAME_ADAPTATION`, §6, an adaptation). In the
PS2 presentation they apply as read.

### 4.3 The overlap with NU-9 (b): the reticle's teammate name

Research 321 §4.2 reads the reticle's target name "for a teammate ... online the name unless the HUD's flag `+0x17b64`
is set". `+0x17b64` = `+0x17580 + 0x5e4`: **this part's TEAMMATE NAMES flag** (§1.1). So, online, a teammate under the
reticle shows his name only with TEAMMATE NAMES **off**; with it on -- the default -- the blank " " (0x3e4840), while
his 60x5 health bar is drawn 15 above either way (D:L70160-70170; the bar for `bVar3`, D:L70213-70218; the reticle's
teammate test is the same shared team bit, D:L70108). Offline, the blank always (D:L70162-70163). Research 321's C4
("a teammate green with its name online") and the checklist's NU.R6 (b) ("a teammate's '[tag] name' and 60x5 health
bar under the reticle") read the name as unconditional: **with the defaults, (b) draws the bar and no name, and (c)'s
tag names the teammate.** The controller carries this into NU-3b's brief (T5).

### 4.4 Found in passing

- **Research 282 §1 names `+0x17580` "the voice element"** (corrected in 282 §1 by NU-9's build, its "was" kept) (its table's rows for `FUN_001f9f20` and `FUN_001f9160`):
  `+0x17580` is `CMPTeammateNames` (§1.1); the voice element is the info box's child `+0x390` (`FUN_00238f50`,
  D:L85656; research 227 §2.1). The port's spectator HUD follows the info box and the panel, not that row, so nothing
  drawn changes; 282 takes a "was" at its next edit.
- **Research 266 §3.6's open "when the flag is applied"** is answered (§1.8).
- `hudVoice.ts`'s `TagCandidate.record` is the actor's scene node, not a player record (§1.2): a doc word for T1's
  "was".

## 5. The build list

Each row is RED first, on the simulation track (what the HUD draws). **The room changes in none** (§4.1). The two page
files (`main.ts`, `matchMount.ts`) need the controller's word, as NU-7's W1 and research 327's N1 did.

- **T1 -- the tags as a pure function (page).** `teamTags(input)` in `hudVoice.ts` beside `tagDrawn` (or a new
  `hudTags.ts` beside it): from the page's own id and team (null: none), the others in `TEAMMATE_ROW_ORDER_READING`'s
  order (member id, the actor list's order unread, research 227 §3), each with its team, alive, seconds dead, escortee,
  drawn, the `head` point, the name and the row's `clan`; the camera; the holder; the margin. It returns at most eight
  tags `{ id, text, x, y, alpha }` and the holder's two sprites. The rules, each cited: §1.2's eligibility (the
  `drawn` test as `MP_TEAM_TAG_CULL_READING` says), the head + 3 projected into the 640x448 frame with none behind the
  eye, `taggedName` then the width at 0.9 (`textWidth`), the bounds and the clamp literally (§1.3 steps 4-5), the
  overlap push (step 6; the line height `MP_TEAM_TAG_LINE_HEIGHT_READING`), alpha 100 alive and 100 - 20 t dead, none
  from 5 s; `tagTalkSprites` on the holder's tag at the projected centre. **T1 computes the tags and the sprites
  whatever the valve**: the option gates only the texts (T4; the review's F1).
  - *RED (`hudVoice.test.ts` or `hudTags.test.ts`):* a teammate in front at a known point: one tag, its text, its pen
    (centre - width / 2) and baseline; an enemy none; the page's own body none; an escortee none; a spectator page
    (team null) none; a teammate behind the camera none; left edge at 0 or 600 none (strict), and the clamp's two
    branches (centre 610 held at 600 - h; left under h pushed to h); y at `top` or `448 - top` none; a dead teammate at
    t = 0, 2.5, 4.99 -> alpha 100, 50, 0.2; at 5 none; "[NSW] BRAVO" for tag "NSW", "[X] BRAVO" for "X" (one or more),
    "BRAVO" with none; two teammates at one point: the second 5 px lower per step until its padded box clears; a ninth
    teammate none; the holder's tag carries the two sprites at its centre, another's none, the page's own hold none.
  - `tagDrawn`'s `query` and `metric` docs: "unread" becomes a "was", pointing here.
- **T2 -- the `head` point (page).** `RemotePlayers.headAt(id)`: the body's bone named `head` in world space (the
  original's node 0x65c500, `FUN_00553ea0` D:L419621), null for a body not drawn (`group.visible` false: a ghost, a
  rescued hostage at 0).
  - *RED (`remotePlayers.test.ts`):* a posed body's `headAt` equals its `head` bone's world position; a crouched body's
    lower than a standing one's; a ghost's null.
- **T3 -- the HUD draws them (page).** `Hud.setTeamTags(tags)`: each text in `font_text_01` at 0.9, left at its pen,
  its baseline at y, the colour `MP_TEAM_TAG_COLOUR_READING`, its alpha / 128; the sprites as `tagTalkSprites` gives
  them; drawn in the PS2 presentation at the frame's pixels and in the native one by
  `MP_TEAM_TAG_WIDE_FRAME_ADAPTATION`. `SCOREBOARD_HIDES` does not take them (D:L56808-56827); the round screens'
  hide follows the HUD's (`FUN_002271d0` at the round's reset, the texts; `FUN_00227240` at the round's start just
  after, the sprites, D:L149757-149758); the Chat menu's open state hides the texts only, the
  talk sprites staying over the holder (control state 2; *inference*: the port's Chat menu is the original's command
  menu, `FUN_00235440`; the re-review's N1; was: "the Chat menu's open state hides them"); the dead player's teammate
  view keeps the sprites too.
  - *RED (`hud.test.ts`):* a tag drawn at its quads; the scoreboard up keeps it; the Chat menu open hides its text
    (was: "hides it"); **the Chat menu open, a teammate talking in view: the two sprites, no text** (N1); the
    sprites over the holder's tag; **dead and watching a teammate, another teammate talking in view: the two sprites,
    the name text as the option says** (the second re-review).
- **T4 -- the wiring and the option (both pages).** Each frame after `voiceHudFrame` (`main.ts:1548-1554`,
  `matchMount.ts:889-895`), the page builds T1's input from its net page and `RemotePlayers` and feeds T3; on every path
  of §1.7 (the walker, dead on his own body, watching a teammate; a spectator gets none by T1's team rule). TEAMMATE
  NAMES: `matchMount` reads `gameVars.valve('DISPLAY_MP_TEAM_NAMES')` **once, at the match's mount** (the HUD's set-up,
  §1.8), absent 1; `/testroom` 1 (the golden's default) -- *since 2026-11-07 (the v0.4.11 review's F3)* the page's
  native OPTIONS' valve, read each frame, absent 1, its Original (2) passed as `matchMount`'s is. 0: no texts --
  **the valve gates only the texts; the talk sprites are drawn either way** (§1.6; the review's F1; was: "0: no
  tags").
  - *RED (`matchMount.test.ts` through the real page):* a teammate's body in view draws a tag with his welcome name;
    the valve 0 draws no text; **valve 0, a teammate talking in view: the two sprites, no text**; the valve changed
    mid-match keeps the mount's value; a spectator draws none (was: "the valve 0 draws none").
- **T5 -- for the controller: NU-3b's C4 amended (not built here).** The reticle's teammate name is the blank while
  TEAMMATE NAMES is on, the name while off; the 60x5 bar either way (§4.3; D:L70160-70170). Research 321's C4 row takes
  a "was" with NU-3b, whose RED pins both settings.
- **Pinned with T1 (no behaviour change):** the info box's name and the reticle's bar are untouched; the
  `WhoIsTalking` compass mark (research 227 §2.3) stays as it is.
- **At the landing:** `MP_TEAM_NAME_TAGS_PLACEHOLDER`'s row in research 227 §3 is marked resolved here, and LATER 25's
  tag clause struck (NU.R6).

## 6. Readings and placeholders (candidates for the build)

| name | where it would go | status |
|---|---|---|
| `MP_TEAM_TAG_CULL_READING` (was: *note only*; candidate, T1; built 2026-10-15 by NU-9 (c)'s T1; reading, pending review) | `hudTags.ts` (`teamTags`; was: `hudVoice.ts` (T1's `drawn`)) | the original tags a body only when the renderer drew its model this frame or the last (`FUN_00315580(node, 2)`, D:L77376; the stamp D:L235478-235481); which bodies the renderer leaves undrawn: read 2026-10-24 (§1.2, LATER 415; reading, pending review) -- the node enabled, the ZONE gate (the camera's region mask, the polygon under the eye, against the node's zone), the opacity, the frustum and a visual's distance test, and no line or hull test, so a teammate behind a wall in a visible region is tagged through it. Built (LATER 415, 2026-10-26): the body's group visible, its zone drawn (`./regionCull` `RegionCull.drawn`) and its head point inside the camera's frustum (no wall test); a visual's own distance skip not modelled. Was (before LATER 415): the group and the frustum alone. The head test is narrower than the original at the frame's sides: the original needs only the model drawn and the tag's left edge under 600, then clamps (D:L77404-77407), so a teammate whose body is drawn at the right edge with his head just outside (x about 650) and a tag wider than 100 is tagged (the test is `x - W/2 < 600`; was "wider than 80", NU-9's re-review), clamped at 600 - h, where the port tags none (NU-9's review, F4, 2026-10-15). Settles: NU9C-1 (a teammate behind a wall inside the view; one far away; one at the frame's right edge) |
| `REGION_GATE_READING` (LATER 415, 2026-10-26; reading, pending review) | `regionCull.ts` | `DAT_003de208`, the region gate's switch (`FUN_00290b30`, `FUN_00290b80`: 0 passes every node): 1, as a Frostfire match's RAM snapshot holds it (`logs/parity/frostA_probe600_vf0.rdram`, 0x3de208) -- a capture reading at one moment; never assigned by name, in bss, its writer unlocated. Settles: the writer found, or a trace through a round on more than one map |
| `REGION_ORDER_READING` (LATER 415, 2026-10-26; reading, pending review) | `regionCull.ts` (`RegionCull.frame`) | within a frame the shown body's floor, then the bodies' zones, then the eye; the original sets `+0x2a0` in the shown body's tick and each zone in its body's (the actor list's order unread), the eye in the camera's update (`FUN_00295b00`). The port also takes the page's own walker as the shown body (a dead page watching a teammate: the watched body is the original's, `DAT_00415ff0+0xbc`). With LATER 489: a page whose walker has no grid (fly mode: a spectator, a dead page watching) does not frame the gate and draws every body; a dead watcher's zone cull is not applied (the original follows the watched body's floor). Settles: the actor list's order and the camera update's place in the frame |
| `REGION_EYE_BODY_READING` (LATER 415's review, 2026-10-26; reading, pending review) | `regionCull.ts` | `FUN_00295b00` keeps `+0x2a4` when the highest hit at or below the eye is a SEAL's polygon (`FUN_0059acd0`, a `CSealEx` node); the port's grid holds no body, so it takes the floor below: `'the floor below (no body in the grid)'`. Settles: the bodies' collision in the eye's probe |
| `REGION_ROUND_RESET_READING` (LATER 568's review, 2026-10-29; open) | `regionCull.ts` (`RegionCull.reset` at a round's start: `matchMount.ts` `roundClear`, `main.ts` `clearAir`) | the port writes the constructor's words (`FUN_00293a80` D:L138755-138757) at a round's start as at a map's load; the original builds the camera only at the load (`FUN_0031fd20` D:L217125, D:L221101-221108) and no round-start writer of `+0x2a0`..`+0x2a8` is read, so it most likely keeps the masks. Settles it: a round start's writers read, or a capture of the masks across a round's start |
| `REGION_FORCE_ALL_READING` (LATER 415, 2026-10-26; reading, pending review) | `regionCull.ts` | `FUN_00546cf0` and `FUN_00546e40` (D:L412520, D:L412564; the second `CZSealBody`'s vtable slot 0x6691dc) write every bit into `+0x2a0` and the eye word: unread what they are and when they run, so the port never forces the masks. Settles: their callers read (a camera or a mount's switch, a guess) |
| `MP_TEAM_TAG_COLOUR_READING` (was: *note only*; candidate, T3; built 2026-10-15 by NU-9 (c)'s T1; reading, pending review) | `hud.ts` (`MP_TEAM_TAG_COLOUR_READING`, the tags' draw) | the tag's text colour is the text object's default (255, 255, 255) (`FUN_00363e70` D:L261473-261475), alpha 100 (D:L77428); the HUD's own strings are (128, 128, 128). How the font's draw maps 255 against 128 (a GS modulate doubling, clamped) is not read. The default: white at full (the HUD's 128 -> 1 scale, clamped), alpha 100 / 128. Settles: NU9C-1 (a tag's ink against the info box's name on one frame) |
| `MP_TEAM_TAG_LINE_HEIGHT_READING` (was: *note only*; candidate, T1; built 2026-10-15 by NU-9 (c)'s T1; reading, pending review) | `hud.ts` (`teamTagLayout`; was: `hudVoice.ts`) | the overlap test's line height is the font's `+0x24` less `+0x20` (D:L77417-77418, D:L77475-77476), **15**: `FUN_00359c40`'s font load writes `+0x24` from `boty` and `+0x20` from `topy` (D:L255453-255458; the keys' strings at 0x3f88c0 / 0x3f88c8 in the game's ELF), `font_text_01`'s 15 and 0, unscaled; settled by that read (NU-9's review, F1, 2026-10-15). (Was: "The default: the glyph cell, 25 (`hudFont.ts:21`; *inference*). Settles: a read of `FUN_00359c40`'s font load (which `fonts.rdr` fields land at `+0x20` / `+0x24`), or NU9C-1's two overlapping tags".) NU9C-1's two overlapping tags still take it to proven |
| `MP_TEAM_TAG_TOP_MARGIN_READING` (was: *note only*; candidate, T1; built 2026-10-15 by NU-9 (c)'s T1; reading, pending review) | `hud.ts` (`teamTagLayout`; was: `hudVoice.ts`) | the margin is the letterbox's bar height (D:L56755; §1.3), closed every frame in the living player's own view online (D:L56568); when `FUN_00228ee0` (D:L78450) or `FUN_002ae970` (D:L153314) open the bars online is not read. The default: 0 (the port draws no letterbox). Settles: a read of those two callers' online paths |
| `MP_TEAM_TAG_WIDE_FRAME_ADAPTATION` (was: *note only*; candidate, T3; an adaptation; built 2026-10-15 by NU-9 (c)'s T1; reading, pending review: `{ rightInset: 40 }`, the right bound the frame's own width less 40 in 448-high units, 600 on the PS2's 640) | `hud.ts` (`teamTagLayout`) | the original's bounds (0..600 across, the clamp at 600) are the 640 frame's; the native presentation is wider and has no original. Proposed: the PS2 presentation exact; the native one with the bounds over the canvas's width in frame units, the right bound 40 short of its edge -- the controller's choice on the product track, labelled as an adaptation |
| `MP_TEAM_TAG_TALKER_ADAPTATION` (an adaptation; built 2026-10-15 by NU-9 (c), the controller's word at T4's clearing) | `hudTags.ts` (`teamTagInput`) | the original puts the talk arrow and icon over the floor's holder alone (`iStack_f0`, D:L77345-77350, D:L77434-77443); the port names the talker by VOICE-LATE (B)'s `heardTalker` (research 226 §3.2) -- the voice playing now, else the floor's holder, never the page -- kept for consistency with the HUD's other voice marks; the two agree except while a talk's tail plays behind the jitter window. `'heardTalker'` |
| `TEAMMATE_NAME_DISTANCE_ADAPTATION` (LATER 671, 2026-11-06; **a browser adaptation** on the owner's ruling OT.R101, H394; product track, the values the controller's starting call for the owner to tune) | `hudTags.ts` (`teamTags`, `teamTagDistanceFactor`; the view's `scale` read by `hud.ts` `teamTagLayout` and the tags' draw) | by default the tags are drawn at 0.7 (the original's 0.9, D:L77539) and each tag's alpha is multiplied by its camera-to-head distance's factor -- 1 within 250 world units (25 m at `UNITS_PER_METRE` 10), linear to 0.35 at 1000 (100 m), held there -- the death fade (100 - 20 t, §1.5) on top. The original has no distance term (D:L77427-77433). OPTIONS > TEAMMATE NAMES' **Original** (`DISPLAY_MP_TEAM_NAMES` 2, `TEAMMATE_NAMES_ORIGINAL_VALUE`; §1.8) keeps the original's tags exactly. `{ scale: 0.7, near: 250, far: 1000, minAlpha: 0.35 }` |
| `MP_TEAM_TAGS_OFFLINE_READING` (*note only*; candidate, none: the port has no campaign) | -- | offline a tag also needs the actor's team word bit 0x2 or 0x40000 (D:L77367-77375) and carries no clan tag (D:L77394); whether the fire team's words carry those bits is not read. Settles: a read of the fire team's team words at a mission's set-up, or a capture of a single-player mission with TEAMMATE NAMES on |

No value the build needs beyond these is open: the anchor, the 3.0, the bounds, the scale, the alpha, the fade and the
talk sprites are the code's (§1). The captures that would take them to proven:

- **NU9C-1**: a two-team online match on two consoles with TEAMMATE NAMES on, the walker's own HUD recorded: a
  teammate near and far, one behind a wall inside the view, two side by side (the push), one at each edge of the frame,
  one killed (the five-second fade), one talking (the arrow and icon), a clan member's "[tag] name"; the command menu
  open with a teammate talking in view (the sprites, no text); then TEAMMATE NAMES off (no name texts, and the
  reticle's teammate named; was: "no tags"), with a teammate talking in view (the sprites, no text); scored by the
  harness at the tags' ink against T1's pens at 0.9.
