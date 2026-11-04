# 150 -- The reload while running: the still clip, the moving overlay, the cut (RELOAD-RUN)

Written 2026-10-03 for RELOAD-RUN, on the owner's report of that day on the playable page's match: "while reloading and
running, the character can end up in an odd animation that seems different from the original." Sources: the retail
decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line, `FUN_<addr>` its
functions; cited, never pasted); the disc's `RUN/READERC.ZAR` `motion.rdr` and `RUN/MOTION_P.ZAR` through the
repository's readers (`motionTableFromArchive`, `clipsFromPack`; the committed fixtures under `test-fixtures/RUN/`);
reCOM (`C:/Projects/socom_pc/research/recom/src`), evidence only where the decomp agrees. It stands on research 77 (the
clip format: `end` = (n - 1)/n, key n a copy of key 0), 80 (the action stack, the second channel), 84 §11 and §18 (the
reload's lock and length), 94 §C1.2 (the clip families) and 101 (the open gaps), and does not restate them.

The code: `packages/viewer/src/weaponPose.ts` (the reload's state: the still clip, the cut, the overlay, the clocks, the
cross-fades), `animator.ts` (a pose layer's `noPitchtwist`; the second channel's comment), `play.ts` (`reloadCut`, the
start's `moving`, the end's `completed`), `motionTable.ts` (the `BlendOverlay` flag). The tests:
`packages/viewer/test/reloadRun.test.ts` (CI: the rule on synthetic clips under the disc's names and fields; fixture: the
disc's flags and part sets; the drift pin of §5), `weapon.test.ts` (the layer's cross-fades, the one moving decision),
`e2e/weapon.spec.ts` (the browser: a running reload and a cut one on Frostfire). The registry: `docs/parity/registry/
character.json`, `character.reload.*`. Confidence: **reading, pending review** for every transcription here; the lock
(R150.7) is a **drift** entry.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R150.1 | **The reload's clip is chosen once, when it starts, by the body's speed** (`FUN_005a82e0`): `|v|^2 <= 400` (20 a second; D:L462821-462823) is still -- the stance's whole-body clip (`Rifle reload` `seal_reload`, `Rifle crouch reload`, `Rifle prone reload`; the pistol's, the shotgun's, the pump's and `Rifle m203 reload` by research 94 §C1.2's families); over it the family's `Moving ...` clip; prone always the prone clip, whatever the speed (D:L462845-462852). `dynamics.rdr`'s `min_running_reload_speed`, which reCOM loads (`zCharacter/char_dyn.cpp:406-407`), is not what the retail test reads: the literal 400 is | `weaponPose.ts` `startReload`; `play.ts` `movingForReload` | §3.1 |
| R150.2 | **The moving clips are `BlendOverlay` motions on the second channel, a hard override of the parts they carry**: `FUN_00588bc0` (D:L446083-446086) sends a motion with `+0x4a` bit 2 to `FUN_00587780`, which plays it on `anim+0x180` (`FUN_0028d860`) and records it at `+0x1e4` (kind 1 rifle, 2 pistol, 3 shotgun, 4 pump; D:L445358-445417) -- never on the action stack, so the mover is free; the pose builder `FUN_00577ea0` lays it over the merged main channel at 1.0 (D:L437456-437461; `FUN_00576bb0` D:L436734-436738 copies a part the top pose has). `seal_mv_reload` carries 14 parts: `spinehi`, the arms, the shoulders, the scaps, the neck, the head and the `rifle` -- no `skel_root`, `hips`, `spinelo` or legs (the disc) | `weaponPose.ts` `ReloadRun.overlay`; the layer's parts | §2, §3.2 |
| R150.3 | **A still clip is cut by the stick and carried on by the overlay**: `FUN_00550ef0` (D:L418176-418203) with `FUN_00587c20` (D:L445549-445565) cuts the one-shot on top of the stack once its phase is past the clip's `NoInterrupt` (absent on `seal_reload`: at once; 0.35 crouched; 0.5 prone) when a move axis (`actor+0x240`, `+0x244`) or the turn axis (`+0x23c`) is over 0.1 (D:L418182-418185); the ground state resumes (D:L418203). Then (D:L418205-418226) `Rifle reload`, `Rifle crouch reload` and `Rifle m203 reload` go on as `Moving rifle reload`, `Pistol reload` and `Pistol crouch reload` as `Moving pistol reload`, the overlay's clock set to phase x playback x (n-1)/n (D:L418213) -- the same normalised phase. **Every other reload just ends at the cut**: the prone ones, the shotgun family, the pump | `weaponPose.ts` `step` (`cut`), `CARRIES_ON`; `play.ts` `reloadCut` | §3.3 |
| R150.4 | **Nothing returns to a still clip.** No path reads the speed again: the overlay node runs to its end whatever the mover does (`FUN_0028d170`), and the still clip, once cut, is gone | `weaponPose.ts` | §3.3 |
| R150.5 | **The overlay's clock and end**: `FUN_0028d170` (D:L134692-134757) adds dt to `+0x1ec`, sets the node's key to t / playback x n (`FUN_0028d670` D:L134887-134901: index capped at n - 1 on a one-shot) and frees the node when t / (playback x (n-1)/n) reaches 1 -- the last key, 1.164 s into `seal_mv_reload`; **at the overlay's start and its end the body cross-fades from the pose on screen over 0.4 s** (`FUN_0057a010` D:L438627-438633, `FUN_00579ef0` D:L438544-438547: `body+0x10d0` = 0.4; `FUN_00576860` D:L436643/436664 divides it by the literal 0.4; the ease `FUN_002874f0` D:L131142-131148 is `blendWeight`'s). Not the clip's `BlendTime`, which is never read for the channel | `OVERLAY_BLEND`; `frameOf`, `lastKeyAt`, `weightOf` | §3.4, §3.5 *(The still clip: since PARITY-2 PAR-73 the page holds its last key to the pop and fades from there; `lastKeyAt` is `outAt` -- research 251 §12.5.)* |
| R150.6 | **A still reload is a main-channel play**: `FUN_00588bc0` -> `FUN_0028dc90` (D:L446292), a cross-fade over its `BlendTime` -- 0.4 by `FUN_00287620`'s default, none of the reload records having one -- playing keys 0..n-1 over playback x ((n-1)/n)^2 (research 80's one-shot rule) and holding the last; when it ends the ground state's play comes back over *its* `BlendTime` (`seal_stand` 0.5). Its `NoPitchtwist` (every reload record but the pump's) turns the aim's twist off through `FUN_00587a30` (D:L445469-445473), which reads the main channel's last node only: the overlay leaves the locomotion's own flag | `weaponPose.ts` `run`, `noPitchtwist`; `animator.ts` `layerNoTwist` | §3.5, §3.6 |
| R150.7 | **The fire's lock is the clip's life** (`FUN_005a7ab0` D:L462526-462558: the stack's top or any entry a reload type, or the overlay's type `Moving rifle/pistol reload`): a standing reload cut at once is locked until the overlay's last key (1.164 s), not `seal_reload`'s 1.6; a cut prone, shotgun or pump reload unlocks at the cut. The page's `Fire` and the room keep the start's length (`reloadSeconds`): a **drift**, owed to the fire lane (§5) | `character.reload.lock-follows-clip` (`it.fails`) | §3.7, §5 |
| R150.8 | **The port's divergences**, all in the body's drawing, none in the mover: the clip re-chosen every frame by the speed, both ways (the owner's symptom); the overlay stretched over the still clip's length; a 0.2 s linear ramp in and out (`RELOAD_BLEND_PLACEHOLDER`, now resolved); the closing key n (= key 0) shown at the end; the twist on during a still reload; the prone, shotgun and pump clips playing on after the cut. Fixed to R150.1-R150.6; the lock stays (R150.7) | §4 | §4 |

## 1. The owner's report, and what the port did

The port chose the reload clip **every frame** from the mover's speed (`WeaponPose.moving`, set by `play.ts` from
`reloadMoving(v)`): over 20 a second `seal_mv_reload`, under it the stance's whole-body clip, each sampled at the same
fraction of one fixed length (the lock's). So:

- a reload started running flipped to the whole-body `seal_reload` the moment the mover slowed under 20 (letting the
  stick go, a wall, a slope): the legs, the hips and the root jumped from the run into the standing reload's frozen pose
  mid-stride, at full weight, with no blend -- the "odd animation" of the report;
- a reload started still, then walked out of, kept the whole-body clip over the walk until the speed passed 20 (the
  legs frozen in the reload's stance while the body slid), then snapped to the overlay;
- the overlay, when it did show, was stretched over the still clip's 1.6 s (or 1.9 crouched) instead of its own 1.2;
- at the end of every reload the layer sampled key n, which research 77 §5 shows is a copy of key 0: the hands snapped
  back to the reload's first pose for the last frames while the 0.2 s ramp faded them out.

The mover's hold (`reloadHold`, `Walker.hold`: the crouched and prone still reloads hold the mover to their
`NoInterrupt`; the standing one never) was already the game's and is unchanged (§3.3 confirms it).

## 2. The clips on the disc

`motion.rdr` (`test-fixtures/RUN/READERC.ZAR`, through `motionTableFromArchive`) and the pack (`test-fixtures/RUN/
MOTION_P.ZAR`, through `clipsFromPack`); `reloadRun.test.ts` pins both at the fixture tier.

| clip | keys | `playback` | `looped` | `NoInterrupt` | `BlendOverlay` | `NoPitchtwist` | `NoFire` | parts |
|---|---|---|---|---|---|---|---|---|
| `seal_reload` | 45 | 1.6 | 0 | -- | -- | yes | yes | 26: the whole body with `rifle` |
| `seal_crouch_reload` | 28 | 1.9 | 0 | 0.35 | -- | yes | yes | 27 (`do_not_use` among them) |
| `seal_prone_reload` | 30 | 1.7 | 0 | 0.5 | -- | yes | yes | 27; `Normalize` |
| `seal_mv_reload` | 33 | 1.2 | 0 | -- | **yes** | yes | yes | **14**: `spinehi lbicep lforearm lhand rbicep rforearm rhand rifle rshoulder_wgt lshoulder_wgt lscap rscap neck head` |
| `seal_p_reload` / `_crouch_` / `_prone_` | 26 / 29 / 31 | 1.8 / 1.7 / 1.7 | 0 | -- / 0.35 / 0.5 | -- | yes | yes | 27 with `pistol` |
| `seal_p_mv_reload` | 21 | 1.2 | 0 | -- | **yes** | yes | yes | 14, `pistol` for `rifle` |
| `seal_reload_shotgun` / `_crouch_` / `_prone_` | 18 / 16 / 14 | 1.6 | 0 | -- | -- | yes | yes | 27 / 26 / 27 |
| `seal_mv_reload_shotgun` | 18 | 1.6 | 0 | -- | **yes** | yes | yes | 14 |
| `seal_pump_shotgun` | 18 | 0.9 | 0 | -- | -- | **no** | yes | 26; `shotgun_pump` at 0.35 |
| `seal_mv_pump_shotgun` | 14 | 0.9 | 0 | -- | **yes** | **no** | yes | 14; `shotgun_pump` at 0.35 |
| `seal_reload_m203` | 37 | 1.3 | 0 | -- | -- | yes | yes | 27 |

No reload record carries a `BlendTime`. The `BlendOverlay` flag is `motion.rdr`'s word for the second channel
(`MotionEntry.blendOverlay`, read since this note); the four moving reloads, the moving pump and `seal_mv_rifle2pistol`
carry it, no still clip does. The pack has no `seal_mv_pistol2rifle`: the moving swap back is the same clip backwards
(research 80). The names behind the decomp's words: D:L495218-495225 bind `DAT_003deb58..90` to `Pistol reload`,
`Rifle reload`, `Moving pistol reload`, `Moving rifle reload`, `Pistol crouch reload`, `Rifle crouch reload`, `Pistol
prone reload`, `Rifle prone reload`; D:L495238 `DAT_003debf8` `Rifle m203 reload`; D:L495399-495407 `DAT_003df098..d8`
the shotgun reloads, the pumps and `launcher_reload` (research 94 §C1.2 read them first).

## 3. What the game does

### 3.1 The start (`FUN_005a82e0`, D:L462786-462946)

- The item (`+0xf79 != 1`: the pistol, D:L462815), the round mode (`bVar4`, D:L462825-462828), the sniper class
  (`bVar5`, D:L462830-462832) and the posture `cVar7 = FUN_0057dc20` (D:L440546-440556: the stack's first entry whose
  posture byte is not 3 -- 0 stand, 1 crouch, 2 prone) pick the family and the stance as research 94 §C1.2 has them.
- `bVar3` (D:L462821-462823): the body's velocity squared (`+0x2c`, `+0x30`, `+0x34`) at most 400.0 -- still. Standing
  (D:L462886-462921) and crouched (D:L462853-462885) a still body takes the stance's clip, a moving one the family's
  `Moving ...` clip; prone (D:L462845-462852) takes the prone clip with no speed test; a round mode's still clip is
  `Rifle m203 reload` in every stance, moving `Moving rifle reload`. Posture 6 (D:L462837-462842) plays `Moving rifle
  reload` only in a round mode and otherwise no clip -- what posture 6 is was not followed (`RELOAD_POSTURE_SIX_READING`,
  §6, note only).
- Still, with the posture settled (`cVar1 == cVar7`, D:L462925), `FUN_0058a4d0(actor, 0)` (D:L446753-446781) pops the
  stack to the base stand/crouch/prone first; then `FUN_00588bc0(actor, type, posture, 0, 0)` (D:L462928) pushes the
  clip; `launcher_reload` gets a callback at 0.5 (D:L462929-462933); still, a record's `ReloadTime` over 0 sets the
  node's speed to the clip's length over it (D:L462935-462941; research 94 §C1.2).
- reCOM's `m_running_reload_speed` (`zchar.h:238`, loaded from `dynamics.rdr` `min_running_reload_speed` at
  `char_dyn.cpp:406-407`) has no reader in the retail test above; reCOM has no reload animation code to compare, so the
  decomp alone is the source here.

