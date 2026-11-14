# 421 -- The death poses: which way the disc's death clips leave a body, and what the port draws (LATER 967)

- Date: 2026-11-12. Task V21-T, LATER 967 (a playtester, through the owner: the port's dead "always" lie face up).
  Seat f7's implementer, branch `agent/death-poses`, base `agent/v0421` 7abc533b9d.
- Track: simulation. **A measurement only: nothing in the port is changed by this note**, and no game code changes
  before it is reviewed.
- Status: **reading, pending review** -- the clips' data through the port's readers (`MOTION_P.ZAR`, `READERC.ZAR`,
  `MP2.ZDB` of the fixture disc); the original's anim-type numbering from the decompilation and the ELF's data (section
  6). The original's three pictured deaths are **observations** (n = 1 each). Nothing here is proven. *(2026-11-12,
  section 11: the original read -- `Die` rests FACE UP by its bones' world matrices; the pictures misled; the port's
  posing stands; the travel and the crouched picks remain. Section 12, 2026-11-13: six more, read after the killing
  shot; face-down rests exist by clip, as the disc's ends say. Section 14, 2026-11-13: LATER 980 MEASURED -- a
  crouch-runner's death is drawn from the crouched lists, a memory trace compared id for id, n = 5; and the port's
  crouched BODY list is the disc's three since CROUCH-BODY-LIST.)*
- Evidence kinds, kept apart: **(U)** a unit test over the fixture disc's data,
  `packages/viewer/test/deathPoses.test.ts` (run on the seat box, jobs dp-1 to dp-4, 2026-11-12; it prints every number
  below and pins the clips' ends);
  **(D)** source inspection of the r0001 decompilation `socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`;
  **(E)** the r0001 ELF's data: the static anim-type name table at 0x661060 (pointers and strings read off the file, as
  research 180 section 1.15 and 368 section 0 read it); **(O)** the Shadow PC's look at the original, relayed (section
  5). No capture was scored and no trace compared.
- New names: none. No `*_READING` or `*_PLACEHOLDER` is added or changed.

## 0. The answer

1. **The port draws each death clip's own last key, exactly** (U): on both skeletons and every clip, every bone's world
   rotation equals the clip's key n - 1 within 0.012 degrees, the torso's facing within 1 degree. What it leaves out is
   the root's travel (the root's x and z, up to 36.8 units; research 230 section 5.2 item 1). The clips' root carries no
   rotation at any key (U: under 0.005 degrees on all 22 and the landings), so there is no root orientation to strip
   or misapply. The last key is reached and held (`deathPose`'s one-shot clock, D20).
2. **The disc's clips themselves end both ways** (U): of the 22, 12 end face up, 9 face down and 1 on its side. The
   port's pick (`deathClip`) gives face down for 4 of the 8 standing BODY clips, 1 of the 2 crouched BODY clips (1 of
   the disc's 3 since CROUCH-BODY-LIST, 2026-11-13, section 4) and 2 of the 4 standing HEAD clips; face up for every
   standing limb kill (`death_stand_chest01`, "Die"), every crouched head kill and every prone death. So by the reading
   the port does not lay every body face up.
3. **Where it meets the original, it disagrees** (O against U): the three state words the Shadow PC read at rest name,
   by the original's own numbering (section 6), `Die` -> `death_stand_chest01` (7), `Death crouch chest02` ->
   `death_crouch_chest02` (142) and `Death stand larm01` -> `death_stand_larm01` (149) -- each in its case's BODY list,
   so the original's pick and the port's lists agree. The disc ends the first two **face up**; the original was seen
   **face down** in both. The third ends face up, as seen ("less clear"). The first one's root travels 18.6 units
   forward and 4.8 left -- the "about 18 units toward the shooter" seen -- which the port does not apply.
4. **Why: not settled.** Not a wrong pick, not a wrong last key or hold, not the root's orientation; the stripped travel
   explains the distance, not the facing. Either the original does not rest on these clips' last key the way the port
   draws it (section 7 weighs how), or the pictures or the state word misled. `death_stand_chest01` carries the most
   weight in the port's draws (every standing limb kill and one standing torso kill in eight), so if the original lays
   it face down the port shows face up where the original does not, most often of all. Section 9 is the capture that
   settles it. *(Items 3 and 4 are superseded by section 11, 2026-11-12: the original's `Die` rests face up by its
   bones' world matrices; the pictures misled.)*

## 1. The measure

- **The clips** (U): every key of `MOTION_P.ZAR` whose name starts `death` -- **22**, the same 22 `motion.rdr` rows and
  exactly the port's `DEATH_CLIPS` (its HEAD, BODY and TEAMMATE lists; none on the disc is outside them) -- and the
  knock's two landings, `seal_landforward01` and `seal_landbackwards01` (a blast's or a fall's dead body).
- **The bodies** (U): Frostfire's (MP2) SEAL 1 `seal_A_scuba` and TERRORIST 1 `al_gman01`, through
  `simSkeletonsFromBytes`.
  Every figure of the clip's own end is the same on both to the degree and the tenth of a unit (the clips' rotations
  drive both; the two bind poses differ only in lengths), so the tables give the SEAL's and the al_gman01 chest beside
  it; the port's drawn chest differs between the two by up to 1 degree on nine rows, and its column is the SEAL's.
- **The frame**: the body frame of `net/hitVolumes` -- x right, y up, z behind, the model facing -z. Checked on the
  body itself (U): the toes stand 1.6-1.7 units ahead (-z) of the ankles on both models, the left thigh at x -1.2, and
  `seal_run`'s root travels -34.6 z over its 19 keys (the mover's forward).
- **The chest's facing**: the torso's normal `(lbicep - rbicep) x (neck - spinelo)` -- exactly (0, 0, -1), the front,
  in the bind on both -- reported as its elevation: +90 straight up (face up), -90 straight down (face down); UP above
  +30, DOWN below -30, SIDE between. A second, independent read by the bone's own axes, `spinehi`'s local y (its axis
  nearest the front in the bind, fit 0.999 and 1.000), agrees on every clip in sign and within 18 degrees.
- **The pelvis** (`hips`; the root never turns): yaw is the heading of its head-ward axis (0 ahead, +90 to the left,
  180 behind), pitch that axis's elevation (90 upright, 0 lying), roll its front axis's elevation (+ face up).