### 3.2 The channel (`FUN_00588bc0` D:L446055-446330; `FUN_00587780` D:L445333-445442)

- A motion whose flag byte `+0x4a` has bit 2 (`BlendOverlay`; D:L446083) is not pushed: `FUN_0028d940(anim+0x170)`
  clears the record of a running overlay (D:L446084; `FUN_0028d940` D:L134989-135019 frees the node at `+0x74` of the
  play, which is `+0x1e4` of the body) and `FUN_00587780` (D:L446085) plays the motion on the second channel
  `anim+0x180` with `FUN_0028d860` (D:L134953-134983: a node from the pool, type at `+0x22`, weight `+8` = 0, speed
  `+0x18` = 1) and fills the record: the node at `+0x1e4`, the trigger phase `+0x1e8` = -4.0 (none; `FUN_0028d450`
  D:L134806-134808 returns 1 for it), the clock `+0x1ec` = 0, the direction `+0x1f0` = 0 (not started), the kind
  `+0x1f2` = 1 for `Moving rifle reload`, 2 `Moving pistol reload` (D:L445358-445370), 3 `Moving shotgun reload`, 4
  `Moving shotgun pump` (D:L445405-445417); the swaps are kinds 5, 6, 8, 10 with their own trigger phases.
- Any other motion goes on the stack: `FUN_0028dc90(anim+0x170, motion, type, posture)` (D:L446292), a new main play --
  a cross-fade from the pose on screen over the motion's `BlendTime`, 0.4 when the record gives none (`FUN_00287620`;
  research 80, `./locomotion` `BLEND_TIME_DEFAULT`). While a one-shot is on top the ground state does not run
  (`FUN_00550ef0` D:L418172-418246; research 80): the still reload holds the mover, which `Walker.hold` already does for
  the crouched and prone ones; the standing one has no `NoInterrupt`, so the hold lasts until the first push (§3.3) and
  is not modelled -- the mover is still anyway and the turn is free (no `NoTurn`).

### 3.3 The cut and the carry-over (`FUN_00550ef0` D:L418171-418254; `FUN_00587c20` D:L445514-445576)

- Each actor tick, with a one-shot on top (not `0x40`, D:L418174) whose type did not change over the tick (D:L418176),
  `FUN_00587c20` says whether it may be cut (D:L418180): the top entry's phase `+0x1c` (D:L445550) against each node's
  motion `NoInterrupt` (`+0x30`, D:L445552): forward, past it (D:L445555); backwards, before 1 - it (D:L445561). No
  `NoInterrupt` is the loader's 0: at once.
- Then (D:L418182-418185) the three axes through `FUN_001b3620` (the absolute value): the move axes `actor+0x240` and
  `+0x244` and the turn axis `+0x23c`, any over 0.1 -- `INTERRUPT_STICK`, the test `Walker.holdCut` already makes. The
  phase is kept (`unaff_f20`, D:L418187) and `FUN_005870e0` resumes the ground state (D:L418203): a new main play,
  cross-faded over the locomotion clip's `BlendTime`.
- If the cut type was `Rifle reload`, `Rifle crouch reload` or `Rifle m203 reload` (D:L418205): `FUN_0028d940`
  clears the overlay record, `Moving rifle reload` is played on `anim+0x180` (D:L418206-418208), typed (D:L418209),
  recorded by `FUN_00587760` (D:L418210; D:L445319-445328 -- kind 1), and its clock `+0x1ec` is set to the phase x the
  motion's length `+0x10` x `FUN_0028ada0` (D:L418213; `FUN_0028ada0` D:L133355-133364: (n - 1)/n for a one-shot) --
  the seconds at which the overlay's own phase (§3.4) equals the phase the still clip had; `+0x1e8` = -4.0 (D:L418214 stores
  0xC0800000, the same "no trigger phase" `FUN_00587780` writes at D:L445360; corrected from -1.0 at the review). `Pistol reload` and `Pistol crouch reload` (D:L418216) go on as
  `Moving pistol reload` the same way (D:L418217-418225). The swap 0x35 follows (D:L418227-418250; research 80).