- **The clip's own end**: key n - 1, the last distinct key (key n is key 0, research 77 section 5), every track laid as
  it is, the root's x and z included. **The root's travel**: key n - 1 less key 0 of the `skel_root` track, as forward
  (-dz), left (-dx) and down (-dy).
- **The port's drawn end**: the page's `Animator` fed `deathPose(clip, t)` from t = 0 to past the one-shot end
  (`oneShotSeconds`) in 1/30 s steps -- the traversal seam `remotePlayers.frame` (another seat's body) and
  `walk.ts` `setDeathPose` (the page's own) drive for a dead SEAL -- read off the skeleton after its last step.

## 2. The clips' ends, the clip's own and the port's

Units are the world's (0.1 m). "Height": the root's at key n - 1 (the same in the port). "Differ": the port against
the clip's own end; in every row the rotations agree (worst bone 0.006-0.012 degrees) and only the root's x and z
differ -- the port's root stands at (0, height, 0), the clip's travel not applied.

| clip | own chest, SEAL | own chest, al_gman01 | travel fwd / left / down | height | pelvis yaw / pitch / roll | port chest | differ |
|---|---|---|---|---|---|---|---|
| `death_stand_chest01` ("Die") | +80 UP | +80 UP | 18.6 / 4.8 / 10.0 | 1.5 | -28 / 5 / 62 | +80 UP | travel only |
| `death_stand_chest02` ("Death02") | +76 UP | +76 UP | 12.7 / 3.2 / 9.8 | 0.9 | -18 / 0 / 82 | +77 UP | travel only |
| `death_stand_chest03` | +86 UP | +86 UP | -14.2 / -0.6 / 9.7 | 1.5 | 176 / 2 / 82 | +86 UP | travel only |
| `death_stand_rarm01` | -81 DOWN | -81 DOWN | -3.1 / -7.8 / 9.5 | 1.9 | -170 / -10 / -80 | -81 DOWN | travel only |
| `death_stand_larm01` | +85 UP | +85 UP | -10.5 / -1.7 / 9.8 | 1.4 | 173 / 3 / 68 | +86 UP | travel only |
| `death_stand_larm02` | -77 DOWN | -77 DOWN | 2.0 / 12.7 / 9.6 | 1.2 | 168 / -17 / -69 | -77 DOWN | travel only |
| `death_stand_groin02` ("Crawl death01") | -87 DOWN | -87 DOWN | 36.8 / 0.5 / 9.7 | 1.7 | 3 / -4 / -69 | -87 DOWN | travel only |
| `death_stand_groin01` ("Crawl death02") | -84 DOWN | -84 DOWN | 29.3 / 0.0 / 8.9 | 1.6 | 14 / -4 / -86 | -84 DOWN | travel only |
| `death_stand_head01` | +87 UP | +87 UP | -12.8 / -1.3 / 10.5 | 1.1 | 176 / -4 / 78 | +87 UP | travel only |
| `death_stand_head02` | -78 DOWN | -78 DOWN | 14.7 / 0.5 / 9.5 | 1.6 | 11 / -8 / -82 | -78 DOWN | travel only |
| `death_stand_head03` | -76 DOWN | -76 DOWN | 14.4 / -0.4 / 9.5 | 1.7 | 12 / -7 / -76 | -76 DOWN | travel only |
| `death_stand_head04` | +85 UP | +85 UP | 17.5 / 3.9 / 9.6 | 1.6 | -23 / 1 / 82 | +86 UP | travel only |
| `death_crouch_back01` | -75 DOWN | -75 DOWN | 11.1 / -2.8 / 3.4 | 2.1 | 22 / -8 / -71 | -76 DOWN | travel only |
| `death_crouch_chest01` | +87 UP | +87 UP | -11.6 / -2.1 / 4.9 | 0.9 | 170 / 0 / 73 | +87 UP | travel only |
| `death_crouch_chest02` | +83 UP | +83 UP | 1.0 / 9.4 / 4.0 | 1.2 | 42 / -4 / 69 | +83 UP | travel only |
| `death_crouch_head01` | +85 UP | +85 UP | -11.5 / -1.8 / 5.0 | 1.2 | 174 / -2 / 68 | +84 UP | travel only |
| `death_prone_chest01` | +87 UP | +87 UP | -0.8 / 4.6 / 1.1 | 1.5 | 10 / 4 / 66 | +88 UP | travel only |
| `death_buddy_stand01` | -24 SIDE | -24 SIDE | -4.1 / 6.5 / 7.9 | 3.1 | 148 / 8 / 0 | -24 SIDE | travel only |
| `death_buddy_stand02` | +80 UP | +80 UP | -6.8 / 0.9 / 8.2 | 0.7 | -179 / 4 / 86 | +81 UP | travel only |
| `death_buddy_stand03` | -41 DOWN | -41 DOWN | 4.8 / 13.4 / 9.1 | 2.3 | 79 / 7 / -1 | -41 DOWN | travel only |
| `death_buddy_crouch01` | -70 DOWN | -70 DOWN | 11.8 / 1.7 / 6.4 | 2.3 | 2 / 9 / -31 | -70 DOWN | travel only |
| `death_buddy_prone01` | +89 UP | +89 UP | -0.2 / 3.6 / 0.8 | 1.7 | 20 / -2 / 84 | +89 UP | travel only |
| `seal_landforward01` (Land forward) | -83 DOWN | -83 DOWN | 0.7 / -0.1 / 0.4 | 1.7 | -9 / 10 / -78 | -83 DOWN | travel only |
| `seal_landbackwards01` (Land backwards) | +82 UP | +82 UP | -4.6 / 0.2 / 2.8 | 1.0 | 174 / -3 / 82 | +82 UP | travel only |

Most clips fall the natural way: forward onto the face with the head ahead (`groin01/02`, `head02/03`, `crouch_back01`),
or backward onto the back with the head behind (`chest03`, `head01`, `larm01`, the crouched `chest01` and `head01`).
Four end face up with the head **ahead** and the root travelled forward or aside -- `death_stand_chest01`,
`death_stand_chest02`, `death_stand_head04` and `death_crouch_chest02`: the body turns about as it goes down. The test
also prints each clip's chest and forward travel key by key (`REPORT DP path`); `death_stand_chest01`'s chest is below
-30 (face down, the body doubled over and going down forward) on keys 1 to 19 and over +30 from key 24 to its end
(41), its forward travel 11 at key 19 and 16 at key 22.

## 3. The port's drawn body against the clip's own

The port draws exactly the clip's last key, the root's x and z excepted (U, `deathPoses.test.ts`, held on every row):

- the animator's key at the end is n - 1 (`deathPose`, `FUN_0028cc10` D:L134482-134495 and `FUN_0028d670`
  D:L134881-134901 as research 230 section 5.2 item 3 reads them);
- every part's world rotation agrees with the clip's own end within 0.012 degrees (0.006-0.012), on both bodies;
- the torso's facing agrees within 1 degree (the port lays the bind's translations on all parts but the six
  `SAMPLED_TRANSLATIONS`, so the shoulder and neck points move by fractions of a unit);