- No other type is in the list: a cut `Rifle prone reload`, `Pistol prone reload`, any shotgun reload, any pump or
  `launcher_reload` ends with the ground state's return and nothing plays on. (The prone ones have `NoInterrupt` 0.5,
  so the crawl cuts them only in their second half.) Nothing anywhere plays a still clip after an overlay.

### 3.4 The overlay's clock and end (`FUN_00579ef0` D:L438517-438551; `FUN_0028d170` D:L134684-134760)

- Each body tick `FUN_0028d170(dt, record, play)` (D:L438530): the direction `+0x1f0` 1 adds dt to the clock `+0x1ec`
  (D:L134692-134693), -1 subtracts it, 0 does nothing (D:L134696-134697). `fVar4` = t / the motion's length `+0x10`
  (D:L134703), `fVar3` = t / (length x (n-1)/n) (D:L134704-134705). Forward, `fVar3 >= 1.0` frees the node
  (`FUN_0028f4b0`) and clears the record (D:L134737-134757), answering 1 -- the clip is at its last key, 1.2 x 32/33 =
  1.164 s into `seal_mv_reload`; else `FUN_0028d670(fVar4, node)` (D:L134734) puts the node at phase `fVar4`: the key
  `fVar4 x n`, its index capped at n - 1 on a one-shot (D:L134893-134900). So the overlay's key at t is t / playback x n,
  and the carried clock of §3.3 lands it at phase x (n - 1): the still clip's normalised phase on the overlay's scale.
- When the node ends, `FUN_00579ef0` runs the swap kinds' hand-off (D:L438532-438543) and, for every kind, snapshots the
  body's 20 nodes if the play's own cross-fade is still running (`body+0x178 > 0`, `FUN_005765f0` D:L438544-438546;
  D:L436553-436576: `FUN_0028e370` per node) and sets `body+0x10d0` = 0.4 (D:L438547).
- The record's first tick (`FUN_0057a010` D:L438556-438651): with `+0x1f0` still 0 and the body's flag `+0xe1` bit 4
  set, the reload kinds take the last branch (D:L438627-438633): `FUN_0028d3f0(record, 0)` sets the direction to 1
  (D:L134784-134790), the same snapshot-if-blending, and `body+0x10d0` = 0.4 again. Without the flag the node is freed
  at once (D:L438635-438647); what bit 4 of `+0xe1` is was not followed (`OVERLAY_BODY_FLAG_READING`, §6, note only;
  research 80 names the same bit on the death class). Until the direction is set the pose builder skips the overlay
  (`+0x1f0 != 0`, D:L437457): one tick at most.

### 3.5 The composition and the cross-fades

- The pose builder `FUN_00577ea0` (D:L437428-437470): the main channel's nodes are sampled (`FUN_005777d0`, D:L437442)
  with their sub-nodes laid over them (`FUN_00576bb0(node weight)`, D:L437451; research 80's pistol layer), then merged
  (`FUN_00577000`, D:L437455); **then the overlay node is sampled and laid over the merged pose at 1.0**
  (D:L437456-437461: `FUN_00576bb0(1.0)`), `FUN_00576bb0` (D:L436731-436744) copying every part the top pose carries
  (`0.999 <= weight`) and leaving the rest. A hard override of the 14 parts, the legs and the root untouched.
- The body's blend tick `FUN_00576860` (D:L436611-436675) runs two cross-fades: the play's own (`+0x178` of `+0x17c`,
  `FUN_0028e0d0`) and the body's `+0x10d0`, divided by the literal 0.4 (D:L436643, D:L436664) through the ease
  `FUN_002874f0` (D:L131142-131148: 2s^2 to the middle and its mirror -- `blendWeight`) into `FUN_00576700`
  (D:L436580-436604: `FUN_0028e040` per node, the snapshot blended into the pose). With no play cross-fade running the
  snapshot is refreshed every frame (`FUN_005762e0` D:L436469-436471: `FUN_0028e3e0`), so a 0.4 set at the overlay's
  start or end always fades from the frame before it. The overlay's blend in and out is therefore the body's 0.4 s,
  smoothstep, from the pose on screen -- not the clip's `BlendTime`, which no code on this path reads.
- The still clip's cross-fades are the main channel's: in over its `BlendTime` default 0.4 (`FUN_0028dc90`,
  `FUN_00287620`); out, at its end, over the returning play's `BlendTime` (`seal_stand` 0.5; the crouch idles and the
  cycles none, so 0.4) from the held last key; at a cut, over the resumed locomotion's `BlendTime` from the frozen
  reload pose (`FUN_005870e0`: the pop `FUN_00589aa0` at D:L445128, then the ground state's enter through the actor's vtable
  `+0x90` at D:L445141-445148 -- a new main play with its snapshot; D:L445132-445135's `FUN_00588bc0(actor, 9, 6, 0, 0)` is
  the airborne branch, not this path; the cite corrected at review F-A's round) **and**
  the body's 0.4 for the overlay's start -- whether or not the mover's own play changes (a turn-only cut leaves the
  idle play as it is). In the port the layer asks the animator for that snapshot cross-fade (`PoseLayer.crossFade`,
  `Animator.snapshot` -- the stick snap's `FUN_0028e3e0` path): 0.4 when the overlay carries the clip on, the clip
  under the layer's `BlendTime` when the reload just ends; an animator play change the same frame takes precedence.

### 3.6 The twist

`FUN_00587a30` (D:L445447-445476): not in the death and ladder states (D:L445457-445468), the answer is the main
channel's **last node's** flag `+0x4a` bit 3 (D:L445471-445473) -- `NoPitchtwist` clears it. A still reload on the stack
is that node: no twist while it plays; the overlay is not read, so under `Moving rifle reload` the locomotion's own flag
holds (the cycles twist). `FUN_0057a330` 439192 scales the twist by the raise weight as before (research 83).

### 3.7 The lock

`FUN_005a7ab0` (D:L462512-462560): with no kit lock running, answers 1 while the stack's top (D:L462526-462531) or any
entry (`FUN_0058a470`, D:L462532-462544) is one of the fourteen reload and pump types, **or the overlay record's node
is typed `Moving rifle reload` or `Moving pistol reload`** (D:L462548-462555). So the fire is held exactly as long as the
reload clip lives: a standing reload cut at once is held for the overlay's 1.164 s, not 1.6; a crouched one cut at 0.35
for 0.665 s of still clip plus 0.65 x 1.164 s of overlay; a cut prone, shotgun or pump reload not at all after the cut
(the magazine was refilled at the start, research 84 §18). The page's `Fire` and the room lock for the start's length
(`reloadSeconds`): R150.7, §5.

## 4. The port

The reload lives in `WeaponPose` as a pose layer over the animator's plays (research 80's seam): the still clip stands
for the stack's main play, the moving clip for the second channel. `ReloadRun` keeps the clip, which channel it is on,
its clock `t`, its `period` (the still clip's `ReloadTime` or `playback`; the overlay's `playback`), `end` = (n-1)/n, its
`NoInterrupt`, its cross-fade in and, once at its last key, out, and the still clip's `NoPitchtwist`.