- the root's height agrees; its x and z are 0 in the port (`animator.ts` `pose`: `FUN_0057a330`'s zeroing,
  D:L439147-439149 as research 230 section 5.1 cites it) where the clip's own key n - 1 has them -- the original zeroes
  them too, but turns the travel into the actor's velocity (research 230 section 5.2 item 1), which the port's dead body
  has no consumer for. So the port's corpse lies where the body stood; the original's moves by the travel (and
  whatever the mover's collision allows).
- No hold or settle follows the clip in the port: the last key stays (the remote's corpse until its seat is alive,
  `corpseShownS`). The corpse's root tilt is not run for another seat's dead body (`remotePlayers`,
  CORPSE_TILT_READING's note: "drawn level"); on flat ground the rule would write the identity anyway.

## 4. The port's pick per case (`deathClip`, called directly; every draw of the list)

| case | the port's list (each drawn alike) | face down |
|---|---|---|
| standing, chest hits from the front (BODY) | `stand_chest01` UP, `chest02` UP, `chest03` UP, `rarm01` DOWN, `larm01` UP, `larm02` DOWN, `groin02` DOWN, `groin01` DOWN | 4 of 8 |
| standing, hip box (`hips` is BODY) | the same 8 | 4 of 8 |
| crouched, chest (BODY) | `crouch_back01` DOWN, `crouch_chest01` UP, `crouch_chest02` UP | 1 of 3 |
| standing, head | `stand_head01` UP, `head02` DOWN, `head03` DOWN, `head04` UP | 2 of 4 |
| crouched, head | `crouch_head01` UP, `crouch_chest01` UP | 0 of 2 |
| prone, body or head | `prone_chest01` UP | 0 of 1 |
| standing, a limb | `stand_chest01` UP (the BODY list's first) | 0 of 1 |
| grenade, standing or crouched | no death clip: the knock throws the body (`Fall forward` -> `Land forward` DOWN, `Fall backwards` -> `Land backwards` UP) | by the throw |
| grenade, prone | `prone_chest01` UP | 0 of 1 |
| a fall | no death clip: `Land forward` held, DOWN | 1 of 1 |

The pick reads the part and the stance, not the shot's direction (as research 91 section 3 reads `FUN_005a0950`).
*(Corrected 2026-11-13, CROUCH-BODY-LIST: the crouched BODY row is the disc's three -- `damanim.rdr`'s
`BODY_DEATH_ANIMATIONS` CROUCH, `Death crouch back01`, `chest01`, `chest02` -- and so face down 1 of 3; the port's
`deaths.ts` had lost `chest01` and drew 1 of 2. Every list of `deaths.ts` is now pinned against the file, entry for
entry, by viewer `test/deathListsDisc.test.ts`.)*

## 5. The original, observed

**Observed on the original, n = 1, the clip not identified; pictures on the Shadow PC** (2026-11-12 ~17:25Z, r0004,
MP71, two clients, deaths by real shots, each body pictured at rest 2.5 s after the death; relayed in the task's brief
and LATER 967; the pictures were not seen by this note's author):

- standing, chest hits from the front (hB 12.65): **face down**, back and pack up, at rest about 18 units from where it
  stood, toward the shooter;
- crouched (hB 6.61): **face down**, arms spread;
- standing, the hip box only (hB 11.78): appears **face up**, less clear;
- head, prone and grenade deaths not obtained;
- the word `[E+0x534]` read 7, 149 and 142 at rest -- unconfirmed as an animation id, and the brief gives them in this
  order without saying they pair with the three cases one to one.

At 2.5 s the one-shot clock (section 1) has `death_stand_chest01` at key 28.3 of 41 (chest +79, already face up),
`death_crouch_chest02` at key 33.1 of 35 (+82; +80 at keys 27-31) and `death_stand_larm01` at its end (2.28 s; +85). So
a body still moving at 2.5 s does not explain the facing.

## 6. `[E+0x534]`, named

- **The field** (D): `FUN_00577e40` (D:L437398-437411) tests an anim type against the actor's short at `+0x534`. It is
  the type of the play on top: the push `FUN_00588bc0` writes the pushed play's type (`+0x2c`) there (D:L446298-446299),
  the pop `FUN_00589aa0` the new top's (D:L446524-446525; 0xffff with none, D:L446518), and the weapon change's remap
  `FUN_0057d5e0` the top's after it (D:L440391-440393) -- each through the anim set's lookup `FUN_005e1a90`
  (D:L495016-495035), which returns the set's entry's second short, where `FUN_005e3ff0` stores the entry's type
  (D:L496262-496263: the motion index first, the type second). So a dead body's `+0x534` at rest is the type of the
  play on its top then. That the Shadow PC's `E` is the actor is the observation's.
- **The numbering** (D, E, U): `FUN_005e30f0` loads the ELF's static names, ids 0 to 136 (`DAT_0066b800 = 0x89`,
  D:L495452; the table `PTR_s_Reference_00661060`, D:L495478-495487; E: 137 pointers, the 138th zero); `FUN_005e3ff0`
  gives every `animset.rdr` set, in the file's order, every `anim_set_anims` row in order, and a `type_name` not yet
  known the next id (D:L496194-496238, the only increment of `DAT_0066b800` in the text, D:L496207). The test rebuilds
  it (U): 137 static and 228 from `animset.rdr`, 365 in all; it reproduces the doors' two types (63 `Open door`, the
  static table's; 284 `Kick open door`, `KICK_DOOR_TYPE_READING`), the numbering's anchors.
- **The three values** (U): **7 = `Die`** (static) -> `GLOBAL` `death_stand_chest01`; **142 = `Death crouch chest02`**
  -> `death_crouch_chest02`; **149 = `Death stand larm01`** -> `death_stand_larm01`. `GLOBAL`'s death rows run
  137 `Death02` ... 157 `Death buddy prone01` in its order (`Crawl death01` 138 -> `groin02`, `Crawl death02` 139 ->
  `groin01`, research 179 section 11.2), then 170 `CQB victim` -> `death_stand_head01`, 174 `Land forward`, 176
  `Land backwards`.
- **So the animset's order maps them, and the cases fit**: one standing BODY clip, one crouched BODY clip, one standing
  BODY clip, in the brief's order standing chest / crouched / standing hip -- the crouched case is the only one a crouch
  type can be, and `Die`'s travel is the 18 units seen. Reading for the numbering, observation for the pairing.

## 7. Where they differ, and why

| candidate | verdict | why |
|---|---|---|
| a wrong pick | **no** | the identified clips are in the port's lists for those cases (section 4); the pick is random in the list in both |
| a wrong last key or hold | **no** | the port draws key n - 1 exactly (section 3); at 2.5 s the original's clock is past the face-up turn too (section 5) |
| the stripped root travel (research 230 section 5.2 item 1) | **the distance, not the facing** | `Die`'s travel (18.6 forward, 4.8 left) is the 18 units seen; the port's corpse stays where it stood. A translation cannot turn a body over |
| a wrong root orientation | **no** | the death clips' `skel_root` never turns (U, every key); the lying is the hips' and the spine's |
| the disc clips end face up | **yes, for these two -- and the original was seen face down** | `death_stand_chest01` +80, `death_crouch_chest02` +83 (U, both bodies, two measures) |

So for the two clear cases the port and the disc agree with each other and both disagree with the pictures. What could
make the original rest face down on a clip whose last key is face up -- each a hypothesis, none read:

1. **The original's corpse stops on its clip before the end and holds an earlier key** (its top is still the death's
   play: the word reads its type). `Die` is face down on keys 1 to 19, but its travel there is 11 or less, not 18
   (section 2); and `death_crouch_chest02` is never below -30 (it leans forward at most 26 degrees, keys 0 to 10).
   Against it for both.
2. **Something replaces the death's pose after it.** A corpse's hard landing pushes `Land forward` (face down; research
   180 section 1 and `mover.ts`'s note on `FUN_005af590`) -- but a push writes its type to `+0x534` (section 6), which
   would then read 174, not 7 or 142. Against it, by the reading and the word read.
3. **The original poses these clips another way than the port.** Diagnostics only (U, `REPORT DP diag`): the hips'
   rotation turned the other way, every part's turned the other way, or the hips held at key 0 -- none lays `Die` face
   down (+81, +72, +9); `Die`'s hips end on a half turn (quaternion (-0.31, -0.74, 0.59, -0.01)), the same either way.
   Every part turned the other way is ruled out anyway by the port's living body (the knees would bend backward), and
   research 77 section 6 holds the convention on the toes' bind.
4. **The pictures or the word misled** (n = 1 each; the pictures not reviewed here; the hip case "less clear").

The port's face-up is therefore not one of the five causes the brief names; it is the disc's own end for the clips
drawn, and the open question is the original's corpse, not the port's posing. **If the original does lay `Die` face
down**, the port is wrong where it is most often drawn: `death_stand_chest01` is every standing limb kill and one
standing torso kill in eight (and the hostages' limb kill, `deaths.ts` `HOSTAGE_DEATH_LIST_READING`).

## 8. Which clips give face down, about 18 units toward the shooter (the sign)

- **The sign.** "Chest hits from the front": the victim faced the shooter, so the shooter lies along the body's
  forward, -z in the body frame. "Toward the shooter" is therefore **forward travel**, a **negative** clip dz (`-dz`
  > 0 in the tables) -- not backward travel. (Unrecorded: the victim's facing at the death; if it was not facing the
  shooter, the travel's direction relative to the shooter says nothing of dz's sign.)
- **Forward about 18 (U)**: `death_stand_chest01` 18.6 (+4.8 left), `death_stand_head04` 17.5 -- both end **face up**.
  Face-down clips that travel forward: `death_stand_head02` 14.7 and `head03` 14.4 (the HEAD list),
  `death_stand_groin01` 29.3 and `groin02` 36.8 (the BODY list's last two), `death_crouch_back01` 11.1 (crouched),
  `death_buddy_crouch01` 11.8 (the TEAMMATE list). No face-down clip of the standing BODY list travels near 18:
  `rarm01` goes 3.1 back and 7.8 right, `larm02` 2.0 forward and 12.7 left.
- So the observed pair (face down, about 18 forward) is no clip's own end; `Die`, the type read, matches the distance
  and not the facing.

## 9. Owed evidence

1. **The capture that settles it** (PCSX2 on the original; reads only; the Shadow PC's rig): a SEAL killed standing
   by a limb hit (the BODY list's first, `Die`, type 7) and one by chest hits until a 7 is drawn; at rest read the short
   at actor `+0x534`, the top play's phase (`+0x1c`) and key, the actor's position before and after (predicted 18.6
   forward, 4.8 left for `Die`), and the world matrix of `hips` or `spinehi` (predicted for `Die`: the front axis +80
   degrees up, the head-ward axis 28 degrees right of ahead). The same for a crouched `Death crouch chest02` (142;
   predicted +83 up, 9.4 left). A third reading, from the review's skinned-mesh check: the disc's own face mesh posed at
   `Die`'s end faces up (its normal's y +0.78), so the matrix read is what can contradict the pictures. A face-down
   result with the play at its end opens a task on the port's posing; a face-down result with the play short of its end
   or another type on top opens one on the corpse's hold. *(Done 2026-11-12: section 11.)*
2. **The travel's consumer** (research 230 section 5.2 item 1): the original's extracted death velocity, its collision
   and where the corpse ends -- the port's corpse does not move.
3. **The other cases**: head, prone and grenade deaths on the original, which the pictures did not reach.

## 10. Readings and placeholders

None added, none changed. The figures are pinned by `deathPoses.test.ts` (each clip's chest on both bodies, its travel
and height); a change to the reader, the skeletons or the port's posing shows there.

## 11. The original read (2026-11-12, 21:18-21:45Z): `Die` rests face up

**The read** (O, a memory trace of the original: the Shadow PC, relayed by the "Shadow relay setup" session; r0004, our
own Horizon, two PCSX2 clients, MP2 Frostfire; A a Terrorist with the 552 -- the kill feed names it, so research 398
section 8.1's weapon is now read, not inferred -- and B a SEAL 40 u in front of A facing it, placed and turned by set-up
writes only, logged; deaths by real shots, one a fresh spawn; no health or armour write). At rest the reader took
`+0x534`, the play on top (its type and phase), B's position before the killing shot and at rest, and the world matrices
of B's `hips` and `spinehi`, composed up the node chain as `FUN_003109f0` (D:L212153-212210) composes them: the bone
record at actor `+0x304` / `+0x310`, its node at `+0x0c`, the local 4 x 4 at the node's `+0x00` (row 3 the translation),
the parent at `+0x64`, stopping at the world node (`+0x58` type 6). Every self-check passed on every read: the names at
the node's `+0x90` read `hips` and `spinehi`; the walk met the world node at depth 3 and 6, the last node applied being
`*(actor+0x28)`; the rows unit within 2e-4, orthogonal, det 0.999-1.000; standing, the hips 11.5 above the feet and
`spinehi` 13.8; dead, both 0.9-1.5 above the root and within 2.3 of `actor+0x1c`; a frame apart the dead chains agree.
The order child-first (World = L(node) . L(parent) . ...) puts the translation at the body. Records:
`D:/s2u/evidence/death-pose/` on the Shadow PC (`reads.jsonl`, every raw value), uploaded to the shadow output's
`2026-11-12/death-pose/` with the pictures, the logs, the csvs and the reader's source.

**The calibration** (B standing facing A, no death): `hips`' row 1 points up (1.4 degrees off +y) and B's facing (-row 2
of `*(actor+0x28)`) is -0.523 row 0 + 0.013 row 1 - 0.852 row 2 in the hips' frame (the idle's hips stand about 31
degrees turned); `spinehi`'s row 0 points up (4.4 degrees) and the facing is 0.043 row 0 + 0.809 row 1 + 0.586 row 2. At
each death the same front direction is reported against the world's vertical.

| death | killing shot | `+0x534` and play on top | travel (ahead = toward the shooter) | `spinehi` front | `hips` front |
|---|---|---|---|---|---|
| DP3_leg, standing | the left leg to 0 | 7 `Die`, phase 0.953 | 18.0 ahead, 5.6 left | +64.1 above level, UP | +31.3, UP |
| DP3_arm, standing | the left arm to 0 | 7 `Die`, phase 0.962 | 16.7 ahead, 5.7 left | +63.8, UP | +31.2, UP |
| DP3_crouch, crouched | "the chest" | 141 `Death crouch chest01`, 0.970 | 11.2 back, 2.1 right | +56.4, UP | +75.2, UP |
| DP3_crouchb, crouched | "the chest" | 148 `Death prone chest01`, 0.969 | 0.7 back, 4.6 left | +55.6, UP | +82.1, UP |

Earlier deaths of the slot, without a matrix read: a standing chest kill drew 152 (`Death stand chest03`), limb kills
drew 7 four times, and one crouched "chest" kill drew 7. The type names are this note's numbering (section 6), now
pinned for all six values seen (`deathPoses.test.ts`, SEEN_NAMES).

**What it settles.** `Die` -- the clip the playtester's report turns on, every standing limb kill and one standing torso
kill in eight -- rests **face up** on the original, its chest's front 64 degrees above level by `spinehi` and 31 by
`hips`, on both deaths read; so do `death_crouch_chest01` and `death_prone_chest01`. That is the disc's end and the
port's drawn end (sections 2 and 3: `Die` +80, `crouch_chest01` +87, `prone_chest01` +87, all up), in sign. The angles
differ from section 2's (+64 against +80) by the measure -- section 2's chest axis is not the calibrated front of
`spinehi` -- and by the phase, 0.95-0.97, short of the end; they are not compared value for value here, so this is a
measured outcome of the original (n = 2 standing, 2 crouched), not a proven pose. The travel agrees too: 18.0 / 16.7
ahead and 5.6 / 5.7 left against `Die`'s 18.6 and 4.8; 11.2 back against `crouch_chest01`'s 11.6; 0.7 back and 4.6 left
against `prone_chest01`'s 0.8 and 4.6. **So the face-down pictures misled** (section 9's routing: face up, nothing
changes in the port's posing). The camera says why: B's own death camera, at rest, stood 40 u behind B's start and 25 u
up, looking ahead and down past the body (eye (902.06, 125.12, 615.58), target (876.61, 121.01, 615.58)); a `-B` picture
shows the corpse from behind its feet and above, the chest out of sight. The afternoon's MP71 face-down reads came
from B's screen too, by the shadow seat's account of its 17:2xZ run (A's zoomed scope mostly missed the body; B's death
camera showed it); no camera was read on MP71.

**What remains, each its own question:**

- **The root travel.** The original's body comes to rest 17-18 u ahead of where it stood on `Die` (and 11 back on
  `crouch_chest01`): the clips' travel is applied. The port's corpse does not move (section 3; research 230 section 5.2
  item 1). Its own simulation-track task: where the corpse lies on every page and in a replay, and what the death camera
  and the body's collision do with the travel; LATER 974.
- **The crouched picks, and a disagreement on limb deaths.** A crouched "chest" kill drew 142 `crouch_chest02` (the
  crouched BODY list), 141 `crouch_chest01` (the crouched HEAD list, and since CROUCH-BODY-LIST the crouched BODY list
  too), 148 `prone_chest01` (the prone lists) and 7 `Die`. The last is one the port could not draw for a crouched player
  until LIMB-DEATH (2026-11-12): for a player's limb kill `deathClip` returned the stance's own BODY list's first
  (`BODY[stance][0]`: `death_crouch_back01` crouched, `death_prone_chest01` prone); since LIMB-DEATH it returns `Die` in
  every stance. The decompilation reads otherwise (D, re-read by this note's review): in `FUN_005a0950`'s player branch
  (D:L458942-458959) a limb's row has no list (count 0, research 91 section 3), so nothing is drawn and the shared tail
  `LAB_005a0b20` returns `*DAT_0044cee4` -- the pointer at 0x44ce78 + 3 x 0x24 + 0 x 0xc, the BODY row's standing list,
  its first: `Die`, in every stance; the stance's own BODY first (`(&DAT_0044cee4)[stance x 3]`, D:L458954) is only the
  fallback for a -1 entry inside a drawn list. So a crouched or prone player killed by a limb hit plays `Die` on the
  original -- the crouched 7 seen does not show it, its killing part being unread (the healths were read before the
  killing shot, not after) -- and played the stance's BODY first in the port: research 91 section 3's "the BODY list's
  first clip for the stance" and the port's player path are wrong for crouched and prone limb deaths (the hostage path,
  research 238, already reads the tail so). Fixed by LIMB-DEATH (`agent/limb-death`, v0.4.21; RED on `deaths.test.ts`'s
  crouched and prone limb cases; LATER 967 (2)). 141 and 148 still owe the killing shot's part deltas and the posture
  word at death (in the read's `reads.jsonl`) against `FUN_005a0950`'s part and posture: a crouched HEAD kill and a
  prone kill by the port's rule, or lists wider than the port reads.
- **The other cases**, unread on the original: head, prone and grenade deaths.

## 12. The second read (2026-11-13, 00:37-00:45Z): face-down rests exist on the original, by clip

**The read** (O, a memory trace of the original; the Shadow PC, relayed by the "Shadow relay setup" session; r0004, MP2,
our own Horizon, two PCSX2 clients; A a Terrorist with the 552 shooting B, a SEAL facing A, placed and turned by set-up
writes only; deaths by real shots, one a fresh spawn; no health or armour write). New in this read, after every
finishing shot: B's six healths and armours (so the killing hit's part is read, not bounded), the posture word at actor
`+0x174` (u16: 0 standing, 1 crouched) and `+0x534`; at rest the hips' and `spinehi`'s world matrices by section 11's
recipe, every self-check passing and two reads agreeing, faced against section 11's calibration. Each row is n = 1.
Records: `D:/s2u/evidence/death-pose/` (`reads.jsonl`, `facing-analysis-dp4.txt`) and the rig's `deaths.log`, uploaded
to the shadow output's `2026-11-13/death-pose-967/` with the pictures.

| death | range, posture at death | the killing hit (read after it) | `+0x534`, the clip (section 6) | rests (hips / `spinehi` front) | the disc's end (section 2) |
|---|---|---|---|---|---|
| DP4_head20 | 20 u, 0 standing | BODY (17.9 to 0, its armour 17.02 to 14.04; the head untouched) | 150 `death_stand_rarm01` | DOWN (-55 / -48) | -81 DOWN |
| DP4_head20b | 20 u, 0 standing | HEAD, one shot (8 to 0, nothing else moved) | 145 `death_stand_head02` | DOWN (-58 / -51) | -78 DOWN |
| DP4_head20c | 20 u, 0 standing | HEAD, one shot (8 to 0) | 144 `death_stand_head01` | UP (+70 / +58) | +87 UP |
| DP4_crouchleg | 40 u, 1 crouched | BODY (8.3 to 0, its armour 17.02 to 14.04; the limbs to 0 by the cap) | 142 `death_crouch_chest02` | UP (+78 / +55) | +83 UP |
| DP4_prone (prone not reached) | 40 u, 1 crouched | BODY (its armour 20.6 to 17.02) | 140 `death_crouch_back01` | DOWN (-41 / -42) | -75 DOWN |
| DP4_crouchbody | 40 u, 1 crouched | no part's armour moved: LARM and LLEG already 0, the body 8.3 to 0 | 7 `Die` (`death_stand_chest01`) | UP (+31 / +64) | +80 UP |

**The rig's facings agree with the disc's for all six** (up or down; the angles differ by the measure and the phase, as
section 11 says). With section 11's four, every death read on the original so far rests the way its clip's own last key
and the port's drawn body do.

**The picks against the port's lists** (section 4; the lists are `damanim.rdr`'s rows as research 91 transcribes them
into `deaths.ts` -- a reading; only BODY STAND is pinned against the disc's own file, `remoteDeath.test.ts`): 150 is in
the standing BODY list, 145 and 144 in the standing HEAD list, 142 and 140 in the crouched BODY list, each for its read
part and posture -- none missing or mis-listed. *(Withdrawn 2026-11-13, CROUCH-BODY-LIST: "none missing or mis-listed"
held only for these five ids. The port's crouched BODY list lacked `death_crouch_chest01` (141) until this fix -- the
disc's `BODY_DEATH_ANIMATIONS` CROUCH holds back01, chest01 and chest02 -- and the original's 141 on crouched kills,
read as a HEAD-list id in section 11, is a crouched BODY id as well (LATER 980's read, section 14). Every list is now
pinned against the file, viewer `test/deathListsDisc.test.ts`.)* The no-part crouched death drawing 7 reads as a limb
kill: a hit on an arm or leg already at 0 spills to the body at 0.3 of its damage with piercing 10 (`FUN_005a5830`,
D:L461487-461490; viewer `net/damage.ts` `LIMB_SPILL`, `LIMB_SPILL_PIERCING`), which the armour step lets through whole,
so the body falls with no armour moving -- the relayed signature (about 9 against the 8.3 left, the other rows implying
about 30 a round); and the death pick takes the struck part, not the spill's BODY (`FUN_005a54d0` at D:L459596 gets the
`param_4` that `FUN_005a5830` got, D:L459574 / D:L459579), so a limb, and `FUN_005a0950` returns BODY STAND's first in
every stance -- LIMB-DEATH's reading (research 91 section 3 as corrected; `agent/limb-death`). It is LIMB-DEATH's
**first measured case**, n = 1, **the struck part inferred from the deltas, not read** (LARM and LLEG were both at 0; a
direct BODY hit is excluded only while the body's armour was above 0 at that shot, not relayed; section 11's crouched 7
had its killing part unread). Still unexplained: section 11's 148 `death_prone_chest01` for a crouched kill, whose
killing part and posture at death were not read (a prone posture at death would explain it).

**How often a death ends face down -- the port's lists, by section 4 and section 2's ends** (a reading: the lists as
transcribed, the ends U; a uniform draw in each list, `rand() % count` as `FUN_005a0950` draws, D:L458945-458951; the
original's lists are the same rows by the reading, so the same odds):

| the killing hit | the clips the port can draw | face down |
|---|---|---|
| standing, BODY | `stand_chest01` UP, `chest02` UP, `chest03` UP, `rarm01` DOWN, `larm01` UP, `larm02` DOWN, `groin02` DOWN, `groin01` DOWN | 4 in 8 |
| standing, HEAD | `stand_head01` UP, `head02` DOWN, `head03` DOWN, `head04` UP | 2 in 4 |
| crouched, BODY | `crouch_back01` DOWN, `crouch_chest01` UP, `crouch_chest02` UP (the disc's three; 1 in 2 with the port's two before 2026-11-13) | 1 in 3 |
| crouched, HEAD | `crouch_head01` UP, `crouch_chest01` UP | 0 in 2 |
| prone, HEAD or BODY | `prone_chest01` UP | 0 in 1 |
| a limb, any stance (since LIMB-DEATH) | `stand_chest01` (`Die`) UP | 0 in 1 |

So a port death ends face down about half the time when the killing hit is the body or the head standing, a third of the
time when it is the body crouched (half, with the port's two-clip list before CROUCH-BODY-LIST), and never when it is a
limb, a crouched head or a prone body -- the same as the original's lists give, and what the rig saw case by case. The
playtester's "always face up" is then a matter of which part ends a life in play: every limb kill draws `Die`, face up.
The share of kills by killing part in real matches is not counted here (section 13: the port's replays do not record the
part, and they are the port's, not the original's). Not read on the original: prone deaths (B's long press left it
crouched; no prone input known on the rig), grenade deaths (no scripted throw), and the port's own bodies in a rendered
two-page match for these cases (the measuring test reads the port's posing, not a page).

## 13. The count tool

*Product track: a measuring tool of ours (`DEATH_COUNT_ADAPTATION`), with no original; it changes nothing the game does
and adds no reading.* `tools/death-count.ts` (`npx tsx tools/death-count.ts <dir> [--json <file>] [--exclude-bots]`,
from `socomlegacy/`; its test `tools/test/deathCount.test.ts`, on the fixture replays) reads a directory of `.s2r` match
replays and prints aggregates only -- never a player, an account, an id, a match, a replay or a file -- of the
**port's** deaths in real play: the total, by cause, by the clip the room chose and its end facing (section 2's
table), by the victim's posture and the killing part, per build (the header's commit and protocol); and the same deaths
as the fixed lists would draw them (LIMB-DEATH, section 11: a crouched or prone limb kill re-assigned to `Die`). It
says nothing of what the original's players saw. A replay records the kill's cause and clip and, in its snapshots, the
victim's posture, but not the killing hit's part (the room's `kill` event drops it; the `hurt` event that carries it
is the recipient's alone), so the share of kills by part goes only as far as the replay allows: cause 3 is the head, a
bullet's clip only the stance's BODY list holds is the body, and the BODY list's first (`death_stand_chest01`,
`death_crouch_back01`, `death_prone_chest01`) is a limb or a body kill that drew it, given as a range and as an
expected split by section 4's uniform draw -- for prone, whose list is one clip, the draw tells nothing, and its split
borrows the standing and crouched share (an assumption the output says).

**The results** (2026-11-13; the tool at `agent/death-count` 6e325d0c6a run once over the owner's local archive of
people-match recordings, 612 files, read-only on the host where it is kept; nothing of it copied, committed or uploaded;
aggregates only, the output checked for names). 12,542 player deaths (79 hostage deaths left out), recorded on 39 builds
of protocols 11 to 15 (their commits dated 2026-10-20 to 2026-11-11; the tool prints no recording dates) -- every build
before LIMB-DEATH, checked by commit ancestry, not by the tool; the largest shares on 6343231f0 (protocol 14, 2,753
deaths), c6a72241d (15, 2,252), bb133165e (13, 1,980), e9cebf0b4 (13, 1,697) and 8882b74b5 (13, 1,194).

| | deaths | share |
|---|---|---|
| by cause: bullet (5) | 5,106 | 40.7% |
| head (3) | 4,586 | 36.6% |
| blast (4) | 2,814 | 22.4% |
| fall (7) | 36 | 0.3% |
| **end facing as recorded: face up** | 6,782 | **54.1%** |
| **face down** | 5,714 | **45.6%** |
| unknown (a blast or fall whose landing the snapshots do not name) | 46 | 0.4% |

The clips, as recorded: the four standing HEAD clips 8.4-8.8% each (`head02` and `head03` face down); the eight standing
BODY clips 4.2-8.5% each (`chest01` 8.5%, the rest 4.2-4.8%; `rarm01`, `larm02`, `groin01`, `groin02` face down);
`prone_chest01` 2.1%; the crouched clips 0.3-0.7% each; a blast's or a fall's landing (no death clip) 22.2%. Postures:
standing 11,917, crouched 365, prone 260. The killing part, inferred (the replay does not record it): of the 9,689
bullet kills with a clip (three more had none), head 4,586 (47.3%), body 4,551 and limb 552 by the expected split (47.0%
and 5.7%; the range 0-1,183 limbs). **As the fixed lists would draw** (each crouched or prone limb kill re-assigned to
`Die`): face up 54.1% and face down 45.5% by the expected split (54.1-54.4% and 45.2-45.6% over the range) -- LIMB-DEATH
turns at most 47 deaths in 12,542 from face down to face up.

**What it shows.** In real play the port's room chose a face-down death for **about 46 of every 100 deaths**, before and
after LIMB-DEATH alike; limb kills, which always draw `Die` face up, are about 6% of bullet kills. So the playtester's
"always face up" is **not** explained by the share of limb kills (section 12's "likely" is withdrawn by this count), nor
by the room's choice of clip, which matches the original's lists and their odds. **What it cannot show:** what any page
drew. The replay holds the clip the room chose, not the body a page displayed; whether a victim's, a killer's or a
watcher's page plays that clip to its face-down end -- the remote copy's death on a watcher's page (`remotePlayers`,
`net/deaths.ts`), a join's corpse, a body rebuilt while dead (LATER 939) -- is the next thing to look at, in a rendered
match, against these shares. Nor does it show what the original's players saw, or the share of kills by part beyond the
range above. The tool also found 1,416 deaths whose clip names a standing list while the first dead snapshot shows the
body crouched: most likely players killed while crouch-running -- the room draws the clip from the walker's posture
(`room.ts`), which reads `stand` while a crouch runs at full stick (`mover.ts`'s `posture`), and a dead body stops
running, so its snapshot shows `crouch`. So "crouched 365" counts the posture the room drew, not every crouched player;
whether the original also draws a standing death for a crouch-runner is a simulation-track question, not examined here.
The count also assumes every recording predates LIMB-DEATH (the tool takes the posture from the clip, so a later
crouched or prone limb kill would read as standing; it says so, and warns on a prone `Die`).

*(2026-11-13, CROUCH-BODY-LIST: the count above was taken with the old lists, the crouched BODY list two clips,
back01 and chest02. `death_crouch_chest01` (141) is now in the crouched BODY list as well as the crouched HEAD list, so
a crouched 141 by itself is a head or a body kill: on the original, where only the id is read, it stays ambiguous
until the killing part is read; in a replay the cause tells them apart (3 the head, 5 a bullet elsewhere), and the
tool, reading its lists from `deaths.ts`, now classes a crouched cause-5 141 as a body kill. The recordings counted
cannot hold one: every build in them drew a crouched body kill from back01 and chest02 alone. A re-run would not move
the facing share materially. The new list touches crouched BODY kills only, and crouched deaths were 365 of 12,542
(2.9%), each crouched clip 0.3-0.7% of all deaths. Over the same recordings, the expected split now divides the
crouched body-only kills over 2 other clips, not 1, which moves at most half of them (half of a clip's 0.7%, under 0.4
of a point) from back01, face down, to `Die`, face up, in the fixed-lists columns; the recorded columns do not change.
For deaths drawn from now on, a crouched BODY kill ends face down 1 in 3, not 1 in 2: on section 13's postures at most
365 x (1/2 - 1/3), about 61 deaths, under 0.5 of a point; with LATER 980's crouch-runners drawn crouched as well (the
1,416 above), at most (365 + 1,416) x 1/6, about 297, 2.4 points, a bound only, since head and blast deaths are among
them.)*

## 14. The crouch-runner's death: which posture the original's pick reads (LATER 980; measured 2026-11-13)

**The original** (D, source inspection of the r0001 decompilation). The death pick's posture is `FUN_005a0700`'s, handed
to `FUN_005a0950` as its third argument (D:L458893). It starts from `FUN_0058a720(actor, 0)` (D:L458846), and with a
second argument of 0 that routine returns the actor's raw stance word, the byte at `+0x174` (D:L446840-446842) -- 0
standing, 1 crouched, 2 prone (the word the Shadow PC read at death, section 12). A word of 0, 1 or 2 is used as it is;
8 goes through `FUN_0057dbb0` (the play stack's posture, D:L458849-458851), 9 and 10 give 0 (D:L458853-458855), any
other value `FUN_0057dbb0` (D:L458856-458858); a flag at `+0x1060` bit 4 forces 2, prone (D:L458859-458861, the flag not
named here); and during the stance transitions (plays 0x11, 0x13, 0x19) the posture is the transition's from- or
to-posture by its phase against 0.5 (D:L458862-458891). The other reading of the same routine, `FUN_0058a720(actor, 1)`
-- the body's size class, which returns 0 for a crouched word with the crouch-run flag (`+0x21c` bit 2,
D:L446867-446868) -- is NOT what the death pick reads.

**The port.** The room passes `victim.sim.walker.posture` (match `room.ts`, the three player `deathClip` calls), and the
walker's `posture` is the body in use, `stand` while a crouch runs at full stick (viewer `mover.ts`, `get posture`; the
size class's reading). The walker keeps the stance word apart, `stance` (`stance_`). So a player killed crouch-running
draws from the STANDING lists in the port and from the CROUCHED lists in the original: the 1,416 real-play deaths of
section 13 whose clip names a standing list while the dead body's snapshot is crouched are this case, by the reading.
The difference matters for the facing too: a standing BODY kill ends face down 4 in 8, a crouched one 1 in 2; a standing
HEAD kill 2 in 4, a crouched one never.

**The fix, built** (2026-11-13, `agent/crouch-run-death`: the RED ab1731ff16, the fix 0bcd0931fb; simulation track,
reading, pending review): the room's death pick reads the stance word, `walker.stance`, not the body's posture, for the
three player bullet kills (match `room.ts` `bulletHit`, `volleyHit`, `directHit`) -- the crouch-runner's case; match
`test/roomCrouchRunDeath.test.ts` holds it, a crouch-runner's BODY and HEAD kills drawing from the crouched lists for
every draw, a crouch-walker's, a standing runner's and a prone player's picks unchanged. The hostage calls and the blast
paths keep theirs. Not covered by that one change, and named for its own reading: the transition plays' phase rule
(D:L458862-458891; the port's `stance_` takes the target posture from the transition's first tick; LATER 984) and the
`+0x1060` prone flag (LATER 985). Owed on the original, to measure it: a
crouch-running SEAL killed on the rig, `+0x174` and `+0x534` read at death (the post-kill read of section 12).

**Measured** (2026-11-13; O, a memory trace of the original compared value for value: the Shadow PC's F6 read, r0004,
MP2, section 12's rig, relayed; the records in the shadow output's `2026-11-13/d3-crun-980/`; ids by section 6's
numbering). n = 5 crouch-running deaths, 3 BODY and 2 HEAD. At every one the stance word `+0x174` read 1 (crouched),
`+0x21c` bit 2 (the crouch-run flag) was set, the top play was 2, and `+0x534` held a crouched-list id: 142, 141 and 141
for the BODY kills, 141 and 141 for the HEAD kills. Controls: a standing run drew 149 (`death_stand_larm01`, the
standing BODY list), a crouch-walk 140 (`death_crouch_back01`) and 143. Tolerance: an exact id match -- the id's
membership of the posture's list -- over n = 5. So the original draws a crouch-runner's death from the crouched lists,
as the reading said, and the port's fix (the room reads `walker.stance`) matches it: the list a crouch-runner draws from
is **measured** on the original, the reading confirmed (n = 5) -- not proven in PROCESS's sense until a capture-scored
spec or golden trace is committed beside the code; the transition plays' phase rule (LATER 984) and the forced prone
(LATER 985) are not measured by it. The two BODY kills that drew 141, `death_crouch_chest01`, drew a clip the port's
crouched BODY list lacked: CROUCH-BODY-LIST (2026-11-13) restores the disc's three, back01, chest01 and chest02 (section
4; viewer `test/deathListsDisc.test.ts` pins every list against `damanim.rdr`).