| the game (§3) | the port before | the port now |
|---|---|---|
| the clip chosen once, by the speed at the start (R150.1) | re-chosen every frame by the speed, both ways | `startReload(stance, length, family, moving)`: `play.ts` passes the `movingForReload()` it just answered `Fire` with; never re-decided |
| the overlay a hard override of its 14 parts over the locomotion (R150.2) | the layer's parts at its weight -- right for the overlay; the whole-body clip over a moving locomotion when under 20 | the same layer; the whole-body clip only while still, by construction |
| the still clip cut by a move or turn axis over 0.1 past `NoInterrupt`; the rifle's, the pistol's and the m203's carried on at the same phase; the rest end (R150.3, R150.4) | no cut: the speed flipped the clip | `step(dt, cut)`: `play.ts` `reloadCut(snap)` -- the ground state's stick (`actor+0x240/+0x244` as the mover stores it) or the turn over `turn_maxrate` past `INTERRUPT_STICK`; `CARRIES_ON` = rifle, pistol, m203 and not prone -> the overlay with `t` = phase x playback x (n-1)/n; else the layer ends |
| the overlay's key t / playback x n, freed at the last key (R150.5) | the moving clip stretched over the still length | `frameOf`, `lastKeyAt` (*since PARITY-2 PAR-73, research 251 §12.5: `outAt`; the still clip held at its last key until the pop and faded from there*): the overlay's own clock; the still clip's keys 0..n-1 over playback x ((n-1)/n)^2 as the animator's one-shots |
| in and out over the body's 0.4 (overlay); in over `BlendTime` default 0.4, out over the next play's (still) (R150.5, R150.6) | 0.2 s linear ramps, `RELOAD_BLEND_PLACEHOLDER` | `OVERLAY_BLEND` 0.4 and `blendWeight`'s ease; the still clip `entry.blendTime ?? BLEND_TIME_DEFAULT` in, the clip under the layer's `BlendTime` out from the last key; a carried overlay comes in at 1 under a whole-body snapshot cross-fade of 0.4 the layer asks for (`crossFade`; an end-at-cut asks the resumed play's `BlendTime`), so a turn-only cut jumps no joint (review F1) *(PAR-73: the still clip goes out from its pop, not its last key -- research 251 §12.5)* |
| keys 0..n-1, the last held (research 77 §5) | key n (= key 0) sampled at the end | capped at n - 1 |
| the twist off under a still reload, on under the overlay (R150.6) | on throughout | `PoseLayer.noPitchtwist` -> `Animator.layerNoTwist` -> `aim()` |
| `Fire`'s `reloadEnd` at the lock's end | killed the layer at once | `stopReload(completed)`: a clip at its last key finishes its fade; a cut-short end (a new map, leaving the walk) stops at once |

The mover's hold (`reloadHold`, `Walker.hold`) already held the crouched and prone still reloads to their `NoInterrupt`
and cut them by the same test, but on the clip's `playback`; the game runs the stack's node at length / `ReloadTime`
when still (§3.1, D:L462935-462940), so for the M60E3 (`ReloadTime` 3) the hold's 0.35 came at 0.64 s and the layer's
at 1.01 s -- the whole-body clip over a moving mover between them (review F2). Now `Walker.hold(clip, period)` runs
the hold over `oneShotSeconds(period, frames)` and reads its `NoInterrupt` on `period`: the page passes `Fire`'s
`reloadStart.seconds` (`walk.holdReload(e.seconds)`, the same `reloadSeconds`), and the room gives its `MoverSim` a
`holdPeriod` hook answering the same `reloadSeconds` from the seat's record, posture and velocity, so the two movers
hold alike (`reloadRun.test.ts` pins hold release == layer cut). The period is the hold's own only where the hold's clip
is the clip the reload plays (review F-A of 801f3732): the game's hold is the pushed clip itself (D:L462928, its phase
against its own `NoInterrupt` at `FUN_00587c20` D:L445549-445565), and `reloadHold` is the rifle's or the pistol's
crouched or prone clip, so `reloadHoldPeriod` passes the seconds for those two families only; the shotgun reload, the
pump and `Rifle m203 reload` keep the stand-in's `playback`. Passing their seconds (round two) made the page's hold
release on tick 19 for a crouched 870's pump while the room, which knows no after-shot or round mode, held to tick 33
(the M203 round-mode reload: 27 against 39). One derivation now on both sides, `reloadRun.test.ts` sweeping every disc
record the family, the after-shot, the round mode or `ReloadTime` touches, crouched and prone, on the wire too. The layer follows the hold's cut one tick behind at
most (the ground state runs, and its stick shows, the tick after the hold goes). The one `reloadMoving` decision stays
in `play.ts` (`movingForReload`), as the room's is (`weapon.test.ts` holds it). The family gate in `reloadHoldPeriod` (the seconds for the rifle and the pistol only) is the port's adaptation to the stand-in hold, not the original's rule -- the game scales whichever clip it pushed, by family, stance and speed alike (D:L462836-462941), against that clip's own `NoInterrupt`; the round-3 review (2026-10-03) asked for this to be said.

## 5. Settled, not settled, owed

- **Settled (reading, pending review):** R150.1-R150.6; the fixture pins of §2.
- **Drift (R150.7), owed to the fire lane:** the lock. `Fire.beginReload` and the room's lock take the start's
  `reloadSeconds`; the game's lock is the clip's life (§3.7). After this note a standing reload cut by the stick draws
  its arms back on the rifle at 1.164 s while the page and the room refuse rounds until 1.6 s (a cut crouched one:
  the clip ends about 1.42 s in, the lock at 1.9; a cut prone, shotgun or pump clip ends at the cut, the lock runs on).
  Making the lock follow needs the room to run the same cut on its mover (it has the stick and the hold), so the page
  never fires into a `reloading-or-empty` refusal (research 127): `reloadClip.ts` and `room.ts` are the fire/room lane's
  (hot files; COLLABORATION). The `it.fails` in `reloadRun.test.ts` and `character.reload.lock-follows-clip` hold the
  gap. **Built 2026-10-05 (web sprint 28 PF-18, ruling PF.R37; research 218 §2):** the room runs the same cut on its own
  mover and ends the lock at the carried overlay's last key or at the cut, the page one tick later at most; the
  `it.fails` is an `it`, the registry entry a reading. The uncut lock is still the start's length (218 §2).
- **Not settled:** posture 6 of `FUN_0057dc20` and bit 4 of `body+0xe1` (§6); the body tick's order between the play's
  advance, the cut and the overlay's first draw (one tick); the pistol's `seal_p_mv_reload` and the shotgun's
  `seal_mv_reload_shotgun` carry the same 14-part shape (§2) but their key-by-key poses were not compared with the
  rifle's -- the clips are the disc's, so nothing is owed there.
- **Owed (review F-A's round):** (1) the stand-in hold: a crouched or prone shotgun reload, pump or `Rifle m203 reload`
  holds the mover on `seal_crouch_reload`'s or `seal_prone_reload`'s `NoInterrupt` (0.35, 0.5) and `playback`, where the
  game's hold is the family's own clip, which has no `NoInterrupt` on the disc (`motion.rdr`: `seal_crouch_pump_shotgun`
  0.9, `seal_crouch_reload_shotgun` 1.6, `seal_reload_m203` 1.3, none set) and so gives way to the first push past 0.1;
  making the hold the family's clip is a wire change (`HOLD_CODES`) and the room's to know the after-shot and the round
  mode. (2) The room's family has no after-shot and no round mode (a `reload` event carries neither): the two sides
  agree only because no after-shot record and no carrier has a `ReloadTime` on the disc (the sweep pins it). (3) The
  respawn replay (`walk.ts` `respawn`) runs the server's unapplied commands through a `MoverSim` without `holdPeriod`,
  while the room applied its own: a still reload with a `ReloadTime` (Spas 12, JACKHAMMER, M60E3, M63A) crouched or prone
  straddling a respawn replays on the clip's `playback`. Not small: the replay runs (`client.ts` `spawned`) before the
  page learns the new kit (`netPage.ts`'s `respawned` -> `spawnKit`).
- **Owed:** the lock (above); the owner's eye on the fix in his own run is the acceptance (HUMAN_TASKS H77); a capture of the original's running reload for the proven level (none exists).

- **The owner's eye, 2026-10-04** (HUMAN_TASKS H77): the reload while running "is better but it still has notable
  differences from the original which should be recorded but not addressed further today". **NOT ACCEPTED: open.**
  He did not say which differences; they are his to describe when the reload is reopened. The candidates this note
  already holds, none of them confirmed as what he saw: the stand-in hold for the shotgun, pump and M203 clips (no
  `NoInterrupt` on the disc, so the game lets the first stick push cut them where the port still holds them), the
  respawn replay's null hold period, the room's narrower clip family, the lock following `ReloadTime` where the
  clip is shorter, and everything this note reads from the decompilation with no capture of the original's running
  reload to hold it. What reopening needs first: his description, or a capture of the original's reload while
  running (PCSX2 or the recomp) beside the port's, clip by clip.

## 6. Placeholders and readings

| name | what it stands for | status |
|---|---|---|
| `RELOAD_BLEND_PLACEHOLDER` (`weaponPose.ts`) | the reload's cross-fades, 0.2 s in and out | **resolved 2026-10-03**: the still clip's cross-fades are its `BlendTime` default 0.4 in and the next play's out (§3.5, `FUN_0028dc90`, `FUN_00287620`); the overlay's are the body's 0.4 both ways (`OVERLAY_BLEND`, `FUN_0057a010` D:L438633, `FUN_00579ef0` D:L438547, `FUN_00576860` D:L436643) -- removed from the code |
| `RELOAD_POSTURE_SIX_READING` | what posture 6 of `FUN_0057dc20` is (`FUN_005a82e0` D:L462837-462842 plays `Moving rifle reload` there only in a round mode) | *note only*: no constant stands in for it; the port has no sixth posture |
| `OVERLAY_BODY_FLAG_READING` | what bit 4 of `body+0xe1` is (`FUN_0057a010` D:L438581: the overlay plays only with it set; research 80 names the same bit on the death class) | *note only*: the port always draws the overlay |
